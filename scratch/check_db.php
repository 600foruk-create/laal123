<?php
require_once '../api/db_config.php';

// Count coa_list customers
$stmt = $pdo->query("SELECT COUNT(*) as c FROM coa_list WHERE main_id = (SELECT id FROM coa_main WHERE name LIKE '%Current Assets%' LIMIT 1)");
$coa_assets = $stmt->fetch()['c'];

$stmt = $pdo->query("SELECT COUNT(*) as c FROM customers");
$cust = $stmt->fetch()['c'];

$stmt = $pdo->query("SELECT cl.id, cl.code, cl.name FROM coa_list cl INNER JOIN customers c ON c.coa_list_id = cl.id");
$inner = count($stmt->fetchAll());

$stmt = $pdo->query("SELECT id, code, name, sub_id FROM coa_list WHERE name LIKE '%customer%' OR name LIKE '%debtor%' OR name LIKE '%client%'");
$like_cust = $stmt->fetchAll();

echo json_encode([
    'customers_table_count' => $cust,
    'inner_join_count' => $inner,
    'like_cust_count' => count($like_cust),
    'like_cust' => $like_cust
], JSON_PRETTY_PRINT);
