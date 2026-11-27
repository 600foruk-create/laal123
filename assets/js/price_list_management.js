/**
 * ADVANCED PRICE LIST MANAGEMENT & PRICE REVISION SYSTEM
 * Comprehensive ERP Pricing Engine with Multi-Tier Pricing (General, Brand, Customer),
 * Bulk Adjustments, Preserved Custom Differences, Live Preview & Audit Trail Rollback.
 */

window.PriceListManagementModule = {
    meta: {
        brands: [],
        categories: [],
        customers: [],
        items: [],
        next_revision_no: 'PR-00001',
        today: new Date().toISOString().split('T')[0]
    },
    activeTab: 'bulk_revision',
    previewData: null,
    debounceTimer: null,

    getCompanyId: function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        return session.company_id || 1;
    },

    init: async function() {
        console.log("PriceListManagementModule: Initializing...");
        await this.loadMeta();
        this.renderBrandAdjustmentGrid();
        this.resetRevisionForm();
        this.calculatePreview();
        this.loadGeneralPrices();
        this.loadBrandPricingStats();
    },

    // 1. Fetch Master Data
    loadMeta: async function() {
        try {
            const res = await fetch(`api/price_management.php?action=get_meta&company_id=${this.getCompanyId()}&_t=${Date.now()}`);
            const data = await res.json();
            if (data.status === 'success') {
                this.meta = data;

                // Populate Dropdowns
                this.populateSelect('plm_category', data.categories, 'id', 'name', 'All Categories');
                this.populateSelect('plm_gen_cat_filter', data.categories, 'id', 'name', 'All Categories');

                this.populateSelect('plm_brand', data.brands, 'id', 'name', 'All Brands');
                this.populateSelect('plm_gen_brand_filter', data.brands, 'id', 'name', 'All Brands');

                // Customer tab brand filter (Brand-wise by default, plus All Items option)
                const custBrandEl = document.getElementById('plm_cust_brand_filter');
                if (custBrandEl) {
                    const currentVal = custBrandEl.value;
                    let bHtml = '<option value="" selected>📁 All Brands (Brand-wise)</option>';
                    bHtml += '<option value="all_items">📄 All Items (Item-wise Details)</option>';
                    (data.brands || []).forEach(b => {
                        bHtml += `<option value="${b.id}">🏷️ ${b.name}</option>`;
                    });
                    custBrandEl.innerHTML = bHtml;
                    if (currentVal) custBrandEl.value = currentVal;
                }

                this.populateSelect('plm_modal_brand_select', data.brands, 'id', 'name', '-- Select Brand --');

                this.populateSelect('plm_item', data.items, 'id', 'name', 'All Items');
                this.populateSelect('plm_modal_item_select', data.items, 'id', 'name', '-- Select Item --');

                this.populateSelect('plm_customer', data.customers, 'id', 'name', 'All Customers');
                if (document.getElementById('plm_cust_list_filter')) {
                    this.populateSelect('plm_cust_list_filter', data.customers, 'id', 'name', 'All Customers with Custom Pricing');
                }
                if (document.getElementById('plm_modal_cust_select')) {
                    this.populateSelect('plm_modal_cust_select', data.customers, 'id', 'name', '-- Select Customer --');
                }

                // Print Dialog Dropdowns
                this.populateSelect('plm_print_brand_select', data.brands, 'id', 'name', 'All Brands');
                this.populateSelect('plm_print_cat_select', data.categories, 'id', 'name', 'All Categories');
                this.populateSelect('plm_print_cust_select', data.customers, 'id', 'name', '-- Select Customer --');

                const revNoInp = document.getElementById('plm_rev_no');
                if (revNoInp) revNoInp.value = data.next_revision_no || 'PR-00001';

                const today = data.today || new Date().toISOString().split('T')[0];
                const revDate = document.getElementById('plm_rev_date');
                const effDate = document.getElementById('plm_eff_date');
                const printDateInp = document.getElementById('plm_print_date');
                if (revDate) revDate.value = today;
                if (effDate) effDate.value = today;
                if (printDateInp) printDateInp.value = today;
            }
        } catch (e) {
            console.error("PriceListManagementModule: Error loading meta:", e);
        }
    },

    populateSelect: function(selectId, items, valKey, labelKey, defaultText) {
        const el = document.getElementById(selectId);
        if (!el) return;
        let html = defaultText ? `<option value="">${defaultText}</option>` : '';
        if (Array.isArray(items)) {
            items.forEach(it => {
                const codePrefix = it.code ? `[${it.code}] ` : '';
                html += `<option value="${it[valKey]}">${codePrefix}${it[labelKey]}</option>`;
            });
        }
        el.innerHTML = html;
    },

    // 2. Render Bulk Brand-wise Adjustments Table
    renderBrandAdjustmentGrid: function() {
        const tbody = document.getElementById('plm_brand_tbody');
        if (!tbody) return;
        
        let html = '';
        (this.meta.brands || []).forEach((b, idx) => {
            html += `
                <tr data-brand-id="${b.id}">
                    <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                    <td style="text-align:center;">
                        <input type="checkbox" class="plm-brand-check" onchange="window.PriceListManagementModule.triggerAutoPreview()">
                    </td>
                    <td style="font-weight:700; color:#1e293b;">${b.name}</td>
                    <td>
                        <select class="plm-select plm-brand-method" style="padding:2px 4px; font-size:10.5px;" onchange="window.PriceListManagementModule.triggerAutoPreview()">
                            <option value="Fixed">Fixed Amount</option>
                            <option value="Percentage">Percentage (%)</option>
                        </select>
                    </td>
                    <td>
                        <input type="number" step="0.01" class="plm-input num-cell plm-brand-val" style="padding:2px 4px; font-size:11px; font-weight:700;" value="5.00" oninput="window.PriceListManagementModule.triggerAutoPreview()">
                    </td>
                </tr>
            `;
        });

        if (html === '') {
            html = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#94a3b8;">No brands configured in inventory</td></tr>`;
        }
        tbody.innerHTML = html;
    },

    toggleAllBrands: function(masterCheckbox) {
        const checkboxes = document.querySelectorAll('.plm-brand-check');
        checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
        this.triggerAutoPreview();
    },

    // 3. Tab Switching
    switchTab: function(tabKey) {
        this.activeTab = tabKey;
        const tabs = ['general', 'customer', 'bulk_revision', 'brand', 'history'];
        tabs.forEach(t => {
            const pane = document.getElementById(`plm_pane_${t}`);
            if (pane) {
                if (t === tabKey) pane.classList.add('active');
                else pane.classList.remove('active');
            }
        });

        // Tab button active styling
        const btns = document.querySelectorAll('.plm-tab-btn');
        btns.forEach(btn => {
            if (btn.innerText.toLowerCase().includes(tabKey.replace('_', ' ')) || 
               (tabKey === 'bulk_revision' && btn.innerText.includes('Revision')) ||
               (tabKey === 'general' && btn.innerText.includes('General')) ||
               (tabKey === 'customer' && btn.innerText.includes('Customer')) ||
               (tabKey === 'brand' && btn.innerText.includes('Brand')) ||
               (tabKey === 'history' && btn.innerText.includes('History'))) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Lazy load tab data
        if (tabKey === 'general') this.loadGeneralPrices();
        if (tabKey === 'customer') this.loadCustomerPrices();
        if (tabKey === 'brand') this.loadBrandPricingStats();
        if (tabKey === 'history') this.loadHistory();
    },

    onApplyToChange: function() {
        const applyTo = document.getElementById('plm_apply_to').value;
        const custRow = document.getElementById('plm_cust_row');
        if (custRow) {
            if (applyTo === 'Selected Customers') {
                custRow.style.display = 'grid';
                document.getElementById('plm_customer').focus();
            } else {
                custRow.style.display = 'grid';
                document.getElementById('plm_customer').value = '';
            }
        }
        this.triggerAutoPreview();
    },

    triggerAutoPreview: function() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.calculatePreview();
        }, 300);
    },

    // 4. Calculate Price Update Preview
    calculatePreview: async function() {
        const adjType = document.getElementById('plm_adj_type')?.value || 'Increase';
        const applyTo = document.getElementById('plm_apply_to')?.value || 'All Customers';
        const catId = document.getElementById('plm_category')?.value || null;
        const brandId = document.getElementById('plm_brand')?.value || null;
        const itemId = document.getElementById('plm_item')?.value || null;
        const custId = document.getElementById('plm_customer')?.value || null;
        const method = document.querySelector('input[name="plm_method"]:checked')?.value || 'Fixed';
        const adjValue = parseFloat(document.getElementById('plm_adj_value')?.value || 0);

        // Collect brand adjustments
        const brandAdjustments = [];
        const rows = document.querySelectorAll('#plm_brand_tbody tr');
        rows.forEach(r => {
            const bId = r.dataset.brandId;
            const cb = r.querySelector('.plm-brand-check');
            const m = r.querySelector('.plm-brand-method')?.value || 'Fixed';
            const v = parseFloat(r.querySelector('.plm-brand-val')?.value || 0);
            if (bId && cb && cb.checked) {
                brandAdjustments.push({ brand_id: bId, method: m, value: v, enabled: true });
            }
        });

        const payload = {
            company_id: this.getCompanyId(),
            adjustment_type: adjType,
            apply_to: applyTo,
            category_id: catId,
            brand_id: brandId,
            item_id: itemId,
            customer_id: custId,
            adjustment_method: method,
            adjustment_value: adjValue,
            brand_adjustments: brandAdjustments
        };

        const tbody = document.getElementById('plm_preview_tbody');
        if (tbody && !this.previewData) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:25px; color:#94a3b8;"><i class="fas fa-spinner fa-spin mr-1"></i> Calculating price revision preview...</td></tr>`;
        }

        try {
            const res = await fetch(`api/price_management.php?action=calculate_preview&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.previewData = data;
                this.renderPreview(data);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:#ef4444;">${data.message || 'Error generating preview'}</td></tr>`;
            }
        } catch (e) {
            console.error("PriceListManagementModule: Preview error:", e);
        }
    },

    // 5. Render Preview Table & KPI Stat Boxes
    renderPreview: function(data) {
        const sum = data.summary || {};
        const items = data.preview_rows || [];
        const sampleCusts = data.sample_customers || [];

        // Update KPIs
        const kpiItems = document.getElementById('plm_kpi_items');
        const kpiCusts = document.getElementById('plm_kpi_customers');
        const kpiRs = document.getElementById('plm_kpi_avg_rs');
        const kpiPct = document.getElementById('plm_kpi_avg_pct');

        if (kpiItems) kpiItems.innerText = (sum.total_items || items.length).toLocaleString();
        if (kpiCusts) kpiCusts.innerText = (sum.total_customers || 1).toLocaleString();
        if (kpiRs) kpiRs.innerText = `Rs. ${(sum.avg_increase_rs || 0).toFixed(2)}`;
        if (kpiPct) kpiPct.innerText = `${(sum.avg_increase_pct || 0).toFixed(2)} %`;

        // Update Dynamic Header Columns
        const thead = document.getElementById('plm_preview_thead');
        let headerHtml = `
            <tr>
                <th style="width: 32px; text-align: center;">#</th>
                <th style="width: 110px;">Brand</th>
                <th>Item Name</th>
                <th class="num-cell" style="width: 110px;">General Rate (Old)</th>
                <th class="num-cell" style="width: 120px; background:#15803d; border-right:2px solid #ffffff;">General Rate (New)</th>
        `;

        if (sampleCusts.length > 0) {
            sampleCusts.forEach(c => {
                headerHtml += `<th class="num-cell" style="width: 140px; background:#1e3a5f;">${c.name}<br><span style="font-size:9.5px; opacity:0.85; font-weight:normal;">(Old &rarr; New)</span></th>`;
            });
        } else {
            headerHtml += `<th class="num-cell" style="width: 140px;">Customer Custom Rates</th>`;
        }
        headerHtml += `</tr>`;
        thead.innerHTML = headerHtml;

        // Render Table Body Rows
        const tbody = document.getElementById('plm_preview_tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${5 + sampleCusts.length}" style="text-align:center; padding:30px; color:#64748b;">No items match selected filters.</td></tr>`;
            return;
        }

        let bodyHtml = '';
        items.forEach((row, i) => {
            bodyHtml += `
                <tr>
                    <td style="text-align:center; color:#64748b;">${row.seq || (i + 1)}</td>
                    <td style="font-weight:700; color:#1e293b;">${row.brand_name || '-'}</td>
                    <td><b>${row.item_name}</b> <span style="color:#64748b; font-size:10px;">(${row.item_code})</span></td>
                    <td class="num-cell">${row.old_general_rate.toFixed(2)}</td>
                    <td class="plm-highlight-cell">${row.new_general_rate.toFixed(2)}</td>
            `;

            if (Array.isArray(row.customer_previews) && row.customer_previews.length > 0) {
                row.customer_previews.forEach(cp => {
                    bodyHtml += `<td class="num-cell" style="font-size:11px; font-weight:600; color:#0f172a;">${cp.display}</td>`;
                });
            } else if (sampleCusts.length > 0) {
                sampleCusts.forEach(() => {
                    bodyHtml += `<td class="num-cell" style="color:#94a3b8;">-</td>`;
                });
            } else {
                bodyHtml += `<td class="num-cell" style="color:#94a3b8;">No custom customers</td>`;
            }

            bodyHtml += `</tr>`;
        });
        tbody.innerHTML = bodyHtml;

        // Update Footer summary message
        const footerSum = document.getElementById('plm_footer_summary');
        if (footerSum) {
            const adjWord = sum.adjustment_type === 'Decrease' ? 'decrease' : 'increase';
            const valWord = sum.adjustment_method === 'Percentage' ? `${sum.adjustment_value}%` : `Rs. ${sum.adjustment_value.toFixed(2)}`;
            footerSum.innerHTML = `<b>Result:</b> ${sum.total_items || items.length} item prices will be updated for ${sum.total_customers || 1} customers. General rate will ${adjWord} by ${valWord} (as per selected criteria).`;
        }
    },

    // 6. Apply Revision (Commit to Database)
    applyRevision: async function() {
        const revNo = document.getElementById('plm_rev_no')?.value.trim();
        const revDate = document.getElementById('plm_rev_date')?.value;
        const effDate = document.getElementById('plm_eff_date')?.value;
        const adjType = document.getElementById('plm_adj_type')?.value || 'Increase';
        const applyTo = document.getElementById('plm_apply_to')?.value || 'All Customers';
        const catId = document.getElementById('plm_category')?.value || null;
        const brandId = document.getElementById('plm_brand')?.value || null;
        const itemId = document.getElementById('plm_item')?.value || null;
        const custId = document.getElementById('plm_customer')?.value || null;
        const method = document.querySelector('input[name="plm_method"]:checked')?.value || 'Fixed';
        const adjValue = parseFloat(document.getElementById('plm_adj_value')?.value || 0);
        const remarks = document.getElementById('plm_remarks')?.value.trim();

        if (!revNo) {
            alert("Please provide a Revision Number.");
            return;
        }

        // Collect brand adjustments
        const brandAdjustments = [];
        const rows = document.querySelectorAll('#plm_brand_tbody tr');
        rows.forEach(r => {
            const bId = r.dataset.brandId;
            const cb = r.querySelector('.plm-brand-check');
            const m = r.querySelector('.plm-brand-method')?.value || 'Fixed';
            const v = parseFloat(r.querySelector('.plm-brand-val')?.value || 0);
            if (bId && cb && cb.checked) {
                brandAdjustments.push({ brand_id: bId, method: m, value: v, enabled: true });
            }
        });

        const confirmMsg = `Are you sure you want to apply Price Revision "${revNo}"?\n\n` +
                           `• Adjustment Type: ${adjType}\n` +
                           `• Method: ${method} (${adjValue})\n` +
                           `• Effective Date: ${effDate}\n` +
                           `• Target: ${applyTo}\n\n` +
                           `All customer-specific price differences will be preserved independently.`;
        if (!confirm(confirmMsg)) return;

        const payload = {
            company_id: this.getCompanyId(),
            revision_no: revNo,
            revision_date: revDate,
            effective_date: effDate,
            adjustment_type: adjType,
            apply_to: applyTo,
            category_id: catId,
            brand_id: brandId,
            item_id: itemId,
            customer_id: custId,
            adjustment_method: method,
            adjustment_value: adjValue,
            brand_adjustments: brandAdjustments,
            remarks: remarks
        };

        try {
            const res = await fetch(`api/price_management.php?action=apply_revision&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`✓ SUCCESS:\n\n${data.message}`);
                await this.loadMeta();
                this.calculatePreview();
                this.loadGeneralPrices();
                this.loadHistory();
            } else {
                alert(`✕ ERROR:\n\n${data.message || 'Failed to apply price revision'}`);
            }
        } catch (e) {
            console.error("PriceListManagementModule: Apply revision error:", e);
            alert("Server connection error while applying revision.");
        }
    },

    // 7. Reset / New Revision
    initNewRevision: async function() {
        await this.loadMeta();
        this.resetRevisionForm();
        this.switchTab('bulk_revision');
        this.calculatePreview();
    },

    resetRevisionForm: function() {
        const today = new Date().toISOString().split('T')[0];
        const revDate = document.getElementById('plm_rev_date');
        const effDate = document.getElementById('plm_eff_date');
        if (revDate) revDate.value = today;
        if (effDate) effDate.value = today;

        const adjType = document.getElementById('plm_adj_type');
        if (adjType) adjType.value = 'Increase';

        const applyTo = document.getElementById('plm_apply_to');
        if (applyTo) applyTo.value = 'All Customers';

        const cat = document.getElementById('plm_category');
        if (cat) cat.value = '';

        const brand = document.getElementById('plm_brand');
        if (brand) brand.value = '';

        const itm = document.getElementById('plm_item');
        if (itm) itm.value = '';

        const cust = document.getElementById('plm_customer');
        if (cust) cust.value = '';

        const fixedRadio = document.querySelector('input[name="plm_method"][value="Fixed"]');
        if (fixedRadio) fixedRadio.checked = true;

        const adjVal = document.getElementById('plm_adj_value');
        if (adjVal) adjVal.value = '5.00';

        const rem = document.getElementById('plm_remarks');
        if (rem) rem.value = 'General price increase Rs. 5 for all customers';

        // Uncheck all brands
        const checkboxes = document.querySelectorAll('.plm-brand-check');
        checkboxes.forEach(cb => cb.checked = false);
        const checkAll = document.getElementById('plm_brand_check_all');
        if (checkAll) checkAll.checked = false;
    },

    // 8. Tab 1: General Price List (With Manual Rate Editing for Purchase & Selling)
    loadGeneralPrices: async function() {
        const catId = document.getElementById('plm_gen_cat_filter')?.value || '';
        const brandId = document.getElementById('plm_gen_brand_filter')?.value || '';
        const search = document.getElementById('plm_gen_search')?.value.trim() || '';

        const tbody = document.getElementById('plm_gen_tbody');
        if (!tbody) return;

        try {
            const url = `api/price_management.php?action=get_general_price_list&company_id=${this.getCompanyId()}&category_id=${catId}&brand_id=${brandId}&search=${encodeURIComponent(search)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                const countEl = document.getElementById('plm_gen_count');
                if (countEl) countEl.innerText = data.count || data.items.length;

                let html = '';
                (data.items || []).forEach((item, idx) => {
                    const pur = parseFloat(item.purchase_price || 0);
                    const sel = parseFloat(item.selling_price || 0);
                    html += `
                        <tr data-item-id="${item.id}" id="plm_gen_row_${item.id}">
                            <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                            <td style="font-weight:700; color:#1e293b;">${item.code}</td>
                            <td style="font-weight:600;">${item.name}</td>
                            <td>${item.brand_name || '-'}</td>
                            <td>${item.category_name || '-'}</td>
                            <td style="text-align:center; color:#64748b;">${item.unit || 'Pcs'}</td>
                            <td class="num-cell">
                                <input type="number" step="0.01" class="plm-input num-cell plm-gen-pur" 
                                    style="width:115px; padding:3px 6px; font-weight:700; color:#1e293b;" 
                                    value="${pur.toFixed(2)}" 
                                    data-orig="${pur.toFixed(2)}"
                                    title="Type Purchase Rate and press Enter or click Save"
                                    onkeydown="if(event.key==='Enter') window.PriceListManagementModule.saveSingleItemRate(${item.id}, this)">
                            </td>
                            <td class="num-cell" style="background:#f0fdf4;">
                                <input type="number" step="0.01" class="plm-input num-cell plm-gen-sel" 
                                    style="width:125px; padding:3px 6px; font-weight:800; color:#15803d; border-color:#86efac; background:#f0fdf4;" 
                                    value="${sel.toFixed(2)}" 
                                    data-orig="${sel.toFixed(2)}"
                                    title="Type Selling Rate (General) and press Enter or click Save"
                                    onkeydown="if(event.key==='Enter') window.PriceListManagementModule.saveSingleItemRate(${item.id}, this)">
                            </td>
                            <td style="text-align:center; white-space:nowrap;">
                                <button class="plm-btn plm-btn-success" style="padding:2px 8px; font-size:10.5px; height:24px;" 
                                    onclick="window.PriceListManagementModule.saveSingleItemRate(${item.id}, this)">
                                    <i class="fas fa-save mr-1"></i> Save
                                </button>
                            </td>
                        </tr>
                    `;
                });

                if (html === '') {
                    html = `<tr><td colspan="9" style="text-align:center; padding:25px; color:#94a3b8;">No items found matching filter criteria</td></tr>`;
                }
                tbody.innerHTML = html;
            }
        } catch (e) {
            console.error("PriceListManagementModule: Error loading general prices:", e);
        }
    },

    // Save Single Item Purchase & Selling Rates
    saveSingleItemRate: async function(itemId, triggerEl) {
        const row = document.getElementById(`plm_gen_row_${itemId}`);
        if (!row) return;

        const purInp = row.querySelector('.plm-gen-pur');
        const selInp = row.querySelector('.plm-gen-sel');
        const purVal = parseFloat(purInp?.value || 0);
        const selVal = parseFloat(selInp?.value || 0);

        const btn = row.querySelector('button');
        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

        try {
            const res = await fetch(`api/price_management.php?action=save_item_rates&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: itemId,
                    purchase_price: purVal,
                    selling_price: selVal
                })
            });
            const data = await res.json();

            if (data.status === 'success') {
                if (purInp) purInp.dataset.orig = purVal.toFixed(2);
                if (selInp) selInp.dataset.orig = selVal.toFixed(2);

                if (btn) {
                    btn.innerHTML = `<i class="fas fa-check"></i> Saved!`;
                    btn.style.background = '#15803d';
                    setTimeout(() => {
                        btn.innerHTML = originalBtnHtml;
                        btn.style.background = '';
                    }, 1500);
                }

                // Update in memory meta items
                const itm = (this.meta.items || []).find(i => String(i.id) === String(itemId));
                if (itm) itm.selling_price = selVal;

                // Re-trigger preview in background
                this.triggerAutoPreview();
            } else {
                alert("✕ Error: " + (data.message || 'Failed to save rate'));
                if (btn) btn.innerHTML = originalBtnHtml;
            }
        } catch (e) {
            console.error("Save single item rate error:", e);
            alert("Network error saving rates.");
            if (btn) btn.innerHTML = originalBtnHtml;
        }
    },

    // Save All Changed Item Rates in Bulk
    saveAllItemRates: async function() {
        const rows = document.querySelectorAll('#plm_gen_tbody tr[data-item-id]');
        const itemsToUpdate = [];

        rows.forEach(r => {
            const itemId = r.dataset.itemId;
            const purInp = r.querySelector('.plm-gen-pur');
            const selInp = r.querySelector('.plm-gen-sel');
            const purVal = parseFloat(purInp?.value || 0);
            const selVal = parseFloat(selInp?.value || 0);
            const origPur = parseFloat(purInp?.dataset.orig || 0);
            const origSel = parseFloat(selInp?.dataset.orig || 0);

            // If changed or updating all
            if (purVal !== origPur || selVal !== origSel) {
                itemsToUpdate.push({
                    item_id: itemId,
                    purchase_price: purVal,
                    selling_price: selVal
                });
            }
        });

        if (itemsToUpdate.length === 0) {
            alert("No rate changes detected. Edit Purchase or Selling Rate in the table first.");
            return;
        }

        try {
            const res = await fetch(`api/price_management.php?action=save_item_rates&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsToUpdate })
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`✓ SUCCESS:

${data.message}`);
                await this.loadMeta();
                this.loadGeneralPrices();
                this.calculatePreview();
            } else {
                alert("✕ Error: " + (data.message || 'Failed to save item rates'));
            }
        } catch (e) {
            console.error("Save all rates error:", e);
            alert("Network error saving all item rates.");
        }
    },

    // 9. Tab 2: Customer Price List & Searchable Dropdowns
    modalBrandList: [],

    openCustomerSearchDropdown: async function(target) {
        if (!this.meta || !this.meta.customers || this.meta.customers.length === 0) {
            await this.loadMeta();
        }
        this.filterCustomerSearch(target);
        const dd = document.getElementById(target === 'filter' ? 'plm_cust_search_dropdown' : 'plm_modal_cust_dropdown');
        if (dd) dd.style.display = 'block';
    },

    filterCustomerSearch: function(target) {
        const isFilter = (target === 'filter');
        const input = document.getElementById(isFilter ? 'plm_cust_search_input' : 'plm_modal_cust_search');
        const dd = document.getElementById(isFilter ? 'plm_cust_search_dropdown' : 'plm_modal_cust_dropdown');
        if (!input || !dd) return;

        const val = input.value.toLowerCase().trim();
        const customers = this.meta?.customers || [];

        let filtered = customers;
        if (val && !val.startsWith('🔍') && !val.startsWith('★')) {
            filtered = customers.filter(c => {
                const name = (c.name || '').toLowerCase();
                const code = (c.code || '').toLowerCase();
                const phone = (c.phone || '').toLowerCase();
                return name.includes(val) || code.includes(val) || phone.includes(val);
            });
        }

        let html = '';
        if (isFilter) {
            html += `<div style="padding: 7px 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #1e40af; background: #f8fafc;" onmousedown="window.PriceListManagementModule.selectCustomer('filter', '', '★ All Customers with Custom Pricing', '')">
                ★ All Customers with Custom Pricing
            </div>`;
        }

        if (filtered.length === 0) {
            html += `<div style="padding: 10px; color: #94a3b8; text-align: center;">No matching customers found</div>`;
        } else {
            filtered.forEach(c => {
                const codeBadge = c.code ? `<span style="font-size: 10px; background: #e2e8f0; color: #334155; padding: 1px 5px; border-radius: 3px; margin-right: 6px; font-weight: 600;">${c.code}</span>` : '';
                html += `
                    <div style="padding: 7px 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 11px; transition: background 0.15s;" onmouseover="this.style.background='#eef3fc'" onmouseout="this.style.background='#ffffff'" onmousedown="window.PriceListManagementModule.selectCustomer('${target}', ${c.id}, '${encodeURIComponent(c.name)}', '${c.code || ''}')">
                        ${codeBadge}<strong>${c.name}</strong>
                    </div>
                `;
            });
        }

        dd.innerHTML = html;
        dd.style.display = 'block';

        if (isFilter) {
            this.filterCustomerTableInRealtime(val);
        }
    },

    filterCustomerTableInRealtime: function(query) {
        const tbody = document.getElementById('plm_cust_tbody');
        if (!tbody) return;
        const q = (query || '').toLowerCase().trim();
        const rows = tbody.querySelectorAll('tr[data-cust-name]');

        if (!q || q.startsWith('🔍') || q.startsWith('★')) {
            rows.forEach(r => r.style.display = '');
            return;
        }

        const matchingCustIds = new Set();
        rows.forEach(r => {
            const cName = (r.getAttribute('data-cust-name') || '').toLowerCase();
            const cId = r.getAttribute('data-cust-id');
            if (cName.includes(q)) {
                matchingCustIds.add(cId);
            }
        });

        rows.forEach(r => {
            const cId = r.getAttribute('data-cust-id');
            if (matchingCustIds.has(cId)) {
                r.style.display = '';
            } else {
                r.style.display = 'none';
            }
        });
    },

    onCustomerSearchEnter: function(target) {
        const isFilter = (target === 'filter');
        const input = document.getElementById(isFilter ? 'plm_cust_search_input' : 'plm_modal_cust_search');
        const dd = document.getElementById(isFilter ? 'plm_cust_search_dropdown' : 'plm_modal_cust_dropdown');
        if (!input) return;
        const val = input.value.toLowerCase().trim();
        const customers = this.meta?.customers || [];
        const matched = customers.filter(c => {
            const name = (c.name || '').toLowerCase();
            const code = (c.code || '').toLowerCase();
            return name.includes(val) || code.includes(val);
        });
        if (matched.length > 0) {
            this.selectCustomer(target, matched[0].id, matched[0].name, matched[0].code || '');
        }
        if (dd) dd.style.display = 'none';
    },

    selectCustomer: function(target, id, encodedName, code) {
        const isFilter = (target === 'filter');
        const name = decodeURIComponent(encodedName || '');
        const input = document.getElementById(isFilter ? 'plm_cust_search_input' : 'plm_modal_cust_search');
        const hidden = document.getElementById(isFilter ? 'plm_cust_list_filter' : 'plm_modal_cust_select');
        const dd = document.getElementById(isFilter ? 'plm_cust_search_dropdown' : 'plm_modal_cust_dropdown');
        const clearBtn = document.getElementById('plm_cust_clear_btn');

        if (hidden) hidden.value = id || '';
        if (input) {
            input.value = id ? `${code ? code + ' - ' : ''}${name}` : (isFilter ? '🔍 All Customers with Custom Pricing' : '');
        }
        if (clearBtn && isFilter) {
            clearBtn.style.display = id ? 'block' : 'none';
        }
        if (dd) dd.style.display = 'none';

        if (isFilter) {
            this.loadCustomerPrices();
        }
    },

    clearCustomerFilter: function(target) {
        this.selectCustomer(target, '', '★ All Customers with Custom Pricing', '');
    },

    openSetCustomerPriceModalFor: function(custId) {
        this.openAddCustomerPriceModal();
        const cust = (this.meta?.customers || []).find(c => String(c.id) === String(custId));
        if (cust) {
            this.selectCustomer('modal', custId, cust.name, cust.code || '');
        }
    },

    loadCustomerPrices: async function() {
        const custId = document.getElementById('plm_cust_list_filter')?.value || '';
        const brandFilter = document.getElementById('plm_cust_brand_filter')?.value || '';
        const tbody = document.getElementById('plm_cust_tbody');
        const thead = document.getElementById('plm_cust_thead');
        if (!tbody) return;

        try {
            let url = `api/price_management.php?action=get_customer_price_list&company_id=${this.getCompanyId()}&customer_id=${custId}`;
            if (brandFilter && brandFilter !== 'all_items') {
                url += `&brand_id=${brandFilter}`;
            }
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                const rawItems = data.customer_prices || [];
                const countEl = document.getElementById('plm_cust_count');

                // Organize rows grouped by Customer
                const customerMap = {};
                rawItems.forEach(row => {
                    const cid = row.customer_id;
                    if (!customerMap[cid]) {
                        customerMap[cid] = {
                            customer_id: cid,
                            customer_name: row.customer_name || `Customer #${cid}`,
                            customer_code: row.customer_code || '',
                            customer_phone: row.customer_phone || '',
                            customer_email: row.customer_email || '',
                            items: []
                        };
                    }
                    customerMap[cid].items.push(row);
                });
                const customerList = Object.values(customerMap);

                // Case A: DEFAULT VIEW - All Brands (Brand-wise Summary Grouped by Customer)
                if (brandFilter === '') {
                    if (thead) {
                        thead.innerHTML = `
                            <tr>
                                <th style="width: 40px; text-align: center;">#</th>
                                <th>Brand</th>
                                <th style="width: 110px; text-align: center;">Items Affected</th>
                                <th class="num-cell" style="width: 120px;">Avg General Rate</th>
                                <th class="num-cell" style="width: 130px; background:#15803d; color:#fff;">Customized Rate</th>
                                <th class="num-cell" style="width: 100px;">Difference</th>
                                <th style="width: 160px;">Notes / Special Terms</th>
                                <th style="width: 140px; text-align: center;">Action</th>
                            </tr>
                        `;
                    }

                    let totalBrandsCount = 0;
                    let html = '';

                    customerList.forEach((cust) => {
                        // Group this customer's items by brand
                        const brandMap = {};
                        cust.items.forEach(row => {
                            const bName = row.brand_name || 'Generic / Unbranded';
                            if (!brandMap[bName]) {
                                brandMap[bName] = {
                                    customer_id: cust.customer_id,
                                    customer_name: cust.customer_name,
                                    brand_name: bName,
                                    brand_id: null,
                                    items: [],
                                    notes: row.notes || ''
                                };
                                const matchedBrand = (this.meta?.brands || []).find(b => b.name === bName);
                                if (matchedBrand) brandMap[bName].brand_id = matchedBrand.id;
                            }
                            brandMap[bName].items.push(row);
                        });

                        const brandList = Object.values(brandMap);
                        totalBrandsCount += brandList.length;

                        const codeBadge = cust.customer_code ? `<span style="font-size: 10px; background: #e2e8f0; color: #334155; padding: 1px 6px; border-radius: 3px; font-weight: 700; margin-left: 4px;">${cust.customer_code}</span>` : '';

                        // Group Header Row for this Customer
                        html += `
                            <tr data-cust-id="${cust.customer_id}" data-cust-name="${cust.customer_name}" style="background: #eef2f6; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
                                <td colspan="8" style="padding: 7px 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="font-size: 13px; font-weight: 800; color: #1e3a8a;">
                                                <i class="fas fa-user-circle mr-1" style="color: #2563eb;"></i> ${cust.customer_name}
                                            </span>
                                            ${codeBadge}
                                            <span style="background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 12px;">
                                                <i class="fas fa-layer-group mr-1"></i> ${brandList.length} ${brandList.length === 1 ? 'Brand' : 'Brands'} Configured (${cust.items.length} Items)
                                            </span>
                                        </div>
                                        <div style="display: flex; gap: 6px; align-items: center;">
                                            <button type="button" class="plm-btn" style="background:#475569; color:#ffffff; font-size:10.5px; font-weight:600; padding:3px 10px; border:none; border-radius:3px; cursor:pointer;" onclick="window.PriceListManagementModule.openSetCustomerPriceModalFor(${cust.customer_id})" title="Add or update brands for this customer">
                                                <i class="fas fa-plus mr-1"></i> Set Brands
                                            </button>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;

                        // Brand Rows under this Customer
                        brandList.forEach((grp, bIdx) => {
                            const genPrices = grp.items.map(i => parseFloat(i.general_price || 0));
                            const custPrices = grp.items.map(i => parseFloat(i.custom_price || 0));
                            const avgGen = genPrices.reduce((a, b) => a + b, 0) / (genPrices.length || 1);
                            const avgCust = custPrices.reduce((a, b) => a + b, 0) / (custPrices.length || 1);
                            const allSameCust = custPrices.every(p => p === custPrices[0]);
                            const allSameGen = genPrices.every(p => p === genPrices[0]);

                            const displayGen = allSameGen ? genPrices[0].toFixed(2) : `${avgGen.toFixed(2)} (Avg)`;
                            const displayCust = allSameCust ? custPrices[0].toFixed(2) : `${avgCust.toFixed(2)} (Avg)`;
                            const diff = avgCust - avgGen;
                            const diffColor = diff > 0 ? '#15803d' : (diff < 0 ? '#dc2626' : '#64748b');
                            const diffSign = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);

                            // Build nested items rows for this brand
                            let itemsDetailRows = '';
                            grp.items.forEach((it, iIdx) => {
                                const itemGen = parseFloat(it.general_price || 0);
                                const itemCust = parseFloat(it.custom_price || 0);
                                const itemDiff = itemCust - itemGen;
                                const itemDiffColor = itemDiff > 0 ? '#15803d' : (itemDiff < 0 ? '#dc2626' : '#64748b');
                                const itemDiffSign = itemDiff > 0 ? `+${itemDiff.toFixed(2)}` : itemDiff.toFixed(2);
                                const sizeUnit = (it.size && it.size !== '-') ? `${it.size} (${it.unit || 'Pcs'})` : (it.unit || 'Pcs');

                                itemsDetailRows += `
                                    <tr style="background:#ffffff; border-bottom:1px solid #f1f5f9;">
                                        <td style="text-align:center; color:#64748b; font-size:10.5px; padding:5px 6px;">${iIdx + 1}</td>
                                        <td style="font-weight:600; color:#475569; padding:5px 8px;">${it.item_code || '-'}</td>
                                        <td style="font-weight:700; color:#0f172a; padding:5px 8px;">${it.item_name}</td>
                                        <td style="text-align:center; color:#64748b; font-size:10.5px; padding:5px 8px;">${sizeUnit}</td>
                                        <td class="num-cell" style="padding:5px 8px;">${itemGen.toFixed(2)}</td>
                                        <td class="plm-highlight-cell" style="font-weight:700; background:#f0fdf4; color:#15803d; padding:5px 8px;">${itemCust.toFixed(2)}</td>
                                        <td class="num-cell" style="font-weight:700; color:${itemDiffColor}; padding:5px 8px;">${itemDiffSign}</td>
                                        <td style="font-size:10.5px; color:#475569; padding:5px 8px;">${it.notes || '-'}</td>
                                        <td style="text-align:center; padding:5px 8px;">
                                            <button type="button" class="plm-btn" style="padding:1px 6px; font-size:10px;" onclick="window.PriceListManagementModule.editCustomerPrice(${cust.customer_id}, ${it.item_id}, ${itemCust}, '${encodeURIComponent(it.notes || '')}')" title="Edit rate for this item">
                                                <i class="fas fa-edit"></i> Edit
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            });

                            html += `
                                <tr data-cust-id="${cust.customer_id}" data-cust-name="${cust.customer_name}" class="plm-brand-row" style="background: #ffffff; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'" onclick="window.PriceListManagementModule.toggleBrandCollapse('${cust.customer_id}', '${bIdx}')" title="Click to view items of this brand">
                                    <td style="text-align: center; color: #64748b; font-size: 11px;">
                                        <i id="plm_brand_icon_${cust.customer_id}_${bIdx}" class="fas fa-chevron-right" style="transition: transform 0.2s; font-size: 10px; color:#0284c7; margin-right: 3px;"></i>${bIdx + 1}
                                    </td>
                                    <td style="font-weight: 700; color: #0f172a; padding-left: 14px;">
                                        <i class="fas fa-tag mr-1" style="color: #0284c7;"></i> ${grp.brand_name}
                                    </td>
                                    <td style="text-align: center;">
                                        <span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-weight: 700; font-size: 10px;">
                                            ${grp.items.length} ${grp.items.length === 1 ? 'Item' : 'Items'} <i class="fas fa-caret-down ml-1"></i>
                                        </span>
                                    </td>
                                    <td class="num-cell" style="font-weight: 600;">${displayGen}</td>
                                    <td class="plm-highlight-cell" style="font-weight: 700; background: #f0fdf4; color: #15803d;">${displayCust}</td>
                                    <td class="num-cell" style="font-weight: 700; color: ${diffColor};">${diffSign}</td>
                                    <td style="font-size: 10.5px; color: #475569;">${grp.notes || '-'}</td>
                                    <td style="text-align: center; white-space: nowrap;" onclick="event.stopPropagation();">
                                        <button type="button" class="plm-btn" style="padding: 2px 8px; font-size: 10.5px; margin-right: 4px;" onclick="window.PriceListManagementModule.openBrandPriceEdit(${cust.customer_id}, '${encodeURIComponent(grp.brand_name)}', ${allSameCust ? custPrices[0] : avgCust}, '${encodeURIComponent(grp.notes || '')}', ${grp.brand_id || 0})" title="Edit rate for all items of this brand">
                                            <i class="fas fa-edit"></i> Edit
                                        </button>
                                        <button type="button" class="plm-btn" style="padding: 2px 8px; font-size: 10px; background: #f8fafc;" onclick="window.PriceListManagementModule.toggleBrandCollapse('${cust.customer_id}', '${bIdx}')" title="Expand / Collapse items">
                                            <i id="plm_btn_icon_${cust.customer_id}_${bIdx}" class="fas fa-list-ul mr-1"></i> Items
                                        </button>
                                    </td>
                                </tr>

                                <!-- EXPANDABLE ITEMS PANEL DIRECTLY UNDER BRAND -->
                                <tr id="plm_brand_items_${cust.customer_id}_${bIdx}" data-cust-id="${cust.customer_id}" data-cust-name="${cust.customer_name}" style="display: none; background: #f8fafc;">
                                    <td colspan="8" style="padding: 2px 14px 10px 32px; background: #f8fafc;">
                                        <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 5px; overflow: hidden; margin-top: 2px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                                            <div style="background: #f1f5f9; padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                                                <span><i class="fas fa-boxes mr-1" style="color: #0284c7;"></i> Items under <strong>${grp.brand_name}</strong> (${grp.items.length} Items)</span>
                                                <span style="font-size: 10.5px; color: #64748b;">Customer: <strong>${cust.customer_name}</strong></span>
                                            </div>
                                            <table class="plm-table" style="font-size: 11px; margin: 0; width: 100%;">
                                                <thead>
                                                    <tr style="background: #f8fafc; color: #475569; font-size: 10.5px; border-bottom: 1px solid #cbd5e1;">
                                                        <th style="width: 30px; text-align: center;">#</th>
                                                        <th style="width: 110px;">Item Code</th>
                                                        <th>Item Name / Description</th>
                                                        <th style="width: 100px; text-align: center;">Size / Unit</th>
                                                        <th class="num-cell" style="width: 100px;">General Rate</th>
                                                        <th class="num-cell" style="width: 110px; color: #15803d; font-weight: 700; background: #f0fdf4;">Customer Rate</th>
                                                        <th class="num-cell" style="width: 90px;">Difference</th>
                                                        <th style="width: 140px;">Notes</th>
                                                        <th style="width: 70px; text-align: center;">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${itemsDetailRows}
                                                </tbody>
                                            </table>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        });
                    });

                    if (countEl) countEl.innerText = `${customerList.length} Customers • ${totalBrandsCount} Brands (${rawItems.length} Items)`;

                    if (html === '') {
                        html = `<tr><td colspan="8" style="text-align:center; padding:25px; color:#94a3b8;">No customer-specific brand prices found. Click "+ Set Price" to create one.</td></tr>`;
                    }
                    tbody.innerHTML = html;

                } else {
                    // Case B: ITEM-WISE VIEW (All Items or specific Brand filter, Grouped by Customer)
                    if (thead) {
                        thead.innerHTML = `
                            <tr>
                                <th style="width: 40px; text-align: center;">#</th>
                                <th style="width: 110px;">Item Code</th>
                                <th>Item Name</th>
                                <th style="width: 120px;">Brand</th>
                                <th class="num-cell" style="width: 110px;">General Rate</th>
                                <th class="num-cell" style="width: 120px; background:#15803d; color:#fff;">Customized Rate</th>
                                <th class="num-cell" style="width: 100px;">Difference</th>
                                <th style="width: 160px;">Notes / Special Terms</th>
                                <th style="width: 80px; text-align: center;">Action</th>
                            </tr>
                        `;
                    }

                    if (countEl) countEl.innerText = `${customerList.length} Customers • ${rawItems.length} Items`;

                    let html = '';
                    customerList.forEach((cust) => {
                        const codeBadge = cust.customer_code ? `<span style="font-size: 10px; background: #e2e8f0; color: #334155; padding: 1px 6px; border-radius: 3px; font-weight: 700; margin-left: 4px;">${cust.customer_code}</span>` : '';

                        // Customer Group Header
                        html += `
                            <tr data-cust-id="${cust.customer_id}" data-cust-name="${cust.customer_name}" style="background: #eef2f6; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
                                <td colspan="9" style="padding: 7px 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="font-size: 13px; font-weight: 800; color: #1e3a8a;">
                                                <i class="fas fa-user-circle mr-1" style="color: #2563eb;"></i> ${cust.customer_name}
                                            </span>
                                            ${codeBadge}
                                            <span style="background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 12px;">
                                                ${cust.items.length} Items Configured
                                            </span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;

                        // Item Rows under this Customer
                        cust.items.forEach((row, iIdx) => {
                            const gen = parseFloat(row.general_price || 0);
                            const custRate = parseFloat(row.custom_price || 0);
                            const diff = custRate - gen;
                            const diffColor = diff > 0 ? '#15803d' : (diff < 0 ? '#dc2626' : '#64748b');
                            const diffSign = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);

                            html += `
                                <tr data-cust-id="${cust.customer_id}" data-cust-name="${cust.customer_name}" style="background: #ffffff; border-bottom: 1px solid #f1f5f9;">
                                    <td style="text-align: center; color: #64748b; font-size: 11px;">${iIdx + 1}</td>
                                    <td style="font-weight: 600; padding-left: 18px;">${row.item_code}</td>
                                    <td>${row.item_name}</td>
                                    <td><span style="font-weight: 600; color: #1F4E79;">${row.brand_name || '-'}</span></td>
                                    <td class="num-cell">${gen.toFixed(2)}</td>
                                    <td class="plm-highlight-cell" style="font-weight: 700; background: #f0fdf4; color: #15803d;">${custRate.toFixed(2)}</td>
                                    <td class="num-cell" style="font-weight: 700; color: ${diffColor};">${diffSign}</td>
                                    <td style="font-size: 10.5px; color: #475569;">${row.notes || '-'}</td>
                                    <td style="text-align: center;">
                                        <button class="plm-btn" style="padding: 2px 6px; font-size: 10px;" onclick="window.PriceListManagementModule.editCustomerPrice(${row.customer_id}, ${row.item_id}, ${custRate}, '${encodeURIComponent(row.notes || '')}')">
                                            <i class="fas fa-edit"></i> Edit
                                        </button>
                                    </td>
                                </tr>
                            `;
                        });
                    });

                    if (html === '') {
                        html = `<tr><td colspan="9" style="text-align:center; padding:25px; color:#94a3b8;">No customer-specific customized prices set yet. Click "+ Set Customer Custom Price" to create one.</td></tr>`;
                    }
                    tbody.innerHTML = html;
                }
            }
        } catch (e) {
            console.error("PriceListManagementModule: Error loading customer prices:", e);
        }
    },

    toggleBrandCollapse: function(custId, bIdx) {
        const panel = document.getElementById(`plm_brand_items_${custId}_${bIdx}`);
        const icon = document.getElementById(`plm_brand_icon_${custId}_${bIdx}`);
        const btnIcon = document.getElementById(`plm_btn_icon_${custId}_${bIdx}`);
        if (!panel) return;

        const isHidden = (panel.style.display === 'none' || panel.style.display === '');
        if (isHidden) {
            panel.style.display = 'table-row';
            if (icon) icon.className = 'fas fa-chevron-down text-primary';
            if (btnIcon) btnIcon.className = 'fas fa-chevron-up mr-1 text-primary';
        } else {
            panel.style.display = 'none';
            if (icon) icon.className = 'fas fa-chevron-right text-primary';
            if (btnIcon) btnIcon.className = 'fas fa-list-ul mr-1';
        }
    },

    drillDownBrand: function(brandId) {
        const filterEl = document.getElementById('plm_cust_brand_filter');
        if (filterEl) {
            filterEl.value = brandId ? String(brandId) : 'all_items';
            this.loadCustomerPrices();
        }
    },

    openBrandPriceEdit: function(custId, encodedBrandName, currentPrice, encodedNotes, brandId) {
        const brandName = decodeURIComponent(encodedBrandName || '');
        const modal = document.getElementById('plm_cust_modal');
        if (!modal) return;
        modal.style.display = 'flex';

        this.modalBrandList = [];
        this.renderModalBrandsTable();

        // Customer selection
        const cust = (this.meta?.customers || []).find(c => String(c.id) === String(custId));
        this.selectCustomer('modal', custId, cust?.name || '', cust?.code || '');

        // Pricing mode: Brand
        const brandRadio = document.querySelector('input[name="plm_modal_pricing_mode"][value="brand"]');
        if (brandRadio) brandRadio.checked = true;
        this.onModalPricingModeChange('brand');

        // Brand dropdown match
        let targetBrandId = brandId;
        if (!targetBrandId) {
            const matched = (this.meta?.brands || []).find(b => b.name === brandName);
            if (matched) targetBrandId = matched.id;
        }

        const brandSel = document.getElementById('plm_modal_brand_select');
        if (brandSel && targetBrandId) {
            brandSel.value = targetBrandId;
            this.onModalBrandSelect(targetBrandId);
        }

        document.getElementById('plm_modal_custom_rate').value = parseFloat(currentPrice || 0).toFixed(2);
        document.getElementById('plm_modal_notes').value = decodeURIComponent(encodedNotes || '');
    },

    onModalPricingModeChange: function(mode) {
        const rowItem = document.getElementById('plm_modal_row_item');
        const rowBrand = document.getElementById('plm_modal_row_brand');
        const rowBrandInfo = document.getElementById('plm_modal_brand_info_row');
        const genLabel = document.getElementById('plm_modal_gen_rate_label');
        const addBrandBar = document.getElementById('plm_modal_add_brand_bar');
        const tableWrapper = document.getElementById('plm_modal_brands_table_wrapper');

        if (mode === 'brand') {
            if (rowItem) rowItem.style.display = 'none';
            if (rowBrand) rowBrand.style.display = 'flex';
            if (rowBrandInfo) rowBrandInfo.style.display = 'flex';
            if (addBrandBar) addBrandBar.style.display = 'flex';
            if (tableWrapper) tableWrapper.style.display = this.modalBrandList.length > 0 ? 'block' : 'none';
            if (genLabel) genLabel.innerText = 'Avg General Rate';
            const brandId = document.getElementById('plm_modal_brand_select')?.value;
            this.onModalBrandSelect(brandId);
        } else {
            if (rowItem) rowItem.style.display = 'flex';
            if (rowBrand) rowBrand.style.display = 'none';
            if (rowBrandInfo) rowBrandInfo.style.display = 'none';
            if (addBrandBar) addBrandBar.style.display = 'none';
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (genLabel) genLabel.innerText = 'General Rate';
            const itemId = document.getElementById('plm_modal_item_select')?.value;
            this.onModalItemSelect(itemId);
        }
    },

    onModalBrandSelect: function(brandId) {
        const infoEl = document.getElementById('plm_modal_brand_info');
        const genRateEl = document.getElementById('plm_modal_gen_rate');
        const customRateEl = document.getElementById('plm_modal_custom_rate');

        if (!brandId) {
            if (infoEl) infoEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i> Please select a brand to view affected items.';
            if (genRateEl) genRateEl.value = '0.00';
            return;
        }

        const brandItems = (this.meta.items || []).filter(i => String(i.brand_id) === String(brandId));
        const count = brandItems.length;

        if (count === 0) {
            if (infoEl) infoEl.innerHTML = `<span style="color:#dc2626;"><i class="fas fa-exclamation-triangle mr-1"></i> No items found under this brand.</span>`;
            if (genRateEl) genRateEl.value = '0.00';
            return;
        }

        const prices = brandItems.map(i => parseFloat(i.selling_price || 0));
        const allSame = prices.every(p => p === prices[0]);
        const avgPrice = (prices.reduce((a, b) => a + b, 0) / count).toFixed(2);
        const displayRate = allSame ? prices[0].toFixed(2) : `${avgPrice} (Avg)`;

        if (infoEl) {
            infoEl.innerHTML = `<i class="fas fa-check-circle mr-1 text-success"></i> <strong>${count} item(s)</strong> found under this brand.`;
        }
        if (genRateEl) genRateEl.value = displayRate;
        if (customRateEl && (parseFloat(customRateEl.value) === 0 || !customRateEl.value)) {
            customRateEl.value = parseFloat(prices[0] || 0).toFixed(2);
        }
    },

    addBrandToModalList: function() {
        const brandSel = document.getElementById('plm_modal_brand_select');
        const brandId = brandSel ? brandSel.value : '';
        const brandName = brandSel && brandSel.selectedIndex >= 0 ? brandSel.options[brandSel.selectedIndex].text.replace(/^🏷️\s*/, '').replace(/^-- Select Brand --\s*/, '') : '';
        const genRate = parseFloat(document.getElementById('plm_modal_gen_rate')?.value || 0);
        const customRate = parseFloat(document.getElementById('plm_modal_custom_rate')?.value || 0);
        const notes = document.getElementById('plm_modal_notes')?.value.trim() || '';

        if (!brandId) {
            alert("Barahe karam pehly Brand select karein.");
            return;
        }
        if (customRate <= 0) {
            alert("Barahe karam Custom Rate darj karein.");
            return;
        }

        const existingIdx = this.modalBrandList.findIndex(b => String(b.brand_id) === String(brandId));
        if (existingIdx >= 0) {
            this.modalBrandList[existingIdx].custom_price = customRate;
            this.modalBrandList[existingIdx].notes = notes;
        } else {
            this.modalBrandList.push({
                brand_id: brandId,
                brand_name: brandName,
                general_price: genRate,
                custom_price: customRate,
                notes: notes
            });
        }

        this.renderModalBrandsTable();

        // Reset inputs for adding the next brand smoothly without closing
        brandSel.value = '';
        document.getElementById('plm_modal_gen_rate').value = '0.00';
        document.getElementById('plm_modal_custom_rate').value = '0.00';
        document.getElementById('plm_modal_notes').value = '';
        const infoEl = document.getElementById('plm_modal_brand_info');
        if (infoEl) infoEl.innerHTML = '<i class="fas fa-check-circle mr-1 text-success"></i> Brand added to list! Select another brand or click Save.';
    },

    removeBrandFromModalList: function(idx) {
        this.modalBrandList.splice(idx, 1);
        this.renderModalBrandsTable();
    },

    renderModalBrandsTable: function() {
        const wrapper = document.getElementById('plm_modal_brands_table_wrapper');
        const tbody = document.getElementById('plm_modal_brands_tbody');
        if (!wrapper || !tbody) return;

        if (this.modalBrandList.length === 0) {
            wrapper.style.display = 'none';
            tbody.innerHTML = '';
            return;
        }

        wrapper.style.display = 'block';
        let html = '';
        this.modalBrandList.forEach((b, i) => {
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="text-align:center; color:#64748b;">${i + 1}</td>
                    <td style="font-weight:700; color:#1e293b;">${b.brand_name}</td>
                    <td class="num-cell">${parseFloat(b.general_price).toFixed(2)}</td>
                    <td class="num-cell" style="font-weight:700; color:#15803d;">${parseFloat(b.custom_price).toFixed(2)}</td>
                    <td style="font-size:10px; color:#475569;">${b.notes || '-'}</td>
                    <td style="text-align:center;">
                        <button type="button" class="plm-btn" style="padding:1px 6px; color:#dc2626; border-color:#fca5a5;" onclick="window.PriceListManagementModule.removeBrandFromModalList(${i})" title="Remove Brand">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    openAddCustomerPriceModal: function() {
        const modal = document.getElementById('plm_cust_modal');
        if (modal) {
            modal.style.display = 'flex';
            this.modalBrandList = [];
            this.renderModalBrandsTable();

            const modeRow = document.getElementById('plm_modal_mode_row');
            if (modeRow) modeRow.style.display = 'flex';

            // Pre-select customer if filter has one
            const filterCust = document.getElementById('plm_cust_list_filter')?.value || '';
            const cust = (this.meta?.customers || []).find(c => String(c.id) === String(filterCust));
            if (filterCust && cust) {
                this.selectCustomer('modal', filterCust, cust.name, cust.code || '');
            } else {
                this.selectCustomer('modal', '', '', '');
            }

            // Default mode to Brand
            const brandRadio = document.querySelector('input[name="plm_modal_pricing_mode"][value="brand"]');
            if (brandRadio) brandRadio.checked = true;
            this.onModalPricingModeChange('brand');

            // Reset brand inputs
            const brandSel = document.getElementById('plm_modal_brand_select');
            if (brandSel) brandSel.value = '';
            document.getElementById('plm_modal_gen_rate').value = '0.00';
            document.getElementById('plm_modal_custom_rate').value = '0.00';
            document.getElementById('plm_modal_notes').value = '';
        }
    },

    onModalItemSelect: function(itemId) {
        if (!itemId) return;
        const itm = (this.meta.items || []).find(i => String(i.id) === String(itemId));
        if (itm) {
            const genRate = parseFloat(itm.selling_price || 0);
            document.getElementById('plm_modal_gen_rate').value = genRate.toFixed(2);
            document.getElementById('plm_modal_custom_rate').value = genRate.toFixed(2);
        }
    },

    editCustomerPrice: function(custId, itemId, currentPrice, encodedNotes) {
        const modal = document.getElementById('plm_cust_modal');
        if (!modal) return;
        modal.style.display = 'flex';

        this.modalBrandList = [];
        this.renderModalBrandsTable();

        const itemRadio = document.querySelector('input[name="plm_modal_pricing_mode"][value="item"]');
        if (itemRadio) itemRadio.checked = true;
        this.onModalPricingModeChange('item');
        const modeRow = document.getElementById('plm_modal_mode_row');
        if (modeRow) modeRow.style.display = 'none';

        const cust = (this.meta?.customers || []).find(c => String(c.id) === String(custId));
        this.selectCustomer('modal', custId, cust?.name || '', cust?.code || '');

        document.getElementById('plm_modal_item_select').value = itemId;
        this.onModalItemSelect(itemId);
        document.getElementById('plm_modal_custom_rate').value = currentPrice.toFixed(2);
        document.getElementById('plm_modal_notes').value = decodeURIComponent(encodedNotes || '');
    },

    saveCustomerModalPrice: async function() {
        const custId = document.getElementById('plm_modal_cust_select')?.value;
        const mode = document.querySelector('input[name="plm_modal_pricing_mode"]:checked')?.value || 'brand';

        if (!custId) {
            alert("Barahe karam Customer select karein.");
            return;
        }

        let payload = {
            customer_id: custId,
            mode: mode
        };

        if (mode === 'brand') {
            // Auto-include currently typed brand if user hasn't pressed '+ Add Brand' yet
            const curBrandId = document.getElementById('plm_modal_brand_select')?.value;
            const curRate = parseFloat(document.getElementById('plm_modal_custom_rate')?.value || 0);
            const curNotes = document.getElementById('plm_modal_notes')?.value.trim() || '';

            if (curBrandId && curRate > 0) {
                const existingIdx = this.modalBrandList.findIndex(b => String(b.brand_id) === String(curBrandId));
                if (existingIdx < 0) {
                    const brandSel = document.getElementById('plm_modal_brand_select');
                    const bName = brandSel && brandSel.selectedIndex >= 0 ? brandSel.options[brandSel.selectedIndex].text.replace(/^🏷️\s*/, '') : '';
                    this.modalBrandList.push({
                        brand_id: curBrandId,
                        brand_name: bName,
                        custom_price: curRate,
                        notes: curNotes
                    });
                }
            }

            if (this.modalBrandList.length === 0) {
                alert("Barahe karam kam az kam 1 Brand select kar ke '+ Add Brand to List' dabayein.");
                return;
            }

            payload.brands = this.modalBrandList;
        } else {
            const itemId = document.getElementById('plm_modal_item_select')?.value;
            const price = parseFloat(document.getElementById('plm_modal_custom_rate')?.value || 0);
            const notes = document.getElementById('plm_modal_notes')?.value.trim() || '';

            if (!itemId) {
                alert("Barahe karam Item select karein.");
                return;
            }
            if (price <= 0) {
                alert("Barahe karam Custom Rate darj karein.");
                return;
            }
            payload.item_id = itemId;
            payload.custom_price = price;
            payload.notes = notes;
        }

        try {
            const res = await fetch(`api/price_management.php?action=save_customer_price&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert("✓ " + (data.message || 'Customer custom price saved successfully!'));
                document.getElementById('plm_cust_modal').style.display = 'none';
                this.modalBrandList = [];
                this.renderModalBrandsTable();
                this.loadCustomerPrices();
                this.calculatePreview();
            } else {
                alert("✕ Error: " + (data.message || 'Failed to save custom price'));
            }
        } catch (e) {
            console.error(e);
            alert("Network error while saving custom price.");
        }
    },

    // 10. Tab 4: Brand-wise Pricing Stats
    loadBrandPricingStats: async function() {
        const tbody = document.getElementById('plm_brand_pricing_tbody');
        if (!tbody) return;

        try {
            const res = await fetch(`api/price_management.php?action=get_brand_pricing_stats&company_id=${this.getCompanyId()}`);
            const data = await res.json();

            if (data.status === 'success') {
                let html = '';
                (data.brands || []).forEach((b, idx) => {
                    const avg = parseFloat(b.avg_price || 0);
                    const min = parseFloat(b.min_price || 0);
                    const max = parseFloat(b.max_price || 0);
                    html += `
                        <tr>
                            <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                            <td style="font-weight:700; color:#1e293b;">${b.brand_name}</td>
                            <td class="num-cell" style="font-weight:700;">${b.total_items}</td>
                            <td class="num-cell">${avg.toFixed(2)}</td>
                            <td class="num-cell">${min.toFixed(2)}</td>
                            <td class="num-cell">${max.toFixed(2)}</td>
                            <td style="text-align:center;">
                                <button class="plm-btn plm-btn-primary" style="padding:2px 8px; font-size:10.5px;" onclick="window.PriceListManagementModule.quickAdjustBrand(${b.id}, '${b.brand_name}')">
                                    <i class="fas fa-edit mr-1"></i> Quick Adjust
                                </button>
                            </td>
                        </tr>
                    `;
                });

                if (html === '') {
                    html = `<tr><td colspan="7" style="text-align:center; padding:25px; color:#94a3b8;">No brands found</td></tr>`;
                }
                tbody.innerHTML = html;
            }
        } catch (e) {
            console.error("PriceListManagementModule: Error loading brand pricing stats:", e);
        }
    },

    quickAdjustBrand: function(brandId, brandName) {
        this.switchTab('bulk_revision');
        const brandSelect = document.getElementById('plm_brand');
        if (brandSelect) {
            brandSelect.value = brandId;
            this.triggerAutoPreview();
        }
    },

    // 11. Tab 5: Revision History & 1-Click Rollback
    loadHistory: async function() {
        const from = document.getElementById('plm_hist_from')?.value || '';
        const to = document.getElementById('plm_hist_to')?.value || '';
        const status = document.getElementById('plm_hist_status')?.value || '';
        const search = document.getElementById('plm_hist_search')?.value.trim() || '';

        const tbody = document.getElementById('plm_history_tbody');
        if (!tbody) return;

        try {
            const url = `api/price_management.php?action=get_history&company_id=${this.getCompanyId()}&from_date=${from}&to_date=${to}&status=${status}&search=${encodeURIComponent(search)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                const countEl = document.getElementById('plm_hist_count');
                if (countEl) countEl.innerText = data.count || data.history.length;

                let html = '';
                (data.history || []).forEach((row, idx) => {
                    const statusBadge = row.status === 'Active' 
                        ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:700;">Active</span>`
                        : (row.status === 'Future'
                            ? `<span class="badge" style="background:#fef3c7; color:#b45309; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:700;">Future</span>`
                            : `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:700;">Reversed</span>`);

                    const canRollback = row.status !== 'Reversed';

                    html += `
                        <tr>
                            <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                            <td style="font-weight:700; color:#1e293b;">${row.revision_no}</td>
                            <td>${row.revision_date}</td>
                            <td style="font-weight:600;">${row.effective_date}</td>
                            <td style="text-align:center;">${row.adjustment_type}</td>
                            <td>${row.apply_to || 'All Customers'}</td>
                            <td>${row.adjustment_method}</td>
                            <td class="num-cell" style="font-weight:700;">${row.adjustment_method === 'Percentage' ? row.adjustment_value + '%' : 'Rs. ' + parseFloat(row.adjustment_value).toFixed(2)}</td>
                            <td class="num-cell">${row.total_items_affected || 0}</td>
                            <td style="text-align:center;">${statusBadge}</td>
                            <td style="font-size:10.5px; color:#475569;">${row.remarks || '-'}</td>
                            <td>${row.created_by || 'Admin'}</td>
                            <td style="text-align:center; white-space:nowrap;">
                                <button class="plm-btn" style="padding:2px 6px; font-size:10px;" onclick="window.PriceListManagementModule.viewRevisionDetails(${row.id})">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                ${canRollback ? `
                                    <button class="plm-btn" style="padding:2px 6px; font-size:10px; color:#dc2626; border-color:#fca5a5;" onclick="window.PriceListManagementModule.rollbackRevision(${row.id}, '${row.revision_no}')">
                                        <i class="fas fa-undo"></i> Rollback
                                    </button>
                                ` : ''}
                            </td>
                        </tr>
                    `;
                });

                if (html === '') {
                    html = `<tr><td colspan="13" style="text-align:center; padding:25px; color:#94a3b8;">No revision history records found.</td></tr>`;
                }
                tbody.innerHTML = html;
            }
        } catch (e) {
            console.error("PriceListManagementModule: Error loading history:", e);
        }
    },

    // 12. View Details & Audit Trail Modal
    viewRevisionDetails: async function(revId) {
        const modal = document.getElementById('plm_details_modal');
        if (!modal) return;
        modal.style.display = 'flex';

        const metaDiv = document.getElementById('plm_details_meta');
        const tbody = document.getElementById('plm_details_tbody');
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading details...</td></tr>`;

        try {
            const res = await fetch(`api/price_management.php?action=get_revision_details&company_id=${this.getCompanyId()}&revision_id=${revId}`);
            const data = await res.json();

            if (data.status === 'success') {
                const h = data.header || {};
                const items = data.items || [];

                document.getElementById('plm_details_title').innerHTML = `<i class="fas fa-history mr-1"></i> Revision Details: <b>${h.revision_no}</b> (${h.adjustment_type} - ${h.status})`;

                metaDiv.innerHTML = `
                    <div><b>Revision Date:</b> ${h.revision_date}</div>
                    <div><b>Effective Date:</b> ${h.effective_date}</div>
                    <div><b>Adjustment Method:</b> ${h.adjustment_method} (${h.adjustment_value})</div>
                    <div><b>Apply To:</b> ${h.apply_to}</div>
                    <div><b>Total Items Affected:</b> ${h.total_items_affected}</div>
                    <div><b>Updated By:</b> ${h.created_by}</div>
                    <div style="grid-column: 1 / -1;"><b>Remarks:</b> ${h.remarks || 'None'}</div>
                    ${h.status === 'Reversed' ? `<div style="grid-column: 1 / -1; color:#dc2626; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> Reversed on ${h.reversed_at} by ${h.reversed_by}</div>` : ''}
                `;

                let html = '';
                items.forEach((it, idx) => {
                    const oldP = parseFloat(it.old_price || 0);
                    const newP = parseFloat(it.new_price || 0);
                    const adj = parseFloat(it.adjustment_value || 0);
                    const custDisplay = it.customer_name ? `<span style="color:#1d4ed8; font-weight:700;">${it.customer_name}</span>` : '<span style="color:#64748b;">(General Factory Rate)</span>';

                    html += `
                        <tr>
                            <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                            <td style="font-weight:700;">${it.item_code}</td>
                            <td>${it.item_name}</td>
                            <td>${custDisplay}</td>
                            <td class="num-cell">${oldP.toFixed(2)}</td>
                            <td class="num-cell" style="font-weight:700; color:${adj >= 0 ? '#15803d' : '#dc2626'};">${adj >= 0 ? '+' : ''}${adj.toFixed(2)}</td>
                            <td class="plm-highlight-cell">${newP.toFixed(2)}</td>
                            <td style="text-align:center; font-size:10px; font-weight:700; color:${it.status === 'Applied' ? '#15803d' : '#dc2626'};">${it.status}</td>
                        </tr>
                    `;
                });

                if (html === '') {
                    html = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No items attached to this revision.</td></tr>`;
                }
                tbody.innerHTML = html;
            }
        } catch (e) {
            console.error(e);
        }
    },

    // 13. Rollback Revision
    rollbackRevision: async function(revId, revNo) {
        const confirmMsg = `⚠️ ROLLBACK CONFIRMATION:\n\n` +
                           `Are you sure you want to reverse Revision "${revNo}"?\n\n` +
                           `This will restore all item general rates and customer custom prices back to their exact previous rates.\n` +
                           `An audit log entry will be created and the revision will be marked as "Reversed".`;
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`api/price_management.php?action=rollback_revision&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision_id: revId })
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`✓ SUCCESS:\n\n${data.message}`);
                this.loadHistory();
                this.loadGeneralPrices();
                this.loadCustomerPrices();
                this.calculatePreview();
            } else {
                alert(`✕ ERROR:\n\n${data.message || 'Rollback failed'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Network error during revision rollback.");
        }
    },

    // 14. Print & Catalog Printing System
    openPrintModal: function() {
        const modal = document.getElementById('plm_print_dialog_modal');
        if (!modal) return;
        modal.style.display = 'flex';

        // Pre-fill active filters
        const activeTab = document.querySelector('.plm-tab-btn.active')?.getAttribute('data-tab');
        const priceTypeSelect = document.getElementById('plm_print_price_type');
        const brandSelect = document.getElementById('plm_print_brand_select');
        const custSelect = document.getElementById('plm_print_cust_select');

        if (activeTab === 'customer') {
            if (priceTypeSelect) priceTypeSelect.value = 'customer';
            this.onPrintPriceTypeChange('customer');
            const activeCust = document.getElementById('plm_cust_list_filter')?.value;
            if (custSelect && activeCust) custSelect.value = activeCust;
            const activeBrand = document.getElementById('plm_cust_brand_filter')?.value;
            if (brandSelect && activeBrand) brandSelect.value = activeBrand;
        } else {
            if (priceTypeSelect) priceTypeSelect.value = 'general';
            this.onPrintPriceTypeChange('general');
            const activeBrand = document.getElementById('plm_gen_brand_filter')?.value;
            if (brandSelect && activeBrand) brandSelect.value = activeBrand;
            const activeCat = document.getElementById('plm_gen_cat_filter')?.value;
            const catSelect = document.getElementById('plm_print_cat_select');
            if (catSelect && activeCat) catSelect.value = activeCat;
        }

        // Apply user-defined default checkbox selections:
        // Checked: S.No, Brand, Pcs/Carton, Size, Rate/Carton, Fitting Photo
        // Unchecked: Item Code, Notes/Terms, Live QR Code
        const colSno = document.getElementById('plm_col_sno');
        if (colSno) colSno.checked = true;
        const colCode = document.getElementById('plm_col_code');
        if (colCode) colCode.checked = false;
        const colBrand = document.getElementById('plm_col_brand');
        if (colBrand) colBrand.checked = true;
        const colSize = document.getElementById('plm_col_size');
        if (colSize) colSize.checked = true;
        const colCtn = document.getElementById('plm_col_ctn');
        if (colCtn) colCtn.checked = true;
        const colRateCtn = document.getElementById('plm_col_rate_ctn');
        if (colRateCtn) colRateCtn.checked = true;
        const colImg = document.getElementById('plm_col_image');
        if (colImg) colImg.checked = true;
        const colNotes = document.getElementById('plm_col_notes');
        if (colNotes) colNotes.checked = false;
        const colQr = document.getElementById('plm_print_qr_code');
        if (colQr) colQr.checked = false;
    },

    onPrintFormatChange: function(format) {
        const imgRow = document.getElementById('plm_print_image_toggle_row');
        if (imgRow) imgRow.style.display = format === 'catalog' ? 'flex' : 'none';
    },

    onPrintPriceTypeChange: function(type) {
        const custRow = document.getElementById('plm_print_cust_row');
        if (custRow) custRow.style.display = type === 'customer' ? 'flex' : 'none';
    },

    executePrint: async function() {
        const format = document.getElementById('plm_print_format')?.value || 'catalog';
        const priceType = document.getElementById('plm_print_price_type')?.value || 'general';
        const custId = document.getElementById('plm_print_cust_select')?.value || '';
        const brandId = document.getElementById('plm_print_brand_select')?.value || '';
        const catId = document.getElementById('plm_print_cat_select')?.value || '';
        const printDate = document.getElementById('plm_print_date')?.value || new Date().toISOString().split('T')[0];

        // Column selection flags
        const colSno = document.getElementById('plm_col_sno')?.checked ?? true;
        const colCode = document.getElementById('plm_col_code')?.checked ?? true;
        const colName = true; // Always on
        const colBrand = document.getElementById('plm_col_brand')?.checked ?? true;
        const colSize = document.getElementById('plm_col_size')?.checked ?? true;
        const colRate = true; // Always on
        const colCtn = document.getElementById('plm_col_ctn')?.checked ?? true;
        const colRateCtn = document.getElementById('plm_col_rate_ctn')?.checked ?? true;
        const colImage = document.getElementById('plm_col_image')?.checked ?? true;
        const colNotes = document.getElementById('plm_col_notes')?.checked ?? false;
        const colQrCode = document.getElementById('plm_print_qr_code')?.checked ?? true;

        if (priceType === 'customer' && !custId) {
            alert("Please select a customer for Customer Negotiated Price List.");
            return;
        }

        // Close modal
        document.getElementById('plm_print_dialog_modal').style.display = 'none';

        try {
            let items = [];
            let customerName = '';
            let apiRateDate = '';

            if (priceType === 'customer') {
                let url = `api/price_management.php?action=get_customer_price_list&company_id=${this.getCompanyId()}&customer_id=${custId}`;
                if (brandId) url += `&brand_id=${brandId}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.status === 'success') {
                    items = data.customer_prices || [];
                    if (items.length > 0) customerName = items[0].customer_name || '';
                    apiRateDate = data.latest_rate_date || '';
                }
            } else {
                let url = `api/price_management.php?action=get_general_price_list&company_id=${this.getCompanyId()}`;
                if (catId) url += `&category_id=${catId}`;
                if (brandId) url += `&brand_id=${brandId}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.status === 'success') {
                    items = data.items || [];
                    apiRateDate = data.latest_rate_date || '';
                }
            }

            if (items.length === 0) {
                alert("No items found matching the selected print criteria.");
                return;
            }

            // Company info from live database
            const co = this.meta?.company || {};
            const compName = co.name || 'SOFTIFYX ERP';
            const compAddr = co.address || '';
            const compPhone = co.phone ? `Tel: ${co.phone}` : '';
            const compLogo = co.logo_data || '';

            // Use the actual date when rates were changed / applied
            const effectiveDate = apiRateDate || printDate;
            let displayDate = effectiveDate;
            try {
                const parts = effectiveDate.split('-');
                if (parts.length === 3) {
                    displayDate = `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}`;
                }
            } catch(e) {}

            const currentUrl = window.location.href.split('#')[0].split('?')[0];
            const dirUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
            let qrUrl = `${dirUrl}catalog.php?company_id=${this.getCompanyId()}`;
            if (custId) qrUrl += `&cust=${custId}`;
            if (brandId) qrUrl += `&brand=${brandId}`;
            if (catId) qrUrl += `&cat=${catId}`;

            const qrImgSrc = colQrCode ? this.generateQrDataUrl(qrUrl) : '';
            const qrBoxHtml = (colQrCode && qrImgSrc) ? `
                <div style="text-align:center; padding-left:14px; flex-shrink:0;">
                    <div style="background:#ffffff; padding:4px; border:1px solid #94a3b8; border-radius:4px; display:inline-block; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                        <img src="${qrImgSrc}" alt="Live QR" style="width:80px; height:80px; display:block; margin:auto;">
                    </div>
                    <div style="font-size:8px; font-weight:800; color:#0f172a; margin-top:3px; text-transform:uppercase; letter-spacing:0.4px;">Scan for Live Rates</div>
                </div>
            ` : '';

            const printWindow = window.open('', '_blank', 'width=1050,height=800');

            const custSubheader = customerName ? `<div style="font-size:12px; font-weight:700; color:#1e293b; margin-bottom:6px; background:#f8fafc; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px;">Customer: <span style="color:#ea580c;">${customerName}</span></div>` : '';

            // Common Header Graphic HTML
            const headerHtml = `
                <div class="catalog-header">
                    <div class="header-brand-box">
                        ${compLogo ? `<img src="${compLogo}" class="logo-img">` : `<div class="logo-fallback">${compName ? compName.charAt(0) : 'S'}</div>`}
                        <div class="comp-title-box">
                            <span class="comp-name-main">${compName}</span>
                            ${compAddr || compPhone ? `<span class="comp-sub-details">${compAddr}${compPhone ? ' | ' + compPhone : ''}</span>` : ''}
                        </div>
                    </div>
                    <div class="header-swoop"></div>
                </div>

                <div class="ribbon-bar">
                    <div class="pill-title">Price list</div>
                    <div class="date-badge">Date : ${displayDate}</div>
                </div>

                ${custSubheader}
            `;

            // Common Print Styles
            const commonStyles = `
                @page {
                    size: A4 portrait;
                    margin: 8mm 10mm;
                }
                * { box-sizing: border-box; }
                body {
                    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
                    color: #000;
                    background: #fff;
                    margin: 0;
                    padding: 10px 14px;
                    font-size: 11px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .catalog-container {
                    width: 100%;
                    max-width: 840px;
                    margin: auto;
                }
                .catalog-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: relative;
                    margin-bottom: 4px;
                }
                .header-brand-box {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .logo-img {
                    max-height: 52px;
                    max-width: 90px;
                    object-fit: contain;
                }
                .logo-fallback {
                    font-size: 32px;
                    font-weight: 900;
                    color: #ea580c;
                    letter-spacing: -2px;
                    line-height: 1;
                }
                .comp-title-box {
                    display: flex;
                    flex-direction: column;
                }
                .comp-name-main {
                    font-size: 26px;
                    font-weight: 900;
                    color: #334155;
                    letter-spacing: 0.5px;
                    line-height: 1.05;
                    text-transform: uppercase;
                }
                .comp-sub-details {
                    font-size: 10.5px;
                    font-weight: 700;
                    color: #ea580c;
                    letter-spacing: 0.3px;
                    margin-top: 2px;
                }
                .header-swoop {
                    position: relative;
                    width: 220px;
                    height: 55px;
                    overflow: hidden;
                }
                .header-swoop::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 200px;
                    height: 55px;
                    background: #ea580c;
                    border-bottom-left-radius: 90px;
                    z-index: 1;
                }
                .header-swoop::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 175px;
                    height: 48px;
                    background: #cbd5e1;
                    border-bottom-left-radius: 80px;
                    z-index: 2;
                }
                .ribbon-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #ea580c;
                    height: 34px;
                    border-radius: 4px;
                    position: relative;
                    padding: 0 10px;
                    margin-bottom: 8px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .pill-title {
                    position: absolute;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #334155;
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 800;
                    padding: 4px 34px;
                    border-radius: 18px;
                    border: 2px solid #ea580c;
                    letter-spacing: 0.5px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.25);
                }
                .date-badge {
                    margin-left: auto;
                    color: #ffffff;
                    font-size: 11.5px;
                    font-weight: 800;
                    letter-spacing: 0.5px;
                }
                table.cat-table {
                    width: 100%;
                    border-collapse: collapse;
                    border: 1.5px solid #000;
                    font-size: 11px;
                }
                table.cat-table th {
                    border: 1px solid #000;
                    background: #f1f5f9;
                    color: #000;
                    font-size: 11.5px;
                    font-weight: 900;
                    text-align: center;
                    padding: 6px 4px;
                    text-transform: uppercase;
                }
                table.cat-table td {
                    border: 1px solid #000;
                    padding: 3px 5px;
                    font-size: 11px;
                    color: #000;
                }
                td.cell-group-name {
                    vertical-align: middle;
                    text-align: center;
                    font-size: 11.5px;
                    font-weight: 900;
                    letter-spacing: 0.5px;
                    padding: 4px 6px;
                    background: #ffffff;
                }
                td.cell-image {
                    vertical-align: middle;
                    text-align: center;
                    padding: 4px;
                    width: 95px;
                    background: #ffffff;
                }
                .footer-note {
                    font-size: 10.5px;
                    font-style: italic;
                    font-weight: 800;
                    padding: 4px 6px;
                    background: #f8fafc;
                }
                .footer-address {
                    font-size: 11px;
                    font-style: italic;
                    font-weight: 800;
                    padding: 4px 6px;
                    background: #f8fafc;
                }
                .catalog-bottom-bar {
                    width: 100%;
                    height: 14px;
                    background: #334155;
                    border-bottom: 5px solid #ea580c;
                    margin-top: 8px;
                    border-radius: 2px;
                }
                @media print {
                    body { padding: 0; }
                    button { display: none !important; }
                    tr { page-break-inside: avoid; }
                }
            `;

            if (format === 'catalog') {
                // Group items by Sub Category Name (Fitting Group)
                const groups = {};
                items.forEach(it => {
                    const groupKey = it.sub_name ? it.sub_name.trim().toUpperCase() : (it.item_name || it.name || 'FITTINGS').trim().toUpperCase();
                    if (!groups[groupKey]) {
                        groups[groupKey] = {
                            name: groupKey,
                            image: it.sub_image || '',
                            items: []
                        };
                    }
                    groups[groupKey].items.push(it);
                });

                // Build Table Headers dynamically based on checked columns
                let ths = [];
                if (colSno) ths.push('<th style="width: 45px;">S.no</th>');
                if (colCode) ths.push('<th style="width: 85px;">Item Code</th>');
                if (colName) ths.push('<th>ITEMS NAME</th>');
                if (colBrand) ths.push('<th style="width: 90px;">Brand</th>');
                if (colSize) ths.push('<th style="width: 75px;">SIZE</th>');
                if (colRate) ths.push('<th style="width: 85px;">RATE/PCS</th>');
                if (colCtn) ths.push('<th style="width: 75px;">PCS/CTN</th>');
                if (colRateCtn) ths.push('<th style="width: 95px;">RATE/CTN</th>');
                if (colImage) ths.push('<th style="width: 95px;">ITEMS</th>');
                if (colNotes) ths.push('<th>Notes</th>');
                const totalColSpan = ths.length;

                let tableRowsHtml = '';
                let serialNo = 1;

                Object.keys(groups).forEach(gKey => {
                    const grp = groups[gKey];
                    const rowCount = grp.items.length;
                    
                    grp.items.forEach((item, idx) => {
                        const size = item.size || '-';
                        const rate = parseFloat(item.custom_price !== undefined ? item.custom_price : (item.selling_price || 0));
                        const ctn = parseFloat(item.pcs_per_carton || item.qty_per_piece || item.carton || 0);
                        const rateCtn = ctn > 0 ? (rate * ctn) : 0;

                        const rateFormatted = rate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                        const rateCtnFormatted = rateCtn > 0 ? rateCtn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-';
                        const ctnFormatted = ctn > 0 ? (Number.isInteger(ctn) ? ctn : ctn.toFixed(0)) : '-';

                        tableRowsHtml += '<tr>';
                        if (colSno) tableRowsHtml += `<td style="text-align:center; font-weight:700;">${serialNo++}</td>`;
                        if (colCode) tableRowsHtml += `<td style="text-align:center; font-weight:600;">${item.item_code || item.code || '-'}</td>`;

                        // First row of group spans all sizes for Item Name & Image
                        if (colName && idx === 0) {
                            tableRowsHtml += `<td rowspan="${rowCount}" class="cell-group-name">${grp.name}</td>`;
                        }
                        if (colBrand) tableRowsHtml += `<td style="text-align:center;">${item.brand_name || '-'}</td>`;
                        if (colSize) tableRowsHtml += `<td style="text-align:center; font-weight:700;">${size}</td>`;
                        if (colRate) tableRowsHtml += `<td style="text-align:right; font-weight:700; padding-right:8px;">${rateFormatted}</td>`;
                        if (colCtn) tableRowsHtml += `<td style="text-align:center; font-weight:700;">${ctnFormatted}</td>`;
                        if (colRateCtn) tableRowsHtml += `<td style="text-align:right; font-weight:700; padding-right:8px;">${rateCtnFormatted}</td>`;

                        if (colImage && idx === 0) {
                            let imgCell = '';
                            if (grp.image) {
                                imgCell = `<img src="${grp.image}" alt="${grp.name}" style="max-height:54px; max-width:85px; object-fit:contain; display:block; margin:auto;">`;
                            } else {
                                imgCell = `<span style="color:#94a3b8; font-size:10px;">${grp.name}</span>`;
                            }
                            tableRowsHtml += `<td rowspan="${rowCount}" class="cell-image">${imgCell}</td>`;
                        }
                        if (colNotes) tableRowsHtml += `<td style="font-size:10px;">${item.notes || '-'}</td>`;

                        tableRowsHtml += '</tr>';
                    });
                });

                const catalogHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Price list - ${compName}</title>
    <style>${commonStyles}</style>
</head>
<body>
    <div class="catalog-container">
        ${headerHtml}

        <!-- Catalog Items Table -->
        <table class="cat-table">
            <thead>
                <tr>${ths.join('')}</tr>
            </thead>
            <tbody>
                ${tableRowsHtml}
                <tr>
                    <td colspan="${totalColSpan}" style="padding:0; border:1.5px solid #000; background:#f8fafc;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px;">
                            <div style="flex:1;">
                                <div style="font-size:10.5px; font-style:italic; font-weight:800; color:#0f172a;">1. All Prices are subject to change without prior Notice</div>
                                <div style="font-size:11px; font-style:italic; font-weight:800; color:#334155; margin-top:3px;">${compAddr} ${compPhone ? ' | ' + compPhone : ''}</div>
                            </div>
                            ${qrBoxHtml}
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Bottom Accent Strip -->
        <div class="catalog-bottom-bar"></div>
    </div>
</body>
</html>
                `;

                printWindow.document.write(catalogHtml);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                }, 600);
            } else {
                // Standard Tabular Report (WITH SAME EXECUTIVE HEADER & CUSTOMIZABLE COLUMNS)
                let stdThs = [];
                if (colSno) stdThs.push('<th style="width: 40px;">#</th>');
                if (colCode) stdThs.push('<th style="width: 90px;">Item Code</th>');
                if (colName) stdThs.push('<th>Item Name</th>');
                if (colBrand) stdThs.push('<th style="width: 100px;">Brand</th>');
                if (colSize) stdThs.push('<th style="width: 75px;">Size</th>');
                if (colRate) stdThs.push('<th style="width: 85px; text-align:right;">Rate</th>');
                if (colCtn) stdThs.push('<th style="width: 75px; text-align:center;">Pcs/Ctn</th>');
                if (colRateCtn) stdThs.push('<th style="width: 95px; text-align:right;">Rate/Ctn</th>');
                if (colImage) stdThs.push('<th style="width: 80px; text-align:center;">Photo</th>');
                if (colNotes) stdThs.push('<th>Notes</th>');
                const stdTotalColSpan = stdThs.length;

                let stdRows = '';
                items.forEach((it, idx) => {
                    const price = parseFloat(it.custom_price !== undefined ? it.custom_price : (it.selling_price || 0));
                    const ctn = parseFloat(it.pcs_per_carton || it.qty_per_piece || it.carton || 0);
                    const rateCtn = ctn > 0 ? (price * ctn) : 0;

                    const priceFormatted = price.toFixed(2);
                    const rateCtnFormatted = rateCtn > 0 ? rateCtn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-';
                    const ctnFormatted = ctn > 0 ? (Number.isInteger(ctn) ? ctn : ctn.toFixed(0)) : '-';

                    stdRows += '<tr>';
                    if (colSno) stdRows += `<td style="text-align:center;">${idx + 1}</td>`;
                    if (colCode) stdRows += `<td style="font-weight:600;">${it.item_code || it.code || '-'}</td>`;
                    if (colName) stdRows += `<td style="font-weight:700;">${it.item_name || it.name || '-'}</td>`;
                    if (colBrand) stdRows += `<td>${it.brand_name || '-'}</td>`;
                    if (colSize) stdRows += `<td style="text-align:center;">${it.size || '-'}</td>`;
                    if (colRate) stdRows += `<td style="text-align:right; font-weight:700;">${priceFormatted}</td>`;
                    if (colCtn) stdRows += `<td style="text-align:center; font-weight:600;">${ctnFormatted}</td>`;
                    if (colRateCtn) stdRows += `<td style="text-align:right; font-weight:700;">${rateCtnFormatted}</td>`;
                    if (colImage) {
                        const img = it.sub_image ? `<img src="${it.sub_image}" style="max-height:36px; max-width:60px; object-fit:contain; display:block; margin:auto;">` : '-';
                        stdRows += `<td style="text-align:center;">${img}</td>`;
                    }
                    if (colNotes) stdRows += `<td style="font-size:10px;">${it.notes || '-'}</td>`;
                    stdRows += '</tr>';
                });

                const stdHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Price List - ${compName}</title>
    <style>${commonStyles}</style>
</head>
<body>
    <div class="catalog-container">
        ${headerHtml}

        <!-- Standard Items Table -->
        <table class="cat-table">
            <thead>
                <tr>${stdThs.join('')}</tr>
            </thead>
            <tbody>
                ${stdRows}
                <tr>
                    <td colspan="${stdTotalColSpan}" style="padding:0; border:1.5px solid #000; background:#f8fafc;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px;">
                            <div style="flex:1;">
                                <div style="font-size:10.5px; font-style:italic; font-weight:800; color:#0f172a;">1. All Prices are subject to change without prior Notice</div>
                                <div style="font-size:11px; font-style:italic; font-weight:800; color:#334155; margin-top:3px;">${compAddr} ${compPhone ? ' | ' + compPhone : ''}</div>
                            </div>
                            ${qrBoxHtml}
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Bottom Accent Strip -->
        <div class="catalog-bottom-bar"></div>
    </div>
</body>
</html>
                `;
                printWindow.document.write(stdHtml);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                }, 500);
            }
        } catch(e) {
            console.error("Execute print error:", e);
            alert("Error generating price list printout.");
        }
    },

    exportExcel: function() {
        const activePane = document.querySelector('.plm-tab-pane.active');
        const table = activePane ? activePane.querySelector('table') : document.getElementById('plm_preview_table');
        if (!table) {
            alert("No data table found to export.");
            return;
        }

        let csv = [];
        const rows = table.querySelectorAll('tr');
        rows.forEach(r => {
            let rowData = [];
            const cols = r.querySelectorAll('th, td');
            cols.forEach(c => {
                let text = c.innerText.replace(/(\r\n|\n|\r)/gm, ' ').replace(/"/g, '""').trim();
                rowData.push(`"${text}"`);
            });
            if (rowData.length > 0) csv.push(rowData.join(','));
        });

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv.join('\n'));
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', `Price_List_Export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // ==========================================
    // QR CODE DATA URL GENERATOR (OFFLINE LOCAL VIA QRCODE.MIN.JS)
    // ==========================================
    generateQrDataUrl: function(text) {
        if (!text) return '';
        const cleanText = String(text).trim();
        if (typeof QRCode !== 'undefined') {
            try {
                const tempDiv = document.createElement('div');
                tempDiv.style.position = 'absolute';
                tempDiv.style.left = '-9999px';
                tempDiv.style.top = '-9999px';
                document.body.appendChild(tempDiv);

                // Level L gives larger, ultra-scannable blocks with rapid camera recognition
                new QRCode(tempDiv, {
                    text: cleanText,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.L
                });

                let dataUrl = '';
                const canvas = tempDiv.querySelector('canvas');
                if (canvas && typeof canvas.toDataURL === 'function') {
                    // Standard QR specification requires a 4-module Quiet Zone (white margin).
                    // Adding a 20px pure white margin around the QR code allows scanners to detect finder targets instantly!
                    const margin = 20;
                    const finalCanvas = document.createElement('canvas');
                    finalCanvas.width = canvas.width + (margin * 2);
                    finalCanvas.height = canvas.height + (margin * 2);
                    const ctx = finalCanvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                    ctx.drawImage(canvas, margin, margin);
                    dataUrl = finalCanvas.toDataURL('image/png');
                } else {
                    const img = tempDiv.querySelector('img');
                    if (img && img.src && img.src.startsWith('data:image')) {
                        dataUrl = img.src;
                    }
                }
                document.body.removeChild(tempDiv);
                if (dataUrl) return dataUrl;
            } catch (e) {
                console.warn('PriceListManagementModule: QR generation error:', e);
            }
        }
        return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=4&data=${encodeURIComponent(cleanText)}`;
    },

    // ==========================================
    // 1-CLICK DIRECT WHATSAPP & EMAIL SHARING
    // ==========================================
    cleanPhone: function(phone) {
        if (!phone) return '';
        let p = String(phone).replace(/\D/g, '');
        if (p.startsWith('0092')) p = p.substring(2);
        else if (p.startsWith('0')) p = '92' + p.substring(1);
        else if (p.length === 10 && p.startsWith('3')) p = '92' + p;
        return p;
    },

    formatShareText: function({ companyName, companyAddr, companyPhone, date, customerName, items, isCustomerSpecific }) {
        let msg = `*PRICE LIST - ${companyName.toUpperCase()}*\n`;
        msg += `📅 Date: ${date}\n`;
        if (customerName) {
            msg += `👤 Customer: ${customerName}\n`;
        }
        if (isCustomerSpecific) {
            msg += `🏷️ Type: Customer Negotiated Special Rates\n`;
        }
        msg += `------------------------------------------\n`;

        items.forEach((item, idx) => {
            const name = item.item_name || item.name || '';
            const size = item.size ? ` (${item.size})` : '';
            const rate = parseFloat(item.custom_price !== undefined ? item.custom_price : (item.selling_price || 0));
            const ctn = parseFloat(item.pcs_per_carton || item.qty_per_piece || item.carton || 0);
            const rateCtn = ctn > 0 ? (rate * ctn) : 0;

            msg += `${idx + 1}. *${name}*${size}\n`;
            msg += `   • Rate: Rs ${rate.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})} / Pcs`;
            if (ctn > 0) {
                msg += ` | Ctn: ${ctn} Pcs (Rs ${rateCtn.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})})`;
            }
            msg += `\n`;
        });

        msg += `------------------------------------------\n`;
        msg += `⚠️ All prices are subject to change without prior notice.\n`;
        if (companyAddr || companyPhone) {
            msg += `📍 ${companyAddr} ${companyPhone ? '| ' + companyPhone : ''}\n`;
        }
        const currentUrl = window.location.href.split('#')[0].split('?')[0];
        const dirUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
        msg += `🌐 View Online Catalog: ${dirUrl}catalog.php\n`;
        return msg;
    },

    sendWhatsApp: function(phone, message) {
        let targetPhone = this.cleanPhone(phone);
        if (!targetPhone) {
            const promptVal = prompt("Customer WhatsApp number enter karein (e.g. 03001234567):", "");
            if (promptVal === null) return;
            targetPhone = this.cleanPhone(promptVal);
        }

        const url = targetPhone
            ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
            : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },

    sendEmail: function(email, subject, body) {
        let targetEmail = email ? String(email).trim() : '';
        if (!targetEmail) {
            const promptVal = prompt("Customer Email address enter karein:", "");
            if (promptVal === null) return;
            targetEmail = String(promptVal).trim();
        }

        const mailtoUrl = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    },

    ensureHtml2Pdf: async function() {
        if (window.html2canvas || window.html2pdf) return true;
        return new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'assets/js/html2pdf.bundle.min.js';
            s.onload = () => resolve(true);
            s.onerror = () => {
                const cdn = document.createElement('script');
                cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                cdn.onload = () => resolve(true);
                cdn.onerror = () => resolve(false);
                document.head.appendChild(cdn);
            };
            document.head.appendChild(s);
        });
    },

    currentSharedImage: null,

    generatePriceListImage: async function(opts) {
        await this.ensureHtml2Pdf();

        const co = this.meta?.company || {};
        const compName = co.name || 'SOFTIFYX ERP';
        const compAddr = co.address || '';
        const compPhone = co.phone ? `Tel: ${co.phone}` : '';
        const compLogo = co.logo_data || '';
        const displayDate = opts.date || new Date().toISOString().slice(0, 10);
        const customerName = opts.customerName || '';
        const customerCode = opts.customerCode || '';
        const items = opts.items || [];
        const isCust = !!opts.isCustomerSpecific;

        // Create container element
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 800px;
            background: #ffffff;
            color: #0f172a;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            padding: 24px 28px;
            box-sizing: border-box;
            z-index: -999;
        `;

        // Table Rows HTML
        let tableRowsHtml = '';
        items.forEach((it, idx) => {
            const name = it.item_name || '-';
            const brand = it.brand_name || '-';
            const size = it.size || '-';
            const unit = it.unit || 'Pcs';
            const rate = parseFloat(isCust ? (it.custom_price || 0) : (it.selling_price || it.general_price || 0)).toFixed(2);
            const genRate = parseFloat(it.general_price || it.selling_price || 0).toFixed(2);
            const diff = isCust ? (parseFloat(it.custom_price || 0) - parseFloat(it.general_price || 0)) : 0;
            const diffText = diff > 0 ? `+${diff.toFixed(2)}` : (diff < 0 ? diff.toFixed(2) : '-');
            const diffColor = diff > 0 ? '#15803d' : (diff < 0 ? '#dc2626' : '#64748b');

            const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            tableRowsHtml += `
                <tr style="background:${bg}; border-bottom:1px solid #e2e8f0; font-size:11.5px;">
                    <td style="padding:6px 8px; text-align:center; color:#64748b;">${idx + 1}</td>
                    <td style="padding:6px 8px; font-weight:700; color:#0f172a;">${name}</td>
                    <td style="padding:6px 8px; color:#1e40af; font-weight:600;">${brand}</td>
                    <td style="padding:6px 8px; color:#475569; text-align:center;">${size !== '-' ? size : unit}</td>
                    <td style="padding:6px 8px; text-align:right; font-weight:800; color:#15803d; font-size:12.5px;">Rs. ${rate}</td>
                    ${isCust ? `<td style="padding:6px 8px; text-align:right; font-weight:700; color:${diffColor}; font-size:11px;">${diffText}</td>` : ''}
                </tr>
            `;
        });

        container.innerHTML = `
            <div style="border: 2px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #ffffff;">
                <!-- Header Graphic like Print Catalog -->
                <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        ${compLogo ? `<img src="${compLogo}" style="max-height:55px; max-width:100px; object-fit:contain; background:#ffffff; padding:3px; border-radius:4px;">` : `<div style="font-size:28px; font-weight:900; background:#ffffff; color:#1e3a8a; width:48px; height:48px; border-radius:6px; display:flex; align-items:center; justify-content:center;">${compName.charAt(0)}</div>`}
                        <div>
                            <div style="font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">${compName}</div>
                            <div style="font-size: 11px; opacity: 0.9; margin-top: 2px;">${compAddr}${compPhone ? ' | ' + compPhone : ''}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="background: #ffffff; color: #1e3a8a; font-weight: 900; font-size: 13px; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; display: inline-block; letter-spacing: 0.5px;">
                            Official Price List
                        </div>
                        <div style="font-size: 11px; margin-top: 4px; opacity: 0.9;">Date: <strong>${displayDate}</strong></div>
                    </div>
                </div>

                ${customerName ? `
                <!-- Customer Sub-banner -->
                <div style="background: #f1f5f9; padding: 10px 24px; border-bottom: 2px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Customer:</span>
                        <span style="font-size: 14px; color: #0f172a; font-weight: 800; margin-left: 6px;">${customerName}</span>
                        ${customerCode ? `<span style="font-size: 10.5px; background: #e2e8f0; color: #334155; padding: 2px 7px; border-radius: 4px; font-weight: 700; margin-left: 8px;">${customerCode}</span>` : ''}
                    </div>
                    <div style="font-size: 11px; color: #1e40af; font-weight: 700;">
                        ${items.length} ${items.length === 1 ? 'Item' : 'Items'} Listed
                    </div>
                </div>
                ` : ''}

                <!-- Items Table -->
                <div style="padding: 16px 20px;">
                    <table style="width: 100%; border-collapse: collapse; font-family: inherit;">
                        <thead>
                            <tr style="background: #1F4E79; color: #ffffff; font-size: 11.5px; text-align: left;">
                                <th style="padding: 7px 8px; width: 35px; text-align: center; border-radius: 4px 0 0 0;">#</th>
                                <th style="padding: 7px 8px;">Item Description</th>
                                <th style="padding: 7px 8px; width: 130px;">Brand</th>
                                <th style="padding: 7px 8px; width: 90px; text-align: center;">Size / Unit</th>
                                <th style="padding: 7px 8px; width: 110px; text-align: right;">${isCust ? 'Custom Rate' : 'Rate (Rs.)'}</th>
                                ${isCust ? `<th style="padding: 7px 8px; width: 80px; text-align: right; border-radius: 0 4px 0 0;">Diff</th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Footer -->
                <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 10px 24px; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #64748b;">
                    <div>Generated via <strong>SOFTIFYX ERP</strong> • Official Price List</div>
                    <div>Valid from: ${displayDate}</div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        try {
            let canvas = null;
            if (window.html2canvas) {
                canvas = await window.html2canvas(container, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
            } else if (window.html2pdf) {
                canvas = await window.html2pdf().from(container).set({
                    html2canvas: { scale: 2, useCORS: true, logging: false }
                }).toCanvas().get('canvas');
            }

            if (!canvas) throw new Error("Could not initialize canvas");

            const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
            document.body.removeChild(container);

            // Upload image to server
            let fileUrl = '';
            const rawFileName = `price_list_${customerName ? customerName.replace(/\s+/g, '_') : 'general'}`;
            try {
                const uploadRes = await fetch(`api/price_management.php?action=save_price_image&company_id=${this.getCompanyId()}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: jpgDataUrl,
                        file_name: rawFileName
                    })
                });
                const uploadData = await uploadRes.json();
                if (uploadData.status === 'success') {
                    fileUrl = uploadData.file_url;
                }
            } catch(upErr) {
                console.warn("Upload price image failed:", upErr);
            }

            return {
                jpgDataUrl,
                fileUrl,
                canvas,
                fileName: rawFileName,
                customerName,
                displayDate
            };
        } catch(err) {
            if (container.parentNode) document.body.removeChild(container);
            throw err;
        }
    },

    showImageShareModal: function(title, dateStr) {
        const modal = document.getElementById('plm_share_image_modal');
        const img = document.getElementById('plm_share_preview_img');
        const info = document.getElementById('plm_share_modal_info');
        if (!modal || !img || !this.currentSharedImage) return;

        img.src = this.currentSharedImage.jpgDataUrl;
        if (info) {
            info.innerHTML = `Price list image for <strong>${title}</strong> (${dateStr}) has been generated.`;
        }
        modal.style.display = 'flex';
    },

    downloadCurrentImage: function() {
        if (!this.currentSharedImage || !this.currentSharedImage.jpgDataUrl) return;
        const a = document.createElement('a');
        a.href = this.currentSharedImage.jpgDataUrl;
        a.download = this.currentSharedImage.fileName || 'Price_List.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    copyCurrentImageToClipboard: function(showNotice = true) {
        if (!this.currentSharedImage || !this.currentSharedImage.canvas) return;
        try {
            this.currentSharedImage.canvas.toBlob(blob => {
                if (blob && navigator.clipboard && window.ClipboardItem) {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(() => {
                        if (showNotice) alert("Image clipboard par copy ho chuki hai! WhatsApp chat mein direct Ctrl + V kar k paste karein.");
                    }).catch(err => {
                        console.warn("Clipboard copy error:", err);
                    });
                }
            }, 'image/png');
        } catch(e) {
            console.warn("toBlob error:", e);
        }
    },

    openWhatsAppWithCurrentImage: function() {
        if (!this.currentSharedImage) return;
        const img = this.currentSharedImage;
        const comp = this.meta?.company || {};
        const compName = comp.name || 'SOFTIFYX ERP';

        let msg = `*${compName}*\n`;
        msg += `📋 *Official Price List - ${img.customerName || 'General'}*\n`;
        msg += `📅 Date: ${img.date}\n\n`;
        if (img.fileUrl) {
            msg += `🖼️ *View / Download Image (JPG):*\n${img.fileUrl}\n\n`;
        }
        msg += `💡 *Note:* Price List image clipboard par copy ho chuki hai, aap chat mein direct *Ctrl + V* kar k bhi send kar sakte hain!`;

        this.sendWhatsApp(img.phone, msg);
    },

    openEmailWithCurrentImage: function() {
        if (!this.currentSharedImage) return;
        const img = this.currentSharedImage;
        const comp = this.meta?.company || {};
        const compName = comp.name || 'SOFTIFYX ERP';

        const subject = `Price List - ${compName}${img.customerName ? ' - ' + img.customerName : ''}`;
        let body = `Dear ${img.customerName || 'Customer'},\n\nPlease find our official Price List dated ${img.date}.\n\n`;
        if (img.fileUrl) {
            body += `View / Download Price List Image (JPG):\n${img.fileUrl}\n\n`;
        }
        body += `Regards,\n${compName}`;

        this.sendEmail(img.email, subject, body);
    },

    shareCustomerPriceList: async function(channel, specificCustId) {
        const custId = specificCustId || document.getElementById('plm_cust_list_filter')?.value || '';
        const brandId = document.getElementById('plm_cust_brand_filter')?.value || '';

        if (!custId) {
            alert("Barahe karam pehly Customer select karein jinki Price List bhejna chahty han.");
            return;
        }

        const countEl = document.getElementById('plm_cust_count');
        const origCountText = countEl ? countEl.innerText : '';
        if (countEl) countEl.innerText = '⏳ Generating Image (JPG)...';

        try {
            let url = `api/price_management.php?action=get_customer_price_list&company_id=${this.getCompanyId()}&customer_id=${custId}`;
            if (brandId && brandId !== 'all_items') url += `&brand_id=${brandId}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status !== 'success' || !data.customer_prices || data.customer_prices.length === 0) {
                alert("Is customer k leye koe customized price list dastiyab nahi hy.");
                if (countEl) countEl.innerText = origCountText;
                return;
            }

            const items = data.customer_prices;
            const firstItem = items[0] || {};
            const customerName = firstItem.customer_name || 'Valued Customer';
            const customerCode = firstItem.customer_code || '';
            const customerPhone = firstItem.customer_phone || '';
            const customerEmail = firstItem.customer_email || '';
            const dateStr = data.latest_rate_date || new Date().toISOString().slice(0, 10);

            // Generate High Quality Print-like JPG Image
            const imgRes = await this.generatePriceListImage({
                customerName: customerName,
                customerCode: customerCode,
                items: items,
                isCustomerSpecific: true,
                date: dateStr
            });

            // Store current shared image info
            this.currentSharedImage = {
                jpgDataUrl: imgRes.jpgDataUrl,
                fileUrl: imgRes.fileUrl,
                fileName: `Price_List_${customerName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.jpg`,
                canvas: imgRes.canvas,
                phone: customerPhone,
                email: customerEmail,
                customerName: customerName,
                date: dateStr
            };

            // Copy to clipboard
            this.copyCurrentImageToClipboard(false);

            // Trigger immediate action according to channel
            if (channel === 'whatsapp') {
                this.openWhatsAppWithCurrentImage();
            } else if (channel === 'email') {
                this.openEmailWithCurrentImage();
            }

            // Also show the preview modal so user can download JPG or re-copy anytime
            this.showImageShareModal(customerName, dateStr);

        } catch(e) {
            console.error("shareCustomerPriceList error:", e);
            alert("Price list image generate karny men error pesh aya: " + e.message);
        } finally {
            if (countEl) countEl.innerText = origCountText;
        }
    },

    shareGeneralPriceList: async function(channel) {
        const catId = document.getElementById('plm_gen_cat_filter')?.value || '';
        const brandId = document.getElementById('plm_gen_brand_filter')?.value || '';

        try {
            let url = `api/price_management.php?action=get_general_price_list&company_id=${this.getCompanyId()}`;
            if (catId) url += `&category_id=${catId}`;
            if (brandId) url += `&brand_id=${brandId}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status !== 'success' || !data.items || data.items.length === 0) {
                alert("General price list men koe items mojod nahi han.");
                return;
            }

            const items = data.items;
            const dateStr = data.latest_rate_date || new Date().toISOString().slice(0, 10);

            const imgRes = await this.generatePriceListImage({
                customerName: '',
                items: items,
                isCustomerSpecific: false,
                date: dateStr
            });

            this.currentSharedImage = {
                jpgDataUrl: imgRes.jpgDataUrl,
                fileUrl: imgRes.fileUrl,
                fileName: `General_Price_List_${dateStr}.jpg`,
                canvas: imgRes.canvas,
                phone: '',
                email: '',
                customerName: 'General Price List',
                date: dateStr
            };

            this.copyCurrentImageToClipboard(false);

            if (channel === 'whatsapp') {
                this.openWhatsAppWithCurrentImage();
            } else {
                this.openEmailWithCurrentImage();
            }

            this.showImageShareModal('General Price List', dateStr);

        } catch(e) {
            console.error("shareGeneralPriceList error:", e);
            alert("General price list image generate karny men error pesh aya: " + e.message);
        }
    },

    shareFromPrintModal: async function(channel) {
        const priceType = document.getElementById('plm_print_price_type')?.value || 'general';
        const custId = document.getElementById('plm_print_cust_select')?.value || '';
        const brandId = document.getElementById('plm_print_brand_select')?.value || '';
        const catId = document.getElementById('plm_print_cat_select')?.value || '';

        if (priceType === 'customer' && !custId) {
            alert("Barahe karam Customer select karein.");
            return;
        }

        try {
            let items = [];
            let customerName = '';
            let customerCode = '';
            let customerPhone = '';
            let customerEmail = '';
            let apiRateDate = '';

            if (priceType === 'customer') {
                let url = `api/price_management.php?action=get_customer_price_list&company_id=${this.getCompanyId()}&customer_id=${custId}`;
                if (brandId) url += `&brand_id=${brandId}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.status === 'success') {
                    items = data.customer_prices || [];
                    if (items.length > 0) {
                        customerName = items[0].customer_name || '';
                        customerCode = items[0].customer_code || '';
                        customerPhone = items[0].customer_phone || '';
                        customerEmail = items[0].customer_email || '';
                    }
                    apiRateDate = data.latest_rate_date || '';
                }
            } else {
                let url = `api/price_management.php?action=get_general_price_list&company_id=${this.getCompanyId()}`;
                if (catId) url += `&category_id=${catId}`;
                if (brandId) url += `&brand_id=${brandId}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.status === 'success') {
                    items = data.items || [];
                    apiRateDate = data.latest_rate_date || '';
                }
            }

            if (items.length === 0) {
                alert("Muntakhib criteria k mutabiq koe items nahi milay.");
                return;
            }

            const dateStr = apiRateDate || document.getElementById('plm_print_date')?.value || new Date().toISOString().slice(0, 10);

            const imgRes = await this.generatePriceListImage({
                customerName: customerName,
                customerCode: customerCode,
                items: items,
                isCustomerSpecific: (priceType === 'customer'),
                date: dateStr
            });

            this.currentSharedImage = {
                jpgDataUrl: imgRes.jpgDataUrl,
                fileUrl: imgRes.fileUrl,
                fileName: `Price_List_${customerName ? customerName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'General'}_${dateStr}.jpg`,
                canvas: imgRes.canvas,
                phone: customerPhone,
                email: customerEmail,
                customerName: customerName || 'General Price List',
                date: dateStr
            };

            this.copyCurrentImageToClipboard(false);

            if (channel === 'whatsapp') {
                this.openWhatsAppWithCurrentImage();
            } else {
                this.openEmailWithCurrentImage();
            }

            this.showImageShareModal(customerName || 'General Price List', dateStr);

        } catch(e) {
            console.error("shareFromPrintModal error:", e);
            alert("Price list image generate karny men error pesh aya: " + e.message);
        }
    }
};

// Global click-outside listener to close Customer Search Dropdowns
document.addEventListener('click', function(e) {
    if (!e.target.closest('#plm_cust_search_input') && !e.target.closest('#plm_cust_search_dropdown')) {
        const d1 = document.getElementById('plm_cust_search_dropdown');
        if (d1) d1.style.display = 'none';
    }
    if (!e.target.closest('#plm_modal_cust_search') && !e.target.closest('#plm_modal_cust_dropdown')) {
        const d2 = document.getElementById('plm_modal_cust_dropdown');
        if (d2) d2.style.display = 'none';
    }
});

