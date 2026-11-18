<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Safe Error Reporting (JSON safe)
ini_set('display_errors', 0);
error_reporting(E_ALL);

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);

try {
    // Ensure gross_amount column exists on sale_invoices
    try {
        $siCols = $pdo->query("SHOW COLUMNS FROM sale_invoices")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('gross_amount', $siCols)) {
            $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN gross_amount DECIMAL(15,2) DEFAULT 0 AFTER payment_terms");
            $pdo->exec("UPDATE sale_invoices si SET gross_amount = COALESCE(
                (SELECT SUM(sii.gross_amount) FROM sale_invoice_items sii WHERE sii.invoice_id = si.id),
                si.net_total + COALESCE(si.additional_discount, 0)
            ) WHERE gross_amount = 0 OR gross_amount IS NULL");
        }
    } catch (Exception $colEx) {}

    // -------------------------------------------------------------------------
    // ACTION: get_lookups
    // Fetches branches, cashiers, categories, and payment terms for filters
    // -------------------------------------------------------------------------
    if ($action === 'get_lookups') {
        // 1. Branches
        $branches = [];
        try {
            if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
                $stmtB = $pdo->prepare("SELECT id, branch_code, branch_name FROM company_branches WHERE company_id = ? AND (status IS NULL OR status = 'Active') AND id = ? ORDER BY branch_name ASC");
                $stmtB->execute([$company_id, intval($_SESSION['branch_id'])]);
            } else {
                $stmtB = $pdo->prepare("SELECT id, branch_code, branch_name FROM company_branches WHERE company_id = ? AND (status IS NULL OR status = 'Active') ORDER BY branch_name ASC");
                $stmtB->execute([$company_id]);
            }
            $branches = $stmtB->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}

        // 2. Cashiers / Users
        $cashiers = [];
        try {
            $stmtU = $pdo->prepare("SELECT id, username FROM users WHERE company_id = ? ORDER BY username ASC");
            $stmtU->execute([$company_id]);
            $cashiers = $stmtU->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}

        // 3. Item Categories
        $categories = [];
        try {
            $stmtC = $pdo->prepare("SELECT DISTINCT category_type as name FROM inv_items WHERE company_id = ? AND category_type IS NOT NULL AND category_type != '' ORDER BY category_type ASC");
            $stmtC->execute([$company_id]);
            $categories = $stmtC->fetchAll(PDO::FETCH_COLUMN);
        } catch (Exception $e) {}

        echo json_encode([
            'status' => 'success',
            'branches' => $branches,
            'cashiers' => $cashiers,
            'categories' => $categories
        ]);
        exit;
    }

    // Helper: Common Date and Branch Filter Builder
    $from_date = trim($_GET['from_date'] ?? '');
    $to_date = trim($_GET['to_date'] ?? '');
    $branch_id = !empty($_GET['branch_id']) ? intval($_GET['branch_id']) : null;
    if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
        $branch_id = intval($_SESSION['branch_id']);
    }
    $cashier_id = !empty($_GET['cashier_id']) ? intval($_GET['cashier_id']) : null;
    $search = trim($_GET['search'] ?? '');
    $page = max(1, intval($_GET['page'] ?? 1));
    $limit = max(5, min(500, intval($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    // -------------------------------------------------------------------------
    // 1. SALES REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_sales_report') {
        $where = ["si.company_id = ?", "si.invoice_type = 'POS'"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "si.inventory_location_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "si.invoice_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "si.invoice_date <= ?";
            $params[] = $to_date;
        }
        if (!empty($search)) {
            $where[] = "(si.pos_invoice_no LIKE ? OR CAST(si.serial_no AS CHAR) LIKE ? OR c.name LIKE ? OR si.fbr_invoice_number LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $fbr_status_filter = trim($_GET['fbr_status'] ?? '');
        if (!empty($fbr_status_filter) && $fbr_status_filter !== 'all') {
            $where[] = "si.fbr_status = ?";
            $params[] = $fbr_status_filter;
        }

        $whereClause = implode(' AND ', $where);

        // Summary Calculations (Excluding Cancelled for Net Sales, but tracking cancelled count)
        $summarySql = "SELECT 
            COUNT(*) as total_invoices,
            SUM(CASE WHEN si.is_cancelled = 0 AND si.is_posted = 1 THEN 1 ELSE 0 END) as valid_posted_invoices,
            SUM(CASE WHEN si.is_cancelled = 1 THEN 1 ELSE 0 END) as cancelled_invoices,
            COALESCE(SUM(CASE WHEN si.is_cancelled = 0 AND si.is_posted = 1 THEN COALESCE(NULLIF(si.gross_amount, 0), si.net_total + COALESCE(si.additional_discount, 0)) ELSE 0 END), 0) as gross_sales,
            COALESCE(SUM(CASE WHEN si.is_cancelled = 0 AND si.is_posted = 1 THEN si.additional_discount ELSE 0 END), 0) as total_discount,
            COALESCE(SUM(CASE WHEN si.is_cancelled = 0 AND si.is_posted = 1 THEN (si.net_total - (COALESCE(NULLIF(si.gross_amount, 0), si.net_total + COALESCE(si.additional_discount, 0)) - si.additional_discount)) ELSE 0 END), 0) as tax_amount,
            COALESCE(SUM(CASE WHEN si.is_cancelled = 0 AND si.is_posted = 1 THEN si.net_total ELSE 0 END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN si.is_cancelled = 1 THEN si.net_total ELSE 0 END), 0) as cancelled_amount
            FROM sale_invoices si
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            WHERE $whereClause";

        $stmtSum = $pdo->prepare($summarySql);
        $stmtSum->execute($params);
        $summary = $stmtSum->fetch(PDO::FETCH_ASSOC);

        $validCount = intval($summary['valid_posted_invoices'] ?? 0);
        $netSales = floatval($summary['net_sales'] ?? 0);
        $summary['avg_invoice_value'] = $validCount > 0 ? ($netSales / $validCount) : 0;

        // Fetch Returns in this period for reconciliation
        $retWhere = ["sr.company_id = ?", "sr.is_cancelled = 0"];
        $retParams = [$company_id];
        if ($branch_id) {
            $retWhere[] = "sr.inventory_location_id = ?";
            $retParams[] = $branch_id;
        }
        if (!empty($from_date)) {
            $retWhere[] = "sr.return_date >= ?";
            $retParams[] = $from_date;
        }
        if (!empty($to_date)) {
            $retWhere[] = "sr.return_date <= ?";
            $retParams[] = $to_date;
        }
        $retSql = "SELECT COUNT(*) as return_count, COALESCE(SUM(net_total), 0) as return_amount FROM sale_returns sr WHERE " . implode(' AND ', $retWhere);
        $stmtRet = $pdo->prepare($retSql);
        $stmtRet->execute($retParams);
        $retData = $stmtRet->fetch(PDO::FETCH_ASSOC);

        $summary['returns_count'] = intval($retData['return_count'] ?? 0);
        $summary['returns_amount'] = floatval($retData['return_amount'] ?? 0);
        $summary['net_revenue'] = $netSales - floatval($retData['return_amount'] ?? 0);

        // Fetch Paginated Invoices
        $listSql = "SELECT si.id, si.serial_no, si.pos_invoice_no, si.invoice_date, si.created_at,
                    si.payment_terms, COALESCE(NULLIF(si.gross_amount, 0), si.net_total + COALESCE(si.additional_discount, 0)) as gross_amount, si.additional_discount, si.net_total,
                    si.fbr_status, si.fbr_invoice_number, si.is_cancelled, si.is_posted,
                    c.name as customer_name, b.branch_name,
                    DATE_FORMAT(si.invoice_date, '%Y-%m-%d') as formatted_time
                    FROM sale_invoices si
                    LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                    LEFT JOIN company_branches b ON si.inventory_location_id = b.id
                    WHERE $whereClause
                    ORDER BY si.id DESC
                    LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'summary' => $summary,
            'records' => $records,
            'total_records' => intval($summary['total_invoices'] ?? 0),
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 2. PAYMENT REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_payment_report') {
        $where = ["si.company_id = ?", "si.invoice_type = 'POS'", "si.is_cancelled = 0", "si.is_posted = 1"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "si.inventory_location_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "si.invoice_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "si.invoice_date <= ?";
            $params[] = $to_date;
        }
        if (!empty($search)) {
            $where[] = "(si.pos_invoice_no LIKE ? OR CAST(si.serial_no AS CHAR) LIKE ? OR c.name LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $payment_method_filter = trim($_GET['payment_method'] ?? '');
        if (!empty($payment_method_filter) && $payment_method_filter !== 'all') {
            $where[] = "si.payment_terms LIKE ?";
            $params[] = "%{$payment_method_filter}%";
        }

        $whereClause = implode(' AND ', $where);

        // Breakdown by method
        $breakdownSql = "SELECT 
            COALESCE(si.payment_terms, 'Cash') as method,
            COUNT(*) as count,
            COALESCE(SUM(si.net_total), 0) as amount
            FROM sale_invoices si
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            WHERE $whereClause
            GROUP BY COALESCE(si.payment_terms, 'Cash')";

        $stmtBD = $pdo->prepare($breakdownSql);
        $stmtBD->execute($params);
        $breakdown = $stmtBD->fetchAll(PDO::FETCH_ASSOC);

        $totalCount = 0;
        $totalAmount = 0.00;
        foreach ($breakdown as $b) {
            $totalCount += intval($b['count']);
            $totalAmount += floatval($b['amount']);
        }

        // Fetch payment records
        $listSql = "SELECT si.id, si.serial_no, si.pos_invoice_no, si.invoice_date,
                    si.payment_terms, si.net_total, si.amount_received,
                    c.name as customer_name, b.branch_name, 'Paid' as payment_status
                    FROM sale_invoices si
                    LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                    LEFT JOIN company_branches b ON si.inventory_location_id = b.id
                    WHERE $whereClause
                    ORDER BY si.id DESC
                    LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'summary' => [
                'total_transactions' => $totalCount,
                'total_amount' => $totalAmount,
                'breakdown' => $breakdown
            ],
            'records' => $records,
            'total_records' => $totalCount,
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 3. DAY CLOSING REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_day_closing_report') {
        $where = ["company_id = ?"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "branch_id = ?";
            $params[] = $branch_id;
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

        $statSql = "SELECT 
            COUNT(*) as total_closings,
            COALESCE(SUM(net_sales), 0) as total_sales,
            COALESCE(SUM(expected_cash), 0) as total_expected_cash,
            COALESCE(SUM(actual_cash), 0) as total_actual_cash,
            COALESCE(SUM(CASE WHEN cash_difference < 0 THEN ABS(cash_difference) ELSE 0 END), 0) as total_cash_short,
            COALESCE(SUM(CASE WHEN cash_difference > 0 THEN cash_difference ELSE 0 END), 0) as total_cash_excess
            FROM pos_day_closings
            WHERE $whereClause";

        $stmtStat = $pdo->prepare($statSql);
        $stmtStat->execute($params);
        $summary = $stmtStat->fetch(PDO::FETCH_ASSOC);

        $listSql = "SELECT id, closing_no, business_date, branch_name, terminal_info, cashier_name,
                    opening_cash, cash_sales, cash_in, cash_refunds, cash_out,
                    expected_cash, actual_cash, cash_difference, cash_diff_status,
                    approval_status, shift_status, closing_time,
                    DATE_FORMAT(closing_time, '%d-%b-%Y %h:%i %p') as formatted_time
                    FROM pos_day_closings
                    WHERE $whereClause
                    ORDER BY id DESC
                    LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'summary' => $summary,
            'records' => $records,
            'total_records' => intval($summary['total_closings'] ?? 0),
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 4. ITEM / PRODUCT SALES REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_item_sales_report') {
        $where = ["si.company_id = ?", "si.invoice_type = 'POS'", "si.is_posted = 1", "si.is_cancelled = 0"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "si.inventory_location_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "si.invoice_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "si.invoice_date <= ?";
            $params[] = $to_date;
        }

        $category_filter = trim($_GET['category'] ?? '');
        if (!empty($category_filter) && $category_filter !== 'all') {
            $where[] = "i.category_type = ?";
            $params[] = $category_filter;
        }

        if (!empty($search)) {
            $where[] = "(sii.description LIKE ? OR sii.hs_code LIKE ? OR i.name LIKE ? OR i.code LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $whereClause = implode(' AND ', $where);

        $sql = "SELECT 
            sii.item_coa_id,
            COALESCE(i.code, sii.hs_code, 'N/A') as item_code,
            COALESCE(sii.description, i.name) as item_name,
            COALESCE(i.category_type, 'General') as category,
            sii.unit,
            COUNT(DISTINCT si.id) as orders_count,
            SUM(sii.quantity) as total_qty_sold,
            SUM(sii.gross_amount) as gross_sales,
            SUM(sii.discount_amount) as total_discount,
            SUM(sii.sales_tax_amount) as total_tax,
            SUM(sii.net_amount) as net_sales
            FROM sale_invoice_items sii
            JOIN sale_invoices si ON sii.invoice_id = si.id
            LEFT JOIN inv_items i ON sii.item_coa_id = i.id
            WHERE $whereClause
            GROUP BY sii.item_coa_id, COALESCE(sii.description, i.name), COALESCE(i.code, sii.hs_code), COALESCE(i.category_type, 'General'), sii.unit
            ORDER BY net_sales DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $allItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalUniqueItems = count($allItems);
        $totalQtySold = 0;
        $totalItemRevenue = 0.00;

        foreach ($allItems as $itm) {
            $totalQtySold += floatval($itm['total_qty_sold']);
            $totalItemRevenue += floatval($itm['net_sales']);
        }

        $topSeller = $allItems[0]['item_name'] ?? 'N/A';
        $topSellerQty = $allItems[0]['total_qty_sold'] ?? 0;

        // Apply pagination in PHP array slice
        $pagedRecords = array_slice($allItems, $offset, $limit);

        echo json_encode([
            'status' => 'success',
            'summary' => [
                'total_unique_items' => $totalUniqueItems,
                'total_qty_sold' => $totalQtySold,
                'total_revenue' => $totalItemRevenue,
                'top_selling_item' => $topSeller . " ({$topSellerQty} sold)"
            ],
            'records' => $pagedRecords,
            'total_records' => $totalUniqueItems,
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 5. SALES RETURN REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_sales_return_report') {
        $where = ["sr.company_id = ?"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "sr.inventory_location_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "sr.return_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "sr.return_date <= ?";
            $params[] = $to_date;
        }
        if (!empty($search)) {
            $where[] = "(sr.sale_invoice_no LIKE ? OR CAST(sr.serial_no AS CHAR) LIKE ? OR c.name LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $whereClause = implode(' AND ', $where);

        $statSql = "SELECT 
            COUNT(*) as total_returns,
            SUM(CASE WHEN sr.is_cancelled = 0 AND sr.is_posted = 1 THEN 1 ELSE 0 END) as approved_returns,
            COALESCE(SUM(CASE WHEN sr.is_cancelled = 0 AND sr.is_posted = 1 THEN sr.net_total ELSE 0 END), 0) as total_return_amount,
            COALESCE(SUM(CASE WHEN sr.is_cancelled = 0 AND sr.is_posted = 1 THEN sr.amount_paid ELSE 0 END), 0) as total_refunded_amount
            FROM sale_returns sr
            LEFT JOIN coa_list c ON sr.customer_coa_id = c.id
            WHERE $whereClause";

        $stmtStat = $pdo->prepare($statSql);
        $stmtStat->execute($params);
        $summary = $stmtStat->fetch(PDO::FETCH_ASSOC);

        $listSql = "SELECT sr.id, sr.serial_no, sr.return_date, sr.sale_invoice_no,
                    sr.net_total as return_amount, sr.amount_paid as refund_amount,
                    sr.remarks as return_reason, sr.is_cancelled, sr.is_posted,
                    sr.payment_terms, c.name as customer_name, b.branch_name
                    FROM sale_returns sr
                    LEFT JOIN coa_list c ON sr.customer_coa_id = c.id
                    LEFT JOIN company_branches b ON sr.inventory_location_id = b.id
                    WHERE $whereClause
                    ORDER BY sr.id DESC
                    LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'summary' => $summary,
            'records' => $records,
            'total_records' => intval($summary['total_returns'] ?? 0),
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 6. FBR DIGITAL INVOICE REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_fbr_report') {
        $where = ["si.company_id = ?", "si.invoice_type = 'POS'", "si.is_posted = 1", "si.is_cancelled = 0"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "si.inventory_location_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "si.invoice_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "si.invoice_date <= ?";
            $params[] = $to_date;
        }
        if (!empty($search)) {
            $where[] = "(si.pos_invoice_no LIKE ? OR si.fbr_invoice_number LIKE ? OR c.name LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $fbr_status_filter = trim($_GET['status'] ?? '');
        if (!empty($fbr_status_filter) && $fbr_status_filter !== 'all') {
            if ($fbr_status_filter === 'Submitted') {
                $where[] = "si.fbr_status IN ('Submitted', 'Accepted', 'Verified')";
            } elseif ($fbr_status_filter === 'Pending') {
                $where[] = "(si.fbr_status IS NULL OR si.fbr_status = '' OR si.fbr_status = 'Pending' OR si.fbr_status = 'Not Submitted')";
            } elseif ($fbr_status_filter === 'Failed') {
                $where[] = "si.fbr_status IN ('Failed', 'Rejected', 'Error')";
            }
        }

        $whereClause = implode(' AND ', $where);

        $statSql = "SELECT 
            COUNT(*) as total_eligible,
            COALESCE(SUM(si.net_total), 0) as total_amount,
            SUM(CASE WHEN si.fbr_status IN ('Submitted', 'Accepted', 'Verified') THEN 1 ELSE 0 END) as submitted_count,
            COALESCE(SUM(CASE WHEN si.fbr_status IN ('Submitted', 'Accepted', 'Verified') THEN si.net_total ELSE 0 END), 0) as submitted_amount,
            SUM(CASE WHEN si.fbr_status IS NULL OR si.fbr_status = '' OR si.fbr_status = 'Pending' OR si.fbr_status = 'Not Submitted' THEN 1 ELSE 0 END) as pending_count,
            COALESCE(SUM(CASE WHEN si.fbr_status IS NULL OR si.fbr_status = '' OR si.fbr_status = 'Pending' OR si.fbr_status = 'Not Submitted' THEN si.net_total ELSE 0 END), 0) as pending_amount,
            SUM(CASE WHEN si.fbr_status IN ('Failed', 'Rejected', 'Error') THEN 1 ELSE 0 END) as failed_count,
            COALESCE(SUM(CASE WHEN si.fbr_status IN ('Failed', 'Rejected', 'Error') THEN si.net_total ELSE 0 END), 0) as failed_amount
            FROM sale_invoices si
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            WHERE $whereClause";

        $stmtStat = $pdo->prepare($statSql);
        $stmtStat->execute($params);
        $summary = $stmtStat->fetch(PDO::FETCH_ASSOC);

        $listSql = "SELECT si.id, si.serial_no, si.pos_invoice_no, si.invoice_date,
                    si.net_total, si.fbr_status, si.fbr_invoice_number, si.fbr_submitted_at,
                    si.fbr_response, c.name as customer_name, b.branch_name,
                    DATE_FORMAT(si.fbr_submitted_at, '%Y-%m-%d') as formatted_fbr_time
                    FROM sale_invoices si
                    LEFT JOIN coa_list c ON si.customer_coa_id = c.id
                    LEFT JOIN company_branches b ON si.inventory_location_id = b.id
                    WHERE $whereClause
                    ORDER BY si.id DESC
                    LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'summary' => $summary,
            'records' => $records,
            'total_records' => intval($summary['total_eligible'] ?? 0),
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 7. HOLD / RECALL REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_hold_report') {
        $where = ["h.company_id = ?"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "h.branch_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "h.hold_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "h.hold_date <= ?";
            $params[] = $to_date;
        }
        if (!empty($search)) {
            $where[] = "(h.hold_no LIKE ? OR h.customer_name LIKE ? OR h.final_invoice_no LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $hold_status_filter = trim($_GET['status'] ?? '');
        if (!empty($hold_status_filter) && $hold_status_filter !== 'all') {
            $where[] = "h.status = ?";
            $params[] = $hold_status_filter;
        }

        $whereClause = implode(' AND ', $where);

        $statSql = "SELECT 
            COUNT(*) as total_holds,
            COALESCE(SUM(net_total), 0) as total_amount,
            SUM(CASE WHEN status = 'On Hold' THEN 1 ELSE 0 END) as on_hold_count,
            COALESCE(SUM(CASE WHEN status = 'On Hold' THEN net_total ELSE 0 END), 0) as on_hold_amount,
            SUM(CASE WHEN status = 'Recalled' THEN 1 ELSE 0 END) as recalled_count,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count
            FROM pos_hold_sales h
            WHERE $whereClause";

        $stmtStat = $pdo->prepare($statSql);
        $stmtStat->execute($params);
        $summary = $stmtStat->fetch(PDO::FETCH_ASSOC);

        $listSql = "SELECT h.id, h.hold_no, h.hold_date, h.hold_time, h.hold_datetime,
                    h.customer_name, h.branch_name, h.cashier_name, h.items_count,
                    h.net_total, h.status, h.final_invoice_no, h.recalled_at,
                    DATE_FORMAT(h.hold_datetime, '%Y-%m-%d') as formatted_datetime
                    FROM pos_hold_sales h
                    WHERE $whereClause
                    ORDER BY h.id DESC
                    LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'summary' => $summary,
            'records' => $records,
            'total_records' => intval($summary['total_holds'] ?? 0),
            'page' => $page,
            'limit' => $limit
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // 8. CASHIER / BRANCH PERFORMANCE REPORT
    // -------------------------------------------------------------------------
    if ($action === 'get_cashier_branch_report') {
        $where = ["si.company_id = ?", "si.invoice_type = 'POS'", "si.is_posted = 1", "si.is_cancelled = 0"];
        $params = [$company_id];

        if ($branch_id) {
            $where[] = "si.inventory_location_id = ?";
            $params[] = $branch_id;
        }
        if (!empty($from_date)) {
            $where[] = "si.invoice_date >= ?";
            $params[] = $from_date;
        }
        if (!empty($to_date)) {
            $where[] = "si.invoice_date <= ?";
            $params[] = $to_date;
        }

        $whereClause = implode(' AND ', $where);

        $sql = "SELECT 
            si.inventory_location_id as branch_id,
            COALESCE(b.branch_name, 'Main Branch') as branch_name,
            COALESCE(si.remarks, 'Default') as cashier_name,
            COUNT(*) as total_invoices,
            SUM(COALESCE(NULLIF(si.gross_amount, 0), si.net_total + COALESCE(si.additional_discount, 0))) as gross_sales,
            SUM(si.additional_discount) as total_discount,
            SUM(si.net_total) as net_sales,
            SUM(CASE WHEN si.payment_terms = 'Cash' THEN si.net_total ELSE 0 END) as cash_sales,
            SUM(CASE WHEN si.payment_terms != 'Cash' THEN si.net_total ELSE 0 END) as non_cash_sales
            FROM sale_invoices si
            LEFT JOIN company_branches b ON si.inventory_location_id = b.id
            WHERE $whereClause
            GROUP BY si.inventory_location_id, COALESCE(b.branch_name, 'Main Branch'), COALESCE(si.remarks, 'Default')
            ORDER BY net_sales DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalBranches = count(array_unique(array_column($records, 'branch_id')));
        $totalInvoices = array_sum(array_column($records, 'total_invoices'));
        $totalSales = array_sum(array_column($records, 'net_sales'));

        echo json_encode([
            'status' => 'success',
            'summary' => [
                'total_branches' => $totalBranches,
                'total_invoices' => $totalInvoices,
                'total_sales' => $totalSales,
                'top_branch' => $records[0]['branch_name'] ?? 'N/A'
            ],
            'records' => $records,
            'total_records' => count($records)
        ]);
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Invalid action: ' . htmlspecialchars($action)]);
    exit;

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => 'Server error: ' . $e->getMessage()]);
    exit;
}
