window.RecoveryReceiptsReport = {
    companyId: window.selectedCompanyId || (JSON.parse(localStorage.getItem('softifyx_session') || '{}')).company_id || 1,
    isInitialized: false,
    reportData: [],
    customers: [],

    init: function() {
        if (this.isInitialized) return;
        this.bindEvents();
        this.loadDropdowns();
        this.setupCustomerSuggest();
        
        // Initialize dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('rrr_date_from').value = today;
        document.getElementById('rrr_date_to').value = today;
        
        this.isInitialized = true;
    },

    bindEvents: function() {
        // Toggle checkboxes
        document.getElementById('rrr_use_cust_type').addEventListener('change', e => {
            document.getElementById('rrr_cust_type').disabled = !e.target.checked;
        });
        document.getElementById('rrr_use_customer').addEventListener('change', e => {
            const codeInput = document.getElementById('rrr_customer_code');
            const nameInput = document.getElementById('rrr_customer_name');
            codeInput.disabled = !e.target.checked;
            nameInput.disabled = !e.target.checked;
            if (!e.target.checked) {
                codeInput.value = '';
                nameInput.value = '';
                document.getElementById('rrr_customer_id').value = '';
            }
        });
        document.getElementById('rrr_use_main_region').addEventListener('change', e => {
            document.getElementById('rrr_main_region').disabled = !e.target.checked;
        });
        document.getElementById('rrr_use_sub_region').addEventListener('change', e => {
            document.getElementById('rrr_sub_region').disabled = !e.target.checked;
        });
        document.getElementById('rrr_use_emp').addEventListener('change', e => {
            document.getElementById('rrr_emp').disabled = !e.target.checked;
        });
        document.getElementById('rrr_use_date').addEventListener('change', e => {
            document.getElementById('rrr_date_from').disabled = !e.target.checked;
            document.getElementById('rrr_date_to').disabled = !e.target.checked;
        });

        // Main region change updates sub region
        document.getElementById('rrr_main_region').addEventListener('change', e => {
            this.loadSubRegions(e.target.value);
        });

        // Action buttons
        document.getElementById('rrr_btn_display').addEventListener('click', () => this.fetchReport());
        document.getElementById('rrr_btn_print').addEventListener('click', () => this.printReport());
        document.getElementById('rrr_btn_excel').addEventListener('click', () => this.exportExcel());
    },

    async loadDropdowns() {
        // Load customers for local search
        try {
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${this.companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    this.customers = data;
                }
            }
        } catch (e) {
            console.error('Error fetching customers:', e);
        }

        const loadOptions = async (url, elId, defaultText) => {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const d = await r.json();
                    this.populateSelect(elId, d, defaultText);
                }
            } catch(e) {
                console.error('Error loading options for ' + elId, e);
            }
        };

        await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${this.companyId}`, 'rrr_cust_type', 'Select Customer Type...');
        await loadOptions(`api/maintain.php?action=get_regions&company_id=${this.companyId}`, 'rrr_main_region', 'Select Main Region...');
        await loadOptions(`api/maintain.php?action=get_employees&company_id=${this.companyId}`, 'rrr_emp', 'Select Employee...');
    },

    async loadSubRegions(regionId) {
        const srSelect = document.getElementById('rrr_sub_region');
        srSelect.innerHTML = '<option value="">Select Sub Region...</option>';
        if (!regionId) return;
        
        try {
            const resp = await fetch(`api/maintain.php?action=get_sub_regions&region_id=${regionId}`);
            if (!resp.ok) return;
            const data = await resp.json();
            this.populateSelect('rrr_sub_region', data, 'Select Sub Region...');
        } catch (err) {
            console.error("Failed to load sub regions:", err);
        }
    },

    populateSelect(elementId, items, defaultText) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = `<option value="">${defaultText}</option>`;
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name || item.code || item.description || item.sub_id;
            el.appendChild(opt);
        });
    },

    setupCustomerSuggest() {
        const codeInput = document.getElementById('rrr_customer_code');
        const nameInput = document.getElementById('rrr_customer_name');
        const suggest = document.getElementById('rrr_customer_suggest');
        const hiddenInput = document.getElementById('rrr_customer_id');
        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const filtered = this.customers.filter(item => {
                const code = String(item.code || '').toLowerCase();
                const name = String(item.name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 50);

            if (filtered.length > 0) {
                suggest.innerHTML = '';
                filtered.forEach((cust, idx) => {
                    const div = document.createElement('div');
                    div.textContent = `${cust.code} - ${cust.name}`;
                    div.dataset.index = idx;
                    div.addEventListener('click', () => {
                        codeInput.value = cust.code;
                        nameInput.value = cust.name;
                        hiddenInput.value = cust.id;
                        suggest.style.display = 'none';
                    });
                    suggest.appendChild(div);
                });
                suggest.style.display = 'block';
                suggestIndex = -1;
            } else {
                suggest.style.display = 'none';
            }
        };

        if(codeInput) {
            codeInput.addEventListener('input', (e) => handleSearch(e.target.value));
            codeInput.addEventListener('keydown', (e) => handleKeydown(e, suggest, codeInput, nameInput, hiddenInput));
        }
        if(nameInput) {
            nameInput.addEventListener('input', (e) => handleSearch(e.target.value));
            nameInput.addEventListener('keydown', (e) => handleKeydown(e, suggest, codeInput, nameInput, hiddenInput));
        }

        const handleKeydown = (e, suggestBox, cIn, nIn, hIn) => {
            if (suggestBox.style.display !== 'block') return;
            const items = suggestBox.querySelectorAll('div');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                suggestIndex = (suggestIndex + 1) % items.length;
                updateSuggestHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                suggestIndex = (suggestIndex - 1 + items.length) % items.length;
                updateSuggestHighlight(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestIndex >= 0 && suggestIndex < items.length) {
                    items[suggestIndex].click();
                }
            }
        };

        const updateSuggestHighlight = (items) => {
            items.forEach((item, idx) => {
                if (idx === suggestIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        };

        document.addEventListener('click', (e) => {
            if (e.target !== codeInput && e.target !== nameInput && e.target !== suggest) {
                suggest.style.display = 'none';
            }
        });
    },

    async fetchReport() {
        let url = `api/recovery_receipts_report.php?action=get_data&company_id=${this.companyId}`;
        
        if (document.getElementById('rrr_use_cust_type').checked) {
            url += `&customer_type_id=${document.getElementById('rrr_cust_type').value}`;
        }
        if (document.getElementById('rrr_use_customer').checked) {
            const custId = document.getElementById('rrr_customer_id').value;
            if (!custId) { alert("Please select a valid customer."); return; }
            url += `&customer_id=${custId}`;
        }
        if (document.getElementById('rrr_use_main_region').checked) {
            url += `&region_id=${document.getElementById('rrr_main_region').value}`;
        }
        if (document.getElementById('rrr_use_sub_region').checked) {
            url += `&sub_region_id=${document.getElementById('rrr_sub_region').value}`;
        }
        if (document.getElementById('rrr_use_emp').checked) {
            url += `&employee_id=${document.getElementById('rrr_emp').value}`;
        }
        if (document.getElementById('rrr_use_date').checked) {
            url += `&date_from=${document.getElementById('rrr_date_from').value}`;
            url += `&date_to=${document.getElementById('rrr_date_to').value}`;
        }

        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("API failed");
            this.reportData = await resp.json();
            this.renderTable();
        } catch (err) {
            console.error("Fetch report error:", err);
            alert("Error fetching report data");
        }
    },

    renderTable() {
        const tbody = document.getElementById('rrr_tbody');
        tbody.innerHTML = '';
        
        let t_received = 0, t_wht = 0, t_flood = 0, t_stax = 0, t_adv = 0, t_disc = 0;

        this.reportData.forEach((row, idx) => {
            t_received += parseFloat(row.received_amount) || 0;
            t_wht += parseFloat(row.wht_amount) || 0;
            t_flood += parseFloat(row.flood_tax) || 0;
            t_stax += parseFloat(row.gst_amount) || 0;
            t_adv += parseFloat(row.advance_adjusted) || 0;
            t_disc += parseFloat(row.discount_given) || 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center;"><div class="sr-row-pointer"></div></td>
                <td style="text-align:center;">${row.formatted_date || ''}</td>
                <td style="text-align:center;">${row.tran_no || ''}</td>
                <td>${row.customer_name || ''}</td>
                <td>${row.cash_bank || ''}</td>
                <td style="text-align:center;">${row.cheque_no || ''}</td>
                <td style="text-align:right;">${this.formatNumber(row.received_amount)}</td>
                <td style="text-align:right;">${this.formatNumber(row.wht_amount)}</td>
                <td style="text-align:right;">${this.formatNumber(row.flood_tax)}</td>
                <td style="text-align:right;">${this.formatNumber(row.gst_amount)}</td>
                <td style="text-align:right;">${this.formatNumber(row.advance_adjusted)}</td>
                <td style="text-align:right;">${this.formatNumber(row.discount_given)}</td>
            `;

            tr.addEventListener('click', () => {
                Array.from(tbody.querySelectorAll('tr')).forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
            });

            tr.addEventListener('dblclick', () => {
                this.drillDown(row);
            });

            tbody.appendChild(tr);
        });

        // Totals
        document.getElementById('rrr_tot_received').textContent = this.formatNumber(t_received);
        document.getElementById('rrr_tot_wht').textContent = this.formatNumber(t_wht);
        document.getElementById('rrr_tot_flood').textContent = this.formatNumber(t_flood);
        document.getElementById('rrr_tot_stax').textContent = this.formatNumber(t_stax);
        document.getElementById('rrr_tot_adv').textContent = this.formatNumber(t_adv);
        document.getElementById('rrr_tot_disc').textContent = this.formatNumber(t_disc);
    },

    formatNumber(num) {
        if (!num) return '0.00';
        return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    async drillDown(row) {
        if (!row.tran_no) return;
        const parts = row.tran_no.split(' ');
        if (parts.length < 2) return;
        
        const type = parts[0]; // CRV or BRV
        const serialNo = parts[1];
        
        if (type === 'CRV') {
            window.openModularPopup('Navigation/Sales/cash_receipts.html', 'fa-file-invoice-dollar', 'Cash Receipt', async () => {
                try {
                    if (window.CRModule && window.CRModule.init) await window.CRModule.init();
                    fetch(`api/cash_receipts.php?action=get&serial_no=${serialNo}&company_id=${this.companyId}`)
                        .then(r => r.json())
                        .then(d => { if(d && d.id && window.CRModule) window.CRModule.loadData(d); });
                } catch(e) {
                    console.error("Drilldown error:", e);
                }
            }, 'Cash Receipts', true, true);
        } else if (type === 'BRV') {
            window.openModularPopup('Navigation/Sales/bank_receipts.html', 'fa-file-invoice-dollar', 'Bank Receipt', async () => {
                try {
                    if (window.BRModule && window.BRModule.init) await window.BRModule.init();
                    fetch(`api/bank_receipts.php?action=get&serial_no=${serialNo}&company_id=${this.companyId}`)
                        .then(r => r.json())
                        .then(d => { if(d && d.id && window.BRModule) window.BRModule.loadData(d); });
                } catch(e) {
                    console.error("Drilldown error:", e);
                }
            }, 'Bank Receipts', true, true);
        }
    },

    async printReport() {
        if (!this.reportData || this.reportData.length === 0) {
            alert("No data to print!");
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
        } catch(e) { }

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
        
        let t_received = 0, t_wht = 0, t_flood = 0, t_stax = 0, t_adv = 0, t_disc = 0;
        
        let rows = '';
        this.reportData.forEach(row => {
            t_received += parseFloat(row.received_amount) || 0;
            t_wht += parseFloat(row.wht_amount) || 0;
            t_flood += parseFloat(row.flood_tax) || 0;
            t_stax += parseFloat(row.gst_amount) || 0;
            t_adv += parseFloat(row.advance_adjusted) || 0;
            t_disc += parseFloat(row.discount_given) || 0;

            rows += `
                <tr>
                    <td style="text-align:center;">${row.formatted_date || ''}</td>
                    <td style="text-align:center;">${row.tran_no || ''}</td>
                    <td class="text-left">${row.customer_name || ''}</td>
                    <td class="text-left">${row.cash_bank || ''}</td>
                    <td style="text-align:center;">${row.cheque_no || ''}</td>
                    <td style="text-align:right;">${this.formatNumber(row.received_amount)}</td>
                    <td style="text-align:right;">${this.formatNumber(row.wht_amount)}</td>
                    <td style="text-align:right;">${this.formatNumber(row.flood_tax)}</td>
                    <td style="text-align:right;">${this.formatNumber(row.gst_amount)}</td>
                    <td style="text-align:right;">${this.formatNumber(row.advance_adjusted)}</td>
                    <td style="text-align:right;">${this.formatNumber(row.discount_given)}</td>
                </tr>
            `;
        });

        // Date Filter formatting
        let dateLine = '';
        if (document.getElementById('rrr_use_date').checked) {
            dateLine = `<h2 style="margin: 4px 0 0; font-size: 13px; color: #555;">Period: ${document.getElementById('rrr_date_from').value} To ${document.getElementById('rrr_date_to').value}</h2>`;
        }

        const printWin = window.open('', '_blank');
        printWin.document.write(`
            <html>
            <head>
                <title>Recovery / Receipt Report</title>
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
                        <h2>Recovery / Receipt Report</h2>
                        ${dateLine}
                    </div>
                    <div class="hdr-right"></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:70px;">Date</th>
                            <th style="width:70px;">Tran No.</th>
                            <th class="text-left">Customer</th>
                            <th class="text-left" style="width:120px;">Cash / Bank</th>
                            <th style="width:80px;">Cheque No.</th>
                            <th class="text-right" style="width:90px;">Amount Received</th>
                            <th class="text-right" style="width:70px;">W.H. Tax</th>
                            <th class="text-right" style="width:70px;">Flood Tax</th>
                            <th class="text-right" style="width:70px;">Sales Tax</th>
                            <th class="text-right" style="width:70px;">Advance Adj.</th>
                            <th class="text-right" style="width:70px;">Discount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="5" class="text-right">Totals</td>
                            <td class="text-right">${this.formatNumber(t_received)}</td>
                            <td class="text-right">${this.formatNumber(t_wht)}</td>
                            <td class="text-right">${this.formatNumber(t_flood)}</td>
                            <td class="text-right">${this.formatNumber(t_stax)}</td>
                            <td class="text-right">${this.formatNumber(t_adv)}</td>
                            <td class="text-right">${this.formatNumber(t_disc)}</td>
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
        `);
        printWin.document.close();
    },

    exportExcel() {
        if (!this.reportData || this.reportData.length === 0) {
            alert("No data to export!");
            return;
        }

        let csv = 'Date,Tran No.,Customer,Cash / Bank,Cheque No.,Amount Received,W.H. Tax,Flood Tax,Sales Tax,Advance Adj.,Discount\n';
        
        let t_received = 0, t_wht = 0, t_flood = 0, t_stax = 0, t_adv = 0, t_disc = 0;

        this.reportData.forEach(row => {
            t_received += parseFloat(row.received_amount) || 0;
            t_wht += parseFloat(row.wht_amount) || 0;
            t_flood += parseFloat(row.flood_tax) || 0;
            t_stax += parseFloat(row.gst_amount) || 0;
            t_adv += parseFloat(row.advance_adjusted) || 0;
            t_disc += parseFloat(row.discount_given) || 0;

            const safeCustomer = (row.customer_name || '').replace(/"/g, '""');
            const safeCashBank = (row.cash_bank || '').replace(/"/g, '""');
            const safeDate = row.formatted_date || '';
            const safeTranNo = row.tran_no || '';
            const safeChequeNo = (row.cheque_no || '').replace(/"/g, '""');

            csv += `"${safeDate}","${safeTranNo}","${safeCustomer}","${safeCashBank}","${safeChequeNo}",${row.received_amount},${row.wht_amount},${row.flood_tax},${row.gst_amount},${row.advance_adjusted},${row.discount_given}\n`;
        });

        // Totals
        csv += `,,,,"Totals:",${t_received},${t_wht},${t_flood},${t_stax},${t_adv},${t_disc}\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "Recovery_Receipt_Report.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
