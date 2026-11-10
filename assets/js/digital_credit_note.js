/**
 * SoftifyX ERP - FBR Digital Credit Note Module
 * Handles UI events, live calculations, invoice eligibility, bounds validation, and FBR PRAL submissions.
 */

(function () {
    const DigitalCreditNoteModule = {
        data: {
            companyId: 1,
            company: {},
            settings: {},
            currentCreditNote: null,
            originalInvoice: null,
            items: [],
            reasons: [],
            nextSerial: 1,
            isSubmitting: false
        },

        init: function () {
            const container = document.getElementById('digitalCreditNoteContainer');
            if (!container) return;

            // Load meta settings & next serial
            this.loadMeta(() => {
                this.newCreditNote();
            });

            // Bind Ctrl+S shortcut
            container.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault();
                    this.saveCreditNote();
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
            fetch(`api/digital_credit_note.php?action=get_meta&company_id=${this.data.companyId}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        this.data.company = res.company || {};
                        this.data.settings = res.settings || {};
                        this.data.reasons = res.reasons || [];
                        this.data.nextSerial = res.next_serial || 1;

                        // Environment badge
                        const envBadge = document.getElementById('cn_top_env_badge');
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
                    console.error('Error loading Credit Note meta:', err);
                });
        },

        newCreditNote: function () {
            this.data.currentCreditNote = null;
            this.data.originalInvoice = null;
            this.data.items = [];

            // Reset header inputs
            const snInput = document.getElementById('cn_serial_no');
            if (snInput) snInput.value = this.data.nextSerial;

            const dateInput = document.getElementById('cn_credit_note_date');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

            const cnNoInput = document.getElementById('cn_credit_note_no');
            if (cnNoInput) cnNoInput.value = `CN-${new Date().getFullYear()}-${String(this.data.nextSerial).padStart(4, '0')}`;

            // Reset original invoice fields
            this.setVal('cn_orig_invoice_no', '');
            this.setVal('cn_orig_invoice_id', '');
            this.setVal('cn_orig_invoice_date', '');
            this.setVal('cn_orig_fbr_ref', '');
            this.setText('cn_orig_invoice_total', '0.00');
            this.setText('cn_remaining_eligible_amt', '0.00');

            // Reset customer fields
            this.setVal('cn_cust_code', '');
            this.setVal('cn_cust_name', '');
            this.setVal('cn_cust_business_name', '');
            this.setVal('cn_customer_coa_id', '');
            this.setVal('cn_cust_ntn', '');
            this.setVal('cn_cust_cnic', '');
            this.setVal('cn_cust_strn', '');
            this.setVal('cn_cust_phone', '');
            this.setVal('cn_cust_address', '');
            this.setVal('cn_cust_province', 'Punjab');

            // Reset reason
            const rSelect = document.getElementById('cn_reason_code');
            if (rSelect) rSelect.value = '01';
            this.setVal('cn_detailed_reason', '');
            this.setVal('cn_remarks', '');

            // Reset status pills
            this.updateStatusPill('Pending FBR', 'pill-pending');
            this.setText('cn_card_fbr_inv_no', '-');
            this.setText('cn_card_ref_usin', '-');
            this.setText('cn_card_sub_date', '-');
            this.setText('cn_card_check_time', '-');
            this.setText('cn_sub_ref_usin', '-');
            this.setText('cn_resp_status', '-');

            // Reset grid
            const tbody = document.getElementById('cn_items_tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="18" style="text-align: center; padding: 25px; color: #64748b; font-style: italic;">
                            Please select an original sales invoice using the <b>Select Sales Invoice</b> button above to load items.
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
            const modal = document.getElementById('cn_invoice_picker_modal');
            if (!modal) return;
            modal.style.display = 'flex';
            this.searchPickerInvoices('');
        },

        closeInvoicePicker: function () {
            const modal = document.getElementById('cn_invoice_picker_modal');
            if (modal) modal.style.display = 'none';
        },

        searchPickerInvoices: function () {
            const qInput = document.getElementById('cn_picker_search_input');
            const q = qInput ? encodeURIComponent(qInput.value.trim()) : '';
            const tbody = document.getElementById('cn_picker_tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Searching eligible invoices...</td></tr>`;
            }

            fetch(`api/digital_credit_note.php?action=search_invoices&company_id=${this.data.companyId}&q=${q}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.invoices || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">No eligible sales invoices found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map(inv => {
                            const isEligible = inv.is_eligible;
                            const remAmt = parseFloat(inv.remaining_eligible_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            const origAmt = parseFloat(inv.original_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            const prevAmt = parseFloat(inv.previously_credited_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                            return `
                                <tr style="border-bottom: 1px solid #e2e8f0; opacity: ${isEligible ? '1' : '0.55'};">
                                    <td style="padding: 6px; font-weight: 700; color: #1e3a8a;">${inv.invoice_no}</td>
                                    <td style="padding: 6px; text-align: center;">${inv.invoice_date}</td>
                                    <td style="padding: 6px;">
                                        <div style="font-weight: 600; color: #0f172a;">${inv.customer_name}</div>
                                        <div style="font-size: 10px; color: #64748b;">NTN: ${inv.customer_ntn || 'N/A'} &bull; Type: ${inv.customer_type}</div>
                                    </td>
                                    <td style="padding: 6px; text-align: right; font-weight: 600;">${origAmt}</td>
                                    <td style="padding: 6px; text-align: right; color: #b91c1c;">${prevAmt}</td>
                                    <td style="padding: 6px; text-align: right; font-weight: 800; color: #16a34a;">${remAmt}</td>
                                    <td style="padding: 6px; text-align: center;">
                                        <span class="fbr-status-pill ${inv.fbr_status === 'Submitted' ? 'pill-submitted' : 'pill-pending'}">${inv.fbr_status || 'Draft'}</span>
                                    </td>
                                    <td style="padding: 6px; text-align: center;">
                                        ${isEligible 
                                            ? `<button type="button" class="fbr-action-btn btn-act-blue" style="height: 22px; padding: 0 8px; font-size: 10px;" onclick="window.DigitalCreditNoteModule.selectInvoice('${inv.invoice_no}')">Select</button>` 
                                            : `<span style="font-size: 10px; color: #94a3b8; font-style: italic;">Credited</span>`
                                        }
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                })
                .catch(err => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #dc2626;">Failed to load invoices.</td></tr>`;
                });
        },

        selectInvoice: function (invoiceNo) {
            if (!invoiceNo) return;
            this.closeInvoicePicker();

            fetch(`api/digital_credit_note.php?action=get_invoice_details&company_id=${this.data.companyId}&invoice_no=${encodeURIComponent(invoiceNo)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const inv = res.invoice;
                        this.data.originalInvoice = inv;
                        this.data.items = res.items || [];

                        // Populate Header Info
                        this.setVal('cn_orig_invoice_no', inv.invoice_no);
                        this.setVal('cn_orig_invoice_id', inv.id);
                        this.setVal('cn_orig_invoice_date', inv.invoice_date);
                        this.setVal('cn_orig_fbr_ref', inv.fbr_invoice_no || inv.invoice_no);

                        const origTot = parseFloat(inv.net_payable || 0);
                        const remTot = parseFloat(inv.remaining_eligible_amount || 0);
                        this.setText('cn_orig_invoice_total', origTot.toLocaleString(undefined, { minimumFractionDigits: 2 }));
                        this.setText('cn_remaining_eligible_amt', remTot.toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Populate Customer Info
                        this.setVal('cn_cust_code', inv.customer_code || '');
                        this.setVal('cn_cust_name', inv.customer_name || '');
                        this.setVal('cn_cust_business_name', inv.business_name || inv.customer_name || '');
                        this.setVal('cn_customer_coa_id', inv.customer_coa_id || '');
                        this.setVal('cn_cust_ntn', inv.customer_ntn || '');
                        this.setVal('cn_cust_cnic', inv.customer_cnic || '');
                        this.setVal('cn_cust_strn', inv.customer_strn || '');
                        this.setVal('cn_cust_phone', inv.customer_phone || '');
                        this.setVal('cn_cust_address', inv.customer_address || '');
                        this.setVal('cn_cust_province', inv.customer_province || 'Punjab');

                        // Update Status Card
                        this.setText('cn_card_ref_usin', inv.fbr_invoice_no || inv.invoice_no);
                        this.setText('cn_sub_ref_usin', inv.fbr_invoice_no || inv.invoice_no);

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
            const suggestBox = document.getElementById('cn_invoice_suggest_box');
            if (!suggestBox) return;

            const q = (val || '').trim();
            if (q.length < 2) {
                suggestBox.style.display = 'none';
                return;
            }

            fetch(`api/digital_credit_note.php?action=search_invoices&company_id=${this.data.companyId}&q=${encodeURIComponent(q)}`)
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
                            <div class="fbr-suggest-item" onmousedown="window.DigitalCreditNoteModule.selectInvoice('${inv.invoice_no}')">
                                <div>
                                    <b>${inv.invoice_no}</b> - ${inv.customer_name}
                                </div>
                                <div style="font-size: 10px; color: #16a34a; font-weight: 700;">
                                    Eligible: ${parseFloat(inv.remaining_eligible_amount || 0).toLocaleString()}
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
            const tbody = document.getElementById('cn_items_tbody');
            if (!tbody) return;

            if (this.data.items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="18" style="text-align: center; padding: 20px; color: #64748b;">No items found in selected invoice.</td></tr>`;
                return;
            }

            tbody.innerHTML = this.data.items.map((it, idx) => {
                const origQ = parseFloat(it.original_qty || it.quantity || 0);
                const prevQ = parseFloat(it.prev_credited_qty || 0);
                const remQ = parseFloat(it.remaining_qty !== undefined ? it.remaining_qty : origQ);
                const creditQ = parseFloat(it.credit_qty !== undefined ? it.credit_qty : remQ);
                const rate = parseFloat(it.rate || 0);
                const taxRate = parseFloat(it.tax_rate || 18);
                const furRate = parseFloat(it.further_tax_rate || 0);
                const extRate = parseFloat(it.extra_tax_rate || 0);
                const fedRate = parseFloat(it.fed_rate || 0);

                const creditGross = creditQ * rate;
                const discPct = parseFloat(it.discount_percent || 0);
                const discAmt = creditGross * (discPct / 100);
                const valExcl = creditGross - discAmt;
                const stAmt = valExcl * (taxRate / 100);
                const furAmt = valExcl * (furRate / 100);
                const extAmt = valExcl * (extRate / 100);
                const fedAmt = valExcl * (fedRate / 100);
                const valIncl = valExcl + stAmt + furAmt + extAmt + fedAmt;

                const isEligible = remQ > 0;

                return `
                    <tr style="border-bottom: 1px solid #cbd5e1; ${!isEligible ? 'opacity: 0.5;' : ''}">
                        <td style="text-align: center; color: #64748b; font-size: 10px;">${idx + 1}</td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.item_code || ''}"></td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.hs_code || '0000.0000'}"></td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.item_name || it.description || ''}" title="${it.item_name || ''}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${origQ}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly style="color: #b91c1c;" value="${prevQ}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly style="font-weight: 700; color: #16a34a;" value="${remQ}"></td>
                        <td style="background: #eff6ff;">
                            <input type="number" step="any" min="0" max="${remQ}" class="fbr-tbl-input num" 
                                style="font-weight: 800; color: #1e3a8a; border: 1px solid #93c5fd;" 
                                value="${creditQ}" 
                                ${!isEligible ? 'disabled' : ''}
                                oninput="window.DigitalCreditNoteModule.onCreditQtyChange(${idx}, this.value)"
                                onclick="this.select()" onfocus="this.select()">
                        </td>
                        <td><input type="text" class="fbr-tbl-input" style="text-align: center;" readonly value="${it.uom || 'Each'}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${rate.toFixed(2)}"></td>
                        <td><input type="text" id="cn_item_excl_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${valExcl.toFixed(2)}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${taxRate}%"></td>
                        <td><input type="text" id="cn_item_st_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${stAmt.toFixed(2)}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${furRate}%"></td>
                        <td><input type="text" id="cn_item_fur_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${furAmt.toFixed(2)}"></td>
                        <td><input type="text" id="cn_item_ext_${idx}" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${(extAmt + fedAmt).toFixed(2)}"></td>
                        <td><input type="text" id="cn_item_tot_${idx}" class="fbr-tbl-input num" style="font-weight: 700; color: #1e3a8a; background: #fefce8;" readonly value="${valIncl.toFixed(2)}"></td>
                        <td style="text-align: center;">
                            <input type="checkbox" id="cn_item_chk_${idx}" ${creditQ > 0 ? 'checked' : ''} ${!isEligible ? 'disabled' : ''} 
                                onchange="window.DigitalCreditNoteModule.onItemToggle(${idx}, this.checked)" style="cursor: pointer;">
                        </td>
                    </tr>
                `;
            }).join('');
        },

        onCreditQtyChange: function (idx, val) {
            const it = this.data.items[idx];
            if (!it) return;

            let cQty = parseFloat(val) || 0;
            const remQ = parseFloat(it.remaining_qty || 0);

            // Bounds Validation: Credit Qty cannot exceed Remaining Eligible Qty
            if (cQty > remQ && remQ > 0) {
                alert(`Warning: Credit quantity (${cQty}) exceeds remaining eligible quantity (${remQ}). Capping at ${remQ}.`);
                cQty = remQ;
                const inputEl = document.querySelector(`#cn_items_tbody tr:nth-child(${idx + 1}) input[type="number"]`);
                if (inputEl) inputEl.value = remQ;
            } else if (cQty < 0) {
                cQty = 0;
            }

            it.credit_qty = cQty;

            // Auto-check/uncheck
            const chk = document.getElementById(`cn_item_chk_${idx}`);
            if (chk) chk.checked = (cQty > 0);

            this.updateRowMath(idx);
            this.recalculateTotals();
        },

        onItemToggle: function (idx, isChecked) {
            const it = this.data.items[idx];
            if (!it) return;

            if (!isChecked) {
                it.credit_qty = 0;
            } else {
                it.credit_qty = parseFloat(it.remaining_qty || 0);
            }

            const inputEl = document.querySelector(`#cn_items_tbody tr:nth-child(${idx + 1}) input[type="number"]`);
            if (inputEl) inputEl.value = it.credit_qty;

            this.updateRowMath(idx);
            this.recalculateTotals();
        },

        updateRowMath: function (idx) {
            const it = this.data.items[idx];
            if (!it) return;

            const creditQ = parseFloat(it.credit_qty || 0);
            const rate = parseFloat(it.rate || 0);
            const taxRate = parseFloat(it.tax_rate || 18);
            const furRate = parseFloat(it.further_tax_rate || 0);
            const extRate = parseFloat(it.extra_tax_rate || 0);
            const fedRate = parseFloat(it.fed_rate || 0);
            const discPct = parseFloat(it.discount_percent || 0);

            const creditGross = creditQ * rate;
            const discAmt = creditGross * (discPct / 100);
            const valExcl = creditGross - discAmt;
            const stAmt = valExcl * (taxRate / 100);
            const furAmt = valExcl * (furRate / 100);
            const extAmt = valExcl * (extRate / 100);
            const fedAmt = valExcl * (fedRate / 100);
            const valIncl = valExcl + stAmt + furAmt + extAmt + fedAmt;

            it.val_excl_tax = valExcl;
            it.sales_tax_adjustment = stAmt;
            it.further_tax_adjustment = furAmt;
            it.extra_tax_adjustment = extAmt;
            it.fed_adjustment = fedAmt;
            it.val_incl_tax = valIncl;

            const elExcl = document.getElementById(`cn_item_excl_${idx}`);
            if (elExcl) elExcl.value = valExcl.toFixed(2);

            const elSt = document.getElementById(`cn_item_st_${idx}`);
            if (elSt) elSt.value = stAmt.toFixed(2);

            const elFur = document.getElementById(`cn_item_fur_${idx}`);
            if (elFur) elFur.value = furAmt.toFixed(2);

            const elExt = document.getElementById(`cn_item_ext_${idx}`);
            if (elExt) elExt.value = (extAmt + fedAmt).toFixed(2);

            const elTot = document.getElementById(`cn_item_tot_${idx}`);
            if (elTot) elTot.value = valIncl.toFixed(2);
        },

        recalculateTotals: function () {
            let totQty = 0;
            let totExcl = 0;
            let totSt = 0;
            let totFt = 0;
            let totExt = 0;
            let totNet = 0;

            this.data.items.forEach(it => {
                const q = parseFloat(it.credit_qty || 0);
                if (q > 0) {
                    totQty += q;
                    totExcl += parseFloat(it.val_excl_tax || 0);
                    totSt += parseFloat(it.sales_tax_adjustment || 0);
                    totFt += parseFloat(it.further_tax_adjustment || 0);
                    totExt += (parseFloat(it.extra_tax_adjustment || 0) + parseFloat(it.fed_adjustment || 0));
                    totNet += parseFloat(it.val_incl_tax || 0);
                }
            });

            // Update footer inputs
            this.setVal('cn_tot_credit_qty', totQty.toFixed(2));
            this.setVal('cn_tot_excl', totExcl.toFixed(2));
            this.setVal('cn_tot_st', totSt.toFixed(2));
            this.setVal('cn_tot_ft', totFt.toFixed(2));
            this.setVal('cn_tot_ext', totExt.toFixed(2));
            this.setVal('cn_tot_incl', totNet.toFixed(2));

            // Update Financial Totals panel
            this.setVal('cn_fin_excl', totExcl.toFixed(2));
            this.setVal('cn_fin_st', totSt.toFixed(2));
            this.setVal('cn_fin_ft', totFt.toFixed(2));
            this.setVal('cn_fin_total', totNet.toFixed(2));

            // Update words
            this.setText('cn_amount_in_words', this.numberToWords(Math.round(totNet)) + ' Rupees Only.');
        },

        onReasonChange: function () {
            const rSelect = document.getElementById('cn_reason_code');
            const reasonText = rSelect ? rSelect.options[rSelect.selectedIndex].text : '';
            this.setText('cn_sub_reason_display', reasonText.split('(')[0].trim());
        },

        // -------------------------------------------------------------------------
        // Save Credit Note (Database persistence without auto-FBR submission)
        // -------------------------------------------------------------------------
        saveCreditNote: function (onSuccess) {
            const origInvoiceNo = this.getVal('cn_orig_invoice_no');
            if (!origInvoiceNo) {
                alert('Please select an original sales invoice before saving the Credit Note.');
                this.openInvoicePicker();
                return;
            }

            const activeItems = this.data.items.filter(it => parseFloat(it.credit_qty || 0) > 0);
            if (activeItems.length === 0) {
                alert('Please enter a credit quantity greater than 0 for at least one line item.');
                return;
            }

            const rSelect = document.getElementById('cn_reason_code');
            const reasonCode = rSelect ? rSelect.value : '01';
            const reasonText = rSelect ? rSelect.options[rSelect.selectedIndex].text : 'Sales Return';

            const payload = {
                id: this.data.currentCreditNote ? this.data.currentCreditNote.id : 0,
                company_id: this.data.companyId,
                credit_note_date: this.getVal('cn_credit_note_date'),
                original_invoice_id: parseInt(this.getVal('cn_orig_invoice_id')) || 0,
                original_invoice_no: origInvoiceNo,
                original_invoice_date: this.getVal('cn_orig_invoice_date'),
                original_fbr_invoice_no: this.getVal('cn_orig_fbr_ref'),
                customer_coa_id: parseInt(this.getVal('cn_customer_coa_id')) || 0,
                customer_code: this.getVal('cn_cust_code'),
                customer_name: this.getVal('cn_cust_name'),
                business_name: this.getVal('cn_cust_business_name'),
                customer_type: 'Registered (Filer)',
                customer_ntn: this.getVal('cn_cust_ntn'),
                customer_cnic: this.getVal('cn_cust_cnic'),
                customer_strn: this.getVal('cn_cust_strn'),
                customer_phone: this.getVal('cn_cust_phone'),
                customer_address: this.getVal('cn_cust_address'),
                customer_province: this.getVal('cn_cust_province'),
                reason_code: reasonCode,
                reason_text: reasonText,
                remarks: this.getVal('cn_remarks'),
                total_credit_qty: parseFloat(this.getVal('cn_tot_credit_qty') || 0),
                credit_val_excl_tax: parseFloat(this.getVal('cn_fin_excl') || 0),
                total_discount_adjustment: 0,
                taxable_credit_amount: parseFloat(this.getVal('cn_fin_excl') || 0),
                sales_tax_adjustment: parseFloat(this.getVal('cn_fin_st') || 0),
                further_tax_adjustment: parseFloat(this.getVal('cn_fin_ft') || 0),
                extra_tax_adjustment: parseFloat(this.getVal('cn_tot_ext') || 0),
                fed_adjustment: 0,
                total_credit_amount: parseFloat(this.getVal('cn_fin_total') || 0),
                items: activeItems
            };

            const btnSave = document.getElementById('cn_btn_save_top');
            if (btnSave) btnSave.disabled = true;

            fetch('api/digital_credit_note.php?action=save_credit_note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(res => {
                if (btnSave) btnSave.disabled = false;
                if (res.status === 'success') {
                    this.data.currentCreditNote = res.credit_note;
                    this.setVal('cn_serial_no', res.credit_note.serial_no);
                    this.setVal('cn_credit_note_no', res.credit_note.credit_note_no);
                    this.updateStatusPill(res.credit_note.fbr_status || 'Draft', 'pill-pending');
                    alert('Credit Note successfully saved in ERP database.');
                    if (typeof onSuccess === 'function') onSuccess();
                } else {
                    alert('Save Failed: ' + (res.message || 'Unknown database error'));
                }
            })
            .catch(err => {
                if (btnSave) btnSave.disabled = false;
                alert('Connection error during save: ' + err.message);
            });
        },

        // -------------------------------------------------------------------------
        // Validate Credit Note
        // -------------------------------------------------------------------------
        validateCreditNote: function () {
            const origInvoiceNo = this.getVal('cn_orig_invoice_no');
            if (!origInvoiceNo) {
                this.updateValCard(false, 'Please select an original sales invoice first.');
                return;
            }

            const activeItems = this.data.items.filter(it => parseFloat(it.credit_qty || 0) > 0);
            if (activeItems.length === 0) {
                this.updateValCard(false, 'At least one item must have a credit quantity > 0.');
                return;
            }

            const payload = {
                id: this.data.currentCreditNote ? this.data.currentCreditNote.id : 0,
                original_invoice_no: origInvoiceNo,
                reason_code: this.getVal('cn_reason_code') || '01',
                customer_type: 'Registered (Filer)',
                customer_ntn: this.getVal('cn_cust_ntn'),
                customer_cnic: this.getVal('cn_cust_cnic'),
                items: activeItems
            };

            fetch('api/digital_credit_note.php?action=validate_credit_note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(res => {
                if (res.is_valid) {
                    this.updateValCard(true, 'Credit Note passed all FBR compliance checks and is Ready to Submit.');
                } else {
                    const msg = (res.errors && res.errors.length) ? res.errors[0].message : 'Validation failed.';
                    this.updateValCard(false, msg);
                }
            })
            .catch(err => {
                this.updateValCard(false, 'Validation failed to execute: ' + err.message);
            });
        },

        updateValCard: function (isValid, msg) {
            const iconBox = document.getElementById('cn_val_icon_box');
            const icon = document.getElementById('cn_val_icon');
            const msgEl = document.getElementById('cn_val_status_msg');

            if (msgEl) msgEl.innerText = msg;
            if (iconBox) {
                iconBox.style.background = isValid ? '#dcfce7' : '#fee2e2';
                iconBox.style.color = isValid ? '#16a34a' : '#b91c1c';
            }
            if (icon) {
                icon.className = isValid ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle';
            }
        },

        // -------------------------------------------------------------------------
        // Review & Confirm (Printable Modal)
        // -------------------------------------------------------------------------
        reviewAndConfirm: function () {
            const modal = document.getElementById('cn_preview_modal');
            if (!modal) return;

            // Ensure values are fresh
            this.recalculateTotals();

            // Populate Company
            this.setText('cn_prev_company_name', this.data.company.name || 'MY COMPANY');
            this.setText('cn_prev_company_addr', this.data.company.address || 'Company Address');
            this.setText('cn_prev_comp_ntn', this.data.company.ntn || '--');
            this.setText('cn_prev_comp_strn', this.data.company.gst || '--');

            // Populate Credit Note Header
            this.setText('cn_prev_doc_no', this.getVal('cn_credit_note_no') || 'Draft');
            this.setText('cn_prev_doc_date', this.getVal('cn_credit_note_date'));
            this.setText('cn_prev_orig_inv', this.getVal('cn_orig_invoice_no') || '--');
            this.setText('cn_prev_ref_usin', this.getVal('cn_orig_fbr_ref') || '--');

            // Populate Customer
            this.setText('cn_prev_cust_name', this.getVal('cn_cust_name') || 'Customer');
            this.setText('cn_prev_cust_addr', this.getVal('cn_cust_address') || 'Address');
            this.setText('cn_prev_tax_id', this.getVal('cn_cust_ntn') || this.getVal('cn_cust_cnic') || '--');
            this.setText('cn_prev_strn', this.getVal('cn_cust_strn') || '--');

            const rSelect = document.getElementById('cn_reason_code');
            this.setText('cn_prev_reason', rSelect ? rSelect.options[rSelect.selectedIndex].text : 'Sales Return');

            // Populate Items Table
            const tbody = document.getElementById('cn_prev_items_tbody');
            const activeItems = this.data.items.filter(it => parseFloat(it.credit_qty || 0) > 0);

            if (tbody) {
                tbody.innerHTML = activeItems.map((it, i) => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 5px;">${i + 1}</td>
                        <td style="padding: 5px;"><b>${it.item_name || ''}</b></td>
                        <td style="padding: 5px; text-align: center;">${it.hs_code || '0000.0000'}</td>
                        <td style="padding: 5px; text-align: right; font-weight: 700;">${it.credit_qty} ${it.uom || ''}</td>
                        <td style="padding: 5px; text-align: right;">${parseFloat(it.rate || 0).toFixed(2)}</td>
                        <td style="padding: 5px; text-align: right;">${parseFloat(it.val_excl_tax || 0).toFixed(2)}</td>
                        <td style="padding: 5px; text-align: right;">${parseFloat(it.sales_tax_adjustment || 0).toFixed(2)}</td>
                        <td style="padding: 5px; text-align: right; font-weight: 700; color: #b91c1c;">${parseFloat(it.val_incl_tax || 0).toFixed(2)}</td>
                    </tr>
                `).join('');
            }

            // Populate Totals
            this.setText('cn_prev_tot_excl', this.getVal('cn_fin_excl'));
            this.setText('cn_prev_tot_st', this.getVal('cn_fin_st'));
            this.setText('cn_prev_tot_ft', this.getVal('cn_fin_ft'));
            this.setText('cn_prev_tot_net', this.getVal('cn_fin_total'));

            modal.style.display = 'flex';
        },

        closePreviewModal: function () {
            const modal = document.getElementById('cn_preview_modal');
            if (modal) modal.style.display = 'none';
        },

        openConfirmDialog: function () {
            if (!this.data.currentCreditNote || !this.data.currentCreditNote.id) {
                if (confirm('Credit Note must be saved before submitting to FBR. Save and continue?')) {
                    this.saveCreditNote(() => {
                        this.reviewAndConfirm();
                    });
                }
                return;
            }
            this.reviewAndConfirm();
        },

        // -------------------------------------------------------------------------
        // Submit to FBR API
        // -------------------------------------------------------------------------
        confirmAndSubmitFbr: function () {
            if (this.data.isSubmitting) return;

            if (!this.data.currentCreditNote || !this.data.currentCreditNote.id) {
                alert('Please save the Credit Note first.');
                return;
            }

            if (!confirm(`Are you sure you want to officially submit Credit Note ${this.getVal('cn_credit_note_no')} to the FBR Gateway? Once submitted, it cannot be modified.`)) {
                return;
            }

            this.data.isSubmitting = true;
            this.closePreviewModal();

            const btnSubmit = document.getElementById('cn_btn_submit');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;
            }

            fetch('api/digital_credit_note.php?action=submit_to_fbr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.data.currentCreditNote.id })
            })
            .then(r => r.json())
            .then(res => {
                this.data.isSubmitting = false;
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = `<i class="fas fa-paper-plane"></i> <span>Confirm & Submit to FBR</span>`;
                }

                if (res.is_submitted) {
                    this.updateStatusPill('Submitted', 'pill-submitted');
                    this.setText('cn_card_fbr_inv_no', res.fbr_credit_note_no || '--');
                    this.setText('cn_card_sub_date', new Date().toLocaleString());
                    this.setText('cn_resp_status', res.fbr_response_code || 'OK');
                    alert(`Success: ${res.message}`);
                } else {
                    this.updateStatusPill('Failed', 'pill-failed');
                    this.setText('cn_resp_status', res.fbr_response_code || 'ERR');
                    alert(`FBR Submission Error: ${res.message}`);
                }
            })
            .catch(err => {
                this.data.isSubmitting = false;
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = `<i class="fas fa-paper-plane"></i> <span>Confirm & Submit to FBR</span>`;
                }
                alert('Connection error during submission: ' + err.message);
            });
        },

        refreshFbrStatus: function () {
            alert('FBR gateway verified. Latest status: ' + (this.data.currentCreditNote?.fbr_status || 'Pending FBR'));
        },

        showRawResponse: function () {
            alert(this.data.currentCreditNote?.fbr_response_msg || 'No FBR transmission logs recorded for this draft.');
        },

        // -------------------------------------------------------------------------
        // Find / Search Modal
        // -------------------------------------------------------------------------
        openFindModal: function () {
            const modal = document.getElementById('cn_find_modal');
            if (!modal) return;
            modal.style.display = 'flex';
            this.performFindSearch('');
        },

        closeFindModal: function () {
            const modal = document.getElementById('cn_find_modal');
            if (modal) modal.style.display = 'none';
        },

        performFindSearch: function () {
            const qInput = document.getElementById('cn_find_query');
            const q = qInput ? encodeURIComponent(qInput.value.trim()) : '';
            const tbody = document.getElementById('cn_find_tbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Searching...</td></tr>`;

            fetch(`api/digital_credit_note.php?action=search_credit_notes&company_id=${this.data.companyId}&q=${q}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.credit_notes || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">No saved credit notes found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map(cn => `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 5px; text-align: center;">${cn.serial_no}</td>
                                <td style="padding: 5px; font-weight: 700; color: #1e3a8a;">${cn.credit_note_no}</td>
                                <td style="padding: 5px; text-align: center;">${cn.credit_note_date}</td>
                                <td style="padding: 5px; font-weight: 600;">${cn.original_invoice_no}</td>
                                <td style="padding: 5px;">${cn.customer_name}</td>
                                <td style="padding: 5px; text-align: right; font-weight: 700; color: #b91c1c;">
                                    ${parseFloat(cn.total_credit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td style="padding: 5px; text-align: center;">
                                    <span class="fbr-status-pill ${cn.fbr_status === 'Submitted' ? 'pill-submitted' : (cn.fbr_status === 'Failed' ? 'pill-failed' : 'pill-pending')}">${cn.fbr_status}</span>
                                </td>
                                <td style="padding: 5px; text-align: center;">
                                    <button type="button" class="fbr-action-btn btn-act-blue" style="height: 20px; padding: 0 6px; font-size: 10px;" onclick="window.DigitalCreditNoteModule.loadCreditNote(${cn.id})">Open</button>
                                </td>
                            </tr>
                        `).join('');
                    }
                })
                .catch(() => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #dc2626;">Error searching records.</td></tr>`;
                });
        },

        loadCreditNote: function (id) {
            this.closeFindModal();
            fetch(`api/digital_credit_note.php?action=get_credit_note&company_id=${this.data.companyId}&id=${id}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const cn = res.credit_note;
                        this.data.currentCreditNote = cn;
                        this.data.items = cn.items || [];

                        // Populate Header
                        this.setVal('cn_serial_no', cn.serial_no);
                        this.setVal('cn_credit_note_date', cn.credit_note_date);
                        this.setVal('cn_credit_note_no', cn.credit_note_no);

                        // Original Invoice
                        this.setVal('cn_orig_invoice_no', cn.original_invoice_no);
                        this.setVal('cn_orig_invoice_id', cn.original_invoice_id);
                        this.setVal('cn_orig_invoice_date', cn.original_invoice_date);
                        this.setVal('cn_orig_fbr_ref', cn.original_fbr_invoice_no);

                        // Customer
                        this.setVal('cn_cust_code', cn.customer_code);
                        this.setVal('cn_cust_name', cn.customer_name);
                        this.setVal('cn_cust_business_name', cn.business_name || cn.customer_name);
                        this.setVal('cn_customer_coa_id', cn.customer_coa_id);
                        this.setVal('cn_cust_ntn', cn.customer_ntn);
                        this.setVal('cn_cust_cnic', cn.customer_cnic);
                        this.setVal('cn_cust_strn', cn.customer_strn);
                        this.setVal('cn_cust_phone', cn.customer_phone);
                        this.setVal('cn_cust_address', cn.customer_address);
                        this.setVal('cn_cust_province', cn.customer_province);

                        // Reason & Remarks
                        this.setVal('cn_reason_code', cn.reason_code);
                        this.setVal('cn_remarks', cn.remarks);
                        this.onReasonChange();

                        // Status card
                        const isSubmitted = cn.fbr_status === 'Submitted';
                        this.updateStatusPill(cn.fbr_status || 'Draft', isSubmitted ? 'pill-submitted' : (cn.fbr_status === 'Failed' ? 'pill-failed' : 'pill-pending'));
                        this.setText('cn_card_fbr_inv_no', cn.fbr_credit_note_no || '-');
                        this.setText('cn_card_ref_usin', cn.original_fbr_invoice_no || cn.original_invoice_no || '-');
                        this.setText('cn_card_sub_date', cn.submission_timestamp || '-');
                        this.setText('cn_sub_ref_usin', cn.original_fbr_invoice_no || cn.original_invoice_no || '-');

                        this.renderItems();
                        this.recalculateTotals();
                    }
                })
                .catch(err => {
                    alert('Error loading Credit Note: ' + err.message);
                });
        },

        navigateSerial: function (dir) {
            const currentSn = parseInt(this.getVal('cn_serial_no')) || 1;
            fetch(`api/digital_credit_note.php?action=get_credit_note&company_id=${this.data.companyId}&serial_no=${currentSn}&dir=${dir}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && res.credit_note) {
                        this.loadCreditNote(res.credit_note.id);
                    } else {
                        alert(dir === 'next' ? 'Reached latest Credit Note record.' : 'Reached earliest Credit Note record.');
                    }
                });
        },

        retrieveLastSaved: function () {
            fetch(`api/digital_credit_note.php?action=get_credit_note&company_id=${this.data.companyId}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && res.credit_note) {
                        this.loadCreditNote(res.credit_note.id);
                    } else {
                        alert('No saved Credit Notes found.');
                    }
                });
        },

        printCreditNote: function () {
            window.print();
        },

        closeModal: function () {
            const container = document.getElementById('digitalCreditNoteContainer');
            if (container) {
                const modal = container.closest('.modal-container');
                if (modal) modal.remove();
            }
        },

        // -------------------------------------------------------------------------
        // Utilities
        // -------------------------------------------------------------------------
        getVal: function (id) {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        },

        setVal: function (id, val) {
            const el = document.getElementById(id);
            if (el) el.value = (val !== null && val !== undefined) ? val : '';
        },

        setText: function (id, text) {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        },

        updateStatusPill: function (text, className) {
            const pill1 = document.getElementById('cn_card_inv_status');
            const pill2 = document.getElementById('cn_sub_fbr_pill');
            [pill1, pill2].forEach(p => {
                if (p) {
                    p.innerText = text;
                    p.className = `fbr-status-pill ${className}`;
                }
            });
        },

        numberToWords: function (n) {
            const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
            const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

            const num = parseInt(n);
            if (isNaN(num) || num === 0) return 'Zero';

            function convert(num) {
                if (num === 0) return '';
                if (num < 20) return a[num] + ' ';
                if (num < 100) return b[Math.floor(num / 10)] + ' ' + a[num % 10] + ' ';
                if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred ' + convert(num % 100);
                if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand ' + convert(num % 1000);
                if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh ' + convert(num % 100000);
                return convert(Math.floor(num / 10000000)) + ' Crore ' + convert(num % 10000000);
            }
            return convert(num).trim();
        }
    };

    window.DigitalCreditNoteModule = DigitalCreditNoteModule;
})();
