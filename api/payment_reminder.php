<?php
header('Content-Type: application/json; charset=utf-8');
require_once 'db_config.php';
require_once 'account_ledger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// Ensure customer_follow_ups table exists with enhanced fields
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_follow_ups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL DEFAULT 1,
        date DATE,
        event_type VARCHAR(255) DEFAULT 'Follow-up',
        acc_manager_id INT NULL,
        job_id INT NULL,
        customer_coa_id INT NOT NULL,
        contact_person VARCHAR(255) NULL,
        promised_date DATE NULL,
        promised_amount DECIMAL(15,2) DEFAULT 0.00,
        response_type VARCHAR(100) NULL,
        remarks LONGTEXT,
        next_follow_up_date DATE NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        details LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (customer_coa_id),
        INDEX (acc_manager_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Check and add missing columns if table already existed previously
    $existingCols = $pdo->query("SHOW COLUMNS FROM customer_follow_ups")->fetchAll(PDO::FETCH_COLUMN);
    $neededCols = [
        'contact_person' => "VARCHAR(255) NULL",
        'promised_date' => "DATE NULL",
        'promised_amount' => "DECIMAL(15,2) DEFAULT 0.00",
        'response_type' => "VARCHAR(100) NULL",
        'remarks' => "LONGTEXT NULL",
        'next_follow_up_date' => "DATE NULL",
        'status' => "VARCHAR(50) DEFAULT 'Pending'",
        'details' => "LONGTEXT NULL",
        'event_type' => "VARCHAR(255) DEFAULT 'Follow-up'",
        'serial_no' => "INT NOT NULL DEFAULT 1",
        'date' => "DATE NULL",
        'job_id' => "INT NULL",
        'acc_manager_id' => "INT NULL"
    ];
    foreach ($neededCols as $cName => $cDef) {
        if (!in_array($cName, $existingCols)) {
            $pdo->exec("ALTER TABLE customer_follow_ups ADD COLUMN $cName $cDef");
        }
    }
} catch (Exception $e) {}

// Ensure credit_terms or credit_days exists in customers
try {
    $colCheck = $pdo->query("SHOW COLUMNS FROM customers LIKE 'credit_days'")->fetchAll();
    if (empty($colCheck)) {
        $pdo->exec("ALTER TABLE customers ADD COLUMN credit_days INT DEFAULT 7 AFTER credit_terms");
    }
} catch (Exception $e) {}

