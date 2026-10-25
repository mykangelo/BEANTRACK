<?php
require __DIR__ . '/db.php';

// Full movement history, used by the Inventory exports. The interactive
// get_inventory.php response is capped so the dashboard stays small.
$result = $conn->query(
    "SELECT m.movement_date, m.bean_type, m.movement_type, m.grams, m.batch_code,
            m.reference_code, m.note, m.stock_batch_id, sb.label AS stock_batch_label
     FROM inventory_movements m
     JOIN stock_batches sb ON sb.id = m.stock_batch_id
     ORDER BY m.id DESC LIMIT 10000"
);
if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => "Unable to load movements."]);
    exit();
}

$movements = [];
while ($row = $result->fetch_assoc()) {
    $row['grams'] = (float)$row['grams'];
    $row['stock_batch_id'] = (int)$row['stock_batch_id'];
    $movements[] = $row;
}
echo json_encode($movements);
