const express = require('express');
const router = express.Router();
const { getLeaderboard, getContestStats } = require('../controllers/leaderboardController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Leaderboard is visible to everyone logged in (students want to see
// rankings too, not just admin).
router.get('/contest/:contestId/leaderboard', requireAuth, getLeaderboard);

// Stats are admin-only (participant counts, most/least solved -
// not something students need access to per the JD spec).
router.get('/contest/:contestId/stats', requireAuth, requireAdmin, getContestStats);

module.exports = router;
