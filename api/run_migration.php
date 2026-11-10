<?php
require_once 'db_config.php';

try {
    $pdo->exec("ALTER TABLE quotations ADD COLUMN customer_address VARCHAR(500) DEFAULT ''");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE quotations ADD COLUMN customer_telephone VARCHAR(100) DEFAULT ''");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE sale_orders ADD COLUMN customer_address VARCHAR(500) DEFAULT ''");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE sale_orders ADD COLUMN customer_telephone VARCHAR(100) DEFAULT ''");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN customer_address VARCHAR(500) DEFAULT ''");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE delivery_challans ADD COLUMN customer_telephone VARCHAR(100) DEFAULT ''");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE sale_returns ADD COLUMN customer_address TEXT");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

try {
    $pdo->exec("ALTER TABLE sale_returns ADD COLUMN customer_telephone VARCHAR(100)");
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

echo "MIGRATION COMPLETE!";
