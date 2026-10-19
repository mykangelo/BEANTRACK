<?php
require __DIR__ . '/db.php';

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
if ($vib < 0 || $vib > 100) fail(400, 'Vibration speed must be 0 to 100.');
if ($input <= 0) fail(400, 'Input weight must be above 0 g.');
if (min($large, $medium, $small, $fine) < 0 || $time < 0) fail(400, 'Weights and time cannot be negative.');

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("INSERT INTO batches
        (batch_code, date_time, bean_type, mode, vibration_speed, input_weight,
         large_weight, medium_weight, small_weight, fine_weight, processing_time)
        VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssddddddi", $code, $bean, $mode, $vib, $input,
                      $large, $medium, $small, $fine, $time);
    $stmt->execute();
    $stmt->close();

    // The beans this batch took from green bean stock
    $note = "Sorting batch $code";
    $move = $conn->prepare("INSERT INTO inventory_movements
        (bean_type, movement_type, grams, batch_code, note)
        VALUES (?, 'sort_in', ?, ?, ?)");
    $negative = -$input;
    $move->bind_param("sdss", $bean, $negative, $code, $note);
    $move->execute();
    $move->close();

    $conn->commit();
    echo json_encode(["success" => true, "batch_code" => $code]);
} catch (mysqli_sql_exception $e) {
    $conn->rollback();
    if ($e->getCode() === 1062) fail(409, "Batch $code is already saved.");
    fail(500, 'Could not save batch.');
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not save batch.');
}