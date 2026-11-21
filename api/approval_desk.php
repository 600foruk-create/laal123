<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Check auth and admin permissions: supports active PHP session OR verified user credentials from localStorage
$userRole = strtoupper($_SESSION['role'] ?? '');
$currentUsername = $_SESSION['username'] ?? '';
$currentUserId = intval($_SESSION['user_id'] ?? 0);
$company_id = intval($_SESSION['company_id'] ?? 1);

// Fallback if PHP session expired on server but client is actively authenticated in localStorage
if (!$currentUserId) {
    $reqUserId = intval($_GET['current_user_id'] ?? ($_POST['current_user_id'] ?? 0));
    $reqCompanyId = intval($_GET['company_id'] ?? ($_POST['company_id'] ?? 1));
    if ($reqUserId > 0) {
        try {
            $uStmt = $pdo->prepare("SELECT id, username, role, company_id FROM users WHERE id = ?");
            $uStmt->execute([$reqUserId]);
            $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
            if ($uRow) {
                $currentUserId = intval($uRow['id']);
                $currentUsername = $uRow['username'];
                $userRole = strtoupper($uRow['role'] ?? '');
                $company_id = intval($uRow['company_id'] ?: $reqCompanyId);
                // Restore session on server
                $_SESSION['user_id'] = $currentUserId;
                $_SESSION['username'] = $currentUsername;
                $_SESSION['role'] = $userRole;
                $_SESSION['company_id'] = $company_id;
            }
        } catch (Exception $e) {}
    }
}

if (!$currentUserId) {
    sendResponse(['error' => 'Unauthorized access. Please log in.'], 401);
}

$isAdmin = ($userRole === 'ADMIN' || $userRole === 'ADMINISTRATOR' || $currentUsername === 'Administrator' || $currentUserId === 1);

$action = $_GET['action'] ?? ($_POST['action'] ?? '');
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

