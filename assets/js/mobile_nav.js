/**
 * SoftifyX ERP - Mobile Navigation & Responsive Helper
 * Adds mobile bottom bar, touch-friendly drawers, and full-screen window adaptation
 */
(function() {
    window.MobileNav = {
        activeDrawer: null,

        init: function() {
            if (document.getElementById('mobileBottomNav')) return;
            this.injectHTML();
            this.bindEvents();
        },

        injectHTML: function() {
            // 1. Mobile Bottom Bar
            const bar = document.createElement('nav');
            bar.id = 'mobileBottomNav';
            bar.className = 'mobile-bottom-nav';
            bar.innerHTML = `
                <button type="button" class="mob-tab active" id="mobTabHome" onclick="MobileNav.switchTab('dashboard')">
                    <i class="fas fa-home"></i>
                    <span>Dashboard</span>
                </button>
                <button type="button" class="mob-tab" id="mobTabNew" onclick="MobileNav.openDrawer('new')">
                    <i class="fas fa-plus-circle"></i>
                    <span>Record New</span>
                </button>
                <button type="button" class="mob-tab" id="mobTabReports" onclick="MobileNav.openDrawer('reports')">
                    <i class="fas fa-chart-line"></i>
                    <span>Reports</span>
                </button>
                <button type="button" class="mob-tab" id="mobTabStock" onclick="MobileNav.openDrawer('stock')">
                    <i class="fas fa-cubes"></i>
                    <span>Stock &amp; FG</span>
                </button>
                <button type="button" class="mob-tab" id="mobTabProfile" onclick="MobileNav.closeDrawer(); if(window.openUserProfileModal) window.openUserProfileModal();">
                    <i class="fas fa-user-cog"></i>
                    <span>Profile</span>
                </button>
            `;
            document.body.appendChild(bar);

            // 2. Backdrop Overlay
            const backdrop = document.createElement('div');
            backdrop.id = 'mobileDrawerBackdrop';
            backdrop.className = 'mobile-drawer-backdrop';
            backdrop.onclick = () => MobileNav.closeDrawer();
            document.body.appendChild(backdrop);

            // 3. Drawers Container
            const drawerContainer = document.createElement('div');
            drawerContainer.id = 'mobileDrawersContainer';
            drawerContainer.innerHTML = `
                <!-- RECORD NEW DRAWER -->
                <div id="mobileDrawerNew" class="mobile-drawer-sheet">
                    <div class="mobile-drawer-header">
                        <div class="drawer-title"><i class="fas fa-plus-circle" style="color: #2563eb;"></i> Record New</div>
                        <button type="button" class="drawer-close-btn" onclick="MobileNav.closeDrawer()">&times;</button>
                    </div>
                    <div class="mobile-drawer-grid">
                        <div class="mob-grid-item" onclick="MobileNav.triggerClick('Navigation/Sales/sale_invoice.html', 'openDefaultSaleInvoice')">
                            <div class="mob-grid-icon" style="background: #eff6ff; color: #2563eb;"><i class="fas fa-file-invoice-dollar"></i></div>
                            <span>Sale Invoice</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', () => window.PIModule && window.PIModule.init(), 'Purchase Invoice')">
                            <div class="mob-grid-icon" style="background: #ecfdf5; color: #059669;"><i class="fas fa-cart-arrow-down"></i></div>
                            <span>Purchase Inv.</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Sales/delivery_challans.html', 'fa-truck-loading', 'Delivery Challans', () => { if(window.DeliveryChallanModule) window.DeliveryChallanModule.init(); }, 'Delivery Challans')">
                            <div class="mob-grid-icon" style="background: #fef3c7; color: #d97706;"><i class="fas fa-truck"></i></div>
                            <span>Delivery Challan</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Sales/cash_receipts.html', 'fa-hand-holding-usd', 'Cash Receipts', () => window.initCashReceiptModule && window.initCashReceiptModule(), 'Cash Receipts')">
                            <div class="mob-grid-icon" style="background: #ecfdf5; color: #16a34a;"><i class="fas fa-hand-holding-usd"></i></div>
                            <span>Cash Receipt</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Purchases/cash_payments.html', 'fa-money-bill-wave', 'Cash Payments', () => window.initCashPaymentModule && window.initCashPaymentModule(), 'Cash Payments')">
                            <div class="mob-grid-icon" style="background: #fef2f2; color: #dc2626;"><i class="fas fa-money-bill-wave"></i></div>
                            <span>Cash Payment</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Sales/bank_receipts.html', 'fa-university', 'Bank Receipts', () => window.initBankReceiptModule && window.initBankReceiptModule(), 'Bank Receipts')">
                            <div class="mob-grid-icon" style="background: #f0fdf4; color: #15803d;"><i class="fas fa-university"></i></div>
                            <span>Bank Receipt</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Purchases/bank_payments.html', 'fa-university', 'Bank Payments', () => window.initBankPaymentModule && window.initBankPaymentModule(), 'Bank Payments')">
                            <div class="mob-grid-icon" style="background: #fef2f2; color: #b91c1c;"><i class="fas fa-university"></i></div>
                            <span>Bank Payment</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Store/inward_gate_passes.html', 'fa-dolly', 'Inward Gate Passes', () => window.IGPModule && window.IGPModule.init(), 'Inward Gate Passes')">
                            <div class="mob-grid-icon" style="background: #f1f5f9; color: #475569;"><i class="fas fa-dolly"></i></div>
                            <span>Inwards GP</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Store/outward_gate_passes.html', 'fa-dolly', 'Outward Gate Passes', () => window.OGPModule && window.OGPModule.init(), 'Outward Gate Passes')">
                            <div class="mob-grid-icon" style="background: #f1f5f9; color: #334155;"><i class="fas fa-dolly-flatbed"></i></div>
                            <span>Outward GP</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Purchases/purchase_return.html', 'fa-undo', 'Purchase Return / Debit Note', () => window.PRModule && window.PRModule.init(), 'Purchase Return')">
                            <div class="mob-grid-icon" style="background: #fff1f2; color: #e11d48;"><i class="fas fa-undo"></i></div>
                            <span>Purchase Return</span>
                        </div>
                    </div>
                </div>

                <!-- REPORTS DRAWER -->
                <div id="mobileDrawerReports" class="mobile-drawer-sheet">
                    <div class="mobile-drawer-header">
                        <div class="drawer-title"><i class="fas fa-chart-line" style="color: #0284c7;"></i> View Reports &amp; Balances</div>
                        <button type="button" class="drawer-close-btn" onclick="MobileNav.closeDrawer()">&times;</button>
                    </div>
                    <div class="mobile-drawer-grid">
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Reports/view_account_ledger.html', 'fa-book', 'Accounts\' Ledgers', () => { if(window.AccountLedgerModule) window.AccountLedgerModule.init(); }, 'View Account Ledger')">
                            <div class="mob-grid-icon" style="background: #eff6ff; color: #1d4ed8;"><i class="fas fa-book"></i></div>
                            <span>Accounts' Ledger</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/customer_balances.html', 'Customer Balances')">
                            <div class="mob-grid-icon" style="background: #ecfdf5; color: #059669;"><i class="fas fa-user-tie"></i></div>
                            <span>Customers' Bal</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/vendor_balances.html', 'Vendor Balances')">
                            <div class="mob-grid-icon" style="background: #fef2f2; color: #dc2626;"><i class="fas fa-users"></i></div>
                            <span>Vendors' Bal</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Reports/sale_report.html', 'fa-file-invoice-dollar', 'Sale Summary', () => { if(window.SaleReportModule) window.SaleReportModule.init(); }, 'Sale Summary')">
                            <div class="mob-grid-icon" style="background: #f0fdf4; color: #16a34a;"><i class="fas fa-chart-bar"></i></div>
                            <span>Sale Summary</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/purchase_summary.html', 'Purchase Summary')">
                            <div class="mob-grid-icon" style="background: #eff6ff; color: #2563eb;"><i class="fas fa-chart-line"></i></div>
                            <span>Purchase Report</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/purchase_register.html', 'Purchase Register')">
                            <div class="mob-grid-icon" style="background: #f8fafc; color: #475569;"><i class="fas fa-list-alt"></i></div>
                            <span>Purchase Reg.</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/inventory_balances.html', 'Inventory Balances')">
                            <div class="mob-grid-icon" style="background: #fef3c7; color: #d97706;"><i class="fas fa-cubes"></i></div>
                            <span>Inventory Bal</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/view_inventory_ledgers.html', 'View Inventory Ledgers')">
                            <div class="mob-grid-icon" style="background: #fff7ed; color: #ea580c;"><i class="fas fa-boxes"></i></div>
                            <span>Inventory Ledger</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerTarget('Navigation/Reports/trial_balance.html', 'Trial Balance')">
                            <div class="mob-grid-icon" style="background: #faf5ff; color: #7c3aed;"><i class="fas fa-balance-scale"></i></div>
                            <span>Trial Balance</span>
                        </div>
                        <div class="mob-grid-item" onclick="MobileNav.triggerOpen('Navigation/Reports/purchase_order_tracker.html', 'fa-file-invoice', 'Purchase Order Tracker', () => { if(window.PurchaseOrderTracker) window.PurchaseOrderTracker.init(); }, 'Purchase Order Tracking')">
                            <div class="mob-grid-icon" style="background: #ecfeff; color: #0891b2;"><i class="fas fa-tasks"></i></div>
                            <span>PO Tracker</span>
                        </div>
                    </div>
                </div>

                <!-- STOCK & FG DRAWER (MIRRORS RIGHT SIDEBAR IN REAL-TIME) -->
                <div id="mobileDrawerStock" class="mobile-drawer-sheet">
                    <div class="mobile-drawer-header">
                        <div class="drawer-title"><i class="fas fa-cubes" style="color: #d97706;"></i> Live Stock &amp; Production</div>
                        <button type="button" class="drawer-close-btn" onclick="MobileNav.closeDrawer()">&times;</button>
                    </div>
                    <div id="mobStockCardsContent" style="padding: 12px; display: flex; flex-direction: column; gap: 12px; max-height: 75vh; overflow-y: auto;">
                        <!-- Will be populated dynamically from #rawMaterialCard and #finishedGoodsCard -->
                    </div>
                </div>
            `;
            document.body.appendChild(drawerContainer);
        },

        openDrawer: function(type) {
            this.closeDrawer();
            const backdrop = document.getElementById('mobileDrawerBackdrop');
            let sheetId = '';
            let tabId = '';

            if (type === 'new') {
                sheetId = 'mobileDrawerNew';
                tabId = 'mobTabNew';
            } else if (type === 'reports') {
                sheetId = 'mobileDrawerReports';
                tabId = 'mobTabReports';
            } else if (type === 'stock') {
                sheetId = 'mobileDrawerStock';
                tabId = 'mobTabStock';
                this.syncStockCards();
            }

            const sheet = document.getElementById(sheetId);
            if (!sheet) return;

            if (backdrop) backdrop.classList.add('active');
            sheet.classList.add('active');
            this.activeDrawer = sheet;

            // Highlight Tab
            document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
            const curTab = document.getElementById(tabId);
            if (curTab) curTab.classList.add('active');
        },

        closeDrawer: function() {
            const backdrop = document.getElementById('mobileDrawerBackdrop');
            if (backdrop) backdrop.classList.remove('active');
            if (this.activeDrawer) {
                this.activeDrawer.classList.remove('active');
                this.activeDrawer = null;
            }
            document.querySelectorAll('.mobile-drawer-sheet').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
            const homeTab = document.getElementById('mobTabHome');
            if (homeTab) homeTab.classList.add('active');
        },

        switchTab: function(tab) {
            this.closeDrawer();
            if (tab === 'dashboard') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                const main = document.getElementById('main-content');
                if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },

        syncStockCards: function() {
            const container = document.getElementById('mobStockCardsContent');
            if (!container) return;

            const rawCard = document.getElementById('rawMaterialCard');
            const fgCard = document.getElementById('finishedGoodsCard');

            let html = '';
            if (rawCard) {
                html += `<div class="mob-card-clone" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                    ${rawCard.innerHTML}
                </div>`;
            }
            if (fgCard) {
                html += `<div class="mob-card-clone" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                    ${fgCard.innerHTML}
                </div>`;
            }
            if (!html) {
                html = '<div style="text-align:center; padding:20px; color:#94a3b8;">No inventory cards found on dashboard.</div>';
            }
            container.innerHTML = html;
        },

        triggerOpen: function(url, icon, title, callback, moduleTag) {
            this.closeDrawer();
            if (typeof window.openModularPopup === 'function') {
                window.openModularPopup(url, icon, title, callback, moduleTag, true, true);
            }
        },

        triggerTarget: function(target, module) {
            this.closeDrawer();
            const el = document.querySelector(`.sidebar-item[data-target="${target}"]`) ||
                       document.querySelector(`.dropdown-item[data-target="${target}"]`);
            if (el) {
                el.click();
            } else if (typeof window.openModularPopup === 'function') {
                window.openModularPopup(target, 'fa-file-alt', module, null, module, true, true);
            }
        },

        triggerClick: function(target, fallbackFn) {
            this.closeDrawer();
            if (fallbackFn && typeof window[fallbackFn] === 'function') {
                window[fallbackFn]();
            } else if (typeof window.openDefaultSaleInvoice === 'function') {
                window.openDefaultSaleInvoice();
            }
        },

        bindEvents: function() {
            // Close drawers on Escape key
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.activeDrawer) {
                    this.closeDrawer();
                }
            });

            // Auto-hide bottom bar when virtual keyboard opens on mobile to prevent squishing
            const initialHeight = window.innerHeight;
            window.addEventListener('resize', () => {
                const nav = document.getElementById('mobileBottomNav');
                if (!nav) return;
                if (window.innerHeight < initialHeight - 150) {
                    nav.style.display = 'none';
                } else if (window.innerWidth <= 768) {
                    nav.style.display = 'flex';
                }
            });

            // Automatically optimize inputs on mobile for numeric keypads
            document.addEventListener('focusin', (e) => {
                if (window.innerWidth > 768) return;
                const target = e.target;
                if (!target || target.tagName !== 'INPUT') return;

                const id = (target.id || '').toLowerCase();
                const name = (target.name || '').toLowerCase();
                const cls = (target.className || '').toLowerCase();
                
                const isNumeric = id.includes('qty') || id.includes('rate') || id.includes('price') ||
                                  id.includes('amount') || id.includes('debit') || id.includes('credit') ||
                                  id.includes('total') || id.includes('disc') || id.includes('tax') ||
                                  id.includes('balance') || name.includes('qty') || name.includes('rate') ||
                                  cls.includes('money') || cls.includes('number') || target.type === 'number';

                if (isNumeric && !target.hasAttribute('inputmode')) {
                    target.setAttribute('inputmode', 'decimal');
                }
            });
        }
    };

    // Auto-init on DOMContentLoaded or immediate if already ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.MobileNav.init());
    } else {
        window.MobileNav.init();
    }
})();
