/**
 * SoftifyX ERP - Advanced User Rights & Permissions Manager
 * Categorized tabs, granular CRUD permissions, quick role presets, and instant search
 */

(function(window) {
    'use strict';

    const USER_RIGHTS_MODULES = [
        // 1. Administration
        { category: 'Administration', name: 'My Company', desc: 'Company Profile & Setup' },
        { category: 'Administration', name: 'My Logo', desc: 'Company Logo & Branding' },
        { category: 'Administration', name: 'List Of Companies', desc: 'Manage Multiple Companies' },
        { category: 'Administration', name: 'User Logins', desc: 'Manage Users & Credentials' },
        { category: 'Administration', name: 'User Rights', desc: 'Role Permissions & Access Control' },
        { category: 'Administration', name: 'Passwords', desc: 'Change User Passwords' },
        { category: 'Administration', name: 'Financial Year', desc: 'Financial Years & Lock Periods' },
        { category: 'Administration', name: 'Clear Transactions', desc: 'Clear Test Data / Transactions' },
        { category: 'Administration', name: 'Currency', desc: 'Currency & Symbol Settings' },
        { category: 'Administration', name: 'BackUp Utility', desc: 'Database Backup & Restore' },
        { category: 'Administration', name: 'System Settings', desc: 'Global ERP Configuration & Theme' },
        { category: 'Administration', name: 'Approval Desk', desc: 'Voucher & Document Approvals' },
        { category: 'Administration', name: 'User Login & Session History', desc: 'Active Sessions & Audit Trail' },

        // 2. Maintain / Masters
        { category: 'Maintain / Masters', name: 'Chart of Accounts', desc: 'Accounts & GL Tree' },
        { category: 'Maintain / Masters', name: 'Customers', desc: 'Customer Accounts & Information' },
        { category: 'Maintain / Masters', name: 'Vendors/Suppliers', desc: 'Supplier & Vendor Accounts' },
        { category: 'Maintain / Masters', name: 'Bank Accounts', desc: 'Bank Books & Accounts' },
        { category: 'Maintain / Masters', name: 'Accounts Opening Balances', desc: 'Initial Account Balances' },
        { category: 'Maintain / Masters', name: 'Chart Of Inventory', desc: 'Items Master & Categories' },
        { category: 'Maintain / Masters', name: 'Inventory Opening Balances', desc: 'Initial Stock Balances' },
        { category: 'Maintain / Masters', name: 'Inventory Brands', desc: 'Item Brands & Makes' },
        { category: 'Maintain / Masters', name: 'Inventory Locations', desc: 'Warehouses & Godowns' },
        { category: 'Maintain / Masters', name: 'Item Price Settings', desc: 'Selling Rates & Wholesale Pricing' },
        { category: 'Maintain / Masters', name: 'Item Sales Tax Rates', desc: 'Tax Slabs & GST %' },
        { category: 'Maintain / Masters', name: 'Item Pre-Order Levels', desc: 'Reorder Levels & Safety Stock' },
        { category: 'Maintain / Masters', name: 'Item Cost Valuation Method', desc: 'FIFO / Weighted Average Method' },
        { category: 'Maintain / Masters', name: 'Chart Of Services', desc: 'Service Items & Charges' },
        { category: 'Maintain / Masters', name: 'Voucher Posting Preferences', desc: 'Auto Post & Numbering' },
        { category: 'Maintain / Masters', name: 'Inventory Movement Settings', desc: 'Stock In/Out Source & Negative Policy' },
        { category: 'Maintain / Masters', name: 'Monthly Inventory Closing', desc: 'Monthly Stock Audit & Freeze' },
        { category: 'Maintain / Masters', name: 'Customer Regions', desc: 'Cities, Areas & Territories' },
        { category: 'Maintain / Masters', name: 'Customer Types & Rates', desc: 'Customer Tax Categories' },
        { category: 'Maintain / Masters', name: 'Buyer Types & Rates', desc: 'FBR Buyer Types & Withholding' },
        { category: 'Maintain / Masters', name: 'Business Sectors', desc: 'Industry & Business Sectors' },
        { category: 'Maintain / Masters', name: 'Employees', desc: 'Staff & Sales Personnel' },
        { category: 'Maintain / Masters', name: 'Jobs', desc: 'Project & Job Costing' },
        { category: 'Maintain / Masters', name: 'Drivers', desc: 'Transport Drivers & Logistics' },
        { category: 'Maintain / Masters', name: 'HS Codes', desc: 'Customs HS Tariff Codes' },
        { category: 'Maintain / Masters', name: 'Price List Management', desc: 'Price Revisions & Bulk Price Update' },

        // 3. Sales & Billing
        { category: 'Sales & Billing', name: 'Sale Invoice', desc: 'Tax & Non-Tax Sale Invoices' },
        { category: 'Sales & Billing', name: 'Sales Tax Invoices', desc: 'Standard Sales Tax Invoices' },
        { category: 'Sales & Billing', name: 'Sale Invoices (Non Tax)', desc: 'Non-Tax Commercial Invoices' },
        { category: 'Sales & Billing', name: 'Quotations', desc: 'Sales Quotations & Estimates' },
        { category: 'Sales & Billing', name: 'Sale Orders', desc: 'Customer Sales Orders' },
        { category: 'Sales & Billing', name: 'Delivery Challans', desc: 'Outward Delivery Notes' },
        { category: 'Sales & Billing', name: 'Sale Return / Credit Notes', desc: 'Sale Returns & Credit Notes' },
        { category: 'Sales & Billing', name: 'Cash Receipts', desc: 'Cash Received From Customers' },
        { category: 'Sales & Billing', name: 'Bank Receipts', desc: 'Bank / Cheque Received From Customers' },
        { category: 'Sales & Billing', name: 'Customer Follow-Up', desc: 'Collection Follow-Up & Calls' },

        // 4. Purchases
        { category: 'Purchases', name: 'Purchase Orders', desc: 'Vendor Purchase Orders' },
        { category: 'Purchases', name: 'Purchase Invoice', desc: 'Vendor Purchase Bills' },
        { category: 'Purchases', name: 'Purchases (Sales Tax)', desc: 'Tax Purchase Invoices' },
        { category: 'Purchases', name: 'Purchases (Non Tax)', desc: 'Non-Tax Purchase Invoices' },
        { category: 'Purchases', name: 'Purchase Return / Debit Note', desc: 'Purchase Returns & Debit Notes' },
        { category: 'Purchases', name: 'Cash Payments', desc: 'Cash Paid To Suppliers & Expenses' },
        { category: 'Purchases', name: 'Bank Payments', desc: 'Bank / Cheque Payments To Vendors' },

        // 5. Store & Production
        { category: 'Store & Production', name: 'Inward Gate Passes', desc: 'Raw Material / Goods Arrival' },
        { category: 'Store & Production', name: 'Outward Gate Passes', desc: 'Goods Dispatch Gate Passes' },
        { category: 'Store & Production', name: 'Material Issue Notes', desc: 'Raw Material Consumption' },
        { category: 'Store & Production', name: 'Production Notes', desc: 'Finished Goods Production' },
        { category: 'Store & Production', name: 'Inventory Transfers', desc: 'Godown To Godown Transfers' },
        { category: 'Store & Production', name: 'Add Inventory Adjustments', desc: 'Manual Stock Additions' },
        { category: 'Store & Production', name: 'Reduce Inventory Adjustments', desc: 'Stock Wastage & Reductions' },
        { category: 'Store & Production', name: 'Auto Adjustments', desc: 'Automated Stock Corrections' },
        { category: 'Store & Production', name: 'Formulas', desc: 'BOM / Production Recipes' },
        { category: 'Store & Production', name: 'Monthly Stock Closing & Audit', desc: 'Physical Count Verification' },

        // 6. Retail & POS
        { category: 'Retail & POS', name: 'POS Sale', desc: 'Point of Sale Retail Counter' },
        { category: 'Retail & POS', name: 'POS Sales Register', desc: 'POS Daily Invoices Register' },
        { category: 'Retail & POS', name: 'POS Sales Return', desc: 'Counter Sales Returns' },
        { category: 'Retail & POS', name: 'POS Hold / Recall Register', desc: 'Held Carts & Pending Orders' },
        { category: 'Retail & POS', name: 'POS Day Closing', desc: 'Cash Drawer Reconciliation & Shift Close' },
        { category: 'Retail & POS', name: 'POS Reports', desc: 'Retail Summary & Sales Reports' },

        // 7. Digital Invoicing (FBR)
        { category: 'Digital Invoicing (FBR)', name: 'FBR Digital Invoice', desc: 'Live FBR Invoicing Portal' },
        { category: 'Digital Invoicing (FBR)', name: 'Digital Invoice Sales Register', desc: 'FBR Verified Invoices Register' },
        { category: 'Digital Invoicing (FBR)', name: 'FBR Digital Credit Note', desc: 'FBR Credit Notes' },
        { category: 'Digital Invoicing (FBR)', name: 'FBR Digital Debit Note', desc: 'FBR Debit Notes' },
        { category: 'Digital Invoicing (FBR)', name: 'FBR Invoice Cancellation', desc: 'Cancel FBR Invoices' },
        { category: 'Digital Invoicing (FBR)', name: 'Digital Invoice - Integration Settings', desc: 'FBR API Sandbox / Live Keys' },
        { category: 'Digital Invoicing (FBR)', name: 'Digital Invoice Reports', desc: 'FBR Sync Audit & Annexures' },
        { category: 'Digital Invoicing (FBR)', name: 'Digital Invoice Integration Log', desc: 'API Transmission Logs' },

        // 8. SMS & Reminders
        { category: 'SMS & Reminders', name: 'Payment Reminder (Credit Control)', desc: 'Credit Ageing Payment Reminders' },
        { category: 'SMS & Reminders', name: 'Send Ledger Summary', desc: 'Direct Ledger Balance Messages' },
        { category: 'SMS & Reminders', name: 'SMS Templates', desc: 'Custom Message Drafts' },
        { category: 'SMS & Reminders', name: 'Bulk Messages', desc: 'Mass Marketing & Broadcast SMS' },

        // 9. Notes & General Journal
        { category: 'Notes & General Journal', name: 'General Journal Voucher', desc: 'JV / Adjustment Journal Entries' },
        { category: 'Notes & General Journal', name: 'Journal Notes', desc: 'Internal Department Notes & Memos' },
        { category: 'Notes & General Journal', name: 'Notifications from Admin', desc: 'System Broadcast Notifications' },

        // 10. Financial Reports
        { category: 'Financial Reports', name: 'Trial Balance', desc: 'Standard & Grouped Trial Balance' },
        { category: 'Financial Reports', name: 'Balance Sheet', desc: 'Assets, Liabilities & Equity Statement' },
        { category: 'Financial Reports', name: 'Income Statement', desc: 'Profit & Loss Statement' },
        { category: 'Financial Reports', name: 'View Account Ledger', desc: 'On-Screen Interactive GL Ledger' },
        { category: 'Financial Reports', name: 'Print Accounts Ledgers', desc: 'Printable / PDF Customer & GL Ledgers' },
        { category: 'Financial Reports', name: 'Cash & Bank Balances', desc: 'Cash in Hand & Bank Balances' },
        { category: 'Financial Reports', name: 'Customer Balances', desc: 'Accounts Receivable Balances' },
        { category: 'Financial Reports', name: 'Vendor Balances', desc: 'Accounts Payable Balances' },
        { category: 'Financial Reports', name: 'Journal Report', desc: 'Daily Book / Transaction Journal' },
        { category: 'Financial Reports', name: 'Print Voucher', desc: 'Print Any Journal / Cash Voucher' },
        { category: 'Financial Reports', name: 'Job Ledgers', desc: 'Job / Project Expense Ledgers' },
        { category: 'Financial Reports', name: 'Tax Transaction Report', desc: 'Tax Audit & Sales Tax Summary' },

        // 11. Sales & Purchase Reports
        { category: 'Sales & Purchase Reports', name: 'Sale Summary', desc: 'Total Sales Overview' },
        { category: 'Sales & Purchase Reports', name: 'Sale Register', desc: 'Date-wise Sales Invoices Register' },
        { category: 'Sales & Purchase Reports', name: 'Party Sale Summary', desc: 'Customer-wise Sales Analysis' },
        { category: 'Sales & Purchase Reports', name: 'Recovery/Receipts Reports', desc: 'Payment Recovery & Receipts' },
        { category: 'Sales & Purchase Reports', name: 'Sale Activity Report - Invoice Wise', desc: 'Detailed Sales Invoices Breakdown' },
        { category: 'Sales & Purchase Reports', name: 'Sale Activity Report - Party Wise', desc: 'Customer Sales & Item History' },
        { category: 'Sales & Purchase Reports', name: 'Item Sale Summary', desc: 'Item-wise Quantity Sold' },
        { category: 'Sales & Purchase Reports', name: 'Item Sale Analysis', desc: 'Item Margin & Sales Volume' },
        { category: 'Sales & Purchase Reports', name: 'Services Analysis', desc: 'Service Revenue Breakdown' },
        { category: 'Sales & Purchase Reports', name: 'Accounts Receivable Aging', desc: 'Customer Ageing (30/60/90 Days)' },
        { category: 'Sales & Purchase Reports', name: 'Purchase Summary', desc: 'Total Purchases Overview' },
        { category: 'Sales & Purchase Reports', name: 'Purchase Register', desc: 'Date-wise Purchase Register' },
        { category: 'Sales & Purchase Reports', name: 'Party Purchase Summary', desc: 'Supplier-wise Purchase Analysis' },
        { category: 'Sales & Purchase Reports', name: 'Payments Reports', desc: 'Vendor Payment History' },
        { category: 'Sales & Purchase Reports', name: 'Purchase Activity Report - Invoice Wise', desc: 'Purchase Bills Detail' },
        { category: 'Sales & Purchase Reports', name: 'Purchase Activity Report - Party Wise', desc: 'Vendor Purchases History' },
        { category: 'Sales & Purchase Reports', name: 'Item Purchase Summary', desc: 'Item-wise Purchases Total' },
        { category: 'Sales & Purchase Reports', name: 'Item Purchase Analysis', desc: 'Item Purchase Pricing History' },
        { category: 'Sales & Purchase Reports', name: 'Accounts Payable Aging', desc: 'Vendor Ageing (30/60/90 Days)' },
        { category: 'Sales & Purchase Reports', name: 'Purchase Order Tracking', desc: 'Pending vs Received POs' },
        { category: 'Sales & Purchase Reports', name: 'Sale Order Tracking', desc: 'Pending vs Dispatched SOs' },

        // 12. Inventory Reports
        { category: 'Inventory Reports', name: 'View Inventory Ledgers', desc: 'Item Stock In / Out Ledger' },
        { category: 'Inventory Reports', name: 'Print Inventory Ledgers', desc: 'Printable Stock Ledger Sheet' },
        { category: 'Inventory Reports', name: 'Inventory Balances', desc: 'Current Live Godown Balances' },
        { category: 'Inventory Reports', name: 'Item-Wise Profit/Loss', desc: 'Gross Profit per Item Analysis' },
        { category: 'Inventory Reports', name: 'Material Consumption Report', desc: 'Raw Material Consumption' },
        { category: 'Inventory Reports', name: 'Production Report', desc: 'Finished Goods Manufactured' },
        { category: 'Inventory Reports', name: 'Item Below Re-Order Level', desc: 'Low Stock Alerts & Shortages' },
        { category: 'Inventory Reports', name: 'Product Serials Tracking', desc: 'Serial Numbers & Barcode Tracking' }
    ];

    const UserRightsManager = {
        modules: USER_RIGHTS_MODULES,
        activeCategory: 'All',
        searchTerm: '',
        currentRightsMap: {},
        usersList: [],
        currentUserId: null,
        isCurrentAdmin: false,

        init: async function() {
            try {
                await this.loadUsers();
                this.renderCategories();
                this.attachEventListeners();
                await this.loadUserRights();
            } catch (err) {
                console.error("UserRightsManager init error:", err);
            }
        },

        loadUsers: async function() {
            const selectEl = document.getElementById('urUserSelect');
            if (!selectEl) return;

            // Fetch users list from global users or API
            if (Array.isArray(window.users) && window.users.length > 0) {
                this.usersList = window.users;
            } else {
                try {
                    const companyId = localStorage.getItem('company_id') || 1;
                    const res = await fetch(`api/admin.php?action=get_users&company_id=${companyId}`, { credentials: 'same-origin' });
                    if (res.ok) {
                        this.usersList = await res.json();
                    }
                } catch(e) {
                    this.usersList = [];
                }
            }

            let opts = '';
            this.usersList.forEach(u => {
                const roleBadge = (u.role || 'User').toUpperCase();
                opts += `<option value="${u.id}">${u.username} (${roleBadge})</option>`;
            });
            selectEl.innerHTML = opts;

            if (this.usersList.length > 0) {
                this.currentUserId = this.usersList[0].id;
                selectEl.value = this.currentUserId;
            }
        },

        renderCategories: function() {
            const tabsContainer = document.getElementById('urCategoryTabs');
            if (!tabsContainer) return;

            const categories = ['All'];
            this.modules.forEach(m => {
                if (!categories.includes(m.category)) categories.push(m.category);
            });

            let html = '';
            categories.forEach(cat => {
                const count = (cat === 'All') 
                    ? this.modules.length 
                    : this.modules.filter(m => m.category === cat).length;
                const activeCls = (cat === this.activeCategory) ? 'ur-tab-active' : '';
                html += `
                    <button type="button" class="ur-tab-btn ${activeCls}" data-category="${cat}" onclick="window.UserRightsManager.switchCategory('${cat}')">
                        ${cat} <span class="ur-tab-count">${count}</span>
                    </button>
                `;
            });
            tabsContainer.innerHTML = html;
        },

        switchCategory: function(cat) {
            this.activeCategory = cat;
            document.querySelectorAll('.ur-tab-btn').forEach(btn => {
                if (btn.getAttribute('data-category') === cat) {
                    btn.classList.add('ur-tab-active');
                } else {
                    btn.classList.remove('ur-tab-active');
                }
            });
            this.renderTable();
        },

        attachEventListeners: function() {
            const searchInput = document.getElementById('urSearchInput');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value.trim().toLowerCase();
                    this.renderTable();
                });
            }

            const userSelect = document.getElementById('urUserSelect');
            if (userSelect) {
                userSelect.addEventListener('change', () => {
                    this.currentUserId = userSelect.value;
                    this.loadUserRights();
                });
            }
        },

        loadUserRights: async function() {
            const userSelect = document.getElementById('urUserSelect');
            if (!userSelect || !userSelect.value) return;
            this.currentUserId = userSelect.value;

            const userObj = (this.usersList || []).find(u => String(u.id) === String(this.currentUserId));
            this.isCurrentAdmin = (userObj && (String(userObj.username).toLowerCase() === 'administrator' || String(userObj.role).toLowerCase() === 'admin')) || (String(this.currentUserId) === '1');

            const adminNotice = document.getElementById('urAdminNotice');
            if (adminNotice) {
                adminNotice.style.display = this.isCurrentAdmin ? 'flex' : 'none';
            }

            this.currentRightsMap = {};

            try {
                const companyId = localStorage.getItem('company_id') || 1;
                const res = await fetch(`api/admin.php?action=get_rights&user_id=${this.currentUserId}&company_id=${companyId}&_cb=${Date.now()}`, { credentials: 'same-origin' });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        data.forEach(r => {
                            const modKey = (r.module_name || '').trim();
                            this.currentRightsMap[modKey] = {
                                allowed: parseInt(r.is_allowed) === 1,
                                view: parseInt(r.can_view) === 1,
                                create: parseInt(r.can_create !== undefined ? r.can_create : r.can_edit) === 1,
                                edit: parseInt(r.can_edit) === 1,
                                delete: parseInt(r.can_delete !== undefined ? r.can_delete : r.can_edit) === 1,
                                print: parseInt(r.can_print !== undefined ? r.can_print : (r.can_view || r.can_edit)) === 1
                            };
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading rights from backend:", err);
            }

            this.renderTable();
        },

        renderTable: function() {
            const tbody = document.getElementById('urTableBody');
            if (!tbody) return;

            let filtered = this.modules;
            if (this.activeCategory !== 'All') {
                filtered = filtered.filter(m => m.category === this.activeCategory);
            }
            if (this.searchTerm) {
                filtered = filtered.filter(m => 
                    m.name.toLowerCase().includes(this.searchTerm) || 
                    m.category.toLowerCase().includes(this.searchTerm) ||
                    (m.desc && m.desc.toLowerCase().includes(this.searchTerm))
                );
            }

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: #94a3b8;"><i class="fas fa-search" style="font-size: 20px; margin-bottom: 8px; display: block;"></i>No matching modules found</td></tr>`;
                return;
            }

            let rows = '';
            filtered.forEach((m, idx) => {
                const existing = this.currentRightsMap[m.name] || {};
                
                // If user is Admin, force all to 1
                const isAllowed = this.isCurrentAdmin ? true : !!existing.allowed;
                const canView = this.isCurrentAdmin ? true : (existing.view !== undefined ? existing.view : isAllowed);
                const canCreate = this.isCurrentAdmin ? true : (existing.create !== undefined ? existing.create : isAllowed);
                const canEdit = this.isCurrentAdmin ? true : (existing.edit !== undefined ? existing.edit : isAllowed);
                const canDelete = this.isCurrentAdmin ? true : (existing.delete !== undefined ? existing.delete : false);
                const canPrint = this.isCurrentAdmin ? true : (existing.print !== undefined ? existing.print : isAllowed);

                const statusColor = isAllowed ? '#10b981' : '#ef4444';
                const statusBg = isAllowed ? '#ecfdf5' : '#fef2f2';
                const statusText = isAllowed ? 'Allowed' : 'Not Allowed';
                const disabledAttr = this.isCurrentAdmin ? 'disabled title="Administrator has unrestricted access"' : '';

                rows += `
                    <tr class="ur-row ${isAllowed ? 'row-allowed' : 'row-denied'}" data-module="${m.name}" data-category="${m.category}" style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;">
                        <td style="padding: 8px 10px; color: #64748b; font-size: 11px; text-align: center; width: 35px;">${idx + 1}</td>
                        <td style="padding: 8px 12px; width: 320px;">
                            <div style="font-weight: 700; color: #1e293b; font-size: 12.5px;">${m.name}</div>
                            <div style="font-size: 10.5px; color: #64748b; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                <span style="background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 4px; font-weight: 600;">${m.category}</span>
                                <span>${m.desc || ''}</span>
                            </div>
                        </td>
                        <td style="text-align: center; width: 110px;">
                            <label class="ur-toggle-pill" style="cursor: pointer; display: inline-flex; align-items: center; gap: 5px; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}44; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; user-select: none;">
                                <input type="checkbox" class="ur-chk-allowed" ${isAllowed ? 'checked' : ''} ${disabledAttr} onchange="window.UserRightsManager.onAllowedToggle(this, '${m.name}')" style="display: none;">
                                <i class="fas ${isAllowed ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                <span>${statusText}</span>
                            </label>
                        </td>
                        <td style="text-align: center; width: 65px;">
                            <input type="checkbox" class="ur-chk-view" ${canView ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #0284c7;">
                        </td>
                        <td style="text-align: center; width: 65px;">
                            <input type="checkbox" class="ur-chk-create" ${canCreate ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #10b981;">
                        </td>
                        <td style="text-align: center; width: 65px;">
                            <input type="checkbox" class="ur-chk-edit" ${canEdit ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #f59e0b;">
                        </td>
                        <td style="text-align: center; width: 65px;">
                            <input type="checkbox" class="ur-chk-delete" ${canDelete ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #ef4444;">
                        </td>
                        <td style="text-align: center; width: 65px;">
                            <input type="checkbox" class="ur-chk-print" ${canPrint ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #6366f1;">
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = rows;
        },

        onAllowedToggle: function(chk, moduleName) {
            const row = chk.closest('tr');
            const isChecked = chk.checked;

            const pill = row.querySelector('.ur-toggle-pill');
            if (pill) {
                const color = isChecked ? '#10b981' : '#ef4444';
                const bg = isChecked ? '#ecfdf5' : '#fef2f2';
                pill.style.background = bg;
                pill.style.color = color;
                pill.style.borderColor = color + '44';
                pill.innerHTML = `<input type="checkbox" class="ur-chk-allowed" ${isChecked ? 'checked' : ''} onchange="window.UserRightsManager.onAllowedToggle(this, '${moduleName}')" style="display: none;"><i class="fas ${isChecked ? 'fa-check-circle' : 'fa-times-circle'}"></i> <span>${isChecked ? 'Allowed' : 'Not Allowed'}</span>`;
            }

            const subChecks = row.querySelectorAll('.ur-chk-view, .ur-chk-create, .ur-chk-edit, .ur-chk-delete, .ur-chk-print');
            subChecks.forEach(c => {
                c.disabled = !isChecked;
                if (!isChecked) {
                    c.checked = false;
                } else {
                    // Default upon allowing: View, Create, Print enabled
                    if (c.classList.contains('ur-chk-view') || c.classList.contains('ur-chk-create') || c.classList.contains('ur-chk-print')) {
                        c.checked = true;
                    }
                }
            });

            this.updateRightsMapFromRow(row);
        },

        onSubCheckChange: function(moduleName) {
            const row = document.querySelector(`tr[data-module="${moduleName}"]`);
            if (row) {
                this.updateRightsMapFromRow(row);
            }
        },

        updateRightsMapFromRow: function(row) {
            const mod = row.getAttribute('data-module');
            const isAllowed = row.querySelector('.ur-chk-allowed')?.checked || false;
            const canView = row.querySelector('.ur-chk-view')?.checked || false;
            const canCreate = row.querySelector('.ur-chk-create')?.checked || false;
            const canEdit = row.querySelector('.ur-chk-edit')?.checked || false;
            const canDelete = row.querySelector('.ur-chk-delete')?.checked || false;
            const canPrint = row.querySelector('.ur-chk-print')?.checked || false;

            this.currentRightsMap[mod] = {
                allowed: isAllowed,
                view: canView,
                create: canCreate,
                edit: canEdit,
                delete: canDelete,
                print: canPrint
            };
        },

        // Bulk Actions for currently visible / filtered category
        bulkSet: function(type, state) {
            if (this.isCurrentAdmin) return;
            const tbody = document.getElementById('urTableBody');
            if (!tbody) return;

            const rows = tbody.querySelectorAll('tr.ur-row');
            rows.forEach(row => {
                const mod = row.getAttribute('data-module');
                if (type === 'allowed') {
                    const chk = row.querySelector('.ur-chk-allowed');
                    if (chk && chk.checked !== state) {
                        chk.checked = state;
                        this.onAllowedToggle(chk, mod);
                    }
                } else {
                    // View, Create, Edit, Delete, Print
                    const isAllowed = row.querySelector('.ur-chk-allowed')?.checked;
                    if (isAllowed) {
                        const targetChk = row.querySelector(`.ur-chk-${type}`);
                        if (targetChk && !targetChk.disabled) {
                            targetChk.checked = state;
                        }
                    }
                    this.updateRightsMapFromRow(row);
                }
            });
        },

        // Preset Templates
        applyPreset: function(roleKey) {
            if (this.isCurrentAdmin) {
                alert("Administrator already possesses full, unrestricted access to all modules.");
                return;
            }
            if (!roleKey) return;

            if (!confirm(`Apply the "${roleKey.toUpperCase()}" template permissions to the selected user?`)) {
                return;
            }

            const self = this;
            this.modules.forEach(m => {
                let allowed = false, v = false, c = false, e = false, d = false, p = false;

                if (roleKey === 'admin') {
                    allowed = true; v = true; c = true; e = true; d = true; p = true;
                } else if (roleKey === 'cashier') {
                    // Cashier: Sales, POS, Cash receipts, view ledgers
                    if (['Sales & Billing', 'Retail & POS'].includes(m.category) || ['Cash Receipts', 'Customer Balances', 'Sale Invoice'].includes(m.name)) {
                        allowed = true; v = true; c = true; e = false; d = false; p = true;
                    }
                } else if (roleKey === 'accountant') {
                    // Accountant: Maintain, Purchases, Sales, Vouchers, Ledgers, Reports
                    if (!['Administration', 'Retail & POS'].includes(m.category) && !['Clear Transactions', 'System Settings'].includes(m.name)) {
                        allowed = true; v = true; c = true; e = true; d = false; p = true;
                    }
                } else if (roleKey === 'store') {
                    // Store keeper: Store & Production, Stock reports
                    if (m.category === 'Store & Production' || m.category === 'Inventory Reports' || ['Monthly Inventory Closing', 'Chart Of Inventory'].includes(m.name)) {
                        allowed = true; v = true; c = true; e = false; d = false; p = true;
                    }
                } else if (roleKey === 'viewer') {
                    // Read only viewer
                    allowed = true; v = true; c = false; e = false; d = false; p = true;
                } else if (roleKey === 'revoke') {
                    allowed = false;
                }

                self.currentRightsMap[m.name] = {
                    allowed: allowed,
                    view: v,
                    create: c,
                    edit: e,
                    delete: d,
                    print: p
                };
            });

            this.renderTable();
        },

        saveChanges: async function() {
            const userSelect = document.getElementById('urUserSelect');
            if (!userSelect || !userSelect.value) {
                alert("Please select a user first.");
                return;
            }

            const userId = userSelect.value;
            const saveBtn = document.getElementById('urSaveBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }

            // Sync currently visible DOM inputs into currentRightsMap
            document.querySelectorAll('#urTableBody tr.ur-row').forEach(row => {
                this.updateRightsMapFromRow(row);
            });

            // Build payload for all modules in our master list
            const payload = [];
            this.modules.forEach(m => {
                const r = this.currentRightsMap[m.name] || {};
                const isAllowed = r.allowed ? 1 : 0;
                payload.push({
                    module: m.name,
                    allowed: isAllowed,
                    can_view: r.view ? 1 : 0,
                    can_create: r.create ? 1 : 0,
                    can_edit: r.edit ? 1 : 0,
                    can_delete: r.delete ? 1 : 0,
                    can_print: r.print ? 1 : 0
                });
            });

            try {
                const companyId = localStorage.getItem('company_id') || 1;
                const res = await fetch(`api/admin.php?action=save_rights&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ user_id: userId, rights: payload })
                });

                const data = await res.json();
                if (data && data.status === 'success') {
                    // Update current user's session rights if editing own rights
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    if (String(session.user_id) === String(userId)) {
                        window.currentUserRights = {};
                        payload.forEach(p => {
                            window.currentUserRights[p.module] = p;
                        });
                    }

                    const toast = document.getElementById('urToastMsg');
                    if (toast) {
                        toast.style.display = 'inline-block';
                        setTimeout(() => { toast.style.display = 'none'; }, 3000);
                    } else {
                        alert("User rights saved successfully!");
                    }
                } else {
                    alert("Failed to save rights: " + (data.message || 'Unknown error'));
                }
            } catch (err) {
                alert("Network error while saving rights: " + err.message);
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                }
            }
        }
    };

    window.UserRightsManager = UserRightsManager;

})(window);
