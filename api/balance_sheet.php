<?php
header('Content-Type: application/json; charset=utf-8');
require_once 'db_config.php';
require_once 'account_ledger.php';

try {
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    $company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

    // =========================================================================
    // ACTION: DIAGNOSE IMBALANCE (Difference Diagnostic Tool)
    // =========================================================================
    if ($action === 'diagnose_imbalance') {
        $as_on_date = $_GET['as_on_date'] ?? date('Y-m-d');
        $voucher_status = $_GET['voucher_status'] ?? 'posted';

        $issues = [];
        $recommendations = [];

        // 1. Check Opening Balances Equivalence
        $obTotalDeb = 0;
        $obTotalCrd = 0;
        $obDiff = 0;
        $obCount = 0;
        try {
            $stmtOB = $pdo->prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(debit), 0) as tot_deb, COALESCE(SUM(credit), 0) as tot_crd FROM coa_opening_balances WHERE company_id = ?");
            $stmtOB->execute([$company_id]);
            $obRow = $stmtOB->fetch(PDO::FETCH_ASSOC);
            $obCount = intval($obRow['cnt'] ?? 0);
            $obTotalDeb = floatval($obRow['tot_deb'] ?? 0);
            $obTotalCrd = floatval($obRow['tot_crd'] ?? 0);
            $obDiff = round($obTotalDeb - $obTotalCrd, 2);

            if (abs($obDiff) > 0.01) {
                $issues[] = [
                    'severity' => 'critical',
                    'category' => 'Opening Balances',
                    'title' => 'Opening Balances Imbalance Detected',
                    'diff' => $obDiff,
                    'details' => "Total Opening Debits (Rs. " . number_format($obTotalDeb, 2) . ") do not match Total Opening Credits (Rs. " . number_format($obTotalCrd, 2) . "). Difference is Rs. " . number_format(abs($obDiff), 2) . " (" . ($obDiff > 0 ? "Debit Heavy" : "Credit Heavy") . ").",
                    'recommendation' => "In accounting double-entry, Opening Balances must balance to 0. Add or adjust the balancing entry in 'Owner\'s Capital / Equity' (3100xxx) under Maintain > Opening Balances so Debit = Credit."
                ];
            }
        } catch (Exception $e) {}

        // 2. Scan General Journal Vouchers for Single-Sided or Unbalanced Entries
        $unbalancedJVs = [];
        try {
            $jvSql = "
                SELECT 
                    v.id, v.serial_no, v.voucher_date, 
                    COALESCE(NULLIF(TRIM(v.description),''), TRIM(v.remarks), 'No description') as description,
                    COALESCE(SUM(i.debit), 0) as tot_deb,
                    COALESCE(SUM(i.credit), 0) as tot_crd,
                    ROUND(COALESCE(SUM(i.debit), 0) - COALESCE(SUM(i.credit), 0), 2) as diff
                FROM general_journal_vouchers v
                LEFT JOIN general_journal_voucher_items i ON i.voucher_id = v.id
                WHERE v.company_id = ? AND v.is_cancelled = 0 " . ($voucher_status === 'posted' ? "AND v.is_posted = 1" : "") . "
                GROUP BY v.id
                HAVING ABS(diff) > 0.01
                ORDER BY v.voucher_date DESC
                LIMIT 50
            ";
            $stmtJV = $pdo->prepare($jvSql);
            $stmtJV->execute([$company_id]);
            $unbalancedJVs = $stmtJV->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($unbalancedJVs)) {
                $issues[] = [
                    'severity' => 'critical',
                    'category' => 'General Journal Vouchers',
                    'title' => count($unbalancedJVs) . ' Unbalanced Journal Voucher(s) Found',
                    'diff' => array_sum(array_column($unbalancedJVs, 'diff')),
                    'details' => "Some Journal Vouchers have unequal debits and credits.",
                    'recommendation' => "Open and correct the listed Journal Vouchers so each voucher balances."
                ];
            }
        } catch (Exception $e) {}

        // 3. Scan Unposted (Draft) Vouchers
        $unpostedVouchers = [];
        $checkTables = [
            'general_journal_vouchers' => 'Journal Vouchers',
            'cash_payments' => 'Cash Payments',
            'cash_receipts' => 'Cash Receipts',
            'bank_payments' => 'Bank Payments',
            'bank_receipts' => 'Bank Receipts',
            'sale_invoices' => 'Sale Invoices',
            'purchase_invoices' => 'Purchase Invoices'
        ];
        foreach ($checkTables as $tbl => $lbl) {
            try {
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM $tbl WHERE company_id = ? AND is_cancelled = 0 AND (is_posted = 0 OR is_posted IS NULL)");
                $cntStmt->execute([$company_id]);
                $cnt = intval($cntStmt->fetchColumn() ?: 0);
                if ($cnt > 0) {
                    $unpostedVouchers[] = ['type' => $lbl, 'count' => $cnt];
                }
            } catch (Exception $e) {}
        }
        if (!empty($unpostedVouchers) && $voucher_status === 'posted') {
            $totUnposted = array_sum(array_column($unpostedVouchers, 'count'));
            $issues[] = [
                'severity' => 'warning',
                'category' => 'Unposted Vouchers',
                'title' => "$totUnposted Draft/Unposted Voucher(s) Omitted",
                'diff' => 0,
                'details' => "Currently running in 'Posted Only' mode. Draft transactions are excluded from Balance Sheet totals.",
                'recommendation' => "If these vouchers belong to this period, review and post them, or switch filter to 'Include Drafts'."
            ];
        }

        // 4. Scan Active Suspense Accounts
        $suspenseActive = [];
        try {
            $stmtSusp = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name
                FROM coa_list cl
                LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
                LEFT JOIN coa_main cm ON cs.main_id = cm.id
                WHERE cl.company_id = ? 
                  AND (LOWER(cl.name) LIKE '%suspense%' OR LOWER(cm.name) LIKE '%suspense%')
            ");
            $stmtSusp->execute([$company_id]);
            $suspAccounts = $stmtSusp->fetchAll(PDO::FETCH_ASSOC);

            foreach ($suspAccounts as $sa) {
                $txs = fetchLedgerTransactions($pdo, $company_id, intval($sa['id']), '1970-01-01', $as_on_date);
                $d = 0; $c = 0;
                foreach ($txs as $t) { $d += floatval($t['debit'] ?? 0); $c += floatval($t['credit'] ?? 0); }
                $bal = $d - $c;
                if (abs($bal) > 0.01) {
                    $suspenseActive[] = [
                        'code' => $sa['code'],
                        'name' => $sa['name'],
                        'balance' => round($bal, 2)
                    ];
                }
            }
            if (!empty($suspenseActive)) {
                $issues[] = [
                    'severity' => 'warning',
                    'category' => 'Suspense Accounts',
                    'title' => count($suspenseActive) . ' Active Suspense Account(s)',
                    'diff' => array_sum(array_column($suspenseActive, 'balance')),
                    'details' => "Suspense accounts have open balances that have not been reconciled into permanent accounts.",
                    'recommendation' => "Reclassify suspense ledger entries to their respective ledger heads before period-end audit."
                ];
            }
        } catch (Exception $e) {}

        // 5. Check Owner's Capital Setup
        $capitalBalance = 0;
        try {
            $stmtCap = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name
                FROM coa_list cl
                LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
                LEFT JOIN coa_main cm ON cs.main_id = cm.id
                WHERE cl.company_id = ? 
                  AND (LOWER(cm.name) LIKE '%equity%' OR LOWER(cm.name) LIKE '%capital%' OR LOWER(cl.name) LIKE '%capital%')
                  AND LOWER(cl.name) NOT LIKE '%drawing%'
            ");
            $stmtCap->execute([$company_id]);
            $capAccs = $stmtCap->fetchAll(PDO::FETCH_ASSOC);
            foreach ($capAccs as $ca) {
                $txs = fetchLedgerTransactions($pdo, $company_id, intval($ca['id']), '1970-01-01', $as_on_date);
                $d = 0; $c = 0;
                foreach ($txs as $t) { $d += floatval($t['debit'] ?? 0); $c += floatval($t['credit'] ?? 0); }
                $capitalBalance += ($c - $d);
            }
            if (abs($capitalBalance) < 0.01 && abs($obDiff) > 0.01) {
                $issues[] = [
                    'severity' => 'info',
                    'category' => "Owner's Capital",
                    'title' => "Owner's Capital is Rs. 0",
                    'diff' => $obDiff,
                    'details' => "Your business has assets and liabilities, but Owner's Capital is recorded as Rs. 0. This explains why Owner's Equity is negative and the Balance Sheet is out of balance by exactly the opening balance difference (Rs. " . number_format(abs($obDiff), 2) . ").",
                    'recommendation' => "Setting Owner's Capital in Opening Balances to Rs. " . number_format(abs($obDiff), 2) . " will immediately balance the Balance Sheet!"
                ];
            }
        } catch (Exception $e) {}

        sendResponse([
            'status' => 'success',
            'as_on_date' => $as_on_date,
            'summary' => [
                'opening_total_debit' => round($obTotalDeb, 2),
                'opening_total_credit' => round($obTotalCrd, 2),
                'opening_diff' => $obDiff,
                'opening_count' => $obCount,
                'unbalanced_jvs_count' => count($unbalancedJVs),
                'unposted_vouchers' => $unpostedVouchers,
                'suspense_count' => count($suspenseActive),
                'capital_balance' => round($capitalBalance, 2)
            ],
            'issues' => $issues,
            'unbalanced_jvs' => $unbalancedJVs,
            'suspense_active' => $suspenseActive
        ]);
    }

    // =========================================================================
    // HELPER: FIFO AGING BUCKETS CALCULATION (Feature 4)
    // =========================================================================
    function computeFifoAging($txs, $as_on_date, $balance, $isDebtor = true) {
        if ($balance <= 0.01) {
            return ['d0_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'status' => 'cleared'];
        }
        $asOnTs = strtotime($as_on_date);
        $b0_30 = 0; $b31_60 = 0; $b61_90 = 0; $b90_plus = 0;

        $entries = [];
        if (!empty($txs)) {
            foreach ($txs as $t) {
                $val = $isDebtor ? floatval($t['debit'] ?? 0) : floatval($t['credit'] ?? 0);
                if ($val > 0.01) {
                    $tDate = $t['date'] ?? $as_on_date;
                    $ts = strtotime($tDate);
                    $days = max(0, round(($asOnTs - $ts) / 86400));
                    $entries[] = ['days' => $days, 'amount' => $val];
                }
            }
        }
        // Most recent entries first
        usort($entries, function($a, $b) { return $a['days'] <=> $b['days']; });

        $rem = $balance;
        foreach ($entries as $e) {
            if ($rem <= 0) break;
            $take = min($rem, $e['amount']);
            if ($e['days'] <= 30) {
                $b0_30 += $take;
            } else if ($e['days'] <= 60) {
                $b31_60 += $take;
            } else if ($e['days'] <= 90) {
                $b61_90 += $take;
            } else {
                $b90_plus += $take;
            }
            $rem -= $take;
        }
        if ($rem > 0) {
            $b90_plus += $rem;
        }

        $status = 'current';
        if ($b90_plus > 0.5 * $balance) {
            $status = 'critical'; // >50% older than 90 days
        } else if (($b31_60 + $b61_90 + $b90_plus) > 0.4 * $balance) {
            $status = 'overdue'; // Significant portion >30 days
        }

        return [
            'd0_30' => round($b0_30, 2),
            'd31_60' => round($b31_60, 2),
            'd61_90' => round($b61_90, 2),
            'd90_plus' => round($b90_plus, 2),
            'status' => $status
        ];
    }

    // =========================================================================
    // ACTION: GET ACCOUNT LEDGER MINI (Feature 1: Drill-Down Khata)
    // =========================================================================
    if ($action === 'get_account_ledger_mini') {
        $coa_id = intval($_GET['coa_id'] ?? 0);
        $as_on_date = $_GET['as_on_date'] ?? date('Y-m-d');
        $from_date = $_GET['from_date'] ?? '1970-01-01';

        // Account Details
        $stmtAcc = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, COALESCE(cm.name, '') as main_name, 
                   COALESCE(cs.name, '') as sub_name, COALESCE(cm.component, '') as component
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.id = ? AND cl.company_id = ?
        ");
        $stmtAcc->execute([$coa_id, $company_id]);
        $accInfo = $stmtAcc->fetch(PDO::FETCH_ASSOC);

        if (!$accInfo) {
            sendResponse(['status' => 'error', 'error' => 'Account not found in Chart of Accounts'], 404);
        }

        $compLower = strtolower($accInfo['component'] ?? '');
        $isDebitNormal = in_array($compLower, ['asset', 'expense', 'cost of sale', 'cost of sales']);

        // Fetch Transactions
        $txs = fetchLedgerTransactions($pdo, $company_id, $coa_id, $from_date, $as_on_date);

        $runningBalance = 0;
        $totalDebit = 0;
        $totalCredit = 0;
        $formattedTxs = [];

        foreach ($txs as $t) {
            $deb = floatval($t['debit'] ?? 0);
            $crd = floatval($t['credit'] ?? 0);
            $totalDebit += $deb;
            $totalCredit += $crd;

            if ($isDebitNormal) {
                $runningBalance += ($deb - $crd);
            } else {
                $runningBalance += ($crd - $deb);
            }

            $formattedTxs[] = [
                'date' => $t['date'] ?? '',
                'date_formatted' => !empty($t['date']) ? date('d-M-Y', strtotime($t['date'])) : '',
                'type' => $t['source_type'] ?? 'JV',
                'tran_no' => $t['tran_no'] ?? '',
                'reference' => $t['reference'] ?? '',
                'description' => !empty(trim($t['description'] ?? '')) ? trim($t['description']) : ($t['reference'] ?: 'Ledger entry'),
                'debit' => round($deb, 2),
                'credit' => round($crd, 2),
                'balance' => round($runningBalance, 2)
            ];
        }

        sendResponse([
            'status' => 'success',
            'account' => $accInfo,
            'as_on_date' => $as_on_date,
            'as_on_date_formatted' => date('d-M-Y', strtotime($as_on_date)),
            'is_debit_normal' => $isDebitNormal,
            'total_debit' => round($totalDebit, 2),
            'total_credit' => round($totalCredit, 2),
            'closing_balance' => round($runningBalance, 2),
            'transaction_count' => count($formattedTxs),
            'transactions' => $formattedTxs
        ]);
    }

    // =========================================================================
    // ACTION: GET CLOSING PREVIEW (Feature 6: Financial Year Closing Wizard)
    // =========================================================================
    if ($action === 'get_closing_preview') {
        $closing_date = $_GET['closing_date'] ?? date('Y-06-30');
        $yr = date('Y', strtotime($closing_date));

        // 1. Calculate P&L Net Profit up to closing_date
        $sqlPL = "
            SELECT 
                cl.id, cl.code, cl.name, 
                COALESCE(cm.name, '') as main_name, 
                COALESCE(cm.component, '') as main_component
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ?
        ";
        $stmtPL = $pdo->prepare($sqlPL);
        $stmtPL->execute([$company_id]);
        $plAccs = $stmtPL->fetchAll(PDO::FETCH_ASSOC);

        $totRev = 0; $totCos = 0; $totExp = 0;
        foreach ($plAccs as $acc) {
            $mComp = strtolower(trim($acc['main_component']));
            $mName = strtolower($acc['main_name']);

            $isRev = ($mComp === 'revenue' || strpos($mName, 'revenue') !== false || strpos($mName, 'sales') !== false || strpos($mName, 'income') !== false);
            $isCos = ($mComp === 'cost of sale' || $mComp === 'cost of sales' || strpos($mName, 'cost of sale') !== false || strpos($mName, 'cogs') !== false);
            $isExp = ($mComp === 'expense' || strpos($mName, 'expense') !== false || strpos($mName, 'administrative') !== false || strpos($mName, 'selling') !== false || strpos($mName, 'financial') !== false || strpos($mName, 'taxation') !== false);

            if (!$isRev && !$isCos && !$isExp) continue;

            $txs = fetchLedgerTransactions($pdo, $company_id, intval($acc['id']), '1970-01-01', $closing_date);
            $d = 0; $c = 0;
            foreach ($txs as $t) { $d += floatval($t['debit'] ?? 0); $c += floatval($t['credit'] ?? 0); }

            if ($isRev) $totRev += ($c - $d);
            else if ($isCos) $totCos += ($d - $c);
            else if ($isExp) $totExp += ($d - $c);
        }

        $netProfit = $totRev - ($totCos + $totExp);

        // 2. Check if Year Closing JV already exists around this date
        $stmtClosed = $pdo->prepare("
            SELECT id, serial_no, voucher_date, description 
            FROM general_journal_vouchers 
            WHERE company_id = ? AND voucher_date = ? AND is_cancelled = 0 
              AND (description LIKE '%Year End Closing%' OR description LIKE '%Closing Entry%' OR description LIKE '%Fiscal Year%')
            ORDER BY id DESC LIMIT 1
        ");
        $stmtClosed->execute([$company_id, $closing_date]);
        $existingClosing = $stmtClosed->fetch(PDO::FETCH_ASSOC);

        // 3. Find or suggest Retained Earnings account
        $stmtRet = $pdo->prepare("
            SELECT id, code, name 
            FROM coa_list 
            WHERE company_id = ? AND (code = '3200001' OR LOWER(name) LIKE '%retained%')
            ORDER BY id ASC LIMIT 1
        ");
        $stmtRet->execute([$company_id]);
        $retainedAcc = $stmtRet->fetch(PDO::FETCH_ASSOC);

        sendResponse([
            'status' => 'success',
            'closing_date' => $closing_date,
            'closing_date_formatted' => date('d-M-Y', strtotime($closing_date)),
            'total_revenue' => round($totRev, 2),
            'total_cost_of_sales' => round($totCos, 2),
            'total_operating_expenses' => round($totExp, 2),
            'net_profit' => round($netProfit, 2),
            'is_profit' => ($netProfit >= 0),
            'retained_earnings_account' => $retainedAcc,
            'existing_closing' => $existingClosing,
            'is_already_closed' => !empty($existingClosing)
        ]);
    }

    // =========================================================================
    // ACTION: EXECUTE YEAR CLOSING (Feature 6: Post Retained Earnings JV)
    // =========================================================================
    if ($action === 'execute_year_closing') {
        $closing_date = $_POST['closing_date'] ?? date('Y-06-30');
        $net_profit = floatval($_POST['net_profit'] ?? 0);

        if (abs($net_profit) < 0.01) {
            sendResponse(['status' => 'error', 'error' => 'Net profit is Rs. 0.00. No closing entry required.'], 400);
        }

        // 1. Find or create Retained Earnings Account
        $stmtRet = $pdo->prepare("SELECT id, code, name FROM coa_list WHERE company_id = ? AND (code = '3200001' OR LOWER(name) LIKE '%retained%') LIMIT 1");
        $stmtRet->execute([$company_id]);
        $retainedAcc = $stmtRet->fetch(PDO::FETCH_ASSOC);

        if (!$retainedAcc) {
            // Find an Equity Sub ID
            $stmtSub = $pdo->prepare("
                SELECT cs.id 
                FROM coa_sub cs 
                JOIN coa_main cm ON cs.main_id = cm.id 
                WHERE cs.company_id = ? AND (LOWER(cm.name) LIKE '%equity%' OR LOWER(cs.name) LIKE '%equity%' OR LOWER(cs.name) LIKE '%capital%') 
                LIMIT 1
            ");
            $stmtSub->execute([$company_id]);
            $subId = $stmtSub->fetchColumn();
            if (!$subId) {
                $subId = $pdo->query("SELECT id FROM coa_sub ORDER BY id ASC LIMIT 1")->fetchColumn();
            }

            $insCoa = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name, is_active) VALUES (?, ?, '3200001', 'Retained Earnings / Unappropriated Profit', 1)");
            $insCoa->execute([$company_id, $subId]);
            $retainedId = $pdo->lastInsertId();
            $retainedCode = '3200001';
            $retainedName = 'Retained Earnings / Unappropriated Profit';
        } else {
            $retainedId = intval($retainedAcc['id']);
            $retainedCode = $retainedAcc['code'];
            $retainedName = $retainedAcc['name'];
        }

        // 2. Find or create P&L Summary Clearing Account (3300001)
        $stmtPlClear = $pdo->prepare("SELECT id FROM coa_list WHERE company_id = ? AND (code = '3300001' OR LOWER(name) LIKE '%profit & loss clearing%' OR LOWER(name) LIKE '%p&l summary%') LIMIT 1");
        $stmtPlClear->execute([$company_id]);
        $plClearId = $stmtPlClear->fetchColumn();

        if (!$plClearId) {
            $stmtSub = $pdo->prepare("SELECT cs.id FROM coa_sub cs JOIN coa_main cm ON cs.main_id = cm.id WHERE cs.company_id = ? AND LOWER(cm.name) LIKE '%equity%' LIMIT 1");
            $stmtSub->execute([$company_id]);
            $subId = $stmtSub->fetchColumn() ?: 1;

            $insClear = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name, is_active) VALUES (?, ?, '3300001', 'Profit & Loss Summary Clearing', 1)");
            $insClear->execute([$company_id, $subId]);
            $plClearId = $pdo->lastInsertId();
        }

        // 3. Get Next Serial Number for Journal Voucher
        $stmtSn = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM general_journal_vouchers WHERE company_id = ?");
        $stmtSn->execute([$company_id]);
        $snRow = $stmtSn->fetch(PDO::FETCH_ASSOC);
        $nextSn = intval($snRow['max_sn'] ?? 0) + 1;

        $desc = "Financial Year Closing Entry as of " . date('d-M-Y', strtotime($closing_date)) . " - Net Profit of Rs. " . number_format(abs($net_profit), 2) . " rolled forward to Retained Earnings.";

        // 4. Create General Journal Voucher
        $stmtJV = $pdo->prepare("
            INSERT INTO general_journal_vouchers (company_id, serial_no, voucher_date, description, is_posted, is_cancelled, created_at)
            VALUES (?, ?, ?, ?, 1, 0, NOW())
        ");
        $stmtJV->execute([$company_id, $nextSn, $closing_date, $desc]);
        $voucherId = $pdo->lastInsertId();

        // 5. Insert Voucher Items (Balanced Double-Entry)
        $absProfit = abs($net_profit);
        $stmtItem = $pdo->prepare("
            INSERT INTO general_journal_voucher_items (voucher_id, coa_id, description, debit, credit)
            VALUES (?, ?, ?, ?, ?)
        ");

        if ($net_profit > 0) {
            // Profit: Debit P&L Clearing, Credit Retained Earnings
            $stmtItem->execute([$voucherId, $plClearId, "Close Net Profit to Retained Earnings", $absProfit, 0]);
            $stmtItem->execute([$voucherId, $retainedId, "Net Profit for Year ended " . date('d-M-Y', strtotime($closing_date)), 0, $absProfit]);
        } else {
            // Loss: Debit Retained Earnings, Credit P&L Clearing
            $stmtItem->execute([$voucherId, $retainedId, "Net Loss for Year ended " . date('d-M-Y', strtotime($closing_date)), $absProfit, 0]);
            $stmtItem->execute([$voucherId, $plClearId, "Close Net Loss from P&L", 0, $absProfit]);
        }

        sendResponse([
            'status' => 'success',
            'message' => "Financial Year Closing successfully completed! Journal Voucher JV-{$nextSn} posted.",
            'voucher_id' => $voucherId,
            'serial_no' => $nextSn,
            'closing_date' => $closing_date,
            'net_profit' => round($net_profit, 2)
        ]);
    }

    // =========================================================================
    // ACTION: GET BALANCE SHEET
    // =========================================================================
    if ($action === 'get_balance_sheet' || $action === 'get_sheet') {
        $as_on_date = $_GET['as_on_date'] ?? $_GET['on_date'] ?? date('Y-m-d');
        $comparative_date = $_GET['comparative_date'] ?? null;
        $voucher_status = $_GET['voucher_status'] ?? 'posted'; // 'posted' or 'all'
        $smart_reclass = isset($_GET['smart_reclass']) ? intval($_GET['smart_reclass']) : 1; // 1 = ON (Default)

        // Company Profile
        $companyProfile = [];
        try {
            $cStmt = $pdo->prepare("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies WHERE id = ?");
            $cStmt->execute([$company_id]);
            $companyProfile = $cStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            if (empty($companyProfile)) {
                $companyProfile = $pdo->query("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies ORDER BY id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: [];
            }
        } catch (Exception $e) {}

        // Fetch all Chart of Accounts items
        $sql = "
            SELECT 
                cl.id, cl.code, cl.name, 
                COALESCE(cm.name, 'Uncategorized') as main_name, 
                COALESCE(cm.component, '') as main_component,
                COALESCE(cs.name, cl.name) as sub_name
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ?
            ORDER BY cl.code ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Buckets for Balance Sheet
        $nonCurrentAssets = [];
        $currentAssets = [];
        $nonCurrentLiabilities = [];
        $currentLiabilities = [];
        $ownerEquity = [];

        // Track subledger figures for Financial Ratios
        $ratioCashAndBank = 0;
        $ratioTradeReceivables = 0;
        $ratioTradePayables = 0;

        // P&L accumulators to derive live Net Income / Retained Earnings
        $totalRevenue = 0;
        $totalCostOfSales = 0;
        $totalOperatingExpenses = 0;

        $compTotalRevenue = 0;
        $compTotalCostOfSales = 0;
        $compTotalOperatingExpenses = 0;

        // Trial Balance validation totals
        $tbTotalDebit = 0;
        $tbTotalCredit = 0;

        // Suspense account detection
        $suspenseWarnings = [];

        // Capital detection
        $ownerCapitalTotal = 0;

        foreach ($accounts as $acc) {
            $accId = intval($acc['id']);
            $code = $acc['code'];
            $name = $acc['name'];
            $mainName = $acc['main_name'];
            $mainComponent = strtolower(trim($acc['main_component']));
            $subName = $acc['sub_name'];

            // Calculate balance as of $as_on_date
            $txs = fetchLedgerTransactions($pdo, $company_id, $accId, '1970-01-01', $as_on_date);
            $debit = 0;
            $credit = 0;
            if (!empty($txs)) {
                foreach ($txs as $tx) {
                    $debit += floatval($tx['debit'] ?? 0);
                    $credit += floatval($tx['credit'] ?? 0);
                }
            }

            $tbTotalDebit += $debit;
            $tbTotalCredit += $credit;

            $netBalance = $debit - $credit; // Debit is positive, Credit is negative

            // Calculate comparative balance if requested
            $compNetBalance = 0;
            if ($comparative_date) {
                $compTxs = fetchLedgerTransactions($pdo, $company_id, $accId, '1970-01-01', $comparative_date);
                $compDebit = 0;
                $compCredit = 0;
                if (!empty($compTxs)) {
                    foreach ($compTxs as $ctx) {
                        $compDebit += floatval($ctx['debit'] ?? 0);
                        $compCredit += floatval($ctx['credit'] ?? 0);
                    }
                }
                $compNetBalance = $compDebit - $compCredit;
            }

            // Check Suspense accounts
            $nameLower = strtolower($name);
            $mainLower = strtolower($mainName);
            if (strpos($nameLower, 'suspense') !== false || strpos($mainLower, 'suspense') !== false) {
                if (abs($netBalance) > 0.01) {
                    $suspenseWarnings[] = [
                        'code' => $code,
                        'name' => $name,
                        'balance' => round($netBalance, 2)
                    ];
                }
            }

            // Classification Logic
            // 1. REVENUE (P&L) -> Normal balance is Credit
            if ($mainComponent === 'revenue' || strpos($mainLower, 'revenue') !== false || strpos($mainLower, 'sales') !== false || strpos($mainLower, 'income') !== false) {
                $totalRevenue += ($credit - $debit);
                $compTotalRevenue += ($compCredit - $compDebit);
                continue;
            }

            // 2. COST OF SALES (P&L) -> Normal balance is Debit
            if ($mainComponent === 'cost of sale' || $mainComponent === 'cost of sales' || strpos($mainLower, 'cost of sale') !== false || strpos($mainLower, 'cogs') !== false) {
                $totalCostOfSales += ($debit - $credit);
                $compTotalCostOfSales += ($compDebit - $compCredit);
                continue;
            }

            // 3. OPERATING EXPENSES (P&L) -> Normal balance is Debit
            if ($mainComponent === 'expense' || strpos($mainLower, 'expense') !== false || strpos($mainLower, 'administrative') !== false || strpos($mainLower, 'selling') !== false || strpos($mainLower, 'financial') !== false || strpos($mainLower, 'taxation') !== false) {
                $totalOperatingExpenses += ($debit - $credit);
                $compTotalOperatingExpenses += ($compDebit - $compCredit);
                continue;
            }

            // 4. FIXED / NON-CURRENT ASSETS
            $isAccumDepr = (strpos($nameLower, 'accumulated depr') !== false || strpos($nameLower, 'accum depr') !== false);
            $isFixedAsset = (
                strpos($mainLower, 'fixed asset') !== false || 
                strpos($mainLower, 'non-current asset') !== false || 
                strpos($mainLower, 'plant') !== false || 
                strpos($mainLower, 'machinery') !== false || 
                strpos($mainLower, 'property') !== false || 
                strpos($mainLower, 'equipment') !== false || 
                strpos($mainLower, 'vehicle') !== false || 
                strpos($mainLower, 'building') !== false || 
                strpos($mainLower, 'mould') !== false ||
                $isAccumDepr
            );

            // 5. ASSET check
            $isAsset = ($mainComponent === 'asset' || strpos($mainLower, 'asset') !== false || strpos($mainLower, 'cash') !== false || strpos($mainLower, 'bank') !== false || strpos($mainLower, 'receivable') !== false || strpos($mainLower, 'customer') !== false || strpos($mainLower, 'inventory') !== false || strpos($mainLower, 'stock') !== false || strpos($mainLower, 'advance') !== false);

            if ($isFixedAsset || ($isAsset && (strpos($mainLower, 'fixed') !== false || strpos($subName, 'Fixed') !== false))) {
                // If contra-asset (Accumulated Depreciation), balance is Credit which reduces assets
                $val = $isAccumDepr ? -abs($credit - $debit) : $netBalance;
                $compVal = $isAccumDepr ? -abs($compCredit - $compDebit) : $compNetBalance;

                if (abs($val) > 0.01 || abs($compVal) > 0.01) {
                    $nonCurrentAssets[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'sub_head' => $subName,
                        'amount' => round($val, 2),
                        'comp_amount' => round($compVal, 2),
                        'is_contra' => $isAccumDepr,
                        'is_reclassified' => false
                    ];
                }
                continue;
            }

            if ($isAsset) {
                // Check for Negative Balances Smart Reclassification:
                // If an Asset has a credit balance (netBalance < 0):
                // e.g. Overdrawn Bank Account -> Should be Current Liability: "Bank Overdrafts"
                // e.g. Customer advance (credit customer) -> Current Liability: "Customer Advances"
                if ($smart_reclass && $netBalance < -0.01) {
                    $isBankOrCash = (strpos($nameLower, 'bank') !== false || strpos($nameLower, 'cash') !== false || strpos($subName, 'Bank') !== false || strpos($subName, 'Cash') !== false);
                    $targetSubHead = $isBankOrCash ? 'Bank Overdrafts (Credit Balances)' : 'Advances from Customers';

                    $currentLiabilities[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'sub_head' => $targetSubHead,
                        'amount' => round(abs($netBalance), 2),
                        'comp_amount' => round(abs($compNetBalance), 2),
                        'is_contra' => false,
                        'is_reclassified' => true,
                        'reclass_type' => $isBankOrCash ? 'Overdraft' : 'Customer Advance'
                    ];
                    continue;
                }

                // Normal Current Asset (Debit positive)
                if (abs($netBalance) > 0.01 || abs($compNetBalance) > 0.01) {
                    $isCustomer = (strpos($nameLower, 'customer') !== false || strpos(strtolower($subName), 'customer') !== false || strpos($mainLower, 'receivable') !== false);
                    $aging = null;
                    if ($isCustomer && $netBalance > 0.01) {
                        $aging = computeFifoAging($txs, $as_on_date, $netBalance, true);
                    }

                    $currentAssets[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'sub_head' => $subName,
                        'amount' => round($netBalance, 2),
                        'comp_amount' => round($compNetBalance, 2),
                        'is_contra' => false,
                        'is_reclassified' => false,
                        'is_customer' => $isCustomer,
                        'aging' => $aging
                    ];

                    // Track for ratios
                    if (strpos($nameLower, 'cash') !== false || strpos($nameLower, 'bank') !== false) {
                        if ($netBalance > 0) $ratioCashAndBank += $netBalance;
                    }
                    if ($isCustomer) {
                        if ($netBalance > 0) $ratioTradeReceivables += $netBalance;
                    }
                }
                continue;
            }

            // 6. LIABILITIES & EQUITY
            $isLongTermLiab = (
                strpos($mainLower, 'non-current liab') !== false || 
                strpos($mainLower, 'long term') !== false || 
                strpos($mainLower, 'term finance') !== false || 
                strpos($mainLower, 'director loan') !== false || 
                strpos($mainLower, 'loan from director') !== false
            );

            $isEquity = (
                $mainComponent === 'equity' || 
                strpos($mainLower, 'equity') !== false || 
                strpos($mainLower, 'capital') !== false || 
                strpos($mainLower, 'retained earning') !== false || 
                strpos($mainLower, 'drawing') !== false
            );

            // Liabilities & Equity have normal Credit balance (Credit - Debit is positive)
            $liabEquityVal = $credit - $debit;
            $compLiabEquityVal = $compCredit - $compDebit;

            if ($isEquity) {
                $isDrawing = (strpos($nameLower, 'drawing') !== false || strpos($mainLower, 'drawing') !== false);
                $finalEqVal = $isDrawing ? -abs($debit - $credit) : $liabEquityVal;
                $compFinalEqVal = $isDrawing ? -abs($compDebit - $compCredit) : $compLiabEquityVal;

                if (abs($finalEqVal) > 0.01 || abs($compFinalEqVal) > 0.01) {
                    $ownerEquity[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'sub_head' => $subName,
                        'amount' => round($finalEqVal, 2),
                        'comp_amount' => round($compFinalEqVal, 2),
                        'is_contra' => $isDrawing,
                        'is_reclassified' => false
                    ];

                    if (!$isDrawing && (strpos($nameLower, 'capital') !== false || strpos($subName, 'Capital') !== false)) {
                        $ownerCapitalTotal += $finalEqVal;
                    }
                }
                continue;
            }

            if ($isLongTermLiab) {
                if (abs($liabEquityVal) > 0.01 || abs($compLiabEquityVal) > 0.01) {
                    $nonCurrentLiabilities[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'sub_head' => $subName,
                        'amount' => round($liabEquityVal, 2),
                        'comp_amount' => round($compLiabEquityVal, 2),
                        'is_contra' => false,
                        'is_reclassified' => false
                    ];
                }
                continue;
            }

            // Current Liability Check:
            // If vendor/liability has net debit balance (liabEquityVal < 0, meaning we overpaid or paid advance):
            // In smart reclassification: move to Current Assets as "Advance to Suppliers / Vendors"
            if ($smart_reclass && $liabEquityVal < -0.01) {
                $currentAssets[] = [
                    'id' => $accId,
                    'code' => $code,
                    'name' => $name,
                    'sub_head' => 'Advances to Suppliers & Vendors',
                    'amount' => round(abs($liabEquityVal), 2),
                    'comp_amount' => round(abs($compLiabEquityVal), 2),
                    'is_contra' => false,
                    'is_reclassified' => true,
                    'reclass_type' => 'Advance to Supplier'
                ];
                continue;
            }

            // Normal Current Liability
            if (abs($liabEquityVal) > 0.01 || abs($compLiabEquityVal) > 0.01) {
                $isVendor = (strpos($nameLower, 'vendor') !== false || strpos(strtolower($subName), 'vendor') !== false || strpos($mainLower, 'payable') !== false);
                $aging = null;
                if ($isVendor && $liabEquityVal > 0.01) {
                    $aging = computeFifoAging($txs, $as_on_date, $liabEquityVal, false);
                }

                $currentLiabilities[] = [
                    'id' => $accId,
                    'code' => $code,
                    'name' => $name,
                    'sub_head' => $subName,
                    'amount' => round($liabEquityVal, 2),
                    'comp_amount' => round($compLiabEquityVal, 2),
                    'is_contra' => false,
                    'is_reclassified' => false,
                    'is_vendor' => $isVendor,
                    'aging' => $aging
                ];

                if ($isVendor && $liabEquityVal > 0) {
                    $ratioTradePayables += $liabEquityVal;
                }
            }
        }

        // Calculate Live Net Income (Revenue - Cost of Sales - Expenses) up to As-On-Date
        $currentPeriodNetProfit = $totalRevenue - ($totalCostOfSales + $totalOperatingExpenses);
        $compCurrentPeriodNetProfit = $compTotalRevenue - ($compTotalCostOfSales + $compTotalOperatingExpenses);

        // Inject Current Period Net Profit into Equity
        $ownerEquity[] = [
            'id' => 'net_profit',
            'code' => 'P&L',
            'name' => 'Current Period Net Profit / (Loss)',
            'sub_head' => 'Profit & Loss Statement (Live)',
            'amount' => round($currentPeriodNetProfit, 2),
            'comp_amount' => round($compCurrentPeriodNetProfit, 2),
            'is_contra' => false,
            'is_system' => true,
            'is_reclassified' => false
        ];

        // Helper to group by sub_head with Variance calculations
        $groupAccounts = function($items) {
            $groups = [];
            foreach ($items as $item) {
                $sh = $item['sub_head'] ?: 'General';
                if (!isset($groups[$sh])) {
                    $groups[$sh] = [
                        'sub_head' => $sh,
                        'total' => 0,
                        'comp_total' => 0,
                        'diff' => 0,
                        'pct' => 0,
                        'items' => []
                    ];
                }
                $amt = floatval($item['amount'] ?? 0);
                $compAmt = floatval($item['comp_amount'] ?? 0);
                $diff = round($amt - $compAmt, 2);
                $pct = (abs($compAmt) > 0.01) ? round(($diff / abs($compAmt)) * 100, 1) : 0;

                $item['diff'] = $diff;
                $item['pct'] = $pct;

                $groups[$sh]['total'] += $amt;
                $groups[$sh]['comp_total'] += $compAmt;
                $groups[$sh]['items'][] = $item;
            }

            foreach ($groups as &$g) {
                $g['total'] = round($g['total'], 2);
                $g['comp_total'] = round($g['comp_total'], 2);
                $g['diff'] = round($g['total'] - $g['comp_total'], 2);
                $g['pct'] = (abs($g['comp_total']) > 0.01) ? round(($g['diff'] / abs($g['comp_total'])) * 100, 1) : 0;
            }
            return array_values($groups);
        };

        $nonCurrentAssetsGrouped = $groupAccounts($nonCurrentAssets);
        $currentAssetsGrouped = $groupAccounts($currentAssets);
        $nonCurrentLiabilitiesGrouped = $groupAccounts($nonCurrentLiabilities);
        $currentLiabilitiesGrouped = $groupAccounts($currentLiabilities);
        $ownerEquityGrouped = $groupAccounts($ownerEquity);

        // Feature 4: Debtors & Creditors Aggregate Aging Schedule
        $debtorsAgingTotal = ['d0_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'total' => 0];
        foreach ($currentAssets as $ca) {
            if (!empty($ca['aging'])) {
                $debtorsAgingTotal['d0_30'] += $ca['aging']['d0_30'];
                $debtorsAgingTotal['d31_60'] += $ca['aging']['d31_60'];
                $debtorsAgingTotal['d61_90'] += $ca['aging']['d61_90'];
                $debtorsAgingTotal['d90_plus'] += $ca['aging']['d90_plus'];
                $debtorsAgingTotal['total'] += $ca['amount'];
            }
        }
        $debtorsAgingTotal['total'] = round($debtorsAgingTotal['total'], 2);
        $debtorsAgingTotal['current_pct'] = ($debtorsAgingTotal['total'] > 0) ? round(($debtorsAgingTotal['d0_30'] / $debtorsAgingTotal['total']) * 100, 1) : 100;
        $debtorsAgingTotal['overdue_pct'] = ($debtorsAgingTotal['total'] > 0) ? round((($debtorsAgingTotal['d31_60'] + $debtorsAgingTotal['d61_90'] + $debtorsAgingTotal['d90_plus']) / $debtorsAgingTotal['total']) * 100, 1) : 0;

        $creditorsAgingTotal = ['d0_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'total' => 0];
        foreach ($currentLiabilities as $cl) {
            if (!empty($cl['aging'])) {
                $creditorsAgingTotal['d0_30'] += $cl['aging']['d0_30'];
                $creditorsAgingTotal['d31_60'] += $cl['aging']['d31_60'];
                $creditorsAgingTotal['d61_90'] += $cl['aging']['d61_90'];
                $creditorsAgingTotal['d90_plus'] += $cl['aging']['d90_plus'];
                $creditorsAgingTotal['total'] += $cl['amount'];
            }
        }
        $creditorsAgingTotal['total'] = round($creditorsAgingTotal['total'], 2);
        $creditorsAgingTotal['current_pct'] = ($creditorsAgingTotal['total'] > 0) ? round(($creditorsAgingTotal['d0_30'] / $creditorsAgingTotal['total']) * 100, 1) : 100;
        $creditorsAgingTotal['overdue_pct'] = ($creditorsAgingTotal['total'] > 0) ? round((($creditorsAgingTotal['d31_60'] + $creditorsAgingTotal['d61_90'] + $creditorsAgingTotal['d90_plus']) / $creditorsAgingTotal['total']) * 100, 1) : 0;

        // Sum Totals
        $totNCA = array_sum(array_column($nonCurrentAssets, 'amount'));
        $totCA = array_sum(array_column($currentAssets, 'amount'));
        $totAssets = $totNCA + $totCA;

        $totNCL = array_sum(array_column($nonCurrentLiabilities, 'amount'));
        $totCL = array_sum(array_column($currentLiabilities, 'amount'));
        $totLiabilities = $totNCL + $totCL;

        $totEquity = array_sum(array_column($ownerEquity, 'amount'));
        $totLiabilitiesAndEquity = $totLiabilities + $totEquity;

        // Comparative Totals
        $compTotNCA = array_sum(array_column($nonCurrentAssets, 'comp_amount'));
        $compTotCA = array_sum(array_column($currentAssets, 'comp_amount'));
        $compTotAssets = $compTotNCA + $compTotCA;

        $compTotNCL = array_sum(array_column($nonCurrentLiabilities, 'comp_amount'));
        $compTotCL = array_sum(array_column($currentLiabilities, 'comp_amount'));
        $compTotLiabilities = $compTotNCL + $compTotCL;

        $compTotEquity = array_sum(array_column($ownerEquity, 'comp_amount'));
        $compTotLiabilitiesAndEquity = $compTotLiabilities + $compTotEquity;

        // Meezan Equilibrium Check
        $diff = round($totAssets - $totLiabilitiesAndEquity, 2);
        $isBalanced = (abs($diff) < 0.05);

        // Working Capital
        $workingCapital = $totCA - $totCL;

        // =========================================================================
        // FEATURE 3: MANUFACTURING INVENTORY 3-WAY SPLIT
        // =========================================================================
        $rawMaterialVal = 0;
        $rawMaterialCount = 0;
        $wipVal = 0;
        $finishedGoodsVal = 0;
        $finishedGoodsCount = 0;

        // Fetch Floor WIP Valuation
        try {
            $yr = intval(date('Y', strtotime($as_on_date)));
            $mo = intval(date('n', strtotime($as_on_date)));
            $stmtWip = $pdo->prepare("SELECT closing_wip_val FROM mfg_monthly_wip WHERE company_id = ? AND year = ? AND month = ?");
            $stmtWip->execute([$company_id, $yr, $mo]);
            $wipVal = floatval($stmtWip->fetchColumn() ?: 0);
            if ($wipVal == 0) {
                $stmtWipLatest = $pdo->prepare("SELECT closing_wip_val FROM mfg_monthly_wip WHERE company_id = ? ORDER BY year DESC, month DESC LIMIT 1");
                $stmtWipLatest->execute([$company_id]);
                $wipVal = floatval($stmtWipLatest->fetchColumn() ?: 0);
            }
        } catch (Exception $e) {}

        // Fetch Raw Materials and Finished Goods from inv_items
        try {
            $stmtItems = $pdo->prepare("
                SELECT 
                    i.id, i.name, i.current_stock, i.purchase_price,
                    COALESCE(i.category_type, sm.category_type, '') as cat_type,
                    COALESCE(sm.name, '') as main_cat_name
                FROM inv_items i
                LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
                LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ");
            $stmtItems->execute([$company_id]);
            $itemRows = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            foreach ($itemRows as $ir) {
                $cStock = floatval($ir['current_stock'] ?? 0);
                $pPrice = floatval($ir['purchase_price'] ?? 0);
                $itemVal = $cStock * $pPrice;

                $cType = strtolower($ir['cat_type']);
                $mName = strtolower($ir['main_cat_name']);
                $iName = strtolower($ir['name']);

                $isRaw = (strpos($cType, 'raw') !== false || strpos($mName, 'raw') !== false || strpos($iName, 'resin') !== false || strpos($iName, 'chemical') !== false || strpos($iName, 'calcium') !== false || strpos($iName, 'stabilizer') !== false);
                $isWip = (strpos($cType, 'wip') !== false || strpos($mName, 'wip') !== false || strpos($cType, 'process') !== false);

                if ($isRaw) {
                    $rawMaterialVal += $itemVal;
                    $rawMaterialCount++;
                } else if ($isWip) {
                    $wipVal += $itemVal;
                } else {
                    $finishedGoodsVal += $itemVal;
                    $finishedGoodsCount++;
                }
            }
        } catch (Exception $e) {}

        $totalInventoryStockVal = $rawMaterialVal + $wipVal + $finishedGoodsVal;

        // Cross-check GL Inventory vs Physical Stock
        $inventoryGLVal = 0;
        foreach ($currentAssets as $ca) {
            $n = strtolower($ca['name']);
            if (strpos($n, 'inventor') !== false || strpos($n, 'stock') !== false) {
                $inventoryGLVal += $ca['amount'];
            }
        }

        // =========================================================================
        // FEATURE 4: FINANCIAL HEALTH & BUSINESS RATIOS
        // =========================================================================
        $currentRatio = ($totCL > 0) ? round($totCA / $totCL, 2) : ($totCA > 0 ? 99.99 : 0);
        $quickAssets = $ratioCashAndBank + $ratioTradeReceivables;
        $quickRatio = ($totCL > 0) ? round($quickAssets / $totCL, 2) : ($quickAssets > 0 ? 99.99 : 0);
        $debtorsToCreditorsRatio = ($ratioTradePayables > 0) ? round($ratioTradeReceivables / $ratioTradePayables, 2) : ($ratioTradeReceivables > 0 ? 99.99 : 0);
        $equityRatio = ($totAssets > 0) ? round(($totEquity / $totAssets) * 100, 1) : 0;

        // Current Ratio Health Assessment
        $crStatus = 'good';
        $crBadge = 'Healthy (> 1.5)';
        if ($currentRatio < 1.0) {
            $crStatus = 'danger';
            $crBadge = 'Deficit (< 1.0)';
        } else if ($currentRatio < 1.5) {
            $crStatus = 'warning';
            $crBadge = 'Adequate (1.0 - 1.5)';
        }

        // Quick Ratio Health Assessment
        $qrStatus = ($quickRatio >= 1.0) ? 'good' : (($quickRatio >= 0.7) ? 'warning' : 'danger');

        // Response Data
        sendResponse([
            'status' => 'success',
            'company' => $companyProfile,
            'as_on_date' => $as_on_date,
            'as_on_date_formatted' => date('d-M-Y', strtotime($as_on_date)),
            'comparative_date' => $comparative_date,
            'comparative_date_formatted' => $comparative_date ? date('d-M-Y', strtotime($comparative_date)) : null,
            'voucher_status' => $voucher_status,
            'smart_reclass' => $smart_reclass,
            'kpi' => [
                'total_assets' => round($totAssets, 2),
                'comp_total_assets' => round($compTotAssets, 2),
                'comp_diff_assets' => round($totAssets - $compTotAssets, 2),
                'comp_pct_assets' => (abs($compTotAssets) > 0.01) ? round((($totAssets - $compTotAssets) / abs($compTotAssets)) * 100, 1) : 0,
                'non_current_assets' => round($totNCA, 2),
                'current_assets' => round($totCA, 2),
                'total_liabilities' => round($totLiabilities, 2),
                'comp_total_liabilities' => round($compTotLiabilities, 2),
                'non_current_liabilities' => round($totNCL, 2),
                'current_liabilities' => round($totCL, 2),
                'owner_equity' => round($totEquity, 2),
                'comp_total_equity' => round($compTotEquity, 2),
                'net_profit' => round($currentPeriodNetProfit, 2),
                'working_capital' => round($workingCapital, 2),
                'total_liabilities_and_equity' => round($totLiabilitiesAndEquity, 2),
                'difference' => $diff,
                'is_balanced' => $isBalanced
            ],
            'financial_ratios' => [
                'current_ratio' => $currentRatio,
                'current_ratio_status' => $crStatus,
                'current_ratio_badge' => $crBadge,
                'quick_ratio' => $quickRatio,
                'quick_ratio_status' => $qrStatus,
                'debtors_to_creditors_ratio' => $debtorsToCreditorsRatio,
                'equity_ratio' => $equityRatio,
                'cash_and_bank' => round($ratioCashAndBank, 2),
                'trade_receivables' => round($ratioTradeReceivables, 2),
                'trade_payables' => round($ratioTradePayables, 2)
            ],
            'debtors_aging_summary' => $debtorsAgingTotal,
            'creditors_aging_summary' => $creditorsAgingTotal,
            'inventory_3way' => [
                'raw_materials' => round($rawMaterialVal, 2),
                'raw_materials_count' => $rawMaterialCount,
                'wip' => round($wipVal, 2),
                'finished_goods' => round($finishedGoodsVal, 2),
                'finished_goods_count' => $finishedGoodsCount,
                'total_inventory' => round($totalInventoryStockVal, 2)
            ],
            'sections' => [
                'non_current_assets' => [
                    'title' => 'Non-Current Assets (Fixed Assets)',
                    'total' => round($totNCA, 2),
                    'comp_total' => round($compTotNCA, 2),
                    'diff' => round($totNCA - $compTotNCA, 2),
                    'pct' => (abs($compTotNCA) > 0.01) ? round((($totNCA - $compTotNCA) / abs($compTotNCA)) * 100, 1) : 0,
                    'groups' => $nonCurrentAssetsGrouped
                ],
                'current_assets' => [
                    'title' => 'Current Assets',
                    'total' => round($totCA, 2),
                    'comp_total' => round($compTotCA, 2),
                    'diff' => round($totCA - $compTotCA, 2),
                    'pct' => (abs($compTotCA) > 0.01) ? round((($totCA - $compTotCA) / abs($compTotCA)) * 100, 1) : 0,
                    'groups' => $currentAssetsGrouped
                ],
                'non_current_liabilities' => [
                    'title' => 'Non-Current Liabilities (Long-Term)',
                    'total' => round($totNCL, 2),
                    'comp_total' => round($compTotNCL, 2),
                    'diff' => round($totNCL - $compTotNCL, 2),
                    'pct' => (abs($compTotNCL) > 0.01) ? round((($totNCL - $compTotNCL) / abs($compTotNCL)) * 100, 1) : 0,
                    'groups' => $nonCurrentLiabilitiesGrouped
                ],
                'current_liabilities' => [
                    'title' => 'Current Liabilities',
                    'total' => round($totCL, 2),
                    'comp_total' => round($compTotCL, 2),
                    'diff' => round($totCL - $compTotCL, 2),
                    'pct' => (abs($compTotCL) > 0.01) ? round((($totCL - $compTotCL) / abs($compTotCL)) * 100, 1) : 0,
                    'groups' => $currentLiabilitiesGrouped
                ],
                'owner_equity' => [
                    'title' => "Owner's Equity & Reserves",
                    'total' => round($totEquity, 2),
                    'comp_total' => round($compTotEquity, 2),
                    'diff' => round($totEquity - $compTotEquity, 2),
                    'pct' => (abs($compTotEquity) > 0.01) ? round((($totEquity - $compTotEquity) / abs($compTotEquity)) * 100, 1) : 0,
                    'groups' => $ownerEquityGrouped,
                    'owner_capital_total' => round($ownerCapitalTotal, 2)
                ]
            ],
            'audit_checklist' => [
                'trial_balance_balanced' => (abs($tbTotalDebit - $tbTotalCredit) < 0.05),
                'trial_balance_diff' => round($tbTotalDebit - $tbTotalCredit, 2),
                'inventory_gl_val' => round($inventoryGLVal, 2),
                'inventory_stock_val' => round($totalInventoryStockVal, 2),
                'inventory_diff' => round($inventoryGLVal - $totalInventoryStockVal, 2),
                'net_profit_reconciled' => true,
                'meezan_balanced' => $isBalanced
            ],
            'suspense_warnings' => $suspenseWarnings
        ]);
    }
} catch (Exception $e) {
    sendResponse(['status' => 'error', 'error' => $e->getMessage()], 500);
}
