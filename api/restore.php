<?php
ob_start();
error_reporting(0);
require_once 'db_config.php';

// Allow large operations for restore
ini_set('memory_limit', '512M');
ini_set('max_execution_time', '300');

// Handle only POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    echo json_encode(['error' => 'Only POST method is allowed']);
    exit;
}

$json_data = file_get_contents('php://input');
$data = json_decode($json_data, true);

if (!$data || !is_array($data)) {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

try {
    $pdo->beginTransaction();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    foreach ($data as $table => $rows) {
        try {
            // Prevent SQL injection on table name by sanitizing it
            if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) {
                continue;
            }

            // Detect and support old backup format (where rows were JSON strings)
            if (is_string($rows)) {
                $decoded = json_decode($rows, true);
                if (is_array($decoded)) {
                    $rows = $decoded;
                } else {
                    continue;
                }
            }

            // Check if table exists in DB
            $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
            if ($stmt->rowCount() == 0) {
                continue;
            }

            // Truncate the table (might fail if it's a view, which will be caught)
            $pdo->exec("TRUNCATE TABLE `$table`");

            // Insert rows if any
            if (!empty($rows) && is_array($rows)) {
                $columns = array_keys($rows[0]);
                
                $colNames = implode('`, `', $columns);
                $placeholders = implode(', ', array_fill(0, count($columns), '?'));
                $insert_sql = "INSERT INTO `$table` (`$colNames`) VALUES ($placeholders)";
                $insert_stmt = $pdo->prepare($insert_sql);

                foreach ($rows as $row) {
                    $values = [];
                    foreach ($columns as $col) {
                        $values[] = isset($row[$col]) ? $row[$col] : null;
                    }
                    $insert_stmt->execute($values);
                }
            }
        } catch (Throwable $t) {
            // If a single table fails (e.g. it's a view or has a constraint issue),
            // we simply ignore it and continue restoring the rest of the tables.
            continue;
        }
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->commit();
    
    ob_end_clean();
    sendResponse(['success' => true, 'message' => 'Database restored successfully']);
} catch (Throwable $e) {
    $pdo->rollBack();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1'); // ensure it's turned back on
    ob_end_clean();
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['error' => 'Restore failed: ' . $e->getMessage()]);
}
?>
