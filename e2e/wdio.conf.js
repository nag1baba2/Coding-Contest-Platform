// ============================================================
// WebDriverIO config - runs real Chrome against the live frontend
// (static files) and live backend (Express + MySQL).
//
// IMPORTANT: unlike the backend's Jest suite, this CANNOT be verified
// without a real browser and a real running stack. The first time you
// run this is genuinely the first time this code has ever executed -
// expect to debug it, the same way we debugged the backend tests.
//
// Prerequisites before running:
//   1. Backend running: cd backend && npm run dev  (port 5000)
//   2. Frontend served: cd frontend && python3 -m http.server 8080
//      (must be served over http://, not opened as a file:// URL -
//      some browser APIs behave differently on file://, and it keeps
//      this config's baseUrl meaningful)
//   3. chromedriver version must roughly match your installed Chrome
//      version. If tests fail immediately with a "session not created"
//      or version-mismatch error, that's the most likely cause - see
//      README troubleshooting section.
// ============================================================

exports.config = {
    runner: 'local',
    specs: ['./specs/**/*.spec.js'],

    // Serial execution - tests share backend/DB state, running them in
    // parallel would cause race conditions between specs (e.g. one
    // test's contest data interfering with another's leaderboard
    // assertions).
    maxInstances: 1,

    capabilities: [
        {
            browserName: 'chrome',
            'goog:chromeOptions': {
                args:
                    process.env.HEADLESS === 'true'
                        ? ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage']
                        : [],
            },
        },
    ],

    logLevel: 'warn',
    bail: 0,
    baseUrl: 'http://localhost:8080',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    services: ['chromedriver'],
    framework: 'mocha',
    reporters: ['spec'],

    mochaOpts: {
        ui: 'bdd',
        timeout: 30000,
    },
};
