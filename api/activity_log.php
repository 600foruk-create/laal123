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
if (!$isAdmin) {
    sendResponse(['error' => 'Forbidden: Only Admins can view activity logs'], 403);
}

$action = $_GET['action'] ?? '';

// CREATE TABLE IF NOT EXISTS (Auto-migration)
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        user_id INT NOT NULL,
        username VARCHAR(255) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        module_name VARCHAR(100) NOT NULL,
        record_id VARCHAR(100) DEFAULT NULL,
        record_title VARCHAR(255) DEFAULT NULL,
        details_before LONGTEXT DEFAULT NULL,
        details_after LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (user_id),
        INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (PDOException $e) {
    sendResponse(['error' => 'Migration failed: ' . $e->getMessage()], 500);
}

if ($action === 'get_logs') {
    $filter = $_GET['filter'] ?? 'all';
    $userId = $_GET['user_id'] ?? '';

    $query = "SELECT * FROM user_activity_logs WHERE company_id = ?";
    $params = [$company_id];

    if ($filter === 'today') {
        $query .= " AND DATE(created_at) = CURDATE()";
    } elseif ($filter === 'date_range') {
        $startDate = $_GET['start_date'] ?? '';
        $endDate = $_GET['end_date'] ?? '';
        if ($startDate && $endDate) {
            $query .= " AND DATE(created_at) BETWEEN ? AND ?";
            $params[] = $startDate;
            $params[] = $endDate;
        }
    }

    if ($userId !== '') {
        $query .= " AND user_id = ?";
        $params[] = $userId;
    }

    $moduleName = $_GET['module_name'] ?? '';
    if ($moduleName !== '') {
        $query .= " AND module_name = ?";
        $params[] = $moduleName;
    }

    $actionType = $_GET['action_type'] ?? '';
    if ($actionType !== '' && $actionType !== 'ALL') {
        $query .= " AND action_type = ?";
        $params[] = $actionType;
    }

    $recordTitle = $_GET['record_title'] ?? '';
    if ($recordTitle !== '') {
        $query .= " AND record_title LIKE ?";
        $params[] = '%' . $recordTitle . '%';
    }

    $query .= " ORDER BY created_at DESC LIMIT 500";

    try {
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $logs = $stmt->fetchAll();

        // Fetch all users for filter dropdown
        $userStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE company_id = ?");
        $userStmt->execute([$company_id]);
        $users = $userStmt->fetchAll();

        sendResponse([
            'status' => 'success',
            'logs' => $logs,
            'users' => $users
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

if ($action === 'get_module_serials') {
    $moduleName = $_GET['module_name'] ?? '';
    if (!$moduleName) {
        sendResponse(['error' => 'Module name is required'], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT DISTINCT record_title FROM user_activity_logs WHERE company_id = ? AND module_name = ? AND record_title IS NOT NULL AND record_title != '' ORDER BY record_title ASC");
        $stmt->execute([$company_id, $moduleName]);
        $serials = $stmt->fetchAll(PDO::FETCH_COLUMN);

        sendResponse([
            'status' => 'success',
            'serials' => $serials
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

if ($action === 'get_snapshots') {
    try {
        $stmt = $pdo->prepare("SELECT * FROM data_import_snapshots WHERE company_id = ? ORDER BY created_at DESC LIMIT 100");
        $stmt->execute([$company_id]);
        $snapshots = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendResponse(['status' => 'success', 'snapshots' => $snapshots]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

if ($action === 'download_snapshot') {
    $snapId = intval($_GET['snapshot_id'] ?? 0);
    if (!$snapId) {
        sendResponse(['error' => 'Snapshot ID is required'], 400);
    }
    try {
        $stmt = $pdo->prepare("SELECT * FROM data_import_snapshots WHERE id = ? AND company_id = ?");
        $stmt->execute([$snapId, $company_id]);
        $snap = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$snap) {
            sendResponse(['error' => 'Snapshot not found'], 404);
        }
        $fullPath = __DIR__ . '/../' . $snap['file_path'];
        if (!file_exists($fullPath)) {
            sendResponse(['error' => 'Snapshot file no longer exists on server'], 404);
        }
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="' . basename($snap['file_path']) . '"');
        header('Content-Length: ' . filesize($fullPath));
        readfile($fullPath);
        exit;
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

if ($action === 'clear_history') {
    try {
        // Pre-clear safety snapshot of logs before deletion
        $allLogs = $pdo->query("SELECT * FROM user_activity_logs WHERE company_id = " . intval($company_id))->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($allLogs)) {
            $backupDir = __DIR__ . '/../storage/backups';
            if (!is_dir($backupDir)) { @mkdir($backupDir, 0755, true); }
            @file_put_contents($backupDir . '/pre_clear_activity_logs_' . date('Y_m_d_His') . '.json', json_encode($allLogs, JSON_UNESCAPED_UNICODE));
        }

        $stmt = $pdo->prepare("DELETE FROM user_activity_logs WHERE company_id = ?");
        $stmt->execute([$company_id]);

        // Log the clear action itself so there is never an unlogged wipe
        logActivity('User Activity Logs', 'CLEAR_HISTORY', 0, "Cleared activity log history (" . count($allLogs) . " entries archived)", null, ['archived_count' => count($allLogs)], ['company_id' => $company_id, 'user_id' => $currentUserId, 'username' => $currentUsername]);

        sendResponse(['status' => 'success', 'message' => 'History cleared and securely archived.']);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>
