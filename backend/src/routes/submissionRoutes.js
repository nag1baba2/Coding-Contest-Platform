const express = require('express');
const router = express.Router();
const {
    submitAnswer,
    submitCode,
    getMySubmissions,
    getContestSubmissions,
    getSubmissionLimit,
} = require('../controllers/submissionController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireActiveContest } = require('../middleware/contestTime');

router.post('/contest/:contestId', requireAuth, requireActiveContest, submitAnswer);
router.post('/code/contest/:contestId', requireAuth, requireActiveContest, submitCode);
router.get('/contest/:contestId/mine', requireAuth, getMySubmissions);
router.get('/contest/:contestId/limit', requireAuth, getSubmissionLimit);
router.get('/contest/:contestId/all', requireAuth, requireAdmin, getContestSubmissions);

module.exports = router;
