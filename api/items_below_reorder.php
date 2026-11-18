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
                ($balance_expr) as balance_in_hand
            FROM inv_items i
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
        }

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
                'total_stock_value' => round($totalStockValue, 2)
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

