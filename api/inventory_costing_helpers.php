<?php
/**
 * Shared Inventory Stock & Production Costing Helpers
 * Side-effect free: can be safely included by inventory_balances.php,
 * production_costing.php, and balance_sheet.php without routing/header collisions.
 */

if (!function_exists('resolveItemCategoryAndUnits')) {
    /**
     * Resolves an item's functional group ('Raw Material', 'Fittings', 'PVC Pipes', etc.)
     * and packing/weight conversion metadata.
     */
    function resolveItemCategoryAndUnits($item) {
        $mainName = strtoupper(trim((string)($item['main_category_name'] ?? $item['main_cat_name'] ?? '')));
        $subName  = strtoupper(trim((string)($item['sub_category_name'] ?? '')));
        $catType  = strtoupper(trim((string)($item['category_type'] ?? $item['main_category_type'] ?? '')));
        $itemName = strtoupper(trim((string)($item['item_name'] ?? $item['name'] ?? '')));
        $itemUnit = strtoupper(trim((string)($item['unit'] ?? $item['unit_name'] ?? '')));

        $combined = "$mainName $subName $catType $itemName $itemUnit";

        // 1. RAW MATERIAL (Bags / Kg) - Check FIRST so items like "PVC FITTING RESIN" / "FITTING STABLIZER" never fall into Fittings
        if ($catType === 'RAW MATERIAL' ||
            preg_match('/\bRAW\b/', $combined) ||
            strpos($itemUnit, 'BAG') !== false ||
            strpos($combined, 'MATERIAL') !== false ||
            strpos($combined, 'RESIN') !== false ||
            strpos($combined, 'COMPOUND') !== false ||
            strpos($combined, 'STABILIZER') !== false ||
            strpos($combined, 'STABLIZER') !== false ||
            strpos($combined, 'TITANIUM') !== false ||
            strpos($combined, 'KRONOS') !== false ||
            strpos($combined, 'PROCESSING ADS') !== false ||
            strpos($combined, 'PROCESSING AID') !== false ||
            strpos($combined, 'LUBRICANT') !== false ||
            strpos($combined, 'CALCIUM') !== false ||
            strpos($combined, 'WAX') !== false ||
            strpos($combined, 'PIGMENT') !== false ||
            strpos($combined, 'CHEMICAL') !== false ||
            strpos($combined, 'AU60') !== false ||
            strpos($combined, 'AU-60') !== false ||
            strpos($combined, 'AU67') !== false ||
            strpos($combined, 'AU-67') !== false) {

            $rawKgPerBag = $item['unit_weight'] ?? $item['qty_per_piece'] ?? 0;
            $kgPerBag = is_numeric(trim((string)$rawKgPerBag)) ? floatval($rawKgPerBag) : 0.0;
            if ($kgPerBag <= 0) $kgPerBag = 25.0; // standard 25 kg bag

            return [
                'group' => 'Raw Material',
                'unit_display' => 'Bags / Kg',
                'primary_unit' => 'Bags',
                'secondary_unit' => 'Kg',
                'weight_per_pc' => 0,
                'pcs_per_ctn' => 0,
                'kg_per_ctn' => 0,
                'kg_per_bag' => $kgPerBag
            ];
        }

        // 2. FITTINGS (Ctn / Pcs) - Priority 2
        if ($catType === 'FITTING' ||
            strpos($mainName, 'FITTING') !== false ||
            strpos($catType, 'FITTING') !== false ||
            strpos($itemName, 'ELBOW') !== false ||
            strpos($itemName, 'TEE') !== false ||
            strpos($itemName, 'SOCKET') !== false ||
            strpos($itemName, 'UNION') !== false ||
            strpos($itemName, 'BEND') !== false ||
            strpos($itemName, 'BUSH') !== false ||
            strpos($itemName, 'REDUCER') !== false ||
            strpos($itemName, 'PLUG') !== false ||
            strpos($itemName, 'CAP') !== false ||
            strpos($itemName, 'NIPPLE') !== false ||
            strpos($combined, 'FITTING') !== false) {

            $pcsPerCtn = floatval($item['qty_per_piece'] ?? 0);
            if ($pcsPerCtn <= 0 && isset($item['carton']) && is_numeric(trim((string)$item['carton']))) {
                $pcsPerCtn = floatval($item['carton']);
            }
            if ($pcsPerCtn <= 0) {
                if (strpos($itemName, '2"') !== false) $pcsPerCtn = 100;
                elseif (strpos($itemName, '3"') !== false) $pcsPerCtn = 50;
                elseif (strpos($itemName, '4"') !== false) $pcsPerCtn = 30;
                else $pcsPerCtn = 1;
            }

            $rawWtPerPc = $item['unit_weight'] ?? 0;
            $weightPerPc = is_numeric(trim((string)$rawWtPerPc)) ? floatval($rawWtPerPc) : 0.0;
            if ($weightPerPc < 0) $weightPerPc = 0.0;
            $kgPerCtn = ($pcsPerCtn > 0 && $weightPerPc > 0) ? round($pcsPerCtn * $weightPerPc, 3) : 0.0;

            return [
                'group' => 'Fittings',
                'unit_display' => 'Ctn / Pcs',
                'primary_unit' => 'Ctn',
                'secondary_unit' => 'Pcs',
                'weight_per_pc' => $weightPerPc,
                'pcs_per_ctn' => $pcsPerCtn,
                'kg_per_ctn' => $kgPerCtn,
                'kg_per_bag' => 0
            ];
        }

        // 3. PVC PIPES (Pcs / Kg) - Priority 3
        if ($catType === 'PIPES' ||
            strpos($mainName, 'PIPE') !== false ||
            strpos($combined, 'PIPE') !== false ||
            (strpos($combined, 'PVC') !== false && strpos($combined, 'FITTING') === false)) {

            $weightPerPc = floatval($item['qty_per_piece'] ?? $item['unit_weight'] ?? 0);
            return [
                'group' => 'PVC Pipes',
                'unit_display' => 'Pcs / Kg',
                'primary_unit' => 'Pcs',
                'secondary_unit' => 'Kg',
                'weight_per_pc' => $weightPerPc > 0 ? $weightPerPc : 0,
                'pcs_per_ctn' => 0,
                'kg_per_ctn' => 0,
                'kg_per_bag' => 0
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
            'kg_per_ctn' => 0,
            'kg_per_bag' => 0
        ];
    }
}

if (!function_exists('computeInventoryClosingStock')) {
    /**
     * Single source of truth for Godown Closing Stock (Pipes, Fittings, Raw Materials)
     * across Inventory Balances, Production Costing, and Balance Sheet.
     */
    function computeInventoryClosingStock($pdo, $company_id, $filters = []) {
        $company_id = intval($company_id);

        $cat_id       = trim((string)($filters['category_id'] ?? $filters['cat_id'] ?? ''));
        if (strtolower($cat_id) === 'all') $cat_id = '';
        $sub_cat_id   = trim((string)($filters['sub_category_id'] ?? $filters['sub_cat_id'] ?? ''));
        if (strtolower($sub_cat_id) === 'all') $sub_cat_id = '';
        $brand_id     = trim((string)($filters['brand_id'] ?? ''));
        if (strtolower($brand_id) === 'all') $brand_id = '';
        $location_id  = trim((string)($filters['location_id'] ?? ''));
        if (strtolower($location_id) === 'all') $location_id = '';
        $item_filter  = trim((string)($filters['item_filter'] ?? ''));
        $stock_status = trim((string)($filters['stock_status'] ?? 'all'));
        $date_mode    = trim((string)($filters['date_mode'] ?? 'as_of'));
        $as_of_date   = trim((string)($filters['as_of_date'] ?? $filters['to_date'] ?? date('Y-m-d')));
        $from_date    = trim((string)($filters['from_date'] ?? ''));
        $to_date      = trim((string)($filters['to_date'] ?? date('Y-m-d')));

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
            return [
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
                    'ob_primary' => 0, 'ob_sec' => 0, 'ob_kg' => 0,
                    'in_primary' => 0, 'in_sec' => 0, 'in_kg' => 0,
                    'out_primary' => 0, 'out_sec' => 0, 'out_kg' => 0,
                    'adj_primary' => 0, 'adj_sec' => 0, 'adj_kg' => 0,
                    'cb_primary' => 0, 'cb_sec' => 0, 'cb_kg' => 0
                ]
            ];
        }

        $existingTabs = [];
        try {
            $stmtTab = $pdo->query("SHOW TABLES");
            while ($t = $stmtTab->fetch(PDO::FETCH_NUM)) {
                $existingTabs[] = $t[0];
            }
        } catch (Exception $eTab) {}

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

        $isPeriod = ($date_mode === 'period' && !empty($from_date));
        $periodStart = $isPeriod ? $from_date : null;
        $periodEnd = $isPeriod ? ($to_date ?: date('Y-m-d')) : ($as_of_date ?: ($to_date ?: date('Y-m-d')));

        // Quote dates safely for SQL
        $periodEndEsc = $pdo->quote($periodEnd);
        $periodStartEsc = $periodStart ? $pdo->quote($periodStart) : "''";

        $locCondition = function($col) use ($location_id) {
            return $location_id ? " AND $col = " . intval($location_id) : "";
        };

        $buildDateBucket = function($dateCol, $actionType) use ($isPeriod, $periodStartEsc, $periodEndEsc) {
            if ($isPeriod) {
                return "
                    CASE 
                        WHEN $dateCol < $periodStartEsc THEN 'OB'
                        WHEN $dateCol <= $periodEndEsc THEN '$actionType'
                        ELSE 'IGNORE'
                    END
                ";
            }
            return "
                CASE 
                    WHEN $dateCol <= $periodEndEsc THEN '$actionType'
                    ELSE 'IGNORE'
                END
            ";
        };

        $queries = [];

        // 1. Opening Balances
        if (empty($existingTabs) || in_array('inv_opening_balances', $existingTabs)) {
            $queries[] = "
                SELECT item_id, 'OB' as bucket, pieces, quantity
                FROM inv_opening_balances
                WHERE company_id = $company_id AND item_id IN ($id_list)" . $locCondition('location_id');
        }

        // 2. Purchases / Inward Gate Passes (IN)
        if ($inv_move_in === 'purchases' && (empty($existingTabs) || (in_array('purchase_invoices', $existingTabs) && in_array('purchase_invoice_items', $existingTabs)))) {
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
        } elseif ($inv_move_in === 'gate_pass' && (empty($existingTabs) || (in_array('inward_gate_passes', $existingTabs) && in_array('inward_gate_pass_items', $existingTabs)))) {
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
        if (empty($existingTabs) || (in_array('sale_returns', $existingTabs) && in_array('sale_return_items', $existingTabs))) {
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
        }

        // 4. Sales Invoices / Delivery Challans / Outward Gate Passes (OUT)
        if ($inv_move_out === 'sale_invoices' && (empty($existingTabs) || (in_array('sale_invoices', $existingTabs) && in_array('sale_invoice_items', $existingTabs)))) {
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
        } elseif ($inv_move_out === 'delivery_challans' && (empty($existingTabs) || (in_array('delivery_challans', $existingTabs) && in_array('delivery_challan_items', $existingTabs)))) {
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
        } elseif ($inv_move_out === 'gate_pass' && (empty($existingTabs) || (in_array('outward_gate_passes', $existingTabs) && in_array('outward_gate_pass_items', $existingTabs)))) {
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
        if (empty($existingTabs) || (in_array('purchase_returns', $existingTabs) && in_array('purchase_return_items', $existingTabs))) {
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
        }

        // 6. Add Inventory Adjustments (ADJ +)
        if (empty($existingTabs) || (in_array('add_inventory_adjustments', $existingTabs) && in_array('add_inventory_adjustment_items', $existingTabs))) {
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
        }

        // 7. Reduce Inventory Adjustments (ADJ -)
        if (empty($existingTabs) || (in_array('reduce_inventory_adjustments', $existingTabs) && in_array('reduce_inventory_adjustment_items', $existingTabs))) {
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
        }

        // 8 & 9. Production Notes & Material Issue Notes
        if (empty($existingTabs) || (in_array('production_notes', $existingTabs) && in_array('production_note_items', $existingTabs))) {
            $bucketExprIn = $buildDateBucket('p.date', 'IN');
            $queries[] = "
                SELECT pp.item_id as item_id,
                       $bucketExprIn as bucket,
                       pp.pieces as pieces,
                       pp.qty as quantity
                FROM production_note_items pp
                JOIN production_notes p ON pp.pn_id = p.id
                WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty > 0
                  AND pp.item_id IN ($id_list)" . $locCondition('p.inventory_location_id');

            $bucketExprOut = $buildDateBucket('p.date', 'OUT');
            $queries[] = "
                SELECT pp.item_id as item_id,
                       $bucketExprOut as bucket,
                       ABS(pp.pieces) as pieces,
                       ABS(pp.qty) as quantity
                FROM production_note_items pp
                JOIN production_notes p ON pp.pn_id = p.id
                WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty < 0
                  AND pp.item_id IN ($id_list)" . $locCondition('p.inventory_location_id');
        }

        if (empty($existingTabs) || (in_array('material_issue_notes', $existingTabs) && in_array('material_issue_note_items', $existingTabs))) {
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
        }

        // 10. Inventory Transfers (Location-specific)
        if ($location_id && (empty($existingTabs) || (in_array('inventory_transfers', $existingTabs) && in_array('inventory_transfer_items', $existingTabs)))) {
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

        $aggData = [];
        if (!empty($queries)) {
            $unionSql = implode(" UNION ALL ", $queries);
            $aggSql = "
                SELECT
                    item_id,
                    SUM(CASE WHEN bucket = 'OB' THEN COALESCE(pieces, 0) ELSE 0 END) as ob_pcs,
                    SUM(CASE WHEN bucket = 'OB' THEN COALESCE(quantity, 0) ELSE 0 END) as ob_qty,
                    SUM(CASE WHEN bucket = 'IN' THEN COALESCE(pieces, 0) ELSE 0 END) as in_pcs,
                    SUM(CASE WHEN bucket = 'IN' THEN COALESCE(quantity, 0) ELSE 0 END) as in_qty,
                    SUM(CASE WHEN bucket = 'OUT' THEN COALESCE(pieces, 0) ELSE 0 END) as out_pcs,
                    SUM(CASE WHEN bucket = 'OUT' THEN COALESCE(quantity, 0) ELSE 0 END) as out_qty,
                    SUM(CASE
                        WHEN bucket = 'ADJ_ADD' THEN COALESCE(pieces, 0)
                        WHEN bucket = 'ADJ_RED' THEN -COALESCE(pieces, 0)
                        ELSE 0
                    END) as adj_pcs,
                    SUM(CASE
                        WHEN bucket = 'ADJ_ADD' THEN COALESCE(quantity, 0)
                        WHEN bucket = 'ADJ_RED' THEN -COALESCE(quantity, 0)
                        ELSE 0
                    END) as adj_qty
                FROM ($unionSql) as combined_movements
                WHERE bucket != 'IGNORE'
                GROUP BY item_id
            ";

            $aggStmt = $pdo->query($aggSql);
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
        }

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
            'ob_primary' => 0, 'ob_sec' => 0, 'ob_kg' => 0,
            'in_primary' => 0, 'in_sec' => 0, 'in_kg' => 0,
            'out_primary' => 0, 'out_sec' => 0, 'out_kg' => 0,
            'adj_primary' => 0, 'adj_sec' => 0, 'adj_kg' => 0,
            'cb_primary' => 0, 'cb_sec' => 0, 'cb_kg' => 0
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

            $obPrimary = 0; $obSec = 0;
            $inPrimary = 0; $inSec = 0;
            $outPrimary = 0; $outSec = 0;
            $adjPrimary = 0; $adjSec = 0;

            if ($groupName === 'PVC Pipes') {
                // Primary: Pcs, Secondary: Kg
                $wtPerPc = $unitDef['weight_per_pc'];

                $obPrimary = $rawMov['ob_pcs'];
                $obSec = $rawMov['ob_qty'];
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
                $pcsPerCtn = max(1, floatval($unitDef['pcs_per_ctn'] ?? 1));

                $computeFittingBucket = function($pcsField, $qtyField) use ($pcsPerCtn) {
                    $pcsField = floatval($pcsField);
                    $qtyField = floatval($qtyField);

                    if ($pcsField != 0 && $qtyField != 0) {
                        if (abs($qtyField) > abs($pcsField)) {
                            return [round($pcsField, 2), round($qtyField, 2)];
                        } elseif (abs($pcsField) > abs($qtyField)) {
                            return [round($qtyField, 2), round($pcsField, 2)];
                        } else {
                            return [round($pcsField / $pcsPerCtn, 2), round($pcsField, 2)];
                        }
                    }

                    if ($qtyField != 0) {
                        return [round($qtyField / $pcsPerCtn, 2), round($qtyField, 2)];
                    }

                    if ($pcsField != 0) {
                        return [round($pcsField, 2), round($pcsField * $pcsPerCtn, 2)];
                    }

                    return [0.0, 0.0];
                };

                list($obPrimary, $obSec)   = $computeFittingBucket($rawMov['ob_pcs'], $rawMov['ob_qty']);
                list($inPrimary, $inSec)   = $computeFittingBucket($rawMov['in_pcs'], $rawMov['in_qty']);
                list($outPrimary, $outSec) = $computeFittingBucket($rawMov['out_pcs'], $rawMov['out_qty']);

                $adjPcsVal = floatval($rawMov['adj_pcs']);
                $adjQtyVal = floatval($rawMov['adj_qty']);

                if ($adjPcsVal != 0 && $adjQtyVal != 0) {
                    if (abs($adjQtyVal) >= abs($adjPcsVal)) {
                        $adjPrimary = $adjPcsVal;
                        $adjSec     = $adjQtyVal;
                    } else {
                        $adjPrimary = $adjQtyVal;
                        $adjSec     = $adjPcsVal;
                    }
                } elseif ($adjQtyVal != 0) {
                    $adjPrimary = round($adjQtyVal / $pcsPerCtn, 2);
                    $adjSec     = $adjQtyVal;
                } elseif ($adjPcsVal != 0) {
                    $adjPrimary = $adjPcsVal;
                    $adjSec     = round($adjPcsVal * $pcsPerCtn, 2);
                } else {
                    $adjPrimary = 0.0;
                    $adjSec     = 0.0;
                }

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

            $cbPrimary = $obPrimary + $inPrimary - $outPrimary + $adjPrimary;
            $cbSec     = $obSec + $inSec - $outSec + $adjSec;

            $wtPerPc = floatval($unitDef['weight_per_pc'] ?? 0);
            $kgPerCtn = floatval($unitDef['kg_per_ctn'] ?? 0);
            $obKg = $obSec; $inKg = $inSec; $outKg = $outSec; $adjKg = $adjSec; $cbKg = $cbSec;

            if ($groupName === 'Fittings') {
                $fPcsPerCtn = max(1, floatval($unitDef['pcs_per_ctn'] ?? 1));
                if ($cbSec != 0) {
                    $cbPrimary = round($cbSec / $fPcsPerCtn, 2);
                } elseif ($cbPrimary != 0) {
                    $cbSec = round($cbPrimary * $fPcsPerCtn, 2);
                }

                $obKg  = ($wtPerPc > 0) ? round($obSec * $wtPerPc, 2) : 0.0;
                $inKg  = ($wtPerPc > 0) ? round($inSec * $wtPerPc, 2) : 0.0;
                $outKg = ($wtPerPc > 0) ? round($outSec * $wtPerPc, 2) : 0.0;
                $adjKg = ($wtPerPc > 0) ? round($adjSec * $wtPerPc, 2) : 0.0;
                $cbKg  = ($wtPerPc > 0) ? round($cbSec * $wtPerPc, 2) : 0.0;
            }

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
                'main_category_id' => intval($item['main_category_id'] ?? 0),
                'category_id' => intval($item['main_category_id'] ?? 0),
                'unit' => $item['unit'] ?? $unitDef['primary_unit'],
                'unit_display' => $unitDef['unit_display'],
                'primary_unit' => $unitDef['primary_unit'],
                'secondary_unit' => $unitDef['secondary_unit'],
                'qty_per_piece' => floatval($item['qty_per_piece'] ?? 0),
                'pcs_per_ctn' => floatval($unitDef['pcs_per_ctn'] ?? 0),
                'weight_per_pc' => round($wtPerPc, 3),
                'kg_per_ctn' => round($kgPerCtn, 2),
                'carton' => $item['carton'] ?? '',
                'purchase_price' => floatval($item['purchase_price'] ?? 0),
                'selling_price' => floatval($item['selling_price'] ?? 0),
                'valuation_cost' => floatval($item['valuation_cost'] ?? 0),
                'min_stock' => $minStock,
                'is_low_stock' => $isLowStock,
                'is_negative' => $isNegative,

                // Standard and legacy compatibility fields (used by Auto Adjustments):
                'cb' => round($groupName === 'Fittings' ? $cbSec : ($cbSec != 0 ? $cbSec : $cbPrimary), 2),
                'cb_pcs' => round($cbPrimary, 2),
                'ob' => round($groupName === 'Fittings' ? $obSec : ($obSec != 0 ? $obSec : $obPrimary), 2),
                'in' => round($groupName === 'Fittings' ? $inSec : ($inSec != 0 ? $inSec : $inPrimary), 2),
                'out' => round($groupName === 'Fittings' ? $outSec : ($outSec != 0 ? $outSec : $outPrimary), 2),

                // Multi-unit fields (used by Inventory Balance & Balance Sheet):
                'ob_primary' => round($obPrimary, 2),
                'ob_sec'     => round($obSec, 2),
                'ob_kg'      => round($obKg, 2),
                'in_primary' => round($inPrimary, 2),
                'in_sec'     => round($inSec, 2),
                'in_kg'      => round($inKg, 2),
                'out_primary'=> round($outPrimary, 2),
                'out_sec'    => round($outSec, 2),
                'out_kg'     => round($outKg, 2),
                'adj_primary'=> round($adjPrimary, 2),
                'adj_sec'    => round($adjSec, 2),
                'adj_kg'     => round($adjKg, 2),
                'cb_primary' => round($cbPrimary, 2),
                'cb_sec'     => round($cbSec, 2),
                'cb_kg'      => round($cbKg, 2)
            ];

            $records[] = $itemRow;
            $totalItemsCount++;

            if ($groupName === 'PVC Pipes') {
                $totalStockPcs += $cbPrimary;
                $totalStockKg += $cbSec;
            } elseif ($groupName === 'Fittings') {
                $totalStockCtn += $cbPrimary;
                $totalStockPcs += $cbSec;
                $totalStockKg += $cbKg;
            } elseif ($groupName === 'Raw Material') {
                $totalStockBags += $cbPrimary;
                $totalStockKg += $cbSec;
            } else {
                $totalStockPcs += $cbPrimary;
                $totalStockKg += $cbSec;
            }

            if ($isNegative) $negativeCount++;
            if ($isLowStock) $lowStockCount++;

            if (!isset($categoryGroups[$groupName])) {
                $categoryGroups[$groupName] = [
                    'group_name' => $groupName,
                    'items' => [],
                    'subtotal' => [
                        'ob_primary' => 0, 'ob_sec' => 0, 'ob_kg' => 0,
                        'in_primary' => 0, 'in_sec' => 0, 'in_kg' => 0,
                        'out_primary' => 0, 'out_sec' => 0, 'out_kg' => 0,
                        'adj_primary' => 0, 'adj_sec' => 0, 'adj_kg' => 0,
                        'cb_primary' => 0, 'cb_sec' => 0, 'cb_kg' => 0
                    ]
                ];
            }

            $categoryGroups[$groupName]['items'][] = $itemRow;
            $categoryGroups[$groupName]['subtotal']['ob_primary'] += $itemRow['ob_primary'];
            $categoryGroups[$groupName]['subtotal']['ob_sec']     += $itemRow['ob_sec'];
            $categoryGroups[$groupName]['subtotal']['ob_kg']      += $itemRow['ob_kg'];
            $categoryGroups[$groupName]['subtotal']['in_primary'] += $itemRow['in_primary'];
            $categoryGroups[$groupName]['subtotal']['in_sec']     += $itemRow['in_sec'];
            $categoryGroups[$groupName]['subtotal']['in_kg']      += $itemRow['in_kg'];
            $categoryGroups[$groupName]['subtotal']['out_primary']+= $itemRow['out_primary'];
            $categoryGroups[$groupName]['subtotal']['out_sec']    += $itemRow['out_sec'];
            $categoryGroups[$groupName]['subtotal']['out_kg']     += $itemRow['out_kg'];
            $categoryGroups[$groupName]['subtotal']['adj_primary']+= $itemRow['adj_primary'];
            $categoryGroups[$groupName]['subtotal']['adj_sec']    += $itemRow['adj_sec'];
            $categoryGroups[$groupName]['subtotal']['adj_kg']     += $itemRow['adj_kg'];
            $categoryGroups[$groupName]['subtotal']['cb_primary'] += $itemRow['cb_primary'];
            $categoryGroups[$groupName]['subtotal']['cb_sec']     += $itemRow['cb_sec'];
            $categoryGroups[$groupName]['subtotal']['cb_kg']      += $itemRow['cb_kg'];

            $grandTotal['ob_primary'] += $itemRow['ob_primary'];
            $grandTotal['ob_sec']     += $itemRow['ob_sec'];
            $grandTotal['ob_kg']      += $itemRow['ob_kg'];
            $grandTotal['in_primary'] += $itemRow['in_primary'];
            $grandTotal['in_sec']     += $itemRow['in_sec'];
            $grandTotal['in_kg']      += $itemRow['in_kg'];
            $grandTotal['out_primary']+= $itemRow['out_primary'];
            $grandTotal['out_sec']    += $itemRow['out_sec'];
            $grandTotal['out_kg']     += $itemRow['out_kg'];
            $grandTotal['adj_primary']+= $itemRow['adj_primary'];
            $grandTotal['adj_sec']    += $itemRow['adj_sec'];
            $grandTotal['adj_kg']     += $itemRow['adj_kg'];
            $grandTotal['cb_primary'] += $itemRow['cb_primary'];
            $grandTotal['cb_sec']     += $itemRow['cb_sec'];
            $grandTotal['cb_kg']      += $itemRow['cb_kg'];
        }

        $summary = [
            'total_items' => $totalItemsCount,
            'total_pcs' => round($totalStockPcs, 2),
            'total_ctn' => round($totalStockCtn, 2),
            'total_bags' => round($totalStockBags, 2),
            'total_kg' => round($totalStockKg, 2),
            'negative_count' => $negativeCount,
            'low_stock_count' => $lowStockCount
        ];

        foreach ($grandTotal as $k => $v) {
            $grandTotal[$k] = round($v, 2);
        }

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

        return [
            'status' => 'success',
            'data' => $records,
            'records' => $records,
            'groups' => $orderedGroups,
            'summary' => $summary,
            'grand_total' => $grandTotal
        ];
    }
}

if (!function_exists('calcProducedItemWeightKg')) {
    /**
     * Computes normalized KG weight, pieces count, and unit weight for a production line item.
     */
    function calcProducedItemWeightKg($qty, $pieces, $unit, $unitWeight, $qtyPerPiece, $carton) {
        $qty = floatval($qty ?? 0);
        $pcs = floatval($pieces ?? 0);
        $unitUp = strtoupper(trim((string)($unit ?? '')));
        $unitWt = floatval($unitWeight ?? 0);
        if ($unitWt <= 0) {
            $unitWt = floatval($qtyPerPiece ?? 0);
        }
        $ctn = floatval($carton ?? 0);

        $weightInKg = $qty;
        $actualPieces = $pcs;

        if ($unitUp !== 'KG' && $unitUp !== 'KGS') {
            $actualPieces = ($qty > 0) ? $qty : (($pcs > 0 && $ctn > 0) ? ($pcs * $ctn) : $pcs);
            if ($unitWt > 0) {
                $weightInKg = $actualPieces * $unitWt;
            }
        } else {
            if ($actualPieces <= 0 && $unitWt > 0 && $qty > 0) {
                $actualPieces = round($qty / $unitWt);
            }
        }

        return [
            'weight_kg' => $weightInKg,
            'pieces' => $actualPieces,
            'unit_weight' => $unitWt
        ];
    }
}

if (!function_exists('classifyFactoryOverheadAccount')) {
    /**
     * Maps a Chart of Accounts entry into Production Costing overhead bucket ('electricity', 'labor', 'overhead')
     * or null if excluded (Admin/Marketing/Financial, 50001 Materials, Printing/Entertainment).
     */
    function classifyFactoryOverheadAccount($acc) {
        $mainCode = trim((string)($acc['main_code'] ?? ''));
        $mainNameLower = strtolower(trim((string)($acc['main_name'] ?? '')));
        $mainCompLower = strtolower(trim((string)($acc['main_component'] ?? '')));
        $subCode = trim((string)($acc['sub_code'] ?? ''));
        $subLower = strtolower(trim((string)($acc['sub_name'] ?? '')));
        $accLower = strtolower(trim((string)($acc['name'] ?? '')));

        $isCostOfSales = ($mainCode === '500'
            || strpos($mainCompLower, 'cost of sale') !== false
            || strpos($mainNameLower, 'cost of sale') !== false
            || strpos($mainNameLower, 'cogs') !== false);
        if (!$isCostOfSales) {
            return null;
        }

        if ($subCode === '50001' || $subLower === 'materials' || $subLower === 'material') {
            return null;
        }
        $materialTerms = ['opening inventory', 'purchases', 'purchase return', 'carriage & freight inward', 'cost of inventory', 'closing inventory', 'work in process', 'finished goods'];
        foreach ($materialTerms as $term) {
            if (strpos($accLower, $term) !== false) {
                return null;
            }
        }

        $excludedTerms = ['printing', 'statinery', 'stationery', 'entertainment'];
        foreach ($excludedTerms as $term) {
            if (strpos($subLower, $term) !== false || strpos($accLower, $term) !== false) {
                return null;
            }
        }

        if (strpos($subLower, 'labour') !== false || strpos($subLower, 'labor') !== false || strpos($subLower, 'wage') !== false) {
            return 'labor';
        }
        $laborTerms = ['salary', 'salaries', 'allowance', 'wage', 'labour', 'labor', 'payroll', 'overtime'];
        foreach ($laborTerms as $term) {
            if (strpos($accLower, $term) !== false) {
                return 'labor';
            }
        }

        if (strpos($subLower, 'repair') !== false || strpos($subLower, 'maint') !== false
            || strpos($accLower, 'repair') !== false || strpos($accLower, 'maint') !== false) {
            return 'overhead';
        }

        $elecTerms = ['electric', 'pesco', 'wapda', 'iesco', 'lesco', 'mepco', 'fesco', 'gepco', 'hesco', 'qesco', 'k-electric', 'ke bill', 'power', 'utility', 'utilities'];
        foreach ($elecTerms as $term) {
            if (strpos($accLower, $term) !== false || strpos($subLower, $term) !== false) {
                return 'electricity';
            }
        }

        return 'overhead';
    }
}

if (!function_exists('fetchAutoFactoryOverheads')) {
    /**
     * Fetches period (from_date..to_date) net factory overheads from posted Cash/Bank/Journal vouchers
     * via fetchLedgerTransactions, excluding opening balances.
     */
    function fetchAutoFactoryOverheads($pdo, $company_id, $from_date, $to_date) {
        if (!function_exists('fetchLedgerTransactions')) {
            require_once __DIR__ . '/account_ledger.php';
        }

        $result = [
            'electricity' => 0.0,
            'labor' => 0.0,
            'overhead' => 0.0,
            'breakdown' => []
        ];

        try {
            $stmtCoa = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name,
                       COALESCE(cs.code, '') as sub_code, COALESCE(cs.name, '') as sub_name,
                       COALESCE(cm.code, '') as main_code, COALESCE(cm.name, '') as main_name,
                       COALESCE(cm.component, '') as main_component
                FROM coa_list cl
                LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
                LEFT JOIN coa_main cm ON cs.main_id = cm.id
                WHERE cl.company_id = ?
                ORDER BY cl.code ASC, cl.name ASC
            ");
            $stmtCoa->execute([$company_id]);
            $accounts = $stmtCoa->fetchAll(PDO::FETCH_ASSOC);

            foreach ($accounts as $acc) {
                $bucket = classifyFactoryOverheadAccount($acc);
                if ($bucket === null) {
                    continue;
                }

                $txs = fetchLedgerTransactions($pdo, $company_id, intval($acc['id']), $from_date, $to_date);
                $netAmt = 0.0;
                foreach ($txs as $tx) {
                    if (!empty($tx['is_ob'])) {
                        continue;
                    }
                    $netAmt += floatval($tx['debit'] ?? 0) - floatval($tx['credit'] ?? 0);
                }

                $result[$bucket] += $netAmt;
                if (abs($netAmt) > 0.005) {
                    $result['breakdown'][] = [
                        'account_id' => intval($acc['id']),
                        'code' => $acc['code'],
                        'name' => $acc['name'],
                        'sub_name' => $acc['sub_name'],
                        'bucket' => $bucket,
                        'amount' => round($netAmt, 2)
                    ];
                }
            }
        } catch (Exception $e) {}

        $result['electricity'] = max(0.0, round($result['electricity'], 2));
        $result['labor'] = max(0.0, round($result['labor'], 2));
        $result['overhead'] = max(0.0, round($result['overhead'], 2));
        return $result;
    }
}

if (!function_exists('resolveBrandProductionCostRates')) {
    /**
     * Resolves per-KG manufacturing cost rates by Brand/Category using Production Costing logic:
     * active category Formula material rate + locked mfg_monthly_wip overheads/KG
     * (or live Auto-Fetch overheads/KG for unlocked current periods).
     */
    function resolveBrandProductionCostRates($pdo, $company_id, $as_on_date, $existingTabs = null) {
        $brandCostPerKgMap = [];
        $brandCostByNameMap = [];
        $brandNamesByCatId = [];
        $formulaOnlyMap = [];
        $mfgMonthlyCostPerKg = 0.0;
        $ovhPerKg = 0.0;

        try {
            $hasFormulaCats = false;
            try {
                $hasFormulaCats = ($pdo->query("SHOW TABLES LIKE 'formula_categories'")->rowCount() > 0);
            } catch (Exception $eFcChk) {}

            if ($hasFormulaCats) {
                $stmtFormulas = $pdo->prepare("
                    SELECT f.id as formula_id, COALESCE(fc.category_id, f.category_id) as effective_cat_id,
                           f.formula_name, f.total_qty, f.total_amount, m.name as category_name
                    FROM formulas f
                    LEFT JOIN formula_categories fc ON fc.formula_id = f.id
                    LEFT JOIN inv_main_categories m ON COALESCE(fc.category_id, f.category_id) = m.id
                    WHERE (f.company_id = ? OR f.company_id = 1 OR f.company_id IS NULL)
                      AND f.is_cancelled = 0 AND f.is_posted = 1
                    ORDER BY f.date DESC, f.id DESC
                ");
            } else {
                $stmtFormulas = $pdo->prepare("
                    SELECT f.id as formula_id, f.category_id as effective_cat_id,
                           f.formula_name, f.total_qty, f.total_amount, m.name as category_name
                    FROM formulas f
                    LEFT JOIN inv_main_categories m ON f.category_id = m.id
                    WHERE (f.company_id = ? OR f.company_id = 1 OR f.company_id IS NULL)
                      AND f.is_cancelled = 0 AND f.is_posted = 1
                    ORDER BY f.date DESC, f.id DESC
                ");
            }
            $stmtFormulas->execute([$company_id]);
            while ($fRow = $stmtFormulas->fetch(PDO::FETCH_ASSOC)) {
                $cId = intval($fRow['effective_cat_id'] ?? 0);
                $fQty = floatval($fRow['total_qty'] ?? 0);
                $fAmt = floatval($fRow['total_amount'] ?? 0);
                if ($fQty > 0 && $fAmt > 0) {
                    $fRate = round($fAmt / $fQty, 2);
                    if ($cId > 0 && !isset($brandCostPerKgMap[$cId])) {
                        $brandCostPerKgMap[$cId] = $fRate;
                        $formulaOnlyMap[$cId] = $fRate;
                        $brandNamesByCatId[$cId] = trim((string)($fRow['category_name'] ?? $fRow['formula_name'] ?? ''));
                    }
                    $cNameL = strtolower(trim((string)($fRow['category_name'] ?? '')));
                    if ($cNameL && !isset($brandCostByNameMap[$cNameL])) {
                        $brandCostByNameMap[$cNameL] = $fRate;
                    }
                    $fNameL = strtolower(trim((string)($fRow['formula_name'] ?? '')));
                    if ($fNameL && !isset($brandCostByNameMap[$fNameL])) {
                        $brandCostByNameMap[$fNameL] = $fRate;
                    }
                }
            }
        } catch (Exception $eForm) {}

        $targetTs = strtotime($as_on_date ?: date('Y-m-d'));
        $targetYear = intval(date('Y', $targetTs));
        $targetMonthNum = intval(date('n', $targetTs));
        $monthStart = date('Y-m-01', $targetTs);

        // 1. Check if target month is locked / saved in mfg_monthly_wip
        $usedLockedMonth = false;
        try {
            $stmtExactWip = $pdo->prepare("
                SELECT per_kg_cost, electricity_cost, labor_cost, overhead_cost, finished_prod_qty, is_locked
                FROM mfg_monthly_wip
                WHERE company_id = ? AND year = ? AND month = ?
                LIMIT 1
            ");
            $stmtExactWip->execute([$company_id, $targetYear, $targetMonthNum]);
            $exactWip = $stmtExactWip->fetch(PDO::FETCH_ASSOC);
            if ($exactWip) {
                $finQty = floatval($exactWip['finished_prod_qty'] ?? 0);
                $totOvh = floatval($exactWip['electricity_cost'] ?? 0) + floatval($exactWip['labor_cost'] ?? 0) + floatval($exactWip['overhead_cost'] ?? 0);
                if (!empty($exactWip['is_locked']) || $totOvh > 0 || floatval($exactWip['per_kg_cost'] ?? 0) > 0) {
                    $usedLockedMonth = true;
                    $mfgMonthlyCostPerKg = floatval($exactWip['per_kg_cost'] ?? 0);
                    $ovhPerKg = ($finQty > 0 && $totOvh > 0) ? ($totOvh / $finQty) : 0.0;
                }
            }
        } catch (Exception $eWipExact) {}

        // 2. If current month is not locked yet, use live Auto-Fetch overheads / live production KG (matching Production Costing Auto-Fetch)
        $hasLiveProduction = false;
        if (!$usedLockedMonth) {
            try {
                $hasPn = ($existingTabs === null) || (in_array('production_notes', $existingTabs) && in_array('production_note_items', $existingTabs));
                if ($hasPn) {
                    $stmtMonthProd = $pdo->prepare("
                        SELECT pp.qty, pp.pieces, i.unit,
                               COALESCE(i.unit_weight, 0) as unit_weight,
                               COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                               COALESCE(i.carton, 0) as carton
                        FROM production_note_items pp
                        JOIN production_notes p ON pp.pn_id = p.id
                        JOIN inv_items i ON pp.item_id = i.id
                        WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1
                          AND p.date BETWEEN ? AND ?
                    ");
                    $stmtMonthProd->execute([$company_id, $monthStart, date('Y-m-d', $targetTs)]);
                    $liveProdKg = 0.0;
                    foreach ($stmtMonthProd->fetchAll(PDO::FETCH_ASSOC) as $pRow) {
                        $calcW = calcProducedItemWeightKg(
                            $pRow['qty'] ?? 0,
                            $pRow['pieces'] ?? 0,
                            $pRow['unit'] ?? '',
                            $pRow['unit_weight'] ?? 0,
                            $pRow['qty_per_piece'] ?? 0,
                            $pRow['carton'] ?? 0
                        );
                        $liveProdKg += floatval($calcW['weight_kg'] ?? 0);
                    }

                    if ($liveProdKg > 0) {
                        $hasLiveProduction = true;
                        $autoOvh = fetchAutoFactoryOverheads($pdo, $company_id, $monthStart, date('Y-m-d', $targetTs));
                        $liveTotOvh = floatval($autoOvh['electricity'] ?? 0) + floatval($autoOvh['labor'] ?? 0) + floatval($autoOvh['overhead'] ?? 0);
                        if ($liveTotOvh > 0) {
                            $ovhPerKg = $liveTotOvh / $liveProdKg;
                        }
                    }
                }
            } catch (Exception $eAuto) {}

            // 3. Fallback to latest prior locked month in mfg_monthly_wip (only borrow prior overheads when no live production exists yet)
            try {
                $stmtPriorWip = $pdo->prepare("
                    SELECT per_kg_cost, electricity_cost, labor_cost, overhead_cost, finished_prod_qty
                    FROM mfg_monthly_wip
                    WHERE company_id = ? AND ((year < ?) OR (year = ? AND month <= ?))
                    ORDER BY year DESC, month DESC
                    LIMIT 1
                ");
                $stmtPriorWip->execute([$company_id, $targetYear, $targetYear, $targetMonthNum]);
                $priorRow = $stmtPriorWip->fetch(PDO::FETCH_ASSOC);
                if ($priorRow) {
                    $mfgMonthlyCostPerKg = floatval($priorRow['per_kg_cost'] ?? 0);
                    if (!$hasLiveProduction && $ovhPerKg <= 0) {
                        $finQty = floatval($priorRow['finished_prod_qty'] ?? 0);
                        $totOvh = floatval($priorRow['electricity_cost'] ?? 0) + floatval($priorRow['labor_cost'] ?? 0) + floatval($priorRow['overhead_cost'] ?? 0);
                        if ($finQty > 0 && $totOvh > 0) {
                            $ovhPerKg = $totOvh / $finQty;
                        }
                    }
                }
            } catch (Exception $ePrior) {}
        }

        if ($ovhPerKg > 0) {
            foreach ($brandCostPerKgMap as $bCid => $bRate) {
                $brandCostPerKgMap[$bCid] = round($bRate + $ovhPerKg, 2);
            }
            foreach ($brandCostByNameMap as $bNm => $bRate) {
                $brandCostByNameMap[$bNm] = round($bRate + $ovhPerKg, 2);
            }
        }

        return [
            'by_category_id' => $brandCostPerKgMap,
            'by_name' => $brandCostByNameMap,
            'category_names' => $brandNamesByCatId,
            'formula_material_by_cat' => $formulaOnlyMap,
            'overhead_per_kg' => round($ovhPerKg, 2),
            'fallback_per_kg' => round($mfgMonthlyCostPerKg, 2)
        ];
    }
}

if (!function_exists('computeFactoryClosingWipSummary')) {
    /**
     * Single source of truth for Monthly Closing Floor WIP (KG, Avg Rate/KG, Value)
     * aligned with Production Costing & WIP Statement:
     * 1) If target month is locked/saved in mfg_monthly_wip, uses locked closing_wip_qty & closing_wip_val.
     * 2) Otherwise starts from previous month's closing WIP (or pre-month net floor WIP floored at 0)
     *    and adds current month Material Issues (MIN) minus Production Output (using calcProducedItemWeightKg).
     */
    function computeFactoryClosingWipSummary($pdo, $company_id, $targetDate, $existingTabs = null, $fallbackRate = 220.0) {
        $result = [
            'closing_wip_qty' => 0.0,
            'closing_wip_val' => 0.0,
            'rate_per_kg' => 0.0,
            'opening_wip_qty' => 0.0,
            'opening_wip_val' => 0.0,
            'period_issued_qty' => 0.0,
            'period_issued_val' => 0.0,
            'period_produced_qty' => 0.0,
            'is_locked' => false
        ];

        if (!$targetDate) {
            return $result;
        }

        if ($existingTabs === null) {
            $existingTabs = [];
            try {
                $stT = $pdo->query("SHOW TABLES");
                while ($t = $stT->fetch(PDO::FETCH_NUM)) {
                    $existingTabs[] = $t[0];
                }
            } catch (Exception $e) {}
        }

        $toTs = strtotime($targetDate);
        if (!$toTs) {
            return $result;
        }

        $targetYear = intval(date('Y', $toTs));
        $targetMonthNum = intval(date('n', $toTs));
        $monthStart = date('Y-m-01', $toTs);
        $monthEnd = date('Y-m-d', $toTs);

        // 1. Check exact locked monthly snapshot in mfg_monthly_wip
        if (in_array('mfg_monthly_wip', $existingTabs)) {
            try {
                $stmtExact = $pdo->prepare("SELECT closing_wip_qty, closing_wip_val, is_locked FROM mfg_monthly_wip WHERE company_id = ? AND year = ? AND month = ? LIMIT 1");
                $stmtExact->execute([$company_id, $targetYear, $targetMonthNum]);
                $exactRow = $stmtExact->fetch(PDO::FETCH_ASSOC);
                if ($exactRow && (!empty($exactRow['is_locked']) || floatval($exactRow['closing_wip_val'] ?? 0) > 0 || floatval($exactRow['closing_wip_qty'] ?? 0) > 0)) {
                    $q = round(max(0.0, floatval($exactRow['closing_wip_qty'] ?? 0)), 2);
                    $v = round(max(0.0, floatval($exactRow['closing_wip_val'] ?? 0)), 2);
                    $r = ($q > 0 && $v > 0) ? round($v / $q, 2) : 0.0;
                    $result['closing_wip_qty'] = $q;
                    $result['closing_wip_val'] = $v;
                    $result['rate_per_kg'] = $r;
                    $result['is_locked'] = !empty($exactRow['is_locked']);
                    return $result;
                }
            } catch (Exception $eW) {}
        }

        // 2. Determine Opening WIP for start of target month (from previous month lock or historical net before $monthStart)
        $openingQty = 0.0;
        $openingVal = 0.0;
        $usedPrevSnapshot = false;
        $prevTs = strtotime('-1 month', strtotime($monthStart));
        $prevYr = intval(date('Y', $prevTs));
        $prevMo = intval(date('n', $prevTs));

        if (in_array('mfg_monthly_wip', $existingTabs)) {
            try {
                $stmtPrev = $pdo->prepare("SELECT closing_wip_qty, closing_wip_val, is_locked FROM mfg_monthly_wip WHERE company_id = ? AND year = ? AND month = ? LIMIT 1");
                $stmtPrev->execute([$company_id, $prevYr, $prevMo]);
                $prevRow = $stmtPrev->fetch(PDO::FETCH_ASSOC);
                if ($prevRow && (!empty($prevRow['is_locked']) || floatval($prevRow['closing_wip_qty'] ?? 0) > 0)) {
                    $openingQty = max(0.0, floatval($prevRow['closing_wip_qty'] ?? 0));
                    $openingVal = max(0.0, floatval($prevRow['closing_wip_val'] ?? 0));
                    $usedPrevSnapshot = true;
                }
            } catch (Exception $ePrev) {}
        }

        $hasMinTabs = (in_array('material_issue_notes', $existingTabs) && in_array('material_issue_note_items', $existingTabs));
        $hasPnTabs = (in_array('production_notes', $existingTabs) && in_array('production_note_items', $existingTabs));

        if (!$usedPrevSnapshot && $hasMinTabs) {
            try {
                $stmtHistIss = $pdo->prepare("
                    SELECT COALESCE(SUM(mii.qty), 0) as total_issued_qty,
                           COALESCE(SUM(mii.amount), 0) as total_issued_val
                    FROM material_issue_note_items mii
                    JOIN material_issue_notes m ON mii.min_id = m.id
                    WHERE m.company_id = ? AND m.is_cancelled = 0 AND m.is_posted = 1 AND DATE(m.date) < ?
                ");
                $stmtHistIss->execute([$company_id, $monthStart]);
                $hIss = $stmtHistIss->fetch(PDO::FETCH_ASSOC);
                $hIssQty = floatval($hIss['total_issued_qty'] ?? 0);
                $hIssVal = floatval($hIss['total_issued_val'] ?? 0);

                $hProdQty = 0.0;
                if ($hasPnTabs) {
                    $stmtHistProd = $pdo->prepare("SELECT COALESCE(SUM(pp.qty), 0) as total_prod_qty FROM production_note_items pp JOIN production_notes p ON pp.pn_id = p.id WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1 AND DATE(p.date) < ?");
                    $stmtHistProd->execute([$company_id, $monthStart]);
                    $hProdQty = floatval($stmtHistProd->fetchColumn() ?: 0);
                }

                $hDiff = $hIssQty - $hProdQty;
                if ($hDiff > 0) {
                    $openingQty = $hDiff;
                    $hRate = ($hIssQty > 0 && $hIssVal > 0) ? ($hIssVal / $hIssQty) : floatval($fallbackRate);
                    $openingVal = $openingQty * $hRate;
                }
            } catch (Exception $eHist) {}
        }

        // 3. Period Issues ($monthStart .. $monthEnd)
        $periodIssQty = 0.0;
        $periodIssVal = 0.0;
        if ($hasMinTabs) {
            try {
                $stmtPerIss = $pdo->prepare("
                    SELECT COALESCE(SUM(mii.qty), 0) as period_issued_qty,
                           COALESCE(SUM(mii.amount), 0) as period_issued_val
                    FROM material_issue_note_items mii
                    JOIN material_issue_notes m ON mii.min_id = m.id
                    WHERE m.company_id = ? AND m.is_cancelled = 0 AND m.is_posted = 1
                      AND DATE(m.date) BETWEEN ? AND ?
                ");
                $stmtPerIss->execute([$company_id, $monthStart, $monthEnd]);
                $pIss = $stmtPerIss->fetch(PDO::FETCH_ASSOC);
                $periodIssQty = floatval($pIss['period_issued_qty'] ?? 0);
                $periodIssVal = floatval($pIss['period_issued_val'] ?? 0);

                if ($periodIssVal <= 0 && $periodIssQty > 0) {
                    $stmtDef = $pdo->prepare("SELECT AVG(purchase_price) FROM inv_items WHERE company_id = ? AND purchase_price > 0");
                    $stmtDef->execute([$company_id]);
                    $defP = floatval($stmtDef->fetchColumn() ?: $fallbackRate);
                    $periodIssVal = $periodIssQty * $defP;
                }
            } catch (Exception $ePerI) {}
        }

        // 4. Period Production Output in KG ($monthStart .. $monthEnd) via shared calcProducedItemWeightKg
        $periodProdQty = 0.0;
        if ($hasPnTabs) {
            try {
                $stmtPerProd = $pdo->prepare("
                    SELECT SUM(pp.qty) as produced_qty,
                           SUM(pp.pieces) as produced_pieces,
                           i.unit,
                           COALESCE(i.unit_weight, 0) as unit_weight,
                           COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                           COALESCE(i.carton, 0) as carton
                    FROM production_note_items pp
                    JOIN production_notes p ON pp.pn_id = p.id
                    JOIN inv_items i ON pp.item_id = i.id
                    WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1
                      AND DATE(p.date) BETWEEN ? AND ?
                    GROUP BY pp.item_id, i.unit, i.unit_weight, i.qty_per_piece, i.carton
                ");
                $stmtPerProd->execute([$company_id, $monthStart, $monthEnd]);
                foreach ($stmtPerProd->fetchAll(PDO::FETCH_ASSOC) as $pr) {
                    $calc = calcProducedItemWeightKg(
                        $pr['produced_qty'] ?? 0,
                        $pr['produced_pieces'] ?? 0,
                        $pr['unit'] ?? '',
                        $pr['unit_weight'] ?? 0,
                        $pr['qty_per_piece'] ?? 0,
                        $pr['carton'] ?? 0
                    );
                    $periodProdQty += floatval($calc['weight_kg'] ?? 0);
                }
            } catch (Exception $ePerP) {}
        }

        // 5. Closing WIP Calculation matching Production Costing & WIP Statement
        $closingWipQty = ($openingQty + $periodIssQty) - $periodProdQty;
        if ($closingWipQty < 0) $closingWipQty = 0.0;

        if ($periodIssQty > 0 && $periodIssVal > 0) {
            $avgRate = $periodIssVal / $periodIssQty;
        } elseif ($openingQty > 0 && $openingVal > 0) {
            $avgRate = $openingVal / $openingQty;
        } else {
            $avgRate = floatval($fallbackRate);
        }

        $closingWipVal = $closingWipQty * $avgRate;

        $result['opening_wip_qty'] = round($openingQty, 2);
        $result['opening_wip_val'] = round($openingVal, 2);
        $result['period_issued_qty'] = round($periodIssQty, 2);
        $result['period_issued_val'] = round($periodIssVal, 2);
        $result['period_produced_qty'] = round($periodProdQty, 2);
        $result['closing_wip_qty'] = round($closingWipQty, 2);
        $result['closing_wip_val'] = round($closingWipVal, 2);
        $result['rate_per_kg'] = ($closingWipQty > 0) ? round($avgRate, 2) : 0.0;

        return $result;
    }
}
