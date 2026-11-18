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

        // Raw Material Items with unit conversion factors from Chart of Inventory
        $stmtItems = $pdo->prepare("
            SELECT i.id, i.code, i.name, i.unit, i.purchase_price, i.category_type,
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton,
                   sc.main_id as category_id, mc.name as category_name
            FROM inv_items i
            LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
            LEFT JOIN inv_main_categories mc ON sc.main_id = mc.id
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
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton,
                   i.category_type, sc.main_id as category_id, mc.name as category_name
            FROM inv_items i
            LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
            LEFT JOIN inv_main_categories mc ON sc.main_id = mc.id
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
        ";
        $itemParams = [$company_id];

        if ($item_filter !== 'all' && intval($item_filter) > 0) {
            $itemSql .= " AND i.id = ?";
            $itemParams[] = intval($item_filter);
        }

        if ($category_filter !== 'all' && intval($category_filter) > 0) {
            $itemSql .= " AND sc.main_id = ?";
            $itemParams[] = intval($category_filter);
        }

        $itemSql .= " ORDER BY i.name ASC";
        $stmtItems = $pdo->prepare($itemSql);
        $stmtItems->execute($itemParams);
        $candidateItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        // Filter for Raw Materials if no specific category or item filter is selected
        $itemsToProcess = [];
        if ($item_filter === 'all' && $category_filter === 'all') {
            foreach ($candidateItems as $it) {
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
                    $itemsToProcess[] = $it;
                }
            }
        }

        if (empty($itemsToProcess)) {
            $itemsToProcess = $candidateItems;
        }

        if (empty($itemsToProcess)) {
            echo json_encode([
                'status' => 'success',
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
                SELECT item_id, SUM(quantity) as ob_qty, AVG(rate) as ob_rate
                FROM inv_opening_balances 
                WHERE company_id = $company_id AND item_id IN ($idList)
                GROUP BY item_id
            ");
            while ($row = $stmtOB->fetch(PDO::FETCH_ASSOC)) {
                $obMap[intval($row['item_id'])] = [
                    'qty' => floatval($row['ob_qty']),
                    'rate' => floatval($row['ob_rate'])
                ];
            }
        } catch (Exception $e) {}

        // 3. Historical Inflow/Outflow BEFORE $startDate to calculate previous period closing
        $histPurchases = [];
        $stmtHP = $pdo->query("
            SELECT pii.item_coa_id as item_id, SUM(pii.quantity) as qty, SUM(pii.net_amount) as amount
            FROM purchase_invoice_items pii
            JOIN purchase_invoices pi ON pii.invoice_id = pi.id
            WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.invoice_date < '$startDate'
              AND pii.item_coa_id IN ($idList)
            GROUP BY pii.item_coa_id
        ");
        while ($row = $stmtHP->fetch(PDO::FETCH_ASSOC)) {
            $histPurchases[intval($row['item_id'])] = [
                'qty' => floatval($row['qty']),
                'amount' => floatval($row['amount'])
            ];
        }

        // Purchase returns before start date
        try {
            $stmtHPR = $pdo->query("
                SELECT pri.item_coa_id as item_id, SUM(pri.quantity) as qty, SUM(pri.net_amount) as amount
                FROM purchase_return_items pri
                JOIN purchase_returns pr ON pri.return_id = pr.id
                WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.return_date < '$startDate'
                  AND pri.item_coa_id IN ($idList)
                GROUP BY pri.item_coa_id
            ");
            while ($row = $stmtHPR->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                if (isset($histPurchases[$iid])) {
                    $histPurchases[$iid]['qty'] -= floatval($row['qty']);
                    $histPurchases[$iid]['amount'] -= floatval($row['amount']);
                }
            }
        } catch (Exception $e) {}

        // Consumption before start date
        $histConsumptionQty = [];

        // Material Issue Notes before start date
        try {
            $stmtHMIN = $pdo->query("
                SELECT mii.item_id, SUM(mii.qty) as qty
                FROM material_issue_note_items mii
                JOIN material_issue_notes m ON mii.min_id = m.id
                WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.date < '$startDate'
                  AND mii.item_id IN ($idList)
                GROUP BY mii.item_id
            ");
            while ($row = $stmtHMIN->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                $histConsumptionQty[$iid] = ($histConsumptionQty[$iid] ?? 0) + floatval($row['qty']);
            }
        } catch (Exception $e) {}

        // Production Notes consumption before start date (qty < 0)
        try {
            $stmtHPN = $pdo->query("
                SELECT pp.item_id, SUM(ABS(pp.qty)) as qty
                FROM production_note_items pp
                JOIN production_notes p ON pp.pn_id = p.id
                WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.date < '$startDate' AND pp.qty < 0
                  AND pp.item_id IN ($idList)
                GROUP BY pp.item_id
            ");
            while ($row = $stmtHPN->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                $histConsumptionQty[$iid] = ($histConsumptionQty[$iid] ?? 0) + floatval($row['qty']);
            }
        } catch (Exception $e) {}

        // Direct Sales before start date
        try {
            $stmtHSI = $pdo->query("
                SELECT sii.item_coa_id as item_id, SUM(sii.quantity) as qty
                FROM sale_invoice_items sii
                JOIN sale_invoices si ON sii.sale_invoice_id = si.id
                WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.invoice_date < '$startDate'
                  AND sii.item_coa_id IN ($idList)
                GROUP BY sii.item_coa_id
            ");
            while ($row = $stmtHSI->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                $histConsumptionQty[$iid] = ($histConsumptionQty[$iid] ?? 0) + floatval($row['qty']);
            }
        } catch (Exception $e) {}

        // 4. Current Period Transactions ($startDate to $endDate)
        $periodPurchases = [];
        $supplierCondition = ($supplier_filter !== 'all' && intval($supplier_filter) > 0) ? " AND pi.vendor_coa_id = " . intval($supplier_filter) : "";
        $stmtPP = $pdo->query("
            SELECT pii.item_coa_id as item_id, SUM(pii.quantity) as qty, SUM(pii.net_amount) as amount
            FROM purchase_invoice_items pii
            JOIN purchase_invoices pi ON pii.invoice_id = pi.id
            WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 
              AND pi.invoice_date BETWEEN '$startDate' AND '$endDate'
              AND pii.item_coa_id IN ($idList) $supplierCondition
            GROUP BY pii.item_coa_id
        ");
        while ($row = $stmtPP->fetch(PDO::FETCH_ASSOC)) {
            $periodPurchases[intval($row['item_id'])] = [
                'qty' => floatval($row['qty']),
                'amount' => floatval($row['amount'])
            ];
        }

        // Purchase returns during period
        try {
            $stmtPPR = $pdo->query("
                SELECT pri.item_coa_id as item_id, SUM(pri.quantity) as qty, SUM(pri.net_amount) as amount
                FROM purchase_return_items pri
                JOIN purchase_returns pr ON pri.return_id = pr.id
                WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 
                  AND pr.return_date BETWEEN '$startDate' AND '$endDate'
                  AND pri.item_coa_id IN ($idList)
                GROUP BY pri.item_coa_id
            ");
            while ($row = $stmtPPR->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                if (isset($periodPurchases[$iid])) {
                    $periodPurchases[$iid]['qty'] -= floatval($row['qty']);
                    $periodPurchases[$iid]['amount'] -= floatval($row['amount']);
                }
            }
        } catch (Exception $e) {}

        // Current Period Consumption
        $periodConsumptionQty = [];

        // MIN during period
        try {
            $stmtPMIN = $pdo->query("
                SELECT mii.item_id, SUM(mii.qty) as qty
                FROM material_issue_note_items mii
                JOIN material_issue_notes m ON mii.min_id = m.id
                WHERE m.company_id = $company_id AND m.is_cancelled = 0 
                  AND m.date BETWEEN '$startDate' AND '$endDate'
                  AND mii.item_id IN ($idList)
                GROUP BY mii.item_id
            ");
            while ($row = $stmtPMIN->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                $periodConsumptionQty[$iid] = ($periodConsumptionQty[$iid] ?? 0) + floatval($row['qty']);
            }
        } catch (Exception $e) {}

        // Production Notes during period
        try {
            $stmtPPN = $pdo->query("
                SELECT pp.item_id, SUM(ABS(pp.qty)) as qty
                FROM production_note_items pp
                JOIN production_notes p ON pp.pn_id = p.id
                WHERE p.company_id = $company_id AND p.is_cancelled = 0 
                  AND p.date BETWEEN '$startDate' AND '$endDate' AND pp.qty < 0
                  AND pp.item_id IN ($idList)
                GROUP BY pp.item_id
            ");
            while ($row = $stmtPPN->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                $periodConsumptionQty[$iid] = ($periodConsumptionQty[$iid] ?? 0) + floatval($row['qty']);
            }
        } catch (Exception $e) {}

        // Direct Sales during period
        try {
            $stmtPSI = $pdo->query("
                SELECT sii.item_coa_id as item_id, SUM(sii.quantity) as qty
                FROM sale_invoice_items sii
                JOIN sale_invoices si ON sii.sale_invoice_id = si.id
                WHERE si.company_id = $company_id AND si.is_cancelled = 0 
                  AND si.invoice_date BETWEEN '$startDate' AND '$endDate'
                  AND sii.item_coa_id IN ($idList)
                GROUP BY sii.item_coa_id
            ");
            while ($row = $stmtPSI->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($row['item_id']);
                $periodConsumptionQty[$iid] = ($periodConsumptionQty[$iid] ?? 0) + floatval($row['qty']);
            }
        } catch (Exception $e) {}

        // 5. Batch Fetch Rates for Alternative Costing Methods (Last, Max, Min)
        $costRatesMap = [];
        try {
            $stmtRates = $pdo->query("
                SELECT pii.item_coa_id as item_id,
                       MAX(pii.rate) as max_rate,
                       MIN(NULLIF(pii.rate, 0)) as min_rate,
                       SUBSTRING_INDEX(GROUP_CONCAT(pii.rate ORDER BY pi.invoice_date DESC, pi.id DESC), ',', 1) as last_rate
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.invoice_date <= '$endDate'
                  AND pii.item_coa_id IN ($idList)
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
            $baseUnit = strtoupper(trim($item['unit'] ?? 'KG'));

            // Unit factor from Chart of Inventory (e.g. 25 kg bag, 50 kg bag, etc.)
            $unitFactor = floatval($item['unit_weight'] ?? 0);
            if ($unitFactor <= 0) $unitFactor = floatval($item['qty_per_piece'] ?? 0);
            if ($unitFactor <= 0) $unitFactor = floatval($item['carton'] ?? 0);
            if ($unitFactor <= 0) $unitFactor = 25.0; // standard bag weight

            // Base Quantities & Values
            $initialObQty = floatval($obMap[$itemId]['qty'] ?? 0);
            $initialObRate = floatval($obMap[$itemId]['rate'] ?? $defaultPrice);
            $initialObVal = $initialObQty * $initialObRate;

            $hpQty = floatval($histPurchases[$itemId]['qty'] ?? 0);
            $hpVal = floatval($histPurchases[$itemId]['amount'] ?? 0);

            $histAvailableQty = $initialObQty + $hpQty;
            $histAvailableVal = $initialObVal + $hpVal;
            $histAvgCost = ($histAvailableQty > 0) ? ($histAvailableVal / $histAvailableQty) : ($initialObRate ?: $defaultPrice);

            $hcQty = floatval($histConsumptionQty[$itemId] ?? 0);
            $baseOpeningQty = max(0, $histAvailableQty - $hcQty);
            $baseOpeningVal = $baseOpeningQty * $histAvgCost;

            $basePurchasesQty = floatval($periodPurchases[$itemId]['qty'] ?? 0);
            $basePurchasesVal = floatval($periodPurchases[$itemId]['amount'] ?? 0);

            if ($basePurchasesQty > 0 && $basePurchasesVal <= 0 && $defaultPrice > 0) {
                $basePurchasesVal = $basePurchasesQty * $defaultPrice;
            }

            $baseAvailQty = $baseOpeningQty + $basePurchasesQty;
            $baseAvailVal = $baseOpeningVal + $basePurchasesVal;

            // Determine Applicable Unit Rate based on Costing Method
            $weightedAvg = ($baseAvailQty > 0) ? ($baseAvailVal / $baseAvailQty) : ($histAvgCost ?: $defaultPrice);
            $lastPurchaseRate = floatval($costRatesMap[$itemId]['last_rate'] ?? 0) ?: ($defaultPrice ?: $weightedAvg);
            $maxPurchaseRate = floatval($costRatesMap[$itemId]['max_rate'] ?? 0) ?: ($defaultPrice ?: $weightedAvg);
            $minPurchaseRate = floatval($costRatesMap[$itemId]['min_rate'] ?? 0) ?: ($defaultPrice ?: $weightedAvg);
            $masterRate = $defaultPrice ?: $weightedAvg;

            $applicableRate = $weightedAvg;
            if ($costing_method === 'last_purchase') {
                $applicableRate = $lastPurchaseRate;
            } elseif ($costing_method === 'max_purchase') {
                $applicableRate = $maxPurchaseRate;
            } elseif ($costing_method === 'min_purchase') {
                $applicableRate = $minPurchaseRate;
            } elseif ($costing_method === 'master_rate') {
                $applicableRate = $masterRate;
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
