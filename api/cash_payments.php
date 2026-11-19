<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Cash Payment tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        payment_date DATE,
        payment_type ENUM('Vendor', 'Petty') DEFAULT 'Vendor',
        job_id INT,
        employee_id INT,
        cash_account_coa_id INT,
        paid_to_coa_id INT,
        prepayment_advance DECIMAL(15,2) DEFAULT 0,
        total_amount DECIMAL(15,2) DEFAULT 0,
        amount_in_words VARCHAR(255),
        remarks TEXT,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_payment_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NOT NULL,
        coa_id INT, -- For Petty Payments
        description TEXT, -- For Petty Payments
        invoice_no VARCHAR(100), -- For Vendor Payments
        invoice_date DATE, -- For Vendor Payments
        paid_amount DECIMAL(15,2) DEFAULT 0,
        wht_rate DECIMAL(15,2) DEFAULT 0,
        wht_amount DECIMAL(15,2) DEFAULT 0,
        gst_rate DECIMAL(15,2) DEFAULT 0,
        gst_amount DECIMAL(15,2) DEFAULT 0,
        advance_adjusted DECIMAL(15,2) DEFAULT 0,
        discount_received DECIMAL(15,2) DEFAULT 0,
        total_debited DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (payment_id) REFERENCES cash_payments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    try { $pdo->exec("ALTER TABLE cash_payment_items ADD COLUMN coa_id INT AFTER payment_id"); } catch (PDOException $e) {}
    try { $pdo->exec("ALTER TABLE cash_payment_items ADD COLUMN description TEXT AFTER coa_id"); } catch (PDOException $e) {}
    try { $pdo->exec("ALTER TABLE cash_payments ADD COLUMN is_posted TINYINT DEFAULT 1 AFTER is_cancelled"); } catch (PDOException $e) {}

} catch (PDOException $e) {
    echo json_encode(['error' => 'Database Migration Failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'get_next_serial') {
    $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM cash_payments WHERE company_id = ?");
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
            cm.code = '210'
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

if ($action === 'search_grid_accounts' || $action === 'search_accounts') {
    $q = trim($_GET['q'] ?? '');
    $likeQ = "%$q%";
    $stmt = $pdo->prepare("
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        WHERE (cl.company_id = ? OR cl.company_id = 1 OR cl.company_id IS NULL OR cl.company_id = 0) 
        AND (cl.name LIKE ? OR cl.code LIKE ?)
        ORDER BY cl.code ASC
        LIMIT 50
    ");
    $stmt->execute([$company_id, $likeQ, $likeQ]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'get_all_accounts') {
    $stmt = $pdo->prepare("
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        WHERE (cl.company_id = ? OR cl.company_id = 1 OR cl.company_id IS NULL OR cl.company_id = 0)
        ORDER BY cl.code ASC
    ");
    $stmt->execute([$company_id]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'save') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? null;

    // Capture state before save (for UPDATE)
    $before_data = $id ? fetchRecordData('cash_payments', 'cash_payment_items', 'payment_id', $id) : null;

    // Fetch Auto Post Preference
    $stmtSet = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = ? AND setting_key = 'auto_post_vouchers'");
    $stmtSet->execute([$company_id]);
    $auto_post = $stmtSet->fetchColumn();
    $is_posted = ($auto_post === false || $auto_post === '1') ? 1 : 0;

    try {
        $pdo->beginTransaction();

        if ($id) {
            $stmt = $pdo->prepare("UPDATE cash_payments SET payment_date=?, payment_type=?, job_id=?, employee_id=?, cash_account_coa_id=?, paid_to_coa_id=?, prepayment_advance=?, total_amount=?, amount_in_words=?, remarks=?, is_cancelled=?, is_posted=? WHERE id=? AND company_id=?");
            $stmt->execute([
                $data['payment_date'] ?? null, 
                $data['payment_type'] ?? 'Vendor', 
                $data['job_id'] ?? null, 
                $data['employee_id'] ?? null,
                $data['cash_account_coa_id'] ?? null, 
                $data['paid_to_coa_id'] ?? null, 
                $data['prepayment_advance'] ?? 0,
                $data['total_amount'] ?? 0, 
                $data['amount_in_words'] ?? '', 
                $data['remarks'] ?? '', 
                $data['is_cancelled'] ?? 0,
                $is_posted,
                $id, $company_id
            ]);
            $pdo->prepare("DELETE FROM cash_payment_items WHERE payment_id=?")->execute([$id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO cash_payments (company_id, serial_no, payment_date, payment_type, job_id, employee_id, cash_account_coa_id, paid_to_coa_id, prepayment_advance, total_amount, amount_in_words, remarks, is_cancelled, is_posted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $company_id, 
                $data['serial_no'] ?? 1, 
                $data['payment_date'] ?? null, 
                $data['payment_type'] ?? 'Vendor',
                $data['job_id'] ?? null, 
                $data['employee_id'] ?? null, 
                $data['cash_account_coa_id'] ?? null, 
                $data['paid_to_coa_id'] ?? null,
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
            $stmt = $pdo->prepare("INSERT INTO cash_payment_items (payment_id, coa_id, description, invoice_no, invoice_date, paid_amount, wht_rate, wht_amount, gst_rate, gst_amount, advance_adjusted, discount_received, total_debited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($data['items'] as $item) {
                $stmt->execute([
                    $id, 
                    $item['coa_id'] ?? null, 
                    $item['description'] ?? null,
                    $item['invoice_no'] ?? null, 
                    $item['invoice_date'] ?? null, 
                    $item['paid_amount'] ?? 0,
                    $item['wht_rate'] ?? 0, 
                    $item['wht_amount'] ?? 0, 
                    $item['gst_rate'] ?? 0, 
                    $item['gst_amount'] ?? 0,
                    $item['advance_adjusted'] ?? 0, 
                    $item['discount_received'] ?? 0, 
                    $item['total_debited'] ?? 0
                ]);
            }
        }

        $pdo->commit();

        // Capture state after save and log activity
        $after_data = fetchRecordData('cash_payments', 'cash_payment_items', 'payment_id', $id);
        $action_type = $data['id'] ? 'UPDATE' : 'INSERT';
        $record_title = "Cash Payment #" . ($data['serial_no'] ?? ($after_data['header']['serial_no'] ?? ''));
        logActivity('Cash Payments', $action_type, $id, $record_title, $before_data, $after_data);

        echo json_encode(['status' => 'success', 'id' => $id]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'get') {
    $id = $_GET['id'] ?? null;
    $sn = $_GET['serial_no'] ?? null;
    
    if ($id) {
        $stmt = $pdo->prepare("SELECT * FROM cash_payments WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM cash_payments WHERE serial_no = ? AND company_id = ?");
        $stmt->execute([$sn, $company_id]);
    }
    
    $payment = $stmt->fetch();
    if ($payment) {
        $stmt = $pdo->prepare("
            SELECT i.*, cl.code as coa_code, cl.name as coa_name 
            FROM cash_payment_items i 
            LEFT JOIN coa_list cl ON i.coa_id = cl.id
            WHERE i.payment_id = ?
        ");
        $stmt->execute([$payment['id']]);
        $payment['items'] = $stmt->fetchAll();
        
        // Fetch account names
        $stmt = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
        $stmt->execute([$payment['cash_account_coa_id']]);
        $payment['cash_account'] = $stmt->fetch();
        
        $stmt->execute([$payment['paid_to_coa_id']]);
        $payment['paid_to'] = $stmt->fetch();
        
        echo json_encode($payment);
    } else {
        echo json_encode(null);
    }
    exit;
}

if ($action === 'toggle_post') {
    $json = file_get_contents('php://input');
    $data = json_decode($json, true) ?: [];
    $id = $data['id'] ?? null;
    $is_posted = isset($data['is_posted']) ? ($data['is_posted'] ? 1 : 0) : 1;

    if ($id) {
        $before_data = fetchRecordData('cash_payments', 'cash_payment_items', 'payment_id', $id);
        $record_title = "Cash Payment #" . ($before_data['header']['serial_no'] ?? '');
        $stmt = $pdo->prepare("UPDATE cash_payments SET is_posted = ? WHERE id = ? AND company_id = ?");
        $stmt->execute([$is_posted, $id, $company_id]);
        $after_data = fetchRecordData('cash_payments', 'cash_payment_items', 'payment_id', $id);
        logActivity('Cash Payments', 'POST_TOGGLE', $id, $record_title . " -> is_posted = " . $is_posted, $before_data, $after_data);
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
    }
    exit;
}

if ($action === 'delete') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        // Capture state before deletion
        $before_data = fetchRecordData('cash_payments', 'cash_payment_items', 'payment_id', $id);
        $record_title = "Cash Payment #" . ($before_data['header']['serial_no'] ?? '');

        $stmt = $pdo->prepare("DELETE FROM cash_payments WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);

        logActivity('Cash Payments', 'DELETE', $id, $record_title, $before_data, null);

        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Missing ID']);
    }
    exit;
}
if ($action === 'get_pending_invoices') {
    $vendor_coa_id = $_GET['vendor_coa_id'] ?? null;
    if (!$vendor_coa_id) { echo json_encode([]); exit; }
    try {
        $stmt = $pdo->prepare("
            SELECT 
                pi.id,
                pi.serial_no AS invoice_no,
                pi.invoice_date,
                pi.net_total AS invoice_amount,
                COALESCE(pi.amount_paid, 0) AS amount_paid
            FROM purchase_invoices pi
            WHERE pi.vendor_coa_id = ?
            AND pi.company_id = ?
            AND pi.is_cancelled = 0
            AND pi.net_total > COALESCE(pi.amount_paid, 0)
            ORDER BY pi.invoice_date ASC
            LIMIT 100
        ");
        $stmt->execute([$vendor_coa_id, $company_id]);
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

if ($action === 'search_payments') {
    try {
        $stmt = $pdo->prepare("
            SELECT 
                p.id,
                p.serial_no,
                p.payment_date,
                p.payment_type,
                c.name AS cash_account_name,
                v.name AS vendor_name,
                p.is_cancelled,
                p.is_posted,
                p.total_amount,
                COALESCE((SELECT SUM(wht_amount) FROM cash_payment_items WHERE payment_id = p.id), 0) AS total_wht,
                COALESCE((SELECT SUM(gst_amount) FROM cash_payment_items WHERE payment_id = p.id), 0) AS total_gst,
                COALESCE((SELECT SUM(advance_adjusted) FROM cash_payment_items WHERE payment_id = p.id), 0) AS total_adv,
                COALESCE((SELECT SUM(discount_received) FROM cash_payment_items WHERE payment_id = p.id), 0) AS total_disc,
                COALESCE((SELECT SUM(paid_amount) FROM cash_payment_items WHERE payment_id = p.id), 0) AS total_paid_amount
            FROM cash_payments p
            LEFT JOIN coa_list c ON p.cash_account_coa_id = c.id
            LEFT JOIN coa_list v ON p.paid_to_coa_id = v.id
            WHERE p.company_id = ?
            ORDER BY p.serial_no ASC
            LIMIT 500
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}


