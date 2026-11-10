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

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_payments_report') {
    $docType = $_GET['doc_type'] ?? 'all';
    $vendorTypeId = $_GET['vendor_type_id'] ?? '';
    $vendorId = $_GET['vendor_id'] ?? '';
    $employeeId = $_GET['employee_id'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';

    $unionQueries = [];
    $unionParams = [];

    // 1. Bank Payments
    if ($docType === 'all' || $docType === 'bpv') {
        $whereClause = " bp.company_id = ? AND bp.is_cancelled = 0 ";
        $params = [$company_id];

        if ($vendorId !== '') { $whereClause .= " AND bp.paid_to_coa_id = ? "; $params[] = $vendorId; }
        if ($employeeId !== '') { $whereClause .= " AND bp.employee_id = ? "; $params[] = $employeeId; }
        if ($dateFrom !== '') { $whereClause .= " AND bp.payment_date >= ? "; $params[] = $dateFrom; }
        if ($dateTo !== '') { $whereClause .= " AND bp.payment_date <= ? "; $params[] = $dateTo; }

        $unionQueries[] = "
            SELECT 
                'BPV' as doc_type,
                bp.id as doc_id,
                DATE_FORMAT(bp.payment_date, '%d-%m-%Y') as date_fmt,
                bp.payment_date,
                CONCAT('BPV ', bp.serial_no) as tran_no,
                bp.serial_no,
                bp.paid_to_coa_id as vendor_id,
                vcl.name as vendor_name,
                vcl.sub_id as vendor_sub_id,
                bcl.name as cash_bank_name,
                bp.cheque_no,
                COALESCE(SUM(bpi.paid_amount), 0) as amount_paid,
                COALESCE(SUM(bpi.wht_amount), 0) as wh_tax,
                0 as flood_tax,
                COALESCE(SUM(bpi.gst_amount), 0) as sales_tax,
                COALESCE(SUM(bpi.advance_adjusted), 0) as advance_adj,
                COALESCE(SUM(bpi.discount_received), 0) as discount
            FROM bank_payments bp
            INNER JOIN coa_list vcl ON bp.paid_to_coa_id = vcl.id
            LEFT JOIN coa_list bcl ON bp.cash_account_coa_id = bcl.id
            LEFT JOIN bank_payment_items bpi ON bp.id = bpi.payment_id
            WHERE $whereClause
            GROUP BY bp.id
        ";
        $unionParams = array_merge($unionParams, $params);
    }

    // 2. Cash Payments
    if ($docType === 'all' || $docType === 'cpv') {
        $whereClause = " cp.company_id = ? AND cp.is_cancelled = 0 ";
        $params = [$company_id];

        if ($vendorId !== '') { $whereClause .= " AND cp.paid_to_coa_id = ? "; $params[] = $vendorId; }
        if ($employeeId !== '') { $whereClause .= " AND cp.employee_id = ? "; $params[] = $employeeId; }
        if ($dateFrom !== '') { $whereClause .= " AND cp.payment_date >= ? "; $params[] = $dateFrom; }
        if ($dateTo !== '') { $whereClause .= " AND cp.payment_date <= ? "; $params[] = $dateTo; }

        $unionQueries[] = "
            SELECT 
                'CPV' as doc_type,
                cp.id as doc_id,
                DATE_FORMAT(cp.payment_date, '%d-%m-%Y') as date_fmt,
                cp.payment_date,
                CONCAT('CPV ', cp.serial_no) as tran_no,
                cp.serial_no,
                cp.paid_to_coa_id as vendor_id,
                vcl.name as vendor_name,
                vcl.sub_id as vendor_sub_id,
                ccl.name as cash_bank_name,
                '' as cheque_no,
                COALESCE(SUM(cpi.paid_amount), 0) as amount_paid,
                COALESCE(SUM(cpi.wht_amount), 0) as wh_tax,
                0 as flood_tax,
                COALESCE(SUM(cpi.gst_amount), 0) as sales_tax,
                COALESCE(SUM(cpi.advance_adjusted), 0) as advance_adj,
                COALESCE(SUM(cpi.discount_received), 0) as discount
            FROM cash_payments cp
            INNER JOIN coa_list vcl ON cp.paid_to_coa_id = vcl.id
            LEFT JOIN coa_list ccl ON cp.cash_account_coa_id = ccl.id
            LEFT JOIN cash_payment_items cpi ON cp.id = cpi.payment_id
            WHERE $whereClause
            GROUP BY cp.id
        ";
        $unionParams = array_merge($unionParams, $params);
    }

    // 3. Journal Vouchers
    if ($docType === 'all' || $docType === 'jv') {
        $whereClause = " jv.company_id = ? AND jv.is_cancelled = 0 AND jvi.debit > 0 ";
        $params = [$company_id];

        if ($vendorId !== '') { $whereClause .= " AND jvi.coa_id = ? "; $params[] = $vendorId; }
        if ($employeeId !== '') { $whereClause .= " AND jv.employee_id = ? "; $params[] = $employeeId; }
        if ($dateFrom !== '') { $whereClause .= " AND jv.voucher_date >= ? "; $params[] = $dateFrom; }
        if ($dateTo !== '') { $whereClause .= " AND jv.voucher_date <= ? "; $params[] = $dateTo; }

        $unionQueries[] = "
            SELECT 
                'JV' as doc_type,
                jv.id as doc_id,
                DATE_FORMAT(jv.voucher_date, '%d-%m-%Y') as date_fmt,
                jv.voucher_date as payment_date,
                CONCAT('JV ', jv.serial_no) as tran_no,
                jv.serial_no,
                jvi.coa_id as vendor_id,
                
                -- Swapping logic: If the debited account contains 'Cash' or 'Bank', swap it with the credited account
                IF(LOWER(vcl.name) LIKE '%cash%' OR LOWER(vcl.name) LIKE '%bank%', 
                    (SELECT GROUP_CONCAT(cl2.name SEPARATOR ', ') FROM general_journal_voucher_items jvi2 INNER JOIN coa_list cl2 ON jvi2.coa_id = cl2.id WHERE jvi2.voucher_id = jv.id AND jvi2.credit > 0),
                    vcl.name) as vendor_name,
                    
                vcl.sub_id as vendor_sub_id,
                
                IF(LOWER(vcl.name) LIKE '%cash%' OR LOWER(vcl.name) LIKE '%bank%',
                    vcl.name,
                    (SELECT GROUP_CONCAT(cl2.name SEPARATOR ', ') FROM general_journal_voucher_items jvi2 INNER JOIN coa_list cl2 ON jvi2.coa_id = cl2.id WHERE jvi2.voucher_id = jv.id AND jvi2.credit > 0)
                ) as cash_bank_name,
                
                '' as cheque_no,
                SUM(jvi.debit) as amount_paid,
                0 as wh_tax,
                0 as flood_tax,
                0 as sales_tax,
                0 as advance_adj,
                0 as discount
            FROM general_journal_vouchers jv
            INNER JOIN general_journal_voucher_items jvi ON jv.id = jvi.voucher_id
            INNER JOIN coa_list vcl ON jvi.coa_id = vcl.id
            WHERE $whereClause
            GROUP BY jv.id, jvi.coa_id
        ";
        $unionParams = array_merge($unionParams, $params);
    }

    if (empty($unionQueries)) {
        sendResponse([]);
        exit;
    }

    $combinedQuery = implode(" UNION ALL ", $unionQueries);
    $sql = "SELECT * FROM ($combinedQuery) as combined_payments WHERE 1=1";

    // Apply Vendor Type Filter globally across all unioned results
    if ($vendorTypeId !== '' && $vendorTypeId !== 'all') {
        $sql .= " AND vendor_sub_id = ? ";
        $unionParams[] = $vendorTypeId;
    }

    $sql .= " ORDER BY payment_date ASC, doc_type ASC, serial_no ASC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($unionParams);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendResponse($results);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>
