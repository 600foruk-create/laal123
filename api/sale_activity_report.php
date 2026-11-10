<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_data') {
    $company_id = $_GET['company_id'] ?? 1;
    
    // Filters
    $customer_type_id = $_GET['customer_type_id'] ?? '';
    $customer_id = $_GET['customer_id'] ?? '';
    $employee_id = $_GET['employee_id'] ?? '';
    $date_from = $_GET['date_from'] ?? '';
    $date_to = $_GET['date_to'] ?? '';

    $where = " si.company_id = ? AND si.is_cancelled = 0 ";
    $params = [$company_id];
    
    if ($customer_type_id) {
        $where .= " AND cl.sub_id = ?";
        $params[] = $customer_type_id;
    }
    if ($customer_id) {
        $where .= " AND si.customer_coa_id = ?"; // Note: we assume customer_id passed here is coa_id since get_all_customers returns coa_id as id mostly. Actually we should use c.id = ? if we joined customer table, but in our case customer_id is usually c.id. Let's use c.id.
        $where .= " AND c.id = ?";
        $params[] = $customer_id;
    }
    if ($employee_id) {
        $where .= " AND c.acc_manager_id = ?";
        $params[] = $employee_id;
    }
    if ($date_from && $date_to) {
        $where .= " AND si.invoice_date BETWEEN ? AND ?";
        $params[] = $date_from;
        $params[] = $date_to;
    }

    $sql = "
        SELECT 
            si.serial_no,
            DATE_FORMAT(MAX(si.invoice_date), '%d-%m-%Y') as formatted_date,
            si.customer_coa_id,
            COALESCE(cl.name, c.contact_person) as customer_name,
            SUM(si.net_total) as invoice_amount,
            
            COALESCE((
                SELECT SUM(cri.received_amount)
                FROM cash_receipt_items cri
                JOIN cash_receipts cr ON cr.id = cri.receipt_id
                WHERE cri.invoice_no = si.serial_no AND cr.received_from_coa_id = si.customer_coa_id AND cr.is_cancelled = 0
            ), 0) + 
            COALESCE((
                SELECT SUM(bri.received_amount)
                FROM bank_receipt_items bri
                JOIN bank_receipts br ON br.id = bri.receipt_id
                WHERE bri.invoice_no = si.serial_no AND br.received_from_coa_id = si.customer_coa_id AND br.is_cancelled = 0
            ), 0) as amt_received,
            
            COALESCE((
                SELECT SUM(sr.net_total)
                FROM sale_returns sr
                WHERE sr.sale_invoice_no = si.serial_no AND sr.customer_coa_id = si.customer_coa_id AND sr.is_cancelled = 0
            ), 0) as sale_returns,
            
            COALESCE((
                SELECT SUM(cri.wht_amount)
                FROM cash_receipt_items cri
                JOIN cash_receipts cr ON cr.id = cri.receipt_id
                WHERE cri.invoice_no = si.serial_no AND cr.received_from_coa_id = si.customer_coa_id AND cr.is_cancelled = 0
            ), 0) + 
            COALESCE((
                SELECT SUM(bri.wht_amount)
                FROM bank_receipt_items bri
                JOIN bank_receipts br ON br.id = bri.receipt_id
                WHERE bri.invoice_no = si.serial_no AND br.received_from_coa_id = si.customer_coa_id AND br.is_cancelled = 0
            ), 0) as wh_tax,
            
            0.00 as flood_tax,
            
            COALESCE((
                SELECT SUM(cri.gst_amount)
                FROM cash_receipt_items cri
                JOIN cash_receipts cr ON cr.id = cri.receipt_id
                WHERE cri.invoice_no = si.serial_no AND cr.received_from_coa_id = si.customer_coa_id AND cr.is_cancelled = 0
            ), 0) + 
            COALESCE((
                SELECT SUM(bri.gst_amount)
                FROM bank_receipt_items bri
                JOIN bank_receipts br ON br.id = bri.receipt_id
                WHERE bri.invoice_no = si.serial_no AND br.received_from_coa_id = si.customer_coa_id AND br.is_cancelled = 0
            ), 0) as sales_tax,

            COALESCE((
                SELECT SUM(cri.advance_adjusted)
                FROM cash_receipt_items cri
                JOIN cash_receipts cr ON cr.id = cri.receipt_id
                WHERE cri.invoice_no = si.serial_no AND cr.received_from_coa_id = si.customer_coa_id AND cr.is_cancelled = 0
            ), 0) + 
            COALESCE((
                SELECT SUM(bri.advance_adjusted)
                FROM bank_receipt_items bri
                JOIN bank_receipts br ON br.id = bri.receipt_id
                WHERE bri.invoice_no = si.serial_no AND br.received_from_coa_id = si.customer_coa_id AND br.is_cancelled = 0
            ), 0) as advance_adjusted,

            COALESCE((
                SELECT SUM(cri.discount_given)
                FROM cash_receipt_items cri
                JOIN cash_receipts cr ON cr.id = cri.receipt_id
                WHERE cri.invoice_no = si.serial_no AND cr.received_from_coa_id = si.customer_coa_id AND cr.is_cancelled = 0
            ), 0) + 
            COALESCE((
                SELECT SUM(bri.discount_given)
                FROM bank_receipt_items bri
                JOIN bank_receipts br ON br.id = bri.receipt_id
                WHERE bri.invoice_no = si.serial_no AND br.received_from_coa_id = si.customer_coa_id AND br.is_cancelled = 0
            ), 0) as discount

        FROM sale_invoices si
        LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
        LEFT JOIN customers c ON c.coa_list_id = cl.id
        WHERE $where
        GROUP BY si.serial_no, si.customer_coa_id
        ORDER BY MAX(si.invoice_date) ASC, si.serial_no ASC
    ";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode($data);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

