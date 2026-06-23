const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, registerForContest } = require('./dbHelper');
const pool = require('../src/config/db');

// Pool closed once globally after the full suite via jest.config.js globalTeardown.

// ── helpers ──────────────────────────────────────────────────────────────────

async function createUser({ name, email, password = 'password123', role = 'student' }) {
    const res = await request(app).post('/api/auth/register').send({ name, email, password });
    const userId = res.body.user.id;
    if (role === 'admin') {
        await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        const loginRes = await request(app).post('/api/auth/login').send({ email, password });
        return { token: loginRes.body.token, userId, headers: { Authorization: `Bearer ${loginRes.body.token}` } };
    }
    return { token: res.body.token, userId, headers: { Authorization: `Bearer ${res.body.token}` } };
}

function toLocalDatetime(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Creates a contest that started 1 h ago and ends in 1 h (i.e., active now).
async function createActiveContest(adminHeaders, name = 'Code Contest') {
    const now = Date.now();
    const res = await request(app)
        .post('/api/contests')
        .set(adminHeaders)
        .send({
            name,
            start_time: toLocalDatetime(now - 60 * 60 * 1000),
            end_time: toLocalDatetime(now + 60 * 60 * 1000),
        });
    return res.body.id;
}

// Python question: add(a, b) with 3 test cases.
async function createPythonQuestion(adminHeaders, contestId) {
    const res = await request(app)
        .post('/api/questions')
        .set(adminHeaders)
        .send({
            contest_id: contestId,
            title: 'Add Two Numbers',
            description: 'Write add(a, b) that returns a + b.',
            language: 'python',
            function_signature: 'add(a, b)',
            test_cases: [
                { args: [1, 2], expected: 3 },
                { args: [5, 5], expected: 10 },
                { args: [-1, 1], expected: 0 },
            ],
            points: 10,
        });
    return res.body.id;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Python code submission (/submissions/code/contest/:id)', () => {
    let admin, student, contestId, questionId;

    beforeEach(async () => {
        await cleanDatabase();
        admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        student = await createUser({ name: 'Student', email: 'student@test.com' });
        contestId = await createActiveContest(admin.headers);
        questionId = await createPythonQuestion(admin.headers, contestId);
        // Direct DB insert so the API's "contest already started" guard doesn't block us.
        await registerForContest(student.userId, contestId);
    });

    test('correct code passes all test cases and awards full points', async () => {
        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code: 'def add(a, b):\n    return a + b\n' });

        expect(res.status).toBe(201);
        expect(res.body.is_correct).toBe(true);
        expect(res.body.points_awarded).toBe(10);
        expect(Array.isArray(res.body.test_results)).toBe(true);
        expect(res.body.test_results).toHaveLength(3);
        expect(res.body.test_results.every((r) => r.passed)).toBe(true);

        // User's global points updated
        const [[user]] = await pool.query('SELECT total_points FROM users WHERE id = ?', [student.userId]);
        expect(user.total_points).toBe(10);
    }, 15000);

    test('wrong code fails test cases, awards 0 pts, and deducts 1 penalty point', async () => {
        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code: 'def add(a, b):\n    return a - b\n' });

        expect(res.status).toBe(201);
        expect(res.body.is_correct).toBe(false);
        expect(res.body.points_awarded).toBe(0);
        expect(res.body.test_results.some((r) => !r.passed)).toBe(true);

        const [[user]] = await pool.query('SELECT total_points FROM users WHERE id = ?', [student.userId]);
        expect(user.total_points).toBe(-1);
    }, 15000);

    test('syntax error returns compile_error field and deducts 1 penalty point', async () => {
        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code: 'def add(a, b)\n    return a + b\n' }); // missing colon

        expect(res.status).toBe(201);
        expect(res.body.is_correct).toBe(false);
        expect(typeof res.body.compile_error).toBe('string');
        expect(res.body.compile_error.length).toBeGreaterThan(0);

        const [[user]] = await pool.query('SELECT total_points FROM users WHERE id = ?', [student.userId]);
        expect(user.total_points).toBe(-1);
    }, 15000);

    test('two wrong then one correct awards points minus wrong-attempt penalty', async () => {
        const wrong = 'def add(a, b):\n    return 0\n';
        const right = 'def add(a, b):\n    return a + b\n';

        await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code: wrong });
        await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code: wrong });

        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code: right });

        expect(res.body.is_correct).toBe(true);
        // 10 pts - 2 wrong attempts = 8
        expect(res.body.points_awarded).toBe(8);
    }, 45000);

    test('re-submitting after a correct answer is blocked with 400 and no attempt consumed', async () => {
        const code = 'def add(a, b):\n    return a + b\n';

        const first = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code });
        expect(first.body.is_correct).toBe(true);

        const remaining = first.body.submissions_remaining;

        const second = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, code });

        expect(second.status).toBe(400);
        expect(second.body.error).toMatch(/already solved/i);

        // Attempt count must not have changed
        const [[{ used }]] = await pool.query(
            'SELECT COUNT(*) AS used FROM submissions WHERE student_id = ? AND contest_id = ?',
            [student.userId, contestId]
        );
        expect(Number(used)).toBe(1); // only the first submission recorded
    }, 20000);

    test('unregistered student cannot submit code (403)', async () => {
        const outsider = await createUser({ name: 'Outsider', email: 'out@test.com' });

        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(outsider.headers)
            .send({ question_id: questionId, code: 'def add(a, b):\n    return a + b\n' });

        expect(res.status).toBe(403);
    }, 10000);

    test('submitting to a text question via the code route returns 400', async () => {
        const textQ = await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({
                contest_id: contestId,
                title: 'Simple Text',
                description: 'What is 1+1?',
                expected_output: '2',
            });

        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: textQ.body.id, code: 'def solution(): return 2' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/not a Python/i);
    }, 10000);

    test('unauthenticated request is rejected (401)', async () => {
        const res = await request(app)
            .post(`/api/submissions/code/contest/${contestId}`)
            .send({ question_id: questionId, code: 'def add(a, b): return a + b' });

        expect(res.status).toBe(401);
    });
});
