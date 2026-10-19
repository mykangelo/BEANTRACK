<?php
// Usage: env BEANTRACK_DB_PASS='...' /opt/lampp/bin/php migrate.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit(); }

require __DIR__ . '/db.php';

$conn->query("CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(64) PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");

// Strip comments, then split into single statements
function split_sql(string $sql): array {
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $parts = array_map('trim', explode(';', $sql));
    return array_values(array_filter($parts, fn($p) => $p !== ''));
}

$files = glob(__DIR__ . '/migrations/*.sql');
sort($files);

foreach ($files as $file) {
    $version = basename($file, '.sql');

    $stmt = $conn->prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
    $stmt->bind_param("s", $version);
    $stmt->execute();
    $already = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($already) {
        echo "skip     $version\n";
        continue;
    }

    foreach (split_sql(file_get_contents($file)) as $i => $sql) {
        try {
            $conn->query($sql);
        } catch (mysqli_sql_exception $e) {
            exit("FAILED $version at statement " . ($i + 1) . ":\n$sql\n\n" . $e->getMessage() . "\n");
        }
    }

    $stmt = $conn->prepare("INSERT INTO schema_migrations (version) VALUES (?)");
    $stmt->bind_param("s", $version);
    $stmt->execute();
    $stmt->close();
    echo "applied  $version\n";
}

echo "Schema is up to date.\n";