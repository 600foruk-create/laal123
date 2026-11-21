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

// Load environment variables from .env file if available
if (!function_exists('loadEnv')) {
    function loadEnv($path) {
        if (!file_exists($path)) return;
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line) || strpos($line, '#') === 0) continue;
            if (strpos($line, '=') !== false) {
                list($key, $val) = explode('=', $line, 2);
                $key = trim($key);
                $val = trim($val);
                $val = trim($val, "\"'");
                if (getenv($key) === false) {
                    putenv("$key=$val");
                    $_ENV[$key] = $val;
                    $_SERVER[$key] = $val;
                }
            }
        }
    }
}
loadEnv(__DIR__ . '/../.env');
loadEnv(__DIR__ . '/.env');

// Smart Domain / Host Detection Fallback for Multi-Site Deployment
$httpHost = strtolower($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? ''));

$defaultDb   = 'u245697138_madrasa';
$defaultUser = 'u245697138_madrasa';
$defaultPass = 'Suhailahmad123@';

if (strpos($httpHost, 'orchid-salmon') !== false || strpos($httpHost, 'madrasa') !== false) {
    $defaultDb   = 'u245697138_madrasa';
    $defaultUser = 'u245697138_madrasa';
    $defaultPass = 'Suhailahmad123@';
} elseif (strpos($httpHost, 'goldenrod-grasshopper') !== false || strpos($httpHost, 'forupdates') !== false) {
    $defaultDb   = 'u245697138_forupdates';
    $defaultUser = 'u245697138_forupdates';
    $defaultPass = 'Suhailahmad123@';
}

$host    = getenv('DB_HOST') ?: 'localhost';
$db      = getenv('DB_NAME') ?: $defaultDb;
$user    = getenv('DB_USER') ?: $defaultUser;
$pass    = getenv('DB_PASS') !== false ? getenv('DB_PASS') : $defaultPass;
$charset = getenv('DB_CHARSET') ?: 'utf8mb4';

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

    $cacheDir = __DIR__ . '/../storage';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    $lockFile = $cacheDir . '/schema_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $moduleKey) . '_v' . $version . '.lock';
    if (file_exists($lockFile)) {
        return false;
    }
    @file_put_contents($lockFile, date('Y-m-d H:i:s'));
    return true;
}

// User Activity Logs Migration and Helpers
if (shouldRunMigration('user_activity_logs', 1)) {
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (company_id),
            INDEX (user_id),
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

function recordApprovalQueueEntry($module, $action_type, $record_id, $record_title, $after_data = null) {
    global $pdo;
    
    // Only track INSERT and UPDATE
    if ($action_type !== 'INSERT' && $action_type !== 'UPDATE') {
        return;
    }
    
    $eligibleModules = [
        'Sale Invoice', 'POS Sale', 'Purchase Invoice', 'Purchase Orders', 
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

function logActivity($module, $action_type, $record_id, $record_title, $before_data = null, $after_data = null) {
    global $pdo;
    $company_id = $_SESSION['company_id'] ?? 1;
    $user_id = $_SESSION['user_id'] ?? 0;
    $username = $_SESSION['username'] ?? 'System';
    
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

        // Sync eligible vouchers/invoices to the Maker-Checker Approval Desk
        recordApprovalQueueEntry($module, $action_type, $record_id, $record_title, $after_data);

        // Keep active session heartbeat updated
        if ($user_id > 0) {
            try {
                $pdo->prepare("UPDATE user_login_sessions SET last_heartbeat = NOW() WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1")->execute([$user_id]);
            } catch (Exception $hbErr) {}
        }
    } catch (Exception $e) {
        error_log("SoftifyX Log Activity Error: " . $e->getMessage());
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
    if (!isset($_SESSION['user_id'])) {
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
