const express = require('express');
const router = express.Router();
const { listUsers, deleteUser, blockUser, unblockUser } = require('../controllers/userController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', requireAuth, requireAdmin, listUsers);
router.delete('/:id', requireAuth, requireAdmin, deleteUser);
router.patch('/:id/block', requireAuth, requireAdmin, blockUser);
router.patch('/:id/unblock', requireAuth, requireAdmin, unblockUser);

module.exports = router;
