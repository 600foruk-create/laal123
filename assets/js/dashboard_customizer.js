/**
 * Softifyx Financials - Dynamic Dashboard Customization Engine
 * Allows users to customize all sections of the dashboard via System Settings:
 * 1. Left Sidebar: "Record New" & "View" items checklist
 * 2. Center Top 4 Stat Boxes (same size, customizable metric)
 * 3. Center Middle 3 Summary Cards (Cash & Banks, Receivables, Payables, POS, Digital Invoicing, Stock)
 * 4. Center Bottom Widgets (Weekly Sales Trend, My Notes, Recent Transactions)
 * 5. Right Sidebar "Today's Summary" Sections (Cash Position, Customer, Vendor, Inventory, POS, Digital)
 */

(function(window) {
    'use strict';

    const STORAGE_KEY = 'softifyx_dashboard_customization';

    // 1. Full Library Catalog of all available features across ERP, POS, and Digital Invoicing
    const CATALOG = {
        record_new: [
            { id: 'igp', label: 'Inwards Gate Pass', icon: 'fas fa-dolly', action: "openModularPopup('Navigation/Store/inward_gate_passes.html', 'fa-dolly', 'Inward Gate Passes', () => window.IGPModule && window.IGPModule.init(), 'Inward Gate Passes', true, true)" },
            { id: 'pi', label: 'Purchase Invoice', icon: 'fas fa-file-invoice-dollar', action: "openModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', () => window.PIModule.init(), 'Purchase Invoice', true, true)" },
            { id: 'pr', label: 'Purchase Return', icon: 'fas fa-undo', action: "openModularPopup('Navigation/Purchases/purchase_return.html', 'fa-undo', 'Purchase Return / Debit Note', () => window.PRModule.init(), 'Purchase Return', true, true)" },
            { id: 'dc', label: 'Delivery Challan', icon: 'fas fa-truck', action: "openModularPopup('Navigation/Sales/delivery_challans.html', 'fa-truck-loading', 'Delivery Challans', () => { if(window.DeliveryChallanModule) window.DeliveryChallanModule.init(); else alert('Module not ready.'); }, 'Delivery Challans', true, true)" },
            { id: 'ogp', label: 'Outward Gate Pass', icon: 'fas fa-dolly', action: "openModularPopup('Navigation/Store/outward_gate_passes.html', 'fa-dolly', 'Outward Gate Passes', () => window.OGPModule && window.OGPModule.init(), 'Outward Gate Passes', true, true)" },
            { id: 'si', label: 'Sale Invoice', icon: 'fas fa-file-invoice-dollar', action: "openDefaultSaleInvoice()" },
            { id: 'cp', label: 'Cash Payment', icon: 'fas fa-money-bill-wave', action: "openModularPopup('Navigation/Purchases/cash_payments.html', 'fa-money-bill-wave', 'Cash Payments', () => window.initCashPaymentModule(), 'Cash Payments', true, true)" },
            { id: 'bp', label: 'Bank Payment', icon: 'fas fa-university', action: "openModularPopup('Navigation/Purchases/bank_payments.html', 'fa-university', 'Bank Payments', () => window.initBankPaymentModule(), 'Bank Payments', true, true)" },
            { id: 'cr', label: 'Cash Receipt', icon: 'fas fa-hand-holding-usd', action: "openModularPopup('Navigation/Sales/cash_receipts.html', 'fa-hand-holding-usd', 'Cash Receipts', () => window.initCashReceiptModule(), 'Cash Receipts', true, true)" },
            { id: 'br', label: 'Bank Receipt', icon: 'fas fa-university', action: "openModularPopup('Navigation/Sales/bank_receipts.html', 'fa-university', 'Bank Receipts', () => window.initBankReceiptModule(), 'Bank Receipts', true, true)" },
            { id: 'fbr_inv', label: 'FBR Digital Invoice', icon: 'fas fa-file-invoice', action: "openModularPopup('Navigation/DigitalInvoicing/digital_invoice.html', 'fa-file-invoice', 'FBR Digital Invoice', () => { if(window.DigitalInvoiceModule) window.DigitalInvoiceModule.init(); }, 'FBR Digital Invoice', true, true)" },
            { id: 'fbr_cn', label: 'FBR Digital Credit Note', icon: 'fas fa-file-invoice-dollar', action: "openModularPopup('Navigation/DigitalInvoicing/credit_note.html', 'fa-file-invoice-dollar', 'FBR Digital Credit Note', () => { if(window.DigitalCreditNoteModule) window.DigitalCreditNoteModule.init(); }, 'FBR Digital Credit Note', true, true)" },
            { id: 'fbr_dn', label: 'FBR Digital Debit Note', icon: 'fas fa-file-invoice-dollar', action: "openModularPopup('Navigation/DigitalInvoicing/debit_note.html', 'fa-file-invoice-dollar', 'FBR Digital Debit Note', () => { if(window.DigitalDebitNoteModule) window.DigitalDebitNoteModule.init(); }, 'FBR Digital Debit Note', true, true)" },
            { id: 'pos_sale', label: 'POS Sale Counter', icon: 'fas fa-cash-register', action: "openModularPopup('Navigation/POS/pos_sale.html', 'fa-cash-register', 'POS Sale', () => { if(window.POSModule) window.POSModule.init(); }, 'POS Sale', true, true)" },
            { id: 'pos_return', label: 'POS Sales Return', icon: 'fas fa-undo', action: "openModularPopup('Navigation/POS/pos_sale_return.html', 'fa-undo', 'POS Sales Return', () => { if(window.POSReturnModule) window.POSReturnModule.init(); }, 'POS Sales Return', true, true)" },
            { id: 'pos_closing', label: 'POS Day Closing', icon: 'fas fa-door-closed', action: "openModularPopup('Navigation/POS/pos_day_closing.html', 'fa-door-closed', 'POS Day Closing', () => { if(window.POSDayClosingModule) window.POSDayClosingModule.init(); }, 'POS Day Closing', true, true)" },
            { id: 'gjv', label: 'General Journal Voucher', icon: 'fas fa-book', action: "openModularPopup('Navigation/Adjustment/general_journal_voucher.html', 'fa-book', 'General Journal Voucher', () => window.initGJVModule(), 'General Journal Voucher', true, true)" },
            { id: 'min', label: 'Material Issue Note', icon: 'fas fa-dolly-flatbed', action: "openModularPopup('Navigation/Store/material_issue_notes.html', 'fa-dolly-flatbed', 'Material Issue Notes', () => window.MINModule && window.MINModule.init(), 'Material Issue Notes', true, true)" },
            { id: 'prod_note', label: 'Production Note', icon: 'fas fa-industry', action: "openModularPopup('Navigation/Store/production_notes.html', 'fa-industry', 'Production Notes', () => window.ProdNoteModule && window.ProdNoteModule.init(), 'Production Notes', true, true)" }
        ],
        view: [
            { id: 'v_pr', label: 'Purchase Report', icon: 'fas fa-chart-line', target: 'Navigation/Reports/purchase_summary.html', module: 'Purchase Summary' },
            { id: 'v_preg', label: 'Purchase Register', icon: 'fas fa-list-alt', target: 'Navigation/Reports/purchase_register.html', module: 'Purchase Register' },
            { id: 'v_pot', label: 'Purchase Order Tracker', icon: 'fas fa-file-invoice', action: "openModularPopup('Navigation/Reports/purchase_order_tracker.html', 'fa-file-invoice', 'Purchase Order Tracker', () => { if(window.PurchaseOrderTracker) window.PurchaseOrderTracker.init(); }, 'Purchase Order Tracking', true, true)" },
            { id: 'v_vb', label: "Vendors' Balances", icon: 'fas fa-users', target: 'Navigation/Reports/vendor_balances.html', module: 'Vendor Balances' },
            { id: 'v_ss', label: 'Sale Summary', icon: 'fas fa-chart-bar', action: "openModularPopup('Navigation/Reports/sale_report.html', 'fa-file-invoice-dollar', 'Sale Summary', () => { if(window.SaleReportModule) window.SaleReportModule.init(); }, 'Sale Summary', true, true)" },
            { id: 'v_cb', label: "Customers' Balances", icon: 'fas fa-user-tie', target: 'Navigation/Reports/customer_balances.html', module: 'Customer Balances' },
            { id: 'v_il', label: 'Inventory Ledgers', icon: 'fas fa-boxes', target: 'Navigation/Reports/view_inventory_ledgers.html', module: 'View Inventory Ledgers' },
            { id: 'v_ib', label: 'Inventory Balance', icon: 'fas fa-cubes', target: 'Navigation/Reports/inventory_balances.html', module: 'Inventory Balances' },
            { id: 'v_al', label: "Accounts' Ledgers", icon: 'fas fa-book', action: "openModularPopup('Navigation/Reports/view_account_ledger.html', 'fa-book', 'Accounts\\' Ledgers', () => { if(window.AccountLedgerModule) window.AccountLedgerModule.init(); }, 'View Account Ledger', true, true)" },
            { id: 'v_tb', label: 'Trial Balance', icon: 'fas fa-scale-balanced', target: 'Navigation/Reports/trial_balance.html', module: 'Trial Balance' },
            { id: 'v_is', label: 'Income Statement', icon: 'fas fa-receipt', target: 'Navigation/Reports/income_statement.html', module: 'Income Statement' },
            { id: 'v_bs', label: 'Balance Sheet', icon: 'fas fa-balance-scale', target: 'Navigation/Reports/balance_sheet.html', module: 'Balance Sheet' },
            { id: 'v_fbr_reg', label: 'Digital Invoice Sales Register', icon: 'fas fa-list-alt', action: "openModularPopup('Navigation/DigitalInvoicing/digital_sale_register.html', 'fa-list-alt', 'Digital Invoice Sales Register', () => { if(window.DigitalSaleRegisterModule) window.DigitalSaleRegisterModule.init(); }, 'Digital Invoice Sales Register', true, true)" },
            { id: 'v_pos_reg', label: 'POS Sales Register', icon: 'fas fa-list-alt', action: "openModularPopup('Navigation/POS/pos_sale_register.html', 'fa-list-alt', 'POS Sales Register', () => { if(window.POSRegisterModule) window.POSRegisterModule.init(); }, 'POS Sales Register', true, true)" },
            { id: 'v_pos_rep', label: 'POS Reports', icon: 'fas fa-chart-line', action: "openModularPopup('Navigation/POS/pos_reports.html', 'fa-chart-line', 'POS Reports', () => { if(window.POSReportsModule) window.POSReportsModule.init(); }, 'POS Reports', true, true)" }
        ],
        kpi_metrics: [
            { id: 'sales', label: 'Daily Sales', icon: 'fas fa-chart-simple', defaultBadge: 'NIL' },
            { id: 'cash_hand', label: 'Cash in Hand', icon: 'fas fa-wallet' },
            { id: 'bank_bal', label: 'Bank Balance', icon: 'fas fa-building-columns' },
            { id: 'rec_total', label: 'Total Receivables (Customers)', icon: 'fas fa-chart-pie' },
            { id: 'pay_total', label: 'Total Payables (Vendors)', icon: 'fas fa-hand-holding-dollar' },
            { id: 'purchases', label: 'Daily Purchases', icon: 'fas fa-shopping-cart' },
            { id: 'pos_sales', label: 'POS Sales Today', icon: 'fas fa-cash-register' },
            { id: 'digital_sales', label: 'Digital Invoicing (FBR)', icon: 'fas fa-file-invoice' },
            { id: 'net_cash_bank', label: 'Net Cash & Bank', icon: 'fas fa-coins' },
            { id: 'invoices_count', label: 'Total Invoices Count', icon: 'fas fa-receipt' }
        ],
        middle_cards: [
            { id: 'cash_banks', label: 'Cash & Banks' },
            { id: 'receivables', label: 'Receivables / Customers' },
            { id: 'payables', label: 'Payables / Vendors' },
            { id: 'pos_summary', label: 'POS Daily Summary' },
            { id: 'digital_invoicing', label: 'Digital Invoicing (FBR)' },
            { id: 'inventory_summary', label: 'Inventory Stock Summary' }
        ],
        bottom_widgets: [
            { id: 'weekly_sales_trend', label: 'Weekly Sales Trend (Chart)' },
            { id: 'my_notes', label: 'My Notes' },
            { id: 'recent_activity', label: 'Recent Transactions Activity' }
        ],
        right_summary: [
            { id: 'cash_position', label: 'Cash Position' },
            { id: 'customer_activity', label: 'Customer Activity' },
            { id: 'vendor_activity', label: 'Vendor Activity' },
            { id: 'inventory_alerts', label: 'Inventory Alerts' },
            { id: 'pos_activity', label: 'POS Activity' },
            { id: 'digital_activity', label: 'Digital Invoicing / FBR' }
        ]
    };

    // 2. Default Configuration
    const DEFAULT_CONFIG = {
        record_new: ['igp', 'pi', 'pr', 'dc', 'ogp', 'si', 'cp', 'bp', 'cr', 'br'],
        view: ['v_pr', 'v_preg', 'v_pot', 'v_vb', 'v_ss', 'v_cb', 'v_il', 'v_ib', 'v_al', 'v_tb'],
        kpi_cards: ['sales', 'cash_hand', 'bank_bal', 'rec_total'],
        middle_cards: ['cash_banks', 'receivables', 'payables'],
        bottom_widgets: ['weekly_sales_trend', 'my_notes'],
        right_summary: ['cash_position', 'customer_activity', 'vendor_activity', 'inventory_alerts']
    };

    const DashboardCustomizer = {
        catalog: CATALOG,
        defaultConfig: DEFAULT_CONFIG,
        currentConfig: null,

        getConfig: function() {
            if (this.currentConfig && this.currentConfig.record_new) return this.currentConfig;
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed && (parsed.record_new || parsed.view || parsed.kpi_cards)) {
                        this.currentConfig = {
                            record_new: parsed.record_new || DEFAULT_CONFIG.record_new,
                            view: parsed.view || DEFAULT_CONFIG.view,
                            kpi_cards: parsed.kpi_cards || DEFAULT_CONFIG.kpi_cards,
                            middle_cards: parsed.middle_cards || DEFAULT_CONFIG.middle_cards,
                            bottom_widgets: parsed.bottom_widgets || DEFAULT_CONFIG.bottom_widgets,
                            right_summary: parsed.right_summary || DEFAULT_CONFIG.right_summary
                        };
                        return this.currentConfig;
                    }
                }
            } catch(e) {}
            this.currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            return this.currentConfig;
        },

        fetchConfigFromDB: async function() {
            try {
                const s = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = s.company_id || 1;
                const res = await fetch(`api/settings.php?action=get_dashboard_settings&company_id=${coId}&_t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    let rawCfg = (data && data.status === 'success') ? (data.dashboard_customization || data.data || data.config) : null;
                    if (rawCfg && rawCfg.config) rawCfg = rawCfg.config;
                    if (rawCfg && (rawCfg.record_new || rawCfg.view || rawCfg.kpi_cards)) {
                        this.currentConfig = {
                            record_new: rawCfg.record_new || DEFAULT_CONFIG.record_new,
                            view: rawCfg.view || DEFAULT_CONFIG.view,
                            kpi_cards: rawCfg.kpi_cards || DEFAULT_CONFIG.kpi_cards,
                            middle_cards: rawCfg.middle_cards || DEFAULT_CONFIG.middle_cards,
                            bottom_widgets: rawCfg.bottom_widgets || DEFAULT_CONFIG.bottom_widgets,
                            right_summary: rawCfg.right_summary || DEFAULT_CONFIG.right_summary
                        };
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentConfig));
                        this.applyAll();
                        return this.currentConfig;
                    }
                }
            } catch(e) {
                console.warn('fetchConfigFromDB error:', e);
            }
            return this.getConfig();
        },

        saveConfigToDB: async function(config) {
            this.currentConfig = {
                record_new: config.record_new || DEFAULT_CONFIG.record_new,
                view: config.view || DEFAULT_CONFIG.view,
                kpi_cards: config.kpi_cards || DEFAULT_CONFIG.kpi_cards,
                middle_cards: config.middle_cards || DEFAULT_CONFIG.middle_cards,
                bottom_widgets: config.bottom_widgets || DEFAULT_CONFIG.bottom_widgets,
                right_summary: config.right_summary || DEFAULT_CONFIG.right_summary
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentConfig));
            this.applyAll();

            try {
                const s = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = s.company_id || 1;
                const res = await fetch(`api/settings.php?action=save_dashboard_settings&company_id=${coId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        company_id: coId,
                        dashboard_customization: this.currentConfig,
                        config: this.currentConfig
                    })
                });
                return res.ok;
            } catch(e) {
                return false;
            }
        },

        applyAll: function() {
            this.renderLeftSidebar();
            this.renderKpiCards();
            this.renderMiddleCards();
            this.renderBottomWidgets();
            this.renderRightSidebar();
            if (typeof window.updateDashboardSummary === 'function') {
                try { window.updateDashboardSummary(); } catch(e) {}
            }
        },

        // --- SECTION 1: Render Left Sidebar ---
        renderLeftSidebar: function() {
            const sidebar = document.querySelector('.left-sidebar');
            if (!sidebar) return;

            const cfg = this.getConfig();
            const recItems = (cfg.record_new || []).map(id => CATALOG.record_new.find(x => x.id === id)).filter(Boolean);
            const viewItems = (cfg.view || []).map(id => CATALOG.view.find(x => x.id === id)).filter(Boolean);

            let recHtml = '';
            recItems.forEach(item => {
                const act = item.action ? `onclick="${item.action}"` : '';
                recHtml += `<div class="sidebar-item" ${act}><i class="${item.icon}"></i> ${item.label}</div>`;
            });

            let viewHtml = '';
            viewItems.forEach(item => {
                if (item.action) {
                    viewHtml += `<div class="sidebar-item" onclick="${item.action}"><i class="${item.icon}"></i> ${item.label}</div>`;
                } else {
                    viewHtml += `<div class="sidebar-item" data-target="${item.target}" data-module="${item.module}"><i class="${item.icon}"></i> ${item.label}</div>`;
                }
            });

            sidebar.innerHTML = `
                <div class="sidebar-section">
                    <div class="section-header">
                        <i class="fas fa-plus-circle"></i>
                        Record New
                    </div>
                    <div class="sidebar-items" id="sidebar_record_new_items">
                        ${recHtml || '<div style="padding: 10px; font-size: 11px; color:#94a3b8;">No items selected</div>'}
                    </div>
                </div>
                <div class="sidebar-section">
                    <div class="section-header">
                        <i class="fas fa-eye"></i>
                        View
                    </div>
                    <div class="sidebar-items" id="sidebar_view_items">
                        ${viewHtml || '<div style="padding: 10px; font-size: 11px; color:#94a3b8;">No items selected</div>'}
                    </div>
                </div>
            `;

            // Attach SPA event listeners to any newly injected items with data-target
            sidebar.querySelectorAll('.sidebar-item[data-target]').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetUrl = item.getAttribute('data-target');
                    const moduleName = item.getAttribute('data-module');
                    const titleText = item.textContent.trim() || targetUrl.split('/').pop().replace('.html', '');
                    if (typeof window.openModularPopup === 'function') {
                        window.openModularPopup(targetUrl, 'fa-file-alt', titleText, null, moduleName, true, true);
                    }
                });
            });
        },

        // --- SECTION 2: Render Top 4 KPI Cards ---
        renderKpiCards: function() {
            const grid = document.querySelector('.stats-grid');
            if (!grid) return;

            const cfg = this.getConfig();
            const cards = (cfg.kpi_cards || []).slice(0, 4);

            let html = '';
            cards.forEach((metricId, idx) => {
                const m = CATALOG.kpi_metrics.find(x => x.id === metricId) || CATALOG.kpi_metrics[0];
                const valueId = `dash_kpi_val_${m.id}`;
                const badgeHtml = m.id === 'sales' ? '<span class="stat-badge">NIL</span>' : '';

                html += `
                    <div class="stat-card" data-metric="${m.id}" data-box-index="${idx}">
                        <div class="stat-header">
                            <i class="${m.icon}"></i>
                            <span>${m.label}</span>
                        </div>
                        <div class="stat-value ${m.id === 'invoices_count' ? '' : 'money'}" id="${valueId}">${m.id === 'invoices_count' ? '0' : '₹0'}</div>
                        ${badgeHtml}
                    </div>
                `;
            });

            grid.innerHTML = html;
        },

        // --- SECTION 3: Render Middle 3 Summary Cards ---
        renderMiddleCards: function() {
            const grid = document.querySelector('.financial-grid');
            if (!grid) return;

            const cfg = this.getConfig();
            const cards = (cfg.middle_cards || []).slice(0, 3);

            let html = '';
            cards.forEach(cardId => {
                if (cardId === 'cash_banks') {
                    html += `
                        <div class="financial-card" data-card-type="cash_banks">
                            <h3><i class="fas fa-coins"></i> Cash & Banks</h3>
                            <div class="financial-row">
                                <span class="label">Opening Balance</span>
                                <span class="value money" id="cashOpening">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Receipts</span>
                                <span class="value money" id="cashReceipts">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Payments</span>
                                <span class="value money" id="cashPayments">₹0</span>
                            </div>
                            <div class="financial-row highlight-row">
                                <span class="label">Current Balance</span>
                                <span class="value money" id="cashCurrent">₹0</span>
                            </div>
                        </div>
                    `;
                } else if (cardId === 'receivables') {
                    html += `
                        <div class="financial-card" data-card-type="receivables">
                            <h3><i class="fas fa-user-tie"></i> Receivables / Customers</h3>
                            <div class="financial-row">
                                <span class="label">Opening Balance</span>
                                <span class="value money" id="recOpening">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Sales (Debits)</span>
                                <span class="value money" id="recSales">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Receipts (Credits)</span>
                                <span class="value money" id="recReceipts">₹0</span>
                            </div>
                            <div class="financial-row highlight-row">
                                <span class="label">Current Balance</span>
                                <span class="value money" id="recCurrent">₹0</span>
                            </div>
                        </div>
                    `;
                } else if (cardId === 'payables') {
                    html += `
                        <div class="financial-card" data-card-type="payables">
                            <h3><i class="fas fa-truck"></i> Payables / Vendors</h3>
                            <div class="financial-row">
                                <span class="label">Opening Balance</span>
                                <span class="value money" id="payOpening">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Purchases (Credits)</span>
                                <span class="value money" id="payPurchases">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Payments (Debits)</span>
                                <span class="value money" id="payPayments">₹0</span>
                            </div>
                            <div class="financial-row highlight-row">
                                <span class="label">Current Balance</span>
                                <span class="value money" id="payCurrent">₹0</span>
                            </div>
                        </div>
                    `;
                } else if (cardId === 'pos_summary') {
                    html += `
                        <div class="financial-card" data-card-type="pos_summary">
                            <h3><i class="fas fa-cash-register" style="color: #7c3aed;"></i> POS Daily Summary</h3>
                            <div class="financial-row">
                                <span class="label">Today's Invoices</span>
                                <span class="value" id="posTodayInvoices">0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Cash Sales</span>
                                <span class="value money" id="posCashSales">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Card / Bank Sales</span>
                                <span class="value money" id="posCardSales">₹0</span>
                            </div>
                            <div class="financial-row highlight-row">
                                <span class="label">Net POS Total</span>
                                <span class="value money" id="posNetTotal">₹0</span>
                            </div>
                        </div>
                    `;
                } else if (cardId === 'digital_invoicing') {
                    html += `
                        <div class="financial-card" data-card-type="digital_invoicing">
                            <h3><i class="fas fa-file-invoice" style="color: #2563eb;"></i> Digital Invoicing (FBR)</h3>
                            <div class="financial-row">
                                <span class="label">Active Digital Invoices</span>
                                <span class="value" id="fbrActiveInvoices">0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Total Tax Amount</span>
                                <span class="value money" id="fbrTaxTotal">₹0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Credit / Debit Notes</span>
                                <span class="value" id="fbrNotesCount">0</span>
                            </div>
                            <div class="financial-row highlight-row">
                                <span class="label">Compliance Status</span>
                                <span class="value" id="fbrComplianceStatus" style="color: #dc2626; font-weight:700;"><i class="fas fa-times-circle"></i> Not Configured</span>
                            </div>
                        </div>
                    `;
                } else if (cardId === 'inventory_summary') {
                    html += `
                        <div class="financial-card" data-card-type="inventory_summary">
                            <h3><i class="fas fa-boxes" style="color: #d97706;"></i> Inventory Stock Summary</h3>
                            <div class="financial-row">
                                <span class="label">Total Stock Items</span>
                                <span class="value" id="invTotalItems">0 Items</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Low Stock Items</span>
                                <span class="value" style="color: #d97706; font-weight: 700;" id="invLowStockVal">0</span>
                            </div>
                            <div class="financial-row">
                                <span class="label">Reorder Needed</span>
                                <span class="value" style="color: #dc2626; font-weight: 700;" id="invReorderVal">0</span>
                            </div>
                            <div class="financial-row highlight-row">
                                <span class="label">Total Stock Value</span>
                                <span class="value money" id="invStockValue">₹0</span>
                            </div>
                        </div>
                    `;
                }
            });

            grid.innerHTML = html;
        },

        // --- SECTION 4: Render Bottom Widgets ---
        renderBottomWidgets: function() {
            const grid = document.querySelector('.widgets-grid');
            if (!grid) return;

            const cfg = this.getConfig();
            const widgets = cfg.bottom_widgets || ['weekly_sales_trend', 'my_notes'];

            let html = '';
            if (widgets.includes('weekly_sales_trend')) {
                html += `
                    <div class="widget-card">
                        <div class="widget-title">
                            <i class="fas fa-chart-line"></i>
                            Weekly Sales Trend
                        </div>
                        <div class="graph-bars">
                            <div class="bar-container"><div class="bar" style="height: 40px;"></div><span class="bar-label">Mon</span></div>
                            <div class="bar-container"><div class="bar" style="height: 60px;"></div><span class="bar-label">Tue</span></div>
                            <div class="bar-container"><div class="bar" style="height: 30px;"></div><span class="bar-label">Wed</span></div>
                            <div class="bar-container"><div class="bar" style="height: 80px;"></div><span class="bar-label">Thu</span></div>
                            <div class="bar-container"><div class="bar" style="height: 55px;"></div><span class="bar-label">Fri</span></div>
                            <div class="bar-container"><div class="bar" style="height: 65px;"></div><span class="bar-label">Sat</span></div>
                        </div>
                    </div>
                `;
            }

            if (widgets.includes('my_notes')) {
                html += `
                    <div class="widget-card">
                        <div class="widget-title">
                            <i class="fas fa-pen"></i>
                            My Notes
                        </div>
                        <textarea class="notes-textarea" id="notesText" placeholder="Write your notes here...">${localStorage.getItem('user_notes') || 'Meeting with suppliers tomorrow at 10 AM. Follow up with ABC Traders for payment.'}</textarea>
                        <div class="notes-actions">
                            <button class="btn btn-primary" id="saveNoteBtn" onclick="localStorage.setItem('user_notes', document.getElementById('notesText').value); alert('Notes saved successfully!');"><i class="fas fa-save"></i> Save</button>
                            <button class="btn btn-secondary" id="clearNoteBtn" onclick="document.getElementById('notesText').value=''; localStorage.removeItem('user_notes');"><i class="fas fa-times"></i> Clear</button>
                        </div>
                    </div>
                `;
            }

            if (widgets.includes('recent_activity')) {
                html += `
                    <div class="widget-card">
                        <div class="widget-title">
                            <i class="fas fa-history"></i>
                            Recent Transactions Activity
                        </div>
                        <div style="font-size: 11.5px; color: #475569; padding: 6px 0;">
                            <div style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
                                <span><i class="fas fa-circle" style="color:#10b981; font-size:8px;"></i> Live Sync</span>
                                <span style="font-weight:600; color:#0f172a;">Active</span>
                            </div>
                            <div style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
                                <span>Audit Logging</span>
                                <span style="color:#2563eb; cursor:pointer;" onclick="if(window.openModularPopup) openModularPopup('Navigation/Administrator/activity_logs.html', 'fa-history', 'User Activity Logs', null, 'User Activity Logs', true, true);">View Full Log</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            grid.innerHTML = html;
        },

        // --- SECTION 5: Render Right Sidebar Summary ---
        renderRightSidebar: function() {
            const container = document.querySelector('.right-sidebar .summary-section');
            if (!container) return;

            const cfg = this.getConfig();
            const allowed = cfg.right_summary || ['cash_position', 'customer_activity', 'vendor_activity', 'inventory_alerts'];

            let html = `
                <div class="summary-title">
                    <i class="fas fa-chart-simple"></i>
                    Today's Summary
                </div>
            `;

            if (allowed.includes('cash_position')) {
                html += `
                    <div class="summary-card" data-summary-id="cash_position">
                        <h4><i class="fas fa-coins"></i> Cash Position</h4>
                        <div class="summary-row"><span>Opening:</span> <span class="value money" id="summaryCashOpening">₹0</span></div>
                        <div class="summary-row"><span>Receipts:</span> <span class="value money" id="summaryCashReceipts">₹0</span></div>
                        <div class="summary-row"><span>Payments:</span> <span class="value money" id="summaryCashPayments">₹0</span></div>
                        <div class="summary-row"><span>Net:</span> <span class="value highlight-value money" id="summaryCashNet">₹0</span></div>
                    </div>
                `;
            }

            if (allowed.includes('customer_activity')) {
                html += `
                    <div class="summary-card" data-summary-id="customer_activity">
                        <h4><i class="fas fa-users"></i> Customer Activity</h4>
                        <div class="summary-row"><span>New Invoices:</span> <span class="value" id="summaryNewInvoices">0</span></div>
                        <div class="summary-row"><span>Receipts:</span> <span class="value money" id="summaryCustomerReceipts">₹0</span></div>
                        <div class="summary-row"><span>Overdue:</span> <span class="value money" id="summaryOverdue">₹0</span></div>
                    </div>
                `;
            }

            if (allowed.includes('vendor_activity')) {
                html += `
                    <div class="summary-card" data-summary-id="vendor_activity">
                        <h4><i class="fas fa-truck"></i> Vendor Activity</h4>
                        <div class="summary-row"><span>New Purchases:</span> <span class="value" id="summaryNewPurchases">0</span></div>
                        <div class="summary-row"><span>Payments:</span> <span class="value money" id="summaryVendorPayments">₹0</span></div>
                        <div class="summary-row"><span>Outstanding:</span> <span class="value money" id="summaryOutstanding">₹0</span></div>
                    </div>
                `;
            }

            if (allowed.includes('inventory_alerts')) {
                html += `
                    <div class="summary-card" id="inventoryAlertsCard" data-summary-id="inventory_alerts" style="cursor: pointer;">
                        <h4><i class="fas fa-box"></i> Inventory Alerts</h4>
                        <div class="summary-row">
                            <span>Low Stock Items:</span> 
                            <span class="alert-badge" id="lowStockCount">3 Items</span>
                        </div>
                        <div class="summary-row">
                            <span>Reorder Needed:</span> 
                            <span class="alert-badge danger" id="reorderCount">2 Items</span>
                        </div>
                    </div>
                `;
            }

            if (allowed.includes('pos_activity')) {
                html += `
                    <div class="summary-card" data-summary-id="pos_activity">
                        <h4><i class="fas fa-cash-register" style="color:#7c3aed;"></i> POS Activity</h4>
                        <div class="summary-row"><span>Today's Counter Bills:</span> <span class="value" id="summaryPosBills">0</span></div>
                        <div class="summary-row"><span>POS Net Cash:</span> <span class="value money" id="summaryPosCash">₹0</span></div>
                        <div class="summary-row"><span>POS Returns:</span> <span class="value money" id="summaryPosReturns">₹0</span></div>
                    </div>
                `;
            }

            if (allowed.includes('digital_activity')) {
                html += `
                    <div class="summary-card" data-summary-id="digital_activity">
                        <h4><i class="fas fa-shield-alt" style="color:#16a34a;"></i> FBR Digital Invoicing</h4>
                        <div class="summary-row"><span>Sync Status:</span> <span class="alert-badge" id="summaryFbrSyncBadge" style="background:#fee2e2; color:#b91c1c;">Not Configured</span></div>
                        <div class="summary-row"><span>Tax Uploaded:</span> <span class="value money" id="summaryFbrTax">₹0</span></div>
                        <div class="summary-row"><span>FBR Invoices:</span> <span class="value" id="summaryFbrCount">0</span></div>
                    </div>
                `;
            }

            container.innerHTML = html;
        },

        // --- UPDATE VALUES DYNAMICALLY ---
        updateValues: function(dailySummary) {
            dailySummary = dailySummary || window.dailySummary || {};
            const currencySymbol = (window.globalCurrencySymbol || 'Rs.') + ' ';
            const fmt = val => {
                const n = parseFloat(val) || 0;
                return currencySymbol + n.toLocaleString('en-US', {
                    minimumFractionDigits: Math.abs(n) % 1 > 0.001 ? 2 : 0,
                    maximumFractionDigits: 2
                });
            };

            const sales = dailySummary.sales || 0;
            const cashHand = (dailySummary.cashOpening || 0) + (dailySummary.cashReceipts || 0) - (dailySummary.cashPayments || 0);
            const bankBal = dailySummary.bankBalance || 0;
            const recTotal = (dailySummary.recOpening || 0) + (dailySummary.recSales || 0) - (dailySummary.recReceipts || 0);
            const payTotal = (dailySummary.payOpening || 0) + (dailySummary.payPurchases || 0) - (dailySummary.payPayments || 0);
            const purchases = dailySummary.payPurchases || 0;
            const netCashBank = cashHand + bankBal;
            const invoicesCount = dailySummary.newInvoices || 0;
            const posSales = dailySummary.posSales || 0;
            const digitalSales = dailySummary.digitalSales || 0;

            const map = {
                'sales': { val: fmt(sales), id: 'salesValue' },
                'cash_hand': { val: fmt(cashHand), id: 'cashValue' },
                'bank_bal': { val: fmt(bankBal), id: 'bankValue' },
                'rec_total': { val: fmt(recTotal), id: 'receivablesValue' },
                'pay_total': { val: fmt(payTotal), id: 'dash_kpi_val_pay_total' },
                'purchases': { val: fmt(purchases), id: 'dash_kpi_val_purchases' },
                'pos_sales': { val: fmt(posSales), id: 'dash_kpi_val_pos_sales' },
                'digital_sales': { val: fmt(digitalSales), id: 'dash_kpi_val_digital_sales' },
                'net_cash_bank': { val: fmt(netCashBank), id: 'dash_kpi_val_net_cash_bank' },
                'invoices_count': { val: String(invoicesCount), id: 'dash_kpi_val_invoices_count' }
            };

            // Update each stat card
            document.querySelectorAll('.stat-card[data-metric]').forEach(card => {
                const metric = card.getAttribute('data-metric');
                const valEl = card.querySelector('.stat-value');
                if (valEl && map[metric]) {
                    valEl.textContent = map[metric].val;
                }
            });

            // Update Middle Cards if POS / Digital / Inventory are shown
            const posInvEl = document.getElementById('posTodayInvoices');
            if (posInvEl) posInvEl.textContent = String(dailySummary.posInvoices !== undefined ? dailySummary.posInvoices : (dailySummary.pos_invoices || 0));
            const posCashEl = document.getElementById('posCashSales');
            if (posCashEl) posCashEl.textContent = fmt(dailySummary.posCashSales !== undefined ? dailySummary.posCashSales : (dailySummary.pos_cash_sales || 0));
            const posCardEl = document.getElementById('posCardSales');
            if (posCardEl) posCardEl.textContent = fmt(dailySummary.posCardSales !== undefined ? dailySummary.posCardSales : (dailySummary.pos_card_sales || 0));
            const posNetEl = document.getElementById('posNetTotal');
            if (posNetEl) posNetEl.textContent = fmt(dailySummary.posNetTotal !== undefined ? dailySummary.posNetTotal : (dailySummary.pos_net_total || dailySummary.posSales || 0));

            const fbrInvEl = document.getElementById('fbrActiveInvoices');
            if (fbrInvEl) fbrInvEl.textContent = String(dailySummary.digitalInvoices !== undefined ? dailySummary.digitalInvoices : (dailySummary.digital_invoices || 0));
            const fbrTaxEl = document.getElementById('fbrTaxTotal');
            if (fbrTaxEl) fbrTaxEl.textContent = fmt(dailySummary.digitalTax !== undefined ? dailySummary.digitalTax : (dailySummary.digital_tax || 0));
            const fbrNotesEl = document.getElementById('fbrNotesCount');
            if (fbrNotesEl) fbrNotesEl.textContent = String(dailySummary.digitalNotes !== undefined ? dailySummary.digitalNotes : (dailySummary.digital_notes || 0));

            const fbrCompEl = document.getElementById('fbrComplianceStatus');
            if (fbrCompEl) {
                const isConn = (dailySummary.digitalConnected !== undefined) ? dailySummary.digitalConnected : (dailySummary.digital_connected || false);
                const stText = dailySummary.digitalStatus || dailySummary.digital_status || 'Not Configured';
                if (isConn) {
                    fbrCompEl.style.color = '#16a34a';
                    fbrCompEl.innerHTML = '<i class="fas fa-check-circle"></i> Integrated';
                } else {
                    fbrCompEl.style.color = '#dc2626';
                    fbrCompEl.innerHTML = '<i class="fas fa-times-circle"></i> ' + stText;
                }
            }

            const invTotalEl = document.getElementById('invTotalItems');
            if (invTotalEl && window.inventoryItems) invTotalEl.textContent = (window.inventoryItems.length || 0) + ' Items';

            // Update Right Sidebar extra cards
            const posBillsEl = document.getElementById('summaryPosBills');
            if (posBillsEl) posBillsEl.textContent = String(dailySummary.posInvoices !== undefined ? dailySummary.posInvoices : (dailySummary.pos_invoices || 0));
            const posCashSummaryEl = document.getElementById('summaryPosCash');
            if (posCashSummaryEl) posCashSummaryEl.textContent = fmt(dailySummary.posCashSales !== undefined ? dailySummary.posCashSales : (dailySummary.pos_cash_sales || 0));
            const posReturnsSummaryEl = document.getElementById('summaryPosReturns');
            if (posReturnsSummaryEl) posReturnsSummaryEl.textContent = fmt(dailySummary.posReturns !== undefined ? dailySummary.posReturns : (dailySummary.pos_returns || 0));

            const fbrSyncBadge = document.getElementById('summaryFbrSyncBadge');
            if (fbrSyncBadge) {
                const isConn = (dailySummary.digitalConnected !== undefined) ? dailySummary.digitalConnected : (dailySummary.digital_connected || false);
                const stText = dailySummary.digitalStatus || dailySummary.digital_status || 'Not Configured';
                if (isConn) {
                    fbrSyncBadge.style.background = '#dcfce7';
                    fbrSyncBadge.style.color = '#15803d';
                    fbrSyncBadge.textContent = 'Connected';
                } else {
                    fbrSyncBadge.style.background = '#fee2e2';
                    fbrSyncBadge.style.color = '#b91c1c';
                    fbrSyncBadge.textContent = stText;
                }
            }
            const fbrTaxSummaryEl = document.getElementById('summaryFbrTax');
            if (fbrTaxSummaryEl) fbrTaxSummaryEl.textContent = fmt(dailySummary.digitalTaxUploaded !== undefined ? dailySummary.digitalTaxUploaded : (dailySummary.digital_tax_uploaded || 0));
            const fbrCountSummaryEl = document.getElementById('summaryFbrCount');
            if (fbrCountSummaryEl) fbrCountSummaryEl.textContent = String(dailySummary.digitalSubmittedCount !== undefined ? dailySummary.digitalSubmittedCount : (dailySummary.digital_submitted_count || dailySummary.digitalInvoices || dailySummary.digital_invoices || 0));
        },

        // --- FORM BINDINGS FOR SYSTEM SETTINGS MODAL ---
        populateSettingsForm: function() {
            const cfg = this.getConfig();

            // 1. Record New Checkboxes
            const recCont = document.getElementById('cfg_dash_record_new_list');
            if (recCont) {
                let h = '';
                CATALOG.record_new.forEach(item => {
                    const checked = (cfg.record_new || []).includes(item.id) ? 'checked' : '';
                    h += `
                        <label style="display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" name="dash_cfg_rec" value="${item.id}" ${checked}>
                            <i class="${item.icon}" style="color:#0284c7; width:16px;"></i>
                            <span>${item.label}</span>
                        </label>
                    `;
                });
                recCont.innerHTML = h;
            }

            // 2. View Checkboxes
            const viewCont = document.getElementById('cfg_dash_view_list');
            if (viewCont) {
                let h = '';
                CATALOG.view.forEach(item => {
                    const checked = (cfg.view || []).includes(item.id) ? 'checked' : '';
                    h += `
                        <label style="display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" name="dash_cfg_view" value="${item.id}" ${checked}>
                            <i class="${item.icon}" style="color:#10b981; width:16px;"></i>
                            <span>${item.label}</span>
                        </label>
                    `;
                });
                viewCont.innerHTML = h;
            }

            // 3. Top 4 KPI Selectors
            for (let i = 0; i < 4; i++) {
                const sel = document.getElementById(`cfg_dash_kpi_${i}`);
                if (sel) {
                    sel.innerHTML = CATALOG.kpi_metrics.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
                    if (cfg.kpi_cards && cfg.kpi_cards[i]) {
                        sel.value = cfg.kpi_cards[i];
                    }
                }
            }

            // 4. Middle 3 Summary Cards Selectors
            for (let i = 0; i < 3; i++) {
                const sel = document.getElementById(`cfg_dash_mid_${i}`);
                if (sel) {
                    sel.innerHTML = CATALOG.middle_cards.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
                    if (cfg.middle_cards && cfg.middle_cards[i]) {
                        sel.value = cfg.middle_cards[i];
                    }
                }
            }

            // 5. Bottom Widgets Checkboxes
            const botCont = document.getElementById('cfg_dash_bottom_widgets_list');
            if (botCont) {
                let h = '';
                CATALOG.bottom_widgets.forEach(w => {
                    const checked = (cfg.bottom_widgets || []).includes(w.id) ? 'checked' : '';
                    h += `
                        <label style="display:flex; align-items:center; gap:8px; padding:6px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" name="dash_cfg_bottom" value="${w.id}" ${checked}>
                            <span>${w.label}</span>
                        </label>
                    `;
                });
                botCont.innerHTML = h;
            }

            // 6. Right Sidebar Checkboxes
            const rightCont = document.getElementById('cfg_dash_right_summary_list');
            if (rightCont) {
                let h = '';
                CATALOG.right_summary.forEach(s => {
                    const checked = (cfg.right_summary || []).includes(s.id) ? 'checked' : '';
                    h += `
                        <label style="display:flex; align-items:center; gap:8px; padding:6px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" name="dash_cfg_right" value="${s.id}" ${checked}>
                            <span>${s.label}</span>
                        </label>
                    `;
                });
                rightCont.innerHTML = h;
            }
        },

        saveSettingsFromForm: async function() {
            const newConfig = {
                record_new: Array.from(document.querySelectorAll('input[name="dash_cfg_rec"]:checked')).map(el => el.value),
                view: Array.from(document.querySelectorAll('input[name="dash_cfg_view"]:checked')).map(el => el.value),
                kpi_cards: [
                    document.getElementById('cfg_dash_kpi_0')?.value || 'sales',
                    document.getElementById('cfg_dash_kpi_1')?.value || 'cash_hand',
                    document.getElementById('cfg_dash_kpi_2')?.value || 'bank_bal',
                    document.getElementById('cfg_dash_kpi_3')?.value || 'rec_total'
                ],
                middle_cards: [
                    document.getElementById('cfg_dash_mid_0')?.value || 'cash_banks',
                    document.getElementById('cfg_dash_mid_1')?.value || 'receivables',
                    document.getElementById('cfg_dash_mid_2')?.value || 'payables'
                ],
                bottom_widgets: Array.from(document.querySelectorAll('input[name="dash_cfg_bottom"]:checked')).map(el => el.value),
                right_summary: Array.from(document.querySelectorAll('input[name="dash_cfg_right"]:checked')).map(el => el.value)
            };

            const ok = await this.saveConfigToDB(newConfig);
            const feedback = document.getElementById('save_feedback_msg_dashboard');
            if (feedback) {
                feedback.style.display = 'inline-block';
                setTimeout(() => { feedback.style.display = 'none'; }, 3500);
            }
            if (window.showAlert) {
                window.showAlert('Dashboard customized and saved successfully!', 'success');
            }
            return ok;
        },

        resetDefaults: async function() {
            if (!confirm('Are you sure you want to reset all dashboard settings to system defaults?')) return;
            await this.saveConfigToDB(DEFAULT_CONFIG);
            this.populateSettingsForm();
            if (window.showAlert) {
                window.showAlert('Dashboard layout reset to system default.', 'info');
            }
        },

        refresh: async function(silent = true) {
            try {
                const s = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = s.company_id || 1;
                const dEl = document.getElementById('dailyReportDate');
                const targetDate = (dEl && dEl.value) ? dEl.value : new Date().toISOString().split('T')[0];
                const cb = `_cb=${Date.now()}`;
                const res = await fetch(`api/admin.php?action=get_summary&company_id=${coId}&report_date=${targetDate}&${cb}`, { cache: 'no-store' });
                if (res.ok) {
                    const summary = await res.json();
                    if (summary && !summary.error) {
                        const ds = {
                            sales: parseFloat(summary.sales || 0),
                            cashOpening: parseFloat(summary.cash_opening || 0),
                            cashReceipts: parseFloat(summary.cash_receipts || 0),
                            cashPayments: parseFloat(summary.cash_payments || 0),
                            bankOpening: parseFloat(summary.bank_opening || 0),
                            bankReceipts: parseFloat(summary.bank_receipts || 0),
                            bankPayments: parseFloat(summary.bank_payments || 0),
                            bankBalance: parseFloat(summary.bank_balance || 0),
                            recOpening: parseFloat(summary.rec_opening || 0),
                            recSales: parseFloat(summary.rec_sales || 0),
                            recReceipts: parseFloat(summary.rec_receipts || 0),
                            payOpening: parseFloat(summary.pay_opening || 0),
                            payPurchases: parseFloat(summary.pay_purchases || 0),
                            payPayments: parseFloat(summary.pay_payments || 0),
                            newInvoices: parseInt(summary.new_invoices || 0),
                            customerReceipts: parseFloat(summary.customer_receipts || 0),
                            overdue: parseFloat(summary.overdue || 0),
                            newPurchases: parseInt(summary.new_purchases || 0),
                            vendorPayments: parseFloat(summary.vendor_payments || 0),
                            outstanding: parseFloat(summary.outstanding || 0),
                            posInvoices: parseInt(summary.pos_invoices || 0),
                            posSales: parseFloat(summary.pos_sales || 0),
                            posCashSales: parseFloat(summary.pos_cash_sales || 0),
                            posCardSales: parseFloat(summary.pos_card_sales || 0),
                            posTaxTotal: parseFloat(summary.pos_tax_total || 0),
                            posReturns: parseFloat(summary.pos_returns || 0),
                            posNetTotal: parseFloat(summary.pos_net_total || 0),
                            digitalInvoices: parseInt(summary.digital_invoices || 0),
                            digitalSales: parseFloat(summary.digital_sales || 0),
                            digitalTax: parseFloat(summary.digital_tax || 0),
                            digitalTaxUploaded: parseFloat(summary.digital_tax_uploaded || 0),
                            digitalSubmittedCount: parseInt(summary.digital_submitted_count || 0),
                            digitalNotes: parseInt(summary.digital_notes || 0),
                            digitalConnected: !!summary.digital_connected,
                            digitalStatus: summary.digital_status || 'Not Configured'
                        };
                        window.dailySummary = ds;
                        this.updateValues(ds);
                        if (typeof window.updateDashboardSummary === 'function') {
                            try { window.updateDashboardSummary(); } catch(e) {}
                        }
                    }
                }
            } catch(e) {
                console.warn('Dashboard auto-refresh error:', e);
            }
        },

        init: function() {
            // Live auto-refresh polling every 10 seconds without manual page reload
            if (!window._dashCustomizerPollStarted) {
                window._dashCustomizerPollStarted = true;
                setInterval(() => {
                    if (!document.hidden && typeof DashboardCustomizer.refresh === 'function') {
                        DashboardCustomizer.refresh(true);
                    }
                }, 10000);
                window.addEventListener('focus', () => {
                    if (typeof DashboardCustomizer.refresh === 'function') DashboardCustomizer.refresh(true);
                });
                window.addEventListener('softifyx_transaction_saved', () => {
                    if (typeof DashboardCustomizer.refresh === 'function') DashboardCustomizer.refresh(true);
                });
            }
            this.getConfig();
            this.applyAll();
            this.fetchConfigFromDB();
        }
    };

    window.DashboardCustomizer = DashboardCustomizer;

    // Auto-init on script load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => DashboardCustomizer.init());
    } else {
        DashboardCustomizer.init();
    }

})(window);
