window.AccountsPayableAgingModule = {
    reportData: [],
    selectedIndex: -1,
    vendorData: [],

    init: async function() {
        const self = window.AccountsPayableAgingModule;
        self.bindEvents();
        await self.fetchInitialData();
        self.setupSmartSearch();
        self.updateHeaders();
    },

    bindEvents: function() {
        const self = window.AccountsPayableAgingModule;

        document.getElementById('apa_btn_display').onclick = self.fetchReport;
        
        document.getElementById('apa_btn_print').onclick = self.printReport;

        // Vendor mode radio
        document.getElementById('apa_all_vendors').onchange = self.toggleVendorInputs;
        document.getElementById('apa_select_vendor').onchange = self.toggleVendorInputs;

        // Gap mode radio
        document.getElementById('apa_gap_10').onchange = () => { self.updateHeaders(); if(self.reportData.length) self.renderMainGrid(); };
        document.getElementById('apa_gap_30').onchange = () => { self.updateHeaders(); if(self.reportData.length) self.renderMainGrid(); };
        
        // Navigation is handled globally by app.js for all modal tables
    },

    toggleVendorInputs: function() {
        const disabled = document.getElementById('apa_all_vendors').checked;
        const codeInput = document.getElementById('apa_vendor_code');
        const nameInput = document.getElementById('apa_vendor_name');
        codeInput.disabled = disabled;
        nameInput.disabled = disabled;
        
        if(disabled) {
            codeInput.value = '';
            nameInput.value = '';
            codeInput.removeAttribute('data-id');
        } else {
            codeInput.focus();
        }
    },

    updateHeaders: function() {
        const gapType = document.querySelector('input[name="apa_gap_mode"]:checked').value;
        if (gapType === "10") {
            document.getElementById('apa_th_gap1').innerText = "0-10 Days";
            document.getElementById('apa_th_gap2').innerText = "11-20 Days";
            document.getElementById('apa_th_gap3').innerText = "21-30 Days";
            document.getElementById('apa_th_gap4').innerText = "Above 30 Days";
        } else {
            document.getElementById('apa_th_gap1').innerText = "0-30 Days";
            document.getElementById('apa_th_gap2').innerText = "31-60 Days";
            document.getElementById('apa_th_gap3').innerText = "61-90 Days";
            document.getElementById('apa_th_gap4').innerText = "Above 90 Days";
        }
    },

    fetchInitialData: async function() {
        const self = window.AccountsPayableAgingModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        // Fetch vendors for smart search
        try {
            const res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if(!data.error) self.vendorData = data;
            }
        } catch (e) {
            console.error(e);
        }
    },

    setupSmartSearch: function() {
        const self = window.AccountsPayableAgingModule;

        function renderSugg(inputEl, suggestEl, data, field1, field2, onSelect) {
            inputEl.oninput = () => {
                const q = inputEl.value.toLowerCase();
                suggestEl.innerHTML = '';
                if (!q) { suggestEl.style.display = 'none'; return; }
                const matches = data.filter(d => 
                    (d[field1] && d[field1].toLowerCase().includes(q)) || 
                    (d[field2] && d[field2].toLowerCase().includes(q))
                ).slice(0, 20);

                if (matches.length > 0) {
                    matches.forEach((m, idx) => {
                        const div = document.createElement('div');
                        div.innerText = `${m[field1]} - ${m[field2]}`;
                        div.dataset.index = idx;
                        div.onmousedown = () => {
                            onSelect(m);
                            suggestEl.style.display = 'none';
                        };
                        suggestEl.appendChild(div);
                    });
                    suggestEl.style.display = 'block';
                    suggestEl.dataset.activeIndex = -1;
                } else {
                    suggestEl.style.display = 'none';
                }
            };
            
            inputEl.onkeydown = (e) => {
                let items = suggestEl.querySelectorAll('div');
                let active = parseInt(suggestEl.dataset.activeIndex || -1);
                if (e.key === 'ArrowDown') {
                    active = (active + 1) % items.length;
                    suggestEl.dataset.activeIndex = active;
                    updateActiveSugg(items, active);
                    e.preventDefault();
                } else if (e.key === 'ArrowUp') {
                    active = (active - 1 + items.length) % items.length;
                    suggestEl.dataset.activeIndex = active;
                    updateActiveSugg(items, active);
                    e.preventDefault();
                } else if (e.key === 'Enter' && active > -1) {
                    items[active].onmousedown();
                    e.preventDefault();
                }
            };
            
            inputEl.onblur = () => { setTimeout(() => suggestEl.style.display = 'none', 150); };
            
            function updateActiveSugg(items, index) {
                items.forEach((item, i) => {
                    item.classList.toggle('active', i === index);
                    if (i === index) item.scrollIntoView({block: 'nearest'});
                });
            }
        }

        const vc = document.getElementById('apa_vendor_code');
        const vcs = document.getElementById('apa_vendor_suggest_code');
        const vn = document.getElementById('apa_vendor_name');
        const vns = document.getElementById('apa_vendor_suggest_name');

        function setVendor(m) {
            vc.value = m.code;
            vc.setAttribute('data-id', m.id);
            vn.value = m.name;
        }

        renderSugg(vc, vcs, self.vendorData, 'code', 'name', setVendor);
        renderSugg(vn, vns, self.vendorData, 'name', 'code', setVendor);
    },

    fetchReport: async function() {
        const self = window.AccountsPayableAgingModule;
        
        let url = `api/accounts_payable_aging.php?action=get_aging_data`;
        
        if (document.getElementById('apa_select_vendor').checked) {
            const vendorId = document.getElementById('apa_vendor_code').getAttribute('data-id');
            if (!vendorId) {
                alert("Please select a valid vendor.");
                return;
            }
            url += `&vendor_id=${vendorId}`;
        }
        
        const gapMode = document.querySelector('input[name="apa_gap_mode"]:checked').value;
        url += `&gap_mode=${gapMode}`;

        try {
            const res = await fetch(url);
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
        const self = window.AccountsPayableAgingModule;
        const tbody = document.getElementById('apa_tbody');
        tbody.innerHTML = '';
        
        let tGap1=0, tGap2=0, tGap3=0, tGap4=0, tBal=0;

        const formatDate = (dStr) => {
            if (!dStr) return '';
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString('en-GB').replace(/\//g, '-');
        };

        self.reportData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            
            tr.onclick = () => {
                self.selectedIndex = idx;
                self.updateGridSelection();
            };

            tr.innerHTML = `
                <td style="width: 25px; border-right: 1px solid #e0e0e0; padding: 2px; text-align:center;"></td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px;">${row.vendor_code || ''}</td>
                <td style="border-right: 1px solid #e0e0e0; padding: 2px;" title="${row.vendor_name || ''}">${row.vendor_name || ''}</td>
                <td style="width: 60px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${row.invoice_no || ''}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${formatDate(row.invoice_date)}</td>
                <td style="width: 40px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: center;">${row.days}</td>
                <td style="width: 80px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${parseFloat(row.invoice_amount||0).toFixed(2)}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${row.gap1 > 0 ? parseFloat(row.gap1).toFixed(2) : ''}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${row.gap2 > 0 ? parseFloat(row.gap2).toFixed(2) : ''}</td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${row.gap3 > 0 ? parseFloat(row.gap3).toFixed(2) : ''}</td>
                <td style="width: 80px; border-right: 1px solid #e0e0e0; padding: 2px; text-align: right;">${row.gap4 > 0 ? parseFloat(row.gap4).toFixed(2) : ''}</td>
                <td style="width: 80px; padding: 2px; text-align: right;">${parseFloat(row.balance_amt||0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);

            tGap1 += parseFloat(row.gap1 || 0);
            tGap2 += parseFloat(row.gap2 || 0);
            tGap3 += parseFloat(row.gap3 || 0);
            tGap4 += parseFloat(row.gap4 || 0);
            tBal  += parseFloat(row.balance_amt || 0);
        });

        document.getElementById('apa_tot_gap1').innerText = tGap1.toFixed(2);
        document.getElementById('apa_tot_gap2').innerText = tGap2.toFixed(2);
        document.getElementById('apa_tot_gap3').innerText = tGap3.toFixed(2);
        document.getElementById('apa_tot_gap4').innerText = tGap4.toFixed(2);
        document.getElementById('apa_tot_bal').innerText = tBal.toFixed(2);
    },

    updateGridSelection: function() {
        const self = window.AccountsPayableAgingModule;
        const tbody = document.getElementById('apa_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((r, idx) => {
            if (idx === self.selectedIndex) {
                r.classList.add('selected');
                r.cells[0].innerHTML = '<div class="apa-row-pointer"></div>';
            } else {
                r.classList.remove('selected');
                r.cells[0].innerHTML = '';
            }
        });
    },

    printReport: async function() {
        const self = window.AccountsPayableAgingModule;
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
        } catch(e) { console.error('Could not fetch company info for print:', e); }

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

        const gapType = document.querySelector('input[name="apa_gap_mode"]:checked').value;
        const gap1Header = gapType === "10" ? "0-10 Days" : "0-30 Days";
        const gap2Header = gapType === "10" ? "11-20 Days" : "31-60 Days";
        const gap3Header = gapType === "10" ? "21-30 Days" : "61-90 Days";
        const gap4Header = gapType === "10" ? "Above 30 Days" : "Above 90 Days";

        const formatDate = (dStr) => {
            if (!dStr) return '';
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString('en-GB').replace(/\//g, '-');
        };

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Accounts Payables Aging</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                <style>
                    @page { size: A4 portrait; margin: 0; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.4; margin-top: 2mm; margin-bottom: 5mm; margin-left: 5mm; margin-right: 5mm; padding: 5px; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    
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

                    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; table-layout: auto; }
                    th { border: 1px solid #333; background: #f1f5f9; padding: 6px 4px; text-align: center; font-size: 11px; }
                    td { padding: 5px; border: 1px solid #333; }
                    
                    .text-left { text-align: left; }
                    .text-right { text-align: right; }
                    .tot-row td { font-weight: bold; background-color: #f1f5f9; border-top: 2px solid #333; }
                </style>
            </head>
            <body>
                <div class="header-area">
                    <div class="logo-box">
                        ${logoImg}
                    </div>
                    <div class="company-info">
                        <div class="company-name">${companyName}</div>
                        <div class="company-contacts">
                            <div class="contact-row">
                                <span><i class="fas fa-map-marker-alt"></i> ${companyInfo.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar'}</span>
                            </div>
                            <div class="contact-row">
                                <span><i class="fas fa-phone-alt"></i> ${companyInfo.phone || '+92 348 7240256'}</span>
                                <span><i class="fas fa-envelope"></i> ${companyInfo.email || 'info@seastonepipes.com'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="invoice-badge-area">
                        <div class="invoice-title">ACCOUNTS PAYABLE AGING</div>
                        <div class="invoice-type-badge">REPORT</div>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th style="width: 7%;">Account Code</th>
                            <th class="text-left" style="width: 26%;">Vendor</th>
                            <th style="width: 6%;">Invoice No.</th>
                            <th style="width: 7%;">Date</th>
                            <th style="width: 4%;">Days</th>
                            <th class="text-right" style="width: 8%;">Invoice Amount</th>
                            <th class="text-right" style="width: 8%;">${gap1Header}</th>
                            <th class="text-right" style="width: 8%;">${gap2Header}</th>
                            <th class="text-right" style="width: 8%;">${gap3Header}</th>
                            <th class="text-right" style="width: 9%;">${gap4Header}</th>
                            <th class="text-right" style="width: 9%;">Balance Amount</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let tGap1=0, tGap2=0, tGap3=0, tGap4=0, tBal=0;

        self.reportData.forEach(row => {
            html += `
                <tr>
                    <td>${row.vendor_code || ''}</td>
                    <td class="text-left">${row.vendor_name || ''}</td>
                    <td>${row.invoice_no || ''}</td>
                    <td>${formatDate(row.invoice_date)}</td>
                    <td>${row.days}</td>
                    <td class="text-right">${parseFloat(row.invoice_amount||0).toFixed(2)}</td>
                    <td class="text-right">${row.gap1 > 0 ? parseFloat(row.gap1).toFixed(2) : ''}</td>
                    <td class="text-right">${row.gap2 > 0 ? parseFloat(row.gap2).toFixed(2) : ''}</td>
                    <td class="text-right">${row.gap3 > 0 ? parseFloat(row.gap3).toFixed(2) : ''}</td>
                    <td class="text-right">${row.gap4 > 0 ? parseFloat(row.gap4).toFixed(2) : ''}</td>
                    <td class="text-right">${parseFloat(row.balance_amt||0).toFixed(2)}</td>
                </tr>
            `;
            tGap1 += parseFloat(row.gap1 || 0);
            tGap2 += parseFloat(row.gap2 || 0);
            tGap3 += parseFloat(row.gap3 || 0);
            tGap4 += parseFloat(row.gap4 || 0);
            tBal  += parseFloat(row.balance_amt || 0);
        });

        html += `
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="6" class="text-right">Totals Rs.</td>
                            <td class="text-right">${tGap1.toFixed(2)}</td>
                            <td class="text-right">${tGap2.toFixed(2)}</td>
                            <td class="text-right">${tGap3.toFixed(2)}</td>
                            <td class="text-right">${tGap4.toFixed(2)}</td>
                            <td class="text-right">${tBal.toFixed(2)}</td>
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
    }
};
