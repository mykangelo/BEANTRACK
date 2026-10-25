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

-- Green bean stock movements.
-- receipt: positive grams (beans received)
-- sort_in: negative grams (beans taken by a sorting batch)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  movement_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bean_type     VARCHAR(20) NOT NULL,
  movement_type ENUM('receipt','sort_in') NOT NULL,
  grams         DECIMAL(12,2) NOT NULL,
  batch_code    VARCHAR(20) NULL,
  note          VARCHAR(255) NULL,
  CONSTRAINT chk_grams_nonzero CHECK (grams <> 0),
  CONSTRAINT fk_moves_bean FOREIGN KEY (bean_type) REFERENCES bean_types(code),
  CONSTRAINT fk_moves_batch FOREIGN KEY (batch_code) REFERENCES batches(batch_code) ON DELETE RESTRICT,
  UNIQUE KEY uq_batch_move (batch_code, movement_type),
  INDEX idx_stock (bean_type)
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
