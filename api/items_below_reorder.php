<?php
require_once 'db_config.php';
require_once 'auth.php';

$action = $_GET['action'] ?? '';
$company_id = (int)($_GET['company_id'] ?? ($_SESSION['company_id'] ?? 1));

function getInventoryMovementSql($pdo, $company_id) {
    // Fetch existing tables to prevent query crash if module hasn't been used yet
    $stmt_tables = $pdo->query("SHOW TABLES");
    $existing_tables = [];
    while ($row = $stmt_tables->fetch(PDO::FETCH_NUM)) {
        $existing_tables[] = $row[0];
    }

    $balance_additions = ["COALESCE(ob.qty, 0)"];
    $joins = [
        "LEFT JOIN (SELECT item_id, SUM(quantity) as qty FROM inv_opening_balances WHERE company_id = $company_id GROUP BY item_id) ob ON i.id = ob.item_id"
    ];

    if (in_array("purchase_invoices", $existing_tables) && in_array("purchase_invoice_items", $existing_tables)) {
        $balance_additions[] = "+ COALESCE(pi_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_coa_id, SUM(quantity) as qty FROM purchase_invoice_items pii JOIN purchase_invoices p ON pii.invoice_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 GROUP BY item_coa_id) pi_items ON i.id = pi_items.item_coa_id";
    }
    if (in_array("purchase_returns", $existing_tables) && in_array("purchase_return_items", $existing_tables)) {
        $balance_additions[] = "- COALESCE(pr_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_coa_id, SUM(quantity) as qty FROM purchase_return_items pri JOIN purchase_returns p ON pri.return_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND p.nature_of_debit_note IN ('Purchase Return (Reduces Inventory)', 'Shortage (Reduces Inventory)') GROUP BY item_coa_id) pr_items ON i.id = pr_items.item_coa_id";
    }
    if (in_array("sale_invoices", $existing_tables) && in_array("sale_invoice_items", $existing_tables)) {
        $balance_additions[] = "- COALESCE(si_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_coa_id, SUM(quantity) as qty FROM sale_invoice_items sii JOIN sale_invoices s ON sii.invoice_id = s.id WHERE s.company_id = $company_id AND s.is_cancelled = 0 GROUP BY item_coa_id) si_items ON i.id = si_items.item_coa_id";
    }
    if (in_array("sale_returns", $existing_tables) && in_array("sale_return_items", $existing_tables)) {
        $balance_additions[] = "+ COALESCE(sr_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_coa_id, SUM(quantity) as qty FROM sale_return_items sri JOIN sale_returns s ON sri.return_id = s.id WHERE s.company_id = $company_id AND s.is_cancelled = 0 GROUP BY item_coa_id) sr_items ON i.id = sr_items.item_coa_id";
    }
    if (in_array("add_inventory_adjustments", $existing_tables) && in_array("add_inventory_adjustment_items", $existing_tables)) {
        $balance_additions[] = "+ COALESCE(aia_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_id, SUM(qty) as qty FROM add_inventory_adjustment_items aii JOIN add_inventory_adjustments a ON aii.adjustment_id = a.id WHERE a.company_id = $company_id AND a.is_cancelled = 0 GROUP BY item_id) aia_items ON i.id = aia_items.item_id";
    }
    if (in_array("reduce_inventory_adjustments", $existing_tables) && in_array("reduce_inventory_adjustment_items", $existing_tables)) {
        $balance_additions[] = "- COALESCE(ria_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_id, SUM(qty) as qty FROM reduce_inventory_adjustment_items rii JOIN reduce_inventory_adjustments r ON rii.adjustment_id = r.id WHERE r.company_id = $company_id AND r.is_cancelled = 0 GROUP BY item_id) ria_items ON i.id = ria_items.item_id";
    }
    if (in_array("material_issue_notes", $existing_tables) && in_array("material_issue_note_items", $existing_tables)) {
        $balance_additions[] = "- COALESCE(min_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_id, SUM(qty) as qty FROM material_issue_note_items mii JOIN material_issue_notes m ON mii.min_id = m.id WHERE m.company_id = $company_id AND m.is_cancelled = 0 GROUP BY item_id) min_items ON i.id = min_items.item_id";
    }
    if (in_array("production_notes", $existing_tables) && in_array("production_note_items", $existing_tables)) {
        $balance_additions[] = "+ COALESCE(pn_items.qty, 0)";
        $joins[] = "LEFT JOIN (SELECT item_id, SUM(qty) as qty FROM production_note_items pni JOIN production_notes p ON pni.pn_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 GROUP BY item_id) pn_items ON i.id = pn_items.item_id";
    }

    $balance_expr = implode(" ", $balance_additions);
    $joins_expr = implode("\n                ", $joins);

    return [$balance_expr, $joins_expr];
}

