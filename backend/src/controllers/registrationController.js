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

// Returns all contest IDs the current user is registered for.
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
            'SELECT id, final_submitted, final_submitted_at FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [req.user.id, contestId]
        );
        res.json({
            registered: rows.length > 0,
            final_submitted: rows.length > 0 ? !!rows[0].final_submitted : false,
            final_submitted_at: rows.length > 0 ? rows[0].final_submitted_at : null,
        });
    } catch (err) {
        next(err);
    }
}

// Mark contest as final-submitted for this student.
// Applies -10 penalty if they made zero submissions during the contest.
async function finalSubmit(req, res, next) {
    const { contestId } = req.params;
    const userId = req.user.id;

    try {
        const [[reg]] = await pool.query(
            'SELECT * FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [userId, contestId]
        );
        if (!reg) return res.status(403).json({ error: 'You are not registered for this contest' });
        if (reg.final_submitted) return res.status(400).json({ error: 'You have already final submitted this contest' });

        const [[{ subCount }]] = await pool.query(
            'SELECT COUNT(*) AS subCount FROM submissions WHERE student_id = ? AND contest_id = ?',
            [userId, contestId]
        );
        const hasSubmissions = Number(subCount) > 0;

        let penaltyApplied = false;
        if (!hasSubmissions && !reg.no_submission_penalty_applied) {
            await pool.query('UPDATE users SET total_points = total_points - 10 WHERE id = ?', [userId]);
            await pool.query(
                'UPDATE contest_registrations SET no_submission_penalty_applied = 1 WHERE user_id = ? AND contest_id = ?',
                [userId, contestId]
            );
            penaltyApplied = true;
        }

        await pool.query(
            'UPDATE contest_registrations SET final_submitted = 1, final_submitted_at = NOW() WHERE user_id = ? AND contest_id = ?',
            [userId, contestId]
        );

        res.json({ success: true, penalty_applied: penaltyApplied });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    registerForContest,
    unregisterFromContest,
    getMyRegistrations,
    getRegistrationStatus,
    finalSubmit,
};
