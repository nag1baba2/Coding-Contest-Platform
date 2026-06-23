const pool = require('../config/db');

function isAnswerCorrect(submittedAnswer, expectedOutput) {
    return submittedAnswer.trim() === expectedOutput.trim();
}

function normalizeOutput(val) {
    try {
        return JSON.stringify(val);
    } catch {
        return String(val);
    }
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

async function submitCode(req, res, next) {
    const { question_id, code } = req.body;
    const contest = req.contest;

    if (!question_id || !code) {
        return res.status(400).json({ error: 'question_id and code are required' });
    }

    try {
        // Check registration
        const [regRows] = await pool.query(
            'SELECT id FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [req.user.id, contest.id]
        );
        if (regRows.length === 0) {
            return res.status(403).json({ error: 'You are not registered for this contest' });
        }

        // Check submission limit (shared pool with text answers)
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
                error: 'Run & submission limit reached for this contest',
                limit,
                used: Number(used),
            });
        }

        // Block re-submission if already solved — no attempt consumed, no penalty
        const [[{ alreadyCorrect }]] = await pool.query(
            'SELECT COUNT(*) AS alreadyCorrect FROM submissions WHERE student_id = ? AND question_id = ? AND is_correct = 1',
            [req.user.id, question_id]
        );
        if (Number(alreadyCorrect) > 0) {
            return res.status(400).json({ error: 'You have already solved this question correctly.' });
        }

        // Get question (must be python type)
        const [questionRows] = await pool.query(
            'SELECT * FROM questions WHERE id = ? AND contest_id = ?',
            [question_id, contest.id]
        );
        if (questionRows.length === 0) {
            return res.status(404).json({ error: 'Question not found in this contest' });
        }
        const question = questionRows[0];
        if (question.language !== 'python') {
            return res.status(400).json({ error: 'This question is not a Python coding question' });
        }

        const testCases = question.test_cases
            ? (typeof question.test_cases === 'string' ? JSON.parse(question.test_cases) : question.test_cases)
            : [];
        if (testCases.length === 0) {
            return res.status(400).json({ error: 'No test cases configured for this question' });
        }

        // Extract function name from signature (e.g. "twoSum(nums, target)" → "twoSum")
        const functionName = question.function_signature
            ? question.function_signature.split('(')[0].trim()
            : 'solution';

        // Execute via local Python runner — all test cases in one call
        const { runPython } = require('../services/piston');
        const argsList = testCases.map((tc) => tc.args);

        let pistonResult;
        try {
            pistonResult = await runPython(code, argsList, functionName);
        } catch (err) {
            console.error('[Piston] error:', err.message);
            return res.status(502).json({ error: `Code execution service unavailable: ${err.message}` });
        }

        const stderr = pistonResult.run ? pistonResult.run.stderr : (pistonResult.stderr || '');
        const stdout = pistonResult.run ? pistonResult.run.stdout : (pistonResult.stdout || '');

        // Hard compile / syntax error: stderr present, stdout empty
        if (stderr && !stdout.trim()) {
            // Still counts as a submission attempt (penalty -1)
            await pool.query(
                `INSERT INTO submissions (student_id, question_id, contest_id, submitted_answer, is_correct, points_awarded, test_results)
                 VALUES (?, ?, ?, ?, 0, 0, ?)`,
                [req.user.id, question_id, contest.id, code, JSON.stringify({ compile_error: stderr })]
            );
            await pool.query('UPDATE users SET total_points = total_points - 1 WHERE id = ?', [req.user.id]);

            const remaining = limit - Number(used) - 1;
            return res.status(201).json({
                is_correct: false,
                points_awarded: 0,
                compile_error: stderr,
                test_results: null,
                submissions_remaining: Math.max(0, remaining),
            });
        }

        // Parse JSON output from wrapper
        let results;
        try {
            results = JSON.parse(stdout);
        } catch {
            const remaining = limit - Number(used) - 1;
            await pool.query(
                `INSERT INTO submissions (student_id, question_id, contest_id, submitted_answer, is_correct, points_awarded, test_results)
                 VALUES (?, ?, ?, ?, 0, 0, ?)`,
                [req.user.id, question_id, contest.id, code, JSON.stringify({ compile_error: stderr || 'Could not parse output' })]
            );
            await pool.query('UPDATE users SET total_points = total_points - 1 WHERE id = ?', [req.user.id]);
            return res.status(201).json({
                is_correct: false,
                points_awarded: 0,
                compile_error: stderr || 'Could not parse output. Make sure your solution() function returns a value.',
                test_results: null,
                submissions_remaining: Math.max(0, remaining),
            });
        }

        // Compare each result against expected output
        const testResults = testCases.map((tc, i) => {
            const r = results[i] || { result: null, error: 'No output for this case' };
            if (r.error) {
                return { passed: false, args: tc.args, expected: tc.expected, got: null, error: r.error };
            }
            const passed = normalizeOutput(r.result) === normalizeOutput(tc.expected);
            return { passed, args: tc.args, expected: tc.expected, got: r.result, error: null };
        });

        const allPassed = testResults.every((r) => r.passed);

        let pointsAwarded = 0;
        if (allPassed) {
            const [[{ wrongCount }]] = await pool.query(
                'SELECT COUNT(*) AS wrongCount FROM submissions WHERE student_id = ? AND question_id = ? AND is_correct = 0',
                [req.user.id, question_id]
            );
            pointsAwarded = Math.max(0, question.points - Number(wrongCount));
            await pool.query('UPDATE users SET total_points = total_points + ? WHERE id = ?', [pointsAwarded, req.user.id]);
        } else {
            await pool.query('UPDATE users SET total_points = total_points - 1 WHERE id = ?', [req.user.id]);
        }

        // Save submission
        await pool.query(
            `INSERT INTO submissions (student_id, question_id, contest_id, submitted_answer, is_correct, points_awarded, test_results)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, question_id, contest.id, code, allPassed, pointsAwarded, JSON.stringify(testResults)]
        );

        const remaining = limit - Number(used) - 1;
        return res.status(201).json({
            is_correct: allPassed,
            points_awarded: pointsAwarded,
            test_results: testResults,
            submissions_remaining: Math.max(0, remaining),
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

module.exports = { isAnswerCorrect, submitAnswer, submitCode, getMySubmissions, getContestSubmissions, getSubmissionLimit };
