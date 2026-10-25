<?php
require __DIR__ . '/db.php';

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "error" => $msg]);
    exit();
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid JSON.');

$batchCode = trim((string)($in['batch_code'] ?? ''));
$bins      = $in['bins'] ?? null;

if ($batchCode === '' || !is_array($bins)) fail(400, 'Invalid accuracy data.');

// Only the two weighed decks have accuracy checks
$rows = [];
foreach (['large', 'medium'] as $bin) {
    $checked = isset($bins[$bin]['checked']) ? (float)$bins[$bin]['checked'] : -1;
    $correct = isset($bins[$bin]['correct']) ? (float)$bins[$bin]['correct'] : -1;
    if ($checked < 0 || $correct < 0 || $correct > $checked) {
        fail(400, "Invalid values for $bin.");
    }
    $rows[] = [$bin, $checked, $correct];
}

// Check explicitly instead of relying on a foreign key: legacy databases that
// were upgraded by 0003_batch_audit.sql may not have one on this table.
$exists = $conn->prepare("SELECT 1 FROM batches WHERE batch_code = ?");
$exists->bind_param("s", $batchCode);
$exists->execute();
$exists->store_result();
$found = $exists->num_rows > 0;
$exists->close();
if (!$found) fail(404, 'Batch not found.');

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("INSERT INTO accuracy_checks (batch_code, bin_name, beans_checked, correctly_sorted)
                            VALUES (?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                              beans_checked = VALUES(beans_checked),
                              correctly_sorted = VALUES(correctly_sorted)");
    foreach ($rows as [$bin, $checked, $correct]) {
        $stmt->bind_param("ssdd", $batchCode, $bin, $checked, $correct);
        $stmt->execute();
    }
    $stmt->close();
    $conn->commit();
    echo json_encode(["success" => true]);
} catch (mysqli_sql_exception $e) {
    $conn->rollback();
    if ($e->getCode() === 1452) fail(404, 'Batch not found.');
    fail(500, 'Could not save accuracy.');
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not save accuracy.');
}