<?php
require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/inventory_costing_helpers.php';
header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// =========================================================================
// 1. LOOKUPS (Categories, Subcategories, Brands, Locations, Items)
// =========================================================================
if ($action === 'get_lookups') {
    try {
        // Main Categories
        $stmtMains = $pdo->prepare("SELECT id, code, name, category_type FROM inv_main_categories WHERE company_id = ? ORDER BY name ASC");
        $stmtMains->execute([$company_id]);
        $mains = $stmtMains->fetchAll(PDO::FETCH_ASSOC);

        // Sub Categories
        $stmtSubs = $pdo->prepare("SELECT id, main_id, code, name FROM inv_sub_categories WHERE company_id = ? ORDER BY name ASC");
        $stmtSubs->execute([$company_id]);
        $subs = $stmtSubs->fetchAll(PDO::FETCH_ASSOC);

        // Brands
        $stmtBrands = $pdo->prepare("SELECT id, name FROM inv_brands WHERE company_id = ? ORDER BY name ASC");
        $stmtBrands->execute([$company_id]);
        $brands = $stmtBrands->fetchAll(PDO::FETCH_ASSOC);

        // Locations
        $stmtLoc = $pdo->prepare("SELECT id, name, is_default FROM inv_locations WHERE company_id = ? ORDER BY is_default DESC, name ASC");
        $stmtLoc->execute([$company_id]);
        $locations = $stmtLoc->fetchAll(PDO::FETCH_ASSOC);

        // Active Items
        $stmtItems = $pdo->prepare("
            SELECT i.id, i.code as item_code, i.name as item_name, i.unit, i.sub_id, i.brand_id,
                   i.carton, i.qty_per_piece, i.unit_weight, i.order_qty, i.category_type,
                   sm.id as main_cat_id, sm.name as main_cat_name, sm.category_type as main_cat_type
            FROM inv_items i
            LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
            LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY i.code ASC, i.name ASC
        ");
        $stmtItems->execute([$company_id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'mains' => $mains,
            'subs' => $subs,
            'brands' => $brands,
            'locations' => $locations,
            'items' => $items
        ]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 2. MAIN INVENTORY BALANCES ENGINE (Delegates to shared computeInventoryClosingStock)
// =========================================================================
if ($action === 'get_balances') {
    try {
        echo json_encode(computeInventoryClosingStock($pdo, $company_id, $_GET));
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 3. ITEM LEDGER TAB (Chronological Transaction History for a Selected Item)
// =========================================================================
if ($action === 'get_item_ledger') {
    $item_id     = intval($_GET['item_id'] ?? 0);
    $location_id = trim($_GET['location_id'] ?? '');
    $from_date   = trim($_GET['from_date']   ?? '');
    $to_date     = trim($_GET['to_date']     ?? date('Y-m-d'));

    if (!$item_id) {
        echo json_encode(['status' => 'error', 'error' => 'Item ID is required']);
        exit;
    }

    try {
        // Fetch Item Info
        $stmtItem = $pdo->prepare("
            SELECT i.*, sm.name as main_cat_name, ss.name as sub_cat_name
            FROM inv_items i
            LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
            LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
            WHERE i.id = ? AND i.company_id = ?
        ");
        $stmtItem->execute([$item_id, $company_id]);
        $itemInfo = $stmtItem->fetch(PDO::FETCH_ASSOC);

        if (!$itemInfo) {
            echo json_encode(['status' => 'error', 'error' => 'Item not found']);
            exit;
        }

        $unitDef = resolveItemCategoryAndUnits($itemInfo);

        $locCond = function($col) use ($location_id) {
            return $location_id ? " AND $col = " . intval($location_id) : "";
        };

        // Collect all chronological transactions
        $txQueries = [];

        // 1. Initial Opening Balance
        $txQueries[] = "
            SELECT 
                '1970-01-01' as date,
                'OB' as voucher_no,
                'Opening Balance' as trans_type,
                'Initial Balance' as ref_info,
                l.name as location_name,
                ob.pieces as in_pieces,
                ob.quantity as in_qty,
                0 as out_pieces,
                0 as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM inv_opening_balances ob
            LEFT JOIN inv_locations l ON ob.location_id = l.id
            WHERE ob.company_id = $company_id AND ob.item_id = $item_id" . $locCond('ob.location_id');

        // 2. Purchases
        $txQueries[] = "
            SELECT 
                pi.invoice_date as date,
                CONCAT('PI-', pi.serial_no) as voucher_no,
                'Purchase Invoice' as trans_type,
                CONCAT('Vendor: ', IFNULL(c.name, '')) as ref_info,
                l.name as location_name,
                pii.pieces as in_pieces,
                pii.quantity as in_qty,
                0 as out_pieces,
                0 as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM purchase_invoice_items pii
            JOIN purchase_invoices pi ON pii.invoice_id = pi.id
            LEFT JOIN coa_list c ON pi.vendor_coa_id = c.id
            LEFT JOIN inv_locations l ON pi.inventory_location_id = l.id
            WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1
              AND pii.item_coa_id = $item_id" . $locCond('pi.inventory_location_id');

        // 3. Purchase Returns
        $txQueries[] = "
            SELECT 
                pr.return_date as date,
                CONCAT('PR-', pr.serial_no) as voucher_no,
                'Purchase Return' as trans_type,
                CONCAT('Vendor: ', IFNULL(c.name, '')) as ref_info,
                l.name as location_name,
                0 as in_pieces,
                0 as in_qty,
                pri.pieces as out_pieces,
                pri.quantity as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM purchase_return_items pri
            JOIN purchase_returns pr ON pri.return_id = pr.id
            LEFT JOIN coa_list c ON pr.vendor_coa_id = c.id
            LEFT JOIN inv_locations l ON pr.inventory_location_id = l.id
            WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1
              AND pri.item_coa_id = $item_id" . $locCond('pr.inventory_location_id');

        // 4. Sales Invoices
        $txQueries[] = "
            SELECT 
                si.invoice_date as date,
                CONCAT('SI-', si.serial_no) as voucher_no,
                'Sale Invoice' as trans_type,
                CONCAT('Customer: ', IFNULL(c.name, '')) as ref_info,
                l.name as location_name,
                0 as in_pieces,
                0 as in_qty,
                sii.pieces as out_pieces,
                sii.quantity as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM sale_invoice_items sii
            JOIN sale_invoices si ON sii.invoice_id = si.id
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            LEFT JOIN inv_locations l ON si.inventory_location_id = l.id
            WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1
              AND sii.item_coa_id = $item_id" . $locCond('si.inventory_location_id');

        // 5. Sale Returns
        $txQueries[] = "
            SELECT 
                sr.return_date as date,
                CONCAT('SR-', sr.serial_no) as voucher_no,
                'Sale Return' as trans_type,
                CONCAT('Customer: ', IFNULL(c.name, '')) as ref_info,
                l.name as location_name,
                sri.pieces as in_pieces,
                sri.quantity as in_qty,
                0 as out_pieces,
                0 as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM sale_return_items sri
            JOIN sale_returns sr ON sri.return_id = sr.id
            LEFT JOIN coa_list c ON sr.customer_coa_id = c.id
            LEFT JOIN inv_locations l ON sr.inventory_location_id = l.id
            WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1
              AND sri.item_coa_id = $item_id" . $locCond('sr.inventory_location_id');

        // 6. Adjustments (Add)
        $txQueries[] = "
            SELECT 
                a.date as date,
                CONCAT('ADJ+', a.serial_no) as voucher_no,
                'Stock Adjustment (Add)' as trans_type,
                IFNULL(a.remarks, '') as ref_info,
                l.name as location_name,
                0 as in_pieces,
                0 as in_qty,
                0 as out_pieces,
                0 as out_qty,
                ai.pieces as adj_pieces,
                ai.qty as adj_qty
            FROM add_inventory_adjustment_items ai
            JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id
            LEFT JOIN inv_locations l ON a.inventory_location_id = l.id
            WHERE a.company_id = $company_id AND a.is_cancelled = 0
              AND ai.item_id = $item_id" . $locCond('a.inventory_location_id');

        // 7. Adjustments (Reduce)
        $txQueries[] = "
            SELECT 
                r.date as date,
                CONCAT('ADJ-', r.serial_no) as voucher_no,
                'Stock Adjustment (Reduce)' as trans_type,
                IFNULL(r.remarks, '') as ref_info,
                l.name as location_name,
                0 as in_pieces,
                0 as in_qty,
                0 as out_pieces,
                0 as out_qty,
                -ri.pieces as adj_pieces,
                -ri.qty as adj_qty
            FROM reduce_inventory_adjustment_items ri
            JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id
            LEFT JOIN inv_locations l ON r.inventory_location_id = l.id
            WHERE r.company_id = $company_id AND r.is_cancelled = 0
              AND ri.item_id = $item_id" . $locCond('r.inventory_location_id');

        // 8. Production Notes
        $txQueries[] = "
            SELECT 
                p.date as date,
                CONCAT('PN-', p.serial_no) as voucher_no,
                CASE WHEN pp.qty > 0 THEN 'Production Output' ELSE 'Production Consumption' END as trans_type,
                IFNULL(p.remarks, '') as ref_info,
                l.name as location_name,
                CASE WHEN pp.qty > 0 THEN pp.pieces ELSE 0 END as in_pieces,
                CASE WHEN pp.qty > 0 THEN pp.qty ELSE 0 END as in_qty,
                CASE WHEN pp.qty < 0 THEN ABS(pp.pieces) ELSE 0 END as out_pieces,
                CASE WHEN pp.qty < 0 THEN ABS(pp.qty) ELSE 0 END as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM production_note_items pp
            JOIN production_notes p ON pp.pn_id = p.id
            LEFT JOIN inv_locations l ON p.inventory_location_id = l.id
            WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1
              AND pp.item_id = $item_id" . $locCond('p.inventory_location_id');

        // 9. Material Issue Notes
        $txQueries[] = "
            SELECT 
                m.date as date,
                CONCAT('MIN-', m.serial_no) as voucher_no,
                'Material Issue Note' as trans_type,
                IFNULL(m.remarks, '') as ref_info,
                l.name as location_name,
                0 as in_pieces,
                0 as in_qty,
                mii.pieces as out_pieces,
                mii.qty as out_qty,
                0 as adj_pieces,
                0 as adj_qty
            FROM material_issue_note_items mii
            JOIN material_issue_notes m ON mii.min_id = m.id
            LEFT JOIN inv_locations l ON m.inventory_location_id = l.id
            WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1
              AND mii.item_id = $item_id" . $locCond('m.inventory_location_id');

        $fullLedgerSql = implode(" UNION ALL ", $txQueries) . " ORDER BY date ASC, voucher_no ASC";
        $stmtLedger = $pdo->query($fullLedgerSql);
        $allTx = $stmtLedger->fetchAll(PDO::FETCH_ASSOC);

        // Process running balance
        $openingRow = ['date' => $from_date ?: '-', 'voucher_no' => '-', 'trans_type' => 'Opening Balance', 'ref_info' => 'Initial / Prior Transactions', 'location_name' => '-', 'in_primary' => 0, 'in_sec' => 0, 'out_primary' => 0, 'out_sec' => 0, 'adj_primary' => 0, 'adj_sec' => 0, 'bal_primary' => 0, 'bal_sec' => 0];
        
        $runningPrimary = 0;
        $runningSec = 0;
        $ledgerRows = [];

        foreach ($allTx as $tx) {
            $txDate = $tx['date'];
            $inP = floatval($tx['in_pieces']);
            $inQ = floatval($tx['in_qty']);
            $outP = floatval($tx['out_pieces']);
            $outQ = floatval($tx['out_qty']);
            $adjP = floatval($tx['adj_pieces']);
            $adjQ = floatval($tx['adj_qty']);

            if ($from_date && $txDate < $from_date) {
                $runningPrimary += ($inP - $outP + $adjP);
                $runningSec     += ($inQ - $outQ + $adjQ);
                continue;
            }

            if ($to_date && $txDate > $to_date) continue;

            $runningPrimary += ($inP - $outP + $adjP);
            $runningSec     += ($inQ - $outQ + $adjQ);

            $ledgerRows[] = [
                'date' => $txDate === '1970-01-01' ? 'Opening' : $txDate,
                'voucher_no' => $tx['voucher_no'],
                'trans_type' => $tx['trans_type'],
                'ref_info' => $tx['ref_info'],
                'location_name' => $tx['location_name'] ?: 'Main Store',
                'in_primary' => $inP,
                'in_sec' => $inQ,
                'out_primary' => $outP,
                'out_sec' => $outQ,
                'adj_primary' => $adjP,
                'adj_sec' => $adjQ,
                'bal_primary' => round($runningPrimary, 2),
                'bal_sec' => round($runningSec, 2)
            ];
        }

        $openingRow['bal_primary'] = round($runningPrimary - array_sum(array_column($ledgerRows, 'in_primary')) + array_sum(array_column($ledgerRows, 'out_primary')) - array_sum(array_column($ledgerRows, 'adj_primary')), 2);
        $openingRow['bal_sec']     = round($runningSec - array_sum(array_column($ledgerRows, 'in_sec')) + array_sum(array_column($ledgerRows, 'out_sec')) - array_sum(array_column($ledgerRows, 'adj_sec')), 2);

        echo json_encode([
            'status' => 'success',
            'item' => [
                'id' => $itemInfo['id'],
                'code' => $itemInfo['code'],
                'name' => $itemInfo['name'],
                'group' => $unitDef['group'],
                'unit_display' => $unitDef['unit_display'],
                'primary_unit' => $unitDef['primary_unit'],
                'secondary_unit' => $unitDef['secondary_unit']
            ],
            'opening' => $openingRow,
            'ledger' => $ledgerRows,
            'closing' => [
                'bal_primary' => round($runningPrimary, 2),
                'bal_sec' => round($runningSec, 2)
            ]
        ]);

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 4. LOCATION WISE STOCK TAB (Matrix breakdown across warehouses)
// =========================================================================
if ($action === 'get_location_stock') {
    try {
        // Fetch All Active Locations
        $stmtLoc = $pdo->prepare("SELECT id, name FROM inv_locations WHERE company_id = ? ORDER BY is_default DESC, name ASC");
        $stmtLoc->execute([$company_id]);
        $locations = $stmtLoc->fetchAll(PDO::FETCH_ASSOC);

        // Fetch Items
        $stmtItems = $pdo->prepare("
            SELECT i.id, i.code, i.name, i.unit, sm.name as main_category_name, i.category_type, i.carton, i.qty_per_piece, i.unit_weight
            FROM inv_items i
            LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
            LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY sm.name ASC, i.code ASC
        ");
        $stmtItems->execute([$company_id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        if (empty($items)) {
            echo json_encode(['status' => 'success', 'locations' => $locations, 'rows' => []]);
            exit;
        }

        $id_list = implode(',', array_column($items, 'id'));

        // Location Balances Query
        $locQueries = [];
        $locQueries[] = "SELECT item_id, location_id, pieces, quantity FROM inv_opening_balances WHERE company_id = $company_id AND item_id IN ($id_list)";
        $locQueries[] = "SELECT pii.item_coa_id as item_id, pi.inventory_location_id as location_id, pii.pieces, pii.quantity FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pii.item_coa_id IN ($id_list)";
        $locQueries[] = "SELECT sri.item_coa_id as item_id, sr.inventory_location_id as location_id, sri.pieces, sri.quantity FROM sale_return_items sri JOIN sale_returns sr ON sri.return_id = sr.id WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1 AND sri.item_coa_id IN ($id_list)";
        $locQueries[] = "SELECT sii.item_coa_id as item_id, si.inventory_location_id as location_id, -sii.pieces as pieces, -sii.quantity as quantity FROM sale_invoice_items sii JOIN sale_invoices si ON sii.invoice_id = si.id WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 AND sii.item_coa_id IN ($id_list)";
        $locQueries[] = "SELECT pri.item_coa_id as item_id, pr.inventory_location_id as location_id, -pri.pieces as pieces, -pri.quantity as quantity FROM purchase_return_items pri JOIN purchase_returns pr ON pri.return_id = pr.id WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 AND pri.item_coa_id IN ($id_list)";
        $locQueries[] = "SELECT ai.item_id, a.inventory_location_id as location_id, ai.pieces, ai.qty as quantity FROM add_inventory_adjustment_items ai JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id WHERE a.company_id = $company_id AND a.is_cancelled = 0 AND ai.item_id IN ($id_list)";
        $locQueries[] = "SELECT ri.item_id, r.inventory_location_id as location_id, -ri.pieces as pieces, -ri.qty as quantity FROM reduce_inventory_adjustment_items ri JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id WHERE r.company_id = $company_id AND r.is_cancelled = 0 AND ri.item_id IN ($id_list)";
        $locQueries[] = "SELECT pp.item_id, p.inventory_location_id as location_id, pp.pieces, pp.qty as quantity FROM production_note_items pp JOIN production_notes p ON pp.pn_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.item_id IN ($id_list)";
        $locQueries[] = "SELECT mii.item_id, m.inventory_location_id as location_id, -mii.pieces as pieces, -mii.qty as quantity FROM material_issue_note_items mii JOIN material_issue_notes m ON mii.min_id = m.id WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 AND mii.item_id IN ($id_list)";
        $locQueries[] = "SELECT ti.item_id, t.transfer_from_location_id as location_id, -ti.pieces as pieces, -ti.qty as quantity FROM inventory_transfer_items ti JOIN inventory_transfers t ON ti.transfer_id = t.id WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id IN ($id_list)";
        $locQueries[] = "SELECT ti.item_id, t.transfer_to_location_id as location_id, ti.pieces as pieces, ti.qty as quantity FROM inventory_transfer_items ti JOIN inventory_transfers t ON ti.transfer_id = t.id WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id IN ($id_list)";

        $unionLoc = implode(" UNION ALL ", $locQueries);
        $locSql = "SELECT item_id, location_id, SUM(pieces) as total_pcs, SUM(quantity) as total_qty FROM ($unionLoc) as loc_agg WHERE location_id IS NOT NULL AND location_id > 0 GROUP BY item_id, location_id";
        $stmtLocAgg = $pdo->query($locSql);
        $locMap = [];
        while ($lRow = $stmtLocAgg->fetch(PDO::FETCH_ASSOC)) {
            $locMap[$lRow['item_id']][$lRow['location_id']] = [
                'pcs' => floatval($lRow['total_pcs']),
                'qty' => floatval($lRow['total_qty'])
            ];
        }

        $matrixRows = [];
        foreach ($items as $it) {
            $unitDef = resolveItemCategoryAndUnits($it);
            $locStocks = [];
            foreach ($locations as $loc) {
                $lid = $loc['id'];
                $pcs = $locMap[$it['id']][$lid]['pcs'] ?? 0;
                $qty = $locMap[$it['id']][$lid]['qty'] ?? 0;

                $strVal = '';
                if ($unitDef['group'] === 'PVC Pipes') {
                    $wt = $unitDef['weight_per_pc'];
                    if ($pcs == 0 && $qty != 0 && $wt > 0) $pcs = round($qty / $wt, 2);
                    if ($qty == 0 && $pcs != 0 && $wt > 0) $qty = round($pcs * $wt, 2);
                    $strVal = ($pcs != 0 || $qty != 0) ? "$pcs Pcs | " . number_format($qty, 2) . " Kg" : '-';
                } elseif ($unitDef['group'] === 'Fittings') {
                    $strVal = ($pcs != 0 || $qty != 0) ? "$pcs Ctn" : '-';
                } elseif ($unitDef['group'] === 'Raw Material') {
                    $strVal = ($pcs != 0 || $qty != 0) ? "$pcs Bags | " . number_format($qty, 2) . " Kg" : '-';
                } else {
                    $strVal = ($pcs != 0 || $qty != 0) ? "$pcs " . $unitDef['primary_unit'] : '-';
                }

                $locStocks[$lid] = [
                    'pcs' => round($pcs, 2),
                    'qty' => round($qty, 2),
                    'display' => $strVal
                ];
            }

            $matrixRows[] = [
                'item_id' => $it['id'],
                'item_code' => $it['code'],
                'item_name' => $it['name'],
                'group' => $unitDef['group'],
                'unit_display' => $unitDef['unit_display'],
                'locations' => $locStocks
            ];
        }

        echo json_encode([
            'status' => 'success',
            'locations' => $locations,
            'rows' => $matrixRows
        ]);

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 5. STOCK AGING TAB (0-30, 31-60, 61-90, Above 90 Days)
// =========================================================================
if ($action === 'get_aging') {
    try {
        $today = new DateTime();

        // Query active items with closing stock
        $stmtItems = $pdo->prepare("
            SELECT i.id, i.code, i.name, sm.name as main_cat_name, i.category_type, i.carton, i.qty_per_piece, i.unit_weight
            FROM inv_items i
            LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
            LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY sm.name ASC, i.code ASC
        ");
        $stmtItems->execute([$company_id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        if (empty($items)) {
            echo json_encode(['status' => 'success', 'records' => []]);
            exit;
        }

        $id_list = implode(',', array_column($items, 'id'));

        // Fetch recent purchases and opening balances to analyze receipt dates
        $receiptSql = "
            SELECT pii.item_coa_id as item_id, pi.invoice_date as receipt_date, pii.pieces, pii.quantity
            FROM purchase_invoice_items pii
            JOIN purchase_invoices pi ON pii.invoice_id = pi.id
            WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pii.item_coa_id IN ($id_list)
            UNION ALL
            SELECT pp.item_id, p.date as receipt_date, pp.pieces, pp.qty as quantity
            FROM production_note_items pp
            JOIN production_notes p ON pp.pn_id = p.id
            WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty > 0 AND pp.item_id IN ($id_list)
            ORDER BY receipt_date DESC
        ";
        $stmtRec = $pdo->query($receiptSql);
        $receipts = $stmtRec->fetchAll(PDO::FETCH_ASSOC);

        $agingRecords = [];
        foreach ($items as $it) {
            $unitDef = resolveItemCategoryAndUnits($it);
            $itemId = $it['id'];

            // Find receipts for this item
            $b0_30 = 0; $b31_60 = 0; $b61_90 = 0; $b90plus = 0;
            $hasReceipts = false;

            foreach ($receipts as $r) {
                if ($r['item_id'] == $itemId) {
                    $hasReceipts = true;
                    $rDate = new DateTime($r['receipt_date']);
                    $diffDays = $today->diff($rDate)->days;

                    $val = floatval($r['pieces'] ?: $r['quantity']);
                    if ($diffDays <= 30) $b0_30 += $val;
                    elseif ($diffDays <= 60) $b31_60 += $val;
                    elseif ($diffDays <= 90) $b61_90 += $val;
                    else $b90plus += $val;
                }
            }

            $totalReceived = $b0_30 + $b31_60 + $b61_90 + $b90plus;
            if ($totalReceived > 0 || $hasReceipts) {
                $agingRecords[] = [
                    'item_id' => $itemId,
                    'item_code' => $it['code'],
                    'item_name' => $it['name'],
                    'group' => $unitDef['group'],
                    'unit' => $unitDef['primary_unit'],
                    'b0_30' => round($b0_30, 2),
                    'b31_60' => round($b31_60, 2),
                    'b61_90' => round($b61_90, 2),
                    'b90plus' => round($b90plus, 2),
                    'total' => round($totalReceived, 2)
                ];
            }
        }

        echo json_encode([
            'status' => 'success',
            'records' => $agingRecords
        ]);

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['status' => 'error', 'error' => 'Invalid action']);
?>
