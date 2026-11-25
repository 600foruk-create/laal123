/**
 * SoftifyX ERP - Advanced User Rights & Permissions Manager
 * Menu-wise grouping matching the ERP top navigation bar, granular CRUD permissions,
 * 1-click group-wise selection, quick role presets, and instant search.
 */

(function(window) {
    'use strict';

    const CATEGORY_ICONS = {
        'Administrator': 'fa-user-shield',
        'Maintain': 'fa-cogs',
        'Purchases': 'fa-shopping-cart',
        'Sales': 'fa-file-invoice-dollar',
        'Store': 'fa-warehouse',
        'SMS & Reminders': 'fa-sms',
        'Notes': 'fa-sticky-note',
        'Adjustment': 'fa-balance-scale',
        'Digital Invoicing': 'fa-qrcode',
        'POS': 'fa-cash-register',
        'Reports': 'fa-chart-line'
    };

    const USER_RIGHTS_MODULES = [
        // 1. Administrator Menu
        { category: 'Administrator', name: 'My Company', desc: 'Company Profile, Address & Information' },
        { category: 'Administrator', name: 'My Logo', desc: 'Company Header & Voucher Logo' },
        { category: 'Administrator', name: 'List Of Companies', desc: 'Manage Multiple Branches / Companies' },
        { category: 'Administrator', name: 'User Logins', desc: 'Manage Users, Passwords & Branch Roles' },
        { category: 'Administrator', name: 'User Rights', desc: 'Role Permissions & Screen Access Control' },
        { category: 'Administrator', name: 'Approval Desk', desc: 'Voucher & Transaction Approvals' },
        { category: 'Administrator', name: 'User Login & Session History', desc: 'Active Login Sessions & IP Audit Log' },
        { category: 'Administrator', name: 'System Settings', desc: 'Global ERP Settings, Theme & Preferences' },
        { category: 'Administrator', name: 'Passwords', desc: 'Change User Login Passwords' },
        { category: 'Administrator', name: 'Financial Year', desc: 'Financial Years, Closing Dates & Lock Periods' },
        { category: 'Administrator', name: 'Clear Transactions', desc: 'Clear Test Data / Erase Transactions' },
        { category: 'Administrator', name: 'Currency', desc: 'Base & Multi-Currency Settings' },
        { category: 'Administrator', name: 'BackUp Utility', desc: 'Database Backup & Restore' },
        { category: 'Administrator', name: 'User Activity Logs', desc: 'User Action Logs & Audit Trail' },

        // 2. Maintain Menu
        { category: 'Maintain', name: 'Chart of Accounts', desc: 'General Ledger Accounts & Tree' },
        { category: 'Maintain', name: 'Customers', desc: 'Customer Accounts & Credit Profiles' },
        { category: 'Maintain', name: 'Vendors/Suppliers', desc: 'Supplier & Vendor Accounts' },
        { category: 'Maintain', name: 'Bank Accounts', desc: 'Bank Books & Bank Account Master' },
        { category: 'Maintain', name: 'Accounts Opening Balances', desc: 'Initial Account Balances' },
        { category: 'Maintain', name: 'Chart Of Inventory', desc: 'Item Codes, Names & Categories' },
        { category: 'Maintain', name: 'Inventory Opening Balances', desc: 'Initial Warehouse Stock Balances' },
        { category: 'Maintain', name: 'Inventory Brands', desc: 'Item Brands & Makes' },
        { category: 'Maintain', name: 'HS Codes', desc: 'Customs HS Tariff Codes' },
        { category: 'Maintain', name: 'Item Classes', desc: 'Inventory Item Classification' },
        { category: 'Maintain', name: 'Item Lengths', desc: 'Item Standard Length Attributes' },
        { category: 'Maintain', name: 'Item Sizes', desc: 'Item Diameter & Size Attributes' },
        { category: 'Maintain', name: 'Item Fitting Types', desc: 'Pipe & Fitting Categories' },
        { category: 'Maintain', name: 'Inventory Locations', desc: 'Warehouses, Godowns & Sections' },
        { category: 'Maintain', name: 'Item Price Settings', desc: 'Selling Rates & Wholesale Pricing' },
        { category: 'Maintain', name: 'Price List Management', desc: 'Price Revisions & Bulk Price Update' },
        { category: 'Maintain', name: 'Item Sales Tax Rates', desc: 'Tax Slabs & GST Percentages' },
        { category: 'Maintain', name: 'Item Pre-Order Levels', desc: 'Reorder Levels & Safety Stock' },
        { category: 'Maintain', name: 'Item Cost Valuation Method', desc: 'FIFO / Weighted Average Method' },
        { category: 'Maintain', name: 'Chart Of Services', desc: 'Service Items & Charges Master' },
        { category: 'Maintain', name: 'Voucher Posting Preferences', desc: 'Auto Post & Numbering Preferences' },
        { category: 'Maintain', name: 'Inventory Movement Settings', desc: 'Stock In/Out Source & Negative Stock Policy' },
        { category: 'Maintain', name: 'Monthly Inventory Closing', desc: 'Monthly Stock Audit & Freeze' },
        { category: 'Maintain', name: 'Customer Regions', desc: 'Cities, Areas & Territories' },
        { category: 'Maintain', name: 'Customer Types & Rates', desc: 'Customer Tax Categories' },
        { category: 'Maintain', name: 'Buyer Types', desc: 'FBR Buyer Types & Tax Slabs' },
        { category: 'Maintain', name: 'Business Sectors', desc: 'Industry & Business Sectors' },
        { category: 'Maintain', name: 'Employees', desc: 'Staff, Order Bookers & Salespersons' },
        { category: 'Maintain', name: 'Jobs', desc: 'Project & Job Costing Master' },
        { category: 'Maintain', name: 'Drivers', desc: 'Transport Drivers & Logistics' },

        // 3. Purchases Menu
        { category: 'Purchases', name: 'Purchase Orders', desc: 'Vendor Purchase Orders' },
        { category: 'Purchases', name: 'Purchase Invoice', desc: 'Vendor Purchase Bills' },
        { category: 'Purchases', name: 'Purchases (Sales Tax)', desc: 'Standard Tax Purchase Invoices' },
        { category: 'Purchases', name: 'Purchases (Non Tax)', desc: 'Non-Tax Commercial Purchase Bills' },
        { category: 'Purchases', name: 'Purchase Return / Debit Note', desc: 'Purchase Returns & Debit Notes' },
        { category: 'Purchases', name: 'Cash Payments', desc: 'Cash Paid to Suppliers & Expenses (CPV)' },
        { category: 'Purchases', name: 'Bank Payments', desc: 'Bank / Cheque Payments to Suppliers (BPV)' },

        // 4. Sales Menu
        { category: 'Sales', name: 'Customer Follow-Up', desc: 'Collection Follow-Up & Call History' },
        { category: 'Sales', name: 'Quotations', desc: 'Sales Quotations & Price Estimates' },
        { category: 'Sales', name: 'Sale Orders', desc: 'Customer Sales Orders & Bookings' },
        { category: 'Sales', name: 'Delivery Challans', desc: 'Outward Delivery Challans & Dispatch' },
        { category: 'Sales', name: 'Sale Invoice', desc: 'Main Sales Invoicing Screen' },
        { category: 'Sales', name: 'Sales Tax Invoices', desc: 'Standard FBR Sales Tax Invoices' },
        { category: 'Sales', name: 'Sale Invoices (Non Tax)', desc: 'Non-Tax Commercial Invoices' },
        { category: 'Sales', name: 'Sale Return / Credit Notes', desc: 'Customer Sale Returns & Credit Notes' },
        { category: 'Sales', name: 'Cash Receipts', desc: 'Cash Received From Customers (CRV)' },
        { category: 'Sales', name: 'Bank Receipts', desc: 'Bank / Cheque Receipts From Customers (BRV)' },

        // 5. Store Menu
        { category: 'Store', name: 'Inward Gate Passes', desc: 'Raw Material / Goods Arrival Note (IGP)' },
        { category: 'Store', name: 'Outward Gate Passes', desc: 'Goods Dispatch Gate Passes (OGP)' },
        { category: 'Store', name: 'Material Issue Notes', desc: 'Raw Material Consumption to Production (MIN)' },
        { category: 'Store', name: 'Production Notes', desc: 'Finished Goods Production Entry (PN)' },
        { category: 'Store', name: 'Inventory Transfers', desc: 'Godown to Godown Stock Transfers' },
        { category: 'Store', name: 'Add Inventory Adjustments', desc: 'Manual Stock Additions' },
        { category: 'Store', name: 'Reduce Inventory Adjustments', desc: 'Stock Wastage & Reductions' },
        { category: 'Store', name: 'Auto Adjustments', desc: 'Automated Stock Discrepancy Corrections' },
        { category: 'Store', name: 'Formulas', desc: 'BOM / Production Recipe Formulas' },
        { category: 'Store', name: 'Monthly Stock Closing & Audit', desc: 'Physical Count Verification & Closing' },

        // 6. SMS & Reminders Menu
        { category: 'SMS & Reminders', name: 'Payment Reminder (Credit Control)', desc: 'Overdue Ageing Payment Alerts' },
        { category: 'SMS & Reminders', name: 'Send Ledger Summary', desc: 'Customer Ledger WhatsApp / SMS' },
        { category: 'SMS & Reminders', name: 'SMS Templates', desc: 'Custom Message & WhatsApp Templates' },
        { category: 'SMS & Reminders', name: 'Bulk Messages', desc: 'Mass Marketing & Announcement SMS' },

        // 7. Notes Menu
        { category: 'Notes', name: 'Journal Notes', desc: 'Internal Department Memos & Sticky Notes' },
        { category: 'Notes', name: 'Notifications from Admin', desc: 'System-wide Admin Broadcast Notices' },

        // 8. Adjustment Menu
        { category: 'Adjustment', name: 'General Journal Voucher', desc: 'JV / Adjustment Journal Entries (GJV)' },

        // 9. Digital Invoicing Menu
        { category: 'Digital Invoicing', name: 'Digital Invoice - Integration Settings', desc: 'FBR API Sandbox / Live Keys' },
        { category: 'Digital Invoicing', name: 'FBR Digital Invoice', desc: 'Live FBR Invoicing Portal' },
        { category: 'Digital Invoicing', name: 'Digital Invoice Sales Register', desc: 'FBR Verified Invoices Register' },
        { category: 'Digital Invoicing', name: 'FBR Digital Credit Note', desc: 'FBR Annexure-C Credit Notes' },
        { category: 'Digital Invoicing', name: 'FBR Digital Debit Note', desc: 'FBR Annexure-C Debit Notes' },
        { category: 'Digital Invoicing', name: 'FBR Invoice Cancellation', desc: 'Cancel / Void FBR Invoices' },
        { category: 'Digital Invoicing', name: 'Digital Invoice Reports', desc: 'FBR Sync Audit & Annexure Reports' },
        { category: 'Digital Invoicing', name: 'Digital Invoice Integration Log', desc: 'API Transmission & Response Logs' },

        // 10. POS Menu
        { category: 'POS', name: 'POS Dashboard', desc: 'Retail POS Counter Dashboard' },
        { category: 'POS', name: 'POS Sale', desc: 'Barcode / Touch POS Quick Billing' },
        { category: 'POS', name: 'POS Sales Register', desc: 'POS Daily Retail Invoices Register' },
        { category: 'POS', name: 'POS Sales Return', desc: 'Retail Counter Return & Exchange' },
        { category: 'POS', name: 'POS Hold / Recall Register', desc: 'Held Carts & Pending Retail Tickets' },
        { category: 'POS', name: 'POS Day Closing', desc: 'Shift Cash Reconciliation & Day Close' },
        { category: 'POS', name: 'POS Reports', desc: 'Retail Sales & Summary Reports' },

        // 11. Reports Menu
        { category: 'Reports', name: 'View Account Ledger', desc: 'Interactive On-Screen General Ledger' },
        { category: 'Reports', name: 'Print Accounts Ledgers', desc: 'Printable / PDF Customer & GL Ledgers' },
        { category: 'Reports', name: 'Cash & Bank Balances', desc: 'Live Cash in Hand & Bank Balances' },
        { category: 'Reports', name: 'Customer Balances', desc: 'Accounts Receivable (Customer Balances)' },
        { category: 'Reports', name: 'Vendor Balances', desc: 'Accounts Payable (Supplier Balances)' },
        { category: 'Reports', name: 'Journal Report', desc: 'Daily Transaction Book & Journal Report' },
        { category: 'Reports', name: 'Print Voucher', desc: 'Print Any Posted Voucher' },
        { category: 'Reports', name: 'Tax Transaction Report', desc: 'Withholding & Sales Tax Audit Report' },
        { category: 'Reports', name: 'Trial Balance', desc: 'Standard & Grouped Trial Balance' },
        { category: 'Reports', name: 'Income Statement', desc: 'Profit & Loss Statement (P&L)' },
        { category: 'Reports', name: 'Balance Sheet', desc: 'Statement of Financial Position' },
        { category: 'Reports', name: 'Sale Summary', desc: 'Total Sales Summary Overview' },
        { category: 'Reports', name: 'Sale Register', desc: 'Date-wise Sales Invoices Register' },
        { category: 'Reports', name: 'Party Sale Summary', desc: 'Customer-wise Sales Volume & Value' },
        { category: 'Reports', name: 'Accounts Receivable Aging', desc: 'Customer Ageing (30/60/90 Days)' },
        { category: 'Reports', name: 'Sale Order Tracking', desc: 'Pending vs Dispatched Sales Orders' },
        { category: 'Reports', name: 'Recovery / Receipt Report', desc: 'Customer Payment Recovery History' },
        { category: 'Reports', name: 'Sale Activity Report - Invoice Wise', desc: 'Detailed Sales Invoices Breakdown' },
        { category: 'Reports', name: 'Sale Activity Report - Party Wise', desc: 'Customer Sales & Item History' },
        { category: 'Reports', name: 'Item Sale Summary', desc: 'Item-wise Quantity Sold' },
        { category: 'Reports', name: 'Item Sale Analysis', desc: 'Item Margin & Sales Volume' },
        { category: 'Reports', name: 'Services Analysis', desc: 'Service Revenue Breakdown' },
        { category: 'Reports', name: 'Purchase Summary', desc: 'Total Purchases Overview' },
        { category: 'Reports', name: 'Purchase Register', desc: 'Date-wise Purchase Bills Register' },
        { category: 'Reports', name: 'Party Purchase Summary', desc: 'Supplier-wise Purchase Analysis' },
        { category: 'Reports', name: 'Accounts Payable Aging', desc: 'Supplier Ageing (30/60/90 Days)' },
        { category: 'Reports', name: 'Purchase Order Tracking', desc: 'Pending vs Received Purchase Orders' },
        { category: 'Reports', name: 'Payments Reports', desc: 'Supplier Payment History' },
        { category: 'Reports', name: 'Purchase Activity Report - Invoice Wise', desc: 'Purchase Bills Detail' },
        { category: 'Reports', name: 'Purchase Activity Report - Party Wise', desc: 'Vendor Purchases History' },
        { category: 'Reports', name: 'Item Purchase Summary', desc: 'Item-wise Purchases Total' },
        { category: 'Reports', name: 'Item Purchase Analysis', desc: 'Item Purchase Cost Trend' },
        { category: 'Reports', name: 'Inventory Balances', desc: 'Current Live Godown Stock Balances' },
        { category: 'Reports', name: 'View Inventory Ledgers', desc: 'Item In / Out Movement Stock Ledger' },
        { category: 'Reports', name: 'Print Inventory Ledgers', desc: 'Printable Stock Ledger Sheet' },
        { category: 'Reports', name: 'Item Below Re-Order Level', desc: 'Low Stock Alerts & Shortages' },
        { category: 'Reports', name: 'Product Serials Tracking', desc: 'Serial Numbers & Barcode Tracking' },
        { category: 'Reports', name: 'Item-Wise Profit/Loss', desc: 'Gross Profit per Item Analysis' },
        { category: 'Reports', name: 'Production Report', desc: 'Finished Goods Manufactured Summary' },
        { category: 'Reports', name: 'Material Consumption Report', desc: 'Raw Material Consumed in Factory' },
        { category: 'Reports', name: 'Raw Material Flow Statement', desc: 'Inventory & Material Flow at Average Cost' },
        { category: 'Reports', name: 'Production Costing & WIP Statement', desc: 'WIP & Cost of Production Statement' },
        { category: 'Reports', name: 'Job Ledgers', desc: 'Job / Project Costing Ledgers' }
    ];

    const ORDERED_CATEGORIES = [
        'Administrator',
        'Maintain',
        'Purchases',
        'Sales',
        'Store',
        'SMS & Reminders',
        'Notes',
        'Adjustment',
        'Digital Invoicing',
        'POS',
        'Reports'
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
                    const res = await fetch('api/admin.php?action=get_users');
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

            const totalOverall = this.modules.length;
            const assignedOverall = this.modules.filter(m => this.isCurrentAdmin || (this.currentRightsMap[m.name] && this.currentRightsMap[m.name].allowed)).length;

            let html = `
                <button type="button" class="ur-tab-btn ${this.activeCategory === 'All' ? 'ur-tab-active' : ''}" data-category="All" onclick="window.UserRightsManager.switchCategory('All')">
                    <i class="fas fa-th-large"></i> All Menus <span class="ur-tab-count" id="tabCount-All">${assignedOverall} / ${totalOverall}</span>
                </button>
            `;

            ORDERED_CATEGORIES.forEach(cat => {
                const totalInCat = this.modules.filter(m => m.category === cat).length;
                const assignedInCat = this.modules.filter(m => m.category === cat && (this.isCurrentAdmin || (this.currentRightsMap[m.name] && this.currentRightsMap[m.name].allowed))).length;
                const icon = CATEGORY_ICONS[cat] || 'fa-folder';
                const activeCls = (cat === this.activeCategory) ? 'ur-tab-active' : '';
                const catSafeId = cat.replace(/[^a-zA-Z0-9]/g, '_');
                const badgeStyle = (assignedInCat > 0) ? 'background: #0284c7; color: #ffffff;' : '';

                html += `
                    <button type="button" class="ur-tab-btn ${activeCls}" data-category="${cat}" onclick="window.UserRightsManager.switchCategory('${cat}')">
                        <i class="fas ${icon}"></i> ${cat} <span class="ur-tab-count" id="tabCount-${catSafeId}" style="${badgeStyle}">${assignedInCat} / ${totalInCat}</span>
                    </button>
                `;
            });

            tabsContainer.innerHTML = html;
            this.updateSummaryBadges();
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

            const activeLabel = document.getElementById('urActiveMenuLabel');
            if (activeLabel) {
                activeLabel.textContent = (cat === 'All') ? 'All Modules' : `${cat} Menu`;
            }

            this.renderTable();
            this.updateSummaryBadges();
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
                const res = await fetch(`api/admin.php?action=get_rights&user_id=${this.currentUserId}&_cb=${Date.now()}`);
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
            this.updateSummaryBadges();
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
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;"><i class="fas fa-search" style="font-size: 26px; margin-bottom: 8px; display: block;"></i>No matching modules found</td></tr>`;
                return;
            }

            // Group filtered items by ordered categories
            const groups = {};
            ORDERED_CATEGORIES.forEach(c => { groups[c] = []; });
            filtered.forEach(m => {
                if (!groups[m.category]) groups[m.category] = [];
                groups[m.category].push(m);
            });

            let rows = '';
            let globalIndex = 1;

            ORDERED_CATEGORIES.forEach(cat => {
                const list = groups[cat] || [];
                if (list.length === 0) return;

                const icon = CATEGORY_ICONS[cat] || 'fa-folder';
                const totalInCat = this.modules.filter(m => m.category === cat).length;
                const assignedInCat = this.modules.filter(m => m.category === cat && (this.isCurrentAdmin || (this.currentRightsMap[m.name] && this.currentRightsMap[m.name].allowed))).length;
                const catSafeId = cat.replace(/[^a-zA-Z0-9]/g, '_');
                const grpBadgeStyle = (assignedInCat > 0) ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : '';

                // Render Group Header Row with Group-wise 1-Click Action Buttons
                rows += `
                    <tr class="ur-group-header-row" data-group="${cat}">
                        <td colspan="8">
                            <div class="ur-group-header-inner">
                                <div class="ur-group-info">
                                    <i class="fas ${icon}" style="color: #1F4E79; font-size: 14px;"></i>
                                    <span style="font-weight: 700; color: #0f172a; font-size: 13px;">${cat} Menu</span>
                                    <span class="ur-group-count" id="grpCount-${catSafeId}" style="${grpBadgeStyle}">${assignedInCat} / ${totalInCat} Assigned</span>
                                </div>
                                <div class="ur-group-tools">
                                    <span style="font-size: 11px; font-weight: 700; color: #475569;">Group Actions:</span>
                                    <button type="button" class="ur-grp-btn btn-grp-allow" onclick="window.UserRightsManager.toggleEntireGroup('${cat}', true)" title="Check/Allow all modules in ${cat}">
                                        <i class="fas fa-check-circle"></i> Allow Group
                                    </button>
                                    <button type="button" class="ur-grp-btn btn-grp-revoke" onclick="window.UserRightsManager.toggleEntireGroup('${cat}', false)" title="Uncheck/Revoke all modules in ${cat}">
                                        <i class="fas fa-times-circle"></i> Revoke Group
                                    </button>
                                    <span class="ur-grp-divider">|</span>
                                    <button type="button" class="ur-grp-btn" onclick="window.UserRightsManager.setGroupPermission('${cat}', 'view')" title="Click to Toggle View All ON / OFF in ${cat}">View</button>
                                    <button type="button" class="ur-grp-btn" onclick="window.UserRightsManager.setGroupPermission('${cat}', 'create')" title="Click to Toggle Create All ON / OFF in ${cat}">Create</button>
                                    <button type="button" class="ur-grp-btn" onclick="window.UserRightsManager.setGroupPermission('${cat}', 'edit')" title="Click to Toggle Edit All ON / OFF in ${cat}">Edit</button>
                                    <button type="button" class="ur-grp-btn" onclick="window.UserRightsManager.setGroupPermission('${cat}', 'delete')" title="Click to Toggle Delete All ON / OFF in ${cat}">Delete</button>
                                    <button type="button" class="ur-grp-btn" onclick="window.UserRightsManager.setGroupPermission('${cat}', 'print')" title="Click to Toggle Print All ON / OFF in ${cat}">Print</button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;

                // Render Individual Modules in this Group
                list.forEach(m => {
                    const existing = this.currentRightsMap[m.name] || {};

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
                        <tr class="ur-row ${isAllowed ? 'row-allowed' : 'row-denied'}" data-module="${m.name}" data-category="${m.category}" style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 7px 10px; color: #64748b; font-size: 11px; text-align: center; width: 40px;">${globalIndex++}</td>
                            <td style="padding: 7px 12px;">
                                <div style="font-weight: 700; color: #1e293b; font-size: 12.5px;">${m.name}</div>
                                <div style="font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                    <span style="background: #e2e8f0; color: #334155; padding: 1px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">${m.category}</span>
                                    <span>${m.desc || ''}</span>
                                </div>
                            </td>
                            <td style="text-align: center; width: 125px;">
                                <label class="ur-toggle-pill" style="cursor: pointer; display: inline-flex; align-items: center; gap: 5px; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}44; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; user-select: none;">
                                    <input type="checkbox" class="ur-chk-allowed" ${isAllowed ? 'checked' : ''} ${disabledAttr} onchange="window.UserRightsManager.onAllowedToggle(this, '${m.name}')" style="display: none;">
                                    <i class="fas ${isAllowed ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                    <span>${statusText}</span>
                                </label>
                            </td>
                            <td style="text-align: center; width: 75px;">
                                <input type="checkbox" class="ur-chk-view" ${canView ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #0284c7;">
                            </td>
                            <td style="text-align: center; width: 75px;">
                                <input type="checkbox" class="ur-chk-create" ${canCreate ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #10b981;">
                            </td>
                            <td style="text-align: center; width: 75px;">
                                <input type="checkbox" class="ur-chk-edit" ${canEdit ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #f59e0b;">
                            </td>
                            <td style="text-align: center; width: 75px;">
                                <input type="checkbox" class="ur-chk-delete" ${canDelete ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #ef4444;">
                            </td>
                            <td style="text-align: center; width: 75px;">
                                <input type="checkbox" class="ur-chk-print" ${canPrint ? 'checked' : ''} ${!isAllowed || this.isCurrentAdmin ? 'disabled' : ''} onchange="window.UserRightsManager.onSubCheckChange('${m.name}')" style="width: 17px; height: 17px; cursor: pointer; accent-color: #6366f1;">
                            </td>
                        </tr>
                    `;
                });
            });

            tbody.innerHTML = rows;

            if (window.applyERPThemeToElement && window.getCurrentERPTheme) {
                const root = document.querySelector('.modal-container.modal-user-rights') || 
                             document.querySelector('.modal-container:has(#userRightsContainer)') || 
                             document.getElementById('userRightsContainer');
                if (root) window.applyERPThemeToElement(root, window.getCurrentERPTheme());
            }
        },

        onAllowedToggle: function(chk, moduleName) {
            const row = chk.closest('tr');
            if (!row) return;
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

            if (isChecked) {
                row.classList.remove('row-denied');
                row.classList.add('row-allowed');
            } else {
                row.classList.remove('row-allowed');
                row.classList.add('row-denied');
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
            this.updateSummaryBadges();
        },

        onSubCheckChange: function(moduleName) {
            const row = document.querySelector(`tr[data-module="${moduleName}"]`);
            if (row) {
                this.updateRightsMapFromRow(row);
                this.updateSummaryBadges();
            }
        },

        updateRightsMapFromRow: function(row) {
            const mod = row.getAttribute('data-module');
            if (!mod) return;
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

        // Update real-time summary counters (Overall & Category-wise, e.g. 14 / 136)
        updateSummaryBadges: function() {
            const totalOverall = this.modules.length;
            const assignedOverall = this.modules.filter(m => this.isCurrentAdmin || (this.currentRightsMap[m.name] && this.currentRightsMap[m.name].allowed)).length;
            const pct = Math.round((assignedOverall / totalOverall) * 100);

            // 1. Overall badge
            const ratioEl = document.getElementById('urOverallRatio');
            if (ratioEl) ratioEl.textContent = `${assignedOverall} / ${totalOverall}`;
            const pctEl = document.getElementById('urOverallPct');
            if (pctEl) pctEl.textContent = `${pct}%`;

            // 2. Tab counts (All & Category-wise)
            const allTabCount = document.getElementById('tabCount-All');
            if (allTabCount) allTabCount.textContent = `${assignedOverall} / ${totalOverall}`;

            ORDERED_CATEGORIES.forEach(cat => {
                const totalInCat = this.modules.filter(m => m.category === cat).length;
                const assignedInCat = this.modules.filter(m => m.category === cat && (this.isCurrentAdmin || (this.currentRightsMap[m.name] && this.currentRightsMap[m.name].allowed))).length;
                const catSafeId = cat.replace(/[^a-zA-Z0-9]/g, '_');

                const tabEl = document.getElementById(`tabCount-${catSafeId}`);
                if (tabEl) {
                    tabEl.textContent = `${assignedInCat} / ${totalInCat}`;
                    if (assignedInCat > 0) {
                        tabEl.style.background = 'var(--theme-primary, #1F4E79)';
                        tabEl.style.color = '#ffffff';
                        tabEl.dataset.hasAssigned = 'true';
                    } else {
                        tabEl.style.background = 'rgba(0,0,0,0.08)';
                        tabEl.style.color = '#475569';
                        tabEl.dataset.hasAssigned = 'false';
                    }
                }

                const grpEl = document.getElementById(`grpCount-${catSafeId}`);
                if (grpEl) {
                    grpEl.textContent = `${assignedInCat} / ${totalInCat} Assigned`;
                    if (assignedInCat > 0) {
                        grpEl.style.background = '#dcfce7';
                        grpEl.style.color = '#15803d';
                        grpEl.style.borderColor = '#86efac';
                    } else {
                        grpEl.style.background = '#cbd5e1';
                        grpEl.style.color = '#334155';
                        grpEl.style.borderColor = 'transparent';
                    }
                }
            });

            if (window.applyERPThemeToElement && window.getCurrentERPTheme) {
                const root = document.querySelector('.modal-container.modal-user-rights') || 
                             document.querySelector('.modal-container:has(#userRightsContainer)') || 
                             document.getElementById('userRightsContainer');
                if (root) window.applyERPThemeToElement(root, window.getCurrentERPTheme());
            }
        },

        // 1-Click Toggle for an Entire Menu Group (e.g., 'Sales', 'Purchases', 'Maintain')
        toggleEntireGroup: function(categoryName, isAllowed) {
            if (this.isCurrentAdmin) return;

            // Update in data map
            this.modules.forEach(m => {
                if (m.category === categoryName) {
                    this.currentRightsMap[m.name] = {
                        allowed: isAllowed,
                        view: isAllowed,
                        create: isAllowed,
                        edit: isAllowed,
                        delete: false,
                        print: isAllowed
                    };
                }
            });

            // Update visible DOM rows
            const rows = document.querySelectorAll(`tr.ur-row[data-category="${categoryName}"]`);
            rows.forEach(row => {
                const mod = row.getAttribute('data-module');
                const chk = row.querySelector('.ur-chk-allowed');
                if (chk) {
                    chk.checked = isAllowed;
                    this.onAllowedToggle(chk, mod);
                }
            });
            this.updateSummaryBadges();
        },

        // Set Specific Granular Permission for an Entire Menu Group with 1-Click Toggle (Check All / Uncheck All)
        setGroupPermission: function(categoryName, permType, state) {
            if (this.isCurrentAdmin) return;

            // If state not explicitly passed, determine toggle state (if all already checked, uncheck all)
            let targetState = state;
            if (targetState === null || targetState === undefined) {
                let allChecked = true;
                let hasAllowed = false;
                this.modules.forEach(m => {
                    if (m.category === categoryName) {
                        const r = this.currentRightsMap[m.name] || {};
                        if (r.allowed) {
                            hasAllowed = true;
                            if (!r[permType]) allChecked = false;
                        }
                    }
                });
                targetState = (hasAllowed && allChecked) ? false : true;
            }

            this.modules.forEach(m => {
                if (m.category === categoryName) {
                    const r = this.currentRightsMap[m.name] || {};
                    if (r.allowed) {
                        r[permType] = targetState;
                    }
                }
            });

            const rows = document.querySelectorAll(`tr.ur-row[data-category="${categoryName}"]`);
            rows.forEach(row => {
                const isAllowed = row.querySelector('.ur-chk-allowed')?.checked;
                if (isAllowed) {
                    const chk = row.querySelector(`.ur-chk-${permType}`);
                    if (chk && !chk.disabled) {
                        chk.checked = targetState;
                    }
                    this.updateRightsMapFromRow(row);
                }
            });
            this.updateSummaryBadges();
        },

        // Bulk Actions for currently visible / filtered category with 1-Click Toggle (Check All / Uncheck All)
        bulkSet: function(type, state) {
            if (this.isCurrentAdmin) return;
            const tbody = document.getElementById('urTableBody');
            if (!tbody) return;

            const rows = tbody.querySelectorAll('tr.ur-row');
            if (type === 'allowed') {
                const targetState = (state !== null && state !== undefined) ? state : true;
                rows.forEach(row => {
                    const mod = row.getAttribute('data-module');
                    const chk = row.querySelector('.ur-chk-allowed');
                    if (chk && chk.checked !== targetState) {
                        chk.checked = targetState;
                        this.onAllowedToggle(chk, mod);
                    }
                });
            } else {
                // Determine toggle state if not explicitly passed:
                // If every currently allowed visible row has this permission checked -> UNCHECK ALL (false)
                // Otherwise -> CHECK ALL (true)
                let targetState = state;
                if (targetState === null || targetState === undefined) {
                    let allChecked = true;
                    let hasAllowed = false;
                    rows.forEach(row => {
                        const isAllowed = row.querySelector('.ur-chk-allowed')?.checked;
                        if (isAllowed) {
                            hasAllowed = true;
                            const targetChk = row.querySelector(`.ur-chk-${type}`);
                            if (targetChk && !targetChk.checked) {
                                allChecked = false;
                            }
                        }
                    });
                    targetState = (hasAllowed && allChecked) ? false : true;
                }

                rows.forEach(row => {
                    const isAllowed = row.querySelector('.ur-chk-allowed')?.checked;
                    if (isAllowed) {
                        const targetChk = row.querySelector(`.ur-chk-${type}`);
                        if (targetChk && !targetChk.disabled) {
                            targetChk.checked = targetState;
                        }
                    }
                    this.updateRightsMapFromRow(row);
                });
            }
            this.updateSummaryBadges();
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
                    if (['Sales', 'POS'].includes(m.category) || ['Cash Receipts', 'Customer Balances', 'Sale Invoice'].includes(m.name)) {
                        allowed = true; v = true; c = true; e = false; d = false; p = true;
                    }
                } else if (roleKey === 'accountant') {
                    // Accountant: Maintain, Purchases, Sales, Adjustment, Ledgers, Reports
                    if (!['Administrator', 'POS'].includes(m.category) && !['Clear Transactions', 'System Settings'].includes(m.name)) {
                        allowed = true; v = true; c = true; e = true; d = false; p = true;
                    }
                } else if (roleKey === 'store') {
                    // Store keeper: Store, Stock reports
                    if (m.category === 'Store' || ['Monthly Inventory Closing', 'Chart Of Inventory', 'Inventory Balances', 'View Inventory Ledgers', 'Material Consumption Report', 'Production Report'].includes(m.name)) {
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
            this.updateSummaryBadges();
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
                const res = await fetch('api/admin.php?action=save_rights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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

    // Listen for real-time ERP Theme changes so open modal updates instantly
    window.addEventListener('erpThemeChanged', function(e) {
        if (window.applyERPThemeToElement) {
            const root = document.querySelector('.modal-container.modal-user-rights') || 
                         document.querySelector('.modal-container:has(#userRightsContainer)') || 
                         document.getElementById('userRightsContainer');
            if (root) {
                window.applyERPThemeToElement(root, e.detail || (window.getCurrentERPTheme ? window.getCurrentERPTheme() : null));
            }
        }
    });

})(window);
