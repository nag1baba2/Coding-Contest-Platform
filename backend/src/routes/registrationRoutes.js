const express = require('express');
const router = express.Router();
const {
    registerForContest,
    unregisterFromContest,
    getMyRegistrations,
    getRegistrationStatus,
} = require('../controllers/registrationController');
const { requireAuth } = require('../middleware/auth');

router.get('/mine', requireAuth, getMyRegistrations);
router.get('/contest/:contestId', requireAuth, getRegistrationStatus);
router.post('/contest/:contestId', requireAuth, registerForContest);
router.delete('/contest/:contestId', requireAuth, unregisterFromContest);

module.exports = router;
