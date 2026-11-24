<?php
require_once 'db_config.php';

// SoftifyX Auth API
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'login') {
        $username = trim($data['username'] ?? '');
        $password = trim($data['password'] ?? '');
        $companyName = trim($data['company'] ?? '');
        
        $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        if (strpos($clientIp, ',') !== false) {
            $clientIp = trim(explode(',', $clientIp)[0]);
        }

        // Security Lockout Parameters: 5 failed attempts = 15 minutes lockout
        $maxAttempts = 5;
        $lockoutMinutes = 15;
        $lockoutSeconds = $lockoutMinutes * 60;

        // Check recent failed attempts for this username OR IP address within 15 minutes
        $checkStmt = $pdo->prepare("
            SELECT COUNT(*) as failed_count, MAX(attempt_time) as last_attempt_time 
            FROM user_login_attempts 
            WHERE (LOWER(TRIM(username)) = LOWER(?) OR ip_address = ?) 
              AND is_successful = 0 
              AND attempt_time >= (NOW() - INTERVAL $lockoutMinutes MINUTE)
        ");
        $checkStmt->execute([$username, $clientIp]);
        $attemptStats = $checkStmt->fetch(PDO::FETCH_ASSOC);

        $failedCount = intval($attemptStats['failed_count'] ?? 0);
        $lastAttemptTime = $attemptStats['last_attempt_time'] ?? null;

        if ($failedCount >= $maxAttempts && $lastAttemptTime) {
            $elapsedSeconds = time() - strtotime($lastAttemptTime);
            $remainingSeconds = $lockoutSeconds - $elapsedSeconds;

            if ($remainingSeconds > 0) {
                $remMinutes = ceil($remainingSeconds / 60);
                sendResponse([
                    'status' => 'error',
                    'is_locked' => true,
                    'failed_attempts' => $failedCount,
                    'remaining_seconds' => $remainingSeconds,
                    'remaining_minutes' => $remMinutes,
                    'error' => "Security Lockout: Your account has been temporarily locked for {$lockoutMinutes} minutes due to {$maxAttempts} consecutive failed login attempts.\nPlease wait {$remMinutes} minute(s) before trying again."
                ], 429);
                exit;
            } else {
                // Lockout window expired, clear past failed attempts for clean retry
                try {
                    $pdo->prepare("DELETE FROM user_login_attempts WHERE (LOWER(TRIM(username)) = LOWER(?) OR ip_address = ?) AND is_successful = 0")->execute([$username, $clientIp]);
                } catch(Exception $e) {}
                $failedCount = 0;
            }
        }
        
        // 1. Try to find Company by name if provided
        $company = null;
        if (!empty($companyName) && $companyName !== 'default') {
            $stmt = $pdo->prepare("SELECT id, name FROM companies WHERE TRIM(name) = ? OR name = ?");
            $stmt->execute([$companyName, $companyName]);
            $company = $stmt->fetch();
        }
        
        // 2. Auth User in specified company
        $user = null;
        $companyId = null;
        if ($company) {
            $companyId = $company['id'];
            $companyName = $company['name'];
            if (shouldRunMigration('company_branches_fields', 1)) {
                try { $pdo->exec("ALTER TABLE company_branches ADD COLUMN off_day VARCHAR(20) NULL"); } catch(Exception $e) {}
                try { $pdo->exec("ALTER TABLE company_branches ADD COLUMN enable_geofencing TINYINT(1) DEFAULT 0"); } catch(Exception $e) {}
                try { $pdo->exec("ALTER TABLE company_branches ADD COLUMN latitude DECIMAL(10, 8) NULL"); } catch(Exception $e) {}
                try { $pdo->exec("ALTER TABLE company_branches ADD COLUMN longitude DECIMAL(11, 8) NULL"); } catch(Exception $e) {}
                try { $pdo->exec("ALTER TABLE company_branches ADD COLUMN radius_meters INT DEFAULT 100"); } catch(Exception $e) {}
            }

            $stmt = $pdo->prepare("
                SELECT u.*, b.branch_name, b.branch_code, b.invoice_series, b.opening_time, b.closing_time, b.off_day,
                       b.enable_geofencing, b.latitude as branch_lat, b.longitude as branch_lng, b.radius_meters
                FROM users u 
                LEFT JOIN company_branches b ON u.branch_id = b.id 
                WHERE (TRIM(u.username) = ? OR LOWER(TRIM(u.username)) = LOWER(?)) 
                  AND u.company_id = ?
            ");
            $stmt->execute([$username, $username, $companyId]);
            $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($candidates as $cand) {
                if (verifyAndUpgradePassword($password, $cand['password'], $cand['id'], $pdo)) {
                    $user = $cand;
                    break;
                }
            }
        }
        
        // 3. Fallback: If company wasn't provided or user wasn't in that company (e.g. company selection hidden on login), find user by credentials
        if (!$user) {
            $stmt = $pdo->prepare("
                SELECT u.*, b.branch_name, b.branch_code, b.invoice_series, b.opening_time, b.closing_time, b.off_day, c.name as company_name,
                       b.enable_geofencing, b.latitude as branch_lat, b.longitude as branch_lng, b.radius_meters
                FROM users u 
                LEFT JOIN company_branches b ON u.branch_id = b.id 
                LEFT JOIN companies c ON u.company_id = c.id
                WHERE (TRIM(u.username) = ? OR LOWER(TRIM(u.username)) = LOWER(?)) 
                  AND (c.status IS NULL OR c.status != 0 OR u.role = 'Admin' OR u.username = 'Administrator' OR u.id = 1)
                ORDER BY (u.username = 'Administrator' OR u.id = 1) DESC, u.id ASC
            ");
            $stmt->execute([$username, $username]);
            $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($candidates as $cand) {
                if (verifyAndUpgradePassword($password, $cand['password'], $cand['id'], $pdo)) {
                    $user = $cand;
                    $userRoleUpper = strtoupper(trim($user['role'] ?? ''));
                    $isAdmin = ($userRoleUpper === 'ADMIN' || $userRoleUpper === 'ADMINISTRATOR' || intval($user['id']) === 1);
                    if ($isAdmin && $company) {
                        $companyId = $company['id'];
                        $companyName = $company['name'];
                    } else {
                        $companyId = $user['company_id'];
                        $companyName = $user['company_name'] ?? ($company['name'] ?? 'Default Business');
                    }
                    break;
                }
            }
        }
        
        if ($user) {
            // Check Branch Operating Hours and Weekly Off Day Restrictions
            // Admin users are exempt. Only branch users (POS / non-admin assigned to branch) are restricted.
            $userRoleUpper = strtoupper(trim($user['role'] ?? ''));
            $isAdmin = ($userRoleUpper === 'ADMIN' || $userRoleUpper === 'ADMINISTRATOR' || intval($user['id']) === 1);

            // 1. Weekly Off Day Check
            if (!$isAdmin && !empty($user['branch_id']) && !empty($user['off_day'])) {
                $todayDay = date('l');
                if (strcasecmp($todayDay, trim($user['off_day'])) === 0) {
                    $openFmt = !empty($user['opening_time']) ? date('h:i A', strtotime($user['opening_time'])) : '';
                    $closeFmt = !empty($user['closing_time']) ? date('h:i A', strtotime($user['closing_time'])) : '';
                    sendResponse([
                        'status' => 'error',
                        'is_off_day' => true,
                        'off_day' => $user['off_day'],
                        'current_day' => $todayDay,
                        'branch_name' => $user['branch_name'] ?? 'Assigned Branch',
                        'opening_time' => $openFmt,
                        'closing_time' => $closeFmt,
                        'raw_opening_time' => $user['opening_time'] ?? '',
                        'current_time' => date('h:i A'),
                        'error' => "Today ({$todayDay}) is an official weekly OFF DAY for {$user['branch_name']}.\nBranch is closed today. POS logins and sales are not allowed on weekly off days."
                    ], 403);
                    exit;
                }
            }

            // 2. Daily Operating Hours (Opening/Closing Time) Check
            if (!$isAdmin && !empty($user['branch_id']) && !empty($user['opening_time']) && !empty($user['closing_time'])) {
                $nowTime = date('H:i:s');
                $open = $user['opening_time'];
                $close = $user['closing_time'];
                $isOpen = false;
                if ($open <= $close) {
                    $isOpen = ($nowTime >= $open && $nowTime <= $close);
                } else {
                    // Overnight shift, e.g. 20:00 to 07:00
                    $isOpen = ($nowTime >= $open || $nowTime <= $close);
                }

                if (!$isOpen) {
                    $openFmt = date('h:i A', strtotime($open));
                    $closeFmt = date('h:i A', strtotime($close));
                    sendResponse([
                        'status' => 'error',
                        'is_off_time' => true,
                        'branch_name' => $user['branch_name'] ?? 'Assigned Branch',
                        'opening_time' => $openFmt,
                        'closing_time' => $closeFmt,
                        'raw_opening_time' => $open,
                        'current_time' => date('h:i A'),
                        'error' => "Branch is currently CLOSED (Off-Time).\nOperating hours: {$openFmt} to {$closeFmt}.\nPlease login after opening time ({$openFmt})."
                    ], 403);
                    exit;
                }
            }

            // 3. Branch Geofencing (Location-Based Login Restriction) Check
            // Admin users are exempt. Only branch users (POS / non-admin assigned to branch) are restricted when enable_geofencing is 1.
            if (!$isAdmin && !empty($user['branch_id']) && !empty($user['enable_geofencing']) && intval($user['enable_geofencing']) === 1) {
                $bLat = !empty($user['branch_lat']) ? floatval($user['branch_lat']) : null;
                $bLng = !empty($user['branch_lng']) ? floatval($user['branch_lng']) : null;
                $allowedRadius = (!empty($user['radius_meters']) && intval($user['radius_meters']) > 0) ? intval($user['radius_meters']) : 100;

                // Only enforce if branch coordinates are configured
                if ($bLat !== null && $bLng !== null && ($bLat != 0 || $bLng != 0)) {
                    $clientLat = (isset($data['latitude']) && $data['latitude'] !== '' && $data['latitude'] !== null) ? floatval($data['latitude']) : null;
                    $clientLng = (isset($data['longitude']) && $data['longitude'] !== '' && $data['longitude'] !== null) ? floatval($data['longitude']) : null;

                    if ($clientLat === null || $clientLng === null) {
                        sendResponse([
                            'status' => 'error',
                            'is_location_required' => true,
                            'branch_name' => $user['branch_name'] ?? 'Assigned Branch',
                            'allowed_radius' => $allowedRadius,
                            'error' => "Location verification required for {$user['branch_name']}.\nPlease allow browser GPS / Location access to login."
                        ], 403);
                        exit;
                    }

                    // Haversine calculation in meters
                    $earthRadius = 6371000;
                    $dLat = deg2rad($bLat - $clientLat);
                    $dLon = deg2rad($bLng - $clientLng);
                    $a = sin($dLat/2) * sin($dLat/2) +
                         cos(deg2rad($clientLat)) * cos(deg2rad($bLat)) *
                         sin($dLon/2) * sin($dLon/2);
                    $c = 2 * atan2(sqrt($a), sqrt(1-$a));
                    $distanceMeters = round($earthRadius * $c);

                    if ($distanceMeters > $allowedRadius) {
                        sendResponse([
                            'status' => 'error',
                            'is_out_of_bounds' => true,
                            'distance_meters' => $distanceMeters,
                            'allowed_radius' => $allowedRadius,
                            'branch_name' => $user['branch_name'] ?? 'Assigned Branch',
                            'error' => "Access Denied: You are {$distanceMeters}m away from {$user['branch_name']}.\nAllowed radius is {$allowedRadius}m. Login is only permitted inside the shop premises."
                        ], 403);
                        exit;
                    }

                    $_SESSION['login_lat'] = $clientLat;
                    $_SESSION['login_lng'] = $clientLng;
                    $_SESSION['login_distance'] = $distanceMeters;
                }
            }

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            $_SESSION['company_id'] = $companyId;
            $_SESSION['company_name'] = $companyName;
            $_SESSION['role'] = $user['role'];
            $_SESSION['branch_id'] = $user['branch_id'] ?? null;
            $_SESSION['branch_name'] = $user['branch_name'] ?? null;
            $_SESSION['branch_code'] = $user['branch_code'] ?? null;
            $_SESSION['invoice_series'] = $user['invoice_series'] ?? null;
            $_SESSION['opening_time'] = $user['opening_time'] ?? null;
            $_SESSION['closing_time'] = $user['closing_time'] ?? null;
            $_SESSION['off_day'] = $user['off_day'] ?? null;
            $_SESSION['enable_geofencing'] = $user['enable_geofencing'] ?? 0;
            $_SESSION['branch_lat'] = $user['branch_lat'] ?? null;
            $_SESSION['branch_lng'] = $user['branch_lng'] ?? null;
            $_SESSION['radius_meters'] = $user['radius_meters'] ?? 100;

            // Track User Login Session for Admin Audit History
            $loginSessionId = 0;
            try {
                // Clear past failed attempts upon successful login
                $pdo->prepare("DELETE FROM user_login_attempts WHERE (LOWER(TRIM(username)) = LOWER(?) OR ip_address = ?)")->execute([$username, $clientIp]);
                $pdo->prepare("INSERT INTO user_login_attempts (ip_address, username, attempt_time, is_successful) VALUES (?, ?, NOW(), 1)")->execute([$clientIp, $username]);
            } catch (Exception $e) {}

            try {
                // 1. Close any older active sessions for this user so only the new live session remains active
                $closeOld = $pdo->prepare("
                    UPDATE user_login_sessions 
                    SET logout_time = NOW(), 
                        duration_seconds = TIMESTAMPDIFF(SECOND, login_time, NOW()), 
                        logout_reason = 'New Login / Closed', 
                        status = 'ended' 
                    WHERE user_id = ? AND status = 'active'
                ");
                $closeOld->execute([$user['id']]);

                // 2. Insert new session
                $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
                if (strpos($clientIp, ',') !== false) {
                    $clientIp = trim(explode(',', $clientIp)[0]);
                }
                $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown Browser', 0, 250);
                $sessStmt = $pdo->prepare("INSERT INTO user_login_sessions (company_id, user_id, username, login_time, last_heartbeat, ip_address, user_agent, logout_reason, status) VALUES (?, ?, ?, NOW(), NOW(), ?, ?, 'Active', 'active')");
                $sessStmt->execute([$companyId, $user['id'], $user['username'], $clientIp, $userAgent]);
                $loginSessionId = intval($pdo->lastInsertId());
                $_SESSION['login_session_id'] = $loginSessionId;
            } catch (Exception $e) {
                // Fallback if last_heartbeat column isn't migrated yet
                try {
                    $sessStmt = $pdo->prepare("INSERT INTO user_login_sessions (company_id, user_id, username, login_time, ip_address, user_agent, logout_reason, status) VALUES (?, ?, ?, NOW(), ?, ?, 'Active', 'active')");
                    $sessStmt->execute([$companyId, $user['id'], $user['username'], $clientIp, $userAgent]);
                    $loginSessionId = intval($pdo->lastInsertId());
                    $_SESSION['login_session_id'] = $loginSessionId;
                } catch (Exception $e2) {
                    error_log("Login session record error: " . $e2->getMessage());
                }
            }
            
            sendResponse([
                'status' => 'success',
                'session_id' => $loginSessionId,
                'user' => [
                    'id' => $user['id'],
                    'username' => $user['username'],
                    'role' => $user['role'],
                    'company_id' => $companyId,
                    'company_name' => $companyName,
                    'branch_id' => $user['branch_id'] ?? null,
                    'branch_name' => $user['branch_name'] ?? null,
                    'branch_code' => $user['branch_code'] ?? null,
                    'invoice_series' => $user['invoice_series'] ?? null,
                    'opening_time' => $user['opening_time'] ?? null,
                    'closing_time' => $user['closing_time'] ?? null,
                    'off_day' => $user['off_day'] ?? null,
                    'enable_geofencing' => $user['enable_geofencing'] ?? 0,
                    'radius_meters' => $user['radius_meters'] ?? 100
                ]
            ]);
        } else {
            // Record failed login attempt
            try {
                $pdo->prepare("INSERT INTO user_login_attempts (ip_address, username, attempt_time, is_successful) VALUES (?, ?, NOW(), 0)")->execute([$clientIp, $username]);
            } catch (Exception $e) {}

            $newFailedCount = $failedCount + 1;
            $remainingAttempts = max(0, $maxAttempts - $newFailedCount);

            // Artificial delay (0.4s) to prevent automated high-speed brute force attacks
            usleep(400000);

            if ($remainingAttempts <= 0) {
                sendResponse([
                    'status' => 'error',
                    'is_locked' => true,
                    'failed_attempts' => $newFailedCount,
                    'remaining_seconds' => $lockoutSeconds,
                    'remaining_minutes' => $lockoutMinutes,
                    'error' => "Security Alert: You have entered an incorrect password {$maxAttempts} times.\nAccess has been locked for {$lockoutMinutes} minutes for your security."
                ], 429);
            } else {
                sendResponse([
                    'status' => 'error',
                    'is_locked' => false,
                    'failed_attempts' => $newFailedCount,
                    'remaining_attempts' => $remainingAttempts,
                    'error' => "Invalid username or password!\n(Attempt {$newFailedCount} of {$maxAttempts}. {$remainingAttempts} attempt(s) remaining before a {$lockoutMinutes}-minute security lockout)."
                ], 401);
            }
        }
    }

    if ($action === 'check_lockout') {
        $username = trim($data['username'] ?? ($_GET['username'] ?? ''));
        $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        if (strpos($clientIp, ',') !== false) {
            $clientIp = trim(explode(',', $clientIp)[0]);
        }
        $maxAttempts = 5;
        $lockoutMinutes = 15;
        $lockoutSeconds = $lockoutMinutes * 60;

        $checkStmt = $pdo->prepare("
            SELECT COUNT(*) as failed_count, MAX(attempt_time) as last_attempt_time 
            FROM user_login_attempts 
            WHERE (LOWER(TRIM(username)) = LOWER(?) OR ip_address = ?) 
              AND is_successful = 0 
              AND attempt_time >= (NOW() - INTERVAL $lockoutMinutes MINUTE)
        ");
        $checkStmt->execute([$username, $clientIp]);
        $stats = $checkStmt->fetch(PDO::FETCH_ASSOC);
        $failedCount = intval($stats['failed_count'] ?? 0);
        $lastAttemptTime = $stats['last_attempt_time'] ?? null;

        if ($failedCount >= $maxAttempts && $lastAttemptTime) {
            $elapsedSeconds = time() - strtotime($lastAttemptTime);
            $remainingSeconds = $lockoutSeconds - $elapsedSeconds;
            if ($remainingSeconds > 0) {
                sendResponse([
                    'is_locked' => true,
                    'failed_attempts' => $failedCount,
                    'remaining_seconds' => $remainingSeconds,
                    'remaining_minutes' => ceil($remainingSeconds / 60)
                ]);
                exit;
            }
        }
        sendResponse([
            'is_locked' => false,
            'failed_attempts' => $failedCount,
            'remaining_attempts' => max(0, $maxAttempts - $failedCount)
        ]);
        exit;
    }

    if ($action === 'admin_unlock_user') {
        $targetUser = trim($data['username'] ?? ($_GET['username'] ?? ''));
        if (empty($targetUser)) {
            sendResponse(['status' => 'error', 'message' => 'Username required'], 400);
        }
        $pdo->prepare("DELETE FROM user_login_attempts WHERE LOWER(TRIM(username)) = LOWER(?)")->execute([$targetUser]);
        sendResponse(['status' => 'success', 'message' => "Security lockout cleared for user: $targetUser"]);
        exit;
    }

    if ($action === 'change_my_password') {
        $userId = intval($data['user_id'] ?? ($_SESSION['user_id'] ?? 0));
        $currentPass = trim($data['current_password'] ?? '');
        $newPass = trim($data['new_password'] ?? '');
        $confirmPass = trim($data['confirm_password'] ?? '');

        if (!$userId) {
            sendResponse(['status' => 'error', 'message' => 'User not identified. Please log in again.'], 401);
        }
        if (empty($currentPass)) {
            sendResponse(['status' => 'error', 'message' => 'Please enter your current password.'], 400);
        }
        if (empty($newPass) || strlen($newPass) < 3) {
            sendResponse(['status' => 'error', 'message' => 'New password must be at least 3 characters long.'], 400);
        }
        if ($newPass !== $confirmPass) {
            sendResponse(['status' => 'error', 'message' => 'New password and confirm password do not match.'], 400);
        }

        // Fetch user from database
        $stmt = $pdo->prepare("SELECT id, username, password FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $uRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$uRow) {
            sendResponse(['status' => 'error', 'message' => 'User account not found.'], 404);
        }

        // Verify current password (supports both Bcrypt hashes and plain text)
        $isCurrentValid = false;
        if (password_verify($currentPass, $uRow['password'])) {
            $isCurrentValid = true;
        } elseif ($uRow['password'] === $currentPass || trim($uRow['password']) === $currentPass) {
            $isCurrentValid = true;
        }

        if (!$isCurrentValid) {
            sendResponse(['status' => 'error', 'message' => 'Current password entered is incorrect.'], 400);
        }

        // Update password for this specific user
        $stmtUp = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmtUp->execute([$newPass, $userId]);

        logActivity('User Profile', 'UPDATE_PASSWORD', $userId, "User '{$uRow['username']}' updated their own password.");

        sendResponse(['status' => 'success', 'message' => 'Password updated successfully!']);
    }
}

if ($action === 'logout' || $action === 'record_logout') {
    $sessId = intval($data['session_id'] ?? ($_GET['session_id'] ?? ($_SESSION['login_session_id'] ?? 0)));
    $reason = trim($data['reason'] ?? ($_GET['reason'] ?? 'Manual Logout'));
    if ($sessId > 0) {
        try {
            $upSess = $pdo->prepare("UPDATE user_login_sessions SET logout_time = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, login_time, NOW()), logout_reason = ?, status = 'ended' WHERE id = ?");
            $upSess->execute([$reason, $sessId]);
        } catch (Exception $e) {}
    } else if (isset($_SESSION['user_id'])) {
        // Fallback: update latest active session for this user
        try {
            $upSess2 = $pdo->prepare("UPDATE user_login_sessions SET logout_time = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, login_time, NOW()), logout_reason = ?, status = 'ended' WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
            $upSess2->execute([$reason, $_SESSION['user_id']]);
        } catch (Exception $e) {}
    }
    
    if ($action === 'logout') {
        session_destroy();
    }
    sendResponse(['status' => 'success']);
}

if ($action === 'heartbeat') {
    $hUserId = intval($_SESSION['user_id'] ?? ($data['user_id'] ?? ($_GET['user_id'] ?? 0)));
    if ($hUserId > 0) {
        try {
            $sessId = intval($_SESSION['login_session_id'] ?? 0);
            if ($sessId > 0) {
                $hbStmt = $pdo->prepare("UPDATE user_login_sessions SET last_heartbeat = NOW() WHERE id = ?");
                $hbStmt->execute([$sessId]);
            } else {
                $hbStmt = $pdo->prepare("UPDATE user_login_sessions SET last_heartbeat = NOW() WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
                $hbStmt->execute([$hUserId]);
            }
            sendResponse(['status' => 'success']);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
    }
    sendResponse(['status' => 'ignored']);
}

if ($action === 'check') {
    if (isset($_SESSION['user_id'])) {
        sendResponse(['status' => 'logged_in', 'user' => $_SESSION]);
    } else {
        sendResponse(['status' => 'logged_out']);
    }
}

if ($action === 'check_branch_hours') {
    $branch_id = intval($_GET['branch_id'] ?? ($_SESSION['branch_id'] ?? 0));
    $user_role = strtoupper($_SESSION['role'] ?? ($_GET['role'] ?? ''));
    $isAdmin = ($user_role === 'ADMIN' || $user_role === 'ADMINISTRATOR' || (isset($_SESSION['user_id']) && intval($_SESSION['user_id']) === 1));

    if ($isAdmin || $branch_id <= 0) {
        sendResponse(['status' => 'success', 'is_off_time' => false, 'is_off_day' => false]);
    }

    $stmt = $pdo->prepare("SELECT branch_name, opening_time, closing_time, off_day FROM company_branches WHERE id = ?");
    $stmt->execute([$branch_id]);
    $branch = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$branch) {
        sendResponse(['status' => 'success', 'is_off_time' => false, 'is_off_day' => false]);
    }

    // Check Weekly Off Day
    if (!empty($branch['off_day'])) {
        $todayDay = date('l');
        if (strcasecmp($todayDay, trim($branch['off_day'])) === 0) {
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_destroy();
            }
            $openFmt = !empty($branch['opening_time']) ? date('h:i A', strtotime($branch['opening_time'])) : '';
            $closeFmt = !empty($branch['closing_time']) ? date('h:i A', strtotime($branch['closing_time'])) : '';
            sendResponse([
                'status' => 'error',
                'is_off_day' => true,
                'is_off_time' => true,
                'off_day' => $branch['off_day'],
                'current_day' => $todayDay,
                'branch_name' => $branch['branch_name'],
                'opening_time' => $openFmt,
                'closing_time' => $closeFmt,
                'raw_opening_time' => $branch['opening_time'] ?? '',
                'current_time' => date('h:i A'),
                'message' => "Today ({$todayDay}) is an official weekly OFF DAY for {$branch['branch_name']}. You have been automatically logged out."
            ]);
            exit;
        }
    }

    if (empty($branch['opening_time']) || empty($branch['closing_time'])) {
        sendResponse(['status' => 'success', 'is_off_time' => false, 'is_off_day' => false, 'off_day' => $branch['off_day'] ?? null]);
    }

    $now = date('H:i:s');
    $open = $branch['opening_time'];
    $close = $branch['closing_time'];
    $isOpen = false;
    if ($open <= $close) {
        $isOpen = ($now >= $open && $now <= $close);
    } else {
        $isOpen = ($now >= $open || $now <= $close);
    }

    if (!$isOpen) {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        $openFmt = date('h:i A', strtotime($open));
        $closeFmt = date('h:i A', strtotime($close));
        sendResponse([
            'status' => 'error',
            'is_off_time' => true,
            'is_off_day' => false,
            'branch_name' => $branch['branch_name'],
            'opening_time' => $openFmt,
            'closing_time' => $closeFmt,
            'raw_opening_time' => $open,
            'raw_closing_time' => $close,
            'current_time' => date('h:i A'),
            'message' => "Branch operating hours have closed ({$openFmt} to {$closeFmt}). You have been automatically logged out."
        ]);
        exit;
    }

    sendResponse(['status' => 'success', 'is_off_time' => false, 'is_off_day' => false, 'opening_time' => $open, 'closing_time' => $close, 'off_day' => $branch['off_day'] ?? null]);
}
?>
