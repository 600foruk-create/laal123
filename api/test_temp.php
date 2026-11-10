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
    } catch (PDOException $e) {
        // column already exists
    }

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
        WHERE cl.company_id = ? 
        AND (cl.name LIKE ? OR cl.code LIKE ?)
        LIMIT 20
    ");
    $stmt->execute([$company_id, $q, $q]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'save') {
    $data = json_decode('{"id":1,"serial_no":4,"voucher_date":"2026-05-22","job_id":null,"employee_id":null,"description":"","remarks":"","is_cancelled":0,"total_amount":200,"items":[{"coa_id":1,"debit":200,"credit":0}]}', true);
    $id = $data['id'] ?? null;

    // Capture state before save (for UPDATE)
    $before_data = $id ? fetchRecordData('general_journal_vouchers', 'general_journal_voucher_items', 'voucher_id', $id) : null;

    try {
        $pdo->beginTransaction();

        if ($id) {
            $stmt = $pdo->prepare("UPDATE general_journal_vouchers SET voucher_date=?, job_id=?, employee_id=?, description=?, total_amount=?, remarks=?, is_cancelled=? WHERE id=? AND company_id=?");
            $stmt->execute([
                empty($data['voucher_date']) ? null : $data['voucher_date'], 
                empty($data['job_id']) ? null : $data['job_id'], 
                empty($data['employee_id']) ? null : $data['employee_id'],
                $data['description'] ?? '',
                $data['total_amount'] ?? 0, 
                $data['remarks'] ?? '', 
                $data['is_cancelled'] ?? 0,
                $id, $company_id
            ]);
            $pdo->prepare("DELETE FROM general_journal_voucher_items WHERE voucher_id=?")->execute([$id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO general_journal_vouchers (company_id, serial_no, voucher_date, job_id, employee_id, description, total_amount, remarks, is_cancelled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $company_id, 
                $data['serial_no'] ?? 1, 
                empty($data['voucher_date']) ? null : $data['voucher_date'], 
                empty($data['job_id']) ? null : $data['job_id'], 
                empty($data['employee_id']) ? null : $data['employee_id'], 
                $data['description'] ?? '',
                $data['total_amount'] ?? 0, 
                $data['remarks'] ?? '',
                $data['is_cancelled'] ?? 0
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
