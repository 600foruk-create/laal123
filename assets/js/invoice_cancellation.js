/**
 * SoftifyX ERP - FBR Invoice Cancellation Module
 * Handles UI events, invoice selection, eligibility validation, local/FBR cancellation execution, and audit logging.
 */

(function () {
    const InvoiceCancellationModule = {
        data: {
            companyId: 1,
            company: {},
            settings: {},
            currentRequest: null,
            originalInvoice: null,
            items: [],
            reasons: [],
            nextSerial: 1,
            isSubmitting: false
        },

        init: function () {
            const container = document.getElementById('invoiceCancellationContainer');
            if (!container) return;

            // Load meta settings & next serial
            this.loadMeta(() => {
                this.newCancellationRequest();
            });

            // Bind Ctrl+S shortcut
            container.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault();
                    this.saveRequest();
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
            fetch(`api/invoice_cancellation.php?action=get_meta&company_id=${this.data.companyId}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        this.data.company = res.company || {};
                        this.data.settings = res.settings || {};
                        this.data.reasons = res.reasons || [];
                        this.data.nextSerial = res.next_serial || 1;

                        // Environment badge
                        const envBadge = document.getElementById('cr_top_env_badge');
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
                    console.error('Error loading Cancellation meta:', err);
                });
        },

        newCancellationRequest: function () {
            this.data.currentRequest = null;
            this.data.originalInvoice = null;
            this.data.items = [];

            // Reset serial & date
            const snInput = document.getElementById('cr_serial_no');
            if (snInput) snInput.value = this.data.nextSerial;

            const dateInput = document.getElementById('cr_request_date');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

            const reqNoInput = document.getElementById('cr_request_no');
            if (reqNoInput) reqNoInput.value = `CR-${new Date().getFullYear()}-${String(this.data.nextSerial).padStart(4, '0')}`;

            // Reset invoice fields
            this.setVal('cr_orig_invoice_no', '');
            this.setVal('cr_invoice_id', '');
            this.setVal('cr_orig_invoice_date', '');
            this.setVal('cr_orig_fbr_ref', '');
            this.setVal('cr_orig_invoice_type', 'Tax Invoice');
            this.setVal('cr_orig_invoice_total', '0.00');

            // Reset customer fields
            this.setVal('cr_cust_code', '');
            this.setVal('cr_cust_name', '');
            this.setVal('cr_cust_business_name', '');
            this.setVal('cr_customer_coa_id', '');
            this.setVal('cr_cust_ntn', '');
            this.setVal('cr_cust_cnic', '');
            this.setVal('cr_cust_strn', '');
            this.setVal('cr_cust_phone', '');
            this.setVal('cr_cust_address', '');
            this.setVal('cr_cust_province', 'Punjab');

            // Reset reason & remarks
            const rSelect = document.getElementById('cr_reason_code');
            if (rSelect) rSelect.value = '01';
            this.onReasonChange();
            this.setVal('cr_remarks', '');
            this.setVal('cr_requested_by', 'Office User');

            // Reset status pills
            this.updateStatusPill('Draft', 'pill-pending');
            this.setText('cr_card_ref_usin', '-');
            this.setText('cr_card_sub_date', '-');
            this.setText('cr_card_route', 'Local ERP');
            this.setText('cr_sub_inv_no', '-');
            this.setText('cr_sub_ref_usin', '-');
            this.setText('cr_resp_status', '-');

            const routeBadge = document.getElementById('cr_route_badge');
            if (routeBadge) {
                routeBadge.innerText = 'Local ERP';
                routeBadge.style.background = '#e0f2fe';
                routeBadge.style.color = '#0369a1';
            }

            // Reset items table
            const tbody = document.getElementById('cr_items_tbody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="11" style="text-align: center; padding: 25px; color: #64748b; font-style: italic;">
                            Please select an original sales invoice using the <b>Select Sales Invoice</b> button above to preview items.
                        </td>
                    </tr>
                `;
            }

            // Reset totals
            this.setVal('cr_tot_qty', '0');
            this.setVal('cr_tot_taxable', '0.00');
            this.setVal('cr_tot_tax', '0.00');
            this.setVal('cr_tot_net', '0.00');
            this.setVal('cr_fin_taxable', '0.00');
            this.setVal('cr_fin_tax', '0.00');
            this.setVal('cr_fin_total', '0.00');

            const wordsEl = document.getElementById('cr_amount_in_words');
            if (wordsEl) wordsEl.innerText = 'Zero Rupees Only.';
        },

        // -------------------------------------------------------------------------
        // Invoice Selection & Search
        // -------------------------------------------------------------------------
        openInvoicePicker: function () {
            const modal = document.getElementById('cr_invoice_picker_modal');
            if (!modal) return;
            modal.style.display = 'flex';
            this.searchPickerInvoices();
        },

        closeInvoicePicker: function () {
            const modal = document.getElementById('cr_invoice_picker_modal');
            if (modal) modal.style.display = 'none';
        },

        searchPickerInvoices: function () {
            const q = this.getVal('cr_picker_search_input');
            const dFrom = this.getVal('cr_picker_date_from');
            const dTo = this.getVal('cr_picker_date_to');
            const fbrStatus = this.getVal('cr_picker_fbr_filter');

            const tbody = document.getElementById('cr_picker_tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Searching sales invoices...</td></tr>`;
            }

            const url = `api/invoice_cancellation.php?action=search_invoices&company_id=${this.data.companyId}&q=${encodeURIComponent(q)}&date_from=${dFrom}&date_to=${dTo}&fbr_status=${fbrStatus}`;

            fetch(url)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.invoices || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">No matching sales invoices found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map(inv => {
                            const isEligible = inv.is_eligible;
                            const netAmt = parseFloat(inv.original_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            const isFbrSub = (inv.fbr_status === 'Submitted');

                            return `
                                <tr style="border-bottom: 1px solid #e2e8f0; opacity: ${isEligible ? '1' : '0.55'};">
                                    <td style="padding: 6px; font-weight: 700; color: #1e3a8a;">${inv.invoice_no}</td>
                                    <td style="padding: 6px; text-align: center;">${inv.invoice_date}</td>
                                    <td style="padding: 6px;">
                                        <div style="font-weight: 600; color: #0f172a;">${inv.customer_name}</div>
                                        <div style="font-size: 10px; color: #64748b;">NTN: ${inv.customer_ntn || 'N/A'} &bull; Type: ${inv.invoice_type}</div>
                                    </td>
                                    <td style="padding: 6px; text-align: right; font-weight: 700; color: #b91c1c;">${netAmt}</td>
                                    <td style="padding: 6px; text-align: center;">
                                        <span class="fbr-status-pill ${inv.workflow_status === 'Cancelled' ? 'pill-cancelled' : 'pill-pending'}">${inv.workflow_status || 'Draft'}</span>
                                    </td>
                                    <td style="padding: 6px; text-align: center;">
                                        <span class="fbr-status-pill ${isFbrSub ? 'pill-submitted' : 'pill-pending'}">${inv.fbr_status || 'Draft'}</span>
                                    </td>
                                    <td style="padding: 6px; font-size: 10px; color: ${isEligible ? '#15803d' : '#b91c1c'}; font-weight: 600;">
                                        ${inv.eligibility_message}
                                    </td>
                                    <td style="padding: 6px; text-align: center;">
                                        ${isEligible 
                                            ? `<button type="button" class="fbr-action-btn btn-act-blue" style="height: 22px; padding: 0 8px; font-size: 10px;" onclick="window.InvoiceCancellationModule.selectInvoice('${inv.invoice_no}')">Select</button>` 
                                            : `<span style="font-size: 10px; color: #94a3b8; font-style: italic;">Blocked</span>`
                                        }
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                })
                .catch(() => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #dc2626;">Failed to load invoices.</td></tr>`;
                });
        },

        selectInvoice: function (invoiceNo) {
            if (!invoiceNo) return;
            this.closeInvoicePicker();

            fetch(`api/invoice_cancellation.php?action=get_invoice_details&company_id=${this.data.companyId}&invoice_no=${encodeURIComponent(invoiceNo)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const inv = res.invoice;
                        this.data.originalInvoice = inv;
                        this.data.items = res.items || [];

                        // Header fields
                        this.setVal('cr_orig_invoice_no', inv.invoice_no);
                        this.setVal('cr_invoice_id', inv.id);
                        this.setVal('cr_orig_invoice_date', inv.invoice_date);
                        this.setVal('cr_orig_fbr_ref', inv.fbr_invoice_no || inv.invoice_no);
                        this.setVal('cr_orig_invoice_type', inv.invoice_type || 'Tax Invoice');

                        const totalAmt = parseFloat(inv.net_payable || 0);
                        this.setVal('cr_orig_invoice_total', totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 }));

                        // Customer fields
                        this.setVal('cr_cust_code', inv.customer_code || '');
                        this.setVal('cr_cust_name', inv.customer_name || '');
                        this.setVal('cr_cust_business_name', inv.business_name || inv.customer_name || '');
                        this.setVal('cr_customer_coa_id', inv.customer_coa_id || '');
                        this.setVal('cr_cust_ntn', inv.customer_ntn || '');
                        this.setVal('cr_cust_cnic', inv.customer_cnic || '');
                        this.setVal('cr_cust_strn', inv.customer_strn || '');
                        this.setVal('cr_cust_phone', inv.customer_phone || '');
                        this.setVal('cr_cust_address', inv.customer_address || '');
                        this.setVal('cr_cust_province', inv.customer_province || 'Punjab');

                        // Status Card & Route
                        const isFbrSub = (inv.fbr_status === 'Submitted');
                        const route = isFbrSub ? 'FBR Official Gateway' : 'Local ERP Cancellation';
                        this.setText('cr_card_ref_usin', inv.fbr_invoice_no || inv.invoice_no);
                        this.setText('cr_sub_ref_usin', inv.fbr_invoice_no || inv.invoice_no);
                        this.setText('cr_sub_inv_no', inv.invoice_no);
                        this.setText('cr_card_route', route);

                        const routeBadge = document.getElementById('cr_route_badge');
                        if (routeBadge) {
                            routeBadge.innerText = isFbrSub ? 'FBR Gateway' : 'Local ERP';
                            routeBadge.style.background = isFbrSub ? '#fef3c7' : '#e0f2fe';
                            routeBadge.style.color = isFbrSub ? '#b45309' : '#0369a1';
                        }

                        // Render items preview
                        this.renderItems();
                    } else {
                        alert(res.message || 'Could not load original sales invoice.');
                    }
                })
                .catch(err => {
                    alert('Network error loading invoice details: ' + err.message);
                });
        },

        onInvoiceSearchInput: function (val) {
            const suggestBox = document.getElementById('cr_invoice_suggest_box');
            if (!suggestBox) return;

            const q = (val || '').trim();
            if (q.length < 2) {
                suggestBox.style.display = 'none';
                return;
            }

            fetch(`api/invoice_cancellation.php?action=search_invoices&company_id=${this.data.companyId}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const list = (res.invoices || []).slice(0, 8);
                        if (list.length === 0) {
                            suggestBox.innerHTML = `<div style="padding: 6px; color: #94a3b8; font-size: 11px;">No matching invoices</div>`;
                            suggestBox.style.display = 'block';
                            return;
                        }

                        suggestBox.innerHTML = list.map(inv => `
                            <div class="fbr-suggest-item" onmousedown="window.InvoiceCancellationModule.selectInvoice('${inv.invoice_no}')">
                                <div>
                                    <b>${inv.invoice_no}</b> - ${inv.customer_name}
                                </div>
                                <div style="font-size: 10px; color: #b91c1c; font-weight: 700;">
                                    PKR ${parseFloat(inv.original_total || 0).toLocaleString()}
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
        // Items Grid (Read-Only Preview)
        // -------------------------------------------------------------------------
        renderItems: function () {
            const tbody = document.getElementById('cr_items_tbody');
            if (!tbody) return;

            if (this.data.items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #64748b;">No items found in selected invoice.</td></tr>`;
                return;
            }

            let totQ = 0;
            let totTaxable = 0;
            let totTax = 0;
            let totNet = 0;

            tbody.innerHTML = this.data.items.map((it, idx) => {
                const q = parseFloat(it.quantity || 0);
                const rate = parseFloat(it.rate || 0);
                const valExcl = parseFloat(it.val_excl_tax || (q * rate));
                const taxRate = parseFloat(it.tax_rate || 18);
                const salesTax = parseFloat(it.sales_tax_amount || 0);
                const valIncl = parseFloat(it.val_incl_tax || (valExcl + salesTax));

                totQ += q;
                totTaxable += valExcl;
                totTax += salesTax;
                totNet += valIncl;

                return `
                    <tr style="border-bottom: 1px solid #cbd5e1;">
                        <td style="text-align: center; color: #64748b; font-size: 10px;">${idx + 1}</td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.item_code || ''}"></td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.hs_code || '0000.0000'}"></td>
                        <td><input type="text" class="fbr-tbl-input" readonly value="${it.item_name || it.description || ''}" title="${it.item_name || ''}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${q}"></td>
                        <td style="text-align: center; font-size: 10.5px; color: #475569;">${it.uom || 'Each'}</td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${rate.toFixed(2)}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${valExcl.toFixed(2)}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${taxRate}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly value="${salesTax.toFixed(2)}"></td>
                        <td><input type="text" class="fbr-tbl-input num fbr-tbl-readonly" readonly style="font-weight: 700; color: #b91c1c;" value="${valIncl.toFixed(2)}"></td>
                    </tr>
                `;
            }).join('');

            // Set footer totals
            this.setVal('cr_tot_qty', totQ);
            this.setVal('cr_tot_taxable', totTaxable.toFixed(2));
            this.setVal('cr_tot_tax', totTax.toFixed(2));
            this.setVal('cr_tot_net', totNet.toFixed(2));

            // Set Panel 4 financial summary
            this.setVal('cr_fin_taxable', totTaxable.toFixed(2));
            this.setVal('cr_fin_tax', totTax.toFixed(2));
            this.setVal('cr_fin_total', totNet.toFixed(2));

            // Amount in words
            const wordsEl = document.getElementById('cr_amount_in_words');
            if (wordsEl) {
                wordsEl.innerText = this.numberToWords(Math.round(totNet)) + ' Rupees Only.';
            }
        },

        onReasonChange: function () {
            const rSelect = document.getElementById('cr_reason_code');
            const disp = document.getElementById('cr_sub_reason_display');
            if (rSelect && disp) {
                disp.innerText = rSelect.options[rSelect.selectedIndex].text;
            }
        },

        // -------------------------------------------------------------------------
        // Save Request (Database Integration)
        // -------------------------------------------------------------------------
        saveRequest: function (onSuccess) {
            const origInvNo = this.getVal('cr_orig_invoice_no');
            if (!origInvNo) {
                alert('Please select an original sales invoice first.');
                return;
            }

            const remarks = this.getVal('cr_remarks').trim();
            if (!remarks) {
                alert('Detailed remarks explaining the reason for cancellation are mandatory.');
                return;
            }

            const inv = this.data.originalInvoice || {};

            const payload = {
                id: this.data.currentRequest ? this.data.currentRequest.id : 0,
                company_id: this.data.companyId,
                request_date: this.getVal('cr_request_date'),
                invoice_id: parseInt(this.getVal('cr_invoice_id')) || (inv.id || 0),
                invoice_no: origInvNo,
                invoice_date: this.getVal('cr_orig_invoice_date'),
                fbr_invoice_no: this.getVal('cr_orig_fbr_ref'),
                customer_coa_id: parseInt(this.getVal('cr_customer_coa_id')) || (inv.customer_coa_id || 0),
                customer_code: this.getVal('cr_cust_code'),
                customer_name: this.getVal('cr_cust_name'),
                business_name: this.getVal('cr_cust_business_name'),
                customer_type: 'Registered (Filer)',
                customer_ntn: this.getVal('cr_cust_ntn'),
                customer_cnic: this.getVal('cr_cust_cnic'),
                customer_strn: this.getVal('cr_cust_strn'),
                customer_phone: this.getVal('cr_cust_phone'),
                customer_address: this.getVal('cr_cust_address'),
                customer_province: this.getVal('cr_cust_province') || 'Punjab',
                invoice_type: this.getVal('cr_orig_invoice_type'),
                invoice_total: parseFloat(this.getVal('cr_fin_total')) || 0,
                taxable_amount: parseFloat(this.getVal('cr_fin_taxable')) || 0,
                total_sales_tax: parseFloat(this.getVal('cr_fin_tax')) || 0,
                total_further_tax: 0,
                total_extra_tax: 0,
                original_erp_status: inv.workflow_status || 'Draft',
                original_fbr_status: inv.fbr_status || 'Not Submitted',
                reason_code: this.getVal('cr_reason_code') || '01',
                reason_text: document.getElementById('cr_reason_code') ? document.getElementById('cr_reason_code').options[document.getElementById('cr_reason_code').selectedIndex].text : 'Invoice Created in Error',
                remarks: remarks,
                requested_by: this.getVal('cr_requested_by') || 'Office User'
            };

            const saveBtn = document.getElementById('cr_btn_save_top');
            if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            fetch(`api/invoice_cancellation.php?action=save_cancellation_request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(res => {
                if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Request (Ctrl+S)';

                if (res.status === 'success') {
                    this.data.currentRequest = res.cancellation_request;
                    this.setVal('cr_request_no', res.cancellation_request.request_no);
                    this.setVal('cr_serial_no', res.cancellation_request.serial_no);

                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    } else {
                        alert(`Cancellation Request #${res.cancellation_request.request_no} saved in ERP database.`);
                    }
                } else {
                    alert(res.message || 'Failed to save cancellation request.');
                }
            })
            .catch(err => {
                if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Request (Ctrl+S)';
                alert('Network error while saving request: ' + err.message);
            });
        },

        // -------------------------------------------------------------------------
        // Validation (Client & Server Rule Checks)
        // -------------------------------------------------------------------------
        validateRequest: function () {
            const origInvNo = this.getVal('cr_orig_invoice_no');
            const iconBox = document.getElementById('cr_val_icon_box');
            const icon = document.getElementById('cr_val_icon');
            const msg = document.getElementById('cr_val_status_msg');

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
                setValidationUI(false, 'Validation Error: No sales invoice selected for cancellation.');
                return false;
            }

            const remarks = this.getVal('cr_remarks').trim();
            if (!remarks || remarks.length < 5) {
                setValidationUI(false, 'Validation Error: Detailed cancellation remarks are mandatory.');
                return false;
            }

            fetch(`api/invoice_cancellation.php?action=validate_request&company_id=${this.data.companyId}&cancellation_id=${this.data.currentRequest ? this.data.currentRequest.id : 0}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoice_no: origInvNo,
                    reason_code: this.getVal('cr_reason_code'),
                    remarks: remarks,
                    original_fbr_status: this.data.originalInvoice ? this.data.originalInvoice.fbr_status : 'Not Submitted'
                })
            })
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') {
                    setValidationUI(true, res.message || 'Invoice eligibility verified and ready for confirmation.');
                } else {
                    setValidationUI(false, res.message || 'Validation failed.');
                }
            })
            .catch(() => {
                setValidationUI(true, 'Client Validation Passed: Mandatory fields verified.');
            });

            return true;
        },

        // -------------------------------------------------------------------------
        // Review & Confirm (Preview Modal)
        // -------------------------------------------------------------------------
        reviewAndConfirm: function () {
            const origInvNo = this.getVal('cr_orig_invoice_no');
            if (!origInvNo) {
                alert('Please select an original sales invoice before reviewing.');
                return;
            }

            const modal = document.getElementById('cr_preview_modal');
            if (!modal) return;

            // Company details
            const comp = this.data.company || {};
            this.setText('cr_prev_company_name', comp.company_name || 'SOFTIFYX FINANCIAL ERP');
            this.setText('cr_prev_company_addr', comp.address || 'Pakistan');
            this.setText('cr_prev_comp_ntn', comp.ntn || comp.tax_number || '--');
            this.setText('cr_prev_comp_strn', comp.strn || comp.sales_tax_number || '--');

            // Doc header
            this.setText('cr_prev_doc_no', this.getVal('cr_request_no') || 'CR-DRAFT');
            this.setText('cr_prev_doc_date', this.getVal('cr_request_date'));
            this.setText('cr_prev_orig_inv', this.getVal('cr_orig_invoice_no'));
            this.setText('cr_prev_ref_usin', this.getVal('cr_orig_fbr_ref') || this.getVal('cr_orig_invoice_no'));

            // Customer
            this.setText('cr_prev_cust_name', this.getVal('cr_cust_name') || 'Customer Name');
            this.setText('cr_prev_cust_addr', this.getVal('cr_cust_address') || 'Customer Address');
            const rSelect = document.getElementById('cr_reason_code');
            this.setText('cr_prev_reason', rSelect ? rSelect.options[rSelect.selectedIndex].text : 'Invoice Created in Error');
            this.setText('cr_prev_remarks', this.getVal('cr_remarks') || 'No remarks specified');
            this.setText('cr_prev_tax_id', this.getVal('cr_cust_ntn') || this.getVal('cr_cust_cnic') || 'N/A');
            this.setText('cr_prev_route', document.getElementById('cr_card_route') ? document.getElementById('cr_card_route').innerText : 'Local ERP Cancellation');

            // Preview items table
            const tbody = document.getElementById('cr_prev_items_tbody');
            if (tbody) {
                tbody.innerHTML = (this.data.items || []).map((it, idx) => {
                    const q = parseFloat(it.quantity || 0);
                    const rate = parseFloat(it.rate || 0);
                    const valExcl = parseFloat(it.val_excl_tax || (q * rate));
                    const st = parseFloat(it.sales_tax_amount || 0);
                    const tot = parseFloat(it.val_incl_tax || (valExcl + st));

                    return `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 4px; text-align: left;">${idx + 1}</td>
                            <td style="padding: 4px; font-weight: 600;">${it.item_name || it.description}</td>
                            <td style="padding: 4px; text-align: center;">${it.hs_code || '0000.0000'}</td>
                            <td style="padding: 4px; text-align: right;">${q}</td>
                            <td style="padding: 4px; text-align: right;">${rate.toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right; font-weight: 600;">${valExcl.toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right;">${st.toFixed(2)}</td>
                            <td style="padding: 4px; text-align: right; font-weight: 700; color: #dc2626;">${tot.toFixed(2)}</td>
                        </tr>
                    `;
                }).join('');
            }

            // Totals
            this.setText('cr_prev_tot_taxable', this.getVal('cr_tot_taxable'));
            this.setText('cr_prev_tot_tax', this.getVal('cr_tot_tax'));
            this.setText('cr_prev_tot_net', this.getVal('cr_tot_net'));

            modal.style.display = 'flex';
        },

        closePreviewModal: function () {
            const modal = document.getElementById('cr_preview_modal');
            if (modal) modal.style.display = 'none';
        },

        openConfirmDialog: function () {
            const invNo = this.getVal('cr_orig_invoice_no');
            if (!invNo) {
                alert('Please select an invoice first.');
                return;
            }

            const isFbrSub = (this.data.originalInvoice && this.data.originalInvoice.fbr_status === 'Submitted');
            const routeMsg = isFbrSub 
                ? 'This invoice was submitted to FBR. Submitting will send an official revocation request to FBR PRAL Gateway and void the invoice in ERP.' 
                : 'This invoice was not submitted to FBR. It will be cancelled locally in ERP with full audit logging.';

            if (confirm(`WARNING: Are you sure you want to officially cancel Invoice #${invNo}?\n\n${routeMsg}\n\nThis action cannot be undone.`)) {
                this.confirmAndSubmitCancellation();
            }
        },

        // -------------------------------------------------------------------------
        // Cancellation Execution (Local / FBR Submission)
        // -------------------------------------------------------------------------
        confirmAndSubmitCancellation: function () {
            this.closePreviewModal();

            if (!this.data.currentRequest || !this.data.currentRequest.id) {
                this.saveRequest(() => {
                    this.executeCancellation();
                });
            } else {
                this.executeCancellation();
            }
        },

        executeCancellation: function () {
            if (this.data.isSubmitting) return;
            this.data.isSubmitting = true;

            const submitBtn = document.getElementById('cr_btn_submit');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing Cancellation...';
            }

            const crId = this.data.currentRequest.id;

            fetch(`api/invoice_cancellation.php?action=submit_cancellation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: this.data.companyId,
                    id: crId,
                    cancellation_id: crId
                })
            })
            .then(r => r.json())
            .then(res => {
                this.data.isSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-ban"></i> <span>Confirm & Submit Cancellation</span>';
                }

                if (res.status === 'success') {
                    this.updateStatusPill('Cancellation Confirmed', 'pill-cancelled');
                    this.setText('cr_card_sub_date', new Date().toLocaleString());
                    this.setText('cr_resp_status', res.fbr_response_msg || 'Cancellation Confirmed');

                    alert(`Cancellation Success!\n\n${res.message}\nRoute: ${res.cancellation_route}`);
                } else {
                    this.updateStatusPill('Cancellation Rejected', 'pill-failed');
                    this.setText('cr_resp_status', res.message || 'Failed');
                    alert(`Cancellation Failed:\n\n${res.message}`);
                }
            })
            .catch(err => {
                this.data.isSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-ban"></i> <span>Confirm & Submit Cancellation</span>';
                }
                alert('Network failure executing cancellation: ' + err.message);
            });
        },

        checkFbrStatus: function () {
            if (!this.data.currentRequest || !this.data.currentRequest.id) {
                alert('Please save or load a cancellation request first.');
                return;
            }

            fetch(`api/invoice_cancellation.php?action=get_cancellation_request&company_id=${this.data.companyId}&id=${this.data.currentRequest.id}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const cr = res.cancellation_request;
                        this.data.currentRequest = cr;
                        alert(`Current Status for Request #${cr.request_no}:\nERP Status: ${cr.request_status}\nFBR Status: ${cr.fbr_cancellation_status}\nRoute: ${cr.cancellation_route}`);
                    }
                })
                .catch(err => {
                    alert('Could not check status: ' + err.message);
                });
        },

        showRawResponse: function () {
            if (!this.data.currentRequest) {
                alert('No active cancellation request selected.');
                return;
            }
            const cr = this.data.currentRequest;
            const logMsg = `Cancellation Request: ${cr.request_no}\nOriginal Invoice: ${cr.invoice_no}\nRoute: ${cr.cancellation_route}\nERP Status: ${cr.request_status}\nFBR Status: ${cr.fbr_cancellation_status}\nResponse Code: ${cr.fbr_response_code || 'N/A'}\nMessage: ${cr.fbr_response_msg || 'N/A'}\n\nRaw Response:\n${cr.fbr_raw_response || '(No payload log available)'}`;
            alert(logMsg);
        },

        // -------------------------------------------------------------------------
        // Find / Search Saved Requests Modal
        // -------------------------------------------------------------------------
        openFindModal: function () {
            const modal = document.getElementById('cr_find_modal');
            if (!modal) return;
            modal.style.display = 'flex';
            this.performFindSearch();
        },

        closeFindModal: function () {
            const modal = document.getElementById('cr_find_modal');
            if (modal) modal.style.display = 'none';
        },

        performFindSearch: function () {
            const q = document.getElementById('cr_find_query') ? document.getElementById('cr_find_query').value.trim() : '';
            const tbody = document.getElementById('cr_find_tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #64748b;">Searching requests...</td></tr>`;
            }

            fetch(`api/invoice_cancellation.php?action=search_cancellation_requests&company_id=${this.data.companyId}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && tbody) {
                        const list = res.cancellation_requests || [];
                        if (list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #64748b;">No cancellation requests found.</td></tr>`;
                            return;
                        }

                        tbody.innerHTML = list.map(cr => `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 5px; text-align: center; font-weight: 700;">${cr.serial_no}</td>
                                <td style="padding: 5px; font-weight: 700; color: #dc2626;">${cr.request_no}</td>
                                <td style="padding: 5px; text-align: center;">${cr.request_date}</td>
                                <td style="padding: 5px; font-weight: 600;">${cr.invoice_no}</td>
                                <td style="padding: 5px;">${cr.customer_name}</td>
                                <td style="padding: 5px; text-align: right; font-weight: 700;">${parseFloat(cr.invoice_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style="padding: 5px; text-align: center; font-size: 10px;">${cr.cancellation_route}</td>
                                <td style="padding: 5px; text-align: center;">
                                    <span class="fbr-status-pill ${cr.request_status === 'Cancellation Confirmed' ? 'pill-cancelled' : 'pill-pending'}">${cr.request_status}</span>
                                </td>
                                <td style="padding: 5px; text-align: center;">
                                    <button type="button" class="fbr-action-btn btn-act-blue" style="height: 20px; padding: 0 6px; font-size: 10px;" onclick="window.InvoiceCancellationModule.loadRequestById(${cr.id})">Open</button>
                                </td>
                            </tr>
                        `).join('');
                    }
                })
                .catch(() => {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #dc2626;">Error searching records.</td></tr>`;
                });
        },

        loadRequestById: function (id) {
            this.closeFindModal();

            fetch(`api/invoice_cancellation.php?action=get_cancellation_request&company_id=${this.data.companyId}&id=${id}`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const cr = res.cancellation_request;
                        this.data.currentRequest = cr;
                        this.data.items = cr.items || [];

                        // Header
                        this.setVal('cr_serial_no', cr.serial_no);
                        this.setVal('cr_request_date', cr.request_date);
                        this.setVal('cr_request_no', cr.request_no);

                        // Original Invoice
                        this.setVal('cr_orig_invoice_no', cr.invoice_no);
                        this.setVal('cr_invoice_id', cr.invoice_id);
                        this.setVal('cr_orig_invoice_date', cr.invoice_date);
                        this.setVal('cr_orig_fbr_ref', cr.fbr_invoice_no);
                        this.setVal('cr_orig_invoice_type', cr.invoice_type || 'Tax Invoice');
                        this.setVal('cr_orig_invoice_total', parseFloat(cr.invoice_total || 0).toLocaleString());

                        // Customer
                        this.setVal('cr_cust_code', cr.customer_code || '');
                        this.setVal('cr_cust_name', cr.customer_name || '');
                        this.setVal('cr_cust_business_name', cr.business_name || cr.customer_name || '');
                        this.setVal('cr_customer_coa_id', cr.customer_coa_id || '');
                        this.setVal('cr_cust_ntn', cr.customer_ntn || '');
                        this.setVal('cr_cust_cnic', cr.customer_cnic || '');
                        this.setVal('cr_cust_strn', cr.customer_strn || '');
                        this.setVal('cr_cust_phone', cr.customer_phone || '');
                        this.setVal('cr_cust_address', cr.customer_address || '');
                        this.setVal('cr_cust_province', cr.customer_province || 'Punjab');

                        // Reason & Remarks
                        this.setVal('cr_reason_code', cr.reason_code || '01');
                        this.onReasonChange();
                        this.setVal('cr_remarks', cr.remarks || '');
                        this.setVal('cr_requested_by', cr.requested_by || 'Office User');

                        // Status cards
                        const isConfirmed = (cr.request_status === 'Cancellation Confirmed');
                        this.updateStatusPill(cr.request_status, isConfirmed ? 'pill-cancelled' : 'pill-pending');
                        this.setText('cr_card_ref_usin', cr.fbr_invoice_no || cr.invoice_no);
                        this.setText('cr_sub_ref_usin', cr.fbr_invoice_no || cr.invoice_no);
                        this.setText('cr_sub_inv_no', cr.invoice_no);
                        this.setText('cr_card_route', cr.cancellation_route);
                        this.setText('cr_card_sub_date', cr.submission_timestamp || '-');
                        this.setText('cr_resp_status', cr.fbr_response_msg || cr.request_status || '-');

                        // Render items
                        this.renderItems();
                    } else {
                        alert(res.message || 'Could not load cancellation request.');
                    }
                })
                .catch(err => {
                    alert('Error loading request: ' + err.message);
                });
        },

        retrieveLastSaved: function () {
            fetch(`api/invoice_cancellation.php?action=search_cancellation_requests&company_id=${this.data.companyId}&q=`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success' && (res.cancellation_requests || []).length > 0) {
                        this.loadRequestById(res.cancellation_requests[0].id);
                    } else {
                        alert('No saved cancellation requests found.');
                    }
                })
                .catch(() => alert('Could not retrieve last saved cancellation request.'));
        },

        navigateSerial: function (direction) {
            const currentSn = parseInt(this.getVal('cr_serial_no')) || 1;
            const targetSn = direction === 'prev' ? Math.max(1, currentSn - 1) : currentSn + 1;

            fetch(`api/invoice_cancellation.php?action=search_cancellation_requests&company_id=${this.data.companyId}&q=`)
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        const match = (res.cancellation_requests || []).find(d => parseInt(d.serial_no) === targetSn);
                        if (match) {
                            this.loadRequestById(match.id);
                        } else {
                            alert(`Cancellation request serial #${targetSn} not found.`);
                        }
                    }
                });
        },

        printCancellationSlip: function () {
            const printContent = document.getElementById('cr_printable_preview_area');
            if (!printContent) return;

            const w = window.open('', '_blank', 'width=900,height=700');
            w.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invoice Cancellation Slip - ${this.getVal('cr_orig_invoice_no') || 'FBR'}</title>
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
            const container = document.getElementById('invoiceCancellationContainer');
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
            const pill1 = document.getElementById('cr_card_req_status');
            const pill2 = document.getElementById('cr_card_fbr_status');
            if (pill1) {
                pill1.innerText = text;
                pill1.className = `fbr-status-pill ${cls}`;
            }
            if (pill2) {
                const isConfirmed = (text === 'Cancellation Confirmed');
                pill2.innerText = isConfirmed ? 'Cancelled' : text;
                pill2.className = `fbr-status-pill ${cls}`;
            }
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

    window.InvoiceCancellationModule = InvoiceCancellationModule;
})();
