<?php
// Shared helpers for stock batches, FIFO allocation, and audited adjustments.
// Mutating endpoints call lock_bean() inside a transaction before these.

function stock_on_hand(mysqli $conn, string $bean): float
{
    $stmt = $conn->prepare(
        "SELECT COALESCE(SUM(grams), 0) AS g
         FROM inventory_movements WHERE bean_type = ?"
    );
    $stmt->bind_param("s", $bean);
    $stmt->execute();
    $g = (float)($stmt->get_result()->fetch_assoc()['g'] ?? 0);
    $stmt->close();
    return $g;
}

function lock_bean(mysqli $conn, string $bean): void
{
    $stmt = $conn->prepare("SELECT code FROM bean_types WHERE code = ? FOR UPDATE");
    $stmt->bind_param("s", $bean);
    $stmt->execute();
    $stmt->store_result();
    $found = $stmt->num_rows > 0;
    $stmt->close();
    if (!$found) {
        throw new RuntimeException("Unknown bean type.");
    }
}

function active_stock_batch_id(mysqli $conn): ?int
{
    $res = $conn->query("SELECT id FROM stock_batches WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
    $row = $res ? $res->fetch_assoc() : null;
    return $row ? (int)$row['id'] : null;
}

function stock_batch_exists(mysqli $conn, int $id): bool
{
    $stmt = $conn->prepare("SELECT 1 FROM stock_batches WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $stmt->store_result();
    $found = $stmt->num_rows > 0;
    $stmt->close();
    return $found;
}

function stock_batch_label(mysqli $conn, int $id): ?string
{
    $stmt = $conn->prepare("SELECT label FROM stock_batches WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? (string)$row['label'] : null;
}

// Lock the stock-batch rows in FIFO order. Low-frequency operations such as
// creating a batch use this to serialize against receipts and consumption.
function lock_stock_batches(mysqli $conn): void
{
    $conn->query("SELECT id FROM stock_batches ORDER BY started_at, id FOR UPDATE");
}

// Balances for one bean per stock batch, oldest first. Call after lock_bean().
function fifo_balances(mysqli $conn, string $bean): array
{
    $stmt = $conn->prepare(
        "SELECT sb.id, sb.label, sb.started_at,
                COALESCE(SUM(m.grams), 0) AS balance
         FROM stock_batches sb
         LEFT JOIN inventory_movements m
           ON m.stock_batch_id = sb.id AND m.bean_type = ?
         GROUP BY sb.id, sb.label, sb.started_at
         ORDER BY sb.started_at, sb.id"
    );
    $stmt->bind_param("s", $bean);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

// Insert one movement. grams may be negative.
function insert_stock_movement(
    mysqli $conn,
    string $bean,
    int $stockBatchId,
    string $type,
    float $grams,
    ?string $batchCode,
    ?string $reference,
    ?string $note
): int {
    $stmt = $conn->prepare(
        "INSERT INTO inventory_movements
           (movement_date, bean_type, stock_batch_id, movement_type, grams,
            batch_code, reference_code, note)
         VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param("sisdsss", $bean, $stockBatchId, $type, $grams,
                      $batchCode, $reference, $note);
    $stmt->execute();
    $id = $conn->insert_id;
    $stmt->close();
    return $id;
}

// Consume $amount grams from the oldest positive layers. Inserts one negative
// movement per layer. Returns the allocations, or throws when stock is short.
function consume_fifo(
    mysqli $conn,
    string $bean,
    float $amount,
    string $type,
    ?string $batchCode,
    ?string $reference,
    ?string $note,
    ?int $onlyBatchId = null
): array {
    $remaining = round($amount, 2);
    if ($remaining <= 0) return [];

    $balances = fifo_balances($conn, $bean);
    if ($onlyBatchId !== null) {
        $balances = array_values(array_filter(
            $balances,
            fn($b) => (int)$b['id'] === $onlyBatchId
        ));
    }

    $allocations = [];
    foreach ($balances as $b) {
        if ($remaining <= 0.005) break;
        $balance = round((float)$b['balance'], 2);
        if ($balance <= 0.005) continue;

        $take = round(min($balance, $remaining), 2);
        insert_stock_movement(
            $conn, $bean, (int)$b['id'], $type, -$take,
            $batchCode, $reference, $note
        );
        $allocations[] = [
            'stock_batch_id' => (int)$b['id'],
            'label' => $b['label'],
            'grams' => $take,
        ];
        $remaining = round($remaining - $take, 2);
    }

    if ($remaining > 0.005) {
        $where = $onlyBatchId !== null
            ? 'the selected stock batch'
            : "$bean stock";
        throw new RuntimeException(
            "Not enough stock in $where: " . round($amount) . " g requested, "
            . round($amount - $remaining) . " g available."
        );
    }
    return $allocations;
}

function next_stock_label(mysqli $conn): string
{
    // Use the database clock so labels match movement_date, regardless of the
    // PHP process timezone (XAMPP often leaves PHP on UTC).
    $day = $conn->query("SELECT DATE_FORMAT(NOW(), '%Y%m%d') AS d")->fetch_assoc()['d'];
    $prefix = 'SB-' . $day . '-';
    $like = $prefix . '%';
    $stmt = $conn->prepare("SELECT label FROM stock_batches WHERE label LIKE ?");
    $stmt->bind_param("s", $like);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    // Advance past manual labels too, so a hand-picked suffix cannot collide.
    $max = 0;
    foreach ($rows as $row) {
        if (preg_match('/-(\d+)$/', $row['label'], $m)) {
            $max = max($max, (int)$m[1]);
        }
    }
    return $prefix . str_pad((string)($max + 1), 2, '0', STR_PAD_LEFT);
}

function create_stock_batch(mysqli $conn, ?string $label, ?string $note): array
{
    $conn->query("UPDATE stock_batches SET is_active = 0");

    $label = trim((string)$label);
    if ($label === '') {
        $label = next_stock_label($conn);
    }
    if (strlen($label) > 40) {
        throw new RuntimeException('Stock batch label is too long.');
    }
    $note = substr(trim((string)$note), 0, 255);

    $stmt = $conn->prepare(
        "INSERT INTO stock_batches (label, started_at, is_active, note)
         VALUES (?, NOW(), 1, ?)"
    );
    $stmt->bind_param("ss", $label, $note);
    $stmt->execute();
    $id = $conn->insert_id;
    $stmt->close();

    return ['id' => $id, 'label' => $label, 'note' => $note];
}

function new_reference(mysqli $conn, string $prefix): string
{
    $stamp = $conn->query("SELECT DATE_FORMAT(NOW(), '%Y%m%d-%H%i%s') AS t")->fetch_assoc()['t'];
    return $prefix . '-' . $stamp . '-' . strtoupper(bin2hex(random_bytes(2)));
}
