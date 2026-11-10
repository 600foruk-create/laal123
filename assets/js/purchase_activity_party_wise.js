window.PurchaseActivityPartyWiseModule = {
    allVendors: [],
    mainData: [],
    selectedIndex: -1,

    init: function() {
        const self = window.PurchaseActivityPartyWiseModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        // Reset state
        self.selectedIndex = -1;
        self.mainData = [];
        document.getElementById('papw_tbody').innerHTML = '';

        // Bind Checkboxes
        document.getElementById('papw_use_vendor_type').addEventListener('change', function() {
            document.getElementById('papw_vendor_type').disabled = !this.checked;
        });
        document.getElementById('papw_use_vendor').addEventListener('change', function() {
            document.getElementById('papw_vendor_code').disabled = !this.checked;
            document.getElementById('papw_vendor_name').disabled = !this.checked;
            if(!this.checked) {
                document.getElementById('papw_vendor_code').value = '';
                document.getElementById('papw_vendor_name').value = '';
            }
        });
        document.getElementById('papw_use_employee').addEventListener('change', function() {
            document.getElementById('papw_employee').disabled = !this.checked;
        });
        document.getElementById('papw_use_date').addEventListener('change', function() {
            document.getElementById('papw_date_from').disabled = !this.checked;
            document.getElementById('papw_date_to').disabled = !this.checked;
        });

        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('papw_date_from').value = today;
        document.getElementById('papw_date_to').value = today;

        // Load Vendor Types
        fetch(`api/party_purchase_summary.php?action=get_vendor_categories&company_id=${companyId}`)
            .then(r => r.json())
            .then(data => {
                const sel = document.getElementById('papw_vendor_type');
                sel.innerHTML = '<option value="all">All</option>';
                data.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
            }).catch(e => console.error(e));

        // Load Employees
        fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`)
            .then(r => r.json())
            .then(data => {
                const sel = document.getElementById('papw_employee');
                sel.innerHTML = '<option value="">Select Employee...</option>';
                if(!data.error) {
                    data.forEach(e => sel.innerHTML += `<option value="${e.id}">${e.name}</option>`);
                }
            }).catch(e => console.error(e));

        // Load Vendors for Typeahead
        fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`)
            .then(r => r.json())
            .then(data => { if(!data.error) self.allVendors = data; })
            .catch(e => console.error(e));

        self.setupSmartSearch();

        document.getElementById('papw_btn_display').addEventListener('click', () => {
            console.log("Display button clicked!");
            self.fetchData().catch(e => {
                console.error("fetchData threw an error:", e);
                alert("Error in JS: " + e.message);
            });
        });
        document.getElementById('papw_btn_print').addEventListener('click', () => self.printReport());
        
        // Remove old event listener to prevent duplicates if init called again
        document.removeEventListener('keydown', self.handleKeyDown);
        document.addEventListener('keydown', self.handleKeyDown);
    },

    setupSmartSearch: function() {
        const self = window.PurchaseActivityPartyWiseModule;
        const codeInput = document.getElementById('papw_vendor_code');
        const nameInput = document.getElementById('papw_vendor_name');
        const suggest = document.getElementById('papw_vendor_suggest');
        const hiddenInput = document.getElementById('papw_vendor_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const dataSource = self.allVendors || [];
            
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
                    <div class="ps-suggest-item" style="padding: 2px 5px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.PurchaseActivityPartyWiseModule.selectSuggestion(${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
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
            const items = suggest.querySelectorAll('.ps-suggest-item');
            if (suggest.style.display === 'block' && items.length > 0) {
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

        codeInput.addEventListener('input', onInput);
        nameInput.addEventListener('input', onInput);
        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);

        codeInput.addEventListener('focus', function() { this.select(); });
        nameInput.addEventListener('focus', function() { this.select(); });

        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
            }
        });
    },

    selectSuggestion: function(id, code, name) {
        document.getElementById('papw_vendor_id').value = id;
        document.getElementById('papw_vendor_code').dataset.id = id;
        document.getElementById('papw_vendor_code').value = code;
        document.getElementById('papw_vendor_name').value = name;
        document.getElementById('papw_vendor_suggest').style.display = 'none';
    },

    fetchData: async function() {
        const self = window.PurchaseActivityPartyWiseModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        let url = `api/purchase_activity_party_wise.php?action=get_report_data&company_id=${companyId}`;

        if (document.getElementById('papw_use_vendor_type').checked) {
            url += `&vendor_type_id=${document.getElementById('papw_vendor_type').value}`;
        }
        if (document.getElementById('papw_use_vendor').checked) {
            const vId = document.getElementById('papw_vendor_code').dataset.id;
            if (vId) url += `&vendor_id=${vId}`;
        }
        if (document.getElementById('papw_use_employee').checked) {
            url += `&employee_id=${document.getElementById('papw_employee').value}`;
        }
        if (document.getElementById('papw_use_date').checked) {
            url += `&date_from=${document.getElementById('papw_date_from').value}`;
            url += `&date_to=${document.getElementById('papw_date_to').value}`;
        }

        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.error) {
                    console.error("API Error:", data.error);
                    alert("Backend Error: " + data.error);
                    self.mainData = [];
                } else {
                    self.mainData = Array.isArray(data) ? data : [];
                }
                self.selectedIndex = -1;
                self.renderMainGrid();
            }
        } catch (e) {
            console.error("Fetch Error:", e);
        }
    },

    renderMainGrid: function() {
        const self = window.PurchaseActivityPartyWiseModule;
        const tbody = document.getElementById('papw_tbody');
        tbody.innerHTML = '';
        
        let totPur = 0, totPaid = 0, totRet = 0, totWht = 0, totFlood = 0, totSales = 0, totAdv = 0, totDisc = 0, totRealized = 0, totBal = 0;

        self.mainData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.onclick = () => self.selectRow(idx);
            
            tr.innerHTML = `
                <td style="text-align: center; border: 1px solid #999;"><span class="par-row-pointer"></span></td>
                <td style="text-align: left; padding-left: 5px;">${row.vendor_name || ''}</td>
                <td style="text-align: left; padding-left: 5px;">${row.employee_name || ''}</td>
                <td style="text-align: right;">${parseFloat(row.total_purchase).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.amt_paid).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.pur_returns).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.wh_tax).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.flood_tax).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.sales_tax).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.adv_adj).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.discount).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.total_realized).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.balance_amt).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);

            totPur += parseFloat(row.total_purchase);
            totPaid += parseFloat(row.amt_paid);
            totRet += parseFloat(row.pur_returns);
            totWht += parseFloat(row.wh_tax);
            totFlood += parseFloat(row.flood_tax);
            totSales += parseFloat(row.sales_tax);
            totAdv += parseFloat(row.adv_adj);
            totDisc += parseFloat(row.discount);
            totRealized += parseFloat(row.total_realized);
            totBal += parseFloat(row.balance_amt);
        });

        document.getElementById('papw_tot_pur').textContent = totPur.toFixed(2);
        document.getElementById('papw_tot_paid').textContent = totPaid.toFixed(2);
        document.getElementById('papw_tot_ret').textContent = totRet.toFixed(2);
        document.getElementById('papw_tot_wht').textContent = totWht.toFixed(2);
        document.getElementById('papw_tot_flood').textContent = totFlood.toFixed(2);
        document.getElementById('papw_tot_sales').textContent = totSales.toFixed(2);
        document.getElementById('papw_tot_adv').textContent = totAdv.toFixed(2);
        document.getElementById('papw_tot_disc').textContent = totDisc.toFixed(2);
        document.getElementById('papw_tot_realized').textContent = totRealized.toFixed(2);
        document.getElementById('papw_tot_bal').textContent = totBal.toFixed(2);
        
        self.updateRowHighlight();
    },

    selectRow: function(idx) {
        this.selectedIndex = idx;
        this.updateRowHighlight();
    },
    
    updateRowHighlight: function() {
        const tbody = document.getElementById('papw_tbody');
        Array.from(tbody.children).forEach((r, idx) => {
            if (idx === this.selectedIndex) {
                r.classList.add('selected');
            } else {
                r.classList.remove('selected');
            }
        });
    },

    handleKeyDown: function(e) {
        const self = window.PurchaseActivityPartyWiseModule;
        if(self.mainData.length === 0) return;
        
        // Only fire if THIS module's table is visible (not another module)
        const tbl = document.getElementById('papw_table');
        if (!tbl || !tbl.offsetParent) return;

        // Only handle if not typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        if (e.key === 'ArrowDown' && self.selectedIndex === -1) {
            e.preventDefault();
            self.selectedIndex = 0;
            self.updateRowHighlight();
        }
    },

    printReport: async function() {
        const self = window.PurchaseActivityPartyWiseModule;
        if (!self.mainData || self.mainData.length === 0) {
            alert("No data to print.");
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
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

        let filtersHtml = "";
        if (document.getElementById('papw_use_vendor').checked) {
            filtersHtml += `Vendor: ${document.getElementById('papw_vendor_name').value} | `;
        }
        if (document.getElementById('papw_use_date').checked) {
            filtersHtml += `Period: ${document.getElementById('papw_date_from').value} To ${document.getElementById('papw_date_to').value}`;
        }

        const tableClone = document.getElementById('papw_table').cloneNode(true);
        
        // Clean up cloned table for print
        // 1. Header has spacer at the end
        const theadTr = tableClone.querySelector('thead tr');
        if (theadTr && theadTr.children.length > 0) {
            theadTr.removeChild(theadTr.children[0]); // Pointer column
            if (theadTr.lastElementChild && theadTr.lastElementChild.innerHTML.trim() === '') {
                theadTr.removeChild(theadTr.lastElementChild); // Spacer column
            }
        }
        
        // 2. Body only has pointer column (no spacer at end)
        tableClone.querySelectorAll('tbody tr').forEach(tr => {
            if(tr.children.length > 0) tr.removeChild(tr.children[0]);
        });

        // 3. Remove inline widths and fix borders for print
        if (tableClone.querySelector('thead')) tableClone.querySelector('thead').removeAttribute('style');
        tableClone.removeAttribute('class');
        tableClone.querySelectorAll('*').forEach(el => {
            if (el.style.width) el.style.width = '';
            if (el.tagName === 'TH' || el.tagName === 'TD') {
                el.style.border = '1px solid #000';
            }
        });

        const cloneTbody = tableClone.querySelector('tbody');
        
        const totPur = document.getElementById('papw_tot_pur').textContent;
        const totPaid = document.getElementById('papw_tot_paid').textContent;
        const totRet = document.getElementById('papw_tot_ret').textContent;
        const totWht = document.getElementById('papw_tot_wht').textContent;
        const totFlood = document.getElementById('papw_tot_flood').textContent;
        const totSales = document.getElementById('papw_tot_sales').textContent;
        const totAdv = document.getElementById('papw_tot_adv').textContent;
        const totDisc = document.getElementById('papw_tot_disc').textContent;
        const totRealized = document.getElementById('papw_tot_realized').textContent;
        const totBal = document.getElementById('papw_tot_bal').textContent;

        const tRow = document.createElement('tr');
        tRow.style.fontWeight = 'bold';
        tRow.style.background = '#c0c0c0';
        tRow.innerHTML = `
            <td colspan="2" style="text-align:right; padding:4px; border: 1px solid #000; font-style: italic;">Totals Rs.</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totPur}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totPaid}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totRet}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totWht}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totFlood}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totSales}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totAdv}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totDisc}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totRealized}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000; background: #fff;">${totBal}</td>
        `;
        cloneTbody.appendChild(tRow);

        const printContent = `<!DOCTYPE html>
        <html>
        <head>
            <title>Purchase Activity Report - Party Wise</title>
            <base href="${baseUrl}">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
            <style>
                @page { margin: 0; size: A4 landscape; }
                body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #000; margin: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .page-container { padding: 0; position: relative; box-sizing: border-box; }
                .header-area { display: flex; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 8px; margin-bottom: 12px; }
                .logo-box { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
                .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .company-info { flex: 1; padding-left: 15px; display: flex; flex-direction: column; justify-content: center; }
                .company-name { color: #1F4E79; font-size: 18px; font-weight: bold; margin: 0 0 8px 0; text-transform: uppercase; }
                .company-contacts { font-size: 9px; line-height: 1.6; }
                .company-contacts i { color: #1F4E79; width: 12px; text-align: center; margin-right: 3px; }
                .contact-row { display: flex; align-items: center; gap: 15px; margin-bottom: 3px; }
                .invoice-badge-area { text-align: right; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
                .invoice-title { color: #1F4E79; font-size: 12px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; text-align: right; }
                table { width: 100%; border-collapse: collapse; font-size: 9px; }
                th, td { border: 1px solid #000; padding: 2px 3px; }
                th { background: #f0f0f0; font-weight: bold; }
                .par-row-pointer { display: none !important; }
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
                        <div class="contact-row"><span><i class="fas fa-map-marker-alt"></i> ${companyInfo.address || ''}</span></div>
                        <div class="contact-row">
                            <span><i class="fas fa-phone-alt"></i> ${companyInfo.phone || ''}</span>
                            <span><i class="fas fa-envelope"></i> ${companyInfo.email || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="invoice-badge-area">
                    <div class="invoice-title">Purchase Activity Report - Party Wise</div>
                </div>
            </div>

            ${filtersHtml ? `<div style="margin-bottom:10px; font-weight:bold; font-size:10px; color:#333;">${filtersHtml}</div>` : ''}

            ${tableClone.outerHTML}
            
            <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                <span>Printed by: ${session.user_name || 'Admin'}</span>
                <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
            </div>
        </div>
        <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
        </html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
    }
};
