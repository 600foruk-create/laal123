<?php
require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/account_ledger.php';
header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? 1);

// =========================================================================
// 0. AUTO-MIGRATION: Ensure Monthly WIP Snapshot Table Exists
// =========================================================================
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS mfg_monthly_wip (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 1,
            year INT NOT NULL,
            month INT NOT NULL,
            opening_wip_qty DECIMAL(15,2) DEFAULT 0,
            opening_wip_val DECIMAL(15,2) DEFAULT 0,
            material_issued_qty DECIMAL(15,2) DEFAULT 0,
            material_issued_val DECIMAL(15,2) DEFAULT 0,
            finished_prod_qty DECIMAL(15,2) DEFAULT 0,
            scrap_qty DECIMAL(15,2) DEFAULT 0,
            closing_wip_qty DECIMAL(15,2) DEFAULT 0,
            closing_wip_val DECIMAL(15,2) DEFAULT 0,
            electricity_cost DECIMAL(15,2) DEFAULT 0,
            labor_cost DECIMAL(15,2) DEFAULT 0,
            overhead_cost DECIMAL(15,2) DEFAULT 0,
            per_kg_cost DECIMAL(15,4) DEFAULT 0,
            is_locked TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_co_yr_mo (company_id, year, month)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
} catch (Exception $e) {}

// Ensure material_issue_notes has formula columns for category linking
try { $pdo->exec("ALTER TABLE material_issue_notes ADD COLUMN formula_id INT DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE material_issue_notes ADD COLUMN formula_qty DECIMAL(15,2) DEFAULT NULL"); } catch (Exception $e) {}

// =========================================================================
// HELPER: Fetch Company Profile
// =========================================================================
function getCompanyProfile($pdo, $company_id) {
    try {
        $cStmt = $pdo->prepare("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies WHERE id = ?");
        $cStmt->execute([$company_id]);
        $row = $cStmt->fetch(PDO::FETCH_ASSOC);
        if ($row) return $row;
        $cStmt2 = $pdo->query("SELECT id, name, address, phone, fax, email, website, gst, ntn, logo_data FROM companies ORDER BY id ASC LIMIT 1");
        return $cStmt2->fetch(PDO::FETCH_ASSOC) ?: [];
    } catch (Exception $e) {
        return [];
    }
}

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

    // Exclude 50001 / Materials & Inventory accounts (raw materials are already costed via Formulas / MIN)
    if ($subCode === '50001' || $subLower === 'materials' || $subLower === 'material') {
        return null;
    }
    $materialTerms = ['opening inventory', 'purchases', 'purchase return', 'carriage & freight inward', 'cost of inventory', 'closing inventory', 'work in process', 'finished goods'];
    foreach ($materialTerms as $term) {
        if (strpos($accLower, $term) !== false) {
            return null;
        }
    }

    // Exclude general administrative-type sub-heads placed under 500
    $excludedTerms = ['printing', 'statinery', 'stationery', 'entertainment'];
    foreach ($excludedTerms as $term) {
        if (strpos($subLower, $term) !== false || strpos($accLower, $term) !== false) {
            return null;
        }
    }

    // Labor & Factory Salaries / Wages
    if (strpos($subLower, 'labour') !== false || strpos($subLower, 'labor') !== false || strpos($subLower, 'wage') !== false) {
        return 'labor';
    }
    $laborTerms = ['salary', 'salaries', 'allowance', 'wage', 'labour', 'labor', 'payroll', 'overtime'];
    foreach ($laborTerms as $term) {
        if (strpos($accLower, $term) !== false) {
            return 'labor';
        }
    }

    // Repairs & Maintenance (including Electrical Repairs) stay in Overheads, not Electricity bill
    if (strpos($subLower, 'repair') !== false || strpos($subLower, 'maint') !== false
        || strpos($accLower, 'repair') !== false || strpos($accLower, 'maint') !== false) {
        return 'overhead';
    }

    // Power / Utility Bills
    $elecTerms = ['electric', 'pesco', 'wapda', 'iesco', 'lesco', 'mepco', 'fesco', 'gepco', 'hesco', 'qesco', 'k-electric', 'ke bill', 'power', 'utility', 'utilities'];
    foreach ($elecTerms as $term) {
        if (strpos($accLower, $term) !== false || strpos($subLower, $term) !== false) {
            return 'electricity';
        }
    }

    return 'overhead';
}

/**
 * Fetches period (from_date..to_date) net factory overheads from posted Cash/Bank/Journal vouchers
 * via fetchLedgerTransactions, excluding opening balances.
 */
