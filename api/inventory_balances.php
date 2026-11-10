<?php
require_once 'db_config.php';
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
// Helper: Detect Item Category Group and Multi-Unit Definition
// =========================================================================
function resolveItemCategoryAndUnits($item) {
    $mainName = strtoupper(trim($item['main_category_name'] ?? $item['main_cat_name'] ?? ''));
    $subName  = strtoupper(trim($item['sub_category_name'] ?? ''));
    $catType  = strtoupper(trim($item['category_type'] ?? $item['main_category_type'] ?? ''));
    $itemName = strtoupper(trim($item['item_name'] ?? $item['name'] ?? ''));
    $itemUnit = strtoupper(trim($item['unit'] ?? $item['unit_name'] ?? ''));

    $combined = "$mainName $subName $catType $itemName $itemUnit";

    // 1. PVC PIPES (Pcs / Kg)
    if (strpos($combined, 'PIPE') !== false || strpos($combined, 'PVC') !== false && strpos($combined, 'FITTING') === false) {
        $weightPerPc = floatval($item['qty_per_piece'] ?? $item['unit_weight'] ?? 0);
        return [
            'group' => 'PVC Pipes',
            'unit_display' => 'Pcs / Kg',
            'primary_unit' => 'Pcs',
            'secondary_unit' => 'Kg',
            'weight_per_pc' => $weightPerPc > 0 ? $weightPerPc : 0,
            'pcs_per_ctn' => 0,
            'kg_per_bag' => 0
        ];
    }

    // 2. FITTINGS (Ctn / Pcs)
    if (strpos($combined, 'FITTING') !== false ||
        strpos($itemName, 'ELBOW') !== false ||
        strpos($itemName, 'TEE') !== false ||
        strpos($itemName, 'SOCKET') !== false ||
        strpos($itemName, 'UNION') !== false ||
        strpos($itemName, 'BEND') !== false ||
        strpos($itemName, 'BUSH') !== false ||
        strpos($itemName, 'REDUCER') !== false ||
        strpos($itemName, 'PLUG') !== false ||
        strpos($itemName, 'CAP') !== false ||
        strpos($itemName, 'NIPPLE') !== false) {

        $pcsPerCtn = floatval($item['carton'] ?? 0);
        if ($pcsPerCtn <= 0) $pcsPerCtn = floatval($item['qty_per_piece'] ?? 0);
        if ($pcsPerCtn <= 0) {
            if (strpos($itemName, '2"') !== false) $pcsPerCtn = 100;
            elseif (strpos($itemName, '3"') !== false) $pcsPerCtn = 50;
            elseif (strpos($itemName, '4"') !== false) $pcsPerCtn = 30;
            else $pcsPerCtn = 1;
        }

        return [
            'group' => 'Fittings',
            'unit_display' => 'Ctn / Pcs',
            'primary_unit' => 'Ctn',
            'secondary_unit' => 'Pcs',
            'weight_per_pc' => 0,
            'pcs_per_ctn' => $pcsPerCtn,
            'kg_per_bag' => 0
        ];
    }

    // 3. RAW MATERIAL (Bags / Kg)
    if (strpos($combined, 'RAW') !== false ||
        strpos($combined, 'MATERIAL') !== false ||
        strpos($combined, 'RESIN') !== false ||
        strpos($combined, 'COMPOUND') !== false ||
        strpos($combined, 'STABILIZER') !== false ||
        strpos($combined, 'AU60') !== false ||
        strpos($combined, 'AU67') !== false ||
        strpos($itemUnit, 'BAG') !== false) {

        $kgPerBag = floatval($item['unit_weight'] ?? $item['qty_per_piece'] ?? 0);
        if ($kgPerBag <= 0) $kgPerBag = 25.0; // standard 25 kg bag

        return [
            'group' => 'Raw Material',
            'unit_display' => 'Bags / Kg',
            'primary_unit' => 'Bags',
            'secondary_unit' => 'Kg',
            'weight_per_pc' => 0,
            'pcs_per_ctn' => 0,
            'kg_per_bag' => $kgPerBag
        ];
    }

    // 4. Default / Other Products
    $grp = $mainName ? ucwords(strtolower($mainName)) : 'Other Products';
    return [
        'group' => $grp,
        'unit_display' => $itemUnit ?: 'Pcs',
        'primary_unit' => $itemUnit ?: 'Pcs',
        'secondary_unit' => 'Kg',
        'weight_per_pc' => floatval($item['qty_per_piece'] ?? 0),
        'pcs_per_ctn' => floatval($item['carton'] ?? 1),
        'kg_per_bag' => 0
    ];
}

