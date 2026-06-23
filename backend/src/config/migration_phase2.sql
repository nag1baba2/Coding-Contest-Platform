-- Phase 2 migration: run this in MySQL Workbench against contest_platform

USE contest_platform;

-- questions: make expected_output nullable, add language/function_signature/test_cases
ALTER TABLE questions
  MODIFY COLUMN expected_output TEXT DEFAULT NULL,
  ADD COLUMN language ENUM('text', 'python') NOT NULL DEFAULT 'text' AFTER expected_output,
  ADD COLUMN function_signature VARCHAR(255) DEFAULT NULL AFTER language,
  ADD COLUMN test_cases JSON DEFAULT NULL AFTER function_signature;

-- submissions: add test_results column for Python question results
ALTER TABLE submissions
  ADD COLUMN test_results JSON DEFAULT NULL AFTER points_awarded;

-- contest_registrations: add final_submitted columns
ALTER TABLE contest_registrations
  ADD COLUMN final_submitted TINYINT(1) NOT NULL DEFAULT 0 AFTER no_submission_penalty_applied,
  ADD COLUMN final_submitted_at DATETIME DEFAULT NULL AFTER final_submitted;
