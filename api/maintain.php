<?php
require_once 'db_config.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;

// MIGRATION: Ensure coa_opening_balances table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS coa_opening_balances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        coa_id INT NOT NULL,
        fy_id INT NOT NULL,
        debit DECIMAL(15,2) DEFAULT 0.00,
        credit DECIMAL(15,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_opening (company_id, coa_id, fy_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {}

// MIGRATION: Ensure list_regions table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS list_regions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sub_region_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (sub_region_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {}

// MIGRATION: Ensure list_region_id column exists in customers table
try {
    $stmt = $pdo->query("SHOW COLUMNS FROM customers LIKE 'list_region_id'");
    if ($stmt->rowCount() == 0) {
        $pdo->exec("ALTER TABLE customers ADD COLUMN list_region_id INT DEFAULT NULL AFTER sub_region_id");
    }
} catch (Exception $e) {}

// MIGRATION: Ensure sales_tax_rate, further_tax_rate, and wh_tax_rate exist in customers table
try {
    $stmt = $pdo->query("SHOW COLUMNS FROM customers LIKE 'sales_tax_rate'");
    if ($stmt->rowCount() == 0) {
        $pdo->exec("ALTER TABLE customers ADD COLUMN sales_tax_rate DECIMAL(10,2) DEFAULT 0.00");
    }
} catch (Exception $e) {}
try {
    $stmt = $pdo->query("SHOW COLUMNS FROM customers LIKE 'further_tax_rate'");
    if ($stmt->rowCount() == 0) {
        $pdo->exec("ALTER TABLE customers ADD COLUMN further_tax_rate DECIMAL(10,2) DEFAULT 0.00");
    }
} catch (Exception $e) {}
try {
    $stmt = $pdo->query("SHOW COLUMNS FROM customers LIKE 'wh_tax_rate'");
    if ($stmt->rowCount() == 0) {
        $pdo->exec("ALTER TABLE customers ADD COLUMN wh_tax_rate DECIMAL(10,2) DEFAULT 0.00");
    }
} catch (Exception $e) {}

// MIGRATION: Ensure bank_accounts table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS bank_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coa_list_id INT NOT NULL UNIQUE,
        bank_name VARCHAR(150),
        branch VARCHAR(150),
        account_title VARCHAR(150),
        account_no VARCHAR(100),
        contact_person VARCHAR(150),
        address TEXT,
        telephone VARCHAR(50),
        mobile VARCHAR(50),
        fax VARCHAR(50),
        email VARCHAR(100),
        website VARCHAR(150),
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {}

// MIGRATION: Ensure all employees columns exist
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN nic_no VARCHAR(50) DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN father_name VARCHAR(100) DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN dob DATE DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN joining_date DATE DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN leaving_date DATE DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN salary DECIMAL(15,2) DEFAULT 0;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN designation VARCHAR(100) DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN department_id INT DEFAULT 0;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN reference VARCHAR(150) DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN remarks TEXT DEFAULT NULL;");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE employees ADD COLUMN job_left TINYINT(1) DEFAULT 0;");
} catch (Exception $e) {}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_coa_main') {
        $stmt = $pdo->prepare("SELECT * FROM coa_main WHERE company_id = ? ORDER BY code ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }
    
    if ($action === 'get_coa_sub' && isset($_GET['main_id'])) {
        $mainId = $_GET['main_id'];
        if ($mainId === 'ALL') {
            $stmt = $pdo->prepare("SELECT * FROM coa_sub WHERE company_id = ? ORDER BY code ASC");
            $stmt->execute([$company_id]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM coa_sub WHERE main_id = ? AND company_id = ? ORDER BY code ASC");
            $stmt->execute([$mainId, $company_id]);
        }
        sendResponse($stmt->fetchAll());
    }
    
    if ($action === 'get_coa_list' && isset($_GET['sub_id'])) {
        $subId = $_GET['sub_id'];
        if ($subId === 'ALL') {
            $stmt = $pdo->prepare("SELECT * FROM coa_list WHERE company_id = ? ORDER BY code ASC");
            $stmt->execute([$company_id]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM coa_list WHERE sub_id = ? AND company_id = ? ORDER BY code ASC");
            $stmt->execute([$subId, $company_id]);
        }
        sendResponse($stmt->fetchAll());
    }

    // --- Customers & Lookups ---
    if ($action === 'get_customer_types') {
        $stmt = $pdo->prepare("
            SELECT * FROM coa_sub 
            WHERE main_id IN (
                SELECT id FROM coa_main WHERE code = '120'
            ) AND company_id = ? 
            ORDER BY code ASC
        ");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_vendor_types') {
        $stmt = $pdo->prepare("
            SELECT * FROM coa_sub 
            WHERE main_id IN (
                SELECT id FROM coa_main WHERE code = '210'
            ) AND company_id = ? 
            ORDER BY code ASC
        ");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_customers' && isset($_GET['sub_id'])) {
        $subId = $_GET['sub_id'];
        
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN list_region_id INT NULL AFTER sub_region_id"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN cust_tax_type_id INT NULL"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN sales_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN further_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN wh_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN cnic VARCHAR(50) DEFAULT NULL AFTER ntn_cnic"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN buyer_type_id INT DEFAULT NULL AFTER cust_tax_type_id"); } catch(PDOException $e) {}
        
        $stmt = $pdo->prepare("
            SELECT cl.*, c.contact_person, c.address, c.region_id, c.sub_region_id, c.list_region_id,
                   c.telephone, c.mobile, c.fax, c.email, c.website, 
                   c.st_reg_no, c.ntn_cnic, COALESCE(c.cnic, '') AS cnic, 
                   c.business_sector_id, c.acc_manager_id, 
                   c.credit_limit, c.credit_terms, c.remarks, c.cust_tax_type_id,
                   c.buyer_type_id,
                   COALESCE(bt.name, '') AS buyer_type_name,
                   COALESCE(bt.buyer_code, '') AS buyer_code,
                   COALESCE(c.sales_tax_rate, bt.sales_tax_rate, 0.00) AS sales_tax_rate,
                   COALESCE(c.further_tax_rate, bt.further_tax_rate, 0.00) AS further_tax_rate,
                   COALESCE(c.wh_tax_rate, ctt.tax_rate, 0.00) AS wh_tax_rate,
                   COALESCE(c.wh_tax_rate, ctt.tax_rate, 0.00) AS tax_rate
            FROM coa_list cl
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id
            LEFT JOIN customer_types_tax ctt ON c.cust_tax_type_id = ctt.id
            WHERE cl.sub_id = ? AND cl.company_id = ?
            ORDER BY cl.code ASC
        ");
        $stmt->execute([$subId, $company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_buyer_types') {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS buyer_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT DEFAULT 1,
                name VARCHAR(100) NOT NULL,
                buyer_code VARCHAR(50) DEFAULT 'Registered',
                sales_tax_rate DECIMAL(10,2) DEFAULT 18.00,
                further_tax_rate DECIMAL(10,2) DEFAULT 0.00,
                extra_tax_rate DECIMAL(10,2) DEFAULT 0.00,
                description VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch(PDOException $e) {}

        $rows = [];
        // Attempt 1: Fetch matching company_id or default company_id = 1 / NULL / 0
        try {
            $stmt = $pdo->prepare("SELECT * FROM buyer_types WHERE (company_id = ? OR company_id = 1 OR company_id IS NULL OR company_id = 0) ORDER BY id ASC");
            $stmt->execute([$company_id]);
            $rows = $stmt->fetchAll();
        } catch(PDOException $e) {}

        // Attempt 2: Fallback to all rows if company-specific query is empty
        if (empty($rows)) {
            try {
                $stmt = $pdo->query("SELECT * FROM buyer_types ORDER BY id ASC");
                $rows = $stmt ? $stmt->fetchAll() : [];
            } catch(PDOException $e) {}
        }

        // Attempt 3: If completely empty, seed default buyer types and return them
        if (empty($rows)) {
            $defaults = [
                ['Registered Person (Filer)', 'Registered', 18.00, 0.00, 0.00, 'Standard Sales Tax Filer Buyer'],
                ['Unregistered Buyer (Non-Filer)', 'Unregistered', 18.00, 4.00, 0.00, 'Unregistered Buyer with 4% Further Tax'],
                ['End Consumer', 'Consumer', 18.00, 0.00, 0.00, 'Final retail / consumer purchase'],
                ['Exempt / Zero-Rated', 'Exempt', 0.00, 0.00, 0.00, 'Exempt from sales tax (Schedule 5/6)'],
                ['Wholesaler / Distributor', 'Registered', 18.00, 0.00, 0.00, 'Wholesale trade registered buyer'],
                ['Retailer', 'Registered', 18.00, 0.00, 0.00, 'Retail channel partner'],
                ['Exporter', 'Exempt', 0.00, 0.00, 0.00, 'Direct export sales']
            ];
            $ins = $pdo->prepare("INSERT INTO buyer_types (company_id, name, buyer_code, sales_tax_rate, further_tax_rate, extra_tax_rate, description) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($defaults as $d) {
                try {
                    $ins->execute([$company_id, $d[0], $d[1], $d[2], $d[3], $d[4], $d[5]]);
                } catch(PDOException $ex) {}
            }
            try {
                $stmt = $pdo->query("SELECT * FROM buyer_types ORDER BY id ASC");
                $rows = $stmt ? $stmt->fetchAll() : [];
            } catch(PDOException $e) {}
        }

        sendResponse($rows);
    }

    if ($action === 'get_regions') {
        $stmt = $pdo->prepare("SELECT * FROM regions WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_customer_types_tax') {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS customer_types_tax (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                company_id INT, 
                name VARCHAR(100), 
                tax_rate DECIMAL(10,2) DEFAULT 0.00,
                wht_type VARCHAR(50) DEFAULT NULL
            )");
            $pdo->exec("ALTER TABLE customer_types_tax ADD COLUMN wht_type VARCHAR(50) DEFAULT NULL");
        } catch(PDOException $e) {}
        
        $stmt = $pdo->prepare("SELECT * FROM customer_types_tax WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_sub_regions' && isset($_GET['region_id'])) {
        $stmt = $pdo->prepare("SELECT * FROM sub_regions WHERE region_id = ? ORDER BY name ASC");
        $stmt->execute([$_GET['region_id']]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_list_regions' && isset($_GET['sub_region_id'])) {
        $stmt = $pdo->prepare("SELECT * FROM list_regions WHERE sub_region_id = ? ORDER BY name ASC");
        $stmt->execute([$_GET['sub_region_id']]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_all_regions_hierarchy') {
        $stmt = $pdo->prepare("SELECT * FROM regions WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        $mains = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($mains as &$m) {
            $stmtSub = $pdo->prepare("SELECT * FROM sub_regions WHERE region_id = ? ORDER BY name ASC");
            $stmtSub->execute([$m['id']]);
            $subs = $stmtSub->fetchAll(PDO::FETCH_ASSOC);
            $total_lists = 0;
            foreach ($subs as &$s) {
                $stmtList = $pdo->prepare("SELECT * FROM list_regions WHERE sub_region_id = ? ORDER BY name ASC");
                $stmtList->execute([$s['id']]);
                $lists = $stmtList->fetchAll(PDO::FETCH_ASSOC);
                $s['lists'] = $lists;
                $total_lists += count($lists) > 0 ? count($lists) : 1;
            }
            $m['subs'] = $subs;
            $m['total_lists'] = $total_lists > 0 ? $total_lists : 1;
        }
        sendResponse($mains);
    }

    if ($action === 'get_sub_region_hierarchy' && isset($_GET['main_id'])) {
        $stmtSub = $pdo->prepare("SELECT * FROM sub_regions WHERE region_id = ? ORDER BY name ASC");
        $stmtSub->execute([$_GET['main_id']]);
        $subs = $stmtSub->fetchAll(PDO::FETCH_ASSOC);
        foreach ($subs as &$s) {
            $stmtList = $pdo->prepare("SELECT * FROM list_regions WHERE sub_region_id = ? ORDER BY name ASC");
            $stmtList->execute([$s['id']]);
            $s['lists'] = $stmtList->fetchAll(PDO::FETCH_ASSOC);
        }
        sendResponse($subs);
    }

    if ($action === 'get_sectors') {
        $stmt = $pdo->prepare("SELECT * FROM business_sectors WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_employees') {
        $all = isset($_GET['all']) && $_GET['all'] == 1;
        $sql = "SELECT * FROM employees WHERE company_id = ?";
        if (!$all) {
            $sql .= " AND (job_left = 0 OR job_left IS NULL)";
        }
        $sql .= " ORDER BY name ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_departments') {
        $stmt = $pdo->prepare("SELECT * FROM departments WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_vendors') {
        $subId = $_GET['sub_id'] ?? null;
        $sql = "
            SELECT cl.*, v.contact_person, v.address, v.telephone, v.mobile, v.fax, v.email, v.website, 
                   v.st_reg_no, v.ntn_cnic, v.credit_terms, v.remarks
            FROM coa_list cl
            LEFT JOIN vendors v ON cl.id = v.coa_list_id
            WHERE cl.company_id = ?
        ";
        $params = [$company_id];
        if ($subId) {
            $sql .= " AND cl.sub_id = ?";
            $params[] = $subId;
        } else {
            $sql .= " AND cl.sub_id IN (
                SELECT id FROM coa_sub WHERE main_id IN (
                    SELECT id FROM coa_main WHERE code = '210'
                )
            )";
        }
        $sql .= " ORDER BY cl.code ASC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_all_customers') {
        $subId = $_GET['sub_id'] ?? null;
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN sales_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN further_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN cnic VARCHAR(50) DEFAULT NULL AFTER ntn_cnic"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN buyer_type_id INT DEFAULT NULL AFTER cust_tax_type_id"); } catch(PDOException $e) {}
        $sql = "
            SELECT cl.id, cl.code, cl.name, cl.sub_id,
                   c.contact_person, c.address, c.telephone, c.mobile, c.email,
                   c.st_reg_no, c.ntn_cnic, COALESCE(c.cnic, '') AS cnic, c.credit_terms,
                   c.buyer_type_id,
                   COALESCE(bt.name, '') AS buyer_type_name,
                   COALESCE(bt.buyer_code, '') AS buyer_code,
                   COALESCE(c.sales_tax_rate, bt.sales_tax_rate, 0.00) AS sales_tax_rate,
                   COALESCE(c.further_tax_rate, bt.further_tax_rate, 0.00) AS further_tax_rate
            FROM coa_list cl
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            LEFT JOIN buyer_types bt ON c.buyer_type_id = bt.id
            WHERE cl.company_id = ?
        ";
        $params = [$company_id];
        if ($subId) {
            $sql .= " AND cl.sub_id = ?";
            $params[] = $subId;
        } else {
            $sql .= " AND cl.sub_id IN (
                SELECT id FROM coa_sub WHERE main_id IN (
                    SELECT id FROM coa_main WHERE code = '120'
                )
            )";
        }
        $sql .= " ORDER BY cl.code ASC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_banks' && isset($_GET['sub_id'])) {
        $subId = $_GET['sub_id'];
        $stmt = $pdo->prepare("
            SELECT cl.*, b.bank_name, b.branch, b.account_title, b.account_no, 
                   b.contact_person, b.address, b.telephone, b.mobile, b.fax, 
                   b.email, b.website, b.remarks
            FROM coa_list cl
            LEFT JOIN bank_accounts b ON cl.id = b.coa_list_id
            WHERE cl.sub_id = ? AND cl.company_id = ?
            ORDER BY cl.code ASC
        ");
        $stmt->execute([$subId, $company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_coa_opening_balances' && isset($_GET['fy_id'])) {
        $fyId = $_GET['fy_id'];
        $stmt = $pdo->prepare("
            SELECT cl.id, cl.code, cl.name, cl.sub_id, cs.main_id,
                   COALESCE(ob.debit, 0) as debit, 
                   COALESCE(ob.credit, 0) as credit
            FROM coa_list cl
            LEFT JOIN coa_sub cs ON cl.sub_id = cs.id
            LEFT JOIN coa_opening_balances ob ON cl.id = ob.coa_id AND ob.fy_id = ?
            WHERE cl.company_id = ?
            ORDER BY cl.code ASC
        ");
        $stmt->execute([$fyId, $company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_coa_balance' && isset($_GET['coa_id'])) {
        $coaId = $_GET['coa_id'];
        
        require_once 'account_ledger.php';
        
        try {
            $transactions = fetchLedgerTransactions($pdo, $company_id, $coaId, '', '');
            
            $totalDebit = 0;
            $totalCredit = 0;
            
            foreach ($transactions as $tx) {
                $totalDebit += (float)$tx['debit'];
                $totalCredit += (float)$tx['credit'];
            }
            
            $balance = $totalDebit - $totalCredit;
            file_put_contents('debug_bal.txt', "COA: $coaId, Bal: $balance\n", FILE_APPEND);
            sendResponse(['balance' => $balance]);
        } catch (Throwable $e) {
            file_put_contents('debug_bal.txt', "Error: " . $e->getMessage() . "\n", FILE_APPEND);
            sendResponse(['balance' => 0.00, 'error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
        }
    }

    if ($action === 'get_fys') {
        $stmt = $pdo->prepare("SELECT id, abbreviation FROM financial_years WHERE company_id = ? ORDER BY start_date DESC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'save_coa_main') {
        $status = 'success';
        $newId = null;
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('coa_main', null, null, $id) : null;
        if ($id) {
            $stmt = $pdo->prepare("UPDATE coa_main SET code = ?, name = ?, component = ? WHERE id = ?");
            $stmt->execute([$data['code'], $data['name'], $data['component'], $id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO coa_main (company_id, code, name, component) VALUES (?, ?, ?, ?)");
            $stmt->execute([$company_id, $data['code'], $data['name'], $data['component']]);
            $newId = $pdo->lastInsertId();
        }
        $logId = $id ?: $newId;
        $after_data = fetchRecordData('coa_main', null, null, $logId);
        logActivity('Chart of Accounts Main', $id ? 'UPDATE' : 'INSERT', $logId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => $status, 'id' => $newId]);
    }

    if ($action === 'save_coa_sub') {
        $status = 'success';
        $newId = null;
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('coa_sub', null, null, $id) : null;
        if ($id) {
            $stmt = $pdo->prepare("UPDATE coa_sub SET code = ?, name = ? WHERE id = ?");
            $stmt->execute([$data['code'], $data['name'], $id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO coa_sub (company_id, main_id, code, name) VALUES (?, ?, ?, ?)");
            $stmt->execute([$company_id, $data['main_id'], $data['code'], $data['name']]);
            $newId = $pdo->lastInsertId();
        }
        $logId = $id ?: $newId;
        $after_data = fetchRecordData('coa_sub', null, null, $logId);
        logActivity('Chart of Accounts Sub', $id ? 'UPDATE' : 'INSERT', $logId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => $status, 'id' => $newId]);
    }

    if ($action === 'save_coa_list') {
        $status = 'success';
        $newId = null;
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('coa_list', null, null, $id) : null;
        if ($id) {
            $stmt = $pdo->prepare("UPDATE coa_list SET code = ?, name = ? WHERE id = ?");
            $stmt->execute([$data['code'], $data['name'], $id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name) VALUES (?, ?, ?, ?)");
            $stmt->execute([$company_id, $data['sub_id'], $data['code'], $data['name']]);
            $newId = $pdo->lastInsertId();
        }
        $logId = $id ?: $newId;
        $after_data = fetchRecordData('coa_list', null, null, $logId);
        logActivity('Chart of Accounts List', $id ? 'UPDATE' : 'INSERT', $logId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => $status, 'id' => $newId]);
    }

    if ($action === 'save_customer') {
        $coaId = $data['id'] ?? null;
        $before_data = $coaId ? fetchRecordData('coa_list', 'customers', 'coa_list_id', $coaId) : null;
        
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN list_region_id INT NULL AFTER sub_region_id"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN cust_tax_type_id INT NULL"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN sales_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN further_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN wh_tax_rate DECIMAL(10,2) DEFAULT 0.00"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN cnic VARCHAR(50) DEFAULT NULL AFTER ntn_cnic"); } catch(PDOException $e) {}
        try { $pdo->exec("ALTER TABLE customers ADD COLUMN buyer_type_id INT DEFAULT NULL AFTER cust_tax_type_id"); } catch(PDOException $e) {}
        
        $pdo->beginTransaction();
        try {
            if ($coaId) {
                $stmt = $pdo->prepare("UPDATE coa_list SET code = ?, name = ? WHERE id = ?");
                $stmt->execute([$data['code'], $data['name'], $coaId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name) VALUES (?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['sub_id'], $data['code'], $data['name']]);
                $coaId = $pdo->lastInsertId();
            }

            // Check if customer entry exists
            $stmt = $pdo->prepare("SELECT id FROM customers WHERE coa_list_id = ?");
            $stmt->execute([$coaId]);
            $custExists = $stmt->fetch();

            $salesTaxRate = isset($data['sales_tax_rate']) && $data['sales_tax_rate'] !== '' ? floatval($data['sales_tax_rate']) : 0.00;
            $furtherTaxRate = isset($data['further_tax_rate']) && $data['further_tax_rate'] !== '' ? floatval($data['further_tax_rate']) : 0.00;
            $whTaxRate = isset($data['wh_tax_rate']) && $data['wh_tax_rate'] !== '' ? floatval($data['wh_tax_rate']) : (isset($data['tax_rate']) && $data['tax_rate'] !== '' ? floatval($data['tax_rate']) : 0.00);
            $cnic = isset($data['cnic']) ? trim($data['cnic']) : null;
            $buyerTypeId = !empty($data['buyer_type_id']) ? intval($data['buyer_type_id']) : null;

            if ($custExists) {
                $sql = "UPDATE customers SET 
                        contact_person = ?, address = ?, region_id = ?, sub_region_id = ?, list_region_id = ?, 
                        telephone = ?, mobile = ?, fax = ?, email = ?, website = ?, 
                        st_reg_no = ?, ntn_cnic = ?, cnic = ?, business_sector_id = ?, acc_manager_id = ?, 
                        credit_limit = ?, credit_terms = ?, remarks = ?, cust_tax_type_id = ?, buyer_type_id = ?,
                        sales_tax_rate = ?, further_tax_rate = ?, wh_tax_rate = ?
                        WHERE coa_list_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['contact_person'], $data['address'], $data['region_id'], $data['sub_region_id'], $data['list_region_id'],
                    $data['telephone'], null, $data['fax'], $data['email'], $data['website'],
                    $data['st_reg_no'], $data['ntn_cnic'], $cnic, $data['business_sector_id'], $data['acc_manager_id'],
                    $data['credit_limit'], $data['credit_terms'], $data['remarks'], $data['cust_tax_type_id'], $buyerTypeId,
                    $salesTaxRate, $furtherTaxRate, $whTaxRate, $coaId
                ]);
            } else {
                $sql = "INSERT INTO customers (
                        company_id, coa_list_id, contact_person, address, region_id, sub_region_id, list_region_id,
                        telephone, mobile, fax, email, website, 
                        st_reg_no, ntn_cnic, cnic, business_sector_id, acc_manager_id, 
                        credit_limit, credit_terms, remarks, cust_tax_type_id, buyer_type_id,
                        sales_tax_rate, further_tax_rate, wh_tax_rate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $coaId, $data['contact_person'], $data['address'], $data['region_id'], $data['sub_region_id'], $data['list_region_id'],
                    $data['telephone'], null, $data['fax'], $data['email'], $data['website'],
                    $data['st_reg_no'], $data['ntn_cnic'], $cnic, $data['business_sector_id'], $data['acc_manager_id'],
                    $data['credit_limit'], $data['credit_terms'], $data['remarks'], $data['cust_tax_type_id'], $buyerTypeId,
                    $salesTaxRate, $furtherTaxRate, $whTaxRate
                ]);
            }
            $pdo->commit();
            $after_data = fetchRecordData('coa_list', 'customers', 'coa_list_id', $coaId);
            logActivity('Customers', $data['id'] ? 'UPDATE' : 'INSERT', $coaId, $data['name'] ?? '', $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $coaId]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'save_buyer_type') {
        $id = $data['id'] ?? null;
        $name = trim($data['name'] ?? '');
        $buyer_code = $data['buyer_code'] ?? 'Registered';
        $sales_tax_rate = isset($data['sales_tax_rate']) && $data['sales_tax_rate'] !== '' ? floatval($data['sales_tax_rate']) : 18.00;
        $further_tax_rate = isset($data['further_tax_rate']) && $data['further_tax_rate'] !== '' ? floatval($data['further_tax_rate']) : 0.00;
        $extra_tax_rate = isset($data['extra_tax_rate']) && $data['extra_tax_rate'] !== '' ? floatval($data['extra_tax_rate']) : 0.00;
        $description = $data['description'] ?? null;
        
        if (empty($name)) {
            sendResponse(['status' => 'error', 'message' => 'Buyer Type Name is required'], 400);
        }
        
        if ($id) {
            $stmt = $pdo->prepare("UPDATE buyer_types SET name = ?, buyer_code = ?, sales_tax_rate = ?, further_tax_rate = ?, extra_tax_rate = ?, description = ? WHERE id = ?");
            $stmt->execute([$name, $buyer_code, $sales_tax_rate, $further_tax_rate, $extra_tax_rate, $description, $id]);
            sendResponse(['status' => 'success', 'id' => $id, 'message' => 'Buyer Type updated successfully']);
        } else {
            $stmt = $pdo->prepare("INSERT INTO buyer_types (company_id, name, buyer_code, sales_tax_rate, further_tax_rate, extra_tax_rate, description) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$company_id, $name, $buyer_code, $sales_tax_rate, $further_tax_rate, $extra_tax_rate, $description]);
            $newId = $pdo->lastInsertId();
            sendResponse(['status' => 'success', 'id' => $newId, 'message' => 'Buyer Type created successfully']);
        }
    }

    if ($action === 'delete_buyer_type') {
        $id = $_GET['id'] ?? $data['id'] ?? null;
        if (!$id) sendResponse(['status' => 'error', 'message' => 'ID is required'], 400);

        $chk = $pdo->prepare("SELECT COUNT(*) FROM customers WHERE buyer_type_id = ?");
        $chk->execute([$id]);
        if ($chk->fetchColumn() > 0) {
            sendResponse(['status' => 'error', 'message' => 'Cannot delete: This buyer type is assigned to one or more customers.'], 400);
        }

        $stmt = $pdo->prepare("DELETE FROM buyer_types WHERE id = ?");
        $stmt->execute([$id]);
        sendResponse(['status' => 'success', 'message' => 'Buyer Type deleted successfully']);
    }

    // --- Lookup Saves ---
    
    if ($action === 'save_customer_type_tax') {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS customer_types_tax (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                company_id INT, 
                name VARCHAR(100), 
                tax_rate DECIMAL(10,2) DEFAULT 0.00,
                wht_type VARCHAR(50) DEFAULT NULL
            )");
            $pdo->exec("ALTER TABLE customer_types_tax ADD COLUMN wht_type VARCHAR(50) DEFAULT NULL");
        } catch(PDOException $e) {}
        
        $id = $data['id'] ?? null;
        $wht_type = $data['wht_type'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("UPDATE customer_types_tax SET name = ?, tax_rate = ?, wht_type = ? WHERE id = ?");
            $stmt->execute([$data['name'], $data['tax_rate'], $wht_type, $id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO customer_types_tax (company_id, name, tax_rate, wht_type) VALUES (?, ?, ?, ?)");
            $stmt->execute([$company_id, $data['name'], $data['tax_rate'], $wht_type]);
        }
        sendResponse(['status' => 'success']);
    }

    if ($action === 'delete_customer_type_tax') {
        $id = $_GET['id'] ?? null;
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM customers WHERE cust_tax_type_id = ?");
        $stmt->execute([$id]);
        if ($stmt->fetchColumn() > 0) sendResponse(['status' => 'error', 'message' => 'Type is in use by customers.'], 400);
        
        $stmt = $pdo->prepare("DELETE FROM customer_types_tax WHERE id = ?");
        $stmt->execute([$id]);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'save_region') {
        $newId = $data['id'] ?? null;
        $before_data = $newId ? fetchRecordData('regions', null, null, $newId) : null;
        if ($newId) {
            $pdo->prepare("UPDATE regions SET name = ? WHERE id = ?")->execute([$data['name'], $newId]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO regions (company_id, name) VALUES (?, ?)");
            $stmt->execute([$company_id, $data['name']]);
            $newId = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('regions', null, null, $newId);
        logActivity('Regions', $data['id'] ? 'UPDATE' : 'INSERT', $newId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => 'success', 'id' => $newId]);
    }

    if ($action === 'save_sub_region') {
        $newId = $data['id'] ?? null;
        $before_data = $newId ? fetchRecordData('sub_regions', null, null, $newId) : null;
        if ($newId) {
            $pdo->prepare("UPDATE sub_regions SET name = ? WHERE id = ?")->execute([$data['name'], $newId]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO sub_regions (region_id, name) VALUES (?, ?)");
            $stmt->execute([$data['region_id'], $data['name']]);
            $newId = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('sub_regions', null, null, $newId);
        logActivity('Sub-Regions', $data['id'] ? 'UPDATE' : 'INSERT', $newId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => 'success', 'id' => $newId]);
    }

    if ($action === 'save_list_region') {
        $newId = $data['id'] ?? null;
        $before_data = $newId ? fetchRecordData('list_regions', null, null, $newId) : null;
        if ($newId) {
            $pdo->prepare("UPDATE list_regions SET name = ? WHERE id = ?")->execute([$data['name'], $newId]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO list_regions (sub_region_id, name) VALUES (?, ?)");
            $stmt->execute([$data['sub_region_id'], $data['name']]);
            $newId = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('list_regions', null, null, $newId);
        logActivity('List Regions', $data['id'] ? 'UPDATE' : 'INSERT', $newId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => 'success', 'id' => $newId]);
    }

    if ($action === 'import_regions') {
        $rows = $data['rows'] ?? [];
        if (empty($rows)) {
            sendResponse(['status' => 'error', 'message' => 'No region data provided to import.'], 400);
        }

        $mainCount = 0;
        $subCount = 0;
        $listCount = 0;

        // Cache existing regions, sub_regions, list_regions
        $stmtMain = $pdo->prepare("SELECT id, LOWER(TRIM(name)) as lower_name, name FROM regions WHERE company_id = ?");
        $stmtMain->execute([$company_id]);
        $existingMains = [];
        while ($r = $stmtMain->fetch(PDO::FETCH_ASSOC)) {
            $existingMains[$r['lower_name']] = $r['id'];
        }

        $stmtSub = $pdo->prepare("SELECT id, region_id, LOWER(TRIM(name)) as lower_name, name FROM sub_regions");
        $stmtSub->execute();
        $existingSubs = [];
        while ($r = $stmtSub->fetch(PDO::FETCH_ASSOC)) {
            $existingSubs[$r['region_id'] . '_' . $r['lower_name']] = $r['id'];
        }

        $stmtList = $pdo->prepare("SELECT id, sub_region_id, LOWER(TRIM(name)) as lower_name, name FROM list_regions");
        $stmtList->execute();
        $existingLists = [];
        while ($r = $stmtList->fetch(PDO::FETCH_ASSOC)) {
            $existingLists[$r['sub_region_id'] . '_' . $r['lower_name']] = $r['id'];
        }

        $insMain = $pdo->prepare("INSERT INTO regions (company_id, name) VALUES (?, ?)");
        $insSub = $pdo->prepare("INSERT INTO sub_regions (region_id, name) VALUES (?, ?)");
        $insList = $pdo->prepare("INSERT INTO list_regions (sub_region_id, name) VALUES (?, ?)");

        $pdo->beginTransaction();
        try {
            $currentMainName = '';
            $currentSubName = '';

            foreach ($rows as $row) {
                $mainName = trim($row['main_region'] ?? $row['MAIN REGION'] ?? $row['Main Region'] ?? $row['main'] ?? '');
                $subName = trim($row['sub_region'] ?? $row['SUB REGION'] ?? $row['Sub Region'] ?? $row['sub'] ?? '');
                $listName = trim($row['list_region'] ?? $row['LIST / AREA'] ?? $row['LIST REGION'] ?? $row['List Region'] ?? $row['list'] ?? $row['area'] ?? $row['Area'] ?? '');

                if ($mainName !== '' && $mainName !== '-') {
                    $currentMainName = $mainName;
                    $currentSubName = ($subName !== '' && $subName !== '-') ? $subName : '';
                } else {
                    $mainName = $currentMainName;
                    if ($subName !== '' && $subName !== '-') {
                        $currentSubName = $subName;
                    } else {
                        $subName = $currentSubName;
                    }
                }

                if ($mainName === '' || $mainName === '-') continue;

                $mainLower = strtolower($mainName);
                if (!isset($existingMains[$mainLower])) {
                    $insMain->execute([$company_id, $mainName]);
                    $mainId = $pdo->lastInsertId();
                    $existingMains[$mainLower] = $mainId;
                    $mainCount++;
                } else {
                    $mainId = $existingMains[$mainLower];
                }

                if ($subName !== '' && $subName !== '-') {
                    $subLower = strtolower($subName);
                    $subKey = $mainId . '_' . $subLower;
                    if (!isset($existingSubs[$subKey])) {
                        $insSub->execute([$mainId, $subName]);
                        $subId = $pdo->lastInsertId();
                        $existingSubs[$subKey] = $subId;
                        $subCount++;
                    } else {
                        $subId = $existingSubs[$subKey];
                    }

                    if ($listName !== '' && $listName !== '-') {
                        $listLower = strtolower($listName);
                        $listKey = $subId . '_' . $listLower;
                        if (!isset($existingLists[$listKey])) {
                            $insList->execute([$subId, $listName]);
                            $listId = $pdo->lastInsertId();
                            $existingLists[$listKey] = $listId;
                            $listCount++;
                        }
                    }
                }
            }

            $pdo->commit();
            logActivity('Customer Regions', 'IMPORT', 0, "Bulk imported regions ($mainCount new mains, $subCount new subs, $listCount new lists)", null, ['mains' => $mainCount, 'subs' => $subCount, 'lists' => $listCount]);
            sendResponse([
                'status' => 'success',
                'message' => "Import completed successfully! Added {$mainCount} Main Region(s), {$subCount} Sub Region(s), and {$listCount} List Area(s).",
                'counts' => [
                    'main' => $mainCount,
                    'sub' => $subCount,
                    'list' => $listCount
                ]
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => 'Failed to import regions: ' . $e->getMessage()], 500);
        }
    }

    if ($action === 'cleanup_orphan_regions') {
        try {
            // Find main regions that have 0 sub-regions
            $stmt = $pdo->prepare("
                SELECT r.id, r.name 
                FROM regions r
                LEFT JOIN sub_regions sr ON sr.region_id = r.id
                WHERE (r.company_id = ? OR r.company_id IS NULL OR r.company_id = 0)
                AND sr.id IS NULL
            ");
            $stmt->execute([$company_id]);
            $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Fetch sub and list region names safely
            $subNames = $pdo->query("SELECT LOWER(TRIM(name)) as n FROM sub_regions")->fetchAll(PDO::FETCH_COLUMN);
            $listNames = $pdo->query("SELECT LOWER(TRIM(name)) as n FROM list_regions")->fetchAll(PDO::FETCH_COLUMN);
            $subSet = array_flip(array_filter($subNames));
            $listSet = array_flip(array_filter($listNames));

            $deletedNames = [];
            $delStmt = $pdo->prepare("DELETE FROM regions WHERE id = ?");

            foreach ($candidates as $cand) {
                $cName = strtolower(trim($cand['name']));
                $isDuplicate = isset($subSet[$cName]) || isset($listSet[$cName]);
                $isNumericTest = is_numeric($cName) || preg_match('/^[0-9]+$/', $cName);

                if ($isDuplicate || $isNumericTest) {
                    $delStmt->execute([$cand['id']]);
                    $deletedNames[] = $cand['name'];
                }
            }

            logActivity('Customer Regions', 'CLEANUP', 0, "Cleaned up rogue main regions: " . implode(', ', $deletedNames), null, ['cleaned' => $deletedNames]);
            sendResponse([
                'status' => 'success',
                'message' => count($deletedNames) > 0 
                    ? "Cleaned up " . count($deletedNames) . " rogue region(s): " . implode(', ', $deletedNames)
                    : "No rogue main regions found to clean.",
                'cleaned' => $deletedNames
            ]);
        } catch (Exception $e) {
            sendResponse(['status' => 'error', 'message' => 'Cleanup error: ' . $e->getMessage()], 500);
        }
    }

    if ($action === 'clear_all_regions') {
        try {
            $pdo->beginTransaction();

            // 1. Delete list_regions under company's regions
            $pdo->prepare("
                DELETE lr FROM list_regions lr
                JOIN sub_regions sr ON lr.sub_region_id = sr.id
                JOIN regions r ON sr.region_id = r.id
                WHERE (r.company_id = ? OR r.company_id IS NULL OR r.company_id = 0)
            ")->execute([$company_id]);

            // 2. Delete sub_regions under company's regions
            $pdo->prepare("
                DELETE sr FROM sub_regions sr
                JOIN regions r ON sr.region_id = r.id
                WHERE (r.company_id = ? OR r.company_id IS NULL OR r.company_id = 0)
            ")->execute([$company_id]);

            // 3. Delete regions
            $pdo->prepare("
                DELETE FROM regions 
                WHERE (company_id = ? OR company_id IS NULL OR company_id = 0)
            ")->execute([$company_id]);

            $pdo->commit();
            logActivity('Customer Regions', 'CLEAR_ALL', 0, "Cleared all customer regions for company $company_id", null, null);
            sendResponse(['status' => 'success', 'message' => 'All customer regions cleared successfully.']);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => 'Failed to clear regions: ' . $e->getMessage()], 500);
        }
    }

    if ($action === 'save_sector') {
        $newId = $data['id'] ?? null;
        $before_data = $newId ? fetchRecordData('business_sectors', null, null, $newId) : null;
        if ($newId) {
            $pdo->prepare("UPDATE business_sectors SET name = ? WHERE id = ?")->execute([$data['name'], $newId]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO business_sectors (company_id, name) VALUES (?, ?)");
            $stmt->execute([$company_id, $data['name']]);
            $newId = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('business_sectors', null, null, $newId);
        logActivity('Business Sectors', $data['id'] ? 'UPDATE' : 'INSERT', $newId, $data['name'] ?? '', $before_data, $after_data);
        sendResponse(['status' => 'success', 'id' => $newId]);
    }

    if ($action === 'save_employee') {
        try {
            $status = 'success';
            $newId = null;
            $id = $data['id'] ?? null;
            
            // Safe coalesce for strings
            $name = $data['name'] ?? '';
            $father_name = $data['father_name'] ?? '';
            $address = $data['address'] ?? '';
            $telephone = $data['telephone'] ?? '';
            $email = $data['email'] ?? '';
            $nic_no = $data['nic_no'] ?? '';
            $designation = $data['designation'] ?? '';
            $remarks = $data['remarks'] ?? '';
            $reference = $data['reference'] ?? '';
            
            // Dates to null
            $dob = empty($data['dob']) ? null : $data['dob'];
            $joining_date = empty($data['joining_date']) ? null : $data['joining_date'];
            $leaving_date = empty($data['leaving_date']) ? null : $data['leaving_date'];
            
            // Integers/Decimals
            $department_id = empty($data['department_id']) ? 0 : (int)$data['department_id'];
            $salary = empty($data['salary']) ? 0 : (float)$data['salary'];
            $job_left = isset($data['job_left']) ? (int)$data['job_left'] : 0;
            
            $before_data = $id ? fetchRecordData('employees', null, null, $id) : null;
            if ($id) {
                $sql = "UPDATE employees SET 
                        name = ?, father_name = ?, address = ?, telephone = ?, email = ?, nic_no = ?,
                        dob = ?, joining_date = ?, salary = ?, designation = ?, department_id = ?,
                        remarks = ?, reference = ?, job_left = ?, leaving_date = ?
                        WHERE id = ? AND company_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $name, $father_name, $address, $telephone, $email, $nic_no,
                    $dob, $joining_date, $salary, $designation, $department_id,
                    $remarks, $reference, $job_left, $leaving_date,
                    $id, $company_id
                ]);
                $newId = $id;
            } else {
                $sql = "INSERT INTO employees (
                        company_id, name, father_name, address, telephone, email, nic_no, 
                        dob, joining_date, salary, designation, department_id, 
                        remarks, reference, job_left, leaving_date
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $name, $father_name, $address, $telephone, $email, $nic_no,
                    $dob, $joining_date, $salary, $designation, $department_id,
                    $remarks, $reference, $job_left, $leaving_date
                ]);
                $newId = $pdo->lastInsertId();
            }
            $after_data = fetchRecordData('employees', null, null, $newId);
            logActivity('Employees', $id ? 'UPDATE' : 'INSERT', $newId, $name, $before_data, $after_data);
            sendResponse(['status' => $status, 'id' => $newId]);
        } catch (Exception $e) {
            $err = $e->getMessage();
            file_put_contents('debug_employee.txt', date('Y-m-d H:i:s') . " - Error: " . $err . "\n", FILE_APPEND);
            sendResponse(['error' => $err], 500);
        }
    }
    if ($action === 'save_vendor') {
        $coaId = $data['id'] ?? null;
        $before_data = $coaId ? fetchRecordData('coa_list', 'vendors', 'coa_list_id', $coaId) : null;
        $pdo->beginTransaction();
        try {
            if ($coaId) {
                $stmt = $pdo->prepare("UPDATE coa_list SET code = ?, name = ? WHERE id = ?");
                $stmt->execute([$data['code'], $data['name'], $coaId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name) VALUES (?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['sub_id'], $data['code'], $data['name']]);
                $coaId = $pdo->lastInsertId();
            }

            // Check if vendor entry exists
            $stmt = $pdo->prepare("SELECT id FROM vendors WHERE coa_list_id = ?");
            $stmt->execute([$coaId]);
            $vendExists = $stmt->fetch();

            if ($vendExists) {
                $sql = "UPDATE vendors SET 
                        contact_person = ?, address = ?, telephone = ?, mobile = ?, fax = ?, 
                        email = ?, website = ?, st_reg_no = ?, ntn_cnic = ?, 
                        credit_terms = ?, remarks = ?
                        WHERE coa_list_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['contact_person'], $data['address'], $data['telephone'], $data['mobile'], $data['fax'],
                    $data['email'], $data['website'], $data['st_reg_no'], $data['ntn_cnic'],
                    $data['credit_terms'], $data['remarks'], $coaId
                ]);
            } else {
                $sql = "INSERT INTO vendors (
                        company_id, coa_list_id, contact_person, address, telephone, mobile, 
                        fax, email, website, st_reg_no, ntn_cnic, credit_terms, remarks
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $coaId, $data['contact_person'], $data['address'], $data['telephone'], $data['mobile'],
                    $data['fax'], $data['email'], $data['website'], $data['st_reg_no'], $data['ntn_cnic'],
                    $data['credit_terms'], $data['remarks']
                ]);
            }
            $pdo->commit();
            $after_data = fetchRecordData('coa_list', 'vendors', 'coa_list_id', $coaId);
            logActivity('Vendors', $data['id'] ? 'UPDATE' : 'INSERT', $coaId, $data['name'] ?? '', $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $coaId]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    if ($action === 'save_bank') {
        $coaId = $data['id'] ?? null;
        $before_data = $coaId ? fetchRecordData('coa_list', 'bank_accounts', 'coa_list_id', $coaId) : null;
        $pdo->beginTransaction();
        try {
            if ($coaId) {
                $stmt = $pdo->prepare("UPDATE coa_list SET code = ?, name = ? WHERE id = ?");
                $stmt->execute([$data['code'], $data['name'], $coaId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO coa_list (company_id, sub_id, code, name) VALUES (?, ?, ?, ?)");
                $stmt->execute([$company_id, $data['sub_id'], $data['code'], $data['name']]);
                $coaId = $pdo->lastInsertId();
            }

            // Check if bank entry exists
            $stmt = $pdo->prepare("SELECT id FROM bank_accounts WHERE coa_list_id = ?");
            $stmt->execute([$coaId]);
            $bankExists = $stmt->fetch();

            if ($bankExists) {
                $sql = "UPDATE bank_accounts SET 
                        bank_name = ?, branch = ?, account_title = ?, account_no = ?, 
                        contact_person = ?, address = ?, telephone = ?, mobile = ?, fax = ?, 
                        email = ?, website = ?, remarks = ?
                        WHERE coa_list_id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $data['bank_name'], $data['branch'], $data['account_title'], $data['account_no'],
                    $data['contact_person'], $data['address'], $data['telephone'], $data['mobile'], $data['fax'],
                    $data['email'], $data['website'], $data['remarks'], $coaId
                ]);
            } else {
                $sql = "INSERT INTO bank_accounts (
                        company_id, coa_list_id, bank_name, branch, account_title, account_no, 
                        contact_person, address, telephone, mobile, fax, email, website, remarks
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    $company_id, $coaId, $data['bank_name'], $data['branch'], $data['account_title'], $data['account_no'],
                    $data['contact_person'], $data['address'], $data['telephone'], $data['mobile'], $data['fax'],
                    $data['email'], $data['website'], $data['remarks']
                ]);
            }
            $pdo->commit();
            $after_data = fetchRecordData('coa_list', 'bank_accounts', 'coa_list_id', $coaId);
            logActivity('Bank Accounts', $data['id'] ? 'UPDATE' : 'INSERT', $coaId, $data['name'] ?? '', $before_data, $after_data);
            sendResponse(['status' => 'success', 'id' => $coaId]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendResponse(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE' || $_SERVER['REQUEST_METHOD'] === 'POST') {
    $protected_coa_codes = [
        '100', '10001', '10001001',
        '110', '11001', '11001001',
        '120', '12001', '12001001', '12002',
        '130', '13001', '13001001',
        '140', '14001', '14001001', '14002', '14003',
        '150', '15001',
        '170', '17001',
        '180', '18001',
        '210', '21001', '21001001', '21002',
        '220', '22001', '22001001', '22001002', '22001003', '22001004', '22002', '22003',
        '230', '23001',
        '240', '24001',
        '300', '30001',
        '310', '31001',
        '320', '32001', '32001001',
        '400', '40001', '40001001', '40001002', '40001003',
        '500', '50001', '50001001', '50001002', '50001003', '50001004', '50001005', '50001006', '50001007', '50001008', '50002', '50002001', '50003', '50003001',
        '600', '60001', '60001001', '60001002',
        '650', '65001',
        '670', '67001',
        '680', '68001',
        '700', '70001',
        '800', '80001'
    ];

    if ($action === 'delete_coa_main' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('coa_main', null, null, $id);
        if ($before_data && isset($before_data['header']['code']) && in_array(strval($before_data['header']['code']), $protected_coa_codes)) {
            sendResponse(['status' => 'error', 'message' => 'Default system account cannot be deleted.'], 403);
        }
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM coa_main WHERE id = ?")->execute([$id]);
        logActivity('Chart of Accounts Main', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_coa_sub' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('coa_sub', null, null, $id);
        if ($before_data && isset($before_data['header']['code']) && in_array(strval($before_data['header']['code']), $protected_coa_codes)) {
            sendResponse(['status' => 'error', 'message' => 'Default system account cannot be deleted.'], 403);
        }
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM coa_sub WHERE id = ?")->execute([$id]);
        logActivity('Chart of Accounts Sub', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_coa_list' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('coa_list', null, null, $id);
        if ($before_data && isset($before_data['header']['code']) && in_array(strval($before_data['header']['code']), $protected_coa_codes)) {
            sendResponse(['status' => 'error', 'message' => 'Default system account cannot be deleted.'], 403);
        }
        
        // Check if it is customer, vendor, or bank account
        $isCust = $pdo->prepare("SELECT id FROM customers WHERE coa_list_id = ?");
        $isCust->execute([$id]);
        $isVend = $pdo->prepare("SELECT id FROM vendors WHERE coa_list_id = ?");
        $isVend->execute([$id]);
        $isBank = $pdo->prepare("SELECT id FROM bank_accounts WHERE coa_list_id = ?");
        $isBank->execute([$id]);
        
        $module = 'Chart of Accounts List';
        if ($isCust->fetch()) {
            $module = 'Customers';
            $before_data = fetchRecordData('coa_list', 'customers', 'coa_list_id', $id);
        } elseif ($isVend->fetch()) {
            $module = 'Vendors';
            $before_data = fetchRecordData('coa_list', 'vendors', 'coa_list_id', $id);
        } elseif ($isBank->fetch()) {
            $module = 'Bank Accounts';
            $before_data = fetchRecordData('coa_list', 'bank_accounts', 'coa_list_id', $id);
        }
        $record_title = $before_data['header']['name'] ?? '';
        
        // Prevent deletion if used in transactions
        $is_used = false;
        $tables_to_check = [
            ['table' => 'purchase_invoices', 'col' => 'vendor_coa_id'],
            ['table' => 'sale_invoices', 'col' => 'customer_coa_id'],
            ['table' => 'general_journal_voucher_items', 'col' => 'coa_id'],
            ['table' => 'cash_receipts', 'col' => 'received_from_coa_id'],
            ['table' => 'cash_receipts', 'col' => 'cash_account_coa_id'],
            ['table' => 'cash_payments', 'col' => 'paid_to_coa_id'],
            ['table' => 'cash_payments', 'col' => 'cash_account_coa_id'],
            ['table' => 'bank_receipts', 'col' => 'received_from_coa_id'],
            ['table' => 'bank_receipts', 'col' => 'bank_account_coa_id'],
            ['table' => 'bank_payments', 'col' => 'paid_to_coa_id'],
            ['table' => 'bank_payments', 'col' => 'cash_account_coa_id'],
            ['table' => 'purchase_returns', 'col' => 'vendor_coa_id'],
            ['table' => 'sale_returns', 'col' => 'customer_coa_id']
        ];
        foreach ($tables_to_check as $tc) {
            try {
                $stmt = $pdo->prepare("SELECT 1 FROM {$tc['table']} WHERE {$tc['col']} = ? LIMIT 1");
                $stmt->execute([$id]);
                if ($stmt->fetchColumn()) { $is_used = true; break; }
            } catch(Exception $e) {}
        }
        
        if ($is_used) {
            sendResponse(['status' => 'error', 'message' => 'Cannot delete this account/customer/vendor because it is already used in invoices or vouchers.'], 403);
        }

        $pdo->prepare("DELETE FROM coa_list WHERE id = ?")->execute([$id]);
        logActivity($module, 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_region' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('regions', null, null, $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM regions WHERE id = ?")->execute([$id]);
        logActivity('Regions', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_sub_region' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('sub_regions', null, null, $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM sub_regions WHERE id = ?")->execute([$id]);
        logActivity('Sub-Regions', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_list_region' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('list_regions', null, null, $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM list_regions WHERE id = ?")->execute([$id]);
        logActivity('List Regions', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_sector' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('business_sectors', null, null, $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM business_sectors WHERE id = ?")->execute([$id]);
        logActivity('Business Sectors', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'delete_employee' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('employees', null, null, $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM employees WHERE id = ? AND company_id = ?")->execute([$id, $company_id]);
        logActivity('Employees', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'save_coa_opening_balances') {
        if (!isset($data['fy_id']) || !isset($data['balances'])) {
            sendResponse(['error' => 'Missing data'], 400);
        }
        $fyId = $data['fy_id'];

        // Remove all existing entries for this FY to handle zeroed-out accounts cleanly
        $pdo->prepare("DELETE FROM coa_opening_balances WHERE company_id = ? AND fy_id = ?")->execute([$company_id, $fyId]);

        $insStmt = $pdo->prepare("INSERT INTO coa_opening_balances (company_id, coa_id, fy_id, debit, credit) VALUES (?, ?, ?, ?, ?)");
        
        foreach ($data['balances'] as $row) {
            $debit = isset($row['debit']) ? (float)$row['debit'] : 0;
            $credit = isset($row['credit']) ? (float)$row['credit'] : 0;
            
            // Insert new entry if balance is greater than zero
            if ($debit > 0 || $credit > 0) {
                $insStmt->execute([$company_id, $row['coa_id'], $fyId, $debit, $credit]);
            }
        }
        logActivity('Chart of Accounts Opening Balances', 'UPDATE', $fyId, 'FY ID: ' . $fyId, null, $data['balances']);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'delete_all_coa_opening_balances') {
        if (!isset($data['fy_id'])) {
            sendResponse(['error' => 'Missing fy_id'], 400);
        }
        $fyId = $data['fy_id'];
        $stmt = $pdo->prepare("DELETE FROM coa_opening_balances WHERE company_id = ? AND fy_id = ?");
        $stmt->execute([$company_id, $fyId]);
        logActivity('Chart of Accounts Opening Balances', 'DELETE_ALL', $fyId, 'FY ID: ' . $fyId, null, null);
        sendResponse(['status' => 'success']);
    }

    if ($action === 'import_coa_opening_balances' && isset($data['fy_id'])) {
        $currentFyId = $data['fy_id'];
        $prevFyId = $data['from_fy_id'] ?? null;
        
        if (!$prevFyId) {
            // Fallback to auto-detecting previous FY if not provided
            $stmt = $pdo->prepare("SELECT id FROM financial_years WHERE company_id = ? AND id < ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$company_id, $currentFyId]);
            $prevFy = $stmt->fetch();
            if ($prevFy) $prevFyId = $prevFy['id'];
        }
        
        if (!$prevFyId) {
            sendResponse(['error' => 'No financial year found to import from.'], 404);
        }
        
        // Import logic: Duplicate chosen year's opening balances
        $stmt = $pdo->prepare("
            INSERT INTO coa_opening_balances (company_id, coa_id, fy_id, debit, credit)
            SELECT company_id, coa_id, ?, debit, credit
            FROM coa_opening_balances
            WHERE fy_id = ? AND company_id = ?
            ON DUPLICATE KEY UPDATE debit = VALUES(debit), credit = VALUES(credit)
        ");
        $stmt->execute([$currentFyId, $prevFyId, $company_id]);
        logActivity('Chart of Accounts Opening Balances', 'INSERT', $currentFyId, 'Imported to FY ID: ' . $currentFyId . ' from FY ID: ' . $prevFyId, null, null);
        sendResponse(['status' => 'success', 'imported_from' => $prevFyId]);
    }

    if ($action === 'delete_vendor' && isset($_GET['id'])) {
        $id = $_GET['id'];
        
        // Prevent deletion if used in transactions
        $is_used = false;
        $tables_to_check = [
            ['table' => 'purchase_invoices', 'col' => 'vendor_coa_id'],
            ['table' => 'general_journal_voucher_items', 'col' => 'coa_id'],
            ['table' => 'cash_payments', 'col' => 'paid_to_coa_id'],
            ['table' => 'bank_payments', 'col' => 'paid_to_coa_id'],
            ['table' => 'purchase_returns', 'col' => 'vendor_coa_id']
        ];
        foreach ($tables_to_check as $tc) {
            try {
                $stmt = $pdo->prepare("SELECT 1 FROM {$tc['table']} WHERE {$tc['col']} = ? LIMIT 1");
                $stmt->execute([$id]);
                if ($stmt->fetchColumn()) { $is_used = true; break; }
            } catch(Exception $e) {}
        }
        
        if ($is_used) {
            sendResponse(['status' => 'error', 'message' => 'Cannot delete this vendor because it is already used in invoices or vouchers.'], 403);
        }

        $before_data = fetchRecordData('coa_list', 'vendors', 'coa_list_id', $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM coa_list WHERE id = ? AND company_id = ?")->execute([$id, $company_id]);
        logActivity('Vendors', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
    if ($action === 'delete_bank' && isset($_GET['id'])) {
        $id = $_GET['id'];
        
        // Prevent deletion if used in transactions
        $is_used = false;
        $tables_to_check = [
            ['table' => 'general_journal_voucher_items', 'col' => 'coa_id'],
            ['table' => 'bank_receipts', 'col' => 'bank_account_coa_id'],
            ['table' => 'bank_payments', 'col' => 'cash_account_coa_id']
        ];
        foreach ($tables_to_check as $tc) {
            try {
                $stmt = $pdo->prepare("SELECT 1 FROM {$tc['table']} WHERE {$tc['col']} = ? LIMIT 1");
                $stmt->execute([$id]);
                if ($stmt->fetchColumn()) { $is_used = true; break; }
            } catch(Exception $e) {}
        }
        
        if ($is_used) {
            sendResponse(['status' => 'error', 'message' => 'Cannot delete this bank account because it is already used in vouchers.'], 403);
        }

        $before_data = fetchRecordData('coa_list', 'bank_accounts', 'coa_list_id', $id);
        $record_title = $before_data['header']['name'] ?? '';
        $pdo->prepare("DELETE FROM coa_list WHERE id = ? AND company_id = ?")->execute([$id, $company_id]);
        logActivity('Bank Accounts', 'DELETE', $id, $record_title, $before_data, null);
        sendResponse(['status' => 'success']);
    }
}
?>

