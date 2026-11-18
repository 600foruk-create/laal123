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

    // First, fetch all matching purchase invoices
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

    $sql = "SELECT pi.id, pi.serial_no, pi.invoice_date, pi.vendor_coa_id, c.name as vendor_name, 
                   pi.net_total as net_amount, 
                   pi.additional_discount as discount_amount, 
                   COALESCE(inv_sums.sales_tax, 0) as sales_tax_amount, 
                   COALESCE(inv_sums.further_tax, 0) as further_tax_amount
            FROM purchase_invoices pi
            LEFT JOIN coa_list c ON pi.vendor_coa_id = c.id
            LEFT JOIN (
                SELECT invoice_id, SUM(sales_tax_amount) as sales_tax, SUM(further_tax_amount) as further_tax
                FROM purchase_invoice_items
                GROUP BY invoice_id
            ) as inv_sums ON pi.id = inv_sums.invoice_id
            WHERE $piWhere
            ORDER BY pi.invoice_date ASC, pi.id ASC";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mainGrid = [];
        $details = [];

        foreach ($invoices as $inv) {
            $invId = $inv['id'];
            $invNo = $inv['serial_no'];
            $vendorCoaId = $inv['vendor_coa_id'];

            // Initialize invoice totals
            $totals = [
                'id' => $invId,
                'invoice_no' => $invNo,
                'invoice_date' => $inv['invoice_date'],
                'vendor_name' => $inv['vendor_name'],
                'invoice_amount' => (float)$inv['net_amount'],
                'amt_paid' => 0,
                'pur_returns' => 0,
                'wh_tax' => 0,
                'flood_tax' => (float)$inv['further_tax_amount'],
                'sales_tax' => (float)$inv['sales_tax_amount'],
                'adv_adj' => 0,
                'discount' => (float)$inv['discount_amount'],
                'balance_amt' => 0
            ];

            // Add purchase to details
            $details[] = [
                'id' => $invId,
                'invoice_no' => $invNo,
                'transaction_type' => 'Purchase',
                'voucher_no' => $invNo,
                'date' => $inv['invoice_date'],
                'invoice_amount' => (float)$inv['net_amount'],
                'amt_paid' => 0,
                'pur_returns' => 0,
                'wh_tax' => 0,
                'flood_tax' => (float)$inv['further_tax_amount'],
                'sales_tax' => (float)$inv['sales_tax_amount'],
                'adv_adj' => 0,
                'discount' => (float)$inv['discount_amount']
            ];

            // Fetch Returns against this invoice
            $stmtRet = $pdo->prepare("SELECT serial_no, return_date, net_total FROM purchase_returns WHERE company_id = ? AND purchase_no = ? AND vendor_coa_id = ? AND is_cancelled = 0 AND is_posted = 1");
            $stmtRet->execute([$company_id, $invNo, $vendorCoaId]);
            $returns = $stmtRet->fetchAll(PDO::FETCH_ASSOC);
            foreach ($returns as $ret) {
                $val = (float)$ret['net_total'];
                $totals['pur_returns'] += $val;
                $details[] = [
                    'id' => $invId,
                    'invoice_no' => $invNo,
                    'transaction_type' => 'Purchase Return',
                    'voucher_no' => $ret['serial_no'],
                    'date' => $ret['return_date'],
                    'invoice_amount' => 0,
                    'amt_paid' => 0,
                    'pur_returns' => $val,
                    'wh_tax' => 0,
                    'flood_tax' => 0,
                    'sales_tax' => 0,
                    'adv_adj' => 0,
                    'discount' => 0
                ];
            }

            // Fetch CPV against this invoice
            $stmtCpv = $pdo->prepare("SELECT cp.serial_no, cp.payment_date, cpi.paid_amount, cpi.wht_amount, cpi.gst_amount, cpi.advance_adjusted, cpi.discount_received 
                                      FROM cash_payment_items cpi 
                                      JOIN cash_payments cp ON cpi.payment_id = cp.id 
                                      WHERE cp.company_id = ? AND cp.payment_type = 'Vendor' AND cp.paid_to_coa_id = ? AND cpi.invoice_no = ?");
            $stmtCpv->execute([$company_id, $vendorCoaId, $invNo]);
            $cpvs = $stmtCpv->fetchAll(PDO::FETCH_ASSOC);
            foreach ($cpvs as $cpv) {
                $paid = (float)$cpv['paid_amount'];
                $wht = (float)$cpv['wht_amount'];
                $gst = (float)$cpv['gst_amount'];
                $adv = (float)$cpv['advance_adjusted'];
                $disc = (float)$cpv['discount_received'];

                $totals['amt_paid'] += $paid;
                $totals['wh_tax'] += $wht;
                $totals['sales_tax'] += $gst; // Usually GST on payments is deducted, but let's map it to sales tax for now if it adjusts balance
                $totals['adv_adj'] += $adv;
                $totals['discount'] += $disc;

                $details[] = [
                    'id' => $invId,
                    'invoice_no' => $invNo,
                    'transaction_type' => 'Cash Payment',
                    'voucher_no' => $cpv['serial_no'],
                    'date' => $cpv['payment_date'],
                    'invoice_amount' => 0,
                    'amt_paid' => $paid,
                    'pur_returns' => 0,
                    'wh_tax' => $wht,
                    'flood_tax' => 0,
                    'sales_tax' => $gst,
                    'adv_adj' => $adv,
                    'discount' => $disc
                ];
            }

            // Fetch BPV against this invoice
            $stmtBpv = $pdo->prepare("SELECT bp.serial_no, bp.payment_date, bpi.paid_amount, bpi.wht_amount, bpi.gst_amount, bpi.advance_adjusted, bpi.discount_received 
                                      FROM bank_payment_items bpi 
                                      JOIN bank_payments bp ON bpi.payment_id = bp.id 
                                      WHERE bp.company_id = ? AND bp.payment_type = 'Vendor' AND bp.paid_to_coa_id = ? AND bpi.invoice_no = ?");
            $stmtBpv->execute([$company_id, $vendorCoaId, $invNo]);
            $bpvs = $stmtBpv->fetchAll(PDO::FETCH_ASSOC);
            foreach ($bpvs as $bpv) {
                $paid = (float)$bpv['paid_amount'];
                $wht = (float)$bpv['wht_amount'];
                $gst = (float)$bpv['gst_amount'];
                $adv = (float)$bpv['advance_adjusted'];
                $disc = (float)$bpv['discount_received'];

                $totals['amt_paid'] += $paid;
                $totals['wh_tax'] += $wht;
                $totals['sales_tax'] += $gst;
                $totals['adv_adj'] += $adv;
                $totals['discount'] += $disc;

                $details[] = [
                    'id' => $invId,
                    'invoice_no' => $invNo,
                    'transaction_type' => 'Bank Payment',
                    'voucher_no' => $bpv['serial_no'],
                    'date' => $bpv['payment_date'],
                    'invoice_amount' => 0,
                    'amt_paid' => $paid,
                    'pur_returns' => 0,
                    'wh_tax' => $wht,
                    'flood_tax' => 0,
                    'sales_tax' => $gst,
                    'adv_adj' => $adv,
                    'discount' => $disc
                ];
            }

            // Fetch JV against this invoice? (Optional, skipping for now unless specifically requested. Standard ERPs use JV for miscellaneous adjustments, but usually without invoice_no linking).

            // Calculate Balance Amt for this invoice.
            // Balance = Invoice Amount - Amt Paid - Returns - W.H. Tax - Adv. Adj - Discount. 
            // Sales tax / flood tax are usually included in the gross, so we don't subtract them from net unless they are withheld. We assume the math is as typical.
            $totals['balance_amt'] = $totals['invoice_amount'] - $totals['amt_paid'] - $totals['pur_returns'] - $totals['wh_tax'] - $totals['adv_adj'] - $totals['discount'];

            $mainGrid[] = $totals;
        }

        sendResponse(['main_grid' => $mainGrid, 'details' => $details]);

    } catch (Exception $e) {
        file_put_contents('error_log_purchase_activity.txt', $e->getMessage());
        sendResponse(['error' => $e->getMessage()], 500);
    }
    exit;
}