function fetchAutoFactoryOverheads($pdo, $company_id, $from_date, $to_date) {
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

// =========================================================================
// 1. GET METADATA
// =========================================================================
if ($action === 'get_meta') {
    try {
        $compRow = getCompanyProfile($pdo, $company_id);

        // Finished Goods (Products)
        $stmtFG = $pdo->prepare("
            SELECT i.id, i.code, i.name, i.unit, i.category_type,
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton
            FROM inv_items i
            WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY i.name ASC
        ");
        $stmtFG->execute([$company_id]);
        $allItems = $stmtFG->fetchAll(PDO::FETCH_ASSOC);

        $finishedItems = [];
        $rawItems = [];
        foreach ($allItems as $it) {
            $cat = strtoupper(trim($it['category_type'] ?? ''));
            $nm = strtoupper(trim($it['name'] ?? ''));
            if ($cat === 'FINISHED' || $cat === 'FINISHED GOODS' || strpos($cat, 'FINISH') !== false ||
                strpos($nm, 'PIPE') !== false || strpos($nm, 'FITTING') !== false || strpos($nm, 'BEND') !== false || strpos($nm, 'TEE') !== false) {
                $finishedItems[] = $it;
            } else {
                $rawItems[] = $it;
            }
        }

        // Categories / Brands (from inv_main_categories)
        $stmtCats = $pdo->prepare("
            SELECT DISTINCT m.id, m.code, m.name
            FROM inv_main_categories m
            JOIN inv_sub_categories s ON s.main_id = m.id
            JOIN inv_items i ON i.sub_id = s.id
            WHERE (m.company_id = ? OR m.company_id = 1 OR m.company_id IS NULL OR m.company_id = 0)
              AND (i.company_id = ? OR i.company_id = 1 OR i.company_id IS NULL)
              AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ORDER BY m.name ASC
        ");
        $stmtCats->execute([$company_id, $company_id]);
        $categories = $stmtCats->fetchAll(PDO::FETCH_ASSOC);

        if (empty($categories)) {
            $stmtCats = $pdo->prepare("
                SELECT DISTINCT m.id, m.code, m.name
                FROM inv_main_categories m
                JOIN inv_sub_categories s ON s.main_id = m.id
                JOIN inv_items i ON i.sub_id = s.id
                WHERE (i.is_inactive = 0 OR i.is_inactive IS NULL)
                ORDER BY m.name ASC
            ");
            $stmtCats->execute();
            $categories = $stmtCats->fetchAll(PDO::FETCH_ASSOC);
        }

        if (empty($categories)) {
            $stmtAllCats = $pdo->prepare("
                SELECT DISTINCT id, code, name 
                FROM inv_main_categories 
                WHERE (company_id = ? OR company_id = 1 OR company_id IS NULL OR company_id = 0)
                ORDER BY name ASC
            ");
            $stmtAllCats->execute([$company_id]);
            $categories = $stmtAllCats->fetchAll(PDO::FETCH_ASSOC);
        }

        if (empty($categories)) {
            $categories = $pdo->query("SELECT id, code, name FROM inv_main_categories ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
        }

        // Expense Accounts for Electricity, Wages & Overheads (aligned with Cost of Sales COA mapping)
        $stmtAcc = $pdo->prepare("
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
        $stmtAcc->execute([$company_id]);
        $expenseAccounts = [];
        foreach ($stmtAcc->fetchAll(PDO::FETCH_ASSOC) as $accRow) {
            $bucket = classifyFactoryOverheadAccount($accRow);
            if ($bucket !== null) {
                $expenseAccounts[] = [
                    'id' => $accRow['id'],
                    'code' => $accRow['code'],
                    'name' => $accRow['name'],
                    'sub_name' => $accRow['sub_name'],
                    'bucket' => $bucket
                ];
            }
        }

        $today = date('Y-m-d');
        $firstOfMonth = date('Y-m-01');
        $lastOfMonth = date('Y-m-t');

        echo json_encode([
            'status' => 'success',
            'company' => $compRow,
            'categories' => $categories,
            'finished_items' => $finishedItems,
            'raw_materials' => $rawItems,
            'expense_accounts' => $expenseAccounts,
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
// 2. GET MANUFACTURING COSTING & PRODUCTION STATEMENT
// =========================================================================
if ($action === 'get_costing_statement') {
    try {
        $from_date = $_GET['from_date'] ?? date('Y-m-01');
        $to_date = $_GET['to_date'] ?? date('Y-m-t');
        $product_id = $_GET['product_id'] ?? 'all';
        $category_id = $_GET['category_id'] ?? $product_id;

        // Brand / Category Material Issue filter
        // Only count material issues that were created using formulas belonging to the selected category
        $catMinFilter = "";
        $catHistProdFilter = "";
        if ($category_id !== 'all' && intval($category_id) > 0) {
            $catIdInt = intval($category_id);
            $catMinFilter = " AND m.formula_id IN (SELECT f.id FROM formulas f WHERE f.category_id = $catIdInt)";
            $catHistProdFilter = " AND pp.item_id IN (SELECT i2.id FROM inv_items i2 JOIN inv_sub_categories s2 ON i2.sub_id = s2.id WHERE s2.main_id = $catIdInt)";
        }

        // Manual or auto expense inputs
        $manual_electricity = floatval($_GET['electricity_cost'] ?? 0);
        $manual_labor = floatval($_GET['labor_cost'] ?? 0);
        $manual_overheads = floatval($_GET['overhead_cost'] ?? 0);
        $expense_mode = $_GET['expense_mode'] ?? 'manual'; // 'manual' by default, or 'auto'

        $compRow = getCompanyProfile($pdo, $company_id);

        $fromTime = strtotime($from_date);
        $toTime = strtotime($to_date);
        $fromYear = intval(date('Y', $fromTime));
        $fromMonth = intval(date('n', $fromTime));

        // Format Period Labels
        $periodLabel = date('d-M-Y', $fromTime) . ' to ' . date('d-M-Y', $toTime);
        $prevMonthTimestamp = strtotime('-1 month', $fromTime);
        $prevDateLabel = date('M-Y', $prevMonthTimestamp);
        $currentPeriodLabel = date('M-Y', $fromTime);
        $nextMonthTimestamp = strtotime('+1 month', $fromTime);
        $nextDateLabel = date('M-Y', $nextMonthTimestamp);

        // -----------------------------------------------------------------
        // A. Work-in-Process (WIP) Opening Balance from Previous Month
        // -----------------------------------------------------------------
        $openingWipQty = 0;
        $openingWipVal = 0;

        // Try to fetch saved closing from mfg_monthly_wip for previous month
        $prevYr = intval(date('Y', $prevMonthTimestamp));
        $prevMo = intval(date('n', $prevMonthTimestamp));
        $stmtWipPrev = $pdo->prepare("
            SELECT closing_wip_qty, closing_wip_val 
            FROM mfg_monthly_wip 
            WHERE company_id = ? AND year = ? AND month = ?
        ");
        $stmtWipPrev->execute([$company_id, $prevYr, $prevMo]);
        $savedWip = $stmtWipPrev->fetch(PDO::FETCH_ASSOC);

        if ($savedWip && floatval($savedWip['closing_wip_qty']) > 0 && ($category_id === 'all' || empty($category_id))) {
            $openingWipQty = floatval($savedWip['closing_wip_qty']);
            $openingWipVal = floatval($savedWip['closing_wip_val']);
        } else {
            // Recalculate historical net WIP before $from_date:
            // Cumulative Raw Material Issued minus Cumulative Finished Goods Produced minus Scrap
            $stmtHistIssue = $pdo->prepare("
                SELECT COALESCE(SUM(mii.qty), 0) as total_issued_qty,
                       COALESCE(SUM(mii.amount), 0) as total_issued_val
                FROM material_issue_note_items mii
                JOIN material_issue_notes m ON mii.min_id = m.id
                WHERE m.company_id = ? AND m.is_cancelled = 0 AND m.is_posted = 1
                  $catMinFilter
                  AND m.date < ?
            ");
            $stmtHistIssue->execute([$company_id, $from_date]);
            $histIss = $stmtHistIssue->fetch(PDO::FETCH_ASSOC);
            $histIssQty = floatval($histIss['total_issued_qty'] ?? 0);
            $histIssVal = floatval($histIss['total_issued_val'] ?? 0);

            $stmtHistProd = $pdo->prepare("
                SELECT COALESCE(SUM(pp.qty), 0) as total_prod_qty
                FROM production_note_items pp
                JOIN production_notes p ON pp.pn_id = p.id
                WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1
                  $catHistProdFilter
                  AND p.date < ?
            ");
            $stmtHistProd->execute([$company_id, $from_date]);
            $histProd = $stmtHistProd->fetch(PDO::FETCH_ASSOC);
            $histProdQty = floatval($histProd['total_prod_qty'] ?? 0);

            $histDiff = $histIssQty - $histProdQty;
            if ($histDiff > 0) {
                $openingWipQty = $histDiff;
                $avgIssRate = ($histIssQty > 0) ? ($histIssVal / $histIssQty) : 220.0;
                $openingWipVal = $openingWipQty * $avgIssRate;
            }
        }

        // -----------------------------------------------------------------
        // B. Raw Material Issued to Production for Selected Period
        // -----------------------------------------------------------------
        $stmtPeriodIssue = $pdo->prepare("
            SELECT COALESCE(SUM(mii.qty), 0) as period_issued_qty,
                   COALESCE(SUM(mii.amount), 0) as period_issued_val
            FROM material_issue_note_items mii
            JOIN material_issue_notes m ON mii.min_id = m.id
            WHERE m.company_id = ? AND m.is_cancelled = 0 AND m.is_posted = 1
              $catMinFilter
              AND m.date BETWEEN ? AND ?
        ");
        $stmtPeriodIssue->execute([$company_id, $from_date, $to_date]);
        $periodIssRow = $stmtPeriodIssue->fetch(PDO::FETCH_ASSOC);
        $periodIssuedQty = floatval($periodIssRow['period_issued_qty'] ?? 0);
        $periodIssuedVal = floatval($periodIssRow['period_issued_val'] ?? 0);

        // Fallback to average cost valuation if amount in material_issue_note_items is zero
        if ($periodIssuedVal <= 0 && $periodIssuedQty > 0) {
            $stmtDefPrice = $pdo->query("SELECT AVG(purchase_price) as avg_p FROM inv_items WHERE company_id = $company_id AND purchase_price > 0");
            $defPrice = floatval($stmtDefPrice->fetchColumn() ?: 225.0);
            $periodIssuedVal = $periodIssuedQty * $defPrice;
        }

        // -----------------------------------------------------------------
        // C. Finished Goods Production Output for Selected Period
        // -----------------------------------------------------------------
        $itemFilterCond = "";
        if ($category_id !== 'all' && intval($category_id) > 0) {
            $itemFilterCond = " AND s.main_id = " . intval($category_id);
        } elseif ($product_id !== 'all' && intval($product_id) > 0) {
            $itemFilterCond = " AND pp.item_id = " . intval($product_id);
        }

        $stmtProd = $pdo->prepare("
            SELECT pp.item_id, i.code as product_code, i.name as product_name, i.unit,
                   COALESCE(s.main_id, 0) as category_id,
                   COALESCE(m.name, '') as category_name,
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton,
                   SUM(pp.qty) as produced_qty,
                   SUM(pp.pieces) as produced_pieces,
                   SUM(pp.amount) as recorded_amount
            FROM production_note_items pp
            JOIN production_notes p ON pp.pn_id = p.id
            JOIN inv_items i ON pp.item_id = i.id
            LEFT JOIN inv_sub_categories s ON i.sub_id = s.id
            LEFT JOIN inv_main_categories m ON s.main_id = m.id
            WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1
              AND p.date BETWEEN ? AND ?
              $itemFilterCond
            GROUP BY pp.item_id, i.code, i.name, i.unit, s.main_id, m.name, i.unit_weight, i.qty_per_piece, i.carton
            ORDER BY i.name ASC
        ");
        $stmtProd->execute([$company_id, $from_date, $to_date]);
        $producedItems = $stmtProd->fetchAll(PDO::FETCH_ASSOC);

        $totalFinishedProdQty = 0; // Total Finished Goods produced (KG)
        $totalFinishedPieces = 0;

        foreach ($producedItems as &$pItem) {
            $calc = calcProducedItemWeightKg(
                $pItem['produced_qty'] ?? 0,
                $pItem['produced_pieces'] ?? 0,
                $pItem['unit'] ?? '',
                $pItem['unit_weight'] ?? 0,
                $pItem['qty_per_piece'] ?? 0,
                $pItem['carton'] ?? 0
            );
            $pItem['produced_pieces'] = $calc['pieces'];
            $pItem['weight_kg'] = $calc['weight_kg'];
            $pItem['unit_weight_calc'] = $calc['unit_weight'];
            $totalFinishedProdQty += $calc['weight_kg'];
            $totalFinishedPieces += $calc['pieces'];
        }
        unset($pItem);

        // Compute full-factory production weight for proportional auto-fetch scaling when filtered by brand/product
        $factoryTotalFinishedProdQty = $totalFinishedProdQty;
        $isFilteredProduction = (($category_id !== 'all' && intval($category_id) > 0) || ($product_id !== 'all' && intval($product_id) > 0));
        if ($isFilteredProduction && $expense_mode === 'auto') {
            $factoryTotalFinishedProdQty = 0;
            try {
                $stmtAllProd = $pdo->prepare("
                    SELECT SUM(pp.qty) as produced_qty, SUM(pp.pieces) as produced_pieces,
                           i.unit, COALESCE(i.unit_weight, 0) as unit_weight,
                           COALESCE(i.qty_per_piece, 0) as qty_per_piece, COALESCE(i.carton, 0) as carton
                    FROM production_note_items pp
                    JOIN production_notes p ON pp.pn_id = p.id
                    JOIN inv_items i ON pp.item_id = i.id
                    WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1
                      AND p.date BETWEEN ? AND ?
                    GROUP BY pp.item_id, i.unit, i.unit_weight, i.qty_per_piece, i.carton
                ");
                $stmtAllProd->execute([$company_id, $from_date, $to_date]);
                foreach ($stmtAllProd->fetchAll(PDO::FETCH_ASSOC) as $aRow) {
                    $aCalc = calcProducedItemWeightKg(
                        $aRow['produced_qty'] ?? 0,
                        $aRow['produced_pieces'] ?? 0,
                        $aRow['unit'] ?? '',
                        $aRow['unit_weight'] ?? 0,
                        $aRow['qty_per_piece'] ?? 0,
                        $aRow['carton'] ?? 0
                    );
                    $factoryTotalFinishedProdQty += $aCalc['weight_kg'];
                }
            } catch (Exception $eAllP) {
                $factoryTotalFinishedProdQty = $totalFinishedProdQty;
            }
        }

        // -----------------------------------------------------------------
        // D. Scrap / Wastage for Selected Period
        // -----------------------------------------------------------------
        // As per factory process, scrap (cutting/lump) is reground (miller) into WIP.
        // It stays on the floor as WIP, so no permanent scrap is deducted.
        $scrapQty = 0;

        // -----------------------------------------------------------------
        // E. Work-in-Process (WIP) Closing Calculation
        // -----------------------------------------------------------------
        // Closing WIP Qty = Opening WIP + Material Issued - Finished Production
        $closingWipQty = ($openingWipQty + $periodIssuedQty) - $totalFinishedProdQty;
        if ($closingWipQty < 0) $closingWipQty = 0;

        if ($periodIssuedQty > 0) {
            $avgMaterialRate = ($periodIssuedVal / $periodIssuedQty);
        } elseif ($openingWipQty > 0 && $openingWipVal > 0) {
            $avgMaterialRate = ($openingWipVal / $openingWipQty);
        } elseif ($category_id === 'all' || empty($category_id)) {
            $avgMaterialRate = 220.0;
        } else {
            $avgMaterialRate = 0;
        }
        $closingWipVal = $closingWipQty * $avgMaterialRate;

        // -----------------------------------------------------------------
        // F. Factory Overhead Expenses (Electricity, Labor, Maintenance)
        // -----------------------------------------------------------------
        $electricityCost = 0;
        $laborCost = 0;
        $overheadCost = 0;
        $overheadBreakdown = [];

        if ($expense_mode === 'manual') {
            $electricityCost = $manual_electricity;
            $laborCost = $manual_labor;
            $overheadCost = $manual_overheads;
        } else {
            // Auto fetch from posted Cash Payments, Bank Payments & Journal Vouchers via account_ledger
            $autoOvh = fetchAutoFactoryOverheads($pdo, $company_id, $from_date, $to_date);
            $electricityCost = $autoOvh['electricity'];
            $laborCost = $autoOvh['labor'];
            $overheadCost = $autoOvh['overhead'];
            $overheadBreakdown = $autoOvh['breakdown'];

            // When filtered by a specific Brand/Category or Product, scale company overheads to this filter's KG share
            if ($isFilteredProduction && $factoryTotalFinishedProdQty > 0 && $totalFinishedProdQty > 0 && $factoryTotalFinishedProdQty > $totalFinishedProdQty) {
                $filterRatio = $totalFinishedProdQty / $factoryTotalFinishedProdQty;
                $electricityCost = round($electricityCost * $filterRatio, 2);
                $laborCost = round($laborCost * $filterRatio, 2);
                $overheadCost = round($overheadCost * $filterRatio, 2);
            } elseif ($isFilteredProduction && $totalFinishedProdQty <= 0) {
                $electricityCost = 0;
                $laborCost = 0;
                $overheadCost = 0;
            }
        }

        // -----------------------------------------------------------------
        // G. Net Manufacturing Cost & Per-KG Unit Cost
        // -----------------------------------------------------------------
        // Load active formulas by category to derive category-specific raw material cost per KG
        $categoryFormulaRates = [];
        try {
            $stmtFormulas = $pdo->prepare("
                SELECT f.category_id, f.formula_name, f.total_qty, f.total_amount
                FROM formulas f
                WHERE f.company_id = ? AND f.is_cancelled = 0 AND f.is_posted = 1
                ORDER BY f.date DESC, f.id DESC
            ");
            $stmtFormulas->execute([$company_id]);
            while ($fRow = $stmtFormulas->fetch(PDO::FETCH_ASSOC)) {
                $cId = intval($fRow['category_id']);
                if ($cId > 0 && !isset($categoryFormulaRates[$cId])) {
                    $fQty = floatval($fRow['total_qty']);
                    $fAmt = floatval($fRow['total_amount']);
                    if ($fQty > 0 && $fAmt > 0) {
                        $categoryFormulaRates[$cId] = [
                            'rate_per_kg' => round($fAmt / $fQty, 2),
                            'formula_name' => $fRow['formula_name']
                        ];
                    }
                }
            }
        } catch (Exception $e) {}

        // When filtered by a specific category, calculate material consumed directly from that category's formula
        if ($category_id !== 'all' && intval($category_id) > 0) {
            $catId = intval($category_id);
            $formulaInfo = $categoryFormulaRates[$catId] ?? null;
            if ($formulaInfo && $formulaInfo['rate_per_kg'] > 0) {
                $materialCostPerKg = $formulaInfo['rate_per_kg'];
                $materialConsumedVal = $totalFinishedProdQty * $materialCostPerKg;
            } else {
                $materialCostPerKg = 0;
                $materialConsumedVal = 0;
            }
        } else {
            // Raw Material Consumed Value = (Opening WIP Val + Period Issued Val - Closing WIP Val)
            $materialConsumedVal = ($openingWipVal + $periodIssuedVal) - $closingWipVal;
            if ($materialConsumedVal < 0) $materialConsumedVal = 0;
            $materialCostPerKg = ($totalFinishedProdQty > 0) ? ($materialConsumedVal / $totalFinishedProdQty) : 0;
        }

        $totalConversionCost = $electricityCost + $laborCost + $overheadCost;
        $totalManufacturingCost = $materialConsumedVal + $totalConversionCost;

        $perKgCost = ($totalFinishedProdQty > 0) ? ($totalManufacturingCost / $totalFinishedProdQty) : 0;
        $electricityCostPerKg = ($totalFinishedProdQty > 0) ? ($electricityCost / $totalFinishedProdQty) : 0;
        $laborCostPerKg = ($totalFinishedProdQty > 0) ? ($laborCost / $totalFinishedProdQty) : 0;
        $overheadCostPerKg = ($totalFinishedProdQty > 0) ? ($overheadCost / $totalFinishedProdQty) : 0;
        $sharedConversionPerKg = ($totalFinishedProdQty > 0) ? ($totalConversionCost / $totalFinishedProdQty) : 0;

        // Allocate costs to each finished product row:
        // 1. Material Cost: Linked to Category Formula (if formula exists). If no formula, rate is 0.
        // 2. Overheads (Electricity, Labor, Maintenance): Evenly shared per KG across all finished items.
        $sr = 1;
        $productCostRows = [];
        foreach ($producedItems as $pItem) {
            $wKg = floatval($pItem['weight_kg']);
            $pcs = floatval($pItem['produced_pieces']);
            $pctShare = ($totalFinishedProdQty > 0) ? ($wKg / $totalFinishedProdQty) : 0;
            $catId = intval($pItem['category_id'] ?? 0);

            // Check if this category has a specific formula rate
            $formulaInfo = $categoryFormulaRates[$catId] ?? null;
            if ($formulaInfo && $formulaInfo['rate_per_kg'] > 0) {
                $itemMatRate = $formulaInfo['rate_per_kg'];
                $formulaUsed = $formulaInfo['formula_name'];
            } else {
                $itemMatRate = 0;
                $formulaUsed = 'No Formula Defined';
            }

            $allocMaterial = $wKg * $itemMatRate;
            $allocOverhead = $wKg * $sharedConversionPerKg;
            $allocTotal = $allocMaterial + $allocOverhead;

            $itemTotalCostPerKg = $itemMatRate + $sharedConversionPerKg;
            $uWt = floatval($pItem['unit_weight_calc']);
            $itemCostPerPiece = ($pcs > 0) ? ($allocTotal / $pcs) : (($uWt > 0) ? ($itemTotalCostPerKg * $uWt) : $itemTotalCostPerKg);

            $productCostRows[] = [
                'sr' => $sr++,
                'item_id' => $pItem['item_id'],
                'category_id' => $catId,
                'product_code' => $pItem['product_code'],
                'product_name' => $pItem['product_name'],
                'category_name' => $pItem['category_name'] ?? '',
                'formula_name' => $formulaUsed,
                'unit' => $pItem['unit'],
                'produced_qty' => $pItem['produced_qty'],
                'produced_pieces' => $pcs,
                'weight_kg' => $wKg,
                'unit_weight' => $uWt,
                'pct_share' => round($pctShare * 100, 2),
                'material_rate_per_kg' => round($itemMatRate, 2),
                'allocated_material' => round($allocMaterial, 2),
                'allocated_overhead' => round($allocOverhead, 2),
                'total_cost' => round($allocTotal, 2),
                'cost_per_piece' => round($itemCostPerPiece, 2),
                'cost_per_kg' => round($itemTotalCostPerKg, 2)
            ];
        }

        // If All Categories view has no Store Issue (MIN) posted yet, sync summary material total with Formula-allocated product costs
        if (($category_id === 'all' || empty($category_id)) && $materialConsumedVal <= 0 && !empty($productCostRows) && $totalFinishedProdQty > 0) {
            $formulaMatSum = array_sum(array_column($productCostRows, 'allocated_material'));
            if ($formulaMatSum > 0) {
                $materialConsumedVal = $formulaMatSum;
                $materialCostPerKg = $materialConsumedVal / $totalFinishedProdQty;
                $totalManufacturingCost = $materialConsumedVal + $totalConversionCost;
                $perKgCost = $totalManufacturingCost / $totalFinishedProdQty;
            }
        }

        // Group by Category / Brand for Category Summary View
        $categoryGroups = [];
        foreach ($productCostRows as $pRow) {
            $cName = trim($pRow['category_name']) ?: 'General / Uncategorized';
            $cId = intval($pRow['category_id'] ?? 0);
            $key = $cId . '_' . $cName;
            if (!isset($categoryGroups[$key])) {
                $categoryGroups[$key] = [
                    'category_id' => $cId,
                    'category_name' => $cName,
                    'formula_name' => $pRow['formula_name'],
                    'item_count' => 0,
                    'produced_qty' => 0,
                    'produced_pieces' => 0,
                    'weight_kg' => 0,
                    'allocated_material' => 0,
                    'allocated_overhead' => 0,
                    'total_cost' => 0,
                    'items' => []
                ];
            }
            $categoryGroups[$key]['item_count']++;
            $categoryGroups[$key]['produced_qty'] += floatval($pRow['produced_qty']);
            $categoryGroups[$key]['produced_pieces'] += floatval($pRow['produced_pieces']);
            $categoryGroups[$key]['weight_kg'] += floatval($pRow['weight_kg']);
            $categoryGroups[$key]['allocated_material'] += floatval($pRow['allocated_material']);
            $categoryGroups[$key]['allocated_overhead'] += floatval($pRow['allocated_overhead']);
            $categoryGroups[$key]['total_cost'] += floatval($pRow['total_cost']);
            $categoryGroups[$key]['items'][] = $pRow;
        }

        // Query current inventory balances for finished goods items grouped by main category
        $catStockMap = [];
        try {
            $stmtStock = $pdo->prepare("
                SELECT i.id, s.main_id, i.unit,
                       COALESCE(i.unit_weight, 0) as unit_weight,
                       COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                       COALESCE(i.carton, 0) as carton,
                       (COALESCE(ob.ob_qty, 0) + COALESCE(pn.pn_qty, 0) - COALESCE(si.si_qty, 0)) as bal_qty,
                       (COALESCE(ob.ob_pcs, 0) + COALESCE(pn.pn_pcs, 0) - COALESCE(si.si_pcs, 0)) as bal_pcs
                FROM inv_items i
                LEFT JOIN inv_sub_categories s ON i.sub_id = s.id
                LEFT JOIN (
                    SELECT item_id, SUM(quantity) as ob_qty, SUM(quantity) as ob_pcs 
                    FROM inv_opening_balances WHERE company_id = ? GROUP BY item_id
                ) ob ON i.id = ob.item_id
                LEFT JOIN (
                    SELECT pp.item_id, SUM(pp.qty) as pn_qty, SUM(pp.pieces) as pn_pcs 
                    FROM production_note_items pp 
                    JOIN production_notes p ON pp.pn_id = p.id 
                    WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1 
                    GROUP BY pp.item_id
                ) pn ON i.id = pn.item_id
                LEFT JOIN (
                    SELECT sii.item_coa_id as item_id, SUM(sii.quantity) as si_qty, SUM(sii.quantity) as si_pcs 
                    FROM sale_invoice_items sii 
                    JOIN sale_invoices s ON sii.invoice_id = s.id 
                    WHERE s.company_id = ? AND s.is_cancelled = 0 AND s.is_posted = 1 
                    GROUP BY sii.item_coa_id
                ) si ON i.id = si.item_id
                WHERE i.company_id = ? AND s.main_id IS NOT NULL
                  AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ");
            $stmtStock->execute([$company_id, $company_id, $company_id, $company_id]);
            while ($sRow = $stmtStock->fetch(PDO::FETCH_ASSOC)) {
                $mId = intval($sRow['main_id']);
                $rawBal = floatval($sRow['bal_qty']);
                $rawPcs = floatval($sRow['bal_pcs']);
                if ($rawBal <= 0 && $rawPcs <= 0) {
                    continue;
                }
                $sCalc = calcProducedItemWeightKg(
                    max(0, $rawBal),
                    max(0, $rawPcs),
                    $sRow['unit'] ?? '',
                    $sRow['unit_weight'] ?? 0,
                    $sRow['qty_per_piece'] ?? 0,
                    $sRow['carton'] ?? 0
                );
                if (!isset($catStockMap[$mId])) {
                    $catStockMap[$mId] = ['stock_kg' => 0.0, 'stock_pcs' => 0.0];
                }
                $catStockMap[$mId]['stock_kg'] += $sCalc['weight_kg'];
                $catStockMap[$mId]['stock_pcs'] += $sCalc['pieces'];
            }
        } catch(Exception $eStock) {}

        $cSr = 1;
        $categoryRows = [];
        foreach ($categoryGroups as $cGrp) {
            $w = $cGrp['weight_kg'];
            $pcs = $cGrp['produced_pieces'];
            $totC = $cGrp['total_cost'];
            $share = ($totalFinishedProdQty > 0) ? ($w / $totalFinishedProdQty) : 0;
            $avgPerKg = ($w > 0) ? ($totC / $w) : 0;
            $avgPerPcs = ($pcs > 0) ? ($totC / $pcs) : $avgPerKg;

            $catId = intval($cGrp['category_id']);
            $stkInfo = $catStockMap[$catId] ?? null;
            $stkKg = $stkInfo ? max(0, $stkInfo['stock_kg']) : $w;
            $stkPcs = $stkInfo ? max(0, $stkInfo['stock_pcs']) : $pcs;
            $stkVal = round($stkKg * $avgPerKg, 2);

            $categoryRows[] = [
                'sr' => $cSr++,
                'category_id' => $cGrp['category_id'],
                'category_name' => $cGrp['category_name'],
                'formula_name' => $cGrp['formula_name'],
                'item_count' => $cGrp['item_count'],
                'unit' => 'KG',
                'produced_qty' => round($cGrp['produced_qty'], 2),
                'produced_pieces' => round($pcs, 2),
                'weight_kg' => round($w, 2),
                'pct_share' => round($share * 100, 2),
                'allocated_material' => round($cGrp['allocated_material'], 2),
                'allocated_overhead' => round($cGrp['allocated_overhead'], 2),
                'total_cost' => round($totC, 2),
                'cost_per_piece' => round($avgPerPcs, 2),
                'cost_per_kg' => round($avgPerKg, 2),
                'stock_kg' => round($stkKg, 2),
                'stock_pieces' => round($stkPcs, 2),
                'stock_val' => round($stkVal, 2),
                'items' => $cGrp['items']
            ];
        }

        // -----------------------------------------------------------------
        // H. Daily WIP Flow Breakdown
        // -----------------------------------------------------------------
        $dailyRows = [];
        $runningWip = $openingWipQty;

        // Fetch daily issues grouped by date
        $stmtDailyIssues = $pdo->prepare("
            SELECT m.date, SUM(mii.qty) as day_issued_qty, SUM(mii.amount) as day_issued_val
            FROM material_issue_notes m
            JOIN material_issue_note_items mii ON m.id = mii.min_id
            WHERE m.company_id = ? AND m.is_cancelled = 0 AND m.is_posted = 1
              $catMinFilter
              AND m.date BETWEEN ? AND ?
            GROUP BY m.date
        ");
        $stmtDailyIssues->execute([$company_id, $from_date, $to_date]);
        $dailyIssuesMap = [];
        while ($dRow = $stmtDailyIssues->fetch(PDO::FETCH_ASSOC)) {
            $dailyIssuesMap[$dRow['date']] = [
                'qty' => floatval($dRow['day_issued_qty']),
                'val' => floatval($dRow['day_issued_val'])
            ];
        }

        // Fetch daily production grouped by date, calculating true weight in KG for both pipes & fittings
        $dailyCatFilter = "";
        if ($category_id !== 'all' && intval($category_id) > 0) {
            $dailyCatFilter = " AND pp.item_id IN (SELECT i2.id FROM inv_items i2 JOIN inv_sub_categories s2 ON i2.sub_id = s2.id WHERE s2.main_id = " . intval($category_id) . ")";
        }
        $stmtDailyProd = $pdo->prepare("
            SELECT p.date, pp.qty, pp.pieces, i.unit,
                   COALESCE(i.unit_weight, 0) as unit_weight,
                   COALESCE(i.qty_per_piece, 0) as qty_per_piece,
                   COALESCE(i.carton, 0) as carton
            FROM production_notes p
            JOIN production_note_items pp ON p.id = pp.pn_id
            JOIN inv_items i ON pp.item_id = i.id
            WHERE p.company_id = ? AND p.is_cancelled = 0 AND p.is_posted = 1
              AND p.date BETWEEN ? AND ?
              $dailyCatFilter
        ");
        $stmtDailyProd->execute([$company_id, $from_date, $to_date]);
        $dailyProdRows = $stmtDailyProd->fetchAll(PDO::FETCH_ASSOC);

        $dailyProdMap = [];
        foreach ($dailyProdRows as $dItem) {
            $dDate = $dItem['date'];
            $dCalc = calcProducedItemWeightKg(
                $dItem['qty'] ?? 0,
                $dItem['pieces'] ?? 0,
                $dItem['unit'] ?? '',
                $dItem['unit_weight'] ?? 0,
                $dItem['qty_per_piece'] ?? 0,
                $dItem['carton'] ?? 0
            );
            if (!isset($dailyProdMap[$dDate])) {
                $dailyProdMap[$dDate] = 0;
            }
            $dailyProdMap[$dDate] += $dCalc['weight_kg'];
        }

        // Loop each day in range
        $curDateTs = $fromTime;
        $dSr = 1;
        while ($curDateTs <= $toTime) {
            $cDateStr = date('Y-m-d', $curDateTs);
            $dayIss = $dailyIssuesMap[$cDateStr]['qty'] ?? 0;
            $dayIssVal = $dailyIssuesMap[$cDateStr]['val'] ?? ($dayIss * $avgMaterialRate);
            $dayProd = $dailyProdMap[$cDateStr] ?? 0;

            $dOpenWip = $runningWip;
            $dCloseWip = ($dOpenWip + $dayIss) - $dayProd; // Scrap stays in WIP as miller
            if ($dCloseWip < 0) $dCloseWip = 0;
            $runningWip = $dCloseWip;

            $totalDayAvail = $dOpenWip + $dayIss;
            $dayYield = ($totalDayAvail > 0) ? min(100, round(($dayProd / $totalDayAvail) * 100, 1)) : 100;

            $dailyRows[] = [
                'sr' => $dSr++,
                'date' => $cDateStr,
                'date_formatted' => date('d-M-Y (D)', $curDateTs),
                'opening_wip' => round($dOpenWip, 2),
                'material_issued_qty' => round($dayIss, 2),
                'material_issued_val' => round($dayIssVal, 2),
                'finished_prod_qty' => round($dayProd, 2),
                'scrap_qty' => 0,
                'closing_wip' => round($dCloseWip, 2),
                'yield_pct' => $dayYield,
                'status' => ($dCloseWip > 0) ? 'In Process' : 'Balanced'
            ];

            $curDateTs = strtotime('+1 day', $curDateTs);
        }

        // Production Yield & Scrap Efficiency
        $totalMaterialAvail = $openingWipQty + $periodIssuedQty;
        $overallYieldPct = ($totalMaterialAvail > 0) ? round(($totalFinishedProdQty / $totalMaterialAvail) * 100, 2) : 100;
        $overallScrapPct = ($totalMaterialAvail > 0) ? round(($scrapQty / $totalMaterialAvail) * 100, 2) : 0;

        echo json_encode([
            'status' => 'success',
            'company' => $compRow,
            'period_label' => $periodLabel,
            'prev_period_label' => $prevDateLabel,
            'current_period_label' => $currentPeriodLabel,
            'next_period_label' => $nextDateLabel,
            'categories' => $categoryRows,
            'category_rows' => $categoryRows,
            'product_rows' => $productCostRows,
            'daily_rows' => $dailyRows,
            'reconciliation' => [
                'opening_wip_qty' => round($openingWipQty, 2),
                'opening_wip_val' => round($openingWipVal, 2),
                'material_issued_qty' => round($periodIssuedQty, 2),
                'material_issued_val' => round($periodIssuedVal, 2),
                'finished_prod_qty' => round($totalFinishedProdQty, 2),
                'scrap_qty' => round($scrapQty, 2),
                'closing_wip_qty' => round($closingWipQty, 2),
                'closing_wip_val' => round($closingWipVal, 2),
                'yield_pct' => $overallYieldPct,
                'scrap_pct' => $overallScrapPct
            ],
            'cost_sheet' => [
                'material_consumed_val' => round($materialConsumedVal, 2),
                'material_cost_per_kg' => round($materialCostPerKg, 2),
                'material_pct' => ($totalManufacturingCost > 0) ? round(($materialConsumedVal / $totalManufacturingCost) * 100, 1) : 0,

                'electricity_cost' => round($electricityCost, 2),
                'electricity_cost_per_kg' => round($electricityCostPerKg, 2),
                'electricity_pct' => ($totalManufacturingCost > 0) ? round(($electricityCost / $totalManufacturingCost) * 100, 1) : 0,

                'labor_cost' => round($laborCost, 2),
                'labor_cost_per_kg' => round($laborCostPerKg, 2),
                'labor_pct' => ($totalManufacturingCost > 0) ? round(($laborCost / $totalManufacturingCost) * 100, 1) : 0,

                'overhead_cost' => round($overheadCost, 2),
                'overhead_cost_per_kg' => round($overheadCostPerKg, 2),
                'overhead_pct' => ($totalManufacturingCost > 0) ? round(($overheadCost / $totalManufacturingCost) * 100, 1) : 0,

                'total_manufacturing_cost' => round($totalManufacturingCost, 2),
                'total_cost_per_kg' => round($perKgCost, 2),
                'finished_prod_qty' => round($totalFinishedProdQty, 2),
                'finished_pieces' => round($totalFinishedPieces, 0)
            ],
            'expense_mode' => $expense_mode,
            'overhead_breakdown' => $overheadBreakdown,
            'carry_forward' => [
                'prev_closing_qty' => round($openingWipQty, 2),
                'prev_closing_val' => round($openingWipVal, 2),
                'cur_opening_qty' => round($openingWipQty, 2),
                'cur_opening_val' => round($openingWipVal, 2),
                'cur_closing_qty' => round($closingWipQty, 2),
                'cur_closing_val' => round($closingWipVal, 2),
                'next_opening_qty' => round($closingWipQty, 2),
                'next_opening_val' => round($closingWipVal, 2)
            ]
        ]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

// =========================================================================
// 3. LOCK / SAVE MONTHLY WIP SNAPSHOT
// =========================================================================
if ($action === 'save_wip_closing') {
    try {
        $year = intval($_POST['year'] ?? date('Y'));
        $month = intval($_POST['month'] ?? date('n'));
        $openingQty = floatval($_POST['opening_wip_qty'] ?? 0);
        $openingVal = floatval($_POST['opening_wip_val'] ?? 0);
        $issuedQty = floatval($_POST['material_issued_qty'] ?? 0);
        $issuedVal = floatval($_POST['material_issued_val'] ?? 0);
        $finishedQty = floatval($_POST['finished_prod_qty'] ?? 0);
        $scrapQtySave = floatval($_POST['scrap_qty'] ?? 0);
        $closingQty = floatval($_POST['closing_wip_qty'] ?? 0);
        $closingVal = floatval($_POST['closing_wip_val'] ?? 0);
        $elecCostSave = floatval($_POST['electricity_cost'] ?? 0);
        $laborCostSave = floatval($_POST['labor_cost'] ?? 0);
        $ovhCostSave = floatval($_POST['overhead_cost'] ?? 0);
        $perKgCost = floatval($_POST['per_kg_cost'] ?? 0);

        $stmtSave = $pdo->prepare("
            INSERT INTO mfg_monthly_wip 
                (company_id, year, month, opening_wip_qty, opening_wip_val, material_issued_qty, material_issued_val,
                 finished_prod_qty, scrap_qty, closing_wip_qty, closing_wip_val,
                 electricity_cost, labor_cost, overhead_cost, per_kg_cost, is_locked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE 
                opening_wip_qty = VALUES(opening_wip_qty),
                opening_wip_val = VALUES(opening_wip_val),
                material_issued_qty = VALUES(material_issued_qty),
                material_issued_val = VALUES(material_issued_val),
                finished_prod_qty = VALUES(finished_prod_qty),
                scrap_qty = VALUES(scrap_qty),
                closing_wip_qty = VALUES(closing_wip_qty),
                closing_wip_val = VALUES(closing_wip_val),
                electricity_cost = VALUES(electricity_cost),
                labor_cost = VALUES(labor_cost),
                overhead_cost = VALUES(overhead_cost),
                per_kg_cost = VALUES(per_kg_cost),
                is_locked = 1
        ");
        $stmtSave->execute([
            $company_id, $year, $month,
            $openingQty, $openingVal, $issuedQty, $issuedVal,
            $finishedQty, $scrapQtySave, $closingQty, $closingVal,
            $elecCostSave, $laborCostSave, $ovhCostSave, $perKgCost
        ]);

        echo json_encode(['status' => 'success', 'message' => 'Monthly WIP closing and overheads saved and locked.']);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['status' => 'error', 'error' => 'Invalid action']);
