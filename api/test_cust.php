<?php
require_once 'db_config.php';
$stmt = $pdo->query("SELECT id, coa_list_id, contact_person FROM customers");
$customers = $stmt->fetchAll(PDO::FETCH_ASSOC);

$stmt = $pdo->query("SELECT id, name FROM coa_list WHERE id IN (SELECT coa_list_id FROM customers)");
$coa_lists = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "CUSTOMERS:\n";
print_r($customers);
echo "COA LISTS:\n";
print_r($coa_lists);
