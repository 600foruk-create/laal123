<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Check auth and admin permissions
if (!isset($_SESSION['user_id'])) {
    sendResponse(['error' => 'Unauthorized access'], 401);
}

$role = $_SESSION['role'] ?? '';
$username = $_SESSION['username'] ?? '';
if ($role !== 'Admin' && $username !== 'Administrator') {
    sendResponse(['error' => 'Forbidden: Only Admins can view activity logs'], 403);
}

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

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

if ($action === 'clear_history') {
    try {
        $stmt = $pdo->prepare("DELETE FROM user_activity_logs WHERE company_id = ?");
        $stmt->execute([$company_id]);
        sendResponse(['status' => 'success', 'message' => 'History cleared successfully']);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}
?>
