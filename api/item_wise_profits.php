<?php
require 'db_config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

if ($action === 'get_lookups') {
    $company_id = $_GET['company_id'] ?? 1;
    
    try {
        $stmtCust = $pdo->prepare("
            SELECT c.coa_list_id as id, cl.code, cl.name 
            FROM customers c 
            JOIN coa_list cl ON c.coa_list_id = cl.id 
            WHERE cl.company_id = ?
            ORDER BY cl.code
        ");
        $stmtCust->execute([(int)$company_id]);
        $customers = $stmtCust->fetchAll(PDO::FETCH_ASSOC);

        $stmtBrands = $pdo->prepare("SELECT id, name FROM inv_brands WHERE company_id = ? ORDER BY name");
        $stmtBrands->execute([(int)$company_id]);
        $brands = $stmtBrands->fetchAll(PDO::FETCH_ASSOC);

        $stmtEmp = $pdo->prepare("SELECT id, name FROM employees WHERE company_id = ? ORDER BY name");
        $stmtEmp->execute([(int)$company_id]);
        $employees = $stmtEmp->fetchAll(PDO::FETCH_ASSOC);
        
        $stmtMains = $pdo->prepare("SELECT id, code, name FROM inv_main_categories WHERE company_id = ? ORDER BY code");
        $stmtMains->execute([(int)$company_id]);
        $mains = $stmtMains->fetchAll(PDO::FETCH_ASSOC);
        
        $stmtSubs = $pdo->prepare("SELECT id, main_id, code, name FROM inv_sub_categories WHERE company_id = ? ORDER BY code");
        $stmtSubs->execute([(int)$company_id]);
        $subs = $stmtSubs->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'customers' => $customers,
            'brands' => $brands,
            'employees' => $employees,
            'mains' => $mains,
            'subs' => $subs
        ]);
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'get_profits') {
    $company_id = $_GET['company_id'] ?? 1;
    
    $type = $_GET['print_type'] ?? 'all'; // all, category
    $cat_id = $_GET['cat_id'] ?? null;
    $sub_cat_id = $_GET['sub_cat_id'] ?? null;
    
    $customer_id = $_GET['customer_id'] ?? null;
    $brand_id = $_GET['brand_id'] ?? null;
    $employee_id = $_GET['employee_id'] ?? null;
    
    $from_date = $_GET['from_date'] ?? null;
    $to_date = $_GET['to_date'] ?? null;

    try {
        $sql = "
            SELECT 
                itm.id as item_id,
                itm.code as item_code,
                itm.hs_code as hs_code,
                itm.name as item_name,
                MAX(sii.unit) as unit,
                SUM(COALESCE(sii.quantity, 0)) as quantity,
                SUM(COALESCE(sii.net_amount, 0)) as sales_value,
                MAX(COALESCE(itm.valuation_cost, itm.purchase_price, 0)) as unit_cost
            FROM sale_invoices si
            INNER JOIN sale_invoice_items sii ON si.id = sii.invoice_id
            INNER JOIN inv_items itm ON sii.item_coa_id = itm.id
            LEFT JOIN customers c ON c.coa_list_id = si.customer_coa_id
            WHERE si.company_id = ? AND si.is_cancelled = 0
        ";
        $params = [$company_id];

        if ($type === 'category' && $cat_id) {
            $sql .= " AND itm.sub_id IN (SELECT id FROM inv_sub_categories WHERE main_id = ?)";
            $params[] = $cat_id;
            
            if ($sub_cat_id) {
                $sql .= " AND itm.sub_id = ?";
                $params[] = $sub_cat_id;
            }
        }
        
        if ($customer_id) {
            $sql .= " AND si.customer_coa_id = ?";
            $params[] = $customer_id;
        }
        
        if ($brand_id) {
            $sql .= " AND itm.brand_id = ?";
            $params[] = $brand_id;
        }
        
        if ($employee_id) {
            $sql .= " AND c.sales_officer_id = ?";
            $params[] = $employee_id;
        }
        
        if ($from_date && $to_date) {
            $sql .= " AND si.invoice_date BETWEEN ? AND ?";
            $params[] = $from_date;
            $params[] = $to_date;
        }

        $sql .= " GROUP BY itm.id, itm.code, itm.hs_code, itm.name ORDER BY itm.code";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $final_data = [];
        $total_cost_grand = 0;
        $total_sales_grand = 0;
        $total_profit_grand = 0;

        foreach ($results as $row) {
            $qty = (float)$row['quantity'];
            $unit_cost = (float)$row['unit_cost'];
            $sales = (float)$row['sales_value'];
            
            if ($qty == 0 && $sales == 0) continue;

            $total_cost = $qty * $unit_cost;
            $profit = $sales - $total_cost;
            
            $total_cost_grand += $total_cost;
            $total_sales_grand += $sales;
            $total_profit_grand += $profit;

            $final_data[] = [
                'item_code' => $row['item_code'],
                'hs_code' => $row['hs_code'],
                'item_name' => $row['item_name'],
                'quantity' => $qty,
                'unit' => $row['unit'],
                'unit_cost' => $unit_cost,
                'total_cost' => $total_cost,
                'sales_value' => $sales,
                'profit' => $profit
            ];
        }

        echo json_encode([
            'data' => $final_data,
            'totals' => [
                'total_cost' => $total_cost_grand,
                'sales_value' => $total_sales_grand,
                'profit' => $total_profit_grand
            ]
        ]);
        
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
}
