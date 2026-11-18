window.POSReportsModule = {
    activeReport: 'sales',
    lookups: null,
    currentPage: 1,
    perPage: 50,
    totalPages: 1,
    totalRecords: 0,
    currentRecords: [],
    currentSummary: null,

    reportConfigs: {
        sales: {
            title: 'POS Sales Report',
            icon: 'fa-file-invoice-dollar',
            subtitle: 'Detailed invoice-wise sales, discounts, taxes and payment statuses.',
            action: 'get_sales_report',
            dynamicLabel: 'FBR Status',
            dynamicOptions: [
                { value: 'all', text: 'All FBR Statuses' },
                { value: 'Submitted', text: 'Submitted / Accepted' },
                { value: 'Pending', text: 'Pending / Not Submitted' },
                { value: 'Failed', text: 'Failed / Rejected' }
            ]
        },
        payments: {
            title: 'POS Payment Report',
            icon: 'fa-credit-card',
            subtitle: 'Payments collection breakdown by cash, card, bank, QR and credit ledger.',
            action: 'get_payment_report',
            dynamicLabel: 'Payment Method',
            dynamicOptions: [
                { value: 'all', text: 'All Payment Methods' },
                { value: 'Cash', text: 'Cash' },
                { value: 'Card', text: 'Card (Debit/Credit)' },
                { value: 'Bank', text: 'Bank Transfer' },
                { value: 'QR', text: 'QR / Mobile Wallet' },
                { value: 'Credit', text: 'Customer Credit Ledger' }
            ]
        },
        closing: {
            title: 'POS Day Closing Report',
            icon: 'fa-door-closed',
            subtitle: 'History of cash drawer reconciliation, cash variance, and finalized shift closings.',
            action: 'get_day_closing_report',
            dynamicLabel: 'Shift Status',
            dynamicOptions: [
                { value: 'all', text: 'All Shifts' },
                { value: 'Closed', text: 'Closed Shifts' },
                { value: 'Open', text: 'Open Shifts' }
            ]
        },
        items: {
            title: 'POS Product Sales Report',
            icon: 'fa-boxes',
            subtitle: 'Quantity sold, gross sales, discounts and net revenues by product and category.',
            action: 'get_item_sales_report',
            dynamicLabel: 'Product Category',
            dynamicOptions: [
                { value: 'all', text: 'All Categories' }
            ]
        },
        returns: {
            title: 'POS Sales Return Report',
            icon: 'fa-undo',
            subtitle: 'Returned items, return reasons, refund amounts and tax adjustments.',
            action: 'get_sales_return_report',
            dynamicLabel: 'Return Status',
            dynamicOptions: [
                { value: 'all', text: 'All Returns' }
            ]
        },
        fbr: {
            title: 'FBR Digital Invoice Report',
            icon: 'fa-cloud-upload-alt',
            subtitle: 'Audit log of FBR submissions, invoice reference numbers, pending and failed invoices.',
            action: 'get_fbr_report',
            dynamicLabel: 'FBR Status',
            dynamicOptions: [
                { value: 'all', text: 'All Statuses' },
                { value: 'Submitted', text: 'Submitted / Verified' },
                { value: 'Pending', text: 'Pending Submission' },
                { value: 'Failed', text: 'Failed / Error' }
            ]
        },
        holds: {
            title: 'POS Hold / Recall Report',
            icon: 'fa-pause-circle',
            subtitle: 'Tracking of held sales, recall status, completed conversions and cancellations.',
            action: 'get_hold_report',
            dynamicLabel: 'Hold Status',
            dynamicOptions: [
                { value: 'all', text: 'All Statuses' },
                { value: 'On Hold', text: 'On Hold (Pending)' },
                { value: 'Recalled', text: 'Recalled (In Progress)' },
                { value: 'Completed', text: 'Completed (Invoiced)' },
                { value: 'Cancelled', text: 'Cancelled' }
            ]
        },
        cashier: {
            title: 'Cashier & Branch Performance Report',
            icon: 'fa-chart-pie',
            subtitle: 'Comparative sales volume, cash collections, and return analysis by cashier and branch.',
            action: 'get_cashier_branch_report',
            dynamicLabel: 'Grouping',
            dynamicOptions: [
                { value: 'all', text: 'All Groups' }
            ]
        }
    },

    formatLocalYMD: function(d) {
        if (!d) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    init: async function() {
        this.activeReport = 'sales';
        this.currentPage = 1;
        this.applyQuickDate('today');
        try {
            await this.fetchLookups();
        } catch (e) {
            console.warn('POSReports lookups error:', e);
        }
        this.setReport('sales');
    },

    fetchLookups: async function() {
        try {
            const res = await fetch('api/pos_reports.php?action=get_lookups');
            const data = await res.json();
            if (data.status === 'success') {
                this.lookups = data;
                
                // Populate Branch Select
                const bSelect = document.getElementById('rep_filter_branch');
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const isPosUser = session.role === 'POS' && session.branch_id;

                if (bSelect && data.branches) {
                    bSelect.innerHTML = isPosUser ? '' : '<option value="">All Branches</option>';
                    data.branches.forEach(b => {
                        if (!isPosUser || String(b.id) === String(session.branch_id)) {
                            bSelect.appendChild(new Option(`${b.branch_code || ''} - ${b.branch_name}`, b.id));
                        }
                    });

                    if (isPosUser) {
                        bSelect.value = session.branch_id;
                        bSelect.disabled = true;
                        bSelect.title = "Restricted to your assigned branch";
                        bSelect.style.backgroundColor = '#e2e8f0';
                        bSelect.style.cursor = 'not-allowed';
                        bSelect.style.fontWeight = 'bold';
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching lookups for POS Reports:', e);
        }
    },

    setReport: function(reportKey) {
        this.activeReport = reportKey;
        this.currentPage = 1;

        // Update active nav item
        document.querySelectorAll('.pos-rep-nav-item').forEach(el => {
            if (el.getAttribute('data-report') === reportKey) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        const cfg = this.reportConfigs[reportKey] || this.reportConfigs.sales;
        
        // Update Title & Subtitle
        const titleEl = document.getElementById('posReportTitle');
        const subEl = document.getElementById('posReportSubtitle');
        if (titleEl) titleEl.innerHTML = `<i class="fas ${cfg.icon}" style="color: #1F4E79;"></i> ${cfg.title}`;
        if (subEl) subEl.textContent = cfg.subtitle;

        // Update Dynamic Filter Group
        const dynGroup = document.getElementById('group_dynamic_filter');
        const dynLabel = document.getElementById('lbl_dynamic_filter');
        const dynSelect = document.getElementById('rep_dynamic_filter');

        if (dynGroup && dynLabel && dynSelect) {
            dynLabel.textContent = cfg.dynamicLabel;
            dynSelect.innerHTML = '';
            
            let options = cfg.dynamicOptions || [];
            // If items report, add categories from lookups
            if (reportKey === 'items' && this.lookups && this.lookups.categories) {
                options = [{ value: 'all', text: 'All Categories' }];
                this.lookups.categories.forEach(cat => {
                    options.push({ value: cat, text: cat });
                });
            }

            options.forEach(opt => {
                dynSelect.appendChild(new Option(opt.text, opt.value));
            });
        }

        this.loadReport();
    },

    applyQuickDate: function(preset) {
        const now = new Date();
        const to = this.formatLocalYMD(now);
        let from = '';

        if (preset === 'today') {
            from = to;
        } else if (preset === 'yesterday') {
            const y = new Date();
            y.setDate(now.getDate() - 1);
            from = this.formatLocalYMD(y);
            to = from;
        } else if (preset === 'this_week') {
            const w = new Date();
            const day = now.getDay() || 7; // Monday as 1
            w.setDate(now.getDate() - day + 1);
            from = this.formatLocalYMD(w);
        } else if (preset === 'this_month') {
            const m = new Date(now.getFullYear(), now.getMonth(), 1);
            from = this.formatLocalYMD(m);
        } else if (preset === 'all') {
            from = '';
            to = '';
        }

        const fromInput = document.getElementById('rep_filter_from');
        const toInput = document.getElementById('rep_filter_to');
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = to;

        // Update pills active class
        document.querySelectorAll('.quick-date-btn').forEach(btn => {
            if (btn.getAttribute('data-preset') === preset) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (this.lookups) {
            this.loadReport();
        }
    },

    resetFilters: function() {
        const fromInput = document.getElementById('rep_filter_from');
        const toInput = document.getElementById('rep_filter_to');
        const bSelect = document.getElementById('rep_filter_branch');
        const dynSelect = document.getElementById('rep_dynamic_filter');
        const sInput = document.getElementById('rep_filter_search');

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const isPosUser = session.role === 'POS' && session.branch_id;

        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        if (bSelect) bSelect.value = isPosUser ? session.branch_id : '';
        if (dynSelect) dynSelect.value = 'all';
        if (sInput) sInput.value = '';

        this.applyQuickDate('today');
    },

    loadReport: async function(page) {
        if (page) this.currentPage = page;

        const tbody = document.getElementById('posRepTbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" style="text-align: center; padding: 40px; color: #a0aec0;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
                        <div style="margin-top: 8px;">Generating report records...</div>
                    </td>
                </tr>
            `;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const isPosUser = session.role === 'POS' && session.branch_id;

        const cfg = this.reportConfigs[this.activeReport] || this.reportConfigs.sales;
        const fromDate = document.getElementById('rep_filter_from')?.value || '';
        const toDate = document.getElementById('rep_filter_to')?.value || '';
        let branchId = document.getElementById('rep_filter_branch')?.value || '';
        if (isPosUser) {
            branchId = session.branch_id;
        }
        const search = document.getElementById('rep_filter_search')?.value.trim() || '';
        const dynVal = document.getElementById('rep_dynamic_filter')?.value || 'all';

        let url = `api/pos_reports.php?action=${cfg.action}&company_id=${companyId}&page=${this.currentPage}&limit=${this.perPage}`;
        if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
        if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;
        if (branchId) url += `&branch_id=${encodeURIComponent(branchId)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        // Pass dynamic filter
        if (this.activeReport === 'sales' || this.activeReport === 'fbr') {
            if (dynVal && dynVal !== 'all') url += `&fbr_status=${encodeURIComponent(dynVal)}`;
        } else if (this.activeReport === 'payments') {
            if (dynVal && dynVal !== 'all') url += `&payment_method=${encodeURIComponent(dynVal)}`;
        } else if (this.activeReport === 'items') {
            if (dynVal && dynVal !== 'all') url += `&category=${encodeURIComponent(dynVal)}`;
        } else if (this.activeReport === 'holds' || this.activeReport === 'closing') {
            if (dynVal && dynVal !== 'all') url += `&status=${encodeURIComponent(dynVal)}`;
        }

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                this.currentRecords = data.records || [];
                this.currentSummary = data.summary || {};
                this.totalRecords = data.total_records || 0;
                this.totalPages = Math.ceil(this.totalRecords / this.perPage) || 1;

                this.renderSummaryCards(this.currentSummary);
                this.renderTable(this.currentRecords);
                this.renderPagination();
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #e53e3e; padding: 25px;">Error loading report: ${data.message}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #e53e3e; padding: 25px;">Failed to connect to server.</td></tr>`;
        }
    },

    renderSummaryCards: function(s) {
        const container = document.getElementById('posRepSummaryContainer');
        if (!container) return;

        let html = '';
        const fmtMoney = (n) => `Rs ${parseFloat(n || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        if (this.activeReport === 'sales') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Total Invoices</h4>
                        <div class="pos-card-val">${(s.valid_posted_invoices || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${s.cancelled_invoices || 0} cancelled</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-file-invoice"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>Gross Sales</h4>
                        <div class="pos-card-val">${fmtMoney(s.gross_sales)}</div>
                        <div class="pos-card-sub">Discount: ${fmtMoney(s.total_discount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-cash-register"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>Net Invoiced Sales</h4>
                        <div class="pos-card-val">${fmtMoney(s.net_sales)}</div>
                        <div class="pos-card-sub">Tax: ${fmtMoney(s.tax_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-percentage"></i></div>
                </div>
                <div class="pos-rep-card card-teal">
                    <div class="pos-card-info">
                        <h4>Net Revenue</h4>
                        <div class="pos-card-val">${fmtMoney(s.net_revenue)}</div>
                        <div class="pos-card-sub">Returns: ${fmtMoney(s.returns_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-coins"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'payments') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Total Transactions</h4>
                        <div class="pos-card-val">${(s.total_transactions || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Paid receipts</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-receipt"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>Total Amount Collected</h4>
                        <div class="pos-card-val">${fmtMoney(s.total_amount)}</div>
                        <div class="pos-card-sub">All payment channels</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-money-bill-wave"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'closing') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Closed Shifts</h4>
                        <div class="pos-card-val">${(s.total_closings || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Finalized shifts</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-door-closed"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>Total Sales Revenue</h4>
                        <div class="pos-card-val">${fmtMoney(s.total_sales)}</div>
                        <div class="pos-card-sub">In shift closings</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-cash-register"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>Actual Cash Count</h4>
                        <div class="pos-card-val">${fmtMoney(s.total_actual_cash)}</div>
                        <div class="pos-card-sub">Expected: ${fmtMoney(s.total_expected_cash)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-wallet"></i></div>
                </div>
                <div class="pos-rep-card card-teal">
                    <div class="pos-card-info">
                        <h4>Cash Variance</h4>
                        <div class="pos-card-val">Short: ${fmtMoney(s.total_cash_short)}</div>
                        <div class="pos-card-sub">Excess: ${fmtMoney(s.total_cash_excess)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-balance-scale"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'items') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Unique Products</h4>
                        <div class="pos-card-val">${(s.total_unique_items || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Sold in period</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-boxes"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>Total Quantity Sold</h4>
                        <div class="pos-card-val">${parseFloat(s.total_qty_sold || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Units / Pieces</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-cubes"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>Total Product Revenue</h4>
                        <div class="pos-card-val">${fmtMoney(s.total_revenue)}</div>
                        <div class="pos-card-sub">Net sales value</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-chart-line"></i></div>
                </div>
                <div class="pos-rep-card card-teal">
                    <div class="pos-card-info">
                        <h4>Top Seller</h4>
                        <div class="pos-card-val" style="font-size: 13px; font-weight: 700;">${s.top_selling_item || 'N/A'}</div>
                        <div class="pos-card-sub">Highest quantity sold</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-award"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'returns') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Total Returns</h4>
                        <div class="pos-card-val">${(s.total_returns || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Approved returns</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-undo"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>Total Return Value</h4>
                        <div class="pos-card-val">${fmtMoney(s.total_return_amount)}</div>
                        <div class="pos-card-sub">Refunded: ${fmtMoney(s.total_refunded_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-file-invoice-dollar"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'fbr') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Total Eligible</h4>
                        <div class="pos-card-val">${(s.total_eligible || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${fmtMoney(s.total_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-shield-alt"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>FBR Submitted</h4>
                        <div class="pos-card-val">${(s.submitted_count || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${fmtMoney(s.submitted_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-check-circle"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>FBR Pending</h4>
                        <div class="pos-card-val">${(s.pending_count || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${fmtMoney(s.pending_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-clock"></i></div>
                </div>
                <div class="pos-rep-card card-teal">
                    <div class="pos-card-info">
                        <h4>Rejected / Failed</h4>
                        <div class="pos-card-val" style="color: #c53030;">${(s.failed_count || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${fmtMoney(s.failed_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-times-circle"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'holds') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Total Holds</h4>
                        <div class="pos-card-val">${(s.total_holds || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${fmtMoney(s.total_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-pause-circle"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>Active On Hold</h4>
                        <div class="pos-card-val">${(s.on_hold_count || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">${fmtMoney(s.on_hold_amount)}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-clock"></i></div>
                </div>
                <div class="pos-rep-card card-indigo">
                    <div class="pos-card-info">
                        <h4>Recalled / In Progress</h4>
                        <div class="pos-card-val">${(s.recalled_count || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">In progress</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-history"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>Completed (Invoiced)</h4>
                        <div class="pos-card-val">${(s.completed_count || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Cancelled: ${s.cancelled_count || 0}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-check-circle"></i></div>
                </div>
            `;
        } else if (this.activeReport === 'cashier') {
            html = `
                <div class="pos-rep-card card-blue">
                    <div class="pos-card-info">
                        <h4>Active Branches</h4>
                        <div class="pos-card-val">${(s.total_branches || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Operating outlets</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-building"></i></div>
                </div>
                <div class="pos-rep-card card-green">
                    <div class="pos-card-info">
                        <h4>Total Invoices</h4>
                        <div class="pos-card-val">${(s.total_invoices || 0).toLocaleString()}</div>
                        <div class="pos-card-sub">Across all branches</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-file-invoice"></i></div>
                </div>
                <div class="pos-rep-card card-amber">
                    <div class="pos-card-info">
                        <h4>Total Sales Revenue</h4>
                        <div class="pos-card-val">${fmtMoney(s.total_sales)}</div>
                        <div class="pos-card-sub">Top: ${s.top_branch || 'N/A'}</div>
                    </div>
                    <div class="pos-card-icon"><i class="fas fa-trophy"></i></div>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    renderTable: function(records) {
        const thead = document.getElementById('posRepThead');
        const tbody = document.getElementById('posRepTbody');
        const tfoot = document.getElementById('posRepTfoot');

        if (!thead || !tbody || !tfoot) return;

        const fmtMoney = (n) => `Rs ${parseFloat(n || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        if (records.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" style="text-align: center; padding: 45px 20px; color: #718096;">
                        <i class="fas fa-search" style="font-size: 32px; color: #cbd5e0; margin-bottom: 8px;"></i>
                        <div style="font-weight: 600; font-size: 14px;">No Records Found</div>
                        <div style="font-size: 12px; color: #a0aec0; margin-top: 4px;">Try expanding your date range or clearing filters.</div>
                    </td>
                </tr>
            `;
            tfoot.innerHTML = '';
            return;
        }

        // ==========================================
        // 1. SALES REPORT TABLE
        // ==========================================
        if (this.activeReport === 'sales') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 100px;">INVOICE #</th>
                    <th style="width: 120px;">DATE</th>
                    <th>CUSTOMER</th>
                    <th style="width: 110px;">BRANCH</th>
                    <th style="width: 80px;">PAYMENT</th>
                    <th style="width: 90px; text-align: right;">GROSS</th>
                    <th style="width: 80px; text-align: right;">DISCOUNT</th>
                    <th style="width: 80px; text-align: right;">TAX</th>
                    <th style="width: 100px; text-align: right;">NET TOTAL</th>
                    <th style="width: 90px; text-align: center;">FBR STATUS</th>
                </tr>
            `;

            let sumGross = 0, sumDisc = 0, sumTax = 0, sumNet = 0;

            tbody.innerHTML = records.map(r => {
                const gross = parseFloat(r.gross_amount || 0);
                const disc = parseFloat(r.additional_discount || 0);
                const net = parseFloat(r.net_total || 0);
                const tax = Math.max(0, net - (gross - disc));

                sumGross += gross; sumDisc += disc; sumTax += tax; sumNet += net;

                let fbrBadge = `<span class="pos-badge badge-pend">Pending</span>`;
                if (['Submitted', 'Accepted', 'Verified'].includes(r.fbr_status)) {
                    fbrBadge = `<span class="pos-badge badge-sub"><i class="fas fa-check"></i> ${r.fbr_status}</span>`;
                } else if (['Failed', 'Rejected', 'Error'].includes(r.fbr_status)) {
                    fbrBadge = `<span class="pos-badge badge-fail">${r.fbr_status}</span>`;
                }

                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="font-weight: 700; color: #1F4E79;">${r.pos_invoice_no || ('INV-' + r.serial_no)}</td>
                        <td>${r.invoice_date}</td>
                        <td><strong>${r.customer_name || 'Walk-in Customer'}</strong></td>
                        <td>${r.branch_name || 'Main Branch'}</td>
                        <td><span style="font-size:11px; font-weight:600; color:#4a5568;">${r.payment_terms || 'Cash'}</span></td>
                        <td style="text-align: right;">${fmtMoney(gross)}</td>
                        <td style="text-align: right; color:#e53e3e;">${fmtMoney(disc)}</td>
                        <td style="text-align: right; color:#d97706;">${fmtMoney(tax)}</td>
                        <td style="text-align: right; font-weight: 800; color:#1F4E79;">${fmtMoney(net)}</td>
                        <td style="text-align: center;">${fbrBadge}</td>
                    </tr>
                `;
            }).join('');

            tfoot.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: right;">Page Subtotal:</td>
                    <td style="text-align: right;">${fmtMoney(sumGross)}</td>
                    <td style="text-align: right; color:#e53e3e;">${fmtMoney(sumDisc)}</td>
                    <td style="text-align: right; color:#d97706;">${fmtMoney(sumTax)}</td>
                    <td style="text-align: right; color:#1F4E79; font-size:13px;">${fmtMoney(sumNet)}</td>
                    <td></td>
                </tr>
            `;
        }

        // ==========================================
        // 2. PAYMENT REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'payments') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 100px;">DATE</th>
                    <th style="width: 110px;">INVOICE #</th>
                    <th>CUSTOMER</th>
                    <th style="width: 120px;">BRANCH</th>
                    <th style="width: 120px;">PAYMENT METHOD</th>
                    <th style="width: 110px; text-align: right;">AMOUNT PAID</th>
                    <th style="width: 90px; text-align: center;">STATUS</th>
                </tr>
            `;

            let sumAmt = 0;
            tbody.innerHTML = records.map(r => {
                const amt = parseFloat(r.net_total || 0);
                sumAmt += amt;
                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td>${r.invoice_date}</td>
                        <td style="font-weight: 700; color: #1F4E79;">${r.pos_invoice_no || ('INV-' + r.serial_no)}</td>
                        <td><strong>${r.customer_name || 'Walk-in Customer'}</strong></td>
                        <td>${r.branch_name || 'Main Branch'}</td>
                        <td><span style="font-weight:600; color:#2b6cb0;">${r.payment_terms || 'Cash'}</span></td>
                        <td style="text-align: right; font-weight: 800; color:#16a34a;">${fmtMoney(amt)}</td>
                        <td style="text-align: center;"><span class="pos-badge badge-completed">Paid</span></td>
                    </tr>
                `;
            }).join('');

            tfoot.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: right;">Page Subtotal:</td>
                    <td style="text-align: right; color:#16a34a; font-size:13px;">${fmtMoney(sumAmt)}</td>
                    <td></td>
                </tr>
            `;
        }

        // ==========================================
        // 3. DAY CLOSING REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'closing') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 100px;">CLOSING #</th>
                    <th style="width: 100px;">DATE</th>
                    <th style="width: 110px;">BRANCH</th>
                    <th style="width: 100px;">CASHIER</th>
                    <th style="width: 90px; text-align: right;">OPEN CASH</th>
                    <th style="width: 90px; text-align: right;">CASH SALES</th>
                    <th style="width: 90px; text-align: right;">EXPECTED</th>
                    <th style="width: 90px; text-align: right;">ACTUAL</th>
                    <th style="width: 90px; text-align: right;">VARIANCE</th>
                    <th style="width: 80px; text-align: center;">STATUS</th>
                </tr>
            `;

            tbody.innerHTML = records.map(r => {
                const diff = parseFloat(r.cash_difference || 0);
                let diffBadge = `<span style="color:#16a34a; font-weight:bold;">Balanced</span>`;
                if (diff < -0.01) diffBadge = `<span style="color:#dc2626; font-weight:bold;">-${fmtMoney(Math.abs(diff))}</span>`;
                else if (diff > 0.01) diffBadge = `<span style="color:#d97706; font-weight:bold;">+${fmtMoney(diff)}</span>`;

                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="font-weight: 700; color: #1F4E79;">${r.closing_no}</td>
                        <td>${r.business_date}</td>
                        <td>${r.branch_name || 'Main Branch'}</td>
                        <td>${r.cashier_name || 'Cashier'}</td>
                        <td style="text-align: right;">${fmtMoney(r.opening_cash)}</td>
                        <td style="text-align: right; color:#16a34a;">${fmtMoney(r.cash_sales)}</td>
                        <td style="text-align: right; font-weight:600;">${fmtMoney(r.expected_cash)}</td>
                        <td style="text-align: right; font-weight:700;">${fmtMoney(r.actual_cash)}</td>
                        <td style="text-align: right;">${diffBadge}</td>
                        <td style="text-align: center;"><span class="pos-badge badge-completed">${r.shift_status}</span></td>
                    </tr>
                `;
            }).join('');
            tfoot.innerHTML = '';
        }

        // ==========================================
        // 4. ITEM / PRODUCT SALES REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'items') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 100px;">CODE</th>
                    <th>PRODUCT NAME</th>
                    <th style="width: 110px;">CATEGORY</th>
                    <th style="width: 80px; text-align: center;">UNIT</th>
                    <th style="width: 90px; text-align: right;">QTY SOLD</th>
                    <th style="width: 100px; text-align: right;">GROSS SALES</th>
                    <th style="width: 90px; text-align: right;">DISCOUNT</th>
                    <th style="width: 90px; text-align: right;">TAX</th>
                    <th style="width: 110px; text-align: right;">NET SALES</th>
                </tr>
            `;

            let sumQty = 0, sumGross = 0, sumNet = 0;
            tbody.innerHTML = records.map(r => {
                const qty = parseFloat(r.total_qty_sold || 0);
                const gross = parseFloat(r.gross_sales || 0);
                const net = parseFloat(r.net_sales || 0);
                sumQty += qty; sumGross += gross; sumNet += net;

                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="font-weight: 700; color: #1F4E79;">${r.item_code}</td>
                        <td><strong>${r.item_name}</strong></td>
                        <td><span class="pos-badge" style="background:#f1f5f9; color:#475569;">${r.category}</span></td>
                        <td style="text-align: center;">${r.unit || 'pcs'}</td>
                        <td style="text-align: right; font-weight: bold; color: #2b6cb0;">${qty.toFixed(2)}</td>
                        <td style="text-align: right;">${fmtMoney(gross)}</td>
                        <td style="text-align: right; color:#e53e3e;">${fmtMoney(r.total_discount)}</td>
                        <td style="text-align: right; color:#d97706;">${fmtMoney(r.total_tax)}</td>
                        <td style="text-align: right; font-weight: 800; color: #1F4E79;">${fmtMoney(net)}</td>
                    </tr>
                `;
            }).join('');

            tfoot.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: right;">Page Subtotal:</td>
                    <td style="text-align: right; font-weight:bold; color:#2b6cb0;">${sumQty.toFixed(2)}</td>
                    <td style="text-align: right;">${fmtMoney(sumGross)}</td>
                    <td colspan="2"></td>
                    <td style="text-align: right; color:#1F4E79; font-size:13px;">${fmtMoney(sumNet)}</td>
                </tr>
            `;
        }

        // ==========================================
        // 5. SALES RETURN REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'returns') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 100px;">RETURN #</th>
                    <th style="width: 100px;">DATE</th>
                    <th style="width: 110px;">ORIGINAL INV #</th>
                    <th>CUSTOMER</th>
                    <th style="width: 110px;">BRANCH</th>
                    <th style="width: 100px; text-align: right;">RETURN TOTAL</th>
                    <th style="width: 100px; text-align: right;">REFUNDED</th>
                    <th>REASON</th>
                </tr>
            `;

            let sumRet = 0, sumRef = 0;
            tbody.innerHTML = records.map(r => {
                const retAmt = parseFloat(r.return_amount || 0);
                const refAmt = parseFloat(r.refund_amount || 0);
                sumRet += retAmt; sumRef += refAmt;

                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="font-weight: 700; color: #e53e3e;">${'RET-' + r.serial_no}</td>
                        <td>${r.return_date}</td>
                        <td style="font-weight: 600; color: #1F4E79;">${r.sale_invoice_no || 'N/A'}</td>
                        <td><strong>${r.customer_name || 'Customer'}</strong></td>
                        <td>${r.branch_name || 'Main Branch'}</td>
                        <td style="text-align: right; font-weight: 700; color: #e53e3e;">${fmtMoney(retAmt)}</td>
                        <td style="text-align: right; color: #16a34a;">${fmtMoney(refAmt)}</td>
                        <td style="font-size: 11px; color: #718096;">${r.return_reason || '--'}</td>
                    </tr>
                `;
            }).join('');

            tfoot.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: right;">Page Subtotal:</td>
                    <td style="text-align: right; color:#e53e3e; font-size:13px;">${fmtMoney(sumRet)}</td>
                    <td style="text-align: right; color:#16a34a;">${fmtMoney(sumRef)}</td>
                    <td></td>
                </tr>
            `;
        }

        // ==========================================
        // 6. FBR DIGITAL INVOICE REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'fbr') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 110px;">ERP INVOICE #</th>
                    <th style="width: 100px;">DATE</th>
                    <th>CUSTOMER</th>
                    <th style="width: 110px;">BRANCH</th>
                    <th style="width: 100px; text-align: right;">INVOICE TOTAL</th>
                    <th style="width: 140px;">FBR INVOICE #</th>
                    <th style="width: 130px;">SUBMISSION DATE</th>
                    <th style="width: 100px; text-align: center;">FBR STATUS</th>
                </tr>
            `;

            tbody.innerHTML = records.map(r => {
                let badge = `<span class="pos-badge badge-pend">Pending</span>`;
                if (['Submitted', 'Accepted', 'Verified'].includes(r.fbr_status)) {
                    badge = `<span class="pos-badge badge-sub"><i class="fas fa-check"></i> ${r.fbr_status}</span>`;
                } else if (['Failed', 'Rejected', 'Error'].includes(r.fbr_status)) {
                    badge = `<span class="pos-badge badge-fail">${r.fbr_status}</span>`;
                }

                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="font-weight: 700; color: #1F4E79;">${r.pos_invoice_no || ('INV-' + r.serial_no)}</td>
                        <td>${r.invoice_date}</td>
                        <td><strong>${r.customer_name || 'Walk-in Customer'}</strong></td>
                        <td>${r.branch_name || 'Main Branch'}</td>
                        <td style="text-align: right; font-weight: 700;">${fmtMoney(r.net_total)}</td>
                        <td style="font-family: monospace; font-weight: bold; color: #2b6cb0;">${r.fbr_invoice_number || '--'}</td>
                        <td style="font-size: 11px; color: #718096;">${r.fbr_submitted_at ? r.fbr_submitted_at.split(' ')[0] : (r.formatted_fbr_time ? r.formatted_fbr_time.split(' ')[0] : '--')}</td>
                        <td style="text-align: center;">${badge}</td>
                    </tr>
                `;
            }).join('');
            tfoot.innerHTML = '';
        }

        // ==========================================
        // 7. HOLD / RECALL REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'holds') {
            thead.innerHTML = `
                <tr>
                    <th style="width: 100px;">HOLD #</th>
                    <th style="width: 120px;">HOLD DATE</th>
                    <th>CUSTOMER</th>
                    <th style="width: 110px;">BRANCH</th>
                    <th style="width: 90px;">CASHIER</th>
                    <th style="width: 70px; text-align: center;">ITEMS</th>
                    <th style="width: 100px; text-align: right;">HOLD AMOUNT</th>
                    <th style="width: 100px; text-align: center;">STATUS</th>
                    <th style="width: 110px;">FINAL INVOICE #</th>
                </tr>
            `;

            tbody.innerHTML = records.map(r => {
                let badge = `<span class="pos-badge badge-onhold">On Hold</span>`;
                if (r.status === 'Recalled') badge = `<span class="pos-badge badge-recalled">Recalled</span>`;
                else if (r.status === 'Completed') badge = `<span class="pos-badge badge-completed">Completed</span>`;
                else if (r.status === 'Cancelled') badge = `<span class="pos-badge" style="background:#edf2f7; color:#718096;">Cancelled</span>`;

                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="font-weight: 700; color: #b45309;">${r.hold_no}</td>
                        <td>${r.hold_date || (r.formatted_datetime ? r.formatted_datetime.split(' ')[0] : '--')}</td>
                        <td><strong>${r.customer_name || 'Walk-in Customer'}</strong></td>
                        <td>${r.branch_name || 'Main Branch'}</td>
                        <td>${r.cashier_name || 'Cashier'}</td>
                        <td style="text-align: center; font-weight: bold;">${r.items_count}</td>
                        <td style="text-align: right; font-weight: 700; color: #d97706;">${fmtMoney(r.net_total)}</td>
                        <td style="text-align: center;">${badge}</td>
                        <td style="font-weight: bold; color: #16a34a;">${r.final_invoice_no || '--'}</td>
                    </tr>
                `;
            }).join('');
            tfoot.innerHTML = '';
        }

        // ==========================================
        // 8. CASHIER / BRANCH REPORT TABLE
        // ==========================================
        else if (this.activeReport === 'cashier') {
            thead.innerHTML = `
                <tr>
                    <th>BRANCH NAME</th>
                    <th>CASHIER / TERMINAL</th>
                    <th style="width: 90px; text-align: center;">INVOICES</th>
                    <th style="width: 110px; text-align: right;">GROSS SALES</th>
                    <th style="width: 90px; text-align: right;">DISCOUNT</th>
                    <th style="width: 110px; text-align: right;">NET SALES</th>
                    <th style="width: 110px; text-align: right;">CASH SALES</th>
                    <th style="width: 110px; text-align: right;">NON-CASH SALES</th>
                </tr>
            `;

            tbody.innerHTML = records.map(r => `
                <tr style="border-bottom: 1px solid #edf2f7;">
                    <td style="font-weight: 700; color: #1F4E79;">${r.branch_name}</td>
                    <td><strong>${r.cashier_name}</strong></td>
                    <td style="text-align: center; font-weight: bold;">${r.total_invoices}</td>
                    <td style="text-align: right;">${fmtMoney(r.gross_sales)}</td>
                    <td style="text-align: right; color:#e53e3e;">${fmtMoney(r.total_discount)}</td>
                    <td style="text-align: right; font-weight: 800; color: #1F4E79;">${fmtMoney(r.net_sales)}</td>
                    <td style="text-align: right; color:#16a34a;">${fmtMoney(r.cash_sales)}</td>
                    <td style="text-align: right; color:#3182ce;">${fmtMoney(r.non_cash_sales)}</td>
                </tr>
            `).join('');
            tfoot.innerHTML = '';
        }
    },

    renderPagination: function() {
        const start = this.totalRecords === 0 ? 0 : ((this.currentPage - 1) * this.perPage) + 1;
        const end = Math.min(this.currentPage * this.perPage, this.totalRecords);

        document.getElementById('rep_pag_start').textContent = start;
        document.getElementById('rep_pag_end').textContent = end;
        document.getElementById('rep_pag_total').textContent = this.totalRecords;

        const controls = document.getElementById('posRepPaginationControls');
        if (!controls) return;

        let html = `<button type="button" class="pos-pag-btn" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="window.POSReportsModule.loadReport(${this.currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;

        const maxButtons = 5;
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(this.totalPages, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            html += `<button type="button" class="pos-pag-btn ${p === this.currentPage ? 'active' : ''}" onclick="window.POSReportsModule.loadReport(${p})">${p}</button>`;
        }

        html += `<button type="button" class="pos-pag-btn" ${this.currentPage >= this.totalPages ? 'disabled' : ''} onclick="window.POSReportsModule.loadReport(${this.currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        controls.innerHTML = html;
    },

    printReport: function() {
        const printable = document.getElementById('printableReportSheet');
        const mainTable = document.getElementById('posMainReportTable');
        const cfg = this.reportConfigs[this.activeReport] || this.reportConfigs.sales;

        const fromDate = document.getElementById('rep_filter_from')?.value || 'Start';
        const toDate = document.getElementById('rep_filter_to')?.value || 'Present';
        const branchSelect = document.getElementById('rep_filter_branch');
        const branchText = branchSelect && branchSelect.selectedIndex >= 0 ? branchSelect.options[branchSelect.selectedIndex].text : 'All Branches';

        printable.innerHTML = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #000;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                    <h2 style="margin: 0; font-size: 20px;">SOFTIFYX FINANCIALS</h2>
                    <h3 style="margin: 4px 0; font-size: 16px;">${cfg.title}</h3>
                    <div style="font-size: 12px; color: #444;">
                        <strong>Branch:</strong> ${branchText} | <strong>Date Range:</strong> ${fromDate} to ${toDate} | <strong>Generated:</strong> ${new Date().toISOString().split('T')[0]}
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    ${mainTable.outerHTML}
                </div>

                <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px;">
                    <div>Prepared By: ___________________</div>
                    <div>Supervisor / Manager: ___________________</div>
                </div>
            </div>
        `;

        window.print();
    },

    exportCSV: function() {
        if (!this.currentRecords || this.currentRecords.length === 0) {
            alert('No records available to export.');
            return;
        }

        const cfg = this.reportConfigs[this.activeReport] || this.reportConfigs.sales;
        let headers = [];
        let rows = [];

        if (this.activeReport === 'sales') {
            headers = ['Invoice No', 'Date', 'Customer', 'Branch', 'Payment Method', 'Gross', 'Discount', 'Tax', 'Net Total', 'FBR Status', 'FBR Invoice Number'];
            rows = this.currentRecords.map(r => [
                `"${r.pos_invoice_no || ('INV-' + r.serial_no)}"`,
                `"${r.invoice_date}"`,
                `"${(r.customer_name || '').replace(/"/g, '""')}"`,
                `"${(r.branch_name || '').replace(/"/g, '""')}"`,
                `"${r.payment_terms || 'Cash'}"`,
                r.gross_amount || 0,
                r.additional_discount || 0,
                Math.max(0, (r.net_total || 0) - ((r.gross_amount || 0) - (r.additional_discount || 0))),
                r.net_total || 0,
                `"${r.fbr_status || 'Pending'}"`,
                `"${r.fbr_invoice_number || ''}"`
            ]);
        } else if (this.activeReport === 'payments') {
            headers = ['Date', 'Invoice No', 'Customer', 'Branch', 'Payment Method', 'Amount'];
            rows = this.currentRecords.map(r => [
                `"${r.invoice_date}"`,
                `"${r.pos_invoice_no || ('INV-' + r.serial_no)}"`,
                `"${(r.customer_name || '').replace(/"/g, '""')}"`,
                `"${(r.branch_name || '').replace(/"/g, '""')}"`,
                `"${r.payment_terms || 'Cash'}"`,
                r.net_total || 0
            ]);
        } else if (this.activeReport === 'items') {
            headers = ['Item Code', 'Item Name', 'Category', 'Unit', 'Qty Sold', 'Gross Sales', 'Discount', 'Tax', 'Net Sales'];
            rows = this.currentRecords.map(r => [
                `"${r.item_code}"`,
                `"${(r.item_name || '').replace(/"/g, '""')}"`,
                `"${r.category}"`,
                `"${r.unit || 'pcs'}"`,
                r.total_qty_sold || 0,
                r.gross_sales || 0,
                r.total_discount || 0,
                r.total_tax || 0,
                r.net_sales || 0
            ]);
        } else if (this.activeReport === 'fbr') {
            headers = ['ERP Invoice #', 'Date', 'Customer', 'Branch', 'Invoice Total', 'FBR Invoice #', 'Submission Date', 'FBR Status'];
            rows = this.currentRecords.map(r => [
                `"${r.pos_invoice_no || ('INV-' + r.serial_no)}"`,
                `"${r.invoice_date || ''}"`,
                `"${(r.customer_name || '').replace(/"/g, '""')}"`,
                `"${(r.branch_name || '').replace(/"/g, '""')}"`,
                r.net_total || 0,
                `"${r.fbr_invoice_number || '--'}"`,
                `"${(r.fbr_submitted_at ? r.fbr_submitted_at.split(' ')[0] : (r.formatted_fbr_time ? r.formatted_fbr_time.split(' ')[0] : '--'))}"`,
                `"${r.fbr_status || 'Pending'}"`
            ]);
        } else if (this.activeReport === 'holds') {
            headers = ['Hold #', 'Hold Date', 'Customer', 'Branch', 'Cashier', 'Items', 'Hold Amount', 'Status', 'Final Invoice #'];
            rows = this.currentRecords.map(r => [
                `"${r.hold_no || ''}"`,
                `"${(r.hold_date || (r.formatted_datetime ? r.formatted_datetime.split(' ')[0] : '--'))}"`,
                `"${(r.customer_name || '').replace(/"/g, '""')}"`,
                `"${(r.branch_name || '').replace(/"/g, '""')}"`,
                `"${(r.cashier_name || '').replace(/"/g, '""')}"`,
                r.items_count || 0,
                r.net_total || 0,
                `"${r.status || ''}"`,
                `"${r.final_invoice_no || '--'}"`
            ]);
        } else {
            // Generic export for other reports
            const first = this.currentRecords[0];
            headers = Object.keys(first);
            rows = this.currentRecords.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`));
        }

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `pos_${this.activeReport}_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
