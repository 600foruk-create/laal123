<?php
// SoftifyX ERP - Tax Transaction Report API (Sales & Purchase)
// Preserves existing WHT report compatibility while supporting full Sales & Purchase tax aggregation
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'get_filters') {
    $res = [
        'customer_types' => [],
        'buyer_types' => [],
        'parties' => []
    ];
    try {
        // Customer Types from coa_sub specifically under Trade Debtors / Customers
        $stmtTypes = $pdo->prepare("
            SELECT cs.id, cs.code, cs.name 
            FROM coa_sub cs
            WHERE cs.company_id = ? 
              AND (
                cs.main_id IN (SELECT id FROM coa_main WHERE code = '120' OR name LIKE '%customer%' OR name LIKE '%debtor%')
                OR cs.name LIKE '%customer%'
                OR cs.name LIKE '%debtor%'
                OR cs.name LIKE '%credit%'
                OR cs.name LIKE '%cash%'
              )
            ORDER BY cs.code ASC, cs.name ASC
        ");
        $stmtTypes->execute([$company_id]);
        $custTypes = $stmtTypes->fetchAll(PDO::FETCH_ASSOC);

        if (empty($custTypes)) {
            $stmtFallback = $pdo->prepare("
                SELECT * FROM coa_sub 
                WHERE main_id IN (SELECT id FROM coa_main WHERE code = '120') AND company_id = ? 
                ORDER BY code ASC
            ");
            $stmtFallback->execute([$company_id]);
            $custTypes = $stmtFallback->fetchAll(PDO::FETCH_ASSOC);
        }

        if (empty($custTypes)) {
            $custTypes = [
                ['id' => 'cash', 'code' => '12001', 'name' => 'Cash Customer'],
                ['id' => 'credit', 'code' => '12002', 'name' => 'Credit Customer']
            ];
        }
        $res['customer_types'] = $custTypes;

        // Buyer Types / Business Types
        try {
            $stmtBt = $pdo->prepare("SELECT id, name FROM buyer_types WHERE company_id = ? ORDER BY name ASC");
            $stmtBt->execute([$company_id]);
            $res['buyer_types'] = $stmtBt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}

        // Parties (Both Customers & Vendors)
        $parties = [];

        // Customers
        $stmtCust = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, 'Customer' as type, COALESCE(c.ntn_cnic, c.cnic, '') as ntn_cnic
            FROM coa_list cl
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            WHERE cl.company_id = ?
            ORDER BY cl.name ASC
        ");
        $stmtCust->execute([$company_id]);
        while ($row = $stmtCust->fetch(PDO::FETCH_ASSOC)) {
            $parties[] = $row;
        }

        // Vendors
        $stmtVend = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, 'Vendor' as type, COALESCE(v.ntn_cnic, '') as ntn_cnic
            FROM coa_list cl
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
            WHERE cl.company_id = ?
            ORDER BY cl.name ASC
        ");
        $stmtVend->execute([$company_id]);
        while ($row = $stmtVend->fetch(PDO::FETCH_ASSOC)) {
            $parties[] = $row;
        }

        $res['parties'] = $parties;
    } catch (Exception $e) {
        $res['error'] = $e->getMessage();
    }
    echo json_encode($res);
    exit;
}

if ($action === 'get_data') {
    $txn_type = strtolower($_GET['txn_type'] ?? 'all'); // all, sale, purchase
    $party_type = strtolower($_GET['party_type'] ?? 'all'); // all, customer, vendor
    $party_name = trim($_GET['party_name'] ?? '');
    $ntn_cnic = trim($_GET['ntn_cnic'] ?? '');
    $customer_type_id = $_GET['customer_type_id'] ?? null;
    $business_type = trim($_GET['business_type'] ?? '');
    $tax_section = strtolower($_GET['tax_section'] ?? 'all'); // all, sales_tax, further_tax, 236g, 236h
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;
    $customer_coa_id = $_GET['customer_coa_id'] ?? null;

    $results = [];

    // 1. FETCH SALES INVOICES (if txn_type != 'purchase' and party_type != 'vendor')
    if ($txn_type !== 'purchase' && $party_type !== 'vendor') {
        $siSql = "
            SELECT 
                si.id as id,
                'Sale' as txn_type,
                si.invoice_date as invoice_date,
                si.serial_no as serial_no,
                CONCAT('SI-', LPAD(si.serial_no, 6, '0')) as invoice_no,
                si.is_tax_invoice,
                si.customer_coa_id as party_coa_id,
                COALESCE(NULLIF(TRIM(si.customer_name), ''), cl.name, 'CASH CUSTOMER') as party_name,
                'Customer' as party_type,
                COALESCE(NULLIF(TRIM(bt.name), ''), 'Retailer') as business_type,
                COALESCE(NULLIF(TRIM(si.customer_ntn), ''), NULLIF(TRIM(c.ntn_cnic), ''), NULLIF(TRIM(c.cnic), ''), '-') as ntn_cnic,
                si.customer_wht_type as wht_type,
                COALESCE(si.customer_tax_rate, 0) as raw_wht_rate,
                COALESCE(si.customer_tax_amount, 0) as raw_wht_amount,
                COALESCE(si.net_total, 0) as invoice_total,
                COALESCE(
                    (SELECT SUM(sii.gross_amount - COALESCE(sii.discount_amount, 0)) FROM sale_invoice_items sii WHERE sii.invoice_id = si.id),
                    si.gross_amount,
                    si.net_total - COALESCE(si.customer_tax_amount, 0)
                ) as taxable_amount,
                COALESCE((SELECT SUM(sii.sales_tax_amount) FROM sale_invoice_items sii WHERE sii.invoice_id = si.id), 0) as sales_tax_amount,
                COALESCE((SELECT MAX(sii.sales_tax_rate) FROM sale_invoice_items sii WHERE sii.invoice_id = si.id AND sii.sales_tax_amount > 0), 0) as sales_tax_rate,
                COALESCE((SELECT SUM(sii.further_tax_amount) FROM sale_invoice_items sii WHERE sii.invoice_id = si.id), 0) as further_tax_amount,
                COALESCE((SELECT MAX(sii.further_tax_rate) FROM sale_invoice_items sii WHERE sii.invoice_id = si.id AND sii.further_tax_amount > 0), 0) as further_tax_rate
            FROM sale_invoices si
            LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
            LEFT JOIN customers c ON si.customer_coa_id = c.coa_list_id
            LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id
            WHERE si.company_id = ? AND si.is_cancelled = 0
        ";
        $siParams = [$company_id];

        if ($customer_type_id && $customer_type_id !== 'all' && $customer_type_id !== '') {
            $subName = '';
            if (is_numeric($customer_type_id)) {
                try {
                    $stmtSub = $pdo->prepare("SELECT name FROM coa_sub WHERE id = ?");
                    $stmtSub->execute([$customer_type_id]);
                    $subName = strtolower($stmtSub->fetchColumn() ?: '');
                } catch (Exception $e) {}
            } else {
                $subName = strtolower($customer_type_id);
            }

            if (strpos($subName, 'cash') !== false) {
                $siSql .= " AND (
                    cl.sub_id = ? 
                    OR si.customer_name LIKE '%cash%' 
                    OR si.customer_name LIKE '%walk-in%'
                    OR si.customer_name LIKE '%walk in%'
                    OR si.customer_coa_id IN (SELECT id FROM coa_list WHERE name LIKE '%cash%' OR code LIKE '12001%')
                )";
                $siParams[] = is_numeric($customer_type_id) ? $customer_type_id : 0;
            } elseif (strpos($subName, 'credit') !== false) {
                $siSql .= " AND (
                    cl.sub_id = ? 
                    OR (
                        si.customer_name NOT LIKE '%cash%' 
                        AND si.customer_name NOT LIKE '%walk-in%'
                        AND si.customer_name NOT LIKE '%walk in%'
                        AND si.customer_coa_id NOT IN (SELECT id FROM coa_list WHERE name LIKE '%cash%' OR code LIKE '12001%')
                    )
                )";
                $siParams[] = is_numeric($customer_type_id) ? $customer_type_id : 0;
            } else {
                $siSql .= " AND cl.sub_id = ?";
                $siParams[] = $customer_type_id;
            }
        }
        if ($customer_coa_id) {
            $siSql .= " AND si.customer_coa_id = ?";
            $siParams[] = $customer_coa_id;
        }
        if ($from_date && $to_date) {
            $siSql .= " AND si.invoice_date BETWEEN ? AND ?";
            $siParams[] = $from_date;
            $siParams[] = $to_date;
        } elseif ($from_date) {
            $siSql .= " AND si.invoice_date >= ?";
            $siParams[] = $from_date;
        } elseif ($to_date) {
            $siSql .= " AND si.invoice_date <= ?";
            $siParams[] = $to_date;
        }

        try {
            $stmt = $pdo->prepare($siSql);
            $stmt->execute($siParams);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $row['source'] = 'sale_invoice';
                $results[] = $row;
            }
        } catch (Exception $e) {}

        // Also check if any FBR digital invoices are in fbr_digital_invoices not already represented
        try {
            $fbrCheck = $pdo->query("SHOW TABLES LIKE 'fbr_digital_invoices'")->fetch();
            if ($fbrCheck) {
                $fbrSql = "
                    SELECT 
                        fdi.id as id,
                        'Sale' as txn_type,
                        fdi.invoice_date as invoice_date,
                        fdi.serial_no as serial_no,
                        COALESCE(NULLIF(fdi.invoice_no, ''), CONCAT('FBR-', LPAD(fdi.serial_no, 6, '0'))) as invoice_no,
                        1 as is_tax_invoice,
                        fdi.customer_coa_id as party_coa_id,
                        fdi.customer_name as party_name,
                        'Customer' as party_type,
                        'Retailer' as business_type,
                        COALESCE(NULLIF(TRIM(fdi.customer_ntn), ''), NULLIF(TRIM(fdi.customer_cnic), ''), '-') as ntn_cnic,
                        '' as wht_type,
                        0 as raw_wht_rate,
                        0 as raw_wht_amount,
                        fdi.total_invoice_amount as invoice_total,
                        fdi.taxable_amount as taxable_amount,
                        fdi.total_sales_tax as sales_tax_amount,
                        18.00 as sales_tax_rate,
                        fdi.total_further_tax as further_tax_amount,
                        0.00 as further_tax_rate
                    FROM fbr_digital_invoices fdi
                    WHERE fdi.company_id = ? AND (fdi.workflow_status IS NULL OR fdi.workflow_status != 'Cancelled')
                ";
                $fbrParams = [$company_id];
                if ($from_date && $to_date) {
                    $fbrSql .= " AND fdi.invoice_date BETWEEN ? AND ?";
                    $fbrParams[] = $from_date;
                    $fbrParams[] = $to_date;
                }
                $fbrStmt = $pdo->prepare($fbrSql);
                $fbrStmt->execute($fbrParams);
                // Only add if invoice_no not already present in results
                $existingInvNos = array_flip(array_column($results, 'invoice_no'));
                while ($fRow = $fbrStmt->fetch(PDO::FETCH_ASSOC)) {
                    if (!isset($existingInvNos[$fRow['invoice_no']])) {
                        $fRow['source'] = 'fbr_digital_invoice';
                        $results[] = $fRow;
                    }
                }
            }
        } catch (Exception $e) {}
    }

    // 2. FETCH PURCHASE INVOICES (if txn_type != 'sale' and party_type != 'customer')
    if ($txn_type !== 'sale' && $party_type !== 'customer') {
        $piSql = "
            SELECT 
                pi.id as id,
                'Purchase' as txn_type,
                pi.invoice_date as invoice_date,
                pi.serial_no as serial_no,
                CONCAT('PI-', LPAD(pi.serial_no, 6, '0')) as invoice_no,
                pi.is_tax_invoice,
                pi.vendor_coa_id as party_coa_id,
                COALESCE(NULLIF(TRIM(pi.vendor_name), ''), cl.name, 'CASH VENDOR') as party_name,
                'Vendor' as party_type,
                COALESCE(
                    (SELECT bt.name FROM customers c JOIN buyer_types bt ON c.buyer_type_id = bt.id WHERE c.coa_list_id = pi.vendor_coa_id LIMIT 1),
                    NULLIF(TRIM(cs.name), ''),
                    'Wholesaler'
                ) as business_type,
                COALESCE(NULLIF(TRIM(pi.vendor_ntn), ''), NULLIF(TRIM(v.ntn_cnic), ''), '-') as ntn_cnic,
                '' as wht_type,
                0 as raw_wht_rate,
                0 as raw_wht_amount,
                COALESCE(pi.net_total, 0) as invoice_total,
                COALESCE(
                    (SELECT SUM(pii.gross_amount - COALESCE(pii.discount_amount, 0)) FROM purchase_invoice_items pii WHERE pii.invoice_id = pi.id),
                    pi.net_total - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM purchase_invoice_items WHERE invoice_id = pi.id), 0)
                ) as taxable_amount,
                COALESCE((SELECT SUM(pii.sales_tax_amount) FROM purchase_invoice_items pii WHERE pii.invoice_id = pi.id), 0) as sales_tax_amount,
                COALESCE((SELECT MAX(pii.sales_tax_rate) FROM purchase_invoice_items pii WHERE pii.invoice_id = pi.id AND pii.sales_tax_amount > 0), 0) as sales_tax_rate,
                COALESCE((SELECT SUM(pii.further_tax_amount) FROM purchase_invoice_items pii WHERE pii.invoice_id = pi.id), 0) as further_tax_amount,
                COALESCE((SELECT MAX(pii.further_tax_rate) FROM purchase_invoice_items pii WHERE pii.invoice_id = pi.id AND pii.further_tax_amount > 0), 0) as further_tax_rate
            FROM purchase_invoices pi
            LEFT JOIN coa_list cl ON pi.vendor_coa_id = cl.id
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
            WHERE pi.company_id = ? AND pi.is_cancelled = 0
        ";
        $piParams = [$company_id];

        if ($from_date && $to_date) {
            $piSql .= " AND pi.invoice_date BETWEEN ? AND ?";
            $piParams[] = $from_date;
            $piParams[] = $to_date;
        } elseif ($from_date) {
            $piSql .= " AND pi.invoice_date >= ?";
            $piParams[] = $from_date;
        } elseif ($to_date) {
            $piSql .= " AND pi.invoice_date <= ?";
            $piParams[] = $to_date;
        }

        try {
            $stmt = $pdo->prepare($piSql);
            $stmt->execute($piParams);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $row['source'] = 'purchase_invoice';
                $results[] = $row;
            }
        } catch (Exception $e) {}
    }

    // 3. UNIFY TAX DATA AND FILTER IN MEMORY
    $filtered = [];

    foreach ($results as $row) {
        $taxable = floatval($row['taxable_amount'] ?? 0);
        $st_amount = floatval($row['sales_tax_amount'] ?? 0);
        $st_rate = floatval($row['sales_tax_rate'] ?? 0);
        $ft_amount = floatval($row['further_tax_amount'] ?? 0);
        $ft_rate = floatval($row['further_tax_rate'] ?? 0);

        // Calculate rate if amount > 0 but rate is 0
        if ($st_amount > 0 && $st_rate == 0 && $taxable > 0) {
            $st_rate = round(($st_amount / $taxable) * 100, 2);
        }
        if ($ft_amount > 0 && $ft_rate == 0 && $taxable > 0) {
            $ft_rate = round(($ft_amount / $taxable) * 100, 2);
        }

        $wht_type = trim($row['wht_type'] ?? '');
        $raw_wht_rate = floatval($row['raw_wht_rate'] ?? 0);
        $raw_wht_amount = floatval($row['raw_wht_amount'] ?? 0);

        $wht_236g_rate = 0.0;
        $wht_236g_amount = 0.0;
        $wht_236h_rate = 0.0;
        $wht_236h_amount = 0.0;

        if (stripos($wht_type, '236G') !== false || stripos($wht_type, '236-G') !== false) {
            $wht_236g_rate = $raw_wht_rate;
            $wht_236g_amount = $raw_wht_amount;
        } elseif (stripos($wht_type, '236H') !== false || stripos($wht_type, '236-H') !== false) {
            $wht_236h_rate = $raw_wht_rate;
            $wht_236h_amount = $raw_wht_amount;
        } elseif ($raw_wht_amount > 0) {
            if ($raw_wht_rate <= 0.25) {
                $wht_236g_rate = $raw_wht_rate;
                $wht_236g_amount = $raw_wht_amount;
            } else {
                $wht_236h_rate = $raw_wht_rate;
                $wht_236h_amount = $raw_wht_amount;
            }
        }

        $total_tax = $st_amount + $ft_amount + $wht_236g_amount + $wht_236h_amount;
        $inv_total = floatval($row['invoice_total'] ?? 0);
        if ($inv_total <= 0) {
            $inv_total = $taxable + $total_tax;
        }

        // Determine display tax section label
        if ($wht_236g_amount > 0) {
            $tax_section_label = '236G';
        } elseif ($wht_236h_amount > 0) {
            $tax_section_label = '236H';
        } elseif ($ft_amount > 0 && $st_amount <= 0) {
            $tax_section_label = 'Further Tax';
        } else {
            $tax_section_label = 'Sales Tax';
        }

        // Apply filters:
        // 1. Party Name filter
        if (!empty($party_name)) {
            if (stripos($row['party_name'], $party_name) === false && stripos($row['party_name'], $party_name) === false) {
                continue;
            }
        }

        // 2. NTN / CNIC filter
        if (!empty($ntn_cnic)) {
            $cleanSearch = preg_replace('/[^0-9A-Za-z]/', '', $ntn_cnic);
            $cleanRow = preg_replace('/[^0-9A-Za-z]/', '', $row['ntn_cnic']);
            if (stripos($cleanRow, $cleanSearch) === false) {
                continue;
            }
        }

        // 3. Business Type filter
        if (!empty($business_type) && strtolower($business_type) !== 'all' && strtolower($business_type) !== 'all business types') {
            if (stripos($row['business_type'], $business_type) === false) {
                continue;
            }
        }

        // 4. Tax Section filter
        if ($tax_section === 'sales_tax' && $st_amount <= 0) continue;
        if ($tax_section === 'further_tax' && $ft_amount <= 0) continue;
        if ($tax_section === '236g' && $wht_236g_amount <= 0) continue;
        if ($tax_section === '236h' && $wht_236h_amount <= 0) continue;

        // Formatted display date (e.g. 02-Oct-2026)
        $dateTs = !empty($row['invoice_date']) ? strtotime($row['invoice_date']) : time();
        $display_date = date('d-M-Y', $dateTs);

        $filtered[] = [
            'id' => $row['id'],
            'source' => $row['source'],
            'txn_type' => $row['txn_type'],
            'invoice_date' => $row['invoice_date'],
            'display_date' => $display_date,
            'serial_no' => $row['serial_no'],
            'invoice_no' => $row['invoice_no'],
            'tax_section' => $tax_section_label,
            'ntn_cnic' => $row['ntn_cnic'] ?: '-',
            'party_name' => $row['party_name'] ?: 'Unknown',
            'party_type' => $row['party_type'],
            'business_type' => $row['business_type'] ?: 'Wholesaler',
            'taxable_amount' => $taxable,
            'sales_tax_rate' => $st_rate,
            'sales_tax_amount' => $st_amount,
            'further_tax_rate' => $ft_rate,
            'further_tax_amount' => $ft_amount,
            'wht_236g_rate' => $wht_236g_rate,
            'wht_236g_amount' => $wht_236g_amount,
            'wht_236h_rate' => $wht_236h_rate,
            'wht_236h_amount' => $wht_236h_amount,
            'total_tax_amount' => $total_tax,
            'invoice_total' => $inv_total,
            'is_tax_invoice' => $row['is_tax_invoice'] ?? 1
        ];
    }

    // Sort by invoice_date ASC, invoice_no ASC
    usort($filtered, function($a, $b) {
        $d = strcmp($a['invoice_date'], $b['invoice_date']);
        if ($d !== 0) return $d;
        return strcmp($a['invoice_no'], $b['invoice_no']);
    });

    // Compute Summary Totals
    $summary = [
        'sales_count' => 0,
        'sales_tax_total' => 0.0,
        'purchase_count' => 0,
        'purchase_tax_total' => 0.0,
        'total_sales_tax' => 0.0,
        'total_further_tax' => 0.0,
        'total_wht_236g' => 0.0,
        'total_wht_236h' => 0.0,
        'total_tax_amount' => 0.0,
        'total_taxable_amount' => 0.0,
        'total_invoice_total' => 0.0
    ];

    foreach ($filtered as $f) {
        if ($f['txn_type'] === 'Sale') {
            $summary['sales_count']++;
            $summary['sales_tax_total'] += $f['total_tax_amount'];
        } else {
            $summary['purchase_count']++;
            $summary['purchase_tax_total'] += $f['total_tax_amount'];
        }

        $summary['total_sales_tax'] += $f['sales_tax_amount'];
        $summary['total_further_tax'] += $f['further_tax_amount'];
        $summary['total_wht_236g'] += $f['wht_236g_amount'];
        $summary['total_wht_236h'] += $f['wht_236h_amount'];
        $summary['total_tax_amount'] += $f['total_tax_amount'];
        $summary['total_taxable_amount'] += $f['taxable_amount'];
        $summary['total_invoice_total'] += $f['invoice_total'];
    }

    echo json_encode([
        'status' => 'success',
        'data' => $filtered,
        'summary' => $summary
    ]);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
exit;
