<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure tables exist
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS sms_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        serial_no INT NOT NULL,
        template_name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS sms_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        recipient_type VARCHAR(50) NOT NULL,
        recipient_name VARCHAR(150),
        mobile_no VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        sent_by VARCHAR(50),
        status VARCHAR(20) DEFAULT 'Sent',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Insert Default Templates if none exist for this company
    $company_id = $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;
    $count = $pdo->prepare("SELECT COUNT(*) FROM sms_templates WHERE company_id = ?");
    $count->execute([$company_id]);
    if ($count->fetchColumn() == 0) {
        $defaults = [
            [1, 'Ledger Summary', 'Dear {customer_name}, your ledger summary: Opening Balance: {opening_balance}, Total Receipts/Payments: {payments}, Net Balance: {net_balance}. Thank you, {company_name}.'],
            [2, 'Payment Reminder', 'Dear {customer_name}, this is a friendly reminder that your outstanding balance of {net_balance} is due. Please clear it at your earliest convenience. Thank you, {company_name}.'],
            [3, 'Bulk Announcement', 'Dear {customer_name}, we are pleased to offer you special discounts on our services. Please contact us for details. Thank you, {company_name}.']
        ];
        foreach ($defaults as $row) {
            $stmt = $pdo->prepare("INSERT INTO sms_templates (company_id, serial_no, template_name, message) VALUES (?, ?, ?, ?)");
            $stmt->execute([$company_id, $row[0], $row[1], $row[2]]);
        }
    }
} catch (Exception $e) {}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_templates') {
        $stmt = $pdo->prepare("SELECT * FROM sms_templates WHERE company_id = ? ORDER BY serial_no ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_next_serial_no') {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_no FROM sms_templates WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        sendResponse(['next_no' => ($row['max_no'] ?? 0) + 1]);
    }

    if ($action === 'get_template' && isset($_GET['serial_no'])) {
        $stmt = $pdo->prepare("SELECT * FROM sms_templates WHERE company_id = ? AND serial_no = ?");
        $stmt->execute([$company_id, $_GET['serial_no']]);
        sendResponse($stmt->fetch() ?: ['error' => 'Template not found']);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'save_template') {
        $id = $data['id'] ?? null;
        $before_data = $id ? fetchRecordData('sms_templates', null, null, $id) : null;
        if ($id) {
            $sql = "UPDATE sms_templates SET 
                    serial_no = ?, template_name = ?, message = ?, is_active = ?
                    WHERE id = ? AND company_id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['serial_no'], $data['template_name'], $data['message'], $data['is_active'],
                $id, $company_id
            ]);
        } else {
            $sql = "INSERT INTO sms_templates (
                    company_id, serial_no, template_name, message, is_active
                    ) VALUES (?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $company_id, $data['serial_no'], $data['template_name'], $data['message'], 
                $data['is_active']
            ]);
            $id = $pdo->lastInsertId();
        }
        $after_data = fetchRecordData('sms_templates', null, null, $id);
        logActivity('SMS Templates', $data['id'] ? 'UPDATE' : 'INSERT', $id, 'SMS Template: ' . ($data['template_name'] ?? ''), $before_data, $after_data);
        sendResponse(['status' => 'success', 'id' => $id]);
    }

    if ($action === 'delete_template' && isset($_GET['id'])) {
        $id = $_GET['id'];
        $before_data = fetchRecordData('sms_templates', null, null, $id);
        $name = $before_data['header']['template_name'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM sms_templates WHERE id = ? AND company_id = ?");
        $stmt->execute([$id, $company_id]);
        logActivity('SMS Templates', 'DELETE', $id, 'SMS Template: ' . $name, $before_data, null);
        sendResponse(['status' => 'success']);
    }
}
?>
