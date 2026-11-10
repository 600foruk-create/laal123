-- ========================================================
-- SoftifyX ERP MySQL Database Schema
-- Optimized for Hostinger Deployment
-- ========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- 1. Companies Table (Administrator: My Company & List of Companies)
CREATE TABLE IF NOT EXISTS `companies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL UNIQUE,
  `address` text,
  `phone` varchar(100),
  `fax` varchar(100),
  `email` varchar(255),
  `website` varchar(255),
  `gst` varchar(100),
  `ntn` varchar(100),
  `deals_in` varchar(255),
  `logo_data` LONGTEXT, -- Stores Base64 Logo (Administrator: My Logo)
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Users Table (Administrator: User Logins)
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) DEFAULT NULL, -- Link to company if needed
  `username` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('Admin', 'Operator', 'Viewer') DEFAULT 'Operator',
  `email` varchar(255),
  `status` enum('Active', 'Inactive') DEFAULT 'Active',
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `user_company` (`username`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. User Rights Table (Administrator: User Rights)
CREATE TABLE IF NOT EXISTS `user_rights` (
  `user_id` int(11) NOT NULL,
  `module_name` varchar(100) NOT NULL,
  `is_allowed` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`user_id`, `module_name`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Financial Years Table (Administrator: Financial Year)
CREATE TABLE IF NOT EXISTS `financial_years` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `abbreviation` varchar(10) NOT NULL,
  `is_default` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Currencies Table (Administrator: Currency)
CREATE TABLE IF NOT EXISTS `currencies` (
  `company_id` int(11) NOT NULL,
  `name` varchar(100) DEFAULT 'Pakistani Rupee',
  `symbol` varchar(5) DEFAULT 'Rs.',
  `abbreviation` varchar(5) DEFAULT 'PKR',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Chart of Accounts - Level 1 (Maintain: Chart of Accounts)
CREATE TABLE IF NOT EXISTS `coa_main` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `code` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `component` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `main_code_company` (`code`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Chart of Accounts - Level 2 (Maintain: Chart of Accounts)
CREATE TABLE IF NOT EXISTS `coa_sub` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `main_id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`main_id`) REFERENCES `coa_main`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `sub_code_company` (`code`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Chart of Accounts - Level 3 (Maintain: Chart of Accounts)
CREATE TABLE IF NOT EXISTS `coa_list` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `sub_id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`sub_id`) REFERENCES `coa_sub`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `list_code_company` (`code`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Dashboard Summary Table (For Real-time Sync of Home View)
CREATE TABLE IF NOT EXISTS `dashboard_summary` (
  `company_id` int(11) NOT NULL,
  `sales` decimal(20,2) DEFAULT 0,
  `cash_opening` decimal(20,2) DEFAULT 0,
  `cash_receipts` decimal(20,2) DEFAULT 0,
  `cash_payments` decimal(20,2) DEFAULT 0,
  `bank_balance` decimal(20,2) DEFAULT 0,
  `rec_opening` decimal(20,2) DEFAULT 0,
  `rec_sales` decimal(20,2) DEFAULT 0,
  `rec_receipts` decimal(20,2) DEFAULT 0,
  `pay_opening` decimal(20,2) DEFAULT 0,
  `pay_purchases` decimal(20,2) DEFAULT 0,
  `pay_payments` decimal(20,2) DEFAULT 0,
  `new_invoices` int(11) DEFAULT 0,
  `customer_receipts` decimal(20,2) DEFAULT 0,
  `overdue` decimal(20,2) DEFAULT 0,
  `new_purchases` int(11) DEFAULT 0,
  `vendor_payments` decimal(20,2) DEFAULT 0,
  `outstanding` decimal(20,2) DEFAULT 0,
  PRIMARY KEY (`company_id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Initial Setup: Create Administrator User
-- IMPORTANT: Passwords will be handled by auth.php (plaintext for now to match current localStorage logic, but recommend hashing in future)
-- INSERT INTO `companies` (name) VALUES ('Softifyx Default');
-- INSERT INTO `users` (company_id, username, password, role) VALUES (1, 'Administrator', '123', 'Admin');

-- 10. Regions Table (Maintain: Regions)
CREATE TABLE IF NOT EXISTS `regions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Sub-Regions Table (Maintain: Sub-Regions)
CREATE TABLE IF NOT EXISTS `sub_regions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `region_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Business Sectors Table (Maintain: Sectors)
CREATE TABLE IF NOT EXISTS `business_sectors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Customers Table (Maintain: Customers)
CREATE TABLE IF NOT EXISTS `customers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `coa_list_id` int(11) NOT NULL, -- Link to Chart of Accounts entry
  `contact_person` varchar(255),
  `address` text,
  `region_id` int(11),
  `sub_region_id` int(11),
  `telephone` varchar(100),
  `mobile` varchar(100),
  `fax` varchar(100),
  `email` varchar(255),
  `website` varchar(255),
  `st_reg_no` varchar(100),
  `ntn_cnic` varchar(100),
  `cnic` varchar(50) DEFAULT NULL,
  `buyer_type_id` int(11) DEFAULT NULL,
  `cust_tax_type_id` int(11) DEFAULT NULL,
  `sales_tax_rate` decimal(10,2) DEFAULT 0.00,
  `further_tax_rate` decimal(10,2) DEFAULT 0.00,
  `wh_tax_rate` decimal(10,2) DEFAULT 0.00,
  `business_sector_id` int(11),
  `acc_manager_id` int(11), -- Link to users table
  `credit_limit` decimal(20,2) DEFAULT 0,
  `credit_terms` varchar(255) DEFAULT 'CASH',
  `remarks` text,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coa_list_id`) REFERENCES `coa_list`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`sub_region_id`) REFERENCES `sub_regions`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`business_sector_id`) REFERENCES `business_sectors`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`acc_manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. Departments Table (Maintain: Employees)
CREATE TABLE IF NOT EXISTS `departments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. Employees Table (Maintain: Employees)
CREATE TABLE IF NOT EXISTS `employees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `father_name` varchar(255),
  `address` text,
  `telephone` varchar(100),
  `email` varchar(255),
  `nic_no` varchar(100),
  `dob` date,
  `joining_date` date,
  `salary` decimal(20,2) DEFAULT 0,
  `designation` varchar(255),
  `department_id` int(11),
  `remarks` text,
  `reference` varchar(255),
  `job_left` tinyint(1) DEFAULT 0,
  `leaving_date` date,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. Vendors Table (Maintain: Vendors/Suppliers)
CREATE TABLE IF NOT EXISTS `vendors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `coa_list_id` int(11) NOT NULL, -- Link to Chart of Accounts entry
  `contact_person` varchar(255),
  `address` text,
  `telephone` varchar(100),
  `mobile` varchar(100),
  `fax` varchar(100),
  `email` varchar(255),
  `website` varchar(255),
  `st_reg_no` varchar(100),
  `ntn_cnic` varchar(100),
  `credit_terms` varchar(255) DEFAULT 'CASH',
  `remarks` text,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`coa_list_id`) REFERENCES `coa_list`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;

