<?php
require 'db_config.php';

try {
    // Check current column type
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'role'");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        $type = $row['Type'];
        echo "Current Role Type: " . $type . "<br>";

        // If it's an ENUM and doesn't contain POS, alter it
        if (strpos(strtolower($type), 'enum') !== false && strpos($type, 'POS') === false) {
            // Expand the ENUM
            $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('Admin', 'User', 'POS') DEFAULT 'User'");
            echo "Successfully added 'POS' to the role ENUM in users table!<br>";
        } else {
            echo "Role column is already compatible or 'POS' already exists in ENUM.<br>";
        }
    } else {
        echo "Could not find 'role' column.<br>";
    }
} catch (PDOException $e) {
    echo "Database Error: " . $e->getMessage() . "<br>";
}
?>
