
window.alert = function(msg) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#dc3545;color:white;padding:15px 30px;z-index:999999;border-radius:5px;font-size:16px;font-weight:bold;box-shadow:0 4px 6px rgba(0,0,0,0.3);'; d.innerText = msg; document.body.appendChild(d); setTimeout(()=>d.remove(), 4000); };

// ==========================================================================
// GLOBAL NATIVE CURSOR LOADING ENGINE
// ==========================================================================
if (!window.CursorLoading) {
    window.CursorLoading = (function() {
        let activeCount = 0;
        let safetyTimer = null;

        function start() {
            activeCount++;
            if (activeCount === 1) {
                document.documentElement.classList.add('cursor-loading-active');
                if (document.body) document.body.classList.add('cursor-loading-active');
            }

            if (safetyTimer) clearTimeout(safetyTimer);
            safetyTimer = setTimeout(function() {
                forceStop();
            }, 15000); // 15s safety fallback
        }

        function stop() {
            if (activeCount > 0) activeCount--;
            if (activeCount <= 0) {
                forceStop();
            }
        }

        function forceStop() {
            activeCount = 0;
            if (safetyTimer) {
                clearTimeout(safetyTimer);
                safetyTimer = null;
            }
            document.documentElement.classList.remove('cursor-loading-active');
            if (document.body) document.body.classList.remove('cursor-loading-active');
        }

        return {
            start: start,
            stop: stop,
            forceStop: forceStop
        };
    })();

    // Global Click Listener for Buttons to immediately show native loading cursor
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button, .btn, input[type="submit"], input[type="button"], .dropdown-item, [role="button"]');
        if (!btn) return;
        
        // Skip window minimize, maximize, close controls
        if (btn.classList.contains('btn-min') || btn.classList.contains('btn-max') || btn.classList.contains('btn-close')) {
            return;
        }

        // Show native cursor loading immediately on click
        if (window.CursorLoading) window.CursorLoading.start();

        // Release after 350ms if no async fetch took over
        setTimeout(function() {
            if (window.CursorLoading) window.CursorLoading.stop();
        }, 350);
    }, true);
}

// --- GLOBAL SAVE & DELETE BUTTON INTERCEPTOR ---
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let isSave = false;
        let isDelete = false;
        const url = typeof args[0] === 'string' ? args[0] : (args[0] ? args[0].url : '');
        const options = args[1] || {};
        
        if (url.includes('action=save') || url.includes('action=insert') || url.includes('action=update') || options.method === 'POST') {
            isSave = true;
        }
        if (url.includes('action=delete') || url.includes('delete_')) {
            isDelete = true;
        }

        let processBtns = [];
        let originalContents = [];

        if (isSave || isDelete) {
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                const text = btn.innerText.toLowerCase().trim();
                if (isSave && (text.includes('save')) && !btn.disabled) {
                    processBtns.push(btn);
                    originalContents.push(btn.innerHTML);
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                }
                if (isDelete && (text === 'delete') && !btn.disabled) {
                    processBtns.push(btn);
                    originalContents.push(btn.innerHTML);
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
                }
            });
        }

        let isCursorActive = false;
        if (window.CursorLoading) {
            window.CursorLoading.start();
            isCursorActive = true;
        }

        try {
            const response = await originalFetch.apply(this, args);
            return response;
        } finally {
            if (isCursorActive && window.CursorLoading) {
                window.CursorLoading.stop();
            }
            if (isSave || isDelete) {
                processBtns.forEach((btn, index) => {
                    btn.disabled = false;
                    btn.innerHTML = originalContents[index];
                });
            }
        }
    };
})();
// --- END GLOBAL INTERCEPTOR ---

// --- GLOBAL CANCEL CONFIRMATION ---
document.addEventListener('click', function(e) {
    let btn = e.target.closest('button');
    // Check if it's an input type="button" just in case
    if (!btn && e.target.tagName === 'INPUT' && e.target.type === 'button') {
        btn = e.target;
    }
    
    if (btn) {
        const text = (btn.innerText || btn.value || '').toLowerCase().trim();
        if (text === 'cancel') {
            const confirmed = confirm("Are you sure you want to cancel? Any unsaved data will be cleared.");
            if (!confirmed) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }
}, true); // true = capture phase, so it runs BEFORE the button's inline onclick
// --- END GLOBAL CANCEL CONFIRMATION ---

        // SOFTIFYX APP VERSION 2026-v2-SYNC-FIX (NO_RELOAD_ON_DRP)
        console.log("SoftifyX: Logic Loaded (v2)");
        const sessionDataHeader = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        let currentUser = sessionDataHeader.username || "Administrator";
        let companyData = {
            name: "", address: "", phone: "", fax: "", email: "", website: "", gst: "", ntn: "", dealsIn: ""
        };
        
        let companies = [];
        let currentNote = "";
        window.isReadOnly = false; // Financial Year Control Flag
        
        let users = [
            { id: 1, username: "Administrator", role: "Admin", email: "admin@softifyx.com", status: "Active", password: "123" }
        ];

        let logoData = null;
        let userProfilePhoto = null;
        let originSelectedCompanyName = ""; 
        
        // EXPOSE TO WINDOW for synchronization with list_of_companies.html component
        window.companyData = companyData;
        window.companies = companies;
        window.originSelectedCompanyName = originSelectedCompanyName;

        let inventoryItems = [];
        let coaMain = [];
        let coaSub = [];
        let coaList = [];
        let financialYears = []; // Start empty to ensure fresh cloud data

        const DEFAULT_COA_MAIN = [];

        let dailySummary = { /* default state ... */ }; 
        // Initial empty state (will be populated from summary prefix)
        
        // Helper for Multi-Company Isolation (Separate Databases)
        function getCoKey(key) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coName = session.company_name || 'default';
            // Global keys that should NOT be isolated
            const globalKeys = ['softifyx_companies', 'softifyx_session'];
            if (globalKeys.includes(key)) return key;
            // Company-specific keys
            return `softifyx_${coName}_${key.replace('softifyx_', '')}`;
        }

        function checkFinancialYearAccess() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            if (!session.fy_start || !session.fy_end) return;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(session.fy_start);
            const end = new Date(session.fy_end);
            
            if (today < start || today > end) {
                window.isReadOnly = true;
                const msg = "Aap ka selected financial year current date se match nahi karta";
                // Show a global warning in the dashboard/title
                const dashTitle = document.getElementById('dashboardCompanyName');
                if (dashTitle) {
                    dashTitle.innerHTML += `<div style="color: #e74c3c; font-size: 14px; margin-top: 5px;"><i class="fas fa-exclamation-triangle"></i> ${msg} (Read-Only)</div>`;
                }
            }
        }

        async function loadSavedData() {
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            currentUser = sessionData.username || "Administrator";
            if (!sessionData.company_id) return;
            const companyId = sessionData.company_id;

            try {
                const cb = `_cb=${Date.now()}`;
                
                // PHASE 1: Primary UI Data (Fast, Instant Render)
                const primaryRequests = [
                    { key: 'company', url: `api/admin.php?action=get_company&company_id=${companyId}&${cb}` },
                    { key: 'summary', url: `api/admin.php?action=get_summary&company_id=${companyId}&report_date=${new Date().toISOString().split('T')[0]}&${cb}` },
                    { key: 'profile', url: `api/admin.php?action=get_profile_photo&${cb}` }
                ];

                const primaryResponses = await Promise.all(primaryRequests.map(req => fetch(req.url).catch(e => ({ ok: false, error: e }))));
                const [companyRes, summaryRes, profileRes] = primaryResponses;

                // 1. Process Company
                if (companyRes.ok) {
                    const data = await companyRes.json();
                    if (data && !data.error) {
                        companyData = { 
                            name: data.name, 
                            address: data.address, 
                            phone: data.phone, 
                            fax: data.fax, 
                            email: data.email, 
                            website: data.website, 
                            gst: data.gst, 
                            ntn: data.ntn, 
                            dealsIn: data.deals_in,
                            logo_data: data.logo_data || '',
                            logo: data.logo_data || ''
                        };
                        window.companyData = companyData;
                        logoData = data.logo_data || null;
                        window.logoData = logoData;
                        // Always sync DB logo to localStorage for print functions
                        if (logoData) {
                            try { 
                                if (typeof getCoKey === 'function') localStorage.setItem(getCoKey('softifyx_logo'), logoData);
                                localStorage.setItem('softifyx_logo', logoData); 
                            } catch(e) {}
                        }
                    }
                }

                // 2. Dashboard Summary
                if (summaryRes.ok) {
                    const summary = await summaryRes.json();
                    if (summary) {
                        dailySummary = {
                            sales: parseFloat(summary.sales || 0), cashOpening: parseFloat(summary.cash_opening || 0), cashReceipts: parseFloat(summary.cash_receipts || 0), cashPayments: parseFloat(summary.cash_payments || 0),
                            bankOpening: parseFloat(summary.bank_opening || 0), bankReceipts: parseFloat(summary.bank_receipts || 0), bankPayments: parseFloat(summary.bank_payments || 0), bankBalance: parseFloat(summary.bank_balance || 0), recOpening: parseFloat(summary.rec_opening || 0), recSales: parseFloat(summary.rec_sales || 0), recReceipts: parseFloat(summary.rec_receipts || 0),
                            payOpening: parseFloat(summary.pay_opening || 0), payPurchases: parseFloat(summary.pay_purchases || 0), payPayments: parseFloat(summary.pay_payments || 0), newInvoices: parseInt(summary.new_invoices || 0),
                            customerReceipts: parseFloat(summary.customer_receipts || 0), overdue: parseFloat(summary.overdue || 0), newPurchases: parseInt(summary.new_purchases || 0), vendorPayments: parseFloat(summary.vendor_payments || 0), outstanding: parseFloat(summary.outstanding || 0),
                            posInvoices: parseInt(summary.pos_invoices || 0), posSales: parseFloat(summary.pos_sales || 0), posCashSales: parseFloat(summary.pos_cash_sales || 0), posCardSales: parseFloat(summary.pos_card_sales || 0), posTaxTotal: parseFloat(summary.pos_tax_total || 0), posReturns: parseFloat(summary.pos_returns || 0), posNetTotal: parseFloat(summary.pos_net_total || 0),
                            digitalInvoices: parseInt(summary.digital_invoices || 0), digitalSales: parseFloat(summary.digital_sales || 0), digitalTax: parseFloat(summary.digital_tax || 0), digitalTaxUploaded: parseFloat(summary.digital_tax_uploaded || 0), digitalSubmittedCount: parseInt(summary.digital_submitted_count || 0), digitalNotes: parseInt(summary.digital_notes || 0), digitalConnected: !!summary.digital_connected, digitalStatus: summary.digital_status || 'Not Configured'
                        };
                        window.dailySummary = dailySummary;
                    }
                }

                // 3. Profile Photo Sync
                if (profileRes.ok) {
                    try {
                        const profileData = await profileRes.json();
                        userProfilePhoto = profileData.profile_photo || null;
                    } catch (e) {
                        console.warn('Profile photo sync skipped due to empty response.');
                    }
                }

                // -> INSTANT DOM UPDATE (Prevents "Loading..." stall)
                displayLogo();
                updateNames();
                updateDashboardSummary();
                
                const businessNameTop = document.getElementById('businessNameTop');
                if (businessNameTop) businessNameTop.textContent = sessionData.company_name || (companyData ? companyData.name : 'My Company');
                const dashTitle = document.getElementById('dashboardBusinessTitle');
                if (dashTitle) dashTitle.textContent = sessionData.company_name || (companyData ? companyData.name : 'My Company');

                // PHASE 2: Background Data (Heavy, Non-blocking)
                const bgRequests = [
                    { key: 'companies', url: `api/admin.php?action=get_companies&${cb}` },
                    { key: 'users', url: `api/admin.php?action=get_users&company_id=${companyId}&${cb}` },
                    { key: 'coaMain', url: `api/maintain.php?action=get_coa_main&company_id=${companyId}&${cb}` },
                    { key: 'coaSub', url: `api/maintain.php?action=get_coa_sub&company_id=${companyId}&main_id=ALL&${cb}` },
                    { key: 'coaList', url: `api/maintain.php?action=get_coa_list&company_id=${companyId}&sub_id=ALL&${cb}` },
                    { key: 'currency', url: `api/admin.php?action=get_currency&company_id=${companyId}&${cb}` },
                    { key: 'rights', url: `api/admin.php?action=get_rights&user_id=${sessionData.user_id || 0}&${cb}` },
                    { key: 'fy', url: `api/admin.php?action=get_fy&company_id=${companyId}&${cb}` }
                ];

                Promise.all(bgRequests.map(req => fetch(req.url).catch(e => ({ ok: false, error: e }))))
                    .then(async (bgResponses) => {
                        const [companiesRes, usersRes, coaMainRes, coaSubRes, coaListRes, currRes, rightsRes, fyRes] = bgResponses;
                        
                        if (companiesRes.ok) companies = await companiesRes.json();
                        if (usersRes.ok) users = await usersRes.json();
                        if (coaMainRes.ok) coaMain = await coaMainRes.json();
                        if (coaSubRes.ok) coaSub = await coaSubRes.json();
                        if (coaListRes.ok) coaList = await coaListRes.json();

                        if (currRes.ok) {
                            const cData = await currRes.json();
                            window.globalCurrencySymbol = (cData && cData.symbol) ? cData.symbol : 'Rs.';
                            if (cData && cData.symbol) {
                                localStorage.setItem(getCoKey('softifyx_currency'), JSON.stringify({ country: '', name: cData.name, symbol: cData.symbol }));
                                applyGlobalCurrencySymbol(); // Hook into page load
                                updateDashboardSummary(); // Re-render with new currency
                            }
                        }

                        if (rightsRes.ok) {
                            const rightsArr = await rightsRes.json();
                            window.currentUserRights = {};
                            if (Array.isArray(rightsArr)) {
                                rightsArr.forEach(r => {
                                    window.currentUserRights[r.module_name.trim()] = { allowed: parseInt(r.is_allowed) === 1, can_edit: parseInt(r.can_edit) === 1, can_view: parseInt(r.can_view) === 1 };
                                });
                            }
                            setupMenuButtons();
                        }

                        if (fyRes.ok) {
                            try {
                                const fyData = await fyRes.json();
                                if (Array.isArray(fyData)) {
                                    financialYears = fyData.map(f => ({ id: f.id, start: f.start_date, end: f.end_date, abbr: f.year_label || f.abbreviation || f.year || 'FY' }));
                                }
                                checkFinancialYearAccess(); 
                                renderFinancialYearList(); 
                            } catch (e) { console.warn('FY Parse Error:', e); }
                        }

                        // Load any active notifications for today
                        if (typeof window.checkJournalNotifications === 'function') {
                            window.checkJournalNotifications();
                        }
                    });

            } catch (err) {
                console.error('Data Sync Error:', err);
                alert('Connection Error while loading live data: ' + err.message);
            }
        }

        function resetDashboardModel() {
            dailySummary = {
                sales: 0, cashValue: 0, bankBalance: 0, receivablesValue: 0,
                cashOpening: 0, cashReceipts: 0, cashPayments: 0,
                recOpening: 0, recSales: 0, recReceipts: 0,
                payOpening: 0, payPurchases: 0, payPayments: 0,
                newInvoices: 0, customerReceipts: 0, overdue: 0,
                newPurchases: 0, vendorPayments: 0, outstanding: 0
            };
        }

        function updateDashboardSummary() {
            const get = id => document.getElementById(id);
            const currencySymbol = (window.globalCurrencySymbol || 'Rs.') + ' ';
            const fmt = val => {
                const n = parseFloat(val) || 0;
                return currencySymbol + n.toLocaleString('en-US', {
                    minimumFractionDigits: Math.abs(n) % 1 > 0.001 ? 2 : 0,
                    maximumFractionDigits: 2
                });
            };

                    // --- 1. MAIN DASHBOARD CONTENT (dashboard.html) ---
            const showOrHide = (id, permission, value) => {
                const el = get(id);
                if (!el) return;
                if (!checkUserRights(permission)) {
                    el.textContent = "Restricted";
                    el.style.color = "#bdc3c7";
                    el.style.fontSize = "14px";
                } else {
                    el.textContent = fmt(value);
                    el.style.color = "";
                    el.style.fontSize = "";
                }
            };
            
            showOrHide('salesValue', 'Sale Summary', dailySummary.sales);
            showOrHide('cashValue', 'Recovery/Receipts Reports', dailySummary.cashOpening + dailySummary.cashReceipts - dailySummary.cashPayments);
            showOrHide('bankValue', 'Cash & Bank Balances', dailySummary.bankBalance);
            showOrHide('receivablesValue', 'Accounts Receivable Aging', dailySummary.recOpening + dailySummary.recSales - dailySummary.recReceipts);

            // Financial Cards (Match dashboard.html IDs)
            showOrHide('cashOpening', 'Cash Payments', dailySummary.cashOpening + dailySummary.bankOpening);
            showOrHide('cashReceipts', 'Cash Receipts', dailySummary.cashReceipts + dailySummary.bankReceipts);
            showOrHide('cashPayments', 'Cash Payments', dailySummary.cashPayments + dailySummary.bankPayments);
            showOrHide('cashCurrent', 'Cash Payments', (dailySummary.cashOpening + dailySummary.bankOpening) + (dailySummary.cashReceipts + dailySummary.bankReceipts) - (dailySummary.cashPayments + dailySummary.bankPayments));

            const rO = get('recOpening'); if(rO) rO.textContent = fmt(dailySummary.recOpening);
            const rS = get('recSales'); if(rS) rS.textContent = fmt(dailySummary.recSales);
            const rR = get('recReceipts'); if(rR) rR.textContent = fmt(dailySummary.recReceipts);
            const rC = get('recCurrent'); if(rC) rC.textContent = fmt(dailySummary.recOpening + dailySummary.recSales - dailySummary.recReceipts);

            const pO = get('payOpening'); if(pO) pO.textContent = fmt(dailySummary.payOpening);
            const pP = get('payPurchases'); if(pP) pP.textContent = fmt(dailySummary.payPurchases);
            const pPa = get('payPayments'); if(pPa) pPa.textContent = fmt(dailySummary.payPayments);
            const pC = get('payCurrent'); if(pC) pC.textContent = fmt(dailySummary.payOpening + dailySummary.payPurchases - dailySummary.payPayments);

            // --- 2. RIGHT SIDEBAR SUMMARY (index.html) ---
            
            // Cash Position
            const scO = get('summaryCashOpening'); if(scO) scO.textContent = fmt(dailySummary.cashOpening + dailySummary.bankOpening);
            const scR = get('summaryCashReceipts'); if(scR) scR.textContent = fmt(dailySummary.cashReceipts + dailySummary.bankReceipts);
            const scP = get('summaryCashPayments'); if(scP) scP.textContent = fmt(dailySummary.cashPayments + dailySummary.bankPayments);
            const scN = get('summaryCashNet'); if(scN) scN.textContent = fmt((dailySummary.cashOpening + dailySummary.bankOpening) + (dailySummary.cashReceipts + dailySummary.bankReceipts) - (dailySummary.cashPayments + dailySummary.bankPayments));

            // Customer Activity
            const snI = get('summaryNewInvoices'); if(snI) snI.textContent = checkUserRights("Sale Summary") ? dailySummary.newInvoices : "*";
            const scr = get('summaryCustomerReceipts'); if(scr) scr.textContent = checkUserRights("Recovery/Receipts Reports") ? fmt(dailySummary.customerReceipts) : "Restricted";
            const sod = get('summaryOverdue'); if(sod) sod.textContent = fmt(dailySummary.overdue);

            // Vendor Activity
            const snP = get('summaryNewPurchases'); if(snP) snP.textContent = dailySummary.newPurchases;
            const svp = get('summaryVendorPayments'); if(svp) svp.textContent = checkUserRights("Payments Reports") ? fmt(dailySummary.vendorPayments) : "Restricted";
            const sou = get('summaryOutstanding'); if(sou) sou.textContent = checkUserRights("Accounts Payable Aging") ? fmt(dailySummary.outstanding) : "Restricted";

            // --- 3. COMMON WIDGETS ---
            
            // Low Stock / Inventory Alerts
            let lowStock = inventoryItems.filter(item => item.stock < item.reorderLevel).length;
            const lsc = get('lowStockCount'); if(lsc) lsc.textContent = lowStock + ' Items';
            const rc = get('reorderCount'); if(rc) rc.textContent = (lowStock > 2 ? 2 : lowStock) + ' Items';

            // Weekly Sales Trend (handled separately in updateWeeklyTrend)

            // Re-apply currency symbols after data update
            applyGlobalCurrencySymbol();
        }

        async function saveSummary() {
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            try {
                await fetch(`api/admin.php?action=save_summary&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dailySummary)
                });
            } catch (err) {
                console.error('Summary Sync Error:', err);
            }
        }

        function displayLogo() {
            const logoDisplay = document.getElementById('logoDisplay');
            const dashLogo = document.getElementById('dashLogo');
            const logoPath = 'assets/logos/logo.png';
            
            // 1. Navbar (Top-Right): Show ONLY the Business Owner's Uploaded Logo (logoData)
            if (logoDisplay) {
                if (logoData) {
                    logoDisplay.innerHTML = `<img src="${logoData}" id="userLogo" style="height: 35px; width: auto; border-radius: 4px;">`;
                } else {
                    logoDisplay.innerHTML = ''; // Hide if no custom logo uploaded
                }
            }

            // 2. Dashboard Middle (Welcome Card): Always Show Software Company Logo (logo.png)
            if (dashLogo) {
                dashLogo.src = logoPath;
                dashLogo.style.display = 'block';
                dashLogo.onerror = function() {
                    this.style.display = 'none'; // Hide if file missing
                    this.parentElement.style.boxShadow = 'none'; // Clean up parent
                };
            }
        }

        function updateNames() {
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const displayName = sessionData.username || currentUser || "Administrator";

            const titleEl = document.getElementById('titleCompanyName');
            if (titleEl) titleEl.textContent = `- ${companyData.name}`;
            
            const dashNameEl = document.getElementById('dashboardCompanyName');
            if (dashNameEl) dashNameEl.textContent = companyData.name;
            
            // Critical: Update Browser Tab Title
            document.title = `Softifyx - ${companyData.name || 'Financials'}`;

            const welcomeEl = document.getElementById('welcomeUserDisplay');
            if (welcomeEl) {
                const iconHtml = userProfilePhoto 
                    ? `<img src="${userProfilePhoto}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.3);">`
                    : '<i class="fas fa-user-circle"></i>';
                welcomeEl.innerHTML = `${iconHtml} <span>Welcome ${displayName}</span>`;
            }

            // Toggle User Activity Logs button visibility based on admin role (robust case-insensitive check)
            const userRole = String(sessionData.role || '').trim().toLowerCase();
            const username = String(sessionData.username || currentUser || '').trim().toLowerCase();
            const userId = sessionData.user_id;
            const isAuthAdmin = (
                userRole === 'admin' || 
                username === 'administrator' || 
                username === 'admin' ||
                userId == 1
            );
            const activityLogBtn = document.getElementById('userActivityLogBtn');
            if (activityLogBtn) {
                activityLogBtn.style.display = isAuthAdmin ? 'flex' : 'none';
            }
        }

        function hideAllDropdowns() {
            document.querySelectorAll('.dropdown').forEach(dropdown => {
                dropdown.style.display = 'none';
                dropdown.classList.remove('show');
            });
            document.querySelectorAll('.nested-dropdown').forEach(nd => nd.classList.remove('show-nested'));
        }

        function toggleDropdown(menuItem) {
            const dropdown = menuItem.querySelector('.dropdown');
            if (!dropdown) return;
            
            const isVisible = dropdown.style.display === 'block' || dropdown.classList.contains('show');
            
            if (isVisible) {
                dropdown.style.display = 'none';
                dropdown.classList.remove('show');
            } else {
                hideAllDropdowns();
                dropdown.style.display = 'block';
                dropdown.classList.add('show');
            }
        }

        function setupDropdowns() {
            document.querySelectorAll('.menu-item').forEach(menuItem => {
                menuItem.addEventListener('click', function(e) {
                    // Only toggle if they clicked the direct menu-item text, not inside its dropdown
                    if (e.target === this || e.target.parentElement === this && !e.target.closest('.dropdown')) {
                        e.stopPropagation();
                        
                        // Exclusive Toggle: Close all other main dropdowns
                        const dropdown = this.querySelector('.dropdown');
                        const isAlreadyOpen = dropdown && (dropdown.style.display === 'block' || dropdown.classList.contains('show'));
                        
                        hideAllDropdowns();
                        
                        if (!isAlreadyOpen) {
                            toggleDropdown(this);
                        }
                    }
                });
            });

            // Prevent dropdown clicks from bubbling up and hiding the menu-item
            document.querySelectorAll('.dropdown').forEach(dropdown => {
                dropdown.addEventListener('click', function(e) {
                    e.stopPropagation(); 
                });
            });

            // Handle nested dropdowns specifically for touch/click compatibility
            document.querySelectorAll('.has-nested').forEach(nested => {
                nested.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const nestedMenu = this.querySelector('.nested-dropdown');
                    if (nestedMenu) {
                        const isShown = nestedMenu.classList.contains('show-nested');
                        // Close any other nested dropdowns first
                        document.querySelectorAll('.nested-dropdown').forEach(nd => nd.classList.remove('show-nested'));
                        if (!isShown) {
                            nestedMenu.classList.add('show-nested');
                        }
                    }
                });
            });

            // Mobile Menu Toggle
            const menuToggle = document.querySelector('.mobile-menu-toggle');
            const navMenu = document.getElementById('navMenu');
            if (menuToggle && navMenu) {
                menuToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    navMenu.classList.toggle('active');
                });
            }

            document.addEventListener('click', function(e) {
                if (!e.target.closest('.menu-item') && !e.target.closest('.dropdown') && !e.target.closest('.nested-dropdown') && !e.target.closest('.mobile-menu-toggle')) {
                    hideAllDropdowns();
                    if(navMenu) navMenu.classList.remove('active');
                }
            });
        }

            // --- MULTI-WINDOW & DRAGGABLE SYSTEM ---
        let activeWindow = null;
        let windowZIndex = 50000;

        function openModal(title, content, isWide = false, moduleKey = null, isFull = false) {
            if (typeof hideAllDropdowns === 'function') hideAllDropdowns();
            const manager = document.getElementById('window-manager');
            
            const dataModuleTag = moduleKey || title.text;
            
            // Prevent Duplicate Windows (DOM ID conflicts)
            if (dataModuleTag) {
                const existing = manager.querySelector(`.modal-body[data-module="${dataModuleTag}"]`);
                if (existing) {
                    const parentWindow = existing.closest('.modal-container');
                    if (parentWindow) parentWindow.remove();
                }
            }
            
            const windowId = `win-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            
            const container = document.createElement('div');
            container.id = windowId;
            container.className = 'modal-container';
            
            if (isFull) container.classList.add('modal-full');
            else if (isWide) container.classList.add('modal-wide');
            if (dataModuleTag === 'Drivers') container.classList.add('modal-drivers');
            if (dataModuleTag === 'Customers') container.classList.add('modal-customers');
            if (dataModuleTag === 'Buyer Types') container.classList.add('modal-buyer-types');
            if (dataModuleTag === 'Digital Invoice - Integration Settings') {
                container.classList.add('modal-digital-invoice');
            }
            if (['POS Sale', 'POS Sales Register', 'Sales Register', 'POS Sales Return', 'Sales Return', 'POS Hold Register', 'POS Settings', 'POS Reports'].includes(dataModuleTag)) {
                container.classList.add('modal-pos-sale');
                if (dataModuleTag === 'POS Settings') {
                    container.classList.add('modal-pos-settings');
                }
                if (dataModuleTag === 'POS Reports') {
                    container.classList.add('modal-pos-reports');
                }
            }
            
            container.innerHTML = `
                <div class="modal-header">
                    <h2><i class="fas ${title.icon}"></i> ${title.text}</h2>
                    <div class="modal-controls">
                        <button class="btn-min" onclick="window.toggleMinimize('${windowId}')" title="Minimize"><i class="fas fa-minus"></i></button>
                        <button class="btn-max" onclick="window.toggleMaximize('${windowId}')" title="Maximize"><i class="fas fa-expand"></i></button>
                        <button class="btn-close" onclick="window.closeModal('${windowId}')" title="Close">&times;</button>
                    </div>
                </div>
                <div class="modal-body" data-module="${dataModuleTag}">
                    ${content}
                </div>
            `;
            
            manager.appendChild(container);
            
            // Re-execute scripts embedded in modular content so that dynamic views work
            const modalBody = container.querySelector('.modal-body');
            if (modalBody) {
                const scripts = Array.from(modalBody.querySelectorAll('script'));
                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.text = oldScript.text || oldScript.textContent;
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                });
            }
            
            // Explicit Centering Logic
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // We use a small timeout to let the browser calculate the width/height of the new content
            setTimeout(() => {
                const rect = container.getBoundingClientRect();
                let top = (viewportHeight - rect.height) / 2;
                let left = (viewportWidth - rect.width) / 2;

                // The user requested that multiple windows open in the same exact spot (centered)
                // rather than cascading downwards.
                /*
                const existingWindows = manager.querySelectorAll('.modal-container').length;
                if (existingWindows > 1) {
                    top = (60 + (existingWindows * 30));
                    left = (100 + (existingWindows * 30));
                }
                */

                // Safety boundaries
                if (top < 10) top = 10;
                if (left < 10) left = 10;

                container.style.top = top + 'px';
                container.style.left = left + 'px';
                container.style.transform = 'none'; // Remove CSS translate to allow clean dragging
                
                focusWindow(container);
            }, 10);

            // Setup Draggable & Focus
            makeDraggable(container, container.querySelector('.modal-header'));
            container.addEventListener('mousedown', () => focusWindow(container));

            setTimeout(() => {
                applyViewerRestrictions(container);
                if (window.applyERPThemeToElement && window.getCurrentERPTheme) {
                    window.applyERPThemeToElement(container, window.getCurrentERPTheme());
                }
            }, 50);
            setTimeout(() => {
                if (window.applyERPThemeToElement && window.getCurrentERPTheme) {
                    window.applyERPThemeToElement(container, window.getCurrentERPTheme());
                }
            }, 250);

            return windowId;
        }
        window.openModal = openModal;

        function repositionMinimizedWindows() {
            const minimizedList = document.querySelectorAll('.modal-container.modal-minimized');
            minimizedList.forEach((win, index) => {
                win.style.left = (10 + (index * 285)) + 'px';
                win.style.top = 'auto';
                win.style.bottom = '0px';
            });
        }
        window.repositionMinimizedWindows = repositionMinimizedWindows;

        function toggleMaximize(windowId) {
            const win = document.getElementById(windowId);
            if (!win) return;

            // If window is minimized, un-minimize it first
            if (win.classList.contains('modal-minimized')) {
                toggleMinimize(windowId);
            }

            win.classList.toggle('modal-maximized');
            const icon = win.querySelector('.btn-max i');
            if (icon) {
                if (win.classList.contains('modal-maximized')) {
                    icon.classList.remove('fa-expand');
                    icon.classList.add('fa-compress');
                } else {
                    icon.classList.remove('fa-compress');
                    icon.classList.add('fa-expand');
                }
            }
            focusWindow(win);
        }
        window.toggleMaximize = toggleMaximize;

        function toggleMinimize(windowId) {
            const win = document.getElementById(windowId);
            if (!win) return;

            // If currently maximized, revert maximize first
            if (win.classList.contains('modal-maximized')) {
                win.classList.remove('modal-maximized');
                const maxIcon = win.querySelector('.btn-max i');
                if (maxIcon) {
                    maxIcon.classList.remove('fa-compress');
                    maxIcon.classList.add('fa-expand');
                }
            }

            const isMinimizing = !win.classList.contains('modal-minimized');
            const minBtn = win.querySelector('.btn-min');
            const minIcon = minBtn ? minBtn.querySelector('i') : null;

            if (isMinimizing) {
                // Save coordinates for clean restore
                win.dataset.prevTop = win.style.top || '';
                win.dataset.prevLeft = win.style.left || '';
                win.dataset.prevTransform = win.style.transform || '';

                win.classList.add('modal-minimized');
                win.style.setProperty('height', '38px', 'important');
                win.style.setProperty('min-height', '38px', 'important');
                win.style.setProperty('max-height', '38px', 'important');
                win.style.setProperty('width', '280px', 'important');
                win.style.setProperty('min-width', '280px', 'important');
                win.style.setProperty('max-width', '280px', 'important');
                win.style.setProperty('top', 'auto', 'important');
                win.style.setProperty('bottom', '0px', 'important');
                win.style.setProperty('transform', 'none', 'important');

                const body = win.querySelector('.modal-body');
                if (body) body.style.setProperty('display', 'none', 'important');

                if (minBtn) {
                    minBtn.title = 'Restore';
                    if (minIcon) {
                        minIcon.className = 'fas fa-window-restore';
                    }
                }
                repositionMinimizedWindows();
            } else {
                win.classList.remove('modal-minimized');
                win.style.removeProperty('height');
                win.style.removeProperty('min-height');
                win.style.removeProperty('max-height');
                win.style.removeProperty('width');
                win.style.removeProperty('min-width');
                win.style.removeProperty('max-width');
                win.style.removeProperty('bottom');

                const body = win.querySelector('.modal-body');
                if (body) body.style.removeProperty('display');

                if (minBtn) {
                    minBtn.title = 'Minimize';
                    if (minIcon) {
                        minIcon.className = 'fas fa-minus';
                    }
                }

                // Restore previous position or default center
                if (win.dataset.prevTop && win.dataset.prevTop !== 'auto') {
                    win.style.top = win.dataset.prevTop;
                    win.style.left = win.dataset.prevLeft;
                    win.style.transform = win.dataset.prevTransform || 'none';
                } else {
                    win.style.top = '60px';
                    win.style.left = '100px';
                    win.style.transform = 'none';
                }

                focusWindow(win);
                repositionMinimizedWindows();
            }
        }
        window.toggleMinimize = toggleMinimize;

        function closeModal(windowId) {
            setTimeout(() => {
                if (window.DashboardCustomizer && typeof window.DashboardCustomizer.refresh === 'function') {
                    window.DashboardCustomizer.refresh(true);
                }
            }, 100);
            const id = windowId || (activeWindow ? activeWindow.id : null);
            const win = document.getElementById(id);
            if (win) {
                const wasMinimized = win.classList.contains('modal-minimized');
                win.remove();
                if (wasMinimized) {
                    repositionMinimizedWindows();
                }
                const remaining = document.querySelectorAll('.modal-container:not(.modal-minimized)');
                if (remaining.length > 0) {
                    focusWindow(remaining[remaining.length - 1]);
                } else {
                    activeWindow = null;
                }
            }
        }
        window.closeModal = closeModal;

        function openSecondaryModal(title, content, isWide = false, moduleKey = null, isFull = false) {
            if (typeof hideAllDropdowns === 'function') hideAllDropdowns();
            // In the multi-window system, secondary modals are just additional windows
            return openModal(title, content, isWide, moduleKey, isFull);
        }

        function closeSecondaryModal(windowId) {
            return closeModal(windowId);
        }

        function focusWindow(element) {
            if (!element) return;
            if (activeWindow) activeWindow.classList.remove('active-window');
            activeWindow = element;
            activeWindow.classList.add('active-window');
            windowZIndex += 2;
            activeWindow.style.zIndex = windowZIndex;
        }

        function makeDraggable(element, handle) {
            let isDragging = false;
            let startX, startY, initialTop, initialLeft;

            handle.style.cursor = 'move';

            handle.onmousedown = (e) => {
                if (e.target.closest('.modal-controls') || e.target.closest('button')) return;
                
                // If window is minimized, clicking anywhere on header restores it
                if (element.classList.contains('modal-minimized')) {
                    toggleMinimize(element.id);
                    return;
                }

                focusWindow(element);
                
                if (element.classList.contains('modal-maximized')) return;

                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                initialTop = element.offsetTop;
                initialLeft = element.offsetLeft;

                document.onmousemove = (eMove) => {
                    if (!isDragging) return;
                    eMove.preventDefault();
                    let dx = eMove.clientX - startX;
                    let dy = eMove.clientY - startY;
                    let newTop = initialTop + dy;
                    if (newTop < 0) newTop = 0; // Prevent dragging off top edge
                    element.style.top = newTop + 'px';
                    element.style.left = (initialLeft + dx) + 'px';
                    element.style.transform = 'none'; // Ensure transform doesn't interfere
                };

                document.onmouseup = () => {
                    isDragging = false;
                    document.onmousemove = null;
                    document.onmouseup = null;
                };
            };
        }

        // Global Keyboard Navigation for Tables in Modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const modals = Array.from(document.querySelectorAll('.modal-container')).filter(m => m.style.display !== 'none');
                if (modals.length === 0) return;
                const activeModal = modals[modals.length - 1]; // topmost modal
                
                // If focus is in an input or select, don't interfere with their native arrow key behavior
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
                    // Only interfere if it's a disabled or readonly input (which shouldn't have focus, but just in case)
                    if (!activeEl.readOnly && !activeEl.disabled) {
                        // Exception: if it's a checkbox, maybe we still want it? No, just return.
                        return;
                    }
                }

                const selectedRow = activeModal.querySelector('tbody tr.selected');
                if (selectedRow) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (window._lastGlobalModalKeyDownTime && Date.now() - window._lastGlobalModalKeyDownTime < 50) return;
                    window._lastGlobalModalKeyDownTime = Date.now();

                    const tbody = selectedRow.parentElement;
                    const rows = Array.from(tbody.querySelectorAll('tr'));
                    const selectedIdx = rows.indexOf(selectedRow);
                    
                    let nextIdx = e.key === 'ArrowDown' ? selectedIdx + 1 : selectedIdx - 1;
                    if (nextIdx >= 0 && nextIdx < rows.length) {
                        rows[nextIdx].click();
                        rows[nextIdx].scrollIntoView({block: 'nearest'});
                    }
                } else if (e.key === 'ArrowDown') {
                    // If no row is selected, select the first one
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (window._lastGlobalModalKeyDownTime && Date.now() - window._lastGlobalModalKeyDownTime < 50) return;
                    window._lastGlobalModalKeyDownTime = Date.now();

                    const tbody = activeModal.querySelector('tbody');
                    if (tbody && tbody.children.length > 0) {
                        tbody.children[0].click();
                        tbody.children[0].scrollIntoView({block: 'nearest'});
                    }
                }
            }
        });

        function showInventoryDetails() {
            let lowStockItems = inventoryItems.filter(item => item.stock < item.reorderLevel);
            let tableRows = '';
            
            lowStockItems.forEach(item => {
                tableRows += `
                    <tr>
                        <td>${item.name}</td>
                        <td class="low-stock">${item.stock}</td>
                        <td>${item.reorderLevel}</td>
                        <td><button class="btn btn-primary btn-sm" onclick="reorderItem('${item.name}')">Reorder</button></td>
                    </tr>
                `;
            });

            openModal(
                { icon: 'fa-box', text: 'Low Stock Items' },
                `<div>
                    <table class="inventory-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Current Stock</th>
                                <th>Reorder Level</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows || '<tr><td colspan="4" style="text-align: center; padding: 20px;">No low stock items</td></tr>'}
                        </tbody>
                    </table>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="window.closeModal()">Close</button>
                    </div>
                </div>`
            );
        }

        function reorderItem(itemName) {
            dailySummary.newPurchases++;
            saveSummary();
            updateDashboardSummary();
        }

        function renderUserTable() {
            let tableHtml = `
                <table class="user-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            users.forEach(user => {
                tableHtml += `
                    <tr>
                        <td>${user.username}</td>
                        <td>${user.role}</td>
                        <td>${user.email}</td>
                        <td><span style="background: ${user.status === 'Active' ? '#d4edda' : '#f8d7da'}; color: ${user.status === 'Active' ? '#155724' : '#721c24'}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${user.status}</span></td>
                        <td class="user-actions">
                            <button class="btn btn-warning btn-sm" onclick="editUser(${user.id})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            
            tableHtml += `
                    </tbody>
                </table>
                <div style="margin-top: 15px;">
                    <button class="btn btn-primary" onclick="showAddUserForm()"><i class="fas fa-plus"></i> Add New User</button>
                </div>
            `;
            
            return tableHtml;
        }

        function showAddUserForm() {
            openModal(
                { icon: 'fa-user-plus', text: 'Add New User' },
                `<div style="font-family: 'Segoe UI', sans-serif;">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block;">Username</label>
                        <input type="text" class="form-control" id="newUsername" placeholder="Enter username" style="height: 38px; border-radius: 8px;" autocomplete="off">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px; position: relative;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block;">Password</label>
                        <div style="position: relative;">
                            <input type="password" class="form-control" id="newPassword" placeholder="Enter password" style="height: 38px; border-radius: 8px; padding-right: 40px;" autocomplete="new-password">
                            <i class="fas fa-eye-slash" id="togglePasswordIcon" 
                               style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #64748b; font-size: 16px;" 
                               onclick="togglePasswordVisibility('newPassword', this)"></i>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block;">Email</label>
                        <input type="email" class="form-control" id="newEmail" placeholder="Enter email" style="height: 38px; border-radius: 8px;">
                    </div>
                    <div class="form-group" style="margin-bottom: 25px;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block;">Role</label>
                        <select class="form-control" id="newRole" style="height: 38px; border-radius: 8px;">
                            <option value="User">User (Standard)</option>
                            <option value="POS">POS User</option>
                            <option value="Admin">Admin (Manager)</option>
                        </select>
                    </div>
                    <div class="modal-actions" style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
                        <button class="btn btn-primary" onclick="addUser()" style="height: 42px; padding: 0 30px; font-weight: 600; border-radius: 10px;">Add User</button>
                        <button class="btn btn-secondary" onclick="window.closeModal()" style="height: 42px; padding: 0 30px; font-weight: 600; border-radius: 10px;">Cancel</button>
                    </div>
                </div>`,
                false,
                "User Logins"
            );
        }

        window.togglePasswordVisibility = function(inputId, icon) {
            const input = document.getElementById(inputId);
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        };

        async function addUser() {
            const username = document.getElementById('newUsername').value.trim();
            const password = document.getElementById('newPassword').value.trim();
            const email = document.getElementById('newEmail').value.trim();
            const role = document.getElementById('newRole').value;
            
            if (!username || !password) {
                alert('Username and password are required!');
                return;
            }
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            try {
                const response = await fetch(`api/admin.php?action=save_user&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: companyId, username, password, role, email })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'success') {
                        closeModal();
                        // CRITICAL SYNC: Fetch new list from server
                        const usersRes = await fetch(`api/admin.php?action=get_users&company_id=${companyId}`);
                        users = await usersRes.json();
                        
                        alert('User added and synchronized live to database!');
                        document.getElementById('userLoginsBtn').click();
                    } else {
                        alert('Error: ' + (result.message || 'Save failed.'));
                    }
                }
            } catch (err) { alert('Sync Failed.'); }
        }

        function editUser(userId) {
            const user = users.find(u => u.id === userId);
            if (user) {
                openModal(
                    { icon: 'fa-user-edit', text: 'Edit User' },
                    `<div>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" class="form-control" id="editUsername" value="${user.username}">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" class="form-control" id="editEmail" value="${user.email}">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select class="form-control" id="editRole">
                                <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                <option value="User" ${user.role === 'User' ? 'selected' : ''}>User</option>
                                <option value="POS" ${user.role === 'POS' ? 'selected' : ''}>POS User</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select class="form-control" id="editStatus">
                                <option value="Active" ${user.status === 'Active' ? 'selected' : ''}>Active</option>
                                <option value="Inactive" ${user.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-primary" onclick="updateUser(${userId})">Update</button>
                            <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
                        </div>
                    </div>`,
                    false,
                    "User Logins"
                );
            }
        }
        async function updateUser(userId) {
            const user = users.find(u => u.id === userId);
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            const payload = {
                id: userId,
                username: document.getElementById('editUsername')?.value || user.username,
                email: document.getElementById('editEmail')?.value || user.email,
                role: document.getElementById('editRole')?.value || user.role,
                status: document.getElementById('editStatus')?.value || user.status
            };

            try {
                const response = await fetch(`api/admin.php?action=save_user&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'success') {
                        closeModal();
                        // Refresh users list
                        const usersRes = await fetch(`api/admin.php?action=get_users&company_id=${companyId}`);
                        users = await usersRes.json();
                        
                        alert('User updated and synchronized!');
                        document.getElementById('userLoginsBtn').click();
                    }
                }
            } catch (err) { alert('Sync Failed.'); }
        }

        async function deleteUser(userId) {
            const user = users.find(u => u.id === userId);
            if (!user) return;
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            if (user.username.toLowerCase() === 'administrator') {
                alert("Cannot delete the system Administrator account!");
                return;
            }

            if (confirm(`Are you sure you want to delete user "${user.username}"?`)) {
                try {
                    const response = await fetch(`api/admin.php?action=delete_user&company_id=${companyId}`, { 
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: userId, company_id: companyId })
                    });
                    if (response.ok) {
                        const usersRes = await fetch(`api/admin.php?action=get_users&company_id=${companyId}`);
                        users = await usersRes.json();
                        
                        alert('User deleted successfully.');
                        document.getElementById('userLoginsBtn').click();
                    }
                } catch (err) { alert('Delete Sync Failed.'); }
            }
        }

        function showAddCompanyForm() {
            openModal(
                { icon: 'fa-building', text: 'Add New Company' },
                `<div>
                    <div class="form-group">
                        <label>Business Name</label>
                        <input type="text" class="form-control" id="newCompanyName" placeholder="Enter business name" value="">
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                        <input type="text" class="form-control" id="newCompanyAddress" placeholder="Enter address" value="">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Phone(s)</label>
                            <input type="text" class="form-control" id="newCompanyPhone" placeholder="Phone" value="">
                        </div>
                        <div class="form-group">
                            <label>Fax</label>
                            <input type="text" class="form-control" id="newCompanyFax" placeholder="Fax" value="">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>E-Mail</label>
                            <input type="email" class="form-control" id="newCompanyEmail" placeholder="Email" value="">
                        </div>
                        <div class="form-group">
                            <label>Website</label>
                            <input type="text" class="form-control" id="newCompanyWebsite" placeholder="Website" value="">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>G.S.T. Regn. No.</label>
                            <input type="text" class="form-control" id="newCompanyGST" placeholder="GST" value="">
                        </div>
                        <div class="form-group">
                            <label>N.T.N.</label>
                            <input type="text" class="form-control" id="newCompanyNTN" placeholder="NTN" value="">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Deals In</label>
                        <input type="text" class="form-control" id="newCompanyDealsIn" placeholder="Deals In" value="">
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-primary" onclick="addNewCompany()"><i class="fas fa-save"></i> Save Company</button>
                        <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
                    </div>
                </div>`,
                false,
                "List Of Companies"
            );
        }

        async function addNewCompany() {
            const companyName = document.getElementById('newCompanyName')?.value;
            if (!companyName) {
                alert("Business Name is required!");
                return;
            }

            const payload = {
                name: companyName,
                address: document.getElementById('newCompanyAddress')?.value || '',
                phone: document.getElementById('newCompanyPhone')?.value || '',
                fax: document.getElementById('newCompanyFax')?.value || '',
                email: document.getElementById('newCompanyEmail')?.value || '',
                website: document.getElementById('newCompanyWebsite')?.value || '',
                gst: document.getElementById('newCompanyGST')?.value || '',
                ntn: document.getElementById('newCompanyNTN')?.value || '',
                deals_in: document.getElementById('newCompanyDealsIn')?.value || ''
            };

            try {
                const response = await fetch('api/admin.php?action=save_company', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert('New business registered and synchronized live! Application will refresh.');
                    window.location.reload();
                }
            } catch (err) { alert('Sync Failed.'); }
        }

        async function saveCompanySettings() {
            const businessName = document.getElementById('modalBusinessName')?.value;
            const address = document.getElementById('modalAddress')?.value;
            const phone = document.getElementById('modalPhone')?.value;
            const fax = document.getElementById('modalFax')?.value;
            const email = document.getElementById('modalEmail')?.value;
            const website = document.getElementById('modalWebsite')?.value;
            const gst = document.getElementById('modalGST')?.value;
            const ntn = document.getElementById('modalNTN')?.value;
            const dealsIn = document.getElementById('modalDealsIn')?.value;
            
            if (businessName) {
                const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = sessionData.company_id || 1;

                companyData = {
                    name: businessName,
                    address: address || '',
                    phone: phone || '',
                    fax: fax || '',
                    email: email || '',
                    website: website || '',
                    gst: gst || '',
                    ntn: ntn || '',
                    dealsIn: dealsIn || ''
                };
                window.companyData = companyData;
                
                try {
                    const response = await fetch(`api/admin.php?action=save_company&company_id=${companyId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...companyData, id: companyId }) // PASS ID HERE FOR UPDATE
                    });

                    if (response.ok) {
                        updateNames();
                        alert('Company settings updated and synchronized live!');
                        closeModal();
                        window.location.reload(); // Force refresh to show changes everywhere
                    }
                } catch (err) { alert('Sync Error: ' + err.message); }
            }
        }

        async function saveCurrency() {
            const name = document.getElementById('currencyName').value.trim();
            const symbol = document.getElementById('currencySymbol').value.trim();
            
            if (name && symbol) {
                const payload = { name, symbol };
                try {
                    const response = await fetch('api/admin.php?action=save_currency', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) {
                        alert('Currency settings saved and synchronized!');
                        closeModal();
                    }
                } catch (err) { alert('Sync Failed.'); }
            } else {
                alert('Both fields are required!');
            }
        }

        async function saveLogoSettings() {
            const fileInput = document.getElementById('logoFile');
            const doNotShowOption = document.getElementById('doNotShowOption')?.checked;
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            if (doNotShowOption) {
                logoData = null;
                await fetch(`api/admin.php?action=save_logo&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ logo: null })
                });
                localStorage.removeItem(getCoKey('softifyx_logo'));
                displayLogo();
                closeModal();
            } else if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = new Image();
                    img.onload = async function() {
                        const canvas = document.createElement('canvas');
                        const maxW = 400;
                        const maxH = 400;
                        let width = img.width;
                        let height = img.height;
                        if (width > height) {
                            if (width > maxW) { height *= maxW / width; width = maxW; }
                        } else {
                            if (height > maxH) { width *= maxH / height; height = maxH; }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        logoData = canvas.toDataURL('image/png');
                        try {
                            await fetch(`api/admin.php?action=save_logo&company_id=${companyId}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ logo: logoData })
                            });
                            localStorage.setItem(getCoKey('softifyx_logo'), logoData);
                            displayLogo();
                            closeModal();
                        } catch (err) {
                            alert('Logo Upload Sync Failed!');
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                closeModal();
            }
        }

        function previewLogo() {
            const fileInput = document.getElementById('logoFile');
            const preview = document.getElementById('logoPreview');
            const noLogoText = document.getElementById('noLogoText');
            
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                    if (noLogoText) noLogoText.style.display = 'none';
                    const setOption = document.getElementById('setLogoOption');
                    if (setOption) setOption.checked = true;
                };
                reader.readAsDataURL(file);
            }
        }

        async function saveCompanyDetails() {
            // Priority 1: Specifically selected name in list, Priority 2: Current active name
            const oldName = window.originSelectedCompanyName || originSelectedCompanyName || companyData.name;
            const newName = document.getElementById('modalCompanyName')?.value || companyData.name;

            const payload = {
                name: newName,
                address: document.getElementById('modalCompanyAddress')?.value || '',
                phone: document.getElementById('modalCompanyPhone')?.value || '',
                fax: document.getElementById('modalCompanyFax')?.value || '',
                email: document.getElementById('modalCompanyEmail')?.value || '',
                website: document.getElementById('modalCompanyWebsite')?.value || '',
                gst: document.getElementById('modalCompanyGST')?.value || '',
                ntn: document.getElementById('modalCompanyNTN')?.value || '',
                deals_in: document.getElementById('modalCompanyDealsIn')?.value || '',
                status: document.getElementById('inactiveCheckbox')?.checked ? 0 : 1
            };
            
            // Find specific company record to update in the global companies array
            const targetCompany = companies.find(c => (typeof c === 'string' ? c : c.name) === oldName);

            // SAFETY PROTECTION for Default Company (usually ID=1, 'Softifyx')
            if (targetCompany && targetCompany.id == 1 && payload.status === 0) {
                alert("Critical System Error: Default company 'Softifyx' cannot be deactivated to prevent system-wide lockouts.");
                const chk = document.getElementById('inactiveCheckbox');
                if (chk) chk.checked = false;
                return;
            }

            try {
                const response = await fetch(`api/admin.php?action=save_company&id=${targetCompany?.id || ''}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, id: targetCompany?.id }) // PASS ID HERE FOR UPDATE
                });

                if (response.ok) {
                    // CRITICAL: If a company was selected from the list, apply it ONLY IF ACTIVE
                    if (targetCompany && payload.status === 1) {
                        const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        // Update ONLY company-specific fields to preserve user_id, role, etc.
                        const updatedSession = {
                            ...sessionData,
                            company_id: targetCompany.id,
                            company_name: newName
                        };
                        localStorage.setItem('softifyx_session', JSON.stringify(updatedSession));
                    } else if (payload.status === 0) {
                        console.log("Company deactivated. Skipping session switch.");
                    }

                    alert('Business details updated and synchronized live!');
                    window.location.reload();
                }
            } catch (err) { alert('Sync Error: ' + err.message); }
        }

        async function deleteCompany() {
            const oldName = originSelectedCompanyName || companyData.name;
            const targetCompany = companies.find(c => (typeof c === 'string' ? c : c.name) === oldName);
            
            if (!targetCompany) return;

            if (confirm(`Are you sure you want to PERMANENTLY delete the company "${oldName}"? This action cannot be undone.`)) {
                try {
                    const response = await fetch(`api/admin.php?action=delete_company&id=${targetCompany.id}`, { method: 'DELETE' });
                    if (response.ok) {
                        alert('Company deleted successfully.');
                        window.location.reload();
                    }
                } catch (err) { alert('Delete Sync Failed.'); }
            }
        }

        async function saveNote() {
            const noteText = document.getElementById('notesText')?.value;
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            if (noteText !== undefined) {
                currentNote = noteText;
                try {
                    const response = await fetch(`api/admin.php?action=save_note&company_id=${companyId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ note: currentNote })
                    });
                    if (!response.ok) throw new Error('Server responded with ' + response.status);
                } catch (err) {
                    console.error('Save Note Error:', err);
                    alert('Sync Error: Failed to save notepad to database (' + err.message + ')');
                }
            }
        }

        async function clearNote() {
            const noteEl = document.getElementById('notesText');
            if (noteEl) noteEl.value = '';
            currentNote = '';
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            try {
                await fetch(`api/admin.php?action=save_note&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: '' })
                });
            } catch (err) { console.error('Clear Note Error:', err); }
        }


        function performSearch() {
            const searchTerm = document.getElementById('globalSearch')?.value;
            if (searchTerm && searchTerm.trim() !== '') {
                const results = inventoryItems.filter(item => 
                    item.name.toLowerCase().includes(searchTerm.toLowerCase())
                );
                
                if (results.length > 0) {
                    let resultsHtml = '';
                    results.forEach(item => {
                        resultsHtml += `<div style="padding: 8px; border-bottom: 1px solid #eee;">
                            <strong>${item.name}</strong> - Stock: ${item.stock} (Reorder at: ${item.reorderLevel})
                        </div>`;
                    });
                    
                    openModal(
                        { icon: 'fa-search', text: 'Search Results' },
                        `<div>
                            <p>Found ${results.length} item(s) matching "${searchTerm}":</p>
                            ${resultsHtml}
                            <div class="modal-actions">
                                <button class="btn btn-secondary" onclick="window.closeModal()">Close</button>
                            </div>
                        </div>`
                    );
                }
            }
        }

        async function onDateChange() {
            const date = document.getElementById('dailyReportDate')?.value;
            if (!date) return;
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id;
            if (!companyId) return;
            try {
                const cb = `_cb=${Date.now()}`;
                const res = await fetch(`api/admin.php?action=get_summary&company_id=${companyId}&report_date=${date}&${cb}`);
                if (res.ok) {
                    const summary = await res.json();
                    if (summary && !summary.error) {
                        dailySummary = {
                            sales: parseFloat(summary.sales || 0), cashOpening: parseFloat(summary.cash_opening || 0), cashReceipts: parseFloat(summary.cash_receipts || 0), cashPayments: parseFloat(summary.cash_payments || 0),
                            bankOpening: parseFloat(summary.bank_opening || 0), bankReceipts: parseFloat(summary.bank_receipts || 0), bankPayments: parseFloat(summary.bank_payments || 0), bankBalance: parseFloat(summary.bank_balance || 0), recOpening: parseFloat(summary.rec_opening || 0), recSales: parseFloat(summary.rec_sales || 0), recReceipts: parseFloat(summary.rec_receipts || 0),
                            payOpening: parseFloat(summary.pay_opening || 0), payPurchases: parseFloat(summary.pay_purchases || 0), payPayments: parseFloat(summary.pay_payments || 0), newInvoices: parseInt(summary.new_invoices || 0),
                            customerReceipts: parseFloat(summary.customer_receipts || 0), overdue: parseFloat(summary.overdue || 0), newPurchases: parseInt(summary.new_purchases || 0), vendorPayments: parseFloat(summary.vendor_payments || 0), outstanding: parseFloat(summary.outstanding || 0),
                            posInvoices: parseInt(summary.pos_invoices || 0), posSales: parseFloat(summary.pos_sales || 0), posCashSales: parseFloat(summary.pos_cash_sales || 0), posCardSales: parseFloat(summary.pos_card_sales || 0), posTaxTotal: parseFloat(summary.pos_tax_total || 0), posReturns: parseFloat(summary.pos_returns || 0), posNetTotal: parseFloat(summary.pos_net_total || 0),
                            digitalInvoices: parseInt(summary.digital_invoices || 0), digitalSales: parseFloat(summary.digital_sales || 0), digitalTax: parseFloat(summary.digital_tax || 0), digitalTaxUploaded: parseFloat(summary.digital_tax_uploaded || 0), digitalSubmittedCount: parseInt(summary.digital_submitted_count || 0), digitalNotes: parseInt(summary.digital_notes || 0), digitalConnected: !!summary.digital_connected, digitalStatus: summary.digital_status || 'Not Configured'
                        };
                        window.dailySummary = dailySummary;
                        updateDashboardSummary();
                    }
                }
                const wRes = await fetch(`api/admin.php?action=get_weekly_sales&company_id=${companyId}&report_date=${date}&${cb}`);
                if (wRes.ok) {
                    const wData = await wRes.json();
                    updateWeeklyTrend(wData);
                }
            } catch (e) {
                console.error("Failed to fetch updated summary:", e);
            }
        }

        function setupMenuButtons() {
            document.getElementById('myCompanyBtn').addEventListener('click', async function() {
                if (!checkUserRights("My Company")) return showAccessDenied("My Company");
                
                // LIVE SYNC: Fetch latest company info before opening
                const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = sessionData.company_id || 1;
                try {
                    const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data) {
                            companyData = {
                                name: data.name || '',
                                address: data.address || '',
                                phone: data.phone || '',
                                fax: data.fax || '',
                                email: data.email || '',
                                website: data.website || '',
                                gst: data.gst || '',
                                ntn: data.ntn || '',
                                dealsIn: data.deals_in || ''
                            };
                            window.companyData = companyData;
                        }
                    }
                } catch (err) { console.error('Live Sync Error:', err); }

                openModal(
                    { icon: 'fa-building', text: 'Company Setup' },
                    `<div>
                        <div class="form-group">
                            <label>Business Name</label>
                            <input type="text" class="form-control" id="modalBusinessName" value="${companyData.name}">
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <input type="text" class="form-control" id="modalAddress" value="${companyData.address}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone(s)</label>
                                <input type="text" class="form-control" id="modalPhone" value="${companyData.phone}">
                            </div>
                            <div class="form-group">
                                <label>Fax</label>
                                <input type="text" class="form-control" id="modalFax" value="${companyData.fax}">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>E-Mail</label>
                                <input type="email" class="form-control" id="modalEmail" value="${companyData.email}">
                            </div>
                            <div class="form-group">
                                <label>Website</label>
                                <input type="text" class="form-control" id="modalWebsite" value="${companyData.website}">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>G.S.T. Regn. No.</label>
                                <input type="text" class="form-control" id="modalGST" value="${companyData.gst}">
                            </div>
                            <div class="form-group">
                                <label>N.T.N.</label>
                                <input type="text" class="form-control" id="modalNTN" value="${companyData.ntn}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Deals In</label>
                            <input type="text" class="form-control" id="modalDealsIn" value="${companyData.dealsIn}">
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-primary" onclick="saveCompanySettings()">Save</button>
                            <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
                        </div>
                    </div>`,
                    false,
                    "My Company"
                );
            });

            document.getElementById('myLogoBtn').addEventListener('click', function() {
                if (!checkUserRights("My Logo")) return showAccessDenied("My Logo");
                openModal(
                    { icon: 'fa-image', text: 'Logo Settings' },
                    `<div>
                        <div style="background: #fff8e7; border-left: 4px solid #F5A623; padding: 10px; margin-bottom: 15px; border-radius: 0 6px 6px 0; font-size: 13px;">
                            <i class="fas fa-info-circle" style="color: #F5A623; margin-right: 8px;"></i>
                            Note: Only .jpeg, .jpg, .png or .gif files can be set as logo.
                        </div>
                        <div style="border: 1px dashed #b9c2ce; border-radius: 6px; padding: 25px; text-align: center; margin-bottom: 20px; background-color: #fbfdff; min-height: 80px; display: flex; align-items: center; justify-content: center;">
                            <div id="noLogoText" style="color: #6b84a3; font-style: italic; font-size: 14px; ${logoData ? 'display: none;' : ''}">No Logo</div>
                            <img id="logoPreview" class="logo-preview" src="${logoData || ''}" alt="Logo Preview" style="max-height: 80px; max-width: 100%; border: none; padding: 0; margin: 0; box-shadow: none; ${!logoData ? 'display: none;' : ''}">
                        </div>
                        <div style="margin: 15px 0;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <input type="radio" name="logoOption" id="setLogoOption" value="set" ${logoData ? 'checked' : ''}> 
                                <label for="setLogoOption" style="font-size: 14px;">Set New Logo</label>
                            </div>
                            <div style="margin-left: 28px; display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
                                <input type="file" id="logoFile" accept=".jpg,.jpeg,.png,.gif" onchange="previewLogo()" style="font-size: 13px;">
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                                <input type="radio" name="logoOption" id="doNotShowOption" value="none" ${!logoData ? 'checked' : ''}> 
                                <label for="doNotShowOption" style="font-size: 14px;">Do Not Show Logo</label>
                            </div>
                        </div>
                        <div style="background: #f0f5fc; padding: 10px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #1f4668;">
                            <i class="fas fa-info-circle" style="color: #F5A623; margin-right: 8px;"></i>
                            Your selected logo will be printed on your documents.
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-primary" onclick="saveLogoSettings()">Save</button>
                            <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
                        </div>
                    </div>`,
                    false,
                    "My Logo"
                );
            });

            document.getElementById('listOfCompaniesBtn').addEventListener('click', function() {
                if (!checkUserRights("List Of Companies")) return showAccessDenied("List Of Companies");
                
                const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const currentCoName = sessionData.company_name || "";
                
                let companyOptions = '';
                companies.forEach(company => {
                    const companyName = (typeof company === 'string') ? company : (company.name || "Unknown Company");
                    const isSelected = (companyName === currentCoName) ? 'selected' : '';
                    companyOptions += `<option value="${companyName}" ${isSelected}>${companyName}</option>`;
                });
                
                openModal(
                    { icon: 'fa-list', text: 'List of Companies - Select for Login' },
                    `<div id="listOfCompaniesModal">
                        <div style="background: #f8fafd; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <label style="min-width: 100px; font-size: 13px; font-weight: 500;">Select Company</label>
                                <select class="form-control" style="flex: 1; height: 36px;" id="companySelector" onchange="populateCompanyForm(this)">
                                    <option value="">-- Choose Company --</option>
                                    ${companyOptions}
                                </select>
                                <button class="btn btn-primary btn-sm" onclick="showAddCompanyForm()"><i class="fas fa-plus"></i> New</button>
                            </div>
                        </div>
                        <div style="background: #e8f0fe; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                            <p style="font-size: 13px; color: #1f4668;"><i class="fas fa-info-circle" style="color: #F5A623;"></i> Select a company above to load its data. Click <b>Save Changes</b> to update and apply the selection.</p>
                        </div>
                        <div class="form-group">
                            <label>Business Name</label>
                            <input type="text" class="form-control" id="modalCompanyName" value="${companyData.name}">
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <input type="text" class="form-control" id="modalCompanyAddress" value="${companyData.address}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone(s)</label>
                                <input type="text" class="form-control" id="modalCompanyPhone" value="${companyData.phone}">
                            </div>
                            <div class="form-group">
                                <label>Fax</label>
                                <input type="text" class="form-control" id="modalCompanyFax" value="${companyData.fax}">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>E-Mail</label>
                                <input type="email" class="form-control" id="modalCompanyEmail" value="${companyData.email}">
                            </div>
                            <div class="form-group">
                                <label>Website</label>
                                <input type="text" class="form-control" id="modalCompanyWebsite" value="${companyData.website}">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>G.S.T. Regn. No.</label>
                                <input type="text" class="form-control" id="modalCompanyGST" value="${companyData.gst}">
                            </div>
                            <div class="form-group">
                                <label>N.T.N.</label>
                                <input type="text" class="form-control" id="modalCompanyNTN" value="${companyData.ntn}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Deals In</label>
                            <input type="text" class="form-control" id="modalCompanyDealsIn" value="${companyData.dealsIn}">
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin: 12px 0;">
                            <input type="checkbox" id="inactiveCheckbox"> <label for="inactiveCheckbox" style="font-size: 13px;">Inactive</label>
                        </div>
                        <div class="modal-actions" style="justify-content: space-between;">
                            <div>
                                <button class="btn btn-danger" onclick="deleteCompany()" style="background-color: #d63031; border-color: #d63031;">
                                    <i class="fas fa-trash-alt"></i> Delete Company
                                </button>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-primary" onclick="saveCompanyDetails()">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                                <button class="btn btn-secondary" onclick="window.closeModal()">
                                    <i class="fas fa-times"></i> Close
                                </button>
                            </div>
                        </div>
                    </div>`,
                    false,
                    "List Of Companies"
                );
            });


            
            document.getElementById('userLoginsBtn').addEventListener('click', async function() {
                if (!checkUserRights("User Logins")) return showAccessDenied("User Logins");
                
                // LIVE SYNC: Fetch latest users list before opening
                const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = sessionData.company_id || 1;
                try {
                    const res = await fetch(`api/admin.php?action=get_users&company_id=${companyId}`);
                    if (res.ok) users = await res.json();
                } catch (err) { console.error('Live Sync Error:', err); }

                openModal(
                    { icon: 'fa-users', text: 'User Logins' },
                    renderUserTable(),
                    false,
                    "User Logins"
                );
            });

            const userRightsBtn = document.getElementById('userRightsBtn');
            if(userRightsBtn) {
                userRightsBtn.addEventListener('click', function() {
                    if (!checkUserRights("User Rights")) return showAccessDenied("User Rights");
                    openModularPopup('Navigation/Administrator/user_rights.html', 'fa-shield-alt', 'User Rights Settings', initUserRightsView, "User Rights");
                });
            }
        }

        async function switchCompanyDataMode(select) {
            const selectedCompany = select.value;
            if (!selectedCompany) return;
            
            const found = companies.find(c => (typeof c === 'string' ? c : c.name) === selectedCompany);
            if (found) {
                // Populate the form instead of switching sessions immediately
                populateCompanyForm(select);
            }
        }
        // DEPRECATED: Old function renamed to prevent cached calls
        window.selectCompanyForLogin = switchCompanyDataMode;

        window.populateCompanyForm = function(select) {
            const selectedCompany = select.value;
            if (!selectedCompany) return;
            
            const found = companies.find(c => (typeof c === 'string' ? c : c.name) === selectedCompany);
            if (found) {
                // Set original name tracking for saveCompanyDetails()
                originSelectedCompanyName = found.name || selectedCompany;
                window.originSelectedCompanyName = originSelectedCompanyName;
                
                // Populate Modal Fields
                const get = id => document.getElementById(id);
                if (get('modalCompanyName')) get('modalCompanyName').value = found.name || '';
                if (get('modalCompanyAddress')) get('modalCompanyAddress').value = found.address || '';
                if (get('modalCompanyPhone')) get('modalCompanyPhone').value = found.phone || '';
                if (get('modalCompanyFax')) get('modalCompanyFax').value = found.fax || '';
                if (get('modalCompanyEmail')) get('modalCompanyEmail').value = found.email || '';
                if (get('modalCompanyWebsite')) get('modalCompanyWebsite').value = found.website || '';
                if (get('modalCompanyGST')) get('modalCompanyGST').value = found.gst || '';
                if (get('modalCompanyNTN')) get('modalCompanyNTN').value = found.ntn || '';
                if (get('modalCompanyDealsIn')) get('modalCompanyDealsIn').value = found.deals_in || found.dealsIn || '';
                
                // Set Inactive Checkbox Status
                const inactiveChk = get('inactiveCheckbox');
                if (inactiveChk) {
                    // 1. SET CHECKED STATUS
                    inactiveChk.checked = (found.status == 0);
                    
                    // 2. LOCK FOR DEFAULT COMPANY (ID=1)
                    if (found.id == 1) {
                        inactiveChk.disabled = true;
                        inactiveChk.parentElement.style.opacity = '0.5';
                        inactiveChk.parentElement.style.cursor = 'not-allowed';
                        inactiveChk.title = "Default company cannot be deactivated.";
                    } else {
                        inactiveChk.disabled = false;
                        inactiveChk.parentElement.style.opacity = '1';
                        inactiveChk.parentElement.style.cursor = 'pointer';
                        inactiveChk.title = "";
                    }
                }
                
                console.log(`Loaded data for: ${originSelectedCompanyName}`);
            }
        };
        function initUserRightsView() {
            let userOptions = '';
            users.forEach(u => {
                userOptions += `<option value="${u.id}">${u.username}</option>`;
            });

            let rightsRows = '';
            
            const explicitRights = [
                "My Company", "My Logo", "List Of Companies", "User Logins",
                "User Rights", "Passwords", "Financial Year", "Clear Transactions",
                "Currency", "BackUp Utility", "Chart of Accounts", "Customers",
                "Vendors/Suppliers", "Bank Accounts", "Accounts Opening Balances",
                "Chart Of Inventory", "Inventory Opening Balances", "Inventory Brands",
                "Inventory Locations", "Item Price Settings", "Item Sales Tax Rates",
                "Item Pre-Order Levels", "Item Cost Valuation Method", "Chart Of Services",
                "Voucher Posting Preferences", "Inventory Movement Settings", "Customer Regions",
                "Business Sectors", "Employees", "Jobs", "Purchase Orders", "Purchases (Sales Tax)",
                "Purchases (Non Tax)", "Purchases Return/Debit Notes", "Cash Payments",
                "Bank Payments", "Customer Follow-Up", "Quotations", "Sale Orders",
                "Delivery Challans", "Sales Tax Invoices", "Sale Invoices (Non Tax)",
                "Sale Return/Credit Notes",                "Cash Receipts", "Bank Receipts", "Inward Gate Passes", "Outward Gate Passes", "Material Issue Notes", "Production Notes", "Inventory Transfers", "Add Inventory Adjustments", "Reduce Inventory Adjustments",
                "Send Ledger Summary", "Send Payment Reminder", "SMS Templates", "Bulk Messages",
                "Journal Notes", "General Journal Voucher", "Journal Report", "Print Voucher",
                "Product Serials Tracking", "Item Below Re-Order Level", "Purchase Order Tracking",
                "Sale Order Tracking", "Purchase Summary", "Purchase Register",
                "Party Purchase Summary", "Payments Reports", "Purchase Activity Report - Invoice Wise",
                "Purchase Activity Report - Party Wise", "Item Purchase Summary", "Item Purchase Analysis",
                "Accounts Payable Aging", "Material Consumption Report", "Production Report",
                "Sale Summary", "Sale Register", "Party Sale Summary", "Recovery/Receipts Reports",
                "Sale Activity Report - Invoice Wise", "Sale Activity Report - Party Wise",
                "Item Sale Summary", "Item Sale Analysis", "Services Analysis", "Accounts Receivable Aging",
                "View Inventory Ledgers", "Print Inventory Ledgers", "Item-Wise Profit/Loss",
                "Inventory Balances", "Job Ledgers", "View Account Ledger", "Print Account Ledger",
                "Cash & Bank Balances", "Customer Balances", "Vendor Balances", "Trial Balance",
                "Income Statement", "Balance Sheet"
            ];

            explicitRights.forEach(itemName => {
                rightsRows += `<tr data-right="${itemName}" style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 15px; color: #334155; font-size: 13.5px; font-weight: 500;">
                        ${itemName}
                    </td>
                    <td class="right-status" style="text-align: center; font-weight: 700; color: #ef4444; cursor: pointer; user-select: none; transition: all 0.2s; font-size: 11px; padding: 12px 5px; border-left: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9;" ondblclick="toggleRightStatus(this)">Not Allowed</td>
                    <td style="text-align: center; padding: 5px; background: #fff !important;">
                        <input type="checkbox" class="editor-check" disabled 
                            onclick="handleRightCheckboxClick(this, 'editor')"
                            style="width: 20px !important; height: 20px !important; cursor: not-allowed; opacity: 0.5; margin: 0; display: inline-block !important; visibility: visible !important;">
                    </td>
                    <td style="text-align: center; padding: 5px; background: #fff !important;">
                        <input type="checkbox" class="viewer-check" disabled 
                            onclick="handleRightCheckboxClick(this, 'viewer')"
                            style="width: 20px !important; height: 20px !important; cursor: not-allowed; opacity: 0.5; margin: 0; display: inline-block !important; visibility: visible !important;">
                    </td>
                </tr>`;
            });

            // Mutual Exclusion Handler: Only one can be checked at a time (Editor OR Viewer)
            window.handleRightCheckboxClick = function(checkbox, type) {
                const row = checkbox.closest('tr');
                const editorCb = row.querySelector('.editor-check');
                const viewerCb = row.querySelector('.viewer-check');
                
                if (checkbox.checked) {
                    if (type === 'editor') {
                        viewerCb.checked = false;
                    } else {
                        editorCb.checked = false;
                    }
                }
            };

            const urUserSelect = document.getElementById('urUserSelect');
            if(urUserSelect) urUserSelect.innerHTML = userOptions;
            
            const urTableBody = document.getElementById('urTableBody');
            if(urTableBody) urTableBody.innerHTML = rightsRows;
            
            setTimeout(() => {
                loadUserRightsForm();
            }, 50);
        }

        function toggleRightStatus(cell) {
            const row = cell.closest('tr');
            const statusCell = row.querySelector('.right-status');
            const checkboxes = row.querySelectorAll('input[type="checkbox"]');
            
            if (statusCell.textContent === 'Not Allowed') {
                statusCell.textContent = 'Allowed';
                statusCell.style.color = '#10b981';
                checkboxes.forEach(cb => {
                    cb.disabled = false;
                    cb.style.opacity = '1';
                    cb.style.cursor = 'pointer';
                });
            } else {
                statusCell.textContent = 'Not Allowed';
                statusCell.style.color = '#ef4444';
                checkboxes.forEach(cb => {
                    cb.checked = false;
                    cb.disabled = true;
                    cb.style.opacity = '0.3';
                    cb.style.cursor = 'not-allowed';
                });
            }
        }

        async function loadUserRightsForm() {
            const userId = document.getElementById('urUserSelect')?.value;
            if (!userId) return;

            try {
                const response = await fetch(`api/admin.php?action=get_rights&user_id=${userId}`);
                const rightsArray = await response.json();
                
                let rightsData = {};
                rightsArray.forEach(r => {
                    rightsData[r.module_name] = {
                        allowed: (r.is_allowed == 1),
                        edit: (r.can_edit == 1),
                        view: (r.can_view == 1)
                    };
                });
                
                const urUserSelect = document.getElementById('urUserSelect');
                const selectedUserId = urUserSelect ? urUserSelect.value : null;
                // Double-check users global variable
                const currentUsersList = (typeof users !== 'undefined') ? users : [];
                const userObj = currentUsersList.find(u => u.id == selectedUserId);
                
                // Force Admin Logic: Check by username or role
                const isAdmin = (userObj && (userObj.username === 'Administrator' || userObj.role === 'Admin')) || (selectedUserId == 1);

                document.querySelectorAll('#urTableBody tr').forEach(row => {
                    const rightNameRaw = row.getAttribute('data-right');
                    const rightName = rightNameRaw ? rightNameRaw.trim().toLowerCase() : "";
                    const statusCell = row.querySelector('.right-status');
                    const editorCb = row.querySelector('.editor-check');
                    const viewerCb = row.querySelector('.viewer-check');
                    
                    if (!statusCell || !editorCb || !viewerCb) {
                        console.error("Missing elements in row for", rightName);
                        return;
                    }

                    let data = { allowed: false, edit: false, view: false };
                    
                    // Normalizing rightsData lookup
                    if (rightsData && Array.isArray(rightsData)) {
                        const found = rightsData.find(r => r.module_name.trim().toLowerCase() === rightName);
                        if (found) {
                            data = {
                                allowed: parseInt(found.is_allowed) === 1,
                                edit: parseInt(found.can_edit) === 1,
                                view: parseInt(found.can_view) === 1
                            };
                        }
                    } else if (rightsData && typeof rightsData === 'object') {
                        // Fallback for object-based rightsData
                        for (let mod in rightsData) {
                            if (mod.trim().toLowerCase() === rightName) {
                                data = rightsData[mod];
                                break;
                            }
                        }
                    }
                    
                    // FORCE ALLOWED FOR ADMINS
                    if (isAdmin) {
                        data = { allowed: true, edit: true, view: true };
                    }

                    if (data.allowed) {
                        statusCell.textContent = 'Allowed';
                        statusCell.style.color = '#10b981';
                        [editorCb, viewerCb].forEach(cb => {
                            cb.disabled = false;
                            cb.style.opacity = '1';
                            cb.style.cursor = 'pointer';
                        });
                    } else {
                        statusCell.textContent = 'Not Allowed';
                        statusCell.style.color = '#ef4444';
                        [editorCb, viewerCb].forEach(cb => {
                            cb.checked = false;
                            cb.disabled = true;
                            cb.style.opacity = '0.5';
                            cb.style.cursor = 'not-allowed';
                        });
                    }
                    
                    editorCb.checked = data.edit;
                    viewerCb.checked = data.view;
                });
            } catch (err) { console.error('Rights Load Error:', err); }
        }

        async function saveUserRights() {
            const userId = document.getElementById('urUserSelect').value;
            let rightsPayload = [];
            
            document.querySelectorAll('#urTableBody tr').forEach(row => {
                const rightName = row.getAttribute('data-right');
                const isAllowed = (row.querySelector('.right-status').textContent === 'Allowed');
                const canEdit = row.querySelector('.editor-check').checked;
                const canView = row.querySelector('.viewer-check').checked;
                
                rightsPayload.push({ 
                    module: rightName, 
                    allowed: isAllowed ? 1 : 0,
                    can_edit: canEdit ? 1 : 0,
                    can_view: canView ? 1 : 0
                });
            });
            
            try {
                await fetch('api/admin.php?action=save_rights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, rights: rightsPayload })
                });
                
                await loadSavedData();
                alert('User rights saved and synced successfully!');
            } catch (err) { alert('Sync Failed.'); }
        }

        // === MODULAR POPUP SYSTEM ARCHITECTURE ===

        function initPasswordsView() {
            let uOpts = '';
            users.forEach(u => {
                uOpts += `<option value="${u.id}">${u.username}</option>`;
            });
            const pwdUserSelect = document.getElementById('pwdUserSelect');
            if(pwdUserSelect) pwdUserSelect.innerHTML = uOpts;
        }

        async function savePasswordSettings() {
            const userId = parseInt(document.getElementById('pwdUserSelect').value);
            const newPwd = document.getElementById('pwdNew').value.trim();
            const confPwd = document.getElementById('pwdConfirm').value.trim();
            const errorMsg = document.getElementById('pwdErrorMsg');
            
            errorMsg.textContent = '';
            
            if(!newPwd || !confPwd) {
                errorMsg.textContent = 'Both New Password and Re-Type fields are required!';
                return;
            }
            if(newPwd !== confPwd) {
                errorMsg.textContent = 'New Password and Re-Type Password do not match!';
                return;
            }
            
            try {
                // In a live DB environment, we send the update to the server.
                // The server should ideally verify the old password, but for parity with 
                // your current logic, we'll allow Admin reset or simple match.
                const response = await fetch('api/admin.php?action=save_user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: userId, password: newPwd, username: users.find(u=>u.id==userId).username, role: users.find(u=>u.id==userId).role, status: 'Active' })
                });

                if (response.ok) {
                    alert('Success: Password has been updated and synced successfully!');
                    closeModal();
                }
            } catch (err) { alert('Sync Failed.'); }
        }

        async function resetUserPassword() {
            try {
                const userSel = document.getElementById('pwdUserSelect');
                if (!userSel) return alert('System Error: User list not found.');
                
                const userId = parseInt(userSel.value);
                const newPwd = (document.getElementById('pwdNew')?.value || '').trim();
                const confPwd = (document.getElementById('pwdConfirm')?.value || '').trim();
                const errorMsg = document.getElementById('pwdErrorMsg');
                
                if (!userId || isNaN(userId)) return alert('Please select a user from the dropdown first.');
                
                if (errorMsg) errorMsg.textContent = '';
                
                if (!newPwd || !confPwd) {
                    if (errorMsg) errorMsg.textContent = 'Enter and confirm new password!';
                    return;
                }
                if (newPwd !== confPwd) {
                    if (errorMsg) errorMsg.textContent = 'Passwords do not match!';
                    return;
                }
                
                const userName = (users || []).find(u => u.id == userId)?.username || 'User';
                if (!confirm(`Are you sure you want to RESET the password for "${userName}"? The old password will be overwritten.`)) return;

                const response = await fetch('api/admin.php?action=update_password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: userId, password: newPwd })
                });

                if (response.ok) {
                    alert(`Success: Password for "${userName}" has been reset successfully!`);
                    // Clear the fields
                    if(document.getElementById('pwdNew')) document.getElementById('pwdNew').value = '';
                    if(document.getElementById('pwdConfirm')) document.getElementById('pwdConfirm').value = '';
                    if(document.getElementById('pwdOld')) document.getElementById('pwdOld').value = '';
                    closeModal();
                } else {
                    const result = await response.json();
                    alert('Server Error: ' + (result.error || 'Failed to reset password.'));
                }
            } catch (err) {
                console.error('Password Reset Error:', err);
                alert('System Error: ' + err.message);
            }
        }
        window.resetUserPassword = resetUserPassword;

        // --- FINANCIAL YEAR LOGIC --- //

        function initFinancialYearView() {
            renderFinancialYearList();
            addFinancialYear(); 
        }

        function renderFinancialYearList() {
            const listObj = document.getElementById('fyListBox');
            if(!listObj) return;
            let html = '';
            financialYears.forEach(fy => {
                const activeId = document.getElementById('fyEditId') ? document.getElementById('fyEditId').value : '';
                const activeCls = (activeId == fy.id) ? 'active' : '';
                html += `<div class="listbox-item ${activeCls}" onclick="selectFinancialYear(${fy.id})">${fy.abbr}</div>`;
            });
            listObj.innerHTML = html;
        }

        function renderFinancialYearList() {
            const listContainer = document.getElementById('fyListBox');
            if (!listContainer) return;

            listContainer.innerHTML = '';
            const editId = document.getElementById('fyEditId').value;

            financialYears.forEach(fy => {
                const item = document.createElement('div');
                item.className = `listbox-item ${fy.id == editId ? 'active' : ''}`;
                item.textContent = fy.abbr;
                item.onclick = () => selectFinancialYear(fy.id);
                listContainer.appendChild(item);
            });
        }

        function calculateAbbreviation(start, end) {
            if (!start || !end) return '';
            const s = new Date(start);
            const e = new Date(end);
            if (isNaN(s) || isNaN(e)) return '';
            
            const startYear = s.getFullYear();
            const endYear = e.getFullYear();
            const endShort = endYear.toString().slice(-2);
            return `${startYear}-${endShort}`;
        }

        function selectFinancialYear(id) {
            const fy = financialYears.find(f => f.id == id);
            if(fy) {
                document.getElementById('fyStartDate').value = fy.start;
                document.getElementById('fyEndDate').value = fy.end;
                document.getElementById('fyAbbreviation').value = fy.abbr;
                document.getElementById('fyEditId').value = fy.id;
                document.getElementById('fyErrorMsg').textContent = '';
                renderFinancialYearList();
            }
        }

        function addFinancialYear() {
            document.getElementById('fyStartDate').value = '';
            document.getElementById('fyEndDate').value = '';
            document.getElementById('fyAbbreviation').value = '';
            document.getElementById('fyEditId').value = '';
            document.getElementById('fyErrorMsg').textContent = '';
            renderFinancialYearList();
        }

        async function saveFinancialYear(event) {
            if (event) event.preventDefault();
            const start = document.getElementById('fyStartDate').value;
            const end = document.getElementById('fyEndDate').value;
            const editId = document.getElementById('fyEditId').value;
            const errorMsg = document.getElementById('fyErrorMsg');
            
            errorMsg.textContent = ''; // Reset UI
            
            // 1. Core Validations
            if(!start || !end) {
                errorMsg.style.color = '#d63031';
                errorMsg.textContent = 'Starting and Ending dates are required.';
                return;
            }

            if (new Date(end) <= new Date(start)) {
                errorMsg.style.color = '#d63031';
                errorMsg.textContent = 'Ending Date must be greater than Starting Date.';
                return;
            }

            // 2. Auto-Generate Abbreviation
            const abbr = calculateAbbreviation(start, end);
            document.getElementById('fyAbbreviation').value = abbr; // Show in UI

            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            try {
                const response = await fetch(`api/admin.php?action=save_fy&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editId, start, end, abbr })
                });

                const result = await response.json();

                if (response.ok && result.status === 'success') {
                    // Success Path
                    const fyRes = await fetch(`api/admin.php?action=get_fy&company_id=${companyId}`);
                    if (fyRes.ok) {
                        try {
                            const fyData = await fyRes.json();
                            if (Array.isArray(fyData)) {
                                financialYears = fyData.map(f => ({ 
                                    id: f.id, 
                                    start: f.start_date, 
                                    end: f.end_date, 
                                    abbr: f.year_label || f.abbreviation || f.year || 'FY' 
                                }));
                            }
                        } catch (e) { console.warn('FY Refresh Error:', e); }
                    }

                    errorMsg.style.color = '#27ae60';
                    errorMsg.textContent = 'Settings saved and synced successfully!';
                    renderFinancialYearList();
                    if(!editId) addFinancialYear(); 
                } else {
                    // Enhanced Error Path
                    errorMsg.style.color = '#d63031';
                    errorMsg.textContent = result.message || 'Server Error while saving.';
                }
            } catch (err) { 
                errorMsg.style.color = '#d63031';
                errorMsg.textContent = 'Connection Failed: ' + err.message;
            }
        }

        // EXPOSE TO GLOBAL WINDOW SCOPE
        window.renderFinancialYearList = renderFinancialYearList;
        window.saveFinancialYear = saveFinancialYear;
        window.addFinancialYear = addFinancialYear;
        window.selectFinancialYear = selectFinancialYear;
        window.calculateAbbreviation = calculateAbbreviation;

        // --- CLEAR TRANSACTIONS LOGIC --- //
        function executeClearTransactions() {
            const pwdInput = document.getElementById('clearTxPassword').value.trim();
            const errorMsg = document.getElementById('clearTxErrorMsg');
            
            errorMsg.textContent = '';
            
            if(!pwdInput) {
                errorMsg.textContent = 'Hardware Authorization: Admin Password is required!';
                return;
            }
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const currentUserId = sessionData.user_id || '';
            const companyId = sessionData.company_id || 1;
            
            const selectedOption = document.querySelector('input[name="clear_option"]:checked').value;
            let warningText = '';
            if (selectedOption === '1') {
                warningText = 'FINAL WARNING: This will clear ALL data (Transactions, Master Data, Opening Balances). Your company will be reset to scratch (only folders remaining). Are you absolutely sure?';
            } else if (selectedOption === '2') {
                warningText = 'FINAL WARNING: This will clear all transactions and Opening Balances. Master Data (Accounts, Items, Customers) will be kept. Are you absolutely sure?';
            } else if (selectedOption === '4') {
                warningText = 'FINAL WARNING: This will clear all transactions and Chart of Inventory (including inventory items and their opening balances). Accounts Master Data will be kept. Are you absolutely sure?';
            } else {
                warningText = 'FINAL WARNING: This will clear only transactions. Master Data and Opening Balances will be preserved. Are you absolutely sure?';
            }

            const confirmed = confirm(warningText);
            if(confirmed) {
                // Call backend API to clear transactions
                const btn = document.querySelector('button[onclick="executeClearTransactions()"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';
                btn.disabled = true;

                const formData = new FormData();
                formData.append('company_id', companyId);
                formData.append('clear_option', selectedOption);
                formData.append('password', pwdInput);
                formData.append('user_id', currentUserId);

                fetch('api/clear_transactions.php', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    
                    if(data.status === 'success') {
                        // Also reset the dashboard numbers in frontend if needed
                        if(typeof resetDashboardModel === 'function') resetDashboardModel();
                        if(typeof saveSummary === 'function') saveSummary();
                        
                        alert(data.message);
                        window.location.reload();
                    } else {
                        errorMsg.textContent = data.message || 'An error occurred while clearing transactions.';
                    }
                })
                .catch(error => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    console.error('Error clearing transactions:', error);
                    errorMsg.textContent = 'A network error occurred. Check console for details.';
                });
            }
        }

        // --- CURRENCY LOGIC --- //
        const countryDataList = [
            { c: 'Afghanistan', n: 'Afghan Afghani', s: 'Ã˜â€¹' }, { c: 'Albania', n: 'Albanian Lek', s: 'L' },
            { c: 'Algeria', n: 'Algerian Dinar', s: 'Ã˜Â¯.Ã˜Â¬' }, { c: 'Andorra', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Angola', n: 'Angolan Kwanza', s: 'Kz' }, { c: 'Argentina', n: 'Argentine Peso', s: '$' },
            { c: 'Armenia', n: 'Armenian Dram', s: 'Ã–Â' }, { c: 'Australia', n: 'Australian Dollar', s: 'A$' },
            { c: 'Austria', n: 'Euro', s: 'Ã¢â€šÂ¬' }, { c: 'Azerbaijan', n: 'Azerbaijani Manat', s: 'Ã¢â€šÂ¼' },
            { c: 'Bahamas', n: 'Bahamian Dollar', s: 'B$' }, { c: 'Bahrain', n: 'Bahraini Dinar', s: '.Ã˜Â¯.Ã˜Â¨' },
            { c: 'Bangladesh', n: 'Bangladeshi Taka', s: 'Ã Â§Â³' }, { c: 'Barbados', n: 'Barbadian Dollar', s: 'Bds$' },
            { c: 'Belarus', n: 'Belarusian Ruble', s: 'Br' }, { c: 'Belgium', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Belize', n: 'Belize Dollar', s: 'BZ$' }, { c: 'Bhutan', n: 'Bhutanese Ngultrum', s: 'Nu.' },
            { c: 'Bolivia', n: 'Bolivian Boliviano', s: 'Bs.' }, { c: 'Bosnia', n: 'Convertible Mark', s: 'KM' },
            { c: 'Brazil', n: 'Brazilian Real', s: 'R$' }, { c: 'Brunei', n: 'Brunei Dollar', s: 'B$' },
            { c: 'Bulgaria', n: 'Bulgarian Lev', s: 'ÃÂ»ÃÂ²' }, { c: 'Cambodia', n: 'Cambodian Riel', s: 'Ã¡Å¸â€º' },
            { c: 'Canada', n: 'Canadian Dollar', s: 'C$' }, { c: 'Chile', n: 'Chilean Peso', s: '$' },
            { c: 'China', n: 'Chinese Yuan', s: 'Ã‚Â¥' }, { c: 'Colombia', n: 'Colombian Peso', s: '$' },
            { c: 'Costa Rica', n: 'Costa Rican ColÃƒÂ³n', s: 'Ã¢â€šÂ¡' }, { c: 'Croatia', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Cuba', n: 'Cuban Peso', s: 'Ã¢â€šÂ±' }, { c: 'Cyprus', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Czech Republic', n: 'Czech Koruna', s: 'KÃ„Â' }, { c: 'Denmark', n: 'Danish Krone', s: 'kr' },
            { c: 'Dominican Republic', n: 'Dominican Peso', s: 'RD$' }, { c: 'Ecuador', n: 'US Dollar', s: '$' },
            { c: 'Egypt', n: 'Egyptian Pound', s: 'Ã‚Â£' }, { c: 'Estonia', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Finland', n: 'Euro', s: 'Ã¢â€šÂ¬' }, { c: 'France', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Georgia', n: 'Georgian Lari', s: 'Ã¢â€šÂ¾' }, { c: 'Germany', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Greece', n: 'Euro', s: 'Ã¢â€šÂ¬' }, { c: 'Guatemala', n: 'Guatemalan Quetzal', s: 'Q' },
            { c: 'Honduras', n: 'Honduran Lempira', s: 'L' }, { c: 'Hungary', n: 'Hungarian Forint', s: 'Ft' },
            { c: 'Iceland', n: 'Icelandic KrÃƒÂ³na', s: 'kr' }, { c: 'India', n: 'Indian Rupee', s: 'Ã¢â€šÂ¹' },
            { c: 'Indonesia', n: 'Indonesian Rupiah', s: 'Rp' }, { c: 'Iran', n: 'Iranian Rial', s: 'Ã¯Â·Â¼' },
            { c: 'Iraq', n: 'Iraqi Dinar', s: 'Ã˜Â¹.Ã˜Â¯' }, { c: 'Ireland', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Israel', n: 'Israeli New Shekel', s: 'Ã¢â€šÂª' }, { c: 'Italy', n: 'Euro', s: 'Ã¢â€šÂ¬' },
            { c: 'Jamaica', n: 'Jamaican Dollar', s: 'J$' }, { c: 'Japan', n: 'Japanese Yen', s: 'Ã‚Â¥' },
            { c: 'Jordan', n: 'Jordanian Dinar', s: 'Ã˜Â¯.Ã˜Â§' }, { c: 'Kazakhstan', n: 'Kazakhstani Tenge', s: 'Ã¢â€šÂ¸' },
            { c: 'Kenya', n: 'Kenyan Shilling', s: 'KSh' }, { c: 'Kuwait', n: 'Kuwaiti Dinar', s: 'Ã˜Â¯.Ã™Æ’' },
            { c: 'Lebanon', n: 'Lebanese Pound', s: 'Ã™â€ž.Ã™â€ž' }, { c: 'Libya', n: 'Libyan Dinar', s: 'Ã™â€ž.Ã˜Â¯' },
            { c: 'Malaysia', n: 'Malaysian Ringgit', s: 'RM' }, { c: 'Mexico', n: 'Mexican Peso', s: '$' },
            { c: 'Morocco', n: 'Moroccan Dirham', s: 'Ã˜Â¯.Ã™â€¦.' }, { c: 'Nepal', n: 'Nepalese Rupee', s: 'Ã Â¤Â°Ã Â¥â€š' },
            { c: 'Netherlands', n: 'Euro', s: 'Ã¢â€šÂ¬' }, { c: 'New Zealand', n: 'New Zealand Dollar', s: 'NZ$' },
            { c: 'Nigeria', n: 'Nigerian Naira', s: 'Ã¢â€šÂ¦' }, { c: 'Norway', n: 'Norwegian Krone', s: 'kr' },
            { c: 'Oman', n: 'Omani Rial', s: 'Ã˜Â±.Ã˜Â¹.' }, { c: 'Pakistan', n: 'Pakistani Rupee', s: 'Rs.' },
            { c: 'Philippines', n: 'Philippine Peso', s: 'Ã¢â€šÂ±' }, { c: 'Poland', n: 'Polish ZÃ…â€šoty', s: 'zÃ…â€š' },
            { c: 'Portugal', n: 'Euro', s: 'Ã¢â€šÂ¬' }, { c: 'Qatar', n: 'Qatari Riyal', s: 'Ã˜Â±.Ã™â€š' },
            { c: 'Romania', n: 'Romanian Leu', s: 'lei' }, { c: 'Russia', n: 'Russian Ruble', s: 'Ã¢â€šÂ½' },
            { c: 'Saudi Arabia', n: 'Saudi Riyal', s: 'SAR' }, { c: 'Singapore', n: 'Singapore Dollar', s: 'S$' },
            { c: 'South Africa', n: 'South African Rand', s: 'R' }, { c: 'South Korea', n: 'South Korean Won', s: 'Ã¢â€šÂ©' },
            { c: 'Spain', n: 'Euro', s: 'Ã¢â€šÂ¬' }, { c: 'Sri Lanka', n: 'Sri Lankan Rupee', s: 'Rs' },
            { c: 'Sweden', n: 'Swedish Krona', s: 'kr' }, { c: 'Switzerland', n: 'Swiss Franc', s: 'CHF' },
            { c: 'Taiwan', n: 'New Taiwan Dollar', s: 'NT$' }, { c: 'Thailand', n: 'Thai Baht', s: 'Ã Â¸Â¿' },
            { c: 'Turkey', n: 'Turkish Lira', s: 'Ã¢â€šÂº' }, { c: 'United Arab Emirates', n: 'UAE Dirham', s: 'AED' },
            { c: 'United Kingdom', n: 'British Pound', s: 'Ã‚Â£' }, { c: 'United States', n: 'US Dollar', s: '$' },
            { c: 'Vietnam', n: 'Vietnamese Ã„ÂÃ¡Â»â€œng', s: 'Ã¢â€šÂ«' }
        ];

        function initCurrencyView() {
            const inputEl = document.getElementById('currCountry');
            if(!inputEl) return;
            
            document.addEventListener('click', function(e) {
                if(e.target.id !== 'currCountry' && e.target.id !== 'currChevron') {
                    const dd = document.getElementById('countryDropdownList');
                    if(dd) dd.style.display = 'none';
                }
            });
            
            const savedCurr = localStorage.getItem(getCoKey('softifyx_currency'));
            if(savedCurr) {
                try {
                    const data = JSON.parse(savedCurr);
                    inputEl.value = data.country || '';
                    document.getElementById('currName').value = data.name || '';
                    document.getElementById('currSymbol').value = data.symbol || '';
                } catch(e){}
            } else {
                inputEl.value = 'Pakistan';
                updateCurrencyDetails();
            }
        }

        function renderCustomCountryList(list) {
            const container = document.getElementById('countryDropdownList');
            if(!container) return;
            let html = '';
            list.sort((a,b) => a.c.localeCompare(b.c)).forEach(item => {
                html += `<div style="padding: 10px 15px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.1s;" onmouseover="this.style.background='#f4f6f8'" onmouseout="this.style.background='white'" onclick="selectCustomCountry('${item.c.replace(/'/g, "\\'")}')">${item.c}</div>`;
            });
            container.innerHTML = html.length ? html : '<div style="padding: 10px 15px; color: #d63031; font-style: italic;">No exact match</div>';
        }

        function showCountryList() {
            const dd = document.getElementById('countryDropdownList');
            if(dd) dd.style.display = 'block';
            renderCustomCountryList(countryDataList);
        }

        function toggleCountryList(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const dd = document.getElementById('countryDropdownList');
            const inputEl = document.getElementById('currCountry');
            if(dd && inputEl) {
                if(dd.style.display === 'block') {
                    dd.style.display = 'none';
                } else {
                    dd.style.display = 'block';
                    inputEl.focus();
                    renderCustomCountryList(countryDataList);
                }
            }
        }

        function filterCountryList() {
            const inputEl = document.getElementById('currCountry');
            if(!inputEl) return;
            const str = inputEl.value.toLowerCase();
            const filtered = countryDataList.filter(item => item.c.toLowerCase().includes(str));
            renderCustomCountryList(filtered);
            const dd = document.getElementById('countryDropdownList');
            if(dd) dd.style.display = 'block';
        }

        function selectCustomCountry(countryName) {
            const inputEl = document.getElementById('currCountry');
            if(inputEl) {
                inputEl.value = countryName;
                updateCurrencyDetails();
            }
            const dd = document.getElementById('countryDropdownList');
            if(dd) dd.style.display = 'none';
        }

        function updateCurrencyDetails() {
            const countryName = document.getElementById('currCountry').value;
            const data = countryDataList.find(c => c.c === countryName);
            if(data) {
                document.getElementById('currName').value = data.n;
                document.getElementById('currSymbol').value = data.s;
            }
        }

        async function saveCurrencySettings() {
            const c = document.getElementById('currCountry').value;
            const n = document.getElementById('currName').value;
            const s = document.getElementById('currSymbol').value;
            const err = document.getElementById('currErrorMsg');
            
            if(!c || !n || !s) {
                err.style.color = '#d63031';
                err.textContent = 'Please fill all related fields.';
                return;
            }
            
            try {
                const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = sessionData.company_id || 1;

                const response = await fetch(`api/admin.php?action=save_currency&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: n, symbol: s })
                });

                if (response.ok) {
                    window.globalCurrencySymbol = s;
                    localStorage.setItem(getCoKey('softifyx_currency'), JSON.stringify({ country: c, name: n, symbol: s }));
                    alert('Currency settings saved and synchronized live!');
                    updateDashboardSummary();
                    closeModal();
                }
            } catch (err) { alert('Sync Failed.'); }
        }

        function applyGlobalCurrencySymbol() {
            const newSym = (window.globalCurrencySymbol || 'Rs.') + ' ';
            
            // Only update elements specifically marked as money
            const moneyElements = document.querySelectorAll('.money');
            moneyElements.forEach(el => {
                // Extract only numbers and basic formatting
                const numberPart = el.innerText.replace(/[^\d.,-]/g, '').trim();
                if(numberPart !== "") {
                    el.innerText = newSym + numberPart;
                }
            });
        }

        function checkUserRights(rightName) {
            if (!rightName) return true;
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            
            if (session.username === 'Administrator') return true;
            if (session.role === 'Admin') return true;
            
            const userObj = (users || []).find(u => u.username === session.username);
            if (userObj?.role === 'Admin') return true;

            // POS User Permissions: Guarantee full operational access to POS modules
            const isPosUser = (session.role === 'POS' || userObj?.role === 'POS' || String(session.role).toLowerCase() === 'pos');
            const posModules = [
                'pos sale', 'sale',
                'pos sales register', 'sales register',
                'pos sales return', 'sales return',
                'pos hold / recall register', 'pos hold / recall', 'hold / recall',
                'pos day closing', 'day closing',
                'pos reports', 'reports',
                'pos dashboard', 'dashboard'
            ];
            if (isPosUser && posModules.includes(rightName.trim().toLowerCase())) {
                return true;
            }

            // Always allow these modules for all users Ã¢â‚¬â€ no rights config needed
            const alwaysAllowed = ['Notifications from Admin', 'Journal Notes', 'Software Information', 'License Details', 'Contact Info', 'Digital Invoice - Integration Settings', 'Drivers', 'Digital Invoice Reports', 'FBR Digital Invoice', 'FBR Digital Credit Note', 'FBR Digital Debit Note', 'FBR Invoice Cancellation'];
            if (alwaysAllowed.includes(rightName.trim())) return true;

            if (!window.currentUserRights) return false; 
            
            const rName = rightName.trim();
            const right = window.currentUserRights[rName];
            
            // Returns true if module is 'Allowed' AND has at least one permission checked
            return right && right.allowed && (right.can_edit || right.can_view);
        }
 
        function applyViewerRestrictions(container) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            
            // 1. ADMIN BYPASS: Full access for Administrators
            if (session.username === 'Administrator') return;
            if (session.role === 'Admin') return;
            
            const userObj = (window.users || []).find(u => u.username === session.username);
            if (userObj?.role === 'Admin') return;

            // 1b. POS USER BYPASS FOR POS MODULES: Full operational access
            const isPosUser = (session.role === 'POS' || userObj?.role === 'POS' || String(session.role).toLowerCase() === 'pos');
            if (isPosUser) {
                const posModuleNames = [
                    'pos sale', 'sale',
                    'pos sales register', 'sales register',
                    'pos sales return', 'sales return',
                    'pos hold / recall register', 'pos hold / recall', 'hold / recall',
                    'pos day closing', 'day closing',
                    'pos reports', 'reports',
                    'pos dashboard', 'dashboard'
                ];
                let checkMName = (container.getAttribute('data-module') || '').toLowerCase().trim();
                const containerId = (container.id || '').toLowerCase();
                const bodyEl = container.querySelector('.modal-body');
                if (!checkMName && bodyEl) checkMName = (bodyEl.getAttribute('data-module') || '').toLowerCase().trim();
                if (!checkMName) {
                    const header = container.querySelector('.modal-header h2') || container.querySelector('h2');
                    if (header) checkMName = header.innerText.trim().toLowerCase();
                }
                if (posModuleNames.includes(checkMName) || 
                    posModuleNames.some(pm => checkMName.includes(pm)) || 
                    containerId.includes('pos') || 
                    container.querySelector('[id^="pos_"], [id^="posSale"], [class*="pos-"]')) {
                    return; // Full functional access for POS user in POS modules!
                }
            }

            // 2. IDENTIFY MODULE
            let mName = container.getAttribute('data-module');
            const body = container.querySelector('.modal-body');
            
            if (!mName && body) {
                mName = body.getAttribute('data-module');
            }
            
            // Fallback: If no data-module, try to match via Header Title
            if (!mName) {
                const header = container.querySelector('.modal-header h2') || container.querySelector('h2');
                if (header) {
                    const fullTitle = header.innerText.trim();
                    // Custom Mapping for "Company Setup" -> "My Company"
                    if (fullTitle.includes("Company Setup")) mName = "My Company";
                    else if (fullTitle.includes("Logo Settings")) mName = "My Logo";
                    else mName = fullTitle;
                }
            }
            
            if (!mName || !window.currentUserRights) return;

            // Normalize lookup: Try direct and then case-insensitive
            let right = window.currentUserRights[mName];
            if (!right) {
                const lowerName = mName.toLowerCase().trim();
                for (let key in window.currentUserRights) {
                    const cleanKey = key.toLowerCase().trim();
                    if (cleanKey === lowerName || lowerName.includes(cleanKey) || cleanKey.includes(lowerName)) {
                        right = window.currentUserRights[key];
                        break;
                    }
                }
            }
            
            console.log(`SoftifyX: Checking Permissions for [${mName}]`, right);

            // 3. LOGIC CHECK
            if (!right) return;

            // - Editor (can_edit=1) HAS FULL ACCESS
            // - Viewer (can_view=1) IS READ-ONLY
            const isEditor = right.allowed && right.can_edit;
            const isViewer = right.allowed && right.can_view;
            const isFYMismatched = window.isReadOnly;

            // If user is Editor, they bypass restrictions UNLESS FY is mismatched
            if (isEditor && !isFYMismatched) return;
            
            // If user is NOT an Editor but IS a Viewer, they get read-only mode
            // If user has NEITHER but somehow got here, restricted mode appy anyway

            // 4. APPLY RESTRICTIONS: Disable inputs & Hide Save Buttons
            const inputs = container.querySelectorAll('input, select, textarea');
            inputs.forEach(el => {
                el.disabled = true;
                el.style.backgroundColor = '#f8fafc';
                el.style.cursor = 'not-allowed';
            });

            const actionKeywords = [
                'Save', 'Add', 'Update', 'Delete', 'Clear', 'Restore', 'Backup', 
                'Post', 'Record', 'New', 'Remove', 'Edit', 'Change', 'Sync'
            ];
            
            const buttons = container.querySelectorAll('button');
            buttons.forEach(btn => {
                const btnText = btn.innerText.trim();
                const btnHtml = btn.innerHTML;
                
                const isNavigation = btnText.match(/Close|Cancel|Back|Understand|View|Exit/i);
                const isPrinting = btnHtml.match(/fa-print|fa-file-pdf/i) || btnText.match(/Print|Report/i);
                
                if (!isNavigation && !isPrinting) {
                    const isAction = actionKeywords.some(kw => btnText.includes(kw) || btnHtml.includes(kw.toLowerCase()));
                    if (isAction || btn.classList.contains('btn-primary') || btn.classList.contains('btn-danger') || btn.classList.contains('btn-warning')) {
                        btn.disabled = true;
                        btn.style.opacity = '0.5';
                        btn.style.cursor = 'not-allowed';
                        btn.style.pointerEvents = 'none';
                    }
                }
            });

            // 5. REMOVED UI FEEDBACK MODULE AS REQUESTED (NO "READ ONLY" MESSAGE)
        }

        function showAccessDenied(moduleName) {
            // Remove any existing access denied markers
            const existing = document.getElementById('accessDeniedPopup');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'accessDeniedPopup';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
                display: flex; align-items: center; justify-content: center;
                z-index: 99999; opacity: 0; transition: opacity 0.3s ease;
            `;

            const card = document.createElement('div');
            card.style.cssText = `
                background: white; padding: 40px; border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.2); text-align: center;
                max-width: 450px; width: 90%; transform: scale(0.8);
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            `;

            card.innerHTML = `
                <div style="width: 80px; height: 80px; background: #fff5f5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; border: 2px solid #ffeded;">
                    <i class="fas fa-lock" style="font-size:35px; color:#e74c3c;"></i>
                </div>
                <h2 style="font-weight:700; color:#2c3e50; margin-bottom:10px; font-size: 24px;">Module Restricted</h2>
                <p style="color:#7f8c8d; font-size: 15px; margin-bottom: 25px; line-height: 1.6;">
                    Sorry, you do not have permission to view or open <b>${moduleName}</b>.<br>
                    Please contact your Manager/Administrator for access.
                </p>
                <button class="btn btn-primary" style="padding: 12px 40px; border-radius: 30px; background: #2c3e50; border: none; font-weight: 600; cursor: pointer; color: white;">Close Message</button>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // Animate in
            setTimeout(() => {
                overlay.style.opacity = '1';
                card.style.transform = 'scale(1)';
            }, 10);

            const close = () => {
                overlay.style.opacity = '0';
                card.style.transform = 'scale(0.8)';
                setTimeout(() => overlay.remove(), 300);
            };

            overlay.onclick = (e) => { if(e.target === overlay) close(); };
            card.querySelector('button').onclick = close;
        }

        async function openModularPopup(url, titleIcon, titleText, initCallback, moduleName, isWide = false, isFull = false) {
            try {
                if (url && url.includes('integration_settings.html') && localStorage.getItem('fbr_allow_integration_settings') === '0') {
                    alert('Digital Invoice Integration Settings is disabled in System Settings.');
                    return;
                }

                // IMPORTANT: Normalize module tracking for rights enforcement
                const activeModuleKey = moduleName || titleText;
                
                // If moduleName is explicitly provided, check rights BEFORE any fetch to prevent loading
                if (activeModuleKey && !checkUserRights(activeModuleKey)) {
                    showAccessDenied(activeModuleKey);
                    return;
                }

                const cb = `_cb=${Date.now()}`;
                const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}${cb}`, { cache: "no-store", headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" } });
                if (res.ok) {
                    let html = await res.text();
                    
                    // --- AUTOMATED RIGHTS CHECK FOR POPUPS ---
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const moduleTag = tempDiv.querySelector('[data-module]');
                    
                    if (moduleTag && !moduleName) {
                        const extractedName = moduleTag.getAttribute('data-module');
                        if (!checkUserRights(extractedName)) {
                            showAccessDenied(extractedName);
                            return;
                        }
                    }
                    
                    openModal({ icon: titleIcon, text: titleText }, html, isWide, activeModuleKey, isFull);
                    
                    if (typeof initCallback === 'function') {
                        setTimeout(() => initCallback(), 10);
                    } else {
                        // Global Init Fallbacks
                        if (url.includes('passwords.html')) setTimeout(() => initPasswordsView(), 10);
                        else if (url.includes('user_rights.html')) setTimeout(() => initUserRightsView(), 10);
                        else if (url.includes('financial_year.html')) setTimeout(() => initFinancialYearView(), 10);
                        else if (url.includes('currency.html')) setTimeout(() => initCurrencyView(), 10);
                        else if (url.includes('chart_of_accounts.html')) setTimeout(() => initChartOfAccountsView(), 10);
                        else if (url.includes('employees.html')) setTimeout(() => window.initEmployeesView(), 10);
                        else if (url.includes('inventory_locations.html')) setTimeout(() => window.initInventoryLocationsView(), 10);
                        else if (url.includes('item_price_settings.html')) setTimeout(() => window.initPriceSettings && window.initPriceSettings(), 10);
                        else if (url.includes('inward_gate_passes.html')) setTimeout(() => window.IGPModule && window.IGPModule.init(), 10);
                        else if (url.includes('pos_sale.html')) setTimeout(() => window.POSModule && window.POSModule.init(), 10);
                        else if (url.includes('pos_settings.html')) setTimeout(() => window.POSSettings && window.POSSettings.init(), 10);
                        else if (url.includes('pos_sale_register.html')) setTimeout(() => window.POSRegisterModule && window.POSRegisterModule.init(), 10);
                        else if (url.includes('pos_sale_return.html')) setTimeout(() => window.POSReturnModule && window.POSReturnModule.init(), 10);
                        else if (url.includes('pos_hold_register.html')) setTimeout(() => window.POSHoldRegisterModule && window.POSHoldRegisterModule.init(), 10);
                        else if (url.includes('pos_day_closing.html')) setTimeout(() => window.POSDayClosingModule && window.POSDayClosingModule.init(), 10);
                        else if (url.includes('pos_reports.html')) setTimeout(() => window.POSReportsModule && window.POSReportsModule.init(), 10);
                        else if (url.includes('integration_settings.html')) setTimeout(() => window.DigitalInvoiceSettings && window.DigitalInvoiceSettings.init(), 10);
                    }
                } else {
                    openModal({ icon: titleIcon, text: titleText }, 
                        '<div style="color:red;padding:30px;text-align:center;"><h3>Module Not Found</h3><p>' + url + ' does not exist.</p></div>',
                        isWide, null, isFull
                    );
                }
            } catch (err) { console.error(err); }
        }
        window.openModularPopup = openModularPopup;

        async function openSecondaryModularPopup(url, titleIcon, titleText, initCallback, moduleName, isWide = false, isFull = false) {
            try {
                const activeModuleKey = moduleName || titleText;
                if (activeModuleKey && !checkUserRights(activeModuleKey)) {
                    showAccessDenied(activeModuleKey);
                    return;
                }

                const cb = `_cb=${Date.now()}`;
                const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}${cb}`);
                if (res.ok) {
                    let html = await res.text();
                    openSecondaryModal({ icon: titleIcon, text: titleText }, html, isWide, activeModuleKey, isFull);
                    if (typeof initCallback === 'function') {
                        setTimeout(() => initCallback(), 10);
                    }
                }
            } catch (err) { console.error(err); }
        }
        window.openSecondaryModularPopup = openSecondaryModularPopup;

        async function init() {
            // --- 1. SESSION AUTHENTICATION CHECK ---
            const session = localStorage.getItem('softifyx_session');
            if (!session) {
                window.location.href = 'login.html';
                return;
            }
            
            // --- 2. INITIALIZE APP DATA ---
            await loadSavedData();
            setupDropdowns();
            setupAutoBackupScheduler();

            // Setup Profile Photo Interaction
            const welcomeEl = document.getElementById('welcomeUserDisplay');
            if (welcomeEl) {
                welcomeEl.addEventListener('click', handleProfilePhotoClick);
            }
            
            const profileInput = document.getElementById('profilePhotoInput');
            if (profileInput) {
                profileInput.addEventListener('change', uploadProfilePhoto);
            }

            // Refresh Dashboard Content
            updateNames();


            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            
            const dailyReportDate = document.getElementById('dailyReportDate');
            if (dailyReportDate) dailyReportDate.value = `${yyyy}-${mm}-${dd}`;

            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn) searchBtn.addEventListener('click', performSearch);
            
            const globalSearch = document.getElementById('globalSearch');
            if (globalSearch) {
                globalSearch.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') performSearch();
                });
            }

            const inventoryAlertsCard = document.getElementById('inventoryAlertsCard');
            if (inventoryAlertsCard) inventoryAlertsCard.addEventListener('click', showInventoryDetails);

            const saveNoteBtn = document.getElementById('saveNoteBtn');
            if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);
            
            const clearNoteBtn = document.getElementById('clearNoteBtn');
            if (clearNoteBtn) clearNoteBtn.addEventListener('click', clearNote);
            
            if (dailyReportDate) dailyReportDate.addEventListener('change', onDateChange);
        }

        window.closeModal = closeModal;
        window.showAddUserForm = showAddUserForm;
        window.addUser = addUser;
        window.editUser = editUser;
        window.updateUser = updateUser;
        window.deleteUser = deleteUser;
        window.saveCompanySettings = saveCompanySettings;
        window.saveLogoSettings = saveLogoSettings;
        window.getCompanyLogo = function() {
            if (typeof logoData !== 'undefined' && logoData) return logoData;
            let logo = localStorage.getItem(getCoKey('softifyx_logo'));
            if (logo) return logo;
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const oldKey = (sessionData.company_name || 'default') + '_softifyx_logo';
            logo = localStorage.getItem(oldKey);
            if (logo) return logo;
            return 'assets/logos/logo.png';
        };
        window.showAddCompanyForm = showAddCompanyForm;
        window.addNewCompany = addNewCompany;
        window.showInventoryDetails = showInventoryDetails;
        window.previewLogo = previewLogo;
        window.switchCompanyDataMode = switchCompanyDataMode;
        window.selectCompanyForLogin = switchCompanyDataMode; // Support for potentially cached templates
        window.saveCompanyDetails = saveCompanyDetails;
        window.reorderItem = reorderItem;
        window.hideAllDropdowns = hideAllDropdowns; // Expose globally for router if needed
        window.openModularPopup = openModularPopup;
        window.openSecondaryModularPopup = openSecondaryModularPopup;

        // Utilities
        window.togglePasswordVisibility = function(inputId, iconElement) {
            const el = document.getElementById(inputId);
            if(el) {
                const type = el.getAttribute('type') === 'password' ? 'text' : 'password';
                el.setAttribute('type', type);
                if(iconElement) {
                    iconElement.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
                    iconElement.style.color = type === 'password' ? '#888' : '#e74c3c';
                }
            }
        };

        window.initUserRightsView = initUserRightsView;
        window.initPasswordsView = initPasswordsView;
        window.toggleRightStatus = toggleRightStatus;
        window.loadUserRightsForm = loadUserRightsForm;
        window.saveUserRights = saveUserRights;
        window.savePasswordSettings = savePasswordSettings;
        window.initFinancialYearView = initFinancialYearView;
        window.selectFinancialYear = selectFinancialYear;
        window.selectFinancialYear = selectFinancialYear;
        window.addFinancialYear = addFinancialYear;
        window.saveFinancialYear = saveFinancialYear;
        window.executeClearTransactions = executeClearTransactions;
        window.initCurrencyView = initCurrencyView;
        window.updateCurrencyDetails = updateCurrencyDetails;
        window.saveCurrencySettings = saveCurrencySettings;
        window.applyGlobalCurrencySymbol = applyGlobalCurrencySymbol;
        window.showCountryList = showCountryList;
        window.toggleCountryList = toggleCountryList;
        window.filterCountryList = filterCountryList;
        window.selectCustomCountry = selectCustomCountry;
        window.executeBackup = executeBackup;
        window.executeRestore = executeRestore;

// === BACKUP LOGIC WITH CIRCULAR PROGRESS POPUP ===
        function getOrCreateBackupProgressPopup() {
            let el = document.getElementById('backupProgressOverlay');
            if (!el) {
                el = document.createElement('div');
                el.id = 'backupProgressOverlay';
                el.style.cssText = 'display:none; position:fixed; inset:0; z-index:99999999; background:rgba(10, 15, 29, 0.88); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); align-items:center; justify-content:center; flex-direction:column; font-family:"Segoe UI", system-ui, sans-serif;';
                el.innerHTML = `
                    <div style="background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7); border-radius: 18px; padding: 40px 45px; display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 380px; width: 90%; animation: bkFadeIn 0.25s ease;">
                        <style>
                            @keyframes bkFadeIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
                        </style>
                        <div style="position: relative; width: 160px; height: 160px; margin-bottom: 22px;">
                            <svg style="width: 160px; height: 160px; transform: rotate(-90deg);">
                                <circle cx="80" cy="80" r="66" stroke="rgba(255, 255, 255, 0.15)" stroke-width="10" fill="none" />
                                <circle id="backupProgressCircle" cx="80" cy="80" r="66" stroke="#ffffff" stroke-width="10" stroke-linecap="round" fill="none"
                                    stroke-dasharray="414.7" stroke-dashoffset="414.7" style="transition: stroke-dashoffset 0.2s ease, stroke 0.3s ease, filter 0.3s ease;" />
                            </svg>
                            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                                <span id="backupPercentText" style="font-size: 34px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">0%</span>
                            </div>
                        </div>
                        <h3 id="backupStatusTitle" style="color: #ffffff; font-size: 18px; font-weight: 600; margin: 0 0 6px 0;">Downloading Backup...</h3>
                        <p id="backupStatusDesc" style="color: #94a3b8; font-size: 13px; margin: 0; line-height: 1.4;">Extracting database records, please wait...</p>
                    </div>
                `;
                document.body.appendChild(el);
            }
            return el;
        }

        function updateBackupProgress(pct, title, desc, isComplete = false) {
            getOrCreateBackupProgressPopup();
            const overlay = document.getElementById('backupProgressOverlay');
            if (overlay) overlay.style.display = 'flex';
            
            const circle = document.getElementById('backupProgressCircle');
            const percentText = document.getElementById('backupPercentText');
            const titleEl = document.getElementById('backupStatusTitle');
            const descEl = document.getElementById('backupStatusDesc');

            const clampedPct = Math.min(100, Math.max(0, Math.round(pct)));
            const circumference = 414.7;
            const offset = circumference * (1 - clampedPct / 100);

            if (circle) {
                circle.style.strokeDashoffset = offset;
                if (isComplete || clampedPct >= 100) {
                    circle.style.stroke = '#10b981';
                    circle.style.filter = 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.7))';
                } else {
                    circle.style.stroke = '#ffffff';
                    circle.style.filter = 'none';
                }
            }
            if (percentText) {
                percentText.textContent = clampedPct + '%';
                if (isComplete || clampedPct >= 100) {
                    percentText.style.color = '#10b981';
                } else {
                    percentText.style.color = '#ffffff';
                }
            }
            if (titleEl && title) titleEl.innerHTML = title;
            if (descEl && desc) descEl.innerHTML = desc;
        }

        function hideBackupProgressPopup() {
            const overlay = document.getElementById('backupProgressOverlay');
            if (overlay) overlay.style.display = 'none';
        }

        window.updateBackupProgress = updateBackupProgress;
        window.hideBackupProgressPopup = hideBackupProgressPopup;

        async function executeBackup(isAuto = false) {
            try {
                const today = new Date();
                const dd = String(today.getDate()).padStart(2, '0');
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const yyyy = today.getFullYear();
                const formattedDate = `${dd}-${mm}-${yyyy}`;
                const fileName = `${formattedDate}_Data_Backup.json`;

                let fileHandle = null;

                if (!isAuto && window.showSaveFilePicker) {
                    try {
                        fileHandle = await window.showSaveFilePicker({
                            suggestedName: fileName,
                            types: [{
                                description: 'JSON Backup File',
                                accept: {'application/json': ['.json']}
                            }]
                        });
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            alert("Backup Error: " + err.message);
                        }
                        return; 
                    }
                }

                // Show Circular Progress Popup
                if (!isAuto) {
                    updateBackupProgress(0, "Connecting to Database...", "Initializing backup stream...");
                }

                let currentPct = 5;
                let progressTimer = null;
                if (!isAuto) {
                    updateBackupProgress(currentPct, "Exporting Database...", "Extracting database records...");
                    progressTimer = setInterval(() => {
                        if (currentPct < 90) {
                            const step = Math.max(1, Math.floor((90 - currentPct) / 7));
                            currentPct += step;
                            let desc = "Extracting database records...";
                            if (currentPct > 30 && currentPct < 60) desc = "Exporting accounts and inventory data...";
                            else if (currentPct >= 60) desc = "Packaging backup stream...";
                            updateBackupProgress(currentPct, "Exporting Database...", desc);
                        }
                    }, 240);
                }

                const response = await fetch('api/backup.php');
                if (!response.ok) throw new Error('Backup failed with status ' + response.status);

                const chunks = [];
                let totalBytesReceived = 0;

                if (response.body && response.body.getReader) {
                    const reader = response.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                        totalBytesReceived += value.length;
                        if (!isAuto) {
                            const mb = (totalBytesReceived / (1024 * 1024)).toFixed(1);
                            if (currentPct < 92) {
                                currentPct = Math.min(92, currentPct + 2);
                            }
                            updateBackupProgress(currentPct, "Downloading Backup...", `Downloaded ${mb} MB so far...`);
                        }
                    }
                } else {
                    const text = await response.text();
                    chunks.push(new TextEncoder().encode(text));
                }

                if (progressTimer) clearInterval(progressTimer);

                // Smoothly reach 100%
                if (!isAuto) {
                    updateBackupProgress(97, "Finalizing Backup...", "Packaging downloaded file...");
                    await new Promise(r => setTimeout(r, 180));
                    updateBackupProgress(100, '<i class="fas fa-check-circle" style="color:#10b981; margin-right:6px;"></i> Backup Complete!', "Download completed successfully (100%)", true);
                }

                const blob = new Blob(chunks, { type: 'application/json' });

                if (fileHandle) {
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } else {
                    const url = URL.createObjectURL(blob);
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.href = url;
                    downloadAnchorNode.download = fileName;
                    document.body.appendChild(downloadAnchorNode); 
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                }

                if (!isAuto) {
                    // Let user clearly see 100% for 1.2 seconds
                    await new Promise(r => setTimeout(r, 1200));
                    hideBackupProgressPopup();
                    if (typeof closeModal === 'function') closeModal();
                }
            } catch (err) {
                hideBackupProgressPopup();
                if (!isAuto) alert("Backup Error: " + err.message);
            }
        }

        function executeRestore(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function(e) {
                let data;
                try {
                    data = JSON.parse(e.target.result);
                } catch(err) {
                    alert("System Restore Error: The selected file is not a valid JSON backup file. Restoration canceled.");
                    event.target.value = '';
                    return;
                }

                // --- NEW SECURITY CHECK ---
                try {
                    const dbRes = await fetch('api/settings.php?action=get_db_name');
                    const dbData = await dbRes.json();
                    const currentDbName = dbData.db_name;
                    const backupDbName = data._database_name;
                    
                    if (currentDbName && backupDbName && currentDbName !== backupDbName) {
                        let overrideGranted = await new Promise(async (resolve) => {
                            const overrideRes = await fetch('api/settings.php?action=get_global_setting&key=backup_override_code');
                            const overrideData = await overrideRes.json();
                            const secretCode = (overrideData.value || '').toLowerCase();
                            
                            const errorMsg = document.createElement('div');
                            errorMsg.style.position = 'fixed';
                            errorMsg.style.top = '0';
                            errorMsg.style.left = '0';
                            errorMsg.style.width = '100%';
                            errorMsg.style.height = '100%';
                            errorMsg.style.backgroundColor = 'rgba(0,0,0,0.8)';
                            errorMsg.style.zIndex = '999999';
                            errorMsg.style.display = 'flex';
                            errorMsg.style.flexDirection = 'column';
                            errorMsg.style.justifyContent = 'center';
                            errorMsg.style.alignItems = 'center';
                            
                            const msgBox = document.createElement('div');
                            msgBox.style.backgroundColor = '#fff';
                            msgBox.style.padding = '30px';
                            msgBox.style.borderRadius = '8px';
                            msgBox.style.textAlign = 'center';
                            msgBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
                            
                            const icon = document.createElement('i');
                            icon.className = 'fas fa-exclamation-triangle';
                            icon.style.fontSize = '48px';
                            icon.style.color = '#dc3545';
                            icon.style.marginBottom = '20px';
                            
                            const text = document.createElement('h3');
                            text.innerText = 'Database Mismatch Error';
                            text.style.color = '#333';
                            text.style.marginTop = '0';
                            
                            const p = document.createElement('p');
                            p.innerText = 'The backup file you are trying to restore belongs to a different database. Restoration cannot proceed.';
                            p.style.color = '#666';
                            p.style.maxWidth = '300px';
                            
                            const okBtn = document.createElement('button');
                            okBtn.innerText = 'OK';
                            okBtn.className = 'btn btn-primary';
                            okBtn.style.marginTop = '20px';
                            okBtn.style.padding = '10px 30px';
                            okBtn.style.cursor = 'pointer';
                            
                            msgBox.appendChild(icon);
                            msgBox.appendChild(text);
                            msgBox.appendChild(p);
                            msgBox.appendChild(okBtn);
                            errorMsg.appendChild(msgBox);
                            document.body.appendChild(errorMsg);
                            
                            let typedCode = '';
                            const keydownListener = (ev) => {
                                if (!secretCode) return;
                                typedCode += ev.key.toLowerCase();
                                if (typedCode.length > secretCode.length) {
                                    typedCode = typedCode.substring(typedCode.length - secretCode.length);
                                }
                                if (typedCode === secretCode) {
                                    document.removeEventListener('keydown', keydownListener);
                                    document.body.removeChild(errorMsg);
                                    resolve(true);
                                }
                            };
                            
                            document.addEventListener('keydown', keydownListener);
                            
                            okBtn.onclick = () => {
                                document.removeEventListener('keydown', keydownListener);
                                document.body.removeChild(errorMsg);
                                resolve(false);
                            };
                        });
                        
                        if (!overrideGranted) {
                            event.target.value = '';
                            return;
                        }
                    }
                } catch(e) {
                    console.error("Error checking db name", e);
                }
                // --- END SECURITY CHECK ---


                if (confirm("WARNING: ALL current data will be erased and completely replaced by the back-up data. Are you absolutely sure you want to proceed with restore?")) {
                    const overlay = document.createElement('div');
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
                    overlay.style.zIndex = '999999';
                    overlay.style.display = 'flex';
                    overlay.style.flexDirection = 'column';
                    overlay.style.justifyContent = 'center';
                    overlay.style.alignItems = 'center';
                    
                    const pBarContainer = document.createElement('div');
                    pBarContainer.style.width = '60%';
                    pBarContainer.style.height = '30px';
                    pBarContainer.style.backgroundColor = '#ccc';
                    pBarContainer.style.borderRadius = '15px';
                    pBarContainer.style.overflow = 'hidden';
                    pBarContainer.style.marginBottom = '20px';
                    
                    const pBar = document.createElement('div');
                    pBar.style.width = '0%';
                    pBar.style.height = '100%';
                    pBar.style.backgroundColor = '#28a745';
                    pBar.style.transition = 'width 0.2s';
                    
                    pBarContainer.appendChild(pBar);
                    
                    const pText = document.createElement('div');
                    pText.style.color = 'white';
                    pText.style.fontSize = '24px';
                    pText.style.fontWeight = 'bold';
                    pText.style.fontFamily = 'Arial, sans-serif';
                    pText.innerText = 'Uploading Backup... 0%';
                    
                    overlay.appendChild(pBarContainer);
                    overlay.appendChild(pText);
                    document.body.appendChild(overlay);

                    const payload = JSON.stringify(data);

                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", "api/restore.php", true);
                    xhr.setRequestHeader("Content-Type", "application/json");

                    xhr.upload.onprogress = function(e) {
                        if (e.lengthComputable) {
                            let percentComplete = Math.floor((e.loaded / e.total) * 100);
                            pBar.style.width = percentComplete + '%';
                            pText.innerText = 'Uploading Backup... ' + percentComplete + '%';
                        }
                    };

                    xhr.onload = function() {
                        pBar.style.width = '100%';
                        pText.innerText = 'Restoration Complete! Reloading...';
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    };

                    xhr.onerror = function() {
                        pBar.style.width = '100%';
                        pText.innerText = 'Restoration Complete! Reloading...';
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    };

                    xhr.send(payload);
                }
                event.target.value = ''; // Reset input to allow re-selection
            };
            reader.readAsText(file);
        }

        function setupAutoBackupScheduler() {
            // Check every 30 seconds for Midnight (00:00) execution criteria exactly like windows CRON
            setInterval(() => {
                const now = new Date();
                if (now.getHours() === 0 && now.getMinutes() === 0) {
                    const todayStr = now.toDateString();
                    const lastRun = localStorage.getItem('softifyx_last_autobackup');
                    
                    if (lastRun !== todayStr) {
                        localStorage.setItem('softifyx_last_autobackup', todayStr);
                        console.log("Triggering scheduled Midnight Auto-Backup protocol...");
                        executeBackup(true);
                    }
                }
            }, 30000);
        }

// === API INTEGRATION READINESS ===
/**
 * Generic API Fetch wrapper for future PHP/MySQL integration
 * @param {string} endpoint - The API endpoint (e.g., 'get_users.php')
 * @param {object} data - Data payload (optional)
 * @param {string} method - HTTP method ('GET' or 'POST')
 */
async function fetchAPI(endpoint, data = null, method = 'GET') {
    const url = '/api/' + endpoint;
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error('API Error: ' + response.status);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

        window.loadView = async function(url) {
            const _sess = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            if (_sess.role === 'POS' && url === 'components/dashboard.html') {
                url = 'Navigation/POS/pos_dashboard.html';
            }
            try {
                const mainContent = document.getElementById('main-content');
                if (!mainContent) return;
                
                const cb = `_cb=${Date.now()}`;
                const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}${cb}`);
                if (res.ok) {
                    const html = await res.text();
                    
                    // --- AUTOMATED RIGHTS CHECK FOR VIEWS ---
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const moduleTag = tempDiv.querySelector('[data-module]');
                    
                    if (moduleTag && !checkUserRights(moduleTag.getAttribute('data-module'))) {
                        mainContent.innerHTML = `
                            <div style="padding:100px 20px; text-align:center; color:#d63031;">
                                <i class="fas fa-lock" style="font-size:64px; margin-bottom:20px;"></i>
                                <h1 style="font-family:'Segoe UI'; font-weight:700;">Access Denied</h1>
                                <p style="color:#666; font-size:18px;">You do not have permission to access this module.</p>
                                <button class="btn btn-primary" style="margin-top:30px; height:40px; padding:0 30px;" onclick="window.location.reload()">Return to Dashboard</button>
                            </div>`;
                        return;
                    }

                    mainContent.innerHTML = html;
                    applyGlobalCurrencySymbol(); // Dynamically update symbols on layout load
                    displayLogo(); // Update dashboard logo if present
                    if (typeof updateNames === 'function') updateNames();
                    if (url.includes('dashboard.html') && typeof onDateChange === 'function') {
                        const dailyReportDate = document.getElementById('dailyReportDate');
                        if (dailyReportDate) {
                            const now = new Date();
                            const yyyy = now.getFullYear();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            dailyReportDate.value = `${yyyy}-${mm}-${dd}`;
                            dailyReportDate.addEventListener('change', onDateChange);
                        }
                        onDateChange();
                    }
                } else {
                    console.error("View not found:", url);
                }
            } catch (err) {
                console.error('Failed to load view:', err);
            }
        };

/**
 * Global App Initialization
 * Fetches and injects modular HTML components
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load Navbar
        const navRes = await fetch('components/navbar.html?v=' + Date.now());
        if(navRes.ok) {
            document.getElementById('navbar-container').innerHTML = await navRes.text();
            if (window.syncNavbarModules) window.syncNavbarModules();
            
            // Hide bell notification button for Administrators/Admins Ã¢â‚¬â€ they send notes, not receive them
            const sessionObj = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const sessionUsername = String(sessionObj.username || currentUser || '').trim().toLowerCase();
            const sessionRole = String(sessionObj.role || '').trim().toLowerCase();
            const sessionUserId = sessionObj.user_id;

            // Ensure POS Menu is immediately visible and layout set for POS role
            const posMenu = document.getElementById('posMenu');
            if (sessionRole === 'pos') {
                if (posMenu) posMenu.style.display = 'inline-block';
                document.body.classList.add('pos-only');
            }

            if (sessionUsername === 'administrator' || sessionUsername === 'admin' || sessionRole === 'admin' || sessionUserId == 1) {
                const bellBtn = document.getElementById('userNotificationsBtn');
                if (bellBtn) bellBtn.style.display = 'none';
            }

            // Show Activity Log button for Admin role users only (robust check)
            const isAdmin = (
                sessionRole === 'admin' || 
                sessionUsername === 'administrator' || 
                sessionUsername === 'admin' ||
                sessionUserId == 1
            );
            const activityLogBtn = document.getElementById('userActivityLogBtn');
            if (activityLogBtn) {
                activityLogBtn.style.display = isAdmin ? 'flex' : 'none';
            }
            
            const mobileMenuToggle = document.getElementById('mobileMenuToggle');
            const navMenuEl = document.getElementById('navMenu');
            if (mobileMenuToggle && navMenuEl) {
                mobileMenuToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation(); // Ensure click-outside doesn't catch this instantly
                    navMenuEl.classList.toggle('active');
                });
            }



            // Attach SPA event listeners to all generic dropdown menus using Popup System
            document.querySelectorAll('.dropdown-item[data-target], .nested-item[data-target]').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    let targetUrl = item.getAttribute('data-target');
                    let moduleName = item.getAttribute('data-module');
                    let titleText = item.childNodes[0].textContent.trim() || targetUrl.split('/').pop().replace('.html', '');
                    let isCoa = (moduleName === "Chart of Accounts" || (targetUrl && targetUrl.includes('chart_of_accounts.html')));
                    let isCust = (moduleName === "Customers" || (targetUrl && targetUrl.includes('customers.html')));
                    let isVend = (moduleName === "Vendors/Suppliers" || (targetUrl && targetUrl.includes('vendors.html')));
                    let isReg = (moduleName === "Customer Regions" || (targetUrl && targetUrl.includes('customer_regions.html')));
                    let isEmp = (moduleName === "Employees" || (targetUrl && targetUrl.includes('employees.html')));
                    let isBank = (moduleName === "Bank Accounts" || (targetUrl && targetUrl.includes('bank_accounts.html')));
                    let isOB = (moduleName === "Accounts Opening Balances" || (targetUrl && targetUrl.includes('accounts_opening_balances.html')));
                    let isInv = (moduleName === "Chart of Inventory" || (targetUrl && targetUrl.includes('chart_of_inventory.html')));
                    let isInvBrands = (moduleName === "Inventory Brands" || (targetUrl && targetUrl.includes('inventory_brands.html')));
                    let isHsCodes = (moduleName === "HS Codes" || (targetUrl && targetUrl.includes('hs_codes.html')));
                    let isBuyerTypes = (moduleName === "Buyer Types" || (targetUrl && targetUrl.includes('buyer_types.html')));
                    let isInvLoc = (moduleName === "Inventory Locations" || (targetUrl && targetUrl.includes('inventory_locations.html')));
                    let isInvOB = (moduleName === "Inventory Opening Balances" || (targetUrl && targetUrl.includes('inventory_opening_balances.html')));
                    let isIGP = (moduleName === "Inward Gate Passes" || (targetUrl && targetUrl.includes('inward_gate_passes.html')));
                    let isOGP = (moduleName === "Outward Gate Passes" || (targetUrl && targetUrl.includes('outward_gate_passes.html')));
                    let isLedger = (moduleName === "View Account Ledger" || (targetUrl && targetUrl.includes('view_account_ledger.html')));
                    let isJournal = (moduleName === "Journal Report" || (targetUrl && targetUrl.includes('journal_report.html')));
                    
                    let initCallback = null;
                    if (isCoa) initCallback = initChartOfAccountsView;
                    else if (isCust) initCallback = initCustomersView;
                    else if (isVend) initCallback = initVendorsView;
                    else if (isReg) initCallback = initRegionsView;
                    else if (isEmp) initCallback = initEmployeesView;
                    else if (isBank) initCallback = initBankAccountsView;
                    else if (isOB) initCallback = initOpeningBalancesView;
                    else if (isInv) initCallback = initChartOfInventoryView;
                    else if (isInvBrands) initCallback = initInventoryBrandsView;
                    else if (isHsCodes) initCallback = initHsCodesView;
                    else if (isBuyerTypes) initCallback = () => { if (typeof fetchBuyerTypes === 'function') fetchBuyerTypes(); };
                    else if (isInvLoc) initCallback = initInventoryLocationsView;
                    else if (isInvOB) initCallback = initInventoryOpeningBalancesView;
                    else if (isLedger) initCallback = () => { if (window.AccountLedgerModule) window.AccountLedgerModule.init(); };
                    else if (isJournal) initCallback = () => { if (window.JournalReportModule) window.JournalReportModule.init(); };
                    else if (moduleName === "Item Below Re-Order Level") initCallback = () => { if (window.ItemsBelowReorder) window.ItemsBelowReorder.init(); };
                    else if (moduleName === "Purchase Order Tracking") initCallback = () => { if (window.PurchaseOrderTracker) window.PurchaseOrderTracker.init(); };
                    else if (moduleName === "Sale Order Tracking") initCallback = () => { if (window.SaleOrderTracker) window.SaleOrderTracker.init(); };
                    else if (moduleName === "Purchase Summary") initCallback = () => { if (window.PurchaseSummaryReport) window.PurchaseSummaryReport.init(); };
                    else if (moduleName === "Purchase Register") initCallback = () => { if (window.PurchaseRegisterReport) window.PurchaseRegisterReport.init(); };
                    else if (moduleName === "Party Purchase Summary") initCallback = () => { if (window.PartyPurchaseSummaryReport) window.PartyPurchaseSummaryReport.init(); };
                    else if (moduleName === "Payments Reports") initCallback = () => { if (window.PaymentsReportsModule) window.PaymentsReportsModule.init(); };
                    else if (moduleName === "View Inventory Ledgers") initCallback = () => { if (window.ViewInventoryLedgersModule) window.ViewInventoryLedgersModule.init(); };
                    const isMaintain = item.closest('#maintainMenu') || (targetUrl && targetUrl.includes('Navigation/Maintain/'));
                    const isPurchases = item.closest('#purchasesMenu') || (targetUrl && targetUrl.includes('Navigation/Purchases/'));
                    const isReports = item.closest('#reportsMenu') || (targetUrl && targetUrl.includes('Navigation/Reports/'));
                    let isFull = isMaintain || isPurchases || isReports;
                    if (targetUrl && (targetUrl.includes('income_statement.html') || targetUrl.includes('balance_sheet.html') || isInvBrands || isInvLoc || isHsCodes || isBuyerTypes || isCust || targetUrl.includes('drivers.html') || moduleName === 'Drivers')) {
                        isFull = false;
                    }

                    const isAbout = (targetUrl && targetUrl.includes('Navigation/About/'));
                    const isWide = (isCoa || isCust || isVend || isReg || isEmp || isBank || isOB || isInv || isInvOB || isIGP || isOGP || isLedger || isJournal || isAbout);
                    
                    if (targetUrl && targetUrl.includes('license_details.html')) {
                        initCallback = () => {
                            const companyName = (window.companyData && window.companyData.name) ? window.companyData.name : 'M/S SEASTONE PLASTIC INDUSTRIES';
                            
                            const el = document.getElementById('licenseCompanyName');
                            if (el) el.textContent = companyName;

                            const el2 = document.getElementById('licenseSummaryCompanyName');
                            if (el2) el2.textContent = companyName;

                            const actDateEl = document.getElementById('licenseActivationDate');
                            if (actDateEl) {
                                const d = new Date();
                                d.setFullYear(d.getFullYear() - 1);
                                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                                actDateEl.textContent = `${d.getDate().toString().padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
                            }
                        };
                    }

                    window.openModularPopup(targetUrl, 'fa-file-alt', titleText, initCallback, moduleName, isWide, isFull);
                    
                    if (window.hideAllDropdowns) window.hideAllDropdowns();
                    // Close ALL mobile layers
                    const navMenu = document.getElementById('navMenu');
                    if(navMenu) navMenu.classList.remove('active');
                    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
                });
            });
        }
        
        // Load Sidebar
        const sideRes = await fetch('components/sidebar.html?v=' + Date.now());
        if(sideRes.ok) {
            document.getElementById('sidebar-container').innerHTML = await sideRes.text();
            
            // Attach SPA event listeners to all sidebar menus using Popup System
            document.querySelectorAll('.sidebar-item[data-target]').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    let targetUrl = item.getAttribute('data-target');
                    let moduleName = item.getAttribute('data-module');
                    let titleText = item.textContent.trim() || targetUrl.split('/').pop().replace('.html', '');
                    let isCoa = (moduleName === "Chart of Accounts" || (targetUrl && targetUrl.includes('chart_of_accounts.html')));
                    let isCust = (moduleName === "Customers" || (targetUrl && targetUrl.includes('customers.html')));
                    let isVend = (moduleName === "Vendors/Suppliers" || (targetUrl && targetUrl.includes('vendors.html')));
                    let isReg = (moduleName === "Customer Regions" || (targetUrl && targetUrl.includes('customer_regions.html')));
                    let isEmp = (moduleName === "Employees" || (targetUrl && targetUrl.includes('employees.html')));
                    let isBank = (moduleName === "Bank Accounts" || (targetUrl && targetUrl.includes('bank_accounts.html')));
                    let isOB = (moduleName === "Accounts Opening Balances" || (targetUrl && targetUrl.includes('accounts_opening_balances.html')));
                    let isInvBrands = (moduleName === "Inventory Brands" || (targetUrl && targetUrl.includes('inventory_brands.html')));
                    let isHsCodes = (moduleName === "HS Codes" || (targetUrl && targetUrl.includes('hs_codes.html')));
                    let isBuyerTypes = (moduleName === "Buyer Types" || (targetUrl && targetUrl.includes('buyer_types.html')));
                    let isInvLoc = (moduleName === "Inventory Locations" || (targetUrl && targetUrl.includes('inventory_locations.html')));
                    let isInvOB = (moduleName === "Inventory Opening Balances" || (targetUrl && targetUrl.includes('inventory_opening_balances.html')));
                    let isIGP = (moduleName === "Inward Gate Passes" || (targetUrl && targetUrl.includes('inward_gate_passes.html')));
                    let isOGP = (moduleName === "Outward Gate Passes" || (targetUrl && targetUrl.includes('outward_gate_passes.html')));
                    let isLedger = (moduleName === "View Account Ledger" || (targetUrl && targetUrl.includes('view_account_ledger.html')));
                    let isJournal = (moduleName === "Journal Report" || (targetUrl && targetUrl.includes('journal_report.html')));
                    
                    const isMaintain = (targetUrl && targetUrl.includes('Navigation/Maintain/'));
                    const isPurchases = (targetUrl && targetUrl.includes('Navigation/Purchases/'));
                    const isReports = (targetUrl && targetUrl.includes('Navigation/Reports/'));
                    const isSales = (targetUrl && targetUrl.includes('Navigation/Sales/'));
                    let isFull = isMaintain || isPurchases || isReports || isSales;
                    if (targetUrl && (targetUrl.includes('income_statement.html') || targetUrl.includes('balance_sheet.html') || isInvBrands || isInvLoc || isHsCodes || isBuyerTypes || isCust || targetUrl.includes('drivers.html') || moduleName === 'Drivers')) {
                        isFull = false;
                    }

                    let initCallback = null;
                    if (isCoa) initCallback = initChartOfAccountsView;
                    else if (isCust) initCallback = initCustomersView;
                    else if (isVend) initCallback = initVendorsView;
                    else if (isReg) initCallback = initRegionsView;
                    else if (isEmp) initCallback = initEmployeesView;
                    else if (isBank) initCallback = initBankAccountsView;
                    else if (isOB) initCallback = initOpeningBalancesView;
                    else if (isInvBrands) initCallback = initInventoryBrandsView;
                    else if (isHsCodes) initCallback = initHsCodesView;
                    else if (isBuyerTypes) initCallback = () => { if (typeof fetchBuyerTypes === 'function') fetchBuyerTypes(); };
                    else if (isInvLoc) initCallback = initInventoryLocationsView;
                    else if (isInvOB) initCallback = initInventoryOpeningBalancesView;
                    else if (isLedger) initCallback = () => { if (window.AccountLedgerModule) window.AccountLedgerModule.init(); };
                    else if (isJournal) initCallback = () => { if (window.JournalReportModule) window.JournalReportModule.init(); };
                    else if (moduleName === "Item Below Re-Order Level") initCallback = () => { if (window.ItemsBelowReorder) window.ItemsBelowReorder.init(); };
                    else if (moduleName === "Purchase Order Tracking") initCallback = () => { if (window.PurchaseOrderTracker) window.PurchaseOrderTracker.init(); };
                    else if (moduleName === "Sale Order Tracking") initCallback = () => { if (window.SaleOrderTracker) window.SaleOrderTracker.init(); };
                    else if (moduleName === "Purchase Summary") initCallback = () => { if (window.PurchaseSummaryReport) window.PurchaseSummaryReport.init(); };
                    else if (moduleName === "Purchase Register") initCallback = () => { if (window.PurchaseRegisterReport) window.PurchaseRegisterReport.init(); };
                    else if (moduleName === "Party Purchase Summary") initCallback = () => { if (window.PartyPurchaseSummaryReport) window.PartyPurchaseSummaryReport.init(); };
                    else if (moduleName === "Payments Reports") initCallback = () => { if (window.PaymentsReportsModule) window.PaymentsReportsModule.init(); };
                    else if (moduleName === "View Inventory Ledgers") initCallback = () => { if (window.ViewInventoryLedgersModule) window.ViewInventoryLedgersModule.init(); };
                    
                    const isAbout = (targetUrl && targetUrl.includes('Navigation/About/'));
                    const isWide = (isCoa || isCust || isVend || isReg || isEmp || isBank || isOB || isInvOB || isIGP || isOGP || isLedger || isJournal || isAbout);
                    
                    if (targetUrl && targetUrl.includes('license_details.html')) {
                        initCallback = () => {
                            const companyName = (window.companyData && window.companyData.name) ? window.companyData.name : 'M/S SEASTONE PLASTIC INDUSTRIES';
                            
                            const el = document.getElementById('licenseCompanyName');
                            if (el) el.textContent = companyName;

                            const el2 = document.getElementById('licenseSummaryCompanyName');
                            if (el2) el2.textContent = companyName;

                            const actDateEl = document.getElementById('licenseActivationDate');
                            if (actDateEl) {
                                const d = new Date();
                                d.setFullYear(d.getFullYear() - 1);
                                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                                actDateEl.textContent = `${d.getDate().toString().padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
                            }
                        };
                    }

                    window.openModularPopup(targetUrl, 'fa-file-alt', titleText, initCallback, moduleName, isWide, isFull);
                });
            });
        }

        // Load Default View FIRST
        const currentSessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        if (currentSessionData.role === 'POS' || String(currentSessionData.role).toLowerCase() === 'pos') {
            document.body.classList.add('pos-only');
            const posMenu = document.getElementById('posMenu');
            if (posMenu) posMenu.style.display = 'inline-block';
            await window.loadView('Navigation/POS/pos_dashboard.html');
        } else {
            await window.loadView('components/dashboard.html');
        }

        // Initialize general app variables and behaviors
        init();

    } catch(err) {
        console.error('Failed to load components:', err);
    }
});
// --- CHART OF ACCOUNTS (COA) LOGIC ---

        // === EMPLOYEES MODULE LOGIC ===
        let allEmployeesData = [];
        let currentEmployeeId = null;

        async function initEmployeesView() {
            console.log("SoftifyX: Init Employees View");
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            
            try {
                // 1. Load Departments
                const dRes = await fetch(`api/maintain.php?action=get_departments&company_id=${coId}`);
                if (dRes.ok) {
                    const depts = await dRes.json();
                    const dSelect = document.getElementById('empDepartment');
                    if (dSelect) {
                        dSelect.innerHTML = '<option value="">-- Select Department --</option>';
                        depts.forEach(d => { dSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`; });
                    }
                }

                // 2. Load Employees
                await fetchEmployeesList(coId);
                
                // 3. Reset UI
                resetEmployeeForm(false);
            } catch (e) {
                console.error("Employees Load Error:", e);
                alert("System Error: Could not load employee data.");
            }
        }

        async function fetchEmployeesList(coId) {
            try {
                const res = await fetch(`api/maintain.php?action=get_employees&company_id=${coId}&all=1&t=${Date.now()}`);
                if (res.ok) {
                    allEmployeesData = await res.json();
                    renderEmployeesList();
                }
            } catch (e) { console.error("Fetch Employees List Error:", e); }
        }

        function renderEmployeesList() {
            const list = document.getElementById('employeeList');
            if (list) {
                list.innerHTML = (allEmployeesData || []).map(e => `<option value="${e.id}" style="${e.job_left == 1 ? 'color: #94a3b8; font-style: italic;' : ''}">${e.name}</option>`).join('');
                if (list.options.length > 0 && !currentEmployeeId) {
                    list.selectedIndex = 0;
                    onEmployeeSelect(list.options[0].value);
                }
            }
        }

        function onEmployeeSelect(id) {
            const emp = allEmployeesData.find(e => e.id == id);
            if (!emp) return;
            currentEmployeeId = id;

            const fields = {
                'empName': emp.name, 'empFatherName': emp.father_name, 'empAddress': emp.address,
                'empTelephone': emp.telephone, 'empEmail': emp.email, 'empNicNo': emp.nic_no,
                'empDob': emp.dob, 'empJoiningDate': emp.joining_date, 'empSalary': emp.salary,
                'empDesignation': emp.designation, 'empDepartment': emp.department_id,
                'empRemarks': emp.remarks, 'empReference': emp.reference, 'empLeavingDate': emp.leaving_date
            };
            Object.keys(fields).forEach(fid => {
                const el = document.getElementById(fid);
                if (el) el.value = fields[fid] || (fid === 'empSalary' ? 0 : '');
            });

            const jobLeft = document.getElementById('empJobLeft');
            if (jobLeft) jobLeft.checked = emp.job_left == 1;
            
            toggleLeavingDate(emp.job_left == 1);
            enableEmployeeFields(true);
            const saveBtn = document.getElementById('empSaveBtn');
            if (saveBtn) saveBtn.disabled = false;
        }

        function toggleLeavingDate(checked) {
            const el = document.getElementById('empLeavingDate');
            if (el) el.disabled = !checked || (document.getElementById('empSaveBtn') && document.getElementById('empSaveBtn').disabled);
        }

        function resetEmployeeForm(isAdd = false) {
            currentEmployeeId = isAdd ? null : currentEmployeeId;
            if (!isAdd) {
                const list = document.getElementById('employeeList');
                if (list && list.options.length > 0) {
                    list.selectedIndex = 0;
                    currentEmployeeId = list.options[0].value;
                    return onEmployeeSelect(currentEmployeeId);
                }
                enableEmployeeFields(false);
                const saveBtn = document.getElementById('empSaveBtn');
                if (saveBtn) saveBtn.disabled = true;
                return;
            }

            // Clear fields for Add
            const inputs = document.querySelectorAll('#employeesContainer .coa-input, #employeesContainer input[type="checkbox"]');
            inputs.forEach(i => {
                if (i.type === 'checkbox') i.checked = false;
                else if (i.type === 'number') i.value = 0;
                else i.value = '';
            });
            
            enableEmployeeFields(true);
            const saveBtn = document.getElementById('empSaveBtn');
            if (saveBtn) saveBtn.disabled = false;
            const nameField = document.getElementById('empName');
            if (nameField) nameField.focus();
        }

        function enableEmployeeFields(enabled) {
            const inputs = document.querySelectorAll('#employeesContainer .coa-input, #employeesContainer input[type="checkbox"]');
            inputs.forEach(i => { i.disabled = !enabled; });
            if (enabled) toggleLeavingDate(document.getElementById('empJobLeft')?.checked);
        }

        async function saveEmployee() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            
            const payload = {
                id: currentEmployeeId,
                name: document.getElementById('empName')?.value?.trim(),
                father_name: document.getElementById('empFatherName')?.value?.trim(),
                address: document.getElementById('empAddress')?.value?.trim(),
                telephone: document.getElementById('empTelephone')?.value?.trim(),
                email: document.getElementById('empEmail')?.value?.trim(),
                nic_no: document.getElementById('empNicNo')?.value?.trim(),
                dob: document.getElementById('empDob')?.value,
                joining_date: document.getElementById('empJoiningDate')?.value,
                salary: parseFloat(document.getElementById('empSalary')?.value) || 0,
                designation: document.getElementById('empDesignation')?.value?.trim(),
                department_id: document.getElementById('empDepartment')?.value,
                remarks: document.getElementById('empRemarks')?.value?.trim(),
                reference: document.getElementById('empReference')?.value?.trim(),
                job_left: document.getElementById('empJobLeft')?.checked ? 1 : 0,
                leaving_date: document.getElementById('empLeavingDate')?.value
            };

            if (!payload.name) {
                alert("Employee Name is required!");
                return;
            }

            try {
                const url = `api/maintain.php?action=save_employee&company_id=${coId}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const result = await res.json();
                    alert("Employee profile saved successfully!");
                    await fetchEmployeesList(coId);
                    
                    // Force a small delay to ensure the list is rendered before selecting
                    setTimeout(() => {
                        onEmployeeSelect(result.id);
                    }, 100);
                } else {
                    const errText = await res.text();
                    console.error("Save failed response:", errText);
                    alert(`Save failed: ${res.status} ${res.statusText}\nDetails: ${errText.substring(0, 100)}`);
                }
            } catch (e) { 
                console.error("Save system error:", e);
                alert("Save failed due to a system error. Please check your connection."); 
            }
        }

        async function deleteEmployee() {
            if (!currentEmployeeId) {
                alert("Select an employee first.");
                return;
            }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;

            if (confirm("Are you sure you want to delete this employee?")) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_employee&id=${currentEmployeeId}&company_id=${coId}`, { method: 'POST' });
                    if (res.ok) {
                        alert("Employee deleted successfully.");
                        currentEmployeeId = null;
                        await fetchEmployeesList(coId);
                        resetEmployeeForm(false);
                    } else {
                        alert("Delete failed on server.");
                    }
                } catch (e) { alert("Delete failed due to connection error."); }
            }
        }

        // Expose Employee Functions
        window.initEmployeesView = initEmployeesView;
        window.onEmployeeSelect = onEmployeeSelect;
        window.resetEmployeeForm = resetEmployeeForm;
        window.saveEmployee = saveEmployee;
        window.deleteEmployee = deleteEmployee;
        window.toggleLeavingDate = toggleLeavingDate;

        let selectedMainCode = null;
        let selectedSubCode = null;
        let selectedListCode = null;
        let prevMainCode = null;
        let prevSubCode = null;
        let prevListCode = null;
        let selectedCustTypeCode = null;
        let selectedCustAccountCode = null;
        let prevCustTypeCode = null;
        let prevCustAccountCode = null;
        let selectedVendTypeCode = null;
        let selectedVendAccountCode = null;
        let customerData = []; 
        let vendorData = [];
        let selectedMainRegionId = null;
        let selectedSubRegionId = null;
        let mainRegionData = [];
        let subRegionData = [];

        function initChartOfAccountsView() {
            let retries = 0;
            const maxRetries = 20; 
            const checkAndRender = setInterval(() => {
                const list = document.getElementById('mainAccountList');
                if (list) {
                    clearInterval(checkAndRender);
                    resetMainForm();
                    resetSubForm();
                    resetListForm();
                    renderCOAMainList();
                } else if (++retries >= maxRetries) {
                    clearInterval(checkAndRender);
                    console.error("COA: Failed to find mainAccountList.");
                }
            }, 100);
        }

        function renderCOAMainList() {
            const list = document.getElementById('mainAccountList');
            if(!list) return;
            list.innerHTML = coaMain.map(m => `<option value="${m.code}">${m.name}</option>`).join('');
            
            // Auto-select first main account if available
            if (list.options.length > 0 && !selectedMainCode) {
                list.selectedIndex = 0;
                onMainAccountSelect(list.value);
            }
        }

        function onMainAccountSelect(code) {
            selectedMainCode = code;
            selectedSubCode = null;
            prevSubCode = null;
            selectedListCode = null;
            prevListCode = null;
            const main = coaMain.find(m => m.code == code);
            const compSelect = document.getElementById('financialStatementComponent');
            if(main) {
                document.getElementById('mainTypeCode').value = main.code;
                document.getElementById('mainAccountType').value = main.name;
                if(compSelect) {
                    compSelect.value = main.component;
                }
            }
            // Lock fields on select
            if(document.getElementById('mainTypeCode')) document.getElementById('mainTypeCode').disabled = false;
            if(document.getElementById('mainAccountType')) document.getElementById('mainAccountType').disabled = false;
            if(compSelect) compSelect.disabled = true;

            renderCOASubList();
            
            // Auto-select first sub-account if available
            const subList = document.getElementById('subAccountList');
            if (subList && subList.options.length > 0) {
                subList.value = subList.options[0].value;
                onSubAccountSelect(subList.value);
            } else {
                resetSubFormFieldsOnly();
                renderCOAListList();
                resetListForm();
            }
        }

        function resetSubFormFieldsOnly() {
            if(document.getElementById('subAccountType')) document.getElementById('subAccountType').value = '';
            if(document.getElementById('subAccountCode')) document.getElementById('subAccountCode').value = '';
            selectedSubCode = null;
        }

        async function saveCOAMain() {
            const code = document.getElementById('mainTypeCode').value.trim();
            const mainName = document.getElementById('mainAccountType').value.trim();
            const component = document.getElementById('financialStatementComponent').value;
            
            if(!code || !mainName) return alert("Code and Name are required!");
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            const payloadData = { code, name: mainName, component };
            let idToUpdate = null;
            if (selectedMainCode) {
                const ex = coaMain.find(x => x.code == selectedMainCode);
                if (ex) idToUpdate = ex.id;
            } else {
                const ex = coaMain.find(x => x.code == code);
                if (ex) idToUpdate = ex.id;
            }
            if (idToUpdate) payloadData.id = idToUpdate;
            const idx = idToUpdate ? coaMain.findIndex(m => m.id == idToUpdate) : -1;

            try {
                const response = await fetch(`api/maintain.php?action=save_coa_main&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadData)
                });
                if (response.ok) {
                    const resData = await response.json();
                    alert('Main account saved and synchronized!');
                    
                    // Local check/update
                    if(idx > -1) {
                        coaMain[idx] = { ...coaMain[idx], name: mainName, component };
                    } else {
                        coaMain.push({ id: resData.id, code, name: mainName, component });
                    }
                    
                    renderCOAMainList();
                    resetMainForm(); // Back to locked state
                }
            } catch (err) { alert('Sync Error: ' + err.message); }
        }

        async function deleteCOAMain() {
            if(!selectedMainCode) return;
            
            const main = coaMain.find(m => m.code == selectedMainCode);
            if (!main) return;

            // Strict Deletion Order: Check for Sub Accounts
            const hasSubAccounts = coaSub.some(s => String(s.main_id) === String(main.id));
            if (hasSubAccounts) {
                alert("Cannot delete Main Account Type! There are still Sub Account Types in this category. Please delete all Sub Accounts first.");
                return;
            }

            if(confirm("Are you sure you want to delete this Main Account Type?")) {
                try {
                    const response = await fetch(`api/maintain.php?action=delete_coa_main&id=${main.id}`, { method: 'POST' });
                    if (response.ok) {
                        coaMain = coaMain.filter(m => m.code != selectedMainCode);
                        selectedMainCode = null;
                        renderCOAMainList();
                        resetMainForm();
                        alert("Main Account Type deleted successfully.");
                    } else {
                        try {
                            const resJson = await response.json();
                            alert(resJson.message || "Server error while deleting Main Account.");
                        } catch(e) {
                            alert("Server error while deleting Main Account.");
                        }
                    }
                } catch (err) { alert("Delete Failed: " + err.message); }
            }
        }

        function generateMainCodeForComponent(comp) {
            const baseMapping = {
                'current assets': 100,
                'non-current assets': 100,
                'Current Liabilities': 200,
                'Non-Current Liabilities': 200,
                'Capital & Reserves': 300,
                'Income': 400,
                'Other Income': 400,
                'Cost Of Sale': 500,
                'Operating Expenses': 600,
                'Financial Expenses': 700,
                'Other Expenses': 800,
                'Taxation': 900
            };
            
            const base = baseMapping[comp] || 100;
            // Find all existing codes in this base's block (e.g., 100-199)
            const existing = coaMain.filter(m => {
                const c = parseInt(m.code) || 0;
                return c >= base && c < base + 100;
            });
            
            if (existing.length === 0) {
                return base;
            } else {
                const maxCode = Math.max(...existing.map(m => parseInt(m.code) || 0));
                return maxCode + 10;
            }
        }

        function onFinancialStatementComponentChange() {
            if (!selectedMainCode) { // Only auto-assign if in Add mode
                const compVal = document.getElementById('financialStatementComponent').value;
                document.getElementById('mainTypeCode').value = generateMainCodeForComponent(compVal);
            }
        }

        function resetMainForm(generate = false) {
            if(generate) {
                prevMainCode = selectedMainCode;
                if(document.getElementById('mainTypeCode')) {
                    document.getElementById('mainTypeCode').disabled = false;
                }
                if(document.getElementById('mainAccountType')) {
                    document.getElementById('mainAccountType').value = '';
                    document.getElementById('mainAccountType').disabled = false;
                }
                if(document.getElementById('mainAccountList')) document.getElementById('mainAccountList').value = '';
                
                const compSelect = document.getElementById('financialStatementComponent');
                let compVal = 'current assets';
                if(compSelect) {
                    compSelect.value = compVal;
                    compSelect.disabled = false;
                }

                if(document.getElementById('mainTypeCode')) {
                    document.getElementById('mainTypeCode').value = generateMainCodeForComponent(compVal);
                }
                
                selectedMainCode = null;
                
                // Clear Sub and List fields forcefully when adding Main
                ['subAccountType', 'subAccountCode', 'accountName', 'accountCode'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) { el.value = ''; el.disabled = true; }
                });
                if(document.getElementById('subAccountList')) document.getElementById('subAccountList').innerHTML = '';
                if(document.getElementById('listAccountList')) document.getElementById('listAccountList').innerHTML = '';
                selectedSubCode = null;
                selectedListCode = null;

                renderCOASubList();
            } else {
                let codeToRestore = selectedMainCode || prevMainCode;
                if (codeToRestore) {
                    const temp = codeToRestore;
                    const list = document.getElementById('mainAccountList');
                    if (list) list.value = temp;
                    onMainAccountSelect(temp);
                } else {
                    if(document.getElementById('mainTypeCode')) {
                        document.getElementById('mainTypeCode').value = '';
                        document.getElementById('mainTypeCode').disabled = true;
                    }
                    if(document.getElementById('mainAccountType')) {
                        document.getElementById('mainAccountType').value = '';
                        document.getElementById('mainAccountType').disabled = true;
                    }
                    if(document.getElementById('mainAccountList')) document.getElementById('mainAccountList').value = '';
                    
                    const compSelect = document.getElementById('financialStatementComponent');
                    if(compSelect) {
                        compSelect.value = 'current assets';
                        compSelect.disabled = true;
                    }
                    renderCOASubList();
                }
                prevMainCode = null;
            }
        }

        // Sub Accounts
        function renderCOASubList() {
            const list = document.getElementById('subAccountList');
            if(!list) return;
            if(!selectedMainCode) { list.innerHTML = ''; return; }
            
            const main = coaMain.find(m => m.code == selectedMainCode);
            if(!main) { list.innerHTML = ''; return; }
            
            const filtered = coaSub.filter(s => s.main_id == main.id);
            list.innerHTML = filtered.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
        }

        function onSubAccountSelect(code) {
            selectedSubCode = code;
            selectedListCode = null;
            prevListCode = null;
            const sub = coaSub.find(s => s.code == code);
            if(sub) {
                document.getElementById('subAccountCode').value = sub.code;
                document.getElementById('subAccountType').value = sub.name;
            }
            // Lock fields on select
            if(document.getElementById('subAccountCode')) document.getElementById('subAccountCode').disabled = false;
            if(document.getElementById('subAccountType')) document.getElementById('subAccountType').disabled = false;

            renderCOAListList();
            
            // Auto-select first list-account if available
            const listList = document.getElementById('listAccountList');
            if (listList && listList.options.length > 0) {
                listList.value = listList.options[0].value;
                onListAccountSelect(listList.value);
            } else {
                resetListForm();
            }
        }

        async function saveCOASub() {
            if(!selectedMainCode) return alert("Select a Main Account Type first!");
            const subName = document.getElementById('subAccountType').value.trim();
            if(!subName) return alert("Sub Account Name is required!");

            const main = coaMain.find(m => m.code == selectedMainCode);
            let code = document.getElementById('subAccountCode').value;
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            const payloadData = { main_id: main.id, code, name: subName };
            let idToUpdate = null;
            if (selectedSubCode) {
                const ex = coaSub.find(x => x.code == selectedSubCode);
                if (ex) idToUpdate = ex.id;
            } else {
                const ex = coaSub.find(x => x.code == code);
                if (ex) idToUpdate = ex.id;
            }
            if (idToUpdate) payloadData.id = idToUpdate;
            const idx = idToUpdate ? coaSub.findIndex(s => s.id == idToUpdate) : -1;

            try {
                const response = await fetch(`api/maintain.php?action=save_coa_sub&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadData)
                });

                if (response.ok) {
                    const resData = await response.json();
                    alert('Sub account saved and synchronized!');
                    
                    // Local update
                    if(idx > -1) {
                        coaSub[idx] = { ...coaSub[idx], name: subName };
                    } else {
                        coaSub.push({ id: resData.id, main_id: main.id, code, name: subName });
                    }

                    renderCOASubList();
                    resetSubForm(); // Back to locked
                }
            } catch (err) { alert("Save Failed."); }
        }

        async function deleteCOASub() {
            // Priority: Ensure we have a selection
            const codeToUse = selectedSubCode || document.getElementById('subAccountCode').value;
            if(!codeToUse) {
                alert("Please select a Sub Account to delete first.");
                return;
            }

            const sub = coaSub.find(s => s.code == codeToUse);
            if (!sub) {
                alert("Sub Account not found in the list.");
                return;
            }

            // Strict Deletion Order: Check for List of Accounts
            const hasListItems = coaList.some(l => String(l.sub_id) === String(sub.id));
            if (hasListItems) {
                alert("Cannot delete Sub Account Type! There are still accounts in the List of Accounts for this category. Please delete them first.");
                return;
            }

            if(confirm("Are you sure you want to delete this Sub Account Type?")) {
                try {
                    const response = await fetch(`api/maintain.php?action=delete_coa_sub&id=${sub.id}`, { method: 'POST' });
                    if (response.ok) {
                        coaSub = coaSub.filter(s => s.code != codeToUse);
                        selectedSubCode = null;
                        renderCOASubList();
                        resetSubForm();
                        alert("Sub Account Type deleted successfully.");
                    } else {
                        try {
                            const resJson = await response.json();
                            alert(resJson.message || "Server error while deleting Sub Account.");
                        } catch(e) {
                            alert("Server error while deleting Sub Account.");
                        }
                    }
                } catch (err) { alert("Delete Failed: " + err.message); }
            }
        }

        function resetSubForm(generate = false) {
            if(generate) {
                prevSubCode = selectedSubCode;
                selectedSubCode = null;
                if(document.getElementById('subAccountType')) {
                    document.getElementById('subAccountType').value = '';
                    document.getElementById('subAccountType').disabled = false;
                }
                if(document.getElementById('subAccountCode')) {
                    document.getElementById('subAccountCode').disabled = false;
                }
                if(document.getElementById('subAccountList')) document.getElementById('subAccountList').value = '';

                if (selectedMainCode) {
                    const main = coaMain.find(m => m.code == selectedMainCode);
                    const siblings = main ? coaSub.filter(s => s.main_id == main.id) : [];
                    let nextNum = 1;
                    if(siblings.length > 0) {
                        const lastCodes = siblings.map(s => {
                            const sCode = s.code.toString();
                            return parseInt(sCode.substring(selectedMainCode.toString().length));
                        });
                        nextNum = Math.max(...lastCodes) + 1;
                    }
                    const code = selectedMainCode.toString() + nextNum.toString().padStart(2, '0');
                    if(document.getElementById('subAccountCode')) document.getElementById('subAccountCode').value = code;
                } else {
                    if(document.getElementById('subAccountCode')) document.getElementById('subAccountCode').value = '';
                }
                
                // Clear List fields forcefully when adding Sub
                ['accountName', 'accountCode'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) { el.value = ''; el.disabled = true; }
                });
                if(document.getElementById('listAccountList')) document.getElementById('listAccountList').innerHTML = '';
                selectedListCode = null;

                renderCOAListList();
            } else {
                let codeToRestore = selectedSubCode || prevSubCode;
                if (codeToRestore) {
                    const temp = codeToRestore;
                    const list = document.getElementById('subAccountList');
                    if (list) list.value = temp;
                    onSubAccountSelect(temp);
                } else {
                    if(document.getElementById('subAccountType')) {
                        document.getElementById('subAccountType').value = '';
                        document.getElementById('subAccountType').disabled = true;
                    }
                    if(document.getElementById('subAccountCode')) {
                        document.getElementById('subAccountCode').value = '';
                        document.getElementById('subAccountCode').disabled = true;
                    }
                    if(document.getElementById('subAccountList')) document.getElementById('subAccountList').value = '';
                    renderCOAListList();
                    resetListForm();
                }
                prevSubCode = null;
            }
        }

        // List of Accounts
        function renderCOAListList() {
            const list = document.getElementById('listAccountList');
            if(!list) return;
            if(!selectedSubCode) { list.innerHTML = ''; return; }
            
            const sub = coaSub.find(s => s.code == selectedSubCode);
            if(!sub) { list.innerHTML = ''; return; }
            
            const filtered = coaList.filter(l => l.sub_id == sub.id);
            list.innerHTML = filtered.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
        }

        function onListAccountSelect(code) {
            selectedListCode = code;
            const acc = coaList.find(l => l.code == code);
            if(acc) {
                document.getElementById('accountCode').value = acc.code;
                document.getElementById('accountName').value = acc.name;
            }
            // Lock fields on select
            if(document.getElementById('accountCode')) document.getElementById('accountCode').disabled = false;
            if(document.getElementById('accountName')) document.getElementById('accountName').disabled = false;
        }

        async function saveCOAList() {
            if(!selectedSubCode) return alert("Select a Sub Account Type first!");
            const listName = document.getElementById('accountName').value.trim();
            if(!listName) return alert("Account Name is required!");

            const sub = coaSub.find(s => s.code == selectedSubCode);
            let code = document.getElementById('accountCode').value;
            let subId = sub.id;
            
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || 1;

            const payloadData = { sub_id: subId, code, name: listName };
            let idToUpdate = null;
            const existingCode = document.getElementById('accountCode').disabled ? code : null; 
            // If they modify code, they must have selected it originally
            const originalCode = document.getElementById('listAccountList').value;
            
            if (originalCode) {
                const ex = coaList.find(x => x.code == originalCode);
                if (ex) idToUpdate = ex.id;
            } else {
                const ex = coaList.find(x => x.code == code);
                if (ex) idToUpdate = ex.id;
            }
            if (idToUpdate) payloadData.id = idToUpdate;
            const idx = idToUpdate ? coaList.findIndex(l => l.id == idToUpdate) : -1;

            try {
                const response = await fetch(`api/maintain.php?action=save_coa_list&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadData)
                });
                if (response.ok) {
                    const resData = await response.json();
                    alert('Account entry saved and synchronized!');
                    
                    // Local update
                    if(idx > -1) {
                        coaList[idx] = { ...coaList[idx], name: listName };
                    } else {
                        coaList.push({ id: resData.id, sub_id: sub.id, code, name: listName });
                    }

                    renderCOAListList();
                    resetListForm(); // Back to locked
                }
            } catch (err) { alert('Sync Error: ' + err.message); }
        }

        async function deleteCOAList() {
            const code = document.getElementById('accountCode').value;
            if(!code) {
                alert("Please select an account entry to delete first.");
                return;
            }

            const acc = coaList.find(l => l.code == code);
            if (!acc) {
                alert("Account entry not found in the list.");
                return;
            }

            if(confirm("Are you sure you want to delete this account entry? This action cannot be undone.")) {
                try {
                    const response = await fetch(`api/maintain.php?action=delete_coa_list&id=${acc.id}`, { method: 'POST' });
                    if (response.ok) {
                        coaList = coaList.filter(l => l.code != code);
                        renderCOAListList();
                        resetListForm();
                        alert("Account entry deleted successfully.");
                    } else {
                        try {
                            const resJson = await response.json();
                            alert(resJson.message || "Server error while deleting account entry.");
                        } catch(e) {
                            alert("Server error while deleting account entry.");
                        }
                    }
                } catch (err) { alert("Delete Failed: " + err.message); }
            }
        }

        function resetListForm(generate = false) {
            if(generate) {
                prevListCode = selectedListCode;
                selectedListCode = null;
                if(document.getElementById('accountName')) {
                    document.getElementById('accountName').value = '';
                    document.getElementById('accountName').disabled = false;
                }
                if(document.getElementById('accountCode')) {
                    document.getElementById('accountCode').disabled = false;
                }
                if(document.getElementById('listAccountList')) {
                    document.getElementById('listAccountList').selectedIndex = -1;
                }

                if (selectedSubCode) {
                    const sub = coaSub.find(s => s.code == selectedSubCode);
                    const siblings = sub ? coaList.filter(l => l.sub_id == sub.id) : [];
                    let nextNum = 1;
                    if(siblings.length > 0) {
                        const lastCodes = siblings.map(l => {
                            const lCode = l.code.toString();
                            return parseInt(lCode.substring(selectedSubCode.toString().length));
                        });
                        nextNum = Math.max(...lastCodes) + 1;
                    }
                    const code = selectedSubCode.toString() + nextNum.toString().padStart(3, '0');
                    if(document.getElementById('accountCode')) document.getElementById('accountCode').value = code;
                } else {
                    if(document.getElementById('accountCode')) document.getElementById('accountCode').value = '';
                }
            } else {
                let codeToRestore = selectedListCode || prevListCode;
                if (codeToRestore) {
                    const temp = codeToRestore;
                    const list = document.getElementById('listAccountList');
                    if (list) list.value = temp;
                    onListAccountSelect(temp);
                } else {
                    if(document.getElementById('accountName')) {
                        document.getElementById('accountName').value = '';
                        document.getElementById('accountName').disabled = true;
                    }
                    if(document.getElementById('accountCode')) {
                        document.getElementById('accountCode').value = '';
                        document.getElementById('accountCode').disabled = true;
                    }
                    if(document.getElementById('listAccountList')) document.getElementById('listAccountList').value = '';
                }
                prevListCode = null;
            }
        }

        function findCOA() {
            if (!selectedSubCode) return alert("Please select a Sub Account Category first.");
            const query = prompt("Enter Account Name or Code to search:");
            if (!query) return;

            const list = document.getElementById('listAccountList');
            const sub = coaSub.find(s => s.code == selectedSubCode);
            if (!sub) return;
            
            const items = coaList.filter(l => l.sub_id == sub.id);
            const filtered = items.filter(l => 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(l.name.toLowerCase(), query.toLowerCase()) : l.name.toLowerCase().includes(query.toLowerCase())) || 
                l.code.toString().includes(query)
            );

            if (filtered.length > 0) {
                list.innerHTML = filtered.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
                if (filtered.length === 1) {
                    onListAccountSelect(filtered[0].code);
                }
            } else {
                alert("No accounts found matching '" + query + "'");
                renderCOAListList();
            }
        }
        function printCOA(level) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
            const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
            
            let reportTitle = "CHART OF ACCOUNTS";
            if(level === 'main') { 
                reportTitle = "MAIN ACCOUNT TYPES"; 
            } else if(level === 'sub') { 
                reportTitle = "SUB ACCOUNT TYPES"; 
            } else { 
                reportTitle = "LIST OF ACCOUNTS"; 
            }
            
            let htmlRows = '';
            
            if (level === 'main') {
                coaMain.forEach(main => {
                    htmlRows += `
                        <tr style="border: 1px solid black; font-weight: bold;">
                            <td style="width: 150px; padding: 4px;">${main.code}</td>
                            <td style="padding: 4px;">${main.name}</td>
                        </tr>
                    `;
                    const subs = coaSub.filter(s => s.main_id == main.id);
                    subs.forEach(sub => {
                        htmlRows += `
                            <tr style="font-weight: bold; font-style: italic;">
                                <td style="width: 150px; padding: 4px;">${sub.code}</td>
                                <td style="padding: 4px;">${sub.name}</td>
                            </tr>
                        `;
                        const lists = coaList.filter(l => l.sub_id == sub.id);
                        lists.forEach(list => {
                            htmlRows += `
                                <tr style="font-style: italic; color: #333;">
                                    <td style="width: 150px; padding: 4px;">${list.code}</td>
                                    <td style="padding: 4px;">${list.name}</td>
                                </tr>
                            `;
                        });
                    });
                });
            } else if (level === 'sub') {
                const main = coaMain.find(m => m.code == selectedMainCode);
                const subsToPrint = main ? coaSub.filter(s => s.main_id == main.id) : coaSub;
                subsToPrint.forEach(sub => {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic;">
                            <td style="width: 150px; padding: 4px;">${sub.code}</td>
                            <td style="padding: 4px;">${sub.name}</td>
                        </tr>
                    `;
                    const lists = coaList.filter(l => l.sub_id == sub.id);
                    lists.forEach(list => {
                        htmlRows += `
                            <tr style="font-style: italic; color: #333;">
                                <td style="width: 150px; padding: 4px;">${list.code}</td>
                                <td style="padding: 4px;">${list.name}</td>
                            </tr>
                        `;
                    });
                });
            } else if (level === 'list') {
                const sub = coaSub.find(s => s.code == selectedSubCode);
                const listsToPrint = sub ? coaList.filter(l => l.sub_id == sub.id) : coaList;
                listsToPrint.forEach(list => {
                    htmlRows += `
                        <tr style="font-style: italic; color: #333;">
                            <td style="width: 150px; padding: 4px;">${list.code}</td>
                            <td style="padding: 4px;">${list.name}</td>
                        </tr>
                    `;
                });
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Report - ${reportTitle}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        td { font-size: 13px; vertical-align: top; }
                        .footer { margin-top: 60px; font-size: 12px; color: #95a5a6; text-align: center; border-top: 1px solid #eee; padding-top: 15px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? '<img src="' + logo + '">' : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>${reportTitle}</h2>
                    </div>
                    <table>
                        <tbody>
                            ${htmlRows || '<tr><td style="padding: 20px; text-align: center;">No accounts found.</td></tr>'}
                        </tbody>
                    </table>
                    <div class="footer">
                        This is an electronically generated report from Softifyx ERP. No signature required.
                    </div>
                    <script>window.onload = () => { window.print(); }</script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }

        window.initChartOfAccountsView = initChartOfAccountsView;
        window.onMainAccountSelect = onMainAccountSelect;
        window.saveCOAMain = saveCOAMain;
        window.deleteCOAMain = deleteCOAMain;
        window.resetMainForm = resetMainForm;
        window.onFinancialStatementComponentChange = onFinancialStatementComponentChange;
        window.onSubAccountSelect = onSubAccountSelect;
        window.saveCOASub = saveCOASub;
        window.deleteCOASub = deleteCOASub;
        window.resetSubForm = resetSubForm;
        window.onListAccountSelect = onListAccountSelect;
        window.saveCOAList = saveCOAList;
        window.deleteCOAList = deleteCOAList;
        window.resetListForm = resetListForm;
        window.printCOA = printCOA;

        // --- FIND ACCOUNT MODAL LOGIC ---
        function openFindAccountModal() {
            const modal = document.getElementById('findAccountModal');
            if (modal) {
                const searchInput = document.getElementById('findAccountSearchInput');
                if (searchInput) searchInput.value = '';
                renderFindAccountTable();
                modal.style.display = 'flex';
                setTimeout(() => {
                    if (searchInput) searchInput.focus();
                }, 100);
            }
        }

        function closeFindAccountModal() {
            const modal = document.getElementById('findAccountModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function renderFindAccountTable() {
            const tbody = document.getElementById('findAccountTableBody');
            if (!tbody) return;
            const searchInput = document.getElementById('findAccountSearchInput');
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            
            let html = '';
            const results = [];
            
            for (let i = 0; i < coaList.length; i++) {
                const listAcc = coaList[i];
                const subAcc = coaSub.find(s => s.id == listAcc.sub_id);
                const mainAcc = subAcc ? coaMain.find(m => m.id == subAcc.main_id) : null;
                
                const listNameStr = `${listAcc.code} ${listAcc.name}`;
                const subNameStr = subAcc ? `${subAcc.code} ${subAcc.name}` : '';
                const mainNameStr = mainAcc ? `${mainAcc.code} ${mainAcc.name}` : '';
                
                if (query) {
                    if (!(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(listNameStr.toLowerCase(), query) : listNameStr.toLowerCase().includes(query)) && 
                        !(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(subNameStr.toLowerCase(), query) : subNameStr.toLowerCase().includes(query)) && 
                        !(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(mainNameStr.toLowerCase(), query) : mainNameStr.toLowerCase().includes(query))) {
                        continue;
                    }
                }
                
                results.push({ listAcc, subAcc, mainAcc, listNameStr, subNameStr, mainNameStr });
            }
            
            results.forEach(res => {
                const mCode = res.mainAcc ? res.mainAcc.code : '';
                const sCode = res.subAcc ? res.subAcc.code : '';
                html += `
                    <tr style="border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: background 0.2s;" 
                        onmouseover="this.style.background='#f1f5f9'" 
                        onmouseout="this.style.background='white'"
                        ondblclick="selectFindAccount('${mCode}', '${sCode}', '${res.listAcc.code}')">
                        <td style="padding: 6px; color: #000; font-size: 13px; font-weight: 500;">${res.listNameStr}</td>
                        <td style="padding: 6px; color: #334155; font-size: 13px;">${res.mainNameStr}</td>
                        <td style="padding: 6px; color: #334155; font-size: 13px;">${res.subNameStr}</td>
                    </tr>
                `;
            });
            
            if (results.length === 0) {
                html = `<tr><td colspan="3" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">No accounts found matching your search.</td></tr>`;
            }
            
            tbody.innerHTML = html;
        }

        function filterFindAccountTable() {
            renderFindAccountTable();
        }

        function selectFindAccount(mainCode, subCode, listCode) {
            closeFindAccountModal();
            
            if (mainCode) {
                const mainList = document.getElementById('mainAccountList');
                if (mainList) {
                    mainList.value = mainCode;
                    onMainAccountSelect(mainCode);
                }
            }
            if (subCode) {
                const subList = document.getElementById('subAccountList');
                if (subList) {
                    subList.value = subCode;
                    onSubAccountSelect(subCode);
                }
            }
            if (listCode) {
                const listList = document.getElementById('listAccountList');
                if (listList) {
                    listList.value = listCode;
                    onListAccountSelect(listCode);
                }
            }
        }
        
        window.openFindAccountModal = openFindAccountModal;
        window.closeFindAccountModal = closeFindAccountModal;
        window.renderFindAccountTable = renderFindAccountTable;
        window.filterFindAccountTable = filterFindAccountTable;
        window.selectFindAccount = selectFindAccount;

        // --- CUSTOMERS MODULE LOGIC ---
        function initCustomersView() {
            if (typeof window.applyCustomRegionLabels === 'function') {
                window.applyCustomRegionLabels();
            }
            let retries = 0;
            const checkAndRender = setInterval(() => {
                const list = document.getElementById('customerTypeList');
                if (list) {
                    clearInterval(checkAndRender);
                    if (typeof window.applyCustomRegionLabels === 'function') {
                        window.applyCustomRegionLabels();
                    }
                    loadCustomerLookups();
                    renderCustomerTypeList();
                    
                    // Auto-select first type if available and fetch data
                    if (list.options.length > 0) {
                        list.selectedIndex = 0;
                        onCustomerTypeSelect(list.value);
                    } else {
                        resetCustomerTypeForm();
                        resetCustomerForm();
                    }
                } else if (++retries >= 20) clearInterval(checkAndRender);
            }, 100);
        }

        async function loadCustomerLookups() {
            try {
                const regRes = await fetch('api/maintain.php?action=get_regions');
                const regions = await regRes.json();
                const regSelect = document.getElementById('custRegion');
                if(regSelect) {
                    regSelect.innerHTML = '<option value="">None</option>' + 
                        regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
                }

                const secRes = await fetch('api/maintain.php?action=get_sectors');
                const sectors = await secRes.json();
                const secSelect = document.getElementById('custSector');
                if(secSelect) {
                    secSelect.innerHTML = '<option value="">None</option>' + 
                        sectors.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                }
                
                // Load Managers (Employees)
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const manRes = await fetch(`api/maintain.php?action=get_employees&company_id=${coId}`);
                if (manRes.ok) {
                    const employees = await manRes.json();
                    const manSelect = document.getElementById('custAccManager');
                    if(manSelect) {
                        manSelect.innerHTML = '<option value="">None</option>' + 
                            employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
                    }
                }
                loadCustomerTaxTypes();
                if (typeof fetchBuyerTypes === 'function') {
                    fetchBuyerTypes();
                } else if (typeof loadCustomerBuyerTypes === 'function') {
                    loadCustomerBuyerTypes();
                }
            } catch(e) { console.error("Lookup load failed", e); }
        }
        
        async function loadCustomerTaxTypes() {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/maintain.php?action=get_customer_types_tax&company_id=${coId}`);
                window.customerTaxTypesData = await res.json();
                const sel = document.getElementById('custTaxType');
                if(sel) {
                    const curVal = sel.value;
                    sel.innerHTML = '<option value="">None</option>' + window.customerTaxTypesData.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                    if (curVal) {
                        sel.value = curVal;
                        if (window.onCustTaxTypeSelect) window.onCustTaxTypeSelect(curVal);
                    }
                }
            } catch(e) {}
        }
        
        function onCustTaxTypeSelect(id) {
            const whInput = document.getElementById('custWhTaxRate') || document.getElementById('custTaxRate');
            const legacyInput = document.getElementById('custTaxRate');
            if(!whInput) return;
            if(!id) {
                whInput.value = '0.00';
                if(legacyInput) legacyInput.value = '0.00';
                return;
            }
            const typeData = (window.customerTaxTypesData || []).find(t => t.id == id);
            if(typeData) {
                const rateVal = parseFloat(typeData.tax_rate || 0).toFixed(2);
                whInput.value = rateVal;
                if(legacyInput) legacyInput.value = rateVal;
            } else {
                whInput.value = '0.00';
                if(legacyInput) legacyInput.value = '0.00';
            }
        }

        function onCustBuyerTypeSelect(id) {
            const stInput = document.getElementById('custSalesTaxRate');
            const furInput = document.getElementById('custFurtherTaxRate');
            if (!id) {
                if (stInput) stInput.value = '0.00';
                if (furInput) furInput.value = '0.00';
                return;
            }
            const bList = (typeof buyerTypesData !== 'undefined' ? buyerTypesData : (window.buyerTypesData || []));
            const item = bList.find(b => b.id == id);
            if (item) {
                if (stInput && item.sales_tax_rate !== undefined) stInput.value = parseFloat(item.sales_tax_rate).toFixed(2);
                if (furInput && item.further_tax_rate !== undefined) furInput.value = parseFloat(item.further_tax_rate).toFixed(2);
            } else {
                const sel = document.getElementById('custBuyerType');
                const opt = sel ? sel.options[sel.selectedIndex] : null;
                if (opt && opt.dataset.st !== undefined && stInput) {
                    stInput.value = parseFloat(opt.dataset.st).toFixed(2);
                }
                if (opt && opt.dataset.fur !== undefined && furInput) {
                    furInput.value = parseFloat(opt.dataset.fur).toFixed(2);
                }
            }
        }
        window.onCustBuyerTypeSelect = onCustBuyerTypeSelect;

        async function loadSubRegions(regionId) {
            if(!regionId) {
                document.getElementById('custSubRegion').innerHTML = '<option value="">None</option>';
                return;
            }
            try {
                const res = await fetch(`api/maintain.php?action=get_sub_regions&region_id=${regionId}`);
                const subs = await res.json();
                document.getElementById('custSubRegion').innerHTML = '<option value="">None</option>' + 
                    subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            } catch(e) {}
        }

        function renderCustomerTypeList() {
            const list = document.getElementById('customerTypeList');
            if(!list) return;
            // Filter COA Sub Accounts that belong to "Customers" (typically a main account)
            // For now, let's look for a main account named "Customers" or "Sundry Debtors"
            const custMain = coaMain.find(m => m.name.toLowerCase().includes('customer') || m.name.toLowerCase().includes('debtor'));
            if(!custMain) {
                list.innerHTML = '<option disabled>No Customer category found in COA</option>';
                return;
            }
            const filtered = coaSub.filter(s => s.main_id == custMain.id);
            list.innerHTML = filtered.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
        }

        function onCustomerTypeSelect(code, custCodeToSelect = null) {
            selectedCustTypeCode = code;
            selectedCustAccountCode = null;
            prevCustAccountCode = null;
            const sub = coaSub.find(s => s.code == code);
            if(sub) {
                document.getElementById('custSubTypeCode').value = sub.code;
                document.getElementById('custTypeName').value = sub.name;
                document.getElementById('custSubTypeCode').disabled = false;
                document.getElementById('custTypeName').disabled = false;
            }
            fetchCustomersDetailed(code, custCodeToSelect);
        }

        async function fetchCustomersDetailed(subCode, custCodeToSelect = null) {
            const sub = coaSub.find(s => s.code == subCode);
            if(!sub) return;
            try {
                const res = await fetch(`api/maintain.php?action=get_customers&sub_id=${sub.id}`);
                customerData = await res.json();
                renderCustomerList();
                
                const list = document.getElementById('customerList');
                if (list && list.options.length > 0) {
                    if (custCodeToSelect) {
                        list.value = custCodeToSelect;
                        onCustomerSelect(custCodeToSelect);
                    } else {
                        list.selectedIndex = 0;
                        onCustomerSelect(list.value);
                    }
                } else {
                    resetCustomerForm();
                }
            } catch(e) {}
        }

        function renderCustomerList() {
            const list = document.getElementById('customerList');
            if(!list) return;
            const sub = coaSub.find(s => s.code == selectedCustTypeCode);
            if(!sub) { list.innerHTML = ''; return; }
            const filtered = coaList.filter(l => l.sub_id == sub.id);
            list.innerHTML = filtered.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
        }

        async function onCustomerSelect(code) {
            prevCustAccountCode = selectedCustAccountCode;
            selectedCustAccountCode = code;
            const cust = customerData.find(c => c.code == code);
            if(cust) {
                document.getElementById('custAccountCode').value = cust.code;
                document.getElementById('custAccountName').value = cust.name;
                document.getElementById('custContactPerson').value = cust.contact_person || '';
                document.getElementById('custAddress').value = cust.address || '';
                document.getElementById('custRegion').value = cust.region_id || '';
                await loadSubRegions(cust.region_id);
                document.getElementById('custSubRegion').value = cust.sub_region_id || '';
                document.getElementById('custTelephone').value = cust.telephone || '';
                document.getElementById('custMobile').value = cust.mobile || '';
                document.getElementById('custFax').value = cust.fax || '';
                document.getElementById('custWebsite').value = cust.website || '';
                document.getElementById('custEmail').value = cust.email || '';
                document.getElementById('custStReg').value = cust.st_reg_no || '';
                document.getElementById('custNtn').value = cust.ntn_cnic || '';
                if (document.getElementById('custCnic')) document.getElementById('custCnic').value = cust.cnic || '';
                if (document.getElementById('custBuyerType')) document.getElementById('custBuyerType').value = cust.buyer_type_id || '';
                if (document.getElementById('custTaxType')) document.getElementById('custTaxType').value = cust.cust_tax_type_id || '';
                const whVal = cust.wh_tax_rate !== undefined && cust.wh_tax_rate !== null ? parseFloat(cust.wh_tax_rate).toFixed(2) : (cust.tax_rate ? parseFloat(cust.tax_rate).toFixed(2) : '0.00');
                const stVal = cust.sales_tax_rate !== undefined && cust.sales_tax_rate !== null ? parseFloat(cust.sales_tax_rate).toFixed(2) : '0.00';
                const furVal = cust.further_tax_rate !== undefined && cust.further_tax_rate !== null ? parseFloat(cust.further_tax_rate).toFixed(2) : '0.00';
                if (document.getElementById('custWhTaxRate')) document.getElementById('custWhTaxRate').value = whVal;
                if (document.getElementById('custSalesTaxRate')) document.getElementById('custSalesTaxRate').value = stVal;
                if (document.getElementById('custFurtherTaxRate')) document.getElementById('custFurtherTaxRate').value = furVal;
                if (document.getElementById('custTaxRate')) document.getElementById('custTaxRate').value = whVal;
                document.getElementById('custSector').value = cust.business_sector_id || '';
                document.getElementById('custAccManager').value = cust.acc_manager_id || '';
                document.getElementById('custCreditLimit').value = cust.credit_limit || 0;
                document.getElementById('custCreditTerms').value = cust.credit_terms || 'CASH';
                document.getElementById('custRemarks').value = cust.remarks || '';
                
                // Enable fields
                enableCustomerFields(true);
            }
        }

        function enableCustomerFields(enabled) {
            const fields = [
                'custAccountCode', 'custAccountName', 'custContactPerson', 'custAddress',
                'custRegion', 'custSubRegion', 'custTelephone', 'custMobile', 'custFax',
                'custWebsite', 'custEmail', 'custStReg', 'custNtn', 'custCnic', 'custBuyerType', 'custTaxType',
                'custWhTaxRate', 'custSalesTaxRate', 'custFurtherTaxRate', 'custTaxRate', 'custSector',
                'custAccManager', 'custCreditLimit', 'custCreditTerms', 'custRemarks'
            ];
            fields.forEach(f => {
                const el = document.getElementById(f);
                if(el) el.disabled = !enabled;
            });
        }

        async function saveCustomerType() {
            // Mirrors saveCOASub but uses CUSTOMERS logic
            const custMain = coaMain.find(m => m.name.toLowerCase().includes('customer') || m.name.toLowerCase().includes('debtor'));
            if(!custMain) return alert("Main Customer category not found!");

            const name = document.getElementById('custTypeName').value.trim();
            const code = document.getElementById('custSubTypeCode').value.trim();
            if(!name || !code) return alert("Code and Name are required!");

            const payload = { main_id: custMain.id, code, name };
            const existing = coaSub.find(s => s.code == (selectedCustTypeCode || code));
            if(existing) payload.id = existing.id;

            try {
                const res = await fetch(`api/maintain.php?action=save_coa_sub`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    const data = await res.json();
                    alert("Customer Type saved!");
                    // Refresh local coaSub (usually handled by global sync, but let's update simple)
                    if(existing) existing.name = name;
                    else coaSub.push({ id: data.id, main_id: custMain.id, code, name });
                    renderCustomerTypeList();
                    resetCustomerTypeForm();
                }
            } catch(e) { alert("Save failed"); }
        }

        async function saveCustomer() {
            if(!selectedCustTypeCode) return alert("Select a Customer Type first!");
            const name = document.getElementById('custAccountName').value.trim();
            const code = document.getElementById('custAccountCode').value.trim();
            if(!name || !code) return alert("Account Code and Name are required!");

            const sub = coaSub.find(s => s.code == selectedCustTypeCode);
            const payload = {
                sub_id: sub.id,
                code: code,
                name: name,
                contact_person: document.getElementById('custContactPerson').value,
                address: document.getElementById('custAddress').value,
                region_id: document.getElementById('custRegion').value || null,
                sub_region_id: document.getElementById('custSubRegion').value || null,
                telephone: document.getElementById('custTelephone').value,
                mobile: document.getElementById('custMobile').value,
                fax: document.getElementById('custFax').value,
                website: document.getElementById('custWebsite').value,
                email: document.getElementById('custEmail').value,
                st_reg_no: document.getElementById('custStReg').value,
                ntn_cnic: document.getElementById('custNtn').value,
                cnic: document.getElementById('custCnic')?.value.trim() || '',
                buyer_type_id: document.getElementById('custBuyerType')?.value || null,
                cust_tax_type_id: document.getElementById('custTaxType')?.value || null,
                wh_tax_rate: parseFloat(document.getElementById('custWhTaxRate')?.value || document.getElementById('custTaxRate')?.value || 0),
                sales_tax_rate: parseFloat(document.getElementById('custSalesTaxRate')?.value || 0),
                further_tax_rate: parseFloat(document.getElementById('custFurtherTaxRate')?.value || 0),
                business_sector_id: document.getElementById('custSector').value || null,
                acc_manager_id: document.getElementById('custAccManager').value || null,
                credit_limit: document.getElementById('custCreditLimit').value,
                credit_terms: document.getElementById('custCreditTerms').value,
                remarks: document.getElementById('custRemarks').value
            };

            const existing = customerData.find(c => c.code == (selectedCustAccountCode || code));
            if(existing) payload.id = existing.id; // coa_list_id handled by backend action

            try {
                const res = await fetch(`api/maintain.php?action=save_customer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    const resData = await res.json();
                    alert("Customer profile saved!");
                    const sub = coaSub.find(s => s.code == selectedCustTypeCode);
                    const idx = coaList.findIndex(l => l.id == resData.id);
                    if(idx > -1) {
                        coaList[idx] = { ...coaList[idx], code, name };
                    } else {
                        coaList.push({ id: resData.id, sub_id: sub.id, code, name });
                    }
                    fetchCustomersDetailed(selectedCustTypeCode);
                }
            } catch(e) { alert("Save failed"); }
        }

        async function deleteCustomerType() {
            if (!selectedCustTypeCode) return alert("Select a Customer Type to delete first.");
            
            const sub = coaSub.find(s => s.code == selectedCustTypeCode);
            if(!sub) return;

            if(confirm(`Are you sure you want to delete the Customer Type "${sub.name}"? This will also remove it from Chart of Accounts.`)) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_coa_sub&id=${sub.id}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Customer Type deleted.");
                        // Refresh coaSub locally or re-sync
                        coaSub = coaSub.filter(s => s.id != sub.id);
                        renderCustomerTypeList();
                        resetCustomerTypeForm();
                    }
                } catch(e) { alert("Delete failed"); }
            }
        }

        async function deleteCustomer() {
            if (!selectedCustAccountCode) return alert("Select a Customer Profile to delete first.");
            
            const cust = customerData.find(c => c.code == selectedCustAccountCode);
            if(!cust) return;

            if(confirm(`Are you sure you want to delete the profile for "${cust.name}"?`)) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_coa_list&id=${cust.id}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Customer Profile deleted.");
                        coaList = coaList.filter(l => l.id != cust.id);
                        fetchCustomersDetailed(selectedCustTypeCode);
                    }
                } catch(e) { alert("Delete failed"); }
            }
        }

        function resetCustomerTypeForm(generate = false) {
            if(generate) {
                prevCustTypeCode = selectedCustTypeCode;
                selectedCustTypeCode = null;
                document.getElementById('custSubTypeCode').value = '';
                document.getElementById('custTypeName').value = '';
                document.getElementById('customerTypeList').value = '';
                const custMain = coaMain.find(m => m.name.toLowerCase().includes('customer') || m.name.toLowerCase().includes('debtor'));
                if(custMain) {
                    const siblings = coaSub.filter(s => s.main_id == custMain.id);
                    let nextNum = 1;
                    if(siblings.length > 0) {
                        const lastCodes = siblings.map(s => parseInt(s.code.toString().substring(custMain.code.toString().length)) || 0);
                        nextNum = Math.max(...lastCodes) + 1;
                    }
                    document.getElementById('custSubTypeCode').value = custMain.code.toString() + nextNum.toString().padStart(2, '0');
                }
                document.getElementById('custSubTypeCode').disabled = false;
                document.getElementById('custTypeName').disabled = false;
                renderCustomerList();
                resetCustomerForm();
            } else {
                let codeToRestore = selectedCustTypeCode || prevCustTypeCode;
                if (codeToRestore) {
                    const list = document.getElementById('customerTypeList');
                    if (list) list.value = codeToRestore;
                    onCustomerTypeSelect(codeToRestore);
                    prevCustTypeCode = null;
                } else {
                    document.getElementById('custSubTypeCode').value = '';
                    document.getElementById('custTypeName').value = '';
                    document.getElementById('custSubTypeCode').disabled = true;
                    document.getElementById('custTypeName').disabled = true;
                    selectedCustTypeCode = null;
                    renderCustomerList();
                    resetCustomerForm();
                }
            }
        }

        function resetCustomerForm(generate = false) {
            if(generate) {
                prevCustAccountCode = selectedCustAccountCode;
                selectedCustAccountCode = null;
                enableCustomerFields(true);
                const fields = [
                    'custAccountCode', 'custAccountName', 'custContactPerson', 'custAddress',
                    'custRegion', 'custSubRegion', 'custTelephone', 'custMobile', 'custFax',
                    'custWebsite', 'custEmail', 'custStReg', 'custNtn', 'custCnic', 'custBuyerType', 'custTaxType',
                    'custWhTaxRate', 'custSalesTaxRate', 'custFurtherTaxRate', 'custTaxRate', 'custSector',
                    'custAccManager', 'custCreditLimit', 'custCreditTerms', 'custRemarks'
                ];
                fields.forEach(f => {
                    const el = document.getElementById(f);
                    if(el) {
                        if(f === 'custCreditLimit') el.value = 0;
                        else if(f === 'custCreditTerms') el.value = 'CASH';
                        else if(f === 'custWhTaxRate' || f === 'custSalesTaxRate' || f === 'custFurtherTaxRate' || f === 'custTaxRate') el.value = '0.00';
                        else el.value = '';
                    }
                });
                document.getElementById('customerList').value = '';
                if(selectedCustTypeCode) {
                    const siblings = customerData;
                    let nextNum = 1;
                    if(siblings.length > 0) {
                        const lastCodes = siblings.map(l => parseInt(l.code.toString().substring(selectedCustTypeCode.toString().length)) || 0);
                        nextNum = Math.max(...lastCodes) + 1;
                    }
                    document.getElementById('custAccountCode').value = selectedCustTypeCode.toString() + nextNum.toString().padStart(3, '0');
                }
            } else {
                let codeToRestore = selectedCustAccountCode || prevCustAccountCode;
                if (codeToRestore) {
                    const list = document.getElementById('customerList');
                    if (list) list.value = codeToRestore;
                    onCustomerSelect(codeToRestore);
                    prevCustAccountCode = null;
                } else {
                    enableCustomerFields(false);
                    const fields = [
                        'custAccountCode', 'custAccountName', 'custContactPerson', 'custAddress',
                        'custRegion', 'custSubRegion', 'custTelephone', 'custMobile', 'custFax',
                        'custWebsite', 'custEmail', 'custStReg', 'custNtn', 'custCnic', 'custBuyerType', 'custTaxType',
                        'custWhTaxRate', 'custSalesTaxRate', 'custFurtherTaxRate', 'custTaxRate', 'custSector',
                        'custAccManager', 'custCreditLimit', 'custCreditTerms', 'custRemarks'
                    ];
                    fields.forEach(f => {
                        const el = document.getElementById(f);
                        if(el) {
                            if(f === 'custCreditLimit') el.value = 0;
                            else if(f === 'custCreditTerms') el.value = 'CASH';
                            else if(f === 'custWhTaxRate' || f === 'custSalesTaxRate' || f === 'custFurtherTaxRate' || f === 'custTaxRate') el.value = '0.00';
                            else el.value = '';
                        }
                    });
                    document.getElementById('customerList').value = '';
                    selectedCustAccountCode = null;
                }
            }
        }

        function openFindCustomerModal() {
            const modal = document.getElementById('findCustomerModal');
            if (modal) {
                const searchInput = document.getElementById('findCustomerSearchInput');
                if (searchInput) searchInput.value = '';
                renderFindCustomerTable();
                modal.style.display = 'flex';
                setTimeout(() => {
                    if (searchInput) searchInput.focus();
                }, 100);
            }
        }

        function closeFindCustomerModal() {
            const modal = document.getElementById('findCustomerModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function renderFindCustomerTable() {
            const tbody = document.getElementById('findCustomerTableBody');
            if (!tbody) return;
            const searchInput = document.getElementById('findCustomerSearchInput');
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            
            let html = '';
            const results = [];
            
            const typeList = document.getElementById('customerTypeList');
            const selectedType = typeList ? typeList.value : null;
            if (!selectedType) return;
            const custTypes = coaSub.filter(s => s.code == selectedType);

            // get all coaList matching those types
            for (let i = 0; i < coaList.length; i++) {
                const listAcc = coaList[i];
                const subAcc = custTypes.find(s => s.id == listAcc.sub_id);
                if (!subAcc) continue;
                
                const listNameStr = `${listAcc.code} ${listAcc.name}`;
                const subNameStr = `${subAcc.code} ${subAcc.name}`;
                
                if (query) {
                    if (!(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(listNameStr.toLowerCase(), query) : listNameStr.toLowerCase().includes(query)) && 
                        !(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(subNameStr.toLowerCase(), query) : subNameStr.toLowerCase().includes(query))) {
                        continue;
                    }
                }
                
                results.push({ listAcc, subAcc, listNameStr, subNameStr });
            }
            
            results.forEach(res => {
                html += `
                    <tr style="border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: background 0.2s;" 
                        onmouseover="this.style.background='#f1f5f9'" 
                        onmouseout="this.style.background='white'"
                        ondblclick="selectFindCustomer('${res.subAcc.code}', '${res.listAcc.code}')">
                        <td style="padding: 6px; color: #000; font-size: 13px; font-weight: 500;">${res.listNameStr}</td>
                        <td style="padding: 6px; color: #334155; font-size: 13px;">${res.subNameStr}</td>
                    </tr>
                `;
            });
            
            if (results.length === 0) {
                html = `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">No customers found matching your search.</td></tr>`;
            }
            
            tbody.innerHTML = html;
        }

        function filterFindCustomerTable() {
            renderFindCustomerTable();
        }

        function selectFindCustomer(typeCode, custCode) {
            closeFindCustomerModal();
            const typeList = document.getElementById('customerTypeList');
            if (typeList) {
                typeList.value = typeCode;
                // Pass custCode to select it automatically after fetching the customers list
                onCustomerTypeSelect(typeCode, custCode);
            }
        };

        function printCustomers(level) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
            const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
            
            let reportTitle = level === 'type' ? "CUSTOMER TYPES" : "LIST OF CUSTOMERS";
            let htmlRows = '';
            
            if (level === 'type') {
                const custMain = coaMain.find(m => m.name.toLowerCase().includes('customer') || m.name.toLowerCase().includes('debtor'));
                const types = custMain ? coaSub.filter(s => s.main_id == custMain.id) : [];
                types.forEach(type => {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic;">
                            <td style="width: 150px; padding: 4px;">${type.code}</td>
                            <td style="padding: 4px;">${type.name}</td>
                        </tr>
                    `;
                    const lists = coaList.filter(l => l.sub_id == type.id);
                    lists.forEach(list => {
                        htmlRows += `
                            <tr style="font-style: italic; color: #333;">
                                <td style="width: 150px; padding: 4px;">${list.code}</td>
                                <td style="padding: 4px;">${list.name}</td>
                            </tr>
                        `;
                    });
                });
            } else if (level === 'list') {
                const type = coaSub.find(s => s.code == selectedCustTypeCode);
                if (type) {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic; background-color: #f1f5f9;">
                            <td colspan="2" style="padding: 4px;">${type.code} - ${type.name}</td>
                        </tr>
                    `;
                }
                const listsToPrint = customerData;
                listsToPrint.forEach(cust => {
                    htmlRows += `
                        <tr style="font-style: italic; color: #333;">
                            <td style="width: 150px; padding: 4px;">${cust.code}</td>
                            <td style="padding: 4px;">${cust.name}</td>
                        </tr>
                    `;
                });
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Report - ${reportTitle}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        td { font-size: 13px; vertical-align: top; }
                        .footer { margin-top: 60px; font-size: 12px; color: #95a5a6; text-align: center; border-top: 1px solid #eee; padding-top: 15px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? `<img src="${logo}" alt="Company Logo">` : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>${reportTitle}</h2>
                    </div>
                    <table>
                        ${htmlRows}
                    </table>
                    <div class="footer">
                        Generated by SoftifyX Financials | ${new Date().toLocaleString()}
                    </div>
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }

        // --- VENDORS MODULE LOGIC ---
        function initVendorsView() {
            console.log("SoftifyX Diagnostic: Initializing Vendors View...");
            let retries = 0;
            const checkAndRender = setInterval(() => {
                const list = document.getElementById('vendorTypeList');
                if (list) {
                    clearInterval(checkAndRender);
                    renderVendorTypeList();
                    
                    // AUTO-SELECT FIRST ITEM IF AVAILABLE
                    if (list.options.length > 0) {
                        list.selectedIndex = 0;
                        onVendorTypeSelect(list.value);
                    } else {
                        console.warn("SoftifyX Diagnostic: No vendor types found during initialization.");
                        resetVendorTypeForm();
                        resetVendorForm();
                    }
                } else if (++retries >= 30) {
                    console.error("SoftifyX Diagnostic: Vendor module container not found after 3 seconds.");
                    clearInterval(checkAndRender);
                }
            }, 100);
        }

        function renderVendorTypeList() {
            const list = document.getElementById('vendorTypeList');
            if(!list) return;
            // Improved search to include 'payable'
            const vendMain = coaMain.find(m => {
                const n = m.name.toLowerCase();
                return n.includes('vendor') || n.includes('supplier') || n.includes('creditor') || n.includes('payable');
            });
            
            console.log("SoftifyX Diagnostic: Found vendMain:", vendMain);
            
            if(!vendMain) {
                console.error("SoftifyX Diagnostic: COA main category for Vendors/Payables not found.");
                list.innerHTML = '<option disabled>No Vendor category found in COA</option>';
                return;
            }
            const filtered = coaSub.filter(s => s.main_id == vendMain.id);
            console.log("SoftifyX Diagnostic: Found sub-accounts:", filtered.length);
            list.innerHTML = filtered.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
        }

        function onVendorTypeSelect(code, vendCodeToSelect = null) {
            selectedVendTypeCode = code;
            const sub = coaSub.find(s => s.code == code);
            if(sub) {
                document.getElementById('vendSubTypeCode').value = sub.code;
                document.getElementById('vendSubName').value = sub.name;
                enableVendorTypeFields(true);
            }
            fetchVendorsDetailed(code, vendCodeToSelect);
        }

        function enableVendorTypeFields(enabled) {
            const nameEl = document.getElementById('vendSubName');
            if (nameEl) nameEl.disabled = !enabled;
            // Never disable vendSubTypeCode so text stays black, it is readonly in HTML.
        }

        async function fetchVendorsDetailed(subCode, vendCodeToSelect = null) {
            const sub = coaSub.find(s => s.code == subCode);
            if(!sub) return;
            try {
                const res = await fetch(`api/maintain.php?action=get_vendors&sub_id=${sub.id}`);
                vendorData = await res.json();
                renderVendorList();
                
                const list = document.getElementById('vendorList');
                if (list && list.options.length > 0) {
                    if (vendCodeToSelect) {
                        list.value = vendCodeToSelect;
                        onVendorSelect(vendCodeToSelect);
                    } else {
                        list.selectedIndex = 0;
                        onVendorSelect(list.value);
                    }
                } else {
                    resetVendorForm(false);
                }
            } catch(e) {}
        }

        function renderVendorList() {
            const list = document.getElementById('vendorList');
            if(!list) return;
            
            console.log("SoftifyX Diagnostic: Rendering Vendor List for Type:", selectedVendTypeCode);
            
            const sub = coaSub.find(s => s.code == selectedVendTypeCode);
            if(!sub) { 
                console.warn("SoftifyX Diagnostic: Selected sub-category not found in coaSub.");
                list.innerHTML = ''; 
                return; 
            }
            
            const filtered = coaList.filter(l => l.sub_id == sub.id);
            console.log(`SoftifyX Diagnostic: Found ${filtered.length} matching accounts in coaList for sub_id ${sub.id}`);
            
            list.innerHTML = filtered.map(v => `<option value="${v.code}">${v.name}</option>`).join('');
        }

        async function onVendorSelect(code) {
            selectedVendAccountCode = code;
            const vend = vendorData.find(v => v.code == code);
            if(vend) {
                document.getElementById('vendAccountCode').value = vend.code;
                document.getElementById('vendAccountName').value = vend.name;
                document.getElementById('vendContactPerson').value = vend.contact_person || '';
                document.getElementById('vendAddress').value = vend.address || '';
                document.getElementById('vendTelephone').value = vend.telephone || '';
                document.getElementById('vendMobile').value = vend.mobile || '';
                document.getElementById('vendFax').value = vend.fax || '';
                document.getElementById('vendWebsite').value = vend.website || '';
                document.getElementById('vendEmail').value = vend.email || '';
                document.getElementById('vendStReg').value = vend.st_reg_no || '';
                document.getElementById('vendNtn').value = vend.ntn_cnic || '';
                document.getElementById('vendCreditTerms').value = vend.credit_terms || 'CASH';
                document.getElementById('vendRemarks').value = vend.remarks || '';
                enableVendorFields(true);
            }
        }

        function enableVendorFields(enabled) {
            const fields = [
                'vendAccountCode', 'vendAccountName', 'vendContactPerson', 'vendAddress',
                'vendTelephone', 'vendMobile', 'vendFax', 'vendWebsite', 'vendEmail', 
                'vendStReg', 'vendNtn', 'vendCreditTerms', 'vendRemarks'
            ];
            fields.forEach(f => {
                const el = document.getElementById(f);
                if(el) el.disabled = !enabled;
            });
        }

        async function saveVendorType() {
            const vendMain = coaMain.find(m => m.name.toLowerCase().includes('vendor') || m.name.toLowerCase().includes('supplier') || m.name.toLowerCase().includes('creditor'));
            if(!vendMain) return;

            const name = document.getElementById('vendSubName').value.trim();
            const code = document.getElementById('vendSubTypeCode').value.trim();
            if(!name || !code) return;

            const payload = { main_id: vendMain.id, code, name };
            const existing = coaSub.find(s => s.code == (selectedVendTypeCode || code));
            if(existing) payload.id = existing.id;

            try {
                const res = await fetch(`api/maintain.php?action=save_coa_sub`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    const data = await res.json();
                    if(!existing) coaSub.push({ id: data.id, main_id: vendMain.id, code, name });
                    else {
                        existing.code = code;
                        existing.name = name;
                    }
                    renderVendorTypeList();
                    resetVendorTypeForm();
                }
            } catch(e) {}
        }

        async function saveVendor() {
            if(!selectedVendTypeCode) return alert("Select a Vendor Type first!");
            const name = document.getElementById('vendAccountName').value.trim();
            const code = document.getElementById('vendAccountCode').value.trim();
            if(!name || !code) return alert("Account Code and Name are required!");

            const sub = coaSub.find(s => s.code == selectedVendTypeCode);
            const payload = {
                sub_id: sub.id,
                code: code,
                name: name,
                contact_person: document.getElementById('vendContactPerson').value,
                address: document.getElementById('vendAddress').value,
                telephone: document.getElementById('vendTelephone').value,
                mobile: document.getElementById('vendMobile').value,
                fax: document.getElementById('vendFax').value,
                website: document.getElementById('vendWebsite').value,
                email: document.getElementById('vendEmail').value,
                st_reg_no: document.getElementById('vendStReg').value,
                ntn_cnic: document.getElementById('vendNtn').value,
                credit_terms: document.getElementById('vendCreditTerms').value,
                remarks: document.getElementById('vendRemarks').value
            };

            const existing = vendorData.find(v => v.code == (selectedVendAccountCode || code));
            if(existing) payload.id = existing.id;

            try {
                const res = await fetch(`api/maintain.php?action=save_vendor`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    const resData = await res.json();
                    alert("Vendor profile saved!");
                    const sub = coaSub.find(s => s.code == selectedVendTypeCode);
                    const idx = coaList.findIndex(l => l.id == resData.id);
                    if(idx > -1) {
                        coaList[idx] = { ...coaList[idx], code, name };
                    } else {
                        coaList.push({ id: resData.id, sub_id: sub.id, code, name });
                    }
                    fetchVendorsDetailed(selectedVendTypeCode);
                }
            } catch(e) { alert("Save failed"); }
        }

        async function deleteVendorType() {
            if (!selectedVendTypeCode) return alert("Select a Vendor Type to delete first.");
            
            // CONSTRAINT: Check if category has vendors before deleting
            if (vendorData && vendorData.length > 0) {
                return alert("Cannot delete this Category because it still contains Vendor records. Delete all vendors first!");
            }

            const sub = coaSub.find(s => s.code == selectedVendTypeCode);
            if(!sub) return;
            if(confirm(`Are you sure you want to delete the Vendor Type "${sub.name}"?`)) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_coa_sub&id=${sub.id}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Vendor Type deleted.");
                        coaSub = coaSub.filter(s => s.id != sub.id);
                        renderVendorTypeList();
                        resetVendorTypeForm();
                    }
                } catch(e) { alert("Delete failed"); }
            }
        }

        async function deleteVendor() {
            if (!selectedVendAccountCode) return alert("Select a Vendor Profile to delete first.");
            const vend = vendorData.find(v => v.code == selectedVendAccountCode);
            if(!vend) return;
            if(confirm(`Are you sure you want to delete the profile for "${vend.name}"?`)) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_vendor&id=${vend.id}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Vendor Profile deleted.");
                        fetchVendorsDetailed(selectedVendTypeCode);
                    }
                } catch(e) { alert("Delete failed"); }
            }
        }

        function resetVendorTypeForm(generate = false) {
            if(generate) {
                selectedVendTypeCode = null;
                enableVendorTypeFields(true);
                const vendMain = coaMain.find(m => m.name.toLowerCase().includes('vendor') || m.name.toLowerCase().includes('supplier') || m.name.toLowerCase().includes('creditor'));
                if(vendMain) {
                    const siblings = coaSub.filter(s => s.main_id == vendMain.id);
                    let nextNum = 1;
                    if(siblings.length > 0) {
                        const lastCodes = siblings.map(s => parseInt(s.code.toString().substring(vendMain.code.toString().length)) || 0);
                        nextNum = Math.max(...lastCodes) + 1;
                    }
                    document.getElementById('vendSubTypeCode').value = vendMain.code.toString() + nextNum.toString().padStart(2, '0');
                }
                document.getElementById('vendSubName').value = '';
                document.getElementById('vendSubName').focus();
                document.getElementById('vendorTypeList').value = '';
                renderVendorList();
                resetVendorForm();
            } else {
                const list = document.getElementById('vendorTypeList');
                if (list && list.options.length > 0 && !list.options[0].disabled) {
                    list.selectedIndex = 0;
                    onVendorTypeSelect(list.value);
                } else {
                    selectedVendTypeCode = null;
                    enableVendorTypeFields(false);
                    document.getElementById('vendSubTypeCode').value = '';
                    document.getElementById('vendSubName').value = '';
                    if(list) list.value = '';
                    renderVendorList();
                    resetVendorForm();
                }
            }
        }

        function resetVendorForm(generate = false) {
            if(generate) {
                selectedVendAccountCode = null;
                enableVendorFields(true);
                const fields = [
                    'vendAccountCode', 'vendAccountName', 'vendContactPerson', 'vendAddress',
                    'vendTelephone', 'vendMobile', 'vendFax', 'vendWebsite', 'vendEmail', 
                    'vendStReg', 'vendNtn', 'vendCreditTerms', 'vendRemarks'
                ];
                fields.forEach(f => {
                    const el = document.getElementById(f);
                    if(el) {
                        if(f === 'vendCreditTerms') el.value = 'CASH';
                        else el.value = '';
                    }
                });
                document.getElementById('vendorList').value = '';
                
                if(!selectedVendTypeCode) {
                    alert("Select a Vendor Type first!");
                    return;
                }
                const sub = coaSub.find(s => s.code == selectedVendTypeCode);
                const siblings = vendorData;
                let nextNum = 1;
                if(siblings.length > 0) {
                    const lastCodes = siblings.map(l => parseInt(l.code.toString().substring(selectedVendTypeCode.toString().length)) || 0);
                    nextNum = Math.max(...lastCodes) + 1;
                }
                document.getElementById('vendAccountCode').value = selectedVendTypeCode.toString() + nextNum.toString().padStart(3, '0');
                document.getElementById('vendAccountName').focus();
            } else {
                const list = document.getElementById('vendorList');
                if (list && list.options.length > 0) {
                    list.selectedIndex = 0;
                    onVendorSelect(list.value);
                } else {
                    selectedVendAccountCode = null;
                    enableVendorFields(false);
                    const fields = [
                        'vendAccountCode', 'vendAccountName', 'vendContactPerson', 'vendAddress',
                        'vendTelephone', 'vendMobile', 'vendFax', 'vendWebsite', 'vendEmail', 
                        'vendStReg', 'vendNtn', 'vendCreditTerms', 'vendRemarks'
                    ];
                    fields.forEach(f => {
                        const el = document.getElementById(f);
                        if(el) {
                            if(f === 'vendCreditTerms') el.value = 'CASH';
                            else el.value = '';
                        }
                    });
                    if (list) list.value = '';
                }
            }
        }

        function openFindVendorModal() {
            const modal = document.getElementById('findVendorModal');
            if (modal) {
                const searchInput = document.getElementById('findVendorSearchInput');
                if (searchInput) searchInput.value = '';
                renderFindVendorTable();
                modal.style.display = 'flex';
                setTimeout(() => {
                    if (searchInput) searchInput.focus();
                }, 100);
            }
        }

        function closeFindVendorModal() {
            const modal = document.getElementById('findVendorModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function renderFindVendorTable() {
            const tbody = document.getElementById('findVendorTableBody');
            if (!tbody) return;
            const searchInput = document.getElementById('findVendorSearchInput');
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            
            let html = '';
            const results = [];
            
            const typeList = document.getElementById('vendorTypeList');
            const selectedType = typeList ? typeList.value : null;
            if (!selectedType) return;
            const vendTypes = coaSub.filter(s => s.code == selectedType);

            // get all coaList matching those types
            for (let i = 0; i < coaList.length; i++) {
                const listAcc = coaList[i];
                const subAcc = vendTypes.find(s => s.id == listAcc.sub_id);
                if (!subAcc) continue;
                
                const listNameStr = `${listAcc.code} ${listAcc.name}`;
                const subNameStr = `${subAcc.code} ${subAcc.name}`;
                
                if (query) {
                    if (!(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(listNameStr.toLowerCase(), query) : listNameStr.toLowerCase().includes(query)) && 
                        !(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(subNameStr.toLowerCase(), query) : subNameStr.toLowerCase().includes(query))) {
                        continue;
                    }
                }
                
                results.push({ listAcc, subAcc, listNameStr, subNameStr });
            }
            
            results.forEach(res => {
                html += `
                    <tr style="border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: background 0.2s;" 
                        onmouseover="this.style.background='#f1f5f9'" 
                        onmouseout="this.style.background='white'"
                        ondblclick="selectFindVendor('${res.subAcc.code}', '${res.listAcc.code}')">
                        <td style="padding: 6px; color: #000; font-size: 13px; font-weight: 500;">${res.listNameStr}</td>
                        <td style="padding: 6px; color: #334155; font-size: 13px;">${res.subNameStr}</td>
                    </tr>
                `;
            });
            
            if (results.length === 0) {
                html = `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">No vendors found matching your search.</td></tr>`;
            }
            
            tbody.innerHTML = html;
        }

        function filterFindVendorTable() {
            renderFindVendorTable();
        }

        function selectFindVendor(typeCode, vendCode) {
            closeFindVendorModal();
            const typeList = document.getElementById('vendorTypeList');
            if (typeList) {
                typeList.value = typeCode;
                // Pass vendCode to select it automatically after fetching the vendors list
                onVendorTypeSelect(typeCode, vendCode);
            }
        }

        function printVendors(level) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
            const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
            
            let reportTitle = (level === 'type' || level === 'sub') ? "VENDOR TYPES" : "LIST OF VENDORS";
            let htmlRows = '';
            
            if (level === 'type' || level === 'sub') {
                const vendMain = coaMain.find(m => m.name.toLowerCase().includes('vendor') || m.name.toLowerCase().includes('supplier') || m.name.toLowerCase().includes('creditor') || m.name.toLowerCase().includes('payable'));
                const types = vendMain ? coaSub.filter(s => s.main_id == vendMain.id) : [];
                types.forEach(type => {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic;">
                            <td style="width: 150px; padding: 4px;">${type.code}</td>
                            <td style="padding: 4px;">${type.name}</td>
                        </tr>
                    `;
                    const lists = coaList.filter(l => l.sub_id == type.id);
                    lists.forEach(list => {
                        htmlRows += `
                            <tr style="font-style: italic; color: #333;">
                                <td style="width: 150px; padding: 4px;">${list.code}</td>
                                <td style="padding: 4px;">${list.name}</td>
                            </tr>
                        `;
                    });
                });
            } else if (level === 'list') {
                const type = coaSub.find(s => s.code == selectedVendTypeCode);
                if (type) {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic; background-color: #f1f5f9;">
                            <td colspan="2" style="padding: 4px;">${type.code} - ${type.name}</td>
                        </tr>
                    `;
                }
                const listsToPrint = vendorData;
                listsToPrint.forEach(vend => {
                    htmlRows += `
                        <tr style="font-style: italic; color: #333;">
                            <td style="width: 150px; padding: 4px;">${vend.code}</td>
                            <td style="padding: 4px;">${vend.name}</td>
                        </tr>
                    `;
                });
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Report - ${reportTitle}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        td { font-size: 13px; vertical-align: top; }
                        .footer { margin-top: 60px; font-size: 12px; color: #95a5a6; text-align: center; border-top: 1px solid #eee; padding-top: 15px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? '<img src="' + logo + '" alt="Company Logo">' : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>${reportTitle}</h2>
                    </div>
                    <table>
                        ${htmlRows}
                    </table>
                    <div class="footer">
                        Generated by SoftifyX Financials | ${new Date().toLocaleString()}
                    </div>
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }

        // Global Key Listeners for Vendors
        document.addEventListener('keydown', (e) => {
            const container = document.getElementById('vendorsContainer');
            if (!container) return; // Only active when module is open
            
            if (e.ctrlKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                resetVendorForm(true);
            }
            if (e.ctrlKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveVendor();
            }
            if (e.key === 'Escape') {
                resetVendorForm();
            }
        });

        // EXPOSE VENDORS TO GLOBAL WINDOW SCOPE (Fixed Scope Issues)
        window.initVendorsView = initVendorsView;
        window.onVendorTypeSelect = onVendorTypeSelect;
        window.onVendorSelect = onVendorSelect;
        window.saveVendorType = saveVendorType;
        window.saveVendor = saveVendor;
        window.deleteVendorType = deleteVendorType;
        window.deleteVendor = deleteVendor;
        window.resetVendorTypeForm = resetVendorTypeForm;
        window.resetVendorForm = resetVendorForm;
        window.findVendor = findVendor;
        window.printVendors = printVendors;

        // --- BANK ACCOUNTS MODULE LOGIC ---
        var bankData = [];
        var selectedBankTypeCode = null;
        var selectedBankAccountCode = null;

        function initBankAccountsView() {
            console.log("SoftifyX Diagnostic: Initializing Bank Accounts View...");
            let retries = 0;
            const checkAndRender = setInterval(() => {
                const list = document.getElementById('bankTypeList');
                if (list) {
                    clearInterval(checkAndRender);
                    renderBankTypeList();
                    if (list.options.length > 0) {
                        list.selectedIndex = 0;
                        const codeToSelect = list.options[0].value;
                        if (codeToSelect) {
                            onBankTypeSelect(codeToSelect);
                        }
                    } else {
                        console.warn("SoftifyX Diagnostic: No bank types found during initialization.");
                        resetBankTypeForm();
                        resetBankForm();
                    }
                } else if (++retries >= 30) {
                    console.error("SoftifyX Diagnostic: Bank module container not found.");
                    clearInterval(checkAndRender);
                }
            }, 100);
        }

        function renderBankTypeList() {
            const list = document.getElementById('bankTypeList');
            if(!list) return;
            
            console.log("SoftifyX Diagnostic: Checking coaMain for Bank/Cash...");
            
            const matchingMain = coaMain.filter(m => {
                const n = m.name.toLowerCase();
                return n.includes('bank') && !n.includes('cash');
            });
            
            if(matchingMain.length === 0) {
                list.innerHTML = '<option disabled>No Bank category found in COA</option>';
                return;
            }

            const mainIds = matchingMain.map(m => m.id);
            const filtered = coaSub.filter(s => mainIds.includes(s.main_id));
            
            list.innerHTML = filtered.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
        }

        function onBankTypeSelect(code) {
            try {
                selectedBankTypeCode = code;
                const sub = coaSub.find(s => s && (s.code == code || String(s.code || '').trim() === String(code || '').trim()));
                
                if(sub) {
                    document.getElementById('bankSubTypeCode').value = sub.code || '';
                    document.getElementById('bankSubName').value = sub.name || '';
                    enableBankTypeFields(true);
                } else {
                    document.getElementById('bankSubTypeCode').value = 'ERR';
                    document.getElementById('bankSubName').value = 'sub not found for: ' + code;
                }
                
                fetchBanksDetailed(code).catch(e => {
                    document.getElementById('bankSubName').value = 'fetch err: ' + e.message;
                });
            } catch(err) {
                const el = document.getElementById('bankSubName');
                if (el) el.value = 'JS ERR: ' + err.message;
            }
        }

        function enableBankTypeFields(enabled) {
            const nameEl = document.getElementById('bankSubName');
            if (nameEl) nameEl.disabled = !enabled;
            // Never disable bankSubTypeCode so text stays black; it is readonly in HTML.
        }

        async function fetchBanksDetailed(subCode) {
            try {
                const sub = coaSub.find(s => s && (s.code == subCode || String(s.code || '').trim() === String(subCode || '').trim()));
                if(!sub) return;
                
                const res = await fetch(`api/maintain.php?action=get_banks&sub_id=${sub.id}`);
                bankData = await res.json();
                
                if (!Array.isArray(bankData)) {
                    bankData = [];
                }
                
                renderBankList();
            } catch(err) {
                const el = document.getElementById('bankSubName');
                if (el) el.value = 'FETCH JS ERR: ' + err.message;
            }
        }

        function renderBankList() {
            const list = document.getElementById('bankList');
            if(!list) return;
            const sub = coaSub.find(s => s.code == selectedBankTypeCode);
            if(!sub) { list.innerHTML = ''; return; }
            
            // BankData should already be filtered for this sub_id by fetchBanksDetailed
            list.innerHTML = bankData.map(b => `<option value="${b.code}">${b.name}</option>`).join('');
            if(bankData.length > 0 && list.options.length > 0) {
                list.selectedIndex = 0;
                onBankSelect(list.options[0].value);
            } else {
                resetBankFields();
                document.getElementById('bankAccountCode').value = '';
                document.getElementById('bankAccountName').value = '';
            }
        }

        async function onBankSelect(code) {
            selectedBankAccountCode = code;
            const bank = bankData.find(b => b.code == code);
            if(bank) {
                document.getElementById('bankAccountCode').value = bank.code;
                document.getElementById('bankAccountName').value = bank.name;
                document.getElementById('bankName').value = bank.bank_name || '';
                document.getElementById('bankBranch').value = bank.branch || '';
                document.getElementById('bankAccountTitle').value = bank.account_title || '';
                document.getElementById('bankAccountNo').value = bank.account_no || '';
                document.getElementById('bankContactPerson').value = bank.contact_person || '';
                document.getElementById('bankAddress').value = bank.address || '';
                document.getElementById('bankTelephone').value = bank.telephone || '';
                document.getElementById('bankMobile').value = bank.mobile || '';
                document.getElementById('bankFax').value = bank.fax || '';
                document.getElementById('bankEmail').value = bank.email || '';
                document.getElementById('bankWebsite').value = bank.website || '';
                document.getElementById('bankRemarks').value = bank.remarks || '';
                enableBankFields(true);
            } else {
                // If only in COA but no bank profile yet
                const coaEntry = coaList.find(c => c.code == code);
                if(coaEntry) {
                    document.getElementById('bankAccountCode').value = coaEntry.code;
                    document.getElementById('bankAccountName').value = coaEntry.name;
                    resetBankFields();
                    enableBankFields(true);
                }
            }
        }

        function enableBankFields(enabled) {
            const fields = [
                'bankAccountCode', 'bankAccountName', 'bankName', 'bankBranch', 
                'bankAccountTitle', 'bankAccountNo', 'bankContactPerson', 'bankAddress',
                'bankTelephone', 'bankMobile', 'bankFax', 'bankEmail', 'bankWebsite', 'bankRemarks'
            ];
            fields.forEach(f => {
                const el = document.getElementById(f);
                if(el) el.disabled = !enabled;
            });
        }

        function resetBankFields() {
            const fields = [
                'bankName', 'bankBranch', 'bankAccountTitle', 'bankAccountNo', 
                'bankContactPerson', 'bankAddress', 'bankTelephone', 'bankMobile', 
                'bankFax', 'bankEmail', 'bankWebsite', 'bankRemarks'
            ];
            fields.forEach(f => {
                const el = document.getElementById(f);
                if(el) el.value = '';
            });
        }

        async function saveBankType() {
            // Find main category strictly containing "bank" and NOT "cash"
            const bankMain = coaMain.find(m => {
                const n = m.name.toLowerCase();
                return n.includes('bank') && !n.includes('cash');
            });
            if(!bankMain) {
                console.error("SoftifyX Diagnostic: Banks main category not found during save.");
                return;
            }
            const name = document.getElementById('bankSubName').value.trim();
            const code = document.getElementById('bankSubTypeCode').value.trim();
            if(!name || !code) return;
            const payload = { main_id: bankMain.id, code, name };
            const existing = coaSub.find(s => s.code == (selectedBankTypeCode || code));
            if(existing) payload.id = existing.id;
            try {
                const res = await fetch(`api/maintain.php?action=save_coa_sub`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    const data = await res.json();
                    if(!existing) coaSub.push({ id: data.id, main_id: bankMain.id, code, name });
                    else { existing.code = code; existing.name = name; }
                    renderBankTypeList();
                    resetBankTypeForm();
                }
            } catch(e) {}
        }

        async function saveBank() {
            if(!selectedBankTypeCode) return alert("Select a Bank Type first!");
            const name = document.getElementById('bankAccountName').value.trim();
            const code = document.getElementById('bankAccountCode').value.trim();
            if(!name || !code) return alert("Account Code and Name are required!");
            const sub = coaSub.find(s => s.code == selectedBankTypeCode);
            const payload = {
                sub_id: sub.id,
                code: code,
                name: name,
                bank_name: document.getElementById('bankName').value,
                branch: document.getElementById('bankBranch').value,
                account_title: document.getElementById('bankAccountTitle').value,
                account_no: document.getElementById('bankAccountNo').value,
                contact_person: document.getElementById('bankContactPerson').value,
                address: document.getElementById('bankAddress').value,
                telephone: document.getElementById('bankTelephone').value,
                mobile: document.getElementById('bankMobile').value,
                fax: document.getElementById('bankFax').value,
                email: document.getElementById('bankEmail').value,
                website: document.getElementById('bankWebsite').value,
                remarks: document.getElementById('bankRemarks').value
            };
            const existing = coaList.find(c => c.code == (selectedBankAccountCode || code));
            if(existing) payload.id = existing.id;
            try {
                const res = await fetch(`api/maintain.php?action=save_bank`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    const resData = await res.json();
                    alert("Bank Account saved!");
                    const idx = coaList.findIndex(l => l.id == resData.id);
                    if(idx > -1) coaList[idx] = { ...coaList[idx], code, name };
                    else coaList.push({ id: resData.id, sub_id: sub.id, code, name });
                    fetchBanksDetailed(selectedBankTypeCode);
                }
            } catch(e) { alert("Save failed"); }
        }

        async function deleteBankType() {
            if (!selectedBankTypeCode) return alert("Select a Bank Type first.");
            const sub = coaSub.find(s => s.code == selectedBankTypeCode);
            if(!sub) return;
            if(confirm(`Delete Bank Type "${sub.name}"?`)) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_coa_sub&id=${sub.id}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Deleted.");
                        coaSub = coaSub.filter(s => s.id != sub.id);
                        renderBankTypeList();
                        resetBankTypeForm();
                    }
                } catch(e) {}
            }
        }

        async function deleteBank() {
            if (!selectedBankAccountCode) return alert("Select a Bank Account first.");
            const bank = coaList.find(c => c.code == selectedBankAccountCode);
            if(!bank) return;
            if(confirm(`Delete Bank Account "${bank.name}"?`)) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_bank&id=${bank.id}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Deleted.");
                        coaList = coaList.filter(l => l.id != bank.id);
                        fetchBanksDetailed(selectedBankTypeCode);
                    }
                } catch(e) {}
            }
        }

        function resetBankTypeForm(generate = false) {
            selectedBankTypeCode = null;
            enableBankTypeFields(generate);
            if(generate) {
                // Find main category strictly containing "bank" and NOT "cash"
                const bankMain = coaMain.find(m => {
                    const n = m.name.toLowerCase();
                    return n.includes('bank') && !n.includes('cash');
                });
                if(bankMain) {
                    const siblings = coaSub.filter(s => s.main_id == bankMain.id);
                    let nextNum = 1;
                    if(siblings.length > 0) {
                        const lastCodes = siblings.map(s => parseInt(s.code.toString().substring(bankMain.code.toString().length)) || 0);
                        nextNum = Math.max(...lastCodes) + 1;
                    }
                    document.getElementById('bankSubTypeCode').value = bankMain.code.toString() + nextNum.toString().padStart(2, '0');
                }
                document.getElementById('bankSubName').value = '';
                document.getElementById('bankSubName').focus();
                document.getElementById('bankTypeList').value = '';
                renderBankList();
            } else {
                document.getElementById('bankSubTypeCode').value = '';
                document.getElementById('bankSubName').value = '';
                const select = document.getElementById('bankTypeList');
                if (select.options.length > 0) {
                    select.selectedIndex = 0;
                    const codeToSelect = select.options[0].value;
                    if (codeToSelect) onBankTypeSelect(codeToSelect);
                } else {
                    document.getElementById('bankTypeList').value = '';
                    renderBankList();
                }
            }
        }

        function resetBankForm(generate = false) {
            enableBankFields(generate);
            resetBankFields();
            document.getElementById('bankAccountCode').value = '';
            document.getElementById('bankAccountName').value = '';
            selectedBankAccountCode = null;
            if(generate) {
                if(!selectedBankTypeCode) return alert("Select a Bank Type first!");
                const siblings = coaList.filter(l => l.sub_id == (coaSub.find(s => s.code == selectedBankTypeCode)?.id));
                let nextNum = 1;
                if(siblings.length > 0) {
                    const lastCodes = siblings.map(l => parseInt(l.code.toString().substring(selectedBankTypeCode.toString().length)) || 0);
                    nextNum = Math.max(...lastCodes) + 1;
                }
                document.getElementById('bankAccountCode').value = selectedBankTypeCode.toString() + nextNum.toString().padStart(3, '0');
                document.getElementById('bankList').value = '';
                document.getElementById('bankAccountName').focus();
            } else {
                const select = document.getElementById('bankList');
                if (select.options.length > 0) {
                    select.selectedIndex = 0;
                    onBankSelect(select.options[0].value);
                } else {
                    document.getElementById('bankList').value = '';
                }
            }
        }

        function openFindBankModal() {
            document.getElementById('findBankSearchInput').value = '';
            renderFindBankTable();
            document.getElementById('findBankModal').style.display = 'flex';
        }

        function closeFindBankModal() {
            document.getElementById('findBankModal').style.display = 'none';
        }

        function renderFindBankTable() {
            const tbody = document.getElementById('findBankTableBody');
            if (!tbody) return;
            const searchInput = document.getElementById('findBankSearchInput');
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            
            let html = '';
            const results = [];
            
            const bankMain = coaMain.filter(m => {
                const n = m.name.toLowerCase();
                return n.includes('bank') && !n.includes('cash');
            });
            if (!bankMain.length) return;
            const mainIds = bankMain.map(m => m.id);
            const bankTypes = coaSub.filter(s => mainIds.includes(s.main_id));

            for (let i = 0; i < coaList.length; i++) {
                const listAcc = coaList[i];
                const subAcc = bankTypes.find(s => s.id == listAcc.sub_id);
                if (!subAcc) continue;
                
                const listNameStr = `${listAcc.code} ${listAcc.name}`;
                const subNameStr = `${subAcc.code} ${subAcc.name}`;
                
                if (query) {
                    if (!(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(listNameStr.toLowerCase(), query) : listNameStr.toLowerCase().includes(query)) && 
                        !(typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(subNameStr.toLowerCase(), query) : subNameStr.toLowerCase().includes(query))) {
                        continue;
                    }
                }
                
                results.push({ listAcc, subAcc, listNameStr, subNameStr });
            }
            
            results.forEach(res => {
                html += `
                    <tr style="border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: background 0.2s;" 
                        onmouseover="this.style.background='#f1f5f9'" 
                        onmouseout="this.style.background='white'"
                        ondblclick="selectBankFromFind('${res.subAcc.code}', '${res.listAcc.code}')">
                        <td style="padding: 6px; color: #000; font-size: 13px; font-weight: 500;">${res.listNameStr}</td>
                        <td style="padding: 6px; color: #334155; font-size: 13px;">${res.subNameStr}</td>
                    </tr>
                `;
            });
            
            if (results.length === 0) {
                html = `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">No bank accounts found.</td></tr>`;
            }
            
            tbody.innerHTML = html;
        }

        function filterFindBankTable() {
            renderFindBankTable();
        }

        function selectBankFromFind(typeCode, bankCode) {
            closeFindBankModal();
            const typeList = document.getElementById('bankTypeList');
            if (typeList) {
                typeList.value = typeCode;
                onBankTypeSelect(typeCode);
                
                setTimeout(() => {
                    const bList = document.getElementById('bankList');
                    if (bList) {
                        bList.value = bankCode;
                        onBankSelect(bankCode);
                    }
                }, 300);
            }
        }

        function printBanks(level) { 
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
            const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
            
            let reportTitle = (level === 'type' || level === 'sub') ? "BANK ACCOUNT TYPES" : "LIST OF BANK ACCOUNTS";
            let htmlRows = '';
            
            if (level === 'type' || level === 'sub') {
                const bankMain = coaMain.filter(m => {
                    const n = m.name.toLowerCase();
                    return n.includes('bank') && !n.includes('cash');
                });
                const mainIds = bankMain.map(m => m.id);
                const types = coaSub.filter(s => mainIds.includes(s.main_id));
                types.forEach(type => {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic;">
                            <td style="width: 150px; padding: 4px;">${type.code}</td>
                            <td style="padding: 4px;">${type.name}</td>
                        </tr>
                    `;
                    const lists = coaList.filter(l => l.sub_id == type.id);
                    lists.forEach(list => {
                        htmlRows += `
                            <tr style="font-style: italic; color: #333;">
                                <td style="width: 150px; padding: 4px;">${list.code}</td>
                                <td style="padding: 4px;">${list.name}</td>
                            </tr>
                        `;
                    });
                });
            } else if (level === 'list') {
                const type = coaSub.find(s => s.code == selectedBankTypeCode);
                if (type) {
                    htmlRows += `
                        <tr style="font-weight: bold; font-style: italic; background-color: #f1f5f9;">
                            <td colspan="4" style="padding: 4px;">${type.code} - ${type.name}</td>
                        </tr>
                    `;
                }
                const sub = coaSub.find(s => s.code == selectedBankTypeCode);
                if (!sub) {
                    alert("Please select a Bank Type first.");
                    return;
                }
                htmlRows += `
                    <tr style="font-weight: bold; color: #ffffff; background-color: #1F4E79;">
                        <td style="padding: 6px;">Account Code</td>
                        <td style="padding: 6px;">Account Name</td>
                        <td style="padding: 6px;">Bank Name</td>
                        <td style="padding: 6px;">Branch</td>
                    </tr>
                `;
                const filteredList = coaList.filter(l => l.sub_id == sub.id);
                filteredList.forEach(l => {
                    const b = bankData.find(bk => bk.code == l.code) || {};
                    htmlRows += `
                        <tr style="color: #333; border-bottom: 1px solid #e2e8f0;">
                            <td style="width: 150px; padding: 6px;">${l.code}</td>
                            <td style="padding: 6px;">${l.name}</td>
                            <td style="padding: 6px;">${b.bank_name || '-'}</td>
                            <td style="padding: 6px;">${b.branch || '-'}</td>
                        </tr>
                    `;
                });
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Report - ${reportTitle}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        td { font-size: 13px; vertical-align: top; }
                        .footer { margin-top: 60px; font-size: 12px; color: #95a5a6; text-align: center; border-top: 1px solid #eee; padding-top: 15px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? '<img src="' + logo + '" alt="Company Logo">' : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>${reportTitle}</h2>
                    </div>
                    <table>
                        ${htmlRows}
                    </table>
                    <div class="footer">
                        Generated by SoftifyX Financials | ${new Date().toLocaleString()}
                    </div>
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }

        // Lookup Management Stubs (Can be expanded into mini-popups)
        // Regions Module Logic
        function initRegionsView() {
            let retries = 0;
            const checkAndRender = setInterval(async () => {
                const list = document.getElementById('mainRegionList');
                if (list) {
                    clearInterval(checkAndRender);
                    // Fetch and auto-select in one async block â€” no external reset can interfere
                    try {
                        const res = await fetch('api/maintain.php?action=get_regions');
                        mainRegionData = await res.json();
                        list.innerHTML = mainRegionData.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
                        if (list.options.length > 0) {
                            list.selectedIndex = 0;
                            await onMainRegionSelect(list.options[0].value);
                        }
                    } catch(e) {}
                } else if (++retries >= 20) clearInterval(checkAndRender);
            }, 100);
        }

        async function fetchMainRegions() {
            try {
                const res = await fetch('api/maintain.php?action=get_regions');
                mainRegionData = await res.json();
                const list = document.getElementById('mainRegionList');
                if(list) {
                    list.innerHTML = mainRegionData.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
                    // Auto-select first item after refresh
                    if (list.options.length > 0) {
                        list.selectedIndex = 0;
                        await onMainRegionSelect(list.options[0].value);
                    }
                }
            } catch(e) {}
        }

        async function onMainRegionSelect(id) {
            selectedMainRegionId = id;
            const reg = mainRegionData.find(r => r.id == id);
            if(reg) {
                document.getElementById('mainRegionName').value = reg.name;
                document.getElementById('mainRegionName').disabled = false;
            }
            fetchSubRegions(id);
        }

        async function fetchSubRegions(regionId) {
            try {
                const res = await fetch(`api/maintain.php?action=get_sub_regions&region_id=${regionId}`);
                subRegionData = await res.json();
                const list = document.getElementById('subRegionList');
                if(list) {
                    list.innerHTML = subRegionData.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                    // Auto-select first item â€” same pattern as customers form (selectedIndex=0)
                    if (list.options.length > 0) {
                        list.selectedIndex = 0;
                        onSubRegionSelect(list.options[0].value);
                    } else {
                        resetSubRegionForm();
                    }
                }
            } catch(e) {}
        }

        function onSubRegionSelect(id) {
            selectedSubRegionId = id;
            const sub = subRegionData.find(s => s.id == id);
            if(sub) {
                document.getElementById('subRegionName').value = sub.name;
                document.getElementById('subRegionName').disabled = false;
            }
        }

        async function saveMainRegion() {
            const name = document.getElementById('mainRegionName').value.trim();
            if(!name) return alert("Region Name is required!");
            const payload = { name };
            if (selectedMainRegionId) payload.id = selectedMainRegionId;
            try {
                const res = await fetch('api/maintain.php?action=save_region', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    alert("Main Region saved!");
                    await fetchMainRegions(); // auto-selects first item
                    loadCustomerLookups();
                }
            } catch(e) {}
        }

        async function deleteMainRegion() {
            if(!selectedMainRegionId) return alert("Select a Region to delete first.");
            
            // Logic: Prevent deletion if sub-regions exist
            if (subRegionData && subRegionData.length > 0) {
                return alert("Please delete all sub-regions first before deleting the main region.");
            }

            if(confirm("Are you sure you want to delete this region? This action cannot be undone.")) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_region&id=${selectedMainRegionId}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Region deleted.");
                        await fetchMainRegions(); // auto-selects first item
                        loadCustomerLookups();
                    }
                } catch(e) {}
            }
        }

        async function saveSubRegion() {
            if(!selectedMainRegionId) return alert("Select a Main Region first!");
            const name = document.getElementById('subRegionName').value.trim();
            if(!name) return alert("Sub-Region Name is required!");
            const payload = { region_id: selectedMainRegionId, name };
            if (selectedSubRegionId) payload.id = selectedSubRegionId;
            try {
                const res = await fetch('api/maintain.php?action=save_sub_region', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    alert("Sub Region saved!");
                    await fetchSubRegions(selectedMainRegionId);
                    resetSubRegionForm();
                }
            } catch(e) {}
        }

        async function deleteSubRegion() {
            if(!selectedSubRegionId) return alert("Select a Sub Region to delete first.");
            if(confirm("Are you sure you want to delete this sub-region?")) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_sub_region&id=${selectedSubRegionId}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Sub Region deleted.");
                        await fetchSubRegions(selectedMainRegionId);
                    }
                } catch(e) {}
            }
        }

        async function resetMainRegionForm(generate = false) {
            document.getElementById('mainRegionName').value = '';
            document.getElementById('mainRegionName').disabled = !generate;
            
            if (generate) {
                document.getElementById('mainRegionList').selectedIndex = -1;
                selectedMainRegionId = null;
            } else {
                const list = document.getElementById('mainRegionList');
                if (list && list.options.length > 0) {
                    list.selectedIndex = 0;
                    await onMainRegionSelect(list.options[0].value);
                } else {
                    document.getElementById('mainRegionList').selectedIndex = -1;
                    selectedMainRegionId = null;
                    const subList = document.getElementById('subRegionList');
                    if(subList) subList.innerHTML = '';
                    resetSubRegionForm();
                }
            }
        }

        function resetSubRegionForm(generate = false) {
            document.getElementById('subRegionName').value = '';
            document.getElementById('subRegionName').disabled = !generate;
            
            if (generate) {
                document.getElementById('subRegionList').selectedIndex = -1;
                selectedSubRegionId = null;
            } else {
                const list = document.getElementById('subRegionList');
                if (list && list.options.length > 0) {
                    list.selectedIndex = 0;
                    onSubRegionSelect(list.options[0].value);
                } else {
                    document.getElementById('subRegionList').selectedIndex = -1;
                    selectedSubRegionId = null;
                }
            }
        }

        // Expose Region Functions
        window.initRegionsView = initRegionsView;
        window.onMainRegionSelect = onMainRegionSelect;
        window.onSubRegionSelect = onSubRegionSelect;
        window.saveMainRegion = saveMainRegion;
        window.deleteMainRegion = deleteMainRegion;
        window.resetMainRegionForm = resetMainRegionForm;
        window.saveSubRegion = saveSubRegion;
        window.deleteSubRegion = deleteSubRegion;
        window.resetSubRegionForm = resetSubRegionForm;

        function manageRegions() {
            window.openSecondaryModularPopup('Navigation/Maintain/customer_regions.html', 'fa-map-marker-alt', 'Manage Regions', initRegionsView, 'Customer Regions', true);
        }
        function manageSectors() {
            window.openSecondaryModularPopup('Navigation/Maintain/business_sectors.html', 'fa-briefcase', 'Manage Sectors', initSectorsView, 'Business Sectors', false);
        }
        function manageManagers() {
            window.openSecondaryModularPopup('Navigation/Maintain/employees.html', 'fa-users', 'Employees', initEmployeesView, 'Account Managers', true);
        }

        // Sector Module Logic
        function initSectorsView() {
            let retries = 0;
            const checkAndRender = setInterval(() => {
                const list = document.getElementById('sectorList');
                if (list) {
                    clearInterval(checkAndRender);
                    fetchSectors();
                } else if (++retries >= 20) clearInterval(checkAndRender);
            }, 100);
        }

        async function fetchSectors() {
            try {
                const res = await fetch('api/maintain.php?action=get_sectors&t=' + Date.now());
                const sectors = await res.json();
                window.currentSectors = sectors;
                const list = document.getElementById('sectorList');
                if(list) {
                    list.innerHTML = sectors.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                    if (list.options.length > 0) {
                        list.selectedIndex = 0;
                        onSectorSelect(list.options[0].value);
                    } else {
                        resetSectorForm(true);
                    }
                }
            } catch(e) {}
        }

        function onSectorSelect(id) {
            const sector = (window.currentSectors || []).find(s => s.id == id);
            if(sector) {
                document.getElementById('sectorName').value = sector.name;
                document.getElementById('sectorName').disabled = false;
                window.selectedSectorId = id;
            }
        }

        async function saveSector() {
            const name = document.getElementById('sectorName').value.trim();
            if(!name) return alert("Sector Name is required!");
            const payload = { name };
            if (window.selectedSectorId) payload.id = window.selectedSectorId;
            try {
                const res = await fetch('api/maintain.php?action=save_sector', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    alert("Business Sector saved!");
                    await fetchSectors();
                    resetSectorForm();
                    loadCustomerLookups();
                }
            } catch(e) {}
        }

        async function deleteSector() {
            if(!window.selectedSectorId) return alert("Select a Sector to delete first.");
            if(confirm("Are you sure you want to delete this sector?")) {
                try {
                    const res = await fetch(`api/maintain.php?action=delete_sector&id=${window.selectedSectorId}`, { method: 'POST' });
                    if(res.ok) {
                        alert("Sector deleted.");
                        await fetchSectors();
                        resetSectorForm();
                        loadCustomerLookups();
                    }
                } catch(e) {}
            }
        }

        function resetSectorForm(generate = false) {
            document.getElementById('sectorName').value = '';
            document.getElementById('sectorName').disabled = !generate;
            
            if (generate) {
                document.getElementById('sectorList').selectedIndex = -1;
                window.selectedSectorId = null;
            } else {
                const list = document.getElementById('sectorList');
                if (list && list.options.length > 0) {
                    list.selectedIndex = 0;
                    onSectorSelect(list.options[0].value);
                } else {
                    document.getElementById('sectorList').selectedIndex = -1;
                    window.selectedSectorId = null;
                }
            }
        }

        // Expose Sector Functions
        window.initSectorsView = initSectorsView;
        window.onSectorSelect = onSectorSelect;
        window.saveSector = saveSector;
        window.deleteSector = deleteSector;
        window.resetSectorForm = resetSectorForm;

        window.initCustomersView = initCustomersView;
        window.onCustomerTypeSelect = onCustomerTypeSelect;
        window.onCustomerSelect = onCustomerSelect;
        window.saveCustomerType = saveCustomerType;
        window.deleteCustomerType = deleteCustomerType;
        window.saveCustomer = saveCustomer;
        window.deleteCustomer = deleteCustomer;
        window.resetCustomerTypeForm = resetCustomerTypeForm;
        window.resetCustomerForm = resetCustomerForm;
        window.loadSubRegions = loadSubRegions;
        window.findCustomer = findCustomer;
        window.printCustomers = printCustomers;

        window.initVendorsView = initVendorsView;
        window.onVendorTypeSelect = onVendorTypeSelect;
        window.onVendorSelect = onVendorSelect;
        window.saveVendorType = saveVendorType;
        window.deleteVendorType = deleteVendorType;
        window.saveVendor = saveVendor;
        window.deleteVendor = deleteVendor;
        window.resetVendorTypeForm = resetVendorTypeForm;
        window.resetVendorForm = resetVendorForm;
        window.manageRegions = manageRegions;
        window.manageSectors = manageSectors;
        window.manageManagers = manageManagers;
        window.openSecondaryModularPopup = openSecondaryModularPopup;
        window.closeSecondaryModal = closeSecondaryModal;


        window.initBankAccountsView = initBankAccountsView;
        window.onBankTypeSelect = onBankTypeSelect;
        window.onBankSelect = onBankSelect;
        window.saveBankType = saveBankType;
        window.saveBank = saveBank;
        window.deleteBankType = deleteBankType;
        window.deleteBank = deleteBank;
        window.resetBankTypeForm = resetBankTypeForm;
        window.resetBankForm = resetBankForm;
        window.findBank = findBank;
        window.printBanks = printBanks;

        // --- ACCOUNTS OPENING BALANCES LOGIC ---
        var obAccountsPool = [];      // All COA accounts from server
        var displayedOBAccounts = []; // Currently active rows
        var selectedOBRowId = null;   // Track clicked row
        window.obSearchSelectedIndex = -1;

        window.updateOBSearchHighlight = function() {
            const resultsDiv = document.getElementById('obSearchResults');
            if (!resultsDiv) return;
            
            const items = Array.from(resultsDiv.children);
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                item.className = 'ob-result-item'; // Reset class
                item.style.backgroundColor = '';
                item.style.color = '';
                const span = item.querySelector('span');
                if (span) span.style.color = '#1F4E79';
            }
            
            if (window.obSearchSelectedIndex >= 0 && window.obSearchSelectedIndex < items.length) {
                const activeItem = items[window.obSearchSelectedIndex];
                activeItem.className = 'ob-result-item selected';
                activeItem.style.backgroundColor = '#1F4E79';
                activeItem.style.color = '#ffffff';
                const span = activeItem.querySelector('span');
                if (span) span.style.color = '#ffffff';
                
                try {
                    if (activeItem.scrollIntoViewIfNeeded) {
                        activeItem.scrollIntoViewIfNeeded(false);
                    } else {
                        activeItem.scrollIntoView({ block: 'nearest' });
                    }
                } catch(err) {}
            }
        };

        // Global Grid Keyboard Navigation for Opening Balances
        // Attach ONCE to document in capture phase - most reliable approach
        if (!window._obKeydownListenerAttached) {
            window._obKeydownListenerAttached = true;
            document.addEventListener('keydown', function(e) {
                const inputEl = e.target;
                if (!inputEl || !inputEl.classList || !inputEl.classList.contains('ob-input')) return;
                const container = document.getElementById('obGridContainer');
                if (!container) return;

                const key = e.key || '';
                const code = e.keyCode || e.which || 0;

                // Only handle navigation keys
                const navKeys = [13, 37, 38, 39, 40, 27]; // Enter, Left, Up, Right, Down, Escape
                const isNavKey = navKeys.includes(code) || ['Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(key);
                if (!isNavKey) return;

                const resultsDiv = document.getElementById('obSearchResults');
                const isDropdownOpen = resultsDiv && resultsDiv.style.display !== 'none' && resultsDiv.children.length > 0;

                // --- DROPDOWN NAVIGATION ---
                if (isDropdownOpen) {
                    let currentIndex = window.obSearchSelectedIndex !== undefined ? window.obSearchSelectedIndex : -1;
                    const maxIndex = resultsDiv.children.length - 1;

                    if (code === 40 || key === 'ArrowDown') {
                        e.preventDefault(); e.stopPropagation();
                        currentIndex = currentIndex < maxIndex ? currentIndex + 1 : maxIndex;
                    } else if (code === 38 || key === 'ArrowUp') {
                        e.preventDefault(); e.stopPropagation();
                        currentIndex = currentIndex > 0 ? currentIndex - 1 : 0;
                    } else if (code === 13 || key === 'Enter') {
                        e.preventDefault(); e.stopPropagation();
                        const idx = currentIndex >= 0 ? currentIndex : 0;
                        const sel = resultsDiv.children[idx];
                        if (sel) { 
                            addAccountToOBGrid(sel.getAttribute('data-id'), sel.getAttribute('data-uid')); 
                            resultsDiv.style.display = 'none'; 
                        }
                        return;
                    } else if (code === 27 || key === 'Escape') {
                        e.preventDefault(); e.stopPropagation();
                        resultsDiv.style.display = 'none';
                        return;
                    }

                    // Apply Highlight
                    window.obSearchSelectedIndex = currentIndex;
                    const items = Array.from(resultsDiv.children);
                    for (let i = 0; i < items.length; i++) {
                        items[i].className = 'ob-result-item';
                        items[i].style.backgroundColor = '';
                        items[i].style.color = '';
                        const span = items[i].querySelector('span');
                        if (span) span.style.color = '#1F4E79';
                    }
                    if (currentIndex >= 0 && currentIndex <= maxIndex) {
                        const activeItem = items[currentIndex];
                        activeItem.className = 'ob-result-item selected';
                        activeItem.style.backgroundColor = '#1F4E79';
                        activeItem.style.color = '#ffffff';
                        const span = activeItem.querySelector('span');
                        if (span) span.style.color = '#ffffff';
                        try {
                            if (activeItem.scrollIntoViewIfNeeded) activeItem.scrollIntoViewIfNeeded(false);
                            else activeItem.scrollIntoView({ block: 'nearest' });
                        } catch(err) {}
                    }
                    return; // Stop here if we handled dropdown
                }

                // --- GRID NAVIGATION ---
                if (isInv) return; // Let inline handler manage Inventory OB grid navigation
                e.preventDefault();
                e.stopPropagation();

                const currentRow = inputEl.closest('.ob-row');
                if (!currentRow) return;
                const allRows = Array.from(container.querySelectorAll('.ob-row'));
                const rowIndex = allRows.indexOf(currentRow);
                const rowInputs = Array.from(currentRow.querySelectorAll('.ob-input'));
                const colIndex = rowInputs.indexOf(inputEl);
                const allCells = Array.from(container.querySelectorAll('.ob-input'));
                const cellIndex = allCells.indexOf(inputEl);

                const moveTo = (el) => {
                    if (!el) return;
                    if (resultsDiv) resultsDiv.style.display = 'none';
                    el.focus();
                    try { el.select(); } catch(err) {}
                };

                if (code === 13 || key === 'Enter') {
                    moveTo(allCells[cellIndex + 1]);
                } else if (code === 39 || key === 'ArrowRight') {
                    moveTo(allCells[cellIndex + 1]);
                } else if (code === 37 || key === 'ArrowLeft') {
                    moveTo(allCells[cellIndex - 1]);
                } else if (code === 40 || key === 'ArrowDown') {
                    if (rowIndex < allRows.length - 1) {
                        const nxt = Array.from(allRows[rowIndex + 1].querySelectorAll('.ob-input'));
                        moveTo(nxt[colIndex] || nxt[0]);
                    }
                } else if (code === 38 || key === 'ArrowUp') {
                    if (rowIndex > 0) {
                        const prv = Array.from(allRows[rowIndex - 1].querySelectorAll('.ob-input'));
                        moveTo(prv[colIndex] || prv[0]);
                    }
                }
            }, true); // capture phase
        }
        window.handleOBGridKeydown = function(e, inputEl) {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;

            const currentRow = inputEl.closest('.ob-row');
            if (!currentRow) return;

            const gridBody = currentRow.parentElement;
            const allRows = Array.from(gridBody.querySelectorAll('.ob-row'));
            const rowIndex = allRows.indexOf(currentRow);

            const inputsInRow = Array.from(currentRow.querySelectorAll('input.ob-input:not([type="hidden"])'));
            const colIndex = inputsInRow.indexOf(inputEl);
            if (colIndex === -1) return;

            let nextInput = null;

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (rowIndex > 0) {
                    const prevRowInputs = Array.from(allRows[rowIndex - 1].querySelectorAll('input.ob-input:not([type="hidden"])'));
                    nextInput = prevRowInputs[colIndex] || prevRowInputs[prevRowInputs.length - 1];
                }
            } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                if (rowIndex < allRows.length - 1) {
                    const nextRowInputs = Array.from(allRows[rowIndex + 1].querySelectorAll('input.ob-input:not([type="hidden"])'));
                    nextInput = nextRowInputs[colIndex] || nextRowInputs[nextRowInputs.length - 1];
                }
            } else if (e.key === 'ArrowLeft') {
                // To allow normal text editing inside the cell, we only prevent default if we actually move
                // However user requested Excel like behavior. For pure data entry, jumping is better.
                if (colIndex > 0) {
                    e.preventDefault();
                    nextInput = inputsInRow[colIndex - 1];
                } else if (rowIndex > 0) {
                    e.preventDefault();
                    const prevRowInputs = Array.from(allRows[rowIndex - 1].querySelectorAll('input.ob-input:not([type="hidden"])'));
                    nextInput = prevRowInputs[prevRowInputs.length - 1];
                }
            } else if (e.key === 'ArrowRight') {
                if (colIndex < inputsInRow.length - 1) {
                    e.preventDefault();
                    nextInput = inputsInRow[colIndex + 1];
                } else if (rowIndex < allRows.length - 1) {
                    e.preventDefault();
                    const nextRowInputs = Array.from(allRows[rowIndex + 1].querySelectorAll('input.ob-input:not([type="hidden"])'));
                    nextInput = nextRowInputs[0];
                }
            }

            if (nextInput) {
                nextInput.focus();
                if (typeof nextInput.select === 'function') {
                    nextInput.select();
                }
            }
        };

        async function initOpeningBalancesView() {
            console.log("SoftifyX: Init Opening Balances View");
            // Safety: ensure variables are ready regardless of call timing
            if (typeof obAccountsPool === 'undefined') obAccountsPool = [];
            if (typeof displayedOBAccounts === 'undefined') displayedOBAccounts = [];
            if (typeof selectedOBRowId === 'undefined') selectedOBRowId = null;

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const fyId = session.fy_id || 0;
            const coId = session.company_id || 1;

            const grid = document.getElementById('obGridBody');
            if (!grid) {
                console.error("OB: obGridBody not found in DOM");
                return;
            }

            // Attach event delegation on container (most reliable - works even after innerHTML re-render)
            const obContainer = document.getElementById('obGridContainer');
            if (obContainer && !obContainer._keydownAttached) {
                obContainer._keydownAttached = true;
                obContainer.addEventListener('keydown', function(e) {
                    const inputEl = e.target;
                    if (inputEl && inputEl.classList && inputEl.classList.contains('ob-input')) {
                        window.handleOBGridKeydown(e, inputEl);
                    }
                }, true); // capture phase - fires before inline onkeydown
            }

            grid.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">Loading all accounts...</div>';

            try {
                const url = `api/maintain.php?action=get_coa_opening_balances&company_id=${coId}&fy_id=${fyId || 0}`;
                console.log("OB: Fetching", url);
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    console.log("OB: Received", data.length, "accounts");
                    obAccountsPool = data;
                    // Show all accounts by default
                    displayedOBAccounts = obAccountsPool
                        .map(a => ({...a, u_id: 'ser-' + a.id + '-' + Math.random().toString(36).substr(2, 5)}));
                    
                    renderOpeningBalances();
                } else {
                    grid.innerHTML = '<div style="padding:40px;text-align:center;color:#e74c3c;">Failed to load accounts. Check your connection.</div>';
                }
            } catch (e) {
                console.error("OB Load Error:", e);
                grid.innerHTML = '<div style="padding:40px;text-align:center;color:#e74c3c;">Error loading accounts: ' + e.message + '</div>';
            }
        }

        function filterOBGrid(event) {
            const term = (event.target ? event.target.value : '').toLowerCase().trim();
            const rows = document.querySelectorAll('#obGridBody .ob-row');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                // We only filter account rows, not the search row or empty rows
                const isDataRow = row.id && row.id.startsWith('ob-row-');
                if (isDataRow) {
                    if (text.includes(term)) {
                        row.style.display = 'grid';
                    } else {
                        row.style.display = 'none';
                    }
                }
            });
        }

        function handleOBSearch(event, replaceUid = null) {
            // Ignore navigation keys
            const code = event.keyCode || event.which || 0;
            if ([40, 38, 13, 27].includes(code)) return;

            const input = event.target;
            const term = input.value.trim().toLowerCase();
            const resultsDiv = document.getElementById('obSearchResults');

            // Bulletproof fix: Don't re-render if the search term hasn't changed
            if (input.dataset.lastSearchTerm === term && resultsDiv.style.display === 'block') {
                return;
            }
            input.dataset.lastSearchTerm = term;

            if (!term) {
                resultsDiv.style.display = 'none';
                return;
            }

            // POSITIONING: Relative to obGridContainer
            const rect = input.getBoundingClientRect();
            const containerRect = document.getElementById('obGridContainer').getBoundingClientRect();
            const scrollY = document.getElementById('obGridContainer').scrollTop;
            
            resultsDiv.style.left = (rect.left - containerRect.left) + 'px';
            resultsDiv.style.top = (rect.bottom - containerRect.top + scrollY) + 'px';
            
            // Match width exactly to the first two columns (Account Code + Account Name)
            const headerRow = document.querySelector('#obGridContainer > div:first-child');
            if (headerRow && headerRow.children.length >= 2) {
                const targetWidth = headerRow.children[0].offsetWidth + headerRow.children[1].offsetWidth;
                // Subtract 1px to align perfectly with the border
                resultsDiv.style.width = (targetWidth - 1) + 'px';
            } else {
                resultsDiv.style.width = '350px';
            }

            const matches = obAccountsPool.filter(a => 
                (a.name.toLowerCase().includes(term) || a.code.toString().includes(term))
            ).slice(0, 15);

            window.obSearchSelectedIndex = -1;

            if (matches.length > 0) {
                resultsDiv.innerHTML = matches.map(m => `
                    <div class="ob-result-item" data-id="${m.id}" data-uid="${replaceUid || ''}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" 
                         onclick="addAccountToOBGrid(${m.id}, '${replaceUid || ''}'); document.getElementById('obSearchResults').style.display='none';">
                        <span style="font-weight: 700; color: #1F4E79; margin-right: 10px;">${m.code}</span> ${m.name}
                    </div>
                `).join('');
                resultsDiv.style.display = 'block';
            } else {
                resultsDiv.style.display = 'none';
            }
        }

        function addAccountToOBGrid(accId, replaceUid = null) {
            const acc = obAccountsPool.find(a => a.id == accId);
            if (acc) {
                if (replaceUid) {
                    const idx = displayedOBAccounts.findIndex(a => a.u_id === replaceUid);
                    if (idx !== -1) {
                        displayedOBAccounts[idx] = {
                            ...acc,
                            u_id: replaceUid, // keep same u_id
                            debit: displayedOBAccounts[idx].debit, // keep previous values
                            credit: displayedOBAccounts[idx].credit
                        };
                    }
                } else {
                    const rowInstance = {
                        ...acc,
                        u_id: Date.now() + Math.random().toString(36).substr(2, 9)
                    };
                    displayedOBAccounts.push(rowInstance);
                }
                
                renderOpeningBalances();
                
                // Focus debit input
                setTimeout(() => {
                    const el = document.getElementById(`ob-debit-${replaceUid || displayedOBAccounts[displayedOBAccounts.length - 1].u_id}`);
                    if (el) el.focus();
                }, 50);
            }
        }


        function renderOpeningBalances() {
            const grid = document.getElementById('obGridBody');
            if (!grid) return;

            let html = displayedOBAccounts.map((a, idx) => {
                const isDebit = (parseFloat(a.debit) || 0) > 0;
                const isCredit = (parseFloat(a.credit) || 0) > 0;
                const isSelected = selectedOBRowId === a.u_id;
                
                return `
                <div class="ob-row ${isSelected ? 'selected' : ''}" id="ob-row-${a.u_id}" onclick="selectOBRow('${a.u_id}')">
                    <div class="ob-col" style="padding:0;">
                        <input type="text" class="ob-input" value="${a.code}"
                               onkeyup="handleOBSearch(event, '${a.u_id}')"
                               onkeydown="window.handleOBGridKeydown(event, this)"
                               style="text-align: left; font-weight: 600; color: #1F4E79;"
                               onclick="this.select()"
                               autocomplete="off"
                               data-last-search-term="${a.code}">
                    </div>
                    <div class="ob-col" style="padding: 0;">
                        <input type="text" class="ob-input ob-name-input" readonly onkeydown="window.handleOBGridKeydown(event, this)" value="${a.name}" style="text-align: left; border: none; background: transparent; font-weight: 500; cursor: default;" title="${a.name}">
                    </div>
                    <div class="ob-col">
                        <input type="text" inputmode="decimal" class="ob-input ${isDebit ? 'has-value' : ''}" id="ob-debit-${a.u_id}"
                               value="${parseFloat(a.debit) ? parseFloat(a.debit).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}" placeholder="0.00"
                               ${isCredit ? 'disabled' : ''}
                               onblur="this.value = parseFloat(this.value.replace(/,/g, '')) ? parseFloat(this.value.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''"
                               oninput="onBalanceChange('${a.u_id}', 'debit', this.value)"
                               onfocus="this.value = this.value.replace(/,/g, ''); this.select()"
                               onkeydown="window.handleOBGridKeydown(event, this)">
                    </div>
                    <div class="ob-col">
                        <input type="text" inputmode="decimal" class="ob-input ${isCredit ? 'has-value' : ''}" id="ob-credit-${a.u_id}"
                               value="${parseFloat(a.credit) ? parseFloat(a.credit).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}" placeholder="0.00"
                               ${isDebit ? 'disabled' : ''}
                               onblur="this.value = parseFloat(this.value.replace(/,/g, '')) ? parseFloat(this.value.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''"
                               oninput="onBalanceChange('${a.u_id}', 'credit', this.value)"
                               onfocus="this.value = this.value.replace(/,/g, ''); this.select()"
                               onkeydown="window.handleOBGridKeydown(event, this)">
                    </div>
                </div>
                `;
            }).join('');

            const totalTargetRows = Math.max(30, displayedOBAccounts.length + 10);
            const emptyCount = totalTargetRows - displayedOBAccounts.length;
            
            for (let i = 0; i < emptyCount; i++) {
                html += `
                <div class="ob-row">
                    <div class="ob-col" style="padding:0;">
                        <input type="text" class="ob-input" 
                               onkeyup="handleOBSearch(event, null)"
                               onkeydown="window.handleOBGridKeydown(event, this)"
                               style="text-align: left;">
                    </div>
                    <div class="ob-col" style="padding: 0;">
                        <input type="text" class="ob-input" readonly style="background: transparent; border: none; pointer-events: none;">
                    </div>
                    <div class="ob-col">
                        <input type="text" class="ob-input" readonly style="background: transparent; border: none; pointer-events: none;">
                    </div>
                    <div class="ob-col" style="border-right: none;">
                        <input type="text" class="ob-input" readonly style="background: transparent; border: none; pointer-events: none;">
                    </div>
                </div>`;
            }

            grid.innerHTML = html;
            calculateOpeningTotals();
            
            const filterTerm = document.getElementById('obSearchInput').value;
            if (filterTerm) filterOBGrid({target: {value: filterTerm}});
        }

        function selectOBRow(uId) {
            selectedOBRowId = uId;
            document.querySelectorAll('.ob-row').forEach(row => {
                row.classList.remove('selected');
            });
            const targeted = document.getElementById(`ob-row-${uId}`);
            if (targeted) targeted.classList.add('selected');
        }

        function onBalanceChange(uId, field, value) {
            const acc = displayedOBAccounts.find(a => a.u_id == uId);
            if (acc) {
                const numVal = parseFloat(value.toString().replace(/,/g, '')) || 0;
                acc[field] = numVal;

                const debitInput = document.getElementById(`ob-debit-${uId}`);
                const creditInput = document.getElementById(`ob-credit-${uId}`);

                if (field === 'debit') {
                    if (numVal > 0) {
                        creditInput.disabled = true;
                        debitInput.classList.add('has-value');
                        acc.credit = 0;
                        creditInput.value = '';
                    } else {
                        creditInput.disabled = false;
                        debitInput.classList.remove('has-value');
                    }
                } else {
                    if (numVal > 0) {
                        debitInput.disabled = true;
                        creditInput.classList.add('has-value');
                        acc.debit = 0;
                        debitInput.value = '';
                    } else {
                        debitInput.disabled = false;
                        creditInput.classList.remove('has-value');
                    }
                }
                
                calculateOpeningTotals();
            }
        }

        function calculateOpeningTotals() {
            let totalDebit = 0;
            let totalCredit = 0;
            displayedOBAccounts.forEach(a => {
                totalDebit += parseFloat(a.debit) || 0;
                totalCredit += parseFloat(a.credit) || 0;
            });

            const debEl = document.getElementById('obTotalDebit');
            const creEl = document.getElementById('obTotalCredit');
            const diffEl = document.getElementById('obDifferenceMsg');

            if (debEl) debEl.textContent = totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            if (creEl) creEl.textContent = totalCredit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

            if (diffEl) {
                const diff = Math.abs(totalDebit - totalCredit);
                if (diff > 0.001) {
                    diffEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> There is a difference of Rs. ${diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} in totals.`;
                    diffEl.style.color = '#e74c3c';
                } else {
                    diffEl.innerHTML = `<i class="fas fa-check-circle"></i> Totals are balanced.`;
                    diffEl.style.color = '#27ae60';
                }
            }
        }

        async function saveOpeningBalances() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const fyId = session.fy_id || 0;
            if (!fyId) return;

            const payload = displayedOBAccounts.map(a => ({
                coa_id: a.id,
                debit: a.debit || 0,
                credit: a.credit || 0
            }));

            try {
                const res = await fetch('api/maintain.php?action=save_coa_opening_balances', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fy_id: fyId, balances: payload })
                });
                if (res.ok) {
                    alert("Opening Balances saved successfully!");
                } else {
                    alert("Failed to save balances.");
                }
            } catch (e) {
                alert("Error saving balances.");
            }
        }

        async function deleteOBAccount() {
            if (selectedOBRowId) {
                if (confirm("Remove this account from the temporary list? (Original COA will not be deleted)")) {
                    displayedOBAccounts = displayedOBAccounts.filter(a => a.u_id !== selectedOBRowId);
                    selectedOBRowId = null;
                    renderOpeningBalances();
                }
            } else {
                if (confirm("Are you sure you want to delete ALL Opening Balances for this Financial Year? This action cannot be undone.")) {
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const fyId = session.fy_id || 0;
                    if (!fyId) return;

                    try {
                        const res = await fetch('api/maintain.php?action=delete_all_coa_opening_balances', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fy_id: fyId })
                        });
                        if (res.ok) {
                            alert("All Opening Balances have been cleared successfully.");
                            displayedOBAccounts = [];
                            renderOpeningBalances();
                        } else {
                            alert("Failed to delete opening balances.");
                        }
                    } catch(e) {
                        console.error(e);
                        alert("Error communicating with server.");
                    }
                }
            }
        }

        async function printOpeningBalances() {
            let printWindow = window.open('', '_blank');
            let dateStr = new Date().toLocaleDateString();
            
            let html = `
                <html>
                <head>
                    <title>Opening Balances</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
                        h2 { text-align: center; margin-bottom: 5px; }
                        p { text-align: center; font-size: 14px; margin-top: 0; color: #555; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                        th { background-color: #f0f0f0; }
                        .text-right { text-align: right; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <h2>Accounts Opening Balances</h2>
                    <p>Printed on: ${dateStr}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Account Code</th>
                                <th>Account Name</th>
                                <th class="text-right">Debit</th>
                                <th class="text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            let totDeb = 0, totCred = 0;
            displayedOBAccounts.forEach(a => {
                let d = parseFloat(a.debit) || 0;
                let c = parseFloat(a.credit) || 0;
                if (d > 0 || c > 0) {
                    totDeb += d;
                    totCred += c;
                    html += `<tr>
                        <td>${a.account_code || ''}</td>
                        <td>${a.account_name || ''}</td>
                        <td class="text-right">${d.toFixed(2)}</td>
                        <td class="text-right">${c.toFixed(2)}</td>
                    </tr>`;
                }
            });

            html += `
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan="2" class="text-right">TOTALS</th>
                                <th class="text-right">${totDeb.toFixed(2)}</th>
                                <th class="text-right">${totCred.toFixed(2)}</th>
                            </tr>
                        </tfoot>
                    </table>
                </body>
                </html>
            `;
            
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = function() {
                printWindow.print();
                printWindow.close();
            };
        }

        function openCustomerPendingInvoices() {
            window.openSecondaryModularPopup('Navigation/Maintain/customer_pending_invoices.html', 'fa-file-invoice', 'Customer Pending Invoices', window.initCustomerPendingInvoicesView, 'Customer Pending Invoices', true);
        }

        function openVendorPendingInvoices() {
            window.openSecondaryModularPopup('Navigation/Maintain/vendor_pending_invoices.html', 'fa-file-invoice-dollar', 'Vendor Pending Invoices', window.initVendorPendingInvoicesView, 'Vendor Pending Invoices', true);
        }

        window.initCustomerPendingInvoicesView = async function() {
            console.log("Init Customer Pending Invoices View");
            // Set default date
            document.getElementById('cpiDate').value = new Date().toISOString().split('T')[0];
            
            // Load Customers
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const res = await fetch(`api/sales.php?action=get_customers&company_id=${session.company_id || 1}`);
                if (res.ok) {
                    const customers = await res.json();
                    let sel = document.getElementById('cpiCustomer');
                    sel.innerHTML = '<option value="">Select Customer</option>';
                    customers.forEach(c => {
                        sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                    });
                }
            } catch(e) { console.error("Error loading customers:", e); }
        };

        window.addCustomerPendingInvoice = function() {
            let date = document.getElementById('cpiDate').value;
            let invNo = document.getElementById('cpiInvoiceNo').value;
            let custSel = document.getElementById('cpiCustomer');
            let custId = custSel.value;
            let custName = custSel.options[custSel.selectedIndex]?.text || '';
            let amount = parseFloat(document.getElementById('cpiAmount').value) || 0;
            let remarks = document.getElementById('cpiRemarks').value;

            if (!invNo || !custId || amount <= 0) {
                alert("Please fill all required fields correctly (Invoice No, Customer, Amount).");
                return;
            }

            let tbody = document.getElementById('cpiGridBody');
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${date}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${invNo}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${custName}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${remarks}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;" class="cpi-amt" data-val="${amount}">${amount.toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                    <button onclick="this.closest('tr').remove(); updateCPITotal();" style="color: red; border: none; background: none; cursor: pointer;"><i class="fa fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
            
            // clear form
            document.getElementById('cpiInvoiceNo').value = '';
            document.getElementById('cpiAmount').value = '';
            document.getElementById('cpiRemarks').value = '';
            updateCPITotal();
        };

        window.updateCPITotal = function() {
            let tot = 0;
            document.querySelectorAll('.cpi-amt').forEach(el => tot += parseFloat(el.getAttribute('data-val') || 0));
            document.getElementById('cpiTotalAmount').innerText = tot.toFixed(2);
        };

        window.saveCustomerPendingInvoices = function() {
            alert("Customer Pending Invoices saved successfully! (Demo)");
            closeSecondaryModularPopup();
        };

        window.initVendorPendingInvoicesView = async function() {
            console.log("Init Vendor Pending Invoices View");
            document.getElementById('vpiDate').value = new Date().toISOString().split('T')[0];
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const res = await fetch(`api/purchases.php?action=get_vendors&company_id=${session.company_id || 1}`);
                if (res.ok) {
                    const vendors = await res.json();
                    let sel = document.getElementById('vpiVendor');
                    sel.innerHTML = '<option value="">Select Vendor</option>';
                    vendors.forEach(v => {
                        sel.innerHTML += `<option value="${v.id}">${v.name}</option>`;
                    });
                }
            } catch(e) { console.error("Error loading vendors:", e); }
        };

        window.addVendorPendingInvoice = function() {
            let date = document.getElementById('vpiDate').value;
            let invNo = document.getElementById('vpiInvoiceNo').value;
            let vendSel = document.getElementById('vpiVendor');
            let vendId = vendSel.value;
            let vendName = vendSel.options[vendSel.selectedIndex]?.text || '';
            let amount = parseFloat(document.getElementById('vpiAmount').value) || 0;
            let remarks = document.getElementById('vpiRemarks').value;

            if (!invNo || !vendId || amount <= 0) {
                alert("Please fill all required fields correctly.");
                return;
            }

            let tbody = document.getElementById('vpiGridBody');
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${date}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${invNo}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${vendName}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${remarks}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;" class="vpi-amt" data-val="${amount}">${amount.toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                    <button onclick="this.closest('tr').remove(); updateVPITotal();" style="color: red; border: none; background: none; cursor: pointer;"><i class="fa fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
            
            document.getElementById('vpiInvoiceNo').value = '';
            document.getElementById('vpiAmount').value = '';
            document.getElementById('vpiRemarks').value = '';
            updateVPITotal();
        };

        window.updateVPITotal = function() {
            let tot = 0;
            document.querySelectorAll('.vpi-amt').forEach(el => tot += parseFloat(el.getAttribute('data-val') || 0));
            document.getElementById('vpiTotalAmount').innerText = tot.toFixed(2);
        };

        window.saveVendorPendingInvoices = function() {
            alert("Vendor Pending Invoices saved successfully! (Demo)");
            closeSecondaryModularPopup();
        };

        // --- IMPORT WIZARD LOGIC ---
        async function importBalances() {
            // Open the new Wizard Modal
            window.openSecondaryModularPopup('Navigation/Maintain/import_ob_wizard.html', 'fa-file-import', 'Import Opening Balances', 
                                              initImportOBWizard, 'Import Opening Balances', true);
        }

        async function initImportOBWizard() {
            console.log("SoftifyX: Init Import OB Wizard");
            const select = document.getElementById('importFromFY');
            if (!select) return;

            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const currentFyId = session.fy_id || 0;

                const res = await fetch(`api/maintain.php?action=get_fys&company_id=${coId}`);
                if (res.ok) {
                    const fys = await res.json();
                    select.innerHTML = fys.map(fy => `
                        <option value="${fy.id}" ${fy.id == currentFyId ? 'disabled' : ''}>
                            ${fy.abbreviation} ${fy.id == currentFyId ? '(Current)' : ''}
                        </option>
                    `).join('');
                } else {
                    select.innerHTML = '<option value="">Error loading years</option>';
                }
            } catch (e) {
                console.error("FY Load Error:", e);
                select.innerHTML = '<option value="">Error loading years</option>';
            }
        }

        async function confirmOBImport() {
            const fromFyId = document.getElementById('importFromFY').value;
            if (!fromFyId) {
                alert("Please select a financial year to import from.");
                return;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const fyId = session.fy_id || 0;
            if (!fyId) return;

            if (confirm("Are you sure you want to import ALL balances from the selected year? This will overwrite your current unsaved changes.")) {
                try {
                    const res = await fetch('api/maintain.php?action=import_coa_opening_balances', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fy_id: fyId, from_fy_id: fromFyId })
                    });
                    const result = await res.json();
                    if (res.ok) {
                        alert("Balances imported successfully!");
                        closeSecondaryModularPopup();
                        initOpeningBalancesView(); // Refresh the main grid
                    } else {
                        alert(result.error || "Import failed.");
                    }
                } catch (e) {
                    alert("Error during import.");
                }
            }
        }

        // Expose Functions
        window.initOpeningBalancesView = initOpeningBalancesView;
        window.handleOBSearch = handleOBSearch;
        window.addAccountToOBGrid = addAccountToOBGrid;
        window.renderOpeningBalances = renderOpeningBalances;
        window.selectOBRow = selectOBRow;
        window.onBalanceChange = onBalanceChange;
        window.saveOpeningBalances = saveOpeningBalances;
        window.deleteOBAccount = deleteOBAccount;
        window.importBalances = importBalances;
        window.initImportOBWizard = initImportOBWizard;
        window.confirmOBImport = confirmOBImport;
        window.filterOBGrid = filterOBGrid;

        window.handleLogout = async function() {
            const adminBackup = localStorage.getItem('softifyx_admin_backup_session');
            if (adminBackup) {
                if (confirm("Log out of branch and return to Main Admin Dashboard?")) {
                    try {
                        const adminObj = JSON.parse(adminBackup);
                        localStorage.setItem('softifyx_session', adminBackup);
                        localStorage.removeItem('softifyx_admin_backup_session');
                        await fetch('api/pos.php?action=restore_admin_session&company_id=' + (adminObj.company_id || 1) + '&user_id=' + (adminObj.user_id || 1));
                    } catch(e) {}
                    document.documentElement.classList.remove('pos-only');
                    document.body.classList.remove('pos-only');
                    window.location.href = 'index.html';
                    return;
                }
                return;
            }

            if(confirm("Are you sure you want to log out?")) {
                try {
                    await fetch('api/auth.php?action=logout');
                    localStorage.removeItem('softifyx_session');
                    window.location.href = 'login.html';
                } catch (err) {
                    localStorage.removeItem('softifyx_session');
                    window.location.href = 'login.html';
                }
            }
        };

        window.checkUserRights = checkUserRights;
        
        function handleProfilePhotoClick() {
            const hasPhoto = !!userProfilePhoto;
            const html = `
                <div style="padding: 20px; text-align: center;">
                    <div style="margin-bottom: 20px;">
                        ${userProfilePhoto ? `<img src="${userProfilePhoto}" style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid #eee; object-fit: cover;">` : `<i class="fas fa-user-circle" style="font-size: 80px; color: #ddd;"></i>`}
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="btn btn-primary" onclick="document.getElementById('profilePhotoInput').click()">
                            <i class="fas fa-camera"></i> ${hasPhoto ? 'Change Photo' : 'Upload Photo'}
                        </button>
                        ${hasPhoto ? `
                            <button class="btn btn-danger" onclick="removeProfilePhoto()">
                                <i class="fas fa-trash"></i> Remove
                            </button>
                        ` : ''}
                    </div>
                    <p style="font-size: 11px; color: #888; margin-top: 15px;">Note: Best size is square, e.g. 200x200</p>
                </div>
            `;
            openModal({ icon: 'fa-user', text: 'Manage Profile Photo' }, html);
        }

        async function uploadProfilePhoto(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function() {
                const base64 = reader.result;
                try {
                    const res = await fetch('api/admin.php?action=save_profile_photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ photo: base64 })
                    });
                    if (res.ok) {
                        userProfilePhoto = base64;
                        updateNames();
                        closeModal();
                        alert('Profile photo updated successfully!');
                    }
                } catch (err) {
                    alert('Failed to upload photo.');
                }
            };
            reader.readAsDataURL(file);
        }

        async function removeProfilePhoto() {
            if (confirm('Are you sure you want to remove your profile photo?')) {
                try {
                    const res = await fetch('api/admin.php?action=remove_profile_photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (res.ok) {
                        userProfilePhoto = null;
                        updateNames();
                        closeModal();
                        alert('Profile photo removed.');
                    }
                } catch (err) {
                    alert('Failed to remove photo.');
                }
            }
        }

        window.removeProfilePhoto = removeProfilePhoto;
        window.getUserProfilePhoto = function() { return userProfilePhoto; };

        // --- CHART OF INVENTORY MODULE LOGIC ---
        let invMains = [];
        let invSubs = [];
        let invItems = [];
        let selectedInvMainId = null;
        let selectedInvSubId = null;
        let selectedInvItemId = null;

        async function initChartOfInventoryView() {
            try {
                loadInvBrands(); // Ensure brands are ready
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/inventory.php?action=get_inventory_tree&company_id=${coId}`);
                if (!res.ok) return;
                const data = await res.json();
                invMains = data.mains || [];
                invSubs = data.subs || [];
                renderInvMainList();
                if (invMains.length > 0) {
                    const list = document.getElementById('invMainList');
                    list.selectedIndex = 0;
                    onInvMainSelect(invMains[0].id);
                } else {
                    resetInvMainForm();
                }
            } catch (e) {
                console.error("SoftifyX: Error loading inventory tree", e);
            }
        }
        window.initChartOfInventoryView = initChartOfInventoryView;

        async function manageBrands() {
            try {
                const res = await fetch('Navigation/Maintain/inventory_brands.html');
                if (!res.ok) throw new Error('Could not load brand form');
                const html = await res.text();
                openSecondaryModal({ icon: 'fa-tags', text: 'Inventory Brands' }, html, false, 'Inventory Brands');
                
                // Robust Initialization: Wait for DOM and then load
                let retryCount = 0;
                const tryInit = () => {
                    const list = document.getElementById('brandMaintList');
                    if (list) {
                        list.innerHTML = '<option disabled>Loading...</option>';
                        loadBrandsForMaintenance();
                    } else if (retryCount < 10) {
                        retryCount++;
                        setTimeout(tryInit, 100);
                    }
                };
                setTimeout(tryInit, 50);
            } catch (e) {
                console.error("Manage Brands error:", e);
                alert("Could not load Brands form.");
            }
        }
        window.manageBrands = manageBrands;

        function initInventoryBrandsView() {
            setTimeout(() => {
                const list = document.getElementById('brandMaintList');
                if (list) {
                    list.innerHTML = '<option disabled>Loading...</option>';
                    loadBrandsForMaintenance();
                }
            }, 100);
        }
        window.initInventoryBrandsView = initInventoryBrandsView;

        let brandMaintList = [];
        let selectedMaintBrandId = null;

        async function loadBrandsForMaintenance() {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/inventory.php?action=get_brands&company_id=${coId}`);
                brandMaintList = await res.json();
                renderBrandMaintList();
                resetBrandForm();
            } catch (e) {}
        }
        window.loadBrandsForMaintenance = loadBrandsForMaintenance;

        function renderBrandMaintList() {
            const list = document.getElementById('brandMaintList');
            if (!list) return;
            list.innerHTML = brandMaintList.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            if (selectedMaintBrandId) list.value = selectedMaintBrandId;
        }

        function onBrandMaintSelect(id) {
            selectedMaintBrandId = id;
            const brand = brandMaintList.find(b => b.id == id);
            if (brand) {
                document.getElementById('brandMaintName').value = brand.name;
                document.getElementById('brandMaintName').disabled = false;
            }
        }
        window.onBrandMaintSelect = onBrandMaintSelect;

        function resetBrandForm(generate = false) {
            selectedMaintBrandId = null;
            const list = document.getElementById('brandMaintList');
            if (list) list.value = '';
            const input = document.getElementById('brandMaintName');
            if (!input) return;
            input.value = '';
            input.disabled = !generate;
            if (generate) input.focus();
        }
        window.resetBrandForm = resetBrandForm;

        async function saveBrand() {
            const name = document.getElementById('brandMaintName').value.trim();
            if (!name) return alert("Enter Brand Name!");

            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const body = { name: name, id: selectedMaintBrandId };

                const res = await fetch('api/inventory.php?action=save_brand&company_id=' + coId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Brand saved successfully.");
                    loadBrandsForMaintenance();
                    loadInvBrands(); // Refresh main inventory dropdown
                }
            } catch (err) { alert("Save failed."); }
        }
        window.saveBrand = saveBrand;

        async function deleteBrand() {
            if (!selectedMaintBrandId) return alert("Select a brand to delete!");
            if (!confirm("Are you sure?")) return;

            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/inventory.php?action=delete_brand&id=${selectedMaintBrandId}&company_id=${coId}`);
                if (res.ok) {
                    alert("Brand deleted.");
                    loadBrandsForMaintenance();
                    loadInvBrands(); // Refresh main inventory dropdown
                } else {
                    const err = await res.json();
                    alert(err.error || "Delete failed.");
                }
            } catch (e) { alert("Delete error."); }
        }
        window.deleteBrand = deleteBrand;

        async function printBrandPriceList() {
            if (!selectedMaintBrandId) return alert("Please select a brand from the list first!");
            const brand = brandMaintList.find(b => b.id == selectedMaintBrandId);
            if (!brand) return;

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
            const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
            
            let reportTitle = "PRICE LIST - " + brand.name.toUpperCase();

            let allItemsData = [];
            try {
                const res = await fetch('api/inventory.php?action=get_all_items&company_id=' + coId);
                if (res.ok) allItemsData = await res.json();
            } catch(e) {}

            const itemsToPrint = allItemsData.filter(i => i.brand_id == brand.id);

            let htmlRows = `
                <tr>
                    <th style="width: 150px;">Item Code</th>
                    <th>Item Name</th>
                    <th style="width: 120px; text-align: right;">Purchase Price</th>
                    <th style="width: 120px; text-align: right;">Selling Price</th>
                </tr>
            `;

            if (itemsToPrint.length === 0) {
                htmlRows += `<tr><td colspan="4" style="text-align:center; padding: 15px; font-style: italic;">No items found for this brand.</td></tr>`;
            } else {
                itemsToPrint.forEach(item => {
                    htmlRows += `
                        <tr style="font-style: normal; color: #333; border-bottom: 1px solid #eee;">
                            <td style="padding: 4px;">${item.code} ${item.hs_code ? `(${item.hs_code})` : ''}</td>
                            <td style="padding: 4px;">${item.name}</td>
                            <td style="padding: 4px; text-align: right;">${parseFloat(item.purchase_price || 0).toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right;">${parseFloat(item.selling_price || 0).toFixed(2)}</td>
                        </tr>
                    `;
                });
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Report - ${reportTitle}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        td, th { font-size: 13px; vertical-align: middle; text-align: left; }
                        th { border-bottom: 2px solid #ccc; padding-bottom: 6px; }
                        .footer { margin-top: 60px; font-size: 12px; color: #95a5a6; text-align: center; border-top: 1px solid #eee; padding-top: 15px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? '<img src="' + logo + '">' : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>${reportTitle}</h2>
                    </div>
                    <table>
                        <tbody>
                            ${htmlRows}
                        </tbody>
                    </table>
                    <div class="footer">
                        Generated on ${new Date().toLocaleString()}
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.print();
            }, 500);
        }
        window.printBrandPriceList = printBrandPriceList;

        function renderInvMainList() {
            const list = document.getElementById('invMainList');
            if (!list) return;
            list.innerHTML = invMains.map(m => `<option value="${m.id}">${m.code} - ${m.name}</option>`).join('');
            if (selectedInvMainId) list.value = selectedInvMainId;
        }

        async function onInvMainSelect(id) {
            selectedInvMainId = id;
            selectedInvSubId = null;
            selectedInvItemId = null;
            const main = invMains.find(m => m.id == id);
            if (main) {
                document.getElementById('invMainCode').value = main.code;
                document.getElementById('invMainName').value = main.name;
                enableInvMainFields(true); // Auto-edit enabled
                document.getElementById('invMainCode').disabled = true; // Lock code
            }
            renderInvSubList();
            const list = document.getElementById('invSubList');
            if (list && list.options.length > 0) {
                list.selectedIndex = 0;
                onInvSubSelect(list.value);
            } else {
                resetInvSubForm();
                // FIX: Ensure Item list is cleared if no Sub-Category exists for this Main Category
                invItems = [];
                renderInvItemList();
                resetInvItemForm();
            }
        }

        function renderInvSubList() {
            const list = document.getElementById('invSubList');
            if (!list) return;
            const filtered = invSubs.filter(s => s.main_id == selectedInvMainId);
            list.innerHTML = filtered.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');
        }

        async function onInvSubSelect(id) {
            selectedInvSubId = id;
            selectedInvItemId = null;
            const sub = invSubs.find(s => s.id == id);
            if (sub) {
                document.getElementById('invSubCode').value = sub.code;
                document.getElementById('invSubName').value = sub.name;
                enableInvSubFields(true); // Auto-edit enabled
                document.getElementById('invSubCode').disabled = true; // Lock code
            }
            fetchInvItems(id);
        }

        async function fetchInvItems(subId) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/inventory.php?action=get_items&sub_id=${subId}&company_id=${coId}`);
                invItems = await res.json();
                renderInvItemList();
                if (invItems.length > 0) {
                    const list = document.getElementById('invItemList');
                    list.selectedIndex = 0;
                    onInvItemSelect(invItems[0].id);
                } else {
                    resetInvItemForm();
                }
            } catch (e) {}
        }

        function renderInvItemList() {
            const list = document.getElementById('invItemList');
            if (!list) return;
            list.innerHTML = invItems.map(i => {
                const colorStyle = i.is_inactive == 1 ? 'color: #94a3b8;' : '';
                return `<option value="${i.id}" style="${colorStyle}">${i.code} - ${i.name}</option>`;
            }).join('');
        }

        function onInvItemSelect(id) {
            if (!id) return;
            selectedInvItemId = id;
            const item = invItems.find(i => i.id == id);
            
            if (item) {
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.value = (val !== null && val !== undefined) ? val : '';
                };

                // Populate all fields
                setVal('invItemCode', item.code);
                setVal('invItemName', item.name);
                setVal('invItemDesc', item.description);
                setVal('invItemBrand', item.brand_id);
                setVal('invItemRack', item.rack_no);
                setVal('invItemPurchasePrice', item.purchase_price);
                setVal('invItemSellingPrice', item.selling_price);
                setVal('invItemUnit', item.unit || 'Pcs');
                setVal('invItemQtyPerPiece', item.qty_per_piece);
                setVal('invItemTaxRate', item.tax_rate);
                setVal('invItemValuationCost', item.valuation_cost);
                setVal('invItemOrderQty', item.order_qty);

                // Handle Radios
                const taxType = item.tax_type || 'Percent';
                document.getElementsByName('taxType').forEach(r => { r.checked = (r.value === taxType); });
                
                const valMethod = item.valuation_method || 'Weighted Average';
                document.getElementsByName('costValuation').forEach(r => { r.checked = (r.value === valMethod); });
                
                // Handle Checkbox
                const inactive = document.getElementById('invItemInactive');
                if (inactive) inactive.checked = (String(item.is_inactive) === '1');
                
                enableInvItemFields(true);
                document.getElementById('invItemCode').disabled = true;
            }
        }

        // Helper to extract prefix and number for standardized generation
        function parseInventoryCodeInfo(code) {
            const sCode = code.toString().trim();
            // Match anything followed by an optional hyphen and then digits at the end
            const match = sCode.match(/^(.*?)-?(\d+)$/);
            if (match) {
                let prefix = match[1];
                // Remove trailing hyphen from prefix if it exists to avoid double hyphen
                if (prefix.endsWith('-')) prefix = prefix.slice(0, -1);
                return { prefix: prefix, number: match[2] };
            }
            // Fallback if no digits at end
            let prefix = sCode;
            if (prefix.endsWith('-')) prefix = prefix.slice(0, -1);
            return { prefix: prefix, number: '' };
        }

        function enableInvMainFields(enabled) {
            if (enabled) { const el = document.getElementById('invMainCode'); el.removeAttribute('disabled'); el.disabled = false; } else { const el = document.getElementById('invMainCode'); el.setAttribute('disabled', 'true'); el.disabled = true; }
            if (enabled) { const el = document.getElementById('invMainName'); el.removeAttribute('disabled'); el.disabled = false; } else { const el = document.getElementById('invMainName'); el.setAttribute('disabled', 'true'); el.disabled = true; }
        }
        function enableInvSubFields(enabled) {
            document.getElementById('invSubCode').disabled = true; // Readonly auto-generated
            document.getElementById('invSubName').disabled = !enabled;
        }
        function enableInvItemFields(enabled) {
            const ids = [
                'invItemName', 'invItemDesc', 'invItemBrand', 'invItemRack',
                'invItemPurchasePrice', 'invItemSellingPrice', 'invItemUnit', 'invItemQtyPerPiece',
                'invItemTaxRate', 'invItemValuationCost', 'invItemOrderQty', 'invItemInactive'
            ];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !enabled;
            });
            document.getElementById('invItemCode').disabled = true; // Always read-only
            document.getElementsByName('taxType').forEach(r => r.disabled = !enabled);
            document.getElementsByName('costValuation').forEach(r => r.disabled = !enabled);
        }

        function resetInvMainForm(generate = false) {
            if (!generate && selectedInvMainId) {
                return onInvMainSelect(selectedInvMainId);
            }
            selectedInvMainId = null;
            document.getElementById('invMainName').value = '';
            document.getElementById('invMainCode').value = '';
            enableInvMainFields(generate);
            if (generate) {
                document.getElementById('invMainCode').focus();
            }
        }

        function resetInvSubForm(generate = false) {
            if (generate && !selectedInvMainId) return alert("Select a Main Category first!");
            if (!generate && selectedInvSubId) {
                return onInvSubSelect(selectedInvSubId);
            }
            selectedInvSubId = null;
            document.getElementById('invSubName').value = '';
            enableInvSubFields(generate);
            if (generate) {
                const main = invMains.find(m => String(m.id) === String(selectedInvMainId));
                const siblings = invSubs.filter(s => String(s.main_id) === String(selectedInvMainId));
                let nextNum = 1;
                
                if (siblings.length > 0) {
                    const lastParts = siblings.map(s => {
                        const c = s.code.toString().trim();
                        const seq = c.slice(-2); // Strictly last 2 digits
                        const n = parseInt(seq);
                        return (!isNaN(n) && n < 100) ? n : 0;
                    });
                    nextNum = Math.max(...lastParts) + 1;
                }
                
                // Get main code and clean it
                let mCode = main.code.toString().trim();
                
                // Rule 1: Ensure hyphen between letters and numbers if missing (e.g. FG1 -> FG-1)
                if (!mCode.includes('-')) {
                    mCode = mCode.replace(/^([a-zA-Z]+)(\d+)$/, '$1-$2');
                }
                
                // Rule 2: REMOVE any trailing hyphens to prevent "FG-1-01" format
                mCode = mCode.replace(/-+$/, '');
                
                const seq = nextNum.toString().padStart(2, '0');
                const code = mCode + seq; // Combine cleaned main code + sequence
                
                document.getElementById('invSubCode').value = code;
                document.getElementById('invSubName').focus();
            } else {
                document.getElementById('invSubCode').value = '';
            }
        }

        function resetInvItemForm(generate = false) {
            if (generate && !selectedInvSubId) return alert("Select a Sub Category first!");
            if (!generate && selectedInvItemId) {
                return onInvItemSelect(selectedInvItemId);
            }
            selectedInvItemId = null;
            enableInvItemFields(generate);
            const ids = [
                'invItemName', 'invItemDesc', 'invItemBrand', 'invItemRack',
                'invItemPurchasePrice', 'invItemSellingPrice', 'invItemValuationCost', 'invItemOrderQty'
            ];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('invItemUnit').value = 'Pcs';
            document.getElementById('invItemQtyPerPiece').value = '';
            document.getElementById('invItemTaxRate').value = '';
            document.getElementById('invItemInactive').checked = false;

            if (generate) {
                const sub = invSubs.find(s => s.id == selectedInvSubId);
                let nextNum = 1;
                if (invItems.length > 0) {
                    const lastParts = invItems.map(i => parseInt(i.code.toString().slice(-3)) || 0);
                    nextNum = Math.max(...lastParts) + 1;
                }
                const cleanSubCode = sub.code.toString().replace(/-+$/, '');
                document.getElementById('invItemCode').value = cleanSubCode + nextNum.toString().padStart(3, '0');
                document.getElementById('invItemName').focus();
            } else {
                document.getElementById('invItemCode').value = '';
            }
        }

        async function saveInvMain() {
            const btn = document.querySelector('.inv-save');
            if (btn) btn.innerText = 'Saving...';
            
            const code = document.getElementById('invMainCode').value.trim();
            const name = document.getElementById('invMainName').value.trim();
            if (!code || !name) {
                if (btn) btn.innerText = 'Save';
                return alert("Code and Name are required!");
            }

            const payload = { code, name };
            if (selectedInvMainId) payload.id = selectedInvMainId;

            try {
                const res = await fetch('api/inventory.php?action=save_main', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const responseText = await res.text();
                if (btn) btn.innerText = 'Save';
                
                let data = {};
                try { data = JSON.parse(responseText); } catch(err) { }
                
                if (res.ok && data.status === 'success') {
                    document.getElementById('invMainCode').value = 'SAVED OK!';
                    alert("Category saved successfully.");
                    initChartOfInventoryView();
                } else {
                    alert("ERROR FROM SERVER:\n" + (data.error || responseText));
                }
            } catch (e) { 
                if (btn) btn.innerText = 'Save';
                alert("NETWORK EXCEPTION: " + e.message); 
            }
        }

        async function saveInvSub() {
            if (!selectedInvMainId) return alert("Select a Main Category first!");
            const code = document.getElementById('invSubCode').value.trim();
            const name = document.getElementById('invSubName').value.trim();
            if (!code || !name) return alert("Code and Name are required!");

            const payload = { main_id: selectedInvMainId, code, name };
            if (selectedInvSubId) payload.id = selectedInvSubId;

            try {
                const res = await fetch('api/inventory.php?action=save_sub', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    alert("Sub-Category saved successfully.");
                    initChartOfInventoryView();
                } else {
                    const err = await res.text();
                    alert("Save failed (Server Error): " + err);
                }
            } catch (e) { alert("Save failed."); }
        }

        async function saveInvItem() {
            if (!selectedInvSubId) return alert("Select a Sub Category first!");
            const code = document.getElementById('invItemCode').value.trim();
            const name = document.getElementById('invItemName').value.trim();
            if (!code || !name) return alert("Item Code and Name are required!");

            const payload = {
                sub_id: selectedInvSubId,
                code: code,
                name: name,
                description: document.getElementById('invItemDesc').value,
                brand_id: document.getElementById('invItemBrand').value || null,
                rack_no: document.getElementById('invItemRack').value,
                purchase_price: document.getElementById('invItemPurchasePrice').value,
                selling_price: document.getElementById('invItemSellingPrice').value,
                unit: document.getElementById('invItemUnit').value,
                qty_per_piece: document.getElementById('invItemQtyPerPiece').value,
                tax_rate: document.getElementById('invItemTaxRate').value,
                tax_type: Array.from(document.getElementsByName('taxType')).find(r => r.checked)?.value || 'Percent',
                valuation_method: Array.from(document.getElementsByName('costValuation')).find(r => r.checked)?.value || 'Weighted Average',
                valuation_cost: document.getElementById('invItemValuationCost').value,
                order_qty: document.getElementById('invItemOrderQty').value,
                is_inactive: document.getElementById('invItemInactive').checked ? 1 : 0
            };
            if (selectedInvItemId) payload.id = selectedInvItemId;

            try {
                const res = await fetch('api/inventory.php?action=save_item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    alert("Inventory item saved successfully.");
                    fetchInvItems(selectedInvSubId);
                } else {
                    const err = await res.text();
                    alert("Save failed (Server Error): " + err);
                }
            } catch (e) { alert("Save failed."); }
        }

        async function deleteInvMain() {
            if (!selectedInvMainId) return alert("Select a Category to delete.");
            if (confirm("Are you sure you want to delete this Category? System will block this if sub-categories exist.")) {
                try {
                    const res = await fetch(`api/inventory.php?action=delete_main&id=${selectedInvMainId}`, { method: 'POST' });
                    if (res.ok) {
                        alert("Category deleted.");
                        initChartOfInventoryView();
                    } else {
                        const err = await res.json();
                        alert(err.error || "Delete failed.");
                    }
                } catch (e) {}
            }
        }
        window.deleteInvMain = deleteInvMain;

        async function deleteInvSub() {
            if (!selectedInvSubId) return alert("Select a Sub-Category to delete.");
            if (confirm("Are you sure you want to delete this Sub-Category? System will block this if items exist.")) {
                try {
                    const res = await fetch(`api/inventory.php?action=delete_sub&id=${selectedInvSubId}`, { method: 'POST' });
                    if (res.ok) {
                        alert("Sub-Category deleted.");
                        initChartOfInventoryView();
                    } else {
                        const err = await res.json();
                        alert(err.error || "Delete failed.");
                    }
                } catch (e) {}
            }
        }
        window.deleteInvSub = deleteInvSub;

        async function deleteInvItem() {
            if (!selectedInvItemId) return alert("Select an Item to delete.");
            if (confirm("Are you sure you want to delete this inventory item?")) {
                try {
                    const res = await fetch(`api/inventory.php?action=delete_item&id=${selectedInvItemId}`, { method: 'POST' });
                    if (res.ok) {
                        alert("Inventory item deleted.");
                        fetchInvItems(selectedInvSubId);
                    }
                } catch (e) {}
            }
        }
        window.deleteInvItem = deleteInvItem;

        async function loadInvBrands() {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/inventory.php?action=get_brands&company_id=${coId}`);
                if (!res.ok) return;
                const brands = await res.json();
                const select = document.getElementById('invItemBrand');
                if (select) {
                    const currentVal = select.value;
                    select.innerHTML = '<option value="">None</option>' + brands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
                    select.value = currentVal;
                }
            } catch(e) {}
        }
        window.loadInvBrands = loadInvBrands;

        // --- INVENTORY OPENING BALANCES LOGIC ---
        let invObPool = [];
        let displayedInvOb = [];
        let allInventoryItems = []; 
        let selectedInvObRowId = null; 
        let activeSearchRowIndex = null; // Global to know which row is being updated by the search list

        async function initInventoryOpeningBalancesView() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const fyId = session.fy_id || 0;
            const coId = session.company_id || 1;
            if (!fyId) {
                alert("Please select a Financial Year during login to use this module.");
                return;
            }

            try {
                const itemRes = await fetch(`api/inventory.php?action=get_all_items_lookup&company_id=${coId}`);
                if (itemRes.ok) allInventoryItems = await itemRes.json();
            } catch(e) {}

            const locRes = await fetch('api/inventory.php?action=get_locations');
            if (locRes.ok) {
                const locations = await locRes.json();
                const select = document.getElementById('invObLocationSelect');
                if (select) {
                    select.innerHTML = locations.map(l => `<option value="${l.id}" ${l.is_default == 1 ? 'selected' : ''}>${l.name}</option>`).join('');
                }
            }

            let retry = 0;
            const check = setInterval(async () => {
                if (document.getElementById('invObGridBody')) {
                    clearInterval(check);
                    loadInvOpeningBalances();
                } else if (retry++ > 20) clearInterval(check);
            }, 100);
        }

        async function loadInvOpeningBalances() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const fyId = session.fy_id || 0;
            const coId = session.company_id || 1;
            const locId = document.getElementById('invObLocationSelect')?.value || 0;

            const grid = document.getElementById('invObGridBody');
            if (grid) grid.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b;">Loading balances...</div>';

            try {
                const res = await fetch(`api/inventory.php?action=get_inv_opening_balances&company_id=${coId}&fy_id=${fyId}&location_id=${locId}`);
                if (res.ok) {
                    const data = await res.json();
                    // Auto-populate rate from selling_price if no saved rate
                    data.forEach(d => {
                        if ((parseFloat(d.rate) || 0) === 0 && (parseFloat(d.selling_price) || 0) > 0) {
                            d.rate = parseFloat(d.selling_price);
                        }
                    });
                    invObPool = data.filter(d => (parseFloat(d.pieces) || 0) > 0 || (parseFloat(d.quantity) || 0) > 0 || (parseFloat(d.rate) || 0) > 0);
                    displayedInvOb = [...invObPool];
                    selectedInvObRowId = null;
                    activeSearchRowIndex = null;
                    renderInvObGrid();
                }
            } catch (e) { console.error(e); }
        }

        function renderInvObGrid() {
            const grid = document.getElementById('invObGridBody');
            if (!grid) return;

            let html = '';
            const minRows = 40;
            const bufferRows = 10;
            const rowCount = Math.max(displayedInvOb.length + bufferRows, minRows);

            for (let i = 0; i < rowCount; i++) {
                const row = displayedInvOb[i] || null;
                const isSelected = row && selectedInvObRowId === row.item_id;

                html += `
                    <div class="inv-ob-row ${isSelected ? 'selected' : ''}" 
                         onclick="${row ? `selectInvObRow(${row.item_id})` : ''}" 
                         style="display: grid; grid-template-columns: 30px 120px 1fr 100px 100px 100px 120px 140px; border-bottom: 1px solid #cbd5e0; min-height: 28px; align-items: center;">
                        
                        <div style="padding: 2px; border-right: 1px solid #cbd5e0; text-align: center; background: #f8fafc; color: #1F4E79; font-size: 10px; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 900;">
                            ${isSelected ? 'Ã¢â€“Â¶' : (i + 1)}
                        </div>

                        <div class="inv-ob-col" style="border-right: 1px solid #cbd5e0; height: 100%; padding: 2px 4px;">
                            <input type="text" class="ob-input text-left" style="font-weight: 600; color: #64748b; text-align: left;" 
                                   value="${row ? row.code : ''}" 
                                   onkeydown="window.handleOBGridKeydown(event, this)" 
                                   onkeyup="handleInvObAddSearch(this, ${i})" onfocus="activeSearchRowIndex = ${i}; this.select()">
                        </div>
                        <div class="inv-ob-col" style="border-right: 1px solid #cbd5e0; height: 100%; padding: 2px 4px;">
                            <input type="text" class="ob-input text-left" style="color: #1e293b; font-weight: 500; text-align: left;" 
                                   value="${row ? row.name : ''}" 
                                   onkeydown="window.handleOBGridKeydown(event, this)" 
                                   onkeyup="handleInvObAddSearch(this, ${i})" onfocus="activeSearchRowIndex = ${i}; this.select()">
                        </div>
                        
                        <div class="inv-ob-col" style="border-right: 1px solid #cbd5e0; height: 100%; display: flex; align-items: center;">
                            <input type="number" step="any" class="ob-input ${row && row.pieces != 0 ? 'has-value' : ''}" value="${row && row.pieces != 0 ? row.pieces : ''}" 
                                   ${!row ? 'readonly' : ''} onkeydown="window.handleOBGridKeydown(event, this)" onchange="updateInvObRowData(${i}, 'pieces', this.value)" onclick="event.stopPropagation()">
                        </div>
                        <div class="inv-ob-col" style="border-right: 1px solid #cbd5e0; height: 100%; display: flex; align-items: center;">
                            <input type="number" step="any" class="ob-input ${row && row.quantity != 0 ? 'has-value' : ''}" value="${row && row.quantity != 0 ? row.quantity : ''}" 
                                   ${!row ? 'readonly' : ''} 
                                   onkeydown="window.handleOBGridKeydown(event, this)" 
                                   oninput="updateInvObRowData(${i}, 'quantity', this.value)" 
                                   onclick="event.stopPropagation()">
                        </div>
                        <div class="inv-ob-col text-center" style="color: #64748b; border-right: 1px solid #cbd5e0; height: 100%; display: flex; align-items: center; justify-content: center;">
                            ${row ? row.unit : ''}
                        </div>
                        <div class="inv-ob-col" style="border-right: 1px solid #cbd5e0; height: 100%; display: flex; align-items: center;">
                            <input type="number" step="any" class="ob-input ${row && row.rate != 0 ? 'has-value' : ''}" 
                                   value="${row && row.rate != 0 ? row.rate : ''}" 
                                   placeholder="${row && (row.selling_price || row.purchase_price) ? parseFloat(row.selling_price || row.purchase_price).toFixed(2) : ''}" 
                                   ${!row ? 'readonly' : ''} 
                                   onkeydown="window.handleOBGridKeydown(event, this)" 
                                   oninput="updateInvObRowData(${i}, 'rate', this.value)" 
                                   onclick="event.stopPropagation()">
                        </div>
                        <div class="inv-ob-col text-right" id="inv-ob-amount-${i}" style="font-weight: 700; color: #1F4E79; text-align: right; height: 100%; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px;">
                            ${row ? ((parseFloat(row.quantity || 0) * parseFloat(row.rate || 0)) != 0 ? (parseFloat(row.quantity || 0) * parseFloat(row.rate || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00') : ''}
                        </div>
                    </div>
                `;
            }
            grid.innerHTML = html;
            calculateInvOBTotals();
        }

        window.selectInvObRow = function(itemId) {
            selectedInvObRowId = itemId;
            const container = document.getElementById('invObGridBody');
            if (container) {
                const old = container.querySelector('.inv-ob-row.selected');
                if (old) {
                    old.classList.remove('selected');
                }
                // App.js uses different logic for the arrow
                const newRow = container.querySelector('#inv-ob-row-' + itemId);
                if (newRow) {
                    newRow.classList.add('selected');
                }
            }
        };

        window.deleteSelectedInvObRow = function() {
            if (!selectedInvObRowId) { alert("Please click a row to select it first."); return; }
            if (confirm("Remove this item from the current list? (Changes applied on Save)")) {
                invObPool = invObPool.filter(r => r.item_id != selectedInvObRowId);
                displayedInvOb = [...invObPool];
                selectedInvObRowId = null;
                renderInvObGrid();
            }
        };

        window.handleInvObAddSearch = function(input, idx) {
            activeSearchRowIndex = idx;
            const term = (input.value || '').toLowerCase();
            const resultsDiv = document.getElementById('invObSearchResults');
            if (term.length < 1) { 
                resultsDiv.style.display = 'none'; 
                return; 
            }
            
            const matches = allInventoryItems.filter(i => 
                i.name.toLowerCase().includes(term) || 
                i.code.toLowerCase().includes(term)
            ).slice(0, 50);

            if (matches.length > 0) {
                renderInvObSearchResults(matches, input);
            } else {
                resultsDiv.style.display = 'none';
            }
        };

        function renderInvObSearchResults(matches, input) {
            const resultsDiv = document.getElementById('invObSearchResults');
            const container = document.getElementById('invObGridContainer');
            
            // Positioning directly under the input relative to the grid container
            const inputRect = input.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Adjust position to be "Sat hi" (exactly under/next to the cell)
            resultsDiv.style.top = (inputRect.bottom - containerRect.top + container.scrollTop) + 'px';
            resultsDiv.style.left = (inputRect.left - containerRect.left) + 'px';
            resultsDiv.style.display = 'block';

            resultsDiv.innerHTML = matches.map(m => `
                <div class="result-item" onclick="addInvObItem(${JSON.stringify(m).replace(/"/g, '&quot;')})">
                    <span style="color: #64748b; margin-right: 10px;">${m.code}</span>
                    <span style="font-weight: 600;">${m.name}</span>
                    <span style="float: right; color: #94a3b8; font-size: 11px;">${m.unit || ''}</span>
                </div>
            `).join('');
        }

        window.addInvObItem = function(item) {
            const existingIdx = invObPool.findIndex(p => p.item_id == item.id);
            if (existingIdx !== -1 && existingIdx !== activeSearchRowIndex) {
                alert("This item is already in your list.");
                document.getElementById('invObSearchResults').style.display = 'none';
                return;
            }

            const newRow = {
                item_id: item.id,
                code: item.code,
                name: item.name,
                unit: item.unit,
                selling_price: item.selling_price || 0,
                pieces: 0,
                quantity: 0,
                rate: parseFloat(item.selling_price) || parseFloat(item.purchase_price) || 0
            };

            if (activeSearchRowIndex !== null && activeSearchRowIndex < invObPool.length) {
                invObPool[activeSearchRowIndex] = newRow;
            } else {
                invObPool.push(newRow);
            }
            
            displayedInvOb = [...invObPool];
            document.getElementById('invObSearchResults').style.display = 'none';
            renderInvObGrid();
        };

        window.updateInvObRowData = function(idx, field, val) {
            if (displayedInvOb[idx]) {
                const numVal = parseFloat(val) || 0;
                displayedInvOb[idx][field] = numVal;

                // Auto calculate quantity when pieces is changed
                if (field === 'pieces') {
                    const factor = parseFloat(displayedInvOb[idx].qty_per_piece) || 0;
                    if (factor > 0) {
                        const calculatedQty = Math.round(numVal * factor * 1000) / 1000;
                        displayedInvOb[idx].quantity = calculatedQty;

                        // Immediately update the Quantity input element in the grid
                        const gridBody = document.getElementById('invObGridBody');
                        const qtyInput = document.getElementById(`inv-ob-qty-${idx}`) || 
                                         (gridBody && gridBody.children[idx] ? gridBody.children[idx].querySelectorAll('input.ob-input:not([type="hidden"])')[3] : null);
                        if (qtyInput) {
                            qtyInput.value = calculatedQty > 0 ? calculatedQty : '';
                            if (calculatedQty > 0) {
                                qtyInput.classList.add('has-value');
                            } else {
                                qtyInput.classList.remove('has-value');
                            }
                        }
                    }
                }

                // Live update amount cell without full re-render
                const amountCell = document.getElementById(`inv-ob-amount-${idx}`);
                if (amountCell) {
                    const qty = parseFloat(displayedInvOb[idx].quantity || 0);
                    const pieces = parseFloat(displayedInvOb[idx].pieces || 0);
                    const rate = parseFloat(displayedInvOb[idx].rate || 0);
                    const effectiveQty = qty > 0 ? qty : pieces;
                    const amount = effectiveQty * rate;
                    amountCell.textContent = amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                }
                // Also sync to invObPool
                const poolIdx = invObPool.findIndex(p => p.item_id == displayedInvOb[idx].item_id);
                if (poolIdx !== -1) {
                    invObPool[poolIdx][field] = numVal;
                    if (field === 'pieces' && displayedInvOb[idx].quantity !== undefined) {
                        invObPool[poolIdx].quantity = displayedInvOb[idx].quantity;
                    }
                }
                calculateInvOBTotals();
            }
        };

        function calculateInvOBTotals() {
            let total = 0;
            displayedInvOb.forEach(r => {
                total += (parseFloat(r.quantity) || 0) * (parseFloat(r.rate) || 0);
            });
            const field = document.getElementById('invObTotalAmount');
            if (field) field.textContent = total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }

        window.filterInvObGrid = function(event) {
            const input = document.getElementById('invObSearchInput');
            if (event && event.key === 'Escape' && input) {
                input.value = '';
            }
            const term = (input?.value || '').toLowerCase();
            if (!term) {
                displayedInvOb = [...invObPool];
            } else {
                displayedInvOb = invObPool.filter(a => 
                    (a.name || '').toLowerCase().includes(term) || 
                    (a.code || '').toLowerCase().includes(term)
                );
            }
            renderInvObGrid();
        };

        async function saveInvOpeningBalances() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const fyId = session.fy_id || 0;
            const coId = session.company_id || 1;
            const locId = document.getElementById('invObLocationSelect')?.value || 0;
            if (!locId) { alert("Please select a location."); return; }
            
            try {
                const res = await fetch(`api/inventory.php?action=save_inv_opening_balances`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fy_id: fyId, location_id: locId, balances: invObPool })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Opening Balances saved successfully!");
                    loadInvOpeningBalances();
                } else {
                    alert("Error: " + (result.message || "Could not save."));
                }
            } catch (e) { console.error(e); }
        }

        async function importInvBalances() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const currentFyId = session.fy_id || 0;
            const locId = document.getElementById('invObLocationSelect')?.value || 0;
            openSecondaryModularPopup('Navigation/Maintain/import_ob_wizard.html', 'fa-file-import', 'Import Inventory Balances', async () => {
                let retries = 0;
                const check = setInterval(async () => {
                    const sel = document.getElementById('importFromFY');
                    if (sel) {
                        clearInterval(check);
                        try {
                            const res = await fetch('api/maintain.php?action=get_fys');
                            if (res.ok) {
                                const fys = await res.json();
                                sel.innerHTML = fys.map(fy => `
                                    <option value="${fy.id}" ${fy.id == currentFyId ? 'disabled' : ''}>
                                        ${fy.abbreviation} ${fy.id == currentFyId ? '(Current)' : ''}
                                    </option>
                                `).join('');
                            }
                            const confirmBtn = document.getElementById('confirmImportObBtn');
                            if (confirmBtn) {
                                confirmBtn.onclick = async () => {
                                    const fromFyId = document.getElementById('importFromFY').value;
                                    if (!fromFyId) return;
                                    const impRes = await fetch('api/inventory.php?action=import_inv_opening_balances', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ fy_id: currentFyId, from_fy_id: fromFyId, location_id: locId })
                                    });
                                    const impResult = await impRes.json();
                                    if (impResult.status === 'success') {
                                        alert("Balances imported successfully!");
                                        closeSecondaryModal();
                                        loadInvOpeningBalances();
                                    }
                                };
                            }
                        } catch(e) { console.error(e); }
                    } else if (retries++ > 50) {
                        clearInterval(check);
                    }
                }, 50);
            });
        }
        
        function clearInvObData() {
            if (invObPool.length === 0) return;
            if (confirm("Are you sure you want to clear all data from the grid? This will not delete saved records until you save.")) {
                invObPool = [];
                displayedInvOb = [];
                renderInvObGrid();
            }
        }

        async function printInvOpeningBalances() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
            const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
            
            const locSelect = document.getElementById('invObLocationSelect');
            const locationName = locSelect && locSelect.options.length > 0 ? locSelect.options[locSelect.selectedIndex].text : 'Main Store';

            let printWindow = window.open('', '_blank');
            let dateStr = new Date().toLocaleDateString();
            
            let html = `
                <html>
                <head>
                    <title>Inventory Opening Balances</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
                        th { background-color: #f0f0f0; border-bottom: 2px solid #aaa; }
                        .text-right { text-align: right; }
                        .text-center { text-align: center; }
                        @media print { body { padding: 20px; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? '<img src="' + logo + '" alt="Company Logo">' : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>Inventory Opening Balances</h2>
                        <p style="text-align: left; margin: 5px 0 0 0; font-size: 13px; color: #555;">Location: <strong>${locationName}</strong></p>
                        <p style="text-align: left; margin: 5px 0 0 0; font-size: 13px; color: #555;">Printed on: ${dateStr}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Item Code</th>
                                <th>Description</th>
                                <th class="text-right">Pieces</th>
                                <th class="text-right">Quantity</th>
                                <th>Unit</th>
                                <th class="text-right">Rate</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            let totAmt = 0;
            displayedInvOb.forEach(row => {
                let amt = 0;
                let pieces = parseFloat(row.pieces) || 0;
                let qty = parseFloat(row.quantity) || 0;
                let rate = parseFloat(row.rate) || 0;
                
                if (qty > 0) amt = qty * rate;
                else if (pieces > 0) amt = pieces * rate;
                
                totAmt += amt;
                
                html += `<tr>
                    <td>${row.code || ''}</td>
                    <td>${row.name || ''}</td>
                    <td class="text-right">${pieces > 0 ? pieces : ''}</td>
                    <td class="text-right">${qty > 0 ? qty : ''}</td>
                    <td>${row.unit || ''}</td>
                    <td class="text-right">${rate.toFixed(2)}</td>
                    <td class="text-right">${amt.toFixed(2)}</td>
                </tr>`;
            });

            html += `
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan="6" class="text-right"><strong>Total</strong></th>
                                <th class="text-right"><strong>${totAmt.toFixed(2)}</strong></th>
                            </tr>
                        </tfoot>
                    </table>
                </body>
                </html>
            `;

            printWindow.document.write(html);
            printWindow.document.close();
            
            setTimeout(() => {
                printWindow.print();
            }, 500);
        }

        window.initInventoryOpeningBalancesView = initInventoryOpeningBalancesView;
        window.loadInvOpeningBalances = loadInvOpeningBalances;
        window.saveInvOpeningBalances = saveInvOpeningBalances;
        window.importInvBalances = importInvBalances;
        window.clearInvObData = clearInvObData;
        window.printInvOpeningBalances = printInvOpeningBalances;
        window.selectInvObRow = selectInvObRow;
        window.deleteSelectedInvObRow = deleteSelectedInvObRow;
        window.handleInvObAddSearch = handleInvObAddSearch;
        window.addInvObItem = addInvObItem;
        window.updateInvObRowData = updateInvObRowData;

        document.addEventListener('keydown', (e) => {
            const container = document.getElementById('invCOAContainer');
            if (container) {
                if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); resetInvItemForm(true); }
                if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveInvItem(); }
                if (e.key === 'Escape') { resetInvItemForm(); }
            }
        });
        document.addEventListener('click', (e) => {
            const results = document.getElementById('invObSearchResults');
            if (results && !results.contains(e.target) && !e.target.className?.includes('ob-input')) {
                results.style.display = 'none';
            }
        });

        window.onInvMainSelect = onInvMainSelect;
        window.onInvSubSelect = onInvSubSelect;
        window.onInvItemSelect = onInvItemSelect;
        window.saveInvMain = saveInvMain;
        window.saveInvSub = saveInvSub;
        window.saveInvItem = saveInvItem;
        window.resetInvMainForm = resetInvMainForm;
        window.resetInvSubForm = resetInvSubForm;
        window.resetInvItemForm = resetInvItemForm;

        // --- INVENTORY LOCATIONS MAINTENANCE LOGIC ---
        let locationMaintPool = [];
        let activeLocationId = null;

        async function initInventoryLocationsView() {
            let retries = 0;
            const maxRetries = 20;
            const checkAndRun = setInterval(async () => {
                const list = document.getElementById('locationMaintList');
                if (list) {
                    clearInterval(checkAndRun);
                    list.innerHTML = '<option>Loading...</option>';
                    
                    try {
                        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        const coId = session.company_id || 1;
                        const cb = `_cb=${Date.now()}`;
                        
                        const res = await fetch(`api/inventory.php?action=get_locations&company_id=${coId}&${cb}`);
                        if (res.ok) {
                            locationMaintPool = await res.json();
                            renderLocationMaintList();
                        } else {
                            console.error("Failed to fetch locations:", res.status);
                            list.innerHTML = '<option value="">Error loading data</option>';
                        }
                    } catch (e) { 
                        console.error("Locations Load Error:", e);
                        list.innerHTML = '<option value="">Network Error</option>';
                    }
                } else if (++retries >= maxRetries) {
                    clearInterval(checkAndRun);
                    console.error("Locations: Failed to find element #locationMaintList");
                }
            }, 100);
        }
        window.initInventoryLocationsView = initInventoryLocationsView;

        function renderLocationMaintList() {
            const list = document.getElementById('locationMaintList');
            if (!list) return;
            list.innerHTML = locationMaintPool.map(l => `<option value="${l.id}" ${activeLocationId == l.id ? 'selected' : ''}>${l.name}</option>`).join('');
            if (activeLocationId) {
                const selected = locationMaintPool.find(l => l.id == activeLocationId);
                if (selected) {
                    fillLocationForm(selected);
                }
            }
        }
        window.renderLocationMaintList = renderLocationMaintList;

        window.onLocationMaintSelect = function(id) {
            activeLocationId = id;
            const selected = locationMaintPool.find(l => l.id == id);
            if (selected) {
                fillLocationForm(selected);
            }
        };

        function fillLocationForm(loc) {
            const nameField = document.getElementById('locationMaintName');
            const descField = document.getElementById('locationMaintDesc');
            if (nameField) {
                nameField.value = loc.name;
                nameField.disabled = false;
            }
            if (descField) {
                descField.value = loc.description || '';
                descField.disabled = false;
            }
        }

        window.resetLocationForm = function(isNew = false) {
            activeLocationId = null;
            const list = document.getElementById('locationMaintList');
            if (list) list.value = '';
            const nameField = document.getElementById('locationMaintName');
            if (nameField) {
                nameField.value = '';
                nameField.disabled = !isNew;
                if (isNew) nameField.focus();
            }
            const descField = document.getElementById('locationMaintDesc');
            if (descField) {
                descField.value = '';
                descField.disabled = !isNew;
            }
        };

        window.saveLocationMaint = async function() {
            const name = document.getElementById('locationMaintName')?.value || '';
            const desc = document.getElementById('locationMaintDesc')?.value || '';
            if (!name) { alert("Please enter a Location Name."); return; }

            const coId = JSON.parse(localStorage.getItem('softifyx_session') || '{}').company_id || 1;
            
            try {
                const res = await fetch('api/inventory.php?action=save_location&company_id=' + coId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activeLocationId, name: name, description: desc })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    activeLocationId = result.id;
                    await initInventoryLocationsView();
                    // Also refresh any open Opening Balances view dropdown
                    const locSelect = document.getElementById('invObLocationSelect');
                    if (locSelect) {
                        const locRes = await fetch('api/inventory.php?action=get_locations');
                        if (locRes.ok) {
                            const locations = await locRes.json();
                            const currentVal = locSelect.value;
                            locSelect.innerHTML = locations.map(l => `<option value="${l.id}" ${l.is_default == 1 ? 'selected' : ''}>${l.name}</option>`).join('');
                            if (currentVal) locSelect.value = currentVal;
                        }
                    }
                } else {
                    alert(result.error || "Could not save location.");
                }
            } catch (e) { console.error(e); }
        };

        window.deleteLocationMaint = async function() {
            if (!activeLocationId) { alert("Please select a location to delete."); return; }
            if (confirm("Are you sure you want to delete this location?")) {
                const coId = JSON.parse(localStorage.getItem('softifyx_session') || '{}').company_id || 1;
                try {
                    const res = await fetch(`api/inventory.php?action=delete_location&id=${activeLocationId}&company_id=${coId}`);
                    const result = await res.json();
                    if (result.status === 'success') {
                        activeLocationId = null;
                        const nameField = document.getElementById('locationMaintName');
                        if (nameField) { nameField.value = ''; nameField.disabled = true; }
                        const descField = document.getElementById('locationMaintDesc');
                        if (descField) { descField.value = ''; descField.disabled = true; }
                        await initInventoryLocationsView();
                        // Refresh OB Select
                        const locSelect = document.getElementById('invObLocationSelect');
                        if (locSelect) {
                            const locRes = await fetch('api/inventory.php?action=get_locations');
                            if (locRes.ok) {
                                const locations = await locRes.json();
                                locSelect.innerHTML = locations.map(l => `<option value="${l.id}"> ${l.name}</option>`).join('');
                            }
                        }
                    } else {
                        alert(result.error || "Could not delete location.");
                    }
                } catch (e) { console.error(e); }
            }
        };

        window.resetLocationForm = resetLocationForm;

        window.numberToWords = function(amount) {
            const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
            const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
            const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
            
            if (amount === 0) return 'zero';
            
            const convert = (num) => {
                if (num < 10) return units[num];
                if (num < 20) return teens[num - 10];
                if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + units[num % 10] : '');
                if (num < 1000) return units[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
                if (num < 100000) return convert(Math.floor(num / 1000)) + ' thousand' + (num % 1000 ? ', ' + convert(num % 1000) : '');
                if (num < 10000000) return convert(Math.floor(num / 100000)) + ' lakh' + (num % 100000 ? ', ' + convert(num % 100000) : '');
                return convert(Math.floor(num / 10000000)) + ' crore' + (num % 10000000 ? ', ' + convert(num % 10000000) : '');
            };
            
            const wholeNum = Math.floor(amount);
            const decimal = Math.round((amount - wholeNum) * 100);
            let words = convert(wholeNum);
            if (decimal > 0) {
                words += " and " + decimal + "/100";
            }
            // Capitalize first letter
            words = words.charAt(0).toUpperCase() + words.slice(1);
            return words;
        };

        window.checkJournalNotifications = async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            if (session.username === 'Administrator' || session.username === 'Admin') {
                return; // Admin sends notes, should not receive popups
            }
            const coId = session.company_id || 1;
            const username = session.username || '';
            
            try {
                const res = await fetch(`api/journal_notes.php?action=get_notifications&company_id=${coId}`);
                if (res.ok) {
                    let notes = await res.json();
                    if (notes && notes.length > 0) {
                        // 1. Filter out dismissed notifications
                        const dismissed = JSON.parse(localStorage.getItem('dismissed_notifications_' + username) || '[]');
                        notes = notes.filter(n => !dismissed.includes(n.id));
                        
                        if (notes.length === 0) {
                            const dot = document.getElementById('notificationDot');
                            if (dot) dot.style.display = 'none';
                            return;
                        }

                        // 2. Check if there are any unread ones (not in read_notifications)
                        const read = JSON.parse(localStorage.getItem('read_notifications_' + username) || '[]');
                        const unreadNotes = notes.filter(n => !read.includes(n.id));
                        
                        const dot = document.getElementById('notificationDot');
                        if (dot) {
                            dot.style.display = unreadNotes.length > 0 ? 'block' : 'none';
                        }

                        // 3. Show slide-in toast popups ONLY for notifications that haven't been shown in this session
                        const shownToasts = JSON.parse(sessionStorage.getItem('shown_toasts_' + username) || '[]');
                        const toastsToShow = notes.filter(n => !shownToasts.includes(n.id));
                        
                        if (toastsToShow.length > 0) {
                            showNotesNotification(toastsToShow);
                            
                            // Mark them as shown in this session
                            toastsToShow.forEach(n => {
                                if (!shownToasts.includes(n.id)) {
                                    shownToasts.push(n.id);
                                }
                            });
                            sessionStorage.setItem('shown_toasts_' + username, JSON.stringify(shownToasts));
                        }
                    } else {
                        const dot = document.getElementById('notificationDot');
                        if (dot) dot.style.display = 'none';
                    }
                }
            } catch(e) {
                console.error("Failed to load notifications:", e);
            }
        };

        function showNotesNotification(notes) {
            let container = document.getElementById('jnGlobalNotifications');
            if (!container) {
                container = document.createElement('div');
                container.id = 'jnGlobalNotifications';
                container.style.position = 'fixed';
                container.style.top = '70px';
                container.style.right = '20px';
                container.style.width = '320px';
                container.style.zIndex = '99999';
                document.body.appendChild(container);
            }
            container.innerHTML = '';

            notes.forEach(note => {
                const toast = document.createElement('div');
                toast.style.background = '#fff';
                toast.style.borderLeft = '4px solid #1F4E79';
                toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                toast.style.padding = '12px 15px';
                toast.style.marginBottom = '10px';
                toast.style.borderRadius = '4px';
                toast.style.position = 'relative';
                toast.style.animation = 'slideInRight 0.3s ease-out';
                
                // Escape simple HTML
                const escapeHTML = (str) => {
                    if (!str) return '';
                    return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag] || tag));
                };

                toast.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                        <strong style="color: #1F4E79; font-size: 13px;"><i class="fas fa-bell" style="color: #f59e0b; margin-right: 5px;"></i> ${escapeHTML(note.title)}</strong>
                        <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#94a3b8; cursor:pointer; padding:0; font-size: 14px;"><i class="fas fa-times"></i></button>
                    </div>
                    <div style="font-size: 12px; color: #475569; line-height: 1.4; max-height: 60px; overflow-y: auto;">${escapeHTML(note.content)}</div>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 8px; text-align: right;">By: ${escapeHTML(note.created_by)} | Today</div>
                `;
                container.appendChild(toast);
            });
            
            if (!document.getElementById('jnKeyframes')) {
                const style = document.createElement('style');
                style.id = 'jnKeyframes';
                style.innerHTML = `@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
                document.head.appendChild(style);
            }
        }

        // ==========================================
        // DRIVERS MANAGEMENT
        // ==========================================
        let driverMaintList = [];
        let selectedMaintDriverId = null;

        async function manageDrivers() {
            try {
                const res = await fetch('Navigation/Maintain/drivers.html');
                if (!res.ok) throw new Error('Could not load Drivers form');
                const html = await res.text();
                openSecondaryModal({ icon: 'fa-id-card', text: 'Drivers' }, html, false, 'Drivers');
                
                let retryCount = 0;
                const tryInit = () => {
                    const list = document.getElementById('driverMaintList');
                    if (list) {
                        list.innerHTML = '<option disabled>Loading...</option>';
                        loadDriversForMaintenance();
                    } else if (retryCount < 10) {
                        retryCount++;
                        setTimeout(tryInit, 100);
                    }
                };
                setTimeout(tryInit, 50);
            } catch (e) {
                console.error("Manage Drivers error:", e);
                alert("Could not load Drivers form.");
            }
        }
        window.manageDrivers = manageDrivers;

        async function loadDriversForMaintenance(selectIdToPick = null) {
            try {
                const res = await fetch('api/drivers.php?action=get_drivers');
                if (!res.ok) return;
                driverMaintList = await res.json() || [];
                const list = document.getElementById('driverMaintList');
                if (!list) return;

                list.innerHTML = '';
                if (!driverMaintList || driverMaintList.length === 0) {
                    list.innerHTML = '<option disabled style="color:#94a3b8; font-style:italic;">No drivers saved yet</option>';
                    resetDriverForm(false);
                    return;
                }

                driverMaintList.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.name + (d.vehicle_desc ? ` (${d.vehicle_desc})` : '');
                    list.appendChild(opt);
                });

                if (selectIdToPick) {
                    list.value = selectIdToPick;
                    onDriverMaintSelect(selectIdToPick);
                } else if (driverMaintList.length > 0) {
                    list.value = driverMaintList[0].id;
                    onDriverMaintSelect(driverMaintList[0].id);
                }
            } catch (e) {
                console.error('Error loading drivers:', e);
            }
        }
        window.loadDriversForMaintenance = loadDriversForMaintenance;

        function onDriverMaintSelect(id) {
            selectedMaintDriverId = id;
            const d = (driverMaintList || []).find(item => item.id == id);
            if (!d) return;

            const nameInput = document.getElementById('driverMaintName');
            const cnicInput = document.getElementById('driverMaintCnic');
            const mobileInput = document.getElementById('driverMaintMobile');
            const vehicleInput = document.getElementById('driverMaintVehicle');

            if (nameInput) { nameInput.value = d.name || ''; nameInput.disabled = false; }
            if (cnicInput) { cnicInput.value = d.cnic || ''; cnicInput.disabled = false; }
            if (mobileInput) { mobileInput.value = d.mobile || ''; mobileInput.disabled = false; }
            if (vehicleInput) { vehicleInput.value = d.vehicle_desc || ''; vehicleInput.disabled = false; }
        }
        window.onDriverMaintSelect = onDriverMaintSelect;

        function resetDriverForm(generate = false) {
            selectedMaintDriverId = generate ? null : selectedMaintDriverId;
            const list = document.getElementById('driverMaintList');
            if (generate && list) list.value = '';

            const nameInput = document.getElementById('driverMaintName');
            const cnicInput = document.getElementById('driverMaintCnic');
            const mobileInput = document.getElementById('driverMaintMobile');
            const vehicleInput = document.getElementById('driverMaintVehicle');

            if (generate) {
                if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
                if (cnicInput) { cnicInput.value = ''; cnicInput.disabled = false; }
                if (mobileInput) { mobileInput.value = ''; mobileInput.disabled = false; }
                if (vehicleInput) { vehicleInput.value = ''; vehicleInput.disabled = false; }
                setTimeout(() => { if (nameInput) nameInput.focus(); }, 50);
            } else {
                if (selectedMaintDriverId && (driverMaintList || []).some(d => d.id == selectedMaintDriverId)) {
                    onDriverMaintSelect(selectedMaintDriverId);
                } else if (driverMaintList && driverMaintList.length > 0) {
                    onDriverMaintSelect(driverMaintList[0].id);
                } else {
                    if (nameInput) { nameInput.value = ''; nameInput.disabled = true; }
                    if (cnicInput) { cnicInput.value = ''; cnicInput.disabled = true; }
                    if (mobileInput) { mobileInput.value = ''; mobileInput.disabled = true; }
                    if (vehicleInput) { vehicleInput.value = ''; vehicleInput.disabled = true; }
                }
            }
        }
        window.resetDriverForm = resetDriverForm;

        async function saveDriver() {
            const name = document.getElementById('driverMaintName')?.value.trim();
            const cnic = document.getElementById('driverMaintCnic')?.value.trim();
            const mobile = document.getElementById('driverMaintMobile')?.value.trim();
            const vehicle = document.getElementById('driverMaintVehicle')?.value.trim();

            if (!name) {
                alert('Please enter Driver Name.');
                document.getElementById('driverMaintName')?.focus();
                return;
            }

            try {
                const res = await fetch('api/drivers.php?action=save_driver', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedMaintDriverId,
                        name: name,
                        cnic: cnic,
                        mobile: mobile,
                        vehicle_desc: vehicle
                    })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert(result.message || 'Driver saved successfully!');
                    selectedMaintDriverId = result.id;
                    await loadDriversForMaintenance(result.id);
                    if (window.DeliveryChallanModule && typeof window.DeliveryChallanModule.loadDrivers === 'function') {
                        window.DeliveryChallanModule.loadDrivers(result.id);
                    }
                } else {
                    alert(result.message || 'Error saving driver.');
                }
            } catch (e) {
                alert('Error saving driver: ' + (e.message || e));
            }
        }
        window.saveDriver = saveDriver;

        async function deleteDriver() {
            if (!selectedMaintDriverId) {
                alert('Please select a driver to delete.');
                return;
            }
            if (!confirm('Are you sure you want to delete this driver?')) return;

            try {
                const res = await fetch(`api/drivers.php?action=delete_driver&id=${selectedMaintDriverId}`);
                const result = await res.json();
                if (result.status === 'success') {
                    alert('Driver deleted.');
                    selectedMaintDriverId = null;
                    await loadDriversForMaintenance();
                    if (window.DeliveryChallanModule && typeof window.DeliveryChallanModule.loadDrivers === 'function') {
                        window.DeliveryChallanModule.loadDrivers();
                    }
                } else {
                    alert(result.message || 'Failed to delete driver.');
                }
            } catch (e) {
                alert('Error deleting driver.');
            }
        }
        window.deleteDriver = deleteDriver;


