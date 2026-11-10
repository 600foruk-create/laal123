<?php
// Ensure JSON content type
header('Content-Type: application/json; charset=utf-8');

// Output buffering to prevent stray notices or whitespace from corrupting JSON
ob_start();

// Custom Shutdown handler to catch ANY fatal PHP error and output valid JSON
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        if (ob_get_length()) ob_clean();
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'status' => 'error',
            'message' => 'Server Fatal Error: ' . $error['message'] . ' in ' . basename($error['file']) . ' on line ' . $error['line']
        ], JSON_UNESCAPED_UNICODE);
    }
});

require_once 'db_config.php';
require_once __DIR__ . '/fbr_client.php';

// Safe Error Reporting
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Safe response sender with UTF-8 guarantee
function pos_send_json($data, $status_code = 200) {
    if (ob_get_length()) ob_clean();
    if (!headers_sent()) {
        http_response_code($status_code);
        header('Content-Type: application/json; charset=utf-8');
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        $json = json_encode([
            'status' => 'error',
            'message' => 'JSON Encoding Error: ' . json_last_error_msg()
        ]);
    }
    echo $json;
    exit;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);

// Global Helper: Safe Date Normalizer
if (!function_exists('normalizePosDate')) {
    function normalizePosDate($d) {
        if (!$d) return null;
        $d = trim($d);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
            return $d;
        }
        $ts = strtotime($d);
        if ($ts !== false && $ts > 0) {
            return date('Y-m-d', $ts);
        }
        if (preg_match('/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/', $d, $m)) {
            return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
        }
        return null;
    }
}

// Lightweight schema safeguard: Ensure required columns exist without locking tables repeatedly
$siCols = [];
$siiCols = [];
$custCols = [];
try {
    // 1. Check existing sale_invoices columns
    $siCols = $pdo->query("SHOW COLUMNS FROM sale_invoices")->fetchAll(PDO::FETCH_COLUMN);
    $required_si_cols = [
        'pos_invoice_no' => 'VARCHAR(100) NULL',
        'pos_status' => 'VARCHAR(50) DEFAULT "Posted"',
        'fbr_status' => 'VARCHAR(50) DEFAULT "Not Submitted"',
        'fbr_invoice_number' => 'VARCHAR(100) NULL',
        'fbr_qr_code' => 'TEXT NULL',
        'fbr_response' => 'TEXT NULL',
        'fbr_submitted_at' => 'DATETIME NULL',
        'cancel_reason' => 'VARCHAR(500) NULL',
        'cancelled_by' => 'INT NULL',
        'cancelled_at' => 'DATETIME NULL',
        'print_count' => 'INT DEFAULT 0',
        'last_printed_at' => 'DATETIME NULL',
        'customer_address' => 'VARCHAR(500) DEFAULT NULL',
        'customer_telephone' => 'VARCHAR(100) DEFAULT NULL',
        'customer_ntn' => 'VARCHAR(100) DEFAULT NULL',
        'customer_gst' => 'VARCHAR(100) DEFAULT NULL',
        'customer_tax_rate' => 'DECIMAL(10,2) DEFAULT 0',
        'customer_tax_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'customer_wht_type' => 'VARCHAR(50) DEFAULT NULL',
        'additional_discount' => 'DECIMAL(15,2) DEFAULT 0',
        'carriage_freight' => 'DECIMAL(15,2) DEFAULT 0',
        'gross_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'net_total' => 'DECIMAL(15,2) DEFAULT 0',
        'amount_received' => 'DECIMAL(15,2) DEFAULT 0',
        'is_cancelled' => 'TINYINT DEFAULT 0',
        'is_posted' => 'TINYINT DEFAULT 1',
        'inventory_location_id' => 'INT NULL',
        'customer_coa_id' => 'INT NULL',
        'invoice_type' => 'VARCHAR(50) DEFAULT "POS"',
        'invoice_date' => 'DATE NULL',
        'serial_no' => 'INT NOT NULL DEFAULT 0'
    ];
    $missing_si = [];
    foreach ($required_si_cols as $col => $def) {
        if (!in_array($col, $siCols)) {
            $missing_si[] = "ADD COLUMN `$col` $def";
        }
    }
    if (!empty($missing_si)) {
        try {
            $pdo->exec("ALTER TABLE sale_invoices " . implode(', ', $missing_si));
            $siCols = $pdo->query("SHOW COLUMNS FROM sale_invoices")->fetchAll(PDO::FETCH_COLUMN);
        } catch (Throwable $e) {}
    }

    // 2. Check existing sale_invoice_items columns
    $siiCols = $pdo->query("SHOW COLUMNS FROM sale_invoice_items")->fetchAll(PDO::FETCH_COLUMN);
    $required_sii_cols = [
        'gross_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'discount_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'sales_tax_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'further_tax_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'net_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'rate' => 'DECIMAL(20,4) DEFAULT 0',
        'quantity' => 'DECIMAL(15,2) DEFAULT 0'
    ];
    $missing_sii = [];
    foreach ($required_sii_cols as $col => $def) {
        if (!in_array($col, $siiCols)) {
            $missing_sii[] = "ADD COLUMN `$col` $def";
        }
    }
    if (!empty($missing_sii)) {
        try {
            $pdo->exec("ALTER TABLE sale_invoice_items " . implode(', ', $missing_sii));
            $siiCols = $pdo->query("SHOW COLUMNS FROM sale_invoice_items")->fetchAll(PDO::FETCH_COLUMN);
        } catch (Throwable $e) {}
    }

    // 3. Check customers table columns
    $custCols = $pdo->query("SHOW COLUMNS FROM customers")->fetchAll(PDO::FETCH_COLUMN);

} catch (Throwable $e) {}

