<?php
// SoftifyX ERP - FBR Digital Credit Note API
// Complete, secure implementation for FBR Credit Note creation, validation, invoice adjustment logic & PRAL/FBR submission

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
// 1. DATABASE SCHEMA SETUP: Ensure Credit Note Tables Exist
// -------------------------------------------------------------------------
try {
    // Main Credit Notes Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_credit_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        credit_note_no VARCHAR(50) NOT NULL,
        credit_note_date DATE NOT NULL,
        credit_note_type VARCHAR(50) DEFAULT 'Credit Note',
        supply_type VARCHAR(50) DEFAULT 'Standard Rate Goods',
        original_invoice_id INT DEFAULT NULL,
        original_invoice_source VARCHAR(30) DEFAULT 'fbr_digital_invoice',
        original_invoice_no VARCHAR(50) NOT NULL,
        original_invoice_date DATE NOT NULL,
        original_fbr_invoice_no VARCHAR(100) DEFAULT NULL,
        original_invoice_total DECIMAL(15,2) DEFAULT 0,
        previously_credited_amount DECIMAL(15,2) DEFAULT 0,
        remaining_eligible_amount DECIMAL(15,2) DEFAULT 0,
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
        reason_code VARCHAR(50) NOT NULL,
        reason_text VARCHAR(255) NOT NULL,
        remarks TEXT DEFAULT NULL,
        total_credit_qty DECIMAL(15,2) DEFAULT 0,
        credit_val_excl_tax DECIMAL(15,2) DEFAULT 0,
        total_discount_adjustment DECIMAL(15,2) DEFAULT 0,
        taxable_credit_amount DECIMAL(15,2) DEFAULT 0,
        sales_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        further_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        extra_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        fed_adjustment DECIMAL(15,2) DEFAULT 0,
        total_credit_amount DECIMAL(15,2) DEFAULT 0,
        workflow_status VARCHAR(30) DEFAULT 'Draft',
        fbr_status VARCHAR(30) DEFAULT 'Not Submitted',
        fbr_credit_note_no VARCHAR(100) DEFAULT NULL,
        fbr_qr_code TEXT DEFAULT NULL,
        fbr_response_code VARCHAR(50) DEFAULT NULL,
        fbr_response_msg TEXT DEFAULT NULL,
        fbr_raw_response LONGTEXT DEFAULT NULL,
        fbr_payload_sent LONGTEXT DEFAULT NULL,
        submission_timestamp DATETIME DEFAULT NULL,
        last_status_check DATETIME DEFAULT NULL,
        is_cancelled TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no),
        INDEX (credit_note_no),
        INDEX (original_invoice_no),
        INDEX (workflow_status),
        INDEX (fbr_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Credit Note Items Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_credit_note_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        credit_note_id INT NOT NULL,
        original_item_id INT DEFAULT NULL,
        item_id INT DEFAULT NULL,
        item_code VARCHAR(50) DEFAULT NULL,
        item_name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        hs_code VARCHAR(50) NOT NULL,
        uom VARCHAR(50) NOT NULL,
        original_qty DECIMAL(15,2) DEFAULT 0,
        prev_credited_qty DECIMAL(15,2) DEFAULT 0,
        remaining_qty DECIMAL(15,2) DEFAULT 0,
        credit_qty DECIMAL(15,2) NOT NULL DEFAULT 0,
        rate DECIMAL(20,4) NOT NULL DEFAULT 0,
        credit_gross_amount DECIMAL(15,2) DEFAULT 0,
        discount_percent DECIMAL(10,2) DEFAULT 0,
        discount_adjustment DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(10,2) DEFAULT 18.00,
        sales_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        further_tax_rate DECIMAL(10,2) DEFAULT 0,
        further_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        extra_tax_rate DECIMAL(10,2) DEFAULT 0,
        extra_tax_adjustment DECIMAL(15,2) DEFAULT 0,
        fed_rate DECIMAL(10,2) DEFAULT 0,
        fed_adjustment DECIMAL(15,2) DEFAULT 0,
        val_excl_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
        val_incl_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
        item_classification VARCHAR(50) DEFAULT 'Goods',
        sort_order INT DEFAULT 0,
        FOREIGN KEY (credit_note_id) REFERENCES fbr_digital_credit_notes(id) ON DELETE CASCADE,
        INDEX (credit_note_id),
        INDEX (item_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {
    sendJson(['status' => 'error', 'message' => 'Schema error: ' . $e->getMessage()], 500);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// List of official FBR / PRAL permissible Credit Note Reasons
$FBR_CREDIT_REASONS = [
    ['code' => '01', 'name' => 'Sales Return', 'description' => 'Return of goods by the buyer (Physical or Rejection)'],
    ['code' => '02', 'name' => 'Goods Returned or Rejected', 'description' => 'Goods rejected due to quality or specification mismatch'],
    ['code' => '03', 'name' => 'Invoice Value Correction', 'description' => 'Downward correction of erroneous invoice value'],
    ['code' => '04', 'name' => 'Quantity Adjustment', 'description' => 'Correction in billed quantity exceeding actual delivered'],
    ['code' => '05', 'name' => 'Price Adjustment', 'description' => 'Post-sale downward price adjustment / negotiation'],
    ['code' => '06', 'name' => 'Discount or Rebate Adjustment', 'description' => 'Post-sale volume rebate or prompt payment discount'],
    ['code' => '07', 'name' => 'Cancellation / Permitted Adjustment', 'description' => 'Full or partial transaction cancellation under FBR rules']
];

// =========================================================================
// ACTION: get_meta (Next Serial, Company Info, Reasons, Environment)
// =========================================================================
if ($action === 'get_meta') {
    try {
        // Company
        $compStmt = $pdo->prepare("SELECT id, name, address, phone, email, ntn, gst FROM companies WHERE id = ?");
        $compStmt->execute([$company_id]);
        $company = $compStmt->fetch(PDO::FETCH_ASSOC) ?: ['id' => $company_id, 'name' => 'My Company'];

        // Next Serial
        $snStmt = $pdo->prepare("SELECT COALESCE(MAX(serial_no), 0) + 1 FROM fbr_digital_credit_notes WHERE company_id = ?");
        $snStmt->execute([$company_id]);
        $nextSerial = intval($snStmt->fetchColumn() ?: 1);
        $nextCreditNoteNo = 'CN-' . date('Y') . '-' . str_pad($nextSerial, 4, '0', STR_PAD_LEFT);

        // Integration Settings
        $setStmt = $pdo->prepare("SELECT provider, environment, api_base_url, connection_status, fbr_reg_ref FROM digital_invoice_settings WHERE company_id = ?");
        $setStmt->execute([$company_id]);
        $settings = $setStmt->fetch(PDO::FETCH_ASSOC) ?: [
            'provider' => 'FBR / PRAL Digital Invoicing',
            'environment' => 'sandbox',
            'api_base_url' => 'https://gw.fbr.gov.pk/imf/v1',
            'connection_status' => 'Not Configured',
            'fbr_reg_ref' => 'POMS-001'
        ];

        sendJson([
            'status' => 'success',
            'company' => $company,
            'next_serial' => $nextSerial,
            'next_credit_note_no' => $nextCreditNoteNo,
            'reasons' => $FBR_CREDIT_REASONS,
            'settings' => $settings
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: search_invoices (Search candidate sales invoices to credit)
// =========================================================================
if ($action === 'search_invoices') {
    try {
        $query = trim($_GET['q'] ?? '');

        // 1. Search in fbr_digital_invoices
        $sql = "
            SELECT 
                i.id,
                'fbr_digital_invoice' as source,
                i.serial_no,
                i.invoice_no,
                i.invoice_date,
                i.customer_coa_id,
                i.customer_code,
                i.customer_name,
                i.business_name,
                i.customer_type,
                i.customer_ntn,
                i.customer_cnic,
                i.customer_strn,
                i.customer_phone,
                i.customer_address,
                i.customer_province,
                i.net_payable as original_total,
                i.fbr_invoice_no,
                i.fbr_status,
                i.workflow_status,
                COALESCE((
                    SELECT SUM(cn.total_credit_amount) 
                    FROM fbr_digital_credit_notes cn 
                    WHERE cn.company_id = i.company_id 
                      AND cn.original_invoice_no = i.invoice_no 
                      AND cn.is_cancelled = 0
                ), 0) as previously_credited_amount
            FROM fbr_digital_invoices i
            WHERE i.company_id = ?
              AND (i.invoice_type = 'Tax Invoice' OR i.invoice_type = 'Sale Invoice' OR i.invoice_type LIKE '%Standard%')
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

        $sql .= " ORDER BY i.serial_no DESC LIMIT 60";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate remaining eligible amount for each invoice
        $eligibleList = [];
        foreach ($rows as $r) {
            $origTotal = floatval($r['original_total']);
            $prevCredited = floatval($r['previously_credited_amount']);
            $remaining = max(0, round($origTotal - $prevCredited, 2));

            $r['remaining_eligible_amount'] = $remaining;
            $r['is_eligible'] = ($remaining > 0);
            $eligibleList[] = $r;
        }

        sendJson(['status' => 'success', 'invoices' => $eligibleList]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_invoice_details (Fetch single invoice with item breakdown & remaining credit)
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

        // Fetch Previously Credited Total for this invoice
        $cnSumStmt = $pdo->prepare("
            SELECT COALESCE(SUM(total_credit_amount), 0) as total_credited
            FROM fbr_digital_credit_notes 
            WHERE company_id = ? AND original_invoice_no = ? AND is_cancelled = 0
        ");
        $cnSumStmt->execute([$company_id, $invoice['invoice_no']]);
        $previouslyCredited = floatval($cnSumStmt->fetchColumn() ?: 0);
        $originalTotal = floatval($invoice['net_payable']);
        $remainingEligible = max(0, round($originalTotal - $previouslyCredited, 2));

        $invoice['previously_credited_amount'] = $previouslyCredited;
        $invoice['remaining_eligible_amount'] = $remainingEligible;

        // Fetch Original Items
        $itStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC");
        $itStmt->execute([$invoice['id']]);
        $items = $itStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch item-by-item previously credited quantities
        $cnItemStmt = $pdo->prepare("
            SELECT 
                cni.original_item_id,
                COALESCE(SUM(cni.credit_qty), 0) as prev_qty
            FROM fbr_digital_credit_note_items cni
            JOIN fbr_digital_credit_notes cn ON cni.credit_note_id = cn.id
            WHERE cn.company_id = ? AND cn.original_invoice_no = ? AND cn.is_cancelled = 0
            GROUP BY cni.original_item_id
        ");
        $cnItemStmt->execute([$company_id, $invoice['invoice_no']]);
        $itemCreditedMap = [];
        while ($row = $cnItemStmt->fetch(PDO::FETCH_ASSOC)) {
            $itemCreditedMap[$row['original_item_id']] = floatval($row['prev_qty']);
        }

        // Prepare line items with remaining quantities
        foreach ($items as &$it) {
            $origQty = floatval($it['quantity']);
            $prevQty = $itemCreditedMap[$it['id']] ?? 0;
            $remQty = max(0, round($origQty - $prevQty, 2));

            $it['original_item_id'] = $it['id'];
            $it['original_qty'] = $origQty;
            $it['prev_credited_qty'] = $prevQty;
            $it['remaining_qty'] = $remQty;
            $it['credit_qty'] = $remQty; // Default propose remaining quantity
            $it['is_eligible'] = ($remQty > 0);
        }

        sendJson([
            'status' => 'success',
            'invoice' => $invoice,
            'items' => $items
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: save_credit_note (Create or update Credit Note in ERP database)
// =========================================================================
if ($action === 'save_credit_note') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        sendJson(['status' => 'error', 'message' => 'Invalid JSON input data'], 400);
    }

    $id = intval($data['id'] ?? 0);
    $creditNoteDate = trim($data['credit_note_date'] ?? date('Y-m-d'));
    $originalInvoiceId = intval($data['original_invoice_id'] ?? 0);
    $originalInvoiceNo = trim($data['original_invoice_no'] ?? '');
    $originalInvoiceDate = trim($data['original_invoice_date'] ?? date('Y-m-d'));
    $originalFbrInvoiceNo = trim($data['original_fbr_invoice_no'] ?? '');
    $reasonCode = trim($data['reason_code'] ?? '01');
    $reasonText = trim($data['reason_text'] ?? 'Sales Return');
    $remarks = trim($data['remarks'] ?? '');

    if (empty($originalInvoiceNo)) {
        sendJson(['status' => 'error', 'message' => 'An original sales invoice must be selected before saving a Credit Note.'], 400);
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

    // Totals
    $totalCreditQty = floatval($data['total_credit_qty'] ?? 0);
    $creditValExclTax = floatval($data['credit_val_excl_tax'] ?? 0);
    $totalDiscountAdjustment = floatval($data['total_discount_adjustment'] ?? 0);
    $taxableCreditAmount = floatval($data['taxable_credit_amount'] ?? 0);
    $salesTaxAdjustment = floatval($data['sales_tax_adjustment'] ?? 0);
    $furtherTaxAdjustment = floatval($data['further_tax_adjustment'] ?? 0);
    $extraTaxAdjustment = floatval($data['extra_tax_adjustment'] ?? 0);
    $fedAdjustment = floatval($data['fed_adjustment'] ?? 0);
    $totalCreditAmount = floatval($data['total_credit_amount'] ?? 0);

    $items = is_array($data['items'] ?? null) ? $data['items'] : [];

    // Filter items with credit_qty > 0
    $activeItems = array_filter($items, function($it) {
        return floatval($it['credit_qty'] ?? 0) > 0;
    });

    if (empty($activeItems)) {
        sendJson(['status' => 'error', 'message' => 'Credit Note must contain at least one line item with credit quantity greater than 0.'], 400);
    }

    try {
        $pdo->beginTransaction();

        // 1. Validate that the Credit Note doesn't already exist as submitted if updating
        if ($id > 0) {
            $chkStmt = $pdo->prepare("SELECT fbr_status, fbr_credit_note_no FROM fbr_digital_credit_notes WHERE id = ? AND company_id = ?");
            $chkStmt->execute([$id, $company_id]);
            $existing = $chkStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing && $existing['fbr_status'] === 'Submitted') {
                $pdo->rollBack();
                sendJson(['status' => 'error', 'message' => 'This Credit Note has already been submitted to FBR (' . $existing['fbr_credit_note_no'] . ') and cannot be modified.'], 400);
            }
        }

        // 2. Insert or Update Header
        if ($id > 0) {
            $upSql = "
                UPDATE fbr_digital_credit_notes SET
                    credit_note_date = ?,
                    original_invoice_id = ?,
                    original_invoice_no = ?,
                    original_invoice_date = ?,
                    original_fbr_invoice_no = ?,
                    customer_coa_id = ?,
                    customer_code = ?,
                    customer_name = ?,
                    business_name = ?,
                    customer_type = ?,
                    customer_ntn = ?,
                    customer_cnic = ?,
                    customer_strn = ?,
                    customer_phone = ?,
                    customer_address = ?,
                    customer_province = ?,
                    reason_code = ?,
                    reason_text = ?,
                    remarks = ?,
                    total_credit_qty = ?,
                    credit_val_excl_tax = ?,
                    total_discount_adjustment = ?,
                    taxable_credit_amount = ?,
                    sales_tax_adjustment = ?,
                    further_tax_adjustment = ?,
                    extra_tax_adjustment = ?,
                    fed_adjustment = ?,
                    total_credit_amount = ?
                WHERE id = ? AND company_id = ?
            ";
            $upStmt = $pdo->prepare($upSql);
            $upStmt->execute([
                $creditNoteDate, $originalInvoiceId, $originalInvoiceNo, $originalInvoiceDate, $originalFbrInvoiceNo,
                $customerCoaId, $customerCode, $customerName, $businessName, $customerType,
                $customerNtn, $customerCnic, $customerStrn, $customerPhone, $customerAddress, $customerProvince,
                $reasonCode, $reasonText, $remarks,
                $totalCreditQty, $creditValExclTax, $totalDiscountAdjustment, $taxableCreditAmount,
                $salesTaxAdjustment, $furtherTaxAdjustment, $extraTaxAdjustment, $fedAdjustment,
                $totalCreditAmount,
                $id, $company_id
            ]);
            $creditNoteId = $id;

            // Clear old items
            $delStmt = $pdo->prepare("DELETE FROM fbr_digital_credit_note_items WHERE credit_note_id = ?");
            $delStmt->execute([$creditNoteId]);
        } else {
            // Next serial
            $snStmt = $pdo->prepare("SELECT COALESCE(MAX(serial_no), 0) + 1 FROM fbr_digital_credit_notes WHERE company_id = ? FOR UPDATE");
            $snStmt->execute([$company_id]);
            $serialNo = intval($snStmt->fetchColumn() ?: 1);
            $creditNoteNo = 'CN-' . date('Y', strtotime($creditNoteDate)) . '-' . str_pad($serialNo, 4, '0', STR_PAD_LEFT);

            $insSql = "
                INSERT INTO fbr_digital_credit_notes (
                    company_id, serial_no, credit_note_no, credit_note_date,
                    original_invoice_id, original_invoice_no, original_invoice_date, original_fbr_invoice_no,
                    customer_coa_id, customer_code, customer_name, business_name, customer_type,
                    customer_ntn, customer_cnic, customer_strn, customer_phone, customer_address, customer_province,
                    reason_code, reason_text, remarks,
                    total_credit_qty, credit_val_excl_tax, total_discount_adjustment, taxable_credit_amount,
                    sales_tax_adjustment, further_tax_adjustment, extra_tax_adjustment, fed_adjustment,
                    total_credit_amount,
                    workflow_status, fbr_status
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?,
                    'Draft', 'Not Submitted'
                )
            ";
            $insStmt = $pdo->prepare($insSql);
            $insStmt->execute([
                $company_id, $serialNo, $creditNoteNo, $creditNoteDate,
                $originalInvoiceId, $originalInvoiceNo, $originalInvoiceDate, $originalFbrInvoiceNo,
                $customerCoaId, $customerCode, $customerName, $businessName, $customerType,
                $customerNtn, $customerCnic, $customerStrn, $customerPhone, $customerAddress, $customerProvince,
                $reasonCode, $reasonText, $remarks,
                $totalCreditQty, $creditValExclTax, $totalDiscountAdjustment, $taxableCreditAmount,
                $salesTaxAdjustment, $furtherTaxAdjustment, $extraTaxAdjustment, $fedAdjustment,
                $totalCreditAmount
            ]);
            $creditNoteId = intval($pdo->lastInsertId());
        }

        // 3. Insert Line Items
        $insItemStmt = $pdo->prepare("
            INSERT INTO fbr_digital_credit_note_items (
                credit_note_id, original_item_id, item_id, item_code, item_name, description,
                hs_code, uom, original_qty, prev_credited_qty, remaining_qty,
                credit_qty, rate, credit_gross_amount,
                discount_percent, discount_adjustment,
                tax_rate, sales_tax_adjustment,
                further_tax_rate, further_tax_adjustment,
                extra_tax_rate, extra_tax_adjustment,
                fed_rate, fed_adjustment,
                val_excl_tax, val_incl_tax,
                item_classification, sort_order
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?
            )
        ");

        $idx = 0;
        foreach ($activeItems as $it) {
            $idx++;
            $originalItemId = intval($it['original_item_id'] ?? 0);
            $itemId = intval($it['item_id'] ?? 0);
            $itemCode = trim($it['item_code'] ?? '');
            $itemName = trim($it['item_name'] ?? '');
            $itemDesc = trim($it['description'] ?? '');
            $hsCode = preg_replace('/[^0-9]/', '', trim($it['hs_code'] ?? '00000000')) ?: '00000000';
            $uom = trim($it['uom'] ?? 'Each');

            $origQ = floatval($it['original_qty'] ?? 0);
            $prevQ = floatval($it['prev_credited_qty'] ?? 0);
            $remQ = floatval($it['remaining_qty'] ?? 0);
            $creditQ = floatval($it['credit_qty'] ?? 0);
            $rate = floatval($it['rate'] ?? 0);

            $creditGross = round($creditQ * $rate, 2);
            $discPct = floatval($it['discount_percent'] ?? 0);
            $discAdj = round($creditGross * ($discPct / 100), 2);
            $valExcl = round($creditGross - $discAdj, 2);

            $taxRate = floatval($it['tax_rate'] ?? 18);
            $stAdj = round($valExcl * ($taxRate / 100), 2);

            $furRate = floatval($it['further_tax_rate'] ?? 0);
            $furAdj = round($valExcl * ($furRate / 100), 2);

            $extRate = floatval($it['extra_tax_rate'] ?? 0);
            $extAdj = round($valExcl * ($extRate / 100), 2);

            $fedRate = floatval($it['fed_rate'] ?? 0);
            $fedAdj = round($valExcl * ($fedRate / 100), 2);

            $valIncl = round($valExcl + $stAdj + $furAdj + $extAdj + $fedAdj, 2);
            $classification = trim($it['item_classification'] ?? 'Goods');

            $insItemStmt->execute([
                $creditNoteId, $originalItemId, $itemId, $itemCode, $itemName, $itemDesc,
                $hsCode, $uom, $origQ, $prevQ, $remQ,
                $creditQ, $rate, $creditGross,
                $discPct, $discAdj,
                $taxRate, $stAdj,
                $furRate, $furAdj,
                $extRate, $extAdj,
                $fedRate, $fedAdj,
                $valExcl, $valIncl,
                $classification, $idx
            ]);
        }

        $pdo->commit();

        // Return saved object
        $retStmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE id = ?");
        $retStmt->execute([$creditNoteId]);
        $saved = $retStmt->fetch(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'message' => 'FBR Credit Note saved successfully in ERP database.',
            'credit_note' => $saved
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        sendJson(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_credit_note (Load existing credit note with its items)
// =========================================================================
if ($action === 'get_credit_note') {
    try {
        $id = intval($_GET['id'] ?? 0);
        $sn = intval($_GET['serial_no'] ?? 0);
        $dir = $_GET['dir'] ?? '';

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
        } elseif (!empty($dir)) {
            if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE serial_no > ? AND company_id = ? ORDER BY serial_no ASC LIMIT 1");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE serial_no < ? AND company_id = ? ORDER BY serial_no DESC LIMIT 1");
            }
            $stmt->execute([$sn, $company_id]);
        } elseif ($sn > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE serial_no = ? AND company_id = ?");
            $stmt->execute([$sn, $company_id]);
        } else {
            // Retrieve latest
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
            $stmt->execute([$company_id]);
        }

        $cn = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$cn) {
            sendJson(['status' => 'error', 'message' => 'Credit Note not found']);
        }

        // Fetch line items
        $itStmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_note_items WHERE credit_note_id = ? ORDER BY sort_order ASC, id ASC");
        $itStmt->execute([$cn['id']]);
        $cn['items'] = $itStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson(['status' => 'success', 'credit_note' => $cn]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: validate_credit_note (Validate credit note compliance against FBR rules)
// =========================================================================
if ($action === 'validate_credit_note') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        sendJson(['status' => 'error', 'message' => 'Invalid data for validation'], 400);
    }

    $errors = [];
    $warnings = [];

    $cnId = intval($data['id'] ?? 0);
    $origInvoiceNo = trim($data['original_invoice_no'] ?? '');
    $reasonCode = trim($data['reason_code'] ?? '');
    $customerType = trim($data['customer_type'] ?? '');
    $customerNtn = preg_replace('/[^0-9]/', '', trim($data['customer_ntn'] ?? ''));
    $customerCnic = preg_replace('/[^0-9]/', '', trim($data['customer_cnic'] ?? ''));
    $items = is_array($data['items'] ?? null) ? $data['items'] : [];

    // 0. Seller / Company FBR Profile Verification
    $compStmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
    $compStmt->execute([$company_id]);
    $comp = $compStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $cfgStmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
    $cfgStmt->execute([$company_id]);
    $cfg = $cfgStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $cleanInputNtn = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)($comp['ntn'] ?? ''))));
    $rawSellerCheck = '';
    if (strlen($cleanInputNtn) === 13) {
        $rawSellerCheck = $cleanInputNtn;
    } elseif (strlen($cleanInputNtn) === 8) {
        $rawSellerCheck = substr($cleanInputNtn, 0, 7);
    } elseif (strlen($cleanInputNtn) === 7) {
        $rawSellerCheck = $cleanInputNtn;
    } elseif (strlen($cleanInputNtn) === 6 && ctype_digit($cleanInputNtn)) {
        $rawSellerCheck = '0' . $cleanInputNtn;
    } else {
        $rawSellerCheck = $cleanInputNtn;
    }

    if (strlen($rawSellerCheck) !== 7 && strlen($rawSellerCheck) !== 13) {
        $compGst = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)($comp['gst'] ?? ($comp['gst_reg_no'] ?? '')))));
        if (strlen($compGst) === 7 || strlen($compGst) === 13) {
            $rawSellerCheck = $compGst;
        }
    }
    if (strlen($rawSellerCheck) !== 7 && strlen($rawSellerCheck) !== 13) {
        if (!empty($cfg['fbr_reg_ref'])) {
            $cleanRef = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)$cfg['fbr_reg_ref'])));
            if (strlen($cleanRef) === 7 || strlen($cleanRef) === 13) {
                $rawSellerCheck = $cleanRef;
            }
        }
    }

    if (empty($rawSellerCheck) || (strlen($rawSellerCheck) !== 7 && strlen($rawSellerCheck) !== 13)) {
        $errors[] = [
            'field' => 'seller_ntn',
            'message' => 'Seller (Company) NTN is invalid: "' . ($comp['ntn'] ?? 'empty') . '". FBR strictly requires a 7-character NTN (e.g. A522103 or 5221034) or 13-digit CNIC matching your IRIS Bearer Token. Please update Taxpayer Details in Settings.'
        ];
    }

    // 1. Original Invoice Link Check
    if (empty($origInvoiceNo)) {
        $errors[] = ['field' => 'original_invoice_no', 'message' => 'Original Sales Invoice reference is strictly required by FBR to issue a Credit Note.'];
    }

    // 2. Reason Check
    if (empty($reasonCode)) {
        $errors[] = ['field' => 'reason_code', 'message' => 'FBR Credit Note Reason must be selected.'];
    }

    // 3. Customer Tax Identification
    if (strpos($customerType, 'Registered') !== false) {
        if (empty($customerNtn)) {
            $errors[] = ['field' => 'customer_ntn', 'message' => 'Customer NTN is mandatory for Registered (Filer) buyers.'];
        }
    }

    // 4. Items & Quantity Checks
    $activeCount = 0;
    foreach ($items as $idx => $it) {
        $rowNum = $idx + 1;
        $cQty = floatval($it['credit_qty'] ?? 0);
        $remQty = floatval($it['remaining_qty'] ?? 0);

        if ($cQty > 0) {
            $activeCount++;
            if ($cQty > $remQty && $remQty > 0) {
                $errors[] = ['field' => "items_row_{$idx}_qty", 'message' => "Row #{$rowNum}: Credit quantity ({$cQty}) cannot exceed remaining eligible quantity ({$remQty})."];
            }
        }
    }

    if ($activeCount === 0) {
        $errors[] = ['field' => 'items', 'message' => 'Please specify credit quantity > 0 for at least one item.'];
    }

    $isValid = count($errors) === 0;

    // Update workflow status if saved in DB
    if ($cnId > 0) {
        $newStatus = $isValid ? 'Ready to Submit' : 'Pending Validation';
        $upd = $pdo->prepare("UPDATE fbr_digital_credit_notes SET workflow_status = ? WHERE id = ? AND company_id = ? AND workflow_status != 'Submitted'");
        $upd->execute([$newStatus, $cnId, $company_id]);
    }

    sendJson([
        'status' => 'success',
        'is_valid' => $isValid,
        'workflow_status' => $isValid ? 'Ready to Submit' : 'Pending Validation',
        'errors' => $errors,
        'warnings' => $warnings,
        'message' => $isValid 
            ? 'Credit Note passed all FBR validation checks and is Ready to Submit.' 
            : 'Validation identified ' . count($errors) . ' mandatory error(s) that must be resolved.'
    ]);
}

// =========================================================================
// ACTION: submit_to_fbr (Submit official Credit Note payload to FBR PRAL API)
// =========================================================================
if ($action === 'submit_to_fbr') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    $cnId = intval($data['id'] ?? 0);
    if ($cnId <= 0) {
        sendJson(['status' => 'error', 'message' => 'Credit Note ID is required. Please save the Credit Note first.'], 400);
    }

    try {
        // 1. Fetch Credit Note & Items
        $cnStmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_notes WHERE id = ? AND company_id = ?");
        $cnStmt->execute([$cnId, $company_id]);
        $cn = $cnStmt->fetch(PDO::FETCH_ASSOC);

        if (!$cn) {
            sendJson(['status' => 'error', 'message' => 'Credit Note not found in database.'], 404);
        }

        // Prevent Duplicate Submission!
        if ($cn['fbr_status'] === 'Submitted' && !empty($cn['fbr_credit_note_no'])) {
            sendJson([
                'status' => 'error',
                'message' => 'This Credit Note has ALREADY been successfully submitted to FBR! Official Ref: ' . $cn['fbr_credit_note_no'] . ' on ' . $cn['submission_timestamp'] . '. Duplicate submission was blocked.'
            ], 400);
        }

        // 2. Fetch API Settings
        $cfgStmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $cfgStmt->execute([$company_id]);
        $cfg = $cfgStmt->fetch(PDO::FETCH_ASSOC);

        if (!$cfg || empty($cfg['api_base_url'])) {
            sendJson(['status' => 'error', 'message' => 'FBR Digital Invoicing integration settings not configured for this company. Please configure API credentials in Integration Settings.'], 400);
        }

        $environment = strtolower($cfg['environment'] ?? 'sandbox');
        $rawToken = ($environment === 'production')
            ? (!empty($cfg['api_token_production']) ? $cfg['api_token_production'] : ($cfg['api_token'] ?? ''))
            : (!empty($cfg['api_token_sandbox']) ? $cfg['api_token_sandbox'] : ($cfg['api_token'] ?? ''));
        if (empty($rawToken)) {
            $rawToken = $cfg['api_token'] ?? ($cfg['api_token_sandbox'] ?? ($cfg['api_token_production'] ?? ''));
        }
        $apiToken = fbr_decrypt_token($rawToken);
        $endpoint = fbr_get_official_endpoint('post', $environment, $cfg['api_post_url'] ?? $cfg['api_base_url'] ?? '');
        $timeout = max(5, intval($cfg['request_timeout'] ?? 30));

        $posId = 100001;
        if (!empty($cfg['fbr_reg_ref']) && is_numeric($cfg['fbr_reg_ref'])) {
            $posId = intval($cfg['fbr_reg_ref']);
        } elseif (!empty($cfg['pos_id']) && is_numeric($cfg['pos_id'])) {
            $posId = intval($cfg['pos_id']);
        }

        // Fetch Company Profile for Seller Data
        $compStmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
        $compStmt->execute([$company_id]);
        $comp = $compStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        // 3. Fetch Items
        $itStmt = $pdo->prepare("SELECT * FROM fbr_digital_credit_note_items WHERE credit_note_id = ? AND credit_qty > 0 ORDER BY sort_order ASC, id ASC");
        $itStmt->execute([$cnId]);
        $items = $itStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($items)) {
            sendJson(['status' => 'error', 'message' => 'Credit Note has no active items with credit quantity.'], 400);
        }

        // 4. Build Official FBR/PRAL JSON Payload Schema
        $fbrItems = [];
        foreach ($items as $it) {
            $qty = floatval($it['credit_qty']);
            $saleVal = round(floatval($it['val_excl_tax']), 2);
            $taxRate = floatval($it['tax_rate']);
            $taxAmt = round(floatval($it['sales_tax_adjustment']), 2);
            $furAmt = round(floatval($it['further_tax_adjustment']), 2);
            $extAmt = round(floatval($it['extra_tax_adjustment'] ?? 0), 2);
            $fedAmt = round(floatval($it['fed_adjustment'] ?? 0), 2);
            $discAmt = round(floatval($it['discount_adjustment'] ?? 0), 2);
            $lineTotal = round($saleVal + $taxAmt + $furAmt + $extAmt + $fedAmt - $discAmt, 2);

            $pctCode = preg_replace('/[^0-9]/', '', $it['hs_code'] ?? '');
            if (empty($pctCode)) $pctCode = '00000000';
            if (strlen($pctCode) > 8) $pctCode = substr($pctCode, 0, 8);

            $fbrItems[] = [
                'ItemCode' => $it['item_code'] ?: ('ITM-' . $it['id']),
                'ItemName' => $it['item_name'],
                'PCTCode' => $pctCode,
                'Quantity' => $qty,
                'TaxRate' => $taxRate,
                'SaleValue' => $saleVal,
                'TotalAmount' => $lineTotal,
                'TaxCharged' => $taxAmt,
                'Discount' => $discAmt,
                'FurtherTax' => $furAmt,
                'InvoiceType' => 3 // Credit Note
            ];
        }

        $refUsin = !empty($cn['original_fbr_invoice_no']) ? $cn['original_fbr_invoice_no'] : $cn['original_invoice_no'];

        // Clean Buyer NTN & CNIC with Smart Auto-Detection (preserve alphanumeric NTN like G686755, A522103)
        $rawNtn = strtoupper(trim(preg_replace('/[^\w\-]/', '', (string)($cn['customer_ntn'] ?? ''))));
        $rawCnic = preg_replace('/[^0-9]/', '', (string)($cn['customer_cnic'] ?? ''));

        if (strlen($rawNtn) === 13 && ctype_digit($rawNtn) && empty($rawCnic)) {
            $rawCnic = $rawNtn;
            $rawNtn = '';
        } elseif ((strlen($rawCnic) >= 7 && strlen($rawCnic) <= 8) && empty($rawNtn)) {
            $rawNtn = $rawCnic;
            $rawCnic = '';
        }

        $baseNtn = (strpos($rawNtn, '-') !== false) ? explode('-', $rawNtn)[0] : $rawNtn;
        $cleanNtn = (strlen($baseNtn) >= 7 && strlen($baseNtn) <= 8) ? $baseNtn : (strlen(str_replace('-', '', $rawNtn)) >= 7 && strlen(str_replace('-', '', $rawNtn)) <= 8 ? str_replace('-', '', $rawNtn) : $rawNtn);

        $cleanCnic = '';
        if (strlen($rawCnic) === 13) {
            $cleanCnic = substr($rawCnic, 0, 5) . '-' . substr($rawCnic, 5, 7) . '-' . substr($rawCnic, 12, 1);
        } elseif (!empty($rawCnic)) {
            $cleanCnic = $rawCnic;
        }

        $isPralDi = (stripos($endpoint, 'di_data') !== false || stripos($endpoint, 'postinvoicedata') !== false || stripos($cfg['provider'] ?? '', 'PRAL') !== false);

        if ($isPralDi) {
            $isRegistered = (strpos($cn['customer_type'] ?? '', 'Registered') !== false);
            $buyerRegType = $isRegistered ? 'Registered' : 'Unregistered';
            $buyerNtnCnic = !empty($cleanNtn) ? $cleanNtn : (!empty($rawCnic) ? $rawCnic : ($isRegistered ? '9999999' : '1111111111111'));

            // Resolve Seller Registration Number strictly as 7-character NTN (e.g. A522103 or 5221034) or 13-digit CNIC/STRN
            $cleanInputNtn = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)($comp['ntn'] ?? ''))));
            $sellerNtn = '';
            if (strlen($cleanInputNtn) === 13) {
                $sellerNtn = $cleanInputNtn;
            } elseif (strlen($cleanInputNtn) === 8) {
                $sellerNtn = substr($cleanInputNtn, 0, 7);
            } elseif (strlen($cleanInputNtn) === 7) {
                $sellerNtn = $cleanInputNtn;
            } elseif (strlen($cleanInputNtn) === 6 && ctype_digit($cleanInputNtn)) {
                $sellerNtn = '0' . $cleanInputNtn;
            } elseif (strlen($cleanInputNtn) > 7 && strlen($cleanInputNtn) < 13) {
                $sellerNtn = substr($cleanInputNtn, 0, 7);
            } else {
                $sellerNtn = $cleanInputNtn;
            }

            if ((strlen($sellerNtn) !== 7 && strlen($sellerNtn) !== 13) && !empty($comp['gst'] ?? ($comp['gst_reg_no'] ?? ''))) {
                $cleanGst = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)($comp['gst'] ?? ($comp['gst_reg_no'] ?? '')))));
                if (strlen($cleanGst) === 7 || strlen($cleanGst) === 13) {
                    $sellerNtn = $cleanGst;
                }
            }
            if ((strlen($sellerNtn) !== 7 && strlen($sellerNtn) !== 13) && !empty($cfg['fbr_reg_ref'])) {
                $cleanRef = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)$cfg['fbr_reg_ref'])));
                if (strlen($cleanRef) === 7 || strlen($cleanRef) === 13) {
                    $sellerNtn = $cleanRef;
                }
            }

            if (empty($sellerNtn) || (strlen($sellerNtn) !== 7 && strlen($sellerNtn) !== 13)) {
                sendJson([
                    'status' => 'error',
                    'message' => 'Seller NTN / CNIC is missing or invalid in Company Profile. FBR strictly requires a 7-character NTN (e.g. A522103 or 5221034) or 13-digit CNIC matching your IRIS Bearer Token. Current value: "' . ($comp['ntn'] ?? '') . '". Please update the company NTN under Company Profile or Digital Invoice Settings (Taxpayer Details).'
                ], 400);
            }

            $pralItems = [];
            foreach ($items as $it) {
                $qty = floatval($it['credit_qty']);
                $saleVal = round(floatval($it['val_excl_tax']), 2);
                $taxRate = floatval($it['tax_rate']);
                $taxAmt = round(floatval($it['sales_tax_adjustment']), 2);
                $furAmt = round(floatval($it['further_tax_adjustment']), 2);
                $extAmt = round(floatval($it['extra_tax_adjustment'] ?? 0), 2);
                $fedAmt = round(floatval($it['fed_adjustment'] ?? 0), 2);
                $discAmt = round(floatval($it['discount_adjustment'] ?? 0), 2);
                $lineTotal = round($saleVal + $taxAmt + $furAmt + $extAmt + $fedAmt - $discAmt, 2);

                $rawHs = preg_replace('/[^0-9]/', '', $it['hs_code'] ?? '');
                $hsCodeFormatted = (strlen($rawHs) >= 8) ? (substr($rawHs, 0, 4) . '.' . substr($rawHs, 4, 4)) : ($it['hs_code'] ?: '0101.2100');
                $cleanDesc = trim(str_replace(['"', "'", "\\"], '', $it['item_name'] ?? ''));

                    $rawCnUom = trim($it['uom'] ?? '');
                    $cnUom = preg_match('/^kg/i', $rawCnUom) ? 'KG' : (!empty($rawCnUom) ? $rawCnUom : 'KG');
                    $pralItems[] = [
                        'hsCode' => $hsCodeFormatted,
                        'productDescription' => $cleanDesc ?: 'Credit Note Item',
                        'rate' => rtrim(rtrim(number_format($taxRate, 2, '.', ''), '0'), '.') . '%',
                        'uoM' => $cnUom,
                    'quantity' => $qty,
                    'totalValues' => $lineTotal,
                    'valueSalesExcludingST' => $saleVal,
                    'fixedNotifiedValueOrRetailPrice' => 0.0,
                    'salesTaxApplicable' => $taxAmt,
                    'salesTaxWithheldAtSource' => 0.0,
                    'extraTax' => $extAmt > 0 ? $extAmt : '',
                    'furtherTax' => $furAmt,
                    'sroScheduleNo' => '',
                    'fedPayable' => $fedAmt,
                    'discount' => $discAmt,
                    'saleType' => 'Goods at standard rate (default)',
                    'sroItemSerialNo' => ''
                ];
            }

            $fbrPayload = [
                'invoiceType' => 'Credit Note',
                'invoiceDate' => date('Y-m-d', strtotime($cn['credit_note_date'])),
                'sellerBusinessName' => !empty($comp['name']) ? $comp['name'] : 'SoftifyX Enterprise',
                'sellerProvince' => fbr_normalize_province_name($comp['province'] ?? 'Khyber Pakhtunkhwa', 'Khyber Pakhtunkhwa'),
                'sellerNTNCNIC' => $sellerNtn,
                'sellerAddress' => !empty($comp['address']) ? $comp['address'] : 'Pakistan',
                'buyerNTNCNIC' => $buyerNtnCnic,
                'buyerBusinessName' => (!empty($cn['business_name']) ? $cn['business_name'] : $cn['customer_name']),
                'buyerProvince' => fbr_normalize_province_name($cn['customer_province'] ?? 'Khyber Pakhtunkhwa', 'Khyber Pakhtunkhwa'),
                'buyerAddress' => $cn['customer_address'] ?: 'Pakistan',
                'invoiceRefNo' => $refUsin,
                'buyerRegistrationType' => $buyerRegType,
                'items' => $pralItems
            ];
            if ($environment === 'sandbox') {
                $fbrPayload['scenarioId'] = 'SN006';
            }
        } else {
            $fbrPayload = [
                'InvoiceNumber' => '',
                'POSID' => intval($posId),
                'USIN' => $cn['credit_note_no'],
                'DateTime' => date('Y-m-d H:i:s', strtotime($cn['credit_note_date'] . ' ' . date('H:i:s'))),
                'BuyerNTN' => $cleanNtn,
                'BuyerCNIC' => $cleanCnic,
                'BuyerName' => (!empty($cn['business_name']) ? $cn['business_name'] : $cn['customer_name']),
                'BuyerPhoneNumber' => preg_replace('/[^0-9]/', '', $cn['customer_phone'] ?? '') ?: '',
                'BuyerAddress' => $cn['customer_address'] ?: '',
                'BuyerType' => (strpos($cn['customer_type'] ?? '', 'Registered') !== false) ? 1 : 2,
                'TotalQuantity' => floatval($cn['total_credit_qty']),
                'TotalSaleValue' => floatval($cn['taxable_credit_amount']),
                'TotalTaxCharged' => floatval($cn['sales_tax_adjustment']),
                'FurtherTax' => floatval($cn['further_tax_adjustment']),
                'TotalBillAmount' => floatval($cn['total_credit_amount']),
                'PaymentMode' => 1,
                'InvoiceType' => 3, // Credit Note
                'RefUSIN' => $refUsin,
                'Reason' => $cn['reason_text'] . (!empty($cn['remarks']) ? ' - ' . $cn['remarks'] : ''),
                'Items' => $fbrItems
            ];
        }

        $payloadJson = json_encode($fbrPayload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        // Mark as Submission Pending
        $pdo->prepare("UPDATE fbr_digital_credit_notes SET workflow_status = 'Submission Pending' WHERE id = ?")->execute([$cnId]);

        // 5. Send cURL request via shared client
        $res = fbr_api_request($endpoint, 'POST', $fbrPayload, $apiToken, $timeout);
        $durationMs = $res['duration_ms'];
        $httpCode = $res['http_code'];
        $curlError = $res['curl_error'];
        $rawResponse = $res['body'];

        $parsed = fbr_parse_api_response($res);
        $timestamp = date('Y-m-d H:i:s');
        $isSuccess = $parsed['is_success'];
        $fbrRef = $parsed['invoice_no'] ?: ($cn['credit_note_no']);
        $qrCode = $parsed['qr_code'];
        $respCode = strval($res['http_code']);
        $respMsg = $parsed['message'];

        if ($isSuccess) {
            $fbrStatus = 'Submitted';
            $workflowStatus = 'Confirmed';
        } elseif ($res['timed_out']) {
            $fbrStatus = 'Pending Verification';
            $workflowStatus = 'Submission Pending';
            $respMsg = 'Connection timed out. Marked Pending Verification to avoid duplicate submission.';
        } else {
            $fbrStatus = ($httpCode === 0) ? 'Failed' : 'Rejected';
            $workflowStatus = 'Ready to Submit';
        }

        // 6. Update Credit Note in Database
        $upStmt = $pdo->prepare("
            UPDATE fbr_digital_credit_notes SET
                workflow_status = ?,
                fbr_status = ?,
                fbr_credit_note_no = COALESCE(?, fbr_credit_note_no),
                fbr_qr_code = COALESCE(?, fbr_qr_code),
                fbr_response_code = ?,
                fbr_response_msg = ?,
                fbr_raw_response = ?,
                fbr_payload_sent = ?,
                submission_timestamp = COALESCE(submission_timestamp, ?),
                last_status_check = ?
            WHERE id = ? AND company_id = ?
        ");
        $upStmt->execute([
            $workflowStatus, $fbrStatus, $fbrRef, $qrCode,
            $respCode, $respMsg, $rawResponse, $payloadJson,
            ($isSuccess ? $timestamp : null), $timestamp,
            $cnId, $company_id
        ]);

        // 7. Audit Log
        try {
            $logStmt = $pdo->prepare("
                INSERT INTO digital_invoice_logs (
                    company_id, log_level, action, invoice_id, invoice_no,
                    request_endpoint, http_status, request_payload, response_payload,
                    execution_time_ms, message
                ) VALUES (?, ?, 'SUBMIT_CREDIT_NOTE', ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $logStmt->execute([
                $company_id,
                ($isSuccess ? 'INFO' : 'ERROR'),
                $cnId,
                $cn['credit_note_no'],
                $endpoint,
                $httpCode ?: 0,
                $payloadJson,
                $rawResponse,
                $durationMs,
                $respMsg
            ]);

            // Dual-log into fbr_integration_logs
            $attStmt = $pdo->prepare("SELECT COUNT(*) FROM fbr_integration_logs WHERE company_id = ? AND erp_doc_no = ?");
            $attStmt->execute([$company_id, $cn['credit_note_no']]);
            $attemptNo = intval($attStmt->fetchColumn()) + 1;

            $fbrLogStmt = $pdo->prepare("
                INSERT INTO fbr_integration_logs (
                    company_id, document_type, erp_doc_id, erp_doc_no, fbr_invoice_no,
                    operation_type, attempt_number, api_endpoint, http_method,
                    http_status_code, fbr_response_code, response_message, validation_errors,
                    request_payload, response_payload, processing_time_ms, status,
                    request_timestamp, response_timestamp
                ) VALUES (
                    ?, 'Credit Note', ?, ?, ?,
                    'Credit Note Submission', ?, ?, 'POST',
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    NOW(), NOW()
                )
            ");
            $fbrLogStmt->execute([
                $company_id,
                $cnId,
                $cn['credit_note_no'],
                $fbrRef ?: null,
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
            'is_submitted' => $isSuccess,
            'fbr_status' => $fbrStatus,
            'fbr_credit_note_no' => $fbrRef,
            'fbr_response_code' => $respCode,
            'fbr_response_msg' => $respMsg,
            'http_code' => $httpCode,
            'message' => $isSuccess 
                ? "Credit Note successfully submitted to FBR! Official Reference: {$fbrRef}"
                : "FBR submission failed: {$respMsg}"
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => 'Submission execution error: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: search_credit_notes (Browse / Find saved credit notes modal)
// =========================================================================
if ($action === 'search_credit_notes') {
    try {
        $query = trim($_GET['q'] ?? '');
        $sql = "
            SELECT 
                id, serial_no, credit_note_no, credit_note_date,
                original_invoice_no, original_invoice_date,
                customer_name, total_credit_amount,
                workflow_status, fbr_status, fbr_credit_note_no,
                reason_text, submission_timestamp, created_at
            FROM fbr_digital_credit_notes
            WHERE company_id = ?
        ";
        $params = [$company_id];

        if (!empty($query)) {
            $sql .= " AND (credit_note_no LIKE ? OR original_invoice_no LIKE ? OR customer_name LIKE ? OR fbr_credit_note_no LIKE ?)";
            $wild = "%$query%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }

        $sql .= " ORDER BY serial_no DESC LIMIT 150";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        sendJson(['status' => 'success', 'credit_notes' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// Fallback for unknown action
sendJson(['status' => 'error', 'message' => 'Action [' . htmlspecialchars($action) . '] is not supported.'], 400);
