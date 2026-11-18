<?php
require_once 'db_config.php';

try {
    echo "Checking quotation_items table...<br>";
    $stmt = $pdo->query("DESCRIBE quotation_items");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "<pre>";
    print_r($columns);
    echo "</pre>";

    $has_item_id = false;
    $has_item_coa_id = false;
    foreach ($columns as $col) {
        if ($col['Field'] === 'item_id') $has_item_id = true;
        if ($col['Field'] === 'item_coa_id') $has_item_coa_id = true;
    }

    if (!$has_item_coa_id) {
        if ($has_item_id) {
            echo "Renaming item_id to item_coa_id...<br>";
            $pdo->exec("ALTER TABLE quotation_items CHANGE COLUMN item_id item_coa_id INT NOT NULL");
        } else {
            echo "Adding item_coa_id column...<br>";
            $pdo->exec("ALTER TABLE quotation_items ADD COLUMN item_coa_id INT NOT NULL AFTER quotation_id");
        }
        echo "Database fixed!<br>";
    } else {
        echo "item_coa_id already exists.<br>";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
