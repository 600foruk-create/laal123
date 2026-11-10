<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_data') {
    $company_id = $_GET['company_id'] ?? 1;
    $invoice_type_filter = $_GET['invoice_type_filter'] ?? 'all'; // all, tax, non_tax
    $item_category_id = $_GET['item_category_id'] ?? null;
    $item_sub_category_id = $_GET['item_sub_category_id'] ?? null;
    $customer_type_id = $_GET['customer_type_id'] ?? null;
    $customer_coa_id = $_GET['customer_coa_id'] ?? null;
    $region_id = $_GET['region_id'] ?? null;
    $sub_region_id = $_GET['sub_region_id'] ?? null;
    $business_sector_id = $_GET['business_sector_id'] ?? null;
    $department_id = $_GET['department_id'] ?? null;
    $employee_id = $_GET['employee_id'] ?? null;
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    $sql = "
        SELECT 
            itm.id as item_id,
            itm.code as item_code,
            itm.hs_code,
            COALESCE(sii.description, itm.name) as item_name,
            MAX(sii.unit) as unit,
            SUM(COALESCE(sii.pieces, 0)) as total_pieces,
            SUM(COALESCE(sii.quantity, 0)) as total_quantity,
            SUM(COALESCE(sii.net_amount, 0)) as total_amount,
            MIN(COALESCE(sii.rate, 0)) as min_rate,
            MAX(COALESCE(sii.rate, 0)) as max_rate,
            AVG(COALESCE(sii.rate, 0)) as avg_rate
        FROM sale_invoices si
        INNER JOIN sale_invoice_items sii ON si.id = sii.invoice_id
        INNER JOIN inv_items itm ON sii.item_coa_id = itm.id
        LEFT JOIN inv_sub_categories sub ON itm.sub_id = sub.id
        LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
        LEFT JOIN customers c ON c.coa_list_id = cl.id
        WHERE si.company_id = ? AND si.is_cancelled = 0
    ";
    
    $params = [$company_id];

    if ($invoice_type_filter === 'tax') {
        $sql .= " AND si.is_tax_invoice = 1";
    } elseif ($invoice_type_filter === 'non_tax') {
        $sql .= " AND si.is_tax_invoice = 0";
    }

    if ($item_category_id) {
        $sql .= " AND sub.main_id = ?";
        $params[] = $item_category_id;
    }
    
    if ($item_sub_category_id) {
        $sql .= " AND itm.sub_id = ?";
        $params[] = $item_sub_category_id;
    }

    if ($customer_coa_id) {
        $sql .= " AND si.customer_coa_id = ?";
        $params[] = $customer_coa_id;
    }

    if ($customer_type_id) {
        $sql .= " AND cl.sub_id = ?";
        $params[] = $customer_type_id;
    }

    if ($region_id) {
        $sql .= " AND c.region_id = ?";
        $params[] = $region_id;
    }

    if ($sub_region_id) {
        $sql .= " AND c.sub_region_id = ?";
        $params[] = $sub_region_id;
    }

    if ($business_sector_id) {
        $sql .= " AND c.business_sector_id = ?";
        $params[] = $business_sector_id;
    }

    if ($employee_id) {
        $sql .= " AND si.employee_ref = ?";
        $params[] = $employee_id;
    }

    if ($from_date) {
        $sql .= " AND si.invoice_date >= ?";
        $params[] = $from_date;
    }

    if ($to_date) {
        $sql .= " AND si.invoice_date <= ?";
        $params[] = $to_date;
    }

    $sql .= " GROUP BY itm.id, itm.code, itm.hs_code, COALESCE(sii.description, itm.name)";
    $sql .= " ORDER BY itm.code ASC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['error' => false, 'data' => $results]);
    } catch (PDOException $e) {
        echo json_encode(['error' => true, 'message' => $e->getMessage()]);
    }
}
