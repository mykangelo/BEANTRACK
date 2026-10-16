<?php
require 'db.php';

$result = $conn->query("SELECT * FROM batches ORDER BY id DESC");
if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => "Unable to load batches."]);
    exit();
}
$batches = [];
while ($row = $result->fetch_assoc()) {
    $batches[] = $row;
}
echo json_encode($batches);
$conn->close();
?>