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

async function promoteToAdmin(email) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'contest_platform',
        timezone: 'Z',
    });

    try {
        await connection.execute('UPDATE users SET role = ? WHERE email = ?', ['admin', email]);
    } finally {
        await connection.end();
    }
}

module.exports = { promoteToAdmin };
