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
    isPosted: false,

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

        // Cancel checkbox stamp
        const cancelCb = document.getElementById('pr_is_cancelled');
        if (cancelCb) cancelCb.addEventListener('change', () => this.toggleCancelledStamp());

        // Post button
        const postBtn = document.getElementById('pr_post_btn');
        if (postBtn) postBtn.addEventListener('click', () => this.togglePost());
    },

    toggleCancelledStamp: function() {
        const checkbox = document.getElementById('pr_is_cancelled');
        const stamp = document.getElementById('pr_cancelled_stamp');
        if (checkbox && stamp) {
            stamp.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    togglePost: async function() {
        if (!this.currentId) return alert("Pehle koi record save ya load karein.");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const newPostedState = this.isPosted ? 0 : 1;
        const confirmMsg = newPostedState
            ? "Kya aap is Return ko Post karna chahte hain?"
            : "Kya aap is Return ko Un-Post karna chahte hain? Ledger entry hata di jayegi.";
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`api/purchases.php?action=toggle_post_return&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentId, is_posted: newPostedState })
            });
            const result = await res.json();
            if (result.status === 'success') {
                this.navigate('this');
            } else {
                alert("Error: " + result.message);
            }
        } catch(e) { alert("Post status change fail ho gaya."); }
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
                if (balEl) {
                    const balanceVal = parseFloat(bal.balance || 0);
                    if (balanceVal > 0) {
                        balEl.value = Math.abs(balanceVal).toFixed(2) + ' Dr';
                        balEl.style.color = '#16a34a'; // Green - vendor owes us
                    } else if (balanceVal < 0) {
                        balEl.value = Math.abs(balanceVal).toFixed(2) + ' Cr';
                        balEl.style.color = '#dc2626'; // Red - we owe vendor
                    } else {
                        balEl.value = '0.00';
                        balEl.style.color = '#000';
                    }
                }
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
            <td class="row-selector" style="text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0; cursor:pointer;"></td>
            <td style="border: 1px solid #cbd5e0;">
                <input type="text" class="grid-input item-code-search" placeholder="">
                <div class="po-suggest"></div>
            </td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-description"></td>
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
        const suggest = tr.querySelector('.po-suggest');
        
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
                    <div onclick="window.PRModule.selectGridItem(${tr.dataset.index}, ${mIdx})">
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
                    const code = tr.querySelector('.item-code-search').value.trim();
                    if (code !== '') {
                        input.value = '0.00';
                    }
                }
            });
        });

        tr.querySelectorAll('input.num').forEach(input => {
            input.oninput = () => this.calculateRow(tr.dataset.index);
        });

        // Hide suggest on click outside
        document.addEventListener('click', (e) => {
            if (!codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                this.suggestIndex = -1;
            }
        });

        const selector = tr.querySelector('.row-selector');
        if (selector) {
            selector.addEventListener('click', () => {
                if (tr.classList.contains('selected-row')) {
                    tr.classList.remove('selected-row');
                    selector.innerHTML = '';
                    tr.style.backgroundColor = 'transparent';
                } else {
                    document.querySelectorAll('#prGridBody tr').forEach((r) => {
                        r.classList.remove('selected-row');
                        r.style.backgroundColor = 'transparent';
                        const s = r.querySelector('.row-selector');
                        if (s) s.innerHTML = '';
                    });
                    tr.classList.add('selected-row');
                    selector.innerHTML = '&#9654;';
                    tr.style.backgroundColor = '#e0f0ff';
                }
            });
        }
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
        const suggest = tr.querySelector('.po-suggest');
        if (suggest) suggest.style.display = 'none';
    },

    calculateRow: function(rowIndex) {
        const tr = document.querySelector(`#prGridBody tr[data-index="${rowIndex}"]`);
        if (!tr) return;

        const qtyPerPiece = parseFloat(tr.dataset.qtyPerPiece) || 0;
        const pieces = parseFloat(tr.querySelector('.pieces')?.value) || 0;
        
        if (pieces > 0 && qtyPerPiece > 0) {
            if (!document.activeElement || document.activeElement.classList.contains('pieces') || document.activeElement.classList.contains('item-code-search')) {
                tr.querySelector('.qty').value = (pieces * qtyPerPiece).toFixed(2);
            }
        }

        const qty = parseFloat(tr.querySelector('.qty')?.value) || 0;
        const rate = parseFloat(tr.querySelector('.rate')?.value) || 0;
        const taxRate = parseFloat(tr.querySelector('.tax-rate')?.value) || 0;
        const frthRate = parseFloat(tr.querySelector('.frth-rate')?.value) || 0;

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
            tPieces += parseFloat(tr.querySelector('.pieces')?.value) || 0;
            tQty += parseFloat(tr.querySelector('.qty')?.value) || 0;
            tExcl += parseFloat(tr.querySelector('.val-excl')?.value) || 0;
            tTax += parseFloat(tr.querySelector('.tax-amt')?.value) || 0;
            tFrth += parseFloat(tr.querySelector('.frth-amt')?.value) || 0;
            tIncl += parseFloat(tr.querySelector('.val-incl')?.value) || 0;
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
        const carriage = parseFloat(document.getElementById('pr_carriage')?.value) || 0;
        const netTotal = tIncl + carriage;
        const netEl = document.getElementById('pr_net_total');
        if (netEl) netEl.value = netTotal.toFixed(2);

        // Balance = Net Total - Amount Received
        const received = parseFloat(document.getElementById('pr_received')?.value) || 0;
        const balance = netTotal - received;
        const balEl = document.getElementById('pr_balance');
        if (balEl) balEl.value = balance.toFixed(2);

        const amtWordsEl = document.getElementById('pr_amt_words');
        if (amtWordsEl) amtWordsEl.innerText = `Rupees ${this.numberToWords(netTotal)} only.`;
    },

    reindexRows: function() {
        document.querySelectorAll('#prGridBody tr').forEach((tr, idx) => {
            tr.dataset.index = idx;
            if (!tr.classList.contains('selected-row')) {
                const sel = tr.querySelector('.row-selector');
                if (sel) sel.innerHTML = '';
            }
        });
    },

        numberToWords: function(num) {
        if (num === 0) return 'zero';
        
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

        return inWords(Math.floor(num)).trim() + ' and ' + Math.round((num % 1) * 100) + '/100';
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
            } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const selectedRow = document.querySelector('#prGridBody tr.selected-row');
                if (selectedRow) {
                    selectedRow.remove();
                    this.reindexRows();
                    this.calculateTotals();
                }
            }
        });

        // Click anywhere outside a row selector to deselect rows
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.row-selector')) {
                document.querySelectorAll('#prGridBody tr').forEach((r) => {
                    r.classList.remove('selected-row');
                    r.style.backgroundColor = 'transparent';
                    const s = r.querySelector('.row-selector');
                    if (s) s.innerHTML = '';
                });
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
        const suggest = tr.querySelector('.po-suggest');

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
        const getVisibleRowInputs = (row) => Array.from(row.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0 || i.type === 'number' || i.classList.contains('num'));
        const getAllVisibleInputs = () => Array.from(gridBody.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0 || i.type === 'number' || i.classList.contains('num'));
        const rowInputs = getVisibleRowInputs(tr);
        const colIdx = rowInputs.indexOf(target);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextRowInputs = getVisibleRowInputs(nextTr);
                if (nextRowInputs[colIdx]) {
                    nextRowInputs[colIdx].focus();
                    nextRowInputs[colIdx].select();
                }
            } else {
                this.addRow();
                setTimeout(() => {
                    const newTr = tr.nextElementSibling;
                    if (newTr) {
                        const newRowInputs = getVisibleRowInputs(newTr);
                        if (newRowInputs[colIdx]) {
                            newRowInputs[colIdx].focus();
                            newRowInputs[colIdx].select();
                        }
                    }
                }, 50);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevRowInputs = getVisibleRowInputs(prevTr);
                if (prevRowInputs[colIdx]) {
                    prevRowInputs[colIdx].focus();
                    prevRowInputs[colIdx].select();
                }
            }
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
            if (e.key === 'Enter' || (e.key === 'ArrowRight' && isFullySelected)) {
                e.preventDefault();
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index < allInputs.length - 1) {
                    allInputs[index + 1].focus();
                    allInputs[index + 1].select();
                } else if (e.key === 'Enter') {
                    this.addRow();
                    setTimeout(() => {
                        const newInputs = getAllVisibleInputs();
                        if (newInputs[index + 1]) {
                            newInputs[index + 1].focus();
                            newInputs[index + 1].select();
                        }
                    }, 50);
                }
            }
        } else if (e.key === 'ArrowLeft') {
            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
            if (isFullySelected) {
                e.preventDefault();
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index > 0) {
                    allInputs[index - 1].focus();
                    allInputs[index - 1].select();
                }
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

        // Reset post state
        this.isPosted = false;
        const postBtn = document.getElementById('pr_post_btn');
        const postedStamp = document.getElementById('pr_posted_stamp');
        const cancelledStamp = document.getElementById('pr_cancelled_stamp');
        if (postBtn) postBtn.innerText = 'Post';
        if (postedStamp) postedStamp.style.display = 'none';
        if (cancelledStamp) cancelledStamp.style.display = 'none';

        const natureSelect = document.getElementById('pr_nature_dn');
        if (natureSelect) natureSelect.value = 'Purchase Return (Reduces Inventory)';
        
        // Reset Grid
        const gridBody = document.getElementById('prGridBody');
        if (gridBody) {
            gridBody.innerHTML = '';
            for (let i = 0; i < 40; i++) { this.addRow(); }
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
                this.currentId = null;
                this.resetForm(true);
                this.showToast('Purchase Return saved successfully!');
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
        // Post/Cancel UI
        const postBtn = document.getElementById('pr_post_btn');
        const postedStamp = document.getElementById('pr_posted_stamp');
        if (postBtn && postedStamp) {
            this.isPosted = (ret.is_posted == 1);
            if (this.isPosted) {
                postBtn.innerText = 'Un-Post';
                postedStamp.style.display = 'block';
            } else {
                postBtn.innerText = 'Post';
                postedStamp.style.display = 'none';
            }
        }

        const isCancelled = parseInt(ret.is_cancelled) === 1;
        const cancelCb = document.getElementById('pr_is_cancelled');
        if (cancelCb) cancelCb.checked = isCancelled;
        this.toggleCancelledStamp();

        if (ret.vendor_coa_id) { this.selectVendor(ret.vendor_coa_id); }

        const tbody = document.getElementById('prGridBody');
        tbody.innerHTML = '';
        if (ret.items && ret.items.length > 0) {
            ret.items.forEach(item => this.addRow(item));
        }
        while (tbody.children.length < 40) { this.addRow(); }
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

        if (dir === 'last') {
            try {
                const res = await fetch(`api/purchases.php?action=get_next_return_serial&company_id=${companyId}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (dir === 'this') {
            dir = undefined;
        } else if (sn === 0) {
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

    // Find Modal Methods
    findData: [],
    openFindModal: async function() {
        const modal = document.getElementById('pr_find_modal');
        if (modal) modal.style.display = 'flex';
        await this.renderFindTable();
    },

    closeFindModal: function() {
        const modal = document.getElementById('pr_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('pr_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/purchases.php?action=search_returns&company_id=${companyId}`);
            this.findData = await res.json();
            this.filterFindTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const tbody = document.getElementById('pr_find_table_body');
        if (!tbody) return;
        
        const q = (document.getElementById('pr_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('pr_find_field')?.value || 'serial_no';
        
        const filtered = this.findData.filter(ret => {
            if (!q) return true;
            const val = (ret[field]?.toString() || '').toLowerCase();
            return val.includes(q);
        });
        
        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:10px;">No records found</td></tr>';
            return;
        }
        
        filtered.forEach(ret => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            
            tr.onmouseenter = () => { if (tr.dataset.selected !== 'true') tr.style.backgroundColor = '#e0f0ff'; };
            tr.onmouseleave = () => { if (tr.dataset.selected !== 'true') tr.style.backgroundColor = 'transparent'; };
            
            tr.onclick = () => {
                Array.from(tbody.children).forEach(child => {
                    child.dataset.selected = 'false';
                    child.style.backgroundColor = 'transparent';
                    child.style.color = 'black';
                });
                tr.dataset.selected = 'true';
                tr.style.backgroundColor = '#0058d0';
                tr.style.color = 'white';
                
                // Update footer
                const d = ret.created_at ? new Date(ret.created_at) : new Date();
                const dStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US');
                if(document.getElementById('pr_find_added_on')) document.getElementById('pr_find_added_on').value = dStr;
                if(document.getElementById('pr_find_edited_on')) document.getElementById('pr_find_edited_on').value = dStr;
            };

            // Double click to load
            tr.ondblclick = () => {
                this.closeFindModal();
                this.loadRecord(ret.serial_no);
            };

            // Format date
            const dateStr = ret.return_date ? new Date(ret.return_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            
            // Format status
            let statusBadge = '<span style="color:#28a745; font-weight:bold;">Active</span>';
            if (parseInt(ret.is_cancelled) === 1) statusBadge = '<span style="color:#dc3545; font-weight:bold;">Cancelled</span>';
            let postedBadge = parseInt(ret.is_posted) === 1 ? '<span style="color:#28a745; font-weight:bold;">Yes</span>' : '<span style="color:#dc3545; font-weight:bold;">No</span>';
            
            // Columns: "", Serial No., Date, Vendor Invoice No., Purchase Date, Vendor, Terms of Payment, Amount, Posted, Status
            const pDateStr = ret.purchase_date ? new Date(ret.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

            tr.innerHTML = `
                <td style="border: 1px solid #cbd5e0; text-align: center;">▶</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${ret.serial_no}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${dateStr}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${ret.vendor_invoice_no || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${pDateStr}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${ret.vendor_name || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${ret.payment_terms || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0; text-align: right;">${parseFloat(ret.net_total || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0; text-align: center;">${postedBadge}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${statusBadge}</td>
            `;
            
            tbody.appendChild(tr);
        });
    },

    loadRecord: async function(serialNo) {
        document.getElementById('pr_sn').value = serialNo;
        await this.navigate('this');
    },

    printReturn: async function(mode = 'print') {
        if (!this.currentId) return alert("Please save or retrieve a return first.");

        const isVoucher = (mode === true || mode === 'voucher');
        const isExcel = (mode === 'excel');

        // Open window synchronously to avoid popup blockers!
        let printWindow = null;
        if (!isExcel) {
            printWindow = window.open('', '_blank');
            if(printWindow) printWindow.document.write('<div style="font-family:sans-serif; padding: 20px;">Preparing Print... Please wait.</div>');
        }

        const sn = document.getElementById('pr_sn').value;
        const date = document.getElementById('pr_date').value;
        const vCode = document.getElementById('vendor_code').value;
        const vName = document.getElementById('vendor_name').value;
        const vAddress = document.getElementById('vendor_address')?.value || '';
        const vTel = document.getElementById('vendor_tel')?.value || '';
        
        const totPieces = document.getElementById('tot_pieces').value;
        const totQty = document.getElementById('tot_qty').value;
        const totNet = document.getElementById('tot_incl').value;
        const amtWords = document.getElementById('pr_amt_words').textContent;
        const remarks = document.getElementById('pr_remarks').value;

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
        
        // 1. FETCH DIRECTLY FROM DATABASE! This guarantees we have the latest logo!
        try {
            const coId = session.company_id || 1;
            const cRes = await fetch('api/admin.php?action=get_company&id=' + coId);
            if (cRes.ok) {
                const cData = await cRes.json();
                if (cData && cData.logo_data && cData.logo_data.startsWith('data:image')) {
                    customLogo = cData.logo_data;
                }
            }
        } catch(e) {
            console.error('Failed to fetch logo from DB', e);
        }
        
        // 2. If DB fetch failed, fallback to local storage
        if (customLogo === 'assets/logos/logo.png') {
            const coNameStr = session.company_name || '';
            let lLogo = coNameStr ? localStorage.getItem(`softifyx_${coNameStr}_logo`) : null;
            
            if (!lLogo && typeof window.getCompanyLogo === 'function') {
                lLogo = window.getCompanyLogo();
            }
            
            if (!lLogo || !lLogo.startsWith('data:image')) {
                for (let i = 0; i < localStorage.length; i++) {
                    let k = localStorage.key(i);
                    if (k && k.includes('_logo')) {
                        let val = localStorage.getItem(k);
                        if (val && val.startsWith('data:image')) {
                            lLogo = val;
                            break;
                        }
                    }
                }
            }
            
            if (lLogo && lLogo.startsWith('data:image')) {
                customLogo = lLogo;
            }
        }
        
        const preparedBy = document.getElementById('pr_find_added_by')?.value || 'Administrator';
        const printedBy = session.username || session.user_name || session.name || 'Administrator';
        
        const invoiceTitle = isVoucher ? "RETURN VOUCHER" : "PURCHASE RETURN";

        let itemsHtml = '';
        const validItems = [];
        document.querySelectorAll('#prGridBody tr').forEach((tr) => {
            const code = tr.querySelector('.item-code-search').value;
            if (!code) return;
            validItems.push(tr);
        });

        let sumGross = 0;
        let sumStax = 0;
        let sumNet = 0;

        validItems.forEach((tr, i) => {
            const code = tr.querySelector('.item-code-search').value;
            const desc = tr.cells[2].querySelector('input').value;
            const pieces = parseFloat(tr.querySelector('.pieces').value || 0).toFixed(2);
            const qty = parseFloat(tr.querySelector('.qty').value || 0).toFixed(2);
            const unit = tr.cells[5].querySelector('input').value;
            const rate = parseFloat(tr.querySelector('.rate').value || 0).toFixed(2);
            
            const excl = parseFloat(tr.querySelector('.val-excl').value || 0).toFixed(2);
            const stax = parseFloat(tr.querySelector('.tax-amt').value || 0).toFixed(2);
            const ftax = parseFloat(tr.querySelector('.frth-amt').value || 0).toFixed(2);
            const incl = parseFloat(tr.querySelector('.val-incl').value || 0).toFixed(2);
            
            sumGross += parseFloat(excl);
            sumStax += parseFloat(stax);
            sumNet += parseFloat(incl);

            let amountHtml = `
                <td style="text-align:right;">${excl}</td>
                <td style="text-align:right;">${stax}</td>
                <td style="text-align:right;">${ftax}</td>
                <td style="text-align:right;">${incl}</td>
            `;

            itemsHtml += `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td>${code}</td>
                    <td>${desc}</td>
                    <td style="text-align:center;">${pieces}</td>
                    <td style="text-align:center;">${qty} ${unit}</td>
                    <td style="text-align:right;">${rate}</td>
                    ${amountHtml}
                </tr>
            `;
        });


        const html = `
            <html>
            <head>
                <title>${invoiceTitle} - ${sn}</title>
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

                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 15px; }
                    .info-box { border: 1px solid #1F4E79; border-radius: 4px; padding: 10px; background: #f8f9fa; }
                    .info-box-title { color: #1F4E79; font-size: 10px; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #dee2e6; padding-bottom: 4px; text-transform: uppercase; }
                    
                    .info-row { display: flex; margin-bottom: 3px; }
                    .info-label { width: 70px; font-weight: 600; color: #555; }
                    .info-value { flex: 1; font-weight: bold; color: #000; }
                    
                    table.invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                    table.invoice-table th { background: #1F4E79; color: white; padding: 6px; text-align: left; font-size: 10px; font-weight: 600; border: 1px solid #1F4E79; }
                    table.invoice-table td { padding: 5px 6px; border: 1px solid #cbd5e0; font-size: 10px; }
                    table.invoice-table tr:nth-child(even) { background: #f8f9fa; }
                    
                    .totals-area { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; page-break-inside: avoid; }
                    .amount-words-box { width: 60%; border: 1px solid #cbd5e0; border-radius: 4px; padding: 10px; background: #f8f9fa; }
                    .amount-words-title { font-weight: bold; color: #1F4E79; margin-bottom: 5px; font-size: 9px; }
                    .amount-words-text { font-style: italic; font-weight: bold; }
                    
                    .totals-box { width: 35%; border: 2px solid #1F4E79; border-radius: 4px; background: #f8f9fa; overflow: hidden; }
                    .total-row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
                    .total-row.net-total { background: #1F4E79; color: white; font-size: 12px; font-weight: bold; border-bottom: none; padding: 8px 10px; }
                    
                    .footer-signatures { display: flex; justify-content: space-around; margin-top: 40px; page-break-inside: avoid; }
                    .footer-sig { text-align: center; width: 200px; }
                    .footer-sig-text { border-top: 1px solid #000; padding-top: 5px; font-weight: bold; }
                    
                    @media print {
                        body { background: white; margin: 5mm; }
                        .page-container { box-shadow: none; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="page-container">
                    <div class="header-area">
                        <div class="logo-box">
                            <img src="${customLogo}" alt="Logo" onerror="this.src='assets/logos/logo.png'">
                        </div>
                        <div class="company-info">
                            <h1 class="company-name">${coName}</h1>
                            <div class="company-contacts">
                                <div class="contact-row">
                                    <span><i class="fas fa-map-marker-alt"></i> ${coAddress}</span>
                                </div>
                                <div class="contact-row">
                                    <span><i class="fas fa-phone-alt"></i> ${coPhone}</span>
                                    <span style="margin-left: 15px;"><i class="fas fa-envelope"></i> ${coEmail}</span>
                                </div>
                            </div>
                        </div>
                        <div class="invoice-badge-area">
                            <div class="invoice-title">${invoiceTitle}</div>
                            <div class="invoice-type-badge">RETURN INVOICE</div>
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-box">
                            <div class="info-box-title"><i class="fas fa-user-tag"></i> VENDOR DETAILS</div>
                            <div class="info-row">
                                <div class="info-label">Name:</div>
                                <div class="info-value">${vName} (${vCode})</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Address:</div>
                                <div class="info-value" style="font-weight: normal;">${vAddress.split(',')[0]}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Phone:</div>
                                <div class="info-value" style="font-weight: normal;">${vTel || 'N/A'}</div>
                            </div>
                        </div>
                        
                        <div class="info-box">
                            <div class="info-box-title"><i class="fas fa-file-invoice"></i> RETURN DETAILS</div>
                            <div class="info-row">
                                <div class="info-label">Return No:</div>
                                <div class="info-value" style="color: #1F4E79; font-size: 11px;">${sn}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Date:</div>
                                <div class="info-value">${date}</div>
                            </div>
                        </div>
                    </div>

                    <table class="invoice-table">
                        <thead>
                            <tr>
                                <th style="width: 3%; text-align:center;">#</th>
                                <th style="width: 12%;">Item Code</th>
                                <th style="width: 25%;">Description</th>
                                <th style="width: 8%; text-align:center;">Pcs</th>
                                <th style="width: 10%; text-align:center;">Qty</th>
                                <th style="width: 10%; text-align:right;">Rate</th>
                                <th style="width: 8%; text-align:center;">Value Excl</th>
                                <th style="width: 8%; text-align:center;">STax</th>
                                <th style="width: 8%; text-align:center;">FTax</th>
                                <th style="width: 8%; text-align:center;">Value Incl</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                            <tr style="font-weight: bold; background: #e2e8f0;">
                                <td colspan="3" style="text-align:right;">TOTALS:</td>
                                <td style="text-align:center;">${totPieces}</td>
                                <td style="text-align:center;">${totQty}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td style="text-align:right;">${sumNet.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="totals-area">
                        <div class="amount-words-box">
                            <div class="amount-words-title">AMOUNT IN WORDS:</div>
                            <div class="amount-words-text">${amtWords}</div>
                            
                            <div class="amount-words-title" style="margin-top: 10px;">REMARKS:</div>
                            <div style="font-weight: normal;">${remarks || '-'}</div>
                        </div>
                        
                        <div class="totals-box">
                            <div class="total-row">
                                <span>VALUE EXCL.</span>
                                <span>${sumGross.toFixed(2)}</span>
                            </div>
                            <div class="total-row">
                                <span>SALES TAX</span>
                                <span>${sumStax.toFixed(2)}</span>
                            </div>
                            <div class="total-row net-total">
                                <span>NET AMOUNT</span>
                                <div style="display:flex; justify-content:space-between; flex:1; margin-left:10px;">
                                    <span>:</span>
                                    <span>${parseFloat(totNet).toLocaleString(undefined, {minimumFractionDigits:2})}</span>
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

        const excelHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <style>
                    table { border-collapse: collapse; }
                    td, th { padding: 4px; font-size: 11px; }
                    .border td, .border th { border: 1px solid #000; }
                    .bold { font-weight: bold; }
                    .center { text-align: center; }
                    .right { text-align: right; }
                </style>
            </head>
            <body>
                <table>
                    <tr><td colspan="10" class="center bold" style="font-size: 20px; color: #1F4E79;">${coName}</td></tr>
                    <tr><td colspan="10" class="center">Address: ${coAddress} | Phone: ${coPhone} | Email: ${coEmail}</td></tr>
                    <tr><td colspan="10"></td></tr>
                    <tr><td colspan="10" class="center bold" style="font-size: 16px; color: #1F4E79;">${invoiceTitle}</td></tr>
                    <tr><td colspan="10" class="center bold" style="font-size: 12px; color: #FF8C00;">RETURN INVOICE</td></tr>
                    <tr><td colspan="10"></td></tr>
                    
                    <tr>
                        <td colspan="5" class="bold" style="background:#f8f9fa; border:1px solid #000;">VENDOR DETAILS</td>
                        <td colspan="5" class="bold" style="background:#f8f9fa; border:1px solid #000;">RETURN DETAILS</td>
                    </tr>
                    <tr>
                        <td colspan="5" style="border:1px solid #000; vertical-align:top;">
                            <strong>${vName} (${vCode})</strong><br>
                            ${vAddress.split(',')[0]}<br>
                            Phone: ${vTel || 'N/A'}
                        </td>
                        <td colspan="5" style="border:1px solid #000; vertical-align:top;">
                            Return No: <b>${sn}</b><br>
                            Date: <b>${date}</b><br>
                        </td>
                    </tr>
                    <tr><td colspan="10"></td></tr>
                </table>
                <table class="border">
                    <tr>
                        <th class="bold center">#</th>
                        <th class="bold center">Item Code</th>
                        <th class="bold center">Description</th>
                        <th class="bold center">Pcs</th>
                        <th class="bold center">Qty</th>
                        <th class="bold center">Rate</th>
                        <th class="bold center">Value Excl</th><th class="bold center">STax</th><th class="bold center">FTax</th><th class="bold center">Value Incl</th>
                    </tr>
                    ${itemsHtml}
                    <tr>
                        <td colspan="3" class="right bold">TOTALS</td>
                        <td class="center bold">${totPieces}</td>
                        <td class="center bold">${totQty}</td>
                        <td></td>
                        <td></td><td></td><td></td><td class="right bold">${sumNet.toFixed(2)}</td>
                    </tr>
                </table>
                <table>
                    <tr><td colspan="10"></td></tr>
                    <tr>
                        <td colspan="6" rowspan="4" style="vertical-align: top; border:1px solid #000;">
                            <div class="bold">AMOUNT IN WORDS:</div>
                            <div>${amtWords}</div><br>
                            <div class="bold">REMARKS:</div>
                            <div>${remarks || '-'}</div>
                        </td>
                        <td colspan="3" class="bold right" style="border:1px solid #000;">VALUE EXCL.</td>
                        <td class="right" style="border:1px solid #000;">${sumGross.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" class="bold right" style="border:1px solid #000;">SALES TAX</td>
                        <td class="right" style="border:1px solid #000;">${sumStax.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" class="bold right" style="border:1px solid #000; font-size:14px;">NET AMOUNT</td>
                        <td class="right bold" style="border:1px solid #000; font-size:14px;">${parseFloat(totNet).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    </tr>
                    <tr>
                        <td colspan="4" style="border-right:1px solid #000; border-bottom:1px solid #000;"></td>
                    </tr>
                    <tr><td colspan="10"></td></tr>
                    <tr><td colspan="10"></td></tr>
                    <tr>
                        <td colspan="5" class="center">
                            <div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:5px; display:inline-block;">
                                <b>Prepared By</b><br>${preparedBy}
                            </div>
                        </td>
                        <td colspan="5" class="center">
                            <div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:5px; display:inline-block;">
                                <b>Printed By</b><br>${printedBy}
                            </div>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;
        
        if (isExcel) {
            if (printWindow) printWindow.close();
            const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Purchase_Return_${isVoucher ? 'Voucher' : 'Invoice'}_${sn}.xls`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
                // Since this was async, we need a slight delay to ensure the DOM and images render
                setTimeout(() => {
                    printWindow.print();
                }, 500);
            }
        }
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
