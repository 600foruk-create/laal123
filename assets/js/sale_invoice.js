window.SIModule = {
    customers: [],
    inventory: [],
    currentMatches: [],
    employees: [],
    jobs: [],
    locations: [],
    currentId: null,
    suggestIndex: -1,
    lastSaved: null,

    customSettings: null,

    loadCustomSettings: async function() {
        let settings = null;
        try {
            const local = localStorage.getItem('sale_invoice_custom_settings');
            if (local) settings = JSON.parse(local);
        } catch(e) {}

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            const res = await fetch(`api/settings.php?action=get_setting&key=sale_invoice_custom_settings&company_id=${coId}&_t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.value) {
                    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                    if (parsed && typeof parsed === 'object') {
                        settings = parsed;
                        localStorage.setItem('sale_invoice_custom_settings', JSON.stringify(settings));
                    }
                }
            }
        } catch(e) {}

        this.customSettings = this.mergeDefaultCustomSettings(settings);
        return this.customSettings;
    },

    mergeDefaultCustomSettings: function(userSettings) {
        const defaults = {
            columns: {
                hs_code: true,
                description: true,
                unit: true,
                rate: true,
                gross_amt: true,
                disc_perc: true,
                disc_amt: true,
                sales_tax: true,
                further_tax: true,
                net_amt: true
            },
            categories: {
                'PVC PIPE': {
                    col1: { show: true, label: 'PCS' },
                    col2: { show: true, label: 'LENGTH' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Kgs',
                    rate_basis: 'col3',
                    type: 'pipe'
                },
                'PVC FITTING': {
                    col1: { show: true, label: 'CTN' },
                    col2: { show: true, label: 'PCS' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Ctn',
                    rate_basis: 'col2',
                    type: 'fitting'
                },
                'HDPE PIPE': {
                    col1: { show: true, label: 'PCS' },
                    col2: { show: true, label: 'LENGTH' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Mtr',
                    rate_basis: 'col2',
                    type: 'pipe'
                },
                'PPRC PIPE': {
                    col1: { show: true, label: 'PCS' },
                    col2: { show: true, label: 'LENGTH' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Pcs',
                    rate_basis: 'col1',
                    type: 'pipe'
                },
                'GENERAL': {
                    col1: { show: true, label: 'QTY' },
                    col2: { show: false, label: 'COL 2' },
                    col3: { show: false, label: 'COL 3' },
                    default_unit: 'Pcs',
                    rate_basis: 'col1',
                    type: 'general'
                }
            }
        };

        if (!userSettings) return defaults;
        return {
            columns: Object.assign({}, defaults.columns, userSettings.columns || {}),
            categories: Object.assign({}, defaults.categories, userSettings.categories || {})
        };
    },

    applyCustomSettings: function() {
        if (!this.customSettings) this.customSettings = this.mergeDefaultCustomSettings();
        const cols = this.customSettings.columns || {};
        
        let css = '';
        if (cols.hs_code === false) css += '.si-col-hs { display: none !important; }\n';
        if (cols.description === false) css += '.si-col-desc { display: none !important; }\n';
        if (cols.unit === false) css += '.si-col-unit { display: none !important; }\n';
        if (cols.rate === false) css += '.si-col-rate { display: none !important; }\n';
        if (cols.gross_amt === false) css += '.si-col-gross { display: none !important; }\n';
        if (cols.disc_perc === false) css += '.si-col-disc-pct { display: none !important; }\n';
        if (cols.disc_amt === false) css += '.si-col-disc-amt { display: none !important; }\n';
        if (cols.sales_tax === false) css += '.si-col-stax { display: none !important; }\n';
        if (cols.further_tax === false) css += '.si-col-ftax { display: none !important; }\n';
        if (cols.net_amt === false) css += '.si-col-net { display: none !important; }\n';

        let styleEl = document.getElementById('si_custom_grid_css');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'si_custom_grid_css';
            document.head.appendChild(styleEl);
        }
        styleEl.innerHTML = css;

        this.updateLeadColspans();
    },

    updateLeadColspans: function() {
        if (!this.customSettings) this.customSettings = this.mergeDefaultCustomSettings();
        const cols = this.customSettings.columns || {};
        // Lead columns are: # (always visible), Item Code (always visible), HS Code, Description, Unit
        let span = 2;
        if (cols.hs_code !== false) span++;
        if (cols.description !== false) span++;
        if (cols.unit !== false) span++;

        document.querySelectorAll('.si-lead-cell').forEach(td => {
            td.colSpan = span;
        });
    },

    init: async function(preventAutoLoad = false) {
        console.log("SI Module: Initializing...");
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const r = await fetch(`api/settings.php?action=get_setting&key=default_sale_invoice&company_id=${companyId}`);
            const data = await r.json();
            const isTaxEl = document.getElementById('si_is_tax');
            if (isTaxEl) {
                isTaxEl.checked = (data.value === 'tax');
            }
        } catch(e) {}

        // Load Invoice Custom Grid Settings
        try {
            await this.loadCustomSettings();
            this.applyCustomSettings();
        } catch(e) {}
        // Load Print Settings from DB if available
        try {
            const rPrint = await fetch(`api/settings.php?action=get_setting&key=sale_invoice_print_settings&company_id=${companyId}`);
            if (rPrint.ok) {
                const dataPrint = await rPrint.json();
                if (dataPrint && dataPrint.value) {
                    const parsedPrint = typeof dataPrint.value === 'string' ? JSON.parse(dataPrint.value) : dataPrint.value;
                    if (parsedPrint) {
                        localStorage.setItem('sale_invoice_print_settings', JSON.stringify(parsedPrint));
                        if (parsedPrint.paper) localStorage.setItem('si_sett_paper', parsedPrint.paper);
                        if (parsedPrint.printTax !== undefined) localStorage.setItem('si_sett_print_tax', parsedPrint.printTax);
                        if (parsedPrint.printHs !== undefined) localStorage.setItem('si_sett_print_hs', parsedPrint.printHs);
                        if (parsedPrint.printDisc !== undefined) localStorage.setItem('si_sett_print_disc', parsedPrint.printDisc);
                        if (parsedPrint.noHeader !== undefined) localStorage.setItem('si_sett_no_headers', parsedPrint.noHeader);
                    }
                }
            }
        } catch(e) {}

        // 1. Reset form immediately to show grid lines
        this.resetForm(!preventAutoLoad);
        
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

        const cancelCb = document.getElementById('si_is_cancelled');
        if (cancelCb) cancelCb.addEventListener('change', () => this.toggleCancelledStamp());
        
        const footerInputs = ['si_add_disc', 'si_freight', 'si_paid'];
        footerInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    if (id === 'si_paid') {
                        el.dataset.userEdited = 'true';
                        el.dataset.autoFilled = 'false';
                    }
                    this.calculateTotals();
        this.updateLeadColspans();
                });
            }
        });
        
        const postBtn = document.getElementById('si_post_btn');
        if (postBtn) postBtn.addEventListener('click', () => this.togglePost());
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#si_emp_wrapper')) {
                const ed = document.getElementById('si_emp_dropdown');
                if (ed) ed.style.display = 'none';
            }
            if (!e.target.closest('#si_job_wrapper')) {
                const jd = document.getElementById('si_job_dropdown');
                if (jd) jd.style.display = 'none';
            }
            if (!e.target.closest('#si_location_wrapper')) {
                const ld = document.getElementById('si_location_dropdown');
                if (ld) ld.style.display = 'none';
            }
        });
    },

    toggleCancelledStamp: function() {
        const checkbox = document.getElementById('si_is_cancelled');
        const stamp = document.getElementById('si_cancelled_stamp');
        if (checkbox && stamp) {
            stamp.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    loadCustomers: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            // Fetch ALL customers regardless of sub_id using the unified API
            const res = await fetch(`api/sale_order.php?action=get_customers_and_vendors&company_id=${companyId}&_cb=${Date.now()}`);
            const data = await res.json();
            
            if (Array.isArray(data) && data.length > 0) {
                this.customers = data.filter(c => c.type === 'customer').map(c => ({
                    ...c,
                    st_reg_no: c.gst_reg_no,
                    ntn_cnic: c.ntn,
                    sales_tax_rate: c.sales_tax_rate !== undefined ? parseFloat(c.sales_tax_rate) : 0,
                    further_tax_rate: c.further_tax_rate !== undefined ? parseFloat(c.further_tax_rate) : 0
                }));
            }
        } catch (e) { console.error("SI Module: Load Customers Error:", e); }

        // Comprehensive Fallback: if this.customers is empty or failed, fetch from digital_invoice metadata
        if (!this.customers || this.customers.length === 0) {
            try {
                const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
                const dataMeta = await resMeta.json();
                if (dataMeta && Array.isArray(dataMeta.customers) && dataMeta.customers.length > 0) {
                    this.customers = dataMeta.customers.map(c => ({
                        id: c.coa_id || c.customer_id,
                        code: c.customer_code,
                        name: c.customer_name,
                        address: c.address || '',
                        telephone: c.telephone || '',
                        ntn: c.ntn_cnic || c.cnic || '',
                        gst_reg_no: c.st_reg_no || '',
                        st_reg_no: c.st_reg_no || '',
                        ntn_cnic: c.ntn_cnic || c.cnic || '',
                        sales_tax_rate: parseFloat(c.sales_tax_rate) || 0,
                        further_tax_rate: parseFloat(c.further_tax_rate) || 0,
                        tax_rate: parseFloat(c.wht_rate) || 0,
                        wht_type: c.wht_type || ''
                    }));
                }
            } catch (errFallback) { console.error("SI Module: Customers Fallback Error:", errFallback); }
        }
    },

    loadInventory: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                this.inventory = data;
                window.allInventoryItems = data;
                return this.inventory;
            }
        } catch (e) { console.error("SI Module: Load Inventory Error:", e); }

        if (typeof window.loadSharedERPInventory === 'function') {
            this.inventory = await window.loadSharedERPInventory();
            if (this.inventory && this.inventory.length > 0) return this.inventory;
        }

        // Comprehensive Fallback or Catalog Enrichment from digital_invoice metadata
        try {
            const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
            const dataMeta = await resMeta.json();
            if (dataMeta && Array.isArray(dataMeta.items) && dataMeta.items.length > 0) {
                this.inventory = dataMeta.items.map(i => ({
                    id: i.id,
                    code: i.code,
                    item_code: i.code,
                    name: i.name,
                    item_name: i.name,
                    description: i.description || i.name,
                    hs_code: i.hs_code || '3917.2390',
                    unit: i.unit || 'Pcs',
                    sales_price: parseFloat(i.selling_price || 0),
                    selling_price: parseFloat(i.selling_price || 0),
                    qty_per_piece: parseFloat(i.qty_per_piece || 0),
                    tax_rate: parseFloat(i.tax_rate || 18.00),
                    category_name: i.category_type || 'Inventory',
                    category_type: i.category_type || '',
                    pipe_sub_type: i.pipe_sub_type || '',
                    pipe_length: parseFloat(i.pipe_length || 0),
                    length: i.length || '',
                    length_unit: i.length_unit || 'ft',
                    billing_mode: i.billing_mode || '',
                    unit_weight: (!isNaN(parseFloat(i.unit_weight)) && parseFloat(i.unit_weight) > 0) ? parseFloat(i.unit_weight) : 0,
                    carton: parseFloat(i.carton || 0),
                    pcs_per_carton: parseFloat(i.pcs_per_carton || i.carton || 0)
                }));
                window.allInventoryItems = this.inventory;
            }
        } catch (errFallback) { console.error("SI Module: Inventory Fallback Error:", errFallback); }
        return this.inventory || [];
    },

    loadEmployees: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            this.employees = await res.json();
            const select = document.getElementById('si_emp_dropdown');
            if (select) {
                select.innerHTML = `<div class="si-suggest-item" onclick="document.getElementById('si_emp_ref').value=''; document.getElementById('si_emp_text').innerText='Select Employee'; this.parentElement.style.display='none';">Select Employee</div>`;
                this.employees.forEach(e => {
                    if (!e.name || !e.name.trim()) return;
                    const cleanName = e.name.trim();
                    const safeName = cleanName.replace(/'/g, "\\'");
                    select.innerHTML += `<div class="si-suggest-item" onclick="document.getElementById('si_emp_ref').value='${e.id}'; document.getElementById('si_emp_text').innerText='${safeName}'; this.parentElement.style.display='none';">${cleanName}</div>`;
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
            const select = document.getElementById('si_job_dropdown');
            if (select) {
                select.innerHTML = `<div class="si-suggest-item" onclick="document.getElementById('si_job_desc').value=''; document.getElementById('si_job_text').innerText='Select Job'; this.parentElement.style.display='none';">Select Job</div>`;
                this.jobs.forEach(j => {
                    if (!j.job_no && !j.description) return;
                    const jobDesc = `${j.job_no || ''} - ${j.description || ''}`.trim();
                    const safeDesc = jobDesc.replace(/'/g, "\\'");
                    select.innerHTML += `<div class="si-suggest-item" onclick="document.getElementById('si_job_desc').value='${j.id}'; document.getElementById('si_job_text').innerText='${safeDesc}'; this.parentElement.style.display='none';">${jobDesc}</div>`;
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
            const el = document.getElementById('si_location_dropdown');
            if (el) {
                el.innerHTML = `<div class="si-suggest-item" onclick="document.getElementById('si_location').value=''; document.getElementById('si_location_text').innerText='Select Location'; this.parentElement.style.display='none';">Select Location</div>`;
                this.locations.forEach(l => {
                    const safeName = (l.name || '').replace(/'/g, "\\'");
                    el.innerHTML += `<div class="si-suggest-item" onclick="document.getElementById('si_location').value='${l.id}'; document.getElementById('si_location_text').innerText='${safeName}'; this.parentElement.style.display='none';">${l.name}</div>`;
                });
                
                // Set default to Main Store on first load if not already set
                let defaultLoc = this.locations.find(l => l.name && l.name.toLowerCase().includes('main store')) || this.locations[0];
                if (defaultLoc && !document.getElementById('si_location').value) {
                    document.getElementById('si_location').value = defaultLoc.id;
                    document.getElementById('si_location_text').innerText = defaultLoc.name;
                }
            }
        } catch (e) {}
    },

    setupKeyboardShortcuts: function() {
        const gridBody = document.getElementById('siGridBody');
        if (gridBody) {
            gridBody.addEventListener('keydown', (e) => this.handleGridKeyDown(e));
            gridBody.addEventListener('click', (e) => {
                // ONLY select row when clicking directly on the row number cell (#)
                const numCell = e.target.closest('.row-num, .row-selector');
                if (numCell) {
                    const tr = numCell.closest('tr.si-item-row');
                    if (tr && tr.dataset.coaId && !tr.classList.contains('si-empty-row')) {
                        const tbody = document.getElementById('siGridBody');
                        const alreadySelected = tr.classList.contains('selected-row');
                        tbody.querySelectorAll('tr.si-item-row').forEach(r => r.classList.remove('selected-row'));
                        this.reindexRows();
                        if (!alreadySelected) {
                            tr.classList.add('selected-row');
                            numCell.innerHTML = '&#9654;';
                        }
                    }
                }
            });
        }
        
        document.addEventListener('click', (e) => {
            const isGridClick = e.target.closest('#siGrid');
            if (!isGridClick) {
                const tbody = document.getElementById('siGridBody');
                if (tbody) {
                    const hasSelected = tbody.querySelector('tr.si-item-row.selected-row');
                    if (hasSelected) {
                        tbody.querySelectorAll('tr.si-item-row').forEach(r => r.classList.remove('selected-row'));
                        this.reindexRows();
                    }
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveInvoice();
            } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const selectedRow = document.querySelector('#siGridBody > tr.si-item-row.selected-row');
                if (selectedRow) {
                    this.deleteCategoryRow(selectedRow);
                }
            }
            
            const activeIds = ['si_location_display', 'si_job_display', 'si_emp_display'];
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
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;
        const catHeaders = tbody.querySelectorAll('tr.si-cat-header-row');
        catHeaders.forEach(h => {
            const catKey = h.dataset.categoryKey;
            this.renumberCategoryItems(catKey);
        });
        this.renumberCategories();
        this.renumberEmptyRows();
    },

    handleGridKeyDown: function(e) {
        const target = e.target;
        if (!target.classList.contains('grid-input')) return;

        const tr = target.closest('tr');
        const gridBody = document.getElementById('siGridBody');
        const suggest = tr ? (tr._suggestBox || tr.querySelector('.grid-suggest') || document.querySelector(`.grid-suggest[data-tr-index="${tr.dataset.index}"]`)) : null;

        // Handle suggestion box keyboard nav
        if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
            const items = suggest.querySelectorAll('.suggest-item');
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
            } else if (e.key === 'Enter') {
                if (this.suggestIndex > -1) {
                    e.preventDefault();
                    this.selectGridItem(tr.dataset.index, this.suggestIndex, tr);
                    return;
                } else if (items.length > 0) {
                    e.preventDefault();
                    this.selectGridItem(tr.dataset.index, 0, tr);
                    return;
                }
            }
        }

        // Grid Navigation skipping category headers & subtotals
        const getVisibleRowInputs = (row) => Array.from(row.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
        const rowInputs = getVisibleRowInputs(tr);
        const colIdx = rowInputs.indexOf(target);

        const getNextNavRow = (currentTr, forward = true) => {
            let next = forward ? currentTr.nextElementSibling : currentTr.previousElementSibling;
            while (next && (next.classList.contains('si-cat-header-row') || next.classList.contains('si-cat-subtotal-row'))) {
                next = forward ? next.nextElementSibling : next.previousElementSibling;
            }
            return next;
        };

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
            const nextTr = getNextNavRow(tr, true);
            if (nextTr) {
                const nextRowInputs = getVisibleRowInputs(nextTr);
                if (nextRowInputs[colIdx]) {
                    nextRowInputs[colIdx].focus();
                    nextRowInputs[colIdx].select();
                } else if (nextRowInputs[0]) {
                    nextRowInputs[0].focus();
                    nextRowInputs[0].select();
                }
            } else {
                this.ensureDefaultRows(40);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
            const prevTr = getNextNavRow(tr, false);
            if (prevTr) {
                const prevRowInputs = getVisibleRowInputs(prevTr);
                if (prevRowInputs[colIdx]) {
                    prevRowInputs[colIdx].focus();
                    prevRowInputs[colIdx].select();
                } else if (prevRowInputs[0]) {
                    prevRowInputs[0].focus();
                    prevRowInputs[0].select();
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }

            const isTax = document.getElementById('si_is_tax')?.checked;

            const focusInput = (inp) => {
                if (inp && inp.offsetParent !== null && !inp.readOnly) {
                    inp.focus();
                    inp.select();
                    return true;
                }
                return false;
            };

            const goToNextRow = () => {
                let nextTr = getNextNavRow(tr, true);
                if (!nextTr) {
                    this.ensureDefaultRows(40);
                    nextTr = getNextNavRow(tr, true);
                }
                if (nextTr) {
                    const nextCode = nextTr.querySelector('.item-code-search');
                    if (nextCode) {
                        nextCode.focus();
                        nextCode.select();
                    }
                }
            };

            // 1. If currently in Item Code, HS Code, or Description -> Jump to PCS (col-qty1)
            if (target.classList.contains('item-code-search') || target.classList.contains('hs-code') || target.classList.contains('si-description')) {
                if (focusInput(tr.querySelector('.col-qty1'))) return;
                if (focusInput(tr.querySelector('.rate'))) return;
            }

            // 2. If currently in PCS (col-qty1) or any quantity input (col-qty2, col-qty3) -> Jump directly to RATE
            if (target.classList.contains('col-qty1') || target.classList.contains('col-qty2') || target.classList.contains('col-qty3') || target.classList.contains('pieces')) {
                if (focusInput(tr.querySelector('.rate'))) return;
                if (focusInput(tr.querySelector('.disc-perc'))) return;
            }

            // 3. If currently in RATE -> Jump directly to DISC %
            if (target.classList.contains('rate')) {
                if (focusInput(tr.querySelector('.disc-perc'))) return;
                if (isTax && focusInput(tr.querySelector('.stax-rate'))) return;
                goToNextRow();
                return;
            }

            // 4. If currently in DISC % (or DISC AMOUNT)
            if (target.classList.contains('disc-perc') || target.classList.contains('disc-amt')) {
                if (isTax) {
                    // Tax Invoice: Jump to SALES TAX %
                    if (focusInput(tr.querySelector('.stax-rate'))) return;
                    if (focusInput(tr.querySelector('.ftax-rate'))) return;
                }
                // Non-Tax Invoice: Jump to next row Item Code!
                goToNextRow();
                return;
            }

            // 5. If currently in SALES TAX % (or SALES TAX AMOUNT) -> Jump directly to FURTHER TAX %
            if (target.classList.contains('stax-rate') || target.classList.contains('stax-amt')) {
                if (focusInput(tr.querySelector('.ftax-rate'))) return;
                goToNextRow();
                return;
            }

            // 6. If currently in FURTHER TAX % (or FURTHER TAX AMOUNT, NET AMOUNT, VALUE INCL TAX) -> Jump to Next Row Item Code!
            if (target.classList.contains('ftax-rate') || target.classList.contains('ftax-amt') || target.classList.contains('val-incl') || target.classList.contains('net-amt')) {
                goToNextRow();
                return;
            }

            // Fallback: move to next available input or next row
            const nextInp = rowInputs[colIdx + 1];
            if (focusInput(nextInp)) return;
            goToNextRow();
        }
    },

    setupCustomerSearch: function() {
        const input = document.getElementById('si_cust_code');
        const suggest = document.getElementById('si_cust_suggest');
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

        input.oninput = async (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (!val) { suggest.style.display = 'none'; return; }

            if (!this.customers || this.customers.length === 0) {
                await this.loadCustomers();
            }
            
            const searchWords = val.split(/\s+/);
            const matches = (this.customers || []).filter(v => {
                const code = v.code || v.customer_code || '';
                const name = v.name || v.customer_name || '';
                const address = v.address || '';
                const searchStr = `${code} ${name} ${address}`.toLowerCase();
                return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
            }).slice(0, 50);

            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.map(v => 
                    `<div onclick="window.SIModule.selectCustomer(${v.id || v.coa_id})">
                        <b>${v.code || v.customer_code}</b> &nbsp; ${v.name || v.customer_name}
                    </div>`
                ).join('');
                suggest.style.position = 'absolute';
                suggest.style.top = '100%';
                suggest.style.left = '0';
                suggest.style.width = '100%';
                suggest.style.minWidth = '420px';
                suggest.style.display = 'block';
                suggest.style.zIndex = '999999';
            } else { suggest.style.display = 'none'; }
        };
        document.addEventListener('click', (e) => { if (e.target !== input && !suggest.contains(e.target)) suggest.style.display = 'none'; });
    },

    selectCustomer: async function(coaId) {
        const v = this.customers.find(x => x.id == coaId || x.coa_list_id == coaId);
        if (v) {
            this.selectedCustomer = v;
            document.getElementById('si_cust_code').value = v.code;
            document.getElementById('si_cust_code').dataset.coaId = v.id;
            document.getElementById('si_cust_name').value = v.name;
            document.getElementById('si_cust_address').value = v.address || '';
            document.getElementById('si_cust_phone').value = v.telephone || '';
            document.getElementById('si_cust_gst').value = v.st_reg_no || '';
            document.getElementById('si_cust_ntn').value = v.ntn_cnic || '';
            document.getElementById('si_cust_code').dataset.cnic = v.cnic || (v.ntn_cnic && (v.ntn_cnic.length === 13 || v.ntn_cnic.includes('-')) ? v.ntn_cnic : '');

            // Walk-in Customer (12001001) is cash-based: auto-fill payment terms
            if (v.code === '12001001') {
                const payTermsEl = document.getElementById('si_payment_terms');
                if (payTermsEl) payTermsEl.value = 'Cash';
            }

            // Load customer-specific customized pricing
            this.customerPricesMap = {};
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const compId = session.company_id || 1;
                const pRes = await fetch(`api/price_management.php?action=get_customer_price_list&company_id=${compId}&customer_id=${v.id || v.coa_list_id}&_t=${Date.now()}`);
                const pData = await pRes.json();
                if (pData.status === 'success' && Array.isArray(pData.customer_prices)) {
                    pData.customer_prices.forEach(cp => {
                        this.customerPricesMap[cp.item_id] = parseFloat(cp.custom_price);
                    });
                }
            } catch (cpErr) {}

            const custStRate = v.sales_tax_rate !== undefined && v.sales_tax_rate !== null ? parseFloat(v.sales_tax_rate) : 0;
            const custFtRate = v.further_tax_rate !== undefined && v.further_tax_rate !== null ? parseFloat(v.further_tax_rate) : 0;

            const isTaxEl = document.getElementById('si_is_tax');
            if (isTaxEl && !isTaxEl.checked && (custStRate > 0 || custFtRate > 0)) {
                isTaxEl.checked = true;
                this.toggleTaxMode(false);
            }

            // Apply rates to all rows currently in the grid
            const rows = document.querySelectorAll('#siGridBody tr');
            rows.forEach(r => {
                const stInput = r.querySelector('.stax-rate');
                const ftInput = r.querySelector('.ftax-rate');
                if (stInput) stInput.value = custStRate.toFixed(2);
                if (ftInput) ftInput.value = custFtRate.toFixed(2);
                const itemCode = r.querySelector('.item-code-search')?.value.trim();
                if (itemCode) {
                    this.calculateRow(r);
                }
            });
            this.calculateTotals();
        this.updateLeadColspans();
            
            if (document.getElementById('si_cust_tax_pct')) {
                const taxRate = parseFloat(v.tax_rate || 0);
                document.getElementById('si_cust_tax_pct').value = taxRate;
                const whtType = v.wht_type || 'WHT-236G/236H';
                if (document.getElementById('si_cust_tax_wht')) {
                    document.getElementById('si_cust_tax_wht').value = whtType;
                }
                if (document.getElementById('si_cust_tax_lbl')) {
                    let displayWht = whtType;
                    if (whtType !== 'WHT-236G/236H' && !whtType.toUpperCase().includes('WHT')) {
                        displayWht = 'WHT ' + whtType;
                    }
                    document.getElementById('si_cust_tax_lbl').innerText = displayWht + ' (' + taxRate + '%)';
                }
                setTimeout(() => this.calculateTotals(), 100);
            }
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const targetCoaId = coaId;
                if (targetCoaId) {
                    const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${targetCoaId}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                    const bal = await res.json();
                    const balEl = document.getElementById('si_cust_balance');
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
                    const balEl = document.getElementById('si_cust_balance');
                    if (balEl) { balEl.value = '0.00'; balEl.style.color = '#000'; }
                }
            } catch(e) {
                console.error("Balance fetch error:", e);
                const balEl = document.getElementById('si_cust_balance');
                if (balEl) { balEl.value = '0.00'; balEl.style.color = '#000'; }
            }
        }
        document.getElementById('si_cust_suggest').style.display = 'none';
    },

    setupExpenseSearch: function() {
        const input = document.getElementById('income_name');
        const suggest = document.getElementById('income_suggest');
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
                    `<div onclick="window.SIModule.selectExpense('${c.account_code}', '${c.account_name}')" style="padding:5px; cursor:pointer; border-bottom:1px solid #eee;">
                        <b>${c.account_code}</b> - ${c.account_name}
                    </div>`
                ).join('');
                suggest.style.display = 'block';
            } else { suggest.style.display = 'none'; }
        };
        document.addEventListener('click', (e) => { if (e.target !== input) suggest.style.display = 'none'; });
    },

    selectExpense: function(code, name) {
        document.getElementById('income_code').value = code;
        document.getElementById('income_name').value = name;
        document.getElementById('income_suggest').style.display = 'none';
    },

    updateSuggestHighlight: function(items, tr) {
        items.forEach((item, idx) => {
            if (idx === this.suggestIndex) {
                item.classList.add('active');
                item.style.backgroundColor = 'var(--theme-primary, #1F4E79)';
                item.style.color = 'white';
                item.querySelectorAll('*').forEach(el => el.style.color = 'white');
                const p = item.closest('.grid-suggest') || item.parentElement;
                if (p) {
                    const iTop = item.offsetTop;
                    const iBottom = iTop + item.offsetHeight;
                    if (iTop < p.scrollTop) {
                        p.scrollTop = iTop;
                    } else if (iBottom > p.scrollTop + p.clientHeight) {
                        p.scrollTop = iBottom - p.clientHeight;
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

    showItemDetailsPanel: function(tr, item) {
        // Disabled per user request - clean dropdown only
        this.hideItemDetailsPanel(tr);
    },

    hideItemDetailsPanel: function(tr) {
        document.querySelectorAll('.item-details-panel').forEach(p => p.remove());
    },

    addEmptyRow: function(data = {}) {
        if (data && (data.item_coa_id || data.id || data.code || data.item_code)) {
            return this.addItemRow(data);
        }
        this.ensureDefaultRows(40);
    },

    createEmptyRow: function(rowNum = 1) {
        const tr = document.createElement('tr');
        tr.className = 'si-item-row si-empty-row';
        tr.dataset.empty = 'true';
        tr.dataset.index = 'empty_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        tr.innerHTML = `
            <td class="row-num si-col-num" style="text-align: center; font-size: 10px; color: #64748b; font-weight: bold; cursor: pointer;">${rowNum}</td>
            <td class="si-col-code" style="position: relative;">
                <input type="text" class="grid-input item-code-search" placeholder="">
                <div class="grid-suggest"></div>
            </td>
            <td class="si-col-hs"><input type="text" class="grid-input hs-code"></td>
            <td class="si-col-desc"><input type="text" class="grid-input si-description"></td>
            <td class="si-col-unit">
                <select class="si-unit-select">
                    <option value="Pcs">Pcs</option>
                    <option value="Ctn">Ctn</option>
                    <option value="Feet">Feet</option>
                    <option value="Mtr">Mtr</option>
                    <option value="Kgs">Kgs</option>
                </select>
                <input type="hidden" class="si-unit" value="Pcs">
                <input type="hidden" class="pieces" value="0">
                <input type="hidden" class="qty" value="0">
            </td>
            <td class="si-col-qty1"><input type="text" class="grid-input num col-qty1" value=""></td>
            <td class="si-col-qty2"><input type="text" class="grid-input num col-qty2" value=""></td>
            <td class="si-col-qty3"><input type="text" class="grid-input num col-qty3" value=""></td>
            <td class="si-col-rate"><input type="text" class="grid-input num rate" value=""></td>
            <td class="si-col-gross"><input type="text" class="grid-input num gross-amt val-excl" readonly></td>
            <td class="si-col-disc-pct"><input type="text" class="grid-input num disc-perc" value=""></td>
            <td class="si-col-disc-amt"><input type="text" class="grid-input num disc-amt" value=""></td>
            
            <td class="pi-tax-col si-col-stax si-col-stax-pct" style="display: none;"><input type="text" class="grid-input num stax-rate" value=""></td>
            <td class="pi-tax-col si-col-stax si-col-stax-amt" style="display: none;"><input type="text" class="grid-input num stax-amt" value=""></td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-pct" style="display: none;"><input type="text" class="grid-input num ftax-rate" value=""></td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-amt" style="display: none;"><input type="text" class="grid-input num ftax-amt" value=""></td>
            <td class="pi-tax-col si-col-val-incl" style="display: none;"><input type="text" class="grid-input num val-incl" readonly></td>
            
            <td class="pi-nontax-col si-col-net"><input type="text" class="grid-input num net-amt" readonly></td>
        `;

        this.setupGridEvents(tr);
        return tr;
    },

    ensureDefaultRows: function(targetTotal = 40) {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;

        const filledCount = tbody.querySelectorAll('tr.si-item-row:not(.si-empty-row)').length;
        const currentEmpty = tbody.querySelectorAll('tr.si-empty-row').length;
        const neededEmpty = Math.max(15, targetTotal - filledCount);

        while (tbody.querySelectorAll('tr.si-empty-row').length < neededEmpty) {
            const nextNum = filledCount + tbody.querySelectorAll('tr.si-empty-row').length + 1;
            const newEmpty = this.createEmptyRow(nextNum);
            tbody.appendChild(newEmpty);
        }
        this.renumberEmptyRows();
        this.toggleTaxMode(false);
    },

    getItemCategoryKey: function(data) {
        const catType = (data.category_type || '').toString().trim().toLowerCase();
        const pipeSubType = (data.pipe_sub_type || '').toString().trim().toUpperCase();
        const name = (data.item_name || data.name || data.description || '').toString().toUpperCase();
        const mainCat = (data.main_category_name || data.category_name || '').toString().toUpperCase();

        if (catType === 'fitting' || mainCat.includes('FITTING') || name.includes('FITTING') || name.includes('ELBOW') || name.includes('TEE') || name.includes('SOCKET') || name.includes('UNION') || name.includes('BEND')) {
            return 'PVC FITTING';
        }
        if (catType === 'pipes' || mainCat.includes('PIPE') || name.includes('PIPE')) {
            if (pipeSubType === 'HDPE' || name.includes('HDPE')) {
                return 'HDPE PIPE';
            }
            if (pipeSubType === 'PPRC' || pipeSubType === 'PPR' || name.includes('PPRC') || name.includes('PPR')) {
                return 'PPRC PIPE';
            }
            return 'PVC PIPE';
        }
        if (mainCat && mainCat !== 'INVENTORY' && mainCat !== 'NONE') {
            return mainCat;
        }
        return 'OTHER ITEMS';
    },

    getCategoryConfig: function(catKey) {
        if (!this.customSettings) this.customSettings = this.mergeDefaultCustomSettings();
        const custom = (this.customSettings && this.customSettings.categories) ? this.customSettings.categories[catKey] : null;
        if (custom) {
            return {
                col1: { show: custom.col1?.show !== false, label: custom.col1?.label || 'PCS' },
                col2: { show: custom.col2?.show !== false, label: custom.col2?.label || 'LENGTH' },
                col3: { show: custom.col3?.show !== false, label: custom.col3?.label || 'WEIGHT' },
                defaultUnit: custom.default_unit || 'Pcs',
                units: custom.units || ['Kgs', 'Ctn', 'Pcs', 'Feet', 'Mtr'],
                rateBasis: custom.rate_basis || 'col1',
                type: custom.type || (catKey.includes('FITTING') ? 'fitting' : 'pipe')
            };
        }

        const configs = {
            'PVC PIPE': {
                col1: { show: true, label: 'PCS' },
                col2: { show: true, label: 'LENGTH' },
                col3: { show: true, label: 'WEIGHT' },
                defaultUnit: 'Kgs',
                units: ['Kgs', 'Pcs', 'Feet', 'Mtr'],
                rateBasis: 'col3',
                type: 'pipe'
            },
            'PVC FITTING': {
                col1: { show: true, label: 'CTN' },
                col2: { show: true, label: 'PCS' },
                col3: { show: true, label: 'WEIGHT' },
                defaultUnit: 'Ctn',
                units: ['Ctn', 'Pcs', 'Kgs'],
                rateBasis: 'col2',
                type: 'fitting'
            },
            'HDPE PIPE': {
                col1: { show: true, label: 'PCS' },
                col2: { show: true, label: 'LENGTH' },
                col3: { show: true, label: 'WEIGHT' },
                defaultUnit: 'Mtr',
                units: ['Mtr', 'Pcs', 'Kgs'],
                rateBasis: 'col2',
                type: 'pipe'
            },
            'PPRC PIPE': {
                col1: { show: true, label: 'PCS' },
                col2: { show: true, label: 'LENGTH' },
                col3: { show: true, label: 'WEIGHT' },
                defaultUnit: 'Pcs',
                units: ['Pcs', 'Mtr', 'Feet', 'Kgs'],
                rateBasis: 'col1',
                type: 'pipe'
            }
        };
        return configs[catKey] || {
            col1: { show: true, label: 'PCS' },
            col2: { show: true, label: 'LENGTH' },
            col3: { show: true, label: 'WEIGHT' },
            defaultUnit: 'Pcs',
            units: ['Pcs', 'Kgs', 'Ctn', 'Mtr', 'Feet'],
            rateBasis: 'col1',
            type: 'general'
        };
    },

    extractItemDimensions: function(item, catKey = '') {
        const name = (item.item_name || item.name || item.description || '').toString();
        const catType = (item.category_type || '').toString().toLowerCase();

        // 1. Pipe Length (in feet or meters)
        let pipeLen = parseFloat(item.pipe_length || 0);
        if (pipeLen <= 0 && item.length) {
            const cleanLen = parseFloat(item.length.toString().replace(/[^0-9.]/g, '')) || 0;
            if (cleanLen > 0) pipeLen = cleanLen;
        }
        if (pipeLen <= 0) {
            const m = name.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:[\'\\â€™]|ft|feet|meter|mtr|m\\b)', 'i'));
            if (m) pipeLen = parseFloat(m[1]);
        }
        if (pipeLen <= 0 && catKey.includes('PIPE')) {
            pipeLen = 13; // Standard fallback for PVC pipes in Pakistan
        }

        // 2. Unit Weight (in KG)
        let unitWt = 0;
        const rawUw = (item.unit_weight !== undefined && item.unit_weight !== null) ? item.unit_weight.toString().trim() : '';
        if (rawUw && rawUw !== 'None' && rawUw !== 'X' && !isNaN(parseFloat(rawUw)) && parseFloat(rawUw) > 0) {
            unitWt = parseFloat(rawUw);
        }
        
        // For pipes, if item name specifies weight (e.g. "2.00 KG", "2.50 KG", "4.00 KG"), that is the most accurate!
        const nameWtMatch = name.match(/(\d+(?:\.\d+)?)\s*kg/i);
        if (nameWtMatch && parseFloat(nameWtMatch[1]) > 0) {
            unitWt = parseFloat(nameWtMatch[1]);
        } else if (unitWt <= 0 && (catType === 'pipes' || catKey.includes('PIPE'))) {
            // In Chart of Inventory, Weight/Pipe is stored in qty_per_piece
            const qpp = parseFloat(item.qty_per_piece || 0);
            if (qpp > 0) unitWt = qpp;
        }

        // For fittings, if unit weight is not in item or 0, check size from name or item
        if (unitWt <= 0 && (catType === 'fitting' || catKey.includes('FITTING'))) {
            const sizeStr = (item.size || name).toString();
            if (sizeStr.includes('4"') || sizeStr.includes('4 INCH') || sizeStr.includes('110')) unitWt = 0.400;
            else if (sizeStr.includes('3"') || sizeStr.includes('3 INCH') || sizeStr.includes('90')) unitWt = 0.300;
            else if (sizeStr.includes('2"') || sizeStr.includes('2 INCH') || sizeStr.includes('63')) unitWt = 0.200;
            else if (sizeStr.includes('1.5"') || sizeStr.includes('1-1/2')) unitWt = 0.150;
            else if (sizeStr.includes('1.25"') || sizeStr.includes('1-1/4')) unitWt = 0.125;
            else if (sizeStr.includes('1"') || sizeStr.includes('1 INCH')) unitWt = 0.100;
            else if (sizeStr.includes('3/4"')) unitWt = 0.075;
            else if (sizeStr.includes('1/2"')) unitWt = 0.050;
            else if (sizeStr.includes('6"')) unitWt = 0.650;
            else if (sizeStr.includes('8"')) unitWt = 1.000;
        }

        // 3. Pcs per Carton (for fittings)
        let cartonPcs = 0;
        if (item.carton && parseFloat(item.carton) > 0) cartonPcs = parseFloat(item.carton);
        else if (item.pcs_per_carton && parseFloat(item.pcs_per_carton) > 0) cartonPcs = parseFloat(item.pcs_per_carton);
        else if (catType === 'fitting' || catKey.includes('FITTING')) {
            // In Chart of Inventory, Pcs/Carton is stored in qty_per_piece
            const qpp = parseFloat(item.qty_per_piece || 0);
            if (qpp > 0) cartonPcs = qpp;
        }
        if (cartonPcs <= 0 && (catType === 'fitting' || catKey.includes('FITTING'))) {
            const sizeStr = (item.size || name).toString();
            if (sizeStr.includes('2"')) cartonPcs = 100;
            else if (sizeStr.includes('3"')) cartonPcs = 50;
            else if (sizeStr.includes('4"')) cartonPcs = 30;
            else cartonPcs = 1;
        }

        return {
            pipeLength: pipeLen,
            unitWeight: unitWt,
            pcsPerCarton: cartonPcs
        };
    },

    ensureCategorySection: function(catKey) {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return null;
        let headerRow = tbody.querySelector(`tr.si-cat-header-row[data-category-key="${catKey}"]`);
        let subtotalRow = tbody.querySelector(`tr.si-cat-subtotal-row[data-category-key="${catKey}"]`);

        if (headerRow && subtotalRow) {
            return { headerRow, subtotalRow };
        }

        const cfg = this.getCategoryConfig(catKey);
        const orderList = ['PVC PIPE', 'PVC FITTING', 'HDPE PIPE', 'PPRC PIPE'];

        headerRow = document.createElement('tr');
        const col1Lbl = typeof cfg.col1 === 'object' ? cfg.col1.label : cfg.col1;
        const col2Lbl = typeof cfg.col2 === 'object' ? cfg.col2.label : cfg.col2;
        const col3Lbl = typeof cfg.col3 === 'object' ? cfg.col3.label : cfg.col3;
        const col1Show = typeof cfg.col1 === 'object' ? cfg.col1.show !== false : true;
        const col2Show = typeof cfg.col2 === 'object' ? cfg.col2.show !== false : true;
        const col3Show = typeof cfg.col3 === 'object' ? cfg.col3.show !== false : true;

        headerRow.className = 'si-cat-header-row';
        headerRow.dataset.categoryKey = catKey;
        headerRow.innerHTML = `
            <td colspan="5" class="si-lead-cell" style="background:#002060; color:#fff; font-weight:bold; font-size:11px; padding:2px 8px; text-align:left; white-space:nowrap; height:22px;">
                <span class="cat-title">- 1. ${catKey}</span>
            </td>
            <td class="si-col-qty1" style="background:#002060; color:#fff; font-weight:bold; font-size:9.5px; text-align:center; white-space:nowrap; height:22px; ${col1Show ? '' : 'display:none;'}">${col1Lbl}</td>
            <td class="si-col-qty2" style="background:#002060; color:#fff; font-weight:bold; font-size:9.5px; text-align:center; white-space:nowrap; height:22px; ${col2Show ? '' : 'display:none;'}">${col2Lbl}</td>
            <td class="si-col-qty3" style="background:#002060; color:#fff; font-weight:bold; font-size:9.5px; text-align:center; white-space:nowrap; height:22px; ${col3Show ? '' : 'display:none;'}">${col3Lbl}</td>
            <td class="si-col-rate" style="background:#002060;"></td>
            <td class="si-col-gross" style="background:#002060;"></td>
            <td class="si-col-disc-pct" style="background:#002060;"></td>
            <td class="si-col-disc-amt" style="background:#002060;"></td>
            <td class="pi-tax-col si-col-stax si-col-stax-pct" style="display:none; background:#002060;"></td>
            <td class="pi-tax-col si-col-stax si-col-stax-amt" style="display:none; background:#002060;"></td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-pct" style="display:none; background:#002060;"></td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-amt" style="display:none; background:#002060;"></td>
            <td class="pi-tax-col si-col-val-incl" style="display:none; background:#002060;"></td>
            <td class="pi-nontax-col si-col-net" style="background:#002060;"></td>
        `;

        subtotalRow = document.createElement('tr');
        subtotalRow.className = 'si-cat-subtotal-row';
        subtotalRow.dataset.categoryKey = catKey;
        subtotalRow.innerHTML = `
            <td colspan="5" class="si-lead-cell" style="background:#fef08a; color:#000; font-weight:bold; font-size:11px; padding:2px 8px; text-align:left; height:22px;">
                Sub Total (${catKey})
            </td>
            <td class="sub-tot-qty1 si-col-qty1" style="text-align:right; font-weight:bold; padding:2px 4px; ${col1Show ? '' : 'display:none;'}">0</td>
            <td class="sub-tot-qty2 si-col-qty2" style="text-align:right; font-weight:bold; padding:2px 4px; ${col2Show ? '' : 'display:none;'}">0.00</td>
            <td class="sub-tot-qty3 si-col-qty3" style="text-align:right; font-weight:bold; padding:2px 4px; ${col3Show ? '' : 'display:none;'}">0.000</td>
            <td class="si-col-rate"></td>
            <td class="sub-tot-gross si-col-gross" style="text-align:right; font-weight:bold; padding:2px 4px;">0.00</td>
            <td class="si-col-disc-pct"></td>
            <td class="sub-tot-disc si-col-disc-amt" style="text-align:right; font-weight:bold; padding:2px 4px;">0.00</td>
            <td class="pi-tax-col si-col-stax si-col-stax-pct" style="display:none;"></td>
            <td class="pi-tax-col sub-tot-stax si-col-stax si-col-stax-amt" style="display:none; text-align:right; font-weight:bold; padding:2px 4px;">0.00</td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-pct" style="display:none;"></td>
            <td class="pi-tax-col sub-tot-ftax si-col-ftax si-col-ftax-amt" style="display:none; text-align:right; font-weight:bold; padding:2px 4px;">0.00</td>
            <td class="pi-tax-col sub-tot-incl si-col-val-incl" style="display:none; text-align:right; font-weight:bold; padding:2px 4px;">0.00</td>
            <td class="pi-nontax-col sub-tot-net si-col-net" style="text-align:right; font-weight:bold; padding:2px 4px;">0.00</td>
        `;

        const firstEmpty = tbody.querySelector('tr.si-empty-row');
        const existingHeaders = Array.from(tbody.querySelectorAll('tr.si-cat-header-row'));
        
        const myRank = orderList.indexOf(catKey) !== -1 ? orderList.indexOf(catKey) : 999;
        let insertBeforeEl = firstEmpty;

        for (let h of existingHeaders) {
            const otherKey = h.dataset.categoryKey;
            const otherRank = orderList.indexOf(otherKey) !== -1 ? orderList.indexOf(otherKey) : 999;
            if (myRank < otherRank) {
                insertBeforeEl = h;
                break;
            }
        }

        if (insertBeforeEl) {
            tbody.insertBefore(headerRow, insertBeforeEl);
            tbody.insertBefore(subtotalRow, insertBeforeEl);
        } else {
            tbody.appendChild(headerRow);
            tbody.appendChild(subtotalRow);
        }

        this.renumberCategories();
        this.toggleTaxMode(false);
        this.updateLeadColspans();
        return { headerRow, subtotalRow };
    },

    renumberCategories: function() {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;
        const headerRows = tbody.querySelectorAll('tr.si-cat-header-row');
        headerRows.forEach((hr, idx) => {
            const catKey = hr.dataset.categoryKey;
            const titleSpan = hr.querySelector('.cat-title');
            if (titleSpan) titleSpan.innerText = `- ${idx + 1}. ${catKey}`;
        });
    },

    renumberCategoryItems: function(catKey) {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll(`tr.si-item-row[data-category-key="${catKey}"]:not(.si-empty-row)`);
        rows.forEach((r, idx) => {
            const numCell = r.querySelector('.row-num');
            if (numCell && !r.classList.contains('selected-row')) {
                numCell.innerText = idx + 1;
            }
        });
    },

    renumberEmptyRows: function() {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;
        const filledRows = tbody.querySelectorAll('tr.si-item-row:not(.si-empty-row)');
        const emptyRows = tbody.querySelectorAll('tr.si-empty-row');
        let startIdx = filledRows.length + 1;
        emptyRows.forEach(er => {
            const numCell = er.querySelector('.row-num');
            if (numCell) numCell.innerText = startIdx++;
        });
    },

    addItemRow: function(data = {}) {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return null;

        const catKey = this.getItemCategoryKey(data);
        const catGroup = this.ensureCategorySection(catKey);
        const cfg = this.getCategoryConfig(catKey);
        const dims = this.extractItemDimensions(data, catKey);

        const tr = document.createElement('tr');
        tr.className = 'si-item-row';
        tr.dataset.categoryKey = catKey;
        tr.dataset.coaId = data.item_coa_id || data.id || '';
        tr.dataset.pipeLength = dims.pipeLength;
        tr.dataset.unitWeight = dims.unitWeight;
        tr.dataset.carton = dims.pcsPerCarton;
        tr.dataset.categoryType = data.category_type || '';
        tr.dataset.pipeSubType = data.pipe_sub_type || '';
        tr.dataset.billingMode = data.billing_mode || '';
        tr.dataset.index = 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        const pipeLength = dims.pipeLength;
        const unitWeight = dims.unitWeight;
        const pcsPerCarton = dims.pcsPerCarton;

        let initUnit = data.unit || cfg.defaultUnit;
        let q1 = 0, q2 = 0, q3 = 0;

        if (cfg.type === 'pipe') {
            q1 = parseFloat(data.pieces) || (data.quantity && initUnit === 'Pcs' ? parseFloat(data.quantity) : 0);
            q2 = parseFloat(data.length_val) || (data.quantity && (initUnit === 'Feet' || initUnit === 'Mtr') ? parseFloat(data.quantity) : 0);
            q3 = parseFloat(data.weight_val) || (data.quantity && initUnit === 'Kgs' ? parseFloat(data.quantity) : 0);

            if (q1 === 0 && q2 === 0 && q3 === 0) {
                q1 = 1;
                if (pipeLength > 0) q2 = q1 * pipeLength;
                if (unitWeight > 0) q3 = q1 * unitWeight;
            } else if (q1 > 0 && q2 === 0 && pipeLength > 0) {
                q2 = q1 * pipeLength;
                if (q3 === 0 && unitWeight > 0) q3 = q1 * unitWeight;
            } else if (q3 > 0 && q1 === 0 && unitWeight > 0) {
                q1 = q3 / unitWeight;
                if (pipeLength > 0) q2 = q1 * pipeLength;
            }
        } else if (cfg.type === 'fitting') {
            q1 = parseFloat(data.carton_val) || (data.quantity && initUnit === 'Ctn' ? parseFloat(data.quantity) : 0);
            q2 = parseFloat(data.pieces) || (data.quantity && initUnit === 'Pcs' ? parseFloat(data.quantity) : 0);
            q3 = parseFloat(data.weight_val) || (data.quantity && initUnit === 'Kgs' ? parseFloat(data.quantity) : 0);

            if (q1 === 0 && q2 === 0 && q3 === 0) {
                q1 = 1;
                if (pcsPerCarton > 0) q2 = q1 * pcsPerCarton;
                if (unitWeight > 0) q3 = (q2 > 0 ? q2 : q1) * unitWeight;
            } else if (q1 > 0 && q2 === 0 && pcsPerCarton > 0) {
                q2 = q1 * pcsPerCarton;
                if (q3 === 0 && unitWeight > 0) q3 = q2 * unitWeight;
            } else if (q2 > 0 && q1 === 0 && pcsPerCarton > 0) {
                q1 = q2 / pcsPerCarton;
                if (q3 === 0 && unitWeight > 0) q3 = q2 * unitWeight;
            }
        } else {
            q1 = parseFloat(data.quantity || data.pieces || 1);
            q2 = parseFloat(data.length_val || 0);
            q3 = parseFloat(data.weight_val || 0);
        }

        const itemCode = data.item_code || data.code || '';
        const hsCode = data.hs_code || '';
        let desc = (data.description || data.item_name || data.name || '').toString().trim();
        const rate = parseFloat(data.rate || data.sales_price || data.selling_price || 0);

        let stRate = 0, ftRate = 0;
        if (this.selectedCustomer) {
            if (this.selectedCustomer.sales_tax_rate !== undefined) stRate = parseFloat(this.selectedCustomer.sales_tax_rate) || 0;
            if (this.selectedCustomer.further_tax_rate !== undefined) ftRate = parseFloat(this.selectedCustomer.further_tax_rate) || 0;
        } else if (data.sales_tax_rate !== undefined && data.sales_tax_rate !== null) {
            stRate = parseFloat(data.sales_tax_rate) || 0;
            ftRate = parseFloat(data.further_tax_rate) || 0;
        } else if (data.tax_rate !== undefined && data.tax_rate !== null) {
            stRate = parseFloat(data.tax_rate) || 0;
        }

        const discPerc = parseFloat(data.discount_percent || data.discount_perc || 0);
        const discAmt = parseFloat(data.discount_amount || data.discount_amt || 0);

        const unitOptions = cfg.units.map(u => `<option value="${u}" ${u.toLowerCase() === initUnit.toLowerCase() ? 'selected' : ''}>${u}</option>`).join('');

        const col1Show = typeof cfg.col1 === 'object' ? cfg.col1.show !== false : true;
        const col2Show = typeof cfg.col2 === 'object' ? cfg.col2.show !== false : true;
        const col3Show = typeof cfg.col3 === 'object' ? cfg.col3.show !== false : true;

        tr.innerHTML = `
            <td class="row-num si-col-num" style="text-align: center; font-size: 10px; color: #64748b; font-weight: bold; cursor: pointer;">1</td>
            <td class="si-col-code" style="position: relative;">
                <input type="text" class="grid-input item-code-search">
                <div class="grid-suggest"></div>
            </td>
            <td class="si-col-hs"><input type="text" class="grid-input hs-code"></td>
            <td class="si-col-desc"><input type="text" class="grid-input si-description"></td>
            <td class="si-col-unit">
                <select class="si-unit-select">
                    ${unitOptions}
                </select>
                <input type="hidden" class="si-unit" value="${initUnit}">
                <input type="hidden" class="pieces" value="${q1}">
                <input type="hidden" class="qty" value="${q1}">
            </td>
            <td class="si-col-qty1" style="${col1Show ? '' : 'display:none;'}"><input type="text" class="grid-input num col-qty1" value="${Number.isInteger(q1) ? q1 : q1.toFixed(2)}"></td>
            <td class="si-col-qty2" style="${col2Show ? '' : 'display:none;'}"><input type="text" class="grid-input num col-qty2" value="${Number.isInteger(q2) ? q2 : q2.toFixed(2)}"></td>
            <td class="si-col-qty3" style="${col3Show ? '' : 'display:none;'}"><input type="text" class="grid-input num col-qty3" value="${q3.toFixed(3)}"></td>
            <td class="si-col-rate"><input type="text" class="grid-input num rate" value="${rate > 0 ? rate.toFixed(2) : ''}"></td>
            <td class="si-col-gross"><input type="text" class="grid-input num gross-amt val-excl" readonly></td>
            <td class="si-col-disc-pct"><input type="text" class="grid-input num disc-perc" value="${discPerc > 0 ? discPerc.toFixed(2) : ''}"></td>
            <td class="si-col-disc-amt"><input type="text" class="grid-input num disc-amt" value="${discAmt > 0 ? discAmt.toFixed(2) : ''}"></td>
            
            <td class="pi-tax-col si-col-stax si-col-stax-pct" style="display: none;"><input type="text" class="grid-input num stax-rate" value="${stRate > 0 ? stRate.toFixed(2) : ''}"></td>
            <td class="pi-tax-col si-col-stax si-col-stax-amt" style="display: none;"><input type="text" class="grid-input num stax-amt" value="${data.sales_tax_amount || ''}"></td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-pct" style="display: none;"><input type="text" class="grid-input num ftax-rate" value="${ftRate > 0 ? ftRate.toFixed(2) : ''}"></td>
            <td class="pi-tax-col si-col-ftax si-col-ftax-amt" style="display: none;"><input type="text" class="grid-input num ftax-amt" value="${data.further_tax_amount || ''}"></td>
            <td class="pi-tax-col si-col-val-incl" style="display: none;"><input type="text" class="grid-input num val-incl" readonly></td>
            
            <td class="pi-nontax-col si-col-net"><input type="text" class="grid-input num net-amt" readonly></td>
        `;

        tr.querySelector('.item-code-search').value = itemCode;
        tr.querySelector('.hs-code').value = hsCode;
        tr.querySelector('.si-description').value = desc;

        tbody.insertBefore(tr, catGroup.subtotalRow);
        this.renumberCategoryItems(catKey);
        this.setupGridEvents(tr);
        this.calculateRow(tr);
        this.toggleTaxMode(false);
        return tr;
    },

    deleteCategoryRow: function(tr) {
        const catKey = tr.dataset.categoryKey;
        const tbody = document.getElementById('siGridBody');
        tr.remove();

        if (catKey && tbody) {
            const remaining = tbody.querySelectorAll(`tr.si-item-row[data-category-key="${catKey}"]:not(.si-empty-row)`);
            if (remaining.length === 0) {
                const h = tbody.querySelector(`tr.si-cat-header-row[data-category-key="${catKey}"]`);
                const s = tbody.querySelector(`tr.si-cat-subtotal-row[data-category-key="${catKey}"]`);
                if (h) h.remove();
                if (s) s.remove();
                this.renumberCategories();
            } else {
                this.renumberCategoryItems(catKey);
            }
        }
        this.ensureDefaultRows(40);
        this.reindexRows();
        this.calculateTotals();
        this.updateLeadColspans();
    },

    setupGridEvents: function(tr) {
        const codeInput = tr.querySelector('.item-code-search');
        let suggest = tr.querySelector('.grid-suggest');
        const unitSelect = tr.querySelector('.si-unit-select');

        if (unitSelect) {
            unitSelect.onchange = () => {
                const hiddenUnit = tr.querySelector('.si-unit');
                if (hiddenUnit) hiddenUnit.value = unitSelect.value;
                this.calculateRow(tr, 'unit');
            };
        }

        if (codeInput && suggest) {
            codeInput.addEventListener('focus', () => {
                if (codeInput.value) codeInput.dispatchEvent(new Event('input'));
            });

            codeInput.oninput = async (e) => {
                const val = e.target.value.toLowerCase().trim();
                if (!val) { 
                    suggest.style.display = 'none'; 
                    return; 
                }

                if (!this.inventory || this.inventory.length === 0) {
                    await this.loadInventory();
                }
                
                const searchWords = val.split(/\s+/).filter(Boolean);
                let matches = [];
                if (typeof window.smartSearchFilterAndSort === 'function') {
                    try { matches = window.smartSearchFilterAndSort(this.inventory || [], val); } catch(ex) {}
                }
                if (!matches || matches.length === 0) {
                    matches = (this.inventory || []).filter(i => {
                        const code = String(i.item_code || i.code || '').toLowerCase();
                        const name = String(i.item_name || i.name || i.description || '').toLowerCase();
                        const searchStr = `${code} ${name}`;
                        return searchWords.every(word => (searchStr.includes(word) || code.includes(word) || name.includes(word)));
                    });
                }
                
                this.currentMatches = (matches || []).slice(0, 30);
                if (this.currentMatches.length > 0) {
                    this.suggestIndex = -1;
                    suggest.innerHTML = this.currentMatches.map((i, mIdx) => `
                        <div class="suggest-item" data-idx="${mIdx}">
                            <span><b>${i.item_code || i.code}</b> &nbsp; ${i.item_name || i.name || i.description}</span>
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
                    items.forEach(itemEl => {
                        itemEl.addEventListener('mouseenter', () => {
                            this.suggestIndex = parseInt(itemEl.dataset.idx);
                            this.updateSuggestHighlight(items, tr);
                        });
                        itemEl.addEventListener('mousedown', (ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            this.selectGridItem(null, parseInt(itemEl.dataset.idx), tr);
                        });
                    });
                } else { 
                    suggest.style.display = 'none'; 
                }
            };

            codeInput.addEventListener('change', () => {
                const val = codeInput.value.trim().toLowerCase();
                if (!val || !this.inventory || this.inventory.length === 0) return;
                const match = this.inventory.find(i => String(i.item_code || i.code || '').toLowerCase() === val);
                if (match) {
                    this.currentMatches = [match];
                    this.selectGridItem(tr.dataset.index, 0, tr);
                }
            });

            document.addEventListener('click', (e) => { 
                if (e.target !== codeInput && !suggest.contains(e.target)) {
                    suggest.style.display = 'none'; 
                    this.suggestIndex = -1;
                }
            });
        }

        // Qty inputs
        const q1Input = tr.querySelector('.col-qty1');
        const q2Input = tr.querySelector('.col-qty2');
        const q3Input = tr.querySelector('.col-qty3');

        if (q1Input) q1Input.oninput = () => this.calculateRow(tr, 'q1');
        if (q2Input) q2Input.oninput = () => this.calculateRow(tr, 'q2');
        if (q3Input) q3Input.oninput = () => this.calculateRow(tr, 'q3');

        const rateInput = tr.querySelector('.rate');
        if (rateInput) rateInput.oninput = () => this.calculateRow(tr, 'rate');

        const discPercInput = tr.querySelector('.disc-perc');
        if (discPercInput) discPercInput.oninput = () => this.calculateRow(tr, 'disc_perc');

        const discAmtInput = tr.querySelector('.disc-amt');
        if (discAmtInput) discAmtInput.oninput = () => this.calculateRow(tr, 'disc_amt');

        const stRateInput = tr.querySelector('.stax-rate');
        if (stRateInput) stRateInput.oninput = () => { tr.dataset.manualStax = "0"; this.calculateRow(tr, 'stax_rate'); };

        const stAmtInput = tr.querySelector('.stax-amt');
        if (stAmtInput) stAmtInput.oninput = () => { tr.dataset.manualStax = "1"; this.calculateRow(tr, 'stax_amt'); };

        const ftRateInput = tr.querySelector('.ftax-rate');
        if (ftRateInput) ftRateInput.oninput = () => { tr.dataset.manualFtax = "0"; this.calculateRow(tr, 'ftax_rate'); };

        const ftAmtInput = tr.querySelector('.ftax-amt');
        if (ftAmtInput) ftAmtInput.oninput = () => { tr.dataset.manualFtax = "1"; this.calculateRow(tr, 'ftax_amt'); };

        tr.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('focus', () => inp.select());
            inp.addEventListener('click', () => inp.select());
        });
    },

    selectGridItem: function(rowIndex, matchIdx, tr = null) {
        const item = this.currentMatches[matchIdx];
        if (!item) return;

        if (!tr && rowIndex) {
            tr = document.querySelector(`#siGridBody tr[data-index="${rowIndex}"]`);
        }

        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;

        const catKey = this.getItemCategoryKey(item);
        const catGroup = this.ensureCategorySection(catKey);
        const cfg = this.getCategoryConfig(catKey);
        const dims = this.extractItemDimensions(item, catKey);

        const pipeLength = dims.pipeLength;
        const unitWeight = dims.unitWeight;
        const pcsPerCarton = dims.pcsPerCarton;
        const defaultUnit = cfg.defaultUnit;

        let q1 = 1, q2 = 0, q3 = 0;
        if (cfg.type === 'pipe') {
            q1 = 1;
            q2 = pipeLength > 0 ? (q1 * pipeLength) : 0;
            q3 = unitWeight > 0 ? (q1 * unitWeight) : 0;
        } else if (cfg.type === 'fitting') {
            q1 = 1;
            q2 = pcsPerCarton > 0 ? (q1 * pcsPerCarton) : 1;
            q3 = unitWeight > 0 ? (q2 * unitWeight) : 0;
        }

        const itemCode = item.item_code || item.code || '';
        const hsCode = item.hs_code || '';
        const itemDesc = item.item_name || item.name || item.description || '';
        let rate = parseFloat(item.sales_price || item.selling_price || item.rate || 0);
        const effectiveItemId = item.id || item.item_coa_id || item.item_id;
        if (this.customerPricesMap && effectiveItemId && this.customerPricesMap[effectiveItemId] !== undefined) {
            rate = this.customerPricesMap[effectiveItemId];
        }

        let stRate = 0, ftRate = 0;
        if (this.selectedCustomer) {
            if (this.selectedCustomer.sales_tax_rate !== undefined) stRate = parseFloat(this.selectedCustomer.sales_tax_rate) || 0;
            if (this.selectedCustomer.further_tax_rate !== undefined) ftRate = parseFloat(this.selectedCustomer.further_tax_rate) || 0;
        } else if (item.sales_tax_rate !== undefined) {
            stRate = parseFloat(item.sales_tax_rate) || 0;
            ftRate = parseFloat(item.further_tax_rate) || 0;
        } else if (item.tax_rate !== undefined) {
            stRate = parseFloat(item.tax_rate) || 0;
        }

        if (tr && tr.classList.contains('si-empty-row')) {
            // Transform empty row into categorized row!
            tr.classList.remove('si-empty-row');
            delete tr.dataset.empty;
            tr.dataset.categoryKey = catKey;
            tr.dataset.coaId = item.id || item.item_coa_id || '';
            tr.dataset.pipeLength = pipeLength;
            tr.dataset.unitWeight = unitWeight;
            tr.dataset.carton = pcsPerCarton;
            tr.dataset.categoryType = item.category_type || '';
            tr.dataset.pipeSubType = item.pipe_sub_type || '';
            tr.dataset.billingMode = item.billing_mode || '';

            const unitSelect = tr.querySelector('.si-unit-select');
            if (unitSelect) {
                unitSelect.innerHTML = cfg.units.map(u => `<option value="${u}" ${u.toLowerCase() === defaultUnit.toLowerCase() ? 'selected' : ''}>${u}</option>`).join('');
                unitSelect.value = defaultUnit;
            }
            const hiddenUnit = tr.querySelector('.si-unit');
            if (hiddenUnit) hiddenUnit.value = defaultUnit;

            tr.querySelector('.item-code-search').value = itemCode;
            tr.querySelector('.hs-code').value = hsCode;
            tr.querySelector('.si-description').value = itemDesc;

            const q1Inp = tr.querySelector('.col-qty1');
            const q2Inp = tr.querySelector('.col-qty2');
            const q3Inp = tr.querySelector('.col-qty3');
            if (q1Inp) q1Inp.value = Number.isInteger(q1) ? q1 : q1.toFixed(2);
            if (q2Inp) q2Inp.value = Number.isInteger(q2) ? q2 : q2.toFixed(2);
            if (q3Inp) q3Inp.value = q3.toFixed(3);

            const rateInp = tr.querySelector('.rate');
            if (rateInp) rateInp.value = rate > 0 ? rate.toFixed(2) : '';

            const stRateInp = tr.querySelector('.stax-rate');
            if (stRateInp) stRateInp.value = stRate > 0 ? stRate.toFixed(2) : '';

            const ftRateInp = tr.querySelector('.ftax-rate');
            if (ftRateInp) ftRateInp.value = ftRate > 0 ? ftRate.toFixed(2) : '';

            tbody.insertBefore(tr, catGroup.subtotalRow);
            this.ensureDefaultRows(40);
            this.calculateRow(tr, 'q1');
            this.reindexRows();
            this.calculateTotals();
        this.updateLeadColspans();

            if (q1Inp) { q1Inp.focus(); q1Inp.select(); }
        } else if (tr) {
            const oldCatKey = tr.dataset.categoryKey;
            tr.dataset.categoryKey = catKey;
            tr.dataset.coaId = item.id || item.item_coa_id || '';
            tr.dataset.pipeLength = pipeLength;
            tr.dataset.unitWeight = unitWeight;
            tr.dataset.carton = pcsPerCarton;
            tr.dataset.categoryType = item.category_type || '';
            tr.dataset.pipeSubType = item.pipe_sub_type || '';
            tr.dataset.billingMode = item.billing_mode || '';

            const unitSelect = tr.querySelector('.si-unit-select');
            if (unitSelect) {
                unitSelect.innerHTML = cfg.units.map(u => `<option value="${u}" ${u.toLowerCase() === defaultUnit.toLowerCase() ? 'selected' : ''}>${u}</option>`).join('');
                unitSelect.value = defaultUnit;
            }
            const hiddenUnit = tr.querySelector('.si-unit');
            if (hiddenUnit) hiddenUnit.value = defaultUnit;

            tr.querySelector('.item-code-search').value = itemCode;
            tr.querySelector('.hs-code').value = hsCode;
            tr.querySelector('.si-description').value = itemDesc;
            if (rate > 0) tr.querySelector('.rate').value = rate.toFixed(2);

            if (oldCatKey !== catKey) {
                tbody.insertBefore(tr, catGroup.subtotalRow);
                const remainingInOld = tbody.querySelectorAll(`tr.si-item-row[data-category-key="${oldCatKey}"]:not(.si-empty-row)`);
                if (remainingInOld.length === 0) {
                    const oldH = tbody.querySelector(`tr.si-cat-header-row[data-category-key="${oldCatKey}"]`);
                    const oldS = tbody.querySelector(`tr.si-cat-subtotal-row[data-category-key="${oldCatKey}"]`);
                    if (oldH) oldH.remove();
                    if (oldS) oldS.remove();
                }
            }
            this.calculateRow(tr, 'q1');
            this.reindexRows();
            this.calculateTotals();
            this.updateLeadColspans();
            const q1Inp = tr.querySelector('.col-qty1');
            if (q1Inp) { q1Inp.focus(); q1Inp.select(); }
        } else {
            this.addItemRow(item);
            this.ensureDefaultRows(40);
        }

        const suggest = tr ? (tr._suggestBox || tr.querySelector('.grid-suggest')) : null;
        if (suggest) suggest.style.display = 'none';
        this.suggestIndex = -1;
    },

    calculateRow: function(tr, sourceField = '') {
        if (!tr || tr.classList.contains('si-empty-row')) return;

        const cfg = this.getCategoryConfig(tr.dataset.categoryKey);
        const pipeLength = parseFloat(tr.dataset.pipeLength) || 0;
        const unitWeight = parseFloat(tr.dataset.unitWeight) || 0;
        const pcsPerCarton = parseFloat(tr.dataset.carton) || 0;
        
        const q1Input = tr.querySelector('.col-qty1');
        const q2Input = tr.querySelector('.col-qty2');
        const q3Input = tr.querySelector('.col-qty3');
        const unitSelect = tr.querySelector('.si-unit-select');
        const selectedUnit = unitSelect ? unitSelect.value : (tr.querySelector('.si-unit')?.value || cfg.defaultUnit);
        
        let q1 = parseFloat(q1Input?.value) || 0;
        let q2 = parseFloat(q2Input?.value) || 0;
        let q3 = parseFloat(q3Input?.value) || 0;

        if (cfg.type === 'pipe') {
            // Col 1 = PCS, Col 2 = LENGTH, Col 3 = WEIGHT
            if (sourceField === 'q1' || (!sourceField && q1 > 0)) {
                if (pipeLength > 0) {
                    q2 = q1 * pipeLength;
                    if (q2Input) q2Input.value = Number.isInteger(q2) ? q2 : q2.toFixed(2);
                }
                if (unitWeight > 0) {
                    q3 = q1 * unitWeight;
                    if (q3Input) q3Input.value = q3.toFixed(3);
                }
            } else if (sourceField === 'q2') {
                if (pipeLength > 0) {
                    q1 = q2 / pipeLength;
                    if (q1Input) q1Input.value = Number.isInteger(q1) ? q1 : q1.toFixed(2);
                }
                if (unitWeight > 0) {
                    const effectivePcs = pipeLength > 0 ? (q2 / pipeLength) : q1;
                    q3 = effectivePcs * unitWeight;
                    if (q3Input) q3Input.value = q3.toFixed(3);
                }
            } else if (sourceField === 'q3') {
                if (unitWeight > 0) {
                    q1 = q3 / unitWeight;
                    if (q1Input) q1Input.value = Number.isInteger(q1) ? q1 : q1.toFixed(2);
                    if (pipeLength > 0) {
                        q2 = q1 * pipeLength;
                        if (q2Input) q2Input.value = Number.isInteger(q2) ? q2 : q2.toFixed(2);
                    }
                }
            }
        } else if (cfg.type === 'fitting') {
            // Col 1 = CTN, Col 2 = PCS, Col 3 = WEIGHT
            if (sourceField === 'q1' || (!sourceField && q1 > 0)) {
                if (pcsPerCarton > 0) {
                    q2 = q1 * pcsPerCarton;
                    if (q2Input) q2Input.value = Math.round(q2);
                }
                if (unitWeight > 0) {
                    q3 = (q2 > 0 ? q2 : (q1 * (pcsPerCarton || 1))) * unitWeight;
                    if (q3Input) q3Input.value = q3.toFixed(3);
                }
            } else if (sourceField === 'q2') {
                if (pcsPerCarton > 0) {
                    q1 = q2 / pcsPerCarton;
                    if (q1Input) q1Input.value = Number.isInteger(q1) ? q1 : q1.toFixed(2);
                }
                if (unitWeight > 0) {
                    q3 = q2 * unitWeight;
                    if (q3Input) q3Input.value = q3.toFixed(3);
                }
            } else if (sourceField === 'q3') {
                if (unitWeight > 0) {
                    q2 = q3 / unitWeight;
                    if (q2Input) q2Input.value = Math.round(q2);
                    if (pcsPerCarton > 0) {
                        q1 = q2 / pcsPerCarton;
                        if (q1Input) q1Input.value = Number.isInteger(q1) ? q1 : q1.toFixed(2);
                    }
                }
            }
        }

        let billedQty = q1;
        if (cfg.rateBasis === 'col1') {
            billedQty = q1;
        } else if (cfg.rateBasis === 'col2') {
            billedQty = q2;
        } else if (cfg.rateBasis === 'col3') {
            billedQty = q3;
        } else if (cfg.rateBasis === 'unit_based') {
            if (selectedUnit === 'Kgs') billedQty = q3;
            else if (selectedUnit === 'Feet' || selectedUnit === 'Mtr') billedQty = q2;
            else if (selectedUnit === 'Ctn') billedQty = (cfg.type === 'fitting' ? q2 : q1);
            else billedQty = q1;
        } else {
            if (cfg.type === 'pipe') {
                if (selectedUnit === 'Kgs') billedQty = q3;
                else if (selectedUnit === 'Feet' || selectedUnit === 'Mtr') billedQty = q2;
                else billedQty = q1;
            } else if (cfg.type === 'fitting') {
                if (selectedUnit === 'Kgs') billedQty = q3;
                else billedQty = q2;
            } else {
                billedQty = q1 > 0 ? q1 : (q2 > 0 ? q2 : q3);
            }
        }

        const piecesInput = tr.querySelector('.pieces');
        if (piecesInput) piecesInput.value = q1;
        const qtyInput = tr.querySelector('.qty');
        if (qtyInput) qtyInput.value = billedQty;

        const rate = parseFloat(tr.querySelector('.rate')?.value) || 0;
        const gross = billedQty * rate;

        const grossInput = tr.querySelector('.gross-amt');
        if (grossInput) grossInput.value = gross.toFixed(2);

        // 1. Discount Calculation (Both Tax and Non-Tax modes)
        const discPercInput = tr.querySelector('.disc-perc');
        const discAmtInput = tr.querySelector('.disc-amt');
        let discPerc = parseFloat(discPercInput?.value) || 0;
        let discAmt = parseFloat(discAmtInput?.value) || 0;

        if (sourceField === 'disc_amt') {
            discPerc = gross > 0 ? (discAmt / gross) * 100 : 0;
            if (discPercInput) {
                discPercInput.value = discPerc > 0 ? (Number.isInteger(discPerc) ? discPerc : discPerc.toFixed(2)) : '';
            }
        } else {
            discAmt = (gross * discPerc) / 100;
            if (discAmtInput) {
                discAmtInput.value = discAmt > 0 ? discAmt.toFixed(2) : (discPerc > 0 ? '0.00' : '');
            }
        }

        // Net before taxes / Value Excluding Tax
        const netBeforeTax = Math.max(0, gross - discAmt);
        const valExcl = tr.querySelector('.val-excl');
        if (valExcl) valExcl.value = netBeforeTax.toFixed(2);

        const isTax = document.getElementById('si_is_tax')?.checked;
        if (isTax) {
            const stRateInput = tr.querySelector('.stax-rate');
            const stAmtInput = tr.querySelector('.stax-amt');
            const ftRateInput = tr.querySelector('.ftax-rate');
            const ftAmtInput = tr.querySelector('.ftax-amt');
            const valInclInput = tr.querySelector('.val-incl');

            let stRate = parseFloat(stRateInput?.value) || 0;
            let ftRate = parseFloat(ftRateInput?.value) || 0;

            // In Pakistan sales tax law, sales tax and further tax are calculated on value net of trade discount
            let stAmt = (netBeforeTax * stRate) / 100;
            let ftAmt = (netBeforeTax * ftRate) / 100;

            if (stAmtInput && tr.dataset.manualStax !== "1") {
                stAmtInput.value = stAmt > 0 ? stAmt.toFixed(2) : (stRate > 0 ? '0.00' : '');
            } else if (stAmtInput) {
                stAmt = parseFloat(stAmtInput.value) || 0;
            }

            if (ftAmtInput && tr.dataset.manualFtax !== "1") {
                ftAmtInput.value = ftAmt > 0 ? ftAmt.toFixed(2) : (ftRate > 0 ? '0.00' : '');
            } else if (ftAmtInput) {
                ftAmt = parseFloat(ftAmtInput.value) || 0;
            }

            const valIncl = netBeforeTax + stAmt + ftAmt;
            if (valInclInput) valInclInput.value = valIncl.toFixed(2);
            const netAmtInput = tr.querySelector('.net-amt');
            if (netAmtInput) netAmtInput.value = valIncl.toFixed(2);
        } else {
            const netAmtInput = tr.querySelector('.net-amt');
            const valInclInput = tr.querySelector('.val-incl');
            if (netAmtInput) netAmtInput.value = netBeforeTax.toFixed(2);
            if (valInclInput) valInclInput.value = netBeforeTax.toFixed(2);
        }
        this.calculateTotals();
        this.updateLeadColspans();
    },

    calculateTotals: function() {
        const tbody = document.getElementById('siGridBody');
        if (!tbody) return;

        let grandQ1 = 0, grandQ2 = 0, grandQ3 = 0;
        let grandGross = 0, grandDisc = 0, grandStax = 0, grandFtax = 0, grandNet = 0;

        const catHeaders = tbody.querySelectorAll('tr.si-cat-header-row');
        catHeaders.forEach(header => {
            const catKey = header.dataset.categoryKey;
            const subtotalRow = tbody.querySelector(`tr.si-cat-subtotal-row[data-category-key="${catKey}"]`);
            const itemRows = tbody.querySelectorAll(`tr.si-item-row[data-category-key="${catKey}"]:not(.si-empty-row)`);

            let subQ1 = 0, subQ2 = 0, subQ3 = 0;
            let subGross = 0, subDisc = 0, subStax = 0, subFtax = 0, subNet = 0;

            itemRows.forEach(tr => {
                subQ1 += parseFloat(tr.querySelector('.col-qty1')?.value) || 0;
                subQ2 += parseFloat(tr.querySelector('.col-qty2')?.value) || 0;
                subQ3 += parseFloat(tr.querySelector('.col-qty3')?.value) || 0;

                subGross += parseFloat(tr.querySelector('.gross-amt')?.value) || 0;
                subDisc += parseFloat(tr.querySelector('.disc-amt')?.value) || 0;
                subStax += parseFloat(tr.querySelector('.stax-amt')?.value) || 0;
                subFtax += parseFloat(tr.querySelector('.ftax-amt')?.value) || 0;
                subNet += parseFloat(tr.querySelector('.val-incl')?.value || tr.querySelector('.net-amt')?.value) || 0;
            });

            if (subtotalRow) {
                const q1Cell = subtotalRow.querySelector('.sub-tot-qty1');
                if (q1Cell) q1Cell.innerText = Number.isInteger(subQ1) ? subQ1 : subQ1.toFixed(2);

                const q2Cell = subtotalRow.querySelector('.sub-tot-qty2');
                if (q2Cell) q2Cell.innerText = subQ2.toFixed(2);

                const q3Cell = subtotalRow.querySelector('.sub-tot-qty3');
                if (q3Cell) q3Cell.innerText = subQ3.toFixed(3);

                const grossCell = subtotalRow.querySelector('.sub-tot-gross');
                if (grossCell) grossCell.innerText = subGross.toFixed(2);

                const discCell = subtotalRow.querySelector('.sub-tot-disc');
                if (discCell) discCell.innerText = subDisc.toFixed(2);

                const staxCell = subtotalRow.querySelector('.sub-tot-stax');
                if (staxCell) staxCell.innerText = subStax.toFixed(2);

                const ftaxCell = subtotalRow.querySelector('.sub-tot-ftax');
                if (ftaxCell) ftaxCell.innerText = subFtax.toFixed(2);

                const inclCell = subtotalRow.querySelector('.sub-tot-incl');
                if (inclCell) inclCell.innerText = subNet.toFixed(2);

                const netCell = subtotalRow.querySelector('.sub-tot-net');
                if (netCell) netCell.innerText = (subGross - subDisc).toFixed(2);
            }

            grandQ1 += subQ1;
            grandQ2 += subQ2;
            grandQ3 += subQ3;
            grandGross += subGross;
            grandDisc += subDisc;
            grandStax += subStax;
            grandFtax += subFtax;
            grandNet += subNet;
        });

        // Update Grand Total Row
        const gQ1 = document.getElementById('si_grand_qty1');
        if (gQ1) gQ1.innerText = Number.isInteger(grandQ1) ? grandQ1 : grandQ1.toFixed(2);

        const gQ2 = document.getElementById('si_grand_qty2');
        if (gQ2) gQ2.innerText = grandQ2.toFixed(2);

        const gQ3 = document.getElementById('si_grand_qty3');
        if (gQ3) gQ3.innerText = grandQ3.toFixed(3);

        const gGross = document.getElementById('si_grand_gross');
        if (gGross) gGross.innerText = grandGross.toFixed(2);

        const gDisc = document.getElementById('si_grand_disc');
        if (gDisc) gDisc.innerText = grandDisc.toFixed(2);

        const gStax = document.getElementById('si_grand_stax');
        if (gStax) gStax.innerText = grandStax.toFixed(2);

        const gFtax = document.getElementById('si_grand_ftax');
        if (gFtax) gFtax.innerText = grandFtax.toFixed(2);

        const gIncl = document.getElementById('si_grand_incl');
        if (gIncl) gIncl.innerText = grandNet.toFixed(2);

        const gNet = document.getElementById('si_grand_net');
        if (gNet) gNet.innerText = (grandGross - grandDisc).toFixed(2);

        // Backward-compatible hidden inputs
        if (document.getElementById('si_tot_pieces')) document.getElementById('si_tot_pieces').value = grandQ1.toFixed(2);
        if (document.getElementById('si_tot_qty')) document.getElementById('si_tot_qty').value = grandQ2.toFixed(2);
        if (document.getElementById('si_tot_excl')) document.getElementById('si_tot_excl').value = grandGross.toFixed(2);
        if (document.getElementById('si_tot_stax')) document.getElementById('si_tot_stax').value = grandStax.toFixed(2);
        if (document.getElementById('si_tot_ftax')) document.getElementById('si_tot_ftax').value = grandFtax.toFixed(2);
        if (document.getElementById('si_tot_incl')) document.getElementById('si_tot_incl').value = grandNet.toFixed(2);
        if (document.getElementById('si_tot_gross')) document.getElementById('si_tot_gross').value = grandGross.toFixed(2);
        if (document.getElementById('si_tot_disc')) document.getElementById('si_tot_disc').value = grandDisc.toFixed(2);
        if (document.getElementById('si_tot_net')) document.getElementById('si_tot_net').value = (grandGross - grandDisc).toFixed(2);

        // Footer Box Calculations
        const isTax = document.getElementById('si_is_tax')?.checked;
        const addDisc = parseFloat(document.getElementById('si_add_disc')?.value) || 0;
        const freight = parseFloat(document.getElementById('si_freight')?.value) || 0;
        let paid = parseFloat(document.getElementById('si_paid')?.value) || 0;

        const grossTotalVal = isTax ? grandGross : ((grandGross - grandDisc) - addDisc);
        if (document.getElementById('si_gross_tot')) document.getElementById('si_gross_tot').value = grossTotalVal.toFixed(2);

        let custTaxAmt = 0;
        if (isTax && document.getElementById('si_cust_tax_pct')) {
            const pct = parseFloat(document.getElementById('si_cust_tax_pct').value) || 0;
            custTaxAmt = (grandGross * pct) / 100;
            if (document.getElementById('si_cust_tax_amt')) {
                document.getElementById('si_cust_tax_amt').value = custTaxAmt.toFixed(2);
            }
        } else if (document.getElementById('si_cust_tax_amt')) {
            document.getElementById('si_cust_tax_amt').value = '0.00';
        }

        let finalNet = isTax ? (grandNet + freight + custTaxAmt) : (grossTotalVal + freight);

        const custCode = document.getElementById('si_cust_code')?.value?.trim();
        const paidEl = document.getElementById('si_paid');
        if (paidEl && document.activeElement === paidEl) {
            paidEl.dataset.userEdited = 'true';
            paidEl.dataset.autoFilled = 'false';
        }
        const isUserEdited = paidEl?.dataset.userEdited === 'true';

        if (isUserEdited || this.currentId) {
            paid = parseFloat(paidEl ? paidEl.value : 0) || 0;
        } else if (custCode === '12001001' && !this.currentId) {
            paid = finalNet;
            if (paidEl && document.activeElement !== paidEl) {
                paidEl.value = finalNet > 0 ? finalNet.toFixed(2) : '0.00';
                paidEl.dataset.autoFilled = 'true';
            }
        } else {
            paid = parseFloat(paidEl ? paidEl.value : 0) || 0;
        }

        if (document.getElementById('si_net_tot')) document.getElementById('si_net_tot').value = finalNet.toFixed(2);
        if (document.getElementById('si_balance')) document.getElementById('si_balance').value = (finalNet - paid).toFixed(2);

        this.updateAmountInWords(finalNet);
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
        const el = document.getElementById('si_amt_words');
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
        const isTaxEl = document.getElementById('si_is_tax');
        if (!isTaxEl) return;
        const isTax = isTaxEl.checked;
        const taxCols = document.querySelectorAll('.pi-tax-col, .pi-tax-field');
        const nonTaxCols = document.querySelectorAll('.pi-nontax-col');
        
        taxCols.forEach(el => el.style.display = isTax ? '' : 'none');
        nonTaxCols.forEach(el => el.style.display = isTax ? 'none' : '');
        this.calculateTotals();
        this.updateLeadColspans();
        
        if (fetchNextSerial) {
            if (this.currentId === null) {
                try {
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const is_tax_val = isTax ? 1 : 0;
                    const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${session.company_id || 1}&is_tax=${is_tax_val}`);
                    const data = await res.json();
                    const snEl = document.getElementById('si_sn');
                    if (snEl) snEl.value = data.next_sn || 1;
                } catch (err) {}
            } else {
                this.navigate('last');
            }
        }
    },

    resetForm: async function(fetchNext = false) {
        this.currentId = null;
        this.selectedCustomer = null;
        const container = document.getElementById('saleInvoiceContainer');
        if (!container) return;
        
        // Preserve context
        const isTaxEl = document.getElementById('si_is_tax');
        const wasTax = isTaxEl ? isTaxEl.checked : false;
        
        const paidEl = document.getElementById('si_paid');
        if (paidEl) {
            paidEl.dataset.userEdited = 'false';
            paidEl.dataset.autoFilled = 'false';
        }

        container.querySelectorAll('input:not(#income_code):not(#income_name):not(#si_sn):not(#si_date), textarea').forEach(el => {
            if(el.type === 'checkbox' && el.id !== 'si_is_tax') el.checked = false;
            else if(el.type !== 'checkbox') el.value = '';
        });
        
        if (isTaxEl) isTaxEl.checked = wasTax; // Restore is_tax
        if (document.getElementById('si_cust_tax_lbl')) {
            document.getElementById('si_cust_tax_lbl').innerText = 'WHT-236G/236H';
        }
        this.toggleCancelledStamp();
        
        const dcTextEl = document.getElementById('si_converted_dc_text');
        const dcNoEl = document.getElementById('si_converted_dc_no');
        if (dcNoEl) { dcNoEl.innerText = ''; dcNoEl.setAttribute('data-sn', '0'); }
        if (dcTextEl) dcTextEl.style.display = 'none';

        const ogpTextEl = document.getElementById('si_converted_ogp_text');
        const ogpNoEl = document.getElementById('si_converted_ogp_no');
        if (ogpNoEl) { ogpNoEl.innerText = ''; ogpNoEl.setAttribute('data-sn', '0'); }
        if (ogpTextEl) ogpTextEl.style.display = 'none';
        
        // Restore default location
        if (this.locations && this.locations.length > 0) {
            let defaultLoc = this.locations.find(l => l.name && l.name.toLowerCase().includes('main store')) || this.locations[0];
            if (defaultLoc) {
                const locInput = document.getElementById('si_location');
                const locText = document.getElementById('si_location_text');
                if (locInput && locText) {
                    locInput.value = defaultLoc.id;
                    locText.innerText = defaultLoc.name;
                }
            }
        } else {
            const locText = document.getElementById('si_location_text');
            if (locText) locText.innerText = 'Select Location';
        }
        
        const dateEl = document.getElementById('si_date');
        if (dateEl) dateEl.valueAsDate = new Date();
        
        const tbody = document.getElementById('siGridBody');
        if (tbody) {
            tbody.innerHTML = '';
            this.ensureDefaultRows(40);
        }
        
        if (fetchNext) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const isTax = document.getElementById('si_is_tax')?.checked ? 1 : 0;
                const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${session.company_id || 1}&is_tax=${isTax}`);
                const data = await res.json();
                if (this.currentId !== null) return;
                const snEl = document.getElementById('si_sn');
                if (snEl) snEl.value = data.next_sn || 1;
            } catch (err) {
                console.error("Error fetching next serial:", err);
            }
        }
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
                const el = document.getElementById('si_converted_dc_no');
                if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                const textEl = document.getElementById('si_converted_dc_text');
                if (textEl) textEl.style.display = 'block';
                
                const siSnToConvert = document.getElementById('si_sn').value;
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
                                        const isTaxConvert = document.getElementById('si_is_tax') ? document.getElementById('si_is_tax').checked : false;
                                        window.DeliveryChallanModule.fetchSaleInvoiceData(siSnToConvert, isTaxConvert);
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
                const el = document.getElementById('si_converted_ogp_no');
                if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                const textEl = document.getElementById('si_converted_ogp_text');
                if (textEl) textEl.style.display = 'block';
                
                const siSnToConvert = document.getElementById('si_sn').value;
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
                                        const isTaxConvert = document.getElementById('si_is_tax') ? document.getElementById('si_is_tax').checked : false;
                                        window.OGPModule.fetchSaleInvoiceData(siSnToConvert, isTaxConvert);
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

    convertToFBR: async function() {
        const saveBtn = document.querySelector('.si-btn-save');
        const origText = saveBtn ? saveBtn.innerText : '';
        try {
            let customerId = document.getElementById('si_cust_code')?.dataset?.coaId;
            const customerCode = (document.getElementById('si_cust_code')?.value || '').trim();
            const customerName = (document.getElementById('si_cust_name')?.value || '').trim();

            if (!customerId && customerCode && Array.isArray(this.customers)) {
                const found = this.customers.find(c => (c.code || '').trim().toLowerCase() === customerCode.toLowerCase());
                if (found) customerId = found.id || found.coa_id;
            }

            if (!customerId && !customerCode && !customerName) {
                alert("Please select a valid Customer first!");
                return;
            }

            if (customerId && document.getElementById('si_cust_code')) {
                document.getElementById('si_cust_code').dataset.coaId = customerId;
            }

            const rows = document.querySelectorAll('#siGridBody > tr');
            let hasItems = false;
            rows.forEach(tr => {
                const desc = (tr.querySelector('.si-description')?.value || '').trim();
                const qty = parseFloat(tr.querySelector('.qty')?.value) || 0;
                const pieces = parseFloat(tr.querySelector('.pieces')?.value) || 0;
                const itemCode = (tr.querySelector('.item-code-search')?.value || '').trim();
                if (tr.dataset.coaId || desc || itemCode || qty > 0 || pieces > 0) {
                    hasItems = true;
                }
            });

            if (!hasItems) {
                alert("Please enter at least one item before converting to FBR Digital Invoice.");
                return;
            }

            // 1. Save current Sale Invoice first so it is preserved
            if (saveBtn) saveBtn.innerText = 'Converting...';
            try {
                await this.saveInvoice(true);
            } catch (e) {
                console.warn("Sale invoice auto-save warning during convert:", e);
            }
            if (saveBtn && origText) saveBtn.innerText = origText;

            // 2. Gather full data from Sale Invoice form
            const siSn = document.getElementById('si_sn')?.value || '';
            const invDate = document.getElementById('si_date')?.value || new Date().toISOString().split('T')[0];
            const isTax = document.getElementById('si_is_tax') ? document.getElementById('si_is_tax').checked : true;
            const customerAddress = document.getElementById('si_cust_address')?.value || '';
            const customerPhone = document.getElementById('si_cust_phone')?.value || '';
            const customerGst = document.getElementById('si_cust_gst')?.value || '';
            const customerNtn = document.getElementById('si_cust_ntn')?.value || '';
            const freight = document.getElementById('si_freight')?.value || '0.00';
            const whtPct = document.getElementById('si_cust_tax_pct') ? document.getElementById('si_cust_tax_pct').value : '0.0';
            const whtAmt = document.getElementById('si_cust_tax_amt') ? document.getElementById('si_cust_tax_amt').value : '0.00';
            const whtType = document.getElementById('si_cust_tax_wht') ? document.getElementById('si_cust_tax_wht').value : '';
            const netTotal = document.getElementById('si_net_tot')?.value || '0.00';
            const paid = document.getElementById('si_paid')?.value || '0.00';
            const bal = document.getElementById('si_bal')?.value || '0.00';
            const remarks = document.getElementById('si_remarks')?.value || '';

            const items = [];
            rows.forEach(tr => {
                const desc = (tr.querySelector('.si-description')?.value || '').trim();
                const qty = parseFloat(tr.querySelector('.qty')?.value) || 0;
                const pieces = parseFloat(tr.querySelector('.pieces')?.value) || 0;
                const rate = parseFloat(tr.querySelector('.rate')?.value) || 0;
                const itemCode = (tr.querySelector('.item-code-search')?.value || '').trim();
                const coaId = tr.dataset.coaId || '';

                if (!desc && qty === 0 && pieces === 0 && !itemCode && !coaId) return;

                const valExcl = parseFloat(tr.querySelector('.val-excl')?.value) || 
                                parseFloat(tr.querySelector('.gross-amt')?.value) || 
                                parseFloat(((qty || pieces || 1) * rate).toFixed(2)) || 0;

                const staxRate = parseFloat(tr.querySelector('.stax-rate')?.value) || 0;
                let staxAmt = parseFloat(tr.querySelector('.stax-amt')?.value) || 0;
                if (staxAmt === 0 && staxRate > 0 && valExcl > 0 && tr.dataset.manualStax !== "1") {
                    staxAmt = parseFloat((valExcl * (staxRate / 100)).toFixed(2));
                }
                const ftaxRate = parseFloat(tr.querySelector('.ftax-rate')?.value) || 0;
                let ftaxAmt = parseFloat(tr.querySelector('.ftax-amt')?.value) || 0;
                if (ftaxAmt === 0 && ftaxRate > 0 && valExcl > 0 && tr.dataset.manualFtax !== "1") {
                    ftaxAmt = parseFloat((valExcl * (ftaxRate / 100)).toFixed(2));
                }
                const discAmt = parseFloat(tr.querySelector('.disc-amt')?.value) || 0;
                let valIncl = parseFloat(tr.querySelector('.val-incl')?.value) || parseFloat(tr.querySelector('.net-amt')?.value) || 0;
                if (valIncl === 0 && valExcl > 0) {
                    valIncl = parseFloat((valExcl + staxAmt + ftaxAmt - discAmt).toFixed(2));
                }

                items.push({
                    item_id: coaId,
                    item_code: itemCode,
                    item_name: desc,
                    description: desc,
                    hs_code: tr.querySelector('.hs-code')?.value || '39172300',
                    pieces: pieces,
                    qty_per_piece: parseFloat(tr.dataset.qtyPerPiece) || 0,
                    quantity: qty || pieces || 1,
                    unit: tr.querySelector('.si-unit')?.value || 'PCS',
                    uom: tr.querySelector('.si-unit')?.value || 'PCS',
                    rate: rate,
                    gross_amount: valExcl,
                    val_excl_tax: valExcl,
                    discount_amount: discAmt,
                    tax_rate: staxRate,
                    sales_tax_rate: staxRate,
                    sales_tax_amount: staxAmt,
                    further_tax_rate: ftaxRate,
                    further_tax_amount: ftaxAmt,
                    extra_tax_rate: 0,
                    extra_tax_amount: 0,
                    fed_rate: 0,
                    fed_amount: 0,
                    val_incl_tax: valIncl,
                    net_amount: valIncl
                });
            });

            const conversionPayload = {
                serial_no: siSn,
                is_tax_invoice: isTax,
                invoice_date: invDate,
                invoice_type: 'Tax Invoice',
                supply_type: 'Wholesaler',
                customer_coa_id: customerId,
                customer_code: customerCode,
                customer_name: customerName,
                customer_address: customerAddress,
                customer_phone: customerPhone,
                customer_gst: customerGst,
                customer_ntn: customerNtn,
                carriage_freight: freight,
                wht_rate: whtPct,
                withholding_tax: whtAmt,
                wht_type: whtType,
                net_total: netTotal,
                amount_received: paid,
                balance: bal,
                remarks: remarks,
                items: items
            };

            // 3. Set global conversion state
            window.pendingFbrConversion = conversionPayload;
            window.hasConvertedFbr = false;

            const openFn = (typeof window.openSecondaryModularPopup === 'function')
                ? window.openSecondaryModularPopup
                : window.openModularPopup;

            openFn('Navigation/DigitalInvoicing/digital_invoice.html', 'fa-file-invoice', 'FBR Digital Invoice', () => {
                let tries = 0;
                const checkModule = setInterval(async () => {
                    tries++;
                    if (!window.pendingFbrConversion) {
                        clearInterval(checkModule);
                        return;
                    }
                    if (window.DigitalInvoiceModule && typeof window.DigitalInvoiceModule.convertFromSaleInvoice === 'function' && document.getElementById('digitalInvoiceContainer')) {
                        clearInterval(checkModule);
                        const pending = window.pendingFbrConversion;
                        window.pendingFbrConversion = null;
                        await window.DigitalInvoiceModule.convertFromSaleInvoice(pending);
                    } else if (tries > 50) {
                        clearInterval(checkModule);
                        console.error("DigitalInvoiceModule not loaded within timeout.");
                    }
                }, 100);
            }, 'FBR Digital Invoice', true, true);
        } catch (err) {
            console.error("Convert to FBR Error:", err);
            alert("Failed to convert to FBR Digital Invoice: " + (err.message || err));
        } finally {
            if (saveBtn && origText) saveBtn.innerText = origText;
        }
    },

    saveInvoice: async function(silent = false) {
        const customerId = document.getElementById('si_cust_code').dataset.coaId;
        if (!customerId) {
            if (!silent) alert("Please select a valid Customer!");
            return false;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const payload = {
            id: this.currentId,
            serial_no: document.getElementById('si_sn').value,
            is_tax_invoice: document.getElementById('si_is_tax').checked,
            invoice_date: document.getElementById('si_date').value,
            invoice_type: document.getElementById('si_type').value,
            delivery_challan_no: document.getElementById('si_dc_no').value,
            delivery_challan_date: document.getElementById('si_dc_date').value,
            customer_order_no: document.getElementById('si_po_no').value,
            customer_order_date: document.getElementById('si_po_date').value,
            payment_terms: document.getElementById('si_payment_terms').value,
            income_account: document.getElementById('income_code').value,
            customer_coa_id: customerId,
            customer_name: (document.getElementById('si_cust_name')?.value || '').trim(),
            customer_address: document.getElementById('si_cust_address').value,
            customer_telephone: document.getElementById('si_cust_phone').value,
            customer_ntn: document.getElementById('si_cust_ntn').value,
            customer_gst: document.getElementById('si_cust_gst').value,
            inventory_location_id: document.getElementById('si_location').value,
            job_no: document.getElementById('si_job_desc').value,
            employee_ref: document.getElementById('si_emp_ref').value,
            remarks: document.getElementById('si_remarks').value,
            amount_in_words: document.getElementById('si_amt_words').innerText,
            carriage_freight: document.getElementById('si_freight').value,
            additional_discount: document.getElementById('si_add_disc').value,
            customer_tax_rate: document.getElementById('si_cust_tax_pct') ? document.getElementById('si_cust_tax_pct').value : 0,
            customer_tax_amount: document.getElementById('si_cust_tax_amt') ? document.getElementById('si_cust_tax_amt').value : 0,
            customer_wht_type: document.getElementById('si_cust_tax_wht') ? document.getElementById('si_cust_tax_wht').value : '',
            net_total: document.getElementById('si_net_tot').value,
            amount_received: document.getElementById('si_paid').value,
            is_cancelled: document.getElementById('si_is_cancelled')?.checked ? 1 : 0,
            converted_dc_no: document.getElementById('si_converted_dc_no')?.innerText || null,
            converted_ogp_no: document.getElementById('si_converted_ogp_no')?.innerText || null,
            items: []
        };

        document.querySelectorAll('#siGridBody tr.si-item-row').forEach(tr => {
            if (!tr.dataset.coaId) return;
            const catKey = tr.dataset.categoryKey || '';
            const cfg = this.getCategoryConfig(catKey);
            const unitSelect = tr.querySelector('.si-unit-select');
            const selectedUnit = unitSelect ? unitSelect.value : (tr.querySelector('.si-unit')?.value || 'Pcs');

            const q1 = parseFloat(tr.querySelector('.col-qty1')?.value) || 0;
            const q2 = parseFloat(tr.querySelector('.col-qty2')?.value) || 0;
            const q3 = parseFloat(tr.querySelector('.col-qty3')?.value) || 0;
            const rate = parseFloat(tr.querySelector('.rate')?.value) || 0;
            const gross = parseFloat(tr.querySelector('.gross-amt')?.value) || 0;

            let pcs = 0, lengthVal = 0, weightVal = q3, cartonVal = 0, billedQty = q1;
            if (cfg.type === 'pipe') {
                pcs = q1;
                lengthVal = q2;
                weightVal = q3;
                cartonVal = 0;
            } else if (cfg.type === 'fitting') {
                cartonVal = q1;
                pcs = q2;
                weightVal = q3;
                lengthVal = 0;
            } else {
                pcs = q1;
                lengthVal = q2;
                weightVal = q3;
            }

            if (cfg.rateBasis === 'col1') billedQty = q1;
            else if (cfg.rateBasis === 'col2') billedQty = q2;
            else if (cfg.rateBasis === 'col3') billedQty = q3;
            else if (cfg.rateBasis === 'unit_based') {
                if (selectedUnit === 'Kgs') billedQty = q3;
                else if (selectedUnit === 'Feet' || selectedUnit === 'Mtr') billedQty = q2;
                else if (selectedUnit === 'Ctn') billedQty = (cfg.type === 'fitting' ? q2 : q1);
                else billedQty = q1;
            } else {
                if (cfg.type === 'pipe') {
                    if (selectedUnit === 'Feet' || selectedUnit === 'Mtr') billedQty = lengthVal;
                    else if (selectedUnit === 'Kgs') billedQty = weightVal;
                    else billedQty = pcs;
                } else if (cfg.type === 'fitting') {
                    if (selectedUnit === 'Pcs') billedQty = pcs;
                    else if (selectedUnit === 'Kgs') billedQty = weightVal;
                    else billedQty = pcs;
                } else {
                    billedQty = q1 > 0 ? q1 : (q2 > 0 ? q2 : q3);
                }
            }

            const isTax = document.getElementById('si_is_tax')?.checked;

            payload.items.push({
                item_coa_id: tr.dataset.coaId,
                hs_code: tr.querySelector('.hs-code')?.value || '',
                description: tr.querySelector('.si-description')?.value || '',
                pieces: pcs,
                quantity: billedQty,
                unit: selectedUnit,
                rate: rate,
                gross_amount: gross,
                discount_percent: parseFloat(tr.querySelector('.disc-perc')?.value) || 0,
                discount_amount: parseFloat(tr.querySelector('.disc-amt')?.value) || 0,
                sales_tax_rate: parseFloat(tr.querySelector('.stax-rate')?.value) || 0,
                sales_tax_amount: parseFloat(tr.querySelector('.stax-amt')?.value) || 0,
                further_tax_rate: parseFloat(tr.querySelector('.ftax-rate')?.value) || 0,
                further_tax_amount: parseFloat(tr.querySelector('.ftax-amt')?.value) || 0,
                net_amount: isTax ? (parseFloat(tr.querySelector('.val-incl')?.value) || 0) : (parseFloat(tr.querySelector('.net-amt')?.value) || 0),
                length_val: lengthVal,
                weight_val: weightVal,
                carton_val: cartonVal
            });
        });

        // if (payload.items.length === 0) {
        //     if (!silent) alert("Please add at least one item!");
        //     return false;
        // }

        try {
            const res = await fetch(`api/sale_invoice.php?action=save_invoice&company_id=${session.company_id || 1}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') { 
                this.currentId = result.id;
                this.isPosted = true;
                const savedSn = parseInt(result.serial_no) || parseInt(payload.serial_no) || 0;
                this.lastSaved = {
                    id: result.id,
                    serial_no: savedSn,
                    is_tax: payload.is_tax_invoice ? 1 : 0
                };
                try {
                    localStorage.setItem('softifyx_si_last_saved_' + (session.company_id || 1), JSON.stringify(this.lastSaved));
                } catch(e) {}
                // Update Post button and stamp to reflect auto-posted state
                const postBtn = document.getElementById('si_post_btn');
                const stamp = document.getElementById('si_posted_stamp');
                if (postBtn) { postBtn.innerText = 'Un-Post'; }
                if (stamp) stamp.style.display = 'block';
                if (!silent) {
                    this.showToast('Invoice saved and posted successfully!');
                    this.resetForm(true);
                }
                return true;
            } else { 
                if (!silent) alert("Error: " + result.message); 
                return false;
            }
        } catch (e) { 
            if (!silent) alert("Failed to save."); 
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
            const res = await fetch(`api/sale_invoice.php?action=toggle_post_invoice&company_id=${session.company_id || 1}`, {
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
        let toast = document.getElementById('si_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'si_toast';
            toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1F4E79;color:#fff;padding:8px 24px;border-radius:20px;font-size:12px;font-weight:600;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.3s;';
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    },

    retrieveLastSaved: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const isTax = document.getElementById('si_is_tax')?.checked ? 1 : 0;

        let targetId = null;

        // 1. Check in-memory lastSaved (if saved during this session)
        if (this.lastSaved && this.lastSaved.id) {
            targetId = this.lastSaved.id;
        }

        // 2. If not in memory, check localStorage for this company
        if (!targetId) {
            try {
                const stored = JSON.parse(localStorage.getItem('softifyx_si_last_saved_' + companyId) || 'null');
                if (stored && stored.id) {
                    targetId = stored.id;
                }
            } catch(e) {}
        }

        // 3. Query backend get_last_saved API (checks database updated_at / created_at DESC)
        try {
            const res = await fetch(`api/sale_invoice.php?action=get_last_saved&company_id=${companyId}&is_tax=${isTax}`);
            const data = await res.json();
            if (data && data.status === 'success' && data.id) {
                if (!targetId) {
                    targetId = data.id;
                }
            }
        } catch(e) {}

        // 4. Load the target invoice if found
        if (targetId) {
            try {
                const res = await fetch(`api/sale_invoice.php?action=get_invoice&id=${targetId}&company_id=${companyId}`);
                const inv = await res.json();
                if (inv && inv.id && inv.invoice_type !== 'POS') {
                    this.loadInvoiceData(inv);
                    this.showToast(`Retrieved last saved invoice #${inv.serial_no}`);
                    return;
                } else {
                    try { localStorage.removeItem('softifyx_si_last_saved_' + companyId); } catch(e) {}
                    this.lastSaved = null;
                }
            } catch(e) {
                console.error("Error loading last saved invoice:", e);
            }
        }

        // 5. Fallback: If no saved invoice record found, load highest sequential invoice
        try {
            const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTax}`);
            const data = await res.json();
            const sn = (data.next_sn || 2) - 1;
            if (sn >= 1) {
                const res2 = await fetch(`api/sale_invoice.php?action=get_invoice&serial_no=${sn}&company_id=${companyId}&is_tax=${isTax}`);
                const inv2 = await res2.json();
                if (inv2 && inv2.id) {
                    this.loadInvoiceData(inv2);
                    return;
                }
            }
        } catch(e) {}

        this.showToast('No saved invoice found');
    },

    navigate: async function(dir) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        let sn = parseInt(document.getElementById('si_sn').value) || 0;
        const isTax = document.getElementById('si_is_tax')?.checked ? 1 : 0;

        if (dir === 'last') {
            try {
                const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTax}`);
                const data = await res.json();
                sn = (data.next_sn || 2) - 1;
                dir = undefined;
            } catch(e) { return; }
        } else if (sn === 0) {
            if (dir === 'next') {
                try {
                    const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTax}`);
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

        // If on an unsaved new form (currentId is null), and user clicks 'prev',
        // ensure sn is set to fetch the latest existing record
        if (dir === 'prev' && this.currentId === null && sn <= 1) {
            try {
                const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTax}`);
                const data = await res.json();
                if (data && data.next_sn && data.next_sn > 1) {
                    sn = data.next_sn;
                }
            } catch(e) {}
        }

        if (sn < 1 && dir !== 'next' && dir !== 'prev') return; // Silent â€” already at first

        try {
            let url = `api/sale_invoice.php?action=get_invoice&serial_no=${sn}&company_id=${companyId}&is_tax=${isTax}`;
            if (dir === 'next' || dir === 'prev') {
                url += `&dir=${dir}`;
            }
            if (this.currentId) {
                url += `&current_id=${this.currentId}`;
            }
            const res = await fetch(url);
            const inv = await res.json();
            
            if (inv && inv.id) {
                this.loadInvoiceData(inv);
            } else {
                if (dir === 'next' || dir === 'last') {
                    this.showToast('Ø¢Ù¾ Ø¢Ø®Ø±ÛŒ Ø±ÛŒÚ©Ø§Ø±Úˆ Ù¾Ø± ÛÛŒÚº - You are on the last record');
                } else if (dir === 'prev') {
                    this.showToast('Ø¢Ù¾ Ù¾ÛÙ„Û’ Ø±ÛŒÚ©Ø§Ø±Úˆ Ù¾Ø± ÛÛŒÚº - You are on the first record');
                } else {
                    await this.resetForm(false);
                    document.getElementById('si_sn').value = sn;
                    document.getElementById('si_date').value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (e) { console.error("Navigation error:", e); }
    },

    loadInvoiceData: function(inv) {
        this.currentId = inv.id;
        document.getElementById('si_sn').value = inv.serial_no;
        
        // Post/Un-post UI
        const postBtn = document.getElementById('si_post_btn');
        const stamp = document.getElementById('si_posted_stamp');
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
        
        document.getElementById('si_is_tax').checked = inv.is_tax_invoice == 1;
        document.getElementById('si_date').value = inv.invoice_date || '';
        document.getElementById('si_type').value = inv.invoice_type || 'Sale Invoice';
        document.getElementById('si_dc_no').value = inv.delivery_challan_no || '';
        document.getElementById('si_dc_date').value = inv.delivery_challan_date || '';
        document.getElementById('si_po_no').value = inv.customer_order_no || '';
        document.getElementById('si_po_date').value = inv.customer_order_date || '';
        document.getElementById('si_payment_terms').value = inv.payment_terms || '';
        document.getElementById('income_code').value = inv.income_account || '';
        document.getElementById('si_location').value = inv.inventory_location_id || '';
        document.getElementById('si_job_desc').value = inv.job_no || '';
        document.getElementById('si_emp_ref').value = inv.employee_ref || '';
        document.getElementById('si_remarks').value = inv.remarks || '';
        document.getElementById('si_freight').value = inv.carriage_freight || '0.00';
        if (document.getElementById('si_net_tot')) document.getElementById('si_net_tot').value = '0.00';
        if (document.getElementById('si_balance')) document.getElementById('si_balance').value = '0.00';
        if (document.getElementById('si_gross_tot')) document.getElementById('si_gross_tot').value = '0.00';

        let paidAmt = (inv.amount_received !== null && inv.amount_received !== undefined && inv.amount_received !== '') 
            ? parseFloat(inv.amount_received) 
            : 0;
        const paidEl = document.getElementById('si_paid');
        if (paidEl) {
            paidEl.value = paidAmt.toFixed(2);
            paidEl.dataset.userEdited = 'true';
            paidEl.dataset.autoFilled = 'false';
        }

        if (inv.customer_coa_id) {
            const v = this.customers.find(x => x.id == inv.customer_coa_id || x.coa_list_id == inv.customer_coa_id);
            this.selectedCustomer = v || null;
            const custCodeEl = document.getElementById('si_cust_code');
            if (custCodeEl) {
                custCodeEl.value = (inv.customer && inv.customer.code) ? inv.customer.code : (v ? v.code : '');
                custCodeEl.dataset.coaId = inv.customer_coa_id;
            }
            const loadedCustName = (inv.customer && inv.customer.name) ? inv.customer.name : (inv.customer_name || (v ? v.name : ''));
            if (document.getElementById('si_cust_name')) {
                document.getElementById('si_cust_name').value = loadedCustName;
            }
            if (document.getElementById('si_cust_address')) {
                document.getElementById('si_cust_address').value = (inv.customer && inv.customer.address) || inv.customer_address || (v ? v.address : '') || '';
            }
            if (document.getElementById('si_cust_phone')) {
                document.getElementById('si_cust_phone').value = (inv.customer && inv.customer.telephone) || inv.customer_telephone || (v ? v.telephone : '') || '';
            }
            if (document.getElementById('si_cust_ntn')) {
                document.getElementById('si_cust_ntn').value = (inv.customer && inv.customer.ntn) || inv.customer_ntn || (v ? v.ntn_cnic : '') || '';
            }
            if (document.getElementById('si_cust_gst')) {
                document.getElementById('si_cust_gst').value = (inv.customer && inv.customer.gst_reg_no) || inv.customer_gst || (v ? v.st_reg_no : '') || '';
            }
        }

        if (document.getElementById('si_cust_tax_pct')) {
            document.getElementById('si_cust_tax_pct').value = inv.customer_tax_rate || 0;
            const whtType = inv.customer_wht_type || 'WHT-236G/236H';
            if (document.getElementById('si_cust_tax_wht')) {
                document.getElementById('si_cust_tax_wht').value = whtType;
            }
            if (document.getElementById('si_cust_tax_lbl')) {
                let displayWht = whtType;
                if (whtType !== 'WHT-236G/236H' && !whtType.toUpperCase().includes('WHT')) {
                    displayWht = 'WHT ' + whtType;
                }
                document.getElementById('si_cust_tax_lbl').innerText = displayWht + ' (' + parseFloat(inv.customer_tax_rate || 0) + '%)';
            }
            if (document.getElementById('si_cust_tax_amt')) {
                document.getElementById('si_cust_tax_amt').value = parseFloat(inv.customer_tax_amount || 0).toFixed(2);
            }
        }

        const tbody = document.getElementById('siGridBody');
        tbody.innerHTML = '';
        if (inv.items && inv.items.length > 0) {
            inv.items.forEach(item => {
                const invMatch = (this.inventory || []).find(i => String(i.id) === String(item.item_coa_id) || String(i.code) === String(item.inv_code || item.item_code));
                const merged = Object.assign({}, invMatch || {}, item);
                this.addItemRow(merged);
            });
        }
        this.ensureDefaultRows(40);
        this.calculateTotals();
        this.updateLeadColspans();
        this.toggleTaxMode(false);

        const isCancelled = parseInt(inv.is_cancelled) === 1;
        const cancelCb = document.getElementById('si_is_cancelled');
        if (cancelCb) cancelCb.checked = isCancelled;
        this.toggleCancelledStamp();

        // Restore converted DC/OGP status
        const dcTextEl = document.getElementById('si_converted_dc_text');
        const dcNoEl = document.getElementById('si_converted_dc_no');
        if (inv.converted_dc_no) {
            if (dcNoEl) dcNoEl.innerText = inv.converted_dc_no;
            if (dcTextEl) dcTextEl.style.display = 'block';
        } else {
            if (dcNoEl) dcNoEl.innerText = '';
            if (dcTextEl) dcTextEl.style.display = 'none';
        }

        const ogpTextEl = document.getElementById('si_converted_ogp_text');
        const ogpNoEl = document.getElementById('si_converted_ogp_no');
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
            const res = await fetch(`api/sale_invoice.php?action=delete_invoice&id=${this.currentId}&company_id=${session.company_id || 1}`, { method: 'POST' });
            const result = await res.json();
            if (result.status === 'success') { 
                if (this.lastSaved && this.lastSaved.id === this.currentId) {
                    this.lastSaved = null;
                    try { localStorage.removeItem('softifyx_si_last_saved_' + (session.company_id || 1)); } catch(e) {}
                }
                alert("Deleted!"); 
                this.resetForm(true); 
            }
        } catch (e) { alert("Failed."); }
    },

    getDefaultPrintSettings: function() {
        return {
            paper: 'A4',
            // Seller Information
            seller_name: true,
            seller_address: true,
            seller_strn: true,
            seller_ntn: true,
            seller_phone: true,
            seller_web: true,
            seller_logo: true,
            no_headers: false,
            // Buyer Information
            buyer_name: true,
            buyer_address: true,
            buyer_strn: true,
            buyer_ntn: true,
            buyer_cnic: true,
            buyer_phone: true,
            // Category Reporting
            cat_grouping: true,
            cat_subtotals: true,
            cat_subtotal_qty: true,
            // Quantity Columns
            qty_pcs: true,
            qty_ctn: true,
            qty_length: true,
            qty_weight: true,
            // Invoice Grid Columns
            col_code: true,
            col_hs: false,
            col_desc: true,
            col_unit: true,
            col_rate: true,
            col_gross: true,
            col_disc: true,
            col_tax: true,
            // Summary & Totals
            tot_add_disc: true,
            tot_gross: true,
            tot_freight: true,
            tot_words: true,
            tot_paid_bal: true,
            tot_prev_bal: true,
            tot_curr_bal: true,
            tot_remarks: true,
            tot_prepared_by: true
        };
    },

    loadPrintSettings: function() {
        const defaults = this.getDefaultPrintSettings();
        let saved = {};
        try {
            const raw = localStorage.getItem('sale_invoice_print_settings');
            if (raw) saved = JSON.parse(raw);
        } catch(e) {}
        
        // Backward compatibility with legacy separate keys
        if (saved.paper === undefined && localStorage.getItem('si_sett_paper')) {
            saved.paper = localStorage.getItem('si_sett_paper');
        }
        if (saved.no_headers === undefined && localStorage.getItem('si_sett_no_headers') !== null) {
            saved.no_headers = localStorage.getItem('si_sett_no_headers') === '1';
        }
        if (saved.col_hs === undefined && localStorage.getItem('si_sett_print_hs') !== null) {
            saved.col_hs = localStorage.getItem('si_sett_print_hs') === '1';
        }
        if (saved.col_tax === undefined && localStorage.getItem('si_sett_print_tax') !== null) {
            saved.col_tax = localStorage.getItem('si_sett_print_tax') === '1';
        }
        if (saved.col_disc === undefined && localStorage.getItem('si_sett_print_disc') !== null) {
            saved.col_disc = localStorage.getItem('si_sett_print_disc') === '1';
        }

        return Object.assign({}, defaults, saved);
    },

    getPrintSettings: function() {
        const modal = document.getElementById('siPrintSettingsModal');
        if (modal && document.getElementById('si_sett_seller_name')) {
            const getLiveCb = (id, def = true) => {
                const el = document.getElementById(id);
                return el ? el.checked : def;
            };

            const paperRadios = document.getElementsByName('si_print_paper');
            let paper = 'A4';
            for (let r of paperRadios) { if (r.checked) paper = r.value; }

            return {
                paper: paper,
                seller_name: getLiveCb('si_sett_seller_name', true),
                seller_address: getLiveCb('si_sett_seller_address', true),
                seller_strn: getLiveCb('si_sett_seller_strn', true),
                seller_ntn: getLiveCb('si_sett_seller_ntn', true),
                seller_phone: getLiveCb('si_sett_seller_phone', true),
                seller_web: getLiveCb('si_sett_seller_web', true),
                seller_logo: getLiveCb('si_sett_seller_logo', true),
                no_headers: getLiveCb('si_sett_no_headers', false),
                buyer_name: getLiveCb('si_sett_buyer_name', true),
                buyer_address: getLiveCb('si_sett_buyer_address', true),
                buyer_strn: getLiveCb('si_sett_buyer_strn', true),
                buyer_ntn: getLiveCb('si_sett_buyer_ntn', true),
                buyer_cnic: getLiveCb('si_sett_buyer_cnic', true),
                buyer_phone: getLiveCb('si_sett_buyer_phone', true),
                cat_grouping: getLiveCb('si_sett_cat_grouping', true),
                cat_subtotals: getLiveCb('si_sett_cat_subtotals', true),
                cat_subtotal_qty: getLiveCb('si_sett_cat_subtotal_qty', true),
                qty_pcs: getLiveCb('si_sett_qty_pcs', true),
                qty_ctn: getLiveCb('si_sett_qty_ctn', true),
                qty_length: getLiveCb('si_sett_qty_length', true),
                qty_weight: getLiveCb('si_sett_qty_weight', true),
                col_code: getLiveCb('si_sett_col_code', true),
                col_hs: getLiveCb('si_sett_col_hs', false),
                col_desc: getLiveCb('si_sett_col_desc', true),
                col_unit: getLiveCb('si_sett_col_unit', true),
                col_rate: getLiveCb('si_sett_col_rate', true),
                col_gross: getLiveCb('si_sett_col_gross', true),
                col_disc: getLiveCb('si_sett_col_disc', true),
                col_tax: getLiveCb('si_sett_col_tax', true),
                tot_add_disc: getLiveCb('si_sett_tot_add_disc', true),
                tot_gross: getLiveCb('si_sett_tot_gross', true),
                tot_freight: getLiveCb('si_sett_tot_freight', true),
                tot_words: getLiveCb('si_sett_tot_words', true),
                tot_paid_bal: getLiveCb('si_sett_tot_paid_bal', true),
                tot_prev_bal: getLiveCb('si_sett_tot_prev_bal', true),
                tot_curr_bal: getLiveCb('si_sett_tot_curr_bal', true),
                tot_remarks: getLiveCb('si_sett_tot_remarks', true),
                tot_prepared_by: getLiveCb('si_sett_tot_prepared_by', true)
            };
        }
        return this.loadPrintSettings();
    },

    openPrintSettings: function() {
        const sett = this.getPrintSettings();

        // Format / Paper size radios
        const paperRadios = document.getElementsByName('si_print_paper');
        for (let r of paperRadios) {
            r.checked = (r.value === (sett.paper || 'A4'));
        }

        const setCb = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = Boolean(val);
        };

        // Seller Information
        setCb('si_sett_seller_name', sett.seller_name);
        setCb('si_sett_seller_address', sett.seller_address);
        setCb('si_sett_seller_strn', sett.seller_strn);
        setCb('si_sett_seller_ntn', sett.seller_ntn);
        setCb('si_sett_seller_phone', sett.seller_phone);
        setCb('si_sett_seller_web', sett.seller_web);
        setCb('si_sett_seller_logo', sett.seller_logo);
        setCb('si_sett_no_headers', sett.no_headers);

        // Buyer Information
        setCb('si_sett_buyer_name', sett.buyer_name);
        setCb('si_sett_buyer_address', sett.buyer_address);
        setCb('si_sett_buyer_strn', sett.buyer_strn);
        setCb('si_sett_buyer_ntn', sett.buyer_ntn);
        setCb('si_sett_buyer_cnic', sett.buyer_cnic);
        setCb('si_sett_buyer_phone', sett.buyer_phone);

        // Category Reporting
        setCb('si_sett_cat_grouping', sett.cat_grouping);
        setCb('si_sett_cat_subtotals', sett.cat_subtotals);
        setCb('si_sett_cat_subtotal_qty', sett.cat_subtotal_qty);

        // Quantity Columns
        setCb('si_sett_qty_pcs', sett.qty_pcs);
        setCb('si_sett_qty_ctn', sett.qty_ctn);
        setCb('si_sett_qty_length', sett.qty_length);
        setCb('si_sett_qty_weight', sett.qty_weight);

        // Invoice Grid Columns
        setCb('si_sett_col_code', sett.col_code);
        setCb('si_sett_col_hs', sett.col_hs);
        setCb('si_sett_col_desc', sett.col_desc);
        setCb('si_sett_col_unit', sett.col_unit);
        setCb('si_sett_col_rate', sett.col_rate);
        setCb('si_sett_col_gross', sett.col_gross);
        setCb('si_sett_col_disc', sett.col_disc);
        setCb('si_sett_col_tax', sett.col_tax);

        // Summary & Totals
        setCb('si_sett_tot_add_disc', sett.tot_add_disc);
        setCb('si_sett_tot_gross', sett.tot_gross);
        setCb('si_sett_tot_freight', sett.tot_freight);
        setCb('si_sett_tot_words', sett.tot_words);
        setCb('si_sett_tot_paid_bal', sett.tot_paid_bal);
        setCb('si_sett_tot_prev_bal', sett.tot_prev_bal);
        setCb('si_sett_tot_curr_bal', sett.tot_curr_bal);
        setCb('si_sett_tot_remarks', sett.tot_remarks);
        setCb('si_sett_tot_prepared_by', sett.tot_prepared_by);

        const modal = document.getElementById('siPrintSettingsModal');
        if (modal) {
            modal.style.display = 'flex';
            const inputs = modal.querySelectorAll('input[type="checkbox"], input[type="radio"]');
            inputs.forEach(inp => {
                if (!inp.dataset.siAutoBound) {
                    inp.dataset.siAutoBound = 'true';
                    inp.addEventListener('change', () => {
                        this.savePrintSettings(true);
                    });
                }
            });
        }
    },

    savePrintSettings: async function(silent = false) {
        const getCb = (id, def = true) => {
            const el = document.getElementById(id);
            return el ? el.checked : def;
        };

        const paperRadios = document.getElementsByName('si_print_paper');
        let paper = 'A4';
        for (let r of paperRadios) { if (r.checked) paper = r.value; }

        const sett = {
            paper: paper,
            seller_name: getCb('si_sett_seller_name', true),
            seller_address: getCb('si_sett_seller_address', true),
            seller_strn: getCb('si_sett_seller_strn', true),
            seller_ntn: getCb('si_sett_seller_ntn', true),
            seller_phone: getCb('si_sett_seller_phone', true),
            seller_web: getCb('si_sett_seller_web', true),
            seller_logo: getCb('si_sett_seller_logo', true),
            no_headers: getCb('si_sett_no_headers', false),
            buyer_name: getCb('si_sett_buyer_name', true),
            buyer_address: getCb('si_sett_buyer_address', true),
            buyer_strn: getCb('si_sett_buyer_strn', true),
            buyer_ntn: getCb('si_sett_buyer_ntn', true),
            buyer_cnic: getCb('si_sett_buyer_cnic', true),
            buyer_phone: getCb('si_sett_buyer_phone', true),
            cat_grouping: getCb('si_sett_cat_grouping', true),
            cat_subtotals: getCb('si_sett_cat_subtotals', true),
            cat_subtotal_qty: getCb('si_sett_cat_subtotal_qty', true),
            qty_pcs: getCb('si_sett_qty_pcs', true),
            qty_ctn: getCb('si_sett_qty_ctn', true),
            qty_length: getCb('si_sett_qty_length', true),
            qty_weight: getCb('si_sett_qty_weight', true),
            col_code: getCb('si_sett_col_code', true),
            col_hs: getCb('si_sett_col_hs', false),
            col_desc: getCb('si_sett_col_desc', true),
            col_unit: getCb('si_sett_col_unit', true),
            col_rate: getCb('si_sett_col_rate', true),
            col_gross: getCb('si_sett_col_gross', true),
            col_disc: getCb('si_sett_col_disc', true),
            col_tax: getCb('si_sett_col_tax', true),
            tot_add_disc: getCb('si_sett_tot_add_disc', true),
            tot_gross: getCb('si_sett_tot_gross', true),
            tot_freight: getCb('si_sett_tot_freight', true),
            tot_words: getCb('si_sett_tot_words', true),
            tot_paid_bal: getCb('si_sett_tot_paid_bal', true),
            tot_prev_bal: getCb('si_sett_tot_prev_bal', true),
            tot_curr_bal: getCb('si_sett_tot_curr_bal', true),
            tot_remarks: getCb('si_sett_tot_remarks', true),
            tot_prepared_by: getCb('si_sett_tot_prepared_by', true)
        };

        localStorage.setItem('sale_invoice_print_settings', JSON.stringify(sett));
        localStorage.setItem('si_sett_paper', sett.paper);
        localStorage.setItem('si_sett_no_headers', sett.no_headers ? '1' : '0');
        localStorage.setItem('si_sett_print_hs', sett.col_hs ? '1' : '0');
        localStorage.setItem('si_sett_print_disc', sett.col_disc ? '1' : '0');
        localStorage.setItem('si_sett_print_tax', sett.col_tax ? '1' : '0');

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            fetch(`api/settings.php?action=save_setting&company_id=${coId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: 'sale_invoice_print_settings',
                    value: JSON.stringify(sett)
                })
            });
        } catch(e) {}

        if (!silent) {
            const modal = document.getElementById('siPrintSettingsModal');
            if (modal) modal.style.display = 'none';

            if (typeof showToast === 'function') {
                showToast("Print options saved successfully!", "success");
            } else {
                alert("Print options saved successfully!");
            }
        }
    },

    shareWhatsApp: function() {
        const serialNo = (document.getElementById('si_sn')?.value || (this.currentId ? String(this.currentId) : '')).trim();
        const date = (document.getElementById('si_date')?.value || '').trim();
        const custName = (document.getElementById('si_cust_name')?.value || '').trim();
        const currentPhone = (document.getElementById('si_cust_phone')?.value || '').trim();
        const netTotal = (document.getElementById('si_net_tot')?.value || '0.00').trim();
        const balance = (document.getElementById('si_balance')?.value || '0.00').trim();

        if (!serialNo) {
            alert('Please select or save an invoice first before sharing on WhatsApp.');
            return;
        }

        // Populate and open custom WhatsApp modal
        const invNoEl = document.getElementById('si_wa_inv_no');
        const dateEl = document.getElementById('si_wa_date');
        const custEl = document.getElementById('si_wa_cust_name');
        const netEl = document.getElementById('si_wa_net_total');
        const balEl = document.getElementById('si_wa_balance');
        const phoneEl = document.getElementById('si_wa_phone_input');
        const modal = document.getElementById('siWhatsAppModal');

        if (invNoEl) invNoEl.textContent = serialNo;
        if (dateEl) dateEl.textContent = date || '-';
        if (custEl) custEl.textContent = custName || 'Walk-in / Cash Customer';
        if (netEl) netEl.textContent = 'Rs. ' + netTotal;
        if (balEl) balEl.textContent = 'Rs. ' + (balance || '0.00');
        if (phoneEl) phoneEl.value = currentPhone;

        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => {
                if (phoneEl) {
                    phoneEl.focus();
                    if (phoneEl.value) phoneEl.select();
                }
            }, 80);
        } else {
            // Fallback if modal is not present
            this.executeSendWhatsApp('web');
        }
    },

    closeWhatsAppModal: function() {
        const modal = document.getElementById('siWhatsAppModal');
        if (modal) modal.style.display = 'none';
    },

    buildWhatsAppMessage: function() {
        const serialNo = (document.getElementById('si_sn')?.value || (this.currentId ? String(this.currentId) : '')).trim();
        const date = (document.getElementById('si_date')?.value || '').trim();
        const custName = (document.getElementById('si_cust_name')?.value || '').trim();
        const netTotal = (document.getElementById('si_net_tot')?.value || '0.00').trim();
        const paidAmount = (document.getElementById('si_paid')?.value || '0.00').trim();
        const balance = (document.getElementById('si_balance')?.value || '0.00').trim();
        const custBalance = (document.getElementById('si_cust_balance')?.value || '').trim();

        let companyName = 'SoftifyX ERP';
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            if (session.company_name) companyName = session.company_name;
        } catch(e) {}

        let msg = `*${companyName.toUpperCase()}*\n`;
        msg += `*SALE INVOICE SUMMARY*\n`;
        msg += `--------------------------------\n`;
        msg += `📄 *Invoice #:* ${serialNo}\n`;
        if (date) msg += `📅 *Date:* ${date}\n`;
        if (custName) msg += `👤 *Customer:* ${custName}\n`;
        msg += `💰 *Net Total:* Rs. ${netTotal}\n`;
        if (paidAmount && parseFloat(paidAmount.replace(/,/g, '')) > 0) {
            msg += `💵 *Received:* Rs. ${paidAmount}\n`;
        }
        if (balance && balance !== '0.00' && balance !== netTotal) {
            msg += `⚖️ *Invoice Balance:* Rs. ${balance}\n`;
        }
        if (custBalance && custBalance !== '0.00' && custBalance !== '0') {
            msg += `📊 *Total Ledger Balance:* Rs. ${custBalance}\n`;
        }
        msg += `--------------------------------\n`;
        msg += `Thank you for your business!`;
        return msg;
    },

    executeSendWhatsApp: function(target = 'web') {
        const phoneInput = document.getElementById('si_wa_phone_input');
        const rawPhone = phoneInput ? phoneInput.value.trim() : (document.getElementById('si_cust_phone')?.value || '').trim();
        
        let phone = rawPhone.replace(/[^0-9]/g, '');
        if (target !== 'any') {
            if (phone.startsWith('03')) {
                phone = '92' + phone.substring(1);
            } else if (phone.length === 10 && phone.startsWith('3')) {
                phone = '92' + phone;
            }
        }

        // Sync entered phone number to invoice form so it can be saved with invoice
        if (rawPhone && document.getElementById('si_cust_phone')) {
            document.getElementById('si_cust_phone').value = rawPhone;
        }

        const msg = this.buildWhatsAppMessage();
        let url = '';

        if (target === 'app') {
            url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        } else if (target === 'any') {
            url = `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        } else {
            // Default: WhatsApp Web
            url = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        }

        this.closeWhatsAppModal();
        window.open(url, '_blank');
    },

    copyWhatsAppText: function() {
        const msg = this.buildWhatsAppMessage();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg).then(() => {
                alert('Invoice details copied to clipboard!\nAap WhatsApp par ja kar Paste kar sakte hain.');
            }).catch(() => {
                prompt('Copy text manually:', msg);
            });
        } else {
            prompt('Copy text manually:', msg);
        }
    },

    printInvoiceFromModal: async function() {
        await this.savePrintSettings(true);
        this.printInvoice('print');
    },

    printInvoice: async function(mode = 'print') {
        const custEl = document.getElementById('si_cust_code');
        const customerId = custEl ? custEl.dataset.coaId : null;
        if (!customerId) return alert("Please select a valid Customer before printing!");

        const isVoucher = (mode === true || mode === 'voucher');
        const isExcel = (mode === 'excel');
        const isTax = document.getElementById('si_is_tax')?.checked;

        const sett = this.getPrintSettings();
        const noHeader = Boolean(sett.no_headers);
        const paperSize = sett.paper || 'A4';
        
        let winProps = 'width=980,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
        if (paperSize === 'POS') winProps = 'width=420,height=650,resizable=yes,scrollbars=yes';
        else if (paperSize === 'A5P') winProps = 'width=650,height=850,resizable=yes,scrollbars=yes';
        else if (paperSize === 'A5L') winProps = 'width=850,height=650,resizable=yes,scrollbars=yes';
        
        let printWindow = null;
        if (!isExcel) {
            printWindow = window.open('', '_blank', winProps);
            if (!printWindow) {
                alert("Popup blocked! Please allow popups for this site to print invoices.");
                return;
            }
            try {
                printWindow.document.write(`<!DOCTYPE html><html><head><title>Sale Invoice Print</title><style>body{font-family:'Segoe UI',Arial,Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0b3b60;}.loading-card{text-align:center;background:#fff;padding:35px 50px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.08);border:1px solid #cbd5e1;}.spin{border:4px solid #e2e8f0;border-top:4px solid #0b3b60;border-radius:50%;width:42px;height:42px;animation:sp 0.8s linear infinite;margin:0 auto 14px;}@keyframes sp{to{transform:rotate(360deg);}}</style></head><body><div class="loading-card"><div class="spin"></div><h3 style="margin:0 0 6px 0;color:#0b3b60;">Preparing Sale Invoice...</h3><p style="margin:0;font-size:13px;color:#64748b;">Generating print preview. Please wait.</p></div></body></html>`);
            } catch(e) {}
        } else {
            printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert("Popup blocked! Please allow popups for this site.");
                return;
            }
        }

        try {
            const saveBtn = document.querySelector('.si-tool-btn.si-btn-save');
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

            const sn = document.getElementById('si_sn')?.value || '';
            const date = document.getElementById('si_date')?.value || '';
            const vCode = document.getElementById('si_cust_code')?.value || '';
            const vName = document.getElementById('si_cust_name')?.value || '';
            const vAddress = document.getElementById('si_cust_address')?.value || '';
            const vTel = document.getElementById('si_cust_phone')?.value || '';
            const type = document.getElementById('si_type')?.value || 'Sale Invoice';

            const dcNo = document.getElementById('si_dc_no')?.value || '';
            const dcDate = document.getElementById('si_dc_date')?.value || '';
            const poNo = document.getElementById('si_po_no')?.value || '';
            const poDate = document.getElementById('si_po_date')?.value || '';
            const terms = document.getElementById('si_terms')?.value || '';
            const gstNo = document.getElementById('si_gst_no')?.value || '';
            const ntnNo = document.getElementById('si_ntn_no')?.value || '';
            const vCnic = (custEl && custEl.dataset.cnic) || (this.selectedCustomer && (this.selectedCustomer.cnic || '')) || '';

            const totNet = document.getElementById('si_net_tot')?.value || '0.00';
            const amtWords = document.getElementById('si_amt_words')?.innerText || '';
            const remarks = document.getElementById('si_remarks')?.value || '';
            
            const netTot = parseFloat(totNet.replace(/,/g, '')) || 0;
            const freight = parseFloat(document.getElementById('si_freight')?.value || 0) || 0;
            const addDisc = parseFloat(document.getElementById('si_add_disc')?.value || 0) || 0;
            const amountReceived = parseFloat(document.getElementById('si_paid')?.value || 0) || 0;
            
            const balEl = document.getElementById('si_balance');
            const invoiceBalance = balEl ? parseFloat(balEl.value || 0) : (netTot - amountReceived);
            
            const whtLabel = document.getElementById('si_cust_tax_lbl')?.innerText || '';
            const whtAmt = parseFloat(document.getElementById('si_cust_tax_amt')?.value || 0) || 0;
            
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            
            // Fresh ledger balance
            let ledgerBal = 0;
            try {
                const balRes = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${customerId}&fy_id=${session.fy_id || 0}&company_id=${coId}`);
                if (balRes.ok) {
                    const balData = await balRes.json();
                    ledgerBal = parseFloat(balData.balance || 0);
                }
            } catch(e) {
                console.error("Failed to fetch fresh balance for print:", e);
            }

            const currentBalance = ledgerBal;
            const previousBalance = currentBalance - netTot;

            const formatBal = (val) => {
                if (val < 0) return '(' + Math.abs(val).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ')';
                return val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            };
            const formatAmt = (val) => parseFloat(val || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

            // Live Database Company Profile & Logo
            let coName = session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
            let coAddress = 'Plot No: 19/2/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
            let coPhone = '+92 348 7240256';
            let coEmail = 'info@seastonepipes.com';
            let coWebsite = 'www.seastonepipes.com';
            let coNtn = session.company_ntn || '';
            let coStrn = session.company_strn || session.company_gst || '';
            let customLogo = null;
            
            try {
                const res = await fetch(`api/admin.php?action=get_company&company_id=${coId}&_t=${Date.now()}`);
                if (res.ok) {
                    const dbCo = await res.json();
                    if (dbCo) {
                        if (dbCo.name) coName = dbCo.name;
                        if (dbCo.address) coAddress = dbCo.address;
                        if (dbCo.phone) coPhone = dbCo.phone;
                        if (dbCo.email) coEmail = dbCo.email;
                        if (dbCo.website) coWebsite = dbCo.website;
                        if (dbCo.ntn || dbCo.ntn_no) coNtn = dbCo.ntn || dbCo.ntn_no;
                        if (dbCo.strn || dbCo.gst_no || dbCo.st_reg_no || dbCo.sales_tax_reg_no) {
                            coStrn = dbCo.strn || dbCo.gst_no || dbCo.st_reg_no || dbCo.sales_tax_reg_no;
                        }
                        if (dbCo.logo_data && dbCo.logo_data.startsWith('data:image')) {
                            customLogo = dbCo.logo_data;
                            localStorage.setItem(`softifyx_${coName}_logo`, customLogo);
                        }
                    }
                }
            } catch (e) {
                console.error("Live company fetch error:", e);
            }
            
            if (!customLogo || !customLogo.startsWith('data:image')) {
                const cachedLogo = localStorage.getItem(`softifyx_${coName}_logo`);
                if (cachedLogo && cachedLogo.startsWith('data:image')) customLogo = cachedLogo;
            }
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

            coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
            coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');
            
            const preparedBy = document.getElementById('si_find_added_by')?.value || 'Administrator';
            const printedBy = session.username || session.user_name || session.name || 'Administrator';
            
            const invoiceTitle = isVoucher ? "SALE VOUCHER" : (isTax ? "TAX INVOICE" : "SALE INVOICE");

            // Extract items safely
            const allItemRows = Array.from(document.querySelectorAll('#siGridBody tr.si-item-row:not(.si-empty-row)')).filter(r => {
                const c = r.querySelector('.item-code-search')?.value || r.querySelector('.item-code')?.value || '';
                return (r.dataset.coaId || c.trim() !== '');
            });

            if (allItemRows.length === 0) {
                if (printWindow) printWindow.close();
                alert("Please add at least one item to the invoice before printing.");
                return;
            }

            const catHeaderElements = Array.from(document.querySelectorAll('#siGridBody tr.si-cat-header-row'));
            const hasCategories = catHeaderElements.length > 0;
            const printCatGrouping = (sett.cat_grouping !== false) && hasCategories;

            // QTY Columns Header Labels
            let firstCatKey = catHeaderElements.length > 0 ? (catHeaderElements[0].dataset.categoryKey || 'PVC PIPE') : 'PVC PIPE';
            let firstCfg = this.getCategoryConfig(firstCatKey);
            let qty1HeaderLbl = typeof firstCfg.col1 === 'object' ? firstCfg.col1.label : (firstCfg.col1 || 'PCS');
            let qty2HeaderLbl = typeof firstCfg.col2 === 'object' ? firstCfg.col2.label : (firstCfg.col2 || 'LENGTH');
            let qty3HeaderLbl = typeof firstCfg.col3 === 'object' ? firstCfg.col3.label : (firstCfg.col3 || 'WEIGHT');

            const isQtyColActive = (lbl) => {
                if (!lbl) return true;
                const u = lbl.toUpperCase();
                if (u.includes('PCS') || u.includes('PIECE')) return sett.qty_pcs !== false;
                if (u.includes('CTN') || u.includes('CARTON')) return sett.qty_ctn !== false;
                if (u.includes('LENGTH') || u.includes('MTR') || u.includes('FEET') || u.includes('FT')) return sett.qty_length !== false;
                if (u.includes('WEIGHT') || u.includes('KG')) return sett.qty_weight !== false;
                return true;
            };

            const showQ1 = isQtyColActive(qty1HeaderLbl);
            const showQ2 = isQtyColActive(qty2HeaderLbl);
            const showQ3 = isQtyColActive(qty3HeaderLbl);
            const qtyColspan = (showQ1 ? 1 : 0) + (showQ2 ? 1 : 0) + (showQ3 ? 1 : 0);

            let leadColspan = 1; // #
            if (sett.col_code !== false) leadColspan++;
            if (sett.col_hs === true) leadColspan++;
            if (sett.col_desc !== false) leadColspan++;
            if (sett.col_unit !== false) leadColspan++;

            let totalColCount = leadColspan + qtyColspan;
            if (sett.col_rate !== false) totalColCount++;
            if (sett.col_gross !== false) totalColCount++;
            if (sett.col_disc !== false) totalColCount += 2;
            if (isTax && sett.col_tax !== false) totalColCount += 5;

            // Two-tier Table Header exactly like reference
            let theadHtml = `
                <tr>
                    <th rowspan="2" style="width: 28px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 4px; font-size: 9.5px;">#</th>
                    ${sett.col_code !== false ? '<th rowspan="2" style="width: 80px; text-align: left; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">ITEM CODE</th>' : ''}
                    ${sett.col_hs === true ? '<th rowspan="2" style="width: 70px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 4px; font-size: 9.5px;">HS CODE</th>' : ''}
                    ${sett.col_desc !== false ? '<th rowspan="2" style="text-align: left; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 8px; font-size: 9.5px;">DESCRIPTION</th>' : ''}
                    ${sett.col_unit !== false ? '<th rowspan="2" style="width: 50px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 4px; font-size: 9.5px;">UNIT</th>' : ''}
                    ${qtyColspan > 0 ? `<th colspan="${qtyColspan}" style="text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 3px 6px; font-size: 9.5px;">QUANTITY</th>` : ''}
                    ${sett.col_rate !== false ? '<th rowspan="2" style="width: 65px; text-align: right; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">RATE</th>' : ''}
                    ${sett.col_gross !== false ? '<th rowspan="2" style="width: 85px; text-align: right; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">GROSS TOTAL</th>' : ''}
                    ${sett.col_disc !== false ? '<th rowspan="2" style="width: 50px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 4px; font-size: 9.5px;">DISC %</th><th rowspan="2" style="width: 65px; text-align: right; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">DISC AMT</th>' : ''}
                    ${(isTax && sett.col_tax !== false) ? '<th rowspan="2" style="width: 50px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 4px; font-size: 9.5px;">STAX %</th><th rowspan="2" style="width: 65px; text-align: right; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">STAX AMT</th><th rowspan="2" style="width: 50px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 4px; font-size: 9.5px;">FTAX %</th><th rowspan="2" style="width: 65px; text-align: right; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">FTAX AMT</th><th rowspan="2" style="width: 85px; text-align: right; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 5px 6px; font-size: 9.5px;">VALUE INCL. TAX</th>' : ''}
                </tr>
                ${qtyColspan > 0 ? `
                <tr>
                    ${showQ1 ? `<th style="width: 50px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 3px 4px; font-size: 9px;">${qty1HeaderLbl}</th>` : ''}
                    ${showQ2 ? `<th style="width: 65px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 3px 4px; font-size: 9px;">${qty2HeaderLbl}</th>` : ''}
                    ${showQ3 ? `<th style="width: 65px; text-align: center; border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; padding: 3px 4px; font-size: 9px;">${qty3HeaderLbl}</th>` : ''}
                </tr>` : ''}
            `;

            let tableRowsHtml = '';
            let grandQ1 = 0, grandQ2 = 0, grandQ3 = 0;
            let grandGross = 0, grandDisc = 0, grandStax = 0, grandFtax = 0, grandNet = 0;

            const renderItem = (tr, idx) => {
                const code = tr.querySelector('.item-code-search')?.value || tr.querySelector('.item-code')?.value || '';
                const hs = tr.querySelector('.hs-code')?.value || '-';
                const desc = tr.querySelector('.si-description')?.value || '';
                const unit = tr.querySelector('.si-unit-select')?.value || tr.querySelector('.si-unit')?.value || 'Pcs';
                
                const q1 = parseFloat(tr.querySelector('.col-qty1')?.value) || 0;
                const q2 = parseFloat(tr.querySelector('.col-qty2')?.value) || 0;
                const q3 = parseFloat(tr.querySelector('.col-qty3')?.value) || 0;
                const rate = parseFloat(tr.querySelector('.rate')?.value) || 0;
                const gross = parseFloat(tr.querySelector('.gross-amt')?.value || tr.querySelector('.val-excl')?.value) || 0;
                const discPerc = parseFloat(tr.querySelector('.disc-perc')?.value) || 0;
                const discAmt = parseFloat(tr.querySelector('.disc-amt')?.value) || 0;
                const staxPerc = parseFloat(tr.querySelector('.stax-rate')?.value) || 0;
                const staxAmt = parseFloat(tr.querySelector('.stax-amt')?.value) || 0;
                const ftaxPerc = parseFloat(tr.querySelector('.ftax-rate')?.value) || 0;
                const ftaxAmt = parseFloat(tr.querySelector('.ftax-amt')?.value) || 0;
                const net = isTax ? (parseFloat(tr.querySelector('.val-incl')?.value) || (gross - discAmt + staxAmt + ftaxAmt)) : (parseFloat(tr.querySelector('.net-amt')?.value) || (gross - discAmt));

                return {
                    q1, q2, q3, gross, discAmt, staxAmt, ftaxAmt, net,
                    html: `
                        <tr>
                            <td style="text-align: center; border: 1px solid #e2e8f0; padding: 4px 5px;">${idx}</td>
                            ${sett.col_code !== false ? `<td style="border: 1px solid #e2e8f0; padding: 4px 6px;">${code}</td>` : ''}
                            ${sett.col_hs === true ? `<td style="text-align: center; border: 1px solid #e2e8f0; padding: 4px 5px;">${hs}</td>` : ''}
                            ${sett.col_desc !== false ? `<td style="border: 1px solid #e2e8f0; padding: 4px 8px;">${desc}</td>` : ''}
                            ${sett.col_unit !== false ? `<td style="text-align: center; border: 1px solid #e2e8f0; padding: 4px 5px;">${unit}</td>` : ''}
                            ${showQ1 ? `<td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${q1 > 0 ? (Number.isInteger(q1) ? q1 : q1.toFixed(2)) : '-'}</td>` : ''}
                            ${showQ2 ? `<td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${q2 > 0 ? (Number.isInteger(q2) ? q2 : q2.toFixed(2)) : '-'}</td>` : ''}
                            ${showQ3 ? `<td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${q3 > 0 ? q3.toFixed(3) : '-'}</td>` : ''}
                            ${sett.col_rate !== false ? `<td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${rate > 0 ? formatAmt(rate) : '-'}</td>` : ''}
                            ${sett.col_gross !== false ? `<td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${formatAmt(gross)}</td>` : ''}
                            ${sett.col_disc !== false ? `<td style="text-align: center; border: 1px solid #e2e8f0; padding: 4px 5px;">${discPerc > 0 ? discPerc + '%' : '-'}</td><td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${discAmt > 0 ? formatAmt(discAmt) : '-'}</td>` : ''}
                            ${(isTax && sett.col_tax !== false) ? `<td style="text-align: center; border: 1px solid #e2e8f0; padding: 4px 5px;">${staxPerc > 0 ? staxPerc + '%' : '-'}</td><td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${formatAmt(staxAmt)}</td><td style="text-align: center; border: 1px solid #e2e8f0; padding: 4px 5px;">${ftaxPerc > 0 ? ftaxPerc + '%' : '-'}</td><td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px;">${formatAmt(ftaxAmt)}</td><td style="text-align: right; border: 1px solid #e2e8f0; padding: 4px 6px; font-weight: bold;">${formatAmt(net)}</td>` : ''}
                        </tr>
                    `
                };
            };

            if (printCatGrouping) {
                let overallItemIndex = 1;

                catHeaderElements.forEach((chEl) => {
                    const catKey = chEl.dataset.categoryKey || '';
                    const catItems = allItemRows.filter(r => r.dataset.categoryKey === catKey);
                    if (catItems.length === 0) return;

                    // Clean Category Banner Header matching reference image
                    tableRowsHtml += `
                        <tr class="cat-header-tr" style="background: #dbeafe !important; color: #0b3b60 !important; font-weight: bold; -webkit-print-color-adjust: exact;">
                            <td colspan="${totalColCount}" style="padding: 5px 8px; text-align: left; font-size: 11px; text-transform: uppercase; border: 1px solid #b8d5f8; background: #dbeafe; color: #0b3b60; font-weight: 800;">
                                ${catKey}
                            </td>
                        </tr>
                    `;

                    let subQ1 = 0, subQ2 = 0, subQ3 = 0;
                    let subGross = 0, subDisc = 0, subStax = 0, subFtax = 0, subNet = 0;

                    catItems.forEach((tr) => {
                        const itemRes = renderItem(tr, overallItemIndex++);
                        subQ1 += itemRes.q1;
                        subQ2 += itemRes.q2;
                        subQ3 += itemRes.q3;
                        subGross += itemRes.gross;
                        subDisc += itemRes.discAmt;
                        subStax += itemRes.staxAmt;
                        subFtax += itemRes.ftaxAmt;
                        subNet += itemRes.net;

                        grandQ1 += itemRes.q1;
                        grandQ2 += itemRes.q2;
                        grandQ3 += itemRes.q3;
                        grandGross += itemRes.gross;
                        grandDisc += itemRes.discAmt;
                        grandStax += itemRes.staxAmt;
                        grandFtax += itemRes.ftaxAmt;
                        grandNet += itemRes.net;

                        tableRowsHtml += itemRes.html;
                    });

                    // Sub Total Row
                    if (sett.cat_subtotals !== false) {
                        const q1Cell = showQ1 ? (sett.cat_subtotal_qty !== false ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${subQ1 > 0 ? (Number.isInteger(subQ1) ? subQ1 : subQ1.toFixed(2)) : '0'}</td>` : '<td style="border: 1px solid #fde68a;"></td>') : '';
                        const q2Cell = showQ2 ? (sett.cat_subtotal_qty !== false ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${subQ2 > 0 ? subQ2.toFixed(2) : '0.00'}</td>` : '<td style="border: 1px solid #fde68a;"></td>') : '';
                        const q3Cell = showQ3 ? (sett.cat_subtotal_qty !== false ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${subQ3 > 0 ? subQ3.toFixed(3) : '0.000'}</td>` : '<td style="border: 1px solid #fde68a;"></td>') : '';

                        tableRowsHtml += `
                            <tr class="cat-subtotal-tr" style="background: #fef3c7 !important; color: #000 !important; font-weight: bold; border: 1px solid #fde68a; -webkit-print-color-adjust: exact;">
                                <td colspan="${leadColspan}" style="padding: 4px 8px; text-align: left; font-size: 10px; font-weight: 800; border: 1px solid #fde68a;">
                                    Sub Total (${catKey})
                                </td>
                                ${q1Cell}
                                ${q2Cell}
                                ${q3Cell}
                                ${sett.col_rate !== false ? '<td style="border: 1px solid #fde68a;"></td>' : ''}
                                ${sett.col_gross !== false ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${formatAmt(subGross)}</td>` : ''}
                                ${sett.col_disc !== false ? `<td style="border: 1px solid #fde68a;"></td><td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${formatAmt(subDisc)}</td>` : ''}
                                ${(isTax && sett.col_tax !== false) ? `<td style="border: 1px solid #fde68a;"></td><td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${formatAmt(subStax)}</td><td style="border: 1px solid #fde68a;"></td><td style="text-align: right; font-size: 9.5px; padding: 4px 6px; border: 1px solid #fde68a; font-weight: 800;">${formatAmt(subFtax)}</td><td style="text-align: right; font-size: 10px; font-weight: 800; border: 1px solid #fde68a;">${formatAmt(subNet)}</td>` : ''}
                            </tr>
                        `;
                    }
                });

            } else {
                allItemRows.forEach((tr, i) => {
                    const itemRes = renderItem(tr, i + 1);
                    grandQ1 += itemRes.q1;
                    grandQ2 += itemRes.q2;
                    grandQ3 += itemRes.q3;
                    grandGross += itemRes.gross;
                    grandDisc += itemRes.discAmt;
                    grandStax += itemRes.staxAmt;
                    grandFtax += itemRes.ftaxAmt;
                    grandNet += itemRes.net;

                    tableRowsHtml += itemRes.html;
                });
            }

            // Grand Total Row (Light ice blue)
            const footerRowHtml = `
                <tr class="grand-total-tr" style="background: #dbeafe !important; color: #0b3b60 !important; font-weight: bold; border: 1px solid #b8d5f8; -webkit-print-color-adjust: exact;">
                    <td colspan="${leadColspan}" style="padding: 5px 8px; text-align: left; font-size: 11px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">
                        TOTAL (${(printCatGrouping && hasCategories) ? 'ALL CATEGORIES' : 'INVOICE'})
                    </td>
                    ${showQ1 ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${grandQ1 > 0 ? (Number.isInteger(grandQ1) ? grandQ1 : grandQ1.toFixed(2)) : '0'}</td>` : ''}
                    ${showQ2 ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${grandQ2 > 0 ? grandQ2.toFixed(2) : '0.00'}</td>` : ''}
                    ${showQ3 ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${grandQ3 > 0 ? grandQ3.toFixed(3) : '0.000'}</td>` : ''}
                    ${sett.col_rate !== false ? '<td style="border: 1px solid #b8d5f8;"></td>' : ''}
                    ${sett.col_gross !== false ? `<td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${formatAmt(grandGross)}</td>` : ''}
                    ${sett.col_disc !== false ? `<td style="border: 1px solid #b8d5f8;"></td><td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${formatAmt(grandDisc)}</td>` : ''}
                    ${(isTax && sett.col_tax !== false) ? `<td style="border: 1px solid #b8d5f8;"></td><td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${formatAmt(grandStax)}</td><td style="border: 1px solid #b8d5f8;"></td><td style="text-align: right; font-size: 9.5px; padding: 4px 6px; color: #0b3b60; font-weight: 800; border: 1px solid #b8d5f8;">${formatAmt(grandFtax)}</td><td style="text-align: right; font-size: 11px; font-weight: 800; color: #0b3b60; border: 1px solid #b8d5f8;">${formatAmt(grandNet)}</td>` : ''}
                </tr>
            `;

            let cssAdditions = '';
            if (paperSize === 'A5L') {
                cssAdditions = '@page { size: A5 landscape; margin: 6mm; } body { font-size: 8.5px; } .page-container { min-height: 132mm; } .company-name { font-size: 16px; } @media screen { body { max-width: 210mm !important; min-height: 148mm !important; padding: 6mm !important; } }';
            } else if (paperSize === 'A5P') {
                cssAdditions = '@page { size: A5 portrait; margin: 6mm; } body { font-size: 8px; } .page-container { min-height: 190mm; } .company-name { font-size: 15px; } @media screen { body { max-width: 148mm !important; min-height: 210mm !important; padding: 6mm !important; } }';
            } else if (paperSize === 'POS') {
                cssAdditions = '@page { size: 80mm auto; margin: 0; } body { font-size: 8px; margin: 4mm auto !important; max-width: 80mm !important; } .page-container { min-height: auto !important; } .footer-bottom-group { margin-top: 15px !important; } .company-name { font-size: 13px; } .grid-table th, .grid-table td { font-size: 7.5px; padding: 2px; } .lower-area { flex-direction: column; } .left-lower, .right-lower { width: 100%; margin-bottom: 5px; } .header-area { flex-direction: column; align-items: center; text-align: center; } .logo-box { width: 50px; height: 50px; } .company-info { padding-left: 0; align-items: center; } .invoice-badge-area { align-items: center; margin-top: 8px; } .details-area { flex-direction: column; gap: 5px; } .customer-box { width: 100%; } .invoice-box { width: 100%; } @media screen { body { max-width: 80mm !important; min-height: auto !important; padding: 4mm !important; } }';
            } else {
                cssAdditions = '@page { size: A4 portrait; margin: 8mm; } body { font-size: 10px; } .page-container { min-height: 270mm; }';
            }

            let headerSection = '';
            if (noHeader) {
                headerSection = '<div style="height: 100px;"></div>';
            } else {
                let logoHtml = (sett.seller_logo !== false && customLogo) ? `
                    <div class="logo-box">
                        <img src="${customLogo}" alt="Logo" onerror="this.style.display='none'">
                    </div>
                    <div class="header-divider"></div>
                ` : '';

                let nameHtml = (sett.seller_name !== false) ? `<div class="company-name">${coName}</div>` : '';

                let addressHtml = (sett.seller_address !== false && coAddress) ? `
                    <div class="contact-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${coAddress}</span>
                    </div>
                ` : '';

                let contactParts = [];
                if (sett.seller_phone !== false && coPhone) {
                    contactParts.push(`<span><i class="fas fa-phone-alt"></i> ${coPhone}</span>`);
                }
                if (sett.seller_web !== false && coEmail) {
                    contactParts.push(`<span><i class="fas fa-envelope"></i> ${coEmail}</span>`);
                }
                let contactRow1 = contactParts.length > 0 ? `<div class="contact-row">${contactParts.join('')}</div>` : '';

                let webParts = [];
                if (sett.seller_web !== false && coWebsite) {
                    webParts.push(`<span><i class="fas fa-globe"></i> ${coWebsite}</span>`);
                }
                if (sett.seller_strn !== false && coStrn) {
                    webParts.push(`<span><b>STRN:</b> ${coStrn}</span>`);
                }
                if (sett.seller_ntn !== false && coNtn) {
                    webParts.push(`<span><b>NTN:</b> ${coNtn}</span>`);
                }
                let contactRow2 = webParts.length > 0 ? `<div class="contact-row" style="gap: 12px;">${webParts.join('')}</div>` : '';

                headerSection = `
                    <div class="header-area">
                        <div style="display: flex; align-items: center;">
                            ${logoHtml}
                            <div class="company-info">
                                ${nameHtml}
                                <div class="company-contacts">
                                    ${addressHtml}
                                    ${contactRow1}
                                    ${contactRow2}
                                </div>
                            </div>
                        </div>
                        <div class="invoice-badge-area">
                            <div class="invoice-pill">${invoiceTitle}</div>
                            <div class="invoice-pill-underline"></div>
                        </div>
                    </div>
                    <div class="header-bottom-line"></div>
                `;
            }

            // Buyer / Customer Box
            const cleanCustomerName = (vName || '').replace(/\s*\(\d+\)\s*$/, '').trim();
            let buyerNameHtml = (sett.buyer_name !== false) ? `<div style="font-weight: 800; font-size: 12px; color: #000; margin-bottom: 4px;">${cleanCustomerName}</div>` : '';
            let buyerPhoneHtml = (sett.buyer_phone !== false && vTel) ? `<div style="display: flex; align-items: center; gap: 6px; color: #1e293b; margin-bottom: 3px;"><i class="fas fa-phone-alt" style="color: #2563eb; width: 14px;"></i><span>${vTel}</span></div>` : '';
            let buyerAddrHtml = (sett.buyer_address !== false && vAddress) ? `<div style="color: #475569; margin-bottom: 3px;">${vAddress.split(',')[0]}</div>` : '';

            let taxParts = [];
            if (sett.buyer_ntn !== false && ntnNo) taxParts.push(`<b>NTN:</b> ${ntnNo}`);
            if (sett.buyer_strn !== false && gstNo) taxParts.push(`<b>GST:</b> ${gstNo}`);
            if (sett.buyer_cnic !== false && vCnic) taxParts.push(`<b>CNIC:</b> ${vCnic}`);
            let buyerTaxHtml = taxParts.length > 0 ? `<div style="font-size: 10px; color: #334155; margin-top: 4px;">${taxParts.join('&nbsp;&nbsp;&nbsp;')}</div>` : '';

            let buyerBoxHtml = `
                <div class="customer-box">
                    <div class="customer-box-header">
                        <i class="fas fa-user-circle" style="color: #2563eb; font-size: 15px;"></i> CUSTOMER DETAILS
                    </div>
                    <div class="customer-box-content">
                        ${buyerNameHtml}
                        ${buyerPhoneHtml}
                        ${buyerAddrHtml}
                        ${buyerTaxHtml}
                    </div>
                </div>
            `;

            // Summary Box Rows
            let summaryRowsHtml = '';
            if (sett.tot_add_disc !== false) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #1e293b;">Additional Discount</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600;">${formatAmt(addDisc)}</td>
                    </tr>
                `;
            }
            if (sett.tot_gross !== false) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #1e293b;">Gross Total</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600;">${formatAmt(grandGross)}</td>
                    </tr>
                `;
            }
            if (sett.tot_freight !== false) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #1e293b;">Carriage &amp; Freight</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600;">${formatAmt(freight)}</td>
                    </tr>
                `;
            }
            if (isTax && sett.col_tax !== false && grandStax > 0) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #1e293b;">Sales Tax</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600;">${formatAmt(grandStax)}</td>
                    </tr>
                `;
            }
            if (isTax && sett.col_tax !== false && grandFtax > 0) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #1e293b;">Further Tax</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600;">${formatAmt(grandFtax)}</td>
                    </tr>
                `;
            }
            if (isTax && whtAmt > 0) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #dc2626;">${whtLabel || 'WHT Tax'}</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600; color: #dc2626;">${formatAmt(whtAmt)}</td>
                    </tr>
                `;
            }

            summaryRowsHtml += `
                <tr style="border-top: 1.5px solid #b8d5f8; border-bottom: 1.5px solid #b8d5f8; background: #f0f7ff;">
                    <td style="padding: 6px 12px; font-weight: 800; color: #1d4ed8; font-size: 13px;">Net Total</td>
                    <td style="padding: 6px 12px; text-align: right; font-weight: 800; color: #1d4ed8; font-size: 13px;">${formatAmt(netTot)}</td>
                </tr>
            `;

            if (sett.tot_paid_bal !== false) {
                summaryRowsHtml += `
                    <tr>
                        <td style="padding: 4px 12px; color: #1e293b;">Amount Received</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600;">${formatAmt(amountReceived)}</td>
                    </tr>
                    <tr style="font-weight: 800;">
                        <td style="padding: 4px 12px; color: #0b3b60; font-size: 11.5px;">Balance</td>
                        <td style="padding: 4px 12px; text-align: right; color: #0b3b60; font-size: 11.5px;">${formatAmt(invoiceBalance)}</td>
                    </tr>
                `;
            }

            if (sett.tot_prev_bal !== false) {
                summaryRowsHtml += `
                    <tr style="border-top: 1px dashed #cbd5e1;">
                        <td style="padding: 4px 12px; color: #475569;">Previous Balance</td>
                        <td style="padding: 4px 12px; text-align: right; font-weight: 600; color: #475569;">${formatBal(previousBalance)}</td>
                    </tr>
                `;
            }

            if (sett.tot_curr_bal !== false) {
                summaryRowsHtml += `
                    <tr style="border-top: 1px solid #b8d5f8; background: #e8f1fc; font-weight: 800;">
                        <td style="padding: 6px 12px; color: #0b3b60; font-size: 12px;">Current Balance</td>
                        <td style="padding: 6px 12px; text-align: right; color: #0b3b60; font-size: 12px;">${formatBal(currentBalance)}</td>
                    </tr>
                `;
            }

            // Lower Left: Words & Remarks & Signature
            let wordsBoxHtml = (sett.tot_words !== false) ? `
                <div class="words-box">
                    <div class="words-box-header">
                        <i class="fas fa-file-invoice-dollar" style="color: #2563eb; font-size: 15px;"></i> AMOUNT IN WORDS
                    </div>
                    <div class="words-box-content">
                        ${amtWords || 'Rupees Zero only.'}
                        ${(sett.tot_remarks !== false && remarks) ? '<div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 10px; color: #334155;"><b>Remarks:</b> ' + remarks + '</div>' : ''}
                    </div>
                </div>
            ` : ((sett.tot_remarks !== false && remarks) ? `
                <div class="words-box">
                    <div class="words-box-header">
                        <i class="fas fa-comment-dots" style="color: #2563eb; font-size: 15px;"></i> REMARKS
                    </div>
                    <div class="words-box-content">
                        ${remarks}
                    </div>
                </div>
            ` : '');

            let signatureHtml = (sett.tot_prepared_by !== false) ? `
                <div class="signature-container">
                    <div class="signature-line"></div>
                    <div class="signature-title">Prepared By</div>
                    <div class="signature-name">${preparedBy}</div>
                </div>
            ` : '';

            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${type} - ${sn}</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                    <style>
                        * { box-sizing: border-box; }
                        body {
                            font-family: 'Segoe UI', Arial, Tahoma, sans-serif;
                            color: #000;
                            margin: 0;
                            padding: 0;
                            background: #fff;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            color-adjust: exact !important;
                        }
                        @media screen {
                            body { max-width: 215mm; margin: 15px auto; box-shadow: 0 0 15px rgba(0,0,0,0.15); padding: 12mm; background: #fff; border-radius: 4px; }
                        }
                        @media print {
                            body { margin: 0; padding: 0; }
                            .no-print { display: none !important; }
                        }
                        ${cssAdditions}

                        .page-container {
                            position: relative;
                            min-height: 270mm;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                        }
                        .main-content {
                            flex: 1 0 auto;
                        }
                        .header-area { display: flex; justify-content: space-between; align-items: center; }
                        .logo-box { width: 95px; height: 75px; display: flex; align-items: center; justify-content: center; }
                        .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                        .header-divider { width: 1.5px; height: 65px; background: #cbd5e1; margin: 0 16px; }
                        
                        .company-info { display: flex; flex-direction: column; justify-content: center; }
                        .company-name { color: #0b3b60; font-size: 21px; font-weight: 800; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px; }
                        .company-contacts { font-size: 9.5px; line-height: 1.5; color: #334155; }
                        .company-contacts i { color: #0b3b60; width: 12px; text-align: center; margin-right: 3px; }
                        .contact-row { display: flex; align-items: center; gap: 16px; margin-bottom: 2px; }

                        .invoice-badge-area { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 180px; }
                        .invoice-pill { background: #e2edfa; border-radius: 8px; padding: 8px 24px; text-align: center; width: 100%; color: #0b3b60; font-size: 18px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; }
                        .invoice-pill-underline { width: 75px; height: 3px; background: #ea580c; border-radius: 2px; margin-top: 6px; }
                        .header-bottom-line { border-bottom: 2px solid #0b3b60; margin: 14px 0 16px 0; }

                        .details-area { display: flex; justify-content: space-between; margin-bottom: 16px; gap: 16px; align-items: stretch; }
                        .customer-box { border: 1px solid #b8d5f8; border-radius: 6px; overflow: hidden; flex: 1.1; background: #fff; }
                        .customer-box-header { background: #e8f1fc; color: #0b3b60; font-weight: bold; font-size: 11px; padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #b8d5f8; text-transform: uppercase; }
                        .customer-box-content { padding: 10px 14px; font-size: 11px; line-height: 1.6; }

                        .invoice-box { border: 1px solid #b8d5f8; border-radius: 6px; overflow: hidden; flex: 0.9; background: #fff; }
                        .invoice-box-header { background: #e8f1fc; color: #0b3b60; font-weight: bold; font-size: 11px; padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #b8d5f8; text-transform: uppercase; }
                        .invoice-box-content { padding: 10px 14px; font-size: 11px; }

                        .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; border: 1px solid #b8d5f8; }
                        .grid-table th { border: 1px solid #b8d5f8; background: #e8f1fc; color: #0b3b60; font-weight: bold; font-size: 9.5px; text-transform: uppercase; }
                        .grid-table td { border: 1px solid #e2e8f0; font-size: 10px; }

                        .lower-area { display: flex; justify-content: space-between; margin-top: 16px; gap: 16px; align-items: flex-start; }
                        .words-box { border: 1px solid #b8d5f8; border-radius: 6px; overflow: hidden; flex: 1.1; background: #fff; }
                        .words-box-header { background: #e8f1fc; color: #0b3b60; font-weight: bold; font-size: 11px; padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #b8d5f8; text-transform: uppercase; }
                        .words-box-content { padding: 12px 14px; font-size: 11px; font-weight: 600; line-height: 1.6; color: #000; }

                        .summary-box { border: 1px solid #b8d5f8; border-radius: 6px; overflow: hidden; flex: 0.9; background: #fff; }
                        .summary-box-header { background: #e8f1fc; color: #0b3b60; font-weight: bold; font-size: 11px; padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #b8d5f8; text-transform: uppercase; }
                        .summary-box-content { padding: 4px 0; }

                        .footer-bottom-group {
                            margin-top: auto;
                            padding-top: 15px;
                            width: 100%;
                            page-break-inside: avoid;
                        }

                        .signature-container { margin-bottom: 12px; width: 170px; margin-left: 4px; }
                        .signature-line { border-top: 1.5px solid #000; width: 150px; margin-bottom: 4px; }
                        .signature-title { font-weight: 800; font-size: 11px; color: #000; }
                        .signature-name { font-size: 9.5px; color: #475569; }

                        .bottom-banner { border-top: 1px solid #cbd5e1; padding-top: 8px; }
                        .bottom-banner-content { display: flex; align-items: center; justify-content: space-between; }
                        .bottom-banner-title { font-size: 13px; font-weight: 800; color: #0b3b60; }
                        .bottom-banner-pipe { color: #cbd5e1; margin: 0 10px; }
                        .bottom-banner-powered { font-size: 11px; color: #475569; }
                        .bottom-banner-bar { height: 3px; background: #ea580c; border-radius: 2px; width: 100%; margin-top: 6px; }
                    </style>
                </head>
                <body>
                    <div class="page-container">
                        <div class="main-content">
                            ${headerSection}

                            <div class="details-area">
                                ${buyerBoxHtml}
                                <div class="invoice-box">
                                    <div class="invoice-box-header">
                                        <i class="fas fa-file-invoice" style="color: #2563eb; font-size: 15px;"></i> INVOICE DETAILS
                                    </div>
                                    <div class="invoice-box-content">
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="color: #334155; font-weight: 600; width: 100px; padding: 3px 0;">Invoice No.</td>
                                                <td style="width: 15px; font-weight: bold;">:</td>
                                                <td style="font-weight: 800; color: #000;">${sn}</td>
                                            </tr>
                                            <tr>
                                                <td style="color: #334155; font-weight: 600; padding: 3px 0;">Invoice Date</td>
                                                <td style="font-weight: bold;">:</td>
                                                <td style="font-weight: 800; color: #000;">${date}</td>
                                            </tr>
                                            ${dcNo ? '<tr><td style="color: #334155; font-weight: 600; padding: 3px 0;">D.C. No.</td><td>:</td><td style="font-weight: 600;">' + dcNo + (dcDate ? ' (' + dcDate + ')' : '') + '</td></tr>' : ''}
                                            ${poNo ? '<tr><td style="color: #334155; font-weight: 600; padding: 3px 0;">P.O. No.</td><td>:</td><td style="font-weight: 600;">' + poNo + (poDate ? ' (' + poDate + ')' : '') + '</td></tr>' : ''}
                                            ${terms ? '<tr><td style="color: #334155; font-weight: 600; padding: 3px 0;">Terms</td><td>:</td><td>' + terms + '</td></tr>' : ''}
                                        </table>
                                    </div>
                                </div>
                            </div>

                            ${isVoucher ? `
                            <table class="grid-table">
                                <thead>
                                    <tr>
                                        <th style="width: 18%; text-align: left; padding: 6px 10px;">Acc Code</th>
                                        <th style="text-align: left; padding: 6px 10px;">Account Name</th>
                                        <th style="width: 20%; text-align: right; padding: 6px 10px;">Debit (Rs.)</th>
                                        <th style="width: 20%; text-align: right; padding: 6px 10px;">Credit (Rs.)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="text-align: left; padding: 10px;">${vCode}</td>
                                        <td style="text-align: left; padding: 10px;">${vName}</td>
                                        <td style="text-align: right; padding: 10px;">${formatAmt(netTot)}</td>
                                        <td style="text-align: right; padding: 10px;"></td>
                                    </tr>
                                    <tr>
                                        <td style="text-align: left; padding: 10px;">40001001</td>
                                        <td style="text-align: left; padding: 10px;">Sales</td>
                                        <td style="text-align: right; padding: 10px;"></td>
                                        <td style="text-align: right; padding: 10px;">${formatAmt(netTot)}</td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr style="background: #e8f1fc; font-weight: bold;">
                                        <td colspan="2" style="text-align: right; padding: 6px 10px;">Totals</td>
                                        <td style="text-align: right; padding: 6px 10px;">${formatAmt(netTot)}</td>
                                        <td style="text-align: right; padding: 6px 10px;">${formatAmt(netTot)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                            ` : `
                            <table class="grid-table">
                                <thead>
                                    ${theadHtml}
                                </thead>
                                <tbody>
                                    ${tableRowsHtml}
                                </tbody>
                                <tfoot>
                                    ${footerRowHtml}
                                </tfoot>
                            </table>
                            `}

                            <div class="lower-area" style="${isVoucher ? 'display: block;' : ''}">
                                <div style="flex: 1.1; display: flex; flex-direction: column;">
                                    ${wordsBoxHtml}
                                </div>
                                ${isVoucher ? '' : `
                                <div class="summary-box">
                                    <div class="summary-box-header">
                                        <i class="fas fa-calculator" style="color: #2563eb; font-size: 15px;"></i> SUMMARY
                                    </div>
                                    <div class="summary-box-content">
                                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                            ${summaryRowsHtml}
                                        </table>
                                    </div>
                                </div>
                                `}
                            </div>
                        </div>

                        <div class="footer-bottom-group">
                            ${signatureHtml}
                            <div class="bottom-banner">
                                <div class="bottom-banner-content">
                                    <div class="bottom-banner-title">Thank you for your business!</div>
                                    <div class="bottom-banner-pipe">|</div>
                                    <div class="bottom-banner-powered">Powered by SoftifyX &amp; Financials</div>
                                </div>
                                <div class="bottom-banner-bar"></div>
                            </div>
                        </div>
                    </div>
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.focus();
                                window.print();
                            }, 350);
                        };
                    </script>
                </body>
                </html>
            `;

            if (isExcel) {
                const blob = new Blob([fullHtml], { type: 'application/vnd.ms-excel' });
                const url = URL.createObjectURL(blob);
                if (printWindow) {
                    printWindow.document.write('Downloading Excel file...');
                    const a = printWindow.document.createElement('a');
                    a.href = url;
                    a.download = `Sale_${isVoucher ? 'Voucher' : 'Invoice'}_${sn}.xls`;
                    printWindow.document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        printWindow.close();
                        URL.revokeObjectURL(url);
                    }, 500);
                }
            } else {
                printWindow.document.open();
                printWindow.document.write(fullHtml);
                printWindow.document.close();
                setTimeout(() => {
                    try {
                        printWindow.focus();
                        printWindow.print();
                    } catch(e) {}
                }, 800);
            }
        } catch(err) {
            console.error("Print generation error:", err);
            if (printWindow) {
                try {
                    printWindow.document.body.innerHTML = `
                        <div style="padding: 25px; font-family: sans-serif; color: #b91c1c;">
                            <h3>Error Generating Print Preview</h3>
                            <p>${err.message || err}</p>
                            <button onclick="window.close()" style="padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc;">Close Window</button>
                        </div>
                    `;
                } catch(e) {}
            }
            alert("Error preparing invoice for print: " + (err.message || err));
        }
    },
    fetchOGPData: async function(ogpSn, isTax) {
        if (!ogpSn) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;

            // Wait for SI module to be fully initialized
            let waited = 0;
            while (waited < 5000) {
                if (this.customers && this.customers.length > 0 && this.inventory && this.inventory.length > 0) break;
                await new Promise(resolve => setTimeout(resolve, 200));
                waited += 200;
            }

            // Fetch OGP data by serial number
            const res = await fetch(`api/outward_gate_passes.php?action=fetch&sn=${ogpSn}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch OGP data.");
                return;
            }
            const ogp = await res.json();

            if (!ogp || !ogp.id) {
                alert(`Outward Gate Pass #${ogpSn} not found in database.`);
                return;
            }

            // Set Tax mode
            const taxCheckbox = document.getElementById('si_is_tax');
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
            const isTaxVal = isTax ? 1 : 0;
            const resSn = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('si_sn');
                if (snEl) snEl.value = snData.next_sn || '';
            }

            // Fill header
            document.getElementById('si_cust_code').value = '';
            document.getElementById('si_cust_name').value = '';

            const dcNoEl = document.getElementById('si_dc_no');
            if (dcNoEl) dcNoEl.value = ogp.delivery_challan_no || '';

            const poNoEl = document.getElementById('si_po_no');
            if (poNoEl) poNoEl.value = ogp.purchase_order_no || '';

            if (ogp.customer_coa_id) {
                this.selectCustomer(ogp.customer_coa_id);
            }

            // Fill Items
            const tbody = document.querySelector('#siGridBody');
            tbody.innerHTML = '';

            if (ogp.items && ogp.items.length > 0) {
                ogp.items.forEach(item => {
                    const rowData = {
                        item_coa_id: item.item_id, // Map item_id to item_coa_id
                        code: item.item_code || '',
                        item_code: item.item_code || '',
                        item_name: item.item_name || '',
                        master_name: item.item_name || '',
                        description: item.description || item.item_name || '',
                        pieces: item.pieces || '',
                        quantity: item.qty || '', // OGP uses 'qty', SI addEmptyRow uses 'quantity'
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

            this.calculateTotals();
        this.updateLeadColspans();
            alert(`Imported Outward Gate Pass #${ogpSn} successfully!`);
        } catch (err) {
            console.error("Convert OGP Error:", err);
            alert("System error importing Outward Gate Pass.");
        }
    },

    fetchSaleOrderData: async function(poNo, isTax) {
        if (!poNo) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            const res = await fetch(`api/sale_order.php?action=get_sale_order&serial_no=${poNo}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch Sale Order data.");
                return;
            }
            const po = await res.json();
            
            if (!po || !po.id) {
                alert(`Sale Order #${poNo} not found in database.`);
                return;
            }

            // Set Tax mode
            const taxCheckbox = document.getElementById('si_is_tax');
            if (taxCheckbox) {
                taxCheckbox.checked = isTax;
                this.toggleTaxMode(false);
            }
            
            // Wait for dependencies to load if not already
            let waited = 0;
            while (waited < 5000) {
                if (this.customers && this.customers.length > 0 && this.inventory && this.inventory.length > 0) break;
                await new Promise(resolve => setTimeout(resolve, 200));
                waited += 200;
            }

            if (!this.customers || this.customers.length === 0) {
                await this.loadCustomers();
            }
            if (!this.inventory || this.inventory.length === 0) {
                await this.loadInventory();
            }

            // Fetch new next serial number for this invoice
            const isTaxVal = isTax ? 1 : 0;
            const resSn = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('si_sn');
                if (snEl) {
                    if (snEl.tagName === 'INPUT') snEl.value = snData.next_sn || '';
                    else snEl.innerText = snData.next_sn || '';
                }
            }

            // Fill header
            document.getElementById('si_cust_code').value = '';
            document.getElementById('si_cust_name').value = '';
            
            const poNoEl = document.getElementById('si_po_no');
            if (poNoEl) poNoEl.value = po.customer_order_ref || po.serial_no || poNo;
            
            const poDateEl = document.getElementById('si_po_date');
            if (poDateEl) poDateEl.value = po.date || '';
            
            if (po.customer_coa_id) {
                this.selectCustomer(po.customer_coa_id);
            }
            
            // Fill Items
            const tbody = document.querySelector('#siGridBody');
            tbody.innerHTML = '';
            
            if (po.items && po.items.length > 0) {
                po.items.forEach(item => {
                    const rowData = {
                        item_coa_id: item.item_id,
                        code: item.item_code || '',
                        item_code: item.item_code || '',
                        item_name: item.item_name || '',
                        master_name: item.item_name || '',
                        description: item.item_name || '',
                        pieces: item.pieces || '',
                        quantity: item.qty || '', 
                        unit: item.unit || '',
                        qty_per_piece: item.qty_per_piece || 0,
                        rate: item.rate || '',
                        sales_tax_rate: item.tax_rate || 0,
                        further_tax_rate: item.further_tax_rate || 0
                    };
                    this.addEmptyRow(rowData);
                });
            }
            
            // Pad
            while(tbody.children.length < 8) {
                this.addEmptyRow();
            }

            this.calculateTotals();
        this.updateLeadColspans();
            alert(`Imported Sale Order #${poNo} successfully!`);
        } catch (err) {
            console.error("Convert SO Error:", err);
            alert("System error importing Sale Order.");
        }
    },

    fetchQuotationData: async function(qSn, isTax) {
        if (!qSn) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            
            let waited = 0;
            while (waited < 5000) {
                if (this.customers && this.customers.length > 0 && this.inventory && this.inventory.length > 0) break;
                await new Promise(resolve => setTimeout(resolve, 200));
                waited += 200;
            }

            const res = await fetch(`api/quotation.php?action=get_quotation&serial_no=${qSn}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch Quotation data.");
                return;
            }
            const quo = await res.json();
            
            if (!quo || !quo.id) {
                alert(`Quotation #${qSn} not found in database.`);
                return;
            }

            const taxCheckbox = document.getElementById('si_is_tax');
            if (taxCheckbox) {
                taxCheckbox.checked = isTax;
                this.toggleTaxMode(false);
            }
            
            const isTaxVal = isTax ? 1 : 0;
            const resSn = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('si_sn');
                if (snEl) {
                    if (snEl.tagName === 'INPUT') snEl.value = snData.next_sn || '';
                    else snEl.innerText = snData.next_sn || '';
                }
            }

            document.getElementById('si_cust_code').value = '';
            document.getElementById('si_cust_name').value = '';
            
            if (quo.customer_coa_id) {
                this.selectCustomer(quo.customer_coa_id);
            }
            
            const tbody = document.querySelector('#siGridBody');
            tbody.innerHTML = '';
            
            if (quo.items && quo.items.length > 0) {
                quo.items.forEach(item => {
                    const rowData = {
                        item_coa_id: item.item_coa_id,
                        code: item.item_code || '',
                        item_code: item.item_code || '',
                        item_name: item.item_name || '',
                        master_name: item.item_name || '',
                        description: item.item_name || '',
                        pieces: item.pieces || '',
                        quantity: item.qty || '', 
                        unit: item.unit || '',
                        qty_per_piece: item.qty_per_piece || 0,
                        rate: item.rate || '',
                        sales_tax_rate: item.tax_rate || 0,
                        further_tax_rate: item.further_tax_rate || 0
                    };
                    this.addEmptyRow(rowData);
                });
            }
            
            while(tbody.children.length < 8) {
                this.addEmptyRow();
            }

            this.calculateTotals();
        this.updateLeadColspans();
            alert(`Imported Quotation #${qSn} successfully!`);
        } catch (err) {
            console.error("Convert Quotation Error:", err);
            alert("System error importing Quotation.");
        }
    },

    fetchDeliveryChallanData: async function(dcSn, isTax) {
        if (!dcSn) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const coId = session.company_id || 1;
            
            let waited = 0;
            while (waited < 5000) {
                if (this.customers && this.customers.length > 0 && this.inventory && this.inventory.length > 0) break;
                await new Promise(resolve => setTimeout(resolve, 200));
                waited += 200;
            }

            const res = await fetch(`api/delivery_challan.php?action=fetch&sn=${dcSn}&company_id=${coId}`);
            if (!res.ok) {
                console.error("Failed to fetch Delivery Challan data.");
                return;
            }
            const dc = await res.json();
            
            if (!dc || !dc.id) {
                alert(`Delivery Challan #${dcSn} not found in database.`);
                return;
            }

            const taxCheckbox = document.getElementById('si_is_tax');
            if (taxCheckbox) {
                taxCheckbox.checked = isTax;
                this.toggleTaxMode(false);
            }
            
            const isTaxVal = isTax ? 1 : 0;
            const resSn = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${coId}&is_tax=${isTaxVal}`);
            if (resSn.ok) {
                const snData = await resSn.json();
                const snEl = document.getElementById('si_sn');
                if (snEl) {
                    if (snEl.tagName === 'INPUT') snEl.value = snData.next_sn || '';
                    else snEl.innerText = snData.next_sn || '';
                }
            }

            document.getElementById('si_cust_code').value = '';
            document.getElementById('si_cust_name').value = '';
            
            const dcNoEl = document.getElementById('si_dc_no');
            if (dcNoEl) dcNoEl.value = dc.serial_no || dcSn;
            
            const dcDateEl = document.getElementById('si_dc_date');
            if (dcDateEl) dcDateEl.value = dc.date || '';

            const poNoEl = document.getElementById('si_po_no');
            if (poNoEl) poNoEl.value = dc.purchase_order_no || '';

            const poDateEl = document.getElementById('si_po_date');
            if (poDateEl) poDateEl.value = dc.purchase_order_date || '';
            
            if (dc.customer_coa_id) {
                this.selectCustomer(dc.customer_coa_id);
            }
            
            const tbody = document.querySelector('#siGridBody');
            tbody.innerHTML = '';
            
            if (dc.items && dc.items.length > 0) {
                dc.items.forEach(item => {
                    const rowData = {
                        item_coa_id: item.item_id,
                        code: item.item_code || '',
                        item_code: item.item_code || '',
                        item_name: item.item_name || '',
                        master_name: item.item_name || '',
                        description: item.item_name || '',
                        pieces: item.pieces || '',
                        quantity: item.qty || '', 
                        unit: item.unit || '',
                        qty_per_piece: item.qty_per_piece || 0
                    };
                    this.addEmptyRow(rowData);
                });
            }
            
            while(tbody.children.length < 8) {
                this.addEmptyRow();
            }

            this.calculateTotals();
        this.updateLeadColspans();
            alert(`Imported Delivery Challan #${dcSn} successfully!`);
        } catch (err) {
            console.error("Convert DC Error:", err);
            alert("System error importing Delivery Challan.");
        }
    },

    // Find Modal Methods
    findData: [],
    findSelectedIndex: -1,
    findSortField: 'serial_no',
    findSortDesc: false,
    findKeydownAdded: false,

    openFindModal: async function() {
        const modal = document.getElementById('si_find_modal');
        if (modal) modal.style.display = 'flex';
        
        const searchInput = document.getElementById('si_find_search');
        if (searchInput) searchInput.focus();
        
        if (!this.findKeydownAdded) {
            document.addEventListener('keydown', (e) => this.handleFindKeyDown(e));
            this.findKeydownAdded = true;
        }

        await this.renderFindTable();
    },

    closeFindModal: function() {
        const modal = document.getElementById('si_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('si_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/sale_invoice.php?action=search_invoices&company_id=${companyId}`);
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
        const q = (document.getElementById('si_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('si_find_field')?.value || 'serial_no';
        
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
            const q = (document.getElementById('si_find_search')?.value || '').toLowerCase();
            if(!q) return true;
            const filterField = document.getElementById('si_find_field')?.value || 'serial_no';
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
        const tbody = document.getElementById('si_find_table_body');
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
            const isPostedMark = (inv.is_posted == 1) ? 'âœ“' : '';
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
                document.getElementById('si_is_tax').checked = (inv.is_tax_invoice == 1);
                document.getElementById('si_sn').value = inv.serial_no;
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
        const tbody = document.getElementById('si_find_table_body');
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
                ind.innerHTML = 'â–¶';
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
            document.getElementById('si_find_added_on').value = dStr;
            document.getElementById('si_find_edited_on').value = dStr;
        } else {
            document.getElementById('si_find_added_on').value = '';
            document.getElementById('si_find_edited_on').value = '';
        }
    },

    handleFindKeyDown: function(e) {
        if (document.getElementById('si_find_modal').style.display !== 'flex') return;
        
        const tbody = document.getElementById('si_find_table_body');
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0 || !this.currentRenderedFindData) return;

        let idx = parseInt(this.findSelectedIndex) || 0;

        if (e.key === 'ArrowDown' || e.key === 'Down' || e.key === 'ArrowUp' || e.key === 'Up') {
            e.preventDefault();
            const visibleRows = Array.from(rows).filter(tr => tr.style.display !== 'none' && !tr.querySelector('td[colspan]'));
            if (visibleRows.length === 0) return;

            if (e.key === 'ArrowDown' || e.key === 'Down') {
                idx = Math.min(idx + 1, visibleRows.length - 1);
            } else if (e.key === 'ArrowUp' || e.key === 'Up') {
                idx = Math.max(idx - 1, 0);
            }

            const selectedRow = visibleRows[idx];
            if (selectedRow) {
                this.findSelectedIndex = idx;
                this.selectFindRow(idx, selectedRow, this.currentRenderedFindData[idx]);
            }
        } else if (e.key === 'Enter') {
            if (document.activeElement === document.getElementById('si_find_search')) {
                // Let the input handle it or filter
            } else if (idx >= 0 && idx < this.currentRenderedFindData.length) {
                e.preventDefault();
                const inv = this.currentRenderedFindData[idx];
                this.closeFindModal();
                document.getElementById('si_is_tax').checked = (inv.is_tax_invoice == 1);
                document.getElementById('si_sn').value = inv.serial_no;
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
    if (window.SIModule) window.SIModule.init();
};


