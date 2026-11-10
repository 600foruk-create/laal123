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
    // 1. pos_hold_sales table
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_hold_sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL DEFAULT 1,
        branch_id INT DEFAULT NULL,
        branch_name VARCHAR(150) DEFAULT NULL,
        hold_no VARCHAR(50) NOT NULL,
        hold_date DATE NOT NULL,
        hold_time TIME NOT NULL,
        hold_datetime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        terminal_info VARCHAR(100) DEFAULT NULL,
        customer_id INT NOT NULL DEFAULT 0,
        customer_name VARCHAR(255) NOT NULL DEFAULT 'Walk-in Customer',
        customer_mobile VARCHAR(100) DEFAULT NULL,
        customer_address VARCHAR(500) DEFAULT NULL,
        subtotal DECIMAL(15,2) DEFAULT 0,
        discount DECIMAL(15,2) DEFAULT 0,
        total_after_disc DECIMAL(15,2) DEFAULT 0,
        tax_amount DECIMAL(15,2) DEFAULT 0,
        net_total DECIMAL(15,2) DEFAULT 0,
        items_count INT DEFAULT 0,
        total_qty DECIMAL(15,2) DEFAULT 0,
        total_pieces DECIMAL(15,2) DEFAULT 0,
        hold_reason VARCHAR(255) DEFAULT 'Temporary Hold',
        cashier_user_id INT DEFAULT NULL,
        cashier_name VARCHAR(150) DEFAULT NULL,
        status ENUM('On Hold', 'Recalled', 'Completed', 'Cancelled') NOT NULL DEFAULT 'On Hold',
        final_invoice_id INT DEFAULT NULL,
        final_invoice_no VARCHAR(100) DEFAULT NULL,
        recalled_at DATETIME DEFAULT NULL,
        recalled_by_user_id INT DEFAULT NULL,
        recalled_by_name VARCHAR(150) DEFAULT NULL,
        completed_at DATETIME DEFAULT NULL,
        cancelled_at DATETIME DEFAULT NULL,
        cancelled_by_user_id INT DEFAULT NULL,
        cancel_reason VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (hold_no),
        INDEX (status),
        INDEX (hold_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. pos_hold_sale_items table
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_hold_sale_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hold_id INT NOT NULL,
        item_coa_id INT NOT NULL,
        item_code VARCHAR(100) DEFAULT NULL,
        hs_code VARCHAR(50) DEFAULT NULL,
        description TEXT DEFAULT NULL,
        pieces DECIMAL(15,2) DEFAULT 0,
        quantity DECIMAL(15,2) DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs',
        rate DECIMAL(20,4) DEFAULT 0,
        val_excl_tax DECIMAL(15,2) DEFAULT 0,
        sales_tax_rate DECIMAL(10,2) DEFAULT 0,
        sales_tax_amount DECIMAL(15,2) DEFAULT 0,
        val_incl_tax DECIMAL(15,2) DEFAULT 0,
        sort_order INT DEFAULT 0,
        INDEX (hold_id),
        INDEX (item_coa_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {
    // Log schema errors if any, but continue
    error_log("POS Hold Sale Migration Error: " . $e->getMessage());
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
    // ACTION: hold_sale
    // Saves sale temporarily in ERP database.
    // STRICT FBR RESTRICTION: No FBR API call, no stock deduction, no voucher.
    // -------------------------------------------------------------------------
    if ($action === 'hold_sale') {
        $branch_id = !empty($postData['branch_id']) ? intval($postData['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $branch_name = trim($postData['branch_name'] ?? '');
        $customer_id = intval($postData['customer_id'] ?? 0);
        $customer_name = trim($postData['customer_name'] ?? 'Walk-in Customer');
        $customer_mobile = trim($postData['customer_mobile'] ?? '');
        $customer_address = trim($postData['customer_address'] ?? '');
        $subtotal = floatval($postData['subtotal'] ?? 0);
        $discount = floatval($postData['discount'] ?? 0);
        $total_after_disc = floatval($postData['total_after_disc'] ?? ($subtotal - $discount));
        $tax_amount = floatval($postData['tax_amount'] ?? 0);
        $net_total = floatval($postData['net_total'] ?? ($total_after_disc + $tax_amount));
        $hold_reason = trim($postData['hold_reason'] ?? 'Temporary Hold');
        if (empty($hold_reason)) $hold_reason = 'Temporary Hold';
        
        $cashier_user_id = !empty($postData['cashier_user_id']) ? intval($postData['cashier_user_id']) : null;
        $cashier_name = trim($postData['cashier_name'] ?? 'Cashier');
        $terminal_info = trim($postData['terminal_info'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'POS-Terminal-1'));

        $items = $postData['items'] ?? [];
        if (!is_array($items) || count($items) === 0) {
            echo json_encode(['status' => 'error', 'message' => 'Cannot hold sale with no items. Please add at least one item.']);
            exit;
        }

        // Filter valid items (must have valid item_coa_id and qty > 0)
        $validItems = [];
        $total_qty = 0;
        $total_pieces = 0;
        foreach ($items as $itm) {
            $itemId = intval($itm['item_coa_id'] ?? 0);
            $qty = floatval($itm['quantity'] ?? 0);
            if ($itemId > 0 && $qty > 0) {
                $validItems[] = $itm;
                $total_qty += $qty;
                $total_pieces += floatval($itm['pieces'] ?? 0);
            }
        }

        if (count($validItems) === 0) {
            echo json_encode(['status' => 'error', 'message' => 'No valid items with quantity found to put on hold.']);
            exit;
        }

        $items_count = count($validItems);

        // Fetch Branch Series or default prefix
        $prefix = 'HOLD-';
        if ($branch_id) {
            $stmtB = $pdo->prepare("SELECT branch_code, branch_name FROM branches WHERE id = ?");
            $stmtB->execute([$branch_id]);
            $bRow = $stmtB->fetch(PDO::FETCH_ASSOC);
            if ($bRow) {
                if (empty($branch_name)) $branch_name = $bRow['branch_name'];
                if (!empty($bRow['branch_code'])) {
                    $prefix = $bRow['branch_code'] . '-HOLD-';
                }
            }
        }

        // Generate next Hold Number atomically
        $pdo->beginTransaction();

        $stmtSeq = $pdo->prepare("SELECT hold_no FROM pos_hold_sales WHERE company_id = ? AND hold_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE");
        $stmtSeq->execute([$company_id, "{$prefix}%"]);
        $lastHold = $stmtSeq->fetch(PDO::FETCH_ASSOC);

        $nextNum = 1;
        if ($lastHold && !empty($lastHold['hold_no'])) {
            $parts = explode('-', $lastHold['hold_no']);
            $lastInt = intval(end($parts));
            if ($lastInt > 0) {
                $nextNum = $lastInt + 1;
            }
        }
        $hold_no = $prefix . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

        $hold_date = date('Y-m-d');
        $hold_time = date('H:i:s');
        $hold_datetime = date('Y-m-d H:i:s');

        // Insert Header
        $stmtIns = $pdo->prepare("INSERT INTO pos_hold_sales 
            (company_id, branch_id, branch_name, hold_no, hold_date, hold_time, hold_datetime, terminal_info, 
             customer_id, customer_name, customer_mobile, customer_address, 
             subtotal, discount, total_after_disc, tax_amount, net_total, 
             items_count, total_qty, total_pieces, hold_reason, cashier_user_id, cashier_name, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'On Hold')");
        
        $stmtIns->execute([
            $company_id, $branch_id, $branch_name, $hold_no, $hold_date, $hold_time, $hold_datetime, $terminal_info,
            $customer_id, $customer_name, $customer_mobile, $customer_address,
            $subtotal, $discount, $total_after_disc, $tax_amount, $net_total,
            $items_count, $total_qty, $total_pieces, $hold_reason, $cashier_user_id, $cashier_name
        ]);

        $hold_id = $pdo->lastInsertId();

        // Insert Line Items
        $stmtItem = $pdo->prepare("INSERT INTO pos_hold_sale_items 
            (hold_id, item_coa_id, item_code, hs_code, description, pieces, quantity, unit, rate, val_excl_tax, sales_tax_rate, sales_tax_amount, val_incl_tax, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $idx = 0;
        foreach ($validItems as $row) {
            $idx++;
            $stmtItem->execute([
                $hold_id,
                intval($row['item_coa_id']),
                trim($row['item_code'] ?? ''),
                trim($row['hs_code'] ?? ''),
                trim($row['description'] ?? ''),
                floatval($row['pieces'] ?? 0),
                floatval($row['quantity'] ?? 0),
                trim($row['unit'] ?? 'pcs'),
                floatval($row['rate'] ?? 0),
                floatval($row['val_excl_tax'] ?? 0),
                floatval($row['sales_tax_rate'] ?? 0),
                floatval($row['sales_tax_amount'] ?? 0),
                floatval($row['val_incl_tax'] ?? 0),
                $idx
            ]);
        }

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'hold_id' => $hold_id,
            'hold_no' => $hold_no,
            'message' => 'Sale successfully put on hold.',
            'items_count' => $items_count,
            'net_total' => $net_total,
            'hold_datetime' => $hold_datetime
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: get_pending_holds
    // Fetches list of active holds available for recall (Status: 'On Hold' or 'Recalled').
    // -------------------------------------------------------------------------
    if ($action === 'get_pending_holds') {
        $search = trim($_GET['search'] ?? '');
        $date = trim($_GET['date'] ?? '');
        $branch_id = !empty($_GET['branch_id']) ? intval($_GET['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $include_recalled = isset($_GET['include_recalled']) ? (intval($_GET['include_recalled']) === 1) : true;

        $where = ["h.company_id = ?"];
        $params = [$company_id];

        if ($include_recalled) {
            $where[] = "h.status IN ('On Hold', 'Recalled')";
        } else {
            $where[] = "h.status = 'On Hold'";
        }

        if ($branch_id) {
            $where[] = "h.branch_id = ?";
            $params[] = $branch_id;
        }

        if (!empty($date)) {
            $where[] = "h.hold_date = ?";
            $params[] = $date;
        }

        if (!empty($search)) {
            $where[] = "(h.hold_no LIKE ? OR h.customer_name LIKE ? OR h.customer_mobile LIKE ? OR h.cashier_name LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $sql = "SELECT h.*, 
                    DATE_FORMAT(h.hold_datetime, '%d-%b-%Y %h:%i %p') as formatted_datetime,
                    DATE_FORMAT(h.hold_time, '%h:%i %p') as formatted_time
                FROM pos_hold_sales h 
                WHERE " . implode(' AND ', $where) . " 
                ORDER BY h.id DESC 
                LIMIT 100";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $holds = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'holds' => $holds,
            'count' => count($holds)
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: get_hold_details
    // Returns full hold header and items array
    // -------------------------------------------------------------------------
    if ($action === 'get_hold_details') {
        $hold_id = intval($_GET['hold_id'] ?? 0);
        if ($hold_id <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid Hold ID provided.']);
            exit;
        }

        $stmtH = $pdo->prepare("SELECT h.*, 
                    DATE_FORMAT(h.hold_datetime, '%d-%b-%Y %h:%i %p') as formatted_datetime
                FROM pos_hold_sales h 
                WHERE h.id = ? AND h.company_id = ? " . (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id']) ? " AND h.branch_id = " . intval($_SESSION['branch_id']) : ""));
        $stmtH->execute([$hold_id, $company_id]);
        $hold = $stmtH->fetch(PDO::FETCH_ASSOC);

        if (!$hold) {
            echo json_encode(['status' => 'error', 'message' => 'Hold record not found or access denied.']);
            exit;
        }

        $stmtI = $pdo->prepare("SELECT * FROM pos_hold_sale_items WHERE hold_id = ? ORDER BY sort_order ASC, id ASC");
        $stmtI->execute([$hold_id]);
        $items = $stmtI->fetchAll(PDO::FETCH_ASSOC);

        $hold['items'] = $items;

        echo json_encode([
            'status' => 'success',
            'hold' => $hold
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: recall_hold
    // Recalls a held sale back into POS Sale.
    // Checks if already Completed or Cancelled. Updates status to 'Recalled'.
    // STRICT FBR RESTRICTION: No FBR API call.
    // -------------------------------------------------------------------------
    if ($action === 'recall_hold') {
        $hold_id = intval($postData['hold_id'] ?? $_GET['hold_id'] ?? 0);
        if ($hold_id <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid Hold ID for recall.']);
            exit;
        }

        $pdo->beginTransaction();

        $stmtH = $pdo->prepare("SELECT * FROM pos_hold_sales WHERE id = ? AND company_id = ? " . (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id']) ? " AND branch_id = " . intval($_SESSION['branch_id']) : "") . " FOR UPDATE");
        $stmtH->execute([$hold_id, $company_id]);
        $hold = $stmtH->fetch(PDO::FETCH_ASSOC);

        if (!$hold) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => 'Hold record not found or access denied.']);
            exit;
        }

        if ($hold['status'] === 'Completed') {
            $pdo->rollBack();
            echo json_encode([
                'status' => 'error', 
                'message' => "This sale has already been completed and posted as Invoice #{$hold['final_invoice_no']}. It cannot be recalled again."
            ]);
            exit;
        }

        if ($hold['status'] === 'Cancelled') {
            $pdo->rollBack();
            echo json_encode([
                'status' => 'error', 
                'message' => "This hold sale was cancelled on {$hold['cancelled_at']}. Reason: " . ($hold['cancel_reason'] ?: 'None')
            ]);
            exit;
        }

        // Update status to 'Recalled'
        $recalled_by_user_id = !empty($postData['cashier_user_id']) ? intval($postData['cashier_user_id']) : null;
        $recalled_by_name = trim($postData['cashier_name'] ?? '');

        $stmtUpd = $pdo->prepare("UPDATE pos_hold_sales SET 
            status = 'Recalled', 
            recalled_at = NOW(), 
            recalled_by_user_id = ?, 
            recalled_by_name = ? 
            WHERE id = ?");
        $stmtUpd->execute([$recalled_by_user_id, $recalled_by_name, $hold_id]);

        // Fetch Items
        $stmtI = $pdo->prepare("SELECT * FROM pos_hold_sale_items WHERE hold_id = ? ORDER BY sort_order ASC, id ASC");
        $stmtI->execute([$hold_id]);
        $items = $stmtI->fetchAll(PDO::FETCH_ASSOC);

        $hold['status'] = 'Recalled';
        $hold['items'] = $items;

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'message' => "Hold sale {$hold['hold_no']} successfully recalled.",
            'hold' => $hold
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: complete_hold
    // Called when the cashier successfully posts/saves the invoice in POS Sale.
    // Links final invoice and marks hold as 'Completed'.
    // -------------------------------------------------------------------------
    if ($action === 'complete_hold') {
        $hold_id = intval($postData['hold_id'] ?? 0);
        $final_invoice_id = intval($postData['final_invoice_id'] ?? 0);
        $final_invoice_no = trim($postData['final_invoice_no'] ?? '');

        if ($hold_id <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid Hold ID to complete.']);
            exit;
        }

        $stmtH = $pdo->prepare("SELECT id, status, hold_no FROM pos_hold_sales WHERE id = ? AND company_id = ?");
        $stmtH->execute([$hold_id, $company_id]);
        $hold = $stmtH->fetch(PDO::FETCH_ASSOC);

        if (!$hold) {
            echo json_encode(['status' => 'error', 'message' => 'Hold record not found.']);
            exit;
        }

        if ($hold['status'] === 'Completed') {
            echo json_encode(['status' => 'success', 'message' => 'Hold sale is already marked completed.']);
            exit;
        }

        $stmtUpd = $pdo->prepare("UPDATE pos_hold_sales SET 
            status = 'Completed', 
            final_invoice_id = ?, 
            final_invoice_no = ?, 
            completed_at = NOW() 
            WHERE id = ?");
        $stmtUpd->execute([$final_invoice_id, $final_invoice_no, $hold_id]);

        echo json_encode([
            'status' => 'success',
            'message' => "Hold sale {$hold['hold_no']} linked to Invoice #{$final_invoice_no} and completed.",
            'hold_id' => $hold_id
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: cancel_hold
    // Marks a hold as 'Cancelled' with reason.
    // -------------------------------------------------------------------------
    if ($action === 'cancel_hold') {
        $hold_id = intval($postData['hold_id'] ?? 0);
        $cancel_reason = trim($postData['cancel_reason'] ?? 'Cancelled by Cashier');
        $cancelled_by_user_id = !empty($postData['cashier_user_id']) ? intval($postData['cashier_user_id']) : null;

        if ($hold_id <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid Hold ID for cancellation.']);
            exit;
        }

        $stmtH = $pdo->prepare("SELECT id, status, hold_no, final_invoice_no FROM pos_hold_sales WHERE id = ? AND company_id = ?");
        $stmtH->execute([$hold_id, $company_id]);
        $hold = $stmtH->fetch(PDO::FETCH_ASSOC);

        if (!$hold) {
            echo json_encode(['status' => 'error', 'message' => 'Hold record not found.']);
            exit;
        }

        if ($hold['status'] === 'Completed') {
            echo json_encode([
                'status' => 'error', 
                'message' => "Cannot cancel a completed hold sale. It is already posted as Invoice #{$hold['final_invoice_no']}."
            ]);
            exit;
        }

        $stmtUpd = $pdo->prepare("UPDATE pos_hold_sales SET 
            status = 'Cancelled', 
            cancel_reason = ?, 
            cancelled_at = NOW(), 
            cancelled_by_user_id = ? 
            WHERE id = ?");
        $stmtUpd->execute([$cancel_reason, $cancelled_by_user_id, $hold_id]);

        echo json_encode([
            'status' => 'success',
            'message' => "Hold sale {$hold['hold_no']} successfully cancelled.",
            'hold_id' => $hold_id
        ]);
        exit;
    }

    // -------------------------------------------------------------------------
    // ACTION: get_hold_register
    // Returns full hold records, status filtering, date range, branch, search,
    // plus summary stats (total, on_hold, recalled, completed, cancelled).
    // -------------------------------------------------------------------------
    if ($action === 'get_hold_register') {
        $search = trim($_GET['search'] ?? '');
        $status_filter = trim($_GET['status'] ?? '');
        $from_date = trim($_GET['from_date'] ?? '');
        $to_date = trim($_GET['to_date'] ?? '');
        $branch_id = !empty($_GET['branch_id']) ? intval($_GET['branch_id']) : null;
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'POS' && !empty($_SESSION['branch_id'])) {
            $branch_id = intval($_SESSION['branch_id']);
        }
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(5, min(200, intval($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $where = ["h.company_id = ?"];
        $params = [$company_id];

        if (!empty($status_filter) && $status_filter !== 'all') {
            $where[] = "h.status = ?";
            $params[] = $status_filter;
        }

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
            $where[] = "(h.hold_no LIKE ? OR h.customer_name LIKE ? OR h.customer_mobile LIKE ? OR h.cashier_name LIKE ? OR h.final_invoice_no LIKE ?)";
            $term = "%{$search}%";
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $whereClause = implode(' AND ', $where);

        // 1. Calculate Summary Cards (Across current filters)
        $statSql = "SELECT 
            COUNT(*) as total_holds,
            COALESCE(SUM(h.net_total), 0) as total_amount,
            SUM(CASE WHEN h.status = 'On Hold' THEN 1 ELSE 0 END) as on_hold_count,
            COALESCE(SUM(CASE WHEN h.status = 'On Hold' THEN h.net_total ELSE 0 END), 0) as on_hold_amount,
            SUM(CASE WHEN h.status = 'Recalled' THEN 1 ELSE 0 END) as recalled_count,
            COALESCE(SUM(CASE WHEN h.status = 'Recalled' THEN h.net_total ELSE 0 END), 0) as recalled_amount,
            SUM(CASE WHEN h.status = 'Completed' THEN 1 ELSE 0 END) as completed_count,
            COALESCE(SUM(CASE WHEN h.status = 'Completed' THEN h.net_total ELSE 0 END), 0) as completed_amount,
            SUM(CASE WHEN h.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count,
            COALESCE(SUM(CASE WHEN h.status = 'Cancelled' THEN h.net_total ELSE 0 END), 0) as cancelled_amount
            FROM pos_hold_sales h 
            WHERE $whereClause";

        $stmtStat = $pdo->prepare($statSql);
        $stmtStat->execute($params);
        $summary = $stmtStat->fetch(PDO::FETCH_ASSOC);

        // 2. Fetch Records with Pagination
        $listSql = "SELECT h.*, 
            DATE_FORMAT(h.hold_datetime, '%d-%b-%Y %h:%i %p') as formatted_datetime,
            DATE_FORMAT(h.recalled_at, '%d-%b-%Y %h:%i %p') as formatted_recalled_at,
            DATE_FORMAT(h.completed_at, '%d-%b-%Y %h:%i %p') as formatted_completed_at,
            DATE_FORMAT(h.cancelled_at, '%d-%b-%Y %h:%i %p') as formatted_cancelled_at
            FROM pos_hold_sales h 
            WHERE $whereClause 
            ORDER BY h.id DESC 
            LIMIT $limit OFFSET $offset";

        $stmtList = $pdo->prepare($listSql);
        $stmtList->execute($params);
        $records = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        $totalRecords = intval($summary['total_holds'] ?? 0);
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
    // Fallback if no valid action
    // -------------------------------------------------------------------------
    echo json_encode([
        'status' => 'error',
        'message' => 'Unknown or unsupported action requested: ' . htmlspecialchars($action)
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
