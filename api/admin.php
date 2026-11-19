<?php
require_once 'db_config.php';
// checkAuth(); // Optional: Enable for strict security

$action = $_GET['action'] ?? '';

// Robust ID Retrieval: Prefer GET parameter, then session, then default.
$company_id = $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;

// ONE-TIME MIGRATION: Ensure 'status' column exists in companies table
try {
    // Check if column exists by attempting to fetch it (standard SQL approach for compatibility)
    $stmt = $pdo->query("SHOW COLUMNS FROM companies LIKE 'status'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN status TINYINT(1) DEFAULT 1");
    }
    
    // ONE-TIME MIGRATION: Ensure 'profile_photo' column exists in users table
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'profile_photo'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN profile_photo LONGTEXT DEFAULT NULL");
    }

    // ONE-TIME MIGRATION: Ensure 'branch_id' column exists in users table
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'branch_id'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN branch_id INT DEFAULT NULL");
    }

    // MIGRATION: Add can_edit and can_view columns to user_rights
    $stmt = $pdo->query("SHOW COLUMNS FROM user_rights LIKE 'can_edit'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE user_rights ADD COLUMN can_edit TINYINT(1) DEFAULT 0");
    }
    $stmt = $pdo->query("SHOW COLUMNS FROM user_rights LIKE 'can_view'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE user_rights ADD COLUMN can_view TINYINT(1) DEFAULT 0");
    }

    // MIGRATION: Update users role enum to Admin/User and migrate old roles
    try {
        $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('Admin', 'User', 'POS') DEFAULT 'User'");
        $pdo->exec("UPDATE users SET role = 'User' WHERE role NOT IN ('Admin', 'User', 'POS')");
    } catch (Exception $e) { /* Role enum already updated */ }
} catch (Exception $e) { /* Final migration block end */ }

