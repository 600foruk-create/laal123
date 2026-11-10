<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_aging_data') {
    $customerId = $_GET['customer_id'] ?? '';
    $employeeId = $_GET['employee_id'] ?? '';
    $gapMode = $_GET['gap_mode'] ?? '10';

    $siWhere = "si.company_id = ? AND si.is_cancelled = 0";
    $params = [$company_id];

    if ($customerId !== '') {
        $siWhere .= " AND si.customer_coa_id = ?";
        $params[] = $customerId;
    }

    if ($employeeId !== '') {
        // Find customers linked to this employee
        // We will just do a subquery or join, let's use customers table in subquery
        $siWhere .= " AND si.customer_coa_id IN (SELECT coa_list_id FROM customers WHERE sales_officer_id = ?)";
        $params[] = $employeeId;
    }

    $sql = "SELECT si.id, si.serial_no, si.invoice_date, si.customer_coa_id, c.code as customer_code, c.name as customer_name, 
                   si.net_total as net_amount, 
                   si.additional_discount as discount_amount, 
                   COALESCE(inv_sums.sales_tax, 0) as sales_tax_amount, 
                   COALESCE(inv_sums.further_tax, 0) as further_tax_amount
            FROM sale_invoices si
            LEFT JOIN coa_list c ON si.customer_coa_id = c.id
            LEFT JOIN (
                SELECT invoice_id, SUM(sales_tax_amount) as sales_tax, SUM(further_tax_amount) as further_tax
                FROM sale_invoice_items
                GROUP BY invoice_id
            ) as inv_sums ON si.id = inv_sums.invoice_id
            WHERE $siWhere
            ORDER BY c.code ASC, si.invoice_date ASC, si.id ASC";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $agingData = [];

        foreach ($invoices as $inv) {
            $invId = $inv['id'];
            $invNo = $inv['serial_no'];
            $customerCoaId = $inv['customer_coa_id'];

            $invoice_amount = (float)$inv['net_amount'];
            $amt_received = 0;
            $sale_returns = 0;
            $wh_tax = 0;
            $adv_adj = 0;
            $discount = (float)$inv['discount_amount'];

            // Fetch Returns
            $stmtRet = $pdo->prepare("SELECT SUM(net_total) as total_ret FROM sale_returns WHERE company_id = ? AND sale_invoice_no = ? AND customer_coa_id = ? AND is_cancelled = 0 AND is_posted = 1");
            $stmtRet->execute([$company_id, $invNo, $customerCoaId]);
            $ret = $stmtRet->fetch(PDO::FETCH_ASSOC);
            if ($ret && $ret['total_ret']) $sale_returns = (float)$ret['total_ret'];

            // Fetch CRV (Cash Receipts)
            $stmtCrv = $pdo->prepare("SELECT SUM(cri.received_amount) as received, SUM(cri.wht_amount) as wht, SUM(cri.advance_adjusted) as adv, SUM(cri.discount_given) as disc 
                                      FROM cash_receipt_items cri 
                                      JOIN cash_receipts cr ON cri.receipt_id = cr.id 
                                      WHERE cr.company_id = ? AND cr.receipt_type = 'Customer' AND cr.received_from_coa_id = ? AND cri.invoice_no = ?");
            $stmtCrv->execute([$company_id, $customerCoaId, $invNo]);
            $crv = $stmtCrv->fetch(PDO::FETCH_ASSOC);
            if ($crv) {
                $amt_received += (float)$crv['received'];
                $wh_tax += (float)$crv['wht'];
                $adv_adj += (float)$crv['adv'];
                $discount += (float)$crv['disc'];
            }

            // Fetch BRV (Bank Receipts)
            $stmtBrv = $pdo->prepare("SELECT SUM(bri.received_amount) as received, SUM(bri.wht_amount) as wht, SUM(bri.advance_adjusted) as adv, SUM(bri.discount_given) as disc 
                                      FROM bank_receipt_items bri 
                                      JOIN bank_receipts br ON bri.receipt_id = br.id 
                                      WHERE br.company_id = ? AND br.receipt_type = 'Customer' AND br.received_from_coa_id = ? AND bri.invoice_no = ?");
            $stmtBrv->execute([$company_id, $customerCoaId, $invNo]);
            $brv = $stmtBrv->fetch(PDO::FETCH_ASSOC);
            if ($brv) {
                $amt_received += (float)$brv['received'];
                $wh_tax += (float)$brv['wht'];
                $adv_adj += (float)$brv['adv'];
                $discount += (float)$brv['disc'];
            }

            $balance_amt = $invoice_amount - $amt_received - $sale_returns - $wh_tax - $adv_adj - $discount;

            // Only include invoices with a positive balance (unpaid)
            if ($balance_amt > 0.01) {
                // Calculate days difference
                $invDate = new DateTime($inv['invoice_date']);
                $today = new DateTime();
                $diff = $today->diff($invDate);
                $days = $diff->days;
                if ($invDate > $today) {
                    $days = 0; // If future date somehow, treat as 0
                }
                
                $gap1 = 0; $gap2 = 0; $gap3 = 0; $gap4 = 0;
                
                if ($gapMode === "10") {
                    // 0-10, 11-20, 21-30, Above 30
                    if ($days <= 10) { $gap1 = $balance_amt; }
                    elseif ($days <= 20) { $gap2 = $balance_amt; }
                    elseif ($days <= 30) { $gap3 = $balance_amt; }
                    else { $gap4 = $balance_amt; }
                } else {
                    // 0-30, 31-60, 61-90, Above 90
                    if ($days <= 30) { $gap1 = $balance_amt; }
                    elseif ($days <= 60) { $gap2 = $balance_amt; }
                    elseif ($days <= 90) { $gap3 = $balance_amt; }
                    else { $gap4 = $balance_amt; }
                }
                
                $agingData[] = [
                    'account_code' => $inv['customer_code'],
                    'customer_name' => $inv['customer_name'],
                    'invoice_no' => $invNo,
                    'invoice_date' => $inv['invoice_date'],
                    'days' => $days,
                    'invoice_amount' => $invoice_amount,
                    'gap1' => $gap1,
                    'gap2' => $gap2,
                    'gap3' => $gap3,
                    'gap4' => $gap4,
                    'balance_amt' => $balance_amt
                ];
            }
        }

        echo json_encode($agingData);
    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}
?>
