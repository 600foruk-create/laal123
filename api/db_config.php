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

$host    = getenv('DB_HOST') ?: 'localhost';
$db      = getenv('DB_NAME') ?: 'u245697138_madrasa';
$user    = getenv('DB_USER') ?: 'u245697138_madrasa';
$pass    = getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'Suhailahmad123@';
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
    if ($storedPassword === $inputPassword) {
        // Upgrade password to secure Bcrypt hash automatically!
        $newHash = password_hash($inputPassword, PASSWORD_DEFAULT);
        $up = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $up->execute([$newHash, $userId]);
        return true;
    }
    
    return false;
}

