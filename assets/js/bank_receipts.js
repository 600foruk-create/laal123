// --- BANK RECEIPTS MODULE LOGIC ---
window.BRModule = {
    jobs: [],
    employees: [],
    currentId: null,
    selectedCashCoaId: null,
    selectedReceivedFromCoaId: null,
    suggestIndex: -1,

    init: async function() {
        console.log("BR Module: Initializing...");
        try {
            this.resetForm(true);
            await this.loadJobs();
            await this.loadEmployees();
            await this.loadAdjustmentAccounts();
            
            this.setupSmartSearch('br_cash_code', 'br_cash_name', 'br_cash_suggest', 'search_bank_accounts', 'cash');
            this.setupSmartSearch('br_received_from_code', 'br_received_from_name', 'br_received_from_suggest', 'search_parties', 'received_from');
            
            const gridBody = document.getElementById('brGridBody');
            if (gridBody) {
                gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            }
            
            // Centralized keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    this.save();
                } else if (e.key === 'F4') {
                    e.preventDefault();
                    const focusedId = document.activeElement ? document.activeElement.id : '';
                    const customerIds = ['br_received_from_code', 'br_received_from_name'];
                    if (customerIds.includes(focusedId) || document.activeElement?.closest('#brGridBody')) {
                        this.showPendingInvoices();
                    }
                } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    const selectedRow = document.querySelector('#brGridBody tr.selected-row');
                    if (selectedRow) {
                        selectedRow.remove();
                        this.calculateTotals();
                    }
                }
                if (e.key === 'Enter' && !e.target.classList.contains('br-grid-input')) {
                    const masterSequence = ['br_date', 'br_job_id', 'br_employee_id', 'br_cash_code', 'br_cash_name', 'br_cheque_no', 'br_drawn_on_bank', 'br_cheque_date', 'br_received_from_code', 'br_received_from_name'];
                    if (masterSequence.includes(e.target.id)) {
                        e.preventDefault();
                        const index = masterSequence.indexOf(e.target.id);
                        if (index < masterSequence.length - 1) {
                            const next = document.getElementById(masterSequence[index + 1]);
                            if (next) next.focus();
                        } else {
                            const firstGridInput = document.querySelector('#brGridBody input:not([readonly]):not([type="hidden"])');
                            if (firstGridInput) firstGridInput.focus();
                        }
                    }
                }
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.row-selector')) {
                    document.querySelectorAll('#brGridBody tr').forEach((r) => {
                        r.classList.remove('selected-row');
                        r.style.backgroundColor = 'transparent';
                        const s = r.querySelector('.row-selector');
                        if (s) s.innerHTML = s.getAttribute('data-idx');
                    });
                }
            });
        } catch (err) { console.error("BR Module Init Error:", err); }
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('br-grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('brGridBody');
        const suggest = tr.querySelector('.row-suggest') || document.getElementById('br_invoice_suggest');

        // Handle suggestion box keyboard nav
        if (suggest && suggest.style.display === 'block') {
            const items = suggest.querySelectorAll('div');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.suggestIndex = Math.min(this.suggestIndex + 1, items.length - 1);
                this.updateSuggestHighlight(items);
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.suggestIndex = Math.max(this.suggestIndex - 1, 0);
                this.updateSuggestHighlight(items);
                return;
            } else if (e.key === 'Enter' && this.suggestIndex > -1) {
                e.preventDefault();
                items[this.suggestIndex].click();
                return;
            }
        }

        // Grid Navigation
        const getVisibleRowInputs = (row) => Array.from(row.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
        const getAllVisibleInputs = () => Array.from(gridBody.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
        const rowInputs = getVisibleRowInputs(tr);
        const colIdx = rowInputs.indexOf(target);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextRowInputs = getVisibleRowInputs(nextTr);
                if (nextRowInputs[colIdx]) nextRowInputs[colIdx].focus();
            } else {
                this.addRow();
                setTimeout(() => {
                    const newTr = tr.nextElementSibling;
                    if (newTr) {
                        const newRowInputs = getVisibleRowInputs(newTr);
                        if (newRowInputs[colIdx]) newRowInputs[colIdx].focus();
                    }
                }, 50);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevRowInputs = getVisibleRowInputs(prevTr);
                if (prevRowInputs[colIdx]) prevRowInputs[colIdx].focus();
            }
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
            if (e.key === 'Enter' || (e.key === 'ArrowRight' && isFullySelected)) {
                e.preventDefault();
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index < allInputs.length - 1) {
                    allInputs[index + 1].focus();
                } else if (e.key === 'Enter') {
                    this.addRow();
                    setTimeout(() => {
                        const newInputs = getAllVisibleInputs();
                        if (newInputs[index + 1]) newInputs[index + 1].focus();
                    }, 50);
                }
            }
        } else if (e.key === 'ArrowLeft') {
            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
            if (isFullySelected) {
                e.preventDefault();
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index > 0) allInputs[index - 1].focus();
            }
        }
    },

    loadJobs: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/jobs.php?action=get_jobs&company_id=${session.company_id || 1}`);
            this.jobs = await res.json();
            const select = document.getElementById('br_job_id');
            if (select) {
                select.innerHTML = '<option value="">Select Job</option>';
                this.jobs.forEach(j => select.innerHTML += `<option value="${j.id}">${j.job_no} - ${j.description}</option>`);
            }
        } catch (e) {}
    },

    loadEmployees: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${session.company_id || 1}`);
            this.employees = await res.json();
            const select = document.getElementById('br_employee_id');
            if (select) {
                select.innerHTML = '<option value="">Select Employee</option>';
                this.employees.forEach(e => select.innerHTML += `<option value="${e.id}">${e.name}</option>`);
            }
        } catch (e) {}
    },

    loadAdjustmentAccounts: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/bank_receipts.php?action=search_grid_accounts&company_id=${session.company_id || 1}&q=`);
            const accounts = await res.json();
            const select = document.getElementById('br_adj_debit_to');
            if (select) {
                select.innerHTML = '<option value="">Select Account</option>';
                accounts.forEach(acc => select.innerHTML += `<option value="${acc.id}">${acc.code} - ${acc.name}</option>`);
            }
        } catch (e) {}
    },

    setupSmartSearch: function(codeId, nameId, suggestId, apiAction, type) {
        const codeInput = document.getElementById(codeId);
        const nameInput = document.getElementById(nameId);
        const suggest = document.getElementById(suggestId);
        if (!codeInput || !nameInput || !suggest) return;

        const handleSearch = async (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const res = await fetch(`api/bank_receipts.php?action=${apiAction}&q=${val}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data.length > 0) {
                    this.suggestIndex = -1;
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.BRModule.selectAccount('${type}', ${item.id}, '${item.code}', '${item.name}')">
                             <b>${item.code}</b> &nbsp; ${item.name}
                        </div>
                    `).join('');
                    suggest.style.display = 'block';
                    suggest.style.zIndex = '9999';
                } else { suggest.style.display = 'none'; }
            } catch (e) {}
        };

        const setupEvents = (inp) => {
            inp.addEventListener('focus', () => {
                if (inp.value) handleSearch(inp.value);
            });
            inp.addEventListener('blur', () => {
                setTimeout(() => { suggest.style.display = 'none'; }, 200);
            });
            inp.addEventListener('keydown', (e) => {
                if (suggest.style.display === 'block') {
                    const items = suggest.querySelectorAll('div');
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.suggestIndex = Math.min(this.suggestIndex + 1, items.length - 1);
                        this.updateSuggestHighlight(items);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.suggestIndex = Math.max(this.suggestIndex - 1, 0);
                        this.updateSuggestHighlight(items);
                    } else if (e.key === 'Enter' && this.suggestIndex > -1) {
                        e.preventDefault();
                        items[this.suggestIndex].click();
                    }
                }
            });
        };

        setupEvents(nameInput);
        setupEvents(codeInput);

        nameInput.oninput = (e) => handleSearch(e.target.value);
        codeInput.oninput = (e) => handleSearch(e.target.value);

        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                this.suggestIndex = -1;
            }
        });
    },

    updateSuggestHighlight: function(items) {
        items.forEach((item, idx) => {
            if (idx === this.suggestIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    },

    selectAccount: function(type, id, code, name) {
        if (type === 'cash') {
            this.selectedCashCoaId = id;
            document.getElementById('br_cash_code').value = code;
            document.getElementById('br_cash_name').value = name;
            document.getElementById('br_cash_suggest').style.display = 'none';
            this.fetchBalance(id, 'br_cash_balance');
        } else {
            this.selectedReceivedFromCoaId = id;
            document.getElementById('br_received_from_code').value = code;
            document.getElementById('br_received_from_name').value = name;
            document.getElementById('br_received_from_suggest').style.display = 'none';
            this.fetchBalance(id, 'br_received_from_balance');
            
            // Automatically clear table and reload rows
            const typeEl = document.querySelector('input[name="br_type"]:checked');
            this.updateReceivedFromLabel(typeEl ? typeEl.value : 'Customer');
        }
    },

    fetchBalance: async function(coaId, targetId) {
        if (!coaId) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const balEl = document.getElementById(targetId);
        if (balEl) balEl.value = '...';
        try {
            const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${coaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
            const data = await res.json();
            if (balEl) {
                const bal = parseFloat(data.balance || 0);
                if (bal > 0) {
                    balEl.value = Math.abs(bal).toFixed(2) + ' Dr';
                    balEl.style.color = '#1e3a8a';
                } else if (bal < 0) {
                    balEl.value = Math.abs(bal).toFixed(2) + ' Cr';
                    balEl.style.color = 'red';
                } else {
                    balEl.value = '0.00';
                    balEl.style.color = '#1e3a8a';
                }
            }
        } catch (e) { 
            if (balEl) {
                balEl.value = '0.00'; 
                balEl.style.color = '#1e3a8a';
            }
        }
    },

    updateReceivedFromLabel: function(type) {
        try {
            const gridBody = document.getElementById('brGridBody');
            const lbl = document.getElementById('lbl_received_from');
            if (lbl) lbl.textContent = type === 'Petty' ? 'Received From (Petty)' : 'Received From';
            
            const customerRow = document.getElementById('customerReceivedFromRow');
            if (customerRow) customerRow.style.display = type === 'Petty' ? 'none' : 'grid';

            document.getElementById('brGridTitle').style.display = type === 'Petty' ? 'none' : 'block';
            document.getElementById('brCustomerFooter').style.display = type === 'Petty' ? 'none' : 'block';
            document.getElementById('brPettyFooter').style.display = type === 'Petty' ? 'block' : 'none';
            document.getElementById('brCustomerHeader').style.display = type === 'Petty' ? 'none' : '';
            document.getElementById('brPettyHeader').style.display = type === 'Petty' ? '' : 'none';

            if (gridBody) {
                gridBody.innerHTML = '';
                for (let i = 0; i < 18; i++) { this.addRow({}, type); }
            }
            this.calculateTotals();
        } catch (err) {}
    },

    resetForm: function(isNew = false) {
        this.currentId = null;
        this.is_posted = 0;
        this.selectedCashCoaId = null;
        this.selectedReceivedFromCoaId = null;
        const ids = ['br_sn', 'br_date', 'br_job_id', 'br_employee_id', 'br_cash_code', 'br_cash_name', 'br_cash_balance', 'br_cheque_no', 'br_drawn_on_bank', 'br_cheque_date', 'br_received_from_code', 'br_received_from_name', 'br_received_from_balance', 'br_prepayment', 'br_remarks', 'br_total_advance', 'br_total_received', 'br_total_wht', 'br_total_gst', 'br_total_adj', 'br_total_disc', 'br_grand_total_customer', 'br_grand_total_petty', 'br_grand_total'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        
        const selectAdj = document.getElementById('br_adj_debit_to');
        if (selectAdj) selectAdj.selectedIndex = 0;

        const cancel = document.getElementById('br_is_cancelled');
        if (cancel) cancel.checked = false;
        this.updateCancellationUI();
        
        const typeEl = document.querySelector('input[name="br_type"]:checked');
        const currentType = typeEl ? typeEl.value : 'Customer';
        if (!typeEl) {
            const cCheck = document.querySelector('input[name="br_type"][value="Customer"]');
            if (cCheck) cCheck.checked = true;
        }
        this.updateReceivedFromLabel(currentType);

        if (isNew) {
            const dateEl = document.getElementById('br_date');
            if (dateEl) { dateEl.value = new Date().toISOString().split('T')[0]; dateEl.focus(); }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            fetch(`api/bank_receipts.php?action=get_next_serial&company_id=${session.company_id || 1}`)
                .then(r => r.json()).then(d => { document.getElementById('br_sn').value = d.next_sn; })
                .catch(() => { document.getElementById('br_sn').value = '1'; });
        }
    },

    addRow: function(data = {}, type = null) {
        try {
            const tbody = document.getElementById('brGridBody');
            if (!tbody) return;
            if (!type) {
                const typeEl = document.querySelector('input[name="br_type"]:checked');
                type = typeEl ? typeEl.value : 'Customer';
            }
            const idx = tbody.children.length;
            const tr = tbody.insertRow();
            tr.style.height = '20px';

            if (type === 'Petty') {
                tr.innerHTML = `
                    <td class="row-selector" data-idx="${idx + 1}" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; cursor: pointer;">${idx + 1}</td>
                    <td class="br-grid-cell" style="width: 100px; position:relative;">
                        <input type="text" class="br-grid-input acc-code" value="${data.coa_code || ''}">
                        <div class="br-suggest row-suggest" style="width:350px; top:24px;"></div>
                    </td>
                    <td class="br-grid-cell" style="width: 250px;">
                        <input type="text" class="br-grid-input acc-name" value="${data.coa_name || ''}">
                        <input type="hidden" class="row-coa-id" value="${data.coa_id || ''}">
                    </td>
                    <td class="br-grid-cell" style="width: 1fr;"><input type="text" class="br-grid-input desc" value="${data.description || ''}"></td>
                    <td class="br-grid-cell" style="width: 110px;"><input type="text" class="br-grid-input num petty-amt" value="${data.received_amount !== undefined && data.received_amount !== null && data.received_amount !== '' ? data.received_amount : ''}"></td>
                `;
                this.setupRowSmartSearch(tr);
            } else {
                tr.innerHTML = `
                    <td class="row-selector" data-idx="${idx + 1}" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; cursor: pointer;">${idx + 1}</td>
                    <td class="br-grid-cell" style="width: 90px; position:relative;">
                        <input type="text" class="br-grid-input inv-no" ondblclick="window.BRModule.showPendingInvoices()" value="${data.invoice_no || ''}">
                    </td>
                    <td class="br-grid-cell" style="width: 95px;"><input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="br-grid-input inv-date" value="${data.invoice_date || ''}"></td>
                    <td class="br-grid-cell" style="width: 140px;"><input type="text" class="br-grid-input num received-amt" value="${data.received_amount !== undefined && data.received_amount !== null && data.received_amount !== '' ? data.received_amount : ''}"></td>
                    <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                    <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num wht-amt" value="${data.wht_amount || ''}"></td>
                    <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                    <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num gst-amt" value="${data.gst_amount || ''}"></td>
                    <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                    <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num disc-given" value="${data.discount_given || ''}"></td>
                    <td class="br-grid-cell" style="width: auto;"><input type="text" class="br-grid-input num tot-credited" value="${data.total_credited !== undefined && data.total_credited !== null && data.total_credited !== '' ? data.total_credited : ''}"></td>
                `;
                this.setupRowInvoiceSearch(tr);
            }

            tr.querySelectorAll('input').forEach(input => {
                input.addEventListener('focus', () => {
                    if (input.classList.contains('num')) {
                        if (parseFloat(input.value) === 0) input.value = '';
                        else input.select();
                    } else {
                        input.select();
                    }
                });
                input.addEventListener('click', () => {
                    input.select();
                });
                input.addEventListener('blur', () => {
                    if (input.classList.contains('num') && input.value.trim() === '') {
                        input.value = '0.00';
                    }
                });
            });

            tr.querySelectorAll('input.num').forEach(input => {
                input.oninput = (e) => this.calculateRow(tr, e.target);
            });
        } catch (e) { console.error("Add Row Error:", e); }
    },

    setupRowSmartSearch: function(tr) {
        const codeInput = tr.querySelector('.acc-code');
        const nameInput = tr.querySelector('.acc-name');
        const suggest = tr.querySelector('.row-suggest');
        if (!nameInput || !codeInput || !suggest) return;

        const handleSearch = async (val) => {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const q = val || '';
                const res = await fetch(`api/bank_receipts.php?action=search_grid_accounts&q=${q}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    this.suggestIndex = -1;
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.BRModule.selectRowAccount(this, ${item.id}, '${item.code}', '${item.name}')">
                             <b>${item.code}</b> &nbsp; ${item.name}
                        </div>
                    `).join('');
                    suggest.style.display = 'block';
                    suggest.style.zIndex = '9999';
                } else { suggest.style.display = 'none'; }
            } catch (e) {}
        };

        const setupEvents = (inp) => {
            inp.addEventListener('focus', () => {
                handleSearch(inp.value);
            });
            inp.addEventListener('blur', () => {
                setTimeout(() => { suggest.style.display = 'none'; }, 200);
            });
        };

        setupEvents(nameInput);
        setupEvents(codeInput);

        nameInput.oninput = (e) => handleSearch(e.target.value);
        codeInput.oninput = (e) => handleSearch(e.target.value);

        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                this.suggestIndex = -1;
            }
        });
    },

    selectRowAccount: function(el, id, code, name) {
        const tr = el.closest('tr');
        if (!tr) return;
        tr.querySelector('.acc-code').value = code;
        const nameInp = tr.querySelector('.acc-name');
        nameInp.value = name;
        tr.querySelector('.row-coa-id').value = id;
        tr.querySelector('.row-suggest').style.display = 'none';
        
        nameInp.focus();
        nameInp.select();
    },

    
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
        tr.querySelector('.received-amt').value = parseFloat(total || 0).toFixed(2);
        tr.querySelector('.tot-credited').value = parseFloat(total || 0).toFixed(2);
        suggest.style.display = 'none';
        this.calculateRow(tr, tr.querySelector('.received-amt'));
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
            targetRow.querySelector('.received-amt').value = parseFloat(total).toFixed(2);
            targetRow.querySelector('.tot-credited').value = parseFloat(total).toFixed(2);
            this.calculateRow(targetRow, targetRow.querySelector('.received-amt'));
            
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
    calculateRow: function(tr, targetInput) {
        const typeEl = document.querySelector('input[name="br_type"]:checked');
        const type = typeEl ? typeEl.value : 'Customer';
        if (type === 'Petty') { this.calculateTotals(); return; }
        
        const recEl = tr.querySelector('.received-amt');
        const whtRateEl = tr.querySelector('.wht-rate');
        const whtAmtEl = tr.querySelector('.wht-amt');
        const gstRateEl = tr.querySelector('.gst-rate');
        const gstAmtEl = tr.querySelector('.gst-amt');
        const advAdjEl = tr.querySelector('.adv-adj');
        const discEl = tr.querySelector('.disc-given');
        const totEl = tr.querySelector('.tot-credited');

        const triggerClass = targetInput && targetInput.classList ? targetInput.className : '';
        const isTrigger = (cls) => triggerClass.includes(cls);

        let rec = parseFloat(recEl.value) || 0;
        let whtR = parseFloat(whtRateEl.value) || 0;
        let whtA = parseFloat(whtAmtEl.value) || 0;
        let gstR = parseFloat(gstRateEl.value) || 0;
        let gstA = parseFloat(gstAmtEl.value) || 0;
        let adj = parseFloat(advAdjEl.value) || 0;
        let disc = parseFloat(discEl.value) || 0;
        let tot = parseFloat(totEl.value) || 0;

        // When user types WHT Rate %:
        // WHT Amount = (Gross * WHT Rate) / 100
        // Cheque Receipt = Gross - WHT Amount - GST Amount - Adj - Disc
        if (isTrigger('wht-rate')) {
            const gross = (tot > 0) ? tot : (rec > 0 ? rec : 0);
            if (gross > 0) {
                whtA = (gross * whtR) / 100;
                whtAmtEl.value = whtA !== 0 ? whtA.toFixed(2) : '';
                rec = gross - whtA - gstA - adj - disc;
                recEl.value = rec !== 0 ? rec.toFixed(2) : '0.00';
                tot = gross;
                totEl.value = tot !== 0 ? tot.toFixed(2) : '';
            }
        }
        // When user types WHT Amount directly:
        else if (isTrigger('wht-amt')) {
            // W.H.T. Rate % is NOT changed, but Cheque Receipt for Amt is adjusted so calculation is correct
            const gross = (tot > 0) ? tot : (rec + whtA);
            if (gross > 0) {
                rec = gross - whtA - gstA - adj - disc;
                recEl.value = rec !== 0 ? rec.toFixed(2) : '0.00';
                tot = gross;
                totEl.value = tot !== 0 ? tot.toFixed(2) : '';
            }
        }
        // When user types GST Rate %:
        else if (isTrigger('gst-rate')) {
            const gross = (tot > 0) ? tot : (rec > 0 ? rec : 0);
            if (gross > 0) {
                gstA = (gross * gstR) / 100;
                gstAmtEl.value = gstA !== 0 ? gstA.toFixed(2) : '';
                rec = gross - whtA - gstA - adj - disc;
                recEl.value = rec !== 0 ? rec.toFixed(2) : '0.00';
                tot = gross;
                totEl.value = tot !== 0 ? tot.toFixed(2) : '';
            }
        }
        // When user types GST Amount directly:
        else if (isTrigger('gst-amt')) {
            // G.S.T. Rate % is NOT changed, but Cheque Receipt for Amt is adjusted so calculation is correct
            const gross = (tot > 0) ? tot : (rec + gstA);
            if (gross > 0) {
                rec = gross - whtA - gstA - adj - disc;
                recEl.value = rec !== 0 ? rec.toFixed(2) : '0.00';
                tot = gross;
                totEl.value = tot !== 0 ? tot.toFixed(2) : '';
            }
        }
        // When user types Total Credited directly:
        else if (isTrigger('tot-credited')) {
            // Do not auto-change other columns, only update footer totals
        }
        // When user types Advance Adj or Discount:
        else if (isTrigger('adv-adj') || isTrigger('disc-given')) {
            if (tot > 0) {
                rec = tot - whtA - gstA - adj - disc;
                recEl.value = rec !== 0 ? rec.toFixed(2) : '0.00';
            } else {
                tot = rec + whtA + gstA + adj + disc;
                totEl.value = tot !== 0 ? tot.toFixed(2) : '';
            }
        }
        // When user types Cheque Receipt for Amt (or initial default / invoice select):
        else {
            tot = rec + whtA + gstA + adj + disc;
            totEl.value = tot !== 0 ? tot.toFixed(2) : '';
        }
        
        this.calculateTotals();
    },

    calculateTotals: function() {
        try {
            const typeEl = document.querySelector('input[name="br_type"]:checked');
            const type = typeEl ? typeEl.value : 'Customer';
            let grandTotal = 0;
            
            if (type === 'Petty') {
                let tAmt = 0;
                document.querySelectorAll('#brGridBody tr').forEach(tr => {
                    const inp = tr.querySelector('.petty-amt');
                    if (inp) tAmt += parseFloat(inp.value) || 0;
                });
                grandTotal = tAmt;
                const pettyTotalEl = document.getElementById('br_grand_total_petty');
                if (pettyTotalEl) pettyTotalEl.value = tAmt.toFixed(2);
            } else {
                let tRec = 0, tWht = 0, tGst = 0, tAdj = 0, tDisc = 0, tTotal = 0;
                document.querySelectorAll('#brGridBody tr').forEach(tr => {
                    const r = tr.querySelector('.received-amt'), 
                          w = tr.querySelector('.wht-amt'), 
                          g = tr.querySelector('.gst-amt'), 
                          a = tr.querySelector('.adv-adj'), 
                          d = tr.querySelector('.disc-given'), 
                          t = tr.querySelector('.tot-credited');
                    if (r) tRec += parseFloat(r.value) || 0;
                    if (w) tWht += parseFloat(w.value) || 0;
                    if (g) tGst += parseFloat(g.value) || 0;
                    if (a) tAdj += parseFloat(a.value) || 0;
                    if (d) tDisc += parseFloat(d.value) || 0;
                    if (t) tTotal += parseFloat(t.value) || 0;
                });
                
                const prepayment = parseFloat(document.getElementById('br_prepayment')?.value || 0) || 0;
                const totalAdvanceEl = document.getElementById('br_total_advance');
                if (totalAdvanceEl) totalAdvanceEl.value = prepayment.toFixed(2);
                
                grandTotal = tTotal + prepayment;

                // br_total_received is under the "CHEQUE RECEIPT FOR AMT." column footer!
                const totalRecEl = document.getElementById('br_total_received');
                if (totalRecEl) totalRecEl.value = tRec.toFixed(2);

                const totalWhtEl = document.getElementById('br_total_wht');
                if (totalWhtEl) totalWhtEl.value = tWht.toFixed(2);

                const totalGstEl = document.getElementById('br_total_gst');
                if (totalGstEl) totalGstEl.value = tGst.toFixed(2);

                const totalAdjEl = document.getElementById('br_total_adj');
                if (totalAdjEl) totalAdjEl.value = tAdj.toFixed(2);

                const totalDiscEl = document.getElementById('br_total_disc');
                if (totalDiscEl) totalDiscEl.value = tDisc.toFixed(2);
                
                // br_grand_total_customer is under "TOTAL CREDITED TO PARTY" column footer!
                const grandTotalCustEl = document.getElementById('br_grand_total_customer');
                if (grandTotalCustEl) grandTotalCustEl.value = grandTotal.toFixed(2);
            }
            
            const grandTotalEl = document.getElementById('br_grand_total');
            if (grandTotalEl) grandTotalEl.value = grandTotal.toFixed(2);

            const amtWordsEl = document.getElementById('br_amt_words');
            if (amtWordsEl) amtWordsEl.innerText = `Rupees ${this.numberToWords(grandTotal)} only.`;
        } catch (e) {
            console.error("calculateTotals error:", e);
        }
    },

    numberToWords: function(num) {
        if (!num || isNaN(num) || num === 0) return "zero and 00/100";
        const isNegative = num < 0;
        const absNum = Math.abs(num);
        const parts = absNum.toFixed(2).split('.');
        const numVal = parseInt(parts[0]);
        if (numVal === 0) return (isNegative ? 'Minus ' : '') + `zero and ${parts[1]}/100`;

        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        const scales = ['', 'thousand', 'million', 'billion'];

        function convertSection(n) {
            let str = '';
            if (n >= 100) {
                str += ones[Math.floor(n / 100)] + ' hundred ';
                n %= 100;
            }
            if (n >= 20) {
                str += tens[Math.floor(n / 10)] + ' ';
                n %= 10;
            }
            if (n > 0) {
                str += ones[n] + ' ';
            }
            return str.trim();
        }

        let temp = numVal;
        let scaleIdx = 0;
        let words = '';

        while (temp > 0) {
            const sec = temp % 1000;
            if (sec > 0) {
                words = convertSection(sec) + (scales[scaleIdx] ? ' ' + scales[scaleIdx] : '') + ' ' + words;
            }
            temp = Math.floor(temp / 1000);
            scaleIdx++;
        }

        return (isNegative ? 'Minus ' : '') + `${words.trim()} and ${parts[1]}/100`;
    },

    save: async function() {
        const typeEl = document.querySelector('input[name="br_type"]:checked');
        const type = typeEl ? typeEl.value : 'Customer';
        
        if (!this.selectedCashCoaId) { alert("Please select Bank Account."); return; }
        
        const items = [];
        document.querySelectorAll('#brGridBody tr').forEach(tr => {
            if (type === 'Petty') {
                const amt = parseFloat(tr.querySelector('.petty-amt').value) || 0;
                const coaId = tr.querySelector('.row-coa-id').value;
                if (amt !== 0 && coaId) {
                    items.push({ 
                        coa_id: coaId, 
                        description: tr.querySelector('.desc').value, 
                        received_amount: amt, 
                        total_credited: amt 
                    });
                }
            } else {
                const rec = parseFloat(tr.querySelector('.received-amt').value) || 0;
                if (rec !== 0) {
                    items.push({ 
                        invoice_no: tr.querySelector('.inv-no').value, 
                        invoice_date: tr.querySelector('.inv-date').value, 
                        received_amount: rec, 
                        wht_rate: parseFloat(tr.querySelector('.wht-rate').value) || 0, 
                        wht_amount: parseFloat(tr.querySelector('.wht-amt').value) || 0, 
                        gst_rate: parseFloat(tr.querySelector('.gst-rate').value) || 0, 
                        gst_amount: parseFloat(tr.querySelector('.gst-amt').value) || 0, 
                        advance_adjusted: parseFloat(tr.querySelector('.adv-adj').value) || 0, 
                        discount_given: parseFloat(tr.querySelector('.disc-given').value) || 0, 
                        total_credited: parseFloat(tr.querySelector('.tot-credited').value) || 0 
                    });
                }
            }
        });
        
        if (items.length === 0) { alert("Please add at least one item."); return; }
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const payload = { 
            id: this.currentId, 
            serial_no: document.getElementById('br_sn').value, 
            receipt_date: document.getElementById('br_date').value, 
            receipt_type: type, 
            bank_account_coa_id: this.selectedCashCoaId, 
            cheque_no: document.getElementById('br_cheque_no').value,
            cheque_date: document.getElementById('br_cheque_date').value,
            drawn_on_bank: document.getElementById('br_drawn_on_bank').value,
            received_from_coa_id: this.selectedReceivedFromCoaId || null, 
            job_id: document.getElementById('br_job_id').value || null, 
            employee_id: document.getElementById('br_employee_id').value || null, 
            prepayment_advance: parseFloat(document.getElementById('br_prepayment').value) || 0, 
            remarks: document.getElementById('br_remarks').value, 
            is_cancelled: document.getElementById('br_is_cancelled').checked ? 1 : 0,
            total_amount: parseFloat(document.getElementById('br_grand_total').value) || 0,
            amount_in_words: document.getElementById('br_amt_words').innerText.replace('Rupees ', '').replace(' only.', ''),
            items: items 
        };
        
        try {
            const res = await fetch(`api/bank_receipts.php?action=save&company_id=${session.company_id || 1}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            const result = await res.json();
            if (result && result.status === 'success') { 
                alert("Saved Successfully!"); 
                this.resetForm(true); 
            } else { 
                alert("Error: " + (result.message || result.error || "Unknown server error")); 
            }
        } catch (e) { 
            console.error("Save Error:", e);
            alert("Save Failed!"); 
        }
    },

    edit: async function(id) {
        try {
            const res = await fetch(`api/bank_receipts.php?action=get&id=${id}`);
            const data = await res.json();
            if (data && data.id) this.loadData(data);
        } catch (e) {}
    },

    loadData: function(data) {
        this.currentId = data.id;
        const typeEl = document.querySelector(`input[name="br_type"][value="${data.receipt_type}"]`);
        if (typeEl) typeEl.checked = true;
        this.updateReceivedFromLabel(data.receipt_type);
        
        document.getElementById('br_sn').value = data.serial_no;
        document.getElementById('br_date').value = data.receipt_date;
        document.getElementById('br_job_id').value = data.job_id || '';
        document.getElementById('br_employee_id').value = data.employee_id || '';
        document.getElementById('br_cash_code').value = data.bank_account ? data.bank_account.code : '';
        document.getElementById('br_cash_name').value = data.bank_account ? data.bank_account.name : '';
        document.getElementById('br_cheque_no').value = data.cheque_no || '';
        document.getElementById('br_drawn_on_bank').value = data.drawn_on_bank || '';
        document.getElementById('br_cheque_date').value = data.cheque_date || '';
        
        document.getElementById('br_received_from_code').value = data.received_from ? data.received_from.code : '';
        document.getElementById('br_received_from_name').value = data.received_from ? data.received_from.name : '';
        document.getElementById('br_prepayment').value = data.prepayment_advance;
        document.getElementById('br_remarks').value = data.remarks;
        document.getElementById('br_is_cancelled').checked = parseInt(data.is_cancelled) === 1;
        this.is_posted = parseInt(data.is_posted ?? 1) === 1;
        
        this.updateCancellationUI();
        
        this.selectedCashCoaId = data.bank_account_coa_id;
        this.selectedReceivedFromCoaId = data.received_from_coa_id;
        
        this.fetchBalance(data.bank_account_coa_id, 'br_cash_balance');
        if (data.received_from_coa_id) this.fetchBalance(data.received_from_coa_id, 'br_received_from_balance');
        
        const tbody = document.getElementById('brGridBody');
        tbody.innerHTML = '';
        data.items.forEach(item => this.addRow(item, data.receipt_type));
        while (tbody.children.length < 18) { this.addRow({}, data.receipt_type); }
        this.calculateTotals();
    },

    updateCancellationUI: function() {
        const isCancelled = document.getElementById('br_is_cancelled')?.checked;
        const isPosted = this.is_posted;
        const isReadOnly = isPosted;

        const cancelledStamp = document.getElementById('br_cancelled_stamp');
        const unpostedStamp = document.getElementById('br_unposted_stamp');
        const postedStamp = document.getElementById('br_posted_stamp');
        
        if (cancelledStamp) cancelledStamp.style.display = isCancelled ? 'block' : 'none';
        if (postedStamp) postedStamp.style.display = (!isCancelled && this.currentId && isPosted) ? 'block' : 'none';
        if (unpostedStamp) unpostedStamp.style.display = (!isCancelled && this.currentId && !isPosted) ? 'block' : 'none';

        // Disable all inputs except search and nav buttons
        document.querySelectorAll('#bankReceiptContainer input, #bankReceiptContainer select, #bankReceiptContainer textarea').forEach(el => {
            const alwaysEditable = ['br_date', 'br_job_id', 'br_employee_id', 'br_remarks'];
            if (el.id !== 'nav_search' && !el.classList.contains('br-nav-btn') && el.id !== 'br_is_cancelled' && !alwaysEditable.includes(el.id)) {
                el.disabled = isReadOnly;
            }
        });

        document.querySelectorAll('input[name="br_type"]').forEach(el => {
            el.disabled = !!this.currentId;
        });

        // Toggle buttons
        const postBtn = document.getElementById('br_post_btn');
        if (postBtn) {
            postBtn.innerText = isPosted ? 'Un-Post' : 'Post';
        }
    },

    togglePost: async function() {
        if (!this.currentId) return alert("Please select or save a voucher first.");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const newPostedState = this.is_posted ? 0 : 1;
        const confirmMsg = newPostedState ? "Are you sure you want to Post this voucher?" : "Are you sure you want to Un-Post this voucher?";
        if (!confirm(confirmMsg)) return;
        
        try {
            const res = await fetch(`api/bank_receipts.php?action=toggle_post&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentId, is_posted: newPostedState })
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert(newPostedState ? "Voucher Posted Successfully!" : "Voucher Un-Posted Successfully!");
                this.is_posted = newPostedState === 1;
                this.updateCancellationUI();
            } else {
                alert("Failed to change post state: " + result.message);
            }
        } catch (e) {
            alert("Error changing post state.");
        }
    },

    showToast: function(msg) {
        let toast = document.getElementById('br_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'br_toast';
            toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1F4E79;color:#fff;padding:8px 24px;border-radius:20px;font-size:12px;font-weight:600;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.3s;';
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    },

    navigate: async function(dir) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        let sn = parseInt(document.getElementById('br_sn').value) || 0;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/bank_receipts.php?action=get_next_serial&company_id=${companyId}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
            } catch(e) { return; }
        } else if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/bank_receipts.php?action=get_next_serial&company_id=${companyId}`);
                    const data = await res.json();
                    sn = (data.next_sn || 2) - 1;
                } catch(e) { return; }
            } else {
                sn = 1;
            }
        } else {
            sn = (dir === 'next') ? sn + 1 : sn - 1;
        }

        if (sn < 1) return;

        try {
            const res = await fetch(`api/bank_receipts.php?action=get&serial_no=${sn}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.id) {
                this.loadData(data);
            } else {
                if (dir === 'next' || dir === 'last') {
                    this.showToast('ℹ️ You are on the last record');
                } else {
                    await this.resetForm(false);
                    this.showToast('ℹ️ No previous records found');
                }
            }
        } catch (e) { console.error("Navigation Error:", e); }
    },

    delete: async function() {
        if (!this.currentId) return;
        if (!confirm("Delete record?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/bank_receipts.php?action=delete&id=${this.currentId}&company_id=${session.company_id || 1}`);
            const result = await res.json();
            if (result && result.status === 'success') { 
                alert("Deleted!"); 
                this.resetForm(true); 
            } else { 
                alert("Delete Failed: " + (result.message || result.error || "Unknown error")); 
            }
        } catch (e) { console.error("Delete Error:", e); }
    },

    openCOA: function() {
        if (window.openSecondaryModularPopup) window.openSecondaryModularPopup('Navigation/Maintain/chart_of_accounts.html', 'fa-sitemap', 'COA', window.initChartOfAccountsView, 'COA', true);
    },

    openFindModal: async function() {
        const modal = document.getElementById('br_find_modal');
        if (modal) {
            modal.style.display = 'block';
            
            if (!modal.dataset.draggableInit) {
                modal.dataset.draggableInit = 'true';
                const header = document.getElementById('br_find_modal_header');
                let isDragging = false;
                let startX = 0, startY = 0;

                header.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    e.preventDefault();
                });

                document.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        modal.style.left = (parseInt(window.getComputedStyle(modal).left) + dx) + 'px';
                        modal.style.top = (parseInt(window.getComputedStyle(modal).top) + dy) + 'px';
                        startX = e.clientX;
                        startY = e.clientY;
                    }
                });

                document.addEventListener('mouseup', () => {
                    isDragging = false;
                });

                const searchInput = document.getElementById('br_find_search');
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const tbody = document.getElementById('br_find_table_body');
                        const rows = tbody.querySelectorAll('tr');
                        if (rows.length > 0) {
                            if (this.findSelectedIndex < rows.length - 1) this.findSelectedIndex++;
                            this.highlightFindRow(rows);
                        }
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const tbody = document.getElementById('br_find_table_body');
                        const rows = tbody.querySelectorAll('tr');
                        if (rows.length > 0) {
                            if (this.findSelectedIndex > 0) this.findSelectedIndex--;
                            this.highlightFindRow(rows);
                        }
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const tbody = document.getElementById('br_find_table_body');
                        const rows = tbody.querySelectorAll('tr');
                        if (this.findSelectedIndex >= 0 && this.findSelectedIndex < rows.length) {
                            const serialNo = rows[this.findSelectedIndex].dataset.serial;
                            if (serialNo) {
                                window.BRModule.closeFindModal();
                                window.BRModule.navigateBySerial(serialNo);
                            }
                        }
                    } else if (e.key === 'Escape') {
                        window.BRModule.closeFindModal();
                    }
                });
            }
        }
        await this.renderFindTable();
    },

    highlightFindRow: function(rows) {
        rows.forEach((r, i) => {
            if (i === this.findSelectedIndex) {
                r.style.background = 'black';
                r.style.color = 'white';
                r.scrollIntoView({ block: 'nearest' });
            } else {
                r.style.background = 'white';
                r.style.color = 'black';
            }
        });
    },

    closeFindModal: function() {
        const modal = document.getElementById('br_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('br_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/bank_receipts.php?action=search_receipts&company_id=${companyId}`);
            const text = await res.text();
            try {
                this.findData = JSON.parse(text);
                if (this.findData.error) {
                    throw new Error(this.findData.error);
                }
                if (!Array.isArray(this.findData)) {
                    throw new Error("Invalid data format returned");
                }
                this.filterFindTable();
            } catch(e) {
                console.error("Parse or logic error:", e, "Response Text:", text);
                tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:10px; color:red;">Error: ${e.message}</td></tr>`;
            }
        } catch (e) {
            console.error("Network error:", e);
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const tbody = document.getElementById('br_find_table_body');
        if (!tbody) return;
        
        const q = (document.getElementById('br_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('br_find_field')?.value || 'serial_no';
        
        const filtered = (this.findData || []).filter(inv => {
            if (!q) return true;
            let val = '';
            if (field === 'serial_no') val = String(inv.serial_no || '');
            if (field === 'receipt_date') val = String(inv.receipt_date || '');
            if (field === 'customer_name') val = String(inv.customer_name || '');
            if (field === 'bank_account_name') val = String(inv.bank_account_name || '');
            return val.toLowerCase().includes(q);
        });

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px;">No records found.</td></tr>';
            return;
        }

        this.findSelectedIndex = -1;
        filtered.forEach((inv, index) => {
            const tr = document.createElement('tr');
            tr.dataset.serial = inv.serial_no;
            tr.style.cursor = 'pointer';
            tr.style.borderBottom = '1px solid #cbd5e0';
            
            tr.onclick = () => {
                this.findSelectedIndex = index;
                const rows = tbody.querySelectorAll('tr');
                this.highlightFindRow(rows);
            };
            
            tr.ondblclick = () => {
                this.closeFindModal();
                this.navigateBySerial(inv.serial_no);
            };
            
            const isPostedMark = (inv.is_posted == 1) ? 'Posted' : '';
            const statusText = (inv.is_cancelled == 1) ? 'Cancelled' : '';

            tr.innerHTML = `
                <td style="padding: 2px 4px; border: 1px solid #808080;">▶</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.serial_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.receipt_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.customer_name || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.bank_account_name || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_wht || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_gst || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_adv || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_disc || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${isPostedMark}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${statusText}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    navigateBySerial: async function(sn) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/bank_receipts.php?action=get&serial_no=${sn}&company_id=${session.company_id || 1}`);
            const data = await res.json();
            if (data && data.id) {
                this.loadData(data);
            } else {
                alert("Receipt not found!");
            }
        } catch (e) {}
    },

    print: async function(mode = 'print') {
        try {
        if (!this.currentId) return alert("Please save or retrieve a payment first.");

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companies = JSON.parse(localStorage.getItem('softifyx_companies') || '[]');
        const company = companies.find(c => c.id == session.company_id) || {};
        
        let coName = company.name || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
        coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');
        
        const coAddress = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
        const coPhone = company.phone || '+92 348 7240256';
        const coEmail = company.email || 'info@seastonepipes.com';
        
                let customLogo = 'assets/logos/logo.png';
        
        try {
            const coId = session.company_id || 1;
            const cRes = await fetch('api/admin.php?action=get_company&id=' + coId);
            if (cRes.ok) {
                const cData = await cRes.json();
                if (cData && cData.logo_data && cData.logo_data.startsWith('data:image')) {
                    customLogo = cData.logo_data;
                }
            }
        } catch(e) { console.error('DB logo fetch failed', e); }
        
        if (customLogo === 'assets/logos/logo.png') {
            const coNameStr = session.company_name || '';
            let lLogo = coNameStr ? localStorage.getItem(`softifyx_${coNameStr}_logo`) : null;
            if (!lLogo || !lLogo.startsWith('data:image')) {
                for (let i = 0; i < localStorage.length; i++) {
                    let k = localStorage.key(i);
                    if (k.toLowerCase().includes('logo') || k.toLowerCase().includes('image')) {
                        const val = localStorage.getItem(k);
                        if (val && val.startsWith('data:image')) { lLogo = val; break; }
                    }
                }
            }
            if (lLogo && lLogo.startsWith('data:image')) customLogo = lLogo;
        }
        
        const preparedBy = 'Administrator';
        const printedBy = session.username || session.user_name || session.name || 'Administrator';
        
        const sn = document.getElementById('br_sn').value;
        const date = document.getElementById('br_date').value;
        const cashAccount = document.getElementById('br_cash_code').value + ' - ' + document.getElementById('br_cash_name').value;
        
        const receivedFrom = document.getElementById('br_received_from_name').value || '';
        const amtWords = document.getElementById('br_amt_words').innerText || '';
        const remarks = document.getElementById('br_remarks').value || '';
        
        const totWht = document.getElementById('br_total_wht').value || '0.00';
        const totGst = document.getElementById('br_total_gst').value || '0.00';
        const totAdv = document.getElementById('br_total_adj').value || '0.00';
        const totDisc = document.getElementById('br_total_disc').value || '0.00';
        const totNet = document.getElementById('br_grand_total_customer').value || '0.00';
        
        const isPetty = document.querySelector('input[name="br_type"]:checked')?.value === 'Petty';
        const invoiceTitle = mode === 'voucher' ? 'BANK RECEIPT VOUCHER' : 'BANK RECEIPT';

        let itemsHtml = '';
        let tableHeader = '';
        let tableFooter = '';
        
        const validItems = [];
        document.querySelectorAll('#brGridBody tr').forEach((tr) => {
            if (isPetty) {
                if (tr.querySelector('.acc-code')?.value || tr.querySelector('.petty-amt')?.value) {
                    validItems.push(tr);
                }
            } else {
                if (tr.querySelector('.inv-no')?.value || tr.querySelector('.received-amt')?.value) {
                    validItems.push(tr);
                }
            }
        });

        if (isPetty) {
            tableHeader = `
                <tr>
                    <th>#</th>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Description</th>
                    <th>Amount</th>
                </tr>
            `;
            validItems.forEach((tr, i) => {
                const code = tr.querySelector('.acc-code')?.value || '';
                const name = tr.querySelector('.acc-name')?.value || '';
                const desc = tr.querySelector('.desc')?.value || '';
                const amt = parseFloat(tr.querySelector('.petty-amt')?.value || 0).toFixed(2);
                itemsHtml += `
                    <tr>
                        <td style="text-align:center;">${i + 1}</td>
                        <td>${code}</td>
                        <td>${name}</td>
                        <td>${desc}</td>
                        <td style="text-align:right;">${amt}</td>
                    </tr>
                `;
            });
            tableFooter = `
                <tr class="totals-row">
                    <td colspan="4" style="text-align: right;">TOTALS</td>
                    <td class="net-total-cell">${document.getElementById('br_grand_total')?.value || '0.00'}</td>
                </tr>
            `;
        } else {
            tableHeader = `
                <tr>
                    <th>#</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Amount Rcvd</th>
                    <th>W.H.Tax</th>
                    <th>GST</th>
                    <th>Adv Adj</th>
                    <th>Discount</th>
                    <th>Net Amount</th>
                </tr>
            `;
            validItems.forEach((tr, i) => {
                const invNo = tr.querySelector('.inv-no')?.value || '';
                const date = tr.querySelector('.inv-date')?.value || '';
                const amt = parseFloat(tr.querySelector('.received-amt')?.value || 0).toFixed(2);
                const wht = parseFloat(tr.querySelector('.wht-amt')?.value || 0).toFixed(2);
                const gst = parseFloat(tr.querySelector('.gst-amt')?.value || 0).toFixed(2);
                const adv = parseFloat(tr.querySelector('.adv-adj')?.value || 0).toFixed(2);
                const disc = parseFloat(tr.querySelector('.disc-given')?.value || 0).toFixed(2);
                const net = parseFloat(tr.querySelector('.tot-credited')?.value || 0).toFixed(2);

                itemsHtml += `
                    <tr>
                        <td style="text-align:center;">${i + 1}</td>
                        <td>${invNo}</td>
                        <td>${date}</td>
                        <td style="text-align:right;">${amt}</td>
                        <td style="text-align:right;">${wht}</td>
                        <td style="text-align:right;">${gst}</td>
                        <td style="text-align:right;">${adv}</td>
                        <td style="text-align:right;">${disc}</td>
                        <td style="text-align:right;">${net}</td>
                    </tr>
                `;
            });
            tableFooter = `
                <tr class="totals-row">
                    <td colspan="3" style="text-align: right;">TOTALS</td>
                    <td style="text-align: right;">${document.getElementById('br_total_rcvd').value || '0.00'}</td>
                    <td style="text-align: right;">${totWht}</td>
                    <td style="text-align: right;">${totGst}</td>
                    <td style="text-align: right;">${totAdv}</td>
                    <td style="text-align: right;">${totDisc}</td>
                    <td class="net-total-cell">${totNet}</td>
                </tr>
            `;
        }

        let finalHtml = '';

        if (mode === 'voucher') {
            const isPosted = document.getElementById('br_posted_stamp').style.display !== 'none';
            const stampHtml = isPosted ? `<div class="v-posted-stamp">POSTED</div>` : '';
            
            let vRowsHtml = '';
            
            let totalAmount = 0;
            let totalWht = 0;
            let totalCheque = 0;

            validItems.forEach(tr => {
                let credit = 0;
                let wht = 0;
                let rec = 0;
                if (isPetty) {
                    credit = parseFloat(tr.querySelector('.petty-amt')?.value || 0);
                    rec = credit;
                } else {
                    credit = parseFloat(tr.querySelector('.tot-credited')?.value || 0);
                    wht = parseFloat(tr.querySelector('.wht-amt')?.value || 0);
                    rec = parseFloat(tr.querySelector('.received-amt')?.value || 0);
                    if (credit === 0 && rec !== 0) credit = rec + wht;
                }
                totalAmount += credit;
                totalWht += wht;
                totalCheque += rec;
            });

            // Debit Row 1: Bank Account (Cheque received amount)
            const cashCode = document.getElementById('br_cash_code').value || '';
            const cashName = document.getElementById('br_cash_name').value || '';
            
            // Credit Row: Customer / Petty Account
            let custCode = '';
            let custName = '';
            if (isPetty) {
                custName = 'Petty Cash Account';
            } else {
                custCode = document.getElementById('br_received_from_code').value || '';
                custName = document.getElementById('br_received_from_name').value || '';
            }

            vRowsHtml += `
                <tr>
                    <td></td>
                    <td>
                        <div>${cashName}</div>
                        <div style="font-style: italic; color: #555;">${cashCode}</div>
                    </td>
                    <td class="right">${totalCheque.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td class="right"></td>
                </tr>
            `;

            // Debit Row 2: Account 14001001 (Advance Income Tax / WHT Receivable) if WHT > 0
            if (totalWht > 0) {
                vRowsHtml += `
                <tr>
                    <td></td>
                    <td>
                        <div>Advance Income Tax / WHT Receivable</div>
                        <div style="font-style: italic; color: #555;">14001001</div>
                    </td>
                    <td class="right">${totalWht.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td class="right"></td>
                </tr>
                `;
            }

            vRowsHtml += `
                <tr>
                    <td></td>
                    <td>
                        <div>${custName}</div>
                        <div style="font-style: italic; color: #555;">${custCode}</div>
                    </td>
                    <td class="right"></td>
                    <td class="right">${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
            `;

            const parsedDate = date.split('-').reverse().join('-');
            
            finalHtml = `
            <html>
            <head>
                <title>Bank Receipt Voucher - ${sn}</title>
                <style>
                    @page { margin: 15mm; size: portrait; }
                    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }
                    .v-header { display: flex; justify-content: space-between; align-items: flex-start; }
                    .v-company-name { font-size: 18px; font-weight: bold; text-transform: uppercase; }
                    .v-posted-stamp { border: 1px solid #000; padding: 2px 10px; font-weight: bold; font-style: italic; font-size: 14px; }
                    .v-address { font-size: 10px; margin-top: 5px; line-height: 1.4; }
                    .v-divider { border-top: 2px solid #000; border-bottom: 1px solid #000; height: 2px; margin: 10px 0; }
                    .v-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
                    .v-meta-left { display: flex; gap: 30px; font-size: 11px; }
                    .v-voucher-title { border: 1px solid #000; padding: 4px 20px; font-size: 16px; font-weight: bold; font-style: italic; text-align: center; min-width: 250px; }
                    .v-desc { margin-bottom: 15px; font-size: 11px; }
                    .v-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .v-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 4px; text-align: left; font-weight: bold; font-style: italic; }
                    .v-table th.right { text-align: right; }
                    .v-table td { padding: 6px 4px; vertical-align: top; }
                    .v-table td.right { text-align: right; }
                    .v-totals { border-top: 1px solid #000; border-bottom: 1px solid #000; font-weight: bold; }
                    .v-amt-words { font-size: 11px; font-weight: bold; margin-bottom: 50px; }
                    .v-signatures { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 20px; }
                    .v-sig-box { width: 150px; border-top: 1px solid #000; text-align: center; padding-top: 5px; font-weight: bold; font-style: italic; }
                    .v-sig-name { font-weight: normal; font-style: normal; margin-top: 5px; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="v-header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
                            <img src="${customLogo}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.style.display='none'">
                        </div>
                        <div>
                            <div class="v-company-name">${coName}</div>
                            <div class="v-address">${coAddress}<br>Tel: ${coPhone}</div>
                        </div>
                    </div>
                    ${stampHtml}
                </div>
                <div class="v-divider"></div>
                <div class="v-meta">
                    <div class="v-meta-left">
                        <div><i>Serial No :</i> &nbsp;&nbsp;<b>${sn}</b></div>
                        <div><i>Date :</i> &nbsp;&nbsp;<b>${parsedDate}</b></div>
                    </div>
                    <div class="v-voucher-title">BANK RECEIPT VOUCHER</div>
                </div>
                <div class="v-desc"><i>Description :</i> &nbsp; ${remarks}</div>
                
                <table class="v-table">
                    <thead>
                        <tr>
                            <th>Acc Code</th>
                            <th>Account Name</th>
                            <th class="right">Debit (Rs.)</th>
                            <th class="right">Credit (Rs.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vRowsHtml}
                    </tbody>
                    <tfoot>
                        <tr class="v-totals">
                            <td colspan="2" class="right" style="padding: 6px 4px;"><i>Totals</i></td>
                            <td class="right" style="padding: 6px 4px;">${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td class="right" style="padding: 6px 4px;">${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                    </tfoot>
                </table>
                
                <div class="v-amt-words"><i>Amount in Words :</i> ${amtWords}</div>
                
                <div class="v-signatures">
                    <div class="v-sig-box">
                        Prepared By
                        <div class="v-sig-name">${preparedBy}</div>
                    </div>
                    <div class="v-sig-box">
                        Received By
                    </div>
                    <div class="v-sig-box">
                        Approved By
                    </div>
                </div>
            </body>
            </html>
            `;
        } else {
            finalHtml = `
            <html>
            <head>
                <title>Bank Receipt - ${sn}</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                <style>
                    @page { margin: 0; size: auto; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #000; margin: 10mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .page-container { padding: 0; position: relative; box-sizing: border-box; }
                    
                    .header-area { display: flex; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 10px; margin-bottom: 15px; }
                    .logo-box { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; }
                    .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                    
                    .company-info { flex: 1; padding-left: 20px; display: flex; flex-direction: column; justify-content: center; }
                    .company-name { color: #1F4E79; font-size: 22px; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; }
                    .company-contacts { font-size: 9px; line-height: 1.6; }
                    .company-contacts i { color: #1F4E79; width: 12px; text-align: center; margin-right: 3px; }
                    .contact-row { display: flex; align-items: center; gap: 15px; margin-bottom: 4px; }
                    
                    .invoice-badge-area { text-align: right; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
                    .invoice-title { color: #1F4E79; font-size: 14px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; text-align: right; width: 100%; }
                    .invoice-type-badge { background: #FF8C00; color: white; padding: 4px 10px; font-size: 10px; font-weight: bold; border-radius: 4px; display: inline-block; text-transform: uppercase; }

                    .details-area { display: flex; justify-content: space-between; margin-bottom: 15px; }
                    .vendor-box { border: 1px solid #a0a0a0; border-radius: 4px; width: 45%; padding: 0; overflow: hidden; }
                    .vendor-box-header { border-bottom: 1px solid #a0a0a0; padding: 5px 10px; font-weight: bold; color: #1F4E79; display: flex; align-items: center; gap: 5px; }
                    .vendor-box-content { padding: 10px; line-height: 1.6; }
                    .vendor-box-content i { color: #1F4E79; width: 14px; text-align: center; }

                    .invoice-details-table { width: 45%; border-collapse: collapse; font-size: 10px; }
                    .invoice-details-table td { padding: 5px; border-bottom: 1px dotted #ccc; }
                    .invoice-details-table td:first-child { font-weight: bold; color: #1F4E79; width: 100px; }

                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .grid-table th { border: 1px solid #000; padding: 6px 4px; font-size: 9px; text-align: center; text-transform: uppercase; color: black; font-weight: bold; }
                    .grid-table td { border: 1px solid #000; padding: 2px 4px; height: 20px; color: black; }
                    .grid-table td:nth-child(2), .grid-table td:nth-child(3) { text-align: left; }
                    
                    .totals-row td { background: transparent; border: 1px solid #000; font-weight: bold; padding: 6px 4px; border-bottom: 1px solid #000; color: black; }
                    .totals-row .net-total-cell { border: 1px solid #000; text-align: right; color: black; font-weight: bold; }

                    .lower-area { display: flex; justify-content: space-between; margin-top: 15px; }
                    
                    .left-lower { width: 100%; border: 1px solid #a0a0a0; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden; }
                    .lower-box-section { padding: 8px 10px; flex: 1; }
                    .lower-box-section:first-child { border-bottom: 1px solid #a0a0a0; }
                    .lower-box-header { font-weight: bold; color: #1F4E79; display: flex; align-items: center; gap: 5px; margin-bottom: 5px; font-size: 9px; }
                    .lower-box-content { padding-left: 20px; }

                    .footer-signatures { display: flex; justify-content: space-between; margin-top: 50px; padding: 0 15px; }
                    .footer-sig { display: flex; flex-direction: column; align-items: center; width: 140px; }
                    .footer-sig-text { width: 100%; text-align: center; padding-top: 4px; font-size: 10px; font-weight: bold; border-top: 1px solid #000; }
                </style>
            </head>
            <body>
                <div class="page-container">
                    <div class="header-area">
                        <div class="logo-box">
                            <img src="${customLogo}" alt="Logo" onerror="this.style.display='none'">
                        </div>
                        <div class="company-info">
                            <div class="company-name">${coName}</div>
                            <div class="company-contacts">
                                <div class="contact-row">
                                    <span><i class="fas fa-map-marker-alt"></i> ${coAddress}</span>
                                </div>
                                <div class="contact-row">
                                    <span><i class="fas fa-phone-alt"></i> ${coPhone}</span>
                                    <span><i class="fas fa-envelope"></i> ${coEmail}</span>
                                </div>
                            </div>
                        </div>
                        <div class="invoice-badge-area">
                            <div class="invoice-title">${invoiceTitle}</div>
                            <div class="invoice-type-badge">BANK RECEIPT</div>
                        </div>
                    </div>

                    <div class="details-area">
                        <div class="vendor-box">
                            <div class="vendor-box-header">
                                <i class="fas fa-wallet"></i> ACCOUNT DETAILS
                            </div>
                            <div class="vendor-box-content">
                                <strong>Cash Account: </strong>${cashAccount}<br>
                                <strong>Received From: </strong>${receivedFrom || 'N/A'}<br>
                            </div>
                        </div>
                        <table class="invoice-details-table">
                            <tr>
                                <td>Voucher No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${sn}</b></td>
                            </tr>
                            <tr>
                                <td>Date</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${date}</b></td>
                            </tr>
                        </table>
                    </div>

                    <table class="grid-table">
                        <thead>
                            ${tableHeader}
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            ${tableFooter}
                        </tfoot>
                    </table>

                    <div class="lower-area">
                        <div class="left-lower" style="width: 100%;">
                            <div class="lower-box-section">
                                <div class="lower-box-header">
                                    <i class="fas fa-file-invoice-dollar" style="font-size: 14px; margin-right: 5px;"></i> AMOUNT IN WORDS
                                </div>
                                <div class="lower-box-content">
                                    ${amtWords}
                                </div>
                            </div>
                            <div class="lower-box-section">
                                <div class="lower-box-header">
                                    <i class="fas fa-comment-dots" style="font-size: 14px; margin-right: 5px;"></i> REMARKS
                                </div>
                                <div class="lower-box-content">
                                    ${remarks || '-'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="footer-signatures">
                        <div class="footer-sig">
                            <div class="footer-sig-text">Prepared By<br><span style="font-weight: normal; font-size: 9px; color: #555;">${preparedBy}</span></div>
                        </div>
                        <div class="footer-sig">
                            <div class="footer-sig-text">Printed By<br><span style="font-weight: normal; font-size: 9px; color: #555;">${printedBy}</span></div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            `;
        }

        let printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Popup Blocker is preventing the print window from opening. Please allow popups for this site.');
            return;
        }
        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(finalHtml);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.print();
            }, 500);
        }
        } catch (e) { alert('PRINT ERROR: ' + e.message + ' at ' + e.stack); }
    }
};

window.initBankReceiptModule = function() {
    window.BRModule.init();
};
