window.SaleActivityCustomerWise = {
    companyId: window.selectedCompanyId || (JSON.parse(localStorage.getItem('softifyx_session') || '{}')).company_id || 1,
    isInitialized: false,
    reportData: [],
    customers: [],
    selectedIndex: -1,

    init: function() {
        if (this.isInitialized) return;
        this.bindEvents();
        this.loadDropdowns();
        this.setupCustomerSuggest();
        
        const d = new Date();
        const strDate = d.toISOString().split('T')[0];
        document.getElementById('sacw_date_from').value = strDate;
        document.getElementById('sacw_date_to').value = strDate;
        
        this.setupKeyboardNavigation();

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

        toggleEl('sacw_use_cust_type', 'sacw_cust_type');
        toggleEl('sacw_use_customer', 'sacw_customer_code', 'sacw_customer_name');
        toggleEl('sacw_use_emp', 'sacw_emp');
        toggleEl('sacw_use_date', 'sacw_date_from', 'sacw_date_to');
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

        await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${this.companyId}`, 'sacw_cust_type', 'Select Customer Type...');
        await loadOptions(`api/maintain.php?action=get_employees&company_id=${this.companyId}`, 'sacw_emp', 'Select Employee...');

        try {
            const r = await fetch(`api/maintain.php?action=get_all_customers&company_id=${this.companyId}`);
            if (r.ok) {
                this.customers = await r.json();
            }
        } catch(e) { console.error(e); }
    },

    setupCustomerSuggest: function() {
        const codeInput = document.getElementById('sacw_customer_code');
        const nameInput = document.getElementById('sacw_customer_name');
        const suggest = document.getElementById('sacw_customer_suggest');
        const hiddenInput = document.getElementById('sacw_customer_id');
        
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

            suggest.innerHTML = '';
            filtered.forEach((c, idx) => {
                const div = document.createElement('div');
                div.textContent = `${c.code || ''} - ${c.name || ''}`;
                div.dataset.id = c.id;
                div.dataset.code = c.code || '';
                div.dataset.name = c.name || '';
                div.dataset.index = idx;
                suggest.appendChild(div);
            });
            suggest.style.display = 'block';
            suggestIndex = -1;
        };

        const handleKeys = (e) => {
            if (suggest.style.display !== 'block') return;
            const items = suggest.querySelectorAll('div');
            if (items.length === 0) return;

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
                if (suggestIndex >= 0 && items[suggestIndex]) {
                    items[suggestIndex].click();
                }
            }
        };

        const updateSuggestHighlight = (items) => {
            items.forEach(i => i.classList.remove('active'));
            if (suggestIndex >= 0 && items[suggestIndex]) {
                items[suggestIndex].classList.add('active');
                items[suggestIndex].scrollIntoView({ block: 'nearest' });
            }
        };

        codeInput.addEventListener('input', (e) => handleSearch(e.target.value));
        nameInput.addEventListener('input', (e) => handleSearch(e.target.value));
        
        codeInput.addEventListener('keydown', handleKeys);
        nameInput.addEventListener('keydown', handleKeys);

        suggest.addEventListener('click', (e) => {
            if (e.target.tagName === 'DIV') {
                const div = e.target;
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

    setupKeyboardNavigation() {
        if (window._sacwKeydownHandler) {
            document.removeEventListener('keydown', window._sacwKeydownHandler);
        }

        window._sacwKeydownHandler = (e) => {
            const container = document.getElementById('sacw_table_v2');
            if (!container || container.offsetParent === null) return;
            
            const tbody = document.getElementById('sacw_tbody');
            if (!tbody) return;
            
            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (rows.length === 0) return;

            const self = window.SaleActivityCustomerWise;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (self.lastKeyDownTime && Date.now() - self.lastKeyDownTime < 50) return;
                self.lastKeyDownTime = Date.now();
                self.selectRow(Math.min(self.selectedIndex + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (self.lastKeyDownTime && Date.now() - self.lastKeyDownTime < 50) return;
                self.lastKeyDownTime = Date.now();
                self.selectRow(Math.max(self.selectedIndex - 1, 0));
            }
        };

        document.addEventListener('keydown', window._sacwKeydownHandler);
    },

    selectRow(index) {
        const tbody = document.getElementById('sacw_tbody');
        if (!tbody) return;
        
        for (let i = 0; i < tbody.children.length; i++) {
            tbody.children[i].classList.remove('selected');
        }
        
        if (index >= 0 && index < tbody.children.length) {
            tbody.children[index].classList.add('selected');
            tbody.children[index].scrollIntoView({ block: 'nearest' });
            this.selectedIndex = index;
        }
    },

    async fetchReport() {
        let url = `api/sale_activity_customer_wise.php?action=get_data&company_id=${this.companyId}`;
        
        if (document.getElementById('sacw_use_cust_type').checked) {
            url += `&customer_type_id=${document.getElementById('sacw_cust_type').value}`;
        }
        if (document.getElementById('sacw_use_customer').checked) {
            url += `&customer_id=${document.getElementById('sacw_customer_id').value}`;
        }
        if (document.getElementById('sacw_use_emp').checked) {
            url += `&employee_id=${document.getElementById('sacw_emp').value}`;
        }
        if (document.getElementById('sacw_use_date').checked) {
            url += `&date_from=${document.getElementById('sacw_date_from').value}`;
            url += `&date_to=${document.getElementById('sacw_date_to').value}`;
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

    formatNumber(num) {
        if (!num) return '0.00';
        return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    renderTable() {
        const tbody = document.getElementById('sacw_tbody');
        tbody.innerHTML = '';
        
        let t_inv = 0, t_rec = 0, t_ret = 0, t_wht = 0, t_fld = 0, t_stx = 0, t_adv = 0, t_dsc = 0, t_realized = 0, t_bal = 0;

        if (!this.reportData || this.reportData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 10px;">No records found</td></tr>';
            this.updateTotals(t_inv, t_rec, t_ret, t_wht, t_fld, t_stx, t_adv, t_dsc, t_realized, t_bal);
            return;
        }

        this.reportData.forEach((row, idx) => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.advance_adjusted) || 0;
            const dsc = parseFloat(row.discount) || 0;
            
            const realized = rec + ret + wht + fld + stx + adv + dsc;
            const bal = inv - realized;

            t_inv += inv;
            t_rec += rec;
            t_ret += ret;
            t_wht += wht;
            t_fld += fld;
            t_stx += stx;
            t_adv += adv;
            t_dsc += dsc;
            t_realized += realized;
            t_bal += bal;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center;"><div class="sr-row-pointer"></div></td>
                <td style="text-align: left;" title="${row.customer_name || ''}">${row.customer_name || ''}</td>
                <td style="text-align: left;">${row.employee_name || ''}</td>
                <td style="text-align: right;">${this.formatNumber(inv)}</td>
                <td style="text-align: right;">${this.formatNumber(rec)}</td>
                <td style="text-align: right;">${this.formatNumber(ret)}</td>
                <td style="text-align: right;">${this.formatNumber(wht)}</td>
                <td style="text-align: right;">${this.formatNumber(fld)}</td>
                <td style="text-align: right;">${this.formatNumber(stx)}</td>
                <td style="text-align: right;">${this.formatNumber(adv)}</td>
                <td style="text-align: right;">${this.formatNumber(dsc)}</td>
                <td style="text-align: right;">${this.formatNumber(realized)}</td>
                <td style="text-align: right;">${this.formatNumber(bal)}</td>
            `;
            
            tr.addEventListener('click', () => {
                this.selectRow(idx);
            });

            tbody.appendChild(tr);
        });

        this.updateTotals(t_inv, t_rec, t_ret, t_wht, t_fld, t_stx, t_adv, t_dsc, t_realized, t_bal);
    },
    
    updateTotals(inv, rec, ret, wht, fld, stx, adv, dsc, realized, bal) {
        document.getElementById('sacw_tot_inv').textContent = this.formatNumber(inv);
        document.getElementById('sacw_tot_rec').textContent = this.formatNumber(rec);
        document.getElementById('sacw_tot_ret').textContent = this.formatNumber(ret);
        document.getElementById('sacw_tot_wht').textContent = this.formatNumber(wht);
        document.getElementById('sacw_tot_fld').textContent = this.formatNumber(fld);
        document.getElementById('sacw_tot_stx').textContent = this.formatNumber(stx);
        document.getElementById('sacw_tot_adv').textContent = this.formatNumber(adv);
        document.getElementById('sacw_tot_dsc').textContent = this.formatNumber(dsc);
        document.getElementById('sacw_tot_realized').textContent = this.formatNumber(realized);
        document.getElementById('sacw_tot_bal').textContent = this.formatNumber(bal);
    },

    async printReport() {
        if (!this.reportData || this.reportData.length === 0) {
            alert('No data to print');
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
                <title>Sale Activity Report - Customer Wise</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10px; margin: 20px; }
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
                    .tot-row { font-weight: bold; background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <div class="hdr">
                    <div class="hdr-left">${logoImg}</div>
                    <div class="hdr-center">
                        <h1>${companyName}</h1>
                        ${contactLine}
                        <h2>Sale Activity Report - Customer Wise</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th class="text-left">Customer</th>
                            <th class="text-left">Employee</th>
                            <th>Total Sales</th>
                            <th>Amt. Received</th>
                            <th>Sale Return</th>
                            <th>W.H. Tax</th>
                            <th>Flood Tax</th>
                            <th>Sales Tax</th>
                            <th>Adv. Adj.</th>
                            <th>Discount</th>
                            <th>Total Realized</th>
                            <th>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let t_inv = 0, t_rec = 0, t_ret = 0, t_wht = 0, t_fld = 0, t_stx = 0, t_adv = 0, t_dsc = 0, t_realized = 0, t_bal = 0;

        this.reportData.forEach(row => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.advance_adjusted) || 0;
            const dsc = parseFloat(row.discount) || 0;
            const realized = rec + ret + wht + fld + stx + adv + dsc;
            const bal = inv - realized;

            t_inv += inv; t_rec += rec; t_ret += ret; t_wht += wht; t_fld += fld; t_stx += stx; t_adv += adv; t_dsc += dsc; t_realized += realized; t_bal += bal;

            html += `
                <tr>
                    <td class="text-left">${row.customer_name || ''}</td>
                    <td class="text-left">${row.employee_name || ''}</td>
                    <td>${this.formatNumber(inv)}</td>
                    <td>${this.formatNumber(rec)}</td>
                    <td>${this.formatNumber(ret)}</td>
                    <td>${this.formatNumber(wht)}</td>
                    <td>${this.formatNumber(fld)}</td>
                    <td>${this.formatNumber(stx)}</td>
                    <td>${this.formatNumber(adv)}</td>
                    <td>${this.formatNumber(dsc)}</td>
                    <td>${this.formatNumber(realized)}</td>
                    <td>${this.formatNumber(bal)}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="2" class="text-right">Totals Rs.</td>
                            <td class="text-right">${this.formatNumber(t_inv)}</td>
                            <td class="text-right">${this.formatNumber(t_rec)}</td>
                            <td class="text-right">${this.formatNumber(t_ret)}</td>
                            <td class="text-right">${this.formatNumber(t_wht)}</td>
                            <td class="text-right">${this.formatNumber(t_fld)}</td>
                            <td class="text-right">${this.formatNumber(t_stx)}</td>
                            <td class="text-right">${this.formatNumber(t_adv)}</td>
                            <td class="text-right">${this.formatNumber(t_dsc)}</td>
                            <td class="text-right">${this.formatNumber(t_realized)}</td>
                            <td class="text-right">${this.formatNumber(t_bal)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                    <span>Printed by: ${userName}</span>
                    <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
                </div>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    },

    exportExcel() {
        if (!this.reportData || this.reportData.length === 0) {
            alert('No data to export');
            return;
        }

        let csv = 'Customer,Employee,Total Sales,Amt. Received,Sale Return,W.H. Tax,Flood Tax,Sales Tax,Adv. Adj.,Discount,Total Realized,Balance\n';

        this.reportData.forEach(row => {
            const inv = parseFloat(row.invoice_amount) || 0;
            const rec = parseFloat(row.amt_received) || 0;
            const ret = parseFloat(row.sale_returns) || 0;
            const wht = parseFloat(row.wh_tax) || 0;
            const fld = parseFloat(row.flood_tax) || 0;
            const stx = parseFloat(row.sales_tax) || 0;
            const adv = parseFloat(row.advance_adjusted) || 0;
            const dsc = parseFloat(row.discount) || 0;
            const realized = rec + ret + wht + fld + stx + adv + dsc;
            const bal = inv - realized;

            csv += `"${row.customer_name || ''}","${row.employee_name || ''}",${inv},${rec},${ret},${wht},${fld},${stx},${adv},${dsc},${realized},${bal}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Sale_Activity_Customer_Wise.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
};
