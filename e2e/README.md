# E2E Tests (Selenium / WebDriverIO)

Full-stack browser tests: a real Chrome instance driven by WebDriverIO,
clicking through the actual frontend, talking to the actual running
backend and MySQL database. These are the highest-value tests for
demonstrating Selenium-based test automation, since they exercise real
user flows rather than isolated functions or API calls.

**Important: these tests have not yet been run successfully by anyone.**
Unlike the backend's Jest suite (verified passing, 45/45), this code has
only been checked for syntax validity and module structure - never
executed against a real browser. Expect to debug something on first run;
that's normal, not a sign something went wrong in how this was built.

## What's tested

- `auth.spec.js` - registration, login, logout, duplicate-email
  rejection, wrong-password rejection, unauthenticated-redirect
- `contest-lifecycle.spec.js` - the full real-world flow: admin creates
  a contest, adds a problem, a student finds and submits to it, the
  leaderboard updates, the admin sees it in stats
- `time-gating.spec.js` - the one test that proves the upcoming -> active
  transition through genuine wall-clock waiting, not a simulated clock

## Prerequisites

1. **Backend running**, pointed at your real (not test) database:
   ```bash
   cd backend
   npm run dev
   ```
2. **Frontend served over HTTP** (not opened as a `file://` URL - some
   browser behavior differs on file:// and it keeps `baseUrl` meaningful):
   ```bash
   cd frontend
   python3 -m http.server 8080
   ```
3. **Chrome installed**, with a version that roughly matches the
   `chromedriver` npm package version in `package.json`. If you hit a
   "session not created" or "This version of ChromeDriver only supports
   Chrome version X" error, that's almost always the cause - check
   `chrome://version` in your browser and adjust the `chromedriver`
   version in `package.json` to match (chromedriver versions track
   Chrome major versions closely).
4. **`.env` configured** - this folder needs its own access to the
   database for the admin-promotion helper (`dbHelper.js`). Copy your
   backend's `.env` values, or create `e2e/.env` pointing at the same
   real database backend/.env uses (not `_test`).

## Running

```bash
cd e2e
npm install
npm test
```

To watch the browser while tests run (recommended for the first run,
so you can see what's actually happening):
```bash
npm test
```
(headed by default - Chrome will visibly open and click through the UI)

To run headless (e.g. for CI later):
```bash
HEADLESS=true npm test
```

## Known sources of flakiness / things to watch for

- **`time-gating.spec.js` waits on real wall-clock time** and uses
  minute-precision contest start times (a `datetime-local` input
  limitation, not a bug) - it can take up to ~90 seconds to complete
  the final test. This is intentional, not a hang.
- **No automatic data cleanup between runs** - each spec generates
  unique emails via `Date.now()`, so re-running won't collide with
  previous runs' data, but your database will accumulate test users
  and contests over time. Periodically truncate the relevant tables in
  your real `contest_platform` database if this becomes noisy (the
  same `TRUNCATE` pattern used in `backend/tests/dbHelper.js` works
  here too, run manually via the mysql CLI).
- **Selectors assume the exact DOM structure** built into the current
  frontend pages - if you change an element's `id` or class without
  updating the matching selector here, the test will fail with a
  "element not found" style error rather than a logic failure. That's
  expected and correct behavior for E2E tests, not a flaw.
