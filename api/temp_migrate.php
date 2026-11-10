<?php
define('NO_SESSION', true);
require_once 'db_config.php';

try {
    $queries = [
        "ALTER TABLE inv_main_categories ADD COLUMN category_type VARCHAR(50) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN category_type VARCHAR(50) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN size VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN length VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN unit_weight DECIMAL(10,2) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN class VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN fitting_type VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN carton INT DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN material VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE inv_items ADD COLUMN grade_specification VARCHAR(100) DEFAULT NULL"
    ];

    foreach ($queries as $q) {
        try {
            $pdo->exec($q);
            echo "Executed: $q\n";
        } catch (Exception $e) {
            echo "Failed or already exists: $q - " . $e->getMessage() . "\n";
        }
    }
    echo "Migration completed.\n";
} catch (Exception $e) {
    echo "Fatal Error: " . $e->getMessage();
}
