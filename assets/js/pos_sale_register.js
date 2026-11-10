/**
 * SoftifyX ERP - POS Sales Register Module
 * Production-ready Sales Register for POS Module
 */
window.POSRegisterModule = {
    invoices: [],
    summary: {},
    pagination: {
        page: 1,
        limit: 25,
        total: 0,
        pages: 1
    },
    currentSort: {
        column: 'id',
        dir: 'DESC'
    },
    branches: [],
    selectedInvoiceId: null,
    selectedInvoice: null,
    currentCancelCaptcha: null,
    currentDeleteCaptcha: null,
    selectedDeleteInvoiceId: null,
    selectedDeleteInvoiceNo: null,

    generateCaptcha: function() {
        const operations = ['+', '-', '*'];
        const op = operations[Math.floor(Math.random() * operations.length)];
        let num1, num2, answer;

        if (op === '+') {
            num1 = Math.floor(Math.random() * 12) + 2; // 2 to 13
            num2 = Math.floor(Math.random() * 12) + 1; // 1 to 12
            answer = num1 + num2;
        } else if (op === '-') {
            num1 = Math.floor(Math.random() * 14) + 6; // 6 to 19
            num2 = Math.floor(Math.random() * (num1 - 2)) + 1; // 1 to num1-1 (always positive)
            answer = num1 - num2;
        } else { // '*'
            num1 = Math.floor(Math.random() * 6) + 2; // 2 to 7
            num2 = Math.floor(Math.random() * 5) + 2; // 2 to 6
            answer = num1 * num2;
        }

        const symbol = (op === '*') ? '×' : (op === '-' ? '−' : '+');
        return {
            num1: num1,
            num2: num2,
            op: op,
            symbol: symbol,
            question: `${num1} ${symbol} ${num2}`,
            answer: answer
        };
    },

    init: async function() {
        console.log("POSRegisterModule: Initializing...");
        this.setupDefaultDates();
        await this.loadBranches();
        await this.loadInvoices();
    },

    getCompanyId: function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        return window.selectedCompanyId || session.company_id || 1;
    },

    setupDefaultDates: function(forceReset = false) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const fromEl = document.getElementById('pos_filter_from');
        const toEl = document.getElementById('pos_filter_to');
        if (fromEl && (!fromEl.value || forceReset)) fromEl.value = todayStr;
        if (toEl && (!toEl.value || forceReset)) toEl.value = todayStr;
    },

    loadBranches: async function() {
        const select = document.getElementById('pos_filter_branch');
        if (!select) return;

        try {
            const compId = this.getCompanyId();
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const isPosUser = session.role === 'POS' && session.branch_id;

            const res = await fetch(`api/pos_sale_register.php?action=get_filter_lookups&company_id=${compId}`);
            if (res.ok) {
                const rawText = await res.text();
                let data = null;
                try {
                    data = JSON.parse(rawText);
                } catch (e) {
                    console.error("POSRegisterModule: Non-JSON response loading branches:", rawText);
                }
                if (data && data.status === 'success' && Array.isArray(data.branches)) {
                    this.branches = data.branches;
                    let opts = isPosUser ? '' : '<option value="">All Branches</option>';
                    data.branches.forEach(b => {
                        opts += `<option value="${b.id}">${b.branch_code ? b.branch_code + ' - ' : ''}${b.branch_name}</option>`;
                    });
                    select.innerHTML = opts;

                    if (isPosUser) {
                        select.value = session.branch_id;
                        select.disabled = true;
                        select.title = "Restricted to your assigned branch";
                        select.style.backgroundColor = '#e2e8f0';
                        select.style.cursor = 'not-allowed';
                        select.style.fontWeight = 'bold';
                    }
                }
            }
        } catch (e) {
            console.error("POSRegisterModule: Error loading branches:", e);
        }
    },

    formatDateForApi: function(val) {
        if (!val) return '';
        val = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        return val;
    },

    loadInvoices: async function() {
        const tbody = document.getElementById('pos_register_tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center; padding: 40px; color: #718096;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #1F4E79;"></i>
                        <div style="margin-top: 8px; font-weight: 500;">Loading invoices from database...</div>
                    </td>
                </tr>
            `;
        }

        const compId = this.getCompanyId();
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const isPosUser = session.role === 'POS' && session.branch_id;
        const search = (document.getElementById('pos_filter_search')?.value || '').trim();
        const customer = (document.getElementById('pos_filter_customer')?.value || '').trim();
        let branch_id = document.getElementById('pos_filter_branch')?.value || '';
        if (isPosUser) {
            branch_id = session.branch_id;
        }
        const from_date = this.formatDateForApi(document.getElementById('pos_filter_from')?.value || '');
        const to_date = this.formatDateForApi(document.getElementById('pos_filter_to')?.value || '');
        const payment_status = document.getElementById('pos_filter_payment')?.value || '';
        const fbr_status = document.getElementById('pos_filter_fbr')?.value || '';

        const params = new URLSearchParams({
            action: 'get_invoices',
            company_id: compId,
            search: search,
            customer: customer,
            branch_id: branch_id,
            from_date: from_date,
            to_date: to_date,
            payment_status: payment_status,
            fbr_status: fbr_status,
            page: this.pagination.page,
            limit: this.pagination.limit,
            sort_by: this.currentSort.column,
            sort_dir: this.currentSort.dir
        });

        try {
            const res = await fetch(`api/pos_sale_register.php?${params.toString()}`);
            const rawText = await res.text();
            let json = null;
            try {
                json = JSON.parse(rawText);
            } catch (parseErr) {
                console.error("POSRegisterModule: Non-JSON response from server:", rawText);
            }

            if (res.ok && json && json.status === 'success') {
                this.invoices = json.data || [];
                this.summary = json.summary || {};
                this.pagination = json.pagination || { total: 0, page: 1, limit: 25, pages: 1 };

                this.renderSummaryCards();
                this.renderTable(this.invoices);
                this.renderPagination();
            } else {
                let errMsg = (json && (json.message || json.error));
                if (!errMsg && rawText) {
                    const clean = rawText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
                    if (clean) errMsg = clean.length > 250 ? clean.substring(0, 250) + '...' : clean;
                }
                if (!errMsg) {
                    errMsg = (res.statusText ? res.statusText : `Server returned status ${res.status} (No response body)`);
                }
                console.error("POSRegisterModule load invoices error:", errMsg, "HTTP Status:", res.status);
                if (tbody) tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 25px; color: #c53030;"><i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i> ${this.escapeHtml(errMsg)}</td></tr>`;
            }
        } catch (e) {
            console.error("POSRegisterModule: Load invoices network error:", e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 25px; color: #c53030;"><i class="fas fa-exclamation-circle" style="margin-right: 6px;"></i> Network error: ${this.escapeHtml(e.message || 'Failed to connect to server')}</td></tr>`;
        }
    },

    renderSummaryCards: function() {
        const sum = this.summary;
        const totalInvoicesEl = document.getElementById('pos_sum_total_invoices');
        const totalSalesEl = document.getElementById('pos_sum_total_sales');
        const fbrSubmittedEl = document.getElementById('pos_sum_fbr_submitted');
        const fbrPendingEl = document.getElementById('pos_sum_fbr_pending');

        if (totalInvoicesEl) totalInvoicesEl.textContent = Number(sum.total_invoices || 0).toLocaleString();
        if (totalSalesEl) totalSalesEl.textContent = 'PKR ' + Number(sum.total_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (fbrSubmittedEl) fbrSubmittedEl.textContent = Number(sum.fbr_submitted || 0).toLocaleString();
        if (fbrPendingEl) fbrPendingEl.textContent = Number(sum.fbr_pending || 0).toLocaleString();
    },

    renderTable: function(data) {
        const tbody = document.getElementById('pos_register_tbody');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center; padding: 50px 20px; color: #a0aec0;">
                        <i class="fas fa-folder-open" style="font-size: 32px; margin-bottom: 8px; color: #cbd5e0;"></i>
                        <div style="font-size: 14px; font-weight: 500; color: #718096;">No POS invoices found</div>
                        <div style="font-size: 11px; margin-top: 4px;">Try adjusting your filters or date range.</div>
                    </td>
                </tr>
            `;
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const role = String(session.role || '').trim().toLowerCase();
        const username = String(session.username || '').trim().toLowerCase();
        const branchId = parseInt(session.branch_id || 0);

        // A user is a POS Branch User if:
        // - Their role is 'pos'
        // - OR they have an assigned branch (branchId > 0)
        // - OR their role is not admin
        const isPosBranchUser = (role === 'pos' || branchId > 0 || (role !== 'admin' && role !== 'administrator' && username !== 'admin' && username !== 'administrator'));

        // Full Admin mode ONLY applies to Central Administrator with NO assigned branch constraint
        const isAdmin = !isPosBranchUser;

        let html = '';
        data.forEach(inv => {
            const isCancelled = parseInt(inv.is_cancelled || 0) === 1;
            const rowClass = isCancelled ? 'row-cancelled' : '';
            const invNo = inv.formatted_invoice_no;
            const dateTime = this.formatDateTime(inv.invoice_date, inv.created_at);
            const netTotal = parseFloat(inv.net_total || 0);
            const subtotal = parseFloat(inv.subtotal || 0);
            const discount = parseFloat(inv.total_discount || 0);
            const taxAmt = parseFloat(inv.total_tax || 0);

            // Badges
            const payBadge = this.getPaymentBadge(inv.calc_payment_status);
            const fbrBadge = this.getFBRBadge(inv.fbr_status);

            const isGenuineFbr = Boolean(inv.fbr_invoice_number && inv.fbr_invoice_number.trim() !== '' && inv.fbr_invoice_number !== 'Not Available' && inv.fbr_invoice_number !== 'None');
            let fbrNumDisplay = '<span style="color: #a0aec0;">—</span>';
            if (isGenuineFbr) {
                fbrNumDisplay = `<span style="font-family: monospace; font-size: 11px; font-weight: 700; color: #2b6cb0;">${this.escapeHtml(inv.fbr_invoice_number)}</span>`;
            } else if (inv.fbr_invoice_number === 'Not Available') {
                fbrNumDisplay = `<span class="pos-badge badge-fbr-failed" style="font-size: 10px; padding: 2px 6px; cursor: pointer;" onclick="window.POSRegisterModule.checkFBRStatus(${inv.id})" title="Click to view rejection reason from FBR"><i class="fas fa-exclamation-triangle"></i> Not Available</span>`;
            }

            const isFbrLocked = !isCancelled && isGenuineFbr && (inv.fbr_status === 'Submitted' || inv.fbr_status === 'Accepted');

            html += `
                <tr class="${rowClass}">
                    <td style="font-weight: 700; color: #2b6cb0;">
                        <a href="javascript:void(0)" onclick="window.POSRegisterModule.viewDetails(${inv.id})" style="color: inherit; text-decoration: underline;" title="View Details">${invNo}</a>
                        ${inv.print_count > 0 ? `<span style="margin-left: 4px; font-size: 10px; color: #718096;" title="Printed ${inv.print_count} time(s)"><i class="fas fa-print"></i>${inv.print_count > 1 ? inv.print_count : ''}</span>` : ''}
                    </td>
                    <td>${dateTime}</td>
                    <td><span style="font-weight: 500;">${this.escapeHtml(inv.branch_name)}</span></td>
                    <td>
                        <div style="font-weight: 600;">${this.escapeHtml(inv.customer_name)}</div>
                        ${inv.customer_mobile ? `<div style="font-size: 10px; color: #718096;">${this.escapeHtml(inv.customer_mobile)}</div>` : ''}
                    </td>
                    <td style="text-align: center;"><span style="background: #edf2f7; padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: 600;">${inv.items_count || 0}</span></td>
                    <td style="text-align: right;">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: right; color: ${discount > 0 ? '#e53e3e' : 'inherit'};">${discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: right;">${taxAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: right; font-weight: 700; color: #1a202c;">${netTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: center;" class="no-strike">${payBadge}</td>
                    <td style="text-align: center;" class="no-strike">${fbrBadge}</td>
                    <td style="text-align: center;">${fbrNumDisplay}</td>
                    <td style="text-align: center;" class="no-strike">
                        <div style="display: inline-flex; gap: 3px; align-items: center; justify-content: center;">
                            ${isAdmin ? `
                                ${!isCancelled && !isFbrLocked ? `
                                    <button class="pos-action-btn pos-btn-edit" onclick="window.POSRegisterModule.editInPOS(${inv.id})" title="Edit Invoice in POS Sale">
                                        <i class="fas fa-edit" style="color: #2b6cb0;"></i>
                                    </button>
                                ` : ''}
                                <button class="pos-action-btn pos-btn-view" onclick="window.POSRegisterModule.viewDetails(${inv.id})" title="View Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="pos-action-btn pos-btn-print" onclick="window.POSRegisterModule.printReceipt(${inv.id})" title="Print / Reprint Receipt">
                                    <i class="fas fa-print"></i>
                                </button>
                                ${!isCancelled && !isFbrLocked ? `
                                    <button class="pos-action-btn" onclick="window.POSRegisterModule.validateFBRInvoice(${inv.id})" title="Pre-Flight Validate with FBR" style="color: #2b6cb0;">
                                        <i class="fas fa-check-double"></i>
                                    </button>
                                    <button class="pos-action-btn pos-btn-fbr" onclick="window.POSRegisterModule.submitToFBR(${inv.id})" title="Submit to FBR">
                                        <i class="fas fa-cloud-upload-alt"></i>
                                    </button>
                                ` : `
                                    <button class="pos-action-btn" onclick="window.POSRegisterModule.checkFBRStatus(${inv.id})" title="Check FBR Status" style="color: #3182ce;">
                                        <i class="fas fa-check-circle"></i>
                                    </button>
                                `}
                                ${!isCancelled ? `
                                    <button class="pos-action-btn pos-btn-return" onclick="window.POSRegisterModule.openSalesReturn(${inv.id})" title="Sales Return">
                                        <i class="fas fa-undo"></i>
                                    </button>
                                ` : ''}
                                <button class="pos-action-btn" onclick="window.POSRegisterModule.viewHistory(${inv.id})" title="View Audit History">
                                    <i class="fas fa-history"></i>
                                </button>
                                ${!isCancelled ? `
                                    <button class="pos-action-btn pos-btn-cancel" onclick="window.POSRegisterModule.openCancelModal(${inv.id})" title="Cancel Invoice">
                                        <i class="fas fa-ban"></i>
                                    </button>
                                ` : ''}
                                ${isFbrLocked ? `
                                    <button class="pos-action-btn" style="color: #cbd5e0; cursor: not-allowed; opacity: 0.5;" title="Posted to FBR - Cannot Delete" disabled>
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                ` : `
                                    <button class="pos-action-btn pos-btn-delete" onclick="window.POSRegisterModule.deleteInvoice(${inv.id}, '${invNo}')" title="Delete Unposted Invoice">
                                        <i class="fas fa-trash-alt" style="color: #e53e3e;"></i>
                                    </button>
                                `}
                            ` : `
                                <button class="pos-action-btn pos-btn-view" onclick="window.POSRegisterModule.viewDetails(${inv.id})" title="View Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="pos-action-btn pos-btn-print" onclick="window.POSRegisterModule.printReceipt(${inv.id})" title="Print / Reprint Receipt">
                                    <i class="fas fa-print"></i>
                                </button>
                                ${!isCancelled && !isFbrLocked ? `
                                    <button class="pos-action-btn pos-btn-fbr" onclick="window.POSRegisterModule.submitToFBR(${inv.id})" title="Submit to FBR">
                                        <i class="fas fa-cloud-upload-alt"></i>
                                    </button>
                                ` : ''}
                                <button class="pos-action-btn" onclick="window.POSRegisterModule.checkFBRStatus(${inv.id})" title="Check FBR Status" style="color: #3182ce;">
                                    <i class="fas fa-check-circle"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    getPaymentBadge: function(status) {
        status = status || 'Unpaid';
        switch (status) {
            case 'Paid':
                return `<span class="pos-badge badge-paid"><i class="fas fa-check"></i> Paid</span>`;
            case 'Partially Paid':
                return `<span class="pos-badge badge-partially-paid"><i class="fas fa-adjust"></i> Partial</span>`;
            case 'Cancelled':
                return `<span class="pos-badge badge-cancelled"><i class="fas fa-ban"></i> Cancelled</span>`;
            default:
                return `<span class="pos-badge badge-unpaid"><i class="fas fa-times"></i> Unpaid</span>`;
        }
    },

    getFBRBadge: function(status) {
        status = status || 'Not Submitted';
        switch (status) {
            case 'Submitted':
            case 'Accepted':
                return `<span class="pos-badge badge-fbr-submitted"><i class="fas fa-check-double"></i> Submitted</span>`;
            case 'Pending':
                return `<span class="pos-badge badge-fbr-pending"><i class="fas fa-clock"></i> Pending</span>`;
            case 'Rejected':
                return `<span class="pos-badge badge-fbr-rejected"><i class="fas fa-exclamation-circle"></i> Rejected</span>`;
            case 'Failed':
                return `<span class="pos-badge badge-fbr-failed"><i class="fas fa-times-circle"></i> Failed</span>`;
            case 'Verification Required':
                return `<span class="pos-badge badge-fbr-verify"><i class="fas fa-search"></i> Verification</span>`;
            default:
                return `<span class="pos-badge badge-fbr-not-submitted"><i class="fas fa-minus"></i> Not Submitted</span>`;
        }
    },

    renderPagination: function() {
        const pag = this.pagination;
        const infoEl = document.getElementById('pos_pagination_info');
        const ctrlEl = document.getElementById('pos_pagination_controls');
        if (!infoEl || !ctrlEl) return;

        const start = pag.total === 0 ? 0 : (pag.page - 1) * pag.limit + 1;
        const end = Math.min(pag.page * pag.limit, pag.total);
        infoEl.textContent = `Showing ${start} - ${end} of ${pag.total.toLocaleString()} invoices`;

        let btns = '';
        btns += `<button class="pos-pag-btn" onclick="window.POSRegisterModule.changePage(1)" ${pag.page <= 1 ? 'disabled' : ''}><i class="fas fa-angle-double-left"></i></button>`;
        btns += `<button class="pos-pag-btn" onclick="window.POSRegisterModule.changePage(${pag.page - 1})" ${pag.page <= 1 ? 'disabled' : ''}><i class="fas fa-angle-left"></i> Prev</button>`;

        // Page buttons window
        const maxWindow = 5;
        let startPage = Math.max(1, pag.page - Math.floor(maxWindow / 2));
        let endPage = Math.min(pag.pages, startPage + maxWindow - 1);
        if (endPage - startPage + 1 < maxWindow) {
            startPage = Math.max(1, endPage - maxWindow + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            btns += `<button class="pos-pag-btn ${p === pag.page ? 'active' : ''}" onclick="window.POSRegisterModule.changePage(${p})">${p}</button>`;
        }

        btns += `<button class="pos-pag-btn" onclick="window.POSRegisterModule.changePage(${pag.page + 1})" ${pag.page >= pag.pages ? 'disabled' : ''}>Next <i class="fas fa-angle-right"></i></button>`;
        btns += `<button class="pos-pag-btn" onclick="window.POSRegisterModule.changePage(${pag.pages})" ${pag.page >= pag.pages ? 'disabled' : ''}><i class="fas fa-angle-double-right"></i></button>`;

        ctrlEl.innerHTML = btns;
    },

    changePage: function(p) {
        if (p < 1 || p > this.pagination.pages || p === this.pagination.page) return;
        this.pagination.page = p;
        this.loadInvoices();
    },

    changePageSize: function(limit) {
        this.pagination.limit = parseInt(limit);
        this.pagination.page = 1;
        this.loadInvoices();
    },

    applyFilters: function() {
        this.pagination.page = 1;
        this.loadInvoices();
    },

    clearFilters: function() {
        const searchEl = document.getElementById('pos_filter_search');
        const custEl = document.getElementById('pos_filter_customer');
        const branchEl = document.getElementById('pos_filter_branch');
        const payEl = document.getElementById('pos_filter_payment');
        const fbrEl = document.getElementById('pos_filter_fbr');

        if (searchEl) searchEl.value = '';
        if (custEl) custEl.value = '';
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const isPosUser = session.role === 'POS' && session.branch_id;
        if (branchEl) {
            branchEl.value = isPosUser ? session.branch_id : '';
        }
        if (payEl) payEl.value = '';
        if (fbrEl) fbrEl.value = '';

        this.setupDefaultDates(true);
        this.pagination.page = 1;
        this.loadInvoices();
    },

    sortBy: function(column) {
        if (this.currentSort.column === column) {
            this.currentSort.dir = this.currentSort.dir === 'ASC' ? 'DESC' : 'ASC';
        } else {
            this.currentSort.column = column;
            this.currentSort.dir = 'DESC';
        }
        this.pagination.page = 1;
        this.loadInvoices();
    },

    openNewSale: function() {
        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/POS/pos_sale.html', 'fa-cart-plus', 'Sale Invoice', () => {
                if (window.POSModule) window.POSModule.init();
            }, 'Sale Invoice', true, true);
        } else if (typeof window.loadView === 'function') {
            window.loadView('Navigation/POS/pos_sale.html');
        }
    },

    // -------------------------------------------------------------
    // MODAL HANDLERS
    // -------------------------------------------------------------
    closeModal: function(modalId) {
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.remove('show');
            m.style.display = 'none';
        }
    },

    openModal: function(modalId) {
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.add('show');
            m.style.display = 'flex';
        }
    },

    // -------------------------------------------------------------
    // ACTION: View Invoice Details
    // -------------------------------------------------------------
    viewDetails: async function(id) {
        this.selectedInvoiceId = id;
        const compId = this.getCompanyId();

        try {
            const res = await fetch(`api/pos_sale_register.php?action=get_invoice_details&id=${id}&company_id=${compId}`);
            if (!res.ok) throw new Error('Network response not ok');
            const data = await res.json();
            if (data.status !== 'success') {
                alert('Error loading details: ' + data.message);
                return;
            }

            this.selectedInvoice = data;
            const inv = data.header;
            const items = data.items || [];

            const invNo = inv.pos_invoice_no || ('INV-' + String(inv.serial_no).padStart(4, '0'));
            document.getElementById('pos_md_inv_no').textContent = '#' + invNo;

            // Setup buttons
            const btnPrint = document.getElementById('pos_md_btn_print');
            const btnFBR = document.getElementById('pos_md_btn_fbr');
            const btnReturn = document.getElementById('pos_md_btn_return');

            if (btnPrint) btnPrint.onclick = () => this.printReceipt(id);
            if (btnFBR) {
                btnFBR.onclick = () => this.submitToFBR(id);
                btnFBR.style.display = (inv.fbr_status === 'Submitted' || inv.fbr_status === 'Accepted' || parseInt(inv.is_cancelled) === 1) ? 'none' : 'inline-block';
            }
            if (btnReturn) {
                btnReturn.onclick = () => this.openSalesReturn(id);
                btnReturn.style.display = parseInt(inv.is_cancelled) === 1 ? 'none' : 'inline-block';
            }

            // Generate Body
            let bodyHtml = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px;">
                    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <h5 style="margin: 0 0 6px 0; font-size: 11px; color: #718096; text-transform: uppercase;">Customer Info</h5>
                        <div style="font-weight: 700; font-size: 14px; color: #1a202c;">${this.escapeHtml(inv.customer_name)}</div>
                        <div style="font-size: 12px; color: #4a5568;">Phone: ${this.escapeHtml(inv.customer_mobile || '—')}</div>
                        <div style="font-size: 12px; color: #4a5568;">Address: ${this.escapeHtml(inv.customer_full_address || '—')}</div>
                        ${inv.customer_ntn_val ? `<div style="font-size: 12px; color: #4a5568;">NTN / CNIC: <b>${this.escapeHtml(inv.customer_ntn_val)}</b></div>` : ''}
                    </div>

                    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <h5 style="margin: 0 0 6px 0; font-size: 11px; color: #718096; text-transform: uppercase;">Branch & System</h5>
                        <div style="font-weight: 700; font-size: 14px; color: #1a202c;">${this.escapeHtml(inv.branch_name || 'Main / Default')}</div>
                        <div style="font-size: 12px; color: #4a5568;">Date: ${inv.invoice_date || '—'}</div>
                        <div style="font-size: 12px; color: #4a5568;">Payment Method: <b>${inv.payment_terms || 'Cash'}</b></div>
                    </div>

                    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <h5 style="margin: 0 0 6px 0; font-size: 11px; color: #718096; text-transform: uppercase;">Status & Compliance</h5>
                        <div style="margin-bottom: 4px;">Payment: ${this.getPaymentBadge(inv.calc_payment_status || (parseInt(inv.is_cancelled) === 1 ? 'Cancelled' : (parseFloat(inv.amount_received) >= parseFloat(inv.net_total) ? 'Paid' : 'Unpaid')))}</div>
                        <div style="margin-bottom: 4px;">FBR Status: ${this.getFBRBadge(inv.fbr_status)}</div>
                        <div style="font-size: 12px; color: #4a5568;">FBR Ref: <b>${inv.fbr_invoice_number || '—'}</b></div>
                    </div>
                </div>
            `;

            if (parseInt(inv.is_cancelled) === 1) {
                bodyHtml += `
                    <div style="background: #fff5f5; border: 1px solid #fed7d7; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; color: #c53030; font-size: 12px;">
                        <i class="fas fa-ban"></i> <b>Cancelled Invoice:</b> ${this.escapeHtml(inv.cancel_reason || 'No cancellation reason provided.')}
                    </div>
                `;
            }

            // Items Table
            bodyHtml += `
                <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 16px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <tr>
                                <th style="padding: 8px 10px; text-align: left;">#</th>
                                <th style="padding: 8px 10px; text-align: left;">Item Description</th>
                                <th style="padding: 8px 10px; text-align: right;">Qty</th>
                                <th style="padding: 8px 10px; text-align: left;">Unit</th>
                                <th style="padding: 8px 10px; text-align: right;">Rate</th>
                                <th style="padding: 8px 10px; text-align: right;">Gross</th>
                                <th style="padding: 8px 10px; text-align: right;">Discount</th>
                                <th style="padding: 8px 10px; text-align: right;">Tax</th>
                                <th style="padding: 8px 10px; text-align: right;">Net Amount</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            let subtotalCalc = 0;
            let itemDiscCalc = 0;
            let taxCalc = 0;

            if (items.length === 0) {
                bodyHtml += `<tr><td colspan="9" style="text-align: center; padding: 15px; color: #a0aec0;">No item lines recorded.</td></tr>`;
            } else {
                items.forEach((it, idx) => {
                    const qty = parseFloat(it.quantity || 0);
                    const rate = parseFloat(it.rate || 0);
                    const gross = parseFloat(it.gross_amount || (qty * rate));
                    const disc = parseFloat(it.discount_amount || 0);
                    const tax = parseFloat(it.sales_tax_amount || 0) + parseFloat(it.further_tax_amount || 0);
                    const net = parseFloat(it.net_amount || (gross - disc + tax));

                    subtotalCalc += gross;
                    itemDiscCalc += disc;
                    taxCalc += tax;

                    // Clean item title & code (prevent customer details from ever leaking into item column)
                    const custName = (header.customer_name || '').trim().toLowerCase();
                    const custCode = (header.customer_code || '').trim().toLowerCase();

                    let itemTitle = (it.item_title || '').trim();
                    if (custName && itemTitle.toLowerCase() === custName) {
                        itemTitle = (it.description || '').trim();
                    }
                    if (!itemTitle) itemTitle = (it.description || 'Item').trim();

                    let itemCode = (it.item_code || '').trim();
                    if (custCode && itemCode.toLowerCase() === custCode) {
                        itemCode = '';
                    }

                    bodyHtml += `
                        <tr style="border-bottom: 1px solid #edf2f7;">
                            <td style="padding: 7px 10px; color: #718096;">${idx + 1}</td>
                            <td style="padding: 7px 10px; font-weight: 600;">
                                ${this.escapeHtml(itemTitle)}
                                ${itemCode ? `<span style="font-size: 10px; color: #718096; margin-left: 4px;">(${this.escapeHtml(itemCode)})</span>` : ''}
                            </td>
                            <td style="padding: 7px 10px; text-align: right;">${qty}</td>
                            <td style="padding: 7px 10px;">${this.escapeHtml(it.unit || '')}</td>
                            <td style="padding: 7px 10px; text-align: right;">${rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style="padding: 7px 10px; text-align: right;">${gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style="padding: 7px 10px; text-align: right; color: ${disc > 0 ? '#e53e3e' : 'inherit'};">${disc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style="padding: 7px 10px; text-align: right;">${tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style="padding: 7px 10px; text-align: right; font-weight: 600;">${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
            }

            bodyHtml += `
                        </tbody>
                    </table>
                </div>
            `;

            // Totals breakdown table
            const invoiceDisc = parseFloat(inv.additional_discount || 0);
            const totalDisc = itemDiscCalc + invoiceDisc;
            const carriage = parseFloat(inv.carriage_freight || 0);
            const netTotal = parseFloat(inv.net_total || 0);
            const amtRecv = parseFloat(inv.amount_received || 0);
            const balance = netTotal - amtRecv;

            bodyHtml += `
                <div style="display: flex; justify-content: flex-end;">
                    <table style="width: 320px; font-size: 12px; border-collapse: collapse;">
                        <tr><td style="padding: 4px 8px; color: #718096;">Gross Subtotal:</td><td style="padding: 4px 8px; text-align: right; font-weight: 600;">${subtotalCalc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                        ${totalDisc > 0 ? `<tr><td style="padding: 4px 8px; color: #e53e3e;">Total Discount:</td><td style="padding: 4px 8px; text-align: right; color: #e53e3e;">-${totalDisc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${taxCalc > 0 ? `<tr><td style="padding: 4px 8px; color: #718096;">Total Taxes:</td><td style="padding: 4px 8px; text-align: right; font-weight: 600;">+${taxCalc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${carriage > 0 ? `<tr><td style="padding: 4px 8px; color: #718096;">Carriage / Freight:</td><td style="padding: 4px 8px; text-align: right;">+${carriage.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        <tr style="border-top: 2px solid #e2e8f0; border-bottom: 2px solid #e2e8f0;"><td style="padding: 8px; font-weight: 700; font-size: 14px;">Grand Total:</td><td style="padding: 8px; text-align: right; font-weight: 800; font-size: 15px; color: #1F4E79;">PKR ${netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                        <tr><td style="padding: 4px 8px; color: #27ae60; font-weight: 600;">Amount Received:</td><td style="padding: 4px 8px; text-align: right; color: #27ae60; font-weight: 600;">PKR ${amtRecv.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                        ${balance > 0 ? `<tr><td style="padding: 4px 8px; color: #e53e3e; font-weight: 600;">Balance Due:</td><td style="padding: 4px 8px; text-align: right; color: #e53e3e; font-weight: 600;">PKR ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>` : ''}
                    </table>
                </div>
            `;

            document.getElementById('pos_md_body').innerHTML = bodyHtml;
            this.openModal('posModalDetails');

        } catch (e) {
            console.error("View Details Error:", e);
            alert('Failed to load invoice details.');
        }
    },

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // FBR QR Code Generator Helper (Base64 PNG Data URL)
    // -------------------------------------------------------------
    generateFbrQrCodeHtml: function(inv, sett, size = 110) {
        let fbrInvNo = (inv.fbr_invoice_number || inv.fbr_invoice_no || '').trim();
        let fbrQr = (inv.fbr_qr_code || '').trim();
        
        // Strip any prefixes or pipe composite fields
        let qrData = fbrInvNo || fbrQr;
        if (qrData.includes('|')) {
            const parts = qrData.split('|');
            for (const p of parts) {
                if (/^fbr-invoice:/i.test(p.trim())) {
                    qrData = p.trim().replace(/^fbr-invoice:/i, '').trim();
                    break;
                }
            }
        }
        qrData = qrData.replace(/^(fbr-invoice:|invoice:|pos:)/i, '').trim();

        if (!qrData || qrData === '-' || qrData === 'Pending Transmission' || qrData === 'FBR-OK') {
            return '';
        }

        let qrImageSrc = '';
        try {
            if (typeof QRCode !== 'undefined') {
                const tempDiv = document.createElement('div');
                new QRCode(tempDiv, {
                    text: qrData,
                    width: size,
                    height: size,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
                const img = tempDiv.querySelector('img');
                if (img && img.src && img.src.startsWith('data:image')) {
                    qrImageSrc = img.src;
                } else {
                    const canvas = tempDiv.querySelector('canvas');
                    if (canvas) {
                        qrImageSrc = canvas.toDataURL('image/png');
                    }
                }
            }
        } catch (e) {
            console.warn('QRCode library generation error:', e);
        }

        if (!qrImageSrc) {
            qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrData)}`;
        }

        return `<img src="${qrImageSrc}" width="${size}" height="${size}" style="display:block; margin:0 auto; max-width:${size}px; height:auto; border:0;" alt="FBR QR Code" />`;
    },

    // -------------------------------------------------------------
    // ACTION: Print / Reprint POS Invoice (A4 or Thermal)
    // -------------------------------------------------------------
    printReceipt: async function(id, autoExecute = false) {
        this.selectedInvoiceId = id;
        const compId = this.getCompanyId();

        try {
            const res = await fetch(`api/pos_sale_register.php?action=get_invoice_details&id=${id}&company_id=${compId}`);
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();
            if (data.status !== 'success') {
                alert('Error loading invoice details: ' + data.message);
                return;
            }

            // Cache data for dynamic switching between A4 and Thermal
            this.currentReceiptData = data;

            const sett = data.settings || {};
            const initialFormat = (sett.rec_paper_size === 'A4') ? 'A4' : ((sett.rec_paper_size === '58mm') ? '58mm' : 'thermal');

            const selectEl = document.getElementById('pos_print_paper_select');
            if (selectEl) {
                selectEl.value = initialFormat;
            }

            this.renderPrintPreview(initialFormat);
            this.openModal('posModalReceipt');

            // Auto-trigger browser print dialog if autoExecute is true OR rec_auto_print setting is '1'
            if (autoExecute || sett.rec_auto_print === '1') {
                setTimeout(() => {
                    this.executeReceiptPrint();
                }, 400);
            }

        } catch (e) {
            console.error("Print receipt error:", e);
            alert('Failed to load receipt layout.');
        }
    },

    changePrintPaper: function(format) {
        this.renderPrintPreview(format);
    },

    renderPrintPreview: function(format) {
        if (!this.currentReceiptData) return;
        const data = this.currentReceiptData;
        const inv = data.header || {};
        const isReprint = parseInt(inv.print_count || 0) > 0;
        const dialog = document.getElementById('pos_modal_receipt_dialog');
        const area = document.getElementById('pos_receipt_print_area');
        const hint = document.getElementById('pos_print_mode_hint');

        if (format === 'A4') {
            if (dialog) dialog.style.maxWidth = '880px';
            if (hint) hint.innerHTML = `<i class="fas fa-file-alt" style="color: #2563eb;"></i> Format: <b>A4 Full Page</b> (FBR Tax Invoice)`;
            if (area) area.innerHTML = this.renderA4InvoiceHtml(data, isReprint);
        } else if (format === '58mm') {
            if (dialog) dialog.style.maxWidth = '360px';
            if (hint) hint.innerHTML = `<i class="fas fa-receipt" style="color: #d97706;"></i> Format: <b>58mm Thermal Slip</b> (With FBR QR)`;
            if (area) area.innerHTML = this.renderThermalReceiptHtml(data, isReprint, '58mm');
        } else {
            if (dialog) dialog.style.maxWidth = '440px';
            if (hint) hint.innerHTML = `<i class="fas fa-receipt" style="color: #059669;"></i> Format: <b>80mm Thermal Receipt</b> (With FBR QR)`;
            if (area) area.innerHTML = this.renderThermalReceiptHtml(data, isReprint, 'thermal');
        }
    },

    // -------------------------------------------------------------
    // RENDER: Thermal Receipt Layout (80mm / 58mm)
    // -------------------------------------------------------------
    renderThermalReceiptHtml: function(data, isReprint, format = 'thermal') {
        const inv = data.header || {};
        const items = data.items || [];
        const sett = data.settings || {};
        const comp = data.company || {};
        const is58mm = (format === '58mm');

        const localCache = (() => {
            try {
                const cid = this.getCompanyId();
                return JSON.parse(localStorage.getItem('pos_rec_settings_' + cid) || '{}');
            } catch(e) { return {}; }
        })();

        const showHeader = (sett.rec_show_header !== undefined) ? (sett.rec_show_header !== '0') : (localCache.rec_show_header !== '0');
        const showLogo = (sett.rec_show_logo !== undefined) ? (sett.rec_show_logo !== '0') : (localCache.rec_show_logo !== '0');
        const showTax = (sett.rec_show_tax !== undefined) ? (sett.rec_show_tax !== '0') : (localCache.rec_show_tax !== '0');

        const invNo = inv.pos_invoice_no || ('INV-' + String(inv.serial_no).padStart(4, '0'));
        const dateStr = inv.invoice_date || new Date().toISOString().split('T')[0];
        const fbrInvNo = (inv.fbr_invoice_number || '').trim();
        const posId = inv.branch_fbr_pos_id || sett.fbr_pos_id || '';

        let paperHtml = `
            <div class="receipt-paper" style="background:#fff; width:100%; max-width:${is58mm ? '230px' : '320px'}; margin:0 auto; padding:${is58mm ? '8px 6px' : '14px 12px'}; border:1px solid #cbd5e0; box-shadow:0 2px 8px rgba(0,0,0,0.08); font-family:'Courier New', Courier, monospace; font-size:${is58mm ? '10px' : '11px'}; color:#000; line-height:1.35; box-sizing:border-box;">
        `;

        if (isReprint) {
            paperHtml += `<div class="receipt-reprint-banner" style="background:#000; color:#fff; text-align:center; font-weight:bold; padding:2px 0; margin-bottom:6px; letter-spacing:1px; font-size:10px;">*** DUPLICATE REPRINT ***</div>`;
        }

        // 1. Brand Line: Logo and Company Name side-by-side in 1 line
        let thermalBrandLineHtml = '';
        const hasThermalLogo = (showLogo && comp.logo_data);
        const hasThermalCoName = (showHeader && (comp.name || 'SOFTIFYX STORE'));

        if (hasThermalLogo || hasThermalCoName) {
            thermalBrandLineHtml = `
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:4px;">
                    ${hasThermalLogo ? `<img src="${comp.logo_data}" style="max-height:38px; max-width:${is58mm ? '75px' : '95px'}; object-fit:contain; display:block;" alt="Logo" />` : ''}
                    ${hasThermalCoName ? `<div style="font-size:${is58mm ? '12px' : '15px'}; font-weight:bold; text-transform:uppercase; line-height:1.2;">${this.escapeHtml(comp.name || 'SOFTIFYX STORE')}</div>` : ''}
                </div>
            `;
        }

        // 2. Company Header details: Branch, Address, Contact are ALWAYS preserved even if Company Name is hidden
        paperHtml += `
            <div class="receipt-center" style="text-align:center;">
                ${thermalBrandLineHtml}
                ${inv.branch_name ? `<div style="font-weight:600;">${this.escapeHtml(inv.branch_name)}</div>` : ''}
                ${inv.branch_address ? `<div style="font-size:${is58mm ? '9px' : '10px'};">${this.escapeHtml(inv.branch_address)}</div>` : ''}
                ${inv.branch_contact ? `<div>Tel: ${this.escapeHtml(inv.branch_contact)}</div>` : ''}
                ${sett.rec_header ? `<div style="margin-top:4px; font-style:italic;">${this.escapeHtml(sett.rec_header)}</div>` : ''}
            </div>
        `;

        paperHtml += `
            <div class="receipt-divider" style="border-top:1px dashed #000; margin:6px 0;"></div>
            <div>
                <div><b>Invoice #:</b> ${invNo}</div>
                <div><b>Date:</b> ${dateStr}</div>
                <div><b>Customer:</b> ${this.escapeHtml(inv.customer_name || 'Walk-in')}</div>
                ${inv.customer_mobile ? `<div><b>Contact:</b> ${this.escapeHtml(inv.customer_mobile)}</div>` : ''}
                ${inv.customer_ntn_val ? `<div><b>NTN/STRN:</b> ${this.escapeHtml(inv.customer_ntn_val)}</div>` : ''}
                ${posId ? `<div><b>POS ID:</b> ${this.escapeHtml(posId)}</div>` : ''}
            </div>
            <div class="receipt-divider" style="border-top:1px dashed #000; margin:6px 0;"></div>
            <table class="receipt-table" style="width:100%; border-collapse:collapse; font-size:${is58mm ? '10px' : '11px'};">
                <thead>
                    <tr style="border-bottom:1px dashed #000;">
                        <th style="text-align:left; padding:3px 0;">Item</th>
                        <th style="text-align:center; width:35px; padding:3px 0;">Qty</th>
                        <th style="text-align:right; width:55px; padding:3px 0;">Rate</th>
                        <th style="text-align:right; width:65px; padding:3px 0;">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const custNameThermal = (inv.customer_name || '').trim().toLowerCase();

        let subtotal = 0;
        let totalTax = 0;
        items.forEach(it => {
            const qty = parseFloat(it.quantity || 0);
            const rate = parseFloat(it.rate || 0);
            const gross = parseFloat(it.gross_amount || (qty * rate));
            const tax = parseFloat(it.sales_tax_amount || 0) + parseFloat(it.further_tax_amount || 0);
            const net = parseFloat(it.net_amount || gross);
            subtotal += gross;
            totalTax += tax;

            let itemTitle = (it.item_title || '').trim();
            if (custNameThermal && itemTitle.toLowerCase() === custNameThermal) {
                itemTitle = (it.description || '').trim();
            }
            if (!itemTitle) itemTitle = (it.description || 'Item').trim();

            paperHtml += `
                <tr>
                    <td colspan="4" style="font-weight:bold; padding-top:4px;">${this.escapeHtml(itemTitle)}</td>
                </tr>
                <tr>
                    <td></td>
                    <td style="text-align:center;">${qty}</td>
                    <td style="text-align:right;">${rate.toFixed(2)}</td>
                    <td style="text-align:right;">${net.toFixed(2)}</td>
                </tr>
            `;
        });

        const netTotal = parseFloat(inv.net_total || 0);
        const discount = parseFloat(inv.additional_discount || 0);
        const amtRecv = parseFloat(inv.amount_received || 0);
        const change = Math.max(0, amtRecv - netTotal);

        paperHtml += `
                </tbody>
            </table>
            <div class="receipt-divider" style="border-top:1px dashed #000; margin:6px 0;"></div>
            <table style="width:100%; font-size:${is58mm ? '10px' : '11px'};">
                <tr><td>Gross Subtotal:</td><td style="text-align:right;">${subtotal.toFixed(2)}</td></tr>
                ${discount > 0 ? `<tr><td>Discount:</td><td style="text-align:right;">-${discount.toFixed(2)}</td></tr>` : ''}
                ${(showTax && totalTax > 0) ? `<tr><td>Sales Tax:</td><td style="text-align:right;">${totalTax.toFixed(2)}</td></tr>` : ''}
                <tr style="font-weight:bold; font-size:${is58mm ? '12px' : '13px'};"><td>NET TOTAL:</td><td style="text-align:right;">PKR ${netTotal.toFixed(2)}</td></tr>
                <tr><td>Cash Received:</td><td style="text-align:right;">PKR ${amtRecv.toFixed(2)}</td></tr>
                ${change > 0 ? `<tr><td>Change Return:</td><td style="text-align:right;">PKR ${change.toFixed(2)}</td></tr>` : ''}
            </table>
            <div class="receipt-divider" style="border-top:1px dashed #000; margin:6px 0;"></div>
        `;

        // FBR Verification & Response QR Code Block (Thermal)
        const qrHtml = this.generateFbrQrCodeHtml(inv, sett, is58mm ? 95 : 110);
        if (qrHtml || fbrInvNo) {
            paperHtml += `
                <div style="text-align:center; margin:8px 0; padding:6px 4px; border:1px dashed #000; border-radius:4px;">
                    <div style="font-weight:bold; font-size:${is58mm ? '10px' : '11px'}; letter-spacing:0.5px;">*** FBR VERIFIED INVOICE ***</div>
                    ${qrHtml ? `<div style="margin:6px auto; display:flex; justify-content:center;">${qrHtml}</div>` : ''}
                    <div style="font-size:${is58mm ? '9px' : '10px'}; font-family:monospace; font-weight:bold;">FBR Ref: ${fbrInvNo || 'Pending'}</div>
                    ${posId ? `<div style="font-size:9px; font-family:monospace;">POS ID: ${posId}</div>` : ''}
                    <div style="font-size:8px; margin-top:2px;">Scan with FBR Tax Asaan App</div>
                </div>
                <div class="receipt-divider" style="border-top:1px dashed #000; margin:6px 0;"></div>
            `;
        }

        // Footer
        paperHtml += `
                <div class="receipt-center" style="text-align:center; margin-top:8px;">
                    <div style="font-weight:700; font-size:10px;">${this.escapeHtml(sett.rec_footer || 'Thank you for your business!')}</div>
                    <div style="font-size:9.5px; font-weight:700; margin-top:4px; color:#111;">Powered by <span style="font-size:11px; font-weight:800;">SoftifyX POS</span></div>
                </div>
            </div>
        `;

        return paperHtml;
    },

    // -------------------------------------------------------------
    // RENDER: A4 Full-Page Tax Invoice Layout (With FBR QR Code)
    // -------------------------------------------------------------
    renderA4InvoiceHtml: function(data, isReprint) {
        const inv = data.header || {};
        const items = data.items || [];
        const sett = data.settings || {};
        const comp = data.company || {};

        const localCache = (() => {
            try {
                const cid = this.getCompanyId();
                return JSON.parse(localStorage.getItem('pos_rec_settings_' + cid) || '{}');
            } catch(e) { return {}; }
        })();

        const showHeader = (sett.rec_show_header !== undefined) ? (sett.rec_show_header !== '0') : (localCache.rec_show_header !== '0');
        const showLogo = (sett.rec_show_logo !== undefined) ? (sett.rec_show_logo !== '0') : (localCache.rec_show_logo !== '0');
        const showTax = (sett.rec_show_tax !== undefined) ? (sett.rec_show_tax !== '0') : (localCache.rec_show_tax !== '0');

        // Brand Line: Logo and Company Name side-by-side in 1 line
        let a4BrandLineHtml = '';
        const hasA4Logo = (showLogo && comp.logo_data);
        const hasA4CoName = (showHeader && (comp.name || 'SOFTIFYX STORE'));

        if (hasA4Logo || hasA4CoName) {
            a4BrandLineHtml = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:5px;">
                    ${hasA4Logo ? `<img src="${comp.logo_data}" style="max-height:50px; max-width:160px; object-fit:contain; display:block;" alt="Company Logo" />` : ''}
                    ${hasA4CoName ? `<div style="font-size:22px; font-weight:800; color:#1F4E79; text-transform:uppercase; letter-spacing:0.5px; line-height:1.2;">${this.escapeHtml(comp.name || 'SOFTIFYX STORE')}</div>` : ''}
                </div>
            `;
        }

        // Branch, Address, Tel, Email, NTN are ALWAYS preserved even if Company Name is hidden
        const a4LeftHeaderHtml = `
            ${a4BrandLineHtml}
            ${inv.branch_name ? `<div style="font-size:13px; font-weight:700; color:#334155; margin-top:2px;"><i class="fas fa-store" style="color:#1F4E79; font-size:11px;"></i> ${this.escapeHtml(inv.branch_name)}</div>` : ''}
            <div style="font-size:11px; color:#64748b; margin-top:2px; max-width:440px;">${this.escapeHtml(inv.branch_address || comp.address || '')}</div>
            <div style="font-size:11px; color:#64748b; margin-top:2px;">
                ${inv.branch_contact ? `<span><b>Tel:</b> ${this.escapeHtml(inv.branch_contact)}</span>` : (comp.phone ? `<span><b>Tel:</b> ${this.escapeHtml(comp.phone)}</span>` : '')}
                ${comp.email ? ` | <span><b>Email:</b> ${this.escapeHtml(comp.email)}</span>` : ''}
                ${comp.ntn ? ` | <span><b>NTN:</b> ${this.escapeHtml(comp.ntn)}</span>` : ''}
                ${comp.strn ? ` | <span><b>STRN:</b> ${this.escapeHtml(comp.strn)}</span>` : ''}
            </div>
            ${sett.rec_header ? `<div style="font-size:11px; color:#2563eb; font-style:italic; margin-top:4px;">${this.escapeHtml(sett.rec_header)}</div>` : ''}
        `;

        const invNo = inv.pos_invoice_no || ('INV-' + String(inv.serial_no).padStart(4, '0'));
        const dateStr = inv.invoice_date || new Date().toISOString().split('T')[0];
        const fbrInvNo = (inv.fbr_invoice_number || '').trim();
        const posId = inv.branch_fbr_pos_id || sett.fbr_pos_id || '';
        const isFbrSubmitted = inv.fbr_status === 'Submitted' || !!fbrInvNo;
        const custNameA4 = (inv.customer_name || '').trim().toLowerCase();
        const custCodeA4 = (inv.customer_code || '').trim().toLowerCase();

        let subtotal = 0;
        let totalTax = 0;
        let itemsRowsHtml = '';

        items.forEach((it, idx) => {
            const qty = parseFloat(it.quantity || 0);
            const rate = parseFloat(it.rate || 0);
            const gross = parseFloat(it.gross_amount || (qty * rate));
            const tax = parseFloat(it.sales_tax_amount || 0) + parseFloat(it.further_tax_amount || 0);
            const net = parseFloat(it.net_amount || gross);
            subtotal += gross;
            totalTax += tax;

            // Resolve clean Item Title (only show item name, never customer name)
            let itemTitle = (it.item_title || '').trim();
            if (custNameA4 && itemTitle.toLowerCase() === custNameA4) {
                itemTitle = (it.description || '').trim();
            }
            if (!itemTitle) itemTitle = (it.description || 'Item').trim();

            // Resolve clean Item Code (never show customer code e.g. 1200...)
            let itemCode = (it.item_code || '').trim();
            if (custCodeA4 && itemCode.toLowerCase() === custCodeA4) {
                itemCode = '';
            }

            itemsRowsHtml += `
                <tr style="border-bottom:1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color:#f8fafc;' : ''}">
                    <td style="padding:7px 8px; text-align:center; border-right:1px solid #e2e8f0;">${idx + 1}</td>
                    <td style="padding:7px 8px; border-right:1px solid #e2e8f0;">
                        <div style="font-weight:600; color:#1e293b;">${this.escapeHtml(itemTitle)}</div>
                    </td>
                    <td style="padding:7px 8px; text-align:center; font-weight:600; border-right:1px solid #e2e8f0;">${qty}</td>
                    <td style="padding:7px 8px; text-align:center; color:#64748b; border-right:1px solid #e2e8f0;">${this.escapeHtml(it.unit || 'pcs')}</td>
                    <td style="padding:7px 8px; text-align:right; border-right:1px solid #e2e8f0;">${rate.toFixed(2)}</td>
                    <td style="padding:7px 8px; text-align:right; border-right:1px solid #e2e8f0;">${gross.toFixed(2)}</td>
                    <td style="padding:7px 8px; text-align:right; color:#d97706; border-right:1px solid #e2e8f0;">${tax > 0 ? tax.toFixed(2) : '-'}</td>
                    <td style="padding:7px 8px; text-align:right; font-weight:700; color:#0f172a;">${net.toFixed(2)}</td>
                </tr>
            `;
        });

        const netTotal = parseFloat(inv.net_total || 0);
        const discount = parseFloat(inv.additional_discount || 0);
        const amtRecv = parseFloat(inv.amount_received || 0);
        const change = Math.max(0, amtRecv - netTotal);

        const qrHtml = this.generateFbrQrCodeHtml(inv, sett, 115);

        return `
            <div class="pos-a4-paper" style="background:#fff; width:100%; max-width:800px; margin:0 auto; padding:24px 28px; border:1px solid #cbd5e0; box-shadow:0 4px 12px rgba(0,0,0,0.1); font-family:'Segoe UI', Arial, sans-serif; font-size:11px; color:#1e293b; line-height:1.4; box-sizing:border-box;">
                
                <!-- 1. Header Row -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1F4E79; padding-bottom:12px; margin-bottom:14px;">
                    <div style="flex:1;">
                        ${a4LeftHeaderHtml}
                    </div>
                    <div style="text-align:right; min-width:240px;">
                        <div style="display:inline-block; background:#1F4E79; color:#fff; font-size:14px; font-weight:700; padding:4px 14px; border-radius:4px; text-transform:uppercase; letter-spacing:1px;">
                            ${isReprint ? 'TAX INVOICE (DUPLICATE)' : 'TAX INVOICE'}
                        </div>
                        <table style="margin-top:8px; margin-left:auto; font-size:11px; border-collapse:collapse; text-align:left;">
                            <tr><td style="padding:2px 6px; font-weight:600; color:#64748b;">Invoice #:</td><td style="padding:2px 6px; font-weight:800; color:#0f172a; font-family:monospace; font-size:13px;">${invNo}</td></tr>
                            <tr><td style="padding:2px 6px; font-weight:600; color:#64748b;">Date:</td><td style="padding:2px 6px; color:#0f172a;">${dateStr}</td></tr>
                            <tr><td style="padding:2px 6px; font-weight:600; color:#64748b;">Branch / POS:</td><td style="padding:2px 6px; color:#0f172a;">${this.escapeHtml(inv.branch_code || inv.branch_name || 'Main Branch')}</td></tr>
                            <tr><td style="padding:2px 6px; font-weight:600; color:#64748b;">Cashier / User:</td><td style="padding:2px 6px; color:#0f172a;">${this.escapeHtml(inv.created_by_username || 'Admin')}</td></tr>
                        </table>
                    </div>
                </div>

                <!-- 2. Customer & System Info Cards -->
                <div style="display:flex; gap:12px; margin-bottom:14px;">
                    <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:9px 12px; font-size:11px;">
                        <div style="font-weight:700; color:#1F4E79; text-transform:uppercase; font-size:10px; margin-bottom:4px; border-bottom:1px solid #e2e8f0; padding-bottom:3px;">
                            <i class="fas fa-user"></i> Customer / Bill To
                        </div>
                        <div style="font-size:13px; font-weight:700; color:#1e293b;">${this.escapeHtml(inv.customer_name || 'Walk-in (Cash) Customer')}</div>
                        ${inv.customer_mobile ? `<div><b>Phone / Mobile:</b> ${this.escapeHtml(inv.customer_mobile)}</div>` : ''}
                        ${inv.customer_full_address ? `<div><b>Address:</b> ${this.escapeHtml(inv.customer_full_address)}</div>` : ''}
                        ${inv.customer_ntn_val ? `<div><b>NTN / CNIC:</b> <span style="font-family:monospace; font-weight:600;">${this.escapeHtml(inv.customer_ntn_val)}</span></div>` : ''}
                        ${inv.customer_gst_val ? `<div><b>STRN / Sales Tax:</b> <span style="font-family:monospace; font-weight:600;">${this.escapeHtml(inv.customer_gst_val)}</span></div>` : ''}
                    </div>
                    <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:9px 12px; font-size:11px;">
                        <div style="font-weight:700; color:#1F4E79; text-transform:uppercase; font-size:10px; margin-bottom:4px; border-bottom:1px solid #e2e8f0; padding-bottom:3px;">
                            <i class="fas fa-file-invoice-dollar"></i> Transaction & Tax Details
                        </div>
                        <div><b>Payment Mode:</b> ${this.escapeHtml(inv.payment_terms || 'Cash')}</div>
                        <div><b>FBR POS ID:</b> <span style="font-family:monospace; font-weight:600;">${posId || 'Configured'}</span></div>
                        <div><b>FBR Status:</b> <span style="font-weight:700; color:${isFbrSubmitted ? '#15803d' : '#b45309'};">${isFbrSubmitted ? 'VERIFIED & SUBMITTED' : (inv.fbr_status || 'Pending')}</span></div>
                        ${fbrInvNo ? `<div><b>FBR Invoice Ref:</b> <span style="font-family:monospace; font-weight:800; color:#15803d;">${fbrInvNo}</span></div>` : ''}
                    </div>
                </div>

                <!-- 3. Line Items Table -->
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:14px; border:1px solid #cbd5e1;">
                    <thead>
                        <tr style="background:#1F4E79; color:#fff; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">
                            <th style="padding:7px 6px; text-align:center; width:35px; border-right:1px solid #3b82f6;">#</th>
                            <th style="padding:7px 8px; text-align:left; border-right:1px solid #3b82f6;">Item Description</th>
                            <th style="padding:7px 6px; text-align:center; width:50px; border-right:1px solid #3b82f6;">Qty</th>
                            <th style="padding:7px 6px; text-align:center; width:50px; border-right:1px solid #3b82f6;">Unit</th>
                            <th style="padding:7px 8px; text-align:right; width:85px; border-right:1px solid #3b82f6;">Rate (PKR)</th>
                            <th style="padding:7px 8px; text-align:right; width:90px; border-right:1px solid #3b82f6;">Gross (PKR)</th>
                            <th style="padding:7px 8px; text-align:right; width:85px; border-right:1px solid #3b82f6;">Sales Tax</th>
                            <th style="padding:7px 8px; text-align:right; width:100px;">Net Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml}
                    </tbody>
                </table>

                <!-- 4. Bottom FBR Box & Financial Totals -->
                <div style="display:flex; gap:12px; margin-bottom:18px; align-items:stretch;">
                    <!-- Left: Official FBR Digital Verification Block with Dynamic QR Code -->
                    <div style="flex:1.2; border:1.5px solid #16a34a; border-radius:6px; padding:10px 12px; background:#f0fdf4; display:flex; gap:12px; align-items:center;">
                        <div style="flex:none; background:#fff; padding:6px; border:1px solid #86efac; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
                            ${qrHtml || '<div style="width:115px; height:115px; display:flex; align-items:center; justify-content:center; background:#eee; font-size:10px; color:#888;">No QR Data</div>'}
                        </div>
                        <div style="font-size:11px; color:#14532d; line-height:1.45;">
                            <div style="font-weight:800; font-size:12px; color:#15803d; text-transform:uppercase; display:flex; align-items:center; gap:5px;">
                                <i class="fas fa-shield-alt"></i> FBR Digital POS Invoicing
                            </div>
                            <div style="margin-top:4px;">
                                <b>FBR Invoice #:</b> <span style="font-family:monospace; font-size:11px; font-weight:800; color:#0f172a;">${fbrInvNo || 'Pending Submission'}</span>
                            </div>
                            <div>
                                <b>POS ID:</b> <span style="font-family:monospace;">${posId || '-'}</span>
                            </div>
                            ${inv.fbr_submitted_at ? `<div><b>Verified At:</b> ${String(inv.fbr_submitted_at).trim().split(' ')[0]}</div>` : ''}
                            <div style="font-size:9.5px; color:#166534; margin-top:4px; font-style:italic;">
                                Scan QR code with official FBR "Tax Asaan" App to verify authentic tax digital submission.
                            </div>
                        </div>
                    </div>

                    <!-- Right: Financial Summary -->
                    <div style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; background:#fff; display:flex; flex-direction:column; justify-content:center;">
                        <table style="width:100%; font-size:11px; border-collapse:collapse;">
                            <tr><td style="padding:2px 0; color:#64748b;">Gross Subtotal:</td><td style="padding:2px 0; text-align:right; font-weight:600;">PKR ${subtotal.toFixed(2)}</td></tr>
                            ${discount > 0 ? `<tr><td style="padding:2px 0; color:#dc2626;">Discount:</td><td style="padding:2px 0; text-align:right; font-weight:600; color:#dc2626;">-PKR ${discount.toFixed(2)}</td></tr>` : ''}
                            ${(showTax && totalTax > 0) ? `<tr><td style="padding:2px 0; color:#64748b;">Total Sales Tax:</td><td style="padding:2px 0; text-align:right; font-weight:600;">PKR ${totalTax.toFixed(2)}</td></tr>` : ''}
                            <tr style="border-top:1.5px solid #0f172a; border-bottom:1.5px solid #0f172a;">
                                <td style="padding:5px 0; font-size:13px; font-weight:800; color:#1F4E79;">NET TOTAL:</td>
                                <td style="padding:5px 0; font-size:13px; font-weight:800; color:#1F4E79; text-align:right;">PKR ${netTotal.toFixed(2)}</td>
                            </tr>
                            <tr><td style="padding:3px 0 1px; color:#64748b;">Amount Received:</td><td style="padding:3px 0 1px; text-align:right; font-weight:600;">PKR ${amtRecv.toFixed(2)}</td></tr>
                            ${change > 0 ? `<tr><td style="padding:2px 0; color:#15803d; font-weight:600;">Change Returned:</td><td style="padding:2px 0; text-align:right; font-weight:700; color:#15803d;">PKR ${change.toFixed(2)}</td></tr>` : ''}
                        </table>
                    </div>
                </div>

                <!-- 5. Footer & Signatures -->
                <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #e2e8f0; padding-top:12px; font-size:10px; color:#64748b;">
                    <div>
                        <div style="font-weight:800; font-size:11px; color:#1e293b;">${this.escapeHtml(sett.rec_footer || 'Thank you for your business!')}</div>
                        <div style="margin-top:2px; font-weight:600; color:#475569;">This is a computer-generated invoice under official FBR Digital Invoicing regulations.</div>
                        <div style="margin-top:3px; font-size:10.5px; font-weight:700; color:#334155;">Powered by <span style="font-size:12px; font-weight:900; color:#1F4E79; letter-spacing:0.3px;">SoftifyX Financials</span></div>
                    </div>
                    <div style="text-align:center;">
                        <div style="width:140px; border-top:1.5px solid #64748b; padding-top:4px; font-weight:700; color:#1e293b; font-size:10.5px;">Authorized Signatory</div>
                    </div>
                </div>

            </div>
        `;
    },

    // -------------------------------------------------------------
    // EXECUTE PRINT: Browser Window Print (Respects A4 vs Thermal)
    // -------------------------------------------------------------
    executeReceiptPrint: function() {
        const area = document.getElementById('pos_receipt_print_area');
        if (!area) return;

        const formatSelect = document.getElementById('pos_print_paper_select');
        const format = formatSelect ? formatSelect.value : (this.currentReceiptData?.settings?.rec_paper_size === 'A4' ? 'A4' : 'thermal');

        let pageCss = '';
        let winProps = '';

        if (format === 'A4') {
            winProps = 'width=920,height=800';
            pageCss = `
                @page { size: A4 portrait; margin: 10mm; }
                body { margin: 0; padding: 12px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; background: #fff; color: #1e293b; }
                .pos-a4-paper { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; }
            `;
        } else if (format === '58mm') {
            winProps = 'width=380,height=600';
            pageCss = `
                @page { size: 58mm auto; margin: 1.5mm; }
                body { margin: 0; padding: 3px; font-family: 'Courier New', Courier, monospace; font-size: 10px; background: #fff; color: #000; }
                .receipt-paper { width: 100% !important; max-width: 220px !important; margin: 0 auto !important; padding: 2px !important; border: none !important; box-shadow: none !important; }
            `;
        } else {
            winProps = 'width=460,height=650';
            pageCss = `
                @page { size: 80mm auto; margin: 2mm; }
                body { margin: 0; padding: 5px; font-family: 'Courier New', Courier, monospace; font-size: 11px; background: #fff; color: #000; }
                .receipt-paper { width: 100% !important; max-width: 320px !important; margin: 0 auto !important; padding: 2px !important; border: none !important; box-shadow: none !important; }
            `;
        }

        const printWindow = window.open('', '_blank', winProps);
        if (!printWindow) {
            alert('Popup window blocked! Please allow popups to print invoices.');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <title>POS Invoice Print - ${format}</title>
                    <style>
                        ${pageCss}
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    ${(() => {
                        const copies = Math.max(1, parseInt(this.currentReceiptData?.settings?.rec_copies || 1));
                        if (copies <= 1) return area.innerHTML;
                        let multiHtml = '';
                        for (let c = 1; c <= copies; c++) {
                            multiHtml += `<div class="pos-copy-wrapper" style="${c > 1 ? 'page-break-before: always; margin-top: 15px;' : ''}">${area.innerHTML}</div>`;
                        }
                        return multiHtml;
                    })()}
                    <script>
                        window.onload = function() {
                            window.focus();
                            setTimeout(function() {
                                window.print();
                                setTimeout(function() { window.close(); }, 700);
                            }, 250);
                        };
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();

        // Track print record in database
        if (this.selectedInvoiceId) {
            const compId = this.getCompanyId();
            fetch('api/pos_sale_register.php?action=record_print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.selectedInvoiceId, company_id: compId })
            }).then(() => {
                this.loadInvoices();
            }).catch(() => {});
        }
    },

    // -------------------------------------------------------------
    // ACTION: Pre-Flight Validate with FBR
    // -------------------------------------------------------------
    validateFBRInvoice: async function(id) {
        const compId = this.getCompanyId();
        try {
            const res = await fetch('api/pos_sale_register.php?action=validate_fbr_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, company_id: compId })
            });

            const data = await res.json();
            if (data.status === 'success') {
                alert(`✓ FBR Pre-Flight Validation Passed:\n\n${data.message}`);
            } else if (data.status === 'warning') {
                alert(`⚠ FBR Pre-Flight Validation Warning:\n\n${data.message}`);
            } else {
                alert(`✕ FBR Pre-Flight Validation Failed:\n\n${data.message}`);
            }
        } catch (e) {
            console.error("FBR Validation Error:", e);
            alert('Failed to connect to backend server for FBR pre-flight validation.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Submit to FBR
    // -------------------------------------------------------------
    submitToFBR: async function(id, force = false) {
        const inv = (this.invoices || []).find(x => x.id == id);
        if (inv) {
            const fbrStat = (inv.fbr_status || '').toUpperCase();
            const hasNum = Boolean(inv.fbr_invoice_number && inv.fbr_invoice_number.trim() !== '' && inv.fbr_invoice_number !== 'Not Available' && inv.fbr_invoice_number !== 'None');
            if (fbrStat === 'SUBMITTED' || fbrStat === 'ACCEPTED' || hasNum) {
                alert(`Invoice ${inv.formatted_invoice_no || inv.pos_invoice_no} has ALREADY been submitted to FBR (FBR Ref: ${inv.fbr_invoice_number || 'Accepted'}).\n\nDuplicate submission is prevented.`);
                return;
            }
        }

        if (!confirm('Are you sure you want to submit this invoice to the official FBR digital portal?')) {
            return;
        }

        const compId = this.getCompanyId();
        try {
            const res = await fetch('api/pos_sale_register.php?action=submit_to_fbr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, company_id: compId, force: force })
            });

            const data = await res.json();
            if (data.status === 'success') {
                alert(`✓ ${data.message}`);
                this.loadInvoices();
            } else if (data.status === 'info') {
                alert(`ℹ ${data.message}`);
            } else {
                alert(`✕ FBR Submission Failed:\n${data.message}`);
                this.loadInvoices();
            }
        } catch (e) {
            console.error("FBR Submission Error:", e);
            alert('Failed to connect to backend server for FBR submission.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Check FBR Status
    // -------------------------------------------------------------
    checkFBRStatus: async function(id) {
        const compId = this.getCompanyId();
        try {
            const res = await fetch(`api/pos_sale_register.php?action=check_fbr_status&id=${id}&company_id=${compId}`);
            const data = await res.json();
            if (data.status !== 'success') {
                alert('Error: ' + data.message);
                return;
            }

            const row = data.data;
            const invNo = row.pos_invoice_no || ('INV-' + row.serial_no);

            let rawHtml = '';
            try {
                if (row.fbr_response) {
                    const parsed = JSON.parse(row.fbr_response);
                    rawHtml = `<pre style="background: #edf2f7; padding: 10px; border-radius: 4px; max-height: 150px; overflow-y: auto; font-size: 11px;">${JSON.stringify(parsed, null, 2)}</pre>`;
                }
            } catch (e) {
                rawHtml = `<div style="background: #edf2f7; padding: 10px; border-radius: 4px; font-size: 12px; color: #4a5568;">${this.escapeHtml(row.fbr_response || 'No raw response recorded.')}</div>`;
            }

            const branchName = row.branch_name ? `${row.branch_name} (${row.branch_code || ''})` : 'Central / Unassigned';
            const posIdInfo = row.branch_fbr_pos_id ? `<span style="font-family: monospace; font-weight: bold; color: #2b6cb0;">${row.branch_fbr_pos_id}</span>` : 'Central Default POS ID';
            const identInfo = row.branch_ident_no ? `<span style="font-family: monospace; font-weight: bold;">${row.branch_ident_no}</span>` : 'N/A';
            const envInfo = (row.branch_env || 'sandbox').toUpperCase();

            const bodyHtml = `
                <div style="font-size: 13px; line-height: 1.6;">
                    <div style="margin-bottom: 8px;"><b>Invoice Number:</b> ${invNo}</div>
                    <div style="margin-bottom: 8px;"><b>Branch:</b> ${branchName}</div>
                    <div style="margin-bottom: 8px;"><b>Assigned POS ID:</b> ${posIdInfo} &nbsp;|&nbsp; <b>Ident #:</b> ${identInfo} &nbsp;|&nbsp; <b>Mode:</b> <span class="badge-onprem" style="font-size: 10px;">${envInfo}</span></div>
                    <div style="margin-bottom: 8px;"><b>FBR Status:</b> ${this.getFBRBadge(row.fbr_status)}</div>
                    <div style="margin-bottom: 8px;"><b>FBR Reference / Invoice #:</b> <span style="font-family: monospace; font-weight: bold; color: #2b6cb0;">${row.fbr_invoice_number || 'None'}</span></div>
                    <div style="margin-bottom: 12px;"><b>Submission Date:</b> ${row.fbr_submitted_at ? String(row.fbr_submitted_at).trim().split(' ')[0] : 'Not submitted yet'}</div>
                    <div style="font-weight: 600; margin-bottom: 4px;">FBR API Response Log:</div>
                    ${rawHtml}
                </div>
            `;

            document.getElementById('pos_fbr_details_body').innerHTML = bodyHtml;
            
            const validateBtn = document.getElementById('pos_fbr_validate_btn');
            if (validateBtn) {
                validateBtn.onclick = () => {
                    this.validateFBRInvoice(id);
                };
            }

            const retryBtn = document.getElementById('pos_fbr_retry_btn');
            if (retryBtn) {
                const isAlreadySubmitted = (row.fbr_status === 'Submitted' || row.fbr_status === 'Accepted');
                retryBtn.innerHTML = isAlreadySubmitted ? '<i class="fas fa-redo"></i> Force Resubmit' : '<i class="fas fa-cloud-upload-alt"></i> Submit to FBR';
                retryBtn.onclick = () => {
                    this.closeModal('posModalFBR');
                    this.submitToFBR(id, isAlreadySubmitted);
                };
            }

            this.openModal('posModalFBR');

        } catch (e) {
            console.error("Check FBR error:", e);
            alert('Failed to retrieve FBR status.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Edit Invoice in POS Sale
    // -------------------------------------------------------------
    editInPOS: function(id) {
        if (!id) return;
        const inv = (this.invoices || []).find(x => x.id == id);
        if (inv && (inv.fbr_status === 'Submitted' || inv.fbr_status === 'Accepted' || (inv.fbr_invoice_number && inv.fbr_invoice_number.trim() !== ''))) {
            alert('This invoice has already been submitted to FBR and CANNOT be edited.');
            return;
        }

        window.editingPosInvoiceId = id;

        const openPos = () => {
            if (window.POSModule && typeof window.POSModule.loadInvoice === 'function') {
                window.POSModule.loadInvoice(id);
            }
        };

        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/POS/pos_sale.html', 'fa-cash-register', 'POS Sale', () => {
                openPos();
            }, 'POS Sale', true, true);
        } else if (typeof window.loadView === 'function') {
            window.loadView('Navigation/POS/pos_sale.html');
            setTimeout(openPos, 200);
        } else {
            alert('Please open the POS Sale screen to edit this invoice.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Delete Unposted Invoice (with CAPTCHA Verification)
    // -------------------------------------------------------------
    deleteInvoice: function(id, invNo) {
        this.openDeleteModal(id, invNo);
    },

    openDeleteModal: function(id, invNo) {
        if (!id) return;
        const inv = (this.invoices || []).find(x => x.id == id);
        if (inv && (inv.fbr_status === 'Submitted' || inv.fbr_status === 'Accepted' || (inv.fbr_invoice_number && inv.fbr_invoice_number.trim() !== '' && inv.fbr_invoice_number !== 'Not Available' && inv.fbr_invoice_number !== 'None'))) {
            alert(`Invoice #${invNo || id} has already been posted to FBR and CANNOT be deleted.`);
            return;
        }

        this.selectedDeleteInvoiceId = id;
        this.selectedDeleteInvoiceNo = invNo || ('#' + id);

        const noEl = document.getElementById('pos_delete_inv_no');
        if (noEl) noEl.textContent = '#' + String(this.selectedDeleteInvoiceNo).replace(/^#/, '');

        this.refreshDeleteCaptcha();
        this.openModal('posModalDelete');
    },

    refreshDeleteCaptcha: function() {
        this.currentDeleteCaptcha = this.generateCaptcha();
        const qEl = document.getElementById('pos_delete_captcha_question');
        const inEl = document.getElementById('pos_delete_captcha_input');
        const errEl = document.getElementById('pos_delete_captcha_error');
        if (qEl) qEl.textContent = this.currentDeleteCaptcha.question;
        if (inEl) inEl.value = '';
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        setTimeout(() => { if (inEl) inEl.focus(); }, 150);
    },

    confirmDeleteInvoice: async function() {
        const id = this.selectedDeleteInvoiceId;
        const invNo = this.selectedDeleteInvoiceNo;
        if (!id) return;

        // Verify CAPTCHA
        const inEl = document.getElementById('pos_delete_captcha_input');
        const errEl = document.getElementById('pos_delete_captcha_error');
        const valStr = inEl ? inEl.value.trim() : '';
        const userAnswer = parseInt(valStr, 10);
        const expectedAnswer = this.currentDeleteCaptcha ? this.currentDeleteCaptcha.answer : null;

        if (valStr === '' || isNaN(userAnswer) || userAnswer !== expectedAnswer) {
            if (errEl) {
                errEl.textContent = '✕ Incorrect answer! A new question has been generated. Please try again.';
                errEl.style.display = 'block';
            } else {
                alert('✕ Incorrect CAPTCHA answer! Please solve the new question to proceed.');
            }
            this.refreshDeleteCaptcha();
            return;
        }

        const compId = this.getCompanyId();
        try {
            const res = await fetch('api/pos_sale_register.php?action=delete_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, company_id: compId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert(`✓ Invoice ${invNo} permanently deleted successfully.`);
                this.closeModal('posModalDelete');
                this.loadInvoices();
                if (window.POSModule && window.POSModule.currentInvoiceId == id) {
                    window.POSModule.clearSale();
                }
            } else {
                alert(`✕ Failed to delete invoice: ${data.message || 'Unknown error'}`);
            }
        } catch (e) {
            console.error("Delete invoice error:", e);
            alert('Failed to connect to server to delete invoice.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Sales Return
    // -------------------------------------------------------------
    openSalesReturn: function(id) {
        window.pendingReturnInvoiceId = id;
        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/POS/pos_sale_return.html', 'fa-undo', 'POS Sales Return', () => {
                if (window.POSReturnModule) {
                    window.POSReturnModule.loadOriginalInvoice(id);
                }
            }, 'POS Sales Return', true, true);
        } else if (typeof window.loadView === 'function') {
            window.loadView('Navigation/POS/pos_sale_return.html');
        }
    },

    // -------------------------------------------------------------
    // ACTION: View Invoice Audit History
    // -------------------------------------------------------------
    viewHistory: async function(id) {
        const compId = this.getCompanyId();
        try {
            const res = await fetch(`api/pos_sale_register.php?action=get_invoice_history&id=${id}&company_id=${compId}`);
            const data = await res.json();
            if (data.status !== 'success') {
                alert('Error: ' + data.message);
                return;
            }

            const inv = data.invoice;
            const logs = data.logs || [];
            const invNo = inv.pos_invoice_no || ('INV-' + inv.serial_no);

            let histHtml = `
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 0 0 6px 0; color: #1a202c;">Timeline for Invoice #${invNo}</h4>
                    <div style="font-size: 12px; color: #718096;">Total Amount: PKR ${parseFloat(inv.net_total || 0).toLocaleString()}</div>
                </div>

                <div style="position: relative; padding-left: 20px; border-left: 2px solid #cbd5e0; margin-left: 10px; font-size: 12px;">
                    
                    <div style="margin-bottom: 16px; position: relative;">
                        <i class="fas fa-plus-circle" style="position: absolute; left: -27px; top: 0; background: #fff; color: #3182ce; font-size: 14px;"></i>
                        <div style="font-weight: 700; color: #2d3748;">Invoice Created</div>
                        <div style="color: #718096; font-size: 11px;">${inv.created_at || inv.invoice_date || 'Initial Save'}</div>
                    </div>

                    ${inv.print_count > 0 ? `
                        <div style="margin-bottom: 16px; position: relative;">
                            <i class="fas fa-print" style="position: absolute; left: -27px; top: 0; background: #fff; color: #319795; font-size: 14px;"></i>
                            <div style="font-weight: 700; color: #2d3748;">Printed / Reprinted</div>
                            <div style="color: #4a5568;">Printed a total of <b>${inv.print_count} time(s)</b>.</div>
                            <div style="color: #718096; font-size: 11px;">Last Printed: ${inv.last_printed_at ? String(inv.last_printed_at).trim().split(' ')[0] : '—'}</div>
                        </div>
                    ` : ''}

                    <div style="margin-bottom: 16px; position: relative;">
                        <i class="fas fa-cloud-upload-alt" style="position: absolute; left: -27px; top: 0; background: #fff; color: ${inv.fbr_status === 'Submitted' ? '#38a169' : '#dd6b20'}; font-size: 14px;"></i>
                        <div style="font-weight: 700; color: #2d3748;">FBR Status: ${inv.fbr_status || 'Not Submitted'}</div>
                        ${inv.fbr_invoice_number ? `<div style="color: #4a5568;">FBR Reference: <b>${inv.fbr_invoice_number}</b></div>` : ''}
                        <div style="color: #718096; font-size: 11px;">Date: ${inv.fbr_submitted_at ? String(inv.fbr_submitted_at).trim().split(' ')[0] : 'Pending'}</div>
                    </div>

                    ${parseInt(inv.is_cancelled) === 1 ? `
                        <div style="margin-bottom: 16px; position: relative;">
                            <i class="fas fa-ban" style="position: absolute; left: -27px; top: 0; background: #fff; color: #e53e3e; font-size: 14px;"></i>
                            <div style="font-weight: 700; color: #c53030;">Invoice Cancelled</div>
                            <div style="color: #4a5568;">Reason: <b>${this.escapeHtml(inv.cancel_reason || 'No reason specified')}</b></div>
                            <div style="color: #718096; font-size: 11px;">Cancelled At: ${inv.cancelled_at || '—'} ${inv.cancelled_by_name ? `by ${inv.cancelled_by_name}` : ''}</div>
                        </div>
                    ` : ''}

                </div>
            `;

            if (logs.length > 0) {
                histHtml += `
                    <div style="margin-top: 20px;">
                        <h5 style="margin: 0 0 8px 0; font-size: 12px; color: #4a5568; text-transform: uppercase;">System Activity Logs</h5>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #edf2f7;">
                            <thead style="background: #f8fafc;">
                                <tr>
                                    <th style="padding: 6px 8px; text-align: left;">Action</th>
                                    <th style="padding: 6px 8px; text-align: left;">User</th>
                                    <th style="padding: 6px 8px; text-align: left;">Details</th>
                                    <th style="padding: 6px 8px; text-align: right;">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                logs.forEach(l => {
                    histHtml += `
                        <tr style="border-bottom: 1px solid #edf2f7;">
                            <td style="padding: 5px 8px; font-weight: 600;">${this.escapeHtml(l.action_type)}</td>
                            <td style="padding: 5px 8px;">${this.escapeHtml(l.username)}</td>
                            <td style="padding: 5px 8px; color: #4a5568;">${this.escapeHtml(l.record_title || '—')}</td>
                            <td style="padding: 5px 8px; text-align: right; color: #718096;">${l.created_at}</td>
                        </tr>
                    `;
                });
                histHtml += `</tbody></table></div>`;
            }

            document.getElementById('pos_history_body').innerHTML = histHtml;
            this.openModal('posModalHistory');

        } catch (e) {
            console.error("View history error:", e);
            alert('Failed to retrieve history logs.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Cancel Invoice
    // -------------------------------------------------------------
    openCancelModal: function(id) {
        this.selectedInvoiceId = id;
        const inv = this.invoices.find(x => x.id == id);
        if (!inv) return;

        const invNo = inv.formatted_invoice_no;
        document.getElementById('pos_cancel_inv_no').textContent = '#' + invNo;
        document.getElementById('pos_cancel_reason_input').value = '';

        const fbrWarning = document.getElementById('pos_cancel_fbr_warning');
        const fbrRefEl = document.getElementById('pos_cancel_fbr_ref');
        if (inv.fbr_status === 'Submitted' || inv.fbr_status === 'Accepted' || inv.fbr_invoice_number) {
            if (fbrRefEl) fbrRefEl.textContent = inv.fbr_invoice_number || 'Official FBR Record';
            if (fbrWarning) fbrWarning.style.display = 'block';
        } else {
            if (fbrWarning) fbrWarning.style.display = 'none';
        }

        // Initialize fresh dynamic CAPTCHA
        this.refreshCancelCaptcha();

        this.openModal('posModalCancel');
        setTimeout(() => {
            document.getElementById('pos_cancel_reason_input')?.focus();
        }, 100);
    },

    refreshCancelCaptcha: function() {
        this.currentCancelCaptcha = this.generateCaptcha();
        const qEl = document.getElementById('pos_cancel_captcha_question');
        const inEl = document.getElementById('pos_cancel_captcha_input');
        const errEl = document.getElementById('pos_cancel_captcha_error');

        if (qEl) qEl.textContent = this.currentCancelCaptcha.question;
        if (inEl) inEl.value = '';
        if (errEl) {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    },

    submitCancelInvoice: async function() {
        const id = this.selectedInvoiceId;
        const reason = (document.getElementById('pos_cancel_reason_input')?.value || '').trim();
        const captchaInput = (document.getElementById('pos_cancel_captcha_input')?.value || '').trim();
        const errEl = document.getElementById('pos_cancel_captcha_error');

        if (!reason) {
            alert('Please provide a mandatory cancellation reason.');
            document.getElementById('pos_cancel_reason_input')?.focus();
            return;
        }

        // Verify CAPTCHA
        if (!this.currentCancelCaptcha) {
            this.refreshCancelCaptcha();
        }

        if (captchaInput === '' || parseInt(captchaInput, 10) !== this.currentCancelCaptcha.answer) {
            if (errEl) {
                errEl.innerHTML = '<i class="fas fa-times-circle"></i> Wrong CAPTCHA answer! Please solve the new question below.';
                errEl.style.display = 'block';
            }
            alert('✕ Incorrect CAPTCHA answer! Please solve the new question to verify cancellation.');
            // Generate a fresh random question on failure
            this.refreshCancelCaptcha();
            document.getElementById('pos_cancel_captcha_input')?.focus();
            return;
        }

        const compId = this.getCompanyId();
        try {
            const res = await fetch('api/pos_sale_register.php?action=cancel_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, company_id: compId, reason: reason })
            });

            const data = await res.json();
            if (data.status === 'success') {
                alert('✓ Invoice has been cancelled successfully.');
                this.closeModal('posModalCancel');
                this.loadInvoices();
            } else {
                alert('✕ Error cancelling invoice: ' + data.message);
                this.refreshCancelCaptcha();
            }
        } catch (e) {
            console.error("Cancellation error:", e);
            alert('Failed to connect to backend server.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Export to CSV
    // -------------------------------------------------------------
    exportCSV: async function() {
        if (!this.invoices || this.invoices.length === 0) {
            alert('No invoices available to export with current filters.');
            return;
        }

        const compId = this.getCompanyId();
        const search = (document.getElementById('pos_filter_search')?.value || '').trim();
        const customer = (document.getElementById('pos_filter_customer')?.value || '').trim();
        const branch_id = document.getElementById('pos_filter_branch')?.value || '';
        const from_date = document.getElementById('pos_filter_from')?.value || '';
        const to_date = document.getElementById('pos_filter_to')?.value || '';
        const payment_status = document.getElementById('pos_filter_payment')?.value || '';
        const fbr_status = document.getElementById('pos_filter_fbr')?.value || '';

        // Fetch up to 1000 records for clean export
        const params = new URLSearchParams({
            action: 'get_invoices',
            company_id: compId,
            search: search,
            customer: customer,
            branch_id: branch_id,
            from_date: from_date,
            to_date: to_date,
            payment_status: payment_status,
            fbr_status: fbr_status,
            page: 1,
            limit: 1000
        });

        try {
            const res = await fetch(`api/pos_sale_register.php?${params.toString()}`);
            const json = await res.json();
            if (json.status !== 'success' || !json.data) {
                alert('Failed to retrieve export records.');
                return;
            }

            const rows = json.data;
            const headers = ['Invoice No', 'Date', 'Branch', 'Customer Name', 'Mobile', 'Items Count', 'Subtotal', 'Discount', 'Tax Amount', 'Grand Total', 'Payment Status', 'FBR Status', 'FBR Invoice Ref', 'Cancelled', 'Cancel Reason'];

            let csvContent = 'data:text/csv;charset=utf-8,';
            csvContent += headers.map(h => `"${h}"`).join(',') + '\r\n';

            rows.forEach(r => {
                const rowData = [
                    r.formatted_invoice_no,
                    r.invoice_date,
                    r.branch_name,
                    r.customer_name,
                    r.customer_mobile,
                    r.items_count,
                    r.subtotal,
                    r.total_discount,
                    r.total_tax,
                    r.net_total,
                    r.calc_payment_status,
                    r.fbr_status,
                    r.fbr_invoice_number || '',
                    parseInt(r.is_cancelled) === 1 ? 'YES' : 'NO',
                    r.cancel_reason || ''
                ];
                csvContent += rowData.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',') + '\r\n';
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            const filename = `pos_sales_register_${new Date().toISOString().split('T')[0]}.csv`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (e) {
            console.error("Export CSV Error:", e);
            alert('Failed to generate CSV export.');
        }
    },

    // -------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------
    formatDateTime: function(dateStr, createdAt) {
        if (!dateStr && !createdAt) return '—';
        const d = (dateStr || (createdAt ? createdAt.split(' ')[0] : '')).toString().trim().split(' ')[0];
        return d || '—';
    },
    formatDate: function(dateStr, createdAt) {
        return this.formatDateTime(dateStr, createdAt);
    },



    escapeHtml: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(new RegExp('"', 'g'), '&quot;')
            .replace(new RegExp("'", 'g'), '&#039;');
    }
};

// Auto-initialize if DOM is ready
if (document.getElementById('pos_register_tbody')) {
    window.POSRegisterModule.init();
}
