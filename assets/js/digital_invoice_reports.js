/**
 * SoftifyX ERP - Digital Invoice Reports Module
 * Handles dashboard KPIs, monthly activity visual trends, invoice register, FBR status tracking, Credit/Debit notes, cancellations, and fiscal tax reconciliations.
 */

(function () {
    const DigitalInvoiceReportsModule = {
        data: {
            companyId: 1,
            company: {},
            settings: {},
            activeTab: 'dashboard',
            cache: {}
        },

        init: function () {
            const container = document.getElementById('digitalInvoiceReportsContainer');
            if (!container) return;

            // Set default date range to This Month
            this.setThisMonthDates();

            // Load Meta and then active report
            this.loadMeta(() => {
                this.loadDashboard();
            });

            // Fallback loadDashboard in case loadMeta takes time
            setTimeout(() => {
                const chartEl = document.getElementById('rpt_monthly_chart_bars');
                if (chartEl && chartEl.innerText.includes('Loading activity trends...')) {
                    this.loadDashboard();
                }
            }, 300);

            // Apply ERP Theme dynamically
            if (window.applyERPThemeToElement && window.getCurrentERPTheme) {
                const curTheme = window.getCurrentERPTheme();
                const modalContainer = container.closest('.modal-container');
                if (modalContainer) {
                    window.applyERPThemeToElement(modalContainer, curTheme);
                } else {
                    window.applyERPThemeToElement(container, curTheme);
                }
            }
        },

        loadMeta: function (callback) {
            fetch(`api/digital_invoice_reports.php?action=get_meta&company_id=${this.data.companyId}`)
                .then(r => r.json())
                .then(res => {
                    if (res && res.status === 'success') {
                        this.data.company = res.company || {};
                        this.data.settings = res.settings || {};
                    }
                })
                .catch(err => {
                    console.error('Error loading reports meta:', err);
                })
                .finally(() => {
                    if (typeof callback === 'function') callback();
                });
        },

        setThisMonthDates: function () {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');

            const firstDay = `${y}-${m}-01`;
            const today = `${y}-${m}-${d}`;

            this.setVal('rpt_date_from', firstDay);
            this.setVal('rpt_date_to', today);
            this.setVal('rpt_quick_date', 'this_month');
        },

        onQuickDateChange: function (val) {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const today = `${y}-${m}-${d}`;

            if (val === 'today') {
                this.setVal('rpt_date_from', today);
                this.setVal('rpt_date_to', today);
            } else if (val === 'this_week') {
                const cur = new Date();
                const first = cur.getDate() - cur.getDay() + 1; // Monday
                const mon = new Date(cur.setDate(first));
                this.setVal('rpt_date_from', mon.toISOString().split('T')[0]);
                this.setVal('rpt_date_to', today);
            } else if (val === 'this_month') {
                this.setVal('rpt_date_from', `${y}-${m}-01`);
                this.setVal('rpt_date_to', today);
            } else if (val === 'last_month') {
                const lastM = new Date(y, now.getMonth() - 1, 1);
                const lastMEnd = new Date(y, now.getMonth(), 0);
                this.setVal('rpt_date_from', lastM.toISOString().split('T')[0]);
                this.setVal('rpt_date_to', lastMEnd.toISOString().split('T')[0]);
            } else if (val === 'this_year') {
                this.setVal('rpt_date_from', `${y}-01-01`);
                this.setVal('rpt_date_to', today);
            } else if (val === 'all') {
                this.setVal('rpt_date_from', '');
                this.setVal('rpt_date_to', '');
            }

            this.refreshActiveReport();
        },

        clearFilters: function () {
            this.setVal('rpt_filter_q', '');
            this.setVal('rpt_filter_status', '');
            this.setThisMonthDates();
            this.refreshActiveReport();
        },

        refreshActiveReport: function () {
            const tab = this.data.activeTab;
            if (tab === 'dashboard') this.loadDashboard();
            else if (tab === 'register') this.loadRegister();
            else if (tab === 'submission_status') this.loadSubmissionStatus();
            else if (tab === 'credit_notes') this.loadCreditNotes();
            else if (tab === 'debit_notes') this.loadDebitNotes();
            else if (tab === 'cancellations') this.loadCancellations();
            else if (tab === 'tax_summary') this.loadTaxSummary();
            else if (tab === 'customer_summary') this.loadCustomerSummary();
            else if (tab === 'monthly_summary') this.loadMonthlySummary();
        },

        switchTab: function (tabName, btnEl) {
            this.data.activeTab = tabName;

            const container = document.getElementById('digitalInvoiceReportsContainer');
            const root = container || document;

            // Highlight tab button
            const tabs = root.querySelectorAll('.rpt-tab-btn');
            tabs.forEach(t => t.classList.remove('active'));
            if (btnEl) {
                btnEl.classList.add('active');
            } else {
                const matchBtn = Array.from(tabs).find(b => b.getAttribute('onclick')?.includes(`'${tabName}'`));
                if (matchBtn) matchBtn.classList.add('active');
            }

            // Hide all panes
            const panes = [
                'dashboard', 'register', 'submission_status', 'credit_notes',
                'debit_notes', 'cancellations', 'tax_summary', 'customer_summary', 'monthly_summary'
            ];
            panes.forEach(p => {
                const el = root.querySelector(`#tab_pane_${p}`);
                if (el) el.style.display = (p === tabName) ? 'block' : 'none';
            });

            this.refreshActiveReport();
        },

        // -------------------------------------------------------------------------
        // TAB 1: Dashboard Overview
        // -------------------------------------------------------------------------
        loadDashboard: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');

            const chartContainer = document.getElementById('rpt_monthly_chart_bars');
            if (chartContainer) {
                chartContainer.innerHTML = '<div style="text-align: center; color: #64748b; padding: 25px;"><i class="fas fa-spinner fa-spin"></i> Loading activity trends...</div>';
            }

            fetch(`api/digital_invoice_reports.php?action=get_dashboard_summary&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}`)
                .then(r => r.json())
                .then(res => {
                    if (res && res.status === 'success') {
                        const s = res.summary || {};

                        // Populate KPI cards
                        this.setText('kpi_tot_inv_count', s.total_invoices || 0);
                        this.setText('kpi_tot_inv_amt', 'PKR ' + parseFloat(s.total_invoice_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_fbr_acc_count', s.fbr_accepted_count || 0);
                        this.setText('kpi_fbr_acc_amt', 'PKR ' + parseFloat(s.fbr_accepted_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_pending_count', s.pending_fbr_count || 0);
                        this.setText('kpi_pending_amt', 'PKR ' + parseFloat(s.pending_fbr_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_rejected_count', s.fbr_rejected_count || 0);
                        this.setText('kpi_rejected_amt', 'PKR ' + parseFloat(s.fbr_rejected_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_cn_count', s.credit_notes_count || 0);
                        this.setText('kpi_cn_amt', 'PKR ' + parseFloat(s.total_credit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_dn_count', s.debit_notes_count || 0);
                        this.setText('kpi_dn_amt', 'PKR ' + parseFloat(s.total_debit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_cancel_count', s.cancelled_count || 0);
                        this.setText('kpi_cancel_amt', 'PKR ' + parseFloat(s.cancelled_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('kpi_sales_tax_tot', 'PKR ' + parseFloat(s.total_sales_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Quick Reconcile
                        const gross = parseFloat(s.total_invoice_amount || 0);
                        const credits = parseFloat(s.total_credit_amount || 0);
                        const debits = parseFloat(s.total_debit_amount || 0);
                        const net = gross - credits + debits;

                        this.setText('dash_reconcile_gross', 'PKR ' + gross.toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('dash_reconcile_credits', '- PKR ' + credits.toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('dash_reconcile_debits', '+ PKR ' + debits.toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('dash_reconcile_net', 'PKR ' + net.toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Render Monthly Visual Bars
                        this.renderMonthlyTrends(res.monthly_trends || []);
                    } else {
                        this.renderMonthlyTrends([]);
                    }
                })
                .catch(err => {
                    console.error('Error loading dashboard summary:', err);
                    this.renderMonthlyTrends([]);
                });
        },

        renderMonthlyTrends: function (trends) {
            const container = document.getElementById('rpt_monthly_chart_bars');
            if (!container) return;

            if (!trends || trends.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: #64748b; padding: 25px; font-size: 11px;"><i class="fas fa-info-circle"></i> No invoice transactions recorded in the past 6 months.</div>`;
                return;
            }

            const maxAmt = Math.max(...trends.map(t => parseFloat(t.inv_total || 0)), 1);

            container.innerHTML = trends.map(t => {
                const total = parseFloat(t.inv_total || 0);
                const tax = parseFloat(t.tax_total || 0);
                const count = parseInt(t.inv_count || 0);
                const subCount = parseInt(t.submitted_count || 0);
                const pct = Math.min(100, Math.max(5, (total / maxAmt) * 100));

                return `
                    <div style="font-size: 11px; margin-bottom: 6px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="font-weight: 700; color: #0f172a;">${t.month_label} (${count} Invoices, ${subCount} FBR Accepted)</span>
                            <span style="font-weight: 700; color: #1e3a8a;">PKR ${total.toLocaleString(undefined, {minimumFractionDigits: 2})} <span style="font-weight: normal; color: #15803d;">(Tax: PKR ${tax.toLocaleString(undefined, {minimumFractionDigits: 2})})</span></span>
                        </div>
                        <div style="height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; display: flex;">
                            <div style="width: ${pct}%; background: linear-gradient(90deg, #1F4E79, #0284c7); border-radius: 6px;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        },

        // -------------------------------------------------------------------------
        // TAB 2: Invoices Register
        // -------------------------------------------------------------------------
        loadRegister: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');
            const q = this.getVal('rpt_filter_q');
            const status = this.getVal('rpt_filter_status');

            const tbody = document.getElementById('rpt_register_tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 20px; color: #64748b;">Loading invoices register...</td></tr>`;
            }

            fetch(`api/digital_invoice_reports.php?action=get_invoice_register&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}&q=${encodeURIComponent(q)}&fbr_status=${status}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.invoices || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 20px; color: #64748b;">No matching invoices found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map((inv, idx) => {
                            const isCancelled = parseInt(inv.is_cancelled || 0, 10) === 1 || inv.workflow_status === 'Cancelled';
                            const isFbrSub = (inv.fbr_status === 'Submitted');

                            let pillCls = 'pill-pending';
                            if (isCancelled) pillCls = 'pill-cancelled';
                            else if (isFbrSub) pillCls = 'pill-submitted';
                            else if (inv.fbr_status === 'Failed' || inv.fbr_status === 'Rejected') pillCls = 'pill-failed';

                            return `
                                <tr style="border-bottom: 1px solid #e2e8f0; ${isCancelled ? 'opacity: 0.55;' : ''}">
                                    <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                                    <td style="font-weight: 700; color: #1e3a8a;">${inv.invoice_no}</td>
                                    <td style="text-align: center;">${inv.invoice_date}</td>
                                    <td>
                                        <div style="font-weight: 600; color: #0f172a;">${inv.customer_name}</div>
                                        <div style="font-size: 9.5px; color: #64748b;">${inv.customer_code || ''}</div>
                                    </td>
                                    <td>${inv.customer_ntn || inv.customer_cnic || 'N/A'}</td>
                                    <td>${inv.invoice_type || 'Tax Invoice'}</td>
                                    <td style="text-align: right;">${parseFloat(inv.taxable_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: right; color: #15803d;">${parseFloat(inv.total_sales_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: right; font-weight: 700; color: #0f172a;">${parseFloat(inv.net_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style="font-family: monospace; font-size: 10px;">${inv.fbr_invoice_no || '-'}</td>
                                    <td style="text-align: center;">
                                        <span class="fbr-status-pill ${pillCls}">${isCancelled ? 'Cancelled' : (inv.fbr_status || 'Draft')}</span>
                                    </td>
                                    <td style="text-align: center;">
                                        <button type="button" class="rpt-btn rpt-btn-blue" style="height: 20px; padding: 0 5px; font-size: 9.5px;" title="View FBR Log" onclick="window.DigitalInvoiceReportsModule.viewLog('${inv.invoice_no}', '${inv.fbr_response_code || ''}', '${encodeURIComponent(inv.fbr_response_msg || 'No details')}')">
                                            <i class="fas fa-terminal"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('');

                        // Totals
                        const tot = res.totals || {};
                        this.setText('reg_tot_taxable', parseFloat(tot.total_taxable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('reg_tot_tax', parseFloat(tot.total_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('reg_tot_net', parseFloat(tot.total_net || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                    }
                })
                .catch(() => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 20px; color: #dc2626;">Error loading register.</td></tr>`;
                });
        },

        // -------------------------------------------------------------------------
        // TAB 3: Submission Status Report
        // -------------------------------------------------------------------------
        loadSubmissionStatus: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');

            const grpTbody = document.getElementById('rpt_status_groups_tbody');
            const failTbody = document.getElementById('rpt_failed_invoices_tbody');

            fetch(`api/digital_invoice_reports.php?action=get_submission_status_report&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        // Groups
                        if (grpTbody) {
                            const groups = res.status_groups || [];
                            grpTbody.innerHTML = groups.map(g => `
                                <tr>
                                    <td style="font-weight: 700; color: #1e3a8a;">${g.status_group}</td>
                                    <td style="text-align: center; font-weight: 700;">${g.count}</td>
                                    <td style="text-align: right;">${parseFloat(g.total_taxable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: right;">${parseFloat(g.total_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style="text-align: right; font-weight: 700;">${parseFloat(g.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            `).join('');
                        }

                        // Failed / Rejected
                        if (failTbody) {
                            const errs = res.failed_rejected_invoices || [];
                            if (errs.length === 0) {
                                failTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #16a34a; font-weight: 600;">No failed or rejected invoices! All submitted invoices are accepted.</td></tr>`;
                            } else {
                                failTbody.innerHTML = errs.map(e => `
                                    <tr>
                                        <td style="font-weight: 700; color: #b91c1c;">${e.invoice_no}</td>
                                        <td style="text-align: center;">${e.invoice_date}</td>
                                        <td>${e.customer_name}</td>
                                        <td style="text-align: right; font-weight: 700;">${parseFloat(e.net_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td style="color: #b91c1c; font-size: 10px;"><b>${e.fbr_response_code || 'ERR'}:</b> ${e.fbr_response_msg || 'Unknown failure'}</td>
                                    </tr>
                                `).join('');
                            }
                        }
                    }
                });
        },

        // -------------------------------------------------------------------------
        // TAB 4: Credit Notes Report
        // -------------------------------------------------------------------------
        loadCreditNotes: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');
            const q = this.getVal('rpt_filter_q');
            const tbody = document.getElementById('rpt_credit_notes_tbody');

            fetch(`api/digital_invoice_reports.php?action=get_credit_notes_report&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.credit_notes || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 20px; color: #64748b;">No Credit Notes found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map((cn, idx) => `
                            <tr>
                                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                                <td style="font-weight: 700; color: #0284c7;">${cn.credit_note_no}</td>
                                <td style="text-align: center;">${cn.credit_note_date}</td>
                                <td style="font-weight: 600;">${cn.original_invoice_no}</td>
                                <td>${cn.customer_name}</td>
                                <td>${cn.customer_ntn || 'N/A'}</td>
                                <td>${cn.reason_text}</td>
                                <td style="text-align: right;">${parseFloat(cn.taxable_credit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; color: #b91c1c;">${parseFloat(cn.sales_tax_adjustment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 700; color: #1e3a8a;">${parseFloat(cn.total_credit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="font-family: monospace; font-size: 10px;">${cn.fbr_credit_note_no || '-'}</td>
                                <td style="text-align: center;">
                                    <span class="fbr-status-pill ${cn.fbr_status === 'Submitted' ? 'pill-submitted' : 'pill-pending'}">${cn.fbr_status}</span>
                                </td>
                            </tr>
                        `).join('');

                        const tot = res.totals || {};
                        this.setText('cn_tot_taxable_cell', parseFloat(tot.total_taxable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('cn_tot_tax_cell', parseFloat(tot.total_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('cn_tot_net_cell', parseFloat(tot.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                    }
                });
        },

        // -------------------------------------------------------------------------
        // TAB 5: Debit Notes Report
        // -------------------------------------------------------------------------
        loadDebitNotes: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');
            const q = this.getVal('rpt_filter_q');
            const tbody = document.getElementById('rpt_debit_notes_tbody');

            fetch(`api/digital_invoice_reports.php?action=get_debit_notes_report&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.debit_notes || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 20px; color: #64748b;">No Debit Notes found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map((dn, idx) => `
                            <tr>
                                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                                <td style="font-weight: 700; color: #7c3aed;">${dn.debit_note_no}</td>
                                <td style="text-align: center;">${dn.debit_note_date}</td>
                                <td style="font-weight: 600;">${dn.original_invoice_no}</td>
                                <td>${dn.customer_name}</td>
                                <td>${dn.customer_ntn || 'N/A'}</td>
                                <td>${dn.reason_text}</td>
                                <td style="text-align: right;">${parseFloat(dn.taxable_debit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; color: #15803d;">${parseFloat(dn.sales_tax_adjustment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 700; color: #1e3a8a;">${parseFloat(dn.total_debit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="font-family: monospace; font-size: 10px;">${dn.fbr_debit_note_no || '-'}</td>
                                <td style="text-align: center;">
                                    <span class="fbr-status-pill ${dn.fbr_status === 'Submitted' ? 'pill-submitted' : 'pill-pending'}">${dn.fbr_status}</span>
                                </td>
                            </tr>
                        `).join('');

                        const tot = res.totals || {};
                        this.setText('dn_tot_taxable_cell', parseFloat(tot.total_taxable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('dn_tot_tax_cell', parseFloat(tot.total_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('dn_tot_net_cell', parseFloat(tot.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                    }
                });
        },

        // -------------------------------------------------------------------------
        // TAB 6: Cancellations Report
        // -------------------------------------------------------------------------
        loadCancellations: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');
            const q = this.getVal('rpt_filter_q');
            const tbody = document.getElementById('rpt_cancellations_tbody');

            fetch(`api/digital_invoice_reports.php?action=get_cancellations_report&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.cancellations || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #64748b;">No cancelled invoices found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map((cr, idx) => `
                            <tr>
                                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                                <td style="font-weight: 700; color: #dc2626;">${cr.request_no}</td>
                                <td style="text-align: center;">${cr.request_date}</td>
                                <td style="font-weight: 700; color: #1e3a8a;">${cr.invoice_no}</td>
                                <td>${cr.customer_name}</td>
                                <td style="text-align: right; font-weight: 700; color: #dc2626;">${parseFloat(cr.invoice_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right;">${parseFloat(cr.total_sales_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: center; font-size: 10px;">${cr.cancellation_route}</td>
                                <td>${cr.reason_text}</td>
                                <td style="text-align: center;">
                                    <span class="fbr-status-pill ${cr.request_status === 'Cancellation Confirmed' ? 'pill-cancelled' : 'pill-pending'}">${cr.request_status}</span>
                                </td>
                                <td style="text-align: center;">${cr.fbr_cancellation_status}</td>
                            </tr>
                        `).join('');

                        const tot = res.totals || {};
                        this.setText('can_tot_net_cell', parseFloat(tot.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('can_tot_tax_cell', parseFloat(tot.total_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                    }
                });
        },

        // -------------------------------------------------------------------------
        // TAB 7: Tax Summary Report
        // -------------------------------------------------------------------------
        loadTaxSummary: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');

            this.setText('tax_rpt_period_label', (dFrom && dTo) ? `${dFrom} to ${dTo}` : 'All Records to Date');

            fetch(`api/digital_invoice_reports.php?action=get_tax_summary&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const t = res.tax_summary || {};
                        const inv = t.invoices || {};
                        const cn = t.credit_notes || {};
                        const dn = t.debit_notes || {};
                        const net = t.reconciled_net || {};

                        // Invoices
                        this.setText('tax_inv_count', inv.count || 0);
                        this.setText('tax_inv_taxable', parseFloat(inv.taxable_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_inv_st', parseFloat(inv.sales_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_inv_ft', parseFloat(inv.further_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_inv_tot', parseFloat(inv.gross_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Credit notes
                        this.setText('tax_cn_count', cn.count || 0);
                        this.setText('tax_cn_taxable', '(' + parseFloat(cn.taxable_reversal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ')');
                        this.setText('tax_cn_st', '(' + parseFloat(cn.sales_tax_reversal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ')');
                        this.setText('tax_cn_ft', '(' + parseFloat(cn.further_tax_reversal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ')');
                        this.setText('tax_cn_tot', '(' + parseFloat(cn.total_credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ')');

                        // Debit notes
                        this.setText('tax_dn_count', dn.count || 0);
                        this.setText('tax_dn_taxable', '+' + parseFloat(dn.taxable_addition || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_dn_st', '+' + parseFloat(dn.sales_tax_addition || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_dn_ft', '+' + parseFloat(dn.further_tax_addition || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_dn_tot', '+' + parseFloat(dn.total_debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Reconciled net
                        this.setText('tax_net_taxable', parseFloat(net.net_taxable_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_net_st', parseFloat(net.net_sales_tax_liability || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_net_ft', parseFloat(net.net_further_tax_liability || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('tax_net_tot', parseFloat(net.net_total_sales_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        this.setText('tax_net_payable_bold', 'PKR ' + parseFloat(net.net_sales_tax_liability || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }));
                    }
                });
        },

        // -------------------------------------------------------------------------
        // TAB 8: Customer Summary
        // -------------------------------------------------------------------------
        loadCustomerSummary: function () {
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');
            const tbody = document.getElementById('rpt_customer_summary_tbody');

            fetch(`api/digital_invoice_reports.php?action=get_customer_summary&company_id=${this.data.companyId}&date_from=${dFrom}&date_to=${dTo}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.customer_summary || [];
                        tbody.innerHTML = list.map((c, idx) => `
                            <tr>
                                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                                <td style="font-weight: 700;">${c.customer_code || '-'}</td>
                                <td style="font-weight: 600; color: #0f172a;">${c.customer_name}</td>
                                <td>${c.customer_ntn || 'N/A'}</td>
                                <td>${c.customer_type || 'Registered'}</td>
                                <td style="text-align: center; font-weight: 700;">${c.invoice_count}</td>
                                <td style="text-align: right;">${parseFloat(c.total_taxable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; color: #15803d;">${parseFloat(c.total_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 700; color: #1e3a8a;">${parseFloat(c.total_invoiced || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('');
                    }
                });
        },

        // -------------------------------------------------------------------------
        // TAB 9: Monthly Summary
        // -------------------------------------------------------------------------
        loadMonthlySummary: function () {
            const tbody = document.getElementById('rpt_monthly_summary_tbody');

            fetch(`api/digital_invoice_reports.php?action=get_monthly_summary&company_id=${this.data.companyId}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.monthly_summary || [];
                        tbody.innerHTML = list.map(m => `
                            <tr>
                                <td style="font-weight: 700; color: #1e3a8a;">${m.year_month}</td>
                                <td style="font-weight: 600;">${m.month_title}</td>
                                <td style="text-align: center; font-weight: 700;">${m.active_invoices}</td>
                                <td style="text-align: right;">${parseFloat(m.taxable_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; color: #15803d;">${parseFloat(m.sales_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 700;">${parseFloat(m.total_invoiced || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: center; color: #15803d; font-weight: 700;">${m.fbr_submitted_count}</td>
                                <td style="text-align: center; color: #b91c1c;">${m.cancelled_count}</td>
                            </tr>
                        `).join('');
                    }
                });
        },

        // -------------------------------------------------------------------------
        // Helpers, Log Modal, Export & Print
        // -------------------------------------------------------------------------
        viewLog: function (invNo, code, msg) {
            const modal = document.getElementById('rpt_log_modal');
            const content = document.getElementById('rpt_log_content');
            if (modal && content) {
                content.innerText = `Invoice Number: ${invNo}\nFBR Response Code: ${code || 'N/A'}\nStatus Message: ${decodeURIComponent(msg)}\nTimestamp: ${new Date().toLocaleString()}`;
                modal.style.display = 'flex';
            }
        },

        exportExcel: function () {
            let reportType = 'register';
            const tab = this.data.activeTab;
            if (tab === 'credit_notes') reportType = 'credit_notes';
            else if (tab === 'debit_notes') reportType = 'debit_notes';
            else if (tab === 'cancellations') reportType = 'cancellations';

            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');

            const url = `api/digital_invoice_reports.php?action=export_csv&company_id=${this.data.companyId}&report_type=${reportType}&date_from=${dFrom}&date_to=${dTo}`;
            window.open(url, '_blank');
        },

        printActiveReport: function () {
            const pane = document.getElementById(`tab_pane_${this.data.activeTab}`);
            if (!pane) return;

            const comp = this.data.company || {};
            const dFrom = this.getVal('rpt_date_from');
            const dTo = this.getVal('rpt_date_to');

            const w = window.open('', '_blank', 'width=1000,height=750');
            w.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${comp.company_name || 'ERP'} - Digital Invoice Report</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 25px; font-size: 11px; color: #1e293b; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                        th, td { border: 1px solid #cbd5e1; padding: 5px; }
                        th { background: #f1f5f9; text-align: left; }
                        .rpt-btn, button { display: none !important; }
                        @media print { .rpt-btn, button { display: none !important; } }
                    </style>
                </head>
                <body>
                    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between;">
                        <div>
                            <div style="font-size: 16px; font-weight: 800; color: #1F4E79;">${comp.company_name || 'SOFTIFYX FINANCIAL ERP'}</div>
                            <div style="font-size: 10.5px; color: #475569;">${comp.address || ''}</div>
                            <div style="font-size: 10.5px; color: #334155;">NTN: <b>${comp.ntn || 'N/A'}</b> &bull; STRN: <b>${comp.strn || 'N/A'}</b></div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 14px; font-weight: 800; color: #0284c7; text-transform: uppercase;">${this.data.activeTab.replace('_', ' ')}</div>
                            <div style="font-size: 10.5px; color: #475569;">Period: ${dFrom || 'Start'} to ${dTo || 'Today'}</div>
                            <div style="font-size: 10px; color: #64748b;">Printed on: ${new Date().toLocaleString()}</div>
                        </div>
                    </div>
                    ${pane.innerHTML}
                    <script>window.onload = function() { window.print(); };<\/script>
                </body>
                </html>
            `);
            w.document.close();
        },

        closeModal: function () {
            const container = document.getElementById('digitalInvoiceReportsContainer');
            if (!container) return;
            const modalContainer = container.closest('.modal-container');
            if (modalContainer) {
                const closeBtn = modalContainer.querySelector('.modal-controls .btn-close, .modal-header .btn-close, [onclick*="close"]');
                if (closeBtn) {
                    closeBtn.click();
                    return;
                }
                modalContainer.remove();
            }
        },

        getVal: function (id) {
            const container = document.getElementById('digitalInvoiceReportsContainer');
            const el = container ? (container.querySelector('#' + id) || document.getElementById(id)) : document.getElementById(id);
            return el ? el.value : '';
        },

        setVal: function (id, val) {
            const container = document.getElementById('digitalInvoiceReportsContainer');
            const el = container ? (container.querySelector('#' + id) || document.getElementById(id)) : document.getElementById(id);
            if (el) el.value = (val !== null && val !== undefined) ? val : '';
        },

        setText: function (id, val) {
            const container = document.getElementById('digitalInvoiceReportsContainer');
            const el = container ? (container.querySelector('#' + id) || document.getElementById(id)) : document.getElementById(id);
            if (el) el.innerText = (val !== null && val !== undefined) ? val : '';
        }
    };

    window.DigitalInvoiceReportsModule = DigitalInvoiceReportsModule;
})();
