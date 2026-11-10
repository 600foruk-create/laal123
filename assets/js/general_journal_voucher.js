// --- GENERAL JOURNAL VOUCHER MODULE LOGIC ---
window.GJVModule = {
    jobs: [],
    employees: [],
    currentId: null,
    suggestIndex: -1,

    init: async function() {
        console.log("GJV Module: Initializing...");
        try {
            this.resetForm(true);
            await this.loadJobs();
            await this.loadEmployees();
            
            const gridBody = document.getElementById('gjGridBody');
            if (gridBody) {
                gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            }
            
            // Unbind any previous keydown listener to avoid duplicates
            if (this._keydownHandler) {
                document.removeEventListener('keydown', this._keydownHandler);
            }
            
            this._keydownHandler = (e) => {
                const container = document.getElementById('gjvContainer');
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                    if (container && container.offsetParent !== null) {
                        e.preventDefault();
                        this.save();
                    }
                } else if (e.key === 'Delete') {
                    if (container && container.offsetParent !== null) {
                        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                            const selectedRow = document.querySelector('#gjGrid tbody tr.gj-row-selected');
                            if (selectedRow) {
                                e.preventDefault();
                                this.clearRowData(selectedRow);
                            }
                        }
                    }
                }

                if (e.key === 'Enter' && !e.target.classList.contains('gj-grid-input')) {
                    const masterSequence = ['gj_date', 'gj_job_id', 'gj_employee_id', 'gj_description', 'gj_remarks'];
                    if (masterSequence.includes(e.target.id)) {
                        e.preventDefault();
                        const index = masterSequence.indexOf(e.target.id);
                        if (index < masterSequence.length - 1) {
                            const next = document.getElementById(masterSequence[index + 1]);
                            if (next) next.focus();
                        } else {
                            const firstGridInput = document.querySelector('#gjGridBody input:not([readonly]):not([type="hidden"])');
                            if (firstGridInput) firstGridInput.focus();
                        }
                    }
                }
            };
            document.addEventListener('keydown', this._keydownHandler);

            // Global click for deselecting row
            if (this._clickHandler) {
                document.removeEventListener('click', this._clickHandler);
            }
            this._clickHandler = (e) => {
                const container = document.getElementById('gjvContainer');
                if (container && container.offsetParent !== null) {
                    if (!e.target.closest('.gj-row-selector')) {
                        const allRows = document.querySelectorAll('#gjGrid tbody tr');
                        allRows.forEach((r, rowIdx) => {
                            r.classList.remove('gj-row-selected');
                            if (r.firstElementChild) r.firstElementChild.innerHTML = rowIdx + 1;
                        });
                    }
                }
            };
            document.addEventListener('click', this._clickHandler);
            
        } catch (err) { 
            console.error("GJV Module Init Error:", err); 
            alert("GJV Init Error: " + err.message + "\nStack: " + err.stack);
        }
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('gj-grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('gjGridBody');
        const suggest = tr.querySelector('.row-suggest');

        // Handle suggestion box keyboard nav
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
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            const isAtEnd = (target.selectionEnd === target.value.length || target.type === 'number' || target.classList.contains('credit-input') || target.classList.contains('debit-input'));
            if (e.key === 'Tab' || isAtEnd) {
                e.preventDefault();
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index < allInputs.length - 1) {
                    allInputs[index + 1].focus();
                } else {
                    this.addRow();
                    setTimeout(() => {
                        const newInputs = getAllVisibleInputs();
                        if (newInputs[index + 1]) newInputs[index + 1].focus();
                    }, 50);
                }
            }
        } else if (e.key === 'ArrowRight') {
            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
            if (isFullySelected) {
                e.preventDefault();
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index < allInputs.length - 1) allInputs[index + 1].focus();
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
            const select = document.getElementById('gj_job_id');
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
            const select = document.getElementById('gj_employee_id');
            if (select) {
                select.innerHTML = '<option value="">Select Employee</option>';
                this.employees.forEach(e => select.innerHTML += `<option value="${e.id}">${e.name}</option>`);
            }
        } catch (e) {}
    },

    clearRowData: function(row) {
        if (!row) return;
        const inputs = row.querySelectorAll('input:not([type="hidden"])');
        inputs.forEach(inp => {
            if (!inp.readOnly || inp.classList.contains('gj-grid-input')) inp.value = '';
        });
        const accId = row.querySelector('.row-coa-id');
        if (accId) accId.value = '';
        
        const debit = row.querySelector('.debit-input');
        const credit = row.querySelector('.credit-input');
        if (debit) { debit.readOnly = false; debit.value = ''; }
        if (credit) { credit.readOnly = false; credit.value = ''; }

        this.calculateTotals();
    },

    resetForm: function(isNew = false) {
        this.currentId = null;
        const ids = ['gj_sn', 'gj_date', 'gj_job_id', 'gj_employee_id', 'gj_description', 'gj_total_debit', 'gj_total_credit', 'gj_remarks'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        
        const cancel = document.getElementById('gj_is_cancelled');
        if (cancel) cancel.checked = false;
        this.updateCancellationUI();

        const gridBody = document.getElementById('gjGridBody');
        if (gridBody) {
            gridBody.innerHTML = '';
            for (let i = 0; i < 40; i++) { this.addRow(); }
        }
        this.calculateTotals();

        if (isNew) {
            const dateEl = document.getElementById('gj_date');
            if (dateEl) { dateEl.value = new Date().toISOString().split('T')[0]; dateEl.focus(); }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            fetch(`api/general_journal_voucher.php?action=get_next_serial&company_id=${session.company_id || 1}`)
                .then(r => r.json()).then(d => { document.getElementById('gj_sn').value = d.next_sn; })
                .catch(() => { document.getElementById('gj_sn').value = '1'; });
        }
    },

    addRow: function(data = {}) {
        try {
            const tbody = document.getElementById('gjGridBody');
            if (!tbody) return;
            const idx = tbody.children.length;
            const tr = tbody.insertRow();
            tr.style.height = '20px';

            tr.innerHTML = `
                <td class="gj-row-selector" style="width: 30px; text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; height: 20px; font-weight: bold; cursor: pointer;">${idx + 1}</td>
                <td class="gj-grid-cell" style="width: 100px; position:relative;">
                    <input type="text" class="gj-grid-input acc-code" value="${data.coa_code || ''}" onfocus="this.select()" onclick="this.select()">
                    <div class="gj-suggest row-suggest" style="width:500px; top:24px;"></div>
                </td>
                <td class="gj-grid-cell" style="width: 220px;">
                    <input type="text" class="gj-grid-input acc-name" value="${data.coa_name || ''}" onfocus="this.select()" onclick="this.select()">
                    <input type="hidden" class="row-coa-id" value="${data.coa_id || ''}">
                </td>
                <td class="gj-grid-cell" style="width: 1fr;"><input type="text" class="gj-grid-input desc" value="${data.description || ''}" onfocus="this.select()" onclick="this.select()"></td>
                <td class="gj-grid-cell" style="width: 110px;"><input type="text" class="gj-grid-input num debit-input" value="${data.debit || ''}" onfocus="this.select()" onclick="this.select()"></td>
                <td class="gj-grid-cell" style="width: 110px;"><input type="text" class="gj-grid-input num credit-input" value="${data.credit || ''}" onfocus="this.select()" onclick="this.select()"></td>
            `;

            this.setupRowSmartSearch(tr);

            // Row click-to-select
            tr.querySelector('.gj-row-selector').addEventListener('click', () => {
                const allRows = document.querySelectorAll('#gjGrid tbody tr');
                const isSelected = tr.classList.contains('gj-row-selected');
                allRows.forEach((r, rowIdx) => {
                    r.classList.remove('gj-row-selected');
                    if (r.firstElementChild) r.firstElementChild.innerHTML = rowIdx + 1;
                });
                if (!isSelected) {
                    tr.classList.add('gj-row-selected');
                    tr.firstElementChild.innerHTML = '&#10005;';
                    const container = document.getElementById('gjvContainer');
                    if (container) {
                        if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
                        container.focus({ preventScroll: true });
                    }
                }
            });

            const debitInp = tr.querySelector('.debit-input');
            const creditInp = tr.querySelector('.credit-input');

            tr.querySelectorAll('input').forEach(input => {
                input.addEventListener('focus', () => {
                    if (input.classList.contains('num')) {
                        input.select();
                    }
                });
                input.addEventListener('blur', () => {
                    if (input.classList.contains('num')) {
                        const val = input.value.trim();
                        if (val !== '') {
                            const parsed = parseFloat(val);
                            if (!isNaN(parsed)) {
                                input.value = parsed.toFixed(2);
                            } else {
                                input.value = '';
                            }
                        }
                    }
                });
            });

            const updateExclusivity = () => {
                const debVal = debitInp.value.trim();
                const credVal = creditInp.value.trim();
                const debNum = parseFloat(debVal) || 0;
                const credNum = parseFloat(credVal) || 0;

                if (debNum > 0 || (debVal !== '' && debVal !== '0.00' && !isNaN(debNum))) {
                    creditInp.value = '';
                    creditInp.readOnly = true;
                    creditInp.style.background = '#f1f5f9';
                } else if (credNum > 0 || (credVal !== '' && credVal !== '0.00' && !isNaN(credNum))) {
                    debitInp.value = '';
                    debitInp.readOnly = true;
                    debitInp.style.background = '#f1f5f9';
                } else {
                    debitInp.readOnly = false;
                    debitInp.style.background = 'transparent';
                    creditInp.readOnly = false;
                    creditInp.style.background = 'transparent';
                }
                this.calculateTotals();
            };

            debitInp.addEventListener('input', updateExclusivity);
            creditInp.addEventListener('input', updateExclusivity);
            debitInp.addEventListener('blur', updateExclusivity);
            creditInp.addEventListener('blur', updateExclusivity);

            // Run exclusivity check initially (helps for prefilled items)
            updateExclusivity();

        } catch (e) { console.error("Add Row Error:", e); }
    },

    setupRowSmartSearch: function(tr) {
        const codeInput = tr.querySelector('.acc-code');
        const nameInput = tr.querySelector('.acc-name');
        const suggest = tr.querySelector('.row-suggest');
        if (!nameInput || !codeInput || !suggest) return;

        const handleSearch = async (val, activeInp) => {
            const targetInput = activeInp || (document.activeElement && (document.activeElement === nameInput || document.activeElement === codeInput) ? document.activeElement : codeInput);
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const res = await fetch(`api/general_journal_voucher.php?action=search_accounts&q=${encodeURIComponent(val)}&company_id=${session.company_id || 1}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    this.suggestIndex = -1;
                    const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
                    const limited = data.slice(0, maxLimit);
                    suggest.innerHTML = limited.map(item => `
                        <div onclick="window.GJVModule.selectRowAccount(this, ${item.id}, '${item.code}', '${item.name}')" style="padding: 5px 8px; cursor: pointer; font-size: 11.5px; border-bottom: 1px solid #f1f5f9;">
                             <b>${item.code}</b> &nbsp; ${item.name}
                        </div>
                    `).join('');
                    suggest.style.display = 'block';
                    if (typeof window.positionGridDropdown === 'function') {
                        window.positionGridDropdown(suggest, targetInput);
                    }
                } else { suggest.style.display = 'none'; }
            } catch (e) {}
        };

        const setupEvents = (inp) => {
            inp.addEventListener('focus', () => {
                if (inp.value) handleSearch(inp.value, inp);
            });
            inp.addEventListener('blur', () => {
                setTimeout(() => { suggest.style.display = 'none'; }, 250);
            });
            inp.addEventListener('input', (e) => handleSearch(e.target.value, inp));
        };

        setupEvents(codeInput);
        setupEvents(nameInput);

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

    calculateTotals: function() {
        try {
            let totalDebit = 0;
            let totalCredit = 0;
            document.querySelectorAll('#gjGridBody tr').forEach(tr => {
                const deb = tr.querySelector('.debit-input');
                const cred = tr.querySelector('.credit-input');
                if (deb) totalDebit += parseFloat(deb.value) || 0;
                if (cred) totalCredit += parseFloat(cred.value) || 0;
            });
            
            document.getElementById('gj_total_debit').value = totalDebit.toFixed(2);
            document.getElementById('gj_total_credit').value = totalCredit.toFixed(2);

            const diff = Math.abs(totalDebit - totalCredit);
            const diffEl = document.getElementById('gj_difference_msg');
            if (diffEl) {
                if (diff > 0.005) {
                    diffEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i>&nbsp;There is a difference of Rs. ${diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} in totals.`;
                    diffEl.style.display = 'flex';
                } else {
                    diffEl.innerHTML = '';
                    diffEl.style.display = 'none';
                }
            }

            document.getElementById('gj_amt_words').innerText = `Rupees ${this.numberToWords(totalDebit)} only.`;
        } catch (e) {}
    },

    numberToWords: function(num) {
        if (num === 0) return 'zero and 00/100';
        const wholeNum = Math.floor(num);
        const decimal = Math.round((num - wholeNum) * 100);
        const decimalStr = decimal < 10 ? '0' + decimal : String(decimal);

        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                      'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

        function convert(n) {
            if (n === 0) return '';
            if (n < 20) return ones[n] + ' ';
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '') + ' ';
            if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred ' + convert(n % 100);
            if (n < 100000) return convert(Math.floor(n / 1000)) + 'thousand ' + convert(n % 1000);
            if (n < 10000000) return convert(Math.floor(n / 100000)) + 'lakh ' + convert(n % 100000);
            return convert(Math.floor(n / 10000000)) + 'crore ' + convert(n % 10000000);
        }

        let words = convert(wholeNum).trim();
        words = words.charAt(0).toUpperCase() + words.slice(1);
        return `${words} and ${decimalStr}/100`;
    },

    save: async function() {
        const totalDebit = parseFloat(document.getElementById('gj_total_debit').value) || 0;
        const totalCredit = parseFloat(document.getElementById('gj_total_credit').value) || 0;
        
        if (totalDebit === 0 && totalCredit === 0) {
            alert("Voucher cannot be empty.");
            return;
        }

        if (totalDebit !== totalCredit) {
            alert("Warning: Total Debit and Total Credit must balance (be equal) before saving!");
            return;
        }

        const items = [];
        let valid = true;
        document.querySelectorAll('#gjGridBody tr').forEach(tr => {
            const coaId = tr.querySelector('.row-coa-id').value;
            const deb = parseFloat(tr.querySelector('.debit-input').value) || 0;
            const cred = parseFloat(tr.querySelector('.credit-input').value) || 0;
            
            if (deb > 0 || cred > 0) {
                if (!coaId) {
                    alert("One of the transaction lines does not have a valid Chart of Account selected.");
                    valid = false;
                    return;
                }
                items.push({
                    coa_id: coaId,
                    description: tr.querySelector('.desc').value,
                    debit: deb,
                    credit: cred
                });
            }
        });

        if (!valid) return;
        if (items.length === 0) { alert("Please add at least one line with Debit or Credit."); return; }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const payload = { 
            id: this.currentId, 
            serial_no: document.getElementById('gj_sn').value, 
            voucher_date: document.getElementById('gj_date').value, 
            job_id: document.getElementById('gj_job_id').value || null, 
            employee_id: document.getElementById('gj_employee_id').value || null, 
            description: document.getElementById('gj_description').value, 
            remarks: document.getElementById('gj_remarks').value, 
            is_cancelled: document.getElementById('gj_is_cancelled').checked ? 1 : 0,
            is_posted: 1,
            total_amount: totalDebit,
            items: items 
        };

        try {
            const res = await fetch(`api/general_journal_voucher.php?action=save&company_id=${session.company_id || 1}`, { 
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
            const res = await fetch(`api/general_journal_voucher.php?action=get&id=${id}`);
            const data = await res.json();
            if (data && data.id) this.loadData(data);
        } catch (e) {}
    },

    loadData: function(data) {
        this.currentId = data.id;
        document.getElementById('gj_sn').value = data.serial_no;
        document.getElementById('gj_date').value = data.voucher_date;
        document.getElementById('gj_job_id').value = data.job_id || '';
        document.getElementById('gj_employee_id').value = data.employee_id || '';
        document.getElementById('gj_description').value = data.description || '';
        document.getElementById('gj_remarks').value = data.remarks || '';
        document.getElementById('gj_is_cancelled').checked = parseInt(data.is_cancelled) === 1;
        this.is_posted = parseInt(data.is_posted !== undefined ? data.is_posted : 1) === 1; // Default to posted for old records
        this.updateCancellationUI();

        const tbody = document.getElementById('gjGridBody');
        tbody.innerHTML = '';
        data.items.forEach(item => this.addRow(item));
        while (tbody.children.length < 40) { this.addRow(); }
        this.calculateTotals();
    },

    showToast: function(msg) {
        let toast = document.getElementById('gj_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'gj_toast';
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
        let sn = parseInt(document.getElementById('gj_sn').value) || 0;
        
        if (dir === 'last') {
            try {
                const res = await fetch('api/general_journal_voucher.php?action=get_max_serial&company_id=' + companyId);
                const data = await res.json();
                sn = (data.max_sn || 1) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (sn === 0 || dir === 'this') {
            if (dir === 'next') {
                try {
                    const res = await fetch('api/general_journal_voucher.php?action=get_max_serial&company_id=' + companyId);
                    const data = await res.json();
                    sn = (data.max_sn || 1) - 1;
                    dir = undefined;
                } catch(e) { return; }
            } else if (dir !== 'next' && dir !== 'prev') {
                sn = 1;
                dir = undefined;
            }
        } else {
            if (dir !== 'next' && dir !== 'prev') {
                dir = undefined;
            }
        }

        if (sn > 0 || dir) {
            try {
                let url = 'api/general_journal_voucher.php?action=fetch&sn=' + sn + '&company_id=' + companyId;
                if (dir && (dir === 'next' || dir === 'prev')) {
                    url += '&dir=' + dir;
                }
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    this.loadData(data);
                } else {
                    if (dir === 'next' || dir === 'last') {
                        this.showToast ? this.showToast('You are on the last record') : alert('You are on the last record');
                    } else if (dir === 'prev') {
                        this.showToast ? this.showToast('You are on the first record') : alert('You are on the first record');
                    } else {
                        alert('Record not found.');
                        this.resetForm(true);
                    }
                }
            } catch (err) { console.error(err); }
        }
    },

    delete: async function() {
        if (!this.currentId) return;
        if (!confirm("Are you sure you want to delete this voucher permanently?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch('api/general_journal_voucher.php?action=delete&id=' + this.currentId + '&company_id=' + (session.company_id || 1));
            const result = await res.json();
            if (result && result.status === 'success') {
                alert("Deleted successfully!");
                this.resetForm(true);
            } else { 
                alert("Delete Failed: " + (result.message || result.error || "Unknown error")); 
            }
        } catch (e) { console.error("Delete Error:", e); }
    },

    openCOA: function() {
        if (window.openSecondaryModularPopup) window.openSecondaryModularPopup('Navigation/Maintain/chart_of_accounts.html', 'fa-sitemap', 'COA', window.initChartOfAccountsView, 'COA', true);
    },

    postVoucher: async function() {
        if (!this.currentId) { alert("Please save the voucher first."); return; }
        if (document.getElementById('gj_is_cancelled').checked) { alert("Cannot post a cancelled voucher."); return; }
        if (!confirm(`Are you sure you want to ${this.is_posted ? 'Unpost' : 'Post'} this voucher?`)) return;
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const res = await fetch(`api/general_journal_voucher.php?action=toggle_post&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentId })
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert(`Voucher successfully ${result.is_posted ? 'Posted' : 'Unposted'}.`);
                this.is_posted = !!result.is_posted;
                this.updateCancellationUI();
            } else {
                alert("Failed to post: " + result.message);
            }
        } catch (e) {
            alert("Error posting voucher.");
        }
    },

    findVoucher: async function() {
        await this.renderFindTable();
        const modal = document.getElementById('gj_find_modal');
        if (modal) modal.style.display = 'flex';
    },

    closeFindModal: function() {
        const modal = document.getElementById('gj_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('gj_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/general_journal_voucher.php?action=search_vouchers&company_id=${companyId}`);
            this.findData = await res.json();
            this.findSortField = 'serial_no';
            this.findSortDesc = false;
            this.filterFindTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const qInput = document.getElementById('gj_find_search');
        const q = (qInput ? qInput.value : '').toLowerCase();
        const fInput = document.getElementById('gj_find_field');
        const field = fInput ? fInput.value : 'serial_no';
        
        let filtered = (this.findData || []).filter(it => {
            if (!q) return true;
            let val = it[field];
            if (val == null) return false;
            return val.toString().toLowerCase().includes(q);
        });
        
        this.renderFindGrid(filtered);
    },

    sortFindGrid: function(field) {
        if (this.findSortField === field) {
            this.findSortDesc = !this.findSortDesc;
        } else {
            this.findSortField = field;
            this.findSortDesc = false;
        }
        
        const qInput = document.getElementById('gj_find_search');
        const q = (qInput ? qInput.value : '').toLowerCase();
        const fInput = document.getElementById('gj_find_field');
        const filterField = fInput ? fInput.value : 'serial_no';
        let data = (this.findData || []).filter(it => {
            if (!q) return true;
            let val = it[filterField];
            if (val == null) return false;
            return val.toString().toLowerCase().includes(q);
        });
        
        data.sort((a, b) => {
            let valA = a[this.findSortField];
            let valB = b[this.findSortField];
            
            if (this.findSortField === 'serial_no') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }
            
            if (valA < valB) return this.findSortDesc ? 1 : -1;
            if (valA > valB) return this.findSortDesc ? -1 : 1;
            return 0;
        });

        this.renderFindGrid(data);
    },

    renderFindGrid: function(data) {
        const tbody = document.getElementById('gj_find_table_body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">No vouchers found.</td></tr>';
            return;
        }

        data.forEach((it, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index;
            tr.dataset.selected = 'false';
            
            const isPosted = (it.is_posted == 1);
            const isCancelled = (it.is_cancelled == 1);
            
            tr.innerHTML = `
                <td class="row-selector" style="padding: 2px; border: 1px solid #cbd5e0; text-align: center;"><span class="row-indicator"></span></td>
                <td style="padding: 2px 4px; border: 1px solid #cbd5e0; font-weight: bold;">${it.serial_no}</td>
                <td style="padding: 2px 4px; border: 1px solid #cbd5e0;">${it.voucher_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #cbd5e0; text-align: center; color: ${isPosted ? '#28a745' : '#dc3545'}; font-weight: bold;">${isPosted ? '&#10004;' : '&#10008;'}</td>
                <td style="padding: 2px 4px; border: 1px solid #cbd5e0; color: ${isCancelled ? '#dc3545' : '#333'};">${isCancelled ? 'Cancelled' : 'Active'}</td>
            `;
            
            tr.onclick = () => this.selectFindRow(tr, it);
            tr.ondblclick = () => {
                this.closeFindModal();
                this.edit(it.id);
            };
            
            tbody.appendChild(tr);
        });
    },

    selectFindRow: function(tr, it) {
        const tbody = document.getElementById('gj_find_table_body');
        if (!tbody) return;
        
        Array.from(tbody.children).forEach(row => {
            row.classList.remove('selected');
            const ind = row.querySelector('.row-indicator');
            if (ind) ind.innerHTML = '';
        });
        
        tr.classList.add('selected');
        const ind = tr.querySelector('.row-indicator');
        if (ind) ind.innerHTML = '&#9654;';
        
        if (it && it.created_at) {
            const d = new Date(it.created_at);
            const dStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US');
            document.getElementById('gj_find_added_on').value = dStr;
        } else {
            document.getElementById('gj_find_added_on').value = '';
        }
    },

    print: async function() { 
        if (document.querySelectorAll('#gjGridBody tr').length > 0 && document.querySelector('.acc-code').value) {
            // Save if there's data, otherwise just proceed if it has an ID
            if (!this.currentId) {
                alert("Please save the voucher before printing.");
                return;
            }
        } else if (!this.currentId) {
            alert("Please add data and save before printing.");
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const company = JSON.parse(localStorage.getItem('softifyx_company') || '{}');
        const compName = session.company_name || company.name || 'SOFTIFYX ERP';
        const compAddr = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
        const compPhone = company.phone || '+92 348 7240256';
        const compEmail = company.email || 'info@seastonepipes.com';
        const logoSrc = document.getElementById('userLogo') ? document.getElementById('userLogo').src : '';
        const printedBy = session.name || session.username || 'Administrator';

        const sn = document.getElementById('gj_sn').value;
        let date = document.getElementById('gj_date').value;
        if (date) {
            const dParts = date.split('-');
            if (dParts.length === 3) date = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
        }
        
        const description = document.getElementById('gj_description').value;

        let itemsHtml = '';
        let totalDeb = 0;
        let totalCred = 0;
        let rowIndex = 1;
        
        document.querySelectorAll('#gjGridBody tr').forEach((tr) => {
            const codeEl = tr.querySelector('.acc-code');
            const code = codeEl ? codeEl.value : '';
            if (code) {
                const nameEl = tr.querySelector('.acc-name');
                const name = nameEl ? nameEl.value : '';
                const descEl = tr.querySelector('.desc');
                const desc = descEl ? descEl.value : '';
                const debEl = tr.querySelector('.debit-input');
                const deb = debEl ? parseFloat(debEl.value) : 0;
                const credEl = tr.querySelector('.credit-input');
                const cred = credEl ? parseFloat(credEl.value) : 0;
                
                totalDeb += deb;
                totalCred += cred;

                itemsHtml += `
                    <tr>
                        <td style="text-align:center;">${rowIndex++}</td>
                        <td style="text-align:left;">${code}</td>
                        <td style="text-align:left;">
                            <div>${name}</div>
                            ${desc ? `<div style="font-size:10px; font-style:italic; color:#555; margin-top:2px;">${desc}</div>` : ''}
                        </td>
                        <td style="text-align:right;">${deb > 0 ? deb.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}</td>
                        <td style="text-align:right;">${cred > 0 ? cred.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}</td>
                    </tr>
                `;
            }
        });

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>General Journal Voucher - ${sn}</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                <style>
                    @page { margin: 0; size: auto; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.4; margin: 2mm 5mm; padding: 5px; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    
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
                    .invoice-type-badge { background: #1F4E79; color: white; padding: 4px 10px; font-size: 10px; font-weight: bold; border-radius: 4px; display: inline-block; text-transform: uppercase; }

                    .title-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; }

                    .info-boxes { display: flex; gap: 20px; margin-bottom: 20px; }
                    .info-box { flex: 1; border: 1px solid #333; padding: 8px; position: relative; min-height: 40px; }
                    .box-label { font-weight: bold; width: 80px; display: inline-block; }

                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                    .grid-table thead th { border: 1px solid #333; background: #f1f5f9; padding: 4px; text-align: center; font-size: 11px; }
                    .grid-table tbody td { padding: 2px 4px; border: 1px solid #333; line-height: 1.2; }
                    .grid-table tfoot td { border: 2px solid #333; padding: 4px; font-weight: bold; }

                    .footer { margin-top: 50px; }
                    .signature-line { border-top: 1px solid #333; width: 180px; margin-top: 40px; text-align: center; font-weight: bold; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="header-area">
                    <div class="logo-box">
                        <img src="${logoSrc}" alt="Logo" onerror="this.style.display='none'">
                    </div>
                    <div class="company-info">
                        <div class="company-name">${compName}</div>
                        <div class="company-contacts">
                            <div class="contact-row">
                                <span><i class="fas fa-map-marker-alt"></i> ${compAddr}</span>
                            </div>
                            <div class="contact-row">
                                <span><i class="fas fa-phone-alt"></i> ${compPhone}</span>
                                <span><i class="fas fa-envelope"></i> ${compEmail}</span>
                            </div>
                        </div>
                    </div>
                    <div class="invoice-badge-area">
                        <div class="invoice-title">GENERAL JOURNAL VOUCHER</div>
                        <div class="invoice-type-badge">ACCOUNTS</div>
                    </div>
                </div>

                <div class="title-row">
                    <div>
                        <div><b>Serial No.</b> &nbsp; <span style="font-size:14px; font-weight:bold; color:blue;">${sn}</span></div>
                        <div style="margin-top:4px;"><b>Date</b> &nbsp; ${date}</div>
                    </div>
                </div>

                <div class="info-boxes">
                    <div class="info-box">
                        <span style="position: absolute; top: -8px; left: 10px; background: #fff; padding: 0 4px; font-size: 9px; font-weight: bold; color: #1F4E79;">VOUCHER DETAILS</span>
                        <div style="margin-top: 5px;"><span class="box-label">Description:</span> ${description}</div>
                    </div>
                </div>

                <table class="grid-table">
                    <thead>
                        <tr>
                            <th style="width:30px;">#</th>
                            <th style="width:100px; text-align:left;">Acc Code</th>
                            <th style="text-align:left;">Account Name</th>
                            <th style="width:100px;">Debit (Rs.)</th>
                            <th style="width:100px;">Credit (Rs.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" style="text-align:right;">Total:</td>
                            <td style="text-align:right;">${totalDeb > 0 ? totalDeb.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}</td>
                            <td style="text-align:right;">${totalCred > 0 ? totalCred.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}</td>
                        </tr>
                    </tfoot>
                </table>

                <div class="footer">
                    <div style="display:flex; justify-content:space-between; margin-top:30px;">
                        <div class="signature-line">Prepared By<br><span style="font-weight:normal;">${printedBy}</span></div>
                        <div class="signature-line">Checked By</div>
                        <div class="signature-line">Authorized Signatory</div>
                    </div>
                    <div style="text-align:center; margin-top:20px; font-size:9px; color:#666;">
                        Printed on ${new Date().toLocaleString()} by ${printedBy}
                    </div>
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
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
        const cancelEl = document.getElementById('gj_is_cancelled');
        const isCancelled = cancelEl ? cancelEl.checked : false;
        const stamp = document.getElementById('gj_cancelled_stamp');
        const unpostedStamp = document.getElementById('gj_unposted_stamp');
        const postedStamp = document.getElementById('gj_posted_stamp');
        const label = document.getElementById('gj_cancel_label');
        const btnPost = document.getElementById('gj_btn_post');
        
        if (stamp) {
            stamp.style.display = isCancelled ? 'block' : 'none';
        }
        
        if (this.is_posted) {
            if (postedStamp) postedStamp.style.display = 'block';
            if (unpostedStamp) unpostedStamp.style.display = 'none';
            if (btnPost) btnPost.innerHTML = 'Unpost';
        } else {
            if (postedStamp) postedStamp.style.display = 'none';
            if (unpostedStamp) unpostedStamp.style.display = (!isCancelled && this.currentId) ? 'block' : 'none';
            if (btnPost) btnPost.innerHTML = 'Post';
        }

        if (label) {
            label.style.color = isCancelled ? '#dc3545' : '#475569';
            label.style.fontWeight = isCancelled ? '700' : '500';
        }
    }
};

window.initGJVModule = function() {
    window.GJVModule.init();
};



