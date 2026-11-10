<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure Service tables exist
try {
    // 1. Service Categories
    $pdo->exec("CREATE TABLE IF NOT EXISTS serv_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        UNIQUE KEY `serv_cat_code_company` (`code`, `company_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Services
    $pdo->exec("CREATE TABLE IF NOT EXISTS serv_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        cat_id INT NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        selling_price DECIMAL(20,2) DEFAULT 0,
        unit VARCHAR(50),
        tax_rate DECIMAL(10,2) DEFAULT 0,
        tax_type VARCHAR(20) DEFAULT 'Percent',
        is_inactive TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cat_id) REFERENCES serv_categories(id) ON DELETE CASCADE,
        UNIQUE KEY `serv_item_code_company` (`code`, `company_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

} catch (Exception $e) {
    // Silently continue if tables exist
}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

switch ($action) {
    case 'get_categories':
        $stmt = $pdo->prepare("SELECT * FROM serv_categories WHERE company_id = ? ORDER BY code");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'save_category':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('serv_categories', null, null, $id) : null;
        if (isset($data['id']) && $data['id'] > 0) {
            $stmt = $pdo->prepare("UPDATE serv_categories SET code = ?, name = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$data['code'], $data['name'], $data['id'], $company_id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO serv_categories (company_id, code, name) VALUES (?, ?, ?)");
            $stmt->execute([$company_id, $data['code'], $data['name']]);
            $id = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('serv_categories', null, null, $id);
        logActivity('Service Categories', isset($data['id']) && $data['id'] > 0 ? 'UPDATE' : 'INSERT', $id, 'Category: ' . ($data['name'] ?? ''), $before_data, $after_data);
        echo json_encode(['status' => 'success']);
        break;

    case 'delete_category':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('serv_categories', null, null, $id);
        $name = $before_data['header']['name'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM serv_categories WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Service Categories', 'DELETE', $id, 'Category: ' . $name, $before_data, null);
        echo json_encode(['status' => 'success']);
        break;

    case 'get_services':
        $cat_id = $_GET['cat_id'] ?? 0;
        $stmt = $pdo->prepare("SELECT * FROM serv_items WHERE cat_id = ? AND company_id = ? ORDER BY code");
        $stmt->execute([$cat_id, $company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'save_service':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('serv_items', null, null, $id) : null;
        if (isset($data['id']) && $data['id'] > 0) {
            $stmt = $pdo->prepare("UPDATE serv_items SET code = ?, name = ?, description = ?, selling_price = ?, unit = ?, tax_rate = ?, tax_type = ?, is_inactive = ? WHERE id = ? AND company_id = ?");
            $stmt->execute([$data['code'], $data['name'], $data['description'], $data['selling_price'], $data['unit'], $data['tax_rate'], $data['tax_type'], $data['is_inactive'], $data['id'], $company_id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO serv_items (company_id, cat_id, code, name, description, selling_price, unit, tax_rate, tax_type, is_inactive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$company_id, $data['cat_id'], $data['code'], $data['name'], $data['description'], $data['selling_price'], $data['unit'], $data['tax_rate'], $data['tax_type'], $data['is_inactive']]);
            $id = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('serv_items', null, null, $id);
        logActivity('Services', isset($data['id']) && $data['id'] > 0 ? 'UPDATE' : 'INSERT', $id, 'Service: ' . ($data['name'] ?? ''), $before_data, $after_data);
        echo json_encode(['status' => 'success']);
        break;

    case 'delete_service':
        $id = $_GET['id'] ?? 0;
        $before_data = fetchRecordData('serv_items', null, null, $id);
        $name = $before_data['header']['name'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM serv_items WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Services', 'DELETE', $id, 'Service: ' . $name, $before_data, null);
        echo json_encode(['status' => 'success']);
        break;
        
    case 'get_rate_list':
        $stmt = $pdo->prepare("SELECT i.*, c.name as cat_name FROM serv_items i JOIN serv_categories c ON i.cat_id = c.id WHERE i.company_id = ? AND (i.is_inactive = 0 OR i.is_inactive IS NULL) ORDER BY c.name, i.name");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;
}
?>
