<?php
require 'db_config.php';

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'get_lookups') {
    try {
        $stmtItems = $pdo->prepare("SELECT id, code as item_code, name as item_name FROM inv_items WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL) ORDER BY item_code");
        $stmtItems->execute([(int)$company_id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        $stmtLoc = $pdo->prepare("SELECT id, name FROM inv_locations WHERE company_id = ?");
        $stmtLoc->execute([(int)$company_id]);
        $locations = $stmtLoc->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['items' => $items, 'locations' => $locations, 'debug_company_id' => $company_id]);
    } catch (Exception $e) {
        // http_response_code(500);
        file_put_contents("api_error.log", $e->getMessage() . PHP_EOL, FILE_APPEND); echo json_encode(["error" => $e->getMessage()]);
    }
    exit;
}

if ($action === 'get_ledger') {
    $item_id = $_GET['item_id'] ?? 0;
    $location_id = $_GET['location_id'] ?? '';
    $from_date = $_GET['from_date'] ?? '';
    $to_date = $_GET['to_date'] ?? '';

    if (!$item_id) {
        echo json_encode([]);
        exit;
    }

    $queries = [];
    $params = [];

    // Fetch Inventory Movement Settings
    $stmtSet = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE company_id = ? AND setting_key IN ('inv_move_in', 'inv_move_out')");
    $stmtSet->execute([(int)$company_id]);
    $settings_rows = $stmtSet->fetchAll(PDO::FETCH_KEY_PAIR);
    $inv_move_in = $settings_rows['inv_move_in'] ?? 'purchases';
    $inv_move_out = $settings_rows['inv_move_out'] ?? 'sale_invoices';

    // Helper to add a query block
    $addQuery = function($q) use (&$queries) {
        $queries[] = $q;
    };

    // 0. Inventory Opening Balances
    $q_ob = "SELECT 
             COALESCE(fy.start_date, DATE(ob.created_at), '2000-01-01') as date, 
             CAST('OB' AS CHAR) as tran_no, 
             CAST(COALESCE(l.name, 'Opening Balance') AS CHAR) as party_name, 
             CAST('Inventory Opening Balance' AS CHAR) as description, 
             IF(ob.quantity > 0, ob.quantity, IF(COALESCE(i.qty_per_piece, 0) > 0, ob.pieces * i.qty_per_piece, ob.pieces)) as qty_in, 
             0 as qty_out, 
             CAST(i.unit AS CHAR) as unit, 
             ob.rate, 
             0 as discount, 
             0 as sales_tax, 
             0 as fur_tax, 
             IF(ob.quantity > 0, ob.quantity * ob.rate, IF(COALESCE(i.qty_per_piece, 0) > 0, ob.pieces * i.qty_per_piece * ob.rate, ob.pieces * ob.rate)) as amount_incl_tax, 
             CAST('OB' AS CHAR) as source_type, 
             ob.id as source_id, 
             CAST('OB' AS CHAR) as source_sn, 
             0 as is_tax
             FROM inv_opening_balances ob
             JOIN inv_items i ON ob.item_id = i.id
             LEFT JOIN inv_locations l ON ob.location_id = l.id
             LEFT JOIN financial_years fy ON ob.fy_id = fy.id
             WHERE ob.company_id = $company_id AND ob.item_id = $item_id
             AND (ob.pieces != 0 OR ob.quantity != 0)";
    if ($location_id) $q_ob .= " AND ob.location_id = " . (int)$location_id;
    $addQuery($q_ob);

    // 1. Outwards (Sales vs Delivery Challans vs Outward Gate Passes)
    if ($inv_move_out === 'sale_invoices') {
        $q_si = "SELECT si.invoice_date as date, CAST(CONCAT('SV ', si.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(sii.description AS CHAR) as description, 
                 0 as qty_in, sii.quantity as qty_out, CAST(sii.unit AS CHAR) as unit, sii.rate, 
                 sii.discount_amount as discount, sii.sales_tax_amount as sales_tax, sii.further_tax_amount as fur_tax, sii.net_amount as amount_incl_tax, 
                 CAST('SI' AS CHAR) as source_type, si.id as source_id, si.serial_no as source_sn, si.is_tax_invoice as is_tax
                 FROM sale_invoices si
                 JOIN sale_invoice_items sii ON si.id = sii.invoice_id
                 LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id
                 LEFT JOIN customers c ON cl.id = c.coa_list_id
                 WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 AND sii.item_coa_id = $item_id";
        if ($location_id) $q_si .= " AND si.inventory_location_id = " . (int)$location_id;
        $addQuery($q_si);
    } elseif ($inv_move_out === 'delivery_challans') {
        $q_dc = "SELECT dc.date as date, CAST(CONCAT('DC ', dc.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(dci.description AS CHAR) as description, 
                 0 as qty_in, dci.qty as qty_out, CAST(NULL AS CHAR) as unit, 0 as rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, 0 as amount_incl_tax, 
                 CAST('DC' AS CHAR) as source_type, dc.id as source_id, dc.serial_no as source_sn, 0 as is_tax
                 FROM delivery_challans dc
                 JOIN delivery_challan_items dci ON dc.id = dci.challan_id
                 LEFT JOIN coa_list cl ON dc.customer_coa_id = cl.id
                 LEFT JOIN customers c ON cl.id = c.coa_list_id
                 WHERE dc.company_id = $company_id AND dc.is_cancelled = 0 AND dci.item_id = $item_id";
        if ($location_id) $q_dc .= " AND dc.inventory_location_id = " . (int)$location_id;
        $addQuery($q_dc);
    } elseif ($inv_move_out === 'gate_pass') {
        $q_ogp = "SELECT ogp.date as date, CAST(CONCAT('OGP ', ogp.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(ogpi.description AS CHAR) as description, 
                 0 as qty_in, ogpi.qty as qty_out, CAST(NULL AS CHAR) as unit, 0 as rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, 0 as amount_incl_tax, 
                 CAST('OGP' AS CHAR) as source_type, ogp.id as source_id, ogp.serial_no as source_sn, 0 as is_tax
                 FROM outward_gate_passes ogp
                 JOIN outward_gate_pass_items ogpi ON ogp.id = ogpi.ogp_id
                 LEFT JOIN coa_list cl ON ogp.customer_coa_id = cl.id
                 LEFT JOIN customers c ON cl.id = c.coa_list_id
                 WHERE ogp.company_id = $company_id AND ogp.is_cancelled = 0 AND ogpi.item_id = $item_id";
        if ($location_id) $q_ogp .= " AND ogp.inventory_location_id = " . (int)$location_id;
        $addQuery($q_ogp);
    }

    // 2. Sale Returns (Qty In)
    $q_sr = "SELECT sr.return_date as date, CAST(CONCAT('RI ', sr.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(sri.description AS CHAR) as description, 
             sri.quantity as qty_in, 0 as qty_out, CAST(sri.unit AS CHAR) as unit, sri.rate, 
             sri.discount_amount as discount, sri.sales_tax_amount as sales_tax, sri.further_tax_amount as fur_tax, sri.net_amount as amount_incl_tax, 
             CAST('SR' AS CHAR) as source_type, sr.id as source_id, sr.serial_no as source_sn, sr.is_tax_return as is_tax
             FROM sale_returns sr
             JOIN sale_return_items sri ON sr.id = sri.return_id
             LEFT JOIN coa_list cl ON sr.customer_coa_id = cl.id
             LEFT JOIN customers c ON cl.id = c.coa_list_id
             WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1 AND sri.item_coa_id = $item_id";
    if ($location_id) $q_sr .= " AND sr.inventory_location_id = " . (int)$location_id;
    $addQuery($q_sr);

    // 3. Inwards (Purchases vs Inward Gate Passes)
    if ($inv_move_in === 'purchases') {
        $q_pi = "SELECT pi.invoice_date as date, CAST(CONCAT('PV ', pi.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(pii.description AS CHAR) as description, 
                 pii.quantity as qty_in, 0 as qty_out, CAST(pii.unit AS CHAR) as unit, pii.rate, 
                 pii.discount_amount as discount, pii.sales_tax_amount as sales_tax, pii.further_tax_amount as fur_tax, pii.net_amount as amount_incl_tax, 
                 CAST('PI' AS CHAR) as source_type, pi.id as source_id, pi.serial_no as source_sn, pi.is_tax_invoice as is_tax
                 FROM purchase_invoices pi
                 JOIN purchase_invoice_items pii ON pi.id = pii.invoice_id
                 LEFT JOIN coa_list cl ON pi.vendor_coa_id = cl.id
                 LEFT JOIN vendors v ON cl.id = v.coa_list_id
                 WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pii.item_coa_id = $item_id";
        if ($location_id) $q_pi .= " AND pi.inventory_location_id = " . (int)$location_id;
        $addQuery($q_pi);
    } elseif ($inv_move_in === 'gate_pass') {
        $q_igp = "SELECT igp.date as date, CAST(CONCAT('IGP ', igp.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(igpi.description AS CHAR) as description, 
                 igpi.qty as qty_in, 0 as qty_out, CAST(NULL AS CHAR) as unit, 0 as rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, 0 as amount_incl_tax, 
                 CAST('IGP' AS CHAR) as source_type, igp.id as source_id, igp.serial_no as source_sn, 0 as is_tax
                 FROM inward_gate_passes igp
                 JOIN inward_gate_pass_items igpi ON igp.id = igpi.igp_id
                 LEFT JOIN coa_list cl ON igp.vendor_coa_id = cl.id
                 LEFT JOIN vendors v ON cl.id = v.coa_list_id
                 WHERE igp.company_id = $company_id AND igp.is_cancelled = 0 AND igpi.item_id = $item_id";
        if ($location_id) $q_igp .= " AND igp.inventory_location_id = " . (int)$location_id;
        $addQuery($q_igp);
    }

    // 4. Purchase Returns (Qty Out)
    $q_pr = "SELECT pr.return_date as date, CAST(CONCAT('PR ', pr.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(pri.description AS CHAR) as description, 
             0 as qty_in, pri.quantity as qty_out, CAST(pri.unit AS CHAR) as unit, pri.rate, 
             0 as discount, pri.tax_amount as sales_tax, pri.further_tax_amount as fur_tax, pri.value_incl_tax as amount_incl_tax, 
             CAST('PR' AS CHAR) as source_type, pr.id as source_id, pr.serial_no as source_sn, 0 as is_tax
             FROM purchase_returns pr
             JOIN purchase_return_items pri ON pr.id = pri.return_id
             LEFT JOIN coa_list cl ON pr.vendor_coa_id = cl.id
             LEFT JOIN vendors v ON cl.id = v.coa_list_id
             WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 AND pri.item_coa_id = $item_id AND pr.nature_of_debit_note IN ('Purchase Return (Reduces Inventory)', 'Shortage (Reduces Inventory)')";
    if ($location_id) $q_pr .= " AND pr.inventory_location_id = " . (int)$location_id;
    $addQuery($q_pr);

    // 5. Add Inventory Adjustments (Qty In)
    $q_aia = "SELECT a.date as date, CAST(CONCAT('AI ', a.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ai.description AS CHAR) as description, 
             ai.qty as qty_in, 0 as qty_out, CAST(NULL AS CHAR) as unit, ai.rate, 
             0 as discount, 0 as sales_tax, 0 as fur_tax, ai.amount as amount_incl_tax, 
             CAST('AI' AS CHAR) as source_type, a.id as source_id, a.serial_no as source_sn, 0 as is_tax
             FROM add_inventory_adjustments a
             JOIN add_inventory_adjustment_items ai ON a.id = ai.adjustment_id
             WHERE a.company_id = $company_id AND a.is_cancelled = 0 AND ai.item_id = $item_id";
    if ($location_id) $q_aia .= " AND a.inventory_location_id = " . (int)$location_id;
    $addQuery($q_aia);

    // 6. Reduce Inventory Adjustments (Qty Out)
    $q_ria = "SELECT r.date as date, CAST(CONCAT('RI ', r.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ri.description AS CHAR) as description, 
             0 as qty_in, ri.qty as qty_out, CAST(NULL AS CHAR) as unit, ri.rate, 
             0 as discount, 0 as sales_tax, 0 as fur_tax, ri.amount as amount_incl_tax, 
             CAST('RI' AS CHAR) as source_type, r.id as source_id, r.serial_no as source_sn, 0 as is_tax
             FROM reduce_inventory_adjustments r
             JOIN reduce_inventory_adjustment_items ri ON r.id = ri.adjustment_id
             WHERE r.company_id = $company_id AND r.is_cancelled = 0 AND ri.item_id = $item_id";
    if ($location_id) $q_ria .= " AND r.inventory_location_id = " . (int)$location_id;

    $q_min_ob = "SELECT m.date as date, CAST(CONCAT('MIN ', m.serial_no) AS CHAR) as tran_no, 
             CAST(NULL AS CHAR) as party_name, CAST(mii.description AS CHAR) as description, 
             0 as qty_in, mii.qty as qty_out, CAST(NULL AS CHAR) as unit, mii.rate, 
             0 as discount, 0 as sales_tax, 0 as fur_tax, mii.amount as amount_incl_tax, 
             CAST('MIN' AS CHAR) as source_type, m.id as source_id, m.serial_no as source_sn, 0 as is_tax
             FROM material_issue_notes m
             JOIN material_issue_note_items mii ON m.id = mii.min_id
             WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 AND mii.item_id = $item_id";
    if ($location_id) $q_min_ob .= " AND m.inventory_location_id = " . (int)$location_id;
    $addQuery($q_ria);
    $addQuery($q_min_ob);

    // 7. Production Notes (Qty In/Out based on sign)
    $q_pnp = "SELECT p.date as date, CAST(CONCAT('PDV ', p.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(pp.description AS CHAR) as description, 
             IF(pp.qty > 0, pp.qty, 0) as qty_in, IF(pp.qty < 0, ABS(pp.qty), 0) as qty_out, CAST(NULL AS CHAR) as unit, pp.rate, 
             0 as discount, 0 as sales_tax, 0 as fur_tax, pp.amount as amount_incl_tax, 
             CAST('PDV' AS CHAR) as source_type, p.id as source_id, p.serial_no as source_sn, 0 as is_tax
             FROM production_notes p
             JOIN production_note_items pp ON p.id = pp.pn_id
             WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.item_id = $item_id";
    if ($location_id) $q_pnp .= " AND p.inventory_location_id = " . (int)$location_id;
    $addQuery($q_pnp);

    // 8. Inventory Transfers
    if ($location_id) {
        // Transfer Out (From this location)
        $q_it_out = "SELECT t.date as date, CAST(CONCAT('TR ', t.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ti.description AS CHAR) as description, 
                 0 as qty_in, ti.qty as qty_out, CAST(NULL AS CHAR) as unit, ti.rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, ti.amount as amount_incl_tax, 
                 CAST('TR' AS CHAR) as source_type, t.id as source_id, t.serial_no as source_sn, 0 as is_tax
                 FROM inventory_transfers t
                 JOIN inventory_transfer_items ti ON t.id = ti.transfer_id
                 WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id = $item_id
                 AND t.transfer_from_location_id = $location_id";
        $addQuery($q_it_out);

        // Transfer In (To this location)
        $q_it_in = "SELECT t.date as date, CAST(CONCAT('TR ', t.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ti.description AS CHAR) as description, 
                 ti.qty as qty_in, 0 as qty_out, CAST(NULL AS CHAR) as unit, ti.rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, ti.amount as amount_incl_tax, 
                 CAST('TR' AS CHAR) as source_type, t.id as source_id, t.serial_no as source_sn, 0 as is_tax
                 FROM inventory_transfers t
                 JOIN inventory_transfer_items ti ON t.id = ti.transfer_id
                 WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id = $item_id
                 AND t.transfer_to_location_id = $location_id";
        $addQuery($q_it_in);
    } else {
        // Global ledger - show both sides of the transfer
        $q_it_out = "SELECT t.date as date, CAST(CONCAT('TR ', t.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ti.description AS CHAR) as description, 
                 0 as qty_in, ti.qty as qty_out, CAST(NULL AS CHAR) as unit, ti.rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, ti.amount as amount_incl_tax, 
                 CAST('TR' AS CHAR) as source_type, t.id as source_id, t.serial_no as source_sn, 0 as is_tax
                 FROM inventory_transfers t
                 JOIN inventory_transfer_items ti ON t.id = ti.transfer_id
                 WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id = $item_id";
        $addQuery($q_it_out);

        $q_it_in = "SELECT t.date as date, CAST(CONCAT('TR ', t.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ti.description AS CHAR) as description, 
                 ti.qty as qty_in, 0 as qty_out, CAST(NULL AS CHAR) as unit, ti.rate, 
                 0 as discount, 0 as sales_tax, 0 as fur_tax, ti.amount as amount_incl_tax, 
                 CAST('TR' AS CHAR) as source_type, t.id as source_id, t.serial_no as source_sn, 0 as is_tax
                 FROM inventory_transfers t
                 JOIN inventory_transfer_items ti ON t.id = ti.transfer_id
                 WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id = $item_id";
        $addQuery($q_it_in);
    }

    $final_sql = "SELECT * FROM (" . implode(" UNION ALL ", $queries) . ") as combined ORDER BY date ASC, (CASE WHEN source_type = 'OB' THEN 0 ELSE 1 END) ASC, source_id ASC";

    try {
        $stmt = $pdo->prepare($final_sql);
        $stmt->execute();
        $all_rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Date Filtering with Brought-Forward Opening Balance
        if ($from_date && $to_date) {
            $pre_qty_in = 0;
            $pre_qty_out = 0;
            $current_rows = [];
            $unit = '';
            $rate = 0;

            foreach ($all_rows as $row) {
                if (!empty($row['unit'])) $unit = $row['unit'];
                if (!empty($row['rate']) && (float)$row['rate'] > 0) $rate = (float)$row['rate'];

                $r_date = $row['date'];
                if ($r_date < $from_date) {
                    $pre_qty_in += (float)$row['qty_in'];
                    $pre_qty_out += (float)$row['qty_out'];
                } elseif ($r_date <= $to_date) {
                    $current_rows[] = $row;
                }
            }

            $pre_balance = $pre_qty_in - $pre_qty_out;
            if ($pre_balance != 0 || $pre_qty_in != 0 || $pre_qty_out != 0) {
                $ob_row = [
                    'date' => $from_date,
                    'tran_no' => 'OB',
                    'party_name' => 'Opening Balance',
                    'description' => 'Balance Brought Forward',
                    'qty_in' => $pre_balance > 0 ? $pre_balance : 0,
                    'qty_out' => $pre_balance < 0 ? abs($pre_balance) : 0,
                    'unit' => $unit,
                    'rate' => $rate,
                    'discount' => 0,
                    'sales_tax' => 0,
                    'fur_tax' => 0,
                    'amount_incl_tax' => abs($pre_balance) * $rate,
                    'source_type' => 'OB',
                    'source_id' => 0,
                    'source_sn' => 'OB',
                    'is_tax' => 0
                ];
                array_unshift($current_rows, $ob_row);
            }
            echo json_encode($current_rows);
        } else {
            echo json_encode($all_rows);
        }
    } catch (Exception $e) {
        http_response_code(200);
        $errorMsg = $e->getMessage();
        // Log the SQL for debugging
        $debugSql = substr($final_sql, 0, 500);
        $fullMsg = $errorMsg . ' | QUERY_START: ' . $debugSql;
        $error_rows = [];
        
        for ($i = 0; $i < ceil(strlen($fullMsg) / 80); $i++) {
            $chunk = substr($fullMsg, $i * 80, 80);
            $error_rows[] = [
                'date' => date('Y-m-d'),
                'tran_no' => 'ERR ' . ($i + 1),
                'party_name' => '>>>',
                'description' => $chunk,
                'qty_in' => 0,
                'qty_out' => 0,
                'unit' => '',
                'rate' => 0,
                'discount' => 0,
                'sales_tax' => 0,
                'fur_tax' => 0,
                'amount_incl_tax' => 0,
                'source_type' => 'ERR',
                'source_id' => 0,
                'is_tax' => 0
            ];
        }
        echo json_encode($error_rows);
        exit;
    }
    exit;
}

if ($action === 'get_multiple_ledgers') {
    $print_type = $_GET['print_type'] ?? 'all';
    $cat_id = $_GET['cat_id'] ?? '';
    $sub_cat_id = $_GET['sub_cat_id'] ?? '';
    $from_code = $_GET['from_code'] ?? '';
    $to_code = $_GET['to_code'] ?? '';
    $from_date = $_GET['from_date'] ?? '';
    $to_date = $_GET['to_date'] ?? '';

    $items_query = "SELECT i.* FROM inv_items i 
                    LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
                    LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id 
                    WHERE i.company_id = ?";
    $params = [(int)$company_id];

    if ($print_type === 'category') {
        if ($cat_id) { $items_query .= " AND sm.id = ?"; $params[] = (int)$cat_id; }
        if ($sub_cat_id) { $items_query .= " AND ss.id = ?"; $params[] = (int)$sub_cat_id; }
    } elseif ($print_type === 'range') {
        if ($from_code && $to_code) {
            $items_query .= " AND i.code BETWEEN ? AND ?";
            $params[] = $from_code;
            $params[] = $to_code;
        }
    }

    $items_query .= " ORDER BY i.code ASC";
    $stmtItems = $pdo->prepare($items_query);
    $stmtItems->execute($params);
    $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

    if (empty($items)) {
        echo json_encode(['error' => 'No items found matching criteria.']);
        exit;
    }
    
    $item_ids = array_column($items, 'id');
    $id_list = implode(',', array_map('intval', $item_ids));
    
    $item_details = [];
    foreach ($items as $it) {
        $item_details[$it['id']] = ['code' => $it['code'], 'name' => $it['name']];
    }
    
    $queries = [];
    $addQuery = function($q) use (&$queries) { $queries[] = $q; };

    // Inventory Opening Balances for Multiple Ledgers
    $addQuery("SELECT ob.item_id as item_id, 
               COALESCE(fy.start_date, DATE(ob.created_at), '2000-01-01') as date, 
               CAST('OB' AS CHAR) as tran_no, 
               CAST(COALESCE(l.name, 'Opening Balance') AS CHAR) as party_name, 
               CAST('Inventory Opening Balance' AS CHAR) as description, 
               IF(ob.quantity > 0, ob.quantity, IF(COALESCE(i.qty_per_piece, 0) > 0, ob.pieces * i.qty_per_piece, ob.pieces)) as qty_in, 
               0 as qty_out, 
               CAST(i.unit AS CHAR) as unit, 
               ob.rate, 
               0 as discount, 
               0 as sales_tax, 
               0 as fur_tax, 
               IF(ob.quantity > 0, ob.quantity * ob.rate, IF(COALESCE(i.qty_per_piece, 0) > 0, ob.pieces * i.qty_per_piece * ob.rate, ob.pieces * ob.rate)) as amount_incl_tax, 
               CAST('OB' AS CHAR) as source_type, 
               ob.id as source_id 
               FROM inv_opening_balances ob 
               JOIN inv_items i ON ob.item_id = i.id 
               LEFT JOIN inv_locations l ON ob.location_id = l.id 
               LEFT JOIN financial_years fy ON ob.fy_id = fy.id 
               WHERE ob.company_id = $company_id AND ob.item_id IN ($id_list) 
               AND (ob.pieces != 0 OR ob.quantity != 0)");

    $addQuery("SELECT sii.item_coa_id as item_id, si.invoice_date as date, CAST(CONCAT('SV ', si.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(sii.description AS CHAR) as description, 0 as qty_in, sii.quantity as qty_out, CAST(sii.unit AS CHAR) as unit, sii.rate, sii.discount_amount as discount, sii.sales_tax_amount as sales_tax, sii.further_tax_amount as fur_tax, sii.net_amount as amount_incl_tax, CAST('SI' AS CHAR) as source_type, si.id as source_id FROM sale_invoices si JOIN sale_invoice_items sii ON si.id = sii.invoice_id LEFT JOIN coa_list cl ON si.customer_coa_id = cl.id WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 AND sii.item_coa_id IN ($id_list)");

    $addQuery("SELECT sri.item_coa_id as item_id, sr.return_date as date, CAST(CONCAT('RI ', sr.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(sri.description AS CHAR) as description, sri.quantity as qty_in, 0 as qty_out, CAST(sri.unit AS CHAR) as unit, sri.rate, sri.discount_amount as discount, sri.sales_tax_amount as sales_tax, sri.further_tax_amount as fur_tax, sri.net_amount as amount_incl_tax, CAST('SR' AS CHAR) as source_type, sr.id as source_id FROM sale_returns sr JOIN sale_return_items sri ON sr.id = sri.return_id LEFT JOIN coa_list cl ON sr.customer_coa_id = cl.id WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1 AND sri.item_coa_id IN ($id_list)");

    $addQuery("SELECT pii.item_coa_id as item_id, pi.invoice_date as date, CAST(CONCAT('PV ', pi.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(pii.description AS CHAR) as description, pii.quantity as qty_in, 0 as qty_out, CAST(pii.unit AS CHAR) as unit, pii.rate, pii.discount_amount as discount, pii.sales_tax_amount as sales_tax, pii.further_tax_amount as fur_tax, pii.net_amount as amount_incl_tax, CAST('PI' AS CHAR) as source_type, pi.id as source_id FROM purchase_invoices pi JOIN purchase_invoice_items pii ON pi.id = pii.invoice_id LEFT JOIN coa_list cl ON pi.vendor_coa_id = cl.id WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pii.item_coa_id IN ($id_list)");

    $addQuery("SELECT pri.item_coa_id as item_id, pr.return_date as date, CAST(CONCAT('PR ', pr.serial_no) AS CHAR) as tran_no, CAST(cl.name AS CHAR) as party_name, CAST(pri.description AS CHAR) as description, 0 as qty_in, pri.quantity as qty_out, CAST(pri.unit AS CHAR) as unit, pri.rate, 0 as discount, pri.tax_amount as sales_tax, pri.further_tax_amount as fur_tax, pri.value_incl_tax as amount_incl_tax, CAST('PR' AS CHAR) as source_type, pr.id as source_id FROM purchase_returns pr JOIN purchase_return_items pri ON pr.id = pri.return_id LEFT JOIN coa_list cl ON pr.vendor_coa_id = cl.id WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 AND pri.item_coa_id IN ($id_list) AND pr.nature_of_debit_note IN ('Purchase Return (Reduces Inventory)', 'Shortage (Reduces Inventory)')");

    $addQuery("SELECT ai.item_id as item_id, a.date as date, CAST(CONCAT('AI ', a.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ai.description AS CHAR) as description, ai.qty as qty_in, 0 as qty_out, CAST(NULL AS CHAR) as unit, ai.rate, 0 as discount, 0 as sales_tax, 0 as fur_tax, ai.amount as amount_incl_tax, CAST('AI' AS CHAR) as source_type, a.id as source_id FROM add_inventory_adjustments a JOIN add_inventory_adjustment_items ai ON a.id = ai.adjustment_id WHERE a.company_id = $company_id AND a.is_cancelled = 0 AND ai.item_id IN ($id_list)");

    $addQuery("SELECT ri.item_id as item_id, r.date as date, CAST(CONCAT('RI ', r.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ri.description AS CHAR) as description, 0 as qty_in, ri.qty as qty_out, CAST(NULL AS CHAR) as unit, ri.rate, 0 as discount, 0 as sales_tax, 0 as fur_tax, ri.amount as amount_incl_tax, CAST('RI' AS CHAR) as source_type, r.id as source_id FROM reduce_inventory_adjustments r JOIN reduce_inventory_adjustment_items ri ON r.id = ri.adjustment_id WHERE r.company_id = $company_id AND r.is_cancelled = 0 AND ri.item_id IN ($id_list)");
    
    $addQuery("SELECT mii.item_id as item_id, m.date as date, CAST(CONCAT('MIN ', m.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(mii.description AS CHAR) as description, 0 as qty_in, mii.qty as qty_out, CAST(NULL AS CHAR) as unit, mii.rate, 0 as discount, 0 as sales_tax, 0 as fur_tax, mii.amount as amount_incl_tax, CAST('MIN' AS CHAR) as source_type, m.id as source_id FROM material_issue_notes m JOIN material_issue_note_items mii ON m.id = mii.min_id WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 AND mii.item_id IN ($id_list)");

    $addQuery("SELECT pp.item_id as item_id, p.date as date, CAST(CONCAT('PDV ', p.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(pp.description AS CHAR) as description, IF(pp.qty > 0, pp.qty, 0) as qty_in, IF(pp.qty < 0, ABS(pp.qty), 0) as qty_out, CAST(NULL AS CHAR) as unit, pp.rate, 0 as discount, 0 as sales_tax, 0 as fur_tax, pp.amount as amount_incl_tax, CAST('PDV' AS CHAR) as source_type, p.id as source_id FROM production_notes p JOIN production_note_items pp ON p.id = pp.pn_id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.item_id IN ($id_list)");

    $addQuery("SELECT ti.item_id as item_id, t.date as date, CAST(CONCAT('TR ', t.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ti.description AS CHAR) as description, 0 as qty_in, ti.qty as qty_out, CAST(NULL AS CHAR) as unit, ti.rate, 0 as discount, 0 as sales_tax, 0 as fur_tax, ti.amount as amount_incl_tax, CAST('TR' AS CHAR) as source_type, t.id as source_id FROM inventory_transfers t JOIN inventory_transfer_items ti ON t.id = ti.transfer_id WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id IN ($id_list)");
    
    $addQuery("SELECT ti.item_id as item_id, t.date as date, CAST(CONCAT('TR ', t.serial_no) AS CHAR) as tran_no, CAST(NULL AS CHAR) as party_name, CAST(ti.description AS CHAR) as description, ti.qty as qty_in, 0 as qty_out, CAST(NULL AS CHAR) as unit, ti.rate, 0 as discount, 0 as sales_tax, 0 as fur_tax, ti.amount as amount_incl_tax, CAST('TR' AS CHAR) as source_type, t.id as source_id FROM inventory_transfers t JOIN inventory_transfer_items ti ON t.id = ti.transfer_id WHERE t.company_id = $company_id AND t.is_cancelled = 0 AND ti.item_id IN ($id_list)");

    $final_sql = "SELECT * FROM (" . implode(" UNION ALL ", $queries) . ") as combined";
    
    if ($from_date && $to_date) {
        $final_sql .= " WHERE date BETWEEN '$from_date' AND '$to_date'";
    }
    
    $final_sql .= " ORDER BY item_id ASC, date ASC, source_id ASC";

    try {
        $stmt = $pdo->prepare($final_sql);
        $stmt->execute();
        $all_rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $grouped = [];
        foreach($all_rows as $row) {
            $iid = $row['item_id'];
            if(!isset($grouped[$iid])) $grouped[$iid] = [];
            $grouped[$iid][] = $row;
        }
        
        foreach($item_ids as $iid) {
            if(!isset($grouped[$iid])) {
                $grouped[$iid] = [];
            }
        }
        
        echo json_encode(['grouped' => $grouped, 'item_details' => $item_details]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
        exit;
    }
}
?>


