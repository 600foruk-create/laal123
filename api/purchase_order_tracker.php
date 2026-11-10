<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    
    // Master Grid Data
    if ($action === 'get_master') {
        $order_no = $_GET['order_no'] ?? '';
        $from_date = $_GET['from_date'] ?? '';
        $to_date = $_GET['to_date'] ?? '';
        $vendor_id = $_GET['vendor_id'] ?? '';
        $item_id = $_GET['item_id'] ?? '';

        $query = "
            SELECT 
                po.serial_no as order_no, 
                po.po_date as date, 
                c.name as party,
                i.code as item_code, 
                poi.description as item_name,
                poi.quantity as qty_ordered, 
                poi.item_coa_id,
                IFNULL((
                    SELECT SUM(pii.quantity) 
                    FROM purchase_invoices pinv
                    JOIN purchase_invoice_items pii ON pinv.id = pii.invoice_id
                    WHERE pinv.purchase_order_no = po.serial_no 
                      AND pinv.company_id = po.company_id
                      AND pii.item_coa_id = poi.item_coa_id
                      AND pinv.is_cancelled = 0 AND pinv.is_posted = 1
                ), 0) as qty_supplied
            FROM purchase_orders po
            INNER JOIN purchase_order_items poi ON po.id = poi.po_id
            LEFT JOIN coa_list c ON po.vendor_coa_id = c.id
            LEFT JOIN inv_items i ON poi.item_coa_id = i.id
            WHERE po.company_id = :company_id
        ";
        
        $params = [':company_id' => $company_id];

        if (!empty($order_no)) {
            $query .= " AND po.serial_no = :order_no";
            $params[':order_no'] = $order_no;
        }

        if (!empty($from_date)) {
            $query .= " AND po.po_date >= :from_date";
            $params[':from_date'] = $from_date;
        }

        if (!empty($to_date)) {
            $query .= " AND po.po_date <= :to_date";
            $params[':to_date'] = $to_date;
        }

        if (!empty($vendor_id)) {
            $query .= " AND po.vendor_coa_id = :vendor_id";
            $params[':vendor_id'] = $vendor_id;
        }

        if (!empty($item_id)) {
            $query .= " AND poi.item_coa_id = :item_id";
            $params[':item_id'] = $item_id;
        }

        $query .= " ORDER BY po.po_date DESC, po.serial_no DESC";

        try {
            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Calculate balance
            foreach ($records as &$rec) {
                $rec['balance'] = floatval($rec['qty_ordered']) - floatval($rec['qty_supplied']);
            }

            echo json_encode(['status' => 'success', 'records' => $records]);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
        }
        exit;
    }

    // Detail Grid Data
    if ($action === 'get_detail') {
        $order_no = $_GET['order_no'] ?? 0;
        $item_id = $_GET['item_id'] ?? 0;

        $query = "
            SELECT 
                pinv.serial_no as voucher_no, 
                pinv.invoice_date as date,
                pinv.is_tax_invoice,
                pii.quantity, 
                pii.unit, 
                pii.rate, 
                pii.gross_amount as value_excl_tax,
                pii.sales_tax_rate as gst_rate, 
                pii.sales_tax_amount as gst_amount,
                pii.net_amount as value_incl_tax
            FROM purchase_invoices pinv
            JOIN purchase_invoice_items pii ON pinv.id = pii.invoice_id
            WHERE pinv.company_id = :company_id
              AND pinv.purchase_order_no = :order_no
              AND pii.item_coa_id = :item_id
              AND pinv.is_cancelled = 0 AND pinv.is_posted = 1
            ORDER BY pinv.invoice_date DESC, pinv.serial_no DESC
        ";

        try {
            $stmt = $pdo->prepare($query);
            $stmt->execute([
                ':company_id' => $company_id,
                ':order_no' => $order_no,
                ':item_id' => $item_id
            ]);
            $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['status' => 'success', 'records' => $records]);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
        }
        exit;
    }

    // Purchase Orders Dropdown Data
    if ($action === 'get_orders') {
        $query = "
            SELECT 
                po.serial_no as order_no, 
                po.po_date as date, 
                c.name as vendor_name
            FROM purchase_orders po
            LEFT JOIN coa_list c ON po.vendor_coa_id = c.id
            WHERE po.company_id = :company_id
            ORDER BY po.serial_no DESC
        ";

        try {
            $stmt = $pdo->prepare($query);
            $stmt->execute([':company_id' => $company_id]);
            $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['status' => 'success', 'records' => $records]);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
        }
        exit;
    }
}

echo json_encode(['status' => 'error', 'error' => 'Invalid action']);
?>

