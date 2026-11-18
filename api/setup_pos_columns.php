<?php
require 'db_config.php';
try {
    $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_status VARCHAR(20) DEFAULT 'Pending'");
    $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_invoice_number VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE sale_invoices ADD COLUMN fbr_response TEXT NULL");
    echo "Columns added successfully";
} catch (PDOException $e) {
    if (strpos($e->getMessage(), 'Duplicate column name') !== false) {
        echo "Columns already exist";
    } else {
        echo "Error: " . $e->getMessage();
    }
}
?>
