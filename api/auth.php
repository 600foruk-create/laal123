<?php
require_once 'db_config.php';

// SoftifyX Auth API
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'login') {
        $username = $data['username'] ?? '';
        $password = $data['password'] ?? '';
        $companyName = $data['company'] ?? '';
        
        // 1. Try to find Company by name if provided
        $company = null;
        if (!empty($companyName) && $companyName !== 'default') {
            $stmt = $pdo->prepare("SELECT id, name FROM companies WHERE name = ?");
            $stmt->execute([$companyName]);
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
                WHERE u.username = ? AND u.company_id = ?
            ");
            $stmt->execute([$username, $companyId]);
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
                WHERE u.username = ? AND (c.status IS NULL OR c.status != 0)
                ORDER BY u.id ASC
            ");
            $stmt->execute([$username]);
            $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($candidates as $cand) {
                if (verifyAndUpgradePassword($password, $cand['password'], $cand['id'], $pdo)) {
                    $user = $cand;
                    $companyId = $user['company_id'];
                    $companyName = $user['company_name'] ?? ($company['name'] ?? 'Default Business');
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
            
            sendResponse([
                'status' => 'success',
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
            sendResponse(['error' => 'Invalid credentials'], 401);
        }
    }
}

if ($action === 'logout') {
    session_destroy();
    sendResponse(['status' => 'success']);
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
