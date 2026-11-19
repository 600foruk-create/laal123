<?php
// SoftifyX ERP - Digital Invoice Reports API
// Comprehensive reporting engine for Digital Invoices, FBR Statuses, Credit Notes, Debit Notes, Cancellations & Fiscal Tax Reconciliations

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once 'db_config.php';

function sendJson($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// -------------------------------------------------------------------------
// Ensure Schema Exists without throwing errors
// -------------------------------------------------------------------------
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        invoice_no VARCHAR(50) NOT NULL,
        invoice_date DATE NOT NULL,
        invoice_type VARCHAR(50) DEFAULT 'Tax Invoice',
        supply_type VARCHAR(50) DEFAULT 'Standard Rate Goods',
        customer_type VARCHAR(50) DEFAULT 'Registered (Filer)',
        customer_coa_id INT NOT NULL DEFAULT 0,
        customer_code VARCHAR(50) DEFAULT NULL,
        customer_name VARCHAR(255) NOT NULL DEFAULT '',
        business_name VARCHAR(255) DEFAULT NULL,
        customer_ntn VARCHAR(50) DEFAULT NULL,
        customer_cnic VARCHAR(50) DEFAULT NULL,
        customer_strn VARCHAR(50) DEFAULT NULL,
        customer_phone VARCHAR(50) DEFAULT NULL,
        customer_reg_status VARCHAR(50) DEFAULT 'Active',
        customer_address TEXT DEFAULT NULL,
        customer_province VARCHAR(100) DEFAULT 'Punjab',
        ref_doc_no VARCHAR(100) DEFAULT NULL,
        ref_doc_date DATE DEFAULT NULL,
        payment_mode VARCHAR(50) DEFAULT 'Cash',
        total_qty DECIMAL(15,2) DEFAULT 0,
        gross_subtotal DECIMAL(15,2) DEFAULT 0,
        total_discount DECIMAL(15,2) DEFAULT 0,
        taxable_amount DECIMAL(15,2) DEFAULT 0,
        total_sales_tax DECIMAL(15,2) DEFAULT 0,
        total_further_tax DECIMAL(15,2) DEFAULT 0,
        total_extra_tax DECIMAL(15,2) DEFAULT 0,
        total_fed DECIMAL(15,2) DEFAULT 0,
        total_invoice_amount DECIMAL(15,2) DEFAULT 0,
        rounding_adjustment DECIMAL(15,2) DEFAULT 0,
        net_payable DECIMAL(15,2) DEFAULT 0,
        workflow_status VARCHAR(30) DEFAULT 'Draft',
        fbr_status VARCHAR(30) DEFAULT 'Not Submitted',
        fbr_invoice_no VARCHAR(100) DEFAULT NULL,
        fbr_qr_code TEXT DEFAULT NULL,
        fbr_response_code VARCHAR(50) DEFAULT NULL,
        fbr_response_msg TEXT DEFAULT NULL,
        submission_timestamp DATETIME DEFAULT NULL,
        remarks TEXT DEFAULT NULL,
        is_cancelled TINYINT DEFAULT 0,
        cancellation_reason TEXT DEFAULT NULL,
        cancellation_date DATETIME DEFAULT NULL
    )");
} catch (Exception $e) {}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_credit_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        credit_note_no VARCHAR(50) NOT NULL,
        credit_note_date DATE NOT NULL,
        credit_note_type VARCHAR(50) DEFAULT 'Credit Note',
        original_invoice_no VARCHAR(50) NOT NULL,
        original_invoice_date DATE NOT NULL,
        customer_code VARCHAR(50) DEFAULT NULL,
        customer_name VARCHAR(255) NOT NULL DEFAULT '',
        customer_ntn VARCHAR(50) DEFAULT NULL,
        reason_text VARCHAR(255) NOT NULL DEFAULT '',
        total_credit_qty DECIMAL(15,2) DEFAULT 0,
        taxable_credit_amount DECIMAL(15,2) DEFAULT 0,
        sales_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        further_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        total_credit_amount DECIMAL(15,2) DEFAULT 0,
        fbr_status VARCHAR(30) DEFAULT 'Not Submitted',
        fbr_credit_note_no VARCHAR(100) DEFAULT NULL,
        submission_timestamp DATETIME DEFAULT NULL,
        is_cancelled TINYINT DEFAULT 0
    )");
} catch (Exception $e) {}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_debit_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        debit_note_no VARCHAR(50) NOT NULL,
        debit_note_date DATE NOT NULL,
        debit_note_type VARCHAR(50) DEFAULT 'Debit Note',
        original_invoice_no VARCHAR(50) NOT NULL,
        original_invoice_date DATE NOT NULL,
        customer_code VARCHAR(50) DEFAULT NULL,
        customer_name VARCHAR(255) NOT NULL DEFAULT '',
        customer_ntn VARCHAR(50) DEFAULT NULL,
        reason_text VARCHAR(255) NOT NULL DEFAULT '',
        total_debit_qty DECIMAL(15,2) DEFAULT 0,
        taxable_debit_amount DECIMAL(15,2) DEFAULT 0,
        sales_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        further_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        total_debit_amount DECIMAL(15,2) DEFAULT 0,
        fbr_status VARCHAR(30) DEFAULT 'Not Submitted',
        fbr_debit_note_no VARCHAR(100) DEFAULT NULL,
        submission_timestamp DATETIME DEFAULT NULL,
        is_cancelled TINYINT DEFAULT 0
    )");
} catch (Exception $e) {}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_invoice_cancellations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        request_no VARCHAR(50) NOT NULL,
        request_date DATE NOT NULL,
        invoice_no VARCHAR(50) NOT NULL,
        invoice_date DATE NOT NULL,
        customer_name VARCHAR(255) NOT NULL DEFAULT '',
        invoice_total DECIMAL(15,2) DEFAULT 0,
        taxable_amount DECIMAL(15,2) DEFAULT 0,
        total_sales_tax DECIMAL(15,2) DEFAULT 0,
        cancellation_route VARCHAR(50) DEFAULT 'ERP_VOID',
        reason_text VARCHAR(255) NOT NULL DEFAULT '',
        remarks TEXT DEFAULT NULL,
        request_status VARCHAR(50) DEFAULT 'Cancellation Confirmed',
        fbr_cancellation_status VARCHAR(50) DEFAULT 'Not Submitted',
        submission_timestamp DATETIME DEFAULT NULL
    )");
} catch (Exception $e) {}

