const pool = require('../config/db');
const { getContestStatus } = require('../middleware/contestTime');

// Admin only: add a question to a contest.
async function createQuestion(req, res, next) {
    const { contest_id, title, description, input_data, expected_output, points } = req.body;

    if (!contest_id || !title || !description || !expected_output) {
        return res.status(400).json({
            error: 'contest_id, title, description, and expected_output are required',
        });
    }

    try {
        const [contestRows] = await pool.query('SELECT id FROM contests WHERE id = ?', [contest_id]);
        if (contestRows.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const [result] = await pool.query(
            `INSERT INTO questions (contest_id, title, description, input_data, expected_output, points)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [contest_id, title, description, input_data || null, expected_output, points || 10]
        );

        res.status(201).json({ id: result.insertId, contest_id, title });
    } catch (err) {
        next(err);
    }
}

// Student-facing: list questions for a contest. Gated by requireActiveContest
// middleware at the route level, so this never runs before start_time.
// IMPORTANT: never return expected_output here - that's the answer key.
async function listQuestionsForStudent(req, res, next) {
    try {
        const [rows] = await pool.query(
            'SELECT id, contest_id, title, description, input_data, points FROM questions WHERE contest_id = ?',
            [req.params.contestId]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

// Admin-facing: list questions WITH expected_output, for review/editing.
async function listQuestionsForAdmin(req, res, next) {
    try {
        const [rows] = await pool.query('SELECT * FROM questions WHERE contest_id = ?', [
            req.params.contestId,
        ]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function updateQuestion(req, res, next) {
    const { title, description, input_data, expected_output, points } = req.body;
    const { id } = req.params;

    try {
        const [existing] = await pool.query('SELECT * FROM questions WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const current = existing[0];

        await pool.query(
            `UPDATE questions
             SET title = ?, description = ?, input_data = ?, expected_output = ?, points = ?
             WHERE id = ?`,
            [
                title || current.title,
                description || current.description,
                input_data ?? current.input_data,
                expected_output || current.expected_output,
                points || current.points,
                id,
            ]
        );

        res.json({ message: 'Question updated' });
    } catch (err) {
        next(err);
    }
}

async function deleteQuestion(req, res, next) {
    try {
        const [result] = await pool.query('DELETE FROM questions WHERE id = ?', [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        res.json({ message: 'Question deleted' });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createQuestion,
    listQuestionsForStudent,
    listQuestionsForAdmin,
    updateQuestion,
    deleteQuestion,
};
