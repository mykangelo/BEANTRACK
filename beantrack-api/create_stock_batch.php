<?php
require __DIR__ . '/db.php';
require __DIR__ . '/stock_helpers.php';

function fail($code, $msg, $detail = null) {
    if ($detail !== null) error_log("create_stock_batch: $detail");
    http_response_code($code);
    echo json_encode(["success" => false, "error" => $msg]);
    exit();
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid JSON.');

$label = trim((string)($in['label'] ?? ''));
$note  = trim((string)($in['note'] ?? ''));

if (strlen($label) > 40) fail(400, 'Stock batch label is too long.');
if (strlen($note) > 255) fail(400, 'Note is too long.');

$conn->begin_transaction();
try {
    lock_stock_batches($conn);
    $batch = create_stock_batch($conn, $label, $note);
    $conn->commit();
    echo json_encode([
        "success" => true,
        "stock_batch" => $batch,
    ]);
} catch (mysqli_sql_exception $e) {
    $conn->rollback();
    if ($e->getCode() === 1062) {
        fail(409, 'A stock batch with that label already exists.');
    }
    fail(500, 'Could not create the stock batch.', $e->getMessage());
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not create the stock batch.', $e->getMessage());
}