try { $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN is_cancelled TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN cancellation_reason TEXT DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN cancellation_date DATETIME DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE fbr_digital_credit_notes ADD COLUMN is_cancelled TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE fbr_digital_debit_notes ADD COLUMN is_cancelled TINYINT DEFAULT 0"); } catch (Exception $e) {}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// Helper to sanitize date filters
function parseDateFilters() {
    $dFrom = trim($_GET['date_from'] ?? $_POST['date_from'] ?? '');
    $dTo = trim($_GET['date_to'] ?? $_POST['date_to'] ?? '');
    return [$dFrom, $dTo];
}

// =========================================================================
// ACTION: get_meta (Company profile & general settings)
// =========================================================================
if ($action === 'get_meta') {
    try {
        $company = [];
        try {
            $cStmt = $pdo->prepare("SELECT * FROM company_profile WHERE id = ?");
            $cStmt->execute([$company_id]);
            $company = $cStmt->fetch(PDO::FETCH_ASSOC);

            if (!$company) {
                $cStmt = $pdo->query("SELECT * FROM company_profile LIMIT 1");
                $company = $cStmt->fetch(PDO::FETCH_ASSOC);
            }
        } catch (Exception $eComp) {
            $company = [];
        }

        $settings = [
            'environment' => 'sandbox',
            'provider' => 'PRAL',
            'fbr_reg_ref' => 'POMS-001'
        ];
        try {
            $sStmt = $pdo->prepare("SELECT environment, provider, fbr_reg_ref FROM digital_invoice_settings WHERE company_id = ?");
            $sStmt->execute([$company_id]);
            $dbSet = $sStmt->fetch(PDO::FETCH_ASSOC);
            if ($dbSet) $settings = $dbSet;
        } catch (Exception $eSet) {}

        sendJson([
            'status' => 'success',
            'company' => $company ?: [
                'company_name' => 'SOFTIFYX FINANCIAL ERP',
                'ntn' => '7123456-7',
                'strn' => '3277876123456',
                'address' => 'Pakistan'
            ],
            'settings' => $settings
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 200);
    }
}

// =========================================================================
// ACTION: get_dashboard_summary (Real-time KPI metrics & Monthly Trends)
// =========================================================================
if ($action === 'get_dashboard_summary') {
    try {
        list($dFrom, $dTo) = parseDateFilters();

        $whereInv = "WHERE company_id = ?";
        $paramsInv = [$company_id];
        if (!empty($dFrom)) {
            $whereInv .= " AND invoice_date >= ?";
            $paramsInv[] = $dFrom;
        }
        if (!empty($dTo)) {
            $whereInv .= " AND invoice_date <= ?";
            $paramsInv[] = $dTo;
        }

        // 1. Digital Invoices KPI
        $invKpiSql = "
            SELECT 
                COUNT(*) as total_invoices,
                COALESCE(SUM(net_payable), 0) as total_invoice_amount,
                COALESCE(SUM(total_sales_tax), 0) as total_sales_tax,
                COUNT(CASE WHEN fbr_status = 'Submitted' AND is_cancelled = 0 THEN 1 END) as fbr_accepted_count,
                COALESCE(SUM(CASE WHEN fbr_status = 'Submitted' AND is_cancelled = 0 THEN net_payable ELSE 0 END), 0) as fbr_accepted_amount,
                COUNT(CASE WHEN fbr_status != 'Submitted' AND is_cancelled = 0 THEN 1 END) as pending_fbr_count,
                COALESCE(SUM(CASE WHEN fbr_status != 'Submitted' AND is_cancelled = 0 THEN net_payable ELSE 0 END), 0) as pending_fbr_amount,
                COUNT(CASE WHEN fbr_status IN ('Failed', 'Rejected') AND is_cancelled = 0 THEN 1 END) as fbr_rejected_count,
                COALESCE(SUM(CASE WHEN fbr_status IN ('Failed', 'Rejected') AND is_cancelled = 0 THEN net_payable ELSE 0 END), 0) as fbr_rejected_amount,
                COUNT(CASE WHEN is_cancelled = 1 OR workflow_status = 'Cancelled' THEN 1 END) as cancelled_count,
                COALESCE(SUM(CASE WHEN is_cancelled = 1 OR workflow_status = 'Cancelled' THEN net_payable ELSE 0 END), 0) as cancelled_amount
            FROM fbr_digital_invoices
            $whereInv
        ";
        $invStmt = $pdo->prepare($invKpiSql);
        $invStmt->execute($paramsInv);
        $invKpi = $invStmt->fetch(PDO::FETCH_ASSOC);

        // 2. Credit Notes KPI
        $whereCn = "WHERE company_id = ? AND is_cancelled = 0";
        $paramsCn = [$company_id];
        if (!empty($dFrom)) {
            $whereCn .= " AND credit_note_date >= ?";
            $paramsCn[] = $dFrom;
        }
        if (!empty($dTo)) {
            $whereCn .= " AND credit_note_date <= ?";
            $paramsCn[] = $dTo;
        }
        $cnSql = "
            SELECT 
                COUNT(*) as credit_notes_count,
                COALESCE(SUM(total_credit_amount), 0) as total_credit_amount,
                COALESCE(SUM(sales_tax_adjustment), 0) as credit_tax_amount
            FROM fbr_digital_credit_notes
            $whereCn
        ";
        $cnStmt = $pdo->prepare($cnSql);
        $cnStmt->execute($paramsCn);
        $cnKpi = $cnStmt->fetch(PDO::FETCH_ASSOC);

        // 3. Debit Notes KPI
        $whereDn = "WHERE company_id = ? AND is_cancelled = 0";
        $paramsDn = [$company_id];
        if (!empty($dFrom)) {
            $whereDn .= " AND debit_note_date >= ?";
            $paramsDn[] = $dFrom;
        }
        if (!empty($dTo)) {
            $whereDn .= " AND debit_note_date <= ?";
            $paramsDn[] = $dTo;
        }
        $dnSql = "
            SELECT 
                COUNT(*) as debit_notes_count,
                COALESCE(SUM(total_debit_amount), 0) as total_debit_amount,
                COALESCE(SUM(sales_tax_adjustment), 0) as debit_tax_amount
            FROM fbr_digital_debit_notes
            $whereDn
        ";
        $dnStmt = $pdo->prepare($dnSql);
        $dnStmt->execute($paramsDn);
        $dnKpi = $dnStmt->fetch(PDO::FETCH_ASSOC);

        // 4. Monthly Activity Trend (Last 6 Months)
        $trendSql = "
            SELECT 
                DATE_FORMAT(invoice_date, '%Y-%m') as ym,
                DATE_FORMAT(invoice_date, '%b %Y') as month_label,
                COUNT(*) as inv_count,
                COALESCE(SUM(CASE WHEN is_cancelled = 0 THEN net_payable ELSE 0 END), 0) as inv_total,
                COALESCE(SUM(CASE WHEN is_cancelled = 0 THEN total_sales_tax ELSE 0 END), 0) as tax_total,
                COUNT(CASE WHEN fbr_status = 'Submitted' AND is_cancelled = 0 THEN 1 END) as submitted_count
            FROM fbr_digital_invoices
            WHERE company_id = ? AND invoice_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(invoice_date, '%Y-%m'), DATE_FORMAT(invoice_date, '%b %Y')
            ORDER BY ym ASC
        ";
        $trendStmt = $pdo->prepare($trendSql);
        $trendStmt->execute([$company_id]);
        $monthlyTrends = $trendStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'summary' => [
                'total_invoices' => intval($invKpi['total_invoices']),
                'total_invoice_amount' => floatval($invKpi['total_invoice_amount']),
                'total_sales_tax' => floatval($invKpi['total_sales_tax']),
                'fbr_accepted_count' => intval($invKpi['fbr_accepted_count']),
                'fbr_accepted_amount' => floatval($invKpi['fbr_accepted_amount']),
                'pending_fbr_count' => intval($invKpi['pending_fbr_count']),
                'pending_fbr_amount' => floatval($invKpi['pending_fbr_amount']),
                'fbr_rejected_count' => intval($invKpi['fbr_rejected_count']),
                'fbr_rejected_amount' => floatval($invKpi['fbr_rejected_amount']),
                'cancelled_count' => intval($invKpi['cancelled_count']),
                'cancelled_amount' => floatval($invKpi['cancelled_amount']),
                'credit_notes_count' => intval($cnKpi['credit_notes_count']),
                'total_credit_amount' => floatval($cnKpi['total_credit_amount']),
                'credit_tax_amount' => floatval($cnKpi['credit_tax_amount']),
                'debit_notes_count' => intval($dnKpi['debit_notes_count']),
                'total_debit_amount' => floatval($dnKpi['total_debit_amount']),
                'debit_tax_amount' => floatval($dnKpi['debit_tax_amount'])
            ],
            'monthly_trends' => $monthlyTrends
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_invoice_register (Digital Invoices List with filters & pagination)
// =========================================================================
if ($action === 'get_invoice_register') {
    try {
        list($dFrom, $dTo) = parseDateFilters();
        $q = trim($_GET['q'] ?? '');
        $fbrStatus = trim($_GET['fbr_status'] ?? '');
        $invType = trim($_GET['invoice_type'] ?? '');
        $limit = max(1, min(200, intval($_GET['limit'] ?? 100)));
        $offset = max(0, intval($_GET['offset'] ?? 0));

        $where = "WHERE company_id = ?";
        $params = [$company_id];

        if (!empty($dFrom)) {
            $where .= " AND invoice_date >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND invoice_date <= ?";
            $params[] = $dTo;
        }
        if (!empty($q)) {
            $where .= " AND (invoice_no LIKE ? OR customer_name LIKE ? OR customer_ntn LIKE ? OR fbr_invoice_no LIKE ?)";
            $wild = "%$q%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }
        if (!empty($fbrStatus)) {
            if ($fbrStatus === 'Pending') {
                $where .= " AND fbr_status != 'Submitted' AND is_cancelled = 0";
            } elseif ($fbrStatus === 'Accepted') {
                $where .= " AND fbr_status = 'Submitted' AND is_cancelled = 0";
            } elseif ($fbrStatus === 'Cancelled') {
                $where .= " AND (is_cancelled = 1 OR workflow_status = 'Cancelled')";
            } else {
                $where .= " AND fbr_status = ?";
                $params[] = $fbrStatus;
            }
        }
        if (!empty($invType)) {
            $where .= " AND invoice_type = ?";
            $params[] = $invType;
        }

        // Count & Totals query
        $totSql = "
            SELECT 
                COUNT(*) as total_rows,
                COALESCE(SUM(taxable_amount), 0) as total_taxable,
                COALESCE(SUM(total_sales_tax), 0) as total_tax,
                COALESCE(SUM(net_payable), 0) as total_net
            FROM fbr_digital_invoices
            $where
        ";
        $totStmt = $pdo->prepare($totSql);
        $totStmt->execute($params);
        $totals = $totStmt->fetch(PDO::FETCH_ASSOC);

        // Rows query
        $sql = "
            SELECT 
                id, serial_no, invoice_no, invoice_date,
                customer_code, customer_name, business_name,
                customer_ntn, customer_cnic, customer_type,
                invoice_type, taxable_amount, total_sales_tax,
                total_further_tax, total_extra_tax, net_payable,
                fbr_invoice_no, fbr_status, workflow_status,
                fbr_response_code, fbr_response_msg,
                submission_timestamp, is_cancelled
            FROM fbr_digital_invoices
            $where
            ORDER BY serial_no DESC
            LIMIT $limit OFFSET $offset
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'invoices' => $rows,
            'totals' => [
                'total_rows' => intval($totals['total_rows']),
                'total_taxable' => floatval($totals['total_taxable']),
                'total_tax' => floatval($totals['total_tax']),
                'total_net' => floatval($totals['total_net'])
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_submission_status_report (Breakdown by FBR status)
// =========================================================================
if ($action === 'get_submission_status_report') {
    try {
        list($dFrom, $dTo) = parseDateFilters();

        $where = "WHERE company_id = ?";
        $params = [$company_id];
        if (!empty($dFrom)) {
            $where .= " AND invoice_date >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND invoice_date <= ?";
            $params[] = $dTo;
        }

        // Status-wise breakdown
        $grpSql = "
            SELECT 
                CASE 
                    WHEN is_cancelled = 1 OR workflow_status = 'Cancelled' THEN 'Cancelled'
                    WHEN fbr_status = 'Submitted' THEN 'Accepted'
                    WHEN fbr_status IN ('Failed', 'Rejected') THEN fbr_status
                    ELSE 'Pending'
                END as status_group,
                COUNT(*) as count,
                COALESCE(SUM(taxable_amount), 0) as total_taxable,
                COALESCE(SUM(total_sales_tax), 0) as total_tax,
                COALESCE(SUM(net_payable), 0) as total_amount
            FROM fbr_digital_invoices
            $where
            GROUP BY status_group
            ORDER BY count DESC
        ";
        $grpStmt = $pdo->prepare($grpSql);
        $grpStmt->execute($params);
        $groups = $grpStmt->fetchAll(PDO::FETCH_ASSOC);

        // List of Failed / Rejected invoices with specific error message
        $errSql = "
            SELECT 
                id, serial_no, invoice_no, invoice_date, customer_name,
                net_payable, fbr_status, fbr_response_code, fbr_response_msg,
                submission_timestamp
            FROM fbr_digital_invoices
            $where AND fbr_status IN ('Failed', 'Rejected') AND is_cancelled = 0
            ORDER BY serial_no DESC LIMIT 40
        ";
        $errStmt = $pdo->prepare($errSql);
        $errStmt->execute($params);
        $errorsList = $errStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'status_groups' => $groups,
            'failed_rejected_invoices' => $errorsList
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_credit_notes_report (Credit Notes register & totals)
// =========================================================================
if ($action === 'get_credit_notes_report') {
    try {
        list($dFrom, $dTo) = parseDateFilters();
        $q = trim($_GET['q'] ?? '');
        $fbrStatus = trim($_GET['fbr_status'] ?? '');

        $where = "WHERE company_id = ? AND is_cancelled = 0";
        $params = [$company_id];

        if (!empty($dFrom)) {
            $where .= " AND credit_note_date >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND credit_note_date <= ?";
            $params[] = $dTo;
        }
        if (!empty($q)) {
            $where .= " AND (credit_note_no LIKE ? OR original_invoice_no LIKE ? OR customer_name LIKE ? OR fbr_credit_note_no LIKE ?)";
            $wild = "%$q%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }
        if (!empty($fbrStatus)) {
            $where .= " AND fbr_status = ?";
            $params[] = $fbrStatus;
        }

        $sql = "
            SELECT 
                id, serial_no, credit_note_no, credit_note_date,
                original_invoice_no, original_invoice_date,
                customer_code, customer_name, customer_ntn,
                reason_text, total_credit_qty, taxable_credit_amount,
                sales_tax_adjustment, further_tax_adjustment,
                total_credit_amount, fbr_status, fbr_credit_note_no,
                submission_timestamp
            FROM fbr_digital_credit_notes
            $where
            ORDER BY serial_no DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Sums
        $totTaxable = 0;
        $totTax = 0;
        $totAmount = 0;
        foreach ($rows as $r) {
            $totTaxable += floatval($r['taxable_credit_amount']);
            $totTax += floatval($r['sales_tax_adjustment']);
            $totAmount += floatval($r['total_credit_amount']);
        }

        sendJson([
            'status' => 'success',
            'credit_notes' => $rows,
            'totals' => [
                'count' => count($rows),
                'total_taxable' => $totTaxable,
                'total_tax' => $totTax,
                'total_amount' => $totAmount
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_debit_notes_report (Debit Notes register & totals)
// =========================================================================
if ($action === 'get_debit_notes_report') {
    try {
        list($dFrom, $dTo) = parseDateFilters();
        $q = trim($_GET['q'] ?? '');
        $fbrStatus = trim($_GET['fbr_status'] ?? '');

        $where = "WHERE company_id = ? AND is_cancelled = 0";
        $params = [$company_id];

        if (!empty($dFrom)) {
            $where .= " AND debit_note_date >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND debit_note_date <= ?";
            $params[] = $dTo;
        }
        if (!empty($q)) {
            $where .= " AND (debit_note_no LIKE ? OR original_invoice_no LIKE ? OR customer_name LIKE ? OR fbr_debit_note_no LIKE ?)";
            $wild = "%$q%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }
        if (!empty($fbrStatus)) {
            $where .= " AND fbr_status = ?";
            $params[] = $fbrStatus;
        }

        $sql = "
            SELECT 
                id, serial_no, debit_note_no, debit_note_date,
                original_invoice_no, original_invoice_date,
                customer_code, customer_name, customer_ntn,
                reason_text, total_debit_qty, taxable_debit_amount,
                sales_tax_adjustment, further_tax_adjustment,
                total_debit_amount, fbr_status, fbr_debit_note_no,
                submission_timestamp
            FROM fbr_digital_debit_notes
            $where
            ORDER BY serial_no DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Sums
        $totTaxable = 0;
        $totTax = 0;
        $totAmount = 0;
        foreach ($rows as $r) {
            $totTaxable += floatval($r['taxable_debit_amount']);
            $totTax += floatval($r['sales_tax_adjustment']);
            $totAmount += floatval($r['total_debit_amount']);
        }

        sendJson([
            'status' => 'success',
            'debit_notes' => $rows,
            'totals' => [
                'count' => count($rows),
                'total_taxable' => $totTaxable,
                'total_tax' => $totTax,
                'total_amount' => $totAmount
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_cancellations_report (Cancelled Invoices register)
// =========================================================================
if ($action === 'get_cancellations_report') {
    try {
        list($dFrom, $dTo) = parseDateFilters();
        $q = trim($_GET['q'] ?? '');

        $where = "WHERE company_id = ?";
        $params = [$company_id];

        if (!empty($dFrom)) {
            $where .= " AND request_date >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND request_date <= ?";
            $params[] = $dTo;
        }
        if (!empty($q)) {
            $where .= " AND (request_no LIKE ? OR invoice_no LIKE ? OR customer_name LIKE ? OR reason_text LIKE ?)";
            $wild = "%$q%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }

        $sql = "
            SELECT 
                id, serial_no, request_no, request_date,
                invoice_no, invoice_date, customer_name,
                invoice_total, taxable_amount, total_sales_tax,
                cancellation_route, reason_text, remarks,
                request_status, fbr_cancellation_status,
                submission_timestamp
            FROM fbr_invoice_cancellations
            $where
            ORDER BY serial_no DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totAmount = 0;
        $totTax = 0;
        foreach ($rows as $r) {
            $totAmount += floatval($r['invoice_total']);
            $totTax += floatval($r['total_sales_tax']);
        }

        sendJson([
            'status' => 'success',
            'cancellations' => $rows,
            'totals' => [
                'count' => count($rows),
                'total_amount' => $totAmount,
                'total_tax' => $totTax
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_tax_summary (Comprehensive Fiscal Reconciliation)
// =========================================================================
if ($action === 'get_tax_summary') {
    try {
        list($dFrom, $dTo) = parseDateFilters();

        // 1. Sales Invoices (Active & non-cancelled)
        $whereInv = "WHERE company_id = ? AND is_cancelled = 0";
        $paramsInv = [$company_id];
        if (!empty($dFrom)) {
            $whereInv .= " AND invoice_date >= ?";
            $paramsInv[] = $dFrom;
        }
        if (!empty($dTo)) {
            $whereInv .= " AND invoice_date <= ?";
            $paramsInv[] = $dTo;
        }

        $invSql = "
            SELECT 
                COUNT(*) as inv_count,
                COALESCE(SUM(taxable_amount), 0) as taxable_sales,
                COALESCE(SUM(total_sales_tax), 0) as sales_tax,
                COALESCE(SUM(total_further_tax), 0) as further_tax,
                COALESCE(SUM(total_extra_tax), 0) as extra_tax,
                COALESCE(SUM(total_fed), 0) as fed,
                COALESCE(SUM(net_payable), 0) as gross_invoice_total
            FROM fbr_digital_invoices
            $whereInv
        ";
        $invStmt = $pdo->prepare($invSql);
        $invStmt->execute($paramsInv);
        $invTax = $invStmt->fetch(PDO::FETCH_ASSOC);

        // 2. Credit Notes Adjustments
        $whereCn = "WHERE company_id = ? AND is_cancelled = 0";
        $paramsCn = [$company_id];
        if (!empty($dFrom)) {
            $whereCn .= " AND credit_note_date >= ?";
            $paramsCn[] = $dFrom;
        }
        if (!empty($dTo)) {
            $whereCn .= " AND credit_note_date <= ?";
            $paramsCn[] = $dTo;
        }
        $cnSql = "
            SELECT 
                COUNT(*) as cn_count,
                COALESCE(SUM(taxable_credit_amount), 0) as cn_taxable,
                COALESCE(SUM(sales_tax_adjustment), 0) as cn_sales_tax,
                COALESCE(SUM(further_tax_adjustment), 0) as cn_further_tax,
                COALESCE(SUM(total_credit_amount), 0) as cn_total
            FROM fbr_digital_credit_notes
            $whereCn
        ";
        $cnStmt = $pdo->prepare($cnSql);
        $cnStmt->execute($paramsCn);
        $cnTax = $cnStmt->fetch(PDO::FETCH_ASSOC);

        // 3. Debit Notes Adjustments
        $whereDn = "WHERE company_id = ? AND is_cancelled = 0";
        $paramsDn = [$company_id];
        if (!empty($dFrom)) {
            $whereDn .= " AND debit_note_date >= ?";
            $paramsDn[] = $dFrom;
        }
        if (!empty($dTo)) {
            $whereDn .= " AND debit_note_date <= ?";
            $paramsDn[] = $dTo;
        }
        $dnSql = "
            SELECT 
                COUNT(*) as dn_count,
                COALESCE(SUM(taxable_debit_amount), 0) as dn_taxable,
                COALESCE(SUM(sales_tax_adjustment), 0) as dn_sales_tax,
                COALESCE(SUM(further_tax_adjustment), 0) as dn_further_tax,
                COALESCE(SUM(total_debit_amount), 0) as dn_total
            FROM fbr_digital_debit_notes
            $whereDn
        ";
        $dnStmt = $pdo->prepare($dnSql);
        $dnStmt->execute($paramsDn);
        $dnTax = $dnStmt->fetch(PDO::FETCH_ASSOC);

        // Calculate Reconciled Net Fiscal Figures
        $netTaxable = floatval($invTax['taxable_sales']) - floatval($cnTax['cn_taxable']) + floatval($dnTax['dn_taxable']);
        $netSalesTax = floatval($invTax['sales_tax']) - floatval($cnTax['cn_sales_tax']) + floatval($dnTax['dn_sales_tax']);
        $netFurtherTax = floatval($invTax['further_tax']) - floatval($cnTax['cn_further_tax']) + floatval($dnTax['dn_further_tax']);
        $netTotal = floatval($invTax['gross_invoice_total']) - floatval($cnTax['cn_total']) + floatval($dnTax['dn_total']);

        sendJson([
            'status' => 'success',
            'tax_summary' => [
                'invoices' => [
                    'count' => intval($invTax['inv_count']),
                    'taxable_sales' => floatval($invTax['taxable_sales']),
                    'sales_tax' => floatval($invTax['sales_tax']),
                    'further_tax' => floatval($invTax['further_tax']),
                    'extra_tax' => floatval($invTax['extra_tax']),
                    'fed' => floatval($invTax['fed']),
                    'gross_total' => floatval($invTax['gross_invoice_total'])
                ],
                'credit_notes' => [
                    'count' => intval($cnTax['cn_count']),
                    'taxable_reversal' => floatval($cnTax['cn_taxable']),
                    'sales_tax_reversal' => floatval($cnTax['cn_sales_tax']),
                    'further_tax_reversal' => floatval($cnTax['cn_further_tax']),
                    'total_credit' => floatval($cnTax['cn_total'])
                ],
                'debit_notes' => [
                    'count' => intval($dnTax['dn_count']),
                    'taxable_addition' => floatval($dnTax['dn_taxable']),
                    'sales_tax_addition' => floatval($dnTax['dn_sales_tax']),
                    'further_tax_addition' => floatval($dnTax['dn_further_tax']),
                    'total_debit' => floatval($dnTax['dn_total'])
                ],
                'reconciled_net' => [
                    'net_taxable_sales' => $netTaxable,
                    'net_sales_tax_liability' => $netSalesTax,
                    'net_further_tax_liability' => $netFurtherTax,
                    'net_total_sales_value' => $netTotal
                ]
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_customer_summary (Grouped by Customer)
// =========================================================================
if ($action === 'get_customer_summary') {
    try {
        list($dFrom, $dTo) = parseDateFilters();

        $where = "WHERE company_id = ? AND is_cancelled = 0";
        $params = [$company_id];
        if (!empty($dFrom)) {
            $where .= " AND invoice_date >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND invoice_date <= ?";
            $params[] = $dTo;
        }

        $sql = "
            SELECT 
                customer_code,
                customer_name,
                business_name,
                customer_ntn,
                customer_type,
                COUNT(*) as invoice_count,
                COALESCE(SUM(taxable_amount), 0) as total_taxable,
                COALESCE(SUM(total_sales_tax), 0) as total_tax,
                COALESCE(SUM(net_payable), 0) as total_invoiced
            FROM fbr_digital_invoices
            $where
            GROUP BY customer_name, customer_code, customer_ntn, customer_type, business_name
            ORDER BY total_invoiced DESC LIMIT 100
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson(['status' => 'success', 'customer_summary' => $rows]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_monthly_summary (Grouped by Month)
// =========================================================================
if ($action === 'get_monthly_summary') {
    try {
        $sql = "
            SELECT 
                DATE_FORMAT(invoice_date, '%Y-%m') as year_month,
                DATE_FORMAT(invoice_date, '%M %Y') as month_title,
                COUNT(CASE WHEN is_cancelled = 0 THEN 1 END) as active_invoices,
                COALESCE(SUM(CASE WHEN is_cancelled = 0 THEN taxable_amount ELSE 0 END), 0) as taxable_amount,
                COALESCE(SUM(CASE WHEN is_cancelled = 0 THEN total_sales_tax ELSE 0 END), 0) as sales_tax,
                COALESCE(SUM(CASE WHEN is_cancelled = 0 THEN net_payable ELSE 0 END), 0) as total_invoiced,
                COUNT(CASE WHEN fbr_status = 'Submitted' AND is_cancelled = 0 THEN 1 END) as fbr_submitted_count,
                COUNT(CASE WHEN is_cancelled = 1 THEN 1 END) as cancelled_count
            FROM fbr_digital_invoices
            WHERE company_id = ?
            GROUP BY DATE_FORMAT(invoice_date, '%Y-%m'), DATE_FORMAT(invoice_date, '%M %Y')
            ORDER BY year_month DESC LIMIT 24
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson(['status' => 'success', 'monthly_summary' => $rows]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: export_csv (Download filtered report as CSV file)
// =========================================================================
if ($action === 'export_csv') {
    $reportType = trim($_GET['report_type'] ?? 'register');
    list($dFrom, $dTo) = parseDateFilters();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Digital_Invoice_' . ucfirst($reportType) . '_' . date('Ymd_His') . '.csv"');

    $out = fopen('php://output', 'w');
    // Output BOM for Excel UTF-8 compliance
    fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

    if ($reportType === 'register') {
        fputcsv($out, ['SN', 'Invoice No', 'Date', 'Customer Code', 'Customer Name', 'NTN/CNIC', 'Type', 'Taxable Amount', 'Sales Tax', 'Net Payable', 'FBR Ref #', 'FBR Status', 'ERP Status']);
        $sql = "SELECT serial_no, invoice_no, invoice_date, customer_code, customer_name, customer_ntn, invoice_type, taxable_amount, total_sales_tax, net_payable, fbr_invoice_no, fbr_status, workflow_status FROM fbr_digital_invoices WHERE company_id = ? ORDER BY serial_no DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
            fputcsv($out, $r);
        }
    } elseif ($reportType === 'credit_notes') {
        fputcsv($out, ['SN', 'Credit Note No', 'Date', 'Orig Invoice No', 'Customer Name', 'NTN', 'Reason', 'Taxable Credited', 'Sales Tax Adj', 'Total Credit', 'FBR Ref', 'FBR Status']);
        $sql = "SELECT serial_no, credit_note_no, credit_note_date, original_invoice_no, customer_name, customer_ntn, reason_text, taxable_credit_amount, sales_tax_adjustment, total_credit_amount, fbr_credit_note_no, fbr_status FROM fbr_digital_credit_notes WHERE company_id = ? ORDER BY serial_no DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
            fputcsv($out, $r);
        }
    } elseif ($reportType === 'debit_notes') {
        fputcsv($out, ['SN', 'Debit Note No', 'Date', 'Orig Invoice No', 'Customer Name', 'NTN', 'Reason', 'Taxable Debited', 'Sales Tax Adj', 'Total Debit', 'FBR Ref', 'FBR Status']);
        $sql = "SELECT serial_no, debit_note_no, debit_note_date, original_invoice_no, customer_name, customer_ntn, reason_text, taxable_debit_amount, sales_tax_adjustment, total_debit_amount, fbr_debit_note_no, fbr_status FROM fbr_digital_debit_notes WHERE company_id = ? ORDER BY serial_no DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
            fputcsv($out, $r);
        }
    } elseif ($reportType === 'cancellations') {
        fputcsv($out, ['SN', 'Request No', 'Date', 'Invoice No', 'Customer Name', 'Invoice Total', 'Tax Reversal', 'Route', 'Reason', 'ERP Status', 'FBR Status']);
        $sql = "SELECT serial_no, request_no, request_date, invoice_no, customer_name, invoice_total, total_sales_tax, cancellation_route, reason_text, request_status, fbr_cancellation_status FROM fbr_invoice_cancellations WHERE company_id = ? ORDER BY serial_no DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
            fputcsv($out, $r);
        }
    }
    fclose($out);
    exit;
}

// Fallback
sendJson(['status' => 'error', 'message' => 'Action [' . htmlspecialchars($action) . '] is not supported.'], 400);
