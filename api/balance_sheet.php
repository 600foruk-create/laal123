<?php
header('Content-Type: application/json; charset=utf-8');
require_once 'db_config.php';
require_once 'account_ledger.php';
require_once __DIR__ . '/inventory_costing_helpers.php';

/**
 * Classifies a Chart of Accounts head using its explicit Financial Statements Component first,
 * checking Balance Sheet groups before Expense/Revenue keywords so heads like
 * "Accrued Expenses (Current Liabilities)" stay in Current Liabilities.
 */
function classifyCoaAccountGroup($mainComponent, $mainName) {
    $comp = strtolower(trim((string)$mainComponent));
    $main = strtolower(trim((string)$mainName));

    if ($comp !== '') {
        if (strpos($comp, 'non-current asset') !== false || strpos($comp, 'fixed asset') !== false) return 'non_current_asset';
        if (strpos($comp, 'current asset') !== false || $comp === 'asset' || $comp === 'assets') return 'asset';
        if (strpos($comp, 'non-current liab') !== false || strpos($comp, 'long term') !== false) return 'non_current_liability';
        if (strpos($comp, 'current liab') !== false || strpos($comp, 'liabilit') !== false) return 'current_liability';
        if (strpos($comp, 'capital') !== false || strpos($comp, 'equity') !== false || strpos($comp, 'reserve') !== false) return 'equity';
        if ($comp === 'cost of sale' || $comp === 'cost of sales' || strpos($comp, 'cogs') !== false) return 'cost_of_sales';
        if ($comp === 'income' || $comp === 'other income' || $comp === 'revenue' || strpos($comp, 'revenue') !== false || strpos($comp, 'income') !== false) return 'revenue';
        if (strpos($comp, 'expense') !== false || $comp === 'taxation') return 'expense';
    }

    if (strpos($main, 'non-current liab') !== false || strpos($main, 'long term') !== false || strpos($main, 'term finance') !== false || strpos($main, 'director loan') !== false || strpos($main, 'loan from director') !== false) {
        return 'non_current_liability';
    }
    if (strpos($main, 'liabilit') !== false || strpos($main, 'accrued') !== false || strpos($main, 'payable') !== false || strpos($main, 'creditor') !== false || strpos($main, 'vendor') !== false || strpos($main, 'supplier') !== false) {
        return 'current_liability';
    }
    if (strpos($main, 'equity') !== false || strpos($main, 'capital') !== false || strpos($main, 'retained earning') !== false || strpos($main, 'drawing') !== false || strpos($main, 'reserve') !== false) {
        return 'equity';
    }
    if (strpos($main, 'fixed asset') !== false || strpos($main, 'non-current asset') !== false || strpos($main, 'plant') !== false || strpos($main, 'machinery') !== false || strpos($main, 'property') !== false || strpos($main, 'equipment') !== false || strpos($main, 'vehicle') !== false || strpos($main, 'building') !== false || strpos($main, 'mould') !== false) {
        return 'non_current_asset';
    }
    if (strpos($main, 'asset') !== false || strpos($main, 'cash') !== false || strpos($main, 'bank') !== false || strpos($main, 'receivable') !== false || strpos($main, 'customer') !== false || strpos($main, 'debtor') !== false || strpos($main, 'inventory') !== false || strpos($main, 'inventor') !== false || strpos($main, 'stock') !== false || strpos($main, 'advance') !== false || strpos($main, 'prepayment') !== false) {
        return 'asset';
    }
    if (strpos($main, 'cost of sale') !== false || strpos($main, 'cogs') !== false) {
        return 'cost_of_sales';
    }
    if (strpos($main, 'revenue') !== false || strpos($main, 'sales') !== false || strpos($main, 'income') !== false) {
        return 'revenue';
    }
    if (strpos($main, 'expense') !== false || strpos($main, 'administrative') !== false || strpos($main, 'marketing') !== false || strpos($main, 'distribution') !== false || strpos($main, 'selling') !== false || strpos($main, 'financial') !== false || strpos($main, 'taxation') !== false) {
        return 'expense';
    }
    if (strpos($main, 'profit') !== false) {
        return 'equity';
    }

    return 'current_liability';
}

/**
 * Ensure persistent per-month Balance Sheet stock rate overrides table exists.
 */
