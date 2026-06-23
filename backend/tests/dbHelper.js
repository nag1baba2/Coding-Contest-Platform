const pool = require('../src/config/db');

// Wipes all tables between tests so each test starts from a known-empty
// state. TRUNCATE (not DELETE) resets AUTO_INCREMENT counters too, which
// matters because several tests assert on specific ids (e.g. "user id 1").
//
// Order matters: child tables before parent tables, since foreign keys
// would otherwise block truncation. We disable FK checks instead to
// avoid having to hand-maintain that order as the schema grows.
async function cleanDatabase() {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE submissions');
    await pool.query('TRUNCATE TABLE contest_registrations');
    await pool.query('TRUNCATE TABLE questions');
    await pool.query('TRUNCATE TABLE contests');
    await pool.query('TRUNCATE TABLE users');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

// Bypasses the registration-window check (used in tests where the contest
// is already active so the API endpoint would reject the registration).
async function registerForContest(userId, contestId) {
    await pool.query(
        'INSERT IGNORE INTO contest_registrations (user_id, contest_id) VALUES (?, ?)',
        [userId, contestId]
    );
}

// NOTE: closing the DB pool is handled once, globally, by
// tests/globalTeardown.js - not here. See that file for why.

module.exports = { cleanDatabase, registerForContest };
