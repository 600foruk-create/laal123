<?php
header('Content-Type: application/json');
// Adjust path to reach db_config.php from api/purchase-return/next-serial/
require_once '../../../db_config.php';

try {
    // Get company_id from session or default to 1
    $company_id = 1;
    if (isset($_SESSION['company_id'])) {
        $company_id = $_SESSION['company_id'];
    }

    $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM purchase_returns WHERE company_id = ?");
    $stmt->execute([$company_id]);
    $row = $stmt->fetch();
    $nextSerial = ($row['max_sn'] ?? 0) + 1;

    echo json_encode(['nextSerial' => $nextSerial]);
} catch (Exception $e) {
    echo json_encode(['nextSerial' => 1, 'error' => $e->getMessage()]);
}
exit;
?>
