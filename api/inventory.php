<?php
header('Content-Type: application/json');
require_once 'db_config.php';
require_once 'security_pin_helpers.php';

session_write_close(); // Prevent session locking hangs for long-running fetch requests

// MIGRATION: Ensure Inventory tables exist
try {
    // 1. Main Categories
    $pdo->exec("CREATE TABLE IF NOT EXISTS inv_main_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category_type VARCHAR(50) DEFAULT NULL,
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

    try {
        $pdo->exec("ALTER TABLE inv_sub_categories ADD COLUMN image_path MEDIUMTEXT DEFAULT NULL;");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE inv_sub_categories MODIFY COLUMN image_path MEDIUMTEXT DEFAULT NULL;");
    } catch (Exception $e) {}

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

    // Migration for existing tables: ensure all required columns exist in inv_items
    $invColumns = [
        'category_type' => "VARCHAR(50) DEFAULT NULL",
        'size' => "VARCHAR(100) DEFAULT NULL",
        'length' => "VARCHAR(100) DEFAULT NULL",
        'unit_weight' => "VARCHAR(50) DEFAULT NULL",
        'class' => "VARCHAR(100) DEFAULT NULL",
        'fitting_type' => "VARCHAR(100) DEFAULT NULL",
        'carton' => "VARCHAR(50) DEFAULT NULL",
        'material' => "VARCHAR(100) DEFAULT NULL",
        'grade_specification' => "VARCHAR(100) DEFAULT NULL",
        'length_unit' => "VARCHAR(20) DEFAULT 'Feet'",
        'billing_mode' => "VARCHAR(50) DEFAULT 'By Weight'",
        'pipe_sub_type' => "VARCHAR(50) DEFAULT 'uPVC'",
        'pipe_length' => "VARCHAR(50) DEFAULT NULL",
        'is_inactive' => "TINYINT(1) DEFAULT 0",
        'hs_code' => "VARCHAR(100) DEFAULT NULL"
    ];
    foreach ($invColumns as $colName => $colDef) {
        try {
            $pdo->exec("ALTER TABLE inv_items ADD COLUMN $colName $colDef");
        } catch (Exception $e) {}
    }
    try { $pdo->exec("ALTER TABLE inv_items MODIFY COLUMN carton VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE inv_items MODIFY COLUMN unit_weight VARCHAR(100) DEFAULT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE inv_items MODIFY COLUMN code VARCHAR(100) NOT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE inv_main_categories MODIFY COLUMN code VARCHAR(100) NOT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE inv_sub_categories MODIFY COLUMN code VARCHAR(100) NOT NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE inv_locations ADD COLUMN description TEXT AFTER name"); } catch(Exception $e) {}

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

    // Ensure category_type exists in inv_main_categories if missing
    try {
        $pdo->exec("ALTER TABLE inv_main_categories ADD COLUMN category_type VARCHAR(50) DEFAULT NULL AFTER name");
    } catch (Exception $e) {}

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
        case 'check_stock':
            $item_ids = $_GET['item_ids'] ?? ($_POST['item_ids'] ?? '');
            $loc_id = intval($_GET['location_id'] ?? 0);
            $exclude_min_id = intval($_GET['exclude_min_id'] ?? 0);
            $exclude_si_id = intval($_GET['exclude_si_id'] ?? 0);
            if (!$item_ids) {
                echo json_encode(['status' => 'success', 'stock' => []]);
                exit;
            }

            $clean_ids = array_filter(array_map('intval', explode(',', $item_ids)));
            if (empty($clean_ids)) {
                echo json_encode(['status' => 'success', 'stock' => []]);
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
            echo json_encode(['status' => 'success', 'stock' => $stockMap]);
            exit;

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
            $include_all = (isset($_GET['include_all']) && $_GET['include_all'] == 1) || (isset($_GET['all']) && $_GET['all'] == 1);
            $for_pos = (isset($_GET['for_pos']) && $_GET['for_pos'] == '1');

            $inactiveCond = $include_all ? "" : " AND (i.is_inactive = 0 OR i.is_inactive IS NULL)";
            $coCond = $include_all ? "(i.company_id = ? OR i.company_id = 0 OR i.company_id IS NULL)" : "i.company_id = ?";

            // Fetch items with left joins so no items are ever dropped due to category discrepancy
            $sql = "
                SELECT i.*, b.name as brand_name,
                       COALESCE(IF(i.category_type IS NOT NULL AND i.category_type != '', i.category_type, m.category_type), '') as category_type,
                       s.code as sub_code, s.name as sub_name, s.main_id,
                       m.code as main_code, m.name as main_name,
                       i.code as coa_list_id
                FROM inv_items i
                LEFT JOIN inv_sub_categories s ON i.sub_id = s.id
                LEFT JOIN inv_main_categories m ON s.main_id = m.id
                LEFT JOIN inv_brands b ON i.brand_id = b.id
                WHERE $coCond $inactiveCond
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

            // Fallback: If still empty, fetch directly by company_id
            if (empty($items)) {
                $fallbackStmt = $pdo->prepare("
                    SELECT i.*, b.name as brand_name, '' as category_type, i.code as coa_list_id
                    FROM inv_items i
                    LEFT JOIN inv_brands b ON i.brand_id = b.id
                    WHERE $coCond $inactiveCond
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
            $company_id = intval($data['company_id'] ?? $_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);
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

        case 'upload_sub_image':
            $sub_id = intval($_POST['sub_id'] ?? 0);
            if (!$sub_id) {
                echo json_encode(['status' => 'error', 'message' => 'Sub Category ID is required']);
                break;
            }

            $base64Data = '';
            if (!empty($_POST['image_base64'])) {
                $base64Data = $_POST['image_base64'];
            } elseif (!empty($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
                $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
                $mime = 'image/jpeg';
                if ($ext === 'png') $mime = 'image/png';
                elseif ($ext === 'webp') $mime = 'image/webp';
                elseif ($ext === 'gif') $mime = 'image/gif';
                elseif (in_array($ext, ['jpg', 'jpeg'])) $mime = 'image/jpeg';
                else {
                    echo json_encode(['status' => 'error', 'message' => 'Invalid image format. Only JPG, PNG, WEBP, and GIF are allowed.']);
                    break;
                }

                $fileData = file_get_contents($_FILES['image']['tmp_name']);
                if ($fileData !== false) {
                    $base64Data = 'data:' . $mime . ';base64,' . base64_encode($fileData);
                }
            } else {
                echo json_encode(['status' => 'error', 'message' => 'No image file uploaded or upload error occurred']);
                break;
            }

            if (!empty($base64Data)) {
                $updStmt = $pdo->prepare("UPDATE inv_sub_categories SET image_path = ? WHERE id = ? AND company_id = ?");
                $updStmt->execute([$base64Data, $sub_id, $company_id]);
                echo json_encode([
                    'status' => 'success',
                    'message' => 'Fitting photo saved permanently in database!',
                    'image_path' => $base64Data
                ]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Failed to process image file.']);
            }
            break;

        case 'remove_sub_image':
            $sub_id = intval($_POST['sub_id'] ?? 0);
            if (!$sub_id) {
                echo json_encode(['status' => 'error', 'message' => 'Sub Category ID is required']);
                break;
            }
            $updStmt = $pdo->prepare("UPDATE inv_sub_categories SET image_path = NULL WHERE id = ? AND company_id = ?");
            $updStmt->execute([$sub_id, $company_id]);
            echo json_encode(['status' => 'success', 'message' => 'Image removed successfully']);
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
            // Security Check: Only Administrator or Master PIN authorized session can import Excel
            $reqUserId = intval($_POST['current_user_id'] ?? ($_POST['user_id'] ?? ($_SESSION['user_id'] ?? 0)));
            $reqRole = strtoupper($_SESSION['role'] ?? '');
            $reqUsername = $_SESSION['username'] ?? '';

            if ($reqUserId > 0 && (!$reqRole || !$reqUsername)) {
                try {
                    $uStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE id = ?");
                    $uStmt->execute([$reqUserId]);
                    if ($uRow = $uStmt->fetch(PDO::FETCH_ASSOC)) {
                        $reqRole = strtoupper($uRow['role'] ?? '');
                        $reqUsername = $uRow['username'] ?? '';
                    }
                } catch (Exception $e) {}
            }

            $isAdmin = ($reqRole === 'ADMIN' || $reqRole === 'ADMINISTRATOR' || strcasecmp($reqUsername, 'Administrator') === 0 || $reqUserId === 1);
            $pinToken = trim((string)($_POST['pin_token'] ?? ''));
            $isPinAuthorized = false;

            if (!$isAdmin && $pinToken !== '' && function_exists('validateSecurityActionPinToken')) {
                $isPinAuthorized = validateSecurityActionPinToken($pdo, $pinToken, $reqUserId, 'excel_import');
            }

            if (!$isAdmin && !$isPinAuthorized) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Excel import karne ki ijazat sirf Administrator ko hai.']);
                exit;
            }

            $dataStr = $_POST['data'] ?? '[]';
            $raw = is_string($dataStr) ? stripslashes($dataStr) : $dataStr;
            $rows = json_decode($raw, true) ?: json_decode($dataStr, true);
            if (!$rows || !is_array($rows)) {
                echo json_encode(['status' => 'error', 'message' => 'Invalid data format or empty rows.']);
                exit;
            }

            // Universal flexible value extractor for any column header variations
            $getVal = function($row, ...$keys) {
                foreach ($keys as $k) {
                    if (isset($row[$k]) && trim(strval($row[$k])) !== '') {
                        return trim(strval($row[$k]));
                    }
                }
                // Case-insensitive & alphanumeric normalized matching
                $cleanKeys = array_map(function($k) { return strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $k)); }, $keys);
                foreach ($row as $rk => $rv) {
                    $cleanRk = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', (string)$rk));
                    if (in_array($cleanRk, $cleanKeys, true) && trim(strval($rv)) !== '') {
                        return trim(strval($rv));
                    }
                }
                return '';
            };

            $replaceMode = (isset($_POST['replace_mode']) && ($_POST['replace_mode'] === '1' || $_POST['replace_mode'] === 'true'));

            // Server-Side Pre-Import Backup Snapshot if replace mode or requested
            $snapshotInfo = null;
            if ($replaceMode || !empty($_POST['create_snapshot'])) {
                $snapshotInfo = createImportBackupSnapshot($pdo, 'Inventory Items', $replaceMode ? 'replace' : 'merge', $company_id, $reqUserId, $reqUsername);
            }

            $pdo->beginTransaction();
            try {
                $normClean = function($str) {
                    return strtolower(preg_replace('/[^a-zA-Z0-9]/', '', (string)$str));
                };

                // Pre-cache brands for quick lookup & creation
                $brandCache = [];
                $bStmt = $pdo->prepare("SELECT id, name FROM inv_brands WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
                $bStmt->execute([$company_id]);
                while ($bRow = $bStmt->fetch(PDO::FETCH_ASSOC)) {
                    $brandCache[strtolower(trim($bRow['name']))] = intval($bRow['id']);
                }
                $insertBrandStmt = $pdo->prepare("INSERT INTO inv_brands (company_id, name) VALUES (?, ?)");

                // Main Categories cache & statements
                $mainCache = [];
                $mainCacheByName = [];
                $mainCacheByCleanName = [];
                $mainCacheByType = [];
                $mStmt = $pdo->prepare("SELECT id, code, name, category_type FROM inv_main_categories WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
                $mStmt->execute([$company_id]);
                while ($mRow = $mStmt->fetch(PDO::FETCH_ASSOC)) {
                    $cCode = $normClean($mRow['code']);
                    $cName = $normClean($mRow['name']);
                    $cType = strtolower(trim($mRow['category_type'] ?? ''));
                    if ($cCode) $mainCache[$cCode] = $mRow;
                    if ($cName) {
                        $mainCacheByName[strtolower(trim($mRow['name']))] = $mRow;
                        $mainCacheByCleanName[$cName] = $mRow;
                    }
                    if ($cType && !isset($mainCacheByType[$cType])) {
                        $mainCacheByType[$cType] = $mRow;
                    }
                }
                $insertMain = $pdo->prepare("INSERT INTO inv_main_categories (company_id, code, name, category_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), category_type = COALESCE(VALUES(category_type), category_type)");
                $updateMain = $pdo->prepare("UPDATE inv_main_categories SET name = ?, category_type = ? WHERE id = ?");

                // Sub Categories cache & statements
                $subCache = [];
                $subCacheByCode = [];
                $subCacheByName = [];
                $subCacheByCleanName = [];
                $sStmt = $pdo->prepare("SELECT id, main_id, code, name FROM inv_sub_categories WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
                $sStmt->execute([$company_id]);
                while ($sRow = $sStmt->fetch(PDO::FETCH_ASSOC)) {
                    $cCode = $normClean($sRow['code']);
                    $cName = $normClean($sRow['name']);
                    if ($cCode) {
                        $subCache[$sRow['main_id'] . '_' . $cCode] = $sRow;
                        $subCacheByCode[$cCode] = $sRow;
                    }
                    $subCacheByName[$sRow['main_id'] . '_' . strtolower(trim($sRow['name']))] = $sRow;
                    if ($cName) {
                        $subCacheByCleanName[$sRow['main_id'] . '_' . $cName] = $sRow;
                        if (!isset($subCacheByCleanName['any_' . $cName])) {
                            $subCacheByCleanName['any_' . $cName] = $sRow;
                        }
                    }
                }
                $insertSub = $pdo->prepare("INSERT INTO inv_sub_categories (company_id, main_id, code, name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), main_id = VALUES(main_id)");
                $updateSub = $pdo->prepare("UPDATE inv_sub_categories SET name = ? WHERE id = ?");

                // Pre-cache existing items to prevent duplicate inserts
                $itemsCacheByCode = [];
                $itemsCacheByName = [];
                $itemsCacheBySubAndName = [];
                $itemsCacheBySpecs = [];
                $itemPreloadStmt = $pdo->prepare("SELECT id, sub_id, code, name, category_type, size, length, unit_weight, class, carton, fitting_type, material, grade_specification FROM inv_items WHERE company_id = ? OR company_id = 0 OR company_id IS NULL");
                $itemPreloadStmt->execute([$company_id]);
                while ($iRow = $itemPreloadStmt->fetch(PDO::FETCH_ASSOC)) {
                    $cCode = $normClean($iRow['code']);
                    $cName = $normClean($iRow['name']);
                    if ($cCode) $itemsCacheByCode[$cCode] = $iRow;
                    if ($cName) {
                        $itemsCacheByName[$cName] = $iRow;
                        $itemsCacheBySubAndName[$iRow['sub_id'] . '_' . $cName] = $iRow;
                    }
                    $cSize = $normClean($iRow['size']);
                    $cCls = $normClean($iRow['class']);
                    $cSign = $normClean($iRow['unit_weight'] ?: $iRow['carton']);
                    if ($cSize) {
                        $itemsCacheBySpecs[$iRow['sub_id'] . '_' . $cSize . '_' . $cCls . '_' . $cSign] = $iRow;
                    }
                }

                // Items statements
                $itemStmt = $pdo->prepare("SELECT id FROM inv_items WHERE code = ? AND (company_id = ? OR company_id = 0 OR company_id IS NULL) LIMIT 1");
                $itemByNameStmt = $pdo->prepare("SELECT id, code FROM inv_items WHERE sub_id = ? AND LOWER(TRIM(name)) = LOWER(?) AND (company_id = ? OR company_id = 0 OR company_id IS NULL) LIMIT 1");

                $insertItem = $pdo->prepare("INSERT INTO inv_items (
                    company_id, sub_id, code, hs_code, name, description, brand_id, rack_no,
                    purchase_price, selling_price, unit, qty_per_piece, tax_rate, tax_type,
                    valuation_method, valuation_cost, order_qty, is_inactive, category_type,
                    size, length, unit_weight, class, fitting_type, carton, material,
                    grade_specification, length_unit, billing_mode, pipe_sub_type, pipe_length
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

                $updateItem = $pdo->prepare("UPDATE inv_items SET
                    company_id=?, sub_id=?, code=?, hs_code=?, name=?, description=?, brand_id=?, rack_no=?,
                    purchase_price=?, selling_price=?, unit=?, qty_per_piece=?, tax_rate=?,
                    tax_type=?, valuation_method=?, valuation_cost=?, order_qty=?, is_inactive=?,
                    category_type=?, size=?, length=?, unit_weight=?, class=?, fitting_type=?,
                    carton=?, material=?, grade_specification=?, length_unit=?, billing_mode=?,
                    pipe_sub_type=?, pipe_length=?
                    WHERE id=?");

                $itemsCreated = 0;
                $itemsUpdated = 0;
                $mainsCreated = 0;
                $subsCreated = 0;
                $brandsCreated = 0;
                $importedItemIds = [];
                $importedMainIds = [];
                $importedSubIds = [];
                $rowErrors = [];

                foreach ($rows as $rIndex => $row) {
                    $mainCode = $getVal($row, 'Main Code', 'Main Category Code', 'MainCode', 'main_code');
                    $mainName = $getVal($row, 'Main Name', 'Main Category Name', 'MainName', 'main_name');
                    if (empty($mainCode) && empty($mainName)) continue;
                    if (empty($mainCode)) $mainCode = $mainName;
                    if (empty($mainName)) $mainName = $mainCode;

                    $category_type = $getVal($row, 'Category Type', 'Main Category Type', 'Type', 'category_type');

                    // 1. Process Main Category with intelligent matching
                    $cleanMainCode = $normClean($mainCode);
                    $cleanMainName = $normClean($mainName);
                    $cleanCatType = strtolower(trim($category_type));
                    $mainId = null;

                    if ($cleanMainCode && isset($mainCache[$cleanMainCode])) {
                        $mainId = intval($mainCache[$cleanMainCode]['id']);
                    } elseif ($cleanMainName && isset($mainCacheByCleanName[$cleanMainName])) {
                        $mainId = intval($mainCacheByCleanName[$cleanMainName]['id']);
                    } elseif (isset($mainCacheByName[strtolower($mainName)])) {
                        $mainId = intval($mainCacheByName[strtolower($mainName)]['id']);
                    } elseif ($cleanCatType && isset($mainCacheByType[$cleanCatType])) {
                        // Merge into the existing category of same type (e.g. PIPES -> U-PVC PIPES of type Pipes)
                        $mainId = intval($mainCacheByType[$cleanCatType]['id']);
                    } else {
                        // Fuzzy substring match (e.g. PIPES in U-PVC PIPES)
                        foreach ($mainCacheByCleanName as $cnKey => $mRow) {
                            if ($cleanMainName && strlen($cleanMainName) >= 4 && (strpos($cnKey, $cleanMainName) !== false || strpos($cleanMainName, $cnKey) !== false)) {
                                $mainId = intval($mRow['id']);
                                break;
                            }
                        }
                    }

                    if ($mainId) {
                        $curRow = $mainCache[$cleanMainCode] ?? $mainCacheByCleanName[$cleanMainName] ?? null;
                        $curType = $curRow['category_type'] ?? '';
                        if (!empty($category_type) && empty($curType)) {
                            $updateMain->execute([$curRow['name'] ?? $mainName, $category_type, $mainId]);
                        }
                    } else {
                        $insertMain->execute([$company_id, $mainCode, $mainName, $category_type ?: null]);
                        $mainId = intval($pdo->lastInsertId());
                        if (!$mainId) {
                            $chk = $pdo->prepare("SELECT id FROM inv_main_categories WHERE code = ? AND (company_id = ? OR company_id = 0 OR company_id IS NULL) LIMIT 1");
                            $chk->execute([$mainCode, $company_id]);
                            $mainId = intval($chk->fetchColumn());
                        }
                        $newMRow = ['id' => $mainId, 'code' => $mainCode, 'name' => $mainName, 'category_type' => $category_type];
                        if ($cleanMainCode) $mainCache[$cleanMainCode] = $newMRow;
                        if ($cleanMainName) {
                            $mainCacheByCleanName[$cleanMainName] = $newMRow;
                            $mainCacheByName[strtolower($mainName)] = $newMRow;
                        }
                        if ($cleanCatType && !isset($mainCacheByType[$cleanCatType])) {
                            $mainCacheByType[$cleanCatType] = $newMRow;
                        }
                        $mainsCreated++;
                    }
                    $importedMainIds[$mainId] = true;

                    // Inherit category_type from main category if not explicitly in row
                    if (empty($category_type) && !empty($mainCache[$cleanMainCode]['category_type'])) {
                        $category_type = $mainCache[$cleanMainCode]['category_type'];
                    }

                    // 2. Process Sub Category with intelligent matching
                    $subCode = $getVal($row, 'Sub Code', 'Sub Category Code', 'SubCode', 'sub_code');
                    $subName = $getVal($row, 'Sub Name', 'Sub Category Name', 'SubName', 'sub_name');
                    if (empty($subCode) && empty($subName)) continue;
                    if (empty($subCode)) $subCode = $subName;
                    if (empty($subName)) $subName = $subCode;

                    $cleanSubCode = $normClean($subCode);
                    $cleanSubName = $normClean($subName);
                    $subId = null;

                    if ($cleanSubCode && isset($subCache[$mainId . '_' . $cleanSubCode])) {
                        $subId = intval($subCache[$mainId . '_' . $cleanSubCode]['id']);
                    } elseif ($cleanSubName && isset($subCacheByCleanName[$mainId . '_' . $cleanSubName])) {
                        $subId = intval($subCacheByCleanName[$mainId . '_' . $cleanSubName]['id']);
                    } elseif ($cleanSubCode && isset($subCacheByCode[$cleanSubCode])) {
                        $subId = intval($subCacheByCode[$cleanSubCode]['id']);
                    } elseif ($cleanSubName && isset($subCacheByCleanName['any_' . $cleanSubName])) {
                        $subId = intval($subCacheByCleanName['any_' . $cleanSubName]['id']);
                    } else {
                        // Substring or fuzzy check for trailing dashes/punctuation
                        foreach ($subCacheByCleanName as $snKey => $sRow) {
                            if ($cleanSubName && strlen($cleanSubName) >= 4 && (strpos($snKey, $cleanSubName) !== false || strpos($cleanSubName, $snKey) !== false)) {
                                $subId = intval($sRow['id']);
                                break;
                            }
                        }
                    }

                    if ($subId) {
                        // Sub category exists
                    } else {
                        $insertSub->execute([$company_id, $mainId, $subCode, $subName]);
                        $subId = intval($pdo->lastInsertId());
                        if (!$subId) {
                            $chk = $pdo->prepare("SELECT id FROM inv_sub_categories WHERE code = ? AND (company_id = ? OR company_id = 0 OR company_id IS NULL) LIMIT 1");
                            $chk->execute([$subCode, $company_id]);
                            $subId = intval($chk->fetchColumn());
                        }
                        $newSRow = ['id' => $subId, 'main_id' => $mainId, 'code' => $subCode, 'name' => $subName];
                        if ($cleanSubCode) {
                            $subCache[$mainId . '_' . $cleanSubCode] = $newSRow;
                            $subCacheByCode[$cleanSubCode] = $newSRow;
                        }
                        if ($cleanSubName) {
                            $subCacheByCleanName[$mainId . '_' . $cleanSubName] = $newSRow;
                            $subCacheByCleanName['any_' . $cleanSubName] = $newSRow;
                            $subCacheByName[$mainId . '_' . strtolower($subName)] = $newSRow;
                        }
                        $subsCreated++;
                    }
                    $importedSubIds[$subId] = true;

                    // 3. Process Brand (Name or ID)
                    $brandName = $getVal($row, 'Brand Name', 'Brand', 'brand_name');
                    $brandId = null;
                    if (!empty($brandName)) {
                        $brandKey = strtolower($brandName);
                        if (isset($brandCache[$brandKey])) {
                            $brandId = $brandCache[$brandKey];
                        } else {
                            $insertBrandStmt->execute([$company_id, $brandName]);
                            $brandId = intval($pdo->lastInsertId());
                            $brandCache[$brandKey] = $brandId;
                            $brandsCreated++;
                        }
                    } elseif (!empty($row['Brand ID'])) {
                        $brandId = intval($row['Brand ID']);
                    }

                    // 4. Process Item
                    $itemCode = $getVal($row, 'Item Code', 'Code', 'ItemCode', 'item_code');
                    $itemName = $getVal($row, 'Item Name', 'Name', 'ItemName', 'item_name');

                    // If Item Code is empty, check if other item fields exist to auto-generate code
                    if (empty($itemCode)) {
                        $hasDetails = (!empty($itemName) || $getVal($row, 'Purchase Rate', 'Purchase Price', 'Cost Price') !== '' || $getVal($row, 'Sale Rate', 'Sale Price', 'Selling Price') !== '' || $getVal($row, 'Size', 'Pipe Size') !== '');
                        if (!$hasDetails) {
                            // Pure category row without item details
                            continue;
                        }
                    }

                    $hsCode = $getVal($row, 'HS Code', 'HSCode', 'hs_code');
                    $description = $getVal($row, 'Description', 'description');
                    $rackNo = $getVal($row, 'Rack No', 'Rack', 'RackNo', 'rack_no');
                    $purchasePrice = floatval($getVal($row, 'Purchase Rate', 'Purchase Price', 'Cost Price', 'Cost', 'purchase_price') ?: 0);
                    $sellingPrice = floatval($getVal($row, 'Sale Rate', 'Sale Price', 'Selling Price', 'selling_price') ?: 0);
                    $unit = $getVal($row, 'Measurement Unit', 'Unit', 'UOM', 'unit');
                    if (empty($unit)) {
                        $unit = ($category_type === 'Raw Material') ? 'KG' : 'Pcs';
                    }
                    $qtyPerPiece = floatval($getVal($row, 'Qty/Piece', 'Quantity/Piece', 'Pcs/Carton', 'qty_per_piece') ?: 1);
                    if ($qtyPerPiece <= 0) $qtyPerPiece = 1;

                    $taxRate = floatval($getVal($row, 'Sales Tax Rate', 'Tax Rate', 'tax_rate') ?: 0);
                    $taxType = $getVal($row, 'Tax Type', 'tax_type') ?: 'Percent';
                    $valMethod = $getVal($row, 'Valuation Method', 'valuation_method') ?: 'Weighted Average';
                    $valCost = floatval($getVal($row, 'Valuation Cost', 'valuation_cost') ?: 0);
                    $orderQty = floatval($getVal($row, 'Order Quantity', 'Order Qty', 'order_qty') ?: 0);

                    $inactiveRaw = strtolower($getVal($row, 'Inactive', 'Status', 'is_inactive'));
                    $isInactive = ($inactiveRaw === 'yes' || $inactiveRaw === 'true' || $inactiveRaw === 'inactive' || $inactiveRaw === '1') ? 1 : 0;

                    // Technical attributes
                    $size = $getVal($row, 'Pipe Size', 'Fitting Size', 'Size', 'size') ?: null;
                    $length = $getVal($row, 'Pipe Length', 'Length', 'length') ?: null;
                    $pipe_length = $getVal($row, 'Pipe Length', 'Length', 'pipe_length') ?: null;
                    $length_unit = $getVal($row, 'Length Unit', 'length_unit') ?: 'Feet';
                    $pipe_sub_type = $getVal($row, 'Pipe Type', 'Pipe Sub Type', 'pipe_sub_type') ?: 'uPVC';
                    $billing_mode = $getVal($row, 'Billing Mode', 'billing_mode') ?: 'By Weight';
                    $fitting_type = $getVal($row, 'Fitting Type', 'fitting_type') ?: null;
                    $class = $getVal($row, 'Pipe Class', 'Fitting Class', 'Class', 'class') ?: null;

                    $carton = $getVal($row, 'Sign (Carton)', 'Carton Sign', 'Carton', 'carton') ?: null;
                    $unit_weight = $getVal($row, 'Unit Weight (KG)', 'Weight/Piece (KG)', 'Unit Weight', 'unit_weight') ?: null;
                    $sign = $getVal($row, 'Sign', 'sign') ?: null;

                    if ($category_type === 'Pipes') {
                        if (empty($unit_weight) && !empty($sign)) {
                            $unit_weight = $sign;
                        }
                    } elseif ($category_type === 'Fitting') {
                        if (empty($carton) && !empty($sign)) {
                            $carton = $sign;
                        }
                        if (empty($unit_weight) && !empty($getVal($row, 'Weight/Piece (KG)'))) {
                            $unit_weight = $getVal($row, 'Weight/Piece (KG)');
                        }
                    }

                    $material = $getVal($row, 'Material', 'Raw Material', 'material') ?: null;
                    $grade_specification = $getVal($row, 'Grade/Spec', 'Grade Specification', 'Grade', 'grade_specification') ?: null;

                    // Item Name auto-generation if blank
                    if (empty($itemName)) {
                        if ($category_type === 'Pipes') {
                            $parts = array_filter([$size, $pipe_sub_type ? $pipe_sub_type . ' Pipe' : 'Pipe', $class, $brandName]);
                            $itemName = implode(' ', $parts);
                        } elseif ($category_type === 'Fitting') {
                            $parts = array_filter([$size, $fitting_type ?: 'Fitting', $class, $brandName]);
                            $itemName = implode(' ', $parts);
                        } elseif ($category_type === 'Raw Material') {
                            $parts = array_filter([$material, $grade_specification]);
                            $itemName = implode(' ', $parts);
                        }
                        if (empty($itemName)) {
                            $itemName = $itemCode ?: ($subName . ' Item');
                        }
                    }

                    // Multi-tiered smart item matching to guarantee NO duplicate items
                    $itemId = null;
                    $cleanItemCode = $normClean($itemCode);
                    $cleanItemName = $normClean($itemName);
                    $cleanSize = $normClean($size);
                    $cleanCls = $normClean($class);
                    $cleanSign = $normClean($unit_weight ?: $carton);
                    $specKey = $subId . '_' . $cleanSize . '_' . $cleanCls . '_' . $cleanSign;

                    // 1. Match by Item Code
                    if ($cleanItemCode && isset($itemsCacheByCode[$cleanItemCode])) {
                        $matched = $itemsCacheByCode[$cleanItemCode];
                        $itemId = intval($matched['id']);
                        $itemCode = $matched['code']; // preserve canonical code
                    }

                    // 2. Match by Sub Category ID + Clean Item Name
                    if (!$itemId && $cleanItemName && isset($itemsCacheBySubAndName[$subId . '_' . $cleanItemName])) {
                        $matched = $itemsCacheBySubAndName[$subId . '_' . $cleanItemName];
                        $itemId = intval($matched['id']);
                        if (empty($itemCode)) $itemCode = $matched['code'];
                    }

                    // 3. Match by Clean Item Name globally across company
                    if (!$itemId && $cleanItemName && isset($itemsCacheByName[$cleanItemName])) {
                        $matched = $itemsCacheByName[$cleanItemName];
                        $itemId = intval($matched['id']);
                        if (empty($itemCode)) $itemCode = $matched['code'];
                    }

                    // 4. Match by Sub Category + Technical Specs (Size, Class, Sign/Weight)
                    if (!$itemId && $cleanSize && isset($itemsCacheBySpecs[$specKey])) {
                        $matched = $itemsCacheBySpecs[$specKey];
                        $itemId = intval($matched['id']);
                        if (empty($itemCode)) $itemCode = $matched['code'];
                    }

                    // 5. Fallback DB check if cache didn't hit
                    if (!$itemId && !empty($itemCode)) {
                        $itemStmt->execute([$itemCode, $company_id]);
                        $dbItemId = $itemStmt->fetchColumn();
                        if ($dbItemId) $itemId = intval($dbItemId);
                    }
                    if (!$itemId && !empty($itemName)) {
                        $itemByNameStmt->execute([$subId, $itemName, $company_id]);
                        $matched = $itemByNameStmt->fetch(PDO::FETCH_ASSOC);
                        if ($matched) {
                            $itemId = intval($matched['id']);
                            if (empty($itemCode)) $itemCode = $matched['code'];
                        }
                    }

                    // If still empty code, auto-generate sequential code
                    if (empty($itemCode)) {
                        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM inv_items WHERE sub_id = ? AND (company_id = ? OR company_id = 0 OR company_id IS NULL)");
                        $cntStmt->execute([$subId, $company_id]);
                        $seq = intval($cntStmt->fetchColumn()) + 1;
                        $itemCode = $subCode . '-' . str_pad($seq, 3, '0', STR_PAD_LEFT);
                        $chkU = $pdo->prepare("SELECT 1 FROM inv_items WHERE code = ? AND (company_id = ? OR company_id = 0 OR company_id IS NULL)");
                        $chkU->execute([$itemCode, $company_id]);
                        while ($chkU->fetchColumn()) {
                            $seq++;
                            $itemCode = $subCode . '-' . str_pad($seq, 3, '0', STR_PAD_LEFT);
                            $chkU->execute([$itemCode, $company_id]);
                        }
                    }

                    try {
                        if ($itemId) {
                            $updateItem->execute([
                                $company_id, $subId, $itemCode, $hsCode, $itemName, $description, $brandId, $rackNo,
                                $purchasePrice, $sellingPrice, $unit, $qtyPerPiece, $taxRate,
                                $taxType, $valMethod, $valCost, $orderQty, $isInactive,
                                $category_type, $size, $length, $unit_weight, $class, $fitting_type,
                                $carton, $material, $grade_specification, $length_unit, $billing_mode,
                                $pipe_sub_type, $pipe_length,
                                $itemId
                            ]);
                            $itemsUpdated++;
                            $importedItemIds[] = intval($itemId);
                        } else {
                            $insertItem->execute([
                                $company_id, $subId, $itemCode, $hsCode, $itemName, $description,
                                $brandId, $rackNo, $purchasePrice, $sellingPrice, $unit, $qtyPerPiece,
                                $taxRate, $taxType, $valMethod, $valCost, $orderQty, $isInactive,
                                $category_type, $size, $length, $unit_weight, $class, $fitting_type,
                                $carton, $material, $grade_specification, $length_unit, $billing_mode,
                                $pipe_sub_type, $pipe_length
                            ]);
                            $itemId = intval($pdo->lastInsertId());
                            $itemsCreated++;
                            $importedItemIds[] = $itemId;
                        }

                        // Update in-memory caches so subsequent rows will match this item
                        $cachedRow = [
                            'id' => $itemId,
                            'sub_id' => $subId,
                            'code' => $itemCode,
                            'name' => $itemName,
                            'category_type' => $category_type,
                            'size' => $size,
                            'length' => $length,
                            'unit_weight' => $unit_weight,
                            'class' => $class,
                            'carton' => $carton,
                            'fitting_type' => $fitting_type,
                            'material' => $material,
                            'grade_specification' => $grade_specification
                        ];
                        if ($normClean($itemCode)) $itemsCacheByCode[$normClean($itemCode)] = $cachedRow;
                        if ($cleanItemName) {
                            $itemsCacheByName[$cleanItemName] = $cachedRow;
                            $itemsCacheBySubAndName[$subId . '_' . $cleanItemName] = $cachedRow;
                        }
                        if ($cleanSize) $itemsCacheBySpecs[$specKey] = $cachedRow;
                    } catch (Exception $rowEx) {
                        $rowErrors[] = "Row #" . ($rIndex + 1) . " ('$itemCode'): " . $rowEx->getMessage();
                        error_log("SoftifyX Inv Import Row Error: " . $rowEx->getMessage() . " on item $itemCode");
                    }
                }

                $replaceMode = (isset($_POST['replace_mode']) && ($_POST['replace_mode'] === '1' || $_POST['replace_mode'] === 'true'));
                $itemsDeleted = 0;
                $itemsArchived = 0;
                $itemsPreserved = 0;

                if ($replaceMode && !empty($importedItemIds)) {
                    $importedItemIds = array_values(array_unique(array_filter($importedItemIds)));
                    $inClause = implode(',', array_map('intval', $importedItemIds));

                    $stmtOld = $pdo->prepare("SELECT id, sub_id FROM inv_items WHERE (company_id = ? OR company_id = 0 OR company_id IS NULL) AND id NOT IN ($inClause)");
                    $stmtOld->execute([$company_id]);
                    $oldItems = $stmtOld->fetchAll(PDO::FETCH_ASSOC);

                    if (!empty($oldItems)) {
                        $tables_item_coa = [
                            'purchase_invoice_items', 'sale_invoice_items', 'purchase_order_items',
                            'sale_order_items', 'quotation_items', 'delivery_challan_items',
                            'purchase_return_items', 'sale_return_items'
                        ];
                        $tables_item_id = [
                            'material_issue_note_items', 'production_note_items',
                            'inventory_transfer_items', 'inward_gate_pass_items', 'outward_gate_pass_items'
                        ];

                        $delObStmt = $pdo->prepare("DELETE FROM inv_opening_balances WHERE item_id = ?");
                        $delItemStmt = $pdo->prepare("DELETE FROM inv_items WHERE id = ?");

                        foreach ($oldItems as $oldRow) {
                            $oldId = intval($oldRow['id']);
                            $is_used = false;
                            foreach ($tables_item_coa as $tbl) {
                                try {
                                    $chk = $pdo->prepare("SELECT 1 FROM $tbl WHERE item_coa_id = ? LIMIT 1");
                                    $chk->execute([$oldId]);
                                    if ($chk->fetchColumn()) { $is_used = true; break; }
                                } catch(Exception $e) {}
                            }
                            if (!$is_used) {
                                foreach ($tables_item_id as $tbl) {
                                    try {
                                        $chk = $pdo->prepare("SELECT 1 FROM $tbl WHERE item_id = ? LIMIT 1");
                                        $chk->execute([$oldId]);
                                        if ($chk->fetchColumn()) { $is_used = true; break; }
                                    } catch(Exception $e) {}
                                }
                            }

                            if ($is_used) {
                                // USER RULE: Items with invoices MUST NOT be replaced or deleted - they stay in their place fully active!
                                $pdo->prepare("UPDATE inv_items SET is_inactive = 0 WHERE id = ?")->execute([$oldId]);
                                $itemsPreserved++;
                                if (!empty($oldRow['sub_id'])) {
                                    $importedSubIds[intval($oldRow['sub_id'])] = true;
                                    $mId = $pdo->query("SELECT main_id FROM inv_sub_categories WHERE id = " . intval($oldRow['sub_id']))->fetchColumn();
                                    if ($mId) $importedMainIds[intval($mId)] = true;
                                }
                            } else {
                                // Completely remove unused old item
                                $delObStmt->execute([$oldId]);
                                $delItemStmt->execute([$oldId]);
                                $itemsDeleted++;
                            }
                        }
                    }

                    // Clean up ONLY old sub-categories and main categories that were NOT imported and have zero items
                    try {
                        $keepSubClause = !empty($importedSubIds) ? "AND id NOT IN (" . implode(',', array_map('intval', array_keys($importedSubIds))) . ")" : "";
                        $pdo->exec("DELETE FROM inv_sub_categories WHERE (company_id = $company_id OR company_id = 0 OR company_id IS NULL) $keepSubClause AND id NOT IN (SELECT DISTINCT sub_id FROM inv_items WHERE (company_id = $company_id OR company_id = 0 OR company_id IS NULL))");

                        $keepMainClause = !empty($importedMainIds) ? "AND id NOT IN (" . implode(',', array_map('intval', array_keys($importedMainIds))) . ")" : "";
                        $pdo->exec("DELETE FROM inv_main_categories WHERE (company_id = $company_id OR company_id = 0 OR company_id IS NULL) $keepMainClause AND id NOT IN (SELECT DISTINCT main_id FROM inv_sub_categories WHERE (company_id = $company_id OR company_id = 0 OR company_id IS NULL))");
                    } catch(Exception $e) {}
                }

                $pdo->commit();

                $summary = [
                    'total_rows' => count($rows),
                    'items_created' => $itemsCreated,
                    'items_updated' => $itemsUpdated,
                    'items_deleted' => $itemsDeleted,
                    'items_archived' => $itemsArchived,
                    'items_preserved' => $itemsPreserved,
                    'mains_created' => $mainsCreated,
                    'subs_created' => $subsCreated,
                    'brands_created' => $brandsCreated,
                    'replace_mode' => $replaceMode,
                    'snapshot' => $snapshotInfo
                ];

                // Activity Log Audit Trail
                logActivity(
                    'Inventory Items',
                    'IMPORT',
                    $snapshotInfo ? strval($snapshotInfo['snapshot_id']) : '0',
                    "Excel Import (" . ($replaceMode ? 'replace' : 'merge') . "): {$itemsCreated} created, {$itemsUpdated} updated" . ($itemsDeleted ? ", {$itemsDeleted} replaced" : "") . ($snapshotInfo ? " [Snapshot #{$snapshotInfo['snapshot_id']}]" : ""),
                    $snapshotInfo ? ['snapshot_file' => $snapshotInfo['file_path'], 'records_before' => $snapshotInfo['records_count']] : null,
                    $summary,
                    ['company_id' => $company_id, 'user_id' => $reqUserId, 'username' => $reqUsername]
                );

                echo json_encode([
                    'status' => 'success',
                    'message' => 'Data imported and synced successfully.',
                    'summary' => $summary,
                    'row_errors' => $rowErrors
                ]);
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
