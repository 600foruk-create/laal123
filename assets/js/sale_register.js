window.SaleRegisterModule = {
    reportData: [],
    selectedIndex: -1,
    customers: [],

    init: async function() {
        const self = window.SaleRegisterModule;
        
        // Date initialization
        const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        document.getElementById('sreg_date_from').value = today;
        document.getElementById('sreg_date_to').value = today;
        
        // Datepicker setup if available
        if (typeof $ !== 'undefined' && $.fn.datepicker) {
            $('#sreg_date_from').datepicker({ dateFormat: 'dd-M-y' });
            $('#sreg_date_to').datepicker({ dateFormat: 'dd-M-y' });
        }

        self.setupFilters();
        self.bindEvents();
        await self.loadLookups();
    },

    setupFilters: function() {
        const toggleFilter = (chkId, inputs) => {
            const chk = document.getElementById(chkId);
            if (!chk) return;
            chk.addEventListener('change', () => {
                inputs.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.disabled = !chk.checked;
                        if(!chk.checked) el.value = '';
                    }
                });
            });
        };

        toggleFilter('sreg_use_cust_type', ['sreg_cust_type']);
        toggleFilter('sreg_use_customer', ['sreg_customer_code', 'sreg_customer_name']);
        toggleFilter('sreg_use_main_region', ['sreg_main_region']);
        toggleFilter('sreg_use_sub_region', ['sreg_sub_region']);
        toggleFilter('sreg_use_sector', ['sreg_sector']);
        toggleFilter('sreg_use_dept', ['sreg_dept']);
        toggleFilter('sreg_use_emp', ['sreg_emp']);
        toggleFilter('sreg_use_date', ['sreg_date_from', 'sreg_date_to']);
    },

    bindEvents: function() {
        const self = window.SaleRegisterModule;
        document.getElementById('sreg_btn_display').onclick = self.fetchReport;
        document.getElementById('sreg_btn_print').onclick = self.printReport;
        document.getElementById('sreg_btn_excel').onclick = self.exportExcel;
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sreg_use_customer') && e.target.id !== 'sreg_customer_code' && e.target.id !== 'sreg_customer_name' && !e.target.closest('#sreg_customer_suggest')) {
                const sugg = document.getElementById('sreg_customer_suggest');
                if(sugg) sugg.style.display = 'none';
            }
        });
    },

    loadLookups: async function() {
        const self = window.SaleRegisterModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        try {
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    self.customers = data;
                }
            }
        } catch (e) {
            console.error('Error fetching customers:', e);
        }

        self.setupCustomerSearch();
        
        const loadOptions = async (url, elId, valField, textField) => {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const d = await r.json();
                    const el = document.getElementById(elId);
                    if (el) {
                        d.forEach(item => {
                            const opt = document.createElement('option');
                            opt.value = item[valField];
                            opt.textContent = item[textField];
                            el.appendChild(opt);
                        });
                    }
                }
            } catch(e){}
        };

        try {
            await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${companyId}`, 'sreg_cust_type', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_regions&company_id=${companyId}`, 'sreg_main_region', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_sectors&company_id=${companyId}`, 'sreg_sector', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_departments&company_id=${companyId}`, 'sreg_dept', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_employees&company_id=${companyId}`, 'sreg_emp', 'id', 'name');

            const regionSelect = document.getElementById('sreg_main_region');
            const subRegionSelect = document.getElementById('sreg_sub_region');
            if (regionSelect && subRegionSelect) {
                regionSelect.addEventListener('change', async () => {
                    subRegionSelect.innerHTML = '<option value="">Select Sub Region...</option>';
                    if (regionSelect.value) {
                        await loadOptions(`api/maintain.php?action=get_sub_regions&region_id=${regionSelect.value}`, 'sreg_sub_region', 'id', 'name');
                    }
                });
            }
        } catch (e) {
            console.error('Error loading lookups', e);
        }
    },

    setupCustomerSearch: function() {
        const self = window.SaleRegisterModule;
        const codeInput = document.getElementById('sreg_customer_code');
        const nameInput = document.getElementById('sreg_customer_name');
        const suggest = document.getElementById('sreg_customer_suggest');
        const hiddenInput = document.getElementById('sreg_customer_id');
        
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
                         onclick="window.SaleRegisterModule.selectCustomer(${item.id}, '${safeCode}', '${safeName}')">
                         <b>${code}</b> &nbsp; ${name}
                    </div>`;
                }).join('');
                suggest.style.display = 'block';
            } else {
                suggest.style.display = 'none';
            }
        };

        const onInput = (e) => {
            hiddenInput.value = ''; 
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
                } else if (e.key === 'Enter' && suggestIndex > -1) {
                    e.preventDefault();
                    items[suggestIndex].click();
                }
            }
        };

        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);
    },

    selectCustomer: function(id, code, name) {
        document.getElementById('sreg_customer_id').value = id;
        document.getElementById('sreg_customer_code').value = code;
        document.getElementById('sreg_customer_name').value = name;
        document.getElementById('sreg_customer_suggest').style.display = 'none';
    },

    fetchReport: async function() {
        const self = window.SaleRegisterModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        let url = `api/sale_report.php?action=get_register_data&company_id=${companyId}`;
        
        const invType = document.querySelector('input[name="sreg_inv_type"]:checked').value;
        url += `&invoice_type_filter=${invType}`;

        if (document.getElementById('sreg_use_customer').checked) {
            const custId = document.getElementById('sreg_customer_id').value;
            if (!custId) { alert("Please select a valid Customer."); return; }
            url += `&customer_coa_id=${custId}`;
        }

        if (document.getElementById('sreg_use_date').checked) {
            const fd = document.getElementById('sreg_date_from').value;
            const td = document.getElementById('sreg_date_to').value;
            if(!fd || !td) { alert("Please enter valid dates."); return; }
            url += `&from_date=${fd}&to_date=${td}`;
        }

        url += `&_t=${Date.now()}`;

        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data.error) {
                    alert(data.error);
                } else {
                    self.reportData = data;
                    self.selectedIndex = -1;
                    self.renderMainGrid();
                }
            } else {
                alert("Failed to fetch data.");
            }
        } catch (e) {
            console.error(e);
            alert("Error fetching data.");
        }
    },

    renderMainGrid: function() {
        const self = window.SaleRegisterModule;
        const tbody = document.getElementById('sreg_tbody');
        tbody.innerHTML = '';
        
        let tPcs = 0, tQty = 0, tExcl = 0, tStax = 0, tFtax = 0, tIncl = 0;

        self.reportData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            
            tr.onclick = () => {
                self.selectedIndex = idx;
                self.updateGridSelection();
            };

            tr.ondblclick = () => {
                if(window.openModularPopup && window.SIModule) {
                    openModularPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice-dollar', 'Sale Invoice', () => {
                        window.SIModule.init(true).then(() => {
                            window.SIModule.isTaxMode = (row.is_tax_invoice == 1);
                            const taxCheck = document.getElementById('si_is_tax');
                            if (taxCheck) taxCheck.checked = window.SIModule.isTaxMode;
                            window.SIModule.toggleTaxMode(false);
                            document.getElementById('si_sn').value = row.invoice_no;
                            
                            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                            const companyId = window.selectedCompanyId || session.company_id || 1;
                            
                            fetch(`api/sale_invoice.php?action=get_invoice&company_id=${companyId}&serial_no=${row.invoice_no}&is_tax=${row.is_tax_invoice}`)
                            .then(r => r.json())
                            .then(d => { if(d && d.id) window.SIModule.loadInvoiceData(d); });
                        });
                    }, 'Sale Invoice', true, true);
                }
            };

            const pcs = parseFloat(row.pieces || 0);
            const qty = parseFloat(row.quantity || 0);
            const rate = parseFloat(row.rate || 0);
            const excl = parseFloat(row.amount_excl_tax || 0);
            const stax = parseFloat(row.sales_tax || 0);
            const ftax = parseFloat(row.further_tax || 0);
            const incl = parseFloat(row.amount_incl_tax || 0);

            let dispDate = row.date || '';
            if (dispDate) {
                const parts = dispDate.split('-');
                if (parts.length === 3) {
                    dispDate = `${parts[2]}-${parts[1]}-${parts[0].substring(2)}`;
                }
            }

            const prefix = row.is_tax_invoice == 1 ? 'STI' : 'SV';
            const invNoDisp = `${row.invoice_no}`; // Match format in image

            tr.innerHTML = `
                <td style="width: 25px; border-right: 1px solid #e0e0e0; padding: 2px; text-align:center;"></td>
                <td style="width: 60px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${invNoDisp}</td>
                <td style="width: 60px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${dispDate}</td>
                <td style="width: 100px; border-right: 1px solid #e0e0e0; padding: 2px;" title="${row.customer_name || ''}">${row.customer_name || ''}</td>
                <td style="width: 80px; border-right: 1px solid #e0e0e0; padding: 2px;">${row.item_code || ''}</td>
                <td style="border-right: 1px solid #e0e0e0; padding: 2px;" title="${row.item_name || ''}">${row.item_name || ''}</td>
                <td style="width: 60px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${pcs.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${qty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 40px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${row.unit || ''}</td>
                <td style="width: 55px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${rate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 80px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${excl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${stax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${ftax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 80px; padding: 2px; text-align: right;">${incl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            `;
            tbody.appendChild(tr);

            tPcs += pcs;
            tQty += qty;
            tExcl += excl;
            tStax += stax;
            tFtax += ftax;
            tIncl += incl;
        });

        const fmt = (v) => v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        
        document.getElementById('sreg_tot_pieces').innerText = fmt(tPcs);
        document.getElementById('sreg_tot_quantity').innerText = fmt(tQty);
        document.getElementById('sreg_tot_excl').innerText = fmt(tExcl);
        document.getElementById('sreg_tot_stax').innerText = fmt(tStax);
        document.getElementById('sreg_tot_ftax').innerText = fmt(tFtax);
        document.getElementById('sreg_tot_incl').innerText = fmt(tIncl);
    },

    updateGridSelection: function() {
        const self = window.SaleRegisterModule;
        const tbody = document.getElementById('sreg_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((r, idx) => {
            if (idx === self.selectedIndex) {
                r.classList.add('selected');
                r.cells[0].innerHTML = '<div class="sreg-row-pointer"></div>';
            } else {
                r.classList.remove('selected');
                r.cells[0].innerHTML = '';
            }
        });
    },

    printReport: async function() {
        const self = window.SaleRegisterModule;
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
        } catch(e) {}

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

        const invType = document.querySelector('input[name="sreg_inv_type"]:checked')?.value || 'all';
        let subTitle = 'Sale Register';
        if (invType === 'tax') subTitle = 'Sale Register (Sales Tax Invoices)';
        else if (invType === 'non_tax') subTitle = 'Sale Register (Sale Invoices - Non Tax)';
        else if (invType === 'pos') subTitle = 'Sale Register (POS Sales)';
        else subTitle = 'Sale Register (All Sales)';

        let html = `
            <html>
            <head>
                <title>${subTitle}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; font-size: 11px; margin: 15px; }
                    @page { size: landscape; margin: 5mm; }
                    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
                    .hdr-left { width: 100px; text-align: left; }
                    .hdr-center { flex: 1; text-align: center; }
                    .hdr-right { width: 100px; text-align: right; }
                    .hdr h1 { margin: 0; font-size: 16px; }
                    .hdr h2 { margin: 4px 0 0; font-size: 13px; color: #555; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
                    th, td { border: 1px solid #000; padding: 4px; text-align: center; white-space: nowrap; overflow: hidden; }
                    th { background-color: #f0f0f0; font-size: 10px; }
                    .text-left { text-align: left; white-space: normal; word-wrap: break-word; }
                    .text-right { text-align: right; }
                    .tot-row { font-weight: bold; background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <div class="hdr">
                    <div class="hdr-left">${logoImg}</div>
                    <div class="hdr-center">
                        <h1>${companyName}</h1>
                        ${contactLine}
                        <h2 style="margin-top: 8px;">${subTitle}</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th class="text-left" style="width: 22%;">Customer</th>
                            <th class="text-left">Item Name</th>
                            <th class="text-right" style="width: 6%;">Pieces</th>
                            <th class="text-right" style="width: 7%;">Quantity</th>
                            <th style="width: 4%;">Unit</th>
                            <th class="text-right" style="width: 6%;">Rate</th>
                            <th class="text-right" style="width: 10%;">Amt Exc. Tax</th>
                            <th class="text-right" style="width: 6%;">Sales Tax</th>
                            <th class="text-right" style="width: 6%;">Further Tax</th>
                            <th class="text-right" style="width: 10%;">Amt Inc. Tax</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let tPcs = 0, tQty = 0, tExcl = 0, tStax = 0, tFtax = 0, tIncl = 0;
        const fmt = (v) => v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

        self.reportData.forEach(row => {
            const pcs = parseFloat(row.pieces || 0);
            const qty = parseFloat(row.quantity || 0);
            const rate = parseFloat(row.rate || 0);
            const excl = parseFloat(row.amount_excl_tax || 0);
            const stax = parseFloat(row.sales_tax || 0);
            const ftax = parseFloat(row.further_tax || 0);
            const incl = parseFloat(row.amount_incl_tax || 0);

            let dispDate = row.date || '';
            if (dispDate) {
                const parts = dispDate.split('-');
                if (parts.length === 3) {
                    dispDate = `${parts[2]}-${parts[1]}-${parts[0].substring(2)}`;
                }
            }

            html += `
                <tr>
                    <td class="text-left">${row.customer_name || ''}</td>
                    <td class="text-left">${row.item_name || ''}</td>
                    <td class="text-right">${fmt(pcs)}</td>
                    <td class="text-right">${fmt(qty)}</td>
                    <td>${row.unit || ''}</td>
                    <td class="text-right">${fmt(rate)}</td>
                    <td class="text-right">${fmt(excl)}</td>
                    <td class="text-right">${fmt(stax)}</td>
                    <td class="text-right">${fmt(ftax)}</td>
                    <td class="text-right">${fmt(incl)}</td>
                </tr>
            `;
            tPcs += pcs; tQty += qty; tExcl += excl; tStax += stax; tFtax += ftax; tIncl += incl;
        });

        html += `
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="2" class="text-right">Totals</td>
                            <td class="text-right">${fmt(tPcs)}</td>
                            <td class="text-right">${fmt(tQty)}</td>
                            <td></td>
                            <td></td>
                            <td class="text-right">${fmt(tExcl)}</td>
                            <td class="text-right">${fmt(tStax)}</td>
                            <td class="text-right">${fmt(tFtax)}</td>
                            <td class="text-right">${fmt(tIncl)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                    <span>Printed by: ${userName}</span>
                    <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
                </div>
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
            </html>
        `;

        const printWin = window.open('', '_blank');
        printWin.document.write(html);
        printWin.document.close();
    },

    exportExcel: function() {
        const self = window.SaleRegisterModule;
        if (self.reportData.length === 0) {
            alert("No data to export.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Invoice No.,Date,Customer,Item Code,Item Name,Pieces,Quantity,Unit,Rate,Amt Exc. Tax,Sales Tax,Further Tax,Amt Inc. Tax\n";

        let tPcs = 0, tQty = 0, tExcl = 0, tStax = 0, tFtax = 0, tIncl = 0;

        self.reportData.forEach(row => {
            const pcs = parseFloat(row.pieces || 0);
            const qty = parseFloat(row.quantity || 0);
            const rate = parseFloat(row.rate || 0);
            const excl = parseFloat(row.amount_excl_tax || 0);
            const stax = parseFloat(row.sales_tax || 0);
            const ftax = parseFloat(row.further_tax || 0);
            const incl = parseFloat(row.amount_incl_tax || 0);
            
            let dispDate = row.date || '';
            if (dispDate) {
                const parts = dispDate.split('-');
                if (parts.length === 3) {
                    dispDate = `${parts[2]}-${parts[1]}-${parts[0].substring(2)}`;
                }
            }

            const cName = `"${(row.customer_name || '').replace(/"/g, '""')}"`;
            const iName = `"${(row.item_name || '').replace(/"/g, '""')}"`;

            csvContent += `${row.invoice_no},${dispDate},${cName},${row.item_code || ''},${iName},${pcs},${qty},${row.unit || ''},${rate},${excl},${stax},${ftax},${incl}\n`;
            
            tPcs += pcs; tQty += qty; tExcl += excl; tStax += stax; tFtax += ftax; tIncl += incl;
        });

        csvContent += `,,,,,${tPcs},${tQty},,,${tExcl},${tStax},${tFtax},${tIncl}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Sale_Register.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
