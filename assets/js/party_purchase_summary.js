window.PartyPurchaseSummaryReport = {
    allVendors: [],
    allEmployees: [],
    selectedIndex: -1,

    init: function() {
        const self = window.PartyPurchaseSummaryReport;
        
        // Event listeners MUST be rebound every time the form is opened 
        // because the DOM elements are destroyed and recreated by openModularPopup.

        // Reset state
        self.selectedIndex = -1;
        document.getElementById('pps_tbody').innerHTML = '';
        self.updateTotals();

        // Bind Checkboxes
        document.getElementById('pps_use_vendor_type').addEventListener('change', function() {
            document.getElementById('pps_vendor_type').disabled = !this.checked;
        });
        document.getElementById('pps_use_vendor').addEventListener('change', function() {
            document.getElementById('pps_vendor_code').disabled = !this.checked;
            document.getElementById('pps_vendor_name').disabled = !this.checked;
            if(!this.checked) {
                document.getElementById('pps_vendor_code').value = '';
                document.getElementById('pps_vendor_name').value = '';
                document.getElementById('pps_vendor_id').value = '';
                document.getElementById('pps_vendor_suggest').style.display = 'none';
            }
        });
        document.getElementById('pps_use_employee').addEventListener('change', function() {
            document.getElementById('pps_employee').disabled = !this.checked;
        });
        document.getElementById('pps_use_date').addEventListener('change', function() {
            document.getElementById('pps_date_from').disabled = !this.checked;
            document.getElementById('pps_date_to').disabled = !this.checked;
        });

        // Bind Buttons
        document.getElementById('pps_btn_display').addEventListener('click', self.fetchSummary);
        
        document.getElementById('pps_btn_excel').addEventListener('click', () => {
            const tbody = document.getElementById('pps_tbody');
            if (!tbody || tbody.children.length === 0) {
                alert('No data to export.');
                return;
            }

            let csv = 'Vendor Code,Vendor Name,No. of Invoices,Amount Excl. Tax,Sales Tax,Further Tax,Carriage / Freight,Amount Incl. Tax\n';

            // Loop through data rows
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(tr => {
                const cells = tr.querySelectorAll('td');
                if (cells.length < 9) return; // skip if not a data row
                
                // Grab text content from columns (skip first column if it's empty space or pointer)
                const vendorCode = (cells[1].innerText || '').replace(/,/g, ' ');
                const vendorName = (cells[2].innerText || '').replace(/,/g, ' ');
                const noInv = (cells[3].innerText || '').replace(/,/g, '');
                const amtExcl = (cells[4].innerText || '').replace(/,/g, '');
                const stax = (cells[5].innerText || '').replace(/,/g, '');
                const ftax = (cells[6].innerText || '').replace(/,/g, '');
                const carriage = (cells[7].innerText || '').replace(/,/g, '');
                const amtIncl = (cells[8].innerText || '').replace(/,/g, '');

                csv += `${vendorCode},${vendorName},${noInv},${amtExcl},${stax},${ftax},${carriage},${amtIncl}\n`;
            });

            // Append Totals row
            const tInv = (document.getElementById('pps_tot_invoices').innerText || '').replace(/,/g, '');
            const tExcl = (document.getElementById('pps_tot_excl').innerText || '').replace(/,/g, '');
            const tStax = (document.getElementById('pps_tot_sales_tax').innerText || '').replace(/,/g, '');
            const tFtax = (document.getElementById('pps_tot_further').innerText || '').replace(/,/g, '');
            const tFreight = (document.getElementById('pps_tot_freight').innerText || '').replace(/,/g, '');
            const tIncl = (document.getElementById('pps_tot_incl').innerText || '').replace(/,/g, '');
            
            csv += `,Totals,${tInv},${tExcl},${tStax},${tFtax},${tFreight},${tIncl}\n`;

            // Export logic
            const link = document.createElement('a');
            link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
            link.download = `Purchase_Summary_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        document.getElementById('pps_btn_print').addEventListener('click', async () => {
            const table = document.getElementById('pps_table');
            const tbody = document.getElementById('pps_tbody');
            if (!tbody || tbody.children.length === 0) {
                alert('No data to print.');
                return;
            }
            const clone = table.cloneNode(true);
            
            // Clean up cloned table for print
            // 1. Header has 12 columns (first and last are spacers)
            const theadTr = clone.querySelector('thead tr');
            if (theadTr && theadTr.children.length > 0) {
                theadTr.removeChild(theadTr.children[0]);
            }
            
            // 2. Body has 11 columns (only first is spacer)
            clone.querySelectorAll('tbody tr').forEach(tr => {
                if(tr.children.length > 0) tr.removeChild(tr.children[0]);
            });

            // 3. Remove inline widths from all cells
            clone.querySelectorAll('tr').forEach(tr => {
                Array.from(tr.children).forEach(cell => {
                    cell.style.width = ''; // Remove fixed inline widths
                });
            });

            const cloneTbody = clone.querySelector('tbody');
            
            const tRow = document.createElement('tr');
            tRow.style.fontWeight = 'bold';
            tRow.style.background = '#f0f0f0';
            tRow.innerHTML = `
                <td colspan="2" style="text-align:right; padding:4px; border: 1px solid #000;">Totals Rs.</td>
                <td style="text-align:center; padding:4px; border: 1px solid #000;">${document.getElementById('pps_tot_invoices').innerText}</td>
                <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('pps_tot_excl').innerText}</td>
                <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('pps_tot_sales_tax').innerText}</td>
                <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('pps_tot_further').innerText}</td>
                <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('pps_tot_freight').innerText}</td>
                <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('pps_tot_incl').innerText}</td>
            `;
            cloneTbody.appendChild(tRow);

            // Get company details
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const userName = session.name || session.username || 'User';
            
            // Fetch fresh company data directly from API
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
            } catch(e) { console.error('Could not fetch company info for print:', e); }

            const companyName = companyInfo.name || session.company_name || 'SOFTIFYX TECHNOLOGIES';
            const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
            const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;
            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

            let contactParts = [];
            if (companyInfo.address) contactParts.push(companyInfo.address);
            if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
            if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
            const contactLine = contactParts.length > 0
                ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>`
                : '';

            const printContent = `<!DOCTYPE html>
            <html>
            <head>
                <title>Party Purchase Summary</title>
                <base href="${baseUrl}">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                <style>
                    @page { margin: 0; size: A4; }
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
                    
                    table { width: 100%; border-collapse: collapse; font-size: 10px; }
                    th, td { border: 1px solid #000; padding: 4px 4px; }
                    th { background: #f0f0f0; font-weight: bold; }
                    .pps-row-pointer { display: none !important; }
                </style>
            </head>
            <body>
            <div class="page-container">
                <div class="header-area">
                    <div class="logo-box">
                        <img src="${actualLogo}" alt="Logo" onerror="this.style.display='none'">
                    </div>
                    <div class="company-info">
                        <div class="company-name">${companyName}</div>
                        <div class="company-contacts">
                            <div class="contact-row">
                                <span><i class="fas fa-map-marker-alt"></i> ${companyInfo.address || ''}</span>
                            </div>
                            <div class="contact-row">
                                <span><i class="fas fa-phone-alt"></i> ${companyInfo.phone || ''}</span>
                                <span><i class="fas fa-envelope"></i> ${companyInfo.email || ''}</span>
                                <span><i class="fas fa-globe"></i> www.seastonepipes.com</span>
                            </div>
                        </div>
                    </div>
                    <div class="invoice-badge-area">
                        <div class="invoice-title">PARTY PURCHASE SUMMARY</div>
                    </div>
                </div>
            ${clone.outerHTML}
            <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                <span>Printed by: ${userName}</span>
                <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
            </div>
            </div> <!-- End page-container -->
            <script>window.onload = function() { window.print(); window.close(); }</script>
            </body></html>`;

            const printWindow = window.open('', '_blank');
            printWindow.document.write(printContent);
            printWindow.document.close();
        });

        // Keyboard Navigation is now bound globally at the bottom of the script

        // Load Initial Data
        self.loadData();
    },

    loadData: async function() {
        const self = window.PartyPurchaseSummaryReport;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        // Fetch Vendors
        try {
            const res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if(res.ok) self.allVendors = await res.json();
        } catch (e) { console.error('Failed to load vendors', e); }

        // Fetch Vendor Categories
        try {
            const res = await fetch(`api/party_purchase_summary.php?action=get_vendor_categories&company_id=${companyId}`);
            if(res.ok) {
                const categories = await res.json();
                const typeSelect = document.getElementById('pps_vendor_type');
                typeSelect.innerHTML = '<option value="all">All</option>';
                categories.forEach(cat => {
                    typeSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
                });
            }
        } catch (e) { console.error('Failed to load vendor categories', e); }

        // Fetch Employees
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            if(res.ok) {
                self.allEmployees = await res.json();
                const empSelect = document.getElementById('pps_employee');
                empSelect.innerHTML = '<option value="">Select Employee...</option>';
                self.allEmployees.forEach(emp => {
                    const displayStr = emp.code ? `${emp.code} - ${emp.name}` : emp.name;
                    empSelect.innerHTML += `<option value="${emp.id}">${displayStr}</option>`;
                });
            }
        } catch (e) { console.error('Failed to load employees', e); }

        // Set default dates to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('pps_date_from').value = today;
        document.getElementById('pps_date_to').value = today;

        self.setupSmartSearch('pps_vendor_code', 'pps_vendor_name', 'pps_vendor_suggest', 'pps_vendor_id');
    },

    setupSmartSearch: function(codeId, nameId, suggestId, hiddenId) {
        const self = window.PartyPurchaseSummaryReport;
        const codeInput = document.getElementById(codeId);
        const nameInput = document.getElementById(nameId);
        const suggest = document.getElementById(suggestId);
        const hiddenInput = document.getElementById(hiddenId);
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const dataSource = self.allVendors;
            
            const filtered = dataSource.filter(item => {
                const code = String(item.account_code || item.code || item.item_code || '').toLowerCase();
                const name = String(item.account_name || item.name || item.description || item.item_name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20);

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item, idx) => {
                    const code = item.account_code || item.code || item.item_code || '';
                    const name = item.account_name || item.name || item.description || item.item_name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div class="ps-suggest-item" style="padding: 6px 10px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.PartyPurchaseSummaryReport.selectSuggestion('${codeId}', '${nameId}', '${hiddenId}', '${suggestId}', ${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
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

        codeInput.addEventListener('focus', function() { this.select(); });
        nameInput.addEventListener('focus', function() { this.select(); });

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

        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                suggestIndex = -1;
            }
        });
    },

    selectSuggestion: function(codeId, nameId, hiddenId, suggestId, id, code, name) {
        document.getElementById(hiddenId).value = id;
        document.getElementById(codeId).value = code;
        document.getElementById(nameId).value = name;
        document.getElementById(suggestId).style.display = 'none';
    },

    fetchSummary: async function() {
        const self = window.PartyPurchaseSummaryReport;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const taxFilter = document.querySelector('input[name="pps_tax_filter"]:checked').value;
        const useVendorType = document.getElementById('pps_use_vendor_type').checked;
        const vendorTypeId = useVendorType ? document.getElementById('pps_vendor_type').value : 'all';
        const useVendor = document.getElementById('pps_use_vendor').checked;
        const vendorId = useVendor ? document.getElementById('pps_vendor_id').value : '';
        const useEmployee = document.getElementById('pps_use_employee').checked;
        const employeeId = useEmployee ? document.getElementById('pps_employee').value : '';
        const useDate = document.getElementById('pps_use_date').checked;
        const dateFrom = useDate ? document.getElementById('pps_date_from').value : '';
        const dateTo = useDate ? document.getElementById('pps_date_to').value : '';

        if (useVendor && !vendorId) {
            alert('Please select a valid Vendor from the list.');
            return;
        }

        const tbody = document.getElementById('pps_tbody');
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">Loading data...</td></tr>';
        
        let url = `api/party_purchase_summary.php?action=get_party_purchase_summary&company_id=${companyId}&tax_filter=${taxFilter}`;
        if (useVendorType && vendorTypeId !== 'all') url += `&vendor_type_id=${vendorTypeId}`;
        if (vendorId) url += `&vendor_id=${vendorId}`;
        if (employeeId) url += `&employee_id=${employeeId}`;
        if (dateFrom) url += `&date_from=${dateFrom}`;
        if (dateTo) url += `&date_to=${dateTo}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);

            tbody.innerHTML = '';
            let tInv = 0, tExcl = 0, tSales = 0, tFurther = 0, tFreight = 0, tIncl = 0;

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No records found.</td></tr>';
                self.updateTotals();
                return;
            }

            data.forEach((row, index) => {
                tInv += parseInt(row.no_of_invoices) || 0;
                tExcl += parseFloat(row.amount_excl_tax) || 0;
                tSales += parseFloat(row.sales_tax) || 0;
                tFurther += parseFloat(row.further_tax) || 0;
                tFreight += parseFloat(row.carriage_freight) || 0;
                tIncl += parseFloat(row.amount_incl_tax) || 0;

                const tr = document.createElement('tr');
                tr.setAttribute('data-index', index);
                
                tr.innerHTML = `
                    <td style="text-align: center;"><span class="pps-row-pointer"></span></td>
                    <td>${row.vendor_code || ''}</td>
                    <td>${row.vendor_name || ''}</td>
                    <td style="text-align:center;">${row.no_of_invoices}</td>
                    <td style="text-align:right;">${self.formatNumber(row.amount_excl_tax)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.sales_tax)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.further_tax)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.carriage_freight)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.amount_incl_tax)}</td>
                `;

                tr.addEventListener('click', () => {
                    self.selectedIndex = index;
                    self.updateRowHighlight();
                });

                tbody.appendChild(tr);
            });

            self.updateTotals(tInv, tExcl, tSales, tFurther, tFreight, tIncl);
            self.selectedIndex = -1;

        } catch (e) {
            console.error('Fetch error:', e);
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px; color:red;">Error loading data: ${e.message}</td></tr>`;
        }
    },

    handleKeydown: function(e) {
        const self = window.PartyPurchaseSummaryReport;
        const tbody = document.getElementById('pps_tbody');
        if (!tbody || tbody.innerHTML === '' || tbody.children.length === 0) return;
        
        // Ensure we are in the module (rough check if it's visible)
        if (!document.getElementById('pps_table').offsetParent) return;
        // Don't hijack if user is typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowDown' && self.selectedIndex === -1) {
            e.preventDefault();
            self.selectedIndex = 0;
            self.updateRowHighlight();
        } else if (e.key === 'Enter' && self.selectedIndex >= 0) {
            e.preventDefault();
            const tr = tbody.querySelector(`tr[data-index="${self.selectedIndex}"]`);
            if (tr) {
                // Trigger double click logic
                const event = new MouseEvent('dblclick', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                tr.dispatchEvent(event);
            }
        }
    },

    updateRowHighlight: function() {
        const self = window.PartyPurchaseSummaryReport;
        const tbody = document.getElementById('pps_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            if (index === self.selectedIndex) {
                row.classList.add('selected');
                row.scrollIntoView({ block: 'nearest' });
            } else {
                row.classList.remove('selected');
            }
        });
    },

    updateTotals: function(inv=0, excl=0, sales=0, further=0, freight=0, incl=0) {
        const self = window.PartyPurchaseSummaryReport;
        document.getElementById('pps_tot_invoices').textContent = inv;
        document.getElementById('pps_tot_excl').textContent = self.formatNumber(excl);
        document.getElementById('pps_tot_sales_tax').textContent = self.formatNumber(sales);
        document.getElementById('pps_tot_further').textContent = self.formatNumber(further);
        document.getElementById('pps_tot_freight').textContent = self.formatNumber(freight);
        document.getElementById('pps_tot_incl').textContent = self.formatNumber(incl);
    },

    formatNumber: function(num) {
        if (!num) return '0.00';
        return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
};

// Bind Keyboard Navigation for the table GLOBALLY just ONCE to avoid duplication across script reloads
if (!window._globalPpsKeydownBound) {
    document.addEventListener('keydown', function(e) {
        if (window.PartyPurchaseSummaryReport && typeof window.PartyPurchaseSummaryReport.handleKeydown === 'function') {
            window.PartyPurchaseSummaryReport.handleKeydown(e);
        }
    });
    window._globalPpsKeydownBound = true;
}
