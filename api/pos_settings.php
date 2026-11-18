<?php
session_start();
include('db_config.php');
require_once __DIR__ . '/fbr_client.php';

header('Content-Type: application/json');

$session = $_SESSION;
$rawInput = file_get_contents('php://input');
$jsonBody = !empty($rawInput) ? json_decode($rawInput, true) : null;

$company_id = intval($_GET['company_id'] ?? ($jsonBody['company_id'] ?? ($_POST['company_id'] ?? ($session['company_id'] ?? 1))));
if (!$company_id) {
    $company_id = 1;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// -------------------------------------------------------------
// Database Auto-Migrations & Upgrades
// -------------------------------------------------------------
try {
    // 1. Central POS Settings
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT,
        UNIQUE KEY (company_id, setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Ensure UNIQUE KEY uq_comp_setting exists so ON DUPLICATE KEY UPDATE works reliably without duplicate rows
    try {
        $idxCheck = $pdo->query("SHOW INDEX FROM pos_settings WHERE Key_name = 'uq_comp_setting'")->fetch();
        // Remove older duplicate rows first, keeping newest id
        $pdo->exec("
            DELETE s1 FROM pos_settings s1
            INNER JOIN pos_settings s2 
            WHERE s1.id < s2.id 
              AND s1.company_id = s2.company_id 
              AND s1.setting_key = s2.setting_key
        ");
        if (!$idxCheck) {
            $pdo->exec("ALTER TABLE pos_settings ADD UNIQUE KEY uq_comp_setting (company_id, setting_key)");
        }
    } catch (Exception $e) {}

    // 2. Branch-wise FBR Mappings
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_fbr_branch_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        branch_id INT NOT NULL,
        environment ENUM('sandbox', 'production') NOT NULL DEFAULT 'sandbox',
        fbr_pos_id VARCHAR(100) NULL,
        identification_no VARCHAR(50) NULL,
        pos_status VARCHAR(50) NOT NULL DEFAULT 'Registered',
        connected_date DATETIME NULL,
        fbr_pos_version VARCHAR(50) NOT NULL DEFAULT '1.0',
        is_cloud TINYINT(1) NOT NULL DEFAULT 1,
        pos_token TEXT NULL,
        last_test_result VARCHAR(50) NULL,
        last_tested_at DATETIME NULL,
        last_error TEXT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Not Configured',
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_comp_branch_env (company_id, branch_id, environment),
        INDEX idx_branch (branch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Dynamic column additions for existing installations
    $cols = [
        'identification_no' => "VARCHAR(50) NULL",
        'pos_status' => "VARCHAR(50) NOT NULL DEFAULT 'Registered'",
        'connected_date' => "DATETIME NULL",
        'fbr_pos_version' => "VARCHAR(50) NOT NULL DEFAULT '1.0'",
        'is_cloud' => "TINYINT(1) NOT NULL DEFAULT 1",
        'pos_token' => "TEXT NULL",
        'last_test_result' => "VARCHAR(50) NULL"
    ];
    foreach ($cols as $cName => $cDef) {
        try {
            $pdo->exec("ALTER TABLE pos_fbr_branch_mappings ADD COLUMN {$cName} {$cDef}");
        } catch (Exception $e) {}
    }

    // Ensure UNIQUE KEY uq_comp_branch_env exists so ON DUPLICATE KEY UPDATE works reliably
    try {
        $idxCheck = $pdo->query("SHOW INDEX FROM pos_fbr_branch_mappings WHERE Key_name = 'uq_comp_branch_env'")->fetch();
        if (!$idxCheck) {
            $pdo->exec("
                DELETE m1 FROM pos_fbr_branch_mappings m1
                INNER JOIN pos_fbr_branch_mappings m2 
                WHERE m1.id < m2.id 
                  AND m1.company_id = m2.company_id 
                  AND m1.branch_id = m2.branch_id 
                  AND m1.environment = m2.environment
            ");
            $pdo->exec("ALTER TABLE pos_fbr_branch_mappings ADD UNIQUE KEY uq_comp_branch_env (company_id, branch_id, environment)");
        }
    } catch (Exception $e) {}

    // 3. POS FBR Submission Logs
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_fbr_submission_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        branch_id INT NULL,
        branch_code VARCHAR(50) NULL,
        branch_name VARCHAR(150) NULL,
        invoice_id INT NULL,
        erp_invoice_no VARCHAR(50) NOT NULL,
        environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
        fbr_pos_id VARCHAR(100) NULL,
        submission_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(30) NOT NULL,
        fbr_response_code VARCHAR(50) NULL,
        fbr_invoice_number VARCHAR(100) NULL,
        error_message TEXT NULL,
        response_payload LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_comp (company_id),
        INDEX idx_branch (branch_id),
        INDEX idx_inv (erp_invoice_no),
        INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 4. POS Assigned Items
    $pdo->exec("CREATE TABLE IF NOT EXISTS pos_assigned_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        item_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_company_item (company_id, item_id),
        INDEX idx_comp (company_id),
        INDEX idx_item (item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {
    error_log("POS Settings Table Migration Error: " . $e->getMessage());
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Helper: Get Official FBR API URLs (Validate vs Post)
// -------------------------------------------------------------
function getFbrApiUrl($pdo, $company_id, $type = 'post', $env = 'sandbox') {
    $env = (strtolower(trim($env)) === 'production') ? 'production' : 'sandbox';
    $type = (strtolower(trim($type)) === 'validate') ? 'validate' : 'post';

    $settingKey = ($type === 'validate')
        ? (($env === 'production') ? 'fbr_validate_url_prod' : 'fbr_validate_url')
        : (($env === 'production') ? 'fbr_post_url_prod' : 'fbr_post_url');

    $stmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = ?");
    $stmt->execute([$company_id, $settingKey]);
    $custom = trim($stmt->fetchColumn() ?: '');

    if (empty($custom)) {
        // Fallback to legacy single setting key if present
        $fallbackKey = ($type === 'validate') ? 'fbr_validate_url' : 'fbr_post_url';
        $f_stmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = ?");
        $f_stmt->execute([$company_id, $fallbackKey]);
        $custom = trim($f_stmt->fetchColumn() ?: '');
    }

    return fbr_get_official_endpoint($type, $env, $custom);
}

// -------------------------------------------------------------
// ACTION: get_settings
// -------------------------------------------------------------
if ($action === 'get_settings') {
    $sql = "SELECT setting_key, setting_value FROM pos_settings WHERE company_id = ? ORDER BY id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id]);
    $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $settings = [];
    foreach ($result as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
    
    // Check tokens and mask them securely without exposing plain/encrypted strings
    $raw_token_sb = $settings['fbr_api_token_sandbox'] ?? ($settings['fbr_api_token'] ?? '');
    $raw_token_prod = $settings['fbr_api_token_production'] ?? '';

    $has_token_sb = !empty($raw_token_sb);
    $has_token_prod = !empty($raw_token_prod);
    $has_token = ($has_token_sb || $has_token_prod);

    $settings['fbr_api_token_masked'] = $has_token_sb ? fbr_mask_token($raw_token_sb) : '';
    $settings['fbr_api_token_sandbox_masked'] = $has_token_sb ? fbr_mask_token($raw_token_sb) : '';
    $settings['fbr_api_token_production_masked'] = $has_token_prod ? fbr_mask_token($raw_token_prod) : '';

    // NEVER return raw tokens in responses
    unset($settings['fbr_api_token']);
    unset($settings['fbr_api_token_sandbox']);
    unset($settings['fbr_api_token_production']);

    // Receipt default settings if not yet saved
    if (!isset($settings['rec_show_header'])) $settings['rec_show_header'] = '1';
    if (!isset($settings['rec_show_logo'])) $settings['rec_show_logo'] = '1';
    if (!isset($settings['rec_show_tax'])) $settings['rec_show_tax'] = '1';
    if (!isset($settings['rec_auto_print'])) $settings['rec_auto_print'] = '1';

    // Provide official default endpoints ONLY if not set
    if (empty($settings['fbr_validate_url'])) {
        $settings['fbr_validate_url'] = 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData';
    }
    if (empty($settings['fbr_post_url'])) {
        $settings['fbr_post_url'] = 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData';
    }
    if (empty($settings['fbr_validate_url_prod'])) {
        $settings['fbr_validate_url_prod'] = 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData';
    }
    if (empty($settings['fbr_post_url_prod'])) {
        $settings['fbr_post_url_prod'] = 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData';
    }

    // Multi-dimensional FBR status resolution
    $isFbrActive = ($settings['fbr_enable'] ?? '') === '1';
    $valUrl = $settings['fbr_validate_url'] ?? '';
    $hasValidUrl = !empty($valUrl) && fbr_validate_url($valUrl);

    $settings['fbr_config_status'] = ($has_token && $hasValidUrl) ? 'Configured' : 'Not Configured';

    if (!empty($valUrl) && !fbr_validate_url($valUrl)) {
        $settings['fbr_overall_status'] = 'Endpoint Invalid';
        $settings['fbr_server_connectivity'] = 'Unreachable';
        $settings['fbr_auth_status'] = 'Unable to Verify';
    } else {
        $settings['fbr_overall_status'] = $settings['fbr_overall_status'] ?? ($isFbrActive ? ($settings['fbr_config_status'] === 'Configured' ? 'Configured / Not Tested' : 'Not Configured') : 'Disabled');
        $settings['fbr_server_connectivity'] = $settings['fbr_server_connectivity'] ?? 'Not Tested';
        $settings['fbr_auth_status'] = $settings['fbr_auth_status'] ?? 'Not Tested';
    }

    $settings['fbr_validation_status'] = $settings['fbr_validation_status'] ?? 'Not Tested';
    $settings['fbr_submission_status'] = $settings['fbr_submission_status'] ?? 'Not Submitted';
    $settings['fbr_last_tested_at'] = $settings['fbr_last_tested_at'] ?? null;
    $settings['fbr_last_test_result'] = $settings['fbr_last_test_result'] ?? null;

    echo json_encode([
        'success' => true,
        'settings' => $settings,
        'has_fbr_token' => $has_token,
        'has_fbr_token_sandbox' => $has_token_sb,
        'has_fbr_token_production' => $has_token_prod
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: save_settings
// -------------------------------------------------------------
if ($action === 'save_settings') {
    $data = $jsonBody ?? json_decode($rawInput ?? file_get_contents('php://input'), true);
    
    if (!$data || !isset($data['settings'])) {
        echo json_encode(['error' => 'Invalid data provided']);
        exit;
    }
    
    $user_id = $_SESSION['user_id'] ?? 0;
    
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("
            INSERT INTO pos_settings (company_id, setting_key, setting_value, updated_by) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                setting_value = VALUES(setting_value), 
                updated_by = VALUES(updated_by)
        ");
        
        $fbrSettingsSaved = false;

        foreach ($data['settings'] as $key => $value) {
            // URL Validation: ensure valid HTTP/HTTPS URL format
            if (in_array($key, ['fbr_validate_url', 'fbr_post_url', 'fbr_base_url', 'fbr_validate_url_prod', 'fbr_post_url_prod', 'fbr_validate_url_sandbox', 'fbr_post_url_sandbox'])) {
                $trimmedUrl = trim($value);
                if (!empty($trimmedUrl) && !fbr_validate_url($trimmedUrl, $urlErr)) {
                    $pdo->rollBack();
                    echo json_encode([
                        'error' => "URL Validation Failed for '{$key}': " . ($urlErr ?? 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.')
                    ]);
                    exit;
                }
                $value = $trimmedUrl;
                $fbrSettingsSaved = true;
            }

            if (strpos($key, 'fbr_') === 0) {
                $fbrSettingsSaved = true;
            }

            // Encrypted Token Storage: do not overwrite with masked values
            if (in_array($key, ['fbr_api_token', 'fbr_api_token_sandbox', 'fbr_api_token_production'])) {
                $trimmed = trim($value);
                if (empty($trimmed) || fbr_is_masked($trimmed)) {
                    continue; // Retain existing token
                }
                // Encrypt token securely before database write
                $value = fbr_encrypt_token($trimmed);
                $fbrSettingsSaved = true;
            }

            $stmt->execute([$company_id, $key, $value, $user_id]);
        }

        // Auto-apply General Opening & Closing Hours and Weekly Off Day to all company branches
        $branchHoursApplied = false;
        if (array_key_exists('gen_opening_time', $data['settings']) || array_key_exists('gen_closing_time', $data['settings']) || array_key_exists('gen_off_day', $data['settings'])) {
            $applyToBranches = isset($data['settings']['gen_apply_hours_to_all_branches'])
                ? ($data['settings']['gen_apply_hours_to_all_branches'] === '1' || $data['settings']['gen_apply_hours_to_all_branches'] === true || $data['settings']['gen_apply_hours_to_all_branches'] === 'true')
                : true;

            if ($applyToBranches) {
                $genOpen = !empty($data['settings']['gen_opening_time']) ? trim($data['settings']['gen_opening_time']) : null;
                $genClose = !empty($data['settings']['gen_closing_time']) ? trim($data['settings']['gen_closing_time']) : null;
                $genOffDay = !empty($data['settings']['gen_off_day']) ? trim($data['settings']['gen_off_day']) : null;
                if ($genOpen && strlen($genOpen) === 5) {
                    $genOpen .= ':00';
                }
                if ($genClose && strlen($genClose) === 5) {
                    $genClose .= ':00';
                }

                $brStmt = $pdo->prepare("UPDATE company_branches SET opening_time = ?, closing_time = ?, off_day = ? WHERE company_id = ?");
                $brStmt->execute([$genOpen, $genClose, $genOffDay, $company_id]);
                $branchHoursApplied = true;
            }
        }
        
        // Reset connection status upon saving fresh FBR settings:
        // Never mark an integration as Connected merely because settings were saved!
        if ($fbrSettingsSaved) {
            $valUrl = $data['settings']['fbr_validate_url'] ?? '';
            $env = $data['settings']['fbr_environment'] ?? 'sandbox';
            $tokenGiven = !empty($data['settings']['fbr_api_token_sandbox']) || !empty($data['settings']['fbr_api_token_production']) || !empty($data['settings']['fbr_api_token']);
            $isEnabled = ($data['settings']['fbr_enable'] ?? '') === '1';

            if (!$isEnabled) {
                $overall = 'Disabled';
                $cfg = 'Not Configured';
            } elseif (!empty($valUrl) && !fbr_validate_url($valUrl)) {
                $overall = 'Endpoint Invalid';
                $cfg = 'Configured';
            } elseif ($tokenGiven || !empty($valUrl)) {
                $overall = 'Configured / Not Tested';
                $cfg = 'Configured';
            } else {
                $overall = 'Not Configured';
                $cfg = 'Not Configured';
            }

            $resetKeys = [
                'fbr_overall_status' => $overall,
                'fbr_config_status' => $cfg,
                'fbr_server_connectivity' => 'Not Tested',
                'fbr_auth_status' => 'Not Tested'
            ];
            foreach ($resetKeys as $rk => $rv) {
                $stmt->execute([$company_id, $rk, $rv, $user_id]);
            }
        }

        $pdo->commit();
        $msg = 'Settings saved successfully';
        if ($branchHoursApplied) {
            $msg .= ' and operating hours applied to all branches';
        }
        if ($fbrSettingsSaved) {
            $msg .= '. Connection status reset to ' . ($overall ?? 'Configured / Not Tested') . ' until Test Connection is run.';
        }

        echo json_encode([
            'success' => true, 
            'message' => $msg
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// -------------------------------------------------------------
// ACTION: get_branch_mappings
// Dynamically loads all active ERP branches & their FBR mappings
// -------------------------------------------------------------
if ($action === 'get_branch_mappings') {
    $env = $_GET['env'] ?? 'sandbox';
    if (!in_array($env, ['sandbox', 'production'])) {
        $env = 'sandbox';
    }

    // Read global FBR integration enabled flag
    $g_stmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = 'fbr_enable'");
    $g_stmt->execute([$company_id]);
    $global_enabled = ($g_stmt->fetchColumn() === '1');

    // Query company branches and left join mapping for this environment
    $sql = "
        SELECT 
            b.id AS branch_id,
            b.branch_code,
            b.branch_name,
            b.address,
            b.status AS branch_active_status,
            m.id AS mapping_id,
            COALESCE(NULLIF(m.fbr_pos_id, ''), b.fbr_pos_id, '') AS fbr_pos_id,
            COALESCE(NULLIF(m.identification_no, ''), b.fbr_identification_no, '') AS identification_no,
            COALESCE(m.pos_status, 'Registered') AS pos_status,
            m.connected_date,
            COALESCE(m.fbr_pos_version, '1.0') AS fbr_pos_version,
            COALESCE(m.is_cloud, 1) AS is_cloud,
            m.pos_token AS raw_pos_token,
            CASE WHEN m.pos_token IS NOT NULL AND m.pos_token != '' THEN 1 ELSE 0 END AS has_pos_token,
            COALESCE(m.is_enabled, 1) AS is_enabled,
            COALESCE(m.status, 'Not Configured') AS raw_status,
            m.last_test_result,
            m.last_tested_at,
            m.last_error
        FROM company_branches b
        LEFT JOIN pos_fbr_branch_mappings m 
            ON b.id = m.branch_id 
            AND m.company_id = b.company_id 
            AND m.environment = ?
        WHERE b.company_id = ?
        ORDER BY b.branch_code ASC, b.branch_name ASC
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$env, $company_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $mappings = [];
    $count_configured = 0;
    $count_connected = 0;
    $count_disabled = 0;

    foreach ($rows as $r) {
        $pos_id = trim($r['fbr_pos_id'] ?? '');
        $is_enabled = intval($r['is_enabled']) === 1;
        $raw_token = trim($r['raw_pos_token'] ?? '');
        $has_pos_token = !empty($raw_token);
        $plain_token = $has_pos_token ? fbr_decrypt_token($raw_token) : '';
        $masked_token = $has_pos_token ? fbr_mask_token($raw_token) : '';

        // Accurate connection status:
        // - Disabled if branch is toggled off or global FBR disabled
        // - Not Configured if POS ID is empty
        // - Connected ONLY if explicitly tested and verified in DB
        // - Connection Failed if test recorded an error
        // - Configuration Required if POS ID is configured but not yet verified
        if (!$global_enabled || !$is_enabled) {
            $display_status = 'Disabled';
            $count_disabled++;
        } elseif (empty($pos_id)) {
            $display_status = 'Not Configured';
        } else {
            $count_configured++;
            if ($r['raw_status'] === 'Connected') {
                $display_status = 'Connected';
                $count_connected++;
            } elseif ($r['raw_status'] === 'Connection Failed') {
                $display_status = 'Connection Failed';
            } else {
                $display_status = 'Configuration Required';
            }
        }

        $mappings[] = [
            'branch_id' => intval($r['branch_id']),
            'branch_code' => $r['branch_code'],
            'branch_name' => $r['branch_name'],
            'address' => $r['address'] ?? '',
            'fbr_pos_id' => $pos_id,
            'identification_no' => $r['identification_no'] ?? '',
            'pos_status' => $r['pos_status'] ?? 'Registered',
            'connected_date' => $r['connected_date'] ? date('Y-m-d H:i:s', strtotime($r['connected_date'])) : null,
            'fbr_pos_version' => $r['fbr_pos_version'] ?? '1.0',
            'is_cloud' => intval($r['is_cloud']) === 1,
            'has_pos_token' => $has_pos_token,
            'pos_token' => $plain_token,
            'pos_token_masked' => $masked_token,
            'is_enabled' => $is_enabled ? 1 : 0,
            'status' => $display_status,
            'last_test_result' => $r['last_test_result'] ?? ($display_status === 'Connected' ? 'Success' : ($display_status === 'Connection Failed' ? 'Failed' : 'Not Tested')),
            'last_tested_at' => $r['last_tested_at'] ? date('Y-m-d H:i:s', strtotime($r['last_tested_at'])) : null,
            'last_error' => $r['last_error'] ?? null
        ];
    }

    echo json_encode([
        'success' => true,
        'environment' => $env,
        'global_enabled' => $global_enabled,
        'mappings' => $mappings,
        'summary' => [
            'total_branches' => count($mappings),
            'configured' => $count_configured,
            'connected' => $count_connected,
            'disabled' => $count_disabled
        ]
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: save_branch_mapping
// -------------------------------------------------------------
if ($action === 'save_branch_mapping') {
    $data = json_decode(file_get_contents('php://input'), true);
    $branch_id = intval($data['branch_id'] ?? 0);
    $env = trim($data['environment'] ?? 'sandbox');
    $pos_id = trim($data['fbr_pos_id'] ?? '');
    $ident_no = trim($data['identification_no'] ?? '');
    $pos_status = trim($data['pos_status'] ?? 'Registered');
    $version = trim($data['fbr_pos_version'] ?? '1.0');
    $is_cloud = isset($data['is_cloud']) ? (intval($data['is_cloud']) ? 1 : 0) : 1;
    $pos_token = trim($data['pos_token'] ?? '');
    $is_enabled = isset($data['is_enabled']) ? (intval($data['is_enabled']) ? 1 : 0) : 1;

    if (!$branch_id) {
        echo json_encode(['error' => 'Branch ID is required']);
        exit;
    }
    if (!in_array($env, ['sandbox', 'production'])) {
        $env = 'sandbox';
    }

    // Verify branch belongs to current company
    $b_stmt = $pdo->prepare("SELECT id, branch_name, branch_code FROM company_branches WHERE id = ? AND company_id = ?");
    $b_stmt->execute([$branch_id, $company_id]);
    $branch = $b_stmt->fetch(PDO::FETCH_ASSOC);

    if (!$branch) {
        echo json_encode(['error' => 'Branch not found or does not belong to this company']);
        exit;
    }

    // Retain connected status only if POS ID hasn't changed
    $cur_stmt = $pdo->prepare("SELECT fbr_pos_id, status, connected_date, pos_token FROM pos_fbr_branch_mappings WHERE company_id = ? AND branch_id = ? AND environment = ?");
    $cur_stmt->execute([$company_id, $branch_id, $env]);
    $existing = $cur_stmt->fetch(PDO::FETCH_ASSOC);

    if (!$is_enabled) {
        $status = 'Disabled';
    } elseif (empty($pos_id)) {
        $status = 'Not Configured';
    } else {
        if ($existing && $existing['fbr_pos_id'] === $pos_id && $existing['status'] === 'Connected') {
            $status = 'Connected';
        } else {
            $status = 'Configuration Required';
        }
    }

    // Token handling: if new/modified token provided, encrypt it; if masked, keep existing; if empty, null
    $tokenToSave = $existing['pos_token'] ?? null;
    if ($pos_token !== '') {
        if (!fbr_is_masked($pos_token)) {
            $tokenToSave = fbr_encrypt_token($pos_token);
        }
    } else {
        $tokenToSave = null;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO pos_fbr_branch_mappings 
                (company_id, branch_id, environment, fbr_pos_id, identification_no, pos_status, fbr_pos_version, is_cloud, pos_token, is_enabled, status)
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                fbr_pos_id = VALUES(fbr_pos_id),
                identification_no = VALUES(identification_no),
                pos_status = VALUES(pos_status),
                fbr_pos_version = VALUES(fbr_pos_version),
                is_cloud = VALUES(is_cloud),
                pos_token = VALUES(pos_token),
                is_enabled = VALUES(is_enabled),
                status = VALUES(status)
        ");
        $stmt->execute([$company_id, $branch_id, $env, $pos_id, $ident_no, $pos_status, $version, $is_cloud, $tokenToSave, $is_enabled, $status]);

        // Synchronize FBR POS ID and Ident No back to company_branches
        try {
            $updB = $pdo->prepare("UPDATE company_branches SET fbr_pos_id = ?, fbr_identification_no = ?, status = 'Active' WHERE id = ? AND company_id = ?");
            $updB->execute([$pos_id, $ident_no, $branch_id, $company_id]);
        } catch (Exception $e) {}

        echo json_encode([
            'success' => true,
            'message' => "FBR mapping updated for branch: {$branch['branch_name']} ({$branch['branch_code']})",
            'status' => $status
        ]);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Database error saving branch mapping: ' . $e->getMessage()]);
    }
    exit;
}

// -------------------------------------------------------------
// ACTION: reset_branch_mapping (Authorized Reset)
// -------------------------------------------------------------
if ($action === 'reset_branch_mapping') {
    $data = json_decode(file_get_contents('php://input'), true);
    $branch_id = intval($data['branch_id'] ?? 0);
    $env = trim($data['environment'] ?? 'sandbox');

    if (!$branch_id) {
        echo json_encode(['error' => 'Branch ID is required']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            UPDATE pos_fbr_branch_mappings 
            SET status = 'Configuration Required',
                last_test_result = 'Not Tested',
                connected_date = NULL,
                last_tested_at = NULL,
                last_error = NULL
            WHERE company_id = ? AND branch_id = ? AND environment = ?
        ");
        $stmt->execute([$company_id, $branch_id, $env]);

        echo json_encode([
            'success' => true,
            'message' => 'Branch connection status has been successfully reset.'
        ]);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// -------------------------------------------------------------
// ACTION: deactivate_branch_mapping (Toggle Active/Inactive)
// -------------------------------------------------------------
if ($action === 'deactivate_branch_mapping') {
    $data = json_decode(file_get_contents('php://input'), true);
    $branch_id = intval($data['branch_id'] ?? 0);
    $env = trim($data['environment'] ?? 'sandbox');
    $is_enabled = intval($data['is_enabled'] ?? 0);

    if (!$branch_id) {
        echo json_encode(['error' => 'Branch ID is required']);
        exit;
    }

    try {
        $newStatus = ($is_enabled === 1) ? 'Configuration Required' : 'Disabled';
        $stmt = $pdo->prepare("
            UPDATE pos_fbr_branch_mappings 
            SET is_enabled = ?, status = ?
            WHERE company_id = ? AND branch_id = ? AND environment = ?
        ");
        $stmt->execute([$is_enabled, $newStatus, $company_id, $branch_id, $env]);

        echo json_encode([
            'success' => true,
            'message' => ($is_enabled === 1) ? 'Branch integration enabled.' : 'Branch integration deactivated.',
            'status' => $newStatus
        ]);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// -------------------------------------------------------------
// ACTION: delete_branch_mapping (Delete Branch from FBR Mapping)
// -------------------------------------------------------------
if ($action === 'delete_branch_mapping') {
    $rawInput = file_get_contents('php://input');
    $data = !empty($rawInput) ? json_decode($rawInput, true) : [];
    $branch_id = intval($data['branch_id'] ?? ($_POST['branch_id'] ?? ($_GET['branch_id'] ?? 0)));

    if (!$branch_id) {
        echo json_encode(['error' => 'Branch ID is required']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // 1. Delete mapping entries
        $delMap = $pdo->prepare("DELETE FROM pos_fbr_branch_mappings WHERE company_id = ? AND branch_id = ?");
        $delMap->execute([$company_id, $branch_id]);

        // 2. Check if branch is linked to sales invoices
        try {
            $chkSales = $pdo->prepare("SELECT id FROM sale_invoices WHERE company_id = ? AND inventory_location_id = ? LIMIT 1");
            $chkSales->execute([$company_id, $branch_id]);
            $hasSales = $chkSales->fetch();
        } catch (Exception $e) {
            $hasSales = false;
        }

        if ($hasSales) {
            // Soft-deactivate branch so historical invoices don't break
            $upd = $pdo->prepare("UPDATE company_branches SET status = 'Inactive' WHERE id = ? AND company_id = ?");
            $upd->execute([$branch_id, $company_id]);
        } else {
            // Delete branch from company_branches
            $delBranch = $pdo->prepare("DELETE FROM company_branches WHERE id = ? AND company_id = ?");
            $delBranch->execute([$branch_id, $company_id]);
        }

        $pdo->commit();
        echo json_encode([
            'success' => true,
            'message' => 'Branch mapping deleted successfully.'
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// -------------------------------------------------------------
// ACTION: add_branch_quick (Connect existing ERP branch or create new)
// -------------------------------------------------------------
if ($action === 'add_branch_quick') {
    $data = json_decode(file_get_contents('php://input'), true);
    $branch_id = intval($data['branch_id'] ?? 0);
    $name = trim($data['branch_name'] ?? '');
    $code = strtoupper(trim($data['branch_code'] ?? ''));
    $address = trim($data['address'] ?? '');
    $pos_id = trim($data['fbr_pos_id'] ?? '');
    $ident_no = trim($data['identification_no'] ?? '');
    $pos_token = trim($data['pos_token'] ?? '');
    $env = trim($data['environment'] ?? 'sandbox');
    if (!in_array($env, ['sandbox', 'production'])) $env = 'sandbox';

    $tokenToSave = (!empty($pos_token) && !fbr_is_masked($pos_token)) ? fbr_encrypt_token($pos_token) : null;

    // Option A: Connecting an existing ERP branch
    if ($branch_id > 0) {
        $bStmt = $pdo->prepare("SELECT id, branch_name, branch_code FROM company_branches WHERE id = ? AND company_id = ?");
        $bStmt->execute([$branch_id, $company_id]);
        $branch = $bStmt->fetch(PDO::FETCH_ASSOC);

        if (!$branch) {
            echo json_encode(['error' => 'Selected ERP branch not found.']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            // Update branch to Active and save FBR IDs
            if ($address !== '') {
                $updB = $pdo->prepare("UPDATE company_branches SET status = 'Active', fbr_pos_id = ?, fbr_identification_no = ?, address = ? WHERE id = ? AND company_id = ?");
                $updB->execute([$pos_id, $ident_no, $address, $branch_id, $company_id]);
            } else {
                $updB = $pdo->prepare("UPDATE company_branches SET status = 'Active', fbr_pos_id = ?, fbr_identification_no = ? WHERE id = ? AND company_id = ?");
                $updB->execute([$pos_id, $ident_no, $branch_id, $company_id]);
            }

            // Upsert mappings for both sandbox & production
            foreach (['sandbox', 'production'] as $e) {
                $initialStatus = !empty($pos_id) ? 'Configuration Required' : 'Not Configured';
                $insMap = $pdo->prepare("
                    INSERT INTO pos_fbr_branch_mappings 
                        (company_id, branch_id, environment, fbr_pos_id, identification_no, pos_status, fbr_pos_version, is_cloud, pos_token, is_enabled, status)
                    VALUES 
                        (?, ?, ?, ?, ?, 'Registered', '1.0', 1, ?, 1, ?)
                    ON DUPLICATE KEY UPDATE 
                        fbr_pos_id = VALUES(fbr_pos_id),
                        identification_no = VALUES(identification_no),
                        pos_token = COALESCE(VALUES(pos_token), pos_token),
                        is_enabled = 1,
                        status = VALUES(status)
                ");
                $insMap->execute([$company_id, $branch_id, $e, $pos_id, $ident_no, $tokenToSave, $initialStatus]);
            }

            $pdo->commit();
            echo json_encode([
                'success' => true,
                'message' => "Branch '{$branch['branch_name']}' successfully connected to FBR!",
                'branch_id' => $branch_id
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['error' => 'Database error connecting branch: ' . $e->getMessage()]);
        }
        exit;
    }

    // Option B: Creating a brand new ERP branch and connecting it
    if (empty($name) || empty($code)) {
        echo json_encode(['error' => 'Branch Name and Branch Code are required.']);
        exit;
    }

    // Check duplicate code
    $chk = $pdo->prepare("SELECT id FROM company_branches WHERE company_id = ? AND branch_code = ?");
    $chk->execute([$company_id, $code]);
    if ($chk->fetch()) {
        echo json_encode(['error' => "Branch code '{$code}' already exists. Please choose another code."]);
        exit;
    }

    try {
        $pdo->beginTransaction();
        $ins = $pdo->prepare("
            INSERT INTO company_branches (company_id, branch_code, branch_name, address, status, fbr_pos_id, fbr_identification_no)
            VALUES (?, ?, ?, ?, 'Active', ?, ?)
        ");
        $ins->execute([$company_id, $code, $name, $address, $pos_id, $ident_no]);
        $newBranchId = $pdo->lastInsertId();

        // Create mappings for sandbox & production
        foreach (['sandbox', 'production'] as $e) {
            $insMap = $pdo->prepare("
                INSERT INTO pos_fbr_branch_mappings 
                    (company_id, branch_id, environment, fbr_pos_id, identification_no, pos_status, fbr_pos_version, is_cloud, pos_token, is_enabled, status)
                VALUES 
                    (?, ?, ?, ?, ?, 'Registered', '1.0', 1, ?, 1, ?)
            ");
            $initialStatus = !empty($pos_id) ? 'Configuration Required' : 'Not Configured';
            $insMap->execute([$company_id, $newBranchId, $e, $pos_id, $ident_no, $tokenToSave, $initialStatus]);
        }

        $pdo->commit();
        echo json_encode([
            'success' => true,
            'message' => "New branch '{$name}' created and connected to FBR mappings!",
            'branch_id' => $newBranchId
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => 'Database error creating branch: ' . $e->getMessage()]);
    }
    exit;
}

// -------------------------------------------------------------
// ACTION: test_fbr_connection
// Validates official FBR endpoint without posting real sales invoice
// -------------------------------------------------------------
if ($action === 'test_fbr_connection') {
    $env = $_GET['env'] ?? 'sandbox';
    $branch_id = intval($_GET['branch_id'] ?? 0);

    if (!in_array($env, ['sandbox', 'production'])) {
        $env = 'sandbox';
    }

    // Read central settings
    $s_stmt = $pdo->prepare("SELECT setting_key, setting_value FROM pos_settings WHERE company_id = ?");
    $s_stmt->execute([$company_id]);
    $settings = [];
    while ($r = $s_stmt->fetch(PDO::FETCH_ASSOC)) {
        $settings[$r['setting_key']] = $r['setting_value'];
    }

    $is_enabled = ($settings['fbr_enable'] ?? '') === '1';

    if (!$is_enabled) {
        echo json_encode([
            'success' => false,
            'error' => 'FBR Integration is currently disabled. Please enable it before testing connection.'
        ]);
        exit;
    }

    // Resolve environment-specific central token
    $central_token = ($env === 'production')
        ? ($settings['fbr_api_token_production'] ?? ($settings['fbr_api_token'] ?? ''))
        : ($settings['fbr_api_token_sandbox'] ?? ($settings['fbr_api_token'] ?? ''));

    $branch_name = 'Central Configuration';
    $branch_pos_id = '';
    $branch_token = '';

    if ($branch_id > 0) {
        // Validate branch specific details
        $b_stmt = $pdo->prepare("
            SELECT b.branch_name, b.branch_code, m.fbr_pos_id, m.identification_no, m.pos_token, m.is_enabled 
            FROM company_branches b 
            LEFT JOIN pos_fbr_branch_mappings m ON b.id = m.branch_id AND m.company_id = b.company_id AND m.environment = ?
            WHERE b.id = ? AND b.company_id = ?
        ");
        $b_stmt->execute([$env, $branch_id, $company_id]);
        $branchInfo = $b_stmt->fetch(PDO::FETCH_ASSOC);

        if (!$branchInfo) {
            echo json_encode(['success' => false, 'error' => 'Branch not found.']);
            exit;
        }

        $branch_name = $branchInfo['branch_name'] . ' (' . $branchInfo['branch_code'] . ')';
        $branch_pos_id = trim($branchInfo['fbr_pos_id'] ?? '');
        $branch_token = trim($branchInfo['pos_token'] ?? '');

        if (intval($branchInfo['is_enabled'] ?? 1) === 0) {
            echo json_encode(['success' => false, 'error' => "Integration is disabled for branch: {$branch_name}"]);
            exit;
        }

        if (empty($branch_pos_id)) {
            echo json_encode([
                'success' => false,
                'error' => "FBR POS ID is not configured for branch: {$branch_name}. Please assign an official POS ID first."
            ]);
            exit;
        }
    }

    // Use branch-specific token override if provided, otherwise central environment token
    $raw_token = !empty($branch_token) ? $branch_token : $central_token;

    // If central test is run and central token is empty, automatically use first branch token
    if (empty($raw_token) && $branch_id === 0) {
        $b_tok_stmt = $pdo->prepare("SELECT pos_token, fbr_pos_id FROM pos_fbr_branch_mappings WHERE company_id = ? AND environment = ? AND pos_token IS NOT NULL AND pos_token != '' LIMIT 1");
        $b_tok_stmt->execute([$company_id, $env]);
        $firstBranch = $b_tok_stmt->fetch(PDO::FETCH_ASSOC);
        if ($firstBranch) {
            $raw_token = $firstBranch['pos_token'];
            $branch_pos_id = $firstBranch['fbr_pos_id'];
        }
    }

    $active_token = fbr_decrypt_token($raw_token);

    if (empty($active_token)) {
        echo json_encode([
            'success' => false,
            'error' => ($branch_id > 0)
                ? "Official e-FBR POS Security Token is missing for {$branch_name}. Please click 'Edit' on this branch and enter the token."
                : 'API Authorization Token is missing. Please configure your branch e-FBR Security Token below in Dynamic Branch-wise FBR Mapping.'
        ]);
        exit;
    }

    // Safety Rule: Sandbox credentials must not be used on production
    if ($env === 'production') {
        if (stripos($active_token, 'sandbox') !== false || stripos($active_token, 'test') !== false) {
            echo json_encode([
                'success' => false,
                'error' => 'Safety Warning: Sandbox test credentials detected. Production mode requires official Live FBR credentials.'
            ]);
            exit;
        }
    }

    // Connect to official FBR endpoint via shared client (uses Validate endpoint for non-destructive check)
    $custom_url = ($env === 'production')
        ? ($settings['fbr_validate_url_prod'] ?? ($settings['fbr_validate_url'] ?? ''))
        : ($settings['fbr_validate_url'] ?? '');
    $api_url = fbr_get_official_endpoint('validate', $env, $custom_url);

    // Execute real multi-dimensional diagnostic verification
    $diag = fbr_diagnose_integration($api_url, $active_token, $env, [
        'company_id' => $company_id,
        'branch_id' => $branch_id,
        'pos_id' => $branch_pos_id,
        'pdo' => $pdo
    ]);

    // Save individual statuses into pos_settings
    $statusKeys = [
        'fbr_overall_status' => $diag['overall_status'],
        'fbr_config_status' => $diag['config_status'],
        'fbr_server_connectivity' => $diag['server_connectivity'],
        'fbr_auth_status' => $diag['auth_status'],
        'fbr_validation_status' => $diag['validation_status'],
        'fbr_submission_status' => $diag['submission_status'],
        'fbr_last_test_result' => $diag['message'],
        'fbr_last_tested_at' => $diag['tested_at'],
        'fbr_last_http_code' => strval($diag['http_code']),
        'fbr_last_latency' => strval($diag['latency_ms'])
    ];

    $updSett = $pdo->prepare("INSERT INTO pos_settings (company_id, setting_key, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    foreach ($statusKeys as $k => $v) {
        $updSett->execute([$company_id, $k, $v]);
    }

    if ($branch_id > 0) {
        $branchStatus = $diag['overall_status'];
        $lastErr = $diag['success'] ? null : $diag['message'];
        $updBranch = $pdo->prepare("UPDATE pos_fbr_branch_mappings SET status = ?, last_test_result = ?, last_tested_at = NOW(), last_error = ?, connected_date = " . ($diag['success'] ? "NOW()" : "connected_date") . " WHERE company_id = ? AND branch_id = ? AND environment = ?");
        $updBranch->execute([$branchStatus, $branchStatus, $lastErr, $company_id, $branch_id, $env]);
    }

    echo json_encode([
        'success' => $diag['success'],
        'status' => $diag['overall_status'],
        'overall_status' => $diag['overall_status'],
        'config_status' => $diag['config_status'],
        'server_connectivity' => $diag['server_connectivity'],
        'auth_status' => $diag['auth_status'],
        'validation_status' => $diag['validation_status'],
        'submission_status' => $diag['submission_status'],
        'http_code' => $diag['http_code'],
        'latency_ms' => $diag['latency_ms'],
        'endpoint' => $diag['endpoint'],
        'message' => $diag['message'],
        'error' => $diag['success'] ? null : $diag['message']
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: get_fbr_logs
// Retrieves recent POS FBR submission records for Logs & Status tab
// -------------------------------------------------------------
if ($action === 'get_fbr_logs') {
    // Auto-normalize any legacy 'Success' logs or rows with valid FBR Invoice Reference to 'Submitted'
    try {
        $pdo->exec("
            UPDATE pos_fbr_submission_logs 
            SET status = 'Submitted' 
            WHERE status = 'Success' 
               OR (status = 'Failed' AND fbr_invoice_number IS NOT NULL AND fbr_invoice_number != '' AND fbr_invoice_number NOT IN ('Not Available', 'None', '—'))
        ");
    } catch (Exception $e) {}

    $branch_id = intval($_GET['branch_id'] ?? 0);
    $status_filter = trim($_GET['status'] ?? '');
    $limit = min(100, max(10, intval($_GET['limit'] ?? 50)));

    $sql = "
        SELECT 
            id,
            branch_id,
            branch_code,
            branch_name,
            erp_invoice_no,
            environment,
            fbr_pos_id,
            submission_time,
            CASE 
                WHEN status IN ('Submitted', 'Success', 'Accepted') 
                     OR (fbr_invoice_number IS NOT NULL AND fbr_invoice_number != '' AND fbr_invoice_number NOT IN ('Not Available', 'None', '—')) 
                THEN 'Submitted'
                WHEN status IN ('Rejected', 'Validation Failed') THEN 'Failed'
                ELSE status 
            END AS status,
            fbr_response_code,
            fbr_invoice_number,
            error_message
        FROM pos_fbr_submission_logs
        WHERE company_id = ?
    ";
    $params = [$company_id];

    if ($branch_id > 0) {
        $sql .= " AND branch_id = ?";
        $params[] = $branch_id;
    }

    if (!empty($status_filter)) {
        if ($status_filter === 'Submitted') {
            $sql .= " AND (status IN ('Submitted', 'Success', 'Accepted') OR (fbr_invoice_number IS NOT NULL AND fbr_invoice_number != '' AND fbr_invoice_number NOT IN ('Not Available', 'None', '—')))";
        } elseif ($status_filter === 'Failed') {
            $sql .= " AND (status IN ('Failed', 'Rejected', 'Validation Failed') AND (fbr_invoice_number IS NULL OR fbr_invoice_number = '' OR fbr_invoice_number IN ('Not Available', 'None', '—')))";
        } else {
            $sql .= " AND status = ?";
            $params[] = $status_filter;
        }
    }

    $sql .= " ORDER BY submission_time DESC LIMIT " . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'logs' => $logs
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: get_pos_items
// Retrieves all ERP items with their POS assignment status
// -------------------------------------------------------------
if ($action === 'get_pos_items') {
    // Check if filter is enabled
    $setStmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = 'pos_item_filter_enabled'");
    $setStmt->execute([$company_id]);
    $filter_enabled = ($setStmt->fetchColumn() === '1');

    // Fetch all active inventory items with categories and assignment status
    $sql = "
        SELECT 
            i.id,
            i.code,
            i.name,
            i.unit,
            COALESCE(i.selling_price, 0) as selling_price,
            COALESCE(m.name, s.name, 'General') as category_name,
            COALESCE(b.name, '') as brand_name,
            CASE WHEN pai.id IS NOT NULL THEN 1 ELSE 0 END AS is_assigned
        FROM inv_items i
        LEFT JOIN inv_sub_categories s ON i.sub_id = s.id
        LEFT JOIN inv_main_categories m ON s.main_id = m.id
        LEFT JOIN inv_brands b ON i.brand_id = b.id
        LEFT JOIN pos_assigned_items pai ON (pai.item_id = i.id AND pai.company_id = i.company_id)
        WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
        ORDER BY i.code ASC, i.name ASC
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $assigned_count = 0;
    $categories = [];
    foreach ($items as &$item) {
        $item['id'] = intval($item['id']);
        $item['is_assigned'] = intval($item['is_assigned']);
        $item['selling_price'] = floatval($item['selling_price']);
        if ($item['is_assigned'] === 1) {
            $assigned_count++;
        }
        $cat = trim($item['category_name'] ?? '');
        if (!empty($cat) && !in_array($cat, $categories)) {
            $categories[] = $cat;
        }
    }
    sort($categories);

    echo json_encode([
        'success' => true,
        'filter_enabled' => $filter_enabled,
        'items' => $items,
        'categories' => $categories,
        'stats' => [
            'total' => count($items),
            'assigned' => $assigned_count
        ]
    ]);
    exit;
}

// -------------------------------------------------------------
// ACTION: save_pos_items
// Saves POS item assignment settings and assigned item IDs
// -------------------------------------------------------------
if ($action === 'save_pos_items') {
    $data = json_decode(file_get_contents('php://input'), true);
    $filter_enabled = !empty($data['filter_enabled']) ? '1' : '0';
    $assigned_item_ids = is_array($data['assigned_item_ids'] ?? null) ? $data['assigned_item_ids'] : [];

    $user_id = $_SESSION['user_id'] ?? 0;

    try {
        $pdo->beginTransaction();

        // 1. Save filter enabled flag in pos_settings
        $setStmt = $pdo->prepare("
            INSERT INTO pos_settings (company_id, setting_key, setting_value, updated_by)
            VALUES (?, 'pos_item_filter_enabled', ?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
        ");
        $setStmt->execute([$company_id, $filter_enabled, $user_id]);

        // 2. Clear old assignments for this company
        $delStmt = $pdo->prepare("DELETE FROM pos_assigned_items WHERE company_id = ?");
        $delStmt->execute([$company_id]);

        // 3. Insert newly assigned items
        if (!empty($assigned_item_ids)) {
            $insStmt = $pdo->prepare("INSERT INTO pos_assigned_items (company_id, item_id) VALUES (?, ?)");
            foreach ($assigned_item_ids as $itemId) {
                $itemId = intval($itemId);
                if ($itemId > 0) {
                    $insStmt->execute([$company_id, $itemId]);
                }
            }
        }

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => 'POS item assignments saved successfully!',
            'assigned_count' => count($assigned_item_ids),
            'filter_enabled' => ($filter_enabled === '1')
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => 'Database error saving POS items: ' . $e->getMessage()]);
    }
    exit;
}

echo json_encode(['error' => 'Invalid action']);
