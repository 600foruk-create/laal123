(function() {
    const ProductionCostingModule = {
        data: {
            company_id: 1,
            companyName: 'SoftifyX Financials',
            companyInfo: null,
            viewMode: 'monthly', // 'monthly' or 'daily'
            meta: {},
            lastReportData: null
        },

        init: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = window.selectedCompanyId || session.company_id || 1;
            this.data.companyName = session.company_name || 'SoftifyX Financials';

            // Global click handler to close dropdowns
            if (!this._boundExportClick) {
                document.addEventListener('click', (e) => {
                    const drop = document.getElementById('pcExportDropdown');
                    if (drop && !e.target.closest('#pcExportDropdown') && !e.target.closest('.pc-btn-success')) {
                        drop.style.display = 'none';
                    }
                });
                this._boundExportClick = true;
            }

            this.setDefaultDates();
            this.bindEvents();
            this.loadCompanyProfile().catch(e => console.warn(e));

            try {
                await this.loadMeta();
            } catch (e) {
                console.warn(e);
            }

            await this.loadReport();
        },

        bindEvents: function() {
            // Table Row Click Selection
            const scrollArea = document.getElementById('pcTableScrollArea');
            if (scrollArea && !scrollArea._clickBound) {
                scrollArea._clickBound = true;
                scrollArea.addEventListener('click', (e) => {
                    const tr = e.target.closest('tbody tr');
                    if (!tr || tr.querySelector('td[colspan]')) return;

                    const tbody = tr.closest('tbody');
                    if (!tbody) return;

                    const isSelected = tr.classList.contains('selected-row');
                    tbody.querySelectorAll('tr.selected-row').forEach(r => r.classList.remove('selected-row'));

                    if (!isSelected) {
                        tr.classList.add('selected-row');
                    }
                });
            }

            // Keyboard ArrowUp / ArrowDown Navigation
            if (!this._keyNavBound) {
                document.addEventListener('keydown', (e) => {
                    const container = document.getElementById('pcMainContainer');
                    if (!container || !container.offsetParent) return;

                    // If user is focused on an input/select/textarea, allow normal typing/navigation
                    const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
                    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
                        return;
                    }

                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        const activeTbodyId = (this.data.viewMode === 'daily') ? 'pcDailyTableBody' : 'pcMonthlyTableBody';
                        const tbody = document.getElementById(activeTbodyId);
                        if (!tbody) return;

                        const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.querySelector('td[colspan]'));
                        if (rows.length === 0) return;

                        e.preventDefault();
                        e.stopPropagation();

                        let currentIndex = rows.findIndex(r => r.classList.contains('selected-row'));
                        let nextIndex = 0;

                        if (e.key === 'ArrowDown') {
                            if (currentIndex === -1) {
                                nextIndex = 0;
                            } else {
                                nextIndex = Math.min(currentIndex + 1, rows.length - 1);
                            }
                        } else if (e.key === 'ArrowUp') {
                            if (currentIndex === -1) {
                                nextIndex = rows.length - 1;
                            } else {
                                nextIndex = Math.max(currentIndex - 1, 0);
                            }
                        }

                        rows.forEach(r => r.classList.remove('selected-row'));
                        const targetRow = rows[nextIndex];
                        if (targetRow) {
                            targetRow.classList.add('selected-row');
                            targetRow.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                        }
                    }
                });
                this._keyNavBound = true;
            }
        },

        loadCompanyProfile: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = window.selectedCompanyId || session.company_id || this.data.company_id || 1;

            let comp = {
                name: session.company_name || 'SoftifyX Financials',
                address: '',
                phone: '',
                fax: '',
                email: '',
                website: '',
                ntn: '',
                gst: '',
                logo_data: ''
            };

            try {
                const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}&_cb=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && !data.error) {
                        comp = {
                            name: (data.name || '').trim() || comp.name,
                            address: (data.address || '').trim(),
                            phone: (data.phone || '').trim(),
                            fax: (data.fax || '').trim(),
                            email: (data.email || '').trim(),
                            website: (data.website || '').trim(),
                            ntn: (data.ntn || '').trim(),
                            gst: (data.gst || data.strn || '').trim(),
                            logo_data: data.logo_data || ''
                        };
                    }
                }
            } catch (e) {
                console.error("Could not fetch company info:", e);
            }

            this.data.companyInfo = comp;
            this.data.companyName = comp.name;
            return comp;
        },

        setDefaultDates: function() {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

            const fromStr = `${year}-${month}-01`;
            const toStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

            const fromInput = document.getElementById('pcFromDate');
            const toInput = document.getElementById('pcToDate');

            if (fromInput && !fromInput.value) fromInput.value = fromStr;
            if (toInput && !toInput.value) toInput.value = toStr;
        },

        applyDatePreset: function() {
            const preset = document.getElementById('pcDatePreset')?.value;
            if (preset === 'custom') return;

            const now = new Date();
            let fromDate, toDate;

            if (preset === 'this_month') {
                const y = now.getFullYear();
                const m = now.getMonth();
                fromDate = new Date(y, m, 1);
                toDate = new Date(y, m + 1, 0);
            } else if (preset === 'last_month') {
                const y = now.getFullYear();
                const m = now.getMonth() - 1;
                fromDate = new Date(y, m, 1);
                toDate = new Date(y, m + 1, 0);
            } else if (preset === 'this_quarter') {
                const y = now.getFullYear();
                const q = Math.floor(now.getMonth() / 3);
                fromDate = new Date(y, q * 3, 1);
                toDate = new Date(y, (q + 1) * 3, 0);
            } else if (preset === 'this_year') {
                const y = now.getFullYear();
                if (now.getMonth() >= 6) {
                    fromDate = new Date(y, 6, 1);
                    toDate = new Date(y + 1, 5, 30);
                } else {
                    fromDate = new Date(y - 1, 6, 1);
                    toDate = new Date(y, 5, 30);
                }
            }

            if (fromDate && toDate) {
                const formatDate = (d) => {
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };

                const fInput = document.getElementById('pcFromDate');
                const tInput = document.getElementById('pcToDate');
                if (fInput) fInput.value = formatDate(fromDate);
                if (tInput) tInput.value = formatDate(toDate);

                this.loadReport();
            }
        },

        onDateInputChange: function() {
            const presetSel = document.getElementById('pcDatePreset');
            if (presetSel) presetSel.value = 'custom';
            this.loadReport();
        },

        switchViewMode: function(mode) {
            this.data.viewMode = mode;

            const btnMonthly = document.getElementById('pcBtnViewMonthly');
            const btnDaily = document.getElementById('pcBtnViewDaily');
            const tblMonthly = document.getElementById('pcMonthlyTable');
            const tblDaily = document.getElementById('pcDailyTable');

            if (mode === 'monthly') {
                if (btnMonthly) btnMonthly.classList.add('active');
                if (btnDaily) btnDaily.classList.remove('active');
                if (tblMonthly) tblMonthly.style.display = 'table';
                if (tblDaily) tblDaily.style.display = 'none';
            } else {
                if (btnMonthly) btnMonthly.classList.remove('active');
                if (btnDaily) btnDaily.classList.add('active');
                if (tblMonthly) tblMonthly.style.display = 'none';
                if (tblDaily) tblDaily.style.display = 'table';
            }

            if (this.data.lastReportData) {
                this.renderReport(this.data.lastReportData);
            }
        },

        toggleCategoryGroup: function(tr, e) {
            if (!tr) return;
            const catId = tr.getAttribute('data-cat-id');
            const tbody = tr.closest('tbody');
            if (!tbody || !catId) return;

            const childRows = tbody.querySelectorAll(`.cat-children-${catId}`);
            const toggleIcon = tr.querySelector('.pc-cat-toggle');
            let isOpening = false;

            childRows.forEach(row => {
                if (row.style.display === 'none') {
                    row.style.display = 'table-row';
                    isOpening = true;
                } else {
                    row.style.display = 'none';
                }
            });

            if (toggleIcon) {
                toggleIcon.textContent = isOpening ? '[-]' : '[+]';
            }
        },

        onExpenseModeChange: function() {
            const mode = document.getElementById('pcExpenseMode')?.value || 'auto';
            const elecInput = document.getElementById('pcInputElectricity');
            const laborInput = document.getElementById('pcInputLabor');
            const ovhInput = document.getElementById('pcInputOverheads');

            if (mode === 'auto') {
                if (elecInput) elecInput.disabled = true;
                if (laborInput) laborInput.disabled = true;
                if (ovhInput) ovhInput.disabled = true;
            } else {
                if (elecInput) elecInput.disabled = false;
                if (laborInput) laborInput.disabled = false;
                if (ovhInput) ovhInput.disabled = false;
            }

            this.loadReport();
        },

        loadMeta: async function() {
            try {
                const res = await fetch(`api/production_costing.php?action=get_meta&company_id=${this.data.company_id}`);
                if (!res.ok) return;

                const json = await res.json();
                if (json.status !== 'success') return;

                this.data.meta = json;

                if (json.company && json.company.name) {
                    this.data.companyInfo = Object.assign({}, this.data.companyInfo || {}, json.company);
                    this.data.companyName = this.data.companyInfo.name;
                }

                // Populate Category / Brand dropdown
                const pSel = document.getElementById('pcProductFilter');
                if (pSel) {
                    pSel.innerHTML = '<option value="all">All Categories / Brands</option>';
                    const cats = json.categories || [];
                    if (cats.length > 0) {
                        cats.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.id;
                            opt.textContent = `${c.name} (${c.code || 'Brand'})`;
                            pSel.appendChild(opt);
                        });
                    } else if (json.finished_items) {
                        json.finished_items.forEach(it => {
                            const opt = document.createElement('option');
                            opt.value = it.id;
                            opt.textContent = `${it.name}`;
                            pSel.appendChild(opt);
                        });
                    }
                }

            } catch (err) {
                console.error("Error loading Production Costing meta:", err);
            }
        },

        loadReport: async function() {
            const mBody = document.getElementById('pcMonthlyTableBody');
            const dBody = document.getElementById('pcDailyTableBody');

            if (mBody) {
                mBody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 30px; color: var(--theme-primary, #1F4E79);"><i class="fas fa-spinner fa-spin fa-2x"></i><br><span style="display:inline-block; margin-top:8px; font-weight:600;">Calculating Manufacturing Costing & WIP...</span></td></tr>`;
            }
            if (dBody) {
                dBody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--theme-primary, #1F4E79);"><i class="fas fa-spinner fa-spin fa-2x"></i><br><span style="display:inline-block; margin-top:8px; font-weight:600;">Calculating Daily WIP Flow...</span></td></tr>`;
            }

            const fromDate = document.getElementById('pcFromDate')?.value || '';
            const toDate = document.getElementById('pcToDate')?.value || '';
            const productId = document.getElementById('pcProductFilter')?.value || 'all';
            const expenseMode = document.getElementById('pcExpenseMode')?.value || 'auto';

            const elecCost = document.getElementById('pcInputElectricity')?.value || '0';
            const laborCost = document.getElementById('pcInputLabor')?.value || '0';
            const ovhCost = document.getElementById('pcInputOverheads')?.value || '0';

            const queryUrl = `api/production_costing.php?action=get_costing_statement&company_id=${this.data.company_id}&from_date=${fromDate}&to_date=${toDate}&product_id=${productId}&expense_mode=${expenseMode}&electricity_cost=${elecCost}&labor_cost=${laborCost}&overhead_cost=${ovhCost}`;

            try {
                const res = await fetch(queryUrl);
                if (!res.ok) throw new Error("HTTP " + res.status);

                const data = await res.json();
                if (data.status !== 'success') {
                    const errMsg = `Error: ${data.error || 'Failed to fetch data'}`;
                    if (mBody) mBody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: #dc2626; padding: 15px;">${errMsg}</td></tr>`;
                    if (dBody) dBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #dc2626; padding: 15px;">${errMsg}</td></tr>`;
                    return;
                }

                this.data.lastReportData = data;

                if (data.company && data.company.name) {
                    this.data.companyInfo = Object.assign({}, this.data.companyInfo || {}, data.company);
                    this.data.companyName = this.data.companyInfo.name;
                }

                this.renderReport(data);

            } catch (err) {
                console.error("Error generating Production Costing report:", err);
                const errMsg = `Failed to load report (${err.message}). Please check connection and try again.`;
                if (mBody) mBody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: #dc2626; padding: 15px;">${errMsg}</td></tr>`;
                if (dBody) dBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #dc2626; padding: 15px;">${errMsg}</td></tr>`;
            }
        },

        renderReport: function(data) {
            const pRows = data.product_rows || [];
            const dRows = data.daily_rows || [];
            const rec = data.reconciliation || {};
            const cost = data.cost_sheet || {};
            const carry = data.carry_forward || {};

            // Header Period
            const hPeriod = document.getElementById('pcHeaderPeriodDisplay');
            if (hPeriod) hPeriod.textContent = data.period_label || '';

            // Render Monthly Product-Wise Table
            const mBody = document.getElementById('pcMonthlyTableBody');
            const mFoot = document.getElementById('pcMonthlyTableFoot');

            if (mBody) {
                const cRows = data.category_rows || [];
                if (cRows.length === 0 && pRows.length === 0) {
                    mBody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 30px; color: #64748b; font-style: italic;">No finished goods production recorded for this period.</td></tr>`;
                } else {
                    let html = '';
                    let totQty = 0, totPcs = 0, totWeight = 0, totMat = 0, totOvh = 0, totCost = 0;

                    if (cRows.length > 0) {
                        cRows.forEach(c => {
                            totQty += parseFloat(c.produced_qty || 0);
                            totPcs += parseFloat(c.produced_pieces || 0);
                            totWeight += parseFloat(c.weight_kg || 0);
                            totMat += parseFloat(c.allocated_material || 0);
                            totOvh += parseFloat(c.allocated_overhead || 0);
                            totCost += parseFloat(c.total_cost || 0);

                            const hasItems = c.items && c.items.length > 0;
                            const expandIcon = hasItems ? `<span class="pc-cat-toggle" style="display:inline-block; width:15px; cursor:pointer; font-weight:800; color:var(--theme-primary, #1F4E79); margin-right:4px;">[+]</span>` : '';

                            html += `
                                <tr class="pc-cat-parent" data-cat-id="${c.category_id}" style="font-weight: 600; cursor: pointer;" onclick="window.ProductionCostingModule.toggleCategoryGroup(this, event)">
                                    <td style="text-align: center; font-weight: 700; color: #64748b;">${c.sr}</td>
                                    <td style="font-family: monospace; font-weight: 700; color: #0284c7;">
                                        <span style="background: #e0f2fe; color: #0369a1; padding: 1.5px 5px; border-radius: 3px; font-size: 9px;"><i class="fas fa-tag"></i> BRAND</span>
                                    </td>
                                    <td style="font-weight: 700; color: #0f172a;">
                                        ${expandIcon}
                                        <span>${c.category_name}</span>
                                        <span style="font-size: 9px; color: #64748b; font-weight: normal; margin-left: 6px;">(${c.item_count} ${c.item_count === 1 ? 'size' : 'sizes'})</span>
                                    </td>
                                    <td style="text-align: center; font-weight: 600;">KG</td>
                                    <td style="text-align: right; font-weight: 700;">${this.formatQty(c.produced_qty)}</td>
                                    <td style="text-align: right; font-weight: 700;">${this.formatQty(c.produced_pieces)}</td>
                                    <td style="text-align: right; font-weight: 800; background: #f8fafc;">${this.formatQty(c.weight_kg)} KG</td>
                                    <td style="text-align: right; color: #64748b;">${c.pct_share}%</td>
                                    <td style="text-align: right;">Rs. ${this.formatCurrency(c.allocated_material)}</td>
                                    <td style="text-align: right;">Rs. ${this.formatCurrency(c.allocated_overhead)}</td>
                                    <td style="text-align: right; font-weight: 800; background: #f0fdf4; color: #15803d;">Rs. ${this.formatCurrency(c.total_cost)}</td>
                                    <td style="text-align: right; font-weight: 700; color: #b45309;">Rs. ${this.formatDecimal(c.cost_per_piece, 2)}</td>
                                    <td style="text-align: right; font-weight: 800; background: #eff6ff; color: #1e40af;">Rs. ${this.formatDecimal(c.cost_per_kg, 2)}</td>
                                </tr>
                            `;

                            if (hasItems) {
                                c.items.forEach(sub => {
                                    html += `
                                        <tr class="pc-sub-row cat-children-${c.category_id}" style="display: none; background: #f8fafc; font-size: 10px;">
                                            <td style="text-align: center; color: #94a3b8;">&bull;</td>
                                            <td style="font-family: monospace; font-size: 9px; color: #64748b; padding-left: 8px;">${sub.product_code || '-'}</td>
                                            <td style="padding-left: 22px; color: #334155;">
                                                <i class="fas fa-level-up-alt fa-rotate-90" style="color: #cbd5e1; margin-right: 4px;"></i> ${sub.product_name}
                                            </td>
                                            <td style="text-align: center; color: #64748b;">${sub.unit || 'PCS'}</td>
                                            <td style="text-align: right;">${this.formatQty(sub.produced_qty)}</td>
                                            <td style="text-align: right;">${this.formatQty(sub.produced_pieces)}</td>
                                            <td style="text-align: right; font-weight: 600;">${this.formatQty(sub.weight_kg)} KG</td>
                                            <td style="text-align: right; color: #94a3b8;">${sub.pct_share}%</td>
                                            <td style="text-align: right;">Rs. ${this.formatCurrency(sub.allocated_material)}</td>
                                            <td style="text-align: right;">Rs. ${this.formatCurrency(sub.allocated_overhead)}</td>
                                            <td style="text-align: right; font-weight: 700; color: #166534;">Rs. ${this.formatCurrency(sub.total_cost)}</td>
                                            <td style="text-align: right; color: #b45309;">Rs. ${this.formatDecimal(sub.cost_per_piece, 2)}</td>
                                            <td style="text-align: right; font-weight: 700; color: #1e40af;">Rs. ${this.formatDecimal(sub.cost_per_kg, 2)}</td>
                                        </tr>
                                    `;
                                });
                            }
                        });
                    } else {
                        pRows.forEach(r => {
                            totQty += parseFloat(r.produced_qty || 0);
                            totPcs += parseFloat(r.produced_pieces || 0);
                            totWeight += parseFloat(r.weight_kg || 0);
                            totMat += parseFloat(r.allocated_material || 0);
                            totOvh += parseFloat(r.allocated_overhead || 0);
                            totCost += parseFloat(r.total_cost || 0);

                            html += `
                                <tr>
                                    <td style="text-align: center; font-weight: 600; color: #64748b;">${r.sr}</td>
                                    <td style="font-family: monospace; font-weight: 700; color: #0284c7;">${r.product_code || '-'}</td>
                                    <td style="font-weight: 600; color: #0f172a;">${r.product_name}</td>
                                    <td style="text-align: center;">${r.unit || 'PCS'}</td>
                                    <td style="text-align: right; font-weight: 700;">${this.formatQty(r.produced_qty)}</td>
                                    <td style="text-align: right;">${this.formatQty(r.produced_pieces)}</td>
                                    <td style="text-align: right; font-weight: 700; background: #f8fafc;">${this.formatQty(r.weight_kg)} KG</td>
                                    <td style="text-align: right; color: #64748b;">${r.pct_share}%</td>
                                    <td style="text-align: right;">Rs. ${this.formatCurrency(r.allocated_material)}</td>
                                    <td style="text-align: right;">Rs. ${this.formatCurrency(r.allocated_overhead)}</td>
                                    <td style="text-align: right; font-weight: 800; background: #f0fdf4; color: #15803d;">Rs. ${this.formatCurrency(r.total_cost)}</td>
                                    <td style="text-align: right; font-weight: 700; color: #b45309;">Rs. ${this.formatDecimal(r.cost_per_piece, 2)}</td>
                                    <td style="text-align: right; font-weight: 800; background: #eff6ff; color: #1e40af;">Rs. ${this.formatDecimal(r.cost_per_kg, 2)}</td>
                                </tr>
                            `;
                        });
                    }

                    mBody.innerHTML = html;

                    const avgPerKg = (totWeight > 0) ? (totCost / totWeight) : 0;
                    if (mFoot) {
                        mFoot.innerHTML = `
                            <tr>
                                <td colspan="4" style="text-align: center; text-transform: uppercase;">Total Production</td>
                                <td style="text-align: right;">${this.formatQty(totQty)}</td>
                                <td style="text-align: right;">${this.formatQty(totPcs)}</td>
                                <td style="text-align: right; background: #e2e8f0;">${this.formatQty(totWeight)} KG</td>
                                <td style="text-align: right;">100%</td>
                                <td style="text-align: right;">Rs. ${this.formatCurrency(totMat)}</td>
                                <td style="text-align: right;">Rs. ${this.formatCurrency(totOvh)}</td>
                                <td style="text-align: right; background: #dcfce7; color: #15803d;">Rs. ${this.formatCurrency(totCost)}</td>
                                <td style="text-align: right;">-</td>
                                <td style="text-align: right; background: #dbeafe; color: #1e40af;">Rs. ${this.formatDecimal(avgPerKg, 2)} / KG</td>
                            </tr>
                        `;
                    }
                }
            }

            // Render Daily WIP Flow Table
            const dBody = document.getElementById('pcDailyTableBody');
            const dFoot = document.getElementById('pcDailyTableFoot');

            if (dBody) {
                if (dRows.length === 0) {
                    dBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 30px; color: #64748b; font-style: italic;">No daily production entries found.</td></tr>`;
                } else {
                    let dHtml = '';
                    let totIss = 0, totIssVal = 0, totProd = 0;

                    dRows.forEach(dr => {
                        totIss += parseFloat(dr.material_issued_qty || 0);
                        totIssVal += parseFloat(dr.material_issued_val || 0);
                        totProd += parseFloat(dr.finished_prod_qty || 0);

                        dHtml += `
                            <tr>
                                <td style="text-align: center; font-weight: 600; color: #64748b;">${dr.sr}</td>
                                <td style="font-weight: 700; color: #0f172a;">${dr.date_formatted}</td>
                                <td style="text-align: right; font-weight: 700; background: #fefce8; color: #854d0e;">${this.formatQty(dr.opening_wip)} KG</td>
                                <td style="text-align: right; font-weight: 700; color: #0284c7;">+${this.formatQty(dr.material_issued_qty)}</td>
                                <td style="text-align: right;">Rs. ${this.formatCurrency(dr.material_issued_val)}</td>
                                <td style="text-align: right; font-weight: 700; color: #15803d;">-${this.formatQty(dr.finished_prod_qty)}</td>
                                <td style="text-align: right; font-weight: 800; background: #f0fdf4; color: #15803d;">${this.formatQty(dr.closing_wip)} KG</td>
                                <td style="text-align: center; font-weight: 700; color: ${dr.yield_pct >= 95 ? '#15803d' : '#b45309'};">${dr.yield_pct}%</td>
                                <td style="text-align: center;"><span style="background: ${dr.closing_wip > 0 ? '#fef3c7' : '#dcfce7'}; color: ${dr.closing_wip > 0 ? '#92400e' : '#166534'}; padding: 1.5px 6px; border-radius: 3px; font-weight: 700; font-size: 9.5px;">${dr.status}</span></td>
                            </tr>
                        `;
                    });

                    dBody.innerHTML = dHtml;

                    if (dFoot) {
                        dFoot.innerHTML = `
                            <tr>
                                <td colspan="3" style="text-align: center; text-transform: uppercase;">Totals</td>
                                <td style="text-align: right; color: #0284c7;">+${this.formatQty(totIss)} KG</td>
                                <td style="text-align: right;">Rs. ${this.formatCurrency(totIssVal)}</td>
                                <td style="text-align: right; color: #15803d;">-${this.formatQty(totProd)} KG</td>
                                <td style="text-align: right; background: #dcfce7; color: #15803d;">${this.formatQty(rec.closing_wip_qty)} KG</td>
                                <td style="text-align: center;">${rec.yield_pct}%</td>
                                <td></td>
                            </tr>
                        `;
                    }
                }
            }

            // Sync Expense Input fields if in auto mode
            const expMode = document.getElementById('pcExpenseMode')?.value || 'auto';
            if (expMode === 'auto') {
                const elElec = document.getElementById('pcInputElectricity');
                const elLabor = document.getElementById('pcInputLabor');
                const elOvh = document.getElementById('pcInputOverheads');
                if (elElec) elElec.value = cost.electricity_cost || 0;
                if (elLabor) elLabor.value = cost.labor_cost || 0;
                if (elOvh) elOvh.value = cost.overhead_cost || 0;
            }

            // Render Card 1: Reconciliation Meezan
            document.getElementById('pcRecPrevMonth').textContent = data.prev_period_label || 'Prev Closing';
            document.getElementById('pcRecCurMonth').textContent = data.current_period_label || 'Floor Balance';
            document.getElementById('pcRecOpeningWip').textContent = `${this.formatQty(rec.opening_wip_qty)} KG`;
            document.getElementById('pcRecMaterialIssued').textContent = `${this.formatQty(rec.material_issued_qty)} KG`;
            document.getElementById('pcRecFinishedGoods').textContent = `${this.formatQty(rec.finished_prod_qty)} KG`;
            if (document.getElementById('pcRecScrapWastage')) {
                document.getElementById('pcRecScrapWastage').textContent = `0 KG`;
            }
            document.getElementById('pcRecClosingWip').textContent = `${this.formatQty(rec.closing_wip_qty)} KG`;
            document.getElementById('pcRecYieldPct').textContent = `${rec.yield_pct}%`;
            if (document.getElementById('pcRecScrapPct')) {
                document.getElementById('pcRecScrapPct').textContent = `0%`;
            }

            // Render Card 2: Cost Sheet Breakdown
            document.getElementById('pcCostMatPct').textContent = `${cost.material_pct}%`;
            document.getElementById('pcCostMatTotal').textContent = `Rs. ${this.formatCurrency(cost.material_consumed_val)}`;
            document.getElementById('pcCostMatPerKg').textContent = `Rs. ${this.formatDecimal(cost.material_cost_per_kg, 2)} / KG`;

            document.getElementById('pcCostElecPct').textContent = `${cost.electricity_pct}%`;
            document.getElementById('pcCostElecTotal').textContent = `Rs. ${this.formatCurrency(cost.electricity_cost)}`;
            document.getElementById('pcCostElecPerKg').textContent = `Rs. ${this.formatDecimal(cost.electricity_cost_per_kg, 2)} / KG`;

            document.getElementById('pcCostLaborPct').textContent = `${cost.labor_pct}%`;
            document.getElementById('pcCostLaborTotal').textContent = `Rs. ${this.formatCurrency(cost.labor_cost)}`;
            document.getElementById('pcCostLaborPerKg').textContent = `Rs. ${this.formatDecimal(cost.labor_cost_per_kg, 2)} / KG`;

            document.getElementById('pcCostOvhPct').textContent = `${cost.overhead_pct}%`;
            document.getElementById('pcCostOvhTotal').textContent = `Rs. ${this.formatCurrency(cost.overhead_cost)}`;
            document.getElementById('pcCostOvhPerKg').textContent = `Rs. ${this.formatDecimal(cost.overhead_cost_per_kg, 2)} / KG`;

            document.getElementById('pcCostGrandTotal').textContent = `Rs. ${this.formatCurrency(cost.total_manufacturing_cost)}`;
            document.getElementById('pcCostGrandPerKg').textContent = `Rs. ${this.formatDecimal(cost.total_cost_per_kg, 2)} / KG`;

            // Render Card 3: WIP Continuous Auto-Roll Chain
            document.getElementById('pcBoxPrevClosingLabel').textContent = `${data.prev_period_label || 'Oct'} Closing`;
            document.getElementById('pcBoxPrevClosingQty').textContent = `${this.formatQty(carry.prev_closing_qty)} KG`;
            document.getElementById('pcBoxPrevClosingVal').textContent = `Rs. ${this.formatCurrency(carry.prev_closing_val)}`;

            document.getElementById('pcBoxCurOpeningLabel').textContent = `${data.current_period_label || 'Nov'} Opening`;
            document.getElementById('pcBoxCurOpeningQty').textContent = `${this.formatQty(carry.cur_opening_qty)} KG`;
            document.getElementById('pcBoxCurOpeningVal').textContent = `Rs. ${this.formatCurrency(carry.cur_opening_val)}`;

            document.getElementById('pcBoxCurClosingLabel').textContent = `${data.current_period_label || 'Nov'} Closing`;
            document.getElementById('pcBoxCurClosingQty').textContent = `${this.formatQty(carry.cur_closing_qty)} KG`;
            document.getElementById('pcBoxCurClosingVal').textContent = `Rs. ${this.formatCurrency(carry.cur_closing_val)}`;

            document.getElementById('pcBoxNextOpeningLabel').textContent = `${data.next_period_label || 'Dec'} Opening`;
            document.getElementById('pcBoxNextOpeningQty').textContent = `${this.formatQty(carry.next_opening_qty)} KG`;
            document.getElementById('pcBoxNextOpeningVal').textContent = `Rs. ${this.formatCurrency(carry.next_opening_val)}`;

            // Ensure event listeners are attached to new rows
            this.bindEvents();
        },

        saveAndLockWip: async function() {
            if (!this.data.lastReportData) return alert("Please generate the report first.");

            const rec = this.data.lastReportData.reconciliation || {};
            const cost = this.data.lastReportData.cost_sheet || {};
            const fromDate = document.getElementById('pcFromDate')?.value || '';
            const d = new Date(fromDate);
            const yr = d.getFullYear();
            const mo = d.getMonth() + 1;

            if (!confirm(`Are you sure you want to save and lock Month-End Closing WIP for ${mo}/${yr}?\n\nClosing WIP: ${this.formatQty(rec.closing_wip_qty)} KG\nValuation: Rs. ${this.formatCurrency(rec.closing_wip_val)}\nCost / KG: Rs. ${cost.total_cost_per_kg}`)) {
                return;
            }

            try {
                const formData = new FormData();
                formData.append('company_id', this.data.company_id);
                formData.append('year', yr);
                formData.append('month', mo);
                formData.append('closing_wip_qty', rec.closing_wip_qty || 0);
                formData.append('closing_wip_val', rec.closing_wip_val || 0);
                formData.append('per_kg_cost', cost.total_cost_per_kg || 0);

                const res = await fetch('api/production_costing.php?action=save_wip_closing', {
                    method: 'POST',
                    body: formData
                });
                const json = await res.json();
                if (json.status === 'success') {
                    alert("Month-End Closing WIP has been locked and saved successfully!");
                    this.loadReport();
                } else {
                    alert("Error: " + (json.error || 'Failed to save WIP.'));
                }
            } catch (err) {
                alert("Network error: " + err.message);
            }
        },

        toggleExportDropdown: function(e) {
            e.stopPropagation();
            const drop = document.getElementById('pcExportDropdown');
            if (drop) {
                drop.style.display = (drop.style.display === 'block') ? 'none' : 'block';
            }
        },

        exportExcel: function() {
            const isMonthly = (this.data.viewMode === 'monthly');
            const table = isMonthly ? document.getElementById('pcMonthlyTable') : document.getElementById('pcDailyTable');
            if (!table) return;

            const period = document.getElementById('pcHeaderPeriodDisplay')?.textContent || 'Statement';
            const html = table.outerHTML;

            const blob = new Blob([
                '\ufeff' + `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Production Costing</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                    <meta charset="utf-8">
                </head>
                <body>
                    <h2>${this.data.companyName}</h2>
                    <h3>Production Costing, Material Consumption & WIP Statement (${period})</h3>
                    <div>Mode: ${isMonthly ? 'Monthly Product-Wise Cost Sheet' : 'Daily WIP Flow Breakdown'}</div>
                    ${html}
                </body>
                </html>
                `
            ], { type: 'application/vnd.ms-excel;charset=utf-8' });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Production_Costing_${period.replace(/[\s\/-]+/g, '_')}.xls`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const drop = document.getElementById('pcExportDropdown');
            if (drop) drop.style.display = 'none';
        },

        exportPDF: function() {
            const drop = document.getElementById('pcExportDropdown');
            if (drop) drop.style.display = 'none';
            this.printReport();
        },

        printReport: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = window.selectedCompanyId || session.company_id || this.data.company_id || 1;
            const userName = session.name || session.username || 'User';

            let comp = this.data.companyInfo;
            if (!comp || !comp.name) {
                comp = await this.loadCompanyProfile();
            }

            let actualLogo = '';
            if (comp.logo_data && comp.logo_data.length > 50) {
                actualLogo = comp.logo_data;
            } else if (typeof window.getCompanyLogo === 'function') {
                actualLogo = window.getCompanyLogo();
            } else if (typeof logoData !== 'undefined' && logoData) {
                actualLogo = logoData;
            } else {
                actualLogo = localStorage.getItem('softifyx_logo') || 'assets/logos/logo.png';
            }

            const companyName = (comp.name || session.company_name || 'SOFTIFYX FINANCIALS').toUpperCase();
            const periodStr = document.getElementById('pcHeaderPeriodDisplay')?.textContent || 'Current Period';
            const isMonthly = (this.data.viewMode === 'monthly');
            const tableEl = isMonthly ? document.getElementById('pcMonthlyTable') : document.getElementById('pcDailyTable');
            const tableHtml = tableEl ? tableEl.outerHTML : '<p>No data</p>';

            // Contact rows
            let contactParts = [];
            if (comp.address) contactParts.push(`<span><i class="fas fa-map-marker-alt"></i> ${comp.address}</span>`);
            let coms = [];
            if (comp.phone) coms.push(`<i class="fas fa-phone-alt"></i> ${comp.phone}`);
            if (comp.email) coms.push(`<i class="fas fa-envelope"></i> ${comp.email}`);
            if (comp.website) coms.push(`<i class="fas fa-globe"></i> ${comp.website}`);
            if (coms.length > 0) contactParts.push(`<span>${coms.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</span>`);
            let tax = [];
            if (comp.ntn) tax.push(`<strong>NTN:</strong> ${comp.ntn}`);
            if (comp.gst) tax.push(`<strong>STRN / GST:</strong> ${comp.gst}`);
            if (tax.length > 0) contactParts.push(`<span>${tax.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</span>`);

            // Fetch summary cards data
            const recOpWip = document.getElementById('pcRecOpeningWip')?.textContent || '0 KG';
            const recIss = document.getElementById('pcRecMaterialIssued')?.textContent || '0 KG';
            const recProd = document.getElementById('pcRecFinishedGoods')?.textContent || '0 KG';
            const recScrap = document.getElementById('pcRecScrapWastage')?.textContent || '0 KG';
            const recCloseWip = document.getElementById('pcRecClosingWip')?.textContent || '0 KG';
            const recYield = document.getElementById('pcRecYieldPct')?.textContent || '100%';

            const cMat = document.getElementById('pcCostMatTotal')?.textContent || 'Rs. 0';
            const cMatKg = document.getElementById('pcCostMatPerKg')?.textContent || 'Rs. 0/KG';
            const cElec = document.getElementById('pcCostElecTotal')?.textContent || 'Rs. 0';
            const cElecKg = document.getElementById('pcCostElecPerKg')?.textContent || 'Rs. 0/KG';
            const cLabor = document.getElementById('pcCostLaborTotal')?.textContent || 'Rs. 0';
            const cLaborKg = document.getElementById('pcCostLaborPerKg')?.textContent || 'Rs. 0/KG';
            const cOvh = document.getElementById('pcCostOvhTotal')?.textContent || 'Rs. 0';
            const cOvhKg = document.getElementById('pcCostOvhPerKg')?.textContent || 'Rs. 0/KG';
            const cTot = document.getElementById('pcCostGrandTotal')?.textContent || 'Rs. 0';
            const cTotKg = document.getElementById('pcCostGrandPerKg')?.textContent || 'Rs. 0.00 / KG';

            const b1Title = document.getElementById('pcBoxPrevClosingLabel')?.textContent || 'Prev Closing';
            const b1Qty = document.getElementById('pcBoxPrevClosingQty')?.textContent || '0 KG';
            const b1Val = document.getElementById('pcBoxPrevClosingVal')?.textContent || 'Rs. 0';
            const b2Title = document.getElementById('pcBoxCurOpeningLabel')?.textContent || 'Period Opening';
            const b2Qty = document.getElementById('pcBoxCurOpeningQty')?.textContent || '0 KG';
            const b2Val = document.getElementById('pcBoxCurOpeningVal')?.textContent || 'Rs. 0';
            const b3Title = document.getElementById('pcBoxCurClosingLabel')?.textContent || 'Period Closing';
            const b3Qty = document.getElementById('pcBoxCurClosingQty')?.textContent || '0 KG';
            const b3Val = document.getElementById('pcBoxCurClosingVal')?.textContent || 'Rs. 0';
            const b4Title = document.getElementById('pcBoxNextOpeningLabel')?.textContent || 'Next Opening';
            const b4Qty = document.getElementById('pcBoxNextOpeningQty')?.textContent || '0 KG';
            const b4Val = document.getElementById('pcBoxNextOpeningVal')?.textContent || 'Rs. 0';

            const printHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Production Costing & WIP Statement - ${periodStr}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        @page { size: landscape; margin: 6mm 8mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1e293b; margin: 0; padding: 5px; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2.5px solid #1F4E79; padding-bottom: 8px; margin-bottom: 8px; }
        .header-logo { width: 140px; text-align: left; }
        .header-logo img { max-height: 60px; max-width: 135px; object-fit: contain; }
        .header-center { flex: 1; text-align: center; padding: 0 10px; }
        .comp-title { margin: 0; font-size: 20px; font-weight: 800; color: #1F4E79; text-transform: uppercase; }
        .comp-contacts { font-size: 9.5px; color: #475569; margin-top: 3px; line-height: 1.4; }
        .comp-contacts i { color: #1F4E79; margin-right: 2px; }
        .report-title-badge { display: inline-block; background: #1F4E79; color: white; font-size: 11.5px; font-weight: 700; padding: 3px 14px; border-radius: 3px; margin-top: 5px; text-transform: uppercase; }
        .report-subtitle { font-size: 9px; color: #64748b; margin-top: 2px; font-style: italic; }
        .header-right { width: 140px; text-align: right; font-size: 9px; color: #475569; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
        .badge-type { background: #F5A623; color: white; padding: 2px 8px; font-size: 9px; font-weight: 700; border-radius: 3px; margin-bottom: 4px; text-transform: uppercase; }
        .filter-meta-bar { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 10px 20px; font-size: 9.5px; color: #334155; }
        .filter-meta-bar strong { color: #1F4E79; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
        table th, table td { border: 1px solid #94a3b8; padding: 3.5px 5px; }
        table thead tr th { background-color: #1F4E79 !important; color: white !important; font-weight: 700; text-align: center; }
        table tbody tr:nth-child(even) { background-color: #f8fafc; }
        table tfoot tr td { background-color: #e2e8f0 !important; font-weight: 800; border-top: 2px solid #1F4E79; font-size: 10px; }
        .summary-container { display: flex; gap: 10px; margin-top: 10px; page-break-inside: avoid; }
        .summary-card { border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: white; }
        .card-header { background: #1F4E79; color: white; font-weight: 700; font-size: 10px; padding: 4px 8px; display: flex; justify-content: space-between; }
        .summary-row { display: flex; justify-content: space-between; padding: 3px 8px; border-bottom: 1px dashed #e2e8f0; font-size: 9.5px; }
        .summary-row:last-child { border-bottom: none; }
        .flow-chain { display: flex; align-items: center; justify-content: space-around; padding: 8px 6px; gap: 4px; }
        .flow-box { border-radius: 4px; padding: 5px 6px; text-align: center; min-width: 75px; }
        .flow-box-title { font-size: 8.5px; font-weight: 700; }
        .flow-box-qty { font-size: 9.5px; font-weight: 800; margin-top: 2px; }
        .flow-box-val { font-size: 8.5px; font-weight: 600; }
        .signatures-area { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 8px; page-break-inside: avoid; }
        .sig-box { width: 18%; text-align: center; border-top: 1px solid #475569; padding-top: 3px; font-size: 9px; font-weight: 600; color: #334155; }
        .footer-note { margin-top: 10px; font-size: 8.5px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px dotted #cbd5e1; padding-top: 4px; font-style: italic; }
        .pc-cat-toggle { display: none !important; }
        .pc-sub-row { display: table-row !important; }
    </style>
</head>
<body>
    <div class="print-header">
        <div class="header-logo">${actualLogo ? `<img src="${actualLogo}" alt="Logo">` : ''}</div>
        <div class="header-center">
            <h1 class="comp-title">${companyName}</h1>
            <div class="comp-contacts">${contactParts.join('<br>')}</div>
            <div class="report-title-badge">PRODUCTION COSTING & WORK-IN-PROCESS STATEMENT</div>
            <div class="report-subtitle">Monthly Manufacturing Cost Sheet, Material Reconciliation & WIP Carry Forward</div>
        </div>
        <div class="header-right">
            <span class="badge-type">Cost Accounting</span>
            <div><strong>Printed:</strong> ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div><strong>User:</strong> ${userName}</div>
        </div>
    </div>

    <div class="filter-meta-bar">
        <div><strong>Period / Date:</strong> ${periodStr}</div>
        <div><strong>Report Mode:</strong> ${isMonthly ? 'Monthly Product-Wise Cost Sheet' : 'Daily WIP Flow Breakdown'}</div>
        <div><strong>Material Cost Basis:</strong> Weighted Average Cost</div>
        <div><strong>Net Production Cost:</strong> ${cTotKg}</div>
        <div><strong>Overall Yield:</strong> ${recYield}</div>
    </div>

    ${tableHtml}

    <div class="summary-container">
        <!-- Reconciliation Card -->
        <div class="summary-card" style="flex: 1;">
            <div class="card-header">
                <span><i class="fas fa-balance-scale"></i> Material & WIP Reconciliation</span>
                <span>Quantities in KG</span>
            </div>
            <div style="padding: 4px 6px;">
                <div class="summary-row"><span>Opening WIP (Prev Closing):</span> <strong style="color: #854d0e;">${recOpWip}</strong></div>
                <div class="summary-row"><span>(+) Raw Material Issued:</span> <strong style="color: #0369a1;">${recIss}</strong></div>
                <div class="summary-row"><span>(-) Finished Goods Produced:</span> <strong style="color: #15803d;">${recProd}</strong></div>
                <div class="summary-row" style="background: #f0fdf4; font-weight: 800;"><span style="color: #15803d;">(=) Closing WIP:</span> <strong style="color: #15803d;">${recCloseWip}</strong></div>
            </div>
        </div>

        <!-- Cost Sheet Card -->
        <div class="summary-card" style="flex: 1.2;">
            <div class="card-header">
                <span><i class="fas fa-file-invoice-dollar"></i> Manufacturing Cost Sheet</span>
                <span>PKR & Per-KG Breakdown</span>
            </div>
            <div style="padding: 4px 6px;">
                <div class="summary-row"><span>Raw Material Consumed:</span> <span><strong>${cMat}</strong> &bull; ${cMatKg}</span></div>
                <div class="summary-row"><span>Factory Electricity:</span> <span><strong>${cElec}</strong> &bull; ${cElecKg}</span></div>
                <div class="summary-row"><span>Direct Labor & Wages:</span> <span><strong>${cLabor}</strong> &bull; ${cLaborKg}</span></div>
                <div class="summary-row"><span>Factory Maintenance & Overheads:</span> <span><strong>${cOvh}</strong> &bull; ${cOvhKg}</span></div>
                <div class="summary-row" style="background: #eff6ff; font-weight: 800; font-size: 10.5px;"><span style="color: #1e40af;">TOTAL COST:</span> <span><strong style="color: #1e40af;">${cTot}</strong> &bull; <strong style="color: #dc2626;">${cTotKg}</strong></span></div>
            </div>
        </div>

        <!-- Carry Forward Roll -->
        <div class="summary-card" style="flex: 1.1;">
            <div class="card-header">
                <span><i class="fas fa-check-circle"></i> WIP Auto-Roll Chain</span>
                <span>Continuous Carry Forward</span>
            </div>
            <div class="flow-chain">
                <div class="flow-box" style="background: #fef9c3; border: 1px solid #fde047;">
                    <div class="flow-box-title" style="color: #854d0e;">${b1Title}</div>
                    <div class="flow-box-qty">${b1Qty}</div>
                    <div class="flow-box-val" style="color: #854d0e;">${b1Val}</div>
                </div>
                <div style="color: #1F4E79; font-weight: bold;">&rarr;</div>
                <div class="flow-box" style="background: #dbeafe; border: 1px solid #bfdbfe;">
                    <div class="flow-box-title" style="color: #1d4ed8;">${b2Title}</div>
                    <div class="flow-box-qty">${b2Qty}</div>
                    <div class="flow-box-val" style="color: #1d4ed8;">${b2Val}</div>
                </div>
                <div style="color: #94a3b8; font-size: 10px;">••• &rarr;</div>
                <div class="flow-box" style="background: #dcfce7; border: 1px solid #bbf7d0;">
                    <div class="flow-box-title" style="color: #15803d;">${b3Title}</div>
                    <div class="flow-box-qty">${b3Qty}</div>
                    <div class="flow-box-val" style="color: #15803d;">${b3Val}</div>
                </div>
                <div style="color: #1F4E79; font-weight: bold;">&rarr;</div>
                <div class="flow-box" style="background: #e0f2fe; border: 1px solid #bae6fd;">
                    <div class="flow-box-title" style="color: #0284c7;">${b4Title}</div>
                    <div class="flow-box-qty">${b4Qty}</div>
                    <div class="flow-box-val" style="color: #0284c7;">${b4Val}</div>
                </div>
            </div>
        </div>
    </div>

    <div class="signatures-area">
        <div class="sig-box">Prepared By (${userName})</div>
        <div class="sig-box">Checked By (Store)</div>
        <div class="sig-box">Plant / Factory Supervisor</div>
        <div class="sig-box">Cost Accountant</div>
        <div class="sig-box">Approved By (Director)</div>
    </div>

    <div class="footer-note">
        <span>SoftifyX Financials ERP &bull; Industrial Cost of Production & Manufacturing Accounting System</span>
        <span>Generated electronically &bull; Authentic System Record</span>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
        };
    </script>
</body>
</html>
            `;

            const printWindow = window.open('', '_blank', 'width=1200,height=850');
            printWindow.document.open();
            printWindow.document.write(printHtml);
            printWindow.document.close();
        },

        resetFilters: function() {
            this.setDefaultDates();

            const presetSel = document.getElementById('pcDatePreset');
            const pSel = document.getElementById('pcProductFilter');
            const expSel = document.getElementById('pcExpenseMode');

            if (presetSel) presetSel.value = 'this_month';
            if (pSel) pSel.value = 'all';
            if (expSel) expSel.value = 'auto';

            this.switchViewMode('monthly');
            this.loadReport();
        },

        formatQty: function(num) {
            const val = parseFloat(num || 0);
            return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        },

        formatCurrency: function(num) {
            const val = Math.round(parseFloat(num || 0));
            return val.toLocaleString('en-US');
        },

        formatDecimal: function(num, decimals = 2) {
            const val = parseFloat(num || 0);
            return val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }
    };

    window.ProductionCostingModule = ProductionCostingModule;
})();
