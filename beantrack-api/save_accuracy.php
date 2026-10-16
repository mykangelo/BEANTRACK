<?php
require 'db.php';

$data = json_decode(file_get_contents("php://input"), true);
$batchCode = trim((string) ($data['batch_code'] ?? ''));
$bins = $data['bins'] ?? null;
$allowedBins = ['large', 'medium', 'debris'];

if ($batchCode === '' || !is_array($bins)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid accuracy data."]);
    exit();
}

$conn->begin_transaction();
$statement = $conn->prepare("INSERT INTO accuracy_checks (batch_code, bin_name, beans_checked, correctly_sorted) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE beans_checked = VALUES(beans_checked), correctly_sorted = VALUES(correctly_sorted)");
$valid = true;

foreach ($allowedBins as $bin) {
    $checked = (float) ($bins[$bin]['checked'] ?? -1);
    $correct = (float) ($bins[$bin]['correct'] ?? -1);
    if ($checked < 0 || $correct < 0 || $correct > $checked) {
        $valid = false;
        break;
    }
    $statement->bind_param('ssdd', $batchCode, $bin, $checked, $correct);
    if (!$statement->execute()) {
        $valid = false;
        break;
    }
}

$statement->close();
if ($valid) {
    $conn->commit();
    echo json_encode(["success" => true]);
} else {
    $conn->rollback();
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid accuracy values."]);
}

$conn->close();
?>
