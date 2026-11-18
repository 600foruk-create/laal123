<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;
$from_date = $_GET['from_date'] ?? '';
$to_date = $_GET['to_date'] ?? '';

$has_date_filter = ($from_date !== '' && $to_date !== '');

try {
    $queries = [];
    $params = [];

    // 1. General Journal Vouchers (JV)
    $q_jv = "SELECT 
        v.id as source_id, CONCAT('JV-', v.serial_no) as ref_no, 
        v.voucher_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('JV - ', COALESCE(i.description, v.remarks, '')) as description,
        i.debit, 
        i.credit,
        1 as posted,
        v.is_cancelled as cancel
    FROM general_journal_voucher_items i
    INNER JOIN general_journal_vouchers v ON i.voucher_id = v.id
    LEFT JOIN coa_list cl ON i.coa_id = cl.id
    WHERE v.company_id = ?";
    if ($has_date_filter) { $q_jv .= " AND v.voucher_date >= ? AND v.voucher_date <= ?"; $queries[] = $q_jv; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_jv; $params[] = [$company_id]; }

    // 2. Cash Payments (CP) - Debits
    $q_cp_deb = "SELECT 
        p.id as source_id, CONCAT('CP-', p.serial_no) as ref_no, 
        p.payment_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Cash Payment - ', COALESCE(i.description, p.remarks, '')) as description,
        i.total_debited as debit, 
        0 as credit,
        1 as posted,
        p.is_cancelled as cancel
    FROM cash_payment_items i
    INNER JOIN cash_payments p ON i.payment_id = p.id
    LEFT JOIN coa_list cl ON cl.id = COALESCE(i.coa_id, p.paid_to_coa_id)
    WHERE p.company_id = ?";
    if ($has_date_filter) { $q_cp_deb .= " AND p.payment_date >= ? AND p.payment_date <= ?"; $queries[] = $q_cp_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_cp_deb; $params[] = [$company_id]; }

    // 2b. Cash Payments (CP) - Credits (Cash Account)
    $q_cp_cred = "SELECT 
        p.id as source_id, CONCAT('CP-', p.serial_no) as ref_no, 
        p.payment_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Cash Payment - ', COALESCE(i.description, p.remarks, '')) as description,
        CASE WHEN i.total_debited < 0 THEN ABS(i.total_debited) ELSE 0 END as debit, 
        CASE WHEN i.total_debited >= 0 THEN i.total_debited ELSE 0 END as credit,
        1 as posted,
        p.is_cancelled as cancel
    FROM cash_payment_items i
    INNER JOIN cash_payments p ON i.payment_id = p.id
    LEFT JOIN coa_list cl ON p.cash_account_coa_id = cl.id
    WHERE p.company_id = ?";
    if ($has_date_filter) { $q_cp_cred .= " AND p.payment_date >= ? AND p.payment_date <= ?"; $queries[] = $q_cp_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_cp_cred; $params[] = [$company_id]; }

    // 3. Bank Payments (BP) - Debits
    $q_bp_deb = "SELECT 
        p.id as source_id, CONCAT('BP-', p.serial_no) as ref_no, 
        p.payment_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Bank Payment - ', COALESCE(i.description, p.remarks, '')) as description,
        CASE WHEN i.total_debited >= 0 THEN i.total_debited ELSE 0 END as debit, 
        CASE WHEN i.total_debited < 0 THEN ABS(i.total_debited) ELSE 0 END as credit,
        1 as posted,
        p.is_cancelled as cancel
    FROM bank_payment_items i
    INNER JOIN bank_payments p ON i.payment_id = p.id
    LEFT JOIN coa_list cl ON cl.id = COALESCE(i.coa_id, p.paid_to_coa_id)
    WHERE p.company_id = ?";
    if ($has_date_filter) { $q_bp_deb .= " AND p.payment_date >= ? AND p.payment_date <= ?"; $queries[] = $q_bp_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_bp_deb; $params[] = [$company_id]; }

    // 3b. Bank Payments (BP) - Credits (Bank Account)
    $q_bp_cred = "SELECT 
        p.id as source_id, CONCAT('BP-', p.serial_no) as ref_no, 
        p.payment_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Bank Payment - ', COALESCE(i.description, p.remarks, '')) as description,
        CASE WHEN i.total_debited < 0 THEN ABS(i.total_debited) ELSE 0 END as debit, 
        CASE WHEN i.total_debited >= 0 THEN i.total_debited ELSE 0 END as credit,
        1 as posted,
        p.is_cancelled as cancel
    FROM bank_payment_items i
    INNER JOIN bank_payments p ON i.payment_id = p.id
    LEFT JOIN coa_list cl ON p.cash_account_coa_id = cl.id
    WHERE p.company_id = ?";
    if ($has_date_filter) { $q_bp_cred .= " AND p.payment_date >= ? AND p.payment_date <= ?"; $queries[] = $q_bp_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_bp_cred; $params[] = [$company_id]; }

    // 4. Cash Receipts (CR) - Debits (Cash Account)
    $q_cr_deb = "SELECT 
        r.id as source_id, CONCAT('CR-', r.serial_no) as ref_no, 
        r.receipt_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Cash Receipt - ', COALESCE(i.description, r.remarks, '')) as description,
        CASE WHEN i.total_credited >= 0 THEN i.total_credited ELSE 0 END as debit, 
        CASE WHEN i.total_credited < 0 THEN ABS(i.total_credited) ELSE 0 END as credit,
        1 as posted,
        r.is_cancelled as cancel
    FROM cash_receipt_items i
    INNER JOIN cash_receipts r ON i.receipt_id = r.id
    LEFT JOIN coa_list cl ON r.cash_account_coa_id = cl.id
    WHERE r.company_id = ?";
    if ($has_date_filter) { $q_cr_deb .= " AND r.receipt_date >= ? AND r.receipt_date <= ?"; $queries[] = $q_cr_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_cr_deb; $params[] = [$company_id]; }

    // 4b. Cash Receipts (CR) - Credits
    $q_cr_cred = "SELECT 
        r.id as source_id, CONCAT('CR-', r.serial_no) as ref_no, 
        r.receipt_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Cash Receipt - ', COALESCE(i.description, r.remarks, '')) as description,
        CASE WHEN i.total_credited < 0 THEN ABS(i.total_credited) ELSE 0 END as debit, 
        CASE WHEN i.total_credited >= 0 THEN i.total_credited ELSE 0 END as credit,
        1 as posted,
        r.is_cancelled as cancel
    FROM cash_receipt_items i
    INNER JOIN cash_receipts r ON i.receipt_id = r.id
    LEFT JOIN coa_list cl ON cl.id = COALESCE(i.coa_id, r.received_from_coa_id)
    WHERE r.company_id = ?";
    if ($has_date_filter) { $q_cr_cred .= " AND r.receipt_date >= ? AND r.receipt_date <= ?"; $queries[] = $q_cr_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_cr_cred; $params[] = [$company_id]; }

    // 5. Bank Receipts (BR) - Bank Debits (Cheque received amount)
    $q_br_deb = "SELECT 
        r.id as source_id, CONCAT('BR-', r.serial_no) as ref_no, 
        r.receipt_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Bank Account') as coa_name, 
        CONCAT('Bank Receipt - ', COALESCE(i.description, r.remarks, '')) as description,
        CASE WHEN i.received_amount >= 0 THEN i.received_amount ELSE 0 END as debit, 
        CASE WHEN i.received_amount < 0 THEN ABS(i.received_amount) ELSE 0 END as credit,
        1 as posted,
        r.is_cancelled as cancel
    FROM bank_receipt_items i
    INNER JOIN bank_receipts r ON i.receipt_id = r.id
    LEFT JOIN coa_list cl ON r.bank_account_coa_id = cl.id
    WHERE r.company_id = ?";
    if ($has_date_filter) { $q_br_deb .= " AND r.receipt_date >= ? AND r.receipt_date <= ?"; $queries[] = $q_br_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_br_deb; $params[] = [$company_id]; }

    // 5a2. Bank Receipts (BR) - WHT Debits (Account 14001001)
    $q_br_wht = "SELECT 
        r.id as source_id, CONCAT('BR-', r.serial_no) as ref_no, 
        r.receipt_date as date, 
        '14001001' as coa_code, 
        COALESCE(wcl.name, 'Advance Tax / WHT Receivable') as coa_name, 
        CONCAT('WHT Deducted - BR-', r.serial_no, ' - ', COALESCE(cust.name, '')) as description,
        CASE WHEN i.wht_amount >= 0 THEN i.wht_amount ELSE 0 END as debit, 
        CASE WHEN i.wht_amount < 0 THEN ABS(i.wht_amount) ELSE 0 END as credit,
        1 as posted,
        r.is_cancelled as cancel
    FROM bank_receipt_items i
    INNER JOIN bank_receipts r ON i.receipt_id = r.id
    LEFT JOIN coa_list cust ON r.received_from_coa_id = cust.id
    LEFT JOIN coa_list wcl ON wcl.code = '14001001' AND wcl.company_id = r.company_id
    WHERE r.company_id = ? AND i.wht_amount > 0";
    if ($has_date_filter) { $q_br_wht .= " AND r.receipt_date >= ? AND r.receipt_date <= ?"; $queries[] = $q_br_wht; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_br_wht; $params[] = [$company_id]; }

    // 5b. Bank Receipts (BR) - Credits (Customer / Petty Account)
    $q_br_cred = "SELECT 
        r.id as source_id, CONCAT('BR-', r.serial_no) as ref_no, 
        r.receipt_date as date, 
        COALESCE(cl.code, '') as coa_code, 
        COALESCE(cl.name, 'Unknown Account') as coa_name, 
        CONCAT('Bank Receipt - ', COALESCE(i.description, r.remarks, '')) as description,
        CASE WHEN i.total_credited < 0 THEN ABS(i.total_credited) ELSE 0 END as debit, 
        CASE WHEN i.total_credited >= 0 THEN i.total_credited ELSE 0 END as credit,
        1 as posted,
        r.is_cancelled as cancel
    FROM bank_receipt_items i
    INNER JOIN bank_receipts r ON i.receipt_id = r.id
    LEFT JOIN coa_list cl ON cl.id = COALESCE(i.coa_id, r.received_from_coa_id)
    WHERE r.company_id = ?";
    if ($has_date_filter) { $q_br_cred .= " AND r.receipt_date >= ? AND r.receipt_date <= ?"; $queries[] = $q_br_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_br_cred; $params[] = [$company_id]; }

    // 6. Sale Invoices (SI) - Debits (Customer Account)
    $q_si_deb = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Sale Invoice - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, s.net_total as debit, 0 as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN coa_list cl ON s.customer_coa_id = cl.id WHERE s.company_id = ? AND s.net_total > 0";
    if ($has_date_filter) { $q_si_deb .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_deb; $params[] = [$company_id]; }

    // 6b. Sale Invoices (SI) - Credits (Income Account 40001001 - Taxable Amount)
    $q_si_cred = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '40001001') as coa_code, COALESCE(cl.name, 'Sales') as coa_name, CONCAT('Sale Invoice - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, 0 as debit, (s.net_total - COALESCE(s.carriage_freight, 0) + COALESCE(s.additional_discount, 0) - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM sale_invoice_items WHERE invoice_id = s.id), 0) - COALESCE(s.customer_tax_amount, 0)) as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN coa_list cl ON cl.code = COALESCE(NULLIF(s.income_account, ''), '40001001') AND cl.company_id = s.company_id WHERE s.company_id = ? AND (s.net_total - COALESCE(s.carriage_freight, 0) + COALESCE(s.additional_discount, 0) - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM sale_invoice_items WHERE invoice_id = s.id), 0) - COALESCE(s.customer_tax_amount, 0)) > 0";
    if ($has_date_filter) { $q_si_cred .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_cred; $params[] = [$company_id]; }

    // 6c. Sale Invoices (SI) - Credits (Sales Tax Payable 22001002)
    $q_si_stax = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '22001002') as coa_code, COALESCE(cl.name, 'Sales Tax Payable') as coa_name, CONCAT('Sale Invoice - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, 0 as debit, COALESCE((SELECT SUM(sales_tax_amount) FROM sale_invoice_items WHERE invoice_id = s.id), 0) as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN coa_list cl ON cl.code = '22001002' AND cl.company_id = s.company_id WHERE s.company_id = ? AND COALESCE((SELECT SUM(sales_tax_amount) FROM sale_invoice_items WHERE invoice_id = s.id), 0) > 0";
    if ($has_date_filter) { $q_si_stax .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_stax; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_stax; $params[] = [$company_id]; }

    // 6d. Sale Invoices (SI) - Credits (Further Tax Payable 22001003)
    $q_si_ftax = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '22001003') as coa_code, COALESCE(cl.name, 'Further Tax Payable') as coa_name, CONCAT('Sale Invoice - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, 0 as debit, COALESCE((SELECT SUM(further_tax_amount) FROM sale_invoice_items WHERE invoice_id = s.id), 0) as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN coa_list cl ON cl.code = '22001003' AND cl.company_id = s.company_id WHERE s.company_id = ? AND COALESCE((SELECT SUM(further_tax_amount) FROM sale_invoice_items WHERE invoice_id = s.id), 0) > 0";
    if ($has_date_filter) { $q_si_ftax .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_ftax; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_ftax; $params[] = [$company_id]; }

    // 6e. Sale Invoices (SI) - Credits (WHT Tax Account 22001004)
    $q_si_wht = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '22001004') as coa_code, COALESCE(cl.name, 'WHT Tax Payable') as coa_name, CONCAT('Sale Invoice - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, 0 as debit, s.customer_tax_amount as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN coa_list cl ON cl.code = '22001004' AND cl.company_id = s.company_id WHERE s.company_id = ? AND s.customer_tax_amount > 0";
    if ($has_date_filter) { $q_si_wht .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_wht; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_wht; $params[] = [$company_id]; }

    // 6f. Sale Invoices (SI) - Credits (Carriage & Freight)
    $q_si_carr = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '60001001') as coa_code, COALESCE(cl.name, 'Carriage & Freight Outwards') as coa_name, CONCAT('Sale Invoice Carriage - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, 0 as debit, s.carriage_freight as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE code = '60001001' OR name LIKE '%Carriage%' OR name LIKE '%Freight%' GROUP BY company_id)) cl ON cl.company_id = s.company_id WHERE s.company_id = ? AND s.carriage_freight > 0";
    if ($has_date_filter) { $q_si_carr .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_carr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_carr; $params[] = [$company_id]; }

    // 6g. Sale Invoices (SI) - Debits (Discount Given)
    $q_si_disc = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Discount Given') as coa_name, CONCAT('Sale Invoice Discount - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, s.additional_discount as debit, 0 as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Discount Given%' GROUP BY company_id)) cl ON cl.company_id = s.company_id WHERE s.company_id = ? AND s.additional_discount > 0";
    if ($has_date_filter) { $q_si_disc .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_disc; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_disc; $params[] = [$company_id]; }

    // 6h. Sale Invoices (SI) - Debits (Cash Received - Account 10001001)
    $q_si_cash = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '10001001') as coa_code, COALESCE(cl.name, 'Cash in Hand') as coa_name, CONCAT('Sale Invoice Receipt - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, COALESCE(NULLIF(s.amount_received, 0), s.net_total) as debit, 0 as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE code = '10001001' OR name LIKE '%Cash in Hand%' GROUP BY company_id)) cl ON cl.company_id = s.company_id WHERE s.company_id = ? AND (s.amount_received > 0 OR s.invoice_type = 'POS')";
    if ($has_date_filter) { $q_si_cash .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_cash; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_cash; $params[] = [$company_id]; }

    // 6i. Sale Invoices (SI) - Credits (Customer Account for Cash)
    $q_si_cash_cr = "SELECT s.id as source_id, COALESCE(NULLIF(s.pos_invoice_no, ''), CONCAT('SI-', s.serial_no)) as ref_no, s.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Sale Invoice Receipt - ', COALESCE(NULLIF(s.pos_invoice_no, ''), s.remarks, '')) as description, 0 as debit, COALESCE(NULLIF(s.amount_received, 0), s.net_total) as credit, 1 as posted, s.is_cancelled as cancel FROM sale_invoices s LEFT JOIN coa_list cl ON s.customer_coa_id = cl.id WHERE s.company_id = ? AND (s.amount_received > 0 OR s.invoice_type = 'POS')";
    if ($has_date_filter) { $q_si_cash_cr .= " AND s.invoice_date >= ? AND s.invoice_date <= ?"; $queries[] = $q_si_cash_cr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_si_cash_cr; $params[] = [$company_id]; }

    // 7. Sale Returns (SR) - Debits (Income Account: Taxable Amount)
    $q_sr_deb = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '40001002') as coa_code, COALESCE(cl.name, 'Sales Return') as coa_name, CONCAT('Sale Return - ', COALESCE(r.remarks, '')) as description, (r.net_total - COALESCE(r.carriage_freight, 0) + COALESCE(r.additional_discount, 0) - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0)) as debit, 0 as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN coa_list cl ON cl.code = COALESCE(NULLIF(r.income_account, ''), '40001002') AND cl.company_id = r.company_id WHERE r.company_id = ? AND (r.net_total - COALESCE(r.carriage_freight, 0) + COALESCE(r.additional_discount, 0) - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0)) > 0";
    if ($has_date_filter) { $q_sr_deb .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_deb; $params[] = [$company_id]; }

    // 7b. Sale Returns (SR) - Debits (Sales Tax Account 22001002)
    $q_sr_stax = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '22001002') as coa_code, COALESCE(cl.name, 'Sales Tax Payable') as coa_name, CONCAT('Sale Return - ', COALESCE(r.remarks, '')) as description, COALESCE((SELECT SUM(sales_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) as debit, 0 as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN coa_list cl ON cl.code = '22001002' AND cl.company_id = r.company_id WHERE r.company_id = ? AND COALESCE((SELECT SUM(sales_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) > 0";
    if ($has_date_filter) { $q_sr_stax .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_stax; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_stax; $params[] = [$company_id]; }

    // 7c. Sale Returns (SR) - Debits (Further Tax Account 22001003)
    $q_sr_ftax = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '22001003') as coa_code, COALESCE(cl.name, 'Further Tax Payable') as coa_name, CONCAT('Sale Return - ', COALESCE(r.remarks, '')) as description, COALESCE((SELECT SUM(further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) as debit, 0 as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN coa_list cl ON cl.code = '22001003' AND cl.company_id = r.company_id WHERE r.company_id = ? AND COALESCE((SELECT SUM(further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) > 0";
    if ($has_date_filter) { $q_sr_ftax .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_ftax; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_ftax; $params[] = [$company_id]; }

    // 7d. Sale Returns (SR) - Credits (Customer Account)
    $q_sr_cred = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Sale Return - ', COALESCE(r.remarks, '')) as description, 0 as debit, r.net_total as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN coa_list cl ON r.customer_coa_id = cl.id WHERE r.company_id = ? AND r.net_total > 0";
    if ($has_date_filter) { $q_sr_cred .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_cred; $params[] = [$company_id]; }

    // 7e. Sale Returns (SR) - Debits (Carriage)
    $q_sr_carr = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Carriage & Freight Outwards') as coa_name, CONCAT('Sale Return Carriage - ', COALESCE(r.remarks, '')) as description, r.carriage_freight as debit, 0 as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Carriage%' OR name LIKE '%Freight%' GROUP BY company_id)) cl ON cl.company_id = r.company_id WHERE r.company_id = ? AND r.carriage_freight > 0";
    if ($has_date_filter) { $q_sr_carr .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_carr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_carr; $params[] = [$company_id]; }

    // 7f. Sale Returns (SR) - Debits (Customer Account for Cash Paid)
    $q_sr_cash_deb = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Sale Return Payment - ', COALESCE(r.remarks, '')) as description, r.amount_paid as debit, 0 as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN coa_list cl ON r.customer_coa_id = cl.id WHERE r.company_id = ? AND r.amount_paid > 0";
    if ($has_date_filter) { $q_sr_cash_deb .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_cash_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_cash_deb; $params[] = [$company_id]; }

    // 7g. Sale Returns (SR) - Credits (Cash Paid)
    $q_sr_cash_cr = "SELECT r.id as source_id, CONCAT('SR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Cash in Hand') as coa_name, CONCAT('Sale Return Payment - ', COALESCE(r.remarks, '')) as description, 0 as debit, r.amount_paid as credit, 1 as posted, r.is_cancelled as cancel FROM sale_returns r LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Cash in Hand%' GROUP BY company_id)) cl ON cl.company_id = r.company_id WHERE r.company_id = ? AND r.amount_paid > 0";
    if ($has_date_filter) { $q_sr_cash_cr .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_sr_cash_cr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_sr_cash_cr; $params[] = [$company_id]; }

    // 8. Purchase Invoices (PI) - Debits (Expense Account)
    $q_pi_deb = "SELECT p.id as source_id, CONCAT('PI-', p.serial_no) as ref_no, p.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Purchase Invoice - ', COALESCE(p.remarks, '')) as description, (p.net_total - COALESCE(p.carriage_freight, 0) + COALESCE(p.additional_discount, 0)) as debit, 0 as credit, p.is_posted as posted, p.is_cancelled as cancel FROM purchase_invoices p LEFT JOIN coa_list cl ON cl.code = p.expense_account AND cl.company_id = p.company_id WHERE p.company_id = ? AND (p.net_total - COALESCE(p.carriage_freight, 0) + COALESCE(p.additional_discount, 0)) > 0";
    if ($has_date_filter) { $q_pi_deb .= " AND p.invoice_date >= ? AND p.invoice_date <= ?"; $queries[] = $q_pi_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pi_deb; $params[] = [$company_id]; }

    // 8b. Purchase Invoices (PI) - Credits (Vendor Account)
    $q_pi_cred = "SELECT p.id as source_id, CONCAT('PI-', p.serial_no) as ref_no, p.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Purchase Invoice - ', COALESCE(p.remarks, '')) as description, 0 as debit, p.net_total as credit, p.is_posted as posted, p.is_cancelled as cancel FROM purchase_invoices p LEFT JOIN coa_list cl ON p.vendor_coa_id = cl.id WHERE p.company_id = ? AND p.net_total > 0";
    if ($has_date_filter) { $q_pi_cred .= " AND p.invoice_date >= ? AND p.invoice_date <= ?"; $queries[] = $q_pi_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pi_cred; $params[] = [$company_id]; }

    // 8c. Purchase Invoices (PI) - Debits (Carriage)
    $q_pi_carr = "SELECT p.id as source_id, CONCAT('PI-', p.serial_no) as ref_no, p.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Carriage & Freight Inwards') as coa_name, CONCAT('Purchase Invoice Carriage - ', COALESCE(p.remarks, '')) as description, p.carriage_freight as debit, 0 as credit, p.is_posted as posted, p.is_cancelled as cancel FROM purchase_invoices p LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Carriage%' OR name LIKE '%Freight%' GROUP BY company_id)) cl ON cl.company_id = p.company_id WHERE p.company_id = ? AND p.carriage_freight > 0";
    if ($has_date_filter) { $q_pi_carr .= " AND p.invoice_date >= ? AND p.invoice_date <= ?"; $queries[] = $q_pi_carr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pi_carr; $params[] = [$company_id]; }

    // 8d. Purchase Invoices (PI) - Credits (Discount Received)
    $q_pi_disc = "SELECT p.id as source_id, CONCAT('PI-', p.serial_no) as ref_no, p.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Discount Received') as coa_name, CONCAT('Purchase Invoice Discount - ', COALESCE(p.remarks, '')) as description, 0 as debit, p.additional_discount as credit, p.is_posted as posted, p.is_cancelled as cancel FROM purchase_invoices p LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Discount Received%' GROUP BY company_id)) cl ON cl.company_id = p.company_id WHERE p.company_id = ? AND p.additional_discount > 0";
    if ($has_date_filter) { $q_pi_disc .= " AND p.invoice_date >= ? AND p.invoice_date <= ?"; $queries[] = $q_pi_disc; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pi_disc; $params[] = [$company_id]; }

    // 8e. Purchase Invoices (PI) - Debits (Vendor Account for Cash Paid)
    $q_pi_cash_deb = "SELECT p.id as source_id, CONCAT('PI-', p.serial_no) as ref_no, p.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Purchase Invoice Payment - ', COALESCE(p.remarks, '')) as description, p.amount_paid as debit, 0 as credit, p.is_posted as posted, p.is_cancelled as cancel FROM purchase_invoices p LEFT JOIN coa_list cl ON p.vendor_coa_id = cl.id WHERE p.company_id = ? AND p.amount_paid > 0";
    if ($has_date_filter) { $q_pi_cash_deb .= " AND p.invoice_date >= ? AND p.invoice_date <= ?"; $queries[] = $q_pi_cash_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pi_cash_deb; $params[] = [$company_id]; }

    // 8f. Purchase Invoices (PI) - Credits (Cash Paid)
    $q_pi_cash_cr = "SELECT p.id as source_id, CONCAT('PI-', p.serial_no) as ref_no, p.invoice_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Cash in Hand') as coa_name, CONCAT('Purchase Invoice Payment - ', COALESCE(p.remarks, '')) as description, 0 as debit, p.amount_paid as credit, p.is_posted as posted, p.is_cancelled as cancel FROM purchase_invoices p LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Cash in Hand%' GROUP BY company_id)) cl ON cl.company_id = p.company_id WHERE p.company_id = ? AND p.amount_paid > 0";
    if ($has_date_filter) { $q_pi_cash_cr .= " AND p.invoice_date >= ? AND p.invoice_date <= ?"; $queries[] = $q_pi_cash_cr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pi_cash_cr; $params[] = [$company_id]; }

    // 9. Purchase Returns (PR) - Debits (Vendor Account)
    $q_pr_deb = "SELECT r.id as source_id, CONCAT('PR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Purchase Return - ', COALESCE(r.remarks, '')) as description, r.net_total as debit, 0 as credit, r.is_posted as posted, r.is_cancelled as cancel FROM purchase_returns r LEFT JOIN coa_list cl ON r.vendor_coa_id = cl.id WHERE r.company_id = ? AND r.net_total > 0";
    if ($has_date_filter) { $q_pr_deb .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_pr_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pr_deb; $params[] = [$company_id]; }

    // 9b. Purchase Returns (PR) - Credits (Expense Account)
    $q_pr_cred = "SELECT r.id as source_id, CONCAT('PR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Purchase Return - ', COALESCE(r.remarks, '')) as description, 0 as debit, (r.net_total - COALESCE(r.carriage_freight, 0)) as credit, r.is_posted as posted, r.is_cancelled as cancel FROM purchase_returns r LEFT JOIN coa_list cl ON cl.code = r.expense_account AND cl.company_id = r.company_id WHERE r.company_id = ? AND (r.net_total - COALESCE(r.carriage_freight, 0)) > 0";
    if ($has_date_filter) { $q_pr_cred .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_pr_cred; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pr_cred; $params[] = [$company_id]; }

    // 9c. Purchase Returns (PR) - Credits (Carriage)
    $q_pr_carr = "SELECT r.id as source_id, CONCAT('PR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Carriage & Freight Inwards') as coa_name, CONCAT('Purchase Return Carriage - ', COALESCE(r.remarks, '')) as description, 0 as debit, r.carriage_freight as credit, r.is_posted as posted, r.is_cancelled as cancel FROM purchase_returns r LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Carriage%' OR name LIKE '%Freight%' GROUP BY company_id)) cl ON cl.company_id = r.company_id WHERE r.company_id = ? AND r.carriage_freight > 0";
    if ($has_date_filter) { $q_pr_carr .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_pr_carr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pr_carr; $params[] = [$company_id]; }

    // 9d. Purchase Returns (PR) - Debits (Cash Received)
    $q_pr_cash_deb = "SELECT r.id as source_id, CONCAT('PR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Cash in Hand') as coa_name, CONCAT('Purchase Return Receipt - ', COALESCE(r.remarks, '')) as description, r.amount_received as debit, 0 as credit, r.is_posted as posted, r.is_cancelled as cancel FROM purchase_returns r LEFT JOIN (SELECT company_id, code, name FROM coa_list WHERE id IN (SELECT MIN(id) FROM coa_list WHERE name LIKE '%Cash in Hand%' GROUP BY company_id)) cl ON cl.company_id = r.company_id WHERE r.company_id = ? AND r.amount_received > 0";
    if ($has_date_filter) { $q_pr_cash_deb .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_pr_cash_deb; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pr_cash_deb; $params[] = [$company_id]; }

    // 9e. Purchase Returns (PR) - Credits (Vendor Account for Cash Received)
    $q_pr_cash_cr = "SELECT r.id as source_id, CONCAT('PR-', r.serial_no) as ref_no, r.return_date as date, COALESCE(cl.code, '') as coa_code, COALESCE(cl.name, 'Unknown Account') as coa_name, CONCAT('Purchase Return Receipt - ', COALESCE(r.remarks, '')) as description, 0 as debit, r.amount_received as credit, r.is_posted as posted, r.is_cancelled as cancel FROM purchase_returns r LEFT JOIN coa_list cl ON r.vendor_coa_id = cl.id WHERE r.company_id = ? AND r.amount_received > 0";
    if ($has_date_filter) { $q_pr_cash_cr .= " AND r.return_date >= ? AND r.return_date <= ?"; $queries[] = $q_pr_cash_cr; $params[] = [$company_id, $from_date, $to_date]; } else { $queries[] = $q_pr_cash_cr; $params[] = [$company_id]; }

    // Execute and merge
    $all_records = [];
    foreach ($queries as $idx => $sql) {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params[$idx]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $all_records = array_merge($all_records, $rows);
        } catch (PDOException $e) {
            file_put_contents('error_log.txt', date('Y-m-d H:i:s') . ' - Query failed: ' . $sql . ' - Error: ' . $e->getMessage() . PHP_EOL, FILE_APPEND);
            // Skip missing tables for unimplemented modules
        }
    }

    // Sort by Date, then Transaction Ref No
    usort($all_records, function($a, $b) {
        $date_cmp = strcmp($a['date'], $b['date']);
        if ($date_cmp !== 0) return $date_cmp;
        return strcmp($a['ref_no'], $b['ref_no']);
    });

    echo json_encode([
        'status' => 'success',
        'transactions' => $all_records
    ]);

} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>

