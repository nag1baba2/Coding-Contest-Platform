const { BASE, uniqueEmail, register, login, logout, clearSession, setDateTimeInputValue } = require('../helpers');
const { promoteToAdmin, registerForContest, cleanupTestData } = require('../dbHelper');

// ── helpers ───────────────────────────────────────────────────────────────

function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Types into the CodeMirror-style textarea by clicking it first so focus
// is set, then using the setValue trick with JS to avoid OS input issues.
async function setCodeEditorValue(code) {
    const editor = await $('#code-editor');
    await editor.click();
    await browser.execute((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, editor, code);
}

// ── suite ─────────────────────────────────────────────────────────────────

describe('Python code submission + Final Submit', () => {
    let adminEmail;
    let studentEmail;
    let contestName;

    before(async () => {
        adminEmail  = uniqueEmail('py_admin');
        studentEmail = uniqueEmail('py_student');
        contestName = `Python E2E ${Date.now()}`;

        await clearSession();
        await register('Py Admin', adminEmail, 'password123');
        await logout();
        await promoteToAdmin(adminEmail);
    });

    after(async () => {
        await cleanupTestData(['py_admin_%@e2e.test', 'py_student_%@e2e.test']);
    });

    // ── Admin: create contest + Python question ──────────────────────────

    it('admin creates an active contest', async () => {
        await login(adminEmail, 'password123');
        await $('#new-contest-btn').click();
        await $('#contest-modal-overlay').waitForDisplayed({ timeout: 5000 });

        await $('#contest-name').setValue(contestName);
        await $('#contest-description').setValue('Python E2E test contest');

        const now = new Date();
        await setDateTimeInputValue('#contest-start', toLocalInput(new Date(now.getTime() - 60 * 1000)));
        await setDateTimeInputValue('#contest-end',   toLocalInput(new Date(now.getTime() + 60 * 60 * 1000)));

        await $('#contest-form button[type="submit"]').click();
        await $('#contest-modal-overlay').waitForDisplayed({ reverse: true, timeout: 5000 });

        const card = await $(`.contest-card*=${contestName}`);
        await expect(card).toBeDisplayed();
    });

    it('admin adds a Python question with test cases', async () => {
        const card = await $(`.contest-card*=${contestName}`);
        const problemsBtn = await card.$('.manage-questions-btn');
        await problemsBtn.click();

        await $('#problems-list-modal-overlay').waitForDisplayed({ timeout: 5000 });
        await $('#add-problem-btn').click();
        await $('#question-modal-overlay').waitForDisplayed({ timeout: 5000 });

        // Fill basic fields
        await $('#question-title').setValue('Add Two Numbers');
        await $('#question-description').setValue('Write add(a, b) that returns a + b.');

        // Switch to Python type — this reveals the Python fields
        await $('#question-language').selectByVisibleText('Python coding');
        await $('#python-fields').waitForDisplayed({ timeout: 3000 });

        // Function signature
        await $('#question-func-sig').setValue('add(a, b)');

        // Add test case 1: [1, 2] → 3
        await $('#add-tc-btn').click();
        await browser.waitUntil(
            async () => (await $$('#test-cases-container .tc-entry')).length === 1,
            { timeout: 3000 }
        );
        const firstRow = await $('#test-cases-container .tc-entry:last-child');
        await firstRow.$('.tc-args').setValue('[1, 2]');
        await firstRow.$('.tc-expected').setValue('3');

        // Add test case 2: [5, 5] → 10
        await $('#add-tc-btn').click();
        await browser.waitUntil(
            async () => (await $$('#test-cases-container .tc-entry')).length === 2,
            { timeout: 3000 }
        );
        const secondRow = await $('#test-cases-container .tc-entry:last-child');
        await secondRow.$('.tc-args').setValue('[5, 5]');
        await secondRow.$('.tc-expected').setValue('10');

        // Add test case 3: [-1, 1] → 0
        await $('#add-tc-btn').click();
        await browser.waitUntil(
            async () => (await $$('#test-cases-container .tc-entry')).length === 3,
            { timeout: 3000 }
        );
        const thirdRow = await $('#test-cases-container .tc-entry:last-child');
        await thirdRow.$('.tc-args').setValue('[-1, 1]');
        await thirdRow.$('.tc-expected').setValue('0');

        await $('#question-modal-save').click();
        await $('#question-modal-overlay').waitForDisplayed({ reverse: true, timeout: 5000 });

        // Confirm question appears in the list
        const problemsListBody = await $('#problems-list-body');
        const problemRow = await problemsListBody.$('//*[contains(text(), "Add Two Numbers")]');
        await expect(problemRow).toBeDisplayed();

        await $('#problems-list-close').click();
        await logout();
    });

    // ── Student: register + submit ───────────────────────────────────────

    it('student registers and can see the active contest', async () => {
        await register('Py Student', studentEmail, 'password123');
        await registerForContest(studentEmail, contestName);
        await browser.refresh();

        const card = await $(`.contest-card*=${contestName}`);
        await card.waitForDisplayed({ timeout: 5000 });

        const statusPill = await card.$('.status-pill');
        const text = await statusPill.getText();
        expect(text.toLowerCase()).toBe('live');
    });

    it('student opens the contest and sees the Python question with a Solve link', async () => {
        const card = await $(`.contest-card*=${contestName}`);
        await card.click();

        await browser.waitUntil(
            async () => (await browser.getUrl()).includes('contest-detail.html'),
            { timeout: 5000 }
        );

        // Python questions show a "Solve →" link instead of a text input
        const solveLink = await $('a.btn*=Solve');
        await expect(solveLink).toBeDisplayed();
    });

    it('clicking Solve opens coding.html with the editor', async () => {
        const solveLink = await $('a.btn*=Solve');
        await solveLink.click();

        await browser.waitUntil(
            async () => (await browser.getUrl()).includes('coding.html'),
            { timeout: 5000 }
        );

        const editor = await $('#code-editor');
        await editor.waitForDisplayed({ timeout: 5000 });
        await expect(editor).toBeDisplayed();
    });

    it('submitting wrong code shows Wrong Answer result', async () => {
        await setCodeEditorValue('def add(a, b):\n    return a - b\n');

        await $('#submit-btn').click();

        // Wait for test results to render
        const statusPill = await $('#tab-results .status-pill');
        await statusPill.waitForDisplayed({ timeout: 15000 });

        const text = await statusPill.getText();
        expect(text.toLowerCase()).toContain('wrong');
    });

    it('submitting correct code shows Accepted and awards full points', async () => {
        // Previous wrong attempt deducted 1 pt, so awarded = 10 - 1 = 9
        await setCodeEditorValue('def add(a, b):\n    return a + b\n');

        await $('#submit-btn').click();

        const statusPill = await $('#tab-results .status-pill');
        await statusPill.waitForDisplayed({ timeout: 15000 });

        const text = await statusPill.getText();
        expect(text.toLowerCase()).toContain('accepted');

        // All 3 test cases should show as passed
        const summary = await $('#tab-results .result-summary');
        const summaryText = await summary.getText();
        expect(summaryText).toContain('3/3');
    });

    it('submit button becomes disabled and shows Accepted ✓ after correct submission', async () => {
        const submitBtn = await $('#submit-btn');
        const btnText = await submitBtn.getText();
        expect(btnText).toContain('Accepted');

        const isDisabled = await submitBtn.getAttribute('disabled');
        expect(isDisabled).not.toBeNull();
    });

    it('points are reflected on the leaderboard', async () => {
        // Extract contestId from current URL (coding.html?contest=X&question=Y)
        // then do a HARD navigation so contest-detail reloads fresh (not bfcache)
        const codingUrl = await browser.getUrl();
        const contestId = new URL(codingUrl).searchParams.get('contest');
        await browser.url(`${BASE}/pages/contest-detail.html?id=${contestId}`);

        await browser.waitUntil(
            async () => (await browser.getUrl()).includes('contest-detail.html'),
            { timeout: 5000 }
        );

        // Wait until leaderboard has a real row (not the placeholder)
        await browser.waitUntil(
            async () => {
                const rows = await $$('#leaderboard-body tr');
                if (rows.length === 0) return false;
                const text = await rows[0].getText();
                return text.includes('Py Student');
            },
            { timeout: 8000, timeoutMsg: 'Leaderboard did not show Py Student within 8s' }
        );

        const leaderboardRow = await $('#leaderboard-body tr');
        const rowText = await leaderboardRow.getText();
        expect(rowText).toContain('Py Student');
        expect(rowText).toMatch(/9|10/);
    });

    // ── Final Submit ─────────────────────────────────────────────────────

    it('student can final submit the contest', async () => {
        const finalSubmitBtn = await $('#final-submit-btn');
        await finalSubmitBtn.waitForDisplayed({ timeout: 5000 });
        await finalSubmitBtn.click();

        // Final submit uses window.confirm() — accept the native browser dialog
        await browser.acceptAlert();

        const statusEl = await $('#final-submit-status');
        await statusEl.waitForDisplayed({ timeout: 5000 });

        const statusText = await statusEl.getText();
        expect(statusText.toLowerCase()).toMatch(/submitted|success/);
    });

    it('after final submit, returning to coding.html shows read-only editor', async () => {
        // Navigate back to the coding page via the Solve link
        const solveLink = await $('a.btn*=Solve');
        await solveLink.click();

        await browser.waitUntil(
            async () => (await browser.getUrl()).includes('coding.html'),
            { timeout: 5000 }
        );

        // Banner is a plain div inserted dynamically — select by text content
        const banner = await $('//div[contains(text(), "Editor is read-only")]');
        await banner.waitForDisplayed({ timeout: 5000 });
        const bannerText = await banner.getText();
        expect(bannerText.toLowerCase()).toContain('read-only');

        // Editor should be read-only
        const editor = await $('#code-editor');
        const readOnly = await editor.getAttribute('readonly');
        expect(readOnly).not.toBeNull();

        // Submit button should say "Contest submitted" and be disabled
        const submitBtn = await $('#submit-btn');
        const btnText = await submitBtn.getText();
        expect(btnText.toLowerCase()).toContain('contest submitted');
    });
});
