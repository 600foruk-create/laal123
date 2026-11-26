<?php
header('Content-Type: application/json');

define('NO_SESSION', true);
require_once 'db_config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method.']);
    exit;
}

$company_id = $_POST['company_id'] ?? 1;
$clear_option = $_POST['clear_option'] ?? '3'; // 1: All, 2: Tx+Opening, 3: Tx Only
$password = (string)($_POST['password'] ?? '');
$securityPin = trim((string)($_POST['security_pin'] ?? $_POST['pin'] ?? ''));
$user_id = intval($_POST['user_id'] ?? 0);

if ($password === '') {
    echo json_encode(['status' => 'error', 'message' => 'Admin password is required.']);
    exit;
}

try {
    $transactionStarted = false;
    file_put_contents('debug.log', date('Y-m-d H:i:s') . " - Started clear_transactions.php for company $company_id\n", FILE_APPEND);

    // Verify Main Administrator identity + hashed Login Password + 4-Digit Master Security PIN
    if ($user_id <= 0) {
        echo json_encode(['status' => 'error', 'message' => 'Forbidden: Only Main Administrator can clear transactions.']);
        exit;
    }
    $authStmt = $pdo->prepare("SELECT id, username, password, status FROM users WHERE id = ? LIMIT 1");
    $authStmt->execute([$user_id]);
    $authUser = $authStmt->fetch(PDO::FETCH_ASSOC);
    $stLow = strtolower(trim((string)($authUser['status'] ?? 'active')));
    $isMainAdmin = ($authUser && ($stLow === '' || $stLow === 'active' || $stLow === '1') && (intval($authUser['id']) === 1 || strcasecmp(trim((string)$authUser['username']), 'Administrator') === 0));
    if (!$isMainAdmin) {
        echo json_encode(['status' => 'error', 'message' => 'Forbidden: Only Main Administrator can clear transactions.']);
        exit;
    }

    if (!verifyAndUpgradePassword($password, $authUser['password'], $authUser['id'], $pdo)) {
        echo json_encode(['status' => 'error', 'message' => 'Incorrect Administrator Password!']);
        exit;
    }

    $pinCfg = getSecurityPinSettings($pdo);
    if (!empty($pinCfg['pin_on_clear_tx'])) {
        $pinRes = verifyMasterSecurityPin($pdo, $securityPin, true);
        if (!$pinRes['ok']) {
            echo json_encode(['status' => 'error', 'message' => $pinRes['error'] ?? 'Invalid 4-Digit Security PIN!']);
            exit;
        }
    }
    
    // KILL ANY PREVIOUS HANGING PROCESSES THAT MIGHT BE LOCKING TABLES
    try {
        $current_id = $pdo->query("SELECT CONNECTION_ID()")->fetchColumn();
        $processes = $pdo->query("SHOW PROCESSLIST")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($processes as $process) {
            if ($process['Id'] != $current_id) {
                if ($process['Time'] > 5 || $process['Command'] === 'Sleep') {
                    $pdo->query("KILL " . $process['Id']);
                }
            }
        }
    } catch (Exception $ex) {}
    
    // FAIL FAST IF STILL LOCKED
    $pdo->exec("SET SESSION innodb_lock_wait_timeout = 1");
    
    $pdo->beginTransaction();
    $transactionStarted = true;

    $master_data_tables = [
        'companies', 'users', 'user_rights', 'financial_years', 'currencies',
        'coa_main', 'coa_sub', 'coa_list', 'regions', 'sub_regions', 'business_sectors',
        'customers', 'departments', 'employees', 'vendors', 'inv_main_categories',
        'inv_sub_categories', 'inv_brands', 'inv_items', 'dashboard_summary'
    ];
    $opening_balance_tables = [
        'coa_opening_balances', 'inv_opening_balances'
    ];

    // Use INFORMATION_SCHEMA to get all tables with company_id to avoid metadata locks
    $stmt = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'company_id'");
    $all_tables_with_company_id = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $tables_to_clear = [];

    if ($clear_option === '1') {
        // Option 1: Clear EVERYTHING except core company setup
        $preserve = ['companies', 'users', 'user_rights', 'financial_years', 'currencies', 'coa_main', 'coa_sub', 'coa_list'];
        foreach ($all_tables_with_company_id as $tbl) {
            if (!in_array($tbl, $preserve)) {
                $tables_to_clear[] = $tbl;
            }
        }
    } 
    else if ($clear_option === '2') {
        // Option 2: Clear Transactions + Opening Balances (Preserve Master Data)
        foreach ($all_tables_with_company_id as $tbl) {
            if (!in_array($tbl, $master_data_tables)) {
                $tables_to_clear[] = $tbl;
            }
        }
    }
    else if ($clear_option === '4') {
        // Option 4: Clear Transactions & Chart of Inventory
        $inventory_master = ['inv_main_categories', 'inv_sub_categories', 'inv_brands', 'inv_items', 'inv_opening_balances'];
        foreach ($all_tables_with_company_id as $tbl) {
            if (!in_array($tbl, $master_data_tables) && !in_array($tbl, $opening_balance_tables)) {
                $tables_to_clear[] = $tbl;
            } else if (in_array($tbl, $inventory_master)) {
                $tables_to_clear[] = $tbl;
            }
        }
    }
    else {
        // Option 3: Clear Transactions ONLY (Preserve Master Data AND Opening Balances)
        foreach ($all_tables_with_company_id as $tbl) {
            if (!in_array($tbl, $master_data_tables) && !in_array($tbl, $opening_balance_tables)) {
                $tables_to_clear[] = $tbl;
            }
        }
    }

    // Execute Deletion
    foreach ($tables_to_clear as $table) {
        $pdo->prepare("DELETE FROM `$table` WHERE company_id = ?")->execute([$company_id]);
    }

    // Reset dashboard summary
    $stmt = $pdo->prepare("SHOW TABLES LIKE 'dashboard_summary'");
    $stmt->execute();
    if ($stmt->rowCount() > 0) {
        $pdo->prepare("
            UPDATE dashboard_summary SET 
                sales = 0, cash_opening = 0, cash_receipts = 0, cash_payments = 0, 
                bank_balance = 0, rec_opening = 0, rec_sales = 0, rec_receipts = 0, 
                pay_opening = 0, pay_purchases = 0, pay_payments = 0, new_invoices = 0, 
                customer_receipts = 0, overdue = 0, new_purchases = 0, 
                vendor_payments = 0, outstanding = 0 
            WHERE company_id = ?
        ")->execute([$company_id]);
    }

    $pdo->commit();
    file_put_contents('debug.log', date('Y-m-d H:i:s') . " - Committed transaction\n", FILE_APPEND);
    echo json_encode(['status' => 'success', 'message' => 'LATEST CODE: Data Cleared Successfully!']);
} catch (Throwable $e) {
    file_put_contents('debug.log', date('Y-m-d H:i:s') . " - Error: " . $e->getMessage() . "\n", FILE_APPEND);
    if (isset($transactionStarted) && $transactionStarted) {
        try { $pdo->rollBack(); } catch (Throwable $ex) {}
    }
    echo json_encode(['status' => 'error', 'message' => 'Failed to clear transactions: ' . $e->getMessage()]);
}
?>
