const pool = require('../config/db');
const { getContestStatus } = require('../middleware/contestTime');

// MySQL's DATETIME column rejects full ISO 8601 strings like
// "2026-06-21T07:10:00.000Z" (ER_TRUNCATED_WRONG_VALUE) - it wants
// the plain "YYYY-MM-DD HH:MM:SS" format with no 'T', no milliseconds,
// no 'Z' suffix. The frontend correctly sends proper UTC ISO strings
// (see admin.html's localInputValueToIso), so normalization happens
// here at the boundary instead of trusting every caller to format
// dates exactly right. Using the UTC getters (not the local ones) is
// what keeps this consistent with the timezone: 'Z' pool setting in
// db.js - mixing UTC-labeled input with local-time formatting here
// would silently reintroduce the exact offset bug already fixed once.
function toMysqlDatetime(dateInput) {
    const d = new Date(dateInput);
    const pad = (n) => String(n).padStart(2, '0');
    return (
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
        `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    );
}

// Admin only: create a contest
async function createContest(req, res, next) {
    const { name, description, start_time, end_time } = req.body;

    if (!name || !start_time || !end_time) {
        return res.status(400).json({ error: 'name, start_time, and end_time are required' });
    }

    if (new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO contests (name, description, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?)',
            [name, description || null, toMysqlDatetime(start_time), toMysqlDatetime(end_time), req.user.id]
        );

        res.status(201).json({ id: result.insertId, name, description, start_time, end_time });
    } catch (err) {
        next(err);
    }

}

// Everyone (auth required): list all contests with computed status.
// Students use this to see upcoming/active contests.
async function listContests(req, res, next) {
    try {
        const [rows] = await pool.query('SELECT * FROM contests ORDER BY start_time DESC');

        const withStatus = rows.map((c) => ({
            ...c,
            status: getContestStatus(c.start_time, c.end_time),
        }));

        res.json(withStatus);
    } catch (err) {
        next(err);
    }
}

// Everyone (auth required): get a single contest's details.
// Does NOT include questions - those come from a separate endpoint
// gated by requireActiveContest, so problems can't leak before start time.
async function getContest(req, res, next) {
    try {
        const [rows] = await pool.query('SELECT * FROM contests WHERE id = ?', [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const contest = rows[0];
        res.json({ ...contest, status: getContestStatus(contest.start_time, contest.end_time) });
    } catch (err) {
        next(err);
    }
}

// Admin only: update contest details.
async function updateContest(req, res, next) {
    const { name, description, start_time, end_time } = req.body;
    const { id } = req.params;

    try {
        const [existing] = await pool.query('SELECT * FROM contests WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const current = existing[0];
        const newStart = start_time || current.start_time;
        const newEnd = end_time || current.end_time;

        if (new Date(newEnd) <= new Date(newStart)) {
            return res.status(400).json({ error: 'end_time must be after start_time' });
        }

        await pool.query(
            'UPDATE contests SET name = ?, description = ?, start_time = ?, end_time = ? WHERE id = ?',
            [
                name || current.name,
                description ?? current.description,
                toMysqlDatetime(newStart),
                toMysqlDatetime(newEnd),
                id,
            ]
        );

        res.json({ message: 'Contest updated' });
    } catch (err) {
        next(err);
    }
}

// Admin only: delete a contest.
// Submissions/questions cascade-delete via FK constraints (ON DELETE CASCADE).
// This is a deliberate choice for a small private-group app; a production
// system might soft-delete instead to preserve history. Worth testing
// explicitly: does deleting a contest with active submissions behave
// as expected, or should it be blocked?
async function deleteContest(req, res, next) {
    try {
        const [result] = await pool.query('DELETE FROM contests WHERE id = ?', [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        res.json({ message: 'Contest deleted' });
    } catch (err) {
        next(err);
    }
}

module.exports = { createContest, listContests, getContest, updateContest, deleteContest };
