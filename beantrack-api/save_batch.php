<?php
require 'db.php';

$data = json_decode(file_get_contents("php://input"), true);

$required = ['batch_code', 'bean_type', 'mode', 'vibration_speed', 'input_weight', 'large_weight', 'medium_weight', 'small_weight', 'fine_weight', 'processing_time'];
foreach ($required as $field) {
    if (!isset($data[$field])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Missing field: $field"]);
        exit();
    }
}

$batch_code = trim((string) $data['batch_code']);
$bean_type = trim((string) $data['bean_type']);
$mode = trim((string) $data['mode']);
$vibration_speed = intval($data['vibration_speed']);
$input_weight = intval($data['input_weight']);
$large = intval($data['large_weight']);
$medium = intval($data['medium_weight']);
$small = intval($data['small_weight']);
$fine = intval($data['fine_weight']);
$processing_time = intval($data['processing_time']);

if ($batch_code === '' || !in_array($bean_type, ['Arabica', 'Robusta'], true) || !in_array($mode, ['Manual', 'Automatic'], true) || $vibration_speed < 0 || $vibration_speed > 100 || $input_weight <= 0 || min($large, $medium, $small, $fine, $processing_time) < 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid batch data."]);
    exit();
}

$conn->begin_transaction();
$batch = $conn->prepare("INSERT INTO batches (batch_code, bean_type, mode, vibration_speed, input_weight, large_weight, medium_weight, small_weight, fine_weight, processing_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$batch->bind_param('sssiiiiiii', $batch_code, $bean_type, $mode, $vibration_speed, $input_weight, $large, $medium, $small, $fine, $processing_time);

$ok = $batch->execute();
$batch->close();

if ($ok) {
    $inventory = $conn->prepare("UPDATE inventory SET quantity_kg = quantity_kg + ?, updated_at = CURRENT_TIMESTAMP() WHERE bean_type = ? AND category = ?");
    $categories = ['large' => $large, 'medium' => $medium, 'small' => $small, 'fine' => $fine];
    foreach ($categories as $cat => $grams) {
        $kg = $grams / 1000;
        $inventory->bind_param('dss', $kg, $bean_type, $cat);
        if (!$inventory->execute()) {
            $ok = false;
            break;
        }
    }
    $inventory->close();
}

if ($ok) {
    $conn->commit();
    echo json_encode(["success" => true]);
} else {
    $conn->rollback();
    http_response_code(409);
    echo json_encode(["success" => false, "error" => "Batch could not be saved."]);
}

$conn->close();
?>