<?php
// Local overrides live in config.local.php (ignored by git) so credentials never
// need to be committed. Copy config.local.example.php to config.local.php.
$config = [];
$configFile = __DIR__ . '/config.local.php';
if (is_file($configFile)) {
    $loaded = require $configFile;
    if (is_array($loaded)) $config = $loaded;
}

$host   = $config['host']  ?? (getenv('BEANTRACK_DB_HOST') ?: '127.0.0.1');
$user   = $config['user']  ?? (getenv('BEANTRACK_DB_USER') ?: 'beantrack');
$pass   = $config['pass']  ?? (getenv('BEANTRACK_DB_PASS') ?: '');
$dbname = $config['name']  ?? (getenv('BEANTRACK_DB_NAME') ?: 'beantrack');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-BeanTrack-Token");
header("Content-Type: application/json");

if (PHP_SAPI !== 'cli' && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Optional shared secret. Set BEANTRACK_API_TOKEN on the server and
// VITE_API_TOKEN on the frontend to enable it. This is a LAN speed bump,
// not real authentication.
$apiToken = $config['token'] ?? (getenv('BEANTRACK_API_TOKEN') ?: '');
if ($apiToken !== '' && PHP_SAPI !== 'cli') {
    $sent = $_SERVER['HTTP_X_BEANTRACK_TOKEN'] ?? '';
    if (!hash_equals($apiToken, (string)$sent)) {
        http_response_code(401);
        echo json_encode(["error" => "Unauthorized. Set VITE_API_TOKEN to match BEANTRACK_API_TOKEN."]);
        exit();
    }
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $conn = new mysqli($host, $user, $pass, $dbname);
} catch (mysqli_sql_exception $e) {
    http_response_code(503);
    echo json_encode(["error" => "Database unavailable. Check config.local.php or BEANTRACK_DB_* settings."]);
    exit();
}
$conn->set_charset('utf8mb4');
