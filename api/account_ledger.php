<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_POST['company_id'] ?? 1;

// Function to get transactions for a given COA
function fetchLedgerTransactions($pdo, $company_id, $coa_id, $from_date, $to_date, $tax_filter = '', $inv_type_filter = '') {
    // 1. Initial Opening Balance (from coa_opening_balances)
    $stmtOB = $pdo->prepare("SELECT COALESCE(SUM(debit), 0) as op_debit, COALESCE(SUM(credit), 0) as op_credit FROM coa_opening_balances WHERE coa_id = ? AND company_id = ?");
    $stmtOB->execute([$coa_id, $company_id]);
    $ob = $stmtOB->fetch(PDO::FETCH_ASSOC);
    $initial_debit = (float)($ob['op_debit'] ?? 0);
    $initial_credit = (float)($ob['op_credit'] ?? 0);

    // Queries to collect ALL transactions
    $queries = [];

    // General Journal Vouchers — uses 'description' column (not narration)
    $queries[] = "SELECT v.id as source_id, 'JV' as source_type, v.voucher_date as date, 
                  COALESCE(NULLIF(TRIM(i.description),''), NULLIF((SELECT TRIM(description) FROM general_journal_voucher_items WHERE voucher_id = v.id ORDER BY id ASC LIMIT 1),''), NULLIF(TRIM(v.description),''), TRIM(v.remarks)) as description, 
                  CONCAT('JV-', v.serial_no) as tran_no, '' as reference, i.debit, i.credit 
                  FROM general_journal_voucher_items i 
                  INNER JOIN general_journal_vouchers v ON i.voucher_id = v.id 
                  WHERE i.coa_id = ? AND v.company_id = ? AND v.is_cancelled = 0 AND v.is_posted = 1";

    // Sale Invoices (Debit to Customer)
    $queries[] = "SELECT id as source_id, CASE WHEN invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, invoice_date as date, 
                  COALESCE(NULLIF((SELECT TRIM(description) FROM sale_invoice_items WHERE invoice_id = sale_invoices.id ORDER BY id ASC LIMIT 1),''), NULLIF(TRIM(remarks),''), CONCAT('POS Invoice ', COALESCE(NULLIF(pos_invoice_no, ''), CONCAT('SI-', serial_no)))) as description, 
                  COALESCE(NULLIF(pos_invoice_no, ''), CONCAT('SI-', serial_no)) as tran_no, TRIM(customer_order_no) as reference, net_total as debit, 0 as credit 
                  FROM sale_invoices 
                  WHERE customer_coa_id = ? AND company_id = ? AND is_cancelled = 0 AND (is_posted = 1 OR invoice_type = 'POS')";

    // Sale Returns (Credit to Customer for Net Total)
    $queries[] = "SELECT id as source_id, 'SR' as source_type, return_date as date, 
                  COALESCE(NULLIF((SELECT TRIM(description) FROM sale_return_items WHERE return_id = sale_returns.id ORDER BY id ASC LIMIT 1),''), TRIM(remarks)) as description, 
                  CONCAT('SR-', serial_no) as tran_no, '' as reference, 0 as debit, net_total as credit 
                  FROM sale_returns 
                  WHERE customer_coa_id = ? AND company_id = ? AND is_cancelled = 0 AND is_posted = 1";

    // Sale Returns (Debit to Customer for Amount Paid)
    $queries[] = "SELECT id as source_id, 'SR' as source_type, return_date as date, 
                  CONCAT('Amount Paid for SR-', serial_no) as description, 
                  CONCAT('SR-', serial_no) as tran_no, '' as reference, amount_paid as debit, 0 as credit 
                  FROM sale_returns 
                  WHERE customer_coa_id = ? AND company_id = ? AND is_cancelled = 0 AND is_posted = 1 AND amount_paid > 0";

    // Purchase Invoices (Credit to Vendor)
    $queries[] = "SELECT id as source_id, 'PI' as source_type, invoice_date as date, 
                  COALESCE(NULLIF((SELECT TRIM(description) FROM purchase_invoice_items WHERE invoice_id = purchase_invoices.id ORDER BY id ASC LIMIT 1),''), TRIM(remarks)) as description, 
                  CONCAT('PI-', serial_no) as tran_no, TRIM(purchase_order_no) as reference, 0 as debit, net_total as credit 
                  FROM purchase_invoices 
                  WHERE vendor_coa_id = ? AND company_id = ? AND is_cancelled = 0 AND is_posted = 1";

    // Purchase Returns (Debit to Vendor)
    $queries[] = "SELECT id as source_id, 'PR' as source_type, return_date as date, 
                  COALESCE(NULLIF((SELECT TRIM(description) FROM purchase_return_items WHERE return_id = purchase_returns.id ORDER BY id ASC LIMIT 1),''), TRIM(remarks)) as description, 
                  CONCAT('PR-', serial_no) as tran_no, '' as reference, net_total as debit, 0 as credit 
                  FROM purchase_returns 
                  WHERE vendor_coa_id = ? AND company_id = ? AND is_cancelled = 0 AND is_posted = 1";

    // --- ADDED MISSING COUNTER-QUERIES FOR DOUBLE ENTRY ---
    
    // Material Issue Notes (Debit Account)
    $queries[] = "SELECT id as source_id, 'MIN' as source_type, date, 
                  COALESCE(NULLIF(TRIM(remarks),''), (SELECT TRIM(description) FROM material_issue_note_items WHERE note_id = material_issue_notes.id ORDER BY id ASC LIMIT 1)) as description, CONCAT('MIN-', serial_no) as tran_no, '' as reference, 
                  total_amount as debit, 0 as credit 
                  FROM material_issue_notes 
                  WHERE debit_account_id = ? AND company_id = ? AND is_cancelled = 0 AND is_posted = 1";

    // Material Issue Notes (Credit Account)
    $queries[] = "SELECT id as source_id, 'MIN' as source_type, date, 
                  COALESCE(NULLIF(TRIM(remarks),''), (SELECT TRIM(description) FROM material_issue_note_items WHERE note_id = material_issue_notes.id ORDER BY id ASC LIMIT 1)) as description, CONCAT('MIN-', serial_no) as tran_no, '' as reference, 
                  0 as debit, total_amount as credit 
                  FROM material_issue_notes 
                  WHERE credit_account_id = ? AND company_id = ? AND is_cancelled = 0 AND is_posted = 1";

    
    // Cash Payments (Credit to Cash/Bank Account - Itemized)
    $queries[] = "SELECT cp.id as source_id, 'CP' as source_type, cp.payment_date as date, 
                  COALESCE(NULLIF(TRIM(cpi.description),''), cl.name) as description, CONCAT('CP-', cp.serial_no) as tran_no, '' as reference, 
                  CASE WHEN cpi.total_debited < 0 THEN ABS(cpi.total_debited) ELSE 0 END as debit, 
                  CASE WHEN cpi.total_debited >= 0 THEN cpi.total_debited ELSE 0 END as credit 
                  FROM cash_payments cp
                  JOIN cash_payment_items cpi ON cp.id = cpi.payment_id
                  LEFT JOIN coa_list cl ON cl.id = cpi.coa_id OR (cp.payment_type='Vendor' AND cl.id = cp.paid_to_coa_id)
                  WHERE cp.cash_account_coa_id = ? AND cp.company_id = ? AND cp.is_cancelled = 0 AND cp.is_posted = 1";

    // Cash Payments (Debit to Vendor or Petty Account - Itemized)
    $queries[] = "SELECT cp.id as source_id, 'CP' as source_type, cp.payment_date as date, 
                  COALESCE(NULLIF(TRIM(cpi.description),''), 'Cash Payment') as description, CONCAT('CP-', cp.serial_no) as tran_no, '' as reference, 
                  CASE WHEN cpi.total_debited >= 0 THEN cpi.total_debited ELSE 0 END as debit, 
                  CASE WHEN cpi.total_debited < 0 THEN ABS(cpi.total_debited) ELSE 0 END as credit 
                  FROM cash_payments cp
                  JOIN cash_payment_items cpi ON cp.id = cpi.payment_id
                  WHERE (CASE WHEN cp.payment_type = 'Vendor' THEN cp.paid_to_coa_id ELSE cpi.coa_id END) = ? 
                  AND cp.company_id = ? AND cp.is_cancelled = 0 AND cp.is_posted = 1";

    // Bank Payments (Credit to Bank Account - Itemized)
    $queries[] = "SELECT bp.id as source_id, 'BP' as source_type, bp.payment_date as date, 
                  COALESCE(NULLIF(TRIM(bpi.description),''), cl.name) as description, CONCAT('BP-', bp.serial_no) as tran_no, '' as reference, 
                  CASE WHEN bpi.total_debited < 0 THEN ABS(bpi.total_debited) ELSE 0 END as debit, 
                  CASE WHEN bpi.total_debited >= 0 THEN bpi.total_debited ELSE 0 END as credit 
                  FROM bank_payments bp
                  JOIN bank_payment_items bpi ON bp.id = bpi.payment_id
                  LEFT JOIN coa_list cl ON cl.id = bpi.coa_id OR (bp.payment_type='Vendor' AND cl.id = bp.paid_to_coa_id)
                  WHERE bp.cash_account_coa_id = ? AND bp.company_id = ? AND bp.is_cancelled = 0 AND bp.is_posted = 1";

    // Bank Payments (Debit to Vendor or Petty Account - Itemized)
    $queries[] = "SELECT bp.id as source_id, 'BP' as source_type, bp.payment_date as date, 
                  COALESCE(NULLIF(TRIM(bpi.description),''), 'Bank Payment') as description, CONCAT('BP-', bp.serial_no) as tran_no, '' as reference, 
                  CASE WHEN bpi.total_debited >= 0 THEN bpi.total_debited ELSE 0 END as debit, 
                  CASE WHEN bpi.total_debited < 0 THEN ABS(bpi.total_debited) ELSE 0 END as credit 
                  FROM bank_payments bp
                  JOIN bank_payment_items bpi ON bp.id = bpi.payment_id
                  WHERE (CASE WHEN bp.payment_type = 'Vendor' THEN bp.paid_to_coa_id ELSE bpi.coa_id END) = ? 
                  AND bp.company_id = ? AND bp.is_cancelled = 0 AND bp.is_posted = 1";

    // Cash Receipts (Debit to Cash/Bank Account - Itemized)
    $queries[] = "SELECT cr.id as source_id, 'CR' as source_type, cr.receipt_date as date, 
                  COALESCE(NULLIF(TRIM(cri.description),''), cl.name) as description, CONCAT('CR-', cr.serial_no) as tran_no, '' as reference, 
                  CASE WHEN cri.total_credited >= 0 THEN cri.total_credited ELSE 0 END as debit, 
                  CASE WHEN cri.total_credited < 0 THEN ABS(cri.total_credited) ELSE 0 END as credit 
                  FROM cash_receipts cr
                  JOIN cash_receipt_items cri ON cr.id = cri.receipt_id
                  LEFT JOIN coa_list cl ON cl.id = cri.coa_id OR (cr.receipt_type='Customer' AND cl.id = cr.received_from_coa_id)
                  WHERE cr.cash_account_coa_id = ? AND cr.company_id = ? AND cr.is_cancelled = 0 AND cr.is_posted = 1";

    // Cash Receipts (Credit to Customer or Petty Account - Itemized)
    $queries[] = "SELECT cr.id as source_id, 'CR' as source_type, cr.receipt_date as date, 
                  COALESCE(NULLIF(TRIM(cri.description),''), 'Cash Receipt') as description, CONCAT('CR-', cr.serial_no) as tran_no, '' as reference, 
                  CASE WHEN cri.total_credited < 0 THEN ABS(cri.total_credited) ELSE 0 END as debit, 
                  CASE WHEN cri.total_credited >= 0 THEN cri.total_credited ELSE 0 END as credit 
                  FROM cash_receipts cr
                  JOIN cash_receipt_items cri ON cr.id = cri.receipt_id
                  WHERE (CASE WHEN cr.receipt_type = 'Customer' THEN cr.received_from_coa_id ELSE cri.coa_id END) = ? 
                  AND cr.company_id = ? AND cr.is_cancelled = 0 AND cr.is_posted = 1";

    // Bank Receipts (Debit to Bank Account - Itemized using Cheque received amount)
    $queries[] = "SELECT br.id as source_id, 'BR' as source_type, br.receipt_date as date, 
                  COALESCE(NULLIF(TRIM(bri.description),''), cl.name) as description, CONCAT('BR-', br.serial_no) as tran_no, '' as reference, 
                  CASE WHEN bri.received_amount >= 0 THEN bri.received_amount ELSE 0 END as debit, 
                  CASE WHEN bri.received_amount < 0 THEN ABS(bri.received_amount) ELSE 0 END as credit 
                  FROM bank_receipts br
                  JOIN bank_receipt_items bri ON br.id = bri.receipt_id
                  LEFT JOIN coa_list cl ON cl.id = bri.coa_id OR (br.receipt_type='Customer' AND cl.id = br.received_from_coa_id)
                  WHERE br.bank_account_coa_id = ? AND br.company_id = ? AND br.is_cancelled = 0 AND br.is_posted = 1";

    // Bank Receipts (Debit to Advance Tax / WHT Account 14001001)
    $queries[] = "SELECT br.id as source_id, 'BR' as source_type, br.receipt_date as date, 
                  CONCAT('WHT Deducted on Receipt BR-', br.serial_no, ' - ', COALESCE(cl.name, '')) as description, CONCAT('BR-', br.serial_no) as tran_no, '' as reference, 
                  CASE WHEN bri.wht_amount >= 0 THEN bri.wht_amount ELSE 0 END as debit, 
                  CASE WHEN bri.wht_amount < 0 THEN ABS(bri.wht_amount) ELSE 0 END as credit 
                  FROM bank_receipts br
                  JOIN bank_receipt_items bri ON br.id = bri.receipt_id
                  LEFT JOIN coa_list cl ON cl.id = br.received_from_coa_id
                  INNER JOIN coa_list wht_cl ON wht_cl.code = '14001001' AND wht_cl.company_id = br.company_id
                  WHERE wht_cl.id = ? AND br.company_id = ? AND bri.wht_amount > 0 AND br.is_cancelled = 0 AND br.is_posted = 1";

    // Bank Receipts (Credit to Customer or Petty Account - Itemized using total credited)
    $queries[] = "SELECT br.id as source_id, 'BR' as source_type, br.receipt_date as date, 
                  COALESCE(NULLIF(TRIM(bri.description),''), 'Bank Receipt') as description, CONCAT('BR-', br.serial_no) as tran_no, '' as reference, 
                  CASE WHEN bri.total_credited < 0 THEN ABS(bri.total_credited) ELSE 0 END as debit, 
                  CASE WHEN bri.total_credited >= 0 THEN bri.total_credited ELSE 0 END as credit 
                  FROM bank_receipts br
                  JOIN bank_receipt_items bri ON br.id = bri.receipt_id
                  WHERE (CASE WHEN br.receipt_type = 'Customer' THEN br.received_from_coa_id ELSE bri.coa_id END) = ? 
                  AND br.company_id = ? AND br.is_cancelled = 0 AND br.is_posted = 1";

    // Sale Invoices (Credit to Sales/Income Account)
    $queries[] = "SELECT i.id as source_id, CASE WHEN i.invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, i.invoice_date as date, 
                  COALESCE(NULLIF(TRIM(i.remarks),''), (SELECT TRIM(description) FROM sale_invoice_items WHERE invoice_id = i.id ORDER BY id ASC LIMIT 1), CONCAT(CASE WHEN i.invoice_type = 'POS' THEN 'POS Sale ' ELSE 'Sale Invoice ' END, COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)))) as description, 
                  COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)) as tran_no, TRIM(i.customer_order_no) as reference, 
                  0 as debit, (i.net_total - i.carriage_freight - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM sale_invoice_items WHERE invoice_id = i.id), 0) - i.customer_tax_amount) as credit 
                  FROM sale_invoices i 
                  INNER JOIN coa_list cl ON cl.code = COALESCE(NULLIF(i.income_account, ''), '40001001') AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.is_cancelled = 0 AND (i.is_posted = 1 OR i.invoice_type = 'POS')";

    // Sale Invoices (Credit to WHT Tax Account 22001004)
    $queries[] = "SELECT i.id as source_id, CASE WHEN i.invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, i.invoice_date as date, 
                  CONCAT(COALESCE(i.customer_wht_type, 'WHT Tax'), ' on Bill ', COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no))) as description, COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)) as tran_no, TRIM(i.customer_order_no) as reference, 
                  0 as debit, i.customer_tax_amount as credit 
                  FROM sale_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '22001004' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.customer_tax_amount > 0 AND i.is_cancelled = 0 AND (i.is_posted = 1 OR i.invoice_type = 'POS')";

    // Sale Invoices (Credit to Carriage & Freight Account 60001001)
    $queries[] = "SELECT i.id as source_id, CASE WHEN i.invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, i.invoice_date as date, 
                  CONCAT('Carriage & Freight for Bill ', COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no))) as description, COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)) as tran_no, TRIM(i.customer_order_no) as reference, 
                  0 as debit, i.carriage_freight as credit 
                  FROM sale_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '60001001' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.carriage_freight > 0 AND i.is_cancelled = 0 AND (i.is_posted = 1 OR i.invoice_type = 'POS')";

    // Sale Returns (Debit to Sales/Income Account)
    $queries[] = "SELECT r.id as source_id, 'SR' as source_type, r.return_date as date, 
                  COALESCE(NULLIF(TRIM(r.remarks),''), (SELECT TRIM(description) FROM sale_return_items WHERE return_id = r.id ORDER BY id ASC LIMIT 1)) as description, CONCAT('SR-', r.serial_no) as tran_no, '' as reference, 
                  (r.net_total - r.carriage_freight - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0)) as debit, 0 as credit 
                  FROM sale_returns r
                  INNER JOIN coa_list cl ON cl.code = r.income_account AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1";

    // Sale Returns (Debit to Carriage & Freight Account 60001001)
    $queries[] = "SELECT r.id as source_id, 'SR' as source_type, r.return_date as date, 
                  CONCAT('Carriage & Freight for SR-', r.serial_no) as description, CONCAT('SR-', r.serial_no) as tran_no, '' as reference, 
                  r.carriage_freight as debit, 0 as credit 
                  FROM sale_returns r 
                  INNER JOIN coa_list cl ON cl.code = '60001001' AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1 AND r.carriage_freight > 0";

    // Sale Returns (Credit to Cash/Bank Account 10001001 for Amount Paid)
    $queries[] = "SELECT r.id as source_id, 'SR' as source_type, r.return_date as date, 
                  CONCAT('Amount Paid for SR-', r.serial_no) as description, CONCAT('SR-', r.serial_no) as tran_no, '' as reference, 
                  0 as debit, r.amount_paid as credit 
                  FROM sale_returns r 
                  INNER JOIN coa_list cl ON cl.code = '10001001' AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1 AND r.amount_paid > 0";

    // Purchase Invoices (Debit to Purchases/Expense Account)
    $queries[] = "SELECT i.id as source_id, 'PI' as source_type, i.invoice_date as date, 
                  COALESCE(NULLIF(TRIM(i.remarks),''), (SELECT TRIM(description) FROM purchase_invoice_items WHERE invoice_id = i.id ORDER BY id ASC LIMIT 1)) as description, CONCAT('PI-', i.serial_no) as tran_no, TRIM(i.purchase_order_no) as reference, 
                  (i.net_total - i.carriage_freight - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM purchase_invoice_items WHERE invoice_id = i.id), 0)) as debit, 0 as credit 
                  FROM purchase_invoices i 
                  INNER JOIN coa_list cl ON cl.code = i.expense_account AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.is_cancelled = 0 AND i.is_posted = 1";

    // Purchase Invoices (Debit to Carriage & Freight Account 50001004)
    $queries[] = "SELECT i.id as source_id, 'PI' as source_type, i.invoice_date as date, 
                  CONCAT('Carriage & Freight for Bill PI-', i.serial_no) as description, CONCAT('PI-', i.serial_no) as tran_no, TRIM(i.purchase_order_no) as reference, 
                  i.carriage_freight as debit, 0 as credit 
                  FROM purchase_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '50001004' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.carriage_freight > 0 AND i.is_cancelled = 0 AND i.is_posted = 1";

    // Purchase Returns (Credit to Purchases/Expense Account)
    $queries[] = "SELECT r.id as source_id, 'PR' as source_type, r.return_date as date, 
                  COALESCE(NULLIF(TRIM(r.remarks),''), (SELECT TRIM(description) FROM purchase_return_items WHERE return_id = r.id ORDER BY id ASC LIMIT 1)) as description, CONCAT('PR-', r.serial_no) as tran_no, '' as reference, 
                  0 as debit, (r.net_total - r.carriage_freight - COALESCE((SELECT SUM(sales_tax_amount + further_tax_amount) FROM purchase_return_items WHERE return_id = r.id), 0)) as credit 
                  FROM purchase_returns r
                  INNER JOIN coa_list cl ON cl.code = r.expense_account AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1";

    // Sale Invoices Amount Received (Debit to Cash Account 10001001)
    $queries[] = "SELECT i.id as source_id, CASE WHEN i.invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, i.invoice_date as date, 
                  CONCAT('Cash Received for Bill ', COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)), ' (', COALESCE(c.name, 'Cash Customer'), ')') as description, 
                  COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)) as tran_no, '' as reference, 
                  COALESCE(NULLIF(i.amount_received, 0), i.net_total) as debit, 0 as credit 
                  FROM sale_invoices i 
                  LEFT JOIN coa_list c ON i.customer_coa_id = c.id
                  INNER JOIN coa_list cl ON cl.code = '10001001' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND (i.amount_received > 0 OR i.invoice_type = 'POS') AND i.is_cancelled = 0 AND (i.is_posted = 1 OR i.invoice_type = 'POS')";

    // Sale Invoices Amount Received (Credit to Customer)
    $queries[] = "SELECT id as source_id, CASE WHEN invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, invoice_date as date, 
                  CONCAT('Cash Received for Bill ', COALESCE(NULLIF(pos_invoice_no, ''), CONCAT('SI-', serial_no))) as description, 
                  COALESCE(NULLIF(pos_invoice_no, ''), CONCAT('SI-', serial_no)) as tran_no, '' as reference, 
                  0 as debit, COALESCE(NULLIF(amount_received, 0), net_total) as credit 
                  FROM sale_invoices 
                  WHERE customer_coa_id = ? AND company_id = ? AND (amount_received > 0 OR invoice_type = 'POS') AND is_cancelled = 0 AND (is_posted = 1 OR invoice_type = 'POS')";

    // Purchase Invoices Amount Paid (Credit to Cash Account 10001001)
    $queries[] = "SELECT i.id as source_id, 'PI' as source_type, i.invoice_date as date, 
                  CONCAT('Amount Paid for Bill PI-', i.serial_no) as description, CONCAT('PI-', i.serial_no) as tran_no, '' as reference, 
                  0 as debit, i.amount_paid as credit 
                  FROM purchase_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '10001001' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.amount_paid > 0 AND i.is_cancelled = 0 AND i.is_posted = 1";

    // Purchase Invoices Amount Paid (Debit to Vendor)
    $queries[] = "SELECT id as source_id, 'PI' as source_type, invoice_date as date, 
                  CONCAT('Amount Paid for Bill PI-', serial_no) as description, CONCAT('PI-', serial_no) as tran_no, '' as reference, 
                  amount_paid as debit, 0 as credit 
                  FROM purchase_invoices 
                  WHERE vendor_coa_id = ? AND company_id = ? AND amount_paid > 0 AND is_cancelled = 0 AND is_posted = 1";

    // --- TAX ENTRIES ---
    
    // Sale Invoices (Credit to Sales Tax Account 22001002)
    $queries[] = "SELECT i.id as source_id, CASE WHEN i.invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, i.invoice_date as date, 
                  CONCAT('Sales Tax for Bill ', COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no))) as description, COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)) as tran_no, TRIM(i.customer_order_no) as reference, 
                  0 as debit, COALESCE((SELECT SUM(sales_tax_amount) FROM sale_invoice_items WHERE invoice_id = i.id), 0) as credit 
                  FROM sale_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '22001002' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.is_cancelled = 0 AND (i.is_posted = 1 OR i.invoice_type = 'POS') 
                  AND COALESCE((SELECT SUM(sales_tax_amount) FROM sale_invoice_items WHERE invoice_id = i.id), 0) > 0";

    // Sale Invoices (Credit to Further Tax Account 22001003)
    $queries[] = "SELECT i.id as source_id, CASE WHEN i.invoice_type = 'POS' THEN 'POS' ELSE 'SI' END as source_type, i.invoice_date as date, 
                  CONCAT('Further Tax for Bill ', COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no))) as description, COALESCE(NULLIF(i.pos_invoice_no, ''), CONCAT('SI-', i.serial_no)) as tran_no, TRIM(i.customer_order_no) as reference, 
                  0 as debit, COALESCE((SELECT SUM(further_tax_amount) FROM sale_invoice_items WHERE invoice_id = i.id), 0) as credit 
                  FROM sale_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '22001003' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.is_cancelled = 0 AND (i.is_posted = 1 OR i.invoice_type = 'POS') 
                  AND COALESCE((SELECT SUM(further_tax_amount) FROM sale_invoice_items WHERE invoice_id = i.id), 0) > 0";

    // Sale Returns (Debit to Sales Tax Account 22001002)
    $queries[] = "SELECT r.id as source_id, 'SR' as source_type, r.return_date as date, 
                  CONCAT('Sales Tax for SR-', r.serial_no) as description, CONCAT('SR-', r.serial_no) as tran_no, '' as reference, 
                  COALESCE((SELECT SUM(sales_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) as debit, 0 as credit 
                  FROM sale_returns r 
                  INNER JOIN coa_list cl ON cl.code = '22001002' AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1 
                  AND COALESCE((SELECT SUM(sales_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) > 0";

    // Sale Returns (Debit to Further Tax Account 22001003)
    $queries[] = "SELECT r.id as source_id, 'SR' as source_type, r.return_date as date, 
                  CONCAT('Further Tax for SR-', r.serial_no) as description, CONCAT('SR-', r.serial_no) as tran_no, '' as reference, 
                  COALESCE((SELECT SUM(further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) as debit, 0 as credit 
                  FROM sale_returns r 
                  INNER JOIN coa_list cl ON cl.code = '22001003' AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1 
                  AND COALESCE((SELECT SUM(further_tax_amount) FROM sale_return_items WHERE return_id = r.id), 0) > 0";

    // Purchase Invoices (Debit to Sales Tax Account 22001002)
    $queries[] = "SELECT i.id as source_id, 'PI' as source_type, i.invoice_date as date, 
                  CONCAT('Sales Tax for Bill PI-', i.serial_no) as description, CONCAT('PI-', i.serial_no) as tran_no, TRIM(i.purchase_order_no) as reference, 
                  COALESCE((SELECT SUM(sales_tax_amount) FROM purchase_invoice_items WHERE invoice_id = i.id), 0) as debit, 0 as credit 
                  FROM purchase_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '22001002' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.is_cancelled = 0 AND i.is_posted = 1 
                  AND COALESCE((SELECT SUM(sales_tax_amount) FROM purchase_invoice_items WHERE invoice_id = i.id), 0) > 0";

    // Purchase Invoices (Debit to Further Tax Account 22001003)
    $queries[] = "SELECT i.id as source_id, 'PI' as source_type, i.invoice_date as date, 
                  CONCAT('Further Tax for Bill PI-', i.serial_no) as description, CONCAT('PI-', i.serial_no) as tran_no, TRIM(i.purchase_order_no) as reference, 
                  COALESCE((SELECT SUM(further_tax_amount) FROM purchase_invoice_items WHERE invoice_id = i.id), 0) as debit, 0 as credit 
                  FROM purchase_invoices i 
                  INNER JOIN coa_list cl ON cl.code = '22001003' AND cl.company_id = i.company_id
                  WHERE cl.id = ? AND i.company_id = ? AND i.is_cancelled = 0 AND i.is_posted = 1 
                  AND COALESCE((SELECT SUM(further_tax_amount) FROM purchase_invoice_items WHERE invoice_id = i.id), 0) > 0";

    // Purchase Returns (Credit to Sales Tax Account 22001002)
    $queries[] = "SELECT r.id as source_id, 'PR' as source_type, r.return_date as date, 
                  CONCAT('Sales Tax for PR-', r.serial_no) as description, CONCAT('PR-', r.serial_no) as tran_no, '' as reference, 
                  0 as debit, COALESCE((SELECT SUM(sales_tax_amount) FROM purchase_return_items WHERE return_id = r.id), 0) as credit 
                  FROM purchase_returns r 
                  INNER JOIN coa_list cl ON cl.code = '22001002' AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1 
                  AND COALESCE((SELECT SUM(sales_tax_amount) FROM purchase_return_items WHERE return_id = r.id), 0) > 0";

    // Purchase Returns (Credit to Further Tax Account 22001003)
    $queries[] = "SELECT r.id as source_id, 'PR' as source_type, r.return_date as date, 
                  CONCAT('Further Tax for PR-', r.serial_no) as description, CONCAT('PR-', r.serial_no) as tran_no, '' as reference, 
                  0 as debit, COALESCE((SELECT SUM(further_tax_amount) FROM purchase_return_items WHERE return_id = r.id), 0) as credit 
                  FROM purchase_returns r 
                  INNER JOIN coa_list cl ON cl.code = '22001003' AND cl.company_id = r.company_id
                  WHERE cl.id = ? AND r.company_id = ? AND r.is_cancelled = 0 AND r.is_posted = 1 
                  AND COALESCE((SELECT SUM(further_tax_amount) FROM purchase_return_items WHERE return_id = r.id), 0) > 0";

    // Execute all queries and merge — each wrapped in try-catch so missing columns don't break everything
    $all_txs = [];
    foreach ($queries as $sql) {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$coa_id, $company_id]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $all_txs = array_merge($all_txs, $rows);
        } catch (\Throwable $e) {
            // Skip this query if it fails (e.g. missing column) — log for debugging
            error_log("Ledger query failed: " . $e->getMessage() . " SQL: " . substr($sql, 0, 100));
        }
    }


    // Separate pre-transactions and current-period transactions based on from_date
    $pre_debit = 0;
    $pre_credit = 0;
    $current_txs = [];

    foreach ($all_txs as $tx) {
        // If there's no valid date, treat it as a pre-transaction
        $tx_date = $tx['date'];
        if (empty($tx_date)) {
            $pre_debit += (float)$tx['debit'];
            $pre_credit += (float)$tx['credit'];
            continue;
        }

        if ($from_date && $tx_date < $from_date) {
            $pre_debit += (float)$tx['debit'];
            $pre_credit += (float)$tx['credit'];
        } else if ($to_date && $tx_date > $to_date) {
            // Ignore transactions after to_date
        } else {
            // Falls within the period
            $current_txs[] = $tx;
        }
    }

    // Calculate final opening balance for the period
    $total_op_debit = $initial_debit + $pre_debit;
    $total_op_credit = $initial_credit + $pre_credit;
    $op_balance = $total_op_debit - $total_op_credit;

    // Create the Opening Balance record
    $final_transactions = [];
    if ($op_balance > 0) {
        $final_transactions[] = [
            'date' => $from_date ?: '',
            'description' => 'Balance Brought Forward',
            'tran_no' => 'OB',
            'reference' => '',
            'debit' => abs($op_balance),
            'credit' => 0,
            'source_type' => 'OB',
            'source_id' => $coa_id,
            'is_ob' => true
        ];
    } else if ($op_balance < 0) {
        $final_transactions[] = [
            'date' => $from_date ?: '',
            'description' => 'Balance Brought Forward',
            'tran_no' => 'OB',
            'reference' => '',
            'debit' => 0,
            'credit' => abs($op_balance),
            'source_type' => 'OB',
            'source_id' => $coa_id,
            'is_ob' => true
        ];
    } else {
        $final_transactions[] = [
            'date' => $from_date ?: '',
            'description' => 'Balance Brought Forward',
            'tran_no' => 'OB',
            'reference' => '',
            'debit' => 0,
            'credit' => 0,
            'source_type' => 'OB',
            'source_id' => $coa_id,
            'is_ob' => true
        ];
    }

    // Sort current transactions by date ascending, then logic-based order (Invoices > Returns > Payments), then source_id, then embedded payment order
    usort($current_txs, function($a, $b) {
        $dateCmp = strcmp($a['date'], $b['date']);
        if ($dateCmp !== 0) return $dateCmp;

        $typeWeight = [
            'OB' => 0,
            'POS' => 10,
            'SI' => 10,
            'PI' => 10,
            'SR' => 20,
            'PR' => 20,
            'CR' => 30,
            'BR' => 30,
            'CP' => 30,
            'BP' => 30,
            'JV' => 40
        ];
        $wA = $typeWeight[$a['source_type']] ?? 50;
        $wB = $typeWeight[$b['source_type']] ?? 50;
        
        if ($wA !== $wB) return $wA - $wB;

        // Same type, sort by ID
        if ($a['source_id'] != $b['source_id']) {
            return $a['source_id'] - $b['source_id'];
        }

        // Within same invoice, ensure embedded payment/receipt rows come last
        $isPayA = (strpos($a['description'], 'Amount Received for Bill') === 0 || strpos($a['description'], 'Amount Paid for Bill') === 0) ? 1 : 0;
        $isPayB = (strpos($b['description'], 'Amount Received for Bill') === 0 || strpos($b['description'], 'Amount Paid for Bill') === 0) ? 1 : 0;
        return $isPayA - $isPayB;
    });

    // Apply filters
    if ($tax_filter !== '' || $inv_type_filter !== '') {
        $si_ids = [];
        $pi_ids = [];
        foreach ($current_txs as $tx) {
            if ($tx['source_type'] === 'SI') $si_ids[] = $tx['source_id'];
            if ($tx['source_type'] === 'PI') $pi_ids[] = $tx['source_id'];
        }
        $si_ids = array_values(array_unique($si_ids));
        $pi_ids = array_values(array_unique($pi_ids));
        
        $si_meta = [];
        if (count($si_ids) > 0) {
            $in = str_repeat('?,', count($si_ids) - 1) . '?';
            $stmt = $pdo->prepare("SELECT id, invoice_type, customer_wht_type, customer_tax_amount, 
                (SELECT SUM(sales_tax_amount) FROM sale_invoice_items WHERE invoice_id = sale_invoices.id) as stax,
                (SELECT SUM(further_tax_amount) FROM sale_invoice_items WHERE invoice_id = sale_invoices.id) as ftax
                FROM sale_invoices WHERE id IN ($in)");
            $stmt->execute($si_ids);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $si_meta[$row['id']] = $row;
            }
        }

        $pi_meta = [];
        if (count($pi_ids) > 0) {
            $in = str_repeat('?,', count($pi_ids) - 1) . '?';
            try {
                $stmt = $pdo->prepare("SELECT id, invoice_type, 
                    (SELECT SUM(sales_tax_amount) FROM purchase_invoice_items WHERE invoice_id = purchase_invoices.id) as stax,
                    (SELECT SUM(further_tax_amount) FROM purchase_invoice_items WHERE invoice_id = purchase_invoices.id) as ftax
                    FROM purchase_invoices WHERE id IN ($in)");
                $stmt->execute($pi_ids);
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $pi_meta[$row['id']] = $row;
                }
            } catch (Exception $e) {}
        }

        $filtered_txs = [];
        foreach ($current_txs as $tx) {
            $keep = true;
            $meta = null;
            if ($tx['source_type'] === 'SI') $meta = $si_meta[$tx['source_id']] ?? null;
            if ($tx['source_type'] === 'PI') $meta = $pi_meta[$tx['source_id']] ?? null;

            if ($inv_type_filter !== '') {
                if ($tx['source_type'] !== 'SI' && $tx['source_type'] !== 'PI') {
                    $keep = false;
                } else if (!$meta) {
                    $keep = false;
                } else {
                    $mapped_type = '';
                    if ($tx['source_type'] === 'SI') {
                        $mapped_type = (stripos($meta['invoice_type'] ?? '', 'Service') !== false) ? 'Sale Service Invoice' : 'Sale Invoice';
                    } else if ($tx['source_type'] === 'PI') {
                        $mapped_type = (stripos($meta['invoice_type'] ?? '', 'Service') !== false) ? 'Purchase Service Invoice' : 'Purchase Invoice';
                    }
                    if ($mapped_type !== $inv_type_filter) {
                        $keep = false;
                    }
                }
            }

            if ($keep && $tax_filter !== '') {
                if ($tx['source_type'] !== 'SI' && $tx['source_type'] !== 'PI') {
                    $keep = false;
                } else if (!$meta) {
                    $keep = false;
                } else {
                    $stax = (float)($meta['stax'] ?? 0);
                    $ftax = (float)($meta['ftax'] ?? 0);
                    $whtAmount = (float)($meta['customer_tax_amount'] ?? 0);

                    if ($tax_filter === 'Sales Tax') {
                        if ($stax <= 0) $keep = false;
                        else {
                            if ($tx['debit'] > 0) $tx['debit'] = $stax;
                            if ($tx['credit'] > 0) $tx['credit'] = $stax;
                        }
                    } else if ($tax_filter === 'Further Tax') {
                        if ($ftax <= 0) $keep = false;
                        else {
                            if ($tx['debit'] > 0) $tx['debit'] = $ftax;
                            if ($tx['credit'] > 0) $tx['credit'] = $ftax;
                        }
                    } else if ($tax_filter === '236 G' || $tax_filter === '236 H') {
                        if (($meta['customer_wht_type'] ?? '') !== $tax_filter || $whtAmount <= 0) $keep = false;
                        else {
                            if ($tx['debit'] > 0) $tx['debit'] = $whtAmount;
                            if ($tx['credit'] > 0) $tx['credit'] = $whtAmount;
                        }
                    } else if ($tax_filter === 'All') {
                        $totalTax = $stax + $ftax;
                        if (!empty($meta['customer_wht_type'])) {
                            $totalTax += $whtAmount;
                        }
                        if ($totalTax <= 0) $keep = false;
                        else {
                            if ($tx['debit'] > 0) $tx['debit'] = $totalTax;
                            if ($tx['credit'] > 0) $tx['credit'] = $totalTax;
                        }
                    } else {
                        $keep = false;
                    }
                }
            }

            if ($keep) {
                $filtered_txs[] = $tx;
            }
        }
        $current_txs = $filtered_txs;
    }

    if ($tax_filter !== '') {
        // If tax filter is applied, user only wants to see tax amounts, not the actual account running balance
        foreach ($final_transactions as &$ftx) {
            if (isset($ftx['is_ob']) && $ftx['is_ob']) {
                $ftx['debit'] = 0;
                $ftx['credit'] = 0;
            }
        }
    }

    $final_transactions = array_merge($final_transactions, $current_txs);
    return $final_transactions;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_accounts') {
        $stmt = $pdo->prepare("SELECT id, code, name FROM coa_list WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    if ($action === 'get_ledger') {
        $coa_id = $_GET['coa_id'] ?? 0;
        $from_date = $_GET['from_date'] ?? null;
        $to_date = $_GET['to_date'] ?? null;

        if (!$coa_id) {
            sendResponse(['error' => 'Account ID is required'], 400);
        }

        // Fetch account details
        $stmt = $pdo->prepare("SELECT id, code, name FROM coa_list WHERE id = ? AND company_id = ?");
        $stmt->execute([$coa_id, $company_id]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$account) {
            sendResponse(['error' => 'Account not found'], 404);
        }

        $tax_filter = $_GET['tax_filter'] ?? '';
        $inv_type_filter = $_GET['inv_type_filter'] ?? '';

        $transactions = fetchLedgerTransactions($pdo, $company_id, $coa_id, $from_date, $to_date, $tax_filter, $inv_type_filter);

        sendResponse([
            'account' => $account,
            'transactions' => $transactions
        ]);
    }
}
?>



