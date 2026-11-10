<?php
require 'api/db_config.php';
$tables = [
    'formulas' => 'total_qty',
    'formula_items' => 'qty',
    'inward_gate_passes' => 'total_qty',
    'inward_gate_pass_items' => 'qty',
    'outward_gate_passes' => 'total_qty',
    'outward_gate_pass_items' => 'qty',
    'inventory_transfers' => 'total_qty',
    'inventory_transfer_items' => 'qty',
    'adjustments' => 'total_qty',
    'adjustment_items' => 'qty',
    'production_notes' => 'total_qty',
    'production_note_items' => 'qty',
    'material_issue_notes' => 'total_qty',
    'material_issue_note_items' => 'qty'
];

foreach ($tables as $table => $col) {
    try {
        $pdo->exec("ALTER TABLE $table MODIFY COLUMN $col DECIMAL(15,4) DEFAULT 0");
        echo "Successfully altered $table $col\n";
    } catch (Exception $e) {
        echo "Error altering $table $col: " . $e->getMessage() . "\n";
    }
}
?>
