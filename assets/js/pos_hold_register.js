window.POSHoldRegisterModule = {
    currentPage: 1,
    perPage: 25,
    totalPages: 1,
    totalRecords: 0,
    currentRecords: [],
    selectedHoldForModal: null,
    targetCancelHoldId: null,

    init: function() {
        this.currentPage = 1;
        this.fetchBranches();
        this.loadHolds();
    },

    fetchBranches: async function() {
        const branchSelect = document.getElementById('pos_hfilter_branch');
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
                    }
                }
            }
        } catch(e) {
            console.error('Error fetching branches in hold register:', e);
        }
    },

    loadHolds: async function(page) {
        if (page) this.currentPage = page;

        const tbody = document.getElementById('posHoldRegisterTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" style="text-align: center; padding: 40px; color: #a0aec0;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
                        <div style="margin-top: 8px;">Loading hold sales register...</div>
                    </td>
                </tr>
            `;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const isPosUser = session.role === 'POS' && session.branch_id;

        const search = document.getElementById('pos_hfilter_search')?.value.trim() || '';
        const status = document.getElementById('pos_hfilter_status')?.value || 'all';
        let branchId = document.getElementById('pos_hfilter_branch')?.value || '';
        if (isPosUser) {
            branchId = session.branch_id;
        }
        const fromDate = document.getElementById('pos_hfilter_from')?.value || '';
        const toDate = document.getElementById('pos_hfilter_to')?.value || '';

        let url = `api/pos_hold_sale.php?action=get_hold_register&company_id=${companyId}&page=${this.currentPage}&limit=${this.perPage}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status && status !== 'all') url += `&status=${encodeURIComponent(status)}`;
        if (branchId) url += `&branch_id=${encodeURIComponent(branchId)}`;
        if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
        if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                this.currentRecords = data.records || [];
                this.updateSummaryCards(data.summary || {});
                this.renderTable(this.currentRecords);
                this.updatePagination(data.pagination || {});
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #e53e3e; padding: 30px;">Error: ${data.message}</td></tr>`;
            }
        } catch(e) {
            console.error(e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #e53e3e; padding: 30px;">Failed to connect to server.</td></tr>`;
        }
    },

    updateSummaryCards: function(summary) {
        const totalCount = parseInt(summary.total_holds) || 0;
        const totalAmt = parseFloat(summary.total_amount) || 0;
        const onHoldCount = parseInt(summary.on_hold_count) || 0;
        const onHoldAmt = parseFloat(summary.on_hold_amount) || 0;
        const recalledCount = parseInt(summary.recalled_count) || 0;
        const recalledAmt = parseFloat(summary.recalled_amount) || 0;
        const completedCount = parseInt(summary.completed_count) || 0;
        const completedAmt = parseFloat(summary.completed_amount) || 0;
        const cancelledCount = parseInt(summary.cancelled_count) || 0;
        const cancelledAmt = parseFloat(summary.cancelled_amount) || 0;

        const setCard = (idCount, idAmt, count, amt) => {
            const elC = document.getElementById(idCount);
            const elA = document.getElementById(idAmt);
            if (elC) elC.textContent = count.toLocaleString();
            if (elA) elA.textContent = `Rs ${amt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        };

        setCard('pos_hsum_total_count', 'pos_hsum_total_amt', totalCount, totalAmt);
        setCard('pos_hsum_on_hold_count', 'pos_hsum_on_hold_amt', onHoldCount, onHoldAmt);
        setCard('pos_hsum_recalled_count', 'pos_hsum_recalled_amt', recalledCount, recalledAmt);
        setCard('pos_hsum_completed_count', 'pos_hsum_completed_amt', completedCount, completedAmt);
        setCard('pos_hsum_cancelled_count', 'pos_hsum_cancelled_amt', cancelledCount, cancelledAmt);
    },

    renderTable: function(records) {
        const tbody = document.getElementById('posHoldRegisterTableBody');
        if (!tbody) return;

        if (records.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" style="text-align: center; padding: 45px 20px; color: #718096;">
                        <i class="fas fa-search" style="font-size: 32px; color: #cbd5e0; margin-bottom: 8px;"></i>
                        <div style="font-weight: 600; font-size: 14px;">No Hold Records Found</div>
                        <div style="font-size: 12px; color: #a0aec0; margin-top: 4px;">Try adjusting your search criteria or date filters.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = records.map(r => {
            let statusBadge = '';
            if (r.status === 'On Hold') {
                statusBadge = `<span class="pos-badge badge-on-hold"><i class="fas fa-pause-circle"></i> On Hold</span>`;
            } else if (r.status === 'Recalled') {
                statusBadge = `<span class="pos-badge badge-recalled"><i class="fas fa-history"></i> Recalled</span>`;
            } else if (r.status === 'Completed') {
                statusBadge = `<span class="pos-badge badge-completed"><i class="fas fa-check-circle"></i> Completed</span>`;
            } else if (r.status === 'Cancelled') {
                statusBadge = `<span class="pos-badge badge-cancelled"><i class="fas fa-times-circle"></i> Cancelled</span>`;
            }

            const canRecall = (r.status === 'On Hold' || r.status === 'Recalled');
            const canCancel = (r.status === 'On Hold' || r.status === 'Recalled');

            return `
                <tr style="border-bottom: 1px solid #edf2f7; transition: background 0.15s;" onmouseover="this.style.background='#f7fafc'" onmouseout="this.style.background='white'">
                    <td style="padding: 8px 10px; font-weight: 700; color: #1F4E79;">
                        ${r.hold_no}
                    </td>
                    <td style="padding: 8px 10px; color: #4a5568;">
                        ${r.hold_date || (r.formatted_datetime ? r.formatted_datetime.split(' ')[0] : '--')}
                    </td>
                    <td style="padding: 8px 10px;">
                        <strong style="color: #2d3748;">${r.customer_name || 'Walk-in Customer'}</strong>
                        ${r.customer_mobile ? `<div style="font-size: 11px; color: #718096;">${r.customer_mobile}</div>` : ''}
                        ${r.hold_reason ? `<div style="font-size: 10px; color: #b45309; font-style: italic;"><i class="fas fa-comment-alt"></i> ${r.hold_reason}</div>` : ''}
                    </td>
                    <td style="padding: 8px 10px; color: #4a5568;">
                        ${r.branch_name || 'Main Branch'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 600;">
                        ${r.items_count}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; color: #4a5568;">
                        ${parseFloat(r.subtotal || 0).toFixed(2)}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; color: #e53e3e;">
                        ${parseFloat(r.discount || 0).toFixed(2)}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #d97706;">
                        Rs ${parseFloat(r.net_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                    <td style="padding: 8px 10px; color: #4a5568; font-size: 11px;">
                        ${r.cashier_name || 'Cashier'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 8px 10px; font-weight: 700; color: #16a34a;">
                        ${r.final_invoice_no ? `<i class="fas fa-check"></i> ${r.final_invoice_no}` : '<span style="color:#a0aec0; font-weight:normal;">--</span>'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center;">
                        ${canRecall ? `
                            <button type="button" class="pos-action-btn pos-btn-recall" title="Recall into POS Sale" onclick="window.POSHoldRegisterModule.recallFromRegister(${r.id})">
                                <i class="fas fa-download"></i> Recall
                            </button>
                        ` : ''}
                        <button type="button" class="pos-action-btn pos-btn-view" title="View details" onclick="window.POSHoldRegisterModule.viewDetails(${r.id})">
                            <i class="fas fa-eye"></i> View
                        </button>
                        ${canCancel ? `
                            <button type="button" class="pos-action-btn pos-btn-cancel" title="Cancel this hold" onclick="window.POSHoldRegisterModule.openCancelModal(${r.id}, '${r.hold_no}')">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    },

    updatePagination: function(pag) {
        this.totalPages = pag.total_pages || 1;
        this.totalRecords = pag.total_records || 0;

        const startIdx = this.totalRecords === 0 ? 0 : ((this.currentPage - 1) * this.perPage) + 1;
        const endIdx = Math.min(this.currentPage * this.perPage, this.totalRecords);

        const sEl = document.getElementById('pos_hpag_start');
        const eEl = document.getElementById('pos_hpag_end');
        const tEl = document.getElementById('pos_hpag_total');

        if (sEl) sEl.textContent = startIdx;
        if (eEl) eEl.textContent = endIdx;
        if (tEl) tEl.textContent = this.totalRecords;

        const controls = document.getElementById('posHoldPaginationControls');
        if (!controls) return;

        let html = '';
        html += `<button type="button" class="pos-pag-btn" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="window.POSHoldRegisterModule.loadHolds(${this.currentPage - 1})"><i class="fas fa-chevron-left"></i> Prev</button>`;

        const maxButtons = 5;
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(this.totalPages, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            html += `<button type="button" class="pos-pag-btn ${p === this.currentPage ? 'active' : ''}" onclick="window.POSHoldRegisterModule.loadHolds(${p})">${p}</button>`;
        }

        html += `<button type="button" class="pos-pag-btn" ${this.currentPage >= this.totalPages ? 'disabled' : ''} onclick="window.POSHoldRegisterModule.loadHolds(${this.currentPage + 1})">Next <i class="fas fa-chevron-right"></i></button>`;
        controls.innerHTML = html;
    },

    applyFilters: function() {
        this.currentPage = 1;
        this.loadHolds();
    },

    resetFilters: function() {
        const sEl = document.getElementById('pos_hfilter_search');
        const stEl = document.getElementById('pos_hfilter_status');
        const bEl = document.getElementById('pos_hfilter_branch');
        const fEl = document.getElementById('pos_hfilter_from');
        const tEl = document.getElementById('pos_hfilter_to');

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const isPosUser = session.role === 'POS' && session.branch_id;

        if (sEl) sEl.value = '';
        if (stEl) stEl.value = 'all';
        if (bEl) bEl.value = isPosUser ? session.branch_id : '';
        if (fEl) fEl.value = '';
        if (tEl) tEl.value = '';

        this.currentPage = 1;
        this.loadHolds();
    },

    openNewSale: function() {
        if (window.openModularPopup) {
            window.openModularPopup('Navigation/POS/pos_sale.html', 'fa-cart-plus', 'Sale Invoice', () => {
                if (window.POSModule) window.POSModule.init();
            }, 'Sale Invoice', true, true);
        } else if (window.loadView) {
            window.loadView('Navigation/POS/pos_sale.html');
        }
    },

    recallFromRegister: function(holdId) {
        // Open POS Sale and recall this hold
        const doRecall = () => {
            if (window.POSModule) {
                window.POSModule.recallHold(holdId);
            } else {
                setTimeout(() => window.POSModule && window.POSModule.recallHold(holdId), 300);
            }
        };

        if (window.openModularPopup) {
            window.openModularPopup('Navigation/POS/pos_sale.html', 'fa-cart-plus', 'Sale Invoice', () => {
                if (window.POSModule) {
                    window.POSModule.init();
                    setTimeout(doRecall, 200);
                }
            }, 'Sale Invoice', true, true);
        } else if (window.loadView) {
            window.loadView('Navigation/POS/pos_sale.html');
            setTimeout(doRecall, 300);
        }
    },

    viewDetails: async function(holdId) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/pos_hold_sale.php?action=get_hold_details&hold_id=${holdId}&company_id=${companyId}`);
            const data = await res.json();

            if (data.status === 'success' && data.hold) {
                this.selectedHoldForModal = data.hold;
                const h = data.hold;

                document.getElementById('posDetHoldNo').textContent = h.hold_no;
                document.getElementById('posDetCustName').textContent = h.customer_name || 'Walk-in Customer';
                document.getElementById('posDetDateTime').textContent = h.hold_date || (h.formatted_datetime ? h.formatted_datetime.split(' ')[0] : '--');
                document.getElementById('posDetBranch').textContent = h.branch_name || 'Main Branch';
                document.getElementById('posDetCashier').textContent = h.cashier_name || 'Cashier';
                document.getElementById('posDetReason').textContent = h.hold_reason || 'Temporary Hold';
                document.getElementById('posDetStatus').innerHTML = `<strong>${h.status}</strong>`;
                document.getElementById('posDetFinalInvoice').textContent = h.final_invoice_no || 'Pending';
                document.getElementById('posDetRecalledAt').textContent = h.recalled_at || 'Not yet recalled';

                // Items Table
                const tbody = document.getElementById('posDetItemsTableBody');
                if (tbody) {
                    const items = h.items || [];
                    tbody.innerHTML = items.map((itm, idx) => `
                        <tr style="border-bottom: 1px solid #edf2f7;">
                            <td style="padding: 6px 10px; color: #718096;">${idx + 1}</td>
                            <td style="padding: 6px 10px; font-weight: 600;">${itm.item_code || ''}</td>
                            <td style="padding: 6px 10px;">${itm.description || ''}</td>
                            <td style="padding: 6px 10px; text-align: right;">${parseFloat(itm.pieces || 0).toFixed(2)}</td>
                            <td style="padding: 6px 10px; text-align: right; font-weight: 600;">${parseFloat(itm.quantity || 0).toFixed(2)}</td>
                            <td style="padding: 6px 10px;">${itm.unit || 'pcs'}</td>
                            <td style="padding: 6px 10px; text-align: right;">${parseFloat(itm.rate || 0).toFixed(2)}</td>
                            <td style="padding: 6px 10px; text-align: right;">${parseFloat(itm.sales_tax_amount || 0).toFixed(2)}</td>
                            <td style="padding: 6px 10px; text-align: right; font-weight: bold; color: #1F4E79;">Rs ${parseFloat(itm.val_incl_tax || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    `).join('');
                }

                // Totals
                document.getElementById('posDetSubtotal').textContent = `Rs ${parseFloat(h.subtotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                document.getElementById('posDetDiscount').textContent = `Rs ${parseFloat(h.discount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                document.getElementById('posDetTax').textContent = `Rs ${parseFloat(h.tax_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                document.getElementById('posDetNetTotal').textContent = `Rs ${parseFloat(h.net_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

                // Recall Button visibility
                const btnRecall = document.getElementById('btnModalRecallAction');
                if (btnRecall) {
                    if (h.status === 'On Hold' || h.status === 'Recalled') {
                        btnRecall.style.display = 'inline-flex';
                    } else {
                        btnRecall.style.display = 'none';
                    }
                }

                const modal = document.getElementById('posModalHoldDetails');
                if (modal) modal.classList.add('show');
            } else {
                alert('Cannot load hold details: ' + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error(e);
            alert('Failed to fetch hold details from server.');
        }
    },

    closeDetailsModal: function() {
        const modal = document.getElementById('posModalHoldDetails');
        if (modal) modal.classList.remove('show');
    },

    recallFromModal: function() {
        if (!this.selectedHoldForModal) return;
        const holdId = this.selectedHoldForModal.id;
        this.closeDetailsModal();
        this.recallFromRegister(holdId);
    },

    openCancelModal: function(holdId, holdNo) {
        this.targetCancelHoldId = holdId;
        const noEl = document.getElementById('posCancelHoldNo');
        const reasonInput = document.getElementById('posCancelReasonInput');
        if (noEl) noEl.textContent = holdNo;
        if (reasonInput) reasonInput.value = '';

        const modal = document.getElementById('posModalCancelHold');
        if (modal) modal.classList.add('show');
    },

    closeCancelModal: function() {
        this.targetCancelHoldId = null;
        const modal = document.getElementById('posModalCancelHold');
        if (modal) modal.classList.remove('show');
    },

    confirmCancelHold: async function() {
        if (!this.targetCancelHoldId) return;

        const reason = document.getElementById('posCancelReasonInput')?.value.trim() || 'Cancelled by Cashier';
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');

        try {
            const res = await fetch('api/pos_hold_sale.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'cancel_hold',
                    hold_id: this.targetCancelHoldId,
                    cancel_reason: reason,
                    company_id: session.company_id || 1,
                    cashier_user_id: session.id || session.user_id || null
                })
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.closeCancelModal();
                alert('Hold sale cancelled successfully.');
                this.loadHolds();
            } else {
                alert('Failed to cancel hold: ' + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error(e);
            alert('Server error cancelling hold sale.');
        }
    },

    exportCSV: function() {
        if (!this.currentRecords || this.currentRecords.length === 0) {
            alert('No records available to export.');
            return;
        }

        const headers = ['Hold No', 'Date', 'Customer', 'Branch', 'Items Count', 'Gross Amount', 'Discount', 'Tax', 'Grand Total', 'Cashier', 'Status', 'Final Invoice No', 'Hold Reason'];
        
        const rows = this.currentRecords.map(r => [
            `"${r.hold_no || ''}"`,
            `"${r.hold_date || ''}"`,
            `"${(r.customer_name || '').replace(/"/g, '""')}"`,
            `"${(r.branch_name || '').replace(/"/g, '""')}"`,
            r.items_count || 0,
            parseFloat(r.subtotal || 0).toFixed(2),
            parseFloat(r.discount || 0).toFixed(2),
            parseFloat(r.tax_amount || 0).toFixed(2),
            parseFloat(r.net_total || 0).toFixed(2),
            `"${(r.cashier_name || '').replace(/"/g, '""')}"`,
            `"${r.status || ''}"`,
            `"${r.final_invoice_no || ''}"`,
            `"${(r.hold_reason || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `pos_hold_register_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
