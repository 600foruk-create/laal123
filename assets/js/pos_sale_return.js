/**
 * SoftifyX ERP - POS Sales Return Module
 * Handles POS Customer Returns, Available Quantity Validation, Refund Accounting,
 * Stock Routing, and FBR Digital Credit Note Submissions.
 */
window.POSReturnModule = {
    currentInvoice: null,
    invoiceItems: [],
    currentReturnId: null,
    nextReturnSn: 1,

    init: async function() {
        console.log("POSReturnModule: Initializing...");
        this.resetForm();
        await this.loadLookups();

        // Check if an invoice ID was set for return from Sales Register or Dashboard
        if (window.pendingReturnInvoiceId) {
            const invId = window.pendingReturnInvoiceId;
            window.pendingReturnInvoiceId = null;
            await this.loadOriginalInvoice(invId);
        }
    },

    getCompanyId: function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        return window.selectedCompanyId || session.company_id || 1;
    },

    resetForm: function() {
        this.currentInvoice = null;
        this.invoiceItems = [];
        this.currentReturnId = null;

        // Reset Inputs
        const searchInput = document.getElementById('pos_ret_inv_search');
        if (searchInput) searchInput.value = '';

        // Reset Header Labels
        const origInvNo = document.getElementById('pos_ret_orig_inv_no');
        const origDate = document.getElementById('pos_ret_orig_date');
        const custName = document.getElementById('pos_ret_cust_name');
        const custMobile = document.getElementById('pos_ret_cust_mobile');
        const branchEl = document.getElementById('pos_ret_branch');
        const origPayment = document.getElementById('pos_ret_orig_payment');
        const origTotal = document.getElementById('pos_ret_orig_total');
        const origFbrStatus = document.getElementById('pos_ret_orig_fbr_status');
        const fbrNotice = document.getElementById('pos_fbr_notice_container');

        if (origInvNo) origInvNo.value = '—';
        if (origDate) origDate.value = '—';
        if (custName) custName.value = '—';
        if (custMobile) custMobile.value = '—';
        if (branchEl) branchEl.value = '—';
        if (origPayment) origPayment.value = '—';
        if (origTotal) origTotal.value = 'PKR 0.00';
        if (origFbrStatus) origFbrStatus.value = 'Not Submitted';
        if (fbrNotice) fbrNotice.style.display = 'none';
        const branchFooter = document.getElementById('pos_ret_footer_branch');
        if (branchFooter) branchFooter.textContent = 'Active POS';

        // Reset Return Details
        const dateEl = document.getElementById('pos_ret_date');
        if (dateEl) {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            dateEl.value = `${yyyy}-${mm}-${dd}`;
        }

        const remarksEl = document.getElementById('pos_ret_remarks');
        if (remarksEl) remarksEl.value = '';

        const refAmtEl = document.getElementById('pos_ret_refund_amount');
        if (refAmtEl) refAmtEl.value = '';

        const printBtn = document.getElementById('pos_btn_print_receipt');
        if (printBtn) printBtn.style.display = 'none';

        const fbrSubmitBtn = document.getElementById('pos_btn_fbr_submit');
        if (fbrSubmitBtn) fbrSubmitBtn.style.display = 'none';

        // Clear Items Table
        const tbody = document.getElementById('pos_ret_items_tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center; padding: 35px; color: #a0aec0;">
                        <i class="fas fa-receipt" style="font-size: 24px; margin-bottom: 6px; color: #cbd5e0;"></i>
                        <div>Please search and load an original POS invoice above to select items for return.</div>
                    </td>
                </tr>
            `;
        }

        this.recalculateSummary();
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const userBranchId = (session.role === 'POS' && session.branch_id) ? session.branch_id : 0;
        this.fetchNextReturnNo(userBranchId);
    },

    fetchNextReturnNo: async function(branchId = 0) {
        try {
            const compId = this.getCompanyId();
            const res = await fetch(`api/pos_sale_return.php?action=get_next_return_no&company_id=${compId}&branch_id=${branchId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    this.nextReturnSn = data.next_sn;
                    const retNoEl = document.getElementById('pos_ret_no');
                    if (retNoEl) retNoEl.value = data.return_no;
                }
            }
        } catch (e) {
            console.error("Fetch next return number error:", e);
        }
    },

    loadLookups: async function() {
        try {
            const compId = this.getCompanyId();
            const res = await fetch(`api/pos_sale_return.php?action=get_form_lookups&company_id=${compId}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.status !== 'success') return;

            // Cash Accounts
            const cashSelect = document.getElementById('pos_ret_cash_account');
            if (cashSelect && Array.isArray(data.cash_accounts)) {
                let cashOpts = '<option value="">Select Cash Account</option>';
                data.cash_accounts.forEach(c => {
                    cashOpts += `<option value="${c.id}">${this.escapeHtml(c.name)} (${c.code})</option>`;
                });
                cashSelect.innerHTML = cashOpts;
                if (data.cash_accounts.length > 0) cashSelect.selectedIndex = 1;
            }

            // Bank Accounts
            const bankSelect = document.getElementById('pos_ret_bank_account');
            if (bankSelect && Array.isArray(data.bank_accounts)) {
                let bankOpts = '<option value="">Select Bank Account</option>';
                data.bank_accounts.forEach(b => {
                    bankOpts += `<option value="${b.id}">${this.escapeHtml(b.name)} (${b.code})</option>`;
                });
                bankSelect.innerHTML = bankOpts;
            }

            // Warehouses (Damaged / Inspection)
            const whSelect = document.getElementById('pos_ret_damaged_wh');
            if (whSelect && Array.isArray(data.warehouses)) {
                let whOpts = '<option value="">Select Warehouse</option>';
                data.warehouses.forEach(w => {
                    whOpts += `<option value="${w.id}">${this.escapeHtml(w.name)}</option>`;
                });
                whSelect.innerHTML = whOpts;
            }

        } catch (e) {
            console.error("Load lookups error:", e);
        }
    },

    // -------------------------------------------------------------
    // ACTION: Load Original Invoice
    // -------------------------------------------------------------
    loadOriginalInvoice: async function(invoiceId = null, invoiceNo = null) {
        if (!invoiceId && !invoiceNo) {
            const inputVal = (document.getElementById('pos_ret_inv_search')?.value || '').trim();
            if (!inputVal) {
                alert('Please enter or scan an Original Invoice Number.');
                document.getElementById('pos_ret_inv_search')?.focus();
                return;
            }
            invoiceNo = inputVal;
        }

        const compId = this.getCompanyId();
        const param = invoiceId ? `invoice_id=${invoiceId}` : `invoice_no=${encodeURIComponent(invoiceNo)}`;

        const tbody = document.getElementById('pos_ret_items_tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 25px;"><i class="fas fa-spinner fa-spin"></i> Loading invoice details...</td></tr>`;
        }

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const branchParam = (session.role === 'POS' && session.branch_id) ? `&branch_id=${encodeURIComponent(session.branch_id)}` : '';
            const res = await fetch(`api/pos_sale_return.php?action=get_invoice_for_return&company_id=${compId}&${param}${branchParam}`);
            const data = await res.json();

            if (data.status !== 'success') {
                alert(`Error: ${data.message}`);
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 25px; color: #c53030;">${data.message}</td></tr>`;
                }
                return;
            }

            this.currentInvoice = data.header;
            this.invoiceItems = data.items || [];
            const inv = this.currentInvoice;

            // Populate Readonly Info Header
            document.getElementById('pos_ret_orig_inv_no').value = inv.formatted_invoice_no;
            document.getElementById('pos_ret_orig_date').value = inv.invoice_date || '—';
            document.getElementById('pos_ret_cust_name').value = inv.customer_name || 'Walk-in Customer';
            document.getElementById('pos_ret_cust_mobile').value = inv.customer_mobile || '—';
            document.getElementById('pos_ret_branch').value = inv.branch_name || 'Main / Default';
            document.getElementById('pos_ret_orig_payment').value = inv.payment_terms || 'Cash';
            document.getElementById('pos_ret_orig_total').value = 'PKR ' + parseFloat(inv.net_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
            document.getElementById('pos_ret_orig_fbr_status').value = inv.fbr_status || 'Not Submitted';

            // Show FBR Notice if submitted
            const fbrContainer = document.getElementById('pos_fbr_notice_container');
            const fbrRefText = document.getElementById('pos_ret_orig_fbr_ref_text');
            if (inv.fbr_status === 'Submitted' || inv.fbr_status === 'Accepted' || inv.fbr_invoice_number) {
                if (fbrRefText) fbrRefText.textContent = inv.fbr_invoice_number || 'FBR Integrated';
                if (fbrContainer) fbrContainer.style.display = 'flex';
            } else {
                if (fbrContainer) fbrContainer.style.display = 'none';
            }

            const branchFooter = document.getElementById('pos_ret_footer_branch');
            if (branchFooter) branchFooter.textContent = inv.branch_name || 'Active POS';

            // Sync branch-based return number series
            if (inv.inventory_location_id) {
                this.fetchNextReturnNo(inv.inventory_location_id);
            }

            // Render Items Table
            this.renderItemsTable(this.invoiceItems);

            if (data.is_fully_returned) {
                alert('Notice: All items from this invoice have already been returned in previous return vouchers.');
            }

        } catch (e) {
            console.error("Load invoice error:", e);
            alert('Failed to connect to server to load invoice.');
        }
    },

    renderItemsTable: function(items) {
        const tbody = document.getElementById('pos_ret_items_tbody');
        if (!tbody) return;

        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 25px; color: #a0aec0;">No items found on this invoice.</td></tr>`;
            return;
        }

        let html = '';
        items.forEach((it, idx) => {
            const sold = it.sold_qty;
            const prevRet = it.previously_returned_qty;
            const avail = it.available_return_qty;
            const rate = it.unit_rate;
            const discPerUnit = it.unit_discount;
            const taxRate = it.tax_rate + (it.further_tax_rate || 0);
            const isAvailZero = avail <= 0;

            html += `
                <tr id="pos_row_${idx}" class="${isAvailZero ? 'row-excluded' : ''}">
                    <td style="text-align: center;">
                        <input type="checkbox" id="chk_${idx}" onchange="window.POSReturnModule.onRowCheckboxChange(${idx})" ${isAvailZero ? 'disabled' : ''}>
                    </td>
                    <td style="font-family: monospace; font-weight: 600;">${this.escapeHtml(it.item_code || '—')}</td>
                    <td style="font-family: monospace; font-size: 11px; color: #718096;">${this.escapeHtml(it.barcode || '—')}</td>
                    <td style="font-weight: 600;">${this.escapeHtml(it.item_title || it.description || 'Item')}</td>
                    <td style="text-align: right; color: #4a5568;">${sold}</td>
                    <td style="text-align: right; color: #c53030;">${prevRet}</td>
                    <td style="text-align: right; font-weight: 700; color: #27ae60;">${avail}</td>
                    <td style="text-align: center;">
                        <input type="number" 
                               id="qty_input_${idx}" 
                               class="qty-input" 
                               min="0" 
                               max="${avail}" 
                               step="any" 
                               value="0" 
                               ${isAvailZero ? 'disabled' : ''}
                               oninput="window.POSReturnModule.recalculateRow(${idx})"
                               onclick="this.select()">
                    </td>
                    <td>${this.escapeHtml(it.unit || 'Pcs')}</td>
                    <td style="text-align: right;">${rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: right; color: #e53e3e;">${discPerUnit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: right;">${taxRate}%</td>
                    <td style="text-align: right; font-weight: 700; color: #1a202c;" id="row_total_${idx}">0.00</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        this.recalculateSummary();
    },

    onRowCheckboxChange: function(idx) {
        const chk = document.getElementById(`chk_${idx}`);
        const input = document.getElementById(`qty_input_${idx}`);
        const it = this.invoiceItems[idx];
        if (!chk || !input || !it) return;

        if (chk.checked) {
            input.value = it.available_return_qty;
        } else {
            input.value = 0;
        }
        this.recalculateRow(idx);
    },

    recalculateRow: function(idx) {
        const input = document.getElementById(`qty_input_${idx}`);
        const chk = document.getElementById(`chk_${idx}`);
        const it = this.invoiceItems[idx];
        if (!input || !it) return;

        let retQty = parseFloat(input.value) || 0;

        // Validation against available
        if (retQty < 0) {
            retQty = 0;
            input.value = 0;
        }
        if (retQty > it.available_return_qty) {
            alert(`Return quantity cannot exceed available quantity (${it.available_return_qty}).`);
            retQty = it.available_return_qty;
            input.value = retQty;
        }

        if (chk) {
            chk.checked = (retQty > 0);
        }

        // Calculations
        const gross = retQty * it.unit_rate;
        const disc = retQty * it.unit_discount;
        const taxable = Math.max(0, gross - disc);
        const taxRate = it.tax_rate + (it.further_tax_rate || 0);
        const tax = (taxable * taxRate) / 100;
        const total = taxable + tax;

        const totalCell = document.getElementById(`row_total_${idx}`);
        if (totalCell) {
            totalCell.textContent = total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        this.recalculateSummary();
    },

    selectAllFullReturn: function() {
        this.invoiceItems.forEach((it, idx) => {
            if (it.available_return_qty > 0) {
                const input = document.getElementById(`qty_input_${idx}`);
                const chk = document.getElementById(`chk_${idx}`);
                if (input) input.value = it.available_return_qty;
                if (chk) chk.checked = true;
                this.recalculateRow(idx);
            }
        });
    },

    clearAllReturnQty: function() {
        this.invoiceItems.forEach((it, idx) => {
            const input = document.getElementById(`qty_input_${idx}`);
            const chk = document.getElementById(`chk_${idx}`);
            if (input) input.value = 0;
            if (chk) chk.checked = false;
            this.recalculateRow(idx);
        });
    },

    recalculateSummary: function() {
        let subtotal = 0;
        let discount = 0;
        let tax = 0;
        let totalItemsSold = 0;
        let totalItemsReturnedNow = 0;

        this.invoiceItems.forEach((it, idx) => {
            totalItemsSold += it.sold_qty;
            const input = document.getElementById(`qty_input_${idx}`);
            const retQty = input ? (parseFloat(input.value) || 0) : 0;
            totalItemsReturnedNow += retQty;

            const gross = retQty * it.unit_rate;
            const disc = retQty * it.unit_discount;
            const taxable = Math.max(0, gross - disc);
            const taxRate = it.tax_rate + (it.further_tax_rate || 0);
            const taxAmt = (taxable * taxRate) / 100;

            subtotal += gross;
            discount += disc;
            tax += taxAmt;
        });

        const netReturn = Math.max(0, subtotal - discount + tax);

        document.getElementById('pos_sum_subtotal').textContent = 'PKR ' + subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('pos_sum_discount').textContent = '-PKR ' + discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('pos_sum_tax').textContent = '+PKR ' + tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('pos_sum_net_return').textContent = 'PKR ' + netReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Default refund amount to net return
        const refAmtInput = document.getElementById('pos_ret_refund_amount');
        if (refAmtInput && document.activeElement !== refAmtInput) {
            refAmtInput.value = netReturn > 0 ? netReturn.toFixed(2) : '';
        }

        const refundAmt = refAmtInput ? (parseFloat(refAmtInput.value) || 0) : 0;
        const remaining = Math.max(0, netReturn - refundAmt);
        document.getElementById('pos_sum_remaining').textContent = 'PKR ' + remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Auto determine return type
        const typeSelect = document.getElementById('pos_ret_type');
        if (typeSelect) {
            if (totalItemsReturnedNow >= totalItemsSold && totalItemsSold > 0) {
                typeSelect.value = 'Full';
            } else {
                typeSelect.value = 'Partial';
            }
        }
    },

    onRefundAmountInput: function() {
        const subtotalText = document.getElementById('pos_sum_net_return').textContent;
        const netReturn = parseFloat(subtotalText.replace(/[^0-9.-]+/g, '')) || 0;
        const refAmtInput = document.getElementById('pos_ret_refund_amount');
        const refundAmt = parseFloat(refAmtInput.value) || 0;

        const remaining = Math.max(0, netReturn - refundAmt);
        document.getElementById('pos_sum_remaining').textContent = 'PKR ' + remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    onRefundMethodChange: function() {
        const method = document.getElementById('pos_ret_refund_method').value;
        const cashGroup = document.getElementById('pos_fg_cash_account');
        const bankGroup = document.getElementById('pos_fg_bank_account');
        const refGroup = document.getElementById('pos_fg_refund_ref');

        if (method === 'Cash Refund') {
            cashGroup.style.display = 'flex';
            bankGroup.style.display = 'none';
            refGroup.style.display = 'none';
        } else if (method === 'Bank / Card Refund') {
            cashGroup.style.display = 'none';
            bankGroup.style.display = 'flex';
            refGroup.style.display = 'flex';
        } else {
            cashGroup.style.display = 'none';
            bankGroup.style.display = 'none';
            refGroup.style.display = 'none';
        }
    },

    onStockConditionChange: function() {
        const cond = document.getElementById('pos_ret_stock_cond').value;
        const whGroup = document.getElementById('pos_damaged_wh_group');
        if (cond === 'Damaged' || cond === 'Inspection Required') {
            whGroup.style.display = 'flex';
        } else {
            whGroup.style.display = 'none';
        }
    },

    // -------------------------------------------------------------
    // ACTION: Save & Approve Sales Return
    // -------------------------------------------------------------
    saveReturn: async function() {
        if (!this.currentInvoice) {
            alert('Please load an original POS invoice first.');
            return;
        }

        const itemsToReturn = [];
        this.invoiceItems.forEach((it, idx) => {
            const input = document.getElementById(`qty_input_${idx}`);
            const retQty = input ? (parseFloat(input.value) || 0) : 0;
            if (retQty > 0) {
                itemsToReturn.push({
                    item_coa_id: it.item_coa_id,
                    original_invoice_item_id: it.id,
                    return_qty: retQty,
                    pieces: it.pieces || 0
                });
            }
        });

        if (itemsToReturn.length === 0) {
            alert('Please specify a return quantity greater than zero for at least one item.');
            return;
        }

        const compId = this.getCompanyId();
        const refAmtInput = document.getElementById('pos_ret_refund_amount');
        const refundAmt = refAmtInput ? (parseFloat(refAmtInput.value) || 0) : 0;
        const refundMethod = document.getElementById('pos_ret_refund_method').value;

        const payload = {
            company_id: compId,
            pos_invoice_id: this.currentInvoice.id,
            pos_return_no: document.getElementById('pos_ret_no').value,
            return_date: document.getElementById('pos_ret_date').value,
            return_type: document.getElementById('pos_ret_type').value,
            return_reason: document.getElementById('pos_ret_reason').value,
            stock_condition: document.getElementById('pos_ret_stock_cond').value,
            damaged_warehouse_id: document.getElementById('pos_ret_damaged_wh').value || null,
            refund_method: refundMethod,
            refund_account_coa_id: (refundMethod === 'Cash Refund') 
                ? (document.getElementById('pos_ret_cash_account').value || null)
                : (document.getElementById('pos_ret_bank_account').value || null),
            refund_ref_no: document.getElementById('pos_ret_refund_ref').value || null,
            refund_amount: refundAmt,
            remarks: document.getElementById('pos_ret_remarks').value,
            branch_id: (() => {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                return (session.role === 'POS' && session.branch_id) ? session.branch_id : (this.currentInvoice?.inventory_location_id || null);
            })(),
            items: itemsToReturn
        };

        try {
            const res = await fetch('api/pos_sale_return.php?action=save_return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.status === 'success') {
                this.currentReturnId = data.id;
                alert(`✓ ${data.message}`);

                // Enable Print Receipt Button
                const printBtn = document.getElementById('pos_btn_print_receipt');
                if (printBtn) printBtn.style.display = 'inline-block';

                // Check FBR submission option
                const fbrSubmitBtn = document.getElementById('pos_btn_fbr_submit');
                if (fbrSubmitBtn && data.fbr_status === 'Pending') {
                    fbrSubmitBtn.style.display = 'inline-block';
                }

                // Update FBR Badges in Summary
                const fbrBadge = document.getElementById('pos_fbr_stat_badge');
                if (fbrBadge) {
                    fbrBadge.textContent = data.fbr_status;
                    fbrBadge.style.background = (data.fbr_status === 'Pending') ? '#fffaf0' : '#edf2f7';
                    fbrBadge.style.color = (data.fbr_status === 'Pending') ? '#dd6b20' : '#4a5568';
                }

                // Reload invoice so available quantities update!
                await this.loadOriginalInvoice(this.currentInvoice.id);

            } else {
                alert(`✕ Error saving return: ${data.message}`);
            }
        } catch (e) {
            console.error("Save return error:", e);
            alert('Failed to connect to backend server to save return.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Submit FBR Digital Credit Note
    // -------------------------------------------------------------
    submitCreditNoteToFBR: async function() {
        if (!this.currentReturnId) {
            alert('Please save the sales return voucher first.');
            return;
        }

        if (!confirm('Are you sure you want to submit this Return / Credit Note to FBR Digital Invoicing?')) {
            return;
        }

        const compId = this.getCompanyId();
        try {
            const res = await fetch('api/pos_sale_return.php?action=submit_fbr_credit_note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentReturnId, company_id: compId })
            });

            const data = await res.json();
            if (data.status === 'success') {
                alert(`✓ ${data.message}`);
                const badge = document.getElementById('pos_fbr_stat_badge');
                const ref = document.getElementById('pos_fbr_cn_ref_text');
                if (badge) {
                    badge.textContent = 'Submitted';
                    badge.style.background = '#e6fffa';
                    badge.style.color = '#234e52';
                }
                if (ref) ref.textContent = data.fbr_credit_note_no;

                const fbrSubmitBtn = document.getElementById('pos_btn_fbr_submit');
                if (fbrSubmitBtn) fbrSubmitBtn.style.display = 'none';

            } else if (data.status === 'info') {
                alert(`ℹ ${data.message}`);
            } else {
                alert(`✕ FBR Submission Failed:\n${data.message}`);
            }
        } catch (e) {
            console.error("FBR Credit Note error:", e);
            alert('Failed to submit Credit Note to FBR.');
        }
    },

    // -------------------------------------------------------------
    // ACTION: Thermal Receipt Printing
    // -------------------------------------------------------------
    printReceipt: async function() {
        if (!this.currentReturnId) {
            alert('Please save the return before printing receipt.');
            return;
        }

        const compId = this.getCompanyId();
        try {
            const res = await fetch(`api/pos_sale_return.php?action=get_return&id=${this.currentReturnId}&company_id=${compId}`);
            const data = await res.json();
            if (data.status !== 'success') {
                alert('Error loading return receipt: ' + data.message);
                return;
            }

            const ret = data.header;
            const items = data.items || [];
            const comp = data.company || {};
            const sett = data.settings || {};
            this.currentReceiptSettings = sett;

            const showHeader = (sett.rec_show_header !== '0');
            const showLogo = (sett.rec_show_logo !== '0');

            const hasReturnLogo = (showLogo && comp.logo_data);
            const hasReturnCoName = (showHeader && (comp.name || 'SOFTIFYX STORE'));

            let returnBrandLineHtml = '';
            if (hasReturnLogo || hasReturnCoName) {
                returnBrandLineHtml = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px;">
                        ${hasReturnLogo ? `<img src="${comp.logo_data}" style="max-height: 38px; max-width: 110px; object-fit: contain; display: block;" alt="Logo" />` : ''}
                        ${hasReturnCoName ? `<div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${this.escapeHtml(comp.name || 'SOFTIFYX STORE')}</div>` : ''}
                    </div>
                `;
            }

            let receiptHtml = `
                <div style="text-align: center; margin-bottom: 8px;">
                    ${returnBrandLineHtml}
                    ${ret.branch_name ? `<div>${this.escapeHtml(ret.branch_name)}</div>` : ''}
                    ${ret.branch_address ? `<div>${this.escapeHtml(ret.branch_address)}</div>` : ''}
                    ${ret.branch_contact ? `<div>Tel: ${this.escapeHtml(ret.branch_contact)}</div>` : ''}
                    <div style="background: #000; color: #fff; padding: 2px 0; font-weight: bold; margin-top: 4px; letter-spacing: 1px;">
                        *** SALES RETURN VOUCHER ***
                    </div>
                </div>

                <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                <div>
                    <div><b>Return #:</b> ${ret.pos_return_no || ('RET-' + ret.serial_no)}</div>
                    <div><b>Orig Inv #:</b> ${ret.sale_invoice_no}</div>
                    <div><b>Date:</b> ${ret.return_date}</div>
                    <div><b>Customer:</b> ${this.escapeHtml(ret.customer_name)}</div>
                    <div><b>Reason:</b> ${this.escapeHtml(ret.return_reason || 'Customer Return')}</div>
                </div>

                <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="border-bottom: 1px dashed #000;">
                            <th style="text-align: left; padding: 2px 0;">Item</th>
                            <th style="text-align: center; padding: 2px 0;">Qty</th>
                            <th style="text-align: right; padding: 2px 0;">Rate</th>
                            <th style="text-align: right; padding: 2px 0;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            items.forEach(it => {
                const qty = parseFloat(it.quantity || 0);
                const rate = parseFloat(it.rate || 0);
                const net = parseFloat(it.net_amount || (qty * rate));

                receiptHtml += `
                    <tr>
                        <td colspan="4" style="font-weight: bold; padding-top: 3px;">${this.escapeHtml(it.item_title || it.description || 'Item')}</td>
                    </tr>
                    <tr>
                        <td></td>
                        <td style="text-align: center;">${qty}</td>
                        <td style="text-align: right;">${rate.toFixed(2)}</td>
                        <td style="text-align: right;">${net.toFixed(2)}</td>
                    </tr>
                `;
            });

            receiptHtml += `
                    </tbody>
                </table>
                <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                <table style="width: 100%; font-size: 11px;">
                    <tr style="font-weight: bold; font-size: 12px;">
                        <td>NET RETURN AMOUNT:</td>
                        <td style="text-align: right;">PKR ${parseFloat(ret.net_total || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td>Refund Amount Paid:</td>
                        <td style="text-align: right;">PKR ${parseFloat(ret.amount_paid || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td>Refund Method:</td>
                        <td style="text-align: right;">${ret.refund_method || 'Cash'}</td>
                    </tr>
                </table>
                <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
            `;

            if (ret.fbr_credit_note_no) {
                const qrHtml = (window.POSRegisterModule && typeof window.POSRegisterModule.generateFbrQrCodeHtml === 'function')
                    ? window.POSRegisterModule.generateFbrQrCodeHtml({ fbr_invoice_number: ret.fbr_credit_note_no }, sett, 100)
                    : '';
                receiptHtml += `
                    <div style="text-align: center; margin: 6px 0;">
                        <div style="font-weight: bold;">*** FBR VERIFIED CREDIT NOTE ***</div>
                        ${qrHtml ? `<div style="margin: 5px auto; display: flex; justify-content: center;">${qrHtml}</div>` : ''}
                        <div style="font-family: monospace;">Ref: ${ret.fbr_credit_note_no}</div>
                        <div style="font-size: 8px; margin-top: 2px;">Verify with FBR Tax Asaan App</div>
                    </div>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                `;
            }

            receiptHtml += `
                <div style="text-align: center; margin-top: 8px; font-size: 10px; color: #555;">
                    <div>${this.escapeHtml(sett.rec_footer || 'Thank you for shopping with us!')}</div>
                    <div style="margin-top: 3px;">SoftifyX ERP - POS Module</div>
                </div>
            `;

            document.getElementById('pos_return_receipt_paper').innerHTML = receiptHtml;
            this.openModal('posModalReturnReceipt');

            // Automatic Receipt Printing
            if (sett.rec_auto_print === '1') {
                setTimeout(() => {
                    this.executePrintNow();
                }, 400);
            }

        } catch (e) {
            console.error("Print receipt error:", e);
            alert('Failed to load return receipt layout.');
        }
    },

    executePrintNow: function() {
        const area = document.getElementById('pos_return_receipt_paper');
        if (!area) return;

        const printWindow = window.open('', '_blank', 'width=450,height=600');
        printWindow.document.write(`
            <html>
                <head>
                    <title>POS Return Receipt</title>
                    <style>
                        body { margin: 0; padding: 10px; font-family: 'Courier New', Courier, monospace; font-size: 12px; }
                        .paper { width: 100%; max-width: 340px; margin: 0 auto; }
                    </style>
                </head>
                <body>
                    ${(() => {
                        const copies = Math.max(1, parseInt(this.currentReceiptSettings?.rec_copies || 1));
                        if (copies <= 1) return `<div class="paper">${area.innerHTML}</div>`;
                        let multiHtml = '';
                        for (let c = 1; c <= copies; c++) {
                            multiHtml += `<div class="paper" style="${c > 1 ? 'page-break-before: always; margin-top: 15px;' : ''}">${area.innerHTML}</div>`;
                        }
                        return multiHtml;
                    })()}
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() { window.close(); }, 500);
                        };
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
    },

    // -------------------------------------------------------------
    // MODAL: Invoice Search / Browse Modal
    // -------------------------------------------------------------
    openInvoiceSearchModal: function() {
        this.openModal('posModalSearchInvoice');
        this.executeInvoiceSearch('');
    },

    executeInvoiceSearch: async function(query) {
        const tbody = document.getElementById('pos_modal_inv_tbody');
        if (!tbody) return;

        try {
            const compId = this.getCompanyId();
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const branchParam = (session.role === 'POS' && session.branch_id) ? `&branch_id=${encodeURIComponent(session.branch_id)}` : '';
            const res = await fetch(`api/pos_sale_return.php?action=search_invoices&company_id=${compId}&q=${encodeURIComponent(query)}${branchParam}`);
            const data = await res.json();

            if (data.status !== 'success' || !data.data || data.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #a0aec0;">No matching POS invoices found.</td></tr>`;
                return;
            }

            let html = '';
            data.data.forEach(r => {
                html += `
                    <tr>
                        <td style="font-weight: 700; color: #2b6cb0;">${r.formatted_invoice_no}</td>
                        <td>${r.invoice_date}</td>
                        <td>${this.escapeHtml(r.customer_name)}</td>
                        <td>${this.escapeHtml(r.branch_name)}</td>
                        <td style="text-align: right; font-weight: 600;">${parseFloat(r.net_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td><span style="font-size: 11px;">${r.fbr_status || 'Not Submitted'}</span></td>
                        <td style="text-align: center;">
                            <button class="btn btn-primary btn-sm" onclick="window.POSReturnModule.selectSearchedInvoice(${r.id})" style="padding: 2px 8px; font-size: 11px; background: #1F4E79; border-color: #1F4E79; color: #fff;">
                                Select
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;

        } catch (e) {
            console.error("Execute invoice search error:", e);
        }
    },

    selectSearchedInvoice: function(id) {
        this.closeModal('posModalSearchInvoice');
        this.loadOriginalInvoice(id);
    },

    // -------------------------------------------------------------
    // MODAL: Find Previous POS Returns
    // -------------------------------------------------------------
    openFindModal: function() {
        this.openModal('posModalFindReturns');
        this.executeFindReturns('');
    },

    executeFindReturns: async function(query) {
        const tbody = document.getElementById('pos_modal_ret_tbody');
        if (!tbody) return;

        try {
            const compId = this.getCompanyId();
            const res = await fetch(`api/pos_sale_return.php?action=search_returns&company_id=${compId}&q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (data.status !== 'success' || !data.data || data.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #a0aec0;">No past POS returns found.</td></tr>`;
                return;
            }

            let html = '';
            data.data.forEach(r => {
                html += `
                    <tr>
                        <td style="font-weight: 700; color: #c53030;">${r.pos_return_no || ('RET-' + r.serial_no)}</td>
                        <td style="font-weight: 600;">${r.sale_invoice_no}</td>
                        <td>${r.return_date}</td>
                        <td>${this.escapeHtml(r.customer_name)}</td>
                        <td style="text-align: right; font-weight: 600;">${parseFloat(r.net_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style="text-align: right; color: #27ae60;">${parseFloat(r.amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td><span style="font-size: 11px;">${r.fbr_status || 'Not Required'}</span></td>
                        <td style="text-align: center;">
                            <button class="btn btn-outline-primary btn-sm" onclick="window.POSReturnModule.loadSavedReturn(${r.id})" style="padding: 2px 8px; font-size: 11px;">
                                View / Print
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;

        } catch (e) {
            console.error("Execute find returns error:", e);
        }
    },

    loadSavedReturn: async function(id) {
        this.closeModal('posModalFindReturns');
        this.currentReturnId = id;
        this.printReceipt();
    },

    // -------------------------------------------------------------
    // HELPERS & MODAL CONTROLS
    // -------------------------------------------------------------
    openModal: function(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('show');
    },

    closeModal: function(id) {
        const m = document.getElementById(id);
        if (m) m.classList.remove('show');
    },

    escapeHtml: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(new RegExp('"', 'g'), '&quot;')
            .replace(new RegExp("'", 'g'), '&#039;');
    }
};

// Auto-initialize if DOM is ready
if (document.getElementById('pos_ret_inv_search')) {
    window.POSReturnModule.init();
}
