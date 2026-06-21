const express = require('express');
const router = express.Router();
const {
    createContest,
    listContests,
    getContest,
    updateContest,
    deleteContest,
} = require('../controllers/contestController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.post('/', requireAuth, requireAdmin, createContest);
router.get('/', requireAuth, listContests);
router.get('/:id', requireAuth, getContest);
router.put('/:id', requireAuth, requireAdmin, updateContest);
router.delete('/:id', requireAuth, requireAdmin, deleteContest);

module.exports = router;
