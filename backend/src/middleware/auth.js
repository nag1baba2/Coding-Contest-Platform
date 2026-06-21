const { verifyToken } = require('../utils/auth');

// Verifies JWT and attaches decoded user info to req.user.
// Any route behind this middleware can trust req.user.id and req.user.role.
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = verifyToken(token);
        req.user = decoded; // { id, role }
        next();
    } catch (err) {
        // Covers both expired and tampered/invalid tokens.
        // Same error message for both - don't leak which case it was.
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Must run AFTER requireAuth, since it depends on req.user being set.
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = { requireAuth, requireAdmin };
