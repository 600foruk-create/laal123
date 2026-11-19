<?php
/**
 * SoftifyX ERP - Public Digital Price List & Illustrated Catalog
 * Secure, Read-Only, No Login Required (Mobile Optimized for QR Code Scanners)
 */
header('Content-Type: text/html; charset=utf-8');
require_once __DIR__ . '/api/db_config.php';

$company_id = isset($_GET['company_id']) ? intval($_GET['company_id']) : 1;
$customer_id = isset($_GET['cust']) ? intval($_GET['cust']) : 0;
$brand_id = isset($_GET['brand']) ? intval($_GET['brand']) : 0;
$cat_id = isset($_GET['cat']) ? intval($_GET['cat']) : 0;

// 1. Fetch Company Master
$compStmt = $pdo->prepare("SELECT name, address, telephone, email, logo_data FROM companies WHERE id = ?");
$compStmt->execute([$company_id]);
$company = $compStmt->fetch();
$compName = htmlspecialchars($company['name'] ?? 'SoftifyX Pipe Industry');
$compAddr = htmlspecialchars($company['address'] ?? '');
$compPhone = htmlspecialchars($company['telephone'] ?? '');
$compLogo = $company['logo_data'] ?? '';

// Clean phone for WhatsApp / Tel link
$rawPhone = preg_replace('/\D/', '', $compPhone);
if (strpos($rawPhone, '0') === 0) {
    $waPhone = '92' . substr($rawPhone, 1);
} elseif (strpos($rawPhone, '92') === 0) {
    $waPhone = $rawPhone;
} else {
    $waPhone = '92' . $rawPhone;
}

// 2. Fetch Customer Info (if custom price list)
$customerName = '';
if ($customer_id > 0) {
    $custStmt = $pdo->prepare("SELECT name FROM coa_list WHERE id = ? AND company_id = ?");
    $custStmt->execute([$customer_id, $company_id]);
    $customerName = htmlspecialchars($custStmt->fetchColumn() ?: '');
}

// 3. Fetch Items
$sql = "
    SELECT i.id, i.code as item_code, i.name as item_name, i.size, i.carton, i.qty_per_piece,
           COALESCE(NULLIF(i.carton, 0), NULLIF(CAST(i.qty_per_piece AS UNSIGNED), 0), 0) as pcs_per_carton,
           i.selling_price as general_price,
           b.name as brand_name,
           sc.name as sub_name, sc.image_path as sub_image,
           c.name as category_name
";

if ($customer_id > 0) {
    $sql .= ", COALESCE(cip.custom_price, i.selling_price) as final_price, cip.notes as custom_notes
             FROM inv_items i
             LEFT JOIN customer_item_prices cip ON cip.item_id = i.id AND cip.customer_id = ? AND cip.company_id = i.company_id
    ";
} else {
    $sql .= ", i.selling_price as final_price, '' as custom_notes
             FROM inv_items i
    ";
}

$sql .= "
    LEFT JOIN inv_brands b ON i.brand_id = b.id
    LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
    LEFT JOIN inv_main_categories c ON sc.main_id = c.id
    WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
";

$params = [];
if ($customer_id > 0) $params[] = $customer_id;
$params[] = $company_id;

if ($brand_id > 0) {
    $sql .= " AND i.brand_id = ?";
    $params[] = $brand_id;
}
if ($cat_id > 0) {
    $sql .= " AND (sc.main_id = ? OR i.category_id = ?)";
    $params[] = $cat_id;
    $params[] = $cat_id;
}

$sql .= " ORDER BY sc.name ASC, i.name ASC, i.id ASC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$items = $stmt->fetchAll();

// Group items by Fitting / Sub Category
$groups = [];
foreach ($items as $it) {
    $gName = !empty($it['sub_name']) ? trim($it['sub_name']) : (!empty($it['item_name']) ? trim($it['item_name']) : 'GENERAL ITEMS');
    $gKey = strtoupper($gName);
    if (!isset($groups[$gKey])) {
        $groups[$gKey] = [
            'name' => $gName,
            'image' => $it['sub_image'] ?? '',
            'items' => []
        ];
    }
    $groups[$gKey]['items'][] = $it;
}