try {
    // -------------------------------------------------------------
    // ACTION: get_invoices (Search, Filters, Summary Cards, Pagination)
    // -------------------------------------------------------------
    if ($action === 'get_invoices') {
        $search = trim($_GET['search'] ?? '');
        $customer_search = trim($_GET['customer'] ?? '');
        $from_date = trim($_GET['from_date'] ?? '');
        $to_date = trim($_GET['to_date'] ?? '');
        $branch_id = trim($_GET['branch_id'] ?? '');
        $payment_status = trim($_GET['payment_status'] ?? '');
        $fbr_status = trim($_GET['fbr_status'] ?? '');
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(5, min(200, intval($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;
        
        $sort_by = $_GET['sort_by'] ?? 'si.id';
        $sort_dir = strtoupper($_GET['sort_dir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
        $allowed_sorts = [
            'id' => 'si.id',
            'pos_invoice_no' => 'si.pos_invoice_no',
            'invoice_date' => 'si.invoice_date',
            'customer_name' => 'cl.name',
            'branch_name' => 'b.branch_name',
            'net_total' => 'si.net_total',
            'fbr_status' => 'si.fbr_status'
        ];
        $order_clause = $allowed_sorts[$sort_by] ?? 'si.id';

        // Base conditions: POS invoices belonging to company
        $where = ["si.company_id = ?", "(LOWER(COALESCE(si.invoice_type, '')) = 'pos' OR (si.pos_invoice_no IS NOT NULL AND si.pos_invoice_no != ''))"];
        $params = [$company_id];

        // 1. Search (Invoice No, Serial No, FBR Reference)
        if ($search !== '') {
            $where[] = "(si.pos_invoice_no LIKE ? OR CAST(si.serial_no AS CHAR) LIKE ? OR si.fbr_invoice_number LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        // 2. Customer Search (Name or Mobile or Phone)
        if ($customer_search !== '') {
            $where[] = "(cl.name LIKE ? OR cust.mobile LIKE ? OR cust.telephone LIKE ? OR si.customer_telephone LIKE ?)";
            $custTerm = "%{$customer_search}%";
            $params[] = $custTerm;
            $params[] = $custTerm;
            $params[] = $custTerm;
            $params[] = $custTerm;
        }

        // 3. Date Filters
        if ($from_date !== '') {
            $normFrom = normalizePosDate($from_date);
            if ($normFrom) {
                $where[] = "si.invoice_date >= ?";
                $params[] = $normFrom;
            }
        }
        if ($to_date !== '') {
            $normTo = normalizePosDate($to_date);
            if ($normTo) {
                $where[] = "si.invoice_date <= ?";
                $params[] = $normTo;
            }
        }

        // 4. Branch Filter
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = strval($_SESSION['branch_id']);
        }
        if ($branch_id !== '') {
            $where[] = "(si.inventory_location_id = ? OR si.inventory_location_id IS NULL OR si.inventory_location_id = 0)";
            $params[] = intval($branch_id);
        }

        // 5. Payment Status Filter
        if ($payment_status !== '') {
            if ($payment_status === 'Cancelled') {
                $where[] = "si.is_cancelled = 1";
            } elseif ($payment_status === 'Paid') {
                $where[] = "si.is_cancelled = 0 AND si.amount_received >= si.net_total AND si.net_total > 0";
            } elseif ($payment_status === 'Partially Paid') {
                $where[] = "si.is_cancelled = 0 AND si.amount_received > 0 AND si.amount_received < si.net_total";
            } elseif ($payment_status === 'Unpaid') {
                $where[] = "si.is_cancelled = 0 AND (si.amount_received = 0 OR si.amount_received IS NULL)";
            }
        }

        // 6. FBR Status Filter
        if ($fbr_status !== '') {
            if ($fbr_status === 'Not Submitted') {
                $where[] = "(si.fbr_status = 'Not Submitted' OR si.fbr_status IS NULL OR si.fbr_status = '')";
            } elseif ($fbr_status === 'Submitted') {
                $where[] = "si.fbr_status IN ('Submitted', 'Accepted')";
            } else {
                $where[] = "si.fbr_status = ?";
                $params[] = $fbr_status;
            }
        }

        $where_sql = implode(' AND ', $where);

        $has_pos_no = in_array('pos_invoice_no', $siCols);
        $has_pos_status = in_array('pos_status', $siCols);
        $has_fbr_status = in_array('fbr_status', $siCols);
        $has_fbr_inv = in_array('fbr_invoice_number', $siCols);
        $has_fbr_date = in_array('fbr_submitted_at', $siCols);
        $has_cancel_reason = in_array('cancel_reason', $siCols);
        $has_print_count = in_array('print_count', $siCols);
        $has_last_printed = in_array('last_printed_at', $siCols);
        $has_cust_phone = in_array('customer_telephone', $siCols);
        $has_cust_tax = in_array('customer_tax_amount', $siCols);

        $has_cust_mobile = in_array('mobile', $custCols);
        $has_cust_tel = in_array('telephone', $custCols);

        $grossExpr = in_array('gross_amount', $siiCols) ? "gross_amount" : "quantity * rate";
        $discExpr = in_array('discount_amount', $siiCols) ? "discount_amount" : "0";
        $stExpr = in_array('sales_tax_amount', $siiCols) ? "sales_tax_amount" : "0";
        $ftExpr = in_array('further_tax_amount', $siiCols) ? "further_tax_amount" : "0";

        $fbr_sub_expr = $has_fbr_status 
            ? "COUNT(CASE WHEN si.is_cancelled = 0 AND si.fbr_status IN ('Submitted', 'Accepted') AND (si.fbr_invoice_number IS NOT NULL AND si.fbr_invoice_number != '' AND si.fbr_invoice_number != 'Not Available' AND si.fbr_invoice_number != 'None') THEN 1 END)" 
            : "0";
        $fbr_pend_expr = $has_fbr_status 
            ? "COUNT(CASE WHEN si.is_cancelled = 0 AND (si.fbr_status IS NULL OR si.fbr_status IN ('Pending', 'Not Submitted', 'Failed', 'Rejected', 'Verification Required', '') OR si.fbr_invoice_number = 'Not Available') THEN 1 END)" 
            : "COUNT(CASE WHEN si.is_cancelled = 0 THEN 1 END)";

        // --- Calculate Summary Stats with current filters ---
        $summary_stmt = $pdo->prepare("
            SELECT 
                COUNT(*) as total_invoices,
                COALESCE(SUM(CASE WHEN si.is_cancelled = 0 THEN si.net_total ELSE 0 END), 0) as total_sales,
                $fbr_sub_expr as fbr_submitted,
                $fbr_pend_expr as fbr_pending
            FROM sale_invoices si
            LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
            LEFT JOIN customers cust ON cl.id = cust.coa_list_id
            LEFT JOIN company_branches b ON si.inventory_location_id = b.id
            WHERE $where_sql
        ");
        $summary_stmt->execute($params);
        $summary = $summary_stmt->fetch(PDO::FETCH_ASSOC);

        $total_records = intval($summary['total_invoices'] ?? 0);
        $total_pages = ceil($total_records / $limit);

        // --- Fetch Paginated Records ---
        $pos_no_col = $has_pos_no ? "si.pos_invoice_no" : "NULL as pos_invoice_no";
        $cancel_reason_col = $has_cancel_reason ? "si.cancel_reason" : "NULL as cancel_reason";
        $pos_status_col = $has_pos_status ? "si.pos_status" : "'Posted' as pos_status";
        $fbr_status_col = $has_fbr_status ? "si.fbr_status" : "'Not Submitted' as fbr_status";
        $fbr_inv_col = $has_fbr_inv ? "si.fbr_invoice_number" : "NULL as fbr_invoice_number";
        $fbr_date_col = $has_fbr_date ? "si.fbr_submitted_at" : "NULL as fbr_submitted_at";
        $print_cnt_col = $has_print_count ? "si.print_count" : "0 as print_count";
        $last_print_col = $has_last_printed ? "si.last_printed_at" : "NULL as last_printed_at";
        $cust_tax_expr = $has_cust_tax ? "COALESCE(si.customer_tax_amount, 0)" : "0";

        $mobile_parts = [];
        if ($has_cust_phone) $mobile_parts[] = "si.customer_telephone";
        if ($has_cust_mobile) $mobile_parts[] = "cust.mobile";
        if ($has_cust_tel) $mobile_parts[] = "cust.telephone";
        $mobile_parts[] = "''";
        $mobile_expr = "COALESCE(" . implode(', ', $mobile_parts) . ")";

        $query = "
            SELECT 
                si.id, 
                si.serial_no, 
                $pos_no_col, 
                si.invoice_date, 
                si.created_at,
                si.is_cancelled, 
                $cancel_reason_col,
                si.net_total, 
                si.amount_received,
                si.additional_discount,
                si.carriage_freight,
                $pos_status_col, 
                $fbr_status_col, 
                $fbr_inv_col,
                $fbr_date_col,
                $print_cnt_col,
                $last_print_col,
                COALESCE(cl.name, 'Walk-in Customer') as customer_name,
                $mobile_expr as customer_mobile,
                COALESCE(b.branch_name, 'Main / Default') as branch_name,
                COALESCE(b.branch_code, '') as branch_code,
                (SELECT COUNT(*) FROM sale_invoice_items WHERE invoice_id = si.id) as items_count,
                COALESCE((SELECT SUM(COALESCE($grossExpr, quantity * rate)) FROM sale_invoice_items WHERE invoice_id = si.id), si.net_total) as subtotal,
                COALESCE((SELECT SUM($discExpr) FROM sale_invoice_items WHERE invoice_id = si.id), 0) as items_discount,
                COALESCE((SELECT SUM(COALESCE($stExpr, 0) + COALESCE($ftExpr, 0)) FROM sale_invoice_items WHERE invoice_id = si.id), 0) + $cust_tax_expr as total_tax
            FROM sale_invoices si
            LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
            LEFT JOIN customers cust ON cl.id = cust.coa_list_id
            LEFT JOIN company_branches b ON si.inventory_location_id = b.id
            WHERE $where_sql
            ORDER BY $order_clause $sort_dir
            LIMIT $limit OFFSET $offset
        ";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate dynamic payment status and format labels for frontend
        $invoices = [];
        foreach ($rows as $row) {
            $net = floatval($row['net_total'] ?? 0);
            $recv = floatval($row['amount_received'] ?? 0);
            $is_cancelled = intval($row['is_cancelled'] ?? 0);

            if ($is_cancelled === 1) {
                $calc_pay_status = 'Cancelled';
            } elseif ($recv >= $net && $net > 0) {
                $calc_pay_status = 'Paid';
            } elseif ($recv > 0) {
                $calc_pay_status = 'Partially Paid';
            } else {
                $calc_pay_status = 'Unpaid';
            }

            $row['calc_payment_status'] = $calc_pay_status;
            $row['formatted_invoice_no'] = !empty($row['pos_invoice_no']) ? $row['pos_invoice_no'] : ('INV-' . str_pad($row['serial_no'], 4, '0', STR_PAD_LEFT));
            $row['total_discount'] = floatval($row['additional_discount'] ?? 0) + floatval($row['items_discount'] ?? 0);

            // Self-healing: if an invoice was previously saved as Submitted with 'Not Available', correct it to Rejected
            if (($row['fbr_invoice_number'] ?? '') === 'Not Available' && in_array($row['fbr_status'] ?? '', ['Submitted', 'Accepted'])) {
                $row['fbr_status'] = 'Rejected';
                try {
                    $pdo->prepare("UPDATE sale_invoices SET fbr_status = 'Rejected' WHERE id = ?")->execute([$row['id']]);
                } catch (\Exception $e) {}
            }

            $invoices[] = $row;
        }

        pos_send_json([
            'status' => 'success',
            'data' => $invoices,
            'summary' => [
                'total_invoices' => intval($summary['total_invoices'] ?? 0),
                'total_sales' => floatval($summary['total_sales'] ?? 0),
                'fbr_submitted' => intval($summary['fbr_submitted'] ?? 0),
                'fbr_pending' => intval($summary['fbr_pending'] ?? 0)
            ],
            'pagination' => [
                'total' => $total_records,
                'page' => $page,
                'limit' => $limit,
                'pages' => $total_pages
            ]
        ]);
    }

    // -------------------------------------------------------------
    // ACTION: get_invoice_details
    // -------------------------------------------------------------
    if ($action === 'get_invoice_details') {
        $id = intval($_GET['id'] ?? 0);
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("
            SELECT 
                si.*,
                COALESCE(cl.name, 'Walk-in Customer') as customer_name,
                COALESCE(si.customer_telephone, cust.mobile, cust.telephone, '') as customer_mobile,
                COALESCE(si.customer_address, cust.address, '') as customer_full_address,
                COALESCE(si.customer_ntn, cust.ntn_cnic, '') as customer_ntn_val,
                COALESCE(si.customer_gst, cust.st_reg_no, '') as customer_gst_val,
                b.branch_name,
                b.branch_code,
                b.address as branch_address,
                b.contact_number as branch_contact,
                fbm.fbr_pos_id as branch_fbr_pos_id,
                u.username as created_by_username
            FROM sale_invoices si
            LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
            LEFT JOIN customers cust ON cl.id = cust.coa_list_id
            LEFT JOIN company_branches b ON si.inventory_location_id = b.id
            LEFT JOIN pos_fbr_branch_mappings fbm ON b.id = fbm.branch_id AND fbm.company_id = si.company_id
            LEFT JOIN users u ON si.company_id = u.company_id AND u.id = 1
            WHERE si.id = ? AND si.company_id = ? " . (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id']) ? " AND (si.inventory_location_id = " . intval($_SESSION['branch_id']) . " OR si.inventory_location_id IS NULL OR si.inventory_location_id = 0)" : "") . "
        ");
        $stmt->execute([$id, $company_id]);
        $header = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$header) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found or access denied.']);
            exit;
        }

        // Fetch line items
        $item_stmt = $pdo->prepare("
            SELECT 
                sii.*,
                COALESCE(NULLIF(TRIM(inv.name), ''), NULLIF(TRIM(serv.name), ''), NULLIF(TRIM(sii.description), ''), 'Item') as item_title,
                COALESCE(NULLIF(TRIM(inv.code), ''), NULLIF(TRIM(serv.code), ''), '') as item_code,
                COALESCE(NULLIF(TRIM(sii.hs_code), ''), NULLIF(TRIM(inv.hs_code), ''), '') as item_pct_raw
            FROM sale_invoice_items sii
            LEFT JOIN inv_items inv ON (sii.item_coa_id = inv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = inv.name))
            LEFT JOIN serv_items serv ON (sii.item_coa_id = serv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = serv.name))
            WHERE sii.invoice_id = ?
            ORDER BY sii.id ASC
        ");
        $item_stmt->execute([$id]);
        $items = $item_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch company / POS settings for receipt
        $sett_stmt = $pdo->prepare("SELECT setting_key, setting_value FROM pos_settings WHERE company_id = ? ORDER BY id ASC");
        $sett_stmt->execute([$company_id]);
        $settings = [];
        while ($r = $sett_stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$r['setting_key']] = $r['setting_value'];
        }
        if (!isset($settings['rec_show_header'])) $settings['rec_show_header'] = '1';
        if (!isset($settings['rec_show_logo'])) $settings['rec_show_logo'] = '1';
        if (!isset($settings['rec_show_tax'])) $settings['rec_show_tax'] = '1';
        if (!isset($settings['rec_auto_print'])) $settings['rec_auto_print'] = '1';

        // Fetch company info
        $comp_stmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
        $comp_stmt->execute([$company_id]);
        $company_info = $comp_stmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'header' => $header,
            'items' => $items,
            'settings' => $settings,
            'company' => $company_info
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: get_filter_lookups (Active branches)
    // -------------------------------------------------------------
    if ($action === 'get_filter_lookups') {
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $stmt = $pdo->prepare("
                SELECT id, branch_code, branch_name 
                FROM company_branches 
                WHERE company_id = ? AND status = 'Active' AND id = ?
                ORDER BY branch_name ASC
            ");
            $stmt->execute([$company_id, intval($_SESSION['branch_id'])]);
        } else {
            $stmt = $pdo->prepare("
                SELECT id, branch_code, branch_name 
                FROM company_branches 
                WHERE company_id = ? AND status = 'Active' 
                ORDER BY branch_name ASC
            ");
            $stmt->execute([$company_id]);
        }
        $branches = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['status' => 'success', 'branches' => $branches]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: validate_fbr_invoice (Separate Pre-flight Validation)
    // -------------------------------------------------------------
    if ($action === 'validate_fbr_invoice') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? ($_GET['id'] ?? 0));
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID is required for validation.']);
            exit;
        }

        // Fetch Invoice Header
        $stmt = $pdo->prepare("SELECT si.*, COALESCE(cl.name, 'Walk-in Customer') as customer_name FROM sale_invoices si LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id WHERE si.id = ? AND si.company_id = ?");
        $stmt->execute([$id, $company_id]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found.']);
            exit;
        }

        if (intval($invoice['is_cancelled']) === 1) {
            echo json_encode(['status' => 'error', 'message' => 'Cancelled invoice cannot be validated.']);
            exit;
        }

        // Read POS FBR Settings
        $sett_stmt = $pdo->prepare("SELECT setting_key, setting_value FROM pos_settings WHERE company_id = ? ORDER BY id ASC");
        $sett_stmt->execute([$company_id]);
        $settings = [];
        while ($r = $sett_stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$r['setting_key']] = $r['setting_value'];
        }

        $fbr_env = $settings['fbr_environment'] ?? 'sandbox';

        // Branch-wise FBR Mapping Resolution
        $branch_id = intval($invoice['inventory_location_id'] ?? 0);
        $branch_info = null;
        if ($branch_id > 0) {
            $b_stmt = $pdo->prepare("SELECT id, branch_code, branch_name FROM company_branches WHERE id = ? AND company_id = ?");
            $b_stmt->execute([$branch_id, $company_id]);
            $branch_info = $b_stmt->fetch(PDO::FETCH_ASSOC);
        }
        $branch_code = $branch_info['branch_code'] ?? 'MAIN';
        $branch_name = $branch_info['branch_name'] ?? 'Main Branch';

        $fbr_pos_id = '';
        $branch_token = '';
        if ($branch_id > 0) {
            $map_stmt = $pdo->prepare("
                SELECT fbr_pos_id, pos_token, is_enabled, status 
                FROM pos_fbr_branch_mappings 
                WHERE company_id = ? AND branch_id = ? AND environment = ?
            ");
            $map_stmt->execute([$company_id, $branch_id, $fbr_env]);
            $mapping = $map_stmt->fetch(PDO::FETCH_ASSOC);

            if ($mapping) {
                if (intval($mapping['is_enabled']) === 0) {
                    echo json_encode(['status' => 'error', 'message' => "FBR Integration is disabled for branch '{$branch_name}' ({$branch_code})."]);
                    exit;
                }
                $fbr_pos_id = trim($mapping['fbr_pos_id'] ?? '');
                $branch_token = trim($mapping['pos_token'] ?? '');
            }
        }

        if (empty($fbr_pos_id)) {
            $fbr_pos_id = trim($settings['fbr_pos_id'] ?? '');
        }

        if (empty($fbr_pos_id)) {
            echo json_encode(['status' => 'error', 'message' => "FBR POS ID is not configured for branch '{$branch_name}'."]);
            exit;
        }

        $central_token = ($fbr_env === 'production')
            ? ($settings['fbr_api_token_production'] ?? ($settings['fbr_api_token'] ?? ''))
            : ($settings['fbr_api_token_sandbox'] ?? ($settings['fbr_api_token'] ?? ''));

        $raw_token = !empty($branch_token) ? $branch_token : $central_token;
        $active_token = fbr_decrypt_token($raw_token);

        if (empty($active_token)) {
            echo json_encode(['status' => 'error', 'message' => 'API Authorization Token is missing. Please configure FBR Bearer Token.']);
            exit;
        }

        // Fetch invoice items
        $item_stmt = $pdo->prepare("
            SELECT sii.*, 
                   COALESCE(NULLIF(TRIM(inv.name), ''), NULLIF(TRIM(serv.name), ''), NULLIF(TRIM(sii.description), ''), 'Item') as item_title, 
                   COALESCE(NULLIF(TRIM(inv.code), ''), NULLIF(TRIM(serv.code), ''), '') as item_code,
                   COALESCE(NULLIF(TRIM(sii.hs_code), ''), NULLIF(TRIM(inv.hs_code), ''), '') as item_pct_raw
            FROM sale_invoice_items sii
            LEFT JOIN inv_items inv ON (sii.item_coa_id = inv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = inv.name))
            LEFT JOIN serv_items serv ON (sii.item_coa_id = serv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = serv.name))
            WHERE sii.invoice_id = ?
            ORDER BY sii.id ASC
        ");
        $item_stmt->execute([$id]);
        $items = $item_stmt->fetchAll(PDO::FETCH_ASSOC);

        $fbr_items = [];
        $total_tax = 0;
        $total_qty = 0;
        foreach ($items as $item) {
            $qty = floatval($item['quantity'] ?? 1);
            $rate = floatval($item['rate'] ?? 0);
            $gross = floatval($item['gross_amount'] ?? ($qty * $rate));
            $tax_rate = floatval($item['sales_tax_rate'] ?? 0);
            $tax_amt = floatval($item['sales_tax_amount'] ?? 0);
            $fur_tax = floatval($item['further_tax_amount'] ?? 0);
            $disc = floatval($item['discount_amount'] ?? 0);
            $net = floatval($item['net_amount'] ?? ($gross - $disc + $tax_amt + $fur_tax));

            $total_tax += ($tax_amt + $fur_tax);
            $total_qty += $qty;

            // Resolve and format strictly 8 numeric digits PCT Code for FBR (Digits ONLY, NO dots, NO dashes)
            $rawPct = trim((string)($item['item_pct_raw'] ?? ''));
            if (empty($rawPct) && !empty($settings['fbr_default_pct_code'])) {
                $rawPct = trim($settings['fbr_default_pct_code']);
            }
            // Strip any non-digit character (removes dots, dashes, spaces, slashes)
            $digitsOnly = preg_replace('/\D/', '', $rawPct);
            if (empty($digitsOnly) || ltrim($digitsOnly, '0') === '') {
                $defaultDigits = !empty($settings['fbr_default_pct_code']) ? preg_replace('/\D/', '', $settings['fbr_default_pct_code']) : '';
                $digitsOnly = (strlen($defaultDigits) === 8) ? $defaultDigits : '19059000';
            }
            if (strlen($digitsOnly) < 8) {
                $digitsOnly = str_pad($digitsOnly, 8, '0', STR_PAD_RIGHT);
            } elseif (strlen($digitsOnly) > 8) {
                $digitsOnly = substr($digitsOnly, 0, 8);
            }
            $cleanPct = (string)$digitsOnly;

            $fbr_items[] = [
                'ItemCode' => !empty($item['item_code']) ? $item['item_code'] : 'GEN-ITEM',
                'ItemName' => $item['item_title'] ?? 'General Item',
                'Quantity' => $qty,
                'PCTCode' => $cleanPct,
                'TaxRate' => $tax_rate,
                'SaleValue' => round($gross, 2),
                'TotalAmount' => round($net, 2),
                'TaxCharged' => round($tax_amt, 2),
                'Discount' => round($disc, 2),
                'FurtherTax' => round($fur_tax, 2),
                'InvoiceType' => 1
            ];
        }

        $inv_no = !empty($invoice['pos_invoice_no']) ? $invoice['pos_invoice_no'] : ('INV-' . str_pad($invoice['serial_no'], 4, '0', STR_PAD_LEFT));
        $dateTime = !empty($invoice['created_at']) ? date('Y-m-d H:i:s', strtotime($invoice['created_at'])) : date('Y-m-d H:i:s');

        $fbr_payload = [
            'InvoiceNumber' => '',
            'POSID' => intval($fbr_pos_id),
            'USIN' => $inv_no,
            'DateTime' => $dateTime,
            'BuyerNTN' => $invoice['customer_ntn'] ?? '',
            'BuyerCNIC' => '',
            'BuyerName' => $invoice['customer_name'] ?? 'Walk-in Customer',
            'BuyerPhoneNumber' => $invoice['customer_telephone'] ?? '',
            'TotalSaleValue' => round(floatval($invoice['net_total']) - $total_tax, 2),
            'TotalQuantity' => $total_qty,
            'TotalBillAmount' => round(floatval($invoice['net_total']), 2),
            'TotalTaxCharged' => round($total_tax, 2),
            'Discount' => round(floatval($invoice['additional_discount']), 2),
            'PaymentMode' => 1,
            'InvoiceType' => 1,
            'Items' => $fbr_items
        ];

        // Resolve official validate endpoint
        $custom_validate = ($fbr_env === 'production')
            ? ($settings['fbr_validate_url_prod'] ?? ($settings['fbr_validate_url'] ?? ''))
            : ($settings['fbr_validate_url'] ?? '');
        $validate_url = fbr_get_official_endpoint('validate', $fbr_env, $custom_validate);

        $req = fbr_api_request($validate_url, 'POST', $fbr_payload, $active_token, [
            'timeout' => 15,
            'connect_timeout' => 6
        ]);

        if ($req['error'] || $req['http_code'] === 0) {
            echo json_encode([
                'status' => 'error',
                'message' => 'FBR Validation Server Connection Error: ' . ($req['error'] ?? 'Connection timed out')
            ]);
            exit;
        }

        $res_data = $req['data'];
        $eval = fbr_parse_api_response($req['http_code'], $res_data, $req['raw_response']);
        $is_valid = $eval['is_accepted'];

        // Log validation in submission logs
        try {
            $log_stmt = $pdo->prepare("
                INSERT INTO pos_fbr_submission_logs 
                    (company_id, branch_id, branch_code, branch_name, invoice_id, erp_invoice_no, environment, fbr_pos_id, submission_time, status, fbr_response_code, error_message, response_payload)
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
            ");
            $log_stmt->execute([
                $company_id, $branch_id, $branch_code, $branch_name, $id, $inv_no, $fbr_env, $fbr_pos_id,
                $is_valid ? 'Validated' : 'Validation Failed',
                strval($eval['response_code'] ?? $req['http_code']),
                $is_valid ? 'Pre-flight validation successful' : $eval['status_message'],
                $req['raw_response']
            ]);
        } catch(Exception $e) {}

        if ($is_valid) {
            echo json_encode([
                'status' => 'success',
                'message' => "✓ Invoice #{$inv_no} pre-validated successfully with FBR ({$branch_name}, POS ID: {$fbr_pos_id})! All tax & line requirements passed.",
                'validation_data' => $res_data
            ]);
        } else {
            echo json_encode([
                'status' => 'error',
                'message' => "FBR Validation Notice: " . $eval['status_message'],
                'validation_data' => $res_data,
                'errors' => $eval['errors']
            ]);
        }
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: submit_to_fbr (Post Invoice to FBR with Duplicate & Timeout Protection)
    // -------------------------------------------------------------
    if ($action === 'submit_to_fbr') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? 0);
        $force = !empty($data['force']);

        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID is required.']);
            exit;
        }

        // Fetch Invoice Header
        $stmt = $pdo->prepare("SELECT si.*, COALESCE(cl.name, 'Walk-in Customer') as customer_name FROM sale_invoices si LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id WHERE si.id = ? AND si.company_id = ?");
        $stmt->execute([$id, $company_id]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found.']);
            exit;
        }

        if (intval($invoice['is_cancelled']) === 1) {
            echo json_encode(['status' => 'error', 'message' => 'Cannot submit a cancelled invoice to FBR.']);
            exit;
        }

        // Duplicate Submission Safeguard
        $isGenuineFbr = in_array($invoice['fbr_status'], ['Submitted', 'Accepted']) && !empty($invoice['fbr_invoice_number']) && $invoice['fbr_invoice_number'] !== 'Not Available' && $invoice['fbr_invoice_number'] !== 'None';
        if ($isGenuineFbr) {
            echo json_encode([
                'status' => 'info',
                'message' => "This invoice has already been successfully submitted to FBR (Ref: {$invoice['fbr_invoice_number']}). Duplicate submission prevented.",
                'fbr_invoice_number' => $invoice['fbr_invoice_number'],
                'fbr_status' => $invoice['fbr_status']
            ]);
            exit;
        }

        // Read POS FBR Settings
        $sett_stmt = $pdo->prepare("SELECT setting_key, setting_value FROM pos_settings WHERE company_id = ? ORDER BY id ASC");
        $sett_stmt->execute([$company_id]);
        $settings = [];
        while ($r = $sett_stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$r['setting_key']] = $r['setting_value'];
        }

        $fbr_enabled = ($settings['fbr_enable'] ?? '') === '1' || ($settings['fbr_enable'] ?? '') === 'true';
        $fbr_env = $settings['fbr_environment'] ?? 'sandbox';

        if (!$fbr_enabled) {
            $msg = 'FBR Integration is currently disabled in POS Settings. Please enable FBR Integration first.';
            $upd = $pdo->prepare("UPDATE sale_invoices SET fbr_status = 'Not Submitted', fbr_response = ? WHERE id = ?");
            $upd->execute([$msg, $id]);
            echo json_encode([
                'status' => 'error',
                'message' => $msg,
                'fbr_status' => 'Not Submitted'
            ]);
            exit;
        }

        // Branch-wise FBR Mapping Resolution
        $branch_id = intval($invoice['inventory_location_id'] ?? 0);
        $branch_info = null;
        if ($branch_id > 0) {
            $b_stmt = $pdo->prepare("SELECT id, branch_code, branch_name FROM company_branches WHERE id = ? AND company_id = ?");
            $b_stmt->execute([$branch_id, $company_id]);
            $branch_info = $b_stmt->fetch(PDO::FETCH_ASSOC);
        }
        $branch_code = $branch_info['branch_code'] ?? 'MAIN';
        $branch_name = $branch_info['branch_name'] ?? 'Main Branch';

        $fbr_pos_id = '';
        $branch_token = '';
        if ($branch_id > 0) {
            $map_stmt = $pdo->prepare("
                SELECT fbr_pos_id, pos_token, is_enabled, status 
                FROM pos_fbr_branch_mappings 
                WHERE company_id = ? AND branch_id = ? AND environment = ?
            ");
            $map_stmt->execute([$company_id, $branch_id, $fbr_env]);
            $mapping = $map_stmt->fetch(PDO::FETCH_ASSOC);

            if ($mapping) {
                if (intval($mapping['is_enabled']) === 0) {
                    $msg = "FBR Integration is disabled for branch '{$branch_name}' ({$branch_code}). Please enable it in POS Settings → FBR Integration.";
                    $upd = $pdo->prepare("UPDATE sale_invoices SET fbr_status = 'Not Submitted', fbr_response = ? WHERE id = ?");
                    $upd->execute([$msg, $id]);
                    echo json_encode(['status' => 'error', 'message' => $msg, 'fbr_status' => 'Not Submitted']);
                    exit;
                }
                $fbr_pos_id = trim($mapping['fbr_pos_id'] ?? '');
                $branch_token = trim($mapping['pos_token'] ?? '');
            }
        }

        // Fallback to central POS ID if no branch-specific ID assigned
        if (empty($fbr_pos_id)) {
            $fbr_pos_id = trim($settings['fbr_pos_id'] ?? '');
        }

        if (empty($fbr_pos_id)) {
            $msg = "FBR POS ID is not configured for branch '{$branch_name}' ({$branch_code}). Please assign an official POS ID in POS Settings → FBR Integration.";
            $upd = $pdo->prepare("UPDATE sale_invoices SET fbr_status = 'Not Submitted', fbr_response = ? WHERE id = ?");
            $upd->execute([$msg, $id]);
            echo json_encode([
                'status' => 'error',
                'message' => $msg,
                'fbr_status' => 'Not Submitted'
            ]);
            exit;
        }

        $central_token = ($fbr_env === 'production')
            ? ($settings['fbr_api_token_production'] ?? ($settings['fbr_api_token'] ?? ''))
            : ($settings['fbr_api_token_sandbox'] ?? ($settings['fbr_api_token'] ?? ''));

        $raw_token = !empty($branch_token) ? $branch_token : $central_token;
        $active_token = fbr_decrypt_token($raw_token);

        if (empty($active_token)) {
            $msg = 'API Authorization Token is missing. Please configure the FBR Token under POS Settings → FBR Integration.';
            $upd = $pdo->prepare("UPDATE sale_invoices SET fbr_status = 'Not Submitted', fbr_response = ? WHERE id = ?");
            $upd->execute([$msg, $id]);
            echo json_encode([
                'status' => 'error',
                'message' => $msg,
                'fbr_status' => 'Not Submitted'
            ]);
            exit;
        }

        // Safety: Prevent sandbox credentials in production
        if ($fbr_env === 'production') {
            if (stripos($active_token, 'sandbox') !== false || stripos($active_token, 'test') !== false) {
                echo json_encode([
                    'status' => 'error',
                    'message' => 'Safety Warning: Sandbox credentials cannot be used for live production invoice submission.'
                ]);
                exit;
            }
        }

        // Fetch invoice items
        $item_stmt = $pdo->prepare("
            SELECT sii.*, 
                   COALESCE(NULLIF(TRIM(inv.name), ''), NULLIF(TRIM(serv.name), ''), NULLIF(TRIM(sii.description), ''), 'Item') as item_title, 
                   COALESCE(NULLIF(TRIM(inv.code), ''), NULLIF(TRIM(serv.code), ''), '') as item_code,
                   COALESCE(NULLIF(TRIM(sii.hs_code), ''), NULLIF(TRIM(inv.hs_code), ''), '') as item_pct_raw
            FROM sale_invoice_items sii
            LEFT JOIN inv_items inv ON (sii.item_coa_id = inv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = inv.name))
            LEFT JOIN serv_items serv ON (sii.item_coa_id = serv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = serv.name))
            WHERE sii.invoice_id = ?
            ORDER BY sii.id ASC
        ");
        $item_stmt->execute([$id]);
        $items = $item_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Prepare FBR Payload compliant with standard FBR Digital Invoicing
        $fbr_items = [];
        $total_tax = 0;
        $total_qty = 0;
        foreach ($items as $item) {
            $qty = floatval($item['quantity'] ?? 1);
            $rate = floatval($item['rate'] ?? 0);
            $gross = floatval($item['gross_amount'] ?? ($qty * $rate));
            $tax_rate = floatval($item['sales_tax_rate'] ?? 0);
            $tax_amt = floatval($item['sales_tax_amount'] ?? 0);
            $fur_tax = floatval($item['further_tax_amount'] ?? 0);
            $disc = floatval($item['discount_amount'] ?? 0);
            $net = floatval($item['net_amount'] ?? ($gross - $disc + $tax_amt + $fur_tax));

            $total_tax += ($tax_amt + $fur_tax);
            $total_qty += $qty;

            // Resolve and format strictly 8 numeric digits PCT Code for FBR (Digits ONLY, NO dots, NO dashes)
            $rawPct = trim((string)($item['item_pct_raw'] ?? ''));
            if (empty($rawPct) && !empty($settings['fbr_default_pct_code'])) {
                $rawPct = trim($settings['fbr_default_pct_code']);
            }
            // Strip any non-digit character (removes dots, dashes, spaces, slashes)
            $digitsOnly = preg_replace('/\D/', '', $rawPct);
            if (empty($digitsOnly) || ltrim($digitsOnly, '0') === '') {
                $defaultDigits = !empty($settings['fbr_default_pct_code']) ? preg_replace('/\D/', '', $settings['fbr_default_pct_code']) : '';
                $digitsOnly = (strlen($defaultDigits) === 8) ? $defaultDigits : '19059000';
            }
            if (strlen($digitsOnly) < 8) {
                $digitsOnly = str_pad($digitsOnly, 8, '0', STR_PAD_RIGHT);
            } elseif (strlen($digitsOnly) > 8) {
                $digitsOnly = substr($digitsOnly, 0, 8);
            }
            $cleanPct = (string)$digitsOnly;

            $fbr_items[] = [
                'ItemCode' => !empty($item['item_code']) ? $item['item_code'] : 'GEN-ITEM',
                'ItemName' => $item['item_title'] ?? 'General Item',
                'Quantity' => $qty,
                'PCTCode' => $cleanPct,
                'TaxRate' => $tax_rate,
                'SaleValue' => round($gross, 2),
                'TotalAmount' => round($net, 2),
                'TaxCharged' => round($tax_amt, 2),
                'Discount' => round($disc, 2),
                'FurtherTax' => round($fur_tax, 2),
                'InvoiceType' => 1 // 1 for New Sale
            ];
        }

        $inv_no = !empty($invoice['pos_invoice_no']) ? $invoice['pos_invoice_no'] : ('INV-' . str_pad($invoice['serial_no'], 4, '0', STR_PAD_LEFT));
        $dateTime = !empty($invoice['created_at']) ? date('Y-m-d H:i:s', strtotime($invoice['created_at'])) : date('Y-m-d H:i:s');

        $fbr_payload = [
            'InvoiceNumber' => '',
            'POSID' => intval($fbr_pos_id),
            'USIN' => $inv_no,
            'DateTime' => $dateTime,
            'BuyerNTN' => $invoice['customer_ntn'] ?? '',
            'BuyerCNIC' => '',
            'BuyerName' => $invoice['customer_name'] ?? 'Walk-in Customer',
            'BuyerPhoneNumber' => $invoice['customer_telephone'] ?? '',
            'TotalSaleValue' => round(floatval($invoice['net_total']) - $total_tax, 2),
            'TotalQuantity' => $total_qty,
            'TotalBillAmount' => round(floatval($invoice['net_total']), 2),
            'TotalTaxCharged' => round($total_tax, 2),
            'Discount' => round(floatval($invoice['additional_discount']), 2),
            'PaymentMode' => 1, // 1: Cash
            'InvoiceType' => 1, // 1: New Sale
            'Items' => $fbr_items
        ];

        // API Post URL (Custom post endpoint or official FBR endpoints)
        $custom_post = ($fbr_env === 'production')
            ? ($settings['fbr_post_url_prod'] ?? ($settings['fbr_post_url'] ?? ($settings['fbr_base_url'] ?? '')))
            : ($settings['fbr_post_url'] ?? ($settings['fbr_base_url'] ?? ''));
        $api_url = fbr_get_official_endpoint('post', $fbr_env, $custom_post);

        // Execute API call via shared client
        $req = fbr_api_request($api_url, 'POST', $fbr_payload, $active_token, [
            'timeout' => 25,
            'connect_timeout' => 8
        ]);

        // Ensure submission logs table exists
        $pdo->exec("CREATE TABLE IF NOT EXISTS pos_fbr_submission_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            branch_id INT NULL,
            branch_code VARCHAR(50) NULL,
            branch_name VARCHAR(150) NULL,
            invoice_id INT NULL,
            erp_invoice_no VARCHAR(50) NOT NULL,
            environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
            fbr_pos_id VARCHAR(100) NULL,
            submission_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(30) NOT NULL,
            fbr_response_code VARCHAR(50) NULL,
            fbr_invoice_number VARCHAR(100) NULL,
            error_message TEXT NULL,
            response_payload LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_comp (company_id),
            INDEX idx_branch (branch_id),
            INDEX idx_inv (erp_invoice_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        if ($req['is_timeout'] || ($req['error'] && $req['http_code'] === 0)) {
            // Requirement C.8: If a posting request times out or result is uncertain, mark it Unknown/Pending Verification and check outcome before retrying.
            $safe_err = 'FBR Server Connection Timeout / Network Error: ' . ($req['error'] ?? 'Connection timed out');
            $upd = $pdo->prepare("UPDATE sale_invoices SET fbr_status = 'Pending Verification', fbr_response = ? WHERE id = ?");
            $upd->execute([$safe_err, $id]);

            // Record in submission log as Pending Verification
            $log_stmt = $pdo->prepare("
                INSERT INTO pos_fbr_submission_logs 
                    (company_id, branch_id, branch_code, branch_name, invoice_id, erp_invoice_no, environment, fbr_pos_id, submission_time, status, fbr_response_code, error_message, response_payload)
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'Pending Verification', 'TIMEOUT', ?, ?)
            ");
            $log_stmt->execute([$company_id, $branch_id, $branch_code, $branch_name, $id, $inv_no, $fbr_env, $fbr_pos_id, $safe_err, $req['error']]);

            echo json_encode([
                'status' => 'warning',
                'message' => "Network timeout communicating with FBR server. Invoice #{$inv_no} marked as 'Pending Verification'. Please check FBR status before attempting to resubmit.",
                'fbr_status' => 'Pending Verification'
            ]);
            exit;
        }

        $res_data = $req['data'];
        $eval = fbr_parse_api_response($req['http_code'], $res_data, $req['raw_response']);

        if ($eval['is_accepted']) {
            $fbr_ref = !empty($eval['fbr_invoice_number']) ? $eval['fbr_invoice_number'] : ('FBR-' . date('Ymd') . '-' . $inv_no);
            $qr_code = $eval['qr_code'];

            $upd = $pdo->prepare("
                UPDATE sale_invoices 
                SET fbr_status = 'Submitted', 
                    fbr_invoice_number = ?, 
                    fbr_qr_code = COALESCE(?, fbr_qr_code),
                    fbr_response = ?, 
                    fbr_submitted_at = NOW() 
                WHERE id = ?
            ");
            $upd->execute([$fbr_ref, $qr_code, json_encode($res_data, JSON_UNESCAPED_UNICODE), $id]);

            // Record in submission log
            $log_stmt = $pdo->prepare("
                INSERT INTO pos_fbr_submission_logs 
                    (company_id, branch_id, branch_code, branch_name, invoice_id, erp_invoice_no, environment, fbr_pos_id, submission_time, status, fbr_response_code, fbr_invoice_number, response_payload)
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'Submitted', ?, ?, ?)
            ");
            $log_stmt->execute([$company_id, $branch_id, $branch_code, $branch_name, $id, $inv_no, $fbr_env, $fbr_pos_id, strval($eval['response_code'] ?? '100'), $fbr_ref, json_encode($res_data, JSON_UNESCAPED_UNICODE)]);

            // Update branch connected status
            if ($branch_id > 0) {
                $updBranch = $pdo->prepare("UPDATE pos_fbr_branch_mappings SET status = 'Connected', connected_date = NOW(), last_test_result = 'Success', last_tested_at = NOW(), last_error = NULL WHERE company_id = ? AND branch_id = ? AND environment = ?");
                $updBranch->execute([$company_id, $branch_id, $fbr_env]);
            }

            logActivity('POS Sales Register', 'FBR_SUBMIT', $id, "Invoice #{$inv_no} submitted to FBR ({$branch_name}): {$fbr_ref}", null, $res_data);

            echo json_encode([
                'status' => 'success',
                'message' => "Successfully submitted to FBR! Assigned FBR Reference: {$fbr_ref} for branch {$branch_name}",
                'fbr_invoice_number' => $fbr_ref,
                'fbr_qr_code' => $qr_code,
                'fbr_status' => 'Submitted'
            ]);
            exit;
        } else {
            // FBR returned rejection or validation failure
            $safe_err_text = $eval['status_message'];

            $upd = $pdo->prepare("
                UPDATE sale_invoices 
                SET fbr_status = 'Rejected', 
                    fbr_response = ? 
                WHERE id = ?
            ");
            $upd->execute([$safe_err_text, $id]);

            // Record in submission log
            $log_stmt = $pdo->prepare("
                INSERT INTO pos_fbr_submission_logs 
                    (company_id, branch_id, branch_code, branch_name, invoice_id, erp_invoice_no, environment, fbr_pos_id, submission_time, status, fbr_response_code, error_message, response_payload)
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'Rejected', ?, ?, ?)
            ");
            $log_stmt->execute([$company_id, $branch_id, $branch_code, $branch_name, $id, $inv_no, $fbr_env, $fbr_pos_id, strval($eval['response_code'] ?? $req['http_code']), $safe_err_text, $req['raw_response']]);

            echo json_encode([
                'status' => 'error',
                'message' => "FBR Submission Notice: " . $safe_err_text,
                'fbr_status' => 'Rejected',
                'errors' => $eval['errors'],
                'response_data' => $res_data
            ]);
            exit;
        }
    }

    // -------------------------------------------------------------
    // ACTION: check_fbr_status (Verification against database & API)
    // -------------------------------------------------------------
    if ($action === 'check_fbr_status') {
        $id = intval($_GET['id'] ?? 0);
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID required.']);
            exit;
        }

        $stmt = $pdo->prepare("
            SELECT si.id, si.serial_no, si.pos_invoice_no, si.fbr_status, si.fbr_invoice_number, si.fbr_submitted_at, si.fbr_response,
                   cb.branch_name, cb.branch_code,
                   m.fbr_pos_id as branch_fbr_pos_id, m.identification_no as branch_ident_no, m.environment as branch_env
            FROM sale_invoices si
            LEFT JOIN company_branches cb ON si.inventory_location_id = cb.id
            LEFT JOIN pos_fbr_branch_mappings m ON si.inventory_location_id = m.branch_id AND m.company_id = si.company_id
            WHERE si.id = ? AND si.company_id = ?
        ");
        $stmt->execute([$id, $company_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found.']);
            exit;
        }

        echo json_encode([
            'status' => 'success',
            'data' => $row
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: cancel_invoice (Audited Cancellation with Reason)
    // -------------------------------------------------------------
    if ($action === 'cancel_invoice') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? 0);
        $reason = trim($data['reason'] ?? '');

        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID is required.']);
            exit;
        }
        if (empty($reason)) {
            echo json_encode(['status' => 'error', 'message' => 'Cancellation reason is mandatory.']);
            exit;
        }

        // Fetch invoice
        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found.']);
            exit;
        }
        if (intval($inv['is_cancelled']) === 1) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice is already cancelled.']);
            exit;
        }

        $user_id = $_SESSION['user_id'] ?? 1;

        // Perform cancellation
        $upd = $pdo->prepare("
            UPDATE sale_invoices 
            SET is_cancelled = 1, 
                cancel_reason = ?, 
                cancelled_by = ?, 
                cancelled_at = NOW(),
                pos_status = 'Cancelled'
            WHERE id = ? AND company_id = ?
        ");
        $upd->execute([$reason, $user_id, $id, $company_id]);

        $invNo = $inv['pos_invoice_no'] ?: ('INV-' . $inv['serial_no']);
        logActivity('POS Sales Register', 'CANCEL_INVOICE', $id, "POS Invoice #{$invNo} cancelled. Reason: {$reason}", $inv, ['is_cancelled' => 1, 'cancel_reason' => $reason]);

        echo json_encode([
            'status' => 'success',
            'message' => 'Invoice has been successfully marked as Cancelled.'
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: delete_invoice (Delete unposted POS Invoice)
    // -------------------------------------------------------------
    if ($action === 'delete_invoice') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? $_GET['id'] ?? 0);

        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID is required.']);
            exit;
        }

        // Fetch invoice
        $stmt = $pdo->prepare("SELECT id, serial_no, pos_invoice_no, fbr_status, fbr_invoice_number FROM sale_invoices WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found.']);
            exit;
        }

        // STRICT FBR SAFETY: Invoices posted to FBR can NEVER be deleted
        $fbrStatus = strtoupper(trim($inv['fbr_status'] ?? ''));
        $fbrNo = trim($inv['fbr_invoice_number'] ?? '');
        if ($fbrStatus === 'SUBMITTED' || $fbrStatus === 'ACCEPTED' || !empty($fbrNo)) {
            echo json_encode(['status' => 'error', 'message' => 'This invoice has already been posted to FBR and CANNOT be deleted.']);
            exit;
        }

        $invNo = $inv['pos_invoice_no'] ?: ('INV-' . $inv['serial_no']);
        $before_data = fetchRecordData('sale_invoices', 'sale_invoice_items', 'invoice_id', $id);

        $pdo->beginTransaction();
        try {
            $pdo->prepare("DELETE FROM sale_invoice_items WHERE invoice_id = ?")->execute([$id]);
            $del = $pdo->prepare("DELETE FROM sale_invoices WHERE id = ? AND company_id = ?");
            $del->execute([$id, $company_id]);
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => 'Failed to delete invoice: ' . $e->getMessage()]);
            exit;
        }

        logActivity('POS Sales Register', 'DELETE_INVOICE', $id, "Deleted unposted POS Invoice #{$invNo}", $before_data, null);

        echo json_encode([
            'status' => 'success',
            'message' => "Invoice #{$invNo} deleted successfully."
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: record_print (Track print / reprint counts)
    // -------------------------------------------------------------
    if ($action === 'record_print') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? 0);

        if ($id) {
            $pdo->prepare("
                UPDATE sale_invoices 
                SET print_count = COALESCE(print_count, 0) + 1, 
                    last_printed_at = NOW() 
                WHERE id = ? AND company_id = ?
            ")->execute([$id, $company_id]);
        }

        echo json_encode(['status' => 'success']);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: get_invoice_history
    // -------------------------------------------------------------
    if ($action === 'get_invoice_history') {
        $id = intval($_GET['id'] ?? 0);
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID required.']);
            exit;
        }

        $stmt = $pdo->prepare("
            SELECT si.*, u1.username as cancelled_by_name
            FROM sale_invoices si
            LEFT JOIN users u1 ON si.cancelled_by = u1.id
            WHERE si.id = ? AND si.company_id = ?
        ");
        $stmt->execute([$id, $company_id]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice not found.']);
            exit;
        }

        // Fetch user activity logs for this record
        $logs_stmt = $pdo->prepare("
            SELECT * FROM user_activity_logs 
            WHERE company_id = ? AND record_id = ? AND module_name IN ('Sale Invoice', 'POS Sale', 'POS Sales Register')
            ORDER BY id DESC
        ");
        $logs_stmt->execute([$company_id, strval($id)]);
        $logs = $logs_stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'invoice' => $inv,
            'logs' => $logs
        ]);
        exit;
    }

    pos_send_json(['status' => 'error', 'message' => 'Unknown action: ' . htmlspecialchars($action)], 400);

} catch (Throwable $e) {
    pos_send_json(['status' => 'error', 'message' => $e->getMessage()], 500);
}
?>
