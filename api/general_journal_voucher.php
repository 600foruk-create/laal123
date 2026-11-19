<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure General Journal Voucher tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS general_journal_vouchers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        voucher_date DATE,
        job_id INT,
        employee_id INT,
        description TEXT,
        total_amount DECIMAL(15,2) DEFAULT 0,
        remarks TEXT,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Alter table for existing databases
    try {
        $pdo->exec("ALTER TABLE general_journal_vouchers ADD COLUMN description TEXT AFTER employee_id");
    } catch (PDOException $e) { }
    
    try {
        $pdo->exec("ALTER TABLE general_journal_vouchers ADD COLUMN is_posted TINYINT DEFAULT 1 AFTER is_cancelled");
    } catch (PDOException $e) { }

    $pdo->exec("CREATE TABLE IF NOT EXISTS general_journal_voucher_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        voucher_id INT NOT NULL,
        coa_id INT NOT NULL,
        description TEXT,
        debit DECIMAL(15,2) DEFAULT 0,
        credit DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (voucher_id) REFERENCES general_journal_vouchers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

} catch (PDOException $e) {
    echo json_encode(['error' => 'Database Migration Failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'get_next_serial') {
    $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM general_journal_vouchers WHERE company_id = ?");
    $stmt->execute([$company_id]);
    $row = $stmt->fetch();
    echo json_encode(['next_sn' => ($row['max_sn'] ?? 0) + 1]);
    exit;
}

if ($action === 'get_max_serial') {
    $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM general_journal_vouchers WHERE company_id = ?");
    $stmt->execute([$company_id]);
    $row = $stmt->fetch();
    echo json_encode(['max_sn' => (int)($row['max_sn'] ?? 0)]);
    exit;
}

if ($action === 'search_accounts') {
    $q = $_GET['q'] ?? '';
    $q = "%$q%";
    $stmt = $pdo->prepare("
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        WHERE (cl.company_id = ? OR cl.company_id = 1 OR cl.company_id IS NULL OR cl.company_id = 0) 
        AND (cl.name LIKE ? OR cl.code LIKE ?)
        LIMIT 50
    ");
    $stmt->execute([$company_id, $q, $q]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'save') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? null;

    // Capture state before save (for UPDATE)
    $before_data = $id ? fetchRecordData('general_journal_vouchers', 'general_journal_voucher_items', 'voucher_id', $id) : null;

    // Fetch Auto Post Preference
    $stmtSet = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = ? AND setting_key = 'auto_post_vouchers'");
    $stmtSet->execute([$company_id]);
    $auto_post = $stmtSet->fetchColumn();
    $is_posted = isset($data['is_posted']) ? (int)$data['is_posted'] : (($auto_post === false || $auto_post === '1') ? 1 : 0);

    $serial_no = $data['serial_no'] ?? 1;

    // Check for duplicate serial_no
    if ($id) {
        $checkStmt = $pdo->prepare("SELECT id FROM general_journal_vouchers WHERE serial_no = ? AND company_id = ? AND id != ?");
        $checkStmt->execute([$serial_no, $company_id, $id]);
    } else {
        $checkStmt = $pdo->prepare("SELECT id FROM general_journal_vouchers WHERE serial_no = ? AND company_id = ?");
        $checkStmt->execute([$serial_no, $company_id]);
    }
    
    if ($checkStmt->fetch()) {
        echo json_encode(['status' => 'error', 'message' => "Serial number $serial_no already exists. Please choose a different one."]);
        exit;
    }

    try {
        $pdo->beginTransaction();

        if ($id) {
            $stmt = $pdo->prepare("UPDATE general_journal_vouchers SET serial_no=?, voucher_date=?, job_id=?, employee_id=?, description=?, total_amount=?, remarks=?, is_cancelled=?, is_posted=? WHERE id=? AND company_id=?");
            $stmt->execute([
                $serial_no,
                empty($data['voucher_date']) ? null : $data['voucher_date'], 
                empty($data['job_id']) ? null : $data['job_id'], 
                empty($data['employee_id']) ? null : $data['employee_id'],
                $data['description'] ?? '',
                $data['total_amount'] ?? 0, 
                $data['remarks'] ?? '', 
                $data['is_cancelled'] ?? 0,
                $is_posted,
                $id, $company_id
            ]);
            $pdo->prepare("DELETE FROM general_journal_voucher_items WHERE voucher_id=?")->execute([$id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO general_journal_vouchers (company_id, serial_no, voucher_date, job_id, employee_id, description, total_amount, remarks, is_cancelled, is_posted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $company_id, 
                $serial_no, 
                empty($data['voucher_date']) ? null : $data['voucher_date'], 
                empty($data['job_id']) ? null : $data['job_id'], 
                empty($data['employee_id']) ? null : $data['employee_id'], 
                $data['description'] ?? '',
                $data['total_amount'] ?? 0, 
                $data['remarks'] ?? '',
                $data['is_cancelled'] ?? 0,
                $is_posted
            ]);
            $id = $pdo->lastInsertId();
        }

        if (!empty($data['items'])) {
            $stmt = $pdo->prepare("INSERT INTO general_journal_voucher_items (voucher_id, coa_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)");
            foreach ($data['items'] as $item) {
                $stmt->execute([
                    $id, 
                    $item['coa_id'], 
                    $item['description'] ?? null,
                    $item['debit'] ?? 0,
                    $item['credit'] ?? 0
                ]);
            }
        }

        $pdo->commit();

        // Capture state after save and log activity
        $after_data = fetchRecordData('general_journal_vouchers', 'general_journal_voucher_items', 'voucher_id', $id);
        $action_type = $data['id'] ? 'UPDATE' : 'INSERT';
        $record_title = "Voucher #" . ($data['serial_no'] ?? ($after_data['header']['serial_no'] ?? ''));
        logActivity('General Journal Voucher', $action_type, $id, $record_title, $before_data, $after_data);

        echo json_encode(['status' => 'success', 'id' => $id]);
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode(['status' => 'error', 'message' => $e->getMessage() . ' in ' . $e->getFile() . ' on line ' . $e->getLine()]);
    }
    exit;
}

if ($action === 'fetch') {
    $sn = $_GET['sn'] ?? null;
    $dir = $_GET['dir'] ?? null;
    
    if ($dir === 'next') {
        $stmt = $pdo->prepare("SELECT * FROM general_journal_vouchers WHERE serial_no > ? AND company_id = ? ORDER BY serial_no ASC LIMIT 1");
        $stmt->execute([$sn, $company_id]);
    } else if ($dir === 'prev') {
        $stmt = $pdo->prepare("SELECT * FROM general_journal_vouchers WHERE serial_no < ? AND company_id = ? ORDER BY serial_no DESC LIMIT 1");
        $stmt->execute([$sn, $company_id]);
    } else if ($dir === 'last') {
        $stmt = $pdo->prepare("SELECT * FROM general_journal_vouchers WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
        $stmt->execute([$company_id]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM general_journal_vouchers WHERE serial_no = ? AND company_id = ?");
        $stmt->execute([$sn, $company_id]);
    }
    
    $voucher = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($voucher) {
        $stmt = $pdo->prepare("
            SELECT i.*, cl.code as coa_code, cl.name as coa_name 
            FROM general_journal_voucher_items i 
            LEFT JOIN coa_list cl ON i.coa_id = cl.id
            WHERE i.voucher_id = ?
        ");
        $stmt->execute([$voucher['id']]);
        $voucher['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode($voucher);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Record not found']);
    }
    exit;
}

if ($action === 'get') {
    $id = $_GET['id'] ?? null;
    $sn = $_GET['serial_no'] ?? null;
    
    if ($id) {
        $stmt = $pdo->prepare("SELECT * FROM general_journal_vouchers WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM general_journal_vouchers WHERE serial_no = ? AND company_id = ?");
        $stmt->execute([$sn, $company_id]);
    }
    
    $voucher = $stmt->fetch();
    if ($voucher) {
        $stmt = $pdo->prepare("
            SELECT i.*, cl.code as coa_code, cl.name as coa_name 
            FROM general_journal_voucher_items i 
            LEFT JOIN coa_list cl ON i.coa_id = cl.id
            WHERE i.voucher_id = ?
        ");
        $stmt->execute([$voucher['id']]);
        $voucher['items'] = $stmt->fetchAll();
        
        echo json_encode($voucher);
    } else {
        echo json_encode(null);
    }
    exit;
}

if ($action === 'post' || $action === 'toggle_post') {
    $id = $_GET['id'] ?? null;
    if ($action === 'toggle_post') {
        $postData = json_decode(file_get_contents('php://input'), true);
        $id = $postData['id'] ?? $id;
    }

    if ($id) {
        $before_data = fetchRecordData('general_journal_vouchers', 'general_journal_voucher_items', 'voucher_id', $id);
        $record_title = "Voucher #" . ($before_data['header']['serial_no'] ?? '');

        // Determine new status
        $new_status = 1; // Default for 'post' action
        if ($action === 'toggle_post') {
            $stmt = $pdo->prepare("SELECT is_posted FROM general_journal_vouchers WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            $current = $stmt->fetchColumn();
            $new_status = $current ? 0 : 1;
        }

        $stmt = $pdo->prepare("UPDATE general_journal_vouchers SET is_posted = ? WHERE id = ? AND company_id = ?");
        $stmt->execute([$new_status, $id, $company_id]);
        
        $after_data = fetchRecordData('general_journal_vouchers', 'general_journal_voucher_items', 'voucher_id', $id);
        logActivity('General Journal Voucher', 'TOGGLE_POST', $id, $record_title, $before_data, $after_data);
        
        echo json_encode(['status' => 'success', 'is_posted' => $new_status]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
    }
    exit;
}

if ($action === 'delete') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        // Capture state before deletion
        $before_data = fetchRecordData('general_journal_vouchers', 'general_journal_voucher_items', 'voucher_id', $id);
        $record_title = "Voucher #" . ($before_data['header']['serial_no'] ?? '');

        $stmt = $pdo->prepare("DELETE FROM general_journal_vouchers WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);

        logActivity('General Journal Voucher', 'DELETE', $id, $record_title, $before_data, null);

        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
    }
    exit;
}

if ($action === 'search_vouchers') {
    $stmt = $pdo->prepare("SELECT id, serial_no, voucher_date, is_posted, is_cancelled, created_at FROM general_journal_vouchers WHERE company_id = ? ORDER BY serial_no ASC LIMIT 500");
    $stmt->execute([$company_id]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}
