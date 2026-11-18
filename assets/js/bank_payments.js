// --- BANK PAYMENTS MODULE LOGIC ---
window.BPModule = {
    jobs: [],
    employees: [],
    currentId: null,
    selectedCashCoaId: null,
    selectedPaidToCoaId: null,
    suggestIndex: -1,
    accountsList: [],

    loadAccounts: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/bank_payments.php?action=get_all_accounts&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    this.accountsList = data;
                    return;
                }
            }
        } catch (e) {}

        try {
            const res = await fetch(`api/general_journal_voucher.php?action=search_accounts&q=&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    this.accountsList = data;
                    return;
                }
            }
        } catch (e) {}

        try {
            const res = await fetch(`api/maintain.php?action=get_coa_list&sub_id=ALL&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    this.accountsList = data;
                    return;
                }
            }
        } catch (e) {}
    },

    init: async function() {
        console.log("CP Module: Initializing...");
        try {
            this.resetForm(true);
            await this.loadJobs();
            await this.loadEmployees();
            this.loadAccounts();
            this.setupSmartSearch('bp_cash_code', 'bp_cash_name', 'bp_cash_suggest', 'search_bank_accounts', 'cash');
            this.setupSmartSearch('bp_paid_to_code', 'bp_paid_to_name', 'bp_paid_to_suggest', 'search_parties', 'paid_to');
            
            const gridBody = document.getElementById('bpGridBody');
            if (gridBody) {
                gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            }
            
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    this.save();
                } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    const selectedRow = document.querySelector('#bpGridBody tr.selected-row');
                    if (selectedRow) {
                        selectedRow.remove();
                        this.calculateTotals();
                    }
                } else if (e.key === 'F4') {
                    e.preventDefault();
                    const focusedId = document.activeElement ? document.activeElement.id : '';
                    const paidToIds = ['bp_paid_to_code', 'bp_paid_to_name'];
                    if (paidToIds.includes(focusedId) || document.activeElement?.closest('#bpGridBody')) {
                        this.showPendingInvoices();
                    }
                }
                if (e.key === 'Enter' && !e.target.classList.contains('grid-input')) {
                    const masterSequence = ['bp_date', 'bp_job_id', 'bp_employee_id', 'bp_cash_code', 'bp_cash_name', 'bp_paid_to_code', 'bp_paid_to_name'];
                    if (masterSequence.includes(e.target.id)) {
                        e.preventDefault();
                        const index = masterSequence.indexOf(e.target.id);
                        if (index < masterSequence.length - 1) {
                            const next = document.getElementById(masterSequence[index + 1]);
                            if (next) next.focus();
                        } else {
                            const firstGridInput = document.querySelector('#bpGridBody input:not([readonly]):not([type="hidden"])');
                            if (firstGridInput) firstGridInput.focus();
                        }
                    }
                }
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.row-selector')) {
                    document.querySelectorAll('#bpGridBody tr').forEach((r) => {
                        r.classList.remove('selected-row');
                        r.style.backgroundColor = 'transparent';
                        const s = r.querySelector('.row-selector');
                        if (s) s.innerHTML = s.getAttribute('data-idx');
                    });
                }
            });

            const cancelCb = document.getElementById('bp_is_cancelled');
            if (cancelCb) cancelCb.addEventListener('change', () => window.BPModule.updateCancellationUI());
        } catch (err) { console.error("CP Module Init Error:", err); }
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('bpGridBody');
        const suggest = tr.querySelector('.row-suggest');

        const suggestBox = tr._suggestBox || tr.querySelector('.row-suggest') || document.querySelector('.row-suggest');

        // Handle suggestion box keyboard nav
        if (target.classList.contains('acc-code') && suggestBox && suggestBox.style.display === 'block') {
            const items = suggestBox.querySelectorAll('.cp-acc-suggest-item, div');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.suggestIndex = Math.min((this.suggestIndex ?? -1) + 1, items.length - 1);
                this.updateSuggestHighlight(items);
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.suggestIndex = Math.max((this.suggestIndex ?? 0) - 1, 0);
                this.updateSuggestHighlight(items);
                return;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selIdx = (this.suggestIndex !== undefined && this.suggestIndex > -1) ? this.suggestIndex : 0;
                if (items[selIdx]) {
                    items[selIdx].click();
                }
                return;
            } else if (e.key === 'Escape') {
                suggestBox.style.display = 'none';
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
            const select = document.getElementById('bp_job_id');
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
            const select = document.getElementById('bp_employee_id');
            if (select) {
                select.innerHTML = '<option value="">Select Employee</option>';
                this.employees.forEach(e => select.innerHTML += `<option value="${e.id}">${e.name}</option>`);
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
                const res = await fetch(`api/bank_payments.php?action=${apiAction}&q=${val}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data.length > 0) {
                    this.suggestIndex = -1;
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.BPModule.selectAccount('${type}', ${item.id}, '${item.code}', '${item.name}')">
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
            document.getElementById('bp_cash_code').value = code;
            document.getElementById('bp_cash_name').value = name;
            document.getElementById('bp_cash_suggest').style.display = 'none';
            this.fetchBalance(id, 'bp_cash_balance');
        } else {
            this.selectedPaidToCoaId = id;
            document.getElementById('bp_paid_to_code').value = code;
            document.getElementById('bp_paid_to_name').value = name;
            document.getElementById('bp_paid_to_suggest').style.display = 'none';
            this.fetchBalance(id, 'bp_paid_to_balance');
        }
    },

    fetchBalance: async function(coaId, targetId) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const balEl = document.getElementById(targetId);
        if (balEl) { balEl.value = '...'; balEl.style.color = '#1e3a8a'; }
        try {
            const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${coaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
            const data = await res.json();
            if (balEl) {
                let bal = parseFloat(data.balance || 0);
                if (bal < 0) {
                    balEl.value = Math.abs(bal).toFixed(2) + ' Cr';
                    balEl.style.color = 'red';
                } else {
                    balEl.value = bal.toFixed(2) + ' Dr';
                    balEl.style.color = '#1e3a8a';
                }
            }
        } catch (e) { 
            if (balEl) { balEl.value = '0.00 Dr'; balEl.style.color = '#1e3a8a'; }
        }
    },

    updatePaidToLabel: function(type) {
        try {
            if (!type) {
                const typeEl = document.querySelector('input[name="bp_type"]:checked');
                type = typeEl ? typeEl.value : 'Vendor';
            }
            const gridBody = document.getElementById('bpGridBody');
            const lbl = document.getElementById('bp_lbl_paid_to');
            if (lbl) lbl.textContent = type === 'Petty' ? 'Paid To (Petty)' : 'Paid To';
            
            const vendorRow = document.getElementById('bpVendorPaidToContainer');
            if (vendorRow) vendorRow.style.display = type === 'Petty' ? 'none' : 'grid';

            document.getElementById('bpGridTitle').style.display = type === 'Petty' ? 'none' : 'block';
            document.getElementById('bpVendorFooter').style.display = type === 'Petty' ? 'none' : 'block';
            document.getElementById('bpPettyFooter').style.display = type === 'Petty' ? 'block' : 'none';
            document.getElementById('bpVendorHeader').style.display = type === 'Petty' ? 'none' : '';
            document.getElementById('bpPettyHeader').style.display = type === 'Petty' ? '' : 'none';

            if (gridBody) {
                gridBody.innerHTML = '';
                for (let i = 0; i < 40; i++) { this.addRow({}, type); }
            }
            this.calculateTotals();
        } catch (err) {}
    },

    resetForm: function(isNew = false) {
        this.currentId = null;
        this.selectedCashCoaId = null;
        this.selectedPaidToCoaId = null;
        const ids = ['bp_sn', 'bp_date', 'bp_cheque_no', 'bp_cheque_date', 'bp_job_id', 'bp_employee_id', 'bp_cash_code', 'bp_cash_name', 'bp_cash_balance', 'bp_paid_to_code', 'bp_paid_to_name', 'bp_paid_to_balance', 'bp_prepayment', 'bp_remarks'];
        ids.forEach(id => { 
            const el = document.getElementById(id); 
            if (el) { 
                el.value = ''; 
                if (id === 'bp_cash_balance' || id === 'bp_paid_to_balance') el.style.color = ''; 
            } 
        });
        const cancel = document.getElementById('bp_is_cancelled');
        if (cancel) cancel.checked = false;
        
        const typeEl = document.querySelector('input[name="bp_type"]:checked');
        const currentType = typeEl ? typeEl.value : 'Vendor';
        if (!typeEl) {
            const vCheck = document.querySelector('input[name="bp_type"][value="Vendor"]');
            if (vCheck) vCheck.checked = true;
        }
        this.updatePaidToLabel(currentType);

        if (isNew) {
            const dateEl = document.getElementById('bp_date');
            if (dateEl) { dateEl.value = new Date().toISOString().split('T')[0]; dateEl.focus(); }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            fetch(`api/bank_payments.php?action=get_next_serial&company_id=${session.company_id || 1}`)
                .then(r => r.json()).then(d => { document.getElementById('bp_sn').value = d.next_sn; })
                .catch(() => { document.getElementById('bp_sn').value = '1'; });
        }
        
        this.is_posted = false;
        this.updateCancellationUI();
    },

    addRow: function(data = {}, type = null) {
        try {
            const tbody = document.getElementById('bpGridBody');
            if (!tbody) return;
            if (!type) {
                const typeEl = document.querySelector('input[name="bp_type"]:checked');
                type = typeEl ? typeEl.value : 'Vendor';
            }
            const idx = tbody.children.length;
            const tr = tbody.insertRow();
            tr.style.height = '20px';

            if (type === 'Petty') {
                tr.innerHTML = `
                    <td class="row-selector" data-idx="${idx + 1}" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; cursor: pointer;">${idx + 1}</td>
                    <td class="" style="width: 100px; position:relative;">
                        <input type="text" class="grid-input acc-code" value="${data.coa_code || ''}">
                        <div class="bp-suggest row-suggest" style="width:420px; top:24px;"></div>
                    </td>
                    <td class="" style="width: 250px;">
                        <input type="text" class="grid-input acc-name" value="${data.coa_name || ''}">
                        <input type="hidden" class="row-coa-id" value="${data.coa_id || ''}">
                    </td>
                    <td class="" style="width: 1fr;"><input type="text" class="grid-input desc" value="${data.description || ''}"></td>
                    <td class="" style="width: 110px;"><input type="text" class="grid-input num petty-amt" value="${data.paid_amount !== undefined && data.paid_amount !== null && data.paid_amount !== '' ? data.paid_amount : ''}"></td>
                `;
                this.setupRowSmartSearch(tr);
            } else {
                tr.innerHTML = `
                    <td class="row-selector" data-idx="${idx + 1}" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; cursor: pointer;">${idx + 1}</td>
                    <td class="" style="width: 90px;"><input type="text" class="grid-input inv-no" onfocus="document.getElementById('bp_f4_hint').style.display='inline'" onblur="document.getElementById('bp_f4_hint').style.display='none'" value="${data.invoice_no || ''}"></td>
                    <td class="" style="width: 95px;"><input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="grid-input inv-date" value="${data.invoice_date || ''}"></td>
                    <td class="" style="width: 110px;"><input type="text" class="grid-input num paid-amt" value="${data.paid_amount !== undefined && data.paid_amount !== null && data.paid_amount !== '' ? data.paid_amount : ''}"></td>
                    <td class="" style="width: 60px;"><input type="text" class="grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                    <td class="" style="width: 85px;"><input type="text" class="grid-input num wht-amt" value="${data.wht_amount || ''}" readonly></td>
                    <td class="" style="width: 60px;"><input type="text" class="grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                    <td class="" style="width: 85px;"><input type="text" class="grid-input num gst-amt" value="${data.gst_amount || ''}" readonly></td>
                    <td class="" style="width: 85px;"><input type="text" class="grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                    <td class="" style="width: 85px;"><input type="text" class="grid-input num disc-rcvd" value="${data.discount_received || ''}"></td>
                    <td class="" style="width: 110px;"><input type="text" class="grid-input num tot-debited" value="${data.total_debited !== undefined && data.total_debited !== null && data.total_debited !== '' ? data.total_debited : ''}" readonly></td>
                `;
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
                input.oninput = () => this.calculateRow(tr);
            });

            const selector = tr.querySelector('.row-selector');
            if (selector) {
                selector.addEventListener('click', () => {
                    if (tr.classList.contains('selected-row')) {
                        tr.classList.remove('selected-row');
                        selector.innerHTML = selector.getAttribute('data-idx');
                        tr.style.backgroundColor = 'transparent';
                    } else {
                        document.querySelectorAll('#bpGridBody tr').forEach((r) => {
                            r.classList.remove('selected-row');
                            r.style.backgroundColor = 'transparent';
                            const s = r.querySelector('.row-selector');
                            if (s) s.innerHTML = s.getAttribute('data-idx');
                        });
                        tr.classList.add('selected-row');
                        selector.innerHTML = '&#9654;';
                        tr.style.backgroundColor = '#e0f0ff';
                    }
                });
            }
        } catch (e) { console.error("Add Row Error:", e); }
    },

    setupRowSmartSearch: function(tr) {
        const codeInput = tr.querySelector('.acc-code');
        const nameInput = tr.querySelector('.acc-name');
        let suggest = tr.querySelector('.row-suggest');
        if (!nameInput || !codeInput) return;

        if (!suggest) {
            suggest = document.createElement('div');
            suggest.className = 'bp-suggest row-suggest';
            suggest.style.width = '420px';
            suggest.style.top = '24px';
            codeInput.parentElement.appendChild(suggest);
        }

        const handleSearch = async (val) => {
            const query = (val || '').trim();
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            let matches = [];
            if (this.accountsList && this.accountsList.length > 0) {
                const qLower = query.toLowerCase();
                const words = qLower.split(/\s+/).filter(Boolean);
                matches = this.accountsList.filter(item => {
                    if (!words.length) return true;
                    const c = String(item.code || '').toLowerCase();
                    const n = String(item.name || '').toLowerCase();
                    const str = `${c} ${n}`;
                    return words.every(w => str.includes(w));
                }).slice(0, 50);
            }

            if (matches.length === 0) {
                try {
                    const res = await fetch(`api/bank_payments.php?action=search_grid_accounts&q=${encodeURIComponent(query)}&company_id=${companyId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            matches = data;
                            if (!this.accountsList || this.accountsList.length === 0) this.accountsList = data;
                        }
                    }
                } catch (e) {}
            }

            if (matches.length === 0) {
                try {
                    const res = await fetch(`api/general_journal_voucher.php?action=search_accounts&q=${encodeURIComponent(query)}&company_id=${companyId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            matches = data;
                        }
                    }
                } catch (e) {}
            }

            if (matches.length === 0) {
                try {
                    const res = await fetch(`api/maintain.php?action=get_coa_list&sub_id=ALL&company_id=${companyId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            this.accountsList = data;
                            const qLower = query.toLowerCase();
                            const words = qLower.split(/\s+/).filter(Boolean);
                            matches = data.filter(item => {
                                if (!words.length) return true;
                                const c = String(item.code || '').toLowerCase();
                                const n = String(item.name || '').toLowerCase();
                                const str = `${c} ${n}`;
                                return words.every(w => str.includes(w));
                            }).slice(0, 50);
                        }
                    }
                } catch (e) {}
            }

            const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
            matches = matches.slice(0, maxLimit);
            tr._currentMatches = matches;

            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map((item, idx) => `
                    <div class="bp-acc-suggest-item" data-idx="${idx}" onclick="window.BPModule.selectRowAccount(this, ${item.id}, '${String(item.code).replace(/'/g, "\\'")}', '${String(item.name).replace(/'/g, "\\'")}')" style="padding: 5px 8px; cursor: pointer; font-size: 11.5px; border-bottom: 1px solid #f1f5f9;">
                         <span><b style="color: #1e3a8a;">${item.code}</b> &nbsp; ${item.name}</span>
                    </div>
                `).join('');
                suggest.style.display = 'block';
                const activeInp = codeInput;
                if (typeof window.positionGridDropdown === 'function') {
                    window.positionGridDropdown(suggest, activeInp);
                }
            } else {
                suggest.style.display = 'none';
            }
        };

        codeInput.addEventListener('blur', () => {
            setTimeout(() => { suggest.style.display = 'none'; }, 250);
        });
        codeInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length > 0) {
                handleSearch(val);
            } else {
                suggest.style.display = 'none';
                tr._currentMatches = [];
                this.suggestIndex = -1;
            }
            const tbody = document.getElementById('bpGridBody');
            if (tbody && tr === tbody.lastElementChild && val !== '') {
                this.addRow({}, 'Petty');
            }
        });

        document.addEventListener('click', (e) => {
            if (!codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                this.suggestIndex = -1;
            }
        });
    },

    selectRowAccount: function(trOrEl, id, code, name) {
        let tr = (trOrEl && trOrEl.nodeType === 1 && trOrEl.tagName === 'TR') ? trOrEl : (trOrEl ? trOrEl.closest('tr') : null);
        if (!tr) return;

        const codeInput = tr.querySelector('.acc-code');
        const nameInput = tr.querySelector('.acc-name');
        const idInput = tr.querySelector('.row-coa-id');
        const descInput = tr.querySelector('.desc');
        const pettyAmtInput = tr.querySelector('.petty-amt');

        if (codeInput) codeInput.value = code || '';
        if (nameInput) nameInput.value = name || '';
        if (idInput) idInput.value = id || '';

        const suggest = tr.querySelector('.row-suggest');
        if (suggest) suggest.style.display = 'none';
        this.suggestIndex = -1;

        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        } else if (descInput) {
            descInput.focus();
            descInput.select();
        } else if (pettyAmtInput) {
            pettyAmtInput.focus();
            pettyAmtInput.select();
        }
    },

    calculateRow: function(tr) {
        const typeEl = document.querySelector('input[name="bp_type"]:checked');
        const type = typeEl ? typeEl.value : 'Vendor';
        if (type === 'Petty') { this.calculateTotals(); return; }
        const paid = parseFloat(tr.querySelector('.paid-amt').value) || 0;
        const whtR = parseFloat(tr.querySelector('.wht-rate').value) || 0;
        const gstR = parseFloat(tr.querySelector('.gst-rate').value) || 0;
        const adj = parseFloat(tr.querySelector('.adv-adj').value) || 0;
        const disc = parseFloat(tr.querySelector('.disc-rcvd').value) || 0;
        const whtA = (paid * whtR) / 100;
        const gstA = (paid * gstR) / 100;
        const total = paid + adj;
        tr.querySelector('.wht-amt').value = whtA !== 0 ? whtA.toFixed(2) : '';
        tr.querySelector('.gst-amt').value = gstA !== 0 ? gstA.toFixed(2) : '';
        tr.querySelector('.tot-debited').value = total !== 0 ? total.toFixed(2) : '';
        this.calculateTotals();
    },

    calculateTotals: function() {
        try {
            const typeEl = document.querySelector('input[name="bp_type"]:checked');
            const type = typeEl ? typeEl.value : 'Vendor';
            let grandTotal = 0;
            if (type === 'Petty') {
                let tAmt = 0;
                document.querySelectorAll('#bpGridBody tr').forEach(tr => {
                    const inp = tr.querySelector('.petty-amt');
                    if (inp) tAmt += parseFloat(inp.value) || 0;
                });
                grandTotal = tAmt;
                const pettyTotalEl = document.getElementById('bp_grand_total_petty');
                if (pettyTotalEl) pettyTotalEl.value = tAmt.toFixed(2);
            } else {
                let tPaid = 0, tWht = 0, tGst = 0, tAdj = 0, tDisc = 0, tTotal = 0;
                document.querySelectorAll('#bpGridBody tr').forEach(tr => {
                    const p = tr.querySelector('.paid-amt'), w = tr.querySelector('.wht-amt'), g = tr.querySelector('.gst-amt'), a = tr.querySelector('.adv-adj'), d = tr.querySelector('.disc-rcvd'), t = tr.querySelector('.tot-debited');
                    if (p) tPaid += parseFloat(p.value) || 0;
                    if (w) tWht += parseFloat(w.value) || 0;
                    if (g) tGst += parseFloat(g.value) || 0;
                    if (a) tAdj += parseFloat(a.value) || 0;
                    if (d) tDisc += parseFloat(d.value) || 0;
                    if (t) tTotal += parseFloat(t.value) || 0;
                });
                const prepayment = parseFloat(document.getElementById('bp_prepayment').value) || 0;
                document.getElementById('bp_total_advance').value = prepayment.toFixed(2);
                document.getElementById('bp_total_paid').value = tPaid.toFixed(2);
                document.getElementById('bp_total_wht').value = tWht.toFixed(2);
                document.getElementById('bp_total_gst').value = tGst.toFixed(2);
                document.getElementById('bp_total_adj').value = tAdj.toFixed(2);
                document.getElementById('bp_total_disc').value = tDisc.toFixed(2);
                grandTotal = tTotal + prepayment;
                document.getElementById('bp_grand_total_vendor').value = grandTotal.toFixed(2);
            }
            document.getElementById('bp_grand_total').value = grandTotal.toFixed(2);
            document.getElementById('bp_amt_words').innerText = `Rupees ${this.numberToWords(grandTotal)} only.`;
        } catch (e) {}
    },

    numberToWords: function(num) {
        if (!num || isNaN(num) || num === 0) return 'zero and 00/100';
        
        const isNegative = num < 0;
        const absNum = Math.abs(num);

        const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
        const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

        const inWords = (n) => {
            if (n < 20) return a[n];
            if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10] : ' ');
            if (n < 1000) return a[Math.floor(n / 100)] + 'hundred ' + (n % 100 !== 0 ? inWords(n % 100) : '');
            if (n < 100000) return inWords(Math.floor(n / 1000)) + 'thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
            if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
            return inWords(Math.floor(n / 10000000)) + 'crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
        };

        const integerPart = Math.floor(absNum);
        let decimalPart = Math.round((absNum - integerPart) * 100);
        const decStr = decimalPart < 10 ? '0' + decimalPart : decimalPart;

        if (integerPart === 0) {
            return (isNegative ? 'Minus ' : '') + `zero and ${decStr}/100`;
        }

        const words = inWords(integerPart).trim();
        const capitalizedWords = words.charAt(0).toUpperCase() + words.slice(1);
        
        return (isNegative ? 'Minus ' : '') + `${capitalizedWords} and ${decStr}/100`;
    },

    save: async function() {
        const typeEl = document.querySelector('input[name="bp_type"]:checked');
        const type = typeEl ? typeEl.value : 'Vendor';
        if (!this.selectedCashCoaId) { alert("Please select Cash Account."); return; }
        const items = [];
        document.querySelectorAll('#bpGridBody tr').forEach(tr => {
            if (type === 'Petty') {
                const amt = parseFloat(tr.querySelector('.petty-amt').value) || 0;
                const coaId = tr.querySelector('.row-coa-id').value;
                if (amt !== 0 && coaId) items.push({ coa_id: coaId, description: tr.querySelector('.desc').value, paid_amount: amt, total_debited: amt });
            } else {
                const paid = parseFloat(tr.querySelector('.paid-amt').value) || 0;
                if (paid !== 0) {
                    items.push({ 
                        invoice_no: tr.querySelector('.inv-no').value, 
                        invoice_date: tr.querySelector('.inv-date').value, 
                        paid_amount: paid, 
                        wht_rate: parseFloat(tr.querySelector('.wht-rate').value) || 0, 
                        wht_amount: parseFloat(tr.querySelector('.wht-amt').value) || 0, 
                        gst_rate: parseFloat(tr.querySelector('.gst-rate').value) || 0, 
                        gst_amount: parseFloat(tr.querySelector('.gst-amt').value) || 0, 
                        advance_adjusted: parseFloat(tr.querySelector('.adv-adj').value) || 0, 
                        discount_received: parseFloat(tr.querySelector('.disc-rcvd').value) || 0, 
                        total_debited: parseFloat(tr.querySelector('.tot-debited').value) || 0 
                    });
                }
            }
        });
        if (items.length === 0) { alert("Please add at least one item."); return; }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const payload = { 
            id: this.currentId, 
            serial_no: document.getElementById('bp_sn').value, 
            cheque_no: document.getElementById('bp_cheque_no').value,
                cheque_date: document.getElementById('bp_cheque_date').value,
                payment_date: document.getElementById('bp_date').value, 
            payment_type: type, 
            cash_account_coa_id: this.selectedCashCoaId, 
            paid_to_coa_id: this.selectedPaidToCoaId, 
            job_id: document.getElementById('bp_job_id').value || null, 
            employee_id: document.getElementById('bp_employee_id').value || null, 
            prepayment_advance: parseFloat(document.getElementById('bp_prepayment').value) || 0, 
            remarks: document.getElementById('bp_remarks').value, 
            is_cancelled: document.getElementById('bp_is_cancelled').checked ? 1 : 0,
            total_amount: parseFloat(document.getElementById('bp_grand_total').value) || 0,
            amount_in_words: document.getElementById('bp_amt_words').innerText.replace('Rupees ', '').replace(' only.', ''),
            items: items 
        };
        try {
            const res = await fetch(`api/bank_payments.php?action=save&company_id=${session.company_id || 1}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            const result = await res.json();
            if (result && result.status === 'success') { 
                this.showToast("Saved Successfully!"); 
                this.resetForm(true); 
            } else { 
                alert("Error: " + (result.message || result.error || "Unknown server error")); 
            }
        } catch (e) { 
            console.error("Save Error:", e);
            alert("Save Failed! Check console for details."); 
        }
    },

    edit: async function(id) {
        try {
            const res = await fetch(`api/bank_payments.php?action=get&id=${id}`);
            const data = await res.json();
            if (data && data.id) this.loadData(data);
        } catch (e) {}
    },

    loadData: function(data) {
        this.currentId = data.id;
        const typeEl = document.querySelector(`input[name="bp_type"][value="${data.payment_type}"]`);
        if (typeEl) typeEl.checked = true;
        this.updatePaidToLabel(data.payment_type);
        document.getElementById('bp_sn').value = data.serial_no;
        document.getElementById('bp_date').value = data.payment_date || '';
        document.getElementById('bp_cheque_no').value = data.cheque_no || '';
        document.getElementById('bp_cheque_date').value = data.cheque_date || '';
        document.getElementById('bp_job_id').value = data.job_id || '';
        document.getElementById('bp_employee_id').value = data.employee_id || '';
        document.getElementById('bp_cash_code').value = data.cash_account ? data.cash_account.code : '';
        document.getElementById('bp_cash_name').value = data.cash_account ? data.cash_account.name : '';
        document.getElementById('bp_paid_to_code').value = data.paid_to ? data.paid_to.code : '';
        document.getElementById('bp_paid_to_name').value = data.paid_to ? data.paid_to.name : '';
        document.getElementById('bp_prepayment').value = data.prepayment_advance;
        document.getElementById('bp_remarks').value = data.remarks;
        document.getElementById('bp_is_cancelled').checked = parseInt(data.is_cancelled) === 1;
        this.is_posted = parseInt(data.is_posted ?? 1) === 1;
        this.updateCancellationUI();
        this.selectedCashCoaId = data.cash_account_coa_id;
        this.selectedPaidToCoaId = data.paid_to_coa_id;
        this.fetchBalance(data.cash_account_coa_id, 'bp_cash_balance');
        if (data.paid_to_coa_id) this.fetchBalance(data.paid_to_coa_id, 'bp_paid_to_balance');
        const tbody = document.getElementById('bpGridBody');
        tbody.innerHTML = '';
        data.items.forEach(item => this.addRow(item, data.payment_type));
        while (tbody.children.length < 40) { this.addRow({}, data.payment_type); }
        this.calculateTotals();
    },

    showToast: function(msg) {
        let toast = document.getElementById('bp_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'bp_toast';
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
        let sn = parseInt(document.getElementById('bp_sn').value) || 0;

        if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/bank_payments.php?action=get_next_serial&company_id=${companyId}`);
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

        this.navigateBySerial(sn, dir);
    },

    navigateBySerial: async function(sn, dir = 'this') {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/bank_payments.php?action=get&serial_no=${sn}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.id) {
                this.loadData(data);
            } else {
                if (dir === 'next') {
                    this.showToast('You are on the last record');
                } else if (dir === 'prev') {
                    this.showToast('You are on the first record');
                } else {
                    await this.resetForm(false);
                    document.getElementById('bp_sn').value = sn;
                    document.getElementById('bp_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation Error:", e); }
    },

    delete: async function() {
        if (!this.currentId) return;
        if (!confirm("Delete record?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/bank_payments.php?action=delete&id=${this.currentId}&company_id=${session.company_id || 1}`);
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
        
        const sn = document.getElementById('bp_sn').value;
        const date = document.getElementById('bp_date').value;
        const cashAccount = document.getElementById('bp_cash_code').value + ' - ' + document.getElementById('bp_cash_name').value;
        
        const paidTo = document.getElementById('bp_paid_to_name').value || '';
        const amtWords = document.getElementById('bp_amt_words').innerText || '';
        const remarks = document.getElementById('bp_remarks').value || '';
        
        const totWht = document.getElementById('bp_total_wht').value || '0.00';
        const totGst = document.getElementById('bp_total_gst').value || '0.00';
        const totAdv = document.getElementById('bp_total_adj').value || '0.00';
        const totDisc = document.getElementById('bp_total_disc').value || '0.00';
        const totNet = document.getElementById('bp_grand_total_vendor').value || '0.00';
        
        const isPetty = document.querySelector('input[name="bp_type"]:checked')?.value === 'Petty';
        const invoiceTitle = mode === 'voucher' ? 'BANK PAYMENT VOUCHER' : 'BANK PAYMENT';

        let itemsHtml = '';
        let tableHeader = '';
        let tableFooter = '';
        
        const validItems = [];
        document.querySelectorAll('#bpGridBody tr').forEach((tr) => {
            if (isPetty) {
                if (tr.querySelector('.acc-code')?.value || tr.querySelector('.petty-amt')?.value) {
                    validItems.push(tr);
                }
            } else {
                if (tr.querySelector('.inv-no')?.value || tr.querySelector('.paid-amt')?.value) {
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
                    <td class="net-total-cell">${document.getElementById('bp_grand_total')?.value || '0.00'}</td>
                </tr>
            `;
        } else {
            tableHeader = `
                <tr>
                    <th>#</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Amount Paid</th>
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
                const amt = parseFloat(tr.querySelector('.paid-amt')?.value || 0).toFixed(2);
                const wht = parseFloat(tr.querySelector('.wht-amt')?.value || 0).toFixed(2);
                const gst = parseFloat(tr.querySelector('.gst-amt')?.value || 0).toFixed(2);
                const adv = parseFloat(tr.querySelector('.adv-adj')?.value || 0).toFixed(2);
                const disc = parseFloat(tr.querySelector('.disc-rcvd')?.value || 0).toFixed(2);
                const net = parseFloat(tr.querySelector('.tot-debited')?.value || 0).toFixed(2);

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
                    <td style="text-align: right;">${document.getElementById('bp_total_paid').value || '0.00'}</td>
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
            const isPosted = document.getElementById('bp_posted_stamp').style.display !== 'none';
            const stampHtml = isPosted ? `<div class="v-posted-stamp">POSTED</div>` : '';
            
            let vRowsHtml = '';
            let totalDebit = 0;
            
            validItems.forEach(tr => {
                let code = '';
                let name = '';
                let desc = '';
                let debit = 0;
                
                if (isPetty) {
                    code = tr.querySelector('.acc-code')?.value || '';
                    name = tr.querySelector('.acc-name')?.value || '';
                    desc = tr.querySelector('.desc')?.value || '';
                    debit = parseFloat(tr.querySelector('.petty-amt')?.value || 0);
                } else {
                    code = tr.querySelector('.inv-no')?.value || document.getElementById('bp_paid_to_code').value || '';
                    name = document.getElementById('bp_paid_to_name').value || '';
                    desc = (tr.querySelector('.inv-no')?.value ? 'Inv: ' + tr.querySelector('.inv-no').value : '') + ' ' + (document.getElementById('bp_remarks').value || '');
                    debit = parseFloat(tr.querySelector('.tot-debited')?.value || parseFloat(tr.querySelector('.paid-amt')?.value) || 0);
                }
                
                totalDebit += debit;
                vRowsHtml += `
                    <tr>
                        <td>${code}</td>
                        <td>
                            <div>${name}</div>
                            <div style="font-style: italic; color: #555;">${desc || paidTo}</div>
                        </td>
                        <td class="right">${debit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td class="right"></td>
                    </tr>
                `;
            });
            
            // Credit Row
            const cashCode = document.getElementById('bp_cash_code').value || '';
            const cashName = document.getElementById('bp_cash_name').value || '';
            vRowsHtml += `
                <tr>
                    <td>${cashCode}</td>
                    <td>
                        <div>${cashName}</div>
                        <div style="font-style: italic; color: #555;">${paidTo || remarks}</div>
                    </td>
                    <td class="right"></td>
                    <td class="right">${totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
            `;

            const parsedDate = date.split('-').reverse().join('-');
            
            finalHtml = `
            <html>
            <head>
                <title>Cash Payment Voucher - ${sn}</title>
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
                    <div class="v-voucher-title">BANK PAYMENT VOUCHER</div>
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
                            <td class="right" style="padding: 6px 4px;">${totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td class="right" style="padding: 6px 4px;">${totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
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
                <title>Cash Payment - ${sn}</title>
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
                            <div class="invoice-type-badge">BANK PAYMENT</div>
                        </div>
                    </div>

                    <div class="details-area">
                        <div class="vendor-box">
                            <div class="vendor-box-header">
                                <i class="fas fa-wallet"></i> ACCOUNT DETAILS
                            </div>
                            <div class="vendor-box-content">
                                <strong>Cash Account: </strong>${cashAccount}<br>
                                <strong>Paid To: </strong>${paidTo || 'N/A'}<br>
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
                            <div class="footer-sig-text">Authorized By<br><span style="font-weight: normal; font-size: 9px; color: #555;"></span></div>
                        </div>
                        <div class="footer-sig">
                            <div class="footer-sig-text">Received By<br><span style="font-weight: normal; font-size: 9px; color: #555;"></span></div>
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

    updateCancellationUI: function() {
        const isCancelled = document.getElementById('bp_is_cancelled')?.checked;
        const isPosted = this.is_posted;
        const isReadOnly = isPosted; // Cancelled records remain editable

        const cancelledStamp = document.getElementById('bp_cancelled_stamp');
        const unpostedStamp = document.getElementById('bp_unposted_stamp');
        const postedStamp = document.getElementById('bp_posted_stamp');
        
        if (cancelledStamp) cancelledStamp.style.display = isCancelled ? 'block' : 'none';
        if (postedStamp) postedStamp.style.display = (!isCancelled && this.currentId && isPosted) ? 'block' : 'none';
        if (unpostedStamp) unpostedStamp.style.display = (!isCancelled && this.currentId && !isPosted) ? 'block' : 'none';

        // Disable all inputs except search and nav buttons
        document.querySelectorAll('#cashPaymentContainer input, #cashPaymentContainer select, #cashPaymentContainer textarea').forEach(el => {
            const alwaysEditable = ['bp_date', 'bp_job_id', 'bp_employee_id', 'bp_remarks'];
            if (el.id !== 'nav_search' && !el.classList.contains('po-nav-btn') && el.id !== 'bp_is_cancelled' && !alwaysEditable.includes(el.id)) {
                el.disabled = isReadOnly;
            }
        });

        document.querySelectorAll('input[name="bp_type"]').forEach(el => {
            el.disabled = !!this.currentId;
        });

        // Toggle buttons
        const saveBtn = document.querySelector('.po-btn-save');
        const postBtn = document.getElementById('bp_post_btn');
        
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
            const res = await fetch(`api/bank_payments.php?action=toggle_post&company_id=${session.company_id || 1}`, {
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

    findVoucher: function() {
        const val = prompt("Enter Serial No to find:");
        if (val) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            fetch(`api/bank_payments.php?action=get&serial_no=${val}&company_id=${companyId}`)
                .then(r => r.json())
                .then(data => {
                    if (data && data.id) {
                        this.loadData(data);
                    } else {
                        alert("Voucher not found.");
                    }
                }).catch(() => alert("Error finding voucher."));
        }
    },

    showPendingInvoices: async function() {
        if (!this.selectedPaidToCoaId) {
            alert('Please select a Vendor first, then press F4.');
            return;
        }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        let invoices = [];
        try {
            const res = await fetch(`api/bank_payments.php?action=get_pending_invoices&vendor_coa_id=${this.selectedPaidToCoaId}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.error) throw new Error(data.error);
            invoices = Array.isArray(data) ? data : [];
        } catch (e) { alert('Error loading pending invoices: ' + e.message); return; }

        // Remove old popup if exists
        const old = document.getElementById('bp_pending_popup');
        if (old) old.remove();

        const vendorName = document.getElementById('bp_paid_to_name')?.value || '';
        const vendorCode = document.getElementById('bp_paid_to_code')?.value || '';

        const overlay = document.createElement('div');
        overlay.id = 'bp_pending_popup';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const totalBalance = invoices.reduce((s, i) => s + parseFloat(i.balance_amount || 0), 0);

        overlay.innerHTML = `
        <div style="background:#fff;border-radius:6px;width:95%;max-width:960px;height:85vh;max-height:95vh;display:flex;flex-direction:column;font-family:'Segoe UI',sans-serif;box-shadow:0 10px 40px rgba(0,0,0,0.4);overflow:hidden;">
            <div style="background:#1f4668;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:15px;font-weight:700;letter-spacing:1px;">PENDING PURCHASE INVOICES</div>
                    <div style="font-size:12px;opacity:0.85;margin-top:3px;">${vendorCode} &nbsp; ${vendorName}</div>
                </div>
                <button onclick="document.getElementById('bp_pending_popup').remove()" style="background:rgba(255,255,255,0.15);border:none;color:white;font-size:20px;cursor:pointer;padding:2px 12px;border-radius:4px;">&times;</button>
            </div>
            <div style="overflow:auto;flex:1;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#1f4668;color:white;position:sticky;top:0;">
                            <th style="padding:8px 12px;text-align:left;width:100px;">Invoice No.</th>
                            <th style="padding:8px 12px;text-align:center;width:110px;">Invoice Date</th>
                            <th style="padding:8px 12px;text-align:right;width:140px;">Invoice Amount</th>
                            <th style="padding:8px 12px;text-align:right;width:110px;">Returns</th>
                            <th style="padding:8px 12px;text-align:right;width:130px;">Amount Paid</th>
                            <th style="padding:8px 12px;text-align:right;width:120px;">W.H.Tax</th>
                            <th style="padding:8px 12px;text-align:right;width:130px;">Balance Amount</th>
                        </tr>
                    </thead>
                    <tbody id="bp_pending_body">
                        ${invoices.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748b;font-size:14px;">No pending invoices found.</td></tr>' : invoices.map((inv, idx) => `
                        <tr ondblclick="window.BPModule.selectPendingInvoice('${inv.invoice_no || ''}', '${inv.invoice_date || ''}', ${inv.balance_amount || 0})" 
                            style="cursor:pointer;background:${idx%2===0?'#fff':'#f0f4f8'};border-bottom:1px solid #d1d9e0;"
                            onmouseover="this.style.background='#cfe2f3'" onmouseout="this.style.background='${idx%2===0?'#fff':'#f0f4f8'}'"
                        >
                            <td style="padding:7px 12px;">${inv.invoice_no || '-'}</td>
                            <td style="padding:7px 12px;text-align:center;">${inv.invoice_date || ''}</td>
                            <td style="padding:7px 12px;text-align:right;">${parseFloat(inv.invoice_amount||0).toFixed(2)}</td>
                            <td style="padding:7px 12px;text-align:right;">${parseFloat(inv.returns||0).toFixed(2)}</td>
                            <td style="padding:7px 12px;text-align:right;">${parseFloat(inv.amount_paid||0).toFixed(2)}</td>
                            <td style="padding:7px 12px;text-align:right;">${parseFloat(inv.taxes_paid||0).toFixed(2)}</td>
                            <td style="padding:7px 12px;text-align:right;font-weight:700;color:#1f4668;">${parseFloat(inv.balance_amount||0).toFixed(2)}</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background:#1f4668;color:white;font-weight:700;">
                            <td colspan="6" style="padding:8px 12px;text-align:right;font-size:13px;">Total Balance:</td>
                            <td style="padding:8px 12px;text-align:right;font-size:13px;">${totalBalance.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="padding:10px 16px;font-size:11px;color:#1f4668;background:#eaf1f8;border-top:2px solid #1f4668;font-weight:600;">
                <b>Double-click</b> any row to fill it into the payment grid.
            </div>
        </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    },

    selectPendingInvoice: function(invoiceNo, invoiceDate, balanceAmount) {
        // Find first empty row in grid
        const rows = document.querySelectorAll('#bpGridBody tr');
        let targetRow = null;
        for (const row of rows) {
            const paidInp = row.querySelector('.paid-amt');
            if (paidInp && (!paidInp.value || parseFloat(paidInp.value) === 0)) {
                targetRow = row;
                break;
            }
        }
        if (!targetRow) {
            this.addRow();
            targetRow = document.querySelector('#bpGridBody tr:last-child');
        }
        if (!targetRow) return;

        const invNoInp = targetRow.querySelector('.inv-no');
        const invDateInp = targetRow.querySelector('.inv-date');
        const paidAmtInp = targetRow.querySelector('.paid-amt');

        if (invNoInp) invNoInp.value = invoiceNo;
        if (invDateInp) { invDateInp.type = 'date'; invDateInp.value = invoiceDate; }
        if (paidAmtInp) { paidAmtInp.value = parseFloat(balanceAmount).toFixed(2); paidAmtInp.focus(); }

        this.calculateRow(targetRow);
        document.getElementById('bp_pending_popup')?.remove();
    },

    openFindModal: async function() {
        const modal = document.getElementById('bp_find_modal');
        if (modal) {
            modal.style.display = 'block';
            
            if (!modal.dataset.draggableInit) {
                modal.dataset.draggableInit = 'true';
                const header = document.getElementById('bp_find_modal_header');
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
            }

            if (!modal.dataset.keyboardInit) {
                modal.dataset.keyboardInit = 'true';
                document.addEventListener('keydown', (e) => {
                    if (modal.style.display !== 'block') return;
                    const tbody = document.getElementById('bp_find_table_body');
                    const rows = tbody ? tbody.querySelectorAll('tr') : [];
                    if (rows.length === 0) return;

                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        window.BPModule.findSelectedIndex = Math.min((window.BPModule.findSelectedIndex || 0) + 1, rows.length - 1);
                        window.BPModule.highlightFindRow(rows);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        window.BPModule.findSelectedIndex = Math.max((window.BPModule.findSelectedIndex || 0) - 1, 0);
                        window.BPModule.highlightFindRow(rows);
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (window.BPModule.findSelectedIndex >= 0 && rows[window.BPModule.findSelectedIndex]) {
                            const serialNo = rows[window.BPModule.findSelectedIndex].dataset.serial;
                            if (serialNo) {
                                window.BPModule.closeFindModal();
                                window.BPModule.navigateBySerial(serialNo);
                            }
                        }
                    } else if (e.key === 'Escape') {
                        window.BPModule.closeFindModal();
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
        const modal = document.getElementById('bp_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('bp_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/bank_payments.php?action=search_payments&company_id=${companyId}`);
            this.findData = await res.json();
            this.filterFindTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const tbody = document.getElementById('bp_find_table_body');
        if (!tbody) return;
        
        const q = (document.getElementById('bp_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('bp_find_field')?.value || 'serial_no';
        
        const filtered = (this.findData || []).filter(inv => {
            if (!q) return true;
            let val = '';
            if (field === 'serial_no') val = String(inv.serial_no || '');
            if (field === 'payment_date') val = String(inv.payment_date || '');
            if (field === 'vendor_name') val = String(inv.vendor_name || '');
            if (field === 'cash_account_name') val = String(inv.cash_account_name || '');
            return val.toLowerCase().includes(q);
        });

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px;">No records found.</td></tr>';
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
            let statusText = '';

            tr.innerHTML = `
                <td style="padding: 2px 4px; border: 1px solid #808080;">▶</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.serial_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.payment_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.vendor_name || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.cash_account_name || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_wht || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">0.00</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_gst || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_adv || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_disc || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080; text-align: right;">${parseFloat(inv.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${isPostedMark}</td>
                <td style="padding: 2px 4px; border: 1px solid #808080;">${statusText}</td>
            `;
            tbody.appendChild(tr);
        });
    }
};

window.initBankPaymentModule = function() {
    window.BPModule.init();
};
