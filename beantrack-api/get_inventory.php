<?php
require __DIR__ . '/db.php';

$beans = ['Arabica', 'Robusta'];

// Stock on hand per bean type, from the v_stock view
$stock = array_fill_keys($beans, 0.0);
$res = $conn->query("SELECT bean_type, grams FROM v_stock");
if (!$res) {
    http_response_code(500);
    echo json_encode(["error" => "Unable to load stock."]);
    exit();
}
while ($r = $res->fetch_assoc()) {
    if (isset($stock[$r['bean_type']])) $stock[$r['bean_type']] = (float)$r['grams'];
}

// Totals: beans received, beans sent to sorting, and audited adjustments
$totals = [];
foreach ($beans as $b) $totals[$b] = ['received' => 0.0, 'sorted' => 0.0, 'adjusted' => 0.0];

$res = $conn->query("SELECT bean_type, movement_type, SUM(grams) AS g
                     FROM inventory_movements GROUP BY bean_type, movement_type");
if ($res) {
    while ($r = $res->fetch_assoc()) {
        $b = $r['bean_type'];
        if (!isset($totals[$b])) continue;
        if ($r['movement_type'] === 'receipt')    $totals[$b]['received'] += (float)$r['g'];
        if ($r['movement_type'] === 'sort_in')    $totals[$b]['sorted']   += -(float)$r['g'];
        if ($r['movement_type'] === 'adjustment') $totals[$b]['adjusted'] += (float)$r['g'];
    }
}

// Dated stock batches (FIFO layers) with per-bean breakdowns
$layers = [];
$res = $conn->query(
    "SELECT sb.id, sb.label, sb.started_at, sb.is_active, sb.note,
            m.bean_type,
            COALESCE(SUM(CASE WHEN m.movement_type = 'receipt'    THEN m.grams END), 0) AS received_g,
            COALESCE(-SUM(CASE WHEN m.movement_type = 'sort_in'    THEN m.grams END), 0) AS sorted_g,
            COALESCE(SUM(CASE WHEN m.movement_type = 'adjustment' THEN m.grams END), 0) AS adjusted_g,
            COALESCE(SUM(m.grams), 0) AS balance_g
     FROM stock_batches sb
     LEFT JOIN inventory_movements m ON m.stock_batch_id = sb.id
     GROUP BY sb.id, sb.label, sb.started_at, sb.is_active, sb.note, m.bean_type
     ORDER BY sb.started_at, sb.id"
);
if ($res) {
    while ($r = $res->fetch_assoc()) {
        $id = (int)$r['id'];
        if (!isset($layers[$id])) {
            $layers[$id] = [
                'id' => $id,
                'label' => $r['label'],
                'started_at' => $r['started_at'],
                'is_active' => (int)$r['is_active'] === 1,
                'note' => $r['note'],
                'received' => 0.0,
                'sorted' => 0.0,
                'adjusted' => 0.0,
                'balance' => 0.0,
                'beans' => [],
            ];
        }
        $received = (float)$r['received_g'];
        $sorted   = (float)$r['sorted_g'];
        $adjusted = (float)$r['adjusted_g'];
        $balance  = (float)$r['balance_g'];

        $layers[$id]['received'] += $received;
        $layers[$id]['sorted']   += $sorted;
        $layers[$id]['adjusted'] += $adjusted;
        $layers[$id]['balance']  += $balance;

        if ($r['bean_type'] !== null) {
            $layers[$id]['beans'][$r['bean_type']] = [
                'received' => $received,
                'sorted' => $sorted,
                'adjusted' => $adjusted,
                'balance' => $balance,
            ];
        }
    }
}
$layers = array_values($layers);

$activeId = null;
foreach ($layers as $layer) {
    if ($layer['is_active']) { $activeId = $layer['id']; break; }
}

// Audited adjustments, newest first. FIFO operations that span layers share a
// reference_code, so the UI can show one adjustment with a layer breakdown.
$adjustments = [];
$res = $conn->query(
    "SELECT m.id, m.movement_date, m.bean_type, m.grams, m.reference_code, m.note,
            m.stock_batch_id, sb.label AS stock_batch_label
     FROM inventory_movements m
     JOIN stock_batches sb ON sb.id = m.stock_batch_id
     WHERE m.movement_type = 'adjustment'
     ORDER BY m.id DESC
     LIMIT 500"
);
if ($res) {
    while ($r = $res->fetch_assoc()) {
        $r['id'] = (int)$r['id'];
        $r['grams'] = (float)$r['grams'];
        $r['stock_batch_id'] = (int)$r['stock_batch_id'];
        $adjustments[] = $r;
    }
}

// Recent movement log for the on-screen tables
$movements = [];
$res = $conn->query(
    "SELECT m.movement_date, m.bean_type, m.movement_type, m.grams, m.batch_code,
            m.reference_code, m.note, m.stock_batch_id, sb.label AS stock_batch_label
     FROM inventory_movements m
     JOIN stock_batches sb ON sb.id = m.stock_batch_id
     ORDER BY m.id DESC
     LIMIT 100"
);
if ($res) {
    while ($r = $res->fetch_assoc()) {
        $r['grams'] = (float)$r['grams'];
        $r['stock_batch_id'] = (int)$r['stock_batch_id'];
        $movements[] = $r;
    }
}

echo json_encode([
    "stock" => $stock,
    "totals" => $totals,
    "stock_batches" => $layers,
    "active_stock_batch_id" => $activeId,
    "adjustments" => $adjustments,
    "movements" => $movements,
]);
