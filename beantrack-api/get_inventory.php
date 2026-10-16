<?php
require 'db.php';

$result = $conn->query("SELECT * FROM inventory");
if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => "Unable to load inventory."]);
    exit();
}
$inventory = [];
while ($row = $result->fetch_assoc()) {
    $inventory[] = $row;
}
echo json_encode($inventory);
$conn->close();
?>