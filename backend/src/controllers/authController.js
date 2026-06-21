const pool = require('../config/db');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');

// Students self-register. Admin accounts are seeded directly in the DB
// (see config/seed.sql) - no open admin registration endpoint, since
// this is a small private-group app and that's an unnecessary attack
// surface for what it's worth here.
async function register(req, res, next) {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email, and password are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = await hashPassword(password);
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [name, email, passwordHash, 'student']
        );

        const user = { id: result.insertId, role: 'student' };
        const token = generateToken(user);

        res.status(201).json({
            token,
            user: { id: user.id, name, email, role: 'student' },
        });
    } catch (err) {
        next(err);
    }
}

async function login(req, res, next) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        // Same error for "no such user" and "wrong password" - don't
        // reveal which one it was, that leaks whether an email is registered.
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = rows[0];
        const passwordMatches = await comparePassword(password, user.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = generateToken(user);

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { register, login };
