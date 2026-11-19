<?php
// SoftifyX ERP - Public Document Viewer (Invoice, Quotation, Order, Challan, Ledger)
// Accessible via WhatsApp Links for Customers & Parties
require_once __DIR__ . '/api/db_config.php';
header('Content-Type: text/html; charset=utf-8');

$type = $_GET['type'] ?? '';
$coId = (int)($_GET['co'] ?? 1);

// Auto-detect type from shorthand query parameters
if (isset($_GET['inv'])) { $type = 'invoice'; $id = $_GET['inv']; }
elseif (isset($_GET['quot'])) { $type = 'quotation'; $id = $_GET['quot']; }
elseif (isset($_GET['so'])) { $type = 'order'; $id = $_GET['so']; }
elseif (isset($_GET['dc'])) { $type = 'challan'; $id = $_GET['dc']; }
elseif (isset($_GET['ledger'])) { $type = 'ledger'; $id = $_GET['ledger']; }
else { $id = $_GET['id'] ?? ''; }

if (!$type) $type = 'invoice';

// Fetch Company Details
$stmtCo = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
$stmtCo->execute([$coId]);
$company = $stmtCo->fetch(PDO::FETCH_ASSOC) ?: [];

$coName = $company['name'] ?? 'SEASTONE PLASTIC INDUSTRIES';
$coAddress = $company['address'] ?? 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai';
$coPhone = $company['phone'] ?? '+92 348 7240256';
$coEmail = $company['email'] ?? 'info@seastonepipes.com';
$coWebsite = $company['website'] ?? 'www.seastonepipes.com';
$coNtn = $company['ntn_no'] ?? ($company['ntn'] ?? '');
$coStrn = $company['strn'] ?? ($company['gst_no'] ?? '');
$coLogo = !empty($company['logo_data']) ? $company['logo_data'] : 'assets/logos/logo.png';

$docTitle = 'DOCUMENT';
$docData = null;
$docItems = [];
$customer = [];
$errorMsg = '';

// Helper formatters
function fmt($num, $dec = 2) {
    return number_format((float)($num ?: 0), $dec, '.', ',');
}

// ==========================================
// 1. SALE INVOICE
// ==========================================
if ($type === 'invoice') {
    $docTitle = 'TAX INVOICE';
    try {
        if (is_numeric($id)) {
            $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE (id = ? OR serial_no = ?) AND company_id = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$id, $id, $coId]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no = ? AND company_id = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$id, $coId]);
        }
        $docData = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($docData) {
            if (isset($docData['is_tax_invoice']) && $docData['is_tax_invoice'] == 0) {
                $docTitle = 'COMMERCIAL INVOICE';
            }
            // Items
            $stmtItems = $pdo->prepare("
                SELECT sii.*, 
                       COALESCE(ii.code, '') as inv_code, COALESCE(ii.name, '') as inv_name,
                       COALESCE(ii.hs_code, '') as hs_code
                FROM sale_invoice_items sii
                LEFT JOIN inv_items ii ON sii.item_coa_id = ii.id
                WHERE sii.invoice_id = ?
            ");
            $stmtItems->execute([$docData['id']]);
            $docItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            // Customer
            $stmtCust = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name, c.address, c.telephone, c.ntn_cnic, c.st_reg_no
                FROM coa_list cl
                LEFT JOIN customers c ON cl.id = c.coa_list_id
                WHERE cl.id = ?
            ");
            $stmtCust->execute([$docData['customer_coa_id'] ?? 0]);
            $custRow = $stmtCust->fetch(PDO::FETCH_ASSOC) ?: [];

            $customer = [
                'name'      => !empty($docData['customer_name']) ? $docData['customer_name'] : ($custRow['name'] ?? 'Walk-in Customer'),
                'code'      => $custRow['code'] ?? '',
                'address'   => !empty($docData['customer_address']) ? $docData['customer_address'] : ($custRow['address'] ?? ''),
                'telephone' => !empty($docData['customer_telephone']) ? $docData['customer_telephone'] : ($custRow['telephone'] ?? ''),
                'ntn'       => !empty($docData['customer_ntn']) ? $docData['customer_ntn'] : ($custRow['ntn_cnic'] ?? ''),
                'gst'       => !empty($docData['customer_gst']) ? $docData['customer_gst'] : ($custRow['st_reg_no'] ?? '')
            ];
        } else {
            $errorMsg = "Invoice #$id not found in system.";
        }
    } catch(Exception $e) {
        $errorMsg = $e->getMessage();
    }
}

