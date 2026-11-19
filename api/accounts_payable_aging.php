<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_aging_data') {
    $vendorId = $_GET['vendor_id'] ?? '';
    $gapMode = $_GET['gap_mode'] ?? '10';

    $piWhere = "pi.company_id = ?";
    $params = [$company_id];

    if ($vendorId !== '') {
        $piWhere .= " AND pi.vendor_coa_id = ?";
        $params[] = $vendorId;
    }

    $sql = "SELECT pi.id, pi.serial_no, pi.invoice_date, pi.vendor_coa_id, c.code as vendor_code, c.name as vendor_name, 
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
            ORDER BY c.code ASC, pi.invoice_date ASC, pi.id ASC";
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $agingData = [];

        foreach ($invoices as $inv) {
            $invId = $inv['id'];
            $invNo = $inv['serial_no'];
            $vendorCoaId = $inv['vendor_coa_id'];

            $invoice_amount = (float)$inv['net_amount'];
            $amt_paid = 0;
            $pur_returns = 0;
            $wh_tax = 0;
            $adv_adj = 0;
            $discount = (float)$inv['discount_amount'];

            // Fetch Returns
            $stmtRet = $pdo->prepare("SELECT SUM(net_total) as total_ret FROM purchase_returns WHERE company_id = ? AND purchase_no = ? AND vendor_coa_id = ?");
            $stmtRet->execute([$company_id, $invNo, $vendorCoaId]);
            $ret = $stmtRet->fetch(PDO::FETCH_ASSOC);
            if ($ret && $ret['total_ret']) $pur_returns = (float)$ret['total_ret'];

            // Fetch CPV
            $stmtCpv = $pdo->prepare("SELECT SUM(cpi.paid_amount) as paid, SUM(cpi.wht_amount) as wht, SUM(cpi.advance_adjusted) as adv, SUM(cpi.discount_received) as disc 
                                      FROM cash_payment_items cpi 
                                      JOIN cash_payments cp ON cpi.payment_id = cp.id 
                                      WHERE cp.company_id = ? AND cp.payment_type = 'Vendor' AND cp.paid_to_coa_id = ? AND cpi.invoice_no = ?");
            $stmtCpv->execute([$company_id, $vendorCoaId, $invNo]);
            $cpv = $stmtCpv->fetch(PDO::FETCH_ASSOC);
            if ($cpv) {
                $amt_paid += (float)$cpv['paid'];
                $wh_tax += (float)$cpv['wht'];
                $adv_adj += (float)$cpv['adv'];
                $discount += (float)$cpv['disc'];
            }

            // Fetch BPV
            $stmtBpv = $pdo->prepare("SELECT SUM(bpi.paid_amount) as paid, SUM(bpi.wht_amount) as wht, SUM(bpi.advance_adjusted) as adv, SUM(bpi.discount_received) as disc 
                                      FROM bank_payment_items bpi 
                                      JOIN bank_payments bp ON bpi.payment_id = bp.id 
                                      WHERE bp.company_id = ? AND bp.payment_type = 'Vendor' AND bp.paid_to_coa_id = ? AND bpi.invoice_no = ?");
            $stmtBpv->execute([$company_id, $vendorCoaId, $invNo]);
            $bpv = $stmtBpv->fetch(PDO::FETCH_ASSOC);
            if ($bpv) {
                $amt_paid += (float)$bpv['paid'];
                $wh_tax += (float)$bpv['wht'];
                $adv_adj += (float)$bpv['adv'];
                $discount += (float)$bpv['disc'];
            }

            $balance_amt = $invoice_amount - $amt_paid - $pur_returns - $wh_tax - $adv_adj - $discount;

            // Only include invoices with a positive balance
            if ($balance_amt > 0) {
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
                    'vendor_code' => $inv['vendor_code'],
                    'vendor_name' => $inv['vendor_name'],
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

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['error' => 'Invalid action']);
exit;

