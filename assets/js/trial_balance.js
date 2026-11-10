window.TrialBalanceModule = (function() {
    let companyId = 1;
    if (typeof window.appData !== 'undefined' && window.appData.company_id) {
        companyId = window.appData.company_id;
    }

    const self = {
        getEl: id => document.getElementById(id),
        formatAmt: amt => parseFloat(amt || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
        formatStatus: function(balance, status) {
            let num = parseFloat(balance) || 0;
            if (Math.abs(num) < 0.001) return '<span style="color:black;font-weight:bold;">NIL</span>';
            if (status === 'Debit') return '<span style="color:red;font-weight:bold;">Debit</span>';
            if (status === 'Credit') return '<span style="color:green;font-weight:bold;">Credit</span>';
            return status || '';
        },
        getStatusText: function(balance, status) {
            let num = parseFloat(balance) || 0;
            if (Math.abs(num) < 0.001) return 'NIL';
            return status || '';
        },
        accounts: [],

        init: function() {
            self.bindEvents();
            self.setDefaultDates();
            self.loadMainTypes();
            self.fetchAccounts();
            self.setupSmartSearch();
            self.renderHeaders();
        },

        setDefaultDates: function() {
            const fd = self.getEl('tb_from_date');
            const td = self.getEl('tb_to_date');
            if(fd && td) {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                fd.value = `${y}-01-01`;
                td.value = `${y}-${m}-${d}`;
            }
        },

        bindEvents: function() {
            const radios = document.querySelectorAll('.tb-filter-radio[name="tb_filter"]');
            radios.forEach(r => {
                r.addEventListener('change', self.handleFilterChange);
            });
            
            const subTypeCheck = self.getEl('tb_sub_type_check');
            if(subTypeCheck) {
                subTypeCheck.addEventListener('change', () => {
                    const subSel = self.getEl('tb_sub_type');
                    if(subSel) subSel.disabled = !subTypeCheck.checked;
                });
            }
            
            const mainSel = self.getEl('tb_main_type');
            if(mainSel) {
                mainSel.addEventListener('change', () => self.loadSubTypes(mainSel.value));
            }
            
            const modeRadios = document.querySelectorAll('input[name="tb_mode"]');
            modeRadios.forEach(r => {
                r.addEventListener('change', () => {
                    self.renderHeaders();
                    if (self.currentData && self.currentData.length > 0) {
                        self.renderData(self.currentData, document.querySelector('input[name="tb_mode"]:checked').value);
                    } else {
                        self.getEl('tb_tbody').innerHTML = '';
                    }
                    self.alignTotals();
                });
            });

            const btnDisplay = self.getEl('tb_btn_display');
            if(btnDisplay) btnDisplay.addEventListener('click', self.fetchBalances);
            
            const btnPrint = self.getEl('tb_btn_print');
            if(btnPrint) btnPrint.addEventListener('click', self.printReport);
            
            const btnExcel = self.getEl('tb_btn_excel');
            if(btnExcel) btnExcel.addEventListener('click', self.exportExcel);
            
            const showZeroCheckbox = self.getEl('tb_show_zero_balance');
            if (showZeroCheckbox) {
                showZeroCheckbox.addEventListener('change', self.fetchBalances);
            }
        },

        handleFilterChange: function() {
            const val = document.querySelector('input[name="tb_filter"]:checked').value;
            
            self.getEl('tb_main_type').disabled = (val !== 'main');
            self.getEl('tb_sub_type_check').disabled = (val !== 'main');
            const check = self.getEl('tb_sub_type_check').checked;
            self.getEl('tb_sub_type').disabled = (val !== 'main' || !check);
            
            const rf = self.getEl('tb_range_from');
            const rfn = self.getEl('tb_range_from_name');
            const rt = self.getEl('tb_range_to');
            const rtn = self.getEl('tb_range_to_name');
            
            if(rf) rf.disabled = (val !== 'range');
            if(rfn) rfn.disabled = true; // Always read-only/disabled for name
            if(rt) rt.disabled = (val !== 'range');
            if(rtn) rtn.disabled = true;
        },

        fetchAccounts: async function() {
            try {
                const url = `api/account_ledger.php?action=get_accounts&company_id=${companyId}`;
                const r = await fetch(url);
                if(r.ok) {
                    const data = await r.json();
                    self.accounts = Array.isArray(data) ? data : [];
                }
            } catch(e) { console.error(e); }
        },

        setupSmartSearch: function() {
            self.setupSuggest('tb_range_from', 'tb_range_from_name', 'tb_range_from_suggest');
            self.setupSuggest('tb_range_to', 'tb_range_to_name', 'tb_range_to_suggest');
            
            // Document click to close suggests
            document.addEventListener('click', (e) => {
                if(!e.target.closest('.tb-suggest') && e.target.tagName !== 'INPUT') {
                    document.querySelectorAll('.tb-suggest').forEach(el => el.style.display = 'none');
                }
            });
        },

        setupSuggest: function(codeId, nameId, suggestId) {
            const inpCode = self.getEl(codeId);
            const inpName = self.getEl(nameId);
            const suggestBox = self.getEl(suggestId);
            let selectedIndex = -1;

            if(!inpCode || !inpName || !suggestBox) return;

            const renderSuggestions = (query) => {
                suggestBox.innerHTML = '';
                selectedIndex = -1;
                
                if(!query) {
                    suggestBox.style.display = 'none';
                    return;
                }
                
                const q = query.toLowerCase().trim();
                const matches = self.accounts.filter(a => 
                    (a.code && a.code.toLowerCase().includes(q)) || 
                    (a.name && a.name.toLowerCase().includes(q))
                ).slice(0, 50);
                
                if(matches.length === 0) {
                    suggestBox.style.display = 'none';
                    return;
                }
                
                matches.forEach((m, idx) => {
                    const div = document.createElement('div');
                    div.textContent = `${m.code} - ${m.name}`;
                    div.dataset.index = idx;
                    
                    div.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        inpCode.value = m.code;
                        inpName.value = m.name;
                        suggestBox.style.display = 'none';
                    });
                    suggestBox.appendChild(div);
                });
                
                suggestBox.style.display = 'block';
            };

            inpCode.addEventListener('input', () => {
                inpName.value = '';
                renderSuggestions(inpCode.value);
            });

            inpCode.addEventListener('focus', () => {
                if(inpCode.value) renderSuggestions(inpCode.value);
                else renderSuggestions(' ');
            });

            inpCode.addEventListener('keydown', (e) => {
                const items = suggestBox.querySelectorAll('div');
                if(!items.length || suggestBox.style.display === 'none') return;
                
                if(e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                    updateSelection();
                } else if(e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                    updateSelection();
                } else if(e.key === 'Enter' && selectedIndex > -1) {
                    e.preventDefault();
                    items[selectedIndex].dispatchEvent(new MouseEvent('mousedown'));
                }
                
                function updateSelection() {
                    items.forEach(el => el.style.background = '');
                    items.forEach(el => el.style.color = '');
                    if(selectedIndex > -1) {
                        const curTheme = window.getCurrentERPTheme ? window.getCurrentERPTheme() : null;
                        const themeColor = (curTheme && curTheme.primary) ? curTheme.primary : '#1F4E79';
                        items[selectedIndex].style.background = themeColor;
                        items[selectedIndex].style.color = '#fff';
                        items[selectedIndex].scrollIntoView({block: 'nearest'});
                    }
                }
            });
        },

        loadOptions: async function(url, elId) {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const d = await r.json();
                    const sel = self.getEl(elId);
                    if (sel) {
                        sel.innerHTML = '<option value="">--Select--</option>';
                        if(Array.isArray(d)) {
                            d.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                            d.forEach(item => {
                                let opt = document.createElement('option');
                                opt.value = item.id;
                                if (item.component) {
                                    opt.textContent = `${item.name} (${item.component})`;
                                } else {
                                    opt.textContent = `${item.name}`;
                                }
                                sel.appendChild(opt);
                            });
                        }
                    }
                }
            } catch(e) { console.error(e); }
        },

        loadMainTypes: function() {
            self.loadOptions(`api/maintain.php?action=get_coa_main&company_id=${companyId}`, 'tb_main_type');
        },

        loadSubTypes: function(mainId) {
            const sel = self.getEl('tb_sub_type');
            if(!sel) return;
            sel.innerHTML = '<option value="">--Select--</option>';
            if(!mainId) return;
            
            self.loadOptions(`api/maintain.php?action=get_coa_sub&main_id=${mainId}&company_id=${companyId}`, 'tb_sub_type');
        },

        renderHeaders: function() {
            const mode = document.querySelector('input[name="tb_mode"]:checked').value;
            const thead = self.getEl('tb_thead');
            const footer = self.getEl('tb_footer');
            if(!thead || !footer) return;
            
            let html = '<tr>';
            let fhtml = '<div class="tb-footer-label" id="tb_lbl_totals">Totals Rs.</div>';
            
            if(mode === '2') {
                html += `<th id="th_tb_code" style="width: 100px;">Account Code</th>
                         <th id="th_tb_name" style="text-align: left;">Account Name</th>
                         <th id="th_tb_dr" style="width: 120px;">Debit</th>
                         <th id="th_tb_cr" style="width: 120px;">Credit</th>`;
                
                fhtml += `<div id="tb_tot_dr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_dr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_cr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>`;
            } else if (mode === '4') {
                html += `<th id="th_tb_code" style="width: 90px;">Account Code</th>
                         <th id="th_tb_name" style="text-align: left;">Account Name</th>
                         <th id="th_tb_ob" style="width: 110px;">Opening Balance</th>
                         <th id="th_tb_ob_st" style="width: 50px;">Status</th>
                         <th id="th_tb_dr" style="width: 100px;">Debit</th>
                         <th id="th_tb_cr" style="width: 100px;">Credit</th>
                         <th id="th_tb_cb" style="width: 110px;">Closing Balance</th>
                         <th id="th_tb_cb_st" style="width: 50px;">Status</th>`;
                         
                fhtml += `<div id="tb_tot_ob_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_ob" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_ob_st_wrap" style="box-sizing: border-box; text-align: center; padding: 0 1px;"><div id="tb_tot_ob_st" style="display: inline-block; width: 100%; box-sizing: border-box; font-weight:normal;"></div></div>
                          <div id="tb_tot_dr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_dr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_cr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cb_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_cb" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cb_st_wrap" style="box-sizing: border-box; text-align: center; padding: 0 1px;"><div id="tb_tot_cb_st" style="display: inline-block; width: 100%; box-sizing: border-box; font-weight:normal;"></div></div>`;
            } else if (mode === '6') {
                html += `<th id="th_tb_code" style="width: 90px;">Account Code</th>
                         <th id="th_tb_name" style="text-align: left;">Account Name</th>
                         <th id="th_tb_ob_dr" style="width: 100px;">OB Debit</th>
                         <th id="th_tb_ob_cr" style="width: 100px;">OB Credit</th>
                         <th id="th_tb_dr" style="width: 100px;">Debit</th>
                         <th id="th_tb_cr" style="width: 100px;">Credit</th>
                         <th id="th_tb_cb_dr" style="width: 100px;">CB Debit</th>
                         <th id="th_tb_cb_cr" style="width: 100px;">CB Credit</th>`;
                         
                fhtml += `<div id="tb_tot_ob_dr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_ob_dr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_ob_cr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_ob_cr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_dr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_dr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_cr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cb_dr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_cb_dr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>
                          <div id="tb_tot_cb_cr_wrap" style="box-sizing: border-box; text-align: right; padding: 0 1px;"><div id="tb_tot_cb_cr" style="background: #fff; border: 1px solid #999; padding: 2px 4px; display: inline-block; width: 100%; box-sizing: border-box;">0.00</div></div>`;
            }
            html += '</tr>';
            thead.innerHTML = html;
            footer.innerHTML = fhtml;
            
            setTimeout(() => self.setupResizing(), 50);
            setTimeout(() => self.alignTotals(), 50);
        },

        fetchBalances: async function() {
            const filterType = document.querySelector('input[name="tb_filter"]:checked').value;
            const fromDate = self.getEl('tb_from_date').value;
            const toDate = self.getEl('tb_to_date').value;
            const mode = document.querySelector('input[name="tb_mode"]:checked').value;
            const showZero = self.getEl('tb_show_zero_balance') && self.getEl('tb_show_zero_balance').checked ? 1 : 0;
            
            let url = `api/trial_balance.php?action=get_balances&company_id=${companyId}&from_date=${fromDate}&to_date=${toDate}&filter_type=${filterType}&show_zero=${showZero}`;
            
            if(filterType === 'main') {
                const mid = self.getEl('tb_main_type').value;
                if(mid) url += `&main_id=${mid}`;
                if(self.getEl('tb_sub_type_check').checked) {
                    const sid = self.getEl('tb_sub_type').value;
                    if(sid) url += `&sub_id=${sid}`;
                }
            } else if(filterType === 'range') {
                const rf = self.getEl('tb_range_from').value;
                const rt = self.getEl('tb_range_to').value;
                if(rf && rt) url += `&range_from=${rf}&range_to=${rt}`;
            }
            
            self.getEl('tb_btn_display').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                const r = await fetch(url);
                if(r.ok) {
                    const res = await r.json();
                    if(res.balances) {
                        self.currentData = res.balances;
                        self.renderData(res.balances, mode);
                    }
                }
            } catch(err) {
                console.error(err);
            }
            self.getEl('tb_btn_display').innerHTML = 'Display';
        },

        renderData: function(data, mode) {
            const tbody = self.getEl('tb_tbody');
            if(!tbody) return;
            tbody.innerHTML = '';
            
            let totOb = 0, totDr = 0, totCr = 0, totCb = 0;
            let totObDr = 0, totObCr = 0, totCbDr = 0, totCbCr = 0;
            
            data.forEach(row => {
                let rOb = row.ob_status === 'Credit' ? -row.opening_balance : row.opening_balance;
                let rCb = row.cb_status === 'Credit' ? -row.closing_balance : row.closing_balance;
                
                totOb += rOb;
                totDr += row.debit;
                totCr += row.credit;
                totCb += rCb;
                
                let rObDr = row.ob_status === 'Debit' ? row.opening_balance : 0;
                let rObCr = row.ob_status === 'Credit' ? row.opening_balance : 0;
                let rCbDr = row.cb_status === 'Debit' ? row.closing_balance : 0;
                let rCbCr = row.cb_status === 'Credit' ? row.closing_balance : 0;

                totObDr += rObDr;
                totObCr += rObCr;
                totCbDr += rCbDr;
                totCbCr += rCbCr;

                const tr = document.createElement('tr');
                tr.tabIndex = 0;
                let html = `<td class="tb-text-center">${row.account_code}</td>
                            <td>${row.account_name}</td>`;
                            
                if(mode === '2') {
                    if(row.cb_status === 'Debit' && row.closing_balance > 0) {
                        html += `<td class="tb-text-right">${self.formatAmt(row.closing_balance)}</td>
                                 <td class="tb-text-right"></td>`;
                    } else if (row.cb_status === 'Credit' && row.closing_balance > 0) {
                        html += `<td class="tb-text-right"></td>
                                 <td class="tb-text-right">${self.formatAmt(row.closing_balance)}</td>`;
                    } else {
                        html += `<td class="tb-text-right">${self.formatAmt(0)}</td><td class="tb-text-right"></td>`;
                    }
                } else if(mode === '4') {
                    html += `<td class="tb-text-right">${self.formatAmt(row.opening_balance)}</td>
                             <td class="tb-text-center">${self.formatStatus(row.opening_balance, row.ob_status)}</td>
                             <td class="tb-text-right">${self.formatAmt(row.debit)}</td>
                             <td class="tb-text-right">${self.formatAmt(row.credit)}</td>
                             <td class="tb-text-right">${self.formatAmt(row.closing_balance)}</td>
                             <td class="tb-text-center">${self.formatStatus(row.closing_balance, row.cb_status)}</td>`;
                } else if(mode === '6') {
                    html += `<td class="tb-text-right">${self.formatAmt(rObDr)}</td>
                             <td class="tb-text-right">${self.formatAmt(rObCr)}</td>
                             <td class="tb-text-right">${self.formatAmt(row.debit)}</td>
                             <td class="tb-text-right">${self.formatAmt(row.credit)}</td>
                             <td class="tb-text-right">${self.formatAmt(rCbDr)}</td>
                             <td class="tb-text-right">${self.formatAmt(rCbCr)}</td>`;
                }
                tr.innerHTML = html;
                
                tr.addEventListener('click', () => {
                    const prev = tbody.querySelector('tr.selected');
                    if(prev) prev.classList.remove('selected');
                    tr.classList.add('selected');
                });
                
                tr.addEventListener('dblclick', () => {
                    if(window.hideAllDropdowns) window.hideAllDropdowns();
                    if(typeof openModularPopup === 'function') {
                        openModularPopup('Navigation/Reports/view_account_ledger.html', 'fa-book', 'Account Ledger', () => {
                            if(window.AccountLedgerModule) {
                                window.AccountLedgerModule.init();
                                setTimeout(() => {
                                    if (typeof window.AccountLedgerModule.selectAccount === 'function') {
                                        window.AccountLedgerModule.selectAccount(row.account_id, row.account_code, row.account_name);
                                    }
                                    if (typeof window.AccountLedgerModule.fetchLedger === 'function') {
                                        window.AccountLedgerModule.fetchLedger();
                                    }
                                }, 500);
                            }
                        }, 'View Account Ledger', true, true);
                    }
                });
                
                tbody.appendChild(tr);
            });
            
            if(mode === '2') {
                let sumDr = 0, sumCr = 0;
                data.forEach(row => {
                    if(row.cb_status === 'Debit' && row.closing_balance > 0) sumDr += row.closing_balance;
                    else if(row.cb_status === 'Credit' && row.closing_balance > 0) sumCr += row.closing_balance;
                });
                self.getEl('tb_tot_dr').textContent = self.formatAmt(sumDr);
                self.getEl('tb_tot_cr').textContent = self.formatAmt(sumCr);
            } else if(mode === '4') {
                self.getEl('tb_tot_ob').textContent = self.formatAmt(Math.abs(totOb));
                self.getEl('tb_tot_dr').textContent = self.formatAmt(totDr);
                self.getEl('tb_tot_cr').textContent = self.formatAmt(totCr);
                self.getEl('tb_tot_cb').textContent = self.formatAmt(Math.abs(totCb));
                
                self.getEl('tb_tot_ob_st').innerHTML = self.formatStatus(Math.abs(totOb), totOb < 0 ? 'Credit' : 'Debit');
                self.getEl('tb_tot_cb_st').innerHTML = self.formatStatus(Math.abs(totCb), totCb < 0 ? 'Credit' : 'Debit');
            } else if(mode === '6') {
                self.getEl('tb_tot_ob_dr').textContent = self.formatAmt(totObDr);
                self.getEl('tb_tot_ob_cr').textContent = self.formatAmt(totObCr);
                self.getEl('tb_tot_dr').textContent = self.formatAmt(totDr);
                self.getEl('tb_tot_cr').textContent = self.formatAmt(totCr);
                self.getEl('tb_tot_cb_dr').textContent = self.formatAmt(totCbDr);
                self.getEl('tb_tot_cb_cr').textContent = self.formatAmt(totCbCr);
            }
            
            setTimeout(() => self.alignTotals(), 50);
            self.setupKeyboardNav();
        },

        setupKeyboardNav: function() {
            const container = self.getEl('tb_table_container');
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
                    
                    const tbody = self.getEl('tb_tbody');
                    if(!tbody) return;
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
                            rows[activeIdx].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                        }
                    }
                });
                window.addEventListener('resize', self.alignTotals);
            }
        },

        alignTotals: function() {
            const table = document.getElementById('tb_table');
            if (!table) return;
            const ths = table.querySelectorAll('thead th');
            const mode = document.querySelector('input[name="tb_mode"]:checked').value;
            
            const setWidth = (id, width) => {
                const el = document.getElementById(id);
                if(el) {
                    el.style.width = width + 'px';
                    el.style.minWidth = width + 'px';
                    el.style.maxWidth = width + 'px';
                    el.style.flexShrink = '0';
                }
            };

            let lblW = 0;
            if (mode === '2') {
                if(ths.length < 4) return;
                lblW = ths[0].offsetWidth + ths[1].offsetWidth;
                setWidth('tb_lbl_totals', lblW);
                setWidth('tb_tot_dr_wrap', ths[2].offsetWidth);
                setWidth('tb_tot_cr_wrap', ths[3].offsetWidth);
            } else if (mode === '4') {
                if(ths.length < 8) return;
                lblW = ths[0].offsetWidth + ths[1].offsetWidth;
                setWidth('tb_lbl_totals', lblW);
                setWidth('tb_tot_ob_wrap', ths[2].offsetWidth);
                setWidth('tb_tot_ob_st_wrap', ths[3].offsetWidth);
                setWidth('tb_tot_dr_wrap', ths[4].offsetWidth);
                setWidth('tb_tot_cr_wrap', ths[5].offsetWidth);
                setWidth('tb_tot_cb_wrap', ths[6].offsetWidth);
                setWidth('tb_tot_cb_st_wrap', ths[7].offsetWidth);
            } else if (mode === '6') {
                if(ths.length < 8) return;
                lblW = ths[0].offsetWidth + ths[1].offsetWidth;
                setWidth('tb_lbl_totals', lblW);
                setWidth('tb_tot_ob_dr_wrap', ths[2].offsetWidth);
                setWidth('tb_tot_ob_cr_wrap', ths[3].offsetWidth);
                setWidth('tb_tot_dr_wrap', ths[4].offsetWidth);
                setWidth('tb_tot_cr_wrap', ths[5].offsetWidth);
                setWidth('tb_tot_cb_dr_wrap', ths[6].offsetWidth);
                setWidth('tb_tot_cb_cr_wrap', ths[7].offsetWidth);
            }
        },

        setupResizing: function() {
            const table = document.getElementById('tb_table');
            if (!table) return;
            const cols = table.querySelectorAll('thead th');
            
            cols.forEach(col => {
                const resizer = document.createElement('div');
                resizer.style.width = '5px';
                resizer.style.height = '100%';
                resizer.style.position = 'absolute';
                resizer.style.right = '0';
                resizer.style.top = '0';
                resizer.style.cursor = 'col-resize';
                resizer.style.zIndex = '1';
                col.appendChild(resizer);
                
                let x = 0;
                let w = 0;
                
                const md = function(e) {
                    x = e.clientX;
                    const style = window.getComputedStyle(col);
                    w = parseInt(style.width, 10);
                    document.addEventListener('mousemove', mm);
                    document.addEventListener('mouseup', mu);
                };
                
                const mm = function(e) {
                    const dx = e.clientX - x;
                    col.style.width = (w + dx) + 'px';
                    col.style.minWidth = (w + dx) + 'px';
                    self.alignTotals();
                };
                
                const mu = function() {
                    document.removeEventListener('mousemove', mm);
                    document.removeEventListener('mouseup', mu);
                };
                
                resizer.addEventListener('mousedown', md);
            });
        },

        printReport: function() {
            if(!self.currentData || self.currentData.length === 0) {
                alert('No data to print. Please display the report first.');
                return;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyName = session.company_name || 'SOFTIFYX TECHNOLOGIES';
            const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            
            const fDate = self.getEl('tb_from_date').value;
            const tDate = self.getEl('tb_to_date').value;
            const periodStr = `Period: ${fDate} to ${tDate}`;
            const mode = document.querySelector('input[name="tb_mode"]:checked').value;

            let html = `<!DOCTYPE html><html><head><title>Trial Balance</title><base href="${baseUrl}">
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
                <div class="hdr-center"><h1>${companyName}</h1><h2>Trial Balance</h2><div>${periodStr}</div></div>
                <div class="hdr-right"></div>
            </div>`;

            html += `
            <table>
                <thead>
                    <tr>`;
            
            if (mode === '2') {
                html += `<th style="width:100px;">Account Code</th>
                         <th style="text-align:left;">Account Name</th>
                         <th class="text-right" style="width:120px;">Debit</th>
                         <th class="text-right" style="width:120px;">Credit</th>`;
            } else if (mode === '4') {
                html += `<th style="width:90px;">Account Code</th>
                         <th style="text-align:left;">Account Name</th>
                         <th class="text-right" style="width:110px;">Opening Balance</th>
                         <th class="text-center" style="width:50px;">Status</th>
                         <th class="text-right" style="width:100px;">Debit</th>
                         <th class="text-right" style="width:100px;">Credit</th>
                         <th class="text-right" style="width:110px;">Closing Balance</th>
                         <th class="text-center" style="width:50px;">Status</th>`;
            } else if (mode === '6') {
                html += `<th style="width:90px;">Account Code</th>
                         <th style="text-align:left;">Account Name</th>
                         <th class="text-right" style="width:100px;">OB Debit</th>
                         <th class="text-right" style="width:100px;">OB Credit</th>
                         <th class="text-right" style="width:100px;">Debit</th>
                         <th class="text-right" style="width:100px;">Credit</th>
                         <th class="text-right" style="width:100px;">CB Debit</th>
                         <th class="text-right" style="width:100px;">CB Credit</th>`;
            }
            html += `</tr></thead><tbody>`;

            let totOb = 0, totDr = 0, totCr = 0, totCb = 0;
            let totObDr = 0, totObCr = 0, totCbDr = 0, totCbCr = 0;
            self.currentData.forEach(row => {
                let rOb = row.ob_status === 'Credit' ? -row.opening_balance : row.opening_balance;
                let rCb = row.cb_status === 'Credit' ? -row.closing_balance : row.closing_balance;
                
                totOb += rOb;
                totDr += row.debit;
                totCr += row.credit;
                totCb += rCb;
                
                let rObDr = row.ob_status === 'Debit' ? row.opening_balance : 0;
                let rObCr = row.ob_status === 'Credit' ? row.opening_balance : 0;
                let rCbDr = row.cb_status === 'Debit' ? row.closing_balance : 0;
                let rCbCr = row.cb_status === 'Credit' ? row.closing_balance : 0;

                totObDr += rObDr;
                totObCr += rObCr;
                totCbDr += rCbDr;
                totCbCr += rCbCr;
                
                html += `<tr>
                    <td class="text-center">${row.account_code || ''}</td>
                    <td>${row.account_name || ''}</td>`;
                
                if (mode === '2') {
                    if(row.cb_status === 'Debit' && row.closing_balance > 0) {
                        html += `<td class="text-right">${self.formatAmt(row.closing_balance)}</td><td class="text-right"></td>`;
                    } else if (row.cb_status === 'Credit' && row.closing_balance > 0) {
                        html += `<td class="text-right"></td><td class="text-right">${self.formatAmt(row.closing_balance)}</td>`;
                    } else {
                        html += `<td class="text-right">${self.formatAmt(0)}</td><td class="text-right"></td>`;
                    }
                } else if (mode === '4') {
                    html += `<td class="text-right">${self.formatAmt(row.opening_balance)}</td>
                             <td class="text-center">${self.formatStatus(row.opening_balance, row.ob_status)}</td>
                             <td class="text-right">${self.formatAmt(row.debit)}</td>
                             <td class="text-right">${self.formatAmt(row.credit)}</td>
                             <td class="text-right">${self.formatAmt(row.closing_balance)}</td>
                             <td class="text-center">${self.formatStatus(row.closing_balance, row.cb_status)}</td>`;
                } else if (mode === '6') {
                    html += `<td class="text-right">${self.formatAmt(rObDr)}</td>
                             <td class="text-right">${self.formatAmt(rObCr)}</td>
                             <td class="text-right">${self.formatAmt(row.debit)}</td>
                             <td class="text-right">${self.formatAmt(row.credit)}</td>
                             <td class="text-right">${self.formatAmt(rCbDr)}</td>
                             <td class="text-right">${self.formatAmt(rCbCr)}</td>`;
                }
                html += `</tr>`;
            });
            
            html += `</tbody><tfoot><tr class="tot-row">
                <td colspan="2" class="text-right">Totals Rs.</td>`;
            if (mode === '2') {
                let sumDr = 0, sumCr = 0;
                self.currentData.forEach(row => {
                    if(row.cb_status === 'Debit' && row.closing_balance > 0) sumDr += row.closing_balance;
                    else if(row.cb_status === 'Credit' && row.closing_balance > 0) sumCr += row.closing_balance;
                });
                html += `<td class="text-right">${self.formatAmt(sumDr)}</td>
                         <td class="text-right">${self.formatAmt(sumCr)}</td>`;
            } else if (mode === '4') {
                html += `<td class="text-right">${self.formatAmt(Math.abs(totOb))}</td>
                         <td class="text-center">${self.formatStatus(Math.abs(totOb), totOb < 0 ? 'Credit' : 'Debit')}</td>
                         <td class="text-right">${self.formatAmt(totDr)}</td>
                         <td class="text-right">${self.formatAmt(totCr)}</td>
                         <td class="text-right">${self.formatAmt(Math.abs(totCb))}</td>
                         <td class="text-center">${self.formatStatus(Math.abs(totCb), totCb < 0 ? 'Credit' : 'Debit')}</td>`;
            } else if (mode === '6') {
                html += `<td class="text-right">${self.formatAmt(totObDr)}</td>
                         <td class="text-right">${self.formatAmt(totObCr)}</td>
                         <td class="text-right">${self.formatAmt(totDr)}</td>
                         <td class="text-right">${self.formatAmt(totCr)}</td>
                         <td class="text-right">${self.formatAmt(totCbDr)}</td>
                         <td class="text-right">${self.formatAmt(totCbCr)}</td>`;
            }
            html += `</tr></tfoot></table></body></html>`;

            const printWindow = window.open('', '_blank', 'width=1000,height=700');
            if(printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => { printWindow.print(); }, 500);
            }
        },

        exportExcel: function() {
            if(!self.currentData || self.currentData.length === 0) {
                alert('No data to export.');
                return;
            }
            const mode = document.querySelector('input[name="tb_mode"]:checked').value;
            let csv = '';
            
            if (mode === '2') {
                csv += 'Account Code,Account Name,Debit,Credit\n';
            } else if (mode === '4') {
                csv += 'Account Code,Account Name,Opening Balance,Status,Debit,Credit,Closing Balance,Status\n';
            } else if (mode === '6') {
                csv += 'Account Code,Account Name,OB Debit,OB Credit,Debit,Credit,CB Debit,CB Credit\n';
            }
            
            let totOb = 0, totDr = 0, totCr = 0, totCb = 0;
            let totObDr = 0, totObCr = 0, totCbDr = 0, totCbCr = 0;
            self.currentData.forEach(row => {
                let rOb = row.ob_status === 'Credit' ? -row.opening_balance : row.opening_balance;
                let rCb = row.cb_status === 'Credit' ? -row.closing_balance : row.closing_balance;
                
                totOb += rOb;
                totDr += row.debit;
                totCr += row.credit;
                totCb += rCb;
                
                let rObDr = row.ob_status === 'Debit' ? row.opening_balance : 0;
                let rObCr = row.ob_status === 'Credit' ? row.opening_balance : 0;
                let rCbDr = row.cb_status === 'Debit' ? row.closing_balance : 0;
                let rCbCr = row.cb_status === 'Credit' ? row.closing_balance : 0;

                totObDr += rObDr;
                totObCr += rObCr;
                totCbDr += rCbDr;
                totCbCr += rCbCr;
                
                const code = (row.account_code || '').toString().replace(/,/g, '');
                const name = (row.account_name || '').toString().replace(/,/g, ' ');
                
                if (mode === '2') {
                    let dr = 0, cr = 0;
                    if(row.cb_status === 'Debit' && row.closing_balance > 0) dr = row.closing_balance;
                    else if (row.cb_status === 'Credit' && row.closing_balance > 0) cr = row.closing_balance;
                    csv += `${code},${name},${dr},${cr}\n`;
                } else if (mode === '4') {
                    csv += `${code},${name},${row.opening_balance},${self.getStatusText(row.opening_balance, row.ob_status)},${row.debit},${row.credit},${row.closing_balance},${self.getStatusText(row.closing_balance, row.cb_status)}\n`;
                } else if (mode === '6') {
                    csv += `${code},${name},${rObDr},${rObCr},${row.debit},${row.credit},${rCbDr},${rCbCr}\n`;
                }
            });
            
            if (mode === '2') {
                let sumDr = 0, sumCr = 0;
                self.currentData.forEach(row => {
                    if(row.cb_status === 'Debit' && row.closing_balance > 0) sumDr += row.closing_balance;
                    else if(row.cb_status === 'Credit' && row.closing_balance > 0) sumCr += row.closing_balance;
                });
                csv += `,,${sumDr},${sumCr}\n`;
            } else if (mode === '4') {
                csv += `,,${Math.abs(totOb)},${self.getStatusText(Math.abs(totOb), totOb < 0 ? 'Credit' : 'Debit')},${totDr},${totCr},${Math.abs(totCb)},${self.getStatusText(Math.abs(totCb), totCb < 0 ? 'Credit' : 'Debit')}\n`;
            } else if (mode === '6') {
                csv += `,,${totObDr},${totObCr},${totDr},${totCr},${totCbDr},${totCbCr}\n`;
            }
            
            const link = document.createElement('a');
            link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
            link.download = `Trial_Balance_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
    
    return self;
})();
