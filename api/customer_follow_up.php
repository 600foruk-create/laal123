<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure customer_follow_ups table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_follow_ups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        date DATE,
        event_type VARCHAR(255),
        acc_manager_id INT,
        job_id INT,
        customer_coa_id INT,
        details LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id),
        INDEX (customer_coa_id),
        INDEX (job_id),
        INDEX (acc_manager_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_follow_ups') {
        $stmt = $pdo->prepare("
            SELECT f.*, cl.name as customer_name, cl.code as customer_code, 
                   c.address as customer_address, c.telephone as customer_telephone
            FROM customer_follow_ups f
            LEFT JOIN coa_list cl ON f.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            WHERE f.company_id = ? 
            ORDER BY f.serial_no DESC
        ");
        $stmt->execute([$company_id]);
        echo json_encode($stmt->fetchAll());
    }

    if ($action === 'get_next_serial_no') {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM customer_follow_ups WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        echo json_encode(['next_no' => ($row['max_no'] ?? 0) + 1]);
    }

    if ($action === 'get_follow_up' && isset($_GET['serial_no'])) {
        $stmt = $pdo->prepare("
            SELECT f.*, cl.name as customer_name, cl.code as customer_code, 
                   c.address as customer_address, c.telephone as customer_telephone
            FROM customer_follow_ups f
            LEFT JOIN coa_list cl ON f.customer_coa_id = cl.id
            LEFT JOIN customers c ON cl.id = c.coa_list_id
            WHERE f.company_id = ? AND f.serial_no = ?
        ");
        $stmt->execute([$company_id, $_GET['serial_no']]);
        echo json_encode($stmt->fetch());
    }

    if ($action === 'search_follow_ups') {
        $conditions = ["f.company_id = ?"];
        $params = [$company_id];

        if (!empty($_GET['date_from'])) { $conditions[] = "f.date >= ?"; $params[] = $_GET['date_from']; }
        if (!empty($_GET['date_to']))   { $conditions[] = "f.date <= ?"; $params[] = $_GET['date_to']; }
        if (!empty($_GET['customer_id']))  { $conditions[] = "f.customer_coa_id = ?"; $params[] = (int)$_GET['customer_id']; }
        if (!empty($_GET['event_type']))   { $conditions[] = "f.event_type = ?";  $params[] = $_GET['event_type']; }
        if (!empty($_GET['employee_id']))  { $conditions[] = "f.acc_manager_id = ?"; $params[] = (int)$_GET['employee_id']; }
        if (!empty($_GET['job_id']))       { $conditions[] = "f.job_id = ?"; $params[] = (int)$_GET['job_id']; }

        $where = implode(' AND ', $conditions);
        try {
            $stmt = $pdo->prepare("
                SELECT f.id, f.serial_no, f.date, f.event_type,
                       cl.name as customer_name, cl.code as customer_code,
                       e.name as employee_name,
                       jc.job_no as job_no,
                       LEFT(f.details, 120) as description_text
                FROM customer_follow_ups f
                LEFT JOIN coa_list cl ON f.customer_coa_id = cl.id
                LEFT JOIN employees e ON f.acc_manager_id = e.id
                LEFT JOIN job_cards jc ON f.job_id = jc.id
                WHERE $where
                GROUP BY f.serial_no
                ORDER BY f.serial_no DESC
                LIMIT 500
            ");
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$row) {
                $row['description_text'] = mb_substr(strip_tags($row['description_text'] ?? ''), 0, 80);
            }
            echo json_encode($rows);
        } catch (Exception $e) {
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'save_follow_up') {
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('customer_follow_ups', null, null, $id) : null;
        if ($id) {
            $sql = "UPDATE customer_follow_ups SET 
                    serial_no = ?, date = ?, event_type = ?, acc_manager_id = ?, 
                    job_id = ?, customer_coa_id = ?, details = ?
                    WHERE id = ? AND company_id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['serial_no'], $data['date'], $data['event_type'], $data['acc_manager_id'],
                $data['job_id'], $data['customer_coa_id'], $data['details'],
                $id, $company_id
            ]);
        } else {
            $sql = "INSERT INTO customer_follow_ups (
                    company_id, serial_no, date, event_type, acc_manager_id, 
                    job_id, customer_coa_id, details
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $company_id, $data['serial_no'], $data['date'], $data['event_type'], 
                $data['acc_manager_id'], $data['job_id'], $data['customer_coa_id'], 
                $data['details']
            ]);
            $id = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('customer_follow_ups', null, null, $id);
        logActivity('Customer Follow Ups', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'Follow Up Serial: ' . ($data['serial_no'] ?? ''), $before_data, $after_data);
        echo json_encode(['status' => 'success']);
    }

    if ($action === 'delete_follow_up' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('customer_follow_ups', null, null, $id);
        $serial_no = $before_data['header']['serial_no'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM customer_follow_ups WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('Customer Follow Ups', 'DELETE', $id, 'Follow Up Serial: ' . $serial_no, $before_data, null);
        echo json_encode(['status' => 'success']);
    }
}
?>
