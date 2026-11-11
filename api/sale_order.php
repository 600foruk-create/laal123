<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

// MIGRATION: Ensure Sale Order tables exist
if (shouldRunMigration('sale_orders_schema', 1)) {
    if (!in_array($action, ['get_all_items', 'get_customers_and_vendors'])) {
        // Create or migrate tables
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS sale_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                serial_no INT NOT NULL,
                date DATE,
                customer_coa_id INT,
                customer_order_ref VARCHAR(100),
                delivery_date DATE,
                terms_of_payment TEXT,
                job_id INT,
                employee_id INT,
                total_pieces DECIMAL(15,2) DEFAULT 0.00,
                total_qty DECIMAL(15,2) DEFAULT 0.00,
                total_excl_tax DECIMAL(15,2) DEFAULT 0.00,
                total_tax_amount DECIMAL(15,2) DEFAULT 0.00,
                total_further_tax DECIMAL(15,2) DEFAULT 0.00,
                total_amount DECIMAL(15,2) DEFAULT 0.00,
                remarks TEXT,
                is_cancelled TINYINT DEFAULT 0,
                converted_to_dc INT DEFAULT 0,
                converted_to_invtax INT DEFAULT 0,
                converted_to_invnontax INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (company_id),
                INDEX (customer_coa_id),
                INDEX (serial_no)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            $soCols = $pdo->query("SHOW COLUMNS FROM sale_orders")->fetchAll(PDO::FETCH_COLUMN);
            $soNewCols = [
                'converted_to_dc' => 'INT DEFAULT 0',
                'converted_to_invtax' => 'INT DEFAULT 0',
                'converted_to_invnontax' => 'INT DEFAULT 0',
                'customer_address' => 'VARCHAR(500) DEFAULT ""',
                'customer_telephone' => 'VARCHAR(100) DEFAULT ""',
                'customer_ntn' => 'VARCHAR(100) DEFAULT ""',
                'customer_gst' => 'VARCHAR(100) DEFAULT ""'
            ];
            foreach ($soNewCols as $col => $def) {
                if (!in_array($col, $soCols)) {
                    $pdo->exec("ALTER TABLE sale_orders ADD COLUMN $col $def");
                }
            }

            $pdo->exec("CREATE TABLE IF NOT EXISTS sale_order_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sale_order_id INT NOT NULL,
                    item_id INT NOT NULL,
                    item_type ENUM('inventory', 'service') DEFAULT 'inventory',
                    pieces DECIMAL(15,2) DEFAULT 0.00,
                    qty DECIMAL(15,2) DEFAULT 0.00,
                    rate DECIMAL(15,2) DEFAULT 0.00,
                    val_excl_tax DECIMAL(15,2) DEFAULT 0.00,
                    tax_rate DECIMAL(15,2) DEFAULT 0.00,
                    tax_amount DECIMAL(15,2) DEFAULT 0.00,
                    further_tax_rate DECIMAL(15,2) DEFAULT 0.00,
                    further_tax_amount DECIMAL(15,2) DEFAULT 0.00,
                    val_incl_tax DECIMAL(15,2) DEFAULT 0.00,
                    FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        } catch (Exception $e) {}
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_next_serial_no') {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM sale_orders WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
    }

    if ($action === 'get_all_items') {
        $invItems = [];
        $servItems = [];

        try {
            $pdo->exec("ALTER TABLE inv_items ADD COLUMN purchase_price DECIMAL(20,2) DEFAULT 0");
        } catch (\Exception $e) {}

        // 1. Fetch Inventory Items (attempt with purchase_price, joined to Chart of Inventory categories)
        try {
            $stmtInv = $pdo->prepare("
                SELECT i.id, i.code as item_code, i.code, i.name as item_name, i.name, 
                       COALESCE(NULLIF(i.description, ''), i.name) as description, 
                       COALESCE(i.hs_code, '') as hs_code, 
                       COALESCE(NULLIF(i.unit, ''), 'Pcs') as unit, 
                       COALESCE(i.selling_price, 0) as sales_price, 
                       COALESCE(i.selling_price, 0) as selling_price, 
                       COALESCE(i.purchase_price, 0) as purchase_price, 
                       COALESCE(i.purchase_price, 0) as cost_price, 
                       COALESCE(i.purchase_price, 0) as rate, 
                       COALESCE(i.qty_per_piece, 0) as qty_per_piece, 
                       COALESCE(i.category_type, m.category_type, '') as category_type,
                       COALESCE(i.pipe_sub_type, '') as pipe_sub_type,
                       COALESCE(i.pipe_length, 0) as pipe_length,
                       COALESCE(i.length, '') as length,
                       COALESCE(i.length_unit, 'ft') as length_unit,
                       COALESCE(i.billing_mode, '') as billing_mode,
                       COALESCE(i.unit_weight, 0) as unit_weight,
                       COALESCE(i.carton, 0) as carton,
                       m.name as main_category_name,
                       s.name as sub_category_name,
                       'inventory' as item_type 
                FROM inv_items i
                INNER JOIN inv_sub_categories s ON i.sub_id = s.id AND s.company_id = i.company_id
                INNER JOIN inv_main_categories m ON s.main_id = m.id AND m.company_id = i.company_id
                WHERE i.company_id = ? 
                  AND (i.is_inactive = 0 OR i.is_inactive IS NULL) 
                ORDER BY i.code ASC
            ");
            $stmtInv->execute([$company_id]);
            $invItems = $stmtInv->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {}

        // Fallback 1: Query without purchase_price if column does not exist
        if (empty($invItems)) {
            try {
                $stmtInv = $pdo->prepare("
                    SELECT i.id, i.code as item_code, i.code, i.name as item_name, i.name, 
                           COALESCE(NULLIF(i.description, ''), i.name) as description, 
                           COALESCE(i.hs_code, '') as hs_code, 
                           COALESCE(NULLIF(i.unit, ''), 'Pcs') as unit, 
                           COALESCE(i.selling_price, 0) as sales_price, 
                           COALESCE(i.selling_price, 0) as selling_price, 
                           0 as purchase_price, 
                           0 as cost_price, 
                           0 as rate, 
                           COALESCE(i.qty_per_piece, 0) as qty_per_piece, 
                           'inventory' as item_type 
                    FROM inv_items i 
                    INNER JOIN inv_sub_categories s ON i.sub_id = s.id AND s.company_id = i.company_id
                    INNER JOIN inv_main_categories m ON s.main_id = m.id AND m.company_id = i.company_id
                    WHERE i.company_id = ? 
                      AND (i.is_inactive = 0 OR i.is_inactive IS NULL) 
                    ORDER BY i.code ASC
                ");
                $stmtInv->execute([$company_id]);
                $invItems = $stmtInv->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Exception $e) {}
        }

        // Fallback 2: Direct company fetch if categories aren't configured yet
        if (empty($invItems)) {
            try {
                $stmtInv = $pdo->prepare("
                    SELECT id, code as item_code, code, name as item_name, name, 
                           COALESCE(NULLIF(description, ''), name) as description, 
                           COALESCE(hs_code, '') as hs_code, 
                           COALESCE(NULLIF(unit, ''), 'Pcs') as unit, 
                           COALESCE(selling_price, 0) as sales_price, 
                           COALESCE(selling_price, 0) as selling_price, 
                           COALESCE(purchase_price, 0) as purchase_price, 
                           COALESCE(purchase_price, 0) as cost_price, 
                           COALESCE(purchase_price, 0) as rate, 
                           COALESCE(qty_per_piece, 0) as qty_per_piece, 
                           'inventory' as item_type 
                    FROM inv_items 
                    WHERE company_id = ? AND (is_inactive = 0 OR is_inactive IS NULL) 
                    ORDER BY code ASC
                ");
                $stmtInv->execute([$company_id]);
                $invItems = $stmtInv->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Exception $e) {}
        }

        // 2. Fetch Service Items safely
        try {
            $stmtServ = $pdo->prepare("
                SELECT i.id, i.code as item_code, i.code, i.name as item_name, i.name, 
                       COALESCE(NULLIF(i.description, ''), i.name) as description, 
                       '' as hs_code, COALESCE(NULLIF(i.unit, ''), 'Pcs') as unit, 
                       COALESCE(i.selling_price, 0) as sales_price, 
                       COALESCE(i.selling_price, 0) as selling_price, 
                       'service' as item_type,
                       'Services' as category_name
                FROM serv_items i
                WHERE (i.company_id = ? OR i.company_id = 1 OR i.company_id IS NULL OR i.company_id = 0) 
                  AND (i.is_inactive = 0 OR i.is_inactive IS NULL) 
                ORDER BY i.name ASC
            ");
            $stmtServ->execute([$company_id]);
            $servItems = $stmtServ->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {}

        foreach ($invItems as &$inv) { $inv['category_name'] = 'Inventory'; }

        sendResponse(array_merge($invItems, $servItems));
    }

    if ($action === 'get_customers_and_vendors') {
        $stmt = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, 
                   COALESCE(c.address, v.address, '') as address, 
                   COALESCE(c.telephone, v.telephone, '') as telephone,
                   COALESCE(c.contact_person, v.contact_person, '') as contact_person,
                   COALESCE(c.ntn_cnic, v.ntn_cnic, '') as ntn,
                   COALESCE(c.st_reg_no, v.st_reg_no, '') as gst_reg_no,
                   COALESCE(c.wh_tax_rate, ctt.tax_rate, 0) as tax_rate,
                   ctt.wht_type as wht_type,
                   COALESCE(NULLIF(c.sales_tax_rate, 0.00), bt.sales_tax_rate, c.sales_tax_rate, 0.00) as sales_tax_rate,
                   COALESCE(NULLIF(c.further_tax_rate, 0.00), bt.further_tax_rate, c.further_tax_rate, 0.00) as further_tax_rate,
                   c.buyer_type_id,
                   COALESCE(bt.name, '') as buyer_type_name,
                   COALESCE(bt.buyer_code, '') as buyer_code,
                   CASE WHEN c.id IS NOT NULL OR cm.code = '120' OR cm.name LIKE '%RECEIVABLE%' OR cm.name LIKE '%DEBTOR%' OR cs.name LIKE '%RECEIVABLE%' OR cs.name LIKE '%CUSTOMER%' THEN 'customer' ELSE 'vendor' END as type
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_main cm ON cs.main_id = cm.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
            LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id
            LEFT JOIN customer_types_tax ctt ON c.cust_tax_type_id = ctt.id
            WHERE (cl.company_id = ? OR cl.company_id = 1 OR cl.company_id IS NULL OR cl.company_id = 0)
              AND (
                  c.id IS NOT NULL 
                  OR v.id IS NOT NULL 
                  OR cm.code = '120' 
                  OR cm.code = '210' 
                  OR cm.name LIKE '%RECEIVABLE%' 
                  OR cm.name LIKE '%DEBTOR%' 
                  OR cs.name LIKE '%RECEIVABLE%' 
                  OR cs.name LIKE '%CUSTOMER%'
                  OR cm.name LIKE '%PAYABLE%' 
                  OR cm.name LIKE '%CREDITOR%' 
                  OR cs.name LIKE '%PAYABLE%' 
                  OR cs.name LIKE '%VENDOR%'
              )
            ORDER BY cl.name ASC
        ");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    if ($action === 'get_all') {
        $stmt = $pdo->prepare("
            SELECT s.*, 
                   cl.name as customer_name,
                   cl.code as customer_code
            FROM sale_orders s
            LEFT JOIN coa_list cl ON s.customer_coa_id = cl.id
            WHERE s.company_id = ?
            ORDER BY s.serial_no DESC LIMIT 200
        ");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    if ($action === 'search') {
        $field = $_GET['field'] ?? '';
        $value = $_GET['value'] ?? '';
        $query = "
            SELECT s.*, 
                   cl.name as customer_name,
                   cl.code as customer_code
            FROM sale_orders s
            LEFT JOIN coa_list cl ON s.customer_coa_id = cl.id
            WHERE s.company_id = :company_id
        ";
        
        $params = ['company_id' => $company_id];
        
        if ($value !== '') {
            if ($field === 'serial_no') {
                $query .= " AND s.serial_no = :val";
                $params['val'] = $value;
            } elseif ($field === 'customer_name') {
                $query .= " AND cl.name LIKE :val";
                $params['val'] = "%$value%";
            } elseif ($field === 'date') {
                $query .= " AND s.date = :val";
                $params['val'] = $value;
            } elseif ($field === 'status') {
                if (strtolower($value) === 'cancelled') {
                    $query .= " AND s.is_cancelled = 1";
                } else {
                    $query .= " AND s.is_cancelled = 0";
                }
            }
        }
        
        $query .= " ORDER BY s.serial_no DESC LIMIT 200";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    if ($action === 'get_sale_order' && isset($_GET['serial_no'])) {
        $dir = $_GET['dir'] ?? '';
        $sn = $_GET['serial_no'] ?? 0;
        $sql = "
            SELECT s.*, cl.name as customer_name, cl.code as customer_code, 
                   COALESCE(c.contact_person, v.contact_person, '') as contact_person,
                   COALESCE(NULLIF(s.customer_address, ''), c.address, v.address, '') as customer_address,
                   COALESCE(NULLIF(s.customer_telephone, ''), c.telephone, v.telephone, '') as customer_telephone,
                   COALESCE(NULLIF(s.customer_ntn, ''), c.ntn_cnic, v.ntn_cnic, '') as ntn,
                   COALESCE(NULLIF(s.customer_gst, ''), c.st_reg_no, v.st_reg_no, '') as gst_reg_no
            FROM sale_orders s
            LEFT JOIN coa_list cl ON s.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
        ";
        if ($dir === 'next') {
            $stmt = $pdo->prepare($sql . " WHERE s.company_id = ? AND s.serial_no > ? ORDER BY s.serial_no ASC LIMIT 1");
        } else if ($dir === 'prev') {
            $stmt = $pdo->prepare($sql . " WHERE s.company_id = ? AND s.serial_no < ? ORDER BY s.serial_no DESC LIMIT 1");
        } else {
            $stmt = $pdo->prepare($sql . " WHERE s.company_id = ? AND s.serial_no = ?");
        }
        $stmt->execute([$company_id, $sn]);
        $order = $stmt->fetch();
        
        if ($order) {
            $stmt = $pdo->prepare("
                SELECT si.*, 
                       CASE 
                         WHEN si.item_type = 'inventory' THEN (SELECT name FROM inv_items WHERE id = si.item_id)
                         ELSE (SELECT name FROM serv_items WHERE id = si.item_id)
                       END as item_name,
                       CASE 
                         WHEN si.item_type = 'inventory' THEN (SELECT code FROM inv_items WHERE id = si.item_id)
                         ELSE (SELECT code FROM serv_items WHERE id = si.item_id)
                       END as item_code,
                       CASE 
                         WHEN si.item_type = 'inventory' THEN (SELECT hs_code FROM inv_items WHERE id = si.item_id) ELSE '' END as hs_code,
                         CASE 
                           WHEN si.item_type = 'inventory' THEN (SELECT unit FROM inv_items WHERE id = si.item_id)
                         ELSE (SELECT unit FROM serv_items WHERE id = si.item_id)
                       END as unit,
                       CASE 
                           WHEN si.item_type = 'inventory' THEN (SELECT qty_per_piece FROM inv_items WHERE id = si.item_id)
                         ELSE 0
                       END as qty_per_piece
                FROM sale_order_items si
                WHERE si.sale_order_id = ?
            ");
            $stmt->execute([$order['id']]);
            $order['items'] = $stmt->fetchAll();
        }
        sendResponse($order);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'save_sale_order') {
        try {
            $id = $data['id'] ?? null;
            $before_data = $id ? fetchRecordData('sale_orders', 'sale_order_items', 'sale_order_id', $id) : null;
            $pdo->beginTransaction();
            
            if ($id) {
                // Update
                $sql = "UPDATE sale_orders SET 
                        date = ?, customer_coa_id = ?, customer_order_ref = ?, 
                        customer_address = ?, customer_telephone = ?, customer_ntn = ?, customer_gst = ?,
                        delivery_date = ?, terms_of_payment = ?, 
                        job_id = ?, employee_id = ?, 
                        total_pieces = ?, total_qty = ?, total_excl_tax = ?, 
                        total_tax_amount = ?, total_further_tax = ?, total_amount = ?, 
                        remarks = ?, is_cancelled = ?,
                        converted_to_dc = ?, converted_to_invtax = ?, converted_to_invnontax = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['date'], $data['customer_coa_id'], $data['customer_order_ref'],
                    $data['customer_address'] ?? '', $data['customer_telephone'] ?? '', $data['customer_ntn'] ?? '', $data['customer_gst'] ?? '',
                    $data['delivery_date'], $data['terms_of_payment'],
                    $data['job_id'], $data['employee_id'],
                    $data['total_pieces'], $data['total_qty'], $data['total_excl_tax'],
                    $data['total_tax_amount'], $data['total_further_tax'], $data['total_amount'],
                    $data['remarks'], $data['is_cancelled'] ? 1 : 0, 
                    $data['converted_to_dc'] ?? 0, $data['converted_to_invtax'] ?? 0, $data['converted_to_invnontax'] ?? 0,
                    $id, $company_id
                ]);
                
                // Delete old items
                $pdo->prepare("DELETE FROM sale_order_items WHERE sale_order_id = ?")->execute([$id]);
            } else {
                // Insert
                $sql = "INSERT INTO sale_orders (
                        company_id, serial_no, date, customer_coa_id, customer_order_ref,
                        customer_address, customer_telephone, customer_ntn, customer_gst,
                        delivery_date, terms_of_payment, job_id, employee_id, 
                        total_pieces, total_qty, total_excl_tax, total_tax_amount, 
                        total_further_tax, total_amount, remarks, is_cancelled,
                        converted_to_dc, converted_to_invtax, converted_to_invnontax
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $data['serial_no'], $data['date'], $data['customer_coa_id'], 
                    $data['customer_order_ref'],
                    $data['customer_address'] ?? '', $data['customer_telephone'] ?? '', $data['customer_ntn'] ?? '', $data['customer_gst'] ?? '',
                    $data['delivery_date'], $data['terms_of_payment'], 
                    $data['job_id'], $data['employee_id'], $data['total_pieces'], 
                    $data['total_qty'], $data['total_excl_tax'], $data['total_tax_amount'], 
                    $data['total_further_tax'], $data['total_amount'], $data['remarks'], $data['is_cancelled'] ? 1 : 0,
                    $data['converted_to_dc'] ?? 0, $data['converted_to_invtax'] ?? 0, $data['converted_to_invnontax'] ?? 0
                ]);
                $id = $pdo->lastInsertId();
            }
            
            // Insert items
            $itemSql = "INSERT INTO sale_order_items (
                        sale_order_id, item_id, item_type, pieces, qty, rate, val_excl_tax, 
                        tax_rate, tax_amount, further_tax_rate, further_tax_amount, val_incl_tax
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $itemStmt = $pdo->prepare($itemSql);
            foreach ($data['items'] as $item) {
                if ($item['item_id']) {
                    $itemStmt->execute([
                        $id, $item['item_id'], $item['item_type'], $item['pieces'], $item['qty'], $item['rate'], 
                        $item['val_excl_tax'], $item['tax_rate'], $item['tax_amount'], 
                        $item['further_tax_rate'], $item['further_tax_amount'], $item['val_incl_tax']
                    ]);
                }
            }
            
            $pdo->commit();
            $after_data = fetchRecordData('sale_orders', 'sale_order_items', 'sale_order_id', $id);
            logActivity('Sale Orders', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'SO Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'delete_sale_order' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('sale_orders', 'sale_order_items', 'sale_order_id', $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM sale_orders WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Sale Orders', 'DELETE', $id, 'SO Serial: ' . $serial_no, $before_data, null);
        sendResponse(['status' => 'success']);
    }
}
?>

