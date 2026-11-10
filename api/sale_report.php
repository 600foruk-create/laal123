<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

function normalizeReportDate($d) {
    if (!$d) return null;
    $d = trim($d);
    if (preg_match('/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/', $d, $m)) {
        return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
    }
    return $d;
}

if ($action === 'get_data') {
    $company_id = intval($_GET['company_id'] ?? 1);
    $invoice_type_filter = $_GET['invoice_type_filter'] ?? 'all'; // all, tax, non_tax
    $customer_coa_id = $_GET['customer_coa_id'] ?? null;
    $from_date = normalizeReportDate($_GET['from_date'] ?? null);
    $to_date = normalizeReportDate($_GET['to_date'] ?? null);

    $sql = "
        SELECT 
            si.id as invoice_id,
            COALESCE(NULLIF(si.pos_invoice_no, ''), CAST(si.serial_no AS CHAR)) as invoice_no, 
            si.invoice_date as date, 
            si.is_tax_invoice,
            cl.name as customer_name,
            SUM(sii.gross_amount) as amount,
            (SUM(sii.discount_amount) + si.additional_discount) as discount,
            SUM(sii.sales_tax_amount) as sales_tax,
            SUM(sii.further_tax_amount) as further_tax,
            si.carriage_freight as carriage_fr,
            si.net_total as amount_incl_tax
        FROM sale_invoices si
        LEFT JOIN sale_invoice_items sii ON si.id = sii.invoice_id
        LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
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
    
    if ($from_date && $to_date) {
        $sql .= " AND si.invoice_date BETWEEN ? AND ?";
        $params[] = $from_date;
        $params[] = $to_date;
    }

    $sql .= " GROUP BY si.id, si.serial_no, si.pos_invoice_no, si.invoice_date, si.is_tax_invoice, cl.name, si.additional_discount, si.carriage_freight, si.net_total ORDER BY si.invoice_date DESC, si.id DESC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Post-process to calculate amount_excl_tax dynamically in PHP to avoid strict mode group by issues
        foreach($data as &$row) {
            $row['amount_excl_tax'] = (float)$row['amount'] - (float)$row['discount'];
        }

        echo json_encode($data);
    } catch (PDOException $e) {
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'get_register_data') {
    $company_id = intval($_GET['company_id'] ?? 1);
    $invoice_type_filter = $_GET['invoice_type_filter'] ?? 'all'; 
    $customer_coa_id = $_GET['customer_coa_id'] ?? null;
    $from_date = normalizeReportDate($_GET['from_date'] ?? null);
    $to_date = normalizeReportDate($_GET['to_date'] ?? null);

    $sql = "
        SELECT 
            si.id as invoice_id,
            COALESCE(NULLIF(si.pos_invoice_no, ''), CAST(si.serial_no AS CHAR)) as invoice_no, 
            si.invoice_date as date, 
            si.is_tax_invoice,
            cl.name as customer_name,
            COALESCE(itm.code, srv.code, '') as item_code,
            COALESCE(itm.name, srv.name, sii.description, '') as item_name,
            sii.pieces,
            sii.quantity,
            sii.unit,
            sii.rate,
            sii.gross_amount as amount_excl_tax,
            sii.sales_tax_amount as sales_tax,
            sii.further_tax_amount as further_tax,
            sii.net_amount as amount_incl_tax
        FROM sale_invoices si
        JOIN sale_invoice_items sii ON si.id = sii.invoice_id
        LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
        LEFT JOIN inv_items itm ON sii.item_coa_id = itm.id
        LEFT JOIN serv_items srv ON sii.item_coa_id = srv.id
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
    
    if ($from_date && $to_date) {
        $sql .= " AND si.invoice_date BETWEEN ? AND ?";
        $params[] = $from_date;
        $params[] = $to_date;
    }

    $sql .= " ORDER BY si.invoice_date DESC, si.id DESC";

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
