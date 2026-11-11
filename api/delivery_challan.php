<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Tables
if (shouldRunMigration('delivery_challans_schema', 1)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS delivery_challans (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            serial_no INT NOT NULL,
            date DATE NOT NULL,
            customer_coa_id INT,
            purchase_order_no VARCHAR(100),
            purchase_order_date DATE,
            job_id INT,
            inventory_location_id INT,
            vehicle_description TEXT,
            driver_name VARCHAR(100),
            time_of_supply TIME,
            remarks TEXT,
            total_pieces DECIMAL(15,2) DEFAULT 0,
            total_qty DECIMAL(15,2) DEFAULT 0,
            is_cancelled TINYINT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (company_id, serial_no)
        ) ENGINE=InnoDB");

        $pdo->exec("CREATE TABLE IF NOT EXISTS delivery_challan_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            challan_id INT NOT NULL,
            item_id INT NOT NULL,
            pieces DECIMAL(15,2) DEFAULT 0,
            qty DECIMAL(15,2) DEFAULT 0,
            packing_detail TEXT,
            sort_order INT DEFAULT 0,
            FOREIGN KEY (challan_id) REFERENCES delivery_challans(id) ON DELETE CASCADE
        ) ENGINE=InnoDB");

        $dcCols = $pdo->query("SHOW COLUMNS FROM delivery_challans")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('customer_address', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN customer_address VARCHAR(500) DEFAULT ''");
        }
        if (!in_array('customer_telephone', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN customer_telephone VARCHAR(100) DEFAULT ''");
        }
        if (!in_array('is_stn', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN is_stn TINYINT DEFAULT 0");
        }
        if (!in_array('driver_cnic', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN driver_cnic VARCHAR(50) DEFAULT ''");
        }
        if (!in_array('stn_no', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN stn_no VARCHAR(50) DEFAULT ''");
        }
        if (!in_array('total_value', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN total_value DECIMAL(15,2) DEFAULT 0");
        }
        if (!in_array('driver_mobile', $dcCols)) {
            $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN driver_mobile VARCHAR(50) DEFAULT ''");
        }
    } catch (Exception $e) {}
}

switch ($action) {
    case 'get_next_serial_no':
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM delivery_challans WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
        break;

    case 'update_stn_state':
        $id = $_POST['id'] ?? null;
        if ($id) {
            $is_stn = !empty($_POST['is_stn']) ? 1 : 0;
            $stn_no = $_POST['stn_no'] ?? '';
            $driver_cnic = $_POST['driver_cnic'] ?? '';
            $driver_name = $_POST['driver_name'] ?? '';
            $vehicle_description = $_POST['vehicle_description'] ?? '';
            $time_of_supply = $_POST['time_of_supply'] ?? '';
            $stmt = $pdo->prepare("UPDATE delivery_challans SET is_stn = ?, stn_no = ?, driver_cnic = ?, driver_name = ?, vehicle_description = ?, time_of_supply = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$is_stn, $stn_no, $driver_cnic, $driver_name, $vehicle_description, $time_of_supply, $id, $company_id]);
            sendResponse(['success' => true]);
        }
        sendResponse(['error' => 'No ID provided'], 400);
        break;

    case 'get_next_stn_no':
        $date = $_GET['date'] ?? date('Y-m-d');
        $date_obj = new DateTime($date);
        $date_formatted = $date_obj->format('dmy');
        
        $stn_stmt = $pdo->prepare("SELECT stn_no FROM delivery_challans WHERE company_id = ? AND date = ? AND is_stn = 1 AND stn_no LIKE ? ORDER BY id DESC LIMIT 1");
        $stn_stmt->execute([$company_id, $date, "STN-%$date_formatted"]);
        $last_stn = $stn_stmt->fetchColumn();
        
        $next_seq = 1;
        if ($last_stn) {
            if (preg_match('/STN-(\d{3})' . preg_quote($date_formatted) . '/', $last_stn, $matches)) {
                $next_seq = (int)$matches[1] + 1;
            }
        }
        
        $stn_no = sprintf("STN-%03d%s", $next_seq, $date_formatted);
        sendResponse(['stn_no' => $stn_no]);
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) sendResponse(['error' => 'Invalid data'], 400);

        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('delivery_challans', 'delivery_challan_items', 'challan_id', $id) : null;
            
            $is_stn = !empty($data['is_stn']) ? 1 : 0;
            $driver_cnic = $data['driver_cnic'] ?? '';
            $stn_no = $data['stn_no'] ?? ($before_data['header']['stn_no'] ?? '');

            if ($is_stn && empty($stn_no)) {
                $date_obj = new DateTime($data['date']);
                $date_formatted = $date_obj->format('dmy');
                
                $stn_stmt = $pdo->prepare("SELECT stn_no FROM delivery_challans WHERE company_id = ? AND date = ? AND is_stn = 1 AND stn_no LIKE ? ORDER BY id DESC LIMIT 1");
                $stn_stmt->execute([$company_id, $data['date'], "STN-%$date_formatted"]);
                $last_stn = $stn_stmt->fetchColumn();
                
                $next_seq = 1;
                if ($last_stn) {
                    if (preg_match('/STN-(\d{3})' . preg_quote($date_formatted) . '/', $last_stn, $matches)) {
                        $next_seq = (int)$matches[1] + 1;
                    }
                }
                
                $stn_no = sprintf("STN-%03d%s", $next_seq, $date_formatted);
            } else if (!$is_stn) {
                $stn_no = '';
            }

            $pdo->beginTransaction();

            if ($id) {
                // Update
                $sql = "UPDATE delivery_challans SET 
                        serial_no = ?, date = ?, customer_coa_id = ?,
                        customer_address = ?, customer_telephone = ?,
                        purchase_order_no = ?, 
                        purchase_order_date = ?, job_id = ?, inventory_location_id = ?, 
                        vehicle_description = ?, driver_name = ?, time_of_supply = ?, 
                        remarks = ?, total_pieces = ?, total_qty = ?, total_value = ?, is_cancelled = ?,
                        is_stn = ?, driver_cnic = ?, driver_mobile = ?, stn_no = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['serial_no'], $data['date'], $data['customer_coa_id'],
                    $data['customer_address'] ?? '', $data['customer_telephone'] ?? '',
                    $data['purchase_order_no'],
                    $data['purchase_order_date'], $data['job_id'], $data['inventory_location_id'],
                    $data['vehicle_description'], $data['driver_name'], $data['time_of_supply'],
                    $data['remarks'], $data['total_pieces'], $data['total_qty'], 
                    $data['total_value'] ?? 0,
                    $data['is_cancelled'] ? 1 : 0, 
                    $is_stn, $driver_cnic, $data['driver_mobile'] ?? '', $stn_no, 
                    $id, $company_id
                ]);
            } else {
                // Insert
                $sql = "INSERT INTO delivery_challans (
                        company_id, serial_no, date, customer_coa_id,
                        customer_address, customer_telephone,
                        purchase_order_no, 
                        purchase_order_date, job_id, inventory_location_id, 
                        vehicle_description, driver_name, time_of_supply, 
                        remarks, total_pieces, total_qty, total_value, is_cancelled,
                        is_stn, driver_cnic, driver_mobile, stn_no
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $data['serial_no'], $data['date'], $data['customer_coa_id'],
                    $data['customer_address'] ?? '', $data['customer_telephone'] ?? '',
                    $data['purchase_order_no'], $data['purchase_order_date'], $data['job_id'], 
                    $data['inventory_location_id'], $data['vehicle_description'], $data['driver_name'], 
                    $data['time_of_supply'], $data['remarks'], $data['total_pieces'], 
                    $data['total_qty'], $data['total_value'] ?? 0, $data['is_cancelled'] ? 1 : 0,
                    $is_stn, $driver_cnic, $data['driver_mobile'] ?? '', $stn_no
                ]);
                $id = $pdo->lastInsertId();
            }

            // Save Items
            $pdo->prepare("DELETE FROM delivery_challan_items WHERE challan_id = ?")->execute([$id]);
            $itemSql = "INSERT INTO delivery_challan_items (challan_id, item_id, pieces, qty, packing_detail, sort_order) 
                        VALUES (?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $index => $item) {
                if (empty($item['item_id'])) continue;
                $itemStmt->execute([
                    $id, $item['item_id'], $item['pieces'], $item['qty'], $item['packing_detail'], $index
                ]);
            }

            $pdo->commit();
            $after_data = fetchRecordData('delivery_challans', 'delivery_challan_items', 'challan_id', $id);
            logActivity('Delivery Challans', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Challan Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;
    case 'get_all':
        $stmt = $pdo->prepare("SELECT dc.serial_no, dc.date, dc.purchase_order_no, dc.purchase_order_date, c.name as customer_name, dc.vehicle_description as vehicle, dc.driver_name as driver, dc.is_cancelled, dc.created_at, dc.id FROM delivery_challans dc LEFT JOIN coa_list c ON dc.customer_coa_id = c.id WHERE dc.company_id = ? ORDER BY dc.serial_no DESC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
        break;

    case 'search':
        $field = $_GET['field'] ?? 'serial_no';
        $value = $_GET['value'] ?? '';
        $allowed_fields = ['serial_no', 'date', 'purchase_order_no', 'customer', 'vehicle', 'driver'];
        if (!in_array($field, $allowed_fields)) $field = 'serial_no';
        
        $where = "dc.company_id = ?";
        if ($field == 'customer') {
            $where .= " AND c.name LIKE ?";
        } else if ($field == 'vehicle') {
            $where .= " AND dc.vehicle_description LIKE ?";
        } else if ($field == 'driver') {
            $where .= " AND dc.driver_name LIKE ?";
        } else {
            $where .= " AND dc.$field LIKE ?";
        }
        
        $stmt = $pdo->prepare("SELECT dc.serial_no, dc.date, dc.purchase_order_no, dc.purchase_order_date, c.name as customer_name, dc.vehicle_description as vehicle, dc.driver_name as driver, dc.is_cancelled, dc.created_at, dc.id FROM delivery_challans dc LEFT JOIN coa_list c ON dc.customer_coa_id = c.id WHERE $where ORDER BY dc.serial_no DESC");
        $stmt->execute([$company_id, "%$value%"]);
        sendResponse($stmt->fetchAll());
        break;

    case 'fetch':
        $sn = $_GET['sn'] ?? 0;
        $dir = $_GET['dir'] ?? '';
        
        if ($dir === 'next') {
            $stmt = $pdo->prepare("SELECT * FROM delivery_challans WHERE company_id = ? AND serial_no > ? ORDER BY serial_no ASC LIMIT 1");
        } else if ($dir === 'prev') {
            $stmt = $pdo->prepare("SELECT * FROM delivery_challans WHERE company_id = ? AND serial_no < ? ORDER BY serial_no DESC LIMIT 1");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM delivery_challans WHERE company_id = ? AND serial_no = ?");
        }
        $stmt->execute([$company_id, $sn]);
        $challan = $stmt->fetch();

        if ($challan) {
            $itemStmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.unit, inv.qty_per_piece, inv.hs_code 
                                      FROM delivery_challan_items i 
                                      JOIN inv_items inv ON i.item_id = inv.id 
                                      WHERE i.challan_id = ? ORDER BY i.sort_order");
            $itemStmt->execute([$challan['id']]);
            $challan['items'] = $itemStmt->fetchAll();
            
            // Fetch conversion statuses
            $ogpStmt = $pdo->prepare("SELECT serial_no FROM outward_gate_passes WHERE company_id = ? AND delivery_challan_no = ? AND is_cancelled = 0 ORDER BY id DESC LIMIT 1");
            $ogpStmt->execute([$company_id, $challan['serial_no']]);
            $ogp = $ogpStmt->fetch();
            $challan['converted_ogp_no'] = $ogp ? $ogp['serial_no'] : null;

            $invTaxStmt = $pdo->prepare("SELECT serial_no FROM sale_invoices WHERE company_id = ? AND delivery_challan_no = ? AND is_tax_invoice = 1 AND is_cancelled = 0 ORDER BY id DESC LIMIT 1");
            $invTaxStmt->execute([$company_id, $challan['serial_no']]);
            $invTax = $invTaxStmt->fetch();
            $challan['converted_invtax_no'] = $invTax ? $invTax['serial_no'] : null;

            $invNonTaxStmt = $pdo->prepare("SELECT serial_no FROM sale_invoices WHERE company_id = ? AND delivery_challan_no = ? AND is_tax_invoice = 0 AND is_cancelled = 0 ORDER BY id DESC LIMIT 1");
            $invNonTaxStmt->execute([$company_id, $challan['serial_no']]);
            $invNonTax = $invNonTaxStmt->fetch();
            $challan['converted_invnontax_no'] = $invNonTax ? $invNonTax['serial_no'] : null;

            sendResponse($challan);
        } else {
            sendResponse(['error' => 'Not found'], 404);
        }
        break;

    case 'delete':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('delivery_challans', 'delivery_challan_items', 'challan_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM delivery_challans WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Delivery Challans', 'DELETE', $id, 'Challan Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
        break;

    default:
        sendResponse(['error' => 'Invalid action'], 400);
}


