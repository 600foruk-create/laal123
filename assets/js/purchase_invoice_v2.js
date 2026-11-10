window.PIModule = {
    vendors: [],
    inventory: [],
    currentMatches: [],
    employees: [],
    jobs: [],
    locations: [],
    currentId: null,
    suggestIndex: -1,

    init: async function() {
        console.log("PI Module: Initializing...");
        
        const container = document.getElementById('purchaseInvoiceContainer');
        if (!container) {
            console.warn("PI Module: purchaseInvoiceContainer not in DOM yet, retrying in 50ms...");
            setTimeout(() => this.init(), 50);
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const r = await fetch(`api/settings.php?action=get_setting&key=default_purchase_invoice&company_id=${companyId}`);
            const data = await r.json();
            const isTaxEl = document.getElementById('pi_is_tax');
            if (isTaxEl) {
                isTaxEl.checked = (data.value === 'tax');
            }
        } catch(e) {}

        // 1. Reset form immediately to show grid lines
        this.resetForm(true);
        
        // 2. Load data in background to prevent hanging
        try {
            await Promise.all([
                this.loadVendors(),
                this.loadInventory(),
                this.loadEmployees(),
                this.loadJobs(),
                this.loadLocations()
            ]);
            console.log("PI Module: Data loaded successfully.");
        } catch (err) {
            console.error("PI Module: Error loading background data:", err);
        }
        
        this.setupKeyboardShortcuts();
        this.setupVendorSearch();
        this.setupExpenseSearch();


        const cancelCb = document.getElementById('pi_is_cancelled');
        if (cancelCb) cancelCb.addEventListener('change', () => this.toggleCancelledStamp());
        
        const footerInputs = ['pi_add_disc', 'pi_freight', 'pi_paid'];
        footerInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.calculateTotals());
        });
        
        const postBtn = document.getElementById('pi_post_btn');
        if (postBtn) postBtn.addEventListener('click', () => this.togglePost());
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#pi_emp_wrapper')) {
                const ed = document.getElementById('pi_emp_dropdown');
                if (ed) ed.style.display = 'none';
            }
            if (!e.target.closest('#pi_job_wrapper')) {
                const jd = document.getElementById('pi_job_dropdown');
                if (jd) jd.style.display = 'none';
            }
            if (!e.target.closest('#pi_location_wrapper')) {
                const ld = document.getElementById('pi_location_dropdown');
                if (ld) ld.style.display = 'none';
            }
            // Deselect grid row if clicking outside
            if (!e.target.closest('tr.selected-row') && !e.target.closest('.row-selector')) {
                document.querySelectorAll('#piGridBody tr').forEach((r, idx) => {
                    r.classList.remove('selected-row');
                    if (r.firstElementChild) r.firstElementChild.innerHTML = idx + 1;
                });
            }
        });
    },

    toggleCancelledStamp: function() {
        const checkbox = document.getElementById('pi_is_cancelled');
        const stamp = document.getElementById('pi_cancelled_stamp');
        if (checkbox && stamp) {
            stamp.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    loadVendors: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            let res = await fetch(`api/maintain.php?action=get_vendors&sub_id=VND&company_id=${companyId}`);
            this.vendors = await res.json();
            if (!this.vendors || this.vendors.length === 0) {
                res = await fetch(`api/maintain.php?action=get_vendors&sub_id=SUP&company_id=${companyId}`);
                this.vendors = await res.json();
            }
            if (!this.vendors || this.vendors.length === 0) {
                res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
                const backup = await res.json();
                if (backup) this.vendors = backup;
            }
        } catch (e) { console.error("PI Module: Load Vendors Error:", e); }
    },

    loadInventory: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        // Fast-path: Borrow directly from SaleOrderModule, SIModule, POModule or allInventoryItems
        if (window.SaleOrderModule && Array.isArray(window.SaleOrderModule.inventory) && window.SaleOrderModule.inventory.length > 0) {
            this.inventory = window.SaleOrderModule.inventory;
        } else if (window.SIModule && Array.isArray(window.SIModule.inventory) && window.SIModule.inventory.length > 0) {
            this.inventory = window.SIModule.inventory;
        } else if (window.POModule && Array.isArray(window.POModule.inventory) && window.POModule.inventory.length > 0) {
            this.inventory = window.POModule.inventory;
        } else if (window.allInventoryItems && Array.isArray(window.allInventoryItems) && window.allInventoryItems.length > 0) {
            this.inventory = window.allInventoryItems;
        }

        // 1. Try sale_order.php get_all_items
        try {
            const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    this.inventory = data;
                }
            }
        } catch (e) { console.error("PI Module: Load Inventory Error:", e); }

        // 1b. Fallback or Catalog Enrichment from digital_invoice metadata
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
                        purchase_price: parseFloat(i.purchase_price || i.cost_price || i.rate || i.selling_price || 0),
                        cost_price: parseFloat(i.purchase_price || i.cost_price || i.rate || i.selling_price || 0),
                        rate: parseFloat(i.purchase_price || i.cost_price || i.rate || i.selling_price || 0),
                        qty_per_piece: parseFloat(i.qty_per_piece || 0),
                        tax_rate: parseFloat(i.tax_rate || 0),
                        category_name: i.category_type || 'Inventory',
                        item_type: 'inventory'
                    }));
                }
            }
        } catch (errFallback) {}

        // 2. Fallback to inventory.php get_all_items_lookup
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

        // 3. Fallback to inventory.php get_all_items
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
                rate: parseFloat(i.purchase_price || i.cost_price || i.cost || i.rate || i.sales_price || i.selling_price || 0),
                qty_per_piece: parseFloat(i.qty_per_piece || 0),
                tax_rate: parseFloat(i.tax_rate || 0),
                item_type: i.item_type || 'inventory'
            }));
            window.allInventoryItems = this.inventory;
        }
        console.log("PI Module: Inventory loaded count:", (this.inventory || []).length);
        return this.inventory;
    },

    loadEmployees: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            this.employees = await res.json();
            const select = document.getElementById('pi_emp_dropdown');
            if (select) {
                select.innerHTML = `<div class="po-suggest-item" onclick="document.getElementById('pi_emp_ref').value=''; document.getElementById('pi_emp_text').innerText='Select Employee'; this.parentElement.style.display='none';">Select Employee</div>`;
                this.employees.forEach(e => {
                    if (!e.name || !e.name.trim()) return;
                    const cleanName = e.name.trim();
                    const safeName = cleanName.replace(/'/g, "\\'");
                    select.innerHTML += `<div class="po-suggest-item" onclick="document.getElementById('pi_emp_ref').value='${e.id}'; document.getElementById('pi_emp_text').innerText='${safeName}'; this.parentElement.style.display='none';">${cleanName}</div>`;
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
            const select = document.getElementById('pi_job_dropdown');
            if (select) {
                select.innerHTML = `<div class="po-suggest-item" onclick="document.getElementById('pi_job_desc').value=''; document.getElementById('pi_job_text').innerText='Select Job'; this.parentElement.style.display='none';">Select Job</div>`;
                this.jobs.forEach(j => {
                    if (!j.job_no && !j.description) return;
                    const jobDesc = `${j.job_no || ''} - ${j.description || ''}`.trim();
                    const safeDesc = jobDesc.replace(/'/g, "\\'");
                    select.innerHTML += `<div class="po-suggest-item" onclick="document.getElementById('pi_job_desc').value='${j.id}'; document.getElementById('pi_job_text').innerText='${safeDesc}'; this.parentElement.style.display='none';">${jobDesc}</div>`;
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
            const el = document.getElementById('pi_location_dropdown');
            if (el) {
                el.innerHTML = `<div class="po-suggest-item" onclick="document.getElementById('pi_location').value=''; document.getElementById('pi_location_text').innerText='Select Location'; this.parentElement.style.display='none';">Select Location</div>`;
                this.locations.forEach(l => {
                    const safeName = (l.name || '').replace(/'/g, "\\'");
                    el.innerHTML += `<div class="po-suggest-item" onclick="document.getElementById('pi_location').value='${l.id}'; document.getElementById('pi_location_text').innerText='${safeName}'; this.parentElement.style.display='none';">${l.name}</div>`;
                });
            }
        } catch (e) {}
    },

    setupKeyboardShortcuts: function() {
        const gridBody = document.getElementById('piGridBody');
        if (gridBody) {
            gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            gridBody.addEventListener('click', (e) => {
                const selector = e.target.closest('.row-selector');
                if (selector) {
                    const tr = selector.closest('tr');
                    
                    document.querySelectorAll('#piGridBody tr').forEach((r) => {
                        r.classList.remove('selected-row');
                        r.firstElementChild.innerHTML = '';
                    });

                    tr.classList.add('selected-row');
                    selector.innerHTML = '▶';
                }
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveInvoice();
            } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const selectedRow = document.querySelector('#piGridBody tr.selected-row');
                if (selectedRow) {
                    selectedRow.remove();
                    this.reindexRows();
                    this.calculateTotals();
                }
            }
            
            const activeIds = ['pi_location_display', 'pi_job_display', 'pi_emp_display'];
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
        document.querySelectorAll('#piGridBody tr').forEach((tr, idx) => {
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
        const gridBody = document.getElementById('piGridBody');
        const suggest = tr ? (tr._suggestBox || tr.querySelector('.grid-suggest') || document.querySelector(`.grid-suggest[data-tr-index="${tr.dataset.index}"]`)) : null;

        // If suggestion box is open on item-code-search, stop grid navigation so it doesn't jump rows or close
        if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
            return;
        }
        // Grid Navigation
        const getVisibleRowInputs = (row) => Array.from(row.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0 && !i.classList.contains('stax-amt') && !i.classList.contains('ftax-amt'));
        const getAllVisibleInputs = () => Array.from(gridBody.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0 && !i.classList.contains('stax-amt') && !i.classList.contains('ftax-amt'));
        const rowInputs = getVisibleRowInputs(tr);
        const colIdx = rowInputs.indexOf(target);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; this.hideItemDetailsPanel(tr); }
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextRowInputs = getVisibleRowInputs(nextTr);
                if (nextRowInputs[colIdx]) nextRowInputs[colIdx].focus();
            } else {
                this.addEmptyRow();
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
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; this.hideItemDetailsPanel(tr); }
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevRowInputs = getVisibleRowInputs(prevTr);
                if (prevRowInputs[colIdx]) prevRowInputs[colIdx].focus();
            }
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
            if (e.key === 'Enter' || (e.key === 'ArrowRight' && isFullySelected)) {
                e.preventDefault();
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; this.hideItemDetailsPanel(tr); }
                if (e.key === 'Enter' && target.classList.contains('pieces')) {
                    const rateInput = tr.querySelector('.rate');
                    if (rateInput && rateInput.offsetWidth > 0) {
                        rateInput.focus();
                        rateInput.select();
                        return;
                    }
                }

                const allInputs = getAllVisibleInputs();
                let index = allInputs.indexOf(target);
                if (index === -1) {
                    const allDom = Array.from(gridBody.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                    const domIdx = allDom.indexOf(target);
                    const nextInput = allDom.slice(domIdx + 1).find(i => !i.classList.contains('stax-amt') && !i.classList.contains('ftax-amt'));
                    if (nextInput) {
                        nextInput.focus();
                        nextInput.select();
                        return;
                    }
                    index = allInputs.length - 1;
                }

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
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; this.hideItemDetailsPanel(tr); }
                if (e.key === 'Enter' && target.classList.contains('pieces')) {
                    const rateInput = tr.querySelector('.rate');
                    if (rateInput && rateInput.offsetWidth > 0) {
                        rateInput.focus();
                        rateInput.select();
                        return;
                    }
                }

                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index > 0) allInputs[index - 1].focus();
            }
        }
    },
    setupVendorSearch: function() {
        const input = document.getElementById('pi_vendor_code');
        const suggest = document.getElementById('pi_vendor_suggest');
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
                suggest.innerHTML = matches.map(v => 
                    `<div onclick="window.PIModule.selectVendor(${v.id})">
                        <b>${v.code}</b> &nbsp; ${v.name}
                    </div>`
                ).join('');
                suggest.style.display = 'block';
                suggest.style.zIndex = '9999';
            } else { suggest.style.display = 'none'; }
        };
        document.addEventListener('click', (e) => { if (e.target !== input) suggest.style.display = 'none'; });
    },

    selectVendor: async function(coaId) {
        const v = this.vendors.find(x => x.id == coaId || x.coa_list_id == coaId);
        if (v) {
            document.getElementById('pi_vendor_code').value = v.code;
            document.getElementById('pi_vendor_code').dataset.coaId = v.id;
            document.getElementById('pi_vendor_name').value = v.name;
            document.getElementById('pi_vendor_address').value = v.address || '';
            document.getElementById('pi_vendor_tel').value = v.telephone || '';
            document.getElementById('pi_vendor_gst').value = v.st_reg_no || '';
            document.getElementById('pi_vendor_ntn').value = v.ntn_cnic || '';
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const targetCoaId = coaId;
                if (targetCoaId) {
                    const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${targetCoaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                    const bal = await res.json();
                    const balEl = document.getElementById('pi_vendor_balance');
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
                } else {
                    const balEl = document.getElementById('pi_vendor_balance');
                    if (balEl) { balEl.value = '0.00'; balEl.style.color = '#000'; }
                }
            } catch(e) {
                console.error("Balance fetch error:", e);
                const balEl = document.getElementById('pi_vendor_balance');
                if (balEl) { balEl.value = '0.00'; balEl.style.color = '#000'; }
            }
        }
        document.getElementById('pi_vendor_suggest').style.display = 'none';
    },

    setupExpenseSearch: function() {
        const input = document.getElementById('expense_name');
        const suggest = document.getElementById('expense_suggest');
        if (!input || !suggest) return;

        input.oninput = async (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (val.length < 2) { suggest.style.display = 'none'; return; }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const res = await fetch(`api/admin.php?action=get_coa_list&company_id=${session.company_id || 1}`);
            const coa = await res.json();
            
            const matches = coa.filter(c => 
                (c.account_type === 'Expense' || c.account_type === 'Cost of Sales') &&
                (c.account_code.includes(val) || (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.account_name.toLowerCase(), val.toLowerCase()) : c.account_name.toLowerCase().includes(val.toLowerCase())))
            ).slice(0, 10);

            if (matches.length > 0) {
                suggest.innerHTML = matches.map(c => 
                    `<div onclick="window.PIModule.selectExpense('${c.account_code}', '${c.account_name}')" style="padding:5px; cursor:pointer; border-bottom:1px solid #eee;">
                        <b>${c.account_code}</b> - ${c.account_name}
                    </div>`
                ).join('');
                suggest.style.display = 'block';
            } else { suggest.style.display = 'none'; }
        };
        document.addEventListener('click', (e) => { if (e.target !== input) suggest.style.display = 'none'; });
    },

    selectExpense: function(code, name) {
        document.getElementById('expense_code').value = code;
        document.getElementById('expense_name').value = name;
        document.getElementById('expense_suggest').style.display = 'none';
    },

    updateSuggestHighlight: function(items, tr) {
        items.forEach((item, idx) => {
            if (idx === this.suggestIndex) {
                item.classList.add('active');
                item.style.backgroundColor = 'var(--theme-primary, #1F4E79)';
                item.style.color = 'white';
                item.querySelectorAll('*').forEach(el => el.style.color = 'white');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
                item.style.backgroundColor = '';
                item.style.color = '';
                item.querySelectorAll('*').forEach(el => el.style.color = '');
            }
        });
    },

    showItemDetailsPanel: async function(tr, item) {
        let panel = tr.querySelector('.item-details-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'item-details-panel';
            panel.innerHTML = `
                <div class="item-details-panel-header">
                    <span>Purchase Price Rs.: <span class="price-val">...</span></span>
                    <span class="highlight">Balance: <span class="bal-val">...</span></span>
                </div>
                <div class="item-details-panel-info">
                    Category: <span class="cat-val">...</span><br>
                    Description: <span class="desc-val">...</span>
                </div>
                <div class="item-details-panel-history">
                    <h5>History: All Parties</h5>
                    <table class="item-details-panel-table">
                        <thead>
                            <tr>
                                <th>Bill No.</th>
                                <th>Date</th>
                                <th>Vendor</th>
                                <th>Quantity</th>
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody class="history-tbody">
                            <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            tr.querySelector('td:nth-child(2)').appendChild(panel);
        }
        
        panel.dataset.currentItemId = item.id;
        const suggest = tr.querySelector('.grid-suggest');
        const codeInput = tr.querySelector('.item-code-search');
        if (typeof window.positionGridDropdown === 'function') {
            window.positionGridDropdown(suggest, codeInput, panel);
        } else {
            panel.style.display = 'block';
        }
        
        panel.querySelector('.price-val').innerText = '...';
        panel.querySelector('.bal-val').innerText = '...';
        panel.querySelector('.cat-val').innerText = '...';
        panel.querySelector('.desc-val').innerText = '...';
        panel.querySelector('.history-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/purchases.php?action=get_item_details_for_invoice&item_id=${item.id}&company_id=${session.company_id || 1}`);
            const rawText = await res.text();
            let result;
            try {
                result = JSON.parse(rawText);
            } catch (e) {
                throw new Error("Invalid JSON. Raw Response: " + rawText.substring(0, 100));
            }
            
            // Ensure we are still showing data for the same item that was fetched
            if (result.status === 'success' && panel.style.display === 'block' && panel.dataset.currentItemId == item.id) {
                const data = result.data;
                panel.querySelector('.price-val').innerText = parseFloat(data.purchase_price).toFixed(2);
                panel.querySelector('.bal-val').innerText = parseFloat(data.balance).toFixed(2) + ' ' + (data.unit || '');
                panel.querySelector('.cat-val').innerText = data.category || '-';
                panel.querySelector('.desc-val').innerText = data.description || '-';
                
                if (data.history && data.history.length > 0) {
                    panel.querySelector('.history-tbody').innerHTML = data.history.map(h => `
                        <tr>
                            <td>${h.bill_no || '-'}</td>
                            <td>${h.date ? h.date.split(' ')[0] : '-'}</td>
                            <td>${h.vendor_name || '-'}</td>
                            <td>${h.quantity || 0}</td>
                            <td>${h.rate || 0}</td>
                            <td>${h.amount || 0}</td>
                        </tr>
                    `).join('');
                } else {
                    panel.querySelector('.history-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">No history found</td></tr>';
                }
            } else if (result.status === 'error' && panel.style.display === 'block' && panel.dataset.currentItemId == item.id) {
                panel.querySelector('.history-tbody').innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error: ${result.message}</td></tr>`;
            }
        } catch (e) {
            panel.querySelector('.history-tbody').innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error: ${e.message}</td></tr>`;
            console.error(e);
        }
    },

    hideItemDetailsPanel: function(tr) {
        const panel = tr.querySelector('.item-details-panel');
        if (panel) panel.style.display = 'none';
    },

    addEmptyRow: function(data = {}) {
        const tbody = document.getElementById('piGridBody');
        if (!tbody) return;
        const rowIndex = tbody.children.length;
        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        
        tr.innerHTML = `
            <td class="row-selector" style="text-align: center; border: 1px solid #cbd5e0; font-size: 10px; color: #64748b;">${rowIndex + 1}</td>
            <td style="border: 1px solid #cbd5e0; position: relative;">
                <input type="text" class="grid-input item-code-search" placeholder="" autocomplete="off">
                <div class="grid-suggest"></div>
            </td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-description"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num pieces"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num qty"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-unit"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num rate"></td>
            
            <td class="pi-tax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-excl" readonly></td>
            <td class="pi-tax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num stax-rate"></td>
            <td class="pi-tax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num stax-amt"></td>
            <td class="pi-tax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num ftax-rate"></td>
            <td class="pi-tax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num ftax-amt"></td>
            <td class="pi-tax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-incl" readonly></td>
            
            <td class="pi-nontax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num gross-amt" readonly></td>
            <td class="pi-nontax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num disc-perc"></td>
            <td class="pi-nontax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num disc-amt"></td>
            <td class="pi-nontax-col" style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num net-amt" readonly></td>
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
            
            tr.querySelector('.gross-amt').value = data.gross_amount || data.value_excl_tax || '';
            tr.querySelector('.disc-perc').value = data.discount_percent || data.discount_perc || '';
            tr.querySelector('.disc-amt').value = data.discount_amount || data.discount_amt || '';
            tr.querySelector('.net-amt').value = data.net_amount || data.value_excl_tax || '';
            
            // Trigger calculation to ensure consistency
            this.calculateRow(tr);
        }
        
        tbody.appendChild(tr);
        this.setupGridEvents(tr);
        this.toggleTaxMode(false);
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
                    window.renderGlobalItemSuggestHTML(matches, { isPurchase: true, rateLabel: 'Purchase Rate' }) :
                    matches.map((i, mIdx) => `
                    <div class="suggest-item" data-idx="${mIdx}">
                        <span><b>${i.item_code || i.code}</b> &nbsp; ${i.item_name || i.name || i.description || ''}</span>
                        <span style="color:#15803d; font-weight:700; font-size:11px; float:right;">Rs. ${parseFloat(i.purchase_price || i.cost_price || i.rate || i.sales_price || 0).toFixed(2)}</span>
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

            const tbody = document.getElementById('piGridBody');
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

        // Keyboard navigation for dropdown
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
            // Auto-select text on focus to allow easy overwriting
            input.addEventListener('focus', () => {
                input.select();
            });
            input.addEventListener('click', () => {
                input.select();
            });

            input.addEventListener('blur', () => {
                if (input.classList.contains('num')) {
                    const code = tr.querySelector('.item-code-search') ? tr.querySelector('.item-code-search').value.trim() : '';
                    if (input.value.trim() === '') {
                        if (code !== '') {
                            input.value = '0.00';
                        }
                    } else if (input.classList.contains('disc-amt') || input.classList.contains('disc-perc')) {
                        input.value = (parseFloat(input.value) || 0).toFixed(2);
                    }
                }
            });

            if (input.classList.contains('num')) {
                input.oninput = () => this.calculateRow(tr);
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
            (document.querySelector(`#piGridBody > tr[data-index="${trOrIndex}"]`) || document.querySelector(`#piGridBody tr[data-index="${trOrIndex}"]`));
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
            tr.dataset.itemType = item.item_type || 'inventory';
            tr.dataset.qtyPerPiece = item.qty_per_piece || 0;
            
            const codeInput = tr.querySelector('.item-code-search');
            if (codeInput) codeInput.value = item.item_code || item.code || '';
            
            const descInput = tr.querySelector('.si-description');
            if (descInput) descInput.value = item.item_name || item.name || item.description || '';
            
            const unitInput = tr.querySelector('.si-unit');
            if (unitInput) unitInput.value = item.unit || 'Pcs';
            
            const rateInput = tr.querySelector('.rate');
            const purRate = parseFloat(item.purchase_price || item.cost_price || item.cost || item.rate || item.sales_price || item.selling_price || 0);
            if (rateInput) rateInput.value = purRate > 0 ? purRate.toFixed(2) : '0.00';
            
            const staxRateInput = tr.querySelector('.stax-rate');
            if (staxRateInput) staxRateInput.value = parseFloat(item.tax_rate || 0).toFixed(2);
            
            this.calculateRow(tr);
            
            // Move focus to Pieces
            const piecesInput = tr.querySelector('.pieces');
            if (piecesInput) {
                piecesInput.focus();
                piecesInput.select();
            }
        }

        const suggest = tr._suggestBox || document.querySelector(`.grid-suggest[data-tr-index="${rowIndex}"]`);
        if (suggest) suggest.style.display = 'none';
        document.querySelectorAll('.grid-suggest').forEach(el => el.style.display = 'none');
        this.suggestIndex = -1;
    },

    calculateRow: function(tr) {
        const qtyPerPiece = parseFloat(tr.dataset.qtyPerPiece) || 0;
        const pieces = parseFloat(tr.querySelector('.pieces').value) || 0;
        
        if (pieces > 0 && qtyPerPiece > 0) {
            if (!document.activeElement || document.activeElement.classList.contains('pieces') || document.activeElement.classList.contains('item-code-search')) {
                tr.querySelector('.qty').value = (pieces * qtyPerPiece).toFixed(2);
            }
        }

        const qty = parseFloat(tr.querySelector('.qty').value) || 0;
        const rate = parseFloat(tr.querySelector('.rate').value) || 0;
        const isTax = document.getElementById('pi_is_tax').checked;
        const gross = qty * rate;
        
        tr.querySelector('.val-excl').value = gross.toFixed(2);
        tr.querySelector('.gross-amt').value = gross.toFixed(2);
        
        if (isTax) {
            const stRate = parseFloat(tr.querySelector('.stax-rate').value) || 0;
            const ftRate = parseFloat(tr.querySelector('.ftax-rate').value) || 0;

            let stAmt = parseFloat(tr.querySelector('.stax-amt').value) || 0;
            let ftAmt = parseFloat(tr.querySelector('.ftax-amt').value) || 0;

            const ae = document.activeElement;
            const isRecalcNeeded = ae && (
                ae.classList.contains('pieces') || ae.classList.contains('qty') || 
                ae.classList.contains('rate') || ae.classList.contains('stax-rate') || 
                ae.classList.contains('ftax-rate') || ae.classList.contains('item-code-search')
            );

            if (!tr.querySelector('.stax-amt').value || isRecalcNeeded) {
                stAmt = (gross * stRate) / 100;
                tr.querySelector('.stax-amt').value = stAmt.toFixed(2);
            }
            if (!tr.querySelector('.ftax-amt').value || isRecalcNeeded) {
                ftAmt = (gross * ftRate) / 100;
                tr.querySelector('.ftax-amt').value = ftAmt.toFixed(2);
            }

            const net = gross + stAmt + ftAmt;
            tr.querySelector('.val-incl').value = net.toFixed(2);
            tr.querySelector('.net-amt').value = net.toFixed(2);
        } else {
            const discPercInput = tr.querySelector('.disc-perc');
            const discAmtInput = tr.querySelector('.disc-amt');
            const netAmtInput = tr.querySelector('.net-amt');
            const valInclInput = tr.querySelector('.val-incl');

            const ae = document.activeElement;
            const isDiscAmtActive = ae && (ae === discAmtInput || ae.classList.contains('disc-amt'));
            const isDiscPercActive = ae && (ae === discPercInput || ae.classList.contains('disc-perc'));

            let discAmt = 0;
            let discPerc = 0;

            if (isDiscAmtActive) {
                discAmt = parseFloat(discAmtInput ? discAmtInput.value : 0) || 0;
                discPerc = gross > 0 ? (discAmt / gross) * 100 : 0;
                if (discPercInput) {
                    discPercInput.value = (gross > 0 && discAmt > 0) ? discPerc.toFixed(2) : '0.00';
                }
            } else if (isDiscPercActive) {
                discPerc = parseFloat(discPercInput ? discPercInput.value : 0) || 0;
                discAmt = (gross * discPerc) / 100;
                if (discAmtInput) {
                    discAmtInput.value = discAmt.toFixed(2);
                }
            } else {
                const currentDiscPerc = parseFloat(discPercInput ? discPercInput.value : 0) || 0;
                const currentDiscAmt = parseFloat(discAmtInput ? discAmtInput.value : 0) || 0;

                if (currentDiscPerc > 0) {
                    discPerc = currentDiscPerc;
                    discAmt = (gross * discPerc) / 100;
                    if (discAmtInput) discAmtInput.value = discAmt.toFixed(2);
                } else if (currentDiscAmt > 0) {
                    discAmt = currentDiscAmt;
                    discPerc = gross > 0 ? (discAmt / gross) * 100 : 0;
                    if (discPercInput) discPercInput.value = (gross > 0 && discAmt > 0) ? discPerc.toFixed(2) : '0.00';
                    if (discAmtInput) discAmtInput.value = discAmt.toFixed(2);
                } else {
                    discAmt = 0;
                    discPerc = 0;
                    if (discAmtInput && discAmtInput.value !== '') discAmtInput.value = '0.00';
                    if (discPercInput && discPercInput.value !== '') discPercInput.value = '0.00';
                }
            }

            const net = gross - discAmt;
            if (netAmtInput) netAmtInput.value = net.toFixed(2);
            if (valInclInput) valInclInput.value = net.toFixed(2);
        }
        this.calculateTotals();
    },

    calculateTotals: function() {
        let tPcs = 0, tQty = 0, tGross = 0, tStax = 0, tFtax = 0, tDisc = 0, tNet = 0;
        const isTaxEl = document.getElementById('pi_is_tax');
        const isTax = isTaxEl ? isTaxEl.checked : false;
        
        const rows = document.querySelectorAll('#piGridBody tr');
        rows.forEach(tr => {
            tPcs += parseFloat(tr.querySelector('.pieces')?.value) || 0;
            tQty += parseFloat(tr.querySelector('.qty')?.value) || 0;
            
            if (isTax) {
                tGross += parseFloat(tr.querySelector('.val-excl')?.value) || 0;
                tStax += parseFloat(tr.querySelector('.stax-amt')?.value) || 0;
                tFtax += parseFloat(tr.querySelector('.ftax-amt')?.value) || 0;
                tNet += parseFloat(tr.querySelector('.val-incl')?.value) || 0;
            } else {
                tGross += parseFloat(tr.querySelector('.gross-amt')?.value) || 0;
                tDisc += parseFloat(tr.querySelector('.disc-amt')?.value) || 0;
                tNet += parseFloat(tr.querySelector('.net-amt')?.value) || 0;
            }
        });

        if(document.getElementById('pi_tot_pieces')) document.getElementById('pi_tot_pieces').value = tPcs.toFixed(2);
        if(document.getElementById('pi_tot_qty')) document.getElementById('pi_tot_qty').value = tQty.toFixed(2);
        if(document.getElementById('pi_tot_excl')) document.getElementById('pi_tot_excl').value = tGross.toFixed(2);
        if(document.getElementById('pi_tot_stax')) document.getElementById('pi_tot_stax').value = tStax.toFixed(2);
        if(document.getElementById('pi_tot_ftax')) document.getElementById('pi_tot_ftax').value = tFtax.toFixed(2);
        if(document.getElementById('pi_tot_incl')) document.getElementById('pi_tot_incl').value = tNet.toFixed(2);
        if(document.getElementById('pi_tot_gross')) document.getElementById('pi_tot_gross').value = tGross.toFixed(2);
        if(document.getElementById('pi_tot_disc')) document.getElementById('pi_tot_disc').value = tDisc.toFixed(2);
        if(document.getElementById('pi_tot_net')) document.getElementById('pi_tot_net').value = tNet.toFixed(2);
        
        const addDisc = parseFloat(document.getElementById('pi_add_disc')?.value) || 0;
        const freight = parseFloat(document.getElementById('pi_freight')?.value) || 0;
        const paid = parseFloat(document.getElementById('pi_paid')?.value) || 0;
        const grossTotalVal = isTax ? tGross : (tNet - addDisc);
        if(document.getElementById('pi_gross_tot')) document.getElementById('pi_gross_tot').value = grossTotalVal.toFixed(2);
        
        let finalNet = isTax ? (tNet + freight) : (grossTotalVal + freight);
        
        if(document.getElementById('pi_net_tot')) document.getElementById('pi_net_tot').value = finalNet.toFixed(2);
        if(document.getElementById('pi_balance')) document.getElementById('pi_balance').value = (finalNet - paid).toFixed(2);
        
        this.updateAmountInWords(finalNet);
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
        const el = document.getElementById('pi_amt_words');
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

    toggleTaxMode: async function(fetchNextSerial = true) {
        const isTaxEl = document.getElementById('pi_is_tax');
        if (!isTaxEl) return;
        const isTax = isTaxEl.checked;
        const taxCols = document.querySelectorAll('.pi-tax-col, .pi-tax-field');
        const nonTaxCols = document.querySelectorAll('.pi-nontax-col');
        
        taxCols.forEach(el => el.style.display = isTax ? '' : 'none');
        nonTaxCols.forEach(el => el.style.display = isTax ? 'none' : '');
        this.calculateTotals();
        
        if (fetchNextSerial) {
            if (this.currentId === null) {
                try {
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const is_tax_val = isTax ? 1 : 0;
                    const res = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${session.company_id || 1}&is_tax=${is_tax_val}`);
                    const data = await res.json();
                    const snEl = document.getElementById('pi_sn');
                    if (snEl) snEl.value = data.next_sn || 1;
                } catch (err) {}
            } else {
                this.navigate('last');
            }
        }
    },

    resetForm: async function(fetchNext = false) {
        this.currentId = null;
        const container = document.getElementById('purchaseInvoiceContainer');
        if (!container) return;
        
        // Preserve context
        const isTaxEl = document.getElementById('pi_is_tax');
        const wasTax = isTaxEl ? isTaxEl.checked : false;
        
        container.querySelectorAll('input:not(#expense_code):not(#expense_name):not(#pi_sn):not(#pi_date), textarea').forEach(el => {
            if(el.type === 'checkbox' && el.id !== 'pi_is_tax') el.checked = false;
            else if(el.type !== 'checkbox') el.value = '';
        });
        
        if (isTaxEl) isTaxEl.checked = wasTax; // Restore is_tax
        this.toggleCancelledStamp();
        
        const dateEl = document.getElementById('pi_date');
        if (dateEl) dateEl.valueAsDate = new Date();
        
        const tbody = document.getElementById('piGridBody');
        if (tbody) {
            tbody.innerHTML = '';
            for(let i=0; i<40; i++) this.addEmptyRow();
        }
        
        if (fetchNext) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const isTax = document.getElementById('pi_is_tax')?.checked ? 1 : 0;
                const res = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${session.company_id || 1}&is_tax=${isTax}`);
                const data = await res.json();
                if (this.currentId !== null) return;
                const snEl = document.getElementById('pi_sn');
                if (snEl) snEl.value = data.next_sn || 1;
            } catch (err) {
                console.error("Error fetching next serial:", err);
            }
        }
        await this.toggleTaxMode(false);
    },

    saveInvoice: async function() {
        const vendorId = document.getElementById('pi_vendor_code').dataset.coaId;
        if (!vendorId) return alert("Please select a valid Vendor!");

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const payload = {
            id: this.currentId,
            serial_no: document.getElementById('pi_sn').value,
            is_tax_invoice: document.getElementById('pi_is_tax').checked,
            invoice_date: document.getElementById('pi_date').value,
            invoice_type: document.getElementById('pi_type').value,
            vendor_invoice_no: document.getElementById('pi_v_invoice_no').value,
            vendor_invoice_date: document.getElementById('pi_v_invoice_date').value,
            purchase_order_no: document.getElementById('pi_po_no').value,
            purchase_order_date: document.getElementById('pi_po_date').value,
            payment_terms: document.getElementById('pi_payment_terms').value,
            expense_account: document.getElementById('expense_code').value,
            vendor_coa_id: vendorId,
            vendor_name: document.getElementById('pi_vendor_name')?.value || '',
            vendor_address: document.getElementById('pi_vendor_address').value,
            vendor_telephone: document.getElementById('pi_vendor_tel').value,
            vendor_ntn: document.getElementById('pi_vendor_ntn')?.value || '',
            vendor_gst: document.getElementById('pi_vendor_gst')?.value || '',
            inventory_location_id: document.getElementById('pi_location').value,
            job_no: document.getElementById('pi_job_desc').value,
            employee_ref: document.getElementById('pi_emp_ref').value,
            remarks: document.getElementById('pi_remarks').value,
            amount_in_words: document.getElementById('pi_amt_words').innerText,
            carriage_freight: document.getElementById('pi_freight').value,
            additional_discount: document.getElementById('pi_add_disc').value,
            net_total: document.getElementById('pi_net_tot').value,
            amount_paid: document.getElementById('pi_paid').value,
            is_cancelled: document.getElementById('pi_is_cancelled')?.checked ? 1 : 0,
            items: []
        };

        document.querySelectorAll('#piGridBody tr').forEach(tr => {
            if (!tr.dataset.coaId) return;
            payload.items.push({
                item_coa_id: tr.dataset.coaId,
                description: tr.cells[2].querySelector('input').value,
                pieces: tr.querySelector('.pieces').value,
                quantity: tr.querySelector('.qty').value,
                unit: tr.cells[5].querySelector('input').value,
                rate: tr.querySelector('.rate').value,
                gross_amount: tr.querySelector('.val-excl').value,
                discount_percent: tr.querySelector('.disc-perc').value,
                discount_amount: tr.querySelector('.disc-amt').value,
                sales_tax_rate: tr.querySelector('.stax-rate').value,
                sales_tax_amount: tr.querySelector('.stax-amt').value,
                further_tax_rate: tr.querySelector('.ftax-rate').value,
                further_tax_amount: tr.querySelector('.ftax-amt').value,
                net_amount: tr.querySelector('.val-incl').value
            });
        });

        // if (payload.items.length === 0) return alert("Please add at least one item!");

        try {
            const res = await fetch(`api/purchases.php?action=save_invoice&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') { 
                alert("Saved!"); 
                this.currentId = null; // Important: Clear currentId so the next save is an INSERT
                this.resetForm(true); // Clear form and prepare for next invoice
            } else { alert("Error: " + result.message); }
        } catch (e) { alert("Failed to save."); }
    },

    togglePost: async function() {
        if (!this.currentId) return alert("Please select or save an invoice first.");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const newPostedState = this.isPosted ? 0 : 1;
        const confirmMsg = newPostedState ? "Are you sure you want to Post this invoice?" : "Are you sure you want to Un-Post this invoice? This will remove its ledger impact.";
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`api/purchases.php?action=toggle_post_invoice&company_id=${session.company_id || 1}`, {
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
        let toast = document.getElementById('pi_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pi_toast';
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
        let sn = parseInt(document.getElementById('pi_sn').value) || 0;
        const isTax = document.getElementById('pi_is_tax')?.checked ? 1 : 0;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${companyId}&is_tax=${isTax}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${companyId}&is_tax=${isTax}`);
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

        if (sn < 1 && dir !== 'next' && dir !== 'prev') return; // Silent — already at first

        try {
            let url = `api/purchases.php?action=get_invoice&serial_no=${sn}&company_id=${companyId}&is_tax=${isTax}`;
            if (dir === 'next' || dir === 'prev') {
                url += `&dir=${dir}`;
            }
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
                    document.getElementById('pi_sn').value = sn;
                    document.getElementById('pi_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation error:", e); }
    },

    loadInvoiceData: function(inv) {
        this.currentId = inv.id;
        document.getElementById('pi_sn').value = inv.serial_no;
        
        // Post/Un-post UI
        const postBtn = document.getElementById('pi_post_btn');
        const stamp = document.getElementById('pi_posted_stamp');
        if (postBtn && stamp) {
            this.isPosted = (inv.is_posted == 1);
            if (this.isPosted) {
                postBtn.innerText = "Un-Post";
                postBtn.className = "po-tool-btn po-btn-info";
                stamp.style.display = "block";
            } else {
                postBtn.innerText = "Post";
                postBtn.className = "po-tool-btn po-btn-info";
                stamp.style.display = "none";
            }
        }
        
        document.getElementById('pi_is_tax').checked = inv.is_tax_invoice == 1;
        document.getElementById('pi_date').value = inv.invoice_date || '';
        document.getElementById('pi_type').value = inv.invoice_type || 'Purchase Invoice';
        document.getElementById('pi_v_invoice_no').value = inv.vendor_invoice_no || '';
        document.getElementById('pi_v_invoice_date').value = inv.vendor_invoice_date || '';
        document.getElementById('pi_po_no').value = inv.purchase_order_no || '';
        document.getElementById('pi_po_date').value = inv.purchase_order_date || '';
        document.getElementById('pi_payment_terms').value = inv.payment_terms || '';
        document.getElementById('expense_code').value = inv.expense_account || '';
        document.getElementById('pi_location').value = inv.inventory_location_id || '';
        document.getElementById('pi_job_desc').value = inv.job_no || '';
        document.getElementById('pi_emp_ref').value = inv.employee_ref || '';
        document.getElementById('pi_remarks').value = inv.remarks || '';
        document.getElementById('pi_freight').value = inv.carriage_freight || '0.00';
        document.getElementById('pi_add_disc').value = inv.additional_discount || '0.00';
        document.getElementById('pi_paid').value = inv.amount_paid || '0.00';

        if (inv.vendor_coa_id) {
            this.selectVendor(inv.vendor_coa_id);
            if (inv.vendor) {
                if (inv.vendor.name) document.getElementById('pi_vendor_name').value = inv.vendor.name;
                document.getElementById('pi_vendor_address').value = inv.vendor.address || '';
                document.getElementById('pi_vendor_tel').value = inv.vendor.telephone || '';
                if (inv.vendor.gst_reg_no) document.getElementById('pi_vendor_gst').value = inv.vendor.gst_reg_no;
                if (inv.vendor.ntn) document.getElementById('pi_vendor_ntn').value = inv.vendor.ntn;
            }
        }

        const tbody = document.getElementById('piGridBody');
        tbody.innerHTML = '';
        if (inv.items && inv.items.length > 0) {
            inv.items.forEach(item => this.addEmptyRow(item));
        }
        while(tbody.children.length < 40) this.addEmptyRow();
        this.calculateTotals();
        this.toggleTaxMode(false);

        const isCancelled = parseInt(inv.is_cancelled) === 1;
        const cancelCb = document.getElementById('pi_is_cancelled');
        if (cancelCb) cancelCb.checked = isCancelled;
        this.toggleCancelledStamp();
    },

    deleteInvoice: async function() {
        if (!this.currentId) return alert("No Invoice loaded.");
        if (!confirm("Are you sure?")) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        try {
            const res = await fetch(`api/purchases.php?action=delete_invoice&id=${this.currentId}&company_id=${session.company_id || 1}`, { method: 'POST' });
            const result = await res.json();
            if (result.status === 'success') { alert("Deleted!"); this.resetForm(true); }
        } catch (e) { alert("Failed."); }
    },

    printInvoice: async function(mode = 'print') {
        if (!this.currentId) return alert("Please save or retrieve an invoice first.");

        const isVoucher = (mode === true || mode === 'voucher');
        const isExcel = (mode === 'excel');

        // Open window synchronously to avoid popup blockers!
        let printWindow = null;
        if (!isExcel) {
            printWindow = window.open('', '_blank');
            if(printWindow) printWindow.document.write('<div style="font-family:sans-serif; padding: 20px;">Preparing Print... Please wait.</div>');
        }

        const sn = document.getElementById('pi_sn').value;
        const date = document.getElementById('pi_date').value;
        const vCode = document.getElementById('pi_vendor_code').value;
        const vName = document.getElementById('pi_vendor_name').value;
        const vAddress = document.getElementById('pi_vendor_address').value;
        const vTel = document.getElementById('pi_vendor_tel').value;
        const isTax = document.getElementById('pi_is_tax').checked;
        const type = document.getElementById('pi_type').value;

        const totPieces = document.getElementById('pi_tot_pieces').value;
        const totQty = document.getElementById('pi_tot_qty').value;
        const totNet = document.getElementById('pi_net_tot').value;
        const amtWords = document.getElementById('pi_amt_words').innerText;
        const remarks = document.getElementById('pi_remarks').value;

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
        
        const preparedBy = document.getElementById('pi_find_added_by')?.value || 'Administrator';
        const printedBy = session.username || session.user_name || session.name || 'Administrator';
        
        const invoiceTitle = isVoucher ? "PURCHASE VOUCHER" : (isTax ? "TAX INVOICE" : "PURCHASE INVOICE");

        let itemsHtml = '';
        const validItems = [];
        document.querySelectorAll('#piGridBody tr').forEach((tr) => {
            const code = tr.querySelector('.item-code-search').value;
            if (!code) return;
            validItems.push(tr);
        });

        let sumGross = 0;
        let sumDisc = 0;
        let sumNet = 0;
        let sumStax = 0;

        validItems.forEach((tr, i) => {
            const code = tr.querySelector('.item-code-search').value;
            const desc = tr.cells[2].querySelector('input').value;
            const pieces = parseFloat(tr.querySelector('.pieces').value || 0).toFixed(2);
            const qty = parseFloat(tr.querySelector('.qty').value || 0).toFixed(2);
            const unit = tr.cells[5].querySelector('input').value;
            const rate = parseFloat(tr.querySelector('.rate').value || 0).toFixed(2);
            
            let amountHtml = '';
            if (isTax) {
                const excl = parseFloat(tr.querySelector('.val-excl').value || 0).toFixed(2);
                const stax = parseFloat(tr.querySelector('.stax-amt').value || 0).toFixed(2);
                const ftax = parseFloat(tr.querySelector('.ftax-amt').value || 0).toFixed(2);
                const incl = parseFloat(tr.querySelector('.val-incl').value || 0).toFixed(2);
                
                sumGross += parseFloat(excl);
                sumStax += parseFloat(stax);
                sumNet += parseFloat(incl);

                amountHtml = `
                    <td style="text-align:right;">${excl}</td>
                    <td style="text-align:right;">${stax}</td>
                    <td style="text-align:right;">${ftax}</td>
                    <td style="text-align:right;">${incl}</td>
                `;
            } else {
                const gross = parseFloat(tr.querySelector('.gross-amt').value || 0).toFixed(2);
                const disc = parseFloat(tr.querySelector('.disc-amt').value || 0).toFixed(2);
                const net = parseFloat(tr.querySelector('.net-amt').value || 0).toFixed(2);
                
                sumGross += parseFloat(gross);
                sumDisc += parseFloat(disc);
                sumNet += parseFloat(net);

                amountHtml = `
                    <td style="text-align:right;">${gross}</td>
                    <td style="text-align:right;">${disc}</td>
                    <td style="text-align:right;">${net}</td>
                `;
            }

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
                <title>${type} - ${sn}</title>
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
                            <div class="invoice-type-badge">${isTax ? 'TAX INVOICE' : 'NON-TAX INVOICE'}</div>
                        </div>
                    </div>

                    <div class="details-area">
                        <div class="vendor-box">
                            <div class="vendor-box-header">
                                <i class="fas fa-user-circle"></i> VENDOR
                            </div>
                            <div class="vendor-box-content">
                                <strong>${vName} (${vCode})</strong><br>
                                ${vAddress.split(',')[0]}<br>
                                <i class="fas fa-phone-alt" style="margin-top: 5px;"></i> ${vTel || 'N/A'}
                            </div>
                        </div>
                        <table class="invoice-details-table">
                            <tr>
                                <td>Invoice No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${sn}</b></td>
                            </tr>
                            <tr>
                                <td>Date</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${date}</b></td>
                            </tr>
                            <tr>
                                <td>Invoice Type</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${isTax ? 'Tax Invoice' : 'Non-Tax Invoice'}</b></td>
                            </tr>
                        </table>
                    </div>

                    <table class="grid-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Item Code</th>
                                <th>Description</th>
                                <th>Pcs</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                ${isTax ? '<th>Value Excl</th><th>STax</th><th>FTax</th><th>Value Incl</th>' : '<th>Gross</th><th>Disc</th><th>Net</th>'}
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr class="totals-row">
                                <td colspan="3" style="text-align: right;">TOTALS</td>
                                <td style="text-align: center;">${totPieces}</td>
                                <td style="text-align: center;">${totQty}</td>
                                <td></td>
                                ${isTax 
                                    ? `<td></td><td></td><td></td><td class="net-total-cell">${sumNet.toFixed(2)}</td>` 
                                    : `<td></td><td></td><td class="net-total-cell">${sumNet.toFixed(2)}</td>`}
                            </tr>
                        </tfoot>
                    </table>

                    <div class="lower-area">
                        <div class="left-lower">
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
                        <div class="right-lower">
                            ${!isTax ? `
                                <div class="summary-row">
                                    <span>GROSS AMOUNT</span>
                                    <span>:</span>
                                    <span>${sumGross.toFixed(2)}</span>
                                </div>
                                <div class="summary-row">
                                    <span>DISCOUNT</span>
                                    <span>:</span>
                                    <span>${sumDisc.toFixed(2)}</span>
                                </div>
                            ` : `
                                <div class="summary-row">
                                    <span>VALUE EXCL.</span>
                                    <span>:</span>
                                    <span>${sumGross.toFixed(2)}</span>
                                </div>
                                <div class="summary-row">
                                    <span>SALES TAX</span>
                                    <span>:</span>
                                    <span>${sumStax.toFixed(2)}</span>
                                </div>
                            `}
                            <div class="summary-row net-amount">
                                <span>NET AMOUNT</span>
                                <span>:</span>
                                <span>${parseFloat(totNet).toLocaleString(undefined, {minimumFractionDigits:2})}</span>
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
                    <tr><td colspan="10" class="center bold" style="font-size: 12px; color: #FF8C00;">${isTax ? 'TAX INVOICE' : 'NON-TAX INVOICE'}</td></tr>
                    <tr><td colspan="10"></td></tr>
                    
                    <tr>
                        <td colspan="5" class="bold" style="background:#f8f9fa; border:1px solid #000;">VENDOR DETAILS</td>
                        <td colspan="5" class="bold" style="background:#f8f9fa; border:1px solid #000;">INVOICE DETAILS</td>
                    </tr>
                    <tr>
                        <td colspan="5" style="border:1px solid #000; vertical-align:top;">
                            <strong>${vName} (${vCode})</strong><br>
                            ${vAddress.split(',')[0]}<br>
                            Phone: ${vTel || 'N/A'}
                        </td>
                        <td colspan="5" style="border:1px solid #000; vertical-align:top;">
                            Invoice No: <b>${sn}</b><br>
                            Date: <b>${date}</b><br>
                            Invoice Type: <b>${isTax ? 'Tax Invoice' : 'Non-Tax Invoice'}</b>
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
                        ${isTax ? '<th class="bold center">Value Excl</th><th class="bold center">STax</th><th class="bold center">FTax</th><th class="bold center">Value Incl</th>' : '<th class="bold center">Gross</th><th class="bold center">Disc</th><th class="bold center" colspan="2">Net</th>'}
                    </tr>
                    ${itemsHtml}
                    <tr>
                        <td colspan="3" class="right bold">TOTALS</td>
                        <td class="center bold">${totPieces}</td>
                        <td class="center bold">${totQty}</td>
                        <td></td>
                        ${isTax 
                            ? `<td></td><td></td><td></td><td class="right bold">${sumNet.toFixed(2)}</td>` 
                            : `<td></td><td></td><td class="right bold" colspan="2">${sumNet.toFixed(2)}</td>`}
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
                        <td colspan="3" class="bold right" style="border:1px solid #000;">${isTax ? 'VALUE EXCL.' : 'GROSS AMOUNT'}</td>
                        <td class="right" style="border:1px solid #000;">${sumGross.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" class="bold right" style="border:1px solid #000;">${isTax ? 'SALES TAX' : 'DISCOUNT'}</td>
                        <td class="right" style="border:1px solid #000;">${isTax ? sumStax.toFixed(2) : sumDisc.toFixed(2)}</td>
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
            a.download = `Purchase_${isVoucher ? 'Voucher' : 'Invoice'}_${sn}.xls`;
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


    fetchPurchaseOrderData: async function(poNo, isTax) {
        if (!poNo) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            const res = await fetch(`api/purchases.php?action=get_po&serial_no=${poNo}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch PO data.");
                return;
            }
            const po = await res.json();
            
            if (!po || !po.id) {
                alert(`Purchase Order #${poNo} not found in database.`);
                return;
            }

            // Set Tax mode
            const taxCheckbox = document.getElementById('pi_is_tax');
            if (taxCheckbox) {
                taxCheckbox.checked = isTax;
                this.toggleTaxMode(false);
            }
            
            // Wait for dependencies to load if not already
            if (!this.vendors || this.vendors.length === 0) {
                await this.loadVendors();
            }
            if (!this.inventory || this.inventory.length === 0) {
                await this.loadInventory();
            }

            // Fetch new next serial number for this invoice
            const isTaxVal = isTax ? 1 : 0;
            const resSn = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('pi_sn');
                if (snEl) snEl.innerText = snData.next_sn || '';
            }

            // Fill header
            document.getElementById('pi_vendor_code').value = '';
            document.getElementById('pi_vendor_name').value = '';
            
            const poNoEl = document.getElementById('pi_po_no');
            if (poNoEl) poNoEl.value = po.serial_no || poNo;
            
            const poDateEl = document.getElementById('pi_po_date');
            if (poDateEl && po.po_date) poDateEl.value = po.po_date;
            
            if (po.vendor_coa_id) {
                this.selectVendor(po.vendor_coa_id);
            }
            
            // Fill Items
            const tbody = document.querySelector('#piGridBody');
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
            alert(`Imported Purchase Order #${poNo} successfully!`);
        } catch (err) {
            console.error("Convert PO Error:", err);
            alert("System error importing Purchase Order.");
        }
    },

    fetchIGPData: async function(igpSn, isTax) {
        if (!igpSn) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;

            // Fetch IGP data by serial number
            const res = await fetch(`api/inward_gate_passes.php?action=fetch&sn=${igpSn}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch IGP data.");
                return;
            }
            const igp = await res.json();
            
            if (!igp || !igp.id) {
                alert(`Inward Gate Pass #${igpSn} not found in database.`);
                return;
            }

            // Set Tax mode
            const taxCheckbox = document.getElementById('pi_is_tax');
            if (taxCheckbox) {
                taxCheckbox.checked = isTax;
                this.toggleTaxMode(false);
            }
            
            // Wait for dependencies to load if not already
            if (!this.vendors || this.vendors.length === 0) {
                await this.loadVendors();
            }
            if (!this.inventory || this.inventory.length === 0) {
                await this.loadInventory();
            }

            // Fetch new next serial number for this invoice
            const isTaxVal = isTax ? 1 : 0;
            const resSn = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('pi_sn');
                if (snEl) snEl.innerText = snData.next_sn || '';
            }

            // Fill header
            document.getElementById('pi_vendor_code').value = '';
            document.getElementById('pi_vendor_name').value = '';
            
            const poNoEl = document.getElementById('pi_po_no');
            if (poNoEl) poNoEl.value = igp.purchase_order_no || '';
            
            const poDateEl = document.getElementById('pi_po_date');
            if (poDateEl && igp.purchase_order_date) poDateEl.value = igp.purchase_order_date;
            
            if (igp.vendor_coa_id) {
                this.selectVendor(igp.vendor_coa_id);
            }
            
            // Fill Items
            const tbody = document.querySelector('#piGridBody');
            if (tbody) {
                tbody.innerHTML = '';
                
                if (igp.items && igp.items.length > 0) {
                    igp.items.forEach(item => {
                        const rowData = {
                            item_coa_id: item.item_id,         // map item_id -> item_coa_id
                            code: item.item_code || '',
                            item_code: item.item_code || '',
                            item_name: item.item_name || '',
                            master_name: item.item_name || '',
                            description: item.description || item.item_name || '',
                            pieces: item.pieces || '',
                            quantity: item.qty || '',           // quantity
                            unit: item.unit || '',
                            qty_per_piece: item.qty_per_piece || 0
                        };
                        this.addEmptyRow(rowData);
                    });
                }
                
                // Pad
                while(tbody.children.length < 8) {
                    this.addEmptyRow();
                }
            }

            this.calculateTotals();
            alert(`Imported Inward Gate Pass #${igpSn} successfully!`);
        } catch (err) {
            console.error("Convert IGP Error:", err);
            alert("System error importing Inward Gate Pass.");
        }
    },



    // Find Modal Methods
    findData: [],
    openFindModal: async function() {
        const modal = document.getElementById('pi_find_modal');
        if (modal) modal.style.display = 'flex';
        await this.renderFindTable();
    },

    closeFindModal: function() {
        const modal = document.getElementById('pi_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('pi_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/purchases.php?action=search_invoices&company_id=${companyId}`);
            this.findData = await res.json();
            this.filterFindTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const tbody = document.getElementById('pi_find_table_body');
        if (!tbody) return;
        
        const q = (document.getElementById('pi_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('pi_find_field')?.value || 'serial_no';
        
        const filtered = this.findData.filter(inv => {
            if (!q) return true;
            const val = (inv[field]?.toString() || '').toLowerCase();
            return val.includes(q);
        });
        
        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:10px;">No records found</td></tr>';
            return;
        }
        
        filtered.forEach(inv => {
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
                const d = inv.created_at ? new Date(inv.created_at) : new Date();
                const dStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US');
                document.getElementById('pi_find_added_on').value = dStr;
                document.getElementById('pi_find_edited_on').value = dStr;
            };

            // Double click to load
            tr.ondblclick = () => {
                this.closeFindModal();
                document.getElementById('pi_is_tax').checked = (inv.is_tax_invoice == 1);
                document.getElementById('pi_sn').value = inv.serial_no;
                this.navigate('this');
            };
            
            const isPostedMark = (inv.is_posted == 1) ? '✓' : '';
            let statusText = 'Draft';
            if (inv.is_cancelled == 1) statusText = 'Cancelled';
            else if (inv.is_posted == 1) statusText = 'Posted';

            tr.innerHTML = `
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0; border-left: none;">▶</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.serial_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.invoice_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.is_tax_invoice == 1 ? 'Tax' : 'Non-Tax'}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.vendor_invoice_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.vendor_invoice_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.purchase_order_no || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.purchase_order_date || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.vendor_name || 'N/A'}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${inv.payment_terms || ''}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0; text-align: right;">${parseFloat(inv.net_total || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0; text-align: center;">${isPostedMark}</td>
                <td style="padding: 2px 4px; border: 1px solid #d0d0d0;">${statusText}</td>
            `;
            tbody.appendChild(tr);
        });
    }
};

// Global entry point for ERP modular popup system
window.initPurchaseInvoiceModule = function() {
    console.log("PI Module: Global Init called");
    if (window.PIModule) window.PIModule.init();
};



