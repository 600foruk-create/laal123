<?php
require 'db_config.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_notes') {
        $from_date = $_GET['from_date'] ?? date('Y-m-d', strtotime('-30 days'));
        $to_date = $_GET['to_date'] ?? date('Y-m-d');
        
        $stmt = $pdo->prepare("
            SELECT * FROM journal_notes 
            WHERE company_id = ? AND note_date BETWEEN ? AND ?
            ORDER BY note_date DESC, created_at DESC
        ");
        $stmt->execute([$company_id, $from_date, $to_date]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendResponse($notes);
    }
    
    if ($action === 'get_notifications') {
        $today = date('Y-m-d');
        $current_user = $_SESSION['username'] ?? '';
        
        $stmt = $pdo->prepare("
            SELECT * FROM journal_notes 
            WHERE company_id = ? AND note_date = ? AND (notify_users = 'ALL' OR notify_users = ?)
            ORDER BY created_at DESC
        ");
        $stmt->execute([$company_id, $today, $current_user]);
        $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendResponse($notifications);
    }

    if ($action === 'get_notifications_archive') {
        $from_date = $_GET['from_date'] ?? date('Y-m-d', strtotime('-30 days'));
        $to_date = $_GET['to_date'] ?? date('Y-m-d');
        $current_user = $_SESSION['username'] ?? '';
        
        $stmt = $pdo->prepare("
            SELECT * FROM journal_notes 
            WHERE company_id = ? AND note_date BETWEEN ? AND ? AND (notify_users = 'ALL' OR notify_users = ?)
            ORDER BY note_date DESC, created_at DESC
        ");
        $stmt->execute([$company_id, $from_date, $to_date, $current_user]);
        $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendResponse($notifications);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if ($action === 'save_note') {
        $id = $data['id'] ?? null;
        $note_date = $data['note_date'] ?? date('Y-m-d');
        $title = $data['title'] ?? '';
        $content = $data['content'] ?? '';
        $notify_users = $data['notify_users'] ?? '0'; // '0', 'ALL', or 'username'
        $created_by = $_SESSION['username'] ?? 'Administrator';
        
        if (empty($title) || empty($content)) {
            sendResponse(['error' => 'Title and Content are required'], 400);
        }
        
        try {
            if ($id) {
                $before_data = fetchRecordData('journal_notes', null, null, $id);
                $stmt = $pdo->prepare("
                    UPDATE journal_notes 
                    SET note_date = ?, title = ?, content = ?, notify_users = ?
                    WHERE id = ? AND company_id = ?
                ");
                $stmt->execute([$note_date, $title, $content, $notify_users, $id, $company_id]);
                
                $after_data = fetchRecordData('journal_notes', null, null, $id);
                logActivity('Journal Notes', 'UPDATE', $id, $title, $before_data, $after_data);

                sendResponse([
                    'status' => 'success',
                    'message' => 'Note updated successfully'
                ]);
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO journal_notes (company_id, note_date, title, content, notify_users, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([$company_id, $note_date, $title, $content, $notify_users, $created_by]);
                $new_id = $pdo->lastInsertId();
                $after_data = fetchRecordData('journal_notes', null, null, $new_id);
                logActivity('Journal Notes', 'INSERT', $new_id, $title, null, $after_data);

                sendResponse([
                    'status' => 'success',
                    'message' => 'Note saved successfully',
                    'id' => $new_id
                ]);
            }
        } catch (PDOException $e) {
            sendResponse([
                'status' => 'error',
                'error' => 'Database Error: ' . $e->getMessage()
            ], 500);
        }
    }

    if ($action === 'delete_note') {
        $id = $data['id'] ?? null;
        if (!$id) {
            sendResponse(['error' => 'Note ID is required'], 400);
        }
        
        try {
            $before_data = fetchRecordData('journal_notes', null, null, $id);
            $title = $before_data['header']['title'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM journal_notes WHERE id = ? AND company_id = ?");
            $stmt->execute([$id, $company_id]);
            logActivity('Journal Notes', 'DELETE', $id, $title, $before_data, null);
            
            sendResponse([
                'status' => 'success',
                'message' => 'Note deleted successfully'
            ]);
        } catch (PDOException $e) {
            sendResponse([
                'status' => 'error',
                'error' => 'Database Error: ' . $e->getMessage()
            ], 500);
        }
    }
}
?>
