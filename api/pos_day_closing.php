<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Safe Error Reporting (JSON safe)
ini_set('display_errors', 0);
error_reporting(E_ALL);

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);

// Ensure required tables & columns exist safely
try {
    // 1. pos_day_closings table
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_day_closings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL DEFAULT 1,
        closing_no VARCHAR(50) NOT NULL UNIQUE,
        business_date DATE NOT NULL,
        branch_id INT DEFAULT NULL,
        branch_name VARCHAR(150) DEFAULT NULL,
        terminal_info VARCHAR(100) DEFAULT NULL,
        cashier_user_id INT DEFAULT NULL,
        cashier_name VARCHAR(150) DEFAULT NULL,
        shift_id VARCHAR(50) DEFAULT NULL,
        shift_start_time DATETIME NOT NULL,
        closing_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        shift_status ENUM('Open', 'Draft', 'Closed', 'Reopened') NOT NULL DEFAULT 'Closed',
        approval_status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Approved',
        approved_by_user_id INT DEFAULT NULL,
        approved_by_name VARCHAR(150) DEFAULT NULL,
        approved_at DATETIME DEFAULT NULL,
        
        -- Sales Summary
        total_invoices_count INT DEFAULT 0,
        gross_sales DECIMAL(15,2) DEFAULT 0,
        total_discount DECIMAL(15,2) DEFAULT 0,
        tax_amount DECIMAL(15,2) DEFAULT 0,
        net_sales DECIMAL(15,2) DEFAULT 0,
        cash_sales DECIMAL(15,2) DEFAULT 0,
        card_sales DECIMAL(15,2) DEFAULT 0,
        bank_sales DECIMAL(15,2) DEFAULT 0,
        qr_sales DECIMAL(15,2) DEFAULT 0,
        credit_sales DECIMAL(15,2) DEFAULT 0,
        other_sales DECIMAL(15,2) DEFAULT 0,

        -- Returns & Cancelled
        total_returns_count INT DEFAULT 0,
        total_returns_amount DECIMAL(15,2) DEFAULT 0,
        cash_refunds DECIMAL(15,2) DEFAULT 0,
        cancelled_invoices_count INT DEFAULT 0,
        cancelled_invoices_amount DECIMAL(15,2) DEFAULT 0,
        net_transactions_amount DECIMAL(15,2) DEFAULT 0,

        -- Cash Reconciliation
        opening_cash DECIMAL(15,2) DEFAULT 0,
        customer_dues_cash DECIMAL(15,2) DEFAULT 0,
        cash_in DECIMAL(15,2) DEFAULT 0,
        cash_out DECIMAL(15,2) DEFAULT 0,
        expected_cash DECIMAL(15,2) DEFAULT 0,
        actual_cash DECIMAL(15,2) DEFAULT 0,
        cash_difference DECIMAL(15,2) DEFAULT 0,
        cash_diff_status ENUM('Balanced', 'Short', 'Excess') DEFAULT 'Balanced',
        diff_reason VARCHAR(500) DEFAULT NULL,

        -- Hold Sales & FBR Stats
        pending_holds_count INT DEFAULT 0,
        pending_holds_amount DECIMAL(15,2) DEFAULT 0,
        fbr_submitted_count INT DEFAULT 0,
        fbr_submitted_amount DECIMAL(15,2) DEFAULT 0,
        fbr_pending_count INT DEFAULT 0,
        fbr_pending_amount DECIMAL(15,2) DEFAULT 0,
        fbr_failed_count INT DEFAULT 0,
        fbr_failed_amount DECIMAL(15,2) DEFAULT 0,

        -- Audit & Details
        closing_remarks TEXT DEFAULT NULL,
        denominations_json JSON DEFAULT NULL,
        payments_json JSON DEFAULT NULL,
        is_locked TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (closing_no),
        INDEX (business_date),
        INDEX (branch_id),
        INDEX (shift_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. pos_cash_movements table (Cash In / Cash Out during shift)
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_cash_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL DEFAULT 1,
        branch_id INT DEFAULT NULL,
        closing_id INT DEFAULT NULL,
        movement_type ENUM('Cash In', 'Cash Out') NOT NULL,
        amount DECIMAL(15,2) NOT NULL DEFAULT 0,
        movement_date DATE NOT NULL,
        movement_time TIME NOT NULL,
        reference_no VARCHAR(100) DEFAULT NULL,
        reason VARCHAR(255) NOT NULL,
        account_name VARCHAR(100) DEFAULT 'Cash In Hand',
        cashier_user_id INT DEFAULT NULL,
        cashier_name VARCHAR(150) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (branch_id),
        INDEX (movement_date),
        INDEX (closing_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

} catch (Exception $e) {
    error_log("POS Day Closing Migration Error: " . $e->getMessage());
}

// Read JSON input if sent via POST
$postData = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $postData = $decoded;
            if (empty($action) && isset($postData['action'])) {
                $action = $postData['action'];
            }
            if (isset($postData['company_id'])) {
                $company_id = intval($postData['company_id']);
            }
        }
    }
}

