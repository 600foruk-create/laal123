<?php
require_once 'db_config.php';
echo json_encode([
    'main' => $pdo->query("SELECT * FROM coa_main")->fetchAll(PDO::FETCH_ASSOC),
    'sub' => $pdo->query("SELECT * FROM coa_sub")->fetchAll(PDO::FETCH_ASSOC)
], JSON_PRETTY_PRINT);
