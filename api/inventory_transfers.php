<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Tables
$pdo->exec("CREATE TABLE IF NOT EXISTS inventory_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    serial_no INT NOT NULL,
    date DATE NOT NULL,
    transfer_from_location_id INT,
    transfer_to_location_id INT,
    transfer_from_job_id INT,
    transfer_to_job_id INT,
    employee_id INT,
    remarks TEXT,
    total_pieces DECIMAL(15,2) DEFAULT 0,
    total_qty DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    is_cancelled TINYINT DEFAULT 0,
    is_posted TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (company_id, serial_no)
) ENGINE=InnoDB");

try {
    $pdo->exec("ALTER TABLE inventory_transfers ADD COLUMN is_posted TINYINT DEFAULT 0 AFTER is_cancelled");
} catch (Exception $e) {}

$pdo->exec("CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transfer_id INT NOT NULL,
    item_id INT NOT NULL,
    description TEXT,
    pieces DECIMAL(15,2) DEFAULT 0,
    qty DECIMAL(15,4) DEFAULT 0,
    rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE
) ENGINE=InnoDB");

try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN is_inactive TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN hs_code VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN unit VARCHAR(50) DEFAULT 'Pcs'"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN qty_per_piece DECIMAL(15,2) DEFAULT 0"); } catch (Exception $e) {}

