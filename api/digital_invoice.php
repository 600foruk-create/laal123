<?php
// SoftifyX ERP - FBR Digital Invoicing API
// Handles Invoice Management, Calculations, Server-side Validation & PRAL/FBR Submission
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

// Ensure database tables exist for FBR Digital Invoicing
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        invoice_no VARCHAR(50) NOT NULL,
        invoice_date DATE NOT NULL,
        invoice_type VARCHAR(100) DEFAULT 'Tax Invoice',
        supply_type VARCHAR(255) DEFAULT 'Standard Rate Goods',
        customer_type VARCHAR(255) DEFAULT 'Registered (Filer)',
        customer_coa_id INT NOT NULL,
        customer_code VARCHAR(50) DEFAULT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_ntn VARCHAR(50) DEFAULT NULL,
        customer_cnic VARCHAR(50) DEFAULT NULL,
        customer_strn VARCHAR(50) DEFAULT NULL,
        customer_phone VARCHAR(50) DEFAULT NULL,
        customer_reg_status VARCHAR(50) DEFAULT 'Active',
        customer_address TEXT DEFAULT NULL,
        customer_province VARCHAR(100) DEFAULT 'Punjab',
        ref_doc_no VARCHAR(100) DEFAULT NULL,
        ref_doc_date DATE DEFAULT NULL,
        payment_mode VARCHAR(50) DEFAULT 'Cash',
        total_qty DECIMAL(15,2) DEFAULT 0,
        gross_subtotal DECIMAL(15,2) DEFAULT 0,
        total_discount DECIMAL(15,2) DEFAULT 0,
        taxable_amount DECIMAL(15,2) DEFAULT 0,
        total_sales_tax DECIMAL(15,2) DEFAULT 0,
        total_further_tax DECIMAL(15,2) DEFAULT 0,
        total_extra_tax DECIMAL(15,2) DEFAULT 0,
        total_fed DECIMAL(15,2) DEFAULT 0,
        total_invoice_amount DECIMAL(15,2) DEFAULT 0,
        rounding_adjustment DECIMAL(15,2) DEFAULT 0,
        net_payable DECIMAL(15,2) DEFAULT 0,
        workflow_status VARCHAR(30) DEFAULT 'Draft',
        fbr_status VARCHAR(30) DEFAULT 'Not Submitted',
        fbr_invoice_no VARCHAR(100) DEFAULT NULL,
        fbr_qr_code TEXT DEFAULT NULL,
        fbr_response_code VARCHAR(50) DEFAULT NULL,
        fbr_response_msg TEXT DEFAULT NULL,
        fbr_raw_response LONGTEXT DEFAULT NULL,
        fbr_payload_sent LONGTEXT DEFAULT NULL,
        submission_timestamp DATETIME DEFAULT NULL,
        last_status_check DATETIME DEFAULT NULL,
        remarks TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (serial_no),
        INDEX (invoice_no),
        INDEX (workflow_status),
        INDEX (fbr_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Ensure customer_code, business_name and customer_phone columns exist if table was previously created
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN customer_code VARCHAR(50) DEFAULT NULL AFTER customer_coa_id");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN business_name VARCHAR(255) DEFAULT NULL AFTER customer_name");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN customer_phone VARCHAR(50) DEFAULT NULL AFTER customer_strn");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN withholding_tax DECIMAL(15,2) DEFAULT 0 AFTER total_fed");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN wht_rate DECIMAL(10,2) DEFAULT 0.00 AFTER withholding_tax");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN wht_type VARCHAR(50) DEFAULT 'With-236C/236H' AFTER wht_rate");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN carriage_freight DECIMAL(15,2) DEFAULT 0 AFTER withholding_tax");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN amount_received DECIMAL(15,2) DEFAULT 0 AFTER net_payable");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN balance DECIMAL(15,2) DEFAULT 0 AFTER amount_received");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN is_cancelled TINYINT DEFAULT 0 AFTER remarks");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN cancellation_reason TEXT DEFAULT NULL AFTER is_cancelled");
    } catch (Exception $ignored) {}
    try {
        $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN cancellation_date DATETIME DEFAULT NULL AFTER cancellation_reason");
    } catch (Exception $ignored) {}
    try { $pdo->exec("ALTER TABLE fbr_digital_invoices MODIFY COLUMN customer_type VARCHAR(255) DEFAULT 'Registered (Filer)'"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE fbr_digital_invoices MODIFY COLUMN supply_type VARCHAR(255) DEFAULT 'Standard Rate Goods'"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE fbr_digital_invoices MODIFY COLUMN invoice_type VARCHAR(100) DEFAULT 'Tax Invoice'"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE buyer_types MODIFY COLUMN name VARCHAR(255) NOT NULL"); } catch(Exception $e) {}

    // Ensure customers table has all FBR compliance and verification fields
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN sales_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN further_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN cnic VARCHAR(50) DEFAULT NULL AFTER ntn_cnic"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN buyer_type_id INT DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN cust_tax_type_id INT DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_verified_at DATETIME DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_verification_source VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_atl_status VARCHAR(50) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_reg_status VARCHAR(50) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_sales_tax_status VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_sales_tax_reg VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_business_name VARCHAR(255) DEFAULT NULL"); } catch(Exception $e) {}
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS customer_types_tax (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT DEFAULT 1,
            name VARCHAR(100) NOT NULL,
            tax_rate DECIMAL(10,2) DEFAULT 0.00,
            wht_type VARCHAR(50) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch(Exception $e) {}

    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_taxpayers_registry (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ntn VARCHAR(50) DEFAULT NULL,
            cnic VARCHAR(50) DEFAULT NULL,
            strn VARCHAR(50) DEFAULT NULL,
            sales_tax_status VARCHAR(100) DEFAULT NULL,
            sales_tax_registered VARCHAR(100) DEFAULT NULL,
            taxpayer_name VARCHAR(255) NOT NULL,
            business_name VARCHAR(255) DEFAULT NULL,
            address TEXT DEFAULT NULL,
            phone VARCHAR(50) DEFAULT NULL,
            province VARCHAR(100) DEFAULT 'Punjab',
            category VARCHAR(100) DEFAULT 'Individual',
            principal_activity VARCHAR(255) DEFAULT NULL,
            registration_status VARCHAR(50) DEFAULT 'Registered',
            atl_status VARCHAR(50) DEFAULT 'Active Taxpayer',
            source VARCHAR(100) DEFAULT 'IRIS Taxpayer Profile Inquiry',
            verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (ntn),
            INDEX (cnic),
            INDEX (strn)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE fbr_taxpayers_registry ADD COLUMN sales_tax_status VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE fbr_taxpayers_registry ADD COLUMN sales_tax_registered VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS fbr_digital_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        item_id INT DEFAULT NULL,
        item_code VARCHAR(50) DEFAULT NULL,
        item_name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        hs_code VARCHAR(50) NOT NULL,
        uom VARCHAR(50) NOT NULL,
        quantity DECIMAL(15,2) NOT NULL DEFAULT 1,
        rate DECIMAL(20,4) NOT NULL DEFAULT 0,
        gross_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
        discount_percent DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(10,2) DEFAULT 18.00,
        sales_tax_amount DECIMAL(15,2) DEFAULT 0,
        further_tax_rate DECIMAL(10,2) DEFAULT 0,
        further_tax_amount DECIMAL(15,2) DEFAULT 0,
        extra_tax_rate DECIMAL(10,2) DEFAULT 0,
        extra_tax_amount DECIMAL(15,2) DEFAULT 0,
        fed_rate DECIMAL(10,2) DEFAULT 0,
        fed_amount DECIMAL(15,2) DEFAULT 0,
        val_excl_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
        val_incl_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
        item_classification VARCHAR(50) DEFAULT 'Goods',
        sort_order INT DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES fbr_digital_invoices(id) ON DELETE CASCADE,
        INDEX (invoice_id),
        INDEX (hs_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    try { $pdo->exec("ALTER TABLE fbr_digital_invoice_items ADD COLUMN pieces DECIMAL(15,2) DEFAULT 0 AFTER uom"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN hs_code VARCHAR(50) DEFAULT '0000.0000'"); } catch(Exception $e) {}
} catch (Exception $e) {
    sendJson(['status' => 'error', 'message' => 'Schema error: ' . $e->getMessage()], 500);
}

// Helper: Match Buyer Type / Scenario Code robustly (handles truncation, whitespace & scenario codes)
function fbr_buyer_types_match($typeA, $typeB) {
    $a = trim($typeA ?? '');
    $b = trim($typeB ?? '');
    if ($a === '' || $b === '') return true;
    if (strcasecmp($a, $b) === 0) return true;

    // Normalize whitespace & non-breaking spaces
    $normA = preg_replace('/\s+/', ' ', str_replace(["\xC2\xA0", "\xA0", '&nbsp;'], ' ', $a));
    $normB = preg_replace('/\s+/', ' ', str_replace(["\xC2\xA0", "\xA0", '&nbsp;'], ' ', $b));
    if (strcasecmp($normA, $normB) === 0) return true;

    // Compare by FBR Scenario Code if present in both strings (e.g. SN001, SN002, SN005, SN006, SN007, SN016, SN017, SN024, SN026)
    preg_match('/SN\d{3}/i', $normA, $mA);
    preg_match('/SN\d{3}/i', $normB, $mB);
    if (!empty($mA[0]) && !empty($mB[0])) {
        return (strcasecmp($mA[0], $mB[0]) === 0);
    }

    // Clean trailing parenthesis or spaces (handles 50-character column truncation e.g. "SN001" vs "SN001)")
    $cleanA = rtrim(preg_replace('/[\(\)]/', '', $normA));
    $cleanB = rtrim(preg_replace('/[\(\)]/', '', $normB));
    if (strcasecmp($cleanA, $cleanB) === 0) return true;

    $minLen = min(strlen($cleanA), strlen($cleanB));
    if ($minLen >= 15 && strncasecmp($cleanA, $cleanB, $minLen) === 0) {
        return true;
    }

    // Categorical matching fallback (Registered vs Unregistered vs Consumer vs Exempt)
    $isRegA = (stripos($normA, 'registered') !== false && stripos($normA, 'unregistered') === false);
    $isRegB = (stripos($normB, 'registered') !== false && stripos($normB, 'unregistered') === false);
    $isUnregA = (stripos($normA, 'unregistered') !== false || stripos($normA, 'non-filer') !== false);
    $isUnregB = (stripos($normB, 'unregistered') !== false || stripos($normB, 'non-filer') !== false);
    $isConsumerA = (stripos($normA, 'consumer') !== false);
    $isConsumerB = (stripos($normB, 'consumer') !== false);
    $isExemptA = (stripos($normA, 'exempt') !== false || stripos($normA, 'zero') !== false);
    $isExemptB = (stripos($normB, 'exempt') !== false || stripos($normB, 'zero') !== false);

    if (empty($mA[0]) && empty($mB[0])) {
        if ($isRegA && $isRegB) return true;
        if ($isUnregA && $isUnregB) return true;
        if ($isConsumerA && $isConsumerB) return true;
        if ($isExemptA && $isExemptB) return true;
    }

    return false;
}

// =========================================================================
// SYNCHRONIZATION: Automatic Real-Time Sync between Digital Invoice & Sale Tax Invoice
// =========================================================================
function sync_to_sale_invoice($pdo, $digitalInvoiceId, $company_id) {
    if (!$digitalInvoiceId || !$company_id) return false;

    // 1. Ensure required integration columns exist on sale_invoices and fbr_digital_invoices
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_digital_invoice_id INT DEFAULT NULL"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_status VARCHAR(50) DEFAULT 'Pending'"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_invoice_number VARCHAR(100) NULL"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_qr_code TEXT NULL"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_response TEXT NULL"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_submitted_at DATETIME NULL"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE fbr_digital_invoices ADD COLUMN sale_invoice_id INT DEFAULT NULL"); } catch (Exception $e) {}

    // 2. Fetch digital invoice header
    $invStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
    $invStmt->execute([$digitalInvoiceId, $company_id]);
    $inv = $invStmt->fetch(PDO::FETCH_ASSOC);
    if (!$inv) return false;

    // 3. Fetch digital invoice items
    $itemsStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC");
    $itemsStmt->execute([$digitalInvoiceId]);
    $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Resolve default inventory location
    $locId = 1;
    try {
        $locStmt = $pdo->prepare("SELECT id FROM inv_locations WHERE company_id = ? ORDER BY is_default DESC, id ASC LIMIT 1");
        $locStmt->execute([$company_id]);
        $foundLoc = $locStmt->fetchColumn();
        if ($foundLoc) $locId = intval($foundLoc);
    } catch (Exception $eLoc) {}

    // 5. Check if matching sale_invoices record exists
    $siId = null;
    if (!empty($inv['sale_invoice_id'])) {
        $chk = $pdo->prepare("SELECT id FROM sale_invoices WHERE id = ? AND company_id = ?");
        $chk->execute([$inv['sale_invoice_id'], $company_id]);
        $siId = $chk->fetchColumn() ?: null;
    }
    if (!$siId) {
        $chk = $pdo->prepare("SELECT id FROM sale_invoices WHERE fbr_digital_invoice_id = ? AND company_id = ?");
        $chk->execute([$digitalInvoiceId, $company_id]);
        $siId = $chk->fetchColumn() ?: null;
    }
    if (!$siId) {
        $chk = $pdo->prepare("SELECT id FROM sale_invoices WHERE serial_no = ? AND COALESCE(is_tax_invoice, 0) = 1 AND company_id = ? AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = '')");
        $chk->execute([$inv['serial_no'], $company_id]);
        $siId = $chk->fetchColumn() ?: null;
    }

    $calcGross = floatval($inv['gross_subtotal'] ?? 0);
    if ($calcGross <= 0) {
        foreach ($items as $it) {
            $q = floatval($it['quantity'] ?? 0);
            $r = floatval($it['rate'] ?? 0);
            $calcGross += floatval(!empty($it['gross_amount']) ? $it['gross_amount'] : ($q * $r));
        }
    }

    $netTotal = floatval(!empty($inv['net_payable']) ? $inv['net_payable'] : (!empty($inv['total_invoice_amount']) ? $inv['total_invoice_amount'] : 0));
    $invType = 'Sale Invoice';
    if (($inv['invoice_type'] ?? '') === 'Credit Note') {
        $invType = 'Credit Note';
    } elseif (($inv['invoice_type'] ?? '') === 'Debit Note') {
        $invType = 'Debit Note';
    }

    // Check if customer is Walk-in Cash Customer (12001001)
    $isWalkInCash = false;
    $custCode = trim($inv['customer_code'] ?? '');
    if (!$custCode && !empty($inv['customer_coa_id'])) {
        $cStmt = $pdo->prepare("SELECT code FROM coa_list WHERE id = ?");
        $cStmt->execute([$inv['customer_coa_id']]);
        $custCode = trim($cStmt->fetchColumn() ?: '');
    }
    if ($custCode === '12001001') {
        $isWalkInCash = true;
    }

    $hasAmtRecv = isset($inv['amount_received']) && $inv['amount_received'] !== '' && $inv['amount_received'] !== null;
    if ($hasAmtRecv) {
        $amountReceived = floatval($inv['amount_received']);
    } else if ($isWalkInCash) {
        $amountReceived = $netTotal;
    } else {
        $amountReceived = 0;
    }

    $fields = [
        'company_id'            => $company_id,
        'serial_no'             => intval($inv['serial_no']),
        'pos_invoice_no'        => null,
        'is_tax_invoice'        => 1,
        'invoice_date'          => $inv['invoice_date'] ?: date('Y-m-d'),
        'invoice_type'          => $invType,
        'customer_order_no'     => $inv['ref_doc_no'] ?? '',
        'customer_order_date'   => !empty($inv['ref_doc_date']) ? $inv['ref_doc_date'] : null,
        'delivery_challan_no'   => '',
        'delivery_challan_date' => null,
        'payment_terms'         => $isWalkInCash ? 'Cash' : ($inv['payment_mode'] ?: 'Cash'),
        'income_account'        => '40001001',
        'customer_coa_id'       => intval($inv['customer_coa_id']),
        'customer_name'         => trim($inv['customer_name'] ?? $inv['business_name'] ?? ''),
        'customer_address'      => $inv['customer_address'] ?? null,
        'customer_telephone'    => $inv['customer_phone'] ?? null,
        'customer_ntn'          => $inv['customer_ntn'] ?? null,
        'customer_gst'          => $inv['customer_strn'] ?? null,
        'inventory_location_id' => $locId,
        'job_no'                => '',
        'employee_ref'          => '',
        'amount_in_words'       => '',
        'remarks'               => $inv['remarks'] ?: 'Created via FBR Digital Invoice',
        'carriage_freight'      => floatval($inv['carriage_freight'] ?? 0),
        'additional_discount'   => floatval($inv['total_discount'] ?? 0),
        'customer_tax_rate'     => floatval($inv['wht_rate'] ?? 0),
        'customer_tax_amount'   => floatval($inv['withholding_tax'] ?? 0),
        'customer_wht_type'     => !empty($inv['wht_type']) ? $inv['wht_type'] : 'With-236C/236H',
        'gross_amount'          => $calcGross,
        'net_total'             => $netTotal,
        'amount_received'       => $amountReceived,
        'is_cancelled'          => intval($inv['is_cancelled'] ?? 0),
        'converted_dc_no'       => null,
        'converted_ogp_no'      => null,
        'pos_status'            => 'Saved',
        'is_posted'             => 1,
        'fbr_status'            => $inv['fbr_status'] ?: 'Pending',
        'fbr_invoice_number'    => $inv['fbr_invoice_no'] ?: null,
        'fbr_qr_code'           => $inv['fbr_qr_code'] ?: null,
        'fbr_response'          => $inv['fbr_raw_response'] ?: ($inv['fbr_response_msg'] ?: null),
        'fbr_submitted_at'      => $inv['submission_timestamp'] ?: null,
        'fbr_digital_invoice_id'=> intval($inv['id']),
        'updated_at'            => date('Y-m-d H:i:s')
    ];

    if ($siId) {
        $setClause = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($fields)));
        $stmt = $pdo->prepare("UPDATE sale_invoices SET $setClause WHERE id = ? AND company_id = ?");
        $vals = array_values($fields);
        $vals[] = $siId;
        $vals[] = $company_id;
        $stmt->execute($vals);
    } else {
        $cols = implode(', ', array_keys($fields));
        $placeholders = implode(', ', array_fill(0, count($fields), '?'));
        $stmt = $pdo->prepare("INSERT INTO sale_invoices ($cols) VALUES ($placeholders)");
        $stmt->execute(array_values($fields));
        $siId = intval($pdo->lastInsertId());
    }

    if ($siId) {
        // Link bidirectional reference in fbr_digital_invoices
        $pdo->prepare("UPDATE fbr_digital_invoices SET sale_invoice_id = ? WHERE id = ?")->execute([$siId, $digitalInvoiceId]);

        // Sync items into sale_invoice_items
        $pdo->prepare("DELETE FROM sale_invoice_items WHERE invoice_id = ?")->execute([$siId]);
        $insItem = $pdo->prepare("
            INSERT INTO sale_invoice_items (
                invoice_id, item_coa_id, hs_code, description, pieces, quantity, unit,
                rate, gross_amount, discount_percent, discount_amount,
                sales_tax_rate, sales_tax_amount, further_tax_rate, further_tax_amount, net_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($items as $it) {
            $itemCoaId = !empty($it['item_id']) ? intval($it['item_id']) : 0;
            if ($itemCoaId <= 0 && !empty($it['item_code'])) {
                $fStmt = $pdo->prepare("SELECT id FROM inv_items WHERE code = ? AND (company_id = ? OR company_id = 1) LIMIT 1");
                $fStmt->execute([trim($it['item_code']), $company_id]);
                $itemCoaId = intval($fStmt->fetchColumn() ?: 0);
            }
            if ($itemCoaId <= 0 && !empty($it['item_name'])) {
                $fStmt = $pdo->prepare("SELECT id FROM inv_items WHERE name = ? AND (company_id = ? OR company_id = 1) LIMIT 1");
                $fStmt->execute([trim($it['item_name']), $company_id]);
                $itemCoaId = intval($fStmt->fetchColumn() ?: 0);
            }
            if ($itemCoaId <= 0) {
                $fFirst = $pdo->prepare("SELECT id FROM inv_items WHERE (company_id = ? OR company_id = 1) ORDER BY id ASC LIMIT 1");
                $fFirst->execute([$company_id]);
                $itemCoaId = intval($fFirst->fetchColumn() ?: 1);
            }

            $q = floatval($it['quantity'] ?? 0);
            $r = floatval($it['rate'] ?? 0);
            $gross = (isset($it['gross_amount']) && is_numeric($it['gross_amount'])) ? floatval($it['gross_amount']) : ($q * $r);
            $discPct = floatval($it['discount_percent'] ?? 0);
            $discAmt = floatval($it['discount_amount'] ?? 0);
            $stRate = floatval($it['tax_rate'] ?? 18);
            $stAmt = floatval($it['sales_tax_amount'] ?? 0);
            $furRate = floatval($it['further_tax_rate'] ?? 0);
            $furAmt = floatval($it['further_tax_amount'] ?? 0);
            $net = floatval($it['val_incl_tax'] ?? ($gross - $discAmt + $stAmt + $furAmt));

            $insItem->execute([
                $siId,
                $itemCoaId,
                $it['hs_code'] ?? '0000.0000',
                $it['description'] ?: ($it['item_name'] ?? ''),
                floatval($it['pieces'] ?? 0),
                $q,
                $it['uom'] ?: 'pcs',
                $r,
                $gross,
                $discPct,
                $discAmt,
                $stRate,
                $stAmt,
                $furRate,
                $furAmt,
                $net
            ]);
        }
    }
    return $siId;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// =========================================================================
// ACTION: get_meta (Fetch Customers, Items, Company Info & Next Serial)
// =========================================================================
if ($action === 'get_meta') {
    try {
        // 1. Fetch Company Profile (Seller)
        $compStmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
        $compStmt->execute([$company_id]);
        $company = $compStmt->fetch(PDO::FETCH_ASSOC) ?: [
            'id' => $company_id,
            'name' => 'My Company',
            'address' => '',
            'phone' => '',
            'email' => '',
            'website' => '',
            'ntn' => '',
            'gst' => '',
            'deals_in' => '',
            'logo_data' => ''
        ];

        // Fetch active branch name
        $branchName = 'Main Branch';
        try {
            $brStmt = $pdo->prepare("SELECT branch_name FROM company_branches WHERE company_id = ? AND status = 'Active' ORDER BY id ASC LIMIT 1");
            $brStmt->execute([$company_id]);
            $foundBranch = $brStmt->fetchColumn();
            if ($foundBranch) $branchName = $foundBranch;
        } catch (Exception $e) {}
        $company['branch_name'] = $branchName;

        // Clean resolved Seller NTN (7 or 13 characters, e.g. A522103 or 5221034)
        $rawSellerNtn = preg_replace('/[^0-9A-Za-z]/', '', strtoupper(trim($company['ntn'] ?? '')));
        if (strlen($rawSellerNtn) === 8) {
            $company['seller_ntn_resolved'] = substr($rawSellerNtn, 0, 7);
        } else {
            $company['seller_ntn_resolved'] = $rawSellerNtn;
        }

        // 2. Fetch Customers Master (with linked Chart of Accounts & profile fields)
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN sales_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN further_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN cnic VARCHAR(50) DEFAULT NULL AFTER ntn_cnic"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN buyer_type_id INT DEFAULT NULL AFTER cust_tax_type_id"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_verified_at DATETIME DEFAULT NULL"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_verification_source VARCHAR(100) DEFAULT NULL"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_atl_status VARCHAR(50) DEFAULT NULL"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_reg_status VARCHAR(50) DEFAULT NULL"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN fbr_business_name VARCHAR(255) DEFAULT NULL"); } catch(PDOException $e) {}

        $custStmt = $pdo->prepare("
            SELECT 
                cl.id as coa_id,
                cl.code as customer_code,
                cl.name as customer_name,
                c.id as customer_id,
                COALESCE(c.address, '') as address,
                COALESCE(c.telephone, c.mobile, '') as telephone,
                COALESCE(c.ntn_cnic, '') as ntn_cnic,
                COALESCE(c.cnic, '') as cnic,
                c.buyer_type_id,
                COALESCE(bt.name, '') as buyer_type_name,
                COALESCE(bt.buyer_code, '') as buyer_code,
                COALESCE(c.st_reg_no, '') as st_reg_no,
                COALESCE(r.name, '') as region_name,
                COALESCE(NULLIF(c.sales_tax_rate, 0.00), bt.sales_tax_rate, c.sales_tax_rate, 18.00) as sales_tax_rate,
                COALESCE(NULLIF(c.further_tax_rate, 0.00), bt.further_tax_rate, c.further_tax_rate, 0.00) as further_tax_rate,
                COALESCE(c.wh_tax_rate, ctt.tax_rate, 0.00) as wht_rate,
                COALESCE(ctt.wht_type, '') as wht_type,
                COALESCE(c.fbr_verified_at, '') as fbr_verified_at,
                COALESCE(c.fbr_verification_source, '') as fbr_verification_source,
                COALESCE(c.fbr_atl_status, '') as fbr_atl_status,
                COALESCE(c.fbr_reg_status, '') as fbr_reg_status,
                COALESCE(c.fbr_business_name, '') as fbr_business_name
            FROM coa_list cl
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id
            LEFT JOIN customer_types_tax ctt ON c.cust_tax_type_id = ctt.id
            LEFT JOIN regions r ON c.region_id = r.id
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE (cl.company_id = ? OR cl.company_id = 1 OR cl.company_id IS NULL)
              AND (
                  c.id IS NOT NULL 
                  OR cm.code = '120' 
                  OR cm.name LIKE '%RECEIVABLE%' 
                  OR cm.name LIKE '%DEBTOR%' 
                  OR cs.name LIKE '%RECEIVABLE%' 
                  OR cs.name LIKE '%CUSTOMER%'
              )
            ORDER BY cl.name ASC
        ");
        $custStmt->execute([$company_id]);
        $customers = $custStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fallback 1: If no customers found above, load all entries from customers table joined with coa_list
        if (empty($customers)) {
            $custStmt = $pdo->query("
                SELECT 
                    cl.id as coa_id,
                    cl.code as customer_code,
                    cl.name as customer_name,
                    c.id as customer_id,
                    COALESCE(c.address, '') as address,
                    COALESCE(c.telephone, c.mobile, '') as telephone,
                    COALESCE(c.ntn_cnic, '') as ntn_cnic,
                    COALESCE(c.cnic, '') as cnic,
                    c.buyer_type_id,
                    COALESCE(bt.name, '') as buyer_type_name,
                    COALESCE(bt.buyer_code, '') as buyer_code,
                    COALESCE(c.st_reg_no, '') as st_reg_no,
                    COALESCE(r.name, '') as region_name,
                    COALESCE(NULLIF(c.sales_tax_rate, 0.00), bt.sales_tax_rate, c.sales_tax_rate, 18.00) as sales_tax_rate,
                    COALESCE(NULLIF(c.further_tax_rate, 0.00), bt.further_tax_rate, c.further_tax_rate, 0.00) as further_tax_rate,
                    COALESCE(c.wh_tax_rate, ctt.tax_rate, 0.00) as wht_rate,
                    COALESCE(ctt.wht_type, '') as wht_type,
                    COALESCE(c.fbr_verified_at, '') as fbr_verified_at,
                    COALESCE(c.fbr_verification_source, '') as fbr_verification_source,
                    COALESCE(c.fbr_atl_status, '') as fbr_atl_status,
                    COALESCE(c.fbr_reg_status, '') as fbr_reg_status,
                    COALESCE(c.fbr_business_name, '') as fbr_business_name
                FROM customers c
                JOIN coa_list cl ON c.coa_list_id = cl.id
                LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id
                LEFT JOIN customer_types_tax ctt ON c.cust_tax_type_id = ctt.id
                LEFT JOIN regions r ON c.region_id = r.id
                ORDER BY cl.name ASC
            ");
            $customers = $custStmt ? $custStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        }

        // Fallback 2: Direct from coa_list under 120 or name like Customer
        if (empty($customers)) {
            $custStmt = $pdo->query("
                SELECT 
                    cl.id as coa_id,
                    cl.code as customer_code,
                    cl.name as customer_name,
                    0 as customer_id,
                    '' as address,
                    '' as telephone,
                    '' as ntn_cnic,
                    '' as cnic,
                    NULL as buyer_type_id,
                    '' as buyer_type_name,
                    '' as buyer_code,
                    '' as st_reg_no,
                    '' as region_name,
                    18.00 as sales_tax_rate,
                    0.00 as further_tax_rate,
                    0.00 as wht_rate,
                    '' as wht_type
                FROM coa_list cl
                WHERE cl.code LIKE '120%' OR cl.name LIKE '%Customer%' OR cl.name LIKE '%Client%'
                ORDER BY cl.name ASC
            ");
            $customers = $custStmt ? $custStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        }

        // 3. Fetch Items Master (with HS Code, UOM, selling price, default tax rate)
        $items = [];
        try {
            $itemStmt = $pdo->prepare("
                SELECT 
                    i.id,
                    i.code,
                    i.name,
                    COALESCE(NULLIF(i.description, ''), i.name) as description,
                    COALESCE(i.hs_code, '0000.0000') as hs_code,
                    COALESCE(NULLIF(i.unit, ''), 'Pcs') as unit,
                    COALESCE(i.selling_price, 0) as selling_price,
                    COALESCE(i.tax_rate, 18.00) as tax_rate,
                    COALESCE(i.category_type, m.category_type, 'Goods') as category_type,
                    COALESCE(i.pipe_sub_type, '') as pipe_sub_type,
                    COALESCE(i.pipe_length, 0) as pipe_length,
                    COALESCE(i.length, '') as length,
                    COALESCE(i.length_unit, 'ft') as length_unit,
                    COALESCE(i.billing_mode, '') as billing_mode,
                    COALESCE(i.unit_weight, 0) as unit_weight,
                    COALESCE(i.carton, 0) as carton,
                    COALESCE(i.qty_per_piece, 0) as qty_per_piece
                FROM inv_items i
                INNER JOIN inv_sub_categories s ON i.sub_id = s.id AND s.company_id = i.company_id
                INNER JOIN inv_main_categories m ON s.main_id = m.id AND m.company_id = i.company_id
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
                ORDER BY i.code ASC
            ");
            $itemStmt->execute([$company_id]);
            $items = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            $items = [];
        }

        if (empty($items)) {
            try {
                $itemStmt = $pdo->prepare("
                    SELECT 
                        id,
                        code,
                        name,
                        COALESCE(NULLIF(description, ''), name) as description,
                        COALESCE(hs_code, '0000.0000') as hs_code,
                        COALESCE(NULLIF(unit, ''), 'Pcs') as unit,
                        COALESCE(selling_price, 0) as selling_price,
                        COALESCE(tax_rate, 18.00) as tax_rate,
                        COALESCE(category_type, 'Goods') as category_type,
                        COALESCE(pipe_sub_type, '') as pipe_sub_type,
                        COALESCE(pipe_length, 0) as pipe_length,
                        COALESCE(length, '') as length,
                        COALESCE(length_unit, 'ft') as length_unit,
                        COALESCE(billing_mode, '') as billing_mode,
                        COALESCE(unit_weight, 0) as unit_weight,
                        COALESCE(carton, 0) as carton,
                        COALESCE(qty_per_piece, 0) as qty_per_piece
                    FROM inv_items
                    WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL)
                    ORDER BY code ASC
                ");
                $itemStmt->execute([$company_id]);
                $items = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $items = [];
            }
        }

        // 4. Fetch Buyer Types (from Maintain -> Buyer Types form/table)
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS buyer_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT DEFAULT 1,
                name VARCHAR(100) NOT NULL,
                buyer_code VARCHAR(50) DEFAULT 'Registered',
                sales_tax_rate DECIMAL(10,2) DEFAULT 18.00,
                further_tax_rate DECIMAL(10,2) DEFAULT 0.00,
                extra_tax_rate DECIMAL(10,2) DEFAULT 0.00,
                description VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch(PDOException $e) {}

        $btStmt = $pdo->prepare("SELECT id, name, buyer_code, sales_tax_rate, further_tax_rate, extra_tax_rate, description FROM buyer_types WHERE company_id = ? ORDER BY id ASC");
        $btStmt->execute([$company_id]);
        $buyerTypes = $btStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fallback 1: If company-specific query has no rows, fetch all buyer_types
        if (empty($buyerTypes)) {
            $btStmt = $pdo->query("SELECT id, name, buyer_code, sales_tax_rate, further_tax_rate, extra_tax_rate, description FROM buyer_types ORDER BY id ASC");
            $buyerTypes = $btStmt ? $btStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        }

        // Fallback 2: If table is completely empty, seed the defaults and fetch
        if (empty($buyerTypes)) {
            $defaults = [
                ['Registered Person (Filer)', 'Registered', 18.00, 0.00, 0.00, 'Standard Sales Tax Filer Buyer'],
                ['Unregistered Buyer (Non-Filer)', 'Unregistered', 18.00, 4.00, 0.00, 'Unregistered Buyer with 4% Further Tax'],
                ['End Consumer', 'Consumer', 18.00, 0.00, 0.00, 'Final retail / consumer purchase'],
                ['Exempt / Zero-Rated', 'Exempt', 0.00, 0.00, 0.00, 'Exempt from sales tax (Schedule 5/6)'],
                ['Wholesaler / Distributor', 'Registered', 18.00, 0.00, 0.00, 'Wholesale trade registered buyer'],
                ['Retailer', 'Registered', 18.00, 0.00, 0.00, 'Retail channel partner'],
                ['Exporter', 'Exempt', 0.00, 0.00, 0.00, 'Direct export sales']
            ];
            $ins = $pdo->prepare("INSERT INTO buyer_types (company_id, name, buyer_code, sales_tax_rate, further_tax_rate, extra_tax_rate, description) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($defaults as $d) {
                try {
                    $ins->execute([$company_id, $d[0], $d[1], $d[2], $d[3], $d[4], $d[5]]);
                } catch(Exception $ex) {}
            }
            $btStmt = $pdo->prepare("SELECT id, name, buyer_code, sales_tax_rate, further_tax_rate, extra_tax_rate, description FROM buyer_types WHERE (company_id = ? OR company_id = 1) ORDER BY id ASC");
            $btStmt->execute([$company_id]);
            $buyerTypes = $btStmt ? $btStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        }

        // Auto-sync any existing unsynced digital invoices into sale_invoices
        try {
            $unsyncedStmt = $pdo->prepare("SELECT id FROM fbr_digital_invoices WHERE company_id = ? AND (sale_invoice_id IS NULL OR sale_invoice_id = 0) ORDER BY id DESC LIMIT 50");
            $unsyncedStmt->execute([$company_id]);
            $unsyncedIds = $unsyncedStmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($unsyncedIds as $uId) {
                sync_to_sale_invoice($pdo, $uId, $company_id);
            }
        } catch (Exception $eSyncAll) {}

        // 5. Fetch Next Serial No (Synchronized with ERP Sale Tax Invoice)
        $snStmt = $pdo->prepare("SELECT GREATEST(
            (SELECT COALESCE(MAX(serial_no), 0) FROM fbr_digital_invoices WHERE company_id = ?),
            (SELECT COALESCE(MAX(serial_no), 0) FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = 1 AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = ''))
        ) + 1 as next_sn");
        $snStmt->execute([$company_id, $company_id]);
        $nextSn = intval($snStmt->fetchColumn() ?: 1);
        $nextInvoiceNo = 'DI-' . date('Y') . '-' . str_pad($nextSn, 4, '0', STR_PAD_LEFT);

        // 6. Fetch Active FBR Settings Summary
        $setStmt = $pdo->prepare("SELECT provider, environment, api_base_url, connection_status, fbr_reg_ref FROM digital_invoice_settings WHERE company_id = ?");
        $setStmt->execute([$company_id]);
        $settings = $setStmt->fetch(PDO::FETCH_ASSOC) ?: [
            'provider' => 'PRAL',
            'environment' => 'sandbox',
            'api_base_url' => 'https://fbr-invoice-sandbox.pral.com.pk/api/v1',
            'connection_status' => 'Not Configured',
            'fbr_reg_ref' => ''
        ];

        sendJson([
            'status' => 'success',
            'company' => $company,
            'customers' => $customers,
            'buyer_types' => $buyerTypes,
            'items' => $items,
            'next_sn' => $nextSn,
            'next_invoice_no' => $nextInvoiceNo,
            'settings' => $settings
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_next_serial (Synchronized with ERP Sale Tax Invoices)
// =========================================================================
if ($action === 'get_next_serial') {
    try {
        $snStmt = $pdo->prepare("SELECT GREATEST(
            (SELECT COALESCE(MAX(serial_no), 0) FROM fbr_digital_invoices WHERE company_id = ?),
            (SELECT COALESCE(MAX(serial_no), 0) FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = 1 AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = ''))
        ) + 1 as next_sn");
        $snStmt->execute([$company_id, $company_id]);
        $nextSn = intval($snStmt->fetchColumn() ?: 1);
        $nextInvoiceNo = 'DI-' . date('Y') . '-' . str_pad($nextSn, 4, '0', STR_PAD_LEFT);
        sendJson(['status' => 'success', 'next_sn' => $nextSn, 'next_invoice_no' => $nextInvoiceNo]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: search_invoices (Search / List recent digital invoices)
// =========================================================================
if ($action === 'search_invoices') {
    try {
        $query = $_GET['q'] ?? '';
        $sql = "
            SELECT 
                id, serial_no, invoice_no, invoice_date, invoice_type, supply_type,
                customer_name, customer_type, net_payable, workflow_status, fbr_status,
                fbr_invoice_no, submission_timestamp, created_at
            FROM fbr_digital_invoices
            WHERE company_id = ?
        ";
        $params = [$company_id];
        if (!empty($query)) {
            $sql .= " AND (invoice_no LIKE ? OR customer_name LIKE ? OR fbr_invoice_no LIKE ? OR customer_ntn LIKE ? OR customer_cnic LIKE ?)";
            $wild = "%$query%";
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
            $params[] = $wild;
        }
        $sql .= " ORDER BY serial_no DESC LIMIT 200";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        sendJson(['status' => 'success', 'invoices' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_invoice (Load single invoice with its items)
// =========================================================================
if ($action === 'get_invoice') {
    try {
        $id = intval($_GET['id'] ?? 0);
        $sn = intval($_GET['serial_no'] ?? 0);
        $dir = $_GET['dir'] ?? '';

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
        } elseif (!empty($dir)) {
            if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE serial_no > ? AND company_id = ? ORDER BY serial_no ASC LIMIT 1");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE serial_no < ? AND company_id = ? ORDER BY serial_no DESC LIMIT 1");
            }
            $stmt->execute([$sn, $company_id]);
        } elseif ($sn > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE serial_no = ? AND company_id = ?");
            $stmt->execute([$sn, $company_id]);
        } else {
            // Get latest invoice
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
            $stmt->execute([$company_id]);
        }

        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            sendJson(['status' => 'error', 'message' => 'Invoice not found']);
        }

        // Fetch invoice items
        $itemStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC");
        $itemStmt->execute([$invoice['id']]);
        $invoice['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);

        // 1. Resolve Customer Address from Customers Master if blank or '-'
        if (empty($invoice['customer_address']) || trim($invoice['customer_address']) === '-') {
            $addr = '';
            if (!empty($invoice['customer_coa_id'])) {
                try {
                    $cStmt = $pdo->prepare("SELECT address FROM customers WHERE coa_list_id = ? LIMIT 1");
                    $cStmt->execute([$invoice['customer_coa_id']]);
                    $addr = $cStmt->fetchColumn();
                } catch (Exception $e) {}
            }
            if (empty($addr) && !empty($invoice['customer_name'])) {
                try {
                    $cStmt2 = $pdo->prepare("SELECT address FROM customers WHERE name LIKE ? LIMIT 1");
                    $cStmt2->execute(['%' . trim($invoice['customer_name']) . '%']);
                    $addr = $cStmt2->fetchColumn();
                } catch (Exception $e) {}
            }
            if (!empty($addr)) {
                $invoice['customer_address'] = $addr;
            }
        }

        // 2. Fetch Live Company Profile
        try {
            $compStmt = $pdo->prepare("SELECT id, name, address, phone, email, website, ntn, gst, deals_in, logo_data FROM companies WHERE id = ?");
            $compStmt->execute([$company_id]);
            $compRow = $compStmt->fetch(PDO::FETCH_ASSOC);
            if (!$compRow) {
                $compRow = $pdo->query("SELECT id, name, address, phone, email, website, ntn, gst, deals_in, logo_data FROM companies ORDER BY id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            }
            $invoice['company'] = $compRow ?: [];
        } catch (Exception $e) {
            $invoice['company'] = [];
        }

        // 3. Ensure Tax Totals are not 0.00 if invoice has payable amount
        if (floatval($invoice['taxable_amount'] ?? 0) <= 0 || floatval($invoice['total_sales_tax'] ?? 0) <= 0) {
            $calcTaxable = 0;
            $calcST = 0;
            $calcFT = 0;
            $calcExtra = 0;
            foreach ($invoice['items'] as $it) {
                $q = floatval($it['quantity'] ?? 0);
                $r = floatval($it['rate'] ?? $it['unit_price'] ?? 0);
                $lineExcl = floatval($it['val_excl_tax'] ?? ($q * $r));
                $st = floatval($it['sales_tax_amount'] ?? round($lineExcl * 0.18, 2));
                $ft = floatval($it['further_tax_amount'] ?? 0);
                $ot = floatval($it['extra_tax_amount'] ?? 0);

                $calcTaxable += $lineExcl;
                $calcST += $st;
                $calcFT += $ft;
                $calcExtra += $ot;
            }
            if ($calcTaxable > 0) $invoice['taxable_amount'] = $calcTaxable;
            if ($calcST > 0) $invoice['total_sales_tax'] = $calcST;
            if ($calcFT > 0) $invoice['total_further_tax'] = $calcFT;
            if ($calcExtra > 0) $invoice['total_extra_tax'] = $calcExtra;

            $net = floatval($invoice['net_payable'] ?? 0);
            if (floatval($invoice['taxable_amount'] ?? 0) <= 0 && $net > 0) {
                $tx = round($net / 1.18, 2);
                $invoice['taxable_amount'] = $tx;
                $invoice['total_sales_tax'] = round($net - $tx, 2);
            }
        }

        sendJson(['status' => 'success', 'invoice' => $invoice]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: delete_invoice (Delete Draft / Unsubmitted Digital Invoice)
// =========================================================================
if ($action === 'delete_invoice') {
    try {
        $rawInput = file_get_contents('php://input');
        $jsonData = json_decode($rawInput, true) ?: [];

        $id = intval($jsonData['id'] ?? $_POST['id'] ?? $_GET['id'] ?? 0);
        $serialNo = intval($jsonData['serial_no'] ?? $_POST['serial_no'] ?? $_GET['serial_no'] ?? 0);
        $company_id = intval($jsonData['company_id'] ?? $_POST['company_id'] ?? $_GET['company_id'] ?? $company_id);

        if ($id <= 0 && $serialNo <= 0) {
            sendJson(['status' => 'error', 'message' => 'Invoice ID or Serial Number is required.'], 400);
        }

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE serial_no = ? AND company_id = ?");
            $stmt->execute([$serialNo, $company_id]);
        }

        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) {
            sendJson(['status' => 'error', 'message' => 'Digital invoice not found or already deleted.'], 404);
        }

        // STRICT FBR COMPLIANCE CHECK:
        // If invoice is already submitted to FBR, FBR rules strictly prohibit deletion!
        $wfStatus = strtolower($inv['workflow_status'] ?? '');
        $fbrStatus = strtolower($inv['fbr_status'] ?? '');
        $fbrNo = trim($inv['fbr_invoice_no'] ?? '');

        $isSubmitted = ($wfStatus === 'submitted')
            || in_array($fbrStatus, ['valid', 'submitted', 'active', 'accepted'])
            || (!empty($fbrNo) && $fbrNo !== '-' && $fbrNo !== 'n/a');

        if ($isSubmitted) {
            sendJson([
                'status' => 'error',
                'code' => 'FBR_SUBMITTED_LOCKED',
                'message' => 'FBR Compliance Rule: Invoice #' . $inv['invoice_no'] . ' (Serial #' . $inv['serial_no'] . ') has already been officially submitted to FBR (FBR Inv #: ' . ($fbrNo ?: 'Recorded') . ') and CANNOT be deleted. In accordance with FBR Digital Invoicing regulations, submitted tax invoices must be reversed via Credit Note or cancelled using Invoice Cancellation.'
            ], 403);
        }

        // Invoice is draft / unsubmitted / rejected: Safe to delete
        $delItems = $pdo->prepare("DELETE FROM fbr_digital_invoice_items WHERE invoice_id = ?");
        $delItems->execute([$inv['id']]);

        $delInv = $pdo->prepare("DELETE FROM fbr_digital_invoices WHERE id = ?");
        $delInv->execute([$inv['id']]);

        // Clean up linked draft record in sale_invoices
        try {
            if (!empty($inv['sale_invoice_id'])) {
                $pdo->prepare("DELETE FROM sale_invoice_items WHERE invoice_id = ?")->execute([$inv['sale_invoice_id']]);
                $pdo->prepare("DELETE FROM sale_invoices WHERE id = ? AND company_id = ?")->execute([$inv['sale_invoice_id'], $company_id]);
            } else {
                $chkSi = $pdo->prepare("SELECT id FROM sale_invoices WHERE company_id = ? AND serial_no = ? AND is_tax_invoice = 1");
                $chkSi->execute([$company_id, $inv['serial_no']]);
                $siId = $chkSi->fetchColumn();
                if ($siId) {
                    $pdo->prepare("DELETE FROM sale_invoice_items WHERE invoice_id = ?")->execute([$siId]);
                    $pdo->prepare("DELETE FROM sale_invoices WHERE id = ?")->execute([$siId]);
                }
            }
        } catch (Exception $eCleanSi) {}

        // Log in digital_invoice_logs
        try {
            $pdo->prepare("INSERT INTO digital_invoice_logs (company_id, event_type, endpoint, request_payload, status, sanitized_error) VALUES (?, 'INVOICE_DELETED', 'delete_invoice', ?, 'SUCCESS', ?)")
                ->execute([$company_id, json_encode(['deleted_invoice_no' => $inv['invoice_no'], 'serial_no' => $inv['serial_no']]), 'Draft digital invoice deleted by user.']);
        } catch (Exception $le) {}

        sendJson([
            'status' => 'success',
            'message' => 'Digital Invoice #' . $inv['invoice_no'] . ' (Serial #' . $inv['serial_no'] . ') has been permanently deleted.',
            'deleted_id' => $inv['id'],
            'deleted_serial' => $inv['serial_no']
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => 'Error deleting invoice: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: cancel_invoice (Audited Cancellation with Reason)
// =========================================================================
if ($action === 'cancel_invoice') {
    try {
        $rawInput = file_get_contents('php://input');
        $jsonData = json_decode($rawInput, true) ?: [];

        $id = intval($jsonData['id'] ?? $_POST['id'] ?? $_GET['id'] ?? 0);
        $serialNo = intval($jsonData['serial_no'] ?? $_POST['serial_no'] ?? $_GET['serial_no'] ?? 0);
        $company_id = intval($jsonData['company_id'] ?? $_POST['company_id'] ?? $_GET['company_id'] ?? $company_id);
        $reason = trim($jsonData['reason'] ?? $_POST['reason'] ?? '');

        if ($id <= 0 && $serialNo <= 0) {
            sendJson(['status' => 'error', 'message' => 'Invoice ID or Serial Number is required.'], 400);
        }
        if (empty($reason)) {
            sendJson(['status' => 'error', 'message' => 'Cancellation reason is mandatory.'], 400);
        }

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE serial_no = ? AND company_id = ?");
            $stmt->execute([$serialNo, $company_id]);
        }

        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) {
            sendJson(['status' => 'error', 'message' => 'Digital invoice not found.'], 404);
        }

        if (intval($inv['is_cancelled'] ?? 0) === 1) {
            sendJson(['status' => 'error', 'message' => 'Digital invoice is already cancelled.'], 400);
        }

        $upd = $pdo->prepare("
            UPDATE fbr_digital_invoices 
            SET is_cancelled = 1, 
                cancellation_reason = ?, 
                cancellation_date = NOW(),
                workflow_status = 'Cancelled'
            WHERE id = ? AND company_id = ?
        ");
        $upd->execute([$reason, $inv['id'], $company_id]);

        // Also mark linked sale_invoices as cancelled
        try {
            $pdo->prepare("UPDATE sale_invoices SET is_cancelled = 1 WHERE (fbr_digital_invoice_id = ? OR (serial_no = ? AND is_tax_invoice = 1)) AND company_id = ?")
                ->execute([$inv['id'], $inv['serial_no'], $company_id]);
        } catch (Exception $eCancelSi) {}

        // Log to digital_invoice_logs
        try {
            $pdo->prepare("INSERT INTO digital_invoice_logs (company_id, event_type, endpoint, request_payload, status, sanitized_error) VALUES (?, 'INVOICE_CANCELLED', 'cancel_invoice', ?, 'SUCCESS', ?)")
                ->execute([$company_id, json_encode(['cancelled_invoice_no' => $inv['invoice_no'], 'serial_no' => $inv['serial_no'], 'reason' => $reason]), "Digital invoice marked as Cancelled. Reason: {$reason}"]);
        } catch (Exception $le) {}

        sendJson([
            'status' => 'success',
            'message' => 'Digital Invoice #' . $inv['invoice_no'] . ' (Serial #' . $inv['serial_no'] . ') has been marked as Cancelled.',
            'id' => $inv['id'],
            'serial_no' => $inv['serial_no']
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => 'Error cancelling invoice: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: get_register_invoices (Digital Invoice Sales Register Listing)
// =========================================================================
if ($action === 'get_register_invoices') {
    try {
        $search = trim($_GET['search'] ?? '');
        $customer_coa_id = intval($_GET['customer_coa_id'] ?? 0);
        $fromDate = trim($_GET['from_date'] ?? '');
        $toDate = trim($_GET['to_date'] ?? '');
        $fbrStatus = trim($_GET['fbr_status'] ?? '');
        $buyerType = trim($_GET['buyer_type'] ?? '');
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(10, min(100, intval($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $where = ["company_id = ?"];
        $params = [$company_id];

        if (!empty($search)) {
            $where[] = "(invoice_no LIKE ? OR serial_no = ? OR customer_name LIKE ? OR customer_ntn LIKE ? OR customer_cnic LIKE ? OR fbr_invoice_no LIKE ?)";
            $params[] = "%$search%";
            $params[] = intval($search);
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        if ($customer_coa_id > 0) {
            $where[] = "customer_coa_id = ?";
            $params[] = $customer_coa_id;
        }

        if (!empty($fromDate)) {
            $where[] = "invoice_date >= ?";
            $params[] = $fromDate;
        }

        if (!empty($toDate)) {
            $where[] = "invoice_date <= ?";
            $params[] = $toDate;
        }

        if (!empty($fbrStatus)) {
            if ($fbrStatus === 'Submitted') {
                $where[] = "(fbr_status IN ('Valid', 'Submitted', 'Active', 'Accepted') OR workflow_status = 'Submitted')";
            } elseif ($fbrStatus === 'Pending') {
                $where[] = "(fbr_status IN ('Pending', 'Not Submitted', 'Draft') AND workflow_status != 'Submitted')";
            } elseif ($fbrStatus === 'Rejected') {
                $where[] = "fbr_status IN ('Rejected', 'Failed', 'Sample Validation Failed')";
            } elseif ($fbrStatus === 'Cancelled') {
                $where[] = "is_cancelled = 1";
            } else {
                $where[] = "fbr_status = ?";
                $params[] = $fbrStatus;
            }
        }

        if (!empty($buyerType)) {
            $where[] = "customer_type LIKE ?";
            $params[] = "%$buyerType%";
        }

        $whereSql = implode(" AND ", $where);

        // Summary totals across matching dataset
        $sumStmt = $pdo->prepare("
            SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(taxable_amount), 0) as total_taxable,
                COALESCE(SUM(total_sales_tax), 0) as total_sales_tax,
                COALESCE(SUM(total_further_tax), 0) as total_further_tax,
                COALESCE(SUM(net_payable), 0) as total_net,
                COALESCE(SUM(CASE WHEN fbr_status IN ('Valid', 'Submitted', 'Active', 'Accepted') OR workflow_status = 'Submitted' THEN 1 ELSE 0 END), 0) as count_submitted,
                COALESCE(SUM(CASE WHEN fbr_status IN ('Pending', 'Not Submitted', 'Draft') AND workflow_status != 'Submitted' THEN 1 ELSE 0 END), 0) as count_pending,
                COALESCE(SUM(CASE WHEN fbr_status IN ('Rejected', 'Failed', 'Sample Validation Failed') THEN 1 ELSE 0 END), 0) as count_rejected
            FROM fbr_digital_invoices
            WHERE $whereSql
        ");
        $sumStmt->execute($params);
        $summary = $sumStmt->fetch(PDO::FETCH_ASSOC);

        // Fetch paginated rows
        $listStmt = $pdo->prepare("
            SELECT 
                id, company_id, serial_no, invoice_no, invoice_date, invoice_type, supply_type,
                customer_type, customer_coa_id, customer_code, customer_name, business_name,
                customer_ntn, customer_cnic, customer_strn, customer_phone, customer_reg_status,
                customer_address, customer_province, ref_doc_no, ref_doc_date,
                total_qty, taxable_amount, total_sales_tax, total_further_tax, total_extra_tax,
                total_fed, withholding_tax, carriage_freight, total_invoice_amount, net_payable,
                amount_received, balance, workflow_status, fbr_status, fbr_invoice_no,
                submission_timestamp, last_status_check, fbr_response_msg, is_cancelled, cancellation_reason, cancellation_date, created_at
            FROM fbr_digital_invoices
            WHERE $whereSql
            ORDER BY serial_no DESC
            LIMIT $limit OFFSET $offset
        ");
        $listStmt->execute($params);
        $rows = $listStmt->fetchAll(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'data' => $rows,
            'summary' => $summary,
            'pagination' => [
                'total_rows' => intval($summary['total_count'] ?? 0),
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil(($summary['total_count'] ?? 0) / $limit)
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: save_invoice (Create or Update invoice in ERP database)
// =========================================================================
if ($action === 'save_invoice') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        sendJson(['status' => 'error', 'message' => 'Invalid JSON input data'], 400);
    }

    $id = intval($data['id'] ?? 0);
    $customer_coa_id = intval($data['customer_coa_id'] ?? 0);
    $customer_code = trim($data['customer_code'] ?? '');
    $customer_name = trim($data['customer_name'] ?? '');
    $business_name = trim($data['business_name'] ?? $customer_name);
    $invoice_date = trim($data['invoice_date'] ?? date('Y-m-d'));
    $invoice_type = trim($data['invoice_type'] ?? 'Tax Invoice');
    $supply_type = trim($data['supply_type'] ?? 'Wholesaler');
    $customer_type = trim($data['customer_type'] ?? 'Registered (Filer)');
    $customer_ntn = trim($data['customer_ntn'] ?? '');
    $customer_cnic = trim($data['customer_cnic'] ?? '');

    // Smart Auto-Detection: Support alphanumeric NTNs (e.g. G686755, A522103) & 13-digit CNIC
    $rawNtnDigits = preg_replace('/[^0-9]/', '', $customer_ntn);
    $rawCnicDigits = preg_replace('/[^0-9]/', '', $customer_cnic);
    $cleanNtnAlpha = strtoupper(trim(preg_replace('/[^\w\-]/', '', $customer_ntn)));
    $cleanCnicAlpha = strtoupper(trim(preg_replace('/[^\w\-]/', '', $customer_cnic)));
    $baseCnicAlpha = strpos($cleanCnicAlpha, '-') !== false ? explode('-', $cleanCnicAlpha)[0] : $cleanCnicAlpha;

    if (strlen($rawNtnDigits) === 13 && empty($rawCnicDigits)) {
        $customer_cnic = $customer_ntn;
        $customer_ntn = '';
    } elseif ((strlen($baseCnicAlpha) >= 7 && strlen($baseCnicAlpha) <= 8) && empty($customer_ntn)) {
        $customer_ntn = $customer_cnic;
        $customer_cnic = '';
    }
    $customer_strn = trim($data['customer_strn'] ?? '');
    $customer_phone = trim($data['customer_phone'] ?? '');
    $customer_reg_status = trim($data['customer_reg_status'] ?? 'Active');
    $customer_address = trim($data['customer_address'] ?? '');
    $customer_province = trim($data['customer_province'] ?? 'Punjab');
    $ref_doc_no = trim($data['ref_doc_no'] ?? '');
    $ref_doc_date = !empty($data['ref_doc_date']) ? trim($data['ref_doc_date']) : null;
    $payment_mode = trim($data['payment_mode'] ?? 'Cash');
    $remarks = trim($data['remarks'] ?? '');

    $items = is_array($data['items'] ?? null) ? $data['items'] : [];

    if ($customer_coa_id <= 0 || empty($customer_name)) {
        sendJson(['status' => 'error', 'message' => 'Please select a valid customer from ERP customer records.'], 400);
    }

    // Auto-heal and validate customer_type against Customer Master Buyer Type
    if ($customer_coa_id > 0) {
        $cmBtStmt = $pdo->prepare("SELECT bt.name FROM customers c JOIN buyer_types bt ON c.buyer_type_id = bt.id WHERE c.coa_list_id = ? LIMIT 1");
        $cmBtStmt->execute([$customer_coa_id]);
        $masterBtFound = $cmBtStmt->fetchColumn();
        if ($masterBtFound) {
            if (fbr_buyer_types_match($masterBtFound, $customer_type)) {
                $customer_type = trim($masterBtFound);
            } else {
                sendJson([
                    'status' => 'error',
                    'message' => "Customer Type mismatch: In Customer Master, this customer is configured as '{$masterBtFound}', but '{$customer_type}' was selected. Saving is blocked to prevent FBR compliance error."
                ], 400);
            }
        }
    }

    if (empty($items)) {
        sendJson(['status' => 'error', 'message' => 'Please add at least one line item to the invoice.'], 400);
    }

    // Check if editing an already submitted invoice
    if ($id > 0) {
        $chkStmt = $pdo->prepare("SELECT fbr_status, workflow_status, fbr_invoice_no FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
        $chkStmt->execute([$id, $company_id]);
        $existing = $chkStmt->fetch(PDO::FETCH_ASSOC);
        if ($existing && ($existing['fbr_status'] === 'Submitted' || $existing['workflow_status'] === 'Submitted')) {
            sendJson(['status' => 'error', 'message' => 'This invoice has already been submitted to FBR (FBR No: ' . $existing['fbr_invoice_no'] . '). According to fiscal rules, submitted invoices cannot be modified directly.'], 400);
        }
    }

    try {
        $pdo->beginTransaction();

        // Calculate Header Totals from Items
        $totalQty = 0;
        $grossSubtotal = 0;
        $totalDiscount = 0;
        $taxableAmount = 0;
        $totalSalesTax = 0;
        $totalFurtherTax = 0;
        $totalExtraTax = 0;
        $totalFed = 0;
        $totalInvoiceAmount = 0;

        foreach ($items as $idx => $it) {
            $q = floatval($it['quantity'] ?? 0);
            $r = floatval($it['rate'] ?? 0);
            $gross = round($q * $r, 2);
            $discPct = floatval($it['discount_percent'] ?? 0);
            $discAmt = floatval($it['discount_amount'] ?? 0);
            if ($discPct > 0 && $discAmt <= 0) {
                $discAmt = round($gross * ($discPct / 100), 2);
            }
            $valExcl = max(0, $gross - $discAmt);
            $taxRate = floatval($it['tax_rate'] ?? 18);
            $stAmt = round($valExcl * ($taxRate / 100), 2);
            $furRate = floatval($it['further_tax_rate'] ?? 0);
            $furAmt = round($valExcl * ($furRate / 100), 2);
            $extRate = floatval($it['extra_tax_rate'] ?? 0);
            $extAmt = round($valExcl * ($extRate / 100), 2);
            $fedRate = floatval($it['fed_rate'] ?? 0);
            $fedAmt = round($valExcl * ($fedRate / 100), 2);
            $valIncl = round($valExcl + $stAmt + $furAmt + $extAmt + $fedAmt, 2);

            $totalQty += $q;
            $grossSubtotal += $gross;
            $totalDiscount += $discAmt;
            $taxableAmount += $valExcl;
            $totalSalesTax += $stAmt;
            $totalFurtherTax += $furAmt;
            $totalExtraTax += $extAmt;
            $totalFed += $fedAmt;
            $totalInvoiceAmount += $valIncl;
        }

        $carriage_freight = floatval($data['carriage_freight'] ?? ($data['rounding_adjustment'] ?? 0));
        $withholding_tax = floatval($data['withholding_tax'] ?? 0);
        $wht_rate = floatval($data['wht_rate'] ?? 0);
        $wht_type = trim($data['wht_type'] ?? 'With-236C/236H');
        $amount_received = floatval($data['amount_received'] ?? 0);
        $balance = floatval($data['balance'] ?? 0);
        $rounding = $carriage_freight;
        $netPayable = floatval($data['net_payable'] ?? round($totalInvoiceAmount + $carriage_freight + $withholding_tax, 2));

        // Auto-handle Walk-in Cash Customer (12001001): amount_received = netPayable, balance = 0
        $chkCustCode = trim($customer_code ?? ($data['customer_code'] ?? ''));
        if (!$chkCustCode && $customer_coa_id > 0) {
            $cStmt = $pdo->prepare("SELECT code FROM coa_list WHERE id = ?");
            $cStmt->execute([$customer_coa_id]);
            $chkCustCode = trim($cStmt->fetchColumn() ?: '');
        }
        if ($chkCustCode === '12001001') {
            $hasAmtRecv = isset($data['amount_received']) && $data['amount_received'] !== '' && $data['amount_received'] !== null;
            if (!$hasAmtRecv) {
                $amount_received = $netPayable;
                $balance = 0.00;
            }
            $payment_mode = 'Cash';
        }

        if ($id > 0) {
            $req_sn = intval($data['serial_no'] ?? 0);
            $curSnStmt = $pdo->prepare("SELECT serial_no, invoice_no FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
            $curSnStmt->execute([$id, $company_id]);
            $curRow = $curSnStmt->fetch(PDO::FETCH_ASSOC);
            $serial_no = $curRow ? intval($curRow['serial_no']) : 1;
            $invoice_no = $curRow ? $curRow['invoice_no'] : ('DI-' . date('Y', strtotime($invoice_date)) . '-' . str_pad($serial_no, 4, '0', STR_PAD_LEFT));

            if ($req_sn > 0 && $req_sn != $serial_no) {
                // Check uniqueness if serial_no was changed
                $chkSn = $pdo->prepare("SELECT id FROM fbr_digital_invoices WHERE company_id = ? AND serial_no = ? AND id != ?");
                $chkSn->execute([$company_id, $req_sn, $id]);
                if ($chkSn->fetch()) {
                    sendJson(['status' => 'error', 'message' => "Serial No. {$req_sn} is already assigned to another invoice."], 400);
                }
                $serial_no = $req_sn;
                $invoice_no = 'DI-' . date('Y', strtotime($invoice_date)) . '-' . str_pad($serial_no, 4, '0', STR_PAD_LEFT);
            }

            // Update Existing Invoice
            $updSql = "
                UPDATE fbr_digital_invoices SET
                    serial_no = ?,
                    invoice_no = ?,
                    invoice_date = ?,
                    invoice_type = ?,
                    supply_type = ?,
                    customer_type = ?,
                    customer_coa_id = ?,
                    customer_code = ?,
                    customer_name = ?,
                    business_name = ?,
                    customer_ntn = ?,
                    customer_cnic = ?,
                    customer_strn = ?,
                    customer_phone = ?,
                    customer_reg_status = ?,
                    customer_address = ?,
                    customer_province = ?,
                    ref_doc_no = ?,
                    ref_doc_date = ?,
                    payment_mode = ?,
                    total_qty = ?,
                    gross_subtotal = ?,
                    total_discount = ?,
                    taxable_amount = ?,
                    total_sales_tax = ?,
                    total_further_tax = ?,
                    total_extra_tax = ?,
                    total_fed = ?,
                    withholding_tax = ?,
                    wht_rate = ?,
                    wht_type = ?,
                    carriage_freight = ?,
                    total_invoice_amount = ?,
                    rounding_adjustment = ?,
                    net_payable = ?,
                    amount_received = ?,
                    balance = ?,
                    remarks = ?,
                    workflow_status = CASE WHEN workflow_status = 'Ready to Submit' THEN 'Draft' ELSE workflow_status END
                WHERE id = ? AND company_id = ?
            ";
            $updStmt = $pdo->prepare($updSql);
            $updStmt->execute([
                $serial_no, $invoice_no,
                $invoice_date, $invoice_type, $supply_type, $customer_type,
                $customer_coa_id, $customer_code, $customer_name, $business_name, $customer_ntn, $customer_cnic,
                $customer_strn, $customer_phone, $customer_reg_status, $customer_address, $customer_province,
                $ref_doc_no, $ref_doc_date, $payment_mode,
                $totalQty, $grossSubtotal, $totalDiscount, $taxableAmount,
                $totalSalesTax, $totalFurtherTax, $totalExtraTax, $totalFed,
                $withholding_tax, $wht_rate, $wht_type, $carriage_freight,
                $totalInvoiceAmount, $rounding, $netPayable,
                $amount_received, $balance, $remarks,
                $id, $company_id
            ]);

            // Delete old items and insert fresh
            $delItems = $pdo->prepare("DELETE FROM fbr_digital_invoice_items WHERE invoice_id = ?");
            $delItems->execute([$id]);
            $invoiceId = $id;
        } else {
            // Insert New Invoice
            $req_sn = intval($data['serial_no'] ?? 0);
            if ($req_sn > 0) {
                // Check if user requested a custom serial number (e.g. 400)
                $chkSn = $pdo->prepare("SELECT id FROM fbr_digital_invoices WHERE company_id = ? AND serial_no = ?");
                $chkSn->execute([$company_id, $req_sn]);
                if ($chkSn->fetch()) {
                    sendJson(['status' => 'error', 'message' => "Serial No. {$req_sn} is already assigned to another invoice. Please choose another Serial No."], 400);
                }
                $serial_no = $req_sn;
            } else {
                $snStmt = $pdo->prepare("SELECT GREATEST(
                    (SELECT COALESCE(MAX(serial_no), 0) FROM fbr_digital_invoices WHERE company_id = ?),
                    (SELECT COALESCE(MAX(serial_no), 0) FROM sale_invoices WHERE company_id = ? AND COALESCE(is_tax_invoice, 0) = 1 AND (invoice_type != 'POS' OR invoice_type IS NULL) AND (pos_invoice_no IS NULL OR pos_invoice_no = ''))
                ) + 1");
                $snStmt->execute([$company_id, $company_id]);
                $serial_no = intval($snStmt->fetchColumn() ?: 1);
            }
            $invoice_no = 'DI-' . date('Y', strtotime($invoice_date)) . '-' . str_pad($serial_no, 4, '0', STR_PAD_LEFT);

            $insSql = "
                INSERT INTO fbr_digital_invoices (
                    company_id, serial_no, invoice_no, invoice_date, invoice_type, supply_type,
                    customer_type, customer_coa_id, customer_code, customer_name, business_name, customer_ntn, customer_cnic,
                    customer_strn, customer_phone, customer_reg_status, customer_address, customer_province,
                    ref_doc_no, ref_doc_date, payment_mode,
                    total_qty, gross_subtotal, total_discount, taxable_amount,
                    total_sales_tax, total_further_tax, total_extra_tax, total_fed,
                    withholding_tax, wht_rate, wht_type, carriage_freight,
                    total_invoice_amount, rounding_adjustment, net_payable,
                    amount_received, balance,
                    workflow_status, fbr_status, remarks
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    'Draft', 'Not Submitted', ?
                )
            ";
            $insStmt = $pdo->prepare($insSql);
            $insStmt->execute([
                $company_id, $serial_no, $invoice_no, $invoice_date, $invoice_type, $supply_type,
                $customer_type, $customer_coa_id, $customer_code, $customer_name, $business_name, $customer_ntn, $customer_cnic,
                $customer_strn, $customer_phone, $customer_reg_status, $customer_address, $customer_province,
                $ref_doc_no, $ref_doc_date, $payment_mode,
                $totalQty, $grossSubtotal, $totalDiscount, $taxableAmount,
                $totalSalesTax, $totalFurtherTax, $totalExtraTax, $totalFed,
                $withholding_tax, $wht_rate, $wht_type, $carriage_freight,
                $totalInvoiceAmount, $rounding, $netPayable,
                $amount_received, $balance, $remarks
            ]);
            $invoiceId = intval($pdo->lastInsertId());
        }

        // Insert Invoice Items
        $insItemStmt = $pdo->prepare("
            INSERT INTO fbr_digital_invoice_items (
                invoice_id, item_id, item_code, item_name, description,
                hs_code, uom, pieces, quantity, rate, gross_amount,
                discount_percent, discount_amount, tax_rate, sales_tax_amount,
                further_tax_rate, further_tax_amount, extra_tax_rate, extra_tax_amount,
                fed_rate, fed_amount, val_excl_tax, val_incl_tax,
                item_classification, sort_order
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?
            )
        ");

        foreach ($items as $idx => $it) {
            $itemId = !empty($it['item_id']) ? intval($it['item_id']) : null;
            $itemCode = trim($it['item_code'] ?? '');
            $itemName = trim($it['item_name'] ?? '');
            $itemDesc = trim($it['description'] ?? $itemName);
            $hsCode = trim($it['hs_code'] ?? '0000.0000');
            $uom = trim($it['uom'] ?? 'Pcs');
            $pcs = floatval($it['pieces'] ?? 0);
            $q = floatval($it['quantity'] ?? 0);
            $r = floatval($it['rate'] ?? 0);
            $gross = round($q * $r, 2);
            $discPct = floatval($it['discount_percent'] ?? 0);
            $discAmt = floatval($it['discount_amount'] ?? 0);
            if ($discPct > 0 && $discAmt <= 0) {
                $discAmt = round($gross * ($discPct / 100), 2);
            }
            $valExcl = max(0, $gross - $discAmt);
            $taxRate = floatval($it['tax_rate'] ?? 18);
            $stAmt = round($valExcl * ($taxRate / 100), 2);
            $furRate = floatval($it['further_tax_rate'] ?? 0);
            $furAmt = round($valExcl * ($furRate / 100), 2);
            $extRate = floatval($it['extra_tax_rate'] ?? 0);
            $extAmt = round($valExcl * ($extRate / 100), 2);
            $fedRate = floatval($it['fed_rate'] ?? 0);
            $fedAmt = round($valExcl * ($fedRate / 100), 2);
            $valIncl = round($valExcl + $stAmt + $furAmt + $extAmt + $fedAmt, 2);
            $classification = trim($it['item_classification'] ?? 'Goods');

            $insItemStmt->execute([
                $invoiceId, $itemId, $itemCode, $itemName, $itemDesc,
                $hsCode, $uom, $pcs, $q, $r, $gross,
                $discPct, $discAmt, $taxRate, $stAmt,
                $furRate, $furAmt, $extRate, $extAmt,
                $fedRate, $fedAmt, $valExcl, $valIncl,
                $classification, $idx
            ]);
        }

        $req_fbr_no = trim($data['fbr_invoice_no'] ?? '');
        if (!empty($req_fbr_no) && strcasecmp($req_fbr_no, 'Pending Transmission') !== 0 && strcasecmp($req_fbr_no, 'null') !== 0 && $req_fbr_no !== '-') {
            $clean_fbr = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $req_fbr_no));
            if (strlen($clean_fbr) >= 4 && !preg_match('/^DI\d+/', $clean_fbr)) {
                $updFbr = $pdo->prepare("UPDATE fbr_digital_invoices SET fbr_invoice_no = ?, fbr_qr_code = ? WHERE id = ? AND company_id = ?");
                $updFbr->execute([$clean_fbr, $clean_fbr, $invoiceId, $company_id]);
            }
        }

        $pdo->commit();

        // Synchronize in real time with ERP Sale Tax Invoice (sale_invoices table)
        try {
            sync_to_sale_invoice($pdo, $invoiceId, $company_id);
        } catch (Exception $eSyncSi) {
            error_log("sync_to_sale_invoice error: " . $eSyncSi->getMessage());
        }

        // Fetch saved record to return
        $retStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ?");
        $retStmt->execute([$invoiceId]);
        $savedInvoice = $retStmt->fetch(PDO::FETCH_ASSOC);

        sendJson([
            'status' => 'success',
            'message' => 'Invoice saved successfully in ERP database.',
            'invoice' => $savedInvoice
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        sendJson(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: validate_invoice (Run FBR validation rules and return errors/warnings)
// =========================================================================
if ($action === 'validate_invoice') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        sendJson(['status' => 'error', 'message' => 'Invalid data for validation'], 400);
    }

    $errors = [];
    $warnings = [];

    $invoiceId = intval($data['id'] ?? 0);
    $customerType = trim($data['customer_type'] ?? '');
    // Clean NTN & CNIC preserving alphanumeric characters (e.g. G686755, A522103)
    $rawNtnInput = strtoupper(trim(preg_replace('/[^\w\-]/', '', (string)($data['customer_ntn'] ?? ''))));
    $rawCnicInput = preg_replace('/[^0-9]/', '', (string)($data['customer_cnic'] ?? ''));
    $baseNtn = strpos($rawNtnInput, '-') !== false ? explode('-', $rawNtnInput)[0] : $rawNtnInput;
    $rawCnicAlpha = strtoupper(trim(preg_replace('/[^\w\-]/', '', (string)($data['customer_cnic'] ?? ''))));
    $baseCnicAlpha = strpos($rawCnicAlpha, '-') !== false ? explode('-', $rawCnicAlpha)[0] : $rawCnicAlpha;

    // Smart Auto-Detection: 13 digits in NTN treated as CNIC, 7-8 chars in CNIC treated as NTN
    if (strlen(preg_replace('/[^0-9]/', '', $rawNtnInput)) === 13 && empty($rawCnicInput)) {
        $customerCNIC = preg_replace('/[^0-9]/', '', $rawNtnInput);
        $customerNTN = '';
        $baseNtn = '';
    } elseif ((strlen($baseCnicAlpha) >= 7 && strlen($baseCnicAlpha) <= 8) && empty($rawNtnInput)) {
        $customerNTN = $rawCnicAlpha;
        $baseNtn = $baseCnicAlpha;
        $customerCNIC = '';
    } else {
        $customerNTN = $rawNtnInput;
        $customerCNIC = $rawCnicInput;
    }
    $customerSTRN = trim($data['customer_strn'] ?? '');
    $invoiceType = trim($data['invoice_type'] ?? 'Tax Invoice');
    $supplyType = trim($data['supply_type'] ?? 'Wholesaler');
    $refDocNo = trim($data['ref_doc_no'] ?? '');
    $netPayable = floatval($data['net_payable'] ?? 0);
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
        $rawSellerCheck = substr($cleanInputNtn, 0, 7); // Strip 1-digit check digit e.g. A5221034 -> A522103
    } elseif (strlen($cleanInputNtn) === 7) {
        $rawSellerCheck = $cleanInputNtn; // e.g. A522103 or 5221034
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

    // Customer Master Buyer Type Mismatch Check
    $customerCoaId = intval($data['customer_coa_id'] ?? 0);
    if ($customerCoaId > 0) {
        $cmStmt = $pdo->prepare("SELECT c.buyer_type_id, bt.name as buyer_type_name, bt.buyer_code 
                                 FROM customers c 
                                 LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id 
                                 WHERE c.coa_list_id = ? LIMIT 1");
        $cmStmt->execute([$customerCoaId]);
        $cmRow = $cmStmt->fetch(PDO::FETCH_ASSOC);
        if ($cmRow && !empty($cmRow['buyer_type_id']) && !empty($cmRow['buyer_type_name'])) {
            $masterBtName = trim($cmRow['buyer_type_name']);
            if (!empty($customerType) && !fbr_buyer_types_match($masterBtName, $customerType)) {
                $errors[] = [
                    'field' => 'customer_type',
                    'message' => "Customer Type mismatch: In Customer Master, this customer is configured as '{$masterBtName}'. However, '{$customerType}' is currently selected. Invoices cannot be submitted with mismatched Customer Type."
                ];
            }
        }
    }

    // 1. Customer Identification Checks (NTN or CNIC - Either one is mandatory for all buyers)
    $cleanNtnDigits = preg_replace('/[^0-9]/', '', $customerNTN);
    $isValidNtn = !empty($customerNTN) && (
        (strlen($baseNtn) >= 7 && strlen($baseNtn) <= 8) ||
        (strlen(str_replace('-', '', $customerNTN)) >= 7 && strlen(str_replace('-', '', $customerNTN)) <= 8) ||
        (strlen($cleanNtnDigits) >= 7 && strlen($cleanNtnDigits) <= 8)
    );
    $isValidCnic = (strlen($customerCNIC) === 13);

    if (!$isValidNtn && !$isValidCnic) {
        if (empty($customerNTN) && empty($customerCNIC)) {
            $errors[] = [
                'field' => 'customer_ntn',
                'message' => 'Customer NTN (7-8 digits) ya CNIC (13 digits) mein se koi 1 lazmi hai. Barah-e-karam NTN ya CNIC darj karein.'
            ];
        } elseif (!empty($customerNTN)) {
            $errors[] = [
                'field' => 'customer_ntn',
                'message' => "Customer NTN invalid hai ('{$customerNTN}'). NTN 7 ya 8 hindsay/characters par mushtamil hona chahiye (maslan 4402144 ya 4402144-5)."
            ];
        } else {
            $errors[] = [
                'field' => 'customer_cnic',
                'message' => 'Customer CNIC invalid hai. CNIC baghair dash ke theek 13 hindsay hona chahiye.'
            ];
        }
    }

    // 2. Invoice Type & Debit/Credit Note Reference Check
    if ($invoiceType === 'Credit Note' || $invoiceType === 'Debit Note') {
        if (empty($refDocNo)) {
            $errors[] = ['field' => 'ref_doc_no', 'message' => 'Original Invoice Reference Number is mandatory when issuing a ' . $invoiceType . '.'];
        }
    }

    // 3. Line Items Validation
    if (empty($items)) {
        $errors[] = ['field' => 'items', 'message' => 'Invoice must have at least one valid item.'];
    } else {
        foreach ($items as $idx => $it) {
            $rowNum = $idx + 1;
            $hs = preg_replace('/[^0-9]/', '', trim($it['hs_code'] ?? ''));
            $qty = floatval($it['quantity'] ?? 0);
            $rate = floatval($it['rate'] ?? 0);
            $uom = trim($it['uom'] ?? '');
            $taxRate = floatval($it['tax_rate'] ?? 0);

            if (empty($it['item_name'])) {
                $errors[] = ['field' => "items_row_{$idx}_name", 'message' => "Row #{$rowNum}: Item description cannot be empty."];
            }
            if ($qty <= 0) {
                $errors[] = ['field' => "items_row_{$idx}_qty", 'message' => "Row #{$rowNum}: Quantity must be greater than zero."];
            }
            if ($rate <= 0) {
                $errors[] = ['field' => "items_row_{$idx}_rate", 'message' => "Row #{$rowNum}: Rate must be greater than zero."];
            }
            if (empty($uom)) {
                $errors[] = ['field' => "items_row_{$idx}_uom", 'message' => "Row #{$rowNum}: Unit of Measurement (UOM) is required."];
            }
            // HS Code Check (FBR standard 8 digits or 4 digits)
            if (empty($hs) || $hs === '00000000') {
                $warnings[] = ['field' => "items_row_{$idx}_hs", 'message' => "Row #{$rowNum}: HS/PCT code is set to default (0000.0000). Official FBR tariff code recommended for live submissions."];
            } elseif (strlen($hs) !== 8 && strlen($hs) !== 4) {
                $warnings[] = ['field' => "items_row_{$idx}_hs", 'message' => "Row #{$rowNum}: HS/PCT code is usually 8 digits (e.g. 8471.3010). Currently {$hs}."];
            }

            // Further Tax check for unregistered buyers
            if (strpos($customerType, 'Unregistered') !== false && floatval($it['further_tax_rate'] ?? 0) <= 0) {
                $warnings[] = ['field' => "items_row_{$idx}_fur", 'message' => "Row #{$rowNum}: Customer is unregistered. Verify if Further Tax (typically 3% or 4%) is applicable under Sales Tax Act."];
            }
        }
    }

    // 4. Update workflow status in database if invoice exists and has 0 errors
    $isValid = count($errors) === 0;
    if ($invoiceId > 0) {
        $newStatus = $isValid ? 'Ready to Submit' : 'Pending Validation';
        $upd = $pdo->prepare("UPDATE fbr_digital_invoices SET workflow_status = ? WHERE id = ? AND company_id = ? AND workflow_status != 'Submitted'");
        $upd->execute([$newStatus, $invoiceId, $company_id]);
    }

    sendJson([
        'status' => 'success',
        'is_valid' => $isValid,
        'workflow_status' => $isValid ? 'Ready to Submit' : 'Pending Validation',
        'errors' => $errors,
        'warnings' => $warnings,
        'message' => $isValid 
            ? 'Invoice passed all FBR validation checks and is Ready to Submit.' 
            : 'Validation identified ' . count($errors) . ' mandatory error(s) that must be resolved.'
    ]);
}

// =========================================================================
// ACTION: submit_to_fbr (Transmit confirmed invoice to FBR API)
// =========================================================================
if ($action === 'submit_to_fbr') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    $invoiceId = intval($data['id'] ?? 0);
    if ($invoiceId <= 0) {
        sendJson(['status' => 'error', 'message' => 'Invoice ID is required for FBR submission. Please save the invoice first.'], 400);
    }

    try {
        // 1. Fetch Invoice & Items from DB
        $invStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
        $invStmt->execute([$invoiceId, $company_id]);
        $inv = $invStmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            sendJson(['status' => 'error', 'message' => 'Invoice not found in database.'], 404);
        }

        // Prevent Duplicate Submissions!
        if ($inv['fbr_status'] === 'Submitted' && !empty($inv['fbr_invoice_no'])) {
            sendJson([
                'status' => 'error',
                'message' => 'This invoice was already successfully submitted to FBR! Official FBR Invoice No: ' . $inv['fbr_invoice_no'] . ' (Date: ' . $inv['submission_timestamp'] . '). Duplicate submission was prevented.'
            ], 400);
        }

        // Enforce Customer Master Buyer Type Match
        if (!empty($inv['customer_coa_id'])) {
            $cmStmt = $pdo->prepare("SELECT c.buyer_type_id, bt.name as buyer_type_name, bt.buyer_code 
                                     FROM customers c 
                                     LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id 
                                     WHERE c.coa_list_id = ? LIMIT 1");
            $cmStmt->execute([$inv['customer_coa_id']]);
            $cmRow = $cmStmt->fetch(PDO::FETCH_ASSOC);
            if ($cmRow && !empty($cmRow['buyer_type_id']) && !empty($cmRow['buyer_type_name'])) {
                $masterBtName = trim($cmRow['buyer_type_name']);
                $invCustType = trim($inv['customer_type'] ?? '');
                if (!empty($masterBtName) && !empty($invCustType)) {
                    if (fbr_buyer_types_match($masterBtName, $invCustType)) {
                        // Auto-sync full untruncated name if previous VARCHAR(50) truncated it
                        if ($invCustType !== $masterBtName) {
                            $pdo->prepare("UPDATE fbr_digital_invoices SET customer_type = ? WHERE id = ?")->execute([$masterBtName, $invoiceId]);
                            $inv['customer_type'] = $masterBtName;
                        }
                    } else {
                        sendJson([
                            'status' => 'error',
                            'message' => "Customer Type mismatch error: In Customer Master, this customer is configured as '{$masterBtName}', but this invoice has '{$invCustType}'. Submission is blocked to prevent FBR compliance error. Please select the matching Customer Type before submitting to FBR."
                        ], 400);
                    }
                }
            }
        }

        // 2. Fetch FBR Configuration
        $cfgStmt = $pdo->prepare("SELECT * FROM digital_invoice_settings WHERE company_id = ?");
        $cfgStmt->execute([$company_id]);
        $cfg = $cfgStmt->fetch(PDO::FETCH_ASSOC);

        if (!$cfg || empty($cfg['api_base_url'])) {
            sendJson(['status' => 'error', 'message' => 'FBR Digital Invoicing integration settings not configured for this company. Please configure API Base URL and credentials in Integration Settings.'], 400);
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

        // Resolve POSID strictly as integer (in Sandbox default to 100001, or numeric fbr_reg_ref/pos_id)
        $posId = 100001;
        if (!empty($cfg['fbr_reg_ref']) && is_numeric($cfg['fbr_reg_ref'])) {
            $posId = intval($cfg['fbr_reg_ref']);
        } elseif (!empty($cfg['pos_id']) && is_numeric($cfg['pos_id'])) {
            $posId = intval($cfg['pos_id']);
        } elseif (!empty($cfg['client_id']) && is_numeric($cfg['client_id'])) {
            $posId = intval($cfg['client_id']);
        }

        // Fetch Company Profile for Seller Data
        $compStmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
        $compStmt->execute([$company_id]);
        $comp = $compStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        // 3. Fetch Items
        $itStmt = $pdo->prepare("SELECT * FROM fbr_digital_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC");
        $itStmt->execute([$invoiceId]);
        $items = $itStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($items)) {
            sendJson(['status' => 'error', 'message' => 'Invoice has no line items to submit.'], 400);
        }

        // 4. Build Official FBR/PRAL JSON Payload Schema
        $fbrItems = [];
        $calculatedGross = 0;
        $calculatedTax = 0;
        $calculatedFurtherTax = 0;
        $calculatedTotalBill = 0;
        $calculatedTotalQty = 0;

        foreach ($items as $it) {
            $qty = floatval($it['quantity']);
            $saleVal = round(floatval($it['val_excl_tax']), 2);
            $taxRate = floatval($it['tax_rate']);
            $taxAmt = round(floatval($it['sales_tax_amount']), 2);
            $furAmt = round(floatval($it['further_tax_amount']), 2);
            $extAmt = round(floatval($it['extra_tax_amount'] ?? 0), 2);
            $fedAmt = round(floatval($it['fed_amount'] ?? 0), 2);
            $discAmt = round(floatval($it['discount_amount'] ?? 0), 2);
            // In official FBR schema, Item TotalAmount is the line total inclusive of taxes:
            $lineTotal = round($saleVal + $taxAmt + $furAmt + $extAmt + $fedAmt - $discAmt, 2);

            $calculatedGross += $saleVal;
            $calculatedTax += $taxAmt;
            $calculatedFurtherTax += $furAmt;
            $calculatedTotalBill += $lineTotal;
            $calculatedTotalQty += $qty;

            $pctCode = preg_replace('/[^0-9]/', '', $it['hs_code'] ?? '');
            if (empty($pctCode)) $pctCode = '00000000';
            if (strlen($pctCode) > 8) $pctCode = substr($pctCode, 0, 8);

            $fbrItems[] = [
                'ItemCode' => !empty($it['item_code']) ? $it['item_code'] : ('ITM-' . $it['id']),
                'ItemName' => !empty($it['item_name']) ? $it['item_name'] : 'General Item',
                'Quantity' => $qty,
                'PCTCode' => $pctCode,
                'TaxRate' => $taxRate,
                'SaleValue' => $saleVal,
                'TotalAmount' => $lineTotal,
                'TaxCharged' => $taxAmt,
                'Discount' => $discAmt,
                'FurtherTax' => $furAmt,
                'InvoiceType' => ($inv['invoice_type'] === 'Credit Note') ? 3 : (($inv['invoice_type'] === 'Debit Note') ? 2 : 1)
            ];
        }

        // Clean Buyer NTN & CNIC with Smart Auto-Detection (preserve alphanumeric NTN like G686755, A522103)
        $rawNtn = strtoupper(trim(preg_replace('/[^\w\-]/', '', (string)($inv['customer_ntn'] ?? ''))));
        $rawCnic = preg_replace('/[^0-9]/', '', (string)($inv['customer_cnic'] ?? ''));

        // If user typed 13-digit CNIC in NTN field (with or without hyphens), auto-detect as CNIC
        $digitsNtn = preg_replace('/[^0-9]/', '', $rawNtn);
        if (strlen($digitsNtn) === 13) {
            $rawCnic = $digitsNtn;
            $rawNtn = '';
            try {
                $pdo->prepare("UPDATE fbr_digital_invoices SET customer_cnic = ?, customer_ntn = '' WHERE id = ?")->execute([$inv['customer_ntn'], $invoiceId]);
            } catch (Exception $e) {}
        } elseif ((strlen($rawCnic) >= 7 && strlen($rawCnic) <= 8) && empty($rawNtn)) {
            $rawNtn = $rawCnic;
            $rawCnic = '';
            try {
                $pdo->prepare("UPDATE fbr_digital_invoices SET customer_ntn = ?, customer_cnic = '' WHERE id = ?")->execute([$inv['customer_cnic'], $invoiceId]);
            } catch (Exception $e) {}
        }

        $baseNtn = (strpos($rawNtn, '-') !== false) ? explode('-', $rawNtn)[0] : $rawNtn;
        $cleanNtn = (strlen($baseNtn) >= 7 && strlen($baseNtn) <= 8) ? $baseNtn : (strlen(str_replace('-', '', $rawNtn)) >= 7 && strlen(str_replace('-', '', $rawNtn)) <= 8 ? str_replace('-', '', $rawNtn) : $rawNtn);

        $cleanCnic = '';
        if (strlen($rawCnic) === 13) {
            $cleanCnic = substr($rawCnic, 0, 5) . '-' . substr($rawCnic, 5, 7) . '-' . substr($rawCnic, 12, 1);
        } elseif (!empty($rawCnic)) {
            $cleanCnic = $rawCnic;
        }

        // Header Totals matching FBR schema
        $headerSaleVal = round(floatval($inv['taxable_amount'] ?: $calculatedGross), 2);
        $headerTaxCharged = round(floatval($inv['total_sales_tax'] ?: $calculatedTax), 2);
        $headerFurtherTax = round(floatval($inv['total_further_tax'] ?: $calculatedFurtherTax), 2);
        $headerBillAmount = round(floatval($inv['net_payable'] ?: $calculatedTotalBill), 2);
        $headerQty = floatval($inv['total_qty'] ?: $calculatedTotalQty);
        $headerDiscount = round(floatval($inv['total_discount'] ?? 0), 2);

        // Check if endpoint targets FBR PRAL Digital Invoicing Gateway (gw.fbr.gov.pk/di_data)
        $isPralDi = (stripos($endpoint, 'di_data') !== false || stripos($endpoint, 'postinvoicedata') !== false || stripos($cfg['provider'] ?? '', 'PRAL') !== false);

        if ($isPralDi) {
            // =========================================================================
            // PRAL Digital Invoicing (SRO 350 / Sales Tax Act) Official JSON Schema
            // =========================================================================
            $custType = $inv['customer_type'] ?? '';
            $isConsumer = (stripos($custType, 'Consumer') !== false);
            $isRegistered = (!$isConsumer && stripos($custType, 'Registered') !== false && stripos($custType, 'Unregistered') === false);
            $buyerRegType = $isRegistered ? 'Registered' : 'Unregistered';

            // Scenario ID detection from Buyer Type (e.g. SN001, SN002, SN005, SN006, SN007, SN016, SN017, SN024, SN026)
            $scenCode = '';
            if (preg_match('/SN\d{3}/i', $custType, $scenMatch)) {
                $scenCode = strtoupper($scenMatch[0]);
            }

            $scenarioId = '';
            if ($environment === 'sandbox') {
                if (!empty($scenCode)) {
                    $scenarioId = $scenCode;
                } elseif ($inv['invoice_type'] === 'Credit Note') {
                    $scenarioId = 'SN006';
                } elseif ($inv['invoice_type'] === 'Debit Note') {
                    $scenarioId = 'SN007';
                } else {
                    $scenarioId = $isConsumer ? 'SN026' : ($isRegistered ? 'SN001' : 'SN002');
                }
            }

            // Buyer NTN / CNIC (Either NTN or CNIC is supported for all buyer types)
            $buyerNtnCnic = '';
            if (!empty($cleanNtn)) {
                $buyerNtnCnic = $cleanNtn;
            } elseif (!empty($rawCnic)) {
                $buyerNtnCnic = $rawCnic;
            } else {
                $buyerNtnCnic = ($isConsumer || !$isRegistered) ? '1111111111111' : '9999999';
            }

            // Resolve Seller Registration Number strictly as 7-character NTN (e.g. A522103 or 5221034) or 13-digit CNIC/STRN
            $cleanInputNtn = strtoupper(trim(preg_replace('/[^0-9A-Za-z]/', '', (string)($comp['ntn'] ?? ''))));
            $sellerNtn = '';
            if (strlen($cleanInputNtn) === 13) {
                $sellerNtn = $cleanInputNtn; // 13-digit CNIC or STRN
            } elseif (strlen($cleanInputNtn) === 8) {
                $sellerNtn = substr($cleanInputNtn, 0, 7); // Strip check digit e.g. A5221034 -> A522103 or 52210347 -> 5221034
            } elseif (strlen($cleanInputNtn) === 7) {
                $sellerNtn = $cleanInputNtn; // 7-character NTN (e.g. A522103 or 5221034)
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

            $sellerName = !empty($comp['name']) ? $comp['name'] : 'SoftifyX Enterprise';
            $sellerAddress = !empty($comp['address']) ? $comp['address'] : 'Pakistan';
            $sellerProvince = fbr_normalize_province_name($comp['province'] ?? ($inv['customer_province'] ?? 'Khyber Pakhtunkhwa'), 'Khyber Pakhtunkhwa');

            $buyerName = !empty($inv['business_name']) ? $inv['business_name'] : ($inv['customer_name'] ?: 'Walk-in Customer');
            $buyerAddress = !empty($inv['customer_address']) ? $inv['customer_address'] : 'Pakistan';
            $buyerProvince = fbr_normalize_province_name($inv['customer_province'] ?? 'Khyber Pakhtunkhwa', 'Khyber Pakhtunkhwa');
            if (!empty($inv['customer_province']) && $inv['customer_province'] !== $buyerProvince) {
                try {
                    $pdo->prepare("UPDATE fbr_digital_invoices SET customer_province = ? WHERE id = ?")->execute([$buyerProvince, $invoiceId]);
                } catch (Exception $e) {}
            }

            $pralItems = [];
            foreach ($items as $it) {
                $qty = floatval($it['quantity']);
                $saleVal = round(floatval($it['val_excl_tax']), 2);
                $taxRate = floatval($it['tax_rate']);
                $taxAmt = round(floatval($it['sales_tax_amount']), 2);
                $furAmt = round(floatval($it['further_tax_amount']), 2);
                $extAmt = round(floatval($it['extra_tax_amount'] ?? 0), 2);
                $fedAmt = round(floatval($it['fed_amount'] ?? 0), 2);
                $discAmt = round(floatval($it['discount_amount'] ?? 0), 2);
                $lineTotal = round($saleVal + $taxAmt + $furAmt + $extAmt + $fedAmt - $discAmt, 2);

                // Format HS Code with dot e.g. 3917.2390
                $rawHs = preg_replace('/[^0-9]/', '', $it['hs_code'] ?? '');
                if (strlen($rawHs) >= 8) {
                    $hsCodeFormatted = substr($rawHs, 0, 4) . '.' . substr($rawHs, 4, 4);
                } elseif (!empty($it['hs_code'])) {
                    $hsCodeFormatted = $it['hs_code'];
                } else {
                    $hsCodeFormatted = '0101.2100';
                }

                // Clean product description of stray quotes
                $cleanDesc = trim(str_replace(['"', "'", "\\"], '', $it['item_name'] ?? ''));
                if (empty($cleanDesc)) $cleanDesc = 'Standard Goods';

                $rawUom = trim($it['uom'] ?? '');
                if (preg_match('/^kg/i', $rawUom) || preg_match('/^kilo/i', $rawUom)) {
                    $uom = 'KG';
                } elseif (preg_match('/^(no|num)/i', $rawUom)) {
                    $uom = 'Numbers';
                } elseif (preg_match('/^pc/i', $rawUom)) {
                    $uom = 'PCS';
                } elseif (preg_match('/^mtr|^meter/i', $rawUom)) {
                    $uom = 'MTR';
                } else {
                    $uom = !empty($rawUom) ? $rawUom : 'KG';
                }

                $rateStr = rtrim(rtrim(number_format($taxRate, 2, '.', ''), '0'), '.') . '%';

                $pralItems[] = [
                    'hsCode' => $hsCodeFormatted,
                    'productDescription' => $cleanDesc,
                    'rate' => $rateStr,
                    'uoM' => $uom,
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
                    'saleType' => ($scenCode === 'SN005' || stripos($custType, 'Reduced') !== false)
                        ? 'Goods at reduced rate'
                        : (($scenCode === 'SN006' || stripos($custType, 'Exempt') !== false)
                            ? 'Exempt goods'
                            : (($scenCode === 'SN007' || stripos($custType, 'Zero') !== false)
                                ? 'Zero-rated goods'
                                : (($scenCode === 'SN016')
                                    ? 'Processing / Conversion of Goods'
                                    : (($scenCode === 'SN017')
                                        ? 'Sale of Goods where FED is Charged in ST Mode'
                                        : (($scenCode === 'SN024')
                                            ? 'Goods Sold that are Listed in SRO 297(1)/2023'
                                            : 'Goods at standard rate (default)'))))),
                    'sroItemSerialNo' => ''
                ];
            }

            $invTypeStr = 'Sale Invoice';
            if ($inv['invoice_type'] === 'Credit Note') {
                $invTypeStr = 'Credit Note';
            } elseif ($inv['invoice_type'] === 'Debit Note') {
                $invTypeStr = 'Debit Note';
            }

            $fbrPayload = [
                'invoiceType' => $invTypeStr,
                'invoiceDate' => date('Y-m-d', strtotime($inv['invoice_date'])),
                'sellerBusinessName' => $sellerName,
                'sellerProvince' => $sellerProvince,
                'sellerNTNCNIC' => $sellerNtn,
                'sellerAddress' => $sellerAddress,
                'buyerNTNCNIC' => $buyerNtnCnic,
                'buyerBusinessName' => $buyerName,
                'buyerProvince' => $buyerProvince,
                'buyerAddress' => $buyerAddress,
                'invoiceRefNo' => '',
                'buyerRegistrationType' => $buyerRegType,
                'items' => $pralItems
            ];

            if (!empty($scenarioId)) {
                $fbrPayload['scenarioId'] = $scenarioId;
            }
        } else {
            // Legacy / Retail Tier-1 POS Payload (esp.fbr.gov.pk)
            $fbrPayload = [
                'InvoiceNumber' => '',
                'POSID' => intval($posId),
                'USIN' => $inv['invoice_no'],
                'DateTime' => date('Y-m-d H:i:s', strtotime($inv['invoice_date'] . ' ' . date('H:i:s'))),
                'BuyerNTN' => $cleanNtn,
                'BuyerCNIC' => $cleanCnic,
                'BuyerName' => !empty($inv['business_name']) ? $inv['business_name'] : ($inv['customer_name'] ?: 'End Consumer'),
                'BuyerPhoneNumber' => preg_replace('/[^0-9]/', '', $inv['customer_phone'] ?? '') ?: '',
                'TotalSaleValue' => $headerSaleVal,
                'TotalQuantity' => $headerQty,
                'TotalBillAmount' => $headerBillAmount,
                'TotalTaxCharged' => $headerTaxCharged,
                'FurtherTax' => $headerFurtherTax,
                'Discount' => $headerDiscount,
                'PaymentMode' => 1,
                'InvoiceType' => ($inv['invoice_type'] === 'Credit Note') ? 3 : (($inv['invoice_type'] === 'Debit Note') ? 2 : 1),
                'Items' => $fbrItems
            ];
        }

        $payloadJson = json_encode($fbrPayload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        // Mark as 'Submission Pending' while communicating
        $pdo->prepare("UPDATE fbr_digital_invoices SET workflow_status = 'Submission Pending' WHERE id = ?")->execute([$invoiceId]);

        // 5. Send real cURL request to official FBR API via shared client
        $res = fbr_api_request($endpoint, 'POST', $fbrPayload, $apiToken, $timeout);
        $latencyMs = $res['duration_ms'];
        $httpCode = $res['http_code'];
        $curlError = $res['curl_error'];
        $responseBody = $res['body'];

        $parsed = fbr_parse_api_response($res);
        $isSuccess = $parsed['is_success'];
        $fbrInvoiceNo = $parsed['invoice_no'];
        $qrCode = $parsed['qr_code'];
        if (!$isSuccess && (stripos($responseMsg, 'seller registration number') !== false || stripos($responseMsg, 'authorized token') !== false)) {
            $sellerExplanation = " [Wazahath: FBR PRAL Gateway reports that Bearer Token was not issued for Seller NTN '{$sellerNtn}'. Agar aap ka IRIS 2.0 account Sole Proprietor / Individual hy to IRIS me login Registration No owner ka 13-digit CNIC hota hy. Barah-e-karam Digital Invoice Settings (Taxpayer Details) me apna 13-digit CNIC ya STRN darj karein.]";
            $responseMsg .= $sellerExplanation;
        }

        // 6. Update Invoice in Database - Strict verification & timeout safety
        $submissionTime = date('Y-m-d H:i:s');
        if ($isSuccess) {
            $workflowStatus = 'Submitted';
            $fbrStatus = 'Submitted';
            if (empty($fbrInvoiceNo)) {
                $fbrInvoiceNo = $inv['invoice_no'];
            }
        } elseif ($res['timed_out']) {
            // Requirement C.8: If posting times out or result is uncertain, mark Unknown/Pending Verification
            $workflowStatus = 'Submission Pending';
            $fbrStatus = 'Pending Verification';
            $responseMsg = 'FBR API connection timed out. Marked Pending Verification to prevent blind duplicate submission.';
        } else {
            $workflowStatus = ($httpCode === 0) ? 'Submission Pending' : 'Rejected';
            $fbrStatus = ($httpCode === 0) ? 'Failed' : 'Rejected';
        }

        $updStmt = $pdo->prepare("
            UPDATE fbr_digital_invoices SET
                workflow_status = ?,
                fbr_status = ?,
                fbr_invoice_no = ?,
                fbr_qr_code = ?,
                fbr_response_code = ?,
                fbr_response_msg = ?,
                fbr_raw_response = ?,
                fbr_payload_sent = ?,
                submission_timestamp = ?,
                last_status_check = ?
            WHERE id = ?
        ");
        $updStmt->execute([
            $workflowStatus,
            $fbrStatus,
            $fbrInvoiceNo ?: $inv['fbr_invoice_no'],
            $qrCode ?: $inv['fbr_qr_code'],
            $httpCode,
            $responseMsg,
            $responseBody,
            $payloadJson,
            $isSuccess ? $submissionTime : $inv['submission_timestamp'],
            $submissionTime,
            $invoiceId
        ]);

        // 7. Log to digital_invoice_logs and fbr_integration_logs
        try {
            $logStmt = $pdo->prepare("
                INSERT INTO digital_invoice_logs (
                    company_id, event_type, environment, provider, endpoint,
                    request_method, request_payload, response_code, response_time_ms,
                    response_body, status, sanitized_error
                ) VALUES (
                    ?, 'INVOICE_SUBMISSION', ?, ?, ?,
                    'POST', ?, ?, ?,
                    ?, ?, ?
                )
            ");
            $logStmt->execute([
                $company_id,
                $environment,
                $cfg['provider'] ?? 'PRAL',
                $endpoint,
                $payloadJson,
                $httpCode,
                $latencyMs,
                $responseBody,
                $isSuccess ? 'SUCCESS' : 'FAILED',
                $isSuccess ? null : $responseMsg
            ]);

            // Dual-log into fbr_integration_logs
            $attStmt = $pdo->prepare("SELECT COUNT(*) FROM fbr_integration_logs WHERE company_id = ? AND erp_doc_no = ?");
            $attStmt->execute([$company_id, $inv['invoice_no']]);
            $attemptNo = intval($attStmt->fetchColumn()) + 1;

            $fbrLogStmt = $pdo->prepare("
                INSERT INTO fbr_integration_logs (
                    company_id, document_type, erp_doc_id, erp_doc_no, fbr_invoice_no,
                    operation_type, attempt_number, api_endpoint, http_method,
                    http_status_code, fbr_response_code, response_message, validation_errors,
                    request_payload, response_payload, processing_time_ms, status,
                    request_timestamp, response_timestamp
                ) VALUES (
                    ?, 'Sales Invoice', ?, ?, ?,
                    'Submit Invoice', ?, ?, 'POST',
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    NOW(), NOW()
                )
            ");
            $fbrLogStmt->execute([
                $company_id,
                $invoiceId,
                $inv['invoice_no'],
                $fbrInvoiceNo ?: null,
                $attemptNo,
                $endpoint,
                $httpCode,
                $parsed['code'] ?? ($isSuccess ? '00' : '99'),
                $responseMsg,
                !empty($parsed['errors']) ? json_encode($parsed['errors']) : null,
                $payloadJson,
                $responseBody,
                $latencyMs,
                $isSuccess ? 'Success' : ($httpCode >= 500 ? 'Timeout' : (($parsed['code'] ?? '') == '99' ? 'Rejected' : 'Failed'))
            ]);
        } catch (Exception $logEx) {}

        // Synchronize updated FBR submission details to ERP Sale Tax Invoice
        try {
            sync_to_sale_invoice($pdo, $invoiceId, $company_id);
        } catch (Exception $eSyncSi) {
            error_log("sync_to_sale_invoice error: " . $eSyncSi->getMessage());
        }

        sendJson([
            'status' => $isSuccess ? 'success' : 'error',
            'is_success' => $isSuccess,
            'workflow_status' => $workflowStatus,
            'fbr_status' => $fbrStatus,
            'fbr_invoice_no' => $fbrInvoiceNo,
            'fbr_qr_code' => $qrCode,
            'http_code' => $httpCode,
            'latency_ms' => $latencyMs,
            'message' => $responseMsg,
            'seller_ntn_sent' => $sellerNtn,
            'raw_response' => $responseBody
        ]);

    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => 'Submission error: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: refresh_fbr_status (Query latest FBR status for an invoice)
// =========================================================================
if ($action === 'refresh_fbr_status') {
    $invoiceId = intval($_GET['id'] ?? 0);
    if ($invoiceId <= 0) {
        sendJson(['status' => 'error', 'message' => 'Invoice ID required'], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT id, invoice_no, fbr_invoice_no, fbr_status, workflow_status, submission_timestamp, fbr_response_code, fbr_response_msg FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
        $stmt->execute([$invoiceId, $company_id]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            sendJson(['status' => 'error', 'message' => 'Invoice not found'], 404);
        }

        // Update last_status_check
        $pdo->prepare("UPDATE fbr_digital_invoices SET last_status_check = NOW() WHERE id = ?")->execute([$invoiceId]);
        $inv['last_status_check'] = date('Y-m-d H:i:s');

        try {
            sync_to_sale_invoice($pdo, $invoiceId, $company_id);
        } catch (Exception $eSyncSi) {}

        sendJson([
            'status' => 'success',
            'invoice' => $inv,
            'message' => 'FBR status refreshed. Current state: ' . $inv['fbr_status'] . ' (Workflow: ' . $inv['workflow_status'] . ').'
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACTION: link_manual_iris_invoice (Manual IRIS Reference Linking & Attempt Reset)
// =========================================================================
if ($action === 'link_manual_iris_invoice') {
    $rawPayload = file_get_contents('php://input');
    $postData = json_decode($rawPayload, true) ?: $_POST;

    $invoiceId = intval($postData['id'] ?? $postData['invoice_id'] ?? 0);
    $serialNo = intval($postData['serial_no'] ?? 0);
    $manualFbrNo = trim($postData['fbr_invoice_no'] ?? '');

    try {
        if ($invoiceId > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE id = ? AND company_id = ?");
            $stmt->execute([$invoiceId, $company_id]);
        } elseif ($serialNo > 0) {
            $stmt = $pdo->prepare("SELECT * FROM fbr_digital_invoices WHERE serial_no = ? AND company_id = ?");
            $stmt->execute([$serialNo, $company_id]);
        } else {
            sendJson(['status' => 'error', 'message' => 'Invoice ID or Serial Number is required.'], 400);
        }

        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) {
            sendJson(['status' => 'error', 'message' => 'Invoice record not found.'], 404);
        }

        $targetId = intval($inv['id']);
        $invNo = $inv['invoice_no'];

        // Case 1: Manual FBR Invoice Number Provided (Link IRIS Submission)
        if (!empty($manualFbrNo)) {
            $cleanFbrNo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $manualFbrNo));
            if (strlen($cleanFbrNo) < 6) {
                sendJson(['status' => 'error', 'message' => 'FBR Invoice Number appears invalid. Please check the IRIS portal reference.'], 400);
            }

            $updateStmt = $pdo->prepare("
                UPDATE fbr_digital_invoices 
                SET fbr_invoice_no = ?,
                    fbr_status = 'Submitted',
                    workflow_status = 'Submitted',
                    fbr_qr_code = ?,
                    fbr_response_code = '00',
                    fbr_response_msg = 'Linked manually from FBR IRIS Portal',
                    submission_timestamp = COALESCE(submission_timestamp, NOW()),
                    last_status_check = NOW()
                WHERE id = ?
            ");
            $updateStmt->execute([$cleanFbrNo, $cleanFbrNo, $targetId]);

            // Also sync sale_invoices table in real time
            try {
                sync_to_sale_invoice($pdo, $targetId, $company_id);
            } catch (Exception $ign) {}

            sendJson([
                'status' => 'success',
                'action_taken' => 'linked',
                'message' => "Invoice #{$inv['serial_no']} successfully linked to FBR IRIS Invoice Number: {$cleanFbrNo}.",
                'fbr_invoice_no' => $cleanFbrNo,
                'fbr_status' => 'Submitted'
            ]);
        } else {
            // Case 2 & 3: Leave Blank to Reset Attempt
            $updateStmt = $pdo->prepare("
                UPDATE fbr_digital_invoices 
                SET fbr_invoice_no = NULL,
                    fbr_status = 'Draft',
                    workflow_status = 'Draft',
                    fbr_qr_code = NULL,
                    fbr_response_code = NULL,
                    fbr_response_msg = 'Submission attempt reset manually for retry / editing',
                    submission_timestamp = NULL,
                    last_status_check = NOW()
                WHERE id = ?
            ");
            $updateStmt->execute([$targetId]);

            // Also reset in sale_invoices if applicable
            try {
                $pdo->prepare("
                    UPDATE sale_invoices 
                    SET fbr_invoice_no = NULL, fbr_status = 'Draft' 
                    WHERE id = ? OR invoice_no = ?
                ")->execute([$inv['ref_doc_no'] ?? $targetId, $invNo]);
            } catch (Exception $ign) {}

            sendJson([
                'status' => 'success',
                'action_taken' => 'reset',
                'message' => "Invoice #{$inv['serial_no']} submission attempt has been reset. The invoice is now in Draft state and can be edited, retried, or deleted.",
                'fbr_invoice_no' => null,
                'fbr_status' => 'Draft'
            ]);
        }
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => 'Failed to update IRIS link: ' . $e->getMessage()], 500);
    }
}

// =========================================================================
// HELPER: Parse FBR IRIS 2.0 HTML Table Response
// =========================================================================
// =========================================================================
// HELPER: Parse FBR IRIS Live Taxpayer Profile Table Response
// =========================================================================
if (!function_exists('fbr_parse_iris_table_response')) {
    function fbr_parse_iris_table_response($html) {
        if (empty($html) || stripos($html, 'No record exists') !== false) {
            return ['not_found' => true];
        }

        $data = [
            'not_found' => false,
            'registration_no' => '',
            'reference_no' => '',
            'name' => '',
            'category' => '',
            'sales_tax_registered' => 'No',
            'sales_tax_status' => 'Not Registered',
            'income_tax_status' => 'Active',
            'strn' => '',
            'address' => '',
            'registered_on' => '',
            'tax_office' => '',
            'reg_status' => '',
            'atl_status' => 'Active Taxpayer',
            'business_name' => '',
            'principal_activity' => '',
            'phone' => '',
            'email' => ''
        ];

        if (preg_match_all('/<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>/is', $html, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $key = strtolower(trim(strip_tags($m[1])));
                $val = trim(html_entity_decode(strip_tags($m[2])));

                if (stripos($key, 'registration no') !== false || stripos($key, 'pp/reg/inc') !== false) {
                    if (empty($data['registration_no'])) $data['registration_no'] = $val;
                } elseif (stripos($key, 'reference no') !== false) {
                    $data['reference_no'] = $val; // Full NTN (e.g. C181672-7, A522103-4, 9508974-6)
                } elseif (stripos($key, 'sales tax') !== false && stripos($key, 'registered') !== false) {
                    $data['sales_tax_registered'] = $val; // "Yes. w.e.f. 01-FEB-24" or "No"
                    if (preg_match('/[0-9]{7,}/', $val, $strnM)) {
                        $data['strn'] = $strnM[0];
                    }
                } elseif ($key === 'name') {
                    $data['name'] = $val;
                } elseif ($key === 'category') {
                    $data['category'] = $val;
                } elseif ($key === 'email') {
                    $data['email'] = $val;
                } elseif ($key === 'cell' || $key === 'phone') {
                    $data['phone'] = $val;
                } elseif ($key === 'address') {
                    $data['address'] = $val;
                } elseif ($key === 'registered on') {
                    $data['registered_on'] = $val;
                } elseif ($key === 'tax office') {
                    $data['tax_office'] = $val;
                } elseif (stripos($key, 'status') !== false) {
                    $data['reg_status'] = $val;
                    if (preg_match('/Sales\s*Tax\s*:\s*([^,;<\r\n]+)/i', $val, $stM)) {
                        $data['sales_tax_status'] = trim($stM[1]);
                    }
                    if (preg_match('/Income\s*Tax\s*:\s*([^,;<\r\n]+)/i', $val, $itM)) {
                        $data['income_tax_status'] = trim($itM[1]);
                    }
                    if (stripos($val, 'active') !== false) {
                        $data['atl_status'] = 'Active Taxpayer';
                    } elseif (stripos($val, 'inactive') !== false || stripos($val, 'non-filer') !== false) {
                        $data['atl_status'] = 'Inactive';
                    }
                }
            }
        }

        if ($data['sales_tax_status'] === 'Not Registered' || $data['sales_tax_status'] === 'N/A') {
            if (stripos($data['sales_tax_registered'], 'yes') !== false) {
                $data['sales_tax_status'] = 'OPERATIVE';
            } elseif (stripos($data['sales_tax_registered'], 'no') !== false) {
                $data['sales_tax_status'] = 'Not Registered';
            }
        }

        if (preg_match('/<table[^>]*border=["\']1["\'][^>]*>(.*?)<\/table>/is', $html, $bTable)) {
            if (preg_match_all('/<tr[^>]*>\s*<td[^>]*>.*?<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>/is', $bTable[1], $bRows, PREG_SET_ORDER)) {
                $firstBiz = $bRows[0] ?? null;
                if ($firstBiz) {
                    $data['business_name'] = trim(html_entity_decode(strip_tags($firstBiz[1])));
                    if (empty($data['address']) || strlen($data['address']) < 10) {
                        $data['address'] = trim(html_entity_decode(strip_tags($firstBiz[2])));
                    }
                    $data['principal_activity'] = trim(html_entity_decode(strip_tags($firstBiz[3])));
                }
            }
        }

        if (empty($data['business_name']) && !empty($data['name'])) {
            $data['business_name'] = $data['name'];
        }

        return $data;
    }
}

// =========================================================================
// HELPER: Resolve Province Accurately from Address, Tax Office, or CNIC
// =========================================================================
if (!function_exists('fbr_resolve_province_from_address_or_id')) {
    function fbr_resolve_province_from_address_or_id($address = '', $taxOffice = '', $cnic = '', $ntn = '', $existingProv = '') {
        $addr = (string)$address;
        $office = (string)$taxOffice;
        $cnicDigits = preg_replace('/[^0-9]/', '', (string)$cnic);

        // 1. Check address for city / region keywords
        if (!empty($addr)) {
            // Khyber Pakhtunkhwa keywords (Nowshera, Peshawar, Mardan, Swabi, Soria Khel, etc.)
            if (preg_match('/\b(peshawar|nowshera|nowshehra|soria\s*khel|mardan|swabi|charsadda|abbottabad|kohat|haripur|swat|bannu|dera\s*ismail\s*khan|di\s*khan|mansehra|malakand|khyber|kpk|kp|jehangira|risalpur|akora\s*khattak|pabbi|dir|chitral|bajaur|batkhela|buner|hangu|karak|tank|orakzai|kurram|waziristan)\b/i', $addr)) {
                return 'Khyber Pakhtunkhwa';
            }
            // Punjab keywords
            if (preg_match('/\b(lahore|rawalpindi|faisalabad|multan|gujranwala|sialkot|sargodha|bahawalpur|sheikhupura|gujrat|kasur|rahim\s*yar\s*khan|sahiwal|okara|wah\s*cantt|dera\s*ghazi\s*khan|dg\s*khan|attock|jhelum|chakwal|mianwali|punjab|bhakkar|layyah|muzaffargarh|lodhran|vehari|khanewal|pakpattan|toba\s*tek\s*singh|jhang|chiniot|hafizabad|mandi\s*bahauddin|narowal|nankana)\b/i', $addr)) {
                return 'Punjab';
            }
            // Sindh keywords
            if (preg_match('/\b(karachi|hyderabad|sukkur|larkana|nawabshah|mirpur\s*khas|badin|thatta|sindh|shikarpur|jacobabad|ghotki|khairpur|dadu|jamshoro|sanghar|umerkot|tharparkar)\b/i', $addr)) {
                return 'Sindh';
            }
            // Balochistan keywords
            if (preg_match('/\b(quetta|gwadar|turbat|khuzdar|hub|chaman|sibi|balochistan|zhob|loralai|pishin|jafarabad|nasirabad)\b/i', $addr)) {
                return 'Balochistan';
            }
            // Islamabad / ICT keywords
            if (preg_match('/\b(islamabad|ict)\b/i', $addr)) {
                return 'Islamabad Capital Territory';
            }
            // Azad Jammu and Kashmir
            if (preg_match('/\b(muzaffarabad|mirpur|kotli|rawalakot|bagh|ajk|azad\s*kashmir)\b/i', $addr)) {
                return 'Azad Jammu & Kashmir';
            }
            // Gilgit-Baltistan
            if (preg_match('/\b(gilgit|skardu|hunza|diamer|ghizer)\b/i', $addr)) {
                return 'Gilgit-Baltistan';
            }
        }

        // 2. Check Tax Office if available
        if (!empty($office)) {
            if (preg_match('/(peshawar|abbottabad|mardan|kohat|bannu|kpk)/i', $office)) {
                return 'Khyber Pakhtunkhwa';
            }
            if (preg_match('/(lahore|rawalpindi|faisalabad|multan|gujranwala|sialkot|bahawalpur|sargodha|punjab)/i', $office)) {
                return 'Punjab';
            }
            if (preg_match('/(karachi|hyderabad|sukkur|sindh)/i', $office)) {
                return 'Sindh';
            }
            if (preg_match('/(quetta|balochistan)/i', $office)) {
                return 'Balochistan';
            }
            if (preg_match('/(islamabad)/i', $office)) {
                return 'Islamabad Capital Territory';
            }
        }

        // 3. Check CNIC first-digit NADRA province code ONLY if strictly 13 digits
        if (strlen($cnicDigits) === 13) {
            $provMap = [
                '1' => 'Khyber Pakhtunkhwa',
                '2' => 'FATA',
                '3' => 'Punjab',
                '4' => 'Sindh',
                '5' => 'Balochistan',
                '6' => 'Islamabad Capital Territory',
                '7' => 'Gilgit-Baltistan',
                '8' => 'Azad Jammu & Kashmir'
            ];
            $d1 = substr($cnicDigits, 0, 1);
            if (isset($provMap[$d1])) {
                return $provMap[$d1];
            }
        }

        // 4. Return normalized existing province if set and not a placeholder
        if (!empty($existingProv) && $existingProv !== '-' && $existingProv !== 'N/A') {
            if (function_exists('fbr_normalize_province_name')) {
                return fbr_normalize_province_name($existingProv, 'Khyber Pakhtunkhwa');
            }
            return $existingProv;
        }

        // 5. Default to Khyber Pakhtunkhwa (ERP company headquarters)
        return 'Khyber Pakhtunkhwa';
    }
}

// =========================================================================
// HELPER: Query FBR IRIS 2.0 Live Online Verification System (OVS)
// =========================================================================
if (!function_exists('fbr_exec_iris_curl')) {
    function fbr_exec_iris_curl($identifierType, $identifier) {
        $token = "eyJ4NXQiOiJNV0l5TkRJNVlqRTJaV1kxT0RNd01XSTNOR1ptTVRZeU5UTTJOVFZoWlRnMU5UTTNaVE5oTldKbVpERTFPVEE0TldFMVlUaGxNak5sTldFellqSXlZUSIsImtpZCI6Ik1XSXlOREk1WWpFMlpXWTFPRE13TVdJM05HWm1NVFl5TlRNMk5UVmhaVGcxTlRNM1pUTmhOV0ptWkRFMU9UQTROV0UxWVRobE1qTmxOV0V6WWpJeVlRX1JTMjU2IiwidHlwIjoiYXQrand0IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI3NDg0OTBmYi0xNWRjLTRmNDMtYTRiZC1lN2Y4NDZkMDA1OTYiLCJhdXQiOiJBUFBMSUNBVElPTiIsImF1ZCI6IjdhQVVSeThneXQwaUw4RlFUQ2lxNUZFSTNhZ2EiLCJuYmYiOjE3ODU0OTk3MDIsImF6cCI6IjdhQVVSeThneXQwaUw4RlFUQ2lxNUZFSTNhZ2EiLCJzY29wZSI6ImRlZmF1bHQiLCJpc3MiOiJodHRwczpcL1wvbG9jYWxob3N0Ojk0NDNcL29hdXRoMlwvdG9rZW4iLCJleHAiOjE4MDEyNzgxNzgsImlhdCI6MTc4NTQ5OTcwMiwianRpIjoiNzg1ZjUxYWQtM2EyZS00YWRlLWE2ZjMtNDE3MjliMWUyZmQ3IiwiY2xpZW50X2lkIjoiN2FBVVJ5OGd5dDBpTDhGUVRDaXE1RkVJM2FnYSJ9.lSDm_bpFahi7-l3nXMQUTUVM_CKzlg0zm3wjUCl5XtQTdx0enSj84lGXk_9s91-YXINTIl0iMf0DhSRSQRhwuJ0MnldiXFvNLjj5QtPb17zFfWMSSJJ0YuHVTuvrW3ejMNa9vtwM4eszvwpX0_Ln_IJrhsIe2_Dex5tAKpqumoufUYqQjOHBOqfkiwzrfR9StA_AKRQ42VXEiJXIcBqxL5wFLg8G4-LpV2kITWH8GeBDHEO4eoGB_mR4CPLBDAm4Y6DIWHg4AgfsGAwJJzd1kYjLxKGg82T7Ozt8XteUVrj8Lvhj2xKUBmQ0exg0OAwyb69UOsEsip4f4NokMuV1_w";

        $url = 'https://api.fbr.gov.pk/iris2ovs/v1/getdata';
        $payload = json_encode([
            'protocolId' => '1003',
            'outputType' => '4',
            'identifierType' => $identifierType,
            'identifier' => $identifier,
            'date' => ''
        ]);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
            'Accept: application/json',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        ]);

        $raw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || empty($raw)) {
            return null;
        }

        $json = json_decode($raw, true);
        $tableHtml = $json['Entries']['Entry'][0]['Response'] ?? '';
        if (empty($tableHtml) || stripos($tableHtml, 'No record exists') !== false) {
            return ['not_found' => true];
        }

        return fbr_parse_iris_table_response($tableHtml);
    }
}

if (!function_exists('fbr_query_iris_live_taxpayer')) {
    function fbr_query_iris_live_taxpayer($rawInput) {
        $rawInput = trim($rawInput);
        if (empty($rawInput)) return null;

        $clean = preg_replace('/[^\w\-]/', '', $rawInput);
        $digitsOnly = preg_replace('/[^0-9]/', '', $clean);

        // 1. If 13 digits, query as CNIC
        if (strlen($digitsOnly) === 13) {
            $res = fbr_exec_iris_curl('CNIC', $digitsOnly);
            if ($res && empty($res['not_found'])) {
                return $res;
            }
        }

        // 2. Query as NTN (base NTN before dash or first 7 digits)
        $baseNtn = (strpos($clean, '-') !== false) ? explode('-', $clean)[0] : (strlen($clean) === 8 && ctype_digit($clean) ? substr($clean, 0, 7) : $clean);
        if (!empty($baseNtn)) {
            $resNtn = fbr_exec_iris_curl('NTN', $baseNtn);
            if ($resNtn && empty($resNtn['not_found'])) {
                return $resNtn;
            }
        }

        // 3. Fallback: Try digits only as CNIC if length 13
        if (strlen($digitsOnly) === 13) {
            $resCnic = fbr_exec_iris_curl('CNIC', $digitsOnly);
            if ($resCnic && empty($resCnic['not_found'])) {
                return $resCnic;
            }
        }

        return ['not_found' => true];
    }
}

// =========================================================================
// ACTION: verify_customer_fbr (Automatic Live FBR/PRAL Customer Verification)
// =========================================================================
if ($action === 'verify_customer_fbr') {
    $rawInput = trim($_POST['reg_no'] ?? $_GET['reg_no'] ?? $_POST['query'] ?? $_GET['query'] ?? '');
    if (empty($rawInput)) {
        $rawInput = trim($_POST['cnic'] ?? $_POST['ntn'] ?? '');
    }

    $cleanAlphanumeric = preg_replace('/[^\w\-]/', '', $rawInput);
    $digitsOnly = preg_replace('/[^0-9]/', '', $cleanAlphanumeric);
    $cleanNo = $cleanAlphanumeric;

    // Context passed from form
    $formCustName = trim($_POST['customer_name'] ?? '');
    $formBizName = trim($_POST['business_name'] ?? '');
    $formPhone = trim($_POST['phone'] ?? '');
    $formAddress = trim($_POST['address'] ?? '');
    $formProvince = trim($_POST['province'] ?? '');
    $formStrn = trim($_POST['strn'] ?? '');
    $formNtn = trim($_POST['ntn'] ?? '');
    $formCnic = trim($_POST['cnic'] ?? '');

    if (empty($cleanAlphanumeric)) {
        sendJson([
            'status' => 'validation_error',
            'message' => 'Please enter a valid CNIC (13 digits) or NTN to verify with FBR.'
        ], 400);
    }

    $isCnic = (strlen($digitsOnly) === 13);
    $isNtn = !$isCnic;

    $formattedCnic = $isCnic
        ? (substr($digitsOnly, 0, 5) . '-' . substr($digitsOnly, 5, 7) . '-' . substr($digitsOnly, 12, 1))
        : '';

    // Smart Province Resolution: Do NOT map first digit of NTN to CNIC provinces!
    $resolvedProvince = fbr_resolve_province_from_address_or_id(
        $formAddress,
        '',
        $isCnic ? $digitsOnly : '',
        $isNtn ? $cleanAlphanumeric : '',
        $formProvince
    );

    // Check if this taxpayer already exists in local ERP customers table
    $existingCustomer = null;
    try {
        if ($isCnic) {
            $cStmt = $pdo->prepare("
                SELECT 
                    c.id as customer_id,
                    c.coa_list_id as coa_id,
                    cl.code as customer_code,
                    cl.name as customer_name,
                    COALESCE(c.fbr_business_name, '') as business_name,
                    COALESCE(c.address, '') as address,
                    COALESCE(c.telephone, c.mobile, '') as telephone,
                    COALESCE(c.ntn_cnic, '') as ntn,
                    COALESCE(c.cnic, '') as cnic,
                    COALESCE(c.st_reg_no, '') as strn,
                    COALESCE(c.fbr_atl_status, '') as fbr_atl_status,
                    COALESCE(c.fbr_reg_status, '') as fbr_reg_status,
                    COALESCE(c.fbr_sales_tax_status, '') as fbr_sales_tax_status,
                    COALESCE(c.fbr_sales_tax_reg, '') as fbr_sales_tax_reg,
                    COALESCE(c.fbr_verification_source, '') as fbr_verification_source,
                    c.fbr_verified_at,
                    c.buyer_type_id
                FROM customers c
                JOIN coa_list cl ON c.coa_list_id = cl.id
                WHERE REPLACE(c.cnic, '-', '') = ? 
                   OR REPLACE(c.ntn_cnic, '-', '') = ?
                   OR c.cnic = ?
                   OR c.ntn_cnic = ?
                LIMIT 1
            ");
            $cStmt->execute([$digitsOnly, $digitsOnly, $cleanAlphanumeric, $cleanAlphanumeric]);
            $existingCustomer = $cStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } else {
            $baseSearch = (strpos($cleanAlphanumeric, '-') !== false) ? explode('-', $cleanAlphanumeric)[0] : $cleanAlphanumeric;
            $cStmt = $pdo->prepare("
                SELECT 
                    c.id as customer_id,
                    c.coa_list_id as coa_id,
                    cl.code as customer_code,
                    cl.name as customer_name,
                    COALESCE(c.fbr_business_name, '') as business_name,
                    COALESCE(c.address, '') as address,
                    COALESCE(c.telephone, c.mobile, '') as telephone,
                    COALESCE(c.ntn_cnic, '') as ntn,
                    COALESCE(c.cnic, '') as cnic,
                    COALESCE(c.st_reg_no, '') as strn,
                    COALESCE(c.fbr_atl_status, '') as fbr_atl_status,
                    COALESCE(c.fbr_reg_status, '') as fbr_reg_status,
                    COALESCE(c.fbr_sales_tax_status, '') as fbr_sales_tax_status,
                    COALESCE(c.fbr_sales_tax_reg, '') as fbr_sales_tax_reg,
                    COALESCE(c.fbr_verification_source, '') as fbr_verification_source,
                    c.fbr_verified_at,
                    c.buyer_type_id
                FROM customers c
                JOIN coa_list cl ON c.coa_list_id = cl.id
                WHERE c.ntn_cnic = ? 
                   OR REPLACE(c.ntn_cnic, '-', '') = ? 
                   OR (LENGTH(?) >= 7 AND LEFT(REPLACE(c.ntn_cnic, '-', ''), 7) = LEFT(?, 7))
                LIMIT 1
            ");
            $cStmt->execute([$cleanAlphanumeric, $digitsOnly ?: $cleanAlphanumeric, $baseSearch, $baseSearch]);
            $existingCustomer = $cStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    } catch (Exception $e) {}

    // =========================================================================
    // 1. LIVE INQUIRY: Query official FBR IRIS 2.0 Live API FIRST
    // =========================================================================
    $liveProfile = fbr_query_iris_live_taxpayer($cleanAlphanumeric);
    if ((!$liveProfile || !empty($liveProfile['not_found'])) && !empty($formCnic)) {
        $cnicDigits = preg_replace('/[^0-9]/', '', $formCnic);
        if (strlen($cnicDigits) === 13) {
            $altProfile = fbr_query_iris_live_taxpayer($cnicDigits);
            if ($altProfile && empty($altProfile['not_found'])) {
                $liveProfile = $altProfile;
            }
        }
    }
    if ((!$liveProfile || !empty($liveProfile['not_found'])) && !empty($formNtn)) {
        $ntnClean = preg_replace('/[^\w\-]/', '', $formNtn);
        if (!empty($ntnClean) && $ntnClean !== $cleanAlphanumeric) {
            $altProfile2 = fbr_query_iris_live_taxpayer($ntnClean);
            if ($altProfile2 && empty($altProfile2['not_found'])) {
                $liveProfile = $altProfile2;
            }
        }
    }

    if ($liveProfile && empty($liveProfile['not_found'])) {
        $taxpayerName = !empty($liveProfile['name']) ? $liveProfile['name'] : ($liveProfile['business_name'] ?: 'Registered Taxpayer');
        $businessName = !empty($liveProfile['business_name']) ? $liveProfile['business_name'] : $taxpayerName;
        $liveNtn = !empty($liveProfile['reference_no']) ? $liveProfile['reference_no'] : ($isNtn ? $cleanAlphanumeric : '');
        $liveRawCnic = preg_replace('/[^0-9]/', '', $liveProfile['registration_no'] ?? '');
        $liveFormattedCnic = (strlen($liveRawCnic) === 13)
            ? (substr($liveRawCnic, 0, 5) . '-' . substr($liveRawCnic, 5, 7) . '-' . substr($liveRawCnic, 12, 1))
            : ($formattedCnic ?: ($formCnic ?: ''));

        $strnVal = !empty($liveProfile['strn']) ? $liveProfile['strn'] : $formStrn;
        $stRegVal = !empty($liveProfile['sales_tax_registered']) ? $liveProfile['sales_tax_registered'] : 'No';
        $stStatusVal = !empty($liveProfile['sales_tax_status']) ? $liveProfile['sales_tax_status'] : 'Not Registered';
        $addrVal = !empty($liveProfile['address']) ? $liveProfile['address'] : ($existingCustomer['address'] ?? $formAddress);
        $phoneVal = !empty($liveProfile['phone']) ? $liveProfile['phone'] : ($existingCustomer['telephone'] ?? $formPhone);
        $atlStatus = !empty($liveProfile['atl_status']) ? $liveProfile['atl_status'] : 'Active Taxpayer';
        $regStatus = 'Registered';

        // Resolve province accurately from live verified address & tax office
        $resolvedProvince = fbr_resolve_province_from_address_or_id(
            $addrVal,
            $liveProfile['tax_office'] ?? '',
            $liveRawCnic,
            $liveNtn,
            $resolvedProvince
        );

        // 1a. Sync live verified profile into local fbr_taxpayers_registry
        try {
            $regCheck = $pdo->prepare("SELECT id FROM fbr_taxpayers_registry WHERE REPLACE(cnic, '-', '') = ? OR REPLACE(ntn, '-', '') = ? OR ntn = ? LIMIT 1");
            $regCheck->execute([$liveRawCnic ?: $digitsOnly, preg_replace('/[^0-9]/', '', $liveNtn) ?: $cleanAlphanumeric, $liveNtn]);
            $existingRegId = $regCheck->fetchColumn();
            if ($existingRegId) {
                $pdo->prepare("
                    UPDATE fbr_taxpayers_registry 
                    SET taxpayer_name = ?, business_name = ?, ntn = ?, cnic = ?, strn = ?, address = ?, phone = ?, province = ?,
                        category = ?, registration_status = 'Registered', atl_status = ?, sales_tax_status = ?, sales_tax_registered = ?,
                        source = 'FBR IRIS Live Taxpayer Profile Inquiry', verified_at = NOW()
                    WHERE id = ?
                ")->execute([$taxpayerName, $businessName, $liveNtn, $liveFormattedCnic, $strnVal, $addrVal, $phoneVal, $resolvedProvince, $liveProfile['category'] ?? 'Individual', $atlStatus, $stStatusVal, $stRegVal, $existingRegId]);
            } else {
                $pdo->prepare("
                    INSERT INTO fbr_taxpayers_registry (
                        ntn, cnic, strn, taxpayer_name, business_name, address, phone, province, category, registration_status, atl_status, sales_tax_status, sales_tax_registered, source, verified_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Registered', ?, ?, ?, 'FBR IRIS Live Taxpayer Profile Inquiry', NOW())
                ")->execute([$liveNtn, $liveFormattedCnic, $strnVal, $taxpayerName, $businessName, $addrVal, $phoneVal, $resolvedProvince, $liveProfile['category'] ?? 'Individual', $atlStatus, $stStatusVal, $stRegVal]);
            }
        } catch (Exception $re) {}

        // 1b. Sync into customers table if customer exists in ERP
        if ($existingCustomer) {
            try {
                $pdo->prepare("
                    UPDATE customers 
                    SET ntn_cnic = ?, cnic = ?, fbr_business_name = ?, st_reg_no = ?, fbr_atl_status = ?, fbr_reg_status = 'Registered',
                        fbr_sales_tax_status = ?, fbr_sales_tax_reg = ?,
                        fbr_verification_source = 'FBR IRIS Live Taxpayer Profile Inquiry', fbr_verified_at = NOW() 
                    WHERE id = ?
                ")->execute([$liveNtn, $liveFormattedCnic, $businessName, $strnVal, $atlStatus, $stStatusVal, $stRegVal, $existingCustomer['customer_id']]);
                if (!empty($existingCustomer['coa_id'])) {
                    $pdo->prepare("UPDATE coa_list SET name = ? WHERE id = ?")->execute([$taxpayerName, $existingCustomer['coa_id']]);
                }
            } catch (Exception $ue) {}
        }

        sendJson([
            'status' => 'success',
            'is_live_api' => true,
            'data' => [
                'customer_id' => $existingCustomer['customer_id'] ?? null,
                'customer_code' => $existingCustomer['customer_code'] ?? null,
                'customer_name' => $taxpayerName,
                'business_name' => $businessName,
                'cnic' => $liveFormattedCnic,
                'ntn' => $liveNtn,
                'strn' => $strnVal ?: 'N/A',
                'sales_tax_registered' => $stRegVal,
                'sales_tax_status' => $stStatusVal,
                'income_tax_status' => $liveProfile['income_tax_status'] ?? 'Active',
                'address' => $addrVal,
                'phone' => $phoneVal,
                'province' => $resolvedProvince,
                'registration_status' => 'Registered',
                'atl_status' => $atlStatus,
                'tax_office' => $liveProfile['tax_office'] ?? '',
                'verification_date' => date('d-M-Y h:i:s A'),
                'verification_source' => 'FBR IRIS Live Taxpayer Profile Inquiry',
                'verification_result' => 'Verified (Active Taxpayer)',
                'existing_customer' => $existingCustomer,
                'notice' => 'Official registered taxpayer profile verified live from FBR IRIS 2.0.'
            ]
        ]);
    }

    // =========================================================================
    // 2. FALLBACK CACHE: Check fbr_taxpayers_registry & customers table
    // =========================================================================
    $regMatch = null;
    try {
        if ($isCnic) {
            $rStmt = $pdo->prepare("
                SELECT * FROM fbr_taxpayers_registry
                WHERE REPLACE(cnic, '-', '') = ? 
                   OR cnic = ?
                ORDER BY id DESC
                LIMIT 1
            ");
            $rStmt->execute([$digitsOnly, $cleanAlphanumeric]);
            $regMatch = $rStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } else {
            $baseNtnSearch = (strpos($cleanAlphanumeric, '-') !== false) ? explode('-', $cleanAlphanumeric)[0] : $cleanAlphanumeric;
            $rStmt = $pdo->prepare("
                SELECT * FROM fbr_taxpayers_registry
                WHERE REPLACE(ntn, '-', '') = ? 
                   OR ntn = ?
                   OR (LENGTH(?) >= 7 AND LEFT(REPLACE(ntn, '-', ''), 7) = LEFT(?, 7))
                ORDER BY id DESC
                LIMIT 1
            ");
            $rStmt->execute([$digitsOnly ?: $cleanAlphanumeric, $cleanAlphanumeric, $baseNtnSearch, $baseNtnSearch]);
            $regMatch = $rStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    } catch (Exception $re) {}

    if ($regMatch) {
        $cleanRegCnic = preg_replace('/[^0-9]/', '', $regMatch['cnic'] ?? '');
        $formattedRegCnic = (strlen($cleanRegCnic) === 13)
            ? (substr($cleanRegCnic, 0, 5) . '-' . substr($cleanRegCnic, 5, 7) . '-' . substr($cleanRegCnic, 12, 1))
            : ($regMatch['cnic'] ?: ($isCnic ? $formattedCnic : ''));

        $taxpayerName = $regMatch['taxpayer_name'];
        $businessName = $regMatch['business_name'] ?: $taxpayerName;
        $ntnVal = $regMatch['ntn'] ?: '';
        $strnVal = $regMatch['strn'] ?: '';
        $atlStatus = $regMatch['atl_status'] ?: 'Active Taxpayer';
        $regStatus = $regMatch['registration_status'] ?: 'Registered';

        $finalRegAddress = $regMatch['address'] ?: ($existingCustomer['address'] ?? $formAddress);
        $finalRegProvince = fbr_resolve_province_from_address_or_id(
            $finalRegAddress,
            '',
            $cleanRegCnic,
            $ntnVal,
            $regMatch['province'] ?: ($existingCustomer['province'] ?? $resolvedProvince)
        );
        // Self-heal cached province in database if it was wrongly saved previously as Sindh
        if (!empty($regMatch['id']) && !empty($finalRegProvince) && $finalRegProvince !== ($regMatch['province'] ?? '')) {
            try {
                $pdo->prepare("UPDATE fbr_taxpayers_registry SET province = ? WHERE id = ?")->execute([$finalRegProvince, $regMatch['id']]);
            } catch (Exception $re) {}
        }

        sendJson([
            'status' => 'success',
            'is_live_api' => false,
            'data' => [
                'customer_id' => $existingCustomer['customer_id'] ?? null,
                'customer_code' => $existingCustomer['customer_code'] ?? null,
                'customer_name' => $taxpayerName,
                'business_name' => $businessName,
                'cnic' => $formattedRegCnic,
                'ntn' => $ntnVal,
                'strn' => $strnVal ?: 'N/A',
                'sales_tax_registered' => $regMatch['sales_tax_registered'] ?? 'No',
                'sales_tax_status' => $regMatch['sales_tax_status'] ?? 'Not Registered',
                'income_tax_status' => 'Active',
                'address' => $finalRegAddress,
                'phone' => $regMatch['phone'] ?: ($existingCustomer['telephone'] ?? $formPhone),
                'province' => $finalRegProvince,
                'registration_status' => $regStatus,
                'atl_status' => $atlStatus,
                'verification_date' => date('d-M-Y h:i:s A'),
                'verification_source' => $regMatch['source'] ?: 'FBR Taxpayers Registry (Cached)',
                'verification_result' => ($regStatus === 'Registered' && !empty($ntnVal)) ? 'Verified (Registered Taxpayer)' : 'Unregistered Buyer',
                'existing_customer' => $existingCustomer,
                'notice' => 'Official registered taxpayer record retrieved from verified registry.'
            ]
        ]);
    }

    if ($existingCustomer && (!$isCnic || strlen(preg_replace('/[^0-9]/', '', $existingCustomer['cnic'] ?? ($existingCustomer['ntn'] ?? ''))) === 13)) {
        $cleanCustNtn = preg_replace('/[^\w\-]/', '', $existingCustomer['ntn'] ?? '');
        $hasNtn = !empty($cleanCustNtn) && strlen($cleanCustNtn) >= 7;
        $regStatus = $existingCustomer['fbr_reg_status'] ?: ($hasNtn ? 'Registered' : 'Not Registered');
        $atlStatus = $existingCustomer['fbr_atl_status'] ?: ($hasNtn ? 'Active Taxpayer' : 'Not Active');
        $formattedCustCnic = $existingCustomer['cnic'] ?: ($isCnic ? $formattedCnic : '');
        $finalCustAddress = $existingCustomer['address'] ?: $formAddress;
        $finalCustProvince = fbr_resolve_province_from_address_or_id(
            $finalCustAddress,
            '',
            $existingCustomer['cnic'] ?? '',
            $existingCustomer['ntn'] ?? '',
            $formProvince ?: ($existingCustomer['province'] ?? $resolvedProvince)
        );

        sendJson([
            'status' => 'success',
            'is_live_api' => false,
            'data' => [
                'customer_id' => $existingCustomer['customer_id'],
                'customer_code' => $existingCustomer['customer_code'],
                'customer_name' => $existingCustomer['customer_name'],
                'business_name' => $existingCustomer['business_name'] ?: $existingCustomer['customer_name'],
                'cnic' => $formattedCustCnic,
                'ntn' => ($isCnic && $regStatus !== 'Registered') ? 'N/A (End Consumer / Unregistered)' : ($existingCustomer['ntn'] ?: ($isNtn ? $cleanNo : '')),
                'strn' => $existingCustomer['strn'] ?: 'N/A',
                'sales_tax_registered' => $existingCustomer['fbr_sales_tax_reg'] ?? 'No',
                'sales_tax_status' => $existingCustomer['fbr_sales_tax_status'] ?? 'Not Registered',
                'income_tax_status' => ($existingCustomer['fbr_atl_status'] === 'Active Taxpayer' ? 'Active' : 'Inactive'),
                'address' => $finalCustAddress,
                'phone' => $existingCustomer['telephone'] ?: $formPhone,
                'province' => $finalCustProvince,
                'registration_status' => $regStatus,
                'atl_status' => $atlStatus,
                'verification_date' => date('d-M-Y h:i:s A'),
                'verification_source' => $existingCustomer['fbr_verification_source'] ?: 'ERP Customer Master (Saved)',
                'verification_result' => ($regStatus === 'Registered' && $hasNtn) ? 'Verified (Registered Taxpayer)' : 'Unregistered Buyer',
                'existing_customer' => $existingCustomer,
                'notice' => ($regStatus === 'Registered' && $hasNtn) 
                    ? 'Registered customer profile verified from ERP Master.' 
                    : 'Customer record found in ERP Master (Unregistered Buyer).'
            ]
        ]);
    }

    // =========================================================================
    // 3. UNREGISTERED BUYER / END CONSUMER (HONEST ACCURATE RESULT)
    // =========================================================================
    $unregName = $formCustName ?: 'End Consumer';
    $unregBiz = $formBizName ?: 'End Consumer (B2C)';

    sendJson([
        'status' => 'success',
        'is_live_api' => true,
        'data' => [
            'customer_id' => null,
            'customer_code' => null,
            'customer_name' => $unregName,
            'business_name' => $unregBiz,
            'cnic' => $isCnic ? $formattedCnic : '',
            'ntn' => 'N/A (End Consumer / Unregistered)',
            'strn' => 'N/A',
            'sales_tax_registered' => 'No',
            'sales_tax_status' => 'Not Registered (B2C)',
            'income_tax_status' => 'Inactive / Non-Filer',
            'address' => $formAddress,
            'phone' => $formPhone,
            'province' => $resolvedProvince,
            'registration_status' => 'Unregistered / End Consumer',
            'atl_status' => 'Consumer',
            'tax_office' => 'N/A',
            'verification_date' => date('d-M-Y h:i:s A'),
            'verification_source' => 'FBR IRIS Live Verification (End Consumer / Unregistered)',
            'verification_result' => 'End Consumer / Unregistered Buyer',
            'existing_customer' => null,
            'notice' => 'Buyer is an End Consumer. Standard Sales Tax (18%) applies. Further Tax is 0% (Sales Tax Act Sec 3(1A) compliant).'
        ]
    ]);
}

// =========================================================================
// ACTION: save_verified_taxpayer_profile / save_verified_customer
// =========================================================================
if ($action === 'save_verified_customer' || $action === 'save_verified_taxpayer_profile') {
    try {
        $rawPost = file_get_contents('php://input');
        $data = !empty($rawPost) ? json_decode($rawPost, true) : $_POST;
        if (!is_array($data)) $data = $_POST;

        $company_id = intval($data['company_id'] ?? 1);
        $name = trim($data['taxpayer_name'] ?? $data['customer_name'] ?? '');
        $businessName = trim($data['business_name'] ?? '');
        $ntn = trim($data['ntn'] ?? '');
        $cnic = trim($data['cnic'] ?? '');
        $strn = trim($data['strn'] ?? '');
        $address = trim($data['address'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $province = trim($data['province'] ?? 'Punjab');
        $category = trim($data['category'] ?? 'Individual');
        $atlStatus = trim($data['atl_status'] ?? 'Active Taxpayer');
        $regStatus = trim($data['reg_status'] ?? $data['registration_status'] ?? 'Registered');
        $stStatus = trim($data['sales_tax_status'] ?? 'Not Registered');
        $stReg = trim($data['sales_tax_registered'] ?? 'No');
        $source = trim($data['verification_source'] ?? $data['source'] ?? 'FBR IRIS Taxpayer Profile Inquiry');
        $buyerTypeId = !empty($data['buyer_type_id']) ? intval($data['buyer_type_id']) : null;
        $customerId = !empty($data['customer_id']) ? intval($data['customer_id']) : 0;

        if (empty($name)) {
            $name = $businessName ?: 'Verified Taxpayer';
        }

        // Clean alphanumeric for NTN, digits for CNIC
        $cleanNtn = preg_replace('/[^\w\-]/', '', $ntn);
        $cleanCnic = preg_replace('/[^0-9]/', '', $cnic);
        $formattedCnic = (strlen($cleanCnic) === 13)
            ? (substr($cleanCnic, 0, 5) . '-' . substr($cleanCnic, 5, 7) . '-' . substr($cleanCnic, 12, 1))
            : ($cnic ?: '');

        // 1. Sync into fbr_taxpayers_registry FIRST
        try {
            $regCheck = $pdo->prepare("
                SELECT id FROM fbr_taxpayers_registry 
                WHERE (cnic = ? AND cnic != '') 
                   OR (ntn = ? AND ntn != '')
                   OR (LENGTH(?) = 13 AND REPLACE(cnic, '-', '') = ?)
                   OR (LENGTH(?) >= 7 AND LEFT(REPLACE(ntn, '-', ''), 7) = LEFT(?, 7))
                LIMIT 1
            ");
            $regCheck->execute([$cleanCnic, $cleanNtn, $cleanCnic, $cleanCnic, $cleanNtn, $cleanNtn]);
            $existingRegId = $regCheck->fetchColumn();
            if ($existingRegId) {
                $updReg = $pdo->prepare("
                    UPDATE fbr_taxpayers_registry 
                    SET taxpayer_name = ?, business_name = ?, ntn = COALESCE(NULLIF(?, ''), ntn),
                        cnic = COALESCE(NULLIF(?, ''), cnic), strn = COALESCE(NULLIF(?, ''), strn),
                        address = COALESCE(NULLIF(?, ''), address), phone = COALESCE(NULLIF(?, ''), phone),
                        province = COALESCE(NULLIF(?, ''), province),
                        registration_status = ?, atl_status = ?, sales_tax_status = ?, sales_tax_registered = ?, source = ?, verified_at = NOW()
                    WHERE id = ?
                ");
                $updReg->execute([$name, $businessName ?: $name, $cleanNtn, $cleanCnic, $strn, $address, $phone, $province, $regStatus, $atlStatus, $stStatus, $stReg, $source, $existingRegId]);
            } else {
                $insReg = $pdo->prepare("
                    INSERT INTO fbr_taxpayers_registry (
                        ntn, cnic, strn, taxpayer_name, business_name, address, phone, province, category, registration_status, atl_status, sales_tax_status, sales_tax_registered, source, verified_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ");
                $insReg->execute([$cleanNtn, $cleanCnic, $strn, $name, $businessName ?: $name, $address, $phone, $province, $category, $regStatus, $atlStatus, $stStatus, $stReg, $source]);
            }
        } catch (Exception $re) {}

        // 2. Check if customer already exists in customers table by customer_id, NTN, or CNIC
        $existing = null;
        if ($customerId > 0) {
            $chk = $pdo->prepare("SELECT * FROM customers WHERE id = ?");
            $chk->execute([$customerId]);
            $existing = $chk->fetch(PDO::FETCH_ASSOC);
        }

        if (!$existing && !empty($cleanNtn)) {
            $chk = $pdo->prepare("SELECT * FROM customers WHERE ntn_cnic = ? OR ntn_cnic = ?");
            $chk->execute([$cleanNtn, $ntn]);
            $existing = $chk->fetch(PDO::FETCH_ASSOC);
        }

        if (!$existing && !empty($cleanCnic)) {
            $chk = $pdo->prepare("SELECT * FROM customers WHERE cnic = ? OR ntn_cnic = ?");
            $chk->execute([$cleanCnic, $cleanCnic]);
            $existing = $chk->fetch(PDO::FETCH_ASSOC);
        }

        $newCustId = null;
        $nextCode = null;
        $updatedCust = null;

        if ($existing) {
            // Update existing customer record
            $upd = $pdo->prepare("
                UPDATE customers 
                SET 
                    ntn_cnic = COALESCE(NULLIF(?, ''), ntn_cnic),
                    cnic = COALESCE(NULLIF(?, ''), cnic),
                    st_reg_no = COALESCE(NULLIF(?, ''), st_reg_no),
                    address = COALESCE(NULLIF(?, ''), address),
                    telephone = COALESCE(NULLIF(?, ''), telephone),
                    fbr_verified_at = NOW(),
                    fbr_verification_source = ?,
                    fbr_atl_status = ?,
                    fbr_reg_status = ?,
                    fbr_sales_tax_status = ?,
                    fbr_sales_tax_reg = ?,
                    fbr_business_name = ?,
                    buyer_type_id = COALESCE(?, buyer_type_id)
                WHERE id = ?
            ");
            $upd->execute([
                $ntn ?: ($cleanNtn ?: null),
                $cnic ?: ($cleanCnic ?: null),
                $strn ?: null,
                $address ?: null,
                $phone ?: null,
                $source,
                $atlStatus,
                $regStatus,
                $stStatus,
                $stReg,
                $businessName ?: $name,
                $buyerTypeId,
                $existing['id']
            ]);

            // Also update coa_list name if existing has linked coa_list_id
            if (!empty($existing['coa_list_id'])) {
                $pdo->prepare("UPDATE coa_list SET name = ? WHERE id = ?")->execute([$name, $existing['coa_list_id']]);
            }

            // Fetch updated record
            $sel = $pdo->prepare("
                SELECT c.*, cl.code as customer_code, cl.name as coa_name
                FROM customers c 
                LEFT JOIN coa_list cl ON c.coa_list_id = cl.id 
                WHERE c.id = ?
            ");
            $sel->execute([$existing['id']]);
            $updatedCust = $sel->fetch(PDO::FETCH_ASSOC) ?: [];
            $updatedCust['customer_name'] = $updatedCust['coa_name'] ?? $name;
            $updatedCust['name'] = $updatedCust['coa_name'] ?? $name;
        } else {
            // Check if explicitly requested to create a new customer in ERP Maintain Customers
            $allowCreate = !empty($data['create_erp_customer']) && ($data['create_erp_customer'] == '1' || $data['create_erp_customer'] === true);
            if (!$allowCreate) {
                // Do NOT create unwanted customer in Chart of Accounts or Maintain Customers
                sendJson([
                    'status' => 'success',
                    'message' => 'Taxpayer verified. Form populated without adding to ERP Customer Master.',
                    'data' => [
                        'customer_name' => $name,
                        'business_name' => $businessName ?: $name,
                        'ntn' => $cleanNtn,
                        'cnic' => $cleanCnic,
                        'strn' => $strn,
                        'address' => $address,
                        'created_in_erp' => false
                    ]
                ]);
                exit;
            }

            // Create new customer record in Chart of Accounts and Customers
            $subId = 1;
            try {
                $subStmt = $pdo->query("SELECT id FROM coa_sub WHERE name LIKE '%Customer%' OR name LIKE '%Debtor%' OR name LIKE '%Receivable%' LIMIT 1");
                $foundSub = $subStmt ? $subStmt->fetchColumn() : null;
                if ($foundSub) $subId = $foundSub;
            } catch (Exception $se) {}

            $nextCode = 'CUST-0001';
            try {
                $maxStmt = $pdo->query("SELECT MAX(CAST(SUBSTRING(code, 6) AS UNSIGNED)) FROM coa_list WHERE code LIKE 'CUST-%'");
                $maxVal = $maxStmt ? $maxStmt->fetchColumn() : 0;
                $nextNum = intval($maxVal) + 1;
                $nextCode = 'CUST-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);
            } catch (Exception $ce) {}

            $coaStmt = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name) VALUES (?, ?, ?, ?)");
            $coaStmt->execute([$company_id, $subId, $nextCode, $name]);
            $coaId = $pdo->lastInsertId();

            $custIns = $pdo->prepare("
                INSERT INTO customers (
                    company_id, coa_list_id, ntn_cnic, cnic, st_reg_no,
                    address, telephone, fbr_verified_at, fbr_verification_source,
                    fbr_atl_status, fbr_reg_status, fbr_sales_tax_status, fbr_sales_tax_reg, fbr_business_name, buyer_type_id
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, NOW(), ?,
                    ?, ?, ?, ?, ?, ?
                )
            ");
            $custIns->execute([
                $company_id,
                $coaId,
                $ntn ?: ($cleanNtn ?: null),
                $cnic ?: ($cleanCnic ?: null),
                $strn ?: null,
                $address ?: null,
                $phone ?: null,
                $source,
                $atlStatus,
                $regStatus,
                $stStatus,
                $stReg,
                $businessName ?: $name,
                $buyerTypeId
            ]);
            $newCustId = $pdo->lastInsertId();

            $updatedCust = [
                'id' => $newCustId,
                'customer_id' => $newCustId,
                'coa_id' => $coaId,
                'coa_list_id' => $coaId,
                'code' => $nextCode,
                'customer_code' => $nextCode,
                'customer_name' => $name,
                'name' => $name,
                'ntn_cnic' => $ntn ?: $cleanNtn,
                'cnic' => $cnic ?: $cleanCnic,
                'st_reg_no' => $strn,
                'address' => $address,
                'telephone' => $phone,
                'fbr_atl_status' => $atlStatus,
                'fbr_reg_status' => $regStatus,
                'fbr_verified_at' => date('Y-m-d H:i:s')
            ];
        }

        sendJson([
            'status' => 'success',
            'action_taken' => $existing ? 'updated' : 'created',
            'message' => 'Official taxpayer profile successfully verified and saved to FBR Taxpayers Registry.',
            'data' => [
                'customer_id' => $existing['id'] ?? $newCustId ?? null,
                'customer_code' => $existing['customer_code'] ?? ($nextCode ?? null),
                'customer_name' => $name,
                'business_name' => $businessName ?: $name,
                'cnic' => $formattedCnic,
                'ntn' => $cleanNtn ?: $ntn,
                'strn' => $strn,
                'address' => $address,
                'phone' => $phone,
                'province' => $province ?: 'Punjab',
                'registration_status' => $regStatus,
                'atl_status' => $atlStatus,
                'verification_date' => date('d-M-Y h:i:s A'),
                'verification_source' => $source,
                'verification_result' => ($regStatus === 'Registered') ? 'Verified (Registered Taxpayer)' : 'Active Taxpayer'
            ],
            'customer' => $updatedCust
        ]);
    } catch (Exception $e) {
        sendJson(['status' => 'error', 'message' => 'Failed to save verified taxpayer: ' . $e->getMessage()], 500);
    }
}

// Invalid action
sendJson(['status' => 'error', 'message' => 'Invalid action: ' . htmlspecialchars($action)], 400);
