-- Stock on hand per bean type (green beans only)
CREATE OR REPLACE VIEW v_stock AS
SELECT bean_type, SUM(grams) AS grams
FROM inventory_movements
GROUP BY bean_type;

-- Per-batch loss, used by Batch history later
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