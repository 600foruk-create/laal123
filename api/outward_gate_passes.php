<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Tables
$pdo->exec("CREATE TABLE IF NOT EXISTS outward_gate_passes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    serial_no INT NOT NULL,
    date DATE NOT NULL,
    customer_coa_id INT,
    purchase_order_no VARCHAR(100),
    purchase_order_date DATE,
    delivery_challan_no VARCHAR(100),
    delivery_challan_date DATE,
    job_id INT,
    inventory_location_id INT,
    vehicle_description TEXT,
    driver_name VARCHAR(100),
    time_of_supply TIME,
    remarks TEXT,
    total_pieces DECIMAL(15,2) DEFAULT 0,
    total_qty DECIMAL(15,4) DEFAULT 0,
    is_cancelled TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (company_id, serial_no)
) ENGINE=InnoDB");

$pdo->exec("CREATE TABLE IF NOT EXISTS outward_gate_pass_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ogp_id INT NOT NULL,
    item_id INT NOT NULL,
    description TEXT,
    pieces DECIMAL(15,2) DEFAULT 0,
    qty DECIMAL(15,4) DEFAULT 0,
    packing_detail TEXT,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (ogp_id) REFERENCES outward_gate_passes(id) ON DELETE CASCADE
) ENGINE=InnoDB");

try { $pdo->exec("ALTER TABLE outward_gate_passes ADD COLUMN converted_to_si_tax INT DEFAULT 0"); } catch (PDOException $e) {}
try { $pdo->exec("ALTER TABLE outward_gate_passes ADD COLUMN converted_to_si_nontax INT DEFAULT 0"); } catch (PDOException $e) {}

