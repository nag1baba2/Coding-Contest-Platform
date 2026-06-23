const pool = require('../config/db');

async function registerForContest(req, res, next) {
    const { contestId } = req.params;
    const userId = req.user.id;

    try {
        const [contestRows] = await pool.query('SELECT * FROM contests WHERE id = ?', [contestId]);
        if (contestRows.length === 0) return res.status(404).json({ error: 'Contest not found' });

        if (new Date() >= new Date(contestRows[0].start_time)) {
            return res.status(403).json({ error: 'Registration closed — contest has already started' });
        }

        await pool.query(
            'INSERT IGNORE INTO contest_registrations (user_id, contest_id) VALUES (?, ?)',
            [userId, contestId]
        );
        res.json({ registered: true });
    } catch (err) {
        next(err);
    }
}

async function unregisterFromContest(req, res, next) {
    const { contestId } = req.params;
    const userId = req.user.id;

    try {
        const [contestRows] = await pool.query('SELECT * FROM contests WHERE id = ?', [contestId]);
        if (contestRows.length === 0) return res.status(404).json({ error: 'Contest not found' });

        if (new Date() >= new Date(contestRows[0].start_time)) {
            return res.status(403).json({ error: 'Cannot unregister after contest has started' });
        }

        await pool.query(
            'DELETE FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [userId, contestId]
        );
        res.json({ registered: false });
    } catch (err) {
        next(err);
    }
}

// Returns all contest IDs the current user is registered for (used by
// contests list page to show registration status on each card in one call).
async function getMyRegistrations(req, res, next) {
    try {
        const [rows] = await pool.query(
            'SELECT contest_id FROM contest_registrations WHERE user_id = ?',
            [req.user.id]
        );
        res.json(rows.map((r) => r.contest_id));
    } catch (err) {
        next(err);
    }
}

async function getRegistrationStatus(req, res, next) {
    const { contestId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT id FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [req.user.id, contestId]
        );
        res.json({ registered: rows.length > 0 });
    } catch (err) {
        next(err);
    }
}

module.exports = { registerForContest, unregisterFromContest, getMyRegistrations, getRegistrationStatus };
