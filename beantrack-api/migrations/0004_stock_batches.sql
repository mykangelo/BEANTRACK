-- Dated stock batches (FIFO layers) and audited stock adjustments.
--
-- Existing movements are assigned to one opening batch, so the balances that
-- were already on hand stay exactly the same. Nothing is deleted.

CREATE TABLE IF NOT EXISTS stock_batches (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(40) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active  TINYINT(1) NOT NULL DEFAULT 0,
  note       VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stock_batch_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS stock_batch_id INT NULL AFTER bean_type,
  ADD COLUMN IF NOT EXISTS reference_code VARCHAR(32) NULL AFTER batch_code;

ALTER TABLE inventory_movements
  MODIFY COLUMN movement_type ENUM('receipt','sort_in','adjustment') NOT NULL;

-- One opening layer. The date is the oldest movement so historical rows keep
-- their chronological order.
INSERT IGNORE INTO stock_batches (label, started_at, is_active, note)
SELECT 'Opening stock (migrated)', COALESCE(MIN(movement_date), NOW()), 1,
       'Created by migration 0004 - existing movements were assigned here'
FROM inventory_movements;

UPDATE inventory_movements
SET stock_batch_id = (
  SELECT id FROM stock_batches
  WHERE label = 'Opening stock (migrated)'
  ORDER BY id LIMIT 1
)
WHERE stock_batch_id IS NULL;

ALTER TABLE inventory_movements
  MODIFY COLUMN stock_batch_id INT NOT NULL;

ALTER TABLE inventory_movements
  ADD INDEX IF NOT EXISTS idx_moves_stock_batch (stock_batch_id, bean_type),
  ADD INDEX IF NOT EXISTS idx_moves_reference (reference_code);

-- A sorting run may consume from several stock batches, so the old
-- one-sort_in-per-batch unique key is replaced by one-per-batch-per-layer.
ALTER TABLE inventory_movements
  DROP INDEX IF EXISTS uq_batch_move,
  ADD UNIQUE KEY IF NOT EXISTS uq_batch_stock_move (batch_code, stock_batch_id, movement_type);

-- MariaDB has no ADD CONSTRAINT IF NOT EXISTS, so add the FK only when missing.
-- This keeps the migration safe to re-run after a partial failure.
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_movements'
    AND CONSTRAINT_NAME = 'fk_moves_stock_batch'
);
SET @fk_sql = IF(
  @fk_exists = 0,
  'ALTER TABLE inventory_movements ADD CONSTRAINT fk_moves_stock_batch FOREIGN KEY (stock_batch_id) REFERENCES stock_batches(id)',
  'DO 0'
);
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

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
