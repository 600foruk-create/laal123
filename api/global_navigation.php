<?php
/**
 * SoftifyX ERP - Global Navigation API
 * Safely queries the last-modified / last-saved record for any module
 * using existing user_activity_logs and table timestamps in READ-ONLY mode.
 * Strictly does NOT alter any database schemas or existing table structures.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/db_config.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? '';
$company_id = intval($_GET['company_id'] ?? $_SESSION['company_id'] ?? 1);
$module = trim($_GET['module'] ?? '');

if ($action !== 'get_last_saved' && $action !== 'get_last_edited') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
    exit;
}

if (empty($module)) {
    echo json_encode(['status' => 'error', 'message' => 'Module parameter is required']);
    exit;
}

// Module to table & serial column mapping (Read-Only)
$module_table_map = [
    'Material Issue Notes'        => ['table' => 'material_issue_notes', 'serial_col' => 'serial_no', 'log_names' => ['Material Issue Notes', 'Material Issue Note']],
    'Material Issue Note'         => ['table' => 'material_issue_notes', 'serial_col' => 'serial_no', 'log_names' => ['Material Issue Notes', 'Material Issue Note']],
    'Delivery Challans'           => ['table' => 'delivery_challans', 'serial_col' => 'serial_no', 'log_names' => ['Delivery Challans', 'Delivery Challan']],
    'Delivery Challan'            => ['table' => 'delivery_challans', 'serial_col' => 'serial_no', 'log_names' => ['Delivery Challans', 'Delivery Challan']],
    'Inward Gate Passes'          => ['table' => 'inward_gate_passes', 'serial_col' => 'serial_no', 'log_names' => ['Inward Gate Passes', 'Inward Gate Pass']],
    'Inward Gate Pass'            => ['table' => 'inward_gate_passes', 'serial_col' => 'serial_no', 'log_names' => ['Inward Gate Passes', 'Inward Gate Pass']],
    'Outward Gate Passes'         => ['table' => 'outward_gate_passes', 'serial_col' => 'serial_no', 'log_names' => ['Outward Gate Passes', 'Outward Gate Pass']],
    'Outward Gate Pass'           => ['table' => 'outward_gate_passes', 'serial_col' => 'serial_no', 'log_names' => ['Outward Gate Passes', 'Outward Gate Pass']],
    'Production Notes'            => ['table' => 'production_notes', 'serial_col' => 'serial_no', 'log_names' => ['Production Notes', 'Production Note']],
    'Production Note'             => ['table' => 'production_notes', 'serial_col' => 'serial_no', 'log_names' => ['Production Notes', 'Production Note']],
    'Inventory Transfers'         => ['table' => 'inventory_transfers', 'serial_col' => 'serial_no', 'log_names' => ['Inventory Transfers', 'Inventory Transfer']],
    'Inventory Transfer'          => ['table' => 'inventory_transfers', 'serial_col' => 'serial_no', 'log_names' => ['Inventory Transfers', 'Inventory Transfer']],
    'Add Inventory Adjustments'   => ['table' => 'add_inventory_adjustments', 'serial_col' => 'serial_no', 'log_names' => ['Add Inventory Adjustments', 'Add Inventory Adjustment']],
    'Reduce Inventory Adjustments'=> ['table' => 'reduce_inventory_adjustments', 'serial_col' => 'serial_no', 'log_names' => ['Reduce Inventory Adjustments', 'Reduce Inventory Adjustment']],
    'Formulas'                    => ['table' => 'formulas', 'serial_col' => 'serial_no', 'log_names' => ['Formulas', 'Formula']],
    'Formula'                     => ['table' => 'formulas', 'serial_col' => 'serial_no', 'log_names' => ['Formulas', 'Formula']],
    'Purchase Invoices'           => ['table' => 'purchase_invoices', 'serial_col' => 'serial_no', 'log_names' => ['Purchase Invoices', 'Purchase Invoice']],
    'Purchase Invoice'            => ['table' => 'purchase_invoices', 'serial_col' => 'serial_no', 'log_names' => ['Purchase Invoices', 'Purchase Invoice']],
    'Purchase Orders'             => ['table' => 'purchase_orders', 'serial_col' => 'serial_no', 'log_names' => ['Purchase Orders', 'Purchase Order']],
    'Purchase Order'              => ['table' => 'purchase_orders', 'serial_col' => 'serial_no', 'log_names' => ['Purchase Orders', 'Purchase Order']],
    'Purchase Returns'            => ['table' => 'purchase_returns', 'serial_col' => 'serial_no', 'log_names' => ['Purchase Returns', 'Purchase Return']],
    'Purchase Return'             => ['table' => 'purchase_returns', 'serial_col' => 'serial_no', 'log_names' => ['Purchase Returns', 'Purchase Return']],
    'Sale Invoice'                => ['table' => 'sale_invoices', 'serial_col' => 'serial_no', 'log_names' => ['Sale Invoice', 'Sale Invoices']],
    'Sale Invoices'               => ['table' => 'sale_invoices', 'serial_col' => 'serial_no', 'log_names' => ['Sale Invoice', 'Sale Invoices']],
    'Sale Orders'                 => ['table' => 'sale_orders', 'serial_col' => 'serial_no', 'log_names' => ['Sale Orders', 'Sale Order']],
    'Sale Order'                  => ['table' => 'sale_orders', 'serial_col' => 'serial_no', 'log_names' => ['Sale Orders', 'Sale Order']],
    'Sale Return'                 => ['table' => 'sale_returns', 'serial_col' => 'serial_no', 'log_names' => ['Sale Return', 'Sale Returns']],
    'Sale Returns'                => ['table' => 'sale_returns', 'serial_col' => 'serial_no', 'log_names' => ['Sale Return', 'Sale Returns']],
    'Quotations'                  => ['table' => 'quotations', 'serial_col' => 'serial_no', 'log_names' => ['Quotations', 'Quotation']],
    'Quotation'                   => ['table' => 'quotations', 'serial_col' => 'serial_no', 'log_names' => ['Quotations', 'Quotation']],
    'Customer Follow Ups'         => ['table' => 'customer_follow_ups', 'serial_col' => 'serial_no', 'log_names' => ['Customer Follow Ups', 'Customer Follow Up']],
    'Cash Payments'               => ['table' => 'cash_payments', 'serial_col' => 'voucher_no', 'log_names' => ['Cash Payments', 'Cash Payment']],
    'Bank Payments'               => ['table' => 'bank_payments', 'serial_col' => 'voucher_no', 'log_names' => ['Bank Payments', 'Bank Payment']],
    'Cash Receipts'               => ['table' => 'cash_receipts', 'serial_col' => 'voucher_no', 'log_names' => ['Cash Receipts', 'Cash Receipt']],
    'Bank Receipts'               => ['table' => 'bank_receipts', 'serial_col' => 'voucher_no', 'log_names' => ['Bank Receipts', 'Bank Receipt']],
    'General Journal Voucher'     => ['table' => 'general_journal_vouchers', 'serial_col' => 'voucher_no', 'log_names' => ['General Journal Voucher', 'General Journal Vouchers', 'GJV']]
];

$config = $module_table_map[$module] ?? null;

// Fuzzy fallback match if exact name not in map
if (!$config) {
    foreach ($module_table_map as $key => $val) {
        if (strcasecmp($key, $module) === 0 || stripos($key, $module) !== false || stripos($module, $key) !== false) {
            $config = $val;
            break;
        }
    }
}

if (!$config) {
    echo json_encode(['status' => 'error', 'message' => "Module '$module' mapping not found"]);
    exit;
}

$table = $config['table'];
$serial_col = $config['serial_col'];
$log_names = $config['log_names'];

try {
    // 1. First, search user_activity_logs for the most recent edit/save action for this module
    $placeholders = implode(',', array_fill(0, count($log_names), '?'));
    $params = array_merge([$company_id], $log_names);

    $sql = "SELECT id, record_id, record_title, action_type, details_after, created_at 
            FROM user_activity_logs 
            WHERE company_id = ? 
              AND module_name IN ($placeholders)
              AND action_type IN ('INSERT', 'UPDATE', 'SAVE', 'EDIT', 'POST', 'POST_TOGGLE')
            ORDER BY id DESC 
            LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $log = $stmt->fetch(PDO::FETCH_ASSOC);

    $target_serial = null;
    $target_id = null;

    if ($log) {
        $target_id = $log['record_id'];

        // Try extracting serial from table if target_id exists in the database
        if (!empty($target_id)) {
            try {
                $chkStmt = $pdo->prepare("SELECT `$serial_col` FROM `$table` WHERE id = ? AND company_id = ?");
                $chkStmt->execute([$target_id, $company_id]);
                $row = $chkStmt->fetch(PDO::FETCH_ASSOC);
                if ($row && isset($row[$serial_col])) {
                    $target_serial = $row[$serial_col];
                }
            } catch (Exception $e) {}
        }

        // Try extracting serial from details_after JSON
        if ($target_serial === null && !empty($log['details_after'])) {
            $after = json_decode($log['details_after'], true);
            if (is_array($after)) {
                if (isset($after[$serial_col])) {
                    $target_serial = $after[$serial_col];
                } elseif (isset($after['serial_no'])) {
                    $target_serial = $after['serial_no'];
                } elseif (isset($after['voucher_no'])) {
                    $target_serial = $after['voucher_no'];
                }
            }
        }

        // Try extracting serial from record_title (e.g. "MIN Serial: 2", "PO Serial: 15", "Voucher #5")
        if ($target_serial === null && !empty($log['record_title'])) {
            if (preg_match('/(?:Serial|#|Voucher|No)\s*[:#.]?\s*(\d+)/i', $log['record_title'], $m)) {
                $target_serial = intval($m[1]);
            }
        }
    }

    // 2. Fallback: If no activity log exists or record was not found, query the table directly
    if ($target_serial === null) {
        // Check if table has updated_at column
        $has_updated_at = false;
        try {
            $colStmt = $pdo->query("SHOW COLUMNS FROM `$table` LIKE 'updated_at'");
            $has_updated_at = ($colStmt && $colStmt->fetch());
        } catch (Exception $e) {}

        if ($has_updated_at) {
            $fbStmt = $pdo->prepare("SELECT id, `$serial_col` FROM `$table` WHERE company_id = ? ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT 1");
        } else {
            $fbStmt = $pdo->prepare("SELECT id, `$serial_col` FROM `$table` WHERE company_id = ? ORDER BY id DESC LIMIT 1");
        }
        $fbStmt->execute([$company_id]);
        $fbRow = $fbStmt->fetch(PDO::FETCH_ASSOC);
        if ($fbRow) {
            $target_serial = $fbRow[$serial_col];
            $target_id = $fbRow['id'];
        }
    }

    if ($target_serial !== null) {
        echo json_encode([
            'status'     => 'success',
            'module'     => $module,
            'table'      => $table,
            'serial_no'  => intval($target_serial),
            'id'         => $target_id,
            'source'     => $log ? 'activity_log' : 'table_fallback'
        ]);
    } else {
        echo json_encode([
            'status'     => 'not_found',
            'module'     => $module,
            'message'    => 'No records found for this module'
        ]);
    }

} catch (Exception $e) {
    echo json_encode([
        'status'  => 'error',
        'message' => $e->getMessage()
    ]);
}
