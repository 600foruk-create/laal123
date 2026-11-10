window.POSDayClosingModule = {
    liveSummary: null,
    isSubmitting: false,
    currentClosingRecord: null,

    init: function() {
        this.liveSummary = null;
        this.isSubmitting = false;

        // Setup Date
        const dateInput = document.getElementById('dc_meta_date');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // Setup Cashier Name
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const cashierEl = document.getElementById('dc_meta_cashier');
        if (cashierEl) {
            cashierEl.textContent = session.name || session.username || 'Admin';
        }

        // Setup Terminal
        const terminalEl = document.getElementById('dc_meta_terminal');
        if (terminalEl) {
            terminalEl.textContent = window.location.hostname || 'POS-Terminal-1';
        }

        this.fetchBranches();
    },

    fetchBranches: async function() {
        const branchSelect = document.getElementById('dc_meta_branch');
        if (!branchSelect) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const isPosUser = session.role === 'POS' && session.branch_id;

        branchSelect.innerHTML = isPosUser ? '' : '<option value="">All Branches</option>';

        try {
            const compId = session.company_id || 1;
            const res = await fetch(`api/branch_settings.php?action=get_branches&company_id=${compId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.branches) {
                    data.branches.forEach(b => {
                        if (!isPosUser || String(b.id) === String(session.branch_id)) {
                            branchSelect.appendChild(new Option(`${b.branch_code} - ${b.branch_name}`, b.id));
                        }
                    });

                    if (isPosUser) {
                        branchSelect.value = session.branch_id;
                        branchSelect.disabled = true;
                        branchSelect.title = "Restricted to your assigned branch";
                        branchSelect.style.backgroundColor = '#e2e8f0';
                        branchSelect.style.cursor = 'not-allowed';
                        branchSelect.style.fontWeight = 'bold';
                    } else if (data.branches.length > 0) {
                        branchSelect.value = data.branches[0].id;
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching branches for Day Closing:', e);
        }

        this.loadLiveSummary();
    },

    loadLiveSummary: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const branchSelect = document.getElementById('dc_meta_branch');
        const branchId = branchSelect ? branchSelect.value : '';
        const dateInput = document.getElementById('dc_meta_date');
        const bDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

        try {
            let url = `api/pos_day_closing.php?action=get_live_closing_summary&company_id=${companyId}&date=${encodeURIComponent(bDate)}`;
            if (branchId) url += `&branch_id=${encodeURIComponent(branchId)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                this.liveSummary = data;
                this.renderSummary(data);
            } else {
                alert('Error loading live closing summary: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server for Day Closing summary.');
        }
    },

    renderSummary: function(data) {
        const s = data.sales_summary || {};
        const c = data.cash_reconciliation || {};
        const p = data.payment_breakdown || {};
        const f = data.fbr_summary || {};
        const h = data.pending_holds || {};

        // Meta Info
        const shiftStartEl = document.getElementById('dc_meta_shift_start');
        if (shiftStartEl) shiftStartEl.textContent = data.shift_start_time || '--';

        const statusBadge = document.getElementById('dc_meta_status_badge');
        const btnClose = document.getElementById('btnExecuteCloseShift');
        const closingNoEl = document.getElementById('dc_meta_closing_no');

        if (data.is_already_closed) {
            if (statusBadge) statusBadge.innerHTML = `<span class="pos-badge badge-closed"><i class="fas fa-check-circle"></i> Closed (${data.existing_closing_no})</span>`;
            if (closingNoEl) closingNoEl.textContent = data.existing_closing_no;
            if (btnClose) {
                btnClose.disabled = true;
                btnClose.innerHTML = '<i class="fas fa-lock"></i> Shift Closed';
                btnClose.style.background = '#6c757d';
                btnClose.style.borderColor = '#6c757d';
            }
        } else {
            if (statusBadge) statusBadge.innerHTML = `<span class="pos-badge badge-open"><i class="fas fa-clock"></i> Shift Open</span>`;
            if (closingNoEl) closingNoEl.textContent = 'CLS-Auto';
            if (btnClose) {
                btnClose.disabled = false;
                btnClose.innerHTML = '<i class="fas fa-check-circle"></i> Close Shift';
                btnClose.style.background = '#27ae60';
                btnClose.style.borderColor = '#27ae60';
            }
        }

        // 1. Sales Summary Card
        const invBadge = document.getElementById('dc_inv_count_badge');
        if (invBadge) invBadge.textContent = `${s.total_invoices_count || 0} Invoices`;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = `Rs ${parseFloat(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        };

        setTxt('dc_sum_gross', s.gross_sales);
        setTxt('dc_sum_discount', s.total_discount);
        setTxt('dc_sum_tax', s.tax_amount);
        setTxt('dc_sum_net', s.net_sales);

        const retCountEl = document.getElementById('dc_ret_count');
        if (retCountEl) retCountEl.textContent = `${s.total_returns_count || 0} returns`;
        setTxt('dc_ret_amount', s.total_returns_amount);

        const cancelCountEl = document.getElementById('dc_cancel_count');
        if (cancelCountEl) cancelCountEl.textContent = `${s.cancelled_invoices_count || 0} (Rs ${parseFloat(s.cancelled_invoices_amount || 0).toFixed(2)})`;

        setTxt('dc_net_transactions', s.net_transactions_amount);

        // 2. Payment Breakdown
        const setPm = (prefix, key) => {
            const item = p[key] || { count: 0, amount: 0 };
            const cntEl = document.getElementById(`${prefix}_cnt`);
            const amtEl = document.getElementById(`${prefix}_amt`);
            if (cntEl) cntEl.textContent = item.count || 0;
            if (amtEl) amtEl.textContent = `Rs ${parseFloat(item.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        };

        setPm('dc_pm_cash', 'Cash');
        setPm('dc_pm_card', 'Card');
        setPm('dc_pm_bank', 'Bank');
        setPm('dc_pm_qr', 'QR');
        setPm('dc_pm_credit', 'Credit');

        // 3. FBR Summary
        const setFbr = (id, count, amt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = `${count} Invoices (Rs ${parseFloat(amt || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
        };
        setFbr('dc_fbr_sub_cnt', f.submitted_count || 0, f.submitted_amount || 0);
        setFbr('dc_fbr_pend_cnt', f.pending_count || 0, f.pending_amount || 0);
        setFbr('dc_fbr_fail_cnt', f.failed_count || 0, f.failed_amount || 0);

        // 4. Cash Reconciliation
        setTxt('dc_rec_opening', c.opening_cash);
        setTxt('dc_rec_cash_sales', c.cash_sales);
        setTxt('dc_rec_cash_in', c.cash_in);
        setTxt('dc_rec_refunds', c.cash_refunds);
        setTxt('dc_rec_cash_out', c.cash_out);
        setTxt('dc_rec_expected', c.expected_cash);

        // If actual cash input hasn't been set yet, prefill with expected cash for cashier verification
        const actualInput = document.getElementById('dc_actual_cash_input');
        if (actualInput && (actualInput.value === '0.00' || actualInput.value === '' || actualInput.dataset.touched !== '1')) {
            actualInput.value = parseFloat(c.expected_cash || 0).toFixed(2);
        }

        // 5. Pending Holds Warning
        const holdAlert = document.getElementById('posHoldWarningAlert');
        const holdTxt = document.getElementById('posHoldWarningText');
        if (holdAlert && holdTxt) {
            const count = parseInt(h.count || 0);
            if (count > 0) {
                holdTxt.textContent = `There are ${count} pending Hold sale(s) totaling Rs ${parseFloat(h.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. Please resolve before closing shift.`;
                holdAlert.style.display = 'flex';
            } else {
                holdAlert.style.display = 'none';
            }
        }

        this.calculateDifference();
    },

    calculateDifference: function() {
        if (!this.liveSummary) return;
        const expected = parseFloat(this.liveSummary.cash_reconciliation?.expected_cash || 0);
        const actualInput = document.getElementById('dc_actual_cash_input');
        if (actualInput) actualInput.dataset.touched = '1';
        const actual = parseFloat(actualInput?.value || 0);

        const diff = actual - expected;
        const diffDisplay = document.getElementById('dc_diff_display');
        const titleEl = document.getElementById('dc_diff_title');
        const amtEl = document.getElementById('dc_diff_amount');

        if (!diffDisplay || !titleEl || !amtEl) return;

        diffDisplay.className = 'cash-diff-display';

        if (Math.abs(diff) < 0.01) {
            diffDisplay.classList.add('diff-balanced');
            titleEl.innerHTML = '<i class="fas fa-check-circle"></i> Drawer Perfectly Balanced';
            amtEl.textContent = 'Rs 0.00 Difference';
        } else if (diff < 0) {
            diffDisplay.classList.add('diff-short');
            titleEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Cash Shortage';
            amtEl.textContent = `- Rs ${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        } else {
            diffDisplay.classList.add('diff-excess');
            titleEl.innerHTML = '<i class="fas fa-arrow-circle-up"></i> Cash Excess';
            amtEl.textContent = `+ Rs ${diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }
    },

    toggleDenominations: function() {
        const drawer = document.getElementById('dc_denominations_drawer');
        if (!drawer) return;
        drawer.style.display = (drawer.style.display === 'none' || drawer.style.display === '') ? 'block' : 'none';
    },

    computeDenominations: function() {
        let total = 0;
        const inputs = document.querySelectorAll('.denom-input');
        inputs.forEach(inp => {
            const note = parseFloat(inp.getAttribute('data-note') || 0);
            const count = parseFloat(inp.value || 0);
            if (note > 0 && count > 0) {
                total += (note * count);
            }
        });

        const actualInput = document.getElementById('dc_actual_cash_input');
        if (actualInput) {
            actualInput.value = total.toFixed(2);
            this.calculateDifference();
        }
    },

    openCashMovementModal: function(type) {
        const modal = document.getElementById('posModalCashMovement');
        const typeSelect = document.getElementById('cm_type_select');
        const typeHidden = document.getElementById('cm_type');
        const title = document.getElementById('posCashMovementModalTitle');

        if (typeSelect) typeSelect.value = type;
        if (typeHidden) typeHidden.value = type;
        if (title) title.innerHTML = `<i class="fas fa-money-bill-wave"></i> Record ${type}`;

        const amtInp = document.getElementById('cm_amount');
        const reasonInp = document.getElementById('cm_reason');
        const refInp = document.getElementById('cm_ref');

        if (amtInp) amtInp.value = '';
        if (reasonInp) reasonInp.value = '';
        if (refInp) refInp.value = '';

        if (modal) modal.classList.add('show');
    },

    closeCashMovementModal: function() {
        const modal = document.getElementById('posModalCashMovement');
        if (modal) modal.classList.remove('show');
    },

    saveCashMovement: async function() {
        const type = document.getElementById('cm_type')?.value || 'Cash In';
        const amount = parseFloat(document.getElementById('cm_amount')?.value || 0);
        const reason = document.getElementById('cm_reason')?.value.trim();
        const ref = document.getElementById('cm_ref')?.value.trim();

        if (amount <= 0) {
            alert('Please enter a valid amount greater than zero.');
            return;
        }

        if (!reason) {
            alert('Please enter a reason or description for this cash movement.');
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const branchSelect = document.getElementById('dc_meta_branch');
        const branchId = branchSelect ? branchSelect.value : null;

        try {
            const res = await fetch('api/pos_day_closing.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'record_cash_movement',
                    company_id: session.company_id || 1,
                    branch_id: branchId,
                    movement_type: type,
                    amount: amount,
                    reason: reason,
                    reference_no: ref,
                    cashier_user_id: session.id || session.user_id || null,
                    cashier_name: session.name || session.username || 'Cashier'
                })
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.closeCashMovementModal();
                alert(data.message);
                this.loadLiveSummary();
            } else {
                alert('Error saving cash movement: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server to record cash movement.');
        }
    },

    openHoldRegister: function() {
        if (window.openModularPopup) {
            window.openModularPopup('Navigation/POS/pos_hold_register.html', 'fa-pause-circle', 'POS Hold / Recall Register', () => {
                if (window.POSHoldRegisterModule) window.POSHoldRegisterModule.init();
            }, 'POS Hold / Recall Register', true, true);
        } else if (window.loadView) {
            window.loadView('Navigation/POS/pos_hold_register.html');
        }
    },

    submitClosing: async function() {
        if (this.isSubmitting) return;

        if (!confirm('Kya aap waqai is POS shift ko close karna chahte hain?\n\nClosing ke baad is shift mein mazeed sales block ho jayen gi.')) {
            return;
        }

        if (!this.liveSummary) {
            alert('Summary not loaded yet. Please refresh summary first.');
            return;
        }

        const s = this.liveSummary.sales_summary || {};
        const c = this.liveSummary.cash_reconciliation || {};
        const h = this.liveSummary.pending_holds || {};

        // 1. Check Pending Holds
        const pendingHoldsCount = parseInt(h.count || 0);
        const overrideChecked = document.getElementById('dc_override_holds')?.checked;

        if (pendingHoldsCount > 0 && !overrideChecked) {
            alert(`Cannot close shift!\n\nThere are ${pendingHoldsCount} active Hold sales in this branch. Please resolve them in the Hold Register or check 'Authorize Override' to proceed.`);
            return;
        }

        // 2. Check Cash Difference Reason
        const actualCash = parseFloat(document.getElementById('dc_actual_cash_input')?.value || 0);
        const expectedCash = parseFloat(c.expected_cash || 0);
        const diff = actualCash - expectedCash;
        const diffReason = document.getElementById('dc_diff_reason')?.value.trim();

        if (Math.abs(diff) >= 1.00 && !diffReason) {
            alert(`A cash difference of Rs ${diff.toFixed(2)} is detected.\n\nPlease enter the reason for this Cash Difference before closing the shift.`);
            document.getElementById('dc_diff_reason')?.focus();
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const branchSelect = document.getElementById('dc_meta_branch');
        const branchId = branchSelect ? branchSelect.value : null;
        let branchName = '';
        if (branchSelect && branchSelect.selectedIndex >= 0) {
            branchName = branchSelect.options[branchSelect.selectedIndex].text;
        }

        const closingRemarks = document.getElementById('dc_closing_remarks')?.value.trim() || '';

        // Gather denominations if entered
        const denomObj = {};
        document.querySelectorAll('.denom-input').forEach(inp => {
            const note = inp.getAttribute('data-note');
            const cnt = parseFloat(inp.value || 0);
            if (cnt > 0) denomObj[note] = cnt;
        });

        const payload = {
            action: 'save_closing',
            company_id: session.company_id || 1,
            branch_id: branchId,
            branch_name: branchName,
            business_date: document.getElementById('dc_meta_date')?.value || new Date().toISOString().split('T')[0],
            terminal_info: window.location.hostname || 'POS-Terminal-1',
            cashier_user_id: session.id || session.user_id || null,
            cashier_name: session.name || session.username || 'Cashier',
            shift_start_time: this.liveSummary.shift_start_time,
            shift_status: 'Closed',
            closing_remarks: closingRemarks,
            diff_reason: diffReason,
            override_pending_holds: overrideChecked ? 1 : 0,
            sales_summary: s,
            cash_reconciliation: {
                opening_cash: parseFloat(c.opening_cash || 0),
                cash_sales: parseFloat(c.cash_sales || 0),
                customer_dues_cash: parseFloat(c.customer_dues_cash || 0),
                cash_in: parseFloat(c.cash_in || 0),
                cash_refunds: parseFloat(c.cash_refunds || 0),
                cash_out: parseFloat(c.cash_out || 0),
                expected_cash: expectedCash,
                actual_cash: actualCash
            },
            payment_breakdown: this.liveSummary.payment_breakdown || {},
            fbr_summary: this.liveSummary.fbr_summary || {},
            pending_holds_count: pendingHoldsCount,
            pending_holds_amount: parseFloat(h.amount || 0),
            denominations: denomObj
        };

        this.isSubmitting = true;
        const btnClose = document.getElementById('btnExecuteCloseShift');
        if (btnClose) btnClose.disabled = true;

        try {
            const res = await fetch('api/pos_day_closing.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`POS Shift Closed Successfully!\n\nClosing No: ${data.closing_no}\nClosing Time: ${data.closing_time}`);
                this.loadLiveSummary();
                // Prompt preview/print
                setTimeout(() => this.previewReport(), 400);
            } else if (data.status === 'warning_pending_holds') {
                alert(data.message);
            } else {
                alert('Error completing closing: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server to submit Day Closing.');
        } finally {
            this.isSubmitting = false;
            if (btnClose) btnClose.disabled = false;
        }
    },

    previewReport: function(closingRecord) {
        let rec = closingRecord;
        if (!rec && this.liveSummary) {
            const s = this.liveSummary.sales_summary || {};
            const c = this.liveSummary.cash_reconciliation || {};
            const p = this.liveSummary.payment_breakdown || {};
            const f = this.liveSummary.fbr_summary || {};
            const branchSelect = document.getElementById('dc_meta_branch');

            rec = {
                closing_no: document.getElementById('dc_meta_closing_no')?.textContent || 'CLS-LIVE',
                business_date: document.getElementById('dc_meta_date')?.value || new Date().toISOString().split('T')[0],
                branch_name: branchSelect && branchSelect.selectedIndex >= 0 ? branchSelect.options[branchSelect.selectedIndex].text : 'Main Branch',
                terminal_info: document.getElementById('dc_meta_terminal')?.textContent || 'POS-Terminal-1',
                cashier_name: document.getElementById('dc_meta_cashier')?.textContent || 'Admin',
                shift_start_time: this.liveSummary.shift_start_time || '--',
                closing_time: new Date().toLocaleString(),
                total_invoices_count: s.total_invoices_count || 0,
                gross_sales: s.gross_sales || 0,
                total_discount: s.total_discount || 0,
                tax_amount: s.tax_amount || 0,
                net_sales: s.net_sales || 0,
                total_returns_count: s.total_returns_count || 0,
                total_returns_amount: s.total_returns_amount || 0,
                net_transactions_amount: s.net_transactions_amount || 0,
                cash_sales: p['Cash']?.amount || s.cash_sales || 0,
                card_sales: p['Card']?.amount || s.card_sales || 0,
                bank_sales: p['Bank']?.amount || s.bank_sales || 0,
                qr_sales: p['QR']?.amount || s.qr_sales || 0,
                credit_sales: p['Credit']?.amount || s.credit_sales || 0,
                opening_cash: c.opening_cash || 0,
                cash_in: c.cash_in || 0,
                cash_refunds: c.cash_refunds || 0,
                cash_out: c.cash_out || 0,
                expected_cash: c.expected_cash || 0,
                actual_cash: parseFloat(document.getElementById('dc_actual_cash_input')?.value || c.expected_cash || 0),
                fbr_submitted_count: f.submitted_count || 0,
                fbr_pending_count: f.pending_count || 0,
                fbr_failed_count: f.failed_count || 0
            };
        }

        if (!rec) {
            alert('No closing data available to preview.');
            return;
        }

        const actualCash = parseFloat(rec.actual_cash || 0);
        const expectedCash = parseFloat(rec.expected_cash || 0);
        const diff = actualCash - expectedCash;
        let diffStatus = 'Balanced';
        if (diff < -0.01) diffStatus = `Short (-Rs ${Math.abs(diff).toFixed(2)})`;
        else if (diff > 0.01) diffStatus = `Excess (+Rs ${diff.toFixed(2)})`;

        const setP = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        const setPNum = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = parseFloat(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        };

        setP('prn_closing_no', rec.closing_no || 'CLS-0000');
        setP('prn_branch_name', rec.branch_name || 'Main Branch');
        setP('prn_date', rec.business_date || '');
        setP('prn_terminal', rec.terminal_info || 'POS-1');
        setP('prn_cashier', rec.cashier_name || 'Cashier');
        setP('prn_shift_start', rec.shift_start_time || '--');
        setP('prn_shift_closed', rec.closing_time || rec.formatted_closing_time || '--');

        setP('prn_inv_count', rec.total_invoices_count || 0);
        setPNum('prn_gross', rec.gross_sales);
        setPNum('prn_disc', rec.total_discount);
        setPNum('prn_tax', rec.tax_amount);
        setPNum('prn_net', rec.net_sales);
        setP('prn_ret_count', rec.total_returns_count || 0);
        setPNum('prn_ret_amt', rec.total_returns_amount);
        setPNum('prn_revenue', rec.net_transactions_amount);

        setPNum('prn_pm_cash', rec.cash_sales);
        setPNum('prn_pm_card', rec.card_sales);
        setPNum('prn_pm_bank', rec.bank_sales);
        setPNum('prn_pm_qr', rec.qr_sales);
        setPNum('prn_pm_credit', rec.credit_sales);

        setPNum('prn_rec_opening', rec.opening_cash);
        setPNum('prn_rec_cash_sales', rec.cash_sales);
        setPNum('prn_rec_cash_in', rec.cash_in);
        setPNum('prn_rec_refunds', rec.cash_refunds);
        setPNum('prn_rec_cash_out', rec.cash_out);
        setPNum('prn_rec_expected', rec.expected_cash);
        setPNum('prn_rec_actual', rec.actual_cash);
        setPNum('prn_rec_diff', diff);
        setP('prn_rec_status', diffStatus);

        setP('prn_fbr_sub', `${rec.fbr_submitted_count || 0} Invoices`);
        setP('prn_fbr_pend', `${rec.fbr_pending_count || 0} Invoices`);
        setP('prn_fbr_fail', `${rec.fbr_failed_count || 0} Invoices`);

        const modal = document.getElementById('posModalClosingPreview');
        if (modal) modal.classList.add('show');
    },

    closePreviewModal: function() {
        const modal = document.getElementById('posModalClosingPreview');
        if (modal) modal.classList.remove('show');
    },

    openHistoryModal: function() {
        const modal = document.getElementById('posModalClosingHistory');
        if (modal) modal.classList.add('show');
        this.loadHistoryRecords();
    },

    closeHistoryModal: function() {
        const modal = document.getElementById('posModalClosingHistory');
        if (modal) modal.classList.remove('show');
    },

    loadHistoryRecords: async function() {
        const tbody = document.getElementById('hist_table_body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 25px; color:#a0aec0;"><i class="fas fa-spinner fa-spin"></i> Loading closing records...</td></tr>`;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const sVal = document.getElementById('hist_search')?.value.trim() || '';
        const fVal = document.getElementById('hist_from')?.value || '';
        const tVal = document.getElementById('hist_to')?.value || '';

        try {
            let url = `api/pos_day_closing.php?action=get_closings_history&company_id=${companyId}`;
            if (session.role === 'POS' && session.branch_id) {
                url += `&branch_id=${encodeURIComponent(session.branch_id)}`;
            }
            if (sVal) url += `&search=${encodeURIComponent(sVal)}`;
            if (fVal) url += `&from_date=${encodeURIComponent(fVal)}`;
            if (tVal) url += `&to_date=${encodeURIComponent(tVal)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success' && data.records) {
                if (data.records.length === 0) {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 25px; color:#718096;">No past closing records found.</td></tr>`;
                    return;
                }

                tbody.innerHTML = data.records.map(r => {
                    const diff = parseFloat(r.cash_difference || 0);
                    let diffColor = '#16a34a';
                    if (diff < -0.01) diffColor = '#dc2626';
                    else if (diff > 0.01) diffColor = '#d97706';

                    return `
                        <tr style="border-bottom: 1px solid #edf2f7;">
                            <td style="padding: 8px 10px; font-weight: 700; color: #1F4E79;">${r.closing_no}</td>
                            <td style="padding: 8px 10px;">${r.business_date}</td>
                            <td style="padding: 8px 10px;">${r.branch_name || 'Main Branch'}</td>
                            <td style="padding: 8px 10px;">${r.cashier_name || 'Cashier'}</td>
                            <td style="padding: 8px 10px; text-align: right; font-weight: 600;">Rs ${parseFloat(r.net_sales || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td style="padding: 8px 10px; text-align: right;">Rs ${parseFloat(r.expected_cash || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td style="padding: 8px 10px; text-align: right; font-weight: 700;">Rs ${parseFloat(r.actual_cash || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${diffColor};">Rs ${diff.toFixed(2)}</td>
                            <td style="padding: 8px 10px; text-align: center;"><span class="pos-badge badge-closed">${r.shift_status}</span></td>
                            <td style="padding: 8px 10px; text-align: center;">
                                <button type="button" class="btn btn-outline-primary btn-sm" style="padding: 2px 8px; font-size: 11px;" onclick="window.POSDayClosingModule.viewHistoryDetail(${r.id})">
                                    <i class="fas fa-print"></i> View
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#e53e3e; padding: 20px;">Error: ${data.message}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#e53e3e; padding: 20px;">Failed to load closing history.</td></tr>`;
        }
    },

    viewHistoryDetail: async function(closingId) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/pos_day_closing.php?action=get_closing_details&id=${closingId}&company_id=${companyId}`);
            const data = await res.json();

            if (data.status === 'success' && data.closing) {
                this.previewReport(data.closing);
            } else {
                alert('Cannot load details: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server.');
        }
    }
};
