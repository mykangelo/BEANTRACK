<?php
$host = getenv('BEANTRACK_DB_HOST') ?: '127.0.0.1';
$user = getenv('BEANTRACK_DB_USER') ?: 'myklinuxx';
$pass = getenv('BEANTRACK_DB_PASS') ?: '';
$dbname = getenv('BEANTRACK_DB_NAME') ?: 'beantrack';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$conn = new mysqli($host, $user, $pass, $dbname);

if ($conn->connect_error) {
    http_response_code(503);
    echo json_encode(["error" => "Database unavailable. Import beantrack.sql and configure BEANTRACK_DB_* credentials."]);
    exit();
}

$conn->set_charset('utf8mb4');
?>