// =========================================================================
// 2. MAIN INVENTORY BALANCES ENGINE (Multi-Unit Stock Calculation)
// =========================================================================
if ($action === 'get_balances') {
    $cat_id       = trim($_GET['category_id'] ?? $_GET['cat_id'] ?? '');
    if (strtolower($cat_id) === 'all') $cat_id = '';
    $sub_cat_id   = trim($_GET['sub_category_id'] ?? $_GET['sub_cat_id'] ?? '');
    if (strtolower($sub_cat_id) === 'all') $sub_cat_id = '';
    $brand_id     = trim($_GET['brand_id']        ?? '');
    if (strtolower($brand_id) === 'all') $brand_id = '';
    $location_id  = trim($_GET['location_id']     ?? '');
    if (strtolower($location_id) === 'all') $location_id = '';
    $item_filter  = trim($_GET['item_filter']     ?? '');
    $stock_status = trim($_GET['stock_status']    ?? 'all'); // all, positive, zero, negative
    $date_mode    = trim($_GET['date_mode']       ?? 'as_of'); // as_of, period
    $as_of_date   = trim($_GET['as_of_date']      ?? date('Y-m-d'));
    $from_date    = trim($_GET['from_date']       ?? '');
    $to_date      = trim($_GET['to_date']         ?? date('Y-m-d'));

    try {
        // Query target inventory items
        $sqlItems = "
            SELECT i.*, 
                   i.unit as unit_name,
                   sm.id as main_category_id,
                   sm.name as main_category_name,
                   sm.category_type as main_category_type,
                   ss.name as sub_category_name,
                   b.name as brand_name
            FROM inv_items i
            LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
            LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
            LEFT JOIN inv_brands b ON i.brand_id = b.id
            WHERE i.company_id = :cid AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
        ";
        $iParams = [':cid' => $company_id];

        if (!empty($cat_id)) {
            $stmtC = $pdo->prepare("SELECT name, category_type FROM inv_main_categories WHERE id = ?");
            $stmtC->execute([$cat_id]);
            $cRow = $stmtC->fetch(PDO::FETCH_ASSOC);

            if ($cRow) {
                $cName = $cRow['name'];
                $cType = !empty($cRow['category_type']) ? $cRow['category_type'] : $cName;
                $sqlItems .= " AND (sm.id = :cat_id OR sm.name = :c_name OR i.category_type = :c_type OR i.category_type = :c_name2)";
                $iParams[':cat_id'] = $cat_id;
                $iParams[':c_name'] = $cName;
                $iParams[':c_type'] = $cType;
                $iParams[':c_name2'] = $cName;
            } else {
                $sqlItems .= " AND sm.id = :cat_id";
                $iParams[':cat_id'] = $cat_id;
            }
        }
        if (!empty($sub_cat_id)) {
            $sqlItems .= " AND ss.id = :sub_cat_id";
            $iParams[':sub_cat_id'] = $sub_cat_id;
        }
        if (!empty($brand_id)) {
            $sqlItems .= " AND i.brand_id = :brand_id";
            $iParams[':brand_id'] = $brand_id;
        }
        if (!empty($item_filter)) {
            $sqlItems .= " AND (i.code LIKE :it_flt1 OR i.name LIKE :it_flt2 OR i.id = :it_id)";
            $iParams[':it_flt1'] = "%$item_filter%";
            $iParams[':it_flt2'] = "%$item_filter%";
            $iParams[':it_id'] = is_numeric($item_filter) ? intval($item_filter) : 0;
        }

        $sqlItems .= " ORDER BY sm.name ASC, i.code ASC, i.name ASC";

        $stmt = $pdo->prepare($sqlItems);
        $stmt->execute($iParams);
        $rawItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($rawItems)) {
            echo json_encode([
                'status' => 'success',
                'data' => [],
                'records' => [],
                'groups' => [],
                'summary' => [
                    'total_items' => 0,
                    'total_pcs' => 0,
                    'total_ctn' => 0,
                    'total_kg' => 0,
                    'total_bags' => 0,
                    'negative_count' => 0,
                    'low_stock_count' => 0
                ],
                'grand_total' => [
                    'ob_primary' => 0, 'ob_sec' => 0,
                    'in_primary' => 0, 'in_sec' => 0,
                    'out_primary' => 0, 'out_sec' => 0,
                    'adj_primary' => 0, 'adj_sec' => 0,
                    'cb_primary' => 0, 'cb_sec' => 0
                ]
            ]);
            exit;
        }

        $item_ids = array_map(function($it) { return intval($it['id']); }, $rawItems);
        $id_list = implode(',', $item_ids);

        // Fetch Inventory Movement Preferences
        $inv_move_in = 'purchases';
        $inv_move_out = 'sale_invoices';
        try {
            $stmtSet = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE company_id = ? AND setting_key IN ('inv_move_in', 'inv_move_out')");
            $stmtSet->execute([$company_id]);
            $sRows = $stmtSet->fetchAll(PDO::FETCH_KEY_PAIR);
            if (!empty($sRows['inv_move_in'])) $inv_move_in = $sRows['inv_move_in'];
            if (!empty($sRows['inv_move_out'])) $inv_move_out = $sRows['inv_move_out'];
        } catch(Exception $e) {}

        // Date conditions setup
        // Mode 1: As of Date (Historical stock up to as_of_date)
        // Mode 2: Period (From Date to To Date, with OB strictly before from_date)
        $isPeriod = ($date_mode === 'period' && !empty($from_date));
        $periodStart = $isPeriod ? $from_date : null;
        $periodEnd = $isPeriod ? ($to_date ?: date('Y-m-d')) : ($as_of_date ?: date('Y-m-d'));

        $locCondition = function($col) use ($location_id) {
            return $location_id ? " AND $col = " . intval($location_id) : "";
        };

        // Construct Unified Movement Queries
        // Columns returned: item_id, bucket ('OB', 'IN', 'OUT', 'ADJ'), pieces (primary qty), quantity (weight / total qty)
        $queries = [];

        // 1. Starting Opening Balances (Always part of OB)
        $queries[] = "
            SELECT item_id, 'OB' as bucket, pieces, quantity
            FROM inv_opening_balances
            WHERE company_id = $company_id AND item_id IN ($id_list)" . $locCondition('location_id');

        // Helper closures to assign bucket based on date
        // If isPeriod:
        //   date < periodStart => bucket = 'OB'
        //   periodStart <= date <= periodEnd => bucket = IN / OUT / ADJ
        //   date > periodEnd => ignored (bucket = 'IGNORE')
        // If As of Date:
        //   date <= periodEnd => bucket = IN / OUT / ADJ
        //   date > periodEnd => ignored
        $buildDateBucket = function($dateCol, $actionType) use ($isPeriod, $periodStart, $periodEnd) {
            if ($isPeriod) {
                return "
                    CASE 
                        WHEN $dateCol < '$periodStart' THEN 'OB'
                        WHEN $dateCol <= '$periodEnd' THEN '$actionType'
                        ELSE 'IGNORE'
                    END
                ";
            } else {
                return "
                    CASE 
                        WHEN $dateCol <= '$periodEnd' THEN '$actionType'
                        ELSE 'IGNORE'
                    END
                ";
            }
        };

        // 2. Purchases / Inward Gate Passes (IN)
        if ($inv_move_in === 'purchases') {
            $bucketExpr = $buildDateBucket('pi.invoice_date', 'IN');
            $queries[] = "
                SELECT pii.item_coa_id as item_id,
                       $bucketExpr as bucket,
                       pii.pieces as pieces,
                       pii.quantity as quantity
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1
                  AND pii.item_coa_id IN ($id_list)" . $locCondition('pi.inventory_location_id');
        } elseif ($inv_move_in === 'gate_pass') {
            $bucketExpr = $buildDateBucket('igp.date', 'IN');
            $queries[] = "
                SELECT igpi.item_id as item_id,
                       $bucketExpr as bucket,
                       0 as pieces,
                       igpi.qty as quantity
                FROM inward_gate_pass_items igpi
                JOIN inward_gate_passes igp ON igpi.igp_id = igp.id
                WHERE igp.company_id = $company_id AND igp.is_cancelled = 0
                  AND igpi.item_id IN ($id_list)" . $locCondition('igp.inventory_location_id');
        }

        // 3. Sale Returns (IN)
        $bucketExpr = $buildDateBucket('sr.return_date', 'IN');
        $queries[] = "
            SELECT sri.item_coa_id as item_id,
                   $bucketExpr as bucket,
                   sri.pieces as pieces,
                   sri.quantity as quantity
            FROM sale_return_items sri
            JOIN sale_returns sr ON sri.return_id = sr.id
            WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1
              AND sri.item_coa_id IN ($id_list)" . $locCondition('sr.inventory_location_id');

        // 4. Sales Invoices / Delivery Challans / Outward Gate Passes (OUT)
        if ($inv_move_out === 'sale_invoices') {
            $bucketExpr = $buildDateBucket('si.invoice_date', 'OUT');
            $queries[] = "
                SELECT sii.item_coa_id as item_id,
                       $bucketExpr as bucket,
                       sii.pieces as pieces,
                       sii.quantity as quantity
                FROM sale_invoice_items sii
                JOIN sale_invoices si ON sii.invoice_id = si.id
                WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1
                  AND sii.item_coa_id IN ($id_list)" . $locCondition('si.inventory_location_id');
        } elseif ($inv_move_out === 'delivery_challans') {
            $bucketExpr = $buildDateBucket('dc.date', 'OUT');
            $queries[] = "
                SELECT dci.item_id as item_id,
                       $bucketExpr as bucket,
                       0 as pieces,
                       dci.qty as quantity
                FROM delivery_challan_items dci
                JOIN delivery_challans dc ON dci.challan_id = dc.id
                WHERE dc.company_id = $company_id AND dc.is_cancelled = 0
                  AND dci.item_id IN ($id_list)" . $locCondition('dc.inventory_location_id');
        } elseif ($inv_move_out === 'gate_pass') {
            $bucketExpr = $buildDateBucket('ogp.date', 'OUT');
            $queries[] = "
                SELECT ogpi.item_id as item_id,
                       $bucketExpr as bucket,
                       0 as pieces,
                       ogpi.qty as quantity
                FROM outward_gate_pass_items ogpi
                JOIN outward_gate_passes ogp ON ogp.id = ogpi.ogp_id
                WHERE ogp.company_id = $company_id AND ogp.is_cancelled = 0
                  AND ogpi.item_id IN ($id_list)" . $locCondition('ogp.inventory_location_id');
        }

        // 5. Purchase Returns (OUT)
        $bucketExpr = $buildDateBucket('pr.return_date', 'OUT');
        $queries[] = "
            SELECT pri.item_coa_id as item_id,
                   $bucketExpr as bucket,
                   pri.pieces as pieces,
                   pri.quantity as quantity
            FROM purchase_return_items pri
            JOIN purchase_returns pr ON pri.return_id = pr.id
            WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1
              AND pri.item_coa_id IN ($id_list)" . $locCondition('pr.inventory_location_id');

        // 6. Add Inventory Adjustments (ADJ +)
        $bucketExpr = $buildDateBucket('a.date', 'ADJ_ADD');
        $queries[] = "
            SELECT ai.item_id as item_id,
                   $bucketExpr as bucket,
                   ai.pieces as pieces,
                   ai.qty as quantity
            FROM add_inventory_adjustment_items ai
            JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id
            WHERE a.company_id = $company_id AND a.is_cancelled = 0
              AND ai.item_id IN ($id_list)" . $locCondition('a.inventory_location_id');

        // 7. Reduce Inventory Adjustments (ADJ -)
        $bucketExpr = $buildDateBucket('r.date', 'ADJ_RED');
        $queries[] = "
            SELECT ri.item_id as item_id,
                   $bucketExpr as bucket,
                   ri.pieces as pieces,
                   ri.qty as quantity
            FROM reduce_inventory_adjustment_items ri
            JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id
            WHERE r.company_id = $company_id AND r.is_cancelled = 0
              AND ri.item_id IN ($id_list)" . $locCondition('r.inventory_location_id');

        // 8. Production Finished Goods Output (IN when qty > 0)
        $bucketExpr = $buildDateBucket('p.date', 'IN');
        $queries[] = "
            SELECT pp.item_id as item_id,
                   $bucketExpr as bucket,
                   pp.pieces as pieces,
                   pp.qty as quantity
            FROM production_note_items pp
            JOIN production_notes p ON pp.pn_id = p.id
            WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty > 0
              AND pp.item_id IN ($id_list)" . $locCondition('p.inventory_location_id');

        // 9. Production Raw Material Output / Material Issue Notes (OUT)
        $bucketExpr = $buildDateBucket('p.date', 'OUT');
        $queries[] = "
            SELECT pp.item_id as item_id,
                   $bucketExpr as bucket,
                   ABS(pp.pieces) as pieces,
                   ABS(pp.qty) as quantity
            FROM production_note_items pp
            JOIN production_notes p ON pp.pn_id = p.id
            WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty < 0
              AND pp.item_id IN ($id_list)" . $locCondition('p.inventory_location_id');

        $bucketExpr = $buildDateBucket('m.date', 'OUT');
        $queries[] = "
            SELECT mii.item_id as item_id,
                   $bucketExpr as bucket,
                   mii.pieces as pieces,
                   mii.qty as quantity
            FROM material_issue_note_items mii
            JOIN material_issue_notes m ON mii.min_id = m.id
            WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1
              AND mii.item_id IN ($id_list)" . $locCondition('m.inventory_location_id');

        // 10. Inventory Transfers (Location-specific: from_location reduces, to_location increases)
        if ($location_id) {
            $locId = intval($location_id);
            $bucketExprOut = $buildDateBucket('t.date', 'OUT');
            $queries[] = "
                SELECT ti.item_id as item_id,
                       $bucketExprOut as bucket,
                       ti.pieces as pieces,
                       ti.qty as quantity
                FROM inventory_transfer_items ti
                JOIN inventory_transfers t ON ti.transfer_id = t.id
                WHERE t.company_id = $company_id AND t.is_cancelled = 0
                  AND ti.item_id IN ($id_list) AND t.transfer_from_location_id = $locId";

            $bucketExprIn = $buildDateBucket('t.date', 'IN');
            $queries[] = "
                SELECT ti.item_id as item_id,
                       $bucketExprIn as bucket,
                       ti.pieces as pieces,
                       ti.qty as quantity
                FROM inventory_transfer_items ti
                JOIN inventory_transfers t ON ti.transfer_id = t.id
                WHERE t.company_id = $company_id AND t.is_cancelled = 0
                  AND ti.item_id IN ($id_list) AND t.transfer_to_location_id = $locId";
        }

        // Execute Aggregation
        $unionSql = implode(" UNION ALL ", $queries);
        $aggSql = "
            SELECT 
                item_id,
                SUM(CASE WHEN bucket = 'OB' THEN pieces ELSE 0 END) as ob_pcs,
                SUM(CASE WHEN bucket = 'OB' THEN quantity ELSE 0 END) as ob_qty,
                
                SUM(CASE WHEN bucket = 'IN' THEN pieces ELSE 0 END) as in_pcs,
                SUM(CASE WHEN bucket = 'IN' THEN quantity ELSE 0 END) as in_qty,
                
                SUM(CASE WHEN bucket = 'OUT' THEN pieces ELSE 0 END) as out_pcs,
                SUM(CASE WHEN bucket = 'OUT' THEN quantity ELSE 0 END) as out_qty,
                
                SUM(CASE 
                    WHEN bucket = 'ADJ_ADD' THEN pieces 
                    WHEN bucket = 'ADJ_RED' THEN -pieces 
                    ELSE 0 
                END) as adj_pcs,
                SUM(CASE 
                    WHEN bucket = 'ADJ_ADD' THEN quantity 
                    WHEN bucket = 'ADJ_RED' THEN -quantity 
                    ELSE 0 
                END) as adj_qty
            FROM ($unionSql) as combined_movements
            WHERE bucket != 'IGNORE'
            GROUP BY item_id
        ";

        $aggStmt = $pdo->query($aggSql);
        $aggData = [];
        while ($row = $aggStmt->fetch(PDO::FETCH_ASSOC)) {
            $aggData[$row['item_id']] = [
                'ob_pcs'  => floatval($row['ob_pcs']),
                'ob_qty'  => floatval($row['ob_qty']),
                'in_pcs'  => floatval($row['in_pcs']),
                'in_qty'  => floatval($row['in_qty']),
                'out_pcs' => floatval($row['out_pcs']),
                'out_qty' => floatval($row['out_qty']),
                'adj_pcs' => floatval($row['adj_pcs']),
                'adj_qty' => floatval($row['adj_qty'])
            ];
        }

        // Process Every Item with Multi-Unit Logic
        $records = [];
        $categoryGroups = [];

        $totalItemsCount = 0;
        $totalStockPcs = 0;
        $totalStockCtn = 0;
        $totalStockBags = 0;
        $totalStockKg = 0;
        $negativeCount = 0;
        $lowStockCount = 0;

        $grandTotal = [
            'ob_primary' => 0, 'ob_sec' => 0,
            'in_primary' => 0, 'in_sec' => 0,
            'out_primary' => 0, 'out_sec' => 0,
            'adj_primary' => 0, 'adj_sec' => 0,
            'cb_primary' => 0, 'cb_sec' => 0
        ];

        foreach ($rawItems as $item) {
            $itemId = intval($item['id']);
            $unitDef = resolveItemCategoryAndUnits($item);
            $groupName = $unitDef['group'];

            $rawMov = $aggData[$itemId] ?? [
                'ob_pcs' => 0, 'ob_qty' => 0,
                'in_pcs' => 0, 'in_qty' => 0,
                'out_pcs' => 0, 'out_qty' => 0,
                'adj_pcs' => 0, 'adj_qty' => 0
            ];

            // Primary and Secondary values depending on group:
            $obPrimary = 0; $obSec = 0;
            $inPrimary = 0; $inSec = 0;
            $outPrimary = 0; $outSec = 0;
            $adjPrimary = 0; $adjSec = 0;

            if ($groupName === 'PVC Pipes') {
                // Primary: Pcs, Secondary: Kg
                $wtPerPc = $unitDef['weight_per_pc'];

                $obPrimary = $rawMov['ob_pcs'];
                $obSec = $rawMov['ob_qty'];
                // If only qty was recorded, extrapolate pieces
                if ($obPrimary == 0 && $obSec != 0 && $wtPerPc > 0) $obPrimary = round($obSec / $wtPerPc, 2);
                if ($obSec == 0 && $obPrimary != 0 && $wtPerPc > 0) $obSec = round($obPrimary * $wtPerPc, 2);

                $inPrimary = $rawMov['in_pcs'];
                $inSec = $rawMov['in_qty'];
                if ($inPrimary == 0 && $inSec != 0 && $wtPerPc > 0) $inPrimary = round($inSec / $wtPerPc, 2);
                if ($inSec == 0 && $inPrimary != 0 && $wtPerPc > 0) $inSec = round($inPrimary * $wtPerPc, 2);

                $outPrimary = $rawMov['out_pcs'];
                $outSec = $rawMov['out_qty'];
                if ($outPrimary == 0 && $outSec != 0 && $wtPerPc > 0) $outPrimary = round($outSec / $wtPerPc, 2);
                if ($outSec == 0 && $outPrimary != 0 && $wtPerPc > 0) $outSec = round($outPrimary * $wtPerPc, 2);

                $adjPrimary = $rawMov['adj_pcs'];
                $adjSec = $rawMov['adj_qty'];
                if ($adjPrimary == 0 && $adjSec != 0 && $wtPerPc > 0) $adjPrimary = round($adjSec / $wtPerPc, 2);
                if ($adjSec == 0 && $adjPrimary != 0 && $wtPerPc > 0) $adjSec = round($adjPrimary * $wtPerPc, 2);

            } elseif ($groupName === 'Fittings') {
                // Primary: Ctn (Cartons), Secondary: Pcs (Pieces)
                $pcsPerCtn = $unitDef['pcs_per_ctn'];

                // In fittings, quantity is typically pieces and pieces might be cartons, or vice versa
                $computeCtnPcs = function($pcsField, $qtyField) use ($pcsPerCtn) {
                    if ($pcsField != 0 && $qtyField != 0 && $pcsPerCtn > 1) {
                        if ($qtyField > $pcsField) return [$pcsField, $qtyField]; // pcsField is Cartons, qtyField is Pieces
                        return [round($pcsField / $pcsPerCtn, 2), $pcsField];
                    }
                    if ($pcsField != 0 && $pcsPerCtn > 1) {
                        return [round($pcsField / $pcsPerCtn, 2), $pcsField];
                    }
                    if ($qtyField != 0 && $pcsPerCtn > 1) {
                        return [round($qtyField / $pcsPerCtn, 2), $qtyField];
                    }
                    return [$pcsField ?: $qtyField, $pcsField ?: $qtyField];
                };

                list($obPrimary, $obSec)   = $computeCtnPcs($rawMov['ob_pcs'], $rawMov['ob_qty']);
                list($inPrimary, $inSec)   = $computeCtnPcs($rawMov['in_pcs'], $rawMov['in_qty']);
                list($outPrimary, $outSec) = $computeCtnPcs($rawMov['out_pcs'], $rawMov['out_qty']);
                list($adjPrimary, $adjSec) = $computeCtnPcs($rawMov['adj_pcs'], $rawMov['adj_qty']);

            } elseif ($groupName === 'Raw Material') {
                // Primary: Bags, Secondary: Kg
                $kgPerBag = $unitDef['kg_per_bag'];

                $computeBagsKg = function($pcsField, $qtyField) use ($kgPerBag) {
                    if ($pcsField != 0 && $qtyField != 0) return [$pcsField, $qtyField];
                    if ($qtyField != 0 && $kgPerBag > 0) return [round($qtyField / $kgPerBag, 2), $qtyField];
                    if ($pcsField != 0 && $kgPerBag > 0) return [$pcsField, round($pcsField * $kgPerBag, 2)];
                    return [0, 0];
                };

                list($obPrimary, $obSec)   = $computeBagsKg($rawMov['ob_pcs'], $rawMov['ob_qty']);
                list($inPrimary, $inSec)   = $computeBagsKg($rawMov['in_pcs'], $rawMov['in_qty']);
                list($outPrimary, $outSec) = $computeBagsKg($rawMov['out_pcs'], $rawMov['out_qty']);
                list($adjPrimary, $adjSec) = $computeBagsKg($rawMov['adj_pcs'], $rawMov['adj_qty']);

            } else {
                // Default Products
                $obPrimary = $rawMov['ob_pcs'] ?: $rawMov['ob_qty'];
                $obSec = $rawMov['ob_qty'];

                $inPrimary = $rawMov['in_pcs'] ?: $rawMov['in_qty'];
                $inSec = $rawMov['in_qty'];

                $outPrimary = $rawMov['out_pcs'] ?: $rawMov['out_qty'];
                $outSec = $rawMov['out_qty'];

                $adjPrimary = $rawMov['adj_pcs'] ?: $rawMov['adj_qty'];
                $adjSec = $rawMov['adj_qty'];
            }

            // Calculation formula: Closing = Opening + In - Out + Adjustment
            $cbPrimary = $obPrimary + $inPrimary - $outPrimary + $adjPrimary;
            $cbSec     = $obSec + $inSec - $outSec + $adjSec;

            // Apply stock_status filter
            $hasAnyMovement = ($obPrimary != 0 || $obSec != 0 || $inPrimary != 0 || $inSec != 0 || $outPrimary != 0 || $outSec != 0 || $adjPrimary != 0 || $adjSec != 0);
            $isZero = ($cbPrimary == 0 && $cbSec == 0);
            $isNegative = ($cbPrimary < 0 || $cbSec < 0);
            $isPositive = ($cbPrimary > 0 || $cbSec > 0);

            if ($stock_status === 'positive' && !$isPositive) continue;
            if ($stock_status === 'zero' && !$isZero) continue;
            if ($stock_status === 'negative' && !$isNegative) continue;

            $minStock = floatval($item['order_qty'] ?? 0);
            $isLowStock = ($minStock > 0 && $cbPrimary < $minStock);

            $itemRow = [
                'item_id' => $itemId,
                'id' => $itemId,
                'item_code' => $item['code'],
                'code' => $item['code'],
                'item_name' => $item['name'],
                'name' => $item['name'],
                'group' => $groupName,
                'main_category_name' => $item['main_category_name'] ?: $groupName,
                'main_category_type' => $item['main_category_type'] ?: ($unitDef['group'] === 'Fittings' ? 'Fitting' : ($unitDef['group'] === 'PVC Pipes' ? 'Pipes' : 'None')),
                'main_category_id' => $item['main_category_id'] ?? 0,
                'category_id' => $item['main_category_id'] ?? 0,
                'unit' => $item['unit'] ?? $unitDef['primary_unit'],
                'unit_display' => $unitDef['unit_display'],
                'primary_unit' => $unitDef['primary_unit'],
                'secondary_unit' => $unitDef['secondary_unit'],
                'qty_per_piece' => floatval($item['qty_per_piece'] ?? 0),
                'min_stock' => $minStock,
                'is_low_stock' => $isLowStock,
                'is_negative' => $isNegative,

                // Standard and legacy compatibility fields (used by Auto Adjustments):
                'cb' => round($cbSec != 0 ? $cbSec : $cbPrimary, 2),
                'cb_pcs' => round($cbPrimary, 2),
                'ob' => round($obSec != 0 ? $obSec : $obPrimary, 2),
                'in' => round($inSec != 0 ? $inSec : $inPrimary, 2),
                'out' => round($outSec != 0 ? $outSec : $outPrimary, 2),

                // Multi-unit fields (used by Inventory Balance):
                'ob_primary' => round($obPrimary, 2),
                'ob_sec'     => round($obSec, 2),
                'in_primary' => round($inPrimary, 2),
                'in_sec'     => round($inSec, 2),
                'out_primary'=> round($outPrimary, 2),
                'out_sec'    => round($outSec, 2),
                'adj_primary'=> round($adjPrimary, 2),
                'adj_sec'    => round($adjSec, 2),
                'cb_primary' => round($cbPrimary, 2),
                'cb_sec'     => round($cbSec, 2)
            ];

            $records[] = $itemRow;
            $totalItemsCount++;

            // Track summary cards
            if ($groupName === 'PVC Pipes') {
                $totalStockPcs += $cbPrimary;
                $totalStockKg += $cbSec;
            } elseif ($groupName === 'Fittings') {
                $totalStockCtn += $cbPrimary;
            } elseif ($groupName === 'Raw Material') {
                $totalStockBags += $cbPrimary;
                $totalStockKg += $cbSec;
            } else {
                $totalStockPcs += $cbPrimary;
                $totalStockKg += $cbSec;
            }

            if ($isNegative) $negativeCount++;
            if ($isLowStock) $lowStockCount++;

            // Accumulate in Category Group
            if (!isset($categoryGroups[$groupName])) {
                $categoryGroups[$groupName] = [
                    'group_name' => $groupName,
                    'items' => [],
                    'subtotal' => [
                        'ob_primary' => 0, 'ob_sec' => 0,
                        'in_primary' => 0, 'in_sec' => 0,
                        'out_primary' => 0, 'out_sec' => 0,
                        'adj_primary' => 0, 'adj_sec' => 0,
                        'cb_primary' => 0, 'cb_sec' => 0
                    ]
                ];
            }

            $categoryGroups[$groupName]['items'][] = $itemRow;
            $categoryGroups[$groupName]['subtotal']['ob_primary'] += $itemRow['ob_primary'];
            $categoryGroups[$groupName]['subtotal']['ob_sec']     += $itemRow['ob_sec'];
            $categoryGroups[$groupName]['subtotal']['in_primary'] += $itemRow['in_primary'];
            $categoryGroups[$groupName]['subtotal']['in_sec']     += $itemRow['in_sec'];
            $categoryGroups[$groupName]['subtotal']['out_primary']+= $itemRow['out_primary'];
            $categoryGroups[$groupName]['subtotal']['out_sec']    += $itemRow['out_sec'];
            $categoryGroups[$groupName]['subtotal']['adj_primary']+= $itemRow['adj_primary'];
            $categoryGroups[$groupName]['subtotal']['adj_sec']    += $itemRow['adj_sec'];
            $categoryGroups[$groupName]['subtotal']['cb_primary'] += $itemRow['cb_primary'];
            $categoryGroups[$groupName]['subtotal']['cb_sec']     += $itemRow['cb_sec'];

            // Grand Total Accumulation
            $grandTotal['ob_primary'] += $itemRow['ob_primary'];
            $grandTotal['ob_sec']     += $itemRow['ob_sec'];
            $grandTotal['in_primary'] += $itemRow['in_primary'];
            $grandTotal['in_sec']     += $itemRow['in_sec'];
            $grandTotal['out_primary']+= $itemRow['out_primary'];
            $grandTotal['out_sec']    += $itemRow['out_sec'];
            $grandTotal['adj_primary']+= $itemRow['adj_primary'];
            $grandTotal['adj_sec']    += $itemRow['adj_sec'];
            $grandTotal['cb_primary'] += $itemRow['cb_primary'];
            $grandTotal['cb_sec']     += $itemRow['cb_sec'];
        }

        // Format summary totals
        $summary = [
            'total_items' => $totalItemsCount,
            'total_pcs' => round($totalStockPcs, 2),
            'total_ctn' => round($totalStockCtn, 2),
            'total_bags' => round($totalStockBags, 2),
            'total_kg' => round($totalStockKg, 2),
            'negative_count' => $negativeCount,
            'low_stock_count' => $lowStockCount
        ];

        // Format grand totals to 2 decimal places
        foreach ($grandTotal as $k => $v) {
            $grandTotal[$k] = round($v, 2);
        }

        // Order categories standard: PVC Pipes, Fittings, Raw Material, Others
        $orderedGroups = [];
        $priorityKeys = ['PVC Pipes', 'Fittings', 'Raw Material'];
        foreach ($priorityKeys as $pk) {
            if (isset($categoryGroups[$pk])) {
                $orderedGroups[] = $categoryGroups[$pk];
                unset($categoryGroups[$pk]);
            }
        }
        foreach ($categoryGroups as $remGrp) {
            $orderedGroups[] = $remGrp;
        }

        echo json_encode([
            'status' => 'success',
            'data' => $records,
            'records' => $records,
            'groups' => $orderedGroups,
            'summary' => $summary,
            'grand_total' => $grandTotal
        ]);

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