switch ($action) {
    case 'search_ogps':
        try {
            $sql = "SELECT ogp.*, c.name as customer_name 
                    FROM outward_gate_passes ogp 
                    LEFT JOIN coa_list c ON ogp.customer_coa_id = c.id 
                    WHERE ogp.company_id = ?
                    ORDER BY ogp.serial_no DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$company_id]);
            $data = $stmt->fetchAll();
            
            foreach ($data as &$row) {
                $row['date'] = $row['date'] ? date('d-M-Y', strtotime($row['date'])) : '';
                $row['purchase_order_date'] = $row['purchase_order_date'] ? date('d-M-Y', strtotime($row['purchase_order_date'])) : '';
                $row['delivery_challan_date'] = $row['delivery_challan_date'] ? date('d-M-Y', strtotime($row['delivery_challan_date'])) : '';
                $row['is_cancelled'] = (int)$row['is_cancelled'] === 1 ? 'Yes' : 'No';
            }
            sendResponse($data);
        } catch (Exception $e) {
            file_put_contents('ogp_error.log', $e->getMessage());
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'get_next_serial_no':
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM outward_gate_passes WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
        break;

    case 'save':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) sendResponse(['error' => 'Invalid data'], 400);

        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('outward_gate_passes', 'outward_gate_pass_items', 'ogp_id', $id) : null;
            $pdo->beginTransaction();
            // Check for duplicate serial_no
            $check = $pdo->prepare("SELECT id FROM outward_gate_passes WHERE serial_no = ? AND company_id = ? AND (? IS NULL OR id != ?)");
            $check->execute([$data['serial_no'], $company_id, $id, $id]);
            if ($check->fetchColumn()) {
                sendResponse(['error' => "An Outward Gate Pass with Serial No " . $data['serial_no'] . " already exists!"], 400);
            }

            if ($id) {
                // Update
                $sql = "UPDATE outward_gate_passes SET 
                        serial_no = ?, date = ?, customer_coa_id = ?, purchase_order_no = ?, 
                        purchase_order_date = ?, delivery_challan_no = ?, delivery_challan_date = ?,
                        job_id = ?, inventory_location_id = ?, 
                        vehicle_description = ?, driver_name = ?, time_of_supply = ?, 
                        remarks = ?, total_pieces = ?, total_qty = ?, is_cancelled = ?, converted_to_si_tax = ?, converted_to_si_nontax = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['serial_no'], $data['date'], $data['customer_coa_id'], $data['purchase_order_no'],
                    $data['purchase_order_date'] ?: null, $data['delivery_challan_no'], $data['delivery_challan_date'] ?: null,
                    $data['job_id'] ?: null, $data['inventory_location_id'] ?: null,
                    $data['vehicle_description'], $data['driver_name'], $data['time_of_supply'] ?: null,
                    $data['remarks'], $data['total_pieces'], $data['total_qty'], 
                    $data['is_cancelled'] ? 1 : 0, $data['converted_to_si_tax'] ?? 0, $data['converted_to_si_nontax'] ?? 0, $id, $company_id
                ]);
            } else {
                // Insert
                $sql = "INSERT INTO outward_gate_passes (
                        company_id, serial_no, date, customer_coa_id, purchase_order_no, 
                        purchase_order_date, delivery_challan_no, delivery_challan_date, job_id, inventory_location_id, 
                        vehicle_description, driver_name, time_of_supply, 
                        remarks, total_pieces, total_qty, is_cancelled, converted_to_si_tax, converted_to_si_nontax
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $data['serial_no'], $data['date'], $data['customer_coa_id'], 
                    $data['purchase_order_no'], $data['purchase_order_date'] ?: null, $data['delivery_challan_no'], $data['delivery_challan_date'] ?: null,
                    $data['job_id'] ?: null, $data['inventory_location_id'] ?: null, $data['vehicle_description'], $data['driver_name'], 
                    $data['time_of_supply'] ?: null, $data['remarks'], $data['total_pieces'], 
                    $data['total_qty'], $data['is_cancelled'] ? 1 : 0, $data['converted_to_si_tax'] ?? 0, $data['converted_to_si_nontax'] ?? 0
                ]);
                $id = $pdo->lastInsertId();
            }

            // Save Items
            $pdo->prepare("DELETE FROM outward_gate_pass_items WHERE ogp_id = ?")->execute([$id]);
            $itemSql = "INSERT INTO outward_gate_pass_items (ogp_id, item_id, description, pieces, qty, packing_detail, sort_order) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $index => $item) {
                if (empty($item['item_id'])) continue;
                $itemStmt->execute([
                    $id, $item['item_id'], $item['description'], $item['pieces'], $item['qty'], $item['packing_detail'], $index
                ]);
            }

            $pdo->commit();
            $after_data = fetchRecordData('outward_gate_passes', 'outward_gate_pass_items', 'ogp_id', $id);
            logActivity('Outward Gate Passes', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'OGP Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
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
                $stmt = $pdo->prepare("SELECT * FROM outward_gate_passes WHERE company_id = ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id]);
            } else if ($dir === 'next') {
                $stmt = $pdo->prepare("SELECT * FROM outward_gate_passes WHERE company_id = ? AND serial_no > ? ORDER BY serial_no ASC LIMIT 1");
                $stmt->execute([$company_id, $sn]);
            } else if ($dir === 'prev') {
                $stmt = $pdo->prepare("SELECT * FROM outward_gate_passes WHERE company_id = ? AND serial_no < ? ORDER BY serial_no DESC LIMIT 1");
                $stmt->execute([$company_id, $sn]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM outward_gate_passes WHERE company_id = ? AND serial_no = ?");
                $stmt->execute([$company_id, $sn]);
            }
            $ogp = $stmt->fetch();

            if ($ogp) {
                $itemStmt = $pdo->prepare("SELECT i.*, inv.name as item_name, inv.code as item_code, inv.unit, inv.qty_per_piece 
                                          FROM outward_gate_pass_items i 
                                          JOIN inv_items inv ON i.item_id = inv.id 
                                          WHERE i.ogp_id = ? ORDER BY i.sort_order");
                $itemStmt->execute([$ogp['id']]);
                $ogp['items'] = $itemStmt->fetchAll();
                
                // Also fetch customer details for the frontend
                $stmt = $pdo->prepare("SELECT * FROM coa_list WHERE id=?");
                $stmt->execute([$ogp['customer_coa_id']]);
                $coa = $stmt->fetch();
                if ($coa) {
                    $ogp['customer_code'] = $coa['account_code'];
                    $ogp['customer_name'] = $coa['account_name'];
                    
                    // Let's get address and phone from customers/vendors tables
                    // Try customers first
                    $stmt = $pdo->prepare("SELECT address, telephone FROM customers WHERE coa_list_id=?");
                    $stmt->execute([$ogp['customer_coa_id']]);
                    $c = $stmt->fetch();
                    if ($c) {
                        $ogp['customer_address'] = $c['address'];
                        $ogp['customer_phone'] = $c['telephone'];
                    } else {
                        // Fallback try vendors
                        $stmt = $pdo->prepare("SELECT address, telephone FROM vendors WHERE coa_list_id=?");
                        $stmt->execute([$ogp['customer_coa_id']]);
                        $v = $stmt->fetch();
                        if ($v) {
                            $ogp['customer_address'] = $v['address'];
                            $ogp['customer_phone'] = $v['telephone'];
                        }
                    }
                }
                sendResponse($ogp);
            } else {
                sendResponse(['error' => 'Not found'], 404);
            }
        } catch (Exception $e) {
            sendResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'delete':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('outward_gate_passes', 'outward_gate_pass_items', 'ogp_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM outward_gate_passes WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Outward Gate Passes', 'DELETE', $id, 'OGP Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
        break;

    default:
        sendResponse(['error' => 'Invalid action'], 400);
}





