<?php
// SoftifyX ERP - FBR Invoice Cancellation API
// Complete, secure implementation for FBR Invoice Cancellation workflow, validation, local/FBR execution & audit logging

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
// 1. DATABASE SCHEMA SETUP: Ensure Cancellation Tables & Columns Exist
// -------------------------------------------------------------------------
try {
    // Ensure cancellation fields exist in fbr_digital_invoices
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN is_cancelled TINYINT DEFAULT 0 AFTER remarks");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN cancellation_reason TEXT DEFAULT NULL AFTER is_cancelled");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN cancellation_date DATETIME DEFAULT NULL AFTER cancellation_reason");
    } catch (Exception $ignored) {}

    // Main Invoice Cancellations Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_invoice_cancellations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        request_no VARCHAR(50) NOT NULL,
        request_date DATE NOT NULL,
        invoice_id INT NOT NULL,
        invoice_source VARCHAR(30) DEFAULT 'fbr_digital_invoice',
        invoice_no VARCHAR(50) NOT NULL,
        invoice_date DATE NOT NULL,
        fbr_invoice_no VARCHAR(100) DEFAULT NULL,
        customer_coa_id INT NOT NULL,
        customer_code VARCHAR(50) DEFAULT NULL,
        customer_name VARCHAR(255) NOT NULL,
        business_name VARCHAR(255) DEFAULT NULL,
        customer_type VARCHAR(50) DEFAULT 'Registered (Filer)',
        customer_ntn VARCHAR(50) DEFAULT NULL,
        customer_cnic VARCHAR(50) DEFAULT NULL,
        customer_strn VARCHAR(50) DEFAULT NULL,
        customer_phone VARCHAR(50) DEFAULT NULL,
        customer_address TEXT DEFAULT NULL,
        customer_province VARCHAR(100) DEFAULT 'Punjab',
        invoice_type VARCHAR(50) DEFAULT 'Tax Invoice',
        invoice_total DECIMAL(15,2) DEFAULT 0,
        taxable_amount DECIMAL(15,2) DEFAULT 0,
        total_sales_tax DECIMAL(15,2) DEFAULT 0,
        total_further_tax DECIMAL(15,2) DEFAULT 0,
        total_extra_tax DECIMAL(15,2) DEFAULT 0,
        original_erp_status VARCHAR(30) DEFAULT 'Draft',
        original_fbr_status VARCHAR(30) DEFAULT 'Not Submitted',
        cancellation_route VARCHAR(30) DEFAULT 'Local',
        reason_code VARCHAR(50) NOT NULL,
        reason_text VARCHAR(255) NOT NULL,
        remarks TEXT DEFAULT NULL,
        requested_by VARCHAR(100) DEFAULT 'Admin',
        request_status VARCHAR(30) DEFAULT 'Draft',
        fbr_cancellation_status VARCHAR(30) DEFAULT 'Not Submitted',
        fbr_response_code VARCHAR(50) DEFAULT NULL,
        fbr_response_msg TEXT DEFAULT NULL,
        fbr_raw_response LONGTEXT DEFAULT NULL,
        fbr_payload_sent LONGTEXT DEFAULT NULL,
        submission_timestamp DATETIME DEFAULT NULL,
        last_status_check DATETIME DEFAULT NULL,
        submission_attempts INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no),
        INDEX (request_no),
        INDEX (invoice_no),
        INDEX (request_status),
        INDEX (fbr_cancellation_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {
    sendJson(['status' => 'error', 'message' => 'Schema error: ' . $e->getMessage()], 500);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// Standard permissible FBR / ERP cancellation reasons
$FBR_CANCELLATION_REASONS = [
    ['code' => '01', 'name' => 'Invoice Created in Error', 'description' => 'Duplicate entry, wrong date, or incorrect transaction entered by mistake'],
    ['code' => '02', 'name' => 'Duplicate Invoice Issued', 'description' => 'Same sale was invoiced more than once'],
    ['code' => '03', 'name' => 'Incorrect Customer Information', 'description' => 'Wrong buyer NTN, CNIC, or customer account selected'],
    ['code' => '04', 'name' => 'Incorrect Invoice Details / Rates', 'description' => 'Substantial error in item classification, rates, or taxes that requires cancellation'],
    ['code' => '05', 'name' => 'Buyer Order Cancelled', 'description' => 'Transaction was voided by buyer prior to goods dispatch or acceptance'],
    ['code' => '06', 'name' => 'Goods Rejected / Transaction Voided', 'description' => 'Total rejection of consignment before delivery acceptance'],
    ['code' => '07', 'name' => 'Other Permitted Reason', 'description' => 'Other legally permitted cancellation under FBR / PRAL digital invoicing rules']
];

// =========================================================================
// ACTION: get_meta (Company Settings, Next Serial & Reasons)
// =========================================================================
if ($action === 'get_meta') {
    try {
        $cStmt = $pdo->prepare("SELECT * FROM company_profile WHERE id = ?");
        $cStmt->execute([$company_id]);
        $company = $cStmt->fetch(PDO::FETCH_ASSOC);

        if (!$company) {
            $cStmt = $pdo->query("SELECT * FROM company_profile LIMIT 1");
            $company = $cStmt->fetch(PDO::FETCH_ASSOC);
        }

        $sStmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $sStmt->execute([$company_id]);
        $settings = $sStmt->fetch(PDO::FETCH_ASSOC);

        if (!$settings) {
            $settings = [
                'environment' => 'sandbox',
                'api_base_url' => 'https://fbr-invoice-sandbox.pral.com.pk/api/v1',
                'provider' => 'PRAL'
            ];
        }

        // Get Next Serial
        $snStmt = $pdo->prepare("SELECT COALESCE(MAX(serial_no), 0) + 1 FROM fbr_invoice_cancellations WHERE company_id = ?");
        $snStmt->execute([$company_id]);
        $nextSerial = intval($snStmt->fetchColumn() ?: 1);

        sendJson([
            'status' => 'success',
            'company' => $company ?: [],
            'settings' => [
                'environment' => $settings['environment'] ?? 'sandbox',
                'provider' => $settings['provider'] ?? 'PRAL',
                'fbr_reg_ref' => $settings['fbr_reg_ref'] ?? ''
            ],
            'reasons' => $FBR_CANCELLATION_REASONS,
            'next_serial' => $nextSerial
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: search_invoices (Search ERP sales invoices for cancellation eligibility)
// =========================================================================
if ($action === 'search_invoices') {
    try {
        $query = trim($_GET['q'] ?? '');
        $dateFrom = trim($_GET['date_from'] ?? '');
        $dateTo = trim($_GET['date_to'] ?? '');
        $erpStatusFilter = trim($_GET['erp_status'] ?? '');
        $fbrStatusFilter = trim($_GET['fbr_status'] ?? '');

        $sql = "
            SELECT 
                i.id,
                i.serial_no,
                i.invoice_no,
                i.invoice_date,
                i.customer_code,
                i.customer_name,
                i.business_name,
                i.customer_ntn,
                i.customer_cnic,
                i.customer_strn,
                i.invoice_type,
                i.net_payable as original_total,
                i.taxable_amount,
                i.total_sales_tax,
                i.total_further_tax,
                i.total_extra_tax,
                i.fbr_invoice_no,
                i.fbr_status,
                i.workflow_status,
                i.is_cancelled as invoice_is_cancelled,
                (
                    SELECT COUNT(*) 
                    FROM fbr_invoice_cancellations c 
                    WHERE c.invoice_no = i.invoice_no 
                      AND c.company_id = i.company_id 
                      AND c.request_status IN ('Pending Validation', 'Ready for Confirmation', 'Cancellation Pending', 'Cancellation Confirmed')
                ) as active_cancellations_count,
                (
                    SELECT COUNT(*) 
                    FROM fbr_digital_credit_notes cn 
                    WHERE cn.original_invoice_no = i.invoice_no 
                      AND cn.company_id = i.company_id 
                      AND cn.is_cancelled = 0
                ) as linked_credits_count,
                (
                    SELECT COUNT(*) 
                    FROM fbr_digital_debit_notes dn 
                    WHERE dn.original_invoice_no = i.invoice_no 
                      AND dn.company_id = i.company_id 
                      AND dn.is_cancelled = 0
                ) as linked_debits_count
            FROM fbr_digital_invoices i
            WHERE i.company_id = ?
        ";
        $params = [$company_id];

        if (!empty($query)) {
            $sql .= " AND (i.invoice_no LIKE ? OR i.customer_name LIKE ? OR i.fbr_invoice_no LIKE ? OR i.customer_ntn LIKE ?)";
            $wild = "%$query%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }

        if (!empty($dateFrom)) {
            $sql .= " AND i.invoice_date >= ?";
            $params[] = $dateFrom;
        }
        if (!empty($dateTo)) {
            $sql .= " AND i.invoice_date <= ?";
            $params[] = $dateTo;
        }
        if (!empty($erpStatusFilter)) {
            $sql .= " AND i.workflow_status = ?";
            $params[] = $erpStatusFilter;
        }
        if (!empty($fbrStatusFilter)) {
            $sql .= " AND i.fbr_status = ?";
            $params[] = $fbrStatusFilter;
        }

        $sql .= " ORDER BY i.serial_no DESC LIMIT 60";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Determine eligibility for each invoice
        foreach ($rows as &$r) {
            $isCancelled = intval($r['invoice_is_cancelled'] ?? 0) === 1 || $r['workflow_status'] === 'Cancelled';
            $activeCancels = intval($r['active_cancellations_count'] ?? 0);
            $linkedCredits = intval($r['linked_credits_count'] ?? 0);
            $linkedDebits = intval($r['linked_debits_count'] ?? 0);

            if ($isCancelled) {
                $r['is_eligible'] = false;
                $r['eligibility_message'] = 'Invoice is already marked as Cancelled in ERP.';
            } elseif ($activeCancels > 0) {
                $r['is_eligible'] = false;
                $r['eligibility_message'] = 'An active cancellation request is already pending or confirmed for this invoice.';
            } elseif ($linkedCredits > 0 || $linkedDebits > 0) {
                $r['is_eligible'] = false;
                $r['eligibility_message'] = "Invoice has linked adjustment documents ({$linkedCredits} Credit Note(s), {$linkedDebits} Debit Note(s)). Full cancellation not permitted without settling adjustments.";
            } else {
                $r['is_eligible'] = true;
                $r['eligibility_message'] = 'Eligible for cancellation.';
            }
        }

        sendJson(['status' => 'success', 'invoices' => $rows]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_invoice_details (Fetch single invoice with full details & items)
// =========================================================================
if ($action === 'get_invoice_details') {
    try {
        $invoiceNo = trim($_GET['invoice_no'] ?? '');
        $invoiceId = intval($_GET['invoice_id'] ?? 0);

        if (empty($invoiceNo) && $invoiceId <= 0) {
            sendJson(['status' => 'error', 'message' => 'Invoice identifier is required.'], 400);
        }

        if ($invoiceId > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
            $stmt->execute([$invoiceId, $company_id]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE invoice_no = ? AND company_id = ?");
            $stmt->execute([$invoiceNo, $company_id]);
        }

        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            sendJson(['status' => 'error', 'message' => 'Original Sales Invoice not found.'], 404);
        }

        // Fetch Items
        $itStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC");
        $itStmt->execute([$invoice['id']]);
        $items = $itStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch previous cancellation attempts
        $cStmt = $pdo->prepare("
            SELECT * FROM fbr_invoice_cancellations 
            WHERE invoice_no = ? AND company_id = ? 
            ORDER BY id DESC
        ");
        $cStmt->execute([$invoice['invoice_no'], $company_id]);
        $history = $cStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'invoice' => $invoice,
            'items' => $items,
            'history' => $history
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: save_cancellation_request (Save request in ERP without submitting to FBR)
// =========================================================================
if ($action === 'save_cancellation_request') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        sendJson(['status' => 'error', 'message' => 'Invalid JSON input data'], 400);
    }

    $id = intval($data['id'] ?? 0);
    $requestDate = trim($data['request_date'] ?? date('Y-m-d'));
    $invoiceId = intval($data['invoice_id'] ?? 0);
    $invoiceNo = trim($data['invoice_no'] ?? '');
    $invoiceDate = trim($data['invoice_date'] ?? date('Y-m-d'));
    $fbrInvoiceNo = trim($data['fbr_invoice_no'] ?? '');
    $reasonCode = trim($data['reason_code'] ?? '01');
    $reasonText = trim($data['reason_text'] ?? 'Invoice Created in Error');
    $remarks = trim($data['remarks'] ?? '');
    $requestedBy = trim($data['requested_by'] ?? 'Office User');

    if (empty($invoiceNo)) {
        sendJson(['status' => 'error', 'message' => 'An original sales invoice must be selected before saving a cancellation request.'], 400);
    }

    if (empty($remarks)) {
        sendJson(['status' => 'error', 'message' => 'Detailed cancellation remarks explaining the business reason are required.'], 400);
    }

    // Customer fields
    $customerCoaId = intval($data['customer_coa_id'] ?? 0);
    $customerCode = trim($data['customer_code'] ?? '');
    $customerName = trim($data['customer_name'] ?? '');
    $businessName = trim($data['business_name'] ?? '');
    $customerType = trim($data['customer_type'] ?? 'Registered (Filer)');
    $customerNtn = trim($data['customer_ntn'] ?? '');
    $customerCnic = trim($data['customer_cnic'] ?? '');
    $customerStrn = trim($data['customer_strn'] ?? '');
    $customerPhone = trim($data['customer_phone'] ?? '');
    $customerAddress = trim($data['customer_address'] ?? '');
    $customerProvince = trim($data['customer_province'] ?? 'Punjab');

    // Invoice specifics
    $invoiceType = trim($data['invoice_type'] ?? 'Tax Invoice');
    $invoiceTotal = floatval($data['invoice_total'] ?? 0);
    $taxableAmount = floatval($data['taxable_amount'] ?? 0);
    $totalSalesTax = floatval($data['total_sales_tax'] ?? 0);
    $totalFurtherTax = floatval($data['total_further_tax'] ?? 0);
    $totalExtraTax = floatval($data['total_extra_tax'] ?? 0);
    $origErpStatus = trim($data['original_erp_status'] ?? 'Draft');
    $origFbrStatus = trim($data['original_fbr_status'] ?? 'Not Submitted');

    // Route: If submitted to FBR, official FBR route; otherwise Local ERP route
    $cancellationRoute = ($origFbrStatus === 'Submitted') ? 'FBR Official Gateway' : 'Local ERP Cancellation';

    try {
        $pdo->beginTransaction();

        // Check if invoice is already cancelled
        $chkInv = $pdo->prepare("SELECT is_cancelled, workflow_status FROM fbr_digital_invoices WHERE invoice_no = ? AND company_id = ?");
        $chkInv->execute([$invoiceNo, $company_id]);
        $invRow = $chkInv->fetch(PDO::FETCH_ASSOC);
        if ($invRow && (intval($invRow['is_cancelled']) === 1 || $invRow['workflow_status'] === 'Cancelled')) {
            $pdo->rollBack();
            sendJson(['status' => 'error', 'message' => "Invoice #{$invoiceNo} is already cancelled in ERP."], 400);
        }

        if ($id > 0) {
            // Update existing draft request
            $chkReq = $pdo->prepare("SELECT request_status, fbr_cancellation_status FROM fbr_invoice_cancellations WHERE id = ? AND company_id = ?");
            $chkReq->execute([$id, $company_id]);
            $existing = $chkReq->fetch(PDO::FETCH_ASSOC);
            if ($existing && $existing['request_status'] === 'Cancellation Confirmed') {
                $pdo->rollBack();
                sendJson(['status' => 'error', 'message' => 'This cancellation request is already confirmed and cannot be modified.'], 400);
            }

            $upSql = "
                UPDATE fbr_invoice_cancellations SET
                    request_date = ?,
                    reason_code = ?,
                    reason_text = ?,
                    remarks = ?,
                    requested_by = ?,
                    cancellation_route = ?
                WHERE id = ? AND company_id = ?
            ";
            $upStmt = $pdo->prepare($upSql);
            $upStmt->execute([
                $requestDate, $reasonCode, $reasonText, $remarks, $requestedBy, $cancellationRoute,
                $id, $company_id
            ]);
            $requestId = $id;
        } else {
            // Next serial
            $snStmt = $pdo->prepare("SELECT COALESCE(MAX(serial_no), 0) + 1 FROM fbr_invoice_cancellations WHERE company_id = ? FOR UPDATE");
            $snStmt->execute([$company_id]);
            $serialNo = intval($snStmt->fetchColumn() ?: 1);
            $requestNo = 'CR-' . date('Y', strtotime($requestDate)) . '-' . str_pad($serialNo, 4, '0', STR_PAD_LEFT);

            $insSql = "
                INSERT INTO fbr_invoice_cancellations (
                    company_id, serial_no, request_no, request_date,
                    invoice_id, invoice_no, invoice_date, fbr_invoice_no,
                    customer_coa_id, customer_code, customer_name, business_name, customer_type,
                    customer_ntn, customer_cnic, customer_strn, customer_phone, customer_address, customer_province,
                    invoice_type, invoice_total, taxable_amount, total_sales_tax, total_further_tax, total_extra_tax,
                    original_erp_status, original_fbr_status, cancellation_route,
                    reason_code, reason_text, remarks, requested_by,
                    request_status, fbr_cancellation_status
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    'Draft', 'Not Submitted'
                )
            ";
            $insStmt = $pdo->prepare($insSql);
            $insStmt->execute([
                $company_id, $serialNo, $requestNo, $requestDate,
                $invoiceId, $invoiceNo, $invoiceDate, $fbrInvoiceNo,
                $customerCoaId, $customerCode, $customerName, $businessName, $customerType,
                $customerNtn, $customerCnic, $customerStrn, $customerPhone, $customerAddress, $customerProvince,
                $invoiceType, $invoiceTotal, $taxableAmount, $totalSalesTax, $totalFurtherTax, $totalExtraTax,
                $origErpStatus, $origFbrStatus, $cancellationRoute,
                $reasonCode, $reasonText, $remarks, $requestedBy
            ]);
            $requestId = intval($pdo->lastInsertId());
        }

        $pdo->commit();

        $retStmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE id = ?");
        $retStmt->execute([$requestId]);
        $saved = $retStmt->fetch(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'message' => 'Cancellation request saved successfully in ERP database (Not submitted to FBR yet).',
            'cancellation_request' => $saved
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        sendJson(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_cancellation_request (Load existing request by ID or Serial)
// =========================================================================
if ($action === 'get_cancellation_request') {
    try {
        $id = intval($_GET['id'] ?? 0);
        $sn = intval($_GET['serial_no'] ?? 0);
        $dir = $_GET['dir'] ?? '';

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
        } elseif (!empty($dir)) {
            if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE serial_no > ? AND company_id = ? ORDER BY serial_no ASC LIMIT 1");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE serial_no < ? AND company_id = ? ORDER BY serial_no DESC LIMIT 1");
            }
            $stmt->execute([$sn, $company_id]);
        } elseif ($sn > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE serial_no = ? AND company_id = ?");
            $stmt->execute([$sn, $company_id]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
            $stmt->execute([$company_id]);
        }

        $cr = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$cr) {
            sendJson(['status' => 'error', 'message' => 'Cancellation request not found']);
        }

        // Fetch original items for preview
        $itStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC");
        $itStmt->execute([$cr['invoice_id']]);
        $cr['items'] = $itStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson(['status' => 'success', 'cancellation_request' => $cr]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: validate_request (Validate invoice eligibility & cancellation rules)
// =========================================================================
if ($action === 'validate_request') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?: [];

    $crId = intval($data['id'] ?? $data['cancellation_id'] ?? $_GET['cancellation_id'] ?? $_GET['id'] ?? 0);
    if ($crId > 0 && empty($data['invoice_no'])) {
        $dbStmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE id = ? AND company_id = ?");
        $dbStmt->execute([$crId, $company_id]);
        $dbCr = $dbStmt->fetch(PDO::FETCH_ASSOC);
        if ($dbCr) {
            $data = array_merge($dbCr, $data);
        }
    }

    if (empty($data)) {
        sendJson(['status' => 'error', 'message' => 'Invalid data for validation'], 400);
    }

    $errors = [];
    $warnings = [];

    $invoiceNo = trim($data['invoice_no'] ?? '');
    $reasonCode = trim($data['reason_code'] ?? '');
    $remarks = trim($data['remarks'] ?? '');
    $origFbrStatus = trim($data['original_fbr_status'] ?? '');

    // 1. Check Invoice Exists & Status
    if (empty($invoiceNo)) {
        $errors[] = ['field' => 'invoice_no', 'message' => 'Original Sales Invoice must be selected.'];
    } else {
        $chkInv = $pdo->prepare("SELECT is_cancelled, workflow_status, fbr_status, fbr_invoice_no FROM fbr_digital_invoices WHERE invoice_no = ? AND company_id = ?");
        $chkInv->execute([$invoiceNo, $company_id]);
        $invRow = $chkInv->fetch(PDO::FETCH_ASSOC);

        if (!$invRow) {
            $errors[] = ['field' => 'invoice_no', 'message' => 'Original Sales Invoice record does not exist in ERP database.'];
        } elseif (intval($invRow['is_cancelled']) === 1 || $invRow['workflow_status'] === 'Cancelled') {
            $errors[] = ['field' => 'invoice_no', 'message' => 'Invoice is already marked as Cancelled. Repeated cancellation is prohibited.'];
        } else {
            // Check Credit/Debit notes
            $cnSum = $pdo->prepare("SELECT COUNT(*) FROM fbr_digital_credit_notes WHERE original_invoice_no = ? AND company_id = ? AND is_cancelled = 0");
            $cnSum->execute([$invoiceNo, $company_id]);
            if (intval($cnSum->fetchColumn()) > 0) {
                $errors[] = ['field' => 'invoice_no', 'message' => 'Invoice has active Credit Note(s) linked to it. Settle adjustments before cancellation.'];
            }
        }
    }

    // 2. Reason & Remarks Check
    if (empty($reasonCode)) {
        $errors[] = ['field' => 'reason_code', 'message' => 'Cancellation reason must be selected.'];
    }
    if (empty($remarks) || strlen($remarks) < 5) {
        $errors[] = ['field' => 'remarks', 'message' => 'Detailed cancellation remarks (minimum 5 characters) are mandatory.'];
    }

    // 3. FBR Specific Warnings / Rules
    if ($origFbrStatus === 'Submitted') {
        $warnings[] = ['field' => 'fbr_status', 'message' => 'This invoice was already submitted to FBR. Cancellation will send an official revocation request to FBR PRAL Digital Invoicing Gateway.'];
    } else {
        $warnings[] = ['field' => 'fbr_status', 'message' => 'This invoice was not submitted to FBR. It will be cancelled locally in ERP with audit trail.'];
    }

    $isValid = count($errors) === 0;

    // Update status if saved in DB
    if ($crId > 0 && $isValid) {
        $pdo->prepare("UPDATE fbr_invoice_cancellations SET request_status = 'Ready for Confirmation' WHERE id = ? AND company_id = ? AND request_status = 'Draft'")->execute([$crId, $company_id]);
    }

    sendJson([
        'status' => 'success',
        'is_valid' => $isValid,
        'request_status' => $isValid ? 'Ready for Confirmation' : 'Pending Validation',
        'errors' => $errors,
        'warnings' => $warnings,
        'message' => $isValid
            ? 'Cancellation request passed all validation checks and is Ready for Confirmation.'
            : 'Validation identified ' . count($errors) . ' error(s) that must be resolved.'
    ]);
}

// =========================================================================
// ACTION: submit_cancellation (Execute Cancellation in ERP & send to PRAL if applicable)
// =========================================================================
if ($action === 'submit_cancellation') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    $crId = intval($data['id'] ?? $data['cancellation_id'] ?? $_GET['cancellation_id'] ?? $_GET['id'] ?? 0);
    if ($crId <= 0) {
        sendJson(['status' => 'error', 'message' => 'Cancellation Request ID is required. Please save the request first.'], 400);
    }

    try {
        // Fetch Request
        $crStmt = $pdo->prepare("SELECT * FROM fbr_invoice_cancellations WHERE id = ? AND company_id = ?");
        $crStmt->execute([$crId, $company_id]);
        $cr = $crStmt->fetch(PDO::FETCH_ASSOC);

        if (!$cr) {
            sendJson(['status' => 'error', 'message' => 'Cancellation request not found in database.'], 404);
        }

        // Prevent duplicate execution
        if ($cr['request_status'] === 'Cancellation Confirmed') {
            sendJson([
                'status' => 'error',
                'message' => "This invoice cancellation has ALREADY been executed and confirmed on {$cr['submission_timestamp']}. Duplicate submission is blocked."
            ], 400);
        }

        // Fetch original invoice
        $invStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE invoice_no = ? AND company_id = ?");
        $invStmt->execute([$cr['invoice_no'], $company_id]);
        $origInv = $invStmt->fetch(PDO::FETCH_ASSOC);

        if (!$origInv) {
            sendJson(['status' => 'error', 'message' => 'Original invoice record not found.'], 404);
        }

        if (intval($origInv['is_cancelled']) === 1 || $origInv['workflow_status'] === 'Cancelled') {
            sendJson(['status' => 'error', 'message' => 'Original invoice is already marked as Cancelled.'], 400);
        }

        $now = date('Y-m-d H:i:s');
        $isFbrSubmitted = ($origInv['fbr_status'] === 'Submitted');

        // CASE 1: Invoice was submitted to FBR -> Send official cancellation to PRAL API
        if ($isFbrSubmitted) {
            // Fetch API settings
            $cfgStmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
            $cfgStmt->execute([$company_id]);
            $cfg = $cfgStmt->fetch(PDO::FETCH_ASSOC);

            if (!$cfg || empty($cfg['api_base_url'])) {
                sendJson(['status' => 'error', 'message' => 'FBR Digital Invoicing integration settings not configured. Please configure API credentials before submitting FBR cancellations.'], 400);
            }

            $environment = strtolower($cfg['environment'] ?? 'sandbox');
            $rawToken = ($environment === 'production')
                ? (!empty($cfg['api_token_production']) ? $cfg['api_token_production'] : ($cfg['api_token'] ?? ''))
                : (!empty($cfg['api_token_sandbox']) ? $cfg['api_token_sandbox'] : ($cfg['api_token'] ?? ''));
            $apiToken = fbr_decrypt_token($rawToken);
            $baseEndpoint = fbr_get_official_endpoint('post', $environment, $cfg['api_post_url'] ?? $cfg['api_base_url'] ?? '');
            $endpoint = str_replace(['postinvoicedata_sb', 'postinvoicedata'], ['cancelinvoicedata_sb', 'cancelinvoicedata'], $baseEndpoint);
            $posId = 100001;
            if (!empty($cfg['fbr_reg_ref']) && is_numeric($cfg['fbr_reg_ref'])) {
                $posId = intval($cfg['fbr_reg_ref']);
            } elseif (!empty($cfg['pos_id']) && is_numeric($cfg['pos_id'])) {
                $posId = intval($cfg['pos_id']);
            }
            $timeout = max(5, intval($cfg['request_timeout'] ?? 30));

            $refUsin = !empty($origInv['fbr_invoice_no']) ? $origInv['fbr_invoice_no'] : $origInv['invoice_no'];

            $fbrPayload = [
                'InvoiceNumber' => $origInv['fbr_invoice_no'] ?: $origInv['invoice_no'],
                'POSID' => intval($posId),
                'USIN' => $origInv['invoice_no'],
                'DateTime' => $now,
                'RefUSIN' => $refUsin,
                'Reason' => $cr['reason_text'] . (!empty($cr['remarks']) ? ' - ' . $cr['remarks'] : ''),
                'Remarks' => $cr['remarks']
            ];

            $payloadJson = json_encode($fbrPayload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

            // Update request status to Cancellation Pending
            $pdo->prepare("UPDATE fbr_invoice_cancellations SET request_status = 'Cancellation Pending', submission_attempts = submission_attempts + 1 WHERE id = ?")->execute([$crId]);

            // Execute via shared client
            $res = fbr_api_request($endpoint, 'POST', $fbrPayload, $apiToken, $timeout);
            $durationMs = $res['duration_ms'];
            $httpCode = $res['http_code'];
            $curlError = $res['curl_error'];
            $rawResponse = $res['body'];

            $parsed = fbr_parse_api_response($res);
            $isSuccess = $parsed['is_success'];
            $respCode = strval($res['http_code']);
            $respMsg = $parsed['message'];

            if ($isSuccess) {
                $fbrStatus = 'Cancelled';
            } elseif ($res['timed_out']) {
                $fbrStatus = 'Pending Verification';
                $respMsg = 'Connection timed out. Marked Pending Verification to avoid duplicate cancellation requests.';
            } else {
                $fbrStatus = ($httpCode === 0) ? 'Failed' : 'Rejected';
            }

            if ($isSuccess) {
                $pdo->beginTransaction();

                // 1. Update Cancellation Request
                $upCr = $pdo->prepare("
                    UPDATE fbr_invoice_cancellations SET
                        request_status = 'Cancellation Confirmed',
                        fbr_cancellation_status = 'Cancelled',
                        fbr_response_code = ?,
                        fbr_response_msg = ?,
                        fbr_raw_response = ?,
                        fbr_payload_sent = ?,
                        submission_timestamp = ?,
                        last_status_check = ?
                    WHERE id = ?
                ");
                $upCr->execute([$respCode, $respMsg, $rawResponse, $payloadJson, $now, $now, $crId]);

                // 2. Mark Original Invoice as Cancelled
                $upInv = $pdo->prepare("
                    UPDATE fbr_digital_invoices SET
                        is_cancelled = 1,
                        workflow_status = 'Cancelled',
                        cancellation_reason = ?,
                        cancellation_date = ?
                    WHERE id = ?
                ");
                $upInv->execute([$cr['reason_text'] . ' - ' . $cr['remarks'], $now, $origInv['id']]);

                $pdo->commit();
            } else {
                // Update request with failure info
                $upCr = $pdo->prepare("
                    UPDATE fbr_invoice_cancellations SET
                        request_status = 'Cancellation Rejected',
                        fbr_cancellation_status = ?,
                        fbr_response_code = ?,
                        fbr_response_msg = ?,
                        fbr_raw_response = ?,
                        fbr_payload_sent = ?,
                        last_status_check = ?
                    WHERE id = ?
                ");
                $upCr->execute([$fbrStatus, $respCode, $respMsg, $rawResponse, $payloadJson, $now, $crId]);
            }

            // Audit Log
            try {
                $logStmt = $pdo->prepare("
                    INSERT INTO digital_invoice_logs (
                        company_id, log_level, action, invoice_id, invoice_no,
                        request_endpoint, http_status, request_payload, response_payload,
                        execution_time_ms, message
                    ) VALUES (?, ?, 'SUBMIT_INVOICE_CANCELLATION', ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $logStmt->execute([
                    $company_id,
                    ($isSuccess ? 'INFO' : 'ERROR'),
                    $origInv['id'],
                    $origInv['invoice_no'],
                    $endpoint,
                    $httpCode ?: 0,
                    $payloadJson,
                    $rawResponse,
                    $durationMs,
                    $respMsg
                ]);

                // Dual-log into fbr_integration_logs
                $attStmt = $pdo->prepare("SELECT COUNT(*) FROM fbr_integration_logs WHERE company_id = ? AND erp_doc_no = ?");
                $attStmt->execute([$company_id, $origInv['invoice_no']]);
                $attemptNo = intval($attStmt->fetchColumn()) + 1;

                $fbrLogStmt = $pdo->prepare("
                    INSERT INTO fbr_integration_logs (
                        company_id, document_type, erp_doc_id, erp_doc_no, fbr_invoice_no,
                        operation_type, attempt_number, api_endpoint, http_method,
                        http_status_code, fbr_response_code, response_message, validation_errors,
                        request_payload, response_payload, processing_time_ms, status,
                        request_timestamp, response_timestamp
                    ) VALUES (
                        ?, 'Cancellation', ?, ?, ?,
                        'Cancellation Submission', ?, ?, 'POST',
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        NOW(), NOW()
                    )
                ");
                $fbrLogStmt->execute([
                    $company_id,
                    $origInv['id'],
                    $origInv['invoice_no'],
                    $origInv['fbr_invoice_no'] ?: null,
                    $attemptNo,
                    $endpoint,
                    $httpCode,
                    $respCode,
                    $respMsg,
                    !empty($respJson['errors']) ? json_encode($respJson['errors']) : null,
                    $payloadJson,
                    $rawResponse,
                    $durationMs,
                    $isSuccess ? 'Success' : ($httpCode >= 500 ? 'Timeout' : ($respCode == '99' ? 'Rejected' : 'Failed'))
                ]);
            } catch (Exception $ignored) {}

            sendJson([
                'status' => $isSuccess ? 'success' : 'error',
                'is_cancelled' => $isSuccess,
                'cancellation_route' => 'FBR Official Gateway',
                'fbr_cancellation_status' => $fbrStatus,
                'fbr_response_code' => $respCode,
                'fbr_response_msg' => $respMsg,
                'message' => $isSuccess
                    ? "Invoice #{$origInv['invoice_no']} successfully cancelled on FBR Gateway and updated in ERP!"
                    : "FBR Cancellation Failed: {$respMsg}"
            ]);

        } else {
            // CASE 2: Local ERP Cancellation (Invoice was not submitted to FBR)
            $pdo->beginTransaction();

            // 1. Update Cancellation Request
            $upCr = $pdo->prepare("
                UPDATE fbr_invoice_cancellations SET
                    request_status = 'Cancellation Confirmed',
                    fbr_cancellation_status = 'Not Applicable (Local)',
                    fbr_response_code = 'LOCAL_OK',
                    fbr_response_msg = 'Invoice cancelled locally in ERP with audit logging.',
                    submission_timestamp = ?,
                    last_status_check = ?
                WHERE id = ?
            ");
            $upCr->execute([$now, $now, $crId]);

            // 2. Mark Original Invoice as Cancelled
            $upInv = $pdo->prepare("
                UPDATE fbr_digital_invoices SET
                    is_cancelled = 1,
                    workflow_status = 'Cancelled',
                    cancellation_reason = ?,
                    cancellation_date = ?
                WHERE id = ?
            ");
            $upInv->execute([$cr['reason_text'] . ' - ' . $cr['remarks'], $now, $origInv['id']]);

            $pdo->commit();

            // Audit Log
            try {
                $logStmt = $pdo->prepare("
                    INSERT INTO digital_invoice_logs (
                        company_id, log_level, action, invoice_id, invoice_no,
                        request_endpoint, http_status, request_payload, response_payload,
                        execution_time_ms, message
                    ) VALUES (?, 'INFO', 'LOCAL_INVOICE_CANCELLATION', ?, ?, 'LOCAL_ERP', 200, ?, 'LOCAL_SUCCESS', 0, ?)
                ");
                $logStmt->execute([
                    $company_id,
                    $origInv['id'],
                    $origInv['invoice_no'],
                    json_encode(['reason' => $cr['reason_text'], 'remarks' => $cr['remarks']]),
                    "Local ERP invoice #{$origInv['invoice_no']} cancelled successfully."
                ]);
            } catch (Exception $ignored) {}

            sendJson([
                'status' => 'success',
                'is_cancelled' => true,
                'cancellation_route' => 'Local ERP Cancellation',
                'fbr_cancellation_status' => 'Not Applicable (Local)',
                'message' => "Sales Invoice #{$origInv['invoice_no']} has been successfully cancelled in ERP."
            ]);
        }

    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        sendJson(['status' => 'error', 'message' => 'Cancellation execution error: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: search_cancellation_requests (Find / Browse Modal)
// =========================================================================
if ($action === 'search_cancellation_requests') {
    try {
        $query = trim($_GET['q'] ?? '');
        $sql = "
            SELECT 
                id, serial_no, request_no, request_date,
                invoice_no, invoice_date, customer_name,
                invoice_total, cancellation_route, reason_text,
                request_status, fbr_cancellation_status, submission_timestamp
            FROM fbr_invoice_cancellations
            WHERE company_id = ?
        ";
        $params = [$company_id];

        if (!empty($query)) {
            $sql .= " AND (request_no LIKE ? OR invoice_no LIKE ? OR customer_name LIKE ? OR reason_text LIKE ?)";
            $wild = "%$query%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }

        $sql .= " ORDER BY serial_no DESC LIMIT 150";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        sendJson(['status' => 'success', 'cancellation_requests' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// Fallback
sendJson(['status' => 'error', 'message' => 'Action [' . htmlspecialchars($action) . '] is not supported.'], 400);
