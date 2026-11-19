<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;



if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_item_categories') {
    try {
        $stmt = $pdo->prepare("SELECT id, name FROM inv_main_categories WHERE company_id = ? ORDER BY name");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_item_sub_categories') {
    try {
        $mainId = $_GET['main_id'] ?? 0;
        $sql = "SELECT id, name FROM inv_sub_categories WHERE company_id = ?";
        $params = [$company_id];
        if ($mainId > 0) {
            $sql .= " AND main_id = ?";
            $params[] = $mainId;
        }
        $sql .= " ORDER BY name";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

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
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_report_data') {
    $taxFilter = $_GET['tax_filter'] ?? 'all'; // all, sales_tax, non_sales_tax
    $itemCategoryId = $_GET['item_category_id'] ?? '';
    $itemSubCategoryId = $_GET['item_sub_category_id'] ?? '';
    $vendorTypeId = $_GET['vendor_type_id'] ?? '';
    $vendorId = $_GET['vendor_id'] ?? '';
    $employeeId = $_GET['employee_id'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';

    $piWhere = "pi.company_id = ? AND pi.is_cancelled = 0";
    $params = [$company_id];

    if ($taxFilter === 'sales_tax') {
        $piWhere .= " AND pi.is_tax_invoice = 1";
    } elseif ($taxFilter === 'non_sales_tax') {
        $piWhere .= " AND pi.is_tax_invoice = 0";
    }

    if ($itemCategoryId !== '' && $itemCategoryId !== 'all') {
        $piWhere .= " AND sub.main_id = ?";
        $params[] = $itemCategoryId;
    }
    
    if ($itemSubCategoryId !== '' && $itemSubCategoryId !== 'all') {
        $piWhere .= " AND itm.sub_id = ?";
        $params[] = $itemSubCategoryId;
    }

    if ($vendorTypeId !== '' && $vendorTypeId !== 'all') {
        $piWhere .= " AND cl.sub_id = ?";
        $params[] = $vendorTypeId;
    }

    if ($vendorId !== '') {
        $piWhere .= " AND pi.vendor_coa_id = ?";
        $params[] = $vendorId;
    }

    if ($employeeId !== '') {
        $piWhere .= " AND pi.employee_ref = ?";
        $params[] = $employeeId;
    }

    if ($dateFrom !== '') {
        $piWhere .= " AND pi.invoice_date >= ?";
        $params[] = $dateFrom;
    }
    if ($dateTo !== '') {
        $piWhere .= " AND pi.invoice_date <= ?";
        $params[] = $dateTo;
    }

    try {
        $sql = "
            SELECT 
                itm.id as item_id,
                itm.code as item_code,
                COALESCE(pii.description, itm.name) as item_name,
                MAX(pii.unit) as unit,
                SUM(COALESCE(pii.quantity, 0)) as total_quantity,
                SUM(COALESCE(pii.net_amount, 0)) as total_amount,
                MIN(COALESCE(pii.rate, 0)) as min_rate,
                MAX(COALESCE(pii.rate, 0)) as max_rate,
                AVG(COALESCE(pii.rate, 0)) as avg_rate
            FROM purchase_invoices pi
            INNER JOIN purchase_invoice_items pii ON pi.id = pii.invoice_id
            INNER JOIN inv_items itm ON pii.item_coa_id = itm.id
            LEFT JOIN inv_sub_categories sub ON itm.sub_id = sub.id
            LEFT JOIN coa_list cl ON pi.vendor_coa_id = cl.id
            WHERE $piWhere
            GROUP BY itm.id, itm.code, COALESCE(pii.description, itm.name)
            ORDER BY itm.code ASC
        ";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendResponse($results);

    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

