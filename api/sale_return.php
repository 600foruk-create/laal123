<?php
// Suppress all PHP warnings/notices so they don't corrupt our JSON output
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Sale Return tables exist
if (shouldRunMigration('sale_returns_schema', 1)) {
    try {
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
            dummy_field DATE,
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
            is_posted TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (company_id),
            INDEX (serial_no),
            INDEX (is_tax_return)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

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

        // Idempotent column checks/additions for existing sale_returns table
        $columns_returns = [
            'company_id' => "INT NOT NULL",
            'serial_no' => "INT NOT NULL",
            'is_tax_return' => "TINYINT(1) DEFAULT 0",
            'return_date' => "DATE",
            'return_type' => "VARCHAR(50)",
            'sale_invoice_no' => "VARCHAR(100)",
            'sale_invoice_date' => "DATE",
            'nature_of_credit_note' => "VARCHAR(100)",
            'dummy_field' => "DATE",
            'payment_terms' => "VARCHAR(255)",
            'income_account' => "VARCHAR(50)",
            'customer_coa_id' => "INT NOT NULL",
            'inventory_location_id' => "INT",
            'job_no' => "VARCHAR(100)",
            'employee_ref' => "VARCHAR(100)",
            'amount_in_words' => "VARCHAR(255)",
            'remarks' => "TEXT",
            'carriage_freight' => "DECIMAL(15,2) DEFAULT 0",
            'additional_discount' => "DECIMAL(15,2) DEFAULT 0",
            'net_total' => "DECIMAL(15,2) DEFAULT 0",
            'amount_paid' => "DECIMAL(15,2) DEFAULT 0",
            'is_cancelled' => "TINYINT DEFAULT 0",
            'is_posted' => "TINYINT(1) DEFAULT 0",
            'customer_address' => "TEXT",
            'customer_telephone' => "VARCHAR(100)",
            'customer_ntn' => "VARCHAR(100)",
            'customer_gst' => "VARCHAR(100)"
        ];
        $srCols = $pdo->query("SHOW COLUMNS FROM sale_returns")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($columns_returns as $col => $definition) {
            if (!in_array($col, $srCols)) {
                $pdo->exec("ALTER TABLE sale_returns ADD COLUMN `$col` $definition");
            }
        }

        // Idempotent column checks/additions for existing sale_return_items table
        $columns_items = [
            'return_id' => "INT NOT NULL",
            'item_coa_id' => "INT NOT NULL",
            'description' => "TEXT",
            'pieces' => "DECIMAL(15,2) DEFAULT 0",
            'quantity' => "DECIMAL(15,2) DEFAULT 0",
            'unit' => "VARCHAR(50)",
            'rate' => "DECIMAL(15,2) DEFAULT 0",
            'gross_amount' => "DECIMAL(15,2) DEFAULT 0",
            'discount_percent' => "DECIMAL(15,2) DEFAULT 0",
            'discount_amount' => "DECIMAL(15,2) DEFAULT 0",
            'sales_tax_rate' => "DECIMAL(15,2) DEFAULT 0",
            'sales_tax_amount' => "DECIMAL(15,2) DEFAULT 0",
            'further_tax_rate' => "DECIMAL(15,2) DEFAULT 0",
            'further_tax_amount' => "DECIMAL(15,2) DEFAULT 0",
            'net_amount' => "DECIMAL(15,2) DEFAULT 0"
        ];
        $sriCols = $pdo->query("SHOW COLUMNS FROM sale_return_items")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($columns_items as $col => $definition) {
            if (!in_array($col, $sriCols)) {
                $pdo->exec("ALTER TABLE sale_return_items ADD COLUMN `$col` $definition");
            }
        }
    } catch (Exception $e) {}
}


