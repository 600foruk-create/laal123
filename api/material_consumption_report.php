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

    // --- AUTO CLEANUP DUPLICATE SERIAL NUMBERS ---
    $dupStmt = $pdo->query("SELECT serial_no, company_id, COUNT(*) as cnt FROM material_issue_notes GROUP BY serial_no, company_id HAVING cnt > 1");
    $duplicates = $dupStmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($duplicates as $dup) {
        $s = $pdo->prepare("SELECT id FROM material_issue_notes WHERE serial_no = ? AND company_id = ? ORDER BY id DESC");
        $s->execute([$dup['serial_no'], $dup['company_id']]);
        $ids = $s->fetchAll(PDO::FETCH_COLUMN);
        array_shift($ids); // keep the newest one
        if (!empty($ids)) {
            $delIds = implode(',', $ids);
            $pdo->exec("DELETE FROM material_issue_notes WHERE id IN ($delIds)");
        }
    }
    // ---------------------------------------------

    $sql = "
        SELECT 
            i.code as item_code, 
            i.hs_code as hs_code,
            i.name as item_name, 
            i.unit,
            SUM(mii.qty) as total_qty, 
            SUM(mii.amount) as total_amount
        FROM material_issue_note_items mii
        JOIN material_issue_notes m ON m.id = mii.min_id
        JOIN inv_items i ON mii.item_id = i.id
        LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
        WHERE m.company_id = ? AND m.is_cancelled = 0
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
        $sql .= " AND m.inventory_location_id = ?";
        $params[] = $location_id;
    }
    if ($from_date && $to_date) {
        $sql .= " AND m.date BETWEEN ? AND ?";
        $params[] = $from_date;
        $params[] = $to_date;
    }

    $sql .= " GROUP BY i.id, i.code, i.hs_code, i.name, i.unit ORDER BY i.name ASC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($data);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

echo json_encode(['error' => 'Invalid action']);
