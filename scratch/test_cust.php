<?php
require_once '../api/db_config.php';

$company_id = 1;
$sql = "
    SELECT cl.id, cl.code, cl.name 
    FROM coa_list cl
    LEFT JOIN customers c ON c.coa_list_id = cl.id
    WHERE cl.company_id = ? 
    AND cl.sub_id IN (
        SELECT id FROM coa_sub WHERE main_id IN (
            SELECT id FROM coa_main WHERE 
                LOWER(name) LIKE '%customer%' OR 
                LOWER(name) LIKE '%debtor%' OR 
                LOWER(name) LIKE '%receivable%' OR
                LOWER(name) LIKE '%client%'
        )
    )
";
$stmt = $pdo->prepare($sql);
$stmt->execute([$company_id]);
$res = $stmt->fetchAll();

echo "Count: " . count($res) . "\n";
print_r($res);
