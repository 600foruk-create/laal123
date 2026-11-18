// --- PURCHASE ORDER MODULE LOGIC ---
window.SaleOrderModule = {
    customers: [],
    inventory: [],
    currentMatches: [], // Store current search results
    employees: [],
    jobs: [],
    currentId: null,
    gridData: [],
    suggestIndex: -1,


    showFindModal: async function() {
        document.getElementById('soFindModal').style.display = 'flex';
        document.getElementById('soFindValue').focus();
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/sale_order.php?action=get_all&company_id=${companyId}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            this.findSOList = data || [];
            this.sortFindGrid('serial_no');
        } catch (e) {
            console.error("Find Modal Load Error:", e);
            alert("Error loading Sale Orders.");
        }
    },

    filterFindGrid: async function() {
        const field = document.getElementById('soFindField').value;
        const val = document.getElementById('soFindValue').value.trim();
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        try {
            let url = `api/sale_order.php?action=search&company_id=${companyId}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(val)}`;
            if (!val) {
                url = `api/sale_order.php?action=get_all&company_id=${companyId}`;
            }
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to search");
            const data = await res.json();
            this.findSOList = data || [];
            this.sortFindGrid(this.findSortField);
        } catch(e) {
            console.error("Filter Error:", e);
        }
    },

    renderFindGrid: function(data) {
        const tbody = document.getElementById('soFindGridBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        data.forEach((so, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="row-indicator" style="text-align: center; color: #3182ce; font-size: 10px;"></td>
                <td style="text-align: center;">${so.serial_no}</td>
                <td>${so.date || ''}</td>
                <td>${so.customer_order_ref || ''}</td>
                <td>${so.delivery_date || ''}</td>
                <td>${so.customer_name || ''}</td>
                <td>${so.terms_of_payment || ''}</td>
                <td style="text-align: right;">${parseFloat(so.total_amount || 0).toFixed(2)}</td>
                <td>${so.is_cancelled == 1 ? 'Cancelled' : ''}</td>
            `;
            
            tr.onclick = () => this.selectFindRow(index, tr, so);
            tr.ondblclick = () => {
                this.navigateBySN(so.serial_no);
                document.getElementById('soFindModal').style.display = 'none';
            };
            
            tbody.appendChild(tr);
        });
        
        if (data.length > 0) {
            this.selectFindRow(0, tbody.firstChild, data[0]);
        } else {
            this.findSelectedIndex = -1;
            this.updateFindFooter(null);
        }
    },

    selectFindRow: function(index, tr, dataObj) {
        this.findSelectedIndex = index;
        const tbody = document.getElementById('soFindGridBody');
        if (!tbody) return;
        
        tbody.querySelectorAll('tr').forEach(row => {
            row.classList.remove('selected');
            row.querySelector('.row-indicator').innerHTML = '';
        });
        
        if (tr) {
            tr.classList.add('selected');
            tr.querySelector('.row-indicator').innerHTML = '&#9654;';
            tr.scrollIntoView({ block: 'nearest' });
        }
        
        this.updateFindFooter(dataObj);
    },

    updateFindFooter: function(so) {
        if (so) {
            document.getElementById('soFindAddedBy').value = "Administrator";
            document.getElementById('soFindAddedOn').value = so.created_at || '';
            document.getElementById('soFindEditedBy').value = "";
            document.getElementById('soFindEditedOn').value = "";
        } else {
            document.getElementById('soFindAddedBy').value = "";
            document.getElementById('soFindAddedOn').value = "";
            document.getElementById('soFindEditedBy').value = "";
            document.getElementById('soFindEditedOn').value = "";
        }
    },

    refreshFindGrid: function() {
        document.getElementById('soFindValue').value = '';
        this.showFindModal();
    },

    sortFindGrid: function(field) {
        if (this.findSortField === field) {
            this.findSortAsc = !this.findSortAsc;
        } else {
            this.findSortField = field;
            this.findSortAsc = true;
        }
        
        const sorted = [...this.findSOList].sort((a, b) => {
            let valA = a[field] || '';
            let valB = b[field] || '';
            
            if (field === 'serial_no') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            }
            
            if (valA < valB) return this.findSortAsc ? -1 : 1;
            if (valA > valB) return this.findSortAsc ? 1 : -1;
            return 0;
        });
        
        this.findSOList = sorted;
        this.renderFindGrid(sorted);
    },

    navigateBySN: async function(sn) {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/sale_order.php?action=get_sale_order&serial_no=${sn}&company_id=${companyId}`);
            const data = await res.json();
            if (data && data.id) {
                this.loadSOData(data);
            } else {
                alert("Sale Order not found.");
            }
        } catch (err) {
            console.error("Find load error:", err);
        }
    },

    init: async function() {
        console.log("PO Module: Initializing...");
        
        // Setup dropdown listeners
        document.addEventListener('click', e => {
            const isJobClick = e.target.closest('#so_job_display');
            const jd = document.getElementById('so_job_dropdown');
            if (isJobClick) {
                if (jd) jd.style.display = (jd.style.display === 'block') ? 'none' : 'block';
            } else if (!e.target.closest('#so_job_wrapper')) {
                if (jd) jd.style.display = 'none';
            }

            const isEmpClick = e.target.closest('#so_employee_display');
            const ed = document.getElementById('so_employee_dropdown');
            if (isEmpClick) {
                if (ed) ed.style.display = (ed.style.display === 'block') ? 'none' : 'block';
            } else if (!e.target.closest('#so_employee_wrapper')) {
                if (ed) ed.style.display = 'none';
            }

            // Deselect grid row if clicking outside
            if (!e.target.closest('tr.selected-row') && !e.target.closest('.row-selector')) {
                document.querySelectorAll('#soGridBody tr').forEach((r, idx) => {
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
                        const items = dropdown.querySelectorAll('.so-suggest-item');
                        highlightItem(items, -1);
                        e.preventDefault();
                    }
                    return;
                }
                
                const items = dropdown.querySelectorAll('.so-suggest-item');
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
                const items = dropdown.querySelectorAll('.so-suggest-item');
                highlightItem(items, -1);
            });
        };
        
        setupKeyboardNav('so_job_display', 'so_job_dropdown');
        setupKeyboardNav('so_employee_display', 'so_employee_dropdown');

        // 1. Reset form immediately to show grid lines
        this.resetForm(true);
        
        // 2. Load data in background
        try {
            await Promise.all([
                this.loadCustomers(),
                this.loadInventory(),
                this.loadEmployees(),
                this.loadJobs()
            ]);
        } catch (e) { console.error("PO Module: Load Error:", e); }
        
        this.setupCustomerSearch();
        this.setupKeyboardNav();
        
        const cancelCb = document.getElementById('so_is_cancelled');
        if (cancelCb) cancelCb.addEventListener('change', () => this.toggleCancelledStamp());
    },

    toggleCancelledStamp: function() {
        const checkbox = document.getElementById('so_is_cancelled');
        const stamp = document.getElementById('so_cancelled_stamp');
        if (checkbox && stamp) {
            stamp.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    convertDC: async function() {
        if (!this.currentId) {
            alert("Please save the Sale Order first before converting to D.C.");
            return;
        }
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            // Get next DC serial
            const res = await fetch(`api/delivery_challan.php?action=get_next_serial_no&company_id=${companyId}`);
            if (!res.ok) {
                throw new Error("Failed to get next DC serial");
            }
            const data = await res.json();
            const nextNo = data.next_no;
            
            if (nextNo) {
                const el = document.getElementById('so_converted_dc_no');
                if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                const textEl = document.getElementById('so_converted_dc_text');
                if (textEl) textEl.style.display = 'block';
                
                const soSnToConvert = document.getElementById('so_sn').value;
                const saveBtn = document.querySelector('.so-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.saveSO();
                    saveBtn.innerText = originalText;
                } else {
                    await this.saveSO();
                }
                
                // Open DC
                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Sales/delivery_challans.html', 'fa-truck-loading', 'Delivery Challans', () => {
                        let tries = 0;
                        const checkModule = setInterval(async () => {
                            tries++;
                            if (window.DeliveryChallanModule && typeof window.DeliveryChallanModule.init === 'function') {
                                clearInterval(checkModule);
                                await window.DeliveryChallanModule.init();
                                setTimeout(() => {
                                    if (typeof window.DeliveryChallanModule.fetchSaleOrderData === 'function') {
                                        window.DeliveryChallanModule.fetchSaleOrderData(soSnToConvert);
                                    }
                                }, 500);
                            } else if (tries > 50) {
                                clearInterval(checkModule);
                            }
                        }, 100);
                    }, 'Delivery Challans', true, true);
                }
            }
        } catch (e) {
            console.error("Convert DC Error:", e);
            alert("Failed to convert to Delivery Challan.");
        }
    },

    convertInvoice: async function(isTax) {
        if (!this.currentId) {
            alert("Please save the Sale Order first before converting to Sale Invoice.");
            return;
        }
        
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            // Get next Invoice serial
            const isTaxVal = isTax ? 1 : 0;
            const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTaxVal}`);
            if (!res.ok) {
                throw new Error("Failed to get next Invoice serial");
            }
            const data = await res.json();
            const nextNo = data.next_no || data.next_sn;
            
            if (nextNo) {
                if (isTax) {
                    const el = document.getElementById('so_converted_invtax_no');
                    if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                    const textEl = document.getElementById('so_converted_invtax_text');
                    if (textEl) textEl.style.display = 'block';
                } else {
                    const el = document.getElementById('so_converted_invnontax_no');
                    if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                    const textEl = document.getElementById('so_converted_invnontax_text');
                    if (textEl) textEl.style.display = 'block';
                }
                
                const soSnToConvert = document.getElementById('so_sn').value;
                const saveBtn = document.querySelector('.so-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.saveSO();
                    saveBtn.innerText = originalText;
                } else {
                    await this.saveSO();
                }
                
                // Open Sale Invoice
                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice-dollar', 'Sale Invoice', () => {
                        let tries = 0;
                        const checkModule = setInterval(async () => {
                            tries++;
                            if (window.SIModule && typeof window.SIModule.init === 'function') {
                                clearInterval(checkModule);
                                await window.SIModule.init();
                                setTimeout(() => {
                                    if (typeof window.SIModule.fetchSaleOrderData === 'function') {
                                        window.SIModule.fetchSaleOrderData(soSnToConvert, isTax);
                                    }
                                }, 500);
                            } else if (tries > 50) {
                                clearInterval(checkModule);
                            }
                        }, 100);
                    }, 'Sale Invoice', true, true);
                }
            }
        } catch (e) {
            console.error("Convert Invoice Error:", e);
            alert("Failed to convert to Sale Invoice.");
        }
    },

    loadCustomers: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        console.log("Sale Order Module: Fetching Customers...");
        try {
            // Fetch ALL customers regardless of sub_id using the unified API
            const res = await fetch(`api/sale_order.php?action=get_customers_and_vendors&company_id=${companyId}&_cb=${Date.now()}`);
            const data = await res.json();
            
            if (Array.isArray(data) && data.length > 0) {
                this.customers = data.filter(c => c.type === 'customer').map(c => ({
                    ...c,
                    st_reg_no: c.gst_reg_no || c.st_reg_no || '',
                    ntn_cnic: c.ntn || c.ntn_cnic || c.cnic || ''
                }));
            }
            console.log("Sale Order Module: Final Customers loaded:", (this.customers || []).length);
        } catch (e) { console.error("Sale Order Module: Load Customers Error:", e); }

        // Comprehensive Fallback: if this.customers is empty or failed, fetch from digital_invoice metadata
        if (!this.customers || this.customers.length === 0) {
            try {
                const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
                const dataMeta = await resMeta.json();
                if (dataMeta && Array.isArray(dataMeta.customers) && dataMeta.customers.length > 0) {
                    this.customers = dataMeta.customers.map(c => ({
                        id: c.coa_id || c.customer_id,
                        coa_list_id: c.coa_id || c.customer_id,
                        code: c.customer_code,
                        name: c.customer_name,
                        address: c.address || '',
                        telephone: c.telephone || '',
                        ntn: c.ntn_cnic || c.cnic || '',
                        gst_reg_no: c.st_reg_no || '',
                        st_reg_no: c.st_reg_no || '',
                        ntn_cnic: c.ntn_cnic || c.cnic || '',
                        sales_tax_rate: parseFloat(c.sales_tax_rate) || 0,
                        further_tax_rate: parseFloat(c.further_tax_rate) || 0
                    }));
                }
            } catch (errFallback) { console.error("Sale Order Module: Customers Fallback Error:", errFallback); }
        }

        if ((!this.customers || this.customers.length === 0) && window.allCustomers && window.allCustomers.length > 0) {
            this.customers = window.allCustomers.map(c => ({
                id: c.id || c.coa_id,
                coa_list_id: c.id || c.coa_id,
                code: c.code || c.account_code || '',
                name: c.name || c.account_name || '',
                address: c.address || '',
                telephone: c.telephone || '',
                ntn: c.ntn_cnic || c.ntn || '',
                gst_reg_no: c.st_reg_no || c.gst_reg_no || ''
            }));
        }
    },

    loadInventory: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        // Fast-path: Borrow directly from SIModule if already loaded in this session
        if (window.SIModule && Array.isArray(window.SIModule.inventory) && window.SIModule.inventory.length > 0) {
            this.inventory = window.SIModule.inventory;
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
        } catch (e) { console.error("Sale Order Module: Load Inventory Error:", e); }

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
                        qty_per_piece: parseFloat(i.qty_per_piece || 0),
                        tax_rate: parseFloat(i.tax_rate || 0),
                        category_name: i.category_type || 'Inventory',
                        category_type: i.category_type || '',
                        pipe_sub_type: i.pipe_sub_type || '',
                        pipe_length: parseFloat(i.pipe_length || 0),
                        length: i.length || '',
                        length_unit: i.length_unit || 'ft',
                        billing_mode: i.billing_mode || '',
                        unit_weight: (!isNaN(parseFloat(i.unit_weight)) && parseFloat(i.unit_weight) > 0) ? parseFloat(i.unit_weight) : 0,
                        carton: parseFloat(i.carton || 0),
                        pcs_per_carton: parseFloat(i.pcs_per_carton || i.carton || 0),
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

        // 4. Fallback to digital_invoice.php get_meta
        if (!this.inventory || this.inventory.length === 0) {
            try {
                const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
                if (resMeta.ok) {
                    const dataMeta = await resMeta.json();
                    if (dataMeta && Array.isArray(dataMeta.items) && dataMeta.items.length > 0) {
                        this.inventory = dataMeta.items;
                    }
                }
            } catch (errFallback) {}
        }

        // 5. Global fallback
        if ((!this.inventory || this.inventory.length === 0) && window.allInventoryItems && Array.isArray(window.allInventoryItems) && window.allInventoryItems.length > 0) {
            this.inventory = window.allInventoryItems;
        }

        // Normalize all inventory items
        if (Array.isArray(this.inventory)) {
            this.inventory = this.inventory.map(i => ({
                id: i.id || i.coa_list_id,
                code: i.code || i.item_code || '',
                item_code: i.item_code || i.code || '',
                name: i.name || i.item_name || i.description || '',
                item_name: i.item_name || i.name || i.description || '',
                description: i.description || i.item_name || i.name || '',
                hs_code: i.hs_code || '',
                unit: i.unit || 'Pcs',
                sales_price: parseFloat(i.sales_price || i.selling_price || i.rate || 0),
                selling_price: parseFloat(i.selling_price || i.sales_price || i.rate || 0),
                qty_per_piece: parseFloat(i.qty_per_piece || 0),
                tax_rate: parseFloat(i.tax_rate || 0),
                item_type: i.item_type || 'inventory'
            }));
        }
        console.log("Sale Order Module: Inventory loaded count:", (this.inventory || []).length);
    },

    loadEmployees: async function() {
        try {
            const companyId = localStorage.getItem('company_id') || 1;
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            this.employees = await res.json();
            const container = document.getElementById('so_employee_dropdown');
            if (container) {
                
                container.innerHTML = `<div class="so-suggest-item" onclick="document.getElementById('so_employee_ref').value=''; document.getElementById('so_employee_text').innerText='Select Employee'; this.parentElement.style.display='none';">Select Employee</div>`;
                this.employees.forEach(e => {
                    if (!e.name || !e.name.trim()) return;
                    const cleanName = e.name.trim();
                    const safeName = cleanName.replace(/'/g, "\\'");
                    container.innerHTML += `<div class="so-suggest-item" onclick="document.getElementById('so_employee_ref').value='${e.id}'; document.getElementById('so_employee_text').innerText='${safeName}'; this.parentElement.style.display='none';">${cleanName}</div>`;
                });
            }
        } catch (e) { console.error("PO Module: Load Employees Error:", e); }
    },

    loadJobs: async function() {
        try {
            const companyId = localStorage.getItem('company_id') || 1;
            const res = await fetch(`api/jobs.php?action=get_jobs&company_id=${companyId}`);
            this.jobs = await res.json();
            const container = document.getElementById('so_job_dropdown');
            if (container) {
                container.innerHTML = `<div class="so-suggest-item" onclick="document.getElementById('so_job_ref').value=''; document.getElementById('so_job_text').innerText='Select Job'; this.parentElement.style.display='none';">Select Job</div>`;
                this.jobs.forEach(j => {
                    if (!j.job_no && !j.description) return;
                    const jobDesc = `${j.job_no || ''} - ${j.description || ''}`.trim();
                    const safeDesc = jobDesc.replace(/'/g, "\\'");
                    container.innerHTML += `<div class="so-suggest-item" onclick="document.getElementById('so_job_ref').value='${j.id}'; document.getElementById('so_job_text').innerText='${safeDesc}'; this.parentElement.style.display='none';">${jobDesc}</div>`;
                });
            }
        } catch (e) { console.error("PO Module: Load Jobs Error:", e); }
    },

    setupCustomerSearch: function() {
        const input = document.getElementById('customer_code');
        const nameInput = document.getElementById('customer_name');
        const suggest = document.getElementById('customer_suggest');
        if (!input || !suggest) return;

        const handleCustomerInput = async (val, triggerInput) => {
            val = (val || '').toLowerCase().trim();
            if (!val) { suggest.style.display = 'none'; return; }

            if (!this.customers || this.customers.length === 0) {
                await this.loadCustomers();
            }

            const searchWords = val.split(/\s+/);
            const matches = (this.customers || []).filter(v => {
                const code = String(v.code || v.customer_code || '');
                const name = String(v.name || v.customer_name || '');
                const addr = String(v.address || '');
                const searchStr = `${code} ${name} ${addr}`.toLowerCase();
                return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
            }).slice(0, 50);

            this.currentCustomerMatches = matches;
            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map((v, i) => `
                    <div class="so-suggest-item" data-id="${v.id || v.coa_id || v.coa_list_id}" data-idx="${i}" style="padding: 5px 8px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                        <span><b>${v.code || v.customer_code}</b> &nbsp; ${v.name || v.customer_name}</span>
                        ${v.telephone ? `<span style="color:#64748b; font-size:10px;">${v.telephone}</span>` : ''}
                    </div>
                `).join('');
                suggest.style.display = 'block';
                suggest.style.zIndex = '999999';

                const items = suggest.querySelectorAll('.so-suggest-item');
                items.forEach(item => {
                    item.addEventListener('mouseenter', () => {
                        this.suggestIndex = parseInt(item.dataset.idx);
                        this.updateSuggestHighlight(items);
                    });
                    item.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this.selectCustomer(item.dataset.id);
                    });
                });
            } else { 
                suggest.style.display = 'none'; 
            }
        };

        const attachCustEvents = (inp) => {
            if (!inp) return;
            inp.addEventListener('focus', () => {
                inp.select();
                if (inp.value) handleCustomerInput(inp.value, inp);
            });
            inp.addEventListener('click', () => {
                inp.select();
            });
            inp.addEventListener('input', (e) => {
                handleCustomerInput(e.target.value, inp);
            });
            inp.addEventListener('keydown', (e) => {
                if (suggest.style.display === 'block') {
                    const items = suggest.querySelectorAll('.so-suggest-item, div');
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
                            const custId = items[selIdx].dataset.id || (this.currentCustomerMatches && this.currentCustomerMatches[selIdx] ? (this.currentCustomerMatches[selIdx].id || this.currentCustomerMatches[selIdx].coa_id || this.currentCustomerMatches[selIdx].coa_list_id) : null);
                            if (custId) {
                                this.selectCustomer(custId);
                            }
                        }
                    } else if (e.key === 'Escape') {
                        suggest.style.display = 'none';
                    }
                } else if (e.key === 'Enter') {
                    const val = inp.value.trim().toLowerCase();
                    if (val && this.customers && this.customers.length > 0) {
                        const matched = this.customers.find(c => String(c.code || c.customer_code || '').toLowerCase() === val || String(c.name || c.customer_name || '').toLowerCase() === val);
                        if (matched) {
                            this.selectCustomer(matched.id || matched.coa_id || matched.coa_list_id);
                            e.preventDefault();
                        }
                    }
                }
            });
        };

        attachCustEvents(input);
        attachCustEvents(nameInput);

        document.addEventListener('click', (e) => { 
            if (e.target !== input && e.target !== nameInput && !suggest.contains(e.target)) {
                suggest.style.display = 'none'; 
            }
        });
    },

    selectCustomer: async function(coaId) {
        if (!coaId) return;
        const v = (this.customers || []).find(x => x.id == coaId || x.coa_list_id == coaId || x.coa_id == coaId || x.code == coaId || x.customer_code == coaId);
        if (v) {
            this.selectedCustomer = v;
            document.getElementById('customer_code').value = v.code || v.customer_code || '';
            document.getElementById('customer_name').value = v.name || v.customer_name || '';
            document.getElementById('customer_address').value = v.address || '';
            document.getElementById('customer_tel').value = v.telephone || v.mobile || '';
            document.getElementById('customer_gst').value = v.st_reg_no || v.gst_reg_no || '';
            document.getElementById('customer_ntn').value = v.ntn_cnic || v.ntn || v.cnic || '';
            this.selectedCustomerCoaId = v.id || v.coa_id || v.coa_list_id;
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const targetCoaId = this.selectedCustomerCoaId;
                if (targetCoaId) {
                    const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${targetCoaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                    const bal = await res.json();
                    const balEl = document.getElementById('customer_balance');
                    if (balEl) {
                        const balanceVal = parseFloat(bal.balance || 0);
                        if (balanceVal > 0) {
                            balEl.value = Math.abs(balanceVal).toFixed(2) + ' Dr';
                            balEl.style.color = '#dc2626'; // Red - customer owes us
                        } else if (balanceVal < 0) {
                            balEl.value = Math.abs(balanceVal).toFixed(2) + ' Cr';
                            balEl.style.color = '#16a34a'; // Green - we owe customer
                        } else {
                            balEl.value = '0.00';
                            balEl.style.color = '#000000';
                        }
                    }
                }
            } catch(e) { console.error("Balance fetch error:", e); }
        }
        const suggest = document.getElementById('customer_suggest');
        if (suggest) suggest.style.display = 'none';
        const dateInput = document.getElementById('so_date');
        if (dateInput) dateInput.focus();
    },

    updateSuggestHighlight: function(items) {
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

    // --- GRID LOGIC ---
    addRow: function(data = {}) {
        const tbody = document.getElementById('soGridBody');
        const rowIndex = tbody.children.length;
        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        
        tr.innerHTML = `
            <td class="row-selector" style="text-align:center; font-size:10px; color:#64748b; border: 1px solid #cbd5e0;">${rowIndex + 1}</td>
            <td style="border: 1px solid #cbd5e0; position: relative;">
                <input type="text" class="grid-input item-code-search" placeholder="" autocomplete="off">
                <div class="grid-suggest"></div>
            </td>
            <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input hs-code" tabindex="-1" readonly></td>
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
        
        if (data.item_id || data.item_coa_id) {
            tr.dataset.coaId = data.item_id || data.item_coa_id;
            tr.dataset.itemType = data.item_type || 'inventory';
            tr.dataset.qtyPerPiece = data.qty_per_piece || 0;
            
            // PROGRAMMATIC ASSIGNMENT - Avoid HTML Quote Truncation
            tr.querySelector('.item-code-search').value = data.item_code || data.code || '';
            
            // SMART FALLBACK
            let displayDesc = data.description ? data.description.toString().trim() : '';
            const masterName = (data.item_name || data.master_name || data.name || '').toString().trim();
            if (!displayDesc || /^\d+$/.test(displayDesc) || displayDesc.length <= 2) {
                displayDesc = masterName || displayDesc;
            }
            tr.querySelector('.si-description').value = displayDesc;
            tr.querySelector('.hs-code').value = data.hs_code || '';
            
            tr.querySelector('.pieces').value = (data.pieces || data.pieces === 0 || data.pieces === '0' || data.pieces === '0.00') ? parseFloat(data.pieces).toFixed(2) : '0.00';
            tr.querySelector('.qty').value = (data.quantity || data.qty || data.quantity === 0 || data.qty === 0 || data.quantity === '0' || data.qty === '0') ? parseFloat(data.quantity || data.qty).toFixed(2) : '0.00';
            tr.querySelector('.si-unit').value = data.unit || '';
            tr.querySelector('.rate').value = (data.rate || data.rate === 0 || data.rate === '0') ? parseFloat(data.rate).toFixed(2) : '0.00';
            tr.querySelector('.val-excl').value = (data.value_excl_tax || data.val_excl_tax || data.value_excl_tax === 0 || data.val_excl_tax === 0) ? parseFloat(data.value_excl_tax || data.val_excl_tax).toFixed(2) : '0.00';
            tr.querySelector('.tax-rate').value = (data.tax_rate || data.tax_rate === 0 || data.tax_rate === '0') ? parseFloat(data.tax_rate).toFixed(2) : '0.00';
            tr.querySelector('.tax-amt').value = (data.tax_amount || data.tax_amount === 0 || data.tax_amount === '0') ? parseFloat(data.tax_amount).toFixed(2) : '0.00';
            tr.querySelector('.frth-rate').value = (data.further_tax_rate || data.further_tax_rate === 0 || data.further_tax_rate === '0') ? parseFloat(data.further_tax_rate).toFixed(2) : '0.00';
            tr.querySelector('.frth-amt').value = (data.further_tax_amount || data.further_tax_amount === 0 || data.further_tax_amount === '0') ? parseFloat(data.further_tax_amount).toFixed(2) : '0.00';
            tr.querySelector('.val-incl').value = (data.value_incl_tax || data.val_incl_tax || data.value_incl_tax === 0 || data.val_incl_tax === 0) ? parseFloat(data.value_incl_tax || data.val_incl_tax).toFixed(2) : '0.00';
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

            const tbody = document.getElementById('soGridBody');
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
                    const code = tr.querySelector('.item-code-search').value.trim();
                    if (code !== '') {
                        input.value = '0.00';
                    }
                }
            });

            if (input.classList.contains('num')) {
                input.oninput = () => this.calculateRow(tr.dataset.index);
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
            (document.querySelector(`#soGridBody > tr[data-index="${trOrIndex}"]`) || document.querySelector(`#soGridBody tr[data-index="${trOrIndex}"]`));
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
            
            const hsInput = tr.querySelector('.hs-code');
            if (hsInput) hsInput.value = item.hs_code || '';
            
            const unitInput = tr.querySelector('.si-unit');
            if (unitInput) unitInput.value = item.unit || 'Pcs';
            
            const rateInput = tr.querySelector('.rate');
            if (rateInput) rateInput.value = parseFloat(item.sales_price || item.selling_price || item.rate || 0).toFixed(2);
            
            let stRate = 0;
            let ftRate = 0;
            if (this.selectedCustomer) {
                if (this.selectedCustomer.sales_tax_rate !== undefined && this.selectedCustomer.sales_tax_rate !== null) {
                    stRate = parseFloat(this.selectedCustomer.sales_tax_rate) || 0;
                }
                if (this.selectedCustomer.further_tax_rate !== undefined && this.selectedCustomer.further_tax_rate !== null) {
                    ftRate = parseFloat(this.selectedCustomer.further_tax_rate) || 0;
                }
            } else if (item.tax_rate !== undefined && item.tax_rate !== null) {
                stRate = parseFloat(item.tax_rate) || 0;
            }

            const taxRateInput = tr.querySelector('.tax-rate');
            if (taxRateInput) taxRateInput.value = stRate.toFixed(2);

            const frthRateInput = tr.querySelector('.frth-rate');
            if (frthRateInput) frthRateInput.value = ftRate.toFixed(2);
            
            this.calculateRow(rowIndex);
            
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

    findPO: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const sn = prompt("Enter PO Serial Number to Find:");
        if (!sn) return;

        try {
            const res = await fetch(`api/sale_order.php?action=get_sale_order&serial_no=${sn}&company_id=${companyId}`);
            const po = await res.json();
            if (po && po.id) {
                this.loadSOData(po);
            } else {
                alert("Sale Order Not Found!");
            }
        } catch (e) { console.error("Find PO Error:", e); }
    },

    loadSOData: async function(s) {
        this.currentId = s.id;
        document.getElementById('so_sn').value = s.serial_no;
        document.getElementById('so_date').value = s.date;
        document.getElementById('so_delivery_date').value = s.delivery_date;
        document.getElementById('so_customer_order_ref').value = s.customer_order_ref || '';
        document.getElementById('so_payment_terms').value = s.terms_of_payment || '';
        
        document.getElementById('so_job_ref').value = s.job_id || '';
        const job = this.jobs.find(j => j.id == s.job_id);
        const jobText = document.getElementById('so_job_text');
        if (jobText) jobText.innerText = job ? `${job.job_no} - ${job.description}` : 'Select Job';

        document.getElementById('so_employee_ref').value = s.employee_id || '';
        const emp = this.employees.find(e => e.id == s.employee_id);
        const empText = document.getElementById('so_employee_text');
        if (empText) empText.innerText = emp ? emp.name : 'Select Employee';
        
        document.getElementById('so_remarks').value = s.remarks || '';
        document.getElementById('so_is_cancelled').checked = parseInt(s.is_cancelled) === 1;
        this.toggleCancelledStamp();

        // DC and PI conversion texts
        const dcNo = parseInt(s.converted_to_dc) || 0;
        const invTaxNo = parseInt(s.converted_to_invtax) || 0;
        const invNonTaxNo = parseInt(s.converted_to_invnontax) || 0;

        const setConversionText = (idNo, idText, val) => {
            const elNo = document.getElementById(idNo);
            const elText = document.getElementById(idText);
            if (val > 0) {
                if (elNo) { elNo.innerText = val; elNo.setAttribute('data-sn', val); }
                if (elText) elText.style.display = 'block';
            } else {
                if (elNo) { elNo.innerText = ''; elNo.setAttribute('data-sn', '0'); }
                if (elText) elText.style.display = 'none';
            }
        };

        setConversionText('so_converted_dc_no', 'so_converted_dc_text', dcNo);
        setConversionText('so_converted_invtax_no', 'so_converted_invtax_text', invTaxNo);
        setConversionText('so_converted_invnontax_no', 'so_converted_invnontax_text', invNonTaxNo);

        // Load Customer Info
        const customer = this.customers.find(v => v.id == s.customer_coa_id || v.coa_list_id == s.customer_coa_id);
        if (customer) {
            await this.selectCustomer(s.customer_coa_id);
            if (s.customer_address) document.getElementById('customer_address').value = s.customer_address;
            if (s.customer_telephone) document.getElementById('customer_tel').value = s.customer_telephone;
            if (s.ntn) document.getElementById('customer_ntn').value = s.ntn;
            if (s.gst_reg_no) document.getElementById('customer_gst').value = s.gst_reg_no;
        }

        // Load Items
        const tbody = document.getElementById('soGridBody');
        tbody.innerHTML = '';
        if (s.items && s.items.length > 0) {
            s.items.forEach(item => this.addRow(item));
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
        document.querySelectorAll('#soGridBody tr').forEach((tr, idx) => {
            tr.dataset.index = idx;
            if (!tr.classList.contains('selected-row')) {
                tr.firstElementChild.innerHTML = idx + 1;
            }
        });
    },

    calculateRow: function(rowIndex) {
        const tr = document.querySelector(`#soGridBody tr[data-index="${rowIndex}"]`);
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
        
        document.querySelectorAll('#soGridBody tr').forEach(tr => {
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
        if (num < 0) return 'minus ' + this.numberToWords(Math.abs(num));
        
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
            document.getElementById('so_amt_words').innerText = 'Rupees zero and 00/100 only.';
            return;
        }

        const integerPart = Math.floor(amount);
        let decimalPart = Math.round((amount - integerPart) * 100);
        
        const words = this.numberToWords(integerPart);
        const decStr = decimalPart < 10 ? '0' + decimalPart : decimalPart;
        
        document.getElementById('so_amt_words').innerText = `Rupees ${words} and ${decStr}/100 only.`;
    },

    setupKeyboardNav: function() {
        const gridBody = document.getElementById('soGridBody');
        if (gridBody) {
            gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            gridBody.addEventListener('click', (e) => {
                const selector = e.target.closest('.row-selector');
                if (selector) {
                    const tr = selector.closest('tr');
                    
                    document.querySelectorAll('#soGridBody tr').forEach((r, idx) => { r.classList.remove('selected-row'); r.firstElementChild.innerHTML = idx + 1; });

                    tr.classList.add('selected-row');
                    selector.innerHTML = '►';
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveSO();
            } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const selectedRow = document.querySelector('#soGridBody tr.selected-row');
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
        if (!tr) return;
        const gridBody = document.getElementById('soGridBody');
        const suggest = tr._suggestBox || document.querySelector(`.grid-suggest[data-tr-index="${tr.dataset.index}"]`) || tr.querySelector('.grid-suggest');

        // Handle suggestion box keyboard nav
        if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
            const items = suggest.querySelectorAll('.suggest-item, .so-suggest-item, div');
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
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selIdx = (this.suggestIndex > -1) ? this.suggestIndex : 0;
                this.selectGridItem(tr.dataset.index, selIdx);
                return;
            } else if (e.key === 'Escape') {
                suggest.style.display = 'none';
                return;
            }
        } else if (target.classList.contains('item-code-search') && e.key === 'Enter') {
            e.preventDefault();
            const val = target.value.trim().toLowerCase();
            const suggest = tr._suggestBox || document.querySelector(`.grid-suggest[data-tr-index="${tr.dataset.index}"]`) || tr.querySelector('.grid-suggest');
            if (suggest && suggest.style.display === 'block') {
                const items = suggest.querySelectorAll('.suggest-item, .so-suggest-item, div');
                const selIdx = (this.suggestIndex > -1) ? this.suggestIndex : 0;
                if (items && items[selIdx]) {
                    this.selectGridItem(tr.dataset.index, selIdx);
                    return;
                }
            }
            if (val && this.inventory && this.inventory.length > 0) {
                let matched = this.inventory.find(i => String(i.item_code || i.code || '').toLowerCase() === val || String(i.item_name || i.name || '').toLowerCase() === val);
                if (!matched) {
                    matched = this.inventory.find(i => String(i.item_code || i.code || '').toLowerCase().includes(val) || String(i.item_name || i.name || '').toLowerCase().includes(val));
                }
                if (matched) {
                    this.currentMatches = [matched];
                    tr._currentMatches = [matched];
                    this.selectGridItem(tr.dataset.index, 0);
                    return;
                }
            }
            const piecesInput = tr.querySelector('.pieces');
            if (piecesInput) {
                piecesInput.focus();
                piecesInput.select();
            }
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
        this.currentId = null;
        this.selectedCustomerCoaId = null;
        
        // Reset Headers
        const inputs = ['customer_code', 'customer_name', 'customer_address', 'customer_tel', 'customer_gst', 'customer_ntn', 'customer_balance',
                       'so_date', 'so_delivery_date', 'so_payment_terms', 'so_job_ref', 'so_employee_ref', 'so_customer_order_ref', 'so_remarks'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('so_is_cancelled').checked = false;
        this.toggleCancelledStamp();
        
        const dcTextEl = document.getElementById('so_converted_dc_text');
        const dcNoEl = document.getElementById('so_converted_dc_no');
        if (dcNoEl) { dcNoEl.innerText = ''; dcNoEl.setAttribute('data-sn', '0'); }
        if (dcTextEl) dcTextEl.style.display = 'none';

        const invTaxNoEl = document.getElementById('so_converted_invtax_no');
        const invTaxTextEl = document.getElementById('so_converted_invtax_text');
        if (invTaxNoEl) { invTaxNoEl.innerText = ''; invTaxNoEl.setAttribute('data-sn', '0'); }
        if (invTaxTextEl) invTaxTextEl.style.display = 'none';

        const invNonTaxNoEl = document.getElementById('so_converted_invnontax_no');
        const invNonTaxTextEl = document.getElementById('so_converted_invnontax_text');
        if (invNonTaxNoEl) { invNonTaxNoEl.innerText = ''; invNonTaxNoEl.setAttribute('data-sn', '0'); }
        if (invNonTaxTextEl) invNonTaxTextEl.style.display = 'none';
        
        const jobText = document.getElementById('so_job_text');
        if (jobText) jobText.innerText = 'Select Job';
        const empText = document.getElementById('so_employee_text');
        if (empText) empText.innerText = 'Select Employee';

        // Reset Grid with 40 rows
        document.getElementById('soGridBody').innerHTML = '';
        for (let i = 0; i < 40; i++) {
            this.addRow();
        }

        if (isNew) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/sale_order.php?action=get_next_serial_no&company_id=${companyId}`);
            const data = await res.json();
            document.getElementById('so_sn').value = data.next_no;
            document.getElementById('so_date').value = new Date().toISOString().split('T')[0];
        }
        this.calculateTotals();
    },

    saveSO: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        if (!this.selectedCustomerCoaId) { alert("Please select a customer."); return; }

        const items = [];
        document.querySelectorAll('#soGridBody tr').forEach(tr => {
            const coaId = tr.dataset.coaId;
            if (coaId) {
                items.push({
                    item_id: coaId,
                    item_type: tr.dataset.itemType || 'inventory',
                    description: tr.querySelector('.si-description').value,
                    pieces: tr.querySelector('.pieces').value,
                    qty: tr.querySelector('.qty').value,
                    unit: tr.querySelector('.si-unit').value,
                    rate: tr.querySelector('.rate').value,
                    val_excl_tax: tr.querySelector('.val-excl').value,
                    tax_rate: tr.querySelector('.tax-rate').value,
                    tax_amount: tr.querySelector('.tax-amt').value,
                    further_tax_rate: tr.querySelector('.frth-rate').value,
                    further_tax_amount: tr.querySelector('.frth-amt').value,
                    val_incl_tax: tr.querySelector('.val-incl').value
                });
            }
        });

        if (items.length === 0) { alert("Please add at least one item."); return; }

        const payload = {
            id: this.currentId,
            serial_no: document.getElementById('so_sn').value,
            date: document.getElementById('so_date').value,
            delivery_date: document.getElementById('so_delivery_date').value,
            terms_of_payment: document.getElementById('so_payment_terms').value,
            job_id: document.getElementById('so_job_ref').value || null,
            employee_id: document.getElementById('so_employee_ref').value || null,
            customer_coa_id: this.selectedCustomerCoaId,
            customer_address: document.getElementById('customer_address').value,
            customer_telephone: document.getElementById('customer_tel').value,
            customer_ntn: document.getElementById('customer_ntn').value,
            customer_gst: document.getElementById('customer_gst').value,
            customer_order_ref: document.getElementById('so_customer_order_ref').value,
            total_pieces: document.getElementById('tot_pieces').value,
            total_qty: document.getElementById('tot_qty').value,
            total_excl_tax: document.getElementById('tot_excl').value,
            total_tax_amount: document.getElementById('tot_tax').value,
            total_further_tax: document.getElementById('tot_further').value,
            total_amount: document.getElementById('tot_incl').value,
            amount_words: document.getElementById('so_amt_words').innerText,
            remarks: document.getElementById('so_remarks').value,
            is_cancelled: document.getElementById('so_is_cancelled').checked ? 1 : 0,
            converted_to_dc: document.getElementById('so_converted_dc_no') ? parseInt(document.getElementById('so_converted_dc_no').getAttribute('data-sn') || 0) : 0,
            converted_to_invtax: document.getElementById('so_converted_invtax_no') ? parseInt(document.getElementById('so_converted_invtax_no').getAttribute('data-sn') || 0) : 0,
            converted_to_invnontax: document.getElementById('so_converted_invnontax_no') ? parseInt(document.getElementById('so_converted_invnontax_no').getAttribute('data-sn') || 0) : 0,
            items: items
        };

        try {
            const res = await fetch(`api/sale_order.php?action=save_sale_order&company_id=${companyId}`, {
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
        let toast = document.getElementById('so_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'so_toast';
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
        let sn = parseInt(document.getElementById('so_sn').value) || 0;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/sale_order.php?action=get_next_serial_no&company_id=${companyId}`);
                const data = await res.json();
                sn = (data.next_no || 2) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/sale_order.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    sn = (data.next_no || 2) - 1;
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

        if (sn < 1 && dir !== 'next' && dir !== 'prev') return; // Silent â€” already at first

        try {
            let url = `api/sale_order.php?action=get_sale_order&serial_no=${sn}&company_id=${companyId}`;
            if (dir === 'next' || dir === 'prev') url += `&dir=${dir}`;
            const res = await fetch(url);
            const po = await res.json();
            if (po && po.id) {
                this.loadSOData(po);
            } else {
                if (dir === 'next' || dir === 'last') {
                    // At last record â€” stay, show toast
                    this.showToast('You are on the last record');
                } else if (dir === 'prev') {
                    this.showToast('You are on the first record');
                } else {
                    // Prev with no record at this SN â€” show blank with SN
                    await this.resetForm(false);
                    document.getElementById('so_sn').value = sn;
                    document.getElementById('so_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation Error:", e); }
    },

    deleteSO: async function() {
        if (!this.currentId) {
            alert("No Sale Order loaded to delete.");
            return;
        }
        
        if (!confirm("Are you sure you want to delete this Sale Order? This action cannot be undone.")) {
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/sale_order.php?action=delete_sale_order&id=${this.currentId}&company_id=${companyId}`, {
                method: 'POST'
            });
            const result = await res.json();
            
            if (result.status === 'success') {
                alert("Sale Order deleted successfully.");
                this.resetForm(true);
            } else {
                alert("Error deleting PO: " + (result.message || 'Unknown error'));
            }
        } catch (e) {
            console.error("Delete PO Error:", e);
            alert("Failed to delete Sale Order.");
        }
    },

    openPrintSettings: function() {
        const paper = localStorage.getItem('so_sett_paper') || 'A4';
        const printTax = localStorage.getItem('so_sett_print_tax') || '0';
        const printHs = localStorage.getItem('so_sett_print_hs') || '0';
        const noHeader = localStorage.getItem('so_sett_no_header') || '0';
        
        const paperRadios = document.getElementsByName('so_print_paper');
        for (let r of paperRadios) { if (r.value === paper) r.checked = true; }
        
        if (printTax === '1') document.getElementById('so_sett_print_tax').checked = true;
        else document.getElementById('so_sett_no_print_tax').checked = true;

        if (printHs === '1') document.getElementById('so_sett_print_hs').checked = true;
        else document.getElementById('so_sett_no_print_hs').checked = true;
        
        document.getElementById('so_sett_no_header').checked = (noHeader === '1');
        
        const modal = document.getElementById('soPrintSettingsModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    savePrintSettings: function() {
        const paperRadios = document.getElementsByName('so_print_paper');
        let paper = 'A4';
        for (let r of paperRadios) { if (r.checked) paper = r.value; }
        
        const printTax = document.getElementById('so_sett_print_tax').checked ? '1' : '0';
        const printHs = document.getElementById('so_sett_print_hs').checked ? '1' : '0';
        const noHeader = document.getElementById('so_sett_no_header').checked ? '1' : '0';
        
        localStorage.setItem('so_sett_paper', paper);
        localStorage.setItem('so_sett_print_tax', printTax);
        localStorage.setItem('so_sett_print_hs', printHs);
        localStorage.setItem('so_sett_no_header', noHeader);
        
        document.getElementById('soPrintSettingsModal').style.display = 'none';
    },

    printSO: async function() {
        if (!this.currentId) {
            alert("Please save or load a Sale Order before printing.");
            return;
        }

        const noHeader = localStorage.getItem('so_sett_no_header') === '1';
        const paperSize = localStorage.getItem('so_sett_paper') || 'A4';
        const printTax = localStorage.getItem('so_sett_print_tax') === '1';
        const printHs = localStorage.getItem('so_sett_print_hs') === '1';

        // Open window synchronously to avoid popup blockers!
        let printWindow = window.open('', '_blank');
        if(printWindow) printWindow.document.write('<div style="font-family:sans-serif; padding: 20px;">Preparing Print... Please wait.</div>');

        const sn = document.getElementById('so_sn').value;
        const poDate = document.getElementById('so_date').value;
        const delDate = document.getElementById('so_delivery_date').value;
        const payTerms = document.getElementById('so_payment_terms').value;
        
        const vCode = document.getElementById('customer_code').value;
        const vName = document.getElementById('customer_name').value;
        const vAddress = document.getElementById('customer_address').value;
        const vTel = document.getElementById('customer_tel').value;

        const totPieces = document.getElementById('tot_pieces').value;
        const totQty = document.getElementById('tot_qty').value;
        const totIncl = document.getElementById('tot_incl').value;
        const amtWords = document.getElementById('so_amt_words').innerText;
        const remarks = document.getElementById('so_remarks').value;
        const terms = document.getElementById('so_terms') ? document.getElementById('so_terms').value : '';
        const addedBy = document.getElementById('soFindAddedBy') ? document.getElementById('soFindAddedBy').value : '';

        // Collect items
        
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
        
        let itemsHtml = '';
        document.querySelectorAll('#soGridBody tr').forEach((tr, index) => {
            const code = tr.querySelector('.item-code-search').value;
            if (!code) return; // Skip empty rows
            
            const hsCode = tr.querySelector('.hs-code') ? tr.querySelector('.hs-code').value : '';
            const desc = tr.cells[3] ? tr.cells[3].querySelector('input').value : '';
            const pieces = tr.querySelector('.pieces') ? tr.querySelector('.pieces').value : '';
            const qty = tr.querySelector('.qty') ? tr.querySelector('.qty').value : '';
            const unit = tr.cells[6] ? tr.cells[6].querySelector('input').value : '';
            const rate = tr.querySelector('.rate') ? tr.querySelector('.rate').value : '';
            const valExcl = tr.querySelector('.val-excl') ? tr.querySelector('.val-excl').value : '';
            const taxAmt = tr.querySelector('.tax-amt') ? tr.querySelector('.tax-amt').value : '';
            const valIncl = tr.querySelector('.val-incl') ? tr.querySelector('.val-incl').value : '';
            
            if (printTax) {
                itemsHtml += `
                    <tr>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${index + 1}</td>
                        ${printHs ? `<td style="border:1px solid #000; padding:4px;">${hsCode}</td>` : ''}
                        <td style="border:1px solid #000; padding:4px;">${desc}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${pieces}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${qty} ${unit}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:right;">${rate}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:right;">${valExcl}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:right;">${taxAmt}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:right;">${valIncl}</td>
                    </tr>
                `;
            } else {
                itemsHtml += `
                    <tr>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${index + 1}</td>
                        ${printHs ? `<td style="border:1px solid #000; padding:4px;">${hsCode}</td>` : ''}
                        <td style="border:1px solid #000; padding:4px;">${desc}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${pieces}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${qty} ${unit}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:right;">${rate}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:right;">${valIncl}</td>
                    </tr>
                `;
            }
        });
        
        let headerHtml = '';
        if (noHeader) {
            headerHtml = `
                <div style="text-align: center; margin-bottom: 15px; margin-top: 100px;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #000; text-transform: uppercase;">Sale Order</h3>
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
                        <h3>Sale Order</h3>
                    </div>
                </div>
                <hr style="border: 0; border-top: 2px solid #000; margin-bottom: 15px;">
            `;
        }

        const html = `
            <html>
            <head>
                <title>SALE ORDER - ${sn}</title>
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
                            <b>Customer Details:</b><br>
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
                            ${printHs ? '<th>HS Code</th>' : ''}
                            <th>Description</th>
                            <th>Pieces</th>
                            <th>Quantity</th>
                            <th>Rate</th>
                            ${printTax ? `
                                <th>Value Excl.</th>
                                <th>Tax Amt</th>
                            ` : ''}
                            <th>Value Incl.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <th colspan="${printHs ? '3' : '2'}" style="text-align:right; border:1px solid #000;">TOTALS:</th>
                            <th style="border:1px solid #000; text-align:center;">${totPieces}</th>
                            <th style="border:1px solid #000; text-align:center;">${totQty}</th>
                            <th style="border:1px solid #000;"></th>
                            ${printTax ? `
                                <th style="border:1px solid #000;"></th>
                                <th style="border:1px solid #000;"></th>
                            ` : ''}
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
                        Prepared By: ${addedBy || session.username || 'Administrator'}
                        <br>
                        <span style="font-size: 10px; color: #666;">Printed By: ${session.username || 'Administrator'}</span>
                    </div>
                </div>
            </body>
            </html>
        `;

        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
                // Since this was async, we need a slight delay to ensure the DOM and images render
                setTimeout(() => {
                    printWindow.print();
                }, 500);
            }
        },

    updateSuggestHighlight: function(items) {
        items.forEach((item, idx) => {
            if (idx === this.suggestIndex) {
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
    }
};

// Global entry point for ERP modular popup system
window.initSaleOrderModule = function() {
    console.log("PO Module: Global Init called");
    if (window.SaleOrderModule) window.SaleOrderModule.init();
};

if (document.getElementById('saleOrderContainer') && window.SaleOrderModule) {
    setTimeout(() => window.SaleOrderModule.init(), 50);
}