// ==========================================
// 2. QUOTATION
// ==========================================
elseif ($type === 'quotation') {
    $docTitle = 'QUOTATION';
    try {
        $stmt = $pdo->prepare("
            SELECT q.*, cl.name as cust_name, cl.code as cust_code,
                   COALESCE(NULLIF(q.customer_address, ''), c.address, '') as cust_address,
                   COALESCE(NULLIF(q.customer_telephone, ''), c.telephone, '') as cust_tel
            FROM quotations q
            LEFT JOIN coa_list cl ON q.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            WHERE (q.id = ? OR q.serial_no = ?) AND q.company_id = ?
            ORDER BY q.id DESC LIMIT 1
        ");
        $stmt->execute([$id, $id, $coId]);
        $docData = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($docData) {
            $stmtItems = $pdo->prepare("
                SELECT qi.*, i.code as item_code, i.name as item_name, i.unit, COALESCE(i.hs_code, '') as hs_code
                FROM quotation_items qi
                LEFT JOIN inv_items i ON qi.item_coa_id = i.id
                WHERE qi.quotation_id = ?
            ");
            $stmtItems->execute([$docData['id']]);
            $docItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            $customer = [
                'name'      => $docData['customer_name'] ?: ($docData['cust_name'] ?: 'Customer'),
                'code'      => $docData['cust_code'] ?? '',
                'address'   => $docData['cust_address'] ?? '',
                'telephone' => $docData['customer_telephone'] ?: ($docData['cust_tel'] ?: ''),
                'ntn'       => '',
                'gst'       => ''
            ];
        } else {
            $errorMsg = "Quotation #$id not found in system.";
        }
    } catch(Exception $e) {
        $errorMsg = $e->getMessage();
    }
}

// ==========================================
// 3. SALE ORDER
// ==========================================
elseif ($type === 'order') {
    $docTitle = 'SALE ORDER';
    try {
        $stmt = $pdo->prepare("
            SELECT so.*, cl.name as cust_name, cl.code as cust_code,
                   COALESCE(NULLIF(so.customer_address, ''), c.address, '') as cust_address,
                   COALESCE(NULLIF(so.customer_telephone, ''), c.telephone, '') as cust_tel
            FROM sale_orders so
            LEFT JOIN coa_list cl ON so.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            WHERE (so.id = ? OR so.serial_no = ?) AND so.company_id = ?
            ORDER BY so.id DESC LIMIT 1
        ");
        $stmt->execute([$id, $id, $coId]);
        $docData = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($docData) {
            $stmtItems = $pdo->prepare("
                SELECT soi.*, i.code as item_code, i.name as item_name, i.unit, COALESCE(i.hs_code, '') as hs_code
                FROM sale_order_items soi
                LEFT JOIN inv_items i ON soi.item_coa_id = i.id
                WHERE soi.order_id = ?
            ");
            $stmtItems->execute([$docData['id']]);
            $docItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            $customer = [
                'name'      => $docData['customer_name'] ?: ($docData['cust_name'] ?: 'Customer'),
                'code'      => $docData['cust_code'] ?? '',
                'address'   => $docData['cust_address'] ?? '',
                'telephone' => $docData['customer_telephone'] ?: ($docData['cust_tel'] ?: ''),
                'ntn'       => '',
                'gst'       => ''
            ];
        } else {
            $errorMsg = "Sale Order #$id not found in system.";
        }
    } catch(Exception $e) {
        $errorMsg = $e->getMessage();
    }
}

// ==========================================
// 4. DELIVERY CHALLAN
// ==========================================
elseif ($type === 'challan') {
    $docTitle = 'DELIVERY CHALLAN';
    try {
        $stmt = $pdo->prepare("
            SELECT dc.*, cl.name as cust_name, cl.code as cust_code,
                   COALESCE(NULLIF(dc.customer_address, ''), c.address, '') as cust_address,
                   COALESCE(NULLIF(dc.customer_telephone, ''), c.telephone, '') as cust_tel
            FROM delivery_challans dc
            LEFT JOIN coa_list cl ON dc.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            WHERE (dc.id = ? OR dc.serial_no = ?) AND dc.company_id = ?
            ORDER BY dc.id DESC LIMIT 1
        ");
        $stmt->execute([$id, $id, $coId]);
        $docData = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($docData) {
            if (!empty($docData['is_stn']) && $docData['is_stn'] == 1) {
                $docTitle = 'STOCK TRANSFER NOTE';
            }
            $stmtItems = $pdo->prepare("
                SELECT dci.*, i.code as item_code, i.name as item_name, i.unit, COALESCE(i.hs_code, '') as hs_code
                FROM delivery_challan_items dci
                LEFT JOIN inv_items i ON dci.item_coa_id = i.id
                WHERE dci.challan_id = ?
            ");
            $stmtItems->execute([$docData['id']]);
            $docItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            $customer = [
                'name'      => $docData['customer_name'] ?: ($docData['cust_name'] ?: 'Customer'),
                'code'      => $docData['cust_code'] ?? '',
                'address'   => $docData['cust_address'] ?? '',
                'telephone' => $docData['customer_telephone'] ?: ($docData['cust_tel'] ?: ''),
                'ntn'       => '',
                'gst'       => ''
            ];
        } else {
            $errorMsg = "Delivery Challan #$id not found in system.";
        }
    } catch(Exception $e) {
        $errorMsg = $e->getMessage();
    }
}

// ==========================================
// 5. ACCOUNT LEDGER / STATEMENT
// ==========================================
elseif ($type === 'ledger') {
    $docTitle = 'ACCOUNT STATEMENT';
    try {
        require_once __DIR__ . '/api/account_ledger.php';

        $accParam = $_GET['acc'] ?? ($id ?: '');
        $fromDate = $_GET['from'] ?? '';
        $toDate = $_GET['to'] ?? '';

        $stmt = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, c.address, c.telephone, c.ntn_cnic, c.st_reg_no 
            FROM coa_list cl 
            LEFT JOIN customers c ON cl.id = c.coa_list_id 
            WHERE (cl.code = ? OR cl.id = ?) AND cl.company_id = ?
            LIMIT 1
        ");
        $stmt->execute([$accParam, $accParam, $coId]);
        $accRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($accRow) {
            $periodLabel = 'All Dates';
            if ($fromDate && $toDate) {
                $periodLabel = date('d-M-Y', strtotime($fromDate)) . ' To ' . date('d-M-Y', strtotime($toDate));
            } elseif ($fromDate) {
                $periodLabel = 'From ' . date('d-M-Y', strtotime($fromDate));
            } elseif ($toDate) {
                $periodLabel = 'Up to ' . date('d-M-Y', strtotime($toDate));
            }

            $docData = [
                'serial_no' => $accRow['code'],
                'date'      => $periodLabel,
                'remarks'   => 'Account statement for ' . $accRow['name']
            ];
            $customer = [
                'name'      => $accRow['name'],
                'code'      => $accRow['code'],
                'address'   => $accRow['address'] ?? '',
                'telephone' => $accRow['telephone'] ?? '',
                'ntn'       => $accRow['ntn_cnic'] ?? '',
                'gst'       => $accRow['st_reg_no'] ?? ''
            ];

            $coa_id = (int)$accRow['id'];
            $raw_txs = fetchLedgerTransactions($pdo, $coId, $coa_id, $fromDate, $toDate);
            $docItems = is_array($raw_txs) ? $raw_txs : [];
        } else {
            $errorMsg = "Account '$accParam' not found in system.";
        }
    } catch(Exception $e) {
        $errorMsg = $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($docTitle) ?> - <?= htmlspecialchars($customer['name'] ?? $id) ?> - <?= htmlspecialchars($coName) ?></title>
    
    <!-- Fonts & Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="assets/js/html2pdf.bundle.min.js"></script>

    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, Tahoma, sans-serif;
            background: #f1f5f9;
            color: #1e293b;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* Top Action Bar */
        .top-nav {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #0f172a;
            color: white;
            padding: 10px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .top-nav .brand-badge {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .top-nav .pill {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 4px 10px;
            border-radius: 4px;
            font-weight: 800;
            font-size: 13px;
            color: #38bdf8;
        }
        .top-nav .btn-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .top-nav button, .top-nav a.nav-btn {
            border: none;
            padding: 7px 16px;
            border-radius: 5px;
            font-weight: 700;
            font-size: 12.5px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            text-decoration: none;
            transition: all 0.2s;
        }
        .btn-print { background: #2563eb; color: white; }
        .btn-pdf { background: #0284c7; color: white; }
        .btn-wa { background: #25D366; color: white; box-shadow: 0 2px 6px rgba(37,211,102,0.3); }

        /* Document Container */
        .page-container {
            max-width: <?= $type === 'ledger' ? '240mm' : '215mm' ?>;
            min-height: 270mm;
            margin: 65px auto 30px auto;
            background: #ffffff;
            padding: 12mm 14mm;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border-radius: 6px;
            position: relative;
        }

        /* Header Area */
        .header-area {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0b3b60;
            padding-bottom: 14px;
            margin-bottom: 16px;
        }
        .logo-box {
            width: 85px;
            height: 70px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 14px;
        }
        .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .company-info h1 {
            color: #0b3b60;
            font-size: 20px;
            font-weight: 800;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .company-contacts {
            font-size: 9.5px;
            line-height: 1.5;
            color: #334155;
        }
        .invoice-pill-area {
            text-align: center;
            min-width: 170px;
        }
        .invoice-pill {
            background: #e2edfa;
            border-radius: 6px;
            padding: 8px 18px;
            color: #0b3b60;
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .invoice-pill-bar {
            height: 3px;
            background: #ea580c;
            border-radius: 2px;
            width: 70px;
            margin: 6px auto 0 auto;
        }

        /* Meta Cards (Customer & Document Details) */
        .meta-cards {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
        }
        .meta-card {
            flex: 1;
            border: 1px solid #b8d5f8;
            border-radius: 6px;
            overflow: hidden;
            background: #fff;
        }
        .meta-card-header {
            background: #e8f1fc;
            color: #0b3b60;
            font-weight: bold;
            font-size: 11px;
            padding: 6px 12px;
            border-bottom: 1px solid #b8d5f8;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .meta-card-body {
            padding: 10px 12px;
            font-size: 11px;
            line-height: 1.6;
        }
        .meta-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .meta-table td { padding: 2px 0; }
        .meta-label { color: #64748b; font-weight: 600; width: 100px; }

        /* Grid Table */
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 10px;
            border: 1px solid #b8d5f8;
        }
        .items-table th {
            border: 1px solid #b8d5f8;
            background: #e8f1fc;
            color: #0b3b60;
            font-weight: 800;
            font-size: 9.5px;
            padding: 6px 5px;
            text-transform: uppercase;
            text-align: center;
        }
        .items-table td {
            border: 1px solid #e2e8f0;
            padding: 5px 6px;
            font-size: 10px;
        }
        .items-table tfoot td {
            background: #dbeafe !important;
            color: #0b3b60 !important;
            font-weight: 800;
            border: 1px solid #b8d5f8;
        }

        /* Lower Summary */
        .lower-section {
            display: flex;
            gap: 16px;
            margin-top: 14px;
            align-items: flex-start;
        }
        .words-card {
            flex: 1.1;
            border: 1px solid #b8d5f8;
            border-radius: 6px;
            overflow: hidden;
        }
        .summary-card {
            flex: 0.9;
            border: 1px solid #b8d5f8;
            border-radius: 6px;
            overflow: hidden;
        }
        .summary-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .summary-table td { padding: 4px 12px; }
        .summary-table tr.total-row {
            background: #dbeafe;
            font-weight: 800;
            color: #0b3b60;
            border-top: 1px solid #b8d5f8;
            font-size: 12px;
        }

        /* Footer */
        .footer-banner {
            margin-top: 35px;
            border-top: 1px solid #cbd5e1;
            padding-top: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #64748b;
        }

        /* Print Media Styles */
        @media print {
            .no-print { display: none !important; }
            body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
            .page-container {
                margin: 0 auto !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                padding: 6mm !important;
                max-width: 100% !important;
                min-height: auto !important;
            }
        }

        @media (max-width: 768px) {
            .top-nav { padding: 8px 12px; flex-wrap: wrap; gap: 6px; }
            .top-nav .brand-badge { width: 100%; justify-content: space-between; }
            .top-nav .btn-group { width: 100%; justify-content: flex-end; }
            .page-container { margin: 100px 8px 20px 8px; padding: 8px; }
            .meta-cards, .lower-section { flex-direction: column; }
            .items-table { font-size: 8.5px; }
            .items-table th, .items-table td { padding: 3px 2px; }
        }
    </style>
</head>
<body>

    <!-- Top Action Bar -->
    <div class="top-nav no-print">
        <div class="brand-badge">
            <span class="pill">
                <i class="fas fa-file-invoice"></i> <?= htmlspecialchars($docTitle) ?> <?= $type !== 'ledger' ? '# ' . htmlspecialchars($docData['serial_no'] ?? $id) : '' ?>
            </span>
            <span style="font-weight: 600; font-size: 13px;"><?= htmlspecialchars($customer['name'] ?? 'Customer') ?></span>
        </div>
        <div class="btn-group">
            <button type="button" class="btn-print" onclick="window.print()">
                <i class="fas fa-print"></i> Print
            </button>
            <button type="button" class="btn-pdf" onclick="downloadPdf()">
                <i class="fas fa-file-pdf"></i> Download PDF
            </button>
            <button type="button" class="btn-wa" onclick="shareWhatsApp()">
                <i class="fab fa-whatsapp" style="font-size: 15px;"></i> Share
            </button>
        </div>
    </div>

    <?php if ($errorMsg): ?>
        <div class="page-container" style="text-align: center; padding: 50px 20px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 45px; color: #ea580c; margin-bottom: 15px;"></i>
            <h2 style="color: #0b3b60; margin: 0 0 10px 0;">Document Not Available</h2>
            <p style="color: #64748b; font-size: 14px;"><?= htmlspecialchars($errorMsg) ?></p>
        </div>
    <?php else: ?>

    <div class="page-container" id="printable-content">
        <!-- Header -->
        <div class="header-area">
            <div style="display: flex; align-items: center;">
                <?php if ($coLogo): ?>
                    <div class="logo-box">
                        <img src="<?= htmlspecialchars($coLogo) ?>" alt="Logo">
                    </div>
                <?php endif; ?>
                <div class="company-info">
                    <h1><?= htmlspecialchars($coName) ?></h1>
                    <div class="company-contacts">
                        <div><i class="fas fa-map-marker-alt" style="color: #0b3b60; width: 12px;"></i> <?= htmlspecialchars($coAddress) ?></div>
                        <div style="display: flex; gap: 15px; margin-top: 2px;">
                            <span><i class="fas fa-phone-alt" style="color: #0b3b60; width: 12px;"></i> <?= htmlspecialchars($coPhone) ?></span>
                            <span><i class="fas fa-envelope" style="color: #0b3b60; width: 12px;"></i> <?= htmlspecialchars($coEmail) ?></span>
                        </div>
                        <?php if ($coNtn || $coStrn): ?>
                            <div style="display: flex; gap: 15px; margin-top: 2px;">
                                <?php if ($coStrn): ?><span><b>STRN:</b> <?= htmlspecialchars($coStrn) ?></span><?php endif; ?>
                                <?php if ($coNtn): ?><span><b>NTN:</b> <?= htmlspecialchars($coNtn) ?></span><?php endif; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
            <div class="invoice-pill-area">
                <div class="invoice-pill"><?= htmlspecialchars($docTitle) ?></div>
                <div class="invoice-pill-bar"></div>
            </div>
        </div>

        <!-- Meta Information Cards -->
        <div class="meta-cards">
            <!-- Account / Customer Card -->
            <div class="meta-card">
                <div class="meta-card-header">
                    <i class="fas fa-user-circle" style="color: #2563eb;"></i> <?= $type === 'ledger' ? 'Account Details' : 'Customer Details' ?>
                </div>
                <div class="meta-card-body">
                    <div style="font-weight: 800; font-size: 12.5px; color: #000; margin-bottom: 4px;">
                        <?= htmlspecialchars($customer['name'] ?? '') ?>
                    </div>
                    <?php if (!empty($customer['code'])): ?>
                        <div style="color: #ea580c; font-weight: bold; margin-bottom: 3px;"><b>Account Code:</b> <?= htmlspecialchars($customer['code']) ?></div>
                    <?php endif; ?>
                    <?php if (!empty($customer['address'])): ?>
                        <div style="color: #475569; margin-bottom: 3px;"><i class="fas fa-map-marker-alt" style="color: #2563eb; width: 12px;"></i> <?= htmlspecialchars($customer['address']) ?></div>
                    <?php endif; ?>
                    <?php if (!empty($customer['telephone'])): ?>
                        <div style="color: #1e293b; margin-bottom: 3px;"><i class="fas fa-phone-alt" style="color: #2563eb; width: 12px;"></i> <?= htmlspecialchars($customer['telephone']) ?></div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Document Details Card -->
            <div class="meta-card">
                <div class="meta-card-header">
                    <i class="fas fa-info-circle" style="color: #2563eb;"></i> Document Details
                </div>
                <div class="meta-card-body">
                    <table class="meta-table">
                        <tr>
                            <td class="meta-label"><?= htmlspecialchars($type === 'quotation' ? 'Quotation #' : ($type === 'order' ? 'Order #' : ($type === 'challan' ? 'Challan #' : ($type === 'ledger' ? 'Account #' : 'Invoice #')))) ?></td>
                            <td>: <b><?= htmlspecialchars($docData['serial_no'] ?? $id) ?></b></td>
                        </tr>
                        <tr>
                            <td class="meta-label">Period / Date</td>
                            <td>: <b><?= htmlspecialchars($docData['date'] ?? ($docData['order_date'] ?? date('Y-m-d'))) ?></b></td>
                        </tr>
                        <?php if (!empty($docData['valid_till'])): ?>
                            <tr><td class="meta-label">Valid Till</td><td>: <?= htmlspecialchars($docData['valid_till']) ?></td></tr>
                        <?php endif; ?>
                        <?php if (!empty($docData['delivery_date'])): ?>
                            <tr><td class="meta-label">Delivery Date</td><td>: <?= htmlspecialchars($docData['delivery_date']) ?></td></tr>
                        <?php endif; ?>
                        <?php if (!empty($docData['dc_no'])): ?>
                            <tr><td class="meta-label">D.C. No.</td><td>: <?= htmlspecialchars($docData['dc_no']) ?></td></tr>
                        <?php endif; ?>
                        <?php if (!empty($docData['po_no'])): ?>
                            <tr><td class="meta-label">P.O. No.</td><td>: <?= htmlspecialchars($docData['po_no']) ?></td></tr>
                        <?php endif; ?>
                    </table>
                </div>
            </div>
        </div>

        <?php if ($type === 'ledger'): ?>
            <!-- LEDGER SPECIFIC TABLE -->
            <?php 
            $runningBal = 0;
            $totD = 0; 
            $totC = 0;
            $renderedRows = [];

            foreach ($docItems as $tx) {
                $d = (float)($tx['debit'] ?? 0);
                $c = (float)($tx['credit'] ?? 0);
                $isOb = !empty($tx['is_ob']);

                // Skip 0 / 0 rows (like empty opening balance)
                if ($d == 0 && $c == 0) continue;

                $totD += $d;
                $totC += $c;
                $runningBal += ($d - $c);
                $status = $runningBal > 0 ? 'Debit' : ($runningBal < 0 ? 'Credit' : 'Nil');

                $displayDate = !empty($tx['date']) ? date('d-M-Y', strtotime($tx['date'])) : ($isOb ? 'Opening' : '');
                $tranNo = !empty($tx['tran_no']) ? $tx['tran_no'] : ($isOb ? 'OB' : ($tx['reference'] ?? ''));

                $renderedRows[] = [
                    'date'        => $displayDate,
                    'tran_no'     => $tranNo,
                    'reference'   => $tx['reference'] ?? '',
                    'description' => $tx['description'] ?? '',
                    'debit'       => $d,
                    'credit'      => $c,
                    'balance'     => abs($runningBal),
                    'status'      => $status,
                    'is_ob'       => $isOb
                ];
            }
            $finalStatus = $runningBal > 0 ? 'Debit' : ($runningBal < 0 ? 'Credit' : 'Nil');
            ?>
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 80px;">Date</th>
                        <th style="width: 75px;">Tran. No.</th>
                        <th>Description</th>
                        <th style="width: 85px;">Debit (Rs.)</th>
                        <th style="width: 85px;">Credit (Rs.)</th>
                        <th style="width: 95px;">Balance (Rs.)</th>
                        <th style="width: 60px;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($renderedRows)): ?>
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 25px; color: #94a3b8;">
                                <i class="far fa-folder-open" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
                                No transactions found for this account.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($renderedRows as $row): ?>
                        <tr style="<?= $row['is_ob'] ? 'background: #f1f5f9; font-weight: bold;' : '' ?>">
                            <td style="text-align: center;"><?= htmlspecialchars($row['date']) ?></td>
                            <td style="text-align: center; font-weight: 600;"><?= htmlspecialchars($row['tran_no']) ?></td>
                            <td><?= htmlspecialchars($row['description']) ?></td>
                            <td style="text-align: right; color: <?= $row['debit'] > 0 ? '#16a34a' : '#64748b' ?>; font-weight: <?= $row['debit'] > 0 ? '600' : 'normal' ?>;">
                                <?= $row['debit'] > 0 ? fmt($row['debit']) : '-' ?>
                            </td>
                            <td style="text-align: right; color: <?= $row['credit'] > 0 ? '#dc2626' : '#64748b' ?>; font-weight: <?= $row['credit'] > 0 ? '600' : 'normal' ?>;">
                                <?= $row['credit'] > 0 ? fmt($row['credit']) : '-' ?>
                            </td>
                            <td style="text-align: right; font-weight: 800;">
                                <?= fmt($row['balance']) ?>
                            </td>
                            <td style="text-align: center; font-weight: 700; color: <?= $row['status'] === 'Debit' ? '#dc2626' : ($row['status'] === 'Credit' ? '#16a34a' : '#64748b') ?>;">
                                <?= $row['status'] ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 800; padding: 6px 10px;">Totals Rs.</td>
                        <td style="text-align: right; font-weight: 800; color: #16a34a;"><?= fmt($totD) ?></td>
                        <td style="text-align: right; font-weight: 800; color: #dc2626;"><?= fmt($totC) ?></td>
                        <td style="text-align: right; font-weight: 800; font-size: 11px;"><?= fmt(abs($runningBal)) ?></td>
                        <td style="text-align: center; font-weight: 800; color: <?= $finalStatus === 'Debit' ? '#dc2626' : ($finalStatus === 'Credit' ? '#16a34a' : '#64748b') ?>;"><?= $finalStatus ?></td>
                    </tr>
                </tfoot>
            </table>

            <div class="lower-section">
                <div class="words-card">
                    <div class="meta-card-header"><i class="fas fa-info-circle" style="color: #2563eb;"></i> Ledger Summary</div>
                    <div class="meta-card-body">
                        <div><b>Account:</b> <?= htmlspecialchars($customer['name'] ?? '') ?> (<?= htmlspecialchars($customer['code'] ?? '') ?>)</div>
                        <div style="margin-top: 4px;"><b>Period:</b> <?= htmlspecialchars($docData['date'] ?? '') ?></div>
                        <div style="margin-top: 4px;"><b>Total Transactions:</b> <?= count($renderedRows) ?></div>
                    </div>
                </div>
                <div class="summary-card">
                    <div class="meta-card-header"><i class="fas fa-balance-scale" style="color: #2563eb;"></i> Balance Summary</div>
                    <table class="summary-table">
                        <tr><td>Total Debits</td><td style="text-align: right; font-weight: 600; color: #16a34a;">Rs. <?= fmt($totD) ?></td></tr>
                        <tr><td>Total Credits</td><td style="text-align: right; font-weight: 600; color: #dc2626;">Rs. <?= fmt($totC) ?></td></tr>
                        <tr class="total-row"><td>Closing Balance</td><td style="text-align: right; font-weight: 800; color: <?= $finalStatus === 'Debit' ? '#dc2626' : ($finalStatus === 'Credit' ? '#16a34a' : '#1e293b') ?>;">Rs. <?= fmt(abs($runningBal)) ?> (<?= $finalStatus ?>)</td></tr>
                    </table>
                </div>
            </div>

        <?php else: ?>

            <!-- STANDARD INVOICE / QUOTATION / ORDER / CHALLAN TABLE -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 25px;">#</th>
                        <th style="width: 80px;">Item Code</th>
                        <th>Description</th>
                        <th style="width: 45px;">Unit</th>
                        <th style="width: 45px;">Pcs</th>
                        <th style="width: 60px;">Quantity</th>
                        <th style="width: 65px;">Rate</th>
                        <?php if ($type === 'invoice' && !empty($docData['is_tax_invoice'])): ?>
                            <th style="width: 65px;">Gross Total</th>
                            <th style="width: 40px;">Disc %</th>
                            <th style="width: 55px;">Disc Amt</th>
                            <th style="width: 40px;">STAX %</th>
                            <th style="width: 55px;">STAX Amt</th>
                            <th style="width: 75px;">Net Value</th>
                        <?php else: ?>
                            <th style="width: 80px;">Total Value</th>
                        <?php endif; ?>
                    </tr>
                </thead>
                <tbody>
                    <?php 
                    $totPcs = 0; $totQty = 0; $totGross = 0; $totDisc = 0; $totStax = 0; $totNet = 0;
                    foreach ($docItems as $idx => $it): 
                        $pcs = (float)($it['pieces'] ?? 0);
                        $qty = (float)($it['quantity'] ?? 0);
                        $rate = (float)($it['rate'] ?? 0);
                        $gross = (float)($it['gross_amount'] ?? ($qty * $rate));
                        $disc = (float)($it['disc_amount'] ?? 0);
                        $stax = (float)($it['sales_tax_amount'] ?? 0);
                        $net = (float)($it['net_amount'] ?? ($gross - $disc + $stax));

                        $totPcs += $pcs;
                        $totQty += $qty;
                        $totGross += $gross;
                        $totDisc += $disc;
                        $totStax += $stax;
                        $totNet += $net;
                    ?>
                    <tr>
                        <td style="text-align: center;"><?= $idx + 1 ?></td>
                        <td style="text-align: center;"><?= htmlspecialchars($it['item_code'] ?? ($it['inv_code'] ?? '')) ?></td>
                        <td><b><?= htmlspecialchars($it['description'] ?? ($it['inv_name'] ?? 'Item')) ?></b></td>
                        <td style="text-align: center;"><?= htmlspecialchars($it['unit'] ?? 'Pcs') ?></td>
                        <td style="text-align: right;"><?= $pcs > 0 ? (int)$pcs : '-' ?></td>
                        <td style="text-align: right;"><b><?= fmt($qty, 2) ?></b></td>
                        <td style="text-align: right;"><?= fmt($rate, 2) ?></td>
                        <?php if ($type === 'invoice' && !empty($docData['is_tax_invoice'])): ?>
                            <td style="text-align: right;"><?= fmt($gross, 2) ?></td>
                            <td style="text-align: right;"><?= (float)($it['disc_pct'] ?? 0) ?>%</td>
                            <td style="text-align: right;"><?= fmt($disc, 2) ?></td>
                            <td style="text-align: right;"><?= (float)($it['sales_tax_pct'] ?? 0) ?>%</td>
                            <td style="text-align: right;"><?= fmt($stax, 2) ?></td>
                            <td style="text-align: right; font-weight: 800; color: #0b3b60;"><?= fmt($net, 2) ?></td>
                        <?php else: ?>
                            <td style="text-align: right; font-weight: 800; color: #0b3b60;"><?= fmt($net, 2) ?></td>
                        <?php endif; ?>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: left; padding: 6px 8px;">TOTAL</td>
                        <td style="text-align: right;"><?= (int)$totPcs ?></td>
                        <td style="text-align: right;"><?= fmt($totQty, 2) ?></td>
                        <td></td>
                        <?php if ($type === 'invoice' && !empty($docData['is_tax_invoice'])): ?>
                            <td style="text-align: right;"><?= fmt($totGross, 2) ?></td>
                            <td></td>
                            <td style="text-align: right;"><?= fmt($totDisc, 2) ?></td>
                            <td></td>
                            <td style="text-align: right;"><?= fmt($totStax, 2) ?></td>
                            <td style="text-align: right; font-size: 11px;"><?= fmt($totNet, 2) ?></td>
                        <?php else: ?>
                            <td style="text-align: right; font-size: 11px;"><?= fmt($totNet, 2) ?></td>
                        <?php endif; ?>
                    </tr>
                </tfoot>
            </table>

            <!-- Lower Section (Remarks / Summary) -->
            <div class="lower-section">
                <div class="words-card">
                    <div class="meta-card-header">
                        <i class="fas fa-comment-dots" style="color: #2563eb;"></i> Notes & Remarks
                    </div>
                    <div class="meta-card-body" style="min-height: 80px;">
                        <div><b>Remarks:</b> <?= htmlspecialchars($docData['remarks'] ?? 'None') ?></div>
                        <?php if (!empty($docData['terms_conditions'])): ?>
                            <div style="margin-top: 8px; font-size: 10px; color: #475569;">
                                <b>Terms & Conditions:</b><br><?= nl2br(htmlspecialchars($docData['terms_conditions'])) ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="summary-card">
                    <div class="meta-card-header">
                        <i class="fas fa-calculator" style="color: #2563eb;"></i> Financial Summary
                    </div>
                    <table class="summary-table">
                        <tr>
                            <td>Gross Amount</td>
                            <td style="text-align: right; font-weight: 600;">Rs. <?= fmt($totGross ?: $totNet) ?></td>
                        </tr>
                        <?php if ($totDisc > 0): ?>
                            <tr>
                                <td>Total Discount</td>
                                <td style="text-align: right; color: #dc2626;">- Rs. <?= fmt($totDisc) ?></td>
                            </tr>
                        <?php endif; ?>
                        <?php if ($totStax > 0): ?>
                            <tr>
                                <td>Sales Tax Amount</td>
                                <td style="text-align: right;">Rs. <?= fmt($totStax) ?></td>
                            </tr>
                        <?php endif; ?>
                        <?php if (!empty($docData['freight']) && (float)$docData['freight'] > 0): ?>
                            <tr>
                                <td>Carriage & Freight</td>
                                <td style="text-align: right;">Rs. <?= fmt($docData['freight']) ?></td>
                            </tr>
                        <?php endif; ?>
                        <tr class="total-row">
                            <td>Net Total Payable</td>
                            <td style="text-align: right;">Rs. <?= fmt($docData['net_amount'] ?? ($docData['tot_incl'] ?? $totNet)) ?></td>
                        </tr>
                        <?php if (isset($docData['balance']) && (float)$docData['balance'] > 0): ?>
                            <tr>
                                <td><b>Current Balance</b></td>
                                <td style="text-align: right; font-weight: 800; color: #b91c1c;">Rs. <?= fmt($docData['balance']) ?></td>
                            </tr>
                        <?php endif; ?>
                    </table>
                </div>
            </div>

        <?php endif; ?>

        <!-- Footer Signatures -->
        <div style="margin-top: 45px; display: flex; justify-content: space-between; padding: 0 15px;">
            <div style="text-align: center; width: 140px; border-top: 1.5px solid #000; padding-top: 4px; font-size: 10.5px; font-weight: 700;">
                Prepared By
            </div>
            <div style="text-align: center; width: 140px; border-top: 1.5px solid #000; padding-top: 4px; font-size: 10.5px; font-weight: 700;">
                Checked By
            </div>
            <div style="text-align: center; width: 150px; border-top: 1.5px solid #000; padding-top: 4px; font-size: 10.5px; font-weight: 700;">
                Authorized Signatory
            </div>
        </div>

        <!-- Brand Banner -->
        <div class="footer-banner">
            <span>Powered by <b>SoftifyX ERP</b></span>
            <span>Document Generated: <?= date('d-M-Y H:i') ?></span>
        </div>
    </div>

    <?php endif; ?>

    <script>
        function downloadPdf() {
            var el = document.getElementById('printable-content');
            if (!el) return;
            var opt = {
                margin: [4, 4, 4, 4],
                filename: '<?= preg_replace("/[^a-zA-Z0-9_-]/", "_", $docTitle . "_" . ($customer["name"] ?? "Doc")) ?>.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: '<?= $type === "ledger" ? "landscape" : "portrait" ?>' }
            };

            if (window.html2pdf) {
                html2pdf().set(opt).from(el).save();
            } else {
                window.print();
            }
        }

        function shareWhatsApp() {
            var url = window.location.href;
            var text = "*<?= addslashes(strtoupper($coName)) ?>*\n" +
                       "*<?= addslashes($docTitle) ?>*\n" +
                       "--------------------------------\n" +
                       "👤 *Account / Customer:* <?= addslashes($customer['name'] ?? 'Customer') ?>\n" +
                       <?php if ($type === 'ledger'): ?>
                       "💰 *Total Debits:* Rs. <?= fmt($totD ?? 0) ?>\n" +
                       "💰 *Total Credits:* Rs. <?= fmt($totC ?? 0) ?>\n" +
                       "⚖️ *Closing Balance:* Rs. <?= fmt(abs($runningBal ?? 0)) ?> (<?= $finalStatus ?? '' ?>)\n" +
                       <?php else: ?>
                       "💰 *Total Amount:* Rs. <?= fmt($docData['net_amount'] ?? ($docData['tot_incl'] ?? $totNet ?? 0)) ?>\n" +
                       <?php endif; ?>
                       "--------------------------------\n" +
                       "👉 *Poora Document dekhne aur PDF download karne ke liye link kholein:*\n" +
                       url;
            window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
        }
    </script>
</body>
</html>
