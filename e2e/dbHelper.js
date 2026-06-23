// ============================================================
// E2E tests need an admin account, but the app deliberately has no
// admin-registration endpoint (see backend/src/controllers/
// authController.js). The real workflow is: register normally, then
// promote via direct SQL - this connects to the SAME real database
// the frontend/backend are using (not a separate test DB), since
// these are full-stack tests against your actual running app, not
// the Jest integration suite's isolated DB.
// ============================================================

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../backend/.env' });

async function getConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'contest_platform',
        timezone: 'Z',
    });
}

async function promoteToAdmin(email) {
    const connection = await getConnection();
    try {
        await connection.execute('UPDATE users SET role = ? WHERE email = ?', ['admin', email]);
    } finally {
        await connection.end();
    }
}

// Bypasses the registration-window check for tests that create already-active
// contests (where the API endpoint rejects registration as too late).
async function registerForContest(userEmail, contestName) {
    const connection = await getConnection();
    try {
        const [[user]] = await connection.execute('SELECT id FROM users WHERE email = ?', [userEmail]);
        const [[contest]] = await connection.execute('SELECT id FROM contests WHERE name = ?', [contestName]);
        if (user && contest) {
            await connection.execute(
                'INSERT IGNORE INTO contest_registrations (user_id, contest_id) VALUES (?, ?)',
                [user.id, contest.id]
            );
        }
    } finally {
        await connection.end();
    }
}

module.exports = { promoteToAdmin, registerForContest };
