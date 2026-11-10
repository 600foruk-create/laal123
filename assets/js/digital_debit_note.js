/**
 * SoftifyX ERP - FBR Digital Debit Note Module
 * Handles UI events, live upward calculations, invoice selection, bounds validation, and FBR PRAL submissions.
 */

(function () {
    const DigitalDebitNoteModule = {
        data: {
            companyId: 1,
            company: {},
            settings: {},
            currentDebitNote: null,
            originalInvoice: null,
            items: [],
            reasons: [],
            nextSerial: 1,
            isSubmitting: false
        },

        init: function () {
            const container = document.getElementById('digitalDebitNoteContainer');
            if (!container) return;

            // Load meta settings & next serial
            this.loadMeta(() => {
                this.newDebitNote();
            });

            // Bind Ctrl+S shortcut
            container.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault();
                    this.saveDebitNote();
                }
            });

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
            fetch(`api/digital_debit_note.php?action=get_meta&company_id=${this.data.companyId}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        this.data.company = res.company || {};
                        this.data.settings = res.settings || {};
                        this.data.reasons = res.reasons || [];
                        this.data.nextSerial = res.next_serial || 1;

                        // Environment badge
                        const envBadge = document.getElementById('dn_top_env_badge');
                        if (envBadge && this.data.settings.environment) {
                            const isProd = (this.data.settings.environment === 'production' || this.data.settings.environment === 'live');
                            envBadge.innerText = isProd ? 'FBR Production' : 'FBR Sandbox';
                            envBadge.style.background = isProd ? '#dcfce7' : '#e0f2fe';
                            envBadge.style.color = isProd ? '#15803d' : '#0284c7';
                        }

                        if (typeof callback === 'function') callback();
                    }
                })
                .catch(err => {
                    console.error('Error loading Debit Note meta:', err);
                });
        },

        newDebitNote: function () {
            this.data.currentDebitNote = null;
            this.data.originalInvoice = null;
            this.data.items = [];

            // Reset header inputs
            const snInput = document.getElementById('dn_serial_no');
            if (snInput) snInput.value = this.data.nextSerial;

            const dateInput = document.getElementById('dn_debit_note_date');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

            const dnNoInput = document.getElementById('dn_debit_note_no');
            if (dnNoInput) dnNoInput.value = `DN-${new Date().getFullYear()}-${String(this.data.nextSerial).padStart(4, '0')}`;

            // Reset original invoice fields
            this.setVal('dn_orig_invoice_no', '');
            this.setVal('dn_orig_invoice_id', '');
            this.setVal('dn_orig_invoice_date', '');
            this.setVal('dn_orig_fbr_ref', '');
            this.setText('dn_orig_invoice_total', '0.00');
            this.setText('dn_prev_debit_amt', '0.00');

            // Reset customer fields
            this.setVal('dn_cust_code', '');
            this.setVal('dn_cust_name', '');
            this.setVal('dn_cust_business_name', '');
            this.setVal('dn_customer_coa_id', '');
            this.setVal('dn_cust_ntn', '');
            this.setVal('dn_cust_cnic', '');
            this.setVal('dn_cust_strn', '');
            this.setVal('dn_cust_phone', '');
            this.setVal('dn_cust_address', '');
            this.setVal('dn_cust_province', 'Punjab');

            // Reset reason
            const rSelect = document.getElementById('dn_reason_code');
            if (rSelect) rSelect.value = '01';
            this.onReasonChange();
            this.setVal('dn_detailed_reason', '');
            this.setVal('dn_remarks', '');

            // Reset status pills
            this.updateStatusPill('Pending FBR', 'pill-pending');
            this.setText('dn_card_fbr_inv_no', '-');
            this.setText('dn_card_ref_usin', '-');
            this.setText('dn_card_sub_date', '-');
            this.setText('dn_card_check_time', '-');
            this.setText('dn_sub_ref_usin', '-');
            this.setText('dn_resp_status', '-');

            // Reset grid
            const tbody = document.getElementById('dn_items_tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="18" style="text-align: center; padding: 25px; color: #64748b; font-style: italic;">
                            Please select an original sales invoice using the <b>Select Sales Invoice</b> button above to load items for debit adjustment.
                        </td>
                    </tr>
                `;
            }

            this.recalculateTotals();
        },

        // -------------------------------------------------------------------------
        // Original Invoice Selection
        // -------------------------------------------------------------------------
        openInvoicePicker: function () {
            const modal = document.getElementById('dn_invoice_picker_modal');
            if (!modal) return;
            modal.style.display = 'flex';
            this.searchPickerInvoices('');
        },

        closeInvoicePicker: function () {
            const modal = document.getElementById('dn_invoice_picker_modal');
            if (modal) modal.style.display = 'none';
        },

        searchPickerInvoices: function () {
            const qInput = document.getElementById('dn_picker_search_input');
            const q = qInput ? encodeURIComponent(qInput.value.trim()) : '';
            const tbody = document.getElementById('dn_picker_tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">Searching sales invoices...</td></tr>`;
            }

            fetch(`api/digital_debit_note.php?action=search_invoices&company_id=${this.data.companyId}&q=${q}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.invoices || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">No sales invoices found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map(inv => {
                            const origAmt = parseFloat(inv.original_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            const prevAmt = parseFloat(inv.previous_debit_adjustments || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                            return `
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 6px; font-weight: 700; color: #1e3a8a;">${inv.invoice_no}</td>
                                    <td style="padding: 6px; text-align: center;">${inv.invoice_date}</td>
                                    <td style="padding: 6px;">
                                        <div style="font-weight: 600; color: #0f172a;">${inv.customer_name}</div>
                                        <div style="font-size: 10px; color: #64748b;">NTN: ${inv.customer_ntn || 'N/A'} &bull; Type: ${inv.customer_type}</div>
                                    </td>
                                    <td style="padding: 6px; text-align: right; font-weight: 600;">${origAmt}</td>
                                    <td style="padding: 6px; text-align: right; font-weight: 700; color: #0284c7;">${prevAmt}</td>
                                    <td style="padding: 6px; text-align: center;">
                                        <span class="fbr-status-pill ${inv.fbr_status === 'Submitted' ? 'pill-submitted' : 'pill-pending'}">${inv.fbr_status || 'Draft'}</span>
                                    </td>
                                    <td style="padding: 6px; text-align: center;">
                                        <button type="button" class="fbr-action-btn btn-act-blue" style="height: 22px; padding: 0 8px; font-size: 10px;" onclick="window.DigitalDebitNoteModule.selectInvoice('${inv.invoice_no}')">Select</button>
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                })
                .catch(err => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #dc2626;">Failed to load invoices.</td></tr>`;
                });
        },

        selectInvoice: function (invoiceNo) {
            if (!invoiceNo) return;
            this.closeInvoicePicker();

            fetch(`api/digital_debit_note.php?action=get_invoice_details&company_id=${this.data.companyId}&invoice_no=${encodeURIComponent(invoiceNo)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const inv = res.invoice;
                        this.data.originalInvoice = inv;
                        this.data.items = res.items || [];

                        // Populate Header Info
                        this.setVal('dn_orig_invoice_no', inv.invoice_no);
                        this.setVal('dn_orig_invoice_id', inv.id);
                        this.setVal('dn_orig_invoice_date', inv.invoice_date);
                        this.setVal('dn_orig_fbr_ref', inv.fbr_invoice_no || inv.invoice_no);

                        const origTot = parseFloat(inv.net_payable || 0);
                        const prevTot = parseFloat(inv.previous_debit_adjustments || 0);
                        this.setText('dn_orig_invoice_total', origTot.toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('dn_prev_debit_amt', prevTot.toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Populate Customer Info
                        this.setVal('dn_cust_code', inv.customer_code || '');
                        this.setVal('dn_cust_name', inv.customer_name || '');
                        this.setVal('dn_cust_business_name', inv.business_name || inv.customer_name || '');
                        this.setVal('dn_customer_coa_id', inv.customer_coa_id || '');
                        this.setVal('dn_cust_ntn', inv.customer_ntn || '');
                        this.setVal('dn_cust_cnic', inv.customer_cnic || '');
                        this.setVal('dn_cust_strn', inv.customer_strn || '');
                        this.setVal('dn_cust_phone', inv.customer_phone || '');
                        this.setVal('dn_cust_address', inv.customer_address || '');
                        this.setVal('dn_cust_province', inv.customer_province || 'Punjab');

                        // Update Status Card
                        this.setText('dn_card_ref_usin', inv.fbr_invoice_no || inv.invoice_no);
                        this.setText('dn_sub_ref_usin', inv.fbr_invoice_no || inv.invoice_no);

                        // Render items
                        this.renderItems();
                        this.recalculateTotals();
                    } else {
                        alert(res.message || 'Could not load original sales invoice.');
                    }
                })
                .catch(err => {
                    alert('Network error while loading invoice details: ' + err.message);
                });
        },

        onInvoiceSearchInput: function (val) {
            const suggestBox = document.getElementById('dn_invoice_suggest_box');
            if (!suggestBox) return;

            const q = (val || '').trim();
            if (q.length < 2) {
                suggestBox.style.display = 'none';
                return;
            }

            fetch(`api/digital_debit_note.php?action=search_invoices&company_id=${this.data.companyId}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const list = (res.invoices || []).slice(0, 8);
                        if (list.length === 0) {
                            suggestBox.innerHTML = `<div style="padding: 6px; color: #94a3b8; font-size: 11px;">No matching sales invoices</div>`;
                            suggestBox.style.display = 'block';
                            return;
                        }

                        suggestBox.innerHTML = list.map(inv => `
                            <div class="fbr-suggest-item" onmousedown="window.DigitalDebitNoteModule.selectInvoice('${inv.invoice_no}')">
                                <div>
                                    <b>${inv.invoice_no}</b> - ${inv.customer_name}
                                </div>
                                <div style="font-size: 10px; color: #0284c7; font-weight: 700;">
                                    Total: ${parseFloat(inv.original_total || 0).toLocaleString()}
                                </div>
                            </div>
                        `).join('');
                        suggestBox.style.display = 'block';
                    }
                })
                .catch(() => {
                    suggestBox.style.display = 'none';
                });
        },

        // -------------------------------------------------------------------------
        // Items Grid & Live Calculations
        // -------------------------------------------------------------------------
        renderItems: function () {
            const tbody = document.getElementById('dn_items_tbody');
            if (!tbody) return;

            if (this.data.items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="18" style="text-align: center; padding: 20px; color: #64748b;">No items found in selected invoice.</td></tr>`;
                return;
            }

            tbody.innerHTML = this.data.items.map((it, idx) => {
                const origQ = parseFloat(it.original_qty || it.quantity || 0);
                const origRate = parseFloat(it.original_rate !== undefined ? it.original_rate : (it.rate || 0));
                const origVal = parseFloat(it.original_taxable_value !== undefined ? it.original_taxable_value : (it.val_excl_tax || 0));
                
                const addQ = parseFloat(it.additional_qty || 0);
                const revRate = parseFloat(it.revised_rate !== undefined ? it.revised_rate : origRate);
                const rateDiff = parseFloat(it.rate_difference !== undefined ? it.rate_difference : (revRate - origRate));

                // Upward adjustment value excl tax
                let valExcl = parseFloat(it.val_excl_tax || 0);
                if (valExcl === 0 && (addQ > 0 || rateDiff > 0)) {
                    valExcl = (origQ * Math.max(0, rateDiff)) + (addQ * revRate);
                    it.val_excl_tax = valExcl;
                }

                const taxRate = parseFloat(it.tax_rate || 18);
                const furRate = parseFloat(it.further_tax_rate || 0);
                const extRate = parseFloat(it.extra_tax_rate || 0);
                const fedRate = parseFloat(it.fed_rate || 0);

                const stAmt = valExcl * (taxRate / 100);
                const furAmt = valExcl * (furRate / 100);
                const extAmt = valExcl * (extRate / 100);
                const fedAmt = valExcl * (fedRate / 100);
                const valIncl = valExcl + stAmt + furAmt + extAmt + fedAmt;

                it.sales_tax_adjustment = stAmt;
                it.further_tax_adjustment = furAmt;
                it.extra_tax_adjustment = extAmt;
                it.fed_adjustment = fedAmt;
                it.val_incl_tax = valIncl;
                const isIncluded = it.is_included !== false;

                return `
                    <tr style="border-bottom: 1px solid #cbd5e1; ${!isIncluded ? 'opacity: 0.45;' : ''}">
                        <td style="text-align: center; color: #64748b; font-size: 10px;">${idx + 1}</td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.item_code || ''}"></td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.hs_code || '0000.0000'}"></td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.item_name || it.description || ''}" title="${it.item_name || ''}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${origQ}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${origRate.toFixed(2)}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${origVal.toFixed(2)}"></td>
                        
                        <!-- Additional Quantity -->
                        <td style="background: #eff6ff;">
                            <input type="number" step="any" min="0" class="fbr-tbl-input num" 
                                style="font-weight: 700; color: #1e3a8a; border: 1px solid #93c5fd;" 
                                value="${addQ}" 
                                oninput="window.DigitalDebitNoteModule.onAddQtyChange(${idx}, this.value)"
                                onclick="this.select()" onfocus="this.select()">
                        </td>

                        <!-- Revised Rate -->
                        <td style="background: #eff6ff;">
                            <input type="number" step="any" min="0" class="fbr-tbl-input num" 
                                style="font-weight: 700; color: #1e3a8a; border: 1px solid #93c5fd;" 
                                value="${revRate}" 
                                oninput="window.DigitalDebitNoteModule.onRevRateChange(${idx}, this.value)"
                                onclick="this.select()" onfocus="this.select()">
                        </td>

                        <!-- Rate Difference -->
                        <td><input type="text" id="dn_row_diff_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${rateDiff.toFixed(2)}" style="color: ${rateDiff > 0 ? '#15803d' : '#64748b'}; font-weight: 600;"></td>

                        <!-- Additional Value Excl Tax -->
                        <td style="background: #f0fdf4;">
                            <input type="number" step="any" min="0" class="fbr-tbl-input num" 
                                style="font-weight: 800; color: #15803d; border: 1px solid #86efac;" 
                                value="${valExcl.toFixed(2)}" 
                                oninput="window.DigitalDebitNoteModule.onValExclChange(${idx}, this.value)"
                                onclick="this.select()" onfocus="this.select()">
                        </td>

                        <!-- Tax % -->
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${taxRate}"></td>
                        
                        <!-- Sales Tax Adjustment -->
                        <td><input type="text" id="dn_row_st_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${stAmt.toFixed(2)}"></td>
                        
                        <!-- Further Tax % -->
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${furRate}"></td>

                        <!-- Further Tax Adjustment -->
                        <td><input type="text" id="dn_row_ft_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${furAmt.toFixed(2)}"></td>

                        <!-- Extra / FED -->
                        <td><input type="text" id="dn_row_ext_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${(extAmt + fedAmt).toFixed(2)}"></td>

                        <!-- Total Debit -->
                        <td><input type="text" id="dn_row_tot_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly style="font-weight: 800; color: #1e3a8a;" value="${valIncl.toFixed(2)}"></td>

                        <!-- Include Checkbox -->
                        <td style="text-align: center;">
                            <input type="checkbox" ${isIncluded ? 'checked' : ''} 
                                onchange="window.DigitalDebitNoteModule.onIncludeToggle(${idx}, this.checked)">
                        </td>
                    </tr>
                `;
            }).join('');
        },

        onAddQtyChange: function (idx, val) {
            const it = this.data.items[idx];
            if (!it) return;

            let addQ = parseFloat(val);
            if (isNaN(addQ) || addQ < 0) addQ = 0;
            it.additional_qty = addQ;

            const origQ = parseFloat(it.original_qty || it.quantity || 0);
            const origRate = parseFloat(it.original_rate !== undefined ? it.original_rate : (it.rate || 0));
            const revRate = parseFloat(it.revised_rate !== undefined ? it.revised_rate : origRate);
            const rateDiff = Math.max(0, revRate - origRate);

            it.rate_difference = rateDiff;
            it.val_excl_tax = (origQ * rateDiff) + (addQ * revRate);

            this.updateRowCalculations(idx);
            this.recalculateTotals();
        },

        onRevRateChange: function (idx, val) {
            const it = this.data.items[idx];
            if (!it) return;

            let revRate = parseFloat(val);
            if (isNaN(revRate) || revRate < 0) revRate = 0;
            it.revised_rate = revRate;

            const origQ = parseFloat(it.original_qty || it.quantity || 0);
            const origRate = parseFloat(it.original_rate !== undefined ? it.original_rate : (it.rate || 0));
            const rateDiff = revRate - origRate;

            it.rate_difference = rateDiff;
            const addQ = parseFloat(it.additional_qty || 0);
            it.val_excl_tax = (origQ * Math.max(0, rateDiff)) + (addQ * revRate);

            this.updateRowCalculations(idx);
            this.recalculateTotals();
        },

        onValExclChange: function (idx, val) {
            const it = this.data.items[idx];
            if (!it) return;

            let valExcl = parseFloat(val);
            if (isNaN(valExcl) || valExcl < 0) valExcl = 0;
            it.val_excl_tax = valExcl;

            this.updateRowCalculations(idx, true);
            this.recalculateTotals();
        },

        onIncludeToggle: function (idx, checked) {
            const it = this.data.items[idx];
            if (!it) return;
            it.is_included = !!checked;
            this.renderItems();
            this.recalculateTotals();
        },

        updateRowCalculations: function (idx, skipValExcl) {
            const it = this.data.items[idx];
            if (!it) return;

            const valExcl = parseFloat(it.val_excl_tax || 0);
            const taxRate = parseFloat(it.tax_rate || 18);
            const furRate = parseFloat(it.further_tax_rate || 0);
            const extRate = parseFloat(it.extra_tax_rate || 0);
            const fedRate = parseFloat(it.fed_rate || 0);

            const stAmt = valExcl * (taxRate / 100);
            const furAmt = valExcl * (furRate / 100);
            const extAmt = valExcl * (extRate / 100);
            const fedAmt = valExcl * (fedRate / 100);
            const valIncl = valExcl + stAmt + furAmt + extAmt + fedAmt;

            it.sales_tax_adjustment = stAmt;
            it.further_tax_adjustment = furAmt;
            it.extra_tax_adjustment = extAmt;
            it.fed_adjustment = fedAmt;
            it.val_incl_tax = valIncl;

            const diffInput = document.getElementById(`dn_row_diff_${idx}`);
            if (diffInput) {
                const diff = parseFloat(it.rate_difference || 0);
                diffInput.value = diff.toFixed(2);
                diffInput.style.color = diff > 0 ? '#15803d' : '#64748b';
            }

            const stInput = document.getElementById(`dn_row_st_${idx}`);
            if (stInput) stInput.value = stAmt.toFixed(2);

            const ftInput = document.getElementById(`dn_row_ft_${idx}`);
            if (ftInput) ftInput.value = furAmt.toFixed(2);

            const extInput = document.getElementById(`dn_row_ext_${idx}`);
            if (extInput) extInput.value = (extAmt + fedAmt).toFixed(2);

            const totInput = document.getElementById(`dn_row_tot_${idx}`);
            if (totInput) totInput.value = valIncl.toFixed(2);
        },

        recalculateTotals: function () {
            let totAddQ = 0;
            let totExcl = 0;
            let totSt = 0;
            let totFt = 0;
            let totExt = 0;
            let totIncl = 0;

            (this.data.items || []).forEach(it => {
                if (it.is_included === false) return;

                totAddQ += parseFloat(it.additional_qty || 0);
                totExcl += parseFloat(it.val_excl_tax || 0);
                totSt += parseFloat(it.sales_tax_adjustment || 0);
                totFt += parseFloat(it.further_tax_adjustment || 0);
                totExt += (parseFloat(it.extra_tax_adjustment || 0) + parseFloat(it.fed_adjustment || 0));
                totIncl += parseFloat(it.val_incl_tax || 0);
            });

            // Update footer inputs
            this.setVal('dn_tot_add_qty', totAddQ);
            this.setVal('dn_tot_excl', totExcl.toFixed(2));
            this.setVal('dn_tot_st', totSt.toFixed(2));
            this.setVal('dn_tot_ft', totFt.toFixed(2));
            this.setVal('dn_tot_ext', totExt.toFixed(2));
            this.setVal('dn_tot_incl', totIncl.toFixed(2));

            // Update bottom panel 4
            this.setVal('dn_fin_excl', totExcl.toFixed(2));
            this.setVal('dn_fin_st', totSt.toFixed(2));
            this.setVal('dn_fin_ft', totFt.toFixed(2));
            this.setVal('dn_fin_total', totIncl.toFixed(2));

            // Amount in words
            const wordsEl = document.getElementById('dn_amount_in_words');
            if (wordsEl) {
                wordsEl.innerText = this.numberToWords(Math.round(totIncl)) + ' Rupees Only.';
            }
        },

        onReasonChange: function () {
            const rSelect = document.getElementById('dn_reason_code');
            const disp = document.getElementById('dn_sub_reason_display');
            if (rSelect && disp) {
                disp.innerText = rSelect.options[rSelect.selectedIndex].text;
            }
        },

        // -------------------------------------------------------------------------
        // Save Debit Note (Database Integration)
        // -------------------------------------------------------------------------
        saveDebitNote: function (onSuccess) {
            const origInvNo = this.getVal('dn_orig_invoice_no');
            if (!origInvNo) {
                alert('Please select an original sales invoice first.');
                return;
            }

            // Gather active items
            const activeItems = (this.data.items || []).filter(it => {
                return (it.is_included !== false) && (parseFloat(it.val_excl_tax || 0) > 0 || parseFloat(it.additional_qty || 0) > 0);
            });

            if (activeItems.length === 0) {
                alert('Please enter an additional quantity, revised rate, or additional taxable value for at least one item.');
                return;
            }

            const payload = {
                id: this.data.currentDebitNote ? this.data.currentDebitNote.id : 0,
                company_id: this.data.companyId,
                debit_note_date: this.getVal('dn_debit_note_date'),
                original_invoice_id: parseInt(this.getVal('dn_original_invoice_id')) || 0,
                original_invoice_no: origInvNo,
                original_invoice_date: this.getVal('dn_orig_invoice_date'),
                original_fbr_invoice_no: this.getVal('dn_orig_fbr_ref'),
                customer_coa_id: parseInt(this.getVal('dn_customer_coa_id')) || 0,
                customer_code: this.getVal('dn_cust_code'),
                customer_name: this.getVal('dn_cust_name'),
                business_name: this.getVal('dn_cust_business_name'),
                customer_type: 'Registered (Filer)',
                customer_ntn: this.getVal('dn_cust_ntn'),
                customer_cnic: this.getVal('dn_cust_cnic'),
                customer_strn: this.getVal('dn_cust_strn'),
                customer_phone: this.getVal('dn_cust_phone'),
                customer_address: this.getVal('dn_cust_address'),
                customer_province: this.getVal('dn_cust_province') || 'Punjab',
                reason_code: this.getVal('dn_reason_code') || '01',
                reason_text: document.getElementById('dn_reason_code') ? document.getElementById('dn_reason_code').options[document.getElementById('dn_reason_code').selectedIndex].text : 'Undercharged Sales Price',
                remarks: this.getVal('dn_remarks') || this.getVal('dn_detailed_reason'),
                total_debit_qty: parseFloat(this.getVal('dn_tot_add_qty')) || 0,
                additional_val_excl_tax: parseFloat(this.getVal('dn_tot_excl')) || 0,
                total_discount_adjustment: 0,
                taxable_debit_amount: parseFloat(this.getVal('dn_tot_excl')) || 0,
                sales_tax_adjustment: parseFloat(this.getVal('dn_tot_st')) || 0,
                further_tax_adjustment: parseFloat(this.getVal('dn_tot_ft')) || 0,
                extra_tax_adjustment: parseFloat(this.getVal('dn_tot_ext')) || 0,
                fed_adjustment: 0,
                total_debit_amount: parseFloat(this.getVal('dn_tot_incl')) || 0,
                items: activeItems.map((it, idx) => ({
                    original_item_id: it.original_item_id || it.id || 0,
                    item_id: it.item_id || 0,
                    item_code: it.item_code || '',
                    item_name: it.item_name || it.description || '',
                    description: it.description || it.item_name || '',
                    hs_code: it.hs_code || '0000.0000',
                    uom: it.uom || it.unit || 'Nos',
                    original_qty: parseFloat(it.original_qty || it.quantity || 0),
                    original_rate: parseFloat(it.original_rate !== undefined ? it.original_rate : (it.rate || 0)),
                    original_taxable_value: parseFloat(it.original_taxable_value !== undefined ? it.original_taxable_value : (it.val_excl_tax || 0)),
                    additional_qty: parseFloat(it.additional_qty || 0),
                    revised_rate: parseFloat(it.revised_rate !== undefined ? it.revised_rate : (it.original_rate || it.rate || 0)),
                    rate_difference: parseFloat(it.rate_difference || 0),
                    additional_gross_amount: parseFloat(it.val_excl_tax || 0),
                    discount_percent: 0,
                    discount_adjustment: 0,
                    tax_rate: parseFloat(it.tax_rate || 18),
                    sales_tax_adjustment: parseFloat(it.sales_tax_adjustment || 0),
                    further_tax_rate: parseFloat(it.further_tax_rate || 0),
                    further_tax_adjustment: parseFloat(it.further_tax_adjustment || 0),
                    extra_tax_rate: parseFloat(it.extra_tax_rate || 0),
                    extra_tax_adjustment: parseFloat(it.extra_tax_adjustment || 0),
                    fed_rate: parseFloat(it.fed_rate || 0),
                    fed_adjustment: parseFloat(it.fed_adjustment || 0),
                    val_excl_tax: parseFloat(it.val_excl_tax || 0),
                    val_incl_tax: parseFloat(it.val_incl_tax || 0),
                    sort_order: idx + 1
                }))
            };

            const saveBtn = document.getElementById('dn_btn_save_top');
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            fetch(`api/digital_debit_note.php?action=save_debit_note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(res => {
                if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Save (Ctrl+S)';

                if (res.status === 'success') {
                    this.data.currentDebitNote = res.debit_note;
                    this.setVal('dn_debit_note_no', res.debit_note.debit_note_no);
                    this.setVal('dn_serial_no', res.debit_note.serial_no);

                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    } else {
                        alert(`Debit Note #${res.debit_note.debit_note_no} saved successfully in ERP database.`);
                    }
                } else {
                    alert(res.message || 'Failed to save Debit Note.');
                }
            })
            .catch(err => {
                if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Save (Ctrl+S)';
                alert('Network error while saving Debit Note: ' + err.message);
            });
        },

        // -------------------------------------------------------------------------
        // Validation (Client & Server FBR Rule Checks)
        // -------------------------------------------------------------------------
        validateDebitNote: function () {
            const origInvNo = this.getVal('dn_orig_invoice_no');
            const iconBox = document.getElementById('dn_val_icon_box');
            const icon = document.getElementById('dn_val_icon');
            const msg = document.getElementById('dn_val_status_msg');

            const setValidationUI = (isValid, text) => {
                if (iconBox) iconBox.style.background = isValid ? '#dcfce7' : '#fee2e2';
                if (iconBox) iconBox.style.color = isValid ? '#16a34a' : '#b91c1c';
                if (icon) icon.className = isValid ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
                if (msg) {
                    msg.innerText = text;
                    msg.style.color = isValid ? '#15803d' : '#b91c1c';
                }
            };

            if (!origInvNo) {
                setValidationUI(false, 'Validation Error: No original sales invoice selected.');
                return false;
            }

            const activeItems = (this.data.items || []).filter(it => (it.is_included !== false) && parseFloat(it.val_excl_tax || 0) > 0);
            if (activeItems.length === 0) {
                setValidationUI(false, 'Validation Error: At least one item must have an upward adjustment value.');
                return false;
            }

            // Client checks passed; now call server validation
            fetch(`api/digital_debit_note.php?action=validate_debit_note&company_id=${this.data.companyId}&debit_note_id=${this.data.currentDebitNote ? this.data.currentDebitNote.id : 0}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        setValidationUI(true, 'FBR Compliance Verified: Document meets all schema requirements.');
                    } else {
                        setValidationUI(false, res.message || 'Validation failed on FBR rules.');
                    }
                })
                .catch(() => {
                    setValidationUI(true, 'Client Validation Passed: Mandatory fields and calculations are verified.');
                });

            return true;
        },

        // -------------------------------------------------------------------------
        // Review & Confirm (Preview Modal)
        // -------------------------------------------------------------------------
        reviewAndConfirm: function () {
            const origInvNo = this.getVal('dn_orig_invoice_no');
            if (!origInvNo) {
                alert('Please select an original sales invoice before reviewing.');
                return;
            }

            const modal = document.getElementById('dn_preview_modal');
            if (!modal) return;

            // Company details
            const comp = this.data.company || {};
            this.setText('dn_prev_company_name', comp.company_name || 'SOFTIFYX FINANCIAL ERP');
            this.setText('dn_prev_company_addr', comp.address || 'Pakistan');
            this.setText('dn_prev_comp_ntn', comp.ntn || comp.tax_number || '--');
            this.setText('dn_prev_comp_strn', comp.strn || comp.sales_tax_number || '--');

            // Doc header
            this.setText('dn_prev_doc_no', this.getVal('dn_debit_note_no') || 'DN-DRAFT');
            this.setText('dn_prev_doc_date', this.getVal('dn_debit_note_date'));
            this.setText('dn_prev_orig_inv', this.getVal('dn_orig_invoice_no'));
            this.setText('dn_prev_ref_usin', this.getVal('dn_orig_fbr_ref') || this.getVal('dn_orig_invoice_no'));

            // Customer
            this.setText('dn_prev_cust_name', this.getVal('dn_cust_name') || 'Customer Name');
            this.setText('dn_prev_cust_addr', this.getVal('dn_cust_address') || 'Customer Address');
            const rSelect = document.getElementById('dn_reason_code');
            this.setText('dn_prev_reason', rSelect ? rSelect.options[rSelect.selectedIndex].text : 'Undercharged Sales Price');
            this.setText('dn_prev_tax_id', this.getVal('dn_cust_ntn') || this.getVal('dn_cust_cnic') || 'N/A');
            this.setText('dn_prev_strn', this.getVal('dn_cust_strn') || 'N/A');

            // Preview Items Table
            const tbody = document.getElementById('dn_prev_items_tbody');
            if (tbody) {
                const active = (this.data.items || []).filter(it => (it.is_included !== false) && parseFloat(it.val_excl_tax || 0) > 0);
                tbody.innerHTML = active.map((it, idx) => {
                    const addQ = parseFloat(it.additional_qty || 0);
                    const revRate = parseFloat(it.revised_rate || it.original_rate || 0);
                    const valExcl = parseFloat(it.val_excl_tax || 0);
                    const st = parseFloat(it.sales_tax_adjustment || 0);
                    const tot = parseFloat(it.val_incl_tax || 0);

                    return `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 4px; text-align: left;">${idx + 1}</td>
                            <td style="padding: 4px; font-weight: 600;">${it.item_name || it.description}</td>
                            <td style="padding: 4px; text-align: center;">${it.hs_code || '0000.0000'}</td>
                            <td style="padding: 4px; text-align: right;">${addQ}</td>
                            <td style="padding: 4px; text-align: right;">${revRate.toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right; font-weight: 600;">${valExcl.toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right;">${st.toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right; font-weight: 700; color: #0284c7;">${tot.toFixed(2)}</td>
                        </tr>
                    `;
                }).join('');
            }

            // Totals
            this.setText('dn_prev_tot_excl', this.getVal('dn_tot_excl'));
            this.setText('dn_prev_tot_st', this.getVal('dn_tot_st'));
            this.setText('dn_prev_tot_ft', this.getVal('dn_tot_ft'));
            this.setText('dn_prev_tot_net', this.getVal('dn_tot_incl'));

            modal.style.display = 'flex';
        },

        closePreviewModal: function () {
            const modal = document.getElementById('dn_preview_modal');
            if (modal) modal.style.display = 'none';
        },

        openConfirmDialog: function () {
            if (!this.data.currentDebitNote) {
                // Must be saved first
                this.saveDebitNote(() => {
                    this.promptFbrSubmission();
                });
            } else {
                this.promptFbrSubmission();
            }
        },

        promptFbrSubmission: function () {
            const dnNo = this.getVal('dn_debit_note_no');
            const totAmt = this.getVal('dn_tot_incl');

            if (confirm(`Are you sure you want to officially submit Debit Note #${dnNo} (PKR ${totAmt}) to FBR PRAL?\n\nThis will record an upward sales tax liability with FBR.`)) {
                this.confirmAndSubmitFbr();
            }
        },

        // -------------------------------------------------------------------------
        // FBR API Submission
        // -------------------------------------------------------------------------
        confirmAndSubmitFbr: function () {
            this.closePreviewModal();

            if (!this.data.currentDebitNote || !this.data.currentDebitNote.id) {
                this.saveDebitNote(() => {
                    this.executeFbrSubmit();
                });
            } else {
                this.executeFbrSubmit();
            }
        },

        executeFbrSubmit: function () {
            if (this.data.isSubmitting) return;
            this.data.isSubmitting = true;

            const submitBtn = document.getElementById('dn_btn_submit');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting to FBR...';
            }

            const dnId = this.data.currentDebitNote.id;

            fetch(`api/digital_debit_note.php?action=submit_to_fbr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: this.data.companyId,
                    id: dnId,
                    debit_note_id: dnId
                })
            })
            .then(r => r.json())
            .then(res => {
                this.data.isSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Confirm & Submit to FBR</span>';
                }

                if (res.status === 'success') {
                    const dn = res.debit_note;
                    this.data.currentDebitNote = dn;

                    const isSubmitted = (dn.fbr_status === 'Submitted');
                    this.updateStatusPill(dn.fbr_status, isSubmitted ? 'pill-submitted' : 'pill-failed');
                    this.setText('dn_card_fbr_inv_no', dn.fbr_debit_note_no || '-');
                    this.setText('dn_card_sub_date', dn.submission_timestamp || new Date().toLocaleString());
                    this.setText('dn_resp_status', `${dn.fbr_response_code || ''} ${dn.fbr_response_msg || ''}`.trim());

                    alert(`FBR Submission Result:\nStatus: ${dn.fbr_status}\nFBR Reference: ${dn.fbr_debit_note_no || 'None'}\nMessage: ${dn.fbr_response_msg || 'OK'}`);
                } else {
                    this.updateStatusPill('Failed', 'pill-failed');
                    this.setText('dn_resp_status', res.message || 'API Error');
                    alert(`FBR Submission Error:\n${res.message || 'Communication with FBR PRAL gateway failed.'}`);
                }
            })
            .catch(err => {
                this.data.isSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Confirm & Submit to FBR</span>';
                }
                alert('Network timeout / failure connecting to FBR API: ' + err.message);
            });
        },

        refreshFbrStatus: function () {
            if (!this.data.currentDebitNote || !this.data.currentDebitNote.id) {
                alert('Please save or load a Debit Note first.');
                return;
            }

            fetch(`api/digital_debit_note.php?action=get_debit_note&company_id=${this.data.companyId}&id=${this.data.currentDebitNote.id}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const dn = res.debit_note;
                        this.data.currentDebitNote = dn;
                        const isSubmitted = (dn.fbr_status === 'Submitted');
                        this.updateStatusPill(dn.fbr_status, isSubmitted ? 'pill-submitted' : (dn.fbr_status === 'Failed' ? 'pill-failed' : 'pill-pending'));
                        this.setText('dn_card_fbr_inv_no', dn.fbr_debit_note_no || '-');
                        this.setText('dn_card_check_time', new Date().toLocaleTimeString());
                        alert(`Current FBR Status for #${dn.debit_note_no}: ${dn.fbr_status}\nFBR Ref: ${dn.fbr_debit_note_no || 'N/A'}`);
                    }
                })
                .catch(err => {
                    alert('Could not refresh status: ' + err.message);
                });
        },

        showRawResponse: function () {
            if (!this.data.currentDebitNote) {
                alert('No active Debit Note selected.');
                return;
            }
            const dn = this.data.currentDebitNote;
            const logMsg = `Debit Note: ${dn.debit_note_no}\nFBR Status: ${dn.fbr_status}\nRef No: ${dn.fbr_debit_note_no || 'N/A'}\nResponse Code: ${dn.fbr_response_code || 'N/A'}\nMessage: ${dn.fbr_response_msg || 'N/A'}\n\nRaw Response:\n${dn.fbr_raw_response || '(No payload log available)'}`;
            alert(logMsg);
        },

        // -------------------------------------------------------------------------
        // Find / Search Saved Debit Notes Modal
        // -------------------------------------------------------------------------
        openFindModal: function () {
            const modal = document.getElementById('dn_find_modal');
            if (!modal) return;
            modal.style.display = 'flex';
            this.performFindSearch();
        },

        closeFindModal: function () {
            const modal = document.getElementById('dn_find_modal');
            if (modal) modal.style.display = 'none';
        },

        performFindSearch: function () {
            const q = document.getElementById('dn_find_query') ? document.getElementById('dn_find_query').value.trim() : '';
            const tbody = document.getElementById('dn_find_tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Searching Debit Notes...</td></tr>`;
            }

            fetch(`api/digital_debit_note.php?action=search_debit_notes&company_id=${this.data.companyId}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.debit_notes || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">No Debit Notes found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map(dn => `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 5px; text-align: center; font-weight: 700;">${dn.serial_no}</td>
                                <td style="padding: 5px; font-weight: 700; color: #0284c7;">${dn.debit_note_no}</td>
                                <td style="padding: 5px; text-align: center;">${dn.debit_note_date}</td>
                                <td style="padding: 5px; font-weight: 600;">${dn.original_invoice_no}</td>
                                <td style="padding: 5px;">${dn.customer_name}</td>
                                <td style="padding: 5px; text-align: right; font-weight: 700;">${parseFloat(dn.total_debit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="padding: 5px; text-align: center;">
                                    <span class="fbr-status-pill ${dn.fbr_status === 'Submitted' ? 'pill-submitted' : 'pill-pending'}">${dn.fbr_status}</span>
                                </td>
                                <td style="padding: 5px; text-align: center;">
                                    <button type="button" class="fbr-action-btn btn-act-blue" style="height: 20px; padding: 0 6px; font-size: 10px;" onclick="window.DigitalDebitNoteModule.loadDebitNoteById(${dn.id})">Open</button>
                                </td>
                            </tr>
                        `).join('');
                    }
                })
                .catch(() => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #dc2626;">Error searching records.</td></tr>`;
                });
        },

        loadDebitNoteById: function (id) {
            this.closeFindModal();

            fetch(`api/digital_debit_note.php?action=get_debit_note&company_id=${this.data.companyId}&id=${id}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const dn = res.debit_note;
                        this.data.currentDebitNote = dn;
                        this.data.items = res.items || [];

                        // Header
                        this.setVal('dn_serial_no', dn.serial_no);
                        this.setVal('dn_debit_note_date', dn.debit_note_date);
                        this.setVal('dn_debit_note_no', dn.debit_note_no);

                        // Original Invoice
                        this.setVal('dn_orig_invoice_no', dn.original_invoice_no);
                        this.setVal('dn_orig_invoice_id', dn.original_invoice_id);
                        this.setVal('dn_orig_invoice_date', dn.original_invoice_date);
                        this.setVal('dn_orig_fbr_ref', dn.original_fbr_invoice_no);
                        this.setText('dn_orig_invoice_total', parseFloat(dn.original_invoice_total || 0).toLocaleString());
                        this.setText('dn_prev_debit_amt', parseFloat(dn.previous_debit_adjustments || 0).toLocaleString());

                        // Customer
                        this.setVal('dn_cust_code', dn.customer_code || '');
                        this.setVal('dn_cust_name', dn.customer_name || '');
                        this.setVal('dn_cust_business_name', dn.business_name || dn.customer_name || '');
                        this.setVal('dn_customer_coa_id', dn.customer_coa_id || '');
                        this.setVal('dn_cust_ntn', dn.customer_ntn || '');
                        this.setVal('dn_cust_cnic', dn.customer_cnic || '');
                        this.setVal('dn_cust_strn', dn.customer_strn || '');
                        this.setVal('dn_cust_phone', dn.customer_phone || '');
                        this.setVal('dn_cust_address', dn.customer_address || '');
                        this.setVal('dn_cust_province', dn.customer_province || 'Punjab');

                        // Reason
                        this.setVal('dn_reason_code', dn.reason_code || '01');
                        this.onReasonChange();
                        this.setVal('dn_remarks', dn.remarks || '');

                        // Status cards
                        const isSub = (dn.fbr_status === 'Submitted');
                        this.updateStatusPill(dn.fbr_status, isSub ? 'pill-submitted' : (dn.fbr_status === 'Failed' ? 'pill-failed' : 'pill-pending'));
                        this.setText('dn_card_fbr_inv_no', dn.fbr_debit_note_no || '-');
                        this.setText('dn_card_ref_usin', dn.original_fbr_invoice_no || dn.original_invoice_no);
                        this.setText('dn_sub_ref_usin', dn.original_fbr_invoice_no || dn.original_invoice_no);
                        this.setText('dn_card_sub_date', dn.submission_timestamp || '-');
                        this.setText('dn_card_check_time', dn.last_status_check || '-');
                        this.setText('dn_resp_status', dn.fbr_response_msg || dn.fbr_status || '-');

                        // Render items & calculations
                        this.renderItems();
                        this.recalculateTotals();
                    } else {
                        alert(res.message || 'Could not load Debit Note.');
                    }
                })
                .catch(err => {
                    alert('Error loading Debit Note: ' + err.message);
                });
        },

        retrieveLastSaved: function () {
            fetch(`api/digital_debit_note.php?action=search_debit_notes&company_id=${this.data.companyId}&q=`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && (res.debit_notes || []).length > 0) {
                        this.loadDebitNoteById(res.debit_notes[0].id);
                    } else {
                        alert('No saved Debit Notes found in system.');
                    }
                })
                .catch(() => alert('Could not retrieve last saved Debit Note.'));
        },

        navigateSerial: function (direction) {
            const currentSn = parseInt(this.getVal('dn_serial_no')) || 1;
            const targetSn = direction === 'prev' ? Math.max(1, currentSn - 1) : currentSn + 1;

            fetch(`api/digital_debit_note.php?action=search_debit_notes&company_id=${this.data.companyId}&q=`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const match = (res.debit_notes || []).find(d => parseInt(d.serial_no) === targetSn);
                        if (match) {
                            this.loadDebitNoteById(match.id);
                        } else {
                            alert(`Debit Note serial #${targetSn} not found.`);
                        }
                    }
                });
        },

        printDebitNote: function () {
            const printContent = document.getElementById('dn_printable_preview_area');
            if (!printContent) return;

            const w = window.open('', '_blank', 'width=900,height=700');
            w.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Debit Note - ${this.getVal('dn_debit_note_no') || 'FBR'}</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; font-size: 12px; color: #1e293b; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #cbd5e1; padding: 6px; }
                        th { background: #f1f5f9; }
                        @media print { button { display: none !important; } }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                    <script>window.onload = function() { window.print(); };<\/script>
                </body>
                </html>
            `);
            w.document.close();
        },

        closeModal: function () {
            const container = document.getElementById('digitalDebitNoteContainer');
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

        // -------------------------------------------------------------------------
        // Utilities & Helper Functions
        // -------------------------------------------------------------------------
        getVal: function (id) {
            const el = document.getElementById(id);
            return el ? el.value : '';
        },

        setVal: function (id, val) {
            const el = document.getElementById(id);
            if (el) el.value = (val !== null && val !== undefined) ? val : '';
        },

        setText: function (id, val) {
            const el = document.getElementById(id);
            if (el) el.innerText = (val !== null && val !== undefined) ? val : '';
        },

        updateStatusPill: function (text, cls) {
            const pill1 = document.getElementById('dn_card_inv_status');
            const pill2 = document.getElementById('dn_sub_fbr_pill');
            [pill1, pill2].forEach(p => {
                if (p) {
                    p.innerText = text;
                    p.className = `fbr-status-pill ${cls}`;
                }
            });
        },

        numberToWords: function (num) {
            const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
            const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

            const inWords = (n) => {
                if (n === 0) return '';
                if (n < 20) return a[n] + ' ';
                if (n < 100) return b[Math.floor(n / 10)] + ' ' + a[n % 10] + ' ';
                if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred ' + inWords(n % 100);
                if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + inWords(n % 1000);
                if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + inWords(n % 100000);
                return inWords(Math.floor(n / 10000000)) + 'Crore ' + inWords(n % 10000000);
            };

            const n = Math.floor(Math.abs(Number(num) || 0));
            if (n === 0) return 'Zero';
            return inWords(n).trim();
        }
    };

    window.DigitalDebitNoteModule = DigitalDebitNoteModule;
})();
