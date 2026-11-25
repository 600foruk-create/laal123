<?php
require_once 'db_config.php';
header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// =========================================================================
// 1. GET METADATA (Raw Materials, Categories, Suppliers, Available Years)
// =========================================================================
if ($action === 'get_meta') {
    try {
        // Raw Material Categories
        $stmtCats = $pdo->prepare("
            SELECT id, name, category_type 
            FROM inv_main_categories 
            WHERE company_id = ? 
            ORDER BY name ASC
        ");
        $stmtCats->execute([$company_id]);
        $categories = $stmtCats->fetchAll(PDO::FETCH_ASSOC);

        // Items with unit conversion factors, categories & brands
        $stmtItems = $pdo->prepare("
            SELECT i.id, i.code, i.name, i.unit, i.purchase_price, i.category_type,
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton,
                   sc.main_id as category_id, mc.name as category_name,
                   b.id as brand_id, b.name as brand_name
            FROM inv_items i
            LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
            LEFT JOIN inv_main_categories mc ON sc.main_id = mc.id
            LEFT JOIN inv_brands b ON i.brand_id = b.id
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY i.name ASC
        ");
        $stmtItems->execute([$company_id]);
        $allItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        // Separate raw material items vs all items
        $rawItems = [];
        foreach ($allItems as $it) {
            $catType = strtoupper(trim($it['category_type'] ?? ''));
            $mainCat = strtoupper(trim($it['category_name'] ?? ''));
            $name = strtoupper(trim($it['name'] ?? ''));

            if ($catType === 'RAW MATERIAL' || 
                strpos($catType, 'RAW') !== false || 
                strpos($mainCat, 'RAW') !== false || 
                strpos($name, 'RESIN') !== false || 
                strpos($name, 'CALCIUM') !== false || 
                strpos($name, 'STABILIZER') !== false || 
                strpos($name, 'TITANIUM') !== false || 
                strpos($name, 'LUBRICANT') !== false || 
                strpos($name, 'COMPOUND') !== false || 
                strpos($name, 'PIGMENT') !== false || 
                strpos($name, 'WAX') !== false || 
                strpos($name, 'CHEMICAL') !== false) {
                $rawItems[] = $it;
            }
        }

        $filteredItems = !empty($rawItems) ? $rawItems : $allItems;

        // Suppliers / Vendors
        $stmtSuppliers = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name 
            FROM coa_list cl
            INNER JOIN vendors v ON cl.id = v.coa_list_id
            WHERE cl.company_id = ?
            ORDER BY cl.name ASC
        ");
        $stmtSuppliers->execute([$company_id]);
        $suppliers = $stmtSuppliers->fetchAll(PDO::FETCH_ASSOC);

        // Date Presets
        $today = date('Y-m-d');
        $firstOfMonth = date('Y-m-01');
        $lastOfMonth = date('Y-m-t');

        // Fetch Company Profile from Database
        $compRow = [];
        try {
            $cStmt = $pdo->prepare("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies WHERE id = ?");
            $cStmt->execute([$company_id]);
            $compRow = $cStmt->fetch(PDO::FETCH_ASSOC);
            if (!$compRow) {
                $cStmt2 = $pdo->query("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies ORDER BY id ASC LIMIT 1");
                $compRow = $cStmt2->fetch(PDO::FETCH_ASSOC) ?: [];
            }
        } catch (Exception $ce) {}

        echo json_encode([
            'status' => 'success',
            'company' => $compRow,
            'categories' => $categories,
            'raw_materials' => $filteredItems,
            'all_items' => $allItems,
            'suppliers' => $suppliers,
            'default_from_date' => $firstOfMonth,
            'default_to_date' => $lastOfMonth,
            'today' => $today
        ]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 2. GENERATE RAW MATERIAL FLOW STATEMENT WITH DATES, UNITS & COSTING METHODS
// =========================================================================
if ($action === 'get_flow_statement') {
    try {
        $from_date = $_GET['from_date'] ?? null;
        $to_date = $_GET['to_date'] ?? null;
        
        // Support Date Range or Month-based fallback
        if (empty($from_date)) {
            $from_month = intval($_GET['from_month'] ?? date('n'));
            $year = intval($_GET['year'] ?? date('Y'));
            $fromMonthStr = str_pad($from_month, 2, '0', STR_PAD_LEFT);
            $from_date = "$year-$fromMonthStr-01";
        }
        if (empty($to_date)) {
            $to_month = intval($_GET['to_month'] ?? date('n'));
            $year = intval($_GET['year'] ?? date('Y'));
            $toMonthStr = str_pad($to_month, 2, '0', STR_PAD_LEFT);
            $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $to_month, $year);
            $to_date = "$year-$toMonthStr-$daysInMonth";
        }

        $startDate = $from_date;
        $endDate = $to_date . " 23:59:59";

        $item_filter = $_GET['raw_material_id'] ?? 'all';
        $category_filter = $_GET['category_id'] ?? 'all';
        $supplier_filter = $_GET['supplier_id'] ?? 'all';
        $show_zero = !empty($_GET['show_zero_balance']) && ($_GET['show_zero_balance'] === '1' || $_GET['show_zero_balance'] === 'true');
        
        // Costing Methods: average_cost, last_purchase, max_purchase, min_purchase, master_rate, fifo
        $costing_method = $_GET['costing_method'] ?? 'average_cost';
        
        // Unit Conversion: base, bags, kg, ltr
        $view_unit = strtolower(trim($_GET['view_unit'] ?? 'base'));

        // Tax / Valuation Rule: 'tax' (Excl. Tax) vs 'non_tax' (Full Net)
        $taxMode = resolveInventoryTaxMode($pdo, $company_id, $_GET['tax_mode'] ?? null);
        $taxModeLabel = ($taxMode === 'tax') ? 'Excl. Tax (GST Excluded)' : 'Non-Tax (Full Bill Value)';
        $piAmtExpr = invLineAmountSql('pii', $taxMode, 'standard', 'quantity');
        $prAmtExpr = invLineAmountSql('pri', $taxMode, 'purchase_return', 'quantity');
        $srAmtExpr = invLineAmountSql('sri', $taxMode, 'standard', 'quantity');
        $siAmtExpr = invLineAmountSql('sii', $taxMode, 'standard', 'quantity');

        // Period Labels
        $prevTimestamp = strtotime("$startDate -1 day");
        $prevDateLabel = date('d-M-Y', $prevTimestamp);
        $startDateLabel = date('d-M-Y', strtotime($startDate));
        $endDateLabel = date('d-M-Y', strtotime($to_date));
        $currentPeriodLabel = ($startDate === $to_date) ? $startDateLabel : "$startDateLabel to $endDateLabel";

        $nextTimestamp = strtotime("$to_date +1 day");
        $nextDateLabel = date('d-M-Y', $nextTimestamp);

        // 1. Fetch matching items with unit conversion info
        $itemSql = "
            SELECT i.id, i.code, i.name, i.unit, COALESCE(i.purchase_price, 0) as default_purchase_price,
                   COALESCE(i.selling_price, 0) as selling_price,
                   COALESCE(i.valuation_cost, 0) as valuation_cost,
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton,
                   i.category_type, 
                   sc.main_id as category_id, mc.name as category_name,
                   b.id as brand_id, b.name as brand_name
            FROM inv_items i
            LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
            LEFT JOIN inv_main_categories mc ON sc.main_id = mc.id
            LEFT JOIN inv_brands b ON i.brand_id = b.id
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
        ";
        $itemParams = [$company_id];

        if ($item_filter !== 'all' && intval($item_filter) > 0) {
            $itemSql .= " AND i.id = ?";
            $itemParams[] = intval($item_filter);
        }

        if ($category_filter !== 'all' && intval($category_filter) > 0) {
            $catId = intval($category_filter);
            $cStmt = $pdo->prepare("SELECT name, category_type FROM inv_main_categories WHERE id = ?");
            $cStmt->execute([$catId]);
            $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
            $cName = $cRow['name'] ?? '';

            if ($cName) {
                $itemSql .= " AND (sc.main_id = ? OR mc.name = ? OR i.category_type = ? OR b.name = ?)";
                $itemParams[] = $catId;
                $itemParams[] = $cName;
                $itemParams[] = $cName;
                $itemParams[] = $cName;
            } else {
                $itemSql .= " AND sc.main_id = ?";
                $itemParams[] = $catId;
            }
        }

        $itemSql .= " ORDER BY i.name ASC";
        $stmtItems = $pdo->prepare($itemSql);
        $stmtItems->execute($itemParams);
        $candidateItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        // Process all matching candidate items directly (when Category=All & Item=All, show all categories)
        $itemsToProcess = $candidateItems;

        if (empty($itemsToProcess)) {
            echo json_encode([
                'status' => 'success',
                'tax_mode' => $taxMode,
                'tax_mode_label' => $taxModeLabel,
                'rows' => [],
                'totals' => [],
                'period_summary' => [
                    'prev_period_label' => $prevDateLabel,
                    'current_period_label' => $currentPeriodLabel,
                    'next_period_label' => $nextDateLabel,
                    'opening_value' => 0,
                    'purchase_value' => 0,
                    'available_value' => 0,
                    'consumption_value' => 0,
                    'closing_value' => 0
                ]
            ]);
            exit;
        }

        $itemIds = array_map(function($it) { return intval($it['id']); }, $itemsToProcess);
        $idList = implode(',', $itemIds);

        // 2. Fetch Initial Opening Balances from inv_opening_balances
        $obMap = [];
        try {
            $stmtOB = $pdo->query("
                SELECT item_id, SUM(quantity) as ob_qty, AVG(NULLIF(rate, 0)) as ob_rate
                FROM inv_opening_balances 
                WHERE company_id = $company_id AND item_id IN ($idList)
                GROUP BY item_id
            ");
            while ($row = $stmtOB->fetch(PDO::FETCH_ASSOC)) {
                $obMap[intval($row['item_id'])] = [
                    'qty' => floatval($row['ob_qty']),
                    'rate' => floatval($row['ob_rate'] ?? 0)
                ];
            }
        } catch (Exception $e) {}

        // Shared helpers for aggregating historical vs period inward & outward movements cleanly
        $collectInflowBucket = function($piDateCond, $pnDateCond, $srDateCond, $adjDateCond, $prDateCond, $piSupCond = '', $prSupCond = '') use ($pdo, $company_id, $idList, $piAmtExpr, $srAmtExpr, $prAmtExpr) {
            $bucket = [];
            $add = function($iid, $qty, $amt, $unvaluedQty = 0.0) use (&$bucket) {
                $iid = intval($iid);
                if (!isset($bucket[$iid])) {
                    $bucket[$iid] = ['qty' => 0.0, 'amount' => 0.0, 'unvalued_qty' => 0.0];
                }
                $bucket[$iid]['qty'] += floatval($qty);
                $bucket[$iid]['amount'] += floatval($amt);
                $bucket[$iid]['unvalued_qty'] += floatval($unvaluedQty);
            };
            $subtract = function($iid, $qty, $amt) use (&$bucket) {
                $iid = intval($iid);
                if (!isset($bucket[$iid])) {
                    $bucket[$iid] = ['qty' => 0.0, 'amount' => 0.0, 'unvalued_qty' => 0.0];
                }
                $bucket[$iid]['qty'] -= floatval($qty);
                $bucket[$iid]['amount'] -= floatval($amt);
            };

            // Purchase Invoices (Excl. Tax or Full Net per resolved taxMode)
            $stmtPI = $pdo->query("
                SELECT pii.item_coa_id as item_id, SUM(pii.quantity) as qty, SUM({$piAmtExpr}) as amount
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 {$piDateCond}
                  AND pii.item_coa_id IN ($idList) {$piSupCond}
                GROUP BY pii.item_coa_id
            ");
            while ($row = $stmtPI->fetch(PDO::FETCH_ASSOC)) {
                $add($row['item_id'], $row['qty'], $row['amount']);
            }

            // Production Notes IN (qty > 0), tracking zero-amount rows separately
            try {
                $stmtPN = $pdo->query("
                    SELECT pp.item_id, SUM(pp.qty) as qty,
                           SUM(COALESCE(NULLIF(pp.amount, 0), pp.qty * pp.rate, 0)) as amount,
                           SUM(CASE WHEN COALESCE(NULLIF(pp.amount, 0), pp.qty * pp.rate, 0) <= 0 AND pp.qty > 0 THEN pp.qty ELSE 0 END) as unvalued_qty
                    FROM production_note_items pp
                    JOIN production_notes p ON pp.pn_id = p.id
                    WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 {$pnDateCond} AND pp.qty > 0
                      AND pp.item_id IN ($idList)
                    GROUP BY pp.item_id
                ");
                while ($row = $stmtPN->fetch(PDO::FETCH_ASSOC)) {
                    $add($row['item_id'], $row['qty'], $row['amount'], $row['unvalued_qty']);
                }
            } catch (Exception $e) {}

            // Sale Returns IN (Excl. Tax or Full Net per resolved taxMode)
            try {
                $stmtSR = $pdo->query("
                    SELECT sri.item_coa_id as item_id, SUM(sri.quantity) as qty, SUM({$srAmtExpr}) as amount
                    FROM sale_return_items sri
                    JOIN sale_returns sr ON sri.return_id = sr.id
                    WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1 {$srDateCond}
                      AND sri.item_coa_id IN ($idList)
                    GROUP BY sri.item_coa_id
                ");
                while ($row = $stmtSR->fetch(PDO::FETCH_ASSOC)) {
                    $add($row['item_id'], $row['qty'], $row['amount']);
                }
            } catch (Exception $e) {}

            // Add Inventory Adjustments IN (use saved rate/amount when present, flag unvalued qty)
            try {
                $stmtAdj = $pdo->query("
                    SELECT ai.item_id, SUM(ai.qty) as qty,
                           SUM(COALESCE(NULLIF(ai.amount, 0), ai.qty * NULLIF(ai.rate, 0), 0)) as amount,
                           SUM(CASE WHEN COALESCE(NULLIF(ai.amount, 0), ai.qty * NULLIF(ai.rate, 0), 0) <= 0 AND ai.qty > 0 THEN ai.qty ELSE 0 END) as unvalued_qty
                    FROM add_inventory_adjustment_items ai
                    JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id
                    WHERE a.company_id = $company_id AND a.is_cancelled = 0 {$adjDateCond}
                      AND ai.item_id IN ($idList)
                    GROUP BY ai.item_id
                ");
                while ($row = $stmtAdj->fetch(PDO::FETCH_ASSOC)) {
                    $add($row['item_id'], $row['qty'], $row['amount'], $row['unvalued_qty']);
                }
            } catch (Exception $e) {
                try {
                    $stmtAdjFb = $pdo->query("
                        SELECT ai.item_id, SUM(ai.qty) as qty
                        FROM add_inventory_adjustment_items ai
                        JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id
                        WHERE a.company_id = $company_id AND a.is_cancelled = 0 {$adjDateCond}
                          AND ai.item_id IN ($idList)
                        GROUP BY ai.item_id
                    ");
                    while ($row = $stmtAdjFb->fetch(PDO::FETCH_ASSOC)) {
                        $q = floatval($row['qty']);
                        $add($row['item_id'], $q, 0.0, ($q > 0 ? $q : 0.0));
                    }
                } catch (Exception $e2) {}
            }

            // Purchase Returns deducted from Inflow (even if no new purchases in the period)
            try {
                $stmtPR = $pdo->query("
                    SELECT pri.item_coa_id as item_id, SUM(pri.quantity) as qty, SUM({$prAmtExpr}) as amount
                    FROM purchase_return_items pri
                    JOIN purchase_returns pr ON pri.return_id = pr.id
                    WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 {$prDateCond}
                      AND pri.item_coa_id IN ($idList) {$prSupCond}
                    GROUP BY pri.item_coa_id
                ");
                while ($row = $stmtPR->fetch(PDO::FETCH_ASSOC)) {
                    $subtract($row['item_id'], $row['qty'], $row['amount']);
                }
            } catch (Exception $e) {}

            return $bucket;
        };

        $collectOutflowQty = function($minDateCond, $pnDateCond, $siDateCond, $redDateCond) use ($pdo, $company_id, $idList) {
            $qtyMap = [];
            $queries = [
                ["SELECT mii.item_id, SUM(mii.qty) as qty FROM material_issue_note_items mii JOIN material_issue_notes m ON mii.min_id = m.id WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 {$minDateCond} AND mii.item_id IN ($idList) GROUP BY mii.item_id"],
                ["SELECT pp.item_id, SUM(ABS(pp.qty)) as qty FROM production_note_items pp JOIN production_notes p ON pp.pn_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 {$pnDateCond} AND pp.qty < 0 AND pp.item_id IN ($idList) GROUP BY pp.item_id"],
                ["SELECT sii.item_coa_id as item_id, SUM(sii.quantity) as qty FROM sale_invoice_items sii JOIN sale_invoices si ON sii.invoice_id = si.id WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 {$siDateCond} AND sii.item_coa_id IN ($idList) GROUP BY sii.item_coa_id"],
                ["SELECT ri.item_id, SUM(ri.qty) as qty FROM reduce_inventory_adjustment_items ri JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id WHERE r.company_id = $company_id AND r.is_cancelled = 0 {$redDateCond} AND ri.item_id IN ($idList) GROUP BY ri.item_id"]
            ];
            foreach ($queries as $qDef) {
                try {
                    $stmt = $pdo->query($qDef[0]);
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                        $iid = intval($row['item_id']);
                        $qtyMap[$iid] = ($qtyMap[$iid] ?? 0.0) + floatval($row['qty']);
                    }
                } catch (Exception $e) {}
            }
            return $qtyMap;
        };

        // 3. Historical Inflow/Outflow BEFORE $startDate to calculate previous period closing
        $histPurchases = $collectInflowBucket(
            "AND pi.invoice_date < '$startDate'",
            "AND p.date < '$startDate'",
            "AND sr.return_date < '$startDate'",
            "AND a.date < '$startDate'",
            "AND pr.return_date < '$startDate'"
        );
        $histConsumptionQty = $collectOutflowQty(
            "AND m.date < '$startDate'",
            "AND p.date < '$startDate'",
            "AND si.invoice_date < '$startDate'",
            "AND r.date < '$startDate'"
        );

        // 4. Current Period Transactions ($startDate to $endDate)
        $supplierCondition = ($supplier_filter !== 'all' && intval($supplier_filter) > 0) ? " AND pi.vendor_coa_id = " . intval($supplier_filter) : "";
        $supplierPrCondition = ($supplier_filter !== 'all' && intval($supplier_filter) > 0) ? " AND pr.vendor_coa_id = " . intval($supplier_filter) : "";
        $periodPurchases = $collectInflowBucket(
            "AND pi.invoice_date BETWEEN '$startDate' AND '$endDate'",
            "AND p.date BETWEEN '$startDate' AND '$endDate'",
            "AND sr.return_date BETWEEN '$startDate' AND '$endDate'",
            "AND a.date BETWEEN '$startDate' AND '$endDate'",
            "AND pr.return_date BETWEEN '$startDate' AND '$endDate'",
            $supplierCondition,
            $supplierPrCondition
        );
        $periodConsumptionQty = $collectOutflowQty(
            "AND m.date BETWEEN '$startDate' AND '$endDate'",
            "AND p.date BETWEEN '$startDate' AND '$endDate'",
            "AND si.invoice_date BETWEEN '$startDate' AND '$endDate'",
            "AND r.date BETWEEN '$startDate' AND '$endDate'"
        );

        // 5. Batch Fetch Rates for Alternative Costing Methods (Last, Max, Min) & Fallbacks
        $costRatesMap = [];
        try {
            $piUnitRateExpr = "CASE WHEN pii.quantity > 0 THEN ROUND(({$piAmtExpr}) / pii.quantity, 4) ELSE pii.rate END";
            $stmtRates = $pdo->query("
                SELECT pii.item_coa_id as item_id,
                       MAX({$piUnitRateExpr}) as max_rate,
                       MIN(NULLIF({$piUnitRateExpr}, 0)) as min_rate,
                       SUBSTRING_INDEX(GROUP_CONCAT(NULLIF({$piUnitRateExpr}, 0) ORDER BY pi.invoice_date DESC, pi.id DESC), ',', 1) as last_rate
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pi.invoice_date <= '$endDate'
                  AND pii.item_coa_id IN ($idList) AND (({$piAmtExpr}) > 0 OR pii.rate > 0)
                GROUP BY pii.item_coa_id
            ");
            while ($rRow = $stmtRates->fetch(PDO::FETCH_ASSOC)) {
                $costRatesMap[intval($rRow['item_id'])] = [
                    'last_rate' => floatval($rRow['last_rate']),
                    'max_rate' => floatval($rRow['max_rate']),
                    'min_rate' => floatval($rRow['min_rate'])
                ];
            }
        } catch (Exception $e) {}

        // Also fetch rates from production notes for finished goods
        try {
            $stmtPnRates = $pdo->query("
                SELECT pp.item_id,
                       MAX(pp.rate) as max_rate,
                       MIN(NULLIF(pp.rate, 0)) as min_rate,
                       SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(pp.rate, 0) ORDER BY p.date DESC, p.id DESC), ',', 1) as last_rate
                FROM production_note_items pp
                JOIN production_notes p ON pp.pn_id = p.id
                WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND p.date <= '$endDate'
                  AND pp.item_id IN ($idList) AND pp.rate > 0
                GROUP BY pp.item_id
            ");
            while ($rRow = $stmtPnRates->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($rRow['item_id']);
                if (!isset($costRatesMap[$iid])) {
                    $costRatesMap[$iid] = [
                        'last_rate' => floatval($rRow['last_rate']),
                        'max_rate' => floatval($rRow['max_rate']),
                        'min_rate' => floatval($rRow['min_rate'])
                    ];
                }
            }
        } catch (Exception $e) {}

        // Sale Invoice weighted average rates fallback (for Finished Goods without PN/Purchase cost)
        $siRateMap = [];
        try {
            $siUnitRateExpr = "CASE WHEN sii.quantity > 0 THEN ROUND(({$siAmtExpr}) / sii.quantity, 4) ELSE sii.rate END";
            $stmtSiRates = $pdo->query("
                SELECT sii.item_coa_id as item_id,
                       COALESCE(SUM(sii.quantity), 0) as qty,
                       COALESCE(SUM({$siAmtExpr}), 0) as total_amt,
                       MAX({$siUnitRateExpr}) as max_rate,
                       MIN(NULLIF({$siUnitRateExpr}, 0)) as min_rate,
                       SUBSTRING_INDEX(GROUP_CONCAT(NULLIF({$siUnitRateExpr}, 0) ORDER BY si.invoice_date DESC, si.id DESC), ',', 1) as last_rate
                FROM sale_invoice_items sii
                JOIN sale_invoices si ON sii.invoice_id = si.id
                WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 AND si.invoice_date <= '$endDate'
                  AND sii.item_coa_id IN ($idList) AND (({$siAmtExpr}) > 0 OR sii.rate > 0)
                GROUP BY sii.item_coa_id
            ");
            while ($rRow = $stmtSiRates->fetch(PDO::FETCH_ASSOC)) {
                $q = floatval($rRow['qty']);
                $a = floatval($rRow['total_amt']);
                if ($q > 0 && $a > 0) {
                    $siRateMap[intval($rRow['item_id'])] = [
                        'avg_rate' => $a / $q,
                        'last_rate' => floatval($rRow['last_rate'] ?: ($a / $q)),
                        'max_rate' => floatval($rRow['max_rate'] ?: ($a / $q)),
                        'min_rate' => floatval($rRow['min_rate'] ?: ($a / $q))
                    ];
                }
            }
        } catch (Exception $e) {}

        // Company average Raw Material purchase rate per Kg (Raw Material categories prioritized)
        $avgRawRatePerKg = 240.0;
        try {
            $qRawAvg = $pdo->query("
                SELECT COALESCE(SUM(pii.quantity), 0) as qty,
                       COALESCE(SUM({$piAmtExpr}), 0) as amt
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                LEFT JOIN inv_items it ON pii.item_coa_id = it.id
                LEFT JOIN inv_sub_categories sc ON it.sub_id = sc.id
                LEFT JOIN inv_main_categories mc ON sc.main_id = mc.id
                WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pi.invoice_date <= '$endDate'
                  AND (({$piAmtExpr}) > 0 OR pii.rate > 0)
                  AND (UPPER(COALESCE(it.category_type, '')) LIKE '%RAW%' OR UPPER(COALESCE(mc.name, '')) LIKE '%RAW%')
            ");
            $rawAvgRow = $qRawAvg->fetch(PDO::FETCH_ASSOC);
            if (!$rawAvgRow || floatval($rawAvgRow['qty']) <= 0 || floatval($rawAvgRow['amt']) <= 0) {
                $qRawAvgFb = $pdo->query("
                    SELECT COALESCE(SUM(pii.quantity), 0) as qty,
                           COALESCE(SUM({$piAmtExpr}), 0) as amt
                    FROM purchase_invoice_items pii
                    JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                    WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pi.invoice_date <= '$endDate'
                      AND (({$piAmtExpr}) > 0 OR pii.rate > 0)
                ");
                $rawAvgRow = $qRawAvgFb->fetch(PDO::FETCH_ASSOC);
            }
            if ($rawAvgRow && floatval($rawAvgRow['qty']) > 0 && floatval($rawAvgRow['amt']) > 0) {
                $avgRawRatePerKg = round(floatval($rawAvgRow['amt']) / floatval($rawAvgRow['qty']), 2);
            }
        } catch (Exception $e) {}

        // 6. Compile Rows with Unit Conversion and Costing Method Evaluation
        $rows = [];
        $totalOpeningQty = 0;
        $totalOpeningVal = 0;
        $totalPurchasesQty = 0;
        $totalPurchasesVal = 0;
        $totalAvailableQty = 0;
        $totalAvailableVal = 0;
        $totalConsumptionQty = 0;
        $totalConsumptionVal = 0;
        $totalClosingQty = 0;
        $totalClosingVal = 0;

        $sr = 1;
        foreach ($itemsToProcess as $item) {
            $itemId = intval($item['id']);
            $defaultPrice = floatval($item['default_purchase_price'] ?? 0);
            $valCost = floatval($item['valuation_cost'] ?? 0);
            $sellPrice = floatval($item['selling_price'] ?? 0);
            $baseUnit = strtoupper(trim($item['unit'] ?? 'KG'));
            $catTypeUp = strtoupper(trim($item['category_type'] ?? ''));
            $mainCatUp = strtoupper(trim($item['category_name'] ?? ''));
            $nameUp = strtoupper(trim($item['name'] ?? ''));
            $isRawItem = ($catTypeUp === 'RAW MATERIAL' || strpos($catTypeUp, 'RAW') !== false || strpos($mainCatUp, 'RAW') !== false);

            // Unit factor from Chart of Inventory (e.g. 25 kg bag, 50 kg bag, etc.)
            $unitFactor = floatval($item['unit_weight'] ?? 0);
            if ($unitFactor <= 0) $unitFactor = floatval($item['qty_per_piece'] ?? 0);
            if ($unitFactor <= 0) $unitFactor = floatval($item['carton'] ?? 0);
            if ($unitFactor <= 0) $unitFactor = 25.0; // standard bag weight

            // Master rate & multi-tier fallback for items without purchase/production amounts
            $masterRate = $valCost > 0 ? $valCost : $defaultPrice;
            $fallbackRate = floatval($costRatesMap[$itemId]['last_rate'] ?? 0);
            if ($fallbackRate <= 0) $fallbackRate = floatval($obMap[$itemId]['rate'] ?? 0);
            if ($fallbackRate <= 0) $fallbackRate = $masterRate;
            if ($fallbackRate <= 0) $fallbackRate = floatval($siRateMap[$itemId]['avg_rate'] ?? 0);
            if ($fallbackRate <= 0) $fallbackRate = $sellPrice;
            if ($fallbackRate <= 0 && !$isRawItem && $avgRawRatePerKg > 0) {
                if (in_array($baseUnit, ['KG', 'KGS'])) {
                    $fallbackRate = $avgRawRatePerKg;
                } else {
                    $wt = floatval($item['unit_weight'] ?? 0);
                    if ($wt <= 0) $wt = floatval($item['qty_per_piece'] ?? 0);
                    if ($wt <= 0 && preg_match('/(\d+(?:\.\d+)?)\s*kg/i', $item['name'] ?? '', $mMatch)) {
                        $wt = floatval($mMatch[1]);
                    }
                    if ($wt <= 0) {
                        if (strpos($nameUp, '4"') !== false) $wt = 0.400;
                        elseif (strpos($nameUp, '3"') !== false) $wt = 0.300;
                        elseif (strpos($nameUp, '2"') !== false) $wt = 0.200;
                        elseif (strpos($nameUp, '1.5"') !== false) $wt = 0.150;
                        elseif (strpos($nameUp, '1.25"') !== false) $wt = 0.125;
                        elseif (strpos($nameUp, '1"') !== false) $wt = 0.100;
                    }
                    $fallbackRate = ($wt > 0) ? round($wt * $avgRawRatePerKg, 2) : $avgRawRatePerKg;
                }
            }

            // Base Quantities & Values
            $initialObQty = floatval($obMap[$itemId]['qty'] ?? 0);
            $initialObRate = floatval($obMap[$itemId]['rate'] ?? 0) ?: $fallbackRate;
            $initialObVal = $initialObQty * $initialObRate;

            $hpQty = floatval($histPurchases[$itemId]['qty'] ?? 0);
            $hpVal = floatval($histPurchases[$itemId]['amount'] ?? 0);
            $hpUnvaluedQty = floatval($histPurchases[$itemId]['unvalued_qty'] ?? 0);
            if ($hpUnvaluedQty > 0) {
                $valuedHpQty = max(0, $hpQty - $hpUnvaluedQty);
                $histDenomQty = $initialObQty + $valuedHpQty;
                $histUnvaluedRate = ($histDenomQty > 0 && ($initialObVal + $hpVal) > 0)
                    ? (($initialObVal + $hpVal) / $histDenomQty)
                    : $fallbackRate;
                if ($histUnvaluedRate > 0) {
                    $hpVal += $hpUnvaluedQty * $histUnvaluedRate;
                }
            }
            if ($hpQty > 0 && $hpVal <= 0 && $fallbackRate > 0) {
                $hpVal = $hpQty * $fallbackRate;
            }

            $histAvailableQty = max(0, $initialObQty + $hpQty);
            $histAvailableVal = ($histAvailableQty > 0) ? max(0, $initialObVal + $hpVal) : 0;
            $histAvgCost = ($histAvailableQty > 0 && $histAvailableVal > 0) ? ($histAvailableVal / $histAvailableQty) : $fallbackRate;

            $hcQty = floatval($histConsumptionQty[$itemId] ?? 0);
            $baseOpeningQty = max(0, $histAvailableQty - $hcQty);
            $baseOpeningVal = $baseOpeningQty * $histAvgCost;

            $basePurchasesQty = floatval($periodPurchases[$itemId]['qty'] ?? 0);
            $basePurchasesVal = floatval($periodPurchases[$itemId]['amount'] ?? 0);
            $ppUnvaluedQty = floatval($periodPurchases[$itemId]['unvalued_qty'] ?? 0);
            $effPeriodFallback = $histAvgCost ?: $fallbackRate;

            if ($ppUnvaluedQty > 0) {
                $valuedPpQty = max(0, $basePurchasesQty - $ppUnvaluedQty);
                $ppUnvaluedRate = ($valuedPpQty > 0 && $basePurchasesVal > 0)
                    ? ($basePurchasesVal / $valuedPpQty)
                    : $effPeriodFallback;
                if ($ppUnvaluedRate > 0) {
                    $basePurchasesVal += $ppUnvaluedQty * $ppUnvaluedRate;
                }
            }
            if ($basePurchasesQty > 0 && $basePurchasesVal <= 0 && $effPeriodFallback > 0) {
                $basePurchasesVal = $basePurchasesQty * $effPeriodFallback;
            }

            $baseAvailQty = max(0, $baseOpeningQty + $basePurchasesQty);
            $baseAvailVal = ($baseAvailQty > 0) ? max(0, $baseOpeningVal + $basePurchasesVal) : 0;

            // Determine Applicable Unit Rate based on Costing Method
            $weightedAvg = ($baseAvailQty > 0 && $baseAvailVal > 0) ? ($baseAvailVal / $baseAvailQty) : ($histAvgCost ?: $fallbackRate);
            $lastPurchaseRate = floatval($costRatesMap[$itemId]['last_rate'] ?? 0) ?: (floatval($siRateMap[$itemId]['last_rate'] ?? 0) ?: ($fallbackRate ?: $weightedAvg));
            $maxPurchaseRate = floatval($costRatesMap[$itemId]['max_rate'] ?? 0) ?: (floatval($siRateMap[$itemId]['max_rate'] ?? 0) ?: ($fallbackRate ?: $weightedAvg));
            $minPurchaseRate = floatval($costRatesMap[$itemId]['min_rate'] ?? 0) ?: (floatval($siRateMap[$itemId]['min_rate'] ?? 0) ?: ($fallbackRate ?: $weightedAvg));
            $effMasterRate = ($masterRate > 0 ? $masterRate : $fallbackRate) ?: $weightedAvg;

            $applicableRate = $weightedAvg;
            if ($costing_method === 'last_purchase') {
                $applicableRate = $lastPurchaseRate;
            } elseif ($costing_method === 'max_purchase') {
                $applicableRate = $maxPurchaseRate;
            } elseif ($costing_method === 'min_purchase') {
                $applicableRate = $minPurchaseRate;
            } elseif ($costing_method === 'master_rate') {
                $applicableRate = $effMasterRate;
            } elseif ($costing_method === 'fifo') {
                $applicableRate = $weightedAvg; // standard weighted FIFO
            }

            $baseConsumptionQty = floatval($periodConsumptionQty[$itemId] ?? 0);
            $baseConsumptionVal = $baseConsumptionQty * $applicableRate;

            $baseClosingQty = max(0, $baseAvailQty - $baseConsumptionQty);
            $baseClosingVal = $baseClosingQty * $applicableRate;

            // Zero balance filter
            if (!$show_zero && $baseOpeningQty == 0 && $basePurchasesQty == 0 && $baseConsumptionQty == 0 && $baseClosingQty == 0) {
                continue;
            }

            // Apply Unit Conversion
            $displayUnit = $baseUnit;
            $dispOpeningQty = $baseOpeningQty;
            $dispPurchasesQty = $basePurchasesQty;
            $dispAvailQty = $baseAvailQty;
            $dispConsumptionQty = $baseConsumptionQty;
            $dispClosingQty = $baseClosingQty;
            $dispRate = $applicableRate;

            if ($view_unit === 'bags') {
                // If base is in KG, convert KG -> Bags
                if (strpos($baseUnit, 'BAG') === false && $unitFactor > 0) {
                    $dispOpeningQty = $baseOpeningQty / $unitFactor;
                    $dispPurchasesQty = $basePurchasesQty / $unitFactor;
                    $dispAvailQty = $baseAvailQty / $unitFactor;
                    $dispConsumptionQty = $baseConsumptionQty / $unitFactor;
                    $dispClosingQty = $baseClosingQty / $unitFactor;
                    $dispRate = $applicableRate * $unitFactor; // Rate per Bag
                }
                $displayUnit = 'BAGS';
            } elseif ($view_unit === 'kg') {
                // If base is in Bags, convert Bags -> KG
                if (strpos($baseUnit, 'BAG') !== false && $unitFactor > 0) {
                    $dispOpeningQty = $baseOpeningQty * $unitFactor;
                    $dispPurchasesQty = $basePurchasesQty * $unitFactor;
                    $dispAvailQty = $baseAvailQty * $unitFactor;
                    $dispConsumptionQty = $baseConsumptionQty * $unitFactor;
                    $dispClosingQty = $baseClosingQty * $unitFactor;
                    $dispRate = $applicableRate / $unitFactor; // Rate per KG
                }
                $displayUnit = 'KG';
            } elseif ($view_unit === 'ltr') {
                $displayUnit = 'LTR';
            }

            // Accumulate totals
            $totalOpeningQty += $dispOpeningQty;
            $totalOpeningVal += $baseOpeningVal;
            $totalPurchasesQty += $dispPurchasesQty;
            $totalPurchasesVal += $basePurchasesVal;
            $totalAvailableQty += $dispAvailQty;
            $totalAvailableVal += $baseAvailVal;
            $totalConsumptionQty += $dispConsumptionQty;
            $totalConsumptionVal += $baseConsumptionVal;
            $totalClosingQty += $dispClosingQty;
            $totalClosingVal += $baseClosingVal;

            $rows[] = [
                'sr' => $sr++,
                'item_id' => $itemId,
                'item_code' => $item['code'] ?? '',
                'raw_material' => $item['name'] ?? '',
                'unit' => $displayUnit,
                'base_unit' => $baseUnit,
                'unit_factor' => $unitFactor,
                'opening_qty' => $dispOpeningQty,
                'opening_val' => $baseOpeningVal,
                'purchases_qty' => $dispPurchasesQty,
                'purchases_val' => $basePurchasesVal,
                'total_avail_qty' => $dispAvailQty,
                'total_avail_val' => $baseAvailVal,
                'consumption_qty' => $dispConsumptionQty,
                'consumption_val' => $baseConsumptionVal,
                'closing_qty' => $dispClosingQty,
                'closing_val' => $baseClosingVal,
                'average_cost' => $dispRate
            ];
        }

        // Summary calculations
        $periodSummary = [
            'prev_period_label' => $prevDateLabel,
            'current_period_label' => $currentPeriodLabel,
            'next_period_label' => $nextDateLabel,
            'display_unit' => ($view_unit === 'bags') ? 'BAGS' : (($view_unit === 'kg') ? 'KG' : 'UNITS'),
            'opening_value' => $totalOpeningVal,
            'purchase_value' => $totalPurchasesVal,
            'available_value' => $totalAvailableVal,
            'consumption_value' => $totalConsumptionVal,
            'closing_value' => $totalClosingVal,
            'carry_forward' => [
                'prev_closing_qty' => $totalOpeningQty,
                'prev_closing_val' => $totalOpeningVal,
                'cur_opening_qty' => $totalOpeningQty,
                'cur_opening_val' => $totalOpeningVal,
                'cur_closing_qty' => $totalClosingQty,
                'cur_closing_val' => $totalClosingVal,
                'next_opening_qty' => $totalClosingQty,
                'next_opening_val' => $totalClosingVal
            ]
        ];

        $totals = [
            'opening_qty' => $totalOpeningQty,
            'opening_val' => $totalOpeningVal,
            'purchases_qty' => $totalPurchasesQty,
            'purchases_val' => $totalPurchasesVal,
            'total_avail_qty' => $totalAvailableQty,
            'total_avail_val' => $totalAvailableVal,
            'consumption_qty' => $totalConsumptionQty,
            'consumption_val' => $totalConsumptionVal,
            'closing_qty' => $totalClosingQty,
            'closing_val' => $totalClosingVal,
            'avg_cost' => ($totalAvailableQty > 0) ? ($totalAvailableVal / $totalAvailableQty) : 0
        ];

        // Fetch Company Profile from Database
        $compRow = [];
        try {
            $cStmt = $pdo->prepare("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies WHERE id = ?");
            $cStmt->execute([$company_id]);
            $compRow = $cStmt->fetch(PDO::FETCH_ASSOC);
            if (!$compRow) {
                $cStmt2 = $pdo->query("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies ORDER BY id ASC LIMIT 1");
                $compRow = $cStmt2->fetch(PDO::FETCH_ASSOC) ?: [];
            }
        } catch (Exception $ce) {}

        echo json_encode([
            'status' => 'success',
            'tax_mode' => $taxMode,
            'tax_mode_label' => $taxModeLabel,
            'company' => $compRow,
            'rows' => $rows,
            'totals' => $totals,
            'period_summary' => $periodSummary,
            'count' => count($rows)
        ]);

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['status' => 'error', 'error' => 'Invalid action']);
