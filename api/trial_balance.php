<?php
header('Content-Type: application/json');
require_once 'db_config.php';
require_once 'account_ledger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_balances') {
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;
    
    $filter_type = $_GET['filter_type'] ?? 'all'; // all, main, range
    $main_id = $_GET['main_id'] ?? null;
    $sub_id = $_GET['sub_id'] ?? null;
    $range_from = $_GET['range_from'] ?? null;
    $range_to = $_GET['range_to'] ?? null;

    $sql = "SELECT cl.id, cl.code, cl.name FROM coa_list cl ";
    if ($filter_type === 'main') {
        $sql .= "INNER JOIN coa_sub cs ON cl.sub_id = cs.id ";
    }
    $sql .= "WHERE cl.company_id = ?";
    
    $params = [$company_id];

    if ($filter_type === 'main') {
        if ($main_id) {
            $sql .= " AND cs.main_id = ?";
            $params[] = $main_id;
        }
        if ($sub_id) {
            $sql .= " AND cl.sub_id = ?";
            $params[] = $sub_id;
        }
    } else if ($filter_type === 'range') {
        if ($range_from && $range_to) {
            $sql .= " AND cl.code BETWEEN ? AND ?";
            $params[] = $range_from;
            $params[] = $range_to;
        }
    }

    $sql .= " ORDER BY code ASC";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $results = [];

        foreach ($accounts as $acc) {
            $txs = fetchLedgerTransactions($pdo, $company_id, $acc['id'], $from_date, $to_date);
            
            $opening_balance = 0;
            $debit = 0;
            $credit = 0;
            
            foreach ($txs as $tx) {
                if (isset($tx['is_ob']) && $tx['is_ob']) {
                    $opening_balance = (float)$tx['debit'] - (float)$tx['credit'];
                } else {
                    $debit += (float)$tx['debit'];
                    $credit += (float)$tx['credit'];
                }
            }

            $closing_balance = $opening_balance + $debit - $credit;
            
            $ob_status = $opening_balance < 0 ? 'Credit' : 'Debit';
            $cb_status = $closing_balance < 0 ? 'Credit' : 'Debit';

            $show_zero = isset($_GET['show_zero']) && $_GET['show_zero'] == '1';

            if ($show_zero || abs($opening_balance) > 0 || $debit > 0 || $credit > 0) {
                $results[] = [
                    'account_id' => $acc['id'],
                    'account_code' => $acc['code'],
                    'account_name' => $acc['name'],
                    'opening_balance' => abs($opening_balance),
                    'ob_status' => $ob_status,
                    'debit' => $debit,
                    'credit' => $credit,
                    'closing_balance' => abs($closing_balance),
                    'cb_status' => $cb_status
                ];
            }
        }

        sendResponse(['balances' => $results]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>
