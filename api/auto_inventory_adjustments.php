<?php
require_once 'db_config.php';
header('Content-Type: application/json');
$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

try {
    if ($action === 'get_dependencies') {
        $categories = $pdo->query("SELECT id, name, category_type FROM inv_main_categories WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC);
        $brands = $pdo->query("SELECT id, name FROM inv_brands WHERE company_id = $company_id")->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'status' => 'success',
            'categories' => $categories,
            'brands' => $brands
        ]);
        exit;
    }

    if ($action === 'auto_adjust') {
        $data = json_decode(file_get_contents('php://input'), true);
        $date = $data['date'] ?? date('Y-m-d');
        $adjustments = $data['adjustments'] ?? [];
        
        $adds = [];
        $reduces = [];
        foreach ($adjustments as $adj) {
            $diffQty = (float)($adj['diff_qty'] ?? 0);
            $diffPcs = (float)($adj['diff_pcs'] ?? 0);
            
            if ($diffQty > 0 || ($diffQty == 0 && $diffPcs > 0)) {
                $adds[] = $adj;
            } else if ($diffQty < 0 || ($diffQty == 0 && $diffPcs < 0)) {
                $reduces[] = $adj;
            }
        }

        $pdo->beginTransaction();
        try {
            // Process Additions
            if (count($adds) > 0) {
                $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM add_inventory_adjustments WHERE company_id = ?");
                $stmt->execute([$company_id]);
                $add_serial = ($stmt->fetch()['max_no'] ?? 0) + 1;
                
                $total_qty = array_sum(array_column($adds, 'diff_qty'));
                $total_pcs = array_sum(array_column($adds, 'diff_pcs'));
                
                $stmt = $pdo->prepare("INSERT INTO add_inventory_adjustments (company_id, serial_no, date, remarks, total_qty, total_pieces, is_posted, is_cancelled) VALUES (?, ?, ?, ?, ?, ?, 1, 0)");
                $stmt->execute([$company_id, $add_serial, $date, "Auto Adjusted by Audit", $total_qty, $total_pcs]);
                $add_id = $pdo->lastInsertId();
                
                $stmtItem = $pdo->prepare("INSERT INTO add_inventory_adjustment_items (adjustment_id, item_id, description, qty, pieces) VALUES (?, ?, ?, ?, ?)");
                $stmtGetName = $pdo->prepare("SELECT name FROM inv_items WHERE id = ?");
                foreach ($adds as $add) {
                    $stmtGetName->execute([$add['item_id']]);
                    $itemName = $stmtGetName->fetchColumn() ?: '';
                    $stmtItem->execute([$add_id, $add['item_id'], $itemName, $add['diff_qty'], $add['diff_pcs']]);
                }
            }

            // Process Reductions
            if (count($reduces) > 0) {
                $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM reduce_inventory_adjustments WHERE company_id = ?");
                $stmt->execute([$company_id]);
                $reduce_serial = ($stmt->fetch()['max_no'] ?? 0) + 1;
                
                $total_qty = abs(array_sum(array_column($reduces, 'diff_qty')));
                $total_pcs = abs(array_sum(array_column($reduces, 'diff_pcs')));
                
                $stmt = $pdo->prepare("INSERT INTO reduce_inventory_adjustments (company_id, serial_no, date, remarks, total_qty, total_pieces, is_posted, is_cancelled) VALUES (?, ?, ?, ?, ?, ?, 1, 0)");
                $stmt->execute([$company_id, $reduce_serial, $date, "Auto Adjusted by Audit", $total_qty, $total_pcs]);
                $reduce_id = $pdo->lastInsertId();
                
                $stmtItem = $pdo->prepare("INSERT INTO reduce_inventory_adjustment_items (adjustment_id, item_id, description, qty, pieces) VALUES (?, ?, ?, ?, ?)");
                $stmtGetName = $pdo->prepare("SELECT name FROM inv_items WHERE id = ?");
                foreach ($reduces as $red) {
                    $stmtGetName->execute([$red['item_id']]);
                    $itemName = $stmtGetName->fetchColumn() ?: '';
                    $stmtItem->execute([$reduce_id, $red['item_id'], $itemName, abs($red['diff_qty']), abs($red['diff_pcs'])]);
                }
            }
            
            $pdo->commit();
            echo json_encode(['status' => 'success', 'message' => 'Adjusted successfully']);
            exit;
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            exit;
        }
    }

    echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
