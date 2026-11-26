<?php
header('Content-Type: application/json');

define('NO_SESSION', true);
require_once 'db_config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method.']);
    exit;
}

$company_id = intval($_POST['company_id'] ?? 1);
if ($company_id <= 0) $company_id = 1;
$clear_option = trim((string)($_POST['clear_option'] ?? '3')); // 1: All, 2: Tx+Opening, 3: Tx Only, 4: Tx+Inventory
if (!in_array($clear_option, ['1', '2', '3', '4'], true)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid clearing option selected.']);
    exit;
}
$password = (string)($_POST['password'] ?? '');
$securityPin = trim((string)($_POST['security_pin'] ?? $_POST['pin'] ?? ''));
$user_id = intval($_POST['user_id'] ?? 0);

if ($password === '') {
    echo json_encode(['status' => 'error', 'message' => 'Admin password is required.']);
    exit;
}

try {
    $transactionStarted = false;
    file_put_contents('debug.log', date('Y-m-d H:i:s') . " - Started clear_transactions.php (option=$clear_option) for company $company_id\n", FILE_APPEND);

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

    // Use a reasonable innodb lock wait timeout without forcefully killing unrelated queries
    try {
        $pdo->exec("SET SESSION innodb_lock_wait_timeout = 5");
    } catch (Exception $ex) {}

    $pdo->beginTransaction();
    $transactionStarted = true;

    // Group A: Core system setup, configuration, branches, warehouses, FBR/API settings & security/audit
    // Preserved across ALL 4 options so ERP login, settings, FBR tokens, branches & warehouses never break
    $core_and_settings_tables = [
        'companies', 'users', 'user_rights', 'financial_years', 'currencies',
        'coa_main', 'coa_sub', 'coa_list',
        'company_branches', 'pos_fbr_branch_mappings', 'inv_locations',
        'settings', 'pos_settings', 'digital_invoice_settings',
        'communication_api_settings', 'sms_templates',
        'buyer_types', 'customer_types_tax', 'fbr_taxpayers_registry',
        'user_login_sessions', 'user_login_attempts', 'user_activity_logs',
        'app_security_pin_config', 'app_security_pin_tokens',
        'dashboard_summary'
    ];

    // Group B: Parties, staff, services & geographic lookups (Preserved in Options 3, 2, 4; cleared in Option 1)
    $entity_master_tables = [
        'regions', 'sub_regions', 'list_regions', 'business_sectors',
        'customers', 'vendors', 'departments', 'employees', 'drivers', 'bank_accounts',
        'serv_categories', 'serv_items'
    ];

    // Group C: Chart of Inventory, inventory attributes, item formulas & item pricing (Preserved in Options 3, 2; cleared in Options 4, 1)
    $inventory_master_tables = [
        'inv_main_categories', 'inv_sub_categories', 'inv_brands', 'inv_items',
        'inv_hs_codes', 'inv_item_signs', 'inv_item_sizes', 'inv_item_lengths',
        'inv_item_classes', 'inv_item_fitting_types',
        'formulas', 'formula_items',
        'pos_assigned_items', 'customer_item_prices', 'price_revisions', 'price_revision_items'
    ];

    // Group D: Opening balance tables
    $coa_opening_tables = ['coa_opening_balances'];
    $inv_opening_tables = ['inv_opening_balances'];

    // Build exact preserve list per clearing option
    if ($clear_option === '1') {
        // Option 1: Reset Company (preserve core setup, COA, branches, settings, FBR/API config & security)
        $preserve_tables = $core_and_settings_tables;
    } else if ($clear_option === '2') {
        // Option 2: Clear Transactions & Opening Balances (preserve all master data & settings)
        $preserve_tables = array_merge($core_and_settings_tables, $entity_master_tables, $inventory_master_tables);
    } else if ($clear_option === '4') {
        // Option 4: Clear Transactions & Chart of Inventory (preserve settings, COA + COA opening, parties & services)
        $preserve_tables = array_merge($core_and_settings_tables, $entity_master_tables, $coa_opening_tables);
    } else {
        // Option 3 (Default): Clear Transactions Only (preserve all master data, settings & all opening balances)
        $preserve_tables = array_merge($core_and_settings_tables, $entity_master_tables, $inventory_master_tables, $coa_opening_tables, $inv_opening_tables);
    }

    // Fetch base tables with company_id from INFORMATION_SCHEMA (exclude views)
    $stmt = $pdo->query("
        SELECT c.TABLE_NAME
        FROM INFORMATION_SCHEMA.COLUMNS c
        INNER JOIN INFORMATION_SCHEMA.TABLES t
            ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        WHERE c.TABLE_SCHEMA = DATABASE()
          AND t.TABLE_TYPE = 'BASE TABLE'
          AND c.COLUMN_NAME = 'company_id'
    ");
    $all_tables_with_company_id = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $tables_to_clear = [];
    foreach ($all_tables_with_company_id as $tbl) {
        if (!in_array($tbl, $preserve_tables, true)) {
            $tables_to_clear[] = $tbl;
        }
    }

    // In Option 1, clean up list_regions linked to this company's regions before regions/sub_regions deletion
    if ($clear_option === '1') {
        try {
            $hasListRegions = $pdo->query("SHOW TABLES LIKE 'list_regions'")->rowCount() > 0;
            $hasSubRegions = $pdo->query("SHOW TABLES LIKE 'sub_regions'")->rowCount() > 0;
            $hasRegions = $pdo->query("SHOW TABLES LIKE 'regions'")->rowCount() > 0;
            if ($hasListRegions && $hasSubRegions && $hasRegions) {
                $pdo->prepare("
                    DELETE lr FROM list_regions lr
                    INNER JOIN sub_regions sr ON lr.sub_region_id = sr.id
                    INNER JOIN regions r ON sr.region_id = r.id
                    WHERE r.company_id = ?
                ")->execute([$company_id]);
            }
        } catch (Exception $ex) {}
    }

    // Execute deletions with FOREIGN_KEY_CHECKS=1 intact (multi-pass so child tables never block parents, while ON DELETE CASCADE still cleans item rows)
    $pending = $tables_to_clear;
    for ($pass = 0; $pass < 3 && !empty($pending); $pass++) {
        $nextPending = [];
        $lastErr = null;
        foreach ($pending as $table) {
            try {
                $pdo->prepare("DELETE FROM `$table` WHERE company_id = ?")->execute([$company_id]);
            } catch (Throwable $fkEx) {
                $nextPending[] = $table;
                $lastErr = $fkEx;
            }
        }
        if (count($nextPending) === count($pending) && $lastErr !== null) {
            throw $lastErr;
        }
        $pending = $nextPending;
    }

    // In Option 1 (Reset Company), remove ALL non-hardcoded accounts across coa_list, bank_accounts, coa_sub, and coa_main
    // Works directly on COA tables even if customers/vendors were already cleared previously.
    $deletedCoaStats = ['list' => 0, 'sub' => 0, 'main' => 0];
    if ($clear_option === '1') {
        $protected_coa_codes = [
            '100', '10001', '10001001',
            '110', '11001', '11001001',
            '120', '12001', '12001001', '12002',
            '130', '13001', '13001001',
            '140', '14001', '14001001', '14002', '14003',
            '150', '15001',
            '170', '17001',
            '180', '18001',
            '210', '21001', '21001001', '21002',
            '220', '22001', '22001001', '22001002', '22001003', '22001004', '22002', '22003',
            '230', '23001',
            '240', '24001',
            '300', '30001',
            '310', '31001',
            '320', '32001', '32001001',
            '400', '40001', '40001001', '40001002', '40001003',
            '500', '50001', '50001001', '50001002', '50001003', '50001004', '50001005', '50001006', '50001007', '50001008', '50002', '50002001', '50003', '50003001',
            '600', '60001', '60001001', '60001002',
            '650', '65001',
            '670', '67001',
            '680', '68001',
            '700', '70001',
            '800', '80001'
        ];
        $protectedCoaSet = array_flip($protected_coa_codes);

        // 1. Delete non-hardcoded coa_list rows (plus linked bank_accounts & branch default_customer_id cleanup)
        $listStmt = $pdo->prepare("SELECT id, code FROM coa_list WHERE company_id = ?");
        $listStmt->execute([$company_id]);
        $deleteCoaListIds = [];
        $walkInCustomerCoaId = null;
        foreach ($listStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $codeKey = trim((string)($row['code'] ?? ''));
            if ($codeKey === '12001001') {
                $walkInCustomerCoaId = intval($row['id']);
            }
            if (!isset($protectedCoaSet[$codeKey])) {
                $deleteCoaListIds[] = intval($row['id']);
            }
        }

        if (!empty($deleteCoaListIds)) {
            $hasBankAccounts = $pdo->query("SHOW TABLES LIKE 'bank_accounts'")->rowCount() > 0;
            $hasBranches = $pdo->query("SHOW TABLES LIKE 'company_branches'")->rowCount() > 0;
            foreach (array_chunk($deleteCoaListIds, 500) as $chunk) {
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                if ($hasBranches) {
                    try {
                        $clrBr = $pdo->prepare("UPDATE company_branches SET default_customer_id = ? WHERE company_id = ? AND default_customer_id IN ($ph)");
                        $clrBr->execute(array_merge([$walkInCustomerCoaId, $company_id], $chunk));
                    } catch (Exception $ex) {}
                }
                if ($hasBankAccounts) {
                    try {
                        $delBank = $pdo->prepare("DELETE FROM bank_accounts WHERE coa_list_id IN ($ph)");
                        $delBank->execute($chunk);
                    } catch (Exception $ex) {}
                }
                $delList = $pdo->prepare("DELETE FROM coa_list WHERE company_id = ? AND id IN ($ph)");
                $delList->execute(array_merge([$company_id], $chunk));
                $deletedCoaStats['list'] += $delList->rowCount();
            }
        }

        // 2. Delete non-hardcoded coa_sub rows that have no remaining protected coa_list children
        $remSubStmt = $pdo->prepare("SELECT DISTINCT sub_id FROM coa_list WHERE company_id = ? AND sub_id IS NOT NULL");
        $remSubStmt->execute([$company_id]);
        $usedSubSet = array_flip(array_map('intval', $remSubStmt->fetchAll(PDO::FETCH_COLUMN)));

        $subStmt = $pdo->prepare("SELECT id, code FROM coa_sub WHERE company_id = ?");
        $subStmt->execute([$company_id]);
        $deleteCoaSubIds = [];
        foreach ($subStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $sid = intval($row['id']);
            $codeKey = trim((string)($row['code'] ?? ''));
            if (!isset($protectedCoaSet[$codeKey]) && !isset($usedSubSet[$sid])) {
                $deleteCoaSubIds[] = $sid;
            }
        }
        foreach (array_chunk($deleteCoaSubIds, 500) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $delSub = $pdo->prepare("DELETE FROM coa_sub WHERE company_id = ? AND id IN ($ph)");
            $delSub->execute(array_merge([$company_id], $chunk));
            $deletedCoaStats['sub'] += $delSub->rowCount();
        }

        // 3. Delete non-hardcoded coa_main rows that have no remaining coa_sub children
        $remMainStmt = $pdo->prepare("SELECT DISTINCT main_id FROM coa_sub WHERE company_id = ? AND main_id IS NOT NULL");
        $remMainStmt->execute([$company_id]);
        $usedMainSet = array_flip(array_map('intval', $remMainStmt->fetchAll(PDO::FETCH_COLUMN)));

        $mainStmt = $pdo->prepare("SELECT id, code FROM coa_main WHERE company_id = ?");
        $mainStmt->execute([$company_id]);
        $deleteCoaMainIds = [];
        foreach ($mainStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $mid = intval($row['id']);
            $codeKey = trim((string)($row['code'] ?? ''));
            if (!isset($protectedCoaSet[$codeKey]) && !isset($usedMainSet[$mid])) {
                $deleteCoaMainIds[] = $mid;
            }
        }
        foreach (array_chunk($deleteCoaMainIds, 500) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $delMain = $pdo->prepare("DELETE FROM coa_main WHERE company_id = ? AND id IN ($ph)");
            $delMain->execute(array_merge([$company_id], $chunk));
            $deletedCoaStats['main'] += $delMain->rowCount();
        }
    }

    // Reset dashboard summary counters
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
    $transactionStarted = false;

    $optionLabels = [
        '1' => 'Company data reset completed successfully! Only hardcoded Chart of Accounts, branches, users & settings were preserved; all custom accounts, parties, inventory, opening balances & transactions were cleared.',
        '2' => 'Transactions and Opening Balances cleared successfully! Master Data & Settings were preserved.',
        '3' => 'Transactions cleared successfully! Master Data, Settings & Opening Balances were preserved.',
        '4' => 'Transactions and Chart of Inventory cleared successfully! Accounts, Parties & Settings were preserved.'
    ];
    $_SESSION['company_id'] = $company_id;
    $_SESSION['user_id'] = $authUser['id'];
    $_SESSION['username'] = $authUser['username'];
    logActivity('Clear Transactions', 'DELETE', 'option_' . $clear_option, $optionLabels[$clear_option], null, [
        'company_id' => $company_id,
        'clear_option' => $clear_option,
        'tables_cleared' => count($tables_to_clear),
        'coa_deleted' => $deletedCoaStats
    ]);

    file_put_contents('debug.log', date('Y-m-d H:i:s') . " - Committed clear_transactions (option=$clear_option, tables=" . count($tables_to_clear) . ")\n", FILE_APPEND);
    echo json_encode(['status' => 'success', 'message' => $optionLabels[$clear_option]]);
} catch (Throwable $e) {
    file_put_contents('debug.log', date('Y-m-d H:i:s') . " - Error: " . $e->getMessage() . "\n", FILE_APPEND);
    if (isset($transactionStarted) && $transactionStarted) {
        try { $pdo->rollBack(); } catch (Throwable $ex) {}
    }
    echo json_encode(['status' => 'error', 'message' => 'Failed to clear transactions: ' . $e->getMessage()]);
}
?>
