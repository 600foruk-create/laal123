<?php
require_once 'db_config.php';
checkAuth();

$action = $_GET['action'] ?? '';
$company_id = $_SESSION['company_id'] ?? 1;

// Initialize Table
$pdo->exec("CREATE TABLE IF NOT EXISTS drivers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    cnic VARCHAR(50) DEFAULT '',
    mobile VARCHAR(50) DEFAULT '',
    vehicle_desc VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (company_id)
) ENGINE=InnoDB");

header('Content-Type: application/json');

switch ($action) {
    case 'get_drivers':
        try {
            $stmt = $pdo->prepare("SELECT * FROM drivers WHERE company_id = ? ORDER BY name ASC");
            $stmt->execute([$company_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    case 'save_driver':
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $name = trim($data['name'] ?? '');
            $cnic = trim($data['cnic'] ?? '');
            $mobile = trim($data['mobile'] ?? '');
            $vehicle_desc = trim($data['vehicle_desc'] ?? '');

            if (empty($name)) {
                echo json_encode(['status' => 'error', 'message' => 'Driver name is required']);
                exit;
            }

            if ($id && $id > 0) {
                // UPDATE
                $stmt = $pdo->prepare("UPDATE drivers SET name = ?, cnic = ?, mobile = ?, vehicle_desc = ? WHERE id = ? AND company_id = ?");
                $stmt->execute([$name, $cnic, $mobile, $vehicle_desc, $id, $company_id]);
                echo json_encode(['status' => 'success', 'id' => $id, 'message' => 'Driver updated successfully']);
            } else {
                // INSERT
                $stmt = $pdo->prepare("INSERT INTO drivers (company_id, name, cnic, mobile, vehicle_desc) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$company_id, $name, $cnic, $mobile, $vehicle_desc]);
                $newId = $pdo->lastInsertId();
                echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Driver added successfully']);
            }
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'delete_driver':
        try {
            $id = $_GET['id'] ?? 0;
            $stmt = $pdo->prepare("DELETE FROM drivers WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            echo json_encode(['status' => 'success', 'message' => 'Driver deleted successfully']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    default:
        echo json_encode(['error' => 'Invalid action']);
        break;
}
