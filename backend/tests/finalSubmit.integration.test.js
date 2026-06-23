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

// Creates an active contest (started 1 h ago, ends in 1 h).
async function createActiveContest(adminHeaders, name = 'Final-Submit Contest') {
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

// Creates a text question so tests can plant a real submission.
async function createTextQuestion(adminHeaders, contestId) {
    const res = await request(app)
        .post('/api/questions')
        .set(adminHeaders)
        .send({
            contest_id: contestId,
            title: 'What is 2+2?',
            description: 'Enter the numeric answer.',
            expected_output: '4',
        });
    return res.body.id;
}

function finalSubmitUrl(contestId) {
    return `/api/registrations/contest/${contestId}/final-submit`;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Final Submit (/registrations/contest/:id/final-submit)', () => {
    let admin, student, contestId;

    beforeEach(async () => {
        await cleanDatabase();
        admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        student = await createUser({ name: 'Student', email: 'student@test.com' });
        contestId = await createActiveContest(admin.headers);
        // Direct DB insert bypasses the "contest already started" API guard.
        await registerForContest(student.userId, contestId);
    });

    test('registered student can final submit and receives success:true', async () => {
        const res = await request(app)
            .post(finalSubmitUrl(contestId))
            .set(student.headers);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('final_submitted flag is persisted in the database', async () => {
        await request(app).post(finalSubmitUrl(contestId)).set(student.headers);

        const [[reg]] = await pool.query(
            'SELECT final_submitted, final_submitted_at FROM contest_registrations WHERE user_id = ? AND contest_id = ?',
            [student.userId, contestId]
        );
        expect(reg.final_submitted).toBe(1);
        expect(reg.final_submitted_at).not.toBeNull();
    });

    test('no submissions → -10 penalty applied, penalty_applied:true in response', async () => {
        const res = await request(app)
            .post(finalSubmitUrl(contestId))
            .set(student.headers);

        expect(res.body.penalty_applied).toBe(true);

        const [[user]] = await pool.query('SELECT total_points FROM users WHERE id = ?', [student.userId]);
        expect(user.total_points).toBe(-10);
    });

    test('at least one submission → no penalty, penalty_applied:false in response', async () => {
        // Plant a real submission directly so no extra API calls are needed.
        const questionId = await createTextQuestion(admin.headers, contestId);
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionId, submitted_answer: 'wrong answer' });

        const res = await request(app)
            .post(finalSubmitUrl(contestId))
            .set(student.headers);

        expect(res.body.penalty_applied).toBe(false);

        const [[user]] = await pool.query('SELECT total_points FROM users WHERE id = ?', [student.userId]);
        // -1 for wrong submission, 0 for final submit → -1 total
        expect(user.total_points).toBe(-1);
    });

    test('cannot final submit twice (400 on second attempt)', async () => {
        await request(app).post(finalSubmitUrl(contestId)).set(student.headers);

        const res = await request(app)
            .post(finalSubmitUrl(contestId))
            .set(student.headers);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/already final submitted/i);
    });

    test('penalty is only applied once even if guard somehow runs again', async () => {
        // Simulate the penalty-applied flag by directly setting it.
        await pool.query(
            'UPDATE contest_registrations SET no_submission_penalty_applied = 1 WHERE user_id = ? AND contest_id = ?',
            [student.userId, contestId]
        );

        await request(app).post(finalSubmitUrl(contestId)).set(student.headers);

        const [[user]] = await pool.query('SELECT total_points FROM users WHERE id = ?', [student.userId]);
        // no penalty should have been applied
        expect(user.total_points).toBe(0);
    });

    test('unregistered student cannot final submit (403)', async () => {
        const outsider = await createUser({ name: 'Outsider', email: 'out@test.com' });

        const res = await request(app)
            .post(finalSubmitUrl(contestId))
            .set(outsider.headers);

        expect(res.status).toBe(403);
    });

    test('getRegistrationStatus reflects final_submitted after final submit', async () => {
        const before = await request(app)
            .get(`/api/registrations/contest/${contestId}`)
            .set(student.headers);
        expect(before.body.final_submitted).toBe(false);

        await request(app).post(finalSubmitUrl(contestId)).set(student.headers);

        const after = await request(app)
            .get(`/api/registrations/contest/${contestId}`)
            .set(student.headers);
        expect(after.body.final_submitted).toBe(true);
        expect(after.body.final_submitted_at).not.toBeNull();
    });

    test('unauthenticated request is rejected (401)', async () => {
        const res = await request(app).post(finalSubmitUrl(contestId));
        expect(res.status).toBe(401);
    });
});
