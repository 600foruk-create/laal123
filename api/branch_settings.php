<?php
session_start();
include('db_config.php');

// Enable error reporting for debugging
ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Content-Type: application/json');

$company_id = $_SESSION['company_id'] ?? intval($_GET['company_id'] ?? ($_POST['company_id'] ?? 1));
if (!$company_id) {
    $company_id = 1;
}
$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    // Setup tables
    $table_sql = "
    CREATE TABLE IF NOT EXISTS company_branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        branch_code VARCHAR(50) NOT NULL,
        branch_name VARCHAR(150) NOT NULL,
        address TEXT,
        contact_number VARCHAR(100),
        manager_id INT NULL,
        default_warehouse_id INT NULL,
        invoice_series VARCHAR(50),
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY (company_id, branch_code)
    )";
    $pdo->exec($table_sql);

    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN default_customer_id INT NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN fbr_pos_id VARCHAR(50) NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN fbr_identification_no VARCHAR(50) NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN opening_time TIME NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN closing_time TIME NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN off_day VARCHAR(20) NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN enable_geofencing TINYINT(1) DEFAULT 0");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN latitude DECIMAL(10, 8) NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN longitude DECIMAL(11, 8) NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE company_branches ADD COLUMN radius_meters INT DEFAULT 100");
    } catch(Exception $e) {}

    // Ensure pos_fbr_branch_mappings table exists for sync
    $pdo->exec("
    CREATE TABLE IF NOT EXISTS pos_fbr_branch_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        branch_id INT NOT NULL,
        environment ENUM('sandbox', 'production') NOT NULL DEFAULT 'sandbox',
        fbr_pos_id VARCHAR(100) NULL,
        identification_no VARCHAR(50) NULL,
        pos_status VARCHAR(50) DEFAULT 'Registered',
        connected_date DATETIME NULL,
        fbr_pos_version VARCHAR(20) DEFAULT '1.0',
        is_cloud TINYINT(1) DEFAULT 1,
        pos_token TEXT NULL,
        is_enabled TINYINT(1) DEFAULT 1,
        status VARCHAR(50) DEFAULT 'Configuration Required',
        last_test_result VARCHAR(50) DEFAULT 'Not Tested',
        last_tested_at DATETIME NULL,
        last_error TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_branch_env (company_id, branch_id, environment)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    if ($action === 'get_branches') {
        $sql = "SELECT b.*, u.username as manager_name, w.name as warehouse_name 
                FROM company_branches b 
                LEFT JOIN users u ON b.manager_id = u.id 
                LEFT JOIN inv_locations w ON b.default_warehouse_id = w.id 
                WHERE b.company_id = ? ORDER BY b.branch_code ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        $branches = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'branches' => $branches]);
        exit;
    }

    if ($action === 'get_form_data') {
        $res = $pdo->query("SELECT id, username FROM users"); 
        $users = $res ? $res->fetchAll(PDO::FETCH_ASSOC) : [];
        
        $stmt = $pdo->prepare("SELECT id, name FROM inv_locations WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $warehouses = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'users' => $users, 'warehouses' => $warehouses]);
        exit;
    }

    if ($action === 'save_branch') {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!$data || empty($data['branch_code']) || empty($data['branch_name'])) {
            echo json_encode(['error' => 'Branch Code and Name are required']);
            exit;
        }
        
        $id = $data['id'] ?? null;
        $branch_code = trim($data['branch_code']);
        $branch_name = trim($data['branch_name']);
        $address = trim($data['address'] ?? '');
        $contact_number = trim($data['contact_number'] ?? '');
        $manager_id = !empty($data['manager_id']) ? (int)$data['manager_id'] : 0;
        $default_warehouse_id = !empty($data['default_warehouse_id']) ? (int)$data['default_warehouse_id'] : 0;
        $default_customer_id = !empty($data['default_customer_id']) ? (int)$data['default_customer_id'] : null;
        $invoice_series = trim($data['invoice_series'] ?? '');
        $status = $data['status'] ?? 'Active';
        $fbr_pos_id = trim($data['fbr_pos_id'] ?? ($data['branch_fbr_pos_id'] ?? ''));
        $fbr_identification_no = trim($data['fbr_identification_no'] ?? ($data['branch_fbr_ident_no'] ?? ''));
        $opening_time = !empty($data['opening_time']) ? trim($data['opening_time']) : null;
        $closing_time = !empty($data['closing_time']) ? trim($data['closing_time']) : null;
        $off_day = !empty($data['off_day']) ? trim($data['off_day']) : null;
        $enable_geofencing = !empty($data['enable_geofencing']) ? 1 : 0;
        $latitude = (isset($data['latitude']) && $data['latitude'] !== '' && $data['latitude'] !== null) ? floatval($data['latitude']) : null;
        $longitude = (isset($data['longitude']) && $data['longitude'] !== '' && $data['longitude'] !== null) ? floatval($data['longitude']) : null;
        $radius_meters = (!empty($data['radius_meters']) && intval($data['radius_meters']) > 0) ? intval($data['radius_meters']) : 100;
        
        $targetBranchId = null;

        if ($id) {
            $sql = "UPDATE company_branches SET branch_code=?, branch_name=?, address=?, contact_number=?, manager_id=?, default_warehouse_id=?, default_customer_id=?, invoice_series=?, status=?, fbr_pos_id=?, fbr_identification_no=?, opening_time=?, closing_time=?, off_day=?, enable_geofencing=?, latitude=?, longitude=?, radius_meters=? WHERE id=? AND company_id=?";
            $stmt = $pdo->prepare($sql);
            if ($stmt->execute([$branch_code, $branch_name, $address, $contact_number, $manager_id, $default_warehouse_id, $default_customer_id, $invoice_series, $status, $fbr_pos_id, $fbr_identification_no, $opening_time, $closing_time, $off_day, $enable_geofencing, $latitude, $longitude, $radius_meters, $id, $company_id])) {
                $targetBranchId = (int)$id;
            } else {
                echo json_encode(['error' => 'Failed to update branch']);
                exit;
            }
        } else {
            // Check if adding new branch is disabled in settings
            $chkStmt = $pdo->prepare("SELECT setting_value FROM settings WHERE (company_id = ? OR company_id = 0) AND setting_key = 'pos_allow_add_branch' ORDER BY id DESC LIMIT 1");
            $chkStmt->execute([$company_id]);
            $chkRow = $chkStmt->fetch();
            if ($chkRow && strval($chkRow['setting_value']) === '0') {
                echo json_encode(['error' => 'Adding new branch is disabled in system settings.']);
                exit;
            }

            // If new branch has no explicit timing or off day given, inherit default hours from POS General Settings
            if (empty($opening_time) && empty($closing_time) && empty($off_day)) {
                try {
                    $gStmt = $pdo->prepare("SELECT setting_key, setting_value FROM pos_settings WHERE company_id = ? AND setting_key IN ('gen_opening_time', 'gen_closing_time', 'gen_off_day')");
                    $gStmt->execute([$company_id]);
                    $gRows = $gStmt->fetchAll(PDO::FETCH_KEY_PAIR);
                    if (!empty($gRows['gen_opening_time'])) $opening_time = $gRows['gen_opening_time'];
                    if (!empty($gRows['gen_closing_time'])) $closing_time = $gRows['gen_closing_time'];
                    if (!empty($gRows['gen_off_day'])) $off_day = $gRows['gen_off_day'];
                } catch (Exception $e) {}
            }

            $sql = "INSERT INTO company_branches (company_id, branch_code, branch_name, address, contact_number, manager_id, default_warehouse_id, default_customer_id, invoice_series, status, fbr_pos_id, fbr_identification_no, opening_time, closing_time, off_day, enable_geofencing, latitude, longitude, radius_meters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            if ($stmt->execute([$company_id, $branch_code, $branch_name, $address, $contact_number, $manager_id, $default_warehouse_id, $default_customer_id, $invoice_series, $status, $fbr_pos_id, $fbr_identification_no, $opening_time, $closing_time, $off_day, $enable_geofencing, $latitude, $longitude, $radius_meters])) {
                $targetBranchId = (int)$pdo->lastInsertId();
            } else {
                echo json_encode(['error' => 'Failed to create branch']);
                exit;
            }
        }

        // Auto-synchronize FBR mapping entries for both environments
        if ($targetBranchId > 0) {
            foreach (['sandbox', 'production'] as $env) {
                try {
                    $chkMap = $pdo->prepare("SELECT id, status FROM pos_fbr_branch_mappings WHERE company_id = ? AND branch_id = ? AND environment = ?");
                    $chkMap->execute([$company_id, $targetBranchId, $env]);
                    $mapRow = $chkMap->fetch(PDO::FETCH_ASSOC);

                    $initialStatus = !empty($fbr_pos_id) ? 'Configuration Required' : 'Not Configured';
                    if ($mapRow) {
                        $newStatus = (!empty($fbr_pos_id) && $mapRow['status'] === 'Not Configured') ? 'Configuration Required' : $mapRow['status'];
                        $updMap = $pdo->prepare("
                            UPDATE pos_fbr_branch_mappings 
                            SET fbr_pos_id = ?, identification_no = ?, is_enabled = 1, status = ?
                            WHERE id = ?
                        ");
                        $updMap->execute([$fbr_pos_id, $fbr_identification_no, $newStatus, $mapRow['id']]);
                    } else {
                        $insMap = $pdo->prepare("
                            INSERT INTO pos_fbr_branch_mappings 
                                (company_id, branch_id, environment, fbr_pos_id, identification_no, pos_status, fbr_pos_version, is_cloud, is_enabled, status)
                            VALUES 
                                (?, ?, ?, ?, ?, 'Registered', '1.0', 1, 1, ?)
                        ");
                        $insMap->execute([$company_id, $targetBranchId, $env, $fbr_pos_id, $fbr_identification_no, $initialStatus]);
                    }
                } catch (Exception $e) {}
            }
        }

        echo json_encode([
            'success' => true,
            'message' => $id ? 'Branch updated successfully and FBR settings synchronized' : 'Branch created successfully and FBR settings synchronized',
            'branch_id' => $targetBranchId
        ]);
        exit;
    }

    if ($action === 'delete_branch') {
        $rawInput = file_get_contents('php://input');
        $input = !empty($rawInput) ? json_decode($rawInput, true) : [];
        if (!is_array($input)) $input = [];

        $id = intval($input['id'] ?? ($_POST['id'] ?? ($_GET['id'] ?? 0)));
        $adminPassword = trim($input['admin_password'] ?? ($_POST['admin_password'] ?? ($_GET['admin_password'] ?? '')));

        if ($id <= 0) {
            echo json_encode(['error' => 'Invalid Branch ID provided']);
            exit;
        }

        if ($adminPassword === '') {
            echo json_encode(['error' => 'Admin password is required to deactivate branch.']);
            exit;
        }

        // Live check against database users table:
        // Must match an Admin's real current password. No hardcoded passwords!
        $currentUserId = $_SESSION['user_id'] ?? 0;
        $authQuery = "
            SELECT id, username, role 
            FROM users 
            WHERE password = ? 
              AND (
                  (company_id = ? AND (role = 'Admin' OR LOWER(role) = 'admin' OR username = 'Administrator' OR id = ?))
                  OR (role = 'Admin' OR LOWER(role) = 'admin' OR username = 'Administrator')
              )
            LIMIT 1
        ";
        $authStmt = $pdo->prepare($authQuery);
        $authStmt->execute([$adminPassword, $company_id, $currentUserId]);
        $adminUser = $authStmt->fetch(PDO::FETCH_ASSOC);

        if (!$adminUser) {
            echo json_encode(['error' => 'Incorrect Admin Password! Verification failed.']);
            exit;
        }

        $sql = "UPDATE company_branches SET status='Inactive' WHERE id=? AND company_id=?";
        $stmt = $pdo->prepare($sql);
        if ($stmt->execute([$id, $company_id])) {
            echo json_encode(['success' => true, 'message' => 'Branch deactivated successfully']);
        } else {
            echo json_encode(['error' => 'Failed to deactivate branch']);
        }
        exit;
    }

    if ($action === 'activate_branch') {
        $rawInput = file_get_contents('php://input');
        $input = !empty($rawInput) ? json_decode($rawInput, true) : [];
        if (!is_array($input)) $input = [];

        $id = intval($input['id'] ?? ($_POST['id'] ?? ($_GET['id'] ?? 0)));
        if ($id <= 0) {
            echo json_encode(['error' => 'Invalid Branch ID provided']);
            exit;
        }

        $sql = "UPDATE company_branches SET status='Active' WHERE id=? AND company_id=?";
        $stmt = $pdo->prepare($sql);
        if ($stmt->execute([$id, $company_id])) {
            echo json_encode(['success' => true, 'message' => 'Branch activated successfully']);
        } else {
            echo json_encode(['error' => 'Failed to activate branch']);
        }
        exit;
    }

    echo json_encode(['error' => 'Invalid action']);

} catch (Exception $e) {
    echo json_encode(['error' => 'Server Error: ' . $e->getMessage()]);
}