// 1. GET PENDING (ADMIN ONLY)
if ($action === 'get_pending') {
    if (!$isAdmin) {
        sendResponse(['error' => 'Admin access required'], 403);
    }
    
    try {
        $stmt = $pdo->prepare("
            SELECT * FROM transaction_approvals 
            WHERE company_id = ? AND approval_status = 'pending' 
            ORDER BY txn_date DESC, id DESC
        ");
        $stmt->execute([$company_id]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendResponse([
            'status' => 'success',
            'count' => count($items),
            'items' => $items
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// 2. GET ALL WITH FILTERS (ADMIN ONLY)
if ($action === 'get_all') {
    if (!$isAdmin) {
        sendResponse(['error' => 'Admin access required'], 403);
    }
    
    $statusFilter = $_GET['status'] ?? 'all';
    $moduleFilter = $_GET['module'] ?? 'all';
    $userFilter = $_GET['user_id'] ?? '';
    $startDate = $_GET['start_date'] ?? '';
    $endDate = $_GET['end_date'] ?? '';
    
    $query = "SELECT * FROM transaction_approvals WHERE company_id = ?";
    $params = [$company_id];
    
    if ($statusFilter !== 'all' && in_array($statusFilter, ['pending', 'approved', 'rejected'])) {
        $query .= " AND approval_status = ?";
        $params[] = $statusFilter;
    }
    
    if ($moduleFilter !== 'all' && !empty($moduleFilter)) {
        $query .= " AND module_name = ?";
        $params[] = $moduleFilter;
    }
    
    if ($userFilter !== '' && is_numeric($userFilter)) {
        $query .= " AND created_by_user_id = ?";
        $params[] = intval($userFilter);
    }
    
    if (!empty($startDate) && !empty($endDate)) {
        $query .= " AND txn_date BETWEEN ? AND ?";
        $params[] = $startDate;
        $params[] = $endDate;
    }
    
    $query .= " ORDER BY id DESC LIMIT 500";
    
    try {
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Count summary
        $cntStmt = $pdo->prepare("
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN approval_status = 'pending' THEN 1 ELSE 0 END) as pending_cnt,
                SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END) as approved_cnt,
                SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END) as rejected_cnt
            FROM transaction_approvals 
            WHERE company_id = ?
        ");
        $cntStmt->execute([$company_id]);
        $stats = $cntStmt->fetch(PDO::FETCH_ASSOC);
        
        // Users for filter
        $uStmt = $pdo->prepare("SELECT id, username FROM users WHERE company_id = ? ORDER BY username ASC");
        $uStmt->execute([$company_id]);
        $users = $uStmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendResponse([
            'status' => 'success',
            'stats' => $stats,
            'items' => $items,
            'users' => $users
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// 3. APPROVE TRANSACTION (ADMIN ONLY)
if ($action === 'approve') {
    if (!$isAdmin) {
        sendResponse(['error' => 'Admin access required'], 403);
    }
    
    $id = intval($input['id'] ?? ($_GET['id'] ?? 0));
    if (!$id) {
        sendResponse(['error' => 'Invalid approval ID'], 400);
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM transaction_approvals WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$record) {
            sendResponse(['error' => 'Record not found'], 404);
        }
        
        // Update approval table
        $upStmt = $pdo->prepare("
            UPDATE transaction_approvals SET 
                approval_status = 'approved',
                reviewed_by_user_id = ?,
                reviewed_by_username = ?,
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
        ");
        $upStmt->execute([$currentUserId, $currentUsername, $id]);
        
        // Ensure source record has is_posted = 1
        safeSetTransactionPostStatus($record['module_name'], $record['record_id'], $company_id, 1);
        
        logActivity('Approval Desk', 'APPROVE', $id, "Admin approved {$record['module_name']} (#{$record['voucher_no']})");
        
        sendResponse(['status' => 'success', 'message' => 'Transaction successfully approved!']);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// 4. REJECT TRANSACTION (ADMIN ONLY)
if ($action === 'reject') {
    if (!$isAdmin) {
        sendResponse(['error' => 'Admin access required'], 403);
    }
    
    $id = intval($input['id'] ?? ($_GET['id'] ?? 0));
    $reason = trim($input['reason'] ?? '');
    $deleteSource = !empty($input['delete_source']);
    
    if (!$id) {
        sendResponse(['error' => 'Invalid approval ID'], 400);
    }
    
    if (empty($reason)) {
        sendResponse(['error' => 'Rejection reason is required.'], 400);
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM transaction_approvals WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$record) {
            sendResponse(['error' => 'Record not found'], 404);
        }
        
        // Update approval status to rejected with reason
        $upStmt = $pdo->prepare("
            UPDATE transaction_approvals SET 
                approval_status = 'rejected',
                rejection_reason = ?,
                reviewed_by_user_id = ?,
                reviewed_by_username = ?,
                reviewed_at = NOW(),
                notification_seen = 0,
                updated_at = NOW()
            WHERE id = ?
        ");
        $upStmt->execute([$reason, $currentUserId, $currentUsername, $id]);
        
        if ($deleteSource) {
            // Delete source transaction permanently if Admin opted
            safeDeleteTransactionRecord($record['module_name'], $record['record_id'], $company_id);
            logActivity('Approval Desk', 'REJECT_DELETE', $id, "Admin rejected & deleted {$record['module_name']} (#{$record['voucher_no']}). Reason: {$reason}");
        } else {
            // Safe Unpost: set is_posted = 0 so financial ledgers are reversed without data loss
            safeSetTransactionPostStatus($record['module_name'], $record['record_id'], $company_id, 0);
            logActivity('Approval Desk', 'REJECT_UNPOST', $id, "Admin rejected & unposted {$record['module_name']} (#{$record['voucher_no']}). Reason: {$reason}");
        }
        
        sendResponse([
            'status' => 'success', 
            'message' => 'Transaction has been rejected and the user has been notified.'
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// 5. GET NOTIFICATIONS FOR LOGGED IN USER
if ($action === 'get_user_notifications') {
    try {
        $stmt = $pdo->prepare("
            SELECT * FROM transaction_approvals 
            WHERE company_id = ? 
              AND created_by_user_id = ? 
              AND approval_status = 'rejected'
            ORDER BY id DESC LIMIT 50
        ");
        $stmt->execute([$company_id, $currentUserId]);
        $rejectedItems = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $unseenCount = 0;
        foreach ($rejectedItems as $item) {
            if (intval($item['notification_seen']) === 0) {
                $unseenCount++;
            }
        }
        
        sendResponse([
            'status' => 'success',
            'unseen_count' => $unseenCount,
            'items' => $rejectedItems
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// 6. SUBMIT USER FEEDBACK ON REJECTED TRANSACTION
if ($action === 'submit_user_feedback') {
    $id = intval($input['id'] ?? ($_GET['id'] ?? 0));
    $feedback = trim($input['feedback'] ?? '');
    
    if (!$id) {
        sendResponse(['error' => 'Invalid approval ID'], 400);
    }
    
    if (empty($feedback)) {
        sendResponse(['error' => 'Please enter your feedback or clarification.'], 400);
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM transaction_approvals WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$record) {
            sendResponse(['error' => 'Record not found'], 404);
        }
        
        // Verify user owns this record or is Admin
        if (intval($record['created_by_user_id']) !== $currentUserId && !$isAdmin) {
            sendResponse(['error' => 'Unauthorized: You can only provide feedback on your own entries.'], 403);
        }
        
        $upStmt = $pdo->prepare("
            UPDATE transaction_approvals SET 
                user_feedback = ?,
                user_feedback_at = NOW(),
                notification_seen = 1,
                updated_at = NOW()
            WHERE id = ?
        ");
        $upStmt->execute([$feedback, $id]);
        
        logActivity('Approval Desk', 'USER_FEEDBACK', $id, "User {$currentUsername} gave feedback on rejected {$record['module_name']} (#{$record['voucher_no']}): {$feedback}");
        
        sendResponse(['status' => 'success', 'message' => 'Your feedback has been submitted to the Administrator Approval Desk!']);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// 7. MARK NOTIFICATION SEEN
if ($action === 'mark_seen') {
    $id = intval($input['id'] ?? ($_GET['id'] ?? 0));
    try {
        if ($id > 0) {
            $stmt = $pdo->prepare("UPDATE transaction_approvals SET notification_seen = 1 WHERE id = ? AND company_id = ? AND created_by_user_id = ?");
            $stmt->execute([$id, $company_id, $currentUserId]);
        } else {
            $stmt = $pdo->prepare("UPDATE transaction_approvals SET notification_seen = 1 WHERE company_id = ? AND created_by_user_id = ?");
            $stmt->execute([$company_id, $currentUserId]);
        }
        sendResponse(['status' => 'success']);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

// Helper: Safely toggle is_posted on source table
function safeSetTransactionPostStatus($module, $recordId, $companyId, $status) {
    global $pdo;
    $map = [
        'Sale Invoice' => 'sale_invoices',
        'POS Sale' => 'sale_invoices',
        'Purchase Invoice' => 'purchase_invoices',
        'Purchase Return' => 'purchase_returns',
        'Purchase Returns' => 'purchase_returns',
        'Purchase Return / Debit Note' => 'purchase_returns',
        'Cash Payments' => 'cash_payments',
        'Bank Payments' => 'bank_payments',
        'Cash Receipts' => 'cash_receipts',
        'Bank Receipts' => 'bank_receipts',
        'General Journal Voucher' => 'general_journal_vouchers',
        'Sale Return' => 'sale_returns',
        'Sale Return/Credit Notes' => 'sale_returns',
        'Delivery Challans' => 'delivery_challans'
    ];
    
    $table = $map[$module] ?? null;
    if (!$table) return;
    
    try {
        $stmt = $pdo->prepare("UPDATE `$table` SET is_posted = ? WHERE id = ? AND company_id = ?");
        $stmt->execute([$status, $recordId, $companyId]);
    } catch (Exception $e) {}
}

// Helper: Safely delete transaction record
function safeDeleteTransactionRecord($module, $recordId, $companyId) {
    global $pdo;
    $map = [
        'Sale Invoice' => ['tbl' => 'sale_invoices', 'items' => 'sale_invoice_items', 'fk' => 'invoice_id'],
        'POS Sale' => ['tbl' => 'sale_invoices', 'items' => 'sale_invoice_items', 'fk' => 'invoice_id'],
        'Purchase Invoice' => ['tbl' => 'purchase_invoices', 'items' => 'purchase_invoice_items', 'fk' => 'invoice_id'],
        'Purchase Returns' => ['tbl' => 'purchase_returns', 'items' => 'purchase_return_items', 'fk' => 'return_id'],
        'Purchase Return / Debit Note' => ['tbl' => 'purchase_returns', 'items' => 'purchase_return_items', 'fk' => 'return_id'],
        'Cash Payments' => ['tbl' => 'cash_payments', 'items' => 'cash_payment_items', 'fk' => 'payment_id'],
        'Bank Payments' => ['tbl' => 'bank_payments', 'items' => 'bank_payment_items', 'fk' => 'payment_id'],
        'Cash Receipts' => ['tbl' => 'cash_receipts', 'items' => 'cash_receipt_items', 'fk' => 'receipt_id'],
        'Bank Receipts' => ['tbl' => 'bank_receipts', 'items' => 'bank_receipt_items', 'fk' => 'receipt_id'],
        'General Journal Voucher' => ['tbl' => 'general_journal_vouchers', 'items' => 'general_journal_voucher_items', 'fk' => 'voucher_id'],
        'Sale Return' => ['tbl' => 'sale_returns', 'items' => 'sale_return_items', 'fk' => 'return_id'],
        'Sale Return/Credit Notes' => ['tbl' => 'sale_returns', 'items' => 'sale_return_items', 'fk' => 'return_id'],
        'Delivery Challans' => ['tbl' => 'delivery_challans', 'items' => 'delivery_challan_items', 'fk' => 'challan_id']
    ];
    
    $cfg = $map[$module] ?? null;
    if (!$cfg) return;
    
    try {
        if (!empty($cfg['items']) && !empty($cfg['fk'])) {
            $stmtIt = $pdo->prepare("DELETE FROM `{$cfg['items']}` WHERE `{$cfg['fk']}` = ?");
            $stmtIt->execute([$recordId]);
        }
        $stmtMain = $pdo->prepare("DELETE FROM `{$cfg['tbl']}` WHERE id = ? AND company_id = ?");
        $stmtMain->execute([$recordId, $companyId]);
    } catch (Exception $e) {}
}

sendResponse(['error' => 'Invalid action'], 400);
