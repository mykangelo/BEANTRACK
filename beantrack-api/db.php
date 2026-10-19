<?php
$host   = getenv('BEANTRACK_DB_HOST') ?: '127.0.0.1';
$user   = getenv('BEANTRACK_DB_USER') ?: 'beantrack';
$pass   = getenv('BEANTRACK_DB_PASS') ?: '';
$dbname = getenv('BEANTRACK_DB_NAME') ?: 'beantrack';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if (PHP_SAPI !== 'cli' && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $conn = new mysqli($host, $user, $pass, $dbname);
} catch (mysqli_sql_exception $e) {
    http_response_code(503);
    echo json_encode(["error" => "Database unavailable. Check BEANTRACK_DB_* settings."]);
    exit();
}
$conn->set_charset('utf8mb4');