<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

// MIGRATION: Ensure Quotation tables exist
if (shouldRunMigration('quotations_schema', 1)) {
    if (!in_array($action, ['get_all_inventory', 'get_customers_and_vendors'])) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS quotations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                serial_no INT NOT NULL,
                date DATE,
                valid_till DATE,
                subject_line VARCHAR(255) DEFAULT 'QUOTATION',
                customer_coa_id INT,
                job_id INT,
                employee_id INT,
                terms_of_payment TEXT,
                total_pieces DECIMAL(15,2) DEFAULT 0.00,
                total_qty DECIMAL(15,2) DEFAULT 0.00,
                total_excl_tax DECIMAL(15,2) DEFAULT 0.00,
                total_tax_amount DECIMAL(15,2) DEFAULT 0.00,
                total_further_tax DECIMAL(15,2) DEFAULT 0.00,
                total_amount DECIMAL(15,2) DEFAULT 0.00,
                remarks TEXT,
                terms_conditions TEXT,
                is_cancelled TINYINT DEFAULT 0,
                is_converted TINYINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (company_id),
                INDEX (customer_coa_id),
                INDEX (serial_no)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            // Ensure table exists
            $pdo->exec("CREATE TABLE IF NOT EXISTS quotation_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                quotation_id INT NOT NULL,
                item_coa_id INT NOT NULL,
                pieces DECIMAL(15,2) DEFAULT 0.00,
                qty DECIMAL(15,2) DEFAULT 0.00,
                rate DECIMAL(15,2) DEFAULT 0.00,
                val_excl_tax DECIMAL(15,2) DEFAULT 0.00,
                tax_rate DECIMAL(15,2) DEFAULT 0.00,
                tax_amount DECIMAL(15,2) DEFAULT 0.00,
                further_tax_rate DECIMAL(15,2) DEFAULT 0.00,
                further_tax_amount DECIMAL(15,2) DEFAULT 0.00,
                val_incl_tax DECIMAL(15,2) DEFAULT 0.00,
                FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            // Advanced Migration: Check and Add missing columns
            $cols = $pdo->query("SHOW COLUMNS FROM quotation_items")->fetchAll(PDO::FETCH_COLUMN);
            
            if (!in_array('item_coa_id', $cols)) {
                if (in_array('inventory_id', $cols)) {
                    $pdo->exec("ALTER TABLE quotation_items CHANGE COLUMN inventory_id item_coa_id INT NOT NULL");
                } else {
                    $pdo->exec("ALTER TABLE quotation_items ADD COLUMN item_coa_id INT NOT NULL AFTER quotation_id");
                }
            }
            
            $qCols = $pdo->query("SHOW COLUMNS FROM quotations")->fetchAll(PDO::FETCH_COLUMN);
            $newCols = ['converted_to_so', 'converted_to_dc', 'converted_to_inv_tax', 'converted_to_inv_nontax'];
            foreach ($newCols as $col) {
                if (!in_array($col, $qCols)) {
                    $pdo->exec("ALTER TABLE quotations ADD COLUMN $col INT DEFAULT 0");
                }
            }
            if (!in_array('customer_address', $qCols)) {
                $pdo->exec("ALTER TABLE quotations ADD COLUMN customer_address VARCHAR(500) DEFAULT ''");
            }
            if (!in_array('customer_telephone', $qCols)) {
                $pdo->exec("ALTER TABLE quotations ADD COLUMN customer_telephone VARCHAR(100) DEFAULT ''");
            }
            if (!in_array('contact_person', $qCols)) {
                $pdo->exec("ALTER TABLE quotations ADD COLUMN contact_person VARCHAR(255) DEFAULT ''");
            }
            
            if (!in_array('pieces', $cols)) {
                $pdo->exec("ALTER TABLE quotation_items ADD COLUMN pieces DECIMAL(15,2) DEFAULT 0.00 AFTER item_coa_id");
            }
            
            // Ensure other needed columns exist (fallback)
            $needed = [
                'qty' => 'DECIMAL(15,2) DEFAULT 0.00',
                'rate' => 'DECIMAL(15,2) DEFAULT 0.00',
                'val_excl_tax' => 'DECIMAL(15,2) DEFAULT 0.00',
                'tax_rate' => 'DECIMAL(15,2) DEFAULT 0.00',
                'tax_amount' => 'DECIMAL(15,2) DEFAULT 0.00',
                'further_tax_rate' => 'DECIMAL(15,2) DEFAULT 0.00',
                'further_tax_amount' => 'DECIMAL(15,2) DEFAULT 0.00',
                'val_incl_tax' => 'DECIMAL(15,2) DEFAULT 0.00'
            ];
            foreach ($needed as $col => $def) {
                if (!in_array($col, $cols)) {
                    $pdo->exec("ALTER TABLE quotation_items ADD COLUMN $col $def");
                }
            }

        } catch (Exception $e) {}
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_next_serial_no') {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM quotations WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        echo json_encode(['next_no' => ($row['max_no'] ?? 0) + 1]);
    }

    if ($action === 'get_all_quotations') {
        $stmt = $pdo->prepare("
            SELECT q.serial_no, DATE_FORMAT(q.date, '%d-%m-%Y') as formatted_date, q.date, 
                   DATE_FORMAT(q.valid_till, '%d-%m-%Y') as formatted_valid_till,
                   cl.name as customer_name, q.terms_of_payment,
                   e.name as employee_name, q.total_amount,
                   CASE WHEN q.is_cancelled = 1 THEN 'Cancelled' WHEN q.is_converted = 1 THEN 'Converted' ELSE '' END as status,
                   q.created_at
            FROM quotations q
            LEFT JOIN coa_list cl ON q.customer_coa_id = cl.id
            LEFT JOIN employees e ON q.employee_id = e.id
            WHERE q.company_id = ?
            ORDER BY q.serial_no ASC
            LIMIT 500
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    if ($action === 'get_all_inventory') {
        $stmt = $pdo->prepare("SELECT id, code as item_code, name as item_name, COALESCE(unit, 'Pcs') as unit, COALESCE(selling_price, 0) as sales_price, COALESCE(qty_per_piece, 0) as qty_per_piece, COALESCE(hs_code, '') as hs_code FROM inv_items WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL)  ORDER BY name ASC LIMIT 100");
        $stmt->execute([$company_id]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($results ? $results : []);
        exit;
    }

    if ($action === 'get_customers_and_vendors') {
        $stmt = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, 
                   COALESCE(c.address, v.address, '') as address, 
                   COALESCE(c.telephone, v.telephone, '') as telephone,
                   COALESCE(c.contact_person, v.contact_person, '') as contact_person,
                   CASE WHEN cm.code = '120' THEN 'customer' ELSE 'vendor' END as type
            FROM coa_list cl
            INNER JOIN coa_sub cs ON cl.sub_id = cs.id
            INNER JOIN coa_main cm ON cs.main_id = cm.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
            WHERE cl.company_id = ? 
              AND (
                  cm.code = '120' OR cm.code = '210'
              )
            ORDER BY cl.name ASC
        ");
        $stmt->execute([$company_id]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($results ? $results : []);
        exit;
    }

    if ($action === 'get_quotation' && isset($_GET['serial_no'])) {
        $dir = $_GET['dir'] ?? '';
        $sn = $_GET['serial_no'] ?? 0;
        $sql = "
            SELECT q.*, cl.name as customer_name, cl.code as customer_code, 
                   COALESCE(NULLIF(q.contact_person, ''), c.contact_person, v.contact_person, '') as contact_person,
                   COALESCE(NULLIF(q.customer_address, ''), c.address, v.address, '') as customer_address,
                   COALESCE(NULLIF(q.customer_telephone, ''), c.telephone, v.telephone, '') as customer_telephone
            FROM quotations q
            LEFT JOIN coa_list cl ON q.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
        ";
        if ($dir === 'next') {
            $stmt = $pdo->prepare($sql . " WHERE q.company_id = ? AND q.serial_no > ? ORDER BY q.serial_no ASC LIMIT 1");
        } else if ($dir === 'prev') {
            $stmt = $pdo->prepare($sql . " WHERE q.company_id = ? AND q.serial_no < ? ORDER BY q.serial_no DESC LIMIT 1");
        } else {
            $stmt = $pdo->prepare($sql . " WHERE q.company_id = ? AND q.serial_no = ?");
        }
        $stmt->execute([$company_id, $sn]);
        $quotation = $stmt->fetch();
        
        if ($quotation) {
            $stmt = $pdo->prepare("
                SELECT qi.*, i.code as item_code, i.name as item_name, i.unit, COALESCE(i.hs_code, '') as hs_code
                FROM quotation_items qi
                JOIN inv_items i ON qi.item_coa_id = i.id
                WHERE qi.quotation_id = ?
            ");
            $stmt->execute([$quotation['id']]);
            $quotation['items'] = $stmt->fetchAll();
        }
        echo json_encode($quotation);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'save_quotation') {
        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('quotations', 'quotation_items', 'quotation_id', $id) : null;
            $pdo->beginTransaction();
            
            if ($id) {
                // Update
                $sql = "UPDATE quotations SET 
                        date = ?, valid_till = ?, subject_line = ?, customer_coa_id = ?, 
                        customer_address = ?, customer_telephone = ?, contact_person = ?,
                        job_id = ?, employee_id = ?, terms_of_payment = ?, 
                        total_pieces = ?, total_qty = ?, total_excl_tax = ?, 
                        total_tax_amount = ?, total_further_tax = ?, total_amount = ?, 
                        remarks = ?, terms_conditions = ?, is_cancelled = ?,
                        converted_to_so = ?, converted_to_dc = ?, converted_to_inv_tax = ?, converted_to_inv_nontax = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['date'], $data['valid_till'], $data['subject_line'], $data['customer_coa_id'],
                    $data['customer_address'] ?? '', $data['customer_telephone'] ?? '', $data['contact_person'] ?? '',
                    $data['job_id'], $data['employee_id'], $data['terms_of_payment'],
                    $data['total_pieces'], $data['total_qty'], $data['total_excl_tax'],
                    $data['total_tax_amount'], $data['total_further_tax'], $data['total_amount'],
                    $data['remarks'], $data['terms_conditions'], $data['is_cancelled'] ? 1 : 0, 
                    $data['converted_to_so'] ?? 0, $data['converted_to_dc'] ?? 0, 
                    $data['converted_to_inv_tax'] ?? 0, $data['converted_to_inv_nontax'] ?? 0,
                    $id, $company_id
                ]);
                
                // Delete old items
                $pdo->prepare("DELETE FROM quotation_items WHERE quotation_id = ?")->execute([$id]);
            } else {
                // Insert
                $sql = "INSERT INTO quotations (
                        company_id, serial_no, date, valid_till, subject_line, customer_coa_id,
                        customer_address, customer_telephone, contact_person,
                        job_id, employee_id, terms_of_payment, total_pieces, total_qty, 
                        total_excl_tax, total_tax_amount, total_further_tax, total_amount, 
                        remarks, terms_conditions,
                        converted_to_so, converted_to_dc, converted_to_inv_tax, converted_to_inv_nontax
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $data['serial_no'], $data['date'], $data['valid_till'], 
                    $data['subject_line'], $data['customer_coa_id'],
                    $data['customer_address'] ?? '', $data['customer_telephone'] ?? '', $data['contact_person'] ?? '',
                    $data['job_id'], $data['employee_id'], $data['terms_of_payment'], $data['total_pieces'], 
                    $data['total_qty'], $data['total_excl_tax'], $data['total_tax_amount'], 
                    $data['total_further_tax'], $data['total_amount'], $data['remarks'], 
                    $data['terms_conditions'],
                    $data['converted_to_so'] ?? 0, $data['converted_to_dc'] ?? 0, 
                    $data['converted_to_inv_tax'] ?? 0, $data['converted_to_inv_nontax'] ?? 0
                ]);
                $id = $pdo->lastInsertId();
            }
            
            // Insert items
            $itemSql = "INSERT INTO quotation_items (
                        quotation_id, item_coa_id, pieces, qty, rate, val_excl_tax, 
                        tax_rate, tax_amount, further_tax_rate, further_tax_amount, val_incl_tax
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $item) {
                $itemId = $item['item_coa_id'] ?? $item['item_id'] ?? null;
                if ($itemId) {
                    $itemStmt->execute([
                        $id, $itemId, $item['pieces'], $item['qty'], $item['rate'], 
                        $item['val_excl_tax'], $item['tax_rate'], $item['tax_amount'], 
                        $item['further_tax_rate'], $item['further_tax_amount'], $item['val_incl_tax']
                    ]);
                }
            }
            
            $pdo->commit();
            $after_data = fetchRecordData('quotations', 'quotation_items', 'quotation_id', $id);
            logActivity('Quotations', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Quotation Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            echo json_encode(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    if ($action === 'delete_quotation' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('quotations', 'quotation_items', 'quotation_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM quotations WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Quotations', 'DELETE', $id, 'Quotation Serial: ' . $serial_no, $before_data, null);
        echo json_encode(['status' => 'success']);
    }
}
?>

