<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Tables
$pdo->exec("CREATE TABLE IF NOT EXISTS formulas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    serial_no INT NOT NULL,
    date DATE NOT NULL,
    inventory_location_id INT,
    job_id INT,
    employee_id INT,
    formula_name VARCHAR(255),
    category_id INT,
    remarks TEXT,
    total_pieces DECIMAL(15,2) DEFAULT 0,
    total_qty DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    is_cancelled TINYINT DEFAULT 0,
    is_posted TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (company_id, serial_no)
) ENGINE=InnoDB");

// Ensure is_posted column exists for legacy data
try { $pdo->exec("ALTER TABLE formulas ADD COLUMN is_posted TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE formulas ADD COLUMN formula_name VARCHAR(255)"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE formulas ADD COLUMN category_id INT"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE formulas MODIFY COLUMN total_qty DECIMAL(15,4) DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE formula_items MODIFY COLUMN qty DECIMAL(15,4) DEFAULT 0"); } catch (Exception $e) {}

$pdo->exec("CREATE TABLE IF NOT EXISTS formula_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    formula_id INT NOT NULL,
    item_id INT NOT NULL,
    description TEXT,
    pieces DECIMAL(15,2) DEFAULT 0,
    qty DECIMAL(15,4) DEFAULT 0,
    rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (formula_id) REFERENCES formulas(id) ON DELETE CASCADE
) ENGINE=InnoDB");

try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN is_inactive TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN hs_code VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN unit VARCHAR(50) DEFAULT 'Pcs'"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN qty_per_piece DECIMAL(15,2) DEFAULT 0"); } catch (Exception $e) {}

