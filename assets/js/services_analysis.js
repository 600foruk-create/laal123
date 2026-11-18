window.ServicesAnalysisModule = {
    isInitialized: false,
    reportData: [],
    customers: [],
    items: [],
    selectedIndex: -1,

    init: async function() {
        if (this.isInitialized) return;
        this.bindEvents();
        await this.loadLookups();
        this.setupItemSearch();
        this.setupCustomerSearch();
        this.setupCheckboxToggles();
        this.isInitialized = true;
    },

    bindEvents: function() {
        const self = window.ServicesAnalysisModule;
        document.addEventListener('keydown', self.handleKeydown);

        document.addEventListener('click', (e) => {
            if (e.target.id !== 'sva_item_code' && e.target.id !== 'sva_item_name' && !e.target.closest('#sva_item_suggest')) {
                const itemSugg = document.getElementById('sva_item_suggest');
                if(itemSugg) itemSugg.style.display = 'none';
            }
            if (!e.target.closest('#sva_use_customer') && e.target.id !== 'sva_customer_code' && e.target.id !== 'sva_customer_name' && !e.target.closest('#sva_customer_suggest')) {
                const custSugg = document.getElementById('sva_customer_suggest');
                if(custSugg) custSugg.style.display = 'none';
            }
        });
    },

    setupCheckboxToggles: function() {
        const toggles = [
            { chk: 'sva_use_customer', target: ['sva_customer_code', 'sva_customer_name'] },
            { chk: 'sva_use_region', target: 'sva_region' },
            { chk: 'sva_use_sub_region', target: 'sva_sub_region' },
            { chk: 'sva_use_business', target: 'sva_business' },
            { chk: 'sva_use_dept', target: 'sva_dept' },
            { chk: 'sva_use_emp', target: 'sva_emp' },
            { chk: 'sva_use_date', target: ['sva_date_from', 'sva_date_to'] }
        ];

        toggles.forEach(t => {
            const chk = document.getElementById(t.chk);
            if (!chk) return;
            chk.addEventListener('change', function() {
                if (Array.isArray(t.target)) {
                    t.target.forEach(id => {
                        const el = document.getElementById(id);
                        if(el) {
                            el.disabled = !this.checked;
                            if(this.checked && id === t.target[0]) el.focus();
                        }
                    });
                } else {
                    const el = document.getElementById(t.target);
                    if(el) {
                        el.disabled = !this.checked;
                        if(this.checked) el.focus();
                    }
                }
            });
        });

        // Initialize Dates
        const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        document.getElementById('sva_date_from').value = today;
        document.getElementById('sva_date_to').value = today;
        if (typeof $ !== 'undefined' && $.fn.datepicker) {
            $('#sva_date_from').datepicker({ dateFormat: 'dd-M-y' });
            $('#sva_date_to').datepicker({ dateFormat: 'dd-M-y' });
        }
    },

    loadLookups: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        const loadOptions = async (url, elId, valField, textField) => {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const data = await r.json();
                    const sel = document.getElementById(elId);
                    if (sel && !data.error) {
                        data.forEach(item => {
                            sel.insertAdjacentHTML('beforeend', `<option value="${item[valField]}">${item[textField]}</option>`);
                        });
                    }
                }
            } catch (e) {
                console.error('Error loading ' + elId, e);
            }
        };

        try {
            const res = await fetch(`api/services_analysis.php?action=get_items&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    window.ServicesAnalysisModule.items = data;
                }
            }
        } catch (e) {
            console.error('Error fetching items:', e);
        }

        try {
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    window.ServicesAnalysisModule.customers = data;
                }
            }
        } catch (e) {
            console.error('Error fetching customers:', e);
        }

        await loadOptions(`api/maintain.php?action=get_regions&company_id=${companyId}`, 'sva_region', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_sectors&company_id=${companyId}`, 'sva_business', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_departments&company_id=${companyId}`, 'sva_dept', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_employees&company_id=${companyId}`, 'sva_emp', 'id', 'name');

        const regionSelect = document.getElementById('sva_region');
        if (regionSelect) {
            regionSelect.addEventListener('change', async () => {
                const subRegionSelect = document.getElementById('sva_sub_region');
                if (subRegionSelect) {
                    subRegionSelect.innerHTML = '<option value="">Select Sub Region...</option>';
                    if (regionSelect.value) {
                        await loadOptions(`api/maintain.php?action=get_sub_regions&region_id=${regionSelect.value}`, 'sva_sub_region', 'id', 'name');
                    }
                }
            });
        }
    },

    selectItem: function(id, code, name) {
        document.getElementById('sva_item_id').value = id;
        document.getElementById('sva_item_code').value = code;
        document.getElementById('sva_item_name').value = name;
        document.getElementById('sva_item_suggest').style.display = 'none';
    },

    setupItemSearch: function() {
        const self = window.ServicesAnalysisModule;
        const codeInput = document.getElementById('sva_item_code');
        const nameInput = document.getElementById('sva_item_name');
        const suggest = document.getElementById('sva_item_suggest');
        const hiddenInput = document.getElementById('sva_item_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const filtered = self.items.filter(item => {
                const code = String(item.code || '').toLowerCase();
                const name = String(item.name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20);

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item, idx) => {
                    const code = item.code || '';
                    const name = item.name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div style="padding: 6px 10px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.ServicesAnalysisModule.selectItem(${item.id}, '${safeCode}', '${safeName}')">
                         <b>${code}</b> &nbsp; ${name}
                    </div>`;
                }).join('');
                suggest.style.display = 'block';
            } else {
                suggest.style.display = 'none';
            }
        };

        const onInput = (e) => {
            hiddenInput.value = ''; // clear selection when typing
            handleSearch(e.target.value.trim());
        };
        codeInput.addEventListener('input', onInput);
        nameInput.addEventListener('input', onInput);

        codeInput.addEventListener('focus', function() { this.select(); handleSearch(this.value.trim()); });
        nameInput.addEventListener('focus', function() { this.select(); handleSearch(this.value.trim()); });

        const updateHighlight = (items) => {
            items.forEach((item, idx) => {
                if (idx === suggestIndex) {
                    item.classList.add('active');
                    item.style.background = '#1F4E79';
                    item.style.color = '#fff';
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                    item.style.background = '#fff';
                    item.style.color = '#333';
                }
            });
        };

        const onKeydown = (e) => {
            if (suggest.style.display === 'block') {
                const items = suggest.querySelectorAll('div');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
                    updateHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    suggestIndex = Math.max(suggestIndex - 1, 0);
                    updateHighlight(items);
                } else if (e.key === 'Enter' && suggestIndex >= 0) {
                    e.preventDefault();
                    items[suggestIndex].click();
                }
            }
        };

        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);
    },

    selectCustomer: function(id, code, name) {
        document.getElementById('sva_customer_id').value = id;
        document.getElementById('sva_customer_code').value = code;
        document.getElementById('sva_customer_name').value = name;
        document.getElementById('sva_customer_suggest').style.display = 'none';
    },

    setupCustomerSearch: function() {
        const self = window.ServicesAnalysisModule;
        const codeInput = document.getElementById('sva_customer_code');
        const nameInput = document.getElementById('sva_customer_name');
        const suggest = document.getElementById('sva_customer_suggest');
        const hiddenInput = document.getElementById('sva_customer_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const filtered = self.customers.filter(item => {
                const code = String(item.code || '').toLowerCase();
                const name = String(item.name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20);

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item, idx) => {
                    const code = item.code || '';
                    const name = item.name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div style="padding: 6px 10px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.ServicesAnalysisModule.selectCustomer(${item.id}, '${safeCode}', '${safeName}')">
                         <b>${code}</b> &nbsp; ${name}
                    </div>`;
                }).join('');
                suggest.style.display = 'block';
            } else {
                suggest.style.display = 'none';
            }
        };

        const onInput = (e) => {
            hiddenInput.value = ''; // clear selection when typing
            handleSearch(e.target.value.trim());
        };
        codeInput.addEventListener('input', onInput);
        nameInput.addEventListener('input', onInput);

        codeInput.addEventListener('focus', function() { this.select(); handleSearch(this.value.trim()); });
        nameInput.addEventListener('focus', function() { this.select(); handleSearch(this.value.trim()); });

        const updateHighlight = (items) => {
            items.forEach((item, idx) => {
                if (idx === suggestIndex) {
                    item.classList.add('active');
                    item.style.background = '#1F4E79';
                    item.style.color = '#fff';
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                    item.style.background = '#fff';
                    item.style.color = '#333';
                }
            });
        };

        const onKeydown = (e) => {
            if (suggest.style.display === 'block') {
                const items = suggest.querySelectorAll('div');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
                    updateHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    suggestIndex = Math.max(suggestIndex - 1, 0);
                    updateHighlight(items);
                } else if (e.key === 'Enter' && suggestIndex >= 0) {
                    e.preventDefault();
                    items[suggestIndex].click();
                }
            }
        };

        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);
    },

    formatNumber: function(num) {
        return parseFloat(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatDateDisplay: function(isoDate) {
        if(!isoDate) return '';
        const d = new Date(isoDate);
        if(isNaN(d)) return isoDate;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    },

    display: async function() {
        const self = window.ServicesAnalysisModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        let qs = `?action=get_data&company_id=${companyId}`;
        
        if (document.getElementById('sva_item_id') && document.getElementById('sva_item_id').value) {
            qs += `&item_coa_id=${document.getElementById('sva_item_id').value}`;
        }

        if (document.getElementById('sva_use_customer').checked) qs += `&customer_coa_id=${document.getElementById('sva_customer_id').value}`;
        if (document.getElementById('sva_use_region').checked) qs += `&region_id=${document.getElementById('sva_region').value}`;
        if (document.getElementById('sva_use_sub_region').checked) qs += `&sub_region_id=${document.getElementById('sva_sub_region').value}`;
        if (document.getElementById('sva_use_business').checked) qs += `&business_sector_id=${document.getElementById('sva_business').value}`;
        if (document.getElementById('sva_use_dept').checked) qs += `&department_id=${document.getElementById('sva_dept').value}`;
        if (document.getElementById('sva_use_emp').checked) qs += `&employee_id=${document.getElementById('sva_emp').value}`;

        if (document.getElementById('sva_use_date').checked) {
            const f = document.getElementById('sva_date_from').value;
            const t = document.getElementById('sva_date_to').value;
            if (f) {
                const fd = new Date(f);
                qs += `&from_date=${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-${String(fd.getDate()).padStart(2,'0')}`;
            }
            if (t) {
                const td = new Date(t);
                qs += `&to_date=${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,'0')}-${String(td.getDate()).padStart(2,'0')}`;
            }
        }

        try {
            const res = await fetch(`api/services_analysis.php${qs}`);
            if (res.ok) {
                const json = await res.json();
                if (!json.error) {
                    self.reportData = json.data;
                    self.renderTable();
                } else {
                    alert(json.message);
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    renderTable: function() {
        const self = window.ServicesAnalysisModule;
        const tbody = document.getElementById('sva_tbody');
        tbody.innerHTML = '';

        let tP = 0, tQ = 0, tG = 0, tD = 0, tE = 0, tS = 0, tF = 0, tI = 0;

        self.reportData.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.tabIndex = 0; // Make row focusable
            tr.style.cursor = 'pointer';
            tr.onclick = () => self.selectRow(index);
            tr.ondblclick = () => self.openInvoice(row.invoice_id);

            tQ += parseFloat(row.quantity || 0);
            tG += parseFloat(row.gross_amount || 0);
            tD += parseFloat(row.discount_amount || 0);
            tE += parseFloat(row.amount_excl_tax || 0);
            tS += parseFloat(row.sales_tax || 0);
            tF += parseFloat(row.fur_tax || 0);
            tI += parseFloat(row.amount_incl_tax || 0);

            tr.innerHTML = `
                <td style="border: 1px solid #eee; text-align: center;"><i class="fas fa-caret-right" style="visibility: hidden; color: #333;" id="sva_row_icon_${index}"></i></td>
                <td style="border: 1px solid #eee; padding: 3px; font-weight: bold;">${row.invoice_no || ''}</td>
                <td style="border: 1px solid #eee; padding: 3px;">${self.formatDateDisplay(row.invoice_date)}</td>
                <td style="border: 1px solid #eee; padding: 3px;">${row.customer_name || ''}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.quantity)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: center;">${row.unit || ''}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.rate)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.gross_amount)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.discount_amount)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.amount_excl_tax)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.sales_tax)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.fur_tax)}</td>
                <td style="border: 1px solid #eee; padding: 3px; text-align: right;">${self.formatNumber(row.amount_incl_tax)}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('sva_tot_qty').textContent = self.formatNumber(tQ);
        document.getElementById('sva_tot_gross').textContent = self.formatNumber(tG);
        document.getElementById('sva_tot_disc').textContent = self.formatNumber(tD);
        document.getElementById('sva_tot_excl').textContent = self.formatNumber(tE);
        document.getElementById('sva_tot_stax').textContent = self.formatNumber(tS);
        document.getElementById('sva_tot_ftax').textContent = self.formatNumber(tF);
        document.getElementById('sva_tot_incl').textContent = self.formatNumber(tI);

        self.selectedIndex = -1;
        if (self.reportData.length > 0) {
            self.selectRow(0);
        }
    },

    selectRow: function(index) {
        const self = window.ServicesAnalysisModule;
        if (self.reportData.length === 0) return;
        if (index < 0) index = 0;
        if (index >= self.reportData.length) index = self.reportData.length - 1;

        if (self.selectedIndex >= 0) {
            const oldIcon = document.getElementById(`sva_row_icon_${self.selectedIndex}`);
            if (oldIcon) oldIcon.style.visibility = 'hidden';
            const oldTr = document.querySelector(`#sva_tbody tr:nth-child(${self.selectedIndex + 1})`);
            if (oldTr) {
                oldTr.classList.remove('selected');
                oldTr.style.background = '';
                oldTr.style.color = '';
            }
        }

        self.selectedIndex = index;
        const newIcon = document.getElementById(`sva_row_icon_${self.selectedIndex}`);
        if (newIcon) newIcon.style.visibility = 'visible';
        
        const newTr = document.querySelector(`#sva_tbody tr:nth-child(${self.selectedIndex + 1})`);
        if (newTr) {
            newTr.classList.add('selected');
            newTr.style.background = '#1F4E79';
            newTr.style.color = '#fff';
            newTr.scrollIntoView({ block: 'nearest' });
            newTr.focus(); // Set focus so keyboard events target the row
        }
    },

    handleKeydown: function(e) {
        const self = window.ServicesAnalysisModule;
        // Ignore if focus is in an input/select or suggest box
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (document.getElementById('sva_item_suggest') && document.getElementById('sva_item_suggest').style.display === 'block') return;
        if (document.getElementById('sva_customer_suggest') && document.getElementById('sva_customer_suggest').style.display === 'block') return;
        
        // Ensure this module is currently visible
        if (!document.getElementById('sva_table')) return;

        if (e.key === 'ArrowDown' || e.key === 'Down') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            self.selectRow(Math.min(Number(self.selectedIndex) + 1, self.reportData.length - 1));
        } else if (e.key === 'ArrowUp' || e.key === 'Up') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            self.selectRow(Math.max(Number(self.selectedIndex) - 1, 0));
        } else if (e.key === 'Enter' && self.selectedIndex >= 0) {
            e.preventDefault();
            const row = self.reportData[self.selectedIndex];
            if (row) self.openInvoice(row.invoice_id);
        }
    },

    openInvoice: function(invoiceId) {
        if(!invoiceId) return;
        if(window.hideAllDropdowns) window.hideAllDropdowns();
        if(typeof openModularPopup === 'function') {
            openModularPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice-dollar', 'Sale Invoice', () => { 
                if(window.SIModule) { 
                    window.SIModule.isInitialized = false; 
                    window.SIModule.init(); 
                }
                const companyId = window.selectedCompanyId || 1;
                fetch(`api/sale_invoice.php?action=get_invoice&id=${invoiceId}&company_id=${companyId}`)
                    .then(r => r.json())
                    .then(d => { 
                        if(d && d.id && window.SIModule) {
                            window.SIModule.loadInvoiceData(d); 
                        }
                    })
                    .catch(e => console.error("Error loading invoice:", e));
            }, 'Sale Invoice', true, true);
        }
    },

    printReport: async function() {
        const self = window.ServicesAnalysisModule;
        if (self.reportData.length === 0) {
            alert("No data to print.");
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        const userName = session.name || session.username || 'User';

        let companyInfo = { name: '', address: '', phone: '', email: '' };
        try {
            const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && !data.error) {
                    companyInfo = {
                        name:    (data.name    || '').trim(),
                        address: (data.address || '').trim(),
                        phone:   (data.phone   || '').trim(),
                        email:   (data.email   || '').trim(),
                    };
                }
            }
        } catch(e) { console.error('Could not fetch company info:', e); }

        const companyName = companyInfo.name || session.company_name || 'SOFTIFYX TECHNOLOGIES';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;

        let contactParts = [];
        if (companyInfo.address) contactParts.push(companyInfo.address);
        if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
        if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
        const contactLine = contactParts.length > 0
            ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>`
            : '';

        let html = `
            <html>
            <head>
                <title>Services Analysis</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                    @page { size: landscape; margin: 10mm; }
                    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
                    .hdr-left { width: 100px; text-align: left; }
                    .hdr-center { flex: 1; text-align: center; }
                    .hdr-right { width: 100px; text-align: right; }
                    .hdr h1 { margin: 0; font-size: 16px; }
                    .hdr h2 { margin: 4px 0 0; font-size: 13px; color: #555; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                    th, td { border: 1px solid #000; padding: 4px; text-align: left; }
                    th { background-color: #f0f0f0; }
                    .right { text-align: right; }
                    .center { text-align: center; }
                </style>
            </head>
            <body>
                <div class="hdr">
                    <div class="hdr-left">${logoImg}</div>
                    <div class="hdr-center">
                        <h1>${companyName}</h1>
                        ${contactLine}
                        <h2>Services Analysis</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
            <table>
                <thead>
                    <tr>
                        <th>Tran. No.</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th class="right">Quantity</th>
                        <th class="center">Unit</th>
                        <th class="right">Rate</th>
                        <th class="right">Gross Amount</th>
                        <th class="right">Discount</th>
                        <th class="right">Amt. Excl. Tax</th>
                        <th class="right">Sales Tax</th>
                        <th class="right">Fur. Tax</th>
                        <th class="right">Amt. Incl. Tax</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.reportData.forEach(row => {
            html += `
                <tr>
                    <td>${row.invoice_no || ''}</td>
                    <td>${this.formatDateDisplay(row.invoice_date)}</td>
                    <td>${row.customer_name || ''}</td>
                    <td class="right">${this.formatNumber(row.quantity)}</td>
                    <td class="center">${row.unit || ''}</td>
                    <td class="right">${this.formatNumber(row.rate)}</td>
                    <td class="right">${this.formatNumber(row.gross_amount)}</td>
                    <td class="right">${this.formatNumber(row.discount_amount)}</td>
                    <td class="right">${this.formatNumber(row.amount_excl_tax)}</td>
                    <td class="right">${this.formatNumber(row.sales_tax)}</td>
                    <td class="right">${this.formatNumber(row.fur_tax)}</td>
                    <td class="right">${this.formatNumber(row.amount_incl_tax)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
                <tfoot>
                    <tr style="font-weight: bold; background: #eee;">
                        <td colspan="3" class="right">Totals:</td>
                        <td class="right">${document.getElementById('sva_tot_qty').textContent}</td>
                        <td></td>
                        <td></td>
                        <td class="right">${document.getElementById('sva_tot_gross').textContent}</td>
                        <td class="right">${document.getElementById('sva_tot_disc').textContent}</td>
                        <td class="right">${document.getElementById('sva_tot_excl').textContent}</td>
                        <td class="right">${document.getElementById('sva_tot_stax').textContent}</td>
                        <td class="right">${document.getElementById('sva_tot_ftax').textContent}</td>
                        <td class="right">${document.getElementById('sva_tot_incl').textContent}</td>
                    </tr>
                </tfoot>
            </table>
        `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 250);
    },

    exportExcel: function() {
        let csv = 'Tran. No.,Date,Customer,Quantity,Unit,Rate,Gross Amount,Discount,Amt. Excl. Tax,G.S.T.,S.E.D.,Amt. Incl. Tax\n';
        this.reportData.forEach(row => {
            csv += `"${row.invoice_no||''}","${this.formatDateDisplay(row.invoice_date)}","${row.customer_name||''}",${row.quantity||0},"${row.unit||''}",${row.rate||0},${row.gross_amount||0},${row.discount_amount||0},${row.amount_excl_tax||0},${row.sales_tax||0},${row.fur_tax||0},${row.amount_incl_tax||0}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', 'Item_Sale_Analysis.csv');
        a.click();
    }
};

window.addEventListener('beforeunload', () => {
    document.removeEventListener('keydown', window.ServicesAnalysisModule.handleKeydown);
});
