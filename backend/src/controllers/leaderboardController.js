const pool = require('../config/db');
const { getContestStatus } = require('../middleware/contestTime');

// Applied once per registration when the contest ends. The flag
// prevents double-applying if the leaderboard is fetched multiple times.
async function applyNoSubmissionPenalties(contestId) {
    const [registrations] = await pool.query(
        `SELECT cr.user_id, cr.id AS reg_id
         FROM contest_registrations cr
         WHERE cr.contest_id = ?
           AND cr.no_submission_penalty_applied = 0
           AND NOT EXISTS (
               SELECT 1 FROM submissions s
               WHERE s.student_id = cr.user_id AND s.contest_id = ?
           )`,
        [contestId, contestId]
    );

    for (const reg of registrations) {
        await pool.query('UPDATE users SET total_points = total_points - 10 WHERE id = ?', [reg.user_id]);
        await pool.query(
            'UPDATE contest_registrations SET no_submission_penalty_applied = 1 WHERE id = ?',
            [reg.reg_id]
        );
    }
}

async function getLeaderboard(req, res, next) {
    const { contestId } = req.params;

    try {
        const [contestRows] = await pool.query('SELECT * FROM contests WHERE id = ?', [contestId]);
        if (contestRows.length === 0) return res.status(404).json({ error: 'Contest not found' });

        const status = getContestStatus(contestRows[0].start_time, contestRows[0].end_time);
        if (status === 'ended') {
            await applyNoSubmissionPenalties(contestId);
        }

        const [rows] = await pool.query(
            `
            SELECT
                u.id AS student_id,
                u.name AS student_name,
                COALESCE(SUM(latest.points_awarded), 0) AS total_score,
                MAX(latest.created_at) AS last_submission_time
            FROM users u
            LEFT JOIN (
                SELECT s.*
                FROM submissions s
                INNER JOIN (
                    SELECT student_id, question_id, MAX(id) AS latest_id
                    FROM submissions
                    WHERE contest_id = ?
                    GROUP BY student_id, question_id
                ) m ON s.student_id = m.student_id
                    AND s.question_id = m.question_id
                    AND s.id = m.latest_id
                WHERE s.contest_id = ?
            ) latest ON latest.student_id = u.id
            WHERE u.id IN (
                SELECT DISTINCT student_id FROM submissions WHERE contest_id = ?
            )
            GROUP BY u.id, u.name
            ORDER BY total_score DESC, last_submission_time ASC
            `,
            [contestId, contestId, contestId]
        );

        const ranked = rows.map((row, index) => ({
            rank: index + 1,
            ...row,
            total_score: Number(row.total_score),
        }));
        res.json(ranked);
    } catch (err) {
        next(err);
    }
}

async function getContestStats(req, res, next) {
    const { contestId } = req.params;

    try {
        const [[participantCount]] = await pool.query(
            'SELECT COUNT(DISTINCT student_id) AS count FROM submissions WHERE contest_id = ?',
            [contestId]
        );

        const [[submissionCount]] = await pool.query(
            'SELECT COUNT(*) AS count FROM submissions WHERE contest_id = ?',
            [contestId]
        );

        const [solveCounts] = await pool.query(
            `SELECT q.id, q.title, COUNT(DISTINCT s.student_id) AS solve_count
             FROM questions q
             LEFT JOIN submissions s
                ON s.question_id = q.id AND s.is_correct = TRUE
             WHERE q.contest_id = ?
             GROUP BY q.id, q.title
             ORDER BY solve_count DESC`,
            [contestId]
        );

        res.json({
            participants: participantCount.count,
            total_submissions: submissionCount.count,
            most_solved: solveCounts[0] || null,
            least_solved: solveCounts[solveCounts.length - 1] || null,
            all_questions: solveCounts,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getLeaderboard, getContestStats };
