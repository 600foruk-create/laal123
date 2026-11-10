<?php
// Suppress all PHP warnings/notices so they don't corrupt our JSON output
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Sale Invoice tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS sale_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        is_tax_invoice TINYINT(1) DEFAULT 0,
        invoice_date DATE,
        invoice_type VARCHAR(50),
        customer_order_no VARCHAR(100),
        customer_order_date DATE,
        delivery_challan_no VARCHAR(100),
        delivery_challan_date DATE,
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
        amount_received DECIMAL(15,2) DEFAULT 0,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no),
        INDEX (is_tax_invoice)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $siCols = $pdo->query("SHOW COLUMNS FROM sale_invoices")->fetchAll(PDO::FETCH_COLUMN);
    $siNewCols = [
        'customer_name' => 'VARCHAR(255) DEFAULT NULL',
        'customer_address' => 'VARCHAR(500) DEFAULT NULL',
        'customer_telephone' => 'VARCHAR(100) DEFAULT NULL',
        'customer_ntn' => 'VARCHAR(100) DEFAULT NULL',
        'customer_gst' => 'VARCHAR(100) DEFAULT NULL',
        'customer_tax_rate' => 'DECIMAL(10,2) DEFAULT 0',
        'customer_tax_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'customer_wht_type' => 'VARCHAR(50) DEFAULT NULL',
        'gross_amount' => 'DECIMAL(15,2) DEFAULT 0',
        'updated_at' => 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    ];
    foreach ($siNewCols as $col => $def) {
        if (!in_array($col, $siCols)) {
            $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN $col $def");
            if ($col === 'updated_at') {
                $pdo->exec("UPDATE sale_invoices SET updated_at = created_at WHERE updated_at IS NULL");
            }
        }
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS sale_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        item_coa_id INT NOT NULL,
        hs_code VARCHAR(50),
        description TEXT,
        pieces DECIMAL(15,2) DEFAULT 0,
        quantity DECIMAL(15,2) DEFAULT 0,
        unit VARCHAR(50),
        rate DECIMAL(20,4) DEFAULT 0,
        gross_amount DECIMAL(15,2) DEFAULT 0,
        discount_percent DECIMAL(15,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        sales_tax_rate DECIMAL(15,2) DEFAULT 0,
        sales_tax_amount DECIMAL(15,2) DEFAULT 0,
        further_tax_rate DECIMAL(15,2) DEFAULT 0,
        further_tax_amount DECIMAL(15,2) DEFAULT 0,
        net_amount DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
        try { $pdo->exec("ALTER TABLE sale_invoice_items ADD COLUMN length_val DECIMAL(15,2) DEFAULT 0"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoice_items ADD COLUMN weight_val DECIMAL(15,3) DEFAULT 0"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoice_items ADD COLUMN carton_val DECIMAL(15,2) DEFAULT 0"); } catch(Exception $e) {}
    // Add hs_code to existing table if not exists
    try { $pdo->exec("ALTER TABLE sale_invoice_items ADD COLUMN hs_code VARCHAR(50) AFTER item_coa_id"); } catch(Exception $e) {}
    // Update rate precision
    try { $pdo->exec("ALTER TABLE sale_invoice_items MODIFY COLUMN rate DECIMAL(20,4) DEFAULT 0"); } catch(Exception $e) {}
    // Add pos columns
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN pos_invoice_no VARCHAR(100) AFTER serial_no"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN pos_status VARCHAR(50) DEFAULT 'Posted'"); } catch(Exception $e) {}
    // Add conversion tracking columns if not exist
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN converted_dc_no VARCHAR(50) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN converted_ogp_no VARCHAR(50) DEFAULT NULL"); } catch(Exception $e) {}
    // Add is_posted column if not exists
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN is_posted TINYINT(1) DEFAULT 0"); } catch(Exception $e) {}
    // Ensure POS invoices have serial_no = 0 to isolate from ERP Sale Invoice serial numbers
    try { $pdo->exec("UPDATE sale_invoices SET serial_no = 0 WHERE (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != '')) AND serial_no != 0"); } catch (Exception $e) {}
} catch (Exception $e) {}


