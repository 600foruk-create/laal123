<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Cash Receipt tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_receipts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        receipt_date DATE,
        receipt_type ENUM('Customer', 'Petty') DEFAULT 'Customer',
        job_id INT,
        employee_id INT,
        cash_account_coa_id INT,
        received_from_coa_id INT,
        prepayment_advance DECIMAL(15,2) DEFAULT 0,
        total_amount DECIMAL(15,2) DEFAULT 0,
        amount_in_words VARCHAR(255),
        remarks TEXT,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_receipt_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        receipt_id INT NOT NULL,
        coa_id INT, -- For Petty Receipts
        description TEXT, -- For Petty/Customer Receipts
        invoice_no VARCHAR(100), -- For Customer Receipts
        invoice_date DATE, -- For Customer Receipts
        received_amount DECIMAL(15,2) DEFAULT 0,
        wht_rate DECIMAL(15,2) DEFAULT 0,
        wht_amount DECIMAL(15,2) DEFAULT 0,
        gst_rate DECIMAL(15,2) DEFAULT 0,
        gst_amount DECIMAL(15,2) DEFAULT 0,
        advance_adjusted DECIMAL(15,2) DEFAULT 0,
        discount_given DECIMAL(15,2) DEFAULT 0,
        total_credited DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (receipt_id) REFERENCES cash_receipts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    try { $pdo->exec("ALTER TABLE cash_receipts ADD COLUMN is_posted TINYINT DEFAULT 1 AFTER is_cancelled"); } catch (PDOException $e) {}

} catch (PDOException $e) {
    echo json_encode(['error' => 'Database Migration Failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'get_next_serial') {
    $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM cash_receipts WHERE company_id = ?");
    $stmt->execute([$company_id]);
    $row = $stmt->fetch();
    echo json_encode(['next_sn' => ($row['max_sn'] ?? 0) + 1]);
    exit;
}

if ($action === 'search_parties') {
    $q = $_GET['q'] ?? '';
    $q = "%$q%";
    $stmt = $pdo->prepare("
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        INNER JOIN coa_sub cs ON cl.sub_id = cs.id
        INNER JOIN coa_main cm ON cs.main_id = cm.id
        WHERE cl.company_id = ? 
        AND (cl.name LIKE ? OR cl.code LIKE ?)
        AND (
            cm.code = '120' OR LOWER(cm.name) LIKE '%walk-in%'
        )
        LIMIT 20
    ");
    $stmt->execute([$company_id, $q, $q]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'search_cash_accounts') {
    $q = $_GET['q'] ?? '';
    $q = "%$q%";
    $stmt = $pdo->prepare("
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        INNER JOIN coa_sub cs ON cl.sub_id = cs.id
        INNER JOIN coa_main cm ON cs.main_id = cm.id
        WHERE cl.company_id = ? 
        AND (cl.name LIKE ? OR cl.code LIKE ?)
        AND (
            TRIM(LOWER(cm.name)) = 'cash'
        )
        LIMIT 20
    ");
    $stmt->execute([$company_id, $q, $q]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'get_pending_invoices') {
    $customer_coa_id = $_GET['customer_coa_id'] ?? null;
    if (!$customer_coa_id) { echo json_encode([]); exit; }
    try {
        $stmt = $pdo->prepare("
            SELECT 
                si.id,
                si.serial_no AS invoice_no,
                si.invoice_date,
                si.net_total AS invoice_amount,
                COALESCE(si.amount_received, 0) AS amount_paid
            FROM sale_invoices si
            WHERE si.customer_coa_id = ?
            AND si.company_id = ?
            AND si.is_cancelled = 0
            AND si.net_total > COALESCE(si.amount_received, 0)
            ORDER BY si.invoice_date ASC
            LIMIT 100
        ");
        $stmt->execute([$customer_coa_id, $company_id]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $balance = floatval($row['invoice_amount']) - floatval($row['amount_paid']);
            $row['balance_amount'] = round($balance, 2);
            $row['returns'] = 0;
            $row['taxes_paid'] = 0;
        }
        echo json_encode($rows);
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'search_grid_accounts') {
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

if ($action === 'search_invoices') {
    $customer_coa_id = $_GET['customer_coa_id'] ?? 0;
    $q = $_GET['q'] ?? '';
    $q = "%$q%";
    $stmt = $pdo->prepare("
        SELECT id, serial_no, invoice_date, net_total 
        FROM sale_invoices 
        WHERE company_id = ? 
        AND customer_coa_id = ? 
        AND is_cancelled = 0
        AND (serial_no LIKE ? OR invoice_date LIKE ?)
        ORDER BY serial_no DESC
        LIMIT 20
    ");
    $stmt->execute([$company_id, $customer_coa_id, $q, $q]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'save') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? null;

    // Capture state before save (for UPDATE)
    $before_data = $id ? fetchRecordData('cash_receipts', 'cash_receipt_items', 'receipt_id', $id) : null;

    // Fetch Auto Post Preference
    $stmtSet = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = ? AND setting_key = 'auto_post_vouchers'");
    $stmtSet->execute([$company_id]);
    $auto_post = $stmtSet->fetchColumn();
    $is_posted = ($auto_post === false || $auto_post === '1') ? 1 : 0;

    try {
        $pdo->beginTransaction();

        if ($id) {
            $stmt = $pdo->prepare("UPDATE cash_receipts SET receipt_date=?, receipt_type=?, job_id=?, employee_id=?, cash_account_coa_id=?, received_from_coa_id=?, prepayment_advance=?, total_amount=?, amount_in_words=?, remarks=?, is_cancelled=?, is_posted=? WHERE id=? AND company_id=?");
            $stmt->execute([
                $data['receipt_date'] ?? null, 
                $data['receipt_type'] ?? 'Customer', 
                $data['job_id'] ?? null, 
                $data['employee_id'] ?? null,
                $data['cash_account_coa_id'] ?? null, 
                $data['received_from_coa_id'] ?? null, 
                $data['prepayment_advance'] ?? 0,
                $data['total_amount'] ?? 0, 
                $data['amount_in_words'] ?? '', 
                $data['remarks'] ?? '', 
                $data['is_cancelled'] ?? 0,
                $is_posted,
                $id, $company_id
            ]);
            $pdo->prepare("DELETE FROM cash_receipt_items WHERE receipt_id=?")->execute([$id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO cash_receipts (company_id, serial_no, receipt_date, receipt_type, job_id, employee_id, cash_account_coa_id, received_from_coa_id, prepayment_advance, total_amount, amount_in_words, remarks, is_cancelled, is_posted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $company_id, 
                $data['serial_no'] ?? 1, 
                $data['receipt_date'] ?? null, 
                $data['receipt_type'] ?? 'Customer',
                $data['job_id'] ?? null, 
                $data['employee_id'] ?? null, 
                $data['cash_account_coa_id'] ?? null, 
                $data['received_from_coa_id'] ?? null,
                $data['prepayment_advance'] ?? 0, 
                $data['total_amount'] ?? 0, 
                $data['amount_in_words'] ?? '', 
                $data['remarks'] ?? '',
                $data['is_cancelled'] ?? 0,
                $is_posted
            ]);
            $id = $pdo->lastInsertId();
        }

        if (!empty($data['items'])) {
            $stmt = $pdo->prepare("INSERT INTO cash_receipt_items (receipt_id, coa_id, description, invoice_no, invoice_date, received_amount, wht_rate, wht_amount, gst_rate, gst_amount, advance_adjusted, discount_given, total_credited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($data['items'] as $item) {
                $stmt->execute([
                    $id, 
                    $item['coa_id'] ?? null, 
                    $item['description'] ?? null,
                    $item['invoice_no'] ?? null, 
                    $item['invoice_date'] ?? null, 
                    $item['received_amount'] ?? 0,
                    $item['wht_rate'] ?? 0, 
                    $item['wht_amount'] ?? 0, 
                    $item['gst_rate'] ?? 0, 
                    $item['gst_amount'] ?? 0,
                    $item['advance_adjusted'] ?? 0, 
                    $item['discount_given'] ?? 0, 
                    $item['total_credited'] ?? 0
                ]);
            }
        }

        $pdo->commit();

        // Capture state after save and log activity
        $after_data = fetchRecordData('cash_receipts', 'cash_receipt_items', 'receipt_id', $id);
        $action_type = $data['id'] ? 'UPDATE' : 'INSERT';
        $record_title = "Cash Receipt #" . ($data['serial_no'] ?? ($after_data['header']['serial_no'] ?? ''));
        logActivity('Cash Receipts', $action_type, $id, $record_title, $before_data, $after_data);

        echo json_encode(['status' => 'success', 'id' => $id]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'toggle_post') {
    $json = file_get_contents('php://input');
    $data = json_decode($json, true) ?: [];
    $id = $data['id'] ?? null;
    $is_posted = isset($data['is_posted']) ? ($data['is_posted'] ? 1 : 0) : 1;

    if ($id) {
        $before_data = fetchRecordData('cash_receipts', 'cash_receipt_items', 'receipt_id', $id);
        $record_title = "Cash Receipt #" . ($before_data['header']['serial_no'] ?? '');
        $stmt = $pdo->prepare("UPDATE cash_receipts SET is_posted = ? WHERE id = ? AND company_id = ?");
        $stmt->execute([$is_posted, $id, $company_id]);
        $after_data = fetchRecordData('cash_receipts', 'cash_receipt_items', 'receipt_id', $id);
        logActivity('Cash Receipts', 'POST_TOGGLE', $id, $record_title . " -> is_posted = " . $is_posted, $before_data, $after_data);
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
    }
    exit;
}

if ($action === 'get') {
    $id = $_GET['id'] ?? null;
    $sn = $_GET['serial_no'] ?? null;
    
    if ($id) {
        $stmt = $pdo->prepare("SELECT * FROM cash_receipts WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM cash_receipts WHERE serial_no = ? AND company_id = ?");
        $stmt->execute([$sn, $company_id]);
    }
    
    $receipt = $stmt->fetch();
    if ($receipt) {
        $stmt = $pdo->prepare("
            SELECT i.*, cl.code as coa_code, cl.name as coa_name 
            FROM cash_receipt_items i 
            LEFT JOIN coa_list cl ON i.coa_id = cl.id
            WHERE i.receipt_id = ?
        ");
        $stmt->execute([$receipt['id']]);
        $receipt['items'] = $stmt->fetchAll();
        
        // Fetch account names
        $stmt = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
        $stmt->execute([$receipt['cash_account_coa_id']]);
        $receipt['cash_account'] = $stmt->fetch();
        
        if ($receipt['received_from_coa_id']) {
            $stmt->execute([$receipt['received_from_coa_id']]);
            $receipt['received_from'] = $stmt->fetch();
        }
        
        echo json_encode($receipt);
    } else {
        echo json_encode(null);
    }
    exit;
}

if ($action === 'delete') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        // Capture state before deletion
        $before_data = fetchRecordData('cash_receipts', 'cash_receipt_items', 'receipt_id', $id);
        $record_title = "Cash Receipt #" . ($before_data['header']['serial_no'] ?? '');

        $stmt = $pdo->prepare("DELETE FROM cash_receipts WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);

        logActivity('Cash Receipts', 'DELETE', $id, $record_title, $before_data, null);

        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
    }
    exit;
}

if ($action === 'search_receipts') {
    try {
        $stmt = $pdo->prepare("
            SELECT 
                r.id,
                r.serial_no,
                r.receipt_date,
                r.receipt_type,
                c.name AS cash_account_name,
                v.name AS customer_name,
                r.is_cancelled,
                r.is_posted,
                r.total_amount,
                COALESCE((SELECT SUM(wht_amount) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_wht,
                COALESCE((SELECT SUM(gst_amount) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_gst,
                COALESCE((SELECT SUM(advance_adjusted) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_adv,
                COALESCE((SELECT SUM(discount_given) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_disc,
                COALESCE((SELECT SUM(received_amount) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_rcvd_amount
            FROM cash_receipts r
            LEFT JOIN coa_list c ON r.cash_account_coa_id = c.id
            LEFT JOIN coa_list v ON r.received_from_coa_id = v.id
            WHERE r.company_id = ?
            ORDER BY r.serial_no ASC
            LIMIT 500
        ");
        $stmt->execute([$company_id]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($data);
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}
