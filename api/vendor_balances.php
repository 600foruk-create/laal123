<?php
header('Content-Type: application/json');
require_once 'db_config.php';
require_once 'account_ledger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_balances') {
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;
    
    $vendor_type_id = $_GET['vendor_type_id'] ?? null;

    $sql = "
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        LEFT JOIN vendors v ON v.coa_list_id = cl.id
        WHERE cl.company_id = ? 
        AND cl.sub_id IN (
            SELECT id FROM coa_sub WHERE 
                main_id IN (
                    SELECT id FROM coa_main WHERE code = '210'
                )
        )
    ";
    $params = [$company_id];

    if ($vendor_type_id) {
        $sql .= " AND cl.sub_id = ?";
        $params[] = $vendor_type_id;
    }

    $sql .= " ORDER BY cl.code ASC";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $results = [];

        $show_zero_balance = isset($_GET['show_zero_balance']) && $_GET['show_zero_balance'] === 'true';

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

            if ($show_zero_balance || abs($opening_balance) > 0 || $debit > 0 || $credit > 0) {
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
