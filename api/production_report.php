<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_data') {
    $company_id = $_GET['company_id'] ?? 1;
    $category_id = $_GET['category_id'] ?? null;
    $sub_category_id = $_GET['sub_category_id'] ?? null;
    $location_id = $_GET['location_id'] ?? null;
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    // Ensure tables exist before querying
    $pdo->exec("CREATE TABLE IF NOT EXISTS production_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        date DATE NOT NULL,
        reference_no VARCHAR(100),
        inventory_location_id INT,
        job_id INT,
        employee_id INT,
        debit_account_id INT,
        credit_account_id INT,
        remarks TEXT,
        total_pieces DECIMAL(15,2) DEFAULT 0,
        total_qty DECIMAL(15,2) DEFAULT 0,
        total_amount DECIMAL(15,2) DEFAULT 0,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id, serial_no)
    ) ENGINE=InnoDB");

    $pdo->exec("CREATE TABLE IF NOT EXISTS production_note_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pn_id INT NOT NULL,
        item_id INT NOT NULL,
        description TEXT,
        pieces DECIMAL(15,2) DEFAULT 0,
        qty DECIMAL(15,2) DEFAULT 0,
        rate DECIMAL(15,2) DEFAULT 0,
        amount DECIMAL(15,2) DEFAULT 0,
        sort_order INT DEFAULT 0,
        FOREIGN KEY (pn_id) REFERENCES production_notes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB");

    // --- AUTO CLEANUP DUPLICATE SERIAL NUMBERS ---
    $dupStmt = $pdo->query("SELECT serial_no, company_id, COUNT(*) as cnt FROM production_notes GROUP BY serial_no, company_id HAVING cnt > 1");
    $duplicates = $dupStmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($duplicates as $dup) {
        $s = $pdo->prepare("SELECT id FROM production_notes WHERE serial_no = ? AND company_id = ? ORDER BY id DESC");
        $s->execute([$dup['serial_no'], $dup['company_id']]);
        $ids = $s->fetchAll(PDO::FETCH_COLUMN);
        array_shift($ids); // keep the newest one
        if (!empty($ids)) {
            $delIds = implode(',', $ids);
            $pdo->exec("DELETE FROM production_notes WHERE id IN ($delIds)");
        }
    }
    // ---------------------------------------------

    $sql = "
        SELECT 
            i.code as item_code, 
            i.hs_code,
            i.name as item_name, 
            i.unit,
            SUM(pni.pieces) as total_pieces,
            SUM(pni.qty) as total_qty, 
            SUM(pni.amount) as total_amount
        FROM production_note_items pni
        JOIN production_notes pn ON pn.id = pni.pn_id
        JOIN inv_items i ON pni.item_id = i.id
        LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
        WHERE pn.company_id = ? AND pn.is_cancelled = 0
    ";
    
    $params = [$company_id];

    if ($category_id) {
        $sql .= " AND sc.main_id = ?";
        $params[] = $category_id;
    }
    if ($sub_category_id) {
        $sql .= " AND i.sub_id = ?";
        $params[] = $sub_category_id;
    }
    if ($location_id) {
        $sql .= " AND pn.inventory_location_id = ?";
        $params[] = $location_id;
    }
    if ($from_date && $to_date) {
        $sql .= " AND pn.date BETWEEN ? AND ?";
        $params[] = $from_date;
        $params[] = $to_date;
    }

    $sql .= " GROUP BY i.id, i.code, i.hs_code, i.name, i.unit ORDER BY i.name ASC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        file_put_contents(__DIR__ . '/../debug_log.txt', "Rows fetched: " . count($data) . "\n", FILE_APPEND);
        echo json_encode($data);
    } catch (PDOException $e) {
        file_put_contents(__DIR__ . '/../debug_log.txt', "DB Error: " . $e->getMessage() . "\n", FILE_APPEND);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

echo json_encode(['error' => 'Invalid action']);
