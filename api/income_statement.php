<?php
header('Content-Type: application/json');
require_once 'db_config.php';
require_once 'account_ledger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_statement') {
    $date_filter = $_GET['date_filter'] ?? 'to_date'; // to_date, upto, period
    $upto_date = $_GET['upto_date'] ?? null;
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    $query_from_date = null;
    $query_to_date = null;

    if ($date_filter === 'upto') {
        $query_to_date = $upto_date;
    } else if ($date_filter === 'period') {
        $query_from_date = $from_date;
        $query_to_date = $to_date;
    } else {
        // to_date = up to today
        $query_to_date = date('Y-m-d');
    }

    try {
        // Get all accounts with their main and sub category names
        $sql = "
            SELECT 
                cl.id, cl.code, cl.name, 
                cm.name as main_name, 
                cs.name as sub_name
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ?
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $results = [
            'Revenue' => [],
            'Cost of Sales' => [],
            'Other Operating Income' => [],
            'Administrative Expenses' => [],
            'Marketing & Distribution Expenses' => [],
            'Financial Expenses' => [],
            'Other Expenses' => [],
            'Taxation' => []
        ];

        foreach ($accounts as $acc) {
            $main_name = strtolower($acc['main_name'] ?? '');
            
            // Auto-categorize based on main account name
            $category = null;
            if (strpos($main_name, 'revenue') !== false || strpos($main_name, 'sale') !== false || strpos($main_name, 'income') !== false) {
                if (strpos($main_name, 'other') !== false || strpos($main_name, 'operating') !== false) {
                    $category = 'Other Operating Income';
                } else {
                    $category = 'Revenue';
                }
            } else if (strpos($main_name, 'cost of sale') !== false || strpos($main_name, 'cogs') !== false || strpos($main_name, 'purchase') !== false) {
                $category = 'Cost of Sales';
            } else if (strpos($main_name, 'admin') !== false) {
                $category = 'Administrative Expenses';
            } else if (strpos($main_name, 'market') !== false || strpos($main_name, 'distrib') !== false || strpos($main_name, 'sell') !== false) {
                $category = 'Marketing & Distribution Expenses';
            } else if (strpos($main_name, 'financ') !== false || strpos($main_name, 'bank') !== false) {
                $category = 'Financial Expenses';
            } else if (strpos($main_name, 'tax') !== false) {
                $category = 'Taxation';
            } else if (strpos($main_name, 'expens') !== false) {
                $category = 'Other Expenses';
            }

            // Only process income statement accounts
            if ($category) {
                // Fetch ledger transactions for the period
                $txs = fetchLedgerTransactions($pdo, $company_id, $acc['id'], $query_from_date, $query_to_date);
                
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
                
                // Revenue & Income normally have Credit balances (Negative $closing_balance)
                // Expenses normally have Debit balances (Positive $closing_balance)
                // Multiplying by -1 makes Income positive and Expenses negative, perfectly matching the display format.
                $balance_value = $closing_balance * -1;

                if (abs($balance_value) > 0) {
                    $results[$category][] = [
                        'account_id' => $acc['id'],
                        'account_code' => $acc['code'],
                        'account_name' => $acc['name'],
                        'balance' => $balance_value
                    ];
                }
            }
        }

        sendResponse([
            'status' => 'success',
            'data' => $results,
            'period' => [
                'from' => $query_from_date,
                'to' => $query_to_date
            ]
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>
