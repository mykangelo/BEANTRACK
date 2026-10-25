<?php
require __DIR__ . '/db.php';
require __DIR__ . '/stock_helpers.php';

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

$conn->begin_transaction();
try {
    lock_bean($conn, $bean);
    lock_stock_batches($conn);
    $stockBatchId = active_stock_batch_id($conn);
    if ($stockBatchId === null) {
        throw new RuntimeException('No active stock batch. Create a new stock batch first.');
    }

    $id = insert_stock_movement(
        $conn, $bean, $stockBatchId, 'receipt', $grams, null, null, $note === '' ? null : $note
    );
    $label = stock_batch_label($conn, $stockBatchId);

    $conn->commit();
    echo json_encode([
        "success" => true,
        "id" => $id,
        "stock_batch_id" => $stockBatchId,
        "stock_batch_label" => $label,
    ]);
} catch (RuntimeException $e) {
    $conn->rollback();
    fail(409, $e->getMessage());
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not save receipt.', $e->getMessage());
}