$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'search_invoices') {
        try {
            $stmt = $pdo->prepare("
                SELECT si.id, si.serial_no, si.invoice_date, COALESCE(NULLIF(si.customer_name, ''), c.name, '') as customer_name, si.net_total, si.is_posted, si.is_cancelled, si.is_tax_invoice, si.delivery_challan_no, si.delivery_challan_date, si.customer_order_no, si.customer_order_date, si.payment_terms, si.created_at
                FROM sale_invoices si
                LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                WHERE si.company_id = ? AND (si.invoice_type != 'POS' OR si.invoice_type IS NULL) AND (si.pos_invoice_no IS NULL OR si.pos_invoice_no = '')
                ORDER BY si.id DESC
                LIMIT 200
            ");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            $stmt = $pdo->prepare("
                SELECT si.id, si.serial_no, si.invoice_date, c.name as customer_name, si.net_total, si.is_posted, si.is_cancelled, si.is_tax_invoice, si.delivery_challan_no, si.delivery_challan_date, si.customer_order_no, si.customer_order_date, si.payment_terms, si.created_at
                FROM sale_invoices si
                LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                WHERE si.company_id = ? AND (si.invoice_type != 'POS' OR si.invoice_type IS NULL) AND (si.pos_invoice_no IS NULL OR si.pos_invoice_no = '')
                ORDER BY si.id DESC
                LIMIT 200
            ");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
        exit;
    }

    if ($action === 'get_next_serial') {
        $is_tax = ($_GET['is_tax'] ?? 0) == 1 ? 1 : 0;
        if ($is_tax) {
            $stmt = $pdo->prepare("SELECT GREATEST(
                (SELECT COALESCE(MAX(serial_no), 0) FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = 1 AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')),
                (SELECT COALESCE(MAX(serial_no), 0) FROM fbr_digital_invoices WHERE company_id = ?)
            ) as max_sn");
            $stmt->execute([$company_id, $company_id]);
            $row = $stmt->fetch();
            $next_sn = ($row && $row['max_sn']) ? ((int)$row['max_sn'] + 1) : 1;
        } else {
            $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = 0 AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')");
            $stmt->execute([$company_id]);
            $row = $stmt->fetch();
            $next_sn = ($row && $row['max_sn']) ? ((int)$row['max_sn'] + 1) : 1;
        }
        sendResponse(['status' => 'success', 'next_sn' => $next_sn, 'serial_no' => $next_sn]);
    }

function getNextPosInvoiceNumber($pdo, $company_id, $branch_id = 0) {
    if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
        $branch_id = intval($_SESSION['branch_id']);
    }
    $prefix = '';

    if ($branch_id > 0) {
        $b_stmt = $pdo->prepare("SELECT id, invoice_series, branch_code, branch_name FROM company_branches WHERE id = ? AND company_id = ?");
        $b_stmt->execute([$branch_id, $company_id]);
        $branch = $b_stmt->fetch(PDO::FETCH_ASSOC);
        if ($branch && !empty(trim($branch['invoice_series'] ?? ''))) {
            $prefix = trim($branch['invoice_series']);
        } elseif ($branch && !empty(trim($branch['branch_code'] ?? ''))) {
            $prefix = trim($branch['branch_code']) . '-POS-';
        }
    }

    // Fallback to POS general settings if branch series is empty
    if (empty($prefix)) {
        try {
            $set_stmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = 'gen_invoice_series'");
            $set_stmt->execute([$company_id]);
            $gen_series = trim($set_stmt->fetchColumn() ?: '');
            if (!empty($gen_series)) {
                $prefix = $gen_series;
            }
        } catch (Exception $e) {}
    }

    // Final fallback
    if (empty($prefix)) {
        $prefix = 'POS-INV-';
    }

    // Calculate next sequence starting from 1 (formatted as '01', '02', ...)
    $max_seq = 0;
    try {
        $inv_stmt = $pdo->prepare("
            SELECT pos_invoice_no FROM sale_invoices 
            WHERE company_id = ? 
              AND (
                  (? > 0 AND inventory_location_id = ? AND pos_invoice_no IS NOT NULL AND pos_invoice_no != '')
                  OR pos_invoice_no LIKE ?
              )
        ");
        $inv_stmt->execute([$company_id, $branch_id, $branch_id, $prefix . '%']);
        $existing = $inv_stmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($existing as $inv_no) {
            $inv_no = trim($inv_no);
            if (strpos($inv_no, $prefix) === 0) {
                $suffix = substr($inv_no, strlen($prefix));
                if (preg_match('/^(\d+)/', $suffix, $m)) {
                    $num = intval($m[1]);
                    if ($num > $max_seq) $max_seq = $num;
                }
            }
        }
    } catch (Exception $e) {}

    $next_seq = $max_seq + 1;
    $formatted_seq = str_pad($next_seq, 2, '0', STR_PAD_LEFT);
    $next_invoice_no = $prefix . $formatted_seq;

    return [
        'prefix' => $prefix,
        'sequence_no' => $next_seq,
        'formatted_seq' => $formatted_seq,
        'next_invoice_no' => $next_invoice_no
    ];
}

    if ($action === 'get_next_pos_invoice_no') {
        $branch_id = intval($_GET['branch_id'] ?? 0);
        $res = getNextPosInvoiceNumber($pdo, $company_id, $branch_id);
        sendResponse([
            'status' => 'success',
            'prefix' => $res['prefix'],
            'sequence_no' => $res['sequence_no'],
            'formatted_seq' => $res['formatted_seq'],
            'next_invoice_no' => $res['next_invoice_no'],
            'serial_no' => 0
        ]);
    }

    if ($action === 'get_last_serial') {
        $is_tax = ($_GET['is_tax'] ?? 0) == 1 ? 1 : 0;
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = ? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')");
        $stmt->execute([$company_id, $is_tax]);
        $row = $stmt->fetch();
        $last_sn = $row['max_sn'] ?? null;
        if ($last_sn === null) {
            $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_invoices WHERE company_id = ? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')");
            $stmt->execute([$company_id]);
            $row = $stmt->fetch();
            $last_sn = $row['max_sn'] ?? 1;
        }
        sendResponse(['last_sn' => $last_sn]);
    }

    if ($action === 'get_last_saved') {
        $is_tax = isset($_GET['is_tax']) ? (($_GET['is_tax'] == 1) ? 1 : 0) : null;
        try {
            $inv = null;
            if ($is_tax !== null) {
                $stmt = $pdo->prepare("SELECT id, serial_no, is_tax_invoice FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = ? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT 1");
                $stmt->execute([$company_id, $is_tax]);
                $inv = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$inv) {
                $stmt = $pdo->prepare("SELECT id, serial_no, is_tax_invoice FROM sale_invoices WHERE company_id = ? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT 1");
                $stmt->execute([$company_id]);
                $inv = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if ($inv) {
                sendResponse(['status' => 'success', 'id' => $inv['id'], 'serial_no' => $inv['serial_no'], 'is_tax_invoice' => $inv['is_tax_invoice']]);
            } else {
                sendResponse(['status' => 'error', 'message' => 'No saved invoices found']);
            }
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'get_invoice') {
        $id = $_GET['id'] ?? null;
        $sn = (int)($_GET['serial_no'] ?? 0);
        $is_tax = ($_GET['is_tax'] ?? 0) == 1 ? 1 : 0;
        $allow_pos = isset($_GET['allow_pos']) && ($_GET['allow_pos'] == '1' || $_GET['allow_pos'] === 'true');
        $current_id = !empty($_GET['current_id']) ? intval($_GET['current_id']) : null;
        try {
            if ($id) {
                $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE id=? AND company_id=?");
                $stmt->execute([$id, $company_id]);
                $inv = $stmt->fetch();
            } else {
                $dir = $_GET['dir'] ?? '';
                if ($dir === 'next') {
                    // 1. Try next invoice matching same tax mode
                    $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no > ? AND COALESCE(is_tax_invoice, 0)=? AND company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY serial_no ASC LIMIT 1");
                    $stmt->execute([$sn, $is_tax, $company_id]);
                    $inv = $stmt->fetch();
                    // 2. Fallback to next invoice across all tax modes
                    if (!$inv) {
                        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no > ? AND company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY serial_no ASC LIMIT 1");
                        $stmt->execute([$sn, $company_id]);
                        $inv = $stmt->fetch();
                    }
                    // 3. Fallback to any next invoice
                    if (!$inv) {
                        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no > ? AND company_id=? ORDER BY serial_no ASC LIMIT 1");
                        $stmt->execute([$sn, $company_id]);
                        $inv = $stmt->fetch();
                    }
                } else if ($dir === 'prev') {
                    // 1. Try prev invoice matching same tax mode
                    if ($sn > 1) {
                        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no < ? AND COALESCE(is_tax_invoice, 0)=? AND company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY serial_no DESC LIMIT 1");
                        $stmt->execute([$sn, $is_tax, $company_id]);
                        $inv = $stmt->fetch();
                        // 2. Fallback to prev invoice across all tax modes
                        if (!$inv) {
                            $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no < ? AND company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY serial_no DESC LIMIT 1");
                            $stmt->execute([$sn, $company_id]);
                            $inv = $stmt->fetch();
                        }
                        // 3. Fallback to any prev invoice
                        if (!$inv) {
                            $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no < ? AND company_id=? ORDER BY serial_no DESC LIMIT 1");
                            $stmt->execute([$sn, $company_id]);
                            $inv = $stmt->fetch();
                        }
                    }
                    // 4. If no invoice found and we're not locked to a specific existing record (e.g. on new blank invoice), load latest saved invoice
                    if (!$inv && empty($current_id)) {
                        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '') ORDER BY serial_no DESC LIMIT 1");
                        $stmt->execute([$company_id]);
                        $inv = $stmt->fetch();
                        if (!$inv) {
                            $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE company_id=? ORDER BY serial_no DESC, id DESC LIMIT 1");
                            $stmt->execute([$company_id]);
                            $inv = $stmt->fetch();
                        }
                    }
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no=? AND COALESCE(is_tax_invoice, 0)=? AND company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')");
                    $stmt->execute([$sn, $is_tax, $company_id]);
                    $inv = $stmt->fetch();
                    if (!$inv) {
                        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no=? AND company_id=? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')");
                        $stmt->execute([$sn, $company_id]);
                        $inv = $stmt->fetch();
                    }
                    if (!$inv) {
                        $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no=? AND company_id=?");
                        $stmt->execute([$sn, $company_id]);
                        $inv = $stmt->fetch();
                    }
                }
            }
            if ($inv) {
                // Load items — Check all potential sources (Inventory, Services, COA)
                $stmt = $pdo->prepare("SELECT sii.*, 
                                       (SELECT code FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as inv_code,
                                       (SELECT name FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as inv_name,
                                       (SELECT qty_per_piece FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as qty_factor,
                                       (SELECT category_type FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as category_type,
                                       (SELECT pipe_sub_type FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as pipe_sub_type,
                                       (SELECT pipe_length FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as pipe_length,
                                       (SELECT length_unit FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as length_unit,
                                       (SELECT billing_mode FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as billing_mode,
                                       (SELECT unit_weight FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as unit_weight,
                                       (SELECT carton FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as carton,
                                       (SELECT code FROM serv_items WHERE id = sii.item_coa_id LIMIT 1) as serv_code,
                                       (SELECT name FROM serv_items WHERE id = sii.item_coa_id LIMIT 1) as serv_name,
                                       (SELECT name FROM coa_list WHERE id = sii.item_coa_id LIMIT 1) as coa_name,
                                       (SELECT hs_code FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as hs_code
                                       FROM sale_invoice_items sii 
                                       WHERE sii.invoice_id=?");
                $stmt->execute([$inv['id']]);
                $items = $stmt->fetchAll();

                foreach ($items as &$item) {
                    // Restoring full info from master tables
                    $masterName = $item['inv_name'] ?: ($item['serv_name'] ?: ($item['coa_name'] ?: ''));
                    $item['item_name'] = $masterName;
                    $item['item_code'] = $item['inv_code'] ?: ($item['serv_code'] ?: '');
                    $item['qty_per_piece'] = $item['qty_factor'] ?: 0;
                    
                    // REPAIR LOGIC: If the stored description is just a number (like '2') or empty,
                    // it means it was corrupted by a previous bug. We REPAIR it here by using the master name.
                    if (empty($item['description']) || is_numeric($item['description']) || strlen($item['description']) <= 2) {
                        $item['description'] = $masterName ?: $item['description'];
                    }
                }
                $inv['items'] = $items;

                // Load customer details — use cl.code and cl.name (correct column names)
                try {
                    $stmt = $pdo->prepare("SELECT cl.id as coa_id, cl.code,
                                           COALESCE(NULLIF(si.customer_name, ''), cl.name, '') as name,
                                           COALESCE(NULLIF(si.customer_address, ''), c.address, '') as address,
                                           COALESCE(NULLIF(si.customer_telephone, ''), c.telephone, '') as telephone,
                                           COALESCE(NULLIF(si.customer_ntn, ''), c.ntn_cnic, '') as ntn,
                                           COALESCE(NULLIF(si.customer_gst, ''), c.st_reg_no, '') as gst_reg_no
                                           FROM sale_invoices si
                                           JOIN coa_list cl ON si.customer_coa_id = cl.id
                                           LEFT JOIN customers c ON cl.id = c.coa_list_id
                                           WHERE si.id=?");
                    $stmt->execute([$inv['id']]);
                    $row = $stmt->fetch();
                    $inv['customer'] = $row ? [
                        'coa_id'      => $row['coa_id'],
                        'code'        => $row['code'],
                        'name'        => $row['name'],
                        'address'     => $row['address'],
                        'telephone'   => $row['telephone'],
                        'ntn'         => $row['ntn'],
                        'gst_reg_no'  => $row['gst_reg_no']
                    ] : null;
                } catch (Exception $eCust) {
                    try {
                        $stmt = $pdo->prepare("SELECT id as coa_id, code, name FROM coa_list WHERE id = ?");
                        $stmt->execute([$inv['customer_coa_id']]);
                        $row = $stmt->fetch();
                        $inv['customer'] = $row ? [
                            'coa_id'      => $row['coa_id'],
                            'code'        => $row['code'],
                            'name'        => !empty($inv['customer_name']) ? $inv['customer_name'] : $row['name'],
                            'address'     => $inv['customer_address'] ?? '',
                            'telephone'   => $inv['customer_telephone'] ?? '',
                            'ntn'         => $inv['customer_ntn'] ?? '',
                            'gst_reg_no'  => $inv['customer_gst'] ?? ''
                        ] : null;
                    } catch (Exception $eFallback) {
                        $inv['customer'] = null;
                    }
                }
            }
            sendResponse($inv ?: []);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
    }

    if ($action === 'get_item_details_for_invoice') {
        $item_id = $_GET['item_id'] ?? 0;
        
        try {
            // 1. Get Item Details
            $stmt = $pdo->prepare("
                SELECT i.selling_price as sales_price, i.name as description, b.name as category, i.unit 
                FROM inv_items i 
                LEFT JOIN inv_brands b ON i.brand_id = b.id 
                WHERE i.id = ? AND i.company_id = ?
            ");
            $stmt->execute([$item_id, $company_id]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$item) {
                sendResponse(['status' => 'error', 'message' => 'Item not found']);
            }
            
            // 2. Get Balance (simplified: ob + in - out)
            $queries = [];
            $queries[] = "SELECT 'OB' as type, quantity as qty FROM inv_opening_balances WHERE item_id = $item_id AND company_id = $company_id";
            $queries[] = "SELECT 'IN' as type, quantity as qty FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pii.item_coa_id = $item_id AND pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1";
            $queries[] = "SELECT 'IN' as type, qty FROM inward_gate_pass_items igpi JOIN inward_gate_passes igp ON igpi.igp_id = igp.id WHERE igpi.item_id = $item_id AND igp.company_id = $company_id AND igp.is_cancelled = 0";
            $queries[] = "SELECT 'IN' as type, quantity as qty FROM sale_return_items sri JOIN sale_returns sr ON sri.return_id = sr.id WHERE sri.item_coa_id = $item_id AND sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1";
            $queries[] = "SELECT 'IN' as type, qty FROM add_inventory_adjustment_items ai JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id WHERE ai.item_id = $item_id AND a.company_id = $company_id AND a.is_cancelled = 0";
            
            $queries[] = "SELECT 'OUT' as type, quantity as qty FROM sale_invoice_items sii JOIN sale_invoices si ON sii.invoice_id = si.id WHERE sii.item_coa_id = $item_id AND si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1";
            $queries[] = "SELECT 'OUT' as type, qty FROM outward_gate_pass_items ogpi JOIN outward_gate_passes ogp ON ogpi.ogp_id = ogp.id WHERE ogpi.item_id = $item_id AND ogp.company_id = $company_id AND ogp.is_cancelled = 0";
            $queries[] = "SELECT 'OUT' as type, qty FROM delivery_challan_items dci JOIN delivery_challans dc ON dci.challan_id = dc.id WHERE dci.item_id = $item_id AND dc.company_id = $company_id AND dc.is_cancelled = 0";
            $queries[] = "SELECT 'OUT' as type, quantity as qty FROM purchase_return_items pri JOIN purchase_returns pr ON pri.return_id = pr.id WHERE pri.item_coa_id = $item_id AND pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 AND pr.nature_of_debit_note IN ('Purchase Return (Reduces Inventory)', 'Shortage (Reduces Inventory)')";
            $queries[] = "SELECT 'OUT' as type, qty FROM reduce_inventory_adjustment_items ri JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id WHERE ri.item_id = $item_id AND r.company_id = $company_id AND r.is_cancelled = 0";

            $final_sql = "
                SELECT 
                    SUM(CASE WHEN type IN ('OB', 'IN') THEN qty ELSE 0 END) - 
                    SUM(CASE WHEN type = 'OUT' THEN qty ELSE 0 END) as balance
                FROM (" . implode(" UNION ALL ", $queries) . ") as combined
            ";
            $stmt = $pdo->prepare($final_sql);
            $stmt->execute();
            $balance = $stmt->fetchColumn() ?: 0;
            
            // 3. Get History (Last 5 sales)
            $stmt = $pdo->prepare("
                SELECT si.serial_no as bill_no, si.invoice_date as date, c.name as cust_name, sii.quantity, sii.rate, sii.net_amount as amount
                FROM sale_invoice_items sii
                JOIN sale_invoices si ON sii.invoice_id = si.id
                LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                WHERE sii.item_coa_id = ? AND si.company_id = ? AND si.is_cancelled = 0 AND (si.invoice_type != 'POS' OR si.invoice_type IS NULL)
                ORDER BY si.invoice_date DESC LIMIT 5
            ");
            $stmt->execute([$item_id, $company_id]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

            sendResponse([
                'status' => 'success',
                'data' => [
                    'description' => $item['description'],
                    'category' => $item['category'],
                    'unit' => $item['unit'],
                    'sale_price' => $item['sales_price'],
                    'balance' => $balance,
                    'history' => $history
                ]
            ]);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!empty($data['action'])) {
        $action = $data['action'];
    }
    if (!empty($data['company_id'])) {
        $company_id = intval($data['company_id']);
    } elseif (!empty($_GET['company_id'])) {
        $company_id = intval($_GET['company_id']);
    }
    
    if ($action === 'save_invoice') {
        $id = $data['id'] ?? null;
        $is_tax = !empty($data['is_tax_invoice']) ? 1 : 0;
        
        // Capture state before save (for UPDATE)
        $before_data = $id ? fetchRecordData('sale_invoices', 'sale_invoice_items', 'invoice_id', $id) : null;

        // Internal ERP Tax Sale Invoice is company's local record: Editing is allowed and will NOT modify fbr_digital_invoices
        // (Digital Invoice itself in FBR portal/table remains locked to protect fiscal submissions)

        $serial_no = intval($data['serial_no'] ?? 0);
        $pos_invoice_no = trim($data['pos_invoice_no'] ?? '');
        $is_pos = (!empty($data['invoice_type']) && strtoupper($data['invoice_type']) === 'POS');

        if ($is_pos) {
            $branch_id = intval((isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) 
                ? $_SESSION['branch_id'] 
                : ($data['inventory_location_id'] ?? 0));

            // Off-Time and Weekly Off Day Check for POS sales:
            // Admin is exempt from restrictions. Branch users / POS terminals cannot save sales during off-time or on weekly off days.
            $userRole = strtoupper($_SESSION['role'] ?? '');
            $isAdmin = ($userRole === 'ADMIN' || $userRole === 'ADMINISTRATOR' || (isset($_SESSION['user_id']) && intval($_SESSION['user_id']) === 1));
            if (!$isAdmin && $branch_id > 0) {
                try {
                    $bStmt = $pdo->prepare("SELECT branch_name, opening_time, closing_time, off_day FROM company_branches WHERE id = ?");
                    $bStmt->execute([$branch_id]);
                    $branchInfo = $bStmt->fetch(PDO::FETCH_ASSOC);

                    // 1. Weekly Off Day Check
                    if ($branchInfo && !empty($branchInfo['off_day'])) {
                        $todayDay = date('l');
                        if (strcasecmp($todayDay, trim($branchInfo['off_day'])) === 0) {
                            sendResponse([
                                'status' => 'error',
                                'is_off_day' => true,
                                'is_off_time' => true,
                                'branch_name' => $branchInfo['branch_name'] ?? 'Branch',
                                'off_day' => $branchInfo['off_day'],
                                'current_day' => $todayDay,
                                'message' => "Sale Blocked: Today ({$todayDay}) is an official weekly OFF DAY for {$branchInfo['branch_name']}.\nPOS sales are strictly restricted on weekly holidays."
                            ], 403);
                            exit;
                        }
                    }

                    // 2. Daily Operating Hours Check
                    if ($branchInfo && !empty($branchInfo['opening_time']) && !empty($branchInfo['closing_time'])) {
                        $nowTime = date('H:i:s');
                        $open = $branchInfo['opening_time'];
                        $close = $branchInfo['closing_time'];
                        $isOpen = false;
                        if ($open <= $close) {
                            $isOpen = ($nowTime >= $open && $nowTime <= $close);
                        } else {
                            $isOpen = ($nowTime >= $open || $nowTime <= $close);
                        }

                        if (!$isOpen) {
                            $openFmt = date('h:i A', strtotime($open));
                            $closeFmt = date('h:i A', strtotime($close));
                            sendResponse([
                                'status' => 'error',
                                'is_off_time' => true,
                                'is_off_day' => false,
                                'branch_name' => $branchInfo['branch_name'] ?? 'Branch',
                                'opening_time' => $openFmt,
                                'closing_time' => $closeFmt,
                                'current_time' => date('h:i A'),
                                'message' => "Sale Blocked: Branch is currently CLOSED (Off-Time).\nOperating hours: {$openFmt} to {$closeFmt}.\nCurrent Pakistan Time: " . date('h:i A') . ".\nSales are not allowed during off-time."
                            ], 403);
                            exit;
                        }
                    }
                } catch (Exception $eBranchCheck) {}
            }

            if ($id) {
                // If editing existing invoice by ID, verify uniqueness of pos_invoice_no if changed
                if (!empty($pos_invoice_no)) {
                    $chk = $pdo->prepare("SELECT id FROM sale_invoices WHERE company_id = ? AND pos_invoice_no = ? AND id != ?");
                    $chk->execute([$company_id, $pos_invoice_no, $id]);
                    if ($chk->fetch()) {
                        sendResponse(['status' => 'error', 'message' => "Invoice Number '{$pos_invoice_no}' is already used by another invoice."]);
                        exit;
                    }
                }
            } else {
                // If ID is not explicitly provided, check if an invoice with this pos_invoice_no already exists
                if (!empty($pos_invoice_no) && strcasecmp($pos_invoice_no, 'New') !== 0) {
                    $chk = $pdo->prepare("SELECT id, fbr_status, fbr_invoice_number FROM sale_invoices WHERE company_id = ? AND pos_invoice_no = ?");
                    $chk->execute([$company_id, $pos_invoice_no]);
                    $existingRow = $chk->fetch(PDO::FETCH_ASSOC);
                    if ($existingRow) {
                        // This invoice already exists! Check FBR lock status
                        $fbrStat = strtoupper(trim($existingRow['fbr_status'] ?? ''));
                        $fbrNum = trim($existingRow['fbr_invoice_number'] ?? '');
                        if ($fbrStat === 'SUBMITTED' || $fbrStat === 'ACCEPTED' || !empty($fbrNum)) {
                            sendResponse(['status' => 'error', 'message' => "Invoice '{$pos_invoice_no}' has already been submitted to FBR and cannot be edited."], 400);
                            exit;
                        }
                        // TREAT AS EDIT / UPDATE OF EXISTING INVOICE:
                        $id = intval($existingRow['id']);
                        $data['id'] = $id;
                    }
                }

                // If still no ID (truly a new invoice), assign next sequential number if empty or "New"
                if (!$id) {
                    if (empty($pos_invoice_no) || strcasecmp($pos_invoice_no, 'New') === 0) {
                        $gen = getNextPosInvoiceNumber($pdo, $company_id, $branch_id);
                        $pos_invoice_no = $gen['next_invoice_no'];
                    } else {
                        // If provided number was somehow already taken by another record, auto-assign next
                        $chk = $pdo->prepare("SELECT id FROM sale_invoices WHERE company_id = ? AND pos_invoice_no = ?");
                        $chk->execute([$company_id, $pos_invoice_no]);
                        if ($chk->fetch()) {
                            $gen = getNextPosInvoiceNumber($pdo, $company_id, $branch_id);
                            $pos_invoice_no = $gen['next_invoice_no'];
                        }
                    }
                    $data['pos_invoice_no'] = $pos_invoice_no;
                }
            }

            // POS invoices are stored with serial_no = 0 so they never collide with or consume ERP Sale Invoice numbers
            $serial_no = 0;
            $data['serial_no'] = 0;
        } else {
            if ($id) {
                $stmt = $pdo->prepare("SELECT id FROM sale_invoices WHERE company_id = ? AND is_tax_invoice = ? AND serial_no = ? AND id != ? AND (invoice_type != 'POS' OR invoice_type IS NULL)");
                $stmt->execute([$company_id, $is_tax, $serial_no, $id]);
            } else {
                $stmt = $pdo->prepare("SELECT id FROM sale_invoices WHERE company_id = ? AND is_tax_invoice = ? AND serial_no = ? AND (invoice_type != 'POS' OR invoice_type IS NULL)");
                $stmt->execute([$company_id, $is_tax, $serial_no]);
            }
            $existingSi = $stmt->fetch();
            if ($existingSi) {
                if (!$id && $is_tax) {
                    $id = intval($existingSi['id']);
                    $data['id'] = $id;
                } else {
                    sendResponse(['status' => 'error', 'message' => 'This Serial Number is already saved. Please use a different Serial Number.']);
                    exit;
                }
            }
        }

        $pdo->beginTransaction();
        try {
            $calcGross = 0;
            if (!empty($data['items']) && is_array($data['items'])) {
                foreach ($data['items'] as $it) {
                    $q = floatval($it['quantity'] ?? 0);
                    $r = floatval($it['rate'] ?? 0);
                    $calcGross += floatval(!empty($it['gross_amount']) ? $it['gross_amount'] : ($q * $r));
                }
            }
            if ($calcGross <= 0) {
                $calcGross = floatval($data['net_total'] ?? 0) + floatval($data['additional_discount'] ?? 0);
            }

            // Save exact amount_received provided for this invoice
            $custCoaId = intval($data['customer_coa_id'] ?? 0);
            $hasAmtRecv = isset($data['amount_received']) && $data['amount_received'] !== '' && $data['amount_received'] !== null;
            if ($hasAmtRecv) {
                $amtRecv = floatval($data['amount_received']);
            } else if ($is_pos) {
                $amtRecv = floatval($data['net_total'] ?? 0);
            } else {
                $amtRecv = 0;
            }

            $fields = [
                'company_id' => $company_id,
                'serial_no' => $data['serial_no'],
                'pos_invoice_no' => $pos_invoice_no ?: null,
                'is_tax_invoice' => $is_tax,
                'invoice_date' => $data['invoice_date'] ?: date('Y-m-d'),
                'invoice_type' => $data['invoice_type'] ?? ($is_pos ? 'POS' : 'Sale'),
                'customer_order_no' => $data['customer_order_no'] ?? '',
                'customer_order_date' => !empty($data['customer_order_date']) ? $data['customer_order_date'] : null,
                'delivery_challan_no' => $data['delivery_challan_no'] ?? '',
                'delivery_challan_date' => !empty($data['delivery_challan_date']) ? $data['delivery_challan_date'] : null,
                'payment_terms' => $isWalkIn ? 'Cash' : ($data['payment_terms'] ?? 'Cash'),
                'income_account' => $data['income_account'] ?? '40001001',
                'customer_coa_id' => $data['customer_coa_id'],
                'customer_name' => !empty($data['customer_name']) ? trim($data['customer_name']) : null,
                'customer_address' => $data['customer_address'] ?? null,
                'customer_telephone' => $data['customer_telephone'] ?? null,
                'customer_ntn' => $data['customer_ntn'] ?? null,
                'customer_gst' => $data['customer_gst'] ?? null,
                'inventory_location_id' => (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) 
                    ? intval($_SESSION['branch_id']) 
                    : (!empty($data['inventory_location_id']) ? intval($data['inventory_location_id']) : null),
                'job_no' => $data['job_no'] ?? '',
                'employee_ref' => $data['employee_ref'] ?? '',
                'amount_in_words' => $data['amount_in_words'] ?? '',
                'remarks' => $data['remarks'] ?? ($is_pos ? 'POS Sale' : ''),
                'carriage_freight' => floatval($data['carriage_freight'] ?? 0),
                'additional_discount' => floatval($data['additional_discount'] ?? 0),
                'customer_tax_rate' => floatval($data['customer_tax_rate'] ?? 0),
                'customer_tax_amount' => floatval($data['customer_tax_amount'] ?? 0),
                'customer_wht_type' => $data['customer_wht_type'] ?? null,
                'gross_amount' => $calcGross,
                'net_total' => floatval($data['net_total'] ?? 0),
                'amount_received' => $amtRecv,
                'is_cancelled' => !empty($data['is_cancelled']) ? 1 : 0,
                'converted_dc_no' => $data['converted_dc_no'] ?? null,
                'converted_ogp_no' => $data['converted_ogp_no'] ?? null,
                'pos_status' => $data['pos_status'] ?? 'Saved',
                'is_posted' => isset($data['is_posted']) ? intval($data['is_posted']) : 1,
                'updated_at' => date('Y-m-d H:i:s')
            ];

            if ($id) {
                $setClause = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($fields)));
                $stmt = $pdo->prepare("UPDATE sale_invoices SET $setClause WHERE id=? AND company_id=?");
                $values = array_values($fields);
                $values[] = $id;
                $values[] = $company_id;
                $stmt->execute($values);
                $pdo->prepare("DELETE FROM sale_invoice_items WHERE invoice_id=?")->execute([$id]);
            } else {
                $cols = implode(', ', array_keys($fields));
                $placeholders = implode(', ', array_fill(0, count($fields), '?'));
                $stmt = $pdo->prepare("INSERT INTO sale_invoices ($cols) VALUES ($placeholders)");
                $stmt->execute(array_values($fields));
                $id = $pdo->lastInsertId();
            }

            if (!empty($data['items'])) {
                $hasExtendedCols = true;
                try {
                    $testStmt = $pdo->prepare("INSERT INTO sale_invoice_items (invoice_id, item_coa_id, hs_code, description, pieces, quantity, unit, rate, gross_amount, discount_percent, discount_amount, sales_tax_rate, sales_tax_amount, further_tax_rate, further_tax_amount, net_amount, length_val, weight_val, carton_val) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                } catch(Exception $e) { $hasExtendedCols = false; }

                $stmt = $pdo->prepare("INSERT INTO sale_invoice_items (invoice_id, item_coa_id, hs_code, description, pieces, quantity, unit, rate, gross_amount, discount_percent, discount_amount, sales_tax_rate, sales_tax_amount, further_tax_rate, further_tax_amount, net_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($data['items'] as $item) {
                    if (empty($item['item_coa_id'])) continue;
                    $qty = floatval($item['quantity'] ?? 0);
                    $rate = floatval($item['rate'] ?? 0);
                    $gross = (isset($item['gross_amount']) && is_numeric($item['gross_amount'])) ? floatval($item['gross_amount']) : ($qty * $rate);
                    $disc_pct = floatval($item['discount_percent'] ?? 0);
                    $disc_amt = (isset($item['discount_amount']) && is_numeric($item['discount_amount'])) ? floatval($item['discount_amount']) : ($gross * ($disc_pct / 100));
                    
                    $st_rate = floatval($item['sales_tax_rate'] ?? 0);
                    if (isset($item['sales_tax_amount']) && $item['sales_tax_amount'] !== '' && is_numeric($item['sales_tax_amount'])) {
                        $st_amt = floatval($item['sales_tax_amount']);
                    } else {
                        $st_amt = ($gross - $disc_amt) * ($st_rate / 100);
                    }

                    $ft_rate = floatval($item['further_tax_rate'] ?? 0);
                    if (isset($item['further_tax_amount']) && $item['further_tax_amount'] !== '' && is_numeric($item['further_tax_amount'])) {
                        $ft_amt = floatval($item['further_tax_amount']);
                    } else {
                        $ft_amt = ($gross - $disc_amt) * ($ft_rate / 100);
                    }

                    if (isset($item['net_amount']) && $item['net_amount'] !== '' && is_numeric($item['net_amount'])) {
                        $net = floatval($item['net_amount']);
                    } else {
                        $net = $gross - $disc_amt + $st_amt + $ft_amt;
                    }

                    $stmt->execute([
                        $id, 
                        $item['item_coa_id'], 
                        $item['hs_code'] ?? null, 
                        $item['description'] ?? '',
                        floatval($item['pieces'] ?? 0), 
                        $qty, 
                        $item['unit'] ?? 'pcs', 
                        $rate,
                        $gross, 
                        $disc_pct, 
                        $disc_amt,
                        $st_rate, 
                        $st_amt, 
                        $ft_rate, 
                        $ft_amt, 
                        $net
                    ]);
                }
            }
            $pdo->commit();

            // Capture state after save and log activity
            $after_data = fetchRecordData('sale_invoices', 'sale_invoice_items', 'invoice_id', $id);
            $action_type = !empty($data['id']) ? 'UPDATE' : 'INSERT';
            $module_name = $is_pos ? 'POS Sale' : 'Sale Invoice';
            $record_title = $is_pos ? "POS Invoice #{$pos_invoice_no}" : ($is_tax ? 'Tax Invoice' : 'Commercial Invoice') . " #" . ($data['serial_no'] ?? ($after_data['header']['serial_no'] ?? ''));
            logActivity($module_name, $action_type, $id, $record_title, $before_data, $after_data);

            sendResponse([
                'status' => 'success',
                'id' => $id,
                'pos_invoice_no' => $pos_invoice_no,
                'serial_no' => $data['serial_no'],
                'is_tax_invoice' => $is_tax
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'delete_invoice') {
        $id = $data['id'] ?? $_GET['id'] ?? null;
        if ($id) {
            // STRICT FBR SAFETY: Invoices posted to FBR can NEVER be deleted
            $chkFbr = $pdo->prepare("SELECT fbr_status, fbr_invoice_number FROM sale_invoices WHERE id = ? AND company_id = ?");
            $chkFbr->execute([$id, $company_id]);
            $existingInv = $chkFbr->fetch(PDO::FETCH_ASSOC);
            if ($existingInv) {
                $fbrStat = strtoupper(trim($existingInv['fbr_status'] ?? ''));
                $fbrNum = trim($existingInv['fbr_invoice_number'] ?? '');
                if ($fbrStat === 'SUBMITTED' || $fbrStat === 'ACCEPTED' || !empty($fbrNum)) {
                    sendResponse(['status' => 'error', 'message' => 'This invoice has already been posted to FBR and CANNOT be deleted.'], 400);
                    exit;
                }
            }

            // Capture state before deletion
            $before_data = fetchRecordData('sale_invoices', 'sale_invoice_items', 'invoice_id', $id);
            $is_tax = ($before_data['header']['is_tax_invoice'] ?? 0) == 1;
            $label = $is_tax ? 'Tax Invoice' : 'Commercial Invoice';
            $record_title = "$label #" . ($before_data['header']['serial_no'] ?? '');

            $pdo->prepare("DELETE FROM sale_invoice_items WHERE invoice_id=?")->execute([$id]);
            $stmt = $pdo->prepare("DELETE FROM sale_invoices WHERE id=? AND company_id=?");
            $stmt->execute([$id, $company_id]);

            logActivity('Sale Invoice', 'DELETE', $id, $record_title, $before_data, null);

            sendResponse(['status' => 'success']);
        }
        sendResponse(['status' => 'error', 'message' => 'ID missing'], 400);
    }

    if ($action === 'toggle_post_invoice') {
        $id = $data['id'] ?? 0;
        $is_posted = isset($data['is_posted']) ? ($data['is_posted'] ? 1 : 0) : 0;
        try {
            $stmt = $pdo->prepare("UPDATE sale_invoices SET is_posted = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$is_posted, $id, $company_id]);
            logActivity('Sale Invoice', 'POST_TOGGLE', $id, "is_posted set to $is_posted");
            sendResponse(['status' => 'success', 'is_posted' => $is_posted]);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
        exit;
    }
}
?>