$today = date('d-m-Y');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Price List - <?= $compName ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #ea580c;
            --primary-dark: #c2410c;
            --header-dark: #1e293b;
            --text-main: #0f172a;
            --bg-light: #f8fafc;
            --border-color: #cbd5e1;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #e2e8f0;
            color: var(--text-main);
            padding: 10px;
            display: flex;
            justify-content: center;
        }
        .container {
            width: 100%;
            max-width: 860px;
            background: #ffffff;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* Top Header */
        .header-bar {
            background: #ffffff;
            padding: 14px 18px 10px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
        }
        .header-brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .logo-img {
            max-height: 52px;
            max-width: 90px;
            object-fit: contain;
        }
        .logo-fallback {
            width: 44px;
            height: 44px;
            background: var(--primary);
            color: #fff;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 900;
        }
        .brand-info h1 {
            font-size: 20px;
            font-weight: 900;
            color: var(--header-dark);
            letter-spacing: 0.5px;
            text-transform: uppercase;
            line-height: 1.1;
        }
        .brand-info p {
            font-size: 11px;
            color: var(--primary);
            font-weight: 700;
            margin-top: 3px;
        }

        /* Title Ribbon */
        .ribbon {
            background: var(--primary);
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            position: relative;
            box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25);
        }
        .ribbon-title {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            background: var(--header-dark);
            color: #ffffff;
            font-size: 15px;
            font-weight: 800;
            padding: 4px 28px;
            border-radius: 20px;
            border: 2px solid var(--primary);
            letter-spacing: 0.5px;
            white-space: nowrap;
        }
        .ribbon-date {
            margin-left: auto;
            color: #ffffff;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }

        /* Customer Banner */
        <?php if (!empty($customerName)): ?>
        .customer-banner {
            background: #fff7ed;
            border-left: 4px solid var(--primary);
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 700;
            color: #9a3412;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        <?php endif; ?>

        /* Search & Action Bar */
        .search-bar-wrap {
            padding: 10px 16px;
            background: #f1f5f9;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .search-box {
            flex: 1;
            position: relative;
        }
        .search-box input {
            width: 100%;
            height: 36px;
            padding: 0 12px 0 34px;
            border-radius: 6px;
            border: 1px solid var(--border-color);
            outline: none;
            font-size: 13px;
            font-weight: 600;
            background: #ffffff;
            color: #0f172a;
        }
        .search-box input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.15);
        }
        .search-box i {
            position: absolute;
            left: 11px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 14px;
        }

        /* Quick Action Contact Buttons */
        .btn-wa {
            background: #25D366;
            color: #ffffff;
            border: none;
            height: 36px;
            padding: 0 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            text-decoration: none;
            white-space: nowrap;
        }
        .btn-call {
            background: #0284c7;
            color: #ffffff;
            border: none;
            height: 36px;
            padding: 0 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            text-decoration: none;
            white-space: nowrap;
        }

        /* Table Design matching illustrated catalog */
        .table-responsive {
            width: 100%;
            overflow-x: auto;
        }
        table.catalog-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        table.catalog-table th {
            background: #f1f5f9;
            color: #000;
            font-weight: 900;
            text-transform: uppercase;
            padding: 8px 6px;
            border: 1px solid #000;
            text-align: center;
            font-size: 11.5px;
        }
        table.catalog-table td {
            border: 1px solid #000;
            padding: 6px 8px;
            font-size: 12px;
            color: #000;
        }
        td.cell-group-title {
            vertical-align: middle;
            text-align: center;
            font-weight: 900;
            letter-spacing: 0.5px;
            font-size: 13px;
            background: #ffffff;
        }
        td.cell-img {
            vertical-align: middle;
            text-align: center;
            padding: 4px;
            width: 90px;
            background: #ffffff;
        }
        td.cell-img img {
            max-height: 60px;
            max-width: 85px;
            object-fit: contain;
            display: block;
            margin: auto;
        }

        /* Footer */
        .footer-note {
            padding: 8px 14px;
            background: #f8fafc;
            border-top: 1px solid #000;
            font-size: 11px;
            font-style: italic;
            font-weight: 800;
            color: #0f172a;
        }
        .footer-addr {
            padding: 0 14px 10px 14px;
            background: #f8fafc;
            font-size: 11.5px;
            font-weight: 800;
            color: #334155;
        }
        .accent-strip {
            height: 12px;
            background: var(--header-dark);
            border-bottom: 5px solid var(--primary);
        }

        @media (max-width: 600px) {
            body { padding: 4px; }
            .brand-info h1 { font-size: 16px; }
            .brand-info p { font-size: 9.5px; }
            .ribbon-title { font-size: 13px; padding: 3px 20px; }
            table.catalog-table { font-size: 11px; }
            table.catalog-table th { padding: 5px 3px; font-size: 10px; }
            table.catalog-table td { padding: 4px 4px; font-size: 10.5px; }
            td.cell-img { width: 70px; }
            td.cell-img img { max-height: 48px; max-width: 65px; }
        }
    </style>
</head>
<body>

