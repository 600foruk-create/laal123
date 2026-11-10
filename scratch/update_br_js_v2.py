import sys

file_path = r'C:\Users\Hamza\Desktop\1122\SOFTIFYXFINANCIALS\assets\js\bank_receipts.js'
with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# 1. Bind F4 key in init
old_init_f4 = '''                    if (e.ctrlKey && e.key === 's') {
                        e.preventDefault();
                        this.save();
                    } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {'''
new_init_f4 = '''                    if (e.ctrlKey && e.key === 's') {
                        e.preventDefault();
                        this.save();
                    } else if (e.key === 'F4') {
                        e.preventDefault();
                        const focusedId = document.activeElement ? document.activeElement.id : '';
                        const customerIds = ['br_received_from_code', 'br_received_from_name'];
                        if (customerIds.includes(focusedId) || document.activeElement?.closest('#brGridBody')) {
                            this.showPendingInvoices();
                        }
                    } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {'''
if old_init_f4 in content:
    content = content.replace(old_init_f4, new_init_f4)

# 2. Add click handler for br_invoice_suggest to init
old_init_click = '''            // Document click to hide any invoice suggest boxes
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.br-suggest') && !e.target.classList.contains('acc-code') && !e.target.classList.contains('br_received_from_code')) {
                    document.querySelectorAll('.br-suggest').forEach(s => s.style.display = 'none');
                }
            });'''
new_init_click = '''            // Document click to hide any invoice suggest boxes
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.br-suggest') && !e.target.classList.contains('acc-code') && !e.target.classList.contains('br_received_from_code')) {
                    document.querySelectorAll('.br-suggest').forEach(s => s.style.display = 'none');
                }
                const suggest = document.getElementById('br_invoice_suggest');
                if (suggest && !suggest.contains(e.target) && !e.target.classList.contains('inv-no')) {
                    suggest.style.display = 'none';
                }
            });'''
if old_init_click in content:
    content = content.replace(old_init_click, new_init_click)

# 3. Add ondblclick and this.setupRowInvoiceSearch in addRow
old_add_row = '''                    <td class="br-grid-cell" style="width: 90px; position:relative;">
                        <input type="text" class="br-grid-input inv-no" value="${data.invoice_no || ''}">
                    </td>
                    <td class="br-grid-cell" style="width: 95px;">
                        <input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="br-grid-input inv-date" value="${data.invoice_date || ''}">
                    </td>
                    <td class="br-grid-cell" style="width: 140px;"><input type="text" class="br-grid-input num rcvd-amt" value="${data.received_amount || ''}"></td>
                    <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                    <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num wht-amt" value="${data.wht_amount || ''}" readonly></td>
                    <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                    <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num gst-amt" value="${data.gst_amount || ''}" readonly></td>
                    <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                    <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num disc-given" value="${data.discount_given || ''}"></td>
                    <td class="br-grid-cell" style="width: auto;"><input type="text" class="br-grid-input num tot-credited" value="${data.total_credited || ''}" readonly></td>
                `;
            }'''
new_add_row = '''                    <td class="br-grid-cell" style="width: 90px; position:relative;">
                        <input type="text" class="br-grid-input inv-no" ondblclick="window.BRModule.showPendingInvoices()" value="${data.invoice_no || ''}">
                    </td>
                    <td class="br-grid-cell" style="width: 95px;">
                        <input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="br-grid-input inv-date" value="${data.invoice_date || ''}">
                    </td>
                    <td class="br-grid-cell" style="width: 140px;"><input type="text" class="br-grid-input num rcvd-amt" value="${data.received_amount || ''}"></td>
                    <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                    <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num wht-amt" value="${data.wht_amount || ''}" readonly></td>
                    <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                    <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num gst-amt" value="${data.gst_amount || ''}" readonly></td>
                    <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                    <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num disc-given" value="${data.discount_given || ''}"></td>
                    <td class="br-grid-cell" style="width: auto;"><input type="text" class="br-grid-input num tot-credited" value="${data.total_credited || ''}" readonly></td>
                `;
                this.setupRowInvoiceSearch(tr);
            }'''
if old_add_row in content:
    content = content.replace(old_add_row, new_add_row)

