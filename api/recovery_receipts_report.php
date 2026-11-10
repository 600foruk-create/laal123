<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_data') {
    $company_id = $_GET['company_id'] ?? 1;
    
    // Filters
    $customer_type_id = $_GET['customer_type_id'] ?? '';
    $customer_id = $_GET['customer_id'] ?? '';
    $region_id = $_GET['region_id'] ?? '';
    $sub_region_id = $_GET['sub_region_id'] ?? '';
    $employee_id = $_GET['employee_id'] ?? '';
    $date_from = $_GET['date_from'] ?? '';
    $date_to = $_GET['date_to'] ?? '';

    $where_cr = " cr.company_id = ? AND cr.is_cancelled = 0 ";
    $where_br = " br.company_id = ? AND br.is_cancelled = 0 ";
    
    $params_cr = [$company_id];
    $params_br = [$company_id];
    
    if ($customer_type_id) {
        $where_cr .= " AND cl.sub_id = ?";
        $where_br .= " AND cl.sub_id = ?";
        $params_cr[] = $customer_type_id;
        $params_br[] = $customer_type_id;
    }
    if ($customer_id) {
        $where_cr .= " AND c.id = ?";
        $where_br .= " AND c.id = ?";
        $params_cr[] = $customer_id;
        $params_br[] = $customer_id;
    }
    if ($region_id) {
        $where_cr .= " AND c.region_id = ?";
        $where_br .= " AND c.region_id = ?";
        $params_cr[] = $region_id;
        $params_br[] = $region_id;
    }
    if ($sub_region_id) {
        $where_cr .= " AND c.sub_region_id = ?";
        $where_br .= " AND c.sub_region_id = ?";
        $params_cr[] = $sub_region_id;
        $params_br[] = $sub_region_id;
    }
    if ($employee_id) {
        $where_cr .= " AND c.acc_manager_id = ?";
        $where_br .= " AND c.acc_manager_id = ?";
        $params_cr[] = $employee_id;
        $params_br[] = $employee_id;
    }
    if ($date_from && $date_to) {
        $where_cr .= " AND cr.receipt_date BETWEEN ? AND ?";
        $where_br .= " AND br.receipt_date BETWEEN ? AND ?";
        $params_cr[] = $date_from;
        $params_cr[] = $date_to;
        $params_br[] = $date_from;
        $params_br[] = $date_to;
    }

    $params = array_merge($params_cr, $params_br);

    $sql = "
        SELECT 
            cr.receipt_date as date,
            DATE_FORMAT(cr.receipt_date, '%d-%m-%Y') as formatted_date,
            CONCAT('CRV ', cr.serial_no) as tran_no,
            COALESCE(cl.name, c.contact_person) as customer_name,
            cash_acc.name as cash_bank,
            '' as cheque_no,
            cri.received_amount,
            cri.wht_amount,
            0.00 as flood_tax,
            cri.gst_amount,
            cri.advance_adjusted,
            cri.discount_given
        FROM cash_receipts cr
        JOIN cash_receipt_items cri ON cri.receipt_id = cr.id
        LEFT JOIN coa_list cl ON cr.received_from_coa_id = cl.id
        LEFT JOIN customers c ON c.coa_list_id = cl.id
        LEFT JOIN coa_list cash_acc ON cr.cash_account_coa_id = cash_acc.id
        WHERE $where_cr

        UNION ALL

        SELECT 
            br.receipt_date as date,
            DATE_FORMAT(br.receipt_date, '%d-%m-%Y') as formatted_date,
            CONCAT('BRV ', br.serial_no) as tran_no,
            COALESCE(cl.name, c.contact_person) as customer_name,
            bank_acc.name as cash_bank,
            br.cheque_no as cheque_no,
            bri.received_amount,
            bri.wht_amount,
            0.00 as flood_tax,
            bri.gst_amount,
            bri.advance_adjusted,
            bri.discount_given
        FROM bank_receipts br
        JOIN bank_receipt_items bri ON bri.receipt_id = br.id
        LEFT JOIN coa_list cl ON br.received_from_coa_id = cl.id
        LEFT JOIN customers c ON c.coa_list_id = cl.id
        LEFT JOIN coa_list bank_acc ON br.bank_account_coa_id = bank_acc.id
        WHERE $where_br

        ORDER BY date DESC
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
