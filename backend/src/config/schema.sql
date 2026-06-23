-- Coding Contest Platform - Schema

CREATE DATABASE IF NOT EXISTS contest_platform;
USE contest_platform;

-- ============ USERS ============
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'student') NOT NULL DEFAULT 'student',
    status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    total_points INT NOT NULL DEFAULT 0,
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
-- (MAX(id) per student+question), not by deleting old rows.
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

-- ============ CONTEST REGISTRATIONS ============
-- Users must register before a contest starts to participate.
-- no_submission_penalty_applied tracks the one-time -10 deduction
-- for users who registered but never submitted (applied lazily at contest end).
CREATE TABLE contest_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    contest_id INT NOT NULL,
    registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    no_submission_penalty_applied TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_registration (user_id, contest_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);
