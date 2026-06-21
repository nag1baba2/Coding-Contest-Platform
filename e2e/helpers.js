// ============================================================
// Shared helpers for E2E specs - login/register/logout flows used
// across multiple test files. Centralizing selectors here means a
// frontend ID change only needs updating in one place.
// ============================================================

const BASE = 'http://localhost:8080';

function uniqueEmail(prefix) {
    return `${prefix}_${Date.now()}@e2e.test`;
}

async function register(name, email, password) {
    await browser.url(`${BASE}/pages/register.html`);
    await $('#name').setValue(name);
    await $('#email').setValue(email);
    await $('#password').setValue(password);
    await $('#register-form button[type="submit"]').click();
    await browser.waitUntil(async () => (await browser.getUrl()).includes('contests.html'), {
        timeout: 8000,
        timeoutMsg: 'Registration did not redirect to contests.html in time',
    });
}

async function login(email, password) {
    await browser.url(`${BASE}/pages/login.html`);
    await $('#email').setValue(email);
    await $('#password').setValue(password);
    await $('#login-form button[type="submit"]').click();
    await browser.waitUntil(
        async () => {
            const url = await browser.getUrl();
            return url.includes('contests.html') || url.includes('admin.html');
        },
        { timeout: 8000, timeoutMsg: 'Login did not redirect in time' }
    );
}

async function logout() {
    const logoutBtn = await $('#logout-btn');
    await logoutBtn.click();
    await browser.waitUntil(async () => (await browser.getUrl()).includes('login.html'), {
        timeout: 5000,
        timeoutMsg: 'Logout did not redirect to login.html in time',
    });
}

async function setDateTimeInputValue(selector, value) {
    await browser.execute(
        (sel, val) => {
            const el = document.querySelector(sel);
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        selector,
        value
    );
}

async function clearSession() {
    const url = await browser.getUrl();
    if (!url.startsWith(BASE)) {
        await browser.url(`${BASE}/pages/login.html`);
    }
    await browser.execute(() => sessionStorage.clear());
}

module.exports = { BASE, uniqueEmail, register, login, logout, clearSession, setDateTimeInputValue };
