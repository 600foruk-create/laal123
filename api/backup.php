<?php
require_once 'db_config.php';

// Allow large operations for backup
ini_set('memory_limit', '512M');
ini_set('max_execution_time', '300');

try {
    $tables_stmt = $pdo->query("SHOW TABLES");
    $tables = $tables_stmt->fetchAll(PDO::FETCH_COLUMN);

    // Set headers for download
    header('Content-Type: application/json; charset=utf-8');
    
    // Stream output to avoid memory limits
    echo "{";
    echo '"_database_name": ' . json_encode($db) . ',';
    $first_table = true;
    foreach ($tables as $table) {
        if (!$first_table) {
            echo ",";
        }
        $first_table = false;
        
        echo json_encode($table, JSON_UNESCAPED_UNICODE) . ":[";
        
        $stmt = $pdo->query("SELECT * FROM `$table`");
        $first_row = true;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!$first_row) {
                echo ",";
            }
            $first_row = false;
            // Use JSON_PARTIAL_OUTPUT_ON_ERROR and JSON_INVALID_UTF8_IGNORE to prevent failure on malformed data
            echo json_encode($row, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_IGNORE);
        }
        echo "]";
    }
    echo "}";
} catch (Exception $e) {
    if (!headers_sent()) {
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode(['error' => 'Backup failed: ' . $e->getMessage()]);
    } else {
        // If headers are already sent, outputting JSON error might break the structure, but we do what we can
        echo ',"error": ' . json_encode($e->getMessage()) . '}';
    }
}
?>
