const pool = require('../config/db');

// Pure function: the actual scoring rule, isolated from DB/HTTP so it can
// be unit tested directly with plain strings - no mocking needed.
// Rule: trim whitespace on both sides, then case-sensitive exact match.
function isAnswerCorrect(submittedAnswer, expectedOutput) {
    return submittedAnswer.trim() === expectedOutput.trim();
}

// Student-facing: submit an answer for a question.
// Route is gated by requireActiveContest middleware - this handler
// only runs while the contest is active, so no extra time-check needed
// here. Every attempt is INSERTed (never updated), preserving full
// history; "only latest counts" is enforced at read-time (leaderboard,
// stats), not at write-time.
async function submitAnswer(req, res, next) {
    const { question_id, submitted_answer } = req.body;
    const contest = req.contest; // attached by requireActiveContest

    if (!question_id || submitted_answer === undefined || submitted_answer === null) {
        return res.status(400).json({ error: 'question_id and submitted_answer are required' });
    }

    try {
        const [questionRows] = await pool.query(
            'SELECT * FROM questions WHERE id = ? AND contest_id = ?',
            [question_id, contest.id]
        );

        if (questionRows.length === 0) {
            return res.status(404).json({ error: 'Question not found in this contest' });
        }

        const question = questionRows[0];
        const correct = isAnswerCorrect(submitted_answer, question.expected_output);
        const pointsAwarded = correct ? question.points : 0;

        const [result] = await pool.query(
            `INSERT INTO submissions
             (student_id, question_id, contest_id, submitted_answer, is_correct, points_awarded)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, question_id, contest.id, submitted_answer, correct, pointsAwarded]
        );

        res.status(201).json({
            id: result.insertId,
            is_correct: correct,
            points_awarded: pointsAwarded,
        });
    } catch (err) {
        next(err);
    }
}

// Student-facing: view own submission history (all attempts, not just latest).
async function getMySubmissions(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT s.*, q.title AS question_title
             FROM submissions s
             JOIN questions q ON s.question_id = q.id
             WHERE s.student_id = ? AND s.contest_id = ?
             ORDER BY s.created_at DESC`,
            [req.user.id, req.params.contestId]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

// Admin-facing: view all submissions for a contest (for grading/audit).
async function getContestSubmissions(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT s.*, u.name AS student_name, q.title AS question_title
             FROM submissions s
             JOIN users u ON s.student_id = u.id
             JOIN questions q ON s.question_id = q.id
             WHERE s.contest_id = ?
             ORDER BY s.created_at DESC`,
            [req.params.contestId]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

module.exports = { isAnswerCorrect, submitAnswer, getMySubmissions, getContestSubmissions };
