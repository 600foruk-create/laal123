<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_items') {
    $company_id = $_GET['company_id'] ?? 1;
    try {
        $stmt = $pdo->prepare("SELECT id, code, name FROM inv_items WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL)  ORDER BY name");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC)); exit;
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]); exit;
    }
} elseif ($action === 'get_data') {
    $company_id = $_GET['company_id'] ?? 1;
    $item_coa_id = $_GET['item_coa_id'] ?? null;
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
            si.id as invoice_id,
            si.serial_no as invoice_no,
            si.invoice_date,
            cl.name as customer_name,
            COALESCE(sii.pieces, 0) as pieces,
            COALESCE(sii.quantity, 0) as quantity,
            sii.unit,
            COALESCE(sii.rate, 0) as rate,
            COALESCE(sii.gross_amount, (sii.quantity * sii.rate)) as gross_amount,
            COALESCE(sii.discount_amount, 0) as discount_amount,
            ((sii.quantity * sii.rate) - COALESCE(sii.discount_amount, 0)) as amount_excl_tax,
            COALESCE(sii.sales_tax_amount, 0) as sales_tax,
            COALESCE(sii.further_tax_amount, 0) as fur_tax,
            COALESCE(sii.net_amount, 0) as amount_incl_tax
        FROM sale_invoices si
        INNER JOIN sale_invoice_items sii ON si.id = sii.invoice_id
        LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
        LEFT JOIN customers c ON c.coa_list_id = cl.id
        WHERE si.company_id = ? AND si.is_cancelled = 0
    ";
    
    $params = [$company_id];

    if ($item_coa_id) {
        $sql .= " AND sii.item_coa_id = ?";
        $params[] = $item_coa_id;
    }

    if ($customer_coa_id) {
        $sql .= " AND si.customer_coa_id = ?";
        $params[] = $customer_coa_id;
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

    if ($department_id) {
        $sql .= " AND si.department_id = ?";
        $params[] = $department_id;
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

    $sql .= " ORDER BY si.invoice_date ASC, si.serial_no ASC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['error' => false, 'data' => $results]);
    } catch (PDOException $e) {
        echo json_encode(['error' => true, 'message' => $e->getMessage()]);
    }
}

