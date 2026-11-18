<?php
require 'db_config.php';

try {
    $pdo->beginTransaction();

    // 1. Seed Company
    $pdo->exec("INSERT IGNORE INTO companies (id, name, address, phone) VALUES (1, 'Softifyx Default', 'Main Blvd, Lahore', '042-111-222-333')");

    // 2. Seed User
    $pdo->exec("INSERT IGNORE INTO users (id, company_id, username, password, role) VALUES (1, 1, 'Administrator', '123', 'Admin')");

    // 2.5 Seed Financial Year
    $pdo->exec("INSERT IGNORE INTO financial_years (id, company_id, start_date, end_date, abbreviation, is_default) VALUES (1, 1, '2026-01-01', '2026-12-31', '2026', 1)");

    // 3. Seed COA
    $pdo->exec("INSERT IGNORE INTO coa_main (id, company_id, code, name, component) VALUES (1, 1, 1, 'Assets', 'Asset')");
    $pdo->exec("INSERT IGNORE INTO coa_sub (id, company_id, main_id, code, name) VALUES (1, 1, 1, '11', 'Current Assets')");
    $pdo->exec("INSERT IGNORE INTO coa_list (id, company_id, sub_id, code, name) VALUES (1, 1, 1, '1101', 'Accounts Receivable - Hamza Malik')");
    $pdo->exec("INSERT IGNORE INTO coa_list (id, company_id, sub_id, code, name) VALUES (2, 1, 1, '1102', 'Accounts Receivable - Naimat Trading')");

    // 4. Seed Customers
    $pdo->exec("INSERT IGNORE INTO customers (id, company_id, coa_list_id, contact_person, address, telephone, mobile, st_reg_no, ntn_cnic, credit_limit, remarks) 
        VALUES (1, 1, 1, 'Hamza Malik', 'Model Town, Lahore, Pakistan', '042-35851234', '0300-1234567', '3277876123456', 'NTN-8765432', 500000.00, 'VIP Customer')");
    $pdo->exec("INSERT IGNORE INTO customers (id, company_id, coa_list_id, contact_person, address, telephone, mobile, st_reg_no, ntn_cnic, credit_limit, remarks) 
        VALUES (2, 1, 2, 'Naimat Trading Co.', 'Karachi Central, Sindh', '021-34567890', '0321-9876543', '4399876123488', 'NTN-7654321', 1000000.00, 'Regular Client')");

    // 5. Seed Inventory Categories and Brands
    $pdo->exec("INSERT IGNORE INTO inv_main_categories (id, company_id, code, name) VALUES (1, 1, 'MC1', 'Electronics')");
    $pdo->exec("INSERT IGNORE INTO inv_sub_categories (id, company_id, main_id, code, name) VALUES (1, 1, 1, 'SC1', 'Laptops')");
    $pdo->exec("INSERT IGNORE INTO inv_brands (id, company_id, name) VALUES (1, 1, 'HP')");

    // 6. Seed Items
    $pdo->exec("INSERT IGNORE INTO inv_items (id, company_id, sub_id, code, name, description, brand_id, purchase_price, selling_price, unit, qty_per_piece) 
        VALUES (1, 1, 1, 'LAP001', 'HP EliteBook 840', 'Intel Core i7, 16GB RAM, 512GB SSD', 1, 110000.00, 120000.00, 'Pcs', 1.00)");
    $pdo->exec("INSERT IGNORE INTO inv_items (id, company_id, sub_id, code, name, description, brand_id, purchase_price, selling_price, unit, qty_per_piece) 
        VALUES (2, 1, 1, 'LAP002', 'HP EliteBook 850', 'Intel Core i7, 32GB RAM, 1TB SSD', 1, 160000.00, 185000.00, 'Box', 12.00)");

    // 7. Seed Employees
    $pdo->exec("INSERT IGNORE INTO employees (id, company_id, name, father_name, designation, remarks) 
        VALUES (1, 1, 'Muhammad Ali', 'Akbar Ali', 'Sales Representative', 'Active')");
    $pdo->exec("INSERT IGNORE INTO employees (id, company_id, name, father_name, designation, remarks) 
        VALUES (2, 1, 'Ayesha Khan', 'Kamil Khan', 'Key Accounts Lead', 'Active')");

    // 8. Seed Job Cards
    $pdo->exec("INSERT IGNORE INTO job_cards (id, company_id, job_no, description) VALUES (1, 1, 101, 'Software Licensing & Implementation')");
    $pdo->exec("INSERT IGNORE INTO job_cards (id, company_id, job_no, description) VALUES (2, 1, 102, 'ERP Customization and Setup')");

    // 9. Seed Inventory Locations
    $pdo->exec("INSERT IGNORE INTO inv_locations (id, company_id, name, is_default) VALUES (1, 1, 'Warehouse A', 1)");
    $pdo->exec("INSERT IGNORE INTO inv_locations (id, company_id, name, is_default) VALUES (2, 1, 'Showroom B', 0)");

    $pdo->commit();
    echo "SUCCESS: Database Seeded Perfectly!";
} catch (Exception $e) {
    $pdo->rollBack();
    echo "ERROR: " . $e->getMessage();
}
?>