// =========================================================================
// 1. LOOKUPS (Customers, Customer Categories, Salespersons, Locations)
// =========================================================================
if ($action === 'get_lookups') {
    try {
        // Customers (COA sub_id under main 120)
        $stmtCust = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, c.telephone, c.mobile, c.contact_person,
                   COALESCE(c.credit_days, 7) as credit_days, c.credit_terms,
                   c.acc_manager_id, cl.sub_id, c.region_id
            FROM coa_list cl
            LEFT JOIN customers c ON c.coa_list_id = cl.id
            WHERE cl.company_id = ? 
              AND cl.sub_id IN (
                  SELECT id FROM coa_sub WHERE main_id IN (
                      SELECT id FROM coa_main WHERE code = '120'
                  )
              )
            ORDER BY cl.name ASC
        ");
        $stmtCust->execute([$company_id]);
        $customers = $stmtCust->fetchAll(PDO::FETCH_ASSOC);

        // Customer Categories (Sub accounts under 120)
        $stmtCat = $pdo->prepare("
            SELECT id, name, code 
            FROM coa_sub 
            WHERE company_id = ? AND main_id IN (SELECT id FROM coa_main WHERE code = '120')
            ORDER BY name ASC
        ");
        $stmtCat->execute([$company_id]);
        $categories = $stmtCat->fetchAll(PDO::FETCH_ASSOC);

        // Salespersons / Account Managers
        $salespersons = [];
        try {
            $stmtSp = $pdo->prepare("SELECT id, name FROM employees WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL) ORDER BY name ASC");
            $stmtSp->execute([$company_id]);
            $salespersons = $stmtSp->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}

        // Locations / Branches
        $locations = [];
        try {
            $stmtLoc = $pdo->prepare("SELECT id, name FROM inv_locations WHERE company_id = ? ORDER BY is_default DESC, name ASC");
            $stmtLoc->execute([$company_id]);
            $locations = $stmtLoc->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}

        echo json_encode([
            'status' => 'success',
            'customers' => $customers,
            'categories' => $categories,
            'salespersons' => $salespersons,
            'locations' => $locations
        ]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 2. MAIN PAYMENT REMINDER DATA ENGINE
// =========================================================================
if ($action === 'get_reminders') {
    $customer_id = trim($_GET['customer_id'] ?? '');
    $category_id = trim($_GET['category_id'] ?? '');
    $salesperson_id = trim($_GET['salesperson_id'] ?? '');
    $location_id = trim($_GET['location_id'] ?? '');
    $payment_status = trim($_GET['payment_status'] ?? 'all'); // all, pending, paid
    $reminder_status = trim($_GET['reminder_status'] ?? 'all'); // all, overdue, due_today, upcoming, stopped
    $overdue_filter = trim($_GET['overdue_days'] ?? 'all'); // all, 0, 1-7, 8-15, 16-30, 30+

    try {
        $sql = "
            SELECT cl.id, cl.code, cl.name as customer_name,
                   c.contact_person, c.telephone, c.mobile, c.address,
                   COALESCE(c.credit_days, 7) as credit_days, c.credit_terms,
                   c.acc_manager_id, e.name as salesperson_name,
                   cl.sub_id as category_id, cs.name as category_name,
                   c.region_id
            FROM coa_list cl
            LEFT JOIN customers c ON c.coa_list_id = cl.id
            LEFT JOIN employees e ON c.acc_manager_id = e.id
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            WHERE cl.company_id = ?
              AND cl.sub_id IN (
                  SELECT id FROM coa_sub WHERE main_id IN (
                      SELECT id FROM coa_main WHERE code = '120'
                  )
              )
        ";
        $params = [$company_id];

        if (!empty($customer_id)) {
            $sql .= " AND cl.id = ?";
            $params[] = $customer_id;
        }
        if (!empty($category_id)) {
            $sql .= " AND cl.sub_id = ?";
            $params[] = $category_id;
        }
        if (!empty($salesperson_id)) {
            $sql .= " AND c.acc_manager_id = ?";
            $params[] = $salesperson_id;
        }

        $sql .= " ORDER BY cl.name ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $customerList = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $today = date('Y-m-d');
        $todayTime = strtotime($today);

        $records = [];
        $summary = [
            'total_receivables' => 0.00,
            'upcoming_amount' => 0.00,
            'upcoming_count' => 0,
            'due_today_amount' => 0.00,
            'due_today_count' => 0,
            'overdue_amount' => 0.00,
            'overdue_count' => 0,
            'partially_paid_amount' => 0.00,
            'partially_paid_count' => 0,
            'total_customers' => 0
        ];

        foreach ($customerList as $cust) {
            $coaId = intval($cust['id']);

            // Parse credit days (item master / customer master-configured)
            $creditDays = intval($cust['credit_days'] ?? 0);
            if ($creditDays <= 0 && !empty($cust['credit_terms'])) {
                preg_match('/\d+/', $cust['credit_terms'], $matches);
                if (!empty($matches[0])) {
                    $creditDays = intval($matches[0]);
                }
            }
            if ($creditDays <= 0) {
                // If CASH, 0 or 7 default
                $creditDays = (strtoupper(trim($cust['credit_terms'] ?? '')) === 'CASH') ? 0 : 7;
            }

            // Fetch complete Customer Ledger Transactions up to today
            $txs = fetchLedgerTransactions($pdo, $company_id, $coaId, null, null);

            $opDebit = 0; $opCredit = 0;
            $periodDebit = 0; $periodCredit = 0;
            $latestDebitDate = null;
            $latestCreditDate = null;
            $receiptTransactions = [];

            foreach ($txs as $tx) {
                $d = floatval($tx['debit'] ?? 0);
                $c = floatval($tx['credit'] ?? 0);
                $txDate = $tx['date'] ?? null;

                if (!empty($tx['is_ob'])) {
                    $opDebit += $d;
                    $opCredit += $c;
                } else {
                    $periodDebit += $d;
                    $periodCredit += $c;
                }

                if ($d > 0 && $txDate) {
                    if (!$latestDebitDate || strtotime($txDate) > strtotime($latestDebitDate)) {
                        $latestDebitDate = $txDate;
                    }
                }
                if ($c > 0 && $txDate) {
                    if (!$latestCreditDate || strtotime($txDate) > strtotime($latestCreditDate)) {
                        $latestCreditDate = $txDate;
                    }
                    $receiptTransactions[] = [
                        'date' => $txDate,
                        'amount' => $c,
                        'tran_no' => $tx['tran_no'] ?? '',
                        'source_type' => $tx['source_type'] ?? 'CR'
                    ];
                }
            }

            // Customer's total remaining ledger balance
            $netBalance = ($opDebit + $periodDebit) - ($opCredit + $periodCredit);

            // Skip customer if balance is <= 0 and has no qualifying active cycle unless specifically requested
            if ($netBalance <= 0) {
                continue;
            }

            // Cycle start date: Date of the transaction that initiated the outstanding cycle
            $cycleStartDate = $latestDebitDate ?: $today;
            
            // Calculate Due Date based on Customer's configured Credit Days
            $dueTimestamp = strtotime("+$creditDays days", strtotime($cycleStartDate));
            $dueDateStr = date('Y-m-d', $dueTimestamp);

            // Check for qualifying payment during the current reminder cycle
            // (Any payment received on or after cycle start date or within the period)
            $qualifyingPaidAmount = 0.00;
            $hasQualifyingPayment = false;

            foreach ($receiptTransactions as $rTx) {
                if (strtotime($rTx['date']) >= strtotime($cycleStartDate)) {
                    $qualifyingPaidAmount += $rTx['amount'];
                    if ($rTx['amount'] > 0) {
                        $hasQualifyingPayment = true;
                    }
                }
            }

            // Customer total balance before this cycle's payments
            $totalBalance = $netBalance + $qualifyingPaidAmount;
            $outstanding = $netBalance;

            // Determine Overdue Days and Reminder Status
            $diffSeconds = $todayTime - $dueTimestamp;
            $overdueDaysVal = intval(round($diffSeconds / 86400));

            $statusText = 'Upcoming';
            $statusCode = 'upcoming'; // blue
            $overdueDisplay = '-';

            if ($hasQualifyingPayment) {
                // Rule: Any valid payment during configured period is sufficient to STOP reminder cycle
                $statusText = 'Payment Received – Stopped';
                $statusCode = 'stopped'; // green
                $overdueDisplay = '-';
            } elseif ($overdueDaysVal < 0) {
                $statusText = 'Upcoming';
                $statusCode = 'upcoming'; // blue
                $overdueDisplay = '-';
            } elseif ($overdueDaysVal == 0) {
                $statusText = 'Due Today';
                $statusCode = 'due_today'; // yellow / orange
                $overdueDisplay = '0';
            } else {
                $statusText = 'Overdue – Pending';
                $statusCode = 'overdue'; // red
                $overdueDisplay = (string)$overdueDaysVal;
            }

            // Check if reminder was marked as Sent in follow-up
            $lastFollow = null;
            try {
                $stmtFollow = $pdo->prepare("
                    SELECT event_type, promised_date, status, remarks 
                    FROM customer_follow_ups 
                    WHERE company_id = ? AND customer_coa_id = ? 
                    ORDER BY id DESC LIMIT 1
                ");
                $stmtFollow->execute([$company_id, $coaId]);
                $lastFollow = $stmtFollow->fetch(PDO::FETCH_ASSOC);
            } catch (Exception $exFollow) {
                $lastFollow = null;
            }

            // Filter by Payment Status
            if ($payment_status === 'paid' && !$hasQualifyingPayment) continue;
            if ($payment_status === 'pending' && $hasQualifyingPayment) continue;

            // Filter by Reminder Status
            if ($reminder_status === 'overdue' && $statusCode !== 'overdue') continue;
            if ($reminder_status === 'due_today' && $statusCode !== 'due_today') continue;
            if ($reminder_status === 'upcoming' && $statusCode !== 'upcoming') continue;
            if ($reminder_status === 'stopped' && $statusCode !== 'stopped') continue;

            // Filter by Overdue Days
            if ($overdue_filter === '0' && ($statusCode !== 'due_today' || $overdueDaysVal !== 0)) continue;
            if ($overdue_filter === '1-7' && ($overdueDaysVal < 1 || $overdueDaysVal > 7)) continue;
            if ($overdue_filter === '8-15' && ($overdueDaysVal < 8 || $overdueDaysVal > 15)) continue;
            if ($overdue_filter === '16-30' && ($overdueDaysVal < 16 || $overdueDaysVal > 30)) continue;
            if ($overdue_filter === '30+' && $overdueDaysVal < 31) continue;

            // Aggregate Summary Figures
            $summary['total_receivables'] += $outstanding;
            $summary['total_customers']++;

            if ($statusCode === 'upcoming') {
                $summary['upcoming_amount'] += $outstanding;
                $summary['upcoming_count']++;
            } elseif ($statusCode === 'due_today') {
                $summary['due_today_amount'] += $outstanding;
                $summary['due_today_count']++;
            } elseif ($statusCode === 'overdue') {
                $summary['overdue_amount'] += $outstanding;
                $summary['overdue_count']++;
            }

            if ($qualifyingPaidAmount > 0 && $outstanding > 0) {
                $summary['partially_paid_amount'] += $qualifyingPaidAmount;
                $summary['partially_paid_count']++;
            }

            $contact = $cust['mobile'] ?: ($cust['telephone'] ?: '');

            $records[] = [
                'customer_id' => $coaId,
                'customer_code' => $cust['code'],
                'customer_name' => $cust['customer_name'],
                'contact_no' => $contact,
                'address' => $cust['address'] ?? '',
                'credit_days' => $creditDays,
                'cycle_start_date' => $cycleStartDate,
                'due_date' => $dueDateStr,
                'due_date_formatted' => date('d-M-Y', $dueTimestamp),
                'total_balance' => round($totalBalance, 2),
                'paid_amount' => round($qualifyingPaidAmount, 2),
                'outstanding' => round($outstanding, 2),
                'overdue_days' => $overdueDisplay,
                'overdue_days_num' => $overdueDaysVal,
                'status_text' => $statusText,
                'status_code' => $statusCode,
                'last_follow' => $lastFollow
            ];
        }

        echo json_encode([
            'status' => 'success',
            'records' => $records,
            'summary' => $summary
        ]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 3. RECORD FOLLOW-UP / LOG REMINDER
// =========================================================================
if ($action === 'save_follow_up') {
    $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $customer_coa_id = intval($data['customer_coa_id'] ?? 0);

    if (!$customer_coa_id) {
        echo json_encode(['status' => 'error', 'error' => 'Customer is required']);
        exit;
    }

    $eventType = trim($data['event_type'] ?? 'Payment Reminder');
    $promisedDate = !empty($data['promised_date']) ? $data['promised_date'] : null;
    $promisedAmount = floatval($data['promised_amount'] ?? 0);
    $responseType = trim($data['response_type'] ?? '');
    $remarks = trim($data['remarks'] ?? '');
    $nextDate = !empty($data['next_follow_up_date']) ? $data['next_follow_up_date'] : null;
    $followStatus = trim($data['status'] ?? 'Pending');

    try {
        $stmtMax = $pdo->prepare("SELECT COALESCE(MAX(serial_no), 0) + 1 FROM customer_follow_ups WHERE company_id = ?");
        $stmtMax->execute([$company_id]);
        $sNo = $stmtMax->fetchColumn();

        $stmtIns = $pdo->prepare("
            INSERT INTO customer_follow_ups (
                company_id, serial_no, date, event_type, customer_coa_id,
                promised_date, promised_amount, response_type, remarks,
                next_follow_up_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmtIns->execute([
            $company_id, $sNo, date('Y-m-d'), $eventType, $customer_coa_id,
            $promisedDate, $promisedAmount, $responseType, $remarks,
            $nextDate, $followStatus
        ]);

        echo json_encode(['status' => 'success', 'message' => 'Follow-up recorded successfully']);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['status' => 'error', 'error' => 'Invalid action']);

