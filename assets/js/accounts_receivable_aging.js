window.AccountsReceivableAgingModule = {
    reportData: [],
    selectedIndex: -1,
    customerData: [],

    init: async function() {
        const self = window.AccountsReceivableAgingModule;
        self.bindEvents();
        await self.fetchInitialData();
        self.setupSmartSearch();
        self.updateHeaders();
    },

    bindEvents: function() {
        const self = window.AccountsReceivableAgingModule;

        document.getElementById('ara_btn_display').onclick = self.fetchReport;
        
        document.getElementById('ara_btn_print').onclick = self.printReport;

        // customer mode radio
        document.getElementById('ara_all_customers').onchange = self.togglecustomerInputs;
        document.getElementById('ara_select_customer').onchange = self.togglecustomerInputs;

        // employee checkbox
        document.getElementById('ara_use_employee').onchange = function() {
            document.getElementById('ara_employee_id').disabled = !this.checked;
        };

        // Gap mode radio
        document.getElementById('ara_gap_10').onchange = () => { self.updateHeaders(); if(self.reportData.length) self.renderMainGrid(); };
        document.getElementById('ara_gap_30').onchange = () => { self.updateHeaders(); if(self.reportData.length) self.renderMainGrid(); };
        
        // Navigation
        document.addEventListener('keydown', self.handleKeydown);
    },

    togglecustomerInputs: function() {
        const disabled = document.getElementById('ara_all_customers').checked;
        const codeInput = document.getElementById('ara_customer_code');
        const nameInput = document.getElementById('ara_customer_name');
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
        const gapType = document.querySelector('input[name="ara_gap_mode"]:checked').value;
        if (gapType === "10") {
            document.getElementById('ara_th_gap1').innerText = "0-10 Days";
            document.getElementById('ara_th_gap2').innerText = "11-20 Days";
            document.getElementById('ara_th_gap3').innerText = "21-30 Days";
            document.getElementById('ara_th_gap4').innerText = "Above 30 Days";
        } else {
            document.getElementById('ara_th_gap1').innerText = "0-30 Days";
            document.getElementById('ara_th_gap2').innerText = "31-60 Days";
            document.getElementById('ara_th_gap3').innerText = "61-90 Days";
            document.getElementById('ara_th_gap4').innerText = "Above 90 Days";
        }
    },

    fetchInitialData: async function() {
        const self = window.AccountsReceivableAgingModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        // Fetch customers for smart search
        try {
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if(!data.error) self.customerData = data;
            }
        } catch (e) {
            console.error(e);
        }
        
        // Fetch employees
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (!data.error) {
                    const sel = document.getElementById('ara_employee_id');
                    data.forEach(emp => {
                        const opt = document.createElement('option');
                        opt.value = emp.id;
                        opt.text = emp.name;
                        sel.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    setupSmartSearch: function() {
        const self = window.AccountsReceivableAgingModule;

        function renderSugg(inputEl, suggestEl, data, field1, field2, onSelect) {
            inputEl.oninput = () => {
                const q = inputEl.value.toLowerCase();
                suggestEl.innerHTML = '';
                if (!q) { suggestEl.style.display = 'none'; return; }
                const matches = data.filter(d => 
                    (d[field1] && String(d[field1]).toLowerCase().includes(q)) || 
                    (d[field2] && String(d[field2]).toLowerCase().includes(q))
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

        const vc = document.getElementById('ara_customer_code');
        const vcs = document.getElementById('ara_customer_suggest_code');
        const vn = document.getElementById('ara_customer_name');
        const vns = document.getElementById('ara_customer_suggest_name');

        function setcustomer(m) {
            vc.value = m.code;
            vc.setAttribute('data-id', m.id);
            vn.value = m.name;
        }

        renderSugg(vc, vcs, self.customerData, 'code', 'name', setcustomer);
        renderSugg(vn, vns, self.customerData, 'name', 'code', setcustomer);
    },

    fetchReport: async function() {
        const self = window.AccountsReceivableAgingModule;
        
        let url = `api/accounts_receivable_aging.php?action=get_aging_data`;
        
        if (document.getElementById('ara_select_customer').checked) {
            const customerId = document.getElementById('ara_customer_code').getAttribute('data-id');
            if (!customerId) {
                alert("Please select a valid customer.");
                return;
            }
            url += `&customer_id=${customerId}`;
        }
        
        if (document.getElementById('ara_use_employee').checked) {
            const empId = document.getElementById('ara_employee_id').value;
            if (!empId) {
                alert("Please select an employee.");
                return;
            }
            url += `&employee_id=${empId}`;
        }
        
        const gapMode = document.querySelector('input[name="ara_gap_mode"]:checked').value;
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
        const self = window.AccountsReceivableAgingModule;
        const tbody = document.getElementById('ara_tbody');
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
            tr.tabIndex = 0;
            
            tr.onclick = () => {
                self.selectedIndex = idx;
                self.updateGridSelection();
            };

            tr.innerHTML = `
                <td style="width: 25px; border-right: 1px solid #e0e0e0; padding: 2px; text-align:center;"></td>
                <td style="width: 70px; border-right: 1px solid #e0e0e0; padding: 2px;">${row.customer_code || ''}</td>
                <td style="border-right: 1px solid #e0e0e0; padding: 2px;" title="${row.customer_name || ''}">${row.customer_name || ''}</td>
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

        document.getElementById('ara_tot_gap1').innerText = tGap1.toFixed(2);
        document.getElementById('ara_tot_gap2').innerText = tGap2.toFixed(2);
        document.getElementById('ara_tot_gap3').innerText = tGap3.toFixed(2);
        document.getElementById('ara_tot_gap4').innerText = tGap4.toFixed(2);
        document.getElementById('ara_tot_bal').innerText = tBal.toFixed(2);
    },

    updateGridSelection: function() {
        const self = window.AccountsReceivableAgingModule;
        const tbody = document.getElementById('ara_tbody');
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
        if (self.selectedIndex >= 0 && self.selectedIndex < rows.length) {
            rows[self.selectedIndex].focus();
        }
    },

    handleKeydown: function(e) {
        const self = window.AccountsReceivableAgingModule;
        if (!document.getElementById('ara_table_container')) return; // Module not active
        if (self.reportData.length === 0) return;

        if (e.key === 'ArrowDown' || e.key === 'Down') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            self.selectedIndex = Math.min(Number(self.selectedIndex) + 1, self.reportData.length - 1);
            self.updateGridSelection();
            self.scrollToSelection();
        } else if (e.key === 'ArrowUp' || e.key === 'Up') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            self.selectedIndex = Math.max(Number(self.selectedIndex) - 1, 0);
            self.updateGridSelection();
            self.scrollToSelection();
        }
    },

    scrollToSelection: function() {
        const self = window.AccountsReceivableAgingModule;
        const tbody = document.getElementById('ara_tbody');
        if (self.selectedIndex >= 0 && self.selectedIndex < tbody.children.length) {
            tbody.children[self.selectedIndex].scrollIntoView({block: 'nearest'});
        }
    },

    printReport: async function() {
        const self = window.AccountsReceivableAgingModule;
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

        const gapType = document.querySelector('input[name="ara_gap_mode"]:checked').value;
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
            <html>
            <head>
                <title>Accounts Receivable Aging</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
                    .hdr-left { width: 100px; text-align: left; }
                    .hdr-center { flex: 1; text-align: center; }
                    .hdr-right { width: 100px; text-align: right; }
                    .hdr h1 { margin: 0; font-size: 16px; }
                    .hdr h2 { margin: 4px 0 0; font-size: 13px; color: #555; }
                    @page { size: landscape; margin: 10mm; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #000; padding: 4px; text-align: center; white-space: nowrap; }
                    th { background-color: #f0f0f0; }
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
                        <h2>Accounts Receivable Aging</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Account Code</th>
                            <th class="text-left">customer</th>
                            <th>Invoice No.</th>
                            <th>Date</th>
                            <th>Days</th>
                            <th class="text-right">Invoice Amount</th>
                            <th class="text-right">${gap1Header}</th>
                            <th class="text-right">${gap2Header}</th>
                            <th class="text-right">${gap3Header}</th>
                            <th class="text-right">${gap4Header}</th>
                            <th class="text-right">Balance Amount</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let tGap1=0, tGap2=0, tGap3=0, tGap4=0, tBal=0;

        self.reportData.forEach(row => {
            html += `
                <tr>
                    <td>${row.customer_code || ''}</td>
                    <td class="text-left">${row.customer_name || ''}</td>
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
