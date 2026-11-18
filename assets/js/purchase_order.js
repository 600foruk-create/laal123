// --- PURCHASE ORDER MODULE LOGIC ---
window.POModule = {
    vendors: [],
    inventory: [],
    currentMatches: [], // Store current search results
    employees: [],
    jobs: [],
    currentId: null,
    gridData: [],
    suggestIndex: -1,

    init: async function() {
        console.log("PO Module: Initializing...");
        
        const container = document.getElementById('purchaseOrderContainer');
        if (!container) {
            console.warn("PO Module: purchaseOrderContainer not in DOM yet, retrying in 50ms...");
            setTimeout(() => this.init(), 50);
            return;
        }
        
        // Setup dropdown listeners
        document.addEventListener('click', e => {
            const isJobClick = e.target.closest('#po_job_display');
            const jd = document.getElementById('po_job_dropdown');
            if (isJobClick) {
                if (jd) jd.style.display = (jd.style.display === 'block') ? 'none' : 'block';
            } else if (!e.target.closest('#po_job_wrapper')) {
                if (jd) jd.style.display = 'none';
            }

            const isEmpClick = e.target.closest('#po_employee_display');
            const ed = document.getElementById('po_employee_dropdown');
            if (isEmpClick) {
                if (ed) ed.style.display = (ed.style.display === 'block') ? 'none' : 'block';
            } else if (!e.target.closest('#po_employee_wrapper')) {
                if (ed) ed.style.display = 'none';
            }

            // Deselect grid row if clicking outside
            if (!e.target.closest('tr.selected-row') && !e.target.closest('.row-selector')) {
                document.querySelectorAll('#poGridBody tr').forEach((r, idx) => {
                    r.classList.remove('selected-row');
                    if (r.firstElementChild) r.firstElementChild.innerHTML = idx + 1;
                });
            }
        });

        const setupKeyboardNav = (displayId, dropdownId) => {
            const display = document.getElementById(displayId);
            const dropdown = document.getElementById(dropdownId);
            if (!display || !dropdown) return;
            
            let currentIndex = -1;
            
            const highlightItem = (items, index) => {
                items.forEach((item, i) => {
                    if (i === index) {
                        item.classList.add('active');
                        item.style.backgroundColor = '#1F4E79';
                        item.style.color = 'white';
                        item.scrollIntoView({ block: 'nearest' });
                    } else {
                        item.classList.remove('active');
                        item.style.backgroundColor = '';
                        item.style.color = '';
                    }
                });
            };

            display.addEventListener('keydown', (e) => {
                if (dropdown.style.display !== 'block') {
                    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                        dropdown.style.display = 'block';
                        currentIndex = -1;
                        const items = dropdown.querySelectorAll('.po-suggest-item');
                        highlightItem(items, -1);
                        e.preventDefault();
                    }
                    return;
                }
                
                const items = dropdown.querySelectorAll('.po-suggest-item');
                if (!items.length) return;

                if (e.key === 'ArrowDown') {
                    currentIndex = (currentIndex + 1) % items.length;
                    highlightItem(items, currentIndex);
                    e.preventDefault();
                } else if (e.key === 'ArrowUp') {
                    currentIndex = (currentIndex - 1 + items.length) % items.length;
                    highlightItem(items, currentIndex);
                    e.preventDefault();
                } else if (e.key === 'Enter') {
                    if (currentIndex >= 0 && currentIndex < items.length) {
                        items[currentIndex].click();
                        display.focus(); // keep focus after selection
                    }
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    dropdown.style.display = 'none';
                    display.focus();
                    e.preventDefault();
                }
            });

            display.addEventListener('click', () => {
                currentIndex = -1;
                const items = dropdown.querySelectorAll('.po-suggest-item');
                highlightItem(items, -1);
            });
        };
        
        setupKeyboardNav('po_job_display', 'po_job_dropdown');
        setupKeyboardNav('po_employee_display', 'po_employee_dropdown');

        // 1. Reset form immediately to show grid lines
        this.resetForm(true);
        
        // 2. Load data in background
        try {
            await Promise.all([
                this.loadVendors(),
                this.loadInventory(),
                this.loadEmployees(),
                this.loadJobs()
            ]);
        } catch (e) { console.error("PO Module: Load Error:", e); }
        
        this.setupVendorSearch();
        this.setupKeyboardNav();
        
        const cancelCb = document.getElementById('po_is_cancelled');
        if (cancelCb) cancelCb.addEventListener('change', () => this.toggleCancelledStamp());
    },

    toggleCancelledStamp: function() {
        const checkbox = document.getElementById('po_is_cancelled');
        const stamp = document.getElementById('po_cancelled_stamp');
        if (checkbox && stamp) {
            stamp.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    convertIGP: async function() {
        if (!this.currentId) {
            alert("Please save the Purchase Order first before converting to I.G.P.");
            return;
        }
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            // Get next IGP serial
            const res = await fetch(`api/inward_gate_passes.php?action=get_next_serial_no&company_id=${companyId}`);
            if (!res.ok) {
                alert("Failed to fetch next IGP Serial.");
                return;
            }
            const data = await res.json();
            const nextIgpNo = data.next_no;
            
            if (nextIgpNo) {
                document.getElementById('po_converted_igp_no').innerText = nextIgpNo;
                document.getElementById('po_converted_igp_no').setAttribute('data-igp-no', nextIgpNo);
                document.getElementById('po_converted_igp_text').style.display = 'block';
                
                // Save PO with updated converted_to_igp
                const poSnToConvert = document.getElementById('po_sn').value;
                  const saveBtn = document.querySelector('.po-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.savePO();
                    saveBtn.innerText = originalText;
                } else {
                    await this.savePO();
                }
                
                // Open IGP
                                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Store/inward_gate_passes.html', 'fa-truck-loading', 'Inward Gate Pass', async () => {
                        if (window.IGPModule && typeof window.IGPModule.init === 'function') {
                            await window.IGPModule.init();
                            if (typeof window.IGPModule.fetchPurchaseOrderData === 'function') {
                                window.IGPModule.fetchPurchaseOrderData(poSnToConvert);
                            }
                        }
                    }, 'Inward Gate Passes', true, true);
                }
            }
        } catch (e) {
            console.error("Convert IGP Error:", e);
            alert("Failed to convert to I.G.P.");
        }
    },

    convertPurchase: async function(isTax) {
        if (!this.currentId) {
            alert("Please save the Purchase Order first before converting to Purchase Invoice.");
            return;
        }
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            // Get next PI serial
            const isTaxVal = isTax ? 1 : 0;
            const res = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${companyId}&is_tax=${isTaxVal}`);
            if (!res.ok) {
                alert("Failed to fetch next PI Serial.");
                return;
            }
            const data = await res.json();
            const nextPiNo = data.next_sn;
            
            if (nextPiNo) {
                if (isTax) {
                    const el = document.getElementById('po_converted_pitax_no');
                    if (el) {
                        el.innerText = nextPiNo;
                        el.setAttribute('data-pi-no', nextPiNo);
                        const textEl = document.getElementById('po_converted_pitax_text');
                        if (textEl) textEl.style.display = 'block';
                    }
                } else {
                    const el = document.getElementById('po_converted_pinontax_no');
                    if (el) {
                        el.innerText = nextPiNo;
                        el.setAttribute('data-pi-no', nextPiNo);
                        const textEl = document.getElementById('po_converted_pinontax_text');
                        if (textEl) textEl.style.display = 'block';
                    }
                }
                
                // Save PO with updated conversion status
                const poSnToConvert = document.getElementById('po_sn').value;
                  const saveBtn = document.querySelector('.po-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.savePO();
                    saveBtn.innerText = originalText;
                } else {
                    await this.savePO();
                }
                
                // Open Purchase Invoice
                                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', async () => {
                        if (window.PIModule && typeof window.PIModule.init === 'function') {
                            await window.PIModule.init();
                            if (typeof window.PIModule.fetchPurchaseOrderData === 'function') {
                                window.PIModule.fetchPurchaseOrderData(poSnToConvert, isTax);
                            }
                        }
                    }, 'Purchase Invoices', true, true);
                }
            }
        } catch (e) {
            console.error("Convert PI Error:", e);
            alert("Failed to convert to Purchase Invoice.");
        }
    },

    loadVendors: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        console.log("PO Module: Fetching Vendors...");
        try {
            // Stage 1: Try VND
            let res = await fetch(`api/maintain.php?action=get_vendors&sub_id=VND&company_id=${companyId}`);
            this.vendors = await res.json();
            
            // Stage 2: Try SUP if empty
            if (!this.vendors || this.vendors.length === 0) {
                console.log("PO Module: No VND, trying SUP...");
                res = await fetch(`api/maintain.php?action=get_vendors&sub_id=SUP&company_id=${companyId}`);
                this.vendors = await res.json();
            }
            
            // Stage 3: Try generic coa_list if still empty
            if (!this.vendors || this.vendors.length === 0) {
                console.log("PO Module: Still empty, trying generic search...");
                res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`); // might work if PHP handles it
                const backup = await res.json();
                if (backup && backup.length > 0) this.vendors = backup;
            }
            
            console.log("PO Module: Final Vendors loaded:", this.vendors.length);
        } catch (e) { console.error("PO Module: Load Vendors Error:", e); }
    },

    loadInventory: async function() {
        // Fast in-memory check
        if (!this.inventory || this.inventory.length === 0) {
            if (window.SaleOrderModule && Array.isArray(window.SaleOrderModule.inventory) && window.SaleOrderModule.inventory.length > 0) {
                this.inventory = window.SaleOrderModule.inventory;
            } else if (window.allInventoryItems && Array.isArray(window.allInventoryItems) && window.allInventoryItems.length > 0) {
                this.inventory = window.allInventoryItems;
            } else if (window.SaleInvoiceModule && Array.isArray(window.SaleInvoiceModule.inventory) && window.SaleInvoiceModule.inventory.length > 0) {
                this.inventory = window.SaleInvoiceModule.inventory;
            } else if (window.PIModule && Array.isArray(window.PIModule.inventory) && window.PIModule.inventory.length > 0) {
                this.inventory = window.PIModule.inventory;
            }
        }
        if (this.inventory && this.inventory.length > 0) return this.inventory;

        if (this._inventoryPromise) return this._inventoryPromise;
        this._inventoryPromise = (async () => {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            let loaded = [];

            // 1. Fetch from sale_order.php get_all_items
            try {
                const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        loaded = data;
                    }
                }
            } catch (e) { console.error("PO Module: Load Inventory Error:", e); }

            // 2. Fallback / Catalog Enrichment from digital_invoice metadata
            try {
                const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
                if (resMeta.ok) {
                    const dataMeta = await resMeta.json();
                    if (dataMeta && Array.isArray(dataMeta.items) && dataMeta.items.length > 0) {
                        if (loaded.length === 0 || dataMeta.items.length > loaded.length) {
                            loaded = dataMeta.items;
                        }
                    }
                }
            } catch (errFallback) {}

            // 3. Fallback to inventory.php get_all_items_lookup
            if (loaded.length === 0) {
                try {
                    const resLookup = await fetch(`api/inventory.php?action=get_all_items_lookup&company_id=${companyId}&_cb=${Date.now()}`);
                    if (resLookup.ok) {
                        const dataLookup = await resLookup.json();
                        if (Array.isArray(dataLookup) && dataLookup.length > 0) {
                            loaded = dataLookup;
                        }
                    }
                } catch (eLookup) {}
            }

            // 4. Fallback to inventory.php get_all_items
            if (loaded.length === 0) {
                try {
                    const resInv = await fetch(`api/inventory.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
                    if (resInv.ok) {
                        const dataInv = await resInv.json();
                        if (Array.isArray(dataInv) && dataInv.length > 0) {
                            loaded = dataInv;
                        }
                    }
                } catch (eInv) {}
            }

            // 5. Fallback to window.allInventoryItems
            if (loaded.length === 0 && window.allInventoryItems && Array.isArray(window.allInventoryItems) && window.allInventoryItems.length > 0) {
                loaded = window.allInventoryItems;
            }

            // Normalize inventory items
            if (Array.isArray(loaded) && loaded.length > 0) {
                this.inventory = loaded.map(i => ({
                    id: i.id || i.coa_list_id,
                    code: String(i.code || i.item_code || '').trim(),
                    item_code: String(i.item_code || i.code || '').trim(),
                    name: String(i.name || i.item_name || i.description || '').trim(),
                    item_name: String(i.item_name || i.name || i.description || '').trim(),
                    description: String(i.description || i.item_name || i.name || '').trim(),
                    hs_code: i.hs_code || '0000.0000',
                    unit: i.unit || 'Pcs',
                    sales_price: parseFloat(i.sales_price || i.selling_price || i.rate || 0),
                    selling_price: parseFloat(i.selling_price || i.sales_price || i.rate || 0),
                    purchase_price: parseFloat(i.purchase_price || i.cost_price || i.cost || i.rate || i.sales_price || i.selling_price || 0),
                    cost_price: parseFloat(i.cost_price || i.purchase_price || i.cost || i.rate || i.sales_price || i.selling_price || 0),
                    qty_per_piece: parseFloat(i.qty_per_piece || 0),
                    tax_rate: parseFloat(i.tax_rate || 0),
                    category_name: i.category_name || i.category_type || 'Inventory'
                }));
                window.allInventoryItems = this.inventory;
            } else {
                this.inventory = this.inventory || [];
            }
            return this.inventory;
        })();

        try {
            return await this._inventoryPromise;
        } finally {
            this._inventoryPromise = null;
        }
    },

    loadEmployees: async function() {
        try {
            const companyId = localStorage.getItem('company_id') || 1;
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            this.employees = await res.json();
            const container = document.getElementById('po_employee_dropdown');
            if (container) {
                container.innerHTML = `<div class="po-suggest-item" onclick="document.getElementById('po_employee_ref').value=''; document.getElementById('po_employee_text').innerText='Select Employee'; this.parentElement.style.display='none';">Select Employee</div>`;
                this.employees.forEach(e => {
                    if (!e.name || !e.name.trim()) return;
                    const cleanName = e.name.trim();
                    const safeName = cleanName.replace(/'/g, "\\'");
                    container.innerHTML += `<div class="po-suggest-item" onclick="document.getElementById('po_employee_ref').value='${e.id}'; document.getElementById('po_employee_text').innerText='${safeName}'; this.parentElement.style.display='none';">${cleanName}</div>`;
                });
            }
        } catch (e) { console.error("PO Module: Load Employees Error:", e); }
    },

    loadJobs: async function() {
        try {
            const companyId = localStorage.getItem('company_id') || 1;
            const res = await fetch(`api/jobs.php?action=get_jobs&company_id=${companyId}`);
            this.jobs = await res.json();
            const container = document.getElementById('po_job_dropdown');
            if (container) {
                container.innerHTML = `<div class="po-suggest-item" onclick="document.getElementById('po_job_ref').value=''; document.getElementById('po_job_text').innerText='Select Job'; this.parentElement.style.display='none';">Select Job</div>`;
                this.jobs.forEach(j => {
                    if (!j.job_no && !j.description) return;
                    const jobDesc = `${j.job_no || ''} - ${j.description || ''}`.trim();
                    const safeDesc = jobDesc.replace(/'/g, "\\'");
                    container.innerHTML += `<div class="po-suggest-item" onclick="document.getElementById('po_job_ref').value='${j.id}'; document.getElementById('po_job_text').innerText='${safeDesc}'; this.parentElement.style.display='none';">${jobDesc}</div>`;
                });
            }
        } catch (e) { console.error("PO Module: Load Jobs Error:", e); }
    },

    setupVendorSearch: function() {
        const input = document.getElementById('vendor_code');
        const nameInput = document.getElementById('vendor_name');
        const suggest = document.getElementById('vendor_suggest');
        if (!suggest) return;

        const handleVendorInput = (val, triggerEl) => {
            val = (val || '').toLowerCase().trim();
            if (!val) { 
                suggest.style.display = 'none'; 
                return; 
            }
            
            const searchWords = val.split(/\s+/);
            const matches = typeof window.smartSearchFilterAndSort === 'function' ?
                window.smartSearchFilterAndSort(this.vendors, val) :
                this.vendors.filter(v => {
                    const searchStr = `${v.code || ''} ${v.name || ''} ${v.address || ''}`.toLowerCase();
                    return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
                }).slice(0, 15);

            this.currentVendorMatches = matches;
            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map((v, idx) => `
                    <div class="po-suggest-item" data-id="${v.id}" data-idx="${idx}" style="padding: 4px 8px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
                        <b>${v.code || ''}</b> &nbsp; ${v.name || ''}
                    </div>
                `).join('');
                suggest.style.display = 'block';
                suggest.style.zIndex = '999999';

                const items = suggest.querySelectorAll('.po-suggest-item');
                items.forEach(item => {
                    item.addEventListener('mouseenter', () => {
                        this.suggestIndex = parseInt(item.dataset.idx);
                        this.updateSuggestHighlight(items);
                    });
                    item.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this.selectVendor(item.dataset.id);
                    });
                });
            } else { 
                suggest.style.display = 'none'; 
            }
        };

        const attachVendorEvents = (inp) => {
            if (!inp) return;
            inp.addEventListener('focus', () => {
                inp.select();
                if (inp.value) handleVendorInput(inp.value, inp);
            });
            inp.addEventListener('click', () => {
                inp.select();
            });
            inp.addEventListener('input', (e) => {
                handleVendorInput(e.target.value, inp);
            });
            inp.addEventListener('keydown', (e) => {
                if (suggest.style.display === 'block') {
                    const items = suggest.querySelectorAll('.po-suggest-item, div');
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.suggestIndex = Math.min(this.suggestIndex + 1, items.length - 1);
                        this.updateSuggestHighlight(items);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.suggestIndex = Math.max(this.suggestIndex - 1, 0);
                        this.updateSuggestHighlight(items);
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const selIdx = (this.suggestIndex > -1) ? this.suggestIndex : 0;
                        if (items[selIdx]) {
                            const vId = items[selIdx].dataset.id || (this.currentVendorMatches && this.currentVendorMatches[selIdx] ? (this.currentVendorMatches[selIdx].id || this.currentVendorMatches[selIdx].coa_id || this.currentVendorMatches[selIdx].coa_list_id) : null);
                            if (vId) {
                                this.selectVendor(vId);
                            }
                        }
                    } else if (e.key === 'Escape') {
                        suggest.style.display = 'none';
                    }
                } else if (e.key === 'Enter') {
                    const val = inp.value.trim().toLowerCase();
                    if (val && this.vendors && this.vendors.length > 0) {
                        const matched = this.vendors.find(v => String(v.code || '').toLowerCase() === val || String(v.name || '').toLowerCase() === val);
                        if (matched) {
                            this.selectVendor(matched.id || matched.coa_id || matched.coa_list_id);
                            e.preventDefault();
                        }
                    }
                }
            });
        };

        attachVendorEvents(input);
        attachVendorEvents(nameInput);

        document.addEventListener('click', (e) => { 
            if (e.target !== input && e.target !== nameInput && !suggest.contains(e.target)) {
                suggest.style.display = 'none'; 
            }
        });
    },

    selectVendor: async function(coaId) {
        if (!coaId) return;
        const v = (this.vendors || []).find(x => x.id == coaId || x.coa_list_id == coaId || x.coa_id == coaId || x.code == coaId);
        if (v) {
            this.selectedVendor = v;
            document.getElementById('vendor_code').value = v.code || '';
            document.getElementById('vendor_name').value = v.name || v.vendor_name || '';
            document.getElementById('vendor_address').value = v.address || v.vendor_address || '';
            document.getElementById('vendor_tel').value = v.telephone || v.mobile || v.vendor_telephone || '';
            document.getElementById('vendor_gst').value = v.st_reg_no || v.gst_reg_no || v.gst || v.vendor_gst || '';
            document.getElementById('vendor_ntn').value = v.ntn_cnic || v.ntn || v.vendor_ntn || '';
            this.selectedVendorCoaId = v.id || v.coa_id || v.coa_list_id || coaId;
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const targetCoaId = this.selectedVendorCoaId;
                if (targetCoaId) {
                    const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${targetCoaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                    const bal = await res.json();
                    const balEl = document.getElementById('vendor_balance');
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
                            balEl.style.color = '#000000';
                        }
                    }
                }
            } catch(e) { console.error("Balance fetch error:", e); }
        }
        const suggest = document.getElementById('vendor_suggest');
        if (suggest) suggest.style.display = 'none';
        const poDateEl = document.getElementById('po_date');
        if (poDateEl) poDateEl.focus();
    },

    updateSuggestHighlight: function(items) {
        items.forEach((item, idx) => {
            if (idx === this.suggestIndex) {
                item.classList.add('active');
                item.style.backgroundColor = 'var(--theme-primary, #1F4E79)';
                item.style.color = 'white';
                item.querySelectorAll('*').forEach(el => el.style.color = 'white');
                if (item.parentElement) {
                    const parent = item.parentElement;
                    const itemTop = item.offsetTop;
                    const itemBottom = itemTop + item.offsetHeight;
                    if (itemTop < parent.scrollTop) {
                        parent.scrollTop = itemTop;
                    } else if (itemBottom > parent.scrollTop + parent.clientHeight) {
                        parent.scrollTop = itemBottom - parent.clientHeight;
                    }
                }
            } else {
                item.classList.remove('active');
                item.style.backgroundColor = '';
                item.style.color = '';
                item.querySelectorAll('*').forEach(el => el.style.color = '');
            }
        });
    },

    // --- GRID LOGIC ---
    addRow: function(data = {}) {
        const tbody = document.getElementById('poGridBody');
        const rowIndex = tbody.children.length;
        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        
        tr.innerHTML = `
            <td class="row-selector" style="text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0;">${rowIndex + 1}</td>
            <td style="border: 1px solid #cbd5e0; position: relative;">
                <input type="text" class="grid-input item-code-search" placeholder="" autocomplete="off">
                <div class="grid-suggest"></div>
            </td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-description"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num pieces"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num qty"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-unit"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-excl"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num tax-rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num tax-amt"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num frth-rate"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num frth-amt"></td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-incl"></td>
        `;
        
        if (data.item_coa_id) {
            tr.dataset.coaId = data.item_coa_id;
            tr.dataset.qtyPerPiece = data.qty_per_piece || 0;
            
            // PROGRAMMATIC ASSIGNMENT - Avoid HTML Quote Truncation
            tr.querySelector('.item-code-search').value = data.item_code || '';
            
            // SMART FALLBACK
            let displayDesc = data.description ? data.description.toString().trim() : '';
            const masterName = (data.item_name || data.master_name || '').toString().trim();
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
                        if (typeof this.updateSuggestHighlight === 'function') this.updateSuggestHighlight(items);
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

            const tbody = document.getElementById('poGridBody');
            if (tr === tbody.lastElementChild && val !== '') { this.addRow(); }
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
                    if (typeof this.updateSuggestHighlight === 'function') this.updateSuggestHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.suggestIndex = Math.max((this.suggestIndex ?? 0) - 1, 0);
                    if (typeof this.updateSuggestHighlight === 'function') this.updateSuggestHighlight(items);
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
            // Auto-select text on focus and click to allow easy overwriting
            input.addEventListener('focus', () => {
                input.select();
            });
            input.addEventListener('click', () => {
                input.select();
            });

            input.addEventListener('blur', () => {
                if (input.classList.contains('num') && input.value.trim() === '') {
                    input.value = '0.00';
                }
            });

            if (input.classList.contains('num')) {
                input.oninput = () => this.calculateRow(idx);
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
            (document.querySelector(`#poGridBody > tr[data-index="${trOrIndex}"]`) || document.querySelector(`#poGridBody tr[data-index="${trOrIndex}"]`));
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
            
            const taxRateInput = tr.querySelector('.tax-rate');
            if (taxRateInput) taxRateInput.value = parseFloat(item.tax_rate || 0).toFixed(2);
            
            this.calculateRow(rowIndex);
            
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

    findPO: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const sn = prompt("Enter PO Serial Number to Find:");
        if (!sn) return;

        try {
            const res = await fetch(`api/purchases.php?action=get_po&serial_no=${sn}&company_id=${companyId}`);
            const po = await res.json();
            if (po && po.id) {
                this.loadPOData(po);
            } else {
                alert("PO Not Found!");
            }
        } catch (e) { console.error("Find PO Error:", e); }
    },

    loadPOData: async function(po) {
        this.currentId = po.id;
        document.getElementById('po_sn').value = po.serial_no;
        document.getElementById('po_date').value = po.po_date;
        document.getElementById('po_delivery_date').value = po.delivery_date;
        document.getElementById('po_payment_terms').value = po.payment_terms;
        
        document.getElementById('po_job_ref').value = po.job_id || '';
        const job = this.jobs.find(j => j.id == po.job_id);
        const jobText = document.getElementById('po_job_text');
        if (jobText) jobText.innerText = job ? `${job.job_no} - ${job.description}` : 'Select Job';

        document.getElementById('po_employee_ref').value = po.employee_id || '';
        const emp = this.employees.find(e => e.id == po.employee_id);
        const empText = document.getElementById('po_employee_text');
        if (empText) empText.innerText = emp ? emp.name : 'Select Employee';
        
        document.getElementById('po_terms').value = po.terms_conditions || '';
        document.getElementById('po_remarks').value = po.remarks || '';
        document.getElementById('po_is_cancelled').checked = parseInt(po.is_cancelled) === 1;
        this.toggleCancelledStamp();

        // IGP and PI conversion texts
        const igpNo = parseInt(po.converted_to_igp) || 0;
        const piTaxNo = parseInt(po.converted_to_pi_tax) || 0;
        const piNonTaxNo = parseInt(po.converted_to_pi_nontax) || 0;

        const setConversionText = (idNo, idText, val) => {
            const elNo = document.getElementById(idNo);
            const elText = document.getElementById(idText);
            if (val > 0) {
                if (elNo) { elNo.innerText = val; elNo.setAttribute('data-pi-no', val); }
                if (elText) elText.style.display = 'block';
            } else {
                if (elNo) { elNo.innerText = ''; elNo.setAttribute('data-pi-no', '0'); }
                if (elText) elText.style.display = 'none';
            }
        };

        const igpNoEl = document.getElementById('po_converted_igp_no');
        const igpTextEl = document.getElementById('po_converted_igp_text');
        if (igpNo > 0) {
            if (igpNoEl) { igpNoEl.innerText = igpNo; igpNoEl.setAttribute('data-igp-no', igpNo); }
            if (igpTextEl) igpTextEl.style.display = 'block';
        } else {
            if (igpNoEl) { igpNoEl.innerText = ''; igpNoEl.setAttribute('data-igp-no', '0'); }
            if (igpTextEl) igpTextEl.style.display = 'none';
        }

        setConversionText('po_converted_pitax_no', 'po_converted_pitax_text', piTaxNo);
        setConversionText('po_converted_pinontax_no', 'po_converted_pinontax_text', piNonTaxNo);

        // Load Vendor Info
        const vCoaId = po.vendor_coa_id || (po.vendor ? po.vendor.id : null);
        this.selectedVendorCoaId = vCoaId;

        const vendor = (this.vendors || []).find(v => v.id == vCoaId || v.coa_list_id == vCoaId);
        if (vendor) {
            await this.selectVendor(vCoaId);
        }

        // Fill vendor fields from saved PO data (overriding or as fallback)
        if (po.vendor_code || (po.vendor && po.vendor.code)) {
            document.getElementById('vendor_code').value = po.vendor_code || po.vendor.code;
        }
        if (po.vendor_name || (po.vendor && po.vendor.name)) {
            document.getElementById('vendor_name').value = po.vendor_name || po.vendor.name;
        }
        if (po.vendor_address || (po.vendor && po.vendor.address)) {
            document.getElementById('vendor_address').value = po.vendor_address || po.vendor.address;
        }
        if (po.vendor_telephone || (po.vendor && po.vendor.telephone)) {
            document.getElementById('vendor_tel').value = po.vendor_telephone || po.vendor.telephone;
        }
        if (po.vendor_gst || (po.vendor && (po.vendor.st_reg_no || po.vendor.gst_reg_no))) {
            document.getElementById('vendor_gst').value = po.vendor_gst || po.vendor.st_reg_no || po.vendor.gst_reg_no;
        }
        if (po.vendor_ntn || (po.vendor && (po.vendor.ntn_cnic || po.vendor.ntn))) {
            document.getElementById('vendor_ntn').value = po.vendor_ntn || po.vendor.ntn_cnic || po.vendor.ntn;
        }

        // Fetch balance if not already fetched
        if (vCoaId) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                fetch(`api/maintain.php?action=get_coa_balance&coa_id=${vCoaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`)
                    .then(r => r.json())
                    .then(bal => {
                        const balEl = document.getElementById('vendor_balance');
                        if (balEl && bal) {
                            const balanceVal = parseFloat(bal.balance || 0);
                            if (balanceVal > 0) {
                                balEl.value = Math.abs(balanceVal).toFixed(2) + ' Dr';
                                balEl.style.color = '#16a34a';
                            } else if (balanceVal < 0) {
                                balEl.value = Math.abs(balanceVal).toFixed(2) + ' Cr';
                                balEl.style.color = '#dc2626';
                            } else {
                                balEl.value = '0.00';
                                balEl.style.color = '#000000';
                            }
                        }
                    }).catch(e => {});
            } catch(e) {}
        }

        // Load Items
        const tbody = document.getElementById('poGridBody');
        tbody.innerHTML = '';
        if (po.items && po.items.length > 0) {
            po.items.forEach(item => this.addRow(item));
        }
        
        // Ensure at least 30 rows
        const currentRows = tbody.children.length;
        if (currentRows < 30) {
            for (let i = 0; i < (30 - currentRows); i++) {
                this.addRow();
            }
        }
        this.calculateTotals();
    },

    reindexRows: function() {
        document.querySelectorAll('#poGridBody tr').forEach((tr, idx) => {
            tr.dataset.index = idx;
            if (!tr.classList.contains('selected-row')) {
                tr.firstElementChild.innerHTML = idx + 1;
            }
        });
    },

    calculateRow: function(rowIndex) {
        const tr = document.querySelector(`#poGridBody tr[data-index="${rowIndex}"]`);
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
        
        document.querySelectorAll('#poGridBody tr').forEach(tr => {
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

        this.updateAmountInWords(tIncl);
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
        if (!amount || isNaN(amount) || amount === 0) {
            document.getElementById('po_amt_words').innerText = 'Rupees zero and 00/100 only.';
            return;
        }

        const integerPart = Math.floor(amount);
        let decimalPart = Math.round((amount - integerPart) * 100);
        
        const words = this.numberToWords(integerPart);
        const decStr = decimalPart < 10 ? '0' + decimalPart : decimalPart;
        
        document.getElementById('po_amt_words').innerText = `Rupees ${words} and ${decStr}/100 only.`;
    },

    setupKeyboardNav: function() {
        const gridBody = document.getElementById('poGridBody');
        if (gridBody) {
            gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            gridBody.addEventListener('click', (e) => {
                const selector = e.target.closest('.row-selector');
                if (selector) {
                    const tr = selector.closest('tr');
                    
                    document.querySelectorAll('#poGridBody tr').forEach((r) => {
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
                this.savePO();
            } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const selectedRow = document.querySelector('#poGridBody tr.selected-row');
                if (selectedRow) {
                    selectedRow.remove();
                    this.reindexRows();
                    this.calculateTotals();
                }
            }
        });
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('poGridBody');
        const suggest = tr ? (tr._suggestBox || tr.querySelector('.grid-suggest') || document.querySelector(`.grid-suggest[data-tr-index="${tr.dataset.index}"]`)) : null;

        // If suggestion box is open on item-code-search, stop grid navigation so it doesn't jump rows or close
        if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
            return;
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
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevRowInputs = getVisibleRowInputs(prevTr);
                if (prevRowInputs[colIdx]) prevRowInputs[colIdx].focus();
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
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                const allInputs = getAllVisibleInputs();
                const index = allInputs.indexOf(target);
                if (index > 0) allInputs[index - 1].focus();
            }
        }
    },

    resetForm: async function(isNew = false) {
        this.currentId = null;
        this.selectedVendorCoaId = null;
        this.selectedVendor = null;
        
        // Reset Headers
        const inputs = ['vendor_code', 'vendor_name', 'vendor_address', 'vendor_tel', 'vendor_gst', 'vendor_ntn', 'vendor_balance',
                       'po_date', 'po_delivery_date', 'po_payment_terms', 'po_job_ref', 'po_employee_ref', 'po_terms', 'po_remarks'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const cancelCb = document.getElementById('po_is_cancelled');
        if (cancelCb) cancelCb.checked = false;
        this.toggleCancelledStamp();
        
        const igpTextEl = document.getElementById('po_converted_igp_text');
        const igpNoEl = document.getElementById('po_converted_igp_no');
        if (igpNoEl) { igpNoEl.innerText = ''; igpNoEl.setAttribute('data-igp-no', '0'); }
        if (igpTextEl) igpTextEl.style.display = 'none';

        const piTaxNoEl = document.getElementById('po_converted_pitax_no');
        const piTaxTextEl = document.getElementById('po_converted_pitax_text');
        if (piTaxNoEl) { piTaxNoEl.innerText = ''; piTaxNoEl.setAttribute('data-pi-no', '0'); }
        if (piTaxTextEl) piTaxTextEl.style.display = 'none';

        const piNonTaxNoEl = document.getElementById('po_converted_pinontax_no');
        const piNonTaxTextEl = document.getElementById('po_converted_pinontax_text');
        if (piNonTaxNoEl) { piNonTaxNoEl.innerText = ''; piNonTaxNoEl.setAttribute('data-pi-no', '0'); }
        if (piNonTaxTextEl) piNonTaxTextEl.style.display = 'none';
        
        const jobText = document.getElementById('po_job_text');
        if (jobText) jobText.innerText = 'Select Job';
        const empText = document.getElementById('po_employee_text');
        if (empText) empText.innerText = 'Select Employee';

        // Reset Grid with 40 rows
        const tbody = document.getElementById('poGridBody');
        if (tbody) {
            tbody.innerHTML = '';
            for (let i = 0; i < 40; i++) {
                this.addRow();
            }
        }

        if (isNew) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;
                const res = await fetch(`api/purchases.php?action=get_next_serial&company_id=${companyId}`);
                if (res.ok) {
                    const data = await res.json();
                    const snEl = document.getElementById('po_sn');
                    if (snEl && data && data.next_sn) snEl.value = data.next_sn;
                }
            } catch (err) {
                console.error("PO Module: Error fetching next serial:", err);
            }
            const dateEl = document.getElementById('po_date');
            if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
        }
        this.calculateTotals();
    },

    savePO: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        if (!this.selectedVendorCoaId) {
            const vCode = document.getElementById('vendor_code').value.trim();
            const vName = document.getElementById('vendor_name').value.trim();
            if (vCode && this.vendors && this.vendors.length > 0) {
                const matched = this.vendors.find(v => String(v.code || '').toLowerCase() === vCode.toLowerCase() || String(v.name || '').toLowerCase() === vName.toLowerCase());
                if (matched) {
                    this.selectedVendorCoaId = matched.id || matched.coa_id || matched.coa_list_id;
                }
            }
        }
        if (!this.selectedVendorCoaId) { alert("Please select a vendor."); return; }

        const items = [];
        document.querySelectorAll('#poGridBody tr').forEach(tr => {
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
            serial_no: document.getElementById('po_sn').value,
            po_date: document.getElementById('po_date').value,
            delivery_date: document.getElementById('po_delivery_date').value,
            payment_terms: document.getElementById('po_payment_terms').value,
            job_ref: document.getElementById('po_job_ref').value,
            employee_ref_id: document.getElementById('po_employee_ref').value,
            vendor_coa_id: this.selectedVendorCoaId,
            vendor_name: document.getElementById('vendor_name') ? document.getElementById('vendor_name').value.trim() : '',
            vendor_address: document.getElementById('vendor_address') ? document.getElementById('vendor_address').value.trim() : '',
            vendor_telephone: document.getElementById('vendor_tel') ? document.getElementById('vendor_tel').value.trim() : '',
            vendor_gst: document.getElementById('vendor_gst') ? document.getElementById('vendor_gst').value.trim() : '',
            vendor_ntn: document.getElementById('vendor_ntn') ? document.getElementById('vendor_ntn').value.trim() : '',
            total_pieces: document.getElementById('tot_pieces').value,
            total_qty: document.getElementById('tot_qty').value,
            total_excl_tax: document.getElementById('tot_excl').value,
            total_tax_amount: document.getElementById('tot_tax').value,
            total_further_tax: document.getElementById('tot_further').value,
            total_incl_tax: document.getElementById('tot_incl').value,
            amount_words: document.getElementById('po_amt_words').innerText,
            terms_conditions: document.getElementById('po_terms').value,
            remarks: document.getElementById('po_remarks').value,
            is_cancelled: document.getElementById('po_is_cancelled').checked ? 1 : 0,
            converted_to_igp: document.getElementById('po_converted_igp_no') ? parseInt(document.getElementById('po_converted_igp_no').getAttribute('data-igp-no') || 0) : 0,
            converted_to_pi_tax: document.getElementById('po_converted_pitax_no') ? parseInt(document.getElementById('po_converted_pitax_no').getAttribute('data-pi-no') || 0) : 0,
            converted_to_pi_nontax: document.getElementById('po_converted_pinontax_no') ? parseInt(document.getElementById('po_converted_pinontax_no').getAttribute('data-pi-no') || 0) : 0,
            items: items
        };

        try {
            const res = await fetch(`api/purchases.php?action=save_po&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert("Saved!");
                this.resetForm(true);
            } else { alert("Save Error: " + result.message); }
        } catch (e) { console.error("Save PO Error:", e); }
    },

    showToast: function(msg) {
        let toast = document.getElementById('po_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'po_toast';
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
        let sn = parseInt(document.getElementById('po_sn').value) || 0;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/purchases.php?action=get_next_serial&company_id=${companyId}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/purchases.php?action=get_next_serial&company_id=${companyId}`);
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
            let url = `api/purchases.php?action=get_po&serial_no=${sn}&company_id=${companyId}`;
            if (dir === 'next' || dir === 'prev') url += `&dir=${dir}`;
            const res = await fetch(url);
            const po = await res.json();
            if (po && po.id) {
                this.loadPOData(po);
            } else {
                if (dir === 'next' || dir === 'last') {
                    // At last record — stay, show toast
                    this.showToast('You are on the last record');
                } else if (dir === 'prev') {
                    this.showToast('You are on the first record');
                } else {
                    // Prev with no record at this SN — show blank with SN
                    await this.resetForm(false);
                    document.getElementById('po_sn').value = sn;
                    document.getElementById('po_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation Error:", e); }
    },

    deletePO: async function() {
        if (!this.currentId) {
            alert("No Purchase Order loaded to delete.");
            return;
        }
        
        if (!confirm("Are you sure you want to delete this Purchase Order? This action cannot be undone.")) {
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/purchases.php?action=delete_po&id=${this.currentId}&company_id=${companyId}`, {
                method: 'POST'
            });
            const result = await res.json();
            
            if (result.status === 'success') {
                alert("Purchase Order deleted successfully.");
                this.resetForm(true);
            } else {
                alert("Error deleting PO: " + (result.message || 'Unknown error'));
            }
        } catch (e) {
            console.error("Delete PO Error:", e);
            alert("Failed to delete Purchase Order.");
        }
    },

    openPrintSettings: function() {
        const modal = document.getElementById('poPrintSettingsModal');
        if (modal) {
            const chk = document.getElementById('po_print_no_header_chk');
            if (chk) {
                chk.checked = localStorage.getItem('softifyx_po_print_no_header') === 'true';
            }
            modal.style.display = 'flex';
        }
    },

    savePrintSettings: function() {
        const chk = document.getElementById('po_print_no_header_chk');
        if (chk) {
            localStorage.setItem('softifyx_po_print_no_header', chk.checked ? 'true' : 'false');
        }
        const modal = document.getElementById('poPrintSettingsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    printPO: function() {
        if (!this.currentId) {
            alert("Please save or load a Purchase Order before printing.");
            return;
        }

        const sn = document.getElementById('po_sn').value;
        const poDate = document.getElementById('po_date').value;
        const delDate = document.getElementById('po_delivery_date').value;
        const payTerms = document.getElementById('po_payment_terms').value;
        
        const vCode = document.getElementById('vendor_code').value;
        const vName = document.getElementById('vendor_name').value;
        const vAddress = document.getElementById('vendor_address').value;
        const vTel = document.getElementById('vendor_tel').value;

        const totPieces = document.getElementById('tot_pieces').value;
        const totQty = document.getElementById('tot_qty').value;
        const totIncl = document.getElementById('tot_incl').value;
        const amtWords = document.getElementById('po_amt_words').innerText;
        const remarks = document.getElementById('po_remarks').value;
        const terms = document.getElementById('po_terms') ? document.getElementById('po_terms').value : '';

        // Collect items
        let itemsHtml = '';
        
        // Get company details
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companies = JSON.parse(localStorage.getItem('softifyx_companies') || '[]');
        const company = companies.find(c => c.id == session.company_id) || {};
        
        let coName = company.name || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
        coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');
        
        const coAddress = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai';
        const coPhone = company.phone || '+923487240256';
        const coEmail = company.email || 'info@seastonepipes.com';
        
        const customLogo = window.getCompanyLogo ? window.getCompanyLogo() : 'assets/logos/logo.png';
        
        document.querySelectorAll('#poGridBody tr').forEach((tr, index) => {
            const code = tr.querySelector('.item-code-search').value;
            if (!code) return; // Skip empty rows
            
            const desc = tr.cells[2].querySelector('input').value;
            const pieces = tr.querySelector('.pieces').value;
            const qty = tr.querySelector('.qty').value;
            const unit = tr.cells[5].querySelector('input').value;
            const rate = tr.querySelector('.rate').value;
            const valExcl = tr.querySelector('.val-excl').value;
            const taxAmt = tr.querySelector('.tax-amt').value;
            const valIncl = tr.querySelector('.val-incl').value;
            
            itemsHtml += `
                <tr>
                    <td style="border:1px solid #000; padding:4px; text-align:center;">${index + 1}</td>
                    <td style="border:1px solid #000; padding:4px;">${code}</td>
                    <td style="border:1px solid #000; padding:4px;">${desc}</td>
                    <td style="border:1px solid #000; padding:4px; text-align:center;">${pieces}</td>
                    <td style="border:1px solid #000; padding:4px; text-align:center;">${qty} ${unit}</td>
                    <td style="border:1px solid #000; padding:4px; text-align:right;">${rate}</td>
                    <td style="border:1px solid #000; padding:4px; text-align:right;">${valExcl}</td>
                    <td style="border:1px solid #000; padding:4px; text-align:right;">${taxAmt}</td>
                    <td style="border:1px solid #000; padding:4px; text-align:right;">${valIncl}</td>
                </tr>
            `;
        });

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        
        const hideHeader = localStorage.getItem('softifyx_po_print_no_header') === 'true';

        let headerHtml = '';
        if (hideHeader) {
            headerHtml = `
                <div style="text-align: center; margin-bottom: 15px; margin-top: 100px;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #000; text-transform: uppercase;">Purchase Order</h3>
                </div>
                <hr style="border: 0; border-top: 2px solid #000; margin-bottom: 15px;">
            `;
        } else {
            headerHtml = `
                <div class="header">
                    <img src="${customLogo}" alt="Logo" onerror="this.style.display='none'">
                    <div class="header-content">
                        <h2>${coName}</h2>
                        <p>${coAddress} | Phone: ${coPhone}</p>
                        <p>Email: ${coEmail}</p>
                        <h3>Purchase Order</h3>
                    </div>
                </div>
                <hr style="border: 0; border-top: 2px solid #000; margin-bottom: 15px;">
            `;
        }

        const html = `
            <html>
            <head>
                <title>Purchase Order - ${sn}</title>
                <style>
                    @page { margin: 0; }
                    body { font-family: Arial, sans-serif; font-size: 12px; margin: 1cm; }
                    .header { display: flex; align-items: center; justify-content: center; position: relative; margin-bottom: 5px; }
                    .header img { position: absolute; left: 0; top: 0; max-width: 80px; max-height: 80px; }
                    .header-content { text-align: center; }
                    .header h2 { margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase; }
                    .header p { margin: 2px 0; font-size: 11px; color: #555; }
                    .header h3 { margin: 8px 0 0 0; font-size: 14px; font-weight: bold; color: #000; }
                    .details-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
                    .details-table td { padding: 4px; vertical-align: top; }
                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
                    .grid-table th { border: 1px solid #000; padding: 4px; background: #f0f0f0; text-align: center; }
                    .totals { text-align: right; margin-top: 20px; font-weight: bold; }
                    .footer { margin-top: 40px; font-size: 11px; }
                </style>
            </head>
            <body>
                ${headerHtml}
                
                <table class="details-table">
                    <tr>
                        <td width="50%">
                            <b>Vendor Details:</b><br>
                            Name: ${vName} (${vCode})<br>
                            Address: ${vAddress}<br>
                            Tel: ${vTel}
                        </td>
                        <td width="50%">
                            <b>Order Details:</b><br>
                            Serial No: <b>${sn}</b><br>
                            Date: ${poDate}<br>
                            Delivery Date: ${delDate}<br>
                            Payment Terms: ${payTerms}
                        </td>
                    </tr>
                </table>

                <table class="grid-table">
                    <thead>
                        <tr>
                            <th>S.No</th>
                            <th>Item Code</th>
                            <th>Description</th>
                            <th>Pieces</th>
                            <th>Quantity</th>
                            <th>Rate</th>
                            <th>Value Excl.</th>
                            <th>Tax Amt</th>
                            <th>Value Incl.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <th colspan="3" style="text-align:right; border:1px solid #000;">TOTALS:</th>
                            <th style="border:1px solid #000; text-align:center;">${totPieces}</th>
                            <th style="border:1px solid #000; text-align:center;">${totQty}</th>
                            <th style="border:1px solid #000;"></th>
                            <th style="border:1px solid #000;"></th>
                            <th style="border:1px solid #000;"></th>
                            <th style="border:1px solid #000; text-align:right;">${totIncl}</th>
                        </tr>
                    </tfoot>
                </table>

                <div style="margin-bottom: 10px;">
                    <b>Amount in Words:</b> ${amtWords}
                </div>
                <div style="margin-bottom: 10px;">
                    <b>Remarks:</b> ${remarks}
                </div>
                
                <div style="margin-bottom: 30px; margin-top: 20px;">
                    <b><i>Terms & Condtions :</i></b><br>
                    <div style="margin-top: 5px; white-space: pre-wrap;">${terms}</div>
                </div>

                <div class="footer" style="margin-top: 40px;">
                    <div style="display: flex; align-items: flex-end; gap: 10px;">
                        <b style="font-style: italic; font-size: 13px;">Authorized Signatures</b>
                        <div style="flex: 1; max-width: 350px; border-bottom: 1px solid #000; margin-bottom: 3px;"></div>
                    </div>
                    <div style="margin-top: 15px; font-style: italic; color: #444; font-size: 12px;">
                        Prepared By: ${session.username || 'Administrator'}
                    </div>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 500);
                    };
                </script>
            </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
    }
};

// Global entry point for ERP modular popup system
window.initPurchaseOrderModule = function() {
    console.log("PO Module: Global Init called");
    if (window.POModule) window.POModule.init();
};

if (document.getElementById('purchaseOrderContainer') && window.POModule) {
    setTimeout(() => window.POModule.init(), 50);
}



