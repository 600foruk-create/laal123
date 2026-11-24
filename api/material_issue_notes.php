<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Tables
$pdo->exec("CREATE TABLE IF NOT EXISTS material_issue_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    serial_no INT NOT NULL,
    date DATE NOT NULL,
    requisition_no VARCHAR(100),
    inventory_location_id INT,
    job_id INT,
    employee_id INT,
    debit_account_id INT,
    credit_account_id INT,
    remarks TEXT,
    total_pieces DECIMAL(15,2) DEFAULT 0,
    total_qty DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    is_cancelled TINYINT DEFAULT 0,
    is_posted TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (company_id, serial_no)
) ENGINE=InnoDB");

$pdo->exec("CREATE TABLE IF NOT EXISTS material_issue_note_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    min_id INT NOT NULL,
    item_id INT NOT NULL,
    description TEXT,
    pieces DECIMAL(15,2) DEFAULT 0,
    qty DECIMAL(15,4) DEFAULT 0,
    rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (min_id) REFERENCES material_issue_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB");

try { $pdo->exec("ALTER TABLE material_issue_notes ADD COLUMN is_posted TINYINT DEFAULT 0 AFTER is_cancelled"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE material_issue_notes ADD COLUMN formula_id INT DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE material_issue_notes ADD COLUMN formula_qty DECIMAL(15,2) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN is_inactive TINYINT DEFAULT 0"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN hs_code VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE material_issue_note_items ADD COLUMN unit VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN unit VARCHAR(50) DEFAULT 'Pcs'"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE inv_items ADD COLUMN qty_per_piece DECIMAL(15,2) DEFAULT 0"); } catch (Exception $e) {}

switch ($action) {
    case 'check_stock':
        $item_ids = $_GET['item_ids'] ?? ($_POST['item_ids'] ?? '');
        $loc_id = intval($_GET['location_id'] ?? 0);
        $exclude_min_id = intval($_GET['exclude_min_id'] ?? 0);
        $exclude_si_id = intval($_GET['exclude_si_id'] ?? 0);
        if (!$item_ids) {
            sendResponse(['status' => 'success', 'stock' => []]);
            exit;
        }

        $clean_ids = array_filter(array_map('intval', explode(',', $item_ids)));
        if (empty($clean_ids)) {
            sendResponse(['status' => 'success', 'stock' => []]);
            exit;
        }
        $id_list = implode(',', $clean_ids);

        $locCond = function($col) use ($loc_id) {
            return $loc_id ? " AND $col = $loc_id" : "";
        };

        $minCond = $exclude_min_id ? " AND m.id != $exclude_min_id" : "";
        $siCond = $exclude_si_id ? " AND si.id != $exclude_si_id" : "";

        $q = [];
        $q[] = "SELECT item_id, pieces, quantity as qty FROM inv_opening_balances WHERE company_id = $company_id AND item_id IN ($id_list)" . $locCond('location_id');
        $q[] = "SELECT pii.item_coa_id as item_id, pii.pieces, pii.quantity as qty FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pii.item_coa_id IN ($id_list)" . $locCond('pi.inventory_location_id');
        $q[] = "SELECT sri.item_coa_id as item_id, sri.pieces, sri.quantity as qty FROM sale_return_items sri JOIN sale_returns sr ON sri.return_id = sr.id WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1 AND sri.item_coa_id IN ($id_list)" . $locCond('sr.inventory_location_id');
        $q[] = "SELECT sii.item_coa_id as item_id, -sii.pieces as pieces, -sii.quantity as qty FROM sale_invoice_items sii JOIN sale_invoices si ON sii.invoice_id = si.id WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 AND sii.item_coa_id IN ($id_list) $siCond" . $locCond('si.inventory_location_id');
        $q[] = "SELECT pri.item_coa_id as item_id, -pri.pieces as pieces, -pri.quantity as qty FROM purchase_return_items pri JOIN purchase_returns pr ON pri.return_id = pr.id WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 AND pri.item_coa_id IN ($id_list)" . $locCond('pr.inventory_location_id');
        $q[] = "SELECT ai.item_id, ai.pieces, ai.qty as qty FROM add_inventory_adjustment_items ai JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id WHERE a.company_id = $company_id AND a.is_cancelled = 0 AND ai.item_id IN ($id_list)" . $locCond('a.inventory_location_id');
        $q[] = "SELECT ri.item_id, -ri.pieces as pieces, -ri.qty as qty FROM reduce_inventory_adjustment_items ri JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id WHERE r.company_id = $company_id AND r.is_cancelled = 0 AND ri.item_id IN ($id_list)" . $locCond('r.inventory_location_id');
        $q[] = "SELECT pp.item_id, pp.pieces, pp.qty as qty FROM production_note_items pp JOIN production_notes p ON pp.pn_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.item_id IN ($id_list)" . $locCond('p.inventory_location_id');
        $q[] = "SELECT mii.item_id, -mii.pieces as pieces, -mii.qty as qty FROM material_issue_note_items mii JOIN material_issue_notes m ON mii.min_id = m.id WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 AND mii.item_id IN ($id_list) $minCond" . $locCond('m.inventory_location_id');

        $union = implode(" UNION ALL ", $q);
        $res = $pdo->query("SELECT item_id, COALESCE(SUM(pieces), 0) as stock_pcs, COALESCE(SUM(qty), 0) as stock_qty FROM ($union) as t GROUP BY item_id")->fetchAll(PDO::FETCH_ASSOC);

        $stockMap = [];
        foreach ($res as $r) {
            $stockMap[$r['item_id']] = [
                'pcs' => floatval($r['stock_pcs']),
                'qty' => floatval($r['stock_qty'])
            ];
        }
        sendResponse(['status' => 'success', 'stock' => $stockMap]);
        break;

    case 'search_mins':
        $stmt = $pdo->prepare("
            SELECT m1.id, m1.serial_no, m1.date, m1.requisition_no, m1.is_cancelled, m1.is_posted, m1.created_at
            FROM material_issue_notes m1
            INNER JOIN (
                SELECT MAX(id) as max_id FROM material_issue_notes WHERE company_id = ? GROUP BY serial_no
            ) m2 ON m1.id = m2.max_id
            ORDER BY m1.id DESC
            LIMIT 200
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;

    case 'get_dependencies':
        try {
            $locations = [];
            try { $locations = $pdo->query("SELECT id, name FROM inv_locations WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            $jobs = [];
            try { $jobs = $pdo->query("SELECT id, job_no, description FROM job_cards WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            $employees = [];
            try { $employees = $pdo->query("SELECT id, name FROM employees WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}
            
            // Only fetch accounts belonging to "Cost of Sale"
            $accounts = [];
            try { 
                $accounts = $pdo->query("
                    SELECT c.id, c.code, c.name 
                    FROM coa_list c 
                    LEFT JOIN coa_sub s ON c.sub_id = s.id 
                    LEFT JOIN coa_main m ON s.main_id = m.id 
                    WHERE c.company_id = $company_id 
                    AND (m.name LIKE '%Cost of Sale%' OR s.name LIKE '%Cost of Sale%' OR c.name LIKE '%Cost of Sale%')
                ")->fetchAll(PDO::FETCH_ASSOC); 
            } catch (Exception $e) {}
            
            $items = [];
            try { 
                $items = $pdo->query("SELECT id, code as item_code, name as item_name, unit, qty_per_piece, hs_code, selling_price as sale_rate, purchase_price as purchase_rate FROM inv_items WHERE company_id = $company_id AND (is_inactive = 0 OR is_inactive IS NULL) ORDER BY code, name")->fetchAll(PDO::FETCH_ASSOC); 

                // Pre-populate latest posted purchase rate from purchase invoices for 0ms instant rate auto-fill
                $lastRates = [];
                try {
                    $qL = $pdo->prepare("
                        SELECT pii.item_coa_id as item_id, pii.rate
                        FROM purchase_invoice_items pii
                        JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                        WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0
                        ORDER BY pi.invoice_date DESC, pi.id DESC
                    ");
                    $qL->execute([$company_id]);
                    while ($r = $qL->fetch(PDO::FETCH_ASSOC)) {
                        $iid = intval($r['item_id']);
                        if (!isset($lastRates[$iid])) {
                            $lastRates[$iid] = floatval($r['rate']);
                        }
                    }
                } catch (Exception $eL) {}

                foreach ($items as &$it) {
                    $iid = intval($it['id']);
                    $it['last_purchase_rate'] = $lastRates[$iid] ?? 0;
                    if (empty($it['purchase_rate']) || floatval($it['purchase_rate']) <= 0) {
                        $it['purchase_rate'] = $it['last_purchase_rate'];
                    }
                }
                unset($it);
            } catch (Exception $e) {}

            $formulas = [];
            try { $formulas = $pdo->query("SELECT id, serial_no, formula_name, category_id FROM formulas WHERE company_id = $company_id AND (is_cancelled = 0 OR is_cancelled IS NULL)")->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) {}

            sendResponse([
                'locations' => $locations,
                'jobs' => $jobs,
                'employees' => $employees,
                'accounts' => $accounts,
                'items' => $items,
                'formulas' => $formulas
            ]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'get_next_serial_no':
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM material_issue_notes WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
        break;

    case 'get_formula_items':
        try {
            $formula_id = $_GET['formula_id'] ?? 0;
            $val_method = $_GET['valuation_method'] ?? '';
            $from = $_GET['from_date'] ?? '';
            $to = $_GET['to_date'] ?? '';

            $stmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.unit, inv.qty_per_piece, inv.hs_code 
                                  FROM formula_items i 
                                  JOIN inv_items inv ON i.item_id = inv.id 
                                  WHERE i.formula_id = ? ORDER BY i.sort_order");
            $stmt->execute([$formula_id]);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if ($val_method) {
                foreach ($items as &$item) {
                    $item_id = (int)($item['item_id'] ?? 0);
                    if (!$item_id) continue;

                    $rate = 0;
                    try {
                        if ($val_method === 'last_purchase') {
                            $q = $pdo->query("SELECT pii.rate FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pii.item_coa_id = $item_id AND pi.company_id = $company_id AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0 ORDER BY pi.invoice_date DESC, pi.id DESC LIMIT 1");
                            if ($q) $rate = $q->fetchColumn();
                        } else if ($val_method === 'min_purchase') {
                            $q = $pdo->query("SELECT MIN(pii.rate) FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pii.item_coa_id = $item_id AND pi.company_id = $company_id AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0");
                            if ($q) $rate = $q->fetchColumn();
                        } else if ($val_method === 'max_purchase') {
                            $q = $pdo->query("SELECT MAX(pii.rate) FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pii.item_coa_id = $item_id AND pi.company_id = $company_id AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0");
                            if ($q) $rate = $q->fetchColumn();
                        } else if ($val_method === 'avg_purchase') {
                            if (!$from) $from = date('Y-m-01');
                            if (!$to) $to = date('Y-m-d');
                            $q = $pdo->prepare("SELECT AVG(pii.rate) FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pii.item_coa_id = ? AND pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0 AND pi.invoice_date BETWEEN ? AND ?");
                            $q->execute([$item_id, $company_id, $from, $to]);
                            $rate = $q->fetchColumn();
                        }
                    } catch (Exception $ex) {
                        // ignore query errors for individual items
                    }
                    
                    if ($rate && $rate > 0) {
                        $item['rate'] = $rate;
                        $item['amount'] = $item['qty'] * $rate;
                    }
                }
            }

            sendResponse($items);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'get_valuation_rates':
        try {
            $val_method = $_GET['valuation_method'] ?? 'last_purchase';
            $from = $_GET['from_date'] ?? '';
            $to = $_GET['to_date'] ?? '';

            $rates = [];
            if ($val_method === 'min_purchase') {
                $q = $pdo->prepare("SELECT pii.item_coa_id as item_id, MIN(pii.rate) as rate FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0 GROUP BY pii.item_coa_id");
                $q->execute([$company_id]);
                while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                    $rates[intval($r['item_id'])] = floatval($r['rate']);
                }
            } else if ($val_method === 'max_purchase') {
                $q = $pdo->prepare("SELECT pii.item_coa_id as item_id, MAX(pii.rate) as rate FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0 GROUP BY pii.item_coa_id");
                $q->execute([$company_id]);
                while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                    $rates[intval($r['item_id'])] = floatval($r['rate']);
                }
            } else if ($val_method === 'avg_purchase') {
                $dCond = ($from && $to) ? " AND pi.invoice_date BETWEEN ? AND ?" : "";
                $p = [$company_id];
                if ($from && $to) { $p[] = $from; $p[] = $to; }
                $q = $pdo->prepare("SELECT pii.item_coa_id as item_id, AVG(pii.rate) as rate FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0 $dCond GROUP BY pii.item_coa_id");
                $q->execute($p);
                while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                    $rates[intval($r['item_id'])] = round(floatval($r['rate']), 2);
                }
            } else {
                // last_purchase
                $q = $pdo->prepare("SELECT pii.item_coa_id as item_id, pii.rate FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0 ORDER BY pi.invoice_date DESC, pi.id DESC");
                $q->execute([$company_id]);
                while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
                    $iid = intval($r['item_id']);
                    if (!isset($rates[$iid])) {
                        $rates[$iid] = floatval($r['rate']);
                    }
                }
            }
            sendResponse(['status' => 'success', 'rates' => $rates]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'check_zero_rates':
        try {
            $stmt = $pdo->prepare("
                SELECT m.id, m.serial_no, m.date, m.is_posted, COUNT(mi.id) as zero_items_count, SUM(mi.qty) as zero_qty
                FROM material_issue_notes m
                JOIN material_issue_note_items mi ON m.id = mi.min_id
                WHERE m.company_id = ? AND m.is_cancelled = 0 AND (mi.rate <= 0 OR mi.amount <= 0)
                GROUP BY m.id, m.serial_no, m.date, m.is_posted
                ORDER BY m.serial_no ASC
            ");
            $stmt->execute([$company_id]);
            $vouchers = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $total_zero_items = 0;
            foreach ($vouchers as $v) {
                $total_zero_items += intval($v['zero_items_count']);
            }

            sendResponse([
                'status' => 'success',
                'zero_voucher_count' => count($vouchers),
                'total_zero_items' => $total_zero_items,
                'vouchers' => $vouchers
            ]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'batch_update_zero_rates':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $val_method = $data['valuation_method'] ?? 'last_purchase';
        $target_mode = $data['target_mode'] ?? 'all';
        $target_sn = intval($data['target_sn'] ?? 0);

        try {
            // Pre-fetch last purchase rates
            $lastRates = [];
            $qL = $pdo->prepare("
                SELECT pii.item_coa_id as item_id, pii.rate
                FROM purchase_invoice_items pii
                JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0
                ORDER BY pi.invoice_date DESC, pi.id DESC
            ");
            $qL->execute([$company_id]);
            while ($r = $qL->fetch(PDO::FETCH_ASSOC)) {
                $iid = intval($r['item_id']);
                if (!isset($lastRates[$iid])) {
                    $lastRates[$iid] = floatval($r['rate']);
                }
            }

            // Average rates
            $avgRates = [];
            if ($val_method === 'avg_purchase') {
                $qA = $pdo->prepare("
                    SELECT pii.item_coa_id as item_id, AVG(pii.rate) as avg_rate
                    FROM purchase_invoice_items pii
                    JOIN purchase_invoices pi ON pii.invoice_id = pi.id
                    WHERE pi.company_id = ? AND pi.is_posted = 1 AND pi.is_cancelled = 0 AND pii.rate > 0
                    GROUP BY pii.item_coa_id
                ");
                $qA->execute([$company_id]);
                while ($r = $qA->fetch(PDO::FETCH_ASSOC)) {
                    $avgRates[intval($r['item_id'])] = round(floatval($r['avg_rate']), 2);
                }
            }

            // Master prices fallback
            $masterRates = [];
            $qM = $pdo->prepare("SELECT id, purchase_price, selling_price FROM inv_items WHERE company_id = ?");
            $qM->execute([$company_id]);
            while ($r = $qM->fetch(PDO::FETCH_ASSOC)) {
                $pr = floatval($r['purchase_price'] ?: $r['selling_price']);
                if ($pr > 0) $masterRates[intval($r['id'])] = $pr;
            }

            $pdo->beginTransaction();

            $snCond = ($target_mode === 'single' && $target_sn > 0) ? " AND m.serial_no = " . intval($target_sn) : "";

            $findItemsStmt = $pdo->prepare("
                SELECT mi.id as item_row_id, mi.min_id, mi.item_id, mi.qty, m.serial_no
                FROM material_issue_note_items mi
                JOIN material_issue_notes m ON mi.min_id = m.id
                WHERE m.company_id = ? AND m.is_cancelled = 0 AND (mi.rate <= 0 OR mi.amount <= 0) $snCond
            ");
            $findItemsStmt->execute([$company_id]);
            $itemsToUpdate = $findItemsStmt->fetchAll(PDO::FETCH_ASSOC);

            $updateItemStmt = $pdo->prepare("UPDATE material_issue_note_items SET rate = ?, amount = ? WHERE id = ?");
            $affectedMins = [];
            $updatedItemCount = 0;

            foreach ($itemsToUpdate as $row) {
                $iid = intval($row['item_id']);
                $qty = floatval($row['qty']);
                
                $rateToApply = 0;
                if ($val_method === 'avg_purchase' && !empty($avgRates[$iid])) {
                    $rateToApply = $avgRates[$iid];
                } else if ($val_method === 'item_master' && !empty($masterRates[$iid])) {
                    $rateToApply = $masterRates[$iid];
                } else {
                    $rateToApply = $lastRates[$iid] ?? ($masterRates[$iid] ?? 0);
                }

                if ($rateToApply > 0) {
                    $amount = round($qty * $rateToApply, 2);
                    $updateItemStmt->execute([$rateToApply, $amount, $row['item_row_id']]);
                    $affectedMins[$row['min_id']] = true;
                    $updatedItemCount++;
                }
            }

            // Recalculate total_amount for all affected material_issue_notes
            $updateMinTotalStmt = $pdo->prepare("
                UPDATE material_issue_notes m
                SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM material_issue_note_items WHERE min_id = m.id)
                WHERE m.id = ?
            ");
            foreach (array_keys($affectedMins) as $minId) {
                $updateMinTotalStmt->execute([$minId]);
            }

            $pdo->commit();

            logActivity('Material Issue Notes', 'BATCH_RATE_SYNC', 0, "Batch updated $updatedItemCount items across " . count($affectedMins) . " MIN vouchers using $val_method");

            sendResponse([
                'status' => 'success',
                'updated_vouchers' => count($affectedMins),
                'updated_items' => $updatedItemCount
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'toggle_post':
        $id = json_decode(file_get_contents('php://input'), true)['id'] ?? 0;
        if (!$id) sendResponse(['error' => 'Invalid ID'], 400);
        try {
            // Get current status
            $stmt = $pdo->prepare("SELECT is_posted, serial_no FROM material_issue_notes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            $min = $stmt->fetch();
            if (!$min) sendResponse(['error' => 'Not found'], 404);

            $new_status = $min['is_posted'] ? 0 : 1;
            $pdo->prepare("UPDATE material_issue_notes SET is_posted = ? WHERE id = ?")->execute([$new_status, $id]);
            logActivity('Material Issue Notes', 'POST_TOGGLE', $id, "MIN Serial: " . $min['serial_no'] . " is_posted set to $new_status");
            sendResponse(['status' => 'success', 'is_posted' => $new_status]);
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) sendResponse(['error' => 'Invalid data'], 400);

        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('material_issue_notes', 'material_issue_note_items', 'min_id', $id) : null;
            $pdo->beginTransaction();

            $formula_id = !empty($data['formula_id']) ? intval($data['formula_id']) : null;
            $formula_qty = !empty($data['formula_qty']) ? floatval($data['formula_qty']) : null;

            if ($id) {
                // Check if new serial_no already exists in another record to prevent duplicates!
                $check = $pdo->prepare("SELECT id FROM material_issue_notes WHERE serial_no = ? AND company_id = ? AND id != ?");
                $check->execute([$data['serial_no'], $company_id, $id]);
                if ($check->fetchColumn()) {
                    sendResponse(['error' => "A Material Issue Note with Serial No " . $data['serial_no'] . " already exists!"], 400);
                }

                // Update
                $sql = "UPDATE material_issue_notes SET 
                        serial_no = ?, date = ?, requisition_no = ?, inventory_location_id = ?, job_id = ?, employee_id = ?, 
                        debit_account_id = ?, credit_account_id = ?, remarks = ?, 
                        total_pieces = ?, total_qty = ?, total_amount = ?, is_cancelled = ?, is_posted = ?,
                        formula_id = ?, formula_qty = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['serial_no'], $data['date'], $data['requisition_no'], $data['inventory_location_id'] ?: null, 
                    $data['job_id'] ?: null, $data['employee_id'] ?: null,
                    $data['debit_account_id'] ?: null, $data['credit_account_id'] ?: null, 
                    $data['remarks'], $data['total_pieces'], $data['total_qty'], $data['total_amount'], 
                    $data['is_cancelled'] ? 1 : 0, $data['is_posted'] ? 1 : 0,
                    $formula_id, $formula_qty,
                    $id, $company_id
                ]);
            } else {
                // Check if serial_no already exists to prevent duplicates!
                $check = $pdo->prepare("SELECT id FROM material_issue_notes WHERE serial_no = ? AND company_id = ?");
                $check->execute([$data['serial_no'], $company_id]);
                if ($check->fetchColumn()) {
                    sendResponse(['error' => "A Material Issue Note with Serial No " . $data['serial_no'] . " already exists! Use the fetch button/Enter key to load it before editing."], 400);
                }

                // Insert
                $sql = "INSERT INTO material_issue_notes (
                        company_id, serial_no, date, requisition_no, inventory_location_id, job_id, employee_id, 
                        debit_account_id, credit_account_id, remarks, total_pieces, total_qty, total_amount, is_cancelled, is_posted,
                        formula_id, formula_qty
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $data['serial_no'], $data['date'], $data['requisition_no'], 
                    $data['inventory_location_id'] ?: null, $data['job_id'] ?: null, $data['employee_id'] ?: null,
                    $data['debit_account_id'] ?: null, $data['credit_account_id'] ?: null, 
                    $data['remarks'], $data['total_pieces'], $data['total_qty'], $data['total_amount'], 
                    $data['is_cancelled'] ? 1 : 0, $data['is_posted'] ? 1 : 0,
                    $formula_id, $formula_qty
                ]);
                $id = $pdo->lastInsertId();
            }

            // Save Items
            $pdo->prepare("DELETE FROM material_issue_note_items WHERE min_id = ?")->execute([$id]);
            $itemSql = "INSERT INTO material_issue_note_items (min_id, item_id, description, pieces, qty, unit, rate, amount, sort_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $index => $item) {
                if (empty($item['item_id'])) continue;
                $itemStmt->execute([
                    $id, $item['item_id'], $item['description'], $item['pieces'], $item['qty'], $item['unit'] ?? null, $item['rate'], $item['amount'], $index
                ]);
            }

            $pdo->commit();
            $after_data = fetchRecordData('material_issue_notes', 'material_issue_note_items', 'min_id', $id);
            logActivity('Material Issue Notes', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'MIN Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'fetch':
        try {
            $sn = $_GET['sn'] ?? 0;
            $dir = $_GET['dir'] ?? '';
            
            if ($sn === 'last') {
                $stmt = $pdo->prepare("SELECT * FROM material_issue_notes WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id]);
            } else {
                if ($dir === 'next') {
                    $stmt = $pdo->prepare("SELECT * FROM material_issue_notes WHERE serial_no > ? AND company_id = ? ORDER BY serial_no ASC LIMIT 1");
                } else if ($dir === 'prev') {
                    $stmt = $pdo->prepare("SELECT * FROM material_issue_notes WHERE serial_no < ? AND company_id = ? ORDER BY serial_no DESC LIMIT 1");
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM material_issue_notes WHERE serial_no = ? AND company_id = ?");
                }
                if ($dir === 'next' || $dir === 'prev') {
                    $stmt->execute([$sn, $company_id]);
                } else {
                    $stmt->execute([$sn, $company_id]);
                }
            }
            $min = $stmt->fetch();

            if ($min) {
                $itemStmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.hs_code, COALESCE(i.unit, inv.unit) as unit 
                                          FROM material_issue_note_items i 
                                          JOIN inv_items inv ON i.item_id = inv.id 
                                          WHERE i.min_id = ? ORDER BY i.sort_order");
                $itemStmt->execute([$min['id']]);
                $min['items'] = $itemStmt->fetchAll();
                
                // Fetch debit account
                if ($min['debit_account_id']) {
                    $stmt = $pdo->prepare("SELECT code, name FROM coa_list WHERE id=?");
                    $stmt->execute([$min['debit_account_id']]);
                    $dr = $stmt->fetch();
                    if ($dr) {
                        $min['debit_account_code'] = $dr['code'];
                        $min['debit_account_name'] = $dr['name'];
                    }
                }
                
                // Fetch credit account
                if ($min['credit_account_id']) {
                    $stmt = $pdo->prepare("SELECT code, name FROM coa_list WHERE id=?");
                    $stmt->execute([$min['credit_account_id']]);
                    $cr = $stmt->fetch();
                    if ($cr) {
                        $min['credit_account_code'] = $cr['code'];
                        $min['credit_account_name'] = $cr['name'];
                    }
                }

                sendResponse($min);
            } else {
                sendResponse(['error' => 'Not found'], 404);
            }
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'delete':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('material_issue_notes', 'material_issue_note_items', 'min_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM material_issue_notes WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Material Issue Notes', 'DELETE', $id, 'MIN Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
        break;

    default:
        sendResponse(['error' => 'Invalid action'], 400);
}





