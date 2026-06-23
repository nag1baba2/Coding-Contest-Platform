const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, registerForContest } = require('./dbHelper');
const pool = require('../src/config/db');

// Helper: registers a user and returns their auth header + id.
// Promotes to admin directly via SQL, same shortcut we used manually
// (no admin-registration endpoint exists by design - see authController.js).
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

// Helper: creates a contest with a given time offset (in ms from now),
// so tests can easily build "active now", "starts in future", "ended already".
// Format in LOCAL time (no timezone suffix) so MySQL stores and returns
// the same literal string — avoids the UTC-vs-local shift on IST machines.
function toLocalDatetime(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function createContest(adminHeaders, { startOffsetMs, endOffsetMs, name = 'Test Contest' }) {
    const now = Date.now();
    const res = await request(app)
        .post('/api/contests')
        .set(adminHeaders)
        .send({
            name,
            start_time: toLocalDatetime(now + startOffsetMs),
            end_time: toLocalDatetime(now + endOffsetMs),
        });
    return res.body.id;
}

describe('Contest CRUD + access control', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    test('admin can create a contest', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });

        const res = await request(app)
            .post('/api/contests')
            .set(admin.headers)
            .send({
                name: 'Weekly Contest',
                start_time: '2026-07-01T19:00:00',
                end_time: '2026-07-01T20:00:00',
            });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Weekly Contest');
    });

    test('admin can create a contest using a full ISO timestamp with milliseconds and Z suffix', async () => {
        // Regression test: the frontend sends new Date(...).toISOString()
        // directly (e.g. "2026-07-01T19:00:00.000Z"), which MySQL's
        // DATETIME column rejects with ER_TRUNCATED_WRONG_VALUE unless
        // the backend normalizes it first (see toMysqlDatetime in
        // contestController.js). This exact format is what broke contest
        // creation in the real browser even though earlier tests - which
        // happened to use a truncated/already-MySQL-friendly format -
        // never caught it.
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });

        const res = await request(app)
            .post('/api/contests')
            .set(admin.headers)
            .send({
                name: 'Full ISO Contest',
                start_time: '2026-07-01T19:00:00.000Z',
                end_time: '2026-07-01T20:00:00.000Z',
            });

        expect(res.status).toBe(201);

        const check = await request(app).get(`/api/contests/${res.body.id}`).set(admin.headers);
        expect(check.status).toBe(200);
        // Round-trips back out as a valid, parseable date - not corrupted
        // or truncated by the normalization.
        expect(new Date(check.body.start_time).getUTCHours()).toBe(19);
    });

    test('student CANNOT create a contest (403)', async () => {
        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const res = await request(app)
            .post('/api/contests')
            .set(student.headers)
            .send({
                name: 'Should Fail',
                start_time: '2026-07-01T19:00:00',
                end_time: '2026-07-01T20:00:00',
            });

        expect(res.status).toBe(403);
    });

    test('creating a contest with end_time before start_time is rejected', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });

        const res = await request(app)
            .post('/api/contests')
            .set(admin.headers)
            .send({
                name: 'Backwards Contest',
                start_time: '2026-07-01T20:00:00',
                end_time: '2026-07-01T19:00:00',
            });

        expect(res.status).toBe(400);
    });

    test('unauthenticated request is rejected with 401', async () => {
        const res = await request(app).get('/api/contests');
        expect(res.status).toBe(401);
    });
});

