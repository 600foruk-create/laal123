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
        $where .= " AND si.customer_coa_id = ?"; 
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
            customer_name,
            MAX(employee_name) as employee_name,
            SUM(invoice_amount) as invoice_amount,
            SUM(amt_received) as amt_received,
            SUM(sale_returns) as sale_returns,
            SUM(wh_tax) as wh_tax,
            SUM(flood_tax) as flood_tax,
            SUM(sales_tax) as sales_tax,
            SUM(advance_adjusted) as advance_adjusted,
            SUM(discount) as discount
        FROM (
            SELECT 
                si.serial_no,
                si.customer_coa_id,
                COALESCE(cl.name, c.contact_person) as customer_name,
                COALESCE(e.name, '') as employee_name,
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
            LEFT JOIN employees e ON c.acc_manager_id = e.id
            WHERE $where
            GROUP BY si.id, si.serial_no, si.customer_coa_id
        ) as sub
        GROUP BY customer_name
        ORDER BY customer_name ASC
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
