<?php
header('Content-Type: application/json');
require_once 'db.php';

$results = [];

$queries = [
    "quotations.customer_address" => "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT ''",
    "quotations.customer_telephone" => "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_telephone VARCHAR(100) DEFAULT ''",
    "sale_orders.customer_address" => "ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT ''",
    "sale_orders.customer_telephone" => "ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS customer_telephone VARCHAR(100) DEFAULT ''",
    "delivery_challans.customer_address" => "ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT ''",
    "delivery_challans.customer_telephone" => "ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS customer_telephone VARCHAR(100) DEFAULT ''",
    "sale_returns.customer_address" => "ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT ''",
    "sale_returns.customer_telephone" => "ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS customer_telephone VARCHAR(100) DEFAULT ''",
];

foreach ($queries as $key => $sql) {
    try {
        $pdo->exec($sql);
        $results[$key] = "OK";
    } catch (Exception $e) {
        $results[$key] = "ERROR: " . $e->getMessage();
    }
}

echo json_encode(['status' => 'done', 'results' => $results]);
