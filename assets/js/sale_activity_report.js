window.SaleActivityReport = {
    companyId: window.selectedCompanyId || (JSON.parse(localStorage.getItem('softifyx_session') || '{}')).company_id || 1,
    isInitialized: false,
    reportData: [],
    detailData: [],
    customers: [],

    init: function() {
        if (this.isInitialized) return;
        this.bindEvents();
        this.loadDropdowns();
        this.setupCustomerSuggest();
        
        const d = new Date();
        const strDate = d.toISOString().split('T')[0];
        document.getElementById('sar_date_from').value = strDate;
        document.getElementById('sar_date_to').value = strDate;
        
        this.isInitialized = true;
    },

    bindEvents: function() {
        const toggleEl = (chkId, ...elIds) => {
            const chk = document.getElementById(chkId);
            if (!chk) return;
            chk.addEventListener('change', (e) => {
                elIds.forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.disabled = !e.target.checked;
                });
            });
        };

        toggleEl('sar_use_cust_type', 'sar_cust_type');
        toggleEl('sar_use_customer', 'sar_customer_code', 'sar_customer_name');
        toggleEl('sar_use_emp', 'sar_emp');
        toggleEl('sar_use_date', 'sar_date_from', 'sar_date_to');
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

    async loadDropdowns() {
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

        await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${this.companyId}`, 'sar_cust_type', 'Select Customer Type...');
        await loadOptions(`api/maintain.php?action=get_employees&company_id=${this.companyId}`, 'sar_emp', 'Select Employee...');

        try {
            const r = await fetch(`api/maintain.php?action=get_all_customers&company_id=${this.companyId}`);
            if (r.ok) {
                this.customers = await r.json();
            }
        } catch(e) { console.error(e); }
    },

    setupCustomerSuggest: function() {
        const codeInput = document.getElementById('sar_customer_code');
        const nameInput = document.getElementById('sar_customer_name');
        const suggest = document.getElementById('sar_customer_suggest');
        const hiddenInput = document.getElementById('sar_customer_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) {
                suggest.style.display = 'none';
                return;
            }
            const filtered = this.customers.filter(c => 
                (c.code && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.code.toLowerCase(), val.toLowerCase()) : c.code.toLowerCase().includes(val.toLowerCase()))) ||
                (c.name && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.name.toLowerCase(), val.toLowerCase()) : c.name.toLowerCase().includes(val.toLowerCase())))
            ).slice(0, 50);

            if (filtered.length === 0) {
                suggest.style.display = 'none';
                return;
            }

            suggest.innerHTML = filtered.map(c => `
                <div data-id="${c.id}" data-code="${c.code}" data-name="${c.name}">
                    <b>${c.code}</b> &nbsp; ${c.name}
                </div>
            `).join('');
            suggest.style.display = 'block';
            suggestIndex = -1;
        };

        const handleKeyDown = (e, inputEl) => {
            if (suggest.style.display === 'none') return;
            const items = suggest.querySelectorAll('div');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                suggestIndex = (suggestIndex + 1) % items.length;
                items.forEach((item, idx) => item.classList.toggle('active', idx === suggestIndex));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                suggestIndex = (suggestIndex - 1 + items.length) % items.length;
                items.forEach((item, idx) => item.classList.toggle('active', idx === suggestIndex));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestIndex >= 0) {
                    items[suggestIndex].click();
                } else if (items.length > 0) {
                    items[0].click();
                }
            }
        };

        codeInput.addEventListener('input', (e) => handleSearch(e.target.value));
        nameInput.addEventListener('input', (e) => handleSearch(e.target.value));
        
        codeInput.addEventListener('keydown', (e) => handleKeyDown(e, codeInput));
        nameInput.addEventListener('keydown', (e) => handleKeyDown(e, nameInput));

        suggest.addEventListener('click', (e) => {
            const div = e.target.closest('div');
            if (div) {
                codeInput.value = div.dataset.code;
                nameInput.value = div.dataset.name;
                hiddenInput.value = div.dataset.id;
                suggest.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!codeInput.contains(e.target) && !nameInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
            }
        });
    },

    async fetchReport() {
        let url = `api/sale_activity_report.php?action=get_data&company_id=${this.companyId}`;
        
        if (document.getElementById('sar_use_cust_type').checked) {
            url += `&customer_type_id=${document.getElementById('sar_cust_type').value}`;
        }
        if (document.getElementById('sar_use_customer').checked) {
            url += `&customer_id=${document.getElementById('sar_customer_id').value}`;
        }
        if (document.getElementById('sar_use_emp').checked) {
            url += `&employee_id=${document.getElementById('sar_emp').value}`;
        }
        if (document.getElementById('sar_use_date').checked) {
            url += `&date_from=${document.getElementById('sar_date_from').value}`;
            url += `&date_to=${document.getElementById('sar_date_to').value}`;
        }

        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("API failed");
            this.reportData = await resp.json();
            this.renderTable();
            this.clearDetailTable();
        } catch (err) {
            console.error("Fetch report error:", err);
            alert("Error fetching report data");
        }
    },
    
    async fetchDetails(invoiceNo, customerCoaId) {
        let url = `api/sale_activity_report.php?action=get_details&company_id=${this.companyId}&invoice_no=${invoiceNo}&coa_id=${customerCoaId}`;
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("API failed");
            this.detailData = await resp.json();
            this.renderDetailTable();
        } catch (err) {
            console.error("Fetch details error:", err);
        }
    },

    formatNumber(num) {
        if (!num) return '0.00';
        return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    renderTable() {
        const tbody = document.getElementById('sar_tbody');
        tbody.innerHTML = '';
        
        let t_inv = 0, t_rec = 0, t_ret = 0, t_wht = 0, t_fld = 0, t_stx = 0, t_adv = 0, t_dsc = 0, t_bal = 0;

        if (!this.reportData || this.reportData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 10px;">No records found</td></tr>';
            this.updateTotals(t_inv, t_rec, t_ret, t_wht, t_fld, t_stx, t_adv, t_dsc, t_bal);
            return;
        }

        this.reportData.forEach((row) => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.advance_adjusted) || 0;
            const dsc = parseFloat(row.discount) || 0;
            
            const bal = inv - rec - ret - wht - fld - stx - adv - dsc;

            t_inv += inv;
            t_rec += rec;
            t_ret += ret;
            t_wht += wht;
            t_fld += fld;
            t_stx += stx;
            t_adv += adv;
            t_dsc += dsc;
            t_bal += bal;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center;"><div class="sr-row-pointer"></div></td>
                <td style="text-align: center;">${row.serial_no || ''}</td>
                <td style="text-align: center;">${row.formatted_date || ''}</td>
                <td style="text-align: left;" title="${row.customer_name || ''}">${row.customer_name || ''}</td>
                <td style="text-align: right;">${this.formatNumber(inv)}</td>
                <td style="text-align: right;">${this.formatNumber(rec)}</td>
                <td style="text-align: right;">${this.formatNumber(ret)}</td>
                <td style="text-align: right;">${this.formatNumber(wht)}</td>
                <td style="text-align: right;">${this.formatNumber(fld)}</td>
                <td style="text-align: right;">${this.formatNumber(stx)}</td>
                <td style="text-align: right;">${this.formatNumber(adv)}</td>
                <td style="text-align: right;">${this.formatNumber(dsc)}</td>
                <td style="text-align: right;">${this.formatNumber(bal)}</td>
            `;
            
            tr.addEventListener('click', () => {
                Array.from(tbody.querySelectorAll('tr')).forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                this.fetchDetails(row.serial_no, row.customer_coa_id);
            });

            tbody.appendChild(tr);
        });

        this.updateTotals(t_inv, t_rec, t_ret, t_wht, t_fld, t_stx, t_adv, t_dsc, t_bal);
    },
    
    renderDetailTable() {
        const tbody = document.getElementById('sar_detail_tbody');
        tbody.innerHTML = '';
        
        let t_inv = 0, t_rec = 0, t_ret = 0, t_wht = 0, t_fld = 0, t_stx = 0, t_adv = 0, t_dsc = 0;

        if (!this.detailData || this.detailData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 10px;">No details found</td></tr>';
            this.updateDetailTotals(t_inv, t_rec, t_ret, t_wht, t_fld, t_stx, t_adv, t_dsc);
            return;
        }

        this.detailData.forEach((row) => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.adv_adj) || 0;
            const dsc = parseFloat(row.discount) || 0;

            t_inv += inv;
            t_rec += rec;
            t_ret += ret;
            t_wht += wht;
            t_fld += fld;
            t_stx += stx;
            t_adv += adv;
            t_dsc += dsc;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center;"><div class="sr-row-pointer"></div></td>
                <td style="text-align: left;">${row.trans_type || ''}</td>
                <td style="text-align: center;">${row.voucher_no || ''}</td>
                <td style="text-align: center;">${row.formatted_date || ''}</td>
                <td style="text-align: right;">${this.formatNumber(inv)}</td>
                <td style="text-align: right;">${this.formatNumber(rec)}</td>
                <td style="text-align: right;">${this.formatNumber(ret)}</td>
                <td style="text-align: right;">${this.formatNumber(wht)}</td>
                <td style="text-align: right;">${this.formatNumber(fld)}</td>
                <td style="text-align: right;">${this.formatNumber(stx)}</td>
                <td style="text-align: right;">${this.formatNumber(adv)}</td>
                <td style="text-align: right;">${this.formatNumber(dsc)}</td>
            `;
            
            tr.addEventListener('click', () => {
                Array.from(tbody.querySelectorAll('tr')).forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
            });

            tr.addEventListener('dblclick', () => {
                this.drillDown(row.voucher_no, row.trans_type, row.record_id);
            });

            tbody.appendChild(tr);
        });

        this.updateDetailTotals(t_inv, t_rec, t_ret, t_wht, t_fld, t_stx, t_adv, t_dsc);
    },
    
    clearDetailTable() {
        document.getElementById('sar_detail_tbody').innerHTML = '';
        this.updateDetailTotals(0, 0, 0, 0, 0, 0, 0, 0);
    },

    updateTotals(inv, rec, ret, wht, fld, stx, adv, dsc, bal) {
        document.getElementById('sar_tot_inv').textContent = this.formatNumber(inv);
        document.getElementById('sar_tot_rec').textContent = this.formatNumber(rec);
        document.getElementById('sar_tot_ret').textContent = this.formatNumber(ret);
        document.getElementById('sar_tot_wht').textContent = this.formatNumber(wht);
        document.getElementById('sar_tot_fld').textContent = this.formatNumber(fld);
        document.getElementById('sar_tot_stx').textContent = this.formatNumber(stx);
        document.getElementById('sar_tot_adv').textContent = this.formatNumber(adv);
        document.getElementById('sar_tot_dsc').textContent = this.formatNumber(dsc);
        document.getElementById('sar_tot_bal').textContent = this.formatNumber(bal);
    },
    
    updateDetailTotals(inv, rec, ret, wht, fld, stx, adv, dsc) {
        document.getElementById('sar_dt_inv').textContent = this.formatNumber(inv);
        document.getElementById('sar_dt_rec').textContent = this.formatNumber(rec);
        document.getElementById('sar_dt_ret').textContent = this.formatNumber(ret);
        document.getElementById('sar_dt_wht').textContent = this.formatNumber(wht);
        document.getElementById('sar_dt_fld').textContent = this.formatNumber(fld);
        document.getElementById('sar_dt_stx').textContent = this.formatNumber(stx);
        document.getElementById('sar_dt_adv').textContent = this.formatNumber(adv);
        document.getElementById('sar_dt_dsc').textContent = this.formatNumber(dsc);
    },

    async drillDown(voucherNoStr, transType, recordId) {
        if (!voucherNoStr) return;
        
        let type = '';
        let serialNo = voucherNoStr;
        
        if (transType === 'Sale Invoice' || transType === 'SI') {
            type = 'SI';
        } else if (transType === 'Sale Return') {
            type = 'SR';
        } else if (transType === 'Cash Receipt') {
            type = 'CRV';
            serialNo = voucherNoStr.replace('CRV ', '');
        } else if (transType === 'Bank Receipt') {
            type = 'BRV';
            serialNo = voucherNoStr.replace('BRV ', '');
        }
        
        if (type === 'SI') {
            window.openModularPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice', 'Sale Invoice', async () => {
                try {
                    if (window.SIModule && window.SIModule.init) await window.SIModule.init();
                    let url = recordId ? `api/sale_invoice.php?action=get_invoice&id=${recordId}&company_id=${this.companyId}` : `api/sale_invoice.php?action=get_invoice&serial_no=${serialNo}&company_id=${this.companyId}`;
                    fetch(url)
                        .then(r => r.json())
                        .then(d => { if(d && d.id && window.SIModule) window.SIModule.loadInvoiceData(d); });
                } catch(e) { console.error("Drilldown error:", e); }
            }, 'Sale Invoices', true, true);
        } else if (type === 'SR') {
            window.openModularPopup('Navigation/Sales/sale_return.html', 'fa-undo', 'Sale Return', async () => {
                try {
                    if (window.SRModule && window.SRModule.init) await window.SRModule.init();
                    let url = recordId ? `api/sale_return.php?action=get_return&id=${recordId}&company_id=${this.companyId}` : `api/sale_return.php?action=get_return&serial_no=${serialNo}&company_id=${this.companyId}`;
                    fetch(url)
                        .then(r => r.json())
                        .then(d => { if(d && d.id && window.SRModule) window.SRModule.fillForm(d); });
                } catch(e) { console.error("Drilldown error:", e); }
            }, 'Sale Return', true, true);
        } else if (type === 'CRV') {
            window.openModularPopup('Navigation/Sales/cash_receipts.html', 'fa-file-invoice-dollar', 'Cash Receipt', async () => {
                try {
                    if (window.CRModule && window.CRModule.init) await window.CRModule.init();
                    let url = recordId ? `api/cash_receipts.php?action=get&id=${recordId}&company_id=${this.companyId}` : `api/cash_receipts.php?action=get&serial_no=${serialNo}&company_id=${this.companyId}`;
                    fetch(url)
                        .then(r => r.json())
                        .then(d => { if(d && d.id && window.CRModule) window.CRModule.loadData(d); });
                } catch(e) { console.error("Drilldown error:", e); }
            }, 'Cash Receipts', true, true);
        } else if (type === 'BRV') {
            window.openModularPopup('Navigation/Sales/bank_receipts.html', 'fa-file-invoice-dollar', 'Bank Receipt', async () => {
                try {
                    if (window.BRModule && window.BRModule.init) await window.BRModule.init();
                    let url = recordId ? `api/bank_receipts.php?action=get&id=${recordId}&company_id=${this.companyId}` : `api/bank_receipts.php?action=get&serial_no=${serialNo}&company_id=${this.companyId}`;
                    fetch(url)
                        .then(r => r.json())
                        .then(d => { if(d && d.id && window.BRModule) window.BRModule.loadData(d); });
                } catch(e) { console.error("Drilldown error:", e); }
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

        let t_inv = 0, t_rec = 0, t_ret = 0, t_wht = 0, t_fld = 0, t_stx = 0, t_adv = 0, t_dsc = 0, t_bal = 0;
        
        let rows = '';
        this.reportData.forEach(row => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.advance_adjusted) || 0;
            const dsc = parseFloat(row.discount) || 0;
            const bal = inv - rec - ret - wht - fld - stx - adv - dsc;

            t_inv += inv; t_rec += rec; t_ret += ret; t_wht += wht;
            t_fld += fld; t_stx += stx; t_adv += adv; t_dsc += dsc; t_bal += bal;

            rows += `
                <tr>
                    <td style="text-align:center;">${row.serial_no || ''}</td>
                    <td style="text-align:center;">${row.formatted_date || ''}</td>
                    <td class="text-left">${row.customer_name || ''}</td>
                    <td style="text-align:right;">${this.formatNumber(inv)}</td>
                    <td style="text-align:right;">${this.formatNumber(rec)}</td>
                    <td style="text-align:right;">${this.formatNumber(ret)}</td>
                    <td style="text-align:right;">${this.formatNumber(wht)}</td>
                    <td style="text-align:right;">${this.formatNumber(fld)}</td>
                    <td style="text-align:right;">${this.formatNumber(stx)}</td>
                    <td style="text-align:right;">${this.formatNumber(adv)}</td>
                    <td style="text-align:right;">${this.formatNumber(dsc)}</td>
                    <td style="text-align:right;">${this.formatNumber(bal)}</td>
                </tr>
            `;
        });

        let dateLine = '';
        if (document.getElementById('sar_use_date').checked) {
            dateLine = `<div style="font-size:12px; margin-top:5px; font-weight:normal;">Period: ${document.getElementById('sar_date_from').value} To ${document.getElementById('sar_date_to').value}</div>`;
        }

        const printWin = window.open('', '_blank');
        printWin.document.write(`
            <html>
            <head>
                <title>Sale Activity Report - Invoice Wise</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 10px; margin: 20px; }
                    @page { size: landscape; margin: 10mm; }
                    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
                    .hdr-left { width: 100px; text-align: left; }
                    .hdr-center { flex: 1; text-align: center; }
                    .hdr-right { width: 100px; text-align: right; }
                    .hdr h1 { margin: 0; font-size: 16px; }
                    .hdr h2 { margin: 4px 0 0; font-size: 13px; color: #555; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #000; padding: 2px 4px; text-align: center; white-space: nowrap; }
                    th { background-color: #f0f0f0; font-size: 9px; font-weight: bold; }
                    .text-left { text-align: left; }
                    .text-center { text-align: center; }
                    .text-right { text-align: right; }
                    .totals { font-weight: bold; background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <div class="hdr">
                    <div class="hdr-left">${logoImg}</div>
                    <div class="hdr-center">
                        <h1>${companyName}</h1>
                        ${contactLine}
                        <h2>Sale Activity Report - Invoice Wise</h2>
                        ${dateLine}
                    </div>
                    <div class="hdr-right"></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:60px;">Invoice No.</th>
                            <th style="width:65px;">Invoice Date</th>
                            <th class="text-left">Customer</th>
                            <th style="width:70px;">Invoice Amount</th>
                            <th style="width:70px;">Amt. Received</th>
                            <th style="width:60px;">Sale Returns</th>
                            <th style="width:50px;">W.H. Tax</th>
                            <th style="width:50px;">Flood Tax</th>
                            <th style="width:50px;">Sales Tax</th>
                            <th style="width:50px;">Adv. Adj.</th>
                            <th style="width:50px;">Discount</th>
                            <th style="width:70px;">Balance Amt.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr class="totals">
                            <td colspan="3" style="text-align:right;">Totals Rs.</td>
                            <td style="text-align:right;">${this.formatNumber(t_inv)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_rec)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_ret)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_wht)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_fld)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_stx)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_adv)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_dsc)}</td>
                            <td style="text-align:right;">${this.formatNumber(t_bal)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                    <span>Printed by: ${userName}</span>
                    <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
                </div>
            </body>
            </html>
        `);
        printWin.document.close();
        setTimeout(() => {
            printWin.print();
            printWin.close();
        }, 500);
    },

    exportExcel() {
        if (!this.reportData || this.reportData.length === 0) {
            alert("No data to export!");
            return;
        }

        let csv = 'Invoice No.,Invoice Date,Customer,Invoice Amount,Amt. Received,Sale Returns,W.H. Tax,Flood Tax,Sales Tax,Adv. Adj.,Discount,Balance Amt.\n';
        
        let t_inv = 0, t_rec = 0, t_ret = 0, t_wht = 0, t_fld = 0, t_stx = 0, t_adv = 0, t_dsc = 0, t_bal = 0;

        this.reportData.forEach(row => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.advance_adjusted) || 0;
            const dsc = parseFloat(row.discount) || 0;
            const bal = inv - rec - ret - wht - fld - stx - adv - dsc;

            t_inv += inv; t_rec += rec; t_ret += ret; t_wht += wht;
            t_fld += fld; t_stx += stx; t_adv += adv; t_dsc += dsc; t_bal += bal;

            const safeCustomer = (row.customer_name || '').replace(/"/g, '""');
            const safeDate = row.formatted_date || '';
            const safeSerialNo = row.serial_no || '';

            csv += `"${safeSerialNo}","${safeDate}","${safeCustomer}",${inv},${rec},${ret},${wht},${fld},${stx},${adv},${dsc},${bal}\n`;
        });

        // Totals
        csv += `,,Totals Rs.,${t_inv},${t_rec},${t_ret},${t_wht},${t_fld},${t_stx},${t_adv},${t_dsc},${t_bal}\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "Sale_Activity_Report.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