// Explicitly set PDO error mode to Exception for robust error trapping
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_companies') {
        $stmt = $pdo->prepare("SELECT * FROM companies ORDER BY (id = 1) DESC, name ASC");
        $stmt->execute();
        sendResponse($stmt->fetchAll());
    }
    
    if ($action === 'get_company') {
        $stmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetch());
    }
    
    if ($action === 'get_users') {
        $stmt = $pdo->prepare("
            SELECT u.id, u.username, u.email, u.role, u.status, u.branch_id, b.branch_name, b.branch_code 
            FROM users u 
            LEFT JOIN company_branches b ON u.branch_id = b.id 
            WHERE u.company_id = ?
            ORDER BY u.id ASC
        ");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }
    
    if ($action === 'get_rights' && isset($_GET['user_id'])) {
        // First check user role
        $uStmt = $pdo->prepare("SELECT username, role FROM users WHERE id = ?");
        $uStmt->execute([$_GET['user_id']]);
        $user = $uStmt->fetch();
        
        $rights = [];
        $stmt = $pdo->prepare("SELECT * FROM user_rights WHERE user_id = ?");
        $stmt->execute([$_GET['user_id']]);
        $rights = $stmt->fetchAll();

        // Admin Override Logic: If user is Administrator or has 'Admin' role, return all as allowed
        if ($user && ($user['username'] === 'Administrator' || $user['role'] === 'Admin')) {
            // We can either return the DB ones or overwrite them on the fly
            // To be 100% sure the UI shows them as allowed, we return virtual 1s
            foreach ($rights as &$r) {
                $r['is_allowed'] = 1;
                $r['can_edit'] = 1;
                $r['can_view'] = 1;
            }
        } elseif ($user && (strtoupper($user['role']) === 'POS')) {
            // POS Role: Guarantee full permissions for POS operational modules
            $posModules = [
                'POS Sale', 'Sale',
                'POS Sales Register', 'Sales Register',
                'POS Sales Return', 'Sales Return',
                'POS Hold / Recall Register', 'POS Hold / Recall', 'Hold / Recall',
                'POS Day Closing', 'Day Closing',
                'POS Reports', 'Reports',
                'POS Dashboard', 'Dashboard'
            ];
            $existing = [];
            foreach ($rights as &$r) {
                $existing[$r['module_name']] = true;
                if (in_array($r['module_name'], $posModules)) {
                    $r['is_allowed'] = 1;
                    $r['can_edit'] = 1;
                    $r['can_view'] = 1;
                }
            }
            foreach ($posModules as $pm) {
                if (!isset($existing[$pm])) {
                    $rights[] = [
                        'user_id' => $user['id'] ?? $_GET['user_id'],
                        'module_name' => $pm,
                        'is_allowed' => 1,
                        'can_edit' => 1,
                        'can_view' => 1
                    ];
                }
            }
        }
        
        sendResponse($rights);
    }
    
    if ($action === 'get_fy') {
        $stmt = $pdo->prepare("SELECT * FROM financial_years WHERE company_id = ?");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }
    
    if ($action === 'get_currency') {
        $stmt = $pdo->prepare("SELECT * FROM currencies WHERE company_id = ?");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetch());
    }
    
    if ($action === 'get_summary') {
        require_once 'account_ledger.php';
        $summary = [
            'sales' => 0, 'cash_opening' => 0, 'cash_receipts' => 0, 'cash_payments' => 0,
            'bank_opening' => 0, 'bank_receipts' => 0, 'bank_payments' => 0,
            'bank_balance' => 0, 'rec_opening' => 0, 'rec_sales' => 0, 'rec_receipts' => 0,
            'pay_opening' => 0, 'pay_purchases' => 0, 'pay_payments' => 0, 'new_invoices' => 0,
            'customer_receipts' => 0, 'overdue' => 0, 'new_purchases' => 0, 'vendor_payments' => 0,
            'outstanding' => 0
        ];

        try {
            if (!function_exists('aggregateGroup')) {
                function aggregateGroup($pdo, $company_id, $prefix, &$opening, &$debits, &$credits, $report_date = null) {
                    $stmt = $pdo->prepare("SELECT id FROM coa_list WHERE company_id = ? AND code LIKE ?");
                    $stmt->execute([$company_id, $prefix]);
                    $accounts = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    foreach($accounts as $acc_id) {
                        $txs = fetchLedgerTransactions($pdo, $company_id, $acc_id, null, $report_date);
                        foreach($txs as $tx) {
                            if ($report_date) {
                                if ((isset($tx['is_ob']) && $tx['is_ob']) || (isset($tx['date']) && $tx['date'] < $report_date)) {
                                    $opening += ((float)$tx['debit'] - (float)$tx['credit']);
                                } else if (isset($tx['date']) && $tx['date'] == $report_date) {
                                    $debits += (float)$tx['debit'];
                                    $credits += (float)$tx['credit'];
                                }
                            } else {
                                if (isset($tx['is_ob']) && $tx['is_ob']) {
                                    $opening += ((float)$tx['debit'] - (float)$tx['credit']);
                                } else {
                                    $debits += (float)$tx['debit'];
                                    $credits += (float)$tx['credit'];
                                }
                            }
                        }
                    }
                }
            }
            $report_date = $_GET['report_date'] ?? null;

            // Cash (100...)
            aggregateGroup($pdo, $company_id, '100%', $summary['cash_opening'], $summary['cash_receipts'], $summary['cash_payments'], $report_date);
            
            // Bank (110...)
            aggregateGroup($pdo, $company_id, '110%', $summary['bank_opening'], $summary['bank_receipts'], $summary['bank_payments'], $report_date);
            $summary['bank_balance'] = $summary['bank_opening'] + $summary['bank_receipts'] - $summary['bank_payments'];
            
            // Customers (120...)
            aggregateGroup($pdo, $company_id, '120%', $summary['rec_opening'], $summary['rec_sales'], $summary['rec_receipts'], $report_date);
            
            // Vendors (210...)
            $p_op = 0;
            aggregateGroup($pdo, $company_id, '210%', $p_op, $summary['pay_payments'], $summary['pay_purchases'], $report_date);
            // Vendor OB is naturally credit, but our aggregator does debit - credit. Multiply by -1
            $summary['pay_opening'] = -$p_op;

            // Sales & New Invoices
            $bSql = "";
            $sess_role = strtoupper(trim($_GET['role'] ?? ($_SESSION['role'] ?? '')));
            $sess_branch = intval($_GET['branch_id'] ?? ($_SESSION['branch_id'] ?? 0));
            if ($sess_role === 'POS' && $sess_branch > 0) {
                $bSql = " AND inventory_location_id = " . $sess_branch;
            }
            $stmt = $pdo->prepare("SELECT SUM(CASE WHEN DATE(invoice_date) = ? THEN 1 ELSE 0 END) as new_inv, SUM(CASE WHEN DATE(invoice_date) = ? THEN net_total ELSE 0 END) as today_sales FROM sale_invoices WHERE company_id = ? AND is_cancelled = 0" . $bSql);
            $stmt->execute([$report_date ?: date('Y-m-d'), $report_date ?: date('Y-m-d'), $company_id]);
            $sRes = $stmt->fetch();
            $summary['new_invoices'] = (int)$sRes['new_inv'];

            // Purchases & New Purchases
            $stmt = $pdo->prepare("SELECT SUM(CASE WHEN DATE(invoice_date) = ? THEN 1 ELSE 0 END) as new_pur FROM purchase_invoices WHERE company_id = ? AND is_cancelled = 0");
            $stmt->execute([$report_date ?: date('Y-m-d'), $company_id]);
            $pRes = $stmt->fetch();
            $summary['new_purchases'] = (int)$pRes['new_pur'];

            // Map aliases used in the UI
            $summary['sales'] = (float)$sRes['today_sales'];
            $summary['customer_receipts'] = $summary['rec_receipts'];
            $summary['vendor_payments'] = $summary['pay_payments'];
            
            // Overdue and Outstanding 
            $summary['outstanding'] = $summary['pay_opening'] + $summary['pay_purchases'] - $summary['pay_payments'];
            $summary['overdue'] = $summary['rec_opening'] + $summary['rec_sales'] - $summary['rec_receipts'];

            $targetDate = $report_date ?: date('Y-m-d');

            // 1. POS Specific Calculations (Today)
            $posCond = "company_id = ? AND is_cancelled = 0 AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))";
            if ($sess_role === 'POS' && $sess_branch > 0) {
                $posCond .= " AND inventory_location_id = " . $sess_branch;
            }
            $stmtPos = $pdo->prepare("
                SELECT 
                    COUNT(id) as pos_inv_count,
                    COALESCE(SUM(net_total), 0) as pos_sales_total,
                    COALESCE(SUM(COALESCE(sales_tax, 0)), 0) as pos_tax_total,
                    COALESCE(SUM(CASE WHEN payment_terms = 'Cash' OR payment_terms IS NULL OR payment_terms = '' THEN net_total ELSE 0 END), 0) as pos_cash_sales,
                    COALESCE(SUM(CASE WHEN payment_terms != 'Cash' AND payment_terms IS NOT NULL AND payment_terms != '' THEN net_total ELSE 0 END), 0) as pos_card_sales
                FROM sale_invoices 
                WHERE $posCond AND DATE(invoice_date) = ?
            ");
            $stmtPos->execute([$company_id, $targetDate]);
            $posRow = $stmtPos->fetch(PDO::FETCH_ASSOC) ?: [];

            // POS Returns (Today)
            $posRetCond = "company_id = ? AND is_cancelled = 0 AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))";
            $stmtPosRet = $pdo->prepare("
                SELECT COALESCE(SUM(net_total), 0) as pos_ret_total 
                FROM sale_returns 
                WHERE $posRetCond AND DATE(return_date) = ?
            ");
            $stmtPosRet->execute([$company_id, $targetDate]);
            $posRetRow = $stmtPosRet->fetch(PDO::FETCH_ASSOC) ?: [];

            $posInvCount = intval($posRow['pos_inv_count'] ?? 0);
            $posSalesTotal = floatval($posRow['pos_sales_total'] ?? 0);
            $posCashSales = floatval($posRow['pos_cash_sales'] ?? 0);
            $posCardSales = floatval($posRow['pos_card_sales'] ?? 0);
            $posTaxTotal = floatval($posRow['pos_tax_total'] ?? 0);
            $posReturnsTotal = floatval($posRetRow['pos_ret_total'] ?? 0);
            $posNetTotal = max(0, $posSalesTotal - $posReturnsTotal);

            $summary['pos_invoices'] = $posInvCount;
            $summary['pos_sales'] = $posSalesTotal;
            $summary['pos_cash_sales'] = $posCashSales;
            $summary['pos_card_sales'] = $posCardSales;
            $summary['pos_tax_total'] = $posTaxTotal;
            $summary['pos_returns'] = $posReturnsTotal;
            $summary['pos_net_total'] = $posNetTotal;

            // 2. FBR Digital Invoicing Specific Calculations
            $hasFbrTable = false;
            try {
                $hasFbrTable = (bool)$pdo->query("SHOW TABLES LIKE 'fbr_digital_invoices'")->fetch();
            } catch (Exception $eFbr) {}

            $fbrActiveInvoices = 0;
            $fbrSalesTotal = 0.0;
            $fbrTaxTotal = 0.0;
            $fbrTaxUploaded = 0.0;
            $fbrSubmittedCount = 0;
            $fbrNotesCount = 0;

            if ($hasFbrTable) {
                $stmtFbr = $pdo->prepare("
                    SELECT 
                        COUNT(id) as total_fbr_inv,
                        COALESCE(SUM(net_payable), 0) as total_fbr_amount,
                        COALESCE(SUM(total_sales_tax), 0) as total_fbr_tax,
                        COUNT(CASE WHEN fbr_status = 'Submitted' THEN 1 END) as fbr_submitted_count,
                        COALESCE(SUM(CASE WHEN fbr_status = 'Submitted' THEN total_sales_tax ELSE 0 END), 0) as fbr_tax_uploaded
                    FROM fbr_digital_invoices 
                    WHERE company_id = ? AND is_cancelled = 0 AND (workflow_status IS NULL OR workflow_status != 'Cancelled')
                ");
                $stmtFbr->execute([$company_id]);
                $fbrRow = $stmtFbr->fetch(PDO::FETCH_ASSOC) ?: [];

                $fbrActiveInvoices = intval($fbrRow['total_fbr_inv'] ?? 0);
                $fbrSalesTotal = floatval($fbrRow['total_fbr_amount'] ?? 0);
                $fbrTaxTotal = floatval($fbrRow['total_fbr_tax'] ?? 0);
                $fbrSubmittedCount = intval($fbrRow['fbr_submitted_count'] ?? 0);
                $fbrTaxUploaded = floatval($fbrRow['fbr_tax_uploaded'] ?? 0);

                try {
                    $cnCount = 0;
                    $dnCount = 0;
                    if ($pdo->query("SHOW TABLES LIKE 'fbr_digital_credit_notes'")->fetch()) {
                        $sCn = $pdo->prepare("SELECT COUNT(id) FROM fbr_digital_credit_notes WHERE company_id = ? AND is_cancelled = 0");
                        $sCn->execute([$company_id]);
                        $cnCount = intval($sCn->fetchColumn() ?: 0);
                    }
                    if ($pdo->query("SHOW TABLES LIKE 'fbr_digital_debit_notes'")->fetch()) {
                        $sDn = $pdo->prepare("SELECT COUNT(id) FROM fbr_digital_debit_notes WHERE company_id = ? AND is_cancelled = 0");
                        $sDn->execute([$company_id]);
                        $dnCount = intval($sDn->fetchColumn() ?: 0);
                    }
                    $fbrNotesCount = $cnCount + $dnCount;
                } catch(Exception $eNotes) {}
            }

            // Real FBR Connection Status Check
            $fbrConnected = false;
            $fbrStatusText = 'Not Configured';
            try {
                if ($pdo->query("SHOW TABLES LIKE 'digital_invoice_settings'")->fetch()) {
                    $stmtDiSet = $pdo->prepare("SELECT connection_status, auth_status FROM digital_invoice_settings WHERE company_id = ? LIMIT 1");
                    $stmtDiSet->execute([$company_id]);
                    $diSet = $stmtDiSet->fetch(PDO::FETCH_ASSOC);
                    if ($diSet) {
                        $cSt = trim($diSet['connection_status'] ?? '');
                        $aSt = trim($diSet['auth_status'] ?? '');
                        if ($cSt === 'Connected' && $aSt === 'Verified') {
                            $fbrConnected = true;
                            $fbrStatusText = 'Connected';
                        } elseif (!empty($cSt) && $cSt !== 'Not Configured') {
                            $fbrStatusText = $cSt;
                        } else {
                            $fbrStatusText = 'Not Configured';
                        }
                    }
                }
            } catch(Exception $eDiSet) {}

            $summary['pos_invoices'] = $posInvCount;
            $summary['pos_sales'] = $posSalesTotal;
            $summary['pos_cash_sales'] = $posCashSales;
            $summary['pos_card_sales'] = $posCardSales;
            $summary['pos_tax_total'] = $posTaxTotal;
            $summary['pos_returns'] = $posReturnsTotal;
            $summary['pos_net_total'] = $posNetTotal;

            $summary['digital_invoices'] = $fbrActiveInvoices;
            $summary['digital_sales'] = $fbrSalesTotal;
            $summary['digital_tax'] = $fbrTaxTotal;
            $summary['digital_tax_uploaded'] = $fbrTaxUploaded;
            $summary['digital_submitted_count'] = $fbrSubmittedCount;
            $summary['digital_notes'] = $fbrNotesCount;
            $summary['digital_connected'] = $fbrConnected;
            $summary['digital_status'] = $fbrStatusText;

        } catch (Exception $e) {}

        sendResponse($summary);
    }
    
    if ($action === 'get_note') {
        $stmt = $pdo->prepare("SELECT note_text FROM business_notes WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['note' => $row ? $row['note_text'] : '']);
    }

    if ($action === 'get_profile_photo' && isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("SELECT profile_photo FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $row = $stmt->fetch();
        sendResponse(['profile_photo' => $row ? $row['profile_photo'] : null]);
    }

    if ($action === 'get_weekly_sales') {
        $base_date = $_GET['report_date'] ?? date('Y-m-d');
        $days = [];
        $dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        for ($i = 5; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("$base_date -$i days"));
            $stmt = $pdo->prepare("SELECT COALESCE(SUM(net_total), 0) as amount FROM sale_invoices WHERE company_id = ? AND DATE(invoice_date) = ? AND is_cancelled = 0");
            $stmt->execute([$company_id, $date]);
            $row = $stmt->fetch();
            $days[] = [
                'day' => $dayNames[date('w', strtotime($date))],
                'amount' => (float)$row['amount']
            ];
        }
        sendResponse($days);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $company_id = $data['company_id'] ?? $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;

    if ($action === 'save_company') {
        $id = $data['id'] ?? $_GET['id'] ?? $_GET['company_id'] ?? null;
        $status = isset($data['status']) ? (int)$data['status'] : 1;
        $before_data = $id ? fetchRecordData('companies', null, null, $id) : null;
        
        if (!empty($id)) {
            $stmt = $pdo->prepare("UPDATE companies SET name = ?, address = ?, phone = ?, fax = ?, email = ?, website = ?, gst = ?, ntn = ?, deals_in = ?, status = ? WHERE id = ?");
            $stmt->execute([
                $data['name'], $data['address'], $data['phone'], $data['fax'], 
                $data['email'], $data['website'], $data['gst'], $data['ntn'], 
                $data['deals_in'], $status, $id
            ]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO companies (name, address, phone, fax, email, website, gst, ntn, deals_in, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $data['name'], $data['address'], $data['phone'], $data['fax'], 
                $data['email'], $data['website'], $data['gst'], $data['ntn'], 
                $data['deals_in'], $status
            ]);
            $id = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('companies', null, null, $id);
        logActivity('Admin - Companies', !empty($data['id'] ?? $_GET['id'] ?? $_GET['company_id']) ? 'UPDATE' : 'INSERT', $id, 'Company: ' . ($data['name'] ?? ''), $before_data, $after_data);
        sendResponse(['status' => 'success']);
    }
    
    if ($action === 'save_user') {
        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('users', null, null, $id) : null;
            $branch_id = (!empty($data['branch_id']) && $data['role'] === 'POS') ? intval($data['branch_id']) : null;
            if (isset($data['id'])) {
                $status = $data['status'] ?? 'Active';
                $stmt = $pdo->prepare("UPDATE users SET username = ?, email = ?, role = ?, status = ?, branch_id = ? WHERE id = ?");
                $stmt->execute([$data['username'], $data['email'], $data['role'], $status, $branch_id, $data['id']]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO users (company_id, username, password, role, email, branch_id) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['username'], $data['password'], $data['role'], $data['email'], $branch_id]);
                $id = $pdo->lastInsertId();
                
                // AUTO-INITIALIZE RIGHTS based on role
                $modules = [
                    "My Company", "My Logo", "List Of Companies", "User Logins", "User Rights", "Passwords", "Financial Year", 
                    "Clear Transactions", "Currency", "BackUp Utility", "Chart of Accounts", "Customers", "Vendors/Suppliers", 
                    "Bank Accounts", "Accounts Opening Balances", "Chart Of Inventory", "Inventory Opening Balances", 
                    "Inventory Brands", "Inventory Locations", "Item Price Settings", "Item Sales Tax Rates", "Item Pre-Order Levels", 
                    "Item Cost Valuation Method", "Chart Of Services", "Voucher Posting Preferences", "Inventory Movement Settings", 
                    "Customer Regions", "Customer Types & Rates", "Business Sectors", "Employees", "Jobs", "Purchase Orders", "Purchases (Sales Tax)", 
                    "Purchases (Non Tax)", "Purchases Return/Debit Notes", "Cash Payments", "Bank Payments", "Customer Follow-Up", 
                    "Quotations", "Sale Orders", "Delivery Challans", "Sales Tax Invoices", "Sale Invoices (Non Tax)", 
                    "Sale Return/Credit Notes", "Cash Receipts", "Bank Receipts", "Inward Gate Passes", "Outward Gate Passes", 
                    "Material Issue Notes", "Production Notes", "Inventory Transfers", "Add Inventory Adjustments", 
                    "Reduce Inventory Adjustments", "Send Ledger Summary", "Send Payment Reminder", "SMS Templates", 
                    "Bulk Messages", "Journal Notes", "General Journal Voucher", "Journal Report", "Print Voucher", 
                    "Product Serials Tracking", "Item Below Re-Order Level", "Purchase Order Tracking", "Sale Order Tracking", 
                    "Purchase Summary", "Purchase Register", "Party Purchase Summary", "Payments Reports", 
                    "Purchase Activity Report - Invoice Wise", "Purchase Activity Report - Party Wise", "Item Purchase Summary", 
                    "Item Purchase Analysis", "Accounts Payable Aging", "Material Consumption Report", "Production Report", 
                    "Sale Summary", "Sale Register", "Party Sale Summary", "Recovery/Receipts Reports", 
                    "Sale Activity Report - Invoice Wise", "Sale Activity Report - Party Wise", "Item Sale Summary", 
                    "Item Sale Analysis", "Services Analysis", "Accounts Receivable Aging", "View Inventory Ledgers", 
                    "Print Inventory Ledgers", "Item-Wise Profit/Loss", "Inventory Balances", "Job Ledgers", "View Account Ledger", 
                    "Print Account Ledger", "Cash & Bank Balances", "Customer Balances", "Vendor Balances", "Trial Balance", 
                    "Income Statement", "Balance Sheet"
                ];
                
                $isAllowed = ($data['role'] === 'Admin') ? 1 : 0;
                $canEdit = ($data['role'] === 'Admin') ? 1 : 0;
                $canView = ($data['role'] === 'Admin') ? 1 : 0;
                
                $stmt = $pdo->prepare("INSERT INTO user_rights (user_id, module_name, is_allowed, can_edit, can_view) VALUES (?, ?, ?, ?, ?)");
                foreach ($modules as $mod) {
                    $stmt->execute([$id, $mod, $isAllowed, $canEdit, $canView]);
                }
            }
            $after_data = fetchRecordData('users', null, null, $id);
            logActivity('Admin - Users', isset($data['id']) ? 'UPDATE' : 'INSERT', $id, 'User: ' . ($data['username'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success']);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }
    
    if ($action === 'save_rights') {
        try {
            $userId = $data['user_id'];
            $stmt_before = $pdo->prepare("SELECT module_name, is_allowed, can_edit, can_view FROM user_rights WHERE user_id = ?");
            $stmt_before->execute([$userId]);
            $before_data = $stmt_before->fetchAll();

            $pdo->prepare("DELETE FROM user_rights WHERE user_id = ?")->execute([$userId]);
            $stmt = $pdo->prepare("INSERT INTO user_rights (user_id, module_name, is_allowed, can_edit, can_view) VALUES (?, ?, ?, ?, ?)");
            foreach ($data['rights'] as $right) {
                $stmt->execute([$userId, $right['module'], $right['allowed'], $right['can_edit'], $right['can_view']]);
            }

            $stmt_after = $pdo->prepare("SELECT module_name, is_allowed, can_edit, can_view FROM user_rights WHERE user_id = ?");
            $stmt_after->execute([$userId]);
            $after_data = $stmt_after->fetchAll();

            logActivity('Admin - User Rights', 'UPDATE', $userId, 'User ID: ' . $userId, $before_data, $after_data);

            sendResponse(['status' => 'success']);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'update_password') {
        if (!isset($data['id']) || !isset($data['password'])) {
            sendResponse(['error' => 'Missing ID or Password'], 400);
        }
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->execute([$data['password'], $data['id']]);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'save_summary') {
        // Disabled: The dashboard is now fully dynamic and calculates real-time data from core transaction tables.
        // Returning success to keep existing frontend logic unbroken without modifying stale records.
        sendResponse(['status' => 'success']);
    }
    
    if ($action === 'save_fy') {
        file_put_contents('debug_fy.log', date('Y-m-d H:i:s') . " - Data: " . json_encode($data) . " - CoID: " . $company_id . "\n", FILE_APPEND);
        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('financial_years', null, null, $id) : null;
            if (isset($data['id']) && !empty($data['id'])) {
                $stmt = $pdo->prepare("UPDATE financial_years SET start_date = ?, end_date = ?, abbreviation = ? WHERE id = ?");
                $stmt->execute([$data['start'], $data['end'], $data['abbr'], $data['id']]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO financial_years (company_id, start_date, end_date, abbreviation) VALUES (?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['start'], $data['end'], $data['abbr']]);
                $id = $pdo->lastInsertId();
            }
            $after_data = fetchRecordData('financial_years', null, null, $id);
            logActivity('Admin - Financial Years', isset($data['id']) && !empty($data['id']) ? 'UPDATE' : 'INSERT', $id, 'FY: ' . ($data['abbr'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success']);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 400);
        }
    }

    if ($action === 'delete_user') {
        $userId = $data['id'] ?? $_GET['id'] ?? null;
        if ($userId) {
            $before_data = fetchRecordData('users', null, null, $userId);
            $username = $before_data['header']['username'] ?? '';
            $pdo->prepare("DELETE FROM user_rights WHERE user_id = ?")->execute([$userId]);
            $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$userId]);
            logActivity('Admin - Users', 'DELETE', $userId, 'User: ' . $username, $before_data, null);
            sendResponse(['status' => 'success']);
        } else {
            sendResponse(['error' => 'User ID missing'], 400);
        }
    }
    
    if ($action === 'save_currency') {
        $stmt = $pdo->prepare("REPLACE INTO currencies (company_id, name, symbol) VALUES (?, ?, ?)");
        $stmt->execute([$company_id, $data['name'], $data['symbol']]);
        sendResponse(['status' => 'success']);
    }
    
    if ($action === 'save_logo') {
        $stmt = $pdo->prepare("UPDATE companies SET logo_data = ? WHERE id = ?");
        $stmt->execute([$data['logo'], $company_id]);
        sendResponse(['status' => 'success']);
    }
    
    if ($action === 'save_note') {
        $stmt = $pdo->prepare("REPLACE INTO business_notes (company_id, note_text) VALUES (?, ?)");
        $stmt->execute([$company_id, $data['note']]);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'save_profile_photo' && isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("UPDATE users SET profile_photo = ? WHERE id = ?");
        $stmt->execute([$data['photo'], $_SESSION['user_id']]);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'remove_profile_photo' && isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("UPDATE users SET profile_photo = NULL WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'delete_company' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('companies', null, null, $id);
        $name = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM companies WHERE id = ?")->execute([$id]);
        logActivity('Admin - Companies', 'DELETE', $id, 'Company: ' . $name, $before_data, null);
        sendResponse(['status' => 'success']);
    }
}
?>
