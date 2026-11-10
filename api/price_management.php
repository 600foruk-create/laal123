<?php
header('Content-Type: application/json; charset=utf-8');
require_once 'db_config.php';

session_write_close(); // Prevent session locking

// AUTO-MIGRATION: Ensure tables exist
try {
    // 1. Customer-specific Negotiated Item Prices
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_item_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        customer_id INT NOT NULL,
        item_id INT NOT NULL,
        custom_price DECIMAL(20,4) NOT NULL DEFAULT 0,
        notes VARCHAR(255) DEFAULT NULL,
        updated_by VARCHAR(100) DEFAULT 'Admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `unique_cust_item` (company_id, customer_id, item_id),
        INDEX (company_id),
        INDEX (customer_id),
        INDEX (item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Price Revision Master Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS price_revisions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        revision_no VARCHAR(50) NOT NULL,
        revision_date DATE NOT NULL,
        effective_date DATE NOT NULL,
        adjustment_type ENUM('Increase', 'Decrease') NOT NULL DEFAULT 'Increase',
        apply_to VARCHAR(50) NOT NULL DEFAULT 'All Customers',
        category_id INT DEFAULT NULL,
        brand_id INT DEFAULT NULL,
        item_id INT DEFAULT NULL,
        customer_id INT DEFAULT NULL,
        adjustment_method ENUM('Fixed', 'Percentage') NOT NULL DEFAULT 'Fixed',
        adjustment_value DECIMAL(15,4) NOT NULL DEFAULT 0,
        brand_adjustments_json LONGTEXT DEFAULT NULL,
        total_items_affected INT DEFAULT 0,
        total_customers_affected INT DEFAULT 0,
        avg_increase_rs DECIMAL(15,2) DEFAULT 0,
        avg_increase_pct DECIMAL(15,2) DEFAULT 0,
        remarks TEXT DEFAULT NULL,
        status ENUM('Active', 'Future', 'Reversed') NOT NULL DEFAULT 'Active',
        created_by VARCHAR(100) DEFAULT 'Admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reversed_at DATETIME DEFAULT NULL,
        reversed_by VARCHAR(100) DEFAULT NULL,
        UNIQUE KEY `unique_rev_no` (company_id, revision_no),
        INDEX (company_id),
        INDEX (effective_date),
        INDEX (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 3. Price Revision Detail Items (Audit Trail for Rollback)
    $pdo->exec("CREATE TABLE IF NOT EXISTS price_revision_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        revision_id INT NOT NULL,
        item_id INT NOT NULL,
        customer_id INT DEFAULT NULL, -- NULL = General / Factory rate, otherwise customer coa_id
        old_price DECIMAL(20,4) NOT NULL DEFAULT 0,
        adjustment_value DECIMAL(15,4) NOT NULL DEFAULT 0,
        new_price DECIMAL(20,4) NOT NULL DEFAULT 0,
        status ENUM('Applied', 'Reversed') NOT NULL DEFAULT 'Applied',
        INDEX (revision_id),
        INDEX (item_id),
        INDEX (customer_id),
        FOREIGN KEY (revision_id) REFERENCES price_revisions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

} catch (Exception $e) {
    // Migration error fallback
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_POST['company_id'] ?? $_SESSION['company_id'] ?? 1);
$current_user = $_SESSION['username'] ?? 'Admin';

try {
    switch ($action) {

        // ==========================================
        // 1. GET METADATA (Brands, Categories, Customers, Next Rev No)
        // ==========================================
        case 'get_meta': {
            // Next Revision No (PR-00028 format)
            $stmt = $pdo->prepare("SELECT revision_no FROM price_revisions WHERE company_id = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$company_id]);
            $lastRev = $stmt->fetchColumn();
            $nextRevNo = 'PR-00001';
            if ($lastRev && preg_match('/PR-(\d+)/', $lastRev, $m)) {
                $num = intval($m[1]) + 1;
                $nextRevNo = 'PR-' . str_pad($num, 5, '0', STR_PAD_LEFT);
            }

            // Brands
            $brandsStmt = $pdo->prepare("SELECT id, name FROM inv_brands WHERE company_id = ? ORDER BY name ASC");
            $brandsStmt->execute([$company_id]);
            $brands = $brandsStmt->fetchAll();

            // Categories
            $catsStmt = $pdo->prepare("SELECT id, name FROM inv_main_categories WHERE company_id = ? ORDER BY name ASC");
            $catsStmt->execute([$company_id]);
            $categories = $catsStmt->fetchAll();

            // Customers (from coa_list where code like 120 or sub_id in 120)
            $custStmt = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name 
                FROM coa_list cl
                WHERE cl.company_id = ? 
                AND (
                    cl.sub_id IN (SELECT id FROM coa_sub WHERE main_id IN (SELECT id FROM coa_main WHERE code = '120'))
                    OR cl.code LIKE '120%'
                )
                ORDER BY cl.name ASC
            ");
            $custStmt->execute([$company_id]);
            $customers = $custStmt->fetchAll();

            // If empty, fetch from customers table
            if (empty($customers)) {
                $custStmt2 = $pdo->prepare("SELECT id, name, telephone FROM customers WHERE company_id = ? ORDER BY name ASC");
                $custStmt2->execute([$company_id]);
                $customers = $custStmt2->fetchAll();
            }

            // Items (Quick lookup)
            $itemsStmt = $pdo->prepare("
                SELECT i.id, i.code, i.name, i.brand_id, b.name as brand_name, i.selling_price 
                FROM inv_items i 
                LEFT JOIN inv_brands b ON i.brand_id = b.id 
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
                ORDER BY i.name ASC
            ");
            $itemsStmt->execute([$company_id]);
            $items = $itemsStmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'next_revision_no' => $nextRevNo,
                'today' => date('Y-m-d'),
                'brands' => $brands,
                'categories' => $categories,
                'customers' => $customers,
                'items' => $items
            ]);
            break;
        }

        // ==========================================
        // 2. GET GENERAL PRICE LIST
        // ==========================================
        case 'get_general_price_list': {
            $cat_id = !empty($_GET['category_id']) ? intval($_GET['category_id']) : null;
            $brand_id = !empty($_GET['brand_id']) ? intval($_GET['brand_id']) : null;
            $search = trim($_GET['search'] ?? '');

            $query = "
                SELECT i.id, i.code, i.name, i.unit, i.purchase_price, i.selling_price, 
                       b.name as brand_name, c.name as category_name, i.created_at as updated_at
                FROM inv_items i
                LEFT JOIN inv_brands b ON i.brand_id = b.id
                LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
                LEFT JOIN inv_main_categories c ON sc.main_id = c.id
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ";
            $params = [$company_id];

            if ($cat_id) {
                $query .= " AND c.id = ?";
                $params[] = $cat_id;
            }
            if ($brand_id) {
                $query .= " AND i.brand_id = ?";
                $params[] = $brand_id;
            }
            if ($search !== '') {
                $query .= " AND (i.name LIKE ? OR i.code LIKE ? OR b.name LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }

            $query .= " ORDER BY i.name ASC";
            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $items = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'items' => $items,
                'count' => count($items)
            ]);
            break;
        }

        // ==========================================
        // 3. GET CUSTOMER PRICE LIST
        // ==========================================
        case 'get_customer_price_list': {
            $customer_id = !empty($_GET['customer_id']) ? intval($_GET['customer_id']) : null;
            $item_id = !empty($_GET['item_id']) ? intval($_GET['item_id']) : null;
            $brand_id = !empty($_GET['brand_id']) ? intval($_GET['brand_id']) : null;

            $query = "
                SELECT cip.id, cip.customer_id, cl.name as customer_name, cl.code as customer_code,
                       cip.item_id, i.code as item_code, i.name as item_name, i.unit,
                       b.name as brand_name, i.selling_price as general_price, cip.custom_price,
                       (cip.custom_price - i.selling_price) as diff_amount,
                       cip.updated_at, cip.notes
                FROM customer_item_prices cip
                INNER JOIN inv_items i ON cip.item_id = i.id
                LEFT JOIN inv_brands b ON i.brand_id = b.id
                INNER JOIN coa_list cl ON cip.customer_id = cl.id
                WHERE cip.company_id = ?
            ";
            $params = [$company_id];

            if ($customer_id) {
                $query .= " AND cip.customer_id = ?";
                $params[] = $customer_id;
            }
            if ($item_id) {
                $query .= " AND cip.item_id = ?";
                $params[] = $item_id;
            }
            if ($brand_id) {
                $query .= " AND i.brand_id = ?";
                $params[] = $brand_id;
            }

            $query .= " ORDER BY cl.name ASC, i.name ASC";
            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $custom_prices = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'customer_prices' => $custom_prices,
                'count' => count($custom_prices)
            ]);
            break;
        }

        // ==========================================
        // 3.5. SAVE / UPDATE GENERAL ITEM RATES (PURCHASE & SELLING)
        // ==========================================
        case 'save_item_rates': {
            $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $items = $input['items'] ?? [];
            if (!empty($input['item_id'])) {
                $items = [[
                    'item_id' => intval($input['item_id']),
                    'purchase_price' => floatval($input['purchase_price'] ?? 0),
                    'selling_price' => floatval($input['selling_price'] ?? 0)
                ]];
            }

            if (empty($items)) {
                echo json_encode(['status' => 'error', 'message' => 'No items provided to update']);
                break;
            }

            $stmt = $pdo->prepare("UPDATE inv_items SET purchase_price = ?, selling_price = ? WHERE id = ? AND company_id = ?");
            $updatedCount = 0;
            foreach ($items as $it) {
                $itemId = intval($it['item_id'] ?? 0);
                $purPrice = floatval($it['purchase_price'] ?? 0);
                $selPrice = floatval($it['selling_price'] ?? 0);
                if ($itemId > 0) {
                    $stmt->execute([$purPrice, $selPrice, $itemId, $company_id]);
                    $updatedCount++;
                }
            }

            if (function_exists('logActivity')) {
                logActivity('Price Management', 'Update Item Rates', "$updatedCount items", "Updated rates for $updatedCount items");
            }

            echo json_encode([
                'status' => 'success',
                'message' => "Rates updated successfully for $updatedCount item(s)!",
                'updated_count' => $updatedCount
            ]);
            break;
        }

        // ==========================================
        // 4. SAVE / UPDATE SINGLE OR BULK CUSTOMER PRICE
        // ==========================================
        case 'save_customer_price': {
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $cust_id = intval($data['customer_id'] ?? 0);
            $item_id = intval($data['item_id'] ?? 0);
            $custom_price = floatval($data['custom_price'] ?? 0);
            $notes = trim($data['notes'] ?? '');

            if (!$cust_id || !$item_id) {
                echo json_encode(['status' => 'error', 'message' => 'Customer and Item are required']);
                break;
            }

            $stmt = $pdo->prepare("
                INSERT INTO customer_item_prices (company_id, customer_id, item_id, custom_price, notes, updated_by)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE custom_price = VALUES(custom_price), notes = VALUES(notes), updated_by = VALUES(updated_by)
            ");
            $stmt->execute([$company_id, $cust_id, $item_id, $custom_price, $notes, $current_user]);

            echo json_encode(['status' => 'success', 'message' => 'Customer customized price saved successfully']);
            break;
        }

        // ==========================================
        // 5. CALCULATE PRICE REVISION PREVIEW
        // ==========================================
        case 'calculate_preview': {
            $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            $adjustment_type = $input['adjustment_type'] ?? 'Increase'; // Increase / Decrease
            $apply_to = $input['apply_to'] ?? 'All Customers';         // All Customers / Selected Customers
            $category_id = !empty($input['category_id']) ? intval($input['category_id']) : null;
            $brand_id = !empty($input['brand_id']) ? intval($input['brand_id']) : null;
            $item_id = !empty($input['item_id']) ? intval($input['item_id']) : null;
            $customer_id = !empty($input['customer_id']) ? intval($input['customer_id']) : null;
            $method = $input['adjustment_method'] ?? 'Fixed';           // Fixed / Percentage
            $value = floatval($input['adjustment_value'] ?? 0);
            $brand_adjustments = $input['brand_adjustments'] ?? [];      // Array: [{brand_id: 1, method: 'Fixed', value: 5, enabled: true}]

            // Index brand adjustments by brand_id for quick lookup
            $brand_rules = [];
            if (is_array($brand_adjustments)) {
                foreach ($brand_adjustments as $ba) {
                    if (!empty($ba['enabled']) && !empty($ba['brand_id'])) {
                        $brand_rules[intval($ba['brand_id'])] = [
                            'method' => $ba['method'] ?? 'Fixed',
                            'value' => floatval($ba['value'] ?? 0)
                        ];
                    }
                }
            }

            // Query targeted items
            $itemSql = "
                SELECT i.id, i.code, i.name, i.brand_id, b.name as brand_name, i.selling_price
                FROM inv_items i
                LEFT JOIN inv_brands b ON i.brand_id = b.id
                LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
                LEFT JOIN inv_main_categories c ON sc.main_id = c.id
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ";
            $itemParams = [$company_id];

            if ($item_id) {
                $itemSql .= " AND i.id = ?";
                $itemParams[] = $item_id;
            }
            if ($brand_id) {
                $itemSql .= " AND i.brand_id = ?";
                $itemParams[] = $brand_id;
            }
            if ($category_id) {
                $itemSql .= " AND c.id = ?";
                $itemParams[] = $category_id;
            }

            $itemSql .= " ORDER BY i.name ASC";
            $stmt = $pdo->prepare($itemSql);
            $stmt->execute($itemParams);
            $targetItems = $stmt->fetchAll();

            // Fetch key sample customers for the preview columns (or selected customer)
            $sampleCustSql = "
                SELECT cl.id, cl.code, cl.name 
                FROM coa_list cl
                WHERE cl.company_id = ? 
                AND (
                    cl.sub_id IN (SELECT id FROM coa_sub WHERE main_id IN (SELECT id FROM coa_main WHERE code = '120'))
                    OR cl.code LIKE '120%'
                )
            ";
            $sampleCustParams = [$company_id];
            if ($customer_id) {
                $sampleCustSql .= " AND cl.id = ?";
                $sampleCustParams[] = $customer_id;
            }
            $sampleCustSql .= " ORDER BY cl.id ASC LIMIT 5";
            $cStmt = $pdo->prepare($sampleCustSql);
            $cStmt->execute($sampleCustParams);
            $sampleCustomers = $cStmt->fetchAll();

            // Total count of customers in system
            $totCustStmt = $pdo->prepare("
                SELECT COUNT(*) FROM coa_list 
                WHERE company_id = ? 
                AND (sub_id IN (SELECT id FROM coa_sub WHERE main_id IN (SELECT id FROM coa_main WHERE code = '120')) OR code LIKE '120%')
            ");
            $totCustStmt->execute([$company_id]);
            $totalCustomerCount = intval($totCustStmt->fetchColumn()) ?: 1;
            if ($customer_id) $totalCustomerCount = 1;

            // Fetch all existing customer custom rates for these items
            $itemIds = array_column($targetItems, 'id');
            $customRateMap = []; // [item_id][customer_id] => custom_price
            if (!empty($itemIds)) {
                $inQuery = implode(',', array_fill(0, count($itemIds), '?'));
                $crStmt = $pdo->prepare("SELECT item_id, customer_id, custom_price FROM customer_item_prices WHERE company_id = ? AND item_id IN ($inQuery)");
                $crStmt->execute(array_merge([$company_id], $itemIds));
                while ($row = $crStmt->fetch()) {
                    $customRateMap[$row['item_id']][$row['customer_id']] = floatval($row['custom_price']);
                }
            }

            $previewRows = [];
            $totalIncRs = 0;
            $totalIncPct = 0;
            $itemsCount = count($targetItems);

            foreach ($targetItems as $idx => $item) {
                $itmId = intval($item['id']);
                $bId = intval($item['brand_id']);
                $oldGeneralPrice = floatval($item['selling_price']);

                // Determine adjustment method & value for this item
                $useMethod = $method;
                $useValue = $value;
                if (isset($brand_rules[$bId])) {
                    $useMethod = $brand_rules[$bId]['method'];
                    $useValue = $brand_rules[$bId]['value'];
                }

                // Calculate General Rate New
                $genDelta = 0;
                if ($useMethod === 'Percentage') {
                    $genDelta = ($oldGeneralPrice * $useValue) / 100.0;
                } else {
                    $genDelta = $useValue;
                }
                if ($adjustment_type === 'Decrease') {
                    $genDelta = -$genDelta;
                }
                $newGeneralPrice = max(0, round($oldGeneralPrice + $genDelta, 2));

                $actualDelta = $newGeneralPrice - $oldGeneralPrice;
                $totalIncRs += $actualDelta;
                if ($oldGeneralPrice > 0) {
                    $totalIncPct += (($actualDelta) / $oldGeneralPrice) * 100.0;
                }

                // Calculate for preview customers
                $custPreview = [];
                foreach ($sampleCustomers as $c) {
                    $cid = intval($c['id']);
                    // If customer has customized price, use it; else base on general price
                    $oldCustPrice = isset($customRateMap[$itmId][$cid]) ? $customRateMap[$itmId][$cid] : $oldGeneralPrice;
                    
                    // CRITICAL ERP RULE: Apply the increase to each customer's existing price,
                    // preserving customer-specific difference!
                    $custDelta = 0;
                    if ($useMethod === 'Percentage') {
                        $custDelta = ($oldCustPrice * $useValue) / 100.0;
                    } else {
                        $custDelta = $useValue;
                    }
                    if ($adjustment_type === 'Decrease') {
                        $custDelta = -$custDelta;
                    }
                    $newCustPrice = max(0, round($oldCustPrice + $custDelta, 2));

                    $custPreview[] = [
                        'customer_id' => $cid,
                        'customer_name' => $c['name'],
                        'old_price' => $oldCustPrice,
                        'new_price' => $newCustPrice,
                        'display' => number_format($oldCustPrice, 2) . ' -> ' . number_format($newCustPrice, 2)
                    ];
                }

                $previewRows[] = [
                    'seq' => $idx + 1,
                    'item_id' => $itmId,
                    'item_code' => $item['code'],
                    'item_name' => $item['name'],
                    'brand_id' => $bId,
                    'brand_name' => $item['brand_name'] ?: 'General',
                    'old_general_rate' => $oldGeneralPrice,
                    'new_general_rate' => $newGeneralPrice,
                    'adjustment_value' => $actualDelta,
                    'customer_previews' => $custPreview
                ];
            }

            $avgIncRs = $itemsCount > 0 ? round($totalIncRs / $itemsCount, 2) : 0;
            $avgIncPct = $itemsCount > 0 ? round($totalIncPct / $itemsCount, 2) : 0;

            echo json_encode([
                'status' => 'success',
                'summary' => [
                    'total_items' => $itemsCount,
                    'total_customers' => $totalCustomerCount,
                    'avg_increase_rs' => $avgIncRs,
                    'avg_increase_pct' => $avgIncPct,
                    'adjustment_type' => $adjustment_type,
                    'adjustment_method' => $method,
                    'adjustment_value' => $value
                ],
                'sample_customers' => $sampleCustomers,
                'preview_rows' => $previewRows
            ]);
            break;
        }

        // ==========================================
        // 6. APPLY PRICE REVISION (COMMITTING CHANGES)
        // ==========================================
        case 'apply_revision': {
            $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            $rev_no = trim($input['revision_no'] ?? '');
            $rev_date = $input['revision_date'] ?? date('Y-m-d');
            $eff_date = $input['effective_date'] ?? date('Y-m-d');
            $adj_type = $input['adjustment_type'] ?? 'Increase';
            $apply_to = $input['apply_to'] ?? 'All Customers';
            $cat_id = !empty($input['category_id']) ? intval($input['category_id']) : null;
            $brand_id = !empty($input['brand_id']) ? intval($input['brand_id']) : null;
            $item_id = !empty($input['item_id']) ? intval($input['item_id']) : null;
            $customer_id = !empty($input['customer_id']) ? intval($input['customer_id']) : null;
            $method = $input['adjustment_method'] ?? 'Fixed';
            $value = floatval($input['adjustment_value'] ?? 0);
            $brand_adjustments = $input['brand_adjustments'] ?? [];
            $remarks = trim($input['remarks'] ?? '');

            if (!$rev_no) {
                echo json_encode(['status' => 'error', 'message' => 'Revision Number is required']);
                break;
            }

            // Check duplicate revision number
            $chk = $pdo->prepare("SELECT id FROM price_revisions WHERE company_id = ? AND revision_no = ?");
            $chk->execute([$company_id, $rev_no]);
            if ($chk->fetch()) {
                echo json_encode(['status' => 'error', 'message' => "Revision Number '$rev_no' already exists! Duplicate revisions are prevented."]);
                break;
            }

            // Status is Future if eff_date > today, otherwise Active
            $today = date('Y-m-d');
            $status = ($eff_date > $today) ? 'Future' : 'Active';

            // Begin Transaction
            $pdo->beginTransaction();

            // Brand adjustments map
            $brand_rules = [];
            if (is_array($brand_adjustments)) {
                foreach ($brand_adjustments as $ba) {
                    if (!empty($ba['enabled']) && !empty($ba['brand_id'])) {
                        $brand_rules[intval($ba['brand_id'])] = [
                            'method' => $ba['method'] ?? 'Fixed',
                            'value' => floatval($ba['value'] ?? 0)
                        ];
                    }
                }
            }

            // Query targeted items
            $itemSql = "
                SELECT i.id, i.code, i.name, i.brand_id, i.selling_price
                FROM inv_items i
                LEFT JOIN inv_sub_categories sc ON i.sub_id = sc.id
                LEFT JOIN inv_main_categories c ON sc.main_id = c.id
                WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
            ";
            $itemParams = [$company_id];
            if ($item_id) { $itemSql .= " AND i.id = ?"; $itemParams[] = $item_id; }
            if ($brand_id) { $itemSql .= " AND i.brand_id = ?"; $itemParams[] = $brand_id; }
            if ($cat_id) { $itemSql .= " AND c.id = ?"; $itemParams[] = $cat_id; }

            $stmt = $pdo->prepare($itemSql);
            $stmt->execute($itemParams);
            $targetItems = $stmt->fetchAll();

            if (empty($targetItems)) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => 'No items match the selected criteria']);
                break;
            }

            // Total customers count
            $totCustStmt = $pdo->prepare("
                SELECT COUNT(*) FROM coa_list 
                WHERE company_id = ? 
                AND (sub_id IN (SELECT id FROM coa_sub WHERE main_id IN (SELECT id FROM coa_main WHERE code = '120')) OR code LIKE '120%')
            ");
            $totCustStmt->execute([$company_id]);
            $totalCustomerCount = intval($totCustStmt->fetchColumn()) ?: 1;
            if ($customer_id) $totalCustomerCount = 1;

            // Fetch existing custom rates
            $itemIds = array_column($targetItems, 'id');
            $inQuery = implode(',', array_fill(0, count($itemIds), '?'));
            $crStmt = $pdo->prepare("SELECT id, item_id, customer_id, custom_price FROM customer_item_prices WHERE company_id = ? AND item_id IN ($inQuery)");
            $crStmt->execute(array_merge([$company_id], $itemIds));
            $existingCustomRates = $crStmt->fetchAll();

            // Group custom rates by item_id
            $customByItem = [];
            foreach ($existingCustomRates as $cr) {
                $customByItem[$cr['item_id']][] = $cr;
            }

            $itemsAffectedCount = count($targetItems);
            $totalIncRs = 0;
            $totalIncPct = 0;

            // Prepare revision master insert
            $insRev = $pdo->prepare("
                INSERT INTO price_revisions 
                (company_id, revision_no, revision_date, effective_date, adjustment_type, apply_to, category_id, brand_id, item_id, customer_id, adjustment_method, adjustment_value, brand_adjustments_json, total_items_affected, total_customers_affected, avg_increase_rs, avg_increase_pct, remarks, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $insRev->execute([
                $company_id, $rev_no, $rev_date, $eff_date, $adj_type, $apply_to, $cat_id, $brand_id, $item_id, $customer_id,
                $method, $value, !empty($brand_rules) ? json_encode($brand_adjustments) : null,
                $itemsAffectedCount, $totalCustomerCount, 0, 0, $remarks, $status, $current_user
            ]);
            $revisionId = $pdo->lastInsertId();

            // Prepare statements for price_revision_items and updating rates
            $insRevItem = $pdo->prepare("
                INSERT INTO price_revision_items (revision_id, item_id, customer_id, old_price, adjustment_value, new_price, status)
                VALUES (?, ?, ?, ?, ?, ?, 'Applied')
            ");
            $updItemPrice = $pdo->prepare("UPDATE inv_items SET selling_price = ? WHERE id = ? AND company_id = ?");
            $updCustPrice = $pdo->prepare("UPDATE customer_item_prices SET custom_price = ?, updated_by = ? WHERE id = ?");

            foreach ($targetItems as $itm) {
                $itmId = intval($itm['id']);
                $bId = intval($itm['brand_id']);
                $oldGenPrice = floatval($itm['selling_price']);

                // Calculate Delta
                $useMethod = $method;
                $useValue = $value;
                if (isset($brand_rules[$bId])) {
                    $useMethod = $brand_rules[$bId]['method'];
                    $useValue = $brand_rules[$bId]['value'];
                }

                $genDelta = ($useMethod === 'Percentage') ? (($oldGenPrice * $useValue) / 100.0) : $useValue;
                if ($adj_type === 'Decrease') $genDelta = -$genDelta;
                $newGenPrice = max(0, round($oldGenPrice + $genDelta, 2));

                $actualDelta = $newGenPrice - $oldGenPrice;
                $totalIncRs += $actualDelta;
                if ($oldGenPrice > 0) $totalIncPct += ($actualDelta / $oldGenPrice) * 100.0;

                // 1. Audit line for General Price (customer_id = NULL)
                // If only specific customer was selected, we do NOT change general price
                if (!$customer_id) {
                    $insRevItem->execute([$revisionId, $itmId, null, $oldGenPrice, $actualDelta, $newGenPrice]);
                    if ($status === 'Active') {
                        $updItemPrice->execute([$newGenPrice, $itmId, $company_id]);
                    }
                }

                // 2. Update existing customer custom prices for this item
                if (isset($customByItem[$itmId])) {
                    foreach ($customByItem[$itmId] as $crRow) {
                        $cid = intval($crRow['customer_id']);
                        if ($customer_id && $cid !== $customer_id) continue;

                        $oldCustRate = floatval($crRow['custom_price']);
                        $custDelta = ($useMethod === 'Percentage') ? (($oldCustRate * $useValue) / 100.0) : $useValue;
                        if ($adj_type === 'Decrease') $custDelta = -$custDelta;
                        $newCustRate = max(0, round($oldCustRate + $custDelta, 2));

                        // Audit line for this customer
                        $insRevItem->execute([$revisionId, $itmId, $cid, $oldCustRate, ($newCustRate - $oldCustRate), $newCustRate]);
                        if ($status === 'Active') {
                            $updCustPrice->execute([$newCustRate, $current_user, $crRow['id']]);
                        }
                    }
                }
            }

            // Update averages in revision master
            $avgIncRs = $itemsAffectedCount > 0 ? round($totalIncRs / $itemsAffectedCount, 2) : 0;
            $avgIncPct = $itemsAffectedCount > 0 ? round($totalIncPct / $itemsAffectedCount, 2) : 0;
            $updRevMaster = $pdo->prepare("UPDATE price_revisions SET avg_increase_rs = ?, avg_increase_pct = ? WHERE id = ?");
            $updRevMaster->execute([$avgIncRs, $avgIncPct, $revisionId]);

            // Commit Transaction
            $pdo->commit();

            // Activity Log
            if (function_exists('logActivity')) {
                logActivity('Price Revision', 'Apply Revision', $rev_no, "Price Revision $rev_no applied ($adj_type: $avgIncRs Rs / $avgIncPct %)");
            }

            echo json_encode([
                'status' => 'success',
                'message' => "Price Revision $rev_no applied successfully! (" . ($status === 'Future' ? 'Scheduled for effective date: ' . $eff_date : 'Effective immediately') . ")",
                'revision_id' => $revisionId,
                'revision_no' => $rev_no,
                'items_affected' => $itemsAffectedCount,
                'status_type' => $status
            ]);
            break;
        }

        // ==========================================
        // 7. GET REVISION HISTORY
        // ==========================================
        case 'get_history': {
            $from_date = $_GET['from_date'] ?? null;
            $to_date = $_GET['to_date'] ?? null;
            $status_filter = $_GET['status'] ?? '';
            $search = trim($_GET['search'] ?? '');

            $sql = "
                SELECT pr.*, 
                       b.name as brand_name,
                       c.name as category_name,
                       i.name as item_name,
                       cl.name as customer_name
                FROM price_revisions pr
                LEFT JOIN inv_brands b ON pr.brand_id = b.id
                LEFT JOIN inv_main_categories c ON pr.category_id = c.id
                LEFT JOIN inv_items i ON pr.item_id = i.id
                LEFT JOIN coa_list cl ON pr.customer_id = cl.id
                WHERE pr.company_id = ?
            ";
            $params = [$company_id];

            if ($from_date) {
                $sql .= " AND pr.revision_date >= ?";
                $params[] = $from_date;
            }
            if ($to_date) {
                $sql .= " AND pr.revision_date <= ?";
                $params[] = $to_date;
            }
            if ($status_filter) {
                $sql .= " AND pr.status = ?";
                $params[] = $status_filter;
            }
            if ($search !== '') {
                $sql .= " AND (pr.revision_no LIKE ? OR pr.remarks LIKE ? OR b.name LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }

            $sql .= " ORDER BY pr.id DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $history = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'history' => $history,
                'count' => count($history)
            ]);
            break;
        }

        // ==========================================
        // 8. GET REVISION DETAILS (FOR VIEW / PRINT / PDF / EXCEL)
        // ==========================================
        case 'get_revision_details': {
            $rev_id = intval($_GET['revision_id'] ?? 0);
            if (!$rev_id) {
                echo json_encode(['status' => 'error', 'message' => 'Revision ID required']);
                break;
            }

            // Header
            $hStmt = $pdo->prepare("
                SELECT pr.*, b.name as brand_name, c.name as category_name 
                FROM price_revisions pr
                LEFT JOIN inv_brands b ON pr.brand_id = b.id
                LEFT JOIN inv_main_categories c ON pr.category_id = c.id
                WHERE pr.id = ? AND pr.company_id = ?
            ");
            $hStmt->execute([$rev_id, $company_id]);
            $header = $hStmt->fetch();

            if (!$header) {
                echo json_encode(['status' => 'error', 'message' => 'Revision record not found']);
                break;
            }

            // Line items
            $iStmt = $pdo->prepare("
                SELECT pri.*, i.code as item_code, i.name as item_name, b.name as brand_name,
                       cl.code as customer_code, cl.name as customer_name
                FROM price_revision_items pri
                INNER JOIN inv_items i ON pri.item_id = i.id
                LEFT JOIN inv_brands b ON i.brand_id = b.id
                LEFT JOIN coa_list cl ON pri.customer_id = cl.id
                WHERE pri.revision_id = ?
                ORDER BY i.name ASC, pri.customer_id ASC
            ");
            $iStmt->execute([$rev_id]);
            $items = $iStmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'header' => $header,
                'items' => $items
            ]);
            break;
        }

        // ==========================================
        // 9. ROLLBACK / RESTORE PRICE REVISION
        // ==========================================
        case 'rollback_revision': {
            $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $rev_id = intval($input['revision_id'] ?? 0);

            if (!$rev_id) {
                echo json_encode(['status' => 'error', 'message' => 'Revision ID is required for rollback']);
                break;
            }

            // Fetch revision
            $revStmt = $pdo->prepare("SELECT * FROM price_revisions WHERE id = ? AND company_id = ?");
            $revStmt->execute([$rev_id, $company_id]);
            $rev = $revStmt->fetch();

            if (!$rev) {
                echo json_encode(['status' => 'error', 'message' => 'Price revision not found']);
                break;
            }

            if ($rev['status'] === 'Reversed') {
                echo json_encode(['status' => 'error', 'message' => 'This revision has already been reversed/restored']);
                break;
            }

            $pdo->beginTransaction();

            // Fetch revision items that were applied
            $itemsStmt = $pdo->prepare("SELECT * FROM price_revision_items WHERE revision_id = ? AND status = 'Applied'");
            $itemsStmt->execute([$rev_id]);
            $revItems = $itemsStmt->fetchAll();

            $updItem = $pdo->prepare("UPDATE inv_items SET selling_price = ? WHERE id = ? AND company_id = ?");
            $updCust = $pdo->prepare("UPDATE customer_item_prices SET custom_price = ?, updated_by = ? WHERE company_id = ? AND customer_id = ? AND item_id = ?");

            $restoredCount = 0;
            foreach ($revItems as $ri) {
                $oldPrice = floatval($ri['old_price']);
                $itmId = intval($ri['item_id']);
                $custId = !empty($ri['customer_id']) ? intval($ri['customer_id']) : null;

                if ($custId === null) {
                    // Restore General Price
                    $updItem->execute([$oldPrice, $itmId, $company_id]);
                } else {
                    // Restore Customer Custom Price
                    $updCust->execute([$oldPrice, $current_user, $company_id, $custId, $itmId]);
                }
                $restoredCount++;
            }

            // Mark revision items as Reversed
            $pdo->prepare("UPDATE price_revision_items SET status = 'Reversed' WHERE revision_id = ?")->execute([$rev_id]);

            // Mark revision master as Reversed with timestamp and user
            $pdo->prepare("UPDATE price_revisions SET status = 'Reversed', reversed_at = NOW(), reversed_by = ? WHERE id = ?")
                ->execute([$current_user, $rev_id]);

            $pdo->commit();

            // Log activity
            if (function_exists('logActivity')) {
                logActivity('Price Revision', 'Rollback Revision', $rev['revision_no'], "Price Revision {$rev['revision_no']} rolled back. $restoredCount prices restored.");
            }

            echo json_encode([
                'status' => 'success',
                'message' => "Revision {$rev['revision_no']} successfully reversed! All $restoredCount previous prices have been restored.",
                'revision_no' => $rev['revision_no'],
                'restored_count' => $restoredCount
            ]);
            break;
        }

        // ==========================================
        // 10. GET EFFECTIVE CUSTOMER / ITEM PRICE (For Sales Invoice & POS)
        // ==========================================
        case 'get_effective_price': {
            $item_id = intval($_GET['item_id'] ?? 0);
            $customer_id = intval($_GET['customer_id'] ?? 0);
            $date = $_GET['date'] ?? date('Y-m-d');

            if (!$item_id) {
                echo json_encode(['status' => 'error', 'message' => 'item_id required']);
                break;
            }

            // Check if customer has a customized price
            $customPrice = null;
            if ($customer_id) {
                $cpStmt = $pdo->prepare("SELECT custom_price FROM customer_item_prices WHERE company_id = ? AND customer_id = ? AND item_id = ?");
                $cpStmt->execute([$company_id, $customer_id, $item_id]);
                $val = $cpStmt->fetchColumn();
                if ($val !== false && $val !== null) {
                    $customPrice = floatval($val);
                }
            }

            // Fetch general item price
            $gStmt = $pdo->prepare("SELECT selling_price FROM inv_items WHERE id = ? AND company_id = ?");
            $gStmt->execute([$item_id, $company_id]);
            $generalPrice = floatval($gStmt->fetchColumn() ?: 0);

            $effectivePrice = ($customPrice !== null) ? $customPrice : $generalPrice;

            echo json_encode([
                'status' => 'success',
                'item_id' => $item_id,
                'customer_id' => $customer_id,
                'is_customized' => ($customPrice !== null),
                'custom_price' => $customPrice,
                'general_price' => $generalPrice,
                'effective_price' => $effectivePrice
            ]);
            break;
        }

        // ==========================================
        // 11. BRAND-WISE PRICING STATS
        // ==========================================
        case 'get_brand_pricing_stats': {
            $stmt = $pdo->prepare("
                SELECT b.id, b.name as brand_name, 
                       COUNT(i.id) as total_items,
                       AVG(i.selling_price) as avg_price,
                       MIN(i.selling_price) as min_price,
                       MAX(i.selling_price) as max_price
                FROM inv_brands b
                LEFT JOIN inv_items i ON i.brand_id = b.id AND i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL)
                WHERE b.company_id = ?
                GROUP BY b.id, b.name
                ORDER BY b.name ASC
            ");
            $stmt->execute([$company_id, $company_id]);
            $brands = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'brands' => $brands
            ]);
            break;
        }

        default:
            echo json_encode(['status' => 'error', 'message' => "Invalid action: '$action'"]);
            break;
    }

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status' => 'error',
        'message' => 'Server Error: ' . $e->getMessage()
    ]);
}
