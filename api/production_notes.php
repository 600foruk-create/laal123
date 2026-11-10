<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Tables
$pdo->exec("CREATE TABLE IF NOT EXISTS production_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    serial_no INT NOT NULL,
    date DATE NOT NULL,
    reference_no VARCHAR(100),
    inventory_location_id INT,
    job_id INT,
    employee_id INT,
    debit_account_id INT,
    credit_account_id INT,
    remarks TEXT,
    total_pieces DECIMAL(15,2) DEFAULT 0,
    total_qty DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    is_cancelled TINYINT DEFAULT 0,
    is_posted TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (company_id, serial_no)
) ENGINE=InnoDB");

$pdo->exec("CREATE TABLE IF NOT EXISTS production_note_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pn_id INT NOT NULL,
    item_id INT NOT NULL,
    description TEXT,
    pieces DECIMAL(15,2) DEFAULT 0,
    qty DECIMAL(15,4) DEFAULT 0,
    rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (pn_id) REFERENCES production_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB");


try { $pdo->exec("ALTER TABLE production_notes ADD COLUMN is_posted TINYINT DEFAULT 0 AFTER is_cancelled"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN is_inactive TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN hs_code VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN unit VARCHAR(50) DEFAULT 'Pcs'"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN qty_per_piece DECIMAL(15,2) DEFAULT 0"); } catch (Exception $e) {}

switch ($action) {
    case 'search_pns':
        $stmt = $pdo->prepare("
            SELECT p1.id, p1.serial_no, p1.date, p1.reference_no, p1.is_cancelled, p1.is_posted, p1.created_at
            FROM production_notes p1
            INNER JOIN (
                SELECT MAX(id) as max_id FROM production_notes WHERE company_id = ? GROUP BY serial_no
            ) p2 ON p1.id = p2.max_id
            ORDER BY p1.id DESC
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

            $accounts = [];
            try {
                $accounts = $pdo->query("
                    SELECT c.id, c.code, c.name
                    FROM coa_list c
                    LEFT JOIN coa_sub s ON c.sub_id = s.id
                    LEFT JOIN coa_main m ON s.main_id = m.id
                    WHERE c.company_id = $company_id
                    AND (m.name LIKE '%Cost of Sale%' OR s.name LIKE '%Cost of Sale%' OR c.name LIKE '%Cost of Sale%')
                ")->fetchAll(PDO::FETCH_ASSOC);
            } catch (Exception $e) {}

            $items = [];
            try { $items = $pdo->query("SELECT id, code as item_code, name as item_name, unit, qty_per_piece, hs_code, selling_price as sale_rate, purchase_price as purchase_rate FROM inv_items WHERE company_id = $company_id AND (is_inactive = 0 OR is_inactive IS NULL) ORDER BY code, name")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}

            sendResponse([
                'locations' => $locations,
                'jobs'      => $jobs,
                'employees' => $employees,
                'accounts'  => $accounts,
                'items'     => $items
            ]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'get_next_serial_no':
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM production_notes WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
        break;

    case 'toggle_post':
        $id = json_decode(file_get_contents('php://input'), true)['id'] ?? 0;
        if (!$id) sendResponse(['error' => 'Invalid ID'], 400);
        try {
            $stmt = $pdo->prepare("SELECT is_posted, serial_no FROM production_notes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            $pn = $stmt->fetch();
            if (!$pn) sendResponse(['error' => 'Not found'], 404);

            $new_status = $pn['is_posted'] ? 0 : 1;
            $pdo->prepare("UPDATE production_notes SET is_posted = ? WHERE id = ?")->execute([$new_status, $id]);
            logActivity('Production Notes', 'POST_TOGGLE', $id, "Production Note Serial: " . $pn['serial_no'] . " is_posted set to $new_status");
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
            $before_data = $id ? fetchRecordData('production_notes', 'production_note_items', 'pn_id', $id) : null;
            $pdo->beginTransaction();

            $location_id = $data['inventory_location_id'] ?: null;

            // Check for duplicate serial_no
            $check = $pdo->prepare("SELECT id FROM production_notes WHERE serial_no = ? AND company_id = ? AND (? IS NULL OR id != ?)");
            $check->execute([$data['serial_no'], $company_id, $id, $id]);
            if ($check->fetchColumn()) {
                sendResponse(['error' => "A Production Note with Serial No " . $data['serial_no'] . " already exists!"], 400);
            }

            if ($id) {
                $sql = "UPDATE production_notes SET
                        serial_no = ?, date = ?, reference_no = ?, inventory_location_id = ?, job_id = ?, employee_id = ?,
                        debit_account_id = ?, credit_account_id = ?, remarks = ?,
                        total_pieces = ?, total_qty = ?, total_amount = ?, is_cancelled = ?, is_posted = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['serial_no'], $data['date'], $data['reference_no'], $location_id,
                    $data['job_id'] ?: null, $data['employee_id'] ?: null,
                    $data['debit_account_id'] ?: null, $data['credit_account_id'] ?: null,
                    $data['remarks'], $data['total_pieces'], $data['total_qty'], $data['total_amount'],
                    $data['is_cancelled'] ? 1 : 0, $data['is_posted'] ? 1 : 0, $id, $company_id
                ]);
            } else {
                $sql = "INSERT INTO production_notes (
                        company_id, serial_no, date, reference_no, inventory_location_id, job_id, employee_id,
                        debit_account_id, credit_account_id, remarks, total_pieces, total_qty, total_amount, is_cancelled, is_posted
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $data['serial_no'], $data['date'], $data['reference_no'],
                    $location_id, $data['job_id'] ?: null, $data['employee_id'] ?: null,
                    $data['debit_account_id'] ?: null, $data['credit_account_id'] ?: null,
                    $data['remarks'], $data['total_pieces'], $data['total_qty'], $data['total_amount'],
                    $data['is_cancelled'] ? 1 : 0, $data['is_posted'] ? 1 : 0
                ]);
                $id = $pdo->lastInsertId();
            }

            // Save Items & ADD to inventory
            $pdo->prepare("DELETE FROM production_note_items WHERE pn_id = ?")->execute([$id]);
            $itemSql = "INSERT INTO production_note_items (pn_id, item_id, description, pieces, qty, rate, amount, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);

            foreach ($data['items'] as $index => $item) {
                if (empty($item['item_id'])) continue;
                $itemStmt->execute([
                    $id, $item['item_id'], $item['description'],
                    $item['pieces'], $item['qty'], $item['rate'], $item['amount'], $index
                ]);

            }

            $pdo->commit();
            $after_data = fetchRecordData('production_notes', 'production_note_items', 'pn_id', $id);
            logActivity('Production Notes', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Production Note Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
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
                $stmt = $pdo->prepare("SELECT * FROM production_notes WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id]);
            } else {
                if ($dir === 'next') {
                    $stmt = $pdo->prepare("SELECT * FROM production_notes WHERE serial_no > ? AND company_id = ? ORDER BY serial_no ASC LIMIT 1");
                } else if ($dir === 'prev') {
                    $stmt = $pdo->prepare("SELECT * FROM production_notes WHERE serial_no < ? AND company_id = ? ORDER BY serial_no DESC LIMIT 1");
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM production_notes WHERE serial_no = ? AND company_id = ?");
                }
                if ($dir === 'next' || $dir === 'prev') {
                    $stmt->execute([$sn, $company_id]);
                } else {
                    $stmt->execute([$sn, $company_id]);
                }
            }
            $pn = $stmt->fetch();

            if ($pn) {
                $itemStmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.unit
                                          FROM production_note_items i
                                          JOIN inv_items inv ON i.item_id = inv.id
                                          WHERE i.pn_id = ? ORDER BY i.sort_order");
                $itemStmt->execute([$pn['id']]);
                $pn['items'] = $itemStmt->fetchAll();

                if ($pn['debit_account_id']) {
                    $stmt = $pdo->prepare("SELECT code, name FROM coa_list WHERE id=?");
                    $stmt->execute([$pn['debit_account_id']]);
                    $dr = $stmt->fetch();
                    if ($dr) { $pn['debit_account_code'] = $dr['code']; $pn['debit_account_name'] = $dr['name']; }
                }
                if ($pn['credit_account_id']) {
                    $stmt = $pdo->prepare("SELECT code, name FROM coa_list WHERE id=?");
                    $stmt->execute([$pn['credit_account_id']]);
                    $cr = $stmt->fetch();
                    if ($cr) { $pn['credit_account_code'] = $cr['code']; $pn['credit_account_name'] = $cr['name']; }
                }

                sendResponse($pn);
            } else {
                sendResponse(['error' => 'Not found'], 404);
            }
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'delete':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('production_notes', 'production_note_items', 'pn_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM production_notes WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Production Notes', 'DELETE', $id, 'Production Note Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
        break;

    default:
        sendResponse(['error' => 'Invalid action'], 400);
}





