-- BeanTrack database schema.
--
-- This file is a convenience dump that matches beantrack-api/migrations/*.sql.
-- The migrations are the source of truth: on a new machine prefer
--
--   php beantrack-api/migrate.php
--
-- from the repository root (see README.md). Import this file through
-- phpMyAdmin only if you cannot run PHP from the command line.
--
-- It contains no sample batches. Record green bean receipts on the Inventory
-- page before sorting.

SET NAMES utf8mb4;

-- --------------------------------------------------------
-- Schema version tracking (matches migrate.php)
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(64) PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES
  ('0001_baseline'),
  ('0002_inventory'),
  ('0003_batch_audit'),
  ('0004_stock_batches');

-- --------------------------------------------------------
-- Tables
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS bean_types (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO bean_types (code, name) VALUES ('Arabica', 'Arabica'), ('Robusta', 'Robusta');

CREATE TABLE IF NOT EXISTS batches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  batch_code      VARCHAR(20) NOT NULL UNIQUE,
  date_time       DATETIME NOT NULL,
  bean_type       VARCHAR(20) NOT NULL,
  mode            VARCHAR(20) NOT NULL,
  source          ENUM('hardware','simulated') NOT NULL DEFAULT 'hardware',
  vibration_speed DECIMAL(5,2) NOT NULL DEFAULT 0,
  input_weight    DECIMAL(10,2) NOT NULL,
  large_weight    DECIMAL(10,2) NOT NULL DEFAULT 0,
  medium_weight   DECIMAL(10,2) NOT NULL DEFAULT 0,
  small_weight    DECIMAL(10,2) NOT NULL DEFAULT 0,
  fine_weight     DECIMAL(10,2) NOT NULL DEFAULT 0,
  processing_time INT NOT NULL DEFAULT 0,
  status          ENUM('Completed','Partial','Error') NOT NULL DEFAULT 'Completed',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batches_bean FOREIGN KEY (bean_type) REFERENCES bean_types(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Dated stock batches: FIFO layers of green beans. New receipts go into the
-- active layer; sorting and manual deductions consume the oldest layer first.
CREATE TABLE IF NOT EXISTS stock_batches (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(40) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active  TINYINT(1) NOT NULL DEFAULT 0,
  note       VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stock_batch_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- A fresh install still needs one active layer to receive the first receipt.
INSERT INTO stock_batches (label, started_at, is_active, note)
SELECT 'Opening stock (migrated)', NOW(), 1, 'Created by the initial import'
WHERE NOT EXISTS (SELECT 1 FROM stock_batches);

-- Green bean stock movements.
-- receipt:    positive grams (beans received)
-- sort_in:    negative grams (beans taken by a sorting batch)
-- adjustment: positive or negative manual correction, with a reason
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  movement_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bean_type       VARCHAR(20) NOT NULL,
  stock_batch_id  INT NOT NULL,
  movement_type   ENUM('receipt','sort_in','adjustment') NOT NULL,
  grams           DECIMAL(12,2) NOT NULL,
  batch_code      VARCHAR(20) NULL,
  reference_code  VARCHAR(32) NULL,
  note            VARCHAR(255) NULL,
  CONSTRAINT chk_grams_nonzero CHECK (grams <> 0),
  CONSTRAINT fk_moves_bean FOREIGN KEY (bean_type) REFERENCES bean_types(code),
  CONSTRAINT fk_moves_batch FOREIGN KEY (batch_code) REFERENCES batches(batch_code) ON DELETE RESTRICT,
  CONSTRAINT fk_moves_stock_batch FOREIGN KEY (stock_batch_id) REFERENCES stock_batches(id),
  -- One sorting run can consume from several layers, hence stock_batch_id.
  UNIQUE KEY uq_batch_stock_move (batch_code, stock_batch_id, movement_type),
  INDEX idx_stock (bean_type),
  INDEX idx_moves_stock_batch (stock_batch_id, bean_type),
  INDEX idx_moves_reference (reference_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS accuracy_checks (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  batch_code       VARCHAR(20) NOT NULL,
  bin_name         ENUM('large','medium') NOT NULL,
  beans_checked    DECIMAL(10,2) NOT NULL,
  correctly_sorted DECIMAL(10,2) NOT NULL,
  checked_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accuracy (batch_code, bin_name),
  CONSTRAINT fk_accuracy_batch FOREIGN KEY (batch_code) REFERENCES batches(batch_code) ON DELETE CASCADE,
  CONSTRAINT chk_accuracy CHECK (correctly_sorted >= 0 AND correctly_sorted <= beans_checked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Views
-- --------------------------------------------------------

-- Stock on hand per bean type (green beans only)
CREATE OR REPLACE VIEW v_stock AS
SELECT bean_type, SUM(grams) AS grams
FROM inventory_movements
GROUP BY bean_type;

-- Per-stock-batch totals (receipts, sortings, adjustments, balance)
CREATE OR REPLACE VIEW v_stock_batches AS
SELECT
  sb.id,
  sb.label,
  sb.started_at,
  sb.is_active,
  sb.note,
  COALESCE(SUM(CASE WHEN m.movement_type = 'receipt'    THEN m.grams END), 0) AS received_g,
  COALESCE(-SUM(CASE WHEN m.movement_type = 'sort_in'    THEN m.grams END), 0) AS sorted_g,
  COALESCE(SUM(CASE WHEN m.movement_type = 'adjustment' THEN m.grams END), 0) AS adjusted_g,
  COALESCE(SUM(m.grams), 0) AS balance_g
FROM stock_batches sb
LEFT JOIN inventory_movements m ON m.stock_batch_id = sb.id
GROUP BY sb.id, sb.label, sb.started_at, sb.is_active, sb.note;

-- Audited manual corrections only
CREATE OR REPLACE VIEW v_stock_adjustments AS
SELECT
  m.id,
  m.movement_date,
  m.bean_type,
  m.grams,
  m.reference_code,
  m.note,
  m.stock_batch_id,
  sb.label AS stock_batch_label
FROM inventory_movements m
JOIN stock_batches sb ON sb.id = m.stock_batch_id
WHERE m.movement_type = 'adjustment';

-- Per-batch loss
CREATE OR REPLACE VIEW v_batch_loss AS
SELECT
  batch_code,
  bean_type,
  mode,
  date_time,
  input_weight,
  large_weight + medium_weight AS recovered_g,
  input_weight - (large_weight + medium_weight) AS loss_g,
  ROUND((input_weight - (large_weight + medium_weight)) / input_weight * 100, 1) AS loss_pct
FROM batches
WHERE input_weight > 0;
