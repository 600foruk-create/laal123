<?php
$_GET['action'] = 'save';
$_GET['company_id'] = 1;
$_SERVER['REQUEST_METHOD'] = 'POST';
$json = json_encode([
    'id' => 1,
    'serial_no' => 4,
    'voucher_date' => '2026-05-22',
    'job_id' => null,
    'employee_id' => null,
    'description' => '',
    'remarks' => '',
    'is_cancelled' => 0,
    'total_amount' => 200,
    'items' => [
        ['coa_id' => 1, 'debit' => 200, 'credit' => 0]
    ]
]);
// overwrite php://input with our json string by using a custom stream wrapper or just modifying the file
$code = file_get_contents('general_journal_voucher.php');
$code = str_replace("file_get_contents('php://input')", "'$json'", $code);
file_put_contents('test_temp.php', $code);
require 'test_temp.php';
