const pool = require('../config/db');

function isAnswerCorrect(submittedAnswer, expectedOutput) {
    return submittedAnswer.trim() === expectedOutput.trim();
}

async function submitAnswer(req, res, next) {
    const { question_id, submitted_answer } = req.body;
    const contest = req.contest;

    if (!question_id || submitted_answer === undefined || submitted_answer === null) {
        return res.status(400).json({ error: 'question_id and submitted_answer are required' });
    }

    try {
        // Check user is registered for this contest
        const [regRows] = await pool.query(
            'SELECT id FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [req.user.id, contest.id]
        );
        if (regRows.length === 0) {
            return res.status(403).json({ error: 'You are not registered for this contest' });
        }

        // Enforce submission limit: max(1, floor(50 / registration_count))
        const [[{ regCount }]] = await pool.query(
            'SELECT COUNT(*) AS regCount FROM contest_registrations WHERE contest_id = ?',
            [contest.id]
        );
        const limit = Math.max(1, Math.floor(50 / Number(regCount)));

        const [[{ used }]] = await pool.query(
            'SELECT COUNT(*) AS used FROM submissions WHERE student_id = ? AND contest_id = ?',
            [req.user.id, contest.id]
        );
        if (Number(used) >= limit) {
            return res.status(429).json({
                error: 'Submission limit reached for this contest',
                limit,
                used: Number(used),
            });
        }

        const [questionRows] = await pool.query(
            'SELECT * FROM questions WHERE id = ? AND contest_id = ?',
            [question_id, contest.id]
        );
        if (questionRows.length === 0) {
            return res.status(404).json({ error: 'Question not found in this contest' });
        }

        const question = questionRows[0];
        const correct = isAnswerCorrect(submitted_answer, question.expected_output);

        let pointsAwarded = 0;
        if (correct) {
            // Count wrong submissions for this specific question by this user
            const [[{ wrongCount }]] = await pool.query(
                'SELECT COUNT(*) AS wrongCount FROM submissions WHERE student_id = ? AND question_id = ? AND is_correct = 0',
                [req.user.id, question_id]
            );
            pointsAwarded = Math.max(0, question.points - Number(wrongCount));
        }

        const [result] = await pool.query(
            `INSERT INTO submissions
             (student_id, question_id, contest_id, submitted_answer, is_correct, points_awarded)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, question_id, contest.id, submitted_answer, correct, pointsAwarded]
        );

        // Update user's global total_points:
        // -1 for wrong submission, +pointsAwarded for correct
        if (correct) {
            await pool.query('UPDATE users SET total_points = total_points + ? WHERE id = ?', [pointsAwarded, req.user.id]);
        } else {
            await pool.query('UPDATE users SET total_points = total_points - 1 WHERE id = ?', [req.user.id]);
        }

        const remaining = limit - Number(used) - 1;

        res.status(201).json({
            id: result.insertId,
            is_correct: correct,
            points_awarded: pointsAwarded,
            submissions_remaining: remaining,
        });
    } catch (err) {
        next(err);
    }
}

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

// Returns the submission limit and how many the current user has used.
async function getSubmissionLimit(req, res, next) {
    const { contestId } = req.params;
    try {
        const [[{ regCount }]] = await pool.query(
            'SELECT COUNT(*) AS regCount FROM contest_registrations WHERE contest_id = ?',
            [contestId]
        );
        const limit = Math.max(1, Math.floor(50 / Math.max(1, Number(regCount))));

        const [[{ used }]] = await pool.query(
            'SELECT COUNT(*) AS used FROM submissions WHERE student_id = ? AND contest_id = ?',
            [req.user.id, contestId]
        );

        res.json({ limit, used: Number(used), remaining: limit - Number(used) });
    } catch (err) {
        next(err);
    }
}

module.exports = { isAnswerCorrect, submitAnswer, getMySubmissions, getContestSubmissions, getSubmissionLimit };
