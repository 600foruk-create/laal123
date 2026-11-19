<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Settings table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT,
        UNIQUE KEY `unique_setting_per_company` (company_id, setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {}

$action = $_GET['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? ($_POST['company_id'] ?? 1));

switch ($action) {
    case 'save_login_settings':
        $data = json_decode(file_get_contents('php://input'), true);
        $settings = $data['settings'] ?? $data;
        $keys = [
            'login_user_dropdown',
            'login_show_username',
            'login_show_company',
            'login_show_financial_year'
        ];
        foreach ($keys as $k) {
            if (isset($settings[$k])) {
                $val = strval($settings[$k]);
                // Delete ALL existing rows with this key regardless of company_id so no stale row remains
                $stmtDelAll = $pdo->prepare("DELETE FROM settings WHERE setting_key = ?");
                $stmtDelAll->execute([$k]);

                // Insert global (company 0)
                $stmtIns0 = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (0, ?, ?)");
                $stmtIns0->execute([$k, $val]);

                // Also insert for active company if > 0
                if ($company_id > 0) {
                    $stmtInsCo = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (?, ?, ?)");
                    $stmtInsCo->execute([$company_id, $k, $val]);
                }
            }
        }
        echo json_encode(['status' => 'success', 'settings' => $settings]);
        break;

    case 'get_login_settings':
        $keys = [
            'login_user_dropdown',
            'login_show_username',
            'login_show_company',
            'login_show_financial_year',
            'security_404_active',
            'security_404_target_erp',
            'security_404_target_pos',
            'security_404_target_digital_invoice',
            'security_404_code'
        ];
        $in = str_repeat('?,', count($keys) - 1) . '?';
        $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE (company_id = 0 OR company_id = ?) AND setting_key IN ($in) ORDER BY id ASC");
        $stmt->execute(array_merge([$company_id], $keys));
        $fetched = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $defaults = [
            'login_user_dropdown' => '1',
            'login_show_username' => '1',
            'login_show_company' => '1',
            'login_show_financial_year' => '1'
        ];
        $settings = array_merge($defaults, $fetched);
        echo json_encode(['status' => 'success', 'settings' => $settings]);
        break;

    case 'get_global_setting':
        $key = $_GET['key'] ?? '';
        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = 0 AND setting_key = ? ORDER BY id DESC LIMIT 1");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        echo json_encode(['value' => $row ? $row['setting_value'] : null]);
        break;

    case 'get_db_name':
        echo json_encode(['db_name' => $db]);
        break;

    case 'save_global_setting':
        $data = json_decode(file_get_contents('php://input'), true);
        $key = $data['key'] ?? '';
        $value = isset($data['value']) ? strval($data['value']) : '';
        
        if (strpos($key, 'login_') === 0) {
            $stmtDelAll = $pdo->prepare("DELETE FROM settings WHERE setting_key = ?");
            $stmtDelAll->execute([$key]);
            $stmt0 = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (0, ?, ?)");
            $stmt0->execute([$key, $value]);
            if ($company_id > 0) {
                $stmtCo = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (?, ?, ?)");
                $stmtCo->execute([$company_id, $key, $value]);
            }
        } else {
            $stmtDel = $pdo->prepare("DELETE FROM settings WHERE company_id = 0 AND setting_key = ?");
            $stmtDel->execute([$key]);
            $stmt = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (0, ?, ?)");
            $stmt->execute([$key, $value]);
        }
        echo json_encode(['status' => 'success', 'value' => $value]);
        break;

    case 'get_setting':
        $key = $_GET['key'] ?? '';
        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = ? AND setting_key = ? ORDER BY id DESC LIMIT 1");
        $stmt->execute([$company_id, $key]);
        $row = $stmt->fetch();
        if (!$row && $company_id != 0) {
            $stmt0 = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = 0 AND setting_key = ? ORDER BY id DESC LIMIT 1");
            $stmt0->execute([$key]);
            $row = $stmt0->fetch();
        }
        echo json_encode(['value' => $row ? $row['setting_value'] : null]);
        break;

    case 'save_bulk_settings':
        $data = json_decode(file_get_contents('php://input'), true);
        $settings = $data['settings'] ?? [];
        
        try {
            // Fetch before states
            $keys = array_column($settings, 'key');
            $before_data = [];
            if (!empty($keys)) {
                $in = str_repeat('?,', count($keys) - 1) . '?';
                $stmt_before = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE company_id = ? AND setting_key IN ($in)");
                $stmt_before->execute(array_merge([$company_id], $keys));
                $before_data = $stmt_before->fetchAll(PDO::FETCH_KEY_PAIR);
            }

            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) 
                                   VALUES (?, ?, ?) 
                                   ON DUPLICATE KEY UPDATE setting_value = ?");
            foreach ($settings as $s) {
                $val = isset($s['value']) ? strval($s['value']) : null;
                $stmt->execute([$company_id, $s['key'] ?? '', $val, $val]);
            }
            $pdo->commit();

            // Fetch after states
            $after_data = [];
            if (!empty($keys)) {
                $in = str_repeat('?,', count($keys) - 1) . '?';
                $stmt_after = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE company_id = ? AND setting_key IN ($in)");
                $stmt_after->execute(array_merge([$company_id], $keys));
                $after_data = $stmt_after->fetchAll(PDO::FETCH_KEY_PAIR);
            }
            logActivity('Settings', 'UPDATE', 'bulk', 'Bulk Settings Update', $before_data, $after_data);

            echo json_encode(['status' => 'success']);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            file_put_contents(__DIR__ . '/../scratch/settings_error.log', date('Y-m-d H:i:s') . ' - ' . $e->getMessage() . "\n", FILE_APPEND);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'save_setting':
        $data = json_decode(file_get_contents('php://input'), true);
        $key = $data['key'] ?? '';
        $value = isset($data['value']) ? strval($data['value']) : '';
        if (isset($data['company_id']) && $data['company_id'] !== '') {
            $company_id = intval($data['company_id']);
        }
        
        $stmt_before = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = ? AND setting_key = ? ORDER BY id DESC LIMIT 1");
        $stmt_before->execute([$company_id, $key]);
        $before_val = $stmt_before->fetchColumn();
        $before_data = $before_val !== false ? [$key => $before_val] : [];
        
        // Remove existing entries to ensure no stale duplicates exist
        $stmtDel = $pdo->prepare("DELETE FROM settings WHERE company_id = ? AND setting_key = ?");
        $stmtDel->execute([$company_id, $key]);
        
        $stmt = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (?, ?, ?)");
        $stmt->execute([$company_id, $key, $value]);

        // For module & permission keys and login keys, sync to global (company 0) as fallback
        if (strpos($key, 'login_') === 0 || in_array($key, ['pos_allow_add_branch', 'pos_allow_fbr_integration', 'fbr_allow_integration_settings', 'module_fbr_enabled', 'module_pos_enabled'])) {
            $stmtDel0 = $pdo->prepare("DELETE FROM settings WHERE company_id = 0 AND setting_key = ?");
            $stmtDel0->execute([$key]);
            $stmt0 = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (0, ?, ?)");
            $stmt0->execute([$key, $value]);
        }
        
        $after_data = [$key => $value];
        logActivity('Settings', 'UPDATE', $key, 'Setting: ' . $key, $before_data, $after_data);
        
        echo json_encode(['status' => 'success', 'value' => $value]);
        break;

    case 'save_dashboard_settings':
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?: [];
        
        // Extract the actual config object whether it was sent as { config: {...} }, { dashboard_customization: {...} }, or direct {...}
        $actualConfig = null;
        if (isset($data['config']) && is_array($data['config'])) {
            $actualConfig = $data['config'];
        } elseif (isset($data['dashboard_customization']) && is_array($data['dashboard_customization'])) {
            $actualConfig = $data['dashboard_customization'];
        } else {
            $actualConfig = $data;
            unset($actualConfig['company_id']);
        }
        
        $configJson = json_encode($actualConfig);
        $targetCompanyId = intval($data['company_id'] ?? $company_id);
        if ($targetCompanyId <= 0) $targetCompanyId = 1;
        
        $stmtDel = $pdo->prepare("DELETE FROM settings WHERE company_id = ? AND setting_key = 'dashboard_customization'");
        $stmtDel->execute([$targetCompanyId]);
        
        $stmt = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (?, 'dashboard_customization', ?)");
        $stmt->execute([$targetCompanyId, $configJson]);
        
        // Also save as global company 0 fallback
        $stmtDel0 = $pdo->prepare("DELETE FROM settings WHERE company_id = 0 AND setting_key = 'dashboard_customization'");
        $stmtDel0->execute();
        $stmt0 = $pdo->prepare("INSERT INTO settings (company_id, setting_key, setting_value) VALUES (0, 'dashboard_customization', ?)");
        $stmt0->execute([$configJson]);
        
        echo json_encode([
            'status' => 'success',
            'data' => $actualConfig,
            'dashboard_customization' => $actualConfig,
            'config' => $actualConfig
        ]);
        break;

    case 'get_dashboard_settings':
        $targetCompanyId = intval($_GET['company_id'] ?? $company_id);
        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = ? AND setting_key = 'dashboard_customization' ORDER BY id DESC LIMIT 1");
        $stmt->execute([$targetCompanyId]);
        $val = $stmt->fetchColumn();
        if (!$val) {
            $stmt0 = $pdo->prepare("SELECT setting_value FROM settings WHERE company_id = 0 AND setting_key = 'dashboard_customization' ORDER BY id DESC LIMIT 1");
            $stmt0->execute();
            $val = $stmt0->fetchColumn();
        }
        
        $parsed = null;
        if ($val) {
            $rawParsed = json_decode($val, true);
            if (isset($rawParsed['config']) && is_array($rawParsed['config'])) {
                $parsed = $rawParsed['config'];
            } elseif (isset($rawParsed['dashboard_customization']) && is_array($rawParsed['dashboard_customization'])) {
                $parsed = $rawParsed['dashboard_customization'];
            } else {
                $parsed = $rawParsed;
            }
        }
        
        echo json_encode([
            'status' => 'success',
            'data' => $parsed,
            'dashboard_customization' => $parsed,
            'config' => $parsed
        ]);
        break;
}
?>