switch ($action) {
    case 'get_dependencies':
        try {
            $categories = [];
            try { $categories = $pdo->query("SELECT id, name FROM inv_main_categories WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            $items = [];
            try { 
                $items = $pdo->query("SELECT id, code as item_code, name as item_name, unit, qty_per_piece, selling_price as sale_rate, 
                    COALESCE(
                        (SELECT pii.rate FROM purchase_invoice_items pii 
                         JOIN purchase_invoices pi ON pii.invoice_id = pi.id 
                         WHERE pii.item_coa_id = inv_items.id AND pi.company_id = inv_items.company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 
                         ORDER BY pi.invoice_date DESC, pi.id DESC LIMIT 1),
                        purchase_price
                    ) as purchase_rate 
                    FROM inv_items WHERE company_id = $company_id AND (is_inactive = 0 OR is_inactive IS NULL)")->fetchAll(PDO::FETCH_ASSOC); 
            } catch (Exception $e) {}

            sendResponse([
                'categories' => $categories,
                'items' => $items
            ]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'get_next_serial_no':
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM formulas WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) sendResponse(['error' => 'Invalid data'], 400);

        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('formulas', 'formula_items', 'formula_id', $id) : null;
            $pdo->beginTransaction();

            if ($id) {
                // Update
                $sql = "UPDATE formulas SET 
                        date = ?, formula_name = ?, category_id = ?, remarks = ?, 
                        total_pieces = ?, total_qty = ?, total_amount = ?, is_cancelled = ?, is_posted = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['date'], 
                    $data['formula_name'] ?: null, 
                    $data['category_id'] ?: null, 
                    $data['remarks'] ?? '', 
                    floatval($data['total_pieces'] ?? 0), 
                    floatval($data['total_qty'] ?? 0), 
                    floatval($data['total_amount'] ?? 0), 
                    $data['is_cancelled'] ? 1 : 0, 
                    $data['is_posted'] ? 1 : 0,
                    $id, 
                    $company_id
                ]);
            } else {
                // Insert
                $sql = "INSERT INTO formulas (
                        company_id, serial_no, date, formula_name, category_id, remarks, 
                        total_pieces, total_qty, total_amount, is_cancelled, is_posted
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, 
                    $data['serial_no'], 
                    $data['date'], 
                    $data['formula_name'] ?: null, 
                    $data['category_id'] ?: null, 
                    $data['remarks'] ?? '', 
                    floatval($data['total_pieces'] ?? 0), 
                    floatval($data['total_qty'] ?? 0), 
                    floatval($data['total_amount'] ?? 0), 
                    $data['is_cancelled'] ? 1 : 0,
                    $data['is_posted'] ? 1 : 0
                ]);
                $id = $pdo->lastInsertId();
            }

            // Save Items
            $pdo->prepare("DELETE FROM formula_items WHERE formula_id = ?")->execute([$id]);
            $itemSql = "INSERT INTO formula_items (formula_id, item_id, description, pieces, qty, rate, amount, sort_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $index => $item) {
                if (empty($item['item_id'])) continue;
                $itemStmt->execute([
                    $id, 
                    $item['item_id'], 
                    $item['description'] ?? '', 
                    floatval($item['pieces'] ?? 0), 
                    floatval($item['qty'] ?? 0), 
                    floatval($item['rate'] ?? 0), 
                    floatval($item['amount'] ?? 0), 
                    $index
                ]);
            }

            $pdo->commit();
            $after_data = fetchRecordData('formulas', 'formula_items', 'formula_id', $id);
            logActivity('Formulas', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Adjustment Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'toggle_post':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || !isset($data['id'])) sendResponse(['error' => 'Invalid data'], 400);
        
        $id = $data['id'];
        $is_posted = $data['is_posted'] ? 1 : 0;
        
        try {
            $stmt = $pdo->prepare("UPDATE formulas SET is_posted = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$is_posted, $id, $company_id]);
            
            logActivity('Formulas', 'UPDATE', $id, "Status changed to " . ($is_posted ? 'Posted' : 'Unposted'), null, null);
            sendResponse(['status' => 'success']);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'search_adjustments':
        try {
            $field = $_GET['field'] ?? 'serial_no';
            $value = $_GET['value'] ?? '';
            
            $sql = "SELECT id, serial_no, date, is_cancelled, is_posted, created_at FROM formulas WHERE company_id = ?";
            $params = [$company_id];
            
            if ($value) {
                if ($field === 'serial_no') {
                    $sql .= " AND serial_no LIKE ?";
                    $params[] = "%$value%";
                } else if ($field === 'date') {
                    $sql .= " AND date LIKE ?";
                    $params[] = "%$value%";
                }
            }
            $sql .= " ORDER BY serial_no DESC LIMIT 100";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'fetch':
        try {
            $sn = $_GET['sn'] ?? 0;
            $dir = $_GET['dir'] ?? '';
            if ($sn === 'last') {
                $stmt = $pdo->prepare("SELECT * FROM formulas WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id]);
            } else if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM formulas WHERE company_id = ? AND serial_no > ? ORDER BY serial_no ASC LIMIT 1");
                $stmt->execute([$company_id, $sn]);
            } else if ($dir === 'prev') {
                $stmt = $pdo->prepare("SELECT * FROM formulas WHERE company_id = ? AND serial_no < ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id, $sn]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM formulas WHERE company_id = ? AND serial_no = ?");
                $stmt->execute([$company_id, $sn]);
            }
            $adjustment = $stmt->fetch();

            if ($adjustment) {
                $itemStmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.unit, inv.qty_per_piece 
                                          FROM formula_items i 
                                          JOIN inv_items inv ON i.item_id = inv.id 
                                          WHERE i.formula_id = ? ORDER BY i.sort_order");
                $itemStmt->execute([$adjustment['id']]);
                $adjustment['items'] = $itemStmt->fetchAll();
                
                sendResponse($adjustment);
            } else {
                sendResponse(['error' => 'Not found'], 404);
            }
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'delete':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('formulas', 'formula_items', 'formula_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM formulas WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Formulas', 'DELETE', $id, 'Adjustment Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
        break;

    default:
        sendResponse(['error' => 'Invalid action'], 400);
}






