/**
 * Softifyx ERP - Monthly Inventory Closing & Physical Stock Audit Module
 * Features:
 * - Real-time Multi-ledger System Stock Calculation
 * - Physical Godown Stock Comparison & Variance Detection
 * - 1-Click Auto Stock Adjustment (Wastage / Gain Reconciliation)
 * - 4-Layer Security Protection (Role, Date Guard, Master PIN, Confirmation Word)
 * - Printable Stock-Taking Count Sheet for Storekeepers
 * - Historical Closed Months Archive & Emergency Re-Open
 */

(function(window) {
    'use strict';

    const MonthlyClosingModule = {
        data: {
            items: [],
            summary: {},
            periodMonth: '',
            periodLabel: '',
            isClosed: false,
            closedInfo: null
        },

        init: function() {
            const mInput = document.getElementById('micSelectMonth');
            if (mInput && !mInput.value) {
                const now = new Date();
                const yr = now.getFullYear();
                const mo = String(now.getMonth() + 1).padStart(2, '0');
                mInput.value = `${yr}-${mo}`;
            }
            this.loadMonthPreview();
        },

        loadMonthPreview: async function() {
            const mInput = document.getElementById('micSelectMonth');
            const periodMonth = mInput ? mInput.value : '';
            if (!periodMonth) return;

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            const tbody = document.getElementById('micItemsTbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 40px; color: #94a3b8;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 20px;"></i><br><br>
                            Calculating Inventory Balances for ${periodMonth}...
                        </td>
                    </tr>
                `;
            }

            try {
                const res = await fetch(`api/monthly_inventory_closing.php?action=get_preview&period_month=${periodMonth}&company_id=${companyId}&_cb=${Date.now()}`);
                if (!res.ok) throw new Error('Failed to load audit preview');
                const result = await res.json();

                if (result.status === 'success') {
                    this.data.items = result.items || [];
                    this.data.summary = result.summary || {};
                    this.data.periodMonth = result.period_month;
                    this.data.periodLabel = result.period_label;
                    this.data.isClosed = result.is_closed;
                    this.data.closedInfo = result.closed_info || null;

                    this.renderUI();
                } else {
                    alert('Error: ' + result.message);
                }
            } catch(e) {
                console.error('loadMonthPreview error:', e);
                if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #dc2626; padding: 25px;">Failed to load data: ${e.message}</td></tr>`;
            }
        },

        renderUI: function() {
            const isClosed = this.data.isClosed;
            const statusBadge = document.getElementById('micMonthStatusBadge');
            const btnClose = document.getElementById('micBtnOpenCloseModal');
            const btnReopen = document.getElementById('micBtnReopenMonth');
            const btnAutoMatch = document.getElementById('micBtnAutoMatch');

            if (statusBadge) {
                if (isClosed) {
                    const info = this.data.closedInfo;
                    const by = info ? (info.closed_by || 'Admin') : 'Admin';
                    statusBadge.style.background = '#eef2ff';
                    statusBadge.style.color = '#3730a3';
                    statusBadge.style.border = '1px solid #c7d2fe';
                    statusBadge.innerHTML = `<i class="fas fa-lock"></i> Closed & Locked by ${by}`;
                } else {
                    statusBadge.style.background = '#f0fdf4';
                    statusBadge.style.color = '#166534';
                    statusBadge.style.border = '1px solid #bbf7d0';
                    statusBadge.innerHTML = `<i class="fas fa-unlock"></i> Open for Audit`;
                }
            }

            if (btnClose) btnClose.style.display = isClosed ? 'none' : 'flex';
            if (btnReopen) btnReopen.style.display = isClosed ? 'flex' : 'none';
            if (btnAutoMatch) btnAutoMatch.style.display = isClosed ? 'none' : 'flex';

            this.updateKPIs();
            this.renderTable();
        },

        updateKPIs: function() {
            let totSys = 0;
            let totCtn = 0;
            let totPcs = 0;
            let totKgs = 0;
            let totPhys = 0;
            let totVal = 0;

            this.data.items.forEach(it => {
                totSys += Number(it.system_stock) || 0;
                totCtn += Number(it.system_stock_ctn) || 0;
                totPcs += Number(it.system_stock_pcs) || 0;
                totKgs += Number(it.system_stock_kgs) || 0;
                totPhys += Number(it.physical_stock) || 0;
                totVal += (Number(it.physical_stock) || 0) * (Number(it.avg_rate) || 0);
            });

            const totVar = totPhys - totSys;

            const kpiItems = document.getElementById('micKpiTotalItems');
            const kpiSys = document.getElementById('micKpiSystemStock');
            const kpiUnits = document.getElementById('micKpiSystemUnits');
            const kpiPhys = document.getElementById('micKpiPhysicalStock');
            const kpiVar = document.getElementById('micKpiTotalVariance');
            const kpiVal = document.getElementById('micKpiStockValuation');

            if (kpiItems) kpiItems.textContent = this.data.items.length;
            if (kpiSys) kpiSys.textContent = Number(totSys).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (kpiUnits) {
                kpiUnits.textContent = `CTN: ${Number(totCtn).toLocaleString('en-US', {maximumFractionDigits: 1})} | PCS: ${Number(totPcs).toLocaleString('en-US', {maximumFractionDigits: 0})} | KGS: ${Number(totKgs).toLocaleString('en-US', {maximumFractionDigits: 1})}`;
            }
            if (kpiPhys) kpiPhys.textContent = Number(totPhys).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            if (kpiVar) {
                const varText = (totVar > 0 ? '+' : '') + Number(totVar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                kpiVar.textContent = varText;
                kpiVar.style.color = Math.abs(totVar) < 0.01 ? '#16a34a' : (totVar < 0 ? '#dc2626' : '#d97706');
            }

            if (kpiVal) {
                const curr = window.globalCurrencySymbol || 'Rs.';
                kpiVal.textContent = `${curr} ${Number(totVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
        },

        renderTable: function() {
            const tbody = document.getElementById('micItemsTbody');
            if (!tbody) return;

            const isClosed = this.data.isClosed;

            if (this.data.items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 30px; color: #94a3b8;">No inventory items recorded in system</td></tr>`;
                return;
            }

            let rows = '';
            this.data.items.forEach((it, idx) => {
                const sysQty = Number(it.system_stock) || 0;
                const sysCtn = Number(it.system_stock_ctn) || 0;
                const sysPcs = Number(it.system_stock_pcs) || 0;
                const sysKgs = Number(it.system_stock_kgs) || 0;

                const physQty = (it.physical_stock !== undefined) ? Number(it.physical_stock) : sysQty;
                const rate = Number(it.avg_rate) || 0;
                const diff = Number((physQty - sysQty).toFixed(2));
                const finalVal = Number((physQty * rate).toFixed(2));

                let diffBadge = `<span style="color: #16a34a; font-weight: 700;">0.00</span>`;
                let rowBg = '';
                if (diff < 0) {
                    diffBadge = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${diff.toFixed(2)}</span>`;
                    rowBg = 'background: #fffafa;';
                } else if (diff > 0) {
                    diffBadge = `<span style="background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: 700;">+${diff.toFixed(2)}</span>`;
                    rowBg = 'background: #fffdf5;';
                }

                const inputDisabled = isClosed ? 'disabled' : '';
                const inputStyle = isClosed 
                    ? 'background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569;' 
                    : 'background: #fff; border: 1.5px solid #0284c7; color: #0f172a; box-shadow: 0 0 0 1px rgba(2,132,199,0.1);';

                const ctnDisplay = (sysCtn !== 0) ? sysCtn.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '<span style="color:#cbd5e1;">-</span>';
                const pcsDisplay = (sysPcs !== 0) ? sysPcs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '<span style="color:#cbd5e1;">-</span>';
                const kgsDisplay = (sysKgs !== 0) ? sysKgs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:#cbd5e1;">-</span>';

                rows += `
                    <tr id="micRow_${idx}" class="mic-item-row" data-group="${it.group}" data-code="${(it.code || '').toLowerCase()}" data-name="${(it.name || '').toLowerCase()}" data-diff="${diff}" style="border-bottom: 1px solid #f1f5f9; ${rowBg}">
                        <td style="padding: 5px 6px; text-align: center; color: #64748b; border-right: 1px solid #f1f5f9;">${idx + 1}</td>
                        <td style="padding: 5px 8px; font-weight: 700; color: #334155; border-right: 1px solid #f1f5f9;">${it.code || '-'}</td>
                        <td style="padding: 5px 8px; font-weight: 600; color: #1e293b; border-right: 1px solid #f1f5f9;">${it.name}</td>
                        <td style="padding: 5px 8px; color: #475569; border-right: 1px solid #f1f5f9;">
                            <span style="font-size: 10.5px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${it.group}</span>
                        </td>
                        <td style="padding: 5px 6px; text-align: center; color: #64748b; border-right: 1px solid #f1f5f9;">${it.unit}</td>
                        <td style="padding: 5px 8px; text-align: right; color: #475569; border-right: 1px solid #f1f5f9;">${rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        
                        <!-- 3 Multi-Unit System Stock Columns -->
                        <td style="padding: 5px 6px; text-align: right; font-weight: 600; color: #0369a1; background: #f8fafc; border-right: 1px solid #f1f5f9;">
                            ${ctnDisplay}
                        </td>
                        <td style="padding: 5px 6px; text-align: right; font-weight: 600; color: #0284c7; background: #f8fafc; border-right: 1px solid #f1f5f9;">
                            ${pcsDisplay}
                        </td>
                        <td style="padding: 5px 6px; text-align: right; font-weight: 700; color: #0369a1; background: #f0f9ff; border-right: 1.5px solid #bae6fd;">
                            ${kgsDisplay}
                        </td>

                        <!-- Physical Count Input -->
                        <td style="padding: 3px 8px; text-align: right; border-right: 1px solid #f1f5f9; background: #fffdf5;">
                            <div style="display: inline-flex; align-items: center; gap: 4px;">
                                <input type="number" step="0.01" class="mic-phys-input" value="${physQty}" ${inputDisabled}
                                    oninput="window.MonthlyClosingModule.onPhysicalChange(${idx}, this.value)"
                                    style="width: 85px; padding: 3px 6px; text-align: right; font-size: 11.5px; font-weight: 700; border-radius: 4px; outline: none; ${inputStyle}">
                                <span style="font-size: 10px; color: #854d0e; font-weight: 600;">${it.unit}</span>
                            </div>
                        </td>

                        <!-- Variance & Closing Value -->
                        <td id="micCellDiff_${idx}" style="padding: 5px 8px; text-align: right; border-right: 1px solid #f1f5f9;">
                            ${diffBadge}
                        </td>
                        <td id="micCellVal_${idx}" style="padding: 5px 8px; text-align: right; font-weight: 700; color: #15803d;">
                            ${finalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = rows;
        },

        onPhysicalChange: function(index, val) {
            const it = this.data.items[index];
            if (!it) return;

            const physQty = parseFloat(val) || 0;
            it.physical_stock = physQty;
            const sysQty = Number(it.system_stock) || 0;
            const diff = Number((physQty - sysQty).toFixed(2));
            const rate = Number(it.avg_rate) || 0;
            const finalVal = Number((physQty * rate).toFixed(2));

            // Update row cells
            const cellDiff = document.getElementById(`micCellDiff_${index}`);
            const cellVal = document.getElementById(`micCellVal_${index}`);
            const rowEl = document.getElementById(`micRow_${index}`);

            if (cellDiff) {
                if (diff < 0) {
                    cellDiff.innerHTML = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${diff.toFixed(2)}</span>`;
                    if (rowEl) rowEl.style.background = '#fffafa';
                } else if (diff > 0) {
                    cellDiff.innerHTML = `<span style="background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: 700;">+${diff.toFixed(2)}</span>`;
                    if (rowEl) rowEl.style.background = '#fffdf5';
                } else {
                    cellDiff.innerHTML = `<span style="color: #16a34a; font-weight: 700;">0.00</span>`;
                    if (rowEl) rowEl.style.background = '';
                }
            }

            if (cellVal) {
                cellVal.textContent = finalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            if (rowEl) {
                rowEl.dataset.diff = diff;
            }

            this.updateKPIs();
        },

        autoMatchAll: function() {
            if (this.data.isClosed) return;
            if (!confirm("Kia aap waqai tamaam items ka Physical Count = System Stock ke barabar karna chahtay hain?")) return;

            this.data.items.forEach(it => {
                it.physical_stock = Number(it.system_stock) || 0;
            });
            this.renderTable();
            this.updateKPIs();
        },

        filterTable: function() {
            const sTerm = (document.getElementById('micSearchInput')?.value || '').toLowerCase().trim();
            const cat = document.getElementById('micCategoryFilter')?.value || 'all';
            const varFilter = document.getElementById('micVarianceFilter')?.value || 'all';

            const rows = document.querySelectorAll('#micItemsTbody tr.mic-item-row');
            rows.forEach(tr => {
                const code = tr.dataset.code || '';
                const name = tr.dataset.name || '';
                const grp = tr.dataset.group || '';
                const diff = parseFloat(tr.dataset.diff) || 0;

                let matchSearch = !sTerm || code.includes(sTerm) || name.includes(sTerm);
                let matchCat = (cat === 'all') || (grp === cat);
                let matchVar = true;
                if (varFilter === 'diff_only') matchVar = Math.abs(diff) > 0.001;
                else if (varFilter === 'shortage') matchVar = diff < -0.001;
                else if (varFilter === 'surplus') matchVar = diff > 0.001;

                tr.style.display = (matchSearch && matchCat && matchVar) ? '' : 'none';
            });
        },

        openCloseModal: function() {
            if (this.data.isClosed) {
                alert("Yeh mahina pehle se close aur lock ho chuka hai!");
                return;
            }

            let surplusCount = 0;
            let shortageCount = 0;
            let matchCount = 0;

            this.data.items.forEach(it => {
                const diff = (Number(it.physical_stock) || 0) - (Number(it.system_stock) || 0);
                if (diff < -0.001) shortageCount++;
                else if (diff > 0.001) surplusCount++;
                else matchCount++;
            });

            const titleEl = document.getElementById('micModalMonthTitle');
            if (titleEl) titleEl.textContent = `Closing: ${this.data.periodLabel} (${this.data.periodMonth})`;

            const detailsEl = document.getElementById('micModalVarianceDetails');
            if (detailsEl) {
                detailsEl.innerHTML = `
                    • Bilkul Barabar (Matching): <strong>${matchCount} Items</strong><br>
                    • Kami / Wastage (Shortage): <strong style="color: #b91c1c;">${shortageCount} Items</strong><br>
                    • Zyada / Ziyadati (Surplus): <strong style="color: #b45309;">${surplusCount} Items</strong>
                `;
            }

            const pinInput = document.getElementById('micModalAdminPin');
            const wordInput = document.getElementById('micModalConfirmWord');
            const notesInput = document.getElementById('micModalNotes');
            if (pinInput) pinInput.value = '';
            if (wordInput) wordInput.value = '';
            if (notesInput) notesInput.value = '';

            const modal = document.getElementById('micCloseModal');
            if (modal) modal.style.display = 'flex';
        },

        submitClosing: async function() {
            const pin = document.getElementById('micModalAdminPin')?.value || '';
            const word = (document.getElementById('micModalConfirmWord')?.value || '').trim().toUpperCase();
            const autoAdj = document.getElementById('micModalAutoAdjust')?.checked;
            const notes = document.getElementById('micModalNotes')?.value || '';

            if (word !== 'CLOSE') {
                alert("Barah-e-karam confirmation dabbay mein lafz 'CLOSE' capital letters mein likhein!");
                return;
            }

            const payload = {
                period_month: this.data.periodMonth,
                admin_pin: pin,
                confirm_text: word,
                auto_adjust: autoAdj,
                notes: notes,
                physical_counts: this.data.items.map(it => ({
                    item_id: it.item_id,
                    physical_qty: Number(it.physical_stock) || 0
                }))
            };

            const btnSubmit = document.getElementById('micBtnSubmitClose');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locking Month...';
            }

            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;

                const res = await fetch(`api/monthly_inventory_closing.php?action=close_month&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();

                if (result.status === 'success') {
                    alert(result.message);
                    this.closeModals();
                    this.loadMonthPreview();
                } else {
                    alert("Error: " + result.message);
                }
            } catch(e) {
                alert("Failed to close month: " + e.message);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<i class="fas fa-lock"></i> Confirm & Lock Month';
                }
            }
        },

        openReopenModal: function() {
            const modal = document.getElementById('micReopenModal');
            if (modal) {
                const pin = document.getElementById('micReopenAdminPin');
                const word = document.getElementById('micReopenConfirmWord');
                if (pin) pin.value = '';
                if (word) word.value = '';
                modal.style.display = 'flex';
            }
        },

        submitReopen: async function() {
            const pin = document.getElementById('micReopenAdminPin')?.value || '';
            const word = (document.getElementById('micReopenConfirmWord')?.value || '').trim().toUpperCase();

            if (word !== 'REOPEN') {
                alert("Barah-e-karam confirmation dabbay mein lafz 'REOPEN' likhein!");
                return;
            }

            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;

                const res = await fetch(`api/monthly_inventory_closing.php?action=reopen_month&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        period_month: this.data.periodMonth,
                        admin_pin: pin,
                        confirm_text: word
                    })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert(result.message);
                    this.closeModals();
                    this.loadMonthPreview();
                } else {
                    alert("Error: " + result.message);
                }
            } catch(e) {
                alert("Failed to reopen month: " + e.message);
            }
        },

        openHistoryModal: async function() {
            const modal = document.getElementById('micHistoryModal');
            const tbody = document.getElementById('micHistoryTbody');
            if (modal) modal.style.display = 'flex';

            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>`;
            }

            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;

                const res = await fetch(`api/monthly_inventory_closing.php?action=get_status&company_id=${companyId}&_cb=${Date.now()}`);
                const data = await res.json();

                if (data.status === 'success' && tbody) {
                    const closings = data.closings || [];
                    if (closings.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8;">No historical closed months recorded yet</td></tr>`;
                        return;
                    }

                    let rows = '';
                    closings.forEach(c => {
                        const curr = window.globalCurrencySymbol || 'Rs.';
                        const val = Number(c.total_stock_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        const qty = Number(c.total_physical_qty || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

                        rows += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 6px 8px; font-weight: 700; color: #1e3a8a;">${c.period_label} (${c.period_month})</td>
                                <td style="padding: 6px 8px; color: #475569;">${c.closed_at} by <strong>${c.closed_by}</strong></td>
                                <td style="padding: 6px 8px; text-align: right;">${c.total_items} Items</td>
                                <td style="padding: 6px 8px; text-align: right; font-weight: 600;">${qty}</td>
                                <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #15803d;">${curr} ${val}</td>
                                <td style="padding: 6px 8px; text-align: center;">
                                    <span style="background: #e0f2fe; color: #0369a1; padding: 2px 7px; border-radius: 10px; font-weight: 700; font-size: 10.5px;">Locked</span>
                                </td>
                                <td style="padding: 6px 8px; text-align: center;">
                                    <button type="button" onclick="window.MonthlyClosingModule.viewClosedMonth('${c.period_month}')" style="background: #0284c7; color: white; border: none; padding: 2px 8px; border-radius: 3px; font-weight: 700; font-size: 10.5px; cursor: pointer;">
                                        View Sheet
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                    tbody.innerHTML = rows;
                }
            } catch(e) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: #dc2626; text-align: center; padding: 20px;">Failed to load history</td></tr>`;
            }
        },

        viewClosedMonth: function(periodMonth) {
            this.closeModals();
            const mInput = document.getElementById('micSelectMonth');
            if (mInput) {
                mInput.value = periodMonth;
                this.loadMonthPreview();
            }
        },

        closeModals: function() {
            const m1 = document.getElementById('micCloseModal');
            const m2 = document.getElementById('micReopenModal');
            const m3 = document.getElementById('micHistoryModal');
            if (m1) m1.style.display = 'none';
            if (m2) m2.style.display = 'none';
            if (m3) m3.style.display = 'none';
        },

        printStockSheet: function() {
            const pMonth = this.data.periodLabel || this.data.periodMonth;
            const items = this.data.items || [];

            let printRows = '';
            items.forEach((it, idx) => {
                const sysCtn = Number(it.system_stock_ctn) || 0;
                const sysPcs = Number(it.system_stock_pcs) || 0;
                const sysKgs = Number(it.system_stock_kgs) || 0;

                const ctnStr = (sysCtn !== 0) ? sysCtn.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '-';
                const pcsStr = (sysPcs !== 0) ? sysPcs.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-';
                const kgsStr = (sysKgs !== 0) ? sysKgs.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '-';

                printRows += `
                    <tr>
                        <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
                        <td style="padding: 4px 6px; font-weight: 700; border: 1px solid #cbd5e1;">${it.code || '-'}</td>
                        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${it.name}</td>
                        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${it.group}</td>
                        <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e1;">${it.unit}</td>
                        
                        <!-- Computer System Stock 3 Columns -->
                        <td style="padding: 4px; text-align: right; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 600;">${ctnStr}</td>
                        <td style="padding: 4px; text-align: right; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 600;">${pcsStr}</td>
                        <td style="padding: 4px; text-align: right; border: 1px solid #cbd5e1; background: #f0f9ff; font-weight: 700;">${kgsStr}</td>
                        
                        <!-- Godown Count 3 Boxes -->
                        <td style="padding: 3px; text-align: center; border: 1px solid #cbd5e1; width: 60px;">
                            <div style="border: 1px dashed #64748b; height: 18px; width: 50px; margin: 0 auto;"></div>
                        </td>
                        <td style="padding: 3px; text-align: center; border: 1px solid #cbd5e1; width: 60px;">
                            <div style="border: 1px dashed #64748b; height: 18px; width: 50px; margin: 0 auto;"></div>
                        </td>
                        <td style="padding: 3px; text-align: center; border: 1px solid #cbd5e1; width: 70px;">
                            <div style="border: 1px dashed #64748b; height: 18px; width: 60px; margin: 0 auto;"></div>
                        </td>
                        
                        <td style="padding: 4px; border: 1px solid #cbd5e1; width: 80px;"></td>
                    </tr>
                `;
            });

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Physical Stock-Taking Count Sheet - ${pMonth}</title>
                    <style>
                        body { font-family: Arial, sans-serif; font-size: 10.5px; margin: 15px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                        th { background: #f1f5f9; padding: 5px; border: 1px solid #94a3b8; font-size: 10px; }
                        @media print {
                            body { margin: 8mm; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 8px;">
                        <div>
                            <h2 style="margin: 0; color: #1e3a8a; font-size: 16px;">FACTORY PHYSICAL STOCK-TAKING COUNT SHEET (CTN / PCS / KGS)</h2>
                            <div style="font-size: 12px; font-weight: 700; color: #475569; margin-top: 3px;">Audit Period: ${pMonth}</div>
                        </div>
                        <div style="text-align: right; font-size: 10.5px; color: #64748b;">
                            <div>Print Date: ${new Date().toLocaleDateString('en-GB')}</div>
                            <div>Factory Location: Main Godown & Factory Floor</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2" style="width: 25px;">#</th>
                                <th rowspan="2" style="width: 75px;">Item Code</th>
                                <th rowspan="2">Item Description</th>
                                <th rowspan="2" style="width: 80px;">Category</th>
                                <th rowspan="2" style="width: 40px;">Unit</th>
                                <th colspan="3" style="text-align: center; background: #e0f2fe; color: #0369a1;">Computer System Stock</th>
                                <th colspan="3" style="text-align: center; background: #fefce8; color: #854d0e;">Godown Physical Count</th>
                                <th rowspan="2" style="width: 80px;">Remarks</th>
                            </tr>
                            <tr style="font-size: 9.5px;">
                                <th style="width: 50px; background: #f0f9ff;">CTN</th>
                                <th style="width: 50px; background: #f0f9ff;">PCS</th>
                                <th style="width: 65px; background: #e0f2fe;">KGS</th>
                                <th style="width: 60px; background: #fef9c3;">CTN</th>
                                <th style="width: 60px; background: #fef9c3;">PCS</th>
                                <th style="width: 70px; background: #fef08a;">KGS</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${printRows}
                        </tbody>
                    </table>
                    <div style="margin-top: 30px; display: flex; justify-content: space-between; font-weight: 700; font-size: 11px;">
                        <div>Counted By (Storekeeper): ____________________</div>
                        <div>Verified By (Factory Manager): ____________________</div>
                        <div>Approved By (Administrator): ____________________</div>
                    </div>
                    <script>
                        window.onload = function() { window.print(); };
                    </script>
                </body>
                </html>
            `;

            const w = window.open('', '_blank');
            if (w) {
                w.document.open();
                w.document.write(html);
                w.document.close();
            } else {
                alert("Pop-up blocked! Barah-e-karam browser mein pop-ups allow karein.");
            }
        }
    };

    window.MonthlyClosingModule = MonthlyClosingModule;

})(window);

