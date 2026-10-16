<?php
require 'db.php';

$result = $conn->query("SELECT batch_code, bin_name, beans_checked, correctly_sorted FROM accuracy_checks ORDER BY id ASC");
if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => "Unable to load accuracy checks."]);
    exit();
}

$checks = [];
while ($row = $result->fetch_assoc()) {
    $checks[] = $row;
}

echo json_encode($checks);
$conn->close();
?>