<div class="container">
    <!-- Header -->
    <div class="header-bar">
        <div class="header-brand">
            <?php if (!empty($compLogo)): ?>
                <img src="<?= $compLogo ?>" class="logo-img" alt="Logo">
            <?php else: ?>
                <div class="logo-fallback"><?= mb_substr($compName, 0, 1) ?></div>
            <?php endif; ?>
            <div class="brand-info">
                <h1><?= $compName ?></h1>
                <?php if ($compAddr || $compPhone): ?>
                    <p><?= $compAddr ?> <?= $compPhone ? ' | Tel: ' . $compPhone : '' ?></p>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <!-- Title Ribbon -->
    <div class="ribbon">
        <div class="ribbon-title">Price list</div>
        <div class="ribbon-date">Date : <?= $today ?></div>
    </div>

    <!-- Customer Specific Notice (if any) -->
    <?php if (!empty($customerName)): ?>
        <div class="customer-banner">
            <i class="fas fa-user-tag"></i> Special Negotiated Rates for: <strong><?= $customerName ?></strong>
        </div>
    <?php endif; ?>

    <!-- Search & Quick Contact Bar -->
    <div class="search-bar-wrap">
        <div class="search-box">
            <i class="fas fa-search"></i>
            <input type="search" id="catalogSearch" placeholder="Search fitting, item name, or size..." oninput="filterCatalog()">
        </div>
        <?php if (!empty($waPhone)): ?>
            <a href="https://wa.me/<?= $waPhone ?>?text=<?= urlencode('Hello ' . $compName . ', I am checking your digital price list and would like to place an order.') ?>" target="_blank" class="btn-wa">
                <i class="fab fa-whatsapp"></i> <span>Order</span>
            </a>
        <?php endif; ?>
        <?php if (!empty($compPhone)): ?>
            <a href="tel:<?= $compPhone ?>" class="btn-call">
                <i class="fas fa-phone-alt"></i>
            </a>
        <?php endif; ?>
    </div>

    <!-- Catalog Table -->
    <div class="table-responsive">
        <table class="catalog-table" id="catalogTable">
            <thead>
                <tr>
                    <th style="width: 40px;">S.No</th>
                    <th style="width: 80px;">Item Code</th>
                    <th>Items Name</th>
                    <th style="width: 75px;">Size</th>
                    <th style="width: 85px;">Rate/Pcs</th>
                    <th style="width: 75px;">Pcs/Ctn</th>
                    <th style="width: 95px;">Rate/Ctn</th>
                    <th style="width: 90px;">Items</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($groups)): ?>
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 30px; color: #94a3b8;">
                            No items found in this price list.
                        </td>
                    </tr>
                <?php else: ?>
                    <?php 
                    $sno = 1; 
                    foreach ($groups as $grp): 
                        $rowCount = count($grp['items']);
                        foreach ($grp['items'] as $idx => $it):
                            $rate = floatval($it['final_price'] ?? 0);
                            $ctn = floatval($it['pcs_per_carton'] ?? 0);
                            $rateCtn = ($ctn > 0) ? ($rate * $ctn) : 0;
                            $sizeStr = !empty($it['size']) ? $it['size'] : '-';
                            $ctnStr = ($ctn > 0) ? intval($ctn) : '-';
                            $rateCtnStr = ($rateCtn > 0) ? number_format($rateCtn, 0) : '-';
                    ?>
                        <tr class="item-row" data-search="<?= strtolower(htmlspecialchars($grp['name'] . ' ' . $it['item_name'] . ' ' . $it['item_code'] . ' ' . $sizeStr)) ?>">
                            <td style="text-align:center; font-weight:700;"><?= $sno++ ?></td>
                            <td style="text-align:center; font-weight:600;"><?= htmlspecialchars($it['item_code'] ?: '-') ?></td>
                            <?php if ($idx === 0): ?>
                                <td rowspan="<?= $rowCount ?>" class="cell-group-title">
                                    <?= htmlspecialchars($grp['name']) ?>
                                </td>
                            <?php endif; ?>
                            <td style="text-align:center; font-weight:700;"><?= htmlspecialchars($sizeStr) ?></td>
                            <td style="text-align:right; font-weight:800; padding-right:8px;"><?= number_format($rate, 2) ?></td>
                            <td style="text-align:center; font-weight:700;"><?= $ctnStr ?></td>
                            <td style="text-align:right; font-weight:800; padding-right:8px;"><?= $rateCtnStr ?></td>
                            <?php if ($idx === 0): ?>
                                <td rowspan="<?= $rowCount ?>" class="cell-img">
                                    <?php if (!empty($grp['image'])): ?>
                                        <img src="<?= htmlspecialchars($grp['image']) ?>" alt="<?= htmlspecialchars($grp['name']) ?>">
                                    <?php else: ?>
                                        <span style="color:#94a3b8; font-size:10px;"><?= htmlspecialchars($grp['name']) ?></span>
                                    <?php endif; ?>
                                </td>
                            <?php endif; ?>
                        </tr>
                    <?php 
                        endforeach; 
                    endforeach; 
                    ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <!-- Footer Notice -->
    <div class="footer-note">
        1. All Prices are subject to change without prior Notice
    </div>
    <div class="footer-addr">
        <?= $compAddr ?> <?= $compPhone ? ' | Tel: ' . $compPhone : '' ?>
    </div>

    <div class="accent-strip"></div>
</div>

<script>
// Instant Client-side Search / Filtering on Phone Screen
function filterCatalog() {
    const query = document.getElementById('catalogSearch').value.toLowerCase().trim();
    const rows = document.querySelectorAll('#catalogTable tbody tr.item-row');
    rows.forEach(row => {
        const text = row.getAttribute('data-search') || '';
        if (query === '' || text.indexOf(query) !== -1) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}
</script>

</body>
</html>
