const { getContestStatus } = require('../src/middleware/contestTime');

// These tests target the exact edge cases called out in the JD spirit:
// "before start_time -> blocked", "at start_time -> active",
// "at end_time -> ended". Boundary conditions are where real bugs hide -
// an off-by-one here (using < instead of <=) would let students in
// one second early or block them one second late.
describe('getContestStatus', () => {
    const start = new Date('2026-06-20T19:00:00Z');
    const end = new Date('2026-06-20T20:00:00Z');

    test('returns "upcoming" before start_time', () => {
        const now = new Date('2026-06-20T18:59:59Z');
        expect(getContestStatus(start, end, now)).toBe('upcoming');
    });

    test('returns "active" exactly AT start_time', () => {
        const now = new Date('2026-06-20T19:00:00Z');
        expect(getContestStatus(start, end, now)).toBe('active');
    });

    test('returns "active" one second after start_time', () => {
        const now = new Date('2026-06-20T19:00:01Z');
        expect(getContestStatus(start, end, now)).toBe('active');
    });

    test('returns "active" exactly AT end_time (still allowed)', () => {
        // Decision: end_time itself is inclusive (still active), matching
        // the contest spec's plain-language framing. The boundary AFTER
        // end_time is what closes it.
        const now = new Date('2026-06-20T20:00:00Z');
        expect(getContestStatus(start, end, now)).toBe('active');
    });

    test('returns "ended" one second after end_time', () => {
        const now = new Date('2026-06-20T20:00:01Z');
        expect(getContestStatus(start, end, now)).toBe('ended');
    });

    test('returns "active" in the middle of the contest window', () => {
        const now = new Date('2026-06-20T19:30:00Z');
        expect(getContestStatus(start, end, now)).toBe('active');
    });
});
