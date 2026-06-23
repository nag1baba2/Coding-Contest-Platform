const { BASE, uniqueEmail, register, login, logout, clearSession, setDateTimeInputValue } = require('../helpers');
const { promoteToAdmin, registerForContest } = require('../dbHelper');

// This spec mirrors, step by step, the exact manual walkthrough used
// to verify the app by hand: admin creates a contest, adds a problem,
// a student finds it, submits an answer, and the leaderboard reflects
// it. It's the single highest-value E2E test in this suite because it
// exercises the real time-gating logic through actual browser
// navigation, not a mocked clock.

describe('Full contest lifecycle', () => {
    let adminEmail;
    let studentEmail;
    let contestName;

    before(async () => {
        // Build a fresh admin account for this spec run, then promote
        // it via direct DB access (see dbHelper.js) - mirrors exactly
        // how a real admin account gets created in this app.
        adminEmail = uniqueEmail('lifecycle_admin');
        studentEmail = uniqueEmail('lifecycle_student');
        contestName = `E2E Contest ${Date.now()}`;

        await clearSession();
        await register('Lifecycle Admin', adminEmail, 'password123');
        await logout();
        await promoteToAdmin(adminEmail);
    });

    it('logs in as the promoted admin and lands on the admin panel', async () => {
        await login(adminEmail, 'password123');
        const url = await browser.getUrl();
        expect(url).toContain('admin.html');
    });

    it('creates a new contest that is active right now', async () => {
        await $('#new-contest-btn').click();
        await $('#contest-modal-overlay').waitForDisplayed({ timeout: 5000 });

        await $('#contest-name').setValue(contestName);
        await $('#contest-description').setValue('Created by the E2E lifecycle spec');

        // Build start (1 minute ago) / end (1 hour from now) so the
        // contest is active immediately - no waiting required for this
        // test, unlike the dedicated time-gating spec which deliberately
        // waits for a real state transition.
        const now = new Date();
        const start = new Date(now.getTime() - 60 * 1000);
        const end = new Date(now.getTime() + 60 * 60 * 1000);
        const toLocalInput = (d) => {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        await setDateTimeInputValue('#contest-start', toLocalInput(start));
        await setDateTimeInputValue('#contest-end', toLocalInput(end));
        await $('#contest-form button[type="submit"]').click();

        // Modal closes on success - confirms no validation/server error.
        await $('#contest-modal-overlay').waitForDisplayed({ reverse: true, timeout: 5000 });

        const card = await $(`.contest-card*=${contestName}`);
        await expect(card).toBeDisplayed();
    });

    it('adds a problem to the contest via the Problems modal', async () => {
        const card = await $(`.contest-card*=${contestName}`);
        const problemsBtn = await card.$('.manage-questions-btn');
        await problemsBtn.click();

        await $('#problems-list-modal-overlay').waitForDisplayed({ timeout: 5000 });
        await $('#add-problem-btn').click();
        await $('#question-modal-overlay').waitForDisplayed({ timeout: 5000 });

        await $('#question-title').setValue('Two Sum');
        await $('#question-description').setValue('Return indices of two numbers that add to target.');
        await $('#question-input').setValue('[2,7,11,15] 9');
        await $('#question-expected').setValue('[0,1]');
        await $('#question-points').setValue('10');
        await $('#question-form button[type="submit"]').click();

        await $('#question-modal-overlay').waitForDisplayed({ reverse: true, timeout: 5000 });

        const problemsListBody = await $('#problems-list-body');
        // NOTE: bare '*=text' (no tag prefix) uses WebDriver's
        // "partial link text" strategy under the hood, which only
        // reliably matches <a> elements - it silently fails to find
        // text inside other tags like <strong> or <td> (a documented
        // WDIO/WebDriver limitation, not a bug in this app - "Two Sum"
        // here renders inside a <strong> tag). Explicit XPath with
        // contains() works on any element type regardless of tag.
        const problemRow = await problemsListBody.$("//*[contains(text(), 'Two Sum')]");
        await expect(problemRow).toBeDisplayed();

        await $('#problems-list-close').click();
        await logout();
    });

    it('lets a student register, find the active contest, and see it as Live', async () => {
        await register('Lifecycle Student', studentEmail, 'password123');
        // Contest is already active so the registration API rejects late sign-ups.
        // Insert directly into the DB to simulate pre-contest registration.
        await registerForContest(studentEmail, contestName);
        // Reload so the contests list re-fetches registration_count (was 0
        // when the page first loaded, causing auto-end logic to mark it "ended").
        await browser.refresh();

        const card = await $(`.contest-card*=${contestName}`);
        await card.waitForDisplayed({ timeout: 5000 });

        const statusPill = await card.$('.status-pill');
        const statusText = await statusPill.getText();
        expect(statusText.toLowerCase()).toBe('live');

        await card.click();
        await browser.waitUntil(async () => (await browser.getUrl()).includes('contest-detail.html'), {
            timeout: 5000,
        });
    });

    it('shows the countdown timer counting down to the end time', async () => {
        const timerDisplay = await $('.timer-display');
        await timerDisplay.waitForDisplayed({ timeout: 5000 });

        const firstReading = await timerDisplay.getText();
        // A real wall-clock wait (not a mocked timer) to prove the
        // countdown is genuinely live-ticking, not a static label.
        await browser.pause(2000);
        const secondReading = await timerDisplay.getText();

        expect(firstReading).not.toBe(secondReading);
    });

    it('submits a correct answer and sees Accepted', async () => {
        const problemPanel = await $('.problem-panel');
        await problemPanel.waitForDisplayed({ timeout: 5000 });

        const input = await problemPanel.$('.submit-input');
        await input.setValue('[0,1]');

        const submitBtn = await problemPanel.$('.submit-btn');
        await submitBtn.click();

        const resultPill = await problemPanel.$('.submit-result .status-pill');
        await resultPill.waitForDisplayed({ timeout: 8000 });
        const resultText = await resultPill.getText();
        expect(resultText.toLowerCase()).toBe('accepted');
    });

    it('reflects the submission on the leaderboard', async () => {
        // Leaderboard updates via the same JS call right after a
        // submission (see contest-detail.html's loadLeaderboard call
        // inside the submit button handler) - re-check it directly
        // rather than re-navigating, to test that live-update path
        // specifically.
        const leaderboardRow = await $('#leaderboard-body tr');
        await leaderboardRow.waitForDisplayed({ timeout: 5000 });

        const rowText = await leaderboardRow.getText();
        expect(rowText).toContain('Lifecycle Student');
        expect(rowText).toContain('10'); // points awarded
    });

    it('shows the submission in the admin stats page', async () => {
        await logout();
        await login(adminEmail, 'password123');

        const card = await $(`.contest-card*=${contestName}`);
        await card.waitForDisplayed({ timeout: 5000 });
        const statsLink = await card.$('a.btn*=Stats');
        await statsLink.click();

        await browser.waitUntil(async () => (await browser.getUrl()).includes('contest-stats.html'), {
            timeout: 5000,
        });

        const submissionsBody = await $('#submissions-body');
        // Same reasoning as the problemsListBody query above - this
        // text lives in a <td>, so explicit XPath is required.
        const submissionRow = await submissionsBody.$("//*[contains(text(), 'Lifecycle Student')]");
        await submissionRow.waitForDisplayed({ timeout: 5000 });
        await expect(submissionRow).toBeDisplayed();
    });
});
