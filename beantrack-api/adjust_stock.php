<?php
require __DIR__ . '/db.php';
require __DIR__ . '/stock_helpers.php';

function fail($code, $msg, $detail = null) {
    if ($detail !== null) error_log("adjust_stock: $detail");
    http_response_code($code);
    echo json_encode(["success" => false, "error" => $msg]);
    exit();
}

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'Invalid JSON.');

$bean   = trim((string)($in['bean_type'] ?? ''));
$action = strtolower(trim((string)($in['action'] ?? '')));
$grams  = round((float)($in['grams'] ?? 0), 2);
$note   = trim((string)($in['note'] ?? ''));
$batch  = $in['stock_batch_id'] ?? null;
$batchId = ($batch === null || $batch === '' || (int)$batch === 0) ? null : (int)$batch;

if (!in_array($bean, ['Arabica', 'Robusta'], true)) fail(400, 'Unknown bean type.');
if (!in_array($action, ['subtract', 'add', 'set'], true)) fail(400, 'Unknown adjustment action.');
if (mb_strlen($note) < 3) fail(400, 'Enter a reason for the adjustment.');
if (strlen($note) > 255) fail(400, 'Reason is too long.');
if ($action === 'set') {
    if ($grams < 0) fail(400, 'Target weight cannot be negative.');
    if ($batchId !== null) fail(400, 'Set to always applies to overall stock.');
} elseif ($grams <= 0) {
    fail(400, 'Weight must be above 0 g.');
}
if ($batchId !== null && !stock_batch_exists($conn, $batchId)) {
    fail(404, 'Stock batch not found.');
}

$conn->begin_transaction();
try {
    // Every stock mutation locks the bean row first, so two dashboards cannot
    // spend the same beans. Locking the layers also serializes new batches.
    lock_bean($conn, $bean);
    lock_stock_batches($conn);

    $onHand = stock_on_hand($conn, $bean);
    $reference = new_reference($conn, 'ADJ');
    $allocations = [];
    $change = 0.0;

    if ($action === 'subtract') {
        $allocations = consume_fifo(
            $conn, $bean, $grams, 'adjustment', null, $reference, $note, $batchId
        );
        $change = -$grams;
    } elseif ($action === 'add') {
        $target = $batchId ?? active_stock_batch_id($conn);
        if ($target === null) {
            throw new RuntimeException('No active stock batch. Create a new stock batch first.');
        }
        insert_stock_movement(
            $conn, $bean, $target, 'adjustment', $grams, null, $reference, $note
        );
        $allocations[] = [
            'stock_batch_id' => $target,
            'label' => stock_batch_label($conn, $target),
            'grams' => $grams,
        ];
        $change = $grams;
    } else {
        // "Set to": record the difference, never rewrite history.
        $change = round($grams - $onHand, 2);
        if (abs($change) < 0.005) {
            $conn->commit();
            echo json_encode([
                "success" => true,
                "changed" => false,
                "action" => $action,
                "bean_type" => $bean,
                "on_hand" => $onHand,
                "message" => "$bean stock is already " . round($grams) . " g.",
            ]);
            exit();
        }

        if ($change > 0) {
            $target = active_stock_batch_id($conn);
            if ($target === null) {
                throw new RuntimeException('No active stock batch. Create a new stock batch first.');
            }
            insert_stock_movement(
                $conn, $bean, $target, 'adjustment', $change, null, $reference, $note
            );
            $allocations[] = [
                'stock_batch_id' => $target,
                'label' => stock_batch_label($conn, $target),
                'grams' => $change,
            ];
        } else {
            $allocations = consume_fifo(
                $conn, $bean, -$change, 'adjustment', null, $reference, $note
            );
        }
    }

    $conn->commit();
    echo json_encode([
        "success" => true,
        "changed" => true,
        "reference" => $reference,
        "action" => $action,
        "bean_type" => $bean,
        "change_grams" => $change,
        "on_hand_before" => $onHand,
        "on_hand_after" => round($onHand + $change, 2),
        "allocations" => $allocations,
    ]);
} catch (RuntimeException $e) {
    $conn->rollback();
    fail(409, $e->getMessage());
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, 'Could not adjust stock.', $e->getMessage());
}
