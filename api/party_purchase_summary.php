<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_vendor_categories') {
    try {
        $sql = "SELECT id, name FROM coa_sub WHERE company_id = ? AND main_id IN (
                    SELECT id FROM coa_main WHERE company_id = ? AND (
                        code = '210'
                    )
                )";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $company_id]);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_party_purchase_summary') {
    $taxFilter = $_GET['tax_filter'] ?? 'all'; // all, sales_tax, non_sales_tax
    $vendorTypeId = $_GET['vendor_type_id'] ?? '';
    $vendorId = $_GET['vendor_id'] ?? '';
    $employeeId = $_GET['employee_id'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';

    $sql = "
        SELECT 
            cl.id as vendor_id,
            cl.code as vendor_code,
            cl.name as vendor_name,
            COUNT(DISTINCT pi.id) as no_of_invoices,
            COALESCE(SUM(inv_sums.amount_excl_tax), 0) as amount_excl_tax,
            COALESCE(SUM(inv_sums.sales_tax), 0) as sales_tax,
            COALESCE(SUM(inv_sums.further_tax), 0) as further_tax,
            COALESCE(SUM(pi.carriage_freight), 0) as carriage_freight,
            COALESCE(SUM(pi.net_total), 0) as amount_incl_tax
        FROM purchase_invoices pi
        INNER JOIN coa_list cl ON pi.vendor_coa_id = cl.id
        LEFT JOIN (
            SELECT 
                invoice_id,
                SUM(net_amount) as amount_excl_tax,
                SUM(sales_tax_amount) as sales_tax,
                SUM(further_tax_amount) as further_tax
            FROM purchase_invoice_items
            GROUP BY invoice_id
        ) as inv_sums ON pi.id = inv_sums.invoice_id
        WHERE pi.company_id = ? AND pi.is_cancelled = 0 AND pi.is_posted = 1
    ";
    
    $params = [$company_id];

    if ($taxFilter === 'sales_tax') {
        $sql .= " AND pi.is_tax_invoice = 1";
    } elseif ($taxFilter === 'non_sales_tax') {
        $sql .= " AND pi.is_tax_invoice = 0";
    }

    if ($vendorTypeId !== '' && $vendorTypeId !== 'all') {
        $sql .= " AND cl.sub_id = ?";
        $params[] = $vendorTypeId;
    }

    if ($vendorId !== '') {
        $sql .= " AND pi.vendor_coa_id = ?";
        $params[] = $vendorId;
    }

    if ($employeeId !== '') {
        $sql .= " AND pi.employee_ref = ?";
        $params[] = $employeeId;
    }

    if ($dateFrom !== '') {
        $sql .= " AND pi.invoice_date >= ?";
        $params[] = $dateFrom;
    }

    if ($dateTo !== '') {
        $sql .= " AND pi.invoice_date <= ?";
        $params[] = $dateTo;
    }

    $sql .= " GROUP BY pi.vendor_coa_id ORDER BY cl.name ASC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendResponse($results);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>

