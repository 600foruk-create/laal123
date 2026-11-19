<?php
// SoftifyX ERP - FBR Digital Invoice Integration API
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once 'db_config.php';
require_once __DIR__ . '/fbr_client.php';

// Helper to mask sensitive tokens
function maskCredential($val) {
    if (empty($val)) return '';
    return fbr_mask_token($val);
}

// Helper to sanitize headers or payloads for logs (remove Authorization, token, secrets)
function sanitizeForLogs($data) {
    if (is_array($data)) {
        $clean = [];
        foreach ($data as $k => $v) {
            $lower = strtolower($k);
            if (strpos($lower, 'token') !== false || strpos($lower, 'secret') !== false || strpos($lower, 'auth') !== false || strpos($lower, 'password') !== false) {
                $clean[$k] = '[REDACTED_CREDENTIAL]';
            } else {
                $clean[$k] = sanitizeForLogs($v);
            }
        }
        return $clean;
    } elseif (is_string($data)) {
        return preg_replace('/Bearer\s+[A-Za-z0-9_\-\.]+/i', 'Bearer [REDACTED_TOKEN]', $data);
    }
    return $data;
}

// Migration: Ensure Tables and Columns Exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS digital_invoice_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        provider VARCHAR(50) DEFAULT 'PRAL',
        provider_name VARCHAR(100) DEFAULT 'Pakistan Revenue Automation Limited (PRAL)',
        environment VARCHAR(20) DEFAULT 'sandbox',
        api_base_url VARCHAR(255) DEFAULT 'https://gw.fbr.gov.pk/di_data/v1/di',
        api_validate_url VARCHAR(255) DEFAULT NULL,
        api_post_url VARCHAR(255) DEFAULT NULL,
        api_token TEXT DEFAULT NULL,
        api_token_sandbox TEXT DEFAULT NULL,
        api_token_production TEXT DEFAULT NULL,
        client_id VARCHAR(100) DEFAULT NULL,
        client_secret TEXT DEFAULT NULL,
        fbr_reg_ref VARCHAR(100) DEFAULT NULL,
        branch_mapping LONGTEXT DEFAULT NULL,
        request_timeout INT DEFAULT 30,
        retry_attempts INT DEFAULT 3,
        auto_retry TINYINT DEFAULT 1,
        enable_logging TINYINT DEFAULT 1,
        duplicate_protection TINYINT DEFAULT 1,
        log_level VARCHAR(20) DEFAULT 'all',
        connection_status VARCHAR(30) DEFAULT 'Not Configured',
        last_connection_test DATETIME DEFAULT NULL,
        last_test_result VARCHAR(100) DEFAULT NULL,
        last_test_time DATETIME DEFAULT NULL,
        sample_validation_status VARCHAR(30) DEFAULT 'Not Tested',
        last_validation_test DATETIME DEFAULT NULL,
        last_response_code VARCHAR(20) DEFAULT NULL,
        last_error_message TEXT DEFAULT NULL,
        last_result_details LONGTEXT DEFAULT NULL,
        error_info TEXT DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT DEFAULT NULL,
        UNIQUE KEY `unique_company_settings` (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Dynamic column migrations for existing tables
    $diCols = $pdo->query("SHOW COLUMNS FROM digital_invoice_settings")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('api_token_sandbox', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN api_token_sandbox TEXT DEFAULT NULL");
    }
    if (!in_array('api_token_production', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN api_token_production TEXT DEFAULT NULL");
    }
    if (!in_array('api_validate_url', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN api_validate_url VARCHAR(255) DEFAULT NULL");
    }
    if (!in_array('api_post_url', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN api_post_url VARCHAR(255) DEFAULT NULL");
    }
    if (!in_array('last_test_result', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN last_test_result VARCHAR(100) DEFAULT NULL");
    }
    if (!in_array('last_test_time', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN last_test_time DATETIME DEFAULT NULL");
    }
    if (!in_array('error_info', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN error_info TEXT DEFAULT NULL");
    }
    if (!in_array('config_status', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN config_status VARCHAR(50) DEFAULT 'Not Configured'");
    }
    if (!in_array('server_connectivity', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN server_connectivity VARCHAR(50) DEFAULT 'Not Tested'");
    }
    if (!in_array('auth_status', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN auth_status VARCHAR(50) DEFAULT 'Not Tested'");
    }
    if (!in_array('invoice_validation_status', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN invoice_validation_status VARCHAR(50) DEFAULT 'Not Tested'");
    }
    if (!in_array('invoice_submission_status', $diCols)) {
        $pdo->exec("ALTER TABLE digital_invoice_settings ADD COLUMN invoice_submission_status VARCHAR(50) DEFAULT 'Not Submitted'");
    }

    // Auto-migrate legacy dead PRAL endpoint URLs to official FBR gateway endpoints if explicitly obsolete
    $pdo->exec("UPDATE digital_invoice_settings SET 
        api_validate_url = 'https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb',
        api_post_url = 'https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb',
        api_base_url = 'https://gw.fbr.gov.pk/di_data/v1/di'
        WHERE api_base_url LIKE '%pral.com.pk%' AND environment = 'sandbox'");

    $pdo->exec("UPDATE digital_invoice_settings SET 
        api_validate_url = 'https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata',
        api_post_url = 'https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata',
        api_base_url = 'https://gw.fbr.gov.pk/di_data/v1/di'
        WHERE api_base_url LIKE '%pral.com.pk%' AND environment = 'production'");

    $pdo->exec("CREATE TABLE IF NOT EXISTS digital_invoice_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        environment VARCHAR(20) DEFAULT 'sandbox',
        provider VARCHAR(50) DEFAULT 'PRAL',
        endpoint VARCHAR(255) NOT NULL,
        request_method VARCHAR(10) DEFAULT 'POST',
        request_headers TEXT DEFAULT NULL,
        request_payload LONGTEXT DEFAULT NULL,
        response_code INT DEFAULT NULL,
        response_time_ms INT DEFAULT NULL,
        response_body LONGTEXT DEFAULT NULL,
        status VARCHAR(20) NOT NULL,
        sanitized_error TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (event_type),
        INDEX (status),
        INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {
    echo json_encode(['error' => 'Database migration error: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// Helper function to write to integration logs
function logIntegrationEvent($pdo, $company_id, $eventType, $env, $provider, $endpoint, $method, $headers, $payload, $respCode, $respTime, $respBody, $status, $errorMsg) {
    try {
        $stmt = $pdo->prepare("INSERT INTO digital_invoice_logs 
            (company_id, event_type, environment, provider, endpoint, request_method, request_headers, request_payload, response_code, response_time_ms, response_body, status, sanitized_error) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        $sanitizedHeaders = is_string($headers) ? $headers : json_encode(sanitizeForLogs($headers));
        $sanitizedPayload = is_string($payload) ? sanitizeForLogs($payload) : json_encode(sanitizeForLogs($payload));
        $sanitizedResp = is_string($respBody) ? $respBody : json_encode($respBody);

        $stmt->execute([
            $company_id,
            $eventType,
            $env,
            $provider,
            $endpoint,
            $method,
            $sanitizedHeaders,
            $sanitizedPayload,
            $respCode,
            $respTime,
            $sanitizedResp,
            $status,
            $errorMsg
        ]);
    } catch (Exception $e) {
        // Silently capture logging errors to not break main flow
    }
}

switch ($action) {
    case 'get_settings': {
        $stmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();

        if (!$row) {
            $row = [
                'company_id' => $company_id,
                'provider' => 'PRAL',
                'provider_name' => 'Pakistan Revenue Automation Limited (PRAL)',
                'environment' => 'sandbox',
                'api_base_url' => '',
                'api_validate_url' => '',
                'api_post_url' => '',
                'api_token' => null,
                'api_token_sandbox' => null,
                'api_token_production' => null,
                'client_id' => null,
                'client_secret' => null,
                'fbr_reg_ref' => null,
                'branch_mapping' => '[]',
                'request_timeout' => 30,
                'retry_attempts' => 3,
                'auto_retry' => 1,
                'enable_logging' => 1,
                'duplicate_protection' => 1,
                'log_level' => 'all',
                'connection_status' => 'Not Configured',
                'last_connection_test' => null,
                'last_test_result' => null,
                'last_test_time' => null,
                'sample_validation_status' => 'Not Tested',
                'last_validation_test' => null,
                'last_response_code' => null,
                'last_error_message' => null,
                'last_result_details' => null,
                'error_info' => null
            ];
        }

        $env = strtolower($row['environment'] ?? 'sandbox');

        // Official fallback endpoints for reference
        $row['official_validate_url'] = fbr_get_official_endpoint('validate', $env);
        $row['official_post_url'] = fbr_get_official_endpoint('post', $env);
        $row['api_validate_url'] = $row['api_validate_url'] ?? '';
        $row['api_post_url'] = $row['api_post_url'] ?? '';
        $row['api_base_url'] = $row['api_base_url'] ?? '';

        // Prevent false Connected status if endpoint is malformed or not verified
        $valUrl = $row['api_validate_url'] ?? '';
        $postUrl = $row['api_post_url'] ?? '';
        $isValValid = !empty($valUrl) ? fbr_validate_url($valUrl) : true;
        $isPostValid = !empty($postUrl) ? fbr_validate_url($postUrl) : true;

        if (!empty($valUrl) && !$isValValid) {
            $row['connection_status'] = 'Endpoint Invalid';
            $row['config_status'] = 'Configured';
            $row['server_connectivity'] = 'Unreachable';
            $row['auth_status'] = 'Failed';
        } elseif (($row['connection_status'] ?? '') === 'Connected' && ($row['auth_status'] ?? '') !== 'Verified') {
            $row['connection_status'] = 'Saved — Authentication Not Verified';
        }

        // Decrypt stored credentials
        $tokenActive = ($env === 'production')
            ? (!empty($row['api_token_production']) ? fbr_decrypt_token($row['api_token_production']) : fbr_decrypt_token($row['api_token']))
            : (!empty($row['api_token_sandbox']) ? fbr_decrypt_token($row['api_token_sandbox']) : fbr_decrypt_token($row['api_token']));

        $tokenSb = !empty($row['api_token_sandbox']) ? fbr_decrypt_token($row['api_token_sandbox']) : ($env === 'sandbox' ? fbr_decrypt_token($row['api_token']) : '');
        $tokenProd = !empty($row['api_token_production']) ? fbr_decrypt_token($row['api_token_production']) : ($env === 'production' ? fbr_decrypt_token($row['api_token']) : '');

        // Mask credentials for frontend UI
        $row['api_token_masked'] = fbr_mask_token($tokenActive);
        $row['api_token_sandbox_masked'] = fbr_mask_token($tokenSb);
        $row['api_token_production_masked'] = fbr_mask_token($tokenProd);
        $row['client_secret_masked'] = maskCredential($row['client_secret'] ?? '');

        $row['has_token'] = !empty($tokenActive);
        $row['has_token_sandbox'] = !empty($tokenSb);
        $row['has_token_production'] = !empty($tokenProd);
        $row['has_secret'] = !empty($row['client_secret']);

        // Never expose raw unmasked tokens in frontend responses
        unset($row['api_token']);
        unset($row['api_token_sandbox']);
        unset($row['api_token_production']);
        unset($row['client_secret']);

        echo json_encode(['success' => true, 'settings' => $row]);
        break;
    }

    case 'get_taxpayer_profile': {
        try {
            // Reuse existing ERP Company and Branch details
            $compStmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
            $compStmt->execute([$company_id]);
            $comp = $compStmt->fetch();

            if (!$comp) {
                // Fallback to first company in the ERP system
                $firstCompStmt = $pdo->query("SELECT * FROM companies ORDER BY id ASC LIMIT 1");
                $comp = $firstCompStmt ? $firstCompStmt->fetch() : null;
            }

            if (!$comp) {
                $comp = [
                    'id' => $company_id,
                    'name' => 'Main ERP Company',
                    'ntn' => '',
                    'gst' => '',
                    'address' => '',
                    'phone' => '',
                    'email' => ''
                ];
            }

            // Extract STRN/GST safely (supports either 'gst', 'gst_reg_no', or 'strn')
            $strn = $comp['gst'] ?? ($comp['gst_reg_no'] ?? ($comp['strn'] ?? ''));

            // Fetch active ERP branches safely
            $branches = [];
            try {
                $branchStmt = $pdo->prepare("SELECT id, branch_code, branch_name, address, contact_number, status FROM company_branches WHERE company_id = ? AND status = 'Active' ORDER BY branch_name ASC");
                $branchStmt->execute([$comp['id'] ?? $company_id]);
                $branches = $branchStmt->fetchAll() ?: [];
            } catch (Exception $be) {
                $branches = [];
            }

            // Fetch saved branch mapping from settings
            $setRow = null;
            try {
                $setStmt = $pdo->prepare("SELECT fbr_reg_ref, branch_mapping FROM digital_invoice_settings WHERE company_id = ?");
                $setStmt->execute([$company_id]);
                $setRow = $setStmt->fetch();
            } catch (Exception $se) {}

            $savedMapping = [];
            if ($setRow && !empty($setRow['branch_mapping'])) {
                $decoded = json_decode($setRow['branch_mapping'], true);
                if (is_array($decoded)) {
                    foreach ($decoded as $m) {
                        if (isset($m['branch_id'])) {
                            $savedMapping[$m['branch_id']] = $m;
                        }
                    }
                }
            }

            // Merge branch data with mapped FBR POS/Terminal references
            $mappedBranches = [];
            foreach ($branches as $b) {
                $bId = $b['id'];
                $map = $savedMapping[$bId] ?? [];
                $mappedBranches[] = [
                    'branch_id' => $bId,
                    'branch_code' => $b['branch_code'],
                    'branch_name' => $b['branch_name'],
                    'address' => $b['address'],
                    'fbr_pos_id' => $map['fbr_pos_id'] ?? ($b['branch_code'] ? 'POS-' . $b['branch_code'] : ''),
                    'fbr_branch_code' => $map['fbr_branch_code'] ?? $b['branch_code'],
                    'status' => $map['status'] ?? 'Active'
                ];
            }

            echo json_encode([
                'success' => true,
                'taxpayer' => [
                    'company_id' => $comp['id'] ?? $company_id,
                    'name' => $comp['name'] ?? '',
                    'ntn' => $comp['ntn'] ?? '',
                    'strn' => $strn,
                    'address' => $comp['address'] ?? '',
                    'phone' => $comp['phone'] ?? '',
                    'email' => $comp['email'] ?? '',
                    'fbr_reg_ref' => $setRow['fbr_reg_ref'] ?? ''
                ],
                'branches' => $mappedBranches
            ]);
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'error' => 'Database error while fetching taxpayer profile: ' . $e->getMessage()
            ]);
        }
        break;
    }

    case 'save_settings': {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);

        if (!$data) {
            echo json_encode(['error' => 'Invalid data payload provided']);
            exit;
        }

        $cId = intval($data['company_id'] ?? $company_id);
        $provider = trim($data['provider'] ?? 'PRAL');
        $providerName = trim($data['provider_name'] ?? 'Pakistan Revenue Automation Limited (PRAL)');
        $environment = (strtolower(trim($data['environment'] ?? 'sandbox')) === 'production') ? 'production' : 'sandbox';
        
        $apiBaseUrl = trim($data['api_base_url'] ?? '');
        $apiValidateUrl = trim($data['api_validate_url'] ?? '');
        $apiPostUrl = trim($data['api_post_url'] ?? '');

        // Auto-prepend https:// if protocol missing on non-empty URL
        if (!empty($apiValidateUrl) && !preg_match('#^https?://#i', $apiValidateUrl)) {
            $apiValidateUrl = 'https://' . $apiValidateUrl;
        }
        if (!empty($apiPostUrl) && !preg_match('#^https?://#i', $apiPostUrl)) {
            $apiPostUrl = 'https://' . $apiPostUrl;
        }
        if (!empty($apiBaseUrl) && !preg_match('#^https?://#i', $apiBaseUrl)) {
            $apiBaseUrl = 'https://' . $apiBaseUrl;
        }

        // Server-Side URL Validation - Protect against SSRF (only if provided)
        $urlErr = '';
        if (!empty($apiValidateUrl) && !fbr_validate_url($apiValidateUrl, $urlErr)) {
            echo json_encode(['error' => 'Validation Endpoint rejected: ' . $urlErr]);
            exit;
        }
        if (!empty($apiPostUrl) && !fbr_validate_url($apiPostUrl, $urlErr)) {
            echo json_encode(['error' => 'Invoice Posting Endpoint rejected: ' . $urlErr]);
            exit;
        }
        if (!empty($apiBaseUrl) && !fbr_validate_url($apiBaseUrl, $urlErr)) {
            echo json_encode(['error' => 'API Base URL rejected: ' . $urlErr]);
            exit;
        }

        // Save null/empty if user cleared or did not specify endpoints
        $valToSave = !empty($apiValidateUrl) ? $apiValidateUrl : null;
        $postToSave = !empty($apiPostUrl) ? $apiPostUrl : null;
        $baseToSave = !empty($apiBaseUrl) ? $apiBaseUrl : null;

        $clientId = trim($data['client_id'] ?? '');
        $fbrRegRef = trim($data['fbr_reg_ref'] ?? '');
        $branchMapping = is_array($data['branch_mapping'] ?? null) ? json_encode($data['branch_mapping']) : ($data['branch_mapping'] ?? '[]');

        $timeout = max(5, min(120, intval($data['request_timeout'] ?? 30)));
        $retries = max(1, min(5, intval($data['retry_attempts'] ?? 3)));
        $autoRetry = !empty($data['auto_retry']) ? 1 : 0;
        $enableLogging = !empty($data['enable_logging']) ? 1 : 0;
        $duplicateProtection = !empty($data['duplicate_protection']) ? 1 : 0;
        $logLevel = in_array($data['log_level'] ?? '', ['all', 'errors_only', 'headers_only']) ? $data['log_level'] : 'all';

        // Fetch existing record to safely preserve unmodified masked credentials
        $existStmt = $pdo->prepare("SELECT api_token, api_token_sandbox, api_token_production, client_secret FROM digital_invoice_settings WHERE company_id = ?");
        $existStmt->execute([$cId]);
        $existing = $existStmt->fetch();

        // Dynamic encrypted token management
        $savedSb = $existing['api_token_sandbox'] ?? null;
        $savedProd = $existing['api_token_production'] ?? null;
        $savedFallback = $existing['api_token'] ?? null;

        // Process Sandbox Token
        $inputSb = trim($data['api_token_sandbox'] ?? '');
        if ($inputSb !== '' && !fbr_is_masked($inputSb)) {
            $savedSb = fbr_encrypt_token($inputSb);
        } elseif ($environment === 'sandbox') {
            $inputGeneral = trim($data['api_token'] ?? '');
            if ($inputGeneral !== '' && !fbr_is_masked($inputGeneral)) {
                $savedSb = fbr_encrypt_token($inputGeneral);
            }
        }

        // Process Production Token
        $inputProd = trim($data['api_token_production'] ?? '');
        if ($inputProd !== '' && !fbr_is_masked($inputProd)) {
            $savedProd = fbr_encrypt_token($inputProd);
        } elseif ($environment === 'production') {
            $inputGeneral = trim($data['api_token'] ?? '');
            if ($inputGeneral !== '' && !fbr_is_masked($inputGeneral)) {
                $savedProd = fbr_encrypt_token($inputGeneral);
            }
        }

        // Active token fallback
        $activeToken = ($environment === 'production') ? ($savedProd ?: $savedFallback) : ($savedSb ?: $savedFallback);

        // Process Client Secret
        $secretToSave = $existing['client_secret'] ?? null;
        $inputSecret = trim($data['client_secret'] ?? '');
        if ($inputSecret !== '' && !fbr_is_masked($inputSecret)) {
            $secretToSave = $inputSecret;
        }

        try {
            $upsertSql = "INSERT INTO digital_invoice_settings 
                (company_id, provider, provider_name, environment, api_base_url, api_validate_url, api_post_url, api_token, api_token_sandbox, api_token_production, client_id, client_secret, fbr_reg_ref, branch_mapping, request_timeout, retry_attempts, auto_retry, enable_logging, duplicate_protection, log_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    provider = VALUES(provider),
                    provider_name = VALUES(provider_name),
                    environment = VALUES(environment),
                    api_base_url = VALUES(api_base_url),
                    api_validate_url = VALUES(api_validate_url),
                    api_post_url = VALUES(api_post_url),
                    api_token = VALUES(api_token),
                    api_token_sandbox = VALUES(api_token_sandbox),
                    api_token_production = VALUES(api_token_production),
                    client_id = VALUES(client_id),
                    client_secret = VALUES(client_secret),
                    fbr_reg_ref = VALUES(fbr_reg_ref),
                    branch_mapping = VALUES(branch_mapping),
                    request_timeout = VALUES(request_timeout),
                    retry_attempts = VALUES(retry_attempts),
                    auto_retry = VALUES(auto_retry),
                    enable_logging = VALUES(enable_logging),
                    duplicate_protection = VALUES(duplicate_protection),
                    log_level = VALUES(log_level)";
            
            $stmt = $pdo->prepare($upsertSql);
            $stmt->execute([
                $cId,
                $provider,
                $providerName,
                $environment,
                $baseToSave,
                $valToSave,
                $postToSave,
                $activeToken,
                $savedSb,
                $savedProd,
                $clientId,
                $secretToSave,
                $fbrRegRef,
                $branchMapping,
                $timeout,
                $retries,
                $autoRetry,
                $enableLogging,
                $duplicateProtection,
                $logLevel
            ]);

            // Reset connection test status upon saving new settings:
            $isValValid = !empty($valToSave) ? fbr_validate_url($valToSave) : true;
            if (!empty($valToSave) && !$isValValid) {
                $newStatus = 'Endpoint Invalid';
                $cfgStat = 'Configured';
                $srvConn = 'Unreachable';
                $authStat = 'Failed';
            } else {
                $isConfigured = (!empty($activeToken) || !empty($savedSb) || !empty($savedProd));
                $newStatus = $isConfigured ? 'Configured / Not Tested' : 'Not Configured';
                $cfgStat = $isConfigured ? 'Configured' : 'Not Configured';
                $srvConn = 'Not Tested';
                $authStat = 'Not Tested';
            }
            try {
                $pdo->prepare("UPDATE digital_invoice_settings SET 
                    connection_status = ?,
                    config_status = ?,
                    server_connectivity = ?,
                    auth_status = ?
                    WHERE company_id = ?")->execute([$newStatus, $cfgStat, $srvConn, $authStat, $cId]);
            } catch(Exception $e) {}

            // Update taxpayer profile in companies table if edited with non-empty values
            $hasTaxpayerUpdates = !empty($data['taxpayer_ntn']) || !empty($data['taxpayer_strn']) || !empty($data['taxpayer_address']) || !empty($data['taxpayer_phone']) || !empty($data['taxpayer_email']);
            if ($hasTaxpayerUpdates) {
                $compUp = [];
                $compParams = [];
                if (!empty($data['taxpayer_ntn'])) {
                    $rawTaxNtn = strtoupper(trim((string)$data['taxpayer_ntn']));
                    $cleanNtnAlnum = preg_replace('/[^0-9A-Za-z]/', '', $rawTaxNtn);
                    // Ensure clean 7-character NTN (e.g. A522103 or 5221034) or 13-digit CNIC
                    $finalNtn = (strlen($cleanNtnAlnum) === 7 || strlen($cleanNtnAlnum) === 13) 
                        ? $cleanNtnAlnum 
                        : (strlen($cleanNtnAlnum) === 8 ? substr($cleanNtnAlnum, 0, 7) : (strlen($cleanNtnAlnum) === 6 && ctype_digit($cleanNtnAlnum) ? '0' . $cleanNtnAlnum : $rawTaxNtn));
                    $compUp[] = "ntn = ?";
                    $compParams[] = $finalNtn;
                }
                if (!empty($data['taxpayer_strn'])) {
                    // Check whether companies table has gst_reg_no or gst
                    $gstCol = 'gst';
                    try {
                        $colChk = $pdo->query("SHOW COLUMNS FROM companies LIKE 'gst_reg_no'")->fetch();
                        if ($colChk) $gstCol = 'gst_reg_no';
                    } catch (Exception $e) {}
                    $compUp[] = "{$gstCol} = ?";
                    $compParams[] = trim($data['taxpayer_strn']);
                }
                if (!empty($data['taxpayer_address'])) {
                    $compUp[] = "address = ?";
                    $compParams[] = trim($data['taxpayer_address']);
                }
                if (!empty($data['taxpayer_phone'])) {
                    $compUp[] = "phone = ?";
                    $compParams[] = trim($data['taxpayer_phone']);
                }
                if (!empty($data['taxpayer_email'])) {
                    $compUp[] = "email = ?";
                    $compParams[] = trim($data['taxpayer_email']);
                }
                if (!empty($compUp)) {
                    $compParams[] = $cId;
                    try {
                        $upStmt = $pdo->prepare("UPDATE companies SET " . implode(', ', $compUp) . " WHERE id = ?");
                        $upStmt->execute($compParams);
                        // If no row updated, try fallback to primary company id if different
                        if ($upStmt->rowCount() === 0) {
                            $firstComp = $pdo->query("SELECT id FROM companies ORDER BY id ASC LIMIT 1")->fetch();
                            if ($firstComp && $firstComp['id'] != $cId) {
                                array_pop($compParams);
                                $compParams[] = $firstComp['id'];
                                $pdo->prepare("UPDATE companies SET " . implode(', ', $compUp) . " WHERE id = ?")->execute($compParams);
                            }
                        }
                    } catch (Exception $ce) {
                        error_log("Failed to update company taxpayer profile: " . $ce->getMessage());
                    }
                }
            }

            // Record configuration change in Integration Log without revealing raw credentials
            logIntegrationEvent(
                $pdo,
                $cId,
                'CONFIG_CHANGED',
                $environment,
                $provider,
                $apiValidateUrl,
                'CONFIG',
                ['User-Agent' => 'SoftifyX-ERP-Admin'],
                [
                    'environment' => $environment,
                    'provider' => $provider,
                    'validate_endpoint' => $apiValidateUrl,
                    'post_endpoint' => $apiPostUrl,
                    'token_status' => !empty($activeToken) ? 'Token Configured (Encrypted at rest)' : 'No Token',
                    'fbr_reg_ref' => $fbrRegRef,
                    'timeout' => $timeout
                ],
                200,
                0,
                'Configuration saved successfully',
                'SUCCESS',
                null
            );

            echo json_encode(['success' => true, 'message' => 'Digital Invoice integration settings saved successfully. Dynamic credentials are encrypted securely.']);
        } catch (Exception $e) {
            echo json_encode(['error' => 'Database error while saving settings: ' . $e->getMessage()]);
        }
        break;
    }

    case 'test_connection': {
        $stmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $cfg = $stmt->fetch();

        $postData = json_decode(file_get_contents('php://input'), true) ?? [];
        $provider = $postData['provider'] ?? ($cfg['provider'] ?? 'PRAL');
        $environment = strtolower($postData['environment'] ?? ($cfg['environment'] ?? 'sandbox'));
        
        $apiValidateUrl = trim($postData['api_validate_url'] ?? ($cfg['api_validate_url'] ?? ''));
        $baseUrl = trim($postData['api_base_url'] ?? ($cfg['api_base_url'] ?? ''));

        // Target test endpoint (validate endpoint preferred for real check)
        $testEndpoint = !empty($apiValidateUrl) ? $apiValidateUrl : fbr_get_official_endpoint('validate', $environment, $baseUrl);

        // Server-Side URL Validation
        $urlErr = '';
        if (!fbr_validate_url($testEndpoint, $urlErr)) {
            $now = date('Y-m-d H:i:s');
            try {
                $pdo->prepare("UPDATE digital_invoice_settings SET 
                    connection_status = 'Endpoint Invalid',
                    config_status = 'Configured',
                    server_connectivity = 'Unreachable',
                    auth_status = 'Failed',
                    last_connection_test = ?,
                    last_test_result = 'Endpoint Invalid',
                    last_response_code = 'URL_ERR',
                    last_error_message = ?
                    WHERE company_id = ?")->execute([$now, 'URL validation failed: ' . $urlErr, $company_id]);
            } catch (Exception $e) {}

            echo json_encode([
                'success' => false,
                'status' => 'Endpoint Invalid',
                'overall_status' => 'Endpoint Invalid',
                'config_status' => 'Configured',
                'server_connectivity' => 'Unreachable',
                'auth_status' => 'Failed',
                'validation_status' => 'Not Tested',
                'submission_status' => 'Not Submitted',
                'endpoint' => $testEndpoint,
                'message' => 'URL validation failed: ' . $urlErr,
                'timestamp' => $now
            ]);
            exit;
        }

        // Resolve token dynamically: prefer provided unsaved plaintext, otherwise read decrypted from DB
        $inputToken = trim($postData['api_token'] ?? '');
        $token = '';
        if ($inputToken !== '' && !fbr_is_masked($inputToken)) {
            $token = $inputToken;
        } else {
            $rawStored = ($environment === 'production')
                ? (!empty($cfg['api_token_production']) ? $cfg['api_token_production'] : ($cfg['api_token'] ?? ''))
                : (!empty($cfg['api_token_sandbox']) ? $cfg['api_token_sandbox'] : ($cfg['api_token'] ?? ''));
            $token = fbr_decrypt_token($rawStored);
        }

        if (empty($token)) {
            $now = date('Y-m-d H:i:s');
            try {
                $pdo->prepare("UPDATE digital_invoice_settings SET 
                    connection_status = 'Authentication Failed',
                    config_status = 'Not Configured',
                    server_connectivity = 'Not Tested',
                    auth_status = 'Failed',
                    last_connection_test = ?,
                    last_test_result = 'Authentication Failed',
                    last_response_code = 'NO_TOKEN',
                    last_error_message = 'API Token is missing.'
                    WHERE company_id = ?")->execute([$now, $company_id]);
            } catch (Exception $e) {}

            echo json_encode([
                'success' => false,
                'status' => 'Authentication Failed',
                'overall_status' => 'Authentication Failed',
                'config_status' => 'Not Configured',
                'server_connectivity' => 'Not Tested',
                'auth_status' => 'Failed',
                'validation_status' => 'Not Tested',
                'submission_status' => 'Not Submitted',
                'endpoint' => $testEndpoint,
                'message' => 'API Token is missing. Please enter your valid FBR/PRAL Bearer token.',
                'timestamp' => $now
            ]);
            exit;
        }

        $diag = fbr_diagnose_integration($testEndpoint, $token, $environment, [
            'company_id' => $company_id,
            'pdo' => $pdo
        ]);

        $status = $diag['overall_status'];
        $isSuccess = $diag['success'];
        $sanitizedMessage = $diag['message'];
        $httpCode = $diag['http_code'];
        $totalTime = $diag['latency_ms'];
        $now = date('Y-m-d H:i:s');

        try {
            $upStmt = $pdo->prepare("UPDATE digital_invoice_settings SET 
                connection_status = ?,
                config_status = ?,
                server_connectivity = ?,
                auth_status = ?,
                invoice_validation_status = ?,
                invoice_submission_status = ?,
                last_connection_test = ?,
                last_test_result = ?,
                last_test_time = ?,
                last_response_code = ?,
                last_error_message = ?
                WHERE company_id = ?");
            $upStmt->execute([
                $status,
                $diag['config_status'],
                $diag['server_connectivity'],
                $diag['auth_status'],
                $diag['validation_status'],
                $diag['submission_status'],
                $now,
                $status,
                $now,
                strval($httpCode ?: 'ERR'),
                $isSuccess ? null : $sanitizedMessage,
                $company_id
            ]);
        } catch (Exception $e) {}

        logIntegrationEvent(
            $pdo,
            $company_id,
            'CONNECTION_TEST',
            $environment,
            $provider,
            $testEndpoint,
            'POST',
            ['Accept' => 'application/json', 'Authorization' => 'Bearer [REDACTED]'],
            null,
            $httpCode,
            $totalTime,
            null,
            $isSuccess ? 'SUCCESS' : 'FAILED',
            $sanitizedMessage
        );

        echo json_encode([
            'success' => $isSuccess,
            'status' => $status,
            'overall_status' => $status,
            'config_status' => $diag['config_status'],
            'server_connectivity' => $diag['server_connectivity'],
            'auth_status' => $diag['auth_status'],
            'validation_status' => $diag['validation_status'],
            'submission_status' => $diag['submission_status'],
            'http_code' => $httpCode,
            'latency_ms' => $totalTime,
            'endpoint' => $diag['endpoint'],
            'message' => $sanitizedMessage,
            'timestamp' => $now
        ]);
        break;
    }

    case 'validate_sample_invoice': {
        $stmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $cfg = $stmt->fetch();

        $postData = json_decode(file_get_contents('php://input'), true) ?? [];
        $environment = strtolower($postData['environment'] ?? ($cfg['environment'] ?? 'sandbox'));

        // Enforce safety rule: Production sample testing is strictly blocked
        if ($environment === 'production') {
            echo json_encode([
                'success' => false,
                'status' => 'Blocked',
                'message' => 'Safety Warning: Sample invoice validation is strictly restricted to Sandbox environment. Production testing is blocked to prevent accidental submission of test records to FBR live databases.'
            ]);
            exit;
        }

        $valEndpoint = !empty($postData['api_validate_url']) ? trim($postData['api_validate_url']) : fbr_get_official_endpoint('validate', 'sandbox', $cfg['api_validate_url'] ?? $cfg['api_base_url'] ?? '');

        // Server-Side URL Validation
        $urlErr = '';
        if (!fbr_validate_url($valEndpoint, $urlErr)) {
            echo json_encode([
                'success' => false,
                'status' => 'Security Error',
                'message' => 'Validation Endpoint rejected: ' . $urlErr
            ]);
            exit;
        }

        // Resolve token
        $inputToken = trim($postData['api_token'] ?? '');
        $token = '';
        if ($inputToken !== '' && !fbr_is_masked($inputToken)) {
            $token = $inputToken;
        } else {
            $rawStored = !empty($cfg['api_token_sandbox']) ? $cfg['api_token_sandbox'] : ($cfg['api_token'] ?? '');
            $token = fbr_decrypt_token($rawStored);
        }

        if (empty($token)) {
            echo json_encode([
                'success' => false,
                'status' => 'Failed',
                'message' => 'Sandbox API Token is missing. Please configure your Sandbox Bearer token.'
            ]);
            exit;
        }

        $posId = 100001;
        if (!empty($cfg['fbr_reg_ref']) && is_numeric($cfg['fbr_reg_ref'])) {
            $posId = intval($cfg['fbr_reg_ref']);
        }

        // Construct standard FBR / PRAL digital invoice validation payload
        $sampleInvoiceNumber = 'SBX-TEST-' . date('Ymd') . '-' . substr(str_shuffle('0123456789'), 0, 4);
        $samplePayload = [
            'InvoiceNumber' => $sampleInvoiceNumber,
            'POSID' => $posId,
            'USIN' => 'ERP-SBX-' . date('YmdHis'),
            'DateTime' => date('Y-m-d H:i:s'),
            'BuyerNTN' => '9999999',
            'BuyerCNIC' => '99999-9999999-9',
            'BuyerName' => 'Sandbox Validation Buyer',
            'BuyerPhoneNumber' => '03001234567',
            'TotalSaleValue' => 1000.00,
            'TotalTaxCharged' => 180.00,
            'TotalQuantity' => 1.0,
            'TotalBillAmount' => 1180.00,
            'PaymentMode' => 1,
            'InvoiceType' => 1,
            'Items' => [
                [
                    'ItemCode' => 'VAL-ITEM-001',
                    'ItemName' => 'Sandbox Validation Test Article',
                    'Quantity' => 1.0,
                    'SaleValue' => 1000.00,
                    'TaxRate' => 18.0,
                    'TaxCharged' => 180.00,
                    'TotalAmount' => 1180.00,
                    'InvoiceType' => 1
                ]
            ]
        ];

        $res = fbr_api_request($valEndpoint, 'POST', $samplePayload, $token, 30);
        $parsed = fbr_parse_api_response($res);

        $valStatus = $parsed['is_success'] ? 'Validated' : 'Failed';
        $isSuccess = $parsed['is_success'];
        $sanitizedMsg = $parsed['message'];

        $now = date('Y-m-d H:i:s');
        try {
            $upStmt = $pdo->prepare("UPDATE digital_invoice_settings SET 
                sample_validation_status = ?,
                last_validation_test = ?,
                last_result_details = ?
                WHERE company_id = ?");
            $upStmt->execute([
                $valStatus,
                $now,
                $res['body'] ?: $sanitizedMsg,
                $company_id
            ]);
        } catch (Exception $e) {}

        logIntegrationEvent(
            $pdo,
            $company_id,
            'SAMPLE_VALIDATION',
            'sandbox',
            $cfg['provider'] ?? 'PRAL',
            $valEndpoint,
            'POST',
            ['Content-Type' => 'application/json', 'Authorization' => 'Bearer [REDACTED]'],
            $samplePayload,
            $res['http_code'],
            $res['duration_ms'],
            $res['body'],
            $isSuccess ? 'SUCCESS' : 'FAILED',
            $sanitizedMsg
        );

        echo json_encode([
            'success' => $isSuccess,
            'status' => $valStatus,
            'http_code' => $res['http_code'],
            'latency_ms' => $res['duration_ms'],
            'message' => $sanitizedMsg,
            'timestamp' => $now,
            'sample_payload' => $samplePayload,
            'response_raw' => $res['body']
        ]);
        break;
    }

    case 'get_logs': {
        $limit = max(10, min(200, intval($_GET['limit'] ?? 50)));
        $statusFilter = trim($_GET['status_filter'] ?? 'all');
        $eventFilter = trim($_GET['event_filter'] ?? 'all');

        $sql = "SELECT id, event_type, environment, provider, endpoint, request_method, response_code, response_time_ms, status, sanitized_error, request_payload, response_body, created_at 
                FROM digital_invoice_logs 
                WHERE company_id = ?";
        $params = [$company_id];

        if ($statusFilter !== 'all' && in_array(strtoupper($statusFilter), ['SUCCESS', 'FAILED'])) {
            $sql .= " AND status = ?";
            $params[] = strtoupper($statusFilter);
        }

        if ($eventFilter !== 'all' && !empty($eventFilter)) {
            $sql .= " AND event_type = ?";
            $params[] = $eventFilter;
        }

        $sql .= " ORDER BY id DESC LIMIT " . $limit;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll();

        echo json_encode(['success' => true, 'logs' => $logs]);
        break;
    }

    case 'clear_logs': {
        $stmt = $pdo->prepare("DELETE FROM digital_invoice_logs WHERE company_id = ?");
        $stmt->execute([$company_id]);
        echo json_encode(['success' => true, 'message' => 'Integration logs cleared successfully.']);
        break;
    }

    default: {
        echo json_encode(['error' => 'Invalid action parameter']);
        break;
    }
}
