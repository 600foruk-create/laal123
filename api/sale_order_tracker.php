<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? 1);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    // Get Orders for Dropdown
    if ($action === 'get_orders') {
        $query = "SELECT so.serial_no as order_no, so.date, c.name as customer_name
                  FROM sale_orders so
                  LEFT JOIN coa_list c ON so.customer_coa_id = c.id
                  WHERE so.company_id = :company_id AND so.is_cancelled = 0
                  ORDER BY so.date DESC, so.serial_no DESC";
        try {
            $stmt = $pdo->prepare($query);
            $stmt->execute([':company_id' => $company_id]);
            $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['status' => 'success', 'records' => $records]);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
        }
        exit;
    }

    // Master Grid Data with Live Stock, In Order, and Result Calculation
    if ($action === 'get_master') {
        $order_no    = trim($_GET['order_no']    ?? '');
        $from_date   = trim($_GET['from_date']   ?? '');
        $to_date     = trim($_GET['to_date']     ?? '');
        $customer_id = trim($_GET['customer_id'] ?? '');
        $item_id     = trim($_GET['item_id']     ?? '');

        $is_all_items = empty($order_no) || strtoupper($order_no) === 'ALL';

        if (!$is_all_items) {
            // Specific Order Selected (e.g. Order #13)
            $query = "
                SELECT
                    so.id as sale_order_id,
                    so.serial_no as order_no,
                    so.date as date,
                    c.name as party,
                    i.id as item_id,
                    i.code as item_code,
                    i.name as item_name,
                    i.unit as item_unit,
                    i.carton as item_carton,
                    i.qty_per_piece as item_qty_per_piece,
                    i.category_type as category_type,
                    sm.name as main_category_name,
                    ss.name as sub_category_name,
                    soi.pieces as pieces_ordered,
                    soi.qty as qty_ordered,
                    soi.item_id as item_coa_id,
                    IFNULL((
                        SELECT SUM(sii.quantity)
                        FROM sale_invoices sinv
                        JOIN sale_invoice_items sii ON sinv.id = sii.invoice_id
                        WHERE sinv.customer_order_no = so.serial_no
                          AND sinv.company_id = so.company_id
                          AND sii.item_coa_id = soi.item_id
                          AND sinv.is_cancelled = 0
                    ), 0) as qty_supplied
                FROM sale_orders so
                INNER JOIN sale_order_items soi ON so.id = soi.sale_order_id
                LEFT JOIN coa_list c ON so.customer_coa_id = c.id
                LEFT JOIN inv_items i ON soi.item_id = i.id
                LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
                LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
                WHERE so.company_id = :company_id AND so.is_cancelled = 0
                  AND so.serial_no = :order_no
            ";
            $params = [':company_id' => $company_id, ':order_no' => $order_no];

            if (!empty($customer_id)) {
                $query .= " AND so.customer_coa_id = :customer_id";
                $params[':customer_id'] = $customer_id;
            }
            if (!empty($item_id)) {
                $query .= " AND soi.item_id = :item_id";
                $params[':item_id'] = $item_id;
            }
            $query .= " ORDER BY so.date DESC, so.serial_no DESC, i.name ASC";

        } else {
            // ALL ITEMS (Show all items from Chart of Inventory whether in order or not)
            $ordSubWhere = "so.company_id = :company_id AND so.is_cancelled = 0";
            $subParams = [':company_id' => $company_id];

            if (!empty($from_date)) {
                $ordSubWhere .= " AND so.date >= :from_date";
                $subParams[':from_date'] = $from_date;
            }
            if (!empty($to_date)) {
                $ordSubWhere .= " AND so.date <= :to_date";
                $subParams[':to_date'] = $to_date;
            }
            if (!empty($customer_id)) {
                $ordSubWhere .= " AND so.customer_coa_id = :customer_id";
                $subParams[':customer_id'] = $customer_id;
            }

            $query = "
                SELECT
                    NULL as sale_order_id,
                    IFNULL(ord.order_nos, '-') as order_no,
                    ord.latest_date as date,
                    IFNULL(ord.parties, '-') as party,
                    i.id as item_id,
                    i.code as item_code,
                    i.name as item_name,
                    i.unit as item_unit,
                    i.carton as item_carton,
                    i.qty_per_piece as item_qty_per_piece,
                    i.category_type as category_type,
                    sm.name as main_category_name,
                    ss.name as sub_category_name,
                    IFNULL(ord.total_pieces, 0) as pieces_ordered,
                    IFNULL(ord.total_qty, 0) as qty_ordered,
                    i.id as item_coa_id,
                    0 as qty_supplied
                FROM inv_items i
                LEFT JOIN inv_sub_categories ss ON i.sub_id = ss.id
                LEFT JOIN inv_main_categories sm ON ss.main_id = sm.id
                LEFT JOIN (
                    SELECT
                        soi.item_id,
                        GROUP_CONCAT(DISTINCT so.serial_no ORDER BY so.serial_no SEPARATOR ', ') as order_nos,
                        MAX(so.date) as latest_date,
                        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as parties,
                        SUM(soi.pieces) as total_pieces,
                        SUM(soi.qty) as total_qty
                    FROM sale_order_items soi
                    JOIN sale_orders so ON soi.sale_order_id = so.id
                    LEFT JOIN coa_list c ON so.customer_coa_id = c.id
                    WHERE $ordSubWhere
                    GROUP BY soi.item_id
                ) ord ON i.id = ord.item_id
                WHERE i.company_id = :company_id_main
                  AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ";

            $params = array_merge($subParams, [':company_id_main' => $company_id]);

            if (!empty($item_id)) {
                $query .= " AND i.id = :item_id";
                $params[':item_id'] = $item_id;
            }

            // If a specific customer is filtered, only show items that customer ordered
            if (!empty($customer_id)) {
                $query .= " AND ord.item_id IS NOT NULL";
            }

            $query .= " ORDER BY (ord.item_id IS NOT NULL) DESC, i.name ASC";
        }

        try {
            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Collect unique item IDs to compute live current stock
            $item_ids = array_unique(array_filter(array_map(function($r) {
                return intval($r['item_id'] ?? $r['item_coa_id'] ?? 0);
            }, $records)));

            $stock_map = [];
            if (!empty($item_ids)) {
                $id_list = implode(',', $item_ids);

                // Fetch movement settings
                $inv_move_in = 'purchases';
                $inv_move_out = 'sale_invoices';
                try {
                    $stmtSet = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE company_id = ? AND setting_key IN ('inv_move_in', 'inv_move_out')");
                    $stmtSet->execute([(int)$company_id]);
                    $settings_rows = $stmtSet->fetchAll(PDO::FETCH_KEY_PAIR);
                    if (!empty($settings_rows['inv_move_in'])) $inv_move_in = $settings_rows['inv_move_in'];
                    if (!empty($settings_rows['inv_move_out'])) $inv_move_out = $settings_rows['inv_move_out'];
                } catch(Exception $e) {}

                $queries = [];
                // 1. Opening Balance
                $queries[] = "SELECT item_id, quantity as qty, pieces as pcs FROM inv_opening_balances WHERE company_id = $company_id AND item_id IN ($id_list)";

                // 2. Purchases / Inward Gate Pass
                if ($inv_move_in === 'purchases') {
                    $queries[] = "SELECT pii.item_coa_id as item_id, pii.quantity as qty, pii.pieces as pcs FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pii.invoice_id = pi.id WHERE pi.company_id = $company_id AND pi.is_cancelled = 0 AND pi.is_posted = 1 AND pii.item_coa_id IN ($id_list)";
                } elseif ($inv_move_in === 'gate_pass') {
                    $queries[] = "SELECT igpi.item_id as item_id, igpi.qty as qty, 0 as pcs FROM inward_gate_pass_items igpi JOIN inward_gate_passes igp ON igpi.igp_id = igp.id WHERE igp.company_id = $company_id AND igp.is_cancelled = 0 AND igpi.item_id IN ($id_list)";
                }

                // 3. Sale Returns (IN)
                $queries[] = "SELECT sri.item_coa_id as item_id, sri.quantity as qty, sri.pieces as pcs FROM sale_return_items sri JOIN sale_returns sr ON sri.return_id = sr.id WHERE sr.company_id = $company_id AND sr.is_cancelled = 0 AND sr.is_posted = 1 AND sri.item_coa_id IN ($id_list)";

                // 4. Add Inventory Adjustments (IN)
                $queries[] = "SELECT ai.item_id as item_id, ai.qty as qty, 0 as pcs FROM add_inventory_adjustment_items ai JOIN add_inventory_adjustments a ON ai.adjustment_id = a.id WHERE a.company_id = $company_id AND a.is_cancelled = 0 AND ai.item_id IN ($id_list)";

                // 5. Production Notes Finished Goods (IN when qty > 0)
                $queries[] = "SELECT pp.item_id as item_id, pp.qty as qty, pp.pieces as pcs FROM production_note_items pp JOIN production_notes p ON pp.pn_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty > 0 AND pp.item_id IN ($id_list)";

                // 6. Sale Invoices / Delivery Challans (OUT)
                if ($inv_move_out === 'sale_invoices') {
                    $queries[] = "SELECT sii.item_coa_id as item_id, -sii.quantity as qty, -sii.pieces as pcs FROM sale_invoice_items sii JOIN sale_invoices si ON sii.invoice_id = si.id WHERE si.company_id = $company_id AND si.is_cancelled = 0 AND si.is_posted = 1 AND sii.item_coa_id IN ($id_list)";
                } elseif ($inv_move_out === 'delivery_challans') {
                    $queries[] = "SELECT dci.item_id as item_id, -dci.qty as qty, 0 as pcs FROM delivery_challan_items dci JOIN delivery_challans dc ON dci.challan_id = dc.id WHERE dc.company_id = $company_id AND dc.is_cancelled = 0 AND dci.item_id IN ($id_list)";
                } elseif ($inv_move_out === 'gate_pass') {
                    $queries[] = "SELECT ogpi.item_id as item_id, -ogpi.qty as qty, 0 as pcs FROM outward_gate_passes ogp JOIN outward_gate_pass_items ogpi ON ogp.id = ogpi.ogp_id WHERE ogp.company_id = $company_id AND ogp.is_cancelled = 0 AND ogpi.item_id IN ($id_list)";
                }

                // 7. Purchase Returns (OUT)
                $queries[] = "SELECT pri.item_coa_id as item_id, -pri.quantity as qty, 0 as pcs FROM purchase_return_items pri JOIN purchase_returns pr ON pri.return_id = pr.id WHERE pr.company_id = $company_id AND pr.is_cancelled = 0 AND pr.is_posted = 1 AND pri.item_coa_id IN ($id_list)";

                // 8. Reduce Inventory Adjustments (OUT)
                $queries[] = "SELECT ri.item_id as item_id, -ri.qty as qty, 0 as pcs FROM reduce_inventory_adjustment_items ri JOIN reduce_inventory_adjustments r ON ri.adjustment_id = r.id WHERE r.company_id = $company_id AND r.is_cancelled = 0 AND ri.item_id IN ($id_list)";

                // 9. Material Issue Notes (OUT)
                $queries[] = "SELECT mii.item_id as item_id, -mii.qty as qty, -mii.pieces as pcs FROM material_issue_note_items mii JOIN material_issue_notes m ON mii.min_id = m.id WHERE m.company_id = $company_id AND m.is_cancelled = 0 AND m.is_posted = 1 AND mii.item_id IN ($id_list)";

                // 10. Production Notes Raw Materials (OUT when qty < 0)
                $queries[] = "SELECT pp.item_id as item_id, pp.qty as qty, pp.pieces as pcs FROM production_note_items pp JOIN production_notes p ON pp.pn_id = p.id WHERE p.company_id = $company_id AND p.is_cancelled = 0 AND p.is_posted = 1 AND pp.qty < 0 AND pp.item_id IN ($id_list)";

                $unionSql = implode(" UNION ALL ", $queries);
                $stockSql = "SELECT item_id, SUM(qty) as total_qty, SUM(pcs) as total_pcs FROM ($unionSql) as combined GROUP BY item_id";
                try {
                    $stockStmt = $pdo->query($stockSql);
                    while ($sRow = $stockStmt->fetch(PDO::FETCH_ASSOC)) {
                        $stock_map[$sRow['item_id']] = [
                            'qty' => floatval($sRow['total_qty']),
                            'pcs' => floatval($sRow['total_pcs'])
                        ];
                    }
                } catch (Exception $e) {}
            }

            // Process each record for Fitting vs Pipe and calculate Total Stock, In Order, Result
            foreach ($records as &$rec) {
                $itemId = intval($rec['item_id'] ?? $rec['item_coa_id'] ?? 0);

                // Detect Fitting
                $is_fitting = false;
                $cat_combined = strtoupper(($rec['main_category_name'] ?? '') . ' ' . ($rec['sub_category_name'] ?? '') . ' ' . ($rec['category_type'] ?? ''));
                $item_name_upper = strtoupper($rec['item_name'] ?? '');

                if (strpos($cat_combined, 'FITTING') !== false || 
                    strpos($item_name_upper, 'FITTING') !== false || 
                    strpos($item_name_upper, 'ELBOW') !== false || 
                    strpos($item_name_upper, 'TEE') !== false || 
                    strpos($item_name_upper, 'SOCKET') !== false || 
                    strpos($item_name_upper, 'UNION') !== false || 
                    strpos($item_name_upper, 'BEND') !== false || 
                    strpos($item_name_upper, 'BUSH') !== false || 
                    strpos($item_name_upper, 'REDUCER') !== false || 
                    strpos($item_name_upper, 'PLUG') !== false || 
                    strpos($item_name_upper, 'CAP') !== false || 
                    strpos($item_name_upper, 'NIPPLE') !== false) {
                    $is_fitting = true;
                }

                // Pieces per carton
                $pcs_per_ctn = floatval($rec['item_carton'] ?? 0);
                if ($pcs_per_ctn <= 0) {
                    $pcs_per_ctn = floatval($rec['item_qty_per_piece'] ?? 0);
                }
                if ($pcs_per_ctn <= 0) {
                    if (strpos($item_name_upper, '2"') !== false) $pcs_per_ctn = 100;
                    elseif (strpos($item_name_upper, '3"') !== false) $pcs_per_ctn = 50;
                    elseif (strpos($item_name_upper, '4"') !== false) $pcs_per_ctn = 30;
                    else $pcs_per_ctn = 1;
                }

                $raw_stock_qty = floatval($stock_map[$itemId]['qty'] ?? 0);
                $raw_stock_pcs = floatval($stock_map[$itemId]['pcs'] ?? 0);

                $order_pcs = floatval($rec['pieces_ordered'] ?? 0);
                $order_qty = floatval($rec['qty_ordered'] ?? 0);

                if ($is_fitting) {
                    $unit = 'Ctn';
                    // In Order:
                    if ($order_pcs > 0 && $order_qty > $order_pcs && $pcs_per_ctn > 1) {
                        $in_order = $order_pcs; // pieces_ordered holds the carton count
                    } elseif ($pcs_per_ctn > 1 && $order_qty > 50) {
                        $in_order = round($order_qty / $pcs_per_ctn, 2);
                    } else {
                        $in_order = $order_qty > 0 ? $order_qty : $order_pcs;
                    }

                    // Total Stock in Cartons:
                    if ($raw_stock_pcs > 0 && $pcs_per_ctn > 1) {
                        $total_stock = round($raw_stock_pcs / $pcs_per_ctn, 2);
                    } elseif ($raw_stock_qty > 0 && $pcs_per_ctn > 1) {
                        $total_stock = round($raw_stock_qty / $pcs_per_ctn, 2);
                    } else {
                        $total_stock = $raw_stock_qty;
                    }
                } else {
                    // Pipe or other:
                    $unit = $rec['item_unit'] ?: 'Pcs';
                    $in_order = ($order_pcs > 0) ? $order_pcs : $order_qty;
                    $total_stock = ($raw_stock_pcs != 0) ? $raw_stock_pcs : $raw_stock_qty;
                }

                $result_val = $total_stock - $in_order;

                $rec['unit'] = $unit;
                $rec['total_stock'] = $total_stock;
                $rec['in_order'] = $in_order;
                $rec['result'] = $result_val;
                $rec['is_shortage'] = ($result_val < 0);
                $rec['is_fitting'] = $is_fitting;
            }

            echo json_encode(['status' => 'success', 'records' => $records]);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'error', 'error' => $e->getMessage()]);
        }
        exit;
    }
}

echo json_encode(['status' => 'error', 'error' => 'Invalid action']);
?>
