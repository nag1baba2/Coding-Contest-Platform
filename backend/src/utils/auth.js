const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, hash) {
    return bcrypt.compare(plainPassword, hash);
}

function generateToken(user) {
    // Keep payload minimal - id and role are all downstream code needs.
    // Don't put email/name in the token; if those change, stale tokens
    // would carry outdated info.
    return jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { hashPassword, comparePassword, generateToken, verifyToken };