// Helper: Detect Item Category Group (Raw Material, PVC Pipes, Fittings, Others)
function detectItemGroup($item) {
    $mainName = strtoupper(trim($item['main_category_name'] ?? ''));
    $subName  = strtoupper(trim($item['sub_category_name'] ?? ''));
    $catType  = strtoupper(trim($item['category_type'] ?? $item['main_category_type'] ?? ''));
    $itemName = strtoupper(trim($item['item_name'] ?? $item['name'] ?? ''));
    $itemUnit = strtoupper(trim($item['unit'] ?? ''));

    $combined = "$mainName $subName $catType $itemName $itemUnit";

    // 1. FITTINGS
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
        return 'Fittings';
    }

    // 2. RAW MATERIAL
    if ($catType === 'RAW MATERIAL' ||
        strpos($catType, 'RAW') !== false ||
        strpos($mainName, 'RAW') !== false ||
        strpos($subName, 'RAW') !== false ||
        strpos($combined, 'RAW') !== false ||
        strpos($combined, 'MATERIAL') !== false ||
        strpos($combined, 'RESIN') !== false ||
        strpos($combined, 'CALCIUM') !== false ||
        strpos($combined, 'CARBONATE') !== false ||
        strpos($combined, 'STABILIZER') !== false ||
        strpos($combined, 'TITANIUM') !== false ||
        strpos($combined, 'LUBRICANT') !== false ||
        strpos($combined, 'COMPOUND') !== false ||
        strpos($combined, 'PIGMENT') !== false ||
        strpos($combined, 'WAX') !== false ||
        strpos($combined, 'CHEMICAL') !== false ||
        strpos($combined, 'POLYMER') !== false ||
        strpos($combined, 'MASTERBATCH') !== false ||
        strpos($combined, 'AU60') !== false ||
        strpos($combined, 'AU67') !== false ||
        strpos($itemUnit, 'BAG') !== false) {
        return 'Raw Material';
    }

    // 3. PVC PIPES
    if ($catType === 'PIPES' ||
        strpos($mainName, 'PIPE') !== false ||
        strpos($combined, 'PIPE') !== false ||
        (strpos($combined, 'PVC') !== false && strpos($combined, 'FITTING') === false)) {
        return 'PVC Pipes';
    }

    return 'Others';
}

