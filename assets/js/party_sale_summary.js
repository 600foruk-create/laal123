window.PartySaleSummaryModule = {
    reportData: [],
    selectedIndex: -1,
    customers: [],

    init: async function() {
        const self = window.PartySaleSummaryModule;
        
        // Date initialization
        const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        document.getElementById('pss_date_from').value = today;
        document.getElementById('pss_date_to').value = today;
        
        // Datepicker setup if available
        if (typeof $ !== 'undefined' && $.fn.datepicker) {
            $('#pss_date_from').datepicker({ dateFormat: 'dd-M-y' });
            $('#pss_date_to').datepicker({ dateFormat: 'dd-M-y' });
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

        toggleFilter('pss_use_cust_type', ['pss_cust_type']);
        toggleFilter('pss_use_customer', ['pss_customer_code', 'pss_customer_name']);
        toggleFilter('pss_use_main_region', ['pss_main_region']);
        toggleFilter('pss_use_sub_region', ['pss_sub_region']);
        toggleFilter('pss_use_sector', ['pss_sector']);
        toggleFilter('pss_use_dept', ['pss_dept']);
        toggleFilter('pss_use_emp', ['pss_emp']);
        toggleFilter('pss_use_date', ['pss_date_from', 'pss_date_to']);
    },

    bindEvents: function() {
        const self = window.PartySaleSummaryModule;
        document.getElementById('pss_btn_display').onclick = self.fetchReport;
        document.getElementById('pss_btn_print').onclick = self.printReport;
        document.getElementById('pss_btn_excel').onclick = self.exportExcel;
        
        // Suggest box events handled by setupCustomerSearch
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#pss_use_customer') && e.target.id !== 'pss_customer_code' && e.target.id !== 'pss_customer_name' && !e.target.closest('#pss_customer_suggest')) {
                document.getElementById('pss_customer_suggest').style.display = 'none';
            }
        });
    },

    loadLookups: async function() {
        const self = window.PartySaleSummaryModule;
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
        
        // Load dropdowns from maintain API
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
            await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${companyId}`, 'pss_cust_type', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_regions&company_id=${companyId}`, 'pss_main_region', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_sectors&company_id=${companyId}`, 'pss_sector', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_departments&company_id=${companyId}`, 'pss_dept', 'id', 'name');
            await loadOptions(`api/maintain.php?action=get_employees&company_id=${companyId}`, 'pss_emp', 'id', 'name');

            // Handle sub-region loading when region changes
            const regionSelect = document.getElementById('pss_main_region');
            const subRegionSelect = document.getElementById('pss_sub_region');
            if (regionSelect && subRegionSelect) {
                regionSelect.addEventListener('change', async () => {
                    subRegionSelect.innerHTML = '<option value="">Select Sub Region...</option>';
                    if (regionSelect.value) {
                        await loadOptions(`api/maintain.php?action=get_sub_regions&region_id=${regionSelect.value}`, 'pss_sub_region', 'id', 'name');
                    }
                });
            }
        } catch (e) {
            console.error('Error loading lookups', e);
        }
    },

    setupCustomerSearch: function() {
        const self = window.PartySaleSummaryModule;
        const codeInput = document.getElementById('pss_customer_code');
        const nameInput = document.getElementById('pss_customer_name');
        const suggest = document.getElementById('pss_customer_suggest');
        const hiddenInput = document.getElementById('pss_customer_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const filtered = self.customers.filter(item => {
                const code = String(item.code || '').toLowerCase();
                const name = String(item.name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20); // limit to 20

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
                         onclick="window.PartySaleSummaryModule.selectCustomer(${item.id}, '${safeCode}', '${safeName}')">
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
        document.getElementById('pss_customer_id').value = id;
        document.getElementById('pss_customer_code').value = code;
        document.getElementById('pss_customer_name').value = name;
        document.getElementById('pss_customer_suggest').style.display = 'none';
    },

    fetchReport: async function() {
        const self = window.PartySaleSummaryModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        let url = `api/party_sale_summary.php?action=get_data&company_id=${companyId}`;
        
        // Radio filter
        const invType = document.querySelector('input[name="pss_inv_type"]:checked').value;
        url += `&invoice_type_filter=${invType}`;

        if (document.getElementById('pss_use_customer').checked) {
            const custId = document.getElementById('pss_customer_id').value;
            if (!custId) { alert("Please select a valid Customer."); return; }
            url += `&customer_coa_id=${custId}`;
        }

        if (document.getElementById('pss_use_cust_type').checked) {
            const val = document.getElementById('pss_cust_type').value;
            if (val) url += `&customer_type_id=${val}`;
        }
        if (document.getElementById('pss_use_main_region').checked) {
            const val = document.getElementById('pss_main_region').value;
            if (val) url += `&region_id=${val}`;
        }
        if (document.getElementById('pss_use_sub_region').checked) {
            const val = document.getElementById('pss_sub_region').value;
            if (val) url += `&sub_region_id=${val}`;
        }
        if (document.getElementById('pss_use_sector').checked) {
            const val = document.getElementById('pss_sector').value;
            if (val) url += `&business_sector_id=${val}`;
        }
        if (document.getElementById('pss_use_dept').checked) {
            const val = document.getElementById('pss_dept').value;
            if (val) url += `&department_id=${val}`;
        }
        if (document.getElementById('pss_use_emp').checked) {
            const val = document.getElementById('pss_emp').value;
            if (val) url += `&employee_id=${val}`;
        }

        if (document.getElementById('pss_use_date').checked) {
            const fd = document.getElementById('pss_date_from').value;
            const td = document.getElementById('pss_date_to').value;
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
        const self = window.PartySaleSummaryModule;
        const tbody = document.getElementById('pss_tbody');
        tbody.innerHTML = '';
        
        let tInv = 0, tExcl = 0, tStax = 0, tFtax = 0, tCarr = 0, tIncl = 0;

        self.reportData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            
            tr.onclick = () => {
                self.selectedIndex = idx;
                self.updateGridSelection();
            };

            const invCount = parseInt(row.no_of_invoices || 0);
            const excl = parseFloat(row.amount_excl_tax || 0);
            const stax = parseFloat(row.sales_tax || 0);
            const ftax = parseFloat(row.further_tax || 0);
            const carr = parseFloat(row.carriage_fr || 0);
            const incl = parseFloat(row.amount_incl_tax || 0);

            tr.innerHTML = `
                <td style="width: 25px; border-right: 1px solid #e0e0e0; padding: 2px; text-align:center;"></td>
                <td style="width: 100px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${row.customer_code || ''}</td>
                <td style="border-right: 1px solid #e0e0e0; padding: 2px;" title="${row.customer_name || ''}">${row.customer_name || ''}</td>
                <td style="width: 100px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${invCount}</td>
                <td style="width: 110px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${excl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 100px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${stax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 100px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${ftax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 100px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${carr.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 120px; padding: 2px; text-align: right;">${incl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            `;
            tbody.appendChild(tr);

            tInv += invCount;
            tExcl += excl;
            tStax += stax;
            tFtax += ftax;
            tCarr += carr;
            tIncl += incl;
        });

        const fmt = (v) => v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        
        document.getElementById('pss_tot_inv').innerText = tInv;
        document.getElementById('pss_tot_excl').innerText = fmt(tExcl);
        document.getElementById('pss_tot_stax').innerText = fmt(tStax);
        document.getElementById('pss_tot_ftax').innerText = fmt(tFtax);
        document.getElementById('pss_tot_carr').innerText = fmt(tCarr);
        document.getElementById('pss_tot_incl').innerText = fmt(tIncl);
    },

    updateGridSelection: function() {
        const self = window.PartySaleSummaryModule;
        const tbody = document.getElementById('pss_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((r, idx) => {
            if (idx === self.selectedIndex) {
                r.classList.add('selected');
                r.cells[0].innerHTML = '<div class="sr-row-pointer"></div>';
            } else {
                r.classList.remove('selected');
                r.cells[0].innerHTML = '';
            }
        });
    },

    printReport: async function() {
        const self = window.PartySaleSummaryModule;
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

        const invType = document.querySelector('input[name="pss_inv_type"]:checked')?.value || 'all';
        let subTitle = 'Party Sale Summary';
        if (invType === 'tax') subTitle = 'Party Sale Summary (Sales Tax Invoices)';
        else if (invType === 'non_tax') subTitle = 'Party Sale Summary (Sale Invoices - Non Tax)';
        else if (invType === 'pos') subTitle = 'Party Sale Summary (POS Sales)';
        else subTitle = 'Party Sale Summary (All Sales)';

        let html = `
            <html>
            <head>
                <title>${subTitle}</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                    @page { size: landscape; margin: 10mm; }
                    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
                    .hdr-left { width: 100px; text-align: left; }
                    .hdr-center { flex: 1; text-align: center; }
                    .hdr-right { width: 100px; text-align: right; }
                    .hdr h1 { margin: 0; font-size: 16px; }
                    .hdr h2 { margin: 4px 0 0; font-size: 13px; color: #555; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #000; padding: 4px; text-align: center; white-space: nowrap; }
                    th { background-color: #f0f0f0; font-size: 10px; }
                    .text-left { text-align: left; }
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
                        <h2>${subTitle}</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th class="text-left" style="width: 15%;">Customer Code</th>
                            <th class="text-left" style="width: 25%;">Customer Name</th>
                            <th style="width: 10%;">No. of Invoices</th>
                            <th class="text-right" style="width: 10%;">Amount Excl. Tax</th>
                            <th class="text-right" style="width: 10%;">Sales Tax</th>
                            <th class="text-right" style="width: 10%;">Further Tax</th>
                            <th class="text-right" style="width: 10%;">Carriage / Fr.</th>
                            <th class="text-right" style="width: 10%;">Amount Incl. Tax</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let tInv = 0, tExcl = 0, tStax = 0, tFtax = 0, tCarr = 0, tIncl = 0;

        const fmt = (v) => v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

        self.reportData.forEach(row => {
            const invCount = parseInt(row.no_of_invoices || 0);
            const excl = parseFloat(row.amount_excl_tax || 0);
            const stax = parseFloat(row.sales_tax || 0);
            const ftax = parseFloat(row.further_tax || 0);
            const carr = parseFloat(row.carriage_fr || 0);
            const incl = parseFloat(row.amount_incl_tax || 0);

            html += `
                <tr>
                    <td class="text-left">${row.customer_code || ''}</td>
                    <td class="text-left">${row.customer_name || ''}</td>
                    <td>${invCount}</td>
                    <td class="text-right">${fmt(excl)}</td>
                    <td class="text-right">${fmt(stax)}</td>
                    <td class="text-right">${fmt(ftax)}</td>
                    <td class="text-right">${fmt(carr)}</td>
                    <td class="text-right">${fmt(incl)}</td>
                </tr>
            `;
            tInv += invCount;
            tExcl += excl;
            tStax += stax;
            tFtax += ftax;
            tCarr += carr;
            tIncl += incl;
        });

        html += `
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="2" class="text-right">Totals</td>
                            <td>${tInv}</td>
                            <td class="text-right">${fmt(tExcl)}</td>
                            <td class="text-right">${fmt(tStax)}</td>
                            <td class="text-right">${fmt(tFtax)}</td>
                            <td class="text-right">${fmt(tCarr)}</td>
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
        const self = window.PartySaleSummaryModule;
        if (self.reportData.length === 0) {
            alert("No data to export.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Customer Code,Customer Name,No. of Invoices,Amount Excl. Tax,Sales Tax,Further Tax,Carriage / Fr.,Amount Incl. Tax\n";

        let tInv = 0, tExcl = 0, tStax = 0, tFtax = 0, tCarr = 0, tIncl = 0;

        self.reportData.forEach(row => {
            const invCount = parseInt(row.no_of_invoices || 0);
            const excl = parseFloat(row.amount_excl_tax || 0);
            const stax = parseFloat(row.sales_tax || 0);
            const ftax = parseFloat(row.further_tax || 0);
            const carr = parseFloat(row.carriage_fr || 0);
            const incl = parseFloat(row.amount_incl_tax || 0);
            
            const code = `"${(row.customer_code || '').replace(/"/g, '""')}"`;
            const name = `"${(row.customer_name || '').replace(/"/g, '""')}"`;
            
            csvContent += `${code},${name},${invCount},${excl},${stax},${ftax},${carr},${incl}\n`;
            
            tInv += invCount;
            tExcl += excl;
            tStax += stax;
            tFtax += ftax;
            tCarr += carr;
            tIncl += incl;
        });

        csvContent += `Totals,,${tInv},${tExcl},${tStax},${tFtax},${tCarr},${tIncl}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Party_Sale_Summary.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
