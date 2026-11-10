<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Safe Error Reporting
ini_set('display_errors', 0);
error_reporting(E_ALL);

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);

// Ensure required tables & columns exist safely
try {
    // 1. Ensure sale_returns table exists
    $pdo->exec("CREATE TABLE IF NOT EXISTS sale_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        is_tax_return TINYINT(1) DEFAULT 0,
        return_date DATE,
        return_type VARCHAR(50),
        sale_invoice_no VARCHAR(100),
        sale_invoice_date DATE,
        nature_of_credit_note VARCHAR(100),
        payment_terms VARCHAR(255),
        income_account VARCHAR(50),
        customer_coa_id INT NOT NULL,
        inventory_location_id INT,
        job_no VARCHAR(100),
        employee_ref VARCHAR(100),
        amount_in_words VARCHAR(255),
        remarks TEXT,
        carriage_freight DECIMAL(15,2) DEFAULT 0,
        additional_discount DECIMAL(15,2) DEFAULT 0,
        net_total DECIMAL(15,2) DEFAULT 0,
        amount_paid DECIMAL(15,2) DEFAULT 0,
        is_cancelled TINYINT DEFAULT 0,
        is_posted TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Ensure sale_return_items table exists
    $pdo->exec("CREATE TABLE IF NOT EXISTS sale_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_id INT NOT NULL,
        item_coa_id INT NOT NULL,
        description TEXT,
        pieces DECIMAL(15,2) DEFAULT 0,
        quantity DECIMAL(15,2) DEFAULT 0,
        unit VARCHAR(50),
        rate DECIMAL(15,2) DEFAULT 0,
        gross_amount DECIMAL(15,2) DEFAULT 0,
        discount_percent DECIMAL(15,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        sales_tax_rate DECIMAL(15,2) DEFAULT 0,
        sales_tax_amount DECIMAL(15,2) DEFAULT 0,
        further_tax_rate DECIMAL(15,2) DEFAULT 0,
        further_tax_amount DECIMAL(15,2) DEFAULT 0,
        net_amount DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3. Add POS return specific columns to sale_returns
    $srCols = $pdo->query("SHOW COLUMNS FROM sale_returns")->fetchAll(PDO::FETCH_COLUMN);
    $srNewCols = [
        'pos_return_no' => 'VARCHAR(100) NULL',
        'pos_invoice_id' => 'INT NULL',
        'return_reason' => 'VARCHAR(100) NULL',
        'stock_condition' => 'VARCHAR(50) DEFAULT "Resalable"',
        'refund_method' => 'VARCHAR(50) DEFAULT "Cash Refund"',
        'refund_account_coa_id' => 'INT NULL',
        'refund_ref_no' => 'VARCHAR(100) NULL',
        'return_status' => 'VARCHAR(50) DEFAULT "Approved"',
        'fbr_status' => 'VARCHAR(50) DEFAULT "Not Submitted"',
        'fbr_credit_note_no' => 'VARCHAR(100) NULL',
        'original_fbr_invoice_ref' => 'VARCHAR(100) NULL',
        'fbr_response' => 'TEXT NULL',
        'fbr_submitted_at' => 'DATETIME NULL',
        'created_by_user_id' => 'INT NULL'
    ];
    foreach ($srNewCols as $col => $def) {
        if (!in_array($col, $srCols)) {
            try { $pdo->exec("ALTER TABLE sale_returns ADD COLUMN `$col` $def"); } catch (Exception $e) {}
        }
    }

    // 4. Add original item tracking to sale_return_items
    $sriCols = $pdo->query("SHOW COLUMNS FROM sale_return_items")->fetchAll(PDO::FETCH_COLUMN);
    $sriNewCols = [
        'original_invoice_item_id' => 'INT NULL',
        'original_sold_qty' => 'DECIMAL(15,2) DEFAULT 0',
        'previously_returned_qty' => 'DECIMAL(15,2) DEFAULT 0'
    ];
    foreach ($sriNewCols as $col => $def) {
        if (!in_array($col, $sriCols)) {
            try { $pdo->exec("ALTER TABLE sale_return_items ADD COLUMN `$col` $def"); } catch (Exception $e) {}
        }
    }
} catch (Exception $e) {}

try {
    // -------------------------------------------------------------
    // ACTION: search_invoices (Search POS Invoices for Return)
    // -------------------------------------------------------------
    if ($action === 'search_invoices') {
        $term = trim($_GET['q'] ?? $_GET['term'] ?? '');
        $branch_id = intval($_GET['branch_id'] ?? 0);
        $query = "
            SELECT 
                si.id, 
                si.serial_no, 
                si.pos_invoice_no, 
                si.invoice_date, 
                si.created_at,
                si.net_total, 
                si.amount_received,
                si.fbr_status,
                si.fbr_invoice_number,
                si.payment_terms,
                COALESCE(c.name, 'Walk-in Customer') as customer_name,
                COALESCE(si.customer_telephone, c.mobile, c.phone, '') as customer_mobile,
                COALESCE(b.branch_name, 'Main / Default') as branch_name,
                (SELECT COUNT(*) FROM sale_invoice_items WHERE invoice_id = si.id) as items_count
            FROM sale_invoices si
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            LEFT JOIN company_branches b ON si.inventory_location_id = b.id
            WHERE si.company_id = ? 
              AND si.invoice_type = 'POS'
              AND si.is_cancelled = 0
        ";
        $params = [$company_id];

        if ($branch_id > 0) {
            $query .= " AND si.inventory_location_id = ?";
            $params[] = $branch_id;
        }

        if ($term !== '') {
            $query .= " AND (si.pos_invoice_no LIKE ? OR CAST(si.serial_no AS CHAR) LIKE ? OR c.name LIKE ? OR c.mobile LIKE ? OR si.customer_telephone LIKE ? OR si.fbr_invoice_number LIKE ?)";
            $lk = "%{$term}%";
            $params = array_merge($params, [$lk, $lk, $lk, $lk, $lk, $lk]);
        }

        $query .= " ORDER BY si.id DESC LIMIT 30";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$r) {
            $r['formatted_invoice_no'] = !empty($r['pos_invoice_no']) ? $r['pos_invoice_no'] : ('INV-' . str_pad($r['serial_no'], 4, '0', STR_PAD_LEFT));
        }

        echo json_encode(['status' => 'success', 'data' => $rows]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: get_invoice_for_return (Fetch original invoice + available quantities)
    // -------------------------------------------------------------
    if ($action === 'get_invoice_for_return') {
        $inv_id = intval($_GET['invoice_id'] ?? 0);
        $inv_no = trim($_GET['invoice_no'] ?? '');
        $branch_id = intval($_GET['branch_id'] ?? 0);

        if (!$inv_id && empty($inv_no)) {
            echo json_encode(['status' => 'error', 'message' => 'Invoice ID or Number is required.']);
            exit;
        }

        // Fetch invoice header
        if ($inv_id > 0) {
            $q = "
                SELECT si.*, 
                       COALESCE(c.name, 'Walk-in Customer') as customer_name,
                       COALESCE(si.customer_telephone, c.mobile, c.phone, '') as customer_mobile,
                       COALESCE(si.customer_address, c.address, '') as customer_full_address,
                       COALESCE(si.customer_ntn, c.ntn, '') as customer_ntn_val,
                       COALESCE(b.branch_name, 'Main / Default') as branch_name,
                       COALESCE(b.branch_code, '') as branch_code
                FROM sale_invoices si
                LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                LEFT JOIN company_branches b ON si.inventory_location_id = b.id
                WHERE si.id = ? AND si.company_id = ?
            ";
            $p = [$inv_id, $company_id];
            if ($branch_id > 0) {
                $q .= " AND si.inventory_location_id = ?";
                $p[] = $branch_id;
            }
            $stmt = $pdo->prepare($q);
            $stmt->execute($p);
        } else {
            $q = "
                SELECT si.*, 
                       COALESCE(c.name, 'Walk-in Customer') as customer_name,
                       COALESCE(si.customer_telephone, c.mobile, c.phone, '') as customer_mobile,
                       COALESCE(si.customer_address, c.address, '') as customer_full_address,
                       COALESCE(si.customer_ntn, c.ntn, '') as customer_ntn_val,
                       COALESCE(b.branch_name, 'Main / Default') as branch_name,
                       COALESCE(b.branch_code, '') as branch_code
                FROM sale_invoices si
                LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                LEFT JOIN company_branches b ON si.inventory_location_id = b.id
                WHERE (si.pos_invoice_no = ? OR CAST(si.serial_no AS CHAR) = ?) AND si.company_id = ?
            ";
            $p = [$inv_no, $inv_no, $company_id];
            if ($branch_id > 0) {
                $q .= " AND si.inventory_location_id = ?";
                $p[] = $branch_id;
            }
            $q .= " LIMIT 1";
            $stmt = $pdo->prepare($q);
            $stmt->execute($p);
        }

        $header = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$header) {
            echo json_encode(['status' => 'error', 'message' => 'Original invoice not found or does not belong to active company.']);
            exit;
        }

        if (intval($header['is_cancelled']) === 1) {
            echo json_encode(['status' => 'error', 'message' => 'This invoice is already cancelled. Cannot process a return on a cancelled invoice.']);
            exit;
        }

        $header['formatted_invoice_no'] = !empty($header['pos_invoice_no']) ? $header['pos_invoice_no'] : ('INV-' . str_pad($header['serial_no'], 4, '0', STR_PAD_LEFT));

        // Fetch original items
        $item_stmt = $pdo->prepare("
            SELECT 
                sii.*,
                COALESCE(NULLIF(TRIM(inv.code), ''), NULLIF(TRIM(serv.code), ''), '') as item_code,
                COALESCE(NULLIF(TRIM(sii.hs_code), ''), NULLIF(TRIM(inv.hs_code), ''), '') as barcode,
                COALESCE(NULLIF(TRIM(inv.name), ''), NULLIF(TRIM(serv.name), ''), NULLIF(TRIM(sii.description), ''), 'Item') as item_title
            FROM sale_invoice_items sii
            LEFT JOIN inv_items inv ON (sii.item_coa_id = inv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = inv.name))
            LEFT JOIN serv_items serv ON (sii.item_coa_id = serv.id OR (sii.description IS NOT NULL AND sii.description != '' AND sii.description = serv.name))
            WHERE sii.invoice_id = ?
            ORDER BY sii.id ASC
        ");
        $item_stmt->execute([$header['id']]);
        $raw_items = $item_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate previously returned quantities for each item across all past non-cancelled returns
        $items = [];
        $total_available_qty = 0;

        foreach ($raw_items as $it) {
            $sold_qty = floatval($it['quantity'] ?? 0);

            // Query previously returned quantity
            $ret_stmt = $pdo->prepare("
                SELECT COALESCE(SUM(sri.quantity), 0) as returned_qty
                FROM sale_return_items sri
                JOIN sale_returns sr ON sri.return_id = sr.id
                WHERE sr.company_id = ?
                  AND sr.is_cancelled = 0
                  AND (sr.pos_invoice_id = ? OR sr.sale_invoice_no = ? OR sr.sale_invoice_no = ?)
                  AND (sri.original_invoice_item_id = ? OR sri.item_coa_id = ?)
            ");
            $ret_stmt->execute([
                $company_id,
                $header['id'],
                $header['pos_invoice_no'],
                strval($header['serial_no']),
                $it['id'],
                $it['item_coa_id']
            ]);
            $prev_ret_qty = floatval($ret_stmt->fetchColumn() ?: 0);
            $available_qty = max(0, $sold_qty - $prev_ret_qty);
            $total_available_qty += $available_qty;

            $unit_rate = floatval($it['rate'] ?? 0);
            $gross = floatval($it['gross_amount'] ?? ($sold_qty * $unit_rate));
            $disc = floatval($it['discount_amount'] ?? 0);
            $unit_discount = $sold_qty > 0 ? ($disc / $sold_qty) : 0;
            $tax_rate = floatval($it['sales_tax_rate'] ?? 0);
            $fur_tax_rate = floatval($it['further_tax_rate'] ?? 0);

            $it['sold_qty'] = $sold_qty;
            $it['previously_returned_qty'] = $prev_ret_qty;
            $it['available_return_qty'] = $available_qty;
            $it['unit_rate'] = $unit_rate;
            $it['unit_discount'] = $unit_discount;
            $it['tax_rate'] = $tax_rate;
            $it['further_tax_rate'] = $fur_tax_rate;

            $items[] = $it;
        }

        echo json_encode([
            'status' => 'success',
            'header' => $header,
            'items' => $items,
            'total_available_qty' => $total_available_qty,
            'is_fully_returned' => ($total_available_qty <= 0)
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: get_next_return_no (Sequential return number)
    // -------------------------------------------------------------
    if ($action === 'get_next_return_no') {
        $branch_id = intval($_GET['branch_id'] ?? 0);
        $prefix = 'RET-';

        if ($branch_id > 0) {
            $b_stmt = $pdo->prepare("SELECT invoice_series, branch_code FROM company_branches WHERE id = ?");
            $b_stmt->execute([$branch_id]);
            $branch = $b_stmt->fetch(PDO::FETCH_ASSOC);
            if ($branch && !empty($branch['invoice_series'])) {
                $prefix = rtrim($branch['invoice_series'], '-') . '-RET-';
            } elseif ($branch && !empty($branch['branch_code'])) {
                $prefix = $branch['branch_code'] . '-RET-';
            }
        }

        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_returns WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        $next_sn = intval($row['max_sn'] ?? 0) + 1;
        $formatted = $prefix . str_pad($next_sn, 4, '0', STR_PAD_LEFT);

        echo json_encode([
            'status' => 'success',
            'next_sn' => $next_sn,
            'return_no' => $formatted
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: get_form_lookups (Branches, Warehouses, Cash/Bank Accounts)
    // -------------------------------------------------------------
    if ($action === 'get_form_lookups') {
        // Active Branches
        $b_stmt = $pdo->prepare("SELECT id, branch_code, branch_name FROM company_branches WHERE company_id = ? AND status = 'Active' ORDER BY branch_name ASC");
        $b_stmt->execute([$company_id]);
        $branches = $b_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Warehouses / Inventory Locations
        $w_stmt = $pdo->prepare("SELECT id, name FROM inv_locations WHERE company_id = ? ORDER BY name ASC");
        $w_stmt->execute([$company_id]);
        $warehouses = $w_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Cash Accounts
        $c_stmt = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name 
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ? AND (TRIM(LOWER(cm.name)) LIKE '%cash%' OR cl.name LIKE '%Cash%')
            ORDER BY cl.name ASC
        ");
        $c_stmt->execute([$company_id]);
        $cash_accounts = $c_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Bank Accounts
        $bk_stmt = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name 
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ? AND (TRIM(LOWER(cm.name)) LIKE '%bank%' OR cl.name LIKE '%Bank%')
            ORDER BY cl.name ASC
        ");
        $bk_stmt->execute([$company_id]);
        $bank_accounts = $bk_stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'branches' => $branches,
            'warehouses' => $warehouses,
            'cash_accounts' => $cash_accounts,
            'bank_accounts' => $bank_accounts
        ]);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: save_return (Process & Validate POS Sales Return)
    // -------------------------------------------------------------
    if ($action === 'save_return') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid return payload.']);
            exit;
        }

        $orig_inv_id = intval($data['pos_invoice_id'] ?? 0);
        $items = $data['items'] ?? [];

        if (!$orig_inv_id) {
            echo json_encode(['status' => 'error', 'message' => 'Original Invoice selection is mandatory.']);
            exit;
        }
        if (empty($items)) {
            echo json_encode(['status' => 'error', 'message' => 'No items specified for return.']);
            exit;
        }

        // Fetch original invoice to lock & validate
        $orig_stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE id = ? AND company_id = ?");
        $orig_stmt->execute([$orig_inv_id, $company_id]);
        $orig_inv = $orig_stmt->fetch(PDO::FETCH_ASSOC);

        if (!$orig_inv) {
            echo json_encode(['status' => 'error', 'message' => 'Original invoice not found.']);
            exit;
        }
        if (intval($orig_inv['is_cancelled']) === 1) {
            echo json_encode(['status' => 'error', 'message' => 'Original invoice has been cancelled. Cannot return.']);
            exit;
        }

        // Validate each item return quantity against available
        $validated_items = [];
        $calculated_subtotal = 0;
        $calculated_discount = 0;
        $calculated_tax = 0;

        foreach ($items as $item) {
            $ret_qty = floatval($item['return_qty'] ?? 0);
            if ($ret_qty <= 0) continue; // Skip zero quantity rows

            $orig_item_id = intval($item['original_invoice_item_id'] ?? 0);
            $item_coa_id = intval($item['item_coa_id'] ?? 0);

            // Fetch original line item
            $oi_stmt = $pdo->prepare("SELECT * FROM sale_invoice_items WHERE id = ? AND invoice_id = ?");
            $oi_stmt->execute([$orig_item_id, $orig_inv_id]);
            $orig_row = $oi_stmt->fetch(PDO::FETCH_ASSOC);

            if (!$orig_row) {
                echo json_encode(['status' => 'error', 'message' => "Invalid line item (ID: {$orig_item_id}) for this invoice."]);
                exit;
            }

            $sold_qty = floatval($orig_row['quantity'] ?? 0);

            // Calculate past returns on this exact item
            $pr_stmt = $pdo->prepare("
                SELECT COALESCE(SUM(sri.quantity), 0)
                FROM sale_return_items sri
                JOIN sale_returns sr ON sri.return_id = sr.id
                WHERE sr.company_id = ?
                  AND sr.is_cancelled = 0
                  AND (sr.pos_invoice_id = ? OR sr.sale_invoice_no = ?)
                  AND sri.original_invoice_item_id = ?
            ");
            $pr_stmt->execute([$company_id, $orig_inv_id, $orig_inv['pos_invoice_no'], $orig_item_id]);
            $prev_returned = floatval($pr_stmt->fetchColumn() ?: 0);
            $available = max(0, $sold_qty - $prev_returned);

            if ($ret_qty > $available) {
                echo json_encode([
                    'status' => 'error',
                    'message' => "Return quantity ({$ret_qty}) exceeds available returnable quantity ({$available}) for item '{$orig_row['description']}'."
                ]);
                exit;
            }

            // Calculations based on original invoice item rates
            $rate = floatval($orig_row['rate'] ?? 0);
            $gross = round($ret_qty * $rate, 2);

            // Pro-rata discount
            $disc_percent = floatval($orig_row['discount_percent'] ?? 0);
            $disc_amt = $sold_qty > 0 ? round((floatval($orig_row['discount_amount'] ?? 0) / $sold_qty) * $ret_qty, 2) : 0;

            // Pro-rata tax
            $st_rate = floatval($orig_row['sales_tax_rate'] ?? 0);
            $ft_rate = floatval($orig_row['further_tax_rate'] ?? 0);
            $taxable_amt = max(0, $gross - $disc_amt);
            $st_amt = round(($taxable_amt * $st_rate) / 100, 2);
            $ft_amt = round(($taxable_amt * $ft_rate) / 100, 2);
            $net = round($taxable_amt + $st_amt + $ft_amt, 2);

            $calculated_subtotal += $gross;
            $calculated_discount += $disc_amt;
            $calculated_tax += ($st_amt + $ft_amt);

            $validated_items[] = [
                'item_coa_id' => $item_coa_id ?: $orig_row['item_coa_id'],
                'original_invoice_item_id' => $orig_item_id,
                'description' => $orig_row['description'],
                'pieces' => floatval($item['pieces'] ?? 0),
                'quantity' => $ret_qty,
                'original_sold_qty' => $sold_qty,
                'previously_returned_qty' => $prev_returned,
                'unit' => $orig_row['unit'],
                'rate' => $rate,
                'gross_amount' => $gross,
                'discount_percent' => $disc_percent,
                'discount_amount' => $disc_amt,
                'sales_tax_rate' => $st_rate,
                'sales_tax_amount' => $st_amt,
                'further_tax_rate' => $ft_rate,
                'further_tax_amount' => $ft_amt,
                'net_amount' => $net
            ];
        }

        if (empty($validated_items)) {
            echo json_encode(['status' => 'error', 'message' => 'Please enter a valid return quantity greater than zero.']);
            exit;
        }

        $net_return_total = round($calculated_subtotal - $calculated_discount + $calculated_tax, 2);
        $refund_amt = isset($data['refund_amount']) ? floatval($data['refund_amount']) : $net_return_total;
        if ($refund_amt > $net_return_total) {
            $refund_amt = $net_return_total;
        }

        // Determine stock condition & return location
        $stock_cond = $data['stock_condition'] ?? 'Resalable';
        $location_id = null;
        if ($stock_cond === 'Resalable') {
            // Return to branch inventory location
            $location_id = $data['inventory_location_id'] ?: $orig_inv['inventory_location_id'] ?: null;
        } else {
            // Damaged / Inspection: route to specified inspection warehouse or null to avoid normal saleable stock
            $location_id = $data['damaged_warehouse_id'] ?: null;
        }

        // Determine Return Number & Serial Number
        $sn_stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_returns WHERE company_id = ?");
        $sn_stmt->execute([$company_id]);
        $next_sn = intval($sn_stmt->fetchColumn() ?: 0) + 1;

        $pos_ret_no = trim($data['pos_return_no'] ?? '');
        if (empty($pos_ret_no)) {
            $pos_ret_no = 'POS-RET-' . str_pad($next_sn, 4, '0', STR_PAD_LEFT);
        }

        // FBR Status determination
        $orig_fbr_status = $orig_inv['fbr_status'] ?? 'Not Submitted';
        $orig_fbr_ref = $orig_inv['fbr_invoice_number'] ?? '';
        $fbr_status = in_array($orig_fbr_status, ['Submitted', 'Accepted']) ? 'Pending' : 'Not Required';

        $pdo->beginTransaction();
        try {
            $ret_fields = [
                'company_id' => $company_id,
                'serial_no' => $next_sn,
                'pos_return_no' => $pos_ret_no,
                'pos_invoice_id' => $orig_inv_id,
                'is_tax_return' => $orig_inv['is_tax_invoice'] ? 1 : 0,
                'return_date' => $data['return_date'] ?: date('Y-m-d'),
                'return_type' => $data['return_type'] ?: 'Sale Return',
                'return_reason' => $data['return_reason'] ?? 'Customer Request',
                'stock_condition' => $stock_cond,
                'refund_method' => $data['refund_method'] ?? 'Cash Refund',
                'refund_account_coa_id' => $data['refund_account_coa_id'] ?: null,
                'refund_ref_no' => $data['refund_ref_no'] ?? null,
                'sale_invoice_no' => $orig_inv['pos_invoice_no'] ?: ('INV-' . $orig_inv['serial_no']),
                'sale_invoice_date' => $orig_inv['invoice_date'],
                'nature_of_credit_note' => 'Sale Return (POS)',
                'payment_terms' => $data['refund_method'] ?? 'Cash',
                'income_account' => $orig_inv['income_account'] ?: 'Sales',
                'customer_coa_id' => $orig_inv['customer_coa_id'],
                'customer_address' => $orig_inv['customer_address'] ?? '',
                'customer_telephone' => $orig_inv['customer_telephone'] ?? '',
                'customer_ntn' => $orig_inv['customer_ntn'] ?? '',
                'customer_gst' => $orig_inv['customer_gst'] ?? '',
                'inventory_location_id' => $location_id,
                'job_no' => $orig_inv['job_no'] ?? '',
                'employee_ref' => $orig_inv['employee_ref'] ?? '',
                'amount_in_words' => '',
                'remarks' => $data['remarks'] ?: "POS Sales Return for Invoice #{$orig_inv['pos_invoice_no']}",
                'carriage_freight' => 0,
                'additional_discount' => $calculated_discount,
                'net_total' => $net_return_total,
                'amount_paid' => $refund_amt,
                'return_status' => $data['return_status'] ?? 'Approved',
                'fbr_status' => $fbr_status,
                'original_fbr_invoice_ref' => $orig_fbr_ref,
                'is_cancelled' => 0,
                'is_posted' => 1,
                'created_by_user_id' => $_SESSION['user_id'] ?? 1
            ];

            $cols = implode(', ', array_map(function($c) { return "`$c`"; }, array_keys($ret_fields)));
            $placeholders = implode(', ', array_fill(0, count($ret_fields), '?'));
            $ins_stmt = $pdo->prepare("INSERT INTO sale_returns ($cols) VALUES ($placeholders)");
            $ins_stmt->execute(array_values($ret_fields));
            $return_id = $pdo->lastInsertId();

            // Insert line items
            $item_ins = $pdo->prepare("
                INSERT INTO sale_return_items (
                    return_id, item_coa_id, original_invoice_item_id, description, pieces, quantity,
                    original_sold_qty, previously_returned_qty, unit, rate, gross_amount,
                    discount_percent, discount_amount, sales_tax_rate, sales_tax_amount,
                    further_tax_rate, further_tax_amount, net_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($validated_items as $v) {
                $item_ins->execute([
                    $return_id,
                    $v['item_coa_id'],
                    $v['original_invoice_item_id'],
                    $v['description'],
                    $v['pieces'],
                    $v['quantity'],
                    $v['original_sold_qty'],
                    $v['previously_returned_qty'],
                    $v['unit'],
                    $v['rate'],
                    $v['gross_amount'],
                    $v['discount_percent'],
                    $v['discount_amount'],
                    $v['sales_tax_rate'],
                    $v['sales_tax_amount'],
                    $v['further_tax_rate'],
                    $v['further_tax_amount'],
                    $v['net_amount']
                ]);
            }

            $pdo->commit();

            logActivity(
                'POS Sales Return', 
                'INSERT', 
                $return_id, 
                "POS Return #{$pos_ret_no} for Inv #{$orig_inv['pos_invoice_no']}", 
                null, 
                ['return_id' => $return_id, 'net_total' => $net_return_total, 'refund_amount' => $refund_amt]
            );

            echo json_encode([
                'status' => 'success',
                'id' => $return_id,
                'return_no' => $pos_ret_no,
                'net_total' => $net_return_total,
                'refund_amount' => $refund_amt,
                'fbr_status' => $fbr_status,
                'message' => "POS Sales Return #{$pos_ret_no} saved successfully!"
            ]);
            exit;

        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => 'Failed to save return: ' . $e->getMessage()]);
            exit;
        }
    }

    // -------------------------------------------------------------
    // ACTION: get_return (View Return Voucher & Receipt)
    // -------------------------------------------------------------
    if ($action === 'get_return') {
        $id = intval($_GET['id'] ?? 0);
        $ret_no = trim($_GET['return_no'] ?? '');

        if (!$id && empty($ret_no)) {
            echo json_encode(['status' => 'error', 'message' => 'Return ID required.']);
            exit;
        }

        $query = "
            SELECT 
                sr.*,
                COALESCE(c.name, 'Walk-in Customer') as customer_name,
                COALESCE(sr.customer_telephone, c.mobile, c.phone, '') as customer_mobile,
                COALESCE(sr.customer_address, c.address, '') as customer_full_address,
                b.branch_name,
                b.branch_code,
                b.address as branch_address,
                b.contact_number as branch_contact,
                u.username as created_by_username
            FROM sale_returns sr
            LEFT JOIN coa_list c ON sr.customer_coa_id = c.id
            LEFT JOIN company_branches b ON sr.inventory_location_id = b.id
            LEFT JOIN users u ON sr.created_by_user_id = u.id
            WHERE sr.company_id = ?
        ";
        $params = [$company_id];

        if ($id > 0) {
            $query .= " AND sr.id = ?";
            $params[] = $id;
        } else {
            $query .= " AND (sr.pos_return_no = ? OR CAST(sr.serial_no AS CHAR) = ?)";
            $params[] = $ret_no;
            $params[] = $ret_no;
        }

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $header = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$header) {
            echo json_encode(['status' => 'error', 'message' => 'Sales return voucher not found.']);
            exit;
        }

        // Fetch line items
        $i_stmt = $pdo->prepare("
            SELECT sri.*, 
                   COALESCE(NULLIF(TRIM(inv.code), ''), NULLIF(TRIM(serv.code), ''), '') as item_code, 
                   COALESCE(NULLIF(TRIM(inv.name), ''), NULLIF(TRIM(serv.name), ''), NULLIF(TRIM(sri.description), ''), 'Item') as item_title
            FROM sale_return_items sri
            LEFT JOIN inv_items inv ON (sri.item_coa_id = inv.id OR (sri.description IS NOT NULL AND sri.description != '' AND sri.description = inv.name))
            LEFT JOIN serv_items serv ON (sri.item_coa_id = serv.id OR (sri.description IS NOT NULL AND sri.description != '' AND sri.description = serv.name))
            WHERE sri.return_id = ?
            ORDER BY sri.id ASC
        ");
        $i_stmt->execute([$header['id']]);
        $items = $i_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch company / pos receipt settings
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
    // ACTION: submit_fbr_credit_note (Submit Digital Credit Note to FBR)
    // -------------------------------------------------------------
    if ($action === 'submit_fbr_credit_note') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? 0);

        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Return ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT * FROM sale_returns WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $ret = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ret) {
            echo json_encode(['status' => 'error', 'message' => 'Return record not found.']);
            exit;
        }
        if (intval($ret['is_cancelled']) === 1) {
            echo json_encode(['status' => 'error', 'message' => 'Cannot submit a cancelled return to FBR.']);
            exit;
        }

        if (in_array($ret['fbr_status'], ['Submitted', 'Accepted'])) {
            echo json_encode([
                'status' => 'info',
                'message' => 'This Credit Note has already been submitted to FBR.',
                'fbr_credit_note_no' => $ret['fbr_credit_note_no']
            ]);
            exit;
        }

        // Read POS FBR settings
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

        $fbr_enabled = ($settings['fbr_enable'] ?? '') === '1' || ($settings['fbr_enable'] ?? '') === 'true';
        $fbr_env = $settings['fbr_environment'] ?? 'sandbox';
        $fbr_pos_id = trim($settings['fbr_pos_id'] ?? '');
        $fbr_api_token = trim($settings['fbr_api_token'] ?? '');

        if (!$fbr_enabled || empty($fbr_pos_id) || empty($fbr_api_token)) {
            $msg = 'FBR Integration is not enabled or credentials (POS ID / API Token) are missing in POS Settings. Please configure FBR under POS Settings.';
            $upd = $pdo->prepare("UPDATE sale_returns SET fbr_status = 'Not Submitted', fbr_response = ? WHERE id = ?");
            $upd->execute([$msg, $id]);
            echo json_encode(['status' => 'error', 'message' => $msg, 'fbr_status' => 'Not Submitted']);
            exit;
        }

        // Fetch return items
        $i_stmt = $pdo->prepare("
            SELECT sri.*, 
                   COALESCE(NULLIF(TRIM(inv.code), ''), NULLIF(TRIM(serv.code), ''), '') as item_code, 
                   COALESCE(NULLIF(TRIM(sri.hs_code), ''), NULLIF(TRIM(inv.hs_code), ''), '00000000') as pct_code, 
                   COALESCE(NULLIF(TRIM(inv.name), ''), NULLIF(TRIM(serv.name), ''), NULLIF(TRIM(sri.description), ''), 'Item') as item_title
            FROM sale_return_items sri
            LEFT JOIN inv_items inv ON (sri.item_coa_id = inv.id OR (sri.description IS NOT NULL AND sri.description != '' AND sri.description = inv.name))
            LEFT JOIN serv_items serv ON (sri.item_coa_id = serv.id OR (sri.description IS NOT NULL AND sri.description != '' AND sri.description = serv.name))
            WHERE sri.return_id = ?
        ");
        $i_stmt->execute([$id]);
        $items = $i_stmt->fetchAll(PDO::FETCH_ASSOC);

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

            $rawRetPct = trim((string)($item['pct_code'] ?? ''));
            $digitsRetPct = preg_replace('/\D/', '', $rawRetPct);
            if (empty($digitsRetPct) || ltrim($digitsRetPct, '0') === '') {
                $digitsRetPct = '19059000';
            }
            if (strlen($digitsRetPct) < 8) {
                $digitsRetPct = str_pad($digitsRetPct, 8, '0', STR_PAD_RIGHT);
            } elseif (strlen($digitsRetPct) > 8) {
                $digitsRetPct = substr($digitsRetPct, 0, 8);
            }

            $fbr_items[] = [
                'ItemCode' => $item['item_code'] ?: 'GEN-ITEM',
                'ItemName' => $item['item_title'] ?: 'General Item',
                'Quantity' => $qty,
                'PCTCode' => (string)$digitsRetPct,
                'TaxRate' => $tax_rate,
                'SaleValue' => round($gross, 2),
                'TotalAmount' => round($net, 2),
                'TaxCharged' => round($tax_amt, 2),
                'Discount' => round($disc, 2),
                'FurtherTax' => round($fur_tax, 2),
                'InvoiceType' => 3 // 3: Credit Note / Sale Return
            ];
        }

        $ret_no = $ret['pos_return_no'] ?: ('RET-' . $ret['serial_no']);
        $orig_ref = $ret['original_fbr_invoice_ref'] ?: $ret['sale_invoice_no'];
        $dateTime = !empty($ret['created_at']) ? date('Y-m-d H:i:s', strtotime($ret['created_at'])) : date('Y-m-d H:i:s');

        $fbr_payload = [
            'InvoiceNumber' => '',
            'POSID' => intval($fbr_pos_id),
            'USIN' => $ret_no,
            'RefUSIN' => $orig_ref,
            'DateTime' => $dateTime,
            'BuyerNTN' => $ret['customer_ntn'] ?? '',
            'BuyerCNIC' => '',
            'BuyerName' => $ret['customer_name'] ?? 'Walk-in Customer',
            'BuyerPhoneNumber' => $ret['customer_telephone'] ?? '',
            'TotalSaleValue' => round(floatval($ret['net_total']) - $total_tax, 2),
            'TotalQuantity' => $total_qty,
            'TotalBillAmount' => round(floatval($ret['net_total']), 2),
            'TotalTaxCharged' => round($total_tax, 2),
            'Discount' => round(floatval($ret['additional_discount']), 2),
            'PaymentMode' => 1,
            'InvoiceType' => 3, // Credit Note
            'Items' => $fbr_items
        ];

        $api_url = ($fbr_env === 'production') 
            ? 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData'
            : 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData';

        $ch = curl_init($api_url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fbr_payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $fbr_api_token,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

        $response = curl_exec($ch);
        $curl_error = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($curl_error) {
            $upd = $pdo->prepare("UPDATE sale_returns SET fbr_status = 'Failed', fbr_response = ? WHERE id = ?");
            $upd->execute(["Connection Error: " . $curl_error, $id]);
            echo json_encode([
                'status' => 'error',
                'message' => 'FBR Server Connection Timeout / Error: ' . $curl_error,
                'fbr_status' => 'Failed'
            ]);
            exit;
        }

        $res_data = json_decode($response, true);
        $fbr_inv_num = $res_data['InvoiceNumber'] ?? $res_data['invoice_number'] ?? null;
        $is_success = ($http_code === 200) && (!empty($fbr_inv_num) || ($res_data['Response'] ?? '') === 'Success' || ($res_data['Code'] ?? 0) == 100);

        if ($is_success) {
            $cn_ref = $fbr_inv_num ?: ('FBR-CN-' . date('Ymd') . '-' . $ret_no);
            $upd = $pdo->prepare("
                UPDATE sale_returns 
                SET fbr_status = 'Submitted', 
                    fbr_credit_note_no = ?, 
                    fbr_response = ?, 
                    fbr_submitted_at = NOW() 
                WHERE id = ?
            ");
            $upd->execute([$cn_ref, json_encode($res_data, JSON_UNESCAPED_UNICODE), $id]);

            logActivity('POS Sales Return', 'FBR_CREDIT_NOTE', $id, "Credit Note #{$ret_no} submitted to FBR: {$cn_ref}", null, $res_data);

            echo json_encode([
                'status' => 'success',
                'message' => "Credit Note successfully submitted to FBR! Reference: {$cn_ref}",
                'fbr_credit_note_no' => $cn_ref,
                'fbr_status' => 'Submitted'
            ]);
            exit;
        } else {
            $error_detail = $res_data['Response'] ?? $res_data['Message'] ?? $response ?? "HTTP {$http_code} Error";
            $upd = $pdo->prepare("UPDATE sale_returns SET fbr_status = 'Rejected', fbr_response = ? WHERE id = ?");
            $upd->execute([is_string($error_detail) ? $error_detail : json_encode($error_detail), $id]);

            echo json_encode([
                'status' => 'error',
                'message' => "FBR Credit Note Submission Rejected: " . (is_string($error_detail) ? $error_detail : json_encode($error_detail)),
                'fbr_status' => 'Rejected'
            ]);
            exit;
        }
    }

    // -------------------------------------------------------------
    // ACTION: search_returns (Find Past POS Returns)
    // -------------------------------------------------------------
    if ($action === 'search_returns') {
        $term = trim($_GET['q'] ?? '');
        $query = "
            SELECT 
                sr.id, 
                sr.serial_no, 
                sr.pos_return_no, 
                sr.sale_invoice_no, 
                sr.return_date, 
                sr.net_total, 
                sr.amount_paid,
                sr.return_status,
                sr.fbr_status,
                sr.fbr_credit_note_no,
                COALESCE(c.name, 'Walk-in Customer') as customer_name,
                COALESCE(b.branch_name, 'Main / Default') as branch_name
            FROM sale_returns sr
            LEFT JOIN coa_list c ON sr.customer_coa_id = c.id
            LEFT JOIN company_branches b ON sr.inventory_location_id = b.id
            WHERE sr.company_id = ? AND sr.pos_return_no IS NOT NULL AND sr.is_cancelled = 0
        ";
        $params = [$company_id];

        if ($term !== '') {
            $query .= " AND (sr.pos_return_no LIKE ? OR sr.sale_invoice_no LIKE ? OR c.name LIKE ?)";
            $lk = "%{$term}%";
            $params = array_merge($params, [$lk, $lk, $lk]);
        }

        $query .= " ORDER BY sr.id DESC LIMIT 30";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);

        echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Unknown action: ' . htmlspecialchars($action)]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
