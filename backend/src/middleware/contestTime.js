const pool = require('../config/db');

// Determines contest status by comparing current time to start/end.
// No scheduler/cron - status is computed fresh on every call, which
// means it's always correct even if the server restarts or a contest
// is edited mid-flight.
//
// Returns one of: 'upcoming' | 'active' | 'ended'
function getContestStatus(startTime, endTime, now = new Date()) {
    if (now < new Date(startTime)) return 'upcoming';
    if (now > new Date(endTime)) return 'ended';
    return 'active';
}

// Middleware: blocks access to a contest's problems/submissions unless
// it is currently active. Expects :contestId in route params.
// Attaches the contest row to req.contest so downstream handlers
// don't need to re-fetch it.
async function requireActiveContest(req, res, next) {
    const { contestId } = req.params;

    try {
        const [rows] = await pool.query(
            'SELECT * FROM contests WHERE id = ?',
            [contestId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const contest = rows[0];
        const status = getContestStatus(contest.start_time, contest.end_time);

        if (status === 'upcoming') {
            return res.status(403).json({
                error: 'Contest has not started yet',
                starts_at: contest.start_time,
            });
        }

        if (status === 'ended') {
            return res.status(403).json({
                error: 'Contest has ended, submissions are closed',
                ended_at: contest.end_time,
            });
        }

        req.contest = contest;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { getContestStatus, requireActiveContest };
