const express = require('express');
const router = express.Router();
const {
    createQuestion,
    listQuestionsForStudent,
    listQuestionsForAdmin,
    updateQuestion,
    deleteQuestion,
} = require('../controllers/questionController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireActiveContest } = require('../middleware/contestTime');

// Admin: manage questions (no time restriction - admin can edit anytime)
router.post('/', requireAuth, requireAdmin, createQuestion);
router.get('/admin/:contestId', requireAuth, requireAdmin, listQuestionsForAdmin);
router.put('/:id', requireAuth, requireAdmin, updateQuestion);
router.delete('/:id', requireAuth, requireAdmin, deleteQuestion);

// Student: view questions - ONLY while contest is active.
// requireActiveContest reads :contestId from the URL, so this route
// must use that param name.
router.get(
    '/contest/:contestId',
    requireAuth,
    requireActiveContest,
    listQuestionsForStudent
);

module.exports = router;
