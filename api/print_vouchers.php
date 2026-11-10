<?php
require_once 'db_config.php';
require_once 'auth.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? ($_SESSION['company_id'] ?? 1);

if ($action === 'get_vouchers') {
    $type = $_GET['type'] ?? '';
    $criteria = $_GET['criteria'] ?? 'all';
    $df = $_GET['df'] ?? '';
    $dt = $_GET['dt'] ?? '';
    $sf = (int)($_GET['sf'] ?? 0);
    $st = (int)($_GET['st'] ?? 0);

    $mapping = [
        'purchases' => ['parent' => 'purchase_invoices', 'child' => 'purchase_invoice_items', 'fk' => 'invoice_id', 'date' => 'invoice_date'],
        'purchase_returns' => ['parent' => 'purchase_returns', 'child' => 'purchase_return_items', 'fk' => 'return_id', 'date' => 'return_date'],
        'sale_invoices' => ['parent' => 'sale_invoices', 'child' => 'sale_invoice_items', 'fk' => 'invoice_id', 'date' => 'invoice_date'],
        'sale_returns' => ['parent' => 'sale_returns', 'child' => 'sale_return_items', 'fk' => 'return_id', 'date' => 'return_date'],
        'bank_receipts' => ['parent' => 'bank_receipts', 'child' => 'bank_receipt_items', 'fk' => 'receipt_id', 'date' => 'receipt_date'],
        'bank_payments' => ['parent' => 'bank_payments', 'child' => 'bank_payment_items', 'fk' => 'payment_id', 'date' => 'payment_date'],
        'cash_receipts' => ['parent' => 'cash_receipts', 'child' => 'cash_receipt_items', 'fk' => 'receipt_id', 'date' => 'receipt_date'],
        'cash_payments' => ['parent' => 'cash_payments', 'child' => 'cash_payment_items', 'fk' => 'payment_id', 'date' => 'payment_date'],
        'material_issue_notes' => ['parent' => 'material_issue_notes', 'child' => 'material_issue_note_items', 'fk' => 'min_id', 'date' => 'min_date'],
        'production_notes' => ['parent' => 'production_notes', 'child' => 'production_note_items', 'fk' => 'pn_id', 'date' => 'pn_date'],
        'add_inventory_adjustments' => ['parent' => 'add_inventory_adjustments', 'child' => 'add_inventory_adjustment_items', 'fk' => 'adjustment_id', 'date' => 'adjustment_date'],
        'reduce_inventory_adjustments' => ['parent' => 'reduce_inventory_adjustments', 'child' => 'reduce_inventory_adjustment_items', 'fk' => 'adjustment_id', 'date' => 'adjustment_date'],
        'general_journal_voucher' => ['parent' => 'general_journal_vouchers', 'child' => 'general_journal_voucher_items', 'fk' => 'voucher_id', 'date' => 'voucher_date']
    ];

    if (!isset($mapping[$type])) {
        sendResponse(['error' => 'Invalid voucher type']);
    }

    $map = $mapping[$type];
    $parent = $map['parent'];
    $child = $map['child'];
    $fk = $map['fk'];
    $date_col = $map['date'];

    $stmt_check = $pdo->prepare("SHOW COLUMNS FROM `$parent` LIKE 'is_cancelled'");
    $stmt_check->execute();
    $has_cancelled = $stmt_check->fetch() ? true : false;

    $where = "company_id = :cid";
    
    $params = [':cid' => $company_id];

    if ($criteria === 'date') {
        $where .= " AND DATE($date_col) BETWEEN :df AND :dt";
        $params[':df'] = $df;
        $params[':dt'] = $dt;
    } else if ($criteria === 'serial') {
        $where .= " AND serial_no BETWEEN :sf AND :st";
        $params[':sf'] = $sf;
        $params[':st'] = $st;
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM $parent WHERE $where ORDER BY serial_no ASC");
        $stmt->execute($params);
        $vouchers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Enhance vouchers with standard fields and fetch items
        foreach ($vouchers as &$v) {
            // Standardize generic fields for the frontend print template
            $v['_date'] = $v[$date_col] ?? '';
            $v['_serial'] = $v['serial_no'] ?? '';
            $v['_title'] = ucwords(str_replace('_', ' ', rtrim($type, 's'))) . " Voucher";
            
            // Standardize Account/Customer names if available
            $v['_party_name'] = '';
            $v['_party_code'] = '';
            if (isset($v['customer_coa_id'])) {
                $st2 = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
                $st2->execute([$v['customer_coa_id']]);
                $cData = $st2->fetch(PDO::FETCH_ASSOC);
                if ($cData) { $v['_party_code'] = $cData['code']; $v['_party_name'] = $cData['name']; }
            } else if (isset($v['vendor_coa_id'])) {
                $st2 = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
                $st2->execute([$v['vendor_coa_id']]);
                $cData = $st2->fetch(PDO::FETCH_ASSOC);
                if ($cData) { $v['_party_code'] = $cData['code']; $v['_party_name'] = $cData['name']; }
            } else if (isset($v['received_from_coa_id'])) {
                $st2 = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
                $st2->execute([$v['received_from_coa_id']]);
                $cData = $st2->fetch(PDO::FETCH_ASSOC);
                if ($cData) { $v['_party_code'] = $cData['code']; $v['_party_name'] = $cData['name']; }
            } else if (isset($v['paid_to_coa_id'])) {
                $st2 = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
                $st2->execute([$v['paid_to_coa_id']]);
                $cData = $st2->fetch(PDO::FETCH_ASSOC);
                if ($cData) { $v['_party_code'] = $cData['code']; $v['_party_name'] = $cData['name']; }
            }

            // Also try to get cash/bank account details
            $v['_bank_cash_name'] = '';
            $v['_bank_cash_code'] = '';
            $bc_id = $v['cash_account_coa_id'] ?? ($v['bank_account_coa_id'] ?? null);
            if ($bc_id) {
                $st2 = $pdo->prepare("SELECT code, name FROM coa_list WHERE id = ?");
                $st2->execute([$bc_id]);
                $cData = $st2->fetch(PDO::FETCH_ASSOC);
                if ($cData) { $v['_bank_cash_code'] = $cData['code']; $v['_bank_cash_name'] = $cData['name']; }
            }
            
            // Dynamically check columns for child table
            $stmt_child_chk = $pdo->prepare("SHOW COLUMNS FROM `$child` LIKE 'item_coa_id'");
            $stmt_child_chk->execute();
            $has_item_coa_id = $stmt_child_chk->fetch() ? true : false;
            
            $stmt_child_chk2 = $pdo->prepare("SHOW COLUMNS FROM `$child` LIKE 'coa_id'");
            $stmt_child_chk2->execute();
            $has_coa_id = $stmt_child_chk2->fetch() ? true : false;

            $item_name_1_query = $has_item_coa_id ? "(SELECT name FROM coa_list WHERE id = i.item_coa_id LIMIT 1)" : "NULL";
            $item_name_2_query = $has_coa_id ? "(SELECT name FROM coa_list WHERE id = i.coa_id LIMIT 1)" : "NULL";
            $inv_name_query = $has_item_coa_id ? "(SELECT name FROM inv_items WHERE id = i.item_coa_id LIMIT 1)" : "NULL";

            $stmt_items = $pdo->prepare("
                SELECT i.*, 
                       $item_name_1_query as item_name_1,
                       $item_name_2_query as item_name_2,
                       $inv_name_query as inv_name
                FROM $child i 
                WHERE i.$fk = ?
            ");
            $stmt_items->execute([$v['id']]);
            $items = $stmt_items->fetchAll(PDO::FETCH_ASSOC);

            // Standardize item rows
            foreach ($items as &$itm) {
                $itm['_name'] = $itm['inv_name'] ?: ($itm['item_name_1'] ?: ($itm['item_name_2'] ?: ($itm['description'] ?? 'Item')));
                $itm['_qty'] = $itm['pieces'] ?? ($itm['qty'] ?? 0);
                $itm['_rate'] = $itm['rate'] ?? 0;
                $itm['_amount'] = $itm['amount'] ?? ($itm['total_debited'] ?? ($itm['total_credited'] ?? 0));
                
                // For JVs
                $itm['_debit'] = $itm['debit'] ?? 0;
                $itm['_credit'] = $itm['credit'] ?? 0;
            }

            $v['items'] = $items;
        }

        sendResponse(['status' => 'success', 'vouchers' => $vouchers]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()]);
    }
}
