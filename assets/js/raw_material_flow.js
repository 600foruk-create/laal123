(function() {
    const RawMaterialFlowModule = {
        data: {
            company_id: 1,
            companyName: 'SoftifyX Financials',
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
                    const drop = document.getElementById('rmfExportDropdown');
                    if (drop && !e.target.closest('#rmfExportDropdown') && !e.target.closest('.rmf-btn-success')) {
                        drop.style.display = 'none';
                    }
                });
                this._boundExportClick = true;
            }

            this.setDefaultDates();

            // Load company profile in background
            this.loadCompanyProfile().catch(e => console.warn("Company profile load:", e));

            try {
                await this.loadMeta();
            } catch (e) {
                console.warn("Meta load error:", e);
            }

            await this.loadReport();
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

            const fromInput = document.getElementById('rmfFromDate');
            const toInput = document.getElementById('rmfToDate');

            if (fromInput && !fromInput.value) fromInput.value = fromStr;
            if (toInput && !toInput.value) toInput.value = toStr;
        },

        applyDatePreset: function() {
            const preset = document.getElementById('rmfDatePreset')?.value;
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
                // Pakistani FY typically Jul 1 to Jun 30
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

                const fInput = document.getElementById('rmfFromDate');
                const tInput = document.getElementById('rmfToDate');
                if (fInput) fInput.value = formatDate(fromDate);
                if (tInput) tInput.value = formatDate(toDate);

                this.loadReport();
            }
        },

        onDateInputChange: function() {
            const presetSel = document.getElementById('rmfDatePreset');
            if (presetSel) presetSel.value = 'custom';
            this.loadReport();
        },

        loadMeta: async function() {
            try {
                const res = await fetch(`api/raw_material_flow.php?action=get_meta&company_id=${this.data.company_id}`);
                if (!res.ok) return;

                const json = await res.json();
                if (json.status !== 'success') return;

                this.data.meta = json;

                // Sync company details from DB response
                if (json.company && json.company.name) {
                    this.data.companyInfo = Object.assign({}, this.data.companyInfo || {}, json.company);
                    this.data.companyName = this.data.companyInfo.name;
                }

                this.data.allItems = json.all_items || json.raw_materials || [];
                this.data.rawMaterials = json.raw_materials || [];
                this.data.categories = json.categories || [];

                // 1. Populate Items / Raw Materials
                const rmSel = document.getElementById('rmfRawMaterial');
                if (rmSel) {
                    rmSel.innerHTML = '<option value="all">All</option>';
                    (json.raw_materials || json.all_items || []).forEach(rm => {
                        const opt = document.createElement('option');
                        opt.value = rm.id;
                        opt.textContent = `${rm.name} (${rm.code || rm.unit || 'KG'})`;
                        rmSel.appendChild(opt);
                    });
                }

                // 2. Populate Categories
                const catSel = document.getElementById('rmfCategory');
                if (catSel) {
                    catSel.innerHTML = '<option value="all">All</option>';
                    (json.categories || []).forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = c.name;
                        catSel.appendChild(opt);
                    });
                }

                // 3. Populate Suppliers
                const supSel = document.getElementById('rmfSupplier');
                if (supSel) {
                    supSel.innerHTML = '<option value="all">All</option>';
                    (json.suppliers || []).forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.name;
                        supSel.appendChild(opt);
                    });
                }

            } catch (err) {
                console.error("Error loading Raw Material Flow meta:", err);
            }
        },

        onCategoryChange: function() {
            const catSel = document.getElementById('rmfCategory');
            const rmSel = document.getElementById('rmfRawMaterial');
            const catId = catSel?.value || 'all';
            const catText = (catSel?.options[catSel.selectedIndex]?.text || '').trim().toUpperCase();

            // Update item label dynamically
            const itemLabel = document.getElementById('rmfItemLabel');
            const thItemCol = document.getElementById('rmfThItemCol');
            const isRaw = catId === 'all' || catText.includes('RAW') || catText.includes('MATERIAL') || catText.includes('RESIN') || catText.includes('CHEMICAL');

            if (itemLabel) itemLabel.textContent = isRaw ? 'Raw Material:' : 'Item / Product:';
            if (thItemCol) thItemCol.textContent = isRaw ? 'Raw Material' : 'Item / Description';

            if (rmSel) {
                rmSel.innerHTML = '<option value="all">All</option>';
                const all = this.data.allItems || [];
                let filtered = all;

                if (catId !== 'all') {
                    const cid = parseInt(catId);
                    filtered = all.filter(it => {
                        const itCatId = parseInt(it.category_id || 0);
                        const itCatName = (it.category_name || '').trim().toUpperCase();
                        const itBrandName = (it.brand_name || '').trim().toUpperCase();
                        const itType = (it.category_type || '').trim().toUpperCase();
                        return itCatId === cid || itCatName === catText || itBrandName === catText || itType === catText;
                    });
                } else if (this.data.rawMaterials && this.data.rawMaterials.length > 0) {
                    filtered = this.data.rawMaterials;
                }

                filtered.forEach(it => {
                    const opt = document.createElement('option');
                    opt.value = it.id;
                    opt.textContent = `${it.name} (${it.code || it.unit || 'Pcs'})`;
                    rmSel.appendChild(opt);
                });
            }

            this.loadReport();
        },

        loadReport: async function() {
            const tbody = document.getElementById('rmfTableBody');
            const tfoot = document.getElementById('rmfTableFoot');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 30px; color: var(--theme-primary, #1F4E79);"><i class="fas fa-spinner fa-spin fa-2x"></i><br><span style="display:inline-block; margin-top:8px; font-weight:600;">Calculating Inventory &amp; Material Flow...</span></td></tr>`;
            }
            if (tfoot) tfoot.innerHTML = '';

            const fromDate = document.getElementById('rmfFromDate')?.value || '';
            const toDate = document.getElementById('rmfToDate')?.value || '';
            const rmId = document.getElementById('rmfRawMaterial')?.value || 'all';
            const catId = document.getElementById('rmfCategory')?.value || 'all';
            const supId = document.getElementById('rmfSupplier')?.value || 'all';
            const showZero = document.getElementById('rmfShowZeroBalance')?.checked ? '1' : '0';
            const viewUnit = document.getElementById('rmfViewUnit')?.value || 'base';
            const costingMethod = document.getElementById('rmfCostingMethod')?.value || 'average_cost';

            const queryUrl = `api/raw_material_flow.php?action=get_flow_statement&company_id=${this.data.company_id}&from_date=${fromDate}&to_date=${toDate}&raw_material_id=${rmId}&category_id=${catId}&supplier_id=${supId}&show_zero_balance=${showZero}&view_unit=${viewUnit}&costing_method=${costingMethod}`;

            try {
                const res = await fetch(queryUrl);
                if (!res.ok) throw new Error("HTTP " + res.status);

                const data = await res.json();
                if (data.status !== 'success') {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: #dc2626; padding: 15px;">Error: ${data.error || 'Failed to fetch data'}</td></tr>`;
                    return;
                }

                this.data.lastReportData = data;

                // Sync company details from DB response
                if (data.company && data.company.name) {
                    this.data.companyInfo = Object.assign({}, this.data.companyInfo || {}, data.company);
                    this.data.companyName = this.data.companyInfo.name;
                }

                this.renderReport(data, costingMethod, viewUnit);

            } catch (err) {
                console.error("Error generating raw material flow report:", err);
                if (tbody) tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: #dc2626; padding: 15px;">Failed to load report. Please try again.</td></tr>`;
            }
        },

        renderReport: function(data, costingMethod, viewUnit) {
            const rows = data.rows || [];
            const totals = data.totals || {};
            const summary = data.period_summary || {};

            // Dynamic Costing Title
            const costingTitles = {
                'average_cost': 'Average Cost',
                'last_purchase': 'Last Purchase Rate',
                'max_purchase': 'Max Purchase Rate',
                'min_purchase': 'Min Purchase Rate',
                'master_rate': 'Master Rate',
                'fifo': 'FIFO Rate'
            };
            const thCostTitle = document.getElementById('rmfThCostingTitle');
            if (thCostTitle) thCostTitle.textContent = costingTitles[costingMethod] || 'Average Cost';

            // Update Header Labels
            const headerDisplay = document.getElementById('rmfHeaderPeriodDisplay');
            if (headerDisplay) headerDisplay.textContent = summary.current_period_label || '';

            const thOpening = document.getElementById('rmfThOpeningPeriod');
            if (thOpening) thOpening.textContent = `(From ${summary.prev_period_label || ''} Closing)`;

            const thPurchases = document.getElementById('rmfThPurchasesPeriod');
            if (thPurchases) thPurchases.textContent = `(${summary.current_period_label || ''})`;

            const thClosing = document.getElementById('rmfThClosingPeriod');
            if (thClosing) thClosing.textContent = `(As of ${summary.current_period_label || ''})`;

            // Populate Main Table Body
            const tbody = document.getElementById('rmfTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 25px; color: #64748b;">No items found for the selected period and criteria.</td></tr>`;
            } else {
                rows.forEach((r, idx) => {
                    const tr = document.createElement('tr');
                    tr.style.background = (idx % 2 === 0) ? '#ffffff' : '#f8fafc';
                    
                    tr.innerHTML = `
                        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: 600; color: #475569;">${r.sr}</td>
                        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: var(--theme-primary, #1F4E79);">${this.escapeHTML(r.raw_material)}</td>
                        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: 700; color: #334155;">${r.unit}</td>
                        
                        <!-- Opening -->
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #fefce8; font-weight: 600;">${this.formatQty(r.opening_qty)}</td>
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #fefce8; font-weight: 600; color: #854d0e;">${this.formatCurrency(r.opening_val)}</td>

                        <!-- Purchases -->
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #f0f9ff; font-weight: 600;">${this.formatQty(r.purchases_qty)}</td>
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #f0f9ff; font-weight: 600; color: #0369a1;">${this.formatCurrency(r.purchases_val)}</td>

                        <!-- Available -->
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 700; color: #1e293b;">${this.formatQty(r.total_avail_qty)}</td>
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 700; color: #1e293b;">${this.formatCurrency(r.total_avail_val)}</td>

                        <!-- Consumption -->
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #fef2f2; font-weight: 600;">${this.formatQty(r.consumption_qty)}</td>
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #fef2f2; font-weight: 600; color: #b91c1c;">${this.formatCurrency(r.consumption_val)}</td>

                        <!-- Closing -->
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #f0fdf4; font-weight: 700; color: #15803d;">${this.formatQty(r.closing_qty)}</td>
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; background: #f0fdf4; font-weight: 700; color: #15803d;">${this.formatCurrency(r.closing_val)}</td>

                        <!-- Valuation Rate / Average Cost -->
                        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: var(--theme-primary, #1F4E79); background: #f8fafc;">${this.formatDecimal(r.average_cost, 2)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Populate Totals Footer Row
            const tfoot = document.getElementById('rmfTableFoot');
            if (tfoot) {
                tfoot.innerHTML = `
                    <tr style="background: #e2e8f0; font-size: 11px;">
                        <td colspan="3" style="padding: 6px 10px; text-align: center; border: 1px solid #cbd5e1; font-size: 12px; font-weight: 800; color: var(--theme-primary, #1F4E79);">Total</td>
                        
                        <!-- Opening Total -->
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #1e293b;">${this.formatQty(totals.opening_qty)}</td>
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #854d0e;">${this.formatCurrency(totals.opening_val)}</td>

                        <!-- Purchases Total -->
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #1e293b;">${this.formatQty(totals.purchases_qty)}</td>
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #0369a1;">${this.formatCurrency(totals.purchases_val)}</td>

                        <!-- Available Total -->
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #1e293b;">${this.formatQty(totals.total_avail_qty)}</td>
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #1e293b;">${this.formatCurrency(totals.total_avail_val)}</td>

                        <!-- Consumption Total -->
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #1e293b;">${this.formatQty(totals.consumption_qty)}</td>
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #b91c1c;">${this.formatCurrency(totals.consumption_val)}</td>

                        <!-- Closing Total -->
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #15803d;">${this.formatQty(totals.closing_qty)}</td>
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: #15803d;">${this.formatCurrency(totals.closing_val)}</td>

                        <!-- Avg Cost Total (Weighted) -->
                        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; color: var(--theme-primary, #1F4E79);">${this.formatDecimal(totals.avg_cost, 2)}</td>
                    </tr>
                `;
            }

            // Update Card 1: Period Summary
            const cardPeriod = document.getElementById('rmfCardPeriodLabel');
            if (cardPeriod) cardPeriod.textContent = summary.current_period_label || 'Selected Period';

            const sumPrevMonth = document.getElementById('rmfSummaryPrevMonth');
            if (sumPrevMonth) sumPrevMonth.textContent = `from ${summary.prev_period_label || ''}`;

            const sumCurMonth = document.getElementById('rmfSummaryCurMonth');
            if (sumCurMonth) sumCurMonth.textContent = `for ${summary.current_period_label || ''}`;

            const setEl = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = 'Rs. ' + this.formatCurrency(val);
            };

            setEl('rmfSummaryOpeningVal', summary.opening_value || 0);
            setEl('rmfSummaryPurchaseVal', summary.purchase_value || 0);
            setEl('rmfSummaryAvailableVal', summary.available_value || 0);
            setEl('rmfSummaryConsumptionVal', summary.consumption_value || 0);
            setEl('rmfSummaryClosingVal', summary.closing_value || 0);

            // Update Card 2: Month to Month Carry Forward Flow
            const cf = summary.carry_forward || {};
            const displayUnitText = summary.display_unit || 'UNITS';
            
            // Box 1: Prev Period Closing
            document.getElementById('rmfFlowPrevClosingTitle').textContent = `${summary.prev_period_label || 'Previous'} Closing`;
            document.getElementById('rmfFlowPrevClosingQty').textContent = `${this.formatQty(cf.prev_closing_qty || 0)} ${displayUnitText}`;
            document.getElementById('rmfFlowPrevClosingVal').textContent = `Rs. ${this.formatCurrency(cf.prev_closing_val || 0)}`;

            // Box 2: Current Period Opening
            document.getElementById('rmfFlowCurOpeningTitle').textContent = `Period Opening`;
            document.getElementById('rmfFlowCurOpeningQty').textContent = `${this.formatQty(cf.cur_opening_qty || 0)} ${displayUnitText}`;
            document.getElementById('rmfFlowCurOpeningVal').textContent = `Rs. ${this.formatCurrency(cf.cur_opening_val || 0)}`;

            // Box 3: Current Period Closing
            document.getElementById('rmfFlowCurClosingTitle').textContent = `Period Closing`;
            document.getElementById('rmfFlowCurClosingQty').textContent = `${this.formatQty(cf.cur_closing_qty || 0)} ${displayUnitText}`;
            document.getElementById('rmfFlowCurClosingVal').textContent = `Rs. ${this.formatCurrency(cf.cur_closing_val || 0)}`;

            // Box 4: Next Period Opening
            document.getElementById('rmfFlowNextOpeningTitle').textContent = `${summary.next_period_label || 'Next'} Opening`;
            document.getElementById('rmfFlowNextOpeningQty').textContent = `${this.formatQty(cf.next_opening_qty || 0)} ${displayUnitText}`;
            document.getElementById('rmfFlowNextOpeningVal').textContent = `Rs. ${this.formatCurrency(cf.next_opening_val || 0)}`;
        },

        toggleExportMenu: function() {
            const drop = document.getElementById('rmfExportDropdown');
            if (drop) {
                drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
            }
        },

        exportExcel: function() {
            const table = document.getElementById('rmfTable');
            if (!table) return;

            const period = document.getElementById('rmfHeaderPeriodDisplay')?.textContent || 'Statement';
            const unit = document.getElementById('rmfViewUnit')?.value || 'base';
            const costing = document.getElementById('rmfCostingMethod')?.value || 'average_cost';

            const html = table.outerHTML;
            const blob = new Blob([
                '\ufeff' + `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Inventory Material Flow</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                    <meta charset="utf-8">
                </head>
                <body>
                    <h2>${this.data.companyName}</h2>
                    <h3>Inventory &amp; Material Flow at Average Cost – Monthly (${period})</h3>
                    <div>Unit: ${unit.toUpperCase()} | Costing Method: ${costing}</div>
                    ${html}
                </body>
                </html>
                `
            ], { type: 'application/vnd.ms-excel;charset=utf-8' });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Inventory_Material_Flow_${period.replace(/[\s\/-]+/g, '_')}.xls`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const drop = document.getElementById('rmfExportDropdown');
            if (drop) drop.style.display = 'none';
        },

        exportPDF: function() {
            const drop = document.getElementById('rmfExportDropdown');
            if (drop) drop.style.display = 'none';
            this.printReport();
        },

        printReport: async function() {
            const printContent = document.getElementById('rmFlowContainer');
            if (!printContent) return;

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = window.selectedCompanyId || session.company_id || this.data.company_id || 1;
            const userName = session.name || session.username || 'User';

            // Ensure full database company profile
            let comp = this.data.companyInfo;
            if (!comp || !comp.name) {
                comp = await this.loadCompanyProfile();
            }

            // Resolve logo
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

            // Filter descriptions
            const periodDisplay = document.getElementById('rmfHeaderPeriodDisplay')?.textContent || 'Current Period';
            const fromDate = document.getElementById('rmfFromDate')?.value || '';
            const toDate = document.getElementById('rmfToDate')?.value || '';
            const periodStr = (fromDate && toDate) ? `${fromDate} to ${toDate}` : periodDisplay;

            const unitEl = document.getElementById('rmfViewUnit');
            const unitLabel = unitEl?.options[unitEl.selectedIndex]?.text || 'Base Unit';

            const costingEl = document.getElementById('rmfCostingMethod');
            const costingLabel = costingEl?.options[costingEl.selectedIndex]?.text || 'Weighted Average Cost';

            const catEl = document.getElementById('rmfCategory');
            const catLabel = catEl?.options[catEl.selectedIndex]?.text || 'All';

            const rmEl = document.getElementById('rmfRawMaterial');
            const rmLabel = rmEl?.options[rmEl.selectedIndex]?.text || 'All';

            const supEl = document.getElementById('rmfSupplier');
            const supLabel = supEl?.options[supEl.selectedIndex]?.text || 'All';

            // Contact rows
            let contactParts = [];
            if (comp.address) {
                contactParts.push(`<span><i class="fas fa-map-marker-alt"></i> ${comp.address}</span>`);
            }
            let coms = [];
            if (comp.phone) coms.push(`<i class="fas fa-phone-alt"></i> ${comp.phone}`);
            if (comp.fax) coms.push(`<i class="fas fa-fax"></i> ${comp.fax}`);
            if (comp.email) coms.push(`<i class="fas fa-envelope"></i> ${comp.email}`);
            if (comp.website) coms.push(`<i class="fas fa-globe"></i> ${comp.website}`);
            if (coms.length > 0) contactParts.push(`<span>${coms.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</span>`);

            let tax = [];
            if (comp.ntn) tax.push(`<strong>NTN:</strong> ${comp.ntn}`);
            if (comp.gst) tax.push(`<strong>STRN / GST:</strong> ${comp.gst}`);
            if (tax.length > 0) contactParts.push(`<span>${tax.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</span>`);

            // Fetch table HTML
            const tableEl = document.getElementById('rmfTable');
            const tableHtml = tableEl ? tableEl.outerHTML : '<p>No data found.</p>';

            // Values for bottom summary
            const summaryPeriod = document.getElementById('rmfCardPeriodLabel')?.textContent || periodStr;
            const opVal = document.getElementById('rmfSummaryOpeningVal')?.textContent || 'Rs. 0';
            const purVal = document.getElementById('rmfSummaryPurchaseVal')?.textContent || 'Rs. 0';
            const avlVal = document.getElementById('rmfSummaryAvailableVal')?.textContent || 'Rs. 0';
            const conVal = document.getElementById('rmfSummaryConsumptionVal')?.textContent || 'Rs. 0';
            const clsVal = document.getElementById('rmfSummaryClosingVal')?.textContent || 'Rs. 0';
            const prevMonthLabel = document.getElementById('rmfSummaryPrevMonth')?.textContent || 'Previous Closing';
            const curMonthLabel = document.getElementById('rmfSummaryCurMonth')?.textContent || 'Selected Period';

            // Values for Carry Forward Chain
            const b1Title = document.getElementById('rmfFlowPrevClosingTitle')?.textContent || 'Previous Closing';
            const b1Qty = document.getElementById('rmfFlowPrevClosingQty')?.textContent || '0';
            const b1Val = document.getElementById('rmfFlowPrevClosingVal')?.textContent || 'Rs. 0';

            const b2Title = document.getElementById('rmfFlowCurOpeningTitle')?.textContent || 'Period Opening';
            const b2Qty = document.getElementById('rmfFlowCurOpeningQty')?.textContent || '0';
            const b2Val = document.getElementById('rmfFlowCurOpeningVal')?.textContent || 'Rs. 0';

            const b3Title = document.getElementById('rmfFlowCurClosingTitle')?.textContent || 'Period Closing';
            const b3Qty = document.getElementById('rmfFlowCurClosingQty')?.textContent || '0';
            const b3Val = document.getElementById('rmfFlowCurClosingVal')?.textContent || 'Rs. 0';

            const b4Title = document.getElementById('rmfFlowNextOpeningTitle')?.textContent || 'Next Opening';
            const b4Qty = document.getElementById('rmfFlowNextOpeningQty')?.textContent || '0';
            const b4Val = document.getElementById('rmfFlowNextOpeningVal')?.textContent || 'Rs. 0';

            const printHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Inventory &amp; Material Flow Statement - ${periodStr}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        @page {
            size: landscape;
            margin: 6mm 8mm;
        }
        * {
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 10px;
            color: #1e293b;
            margin: 0;
            padding: 5px;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        /* Company Letterhead Header */
        .print-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2.5px solid #1F4E79;
            padding-bottom: 8px;
            margin-bottom: 8px;
        }
        .header-logo {
            width: 140px;
            text-align: left;
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .header-logo img {
            max-height: 60px;
            max-width: 135px;
            object-fit: contain;
        }
        .header-center {
            flex: 1;
            text-align: center;
            padding: 0 10px;
        }
        .comp-title {
            margin: 0;
            font-size: 20px;
            font-weight: 800;
            color: #1F4E79;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .comp-contacts {
            font-size: 9.5px;
            color: #475569;
            margin-top: 3px;
            line-height: 1.4;
        }
        .comp-contacts i {
            color: #1F4E79;
            margin-right: 2px;
        }
        .report-title-badge {
            display: inline-block;
            background: #1F4E79;
            color: white;
            font-size: 12px;
            font-weight: 700;
            padding: 3px 14px;
            border-radius: 3px;
            margin-top: 5px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .report-subtitle {
            font-size: 9.5px;
            color: #64748b;
            margin-top: 2px;
            font-style: italic;
        }
        .header-right {
            width: 140px;
            text-align: right;
            font-size: 9px;
            color: #475569;
            line-height: 1.4;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            justify-content: center;
        }
        .badge-type {
            background: #F5A623;
            color: white;
            padding: 2px 8px;
            font-size: 9px;
            font-weight: 700;
            border-radius: 3px;
            margin-bottom: 4px;
            text-transform: uppercase;
            display: inline-block;
        }

        /* Filter Meta Information Bar */
        .filter-meta-bar {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 5px 10px;
            margin-bottom: 8px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px 18px;
            font-size: 9.5px;
            color: #334155;
        }
        .filter-meta-bar strong {
            color: #1F4E79;
        }

        /* Main Data Table */
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
        }
        table th, table td {
            border: 1px solid #94a3b8;
            padding: 3.5px 5px;
        }
        table thead tr:first-child th {
            background-color: #1F4E79 !important;
            color: white !important;
            font-weight: 700;
            text-align: center;
            font-size: 10px;
        }
        table thead tr:nth-child(2) th {
            font-weight: 700;
            font-size: 9px;
            text-align: center;
        }
        table tbody tr:nth-child(even) {
            background-color: #f8fafc;
        }
        table tbody tr:hover {
            background-color: #f1f5f9;
        }
        table tfoot tr td {
            background-color: #e2e8f0 !important;
            font-weight: 800;
            border-top: 2px solid #1F4E79;
            font-size: 10px;
        }

        /* Bottom Section: Two Cards */
        .summary-container {
            display: flex;
            gap: 12px;
            margin-top: 10px;
            page-break-inside: avoid;
        }
        .summary-card {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            overflow: hidden;
            background: white;
        }
        .card-header {
            background: #1F4E79;
            color: white;
            font-weight: 700;
            font-size: 10px;
            padding: 4px 8px;
            display: flex;
            justify-content: space-between;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 8px;
            border-bottom: 1px dashed #e2e8f0;
            font-size: 9.5px;
        }
        .summary-row:last-child {
            border-bottom: none;
        }

        /* Carry Forward Flow Visual */
        .flow-chain {
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding: 8px 6px;
            gap: 6px;
        }
        .flow-box {
            border-radius: 4px;
            padding: 5px 8px;
            text-align: center;
            min-width: 90px;
        }
        .flow-box-title {
            font-size: 9px;
            font-weight: 700;
        }
        .flow-box-qty {
            font-size: 9.5px;
            font-weight: 700;
            color: #1e293b;
            margin-top: 2px;
        }
        .flow-box-val {
            font-size: 9px;
            font-weight: 600;
        }
        .flow-arrow {
            color: #1F4E79;
            font-size: 13px;
            font-weight: bold;
        }

        /* Signatures Footer */
        .signatures-area {
            display: flex;
            justify-content: space-between;
            margin-top: 22px;
            padding-top: 10px;
            page-break-inside: avoid;
        }
        .sig-box {
            width: 18%;
            text-align: center;
            border-top: 1px solid #475569;
            padding-top: 4px;
            font-size: 9px;
            font-weight: 600;
            color: #334155;
        }

        .footer-note {
            margin-top: 10px;
            font-size: 8.5px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            border-top: 1px dotted #cbd5e1;
            padding-top: 4px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <!-- Top Letterhead -->
    <div class="print-header">
        <div class="header-logo">
            ${actualLogo ? `<img src="${actualLogo}" alt="Logo">` : ''}
        </div>
        <div class="header-center">
            <h1 class="comp-title">${companyName}</h1>
            <div class="comp-contacts">
                ${contactParts.join('<br>')}
            </div>
            <div class="report-title-badge">INVENTORY &amp; MATERIAL FLOW AT AVERAGE COST</div>
            <div class="report-subtitle">Monthly &amp; Periodic Stock Flow Statement (Auto Carry Forward)</div>
        </div>
        <div class="header-right">
            <span class="badge-type">Inventory Report</span>
            <div><strong>Printed:</strong> ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div><strong>User:</strong> ${userName}</div>
        </div>
    </div>

    <!-- Filter Meta Bar -->
    <div class="filter-meta-bar">
        <div><strong>Period / Date:</strong> ${periodStr}</div>
        <div><strong>Costing Method:</strong> ${costingLabel}</div>
        <div><strong>Unit:</strong> ${unitLabel}</div>
        <div><strong>Category:</strong> ${catLabel}</div>
        <div><strong>Item / Product:</strong> ${rmLabel}</div>
        <div><strong>Supplier:</strong> ${supLabel}</div>
    </div>

    <!-- Main Table -->
    ${tableHtml}

    <!-- Bottom Section: Summary & Carry Forward Flow -->
    <div class="summary-container">
        <!-- Period Summary -->
        <div class="summary-card" style="flex: 1;">
            <div class="card-header">
                <span><i class="fas fa-file-invoice-dollar"></i> Period Summary (${summaryPeriod})</span>
                <span>Values in PKR</span>
            </div>
            <div style="padding: 4px 6px;">
                <div class="summary-row">
                    <span>Opening Stock Value (${prevMonthLabel}):</span>
                    <strong style="color: #854d0e;">${opVal}</strong>
                </div>
                <div class="summary-row">
                    <span>Total Inward Value (Purchase / Prod.):</span>
                    <strong style="color: #0369a1;">${purVal}</strong>
                </div>
                <div class="summary-row" style="font-weight: 700; background: #f8fafc;">
                    <span>Total Available Value:</span>
                    <strong style="color: #1e293b;">${avlVal}</strong>
                </div>
                <div class="summary-row">
                    <span>Total Outward Value (Issue / Sales):</span>
                    <strong style="color: #b91c1c;">${conVal}</strong>
                </div>
                <div class="summary-row" style="font-weight: 800; background: #f0fdf4;">
                    <span style="color: #15803d;">Closing Stock Value (${curMonthLabel}):</span>
                    <strong style="color: #15803d; font-size: 10.5px;">${clsVal}</strong>
                </div>
            </div>
        </div>

        <!-- Month to Month Carry Forward -->
        <div class="summary-card" style="flex: 1.5;">
            <div class="card-header">
                <span><i class="fas fa-check-circle"></i> Month to Month Carry Forward</span>
                <span>Continuous Auto-Roll Chain</span>
            </div>
            <div class="flow-chain">
                <div class="flow-box" style="background: #fef9c3; border: 1px solid #fde047;">
                    <div class="flow-box-title" style="color: #854d0e;">${b1Title}</div>
                    <div class="flow-box-qty">${b1Qty}</div>
                    <div class="flow-box-val" style="color: #854d0e;">${b1Val}</div>
                </div>

                <div class="flow-arrow">&rarr;</div>

                <div class="flow-box" style="background: #dbeafe; border: 1px solid #bfdbfe;">
                    <div class="flow-box-title" style="color: #1d4ed8;">${b2Title}</div>
                    <div class="flow-box-qty">${b2Qty}</div>
                    <div class="flow-box-val" style="color: #1d4ed8;">${b2Val}</div>
                </div>

                <div class="flow-arrow" style="color: #94a3b8; font-size: 11px;">••• &rarr;</div>

                <div class="flow-box" style="background: #dcfce7; border: 1px solid #bbf7d0;">
                    <div class="flow-box-title" style="color: #15803d;">${b3Title}</div>
                    <div class="flow-box-qty">${b3Qty}</div>
                    <div class="flow-box-val" style="color: #15803d;">${b3Val}</div>
                </div>

                <div class="flow-arrow">&rarr;</div>

                <div class="flow-box" style="background: #e0f2fe; border: 1px solid #bae6fd;">
                    <div class="flow-box-title" style="color: #0284c7;">${b4Title}</div>
                    <div class="flow-box-qty">${b4Qty}</div>
                    <div class="flow-box-val" style="color: #0284c7;">${b4Val}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Signatures -->
    <div class="signatures-area">
        <div class="sig-box">Prepared By (${userName})</div>
        <div class="sig-box">Checked By</div>
        <div class="sig-box">Store Incharge</div>
        <div class="sig-box">Accounts Manager</div>
        <div class="sig-box">Approved By (Director)</div>
    </div>

    <!-- Footer Note -->
    <div class="footer-note">
        <span>SoftifyX Financials ERP &bull; Production & Inventory Management System</span>
        <span>Generated electronically &bull; Authentic System Record</span>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
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

            const presetSel = document.getElementById('rmfDatePreset');
            const rmSel = document.getElementById('rmfRawMaterial');
            const catSel = document.getElementById('rmfCategory');
            const supSel = document.getElementById('rmfSupplier');
            const zeroChk = document.getElementById('rmfShowZeroBalance');
            const unitSel = document.getElementById('rmfViewUnit');
            const costSel = document.getElementById('rmfCostingMethod');

            if (presetSel) presetSel.value = 'this_month';
            if (rmSel) rmSel.value = 'all';
            if (catSel) catSel.value = 'all';
            if (supSel) supSel.value = 'all';
            if (zeroChk) zeroChk.checked = false;
            if (unitSel) unitSel.value = 'base';
            if (costSel) costSel.value = 'average_cost';

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
        },

        escapeHTML: function(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };

    window.RawMaterialFlowModule = RawMaterialFlowModule;
})();
