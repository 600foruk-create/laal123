window.PaymentsReportsModule = {
    allVendors: [],
    allEmployees: [],
    selectedIndex: -1,

    init: function() {
        const self = window.PaymentsReportsModule;
        
        // Event listeners MUST be rebound every time the form is opened 

        // Reset state
        self.selectedIndex = -1;
        document.getElementById('payr_tbody').innerHTML = '';
        self.updateTotals();

        // Bind Checkboxes
        document.getElementById('payr_use_type').addEventListener('change', function() {
            document.getElementById('payr_payment_type').disabled = !this.checked;
        });
        document.getElementById('payr_use_vendor_type').addEventListener('change', function() {
            document.getElementById('payr_vendor_type').disabled = !this.checked;
        });
        document.getElementById('payr_use_vendor').addEventListener('change', function() {
            document.getElementById('payr_vendor_code').disabled = !this.checked;
            document.getElementById('payr_vendor_name').disabled = !this.checked;
            if(!this.checked) {
                document.getElementById('payr_vendor_code').value = '';
                document.getElementById('payr_vendor_name').value = '';
                document.getElementById('payr_vendor_id').value = '';
                document.getElementById('payr_vendor_suggest').style.display = 'none';
            }
        });
        document.getElementById('payr_use_employee').addEventListener('change', function() {
            document.getElementById('payr_employee').disabled = !this.checked;
        });
        document.getElementById('payr_use_date').addEventListener('change', function() {
            document.getElementById('payr_date_from').disabled = !this.checked;
            document.getElementById('payr_date_to').disabled = !this.checked;
        });

        // Bind Buttons
        document.getElementById('payr_btn_display').addEventListener('click', self.fetchData);
        document.getElementById('payr_btn_print').addEventListener('click', self.printReport);
        document.getElementById('payr_btn_excel').addEventListener('click', self.exportExcel);

        // Bind Keyboard Navigation
        document.getElementById('payr_table').parentElement.addEventListener('keydown', self.handleKeyDown);
        // Ensure the div can receive focus for keydown
        const tableContainer = document.getElementById('payr_table').parentElement;
        if (!tableContainer.hasAttribute('tabindex')) {
            tableContainer.setAttribute('tabindex', '0');
            tableContainer.style.outline = 'none'; // hide focus ring
        }

        self.loadInitialData();
        self.setupSmartSearch('payr_vendor_code', 'payr_vendor_name', 'payr_vendor_suggest', 'payr_vendor_id');
    },

    setupSmartSearch: function(codeId, nameId, suggestId, hiddenId) {
        const self = window.PaymentsReportsModule;
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
                         onclick="window.PaymentsReportsModule.selectSuggestion('${codeId}', '${nameId}', '${hiddenId}', '${suggestId}', ${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
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

    loadInitialData: async function() {
        const companyId = window.UserContext ? window.UserContext.company_id : 1;

        // Fetch All Vendors for Smart Search
        try {
            const res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if(res.ok) this.allVendors = await res.json();
        } catch (e) { console.error('Failed to load vendors', e); }
        
        // Fetch Vendor Categories
        try {
            const res = await fetch(`api/payments_reports.php?action=get_vendor_categories&company_id=${companyId}`);
            if(res.ok) {
                const categories = await res.json();
                const typeSelect = document.getElementById('payr_vendor_type');
                typeSelect.innerHTML = '<option value="all">All</option>';
                categories.forEach(c => {
                    typeSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                });
            }
        } catch(e) { console.error(e); }

        // Fetch Employees
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            if(res.ok) {
                const employees = await res.json();
                const empSelect = document.getElementById('payr_employee');
                empSelect.innerHTML = '<option value="">Select Employee...</option>';
                employees.forEach(e => {
                    const displayStr = e.code ? `${e.code} - ${e.name}` : e.name;
                    empSelect.innerHTML += `<option value="${e.id}">${displayStr}</option>`;
                });
            }
        } catch(e) { console.error(e); }

        // Set default dates to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('payr_date_from').value = today;
        document.getElementById('payr_date_to').value = today;
    },

    formatNumber: function(num) {
        if (!num) return '0.00';
        return parseFloat(num).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },

    fetchData: async function() {
        const companyId = window.UserContext ? window.UserContext.company_id : 1;
        const self = window.PaymentsReportsModule;
        
        const useVendorType = document.getElementById('payr_use_vendor_type').checked;
        const vendorTypeId = document.getElementById('payr_vendor_type').value;
        const useType = document.getElementById('payr_use_type').checked;
        const docType = document.getElementById('payr_payment_type').value;
        const useVendor = document.getElementById('payr_use_vendor').checked;
        const vendorId = document.getElementById('payr_vendor_id').value;
        const useEmployee = document.getElementById('payr_use_employee').checked;
        const employeeId = document.getElementById('payr_employee').value;
        const useDate = document.getElementById('payr_use_date').checked;
        const dateFrom = document.getElementById('payr_date_from').value;
        const dateTo = document.getElementById('payr_date_to').value;

        const tbody = document.getElementById('payr_tbody');
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:20px;">Loading data...</td></tr>';
        
        let url = `api/payments_reports.php?action=get_payments_report&company_id=${companyId}`;
        if (useType && docType !== 'all') url += `&doc_type=${docType}`;
        if (useVendorType && vendorTypeId !== 'all') url += `&vendor_type_id=${vendorTypeId}`;
        if (useVendor && vendorId) url += `&vendor_id=${vendorId}`;
        if (useEmployee && employeeId) url += `&employee_id=${employeeId}`;
        if (useDate && dateFrom) url += `&date_from=${dateFrom}`;
        if (useDate && dateTo) url += `&date_to=${dateTo}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) throw new Error(data.error);

            tbody.innerHTML = '';
            let tPaid = 0, tWht = 0, tFlood = 0, tSales = 0, tAdv = 0, tDisc = 0;

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:20px;">No records found.</td></tr>';
                self.updateTotals();
                return;
            }

            data.forEach((row, index) => {
                tPaid += parseFloat(row.amount_paid) || 0;
                tWht += parseFloat(row.wh_tax) || 0;
                tFlood += parseFloat(row.flood_tax) || 0;
                tSales += parseFloat(row.sales_tax) || 0;
                tAdv += parseFloat(row.advance_adj) || 0;
                tDisc += parseFloat(row.discount) || 0;

                const tr = document.createElement('tr');
                tr.setAttribute('data-index', index);
                
                tr.innerHTML = `
                    <td style="text-align: center;"><span class="payr-row-pointer"></span></td>
                    <td>${row.date_fmt || ''}</td>
                    <td>${row.tran_no || ''}</td>
                    <td>${row.vendor_name || ''}</td>
                    <td>${row.cash_bank_name || ''}</td>
                    <td>${row.cheque_no || ''}</td>
                    <td style="text-align:right;">${self.formatNumber(row.amount_paid)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.wh_tax)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.flood_tax)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.sales_tax)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.advance_adj)}</td>
                    <td style="text-align:right;">${self.formatNumber(row.discount)}</td>
                `;

                tr.addEventListener('click', () => {
                    self.selectedIndex = index;
                    self.updateRowHighlight();
                });

                tr.addEventListener('dblclick', () => {
                    const docType = row.doc_type; // 'BPV' or 'CPV'
                    const sn = parseInt(row.serial_no);
                    
                    if (docType === 'BPV') {
                        const initCb = async () => {
                            try {
                                if (window.BPModule && window.BPModule.init) await window.BPModule.init();
                                const bpRes = await fetch(`api/bank_payments.php?action=get&serial_no=${sn}&company_id=${companyId}`);
                                if(bpRes.ok) {
                                    const bpData = await bpRes.json();
                                    if(bpData && !bpData.error && window.BPModule && window.BPModule.loadData) {
                                        window.BPModule.loadData(bpData);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading BPV:', e); }
                        };
                        window.openModularPopup('Navigation/Purchases/bank_payments.html', 'fa-university', 'Bank Payments', initCb, 'Bank Payments', true, true);
                    } else if (docType === 'CPV') {
                        const initCb = async () => {
                            try {
                                if (window.CPModule && window.CPModule.init) await window.CPModule.init();
                                const cpRes = await fetch(`api/cash_payments.php?action=get&serial_no=${sn}&company_id=${companyId}`);
                                if(cpRes.ok) {
                                    const cpData = await cpRes.json();
                                    if(cpData && !cpData.error && window.CPModule && window.CPModule.loadData) {
                                        window.CPModule.loadData(cpData);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading CPV:', e); }
                        };
                        window.openModularPopup('Navigation/Purchases/cash_payments.html', 'fa-money-bill-wave', 'Cash Payments', initCb, 'Cash Payments', true, true);
                    } else if (docType === 'JV') {
                        const initCb = async () => {
                            try {
                                if (window.GJVModule && window.GJVModule.init) await window.GJVModule.init();
                                const jvRes = await fetch(`api/general_journal_voucher.php?action=get&serial_no=${sn}&company_id=${companyId}`);
                                if(jvRes.ok) {
                                    const jvData = await jvRes.json();
                                    if(jvData && !jvData.error && window.GJVModule && window.GJVModule.loadData) {
                                        window.GJVModule.loadData(jvData);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading JV:', e); }
                        };
                        window.openModularPopup('Navigation/Adjustment/general_journal_voucher.html', 'fa-book', 'General Journal Voucher', initCb, 'General Journal Voucher', true, true);
                    }
                });

                tbody.appendChild(tr);
            });

            self.updateTotals(tPaid, tWht, tFlood, tSales, tAdv, tDisc);
            self.selectedIndex = -1;
            
            // Focus table container to allow arrow key navigation immediately
            document.getElementById('payr_table').parentElement.focus();

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:red; padding:20px;">Error loading data: ${e.message}</td></tr>`;
        }
    },

    handleKeyDown: function(e) {
        const self = window.PaymentsReportsModule;
        const tbody = document.getElementById('payr_tbody');
        if (!tbody || tbody.innerHTML === '' || tbody.children.length === 0) return;
        
        // Ensure we are in the module (rough check if it's visible)
        if (!document.getElementById('payr_table').offsetParent) return;
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
        const self = window.PaymentsReportsModule;
        const tbody = document.getElementById('payr_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            if (index === self.selectedIndex) {
                row.classList.add('selected');
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                row.classList.remove('selected');
            }
        });
    },

    updateTotals: function(paid=0, wht=0, flood=0, sales=0, adv=0, disc=0) {
        const self = window.PaymentsReportsModule;
        document.getElementById('payr_tot_paid').textContent = self.formatNumber(paid);
        document.getElementById('payr_tot_wht').textContent = self.formatNumber(wht);
        document.getElementById('payr_tot_flood').textContent = self.formatNumber(flood);
        document.getElementById('payr_tot_sales').textContent = self.formatNumber(sales);
        document.getElementById('payr_tot_adv').textContent = self.formatNumber(adv);
        document.getElementById('payr_tot_disc').textContent = self.formatNumber(disc);
    },

    exportExcel: function() {
        const self = window.PaymentsReportsModule;
        const tbody = document.getElementById('payr_tbody');
        if (!tbody || tbody.children.length === 0 || tbody.children[0].children.length === 1) {
            alert('No data to export.');
            return;
        }

        let csv = 'Date,Tran No.,Vendor,Cash / Bank,Cheque No.,Amount Paid,W.H.Tax,Flood Tax,Sales Tax,Advance Adj.,Discount\n';

        // Loop through data rows
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 12) return; // skip if not a data row
            
            // Grab text content from columns (skip first column if it's empty space or pointer)
            const date = (cells[1].innerText || '').replace(/,/g, '');
            const tranNo = (cells[2].innerText || '').replace(/,/g, ' ');
            const vendor = (cells[3].innerText || '').replace(/,/g, ' ');
            const cb = (cells[4].innerText || '').replace(/,/g, ' ');
            const chq = (cells[5].innerText || '').replace(/,/g, '');
            const aPaid = (cells[6].innerText || '').replace(/,/g, '');
            const wht = (cells[7].innerText || '').replace(/,/g, '');
            const fld = (cells[8].innerText || '').replace(/,/g, '');
            const stax = (cells[9].innerText || '').replace(/,/g, '');
            const adv = (cells[10].innerText || '').replace(/,/g, '');
            const disc = (cells[11].innerText || '').replace(/,/g, '');

            csv += `${date},${tranNo},${vendor},${cb},${chq},${aPaid},${wht},${fld},${stax},${adv},${disc}\n`;
        });

        // Append Totals row
        const tPaid = (document.getElementById('payr_tot_paid').innerText || '').replace(/,/g, '');
        const tWht = (document.getElementById('payr_tot_wht').innerText || '').replace(/,/g, '');
        const tFlood = (document.getElementById('payr_tot_flood').innerText || '').replace(/,/g, '');
        const tSales = (document.getElementById('payr_tot_sales').innerText || '').replace(/,/g, '');
        const tAdv = (document.getElementById('payr_tot_adv').innerText || '').replace(/,/g, '');
        const tDisc = (document.getElementById('payr_tot_disc').innerText || '').replace(/,/g, '');
        
        csv += `,,,,Totals,${tPaid},${tWht},${tFlood},${tSales},${tAdv},${tDisc}\n`;

        // Export logic
        const link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        link.target = '_blank';
        link.download = 'Payments_Report.csv';
        link.click();
    },

    printReport: async function() {
        const self = window.PaymentsReportsModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        const tbody = document.getElementById('payr_tbody');
        if (!tbody || tbody.children.length === 0 || tbody.children[0].children.length === 1) {
            alert('No data to print.');
            return;
        }

        // Clone the table
        const clone = document.getElementById('payr_table').cloneNode(true);
        
        // Clean up cloned table for print
        // 1. Remove the first column (pointer) from thead
        const theadTr = clone.querySelector('thead tr');
        if(theadTr && theadTr.children.length > 0) {
            theadTr.removeChild(theadTr.children[0]);
        }
        
        // 2. Remove the first column (pointer) from tbody
        const cloneTbody = clone.querySelector('tbody');
        Array.from(cloneTbody.children).forEach(tr => {
            if(tr.children.length > 0) tr.removeChild(tr.children[0]);
        });

        // 3. Remove inline widths and fix print styles
        if (clone.querySelector('thead')) clone.querySelector('thead').removeAttribute('style');
        clone.removeAttribute('class');
        clone.querySelectorAll('*').forEach(el => {
            if (el.style.width) el.style.width = ''; // Remove fixed inline widths
            if (el.tagName === 'TH' || el.tagName === 'TD') {
                el.style.border = '1px solid #000';
            }
        });

        // Add totals row
        const tRow = document.createElement('tr');
        tRow.style.fontWeight = 'bold';
        tRow.style.background = '#f0f0f0';
        tRow.innerHTML = `
            <td colspan="5" style="text-align:right; padding:4px; border: 1px solid #000;">Totals Rs.</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('payr_tot_paid').innerText}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('payr_tot_wht').innerText}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('payr_tot_flood').innerText}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('payr_tot_sales').innerText}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('payr_tot_adv').innerText}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${document.getElementById('payr_tot_disc').innerText}</td>
        `;
        cloneTbody.appendChild(tRow);

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
            <title>Payments Report</title>
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
                th, td { border: 1px solid #000; padding: 2px 4px; }
                th { background: #f0f0f0; font-weight: bold; }
                .payr-row-pointer { display: none !important; }
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
                    <div class="invoice-title">PAYMENTS REPORT</div>
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
    }
};

// Bind Keyboard Navigation for the table GLOBALLY just ONCE to avoid duplication across script reloads
if (!window._globalPayrKeydownBound) {
    document.addEventListener('keydown', function(e) {
        if (window.PaymentsReportsModule && typeof window.PaymentsReportsModule.handleKeyDown === 'function') {
            window.PaymentsReportsModule.handleKeyDown(e);
        }
    });
    window._globalPayrKeydownBound = true;
}
