<?php
require __DIR__ . '/db.php';
require __DIR__ . '/stock_helpers.php';

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "error" => $msg]);
    exit();
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid JSON.');

$code   = trim((string)($in['batch_code'] ?? ''));
$bean   = trim((string)($in['bean_type'] ?? ''));
$mode   = trim((string)($in['mode'] ?? ''));
$source = trim((string)($in['source'] ?? 'hardware'));
$status = trim((string)($in['status'] ?? 'Completed'));
$vib    = (float)($in['vibration_speed'] ?? 0);
$input  = round((float)($in['input_weight'] ?? 0), 2);
$large  = round((float)($in['large_weight'] ?? 0), 2);
$medium = round((float)($in['medium_weight'] ?? 0), 2);
$small  = round((float)($in['small_weight'] ?? 0), 2);
$fine   = round((float)($in['fine_weight'] ?? 0), 2);
$time   = (int)($in['processing_time'] ?? 0);

if ($code === '' || strlen($code) > 20) fail(400, 'Invalid batch code.');
if (!in_array($bean, ['Arabica', 'Robusta'], true)) fail(400, 'Unknown bean type.');
if (!in_array($mode, ['Manual', 'Automatic'], true)) fail(400, 'Unknown mode.');
if (!in_array($source, ['hardware', 'simulated'], true)) fail(400, 'Unknown batch source.');
if (!in_array($status, ['Completed', 'Partial', 'Error'], true)) fail(400, 'Unknown batch status.');
if ($vib < 0 || $vib > 100) fail(400, 'Vibration speed must be 0 to 100.');
if ($input <= 0) fail(400, 'Input weight must be above 0 g.');
if (min($large, $medium, $small, $fine) < 0 || $time < 0) fail(400, 'Weights and time cannot be negative.');

$conn->begin_transaction();
try {
    // Serialize stock mutations per bean type.
    lock_bean($conn, $bean);
    lock_stock_batches($conn);

    $onHand = stock_on_hand($conn, $bean);
    if ($onHand + 0.005 < $input) {
        throw new RuntimeException(
            "Not enough $bean green beans: " . round($onHand) . " g on hand, $input g needed."
        );
    }

    $stmt = $conn->prepare("INSERT INTO batches
        (batch_code, date_time, bean_type, mode, source, status, vibration_speed, input_weight,
         large_weight, medium_weight, small_weight, fine_weight, processing_time)
        VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssssddddddi", $code, $bean, $mode, $source, $status, $vib, $input,
                      $large, $medium, $small, $fine, $time);
    $stmt->execute();
    $stmt->close();

    // The actual input weight is consumed FIFO across the oldest stock batches.
    // A run may span layers; each allocation is one sort_in movement.
    $allocations = consume_fifo(
        $conn, $bean, $input, 'sort_in', $code, null, "Sorting batch $code"
    );

    $conn->commit();
    echo json_encode([
        "success" => true,
        "batch_code" => $code,
        "allocations" => $allocations,
    ]);
} catch (mysqli_sql_exception $e) {
    $conn->rollback();
    if ($e->getCode() === 1062) fail(409, "Batch $code is already saved.");
    fail(500, 'Could not save batch.');
} catch (RuntimeException $e) {
    $conn->rollback();
    fail(409, $e->getMessage());
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not save batch.');
}
