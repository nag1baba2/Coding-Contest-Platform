const { isAnswerCorrect } = require('../src/controllers/submissionController');

// Scoring rule, as locked in the spec: trim whitespace, case-sensitive
// otherwise. These tests exist specifically to pin that rule down -
// without them, a future "helpful" refactor (e.g. someone adding
// .toLowerCase()) would silently change scoring behavior for every
// past contest.
describe('isAnswerCorrect', () => {
    test('exact match is correct', () => {
        expect(isAnswerCorrect('[0,1]', '[0,1]')).toBe(true);
    });

    test('leading/trailing whitespace is trimmed and still correct', () => {
        expect(isAnswerCorrect('  [0,1]  ', '[0,1]')).toBe(true);
        expect(isAnswerCorrect('[0,1]', '  [0,1]  ')).toBe(true);
    });

    test('different case is INCORRECT (case-sensitive rule)', () => {
        expect(isAnswerCorrect('[0,1]', '[0,1]')).toBe(true); // sanity
        expect(isAnswerCorrect('TRUE', 'true')).toBe(false);
    });

    test('internal whitespace differences are NOT trimmed (only edges are)', () => {
        // "trim whitespace" means edges only - this is a deliberate
        // scope decision, not an oversight. Internal spacing like
        // "[0, 1]" vs "[0,1]" is still a mismatch under this rule.
        expect(isAnswerCorrect('[0, 1]', '[0,1]')).toBe(false);
    });

    test('empty submission against non-empty expected output is incorrect', () => {
        expect(isAnswerCorrect('', '[0,1]')).toBe(false);
    });

    test('empty submission against empty expected output is correct', () => {
        expect(isAnswerCorrect('   ', '')).toBe(true);
    });
});
