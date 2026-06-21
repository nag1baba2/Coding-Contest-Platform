const express = require('express');
const router = express.Router();
const {
    submitAnswer,
    getMySubmissions,
    getContestSubmissions,
} = require('../controllers/submissionController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireActiveContest } = require('../middleware/contestTime');

// Student: submit an answer. Gated by requireActiveContest - this is
// THE critical time-gating enforcement point for writes. Route uses
// :contestId so the middleware can find it.
router.post(
    '/contest/:contestId',
    requireAuth,
    requireActiveContest,
    submitAnswer
);

// Student: view own submission history for a contest (no time gate -
// you should be able to review past attempts after the contest ends).
router.get('/contest/:contestId/mine', requireAuth, getMySubmissions);

// Admin: view all submissions for a contest.
router.get(
    '/contest/:contestId/all',
    requireAuth,
    requireAdmin,
    getContestSubmissions
);

module.exports = router;
