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

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_purchase_register') {
    $taxFilter = $_GET['tax_filter'] ?? 'all'; // all, sales_tax, non_sales_tax
    $vendorTypeId = $_GET['vendor_type_id'] ?? '';
    $vendorId = $_GET['vendor_id'] ?? '';
    $employeeId = $_GET['employee_id'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';

    $sql = "
        SELECT 
            pi.id,
            pi.serial_no as invoice_no,
            DATE_FORMAT(pi.invoice_date, '%d-%b-%y') as invoice_date,
            cl.name as vendor_name,
            itm.code as item_code,
            COALESCE(pii.description, itm.name) as item_name,
            COALESCE(pii.quantity, 0) as quantity,
            pii.unit as unit,
            COALESCE(pii.rate, 0) as rate,
            COALESCE(pii.net_amount, 0) as amount_excl_tax,
            COALESCE(pii.sales_tax_amount, 0) as sales_tax,
            COALESCE(pii.further_tax_amount, 0) as further_tax,
            (COALESCE(pii.net_amount, 0) + COALESCE(pii.sales_tax_amount, 0) + COALESCE(pii.further_tax_amount, 0)) as amount_incl_tax
        FROM purchase_invoices pi
        LEFT JOIN coa_list cl ON pi.vendor_coa_id = cl.id
        INNER JOIN purchase_invoice_items pii ON pi.id = pii.invoice_id
        LEFT JOIN inv_items itm ON pii.item_coa_id = itm.id
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

    $sql .= " ORDER BY pi.invoice_date ASC, pi.serial_no ASC, pii.id ASC";

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