# 4. Insert new functions
new_functions = '''
    setupRowInvoiceSearch: function(tr) {
        const invInput = tr.querySelector('.inv-no');
        const suggest = document.getElementById('br_invoice_suggest');
        if (!invInput || !suggest) return;

        const handleSearch = async (val) => {
            if (!this.selectedReceivedFromCoaId) {
                alert("Please select a Received From customer account first.");
                invInput.value = '';
                return;
            }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const res = await fetch(`api/bank_receipts.php?action=search_invoices&customer_coa_id=${this.selectedReceivedFromCoaId}&q=${val}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data.length > 0) {
                    this.suggestIndex = -1;
                    const rect = invInput.getBoundingClientRect();
                    const containerRect = document.getElementById('bankReceiptContainer').getBoundingClientRect();
                    suggest.style.top = `${rect.bottom - containerRect.top}px`;
                    suggest.style.left = `${rect.left - containerRect.left}px`;
                    suggest.style.width = '250px';
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.BRModule.selectRowInvoice(this, '${item.serial_no}', '${item.invoice_date}', ${item.net_total})">
                             Invoice <b>#${item.serial_no}</b> &nbsp; (${item.invoice_date}) &nbsp; [${parseFloat(item.net_total).toFixed(2)}]
                        </div>
                    `).join('');
                    suggest.style.display = 'block';
                    suggest.style.zIndex = '99999';
                    // Store reference of active tr
                    suggest.activeTr = tr;
                } else { suggest.style.display = 'none'; }
            } catch (e) {}
        };

        invInput.addEventListener('focus', () => {
            handleSearch(invInput.value);
        });

        invInput.oninput = (e) => handleSearch(e.target.value);

        document.addEventListener('click', (e) => {
            if (!invInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
            }
        });
    },

    selectRowInvoice: function(el, serialNo, date, total) {
        const suggest = document.getElementById('br_invoice_suggest');
        const tr = suggest.activeTr;
        if (!tr) return;
        tr.querySelector('.inv-no').value = serialNo;
        tr.querySelector('.inv-date').value = date;
        tr.querySelector('.rcvd-amt').value = total.toFixed(2);
        suggest.style.display = 'none';
        this.calculateRow(tr);
    },

    showPendingInvoices: async function() {
        if (!this.selectedReceivedFromCoaId) {
            alert("Please select a Received From customer account first.");
            return;
        }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        let invoices = [];
        try {
            const res = await fetch(`api/bank_receipts.php?action=get_pending_invoices&customer_coa_id=${this.selectedReceivedFromCoaId}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.error) throw new Error(data.error);
            invoices = Array.isArray(data) ? data : [];
        } catch (e) { alert('Error loading pending invoices: ' + e.message); return; }

        const old = document.getElementById('br_pending_popup');
        if (old) old.remove();
        if (window._br_pending_keydown) {
            document.removeEventListener('keydown', window._br_pending_keydown);
            window._br_pending_keydown = null;
        }

        const customerName = document.getElementById('br_received_from_name')?.value || '';
        const customerCode = document.getElementById('br_received_from_code')?.value || '';

        const overlay = document.createElement('div');
        overlay.id = 'br_pending_popup';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const totalBalance = invoices.reduce((s, i) => s + parseFloat(i.balance_amount || 0), 0);

        overlay.innerHTML = `
        <div style="background:#fff;border-radius:6px;width:95%;max-width:960px;height:85vh;max-height:95vh;display:flex;flex-direction:column;font-family:'Segoe UI',sans-serif;box-shadow:0 10px 40px rgba(0,0,0,0.4);overflow:hidden;">
            <div style="background:#1f4668;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:15px;font-weight:700;letter-spacing:1px;">PENDING SALE INVOICES</div>
                    <div style="font-size:12px;opacity:0.85;margin-top:3px;">${customerCode} &nbsp; ${customerName}</div>
                </div>
                <button onclick="document.getElementById('br_pending_popup').remove(); if(window._br_pending_keydown) document.removeEventListener('keydown', window._br_pending_keydown);" style="background:rgba(255,255,255,0.15);border:none;color:white;font-size:20px;cursor:pointer;padding:2px 12px;border-radius:4px;">&times;</button>
            </div>
            <div style="overflow:auto;flex:1;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead>
                        <tr style="background:#1f4668;color:white;position:sticky;top:0;">
                            <th style="padding:4px 8px;text-align:left;width:100px;">Invoice No.</th>
                            <th style="padding:4px 8px;text-align:center;width:110px;">Invoice Date</th>
                            <th style="padding:4px 8px;text-align:right;width:140px;">Invoice Amount</th>
                            <th style="padding:4px 8px;text-align:right;width:110px;">Returns</th>
                            <th style="padding:4px 8px;text-align:right;width:130px;">Amount Received</th>
                            <th style="padding:4px 8px;text-align:right;width:120px;">W.H.Tax</th>
                            <th style="padding:4px 8px;text-align:right;width:130px;">Balance Amount</th>
                        </tr>
                    </thead>
                    <tbody id="br_pending_body">
                        ${invoices.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:15px;color:#64748b;font-size:13px;">No pending invoices found.</td></tr>' : invoices.map((inv, idx) => `
                        <tr class="br-pending-row"
                            data-inv-no="${inv.invoice_no || ''}" 
                            data-inv-date="${inv.invoice_date || ''}" 
                            data-bal="${inv.balance_amount || 0}"
                            ondblclick="window.BRModule.selectPendingInvoice('${inv.invoice_no || ''}', '${inv.invoice_date || ''}', ${inv.balance_amount || 0})" 
                            style="cursor:pointer;background:${idx%2===0?'#fff':'#f0f4f8'};border-bottom:1px solid #d1d9e0;color:#000;"
                        >
                            <td style="padding:3px 8px;">${inv.invoice_no || '-'}</td>
                            <td style="padding:3px 8px;text-align:center;">${inv.invoice_date || ''}</td>
                            <td style="padding:3px 8px;text-align:right;">${parseFloat(inv.invoice_amount||0).toFixed(2)}</td>
                            <td style="padding:3px 8px;text-align:right;">${parseFloat(inv.returns||0).toFixed(2)}</td>
                            <td style="padding:3px 8px;text-align:right;">${parseFloat(inv.amount_paid||0).toFixed(2)}</td>
                            <td style="padding:3px 8px;text-align:right;">${parseFloat(inv.taxes_paid||0).toFixed(2)}</td>
                            <td style="padding:3px 8px;text-align:right;font-weight:700;">${parseFloat(inv.balance_amount||0).toFixed(2)}</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background:#1f4668;color:white;font-weight:700;">
                            <td colspan="6" style="padding:5px 8px;text-align:right;font-size:12px;">Total Balance:</td>
                            <td style="padding:5px 8px;text-align:right;font-size:12px;">${totalBalance.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="padding:6px 16px;font-size:11px;color:#1f4668;background:#eaf1f8;border-top:2px solid #1f4668;font-weight:600;">
                <b>Double-click</b> or press <b>Enter</b> on any row to fill it into the receipt grid. Use <b>Up/Down</b> arrows to navigate.
            </div>
        </div>`;

        document.body.appendChild(overlay);

        let selectedIndex = 0;
        const rows = overlay.querySelectorAll('.br-pending-row');
        
        const updateSelection = () => {
            rows.forEach((r, i) => {
                if (i === selectedIndex) {
                    r.style.background = '#000';
                    r.style.color = '#fff';
                } else {
                    r.style.background = i % 2 === 0 ? '#fff' : '#f0f4f8';
                    r.style.color = '#000';
                }
            });
            if (rows[selectedIndex]) {
                rows[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        };

        if (rows.length > 0) {
            updateSelection();
            
            rows.forEach((r, i) => {
                r.addEventListener('mouseover', () => {
                    selectedIndex = i;
                    updateSelection();
                });
            });

            window._br_pending_keydown = (e) => {
                if (!document.getElementById('br_pending_popup')) {
                    document.removeEventListener('keydown', window._br_pending_keydown);
                    window._br_pending_keydown = null;
                    return;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selectedIndex < rows.length - 1) selectedIndex++;
                    updateSelection();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedIndex > 0) selectedIndex--;
                    updateSelection();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const selRow = rows[selectedIndex];
                    if (selRow) {
                        window.BRModule.selectPendingInvoice(
                            selRow.getAttribute('data-inv-no'),
                            selRow.getAttribute('data-inv-date'),
                            selRow.getAttribute('data-bal')
                        );
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    document.getElementById('br_pending_popup').remove();
                    document.removeEventListener('keydown', window._br_pending_keydown);
                    window._br_pending_keydown = null;
                }
            };
            document.addEventListener('keydown', window._br_pending_keydown);
        }

        overlay.addEventListener('click', (e) => { 
            if (e.target === overlay) {
                overlay.remove(); 
                if (window._br_pending_keydown) {
                    document.removeEventListener('keydown', window._br_pending_keydown);
                    window._br_pending_keydown = null;
                }
            }
        });
    },

    selectPendingInvoice: function(serialNo, date, total) {
        const gridBody = document.getElementById('brGridBody');
        if (!gridBody) return;
        const rows = gridBody.querySelectorAll('tr');
        let targetRow = null;
        for (let i = 0; i < rows.length; i++) {
            const invInput = rows[i].querySelector('.inv-no');
            if (invInput && invInput.value.trim() === '') {
                targetRow = rows[i];
                break;
            }
        }
        if (!targetRow) {
            this.addRow({}, 'Customer');
            targetRow = gridBody.lastElementChild;
        }
        if (targetRow) {
            targetRow.querySelector('.inv-no').value = serialNo;
            targetRow.querySelector('.inv-date').value = date;
            targetRow.querySelector('.rcvd-amt').value = parseFloat(total).toFixed(2);
            this.calculateRow(targetRow);
            
            const popup = document.getElementById('br_pending_popup');
            if (popup) {
                popup.remove();
                if (window._br_pending_keydown) {
                    document.removeEventListener('keydown', window._br_pending_keydown);
                    window._br_pending_keydown = null;
                }
            }
        }
    },
'''

if 'showPendingInvoices: async function' not in content:
    content = content.replace("calculateRow: function(tr) {", new_functions + "\\n    calculateRow: function(tr) {")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated bank_receipts.js')
