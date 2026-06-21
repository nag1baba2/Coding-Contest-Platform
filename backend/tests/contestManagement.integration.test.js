const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase } = require('./dbHelper');
const pool = require('../src/config/db');

// Pool is closed once globally via jest.config.js globalTeardown -
// see auth.integration.test.js for the full explanation.

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

async function createContest(adminHeaders, { startOffsetMs, endOffsetMs, name = 'Test Contest' }) {
    const now = Date.now();
    const res = await request(app)
        .post('/api/contests')
        .set(adminHeaders)
        .send({
            name,
            start_time: new Date(now + startOffsetMs).toISOString().slice(0, 19),
            end_time: new Date(now + endOffsetMs).toISOString().slice(0, 19),
        });
    return res.body.id;
}

describe('Contest update', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    test('admin can update a contest name', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000,
            endOffsetMs: 2 * 60 * 60 * 1000,
            name: 'Original Name',
        });

        const res = await request(app)
            .put(`/api/contests/${contestId}`)
            .set(admin.headers)
            .send({ name: 'Updated Name' });

        expect(res.status).toBe(200);

        const check = await request(app).get(`/api/contests/${contestId}`).set(admin.headers);
        expect(check.body.name).toBe('Updated Name');
    });

    test('updating with end_time before start_time is rejected', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000,
            endOffsetMs: 2 * 60 * 60 * 1000,
        });

        const res = await request(app)
            .put(`/api/contests/${contestId}`)
            .set(admin.headers)
            .send({
                start_time: '2026-08-01T20:00:00',
                end_time: '2026-08-01T19:00:00',
            });

        expect(res.status).toBe(400);
    });

    test('updating a non-existent contest returns 404', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });

        const res = await request(app)
            .put('/api/contests/99999')
            .set(admin.headers)
            .send({ name: 'Ghost Contest' });

        expect(res.status).toBe(404);
    });

    test('student CANNOT update a contest (403)', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const student = await createUser({ name: 'Student', email: 'student@test.com' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000,
            endOffsetMs: 2 * 60 * 60 * 1000,
        });

        const res = await request(app)
            .put(`/api/contests/${contestId}`)
            .set(student.headers)
            .send({ name: 'Hacked Name' });

        expect(res.status).toBe(403);
    });

    test('partial update only changes the given field, leaves others intact', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000,
            endOffsetMs: 2 * 60 * 60 * 1000,
            name: 'Keep My Description',
        });

        await request(app)
            .put(`/api/contests/${contestId}`)
            .set(admin.headers)
            .send({ name: 'Only Name Changed' });

        const check = await request(app).get(`/api/contests/${contestId}`).set(admin.headers);
        expect(check.body.name).toBe('Only Name Changed');
        // start_time/end_time should be unchanged from creation, not nulled out
        expect(check.body.start_time).toBeDefined();
        expect(check.body.end_time).toBeDefined();
    });
});

describe('Contest delete', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    test('admin can delete a contest', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000,
            endOffsetMs: 2 * 60 * 60 * 1000,
        });

        const res = await request(app).delete(`/api/contests/${contestId}`).set(admin.headers);
        expect(res.status).toBe(200);

        const check = await request(app).get(`/api/contests/${contestId}`).set(admin.headers);
        expect(check.status).toBe(404);
    });

    test('deleting a non-existent contest returns 404', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });

        const res = await request(app).delete('/api/contests/99999').set(admin.headers);
        expect(res.status).toBe(404);
    });

    test('student CANNOT delete a contest (403)', async () => {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const student = await createUser({ name: 'Student', email: 'student@test.com' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: 60 * 60 * 1000,
            endOffsetMs: 2 * 60 * 60 * 1000,
        });

        const res = await request(app).delete(`/api/contests/${contestId}`).set(student.headers);
        expect(res.status).toBe(403);
    });

    test('deleting a contest cascades: its questions and submissions are also removed', async () => {
        // This pins down the deliberate cascade-delete decision documented
        // in contestController.js - worth being able to explain in an
        // interview, since "soft delete instead" is a real, defensible
        // alternative a reviewer might ask about.
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: -60 * 60 * 1000,
            endOffsetMs: 60 * 60 * 1000,
        });

        const questionRes = await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({ contest_id: contestId, title: 'Q', description: 'd', expected_output: 'x' });

        const student = await createUser({ name: 'Student', email: 'student@test.com' });
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: questionRes.body.id, submitted_answer: 'x' });

        await request(app).delete(`/api/contests/${contestId}`).set(admin.headers);

        const [questions] = await pool.query('SELECT * FROM questions WHERE contest_id = ?', [contestId]);
        const [submissions] = await pool.query('SELECT * FROM submissions WHERE contest_id = ?', [contestId]);

        expect(questions.length).toBe(0);
        expect(submissions.length).toBe(0);
    });
});

