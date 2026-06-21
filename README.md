# Coding Contest Platform — Backend (Phase 1)

A private coding-contest platform for a small group, with admin-managed
contests, time-gated participation, and an auto-scored leaderboard.

This is the **backend only** (Phase 1 scope). No code-execution sandbox yet —
submissions are scored by string comparison against an expected output.

## Why this project, testing-wise

The interesting part of this system isn't the CRUD (that's mostly boilerplate).
It's the **time-gated state machine**: a contest is `upcoming`, `active`, or
`ended` purely based on comparing the current time to `start_time`/`end_time`
on every request — no scheduler, no cron job. That logic is isolated into a
single pure function (`getContestStatus` in `src/middleware/contestTime.js`)
specifically so it can be unit-tested directly with fake clock values,
independent of the database or HTTP layer.

Two design decisions worth knowing if asked about them:
- **`end_time` is inclusive** — a contest is still `active` at the exact
  end_time second, and only flips to `ended` the moment after. (One-line
  change in `getContestStatus` if you'd rather make it exclusive.)
- **Scoring rule**: trim leading/trailing whitespace, then case-sensitive
  exact match. Internal whitespace (e.g. `"[0, 1]"` vs `"[0,1]"`) is **not**
  normalized — that's a deliberate scope decision, not a bug.

See `backend/tests/` for the test cases that pin both of these down.

## Project structure

```
backend/
  src/
    app.js              # Express app (exported separately from server.js for testability)
    server.js            # Entry point - just calls app.listen()
    config/
      db.js               # MySQL connection pool
      schema.sql           # Full DB schema
      seed.sql              # Notes on creating the first admin user
    controllers/         # Business logic per resource
    middleware/
      auth.js              # JWT verification + role checks
      contestTime.js        # Time-gating logic (the core piece)
      errorHandler.js        # Centralized error responses
    routes/               # Express routers, wire up middleware + controllers
  tests/                # Jest unit tests (pure-function, no DB required)
.github/workflows/
  backend-ci.yml        # Runs unit tests on every push/PR to main
```

## Setup

1. **Install MySQL locally** (or use a Docker container) and create the database:
   ```bash
   mysql -u root -p < backend/src/config/schema.sql
   ```

2. **Create the test database** (separate from your real one, used only by the integration test suite):
   ```bash
   mysql -u root -p < backend/src/config/schema.test.sql
   ```

3. **Configure environment variables**:
   ```bash
   cd backend
   cp .env.example .env
   # edit .env with your real DB password and a random JWT_SECRET
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Run the server**:
   ```bash
   npm run dev   # uses nodemon for auto-restart
   ```

6. **Create your first admin account**:
   - `POST /api/auth/register` with your own name/email/password (this creates a `student`)
   - Then manually run: `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`

7. **Run tests**:
   ```bash
   npm test              # everything: unit + integration (needs test DB set up)
   npm run test:unit     # fast, pure-function tests only - no DB needed
   npm run test:integration   # Supertest suite against the test DB only
   ```

## Bugs found and fixed during testing

Worth knowing these if asked - both were caught by actually running the
integration suite against a real database, not by code review alone.

**1. Timezone mismatch broke time-gating on non-UTC machines.**
`mysql2` reads `DATETIME` columns back as JS `Date` objects using the
*local* timezone of the machine running the code, by default - even
though MySQL's `DATETIME` type has no timezone awareness at all; it
just stores whatever string it's given. This app writes UTC-formatted
timestamps, so on a machine running outside UTC (e.g. India, UTC+5:30),
every contest's start/end time was silently misread, shifting computed
status enough to flip "active" into "ended" or "not started." Fixed by
setting `timezone: 'Z'` on the `mysql2` connection pool (`src/config/db.js`),
forcing consistent UTC interpretation on both write and read.

**2. Leaderboard double-counted same-second submissions.**
The "only the latest submission counts" rule was originally implemented
by joining on `MAX(created_at)` per (student, question). `TIMESTAMP`
columns default to second-level precision, so two submissions made
within the same second (e.g. a fast automated test, or a student
double-clicking submit) could share an identical `created_at` value -
the join then matched both rows as "latest" and summed both scores
instead of picking one. Fixed by tie-breaking on the submission's
auto-increment `id` instead (`src/controllers/leaderboardController.js`),
which is unambiguous regardless of timestamp precision.

**3. MySQL DATETIME rejected the full ISO timestamp format the frontend actually sends.**
The integration test suite builds contest times with
`.toISOString().slice(0, 19)`, which happens to strip milliseconds and
the `Z` suffix, producing a format MySQL's `DATETIME` column accepts
without complaint. The real frontend, however, sends a full,
untruncated ISO string (`"2026-06-21T07:10:00.000Z"`) from
`new Date(...).toISOString()` - which MySQL rejects outright with
`ER_TRUNCATED_WRONG_VALUE`. The tests passing didn't mean the feature
worked; it meant the tests and the frontend disagreed on date format,
and only one of them matched what MySQL expects. Fixed by normalizing
any incoming date value to MySQL's exact `YYYY-MM-DD HH:MM:SS` format
at the controller boundary (`toMysqlDatetime()` in
`contestController.js`), so the backend no longer depends on the
caller sending a specific string shape. A regression test now exercises
the exact full-ISO format the frontend sends, not just the
test-suite's shorthand.

## Testing strategy

Two layers, on purpose:

- **Unit tests** (`contestTime.test.js`, `scoring.test.js`) test pure functions in
  isolation - no DB, no HTTP, no mocking. They run in well under a second and pin
  down the exact business rules (time-gating boundaries, scoring rule) so a future
  refactor can't silently change behavior without a test failing.

- **Integration tests** (`*.integration.test.js`) use Supertest to hit real Express
  routes against a real (separate, test-only) MySQL database. These catch wiring
  bugs - route + middleware + SQL query all working together - that unit tests
  can't see. They cover the exact scenarios verified manually during development:
  role-based access control, time-gated question/submission access, the
  "expected_output never leaks to students" boundary, and the "only the latest
  submission counts" leaderboard rule.

The integration test DB is wiped (`TRUNCATE`) before every single test via
`tests/dbHelper.js`, so tests never depend on execution order or leftover state
from a previous test.

## API overview

| Method | Route | Who | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Creates a student account |
| POST | `/api/auth/login` | Public | Returns JWT |
| POST | `/api/contests` | Admin | Create contest |
| GET | `/api/contests` | Auth | List all contests with computed status |
| GET | `/api/contests/:id` | Auth | Single contest |
| PUT | `/api/contests/:id` | Admin | Update contest |
| DELETE | `/api/contests/:id` | Admin | Delete contest (cascades to questions/submissions) |
| POST | `/api/questions` | Admin | Add question to a contest |
| GET | `/api/questions/admin/:contestId` | Admin | List questions incl. expected_output |
| GET | `/api/questions/contest/:contestId` | Auth + active contest | Student view, no answer key |
| PUT/DELETE | `/api/questions/:id` | Admin | Edit/remove question |
| POST | `/api/submissions/contest/:contestId` | Auth + active contest | Submit an answer |
| GET | `/api/submissions/contest/:contestId/mine` | Auth | Own submission history |
| GET | `/api/submissions/contest/:contestId/all` | Admin | All submissions (grading/audit) |
| GET | `/api/leaderboard/contest/:contestId/leaderboard` | Auth | Ranked leaderboard |
| GET | `/api/leaderboard/contest/:contestId/stats` | Admin | Participants, submissions, most/least solved |

## Frontend

Plain HTML/CSS/JS (no framework/build step) - intentional, so it's
trivial to run (just open a file) and gives Selenium predictable,
stable DOM selectors to test against later.

```
frontend/
  index.html              # redirects to login or contests based on session
  css/styles.css           # design system - colors, type, components
  js/api.js                 # API client + session/auth helpers
  js/utils.js                 # time formatting, countdown timer, status pills
  pages/
    login.html
    register.html
    contests.html            # student: list of contests
    contest-detail.html        # student: live countdown, problems, submit, leaderboard
    admin.html                   # admin: create/edit/delete contests, add problems
    contest-stats.html             # admin: participant/submission stats, full submission log
```

### Running the frontend

The frontend is fully static - no build step, no npm install needed for it.
Two ways to run it:

**Simplest:** open `frontend/pages/login.html` directly in a browser
(double-click, or right-click -> Open with Browser).

**Slightly more correct:** serve it over a local HTTP server, since some
browsers restrict certain JS behavior on `file://` URLs:
```bash
cd frontend
python3 -m http.server 8080
# then visit http://localhost:8080/pages/login.html
```

Either way, the backend (`npm run dev` in `backend/`) must already be
running on port 5000 - the frontend's `API_BASE` in `js/api.js` points
there directly. CORS is already enabled on the backend (`app.use(cors())`
in `app.js`), so cross-origin requests from the static frontend work
without extra configuration.

### Design notes

The visual language deliberately echoes real judge systems (Codeforces/
LeetCode conventions): monospace type for anything structural (headers,
timers, status pills, points), a dark "terminal" palette, and accept/
reject colors (green/red) that match what students already associate
with submission results. The countdown timer is the signature element -
it's the actual mechanical core of the product (time-gating), so it's
the one thing given real visual weight rather than just another card.

Session state (JWT + user info) lives in `sessionStorage`, not
`localStorage` - deliberate choice so logging out by closing the tab is
the default, appropriate for a small shared-computer-friendly tool.

`escapeHtml()` in `utils.js` is used everywhere user-supplied text
(contest names, question titles, submitted answers) gets inserted into
the page. Without it, an admin typing a contest name like
`<script>...</script>` would execute in every student's browser - a
real stored-XSS risk even in a small private app.

## What's NOT in Phase 1 (intentionally)

- Real code execution (Python/Java/C++ sandbox) — planned as a later phase,
  likely via the Judge0 API rather than a self-hosted Docker sandbox
- Daily challenge / streak tracking
- Frontend (this repo is backend-only for now)

## Roadmap

- [x] Phase 1: backend API + full test suite (45 tests, verified passing)
- [x] Phase 1: frontend (vanilla HTML/CSS/JS, verified working in browser)
- [x] Phase 1: Selenium/WebDriverIO E2E suite written (17 tests across
      3 spec files) - **NOT YET VERIFIED RUNNING** - see `e2e/README.md`
- [x] CI/CD: GitHub Actions workflow extended with an E2E job -
      **NOT YET VERIFIED RUNNING** - first real push to GitHub will be
      the first real test of this workflow
- [ ] Phase 1.5: Judge0 integration for real code execution
- [ ] Phase 2: Daily challenge + streaks

### Honest status note

Everything backend-related (the 45 tests) has been run and confirmed
passing on a real machine, multiple times, including three real bugs
found and fixed along the way (see "Bugs found and fixed" above). The
E2E suite and the CI workflow extension are new as of the latest
session - they're syntactically valid and structurally verified (every
spec file loads correctly, the YAML parses correctly), but **have not
yet been executed against a real browser or a real GitHub Actions run**.
Expect to debug at least one thing on first run, the same way every
other part of this project needed at least one real debugging pass
before working cleanly.

## Project structure

```
coding-contest-platform/
  backend/          Express + MySQL API, Jest test suite
  frontend/         Vanilla HTML/CSS/JS client
  e2e/              WebDriverIO/Selenium end-to-end tests (see e2e/README.md)
  .github/workflows/  CI: backend tests + E2E tests
```
