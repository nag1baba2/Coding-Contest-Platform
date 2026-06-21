const { uniqueEmail, register, login, logout, clearSession, setDateTimeInputValue } = require('../helpers');
const { promoteToAdmin } = require('../dbHelper');

// This spec is deliberately slow (it waits through a real wall-clock
// window for a contest to transition from upcoming -> active) because
// it's the one test that proves the time-gating logic end-to-end
// through actual time passing, not a simulated date. Everything else
// (unit tests, integration tests) tests this logic with a fake "now" -
// this is the one place it's tested for real.
describe('Time-gating: contest transitions from upcoming to active', () => {
    let adminEmail;
    let studentEmail;
    let contestName;

    before(async () => {
        adminEmail = uniqueEmail('timegate_admin');
        studentEmail = uniqueEmail('timegate_student');
        contestName = `Time-Gate Test ${Date.now()}`;

        await clearSession();
        await register('Timegate Admin', adminEmail, 'password123');
        await logout();
        await promoteToAdmin(adminEmail);

        await login(adminEmail, 'password123');

        await $('#new-contest-btn').click();
        await $('#contest-modal-overlay').waitForDisplayed({ timeout: 5000 });
        await $('#contest-name').setValue(contestName);

        // datetime-local inputs only support minute precision in most
        // browsers, not seconds - so "starts soon" here really means
        // "starts at the start of next minute," which could be
        // anywhere from a few seconds to ~60 seconds away depending on
        // when this test happens to run. The polling wait later in
        // this spec accounts for that uncertainty rather than assuming
        // an exact offset.
        const now = new Date();
        const start = new Date(now.getTime() + 60 * 1000);
        const end = new Date(now.getTime() + 60 * 60 * 1000);
        const toLocalInput = (d) => {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        await setDateTimeInputValue('#contest-start', toLocalInput(start));
        await setDateTimeInputValue('#contest-end', toLocalInput(end));
        await $('#contest-form button[type="submit"]').click();
        await $('#contest-modal-overlay').waitForDisplayed({ reverse: true, timeout: 5000 });

        await logout();
        await register('Timegate Student', studentEmail, 'password123');
    });

    it('shows the contest as Upcoming before its start time', async () => {
        const card = await $(`.contest-card*=${contestName}`);
        await card.waitForDisplayed({ timeout: 5000 });
        const pill = await card.$('.status-pill');
        const text = (await pill.getText()).toLowerCase();
        // Accept either - minute-precision rounding means this could
        // occasionally already show "live" depending on exact timing.
        // That's an acceptable, documented flake risk for a genuine
        // wall-clock test rather than a silently hidden one.
        expect(['upcoming', 'live']).toContain(text);
    });

    it('blocks problem access when opened before the contest starts', async function () {
        const card = await $(`.contest-card*=${contestName}`);
        const pill = await card.$('.status-pill');
        const status = (await pill.getText()).toLowerCase();

        if (status !== 'upcoming') {
            // Already flipped active by the time we got here for this
            // run - this specific assertion doesn't apply. The next
            // test still proves the same boundary from the other side.
            this.skip();
        }

        await card.click();
        const lockedMessage = await $('#locked-title');
        await lockedMessage.waitForDisplayed({ timeout: 5000 });
        const text = await lockedMessage.getText();
        expect(text.toLowerCase()).toContain("hasn't started");
    });

    it('automatically unlocks problems once the start time passes, without a manual page reload', async () => {
        // Still on the contest-detail page from the previous test, with
        // the live countdown running. This is the real test: does the
        // frontend notice the active transition on its own (via the
        // ticking timer's onStatusChange callback), or does it require
        // a manual refresh to pick up the new state?
        await browser.waitUntil(
            async () => {
                const classAttr = await $('#contest-body').getAttribute('class');
                return !classAttr.includes('hidden');
            },
            {
                timeout: 90000, // generous - covers minute-boundary rounding plus the 1s tick interval
                interval: 1000,
                timeoutMsg: 'Contest body did not unlock within 90s of waiting for the start time to pass',
            }
        );

        const bodyEl = await $('#contest-body');
        await expect(bodyEl).not.toHaveElementClass('hidden');
    });
});
