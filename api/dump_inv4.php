<?php
require_once 'db_config.php';
$sn = 4;
$is_tax = 0;
$company_id = 1;

$stmt = $pdo->prepare("SELECT * FROM sale_invoices WHERE serial_no=? AND is_tax_invoice=? AND company_id=?");
$stmt->execute([$sn, $is_tax, $company_id]);
$inv = $stmt->fetch();

if ($inv) {
    echo "Invoice ID: " . $inv['id'] . "\n";
    $stmt = $pdo->prepare("SELECT * FROM sale_invoice_items WHERE invoice_id=?");
    $stmt->execute([$inv['id']]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Items:\n";
    print_r($items);
} else {
    echo "Invoice not found for SN 4\n";
}
