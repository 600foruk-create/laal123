<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Purchase Order tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        po_date DATE,
        delivery_date DATE,
        payment_terms TEXT,
        job_ref VARCHAR(255),
        employee_ref_id INT,
        vendor_coa_id INT,
        vendor_name VARCHAR(255) DEFAULT '',
        vendor_address TEXT DEFAULT NULL,
        vendor_telephone VARCHAR(100) DEFAULT '',
        vendor_gst VARCHAR(100) DEFAULT '',
        vendor_ntn VARCHAR(100) DEFAULT '',
        total_pieces DECIMAL(15,2) DEFAULT 0,
        total_qty DECIMAL(15,2) DEFAULT 0,
        total_excl_tax DECIMAL(15,2) DEFAULT 0,
        total_tax_amount DECIMAL(15,2) DEFAULT 0,
        total_further_tax DECIMAL(15,2) DEFAULT 0,
        total_incl_tax DECIMAL(15,2) DEFAULT 0,
        amount_words TEXT,
        terms_conditions TEXT,
        remarks TEXT,
        is_cancelled TINYINT DEFAULT 0,
        converted_to_igp INT DEFAULT 0,
        converted_to_pi_tax INT DEFAULT 0,
        converted_to_pi_nontax INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_id INT NOT NULL,
        item_coa_id INT NOT NULL,
        description TEXT,
        pieces DECIMAL(15,2) DEFAULT 0,
        quantity DECIMAL(15,2) DEFAULT 0,
        unit VARCHAR(50),
        rate DECIMAL(20,4) DEFAULT 0,
        value_excl_tax DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(15,2) DEFAULT 0,
        tax_amount DECIMAL(15,2) DEFAULT 0,
        further_tax_rate DECIMAL(15,2) DEFAULT 0,
        further_tax_amount DECIMAL(15,2) DEFAULT 0,
        value_incl_tax DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        is_tax_invoice TINYINT(1) DEFAULT 0,
        invoice_date DATE,
        invoice_type VARCHAR(50),
        vendor_invoice_no VARCHAR(100),
        vendor_invoice_date DATE,
        purchase_order_no VARCHAR(100),
        purchase_order_date DATE,
        payment_terms VARCHAR(255),
        expense_account VARCHAR(50),
        vendor_coa_id INT NOT NULL,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        item_coa_id INT NOT NULL,
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
        FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        return_date DATE,
        purchase_no VARCHAR(100),
        purchase_date DATE,
        vendor_invoice_no VARCHAR(100),
        vendor_invoice_date DATE,
        nature_of_debit_note VARCHAR(100),
        payment_terms VARCHAR(255),
        expense_account VARCHAR(50),
        vendor_coa_id INT NOT NULL,
        inventory_location_id INT,
        job_no VARCHAR(100),
        employee_ref VARCHAR(100),
        amount_in_words VARCHAR(255),
        remarks TEXT,
        carriage_freight DECIMAL(15,2) DEFAULT 0,
        net_total DECIMAL(15,2) DEFAULT 0,
        amount_received DECIMAL(15,2) DEFAULT 0,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pr_id INT NOT NULL,
        item_coa_id INT NOT NULL,
        pieces DECIMAL(15,2) DEFAULT 0,
        quantity DECIMAL(15,2) DEFAULT 0,
        rate DECIMAL(20,4) DEFAULT 0,
        value_excl_tax DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(15,2) DEFAULT 0,
        tax_amount DECIMAL(15,2) DEFAULT 0,
        further_tax_rate DECIMAL(15,2) DEFAULT 0,
        further_tax_amount DECIMAL(15,2) DEFAULT 0,
        value_incl_tax DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (pr_id) REFERENCES purchase_returns(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Alter table to add converted_to_igp if not exists
    try {
        $pdo->exec("ALTER TABLE purchase_order_items MODIFY COLUMN rate DECIMAL(20,4) DEFAULT 0");
        $pdo->exec("ALTER TABLE purchase_invoice_items MODIFY COLUMN rate DECIMAL(20,4) DEFAULT 0");
        $pdo->exec("ALTER TABLE purchase_return_items MODIFY COLUMN rate DECIMAL(20,4) DEFAULT 0");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN converted_to_igp INT DEFAULT 0");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN vendor_name VARCHAR(255) DEFAULT ''");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN vendor_address TEXT DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN vendor_telephone VARCHAR(100) DEFAULT ''");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN vendor_gst VARCHAR(100) DEFAULT ''");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN vendor_ntn VARCHAR(100) DEFAULT ''");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN converted_to_pi_tax INT DEFAULT 0");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN converted_to_pi_nontax INT DEFAULT 0");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE purchase_invoices ADD COLUMN is_posted TINYINT DEFAULT 1 AFTER is_cancelled");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE purchase_invoices ADD COLUMN vendor_address VARCHAR(500) DEFAULT NULL, ADD COLUMN vendor_telephone VARCHAR(100) DEFAULT NULL");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE purchase_invoices ADD COLUMN vendor_name VARCHAR(255) DEFAULT NULL, ADD COLUMN vendor_ntn VARCHAR(100) DEFAULT NULL, ADD COLUMN vendor_gst VARCHAR(100) DEFAULT NULL");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE purchase_returns ADD COLUMN is_posted TINYINT DEFAULT 1 AFTER is_cancelled");
    } catch (PDOException $e) {}

} catch (Exception $e) {
    // Silently log or handle migration errors if needed, but don't break the whole API
    // error_log("Migration Error: " . $e->getMessage());
}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_next_serial') {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM purchase_orders WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        echo json_encode(['next_sn' => ($row['max_sn'] ?? 0) + 1]);
        exit;
    }

    if ($action === 'get_po') {
        $sn = $_GET['serial_no'] ?? 0;
        $dir = $_GET['dir'] ?? '';
        
        $baseSql = "SELECT po.*, 
                           cl.code as vendor_code,
                           COALESCE(NULLIF(po.vendor_name, ''), cl.name, '') as vendor_name,
                           COALESCE(NULLIF(po.vendor_address, ''), v.address, '') as vendor_address,
                           COALESCE(NULLIF(po.vendor_telephone, ''), v.telephone, v.mobile, '') as vendor_telephone,
                           COALESCE(NULLIF(po.vendor_gst, ''), v.st_reg_no, '') as vendor_gst,
                           COALESCE(NULLIF(po.vendor_ntn, ''), v.ntn_cnic, '') as vendor_ntn
                    FROM purchase_orders po
                    LEFT JOIN coa_list cl ON po.vendor_coa_id = cl.id
                    LEFT JOIN vendors v ON cl.id = v.coa_list_id";

        if ($dir === 'next') {
            $stmt = $pdo->prepare("$baseSql WHERE po.company_id=? AND po.serial_no>? ORDER BY po.serial_no ASC LIMIT 1");
        } else if ($dir === 'prev') {
            $stmt = $pdo->prepare("$baseSql WHERE po.company_id=? AND po.serial_no<? ORDER BY po.serial_no DESC LIMIT 1");
        } else {
            $stmt = $pdo->prepare("$baseSql WHERE po.company_id=? AND po.serial_no=?");
        }
        $stmt->execute([$company_id, $sn]);
        $po = $stmt->fetch();
        if ($po) {
            try {
                $stmt = $pdo->prepare("SELECT poi.*, inv.code as item_code, inv.name as master_name, inv.unit as unit_name 
                                       FROM purchase_order_items poi 
                                       LEFT JOIN inv_items inv ON poi.item_coa_id = inv.id 
                                       WHERE poi.po_id=?");
                $stmt->execute([$po['id']]);
                $items = $stmt->fetchAll();
                
                foreach ($items as &$item) {
                    if (empty($item['description']) || is_numeric($item['description']) || strlen($item['description']) <= 2) {
                        $item['description'] = $item['master_name'] ?: $item['description'];
                    }
                    $item['item_name'] = $item['master_name'];
                }
                $po['items'] = $items;
            } catch (Exception $e) {
                $po['items'] = [];
            }

            try {
                $po['vendor'] = [
                    'id' => $po['vendor_coa_id'],
                    'code' => $po['vendor_code'] ?? '',
                    'name' => $po['vendor_name'] ?? '',
                    'address' => $po['vendor_address'] ?? '',
                    'telephone' => $po['vendor_telephone'] ?? '',
                    'st_reg_no' => $po['vendor_gst'] ?? '',
                    'ntn_cnic' => $po['vendor_ntn'] ?? ''
                ];
            } catch (Exception $e) {
                $po['vendor'] = null;
            }
        }
        echo json_encode($po ?: []);
        exit;
    }

    if ($action === 'get_next_invoice_serial') {
        $is_tax = isset($_GET['is_tax']) ? (int)$_GET['is_tax'] : 0;
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM purchase_invoices WHERE company_id = ? AND is_tax_invoice = ?");
        $stmt->execute([$company_id, $is_tax]);
        $row = $stmt->fetch();
        echo json_encode(['next_sn' => ($row['max_sn'] ?? 0) + 1]);
        exit;
    }

    if ($action === 'search_invoices') {
        $stmt = $pdo->prepare("
            SELECT pi.id, pi.serial_no, pi.invoice_date, COALESCE(NULLIF(pi.vendor_name, ''), c.name, '') as vendor_name, pi.net_total, pi.is_posted, pi.is_cancelled, pi.is_tax_invoice, pi.vendor_invoice_no, pi.vendor_invoice_date, pi.purchase_order_no, pi.purchase_order_date, pi.payment_terms, pi.created_at
            FROM purchase_invoices pi
            LEFT JOIN coa_list c ON pi.vendor_coa_id = c.id
            WHERE pi.company_id = ?
            ORDER BY pi.id DESC
            LIMIT 200
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    if ($action === 'search_returns') {
        $stmt = $pdo->prepare("
            SELECT pr.id, pr.serial_no, pr.return_date, c.name as vendor_name, pr.net_total, pr.is_posted, pr.is_cancelled, pr.purchase_no, pr.purchase_date, pr.vendor_invoice_no, pr.payment_terms, pr.created_at
            FROM purchase_returns pr
            LEFT JOIN coa_list c ON pr.vendor_coa_id = c.id
            WHERE pr.company_id = ?
            ORDER BY pr.id DESC
            LIMIT 200
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    if ($action === 'get_invoice') {
        $id = $_GET['id'] ?? null;
        $sn = $_GET['serial_no'] ?? 0;
        if ($id) {
            $stmt = $pdo->prepare("SELECT * FROM purchase_invoices WHERE id=? AND company_id=?");
            $stmt->execute([$id, $company_id]);
        } else {
            $is_tax = isset($_GET['is_tax']) ? (int)$_GET['is_tax'] : 0;
            $dir = $_GET['dir'] ?? '';
            if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM purchase_invoices WHERE serial_no>? AND company_id=? AND is_tax_invoice=? ORDER BY serial_no ASC LIMIT 1");
            } else if ($dir === 'prev') {
                $stmt = $pdo->prepare("SELECT * FROM purchase_invoices WHERE serial_no<? AND company_id=? AND is_tax_invoice=? ORDER BY serial_no DESC LIMIT 1");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM purchase_invoices WHERE serial_no=? AND company_id=? AND is_tax_invoice=?");
            }
            $stmt->execute([$sn, $company_id, $is_tax]);
        }
        $inv = $stmt->fetch();
        if ($inv) {
            try {
                $stmt = $pdo->prepare("SELECT pii.*, itm.code as item_code, itm.name as master_name 
                                       FROM purchase_invoice_items pii 
                                       LEFT JOIN inv_items itm ON pii.item_coa_id = itm.id 
                                       WHERE pii.invoice_id=?");
                $stmt->execute([$inv['id']]);
                $items = $stmt->fetchAll();

                foreach ($items as &$item) {
                    if (empty($item['description']) || is_numeric($item['description']) || strlen($item['description']) <= 2) {
                        $item['description'] = $item['master_name'] ?: $item['description'];
                    }
                    $item['item_name'] = $item['master_name'];
                }
                $inv['items'] = $items;
            } catch (Exception $e) {
                $inv['items'] = [];
            }

            try {
                $stmt = $pdo->prepare("SELECT cl.id as coa_id, cl.code,
                                       COALESCE(NULLIF(pi.vendor_name, ''), cl.name) as name,
                                       COALESCE(pi.vendor_address, v.address, '') as address,
                                       COALESCE(pi.vendor_telephone, v.telephone, '') as telephone,
                                       COALESCE(NULLIF(pi.vendor_ntn, ''), v.ntn_cnic, '') as ntn,
                                       COALESCE(NULLIF(pi.vendor_gst, ''), v.st_reg_no, '') as gst_reg_no
                                       FROM purchase_invoices pi
                                       JOIN coa_list cl ON pi.vendor_coa_id = cl.id
                                       LEFT JOIN vendors v ON cl.id = v.coa_list_id
                                       WHERE pi.id=?");
                $stmt->execute([$inv['id']]);
                $row = $stmt->fetch();
                $inv['vendor'] = $row ?: null;
            } catch (Exception $e) {
                $inv['vendor'] = null;
            }
        }
        echo json_encode($inv ?: []);
        exit;
    }

    if ($action === 'get_next_return_serial') {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM purchase_returns WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        echo json_encode(['next_sn' => ($row['max_sn'] ?? 0) + 1]);
        exit;
    }

    if ($action === 'get_return') {
        $id = $_GET['id'] ?? null;
        $sn = $_GET['serial_no'] ?? 0;
        $dir = $_GET['dir'] ?? '';
        
        if ($id) {
            $stmt = $pdo->prepare("SELECT * FROM purchase_returns WHERE id=? AND company_id=?");
            $stmt->execute([$id, $company_id]);
        } else {
            if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM purchase_returns WHERE serial_no>? AND company_id=? ORDER BY serial_no ASC LIMIT 1");
            } else if ($dir === 'prev') {
                $stmt = $pdo->prepare("SELECT * FROM purchase_returns WHERE serial_no<? AND company_id=? ORDER BY serial_no DESC LIMIT 1");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM purchase_returns WHERE serial_no=? AND company_id=?");
            }
            $stmt->execute([$sn, $company_id]);
        }
        $ret = $stmt->fetch();
        if ($ret) {
            try {
                $stmt = $pdo->prepare("SELECT pri.*, itm.code as item_code, itm.name as master_name 
                                       FROM purchase_return_items pri 
                                       LEFT JOIN inv_items itm ON pri.item_coa_id = itm.id 
                                       WHERE pri.return_id=?");
                $stmt->execute([$ret['id']]);
                $items = $stmt->fetchAll();

                foreach ($items as &$item) {
                    if (empty($item['description']) || is_numeric($item['description']) || strlen($item['description']) <= 2) {
                        $item['description'] = $item['master_name'] ?: $item['description'];
                    }
                    $item['item_name'] = $item['master_name'];
                }
                $ret['items'] = $items;
            } catch (Exception $e) {
                $ret['items'] = [];
            }

            try {
                $stmt = $pdo->prepare("SELECT * FROM vendors WHERE coa_list_id=?");
                $stmt->execute([$ret['vendor_coa_id']]);
                $ret['vendor'] = $stmt->fetch();

                if (!$ret['vendor']) {
                    $stmt = $pdo->prepare("SELECT * FROM coa_list WHERE id=?");
                    $stmt->execute([$ret['vendor_coa_id']]);
                    $coa = $stmt->fetch();
                    if ($coa) {
                        $ret['vendor'] = ['code' => $coa['code'], 'name' => $coa['name']];
                    }
                }
            } catch (Exception $e) {
                $ret['vendor'] = null;
            }
        }
        echo json_encode($ret ?: []);
        exit;
    }
    if ($action === 'get_item_details_for_invoice') {
        $item_id = $_GET['item_id'] ?? 0;
        file_put_contents(__DIR__ . '/error_log_purchase.txt', "Requested item_id: $item_id\n", FILE_APPEND);
        
        try {
            // 1. Get Item Details
            $stmt = $pdo->prepare("
                SELECT i.purchase_price, i.name as description, b.name as category, i.unit 
                FROM inv_items i 
                LEFT JOIN inv_brands b ON i.brand_id = b.id 
                WHERE i.id = ? AND i.company_id = ?
            ");
            $stmt->execute([$item_id, $company_id]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$item) {
                echo json_encode(['status' => 'error', 'message' => 'Item not found']);
                exit;
            }
            
            // 2. Get Balance (simplified: ob + in - out)
            $queries = [];
            $queries[] = "SELECT 'OB' as type, quantity as qty FROM inv_opening_balances WHERE item_id = $item_id AND company_id = $company_id";
            $queries[] = "SELECT 'IN' as type, quantity as qty FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pii.item_coa_id = $item_id AND pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1";
            $queries[] = "SELECT 'IN' as type, qty FROM inward_gate_pass_items igpi JOIN inward_gate_passes igp ON igpi.igp_id = igp.id WHERE igpi.item_id = $item_id AND igp.company_id = $company_id AND igp.is_cancelled = 0";
            $queries[] = "SELECT 'IN' as type, quantity as qty FROM sale_return_items sri JOIN sale_returns sr ON sri.return_id = sr.id WHERE sri.item_coa_id = $item_id AND sr.company_id = $company_id AND sr.is_cancelled = 0";
            $queries[] = "SELECT 'IN' as type, qty FROM add_inventory_adjustment_items ai JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id WHERE ai.item_id = $item_id AND a.company_id = $company_id AND a.is_cancelled = 0";
            
            $queries[] = "SELECT 'OUT' as type, quantity as qty FROM sale_invoice_items sii JOIN sale_invoices si ON sii.invoice_id = si.id WHERE sii.item_coa_id = $item_id AND si.company_id = $company_id AND si.is_cancelled = 0";
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
            
            // 3. Get History (Last 5 purchases)
            $stmt = $pdo->prepare("
                SELECT pi.serial_no as bill_no, pi.invoice_date as date, c.name as vendor_name, pii.quantity, pii.rate, pii.net_amount as amount
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                LEFT JOIN coa_list c ON pi.vendor_coa_id = c.id
                WHERE pii.item_coa_id = ? AND pi.company_id = ? AND pi.is_cancelled = 0 AND pi.is_posted = 1
                ORDER BY pi.invoice_date DESC, pi.id DESC
                LIMIT 5
            ");
            $stmt->execute([$item_id, $company_id]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $purchase_price = (float)$item['purchase_price'];
            
            $response = [
                'status' => 'success',
                'data' => [
                    'purchase_price' => $purchase_price,
                    'category' => $item['category'] ?: '',
                    'description' => $item['description'] ?: '',
                    'unit' => $item['unit'] ?: '',
                    'balance' => $balance,
                    'history' => $history
                ]
            ];
            $json = json_encode($response);
            if ($json === false) {
                echo json_encode(['status' => 'error', 'message' => 'JSON Encode Error: ' . json_last_error_msg()]);
            } else {
                echo $json;
            }
        } catch (Exception $e) {
            file_put_contents(__DIR__ . '/error_log_purchase.txt', "Error: " . $e->getMessage() . "\n", FILE_APPEND);
            $errJson = json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            if ($errJson === false) {
                echo '{"status":"error","message":"Unknown JSON encode error in catch block"}';
            } else {
                echo $errJson;
            }
        }
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    if ($action === 'save_po') {
        try {
            $pdo->beginTransaction();
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('purchase_orders', 'purchase_order_items', 'po_id', $id) : null;

            if ($id) {
                // Update
                $stmt = $pdo->prepare("UPDATE purchase_orders SET 
                    po_date=?, delivery_date=?, payment_terms=?, job_ref=?, employee_ref_id=?, 
                    vendor_coa_id=?, vendor_name=?, vendor_address=?, vendor_telephone=?, vendor_gst=?, vendor_ntn=?,
                    total_pieces=?, total_qty=?, total_excl_tax=?, total_tax_amount=?, 
                    total_further_tax=?, total_incl_tax=?, amount_words=?, terms_conditions=?, remarks=?, is_cancelled=?, converted_to_igp=?, converted_to_pi_tax=?, converted_to_pi_nontax=?
                    WHERE id=? AND company_id=?");
                $stmt->execute([
                    $data['po_date'],
                    $data['delivery_date'],
                    $data['payment_terms'],
                    $data['job_ref'],
                    $data['employee_ref_id'],
                    $data['vendor_coa_id'],
                    $data['vendor_name'] ?? '',
                    $data['vendor_address'] ?? '',
                    $data['vendor_telephone'] ?? '',
                    $data['vendor_gst'] ?? '',
                    $data['vendor_ntn'] ?? '',
                    $data['total_pieces'],
                    $data['total_qty'],
                    $data['total_excl_tax'],
                    $data['total_tax_amount'],
                    $data['total_further_tax'],
                    $data['total_incl_tax'],
                    $data['amount_words'],
                    $data['terms_conditions'],
                    $data['remarks'],
                    $data['is_cancelled'] ?? 0,
                    $data['converted_to_igp'] ?? 0,
                    $data['converted_to_pi_tax'] ?? 0,
                    $data['converted_to_pi_nontax'] ?? 0,
                    $id,
                    $company_id
                ]);

                // Clear old items
                $pdo->prepare("DELETE FROM purchase_order_items WHERE po_id=?")->execute([$id]);
            } else {
                // Insert
                $stmt = $pdo->prepare("INSERT INTO purchase_orders (
                    company_id, serial_no, po_date, delivery_date, payment_terms, job_ref, employee_ref_id,
                    vendor_coa_id, vendor_name, vendor_address, vendor_telephone, vendor_gst, vendor_ntn,
                    total_pieces, total_qty, total_excl_tax, total_tax_amount,
                    total_further_tax, total_incl_tax, amount_words, terms_conditions, remarks, is_cancelled, converted_to_igp, converted_to_pi_tax, converted_to_pi_nontax
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $company_id,
                    $data['serial_no'],
                    $data['po_date'],
                    $data['delivery_date'],
                    $data['payment_terms'],
                    $data['job_ref'],
                    $data['employee_ref_id'],
                    $data['vendor_coa_id'],
                    $data['vendor_name'] ?? '',
                    $data['vendor_address'] ?? '',
                    $data['vendor_telephone'] ?? '',
                    $data['vendor_gst'] ?? '',
                    $data['vendor_ntn'] ?? '',
                    $data['total_pieces'],
                    $data['total_qty'],
                    $data['total_excl_tax'],
                    $data['total_tax_amount'],
                    $data['total_further_tax'],
                    $data['total_incl_tax'],
                    $data['amount_words'],
                    $data['terms_conditions'],
                    $data['remarks'],
                    $data['is_cancelled'] ?? 0,
                    $data['converted_to_igp'] ?? 0,
                    $data['converted_to_pi_tax'] ?? 0,
                    $data['converted_to_pi_nontax'] ?? 0
                ]);
                $id = $pdo->lastInsertId();
            }

            // Insert Items
            $stmtItem = $pdo->prepare("INSERT INTO purchase_order_items (
                po_id, item_coa_id, description, pieces, quantity, unit, rate, 
                value_excl_tax, tax_rate, tax_amount, further_tax_rate, further_tax_amount, value_incl_tax
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            foreach ($data['items'] as $item) {
                if (!$item['item_coa_id'])
                    continue;
                $stmtItem->execute([
                    $id,
                    $item['item_coa_id'],
                    $item['description'],
                    $item['pieces'],
                    $item['quantity'],
                    $item['unit'],
                    $item['rate'],
                    $item['value_excl_tax'],
                    $item['tax_rate'],
                    $item['tax_amount'],
                    $item['further_tax_rate'],
                    $item['further_tax_amount'],
                    $item['value_incl_tax']
                ]);
            }

            $pdo->commit();
            $after_data = fetchRecordData('purchase_orders', 'purchase_order_items', 'po_id', $id);
            logActivity('Purchase Orders', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'PO Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            echo json_encode(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }


    if ($action === 'delete_po') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $before_data = fetchRecordData('purchase_orders', 'purchase_order_items', 'po_id', $id);
            $serial_no = $before_data['header']['serial_no'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM purchase_orders WHERE id=? AND company_id=?");
            $stmt->execute([$id, $company_id]);
            logActivity('Purchase Orders', 'DELETE', $id, 'PO Serial: ' . $serial_no, $before_data, null);
            echo json_encode(['status' => 'success']);
        }
    }

    if ($action === 'delete_invoice') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $before_data = fetchRecordData('purchase_invoices', 'purchase_invoice_items', 'invoice_id', $id);
            $serial_no = $before_data['header']['serial_no'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM purchase_invoices WHERE id=? AND company_id=?");
            $stmt->execute([$id, $company_id]);
            logActivity('Purchase Invoices', 'DELETE', $id, 'Invoice Serial: ' . $serial_no, $before_data, null);
            echo json_encode(['status' => 'success']);
        }
    }

    if ($action === 'save_invoice') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $is_tax = $data['is_tax_invoice'] ? 1 : 0;
        $serial_no = $data['serial_no'];

        if ($id) {
            $stmt = $pdo->prepare("SELECT id FROM purchase_invoices WHERE company_id = ? AND is_tax_invoice = ? AND serial_no = ? AND id != ?");
            $stmt->execute([$company_id, $is_tax, $serial_no, $id]);
        } else {
            $stmt = $pdo->prepare("SELECT id FROM purchase_invoices WHERE company_id = ? AND is_tax_invoice = ? AND serial_no = ?");
            $stmt->execute([$company_id, $is_tax, $serial_no]);
        }
        if ($stmt->fetch()) {
            sendResponse(['status' => 'error', 'message' => 'This Serial Number is already saved. Please use a different Serial Number.']);
            exit;
        }

        $before_data = $id ? fetchRecordData('purchase_invoices', 'purchase_invoice_items', 'invoice_id', $id) : null;
        $fields = [
            'company_id' => $company_id,
            'serial_no' => $data['serial_no'],
            'is_tax_invoice' => $data['is_tax_invoice'] ? 1 : 0,
            'invoice_date' => $data['invoice_date'] ?: null,
            'invoice_type' => $data['invoice_type'],
            'vendor_invoice_no' => $data['vendor_invoice_no'],
            'vendor_invoice_date' => $data['vendor_invoice_date'] ?: null,
            'purchase_order_no' => $data['purchase_order_no'],
            'purchase_order_date' => $data['purchase_order_date'] ?: null,
            'payment_terms' => $data['payment_terms'],
            'expense_account' => $data['expense_account'],
            'vendor_coa_id' => $data['vendor_coa_id'],
            'vendor_name' => !empty($data['vendor_name']) ? trim($data['vendor_name']) : null,
            'vendor_address' => $data['vendor_address'] ?? null,
            'vendor_telephone' => $data['vendor_telephone'] ?? null,
            'vendor_ntn' => $data['vendor_ntn'] ?? null,
            'vendor_gst' => $data['vendor_gst'] ?? null,
            'inventory_location_id' => $data['inventory_location_id'] ?: null,
            'job_no' => $data['job_no'],
            'employee_ref' => $data['employee_ref'],
            'amount_in_words' => $data['amount_in_words'],
            'remarks' => $data['remarks'],
            'carriage_freight' => $data['carriage_freight'] ?: 0,
            'additional_discount' => $data['additional_discount'] ?: 0,
            'net_total' => $data['net_total'] ?: 0,
            'amount_paid' => $data['amount_paid'] ?: 0,
            'is_cancelled' => $data['is_cancelled'] ? 1 : 0,
            'is_posted' => 1
        ];

        $pdo->beginTransaction();
        try {
            if ($id) {
                $setClause = implode(', ', array_map(function ($k) {
                    return "$k = ?"; }, array_keys($fields)));
                $stmt = $pdo->prepare("UPDATE purchase_invoices SET $setClause WHERE id=? AND company_id=?");
                $values = array_values($fields);
                $values[] = $id;
                $values[] = $company_id;
                $stmt->execute($values);
                $pdo->prepare("DELETE FROM purchase_invoice_items WHERE invoice_id=?")->execute([$id]);
            } else {
                $cols = implode(', ', array_keys($fields));
                $placeholders = implode(', ', array_fill(0, count($fields), '?'));
                $stmt = $pdo->prepare("INSERT INTO purchase_invoices ($cols) VALUES ($placeholders)");
                $stmt->execute(array_values($fields));
                $id = $pdo->lastInsertId();
            }

            if (!empty($data['items'])) {
                $stmt = $pdo->prepare("INSERT INTO purchase_invoice_items (invoice_id, item_coa_id, description, pieces, quantity, unit, rate, gross_amount, discount_percent, discount_amount, sales_tax_rate, sales_tax_amount, further_tax_rate, further_tax_amount, net_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($data['items'] as $item) {
                    $stmt->execute([
                        $id,
                        $item['item_coa_id'],
                        $item['description'],
                        $item['pieces'] ?: 0,
                        $item['quantity'] ?: 0,
                        $item['unit'],
                        $item['rate'] ?: 0,
                        $item['gross_amount'] ?: 0,
                        $item['discount_percent'] ?: 0,
                        $item['discount_amount'] ?: 0,
                        $item['sales_tax_rate'] ?: 0,
                        $item['sales_tax_amount'] ?: 0,
                        $item['further_tax_rate'] ?: 0,
                        $item['further_tax_amount'] ?: 0,
                        $item['net_amount'] ?: 0
                    ]);
                }
            }
            $pdo->commit();
            $after_data = fetchRecordData('purchase_invoices', 'purchase_invoice_items', 'invoice_id', $id);
            logActivity('Purchase Invoices', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Invoice Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            echo json_encode(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }
    if ($action === 'delete_return') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $before_data = fetchRecordData('purchase_returns', 'purchase_return_items', 'return_id', $id);
            $serial_no = $before_data['header']['serial_no'] ?? '';
            $pdo->prepare("DELETE FROM purchase_returns WHERE id=? AND company_id=?")->execute([$id, $company_id]);
            logActivity('Purchase Returns', 'DELETE', $id, 'Return Serial: ' . $serial_no, $before_data, null);
            echo json_encode(['status' => 'success']);
        }
    }

    if ($action === 'save_return') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('purchase_returns', 'purchase_return_items', 'return_id', $id) : null;

        $fields = [
            'company_id' => $company_id,
            'serial_no' => $data['serial_no'],
            'return_date' => $data['return_date'],
            'purchase_no' => $data['purchase_no'],
            'purchase_date' => $data['purchase_date'],
            'vendor_invoice_no' => $data['vendor_invoice_no'],
            'vendor_invoice_date' => $data['vendor_invoice_date'],
            'nature_of_debit_note' => $data['nature_of_debit_note'],
            'payment_terms' => $data['payment_terms'],
            'expense_account' => $data['expense_account'],
            'vendor_coa_id' => $data['vendor_coa_id'],
            'inventory_location_id' => $data['inventory_location_id'],
            'job_no' => $data['job_no'],
            'employee_ref' => $data['employee_ref'],
            'amount_in_words' => $data['amount_in_words'],
            'remarks' => $data['remarks'],
            'carriage_freight' => $data['carriage_freight'] ?: 0,
            'net_total' => $data['net_total'] ?: 0,
            'amount_received' => $data['amount_received'] ?: 0,
            'is_cancelled' => $data['is_cancelled'] ?: 0,
            'is_posted'    => 1
        ];

        $pdo->beginTransaction();
        try {
            if ($id) {
                $setClause = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($fields)));
                $stmt = $pdo->prepare("UPDATE purchase_returns SET $setClause WHERE id=? AND company_id=?");
                $values = array_values($fields);
                $values[] = $id;
                $values[] = $company_id;
                $stmt->execute($values);
                $pdo->prepare("DELETE FROM purchase_return_items WHERE return_id=?")->execute([$id]);
            } else {
                $cols = implode(', ', array_keys($fields));
                $placeholders = implode(', ', array_fill(0, count($fields), '?'));
                $stmt = $pdo->prepare("INSERT INTO purchase_returns ($cols) VALUES ($placeholders)");
                $stmt->execute(array_values($fields));
                $id = $pdo->lastInsertId();
            }

            if (!empty($data['items'])) {
                $stmt = $pdo->prepare("INSERT INTO purchase_return_items (return_id, item_coa_id, description, pieces, quantity, unit, rate, value_excl_tax, tax_rate, tax_amount, further_tax_rate, further_tax_amount, value_incl_tax) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($data['items'] as $item) {
                    if (!$item['item_coa_id']) continue;
                    $stmt->execute([
                        $id, $item['item_coa_id'], $item['description'],
                        $item['pieces'] ?: 0, $item['quantity'] ?: 0, $item['unit'], $item['rate'] ?: 0,
                        $item['value_excl_tax'] ?: 0, $item['tax_rate'] ?: 0, $item['tax_amount'] ?: 0,
                        $item['further_tax_rate'] ?: 0, $item['further_tax_amount'] ?: 0, $item['value_incl_tax'] ?: 0
                    ]);
                }
            }
            $pdo->commit();
            $after_data = fetchRecordData('purchase_returns', 'purchase_return_items', 'return_id', $id);
            logActivity('Purchase Returns', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Return Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            echo json_encode(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }
    if ($action === 'toggle_post_invoice') {
        $id = $data['id'] ?? 0;
        $is_posted = $data['is_posted'] ? 1 : 0;
        try {
            $stmt = $pdo->prepare("UPDATE purchase_invoices SET is_posted = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$is_posted, $id, $company_id]);
            logActivity('Purchase Invoice', 'POST_TOGGLE', $id, "is_posted set to $is_posted");
            echo json_encode(['status' => 'success']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'toggle_post_return') {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? 0;
        $is_posted = $data['is_posted'] ? 1 : 0;
        try {
            $stmt = $pdo->prepare("UPDATE purchase_returns SET is_posted = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$is_posted, $id, $company_id]);
            logActivity('Purchase Return', 'POST_TOGGLE', $id, "is_posted set to $is_posted");
            echo json_encode(['status' => 'success']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        exit;
    }
}
?>