switch ($action) {
    case 'search_transfers':
        $stmt = $pdo->prepare("
            SELECT t1.id, t1.serial_no, t1.date, t1.is_cancelled, t1.is_posted, t1.created_at, t1.remarks as reference_no
            FROM inventory_transfers t1
            INNER JOIN (
                SELECT MAX(id) as max_id FROM inventory_transfers WHERE company_id = ? GROUP BY serial_no
            ) t2 ON t1.id = t2.max_id
            ORDER BY t1.id DESC
            LIMIT 200
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;

    case 'get_dependencies':
        try {
            $locations = [];
            try { $locations = $pdo->query("SELECT id, name FROM inv_locations WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            $jobs = [];
            try { $jobs = $pdo->query("SELECT id, job_no, description FROM job_cards WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            $employees = [];
            try { $employees = $pdo->query("SELECT id, name FROM employees WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            $items = [];
            try { 
                $items = $pdo->query("SELECT id, code as item_code, name as item_name, unit, qty_per_piece, selling_price as sale_rate, purchase_price as purchase_rate FROM inv_items WHERE company_id = $company_id AND (is_inactive = 0 OR is_inactive IS NULL)")->fetchAll(PDO::FETCH_ASSOC); 
            } catch (Exception $e) {}

            sendResponse([
                'locations' => $locations,
                'jobs' => $jobs,
                'employees' => $employees,
                'items' => $items
            ]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'get_next_serial_no':
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM inventory_transfers WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
        break;

    case 'toggle_post':
        $id = json_decode(file_get_contents('php://input'), true)['id'] ?? 0;
        if (!$id) sendResponse(['error' => 'Invalid ID'], 400);
        try {
            $stmt = $pdo->prepare("SELECT is_posted, serial_no FROM inventory_transfers WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            $it = $stmt->fetch();
            if (!$it) sendResponse(['error' => 'Not found'], 404);

            $new_status = $it['is_posted'] ? 0 : 1;
            $pdo->prepare("UPDATE inventory_transfers SET is_posted = ? WHERE id = ?")->execute([$new_status, $id]);
            logActivity('Inventory Transfers', 'POST_TOGGLE', $id, "Inventory Transfer Serial: " . $it['serial_no'] . " is_posted set to $new_status");
            sendResponse(['status' => 'success', 'is_posted' => $new_status]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) sendResponse(['error' => 'Invalid data'], 400);

        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('inventory_transfers', 'inventory_transfer_items', 'transfer_id', $id) : null;
            $pdo->beginTransaction();
            // Check for duplicate serial_no
            $check = $pdo->prepare("SELECT id FROM inventory_transfers WHERE serial_no = ? AND company_id = ? AND (? IS NULL OR id != ?)");
            $check->execute([$data['serial_no'], $company_id, $id, $id]);
            if ($check->fetchColumn()) {
                sendResponse(['error' => "An Inventory Transfer with Serial No " . $data['serial_no'] . " already exists!"], 400);
            }

            if ($id) {
                // Update
                $sql = "UPDATE inventory_transfers SET 
                        serial_no = ?, date = ?, transfer_from_location_id = ?, transfer_to_location_id = ?, 
                        transfer_from_job_id = ?, transfer_to_job_id = ?, employee_id = ?, remarks = ?, 
                        total_pieces = ?, total_qty = ?, total_amount = ?, is_cancelled = ?, is_posted = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['serial_no'],
                    $data['date'], 
                    $data['transfer_from_location_id'] ?: null, 
                    $data['transfer_to_location_id'] ?: null, 
                    $data['transfer_from_job_id'] ?: null, 
                    $data['transfer_to_job_id'] ?: null, 
                    $data['employee_id'] ?: null,
                    $data['remarks'], 
                    $data['total_pieces'], 
                    $data['total_qty'], 
                    $data['total_amount'], 
                    $data['is_cancelled'] ? 1 : 0, 
                    isset($data['is_posted']) && $data['is_posted'] ? 1 : 0,
                    $id, 
                    $company_id
                ]);
            } else {
                // Insert
                $sql = "INSERT INTO inventory_transfers (
                        company_id, serial_no, date, transfer_from_location_id, transfer_to_location_id, 
                        transfer_from_job_id, transfer_to_job_id, employee_id, remarks, 
                        total_pieces, total_qty, total_amount, is_cancelled, is_posted
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, 
                    $data['serial_no'], 
                    $data['date'], 
                    $data['transfer_from_location_id'] ?: null, 
                    $data['transfer_to_location_id'] ?: null, 
                    $data['transfer_from_job_id'] ?: null, 
                    $data['transfer_to_job_id'] ?: null, 
                    $data['employee_id'] ?: null, 
                    $data['remarks'], 
                    $data['total_pieces'], 
                    $data['total_qty'], 
                    $data['total_amount'], 
                    $data['is_cancelled'] ? 1 : 0,
                    isset($data['is_posted']) && $data['is_posted'] ? 1 : 0
                ]);
                $id = $pdo->lastInsertId();
            }

            // Save Items
            $pdo->prepare("DELETE FROM inventory_transfer_items WHERE transfer_id = ?")->execute([$id]);
            $itemSql = "INSERT INTO inventory_transfer_items (transfer_id, item_id, description, pieces, qty, rate, amount, sort_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $index => $item) {
                if (empty($item['item_id'])) continue;
                $itemStmt->execute([
                    $id, 
                    $item['item_id'], 
                    $item['description'], 
                    $item['pieces'], 
                    $item['qty'], 
                    $item['rate'], 
                    $item['amount'], 
                    $index
                ]);
            }

            $pdo->commit();
            $after_data = fetchRecordData('inventory_transfers', 'inventory_transfer_items', 'transfer_id', $id);
            logActivity('Inventory Transfers', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Transfer Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'fetch':
        try {
            $sn = $_GET['sn'] ?? 0;
            $dir = $_GET['dir'] ?? '';
            if ($sn === 'last') {
                $stmt = $pdo->prepare("SELECT * FROM inventory_transfers WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id]);
            } else if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM inventory_transfers WHERE company_id = ? AND serial_no > ? ORDER BY serial_no ASC LIMIT 1");
                $stmt->execute([$company_id, $sn]);
            } else if ($dir === 'prev') {
                $stmt = $pdo->prepare("SELECT * FROM inventory_transfers WHERE company_id = ? AND serial_no < ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id, $sn]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM inventory_transfers WHERE company_id = ? AND serial_no = ?");
                $stmt->execute([$company_id, $sn]);
            }
            $transfer = $stmt->fetch();

            if ($transfer) {
                $itemStmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.unit, inv.qty_per_piece 
                                          FROM inventory_transfer_items i 
                                          JOIN inv_items inv ON i.item_id = inv.id 
                                          WHERE i.transfer_id = ? ORDER BY i.sort_order");
                $itemStmt->execute([$transfer['id']]);
                $transfer['items'] = $itemStmt->fetchAll();
                
                sendResponse($transfer);
            } else {
                sendResponse(['error' => 'Not found'], 404);
            }
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'delete':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('inventory_transfers', 'inventory_transfer_items', 'transfer_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM inventory_transfers WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Inventory Transfers', 'DELETE', $id, 'Transfer Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
        break;

    default:
        sendResponse(['error' => 'Invalid action'], 400);
}





