-- Run this AFTER schema.sql, and AFTER generating a bcrypt hash for
-- your chosen admin password (see backend/src/utils/hashPassword.js
-- helper script, or just register a user normally and run an UPDATE
-- to flip their role to 'admin' - that's actually the simplest path
-- for V1 since you have no admin-registration endpoint).

-- Example (replace the hash with a real bcrypt hash before running):
-- INSERT INTO users (name, email, password_hash, role)
-- VALUES ('Admin', 'admin@contest.local', '$2b$10$REPLACE_ME', 'admin');

-- Simplest real workflow:
-- 1. POST /api/auth/register with your own details (creates a 'student')
-- 2. Manually run: UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
