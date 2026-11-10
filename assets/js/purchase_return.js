// --- PURCHASE RETURN / DEBIT NOTE MODULE LOGIC ---
window.PRModule = {
    vendors: [],
    inventory: [],
    currentMatches: [],
    employees: [],
    jobs: [],
    expenseAccounts: [],
    currentId: null,
    selectedVendorCoaId: null,
    suggestIndex: -1,

    init: async function() {
        console.log("PR Module: Initializing...");
        
        try {
            // Step 1: Immediately show the form and initialize data
            this.resetForm(true);
        } catch (e) {
            console.error("PR Module: Init Reset Error:", e);
        }
        
        // Step 2: Load data in background without blocking init
        this.loadVendors().catch(e => console.error("Load Vendors Error:", e));
        this.loadInventory().catch(e => console.error("Load Inventory Error:", e));
        this.loadEmployees().catch(e => console.error("Load Employees Error:", e));
        this.loadJobs().catch(e => console.error("Load Jobs Error:", e));
        this.loadExpenseAccounts().catch(e => console.error("Load Accounts Error:", e));
        this.loadLocations().catch(e => console.error("Load Locations Error:", e));

        this.setupVendorSearch();
        this.setupKeyboardNav();
    },

    loadVendors: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            this.vendors = await res.json();
            console.log("PR Module: Vendors loaded:", this.vendors.length);
        } catch (e) { console.error("PR Module: Load Vendors Error:", e); }
    },

    loadInventory: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}`);
            this.inventory = await res.json();
            console.log("PR Module: Inventory loaded:", this.inventory.length);
        } catch (e) { console.error("PR Module: Load Inventory Error:", e); }
    },

    loadEmployees: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            this.employees = await res.json();
            const select = document.getElementById('pr_employee_ref');
            if (select) {
                select.innerHTML = '<option value="">Select Employee</option>';
                this.employees.forEach(e => select.innerHTML += `<option value="${e.id}">${e.name}</option>`);
            }
        } catch (e) { console.error("PR Module: Load Employees Error:", e); }
    },

    loadJobs: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/jobs.php?action=get_jobs&company_id=${companyId}`);
            this.jobs = await res.json();
            const select = document.getElementById('pr_job_no');
            if (select) {
                select.innerHTML = '<option value="">Select Job</option>';
                this.jobs.forEach(j => select.innerHTML += `<option value="${j.id}">${j.job_no} - ${j.description}</option>`);
            }
        } catch (e) { console.error("PR Module: Load Jobs Error:", e); }
    },

    loadExpenseAccounts: async function() {
        // Hardcoded as per reference image but keeping logic if needed
        document.getElementById('expense_code').value = '50001003';
        document.getElementById('expense_name').value = 'Purchase Returns';
    },

    loadLocations: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/inventory.php?action=get_locations&company_id=${companyId}`);
            const locations = await res.json();
            const select = document.getElementById('pr_location');
            if (select) {
                select.innerHTML = '';
                locations.forEach(l => select.innerHTML += `<option value="${l.id}">${l.name}</option>`);
                if (locations.length === 0) select.innerHTML = '<option value="1">Main Store</option>';
            }
        } catch (e) { console.error("PR Module: Load Locations Error:", e); }
    },
    setupVendorSearch: function() {
        const input = document.getElementById('vendor_code');
        const suggest = document.getElementById('vendor_suggest');
        if (!input || !suggest) return;

        input.addEventListener('focus', () => {
            if (input.value) input.oninput({ target: input });
        });

        input.addEventListener('keydown', (e) => {
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

        input.oninput = (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (!val) { suggest.style.display = 'none'; return; }
            
            const searchWords = val.split(/\s+/);
            const matches = this.vendors.filter(v => {
                const searchStr = `${v.code} ${v.name} ${v.address || ''}`.toLowerCase();
                return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
            }).slice(0, 15);

            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map(v => `
                    <div onclick="window.PRModule.selectVendor(${v.id})">
                         <b>${v.code}</b> &nbsp; ${v.name}
                    </div>
                `).join('');
                suggest.style.display = 'block';
                suggest.style.zIndex = '9999';
            } else { suggest.style.display = 'none'; }
        };
        
        // Handle focus loss
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
            }
        });
    },

    selectVendor: async function(coaId) {
        const v = this.vendors.find(x => x.id == coaId || x.coa_list_id == coaId);
        if (v) {
            document.getElementById('vendor_code').value = v.code || '';
            document.getElementById('vendor_name').value = v.name || '';
            document.getElementById('vendor_address').value = v.address || '';
            document.getElementById('vendor_tel').value = v.telephone || v.mobile || '';
            document.getElementById('vendor_gst').value = v.st_reg_no || '';
            document.getElementById('vendor_ntn').value = v.ntn_cnic || '';
            this.selectedVendorCoaId = v.id;
            
            // Load Balance
            const balEl = document.getElementById('vendor_balance');
            if (balEl) balEl.value = '...';
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${v.id}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                const bal = await res.json();
                if (balEl) balEl.value = parseFloat(bal.balance || 0).toFixed(2);
            } catch(e) { 
                console.error("Balance fetch error:", e); 
                if (balEl) balEl.value = '0.00';
            }
        }
        document.getElementById('vendor_suggest').style.display = 'none';
        document.getElementById('pr_date').focus();
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

    // --- GRID LOGIC ---
    addRow: function(data = {}) {
        const tbody = document.getElementById('prGridBody');
        const rowIndex = tbody.children.length;
        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        
        tr.innerHTML = `
            <td style="text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0;">${rowIndex + 1}</td>
            <td style="border: 1px solid #cbd5e0;">
                <input type="text" class="grid-input item-code-search" placeholder="">
                <div class="pr-suggest"></div>
            </td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-description" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num pieces"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num qty"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-unit" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-excl" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num tax-rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num tax-amt" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num frth-rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num frth-amt" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-incl" readonly></td>
        `;

        if (data.item_coa_id) {
            tr.dataset.coaId = data.item_coa_id;
            tr.dataset.qtyPerPiece = data.qty_per_piece || 0;
            
            // PROGRAMMATIC ASSIGNMENT
            tr.querySelector('.item-code-search').value = data.item_code || data.code || '';
            
            // SMART FALLBACK
            let displayDesc = (data.description || '').toString().trim();
            const masterName = (data.item_name || data.master_name || data.name || '').toString().trim();
            if (!displayDesc || /^\d+$/.test(displayDesc) || displayDesc.length <= 2) {
                displayDesc = masterName || displayDesc;
            }
            tr.querySelector('.si-description').value = displayDesc;

            tr.querySelector('.pieces').value = (data.pieces && parseFloat(data.pieces) !== 0) ? data.pieces : '';
            tr.querySelector('.qty').value = (data.quantity && parseFloat(data.quantity) !== 0) ? data.quantity : '';
            tr.querySelector('.si-unit').value = data.unit || '';
            tr.querySelector('.rate').value = (data.rate && parseFloat(data.rate) !== 0) ? data.rate : '';
            tr.querySelector('.val-excl').value = (data.value_excl_tax && parseFloat(data.value_excl_tax) !== 0) ? data.value_excl_tax : '';
            tr.querySelector('.tax-rate').value = (data.tax_rate && parseFloat(data.tax_rate) !== 0) ? data.tax_rate : '';
            tr.querySelector('.tax-amt').value = (data.tax_amount && parseFloat(data.tax_amount) !== 0) ? data.tax_amount : '';
            tr.querySelector('.frth-rate').value = (data.further_tax_rate && parseFloat(data.further_tax_rate) !== 0) ? data.further_tax_rate : '';
            tr.querySelector('.frth-amt').value = (data.further_tax_amount && parseFloat(data.further_tax_amount) !== 0) ? data.further_tax_amount : '';
            tr.querySelector('.val-incl').value = (data.value_incl_tax && parseFloat(data.value_incl_tax) !== 0) ? data.value_incl_tax : '';
        }

        tbody.appendChild(tr);
        this.setupGridEvents(tr);
    },
    setupGridEvents: function(tr) {
        const idx = tr.dataset.index;
        const codeInput = tr.querySelector('.item-code-search');
        const suggest = tr.querySelector('.pr-suggest');
        
        codeInput.addEventListener('focus', () => {
            if (codeInput.value) codeInput.dispatchEvent(new Event('input'));
        });

        codeInput.oninput = (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (!val) { suggest.style.display = 'none'; return; }
            
            const searchWords = val.split(/\s+/);
            const matches = typeof window.smartSearchFilterAndSort === 'function' ? 
                window.smartSearchFilterAndSort(this.inventory, val) : 
                this.inventory.filter(i => {
                    const code = i.item_code || i.code || '';
                    const name = i.item_name || i.name || '';
                    const searchStr = ` ${name}`.toLowerCase();
                    return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
                }).slice(0, 15);
            
            this.currentMatches = matches;
            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map((i, mIdx) => `
                    <div onclick="window.PRModule.selectGridItem(${idx}, ${mIdx})">
                         <b>${i.item_code || i.code}</b> &nbsp; ${i.item_name || i.name}
                    </div>
                `).join('');
                suggest.style.display = 'block';
                suggest.style.zIndex = '9999';
            } else { suggest.style.display = 'none'; }

            const tbody = document.getElementById('prGridBody');
            if (tr === tbody.lastElementChild && val !== '') { this.addRow(); }
        };

        tr.querySelectorAll('input').forEach(input => {
            // Auto-select text on focus to allow easy overwriting
            input.addEventListener('focus', () => {
                input.select();
            });

            input.addEventListener('blur', () => {
                if (input.classList.contains('num') && input.value.trim() === '') {
                    input.value = '0.00';
                }
            });
        });

        tr.querySelectorAll('input.num').forEach(input => {
            input.oninput = () => this.calculateRow(idx);
        });

        // Hide suggest on click outside
        document.addEventListener('click', (e) => {
            if (!codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                this.suggestIndex = -1;
            }
        });
    },

    selectGridItem: function(rowIndex, matchIdx) {
        const item = this.currentMatches[matchIdx];
        const tr = document.querySelector(`#prGridBody tr[data-index="${rowIndex}"]`);
        if (item && tr) {
            tr.dataset.coaId = item.id;
            tr.dataset.qtyPerPiece = item.qty_per_piece || 0;
            tr.querySelector('.item-code-search').value = item.item_code || item.code;
            tr.cells[2].querySelector('input').value = item.item_name || item.name;
            tr.cells[5].querySelector('input').value = item.unit || 'Pcs';
            tr.querySelector('.rate').value = (item.sales_price || item.selling_price || 0);
            tr.querySelector('.tax-rate').value = (item.tax_rate || 0);
            this.calculateRow(rowIndex);
            
            // Move focus to Pieces immediately after selection
            const piecesInput = tr.querySelector('.pieces');
            if (piecesInput) setTimeout(() => piecesInput.focus(), 50);
        }
        const suggest = tr.querySelector('.pr-suggest');
        if (suggest) suggest.style.display = 'none';
    },

    calculateRow: function(rowIndex) {
        const tr = document.querySelector(`#prGridBody tr[data-index="${rowIndex}"]`);
        if (!tr) return;

        const qtyPerPiece = parseFloat(tr.dataset.qtyPerPiece) || 0;
        const pieces = parseFloat(tr.querySelector('.pieces').value) || 0;
        
        if (pieces > 0 && qtyPerPiece > 0) {
            if (!document.activeElement || document.activeElement.classList.contains('pieces') || document.activeElement.classList.contains('item-code-search')) {
                tr.querySelector('.qty').value = (pieces * qtyPerPiece).toFixed(2);
            }
        }

        const qty = parseFloat(tr.querySelector('.qty').value) || 0;
        const rate = parseFloat(tr.querySelector('.rate').value) || 0;
        const taxRate = parseFloat(tr.querySelector('.tax-rate').value) || 0;
        const frthRate = parseFloat(tr.querySelector('.frth-rate').value) || 0;

        const valExcl = qty * rate;
        const taxAmt = (valExcl * taxRate) / 100;
        const frthAmt = (valExcl * frthRate) / 100;
        const valIncl = valExcl + taxAmt + frthAmt;

        const setVal = (sel, val) => {
            const el = tr.querySelector(sel);
            if (el) el.value = val.toFixed(2);
        };

        setVal('.val-excl', valExcl);
        setVal('.tax-amt', taxAmt);
        setVal('.frth-amt', frthAmt);
        setVal('.val-incl', valIncl);

        this.calculateTotals();
    },

    calculateTotals: function() {
        let tPieces = 0, tQty = 0, tExcl = 0, tTax = 0, tFrth = 0, tIncl = 0;
        
        document.querySelectorAll('#prGridBody tr').forEach(tr => {
            tPieces += parseFloat(tr.querySelector('.pieces').value) || 0;
            tQty += parseFloat(tr.querySelector('.qty').value) || 0;
            tExcl += parseFloat(tr.querySelector('.val-excl').value) || 0;
            tTax += parseFloat(tr.querySelector('.tax-amt').value) || 0;
            tFrth += parseFloat(tr.querySelector('.frth-amt').value) || 0;
            tIncl += parseFloat(tr.querySelector('.val-incl').value) || 0;
        });

        const setTot = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val > 0 ? val.toFixed(2) : '0.00';
        };

        setTot('tot_pieces', tPieces);
        setTot('tot_qty', tQty);
        setTot('tot_excl', tExcl);
        setTot('tot_tax', tTax);
        setTot('tot_further', tFrth);
        setTot('tot_incl', tIncl);

        // Net Total = Total Incl + Carriage
        const carriage = parseFloat(document.getElementById('pr_carriage').value) || 0;
        const netTotal = tIncl + carriage;
        const netEl = document.getElementById('pr_net_total');
        if (netEl) netEl.value = netTotal.toFixed(2);

        // Balance = Net Total - Amount Received
        const received = parseFloat(document.getElementById('pr_received').value) || 0;
        const balance = netTotal - received;
        const balEl = document.getElementById('pr_balance');
        if (balEl) balEl.value = balance.toFixed(2);

        document.getElementById('pr_amt_words').innerText = `Rupees ${this.numberToWords(netTotal)} only.`;
    },

    numberToWords: function(num) {
        if (num === 0) return "zero and 00/100";
        const parts = num.toFixed(2).split('.');
        const whole = parseInt(parts[0]);
        const decimal = parts[1];
        return `${whole} and ${decimal}/100`;
    },

    setupKeyboardNav: function() {
        const gridBody = document.getElementById('prGridBody');
        if (gridBody) {
            gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveReturn();
            }
        });

        const carriageInput = document.getElementById('pr_carriage');
        if (carriageInput) carriageInput.oninput = () => this.calculateTotals();

        const receivedInput = document.getElementById('pr_received');
        if (receivedInput) receivedInput.oninput = () => this.calculateTotals();
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('prGridBody');
        const suggest = tr.querySelector('.pr-suggest');

        // Handle suggestion box keyboard nav
        if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
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
            const isAtEnd = (target.selectionEnd === target.value.length || target.type === 'number');
            if (e.key === 'Enter' || isAtEnd) {
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
            if (target.selectionStart === 0 || target.type === 'number') {
                e.preventDefault();
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index > 0) allInputs[index - 1].focus();
            }
        }
    },

    resetForm: async function(isNew = false) {
        console.log("PR Module: Resetting Form, isNew:", isNew);
        this.currentId = null;
        this.selectedVendorCoaId = null;
        
        // 1. SET SERIAL AND DATE IMMEDIATELY
        const snField = document.getElementById('pr_sn');
        const dateEl = document.getElementById('pr_date');
        if (snField) snField.value = isNew ? '1' : '';
        if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

        // 2. Reset all header fields
        const inputs = ['pr_purchase_no', 'pr_purchase_date', 'pr_vendor_inv_no', 'pr_vendor_inv_date', 
                       'pr_payment_terms', 'pr_job_no', 'pr_employee_ref', 'pr_location',
                       'pr_remarks', 'pr_carriage', 'pr_net_total', 'pr_received', 'pr_balance', 'vendor_code', 'vendor_name', 'vendor_address', 
                       'vendor_tel', 'vendor_gst', 'vendor_ntn', 'vendor_balance'];
        
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (['pr_carriage', 'pr_net_total', 'pr_received', 'pr_balance'].includes(id)) el.value = '0.00';
                else el.value = '';
            }
        });
        
        const cancelCheck = document.getElementById('pr_is_cancelled');
        if (cancelCheck) cancelCheck.checked = false;

        const natureSelect = document.getElementById('pr_nature_dn');
        if (natureSelect) natureSelect.value = 'Purchase Return (Reduces Inventory)';
        
        // Reset Grid
        const gridBody = document.getElementById('prGridBody');
        if (gridBody) {
            gridBody.innerHTML = '';
            for (let i = 0; i < 8; i++) { this.addRow(); }
        }

        if (isNew) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;
                
                console.log("PR Module: Fetching next serial from dedicated API...");
                const res = await fetch(`api/purchase_return.php?action=next-serial&company_id=${companyId}`, {
                    cache: 'no-store'
                });
                
                const data = await res.json();
                console.log("PR Module: Next Serial Data:", data);
                
                const snEl = document.getElementById('pr_sn');
                if (snEl && data.nextSerial) {
                    snEl.value = data.nextSerial;
                    console.log("PR Module: Set SN to:", data.nextSerial);
                }
            } catch(e) {
                console.error("PR Module: Serial fetch error:", e);
                const snEl = document.getElementById('pr_sn');
                if (snEl) snEl.value = '1';
            }
        }
        
        this.calculateTotals();
        setTimeout(() => {
            const vCode = document.getElementById('vendor_code');
            if (vCode) vCode.focus();
        }, 150);
    },

    saveReturn: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        if (!this.selectedVendorCoaId) { alert("Please select a vendor."); return; }

        const items = [];
        document.querySelectorAll('#prGridBody tr').forEach(tr => {
            const coaId = tr.dataset.coaId;
            if (coaId) {
                items.push({
                    item_coa_id: coaId,
                    description: tr.cells[2].querySelector('input').value,
                    pieces: tr.querySelector('.pieces').value,
                    quantity: tr.querySelector('.qty').value,
                    unit: tr.cells[5].querySelector('input').value,
                    rate: tr.querySelector('.rate').value,
                    value_excl_tax: tr.querySelector('.val-excl').value,
                    tax_rate: tr.querySelector('.tax-rate').value,
                    tax_amount: tr.querySelector('.tax-amt').value,
                    further_tax_rate: tr.querySelector('.frth-rate').value,
                    further_tax_amount: tr.querySelector('.frth-amt').value,
                    value_incl_tax: tr.querySelector('.val-incl').value
                });
            }
        });

        if (items.length === 0) { alert("Please add at least one item."); return; }

        const payload = {
            id: this.currentId,
            serial_no: document.getElementById('pr_sn').value,
            return_date: document.getElementById('pr_date').value,
            purchase_no: document.getElementById('pr_purchase_no').value,
            purchase_date: document.getElementById('pr_purchase_date').value,
            vendor_invoice_no: document.getElementById('pr_vendor_inv_no').value,
            vendor_invoice_date: document.getElementById('pr_vendor_inv_date').value,
            nature_of_debit_note: document.getElementById('pr_nature_dn').value,
            payment_terms: document.getElementById('pr_payment_terms').value,
            expense_account: '50001003',
            vendor_coa_id: this.selectedVendorCoaId,
            inventory_location_id: document.getElementById('pr_location').value,
            job_no: document.getElementById('pr_job_no').value,
            employee_ref: document.getElementById('pr_employee_ref').value,
            remarks: document.getElementById('pr_remarks').value,
            carriage_freight: document.getElementById('pr_carriage').value,
            net_total: document.getElementById('pr_net_total').value,
            amount_received: document.getElementById('pr_received').value,
            is_cancelled: document.getElementById('pr_is_cancelled').checked ? 1 : 0,
            amount_in_words: document.getElementById('pr_amt_words').innerText,
            items: items
        };

        try {
            const res = await fetch(`api/purchases.php?action=save_return&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert("Purchase Return saved successfully!");
                this.resetForm(true);
            } else { alert("Save Error: " + result.message); }
        } catch (e) { console.error("Save Return Error:", e); }
    },

    loadReturnData: function(ret) {
        this.currentId = ret.id;
        document.getElementById('pr_sn').value = ret.serial_no;
        document.getElementById('pr_date').value = ret.return_date;
        document.getElementById('pr_purchase_no').value = ret.purchase_no || '';
        document.getElementById('pr_purchase_date').value = ret.purchase_date || '';
        document.getElementById('pr_vendor_inv_no').value = ret.vendor_invoice_no || '';
        document.getElementById('pr_vendor_inv_date').value = ret.vendor_invoice_date || '';
        document.getElementById('pr_nature_dn').value = ret.nature_of_debit_note || 'Purchase Return (Reduces Inventory)';
        document.getElementById('pr_payment_terms').value = ret.payment_terms || '';
        document.getElementById('pr_job_no').value = ret.job_no || '';
        document.getElementById('pr_employee_ref').value = ret.employee_ref || '';
        document.getElementById('pr_location').value = ret.inventory_location_id || '1';
        document.getElementById('pr_remarks').value = ret.remarks || '';
        document.getElementById('pr_carriage').value = ret.carriage_freight || '0.00';
        document.getElementById('pr_received').value = ret.amount_received || '0.00';
        document.getElementById('pr_is_cancelled').checked = parseInt(ret.is_cancelled) === 1;

        if (ret.vendor_coa_id) { this.selectVendor(ret.vendor_coa_id); }

        const tbody = document.getElementById('prGridBody');
        tbody.innerHTML = '';
        if (ret.items && ret.items.length > 0) {
            ret.items.forEach(item => this.addRow(item));
        }
        while (tbody.children.length < 8) { this.addRow(); }
        this.calculateTotals();
    },

    showToast: function(msg) {
        let toast = document.getElementById('pr_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pr_toast';
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
        let sn = parseInt(document.getElementById('pr_sn').value) || 0;

        if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/purchases.php?action=get_next_return_serial&company_id=${companyId}`);
                    const data = await res.json();
                    sn = (data.next_sn || 2) - 1;
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

        if (sn < 1 && dir !== 'next' && dir !== 'prev') return;

        try {
            let url = `api/purchases.php?action=get_return&serial_no=${sn}&company_id=${companyId}`;
            if (dir === 'next' || dir === 'prev') url += `&dir=${dir}`;
            const res = await fetch(url);
            const ret = await res.json();
            if (ret && ret.id) { 
                this.loadReturnData(ret); 
            } else {
                if (dir === 'next' || dir === 'last') {
                    this.showToast('آپ آخری ریکارڈ پر ہیں - You are on the last record');
                } else if (dir === 'prev') {
                    this.showToast('You are on the first record');
                } else {
                    await this.resetForm(false);
                    document.getElementById('pr_sn').value = sn;
                    document.getElementById('pr_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation Error:", e); }
    },

    deleteReturn: async function() {
        if (!this.currentId) return;
        if (!confirm("Delete this Return?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/purchases.php?action=delete_return&id=${this.currentId}&company_id=${companyId}`, { method: 'POST' });
            const result = await res.json();
            if (result.status === 'success') { this.resetForm(true); }
        } catch (e) { console.error("Delete Error:", e); }
    },

    printReturn: function() {
        if (!this.currentId) { alert("Please save or load a record first."); return; }
        window.print();
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
    }
};

// Global entry point for ERP modular popup system
window.initPurchaseReturnModule = function() {
    console.log("PR Module: Global Init called");
    if (window.PRModule) window.PRModule.init();
};