if ($action === 'get_details') {
    $company_id = $_GET['company_id'] ?? 1;
    $serial_no = $_GET['invoice_no'] ?? '';
    $coa_id = $_GET['coa_id'] ?? '';

    $sql = "
        SELECT 
            MAX(si.id) as record_id,
            'Sale Invoice' as trans_type,
            si.serial_no as voucher_no,
            MAX(si.invoice_date) as order_date,
            DATE_FORMAT(MAX(si.invoice_date), '%d-%m-%Y') as formatted_date,
            SUM(si.net_total) as invoice_amount,
            0.00 as amt_received,
            0.00 as sale_returns,
            0.00 as wh_tax,
            0.00 as flood_tax,
            0.00 as sales_tax,
            0.00 as adv_adj,
            0.00 as discount
        FROM sale_invoices si
        WHERE si.company_id = ? AND si.serial_no = ? AND si.customer_coa_id = ? AND si.is_cancelled = 0
        GROUP BY si.serial_no

        UNION ALL

        SELECT
            cr.id as record_id,
            'Cash Receipt' as trans_type,
            CONCAT('CRV ', cr.serial_no) as voucher_no,
            cr.receipt_date as order_date,
            DATE_FORMAT(cr.receipt_date, '%d-%m-%Y') as formatted_date,
            0.00 as invoice_amount,
            cri.received_amount as amt_received,
            0.00 as sale_returns,
            cri.wht_amount as wh_tax,
            0.00 as flood_tax,
            cri.gst_amount as sales_tax,
            cri.advance_adjusted as adv_adj,
            cri.discount_given as discount
        FROM cash_receipts cr
        JOIN cash_receipt_items cri ON cri.receipt_id = cr.id
        WHERE cr.company_id = ? AND cr.received_from_coa_id = ? AND cri.invoice_no = ? AND cr.is_cancelled = 0

        UNION ALL

        SELECT
            br.id as record_id,
            'Bank Receipt' as trans_type,
            CONCAT('BRV ', br.serial_no) as voucher_no,
            br.receipt_date as order_date,
            DATE_FORMAT(br.receipt_date, '%d-%m-%Y') as formatted_date,
            0.00 as invoice_amount,
            bri.received_amount as amt_received,
            0.00 as sale_returns,
            bri.wht_amount as wh_tax,
            0.00 as flood_tax,
            bri.gst_amount as sales_tax,
            bri.advance_adjusted as adv_adj,
            bri.discount_given as discount
        FROM bank_receipts br
        JOIN bank_receipt_items bri ON bri.receipt_id = br.id
        WHERE br.company_id = ? AND br.received_from_coa_id = ? AND bri.invoice_no = ? AND br.is_cancelled = 0

        UNION ALL

        SELECT
            sr.id as record_id,
            'Sale Return' as trans_type,
            CONCAT('SRV ', sr.serial_no) as voucher_no,
            sr.return_date as order_date,
            DATE_FORMAT(sr.return_date, '%d-%m-%Y') as formatted_date,
            0.00 as invoice_amount,
            0.00 as amt_received,
            sr.net_total as sale_returns,
            0.00 as wh_tax,
            0.00 as flood_tax,
            0.00 as sales_tax,
            0.00 as adv_adj,
            0.00 as discount
        FROM sale_returns sr
        WHERE sr.company_id = ? AND sr.customer_coa_id = ? AND sr.sale_invoice_no = ? AND sr.is_cancelled = 0
        
        ORDER BY order_date ASC
    ";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $company_id, $serial_no, $coa_id,
            $company_id, $coa_id, $serial_no,
            $company_id, $coa_id, $serial_no,
            $company_id, $coa_id, $serial_no
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode($data);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
