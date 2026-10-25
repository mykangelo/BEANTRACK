<?php
require __DIR__ . '/db.php';
require __DIR__ . '/stock_helpers.php';

function fail($code, $msg, $detail = null) {
    if ($detail !== null) error_log("reset_stock: $detail");
    http_response_code($code);
    echo json_encode(["success" => false, "error" => $msg]);
    exit();
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid JSON.');

$confirm = strtoupper(trim((string)($in['confirm'] ?? '')));
$reason  = trim((string)($in['reason'] ?? ''));
$startNew = !array_key_exists('start_new_batch', $in) || $in['start_new_batch'] !== false;

if ($confirm !== 'RESET') fail(400, 'Type RESET to confirm.');
if (mb_strlen($reason) < 3) fail(400, 'Enter a reason for the reset.');
if (strlen($reason) > 200) fail(400, 'Reason is too long.');

$beans = ['Arabica', 'Robusta'];

$conn->begin_transaction();
try {
    foreach ($beans as $bean) {
        lock_bean($conn, $bean);
    }
    lock_stock_batches($conn);

    $reference = new_reference($conn, 'RST');
    $note = 'Emergency reset: ' . $reason;
    $cleared = [];
    $allocations = [];

    foreach ($beans as $bean) {
        $balance = stock_on_hand($conn, $bean);
        if (abs($balance) < 0.005) continue;

        if ($balance > 0) {
            $taken = consume_fifo(
                $conn, $bean, $balance, 'adjustment', null, $reference, $note
            );
            foreach ($taken as $a) $allocations[] = $a + ['bean_type' => $bean];
        } else {
            // Defensive: a negative balance is corrected back to zero.
            $target = active_stock_batch_id($conn);
            if ($target === null) {
                throw new RuntimeException('No active stock batch. Create a new stock batch first.');
            }
            insert_stock_movement(
                $conn, $bean, $target, 'adjustment', -$balance, null, $reference, $note
            );
        }
        $cleared[$bean] = $balance;
    }

    $newBatch = null;
    if ($startNew) {
        $newBatch = create_stock_batch($conn, null, 'Started after emergency reset');
    }

    $conn->commit();
    echo json_encode([
        "success" => true,
        "reference" => $reference,
        "cleared" => $cleared,
        "allocations" => $allocations,
        "new_stock_batch" => $newBatch,
    ]);
} catch (RuntimeException $e) {
    $conn->rollback();
    fail(409, $e->getMessage());
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not reset stock.', $e->getMessage());
}
