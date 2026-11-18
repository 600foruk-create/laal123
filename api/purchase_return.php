<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($action === 'next-serial') {
    try {
        $stmt = $pdo->prepare("SELECT MAX(serial_no) as max_sn FROM purchase_returns WHERE company_id = ?");
        $stmt->execute([$company_id]);
        $row = $stmt->fetch();
        $nextSerial = ($row['max_sn'] ?? 0) + 1;
        
        echo json_encode(['nextSerial' => $nextSerial]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
        exit;
    }
}

if ($action === 'get_navigation') {
    $current_sn = $_GET['current_sn'] ?? 0;
    $direction = $_GET['direction'] ?? 'next';
    
    try {
        if ($direction === 'next') {
            $stmt = $pdo->prepare("SELECT * FROM purchase_returns WHERE company_id = ? AND serial_no > ? ORDER BY serial_no ASC LIMIT 1");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM purchase_returns WHERE company_id = ? AND serial_no < ? ORDER BY serial_no DESC LIMIT 1");
        }
        
        $stmt->execute([$company_id, $current_sn]);
        $ret = $stmt->fetch();
        
        if ($ret) {
            // Fetch items
            $stmt = $pdo->prepare("SELECT pri.*, itm.code, itm.name FROM purchase_return_items pri JOIN inv_items itm ON pri.item_coa_id = itm.id WHERE pri.return_id = ?");
            $stmt->execute([$ret['id']]);
            $ret['items'] = $stmt->fetchAll();
            echo json_encode($ret);
        } else {
            echo json_encode(null);
        }
        exit;
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
        exit;
    }
}
?>
