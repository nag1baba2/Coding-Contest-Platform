// Runs exactly ONCE, after every test file in the entire run has finished -
// not per-file, not per-describe-block. This is the correct place to close
// the shared DB pool, since multiple test files import the same pool
// singleton from src/config/db.js and closing it mid-run (from any single
// file's afterAll) would break whichever other file/describe block runs
// next in the same process.
module.exports = async function globalTeardown() {
    const pool = require('../src/config/db');
    await pool.end();
};
