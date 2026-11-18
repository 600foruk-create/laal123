<?php
require_once 'db_config.php';

// Allow large operations for backup
ini_set('memory_limit', '512M');
ini_set('max_execution_time', '300');

$format = strtolower($_GET['format'] ?? 'json'); // Default to json for frontend integration
$filename = 'softifyx_backup_' . date('Y-m-d_H-i-s');

try {
    $tables_stmt = $pdo->query("SHOW TABLES");
    $tables = $tables_stmt->fetchAll(PDO::FETCH_COLUMN);

    if ($format === 'sql') {
        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '.sql"');

        echo "-- ========================================================\n";
        echo "-- SoftifyX ERP Database Backup Dump\n";
        echo "-- Generated: " . date('Y-m-d H:i:s') . "\n";
        echo "-- Database: `" . $db . "`\n";
        echo "-- ========================================================\n\n";
        echo "SET FOREIGN_KEY_CHECKS=0;\n";
        echo "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n";
        echo "SET time_zone = \"+05:00\";\n\n";

        foreach ($tables as $table) {
            $create_stmt = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_ASSOC);
            $create_sql = $create_stmt['Create Table'] ?? '';

            echo "-- --------------------------------------------------------\n";
            echo "-- Table structure for table `$table`\n";
            echo "-- --------------------------------------------------------\n";
            echo "DROP TABLE IF EXISTS `$table`;\n";
            echo $create_sql . ";\n\n";

            $count_stmt = $pdo->query("SELECT COUNT(*) FROM `$table`");
            $row_count = $count_stmt->fetchColumn();
            if ($row_count > 0) {
                echo "-- Dumping data for table `$table`\n";
                $stmt = $pdo->query("SELECT * FROM `$table`");
                $rows_batch = [];
                $sample_row = null;
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $sample_row = $row;
                    $escaped_values = [];
                    foreach ($row as $val) {
                        if ($val === null) {
                            $escaped_values[] = "NULL";
                        } else {
                            $escaped_values[] = $pdo->quote($val);
                        }
                    }
                    $rows_batch[] = "(" . implode(", ", $escaped_values) . ")";
                    if (count($rows_batch) >= 100) {
                        $cols = array_map(function($c) { return "`$c`"; }, array_keys($sample_row));
                        echo "INSERT INTO `$table` (" . implode(", ", $cols) . ") VALUES\n" . implode(",\n", $rows_batch) . ";\n";
                        $rows_batch = [];
                    }
                }
                if (!empty($rows_batch) && $sample_row) {
                    $cols = array_map(function($c) { return "`$c`"; }, array_keys($sample_row));
                    echo "INSERT INTO `$table` (" . implode(", ", $cols) . ") VALUES\n" . implode(",\n", $rows_batch) . ";\n\n";
                }
            }
        }

        echo "SET FOREIGN_KEY_CHECKS=1;\n";
        echo "-- Backup completed successfully.\n";
        exit;
    }

    // Default JSON format for existing frontend integration
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