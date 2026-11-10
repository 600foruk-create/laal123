<?php
require 'db_config.php';
$stmt = $pdo->query("DESCRIBE quotation_items");
$columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($columns);
?>
