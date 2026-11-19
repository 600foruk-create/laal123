<?php
require_once 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'get_items') {
    try {
        $stmt = $pdo->prepare("SELECT id, code, name FROM inv_items WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL)  ORDER BY name");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC)); exit;
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]); exit;
    }
} elseif ($action === 'get_report_data') {
    try {
        $item_code = $_GET['item_code'] ?? '';
        $vendor_code = $_GET['vendor_code'] ?? '';
        $employee_id = $_GET['employee_id'] ?? '';
        $date_from = $_GET['date_from'] ?? '';
        $date_to = $_GET['date_to'] ?? '';

        $query = "
            SELECT 
                pi.id as invoice_id,
                pi.serial_no as invoice_no,
                DATE_FORMAT(pi.invoice_date, '%d-%b-%y') as date,
                cl.name as vendor_name,
                pii.quantity,
                pii.unit,
                pii.rate,
                (pii.quantity * pii.rate) as gross_amount,
                pii.discount_amount as discount,
                pii.net_amount as amt_excl_tax,
                pii.sales_tax_amount as sales_tax,
                pii.further_tax_amount as fur_tax,
                (pii.net_amount + pii.sales_tax_amount + pii.further_tax_amount) as amt_incl_tax
            FROM purchase_invoices pi
            JOIN purchase_invoice_items pii ON pi.id = pii.invoice_id
            JOIN coa_list cl ON pi.vendor_coa_id = cl.id
            JOIN inv_items itm ON pii.item_coa_id = itm.id
            WHERE pi.company_id = ? AND pi.is_cancelled = 0 AND pi.is_posted = 1
        ";
        
        $params = [$company_id];

        if (!empty($item_code)) {
            $query .= " AND itm.code = ?";
            $params[] = $item_code;
        }

        if (!empty($vendor_code)) {
            $query .= " AND cl.code = ?";
            $params[] = $vendor_code;
        }

        if (!empty($employee_id)) {
            $query .= " AND pi.employee_ref = ?";
            $params[] = $employee_id;
        }

        if (!empty($date_from) && !empty($date_to)) {
            $dateFromDb = date('Y-m-d', strtotime(str_replace('-', '/', $date_from)));
            $dateToDb = date('Y-m-d', strtotime(str_replace('-', '/', $date_to)));
            $query .= " AND pi.invoice_date >= ? AND pi.invoice_date <= ?";
            $params[] = $dateFromDb;
            $params[] = $dateToDb;
        }

        $query .= " ORDER BY pi.invoice_date ASC, pi.serial_no ASC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode($data); exit;
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]); exit;
    }
} else {
    echo json_encode(['error' => 'Invalid action']); exit;
}
?>