// 1. GET ALERTS (Summary & Alert Items for Main Dashboard)
if ($action === 'get_alerts') {
    try {
        list($balance_expr, $joins_expr) = getInventoryMovementSql($pdo, $company_id);

        $sql = "
            SELECT 
                i.id as item_id,
                i.code as item_code,
                i.name as item_name,
                i.unit as unit,
                COALESCE(i.purchase_price, 0) as purchase_price,
                COALESCE(i.selling_price, 0) as selling_price,
                COALESCE(i.order_qty, 0) as re_order_qty,
                COALESCE(i.category_type, '') as category_type,
                COALESCE(i.carton, 0) as carton,
                COALESCE(i.unit_weight, 0) as unit_weight,
                COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                COALESCE(sm.name, '') as main_category_name,
                COALESCE(sm.category_type, '') as main_category_type,
                COALESCE(ss.name, '') as sub_category_name,
                ($balance_expr) as balance_in_hand
            FROM inv_items i
            LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
            LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
            $joins_expr
            WHERE i.company_id = $company_id AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY i.code ASC
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $allItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalItems = count($allItems);
        $lowStockCount = 0;
        $reorderCount = 0;
        $outOfStockCount = 0;
        $totalStockValue = 0.0;
        $alertItems = [];

        // Raw Material & Finished Goods Accumulators
        $rawBags = 0.0;
        $rawKg = 0.0;
        $rawValuation = 0.0;
        $rawMaterialItemList = [];

        $pipesPcs = 0.0;
        $pipesKg = 0.0;
        $fittingsCtn = 0.0;
        $fittingsPcs = 0.0;
        $fgValuation = 0.0;

        foreach ($allItems as $it) {
            $bal = floatval($it['balance_in_hand']);
            $reorder = floatval($it['re_order_qty']);
            $cost = floatval($it['purchase_price']);
            if ($cost <= 0) $cost = floatval($it['selling_price']);

            if ($bal > 0) {
                $totalStockValue += ($bal * $cost);
            }

            $isOutOfStock = ($bal <= 0);
            $isLowStock = ($reorder > 0 && $bal <= $reorder);

            if ($isOutOfStock) {
                $outOfStockCount++;
            }
            if ($isLowStock) {
                $lowStockCount++;
            }

            if ($isLowStock || $isOutOfStock) {
                $reorderCount++;
                $alertItems[] = [
                    'id' => (int)$it['item_id'],
                    'item_id' => (int)$it['item_id'],
                    'code' => $it['item_code'],
                    'name' => $it['item_name'],
                    'unit' => $it['unit'] ?: 'Pcs',
                    'balance' => round($bal, 2),
                    'reorder_level' => round($reorder, 2),
                    'cost' => round($cost, 2),
                    'is_out_of_stock' => $isOutOfStock,
                    'is_low_stock' => $isLowStock,
                    'status' => $isOutOfStock ? 'Out of Stock' : 'Low Stock'
                ];
            }

            // Categorize into Raw Material or Finished Goods (Pipes / Fittings)
            $grp = detectItemGroup($it);
            if ($grp === 'Raw Material') {
                $unitStr = strtoupper(trim($it['unit'] ?: 'KG'));
                $weightPerBag = floatval($it['unit_weight'] ?: ($it['qty_per_piece'] ?: 25.0));

                $itemKg = 0.0;
                if (stripos($unitStr, 'BAG') !== false) {
                    $itemKg = ($bal * $weightPerBag);
                    $rawBags += $bal;
                } else {
                    $itemKg = $bal;
                    $rawBags += ($weightPerBag > 0 ? ($bal / $weightPerBag) : $bal);
                }
                $rawKg += $itemKg;
                if ($itemKg > 0) $rawValuation += ($itemKg * $cost);

                $rawMaterialItemList[] = [
                    'id' => (int)$it['item_id'],
                    'code' => $it['item_code'],
                    'name' => $it['item_name'],
                    'stock_kg' => round($itemKg, 1),
                    'cost' => round($cost, 2),
                    'is_low' => ($itemKg <= 0 || ($reorder > 0 && $itemKg <= $reorder))
                ];
            } elseif ($grp === 'PVC Pipes') {
                $pipesPcs += $bal;
                $pWeight = floatval($it['unit_weight'] ?: ($it['qty_per_piece'] ?: 0));
                $pipesKg += ($bal * $pWeight);
                if ($bal > 0) $fgValuation += ($bal * $cost);
            } elseif ($grp === 'Fittings') {
                $pcsPerCtn = floatval($it['carton'] ?: ($it['qty_per_piece'] ?: 1));
                if ($pcsPerCtn <= 0) $pcsPerCtn = 1;
                $fittingsCtn += ($bal / $pcsPerCtn);
                $fittingsPcs += $bal;
                if ($bal > 0) $fgValuation += ($bal * $cost);
            } else {
                // Other finished goods
                if ($bal > 0) $fgValuation += ($bal * $cost);
            }
        }

        // Sort Raw Materials alphabetically
        usort($rawMaterialItemList, function($a, $b) {
            return strcasecmp($a['name'], $b['name']);
        });

        // Today's Activity (Issued & Produced)
        $todayStr = date('Y-m-d');
        $todayRawIssued = 0.0;
        $todayFgProduced = 0.0;

        try {
            $stmt_tables = $pdo->query("SHOW TABLES");
            $tables = [];
            while ($row = $stmt_tables->fetch(PDO::FETCH_NUM)) { $tables[] = $row[0]; }

            // 1. Today Raw Issued
            if (in_array("material_issue_notes", $tables) && in_array("material_issue_note_items", $tables)) {
                $sMin = $pdo->prepare("
                    SELECT COALESCE(SUM(mii.qty), 0) 
                    FROM material_issue_note_items mii 
                    JOIN material_issue_notes m ON mii.min_id = m.id 
                    WHERE m.company_id = ? AND m.is_cancelled = 0 AND DATE(m.date) = ?
                ");
                $sMin->execute([$company_id, $todayStr]);
                $todayRawIssued += floatval($sMin->fetchColumn() ?: 0);
            }
            if (in_array("production_notes", $tables) && in_array("production_note_items", $tables)) {
                $sPnRaw = $pdo->prepare("
                    SELECT COALESCE(SUM(ABS(pni.qty)), 0) 
                    FROM production_note_items pni 
                    JOIN production_notes p ON pni.pn_id = p.id 
                    WHERE p.company_id = ? AND p.is_cancelled = 0 AND pni.qty < 0 AND DATE(p.date) = ?
                ");
                $sPnRaw->execute([$company_id, $todayStr]);
                $todayRawIssued += floatval($sPnRaw->fetchColumn() ?: 0);

                // 2. Today Finished Goods Produced
                $sPnFg = $pdo->prepare("
                    SELECT COALESCE(SUM(pni.qty), 0) 
                    FROM production_note_items pni 
                    JOIN production_notes p ON pni.pn_id = p.id 
                    WHERE p.company_id = ? AND p.is_cancelled = 0 AND pni.qty > 0 AND DATE(p.date) = ?
                ");
                $sPnFg->execute([$company_id, $todayStr]);
                $todayFgProduced = floatval($sPnFg->fetchColumn() ?: 0);
            }
        } catch(Exception $eActs) {}

        // Sort alert items: Out of Stock first, then lowest balance
        usort($alertItems, function($a, $b) {
            if ($a['is_out_of_stock'] && !$b['is_out_of_stock']) return -1;
            if (!$a['is_out_of_stock'] && $b['is_out_of_stock']) return 1;
            return $a['balance'] <=> $b['balance'];
        });

        sendResponse([
            'status' => 'success',
            'summary' => [
                'total_items' => $totalItems,
                'low_stock_count' => $lowStockCount,
                'reorder_count' => $reorderCount,
                'out_of_stock_count' => $outOfStockCount,
                'total_stock_value' => round($totalStockValue, 2),
                'raw_material' => [
                    'total_kg' => round($rawKg, 1),
                    'kg' => round($rawKg, 1),
                    'today_issued_kg' => round($todayRawIssued, 1),
                    'valuation' => round($rawValuation, 2),
                    'items' => $rawMaterialItemList
                ],
                'finished_goods' => [
                    'pipes_pcs' => round($pipesPcs, 0),
                    'pipes_kg' => round($pipesKg, 1),
                    'fittings_ctn' => round($fittingsCtn, 0),
                    'fittings_pcs' => round($fittingsPcs, 0),
                    'today_produced' => round($todayFgProduced, 0),
                    'valuation' => round($fgValuation, 2)
                ]
            ],
            'items' => $alertItems
        ]);
    } catch (Exception $e) {
        sendResponse(['status' => 'error', 'error' => $e->getMessage()]);
    }
}

// 2. GET REPORT (Full tabular report for Items Below Re-Order Level)
if ($action === 'get_report') {
    $show_all = isset($_GET['show_all']) && $_GET['show_all'] == 1;
    $hide_zero_reorder = isset($_GET['hide_zero_reorder']) && $_GET['hide_zero_reorder'] == 1;

    try {
        list($balance_expr, $joins_expr) = getInventoryMovementSql($pdo, $company_id);

        $sql = "
            SELECT * FROM (
                SELECT 
                    i.id as item_id,
                    i.code as item_code,
                    i.name as item_name,
                    i.unit as unit,
                    COALESCE(i.order_qty, 0) as re_order_qty,
                    ($balance_expr) as balance_in_hand
                FROM inv_items i
                $joins_expr
                WHERE i.company_id = $company_id 
            ) as derived
            WHERE 1=1
        ";

        if ($hide_zero_reorder) {
            $sql .= " AND re_order_qty > 0 ";
        }

        if (!$show_all) {
            $sql .= " AND balance_in_hand <= re_order_qty ";
        }

        $sql .= " ORDER BY item_code ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format numbers for response
        foreach ($records as &$row) {
            $row['re_order_qty'] = number_format((float)$row['re_order_qty'], 2, '.', '');
            $row['balance_in_hand'] = number_format((float)$row['balance_in_hand'], 2, '.', '');
        }

        sendResponse(['status' => 'success', 'records' => $records]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()]);
    }
}
?>

