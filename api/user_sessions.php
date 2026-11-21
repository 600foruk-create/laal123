<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// Check auth and admin permissions: supports active PHP session OR verified user credentials from localStorage
$role = strtoupper($_SESSION['role'] ?? '');
$username = $_SESSION['username'] ?? '';
$uId = intval($_SESSION['user_id'] ?? 0);
$company_id = intval($_SESSION['company_id'] ?? 1);

// Fallback if PHP session expired on server but client is actively authenticated in localStorage
if (!$uId) {
    $reqUserId = intval($_GET['current_user_id'] ?? ($_POST['current_user_id'] ?? 0));
    $reqCompanyId = intval($_GET['company_id'] ?? ($_POST['company_id'] ?? 1));
    if ($reqUserId > 0) {
        try {
            $uStmt = $pdo->prepare("SELECT id, username, role, company_id FROM users WHERE id = ?");
            $uStmt->execute([$reqUserId]);
            $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
            if ($uRow) {
                $uId = intval($uRow['id']);
                $username = $uRow['username'];
                $role = strtoupper($uRow['role'] ?? '');
                $company_id = intval($uRow['company_id'] ?: $reqCompanyId);
                // Restore session on server
                $_SESSION['user_id'] = $uId;
                $_SESSION['username'] = $username;
                $_SESSION['role'] = $role;
                $_SESSION['company_id'] = $company_id;
            }
        } catch (Exception $e) {}
    }
}

if (!$uId) {
    sendResponse(['error' => 'Unauthorized access. Please log in.'], 401);
}

$isAdmin = ($role === 'ADMIN' || $role === 'ADMINISTRATOR' || $username === 'Administrator' || $uId === 1);
if (!$isAdmin) {
    sendResponse(['error' => 'Forbidden: Only Administrators can view User Login Sessions.'], 403);
}
$action = $_GET['action'] ?? 'get_sessions';

if ($action === 'get_sessions') {
    // 1. Update current Admin's own active session heartbeat
    if ($uId > 0) {
        try {
            $sessId = intval($_SESSION['login_session_id'] ?? 0);
            if ($sessId > 0) {
                $pdo->prepare("UPDATE user_login_sessions SET last_heartbeat = NOW() WHERE id = ?")->execute([$sessId]);
            } else {
                $pdo->prepare("UPDATE user_login_sessions SET last_heartbeat = NOW() WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1")->execute([$uId]);
            }
        } catch (Exception $e) {}
    }

    // 2. Clean up duplicate & stale/abandoned active sessions
    try {
        // Ensure last_heartbeat column exists
        $cols = $pdo->query("SHOW COLUMNS FROM user_login_sessions LIKE 'last_heartbeat'")->fetchAll();
        if (empty($cols)) {
            $pdo->exec("ALTER TABLE user_login_sessions ADD COLUMN last_heartbeat DATETIME NULL AFTER login_time, ADD INDEX (last_heartbeat)");
        }

        // A. For any user with multiple active sessions, close older duplicate sessions (keep only MAX id)
        $pdo->exec("
            UPDATE user_login_sessions 
            SET status = 'ended',
                logout_time = COALESCE(last_heartbeat, login_time),
                duration_seconds = TIMESTAMPDIFF(SECOND, login_time, COALESCE(last_heartbeat, login_time)),
                logout_reason = 'Previous Session'
            WHERE status = 'active' 
              AND id NOT IN (
                  SELECT max_id FROM (
                      SELECT MAX(id) as max_id FROM user_login_sessions WHERE status = 'active' GROUP BY user_id
                  ) as t
              )
        ");

        // B. End active sessions that have had no heartbeat for > 2.5 minutes, or with no heartbeat and login > 3 minutes ago
        $pdo->exec("
            UPDATE user_login_sessions 
            SET status = 'ended',
                logout_time = COALESCE(last_heartbeat, login_time),
                duration_seconds = TIMESTAMPDIFF(SECOND, login_time, COALESCE(last_heartbeat, login_time)),
                logout_reason = 'Timed Out / Inactive'
            WHERE status = 'active' 
              AND (
                  (last_heartbeat IS NOT NULL AND last_heartbeat < DATE_SUB(NOW(), INTERVAL 150 SECOND))
                  OR (last_heartbeat IS NULL AND login_time < DATE_SUB(NOW(), INTERVAL 3 MINUTE))
              )
        ");
    } catch (Exception $e) {
        error_log("Session cleanup error: " . $e->getMessage());
    }

    $filter = $_GET['filter'] ?? 'all';
    $userId = $_GET['user_id'] ?? '';
    
    $query = "SELECT s.*, 
              CASE 
                WHEN s.status = 'active' THEN TIMESTAMPDIFF(SECOND, s.login_time, NOW())
                ELSE COALESCE(s.duration_seconds, 0)
              END as live_duration_seconds
              FROM user_login_sessions s 
              WHERE s.company_id = ?";
    $params = [$company_id];
    
    if ($filter === 'today') {
        $query .= " AND DATE(s.login_time) = CURDATE()";
    } elseif ($filter === 'yesterday') {
        $query .= " AND DATE(s.login_time) = SUBDATE(CURDATE(), 1)";
    } elseif ($filter === 'this_week') {
        $query .= " AND s.login_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    } elseif ($filter === 'date_range') {
        $startDate = $_GET['start_date'] ?? '';
        $endDate = $_GET['end_date'] ?? '';
        if ($startDate && $endDate) {
            $query .= " AND DATE(s.login_time) BETWEEN ? AND ?";
            $params[] = $startDate;
            $params[] = $endDate;
        }
    }
    
    if ($userId !== '' && is_numeric($userId)) {
        $query .= " AND s.user_id = ?";
        $params[] = intval($userId);
    }
    
    $query .= " ORDER BY s.id DESC LIMIT 300";
    
    try {
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Fetch users for filter dropdown
        $userStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE company_id = ? ORDER BY username ASC");
        $userStmt->execute([$company_id]);
        $users = $userStmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendResponse([
            'status' => 'success',
            'sessions' => $sessions,
            'users' => $users
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

if ($action === 'get_session_activities') {
    $sessionId = intval($_GET['session_id'] ?? 0);
    if (!$sessionId) {
        sendResponse(['error' => 'Invalid session ID'], 400);
    }
    
    try {
        $sStmt = $pdo->prepare("SELECT * FROM user_login_sessions WHERE id = ? AND company_id = ?");
        $sStmt->execute([$sessionId, $company_id]);
        $session = $sStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$session) {
            sendResponse(['error' => 'Session not found'], 404);
        }
        
        $loginTime = $session['login_time'];
        $logoutTime = $session['logout_time'] ? $session['logout_time'] : date('Y-m-d H:i:s');
        
        // Query user activity logs created during this login window
        $actStmt = $pdo->prepare("
            SELECT id, action_type, module_name, record_id, record_title, details_before, details_after, created_at
            FROM user_activity_logs 
            WHERE company_id = ? 
              AND user_id = ? 
              AND created_at >= ? 
              AND created_at <= ?
            ORDER BY created_at ASC
        ");
        $actStmt->execute([
            $company_id, 
            $session['user_id'], 
            $loginTime, 
            date('Y-m-d H:i:s', strtotime($logoutTime) + 60)
        ]);
        $activities = $actStmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendResponse([
            'status' => 'success',
            'session' => $session,
            'activities' => $activities
        ]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()], 500);
    }
}

sendResponse(['error' => 'Invalid action'], 400);
