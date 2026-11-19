<?php
require 'db_config.php';
$stmt = $pdo->prepare("
    SELECT 
        r.id,
        r.serial_no,
        r.receipt_date,
        r.receipt_type,
        c.name AS cash_account_name,
        v.name AS customer_name,
        r.is_cancelled,
        r.is_posted,
        r.total_amount,
        COALESCE((SELECT SUM(wht_amount) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_wht,
        COALESCE((SELECT SUM(gst_amount) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_gst,
        COALESCE((SELECT SUM(advance_adjusted) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_adv,
        COALESCE((SELECT SUM(discount_given) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_disc,
        COALESCE((SELECT SUM(received_amount) FROM cash_receipt_items WHERE receipt_id = r.id), 0) AS total_rcvd_amount
    FROM cash_receipts r
    LEFT JOIN coa_list c ON r.cash_account_coa_id = c.id
    LEFT JOIN coa_list v ON r.received_from_coa_id = v.id
    WHERE r.company_id = 1
    ORDER BY r.serial_no ASC
    LIMIT 1
");
try {
    $stmt->execute();
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch(Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
