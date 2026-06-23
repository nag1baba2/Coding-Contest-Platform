// WebDriverIO provides `expect`, `$`, and `browser` as globals when run
// via the wdio test runner - no explicit import needed for those.
const { BASE, uniqueEmail, register, login, logout, clearSession } = require('../helpers');
const { cleanupTestData } = require('../dbHelper');

describe('Authentication', () => {
    beforeEach(async () => {
        await clearSession();
    });

    after(async () => {
        await cleanupTestData([
            'student_%@e2e.test',
            'dup_%@e2e.test',
            'login_%@e2e.test',
            'wrongpw_%@e2e.test',
            'logout_%@e2e.test',
        ]);
    });

    it('registers a new student and lands on the contests page', async () => {
        const email = uniqueEmail('student');
        await register('E2E Student', email, 'password123');

        const url = await browser.getUrl();
        expect(url).toContain('contests.html');

        // The student's name should appear in the topbar - confirms
        // the session was actually set, not just a lucky redirect.
        const nameEl = await $('#user-name');
        await expect(nameEl).toHaveText('E2E Student');
    });

    it('shows an error for a duplicate email registration', async () => {
        const email = uniqueEmail('dup');
        await register('First User', email, 'password123');
        await logout();

        await browser.url(`${BASE}/pages/register.html`);
        await $('#name').setValue('Second User');
        await $('#email').setValue(email);
        await $('#password').setValue('password456');
        await $('#register-form button[type="submit"]').click();

        const alertBox = await $('#alert-box .alert-error');
        await alertBox.waitForDisplayed({ timeout: 5000 });
        const text = await alertBox.getText();
        expect(text.toLowerCase()).toContain('already');
    });

    it('logs in with valid credentials', async () => {
        const email = uniqueEmail('login');
        await register('Login Test', email, 'password123');
        await logout();

        await login(email, 'password123');

        const url = await browser.getUrl();
        expect(url).toContain('contests.html');
    });

    it('shows an error for wrong password', async () => {
        const email = uniqueEmail('wrongpw');
        await register('Wrong PW Test', email, 'password123');
        await logout();

        await browser.url(`${BASE}/pages/login.html`);
        await $('#email').setValue(email);
        await $('#password').setValue('totallywrongpassword');
        await $('#login-form button[type="submit"]').click();

        const alertBox = await $('#alert-box .alert-error');
        await alertBox.waitForDisplayed({ timeout: 5000 });
        const text = await alertBox.getText();
        expect(text.length).toBeGreaterThan(0);
    });

    it('logs out and redirects to login', async () => {
        const email = uniqueEmail('logout');
        await register('Logout Test', email, 'password123');
        await logout();

        const url = await browser.getUrl();
        expect(url).toContain('login.html');
    });

    it('redirects an unauthenticated visitor away from a protected page', async () => {
        await clearSession();
        await browser.url(`${BASE}/pages/contests.html`);

        await browser.waitUntil(async () => (await browser.getUrl()).includes('login.html'), {
            timeout: 5000,
            timeoutMsg: 'Unauthenticated visit to contests.html should redirect to login.html',
        });
    });
});
