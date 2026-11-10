<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_report_data') {
    $vendorTypeId = $_GET['vendor_type_id'] ?? '';
    $vendorId = $_GET['vendor_id'] ?? '';
    $employeeId = $_GET['employee_id'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';

    // Step 1: Base Purchase Invoices Query
    $piWhere = "pi.company_id = ?";
    $params = [$company_id];

    if ($vendorId !== '') {
        $piWhere .= " AND pi.vendor_coa_id = ?";
        $params[] = $vendorId;
    } elseif ($vendorTypeId !== '' && $vendorTypeId !== 'all') {
        $piWhere .= " AND c.sub_id = ?";
        $params[] = $vendorTypeId;
    }

    if ($employeeId !== '') {
        $piWhere .= " AND pi.employee_ref = ?";
        $params[] = $employeeId;
    }

    if ($dateFrom !== '') {
        $piWhere .= " AND pi.invoice_date >= ?";
        $params[] = $dateFrom;
    }
    if ($dateTo !== '') {
        $piWhere .= " AND pi.invoice_date <= ?";
        $params[] = $dateTo;
    }

    $sql = "SELECT pi.id, pi.serial_no, pi.vendor_coa_id, c.name as vendor_name, 
                   pi.employee_ref, e.name as employee_name,
                   pi.net_total as net_amount, 
                   pi.additional_discount as discount_amount, 
                   COALESCE(inv_sums.sales_tax, 0) as sales_tax_amount, 
                   COALESCE(inv_sums.further_tax, 0) as further_tax_amount
            FROM purchase_invoices pi
            LEFT JOIN coa_list c ON pi.vendor_coa_id = c.id
            LEFT JOIN employees e ON pi.employee_ref = e.id
            LEFT JOIN (
                SELECT invoice_id, SUM(sales_tax_amount) as sales_tax, SUM(further_tax_amount) as further_tax
                FROM purchase_invoice_items
                GROUP BY invoice_id
            ) as inv_sums ON pi.id = inv_sums.invoice_id
            WHERE $piWhere";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $vendorsData = []; // grouped by vendor_coa_id + employee_ref

        foreach ($invoices as $inv) {
            $invId = $inv['id'];
            $invNo = $inv['serial_no'];
            $vendorCoaId = $inv['vendor_coa_id'];
            
            $groupKey = $vendorCoaId;

            if (!isset($vendorsData[$groupKey])) {
                $vendorsData[$groupKey] = [
                    'vendor_name' => $inv['vendor_name'],
                    'employee_name' => $inv['employee_name'],
                    'total_purchase' => 0,
                    'amt_paid' => 0,
                    'pur_returns' => 0,
                    'wh_tax' => 0,
                    'flood_tax' => 0,
                    'sales_tax' => 0,
                    'adv_adj' => 0,
                    'discount' => 0,
                    'total_realized' => 0,
                    'balance_amt' => 0
                ];
            }

            // Accumulate Invoice Data
            $vendorsData[$groupKey]['total_purchase'] += (float)$inv['net_amount'];
            $vendorsData[$groupKey]['flood_tax'] += (float)$inv['further_tax_amount'];
            $vendorsData[$groupKey]['sales_tax'] += (float)$inv['sales_tax_amount'];
            $vendorsData[$groupKey]['discount'] += (float)$inv['discount_amount'];

            // Fetch Returns against this invoice
            $stmtRet = $pdo->prepare("SELECT net_total FROM purchase_returns WHERE company_id = ? AND purchase_no = ? AND vendor_coa_id = ? AND is_cancelled = 0 AND is_posted = 1");
            $stmtRet->execute([$company_id, $invNo, $vendorCoaId]);
            $returns = $stmtRet->fetchAll(PDO::FETCH_ASSOC);
            foreach ($returns as $ret) {
                $vendorsData[$groupKey]['pur_returns'] += (float)$ret['net_total'];
            }

            // Fetch CPV against this invoice
            $stmtCpv = $pdo->prepare("SELECT cpi.paid_amount, cpi.wht_amount, cpi.gst_amount, cpi.advance_adjusted, cpi.discount_received 
                                      FROM cash_payment_items cpi 
                                      JOIN cash_payments cp ON cpi.payment_id = cp.id 
                                      WHERE cp.company_id = ? AND cp.payment_type = 'Vendor' AND cp.paid_to_coa_id = ? AND cpi.invoice_no = ?");
            $stmtCpv->execute([$company_id, $vendorCoaId, $invNo]);
            $cpvs = $stmtCpv->fetchAll(PDO::FETCH_ASSOC);
            foreach ($cpvs as $cpv) {
                $vendorsData[$groupKey]['amt_paid'] += (float)$cpv['paid_amount'];
                $vendorsData[$groupKey]['wh_tax'] += (float)$cpv['wht_amount'];
                $vendorsData[$groupKey]['sales_tax'] += (float)$cpv['gst_amount']; 
                $vendorsData[$groupKey]['adv_adj'] += (float)$cpv['advance_adjusted'];
                $vendorsData[$groupKey]['discount'] += (float)$cpv['discount_received'];
            }

            // Fetch BPV against this invoice
            $stmtBpv = $pdo->prepare("SELECT bpi.paid_amount, bpi.wht_amount, bpi.gst_amount, bpi.advance_adjusted, bpi.discount_received 
                                      FROM bank_payment_items bpi 
                                      JOIN bank_payments bp ON bpi.payment_id = bp.id 
                                      WHERE bp.company_id = ? AND bp.payment_type = 'Vendor' AND bp.paid_to_coa_id = ? AND bpi.invoice_no = ?");
            $stmtBpv->execute([$company_id, $vendorCoaId, $invNo]);
            $bpvs = $stmtBpv->fetchAll(PDO::FETCH_ASSOC);
            foreach ($bpvs as $bpv) {
                $vendorsData[$groupKey]['amt_paid'] += (float)$bpv['paid_amount'];
                $vendorsData[$groupKey]['wh_tax'] += (float)$bpv['wht_amount'];
                $vendorsData[$groupKey]['sales_tax'] += (float)$bpv['gst_amount'];
                $vendorsData[$groupKey]['adv_adj'] += (float)$bpv['advance_adjusted'];
                $vendorsData[$groupKey]['discount'] += (float)$bpv['discount_received'];
            }
        }

        // Compute Total Realized and Balance
        $finalData = [];
        foreach ($vendorsData as $v) {
            // Total Realized = Amt Paid + Pur Returns + W.H.Tax + Adv. Adj + Discount
            // Notice: flood_tax and sales_tax are typically already inside total_purchase. They don't normally add to realized amount, but if the UI requires it, we must match the Invoice Wise logic.
            // In Invoice Wise: Balance = Invoice Amount - (Amt Paid + Returns + WHT + Adv. Adj + Discount).
            // Therefore, Realized = Amt Paid + Returns + WHT + Adv. Adj + Discount.
            
            $v['total_realized'] = $v['amt_paid'] + $v['pur_returns'] + $v['wh_tax'] + $v['adv_adj'] + $v['discount'];
            $v['balance_amt'] = $v['total_purchase'] - $v['total_realized'];
            
            $finalData[] = $v;
        }

        // Sort by Vendor Name
        usort($finalData, function($a, $b) {
            $nameA = $a['vendor_name'] ?? '';
            $nameB = $b['vendor_name'] ?? '';
            return strcmp($nameA, $nameB);
        });

        echo json_encode($finalData);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}
?>

