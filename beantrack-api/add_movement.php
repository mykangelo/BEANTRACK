<?php
require __DIR__ . '/db.php';

function fail($code, $msg, $detail = null) {
    if ($detail !== null) error_log("add_movement: $detail");
    http_response_code($code);
    echo json_encode(["success" => false, "error" => $msg]);
    exit();
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid JSON.');

$bean  = trim((string)($in['bean_type'] ?? ''));
$type  = trim((string)($in['movement_type'] ?? ''));
$grams = round((float)($in['grams'] ?? 0), 2);
$note  = substr(trim((string)($in['note'] ?? '')), 0, 255);

if (!in_array($bean, ['Arabica', 'Robusta'], true)) fail(400, 'Unknown bean type.');
if ($type !== 'receipt') {
    fail(400, 'Only receipts can be recorded. Stock leaves automatically when a batch is sorted.');
}
if ($grams <= 0) fail(400, 'Weight must be above 0 g.');

try {
    $stmt = $conn->prepare(
        "INSERT INTO inventory_movements (bean_type, movement_type, grams, note)
         VALUES (?, 'receipt', ?, ?)"
    );
    $stmt->bind_param("sds", $bean, $grams, $note);
    $stmt->execute();
    $id = $conn->insert_id;
    $stmt->close();
} catch (Throwable $e) {
    fail(500, 'Could not save receipt.', $e->getMessage());
}

echo json_encode(["success" => true, "id" => $id]);