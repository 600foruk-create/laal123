<?php
header('Content-Type: application/json');
require_once 'db_config.php';
require_once 'account_ledger.php';

try {
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    $company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_sheet') {
        
        $date_filter = $_GET['date_filter'] ?? 'to_date';
        
        $query_from_date = '1970-01-01'; // from beginning of time for balance sheet
        $query_to_date = date('Y-m-d');

        if ($date_filter === 'on_date' && !empty($_GET['on_date'])) {
            $query_to_date = $_GET['on_date'];
        }

        // Fetch all COA list items with their main account names and components
        $sql = "
            SELECT 
                cl.id, cl.code, cl.name, 
                cm.name as main_name, 
                cm.component as main_component,
                cs.name as sub_name
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ?
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $balance_sheet = [
            'Assets' => [],
            'Liabilities & Equity' => []
        ];

        foreach ($accounts as $acc) {
            $main_name = $acc['main_name'] ?? 'Uncategorized';
            $sub_name = $acc['sub_name'] ?? $acc['name'];
            
            // In case main_component is missing, try to guess
            $component = strtolower($acc['main_component'] ?? '');
            $main_name_lower = strtolower($main_name);
            
            $is_asset = false;
            if ($component === 'asset' || 
                strpos($main_name_lower, 'asset') !== false || 
                strpos($main_name_lower, 'cash') !== false || 
                strpos($main_name_lower, 'bank') !== false || 
                strpos($main_name_lower, 'customer') !== false || 
                strpos($main_name_lower, 'inventor') !== false || 
                strpos($main_name_lower, 'receivable') !== false ||
                strpos($main_name_lower, 'advance') !== false) {
                $is_asset = true;
            }
            
            // For Balance Sheet, we only care about Assets, Liabilities, and Equity
            // Revenue and Expenses should technically go into Retained Earnings (Equity)
            // But we will fetch balances for all and put them in their top level
            
            $top_level = $is_asset ? 'Assets' : 'Liabilities & Equity';

            // Fetch ledger transactions for the period (from start of time to the selected date)
            $txs = fetchLedgerTransactions($pdo, $company_id, $acc['id'], $query_from_date, $query_to_date);

            // Calculate closing balance
            $closing_balance = 0;
            $debit = 0;
            $credit = 0;
            
            if (!empty($txs)) {
                foreach ($txs as $tx) {
                    $debit += (float)($tx['debit'] ?? 0);
                    $credit += (float)($tx['credit'] ?? 0);
                }
                $closing_balance = $debit - $credit;
            }

            // Normal balance for Assets is Debit (positive $closing_balance)
            // Normal balance for Liabilities/Equity is Credit (negative $closing_balance)
            $balance_value = $closing_balance;
            if ($top_level === 'Liabilities & Equity') {
                $balance_value = $closing_balance * -1;
            }

            if (abs($balance_value) > 0) {
                if (!isset($balance_sheet[$top_level][$main_name])) {
                    $balance_sheet[$top_level][$main_name] = [];
                }
                if (!isset($balance_sheet[$top_level][$main_name][$sub_name])) {
                    $balance_sheet[$top_level][$main_name][$sub_name] = 0;
                }
                $balance_sheet[$top_level][$main_name][$sub_name] += $balance_value;
            }
        }

        // Optional: Move Retained Earnings / Net Income into Equity automatically
        // If there are Revenue/Expense accounts, their net balance is Net Income
        // They would fall under 'Liabilities & Equity' since they aren't 'asset'
        
        sendResponse([
            'status' => 'success',
            'data' => $balance_sheet,
            'period' => [
                'to' => $query_to_date
            ]
        ]);
    }
} catch (Exception $e) {
    sendResponse(['error' => $e->getMessage()], 500);
}
?>
