<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? null;

if (!$company_id) {
    echo json_encode(['error' => 'Company ID is required']);
    exit;
}

if ($action === 'get_pos_dashboard') {
    $from_date = !empty($_GET['from_date']) ? trim($_GET['from_date']) : (!empty($_GET['date']) ? trim($_GET['date']) : date('Y-m-d'));
    $to_date = !empty($_GET['to_date']) ? trim($_GET['to_date']) : $from_date;
    if ($from_date > $to_date) {
        $temp = $from_date;
        $from_date = $to_date;
        $to_date = $temp;
    }
    
    // User role & branch identification
    $user_role = strtoupper(trim($_GET['role'] ?? ($_SESSION['role'] ?? '')));
    $session_branch = !empty($_GET['session_branch_id']) ? intval($_GET['session_branch_id']) : (!empty($_SESSION['branch_id']) ? intval($_SESSION['branch_id']) : null);
    $user_id = intval($_GET['user_id'] ?? ($_SESSION['user_id'] ?? 0));
    
    $is_admin = ($user_role === 'ADMIN' || $user_role === 'ADMINISTRATOR' || $user_id === 1);
    
    // Fallback: If not admin and session_branch is missing, fetch user's assigned branch from DB
    if (!$is_admin && empty($session_branch) && $user_id > 0) {
        try {
            $uStmt = $pdo->prepare("SELECT branch_id FROM users WHERE id = ? AND company_id = ?");
            $uStmt->execute([$user_id, $company_id]);
            $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
            if ($uRow && !empty($uRow['branch_id'])) {
                $session_branch = intval($uRow['branch_id']);
            }
        } catch (Exception $e) {}
    }

    $branch_id = null;
    $is_pos_restricted = false;

    if ($is_admin) {
        $requested = $_GET['branch_id'] ?? '';
        if ($requested !== '' && $requested !== 'all' && $requested !== null && intval($requested) > 0) {
            $branch_id = intval($requested);
        }
    } else {
        // POS / Non-admin users: strictly restrict to their assigned branch only
        $is_pos_restricted = true;
        if (!empty($session_branch) && intval($session_branch) > 0) {
            $branch_id = intval($session_branch);
        } elseif (!empty($_GET['branch_id']) && $_GET['branch_id'] !== 'all' && intval($_GET['branch_id']) > 0) {
            $branch_id = intval($_GET['branch_id']);
        }
    }

    // When restricted, if branch_id is present, filter by inventory_location_id.
    // If no branch is found for a restricted user, force a non-matching ID so other branches never leak!
    if ($is_pos_restricted) {
        if ($branch_id && $branch_id > 0) {
            $branchSql = " AND inventory_location_id = " . intval($branch_id);
            $branchSiSql = " AND si.inventory_location_id = " . intval($branch_id);
        } else {
            $branchSql = " AND inventory_location_id = -999";
            $branchSiSql = " AND si.inventory_location_id = -999";
        }
    } else {
        $branchSql = ($branch_id && $branch_id > 0) ? " AND inventory_location_id = " . intval($branch_id) : "";
        $branchSiSql = ($branch_id && $branch_id > 0) ? " AND si.inventory_location_id = " . intval($branch_id) : "";
    }
    
    // 1. Sales for date range
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(net_total), 0) as total_sale FROM sale_invoices WHERE company_id = ? AND DATE(invoice_date) BETWEEN ? AND ? AND is_cancelled = 0 AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))$branchSql");
    $stmt->execute([$company_id, $from_date, $to_date]);
    $total_sale = $stmt->fetchColumn();

    // 2. Total Invoices for date range
    $stmt = $pdo->prepare("SELECT COUNT(id) FROM sale_invoices WHERE company_id = ? AND DATE(invoice_date) BETWEEN ? AND ? AND is_cancelled = 0 AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != ''))$branchSql");
    $stmt->execute([$company_id, $from_date, $to_date]);
    $total_invoices = $stmt->fetchColumn();

    // 3. Cash Received for date range
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(COALESCE(NULLIF(amount_received, 0), net_total)), 0) FROM sale_invoices WHERE company_id = ? AND DATE(invoice_date) BETWEEN ? AND ? AND is_cancelled = 0 AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != '')) AND (payment_terms = 'Cash' OR payment_terms IS NULL OR payment_terms = '')$branchSql");
    $stmt->execute([$company_id, $from_date, $to_date]);
    $cash_received = $stmt->fetchColumn();

    // 4. FBR Pending for date range
    $fbr_pending = 0;
    try {
        $stmt = $pdo->prepare("SELECT COUNT(id) FROM sale_invoices WHERE company_id = ? AND DATE(invoice_date) BETWEEN ? AND ? AND is_cancelled = 0 AND (invoice_type = 'POS' OR (pos_invoice_no IS NOT NULL AND pos_invoice_no != '')) AND (fbr_status = 'Pending' OR fbr_status = 'Not Submitted' OR fbr_status = '' OR fbr_status IS NULL)$branchSql");
        $stmt->execute([$company_id, $from_date, $to_date]);
        $fbr_pending = $stmt->fetchColumn();
    } catch (PDOException $e) {}

    // 5. Recent Invoices for selected date range (by default Today)
    $recent_invoices = [];
    try {
        $stmt = $pdo->prepare("
            SELECT si.id, 
                   COALESCE(NULLIF(si.pos_invoice_no, ''), CONCAT('INV-', LPAD(si.serial_no, 4, '0'))) as invoice_no, 
                   si.invoice_date, 
                   DATE_FORMAT(si.invoice_date, '%Y-%m-%d') as formatted_time,
                   si.net_total, 
                   si.fbr_status,
                   si.fbr_invoice_number,
                   COALESCE(c.name, 'Walk-in Customer') as customer_name,
                   COALESCE(b.branch_name, 'Main Branch') as branch_name,
                   si.inventory_location_id as branch_id
            FROM sale_invoices si
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            LEFT JOIN company_branches b ON si.inventory_location_id = b.id
            WHERE si.company_id = ? AND DATE(si.invoice_date) BETWEEN ? AND ? AND si.is_cancelled = 0 AND (si.invoice_type = 'POS' OR (si.pos_invoice_no IS NOT NULL AND si.pos_invoice_no != ''))$branchSiSql
            ORDER BY si.id DESC LIMIT 50
        ");
        $stmt->execute([$company_id, $from_date, $to_date]);
        $recent_invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {}

    // 6. Branches list for this company
    $branches = [];
    try {
        if ($is_admin) {
            $stmtB = $pdo->prepare("SELECT id, branch_code, branch_name, status FROM company_branches WHERE company_id = ? ORDER BY branch_name ASC");
            $stmtB->execute([$company_id]);
            $branches = $stmtB->fetchAll(PDO::FETCH_ASSOC);
        } else {
            if ($branch_id && $branch_id > 0) {
                $stmtB = $pdo->prepare("SELECT id, branch_code, branch_name, status FROM company_branches WHERE company_id = ? AND id = ?");
                $stmtB->execute([$company_id, $branch_id]);
                $branches = $stmtB->fetchAll(PDO::FETCH_ASSOC);
            }
        }
    } catch (Exception $e) {}

    echo json_encode([
        'status' => 'success',
        'today_sale' => (float)$total_sale,
        'total_invoices' => (int)$total_invoices,
        'cash_received' => (float)$cash_received,
        'fbr_pending' => (int)$fbr_pending,
        'recent_invoices' => $recent_invoices,
        'branches' => $branches,
        'selected_branch_id' => $branch_id,
        'is_pos_restricted' => $is_pos_restricted,
        'user_role' => $user_role,
        'from_date' => $from_date,
        'to_date' => $to_date
    ]);
    exit;
}

if ($action === 'get_next_pos_invoice_no') {
    $branch_id = intval($_GET['branch_id'] ?? 0);
    $prefix = '';

    if ($branch_id > 0) {
        $b_stmt = $pdo->prepare("SELECT id, invoice_series, branch_code, branch_name FROM company_branches WHERE id = ? AND company_id = ?");
        $b_stmt->execute([$branch_id, $company_id]);
        $branch = $b_stmt->fetch(PDO::FETCH_ASSOC);
        if ($branch && !empty(trim($branch['invoice_series'] ?? ''))) {
            $prefix = trim($branch['invoice_series']);
        } elseif ($branch && !empty(trim($branch['branch_code'] ?? ''))) {
            $prefix = trim($branch['branch_code']) . '-POS-';
        }
    }

    if (empty($prefix)) {
        try {
            $set_stmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = 'gen_invoice_series'");
            $set_stmt->execute([$company_id]);
            $gen_series = trim($set_stmt->fetchColumn() ?: '');
            if (!empty($gen_series)) {
                $prefix = $gen_series;
            }
        } catch (Exception $e) {}
    }

    if (empty($prefix)) {
        $prefix = 'POS-INV-';
    }

    $max_seq = 0;
    try {
        $inv_stmt = $pdo->prepare("
            SELECT pos_invoice_no FROM sale_invoices 
            WHERE company_id = ? 
              AND (
                  (? > 0 AND inventory_location_id = ? AND pos_invoice_no IS NOT NULL AND pos_invoice_no != '')
                  OR pos_invoice_no LIKE ?
              )
        ");
        $inv_stmt->execute([$company_id, $branch_id, $branch_id, $prefix . '%']);
        $existing = $inv_stmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($existing as $inv_no) {
            $inv_no = trim($inv_no);
            if (strpos($inv_no, $prefix) === 0) {
                $suffix = substr($inv_no, strlen($prefix));
                if (preg_match('/^(\d+)/', $suffix, $m)) {
                    $num = intval($m[1]);
                    if ($num > $max_seq) $max_seq = $num;
                }
            }
        }
    } catch (Exception $e) {}

    $next_seq = $max_seq + 1;
    $formatted_seq = str_pad($next_seq, 2, '0', STR_PAD_LEFT);
    $next_invoice_no = $prefix . $formatted_seq;

    $maxSnStmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM sale_invoices WHERE company_id = ? AND is_tax_invoice = 0");
    $maxSnStmt->execute([$company_id]);
    $globalNextSn = intval($maxSnStmt->fetchColumn() ?: 0) + 1;

    echo json_encode([
        'status' => 'success',
        'prefix' => $prefix,
        'sequence_no' => $next_seq,
        'formatted_seq' => $formatted_seq,
        'next_invoice_no' => $next_invoice_no,
        'serial_no' => $globalNextSn
    ]);
    exit;
}

if ($action === 'login_to_branch') {
    $branch_id = intval($_GET['branch_id'] ?? 0);
    if ($branch_id <= 0) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid Branch ID']);
        exit;
    }
    
    $bStmt = $pdo->prepare("SELECT id, branch_code, branch_name, invoice_series, status FROM company_branches WHERE id = ? AND company_id = ?");
    $bStmt->execute([$branch_id, $company_id]);
    $branch = $bStmt->fetch(PDO::FETCH_ASSOC);
    if (!$branch) {
        echo json_encode(['status' => 'error', 'message' => 'Branch not found']);
        exit;
    }

    // Check if there is an existing POS user assigned to this branch
    $posUser = null;
    try {
        $uStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE branch_id = ? AND company_id = ? AND role = 'POS' LIMIT 1");
        $uStmt->execute([$branch_id, $company_id]);
        $posUser = $uStmt->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $_SESSION['role'] = 'POS';
    $_SESSION['branch_id'] = $branch['id'];
    $_SESSION['branch_name'] = $branch['branch_name'];
    $_SESSION['branch_code'] = $branch['branch_code'];
    $_SESSION['invoice_series'] = !empty($branch['invoice_series']) ? $branch['invoice_series'] : (!empty($branch['branch_code']) ? ($branch['branch_code'] . '-POS-') : 'POS-INV-');
    $_SESSION['switched_by_admin'] = true;
    if ($posUser) {
        $_SESSION['user_id'] = $posUser['id'];
        $_SESSION['username'] = $posUser['username'];
    }

    echo json_encode([
        'status' => 'success',
        'branch' => $branch,
        'pos_user' => $posUser
    ]);
    exit;
}

if ($action === 'restore_admin_session') {
    $admin_user_id = intval($_GET['user_id'] ?? 0);
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if ($admin_user_id > 0) {
        try {
            $uStmt = $pdo->prepare("SELECT id, username, role, company_id FROM users WHERE id = ? AND company_id = ?");
            $uStmt->execute([$admin_user_id, $company_id]);
            $adminUser = $uStmt->fetch(PDO::FETCH_ASSOC);
            if ($adminUser) {
                $_SESSION['user_id'] = $adminUser['id'];
                $_SESSION['username'] = $adminUser['username'];
                $_SESSION['role'] = $adminUser['role'];
                $_SESSION['company_id'] = $adminUser['company_id'];
            }
        } catch (Exception $e) {}
    } else {
        $_SESSION['role'] = 'Admin';
    }
    unset($_SESSION['branch_id'], $_SESSION['branch_name'], $_SESSION['branch_code'], $_SESSION['invoice_series'], $_SESSION['switched_by_admin']);

    echo json_encode(['status' => 'success']);
    exit;
}

echo json_encode(['error' => 'Invalid action']);
?>