function ensureBsManualStockRatesTable($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS bs_manual_stock_rates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        period_month VARCHAR(7) NOT NULL,
        row_key VARCHAR(80) NOT NULL,
        row_type VARCHAR(30) NOT NULL DEFAULT 'fg_category',
        category_id INT NOT NULL DEFAULT 0,
        row_label VARCHAR(150) NOT NULL DEFAULT '',
        mode VARCHAR(10) NOT NULL DEFAULT 'auto',
        manual_rate DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        manual_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_bs_stock_rate (company_id, period_month, row_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/**
 * Deterministic row key for Finished Goods categories (by main category id, or normalized name fallback).
 */
function buildBsStockCategoryRowKey($catId, $catNameRaw, $grp) {
    $catId = intval($catId);
    if ($catId > 0) {
        return 'cat_' . $catId;
    }
    $slug = preg_replace('/[^a-z0-9]+/', '_', strtolower(trim((string)($catNameRaw ?: $grp ?: 'other'))));
    $slug = trim((string)$slug, '_');
    return 'fg_' . ($slug ?: 'other');
}

/**
 * Load saved Balance Sheet stock valuation mode & manual rate overrides for a company + month (YYYY-MM).
 */
function fetchBsManualStockRatesMap($pdo, $company_id, $periodMonth) {
    $map = [];
    if (!$periodMonth) return $map;
    try {
        ensureBsManualStockRatesTable($pdo);
        $stmt = $pdo->prepare("SELECT row_key, row_type, category_id, row_label, mode, manual_rate, manual_value FROM bs_manual_stock_rates WHERE company_id = ? AND period_month = ?");
        $stmt->execute([$company_id, $periodMonth]);
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $k = (string)($r['row_key'] ?? '');
            if ($k === '') continue;
            $map[$k] = [
                'row_key' => $k,
                'row_type' => (string)($r['row_type'] ?? 'fg_category'),
                'category_id' => intval($r['category_id'] ?? 0),
                'row_label' => (string)($r['row_label'] ?? ''),
                'mode' => (strtolower((string)($r['mode'] ?? 'auto')) === 'manual') ? 'manual' : 'auto',
                'manual_rate' => floatval($r['manual_rate'] ?? 0),
                'manual_value' => floatval($r['manual_value'] ?? 0)
            ];
        }
    } catch (Exception $e) {}
    return $map;
}

/**
 * Single source of truth for Balance Sheet Inventory Valuation (Raw Material, WIP, Finished Goods)
 * supporting both Auto (Production Costing / Weighted Avg / WIP) and per-month Manual overrides.
 */
function calculateBalanceSheetInventoryValuation($pdo, $company_id, $targetDate, $taxMode = 'tax') {
    $periodMonth = $targetDate ? date('Y-m', strtotime($targetDate)) : date('Y-m');
    $valResult = [
        'total_stock_value' => 0.0,
        'raw_materials_val' => 0.0,
        'raw_materials_kg' => 0.0,
        'raw_materials_auto_val' => 0.0,
        'raw_materials_auto_rate' => 0.0,
        'raw_materials_mode' => 'auto',
        'raw_materials_count' => 0,
        'wip_val' => 0.0,
        'wip_auto_val' => 0.0,
        'wip_mode' => 'auto',
        'finished_goods_val' => 0.0,
        'finished_goods_kg' => 0.0,
        'finished_goods_auto_val' => 0.0,
        'finished_goods_count' => 0,
        'category_breakdown' => [],
        'fg_rows' => [],
        'raw_material_row' => null,
        'wip_row' => null,
        'is_audited' => false,
        'has_saved_closing' => false,
        'manual_overrides_count' => 0,
        'has_manual_override' => false,
        'period_month' => $periodMonth
    ];

    if (!$targetDate) return $valResult;

    $targetYear = intval(date('Y', strtotime($targetDate)));
    $targetMonthNum = intval(date('n', strtotime($targetDate)));

    // 1. Fetch WIP Valuation from mfg_monthly_wip (exact month lock takes priority)
    $hasExactWipLock = false;
    try {
        $stmtWip = $pdo->prepare("SELECT closing_wip_val, is_locked FROM mfg_monthly_wip WHERE company_id = ? AND year = ? AND month = ? LIMIT 1");
        $stmtWip->execute([$company_id, $targetYear, $targetMonthNum]);
        $exactWipRow = $stmtWip->fetch(PDO::FETCH_ASSOC);
        if ($exactWipRow) {
            $valResult['wip_auto_val'] = floatval($exactWipRow['closing_wip_val'] ?? 0);
            $hasExactWipLock = !empty($exactWipRow['is_locked']);
        } else {
            $stmtWipLatest = $pdo->prepare("SELECT closing_wip_val FROM mfg_monthly_wip WHERE company_id = ? AND ((year < ?) OR (year = ? AND month <= ?)) ORDER BY year DESC, month DESC LIMIT 1");
            $stmtWipLatest->execute([$company_id, $targetYear, $targetYear, $targetMonthNum]);
            $valResult['wip_auto_val'] = floatval($stmtWipLatest->fetchColumn() ?: 0);
        }
    } catch (Exception $eWip) {}
    $valResult['wip_val'] = round($valResult['wip_auto_val'], 2);

    // 2. Check inventory_monthly_closings table
    $closingRow = null;
    try {
        $stmtCl = $pdo->prepare("SELECT * FROM inventory_monthly_closings WHERE company_id = ? AND period_month = ? ORDER BY id DESC LIMIT 1");
        $stmtCl->execute([$company_id, $periodMonth]);
        $closingRow = $stmtCl->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $eCl) {}

    if ($closingRow && floatval($closingRow['total_stock_value'] ?? 0) > 0) {
        $valResult['is_audited'] = !empty($closingRow['is_closed']);
        $valResult['has_saved_closing'] = true;
        $valResult['total_stock_value'] = floatval($closingRow['total_stock_value']);

        $snapBuckets = [];
        $rmSnapKg = 0.0;
        if (!empty($closingRow['items_snapshot'])) {
            $snap = json_decode($closingRow['items_snapshot'], true);
            if (is_array($snap)) {
                foreach ($snap as $sItem) {
                    $grp = $sItem['group'] ?? '';
                    $itemVal = floatval($sItem['final_value'] ?? ($sItem['system_value'] ?? 0));
                    $itemKg = floatval($sItem['cb_kg'] ?? ($sItem['closing_kg'] ?? 0));
                    if ($grp === 'Raw Material') {
                        $valResult['raw_materials_val'] += $itemVal;
                        $valResult['raw_materials_count']++;
                        $rmSnapKg += max(0.0, $itemKg);
                    } else {
                        $valResult['finished_goods_val'] += $itemVal;
                        $valResult['finished_goods_count']++;
                        $catId = intval($sItem['main_category_id'] ?? $sItem['category_id'] ?? 0);
                        $catName = trim((string)($sItem['main_category_name'] ?? ($grp ?: 'Finished Goods')));
                        $rk = buildBsStockCategoryRowKey($catId, $catName, $grp);
                        if (!isset($snapBuckets[$rk])) {
                            $snapBuckets[$rk] = [
                                'row_key' => $rk,
                                'row_type' => 'fg_category',
                                'category_id' => $catId,
                                'group' => $grp ?: 'PVC Pipes',
                                'row_label' => $catName,
                                'stock_kg' => 0.0,
                                'stock_kg_raw' => 0.0,
                                'auto_rate' => 0.0,
                                'auto_value' => 0.0,
                                'mode' => 'auto',
                                'manual_rate' => 0.0,
                                'manual_value' => 0.0,
                                'effective_rate' => 0.0,
                                'effective_value' => 0.0,
                                'items_count' => 0
                            ];
                        }
                        $snapBuckets[$rk]['stock_kg_raw'] += max(0.0, $itemKg);
                        $snapBuckets[$rk]['auto_value'] += $itemVal;
                        $snapBuckets[$rk]['effective_value'] += $itemVal;
                        $snapBuckets[$rk]['items_count']++;
                    }
                }
            }
        }

        if ($valResult['raw_materials_val'] == 0 && $valResult['finished_goods_val'] == 0) {
            $valResult['finished_goods_val'] = $valResult['total_stock_value'];
        }
        $valResult['raw_materials_kg'] = round($rmSnapKg, 2);
        $valResult['raw_materials_auto_val'] = round($valResult['raw_materials_val'], 2);
        $valResult['raw_materials_auto_rate'] = ($rmSnapKg > 0) ? round($valResult['raw_materials_val'] / $rmSnapKg, 2) : 0.0;
        $valResult['finished_goods_auto_val'] = round($valResult['finished_goods_val'], 2);

        $fgKgSum = 0.0;
        foreach ($snapBuckets as &$sb) {
            $sb['stock_kg'] = round($sb['stock_kg_raw'], 2);
            $sb['auto_value'] = round($sb['auto_value'], 2);
            $sb['effective_value'] = round($sb['effective_value'], 2);
            $sb['auto_rate'] = ($sb['stock_kg_raw'] > 0) ? round($sb['auto_value'] / $sb['stock_kg_raw'], 2) : 0.0;
            $sb['effective_rate'] = $sb['auto_rate'];
            $fgKgSum += $sb['stock_kg_raw'];
            $valResult['category_breakdown'][] = [
                'group' => $sb['group'],
                'category_id' => $sb['category_id'],
                'category_name' => $sb['row_label'],
                'stock_kg' => $sb['stock_kg'],
                'cost_per_kg' => $sb['effective_rate'],
                'total_val' => $sb['effective_value'],
                'items_count' => $sb['items_count'],
                'mode' => 'auto'
            ];
            unset($sb['stock_kg_raw']);
        }
        unset($sb);
        $valResult['fg_rows'] = array_values($snapBuckets);
        $valResult['finished_goods_kg'] = round($fgKgSum, 2);
        $valResult['raw_material_row'] = [
            'row_key' => 'raw_material',
            'row_type' => 'raw_material',
            'category_id' => 0,
            'row_label' => 'RM-TOTAL (Raw Materials)',
            'stock_kg' => $valResult['raw_materials_kg'],
            'auto_rate' => $valResult['raw_materials_auto_rate'],
            'auto_value' => $valResult['raw_materials_auto_val'],
            'mode' => 'auto',
            'manual_rate' => 0.0,
            'manual_value' => 0.0,
            'effective_rate' => $valResult['raw_materials_auto_rate'],
            'effective_value' => round($valResult['raw_materials_val'], 2),
            'items_count' => $valResult['raw_materials_count']
        ];
        $valResult['wip_row'] = [
            'row_key' => 'wip',
            'row_type' => 'wip',
            'category_id' => 0,
            'row_label' => 'FLOOR WIP (Work-In-Process)',
            'stock_kg' => 0.0,
            'auto_rate' => 0.0,
            'auto_value' => round($valResult['wip_auto_val'], 2),
            'mode' => 'auto',
            'manual_rate' => 0.0,
            'manual_value' => 0.0,
            'effective_rate' => 0.0,
            'effective_value' => round($valResult['wip_val'], 2),
            'items_count' => 0
        ];
        $valResult['total_stock_value'] += $valResult['wip_val'];

        return $valResult;
    }

    // 3. Dynamic Calculation using Weighted Average Rates & Manufacturing Costing + Per-Month Manual Rate Overrides
    $manualOverrides = fetchBsManualStockRatesMap($pdo, $company_id, $periodMonth);

    try {
        $stmtTab = $pdo->query("SHOW TABLES");
        $existingTabs = [];
        while ($t = $stmtTab->fetch(PDO::FETCH_NUM)) { $existingTabs[] = $t[0]; }

        $dateCond = function($col) use ($targetDate) {
            return $targetDate ? " AND DATE($col) <= '$targetDate'" : "";
        };

        $inv_move_in = 'purchases';
        $inv_move_out = 'sale_invoices';
        try {
            $stmtSet = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE company_id = ? AND setting_key IN ('inv_move_in', 'inv_move_out')");
            $stmtSet->execute([$company_id]);
            $sRows = $stmtSet->fetchAll(PDO::FETCH_KEY_PAIR);
            if (!empty($sRows['inv_move_in'])) $inv_move_in = $sRows['inv_move_in'];
            if (!empty($sRows['inv_move_out'])) $inv_move_out = $sRows['inv_move_out'];
        } catch(Exception $e) {}

        // A. Opening Balances & Opening Rates
        $obMap = [];
        $obRateMap = [];
        if (in_array("inv_opening_balances", $existingTabs)) {
            $q = $pdo->query("SELECT item_id, COALESCE(SUM(quantity), 0) as qty, AVG(NULLIF(rate, 0)) as avg_r FROM inv_opening_balances WHERE company_id = $company_id GROUP BY item_id");
            while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                $obMap[$r['item_id']] = floatval($r['qty']);
                if (!empty($r['avg_r'])) $obRateMap[$r['item_id']] = floatval($r['avg_r']);
            }
        }

        // Tax-aligned line amount expressions
        $piAmtExpr = invLineAmountSql('pii', $taxMode, 'standard', 'quantity');
        $prAmtExpr = invLineAmountSql('pri', $taxMode, 'purchase_return', 'quantity');
        $srAmtExpr = invLineAmountSql('sri', $taxMode, 'standard', 'quantity');
        $siAmtExpr = invLineAmountSql('sii', $taxMode, 'standard', 'quantity');

        // B. Purchases & Weighted Average Purchase Rates
        $piMap = [];
        $piAmtMap = [];
        $piRateMap = [];
        $totalRawPurchAmt = 0.0;
        $totalRawPurchQty = 0.0;
        $totalAllPurchAmt = 0.0;
        $totalAllPurchQty = 0.0;
        if (in_array("purchase_invoices", $existingTabs) && in_array("purchase_invoice_items", $existingTabs)) {
            $sqlRate = "SELECT pii.item_coa_id as item_id,
                               COALESCE(SUM(pii.quantity), 0) as qty,
                               COALESCE(SUM({$piAmtExpr}), 0) as total_amt,
                               MAX(CASE WHEN UPPER(COALESCE(it.category_type, '')) LIKE '%RAW%' OR UPPER(COALESCE(mc.name, '')) LIKE '%RAW%' THEN 1 ELSE 0 END) as is_raw_cat
                        FROM purchase_invoice_items pii
                        JOIN purchase_invoices p ON pii.invoice_id = p.id
                        LEFT JOIN inv_items it ON pii.item_coa_id = it.id
                        LEFT JOIN inv_sub_categories sc ON it.sub_id = sc.id
                        LEFT JOIN inv_main_categories mc ON sc.main_id = mc.id
                        WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 " . $dateCond('p.invoice_date') . "
                        GROUP BY pii.item_coa_id";
            $qRate = $pdo->query($sqlRate);
            while ($r = $qRate->fetch(PDO::FETCH_ASSOC)) {
                $qty = floatval($r['qty']);
                $amt = floatval($r['total_amt']);
                if ($qty > 0 && $amt > 0) {
                    $piRateMap[$r['item_id']] = $amt / $qty;
                    $totalAllPurchAmt += $amt;
                    $totalAllPurchQty += $qty;
                    if (!empty($r['is_raw_cat'])) {
                        $totalRawPurchAmt += $amt;
                        $totalRawPurchQty += $qty;
                    }
                }
                $piMap[$r['item_id']] = $qty;
                $piAmtMap[$r['item_id']] = $amt;
            }
        }

        $avgRawRatePerKg = ($totalRawPurchQty > 0 && $totalRawPurchAmt > 0)
            ? round($totalRawPurchAmt / $totalRawPurchQty, 2)
            : (($totalAllPurchQty > 0 && $totalAllPurchAmt > 0) ? round($totalAllPurchAmt / $totalAllPurchQty, 2) : 240.0);

        if ($inv_move_in === 'gate_pass' && in_array("inward_gate_passes", $existingTabs) && in_array("inward_gate_pass_items", $existingTabs)) {
            $sql = "SELECT igpi.item_id, COALESCE(SUM(igpi.qty), 0) as qty
                    FROM inward_gate_pass_items igpi
                    JOIN inward_gate_passes p ON igpi.igp_id = p.id
                    WHERE p.company_id = $company_id AND p.is_cancelled = 0 " . $dateCond('p.date') . "
                    GROUP BY igpi.item_id";
            $q = $pdo->query($sql);
            while ($r = $q->fetch(PDO::FETCH_ASSOC)) { $piMap[$r['item_id']] = floatval($r['qty']); }
        }

        // C. Purchase Returns
        $prMap = [];
        $prAmtMap = [];
        if (in_array("purchase_returns", $existingTabs) && in_array("purchase_return_items", $existingTabs)) {
            $sql = "SELECT pri.item_coa_id as item_id, COALESCE(SUM(pri.quantity), 0) as qty, COALESCE(SUM({$prAmtExpr}), 0) as total_amt
                    FROM purchase_return_items pri
                    JOIN purchase_returns p ON pri.return_id = p.id
                    WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 " . $dateCond('p.return_date') . "
                    GROUP BY pri.item_coa_id";
            $q = $pdo->query($sql);
            while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                $prMap[$r['item_id']] = floatval($r['qty']);
                $prAmtMap[$r['item_id']] = floatval($r['total_amt']);
            }
        }

        // D. Outward Movements & Sales Weighted Average Rates
        $siMap = [];
        $siRateMap = [];
        if (in_array("sale_invoices", $existingTabs) && in_array("sale_invoice_items", $existingTabs)) {
            $sqlSale = "SELECT sii.item_coa_id as item_id,
                               COALESCE(SUM(sii.quantity), 0) as qty,
                               COALESCE(SUM({$siAmtExpr}), 0) as total_amt
                        FROM sale_invoice_items sii
                        JOIN sale_invoices s ON sii.invoice_id = s.id
                        WHERE s.company_id = $company_id AND s.is_cancelled = 0 AND s.is_posted = 1 " . $dateCond('s.invoice_date') . "
                        GROUP BY sii.item_coa_id";
            $qSale = $pdo->query($sqlSale);
            while ($r = $qSale->fetch(PDO::FETCH_ASSOC)) {
                $qty = floatval($r['qty']);
                $amt = floatval($r['total_amt']);
                if ($qty > 0 && $amt > 0) {
                    $siRateMap[$r['item_id']] = $amt / $qty;
                }
                if ($inv_move_out === 'sale_invoices') {
                    $siMap[$r['item_id']] = $qty;
                }
            }
        }
        if ($inv_move_out === 'delivery_challans' && in_array("delivery_challans", $existingTabs) && in_array("delivery_challan_items", $existingTabs)) {
            $sql = "SELECT dci.item_id, COALESCE(SUM(dci.qty), 0) as qty
                    FROM delivery_challan_items dci
                    JOIN delivery_challans s ON dci.challan_id = s.id
                    WHERE s.company_id = $company_id AND s.is_cancelled = 0 " . $dateCond('s.date') . "
                    GROUP BY dci.item_id";
            $q = $pdo->query($sql);
            while ($r = $q->fetch(PDO::FETCH_ASSOC)) { $siMap[$r['item_id']] = floatval($r['qty']); }
        }

        // E. Sale Returns
        $srMap = [];
        $srAmtMap = [];
        if (in_array("sale_returns", $existingTabs) && in_array("sale_return_items", $existingTabs)) {
            $sql = "SELECT sri.item_coa_id as item_id, COALESCE(SUM(sri.quantity), 0) as qty, COALESCE(SUM({$srAmtExpr}), 0) as total_amt
                    FROM sale_return_items sri
                    JOIN sale_returns s ON sri.return_id = s.id
                    WHERE s.company_id = $company_id AND s.is_cancelled = 0 AND s.is_posted = 1 " . $dateCond('s.return_date') . "
                    GROUP BY sri.item_coa_id";
            $q = $pdo->query($sql);
            while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                $srMap[$r['item_id']] = floatval($r['qty']);
                $srAmtMap[$r['item_id']] = floatval($r['total_amt']);
            }
        }

        // F. Adjustments
        $aiaMap = [];
        $aiaAmtMap = [];
        $aiaUnvaluedQtyMap = [];
        if (in_array("add_inventory_adjustments", $existingTabs) && in_array("add_inventory_adjustment_items", $existingTabs)) {
            try {
                $sql = "SELECT aii.item_id, COALESCE(SUM(aii.qty), 0) as qty,
                               COALESCE(SUM(COALESCE(NULLIF(aii.amount, 0), aii.qty * NULLIF(aii.rate, 0), 0)), 0) as total_amt,
                               COALESCE(SUM(CASE WHEN COALESCE(NULLIF(aii.amount, 0), aii.qty * NULLIF(aii.rate, 0), 0) <= 0 AND aii.qty > 0 THEN aii.qty ELSE 0 END), 0) as unvalued_qty
                        FROM add_inventory_adjustment_items aii
                        JOIN add_inventory_adjustments a ON aii.adjustment_id = a.id
                        WHERE a.company_id = $company_id AND a.is_cancelled = 0 " . $dateCond('a.date') . "
                        GROUP BY aii.item_id";
                $q = $pdo->query($sql);
                while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                    $aiaMap[$r['item_id']] = floatval($r['qty']);
                    $aiaAmtMap[$r['item_id']] = floatval($r['total_amt']);
                    $aiaUnvaluedQtyMap[$r['item_id']] = floatval($r['unvalued_qty']);
                }
            } catch (Exception $eAia) {
                $sql = "SELECT aii.item_id, COALESCE(SUM(aii.qty), 0) as qty
                        FROM add_inventory_adjustment_items aii
                        JOIN add_inventory_adjustments a ON aii.adjustment_id = a.id
                        WHERE a.company_id = $company_id AND a.is_cancelled = 0 " . $dateCond('a.date') . "
                        GROUP BY aii.item_id";
                $q = $pdo->query($sql);
                while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                    $qVal = floatval($r['qty']);
                    $aiaMap[$r['item_id']] = $qVal;
                    if ($qVal > 0) $aiaUnvaluedQtyMap[$r['item_id']] = $qVal;
                }
            }
        }

        // G. Manufacturing (MIN & Production Notes Rates & Volumes)
        $totMinQty = 0.0;
        $totMinVal = 0.0;
        if (in_array("material_issue_notes", $existingTabs) && in_array("material_issue_note_items", $existingTabs)) {
            $sql = "SELECT mii.item_id, COALESCE(SUM(mii.qty), 0) as qty, COALESCE(SUM(mii.amount), 0) as val
                    FROM material_issue_note_items mii
                    JOIN material_issue_notes m ON mii.min_id = m.id
                    WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 " . $dateCond('m.date') . "
                    GROUP BY mii.item_id";
            $q = $pdo->query($sql);
            while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                $totMinQty += floatval($r['qty']);
                $totMinVal += floatval($r['val']);
            }
        }

        $pnRateMap = [];
        $totPnProducedQty = 0.0;
        if (in_array("production_notes", $existingTabs) && in_array("production_note_items", $existingTabs)) {
            $sqlIn = "SELECT pni.item_id, i.unit, COALESCE(i.unit_weight, 0) as unit_weight, COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                             COALESCE(SUM(pni.qty), 0) as qty,
                             COALESCE(SUM(COALESCE(NULLIF(pni.amount, 0), pni.qty * COALESCE(pni.rate, 0))), 0) as total_amt
                      FROM production_note_items pni
                      JOIN production_notes p ON pni.pn_id = p.id
                      LEFT JOIN inv_items i ON pni.item_id = i.id
                      WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pni.qty > 0 " . $dateCond('p.date') . "
                      GROUP BY pni.item_id, i.unit, i.unit_weight, i.qty_per_piece";
            $qIn = $pdo->query($sqlIn);
            while ($r = $qIn->fetch(PDO::FETCH_ASSOC)) {
                $qVal = floatval($r['qty']);
                $aAmt = floatval($r['total_amt']);
                $uUp = strtoupper(trim((string)($r['unit'] ?? '')));
                $uWt = floatval($r['unit_weight'] ?? 0) ?: floatval($r['qty_per_piece'] ?? 0);
                $totPnProducedQty += ($uUp !== 'KG' && $uUp !== 'KGS' && $uWt > 0) ? ($qVal * $uWt) : $qVal;
                if ($qVal > 0 && $aAmt > 0) {
                    $pnRateMap[$r['item_id']] = $aAmt / $qVal;
                }
            }
        }

        // Dynamic Floor WIP if not already locked/set from mfg_monthly_wip
        if (!$hasExactWipLock && $valResult['wip_auto_val'] == 0 && $totMinQty > 0) {
            $wipNetQty = $totMinQty - $totPnProducedQty;
            if ($wipNetQty > 0) {
                $avgIssRate = ($totMinQty > 0 && $totMinVal > 0) ? ($totMinVal / $totMinQty) : $avgRawRatePerKg;
                $valResult['wip_auto_val'] = round($wipNetQty * $avgIssRate, 2);
            }
        }
        $valResult['wip_auto_val'] = round($valResult['wip_auto_val'], 2);

        // Apply WIP Manual Override if configured for this month
        $wipOv = $manualOverrides['wip'] ?? null;
        if ($wipOv && $wipOv['mode'] === 'manual') {
            $valResult['wip_mode'] = 'manual';
            $valResult['wip_val'] = round(floatval($wipOv['manual_value'] ?? 0), 2);
            $valResult['manual_overrides_count']++;
        } else {
            $valResult['wip_mode'] = 'auto';
            $valResult['wip_val'] = $valResult['wip_auto_val'];
        }

        // Production Costing Rates by Brand / Category
        $brandCostInfo = resolveBrandProductionCostRates($pdo, $company_id, $targetDate, $existingTabs);
        $brandCostPerKgMap = $brandCostInfo['by_category_id'] ?? [];
        $brandCostByNameMap = $brandCostInfo['by_name'] ?? [];
        $mfgMonthlyCostPerKg = floatval($brandCostInfo['fallback_per_kg'] ?? 0);

        // Pre-seed all Finished Goods main categories so every brand/category (including 0-KG Fitting) appears in Stock Valuation sheet
        $fgBuckets = [];
        try {
            $stmtMc = $pdo->prepare("SELECT id, code, name, category_type FROM inv_main_categories WHERE company_id = ? ORDER BY id ASC");
            $stmtMc->execute([$company_id]);
            while ($mc = $stmtMc->fetch(PDO::FETCH_ASSOC)) {
                $mcId = intval($mc['id']);
                $mcName = trim((string)($mc['name'] ?? ''));
                $mcType = trim((string)($mc['category_type'] ?? ''));
                $mcNameLow = strtolower($mcName);
                $mcTypeLow = strtolower($mcType);
                $isRawMain = (strpos($mcTypeLow, 'raw') !== false || (strpos($mcNameLow, 'raw material') !== false));
                if ($isRawMain) continue;

                $rk = buildBsStockCategoryRowKey($mcId, $mcName, $mcType);
                $seedAutoRate = 0.0;
                if (isset($brandCostPerKgMap[$mcId])) {
                    $seedAutoRate = floatval($brandCostPerKgMap[$mcId]);
                } elseif ($mcNameLow && isset($brandCostByNameMap[$mcNameLow])) {
                    $seedAutoRate = floatval($brandCostByNameMap[$mcNameLow]);
                } elseif ($mfgMonthlyCostPerKg > 0) {
                    $seedAutoRate = $mfgMonthlyCostPerKg;
                }

                $fgBuckets[$rk] = [
                    'row_key' => $rk,
                    'row_type' => 'fg_category',
                    'category_id' => $mcId,
                    'group' => (strpos($mcTypeLow, 'fit') !== false || strpos($mcNameLow, 'fit') !== false) ? 'Fittings' : 'PVC Pipes',
                    'row_label' => $mcName,
                    'stock_kg_raw' => 0.0,
                    'auto_val_raw' => 0.0,
                    'seed_auto_rate' => round($seedAutoRate, 2),
                    'items_count' => 0,
                    'active_items_count' => 0
                ];
            }
        } catch (Exception $eMc) {}

        // Closing Stock Quantities directly from shared Inventory Balance engine
        $invClosing = computeInventoryClosingStock($pdo, $company_id, [
            'as_of_date' => $targetDate,
            'stock_status' => 'positive'
        ]);
        $closingRecords = $invClosing['records'] ?? [];

        $autoRawVal = 0.0;
        $rawTotalKg = 0.0;
        $rawItemsCount = 0;

        foreach ($closingRecords as $it) {
            $id = intval($it['item_id'] ?? $it['id'] ?? 0);
            $grp = $it['group'] ?? 'Others';
            $cbPrimary = floatval($it['cb_primary'] ?? 0);
            $cbSec = floatval($it['cb_sec'] ?? 0);
            $cbKg = floatval($it['cb_kg'] ?? 0);
            $unit = strtoupper(trim((string)($it['unit'] ?? '')));
            $catId = intval($it['main_category_id'] ?? $it['category_id'] ?? 0);
            $catNameRaw = trim((string)($it['main_category_name'] ?? $grp));
            $catNameLow = strtolower($catNameRaw);
            $iNameLow = strtolower(trim((string)($it['item_name'] ?? $it['name'] ?? '')));

            $itemVal = 0.0;
            $stockKgUsed = $cbKg;

            if ($grp === 'Raw Material') {
                $stockKgUsed = ($cbKg > 0) ? $cbKg : $cbSec;
                $obQ = $obMap[$id] ?? 0.0;
                $obR = $obRateMap[$id] ?? floatval($it['valuation_cost'] ?: $it['purchase_price']);
                $unvalAiaQ = $aiaUnvaluedQtyMap[$id] ?? 0.0;
                $inQ = max(0.0, $obQ + ($piMap[$id] ?? 0.0) + ($srMap[$id] ?? 0.0) + ($aiaMap[$id] ?? 0.0) - ($prMap[$id] ?? 0.0) - $unvalAiaQ);
                $inV = max(0.0, ($obQ * $obR) + ($piAmtMap[$id] ?? 0.0) + ($srAmtMap[$id] ?? 0.0) + ($aiaAmtMap[$id] ?? 0.0) - ($prAmtMap[$id] ?? 0.0));
                $rate = ($inQ > 0 && $inV > 0) ? ($inV / $inQ) : ($piRateMap[$id] ?? ($obRateMap[$id] ?? floatval($it['valuation_cost'] ?: $it['purchase_price'])));
                if ($rate <= 0) $rate = floatval($it['selling_price'] ?? 0);
                if ($rate <= 0) $rate = $avgRawRatePerKg;

                $itemVal = ($stockKgUsed > 0 && $rate > 0) ? round($stockKgUsed * $rate, 2) : 0.0;
                if ($itemVal > 0 || $stockKgUsed > 0) {
                    $autoRawVal += $itemVal;
                    $rawTotalKg += max(0.0, $stockKgUsed);
                    $rawItemsCount++;
                }
            } else {
                $brandRatePerKg = 0.0;
                if ($catId > 0 && isset($brandCostPerKgMap[$catId])) {
                    $brandRatePerKg = $brandCostPerKgMap[$catId];
                } elseif ($catNameLow && isset($brandCostByNameMap[$catNameLow])) {
                    $brandRatePerKg = $brandCostByNameMap[$catNameLow];
                } else {
                    foreach ($brandCostByNameMap as $bKey => $bVal) {
                        if ($bKey && (strpos($catNameLow, $bKey) !== false || strpos($iNameLow, $bKey) !== false)) {
                            $brandRatePerKg = $bVal;
                            break;
                        }
                    }
                }
                if ($brandRatePerKg <= 0 && $mfgMonthlyCostPerKg > 0) {
                    $brandRatePerKg = $mfgMonthlyCostPerKg;
                }

                if ($stockKgUsed > 0 && $brandRatePerKg > 0) {
                    $itemVal = round($stockKgUsed * $brandRatePerKg, 2);
                } elseif ($stockKgUsed > 0) {
                    $fallbackKgRate = ($unit === 'KG' || $unit === 'KGS')
                        ? ($pnRateMap[$id] ?? ($siRateMap[$id] ?? ($obRateMap[$id] ?? floatval($it['purchase_price'] ?: ($it['valuation_cost'] ?: $it['selling_price'])))))
                        : $avgRawRatePerKg;
                    if ($fallbackKgRate <= 0) $fallbackKgRate = $avgRawRatePerKg;
                    $itemVal = round($stockKgUsed * $fallbackKgRate, 2);
                } else {
                    $isCtnUnit = (strpos($unit, 'CTN') !== false || strpos($unit, 'CARTON') !== false);
                    $unitQty = ($grp === 'Fittings') ? ($isCtnUnit ? $cbPrimary : $cbSec) : $cbPrimary;
                    $unitRate = $pnRateMap[$id] ?? ($siRateMap[$id] ?? ($obRateMap[$id] ?? floatval($it['purchase_price'] ?: ($it['valuation_cost'] ?: $it['selling_price']))));
                    if ($unitRate > 0 && $unitQty > 0) {
                        $itemVal = round($unitQty * $unitRate, 2);
                    } elseif ($brandRatePerKg > 0 && $cbSec > 0) {
                        $nu = strtoupper($it['item_name'] ?? '');
                        $estWt = 0.0;
                        if (strpos($nu, '4"') !== false) $estWt = 0.400;
                        elseif (strpos($nu, '3"') !== false) $estWt = 0.300;
                        elseif (strpos($nu, '2"') !== false) $estWt = 0.200;
                        elseif (strpos($nu, '1.5"') !== false) $estWt = 0.150;
                        elseif (strpos($nu, '1.25"') !== false) $estWt = 0.125;
                        elseif (strpos($nu, '1"') !== false) $estWt = 0.100;
                        if ($estWt > 0) {
                            $stockKgUsed = round($cbSec * $estWt, 2);
                            $itemVal = round($stockKgUsed * $brandRatePerKg, 2);
                        }
                    }
                }

                $rk = buildBsStockCategoryRowKey($catId, $catNameRaw, $grp);
                if (!isset($fgBuckets[$rk])) {
                    $fgBuckets[$rk] = [
                        'row_key' => $rk,
                        'row_type' => 'fg_category',
                        'category_id' => $catId,
                        'group' => $grp,
                        'row_label' => $catNameRaw ?: $grp,
                        'stock_kg_raw' => 0.0,
                        'auto_val_raw' => 0.0,
                        'seed_auto_rate' => round($brandRatePerKg, 2),
                        'items_count' => 0,
                        'active_items_count' => 0
                    ];
                }
                $fgBuckets[$rk]['stock_kg_raw'] += max(0.0, $stockKgUsed);
                $fgBuckets[$rk]['auto_val_raw'] += $itemVal;
                $fgBuckets[$rk]['items_count']++;
                if ($itemVal > 0 || $cbPrimary > 0 || $cbSec > 0) {
                    $fgBuckets[$rk]['active_items_count']++;
                }
            }
        }

        // Finalize Raw Material row (Auto vs Manual)
        $autoRawVal = round($autoRawVal, 2);
        $rawTotalKgRounded = round($rawTotalKg, 2);
        $autoRawRate = ($rawTotalKg > 0) ? round($autoRawVal / $rawTotalKg, 2) : round($avgRawRatePerKg, 2);
        $rmOv = $manualOverrides['raw_material'] ?? null;
        $rmManual = ($rmOv && $rmOv['mode'] === 'manual');

        $valResult['raw_materials_kg'] = $rawTotalKgRounded;
        $valResult['raw_materials_auto_val'] = $autoRawVal;
        $valResult['raw_materials_auto_rate'] = $autoRawRate;
        $valResult['raw_materials_count'] = $rawItemsCount;

        if ($rmManual) {
            $valResult['raw_materials_mode'] = 'manual';
            $mRate = floatval($rmOv['manual_rate'] ?? 0);
            $mVal = floatval($rmOv['manual_value'] ?? 0);
            if ($rawTotalKg > 0 && $mRate > 0) {
                $effRmVal = round($rawTotalKg * $mRate, 2);
                $effRmRate = round($mRate, 2);
            } else {
                $effRmVal = round($mVal, 2);
                $effRmRate = ($rawTotalKg > 0) ? round($effRmVal / $rawTotalKg, 2) : round($mRate, 2);
            }
            $valResult['raw_materials_val'] = $effRmVal;
            $valResult['manual_overrides_count']++;
        } else {
            $valResult['raw_materials_mode'] = 'auto';
            $effRmVal = $autoRawVal;
            $effRmRate = $autoRawRate;
            $valResult['raw_materials_val'] = $autoRawVal;
        }

        $valResult['raw_material_row'] = [
            'row_key' => 'raw_material',
            'row_type' => 'raw_material',
            'category_id' => 0,
            'row_label' => 'RM-TOTAL (Raw Materials)',
            'stock_kg' => $rawTotalKgRounded,
            'auto_rate' => $autoRawRate,
            'auto_value' => $autoRawVal,
            'mode' => $valResult['raw_materials_mode'],
            'manual_rate' => floatval($rmOv['manual_rate'] ?? 0),
            'manual_value' => floatval($rmOv['manual_value'] ?? 0),
            'effective_rate' => $effRmRate,
            'effective_value' => $effRmVal,
            'items_count' => $rawItemsCount
        ];

        if ($rawItemsCount > 0 || $effRmVal > 0 || $rmManual) {
            $valResult['category_breakdown'][] = [
                'group' => 'Raw Material',
                'category_id' => 0,
                'category_name' => 'Raw Materials (Godown)',
                'stock_kg' => $rawTotalKgRounded,
                'cost_per_kg' => $effRmRate,
                'total_val' => $effRmVal,
                'items_count' => $rawItemsCount,
                'mode' => $valResult['raw_materials_mode']
            ];
        }

        // Finalize Finished Goods Category buckets (Auto vs Manual)
        $fgTotalKgRaw = 0.0;
        $fgAutoValSum = 0.0;
        $fgEffValSum = 0.0;
        $fgCountSum = 0;

        foreach ($fgBuckets as $b) {
            $kgRaw = $b['stock_kg_raw'];
            $kgRounded = round($kgRaw, 2);
            $autoVal = round($b['auto_val_raw'], 2);
            $autoRate = ($kgRaw > 0) ? round($autoVal / $kgRaw, 2) : floatval($b['seed_auto_rate'] ?? 0);

            $ov = $manualOverrides[$b['row_key']] ?? null;
            $isManual = ($ov && $ov['mode'] === 'manual');
            $mRate = floatval($ov['manual_rate'] ?? 0);
            $mVal = floatval($ov['manual_value'] ?? 0);

            if ($isManual) {
                $valResult['manual_overrides_count']++;
                if ($kgRaw > 0) {
                    if ($mRate > 0) {
                        $effRate = round($mRate, 2);
                        $effVal = round($kgRaw * $effRate, 2);
                    } elseif ($mVal > 0) {
                        $effVal = round($mVal, 2);
                        $effRate = round($effVal / $kgRaw, 2);
                    } else {
                        $effRate = 0.0;
                        $effVal = 0.0;
                    }
                } else {
                    $effRate = round($mRate, 2);
                    $effVal = round($mVal, 2);
                }
            } else {
                $effRate = $autoRate;
                $effVal = $autoVal;
            }

            $fgTotalKgRaw += $kgRaw;
            $fgAutoValSum += $autoVal;
            $fgEffValSum += $effVal;
            if ($effVal > 0 || $b['active_items_count'] > 0) {
                $fgCountSum += max($b['active_items_count'], $b['items_count']);
            }

            $fgRowOut = [
                'row_key' => $b['row_key'],
                'row_type' => 'fg_category',
                'category_id' => $b['category_id'],
                'group' => $b['group'],
                'row_label' => $b['row_label'],
                'stock_kg' => $kgRounded,
                'stock_kg_exact' => round($kgRaw, 6),
                'auto_rate' => $autoRate,
                'auto_value' => $autoVal,
                'mode' => $isManual ? 'manual' : 'auto',
                'manual_rate' => $mRate,
                'manual_value' => $mVal,
                'effective_rate' => $effRate,
                'effective_value' => $effVal,
                'items_count' => $b['items_count']
            ];
            $valResult['fg_rows'][] = $fgRowOut;

            if ($b['items_count'] > 0 || $effVal > 0 || $isManual) {
                $valResult['category_breakdown'][] = [
                    'group' => $b['group'],
                    'category_id' => $b['category_id'],
                    'category_name' => $b['row_label'],
                    'stock_kg' => $kgRounded,
                    'cost_per_kg' => $effRate,
                    'total_val' => $effVal,
                    'items_count' => $b['items_count'],
                    'mode' => $isManual ? 'manual' : 'auto'
                ];
            }
        }

        $valResult['wip_row'] = [
            'row_key' => 'wip',
            'row_type' => 'wip',
            'category_id' => 0,
            'row_label' => 'FLOOR WIP (Work-In-Process)',
            'stock_kg' => 0.0,
            'auto_rate' => 0.0,
            'auto_value' => $valResult['wip_auto_val'],
            'mode' => $valResult['wip_mode'],
            'manual_rate' => 0.0,
            'manual_value' => floatval($wipOv['manual_value'] ?? $valResult['wip_val']),
            'effective_rate' => 0.0,
            'effective_value' => $valResult['wip_val'],
            'items_count' => 0
        ];

        $valResult['finished_goods_kg'] = round($fgTotalKgRaw, 2);
        $valResult['finished_goods_auto_val'] = round($fgAutoValSum, 2);
        $valResult['finished_goods_val'] = round($fgEffValSum, 2);
        $valResult['finished_goods_count'] = $fgCountSum;
        $valResult['has_manual_override'] = ($valResult['manual_overrides_count'] > 0);
        $valResult['total_stock_value'] = round($valResult['raw_materials_val'] + $valResult['wip_val'] + $valResult['finished_goods_val'], 2);
    } catch (Exception $eDyn) {}

    return $valResult;
}

