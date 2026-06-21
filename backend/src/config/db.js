const mysql = require('mysql2/promise');
require('dotenv').config();

// When running under Jest (NODE_ENV=test), point at a separate
// database so integration tests never touch real/dev data. The test
// DB name is just the real one with "_test" appended, so you don't
// need a second .env entry - one source of truth for the base name.
const databaseName =
    process.env.NODE_ENV === 'test'
        ? `${process.env.DB_NAME}_test`
        : process.env.DB_NAME;

// Connection pool, not single connections - handles concurrent requests
// properly, which matters once Selenium/load tests fire multiple
// requests at once.
//
// timezone: 'Z' is critical here: by default mysql2 reads DATETIME
// columns back as JS Date objects using the *local* timezone of the
// machine running this code. Our app writes UTC-formatted strings
// (no offset) into those columns - MySQL DATETIME has no timezone
// awareness at all, it just stores the literal string. Without this
// setting, a server running outside UTC (e.g. India, UTC+5:30) would
// misread "08:35:57" as 08:35:57 *local* time instead of UTC, shifting
// every contest's computed status by the local UTC offset. That's
// exactly the kind of bug that passes on a CI runner (UTC) and fails
// for a developer testing locally in a different timezone - so it's
// pinned here explicitly rather than left to per-machine defaults.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z',
});

module.exports = pool;
