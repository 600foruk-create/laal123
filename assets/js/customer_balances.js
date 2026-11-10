window.CustomerBalancesModule = {
    currentData: [],
    
    getEl: function(id) {
        return document.getElementById(id);
    },
    
    init: async function() {
        const self = window.CustomerBalancesModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const fromD = self.getEl('cub_from_date');
        const toD = self.getEl('cub_to_date');
        // Do not auto-select dates
        if(fromD) fromD.value = '';
        if(toD) toD.value = '';
        
        // Load Dropdowns
        const loadOptions = async (url, elId, valField, textField) => {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const d = await r.json();
                    const sel = self.getEl(elId);
                    if (sel) {
                        sel.innerHTML = '<option value="">--Select--</option>';
                        d.forEach(item => {
                            let opt = document.createElement('option');
                            opt.value = item[valField];
                            opt.textContent = item[textField];
                            sel.appendChild(opt);
                        });
                    }
                }
            } catch (e) {
                console.error('Error loading options for ' + elId, e);
            }
        };

        await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${companyId}`, 'cub_sel_cust_type', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_regions&company_id=${companyId}`, 'cub_sel_main_region', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_sectors&company_id=${companyId}`, 'cub_sel_sector', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_departments&company_id=${companyId}`, 'cub_sel_department', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_employees&company_id=${companyId}`, 'cub_sel_employee', 'id', 'name');

        // Sub region dependency
        const regionSelect = self.getEl('cub_sel_main_region');
        if (regionSelect) {
            regionSelect.addEventListener('change', async () => {
                const subSel = self.getEl('cub_sel_sub_region');
                if (subSel) subSel.innerHTML = '<option value="">--Select--</option>';
                if (regionSelect.value) {
                    await loadOptions(`api/maintain.php?action=get_sub_regions&region_id=${regionSelect.value}`, 'cub_sel_sub_region', 'id', 'name');
                }
            });
        }

        // Checkbox logic for enabling/disabling selects
        const setupCheckbox = (chkId, selId) => {
            const chk = self.getEl(chkId);
            const sel = self.getEl(selId);
            if (chk && sel) {
                chk.addEventListener('change', () => {
                    sel.disabled = !chk.checked;
                    if(!chk.checked) sel.value = '';
                });
            }
        };

        setupCheckbox('cub_chk_cust_type', 'cub_sel_cust_type');
        setupCheckbox('cub_chk_main_region', 'cub_sel_main_region');
        setupCheckbox('cub_chk_sub_region', 'cub_sel_sub_region');
        setupCheckbox('cub_chk_sector', 'cub_sel_sector');
        setupCheckbox('cub_chk_department', 'cub_sel_department');
        setupCheckbox('cub_chk_employee', 'cub_sel_employee');
        
        const btnDisplay = self.getEl('cub_btn_display');
        if (btnDisplay) {
            btnDisplay.onclick = self.fetchBalances;
        }

        const btnPrint = self.getEl('cub_btn_print');
        if (btnPrint) {
            btnPrint.onclick = self.printReport;
        }

        const btnExcel = self.getEl('cub_btn_excel');
        if (btnExcel) {
            btnExcel.onclick = self.exportToExcel;
        }

        const chkZero = self.getEl('cub_chk_zero_balance');
        if (chkZero) {
            chkZero.addEventListener('change', self.fetchBalances);
        }
    },
    
    fetchBalances: async function() {
        const self = window.CustomerBalancesModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        const fromD = self.getEl('cub_from_date').value;
        const toD = self.getEl('cub_to_date').value;
        
        let url = `api/customer_balances.php?action=get_balances&company_id=${companyId}&_cb=${Date.now()}`;
        if(fromD) url += `&from_date=${fromD}`;
        if(toD) url += `&to_date=${toD}`;
        
        if (self.getEl('cub_chk_cust_type').checked && self.getEl('cub_sel_cust_type').value) {
            url += `&customer_type_id=${self.getEl('cub_sel_cust_type').value}`;
        }
        if (self.getEl('cub_chk_main_region').checked && self.getEl('cub_sel_main_region').value) {
            url += `&region_id=${self.getEl('cub_sel_main_region').value}`;
        }
        if (self.getEl('cub_chk_sub_region').checked && self.getEl('cub_sel_sub_region').value) {
            url += `&sub_region_id=${self.getEl('cub_sel_sub_region').value}`;
        }
        if (self.getEl('cub_chk_sector').checked && self.getEl('cub_sel_sector').value) {
            url += `&business_sector_id=${self.getEl('cub_sel_sector').value}`;
        }
        if (self.getEl('cub_chk_department').checked && self.getEl('cub_sel_department').value) {
            url += `&department_id=${self.getEl('cub_sel_department').value}`;
        }
        if (self.getEl('cub_chk_employee').checked && self.getEl('cub_sel_employee').value) {
            url += `&employee_id=${self.getEl('cub_sel_employee').value}`;
        }
        
        const chkZero = self.getEl('cub_chk_zero_balance');
        if (chkZero) {
            url += `&show_zero_balance=${chkZero.checked}`;
        }

        try {
            const res = await fetch(url);
            if(res.ok) {
                const data = await res.json();
                if(data.error) {
                    alert(data.error);
                } else {
                    self.currentData = data.balances || [];
                    self.renderTable();
                }
            } else {
                alert('Error fetching balances.');
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server.');
        }
    },
    
    formatAmt: function(amt) {
        if (!amt || isNaN(amt) || amt === 0) return '0.00';
        return parseFloat(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    
    renderTable: function() {
        const self = window.CustomerBalancesModule;
        const tbody = self.getEl('cub_tbody');
        if(!tbody) return;
        
        tbody.innerHTML = '';
        
        let totOb = 0, totDr = 0, totCr = 0, totCb = 0;
        
        if (self.currentData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding:20px; color:#999; font-style:italic;">No customer balances found for selected filters.</td></tr>';
        } else {
            self.currentData.forEach((row, index) => {
                const ob = parseFloat(row.opening_balance || 0);
                const dr = parseFloat(row.debit || 0);
                const cr = parseFloat(row.credit || 0);
                const cb = parseFloat(row.closing_balance || 0);
                
                const signedOb = row.ob_status === 'Credit' ? -ob : ob;
                totOb += signedOb;
                totDr += dr;
                totCr += cr;
                
                const signedCb = row.cb_status === 'Credit' ? -cb : cb;
                totCb += signedCb;
                
                let tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.innerHTML = `
                    <td style="text-align:center;"><i class="fas fa-caret-right" style="color:#aaa;"></i></td>
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
                    const allRows = tbody.querySelectorAll('tr');
                    allRows.forEach(r => r.classList.remove('selected'));
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
        }
        
        self.getEl('cub_tot_ob').textContent = self.formatAmt(Math.abs(totOb));
        self.getEl('cub_tot_dr').textContent = self.formatAmt(totDr);
        self.getEl('cub_tot_cr').textContent = self.formatAmt(totCr);
        self.getEl('cub_tot_cb').textContent = self.formatAmt(Math.abs(totCb));
        
        // Add Debit/Credit text to empty divs next to totals if needed, or update wrapper divs directly
        self.getEl('cub_tot_obs_wrap').textContent = totOb < 0 ? 'Credit' : 'Debit';
        self.getEl('cub_tot_cbs_wrap').textContent = totCb < 0 ? 'Credit' : 'Debit';

        setTimeout(() => self.alignTotals(), 50);

        const container = self.getEl('cub_table_container');
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
                        const dblclickEvent = new MouseEvent('dblclick', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        rows[activeIdx].dispatchEvent(dblclickEvent);
                    }
                }
            });
            window.addEventListener('resize', self.alignTotals);
        }
    },
    
    alignTotals: function() {
        const table = document.getElementById('cub_table');
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
        
        setWidth('cub_tot_label', ths[0].offsetWidth + ths[1].offsetWidth + ths[2].offsetWidth);
        setWidth('cub_tot_ob_wrap', ths[3].offsetWidth);
        setWidth('cub_tot_obs_wrap', ths[4].offsetWidth);
        setWidth('cub_tot_dr_wrap', ths[5].offsetWidth);
        setWidth('cub_tot_cr_wrap', ths[6].offsetWidth);
        setWidth('cub_tot_cb_wrap', ths[7].offsetWidth);
        setWidth('cub_tot_cbs_wrap', ths[8].offsetWidth);
        setWidth('cub_tot_end_wrap', ths[9].offsetWidth);
    },
    
    exportToExcel: function() {
        const self = window.CustomerBalancesModule;
        if (!self.currentData || self.currentData.length === 0) {
            alert('No data to export.');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Account Code,Account Name,Opening Balance,Status,Debit,Credit,Closing Balance,Status\r\n";
        
        self.currentData.forEach(row => {
            const ob = parseFloat(row.opening_balance || 0);
            const dr = parseFloat(row.debit || 0);
            const cr = parseFloat(row.credit || 0);
            const cb = parseFloat(row.closing_balance || 0);
            
            let rowData = [
                `"${row.account_code || ''}"`,
                `"${(row.account_name || '').replace(/"/g, '""')}"`,
                ob.toFixed(2),
                `"${row.ob_status || ''}"`,
                dr.toFixed(2),
                cr.toFixed(2),
                cb.toFixed(2),
                `"${row.cb_status || ''}"`
            ];
            csvContent += rowData.join(",") + "\r\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Customer_Balances_Report.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    printReport: function() {
        const self = window.CustomerBalancesModule;
        if(self.currentData.length === 0) {
            alert('No data to print. Please display the report first.');
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyName = session.company_name || 'SOFTIFYX TECHNOLOGIES';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        
        const fDate = self.getEl('cub_from_date').value;
        const tDate = self.getEl('cub_to_date').value;
        const periodStr = `Period: ${fDate} to ${tDate}`;

        let html = `<!DOCTYPE html><html><head><title>Customer Balances</title><base href="${baseUrl}">
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
            <div class="hdr-center"><h1>${companyName}</h1><h2>Customer Balances</h2><div>${periodStr}</div></div>
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

        let totOb = 0, totDr = 0, totCr = 0, totCb = 0;
        self.currentData.forEach(row => {
            const ob = parseFloat(row.opening_balance || 0);
            const dr = parseFloat(row.debit || 0);
            const cr = parseFloat(row.credit || 0);
            const cb = parseFloat(row.closing_balance || 0);
            
            const signedOb = row.ob_status === 'Credit' ? -ob : ob;
            totOb += signedOb;
            totDr += dr;
            totCr += cr;
            
            const signedCb = row.cb_status === 'Credit' ? -cb : cb;
            totCb += signedCb;
            
            html += `<tr>
                <td>${row.account_code || ''}</td>
                <td>${row.account_name || ''}</td>
                <td class="text-right">${self.formatAmt(ob)}</td>
                <td class="text-center">${row.ob_status || ''}</td>
                <td class="text-right">${self.formatAmt(dr)}</td>
                <td class="text-right">${self.formatAmt(cr)}</td>
                <td class="text-right">${self.formatAmt(cb)}</td>
                <td class="text-center">${row.cb_status || ''}</td>
            </tr>`;
        });
        
        html += `
            </tbody>
            <tfoot>
                <tr class="tot-row">
                    <td colspan="2" class="text-right">Totals:</td>
                    <td class="text-right">${self.formatAmt(Math.abs(totOb))}</td>
                    <td class="text-center">${totOb < 0 ? 'Credit' : 'Debit'}</td>
                    <td class="text-right">${self.formatAmt(totDr)}</td>
                    <td class="text-right">${self.formatAmt(totCr)}</td>
                    <td class="text-right">${self.formatAmt(Math.abs(totCb))}</td>
                    <td class="text-center">${totCb < 0 ? 'Credit' : 'Debit'}</td>
                </tr>
            </tfoot>
        </table>
        </body></html>`;
        
        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 800);
    }
};
