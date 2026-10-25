-- Align databases created from the old beantrack.sql dump (and older clones of
-- this repo) with the current API. Safe to run more than once.
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS source ENUM('hardware','simulated') NOT NULL DEFAULT 'hardware' AFTER mode,
  ADD COLUMN IF NOT EXISTS status ENUM('Completed','Partial','Error') NOT NULL DEFAULT 'Completed' AFTER processing_time,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE batches
  MODIFY COLUMN status ENUM('Completed','Partial','Error') NOT NULL DEFAULT 'Completed',
  MODIFY COLUMN batch_code VARCHAR(20) NOT NULL,
  MODIFY COLUMN vibration_speed DECIMAL(5,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN input_weight DECIMAL(10,2) NOT NULL,
  MODIFY COLUMN large_weight DECIMAL(10,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN medium_weight DECIMAL(10,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN small_weight DECIMAL(10,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN fine_weight DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE accuracy_checks
  ADD COLUMN IF NOT EXISTS checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
