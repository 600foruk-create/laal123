<?php
require 'db_config.php';
$stmt = $pdo->query('SHOW COLUMNS FROM quotation_items');
$cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
file_put_contents('cols.txt', print_r($cols, true));
?>
