const pool = require('../config/db');
const { getContestStatus } = require('../middleware/contestTime');

// Admin only: add a question to a contest.
async function createQuestion(req, res, next) {
    const { contest_id, title, description, input_data, expected_output, points, language, function_signature, test_cases } = req.body;

    const lang = language || 'text';
    const isText = lang === 'text';

    if (!contest_id || !title || !description) {
        return res.status(400).json({ error: 'contest_id, title, and description are required' });
    }
    if (isText && !expected_output) {
        return res.status(400).json({ error: 'expected_output is required for text questions' });
    }
    if (!isText && (!test_cases || !Array.isArray(test_cases) || test_cases.length === 0)) {
        return res.status(400).json({ error: 'test_cases array is required for Python questions' });
    }

    try {
        const [contestRows] = await pool.query('SELECT id FROM contests WHERE id = ?', [contest_id]);
        if (contestRows.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const [result] = await pool.query(
            `INSERT INTO questions
             (contest_id, title, description, input_data, expected_output, points, language, function_signature, test_cases)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                contest_id,
                title,
                description,
                input_data || null,
                isText ? expected_output : null,
                points || 10,
                lang,
                function_signature || null,
                !isText ? JSON.stringify(test_cases) : null,
            ]
        );

        res.status(201).json({ id: result.insertId, contest_id, title });
    } catch (err) {
        next(err);
    }
}

// Student-facing: list questions. Never return expected_output or test_cases.
async function listQuestionsForStudent(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT id, contest_id, title, description, input_data, points, language, function_signature
             FROM questions WHERE contest_id = ?`,
            [req.params.contestId]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

// Admin-facing: list questions WITH expected_output and test_cases.
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
    const { title, description, input_data, expected_output, points, language, function_signature, test_cases } = req.body;
    const { id } = req.params;

    try {
        const [existing] = await pool.query('SELECT * FROM questions WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const current = existing[0];
        const lang = language || current.language;
        const isText = lang === 'text';

        await pool.query(
            `UPDATE questions
             SET title = ?, description = ?, input_data = ?, expected_output = ?, points = ?,
                 language = ?, function_signature = ?, test_cases = ?
             WHERE id = ?`,
            [
                title || current.title,
                description || current.description,
                input_data !== undefined ? input_data : current.input_data,
                isText ? (expected_output || current.expected_output) : null,
                points || current.points,
                lang,
                function_signature !== undefined ? function_signature : current.function_signature,
                !isText
                    ? (test_cases ? JSON.stringify(test_cases) : current.test_cases)
                    : null,
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
