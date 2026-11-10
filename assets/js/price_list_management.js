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

                this.populateSelect('plm_item', data.items, 'id', 'name', 'All Items');
                this.populateSelect('plm_modal_item_select', data.items, 'id', 'name', '-- Select Item --');

                this.populateSelect('plm_customer', data.customers, 'id', 'name', 'All Customers');
                this.populateSelect('plm_cust_list_filter', data.customers, 'id', 'name', 'All Customers with Custom Pricing');
                this.populateSelect('plm_modal_cust_select', data.customers, 'id', 'name', '-- Select Customer --');

                const revNoInp = document.getElementById('plm_rev_no');
                if (revNoInp) revNoInp.value = data.next_revision_no || 'PR-00001';

                const today = data.today || new Date().toISOString().split('T')[0];
                const revDate = document.getElementById('plm_rev_date');
                const effDate = document.getElementById('plm_eff_date');
                if (revDate) revDate.value = today;
                if (effDate) effDate.value = today;
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

    // 9. Tab 2: Customer Price List
    loadCustomerPrices: async function() {
        const custId = document.getElementById('plm_cust_list_filter')?.value || '';
        const tbody = document.getElementById('plm_cust_tbody');
        if (!tbody) return;

        try {
            const url = `api/price_management.php?action=get_customer_price_list&company_id=${this.getCompanyId()}&customer_id=${custId}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                const countEl = document.getElementById('plm_cust_count');
                if (countEl) countEl.innerText = data.count || data.customer_prices.length;

                let html = '';
                (data.customer_prices || []).forEach((row, idx) => {
                    const gen = parseFloat(row.general_price || 0);
                    const cust = parseFloat(row.custom_price || 0);
                    const diff = cust - gen;
                    const diffColor = diff > 0 ? '#15803d' : (diff < 0 ? '#dc2626' : '#64748b');
                    const diffSign = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);

                    html += `
                        <tr>
                            <td style="text-align:center; color:#64748b;">${idx + 1}</td>
                            <td style="font-weight:700; color:#1e293b;">${row.customer_name}</td>
                            <td style="font-weight:600;">${row.item_code}</td>
                            <td>${row.item_name}</td>
                            <td>${row.brand_name || '-'}</td>
                            <td class="num-cell">${gen.toFixed(2)}</td>
                            <td class="plm-highlight-cell">${cust.toFixed(2)}</td>
                            <td class="num-cell" style="font-weight:700; color:${diffColor};">${diffSign}</td>
                            <td style="font-size:10.5px; color:#475569;">${row.notes || '-'}</td>
                            <td style="text-align:center;">
                                <button class="plm-btn" style="padding:2px 6px; font-size:10px;" onclick="window.PriceListManagementModule.editCustomerPrice(${row.customer_id}, ${row.item_id}, ${cust}, '${encodeURIComponent(row.notes || '')}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            </td>
                        </tr>
                    `;
                });

                if (html === '') {
                    html = `<tr><td colspan="10" style="text-align:center; padding:25px; color:#94a3b8;">No customer-specific customized prices set yet. Click "Set Customer Custom Price" to create one.</td></tr>`;
                }
                tbody.innerHTML = html;
            }
        } catch (e) {
            console.error("PriceListManagementModule: Error loading customer prices:", e);
        }
    },

    openAddCustomerPriceModal: function() {
        const modal = document.getElementById('plm_cust_modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('plm_modal_cust_select').value = '';
            document.getElementById('plm_modal_item_select').value = '';
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
        document.getElementById('plm_modal_cust_select').value = custId;
        document.getElementById('plm_modal_item_select').value = itemId;
        this.onModalItemSelect(itemId);
        document.getElementById('plm_modal_custom_rate').value = currentPrice.toFixed(2);
        document.getElementById('plm_modal_notes').value = decodeURIComponent(encodedNotes || '');
    },

    saveCustomerModalPrice: async function() {
        const custId = document.getElementById('plm_modal_cust_select').value;
        const itemId = document.getElementById('plm_modal_item_select').value;
        const price = parseFloat(document.getElementById('plm_modal_custom_rate').value || 0);
        const notes = document.getElementById('plm_modal_notes').value.trim();

        if (!custId || !itemId) {
            alert("Please select both Customer and Item.");
            return;
        }

        try {
            const res = await fetch(`api/price_management.php?action=save_customer_price&company_id=${this.getCompanyId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: custId,
                    item_id: itemId,
                    custom_price: price,
                    notes: notes
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert("✓ Customer custom price saved successfully!");
                document.getElementById('plm_cust_modal').style.display = 'none';
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

    // 14. Print & Excel Export
    printCurrentView: function() {
        const container = document.querySelector('.plm-tab-pane.active') || document.getElementById('plm_root');
        if (!container) return;

        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Price List & Revision Report</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; font-size: 11px; color: #1e293b; }
                        h2 { margin: 0 0 10px 0; color: #1F4E79; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                        th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
                        th { background: #1F4E79; color: #ffffff; }
                        .num-cell { text-align: right; }
                        .plm-highlight-cell { background: #dcfce7 !important; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h2>Price List Management & Price Revision</h2>
                    <p style="font-size:11px; color:#64748b;">Printed on ${new Date().toLocaleString()}</p>
                    ${container.innerHTML}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
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
    }
};