$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    if ($action === 'search_returns') {
        $stmt = $pdo->prepare("
            SELECT sr.id, sr.serial_no, sr.return_date, c.name as customer_name, sr.net_total, sr.is_posted, sr.is_cancelled, sr.is_tax_return, sr.sale_invoice_no as delivery_challan_no, sr.sale_invoice_date as delivery_challan_date, sr.sale_invoice_no as customer_order_no, sr.sale_invoice_date as customer_order_date, sr.payment_terms, sr.created_at
            FROM sale_returns sr
            LEFT JOIN coa_list c ON sr.customer_coa_id = c.id
            WHERE sr.company_id = ?
            ORDER BY sr.id DESC
            LIMIT 200
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    if ($action === 'get_next_serial') {
        $is_tax = ($_GET['is_tax'] ?? 0) == 1 ? 1 : 0;
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_returns WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_sn' => ($row['max_sn'] ?? 0) + 1]);
    }

    if ($action === 'get_coa_list') {
        $stmt = $pdo->prepare("
            SELECT c.id, c.code as account_code, c.name as account_name, cs.name as account_type, cm.name as main_type
            FROM coa_list c
            LEFT JOIN coa_sub cs ON c.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE c.company_id = ?
              AND (cm.name LIKE '%Revenue%' OR cm.name LIKE '%Income%' OR cm.code = '400' OR c.code LIKE '4%')
            ORDER BY c.code ASC
        ");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_last_serial') {
        $is_tax = ($_GET['is_tax'] ?? 0) == 1 ? 1 : 0;
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_returns WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['last_sn' => $row['max_sn'] ?? 1]);
    }

    if ($action === 'get_return') {
        $id = $_GET['id'] ?? null;
        $sn = $_GET['serial_no'] ?? 0;
        $is_tax = ($_GET['is_tax'] ?? 0) == 1 ? 1 : 0;
        $dir = $_GET['dir'] ?? '';
        try {
            if ($id) {
                $stmt = $pdo->prepare("SELECT * FROM sale_returns WHERE id=? AND company_id=?");
                $stmt->execute([$id, $company_id]);
            } else {
                if ($dir === 'next') {
                    $stmt = $pdo->prepare("SELECT * FROM sale_returns WHERE serial_no>? AND company_id=? ORDER BY serial_no ASC LIMIT 1");
                } else if ($dir === 'prev') {
                    $stmt = $pdo->prepare("SELECT * FROM sale_returns WHERE serial_no<? AND company_id=? ORDER BY serial_no DESC LIMIT 1");
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM sale_returns WHERE serial_no=? AND company_id=?");
                }
                $stmt->execute([$sn, $company_id]);
            }
            $inv = $stmt->fetch();
            if ($inv) {
                // Load items — Check all potential sources (Inventory, Services, COA)
                $stmt = $pdo->prepare("SELECT sii.*, 
                                       (SELECT code FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as inv_code,
                                       (SELECT name FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as inv_name,
                                         (SELECT hs_code FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as hs_code,
                                       (SELECT qty_per_piece FROM inv_items WHERE id = sii.item_coa_id LIMIT 1) as qty_factor,
                                       (SELECT code FROM serv_items WHERE id = sii.item_coa_id LIMIT 1) as serv_code,
                                       (SELECT name FROM serv_items WHERE id = sii.item_coa_id LIMIT 1) as serv_name,
                                       (SELECT name FROM coa_list WHERE id = sii.item_coa_id LIMIT 1) as coa_name
                                       FROM sale_return_items sii 
                                       WHERE sii.return_id=?");
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
                $stmt = $pdo->prepare("SELECT cl.id as coa_id, cl.code, cl.name,
                                       COALESCE(c.address, '') as address,
                                       COALESCE(c.telephone, '') as telephone,
                                       COALESCE(c.ntn_cnic, '') as ntn,
                                       COALESCE(c.st_reg_no, '') as gst_reg_no
                                       FROM coa_list cl
                                       LEFT JOIN customers c ON cl.id = c.coa_list_id
                                       WHERE cl.id=?");
                $stmt->execute([$inv['customer_coa_id']]);
                $row = $stmt->fetch();
                $inv['customer'] = $row ? [
                    'coa_id'      => $row['coa_id'],
                    'code'        => $row['code'],
                    'name'        => $row['name'],
                    'address'     => $inv['customer_address'] ?: $row['address'],
                    'telephone'   => $inv['customer_telephone'] ?: $row['telephone'],
                    'ntn'         => $inv['customer_ntn'] ?: $row['ntn'],
                    'gst_reg_no'  => $inv['customer_gst'] ?: $row['gst_reg_no']
                ] : null;
            }
            sendResponse($inv ?: []);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? $action;
    
    if ($action === 'save_return') {
        $id = $data['id'] ?? null;
        $is_tax = $data['is_tax_return'] ? 1 : 0;
        
        $before_data = $id ? fetchRecordData('sale_returns', 'sale_return_items', 'return_id', $id) : null;

        $pdo->beginTransaction();
        try {
            if (!$id) {
                $stmt = $pdo->prepare("SELECT id FROM sale_returns WHERE serial_no = ? AND company_id = ?");
                $stmt->execute([$data['serial_no'], $company_id]);
                $existingId = $stmt->fetchColumn();
                if ($existingId) {
                    $id = $existingId;
                }
            }
            $fields = [
                'company_id' => $company_id,
                'serial_no' => $data['serial_no'],
                'is_tax_return' => $is_tax,
                'return_date' => $data['return_date'] ?: null,
                'return_type' => $data['return_type'],
                'sale_invoice_no' => $data['sale_invoice_no'],
                'sale_invoice_date' => $data['sale_invoice_date'] ?: null,
                'nature_of_credit_note' => $data['nature_of_credit_note'],
                'dummy_field' => $data['dummy_field'] ?: null,
                'payment_terms' => $data['payment_terms'],
                'income_account' => $data['income_account'],
                'customer_coa_id' => $data['customer_coa_id'],
                'customer_address' => $data['customer_address'] ?? '',
                'customer_telephone' => $data['customer_telephone'] ?? '',
                'customer_ntn' => $data['customer_ntn'] ?? '',
                'customer_gst' => $data['customer_gst'] ?? '',
                'inventory_location_id' => ($data['nature_of_credit_note'] === 'Rate Adjustment (No Change in Inventory)') ? null : ($data['inventory_location_id'] ?: null),
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

            if ($id) {
                $setClause = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($fields)));
                $stmt = $pdo->prepare("UPDATE sale_returns SET $setClause WHERE id=? AND company_id=?");
                $values = array_values($fields);
                $values[] = $id;
                $values[] = $company_id;
                $stmt->execute($values);
                $pdo->prepare("DELETE FROM sale_return_items WHERE return_id=?")->execute([$id]);
            } else {
                $cols = implode(', ', array_keys($fields));
                $placeholders = implode(', ', array_fill(0, count($fields), '?'));
                $stmt = $pdo->prepare("INSERT INTO sale_returns ($cols) VALUES ($placeholders)");
                $stmt->execute(array_values($fields));
                $id = $pdo->lastInsertId();
            }

            if (!empty($data['items'])) {
                $stmt = $pdo->prepare("INSERT INTO sale_return_items (return_id, item_coa_id, description, pieces, quantity, unit, rate, gross_amount, discount_percent, discount_amount, sales_tax_rate, sales_tax_amount, further_tax_rate, further_tax_amount, net_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($data['items'] as $item) {
                    if (!$item['item_coa_id']) continue;
                    $stmt->execute([
                        $id, $item['item_coa_id'], $item['description'],
                        $item['pieces'] ?: 0, $item['quantity'] ?: 0, $item['unit'], $item['rate'] ?: 0,
                        $item['gross_amount'] ?: 0, $item['discount_percent'] ?: 0, $item['discount_amount'] ?: 0,
                        $item['sales_tax_rate'] ?: 0, $item['sales_tax_amount'] ?: 0,
                        $item['further_tax_rate'] ?: 0, $item['further_tax_amount'] ?: 0,
                        $item['net_amount'] ?: 0
                    ]);
                }
            }
            $pdo->commit();
            $after_data = fetchRecordData('sale_returns', 'sale_return_items', 'return_id', $id);
            $action_type = $data['id'] ? 'UPDATE' : 'INSERT';
            $label = $is_tax ? 'Tax Return' : 'Commercial Return';
            $record_title = "$label #" . ($data['serial_no'] ?? ($after_data['header']['serial_no'] ?? ''));
            logActivity('Sale Return', $action_type, $id, $record_title, $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'delete_return') {
        $id = $data['id'] ?? $_GET['id'] ?? null;
        if ($id) {
            $before_data = fetchRecordData('sale_returns', 'sale_return_items', 'return_id', $id);
            $is_tax = ($before_data['header']['is_tax_return'] ?? 0) == 1;
            $label = $is_tax ? 'Tax Return' : 'Commercial Return';
            $record_title = "$label #" . ($before_data['header']['serial_no'] ?? '');

            $stmt = $pdo->prepare("DELETE FROM sale_returns WHERE id=? AND company_id=?");
            $stmt->execute([$id, $company_id]);

            logActivity('Sale Return', 'DELETE', $id, $record_title, $before_data, null);

            sendResponse(['status' => 'success']);
        }
        sendResponse(['status' => 'error', 'message' => 'ID missing'], 400);
    }

    if ($action === 'toggle_post_return') {
        $id = $data['id'] ?? 0;
        $is_posted = isset($data['is_posted']) ? ($data['is_posted'] ? 1 : 0) : 0;
        try {
            $stmt = $pdo->prepare("UPDATE sale_returns SET is_posted = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$is_posted, $id, $company_id]);
            logActivity('Sale Return', 'POST_TOGGLE', $id, "is_posted set to $is_posted");
            sendResponse(['status' => 'success', 'is_posted' => $is_posted]);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
        exit;
    }

}
?>