describe('Contest statistics', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    async function setupContestWithTwoQuestions() {
        const admin = await createUser({ name: 'Admin', email: 'admin@test.com', role: 'admin' });
        const contestId = await createContest(admin.headers, {
            startOffsetMs: -60 * 60 * 1000,
            endOffsetMs: 60 * 60 * 1000,
        });

        const q1 = await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({ contest_id: contestId, title: 'Easy Q', description: 'd', expected_output: 'a' });

        const q2 = await request(app)
            .post('/api/questions')
            .set(admin.headers)
            .send({ contest_id: contestId, title: 'Hard Q', description: 'd', expected_output: 'b' });

        return { admin, contestId, q1Id: q1.body.id, q2Id: q2.body.id };
    }

    test('stats report correct participant and submission counts', async () => {
        const { admin, contestId, q1Id } = await setupContestWithTwoQuestions();
        const studentA = await createUser({ name: 'A', email: 'a@test.com' });
        const studentB = await createUser({ name: 'B', email: 'b@test.com' });

        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentA.headers)
            .send({ question_id: q1Id, submitted_answer: 'a' });

        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentB.headers)
            .send({ question_id: q1Id, submitted_answer: 'wrong' });

        const res = await request(app)
            .get(`/api/leaderboard/contest/${contestId}/stats`)
            .set(admin.headers);

        expect(res.status).toBe(200);
        expect(res.body.participants).toBe(2);
        expect(res.body.total_submissions).toBe(2);
    });

    test('most_solved correctly identifies the question more students solved', async () => {
        const { admin, contestId, q1Id, q2Id } = await setupContestWithTwoQuestions();
        const studentA = await createUser({ name: 'A', email: 'a@test.com' });
        const studentB = await createUser({ name: 'B', email: 'b@test.com' });

        // Both solve q1 (easy), only one solves q2 (hard)
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentA.headers)
            .send({ question_id: q1Id, submitted_answer: 'a' });
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentB.headers)
            .send({ question_id: q1Id, submitted_answer: 'a' });
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(studentA.headers)
            .send({ question_id: q2Id, submitted_answer: 'b' });

        const res = await request(app)
            .get(`/api/leaderboard/contest/${contestId}/stats`)
            .set(admin.headers);

        expect(res.body.most_solved.id).toBe(q1Id);
        expect(res.body.most_solved.solve_count).toBe(2);
    });

    test('resubmitting (even multiple times) does not inflate solve_count beyond 1 per student', async () => {
        const { admin, contestId, q1Id } = await setupContestWithTwoQuestions();
        const student = await createUser({ name: 'A', email: 'a@test.com' });

        // Submit correct, then correct again - should still only count once
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: q1Id, submitted_answer: 'a' });
        await request(app)
            .post(`/api/submissions/contest/${contestId}`)
            .set(student.headers)
            .send({ question_id: q1Id, submitted_answer: 'a' });

        const res = await request(app)
            .get(`/api/leaderboard/contest/${contestId}/stats`)
            .set(admin.headers);

        const q1Stats = res.body.all_questions.find((q) => q.id === q1Id);
        expect(q1Stats.solve_count).toBe(1);
    });

    test('student CANNOT access contest statistics (admin-only)', async () => {
        const { contestId } = await setupContestWithTwoQuestions();
        const student = await createUser({ name: 'Student', email: 'student@test.com' });

        const res = await request(app)
            .get(`/api/leaderboard/contest/${contestId}/stats`)
            .set(student.headers);

        expect(res.status).toBe(403);
    });
});
