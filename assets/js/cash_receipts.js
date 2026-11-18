// --- CASH RECEIPTS MODULE LOGIC ---
window.CRModule = {
    jobs: [],
    employees: [],
    currentId: null,
    selectedCashCoaId: null,
    selectedReceivedFromCoaId: null,
    suggestIndex: -1,

    init: async function() {
        console.log("CR Module: Initializing...");
        try {
            this.resetForm(true);
            await this.loadJobs();
            await this.loadEmployees();
            this.setupSmartSearch('cr_cash_code', 'cr_cash_name', 'cr_cash_suggest', 'search_cash_accounts', 'cash');
            this.setupSmartSearch('cr_received_from_code', 'cr_received_from_name', 'cr_received_from_suggest', 'search_parties', 'received_from');
            
            const gridBody = document.getElementById('crGridBody');
            if (gridBody) {
                gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            }
            
            // Set up document-level key listeners
            if (!window._cr_keydown_bound) {
                document.addEventListener('keydown', (e) => {
                    // Check if current container is visible / active
                    const container = document.getElementById('cashReceiptContainer');
                    if (!container || container.offsetParent === null) return;

                    if (e.ctrlKey && e.key === 's') {
                        e.preventDefault();
                        this.save();
                    } else if (e.key === 'F4') {
                        e.preventDefault();
                        const focusedId = document.activeElement ? document.activeElement.id : '';
                        const customerIds = ['cr_received_from_code', 'cr_received_from_name'];
                        if (customerIds.includes(focusedId) || document.activeElement?.closest('#crGridBody')) {
                            this.showPendingInvoices();
                        }
                    } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                        const selectedRow = document.querySelector('#crGridBody tr.selected-row');
                        if (selectedRow) {
                            selectedRow.remove();
                            this.calculateTotals();
                        }
                    }
                    if (e.key === 'Enter' && !e.target.classList.contains('cr-grid-input')) {
                        const masterSequence = ['cr_date', 'cr_job_id', 'cr_employee_id', 'cr_cash_code', 'cr_cash_name', 'cr_received_from_code', 'cr_received_from_name'];
                        if (masterSequence.includes(e.target.id)) {
                            e.preventDefault();
                            const index = masterSequence.indexOf(e.target.id);
                            if (index < masterSequence.length - 1) {
                                const next = document.getElementById(masterSequence[index + 1]);
                                if (next) next.focus();
                            } else {
                                const firstGridInput = document.querySelector('#crGridBody input:not([readonly]):not([type="hidden"])');
                                if (firstGridInput) firstGridInput.focus();
                            }
                        }
                    }
                });
                window._cr_keydown_bound = true;
            }

            // Document click to hide any invoice suggest boxes
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.cr-suggest') && !e.target.classList.contains('acc-code') && !e.target.classList.contains('cr_received_from_code')) {
                    document.querySelectorAll('.cr-suggest').forEach(s => s.style.display = 'none');
                }
                const suggest = document.getElementById('cr_invoice_suggest');
                if (suggest && !suggest.contains(e.target) && !e.target.classList.contains('inv-no')) {
                    suggest.style.display = 'none';
                }
            });

            const cancelCb = document.getElementById('cr_is_cancelled');
            if (cancelCb) cancelCb.addEventListener('change', () => window.CRModule.updateCancellationUI());
        } catch (err) { console.error("CR Module Init Error:", err); }
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('cr-grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('crGridBody');
        const suggest = tr.querySelector('.row-suggest');

        // Handle suggestion box keyboard nav for petty code/name
        if ((target.classList.contains('acc-code') || target.classList.contains('acc-name')) && suggest && suggest.style.display === 'block') {
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
            const select = document.getElementById('cr_job_id');
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
            const select = document.getElementById('cr_employee_id');
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
                const res = await fetch(`api/cash_receipts.php?action=${apiAction}&q=${val}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data.length > 0) {
                    this.suggestIndex = -1;
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.CRModule.selectAccount('${type}', ${item.id}, '${item.code}', '${item.name}')">
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
            document.getElementById('cr_cash_code').value = code;
            document.getElementById('cr_cash_name').value = name;
            document.getElementById('cr_cash_suggest').style.display = 'none';
            this.fetchBalance(id, 'cr_cash_balance');
        } else {
            this.selectedReceivedFromCoaId = id;
            document.getElementById('cr_received_from_code').value = code;
            document.getElementById('cr_received_from_name').value = name;
            document.getElementById('cr_received_from_suggest').style.display = 'none';
            this.fetchBalance(id, 'cr_received_from_balance');
            
            // Re-render empty grid so rows can search this customer's invoices
            const typeEl = document.querySelector('input[name="cr_type"]:checked');
            const mode = typeEl ? typeEl.value : 'Customer';
            if (mode === 'Customer') {
                const gridBody = document.getElementById('crGridBody');
                if (gridBody) {
                    gridBody.innerHTML = '';
                    for (let i = 0; i < 18; i++) { this.addRow({}, 'Customer'); }
                }
            }
        }
    },

    fetchBalance: async function(coaId, targetId) {
        if (!coaId) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${coaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
            const data = await res.json();
            const balEl = document.getElementById(targetId);
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
        } catch (e) { console.error('Error fetching balance:', e); }
    },

    updateReceivedFromLabel: function(type) {
        try {
            if (!type) {
                const typeEl = document.querySelector('input[name="cr_type"]:checked');
                type = typeEl ? typeEl.value : 'Customer';
            }
            const gridBody = document.getElementById('crGridBody');
            const lbl = document.getElementById('lbl_received_from');
            if (lbl) lbl.textContent = type === 'Petty' ? 'Received From (Petty)' : 'Received From';
            
            const customerRow = document.getElementById('customerReceivedFromRow');
            if (customerRow) customerRow.style.display = type === 'Petty' ? 'none' : 'grid';

            document.getElementById('crGridTitle').style.display = type === 'Petty' ? 'none' : 'block';
            document.getElementById('crCustomerFooter').style.display = type === 'Petty' ? 'none' : 'block';
            document.getElementById('crPettyFooter').style.display = type === 'Petty' ? 'block' : 'none';
            document.getElementById('crCustomerHeader').style.display = type === 'Petty' ? 'none' : '';
            document.getElementById('crPettyHeader').style.display = type === 'Petty' ? '' : 'none';

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
        const ids = ['cr_sn', 'cr_date', 'cr_job_id', 'cr_employee_id', 'cr_cash_code', 'cr_cash_name', 'cr_cash_balance', 'cr_received_from_code', 'cr_received_from_name', 'cr_received_from_balance', 'cr_prepayment', 'cr_remarks'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const cancel = document.getElementById('cr_is_cancelled');
        if (cancel) cancel.checked = false;
        
        const typeEl = document.querySelector('input[name="cr_type"]:checked');
        const currentType = typeEl ? typeEl.value : 'Customer';
        if (!typeEl) {
            const cCheck = document.querySelector('input[name="cr_type"][value="Customer"]');
            if (cCheck) cCheck.checked = true;
        }
        this.updateReceivedFromLabel(currentType);

        if (isNew) {
            const dateEl = document.getElementById('cr_date');
            if (dateEl) { dateEl.value = new Date().toISOString().split('T')[0]; dateEl.focus(); }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            fetch(`api/cash_receipts.php?action=get_next_serial&company_id=${session.company_id || 1}`)
                .then(r => r.json()).then(d => { document.getElementById('cr_sn').value = d.next_sn; })
                .catch(() => { document.getElementById('cr_sn').value = '1'; });
        }
        this.updateCancellationUI();
    },

    updateCancellationUI: function() {
        const isCancelled = document.getElementById('cr_is_cancelled')?.checked;
        const isPosted = this.is_posted;
        const isReadOnly = isPosted; // Cancelled records remain editable

        const cancelledStamp = document.getElementById('cr_cancelled_stamp');
        const unpostedStamp = document.getElementById('cr_unposted_stamp');
        const postedStamp = document.getElementById('cr_posted_stamp');
        
        if (cancelledStamp) cancelledStamp.style.display = isCancelled ? 'block' : 'none';
        if (postedStamp) postedStamp.style.display = (!isCancelled && this.currentId && isPosted) ? 'block' : 'none';
        if (unpostedStamp) unpostedStamp.style.display = (!isCancelled && this.currentId && !isPosted) ? 'block' : 'none';

        // Disable all inputs except search and nav buttons
        document.querySelectorAll('#cashReceiptContainer input, #cashReceiptContainer select, #cashReceiptContainer textarea').forEach(el => {
            const alwaysEditable = ['cr_date', 'cr_job_id', 'cr_employee_id', 'cr_remarks'];
            if (el.id !== 'nav_search' && !el.classList.contains('cr-tool-btn') && el.id !== 'cr_is_cancelled' && !alwaysEditable.includes(el.id)) {
                el.disabled = isReadOnly;
            }
        });

        document.querySelectorAll('input[name="cr_type"]').forEach(el => {
            el.disabled = !!this.currentId;
        });

        // Toggle buttons
        const saveBtn = document.querySelector('.cr-btn-save');
        const postBtn = document.getElementById('cr_post_btn');
        
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
            const res = await fetch(`api/cash_receipts.php?action=toggle_post&company_id=${session.company_id || 1}`, {
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
        this.showFindModal();
    },

    addRow: function(data = {}, type = null) {
        try {
            const tbody = document.getElementById('crGridBody');
            if (!tbody) return;
            if (!type) {
                const typeEl = document.querySelector('input[name="cr_type"]:checked');
                type = typeEl ? typeEl.value : 'Customer';
            }
            const idx = tbody.children.length;
            const tr = tbody.insertRow();
            tr.style.height = '20px';

            if (type === 'Petty') {
                tr.innerHTML = `
                    <td class="cr-row-selector" data-idx="${idx + 1}" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; cursor: pointer;">${idx + 1}</td>
                    <td class="cr-grid-cell" style="width: 100px; position:relative;">
                        <input type="text" class="cr-grid-input acc-code" value="${data.coa_code || ''}">
                        <div class="cr-suggest row-suggest" style="width:350px; top:24px;"></div>
                    </td>
                    <td class="cr-grid-cell" style="width: 250px;">
                        <input type="text" class="cr-grid-input acc-name" value="${data.coa_name || ''}">
                        <input type="hidden" class="row-coa-id" value="${data.coa_id || ''}">
                    </td>
                    <td class="cr-grid-cell" style="width: 1fr;"><input type="text" class="cr-grid-input desc" value="${data.description || ''}"></td>
                    <td class="cr-grid-cell" style="width: 110px;"><input type="text" class="cr-grid-input num petty-amt" value="${data.received_amount !== undefined && data.received_amount !== null && data.received_amount !== '' ? data.received_amount : ''}"></td>
                `;
                this.setupRowSmartSearch(tr);
            } else {
                tr.innerHTML = `
                    <td class="cr-row-selector" data-idx="${idx + 1}" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; cursor: pointer;">${idx + 1}</td>
                    <td class="cr-grid-cell" style="width: 90px; position:relative;">
                        <input type="text" class="cr-grid-input inv-no" ondblclick="window.CRModule.showPendingInvoices()" value="${data.invoice_no || ''}">
                    </td>
                    <td class="cr-grid-cell" style="width: 95px;">
                        <input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="cr-grid-input inv-date" value="${data.invoice_date || ''}">
                    </td>
                    <td class="cr-grid-cell" style="width: 110px;"><input type="text" class="cr-grid-input num rcvd-amt" value="${data.received_amount !== undefined && data.received_amount !== null && data.received_amount !== '' ? data.received_amount : ''}"></td>
                    <td class="cr-grid-cell" style="width: 60px;"><input type="text" class="cr-grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                    <td class="cr-grid-cell" style="width: 85px;"><input type="text" class="cr-grid-input num wht-amt" value="${data.wht_amount || ''}" readonly></td>
                    <td class="cr-grid-cell" style="width: 60px;"><input type="text" class="cr-grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                    <td class="cr-grid-cell" style="width: 85px;"><input type="text" class="cr-grid-input num gst-amt" value="${data.gst_amount || ''}" readonly></td>
                    <td class="cr-grid-cell" style="width: 85px;"><input type="text" class="cr-grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                    <td class="cr-grid-cell" style="width: 85px;"><input type="text" class="cr-grid-input num disc-given" value="${data.discount_given || ''}"></td>
                    <td class="cr-grid-cell" style="width: 110px;"><input type="text" class="cr-grid-input num tot-credited" value="${data.total_credited !== undefined && data.total_credited !== null && data.total_credited !== '' ? data.total_credited : ''}" readonly></td>
                `;
                this.setupRowInvoiceSearch(tr);
            }

            const selector = tr.querySelector('.cr-row-selector');
            if (selector) {
                selector.addEventListener('click', () => {
                    if (tr.classList.contains('selected-row')) {
                        tr.classList.remove('selected-row');
                        selector.innerHTML = selector.getAttribute('data-idx');
                        tr.style.backgroundColor = 'transparent';
                    } else {
                        document.querySelectorAll('#crGridBody tr').forEach((r) => {
                            r.classList.remove('selected-row');
                            r.style.backgroundColor = 'transparent';
                            const s = r.querySelector('.cr-row-selector');
                            if (s) s.innerHTML = s.getAttribute('data-idx');
                        });
                        tr.classList.add('selected-row');
                        selector.innerHTML = '&#9654; ' + selector.getAttribute('data-idx');
                        tr.style.backgroundColor = '#e0f0ff';
                    }
                });
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
        } catch (e) { console.error("Add Row Error:", e); }
    },

    setupRowSmartSearch: function(tr) {
        const codeInput = tr.querySelector('.acc-code');
        const nameInput = tr.querySelector('.acc-name');
        const suggest = tr.querySelector('.row-suggest');
        if (!nameInput || !codeInput || !suggest) return;

        const handleSearch = async (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const res = await fetch(`api/cash_receipts.php?action=search_grid_accounts&q=${val}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data.length > 0) {
                    this.suggestIndex = -1;
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.CRModule.selectRowAccount(this, ${item.id}, '${item.code}', '${item.name}')">
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
        };

        setupEvents(codeInput);

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
        const suggest = document.getElementById('cr_invoice_suggest');
        if (!invInput || !suggest) return;

        const handleSearch = async (val) => {
            if (!this.selectedReceivedFromCoaId) {
                alert("Please select a Received From customer account first.");
                invInput.value = '';
                return;
            }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const res = await fetch(`api/cash_receipts.php?action=search_invoices&customer_coa_id=${this.selectedReceivedFromCoaId}&q=${val}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data.length > 0) {
                    this.suggestIndex = -1;
                    const rect = invInput.getBoundingClientRect();
                    const containerRect = document.getElementById('cashReceiptContainer').getBoundingClientRect();
                    suggest.style.top = `${rect.bottom - containerRect.top}px`;
                    suggest.style.left = `${rect.left - containerRect.left}px`;
                    suggest.style.width = '250px';
                    suggest.innerHTML = data.map(item => `
                        <div onclick="window.CRModule.selectRowInvoice(this, '${item.serial_no}', '${item.invoice_date}', ${item.net_total})">
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
        const suggest = document.getElementById('cr_invoice_suggest');
        const tr = suggest.activeTr;
        if (!tr) return;
        tr.querySelector('.inv-no').value = serialNo;
        tr.querySelector('.inv-date').value = date;
        tr.querySelector('.rcvd-amt').value = total.toFixed(2);
        suggest.style.display = 'none';
        this.calculateRow(tr);
    },

    calculateRow: function(tr) {
        const typeEl = document.querySelector('input[name="cr_type"]:checked');
        const type = typeEl ? typeEl.value : 'Customer';
        if (type === 'Petty') { this.calculateTotals(); return; }
        const rcvd = parseFloat(tr.querySelector('.rcvd-amt').value) || 0;
        const whtR = parseFloat(tr.querySelector('.wht-rate').value) || 0;
        const gstR = parseFloat(tr.querySelector('.gst-rate').value) || 0;
        const adj = parseFloat(tr.querySelector('.adv-adj').value) || 0;
        const disc = parseFloat(tr.querySelector('.disc-given').value) || 0;
        const whtA = (rcvd * whtR) / 100;
        const gstA = (rcvd * gstR) / 100;
        const total = rcvd + whtA + gstA + adj - disc;
        tr.querySelector('.wht-amt').value = whtA !== 0 ? whtA.toFixed(2) : '';
        tr.querySelector('.gst-amt').value = gstA !== 0 ? gstA.toFixed(2) : '';
        tr.querySelector('.tot-credited').value = total !== 0 ? total.toFixed(2) : '';
        this.calculateTotals();
    },

    showPendingInvoices: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        let invoices = [];
        try {
            const res = await fetch(`api/cash_receipts.php?action=get_pending_invoices&customer_coa_id=${this.selectedReceivedFromCoaId}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.error) throw new Error(data.error);
            invoices = Array.isArray(data) ? data : [];
        } catch (e) { alert('Error loading pending invoices: ' + e.message); return; }

        const old = document.getElementById('cr_pending_popup');
        if (old) old.remove();
        if (window._cr_pending_keydown) {
            document.removeEventListener('keydown', window._cr_pending_keydown);
            window._cr_pending_keydown = null;
        }

        const customerName = document.getElementById('cr_received_from_name')?.value || '';
        const customerCode = document.getElementById('cr_received_from_code')?.value || '';

        const overlay = document.createElement('div');
        overlay.id = 'cr_pending_popup';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const totalBalance = invoices.reduce((s, i) => s + parseFloat(i.balance_amount || 0), 0);

        overlay.innerHTML = `
        <div style="background:#fff;border-radius:6px;width:95%;max-width:960px;height:85vh;max-height:95vh;display:flex;flex-direction:column;font-family:'Segoe UI',sans-serif;box-shadow:0 10px 40px rgba(0,0,0,0.4);overflow:hidden;">
            <div style="background:#1f4668;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:15px;font-weight:700;letter-spacing:1px;">PENDING SALE INVOICES</div>
                    <div style="font-size:12px;opacity:0.85;margin-top:3px;">${customerCode} &nbsp; ${customerName}</div>
                </div>
                <button onclick="document.getElementById('cr_pending_popup').remove(); if(window._cr_pending_keydown) document.removeEventListener('keydown', window._cr_pending_keydown);" style="background:rgba(255,255,255,0.15);border:none;color:white;font-size:20px;cursor:pointer;padding:2px 12px;border-radius:4px;">&times;</button>
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
                    <tbody id="cr_pending_body">
                        ${invoices.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:15px;color:#64748b;font-size:13px;">No pending invoices found.</td></tr>' : invoices.map((inv, idx) => `
                        <tr class="cr-pending-row"
                            data-inv-no="${inv.invoice_no || ''}" 
                            data-inv-date="${inv.invoice_date || ''}" 
                            data-bal="${inv.balance_amount || 0}"
                            ondblclick="window.CRModule.selectPendingInvoice('${inv.invoice_no || ''}', '${inv.invoice_date || ''}', ${inv.balance_amount || 0})" 
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
        const rows = overlay.querySelectorAll('.cr-pending-row');
        
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

            window._cr_pending_keydown = (e) => {
                if (!document.getElementById('cr_pending_popup')) {
                    document.removeEventListener('keydown', window._cr_pending_keydown);
                    window._cr_pending_keydown = null;
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
                        window.CRModule.selectPendingInvoice(
                            selRow.getAttribute('data-inv-no'),
                            selRow.getAttribute('data-inv-date'),
                            selRow.getAttribute('data-bal')
                        );
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    document.getElementById('cr_pending_popup').remove();
                    document.removeEventListener('keydown', window._cr_pending_keydown);
                    window._cr_pending_keydown = null;
                }
            };
            document.addEventListener('keydown', window._cr_pending_keydown);
        }

        overlay.addEventListener('click', (e) => { 
            if (e.target === overlay) {
                overlay.remove(); 
                if (window._cr_pending_keydown) {
                    document.removeEventListener('keydown', window._cr_pending_keydown);
                    window._cr_pending_keydown = null;
                }
            }
        });
    },


    calculateTotals: function() {
        try {
            const typeEl = document.querySelector('input[name="cr_type"]:checked');
            const type = typeEl ? typeEl.value : 'Customer';
            let grandTotal = 0;
            if (type === 'Petty') {
                let tAmt = 0;
                document.querySelectorAll('#crGridBody tr').forEach(tr => {
                    const inp = tr.querySelector('.petty-amt');
                    if (inp) tAmt += parseFloat(inp.value) || 0;
                });
                grandTotal = tAmt;
                const pettyTotalEl = document.getElementById('cr_grand_total_petty');
                if (pettyTotalEl) pettyTotalEl.value = tAmt.toFixed(2);
            } else {
                let tRcvd = 0, tWht = 0, tGst = 0, tAdj = 0, tDisc = 0, tTotal = 0;
                document.querySelectorAll('#crGridBody tr').forEach(tr => {
                    const r = tr.querySelector('.rcvd-amt'), w = tr.querySelector('.wht-amt'), g = tr.querySelector('.gst-amt'), a = tr.querySelector('.adv-adj'), d = tr.querySelector('.disc-given'), t = tr.querySelector('.tot-credited');
                    if (r) tRcvd += parseFloat(r.value) || 0;
                    if (w) tWht += parseFloat(w.value) || 0;
                    if (g) tGst += parseFloat(g.value) || 0;
                    if (a) tAdj += parseFloat(a.value) || 0;
                    if (d) tDisc += parseFloat(d.value) || 0;
                    if (t) tTotal += parseFloat(t.value) || 0;
                });
                const prepayment = parseFloat(document.getElementById('cr_prepayment').value) || 0;
                document.getElementById('cr_total_advance').value = prepayment.toFixed(2);
                
                grandTotal = tTotal + prepayment;
                document.getElementById('cr_total_received').value = grandTotal.toFixed(2);
                document.getElementById('cr_total_wht').value = tWht.toFixed(2);
                document.getElementById('cr_total_gst').value = tGst.toFixed(2);
                document.getElementById('cr_total_adj').value = tAdj.toFixed(2);
                document.getElementById('cr_total_disc').value = tDisc.toFixed(2);
                
                document.getElementById('cr_grand_total_customer').value = grandTotal.toFixed(2);
            }
            document.getElementById('cr_grand_total').value = grandTotal.toFixed(2);
            document.getElementById('cr_amt_words').innerText = `Rupees ${this.numberToWords(grandTotal)} only.`;
        } catch (e) {}
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
        const typeEl = document.querySelector('input[name="cr_type"]:checked');
        const type = typeEl ? typeEl.value : 'Customer';
        if (!this.selectedCashCoaId) { alert("Please select Cash Account."); return; }
        const items = [];
        document.querySelectorAll('#crGridBody tr').forEach(tr => {
            if (type === 'Petty') {
                const amt = parseFloat(tr.querySelector('.petty-amt').value) || 0;
                const coaId = tr.querySelector('.row-coa-id').value;
                if (amt !== 0 && coaId) items.push({ coa_id: coaId, description: tr.querySelector('.desc').value, received_amount: amt, total_credited: amt });
            } else {
                const rcvd = parseFloat(tr.querySelector('.rcvd-amt').value) || 0;
                if (rcvd !== 0) {
                    items.push({ 
                        invoice_no: tr.querySelector('.inv-no').value, 
                        invoice_date: tr.querySelector('.inv-date').value, 
                        received_amount: rcvd, 
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
        if (items.length === 0) { alert("Please add at least one row with a valid amount."); return; }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const payload = { 
            id: this.currentId, 
            serial_no: document.getElementById('cr_sn').value, 
            receipt_date: document.getElementById('cr_date').value, 
            receipt_type: type, 
            cash_account_coa_id: this.selectedCashCoaId, 
            received_from_coa_id: this.selectedReceivedFromCoaId, 
            job_id: document.getElementById('cr_job_id').value || null, 
            employee_id: document.getElementById('cr_employee_id').value || null, 
            prepayment_advance: parseFloat(document.getElementById('cr_prepayment').value) || 0, 
            remarks: document.getElementById('cr_remarks').value, 
            is_cancelled: document.getElementById('cr_is_cancelled').checked ? 1 : 0,
            total_amount: parseFloat(document.getElementById('cr_grand_total').value) || 0,
            amount_in_words: document.getElementById('cr_amt_words').innerText.replace('Rupees ', '').replace(' only.', ''),
            items: items 
        };
        try {
            const res = await fetch(`api/cash_receipts.php?action=save&company_id=${session.company_id || 1}`, { 
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
            alert("Save Failed! Check console for details."); 
        }
    },

    edit: async function(id) {
        try {
            const res = await fetch(`api/cash_receipts.php?action=get&id=${id}`);
            const data = await res.json();
            if (data && data.id) this.loadData(data);
        } catch (e) {}
    },

    loadData: function(data) {
        this.currentId = data.id;
        const typeEl = document.querySelector(`input[name="cr_type"][value="${data.receipt_type}"]`);
        if (typeEl) typeEl.checked = true;
        this.updateReceivedFromLabel(data.receipt_type);
        document.getElementById('cr_sn').value = data.serial_no;
        document.getElementById('cr_date').value = data.receipt_date;
        document.getElementById('cr_job_id').value = data.job_id || '';
        document.getElementById('cr_employee_id').value = data.employee_id || '';
        
        if (data.cash_account) {
            document.getElementById('cr_cash_code').value = data.cash_account.code;
            document.getElementById('cr_cash_name').value = data.cash_account.name;
        }
        if (data.received_from) {
            document.getElementById('cr_received_from_code').value = data.received_from.code;
            document.getElementById('cr_received_from_name').value = data.received_from.name;
        }

        document.getElementById('cr_prepayment').value = data.prepayment_advance;
        document.getElementById('cr_remarks').value = data.remarks;
        document.getElementById('cr_is_cancelled').checked = parseInt(data.is_cancelled) === 1;
        this.is_posted = parseInt(data.is_posted ?? 1) === 1;
        this.updateCancellationUI();
        
        this.selectedCashCoaId = data.cash_account_coa_id;
        this.selectedReceivedFromCoaId = data.received_from_coa_id;
        
        this.fetchBalance(data.cash_account_coa_id, 'cr_cash_balance');
        if (data.received_from_coa_id) this.fetchBalance(data.received_from_coa_id, 'cr_received_from_balance');
        
        const tbody = document.getElementById('crGridBody');
        tbody.innerHTML = '';
        data.items.forEach(item => this.addRow(item, data.receipt_type));
        while (tbody.children.length < 18) { this.addRow({}, data.receipt_type); }
        this.calculateTotals();
    },

    showToast: function(msg) {
        let toast = document.getElementById('cr_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cr_toast';
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
        let sn = parseInt(document.getElementById('cr_sn').value) || 0;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/cash_receipts.php?action=get_next_serial&company_id=${companyId}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
            } catch(e) { return; }
        } else if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/cash_receipts.php?action=get_next_serial&company_id=${companyId}`);
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
            const res = await fetch(`api/cash_receipts.php?action=get&serial_no=${sn}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.id) {
                this.loadData(data);
            } else {
                if (dir === 'next') {
                    this.showToast('آپ آخری ریکارڈ پر ہیں - You are on the last record');
                } else if (dir === 'last') {
                    this.showToast('No saved records found');
                } else {
                    await this.resetForm(false);
                    document.getElementById('cr_sn').value = sn;
                    document.getElementById('cr_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation Error:", e); }
    },

    delete: async function() {
        if (!this.currentId) return;
        if (!confirm("Are you sure you want to delete this record?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/cash_receipts.php?action=delete&id=${this.currentId}&company_id=${session.company_id || 1}`);
            const result = await res.json();
            if (result && result.status === 'success') { 
                alert("Deleted Successfully!"); 
                this.resetForm(true); 
            } else { 
                alert("Delete Failed: " + (result.message || result.error || "Unknown error")); 
            }
        } catch (e) { console.error("Delete Error:", e); }
    },

    openFindModal: async function() {
        const modal = document.getElementById('cr_find_modal');
        if (modal) {
            modal.style.display = 'block';
            
            if (!modal.dataset.draggableInit) {
                modal.dataset.draggableInit = 'true';
                const header = document.getElementById('cr_find_modal_header');
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
                    const tbody = document.getElementById('cr_find_table_body');
                    const rows = tbody ? tbody.querySelectorAll('tr') : [];
                    if (rows.length === 0) return;

                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        window.CRModule.findSelectedIndex = Math.min((window.CRModule.findSelectedIndex || 0) + 1, rows.length - 1);
                        window.CRModule.highlightFindRow(rows);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        window.CRModule.findSelectedIndex = Math.max((window.CRModule.findSelectedIndex || 0) - 1, 0);
                        window.CRModule.highlightFindRow(rows);
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (window.CRModule.findSelectedIndex >= 0 && rows[window.CRModule.findSelectedIndex]) {
                            const serialNo = rows[window.CRModule.findSelectedIndex].dataset.serial;
                            if (serialNo) {
                                window.CRModule.closeFindModal();
                                window.CRModule.navigateBySerial(serialNo);
                            }
                        }
                    } else if (e.key === 'Escape') {
                        window.CRModule.closeFindModal();
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
        const modal = document.getElementById('cr_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('cr_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/cash_receipts.php?action=search_receipts&company_id=${companyId}`);
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
        const tbody = document.getElementById('cr_find_table_body');
        if (!tbody) return;
        
        const q = (document.getElementById('cr_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('cr_find_field')?.value || 'serial_no';
        
        const filtered = (this.findData || []).filter(inv => {
            if (!q) return true;
            let val = '';
            if (field === 'serial_no') val = String(inv.serial_no || '');
            if (field === 'receipt_date') val = String(inv.receipt_date || '');
            if (field === 'customer_name') val = String(inv.customer_name || '');
            if (field === 'cash_account_name') val = String(inv.cash_account_name || '');
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
                <td style="padding: 2px 4px; border: 1px solid #808080;">${inv.cash_account_name || ''}</td>
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
            const res = await fetch(`api/cash_receipts.php?action=get&serial_no=${sn}&company_id=${session.company_id || 1}`);
            const data = await res.json();
            if (data && data.id) {
                this.loadData(data);
            } else {
                alert("Receipt not found!");
            }
        } catch (e) {}
    },

    printReceipt: async function(mode = 'print') {
        if (!this.currentId) {
            alert("Please save or retrieve a receipt first to print.");
            return;
        }

        const sn = document.getElementById('cr_sn').value;
        const date = document.getElementById('cr_date').value;
        const cashAcc = document.getElementById('cr_cash_name').value;
        const remarks = document.getElementById('cr_remarks').value;
        const amtWords = document.getElementById('cr_amt_words').innerText;
        const grandTotal = document.getElementById('cr_grand_total').value;
        const typeEl = document.querySelector('input[name="cr_type"]:checked');
        const isPetty = typeEl && typeEl.value === 'Petty';
        const customerName = isPetty ? 'Petty Cash Account' : document.getElementById('cr_received_from_name').value;

        const isVoucher = (mode === 'voucher');
        const docTitle = isVoucher ? 'CASH RECEIPT VOUCHER' : 'CASH RECEIPT';

        let tableRowsHtml = '';
        if (!isVoucher) {
            document.querySelectorAll('#crGridBody tr').forEach((tr, i) => {
                if (isPetty) {
                    const code = tr.querySelector('.acc-code')?.value || '';
                    const name = tr.querySelector('.acc-name')?.value || '';
                    const desc = tr.querySelector('.desc')?.value || '';
                    const amt = tr.querySelector('.petty-amt')?.value || '0.00';
                    if (parseFloat(amt) > 0) {
                        tableRowsHtml += `
                            <tr>
                                <td style="text-align:center;">${i+1}</td>
                                <td>${code}</td>
                                <td>${name}</td>
                                <td>${desc}</td>
                                <td style="text-align:right;">${parseFloat(amt).toFixed(2)}</td>
                            </tr>
                        `;
                    }
                } else {
                    const invNo = tr.querySelector('.inv-no')?.value || '';
                    const invDate = tr.querySelector('.inv-date')?.value || '';
                    const amt = tr.querySelector('.rcvd-amt')?.value || '0.00';
                    const wht = tr.querySelector('.wht-amt')?.value || '0.00';
                    const gst = tr.querySelector('.gst-amt')?.value || '0.00';
                    const adj = tr.querySelector('.adv-adj')?.value || '0.00';
                    const disc = tr.querySelector('.disc-given')?.value || '0.00';
                    const tot = tr.querySelector('.tot-credited')?.value || '0.00';
                    
                    if (parseFloat(amt) > 0) {
                        tableRowsHtml += `
                            <tr>
                                <td style="text-align:center;">${i+1}</td>
                                <td style="text-align:center;">${invNo}</td>
                                <td style="text-align:center;">${invDate}</td>
                                <td style="text-align:right;">${parseFloat(amt).toFixed(2)}</td>
                                <td style="text-align:right;">${parseFloat(wht).toFixed(2)}</td>
                                <td style="text-align:right;">${parseFloat(gst).toFixed(2)}</td>
                                <td style="text-align:right;">${parseFloat(adj).toFixed(2)}</td>
                                <td style="text-align:right;">${parseFloat(disc).toFixed(2)}</td>
                                <td style="text-align:right;"><b>${parseFloat(tot).toFixed(2)}</b></td>
                            </tr>
                        `;
                    }
                }
            });
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const compName = session.company_name || 'SOFTIFYX ERP';
        const compAddr = session.company_address || 'Company Address Area';
        const compPhone = session.company_phone || 'Tel: 000-000000';
        const compEmail = session.company_email || 'Email: info@softifyx.com';
        const compNtn = session.company_ntn || 'N/A';
        const compStrn = session.company_strn || 'N/A';
        const printedBy = session.username || session.user_name || session.name || 'Administrator';
        
        const logoImg = document.getElementById('userLogo');
        const logoSrc = logoImg ? logoImg.src : '';

        const html = `
            <html>
            <head>
                <title>${docTitle} - ${sn}</title>
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
                    .contact-row { display: flex; align-items: center; gap: 15px; margin-bottom: 4px; }
                    
                    .invoice-badge-area { text-align: right; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
                    .invoice-title { color: #1F4E79; font-size: 14px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; text-align: right; width: 100%; }

                    .details-area { display: flex; justify-content: space-between; margin-bottom: 15px; }
                    .customer-box { border: 1px solid #a0a0a0; border-radius: 4px; width: 45%; padding: 0; overflow: hidden; }
                    .customer-box-header { border-bottom: 1px solid #a0a0a0; padding: 5px 10px; font-weight: bold; color: #1F4E79; }
                    .customer-box-content { padding: 10px; line-height: 1.6; }

                    .invoice-details-table { width: 45%; border-collapse: collapse; font-size: 10px; }
                    .invoice-details-table td { padding: 5px; border-bottom: 1px dotted #ccc; }
                    .invoice-details-table td:first-child { font-weight: bold; color: #1F4E79; width: 100px; }

                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .grid-table th { border: 1px solid #000; padding: 6px 4px; font-size: 9px; text-align: center; text-transform: uppercase; color: black; font-weight: bold; }
                    .grid-table td { border: 1px solid #000; padding: 2px 4px; height: 20px; color: black; }
                    
                    .totals-row td { background: transparent; border: 1px solid #000; font-weight: bold; padding: 6px 4px; border-bottom: 1px solid #000; color: black; }
                    .totals-row .net-total-cell { border: 1px solid #000; text-align: right; color: black; font-weight: bold; }

                    .lower-area { display: flex; justify-content: space-between; margin-top: 15px; }
                    
                    .left-lower { width: 55%; border: 1px solid #a0a0a0; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden; }
                    .lower-box-section { padding: 8px 10px; flex: 1; }
                    .lower-box-section:first-child { border-bottom: 1px solid #a0a0a0; }
                    .lower-box-header { font-weight: bold; color: #1F4E79; margin-bottom: 5px; font-size: 9px; text-transform: uppercase; }
                    .lower-box-content { padding-left: 20px; }

                    .right-lower { width: 40%; border: 1px solid #000; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
                    .summary-row { display: flex; justify-content: space-between; padding: 8px 15px; border-bottom: 1px solid #000; font-weight: bold; color: black; }
                    .summary-row.net-amount { background: transparent; color: black; border-bottom: none; font-size: 14px; padding: 10px 15px; border-top: 1px solid #000; }

                    .footer-signatures { display: flex; justify-content: space-between; margin-top: 50px; padding: 0 15px; }
                    .footer-sig { display: flex; flex-direction: column; align-items: center; width: 140px; }
                    .footer-sig-text { width: 100%; text-align: center; padding-top: 4px; font-size: 10px; font-weight: bold; border-top: 1px solid #000; }
                </style>
            </head>
            <body>
                <div class="page-container">
                    <div class="header-area">
                        <div class="logo-box">
                            ${logoSrc ? '<img src="'+logoSrc+'" alt="Logo">' : ''}
                        </div>
                        <div class="company-info">
                            <h2 class="company-name">${compName}</h2>
                            <div class="company-contacts">
                                <div class="contact-row">
                                    <span>${compAddr}</span>
                                </div>
                                <div class="contact-row">
                                    <span style="display:inline-block; width:50%;">${compPhone}</span>
                                    <span style="display:inline-block; width:50%;">${compEmail}</span>
                                </div>
                            </div>
                        </div>
                        <div class="invoice-badge-area">
                            <div class="invoice-title">${docTitle}</div>
                        </div>
                    </div>

                    <div class="details-area">
                        <div class="customer-box">
                            <div class="customer-box-header">
                                RECEIVED FROM
                            </div>
                            <div class="customer-box-content">
                                <strong>${customerName}</strong><br>
                                Cash Account: <strong>${cashAcc}</strong><br>
                            </div>
                        </div>
                        <table class="invoice-details-table">
                            <tr>
                                <td>Receipt No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${sn}</b></td>
                            </tr>
                            <tr>
                                <td>Date</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${date}</b></td>
                            </tr>
                            <tr>
                                <td>Receipt Type</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${isPetty ? 'Petty Receipt' : 'Customer Receipt'}</b></td>
                            </tr>
                        </table>
                    </div>

                    ${isVoucher ? `
                    <table class="grid-table">
                        <thead>
                            <tr>
                                <th style="width: 15%; text-align: left; border-left: none; border-right: none;">Acc Code</th>
                                <th style="text-align: left; border-left: none; border-right: none;">Account Name</th>
                                <th style="width: 20%; text-align: right; border-left: none; border-right: none;">Debit (Rs.)</th>
                                <th style="width: 20%; text-align: right; border-left: none; border-right: none;">Credit (Rs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="text-align: left; border: none; padding-top: 15px;"></td>
                                <td style="text-align: left; border: none; padding-top: 15px;">${cashAcc}</td>
                                <td style="text-align: right; border: none; padding-top: 15px;">${parseFloat(grandTotal).toFixed(2)}</td>
                                <td style="text-align: right; border: none; padding-top: 15px;"></td>
                            </tr>
                            <tr>
                                <td style="text-align: left; border: none; padding-top: 10px; padding-bottom: 15px;"></td>
                                <td style="text-align: left; border: none; padding-top: 10px; padding-bottom: 15px;">${customerName}</td>
                                <td style="text-align: right; border: none; padding-top: 10px; padding-bottom: 15px;"></td>
                                <td style="text-align: right; border: none; padding-top: 10px; padding-bottom: 15px;">${parseFloat(grandTotal).toFixed(2)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr class="totals-row">
                                <td colspan="2" style="text-align: right; border-left: none; border-right: none; background: transparent;">Totals</td>
                                <td style="text-align: right; border-left: none; border-right: none;">${parseFloat(grandTotal).toFixed(2)}</td>
                                <td style="text-align: right; border-left: none; border-right: none;">${parseFloat(grandTotal).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    ` : `
                    <table class="grid-table">
                        <thead>
                            ${isPetty ? `
                                <tr>
                                    <th style="width: 40px; text-align:center;">Sr.</th>
                                    <th>Account Code</th>
                                    <th>Account Name</th>
                                    <th>Description</th>
                                    <th style="width: 130px; text-align:right;">Amount</th>
                                </tr>
                            ` : `
                                <tr>
                                    <th style="width: 30px; text-align:center;">Sr.</th>
                                    <th style="width: 90px; text-align:center;">Inv No.</th>
                                    <th style="width: 90px; text-align:center;">Inv Date</th>
                                    <th style="text-align:right;">Amount Received</th>
                                    <th style="text-align:right;">W.H.T</th>
                                    <th style="text-align:right;">G.S.T</th>
                                    <th style="text-align:right;">Adv Adj</th>
                                    <th style="text-align:right;">Discount</th>
                                    <th style="text-align:right;">Total Credited</th>
                                </tr>
                            `}
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                        <tfoot>
                            ${isPetty ? `
                                <tr class="totals-row">
                                    <td colspan="4" style="text-align:right;">GRAND TOTAL</td>
                                    <td style="text-align:right;">Rs. ${parseFloat(grandTotal).toFixed(2)}</td>
                                </tr>
                            ` : `
                                <tr class="totals-row">
                                    <td colspan="3" style="text-align:right;">GRAND TOTAL</td>
                                    <td style="text-align:right;">${document.getElementById('cr_total_received')?.value || '0.00'}</td>
                                    <td style="text-align:right;">${document.getElementById('cr_total_wht')?.value || '0.00'}</td>
                                    <td style="text-align:right;">${document.getElementById('cr_total_gst')?.value || '0.00'}</td>
                                    <td style="text-align:right;">${document.getElementById('cr_total_adj')?.value || '0.00'}</td>
                                    <td style="text-align:right;">${document.getElementById('cr_total_disc')?.value || '0.00'}</td>
                                    <td style="text-align:right;">Rs. ${parseFloat(grandTotal).toFixed(2)}</td>
                                </tr>
                            `}
                        </tfoot>
                    </table>
                    `}

                    <div class="lower-area" style="${isVoucher ? 'display: block;' : ''}">
                        <div class="left-lower" style="${isVoucher ? 'width: 100%; border: none;' : ''}">
                            <div class="lower-box-section" style="${isVoucher ? 'border: none; padding-left: 0;' : ''}">
                                <div class="lower-box-header" style="${isVoucher ? 'display: inline-block; font-style: italic; font-weight: normal; margin-right: 5px; color: #000;' : ''}">
                                    AMOUNT IN WORDS${isVoucher ? ' :' : ''}
                                </div>
                                <div class="lower-box-content" style="${isVoucher ? 'display: inline-block; padding-left: 0; font-weight: bold;' : ''}">
                                    ${amtWords}
                                </div>
                            </div>
                            ${isVoucher ? '' : `
                            <div class="lower-box-section">
                                <div class="lower-box-header">
                                    REMARKS
                                </div>
                                <div class="lower-box-content">
                                    ${remarks || '-'}
                                </div>
                            </div>
                            `}
                        </div>
                        ${isVoucher ? '' : `
                        <div class="right-lower" style="justify-content: flex-end; padding: 10px 0;">
                            <div class="summary-row net-amount" style="border: none; padding: 4px 15px; font-size: 11px; font-style: italic; font-weight: bold;">
                                <span>Receipt Total Rs.</span>
                                <span>${parseFloat(grandTotal).toFixed(2)}</span>
                            </div>
                        </div>
                        `}
                    </div>

                    <div class="footer-signatures">
                        <div class="footer-sig">
                            <div class="footer-sig-text">Prepared By<br><span style="font-weight: normal; font-size: 9px; color: #555;">${printedBy}</span></div>
                        </div>
                        <div class="footer-sig">
                            <div class="footer-sig-text">Printed By<br><span style="font-weight: normal; font-size: 9px; color: #555;">${printedBy}</span></div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        let printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = function() {
                setTimeout(function() {
                    printWindow.print();
                    printWindow.close();
                }, 500);
            };
        } else {
            alert("Pop-up blocker prevented printing. Please allow popups for this site.");
        }
    }
};

window.initCashReceiptModule = function() {
    window.CRModule.init();
};
