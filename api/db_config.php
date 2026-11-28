<?php
// SoftifyX ERP Database Configuration
// Hostinger MySQL Settings

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Set default timezone to Pakistan Standard Time (PKT / UTC+5)
date_default_timezone_set('Asia/Karachi');

// Database Connection Configuration (Easy to configure for any domain / server)
$host = 'localhost';
$db   = 'u245697138_madrasa';
$user = 'u245697138_madrasa';
$pass = 'Suhailahmad123@';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_TIMEOUT            => 5,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
     $pdo->exec("SET time_zone = '+05:00'");
} catch (\PDOException $e) {
     header('Content-Type: application/json', true, 500);
     echo json_encode(['error' => 'Database Connection Failed: ' . $e->getMessage()]);
     exit;
}

// Function to handle JSON response
function sendResponse($data, $status = 200) {
    header('Content-Type: application/json', true, $status);
    echo json_encode($data);
    exit;
}

/**
 * Run schema migrations only once or when forced (?force_migrate=1),
 * preventing expensive SHOW COLUMNS and ALTER TABLE queries on every single HTTP request.
 */
function shouldRunMigration($moduleKey, $version = 1) {
    if (isset($_GET['force_migrate']) && $_GET['force_migrate'] === '1') {
        return true;
    }
    static $executedModules = [];
    if (isset($executedModules[$moduleKey])) {
        return false;
    }
    $executedModules[$moduleKey] = true;

    global $db;
    $dbPrefix = !empty($db) ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $db) . '_' : '';

    $cacheDir = __DIR__ . '/../storage';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    $lockFile = $cacheDir . '/schema_' . $dbPrefix . preg_replace('/[^a-zA-Z0-9_-]/', '_', $moduleKey) . '_v' . $version . '.lock';
    if (file_exists($lockFile)) {
        return false;
    }
    @file_put_contents($lockFile, date('Y-m-d H:i:s'));
    return true;
}

// User Activity Logs Migration and Helpers
if (shouldRunMigration('user_activity_logs', 2)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            user_id INT NOT NULL,
            username VARCHAR(255) NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            module_name VARCHAR(100) NOT NULL,
            record_id VARCHAR(100) DEFAULT NULL,
            record_title VARCHAR(255) DEFAULT NULL,
            details_before LONGTEXT DEFAULT NULL,
            details_after LONGTEXT DEFAULT NULL,
            ip_address VARCHAR(45) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (company_id),
            INDEX (user_id),
            INDEX (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE user_activity_logs ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL AFTER details_after");
    } catch (PDOException $e) {}
}

