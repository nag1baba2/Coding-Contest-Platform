const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase } = require('./dbHelper');

// Integration tests hit real Express routes + a real (test) database via
// Supertest, unlike the pure-function unit tests in contestTime.test.js
// and scoring.test.js. These catch wiring bugs - route, middleware, and
// SQL query all working together - that unit tests can't see.
//
// Note: the DB pool is closed once, globally, after the ENTIRE suite
// finishes (see jest.config.js globalTeardown) - not per-file. Multiple
// test files share the same pool import, so closing it in any single
// file's afterAll would break other files/describe blocks still using it.

describe('Auth flow', () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    test('registering a new user returns a token and student role', async () => {
        const res = await request(app).post('/api/auth/register').send({
            name: 'Alice',
            email: 'alice@test.com',
            password: 'password123',
        });

        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.role).toBe('student');
        expect(res.body.user.email).toBe('alice@test.com');
    });

    test('registering with an already-used email is rejected', async () => {
        await request(app).post('/api/auth/register').send({
            name: 'Alice',
            email: 'alice@test.com',
            password: 'password123',
        });

        const res = await request(app).post('/api/auth/register').send({
            name: 'Alice Again',
            email: 'alice@test.com',
            password: 'differentpassword',
        });

        expect(res.status).toBe(409);
    });

    test('registering with a short password is rejected', async () => {
        const res = await request(app).post('/api/auth/register').send({
            name: 'Bob',
            email: 'bob@test.com',
            password: '123',
        });

        expect(res.status).toBe(400);
    });

    test('logging in with correct credentials succeeds', async () => {
        await request(app).post('/api/auth/register').send({
            name: 'Alice',
            email: 'alice@test.com',
            password: 'password123',
        });

        const res = await request(app).post('/api/auth/login').send({
            email: 'alice@test.com',
            password: 'password123',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    test('logging in with wrong password fails with 401', async () => {
        await request(app).post('/api/auth/register').send({
            name: 'Alice',
            email: 'alice@test.com',
            password: 'password123',
        });

        const res = await request(app).post('/api/auth/login').send({
            email: 'alice@test.com',
            password: 'wrongpassword',
        });

        expect(res.status).toBe(401);
    });

    test('logging in with a non-existent email fails with 401 (not 404)', async () => {
        // Deliberately checking it's 401, not 404 - returning 404 here
        // would leak "this email isn't registered", which is a real
        // (if minor) information-disclosure issue.
        const res = await request(app).post('/api/auth/login').send({
            email: 'ghost@test.com',
            password: 'whatever123',
        });

        expect(res.status).toBe(401);
    });
});
