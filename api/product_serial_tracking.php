<?php
require_once 'db_config.php';
require_once 'auth.php';

$action = $_GET['action'] ?? '';
$company_id = $_GET['company_id'] ?? ($_SESSION['company_id'] ?? 1);
$serial = $_GET['serial_no'] ?? '';

if ($action === 'search') {
    if (empty($serial)) {
        sendResponse(['error' => 'Serial number is required']);
    }

    $searchTerm = '%' . $serial . '%';

    try {
        $queries = [];

        // 1. Purchase Invoices
        $queries[] = "
            SELECT 
                CONCAT('PI-', p.serial_no) as tran_no,
                p.invoice_date as date,
                COALESCE(inv.code, coa_item.code, '') as item_code,
                COALESCE(inv.name, coa_item.name, i.description, '') as item_name,
                coa_party.name as party_name,
                COALESCE(v.address, c.address, '') as address,
                COALESCE(v.telephone, c.telephone, v.mobile, c.mobile, '') as telephone
            FROM purchase_invoices p
            JOIN purchase_invoice_items i ON p.id = i.invoice_id
            LEFT JOIN inv_items inv ON i.item_coa_id = inv.id
            LEFT JOIN coa_list coa_item ON i.item_coa_id = coa_item.id
            LEFT JOIN coa_list coa_party ON p.vendor_coa_id = coa_party.id
            LEFT JOIN vendors v ON coa_party.id = v.coa_list_id
            LEFT JOIN customers c ON coa_party.id = c.coa_list_id
            WHERE p.company_id = :cid 
              AND (i.description LIKE :serial OR p.remarks LIKE :serial)
        ";

        // 2. Purchase Returns
        $queries[] = "
            SELECT 
                CONCAT('PR-', p.serial_no) as tran_no,
                p.return_date as date,
                COALESCE(inv.code, coa_item.code, '') as item_code,
                COALESCE(inv.name, coa_item.name, i.description, '') as item_name,
                coa_party.name as party_name,
                COALESCE(v.address, c.address, '') as address,
                COALESCE(v.telephone, c.telephone, v.mobile, c.mobile, '') as telephone
            FROM purchase_returns p
            JOIN purchase_return_items i ON p.id = i.return_id
            LEFT JOIN inv_items inv ON i.item_coa_id = inv.id
            LEFT JOIN coa_list coa_item ON i.item_coa_id = coa_item.id
            LEFT JOIN coa_list coa_party ON p.vendor_coa_id = coa_party.id
            LEFT JOIN vendors v ON coa_party.id = v.coa_list_id
            LEFT JOIN customers c ON coa_party.id = c.coa_list_id
            WHERE p.company_id = :cid 
              AND (i.description LIKE :serial OR p.remarks LIKE :serial)
        ";

        // 3. Sale Invoices
        $queries[] = "
            SELECT 
                CONCAT('SI-', s.serial_no) as tran_no,
                s.invoice_date as date,
                COALESCE(inv.code, coa_item.code, '') as item_code,
                COALESCE(inv.name, coa_item.name, i.description, '') as item_name,
                coa_party.name as party_name,
                COALESCE(c.address, v.address, '') as address,
                COALESCE(c.telephone, v.telephone, c.mobile, v.mobile, '') as telephone
            FROM sale_invoices s
            JOIN sale_invoice_items i ON s.id = i.invoice_id
            LEFT JOIN inv_items inv ON i.item_coa_id = inv.id
            LEFT JOIN coa_list coa_item ON i.item_coa_id = coa_item.id
            LEFT JOIN coa_list coa_party ON s.customer_coa_id = coa_party.id
            LEFT JOIN customers c ON coa_party.id = c.coa_list_id
            LEFT JOIN vendors v ON coa_party.id = v.coa_list_id
            WHERE s.company_id = :cid 
              AND (i.description LIKE :serial OR s.remarks LIKE :serial)
        ";

        // 4. Sale Returns
        $queries[] = "
            SELECT 
                CONCAT('SR-', s.serial_no) as tran_no,
                s.return_date as date,
                COALESCE(inv.code, coa_item.code, '') as item_code,
                COALESCE(inv.name, coa_item.name, i.description, '') as item_name,
                coa_party.name as party_name,
                COALESCE(c.address, v.address, '') as address,
                COALESCE(c.telephone, v.telephone, c.mobile, v.mobile, '') as telephone
            FROM sale_returns s
            JOIN sale_return_items i ON s.id = i.return_id
            LEFT JOIN inv_items inv ON i.item_coa_id = inv.id
            LEFT JOIN coa_list coa_item ON i.item_coa_id = coa_item.id
            LEFT JOIN coa_list coa_party ON s.customer_coa_id = coa_party.id
            LEFT JOIN customers c ON coa_party.id = c.coa_list_id
            LEFT JOIN vendors v ON coa_party.id = v.coa_list_id
            WHERE s.company_id = :cid 
              AND (i.description LIKE :serial OR s.remarks LIKE :serial)
        ";

        $finalQuery = implode(" UNION ALL ", $queries) . " ORDER BY date ASC";

        $stmt = $pdo->prepare($finalQuery);
        // Bind the parameters manually because we have multiple placeholders with the same name
        // PDO doesn't always allow reusing named parameters cleanly unless emulated prepares are on.
        // It's safer to use indexed or distinct parameters, but since we repeated :cid and :serial,
        // we can just use bindParam in a loop, or substitute them.

        // Wait, standard PDO allows reusing named parameters!
        $stmt->execute([
            ':cid' => $company_id,
            ':serial' => $searchTerm
        ]);

        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendResponse(['status' => 'success', 'records' => $records]);
    } catch (Exception $e) {
        sendResponse(['error' => $e->getMessage()]);
    }
}