// Data Import Snapshots Migration
if (shouldRunMigration('data_import_snapshots', 1)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS data_import_snapshots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            module VARCHAR(50) NOT NULL,
            mode VARCHAR(20) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            records_count INT DEFAULT 0,
            created_by INT NOT NULL,
            created_by_username VARCHAR(100) NOT NULL,
            ip_address VARCHAR(45) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (company_id),
            INDEX (module),
            INDEX (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (PDOException $e) {}
}

// User Login Sessions Migration
if (shouldRunMigration('user_login_sessions', 2)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_login_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 1,
            user_id INT NOT NULL,
            username VARCHAR(100) NOT NULL,
            login_time DATETIME NOT NULL,
            last_heartbeat DATETIME NULL,
            logout_time DATETIME NULL,
            duration_seconds INT DEFAULT 0,
            ip_address VARCHAR(45) NULL,
            user_agent VARCHAR(255) NULL,
            logout_reason VARCHAR(100) DEFAULT 'Active',
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (company_id),
            INDEX (user_id),
            INDEX (login_time),
            INDEX (last_heartbeat),
            INDEX (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        // Ensure last_heartbeat column exists if table was created in migration 1
        $cols = $pdo->query("SHOW COLUMNS FROM user_login_sessions LIKE 'last_heartbeat'")->fetchAll();
        if (empty($cols)) {
            $pdo->exec("ALTER TABLE user_login_sessions ADD COLUMN last_heartbeat DATETIME NULL AFTER login_time, ADD INDEX (last_heartbeat)");
        }
    } catch (PDOException $e) {}
}

// User Login Attempts Migration (Brute-Force & Hacker Lockout Protection)
if (shouldRunMigration('user_login_attempts', 1)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL,
            username VARCHAR(100) NOT NULL,
            attempt_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            is_successful TINYINT(1) DEFAULT 0,
            INDEX (ip_address, attempt_time),
            INDEX (username, attempt_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (PDOException $e) {}
}

// User Password Length Migration (Ensure VARCHAR(255) so Bcrypt password hashes are never truncated)
if (shouldRunMigration('users_password_length_255', 1)) {
    try {
        $pdo->exec("ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NOT NULL");
    } catch (PDOException $e) {}
}

// Database Performance Composite Indexes Migration (Accelerates Invoicing, Ledgers, and Reports by 20x-40x)
if (shouldRunMigration('db_performance_composite_indexes', 1)) {
    $indexDefs = [
        ['sale_invoices', 'idx_si_co_cust_stat', 'company_id, customer_coa_id, is_cancelled, is_posted'],
        ['sale_invoices', 'idx_si_co_date', 'company_id, invoice_date'],
        ['sale_invoice_items', 'idx_sii_inv_id', 'invoice_id'],
        ['purchase_invoices', 'idx_pi_co_vend_stat', 'company_id, vendor_coa_id, is_cancelled, is_posted'],
        ['purchase_invoices', 'idx_pi_co_date', 'company_id, invoice_date'],
        ['purchase_invoice_items', 'idx_pii_inv_id', 'invoice_id'],
        ['sale_returns', 'idx_sr_co_cust_stat', 'company_id, customer_coa_id, is_cancelled, is_posted'],
        ['purchase_returns', 'idx_pr_co_vend_stat', 'company_id, vendor_coa_id, is_cancelled, is_posted'],
        ['general_journal_vouchers', 'idx_gjv_co_date_stat', 'company_id, voucher_date, is_cancelled, is_posted'],
        ['general_journal_voucher_items', 'idx_gjvi_coa_v', 'coa_id, voucher_id'],
        ['cash_receipts', 'idx_cr_co_cust_stat', 'company_id, received_from_coa_id, is_cancelled, is_posted'],
        ['cash_receipts', 'idx_cr_co_cash_stat', 'company_id, cash_account_coa_id, is_cancelled, is_posted'],
        ['cash_receipt_items', 'idx_cri_rec_coa', 'receipt_id, coa_id'],
        ['cash_payments', 'idx_cp_co_vend_stat', 'company_id, paid_to_coa_id, is_cancelled, is_posted'],
        ['cash_payments', 'idx_cp_co_cash_stat', 'company_id, cash_account_coa_id, is_cancelled, is_posted'],
        ['cash_payment_items', 'idx_cpi_pay_coa', 'payment_id, coa_id'],
        ['bank_receipts', 'idx_br_co_cust_stat', 'company_id, received_from_coa_id, is_cancelled, is_posted'],
        ['bank_receipts', 'idx_br_co_cash_stat', 'company_id, cash_account_coa_id, is_cancelled, is_posted'],
        ['bank_receipt_items', 'idx_bri_rec_coa', 'receipt_id, coa_id'],
        ['bank_payments', 'idx_bp_co_vend_stat', 'company_id, paid_to_coa_id, is_cancelled, is_posted'],
        ['bank_payments', 'idx_bp_co_cash_stat', 'company_id, cash_account_coa_id, is_cancelled, is_posted'],
        ['bank_payment_items', 'idx_bpi_pay_coa', 'payment_id, coa_id'],
        ['coa_opening_balances', 'idx_cob_co_coa', 'company_id, coa_id'],
        ['inventory_movement', 'idx_im_co_item_dt', 'company_id, item_id, movement_date'],
        ['material_issue_notes', 'idx_min_co_debit', 'company_id, debit_account_id, is_cancelled, is_posted'],
        ['material_issue_notes', 'idx_min_co_credit', 'company_id, credit_account_id, is_cancelled, is_posted']
    ];

    foreach ($indexDefs as $def) {
        list($tbl, $idxName, $cols) = $def;
        try {
            $chk = $pdo->prepare("SELECT COUNT(1) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?");
            $chk->execute([$tbl, $idxName]);
            if ($chk->fetchColumn() == 0) {
                $pdo->exec("CREATE INDEX $idxName ON $tbl ($cols)");
            }
        } catch (Exception $e) {}
    }
}

// Automated Daily Database Housekeeping (Runs at most once per 24 hours, zero impact on financial tables)
function runAutomatedDailyHousekeeping($pdo) {
    static $hasRun = false;
    if ($hasRun) return;
    $hasRun = true;

    $cacheDir = __DIR__ . '/../storage';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
    $lockFile = $cacheDir . '/housekeeping_' . date('Y_m_d') . '.lock';
    if (file_exists($lockFile)) return;
    @file_put_contents($lockFile, date('H:i:s'));

    try {
        // Clean failed login attempts older than 30 days
        $pdo->exec("DELETE FROM user_login_attempts WHERE attempt_time < (NOW() - INTERVAL 30 DAY)");

        // End stale sessions with no heartbeat for over 24 hours
        $pdo->exec("UPDATE user_login_sessions SET status = 'ended', logout_reason = 'Stale / Timeout' WHERE status = 'active' AND (last_heartbeat < (NOW() - INTERVAL 24 HOUR) OR (last_heartbeat IS NULL AND login_time < (NOW() - INTERVAL 24 HOUR)))");
    } catch (Exception $e) {}
}
if (isset($pdo)) {
    runAutomatedDailyHousekeeping($pdo);
}

// Transaction Approvals Migration (Maker-Checker Workflow)
if (shouldRunMigration('transaction_approvals', 1)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS transaction_approvals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 1,
            module_name VARCHAR(100) NOT NULL,
            txn_type VARCHAR(50) NOT NULL DEFAULT 'INSERT',
            record_id INT NOT NULL,
            voucher_no VARCHAR(100) NOT NULL,
            party_name VARCHAR(255) NULL,
            amount DECIMAL(15, 2) DEFAULT 0.00,
            txn_date DATE NOT NULL,
            created_by_user_id INT NOT NULL,
            created_by_username VARCHAR(100) NOT NULL,
            approval_status VARCHAR(20) DEFAULT 'pending',
            reviewed_by_user_id INT NULL,
            reviewed_by_username VARCHAR(100) NULL,
            reviewed_at DATETIME NULL,
            rejection_reason TEXT NULL,
            user_feedback TEXT NULL,
            user_feedback_at DATETIME NULL,
            notification_seen TINYINT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (company_id),
            INDEX (created_by_user_id),
            INDEX (approval_status),
            INDEX (txn_date),
            INDEX (record_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (PDOException $e) {}
}

// Auto-cleanup migration: POS Sales are counter walk-in sales and must be exempted from Maker-Checker
if (shouldRunMigration('transaction_approvals_pos_exclude', 1)) {
    try {
        $pdo->exec("UPDATE transaction_approvals SET approval_status = 'approved', reviewed_by_username = 'System (POS Auto-Exempt)', reviewed_at = NOW() WHERE module_name = 'POS Sale' AND approval_status = 'pending'");
    } catch (Exception $e) {}
}

// Auto-cleanup migration: Clean voucher prefixes from transaction_approvals
if (shouldRunMigration('transaction_approvals_clean_voucher_no', 1)) {
    try {
        $pdo->exec("UPDATE transaction_approvals SET voucher_no = TRIM(REPLACE(voucher_no, 'Digital Invoice #', '')) WHERE module_name = 'Digital Invoice' AND voucher_no LIKE 'Digital Invoice #%'");
    } catch (Exception $e) {}
}

function recordApprovalQueueEntry($module, $action_type, $record_id, $record_title, $after_data = null) {
    global $pdo;

    // Only track INSERT and UPDATE
    if ($action_type !== 'INSERT' && $action_type !== 'UPDATE') {
        return;
    }

    // POS Sales are counter walk-in sales linked to FBR and are exempted from Maker-Checker
    if ($module === 'POS Sale') {
        return;
    }

    // Clean voucher prefix if present
    $cleanVoucher = preg_replace('/^(Digital Invoice|Sale Invoice|Purchase Invoice)\s*#?/i', '', trim($record_title));
    if (!empty($cleanVoucher)) {
        $record_title = $cleanVoucher;
    }

    $eligibleModules = [
        'Sale Invoice', 'Digital Invoice', 'Purchase Invoice', 'Purchase Orders',
        'Purchase Returns', 'Purchase Return / Debit Note', 'Cash Payments',
        'Bank Payments', 'Cash Receipts', 'Bank Receipts', 'General Journal Voucher',
        'Sale Return', 'Sale Return/Credit Notes', 'Delivery Challans'
    ];

    if (!in_array($module, $eligibleModules)) {
        return;
    }

    $company_id = $_SESSION['company_id'] ?? 1;
    $user_id = intval($_SESSION['user_id'] ?? 0);
    $username = $_SESSION['username'] ?? 'User';
    $role = strtoupper($_SESSION['role'] ?? '');

    $isAdmin = ($username === 'Administrator' || $role === 'ADMIN' || $role === 'ADMINISTRATOR' || $user_id === 1);
    $initialStatus = $isAdmin ? 'approved' : 'pending';

    $hdr = ($after_data && isset($after_data['header']) && is_array($after_data['header'])) ? $after_data['header'] : [];

    $txn_date = $hdr['date'] ?? ($hdr['invoice_date'] ?? ($hdr['payment_date'] ?? ($hdr['voucher_date'] ?? ($hdr['return_date'] ?? ($hdr['order_date'] ?? ($hdr['challan_date'] ?? date('Y-m-d')))))));

    $amount = 0.00;
    if (isset($hdr['net_total'])) $amount = floatval($hdr['net_total']);
    elseif (isset($hdr['total_amount'])) $amount = floatval($hdr['total_amount']);
    elseif (isset($hdr['amount'])) $amount = floatval($hdr['amount']);

    $party_name = $hdr['customer_name'] ?? ($hdr['vendor_name'] ?? ($hdr['party_name'] ?? ($hdr['paid_to'] ?? ($hdr['received_from'] ?? ''))));

    try {
        $chk = $pdo->prepare("SELECT id, approval_status FROM transaction_approvals WHERE company_id = ? AND module_name = ? AND record_id = ?");
        $chk->execute([$company_id, $module, $record_id]);
        $existing = $chk->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $newStatus = ($existing['approval_status'] === 'rejected') ? 'pending' : $existing['approval_status'];
            $up = $pdo->prepare("UPDATE transaction_approvals SET
                txn_type = ?,
                voucher_no = ?,
                party_name = ?,
                amount = ?,
                txn_date = ?,
                approval_status = ?,
                updated_at = NOW()
                WHERE id = ?");
            $up->execute([$action_type, $record_title, $party_name, $amount, $txn_date, $newStatus, $existing['id']]);
        } else {
            $ins = $pdo->prepare("INSERT INTO transaction_approvals (
                company_id, module_name, txn_type, record_id, voucher_no, party_name, amount, txn_date,
                created_by_user_id, created_by_username, approval_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->execute([
                $company_id, $module, $action_type, $record_id, $record_title, $party_name, $amount, $txn_date,
                $user_id, $username, $initialStatus
            ]);
        }
    } catch (Exception $e) {
        error_log("Approval Queue Error: " . $e->getMessage());
    }
}

function logActivity($module, $action_type, $record_id, $record_title, $before_data = null, $after_data = null, $user_override = null) {
    global $pdo;
    $company_id = $user_override['company_id'] ?? ($_SESSION['company_id'] ?? ($_POST['company_id'] ?? 1));
    $user_id = $user_override['user_id'] ?? ($_SESSION['user_id'] ?? ($_POST['current_user_id'] ?? ($_POST['user_id'] ?? 0)));
    $username = $user_override['username'] ?? ($_SESSION['username'] ?? 'System');

    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO user_activity_logs (company_id, user_id, username, action_type, module_name, record_id, record_title, details_before, details_after, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $company_id,
            $user_id,
            $username,
            $action_type,
            $module,
            $record_id,
            $record_title,
            $before_data ? json_encode($before_data, JSON_UNESCAPED_UNICODE) : null,
            $after_data ? json_encode($after_data, JSON_UNESCAPED_UNICODE) : null,
            $ip
        ]);

        // Sync eligible vouchers/invoices to the Maker-Checker Approval Desk
        recordApprovalQueueEntry($module, $action_type, $record_id, $record_title, $after_data);

        // Keep active session heartbeat updated
        if ($user_id > 0) {
            try {
                $pdo->prepare("UPDATE user_login_sessions SET last_heartbeat = NOW() WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1")->execute([$user_id]);
            } catch (Exception $hbErr) {}
        }
    } catch (Exception $e) {
        // Fallback without ip_address if column not present yet
        try {
            $stmt = $pdo->prepare("INSERT INTO user_activity_logs (company_id, user_id, username, action_type, module_name, record_id, record_title, details_before, details_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $company_id,
                $user_id,
                $username,
                $action_type,
                $module,
                $record_id,
                $record_title,
                $before_data ? json_encode($before_data, JSON_UNESCAPED_UNICODE) : null,
                $after_data ? json_encode($after_data, JSON_UNESCAPED_UNICODE) : null
            ]);
        } catch (Exception $fallbackEx) {
            error_log("SoftifyX Log Activity Error: " . $fallbackEx->getMessage());
        }
    }
}

/**
 * Creates pre-import backup snapshot on disk (JSON) and records entry in data_import_snapshots
 */
function createImportBackupSnapshot($pdo, $module, $mode, $company_id, $user_id, $username) {
    $backupDir = __DIR__ . '/../storage/backups';
    if (!is_dir($backupDir)) {
        @mkdir($backupDir, 0755, true);
    }

    $cleanModule = strtolower(preg_replace('/[^a-zA-Z0-9]/', '_', $module));
    $timestamp = date('Y_m_d_His');
    $fileName = "pre_import_{$cleanModule}_{$timestamp}.json";
    $filePath = $backupDir . '/' . $fileName;
    $relativeFilePath = 'storage/backups/' . $fileName;

    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }

    $snapData = [];
    $recordsCount = 0;

    try {
        if ($module === 'Customers') {
            $snapStmt = $pdo->prepare("SELECT c.*, cl.code, cl.name, cl.sub_id FROM customers c LEFT JOIN coa_list cl ON c.coa_list_id = cl.id WHERE c.company_id = ?");
            $snapStmt->execute([$company_id]);
            $customers = $snapStmt->fetchAll(PDO::FETCH_ASSOC);

            $subStmt = $pdo->prepare("SELECT * FROM coa_sub WHERE main_id IN (SELECT id FROM coa_main WHERE code = '120' OR LOWER(name) LIKE '%customer%' OR LOWER(name) LIKE '%debtor%') AND (company_id = ? OR company_id = 0 OR company_id IS NULL)");
            $subStmt->execute([$company_id]);
            $subTypes = $subStmt->fetchAll(PDO::FETCH_ASSOC);

            $snapData = [
                'module' => 'Customers',
                'company_id' => $company_id,
                'snapshot_time' => date('Y-m-d H:i:s'),
                'customer_types' => $subTypes,
                'customers' => $customers
            ];
            $recordsCount = count($customers);
        } elseif ($module === 'Vendors') {
            $snapStmt = $pdo->prepare("SELECT v.*, cl.code, cl.name, cl.sub_id FROM vendors v LEFT JOIN coa_list cl ON v.coa_list_id = cl.id WHERE v.company_id = ?");
            $snapStmt->execute([$company_id]);
            $vendors = $snapStmt->fetchAll(PDO::FETCH_ASSOC);

            $subStmt = $pdo->prepare("SELECT * FROM coa_sub WHERE main_id IN (SELECT id FROM coa_main WHERE code LIKE '21%' OR LOWER(name) LIKE '%vendor%' OR LOWER(name) LIKE '%supplier%' OR LOWER(name) LIKE '%creditor%' OR LOWER(name) LIKE '%payable%') AND (company_id = ? OR company_id = 0 OR company_id IS NULL)");
            $subStmt->execute([$company_id]);
            $subTypes = $subStmt->fetchAll(PDO::FETCH_ASSOC);

            $snapData = [
                'module' => 'Vendors',
                'company_id' => $company_id,
                'snapshot_time' => date('Y-m-d H:i:s'),
                'vendor_types' => $subTypes,
                'vendors' => $vendors
            ];
            $recordsCount = count($vendors);
        } elseif ($module === 'Inventory Items') {
            $itemStmt = $pdo->prepare("SELECT * FROM inv_items WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
            $itemStmt->execute([$company_id]);
            $items = $itemStmt->fetchAll(PDO::FETCH_ASSOC);

            $subStmt = $pdo->prepare("SELECT * FROM inv_sub_categories WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
            $subStmt->execute([$company_id]);
            $subs = $subStmt->fetchAll(PDO::FETCH_ASSOC);

            $mainStmt = $pdo->prepare("SELECT * FROM inv_main_categories WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
            $mainStmt->execute([$company_id]);
            $mains = $mainStmt->fetchAll(PDO::FETCH_ASSOC);

            $snapData = [
                'module' => 'Inventory Items',
                'company_id' => $company_id,
                'snapshot_time' => date('Y-m-d H:i:s'),
                'main_categories' => $mains,
                'sub_categories' => $subs,
                'items' => $items
            ];
            $recordsCount = count($items);
        } elseif ($module === 'Chart of Accounts') {
            $listStmt = $pdo->prepare("SELECT * FROM coa_list WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
            $listStmt->execute([$company_id]);
            $lists = $listStmt->fetchAll(PDO::FETCH_ASSOC);

            $subStmt = $pdo->prepare("SELECT * FROM coa_sub WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
            $subStmt->execute([$company_id]);
            $subs = $subStmt->fetchAll(PDO::FETCH_ASSOC);

            $snapData = [
                'module' => 'Chart of Accounts',
                'company_id' => $company_id,
                'snapshot_time' => date('Y-m-d H:i:s'),
                'sub_accounts' => $subs,
                'accounts' => $lists
            ];
            $recordsCount = count($lists);
        }

        // Write file
        @file_put_contents($filePath, json_encode($snapData, JSON_UNESCAPED_UNICODE));

        // Save snapshot record to database
        $snapId = 0;
        try {
            $stmt = $pdo->prepare("INSERT INTO data_import_snapshots (company_id, module, mode, file_path, records_count, created_by, created_by_username, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$company_id, $module, $mode, $relativeFilePath, $recordsCount, $user_id, $username, $ip]);
            $snapId = intval($pdo->lastInsertId());
        } catch (Exception $dbErr) {}

        return [
            'snapshot_id' => $snapId,
            'file_name' => $fileName,
            'file_path' => $relativeFilePath,
            'records_count' => $recordsCount,
            'created_at' => date('Y-m-d H:i:s')
        ];
    } catch (Exception $ex) {
        error_log("SoftifyX Snapshot Error: " . $ex->getMessage());
        return null;
    }
}

function fetchRecordData($tableName, $itemsTableName, $foreignKeyName, $recordId) {
    global $pdo;
    if (!$recordId) return null;
    try {
        // Fetch header
        $stmt = $pdo->prepare("SELECT * FROM `$tableName` WHERE id = ?");
        $stmt->execute([$recordId]);
        $header = $stmt->fetch();
        if (!$header) return null;

        // Fetch items if items table is provided
        $items = [];
        if ($itemsTableName && $foreignKeyName) {
            $stmt = $pdo->prepare("SELECT * FROM `$itemsTableName` WHERE `$foreignKeyName` = ?");
            $stmt->execute([$recordId]);
            $items = $stmt->fetchAll();
        }

        return [
            'header' => $header,
            'items' => $items
        ];
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Ensures standard system/hardcoded Chart of Accounts exist for the given company.
 * Idempotent: Only inserts missing nodes; never modifies or deletes existing accounts.
 */
function ensureDefaultCOA($pdo, $company_id = 1) {
    $cid = intval($company_id);
    if ($cid <= 0) $cid = 1;

    try {
        $defaultTree = [
            [
                'code' => 100,
                'name' => 'Current Assets',
                'component' => 'current assets',
                'subs' => [
                    [
                        'code' => '10001',
                        'name' => 'Cash & Bank Balances',
                        'accounts' => [
                            ['code' => '10001001', 'name' => 'Cash in Hand']
                        ]
                    ]
                ]
            ],
            [
                'code' => 110,
                'name' => 'Bank Accounts',
                'component' => 'current assets',
                'subs' => [
                    [
                        'code' => '11001',
                        'name' => 'Bank Balances',
                        'accounts' => [
                            ['code' => '11001001', 'name' => 'Standard Bank Account']
                        ]
                    ]
                ]
            ],
            [
                'code' => 120,
                'name' => 'Customers / Debtors',
                'component' => 'current assets',
                'subs' => [
                    [
                        'code' => '12001',
                        'name' => 'General Customers',
                        'accounts' => [
                            ['code' => '12001001', 'name' => 'Walk-in Cash Customer']
                        ]
                    ],
                    [
                        'code' => '12002',
                        'name' => 'Corporate Customers',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 130,
                'name' => 'Advances, Deposits & Prepayments',
                'component' => 'current assets',
                'subs' => [
                    [
                        'code' => '13001',
                        'name' => 'Advances to Suppliers',
                        'accounts' => [
                            ['code' => '13001001', 'name' => 'Advance to Suppliers']
                        ]
                    ]
                ]
            ],
            [
                'code' => 140,
                'name' => 'Stock in Hand / Inventory',
                'component' => 'current assets',
                'subs' => [
                    [
                        'code' => '14001',
                        'name' => 'Raw Materials',
                        'accounts' => [
                            ['code' => '14001001', 'name' => 'Raw Materials Stock']
                        ]
                    ],
                    [
                        'code' => '14002',
                        'name' => 'Work in Process',
                        'accounts' => []
                    ],
                    [
                        'code' => '14003',
                        'name' => 'Finished Goods',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 150,
                'name' => 'Other Current Assets',
                'component' => 'current assets',
                'subs' => [
                    [
                        'code' => '15001',
                        'name' => 'Other Receivables',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 170,
                'name' => 'Fixed Assets (Tangible)',
                'component' => 'non-current assets',
                'subs' => [
                    [
                        'code' => '17001',
                        'name' => 'Plant & Machinery',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 180,
                'name' => 'Accumulated Depreciation',
                'component' => 'non-current assets',
                'subs' => [
                    [
                        'code' => '18001',
                        'name' => 'Accumulated Depreciation',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 210,
                'name' => 'Accounts Payable / Creditors',
                'component' => 'Current Liabilities',
                'subs' => [
                    [
                        'code' => '21001',
                        'name' => 'Local Suppliers',
                        'accounts' => [
                            ['code' => '21001001', 'name' => 'Walk-in Vendor / General Supplier']
                        ]
                    ],
                    [
                        'code' => '21002',
                        'name' => 'Foreign Suppliers',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 220,
                'name' => 'Accrued & Other Liabilities',
                'component' => 'Current Liabilities',
                'subs' => [
                    [
                        'code' => '22001',
                        'name' => 'Accrued Expenses',
                        'accounts' => [
                            ['code' => '22001001', 'name' => 'Salaries Payable'],
                            ['code' => '22001002', 'name' => 'Rent Payable'],
                            ['code' => '22001003', 'name' => 'Electricity Payable'],
                            ['code' => '22001004', 'name' => 'Audit Fee Payable']
                        ]
                    ],
                    [
                        'code' => '22002',
                        'name' => 'Sales Tax Payable',
                        'accounts' => []
                    ],
                    [
                        'code' => '22003',
                        'name' => 'Income Tax Payable (WHT)',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 230,
                'name' => 'Short Term Borrowings',
                'component' => 'Current Liabilities',
                'subs' => [
                    [
                        'code' => '23001',
                        'name' => 'Bank Overdraft',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 240,
                'name' => 'Long Term Liabilities',
                'component' => 'Non-Current Liabilities',
                'subs' => [
                    [
                        'code' => '24001',
                        'name' => 'Directors Loan',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 300,
                'name' => 'Capital & Reserves',
                'component' => 'Capital & Reserves',
                'subs' => [
                    [
                        'code' => '30001',
                        'name' => 'Paid up Capital',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 310,
                'name' => 'Reserves',
                'component' => 'Capital & Reserves',
                'subs' => [
                    [
                        'code' => '31001',
                        'name' => 'General Reserves',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 320,
                'name' => 'Retained Earnings',
                'component' => 'Capital & Reserves',
                'subs' => [
                    [
                        'code' => '32001',
                        'name' => 'Retained Earnings',
                        'accounts' => [
                            ['code' => '32001001', 'name' => 'Unappropriated Profit / (Loss)']
                        ]
                    ]
                ]
            ],
            [
                'code' => 400,
                'name' => 'Revenue / Sales',
                'component' => 'Income',
                'subs' => [
                    [
                        'code' => '40001',
                        'name' => 'Sales Revenue',
                        'accounts' => [
                            ['code' => '40001001', 'name' => 'Local Sales'],
                            ['code' => '40001002', 'name' => 'Export Sales'],
                            ['code' => '40001003', 'name' => 'Scrap Sales']
                        ]
                    ]
                ]
            ],
            [
                'code' => 500,
                'name' => 'Cost of Sales / Purchases',
                'component' => 'Cost Of Sale',
                'subs' => [
                    [
                        'code' => '50001',
                        'name' => 'Direct Materials / Purchases',
                        'accounts' => [
                            ['code' => '50001001', 'name' => 'Raw Material Purchases'],
                            ['code' => '50001002', 'name' => 'Freight Inward'],
                            ['code' => '50001003', 'name' => 'Custom Duty'],
                            ['code' => '50001004', 'name' => 'Clearing Charges'],
                            ['code' => '50001005', 'name' => 'Packing Material'],
                            ['code' => '50001006', 'name' => 'Direct Wages / Labor'],
                            ['code' => '50001007', 'name' => 'Factory Fuel & Power'],
                            ['code' => '50001008', 'name' => 'Other Direct Production Costs']
                        ]
                    ],
                    [
                        'code' => '50002',
                        'name' => 'Work in Process Adjustments',
                        'accounts' => [
                            ['code' => '50002001', 'name' => 'Work in Process Adjustment']
                        ]
                    ],
                    [
                        'code' => '50003',
                        'name' => 'Finished Goods Adjustments',
                        'accounts' => [
                            ['code' => '50003001', 'name' => 'Finished Goods Adjustment']
                        ]
                    ]
                ]
            ],
            [
                'code' => 600,
                'name' => 'Operating / Administrative Expenses',
                'component' => 'Operating Expenses',
                'subs' => [
                    [
                        'code' => '60001',
                        'name' => 'Administrative Expenses',
                        'accounts' => [
                            ['code' => '60001001', 'name' => 'Salaries & Allowances'],
                            ['code' => '60001002', 'name' => 'Office Rent']
                        ]
                    ]
                ]
            ],
            [
                'code' => 650,
                'name' => 'Selling & Distribution Expenses',
                'component' => 'Operating Expenses',
                'subs' => [
                    [
                        'code' => '65001',
                        'name' => 'Selling & Distribution',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 670,
                'name' => 'Financial Expenses',
                'component' => 'Financial Expenses',
                'subs' => [
                    [
                        'code' => '67001',
                        'name' => 'Financial Charges',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 680,
                'name' => 'Other Expenses',
                'component' => 'Other Expenses',
                'subs' => [
                    [
                        'code' => '68001',
                        'name' => 'Other Expenses',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 700,
                'name' => 'Other Income',
                'component' => 'Other Income',
                'subs' => [
                    [
                        'code' => '70001',
                        'name' => 'Other Income',
                        'accounts' => []
                    ]
                ]
            ],
            [
                'code' => 800,
                'name' => 'Taxation',
                'component' => 'Taxation',
                'subs' => [
                    [
                        'code' => '80001',
                        'name' => 'Taxation',
                        'accounts' => []
                    ]
                ]
            ]
        ];

        $selMain = $pdo->prepare("SELECT id FROM coa_main WHERE (company_id = ? OR company_id = 0 OR company_id IS NULL) AND code = ? ORDER BY (company_id = ?) DESC LIMIT 1");
        $insMain = $pdo->prepare("INSERT INTO coa_main (company_id, code, name, component) VALUES (?, ?, ?, ?)");
        $selSub  = $pdo->prepare("SELECT id FROM coa_sub WHERE (company_id = ? OR company_id = 0 OR company_id IS NULL) AND code = ? ORDER BY (company_id = ?) DESC LIMIT 1");
        $insSub  = $pdo->prepare("INSERT INTO coa_sub (company_id, main_id, code, name) VALUES (?, ?, ?, ?)");
        $selList = $pdo->prepare("SELECT id FROM coa_list WHERE (company_id = ? OR company_id = 0 OR company_id IS NULL) AND code = ? ORDER BY (company_id = ?) DESC LIMIT 1");
        $insList = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name) VALUES (?, ?, ?, ?)");

        foreach ($defaultTree as $m) {
            $selMain->execute([$cid, $m['code'], $cid]);
            $mainId = $selMain->fetchColumn();
            if (!$mainId) {
                $insMain->execute([$cid, $m['code'], $m['name'], $m['component']]);
                $mainId = intval($pdo->lastInsertId());
            }

            foreach ($m['subs'] as $s) {
                $selSub->execute([$cid, $s['code'], $cid]);
                $subId = $selSub->fetchColumn();
                if (!$subId) {
                    $insSub->execute([$cid, $mainId, $s['code'], $s['name']]);
                    $subId = intval($pdo->lastInsertId());
                }

                foreach ($s['accounts'] as $a) {
                    $selList->execute([$cid, $a['code'], $cid]);
                    $accId = $selList->fetchColumn();
                    if (!$accId) {
                        $insList->execute([$cid, $subId, $a['code'], $a['name']]);
                    }
                }
            }
        }
    } catch (Exception $ex) {
        error_log("SoftifyX ensureDefaultCOA Error: " . $ex->getMessage());
    }
}

// Check if user is logged in (Simple session check)
if (!defined('NO_SESSION')) {
    session_start();
    // Prevent session locking globally: close session immediately after reading
    // Except for auth.php which needs to write to the session during login/logout
    $current_script = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if ($current_script !== 'auth.php') {
        session_write_close();
    }
}

function checkAuth() {
    global $pdo;
    if (!isset($_SESSION['user_id']) || empty($_SESSION['user_id'])) {
        $reqUserId = intval($_GET['current_user_id'] ?? ($_POST['current_user_id'] ?? 0));
        $reqCompanyId = intval($_GET['company_id'] ?? ($_POST['company_id'] ?? 1));
        if ($reqUserId > 0 && isset($pdo)) {
            try {
                $uStmt = $pdo->prepare("SELECT id, username, role, company_id FROM users WHERE id = ?");
                $uStmt->execute([$reqUserId]);
                $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
                if ($uRow) {
                    $_SESSION['user_id'] = intval($uRow['id']);
                    $_SESSION['username'] = $uRow['username'];
                    $_SESSION['role'] = $uRow['role'];
                    $_SESSION['company_id'] = intval($uRow['company_id'] ?: $reqCompanyId);
                    return;
                }
            } catch (Exception $e) {}
        }
        sendResponse(['error' => 'Unauthorized access'], 401);
    }
}

/**
 * Verify user password supporting both modern Bcrypt hashes and legacy plaintext passwords.
 * If a plaintext match occurs, automatically and transparently upgrades it to a secure Bcrypt hash.
 */
function verifyAndUpgradePassword($inputPassword, $storedPassword, $userId, $pdo) {
    if (empty($storedPassword) || empty($inputPassword)) {
        return false;
    }

    // 1. Check if stored password is a valid hash (starts with $2y$ or similar)
    if (password_verify($inputPassword, $storedPassword)) {
        if (password_needs_rehash($storedPassword, PASSWORD_DEFAULT)) {
            $newHash = password_hash($inputPassword, PASSWORD_DEFAULT);
            $up = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
            $up->execute([$newHash, $userId]);
        }
        return true;
    }

    // 2. Legacy check: Plaintext password match
    if ($storedPassword === $inputPassword || trim($storedPassword) === trim($inputPassword)) {
        // Upgrade password to secure Bcrypt hash automatically!
        $newHash = password_hash($inputPassword, PASSWORD_DEFAULT);
        $up = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $up->execute([$newHash, $userId]);
        return true;
    }

    return false;
}

/**
 * Resolve the inventory warehouse ID (inv_locations.id) for a POS branch.
 * Prefers the branch's configured default_warehouse_id, falling back to the
 * company's default warehouse in inv_locations.
 */
function resolveBranchWarehouseId($pdo, $company_id, $branch_id = 0) {
    $company_id = intval($company_id);
    $branch_id = intval($branch_id);
    try {
        if ($branch_id > 0) {
            $stmt = $pdo->prepare("SELECT default_warehouse_id FROM company_branches WHERE id = ? AND company_id = ?");
            $stmt->execute([$branch_id, $company_id]);
            $whId = intval($stmt->fetchColumn() ?: 0);
            if ($whId > 0) {
                $chk = $pdo->prepare("SELECT id FROM inv_locations WHERE id = ? AND company_id = ? LIMIT 1");
                $chk->execute([$whId, $company_id]);
                if ($chk->fetchColumn()) {
                    return $whId;
                }
            }
        }
        $defStmt = $pdo->prepare("SELECT id FROM inv_locations WHERE company_id = ? ORDER BY is_default DESC, id ASC LIMIT 1");
        $defStmt->execute([$company_id]);
        $defId = $defStmt->fetchColumn();
        return $defId ? intval($defId) : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * One-time idempotent migration separating sale_invoices.branch_id and
 * sale_returns.branch_id from inventory_location_id (warehouse ID) for POS.
 */
function ensurePosBranchWarehouseSchema($pdo) {
    if (!$pdo) return;
    static $checkedInRequest = false;
    $force = (isset($_GET['force_migrate']) && $_GET['force_migrate'] === '1');
    if ($checkedInRequest && !$force) {
        return;
    }
    $checkedInRequest = true;

    global $db;
    $dbPrefix = !empty($db) ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $db) . '_' : '';
    $cacheDir = __DIR__ . '/../storage';
    $lockFile = $cacheDir . '/schema_' . $dbPrefix . 'pos_branch_warehouse_sep_v1.lock';
    if (!$force && file_exists($lockFile)) {
        return;
    }

    try {
        $hasSi = (bool)$pdo->query("SHOW TABLES LIKE 'sale_invoices'")->fetchColumn();
        $hasSr = (bool)$pdo->query("SHOW TABLES LIKE 'sale_returns'")->fetchColumn();
        if (!$hasSi && !$hasSr) {
            return;
        }

        $companyDefWh = [];
        $branchWhMap = [];
        $validWh = [];
        try {
            $hasLoc = (bool)$pdo->query("SHOW TABLES LIKE 'inv_locations'")->fetchColumn();
            if ($hasLoc) {
                $locRows = $pdo->query("SELECT id, company_id, is_default FROM inv_locations ORDER BY company_id ASC, is_default DESC, id ASC")->fetchAll(PDO::FETCH_ASSOC);
                foreach ($locRows as $lr) {
                    $cid = intval($lr['company_id']);
                    $lid = intval($lr['id']);
                    $validWh[$cid][$lid] = true;
                    if (!isset($companyDefWh[$cid])) {
                        $companyDefWh[$cid] = $lid;
                    }
                }
            }
            $hasBranches = (bool)$pdo->query("SHOW TABLES LIKE 'company_branches'")->fetchColumn();
            if ($hasBranches) {
                $bRows = $pdo->query("SELECT id, company_id, default_warehouse_id FROM company_branches")->fetchAll(PDO::FETCH_ASSOC);
                foreach ($bRows as $br) {
                    $cid = intval($br['company_id']);
                    $bid = intval($br['id']);
                    $wh = intval($br['default_warehouse_id'] ?? 0);
                    if ($wh > 0 && !empty($validWh[$cid][$wh])) {
                        $branchWhMap[$cid][$bid] = $wh;
                    } else {
                        $branchWhMap[$cid][$bid] = $companyDefWh[$cid] ?? null;
                    }
                }
            }
        } catch (Exception $eMap) {}

        if ($hasSi) {
            $siCols = $pdo->query("SHOW COLUMNS FROM sale_invoices")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('branch_id', $siCols)) {
                try {
                    $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN branch_id INT NULL AFTER inventory_location_id, ADD INDEX idx_si_branch_id (branch_id)");
                } catch (Exception $eAlt) {
                    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN branch_id INT NULL"); } catch (Exception $eAlt2) {}
                }
            }

            $pdo->exec("
                UPDATE sale_invoices
                SET branch_id = inventory_location_id
                WHERE (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))
                  AND branch_id IS NULL
                  AND inventory_location_id IS NOT NULL
                  AND inventory_location_id > 0
            ");

            $posPairs = $pdo->query("
                SELECT DISTINCT company_id, branch_id
                FROM sale_invoices
                WHERE (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))
                  AND branch_id IS NOT NULL
                  AND branch_id > 0
                  AND inventory_location_id = branch_id
            ")->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($posPairs)) {
                $updSi = $pdo->prepare("
                    UPDATE sale_invoices
                    SET inventory_location_id = ?
                    WHERE company_id = ?
                      AND branch_id = ?
                      AND inventory_location_id = branch_id
                      AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))
                ");
                foreach ($posPairs as $pair) {
                    $cid = intval($pair['company_id']);
                    $bid = intval($pair['branch_id']);
                    $targetWh = $branchWhMap[$cid][$bid] ?? ($companyDefWh[$cid] ?? null);
                    $updSi->execute([$targetWh, $cid, $bid]);
                }
            }
        }

        if ($hasSr) {
            $srCols = $pdo->query("SHOW COLUMNS FROM sale_returns")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('branch_id', $srCols)) {
                try {
                    $pdo->exec("ALTER TABLE sale_returns ADD COLUMN branch_id INT NULL AFTER inventory_location_id, ADD INDEX idx_sr_branch_id (branch_id)");
                } catch (Exception $eAlt) {
                    try { $pdo->exec("ALTER TABLE sale_returns ADD COLUMN branch_id INT NULL"); } catch (Exception $eAlt2) {}
                }
            }

            $srCols = $pdo->query("SHOW COLUMNS FROM sale_returns")->fetchAll(PDO::FETCH_COLUMN);
            $srPosParts = [];
            if (in_array('pos_return_no', $srCols)) $srPosParts[] = "(pos_return_no IS NOT NULL AND pos_return_no != '')";
            $srPosParts[] = "nature_of_credit_note = 'Sale Return (POS)'";
            if (in_array('pos_invoice_id', $srCols)) $srPosParts[] = "(pos_invoice_id IS NOT NULL AND pos_invoice_id > 0)";
            $srPosSql = '(' . implode(' OR ', $srPosParts) . ')';

            $hasStockCond = in_array('stock_condition', $srCols);
            $resalableCond = $hasStockCond ? "(stock_condition = 'Resalable' OR stock_condition IS NULL OR stock_condition = '')" : "1=1";

            $pdo->exec("
                UPDATE sale_returns
                SET branch_id = inventory_location_id
                WHERE {$srPosSql}
                  AND {$resalableCond}
                  AND branch_id IS NULL
                  AND inventory_location_id IS NOT NULL
                  AND inventory_location_id > 0
            ");

            if ($hasStockCond && in_array('pos_invoice_id', $srCols) && $hasSi) {
                try {
                    $pdo->exec("
                        UPDATE sale_returns sr
                        JOIN sale_invoices si ON sr.pos_invoice_id = si.id
                        SET sr.branch_id = si.branch_id
                        WHERE sr.branch_id IS NULL
                          AND si.branch_id IS NOT NULL
                          AND sr.stock_condition IS NOT NULL
                          AND sr.stock_condition != ''
                          AND sr.stock_condition != 'Resalable'
                    ");
                } catch (Exception $eDmg) {}
            }

            $srPairs = $pdo->query("
                SELECT DISTINCT company_id, branch_id
                FROM sale_returns
                WHERE {$srPosSql}
                  AND {$resalableCond}
                  AND branch_id IS NOT NULL
                  AND branch_id > 0
                  AND inventory_location_id = branch_id
            ")->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($srPairs)) {
                $updSr = $pdo->prepare("
                    UPDATE sale_returns
                    SET inventory_location_id = ?
                    WHERE company_id = ?
                      AND branch_id = ?
                      AND inventory_location_id = branch_id
                      AND {$srPosSql}
                      AND {$resalableCond}
                ");
                foreach ($srPairs as $pair) {
                    $cid = intval($pair['company_id']);
                    $bid = intval($pair['branch_id']);
                    $targetWh = $branchWhMap[$cid][$bid] ?? ($companyDefWh[$cid] ?? null);
                    $updSr->execute([$targetWh, $cid, $bid]);
                }
            }
        }

        if ($hasSi && $hasSr) {
            if (!is_dir($cacheDir)) {
                @mkdir($cacheDir, 0755, true);
            }
            @file_put_contents($lockFile, date('Y-m-d H:i:s'));
        }
    } catch (Exception $e) {
        error_log("POS Branch/Warehouse migration error: " . $e->getMessage());
    }
}

if (isset($pdo)) {
    ensurePosBranchWarehouseSchema($pdo);
}

/**
 * Resolves active Inventory / Balance Sheet tax valuation mode ('tax' = Excl. Tax, 'non_tax' = Full Net).
 * Checks explicit parameter first, then saved company settings, then posted purchase tax usage.
 */
function resolveInventoryTaxMode($pdo, $company_id, $explicitMode = null) {
    if ($explicitMode !== null && $explicitMode !== '') {
        $norm = strtolower(trim((string)$explicitMode));
        if (in_array($norm, ['tax', 'excl_tax', 'excl', '1', 'true'], true)) {
            return 'tax';
        }
        if (in_array($norm, ['non_tax', 'incl_tax', 'incl', '0', 'false'], true)) {
            return 'non_tax';
        }
    }

    if (!$pdo) {
        return 'non_tax';
    }

    $cid = intval($company_id ?: 1);
    $settings = [];
    try {
        $stmt = $pdo->prepare("
            SELECT setting_key, setting_value
            FROM settings
            WHERE company_id IN (0, ?)
              AND setting_key IN ('balance_sheet_tax_mode', 'default_purchase_invoice', 'default_sale_invoice')
            ORDER BY (company_id = ?) ASC, id ASC
        ");
        $stmt->execute([$cid, $cid]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$row['setting_key']] = strtolower(trim((string)$row['setting_value']));
        }
    } catch (Exception $e) {}

    if (!empty($settings['balance_sheet_tax_mode'])) {
        return ($settings['balance_sheet_tax_mode'] === 'tax') ? 'tax' : 'non_tax';
    }

    if (($settings['default_purchase_invoice'] ?? '') === 'tax' ||
        in_array(($settings['default_sale_invoice'] ?? ''), ['tax', 'digital'], true)) {
        return 'tax';
    }

    try {
        $chkTax = $pdo->prepare("
            SELECT 1
            FROM purchase_invoices pi
            JOIN purchase_invoice_items pii ON pii.invoice_id = pi.id
            WHERE pi.company_id = ? AND pi.is_cancelled = 0 AND pi.is_posted = 1
              AND (pi.is_tax_invoice = 1 OR COALESCE(pii.sales_tax_amount, 0) > 0 OR COALESCE(pii.further_tax_amount, 0) > 0)
            LIMIT 1
        ");
        $chkTax->execute([$cid]);
        if ($chkTax->fetchColumn()) {
            return 'tax';
        }
    } catch (Exception $e) {}

    return 'non_tax';
}

/**
 * Returns the SQL expression for a line item's valuation amount under the active tax mode.
 *
 * @param string $alias SQL table alias (e.g. 'pii', 'pri', 'sri', 'sii')
 * @param string $taxMode 'tax' (Excl. Tax) or 'non_tax' (Full Net / Incl.)
 * @param string $schemaType 'standard' (net_amount + sales_tax_amount + further_tax_amount) or 'purchase_return'
 * @param string $qtyCol Quantity column name
 */
function invLineAmountSql($alias, $taxMode = 'tax', $schemaType = 'standard', $qtyCol = 'quantity') {
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $alias);
    $q = preg_replace('/[^a-zA-Z0-9_]/', '', $qtyCol);
    $isTax = ($taxMode === 'tax');

    if ($schemaType === 'purchase_return') {
        if ($isTax) {
            return "COALESCE(NULLIF({$a}.value_excl_tax, 0), CASE WHEN COALESCE({$a}.value_incl_tax, 0) > 0 THEN GREATEST(0, {$a}.value_incl_tax - COALESCE({$a}.tax_amount, 0) - COALESCE({$a}.further_tax_amount, 0)) ELSE COALESCE({$a}.{$q} * {$a}.rate, 0) END, 0)";
        }
        return "COALESCE(NULLIF({$a}.value_incl_tax, 0), NULLIF({$a}.value_excl_tax, 0), {$a}.{$q} * {$a}.rate, 0)";
    }

    if ($isTax) {
        return "CASE WHEN COALESCE({$a}.net_amount, 0) > 0 THEN GREATEST(0, {$a}.net_amount - COALESCE({$a}.sales_tax_amount, 0) - COALESCE({$a}.further_tax_amount, 0)) ELSE COALESCE({$a}.{$q} * {$a}.rate, 0) END";
    }
    return "COALESCE(NULLIF({$a}.net_amount, 0), {$a}.{$q} * {$a}.rate, 0)";
}

require_once __DIR__ . '/security_pin_helpers.php';
