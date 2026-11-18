<?php
header('Content-Type: application/json');
require_once 'db_config.php';

try {
    $action = $_GET['action'] ?? '';
    $company_id = $_GET['company_id'] ?? 1;

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        
        if ($action === 'get_jobs') {
            $stmt = $pdo->prepare("
                SELECT j.*, 
                       c.name as customer_name,
                       e.name as job_incharge_name
                FROM job_cards j
                LEFT JOIN coa_list c ON j.coa_list_id = c.id
                LEFT JOIN employees e ON j.job_incharge_id = e.id
                WHERE j.company_id = ?
                ORDER BY j.job_no DESC
            ");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            exit;
        }

        if ($action === 'get_job_ledger') {
            $job_id = $_GET['job_id'] ?? null;
            if (!$job_id) {
                echo json_encode(['error' => 'Job ID is required']);
                exit;
            }

            $queries = [];

            // General Journal Vouchers (Only fetching items, not balancing headers as JV items balance themselves)
            $queries[] = "SELECT v.voucher_date as date, CONCAT('JV-', v.serial_no) as tran_no,
                          c.code as account_code, c.name as account_name,
                          COALESCE(NULLIF(TRIM(i.description),''), TRIM(v.description)) as description,
                          i.debit, i.credit
                          FROM general_journal_voucher_items i
                          INNER JOIN general_journal_vouchers v ON i.voucher_id = v.id
                          LEFT JOIN coa_list c ON i.coa_id = c.id
                          WHERE v.job_id = ? AND v.company_id = ? AND v.is_cancelled = 0";

            // Cash Payments (Only fetching expense items, omitting cash credit)
            $queries[] = "SELECT p.payment_date as date, CONCAT('CP-', p.serial_no) as tran_no,
                          c.code as account_code, c.name as account_name,
                          COALESCE(NULLIF(TRIM(i.description),''), TRIM(p.remarks)) as description,
                          i.total_debited as debit, 0 as credit
                          FROM cash_payment_items i
                          INNER JOIN cash_payments p ON i.payment_id = p.id
                          LEFT JOIN coa_list c ON i.coa_id = c.id
                          WHERE p.job_id = ? AND p.company_id = ? AND p.is_cancelled = 0";

            // Bank Payments
            $queries[] = "SELECT p.payment_date as date, CONCAT('BP-', p.serial_no) as tran_no,
                          c.code as account_code, c.name as account_name,
                          COALESCE(NULLIF(TRIM(i.description),''), TRIM(p.remarks)) as description,
                          i.total_debited as debit, 0 as credit
                          FROM bank_payment_items i
                          INNER JOIN bank_payments p ON i.payment_id = p.id
                          LEFT JOIN coa_list c ON i.coa_id = c.id
                          WHERE p.job_id = ? AND p.company_id = ? AND p.is_cancelled = 0";

            // Cash Receipts
            $queries[] = "SELECT r.receipt_date as date, CONCAT('CR-', r.serial_no) as tran_no,
                          c.code as account_code, c.name as account_name,
                          COALESCE(NULLIF(TRIM(i.description),''), TRIM(r.remarks)) as description,
                          0 as debit, i.total_credited as credit
                          FROM cash_receipt_items i
                          INNER JOIN cash_receipts r ON i.receipt_id = r.id
                          LEFT JOIN coa_list c ON i.coa_id = c.id
                          WHERE r.job_id = ? AND r.company_id = ? AND r.is_cancelled = 0";

            // Bank Receipts
            $queries[] = "SELECT r.receipt_date as date, CONCAT('BR-', r.serial_no) as tran_no,
                          c.code as account_code, c.name as account_name,
                          COALESCE(NULLIF(TRIM(i.description),''), TRIM(r.remarks)) as description,
                          0 as debit, i.total_credited as credit
                          FROM bank_receipt_items i
                          INNER JOIN bank_receipts r ON i.receipt_id = r.id
                          LEFT JOIN coa_list c ON i.coa_id = c.id
                          WHERE r.job_id = ? AND r.company_id = ? AND r.is_cancelled = 0";

            $all_txs = [];
            foreach ($queries as $sql) {
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$job_id, $company_id]);
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($results as $r) {
                    $all_txs[] = $r;
                }
            }

            // Sort by Date, then Tran No
            usort($all_txs, function($a, $b) {
                $dateCmp = strcmp($a['date'] ?? '', $b['date'] ?? '');
                if ($dateCmp !== 0) return $dateCmp;
                return strcmp($a['tran_no'] ?? '', $b['tran_no'] ?? '');
            });

            // Calculate running profit/loss
            $running_profit = 0;
            foreach ($all_txs as &$tx) {
                // In Job Ledger: Credit (Revenue) increases profit, Debit (Expense) decreases profit.
                $profit_impact = (float)$tx['credit'] - (float)$tx['debit'];
                $running_profit += $profit_impact;
                $tx['profit_loss'] = $running_profit;
            }

            echo json_encode(['status' => 'success', 'data' => $all_txs]);
            exit;
        }

    }

    echo json_encode(['error' => 'Invalid action or request method']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
