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

// Totals: beans received and beans sent to sorting
$totals = [];
foreach ($beans as $b) $totals[$b] = ['received' => 0.0, 'sorted' => 0.0];

$res = $conn->query("SELECT bean_type, movement_type, SUM(grams) AS g
                     FROM inventory_movements GROUP BY bean_type, movement_type");
while ($r = $res->fetch_assoc()) {
    $b = $r['bean_type'];
    if (!isset($totals[$b])) continue;
    if ($r['movement_type'] === 'receipt') $totals[$b]['received'] += (float)$r['g'];
    if ($r['movement_type'] === 'sort_in') $totals[$b]['sorted']   += -(float)$r['g'];
}

// Latest 100 movements for the log
$moves = [];
$res = $conn->query("SELECT movement_date, bean_type, movement_type, grams, batch_code, note
                     FROM inventory_movements ORDER BY id DESC LIMIT 100");
while ($r = $res->fetch_assoc()) {
    $r['grams'] = (float)$r['grams'];
    $moves[] = $r;
}

echo json_encode(["stock" => $stock, "totals" => $totals, "movements" => $moves]);