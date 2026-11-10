<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_data') {
    $company_id = $_GET['company_id'] ?? 1;
    $invoice_type_filter = $_GET['invoice_type_filter'] ?? 'all'; // all, tax, non_tax
    $customer_coa_id = $_GET['customer_coa_id'] ?? null;
    $customer_type_id = $_GET['customer_type_id'] ?? null;
    $region_id = $_GET['region_id'] ?? null;
    $sub_region_id = $_GET['sub_region_id'] ?? null;
    $business_sector_id = $_GET['business_sector_id'] ?? null;
    $department_id = $_GET['department_id'] ?? null;
    $employee_id = $_GET['employee_id'] ?? null;
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    $sql = "
        SELECT 
            cl.id as customer_id,
            cl.code as customer_code,
            cl.name as customer_name,
            COUNT(si.id) as no_of_invoices,
            SUM(inv_sums.amount_excl_tax) - SUM(si.additional_discount) as amount_excl_tax,
            SUM(inv_sums.sales_tax) as sales_tax,
            SUM(inv_sums.further_tax) as further_tax,
            SUM(si.carriage_freight) as carriage_fr,
            SUM(si.net_total) as amount_incl_tax
        FROM sale_invoices si
        LEFT JOIN (
            SELECT 
                invoice_id, 
                SUM(gross_amount - discount_amount) as amount_excl_tax,
                SUM(sales_tax_amount) as sales_tax,
                SUM(further_tax_amount) as further_tax
            FROM sale_invoice_items
            GROUP BY invoice_id
        ) inv_sums ON inv_sums.invoice_id = si.id
        LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
        LEFT JOIN customers c ON c.coa_list_id = cl.id
        WHERE si.company_id = ? AND si.is_cancelled = 0
    ";
    
    $params = [$company_id];

    if ($invoice_type_filter === 'tax') {
        $sql .= " AND COALESCE(si.is_tax_invoice, 0) = 1 AND (si.invoice_type != 'POS' OR si.invoice_type IS NULL) AND (si.pos_invoice_no IS NULL OR si.pos_invoice_no = '')";
    } elseif ($invoice_type_filter === 'non_tax') {
        $sql .= " AND COALESCE(si.is_tax_invoice, 0) = 0 AND (si.invoice_type != 'POS' OR si.invoice_type IS NULL) AND (si.pos_invoice_no IS NULL OR si.pos_invoice_no = '')";
    } elseif ($invoice_type_filter === 'pos') {
        $sql .= " AND (si.invoice_type = 'POS' OR (si.pos_invoice_no IS NOT NULL AND si.pos_invoice_no != ''))";
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

    // si.department_id doesn't exist in schema, removing filter to prevent error
    // if ($department_id) {
    //     $sql .= " AND si.department_id = ?";
    //     $params[] = $department_id;
    // }

    if ($employee_id) {
        // Mapping employee to Account Manager on customer
        $sql .= " AND c.acc_manager_id = ?";
        $params[] = $employee_id;
    }
    
    if ($from_date && $to_date) {
        $sql .= " AND si.invoice_date BETWEEN ? AND ?";
        $params[] = $from_date;
        $params[] = $to_date;
    }

    $sql .= " GROUP BY cl.id, cl.code, cl.name ORDER BY cl.name ASC";

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
