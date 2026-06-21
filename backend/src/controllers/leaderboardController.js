const pool = require('../config/db');

// Leaderboard query, explained:
//
// 1. Find the LATEST submission per (student, question). "Latest" is
//    determined first by created_at, with submission id as a tiebreaker
//    for same-second submissions. TIMESTAMP columns only have
//    second-level precision by default, so two submissions made close
//    together (e.g. back-to-back in a fast test, or a student
//    double-clicking submit) can share the exact same created_at value.
//    Without the id tiebreaker, the join would match BOTH rows as
//    "latest" and double-count points - id is monotonically increasing
//    on every insert, so the highest id for a given (student, question)
//    pair is always the true most-recent submission, with no precision
//    ambiguity.
// 2. Sum points_awarded per student = their contest score.
// 3. Rank by score DESC, then by earliest "last submission" time ASC
//    (whoever locked in their final score first wins ties) - this
//    matches the spec: tie-break by submission time.
async function getLeaderboard(req, res, next) {
    const { contestId } = req.params;

    try {
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

        // mysql2 can return SUM() results as strings rather than numbers
        // depending on the underlying column type - coerce explicitly so
        // API consumers (frontend, tests) always get a real number, not
        // "10" where they expect 10.
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

// Contest statistics: participants, submission count, most/least solved question.
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

        // "Solved" = at least one correct submission for that question,
        // counted per distinct student (so resubmitting doesn't inflate it).
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
