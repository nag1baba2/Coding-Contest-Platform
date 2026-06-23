const pool = require('../config/db');

async function listUsers(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, email, role, status, total_points, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function deleteUser(req, res, next) {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        if (rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot delete admin accounts' });

        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (err) {
        next(err);
    }
}

async function blockUser(req, res, next) {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        if (rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot block admin accounts' });

        await pool.query("UPDATE users SET status = 'blocked' WHERE id = ?", [id]);
        res.json({ message: 'User blocked' });
    } catch (err) {
        next(err);
    }
}

async function unblockUser(req, res, next) {
    const { id } = req.params;
    try {
        await pool.query("UPDATE users SET status = 'active' WHERE id = ?", [id]);
        res.json({ message: 'User unblocked' });
    } catch (err) {
        next(err);
    }
}

module.exports = { listUsers, deleteUser, blockUser, unblockUser };