-- 17. Inventory Main Categories (Maintain: Chart of Inventory)
CREATE TABLE IF NOT EXISTS `inv_main_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `category_type` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `inv_main_code_company` (`code`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. Inventory Sub Categories (Maintain: Chart of Inventory)
CREATE TABLE IF NOT EXISTS `inv_sub_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `main_id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`main_id`) REFERENCES `inv_main_categories`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `inv_sub_code_company` (`code`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. Inventory Brands (Maintain: Chart of Inventory)
CREATE TABLE IF NOT EXISTS `inv_brands` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. Inventory Items (Maintain: Chart of Inventory)
CREATE TABLE IF NOT EXISTS `inv_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `sub_id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `brand_id` int(11),
  `rack_no` varchar(100),
  `purchase_price` decimal(20,2) DEFAULT 0,
  `selling_price` decimal(20,2) DEFAULT 0,
  `unit` varchar(50),
  `qty_per_piece` decimal(20,2) DEFAULT 0,
  `tax_rate` decimal(10,2) DEFAULT 0,
  `tax_type` varchar(20) DEFAULT 'Percent',
  `valuation_method` varchar(50) DEFAULT 'Weighted Average',
  `valuation_cost` decimal(20,2) DEFAULT 0,
  `order_qty` decimal(20,2) DEFAULT 0,
  `category_type` varchar(50) DEFAULT NULL,
  `size` varchar(100) DEFAULT NULL,
  `length` varchar(100) DEFAULT NULL,
  `unit_weight` decimal(10,2) DEFAULT NULL,
  `class` varchar(100) DEFAULT NULL,
  `fitting_type` varchar(100) DEFAULT NULL,
  `carton` int(11) DEFAULT NULL,
  `material` varchar(100) DEFAULT NULL,
  `grade_specification` varchar(100) DEFAULT NULL,
  `is_inactive` tinyint(1) DEFAULT 0,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`sub_id`) REFERENCES `inv_sub_categories`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`brand_id`) REFERENCES `inv_brands`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `inv_item_code_company` (`code`, `company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

