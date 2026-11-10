<?php
header('Content-Type: application/json');
require_once 'db_config.php';

session_write_close(); // Prevent session locking hangs for long-running fetch requests

// MIGRATION: Ensure Inventory tables exist
try {
    // 1. Main Categories
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_main_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        UNIQUE KEY `inv_main_code_company` (`code`, `company_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Sub Categories
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_sub_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        main_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        FOREIGN KEY (main_id) REFERENCES inv_main_categories(id) ON DELETE CASCADE,
        UNIQUE KEY `inv_sub_code_company` (`code`, `company_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3. Brands
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3.5. HS Codes
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_hs_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        code VARCHAR(100) NOT NULL,
        description TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3.5. Item Signs
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_item_signs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3.6. Item Sizes
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_item_sizes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3.7. Item Lengths
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_item_lengths (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3.8. Item Classes
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_item_classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3.9. Item Fitting Types
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_item_fitting_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 4. Inventory Items
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        sub_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        hs_code VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        brand_id INT,
        rack_no VARCHAR(100),
        purchase_price DECIMAL(20,2) DEFAULT 0,
        selling_price DECIMAL(20,2) DEFAULT 0,
        unit VARCHAR(50),
        qty_per_piece DECIMAL(20,2) DEFAULT 0,
        tax_rate DECIMAL(10,2) DEFAULT 0,
        tax_type VARCHAR(20) DEFAULT 'Percent',
        valuation_method VARCHAR(50) DEFAULT 'Weighted Average',
        valuation_cost DECIMAL(20,2) DEFAULT 0,
        order_qty DECIMAL(20,2) DEFAULT 0,
        is_inactive TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sub_id) REFERENCES inv_sub_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (brand_id) REFERENCES inv_brands(id) ON DELETE SET NULL,
        UNIQUE KEY `inv_item_code_company` (`code`, `company_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 5. Inventory Locations
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_default TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Migration for existing tables: add description if not exists
    try {
        $pdo->exec("ALTER TABLE inv_items ADD COLUMN is_inactive TINYINT(1) DEFAULT 0 AFTER order_qty");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_items MODIFY COLUMN unit_weight VARCHAR(50)");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_items ADD COLUMN length_unit VARCHAR(20) DEFAULT 'Feet'");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_items ADD COLUMN billing_mode VARCHAR(50) DEFAULT 'By Weight'");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_items ADD COLUMN pipe_sub_type VARCHAR(50) DEFAULT 'uPVC'");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_items ADD COLUMN pipe_length VARCHAR(50) DEFAULT NULL");
    } catch(Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_locations ADD COLUMN description TEXT AFTER name");
    } catch(Exception $e) {}

    // Seed default location if empty for company
    $checkLoc = $pdo->prepare("SELECT id FROM inv_locations LIMIT 1");
    $checkLoc->execute();
    if (!$checkLoc->fetch()) {
        $pdo->exec("INSERT INTO inv_locations (company_id, name, is_default) VALUES (1, 'Main Store', 1)");
    }

    // 6. Inventory Opening Balances
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_opening_balances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        item_id INT NOT NULL,
        fy_id INT NOT NULL,
        location_id INT NOT NULL,
        pieces DECIMAL(20,2) DEFAULT 0,
        quantity DECIMAL(20,2) DEFAULT 0,
        rate DECIMAL(20,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES inv_items(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES inv_locations(id) ON DELETE CASCADE,
        UNIQUE KEY `inv_ob_unique` (company_id, item_id, fy_id, location_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    // Add hs_code to existing tables if missing
    try {
        $pdo->exec("ALTER TABLE inv_items ADD COLUMN hs_code VARCHAR(100) AFTER code");
    } catch (Exception $e) {}

    // Seed default data if empty to ensure form shows something
    $checkItems = $pdo->prepare("SELECT id FROM inv_items LIMIT 1");
    $checkItems->execute();
    if (!$checkItems->fetch()) {
        // Create a sample category
        $pdo->exec("INSERT IGNORE INTO inv_main_categories (company_id, code, name) VALUES ($company_id, '01', 'Sample Category')");
        $mainId = $pdo->lastInsertId() ?: 1;
        
        // Create a sample sub-category
        $pdo->exec("INSERT IGNORE INTO inv_sub_categories (company_id, main_id, code, name) VALUES ($company_id, $mainId, '0101', 'Sample Sub-Category')");
        $subId = $pdo->lastInsertId() ?: 1;
        
        // Create a sample brand
        $pdo->exec("INSERT IGNORE INTO inv_brands (company_id, name) VALUES ($company_id, 'Sample Brand')");
        $brandId = $pdo->lastInsertId() ?: 1;
        
        // Create sample items
        $pdo->exec("INSERT IGNORE INTO inv_items (company_id, sub_id, code, name, brand_id, purchase_price, selling_price, unit) 
                    VALUES ($company_id, $subId, 'ITM-001', 'Sample Item 1', $brandId, 100, 150, 'Pcs')");
        $pdo->exec("INSERT IGNORE INTO inv_items (company_id, sub_id, code, name, brand_id, purchase_price, selling_price, unit) 
                    VALUES ($company_id, $subId, 'ITM-002', 'Sample Item 2', $brandId, 200, 300, 'Pcs')");
    }

} catch (Exception $e) {
    // Silently continue if tables exist or other minor issues, 
    // real errors will be caught in the action block or PDO setup.
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);

try {
    switch ($action) {
        case 'get_inventory_tree':
            // Fetch all categories and subcategories
            $mains = $pdo->prepare("SELECT * FROM inv_main_categories WHERE company_id = ? ORDER BY code");
            $mains->execute([$company_id]);
            $main_list = $mains->fetchAll(PDO::FETCH_ASSOC);

            $subs = $pdo->prepare("SELECT * FROM inv_sub_categories WHERE company_id = ? ORDER BY code");
            $subs->execute([$company_id]);
            $sub_list = $subs->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['mains' => $main_list, 'subs' => $sub_list]);
            break;

        case 'get_all_items':
            $active_only = isset($_GET['active_only']) && $_GET['active_only'] == 1;
            $for_pos = (isset($_GET['for_pos']) && $_GET['for_pos'] == '1');
            
            // Only fetch items that exist in Chart of Inventory (linked to active Sub and Main Categories)
            $sql = "
                SELECT i.*, b.name as brand_name, m.category_type, i.code as coa_list_id 
                FROM inv_items i 
                INNER JOIN inv_sub_categories s ON i.sub_id = s.id AND s.company_id = i.company_id
                INNER JOIN inv_main_categories m ON s.main_id = m.id AND m.company_id = i.company_id
                LEFT JOIN inv_brands b ON i.brand_id = b.id 
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ";
            $params = [$company_id];

            if ($for_pos) {
                try {
                    $setStmt = $pdo->prepare("SELECT setting_value FROM pos_settings WHERE company_id = ? AND setting_key = 'pos_item_filter_enabled'");
                    $setStmt->execute([$company_id]);
                    $filterEnabled = ($setStmt->fetchColumn() === '1');

                    if ($filterEnabled) {
                        $sql .= " AND i.id IN (SELECT item_id FROM pos_assigned_items WHERE company_id = ?)";
                        $params[] = $company_id;
                    }
                } catch (Exception $e) {
                    // Fallback gracefully
                }
            }

            $sql .= " ORDER BY i.code";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Fallback: If no categorized items found, fetch directly by company_id
            if (empty($items)) {
                $fallbackStmt = $pdo->prepare("
                    SELECT i.*, b.name as brand_name, '' as category_type, i.code as coa_list_id 
                    FROM inv_items i 
                    LEFT JOIN inv_brands b ON i.brand_id = b.id 
                    WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
                    ORDER BY i.code
                ");
                $fallbackStmt->execute([$company_id]);
                $items = $fallbackStmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // Map 'id' to 'coa_list_id' for compatibility with selectGridItem if needed
            foreach($items as &$item) {
                $item['coa_list_id'] = $item['id'];
            }
            echo json_encode($items);
            break;

        case 'get_items':
            $sub_id = $_GET['sub_id'] ?? 0;
            $active_only = isset($_GET['active_only']) && $_GET['active_only'] == 1;
            
            $query = "SELECT i.*, b.name as brand_name 
                      FROM inv_items i 
                      LEFT JOIN inv_brands b ON i.brand_id = b.id
                      WHERE i.sub_id = :sub_id AND i.company_id = :company_id";
            
            if ($active_only) {
                $query .= " AND (i.is_inactive = 0 OR i.is_inactive IS NULL) ";
            }
            
            $query .= " ORDER BY i.code";
            
            $stmt = $pdo->prepare($query);
            $stmt->execute(['sub_id' => $sub_id, 'company_id' => $company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_main':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $category_type = $data['category_type'] ?? null;
            $before_data = $id ? fetchRecordData('inv_main_categories', null, null, $id) : null;
            if ($id) {
                $stmt = $pdo->prepare("UPDATE inv_main_categories SET name = ?, code = ?, category_type = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $data['code'], $category_type, $id, $company_id]);
                $after_data = fetchRecordData('inv_main_categories', null, null, $id);
                logActivity('Inventory Main Categories', 'UPDATE', $id, $data['name'] ?? '', $before_data, $after_data);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_main_categories (company_id, code, name, category_type) VALUES (?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['code'], $data['name'], $category_type]);
                $newId = $pdo->lastInsertId();
                $after_data = fetchRecordData('inv_main_categories', null, null, $newId);
                logActivity('Inventory Main Categories', 'INSERT', $newId, $data['name'] ?? '', null, $after_data);
                echo json_encode(['status' => 'success', 'id' => $newId]);
            }
            break;

        case 'save_sub':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('inv_sub_categories', null, null, $id) : null;
            if ($id) {
                $stmt = $pdo->prepare("UPDATE inv_sub_categories SET name = ?, code = ?, main_id = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $data['code'], $data['main_id'], $id, $company_id]);
                $after_data = fetchRecordData('inv_sub_categories', null, null, $id);
                
                // Auto-update child item names using the exact generation format
                $itemsStmt = $pdo->prepare("
                    SELECT i.*, b.name as brand_name, m.category_type as main_category_type
                    FROM inv_items i 
                    LEFT JOIN inv_brands b ON i.brand_id = b.id 
                    LEFT JOIN inv_sub_categories s ON i.sub_id = s.id
                    LEFT JOIN inv_main_categories m ON s.main_id = m.id
                    WHERE i.sub_id = ? AND i.company_id = ?
                ");
                $itemsStmt->execute([$id, $company_id]);
                $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($items as $item) {
                    $newName = '';
                    $catType = !empty($item['category_type']) ? $item['category_type'] : ($item['main_category_type'] ?? '');
                    $subCatName = $data['name'];
                    $brandText = (!empty($item['brand_name']) && $item['brand_name'] !== 'None') ? $item['brand_name'] : '';

                    if ($catType === 'Pipes') {
                        $size = trim($item['size'] ?? '');
                        $length = trim($item['length'] ?? '');
                        $sign = trim($item['unit_weight'] ?? '');
                        $cls = trim($item['class'] ?? '');
                        $uw = trim($item['qty_per_piece'] ?? '');

                        $pipeName = '';
                        if ($size) $pipeName .= $size . ' ';
                        if ($sign && $size && $length) $pipeName .= $sign . ' ';
                        if ($length) $pipeName .= $length . ' ';
                        if ($subCatName) $pipeName .= trim($subCatName) . ' ';

                        if ($cls) {
                            $pipeName .= $cls . ' ';
                        } else if ($uw && is_numeric($uw)) {
                            $pipeName .= number_format((float)$uw, 2, '.', '') . ' KG';
                        }
                        $newName = trim($pipeName);
                    } else if ($catType === 'Fitting') {
                        $fSize = trim($item['size'] ?? '');
                        $fType = trim($item['fitting_type'] ?? '');
                        $fCls = trim($item['class'] ?? '');
                        $fSign = trim($item['carton'] ?? ''); // Carton maps to sign in fittings
                        
                        $fitName = '';
                        if ($fSize) $fitName .= $fSize . ' ';
                        if ($subCatName) $fitName .= trim($subCatName) . ' ';
                        if ($fType) $fitName .= $fType . ' ';
                        if ($fSign) $fitName .= $fSign . ' ';
                        if ($fCls) $fitName .= $fCls . ' ';
                        
                        $newName = trim($fitName);
                    } else if ($catType === 'Raw Material') {
                        $mat = trim($item['material'] ?? '');
                        $grade = trim($item['grade_specification'] ?? '');
                        
                        $rawName = '';
                        if ($subCatName) $rawName .= trim($subCatName) . ' ';
                        if ($brandText) $rawName .= $brandText . ' ';
                        if ($mat) $rawName .= $mat . ' ';
                        if ($grade) $rawName .= $grade;
                        $newName = trim($rawName);
                    }

                    if ($newName && $newName !== $item['name']) {
                        $upd = $pdo->prepare("UPDATE inv_items SET name = ? WHERE id = ?");
                        $upd->execute([$newName, $item['id']]);
                    }
                }
                
                logActivity('Inventory Sub Categories', 'UPDATE', $id, $data['name'] ?? '', $before_data, $after_data);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_sub_categories (company_id, main_id, code, name) VALUES (?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['main_id'], $data['code'], $data['name']]);
                $newId = $pdo->lastInsertId();
                $after_data = fetchRecordData('inv_sub_categories', null, null, $newId);
                logActivity('Inventory Sub Categories', 'INSERT', $newId, $data['name'] ?? '', null, $after_data);
                echo json_encode(['status' => 'success', 'id' => $newId]);
            }
            break;

        case 'save_item':
            $data = json_decode(file_get_contents('php://input'), true);
            $fields = [
                'company_id', 'sub_id', 'code', 'hs_code', 'name', 'description', 'brand_id', 'rack_no',
                'purchase_price', 'selling_price', 'unit', 'qty_per_piece', 'tax_rate',
                'tax_type', 'valuation_method', 'valuation_cost', 'order_qty', 'is_inactive',
                'category_type', 'size', 'length', 'unit_weight', 'class', 'fitting_type', 'carton', 'material', 'grade_specification', 'length_unit', 'billing_mode', 'pipe_sub_type', 'pipe_length'
            ];
            
            // Clean data for brand_id nulls
            if (empty($data['brand_id'])) $data['brand_id'] = null;
            if (empty($data['unit_weight'])) $data['unit_weight'] = null;
            if (empty($data['carton'])) $data['carton'] = null;
            
            $id = $data['id'] ?? null;

            // Duplicate Check logic based on code instead of attributes
            if (!empty($data['code'])) {
                $dupQuery = "SELECT id FROM inv_items WHERE company_id = :company_id AND code = :code";
                $dupParams = [
                    'company_id' => $company_id,
                    'code' => $data['code']
                ];
                
                if ($id) {
                    $dupQuery .= " AND id != :id";
                    $dupParams['id'] = $id;
                }
                
                $dupStmt = $pdo->prepare($dupQuery);
                $dupStmt->execute($dupParams);
                if ($dupStmt->fetch()) {
                    echo json_encode(['status' => 'error', 'message' => 'This item code already exists.']);
                    break;
                }
            }
            
            $before_data = $id ? fetchRecordData('inv_items', null, null, $id) : null;
            if ($id) {
                $setPart = implode(', ', array_map(fn($f) => "$f = :$f", array_slice($fields, 1)));
                $stmt = $pdo->prepare("UPDATE inv_items SET $setPart WHERE id = :id AND company_id = :company_id");
                $data['company_id'] = $company_id;
                $stmt->execute(array_intersect_key($data, array_flip(array_merge($fields, ['id']))));
                $after_data = fetchRecordData('inv_items', null, null, $id);
                logActivity('Inventory Items', 'UPDATE', $id, $data['name'] ?? '', $before_data, $after_data);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $cols = implode(', ', $fields);
                $params = implode(', ', array_map(fn($f) => ":$f", $fields));
                $stmt = $pdo->prepare("INSERT INTO inv_items ($cols) VALUES ($params)");
                $data['company_id'] = $company_id;
                $stmt->execute(array_intersect_key($data, array_flip($fields)));
                $newId = $pdo->lastInsertId();
                $after_data = fetchRecordData('inv_items', null, null, $newId);
                logActivity('Inventory Items', 'INSERT', $newId, $data['name'] ?? '', null, $after_data);
                echo json_encode(['status' => 'success', 'id' => $newId]);
            }
            break;

        case 'get_cost_settings':
            $filter_type = $_GET['filter_type'] ?? 'all';
            $filter_id = $_GET['filter_id'] ?? 0;
            
            $sql = "SELECT i.id, i.code, i.name, i.valuation_method as cost_method, i.unit 
                    FROM inv_items i 
                    WHERE i.company_id = ?";
            $params = [$company_id];
            
            if ($filter_type === 'category') {
                $sql .= " AND i.sub_id IN (SELECT id FROM inv_sub_categories WHERE main_id = ?)";
                $params[] = $filter_id;
            } else if ($filter_type === 'brand') {
                $sql .= " AND i.brand_id = ?";
                $params[] = $filter_id;
            }
            
            $sql .= " ORDER BY i.code";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode($items);
            break;

        case 'save_bulk_cost_methods':
            $data = json_decode(file_get_contents('php://input'), true);
            $methods = $data['methods'] ?? [];
            
            if (empty($methods)) {
                echo json_encode(['status' => 'error', 'message' => 'No data to save']);
                break;
            }
            
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare("UPDATE inv_items SET valuation_method = ? WHERE id = ? AND company_id = ?");
                foreach ($methods as $m) {
                    $stmt->execute([$m['cost_method'], $m['item_id'], $company_id]);
                }
                $pdo->commit();
                logActivity('Inventory Items Bulk Cost Methods', 'UPDATE', $company_id, 'Bulk Cost Methods Update', null, $methods);
                echo json_encode(['status' => 'success']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'get_reorder_settings':
            $filter_type = $_GET['filter_type'] ?? 'all';
            $filter_id = $_GET['filter_id'] ?? 0;
            
            $sql = "SELECT i.id, i.code, i.name, i.order_qty, i.unit 
                    FROM inv_items i 
                    WHERE i.company_id = ?";
            $params = [$company_id];
            
            if ($filter_type === 'category') {
                $sql .= " AND i.sub_id IN (SELECT id FROM inv_sub_categories WHERE main_id = ?)";
                $params[] = $filter_id;
            } else if ($filter_type === 'brand') {
                $sql .= " AND i.brand_id = ?";
                $params[] = $filter_id;
            }
            
            $sql .= " ORDER BY i.code";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode($items);
            break;

        case 'save_bulk_reorders':
            $data = json_decode(file_get_contents('php://input'), true);
            $reorders = $data['reorders'] ?? [];
            
            if (empty($reorders)) {
                echo json_encode(['status' => 'error', 'message' => 'No data to save']);
                break;
            }
            
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare("UPDATE inv_items SET order_qty = ? WHERE id = ? AND company_id = ?");
                foreach ($reorders as $r) {
                    $stmt->execute([$r['order_qty'], $r['item_id'], $company_id]);
                }
                $pdo->commit();
                logActivity('Inventory Items Bulk Reorder Settings', 'UPDATE', $company_id, 'Bulk Reorders Update', null, $reorders);
                echo json_encode(['status' => 'success']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'get_tax_settings':
            $filter_type = $_GET['filter_type'] ?? 'all';
            $filter_id = $_GET['filter_id'] ?? 0;
            
            $sql = "SELECT i.id, i.code, i.name, i.tax_rate, i.unit 
                    FROM inv_items i 
                    WHERE i.company_id = ?";
            $params = [$company_id];
            
            if ($filter_type === 'category') {
                $sql .= " AND i.sub_id IN (SELECT id FROM inv_sub_categories WHERE main_id = ?)";
                $params[] = $filter_id;
            } else if ($filter_type === 'brand') {
                $sql .= " AND i.brand_id = ?";
                $params[] = $filter_id;
            }
            
            $sql .= " ORDER BY i.code";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode($items);
            break;

        case 'save_bulk_taxes':
            $data = json_decode(file_get_contents('php://input'), true);
            $taxes = $data['taxes'] ?? [];
            
            if (empty($taxes)) {
                echo json_encode(['status' => 'error', 'message' => 'No data to save']);
                break;
            }
            
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare("UPDATE inv_items SET tax_rate = ? WHERE id = ? AND company_id = ?");
                foreach ($taxes as $t) {
                    $stmt->execute([$t['tax_rate'], $t['item_id'], $company_id]);
                }
                $pdo->commit();
                logActivity('Inventory Items Bulk Tax Settings', 'UPDATE', $company_id, 'Bulk Taxes Update', null, $taxes);
                echo json_encode(['status' => 'success']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'delete_main':
            $id = $_GET['id'] ?? 0;
            // Check if has sub-categories
            $check = $pdo->prepare("SELECT COUNT(*) FROM inv_sub_categories WHERE main_id = ?");
            $check->execute([$id]);
            if ($check->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot delete Category because it still has Sub-Categories.']);
                exit;
            }
            $before_data = fetchRecordData('inv_main_categories', null, null, $id);
            $record_title = $before_data['header']['name'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM inv_main_categories WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('Inventory Main Categories', 'DELETE', $id, $record_title, $before_data, null);
            echo json_encode(['status' => 'success']);
            break;

        case 'delete_sub':
            $id = $_GET['id'] ?? 0;
            // Check if has items
            $check = $pdo->prepare("SELECT COUNT(*) FROM inv_items WHERE sub_id = ?");
            $check->execute([$id]);
            if ($check->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot delete Sub-Category because it still has Inventory Items.']);
                exit;
            }
            $before_data = fetchRecordData('inv_sub_categories', null, null, $id);
            $record_title = $before_data['header']['name'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM inv_sub_categories WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('Inventory Sub Categories', 'DELETE', $id, $record_title, $before_data, null);
            echo json_encode(['status' => 'success']);
            break;

        case 'delete_item':
            $id = $_GET['id'] ?? 0;
            
            // Prevent deletion if used in transactions
            $is_used = false;
            $tables_item_coa = ['purchase_invoice_items', 'sale_invoice_items', 'purchase_order_items', 'sale_order_items', 'quotation_items', 'delivery_challan_items', 'purchase_return_items', 'sale_return_items'];
            $tables_item_id = ['material_issue_note_items', 'production_note_items', 'inventory_transfer_items', 'inward_gate_pass_items', 'outward_gate_pass_items'];
            
            foreach ($tables_item_coa as $tbl) {
                try {
                    $stmt = $pdo->prepare("SELECT 1 FROM $tbl WHERE item_coa_id = ? LIMIT 1");
                    $stmt->execute([$id]);
                    if ($stmt->fetchColumn()) { $is_used = true; break; }
                } catch(Exception $e) {}
            }
            if (!$is_used) {
                foreach ($tables_item_id as $tbl) {
                    try {
                        $stmt = $pdo->prepare("SELECT 1 FROM $tbl WHERE item_id = ? LIMIT 1");
                        $stmt->execute([$id]);
                        if ($stmt->fetchColumn()) { $is_used = true; break; }
                    } catch(Exception $e) {}
                }
            }
            
            if ($is_used) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'This item cannot be deleted because it is already used in invoices or other documents.']);
                exit;
            }

            $before_data = fetchRecordData('inv_items', null, null, $id);
            $record_title = $before_data['header']['name'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM inv_items WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('Inventory Items', 'DELETE', $id, $record_title, $before_data, null);
            echo json_encode(['status' => 'success']);
            break;

        case 'get_brands':
            $stmt = $pdo->prepare("SELECT * FROM inv_brands WHERE company_id = ? ORDER BY name");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_brand':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('inv_brands', null, null, $id) : null;
            if ($id && $id > 0) {
                // UPDATE
                $stmt = $pdo->prepare("UPDATE inv_brands SET name = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $id, $company_id]);
                $after_data = fetchRecordData('inv_brands', null, null, $id);
                logActivity('Inventory Brands', 'UPDATE', $id, $data['name'] ?? '', $before_data, $after_data);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                // INSERT
                $stmt = $pdo->prepare("INSERT INTO inv_brands (company_id, name) VALUES (?, ?)");
                $stmt->execute([$company_id, $data['name']]);
                $newId = $pdo->lastInsertId();
                $after_data = fetchRecordData('inv_brands', null, null, $newId);
                logActivity('Inventory Brands', 'INSERT', $newId, $data['name'] ?? '', null, $after_data);
                echo json_encode(['status' => 'success', 'id' => $newId]);
            }
            break;

        case 'delete_brand':
            $id = $_GET['id'] ?? 0;
            // Check if brand is used by any item
            $check = $pdo->prepare("SELECT COUNT(*) FROM inv_items WHERE brand_id = ?");
            $check->execute([$id]);
            if ($check->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot delete Brand because it is linked to Inventory Items.']);
                exit;
            }
            $before_data = fetchRecordData('inv_brands', null, null, $id);
            $record_title = $before_data['header']['name'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM inv_brands WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('Inventory Brands', 'DELETE', $id, $record_title, $before_data, null);
            echo json_encode(['status' => 'success']);
            break;

        case 'get_hs_codes':
            $stmt = $pdo->prepare("SELECT * FROM inv_hs_codes WHERE company_id = ? ORDER BY code");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_hs_code':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('inv_hs_codes', null, null, $id) : null;
            if ($id && $id > 0) {
                // UPDATE
                $stmt = $pdo->prepare("UPDATE inv_hs_codes SET code = ?, description = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['code'], $data['description'], $id, $company_id]);
                $after_data = fetchRecordData('inv_hs_codes', null, null, $id);
                logActivity('HS Codes', 'UPDATE', $id, $data['code'] ?? '', $before_data, $after_data);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                // INSERT
                $stmt = $pdo->prepare("INSERT INTO inv_hs_codes (company_id, code, description) VALUES (?, ?, ?)");
                $stmt->execute([$company_id, $data['code'], $data['description']]);
                $newId = $pdo->lastInsertId();
                $after_data = fetchRecordData('inv_hs_codes', null, null, $newId);
                logActivity('HS Codes', 'INSERT', $newId, $data['code'] ?? '', null, $after_data);
                echo json_encode(['status' => 'success', 'id' => $newId]);
            }
            break;

        case 'delete_hs_code':
            $id = $_GET['id'] ?? 0;
            // Check if hs_code is used by any item
            // Since hs_code in inv_items might be a string matching this code, we could check for code match, 
            // but the user only asked to manage the list for now. Let's do a simple delete without heavy constraints unless it's a foreign key.
            $before_data = fetchRecordData('inv_hs_codes', null, null, $id);
            $record_title = $before_data['header']['code'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM inv_hs_codes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('HS Codes', 'DELETE', $id, $record_title, $before_data, null);
            echo json_encode(['status' => 'success']);
            break;

        // ==========================
        // ==========================
        // ITEM SIGNS
        // ==========================
        case 'get_item_signs':
            $stmt = $pdo->prepare("SELECT * FROM inv_item_signs WHERE company_id = ? ORDER BY name");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'save_item_sign':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            if ($id && $id > 0) {
                $stmt = $pdo->prepare("UPDATE inv_item_signs SET name = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $id, $company_id]);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_item_signs (company_id, name) VALUES (?, ?)");
                $stmt->execute([$company_id, $data['name']]);
                echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
            }
            break;
        case 'delete_item_sign':
            $id = $_GET['id'] ?? 0;
            $stmt = $pdo->prepare("DELETE FROM inv_item_signs WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            echo json_encode(['status' => 'success']);
            break;

        // ==========================
        // ITEM SIZES
        // ==========================
        case 'get_item_sizes':
            $stmt = $pdo->prepare("SELECT * FROM inv_item_sizes WHERE company_id = ? ORDER BY name");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'save_item_size':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            if ($id && $id > 0) {
                $stmt = $pdo->prepare("UPDATE inv_item_sizes SET name = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $id, $company_id]);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_item_sizes (company_id, name) VALUES (?, ?)");
                $stmt->execute([$company_id, $data['name']]);
                echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
            }
            break;
        case 'delete_item_size':
            $id = $_GET['id'] ?? 0;
            $stmt = $pdo->prepare("DELETE FROM inv_item_sizes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            echo json_encode(['status' => 'success']);
            break;

        // ==========================
        // ITEM FITTING TYPES
        // ==========================
        case 'get_item_fitting_types':
            $stmt = $pdo->prepare("SELECT * FROM inv_item_fitting_types WHERE company_id = ? ORDER BY name");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'save_item_fitting_type':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            if ($id && $id > 0) {
                $stmt = $pdo->prepare("UPDATE inv_item_fitting_types SET name = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $id, $company_id]);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_item_fitting_types (company_id, name) VALUES (?, ?)");
                $stmt->execute([$company_id, $data['name']]);
                echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
            }
            break;
        case 'delete_item_fitting_type':
            $id = $_GET['id'] ?? 0;
            $stmt = $pdo->prepare("DELETE FROM inv_item_fitting_types WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            echo json_encode(['status' => 'success']);
            break;

        // ==========================
        // ITEM LENGTHS
        // ==========================
        case 'get_item_lengths':
            $stmt = $pdo->prepare("SELECT * FROM inv_item_lengths WHERE company_id = ? ORDER BY name");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'save_item_length':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            if ($id && $id > 0) {
                $stmt = $pdo->prepare("UPDATE inv_item_lengths SET name = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $id, $company_id]);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_item_lengths (company_id, name) VALUES (?, ?)");
                $stmt->execute([$company_id, $data['name']]);
                echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
            }
            break;
        case 'delete_item_length':
            $id = $_GET['id'] ?? 0;
            $stmt = $pdo->prepare("DELETE FROM inv_item_lengths WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            echo json_encode(['status' => 'success']);
            break;

        // ==========================
        // ITEM CLASSES
        // ==========================
        case 'get_item_classes':
            $stmt = $pdo->prepare("SELECT * FROM inv_item_classes WHERE company_id = ? ORDER BY name");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'save_item_class':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            if ($id && $id > 0) {
                $stmt = $pdo->prepare("UPDATE inv_item_classes SET name = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $id, $company_id]);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO inv_item_classes (company_id, name) VALUES (?, ?)");
                $stmt->execute([$company_id, $data['name']]);
                echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
            }
            break;
        case 'delete_item_class':
            $id = $_GET['id'] ?? 0;
            $stmt = $pdo->prepare("DELETE FROM inv_item_classes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            echo json_encode(['status' => 'success']);
            break;

        case 'get_all_items_lookup':
            $stmt = $pdo->prepare("
                SELECT i.id, i.code, i.name, i.description, i.hs_code, i.unit, i.purchase_price, i.selling_price, i.qty_per_piece,
                       COALESCE(i.category_type, m.category_type, '') as category_type,
                       COALESCE(i.pipe_sub_type, '') as pipe_sub_type,
                       COALESCE(i.pipe_length, 0) as pipe_length,
                       COALESCE(i.length, '') as length,
                       COALESCE(i.length_unit, 'ft') as length_unit,
                       COALESCE(i.billing_mode, '') as billing_mode,
                       COALESCE(i.unit_weight, 0) as unit_weight,
                       COALESCE(i.carton, 0) as carton
                FROM inv_items i 
                INNER JOIN inv_sub_categories s ON i.sub_id = s.id AND s.company_id = i.company_id
                INNER JOIN inv_main_categories m ON s.main_id = m.id AND m.company_id = i.company_id
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL) 
                ORDER BY i.code
            ");
            $stmt->execute([$company_id]);
            $lookupItems = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (empty($lookupItems)) {
                $stmtFallback = $pdo->prepare("SELECT id, code, name, description, hs_code, unit, purchase_price, selling_price, qty_per_piece, COALESCE(category_type, '') as category_type, COALESCE(pipe_sub_type, '') as pipe_sub_type, COALESCE(pipe_length, 0) as pipe_length, COALESCE(length, '') as length, COALESCE(length_unit, 'ft') as length_unit, COALESCE(billing_mode, '') as billing_mode, COALESCE(unit_weight, 0) as unit_weight, COALESCE(carton, 0) as carton FROM inv_items WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL) ORDER BY code");
                $stmtFallback->execute([$company_id]);
                $lookupItems = $stmtFallback->fetchAll(PDO::FETCH_ASSOC);
            }
            echo json_encode($lookupItems);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Invalid action']);
            break;
        case 'get_locations':
            // Robust per-company seeding: if no locations exist for this company, create Main Store
            $check = $pdo->prepare("SELECT COUNT(*) FROM inv_locations WHERE company_id = ?");
            $check->execute([$company_id]);
            if ($check->fetchColumn() == 0) {
                $pdo->prepare("INSERT INTO inv_locations (company_id, name, is_default) VALUES (?, 'Main Store', 1)")
                    ->execute([$company_id]);
            }
            
            $stmt = $pdo->prepare("SELECT * FROM inv_locations WHERE company_id = ? ORDER BY is_default DESC, name ASC");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'get_inv_opening_balances':
            $fy_id = $_GET['fy_id'] ?? 0;
            $location_id = $_GET['location_id'] ?? 0;
            
            // Fetch all items and left join with balances for specific FY/Location
            $stmt = $pdo->prepare("
                SELECT i.id as item_id, i.code, i.hs_code, COALESCE(NULLIF(i.description, ''), i.name) as name, i.unit,
                       i.selling_price, i.purchase_price, i.qty_per_piece,
                       ob.pieces,
                       IF(ob.quantity > 0, ob.quantity, IF(COALESCE(i.qty_per_piece, 0) > 0, ob.pieces * i.qty_per_piece, ob.quantity)) as quantity,
                       COALESCE(NULLIF(ob.rate, 0), i.purchase_price, i.selling_price, 0) as rate
                FROM inv_items i
                INNER JOIN inv_opening_balances ob ON i.id = ob.item_id AND ob.fy_id = :fy AND ob.location_id = :loc
                WHERE i.company_id = :co
                ORDER BY i.code ASC
            ");
            $stmt->execute(['fy' => $fy_id, 'loc' => $location_id, 'co' => $company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_inv_opening_balances':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!isset($data['fy_id']) || !isset($data['location_id']) || !isset($data['balances'])) {
                echo json_encode(['error' => 'Missing data']);
                exit;
            }
            
            $fy_id = $data['fy_id'];
            $location_id = $data['location_id'];
            
            $pdo->beginTransaction();
            try {
                // First delete all existing balances for this FY and Location to ensure synchronization
                $del = $pdo->prepare("DELETE FROM inv_opening_balances WHERE company_id = ? AND fy_id = ? AND location_id = ?");
                $del->execute([$company_id, $fy_id, $location_id]);

                // Fetch item factors (qty_per_piece) for company to ensure auto-calculation
                $f_stmt = $pdo->prepare("SELECT id, qty_per_piece FROM inv_items WHERE company_id = ?");
                $f_stmt->execute([$company_id]);
                $item_factors = $f_stmt->fetchAll(PDO::FETCH_KEY_PAIR);

                $stmt = $pdo->prepare("
                    INSERT INTO inv_opening_balances (company_id, item_id, fy_id, location_id, pieces, quantity, rate)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                
                foreach ($data['balances'] as $row) {
                    $item_id = $row['item_id'] ?? 0;
                    $pieces = floatval($row['pieces'] ?? 0);
                    $quantity = floatval($row['quantity'] ?? 0);
                    $rate = floatval($row['rate'] ?? 0);

                    // Auto-calculate quantity from pieces * qty_per_piece if quantity is 0
                    if ($quantity == 0 && $pieces != 0) {
                        $factor = floatval($item_factors[$item_id] ?? 0);
                        if ($factor > 0) {
                            $quantity = round($pieces * $factor, 4);
                        }
                    }

                    // Only save if at least one value is non-zero
                    if ($pieces != 0 || $quantity != 0 || $rate != 0) {
                        $stmt->execute([
                            $company_id, $item_id, $fy_id, $location_id, 
                            $pieces, $quantity, $rate
                        ]);
                    }
                }
                $pdo->commit();
                logActivity('Inventory Opening Balances', 'UPDATE', $fy_id, 'Location ID: ' . $location_id, null, $data['balances']);
                echo json_encode(['status' => 'success']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'import_inv_opening_balances':
            $data = json_decode(file_get_contents('php://input'), true);
            $current_fy = $data['fy_id'];
            $from_fy = $data['from_fy_id'];
            $location_id = $data['location_id'];

            $stmt = $pdo->prepare("
                INSERT INTO inv_opening_balances (company_id, item_id, fy_id, location_id, pieces, quantity, rate)
                SELECT company_id, item_id, ?, location_id, pieces, quantity, rate
                FROM inv_opening_balances
                WHERE fy_id = ? AND company_id = ? AND location_id = ?
                ON DUPLICATE KEY UPDATE pieces = VALUES(pieces), quantity = VALUES(quantity), rate = VALUES(rate)
            ");
            $stmt->execute([$current_fy, $from_fy, $company_id, $location_id]);
            logActivity('Inventory Opening Balances', 'INSERT', $current_fy, 'Imported to FY ID: ' . $current_fy . ' from FY ID: ' . $from_fy . ' Location ID: ' . $location_id, null, null);
            echo json_encode(['status' => 'success']);
            break;

        case 'save_location':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('inv_locations', null, null, $id) : null;
            if ($id && $id > 0) {
                // UPDATE
                $stmt = $pdo->prepare("UPDATE inv_locations SET name = ?, description = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$data['name'], $data['description'] ?? '', $id, $company_id]);
                $after_data = fetchRecordData('inv_locations', null, null, $id);
                logActivity('Inventory Locations', 'UPDATE', $id, $data['name'] ?? '', $before_data, $after_data);
                echo json_encode(['status' => 'success', 'id' => $id]);
            } else {
                // INSERT
                $stmt = $pdo->prepare("INSERT INTO inv_locations (company_id, name, description) VALUES (?, ?, ?)");
                $stmt->execute([$company_id, $data['name'], $data['description'] ?? '']);
                $newId = $pdo->lastInsertId();
                $after_data = fetchRecordData('inv_locations', null, null, $newId);
                logActivity('Inventory Locations', 'INSERT', $newId, $data['name'] ?? '', null, $after_data);
                echo json_encode(['status' => 'success', 'id' => $newId]);
            }
            break;

        case 'get_price_settings':
            $filter_type = $_GET['filter_type'] ?? 'all';
            $filter_id = $_GET['filter_id'] ?? 0;
            
            // Simplified query to ensure items show up even if categories/brands are not linked
            $query = "SELECT i.id, i.code, i.name, i.unit, i.purchase_price, i.selling_price 
                      FROM inv_items i 
                      WHERE i.company_id = :company_id";
            
            if ($filter_type === 'category' && $filter_id > 0) {
                // If filtering by category, we need the join
                $query = "SELECT i.id, i.code, i.name, i.unit, i.purchase_price, i.selling_price 
                          FROM inv_items i
                          JOIN inv_sub_categories sc ON i.sub_id = sc.id
                          WHERE i.company_id = :company_id AND sc.main_id = :filter_id";
            } elseif ($filter_type === 'brand' && $filter_id > 0) {
                $query .= " AND i.brand_id = :filter_id";
            }
            
            $query .= " ORDER BY i.code";
            
            $stmt = $pdo->prepare($query);
            $params = ['company_id' => $company_id];
            if ($filter_id > 0 && $filter_type !== 'all') {
                $params['filter_id'] = $filter_id;
            }
            
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            error_log("Price Settings: company=" . $company_id . " filter=" . $filter_type . " count=" . count($items));
            
            echo json_encode($items);
            break;

        case 'save_bulk_prices':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!isset($data['prices']) || !is_array($data['prices'])) {
                echo json_encode(['error' => 'Invalid data']);
                exit;
            }
            
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE inv_items SET selling_price = ?, purchase_price = ? WHERE id = ? AND company_id = ?");
                foreach ($data['prices'] as $row) {
                    $stmt->execute([$row['selling_price'], $row['purchase_price'], $row['item_id'], $company_id]);
                }
                $pdo->commit();
                logActivity('Inventory Items Bulk Price Settings', 'UPDATE', $company_id, 'Bulk Prices Update', null, $data['prices']);
                echo json_encode(['status' => 'success']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'delete_location':
            $id = $_GET['id'] ?? 0;
            // Check if is default Main Store (usually ID 1 or is_default=1)
            $checkDef = $pdo->prepare("SELECT is_default FROM inv_locations WHERE id = ?");
            $checkDef->execute([$id]);
            if ($checkDef->fetchColumn() == 1) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot delete the default Inventory Location.']);
                exit;
            }
            // Check if used in opening balances
            $checkUsed = $pdo->prepare("SELECT COUNT(*) FROM inv_opening_balances WHERE location_id = ?");
            $checkUsed->execute([$id]);
            if ($checkUsed->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot delete Location because it has existing Opening Balances recorded.']);
                exit;
            }

            $before_data = fetchRecordData('inv_locations', null, null, $id);
            $record_title = $before_data['header']['name'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM inv_locations WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('Inventory Locations', 'DELETE', $id, $record_title, $before_data, null);
            echo json_encode(['status' => 'success']);
            break;

        case 'import_inventory_excel':
            $dataStr = $_POST['data'] ?? '[]';
            $rows = json_decode($dataStr, true);
            if (!$rows || !is_array($rows)) {
                echo json_encode(['status' => 'error', 'message' => 'Invalid data format.']);
                exit;
            }
            
            $pdo->beginTransaction();
            try {
                $mainStmt = $pdo->prepare("SELECT id FROM inv_main_categories WHERE code = ? AND company_id = ?");
                $insertMain = $pdo->prepare("INSERT INTO inv_main_categories (company_id, code, name) VALUES (?, ?, ?)");
                
                $subStmt = $pdo->prepare("SELECT id FROM inv_sub_categories WHERE code = ? AND main_id = ? AND company_id = ?");
                $insertSub = $pdo->prepare("INSERT INTO inv_sub_categories (company_id, main_id, code, name) VALUES (?, ?, ?, ?)");
                
                $itemStmt = $pdo->prepare("SELECT id FROM inv_items WHERE code = ? AND company_id = ?");
                $insertItem = $pdo->prepare("INSERT INTO inv_items (company_id, sub_id, code, hs_code, name, description, brand_id, rack_no, purchase_price, selling_price, unit, qty_per_piece, tax_rate, tax_type, valuation_method, valuation_cost, order_qty, is_inactive, category_type, size, length, unit_weight, class, fitting_type, carton, material, grade_specification) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $updateItem = $pdo->prepare("UPDATE inv_items SET sub_id=?, hs_code=?, name=?, description=?, brand_id=?, rack_no=?, purchase_price=?, selling_price=?, unit=?, qty_per_piece=?, tax_rate=?, tax_type=?, valuation_method=?, valuation_cost=?, order_qty=?, is_inactive=?, category_type=?, size=?, length=?, unit_weight=?, class=?, fitting_type=?, carton=?, material=?, grade_specification=? WHERE id=? AND company_id=?");

                foreach ($rows as $row) {
                    $mainCode = $row['Main Code'] ?? '';
                    $mainName = $row['Main Name'] ?? '';
                    if (empty($mainCode)) continue;
                    
                    // 1. Process Main
                    $mainStmt->execute([$mainCode, $company_id]);
                    $mainId = $mainStmt->fetchColumn();
                    if (!$mainId) {
                        $insertMain->execute([$company_id, $mainCode, $mainName]);
                        $mainId = $pdo->lastInsertId();
                    }
                    
                    // 2. Process Sub
                    $subCode = $row['Sub Code'] ?? '';
                    $subName = $row['Sub Name'] ?? '';
                    if (empty($subCode)) continue;
                    
                    $subStmt->execute([$subCode, $mainId, $company_id]);
                    $subId = $subStmt->fetchColumn();
                    if (!$subId) {
                        $insertSub->execute([$company_id, $mainId, $subCode, $subName]);
                        $subId = $pdo->lastInsertId();
                    }
                    
                    // 3. Process Item
                    $itemCode = $row['Item Code'] ?? '';
                    if (empty($itemCode)) continue;
                    
                    $hsCode = $row['HS Code'] ?? '';
                    $itemName = $row['Item Name'] ?? '';
                    $description = $row['Description'] ?? '';
                    $brandId = !empty($row['Brand ID']) ? intval($row['Brand ID']) : null;
                    $rackNo = $row['Rack No'] ?? '';
                    $purchasePrice = floatval($row['Purchase Price'] ?? 0);
                    $sellingPrice = floatval($row['Selling Price'] ?? 0);
                    $unit = $row['Measurement Unit'] ?? '';
                    $qtyPerPiece = floatval($row['Qty/Piece'] ?? 1);
                    $taxRate = floatval($row['Sales Tax Rate'] ?? 0);
                    $taxType = $row['Tax Type'] ?? 'Percent';
                    $valMethod = $row['Valuation Method'] ?? 'Weighted Average';
                    $valCost = floatval($row['Valuation Cost'] ?? 0);
                    $orderQty = floatval($row['Order Quantity'] ?? 0);
                    $isInactive = (strtolower($row['Inactive'] ?? '') === 'yes' || strtolower($row['Inactive'] ?? '') === 'true' || intval($row['Inactive'] ?? 0) === 1) ? 1 : 0;
                    
                    $category_type = $row['Category Type'] ?? '';
                    $size = empty($row['Size']) ? null : $row['Size'];
                    $length = empty($row['Length']) ? null : $row['Length'];
                    $unit_weight = empty($row['Unit Weight']) ? null : $row['Unit Weight'];
                    $class = empty($row['Class']) ? null : $row['Class'];
                    $fitting_type = empty($row['Fitting Type']) ? null : $row['Fitting Type'];
                    $carton = empty($row['Carton']) ? null : $row['Carton'];
                    $material = empty($row['Material']) ? null : $row['Material'];
                    $grade_specification = empty($row['Grade/Spec']) ? null : $row['Grade/Spec'];

                    $itemStmt->execute([$itemCode, $company_id]);
                    $itemId = $itemStmt->fetchColumn();

                    if ($itemId) {
                        $updateItem->execute([$subId, $hsCode, $itemName, $description, $brandId, $rackNo, $purchasePrice, $sellingPrice, $unit, $qtyPerPiece, $taxRate, $taxType, $valMethod, $valCost, $orderQty, $isInactive, $category_type, $size, $length, $unit_weight, $class, $fitting_type, $carton, $material, $grade_specification, $itemId, $company_id]);
                    } else {
                        $insertItem->execute([$company_id, $subId, $itemCode, $hsCode, $itemName, $description, $brandId, $rackNo, $purchasePrice, $sellingPrice, $unit, $qtyPerPiece, $taxRate, $taxType, $valMethod, $valCost, $orderQty, $isInactive, $category_type, $size, $length, $unit_weight, $class, $fitting_type, $carton, $material, $grade_specification]);
                    }
                }
                
                $pdo->commit();
                echo json_encode(['status' => 'success', 'message' => 'Data imported and synced successfully.']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;
    }
} catch (PDOException $e) {
    if ($e->getCode() == 23000) {
        http_response_code(200);
        echo json_encode(['status' => 'error', 'message' => 'The Code or Name you entered already exists. Please use a unique value.']);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