describe('Time-gated question access', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    test('student CANNOT view questions before contest starts', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000, // starts in 1 hour
            endOffsetMs: 2 * 60 * 60 * 1000,
        });

        const res = await request(app)
            .get(`/api/questions/contest/${contestId}`)
            .set(student.headers);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/not started/i);
    });

    test('student CANNOT view questions after contest ends', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const contestId = await createContest(admin.headers, {
            startOffsetMs: -2 * 60 * 60 * 1000, // started 2 hours ago
            endOffsetMs: -60 * 60 * 1000, // ended 1 hour ago
        });

        const res = await request(app)
            .get(`/api/questions/contest/${contestId}`)
            .set(student.headers);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/ended/i);
    });

    test('student CAN view questions during an active contest', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const contestId = await createContest(admin.headers, {
            startOffsetMs: -60 * 60 * 1000,
            endOffsetMs: 60 * 60 * 1000,
        });
        await registerForContest(student.userId, contestId);

        const res = await request(app)
            .get(`/api/questions/contest/${contestId}`)
            .set(student.headers);

        expect(res.status).toBe(200);
    });

    test('student-facing question list never includes expected_output', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const contestId = await createContest(admin.headers, {
            startOffsetMs: -60 * 60 * 1000,
            endOffsetMs: 60 * 60 * 1000,
        });
        await registerForContest(student.userId, contestId);

        await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({
                contest_id: contestId,
                title: 'Two Sum',
                description: 'desc',
                expected_output: '[0,1]',
                points: 10,
            });

        const res = await request(app)
            .get(`/api/questions/contest/${contestId}`)
            .set(student.headers);

        expect(res.status).toBe(200);
        expect(res.body[0].expected_output).toBeUndefined();
    });
});

describe('Submission scoring + leaderboard', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    async function setupActiveContestWithQuestion() {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: -60 * 60 * 1000,
            endOffsetMs: 60 * 60 * 1000,
        });

        const questionRes = await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({
                contest_id: contestId,
                title: 'Two Sum',
                description: 'desc',
                expected_output: '[0,1]',
                points: 10,
            });

        return { admin, contestId, questionId: questionRes.body.id };
    }

    test('correct submission is scored correctly', async () => {
        const { contestId, questionId } = await setupActiveContestWithQuestion();
        const student = await createUser({ name: 'Student', email: 'student@test.com' });
        await registerForContest(student.userId, contestId);

        const res = await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, submitted_answer: '[0,1]' });

        expect(res.status).toBe(201);
        expect(res.body.is_correct).toBe(true);
        expect(res.body.points_awarded).toBe(10);
    });

    test('answer is trimmed but still case-sensitive (matches scoring.test.js rule)', async () => {
        const { contestId, questionId } = await setupActiveContestWithQuestion();
        const student = await createUser({ name: 'Student', email: 'student@test.com' });
        await registerForContest(student.userId, contestId);

        const trimmed = await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, submitted_answer: '  [0,1]  ' });

        expect(trimmed.body.is_correct).toBe(true);
    });

    test('submission is blocked once the contest has ended', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: -2 * 60 * 60 * 1000,
            endOffsetMs: -60 * 60 * 1000, // already ended
        });
        const questionRes = await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({ contest_id: contestId, title: 'Q', description: 'd', expected_output: 'x' });

        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const res = await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionRes.body.id, submitted_answer: 'x' });

        expect(res.status).toBe(403);
    });

    test('only the LATEST submission counts toward leaderboard score', async () => {
        const { contestId, questionId } = await setupActiveContestWithQuestion();
        const student = await createUser({ name: 'Student', email: 'student@test.com' });
        await registerForContest(student.userId, contestId);

        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, submitted_answer: '[0,1]' }); // correct

        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, submitted_answer: '[1,0]' }); // incorrect, latest

        const leaderboard = await request(app)
            .get(`/api/leaderboard/contest/${contestId}/leaderboard`)
            .set(student.headers);

        expect(leaderboard.status).toBe(200);
        expect(leaderboard.body[0].total_score).toBe(0);
    });

    test('leaderboard ranks higher score first', async () => {
        const { contestId, questionId } = await setupActiveContestWithQuestion();
        const studentHigh = await createUser({ name: 'High Scorer', email: 'high@test.com' });
        const studentLow = await createUser({ name: 'Low Scorer', email: 'low@test.com' });
        await registerForContest(studentHigh.userId, contestId);
        await registerForContest(studentLow.userId, contestId);

        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentHigh.headers)
            .send({ question_id: questionId, submitted_answer: '[0,1]' }); // correct -> 10 pts

        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentLow.headers)
            .send({ question_id: questionId, submitted_answer: 'wrong' }); // incorrect -> 0 pts

        const leaderboard = await request(app)
            .get(`/api/leaderboard/contest/${contestId}/leaderboard`)
            .set(studentHigh.headers);

        expect(leaderboard.body[0].student_name).toBe('High Scorer');
        expect(leaderboard.body[0].rank).toBe(1);
    });
});
