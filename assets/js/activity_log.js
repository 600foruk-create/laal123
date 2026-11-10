/**
 * Softifyx ERP - User Activity History & Audit Trace Module
 * Beautiful glassmorphic UI, dynamic multi-scope filtering, and deep object comparative diffing.
 */
(function() {
    window.ActivityLogModule = {
        activeFilter: 'all',
        currentActionFilter: 'ALL',
        logs: [],
        users: [],
        usersLoaded: false,
        keyboardListenerAttached: false,
        selectedRowIndex: -1,

        /**
         * Initialize the view - Sets up defaults and triggers log loading
         */
        init: function() {
            // Set default date range: start = 7 days ago, end = today
            const today = new Date();
            const start = new Date();
            start.setDate(today.getDate() - 7);

            const format = (d) => d.toISOString().split('T')[0];
            
            const startInput = document.getElementById('activity-log-start-date');
            const endInput = document.getElementById('activity-log-end-date');
            
            if (startInput) startInput.value = format(start);
            if (endInput) endInput.value = format(today);

            this.activeFilter = 'all';
            this.usersLoaded = false;

            // Attach module change listener programmatically (more reliable in modal contexts)
            const moduleSelect = document.getElementById('activity-log-module-select');
            if (moduleSelect) {
                moduleSelect.addEventListener('change', () => {
                    this.handleModuleChange();
                });
                // If a module is already selected on load, trigger immediately
                if (moduleSelect.value) {
                    this.handleModuleChange();
                }
            }

            // Attach serial change listener programmatically
            const serialSelect = document.getElementById('activity-log-serial-select');
            if (serialSelect) {
                serialSelect.addEventListener('change', () => {
                    // Serial selected - ready for View History click
                });
            }

            if (!window._activityLogKeydownAttached) {
                window.addEventListener('keydown', function(e) {
                    const scrollArea = document.getElementById('activity-log-scroll-area');
                    // Check if modal is visible and we have a scroll area
                    if (scrollArea && scrollArea.offsetParent !== null) {
                        const activeTag = document.activeElement ? document.activeElement.tagName : '';
                        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag)) return;
                        
                        const mod = window.ActivityLogModule;
                        if (e.key === 'ArrowDown') {
                            if (mod.logs && mod.logs.length > 0) {
                                if (mod.selectedRowIndex < mod.logs.length - 1) {
                                    mod.selectedRowIndex++;
                                    mod.highlightRow();
                                }
                            } else {
                                scrollArea.scrollTop += 50;
                            }
                            e.preventDefault();
                        } else if (e.key === 'ArrowUp') {
                            if (mod.logs && mod.logs.length > 0) {
                                if (mod.selectedRowIndex > 0) {
                                    mod.selectedRowIndex--;
                                    mod.highlightRow();
                                }
                            } else {
                                scrollArea.scrollTop -= 50;
                            }
                            e.preventDefault();
                        }
                    }
                });
                window._activityLogKeydownAttached = true;
            }
            
            this.setQuickFilter('all');
        },

        highlightRow: function() {
            const rows = document.querySelectorAll('#activity-logs-tbody .activity-log-row');
            rows.forEach((row, index) => {
                if (index === this.selectedRowIndex) {
                    row.classList.add('row-selected');
                    // Ensure the row is visible within the scroll area
                    row.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                } else {
                    row.classList.remove('row-selected');
                }
            });
        },

        selectRow: function(index) {
            this.selectedRowIndex = index;
            this.highlightRow();
        },

        /**
         * Update time-scope filters and toggle visibility of date range inputs
         */
        setQuickFilter: function(filterType) {
            this.activeFilter = filterType;

            // Highlight selected pill button
            document.querySelectorAll('.btn-filter-pill').forEach(btn => {
                btn.style.background = 'transparent';
                btn.style.color = '#444';
                btn.style.fontWeight = '500';
                btn.classList.remove('active');
            });

            const activeBtn = document.getElementById(`quick-filter-${filterType}`);
            if (activeBtn) {
                activeBtn.style.background = '#1F4E79';
                activeBtn.style.color = 'white';
                activeBtn.style.fontWeight = 'bold';
                activeBtn.classList.add('active');
            }

            // Enable/disable custom date range picker
            const rangeContainer = document.getElementById('custom-date-range-container');
            if (rangeContainer) {
                if (filterType === 'date_range') {
                    rangeContainer.style.opacity = '1';
                    rangeContainer.style.pointerEvents = 'auto';
                } else {
                    rangeContainer.style.opacity = '0.5';
                    rangeContainer.style.pointerEvents = 'none';
                }
            }

            this.loadLogs();
        },

        /**
         * Handle datepickers manual change event
         */
        handleDateChange: function() {
            if (this.activeFilter === 'date_range') {
                this.loadLogs();
            }
        },

        /**
         * Handle Module dropdown change - fetch serials and populate serial select
         */
        handleModuleChange: function() {
            const moduleSelect = document.getElementById('activity-log-module-select');
            const serialSelect = document.getElementById('activity-log-serial-select');
            if (!moduleSelect || !serialSelect) return;

            const moduleName = moduleSelect.value;

            // Reset serial select
            serialSelect.innerHTML = '<option value="">-- All Serials --</option>';

            if (!moduleName) return;

            // Temporarily show loading
            const loadingOpt = document.createElement('option');
            loadingOpt.disabled = true;
            loadingOpt.textContent = 'Loading...';
            serialSelect.appendChild(loadingOpt);

            fetch('api/activity_log.php?action=get_module_serials&module_name=' + encodeURIComponent(moduleName))
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    // Remove loading option
                    serialSelect.innerHTML = '<option value="">-- All Serials --</option>';
                    if (data.status === 'success' && data.serials && data.serials.length > 0) {
                        data.serials.forEach(function(serial) {
                            if (serial) {
                                var opt = document.createElement('option');
                                opt.value = serial;
                                opt.textContent = serial;
                                serialSelect.appendChild(opt);
                            }
                        });
                    } else {
                        var noOpt = document.createElement('option');
                        noOpt.disabled = true;
                        noOpt.textContent = 'No records found';
                        serialSelect.appendChild(noOpt);
                    }
                })
                .catch(function(err) {
                    console.error('Error fetching serials:', err);
                    serialSelect.innerHTML = '<option value="">-- Error loading --</option>';
                });
        },

        /**
         * Fetch activity logs from backend
         */
        loadLogs: function() {
            const refreshIcon = document.getElementById('activity-refresh-icon');
            if (refreshIcon) refreshIcon.classList.add('fa-spin');

            const userSelect = document.getElementById('activity-log-user-select');
            const userId = userSelect ? userSelect.value : '';

            const moduleSelect = document.getElementById('activity-log-module-select');
            const moduleName = moduleSelect ? moduleSelect.value : '';

            const serialSelect = document.getElementById('activity-log-serial-select');
            const serialName = serialSelect ? serialSelect.value : '';

            const startInput = document.getElementById('activity-log-start-date');
            const endInput = document.getElementById('activity-log-end-date');
            const startDate = startInput ? startInput.value : '';
            const endDate = endInput ? endInput.value : '';

            let url = 'api/activity_log.php?action=get_logs&filter=' + this.activeFilter;
            if (userId) url += '&user_id=' + userId;
            if (moduleName) url += '&module_name=' + encodeURIComponent(moduleName);
            if (serialName) url += '&record_title=' + encodeURIComponent(serialName);
            if (this.activeFilter === 'date_range') {
                url += '&start_date=' + startDate + '&end_date=' + endDate;
            }

            fetch(url)
                .then(res => res.json())
                .then(data => {
                    if (refreshIcon) refreshIcon.classList.remove('fa-spin');

                    if (data.status === 'success') {
                        this.logs = data.logs || [];
                        this.users = data.users || [];

                        this.populateUsersDropdown();
                        this.updateStats(this.logs);
                        this.filterByAction('ALL');
                    } else {
                        this.showTableError(data.error || 'Failed to fetch logs');
                    }
                })
                .catch(err => {
                    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
                    this.showTableError(err.message || 'Network error fetching activity logs');
                });
        },

        /**
         * Filter logs in memory based on the clicked stats card (INSERT, UPDATE, DELETE, or ALL)
         */
        filterByAction: function(action) {
            this.currentActionFilter = action;

            // Define stats cards styling properties
            const cards = {
                'ALL': { id: 'activity-card-total', color: 'rgba(31, 78, 121, 0.15)', activeColor: '#1F4E79', shadow: 'rgba(31, 78, 121, 0.2)' },
                'INSERT': { id: 'activity-card-insert', color: 'rgba(40, 167, 69, 0.15)', activeColor: '#28a745', shadow: 'rgba(40, 167, 69, 0.2)' },
                'UPDATE': { id: 'activity-card-update', color: 'rgba(245, 166, 35, 0.15)', activeColor: '#e0a800', shadow: 'rgba(245, 166, 35, 0.2)' },
                'DELETE': { id: 'activity-card-delete', color: 'rgba(220, 53, 69, 0.15)', activeColor: '#dc3545', shadow: 'rgba(220, 53, 69, 0.2)' }
            };

            // Toggle visual styling to show active selection
            Object.keys(cards).forEach(key => {
                const cardEl = document.getElementById(cards[key].id);
                if (cardEl) {
                    cardEl.style.boxSizing = 'border-box';
                    if (key === action) {
                        cardEl.style.border = `2px solid ${cards[key].activeColor}`;
                        cardEl.style.boxShadow = `0 4px 12px ${cards[key].shadow}`;
                        cardEl.style.transform = 'none';
                        cardEl.style.background = key === 'ALL' ? 'rgba(31, 78, 121, 0.12)' : 
                                                 key === 'INSERT' ? 'rgba(40, 167, 69, 0.12)' :
                                                 key === 'UPDATE' ? 'rgba(245, 166, 35, 0.12)' : 'rgba(220, 53, 69, 0.12)';
                    } else {
                        cardEl.style.border = `1px solid ${cards[key].color}`;
                        cardEl.style.boxShadow = 'none';
                        cardEl.style.transform = 'none';
                        cardEl.style.background = key === 'ALL' ? 'rgba(31, 78, 121, 0.08)' : 
                                                 key === 'INSERT' ? 'rgba(40, 167, 69, 0.08)' :
                                                 key === 'UPDATE' ? 'rgba(245, 166, 35, 0.08)' : 'rgba(220, 53, 69, 0.08)';
                    }
                }
            });

            // Filter in-memory logs and render table
            let filteredLogs = this.logs;
            if (action !== 'ALL') {
                filteredLogs = this.logs.filter(log => log.action_type === action);
            }

            this.renderTable(filteredLogs);
        },

        /**
         * Populate the user filtering select list dynamically (once)
         */
        populateUsersDropdown: function() {
            if (this.usersLoaded) return;
            const select = document.getElementById('activity-log-user-select');
            if (!select) return;

            // Retain the first "All Users" option
            select.innerHTML = '<option value="">-- All Users --</option>';

            this.users.forEach(user => {
                const opt = document.createElement('option');
                opt.value = user.id;
                opt.textContent = `${user.username} (${user.role})`;
                select.appendChild(opt);
            });

            this.usersLoaded = true;
        },

        /**
         * Summate real-time log action metrics and update the stats banner cards
         */
        updateStats: function(logs) {
            let total = logs.length;
            let inserts = 0;
            let updates = 0;
            let deletes = 0;

            logs.forEach(log => {
                if (log.action_type === 'INSERT') inserts++;
                else if (log.action_type === 'UPDATE') updates++;
                else if (log.action_type === 'DELETE') deletes++;
            });

            const tEl = document.getElementById('activity-stats-total');
            const iEl = document.getElementById('activity-stats-insert');
            const uEl = document.getElementById('activity-stats-update');
            const dEl = document.getElementById('activity-stats-delete');

            if (tEl) tEl.textContent = total;
            if (iEl) iEl.textContent = inserts;
            if (uEl) uEl.textContent = updates;
            if (dEl) dEl.textContent = deletes;
        },

        /**
         * Draw the logs inside the tabular section
         */
        renderTable: function(logs) {
            const tbody = document.getElementById('activity-logs-tbody');
            if (!tbody) return;

            if (logs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="padding: 40px; text-align: center; color: #888;">
                            <i class="fas fa-history" style="font-size: 24px; color: #ccc; margin-bottom: 10px; display: block;"></i>
                            No activity logs found for the selected criteria.
                        </td>
                    </tr>
                `;
                return;
            }

            this.selectedRowIndex = -1; // Reset selection on new data render

            let html = '';
            logs.forEach((log, index) => {
                // Formatting Date & Time beautifully
                const logDate = new Date(log.created_at);
                const dateStr = logDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                const timeStr = logDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Action Badge
                let actionBadge = '';
                if (log.action_type === 'INSERT') {
                    actionBadge = `<span style="background: rgba(40,167,69,0.12); color: #28a745; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; min-width: 75px; text-align: center; border: 1px solid rgba(40,167,69,0.25);">INSERT</span>`;
                } else if (log.action_type === 'UPDATE') {
                    actionBadge = `<span style="background: rgba(245,166,35,0.12); color: #b27a00; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; min-width: 75px; text-align: center; border: 1px solid rgba(245,166,35,0.25);">UPDATE</span>`;
                } else if (log.action_type === 'DELETE') {
                    actionBadge = `<span style="background: rgba(220,53,69,0.12); color: #dc3545; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; min-width: 75px; text-align: center; border: 1px solid rgba(220,53,69,0.25);">DELETE</span>`;
                }

                // Category styling based on module
                let categoryHtml = '';
                const mod = log.module_name || '';
                if (mod.includes('Invoice')) {
                    categoryHtml = `<span style="color: #28a745; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-file-invoice-dollar" style="opacity: 0.8;"></i> ${mod}</span>`;
                } else if (mod.includes('Journal')) {
                    categoryHtml = `<span style="color: #1F4E79; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-book" style="opacity: 0.8;"></i> ${mod}</span>`;
                } else if (mod.includes('Payment')) {
                    categoryHtml = `<span style="color: #dc3545; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-money-bill-wave" style="opacity: 0.8;"></i> ${mod}</span>`;
                } else if (mod.includes('Receipt')) {
                    categoryHtml = `<span style="color: #17a2b8; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-hand-holding-usd" style="opacity: 0.8;"></i> ${mod}</span>`;
                } else {
                    categoryHtml = `<span style="color: #666; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-folder" style="opacity: 0.8;"></i> ${mod}</span>`;
                }

                html += `
                    <tr class="activity-log-row" style="border-bottom: 1px solid rgba(0,0,0,0.06); cursor: pointer;" onclick="window.ActivityLogModule.selectRow(${index})" ondblclick="window.ActivityLogModule.viewDetails(${log.id})">
                        <td style="padding: 4px 8px; font-size: 11px;">
                            <span style="font-weight: 600; color: #333; display: block;">${dateStr}</span>
                            <span style="font-size: 10px; color: #888;">${timeStr}</span>
                        </td>
                        <td style="padding: 4px 8px; font-weight: 500; color: #444; font-size: 11px;">
                            <span style="display: inline-flex; align-items: center; gap: 4px;">
                                <i class="far fa-user-circle" style="color: #999; font-size: 12px;"></i>
                                ${log.username}
                            </span>
                        </td>
                        <td style="padding: 4px 8px; font-size: 11px;">${categoryHtml}</td>
                        <td style="padding: 4px 8px; text-align: center;">${actionBadge}</td>
                        <td style="padding: 4px 8px; font-weight: bold; color: #1F4E79; font-size: 11px;">${log.record_title || 'N/A'}</td>
                        <td style="padding: 4px 8px; text-align: center;">
                            <button class="btn" style="background: rgba(31,78,121,0.08); border: 1px solid rgba(31,78,121,0.15); border-radius: 4px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; color: #1F4E79; cursor: pointer; transition: all 0.2s;" title="Trace Audit Comparison" onclick="window.ActivityLogModule.viewDetails(${log.id})">
                                <i class="fas fa-search-plus" style="font-size: 11px;"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;

            // Focus the scroll area so keyboard Up/Down arrows work without clicking
            const scrollArea = document.getElementById('activity-log-scroll-area');
            if (scrollArea) {
                scrollArea.focus({ preventScroll: true });
            }
        },

        /**
         * Render table error
         */
        showTableError: function(msg) {
            const tbody = document.getElementById('activity-logs-tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="padding: 40px; text-align: center; color: #dc3545;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                            Error: ${msg}
                        </td>
                    </tr>
                `;
            }
        },

        /**
         * Map of Database fields to readable user-facing column labels
         */
        keyLabels: {
            voucher_no: 'Voucher Number',
            voucher_date: 'Voucher Date',
            serial_no: 'Serial Number',
            ref_no: 'Reference Number',
            remarks: 'Remarks',
            total_amount: 'Total Amount',
            total_debit: 'Total Debit',
            total_credit: 'Total Credit',
            coa_id: 'Account/COA ID',
            account_id: 'Account ID',
            account_name: 'Account Name',
            debit: 'Debit',
            credit: 'Credit',
            description: 'Description',
            payment_date: 'Payment Date',
            receipt_date: 'Receipt Date',
            paid_to: 'Paid To',
            received_from: 'Received From',
            invoice_no: 'Invoice Number',
            invoice_date: 'Invoice Date',
            customer_id: 'Customer ID',
            customer_name: 'Customer Name',
            grand_total: 'Grand Total',
            discount: 'Discount',
            sales_tax: 'Sales Tax',
            net_amount: 'Net Amount',
            qty: 'Quantity',
            price: 'Price',
            rate: 'Rate',
            sub_total: 'Sub Total',
            narration: 'Narration',
            employee_id: 'Employee ID',
            employee_name: 'Employee Name',
            job_id: 'Job ID',
            job_title: 'Job Title',
            discount_amount: 'Discount Amount',
            wht_rate: 'WHT Rate (%)',
            wht_amount: 'WHT Amount',
            gst_rate: 'GST Rate (%)',
            gst_amount: 'GST Amount',
            advance_adjusted: 'Advance Adjusted',
            discount_received: 'Discount Received',
            total_debited: 'Total Debited',
            paid_amount: 'Paid Amount',
            bank_id: 'Bank ID',
            cheque_no: 'Cheque Number',
            cheque_date: 'Cheque Date',
            total_received: 'Total Received'
        },

        /**
         * Fetch friendly label for keys
         */
        getLabel: function(key) {
            if (this.keyLabels[key]) return this.keyLabels[key];
            return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        },

        /**
         * List of internal metadata DB fields to omit in diff reports
         */
        ignoredKeys: ['id', 'company_id', 'created_at', 'updated_at', 'user_id', 'created_by', 'updated_by', 'payment_id', 'receipt_id', 'voucher_id', 'invoice_id'],

        /**
         * Build high-fidelity visual comparatives and open the audit window popup
         */
        viewDetails: function(logId) {
            const log = this.logs.find(l => l.id == logId);
            if (!log) {
                alert('Secure log record could not be found locally.');
                return;
            }

            let before = null;
            let after = null;
            
            try {
                if (log.details_before) before = JSON.parse(log.details_before);
            } catch(e) { console.error('Failed to parse details_before JSON', e); }

            try {
                if (log.details_after) after = JSON.parse(log.details_after);
            } catch(e) { console.error('Failed to parse details_after JSON', e); }

            const beforeHeader = before && before.header ? before.header : null;
            const afterHeader = after && after.header ? after.header : null;
            const beforeItems = before && before.items ? before.items : [];
            const afterItems = after && after.items ? after.items : [];

            // Main Info Header
            let diffHtml = `
                <div style="font-family: 'Segoe UI', sans-serif; color: #333;">
                    <div style="background: linear-gradient(135deg, #1F4E79 0%, #153552 100%); color: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <span style="font-size: 11px; text-transform: uppercase; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px; font-weight: bold;">Audit Session Context</span>
                            <h3 style="margin: 5px 0 0 0; font-size: 18px; font-weight: 500;">
                                <i class="fas fa-user-shield" style="margin-right: 6px;"></i> ${log.username} performed <strong style="color: #F5A623;">${log.action_type}</strong> on ${log.module_name}
                            </h3>
                        </div>
                        <div style="text-align: right; font-size: 12px; opacity: 0.9;">
                            <div><i class="far fa-clock"></i> ${new Date(log.created_at).toLocaleString()}</div>
                            <div>ID: #${log.record_id || 'N/A'}</div>
                        </div>
                    </div>
            `;

            // Core state changes visualizer
            diffHtml += `<div style="display: flex; flex-direction: column; gap: 20px;">`;

            // SECTION 1: HEADER FIELD MODIFICATIONS
            diffHtml += `
                <div style="background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                    <h4 style="margin: 0 0 12px 0; color: #1F4E79; font-size: 15px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-heading"></i> Main Header & Document Data
                    </h4>
            `;

            if (log.action_type === 'INSERT') {
                // Newly inserted header fields list
                if (afterHeader) {
                    diffHtml += `<table style="width:100%; border-collapse:collapse; font-size:13px;">`;
                    diffHtml += `<tr style="background:#f8fafd; border-bottom:2px solid #e8eef3;"><th style="padding:10px; text-align:left;">Field</th><th style="padding:10px; text-align:left;">Created Value</th></tr>`;
                    for (const [key, val] of Object.entries(afterHeader)) {
                        if (this.ignoredKeys.includes(key) || val === null || val === '') continue;
                        diffHtml += `<tr style="border-bottom:1px solid #eee;">
                            <td style="padding:8px 10px; font-weight:600; color:#555;">${this.getLabel(key)}</td>
                            <td style="padding:8px 10px; background:rgba(40,167,69,0.05); color:#155724; font-weight:500;"><i class="fas fa-plus" style="font-size:10px; margin-right:4px;"></i> ${val}</td>
                        </tr>`;
                    }
                    diffHtml += `</table>`;
                } else {
                    diffHtml += `<p style="color:#666; font-style:italic; font-size:13px;">No header details captured.</p>`;
                }
            } else if (log.action_type === 'DELETE') {
                // Deleted header fields list
                if (beforeHeader) {
                    diffHtml += `<table style="width:100%; border-collapse:collapse; font-size:13px;">`;
                    diffHtml += `<tr style="background:#f8fafd; border-bottom:2px solid #e8eef3;"><th style="padding:10px; text-align:left;">Field</th><th style="padding:10px; text-align:left;">Deleted Value</th></tr>`;
                    for (const [key, val] of Object.entries(beforeHeader)) {
                        if (this.ignoredKeys.includes(key) || val === null || val === '') continue;
                        diffHtml += `<tr style="border-bottom:1px solid #eee;">
                            <td style="padding:8px 10px; font-weight:600; color:#555;">${this.getLabel(key)}</td>
                            <td style="padding:8px 10px; background:rgba(220,53,69,0.05); color:#721c24; text-decoration:line-through;"><i class="fas fa-minus" style="font-size:10px; margin-right:4px;"></i> ${val}</td>
                        </tr>`;
                    }
                    diffHtml += `</table>`;
                } else {
                    diffHtml += `<p style="color:#666; font-style:italic; font-size:13px;">No header details captured.</p>`;
                }
            } else {
                // UPDATE comparative analysis
                if (beforeHeader && afterHeader) {
                    let changedFields = [];
                    const allKeys = new Set([...Object.keys(beforeHeader), ...Object.keys(afterHeader)]);
                    
                    allKeys.forEach(key => {
                        if (this.ignoredKeys.includes(key)) return;
                        const bVal = beforeHeader[key] !== undefined ? beforeHeader[key] : '';
                        const aVal = afterHeader[key] !== undefined ? afterHeader[key] : '';
                        
                        // Normalise nulls/empty comparisons
                        const bCompare = bVal === null ? '' : String(bVal).trim();
                        const aCompare = aVal === null ? '' : String(aVal).trim();
                        
                        if (bCompare !== aCompare) {
                            changedFields.push({
                                key: key,
                                before: bVal === null ? '[Empty]' : bVal,
                                after: aVal === null ? '[Empty]' : aVal
                            });
                        }
                    });

                    if (changedFields.length > 0) {
                        diffHtml += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background: rgba(0,0,0,0.02); border-bottom: 2px solid rgba(0,0,0,0.08);">
                                    <th style="padding: 10px; text-align: left; font-weight:600; width:30%;">Field</th>
                                    <th style="padding: 10px; text-align: left; font-weight:600; color: #dc3545; background: rgba(220,53,69,0.03);">Before (Old Value)</th>
                                    <th style="padding: 10px; text-align: left; font-weight:600; color: #28a745; background: rgba(40,167,69,0.03);">After (New Value)</th>
                                </tr>
                            </thead>
                            <tbody>`;
                        
                        changedFields.forEach(field => {
                            diffHtml += `
                                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                                    <td style="padding: 10px; font-weight: 600; color: #555;">${this.getLabel(field.key)}</td>
                                    <td style="padding: 10px; color: #dc3545; background: rgba(220,53,69,0.01); text-decoration: line-through; font-family: monospace;">${field.before}</td>
                                    <td style="padding: 10px; color: #28a745; background: rgba(40,167,69,0.01); font-weight: 500; font-family: monospace;">${field.after}</td>
                                </tr>
                            `;
                        });
                        
                        diffHtml += `</tbody></table>`;
                    } else {
                        diffHtml += `<div style="padding: 10px; text-align: center; color: #777; background: #fafafa; border-radius: 6px; font-size: 12px; font-style: italic;">No core header fields were modified. Changes are in grid items below.</div>`;
                    }
                } else {
                    diffHtml += `<p style="color:#666; font-style:italic; font-size:13px;">Header snapshots missing.</p>`;
                }
            }
            diffHtml += `</div>`; // End Section 1

            // SECTION 2: GRID ROWS (ITEMS) MODIFICATIONS
            diffHtml += `
                <div style="background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                    <h4 style="margin: 0 0 12px 0; color: #1F4E79; font-size: 15px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-th-list"></i> Document Grid Rows & Items
                    </h4>
            `;

            if (log.action_type === 'INSERT') {
                if (afterItems && afterItems.length > 0) {
                    diffHtml += `<div style="display:flex; flex-direction:column; gap:10px;">`;
                    afterItems.forEach((item, index) => {
                        diffHtml += `<div style="border-left: 4px solid #28a745; background: rgba(40,167,69,0.02); padding: 10px; border-radius: 0 6px 6px 0; font-size: 12px;">
                            <strong style="color: #28a745; font-size:13px; display:block; margin-bottom:5px;">Added Row #${index + 1}</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:15px; color:#555;">`;
                        for (const [key, val] of Object.entries(item)) {
                            if (this.ignoredKeys.includes(key) || val === null || val === '') continue;
                            diffHtml += `<div><strong>${this.getLabel(key)}:</strong> <span style="font-family:monospace; color:#333;">${val}</span></div>`;
                        }
                        diffHtml += `</div></div>`;
                    });
                    diffHtml += `</div>`;
                } else {
                    diffHtml += `<p style="color:#777; font-style:italic; font-size:12px; margin:0;">No grid item transactions captured.</p>`;
                }
            } else if (log.action_type === 'DELETE') {
                if (beforeItems && beforeItems.length > 0) {
                    diffHtml += `<div style="display:flex; flex-direction:column; gap:10px;">`;
                    beforeItems.forEach((item, index) => {
                        diffHtml += `<div style="border-left: 4px solid #dc3545; background: rgba(220,53,69,0.02); padding: 10px; border-radius: 0 6px 6px 0; font-size: 12px; text-decoration: line-through; opacity: 0.85;">
                            <strong style="color: #dc3545; font-size:13px; display:block; margin-bottom:5px;">Deleted Row #${index + 1}</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:15px; color:#555;">`;
                        for (const [key, val] of Object.entries(item)) {
                            if (this.ignoredKeys.includes(key) || val === null || val === '') continue;
                            diffHtml += `<div><strong>${this.getLabel(key)}:</strong> <span style="font-family:monospace; color:#333;">${val}</span></div>`;
                        }
                        diffHtml += `</div></div>`;
                    });
                    diffHtml += `</div>`;
                } else {
                    diffHtml += `<p style="color:#777; font-style:italic; font-size:12px; margin:0;">No grid item transactions captured.</p>`;
                }
            } else {
                // UPDATE - Deep matching grid row items
                const beforeMap = {};
                const afterMap = {};

                beforeItems.forEach((it, idx) => {
                    const rowKey = it.id || `pos-${idx}`;
                    beforeMap[rowKey] = { index: idx, data: it };
                });

                afterItems.forEach((it, idx) => {
                    const rowKey = it.id || `pos-${idx}`;
                    afterMap[rowKey] = { index: idx, data: it };
                });

                const addedItems = [];
                const deletedItems = [];
                const modifiedItems = [];

                // Trace deleted and modified items
                for (const [key, itemInfo] of Object.entries(beforeMap)) {
                    if (!afterMap[key]) {
                        deletedItems.push(itemInfo);
                    } else {
                        // Compare item attributes
                        const beforeData = itemInfo.data;
                        const afterData = afterMap[key].data;
                        const itemChanges = [];

                        const allItemKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
                        allItemKeys.forEach(itemKey => {
                            if (this.ignoredKeys.includes(itemKey)) return;
                            const bVal = beforeData[itemKey] !== undefined ? beforeData[itemKey] : '';
                            const aVal = afterData[itemKey] !== undefined ? afterData[itemKey] : '';
                            
                            const bComp = bVal === null ? '' : String(bVal).trim();
                            const aComp = aVal === null ? '' : String(aVal).trim();

                            if (bComp !== aComp) {
                                itemChanges.push({
                                    key: itemKey,
                                    before: bVal === null ? '[Empty]' : bVal,
                                    after: aVal === null ? '[Empty]' : aVal
                                });
                            }
                        });

                        if (itemChanges.length > 0) {
                            modifiedItems.push({
                                rowNum: itemInfo.index + 1,
                                coaId: afterData.coa_id || beforeData.coa_id || '',
                                changes: itemChanges
                            });
                        }
                    }
                }

                // Trace added items
                for (const [key, itemInfo] of Object.entries(afterMap)) {
                    if (!beforeMap[key]) {
                        addedItems.push(itemInfo);
                    }
                }

                let hasGridChanges = false;

                diffHtml += `<div style="display:flex; flex-direction:column; gap:12px;">`;

                // Display Deleted rows
                if (deletedItems.length > 0) {
                    hasGridChanges = true;
                    deletedItems.forEach(itemInfo => {
                        diffHtml += `<div style="border-left: 4px solid #dc3545; background: rgba(220,53,69,0.02); padding: 10px; border-radius: 0 6px 6px 0; font-size: 12px; text-decoration: line-through; opacity: 0.8;">
                            <strong style="color: #dc3545; font-size:12px; display:block; margin-bottom:5px;"><i class="fas fa-minus-circle"></i> Deleted Row (Previous Row #${itemInfo.index + 1})</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:15px; color:#555;">`;
                        for (const [key, val] of Object.entries(itemInfo.data)) {
                            if (this.ignoredKeys.includes(key) || val === null || val === '') continue;
                            diffHtml += `<div><strong>${this.getLabel(key)}:</strong> <span style="font-family:monospace;">${val}</span></div>`;
                        }
                        diffHtml += `</div></div>`;
                    });
                }

                // Display Added rows
                if (addedItems.length > 0) {
                    hasGridChanges = true;
                    addedItems.forEach(itemInfo => {
                        diffHtml += `<div style="border-left: 4px solid #28a745; background: rgba(40,167,69,0.02); padding: 10px; border-radius: 0 6px 6px 0; font-size: 12px;">
                            <strong style="color: #28a745; font-size:12px; display:block; margin-bottom:5px;"><i class="fas fa-plus-circle"></i> Newly Added Row (Row #${itemInfo.index + 1})</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:15px; color:#555;">`;
                        for (const [key, val] of Object.entries(itemInfo.data)) {
                            if (this.ignoredKeys.includes(key) || val === null || val === '') continue;
                            diffHtml += `<div><strong>${this.getLabel(key)}:</strong> <span style="font-family:monospace; color:#333;">${val}</span></div>`;
                        }
                        diffHtml += `</div></div>`;
                    });
                }

                // Display Modified rows
                if (modifiedItems.length > 0) {
                    hasGridChanges = true;
                    modifiedItems.forEach(mInfo => {
                        diffHtml += `<div style="border-left: 4px solid #F5A623; background: rgba(245,166,35,0.02); padding: 10px; border-radius: 0 6px 6px 0; font-size: 12px;">
                            <strong style="color: #b27a00; font-size:12px; display:block; margin-bottom:5px;"><i class="fas fa-edit"></i> Modified Row #${mInfo.rowNum}</strong>
                            <div style="margin-top:6px; display:flex; flex-direction:column; gap:5px;">`;
                        
                        mInfo.changes.forEach(ch => {
                            diffHtml += `
                                <div style="display:flex; gap:10px; font-family:monospace; border-bottom:1px dashed rgba(0,0,0,0.04); padding-bottom:3px;">
                                    <span style="font-weight:600; width:150px; color:#555;">${this.getLabel(ch.key)}:</span>
                                    <span style="color:#dc3545; text-decoration:line-through;">${ch.before}</span>
                                    <span style="color:#666;">&rarr;</span>
                                    <span style="color:#28a745; font-weight:bold;">${ch.after}</span>
                                </div>
                            `;
                        });
                        
                        diffHtml += `</div></div>`;
                    });
                }

                if (!hasGridChanges) {
                    diffHtml += `<div style="padding: 10px; text-align: center; color: #777; background: #fafafa; border-radius: 6px; font-size: 12px; font-style: italic;">No grid row items were modified.</div>`;
                }

                diffHtml += `</div>`;
            }

            diffHtml += `</div>`; // End Section 2
            diffHtml += `</div></div>`; // End main diff wrap

            // Spawn secondary drag-and-drop window modal!
            window.openModal(
                { icon: 'fa-history', text: `Audit Comparison - ${log.record_title}` },
                diffHtml,
                true, // isWide
                null,
                false // isFull (false, standard overlay so they can compare logs list)
            );
        },

        clearHistory: async function() {
            if (!confirm("WARNING: Are you absolutely sure you want to permanently clear all user activity logs? This action cannot be undone.")) {
                return;
            }

            try {
                const response = await fetch('api/activity_log.php?action=clear_history');
                const data = await response.json();
                
                if (data.status === 'success') {
                    alert(data.message || "History cleared successfully.");
                    this.loadLogs();
                } else {
                    alert("Error clearing history: " + (data.error || "Unknown error"));
                }
            } catch (err) {
                console.error("Fetch error:", err);
                alert("Failed to clear history due to a network or server error.");
            }
        }
    };
})();