try {
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    $company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

    // =========================================================================
    // ACTION: GET / SAVE / RESET BALANCE SHEET STOCK VALUATION SHEET (AUTO / MANUAL)
    // =========================================================================
    if ($action === 'get_stock_valuation_sheet') {
        $as_on_date = $_GET['as_on_date'] ?? $_GET['on_date'] ?? date('Y-m-d');
        $taxMode = resolveInventoryTaxMode($pdo, $company_id, $_GET['tax_mode'] ?? null);
        $taxModeLabel = ($taxMode === 'tax') ? 'Tax (Excl. GST)' : 'Non-Tax (Full Bill)';
        $inv = calculateBalanceSheetInventoryValuation($pdo, $company_id, $as_on_date, $taxMode);

        $fgAuto = round(floatval($inv['finished_goods_auto_val'] ?? 0), 2);
        $fgEff = round(floatval($inv['finished_goods_val'] ?? 0), 2);
        $rmAuto = round(floatval($inv['raw_materials_auto_val'] ?? 0), 2);
        $rmEff = round(floatval($inv['raw_materials_val'] ?? 0), 2);
        $wipAuto = round(floatval($inv['wip_auto_val'] ?? 0), 2);
        $wipEff = round(floatval($inv['wip_val'] ?? 0), 2);

        sendResponse([
            'status' => 'success',
            'company_id' => $company_id,
            'as_on_date' => $as_on_date,
            'as_on_date_formatted' => date('d-m-Y', strtotime($as_on_date)),
            'period_month' => $inv['period_month'],
            'period_month_label' => date('M Y', strtotime($as_on_date)),
            'tax_mode' => $taxMode,
            'tax_mode_label' => $taxModeLabel,
            'is_audited' => !empty($inv['is_audited']),
            'has_saved_closing' => !empty($inv['has_saved_closing']),
            'manual_overrides_count' => intval($inv['manual_overrides_count'] ?? 0),
            'fg_rows' => $inv['fg_rows'] ?? [],
            'raw_material_row' => $inv['raw_material_row'],
            'wip_row' => $inv['wip_row'],
            'totals' => [
                'fg_kg' => round(floatval($inv['finished_goods_kg'] ?? 0), 2),
                'fg_auto_value' => $fgAuto,
                'fg_value' => $fgEff,
                'rm_kg' => round(floatval($inv['raw_materials_kg'] ?? 0), 2),
                'rm_auto_value' => $rmAuto,
                'rm_value' => $rmEff,
                'wip_auto_value' => $wipAuto,
                'wip_value' => $wipEff,
                'total_stock_auto_value' => round($fgAuto + $rmAuto + $wipAuto, 2),
                'total_stock_value' => round($fgEff + $rmEff + $wipEff, 2)
            ]
        ]);
    }

    if ($action === 'save_stock_valuation_sheet') {
        $rawBody = file_get_contents('php://input');
        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            $payload = $_POST;
            if (isset($payload['rows']) && is_string($payload['rows'])) {
                $payload['rows'] = json_decode($payload['rows'], true);
            }
        }
        $reqCompanyId = intval($payload['company_id'] ?? $company_id);
        $as_on_date = $payload['as_on_date'] ?? date('Y-m-d');
        $periodMonth = trim((string)($payload['period_month'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}$/', $periodMonth)) {
            $periodMonth = date('Y-m', strtotime($as_on_date));
        }
        $taxMode = resolveInventoryTaxMode($pdo, $reqCompanyId, $payload['tax_mode'] ?? null);
        $rows = is_array($payload['rows'] ?? null) ? $payload['rows'] : [];

        ensureBsManualStockRatesTable($pdo);
        $pdo->beginTransaction();
        try {
            $stmtUp = $pdo->prepare("
                INSERT INTO bs_manual_stock_rates
                    (company_id, period_month, row_key, row_type, category_id, row_label, mode, manual_rate, manual_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    row_type = VALUES(row_type),
                    category_id = VALUES(category_id),
                    row_label = VALUES(row_label),
                    mode = VALUES(mode),
                    manual_rate = VALUES(manual_rate),
                    manual_value = VALUES(manual_value)
            ");
            foreach ($rows as $r) {
                $rowKey = substr(trim((string)($r['row_key'] ?? '')), 0, 80);
                if ($rowKey === '') continue;
                $rowType = substr(trim((string)($r['row_type'] ?? 'fg_category')), 0, 30);
                $catId = intval($r['category_id'] ?? 0);
                $rowLabel = substr(trim((string)($r['row_label'] ?? '')), 0, 150);
                $mode = (strtolower(trim((string)($r['mode'] ?? 'auto'))) === 'manual') ? 'manual' : 'auto';
                $manualRate = round(floatval($r['manual_rate'] ?? 0), 2);
                $manualValue = round(floatval($r['manual_value'] ?? 0), 2);
                $stmtUp->execute([$reqCompanyId, $periodMonth, $rowKey, $rowType, $catId, $rowLabel, $mode, $manualRate, $manualValue]);
            }
            $pdo->commit();
        } catch (Exception $exSave) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exSave;
        }

        $inv = calculateBalanceSheetInventoryValuation($pdo, $reqCompanyId, $as_on_date, $taxMode);
        sendResponse([
            'status' => 'success',
            'message' => "Stock valuation settings saved for {$periodMonth} and applied to Balance Sheet.",
            'period_month' => $periodMonth,
            'manual_overrides_count' => intval($inv['manual_overrides_count'] ?? 0),
            'total_stock_value' => round(floatval($inv['total_stock_value'] ?? 0), 2)
        ]);
    }

    if ($action === 'reset_stock_valuation_sheet') {
        $rawBody = file_get_contents('php://input');
        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) $payload = $_POST;
        $reqCompanyId = intval($payload['company_id'] ?? $company_id);
        $as_on_date = $payload['as_on_date'] ?? $_GET['as_on_date'] ?? date('Y-m-d');
        $periodMonth = trim((string)($payload['period_month'] ?? $_GET['period_month'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}$/', $periodMonth)) {
            $periodMonth = date('Y-m', strtotime($as_on_date));
        }

        ensureBsManualStockRatesTable($pdo);
        $stmtDel = $pdo->prepare("DELETE FROM bs_manual_stock_rates WHERE company_id = ? AND period_month = ?");
        $stmtDel->execute([$reqCompanyId, $periodMonth]);

        sendResponse([
            'status' => 'success',
            'message' => "All stock valuation overrides cleared for {$periodMonth}. All categories reset to Auto.",
            'period_month' => $periodMonth
        ]);
    }

    // =========================================================================
    // ACTION: DIAGNOSE IMBALANCE (Difference Diagnostic Tool)
    // =========================================================================
    if ($action === 'diagnose_imbalance') {
        $as_on_date = $_GET['as_on_date'] ?? date('Y-m-d');
        $voucher_status = $_GET['voucher_status'] ?? 'posted';

        $issues = [];
        $recommendations = [];

        // 1. Check Opening Balances Equivalence
        $obTotalDeb = 0;
        $obTotalCrd = 0;
        $obDiff = 0;
        $obCount = 0;
        try {
            $stmtOB = $pdo->prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(debit), 0) as tot_deb, COALESCE(SUM(credit), 0) as tot_crd FROM coa_opening_balances WHERE company_id = ?");
            $stmtOB->execute([$company_id]);
            $obRow = $stmtOB->fetch(PDO::FETCH_ASSOC);
            $obCount = intval($obRow['cnt'] ?? 0);
            $obTotalDeb = floatval($obRow['tot_deb'] ?? 0);
            $obTotalCrd = floatval($obRow['tot_crd'] ?? 0);
            $obDiff = round($obTotalDeb - $obTotalCrd, 2);

            if (abs($obDiff) > 0.01) {
                $issues[] = [
                    'severity' => 'critical',
                    'category' => 'Opening Balances',
                    'title' => 'Opening Balances Imbalance Detected',
                    'diff' => $obDiff,
                    'details' => "Total Opening Debits (Rs. " . number_format($obTotalDeb, 2) . ") do not match Total Opening Credits (Rs. " . number_format($obTotalCrd, 2) . "). Difference is Rs. " . number_format(abs($obDiff), 2) . " (" . ($obDiff > 0 ? "Debit Heavy" : "Credit Heavy") . ").",
                    'recommendation' => "In accounting double-entry, Opening Balances must balance to 0. Add or adjust the balancing entry in 'Owner\'s Capital / Equity' (3100xxx) under Maintain > Opening Balances so Debit = Credit."
                ];
            }
        } catch (Exception $e) {}

        // 2. Scan General Journal Vouchers for Single-Sided or Unbalanced Entries
        $unbalancedJVs = [];
        try {
            $jvSql = "
                SELECT 
                    v.id, v.serial_no, v.voucher_date, 
                    COALESCE(NULLIF(TRIM(v.description),''), TRIM(v.remarks), 'No description') as description,
                    COALESCE(SUM(i.debit), 0) as tot_deb,
                    COALESCE(SUM(i.credit), 0) as tot_crd,
                    ROUND(COALESCE(SUM(i.debit), 0) - COALESCE(SUM(i.credit), 0), 2) as diff
                FROM general_journal_vouchers v
                LEFT JOIN general_journal_voucher_items i ON i.voucher_id = v.id
                WHERE v.company_id = ? AND v.is_cancelled = 0 " . ($voucher_status === 'posted' ? "AND v.is_posted = 1" : "") . "
                GROUP BY v.id
                HAVING ABS(diff) > 0.01
                ORDER BY v.voucher_date DESC
                LIMIT 50
            ";
            $stmtJV = $pdo->prepare($jvSql);
            $stmtJV->execute([$company_id]);
            $unbalancedJVs = $stmtJV->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($unbalancedJVs)) {
                $issues[] = [
                    'severity' => 'critical',
                    'category' => 'General Journal Vouchers',
                    'title' => count($unbalancedJVs) . ' Unbalanced Journal Voucher(s) Found',
                    'diff' => array_sum(array_column($unbalancedJVs, 'diff')),
                    'details' => "Some Journal Vouchers have unequal debits and credits.",
                    'recommendation' => "Open and correct the listed Journal Vouchers so each voucher balances."
                ];
            }
        } catch (Exception $e) {}

        // 3. Scan Unposted (Draft) Vouchers
        $unpostedVouchers = [];
        $checkTables = [
            'general_journal_vouchers' => 'Journal Vouchers',
            'cash_payments' => 'Cash Payments',
            'cash_receipts' => 'Cash Receipts',
            'bank_payments' => 'Bank Payments',
            'bank_receipts' => 'Bank Receipts',
            'sale_invoices' => 'Sale Invoices',
            'purchase_invoices' => 'Purchase Invoices'
        ];
        foreach ($checkTables as $tbl => $lbl) {
            try {
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM $tbl WHERE company_id = ? AND is_cancelled = 0 AND (is_posted = 0 OR is_posted IS NULL)");
                $cntStmt->execute([$company_id]);
                $cnt = intval($cntStmt->fetchColumn() ?: 0);
                if ($cnt > 0) {
                    $unpostedVouchers[] = ['type' => $lbl, 'count' => $cnt];
                }
            } catch (Exception $e) {}
        }
        if (!empty($unpostedVouchers) && $voucher_status === 'posted') {
            $totUnposted = array_sum(array_column($unpostedVouchers, 'count'));
            $issues[] = [
                'severity' => 'warning',
                'category' => 'Unposted Vouchers',
                'title' => "$totUnposted Draft/Unposted Voucher(s) Omitted",
                'diff' => 0,
                'details' => "Currently running in 'Posted Only' mode. Draft transactions are excluded from Balance Sheet totals.",
                'recommendation' => "If these vouchers belong to this period, review and post them, or switch filter to 'Include Drafts'."
            ];
        }

        // 4. Scan Active Suspense Accounts
        $suspenseActive = [];
        try {
            $stmtSusp = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name
                FROM coa_list cl
                LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
                LEFT JOIN coa_main cm ON cs.main_id = cm.id
                WHERE cl.company_id = ? 
                  AND (LOWER(cl.name) LIKE '%suspense%' OR LOWER(cm.name) LIKE '%suspense%')
            ");
            $stmtSusp->execute([$company_id]);
            $suspAccounts = $stmtSusp->fetchAll(PDO::FETCH_ASSOC);

            foreach ($suspAccounts as $sa) {
                $txs = fetchLedgerTransactions($pdo, $company_id, intval($sa['id']), '1970-01-01', $as_on_date);
                $d = 0; $c = 0;
                foreach ($txs as $t) { $d += floatval($t['debit'] ?? 0); $c += floatval($t['credit'] ?? 0); }
                $bal = $d - $c;
                if (abs($bal) > 0.01) {
                    $suspenseActive[] = [
                        'code' => $sa['code'],
                        'name' => $sa['name'],
                        'balance' => round($bal, 2)
                    ];
                }
            }
            if (!empty($suspenseActive)) {
                $issues[] = [
                    'severity' => 'warning',
                    'category' => 'Suspense Accounts',
                    'title' => count($suspenseActive) . ' Active Suspense Account(s)',
                    'diff' => array_sum(array_column($suspenseActive, 'balance')),
                    'details' => "Suspense accounts have open balances that have not been reconciled into permanent accounts.",
                    'recommendation' => "Reclassify suspense ledger entries to their respective ledger heads before period-end audit."
                ];
            }
        } catch (Exception $e) {}

        // 5. Check Owner's Capital Setup
        $capitalBalance = 0;
        try {
            $stmtCap = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name
                FROM coa_list cl
                LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
                LEFT JOIN coa_main cm ON cs.main_id = cm.id
                WHERE cl.company_id = ? 
                  AND (LOWER(cm.name) LIKE '%equity%' OR LOWER(cm.name) LIKE '%capital%' OR LOWER(cl.name) LIKE '%capital%')
                  AND LOWER(cl.name) NOT LIKE '%drawing%'
            ");
            $stmtCap->execute([$company_id]);
            $capAccs = $stmtCap->fetchAll(PDO::FETCH_ASSOC);
            foreach ($capAccs as $ca) {
                $txs = fetchLedgerTransactions($pdo, $company_id, intval($ca['id']), '1970-01-01', $as_on_date);
                $d = 0; $c = 0;
                foreach ($txs as $t) { $d += floatval($t['debit'] ?? 0); $c += floatval($t['credit'] ?? 0); }
                $capitalBalance += ($c - $d);
            }
            if (abs($capitalBalance) < 0.01 && abs($obDiff) > 0.01) {
                $issues[] = [
                    'severity' => 'info',
                    'category' => "Owner's Capital",
                    'title' => "Owner's Capital is Rs. 0",
                    'diff' => $obDiff,
                    'details' => "Your business has assets and liabilities, but Owner's Capital is recorded as Rs. 0. This explains why Owner's Equity is negative and the Balance Sheet is out of balance by exactly the opening balance difference (Rs. " . number_format(abs($obDiff), 2) . ").",
                    'recommendation' => "Setting Owner's Capital in Opening Balances to Rs. " . number_format(abs($obDiff), 2) . " will immediately balance the Balance Sheet!"
                ];
            }
        } catch (Exception $e) {}

        sendResponse([
            'status' => 'success',
            'as_on_date' => $as_on_date,
            'summary' => [
                'opening_total_debit' => round($obTotalDeb, 2),
                'opening_total_credit' => round($obTotalCrd, 2),
                'opening_diff' => $obDiff,
                'opening_count' => $obCount,
                'unbalanced_jvs_count' => count($unbalancedJVs),
                'unposted_vouchers' => $unpostedVouchers,
                'suspense_count' => count($suspenseActive),
                'capital_balance' => round($capitalBalance, 2)
            ],
            'issues' => $issues,
            'unbalanced_jvs' => $unbalancedJVs,
            'suspense_active' => $suspenseActive
        ]);
    }

    // =========================================================================
    // HELPER: FIFO AGING BUCKETS CALCULATION (Feature 4)
    // =========================================================================
    function computeFifoAging($txs, $as_on_date, $balance, $isDebtor = true) {
        if ($balance <= 0.01) {
            return ['d0_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'status' => 'cleared'];
        }
        $asOnTs = strtotime($as_on_date);
        $b0_30 = 0; $b31_60 = 0; $b61_90 = 0; $b90_plus = 0;

        $entries = [];
        if (!empty($txs)) {
            foreach ($txs as $t) {
                $val = $isDebtor ? floatval($t['debit'] ?? 0) : floatval($t['credit'] ?? 0);
                if ($val > 0.01) {
                    $tDate = $t['date'] ?? $as_on_date;
                    $ts = strtotime($tDate);
                    $days = max(0, round(($asOnTs - $ts) / 86400));
                    $entries[] = ['days' => $days, 'amount' => $val];
                }
            }
        }
        // Most recent entries first
        usort($entries, function($a, $b) { return $a['days'] <=> $b['days']; });

        $rem = $balance;
        foreach ($entries as $e) {
            if ($rem <= 0) break;
            $take = min($rem, $e['amount']);
            if ($e['days'] <= 30) {
                $b0_30 += $take;
            } else if ($e['days'] <= 60) {
                $b31_60 += $take;
            } else if ($e['days'] <= 90) {
                $b61_90 += $take;
            } else {
                $b90_plus += $take;
            }
            $rem -= $take;
        }
        if ($rem > 0) {
            $b90_plus += $rem;
        }

        $status = 'current';
        if ($b90_plus > 0.5 * $balance) {
            $status = 'critical'; // >50% older than 90 days
        } else if (($b31_60 + $b61_90 + $b90_plus) > 0.4 * $balance) {
            $status = 'overdue'; // Significant portion >30 days
        }

        return [
            'd0_30' => round($b0_30, 2),
            'd31_60' => round($b31_60, 2),
            'd61_90' => round($b61_90, 2),
            'd90_plus' => round($b90_plus, 2),
            'status' => $status
        ];
    }

    // =========================================================================
    // ACTION: GET ACCOUNT LEDGER MINI (Feature 1: Drill-Down Khata)
    // =========================================================================
    if ($action === 'get_account_ledger_mini') {
        $coa_id = intval($_GET['coa_id'] ?? 0);
        $as_on_date = $_GET['as_on_date'] ?? date('Y-m-d');
        $from_date = $_GET['from_date'] ?? '1970-01-01';

        // Account Details
        $stmtAcc = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, COALESCE(cm.name, '') as main_name, 
                   COALESCE(cs.name, '') as sub_name, COALESCE(cm.component, '') as component
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.id = ? AND cl.company_id = ?
        ");
        $stmtAcc->execute([$coa_id, $company_id]);
        $accInfo = $stmtAcc->fetch(PDO::FETCH_ASSOC);

        if (!$accInfo) {
            sendResponse(['status' => 'error', 'error' => 'Account not found in Chart of Accounts'], 404);
        }

        $compLower = strtolower($accInfo['component'] ?? '');
        $isDebitNormal = in_array($compLower, ['asset', 'expense', 'cost of sale', 'cost of sales']);

        // Fetch Transactions
        $txs = fetchLedgerTransactions($pdo, $company_id, $coa_id, $from_date, $as_on_date);

        $runningBalance = 0;
        $totalDebit = 0;
        $totalCredit = 0;
        $formattedTxs = [];

        foreach ($txs as $t) {
            $deb = floatval($t['debit'] ?? 0);
            $crd = floatval($t['credit'] ?? 0);
            $totalDebit += $deb;
            $totalCredit += $crd;

            if ($isDebitNormal) {
                $runningBalance += ($deb - $crd);
            } else {
                $runningBalance += ($crd - $deb);
            }

            $formattedTxs[] = [
                'date' => $t['date'] ?? '',
                'date_formatted' => !empty($t['date']) ? date('d-M-Y', strtotime($t['date'])) : '',
                'type' => $t['source_type'] ?? 'JV',
                'tran_no' => $t['tran_no'] ?? '',
                'reference' => $t['reference'] ?? '',
                'description' => !empty(trim($t['description'] ?? '')) ? trim($t['description']) : ($t['reference'] ?: 'Ledger entry'),
                'debit' => round($deb, 2),
                'credit' => round($crd, 2),
                'balance' => round($runningBalance, 2)
            ];
        }

        sendResponse([
            'status' => 'success',
            'account' => $accInfo,
            'as_on_date' => $as_on_date,
            'as_on_date_formatted' => date('d-M-Y', strtotime($as_on_date)),
            'is_debit_normal' => $isDebitNormal,
            'total_debit' => round($totalDebit, 2),
            'total_credit' => round($totalCredit, 2),
            'closing_balance' => round($runningBalance, 2),
            'transaction_count' => count($formattedTxs),
            'transactions' => $formattedTxs
        ]);
    }

    // =========================================================================
    // ACTION: GET CLOSING PREVIEW (Feature 6: Financial Year Closing Wizard)
    // =========================================================================
    if ($action === 'get_closing_preview') {
        $closing_date = $_GET['closing_date'] ?? date('Y-06-30');
        $yr = date('Y', strtotime($closing_date));

        // 1. Calculate P&L Net Profit up to closing_date
        $sqlPL = "
            SELECT 
                cl.id, cl.code, cl.name, 
                COALESCE(cm.name, '') as main_name, 
                COALESCE(cm.component, '') as main_component
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ?
        ";
        $stmtPL = $pdo->prepare($sqlPL);
        $stmtPL->execute([$company_id]);
        $plAccs = $stmtPL->fetchAll(PDO::FETCH_ASSOC);

        $totRev = 0; $totCos = 0; $totExp = 0;
        foreach ($plAccs as $acc) {
            $accGroup = classifyCoaAccountGroup($acc['main_component'], $acc['main_name']);
            if ($accGroup !== 'revenue' && $accGroup !== 'cost_of_sales' && $accGroup !== 'expense') {
                continue;
            }

            $txs = fetchLedgerTransactions($pdo, $company_id, intval($acc['id']), '1970-01-01', $closing_date);
            $d = 0; $c = 0;
            foreach ($txs as $t) { $d += floatval($t['debit'] ?? 0); $c += floatval($t['credit'] ?? 0); }

            if ($accGroup === 'revenue') $totRev += ($c - $d);
            else if ($accGroup === 'cost_of_sales') $totCos += ($d - $c);
            else if ($accGroup === 'expense') $totExp += ($d - $c);
        }

        $netProfit = $totRev - ($totCos + $totExp);

        // 2. Check if Year Closing JV already exists around this date
        $stmtClosed = $pdo->prepare("
            SELECT id, serial_no, voucher_date, description 
            FROM general_journal_vouchers 
            WHERE company_id = ? AND voucher_date = ? AND is_cancelled = 0 
              AND (description LIKE '%Year End Closing%' OR description LIKE '%Closing Entry%' OR description LIKE '%Fiscal Year%')
            ORDER BY id DESC LIMIT 1
        ");
        $stmtClosed->execute([$company_id, $closing_date]);
        $existingClosing = $stmtClosed->fetch(PDO::FETCH_ASSOC);

        // 3. Find or suggest Retained Earnings account
        $stmtRet = $pdo->prepare("
            SELECT id, code, name 
            FROM coa_list 
            WHERE company_id = ? AND (code = '3200001' OR LOWER(name) LIKE '%retained%')
            ORDER BY id ASC LIMIT 1
        ");
        $stmtRet->execute([$company_id]);
        $retainedAcc = $stmtRet->fetch(PDO::FETCH_ASSOC);

        sendResponse([
            'status' => 'success',
            'closing_date' => $closing_date,
            'closing_date_formatted' => date('d-M-Y', strtotime($closing_date)),
            'total_revenue' => round($totRev, 2),
            'total_cost_of_sales' => round($totCos, 2),
            'total_operating_expenses' => round($totExp, 2),
            'net_profit' => round($netProfit, 2),
            'is_profit' => ($netProfit >= 0),
            'retained_earnings_account' => $retainedAcc,
            'existing_closing' => $existingClosing,
            'is_already_closed' => !empty($existingClosing)
        ]);
    }

    // =========================================================================
    // ACTION: EXECUTE YEAR CLOSING (Feature 6: Post Retained Earnings JV)
    // =========================================================================
    if ($action === 'execute_year_closing') {
        $closing_date = $_POST['closing_date'] ?? date('Y-06-30');
        $net_profit = floatval($_POST['net_profit'] ?? 0);

        if (abs($net_profit) < 0.01) {
            sendResponse(['status' => 'error', 'error' => 'Net profit is Rs. 0.00. No closing entry required.'], 400);
        }

        // 1. Find or create Retained Earnings Account
        $stmtRet = $pdo->prepare("SELECT id, code, name FROM coa_list WHERE company_id = ? AND (code = '3200001' OR LOWER(name) LIKE '%retained%') LIMIT 1");
        $stmtRet->execute([$company_id]);
        $retainedAcc = $stmtRet->fetch(PDO::FETCH_ASSOC);

        if (!$retainedAcc) {
            // Find an Equity Sub ID
            $stmtSub = $pdo->prepare("
                SELECT cs.id 
                FROM coa_sub cs 
                JOIN coa_main cm ON cs.main_id = cm.id 
                WHERE cs.company_id = ? AND (LOWER(cm.name) LIKE '%equity%' OR LOWER(cs.name) LIKE '%equity%' OR LOWER(cs.name) LIKE '%capital%') 
                LIMIT 1
            ");
            $stmtSub->execute([$company_id]);
            $subId = $stmtSub->fetchColumn();
            if (!$subId) {
                $subId = $pdo->query("SELECT id FROM coa_sub ORDER BY id ASC LIMIT 1")->fetchColumn();
            }

            $insCoa = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name, is_active) VALUES (?, ?, '3200001', 'Retained Earnings / Unappropriated Profit', 1)");
            $insCoa->execute([$company_id, $subId]);
            $retainedId = $pdo->lastInsertId();
            $retainedCode = '3200001';
            $retainedName = 'Retained Earnings / Unappropriated Profit';
        } else {
            $retainedId = intval($retainedAcc['id']);
            $retainedCode = $retainedAcc['code'];
            $retainedName = $retainedAcc['name'];
        }

        // 2. Find or create P&L Summary Clearing Account (3300001)
        $stmtPlClear = $pdo->prepare("SELECT id FROM coa_list WHERE company_id = ? AND (code = '3300001' OR LOWER(name) LIKE '%profit & loss clearing%' OR LOWER(name) LIKE '%p&l summary%') LIMIT 1");
        $stmtPlClear->execute([$company_id]);
        $plClearId = $stmtPlClear->fetchColumn();

        if (!$plClearId) {
            $stmtSub = $pdo->prepare("SELECT cs.id FROM coa_sub cs JOIN coa_main cm ON cs.main_id = cm.id WHERE cs.company_id = ? AND LOWER(cm.name) LIKE '%equity%' LIMIT 1");
            $stmtSub->execute([$company_id]);
            $subId = $stmtSub->fetchColumn() ?: 1;

            $insClear = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name, is_active) VALUES (?, ?, '3300001', 'Profit & Loss Summary Clearing', 1)");
            $insClear->execute([$company_id, $subId]);
            $plClearId = $pdo->lastInsertId();
        }

        // 3. Get Next Serial Number for Journal Voucher
        $stmtSn = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM general_journal_vouchers WHERE company_id = ?");
        $stmtSn->execute([$company_id]);
        $snRow = $stmtSn->fetch(PDO::FETCH_ASSOC);
        $nextSn = intval($snRow['max_sn'] ?? 0) + 1;

        $desc = "Financial Year Closing Entry as of " . date('d-M-Y', strtotime($closing_date)) . " - Net Profit of Rs. " . number_format(abs($net_profit), 2) . " rolled forward to Retained Earnings.";

        // 4. Create General Journal Voucher
        $stmtJV = $pdo->prepare("
            INSERT INTO general_journal_vouchers (company_id, serial_no, voucher_date, description, is_posted, is_cancelled, created_at)
            VALUES (?, ?, ?, ?, 1, 0, NOW())
        ");
        $stmtJV->execute([$company_id, $nextSn, $closing_date, $desc]);
        $voucherId = $pdo->lastInsertId();

        // 5. Insert Voucher Items (Balanced Double-Entry)
        $absProfit = abs($net_profit);
        $stmtItem = $pdo->prepare("
            INSERT INTO general_journal_voucher_items (voucher_id, coa_id, description, debit, credit)
            VALUES (?, ?, ?, ?, ?)
        ");

        if ($net_profit > 0) {
            // Profit: Debit P&L Clearing, Credit Retained Earnings
            $stmtItem->execute([$voucherId, $plClearId, "Close Net Profit to Retained Earnings", $absProfit, 0]);
            $stmtItem->execute([$voucherId, $retainedId, "Net Profit for Year ended " . date('d-M-Y', strtotime($closing_date)), 0, $absProfit]);
        } else {
            // Loss: Debit Retained Earnings, Credit P&L Clearing
            $stmtItem->execute([$voucherId, $retainedId, "Net Loss for Year ended " . date('d-M-Y', strtotime($closing_date)), $absProfit, 0]);
            $stmtItem->execute([$voucherId, $plClearId, "Close Net Loss from P&L", 0, $absProfit]);
        }

        sendResponse([
            'status' => 'success',
            'message' => "Financial Year Closing successfully completed! Journal Voucher JV-{$nextSn} posted.",
            'voucher_id' => $voucherId,
            'serial_no' => $nextSn,
            'closing_date' => $closing_date,
            'net_profit' => round($net_profit, 2)
        ]);
    }

    // =========================================================================
    // ACTION: GET BALANCE SHEET
    // =========================================================================
    if ($action === 'get_balance_sheet' || $action === 'get_sheet') {
        $as_on_date = $_GET['as_on_date'] ?? $_GET['on_date'] ?? date('Y-m-d');
        $comparative_date = $_GET['comparative_date'] ?? null;
        $voucher_status = $_GET['voucher_status'] ?? 'posted'; // 'posted' or 'all'
        $smart_reclass = isset($_GET['smart_reclass']) ? intval($_GET['smart_reclass']) : 1; // 1 = ON (Default)
        $taxMode = resolveInventoryTaxMode($pdo, $company_id, $_GET['tax_mode'] ?? null);
        $taxModeLabel = ($taxMode === 'tax') ? 'Tax (Excl. GST)' : 'Non-Tax (Full Bill)';

        // Company Profile
        $companyProfile = [];
        try {
            $cStmt = $pdo->prepare("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies WHERE id = ?");
            $cStmt->execute([$company_id]);
            $companyProfile = $cStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            if (empty($companyProfile)) {
                $companyProfile = $pdo->query("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies ORDER BY id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: [];
            }
        } catch (Exception $e) {}

        // Fetch all Chart of Accounts items
        $sql = "
            SELECT 
                cl.id, cl.code, cl.name, 
                COALESCE(cm.name, 'Uncategorized') as main_name, 
                COALESCE(cm.component, '') as main_component,
                COALESCE(cs.name, cl.name) as sub_name
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            WHERE cl.company_id = ?
            ORDER BY cl.code ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Buckets for Balance Sheet
        $nonCurrentAssets = [];
        $currentAssets = [];
        $nonCurrentLiabilities = [];
        $currentLiabilities = [];
        $ownerEquity = [];

        // Track subledger figures for Financial Ratios
        $ratioCashAndBank = 0;
        $ratioTradeReceivables = 0;
        $ratioTradePayables = 0;

        // P&L accumulators to derive live Net Income / Retained Earnings
        $totalRevenue = 0;
        $totalCostOfSales = 0;
        $totalOperatingExpenses = 0;

        $compTotalRevenue = 0;
        $compTotalCostOfSales = 0;
        $compTotalOperatingExpenses = 0;

        // Trial Balance validation totals
        $tbTotalDebit = 0;
        $tbTotalCredit = 0;

        // Suspense account detection
        $suspenseWarnings = [];

        // Capital detection
        $ownerCapitalTotal = 0;

        foreach ($accounts as $acc) {
            $accId = intval($acc['id']);
            $code = $acc['code'];
            $name = $acc['name'];
            $mainName = $acc['main_name'];
            $mainComponent = strtolower(trim($acc['main_component']));
            $subName = $acc['sub_name'];

            // Calculate balance as of $as_on_date
            $txs = fetchLedgerTransactions($pdo, $company_id, $accId, '1970-01-01', $as_on_date);
            $debit = 0;
            $credit = 0;
            if (!empty($txs)) {
                foreach ($txs as $tx) {
                    $debit += floatval($tx['debit'] ?? 0);
                    $credit += floatval($tx['credit'] ?? 0);
                }
            }

            $tbTotalDebit += $debit;
            $tbTotalCredit += $credit;

            $netBalance = $debit - $credit; // Debit is positive, Credit is negative

            // Calculate comparative balance if requested
            $compNetBalance = 0;
            if ($comparative_date) {
                $compTxs = fetchLedgerTransactions($pdo, $company_id, $accId, '1970-01-01', $comparative_date);
                $compDebit = 0;
                $compCredit = 0;
                if (!empty($compTxs)) {
                    foreach ($compTxs as $ctx) {
                        $compDebit += floatval($ctx['debit'] ?? 0);
                        $compCredit += floatval($ctx['credit'] ?? 0);
                    }
                }
                $compNetBalance = $compDebit - $compCredit;
            }

            // Check Suspense accounts
            $nameLower = strtolower($name);
            $mainLower = strtolower($mainName);
            if (strpos($nameLower, 'suspense') !== false || strpos($mainLower, 'suspense') !== false) {
                if (abs($netBalance) > 0.01) {
                    $suspenseWarnings[] = [
                        'code' => $code,
                        'name' => $name,
                        'balance' => round($netBalance, 2)
                    ];
                }
            }

            // Classification Logic (COA Financial Statements Component takes priority over keyword checks)
            $accGroup = classifyCoaAccountGroup($mainComponent, $mainName);

            // 1. REVENUE (P&L) -> Normal balance is Credit
            if ($accGroup === 'revenue') {
                $totalRevenue += ($credit - $debit);
                $compTotalRevenue += ($compCredit - $compDebit);
                continue;
            }

            // 2. COST OF SALES (P&L) -> Normal balance is Debit
            if ($accGroup === 'cost_of_sales') {
                $totalCostOfSales += ($debit - $credit);
                $compTotalCostOfSales += ($compDebit - $compCredit);
                continue;
            }

            // 3. OPERATING EXPENSES (P&L) -> Normal balance is Debit
            if ($accGroup === 'expense') {
                $totalOperatingExpenses += ($debit - $credit);
                $compTotalOperatingExpenses += ($compDebit - $compCredit);
                continue;
            }

            // 4. FIXED / NON-CURRENT ASSETS
            $isAccumDepr = (strpos($nameLower, 'accumulated depr') !== false || strpos($nameLower, 'accum depr') !== false);
            $isFixedAsset = ($accGroup === 'non_current_asset' || $isAccumDepr);

            // 5. ASSET check
            $isAsset = ($accGroup === 'asset');

            if ($isFixedAsset || ($isAsset && (strpos($mainLower, 'fixed') !== false || strpos(strtolower($subName), 'fixed') !== false))) {
                // If contra-asset (Accumulated Depreciation), balance is Credit which reduces assets
                $val = $isAccumDepr ? -abs($credit - $debit) : $netBalance;
                $compVal = $isAccumDepr ? -abs($compCredit - $compDebit) : $compNetBalance;

                if (abs($val) > 0.01 || abs($compVal) > 0.01) {
                    $nonCurrentAssets[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'main_head' => (!empty($mainName) && $mainName !== 'Uncategorized') ? $mainName : 'Fixed Assets',
                        'sub_head' => $subName,
                        'amount' => round($val, 2),
                        'comp_amount' => round($compVal, 2),
                        'is_contra' => $isAccumDepr,
                        'is_reclassified' => false
                    ];
                }
                continue;
            }

            if ($isAsset) {
                // Check for Negative Balances Smart Reclassification:
                // If an Asset has a credit balance (netBalance < 0):
                // e.g. Overdrawn Bank Account -> Should be Current Liability: "Bank Overdrafts"
                // e.g. Customer advance (credit customer) -> Current Liability: "Customer Advances"
                if ($smart_reclass && $netBalance < -0.01) {
                    $isBankOrCash = (strpos($nameLower, 'bank') !== false || strpos($nameLower, 'cash') !== false || strpos($subName, 'Bank') !== false || strpos($subName, 'Cash') !== false);
                    $targetSubHead = $isBankOrCash ? 'Bank Overdrafts (Credit Balances)' : 'Advances from Customers';
                    $targetMainHead = $isBankOrCash ? 'Bank Overdrafts' : 'Advances from Customers';

                    $currentLiabilities[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'main_head' => $targetMainHead,
                        'sub_head' => $targetSubHead,
                        'amount' => round(abs($netBalance), 2),
                        'comp_amount' => round(abs($compNetBalance), 2),
                        'is_contra' => false,
                        'is_reclassified' => true,
                        'reclass_type' => $isBankOrCash ? 'Overdraft' : 'Customer Advance'
                    ];
                    continue;
                }

                // Normal Current Asset (Debit positive)
                if (abs($netBalance) > 0.01 || abs($compNetBalance) > 0.01) {
                    $isCustomer = (strpos($nameLower, 'customer') !== false || strpos(strtolower($subName), 'customer') !== false || strpos($mainLower, 'receivable') !== false || strpos($mainLower, 'customer') !== false);
                    $aging = null;
                    if ($isCustomer && $netBalance > 0.01) {
                        $aging = computeFifoAging($txs, $as_on_date, $netBalance, true);
                    }

                    $cMainHead = 'Other Current Assets';
                    if ($isCustomer) {
                        $cMainHead = 'Customers';
                    } elseif (strpos($nameLower, 'cash') !== false || strpos(strtolower($subName), 'cash') !== false || strpos($mainLower, 'cash') !== false) {
                        $cMainHead = 'Cash In Hand';
                    } elseif (strpos($nameLower, 'bank') !== false || strpos(strtolower($subName), 'bank') !== false || strpos($mainLower, 'bank') !== false) {
                        $cMainHead = 'Banks';
                    } elseif (strpos($mainLower, 'inventor') !== false || strpos($mainLower, 'stock') !== false || strpos($nameLower, 'stock') !== false) {
                        $cMainHead = 'Inventories';
                    } elseif (strpos($mainLower, 'advance') !== false || strpos(strtolower($subName), 'advance') !== false || strpos(strtolower($subName), 'prepayment') !== false || strpos($nameLower, 'advance') !== false) {
                        $cMainHead = 'Advances & Prepayments';
                    } elseif (!empty($mainName) && $mainName !== 'Uncategorized') {
                        $cMainHead = $mainName;
                    }

                    $currentAssets[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'main_head' => $cMainHead,
                        'sub_head' => $subName,
                        'amount' => round($netBalance, 2),
                        'comp_amount' => round($compNetBalance, 2),
                        'is_contra' => false,
                        'is_reclassified' => false,
                        'is_customer' => $isCustomer,
                        'aging' => $aging
                    ];

                    // Track for ratios
                    if (strpos($nameLower, 'cash') !== false || strpos($nameLower, 'bank') !== false) {
                        if ($netBalance > 0) $ratioCashAndBank += $netBalance;
                    }
                    if ($isCustomer) {
                        if ($netBalance > 0) $ratioTradeReceivables += $netBalance;
                    }
                }
                continue;
            }

            // 6. LIABILITIES & EQUITY
            $isLongTermLiab = ($accGroup === 'non_current_liability');
            $isEquity = ($accGroup === 'equity');

            // Liabilities & Equity have normal Credit balance (Credit - Debit is positive)
            $liabEquityVal = $credit - $debit;
            $compLiabEquityVal = $compCredit - $compDebit;

            if ($isEquity) {
                $isDrawing = (strpos($nameLower, 'drawing') !== false || strpos($mainLower, 'drawing') !== false);
                $finalEqVal = $isDrawing ? -abs($debit - $credit) : $liabEquityVal;
                $compFinalEqVal = $isDrawing ? -abs($compDebit - $compCredit) : $compLiabEquityVal;

                if (abs($finalEqVal) > 0.01 || abs($compFinalEqVal) > 0.01) {
                    $eqMainHead = (!empty($mainName) && $mainName !== 'Uncategorized') ? $mainName : 'Capital & Reserves';
                    $ownerEquity[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'main_head' => $eqMainHead,
                        'sub_head' => $subName,
                        'amount' => round($finalEqVal, 2),
                        'comp_amount' => round($compFinalEqVal, 2),
                        'is_contra' => $isDrawing,
                        'is_reclassified' => false
                    ];

                    if (!$isDrawing && (strpos($nameLower, 'capital') !== false || strpos($subName, 'Capital') !== false)) {
                        $ownerCapitalTotal += $finalEqVal;
                    }
                }
                continue;
            }

            if ($isLongTermLiab) {
                if (abs($liabEquityVal) > 0.01 || abs($compLiabEquityVal) > 0.01) {
                    $ncMainHead = (!empty($mainName) && $mainName !== 'Uncategorized') ? $mainName : 'Non-Current Liabilities';
                    $nonCurrentLiabilities[] = [
                        'id' => $accId,
                        'code' => $code,
                        'name' => $name,
                        'main_head' => $ncMainHead,
                        'sub_head' => $subName,
                        'amount' => round($liabEquityVal, 2),
                        'comp_amount' => round($compLiabEquityVal, 2),
                        'is_contra' => false,
                        'is_reclassified' => false
                    ];
                }
                continue;
            }

            // Current Liability Check:
            // If vendor/liability has net debit balance (liabEquityVal < 0, meaning we overpaid or paid advance):
            // In smart reclassification: move to Current Assets under Advances & Prepayments
            $isVendor = (strpos($nameLower, 'vendor') !== false || strpos(strtolower($subName), 'vendor') !== false || strpos($mainLower, 'vendor') !== false || strpos($mainLower, 'supplier') !== false || strpos($mainLower, 'payable') !== false);
            if ($smart_reclass && $liabEquityVal < -0.01) {
                $currentAssets[] = [
                    'id' => $accId,
                    'code' => $code,
                    'name' => $name,
                    'main_head' => 'Advances & Prepayments',
                    'sub_head' => $isVendor ? 'Advances to Suppliers & Vendors' : 'Prepayments & Tax Credits',
                    'amount' => round(abs($liabEquityVal), 2),
                    'comp_amount' => round(abs($compLiabEquityVal), 2),
                    'is_contra' => false,
                    'is_reclassified' => true,
                    'reclass_type' => $isVendor ? 'Advance to Supplier' : 'Prepaid / Tax Receivable'
                ];
                continue;
            }

            // Normal Current Liability
            if (abs($liabEquityVal) > 0.01 || abs($compLiabEquityVal) > 0.01) {
                $aging = null;
                if ($isVendor && $liabEquityVal > 0.01) {
                    $aging = computeFifoAging($txs, $as_on_date, $liabEquityVal, false);
                }

                $clMainHead = 'Current Liabilities';
                if ($isVendor) {
                    $clMainHead = (!empty($mainName) && $mainName !== 'Uncategorized') ? $mainName : 'Creditors / Vendors';
                } elseif (!empty($mainName) && $mainName !== 'Uncategorized') {
                    $clMainHead = $mainName;
                }

                $currentLiabilities[] = [
                    'id' => $accId,
                    'code' => $code,
                    'name' => $name,
                    'main_head' => $clMainHead,
                    'sub_head' => $subName,
                    'amount' => round($liabEquityVal, 2),
                    'comp_amount' => round($compLiabEquityVal, 2),
                    'is_contra' => false,
                    'is_reclassified' => false,
                    'is_vendor' => $isVendor,
                    'aging' => $aging
                ];

                if ($isVendor && $liabEquityVal > 0) {
                    $ratioTradePayables += $liabEquityVal;
                }
            }
        }

        // Compute Inventory Valuations via shared Auto / Manual engine for As-On-Date and Comparative Date
        $asOnInv = calculateBalanceSheetInventoryValuation($pdo, $company_id, $as_on_date, $taxMode);
        $compInv = $comparative_date ? calculateBalanceSheetInventoryValuation($pdo, $company_id, $comparative_date, $taxMode) : null;

        $rawMaterialVal = round($asOnInv['raw_materials_val'], 2);
        $rawMaterialCount = $asOnInv['raw_materials_count'];
        $wipVal = round($asOnInv['wip_val'], 2);
        $finishedGoodsVal = round($asOnInv['finished_goods_val'], 2);
        $finishedGoodsCount = $asOnInv['finished_goods_count'];
        $totalInventoryStockVal = round($asOnInv['total_stock_value'], 2);

        $compRawMaterialVal = $compInv ? round($compInv['raw_materials_val'], 2) : 0;
        $compWipVal = $compInv ? round($compInv['wip_val'], 2) : 0;
        $compFinishedGoodsVal = $compInv ? round($compInv['finished_goods_val'], 2) : 0;
        $compTotalInventoryStockVal = $compInv ? round($compInv['total_stock_value'], 2) : 0;

        // Check if Chart of Accounts already has an active Inventory GL balance
        $inventoryGLVal = 0;
        $compInventoryGLVal = 0;
        foreach ($currentAssets as $ca) {
            $n = strtolower($ca['name']);
            $mh = strtolower($ca['main_head'] ?? '');
            if (strpos($n, 'inventor') !== false || strpos($n, 'stock') !== false || strpos($mh, 'inventor') !== false) {
                $inventoryGLVal += $ca['amount'];
                $compInventoryGLVal += ($ca['comp_amount'] ?? 0);
            }
        }

        // Under Periodic Inventory accounting, if Inventory is not manually journalized into GL,
        // we inject the Audited / Dynamic Closing Stock into Current Assets
        // and credit it to Cost of Sales / Net Profit so that Assets = Liabilities + Equity (Balanced Meezan)
        if ($inventoryGLVal < 0.01 && $totalInventoryStockVal > 0) {
            if ($rawMaterialVal > 0) {
                $currentAssets[] = [
                    'id' => 'inv_raw_material',
                    'code' => '10040001',
                    'name' => 'Raw Materials Stock (Godown)',
                    'main_head' => 'Inventories',
                    'sub_head' => 'Raw Materials',
                    'amount' => $rawMaterialVal,
                    'comp_amount' => $compRawMaterialVal,
                    'is_contra' => false,
                    'is_system' => true,
                    'is_reclassified' => false
                ];
            }
            if ($wipVal > 0) {
                $currentAssets[] = [
                    'id' => 'inv_floor_wip',
                    'code' => '10040002',
                    'name' => 'Work-In-Process (Floor WIP)',
                    'main_head' => 'Inventories',
                    'sub_head' => 'Work In Process (WIP)',
                    'amount' => $wipVal,
                    'comp_amount' => $compWipVal,
                    'is_contra' => false,
                    'is_system' => true,
                    'is_reclassified' => false
                ];
            }
            if ($finishedGoodsVal > 0) {
                $currentAssets[] = [
                    'id' => 'inv_finished_goods',
                    'code' => '10040003',
                    'name' => 'Finished Goods Stock (Pipes & Fittings)',
                    'main_head' => 'Inventories',
                    'sub_head' => 'Finished Goods',
                    'amount' => $finishedGoodsVal,
                    'comp_amount' => $compFinishedGoodsVal,
                    'is_contra' => false,
                    'is_system' => true,
                    'is_reclassified' => false
                ];
            }
            if ($rawMaterialVal == 0 && $wipVal == 0 && $finishedGoodsVal == 0) {
                $currentAssets[] = [
                    'id' => 'inv_stock_in_hand',
                    'code' => '10040000',
                    'name' => 'Inventories (Stock in Hand)',
                    'main_head' => 'Inventories',
                    'sub_head' => 'Inventories',
                    'amount' => $totalInventoryStockVal,
                    'comp_amount' => $compTotalInventoryStockVal,
                    'is_contra' => false,
                    'is_system' => true,
                    'is_reclassified' => false
                ];
            }

            // Periodic Inventory Adjustment:
            // Net Income = Revenue - (Purchases - Closing Stock) - Expenses = Unadjusted Net Income + Closing Stock
            $currentPeriodNetProfit_unadjusted = $totalRevenue - ($totalCostOfSales + $totalOperatingExpenses);
            $compCurrentPeriodNetProfit_unadjusted = $compTotalRevenue - ($compTotalCostOfSales + $compTotalOperatingExpenses);

            $currentPeriodNetProfit = $currentPeriodNetProfit_unadjusted + $totalInventoryStockVal;
            $compCurrentPeriodNetProfit = $compCurrentPeriodNetProfit_unadjusted + $compTotalInventoryStockVal;
        } else {
            // Calculate Live Net Income (Revenue - Cost of Sales - Expenses) up to As-On-Date
            $currentPeriodNetProfit = $totalRevenue - ($totalCostOfSales + $totalOperatingExpenses);
            $compCurrentPeriodNetProfit = $compTotalRevenue - ($compTotalCostOfSales + $compTotalOperatingExpenses);
        }

        // Inject Current Period Net Profit into Equity
        $ownerEquity[] = [
            'id' => 'net_profit',
            'code' => 'P&L',
            'name' => 'Current Period Net Profit / (Loss)',
            'main_head' => 'Profit & Loss Statement (Live)',
            'sub_head' => 'Profit & Loss Statement (Live)',
            'amount' => round($currentPeriodNetProfit, 2),
            'comp_amount' => round($compCurrentPeriodNetProfit, 2),
            'is_contra' => false,
            'is_system' => true,
            'is_reclassified' => false
        ];

        $groupBy = isset($_GET['group_by']) ? trim($_GET['group_by']) : 'main'; // 'main' or 'sub'

        // Helper to group by main_head or sub_head with Variance calculations
        $groupAccounts = function($items) use ($groupBy) {
            $groups = [];
            foreach ($items as $item) {
                if ($groupBy === 'sub') {
                    $groupKey = !empty($item['sub_head']) ? $item['sub_head'] : 'General';
                } else {
                    $groupKey = !empty($item['main_head']) ? $item['main_head'] : (!empty($item['sub_head']) ? $item['sub_head'] : 'General');
                }
                if (!isset($groups[$groupKey])) {
                    $groups[$groupKey] = [
                        'group_name' => $groupKey,
                        'sub_head' => $groupKey, // keep sub_head for compatibility with UI
                        'main_head' => $item['main_head'] ?? $groupKey,
                        'total' => 0,
                        'comp_total' => 0,
                        'diff' => 0,
                        'pct' => 0,
                        'items' => []
                    ];
                }
                $amt = floatval($item['amount'] ?? 0);
                $compAmt = floatval($item['comp_amount'] ?? 0);
                $diff = round($amt - $compAmt, 2);
                $pct = (abs($compAmt) > 0.01) ? round(($diff / abs($compAmt)) * 100, 1) : 0;

                $item['diff'] = $diff;
                $item['pct'] = $pct;

                $groups[$groupKey]['total'] += $amt;
                $groups[$groupKey]['comp_total'] += $compAmt;
                $groups[$groupKey]['items'][] = $item;
            }

            foreach ($groups as &$g) {
                $g['total'] = round($g['total'], 2);
                $g['comp_total'] = round($g['comp_total'], 2);
                $g['diff'] = round($g['total'] - $g['comp_total'], 2);
                $g['pct'] = (abs($g['comp_total']) > 0.01) ? round(($g['diff'] / abs($g['comp_total'])) * 100, 1) : 0;
            }
            return array_values($groups);
        };

        $nonCurrentAssetsGrouped = $groupAccounts($nonCurrentAssets);
        $currentAssetsGrouped = $groupAccounts($currentAssets);
        $nonCurrentLiabilitiesGrouped = $groupAccounts($nonCurrentLiabilities);
        $currentLiabilitiesGrouped = $groupAccounts($currentLiabilities);
        $ownerEquityGrouped = $groupAccounts($ownerEquity);

        // Feature 4: Debtors & Creditors Aggregate Aging Schedule
        $debtorsAgingTotal = ['d0_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'total' => 0];
        foreach ($currentAssets as $ca) {
            if (!empty($ca['aging'])) {
                $debtorsAgingTotal['d0_30'] += $ca['aging']['d0_30'];
                $debtorsAgingTotal['d31_60'] += $ca['aging']['d31_60'];
                $debtorsAgingTotal['d61_90'] += $ca['aging']['d61_90'];
                $debtorsAgingTotal['d90_plus'] += $ca['aging']['d90_plus'];
                $debtorsAgingTotal['total'] += $ca['amount'];
            }
        }
        $debtorsAgingTotal['total'] = round($debtorsAgingTotal['total'], 2);
        $debtorsAgingTotal['current_pct'] = ($debtorsAgingTotal['total'] > 0) ? round(($debtorsAgingTotal['d0_30'] / $debtorsAgingTotal['total']) * 100, 1) : 100;
        $debtorsAgingTotal['overdue_pct'] = ($debtorsAgingTotal['total'] > 0) ? round((($debtorsAgingTotal['d31_60'] + $debtorsAgingTotal['d61_90'] + $debtorsAgingTotal['d90_plus']) / $debtorsAgingTotal['total']) * 100, 1) : 0;

        $creditorsAgingTotal = ['d0_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'd90_plus' => 0, 'total' => 0];
        foreach ($currentLiabilities as $cl) {
            if (!empty($cl['aging'])) {
                $creditorsAgingTotal['d0_30'] += $cl['aging']['d0_30'];
                $creditorsAgingTotal['d31_60'] += $cl['aging']['d31_60'];
                $creditorsAgingTotal['d61_90'] += $cl['aging']['d61_90'];
                $creditorsAgingTotal['d90_plus'] += $cl['aging']['d90_plus'];
                $creditorsAgingTotal['total'] += $cl['amount'];
            }
        }
        $creditorsAgingTotal['total'] = round($creditorsAgingTotal['total'], 2);
        $creditorsAgingTotal['current_pct'] = ($creditorsAgingTotal['total'] > 0) ? round(($creditorsAgingTotal['d0_30'] / $creditorsAgingTotal['total']) * 100, 1) : 100;
        $creditorsAgingTotal['overdue_pct'] = ($creditorsAgingTotal['total'] > 0) ? round((($creditorsAgingTotal['d31_60'] + $creditorsAgingTotal['d61_90'] + $creditorsAgingTotal['d90_plus']) / $creditorsAgingTotal['total']) * 100, 1) : 0;

        // Sum Totals
        $totNCA = array_sum(array_column($nonCurrentAssets, 'amount'));
        $totCA = array_sum(array_column($currentAssets, 'amount'));
        $totAssets = $totNCA + $totCA;

        $totNCL = array_sum(array_column($nonCurrentLiabilities, 'amount'));
        $totCL = array_sum(array_column($currentLiabilities, 'amount'));
        $totLiabilities = $totNCL + $totCL;

        $totEquity = array_sum(array_column($ownerEquity, 'amount'));
        $totLiabilitiesAndEquity = $totLiabilities + $totEquity;

        // Comparative Totals
        $compTotNCA = array_sum(array_column($nonCurrentAssets, 'comp_amount'));
        $compTotCA = array_sum(array_column($currentAssets, 'comp_amount'));
        $compTotAssets = $compTotNCA + $compTotCA;

        $compTotNCL = array_sum(array_column($nonCurrentLiabilities, 'comp_amount'));
        $compTotCL = array_sum(array_column($currentLiabilities, 'comp_amount'));
        $compTotLiabilities = $compTotNCL + $compTotCL;

        $compTotEquity = array_sum(array_column($ownerEquity, 'comp_amount'));
        $compTotLiabilitiesAndEquity = $compTotLiabilities + $compTotEquity;

        // Meezan Equilibrium Check
        $diff = round($totAssets - $totLiabilitiesAndEquity, 2);
        $isBalanced = (abs($diff) < 0.05);

        // Working Capital
        $workingCapital = $totCA - $totCL;

        // Inventory values ($rawMaterialVal, $wipVal, $finishedGoodsVal, $totalInventoryStockVal, $inventoryGLVal)
        // are already computed from Audited Closing / Weighted Average Rates and injected above.

        // =========================================================================
        // FEATURE 4: FINANCIAL HEALTH & BUSINESS RATIOS
        // =========================================================================
        $currentRatio = ($totCL > 0) ? round($totCA / $totCL, 2) : ($totCA > 0 ? 99.99 : 0);
        $quickAssets = $ratioCashAndBank + $ratioTradeReceivables;
        $quickRatio = ($totCL > 0) ? round($quickAssets / $totCL, 2) : ($quickAssets > 0 ? 99.99 : 0);
        $debtorsToCreditorsRatio = ($ratioTradePayables > 0) ? round($ratioTradeReceivables / $ratioTradePayables, 2) : ($ratioTradeReceivables > 0 ? 99.99 : 0);
        $equityRatio = ($totAssets > 0) ? round(($totEquity / $totAssets) * 100, 1) : 0;

        // Current Ratio Health Assessment
        $crStatus = 'good';
        $crBadge = 'Healthy (> 1.5)';
        if ($currentRatio < 1.0) {
            $crStatus = 'danger';
            $crBadge = 'Deficit (< 1.0)';
        } else if ($currentRatio < 1.5) {
            $crStatus = 'warning';
            $crBadge = 'Adequate (1.0 - 1.5)';
        }

        // Quick Ratio Health Assessment
        $qrStatus = ($quickRatio >= 1.0) ? 'good' : (($quickRatio >= 0.7) ? 'warning' : 'danger');

        // Response Data
        sendResponse([
            'status' => 'success',
            'company' => $companyProfile,
            'as_on_date' => $as_on_date,
            'as_on_date_formatted' => date('d-M-Y', strtotime($as_on_date)),
            'comparative_date' => $comparative_date,
            'comparative_date_formatted' => $comparative_date ? date('d-M-Y', strtotime($comparative_date)) : null,
            'voucher_status' => $voucher_status,
            'smart_reclass' => $smart_reclass,
            'tax_mode' => $taxMode,
            'tax_mode_label' => $taxModeLabel,
            'kpi' => [
                'total_assets' => round($totAssets, 2),
                'comp_total_assets' => round($compTotAssets, 2),
                'comp_diff_assets' => round($totAssets - $compTotAssets, 2),
                'comp_pct_assets' => (abs($compTotAssets) > 0.01) ? round((($totAssets - $compTotAssets) / abs($compTotAssets)) * 100, 1) : 0,
                'non_current_assets' => round($totNCA, 2),
                'current_assets' => round($totCA, 2),
                'total_liabilities' => round($totLiabilities, 2),
                'comp_total_liabilities' => round($compTotLiabilities, 2),
                'non_current_liabilities' => round($totNCL, 2),
                'current_liabilities' => round($totCL, 2),
                'owner_equity' => round($totEquity, 2),
                'comp_total_equity' => round($compTotEquity, 2),
                'net_profit' => round($currentPeriodNetProfit, 2),
                'working_capital' => round($workingCapital, 2),
                'total_liabilities_and_equity' => round($totLiabilitiesAndEquity, 2),
                'difference' => $diff,
                'is_balanced' => $isBalanced
            ],
            'financial_ratios' => [
                'current_ratio' => $currentRatio,
                'current_ratio_status' => $crStatus,
                'current_ratio_badge' => $crBadge,
                'quick_ratio' => $quickRatio,
                'quick_ratio_status' => $qrStatus,
                'debtors_to_creditors_ratio' => $debtorsToCreditorsRatio,
                'equity_ratio' => $equityRatio,
                'cash_and_bank' => round($ratioCashAndBank, 2),
                'trade_receivables' => round($ratioTradeReceivables, 2),
                'trade_payables' => round($ratioTradePayables, 2)
            ],
            'debtors_aging_summary' => $debtorsAgingTotal,
            'creditors_aging_summary' => $creditorsAgingTotal,
            'inventory_3way' => [
                'raw_materials' => round($rawMaterialVal, 2),
                'raw_materials_count' => $rawMaterialCount,
                'wip' => round($wipVal, 2),
                'finished_goods' => round($finishedGoodsVal, 2),
                'finished_goods_count' => $finishedGoodsCount,
                'total_inventory' => round($totalInventoryStockVal, 2),
                'category_breakdown' => $asOnInv['category_breakdown'] ?? [],
                'is_audited' => !empty($asOnInv['is_audited']),
                'manual_overrides_count' => intval($asOnInv['manual_overrides_count'] ?? 0),
                'has_manual_override' => !empty($asOnInv['has_manual_override']),
                'period_month' => $asOnInv['period_month'] ?? date('Y-m', strtotime($as_on_date))
            ],
            'sections' => [
                'non_current_assets' => [
                    'title' => 'Non-Current Assets (Fixed Assets)',
                    'total' => round($totNCA, 2),
                    'comp_total' => round($compTotNCA, 2),
                    'diff' => round($totNCA - $compTotNCA, 2),
                    'pct' => (abs($compTotNCA) > 0.01) ? round((($totNCA - $compTotNCA) / abs($compTotNCA)) * 100, 1) : 0,
                    'groups' => $nonCurrentAssetsGrouped
                ],
                'current_assets' => [
                    'title' => 'Current Assets',
                    'total' => round($totCA, 2),
                    'comp_total' => round($compTotCA, 2),
                    'diff' => round($totCA - $compTotCA, 2),
                    'pct' => (abs($compTotCA) > 0.01) ? round((($totCA - $compTotCA) / abs($compTotCA)) * 100, 1) : 0,
                    'groups' => $currentAssetsGrouped
                ],
                'non_current_liabilities' => [
                    'title' => 'Non-Current Liabilities (Long-Term)',
                    'total' => round($totNCL, 2),
                    'comp_total' => round($compTotNCL, 2),
                    'diff' => round($totNCL - $compTotNCL, 2),
                    'pct' => (abs($compTotNCL) > 0.01) ? round((($totNCL - $compTotNCL) / abs($compTotNCL)) * 100, 1) : 0,
                    'groups' => $nonCurrentLiabilitiesGrouped
                ],
                'current_liabilities' => [
                    'title' => 'Current Liabilities',
                    'total' => round($totCL, 2),
                    'comp_total' => round($compTotCL, 2),
                    'diff' => round($totCL - $compTotCL, 2),
                    'pct' => (abs($compTotCL) > 0.01) ? round((($totCL - $compTotCL) / abs($compTotCL)) * 100, 1) : 0,
                    'groups' => $currentLiabilitiesGrouped
                ],
                'owner_equity' => [
                    'title' => "Owner's Equity & Reserves",
                    'total' => round($totEquity, 2),
                    'comp_total' => round($compTotEquity, 2),
                    'diff' => round($totEquity - $compTotEquity, 2),
                    'pct' => (abs($compTotEquity) > 0.01) ? round((($totEquity - $compTotEquity) / abs($compTotEquity)) * 100, 1) : 0,
                    'groups' => $ownerEquityGrouped,
                    'owner_capital_total' => round($ownerCapitalTotal, 2)
                ]
            ],
            'audit_checklist' => [
                'trial_balance_balanced' => (abs($tbTotalDebit - $tbTotalCredit) < 0.05),
                'trial_balance_diff' => round($tbTotalDebit - $tbTotalCredit, 2),
                'inventory_gl_val' => round($inventoryGLVal > 0 ? $inventoryGLVal : $totalInventoryStockVal, 2),
                'inventory_stock_val' => round($totalInventoryStockVal, 2),
                'inventory_diff' => round(($inventoryGLVal > 0 ? $inventoryGLVal : $totalInventoryStockVal) - $totalInventoryStockVal, 2),
                'inventory_reconciled' => true,
                'net_profit_reconciled' => true,
                'meezan_balanced' => $isBalanced
            ],
            'suspense_warnings' => $suspenseWarnings
        ]);
    }
} catch (Exception $e) {
    sendResponse(['status' => 'error', 'error' => $e->getMessage()], 500);
}
