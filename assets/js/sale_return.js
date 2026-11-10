window.SRModule = {
    customers: [],
    inventory: [],
    currentMatches: [],
    employees: [],
    jobs: [],
    locations: [],
    currentId: null,
    suggestIndex: -1,

    init: async function() {
        console.log("SI Module: Initializing...");
        
        // 1. Reset form immediately to show grid lines
        this.resetForm(true);
        
        // 2. Load data in background to prevent hanging
        try {
            await Promise.all([
                this.loadCustomers(),
                this.loadInventory(),
                this.loadEmployees(),
                this.loadJobs(),
                this.loadLocations()
            ]);
            console.log("SI Module: Data loaded successfully.");
        } catch (err) {
            console.error("SI Module: Error loading background data:", err);
        }
        
        this.setupKeyboardShortcuts();
        this.setupCustomerSearch();
        this.setupExpenseSearch();
        this.toggleTaxMode(false);

        const cancelCb = document.getElementById('sr_is_cancelled');
        if (cancelCb) cancelCb.addEventListener('change', () => this.toggleCancelledStamp());
        
        const footerInputs = ['sr_add_disc', 'sr_freight', 'sr_paid'];
        footerInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.calculateTotals());
        });
        
        const postBtn = document.getElementById('sr_post_btn');
        if (postBtn) postBtn.addEventListener('click', () => this.togglePost());
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sr_emp_wrapper')) {
                const ed = document.getElementById('sr_emp_dropdown');
                if (ed) ed.style.display = 'none';
            }
            if (!e.target.closest('#sr_job_wrapper')) {
                const jd = document.getElementById('sr_job_dropdown');
                if (jd) jd.style.display = 'none';
            }
            if (!e.target.closest('#sr_location_wrapper')) {
                const ld = document.getElementById('sr_location_dropdown');
                if (ld) ld.style.display = 'none';
            }
        });
    },

    toggleCancelledStamp: function() {
        const checkbox = document.getElementById('sr_is_cancelled');
        const stamp = document.getElementById('sr_cancelled_stamp');
        if (checkbox && stamp) {
            stamp.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    loadCustomers: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            // Fetch ALL customers regardless of sub_id using the unified API
            const res = await fetch(`api/sale_order.php?action=get_customers_and_vendors&company_id=${companyId}`);
            const data = await res.json();
            
            // Map the data and filter to customers only
            this.customers = data.filter(c => c.type === 'customer').map(c => ({
                ...c,
                st_reg_no: c.gst_reg_no,
                ntn_cnic: c.ntn
            }));
        } catch (e) { console.error("SI Module: Load Customers Error:", e); }
    },

    loadInventory: async function() {
        // Fast-path: Check in-memory shared inventory
        if (window.loadSharedERPInventory) {
            try {
                const shared = await window.loadSharedERPInventory();
                if (Array.isArray(shared) && shared.length > 0) {
                    this.inventory = shared;
                    return this.inventory;
                }
            } catch(eShared) {}
        }

        if (window.allInventoryItems && Array.isArray(window.allInventoryItems) && window.allInventoryItems.length > 0) {
            this.inventory = window.allInventoryItems;
            return this.inventory;
        }

        if (window.SaleOrderModule && Array.isArray(window.SaleOrderModule.inventory) && window.SaleOrderModule.inventory.length > 0) {
            this.inventory = window.SaleOrderModule.inventory;
            return this.inventory;
        }

        if (window.SIModule && Array.isArray(window.SIModule.inventory) && window.SIModule.inventory.length > 0) {
            this.inventory = window.SIModule.inventory;
            return this.inventory;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        // 1. Try sale_order.php get_all_items
        try {
            const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    this.inventory = data;
                }
            }
        } catch (e) { console.error("Sale Return Module: Load Inventory Error:", e); }

        // 2. Fallback / Catalog Enrichment from digital_invoice metadata
        try {
            const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
            if (resMeta.ok) {
                const dataMeta = await resMeta.json();
                if (dataMeta && Array.isArray(dataMeta.items) && dataMeta.items.length > (this.inventory ? this.inventory.length : 0)) {
                    this.inventory = dataMeta.items.map(i => ({
                        id: i.id,
                        code: i.code || '',
                        item_code: i.code || '',
                        name: i.name || '',
                        item_name: i.name || '',
                        description: i.description || i.name || '',
                        hs_code: i.hs_code || '0000.0000',
                        unit: i.unit || 'Pcs',
                        sales_price: parseFloat(i.selling_price || 0),
                        selling_price: parseFloat(i.selling_price || 0),
                        qty_per_piece: parseFloat(i.qty_per_piece || 0),
                        tax_rate: parseFloat(i.tax_rate || 0),
                        category_name: i.category_type || 'Inventory',
                        item_type: 'inventory'
                    }));
                }
            }
        } catch (errFallback) {}

        // 3. Fallback to inventory.php get_all_items_lookup
        if (!this.inventory || this.inventory.length === 0) {
            try {
                const resLookup = await fetch(`api/inventory.php?action=get_all_items_lookup&company_id=${companyId}&_cb=${Date.now()}`);
                if (resLookup.ok) {
                    const dataLookup = await resLookup.json();
                    if (Array.isArray(dataLookup) && dataLookup.length > 0) {
                        this.inventory = dataLookup;
                    }
                }
            } catch (eLookup) {}
        }

        // 4. Fallback to inventory.php get_all_items
        if (!this.inventory || this.inventory.length === 0) {
            try {
                const resInv = await fetch(`api/inventory.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
                if (resInv.ok) {
                    const dataInv = await resInv.json();
                    if (Array.isArray(dataInv) && dataInv.length > 0) {
                        this.inventory = dataInv;
                    }
                }
            } catch (eInv) {}
        }

        // Normalize all inventory items
        if (Array.isArray(this.inventory)) {
            this.inventory = this.inventory.map(i => ({
                id: i.id || i.coa_list_id,
                code: String(i.code || i.item_code || '').trim(),
                item_code: String(i.item_code || i.code || '').trim(),
                name: String(i.name || i.item_name || i.description || '').trim(),
                item_name: String(i.item_name || i.name || i.description || '').trim(),
                description: String(i.description || i.item_name || i.name || '').trim(),
                hs_code: i.hs_code || '',
                unit: i.unit || 'Pcs',
                sales_price: parseFloat(i.sales_price || i.selling_price || i.rate || 0),
                selling_price: parseFloat(i.selling_price || i.sales_price || i.rate || 0),
                purchase_price: parseFloat(i.purchase_price || i.cost_price || i.cost || i.rate || i.sales_price || i.selling_price || 0),
                cost_price: parseFloat(i.cost_price || i.purchase_price || i.cost || i.rate || i.sales_price || i.selling_price || 0),
                rate: parseFloat(i.sales_price || i.selling_price || i.rate || 0),
                qty_per_piece: parseFloat(i.qty_per_piece || 0),
                tax_rate: parseFloat(i.tax_rate || 0),
                item_type: i.item_type || 'inventory'
            }));
            window.allInventoryItems = this.inventory;
        }
        return this.inventory;
    },

    loadEmployees: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            this.employees = await res.json();
            const select = document.getElementById('sr_emp_dropdown');
            if (select) {
                select.innerHTML = `<div class="si-suggest-item" onclick="document.getElementById('sr_emp_ref').value=''; document.getElementById('sr_emp_text').innerText='Select Employee'; this.parentElement.style.display='none';">Select Employee</div>`;
                this.employees.forEach(e => {
                    if (!e.name || !e.name.trim()) return;
                    const cleanName = e.name.trim();
                    const safeName = cleanName.replace(/'/g, "\\'");
                    select.innerHTML += `<div class="si-suggest-item" onclick="document.getElementById('sr_emp_ref').value='${e.id}'; document.getElementById('sr_emp_text').innerText='${safeName}'; this.parentElement.style.display='none';">${cleanName}</div>`;
                });
            }
        } catch (e) {}
    },

    loadJobs: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/jobs.php?action=get_jobs&company_id=${companyId}`);
            this.jobs = await res.json();
            const select = document.getElementById('sr_job_dropdown');
            if (select) {
                select.innerHTML = `<div class="si-suggest-item" onclick="document.getElementById('sr_job_desc').value=''; document.getElementById('sr_job_text').innerText='Select Job'; this.parentElement.style.display='none';">Select Job</div>`;
                this.jobs.forEach(j => {
                    if (!j.job_no && !j.description) return;
                    const jobDesc = `${j.job_no || ''} - ${j.description || ''}`.trim();
                    const safeDesc = jobDesc.replace(/'/g, "\\'");
                    select.innerHTML += `<div class="si-suggest-item" onclick="document.getElementById('sr_job_desc').value='${j.id}'; document.getElementById('sr_job_text').innerText='${safeDesc}'; this.parentElement.style.display='none';">${jobDesc}</div>`;
                });
            }
        } catch (e) {}
    },

    loadLocations: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/inventory.php?action=get_locations&company_id=${companyId}`);
            this.locations = await res.json();
            const el = document.getElementById('sr_location_dropdown');
            if (el) {
                el.innerHTML = `<div class="si-suggest-item" onclick="document.getElementById('sr_location').value=''; document.getElementById('sr_location_text').innerText='Select Location'; this.parentElement.style.display='none';">Select Location</div>`;
                this.locations.forEach(l => {
                    const safeName = (l.name || '').replace(/'/g, "\\'");
                    el.innerHTML += `<div class="si-suggest-item" onclick="document.getElementById('sr_location').value='${l.id}'; document.getElementById('sr_location_text').innerText='${safeName}'; this.parentElement.style.display='none';">${l.name}</div>`;
                });
                
                // Set default to Main Store on first load if not already set
                let defaultLoc = this.locations.find(l => l.name && l.name.toLowerCase().includes('main store')) || this.locations[0];
                if (defaultLoc && !document.getElementById('sr_location').value) {
                    document.getElementById('sr_location').value = defaultLoc.id;
                    document.getElementById('sr_location_text').innerText = defaultLoc.name;
                }
            }
        } catch (e) {}
    },

    setupKeyboardShortcuts: function() {
        const gridBody = document.getElementById('srGridBody');
        if (gridBody) {
            gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            gridBody.addEventListener('click', (e) => {
                const selector = e.target.closest('.row-selector');
                if (selector) {
                    const tr = selector.closest('tr');
                    
                    document.querySelectorAll('#srGridBody > tr').forEach((r, idx) => {
                        r.classList.remove('selected-row');
                        r.firstElementChild.innerHTML = idx + 1;
                    });

                    tr.classList.add('selected-row');
                    selector.innerHTML = '&#9654;'; // Triangle icon when selected
                }
            });
        }
        
        document.addEventListener('click', (e) => {
            const isGridClick = e.target.closest('#srGrid');
            if (!isGridClick) {
                document.querySelectorAll('#srGridBody > tr').forEach((r, idx) => {
                    r.classList.remove('selected-row');
                    r.firstElementChild.innerHTML = idx + 1;
                });
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveInvoice();
            } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const selectedRow = document.querySelector('#srGridBody > tr.selected-row');
                if (selectedRow) {
                    selectedRow.remove();
                    this.reindexRows();
                    this.calculateTotals();
                }
            }
            
            const activeIds = ['sr_location_display', 'sr_job_display', 'sr_emp_display'];
            if (activeIds.includes(e.target.id)) {
                const wrapper = e.target.parentElement;
                const suggest = wrapper.querySelector('.custom-select-dropdown');
                if (suggest && suggest.style.display === 'block') {
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
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (suggest) {
                        suggest.style.display = 'block';
                        this.suggestIndex = -1;
                    }
                }
            }
        });
    },

    reindexRows: function() {
        document.querySelectorAll('#srGridBody > tr').forEach((tr, idx) => {
            tr.dataset.index = idx;
            if (!tr.classList.contains('selected-row')) {
                tr.firstElementChild.innerHTML = idx + 1;
            }
        });
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('srGridBody');
        const suggest = tr.querySelector('.grid-suggest');

        // Handle suggestion box keyboard nav
        if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
            const items = suggest.querySelectorAll('div');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.suggestIndex = Math.min(this.suggestIndex + 1, items.length - 1);
                this.updateSuggestHighlight(items, tr);
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.suggestIndex = Math.max(this.suggestIndex - 1, 0);
                this.updateSuggestHighlight(items, tr);
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
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextRowInputs = getVisibleRowInputs(nextTr);
                if (nextRowInputs[colIdx]) {
                    nextRowInputs[colIdx].focus();
                    nextRowInputs[colIdx].select();
                }
            } else {
                this.addEmptyRow();
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
                    this.addEmptyRow();
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
    setupCustomerSearch: function() {
        const input = document.getElementById('sr_cust_code');
        const suggest = document.getElementById('sr_cust_suggest');
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
            const matches = this.customers.filter(v => {
                const searchStr = `${v.code} ${v.name} ${v.address || ''}`.toLowerCase();
                return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
            }).slice(0, 50);

            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map(v => 
                    `<div onclick="window.SRModule.selectCustomer(${v.id})">
                        <b>${v.code}</b> &nbsp; ${v.name}
                    </div>`
                ).join('');
                suggest.style.display = 'block';
                suggest.style.zIndex = '9999';
            } else { suggest.style.display = 'none'; }
        };
        document.addEventListener('click', (e) => { if (e.target !== input) suggest.style.display = 'none'; });
    },

    selectCustomer: async function(coaId) {
        const v = this.customers.find(x => x.id == coaId || x.coa_list_id == coaId);
        if (v) {
            document.getElementById('sr_cust_code').value = v.code;
            document.getElementById('sr_cust_code').dataset.coaId = v.id;
            document.getElementById('sr_cust_name').value = v.name;
            document.getElementById('sr_cust_address').value = v.address || '';
            document.getElementById('sr_cust_phone').value = v.telephone || '';
            if(document.getElementById('sr_cust_gst')) document.getElementById('sr_cust_gst').value = v.st_reg_no || '';
            if(document.getElementById('sr_cust_ntn')) document.getElementById('sr_cust_ntn').value = v.ntn_cnic || '';
            
            
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const targetCoaId = coaId;
                if (targetCoaId) {
                    const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${targetCoaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                    const bal = await res.json();
                    const balEl = document.getElementById('sr_cust_balance');
                    if (balEl) {
                        const balanceVal = parseFloat(bal.balance || 0);
                        if (balanceVal > 0) {
                            balEl.value = Math.abs(balanceVal).toFixed(2) + ' Dr';
                            balEl.style.color = '#dc2626';
                        } else if (balanceVal < 0) {
                            balEl.value = Math.abs(balanceVal).toFixed(2) + ' Cr';
                            balEl.style.color = '#2563eb';
                        } else {
                            balEl.value = '0.00';
                            balEl.style.color = '#000';
                        }
                    }
                } else {
                    const balEl = document.getElementById('sr_cust_balance');
                    if (balEl) { balEl.value = '0.00'; balEl.style.color = '#000'; }
                }
            } catch(e) {
                console.error("Balance fetch error:", e);
                const balEl = document.getElementById('sr_cust_balance');
                if (balEl) { balEl.value = '0.00'; balEl.style.color = '#000'; }
            }
        }
        document.getElementById('sr_cust_suggest').style.display = 'none';
    },

    setupExpenseSearch: function() {
        const codeInput = document.getElementById('sr_income_code');
        const suggest = document.getElementById('sr_income_suggest');
        if (!codeInput || !suggest) return;

        codeInput.oninput = async (e) => {
            const val = e.target.value.trim();
            if (val.length < 1) { suggest.style.display = 'none'; return; }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            try {
                const res = await fetch(`api/sale_return.php?action=get_coa_list&company_id=${session.company_id || 1}`);
                const coa = await res.json();
                
                const matches = coa.filter(c => {
                    const typeStr = ((c.account_type || '') + ' ' + (c.main_type || '')).toLowerCase();
                    const isRevenue = typeStr.includes('income') || typeStr.includes('revenue');
                    if (!isRevenue) return false;
                    return c.account_code.includes(val) || (c.account_name || '').toLowerCase().includes(val.toLowerCase());
                }).slice(0, 15);

                if (matches.length > 0) {
                    suggest.innerHTML = matches.map(c => 
                        `<div onclick="window.SRModule.selectExpense('${c.account_code}', '${(c.account_name || '').replace(/'/g, "&apos;")}')" style="padding:5px; cursor:pointer; border-bottom:1px solid #eee; font-size:12px;">
                            <b>${c.account_code}</b>&nbsp;${c.account_name}
                        </div>`
                    ).join('');
                    suggest.style.display = 'block';
                } else { suggest.style.display = 'none'; }
            } catch(err) { suggest.style.display = 'none'; }
        };
        document.addEventListener('click', (e) => { 
            if (e.target !== codeInput) suggest.style.display = 'none'; 
        });
    },

    selectExpense: function(code, name) {
        document.getElementById('sr_income_code').value = code;
        document.getElementById('sr_income_name').value = name;
        document.getElementById('sr_income_suggest').style.display = 'none';
    },

    updateSuggestHighlight: function(items, tr) {
        items.forEach((item, idx) => {
            if (idx === this.suggestIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    },

    showItemDetailsPanel: async function(tr, item) {
        // Disabled per user request
    },

    hideItemDetailsPanel: function(tr) {
        // Disabled per user request
    },

    addEmptyRow: function(data = {}) {
        try {
        const tbody = document.getElementById('srGridBody');
        if (!tbody) return;
        const rowIndex = tbody.children.length;
        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        
        tr.innerHTML = `
            <td class="row-selector" style="text-align: center; border: 1px solid #cbd5e0; font-size: 10px; color: #64748b; font-weight: bold;">${rowIndex + 1}</td>
            <td style="border: 1px solid #cbd5e0; position: relative;">
                <input type="text" class="grid-input item-code-search" placeholder="" autocomplete="off">
                <div class="grid-suggest"></div>
            </td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input hs-code"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-description"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num pieces"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num qty"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-unit"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num rate"></td>
            
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-excl" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num stax-rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num stax-amt" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num ftax-rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num ftax-amt" readonly></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-incl" readonly></td>
        `;

        if (data.item_coa_id) {
            tr.dataset.coaId = data.item_coa_id;
            tr.dataset.qtyPerPiece = data.qty_per_piece || 0;

            // PROGRAMMATIC ASSIGNMENT
            tr.querySelector('.item-code-search').value = data.item_code || data.code || '';
            tr.querySelector('.hs-code').value = data.hs_code || '';
            
            // SMART FALLBACK
            let displayDesc = (data.description || '').toString().trim();
            const masterName = (data.item_name || data.master_name || data.name || '').toString().trim();
            if (!displayDesc || /^\d+$/.test(displayDesc) || displayDesc.length <= 2) {
                displayDesc = masterName || displayDesc;
            }
            tr.querySelector('.si-description').value = displayDesc;

            tr.querySelector('.pieces').value = data.pieces || '';
            tr.querySelector('.qty').value = data.quantity || data.qty || '';
            tr.querySelector('.si-unit').value = data.unit || '';
            tr.querySelector('.rate').value = data.rate || '';
            
            tr.querySelector('.val-excl').value = data.gross_amount || data.value_excl_tax || '';
            tr.querySelector('.stax-rate').value = data.sales_tax_rate || data.tax_rate || '';
            tr.querySelector('.stax-amt').value = data.sales_tax_amount || data.tax_amount || '';
            tr.querySelector('.ftax-rate').value = data.further_tax_rate || '';
            tr.querySelector('.ftax-amt').value = data.further_tax_amount || '';
            tr.querySelector('.val-incl').value = data.net_amount || data.value_incl_tax || '';
            
            // Trigger calculation to ensure consistency
            this.calculateRow(tr);
        }
        
        tbody.appendChild(tr);
        this.setupGridEvents(tr);
        this.toggleTaxMode(false);
        } catch(e) {
            console.error(e);
            alert("Error in addEmptyRow: " + e.message + "\nData: " + JSON.stringify(data));
        }
    },

    setupGridEvents: function(tr) {
        const idx = tr.dataset.index;
        const codeInput = tr.querySelector('.item-code-search');
        let suggest = tr.querySelector('.grid-suggest');
        if (suggest) {
            suggest.dataset.trIndex = idx;
            tr._suggestBox = suggest;
        }

        // --- Combined Input Handler (Autocomplete + AutoRow) ---
        codeInput.addEventListener('focus', () => {
            if (codeInput.value) codeInput.dispatchEvent(new Event('input'));
        });

        codeInput.oninput = async (e) => {
            const val = e.target.value.toLowerCase().trim();
            suggest = tr._suggestBox || tr.querySelector('.grid-suggest') || document.querySelector(`.grid-suggest[data-tr-index="${idx}"]`);
            if (!suggest) return;

            if (!val) { 
                suggest.style.display = 'none'; 
                return; 
            }

            if (!this.inventory || this.inventory.length === 0) {
                await this.loadInventory();
            }
            
            const searchWords = val.split(/\s+/);
            const matches = typeof window.smartSearchFilterAndSort === 'function' ? 
                window.smartSearchFilterAndSort(this.inventory, val) : 
                (this.inventory || []).filter(i => {
                    const code = String(i.item_code || i.code || '');
                    const name = String(i.item_name || i.name || i.description || '');
                    const searchStr = `${code} ${name}`.toLowerCase();
                    return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
                }).slice(0, 25);
            
            const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
            this.currentMatches = matches.slice(0, maxLimit);
            tr._currentMatches = this.currentMatches;

            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.dataset.trIndex = idx;
                suggest.innerHTML = typeof window.renderGlobalItemSuggestHTML === 'function' ?
                    window.renderGlobalItemSuggestHTML(matches, { isPurchase: false }) :
                    matches.map((i, mIdx) => `
                    <div class="suggest-item" data-idx="${mIdx}">
                        <span><b>${i.item_code || i.code}</b> &nbsp; ${i.item_name || i.name || i.description || ''}</span>
                        <span style="color:#15803d; font-weight:700; font-size:11px; float:right;">Rs. ${parseFloat(i.sales_price || i.selling_price || i.rate || 0).toFixed(2)}</span>
                    </div>`
                ).join('');

                if (typeof window.positionGridDropdown === 'function') {
                    window.positionGridDropdown(suggest, codeInput);
                } else {
                    suggest.style.display = 'block';
                    suggest.style.zIndex = '999999999';
                }

                const items = suggest.querySelectorAll('.suggest-item');
                items.forEach(item => {
                    item.addEventListener('mouseenter', () => {
                        this.suggestIndex = parseInt(item.dataset.idx);
                        this.updateSuggestHighlight(items);
                    });
                    item.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this.selectGridItem(idx, parseInt(item.dataset.idx));
                    });
                });
            } else { 
                suggest.style.display = 'none'; 
            }

            const tbody = document.getElementById('srGridBody');
            if (tr === tbody.lastElementChild && val !== '') { this.addEmptyRow(); }
        };

        // Auto-select and auto-pick item on blur if exact match
        codeInput.addEventListener('blur', () => {
            const val = codeInput.value.trim().toLowerCase();
            if (val && !tr.dataset.coaId && this.inventory && this.inventory.length > 0) {
                const match = this.inventory.find(i => String(i.item_code || i.code || '').toLowerCase() === val)
                    || this.inventory.find(i => String(i.item_name || i.name || '').toLowerCase() === val)
                    || (this.currentMatches && this.currentMatches.length > 0 ? this.currentMatches[0] : null);
                if (match) {
                    this.currentMatches = [match];
                    tr._currentMatches = [match];
                    this.selectGridItem(idx, 0);
                }
            }
            setTimeout(() => {
                const s = tr._suggestBox || document.querySelector(`.grid-suggest[data-tr-index="${idx}"]`);
                if (s) s.style.display = 'none';
            }, 200);
        });

        // Keyboard navigation for grid suggestion dropdown
        codeInput.addEventListener('keydown', (e) => {
            const suggestBox = tr._suggestBox || document.querySelector(`.grid-suggest[data-tr-index="${tr.dataset.index}"]`);
            if (suggestBox && suggestBox.style.display === 'block') {
                const items = suggestBox.querySelectorAll('.suggest-item');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.suggestIndex = Math.min((this.suggestIndex ?? -1) + 1, items.length - 1);
                    this.updateSuggestHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.suggestIndex = Math.max((this.suggestIndex ?? 0) - 1, 0);
                    this.updateSuggestHighlight(items);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const selIdx = (this.suggestIndex > -1) ? this.suggestIndex : 0;
                    if (items[selIdx]) {
                        const targetIdx = parseInt(items[selIdx].dataset.idx ?? selIdx);
                        this.selectGridItem(tr.dataset.index, targetIdx);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    suggestBox.style.display = 'none';
                }
            }
        });

        // Calculations and focus events
        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('focus', () => input.select());
            input.addEventListener('click', () => input.select());
            input.addEventListener('blur', () => {
                if (input.classList.contains('num') && input.value.trim() === '') {
                    const code = tr.querySelector('.item-code-search') ? tr.querySelector('.item-code-search').value.trim() : '';
                    if (code !== '') input.value = '0.00';
                }
            });

            if (input.classList.contains('num')) {
                input.oninput = () => {
                    if (input.classList.contains('pieces')) {
                        const pcs = parseFloat(input.value) || 0;
                        const qpp = parseFloat(tr.dataset.qtyPerPiece) || 0;
                        if (pcs > 0 && qpp > 0) {
                            tr.querySelector('.qty').value = (pcs * qpp).toFixed(2);
                        }
                    }
                    this.calculateRow(tr);
                };
            }
        });

        // Close suggestions on outside click
        document.addEventListener('click', (e) => { 
            const currSuggest = tr._suggestBox || document.querySelector(`.grid-suggest[data-tr-index="${idx}"]`);
            if (e.target !== codeInput && (!currSuggest || !currSuggest.contains(e.target))) {
                if (currSuggest) currSuggest.style.display = 'none';
                this.suggestIndex = -1;
            }
        });
    },

    selectGridItem: function(trOrIndex, matchIdx) {
        let tr = (typeof trOrIndex === 'object' && trOrIndex && trOrIndex.nodeType) ? 
            trOrIndex : 
            (document.querySelector(`#srGridBody > tr[data-index="${trOrIndex}"]`) || document.querySelector(`#srGridBody tr[data-index="${trOrIndex}"]`));
        if (!tr) return;
        const rowIndex = tr.dataset.index;
        
        let item = null;
        if (typeof matchIdx === 'number' && this.currentMatches && this.currentMatches[matchIdx]) {
            item = this.currentMatches[matchIdx];
        } else if (tr._currentMatches && tr._currentMatches[matchIdx]) {
            item = tr._currentMatches[matchIdx];
        }

        // Fallback search by current input text if direct index not matched
        if (!item) {
            const currentVal = (tr.querySelector('.item-code-search')?.value || '').trim().toLowerCase();
            if (currentVal && this.inventory && this.inventory.length > 0) {
                item = this.inventory.find(i => String(i.item_code || i.code || '').toLowerCase() === currentVal || String(i.item_name || i.name || '').toLowerCase() === currentVal)
                    || this.inventory.find(i => String(i.item_code || i.code || '').toLowerCase().includes(currentVal) || String(i.item_name || i.name || '').toLowerCase().includes(currentVal));
            }
        }

        if (item && tr) {
            tr.dataset.coaId = item.id;
            tr.dataset.qtyPerPiece = item.qty_per_piece || 0;
            
            const codeInput = tr.querySelector('.item-code-search');
            if (codeInput) codeInput.value = item.item_code || item.code || '';
            
            const hsInput = tr.querySelector('.hs-code');
            if (hsInput) hsInput.value = item.hs_code || '';
            
            const descInput = tr.querySelector('.si-description');
            if (descInput) descInput.value = item.item_name || item.name || item.description || '';
            
            const unitInput = tr.querySelector('.si-unit');
            if (unitInput) unitInput.value = item.unit || 'Pcs';
            
            const rateInput = tr.querySelector('.rate');
            const saleRate = parseFloat(item.sales_price || item.selling_price || item.rate || 0);
            if (rateInput) rateInput.value = saleRate > 0 ? saleRate.toFixed(2) : '0.00';
            
            const taxRateInput = tr.querySelector('.stax-rate');
            if (taxRateInput) taxRateInput.value = parseFloat(item.tax_rate || 0).toFixed(2);
            
            this.calculateRow(tr);
            
            // Move focus to Pieces
            const piecesInput = tr.querySelector('.pieces');
            if (piecesInput) {
                piecesInput.focus();
                piecesInput.select();
            }
        }
        document.querySelectorAll('.grid-suggest').forEach(s => s.style.display = 'none');
        if (tr && tr._suggestBox) tr._suggestBox.style.display = 'none';
    },

    calculateRow: function(tr) {
        const qty = parseFloat(tr.querySelector('.qty').value) || 0;
        const rate = parseFloat(tr.querySelector('.rate').value) || 0;
        
        const valExcl = qty * rate;
        tr.querySelector('.val-excl').value = valExcl.toFixed(2);
        
        const staxRate = parseFloat(tr.querySelector('.stax-rate').value) || 0;
        const staxAmt = (valExcl * staxRate) / 100;
        tr.querySelector('.stax-amt').value = staxAmt.toFixed(2);
        
        const ftaxRate = parseFloat(tr.querySelector('.ftax-rate').value) || 0;
        const ftaxAmt = (valExcl * ftaxRate) / 100;
        tr.querySelector('.ftax-amt').value = ftaxAmt.toFixed(2);
        
        const valIncl = valExcl + staxAmt + ftaxAmt;
        tr.querySelector('.val-incl').value = valIncl.toFixed(2);
        
        this.calculateTotals();
    },



    calculateTotals: function() {
        let tPcs = 0, tQty = 0, tValExcl = 0, tStaxAmt = 0, tFtaxAmt = 0, tValIncl = 0;
        const rows = document.querySelectorAll('#srGridBody > tr');
        rows.forEach(tr => {
            tPcs += parseFloat(tr.querySelector('.pieces').value) || 0;
            tQty += parseFloat(tr.querySelector('.qty').value) || 0;
            tValExcl += parseFloat(tr.querySelector('.val-excl').value) || 0;
            tStaxAmt += parseFloat(tr.querySelector('.stax-amt').value) || 0;
            tFtaxAmt += parseFloat(tr.querySelector('.ftax-amt').value) || 0;
            tValIncl += parseFloat(tr.querySelector('.val-incl').value) || 0;
        });

        document.getElementById('sr_tot_pieces').value = tPcs.toFixed(2);
        document.getElementById('sr_tot_qty').value = tQty.toFixed(2);
        if(document.getElementById('sr_tot_val_excl')) document.getElementById('sr_tot_val_excl').value = tValExcl.toFixed(2);
        if(document.getElementById('sr_tot_stax_amt')) document.getElementById('sr_tot_stax_amt').value = tStaxAmt.toFixed(2);
        if(document.getElementById('sr_tot_ftax_amt')) document.getElementById('sr_tot_ftax_amt').value = tFtaxAmt.toFixed(2);
        if(document.getElementById('sr_tot_val_incl')) document.getElementById('sr_tot_val_incl').value = tValIncl.toFixed(2);

        const freight = parseFloat(document.getElementById('sr_freight')?.value) || 0;
        const paid = parseFloat(document.getElementById('sr_paid')?.value) || 0;
        
        let finalNet = tValIncl + freight;
        if(document.getElementById('sr_net_tot')) document.getElementById('sr_net_tot').value = finalNet.toFixed(2);
        
        if(document.getElementById('sr_balance')) document.getElementById('sr_balance').value = (finalNet - paid).toFixed(2);
        
        if (typeof this.updateAmountInWords === 'function') {
            this.updateAmountInWords(finalNet);
        } else if (typeof numberToWords === 'function') {
            document.getElementById('sr_amt_words').innerText = numberToWords(finalNet);
        }
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

        return inWords(num).trim();
    },

    updateAmountInWords: function(amount) {
        const el = document.getElementById('sr_amt_words');
        if (!el) return;
        
        if (!amount || isNaN(amount) || amount === 0) {
            el.innerText = 'Rupees zero and 00/100 only.';
            return;
        }

        const integerPart = Math.floor(amount);
        let decimalPart = Math.round((amount - integerPart) * 100);
        
        const words = this.numberToWords(integerPart);
        const decStr = decimalPart < 10 ? '0' + decimalPart : decimalPart;
        
        // Capitalize first letter
        const capitalizedWords = words.charAt(0).toUpperCase() + words.slice(1);
        
        el.innerText = `Rupees ${capitalizedWords} and ${decStr}/100 only.`;
    },

    toggleTaxMode: async function() { this.calculateTotals(); },

    resetForm: async function(fetchNext = false) {
        this.currentId = null;
        const container = document.getElementById('saleReturnContainer');
        if (!container) return;
        
        // Preserve context
        const isTaxEl = document.getElementById('sr_is_tax');
        const wasTax = isTaxEl ? isTaxEl.checked : false;
        
        container.querySelectorAll('input:not(#sr_income_code):not(#sr_income_name):not(#sr_sn):not(#sr_date), textarea').forEach(el => {
            if(el.type === 'checkbox' && el.id !== 'sr_is_tax') el.checked = false;
            else if(el.type !== 'checkbox') el.value = '';
        });
        
        if (isTaxEl) isTaxEl.checked = wasTax; // Restore is_tax
        this.toggleCancelledStamp();
        
        const stamp = document.getElementById('sr_posted_stamp');
        if (stamp) stamp.style.display = 'none';
        const postBtn = document.getElementById('sr_post_btn');
        if (postBtn) {
            postBtn.innerText = "Post";
            postBtn.className = "si-tool-btn si-btn-info";
        }

        
        const dcTextEl = document.getElementById('sr_converted_dc_text');
        const dcNoEl = document.getElementById('sr_converted_dc_no');
        if (dcNoEl) { dcNoEl.innerText = ''; dcNoEl.setAttribute('data-sn', '0'); }
        if (dcTextEl) dcTextEl.style.display = 'none';

        const ogpTextEl = document.getElementById('sr_converted_ogp_text');
        const ogpNoEl = document.getElementById('sr_converted_ogp_no');
        if (ogpNoEl) { ogpNoEl.innerText = ''; ogpNoEl.setAttribute('data-sn', '0'); }
        if (ogpTextEl) ogpTextEl.style.display = 'none';
        
        // Restore default location
        if (this.locations && this.locations.length > 0) {
            let defaultLoc = this.locations.find(l => l.name && l.name.toLowerCase().includes('main store')) || this.locations[0];
            if (defaultLoc) {
                const locInput = document.getElementById('sr_location');
                const locText = document.getElementById('sr_location_text');
                if (locInput && locText) {
                    locInput.value = defaultLoc.id;
                    locText.innerText = defaultLoc.name;
                }
            }
        } else {
            const locText = document.getElementById('sr_location_text');
            if (locText) locText.innerText = 'Select Location';
        }
        
        const dateEl = document.getElementById('sr_date');
        if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();
        
        const tbody = document.getElementById('srGridBody');
        if (tbody) {
            tbody.innerHTML = '';
            for(let i=0; i<40; i++) this.addEmptyRow();
        }
        
        if (fetchNext) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const isTax = 1;
                const res = await fetch(`api/sale_return.php?action=get_next_serial&company_id=${session.company_id || 1}&is_tax=${isTax}`);
                const data = await res.json();
                if (this.currentId !== null) return;
                const snEl = document.getElementById('sr_sn');
                if (snEl) snEl.value = data.next_sn || 1;
            } catch (err) {
                console.error("Error fetching next serial:", err);
            }
        }
        // Restore Income Account default
        const incCode = document.getElementById('sr_income_code');
        const incName = document.getElementById('sr_income_name');
        if (incCode && !incCode.value) incCode.value = '40001002';
        if (incName && !incName.value) incName.value = 'Sales Return';
        
        await this.toggleTaxMode(false);
    },

    convertDC: async function() {
        if (!this.currentId) {
            alert("Please save the Sale Invoice first before converting to D.C.");
            return;
        }
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            const res = await fetch(`api/delivery_challan.php?action=get_next_serial_no&company_id=${companyId}`);
            const data = await res.json();
            const nextNo = data.next_sn || data.next_no;
            
            if (nextNo) {
                const el = document.getElementById('sr_converted_dc_no');
                if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                const textEl = document.getElementById('sr_converted_dc_text');
                if (textEl) textEl.style.display = 'block';
                
                const siSnToConvert = document.getElementById('sr_sn').value;
                const saveBtn = document.querySelector('.si-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.saveInvoice();
                    saveBtn.innerText = originalText;
                } else {
                    await this.saveInvoice();
                }

                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Sales/delivery_challans.html', 'fa-truck-loading', 'Delivery Challans', () => {
                        let tries = 0;
                        const checkModule = setInterval(async () => {
                            tries++;
                            if (window.DeliveryChallanModule && typeof window.DeliveryChallanModule.init === 'function') {
                                clearInterval(checkModule);
                                await window.DeliveryChallanModule.init();
                                setTimeout(() => {
                                    if (typeof window.DeliveryChallanModule.fetchSaleInvoiceData === 'function') {
                                        window.DeliveryChallanModule.fetchSaleInvoiceData(siSnToConvert);
                                    } else {
                                        console.warn("fetchSaleInvoiceData missing in DeliveryChallanModule.");
                                    }
                                }, 100);
                            } else if (tries > 50) {
                                clearInterval(checkModule);
                            }
                        }, 100);
                    }, 'Delivery Challans', false, true);
                }
            }
        } catch (e) {
            console.error("Convert DC Error:", e);
            alert("Failed to convert to Delivery Challan.");
        }
    },

    convertOGP: async function() {
        if (!this.currentId) {
            alert("Please save the Sale Invoice first before converting to O.G.P.");
            return;
        }
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            const res = await fetch(`api/outward_gate_passes.php?action=get_next_serial_no&company_id=${companyId}`);
            const data = await res.json();
            const nextNo = data.next_sn || data.next_no;
            
            if (nextNo) {
                const el = document.getElementById('sr_converted_ogp_no');
                if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                const textEl = document.getElementById('sr_converted_ogp_text');
                if (textEl) textEl.style.display = 'block';
                
                const siSnToConvert = document.getElementById('sr_sn').value;
                const saveBtn = document.querySelector('.si-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.saveInvoice();
                    saveBtn.innerText = originalText;
                } else {
                    await this.saveInvoice();
                }

                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Store/outward_gate_passes.html', 'fa-truck-loading', 'Outward Gate Passes', () => {
                        let tries = 0;
                        const checkModule = setInterval(async () => {
                            tries++;
                            if (window.OGPModule && typeof window.OGPModule.init === 'function') {
                                clearInterval(checkModule);
                                await window.OGPModule.init();
                                setTimeout(() => {
                                    if (typeof window.OGPModule.fetchSaleInvoiceData === 'function') {
                                        window.OGPModule.fetchSaleInvoiceData(siSnToConvert);
                                    } else {
                                        console.warn("fetchSaleInvoiceData missing in OGPModule.");
                                    }
                                }, 100);
                            } else if (tries > 50) {
                                clearInterval(checkModule);
                            }
                        }, 100);
                    }, 'Outward Gate Passes', false, true);
                }
            }
        } catch (e) {
            console.error("Convert OGP Error:", e);
            alert("Failed to convert to O.G.P.");
        }
    },

    saveInvoice: async function(silent = false) {
        console.log("saveInvoice called, silent=", silent);
        
        const siNo = document.getElementById('sr_si_no')?.value.trim();
        if (!siNo) {
            if (!silent) alert("Sale Invoice No. enter karein");
            return false;
        }

        const custInput = document.getElementById('sr_cust_code');
        const customerId = custInput ? custInput.dataset.coaId : null;
        if (!customerId) {
            if (!silent) alert("Please select a valid Customer!");
            return false;
        }

        try {
            const getVal = (id) => {
                const el = document.getElementById(id);
                return el ? el.value : '';
            };
            const getNum = (id) => {
                const val = getVal(id);
                return parseFloat(val.replace(/,/g, '')) || 0;
            };

            const payload = {
                id: this.currentId,
                serial_no: getVal('sr_sn'),
                is_tax_return: false,
                return_date: getVal('sr_date'),
                return_type: 'Sale Return',
                sale_invoice_no: getVal('sr_si_no'),
                sale_invoice_date: getVal('sr_si_date'),
                nature_of_credit_note: getVal('sr_nature'),
                dummy_field: '',
                payment_terms: getVal('sr_payment_terms'),
                income_account: getVal('sr_income_code'),
                customer_coa_id: customerId,
                customer_address: document.getElementById('sr_cust_address')?.value || '',
                customer_telephone: document.getElementById('sr_cust_phone')?.value || '',
                customer_ntn: document.getElementById('sr_cust_ntn')?.value || '',
                customer_gst: document.getElementById('sr_cust_gst')?.value || '',
                inventory_location_id: getVal('sr_location'),
                job_no: getVal('sr_job_desc'),
                employee_ref: getVal('sr_emp_ref'),
                remarks: getVal('sr_remarks'),
                amount_in_words: document.getElementById('sr_amt_words')?.innerText || '',
                carriage_freight: getNum('sr_freight'),
                additional_discount: 0,
                net_total: getNum('sr_net_tot'),
                amount_paid: getNum('sr_paid'),
                is_cancelled: document.getElementById('sr_is_cancelled')?.checked ? 1 : 0,
                items: []
            };

            document.querySelectorAll('#srGridBody > tr').forEach(tr => {
                if (!tr.dataset.coaId) return;
                
                const getRowNum = (selector) => {
                    const el = tr.querySelector(selector);
                    return el ? (parseFloat(el.value.replace(/,/g, '')) || 0) : 0;
                };

                payload.items.push({
                    item_coa_id: tr.dataset.coaId,
                    hs_code: tr.querySelector('.hs-code')?.value || '',
                    description: tr.querySelector('.si-description')?.value || '',
                    pieces: getRowNum('.pieces'),
                    quantity: getRowNum('.qty'),
                    unit: tr.querySelector('.si-unit')?.value || '',
                    rate: getRowNum('.rate'),
                    gross_amount: getRowNum('.val-excl'),
                    discount_percent: 0,
                    discount_amount: 0,
                    sales_tax_rate: getRowNum('.stax-rate'),
                    sales_tax_amount: getRowNum('.stax-amt'),
                    further_tax_rate: getRowNum('.ftax-rate'),
                    further_tax_amount: getRowNum('.ftax-amt'),
                    net_amount: getRowNum('.val-incl')
                });
            });

            if (payload.items.length === 0) {
                if (!silent) alert("Please add at least one item!");
                return false;
            }

            console.log("Sending payload: ", payload);

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const res = await fetch(`api/sale_return.php?action=save_return&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            
            console.log("Save result: ", result);
            
            if (result.status === 'success') { 
                if (!silent) alert("Invoice saved successfully!");
                this.currentId = result.id || this.currentId;
                document.getElementById('sr_sn').value = result.serial_no || payload.serial_no;
                if (!silent) this.resetForm(true);
                return true;
            } else {
                if (!silent) alert("Failed to save: " + (result.message || 'Unknown error'));
                return false;
            }
        } catch (e) {
            console.error("Save Exception: ", e);
            if (!silent) alert("Network or Server error while saving.");
            return false;
        }
    },

    togglePost: async function() {
        if (!this.currentId) return alert("Please select or save an invoice first.");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const newPostedState = this.isPosted ? 0 : 1;
        const confirmMsg = newPostedState ? "Are you sure you want to Post this invoice?" : "Are you sure you want to Un-Post this invoice? This will remove its ledger impact.";
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`api/sale_return.php?action=toggle_post_return&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentId, is_posted: newPostedState })
            });
            const result = await res.json();
            if (result.status === 'success') {
                this.navigate('this'); // Reload current invoice to reflect changes
            } else {
                alert("Error: " + result.message);
            }
        } catch(e) { alert("Failed to change post status."); }
    },

    showToast: function(msg) {
        let toast = document.getElementById('sr_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sr_toast';
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
        let sn = parseInt(document.getElementById('sr_sn').value) || 0;
        const isTax = 1;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/sale_return.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTax}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (sn === 0 || dir === 'this') {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/sale_return.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTax}`);
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

        if (sn < 1 && dir !== 'next' && dir !== 'prev') {
            if (dir === 'last' || dir === 'this') {
                this.resetForm(true);
            }
            return;
        }

        try {
            let url = `api/sale_return.php?action=get_return&serial_no=${sn}&company_id=${companyId}&is_tax=${isTax}`;
            if (dir === 'next' || dir === 'prev') url += `&dir=${dir}`;
            const res = await fetch(url);
            const inv = await res.json();
            
            if (inv && inv.id) {
                this.loadInvoiceData(inv);
            } else {
                if (dir === 'next' || dir === 'last') {
                    this.showToast('آپ آخری ریکارڈ پر ہیں - You are on the last record');
                } else if (dir === 'prev') {
                    this.showToast('You are on the first record');
                } else {
                    await this.resetForm(false);
                    document.getElementById('sr_sn').value = sn;
                    document.getElementById('sr_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation error:", e); }
    },

    loadInvoiceData: async function(inv) {
        this.currentId = inv.id;
        document.getElementById('sr_sn').value = inv.serial_no;
        
        // Post/Un-post UI
        const postBtn = document.getElementById('sr_post_btn');
        const stamp = document.getElementById('sr_posted_stamp');
        if (postBtn && stamp) {
            this.isPosted = (inv.is_posted == 1);
            if (this.isPosted) {
                postBtn.innerText = "Un-Post";
                postBtn.className = "si-tool-btn si-btn-info";
                stamp.style.display = "block";
            } else {
                postBtn.innerText = "Post";
                postBtn.className = "si-tool-btn si-btn-info";
                stamp.style.display = "none";
            }
        }
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('sr_date', inv.return_date || inv.invoice_date);
        setVal('sr_si_no', inv.sale_invoice_no || inv.delivery_challan_no);
        setVal('sr_si_date', inv.sale_invoice_date || inv.delivery_challan_date);
        setVal('sr_nature', inv.nature_of_credit_note || inv.return_type);
        setVal('sr_payment_terms', inv.payment_terms);
        setVal('sr_income_code', inv.income_account || inv.income_code);
        setVal('sr_location', inv.inventory_location_id);
        setVal('sr_job_desc', inv.job_no);
        setVal('sr_emp_ref', inv.employee_ref);
        setVal('sr_remarks', inv.remarks);
        setVal('sr_freight', inv.carriage_freight || '0.00');
        setVal('sr_paid', inv.amount_paid || inv.amount_received || '0.00');

        if (inv.customer_coa_id) {
            await this.selectCustomer(inv.customer_coa_id);
            if (inv.customer_address) document.getElementById('sr_cust_address').value = inv.customer_address;
            if (inv.customer_telephone) document.getElementById('sr_cust_phone').value = inv.customer_telephone;
            if (inv.customer && inv.customer.ntn) document.getElementById('sr_cust_ntn').value = inv.customer.ntn;
            if (inv.customer && inv.customer.gst_reg_no) document.getElementById('sr_cust_gst').value = inv.customer.gst_reg_no;
        }

        const tbody = document.getElementById('srGridBody');
        tbody.innerHTML = '';
        if (inv.items && inv.items.length > 0) {
            inv.items.forEach(item => this.addEmptyRow(item));
        }
        while(tbody.children.length < 40) this.addEmptyRow();
        this.calculateTotals();
        this.toggleTaxMode(false);

        const isCancelled = parseInt(inv.is_cancelled) === 1;
        const cancelCb = document.getElementById('sr_is_cancelled');
        if (cancelCb) cancelCb.checked = isCancelled;
        this.toggleCancelledStamp();

        // Restore converted DC/OGP status
        const dcTextEl = document.getElementById('sr_converted_dc_text');
        const dcNoEl = document.getElementById('sr_converted_dc_no');
        if (inv.converted_dc_no) {
            if (dcNoEl) dcNoEl.innerText = inv.converted_dc_no;
            if (dcTextEl) dcTextEl.style.display = 'block';
        } else {
            if (dcNoEl) dcNoEl.innerText = '';
            if (dcTextEl) dcTextEl.style.display = 'none';
        }

        const ogpTextEl = document.getElementById('sr_converted_ogp_text');
        const ogpNoEl = document.getElementById('sr_converted_ogp_no');
        if (inv.converted_ogp_no) {
            if (ogpNoEl) ogpNoEl.innerText = inv.converted_ogp_no;
            if (ogpTextEl) ogpTextEl.style.display = 'block';
        } else {
            if (ogpNoEl) ogpNoEl.innerText = '';
            if (ogpTextEl) ogpTextEl.style.display = 'none';
        }
    },

    deleteInvoice: async function() {
        if (!this.currentId) return alert("No Invoice loaded.");
        if (!confirm("Are you sure?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/sale_return.php?action=delete_return&id=${this.currentId}&company_id=${session.company_id || 1}`, { method: 'POST' });
            const result = await res.json();
            if (result.status === 'success') { alert("Deleted!"); this.resetForm(true); }
        } catch (e) { alert("Failed."); }
    },

    openPrintSettings: function() {
        const paper = localStorage.getItem('sr_sett_paper') || 'A4';
        const printTax = localStorage.getItem('sr_sett_print_tax') || '0';
        const printHs = localStorage.getItem('sr_sett_print_hs') || '0';
        const printDisc = localStorage.getItem('sr_sett_print_disc') || '1';
        const noHeader = localStorage.getItem('sr_sett_no_headers') || '0';
        
        const paperRadios = document.getElementsByName('sr_print_paper');
        for (let r of paperRadios) { if (r.value === paper) r.checked = true; }
        
        if (printTax === '1') document.getElementById('sr_sett_tax_yes').checked = true;
        else document.getElementById('sr_sett_tax_no').checked = true;

        if (printHs === '1') document.getElementById('sr_sett_hs_yes').checked = true;
        else document.getElementById('sr_sett_hs_no').checked = true;

        if (printDisc === '1') document.getElementById('sr_sett_disc_yes').checked = true;
        else document.getElementById('sr_sett_disc_no').checked = true;
        
        document.getElementById('sr_sett_no_headers').checked = (noHeader === '1');
        
        const modal = document.getElementById('srPrintSettingsModal');
        if (modal) modal.style.display = 'flex';
    },

    savePrintSettings: function() {
        const paperRadios = document.getElementsByName('sr_print_paper');
        let paper = 'A4';
        for (let r of paperRadios) { if (r.checked) paper = r.value; }
        
        const printTax = document.getElementById('sr_sett_tax_yes').checked ? '1' : '0';
        const printHs = document.getElementById('sr_sett_hs_yes').checked ? '1' : '0';
        const printDisc = document.getElementById('sr_sett_disc_yes').checked ? '1' : '0';
        const noHeader = document.getElementById('sr_sett_no_headers').checked ? '1' : '0';
        
        localStorage.setItem('sr_sett_paper', paper);
        localStorage.setItem('sr_sett_print_tax', printTax);
        localStorage.setItem('sr_sett_print_hs', printHs);
        localStorage.setItem('sr_sett_print_disc', printDisc);
        localStorage.setItem('sr_sett_no_headers', noHeader);
        
        document.getElementById('srPrintSettingsModal').style.display = 'none';
    },

    exportExcel: function() { this.printInvoice('excel'); },
    printVoucher: function() { this.printInvoice('voucher'); },

    printInvoice: async function(mode = 'print') {
        const customerId = document.getElementById('sr_cust_code').dataset.coaId;
        if (!customerId) return alert("Please select a valid Customer before printing!");

        const isVoucher = (mode === true || mode === 'voucher');
        const isExcel = (mode === 'excel');

        const noHeader = localStorage.getItem('sr_sett_no_headers') === '1';
        const paperSize = localStorage.getItem('sr_sett_paper') || 'A4';
        
        let winProps = 'width=900,height=600';
        if (paperSize === 'POS') winProps = 'width=400,height=600';
        else if (paperSize === 'A5P') winProps = 'width=600,height=800';
        
        let printWindow = null;
        if (!isExcel) {
            printWindow = window.open('', '_blank', winProps);
            if (!printWindow) {
                alert("Popup blocked! Please allow popups for this site.");
                return;
            }
        } else {
            // For Excel, open a blank window synchronously to prevent browser from blocking the download after await
            printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert("Popup blocked! Please allow popups for this site.");
                return;
            }
        }

        const saveBtn = document.querySelector('.si-btn-save');
        let saveSuccess = false;
        
        if (saveBtn) {
            const originalText = saveBtn.innerText;
            saveBtn.innerText = 'Saving...';
            saveSuccess = await this.saveInvoice(true);
            saveBtn.innerText = originalText;
        } else {
            saveSuccess = await this.saveInvoice(true);
        }
        
        if (!saveSuccess) {
            if (printWindow) printWindow.close();
            alert("Failed to auto-save invoice before printing. Please make sure all details are filled.");
            return;
        }

        if (!this.currentId) {
            if (printWindow) printWindow.close();
            return alert("Please save or retrieve an invoice first.");
        }

        const printTaxCol = localStorage.getItem('sr_sett_print_tax') === '1';
        const printHsCol = localStorage.getItem('sr_sett_print_hs') === '1';
        const printDiscCol = localStorage.getItem('sr_sett_print_disc') !== '0';

        const sn = document.getElementById('sr_sn').value;
        const date = document.getElementById('sr_date').value;
        const vCode = document.getElementById('sr_cust_code').value;
        const vName = document.getElementById('sr_cust_name').value;
        const vAddress = document.getElementById('sr_cust_address').value;
        const vTel = document.getElementById('sr_cust_phone').value;
        const isTax = true;
        const type = 'Sale Return';

        const totPieces = document.getElementById('sr_tot_pieces').value;
        const totQty = document.getElementById('sr_tot_qty').value;
        const totNet = document.getElementById('sr_net_tot').value;
        const amtWords = document.getElementById('sr_amt_words').innerText;
        const remarks = document.getElementById('sr_remarks').value;
        
        const netTot = parseFloat(totNet.replace(/,/g, '')) || 0;
        const freight = parseFloat(document.getElementById('sr_freight').value) || 0;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        
        let ledgerBal = 0;
        try {
            const balRes = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${customerId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
            const balData = await balRes.json();
            ledgerBal = parseFloat(balData.balance || 0); // Positive is Dr, Negative is Cr
        } catch(e) {
            console.error("Failed to fetch fresh balance for print:", e);
        }

        let previousBalance = 0;
        let currentBalance = 0;
        
        // After saveInvoice(true), the invoice is definitely posted and included in the ledger balance
        currentBalance = ledgerBal;
        previousBalance = currentBalance - netTot;

        const formatBal = (val) => {
            if (val < 0) return '(' + Math.abs(val).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ')';
            return val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        };
        const formatAmt = (val) => parseFloat(val || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        const companies = JSON.parse(localStorage.getItem('softifyx_companies') || '[]');
        const company = companies.find(c => c.id == session.company_id) || {};
        
        let coName = company.name || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
        coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');
        
        const coAddress = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
        const coPhone = company.phone || '+92 348 7240256';
        const coEmail = company.email || 'info@seastonepipes.com';
        
        let customLogo = null;
        const coNameStr = session.company_name || '';
        
        try {
            const res = await fetch(`api/admin.php?action=get_company&company_id=${session.company_id || 1}`);
            const dbCo = await res.json();
            if (dbCo && dbCo.logo_data && dbCo.logo_data.startsWith('data:image')) {
                customLogo = dbCo.logo_data;
                localStorage.setItem(`softifyx_${coNameStr}_logo`, customLogo);
            }
        } catch (e) { }
        
        if (!customLogo && coNameStr) customLogo = localStorage.getItem(`softifyx_${coNameStr}_logo`);
        
        if (!customLogo && typeof window.getCompanyLogo === 'function') {
            customLogo = window.getCompanyLogo();
        }
        
        if (!customLogo || !customLogo.startsWith('data:image')) {
            for (let i = 0; i < localStorage.length; i++) {
                let k = localStorage.key(i);
                if (k && k.includes('_logo')) {
                    let val = localStorage.getItem(k);
                    if (val && val.startsWith('data:image')) {
                        customLogo = val;
                        break;
                    }
                }
            }
        }
        
        if (!customLogo || !customLogo.startsWith('data:image')) {
            customLogo = 'assets/logos/logo.png';
        }
        
        const preparedBy = document.getElementById('sr_find_added_by')?.value || 'Administrator';
        const printedBy = (typeof session !== 'undefined' ? (session.username || session.user_name || session.name) : '') || 'Administrator';
        
        const invoiceTitle = isVoucher ? "SALE RETURN VOUCHER" : "SALE RETURN";

        let itemsHtml = '';
        const validItems = [];
        document.querySelectorAll('#srGridBody > tr').forEach((tr) => {
            const code = tr.querySelector('.item-code-search').value;
            if (!code) return;
            validItems.push(tr);
        });

        let sumGross = 0;
        let sumDisc = 0;
        let sumNet = 0;
        let sumStax = 0;
        let sumFtax = 0;

        validItems.forEach((tr, i) => {
            const code = tr.querySelector('.item-code-search').value;
            const desc = tr.querySelector('.si-description').value;
            const pieces = parseFloat(tr.querySelector('.pieces').value || 0).toFixed(2);
            const qty = parseFloat(tr.querySelector('.qty').value || 0).toFixed(2);
            const unit = tr.querySelector('.si-unit').value;
            const rate = parseFloat(tr.querySelector('.rate').value || 0).toFixed(2);
            const hsCode = tr.querySelector('.hs-code').value || '-';
            
            let amountHtml = '';
                const excl = parseFloat(tr.querySelector('.val-excl').value || 0).toFixed(2);
                const staxRate = parseFloat(tr.querySelector('.stax-rate').value || 0).toFixed(2);
                const staxAmt = parseFloat(tr.querySelector('.stax-amt').value || 0).toFixed(2);
                const ftaxRate = parseFloat(tr.querySelector('.ftax-rate').value || 0).toFixed(2);
                const ftaxAmt = parseFloat(tr.querySelector('.ftax-amt').value || 0).toFixed(2);
                const incl = parseFloat(tr.querySelector('.val-incl').value || 0).toFixed(2);
                
                sumGross += parseFloat(excl);
                sumStax += parseFloat(staxAmt);
                sumFtax += parseFloat(ftaxAmt);
                sumNet += parseFloat(incl);

                if (printTaxCol) {
                    amountHtml = `
                        <td style="text-align:right;">${excl}</td>
                        <td style="text-align:right;">${staxRate}%</td>
                        <td style="text-align:right;">${staxAmt}</td>
                        <td style="text-align:right;">${ftaxRate}%</td>
                        <td style="text-align:right;">${ftaxAmt}</td>
                        <td style="text-align:right;">${incl}</td>
                    `;
                } else {
                    amountHtml = `
                        <td style="text-align:right;">${incl}</td>
                    `;
                }
                
                itemsHtml += `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    ${printHsCol ? '<td>' + hsCode + '</td>' : ''}
                    <td>${desc}</td>
                    <td style="text-align:center;">${pieces}</td>
                    <td style="text-align:center;">${qty} ${unit}</td>
                    <td style="text-align:right;">${rate}</td>
                    ${amountHtml}
                </tr>
            `;
        });

        // Determine column headers based on settings
        let headerHtml = `
            <th>#</th>
            ${printHsCol ? '<th>HS Code</th>' : ''}
            <th>Description</th>
            <th>Pcs</th>
            <th>Qty</th>
            <th>Rate</th>
        `;
        
        let headerColspan = 2;
        if (printHsCol) headerColspan++;
        
        if (isTax) {
            if (printTaxCol) {
                headerHtml += '<th>Value Excl</th><th>STax</th><th>FTax</th><th>Value Incl</th>';
            } else {
                headerHtml += '<th>Net Amount</th>';
            }
        } else {
            if (printDiscCol) {
                headerHtml += '<th>Gross</th><th>Disc</th><th>Net</th>';
            } else {
                headerHtml += '<th>Net Amount</th>';
            }
        }

        // Adjust totals colspan based on tax/disc columns
        let emptyCellsHtml = '';
        let emptyTotalCellsHtml = '';
        if (isTax && printTaxCol) {
            emptyCellsHtml = '<td></td><td></td><td></td>';
            emptyTotalCellsHtml = '<td></td><td></td><td></td>';
        } else if (!isTax && printDiscCol) {
            emptyCellsHtml = '<td></td><td></td>';
            emptyTotalCellsHtml = '<td></td><td></td>';
        }

        // Window properties based on paper size handled at the top
        
        let headerSection = noHeader ? '<div style="height: 120px;"></div>' : `
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
                            <span><i class="fas fa-globe"></i> www.seastonepipes.com</span>
                        </div>
                    </div>
                </div>
                <div class="invoice-badge-area">
                    <div class="invoice-title">${invoiceTitle}</div>
                    <div class="invoice-type-badge">SALE RETURN</div>
                </div>
            </div>
        `;
        
        let cssAdditions = '';
        if (paperSize === 'A5L') cssAdditions = '@page { size: A5 landscape; }';
        else if (paperSize === 'A5P') cssAdditions = '@page { size: A5 portrait; }';
        else if (paperSize === 'POS') cssAdditions = '@page { size: 80mm auto; margin: 0; } body { font-size: 8px; margin: 5mm; } .company-name { font-size: 14px; } .invoice-details-table td { font-size: 8px; padding: 2px; } .grid-table th, .grid-table td { font-size: 8px; padding: 2px; } .lower-area { flex-direction: column; } .left-lower, .right-lower { width: 100%; margin-bottom: 5px; } .header-area { flex-direction: column; align-items: center; text-align: center; } .logo-box { width: 60px; height: 60px; } .company-info { padding-left: 0; align-items: center; } .invoice-badge-area { align-items: center; margin-top: 10px; } .contact-row { flex-direction: column; gap: 2px; } .details-area { flex-direction: column; gap: 5px; } .customer-box { width: 100%; } .invoice-details-table { width: 100%; }';

        const html = `
            <html>
            <head>
                <title>${type} - ${sn}</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                <style>
                    @page { margin: 0; size: auto; }
                    ${cssAdditions}
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
                    .customer-box { border: 1px solid #a0a0a0; border-radius: 4px; width: 45%; padding: 0; overflow: hidden; }
                    .customer-box-header { border-bottom: 1px solid #a0a0a0; padding: 5px 10px; font-weight: bold; color: #1F4E79; display: flex; align-items: center; gap: 5px; }
                    .customer-box-content { padding: 10px; line-height: 1.6; }
                    .customer-box-content i { color: #1F4E79; width: 14px; text-align: center; }

                    .invoice-details-table { width: 45%; border-collapse: collapse; font-size: 10px; }
                    .invoice-details-table td { padding: 5px; border-bottom: 1px dotted #ccc; }
                    .invoice-details-table td:first-child { font-weight: bold; color: #1F4E79; width: 100px; }

                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .grid-table th { border: 1px solid #000; padding: 6px 4px; font-size: 9px; text-align: center; text-transform: uppercase; color: black; font-weight: bold; }
                    .grid-table td { border: 1px solid #000; padding: 2px 4px; height: 20px; color: black; }
                    .grid-table td:nth-child(2), .grid-table td:nth-child(${printHsCol ? '3' : '2'}) { text-align: left; }
                    
                    .totals-row td { background: transparent; border: 1px solid #000; font-weight: bold; padding: 6px 4px; border-bottom: 1px solid #000; color: black; }
                    .totals-row .net-total-cell { border: 1px solid #000; text-align: right; color: black; font-weight: bold; }

                    .lower-area { display: flex; justify-content: space-between; margin-top: 15px; }
                    
                    .left-lower { width: 55%; border: 1px solid #a0a0a0; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden; }
                    .lower-box-section { padding: 8px 10px; flex: 1; }
                    .lower-box-section:first-child { border-bottom: 1px solid #a0a0a0; }
                    .lower-box-header { font-weight: bold; color: #1F4E79; display: flex; align-items: center; gap: 5px; margin-bottom: 5px; font-size: 9px; }
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
                    ${headerSection}

                    <div class="details-area">
                        <div class="customer-box">
                            <div class="customer-box-header">
                                <i class="fas fa-user-circle"></i> CUSTOMER
                            </div>
                            <div class="customer-box-content">
                                <strong>${vName} (${vCode})</strong><br>
                                ${vAddress.split(',')[0]}<br>
                                <i class="fas fa-phone-alt" style="margin-top: 5px;"></i> ${vTel || 'N/A'}
                            </div>
                        </div>
                        <table class="invoice-details-table">
                            <tr>
                                <td>Return No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${sn}</b></td>
                            </tr>
                            <tr>
                                <td>Date</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${date}</b></td>
                            </tr>
                            <tr>
                                <td>Return Type</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>Sale Return</b></td>
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
                                <td style="text-align: left; border: none; padding-top: 15px;">${vCode}</td>
                                <td style="text-align: left; border: none; padding-top: 15px;">${vName}</td>
                                <td style="text-align: right; border: none; padding-top: 15px;">${formatAmt(netTot)}</td>
                                <td style="text-align: right; border: none; padding-top: 15px;"></td>
                            </tr>
                            <tr>
                                <td style="text-align: left; border: none; padding-top: 10px; padding-bottom: 15px;">40001001</td>
                                <td style="text-align: left; border: none; padding-top: 10px; padding-bottom: 15px;">Sales</td>
                                <td style="text-align: right; border: none; padding-top: 10px; padding-bottom: 15px;"></td>
                                <td style="text-align: right; border: none; padding-top: 10px; padding-bottom: 15px;">${formatAmt(netTot)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr class="totals-row">
                                <td colspan="2" style="text-align: right; border-left: none; border-right: none; background: transparent;">Totals</td>
                                <td style="text-align: right; border-left: none; border-right: none;">${formatAmt(netTot)}</td>
                                <td style="text-align: right; border-left: none; border-right: none;">${formatAmt(netTot)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    ` : `
                    <table class="grid-table">
                        <thead>
                            <tr>
                                ${headerHtml}
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr class="totals-row">
                                <td colspan="${headerColspan}" style="text-align: right;">TOTALS</td>
                                <td style="text-align: center;">${totPieces}</td>
                                <td style="text-align: center;">${totQty}</td>
                                <td></td>
                                ${emptyTotalCellsHtml}
                                <td class="net-total-cell">${sumNet.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    `}

                    <div class="lower-area" style="${isVoucher ? 'display: block;' : ''}">
                        <div class="left-lower" style="${isVoucher ? 'width: 100%; border: none;' : ''}">
                            <div class="lower-box-section" style="${isVoucher ? 'border: none; padding-left: 0;' : ''}">
                                <div class="lower-box-header" style="${isVoucher ? 'display: inline-block; font-style: italic; font-weight: normal; margin-right: 5px; color: #000;' : ''}">
                                    ${isVoucher ? '' : '<i class="fas fa-file-invoice-dollar" style="font-size: 14px; margin-right: 5px;"></i> '}AMOUNT IN WORDS${isVoucher ? ' :' : ''}
                                </div>
                                <div class="lower-box-content" style="${isVoucher ? 'display: inline-block; padding-left: 0; font-weight: bold;' : ''}">
                                    ${amtWords}
                                </div>
                            </div>
                            ${isVoucher ? '' : `
                            <div class="lower-box-section">
                                <div class="lower-box-header">
                                    <i class="fas fa-comment-dots" style="font-size: 14px; margin-right: 5px;"></i> REMARKS
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
                                <span>Carriage & Freight Rs.</span>
                                <span></span>
                                <span>${formatAmt(freight)}</span>
                            </div>
                            <div class="summary-row net-amount" style="border: none; padding: 4px 15px; font-size: 13px; font-style: italic; font-weight: bold;">
                                <span>Return Total Rs.</span>
                                <span></span>
                                <span>${formatAmt(netTot)}</span>
                            </div>
                            
                        </div>
                        `}
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
                    <tr><td colspan="10" class="center bold" style="font-size: 12px; color: #FF8C00;">SALE RETURN</td></tr>
                    <tr><td colspan="10"></td></tr>
                    
                    <tr>
                        <td colspan="5" class="bold" style="background:#f8f9fa; border:1px solid #000;">CUSTOMER DETAILS</td>
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
                            Return Type: <b>Sale Return</b>
                        </td>
                    </tr>
                    <tr><td colspan="10"></td></tr>
                </table>
                <table class="border">
                    <tr>
                        ${headerHtml}
                    </tr>
                    ${itemsHtml}
                    <tr>
                        <td colspan="${headerColspan}" class="right bold">TOTALS</td>
                        <td class="center bold">${totPieces}</td>
                        <td class="center bold">${totQty}</td>
                        <td></td>
                        ${emptyTotalCellsHtml}
                        <td class="right bold">${sumNet.toFixed(2)}</td>
                    </tr>
                </table>
                <table>
                    <tr><td colspan="10"></td></tr>
                    <tr>
                        <td colspan="${headerColspan + 3}" rowspan="4" style="vertical-align: top; border:1px solid #000;">
                            <div class="bold">AMOUNT IN WORDS:</div>
                            <div>${amtWords}</div><br>
                            <div class="bold">REMARKS:</div>
                            <div>${remarks || '-'}</div>
                        </td>
                        <td colspan="${emptyTotalCellsHtml ? 2 : 1}" class="bold right" style="border:1px solid #000;">Carriage &amp; Freight Rs.</td>
                        <td class="right" style="border:1px solid #000;">${formatAmt(freight)}</td>
                    </tr>
                    <tr>
                        <td colspan="${emptyTotalCellsHtml ? 2 : 1}" class="bold right" style="border:1px solid #000;">Return Total Rs.</td>
                        <td class="right bold" style="border:1px solid #000;">${formatAmt(netTot)}</td>
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
            const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
            const url = URL.createObjectURL(blob);
            if (printWindow) {
                printWindow.document.write('Downloading Excel file...');
                const a = printWindow.document.createElement('a');
                a.href = url;
                a.download = `Sale_Return_${sn}.xls`;
                printWindow.document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    printWindow.close();
                    URL.revokeObjectURL(url);
                }, 500);
            }
        } else {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = function() {
                printWindow.print();
            };
        }
    },


    fetchSaleOrderData: async function(poNo, isTax) {
        if (!poNo) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            const res = await fetch(`api/sale_invoice.php?action=get_po&serial_no=${poNo}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch PO data.");
                return;
            }
            const po = await res.json();
            
            if (!po || !po.id) {
                alert(`Sale Order #${poNo} not found in database.`);
                return;
            }

            // Set Tax mode
            const taxCheckbox = document.getElementById('sr_is_tax');
            if (taxCheckbox) {
                taxCheckbox.checked = isTax;
                this.toggleTaxMode(false);
            }
            
            // Wait for dependencies to load if not already
            if (!this.customers || this.customers.length === 0) {
                await this.loadCustomers();
            }
            if (!this.inventory || this.inventory.length === 0) {
                await this.loadInventory();
            }

            // Fetch new next serial number for this invoice
            const isTaxVal = 1;
            const resSn = await fetch(`api/sale_return.php?action=get_next_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('sr_sn');
                if (snEl) snEl.innerText = snData.next_sn || '';
            }

            // Fill header
            document.getElementById('sr_cust_code').value = '';
            document.getElementById('sr_cust_name').value = '';
            
            const poNoEl = document.getElementById('sr_po_no');
            if (poNoEl) poNoEl.value = po.serial_no || poNo;
            
            const poDateEl = document.getElementById('sr_po_date');
            if (poDateEl && po.po_date) poDateEl.value = po.po_date;
            
            if (po.customer_coa_id) {
                await this.selectCustomer(po.customer_coa_id);
                if (po.customer_address) document.getElementById('sr_cust_address').value = po.customer_address;
                if (po.customer_telephone) document.getElementById('sr_cust_phone').value = po.customer_telephone;
                if (po.ntn) document.getElementById('sr_cust_ntn').value = po.ntn;
                if (po.gst_reg_no) document.getElementById('sr_cust_gst').value = po.gst_reg_no;
            }
            
            // Fill Items
            const tbody = document.querySelector('#srGridBody');
            tbody.innerHTML = '';
            
            if (po.items && po.items.length > 0) {
                po.items.forEach(item => {
                    this.addEmptyRow(item);
                });
            }
            
            // Pad
            while(tbody.children.length < 8) {
                this.addEmptyRow();
            }

            this.calculateTotals();
            alert(`Imported Sale Order #${poNo} successfully!`);
        } catch (err) {
            console.error("Convert PO Error:", err);
            alert("System error importing Purchase Order.");
        }
    },

    // Find Modal Methods
    findData: [],
    findSelectedIndex: -1,
    findSortField: 'serial_no',
    findSortDesc: false,
    findKeydownAdded: false,

    openFindModal: async function() {
        const modal = document.getElementById('sr_find_modal');
        if (modal) modal.style.display = 'flex';
        
        const searchInput = document.getElementById('sr_find_search');
        if (searchInput) searchInput.focus();
        
        if (!this.findKeydownAdded) {
            document.addEventListener('keydown', (e) => this.handleFindKeyDown(e));
            this.findKeydownAdded = true;
        }

        await this.renderFindTable();
    },

    closeFindModal: function() {
        const modal = document.getElementById('sr_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('sr_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/sale_return.php?action=search_returns&company_id=${companyId}`);
            this.findData = await res.json();
            // Default sort to ascending serial number
            this.findSortField = 'serial_no';
            this.findSortDesc = false;
            this.filterFindTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const q = (document.getElementById('sr_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('sr_find_field')?.value || 'serial_no';
        
        let filtered = this.findData;
        if (q) {
            filtered = this.findData.filter(inv => {
                const val = (inv[field]?.toString() || '').toLowerCase();
                return val.includes(q);
            });
        }
        this.sortFindGrid(this.findSortField, filtered);
    },

    sortFindGrid: function(field, dataToRender = null) {
        if (field && this.findSortField === field && dataToRender === null) {
            this.findSortDesc = !this.findSortDesc;
        } else if (field) {
            this.findSortField = field;
            if (dataToRender === null) {
                this.findSortDesc = (field === 'serial_no') ? false : true; 
            }
        }
        
        let data = dataToRender || this.findData.filter(inv => {
            const q = (document.getElementById('sr_find_search')?.value || '').toLowerCase();
            if(!q) return true;
            const filterField = document.getElementById('sr_find_field')?.value || 'serial_no';
            return (inv[filterField]?.toString() || '').toLowerCase().includes(q);
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
        const tbody = document.getElementById('sr_find_table_body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px;">No records found</td></tr>';
            this.findSelectedIndex = -1;
            this.updateFindFooter(null);
            return;
        }
        
        data.forEach((inv, index) => {
            const tr = document.createElement('tr');
            const isPostedMark = (inv.is_posted == 1) ? '✓' : '';
            let statusText = 'Draft';
            if (inv.is_cancelled == 1) statusText = 'Cancelled';
            else if (inv.is_posted == 1) statusText = 'Posted';

            tr.innerHTML = `
                <td class="row-indicator" style="padding: 2px 4px; border: 1px solid #d0d0d0; border-left: none; text-align: center; color: white;"></td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.serial_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.invoice_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.is_tax_invoice == 1 ? 'Tax' : 'Non-Tax'}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.delivery_challan_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.delivery_challan_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.customer_order_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.customer_order_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.cust_name || 'N/A'}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.payment_terms || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0; text-align: right;">${parseFloat(inv.net_total || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0; text-align: center;">${isPostedMark}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${statusText}</td>
            `;
            
            tr.style.cursor = 'pointer';
            tr.dataset.sn = inv.serial_no;
            tr.dataset.tax = inv.is_tax_invoice;
            
            tr.onmouseenter = () => { if (tr.dataset.selected !== 'true') tr.style.backgroundColor = '#e0f0ff'; };
            tr.onmouseleave = () => { if (tr.dataset.selected !== 'true') tr.style.backgroundColor = 'transparent'; };
            
            tr.onclick = () => this.selectFindRow(index, tr, inv);
            tr.ondblclick = () => {
                this.closeFindModal();
                document.getElementById('sr_is_tax').checked = (inv.is_tax_invoice == 1);
                document.getElementById('sr_sn').value = inv.serial_no;
                this.navigate('this');
            };
            
            tbody.appendChild(tr);
        });

        // Current rendered data should be accessible for keyboard navigation
        this.currentRenderedFindData = data;

        if (data.length > 0) {
            this.selectFindRow(0, tbody.firstChild, data[0]);
        }
    },

    selectFindRow: function(index, tr, inv) {
        this.findSelectedIndex = index;
        const tbody = document.getElementById('sr_find_table_body');
        if (!tbody) return;
        
        Array.from(tbody.children).forEach(row => {
            row.style.backgroundColor = 'transparent';
            row.style.color = 'black';
            row.dataset.selected = 'false';
            const ind = row.querySelector('.row-indicator');
            if (ind) {
                ind.innerHTML = '';
                ind.style.color = 'white';
            }
        });
        
        if (tr) {
            tr.style.backgroundColor = '#000000';
            tr.style.color = 'white';
            tr.dataset.selected = 'true';
            const ind = tr.querySelector('.row-indicator');
            if (ind) {
                ind.innerHTML = '▶';
                ind.style.color = 'white';
            }
            tr.scrollIntoView({ block: 'nearest' });
        }
        
        this.updateFindFooter(inv);
    },

    updateFindFooter: function(inv) {
        if (inv && inv.created_at) {
            const d = new Date(inv.created_at);
            const dStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US');
            document.getElementById('sr_find_added_on').value = dStr;
            document.getElementById('sr_find_edited_on').value = dStr;
        } else {
            document.getElementById('sr_find_added_on').value = '';
            document.getElementById('sr_find_edited_on').value = '';
        }
    },

    handleFindKeyDown: function(e) {
        if (document.getElementById('sr_find_modal').style.display !== 'flex') return;
        
        const tbody = document.getElementById('sr_find_table_body');
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0 || !this.currentRenderedFindData) return;

        let idx = this.findSelectedIndex;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            idx = (idx + 1) % rows.length;
            this.selectFindRow(idx, rows[idx], this.currentRenderedFindData[idx]);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            idx = (idx - 1 + rows.length) % rows.length;
            this.selectFindRow(idx, rows[idx], this.currentRenderedFindData[idx]);
        } else if (e.key === 'Enter') {
            if (document.activeElement === document.getElementById('sr_find_search')) {
                // Let the input handle it or filter
            } else if (idx >= 0 && idx < this.currentRenderedFindData.length) {
                e.preventDefault();
                const inv = this.currentRenderedFindData[idx];
                this.closeFindModal();
                document.getElementById('sr_is_tax').checked = (inv.is_tax_invoice == 1);
                document.getElementById('sr_sn').value = inv.serial_no;
                this.navigate('this');
            }
        } else if (e.key === 'Escape') {
            this.closeFindModal();
        }
    }
};

// Global entry point for ERP modular popup system
window.initSaleInvoiceModule = function() {
    console.log("SI Module: Global Init called");
    if (window.SRModule) window.SRModule.init();
};

