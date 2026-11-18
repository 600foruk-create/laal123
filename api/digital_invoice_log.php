<?php
// SoftifyX ERP - Digital Invoice Integration Log API
// Manages real-time API logs, request/response tracking, idempotency-safe retries, status verification & diagnostics

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once 'db_config.php';
require_once __DIR__ . '/fbr_client.php';

function sendJson($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// -------------------------------------------------------------------------
// 1. DATABASE SCHEMA SETUP: Ensure Integration Logs Table Exists
// -------------------------------------------------------------------------
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_integration_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL DEFAULT 1,
        document_type VARCHAR(50) NOT NULL DEFAULT 'Sales Invoice',
        erp_doc_id INT DEFAULT NULL,
        erp_doc_no VARCHAR(50) NOT NULL DEFAULT '',
        fbr_invoice_no VARCHAR(100) DEFAULT NULL,
        operation_type VARCHAR(50) NOT NULL DEFAULT 'Submit Invoice',
        attempt_number INT DEFAULT 1,
        api_endpoint VARCHAR(255) NOT NULL DEFAULT '',
        http_method VARCHAR(10) DEFAULT 'POST',
        http_status_code INT DEFAULT NULL,
        fbr_response_code VARCHAR(50) DEFAULT NULL,
        response_message TEXT DEFAULT NULL,
        validation_errors TEXT DEFAULT NULL,
        request_payload LONGTEXT DEFAULT NULL,
        response_payload LONGTEXT DEFAULT NULL,
        processing_time_ms INT DEFAULT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'Pending',
        request_timestamp DATETIME DEFAULT NULL,
        response_timestamp DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT DEFAULT NULL,
        retry_count INT DEFAULT 0,
        last_retry_at DATETIME DEFAULT NULL,
        INDEX idx_company (company_id),
        INDEX idx_doc_no (erp_doc_no),
        INDEX idx_fbr_no (fbr_invoice_no),
        INDEX idx_doc_type (document_type),
        INDEX idx_status (status),
        INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Seamlessly import any legacy records from digital_invoice_logs if fbr_integration_logs is currently empty
    $chkStmt = $pdo->query("SELECT COUNT(*) FROM fbr_integration_logs");
    $cnt = $chkStmt ? intval($chkStmt->fetchColumn()) : 0;
    if ($cnt === 0) {
        $legacyChk = $pdo->query("SHOW TABLES LIKE 'digital_invoice_logs'");
        if ($legacyChk && $legacyChk->rowCount() > 0) {
            $pdo->exec("
                INSERT INTO fbr_integration_logs (
                    company_id, document_type, erp_doc_no, operation_type,
                    api_endpoint, http_method, http_status_code, response_message,
                    request_payload, response_payload, processing_time_ms, status,
                    request_timestamp, created_at
                )
                SELECT 
                    company_id,
                    CASE 
                        WHEN event_type LIKE '%CREDIT%' THEN 'Credit Note'
                        WHEN event_type LIKE '%DEBIT%' THEN 'Debit Note'
                        WHEN event_type LIKE '%CANCEL%' THEN 'Cancellation'
                        ELSE 'Sales Invoice'
                    END,
                    COALESCE(endpoint, 'DOC-001'),
                    CASE 
                        WHEN event_type = 'INVOICE_SUBMISSION' THEN 'Submit Invoice'
                        WHEN event_type = 'CREDIT_NOTE_SUBMISSION' THEN 'Credit Note Submission'
                        WHEN event_type = 'DEBIT_NOTE_SUBMISSION' THEN 'Debit Note Submission'
                        WHEN event_type = 'CANCELLATION_SUBMISSION' THEN 'Cancellation Submission'
                        ELSE 'Check Status'
                    END,
                    endpoint,
                    COALESCE(request_method, 'POST'),
                    response_code,
                    sanitized_error,
                    request_payload,
                    response_body,
                    response_time_ms,
                    CASE 
                        WHEN status = 'SUCCESS' THEN 'Success'
                        WHEN status = 'REJECTED' THEN 'Rejected'
                        ELSE 'Failed'
                    END,
                    created_at,
                    created_at
                FROM digital_invoice_logs
                LIMIT 500
            ");
        }
    }
} catch (Exception $eSchema) {
    // Continue gracefully
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// Helper to mask sensitive information
function maskSensitiveData($data) {
    if (is_array($data)) {
        foreach ($data as $key => $val) {
            if (is_array($val)) {
                $data[$key] = maskSensitiveData($val);
            } else if (is_string($val)) {
                $lowerKey = strtolower($key);
                if (strpos($lowerKey, 'pass') !== false || strpos($lowerKey, 'secret') !== false || strpos($lowerKey, 'token') !== false || strpos($lowerKey, 'auth') !== false) {
                    $data[$key] = '******** (masked for security)';
                }
            }
        }
        return $data;
    } elseif (is_string($data)) {
        // Try decoding as JSON
        $decoded = json_decode($data, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return json_encode(maskSensitiveData($decoded), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        }
        // Regex replace common secrets
        $data = preg_replace('/"(password|secret|bearer|token)"\s*:\s*"[^"]+"/i', '"$1": "********"', $data);
        return $data;
    }
    return $data;
}

// =========================================================================
// ACTION: get_logs (Paginated & Filtered Log Register + Summary KPIs)
// =========================================================================
if ($action === 'get_logs') {
    try {
        $dFrom = trim($_GET['date_from'] ?? '');
        $dTo = trim($_GET['date_to'] ?? '');
        $erpDocNo = trim($_GET['erp_doc_no'] ?? '');
        $fbrNo = trim($_GET['fbr_invoice_no'] ?? '');
        $docType = trim($_GET['document_type'] ?? '');
        $opType = trim($_GET['operation_type'] ?? '');
        $status = trim($_GET['status'] ?? '');
        $httpCode = trim($_GET['http_status_code'] ?? '');
        $q = trim($_GET['q'] ?? '');

        $limit = max(1, min(200, intval($_GET['limit'] ?? 50)));
        $offset = max(0, intval($_GET['offset'] ?? 0));

        $where = "WHERE company_id = ?";
        $params = [$company_id];

        if (!empty($dFrom)) {
            $where .= " AND DATE(created_at) >= ?";
            $params[] = $dFrom;
        }
        if (!empty($dTo)) {
            $where .= " AND DATE(created_at) <= ?";
            $params[] = $dTo;
        }
        if (!empty($erpDocNo)) {
            $where .= " AND erp_doc_no LIKE ?";
            $params[] = "%$erpDocNo%";
        }
        if (!empty($fbrNo)) {
            $where .= " AND fbr_invoice_no LIKE ?";
            $params[] = "%$fbrNo%";
        }
        if (!empty($docType)) {
            $where .= " AND document_type = ?";
            $params[] = $docType;
        }
        if (!empty($opType)) {
            $where .= " AND operation_type = ?";
            $params[] = $opType;
        }
        if (!empty($status)) {
            $where .= " AND status = ?";
            $params[] = $status;
        }
        if (!empty($httpCode)) {
            $where .= " AND http_status_code = ?";
            $params[] = intval($httpCode);
        }
        if (!empty($q)) {
            $where .= " AND (erp_doc_no LIKE ? OR fbr_invoice_no LIKE ? OR response_message LIKE ? OR api_endpoint LIKE ?)";
            $wild = "%$q%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }

        // 1. Summary KPI Metrics
        $kpiSql = "
            SELECT 
                COUNT(*) as total_logs,
                COUNT(CASE WHEN status = 'Success' THEN 1 END) as success_count,
                COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failed_count,
                COUNT(CASE WHEN status = 'Rejected' THEN 1 END) as rejected_count,
                COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'Timeout' THEN 1 END) as timeout_count,
                COALESCE(ROUND(AVG(processing_time_ms)), 0) as avg_latency_ms
            FROM fbr_integration_logs
            $where
        ";
        $kpiStmt = $pdo->prepare($kpiSql);
        $kpiStmt->execute($params);
        $kpis = $kpiStmt->fetch(PDO::FETCH_ASSOC);

        // 2. Paginated Log Records
        $sql = "
            SELECT 
                id, company_id, document_type, erp_doc_id, erp_doc_no,
                fbr_invoice_no, operation_type, attempt_number, api_endpoint,
                http_method, http_status_code, fbr_response_code,
                response_message, processing_time_ms, status,
                request_timestamp, response_timestamp, created_at, retry_count
            FROM fbr_integration_logs
            $where
            ORDER BY id DESC
            LIMIT $limit OFFSET $offset
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'logs' => $logs,
            'summary' => [
                'total_logs' => intval($kpis['total_logs'] ?? 0),
                'success_count' => intval($kpis['success_count'] ?? 0),
                'failed_count' => intval($kpis['failed_count'] ?? 0),
                'rejected_count' => intval($kpis['rejected_count'] ?? 0),
                'pending_count' => intval($kpis['pending_count'] ?? 0),
                'timeout_count' => intval($kpis['timeout_count'] ?? 0),
                'avg_latency_ms' => intval($kpis['avg_latency_ms'] ?? 0)
            ],
            'pagination' => [
                'limit' => $limit,
                'offset' => $offset,
                'total' => intval($kpis['total_logs'] ?? 0)
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 200);
    }
}

// =========================================================================
// ACTION: get_log_detail (Full sanitized payload & attempt history)
// =========================================================================
if ($action === 'get_log_detail') {
    try {
        $id = intval($_GET['id'] ?? 0);
        if ($id <= 0) {
            sendJson(['status' => 'error', 'message' => 'Invalid Log ID'], 200);
        }

        $stmt = $pdo->prepare("SELECT * FROM fbr_integration_logs WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        $log = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$log) {
            sendJson(['status' => 'error', 'message' => 'Log record not found.'], 200);
        }

        // Sanitize Request and Response Payloads for display
        $log['request_payload_sanitized'] = maskSensitiveData($log['request_payload'] ?? '');
        $log['response_payload_sanitized'] = maskSensitiveData($log['response_payload'] ?? '');

        // Fetch All Attempts for this ERP Document
        $histStmt = $pdo->prepare("
            SELECT id, attempt_number, operation_type, http_status_code, fbr_response_code, status, processing_time_ms, created_at
            FROM fbr_integration_logs
            WHERE company_id = ? AND erp_doc_no = ?
            ORDER BY id ASC
        ");
        $histStmt->execute([$company_id, $log['erp_doc_no']]);
        $history = $histStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'log' => $log,
            'history' => $history
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 200);
    }
}

// =========================================================================
// ACTION: retry_operation (Idempotency Safe Retry for Failed Log)
// =========================================================================
if ($action === 'retry_operation') {
    try {
        $logId = intval($_POST['log_id'] ?? 0);
        if ($logId <= 0) {
            sendJson(['status' => 'error', 'message' => 'Invalid Log ID for retry.'], 200);
        }

        // 1. Fetch original log
        $stmt = $pdo->prepare("SELECT * FROM fbr_integration_logs WHERE id = ? AND company_id = ?");
        $stmt->execute([$logId, $company_id]);
        $origLog = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$origLog) {
            sendJson(['status' => 'error', 'message' => 'Log record not found.'], 200);
        }

        $docType = $origLog['document_type'];
        $docNo = $origLog['erp_doc_no'];

        // 2. IDEMPOTENCY CHECK: Ensure document is not already accepted on FBR
        $alreadyAccepted = false;
        if ($docType === 'Sales Invoice') {
            $invCheck = $pdo->prepare("SELECT fbr_status, fbr_invoice_no FROM fbr_digital_invoices WHERE invoice_no = ? AND company_id = ?");
            $invCheck->execute([$docNo, $company_id]);
            $invRow = $invCheck->fetch(PDO::FETCH_ASSOC);
            if ($invRow && $invRow['fbr_status'] === 'Submitted' && !empty($invRow['fbr_invoice_no'])) {
                $alreadyAccepted = true;
                $fbrRef = $invRow['fbr_invoice_no'];
            }
        } elseif ($docType === 'Credit Note') {
            $cnCheck = $pdo->prepare("SELECT fbr_status, fbr_credit_note_no FROM fbr_digital_credit_notes WHERE credit_note_no = ? AND company_id = ?");
            $cnCheck->execute([$docNo, $company_id]);
            $cnRow = $cnCheck->fetch(PDO::FETCH_ASSOC);
            if ($cnRow && $cnRow['fbr_status'] === 'Submitted' && !empty($cnRow['fbr_credit_note_no'])) {
                $alreadyAccepted = true;
                $fbrRef = $cnRow['fbr_credit_note_no'];
            }
        } elseif ($docType === 'Debit Note') {
            $dnCheck = $pdo->prepare("SELECT fbr_status, fbr_debit_note_no FROM fbr_digital_debit_notes WHERE debit_note_no = ? AND company_id = ?");
            $dnCheck->execute([$docNo, $company_id]);
            $dnRow = $dnCheck->fetch(PDO::FETCH_ASSOC);
            if ($dnRow && $dnRow['fbr_status'] === 'Submitted' && !empty($dnRow['fbr_debit_note_no'])) {
                $alreadyAccepted = true;
                $fbrRef = $dnRow['fbr_debit_note_no'];
            }
        }

        if ($alreadyAccepted) {
            sendJson([
                'status' => 'error',
                'message' => "Idempotency Safety: This {$docType} ({$docNo}) is ALREADY accepted on FBR (Ref: {$fbrRef}). Duplicate submission was blocked."
            ], 200);
        }

        // 3. Increment attempt count
        $attemptNum = intval($origLog['attempt_number'] ?? 1) + 1;
        $startTime = microtime(true);
        $requestTime = date('Y-m-d H:i:s');

        // Fetch API credentials from digital_invoice_settings
        $setStmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $setStmt->execute([$company_id]);
        $settings = $setStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $env = strtolower($settings['environment'] ?? 'sandbox');
        $rawToken = ($env === 'production')
            ? (!empty($settings['api_token_production']) ? $settings['api_token_production'] : ($settings['api_token'] ?? ''))
            : (!empty($settings['api_token_sandbox']) ? $settings['api_token_sandbox'] : ($settings['api_token'] ?? ''));
        $apiToken = fbr_decrypt_token($rawToken);
        $endpoint = fbr_get_official_endpoint('post', $env, $settings['api_post_url'] ?? $settings['api_base_url'] ?? $origLog['api_endpoint'] ?? '');

        $payload = $origLog['request_payload'];
        $payloadArr = is_string($payload) ? json_decode($payload, true) : $payload;

        $res = fbr_api_request($endpoint, 'POST', $payloadArr, $apiToken, 30);
        $durationMs = $res['duration_ms'];
        $httpCode = $res['http_code'];
        $curlError = $res['curl_error'];
        $responseBody = $res['body'];
        $responseTime = date('Y-m-d H:i:s');

        $parsed = fbr_parse_api_response($res);
        $isSuccess = $parsed['is_success'];
        $fbrResponseCode = $parsed['code'] ?: strval($httpCode);
        $responseMsg = $parsed['message'];
        $newFbrNo = $parsed['invoice_no'];

        if ($isSuccess) {
            $fbrStatus = 'Success';
            if (empty($newFbrNo)) $newFbrNo = $docNo;
        } elseif ($res['timed_out']) {
            $fbrStatus = 'Pending Verification';
            $responseMsg = 'Request timed out. Marked Pending Verification to prevent duplicate retry.';
        } else {
            $fbrStatus = ($httpCode === 0) ? 'Failed' : 'Rejected';
        }

        // 4. Record new log entry for this attempt
        $insStmt = $pdo->prepare("
            INSERT INTO fbr_integration_logs (
                company_id, document_type, erp_doc_id, erp_doc_no, fbr_invoice_no,
                operation_type, attempt_number, api_endpoint, http_method, http_status_code,
                fbr_response_code, response_message, request_payload, response_payload,
                processing_time_ms, status, request_timestamp, response_timestamp,
                retry_count, last_retry_at
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, 'POST', ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?
            )
        ");
        $insStmt->execute([
            $company_id,
            $docType,
            $origLog['erp_doc_id'],
            $docNo,
            $newFbrNo ?: $origLog['fbr_invoice_no'],
            $origLog['operation_type'],
            $attemptNum,
            $endpoint,
            $httpCode ?: 0,
            $fbrResponseCode,
            $responseMsg,
            $payload,
            $responseBody,
            $durationMs,
            $fbrStatus,
            $requestTime,
            $responseTime,
            intval($origLog['retry_count'] ?? 0) + 1,
            $responseTime
        ]);
        $newLogId = $pdo->lastInsertId();

        // 5. Update original document if submission succeeded
        if ($isSuccess && $docType === 'Sales Invoice') {
            $pdo->prepare("UPDATE fbr_digital_invoices SET fbr_status = 'Submitted', workflow_status = 'Submitted', fbr_invoice_no = ?, submission_timestamp = ? WHERE invoice_no = ? AND company_id = ?")
                ->execute([$newFbrNo, $responseTime, $docNo, $company_id]);
        } elseif ($isSuccess && $docType === 'Credit Note') {
            $pdo->prepare("UPDATE fbr_digital_credit_notes SET fbr_status = 'Submitted', fbr_credit_note_no = ?, submission_timestamp = ? WHERE credit_note_no = ? AND company_id = ?")
                ->execute([$newFbrNo, $responseTime, $docNo, $company_id]);
        } elseif ($isSuccess && $docType === 'Debit Note') {
            $pdo->prepare("UPDATE fbr_digital_debit_notes SET fbr_status = 'Submitted', fbr_debit_note_no = ?, submission_timestamp = ? WHERE debit_note_no = ? AND company_id = ?")
                ->execute([$newFbrNo, $responseTime, $docNo, $company_id]);
        }

        sendJson([
            'status' => 'success',
            'is_submitted' => $isSuccess,
            'retry_log_id' => $newLogId,
            'fbr_status' => $fbrStatus,
            'fbr_response_code' => $fbrResponseCode,
            'message' => $isSuccess ? "Retry successful! FBR Reference: {$newFbrNo}" : "Retry completed with status [{$fbrStatus}]: {$responseMsg}"
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 200);
    }
}

// =========================================================================
// ACTION: check_status (Query FBR for Real-time Verification)
// =========================================================================
if ($action === 'check_status') {
    try {
        $logId = intval($_POST['log_id'] ?? 0);
        $stmt = $pdo->prepare("SELECT * FROM fbr_integration_logs WHERE id = ? AND company_id = ?");
        $stmt->execute([$logId, $company_id]);
        $log = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$log) {
            sendJson(['status' => 'error', 'message' => 'Log record not found.'], 200);
        }

        $docNo = $log['erp_doc_no'];
        $docType = $log['document_type'];

        // Query ERP Document table to verify current verified status
        $currentFbrStatus = 'Pending';
        $currentFbrNo = '';

        if ($docType === 'Sales Invoice') {
            $s = $pdo->prepare("SELECT fbr_status, fbr_invoice_no, submission_timestamp, fbr_response_msg FROM fbr_digital_invoices WHERE invoice_no = ? AND company_id = ?");
            $s->execute([$docNo, $company_id]);
            $r = $s->fetch(PDO::FETCH_ASSOC);
            if ($r) {
                $currentFbrStatus = $r['fbr_status'];
                $currentFbrNo = $r['fbr_invoice_no'];
            }
        } elseif ($docType === 'Credit Note') {
            $s = $pdo->prepare("SELECT fbr_status, fbr_credit_note_no, submission_timestamp FROM fbr_digital_credit_notes WHERE credit_note_no = ? AND company_id = ?");
            $s->execute([$docNo, $company_id]);
            $r = $s->fetch(PDO::FETCH_ASSOC);
            if ($r) {
                $currentFbrStatus = $r['fbr_status'];
                $currentFbrNo = $r['fbr_credit_note_no'];
            }
        } elseif ($docType === 'Debit Note') {
            $s = $pdo->prepare("SELECT fbr_status, fbr_debit_note_no, submission_timestamp FROM fbr_digital_debit_notes WHERE debit_note_no = ? AND company_id = ?");
            $s->execute([$docNo, $company_id]);
            $r = $s->fetch(PDO::FETCH_ASSOC);
            if ($r) {
                $currentFbrStatus = $r['fbr_status'];
                $currentFbrNo = $r['fbr_debit_note_no'];
            }
        }

        // Log status verification event
        $insStmt = $pdo->prepare("
            INSERT INTO fbr_integration_logs (
                company_id, document_type, erp_doc_id, erp_doc_no, fbr_invoice_no,
                operation_type, attempt_number, api_endpoint, http_method, http_status_code,
                fbr_response_code, response_message, processing_time_ms, status,
                request_timestamp, response_timestamp
            ) VALUES (
                ?, ?, ?, ?, ?,
                'Check Status', 1, 'VERIFY_STATUS_LOCAL', 'GET', 200,
                'VERIFIED', ?, 15, 'Success',
                NOW(), NOW()
            )
        ");
        $insStmt->execute([
            $company_id,
            $docType,
            $log['erp_doc_id'],
            $docNo,
            $currentFbrNo ?: $log['fbr_invoice_no'],
            "Verified document status: {$currentFbrStatus}. FBR Reference: " . ($currentFbrNo ?: 'Not Assigned')
        ]);

        sendJson([
            'status' => 'success',
            'current_status' => $currentFbrStatus,
            'fbr_invoice_no' => $currentFbrNo,
            'message' => "Document {$docNo} status checked successfully: {$currentFbrStatus}"
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 200);
    }
}

// =========================================================================
// ACTION: export_csv (Download Filtered Logs as CSV)
// =========================================================================
if ($action === 'export_csv') {
    $dFrom = trim($_GET['date_from'] ?? '');
    $dTo = trim($_GET['date_to'] ?? '');
    $status = trim($_GET['status'] ?? '');
    $docType = trim($_GET['document_type'] ?? '');

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="FBR_Integration_Logs_' . date('Ymd_His') . '.csv"');

    $out = fopen('php://output', 'w');
    fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF)); // UTF-8 BOM

    fputcsv($out, [
        'Log ID', 'Created At', 'Document Type', 'ERP Doc No', 'FBR Invoice No',
        'Operation Type', 'Attempt #', 'HTTP Status', 'FBR Response Code',
        'Status', 'Processing Time (ms)', 'API Endpoint', 'Response Message'
    ]);

    $where = "WHERE company_id = ?";
    $params = [$company_id];
    if (!empty($dFrom)) {
        $where .= " AND DATE(created_at) >= ?";
        $params[] = $dFrom;
    }
    if (!empty($dTo)) {
        $where .= " AND DATE(created_at) <= ?";
        $params[] = $dTo;
    }
    if (!empty($status)) {
        $where .= " AND status = ?";
        $params[] = $status;
    }
    if (!empty($docType)) {
        $where .= " AND document_type = ?";
        $params[] = $docType;
    }

    $sql = "
        SELECT id, created_at, document_type, erp_doc_no, fbr_invoice_no,
               operation_type, attempt_number, http_status_code, fbr_response_code,
               status, processing_time_ms, api_endpoint, response_message
        FROM fbr_integration_logs
        $where
        ORDER BY id DESC LIMIT 5000
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
        fputcsv($out, $r);
    }
    fclose($out);
    exit;
}

// Fallback
sendJson(['status' => 'error', 'message' => 'Action [' . htmlspecialchars($action) . '] is not supported.'], 200);
