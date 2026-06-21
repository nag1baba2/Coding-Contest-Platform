-- Coding Contest Platform - Phase 1 Schema

CREATE DATABASE IF NOT EXISTS contest_platform;
USE contest_platform;

-- ============ USERS ============
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'student') NOT NULL DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ CONTESTS ============
CREATE TABLE contests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_contest_times CHECK (end_time > start_time)
);

-- ============ QUESTIONS ============
CREATE TABLE questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contest_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    input_data TEXT,
    expected_output TEXT NOT NULL,
    points INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    CONSTRAINT chk_points_positive CHECK (points > 0)
);

-- ============ SUBMISSIONS ============
-- Every attempt is stored. "Latest counts" logic is handled in queries
-- (MAX(created_at) per student+question), not by deleting old rows.
-- This keeps full submission history while still being easy to score.
CREATE TABLE submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    question_id INT NOT NULL,
    contest_id INT NOT NULL,
    submitted_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    points_awarded INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    INDEX idx_student_question (student_id, question_id),
    INDEX idx_contest (contest_id)
);

-- ============ Helpful view: latest submission per (student, question) ============
-- Used by leaderboard and statistics so scoring logic isn't duplicated
-- across multiple queries.
CREATE VIEW latest_submissions AS
SELECT s.*
FROM submissions s
INNER JOIN (
    SELECT student_id, question_id, MAX(created_at) AS max_created
    FROM submissions
    GROUP BY student_id, question_id
) latest
ON s.student_id = latest.student_id
AND s.question_id = latest.question_id
AND s.created_at = latest.max_created;