try {
    // -------------------------------------------------------------------------
    // ACTION: get_live_closing_summary
    // Calculates real-time transactions, cash movements, returns, and hold warnings
    // for the specified branch, cashier, and business date.
    // -------------------------------------------------------------------------
    if ($action === 'get_live_closing_summary') {
        $branch_id = !empty($_GET['branch_id']) ? intval($_GET['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $cashier_id = !empty($_GET['cashier_id']) ? intval($_GET['cashier_id']) : null;
        $business_date = trim($_GET['date'] ?? date('Y-m-d'));
        if (empty($business_date)) $business_date = date('Y-m-d');

        // 1. Get Opening Cash & Previous Shift Info
        $opening_cash = 0.00;
        $shift_start_time = $business_date . ' 00:00:00';
        $lastClosing = null;

        $lastSql = "SELECT * FROM pos_day_closings 
                    WHERE company_id = ? " . ($branch_id ? "AND branch_id = ?" : "") . "
                    ORDER BY id DESC LIMIT 1";
        $lastParams = [$company_id];
        if ($branch_id) $lastParams[] = $branch_id;
        $stmtLast = $pdo->prepare($lastSql);
        $stmtLast->execute($lastParams);
        $lastClosing = $stmtLast->fetch(PDO::FETCH_ASSOC);

        if ($lastClosing) {
            // Carry forward previous actual cash as opening cash if from same or previous day
            $opening_cash = floatval($lastClosing['actual_cash'] ?? 0);
            if ($lastClosing['business_date'] === $business_date) {
                // If closing already happened today, shift start is after that closing
                $shift_start_time = $lastClosing['closing_time'];
            }
        }

        // 2. Fetch Posted Sales Invoices
        $invWhere = ["company_id = ?", "invoice_type = 'POS'", "invoice_date = ?"];
        $invParams = [$company_id, $business_date];

        if ($branch_id) {
            $invWhere[] = "inventory_location_id = ?";
            $invParams[] = $branch_id;
        }

        $invSql = "SELECT 
            id, serial_no, pos_invoice_no, invoice_date, payment_terms,
            gross_amount, additional_discount, net_total, amount_received,
            fbr_status, is_cancelled, is_posted, created_at
            FROM sale_invoices 
            WHERE " . implode(' AND ', $invWhere);

        $stmtInv = $pdo->prepare($invSql);
        $stmtInv->execute($invParams);
        $allInvoices = $stmtInv->fetchAll(PDO::FETCH_ASSOC);

        $total_invoices_count = 0;
        $gross_sales = 0.00;
        $total_discount = 0.00;
        $tax_amount = 0.00;
        $net_sales = 0.00;

        $cash_sales = 0.00;
        $card_sales = 0.00;
        $bank_sales = 0.00;
        $qr_sales = 0.00;
        $credit_sales = 0.00;
        $other_sales = 0.00;

        $cancelled_count = 0;
        $cancelled_amount = 0.00;

        $fbr_submitted_count = 0;
        $fbr_submitted_amt = 0.00;
        $fbr_pending_count = 0;
        $fbr_pending_amt = 0.00;
        $fbr_failed_count = 0;
        $fbr_failed_amt = 0.00;

        $paymentCounts = [
            'Cash' => ['count' => 0, 'amount' => 0.00],
            'Card' => ['count' => 0, 'amount' => 0.00],
            'Bank' => ['count' => 0, 'amount' => 0.00],
            'QR' => ['count' => 0, 'amount' => 0.00],
            'Credit' => ['count' => 0, 'amount' => 0.00],
            'Other' => ['count' => 0, 'amount' => 0.00]
        ];

        foreach ($allInvoices as $inv) {
            $isCancelled = intval($inv['is_cancelled'] ?? 0) === 1;
            $isPosted = intval($inv['is_posted'] ?? 1) === 1;
            $net = floatval($inv['net_total'] ?? 0);
            $gross = floatval($inv['gross_amount'] ?? $net);
            $disc = floatval($inv['additional_discount'] ?? 0);

            if ($isCancelled) {
                $cancelled_count++;
                $cancelled_amount += $net;
                continue;
            }

            if (!$isPosted) {
                // Unposted / draft invoices are skipped from sales summary
                continue;
            }

            $total_invoices_count++;
            $gross_sales += $gross;
            $total_discount += $disc;
            $net_sales += $net;

            // Payment Term classification
            $terms = strtolower(trim($inv['payment_terms'] ?? 'cash'));
            if (strpos($terms, 'card') !== false || strpos($terms, 'debit') !== false || strpos($terms, 'credit card') !== false) {
                $card_sales += $net;
                $paymentCounts['Card']['count']++;
                $paymentCounts['Card']['amount'] += $net;
            } elseif (strpos($terms, 'bank') !== false || strpos($terms, 'online') !== false || strpos($terms, 'cheque') !== false) {
                $bank_sales += $net;
                $paymentCounts['Bank']['count']++;
                $paymentCounts['Bank']['amount'] += $net;
            } elseif (strpos($terms, 'qr') !== false || strpos($terms, 'jazz') !== false || strpos($terms, 'easypaisa') !== false) {
                $qr_sales += $net;
                $paymentCounts['QR']['count']++;
                $paymentCounts['QR']['amount'] += $net;
            } elseif (strpos($terms, 'customer credit') !== false || strpos($terms, 'ledger') !== false || strpos($terms, 'credit') !== false) {
                $credit_sales += $net;
                $paymentCounts['Credit']['count']++;
                $paymentCounts['Credit']['amount'] += $net;
            } elseif (strpos($terms, 'cash') !== false || empty($terms)) {
                $cash_sales += $net;
                $paymentCounts['Cash']['count']++;
                $paymentCounts['Cash']['amount'] += $net;
            } else {
                $other_sales += $net;
                $paymentCounts['Other']['count']++;
                $paymentCounts['Other']['amount'] += $net;
            }

            // FBR Status Breakdown
            $fbr = trim($inv['fbr_status'] ?? '');
            if (in_array($fbr, ['Submitted', 'Accepted', 'Verified'])) {
                $fbr_submitted_count++;
                $fbr_submitted_amt += $net;
            } elseif (in_array($fbr, ['Failed', 'Rejected', 'Error'])) {
                $fbr_failed_count++;
                $fbr_failed_amt += $net;
            } else {
                // Pending or Not Submitted
                $fbr_pending_count++;
                $fbr_pending_amt += $net;
            }
        }

        // Tax amount calculated as (Net Sales - (Gross Sales - Total Discount)) or 0
        $tax_amount = max(0, $net_sales - ($gross_sales - $total_discount));

        // 3. Fetch Sales Returns
        $retWhere = ["company_id = ?", "return_date = ?"];
        $retParams = [$company_id, $business_date];
        if ($branch_id) {
            $retWhere[] = "inventory_location_id = ?";
            $retParams[] = $branch_id;
        }

        $total_returns_count = 0;
        $total_returns_amount = 0.00;
        $cash_refunds = 0.00;

        try {
            $retSql = "SELECT net_total, amount_paid, payment_terms, is_cancelled, is_posted 
                       FROM sale_returns 
                       WHERE " . implode(' AND ', $retWhere);
            $stmtRet = $pdo->prepare($retSql);
            $stmtRet->execute($retParams);
            $returns = $stmtRet->fetchAll(PDO::FETCH_ASSOC);

            foreach ($returns as $ret) {
                if (intval($ret['is_cancelled'] ?? 0) === 1) continue;
                $retNet = floatval($ret['net_total'] ?? 0);
                $total_returns_count++;
                $total_returns_amount += $retNet;

                $pTerm = strtolower(trim($ret['payment_terms'] ?? ''));
                if (strpos($pTerm, 'cash') !== false || empty($pTerm)) {
                    $cash_refunds += $retNet;
                }
            }
        } catch (Exception $e) {
            // If sale_returns table query fails, continue with 0
        }

        // 4. Fetch Cash Movements (Cash In / Cash Out for today unlinked or within shift)
        $cash_in = 0.00;
        $cash_out = 0.00;
        $movements = [];

        try {
            $movWhere = ["company_id = ?", "movement_date = ?"];
            $movParams = [$company_id, $business_date];
            if ($branch_id) {
                $movWhere[] = "branch_id = ?";
                $movParams[] = $branch_id;
            }

            $movSql = "SELECT * FROM pos_cash_movements WHERE " . implode(' AND ', $movWhere) . " ORDER BY id DESC";
            $stmtMov = $pdo->prepare($movSql);
            $stmtMov->execute($movParams);
            $movements = $stmtMov->fetchAll(PDO::FETCH_ASSOC);

            foreach ($movements as $m) {
                $amt = floatval($m['amount'] ?? 0);
                if ($m['movement_type'] === 'Cash In') {
                    $cash_in += $amt;
                } elseif ($m['movement_type'] === 'Cash Out') {
                    $cash_out += $amt;
                }
            }
        } catch (Exception $e) {}

        // 5. Fetch Pending Hold Sales (Warning integration)
        $pending_holds_count = 0;
        $pending_holds_amount = 0.00;
        $pending_holds = [];

        try {
            $holdWhere = ["company_id = ?", "status = 'On Hold'"];
            $holdParams = [$company_id];
            if ($branch_id) {
                $holdWhere[] = "branch_id = ?";
                $holdParams[] = $branch_id;
            }

            $holdSql = "SELECT id, hold_no, hold_datetime, customer_name, items_count, net_total 
                        FROM pos_hold_sales 
                        WHERE " . implode(' AND ', $holdWhere) . " 
                        ORDER BY id DESC";
            $stmtHold = $pdo->prepare($holdSql);
            $stmtHold->execute($holdParams);
            $pending_holds = $stmtHold->fetchAll(PDO::FETCH_ASSOC);

            $pending_holds_count = count($pending_holds);
            foreach ($pending_holds as $ph) {
                $pending_holds_amount += floatval($ph['net_total'] ?? 0);
            }
        } catch (Exception $e) {}

        // 6. Expected Cash Calculation
        // Expected Cash = Opening Cash + Cash Sales + Other Cash In − Cash Refunds − Cash Out
        $customer_dues_cash = 0.00; // Customer dues collected in cash if any
        $expected_cash = ($opening_cash + $cash_sales + $customer_dues_cash + $cash_in) - ($cash_refunds + $cash_out);
        $net_transactions_amount = $net_sales - $total_returns_amount;

        // 7. Check if shift has already been closed for today
        $is_already_closed = false;
        $existing_closing_no = null;
        if ($lastClosing && $lastClosing['business_date'] === $business_date && $lastClosing['shift_status'] === 'Closed') {
            $is_already_closed = true;
            $existing_closing_no = $lastClosing['closing_no'];
        }

        echo json_encode([
            'status' => 'success',
            'business_date' => $business_date,
            'shift_start_time' => $shift_start_time,
            'is_already_closed' => $is_already_closed,
            'existing_closing_no' => $existing_closing_no,
            'sales_summary' => [
                'total_invoices_count' => $total_invoices_count,
                'gross_sales' => $gross_sales,
                'total_discount' => $total_discount,
                'tax_amount' => $tax_amount,
                'net_sales' => $net_sales,
                'cash_sales' => $cash_sales,
                'card_sales' => $card_sales,
                'bank_sales' => $bank_sales,
                'qr_sales' => $qr_sales,
                'credit_sales' => $credit_sales,
                'other_sales' => $other_sales,
                'cancelled_invoices_count' => $cancelled_count,
                'cancelled_invoices_amount' => $cancelled_amount,
                'total_returns_count' => $total_returns_count,
                'total_returns_amount' => $total_returns_amount,
                'cash_refunds' => $cash_refunds,
                'net_transactions_amount' => $net_transactions_amount
            ],
            'cash_reconciliation' => [
                'opening_cash' => $opening_cash,
                'cash_sales' => $cash_sales,
                'customer_dues_cash' => $customer_dues_cash,
                'cash_in' => $cash_in,
                'cash_refunds' => $cash_refunds,
                'cash_out' => $cash_out,
                'expected_cash' => $expected_cash
            ],
            'payment_breakdown' => $paymentCounts,
            'fbr_summary' => [
                'submitted_count' => $fbr_submitted_count,
                'submitted_amount' => $fbr_submitted_amt,
                'pending_count' => $fbr_pending_count,
                'pending_amount' => $fbr_pending_amt,
                'failed_count' => $fbr_failed_count,
                'failed_amount' => $fbr_failed_amt
            ],
            'pending_holds' => [
                'count' => $pending_holds_count,
                'amount' => $pending_holds_amount,
                'records' => $pending_holds
            ],
            'cash_movements' => $movements
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: record_cash_movement
    // Records quick Cash In or Cash Out during the shift.
    // -------------------------------------------------------------------------
    if ($action === 'record_cash_movement') {
        $branch_id = !empty($postData['branch_id']) ? intval($postData['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $movement_type = trim($postData['movement_type'] ?? 'Cash In');
        if (!in_array($movement_type, ['Cash In', 'Cash Out'])) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid movement type. Must be Cash In or Cash Out.']);
            exit;
        }

        $amount = floatval($postData['amount'] ?? 0);
        if ($amount <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Amount must be greater than zero.']);
            exit;
        }

        $reason = trim($postData['reason'] ?? '');
        if (empty($reason)) {
            echo json_encode(['status' => 'error', 'message' => 'Reason / Description is required.']);
            exit;
        }

        $ref_no = trim($postData['reference_no'] ?? '');
        $account_name = trim($postData['account_name'] ?? 'Cash In Hand');
        $cashier_user_id = !empty($postData['cashier_user_id']) ? intval($postData['cashier_user_id']) : null;
        $cashier_name = trim($postData['cashier_name'] ?? 'Cashier');

        $movement_date = date('Y-m-d');
        $movement_time = date('H:i:s');

        $stmt = $pdo->prepare("INSERT INTO pos_cash_movements 
            (company_id, branch_id, movement_type, amount, movement_date, movement_time, reference_no, reason, account_name, cashier_user_id, cashier_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        $stmt->execute([
            $company_id, $branch_id, $movement_type, $amount, $movement_date, $movement_time, $ref_no, $reason, $account_name, $cashier_user_id, $cashier_name
        ]);

        echo json_encode([
            'status' => 'success',
            'message' => "{$movement_type} of Rs {$amount} recorded successfully.",
            'movement_id' => $pdo->lastInsertId()
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: save_closing
    // Validates, saves day closing record, and sets shift_status = 'Closed'.
    // -------------------------------------------------------------------------
    if ($action === 'save_closing') {
        $branch_id = !empty($postData['branch_id']) ? intval($postData['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $branch_name = trim($postData['branch_name'] ?? '');
        $business_date = trim($postData['business_date'] ?? date('Y-m-d'));
        $terminal_info = trim($postData['terminal_info'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'POS-Terminal-1'));
        $cashier_user_id = !empty($postData['cashier_user_id']) ? intval($postData['cashier_user_id']) : null;
        $cashier_name = trim($postData['cashier_name'] ?? 'Cashier');
        $shift_start_time = trim($postData['shift_start_time'] ?? ($business_date . ' 00:00:00'));
        $shift_status = trim($postData['shift_status'] ?? 'Closed');
        $closing_remarks = trim($postData['closing_remarks'] ?? '');
        $diff_reason = trim($postData['diff_reason'] ?? '');
        $override_pending_holds = !empty($postData['override_pending_holds']) ? 1 : 0;

        // Sales Summary inputs
        $sales = $postData['sales_summary'] ?? [];
        $total_invoices_count = intval($sales['total_invoices_count'] ?? 0);
        $gross_sales = floatval($sales['gross_sales'] ?? 0);
        $total_discount = floatval($sales['total_discount'] ?? 0);
        $tax_amount = floatval($sales['tax_amount'] ?? 0);
        $net_sales = floatval($sales['net_sales'] ?? 0);
        $cash_sales = floatval($sales['cash_sales'] ?? 0);
        $card_sales = floatval($sales['card_sales'] ?? 0);
        $bank_sales = floatval($sales['bank_sales'] ?? 0);
        $qr_sales = floatval($sales['qr_sales'] ?? 0);
        $credit_sales = floatval($sales['credit_sales'] ?? 0);
        $other_sales = floatval($sales['other_sales'] ?? 0);
        $cancelled_count = intval($sales['cancelled_invoices_count'] ?? 0);
        $cancelled_amount = floatval($sales['cancelled_invoices_amount'] ?? 0);
        $total_returns_count = intval($sales['total_returns_count'] ?? 0);
        $total_returns_amount = floatval($sales['total_returns_amount'] ?? 0);
        $cash_refunds = floatval($sales['cash_refunds'] ?? 0);
        $net_transactions_amount = floatval($sales['net_transactions_amount'] ?? ($net_sales - $total_returns_amount));

        // Cash Reconciliation inputs
        $cash = $postData['cash_reconciliation'] ?? [];
        $opening_cash = floatval($cash['opening_cash'] ?? 0);
        $customer_dues_cash = floatval($cash['customer_dues_cash'] ?? 0);
        $cash_in = floatval($cash['cash_in'] ?? 0);
        $cash_out = floatval($cash['cash_out'] ?? 0);
        $expected_cash = floatval($cash['expected_cash'] ?? 0);
        $actual_cash = floatval($cash['actual_cash'] ?? 0);
        $cash_difference = $actual_cash - $expected_cash;

        $cash_diff_status = 'Balanced';
        if ($cash_difference < -0.01) {
            $cash_diff_status = 'Short';
        } elseif ($cash_difference > 0.01) {
            $cash_diff_status = 'Excess';
        }

        // FBR stats
        $fbr = $postData['fbr_summary'] ?? [];
        $fbr_submitted_count = intval($fbr['submitted_count'] ?? 0);
        $fbr_submitted_amount = floatval($fbr['submitted_amount'] ?? 0);
        $fbr_pending_count = intval($fbr['pending_count'] ?? 0);
        $fbr_pending_amount = floatval($fbr['pending_amount'] ?? 0);
        $fbr_failed_count = intval($fbr['failed_count'] ?? 0);
        $fbr_failed_amount = floatval($fbr['failed_amount'] ?? 0);

        // Pending Hold Sales
        $pending_holds_count = intval($postData['pending_holds_count'] ?? 0);
        $pending_holds_amount = floatval($postData['pending_holds_amount'] ?? 0);

        // Enforce Hold Policy: Warn if pending hold sales exist without explicit override
        if ($pending_holds_count > 0 && !$override_pending_holds) {
            echo json_encode([
                'status' => 'warning_pending_holds',
                'message' => "There are {$pending_holds_count} pending Hold sale(s) totaling Rs {$pending_holds_amount}. Please resolve or authorize override to close shift.",
                'pending_holds_count' => $pending_holds_count,
                'pending_holds_amount' => $pending_holds_amount
            ]);
            exit;
        }

        // Generate Closing No
        $prefix = 'CLS-';
        if ($branch_id) {
            $stmtB = $pdo->prepare("SELECT branch_code, branch_name FROM branches WHERE id = ?");
            $stmtB->execute([$branch_id]);
            $bRow = $stmtB->fetch(PDO::FETCH_ASSOC);
            if ($bRow) {
                if (empty($branch_name)) $branch_name = $bRow['branch_name'];
                if (!empty($bRow['branch_code'])) {
                    $prefix = $bRow['branch_code'] . '-CLS-';
                }
            }
        }

        $pdo->beginTransaction();

        $stmtSeq = $pdo->prepare("SELECT closing_no FROM pos_day_closings WHERE company_id = ? AND closing_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE");
        $stmtSeq->execute([$company_id, "{$prefix}%"]);
        $lastRow = $stmtSeq->fetch(PDO::FETCH_ASSOC);

        $nextNum = 1;
        if ($lastRow && !empty($lastRow['closing_no'])) {
            $parts = explode('-', $lastRow['closing_no']);
            $lastInt = intval(end($parts));
            if ($lastInt > 0) $nextNum = $lastInt + 1;
        }
        $closing_no = $prefix . str_pad($nextNum, 4, '0', STR_PAD_LEFT);
        $closing_time = date('Y-m-d H:i:s');

        $denominations_json = isset($postData['denominations']) ? json_encode($postData['denominations']) : null;
        $payments_json = isset($postData['payment_breakdown']) ? json_encode($postData['payment_breakdown']) : null;

        $stmtIns = $pdo->prepare("INSERT INTO pos_day_closings 
            (company_id, closing_no, business_date, branch_id, branch_name, terminal_info, 
             cashier_user_id, cashier_name, shift_id, shift_start_time, closing_time, 
             shift_status, approval_status, 
             total_invoices_count, gross_sales, total_discount, tax_amount, net_sales, 
             cash_sales, card_sales, bank_sales, qr_sales, credit_sales, other_sales, 
             total_returns_count, total_returns_amount, cash_refunds, 
             cancelled_invoices_count, cancelled_invoices_amount, net_transactions_amount, 
             opening_cash, customer_dues_cash, cash_in, cash_out, expected_cash, actual_cash, 
             cash_difference, cash_diff_status, diff_reason, 
             pending_holds_count, pending_holds_amount, 
             fbr_submitted_count, fbr_submitted_amount, fbr_pending_count, fbr_pending_amount, fbr_failed_count, fbr_failed_amount, 
             closing_remarks, denominations_json, payments_json) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $shift_id = 'SHIFT-' . date('Ymd') . '-' . ($cashier_user_id ?: '1');

        $stmtIns->execute([
            $company_id, $closing_no, $business_date, $branch_id, $branch_name, $terminal_info,
            $cashier_user_id, $cashier_name, $shift_id, $shift_start_time, $closing_time,
            $shift_status,
            $total_invoices_count, $gross_sales, $total_discount, $tax_amount, $net_sales,
            $cash_sales, $card_sales, $bank_sales, $qr_sales, $credit_sales, $other_sales,
            $total_returns_count, $total_returns_amount, $cash_refunds,
            $cancelled_count, $cancelled_amount, $net_transactions_amount,
            $opening_cash, $customer_dues_cash, $cash_in, $cash_out, $expected_cash, $actual_cash,
            $cash_difference, $cash_diff_status, $diff_reason,
            $pending_holds_count, $pending_holds_amount,
            $fbr_submitted_count, $fbr_submitted_amount, $fbr_pending_count, $fbr_pending_amount, $fbr_failed_count, $fbr_failed_amount,
            $closing_remarks, $denominations_json, $payments_json
        ]);

        $closing_id = $pdo->lastInsertId();

        // Link unlinked cash movements of today to this closing
        $stmtLink = $pdo->prepare("UPDATE pos_cash_movements SET closing_id = ? WHERE company_id = ? AND movement_date = ? AND closing_id IS NULL");
        $stmtLink->execute([$closing_id, $company_id, $business_date]);

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'closing_id' => $closing_id,
            'closing_no' => $closing_no,
            'closing_time' => $closing_time,
            'message' => "POS Shift Day Closing {$closing_no} successfully completed."
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: get_closings_history
    // Returns full history list of past Day Closings with filters and pagination.
    // -------------------------------------------------------------------------
    if ($action === 'get_closings_history') {
        $search = trim($_GET['search'] ?? '');
        $from_date = trim($_GET['from_date'] ?? '');
        $to_date = trim($_GET['to_date'] ?? '');
        $branch_id = !empty($_GET['branch_id']) ? intval($_GET['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $status_filter = trim($_GET['status'] ?? '');
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(5, min(200, intval($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $where = ["company_id = ?"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "branch_id = ?";
            $params[] = $branch_id;
        }

        if (!empty($status_filter) && $status_filter !== 'all') {
            $where[] = "shift_status = ?";
            $params[] = $status_filter;
        }

        if (!empty($from_date)) {
            $where[] = "business_date >= ?";
            $params[] = $from_date;
        }

        if (!empty($to_date)) {
            $where[] = "business_date <= ?";
            $params[] = $to_date;
        }

        if (!empty($search)) {
            $where[] = "(closing_no LIKE ? OR cashier_name LIKE ? OR branch_name LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $whereClause = implode(' AND ', $where);

        // Summary Stats across current filters
        $statSql = "SELECT 
            COUNT(*) as total_closings,
            COALESCE(SUM(net_sales), 0) as total_net_sales,
            COALESCE(SUM(actual_cash), 0) as total_actual_cash,
            COALESCE(SUM(cash_difference), 0) as total_cash_variance
            FROM pos_day_closings 
            WHERE $whereClause";

        $stmtStat = $pdo->prepare($statSql);
        $stmtStat->execute($params);
        $summary = $stmtStat->fetch(PDO::FETCH_ASSOC);

        // Fetch records
        $listSql = "SELECT *, 
            DATE_FORMAT(closing_time, '%d-%b-%Y %h:%i %p') as formatted_closing_time,
            DATE_FORMAT(shift_start_time, '%d-%b-%Y %h:%i %p') as formatted_shift_start
            FROM pos_day_closings 
            WHERE $whereClause 
            ORDER BY id DESC 
            LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        $totalRecords = intval($summary['total_closings'] ?? 0);
        $totalPages = ceil($totalRecords / $limit);

        echo json_encode([
            'status' => 'success',
            'summary' => $summary,
            'records' => $records,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total_records' => $totalRecords,
                'total_pages' => $totalPages
            ]
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: get_closing_details
    // Returns full record for modal preview and printing.
    // -------------------------------------------------------------------------
    if ($action === 'get_closing_details') {
        $closing_id = intval($_GET['id'] ?? 0);
        if ($closing_id <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid closing ID.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT *, 
            DATE_FORMAT(closing_time, '%d-%b-%Y %h:%i %p') as formatted_closing_time,
            DATE_FORMAT(shift_start_time, '%d-%b-%Y %h:%i %p') as formatted_shift_start
            FROM pos_day_closings 
            WHERE id = ? AND company_id = ? " . (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id']) ? " AND branch_id = " . intval($_SESSION['branch_id']) : ""));
        $stmt->execute([$closing_id, $company_id]);
        $closing = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$closing) {
            echo json_encode(['status' => 'error', 'message' => 'Closing record not found or access denied.']);
            exit;
        }

        // Decode JSON fields if present
        if (!empty($closing['denominations_json'])) {
            $closing['denominations'] = json_decode($closing['denominations_json'], true);
        }
        if (!empty($closing['payments_json'])) {
            $closing['payment_breakdown'] = json_decode($closing['payments_json'], true);
        }

        // Fetch linked cash movements
        $stmtM = $pdo->prepare("SELECT * FROM pos_cash_movements WHERE closing_id = ? ORDER BY id ASC");
        $stmtM->execute([$closing_id]);
        $closing['movements'] = $stmtM->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'closing' => $closing
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // Fallback
    // -------------------------------------------------------------------------
    echo json_encode([
        'status' => 'error',
        'message' => 'Unsupported action: ' . htmlspecialchars($action)
    ]);
    exit;

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status' => 'error',
        'message' => 'Server error: ' . $e->getMessage()
    ]);
    exit;
}
