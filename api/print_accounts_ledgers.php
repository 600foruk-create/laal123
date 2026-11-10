<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Include account_ledger to reuse fetchLedgerTransactions()
require_once 'account_ledger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_bulk_ledgers') {
    $type = $_GET['type'] ?? 'all';
    $main_id = $_GET['main_id'] ?? '';
    $sub_id = $_GET['sub_id'] ?? '';
    $from_code = $_GET['from_code'] ?? '';
    $to_code = $_GET['to_code'] ?? '';
    
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    $sql = "SELECT id, code, name FROM coa_list WHERE company_id = ?";
    $params = [$company_id];

    if ($type === 'main') {
        if ($main_id && $sub_id) {
            $sql .= " AND sub_id = ?";
            $params[] = $sub_id;
        } else if ($main_id) {
            $sql .= " AND sub_id IN (SELECT id FROM coa_sub WHERE main_id = ?)";
            $params[] = $main_id;
        }
    } else if ($type === 'range') {
        if ($from_code && $to_code) {
            $sql .= " AND code BETWEEN ? AND ?";
            $params[] = $from_code;
            $params[] = $to_code;
        }
    }

    $sql .= " ORDER BY code ASC";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $results = [];

        foreach ($accounts as $acc) {
            // Reusing the function from account_ledger.php
            $txs = fetchLedgerTransactions($pdo, $company_id, $acc['id'], $from_date, $to_date);
            
            // Extract opening balance
            $opening_balance = 0;
            $regular_txs = [];
            
            foreach ($txs as $tx) {
                if (isset($tx['is_ob']) && $tx['is_ob']) {
                    $opening_balance = (float)$tx['debit'] - (float)$tx['credit'];
                } else {
                    $regular_txs[] = $tx;
                }
            }

            // Optional: Skip accounts with no opening balance and no transactions
            if (empty($regular_txs) && $opening_balance == 0) {
                continue;
            }

            $results[] = [
                'account_id' => $acc['id'],
                'account_code' => $acc['code'],
                'account_name' => $acc['name'],
                'opening_balance' => $opening_balance,
                'transactions' => $regular_txs
            ];
        }

        sendResponse(['ledgers' => $results]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>
