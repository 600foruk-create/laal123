<?php
require_once 'db_config.php';
$start = microtime(true);
$company_id = 1;

$_GET['action'] = 'get_balances';
$_GET['company_id'] = $company_id;
$_GET['filter_type'] = 'all';

// Capture output
ob_start();
require 'trial_balance.php';
$json = ob_get_clean();

$end = microtime(true);
echo "Time taken: " . ($end - $start) . " seconds\n";
$data = json_decode($json, true);
echo "Accounts count: " . count($data['accounts']) . "\n";
?>
