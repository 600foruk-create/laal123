window.CashBankBalancesModule = {
    isInitialized: false,
    currentData: [],
    
    getEl: function(id) { return document.getElementById(id); },

    init: function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        window.currentCompanyId = session.company_id || 1;

        this.setDefaultDates();
        this.bindEvents();
    },

    setDefaultDates: function() {
        const today = new Date().toISOString().split('T')[0];
        const fd = this.getEl('cbb_from_date');
        const td = this.getEl('cbb_to_date');
        if(fd) fd.value = today;
        if(td) td.value = today;
    },

    bindEvents: function() {
        const self = this;
        const btnDisplay = self.getEl('cbb_btn_display');
        const btnPrint = self.getEl('cbb_btn_print');

        if(btnDisplay) {
            btnDisplay.addEventListener('click', () => self.fetchBalances());
        }

        if(btnPrint) {
            btnPrint.addEventListener('click', () => self.printReport());
        }
    },

    formatAmt: function(amt) {
        return parseFloat(amt || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },

    fetchBalances: async function() {
        const self = this;
        const cId = window.currentCompanyId;
        const fDate = self.getEl('cbb_from_date').value;
        const tDate = self.getEl('cbb_to_date').value;

        const btn = self.getEl('cbb_btn_display');
        if (btn) btn.disabled = true;

        const tbody = self.getEl('cbb_tbody');
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">Loading...</td></tr>';

        try {
            const res = await fetch(`api/cash_bank_balances.php?action=get_balances&company_id=${cId}&from_date=${fDate}&to_date=${tDate}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            self.currentData = data.balances || [];
            self.renderTable();
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="color:red;">Error: ${e.message}</td></tr>`;
            console.error(e);
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    renderTable: function() {
        const self = this;
        const tbody = self.getEl('cbb_tbody');
        tbody.innerHTML = '';

        if(self.currentData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No balances found for this period.</td></tr>';
            self.getEl('cbb_tot_ob').textContent = '0.00';
            self.getEl('cbb_tot_dr').textContent = '0.00';
            self.getEl('cbb_tot_cr').textContent = '0.00';
            self.getEl('cbb_tot_cb').textContent = '0.00';
            return;
        }

        let totOb = 0, totDr = 0, totCr = 0;

        self.currentData.forEach(row => {
            const ob = parseFloat(row.opening_balance || 0);
            const dr = parseFloat(row.debit || 0);
            const cr = parseFloat(row.credit || 0);
            const cb = parseFloat(row.closing_balance || 0);
            
            // Adjust totals for display. Normally, Debit OB is +, Credit OB is - for asset accounts.
            // Assuming all cash/bank accounts are normally Debit balances.
            const signedOb = row.ob_status === 'Credit' ? -ob : ob;
            totOb += signedOb;
            totDr += dr;
            totCr += cr;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center">
                    <img src="assets/icons/arrow_right.png" style="width:10px; opacity:0.5;" onerror="this.style.display='none'">
                </td>
                <td>${row.account_code || ''}</td>
                <td>${row.account_name || ''}</td>
                <td class="text-right">${self.formatAmt(ob)}</td>
                <td class="text-center">${row.ob_status || ''}</td>
                <td class="text-right">${self.formatAmt(dr)}</td>
                <td class="text-right">${self.formatAmt(cr)}</td>
                <td class="text-right">${self.formatAmt(cb)}</td>
                <td class="text-center">${row.cb_status || ''}</td>
                <td></td>
            `;
            
            tr.addEventListener('click', () => {
                Array.from(tbody.querySelectorAll('tr')).forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
            });
            
            tr.addEventListener('dblclick', () => {
                if(window.hideAllDropdowns) window.hideAllDropdowns();
                openModularPopup('Navigation/Reports/view_account_ledger.html', 'fa-book', 'Account Ledger', () => {
                    if(window.AccountLedgerModule) {
                        window.AccountLedgerModule.init();
                        setTimeout(() => {
                            // select account
                            if (typeof window.AccountLedgerModule.selectAccount === 'function') {
                                window.AccountLedgerModule.selectAccount(row.account_id, row.account_code, row.account_name);
                            }
                            
                            if (typeof window.AccountLedgerModule.fetchLedger === 'function') {
                                window.AccountLedgerModule.fetchLedger();
                            }
                        }, 500);
                    }
                }, 'View Account Ledger', true, true);
            });
            
            tbody.appendChild(tr);
        });

        const container = self.getEl('cbb_table_container');
        if (container && !container.hasAttribute('data-key-bound')) {
            container.setAttribute('data-key-bound', 'true');
            let lastKeyTime = 0;
            container.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const now = Date.now();
                    if (now - lastKeyTime < 50) return;
                    lastKeyTime = now;
                }
                
                const rows = Array.from(tbody.querySelectorAll('tr'));
                if (rows.length === 0) return;
                let activeIdx = rows.findIndex(r => r.classList.contains('selected'));
                
                if (e.key === 'ArrowDown') {
                    if (activeIdx < rows.length - 1) {
                        if(activeIdx >= 0) rows[activeIdx].classList.remove('selected');
                        rows[activeIdx + 1].classList.add('selected');
                        rows[activeIdx + 1].scrollIntoView({block: 'nearest'});
                    }
                } else if (e.key === 'ArrowUp') {
                    if (activeIdx > 0) {
                        rows[activeIdx].classList.remove('selected');
                        rows[activeIdx - 1].classList.add('selected');
                        rows[activeIdx - 1].scrollIntoView({block: 'nearest'});
                    }
                } else if (e.key === 'Enter') {
                    if (activeIdx >= 0) {
                        rows[activeIdx].dispatchEvent(new Event('dblclick'));
                    }
                }
            });
        }

        const totCb = totOb + totDr - totCr;

        self.getEl('cbb_tot_ob').textContent = self.formatAmt(Math.abs(totOb));
        const obStatusEl = self.getEl('cbb_tot_obs_wrap');
        if(obStatusEl) obStatusEl.textContent = (totOb < 0 ? 'Credit' : 'Debit');
        
        self.getEl('cbb_tot_dr').textContent = self.formatAmt(totDr);
        self.getEl('cbb_tot_cr').textContent = self.formatAmt(totCr);
        
        self.getEl('cbb_tot_cb').textContent = self.formatAmt(Math.abs(totCb));
        const cbStatusEl = self.getEl('cbb_tot_cbs_wrap');
        if(cbStatusEl) cbStatusEl.textContent = (totCb < 0 ? 'Credit' : 'Debit');
        
        self.currentTotals = { totOb, totDr, totCr, totCb };
        
        setTimeout(() => self.alignTotals(), 50);
    },
    
    alignTotals: function() {
        const table = document.getElementById('cbb_table');
        if (!table) return;
        const ths = table.querySelectorAll('thead th');
        if(ths.length < 10) return;
        
        const setWidth = (id, width) => {
            const el = document.getElementById(id);
            if(el) {
                el.style.width = width + 'px';
                el.style.minWidth = width + 'px';
                el.style.maxWidth = width + 'px';
                el.style.flexShrink = '0';
            }
        };
        
        setWidth('cbb_tot_label', ths[0].offsetWidth + ths[1].offsetWidth + ths[2].offsetWidth);
        setWidth('cbb_tot_ob_wrap', ths[3].offsetWidth);
        setWidth('cbb_tot_obs_wrap', ths[4].offsetWidth);
        setWidth('cbb_tot_dr_wrap', ths[5].offsetWidth);
        setWidth('cbb_tot_cr_wrap', ths[6].offsetWidth);
        setWidth('cbb_tot_cb_wrap', ths[7].offsetWidth);
        setWidth('cbb_tot_cbs_wrap', ths[8].offsetWidth);
        setWidth('cbb_tot_end_wrap', ths[9].offsetWidth);
    },

    printReport: function() {
        const self = this;
        if(self.currentData.length === 0) {
            alert('No data to print. Please display the report first.');
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyName = session.company_name || 'L S ENGINEERING HUB';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        
        const fDate = self.getEl('cbb_from_date').value;
        const tDate = self.getEl('cbb_to_date').value;
        const periodStr = `Period: ${fDate} to ${tDate}`;

        let html = `<!DOCTYPE html><html><head><title>Cash & Bank Balances</title><base href="${baseUrl}">
        <style>
            @page { margin: 0.5cm; }
            body { font-family:Arial,sans-serif; font-size:11px; padding:20px; margin:0; }
            .hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #000; }
            .hdr-left { width:120px; }
            .hdr-center { flex:1; text-align:center; }
            .hdr-right { width:120px; text-align:right; }
            .hdr h1 { margin:0; font-size:18px; }
            .hdr h2 { margin:4px 0 0; font-size:14px; color:#555; }
            table { width:100%; border-collapse:collapse; margin-bottom:20px; }
            th, td { border:1px solid #000; padding:5px 6px; }
            th { background:#fff; font-weight:bold; text-align:center; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .tot-row { background:#fff; font-weight:bold; }
        </style></head><body>`;

        html += `
        <div class="hdr">
            <div class="hdr-left"><img src="${actualLogo}" style="max-height:60px;"></div>
            <div class="hdr-center"><h1>${companyName}</h1><h2>Cash & Bank Balances</h2><div>${periodStr}</div></div>
            <div class="hdr-right"></div>
        </div>`;

        html += `
        <table>
            <thead>
                <tr>
                    <th style="width:100px;">Account Code</th>
                    <th>Account Name</th>
                    <th class="text-right" style="width:90px;">Opening Balance</th>
                    <th class="text-center" style="width:50px;">Status</th>
                    <th class="text-right" style="width:90px;">Debit</th>
                    <th class="text-right" style="width:90px;">Credit</th>
                    <th class="text-right" style="width:90px;">Closing Balance</th>
                    <th class="text-center" style="width:50px;">Status</th>
                </tr>
            </thead>
            <tbody>`;

        self.currentData.forEach(row => {
            html += `<tr>
                <td>${row.account_code || ''}</td>
                <td>${row.account_name || ''}</td>
                <td class="text-right">${self.formatAmt(row.opening_balance)}</td>
                <td class="text-center">${row.ob_status || ''}</td>
                <td class="text-right">${self.formatAmt(row.debit)}</td>
                <td class="text-right">${self.formatAmt(row.credit)}</td>
                <td class="text-right">${self.formatAmt(row.closing_balance)}</td>
                <td class="text-center">${row.cb_status || ''}</td>
            </tr>`;
        });

        const t = self.currentTotals;
        html += `<tr class="tot-row">
            <td colspan="2" class="text-right">Totals Rs.</td>
            <td class="text-right">${self.formatAmt(Math.abs(t.totOb))}</td>
            <td class="text-center">${t.totOb < 0 ? 'Credit' : 'Debit'}</td>
            <td class="text-right">${self.formatAmt(t.totDr)}</td>
            <td class="text-right">${self.formatAmt(t.totCr)}</td>
            <td class="text-right">${self.formatAmt(Math.abs(t.totCb))}</td>
            <td class="text-center">${t.totCb < 0 ? 'Credit' : 'Debit'}</td>
        </tr>`;

        html += `</tbody></table></body></html>`;

        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 800);
    }
};
