<?php
header('Content-Type: application/json');
require_once 'db_config.php';
require_once 'account_ledger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_balances') {
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    $sql = "
        SELECT cl.id, cl.code, cl.name 
        FROM coa_list cl
        INNER JOIN coa_sub cs ON cl.sub_id = cs.id
        INNER JOIN coa_main cm ON cs.main_id = cm.id
        WHERE cl.company_id = ? 
        AND (
            LOWER(cm.name) LIKE '%cash%' OR LOWER(cm.name) LIKE '%bank%' OR
            LOWER(cs.name) LIKE '%cash%' OR LOWER(cs.name) LIKE '%bank%'
        )
        ORDER BY cl.code ASC
    ";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
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
            
            // Format status strings
            $ob_status = $opening_balance < 0 ? 'Credit' : ($opening_balance > 0 ? 'Debit' : 'Debit');
            $cb_status = $closing_balance < 0 ? 'Credit' : ($closing_balance > 0 ? 'Debit' : 'Debit');

            // Only add if there is any activity or balance
            if (abs($opening_balance) > 0 || $debit > 0 || $credit > 0) {
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
