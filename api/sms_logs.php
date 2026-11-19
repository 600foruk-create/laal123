<?php
header('Content-Type: application/json');
require_once 'db_config.php';

// MIGRATION: Ensure sms_logs table exists
try {
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
} catch (Exception $e) {}

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? $_SESSION['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_recipients') {
        $type = $_GET['type'] ?? 'customer'; // customer or vendor
        require_once __DIR__ . '/account_ledger.php';

        if ($type === 'customer') {
            $stmt = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name, 
                       c.contact_person, c.address, c.telephone, c.mobile,
                       c.region_id, r.name as region_name
                FROM coa_list cl
                INNER JOIN customers c ON cl.id = c.coa_list_id
                LEFT JOIN regions r ON c.region_id = r.id
                WHERE cl.company_id = ?
                ORDER BY cl.name ASC
            ");
            $stmt->execute([$company_id]);
            $recipients = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Fetch accurate balances matching Accounts' Ledgers module
            foreach ($recipients as &$rec) {
                $coa_id = $rec['id'];
                $txs = fetchLedgerTransactions($pdo, $company_id, $coa_id, null, null);

                $tot_dr = 0;
                $tot_cr = 0;
                $op_bal = 0;

                foreach ($txs as $t) {
                    $db = floatval($t['debit'] ?? 0);
                    $cr = floatval($t['credit'] ?? 0);
                    if (!empty($t['is_ob'])) {
                        $op_bal = $db - $cr;
                    } else {
                        $tot_dr += $db;
                        $tot_cr += $cr;
                    }
                }

                $rec['opening_balance'] = $op_bal;
                $rec['total_debit'] = $tot_dr;
                $rec['total_credit'] = $tot_cr;
                $rec['balance'] = $op_bal + ($tot_dr - $tot_cr);
            }
            sendResponse($recipients);
            
        } else {
            $stmt = $pdo->prepare("
                SELECT cl.id, cl.code, cl.name, 
                       v.contact_person, v.address, v.telephone, v.mobile
                FROM coa_list cl
                INNER JOIN vendors v ON cl.id = v.coa_list_id
                WHERE cl.company_id = ?
                ORDER BY cl.name ASC
            ");
            $stmt->execute([$company_id]);
            $recipients = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($recipients as &$rec) {
                $coa_id = $rec['id'];
                $txs = fetchLedgerTransactions($pdo, $company_id, $coa_id, null, null);

                $tot_dr = 0;
                $tot_cr = 0;
                $op_bal = 0;

                foreach ($txs as $t) {
                    $db = floatval($t['debit'] ?? 0);
                    $cr = floatval($t['credit'] ?? 0);
                    if (!empty($t['is_ob'])) {
                        $op_bal = $cr - $db;
                    } else {
                        $tot_dr += $db;
                        $tot_cr += $cr;
                    }
                }

                $rec['opening_balance'] = $op_bal;
                $rec['total_debit'] = $tot_dr;
                $rec['total_credit'] = $tot_cr;
                $rec['balance'] = $op_bal + ($tot_cr - $tot_dr);
            }
            sendResponse($recipients);
        }
    }

    if ($action === 'get_regions') {
        $stmt = $pdo->prepare("SELECT * FROM regions WHERE company_id = ? ORDER BY name ASC");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_logs') {
        $stmt = $pdo->prepare("SELECT * FROM sms_logs WHERE company_id = ? ORDER BY id DESC LIMIT 500");
        $stmt->execute([$company_id]);
        sendResponse($stmt->fetchAll());
    }

    if ($action === 'get_ledger_transactions') {
        $coa_id = $_GET['coa_id'] ?? 0;
        $type = $_GET['type'] ?? 'customer';
        $from_date = !empty($_GET['from_date']) ? $_GET['from_date'] : null;
        $to_date = !empty($_GET['to_date']) ? $_GET['to_date'] : null;

        require_once __DIR__ . '/account_ledger.php';
        $raw_txs = fetchLedgerTransactions($pdo, $company_id, $coa_id, $from_date, $to_date);

        $transactions = [];
        foreach ($raw_txs as $t) {
            $db = floatval($t['debit'] ?? 0);
            $cr = floatval($t['credit'] ?? 0);
            
            // Skip 0/0 transactions unless it is the Opening Balance
            if ($db == 0 && $cr == 0 && empty($t['is_ob'])) {
                continue;
            }

            $transactions[] = [
                'date' => !empty($t['date']) ? $t['date'] : '',
                'description' => $t['description'] ?? '',
                'reference' => $t['tran_no'] ?? ($t['reference'] ?? ''),
                'debit' => $db,
                'credit' => $cr,
                'source_type' => $t['source_type'] ?? '',
                'is_ob' => !empty($t['is_ob'])
            ];
        }

        sendResponse($transactions);
    }

    if ($action === 'download_ledger_pdf') {
        $coa_id = $_GET['coa_id'] ?? 0;
        $type = $_GET['type'] ?? 'customer';
        $from_date = !empty($_GET['from_date']) ? $_GET['from_date'] : null;
        $to_date = !empty($_GET['to_date']) ? $_GET['to_date'] : null;

        try {
            require_once __DIR__ . '/ledger_pdf_generator.php';
            $pdfRes = generateLedgerPdf($pdo, $company_id, $coa_id, $type, $from_date, $to_date);
            sendResponse($pdfRes);
        } catch (Throwable $e) {
            sendResponse([
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine()
            ], 500);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    if ($action === 'send_sms') {
        $recipient_type = $data['recipient_type'] ?? 'Manual';
        $recipient_name = $data['recipient_name'] ?? 'Direct Number';
        $mobile_no = $data['mobile_no'] ?? '';
        $message = $data['message'] ?? '';
        $document_url = $data['document_url'] ?? '';
        $file_name = $data['file_name'] ?? '';
        $sent_by = $_SESSION['username'] ?? 'Administrator';
        $attach_pdf = !empty($data['attach_pdf']);
        $coa_id = $data['coa_id'] ?? null;
        $from_date = !empty($data['from_date']) ? $data['from_date'] : null;
        $to_date = !empty($data['to_date']) ? $data['to_date'] : null;

        // Auto-generate REAL non-blank Ledger PDF on server if requested
        if ($attach_pdf && $coa_id) {
            try {
                require_once 'ledger_pdf_generator.php';
                $pdfRes = generateLedgerPdf($pdo, $company_id, $coa_id, strtolower($recipient_type) === 'vendor' ? 'vendor' : 'customer', $from_date, $to_date);
                $document_url = $pdfRes['file_url'];
                $file_name = $pdfRes['file_name'];
            } catch (Exception $ePdf) {
                // Keep existing document_url if provided
            }
        }

        if (empty($mobile_no) || empty($message)) {
            sendResponse(['error' => 'Mobile number and message text are required'], 400);
        }

        // Clean mobile number (convert 03xx to 923xx)
        $clean_no = preg_replace('/[^0-9]/', '', $mobile_no);
        if (substr($clean_no, 0, 1) === '0' && strlen($clean_no) === 11) {
            $clean_no = '92' . substr($clean_no, 1);
        }

        // Dynamic Universal Communication API Integration
        require_once 'communication_api.php';

        $stmtComm = $pdo->prepare("SELECT provider, is_enabled, config_json FROM communication_api_settings WHERE company_id = ? AND channel = 'whatsapp'");
        $stmtComm->execute([$company_id]);
        $commRow = $stmtComm->fetch(PDO::FETCH_ASSOC);
        $commCfg = $commRow ? (json_decode($commRow['config_json'], true) ?: []) : [];
        if ($commRow) $commCfg['provider'] = $commRow['provider'];

        $res = dispatchWhatsAppMessage($commCfg, $mobile_no, $message, $document_url, $file_name);
        $api_status = !empty($res['success']) ? 'Sent' : 'Failed';
        $api_error = $res['error'] ?? '';
        $response = $res['response'] ?? ($res['error'] ?? '');

        // Insert into logs
        $stmt = $pdo->prepare("
            INSERT INTO sms_logs (company_id, recipient_type, recipient_name, mobile_no, message, sent_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$company_id, $recipient_type, $recipient_name, $mobile_no, $message, $sent_by, $api_status]);

        sendResponse([
            'status' => $api_status === 'Sent' ? 'success' : 'error',
            'error' => $api_error ?: ($api_status === 'Sent' ? '' : 'Failed to dispatch message'),
            'message' => $api_status === 'Sent' ? 'WhatsApp message sent successfully!' : ($api_error ?: 'Failed to dispatch message'),
            'log_id' => $pdo->lastInsertId(),
            'api_response' => $response
        ]);
    }
}
?>

