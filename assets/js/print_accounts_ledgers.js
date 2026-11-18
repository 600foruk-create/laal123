window.PrintAccountsLedgersModule = {
    isInitialized: false,
    mainAccs: [],
    subAccs: [],
    accounts: [],

    getEl: function(id) { return document.getElementById(id); },

    init: async function() {
        if(this.isInitialized) return;
        this.isInitialized = true;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        window.currentCompanyId = session.company_id || 1;

        this.setDefaultDates();
        this.bindEvents();
        await this.fetchLookupData();
        this.setupSmartSearch();
    },

    setDefaultDates: function() {
        const today = new Date().toISOString().split('T')[0];
        const fd = this.getEl('pal_from_date');
        const td = this.getEl('pal_to_date');
        if(fd) fd.value = today;
        if(td) td.value = today;
    },

    fetchLookupData: async function() {
        const self = this;
        const cId = window.currentCompanyId;
        
        try {
            // Fetch Accounts
            if (self.accounts.length === 0) {
                const res = await fetch(`api/account_ledger.php?action=get_accounts&company_id=${cId}`);
                if (res.ok) {
                    const data = await res.json();
                    if(Array.isArray(data)) self.accounts = data;
                }
            }
            
            // Fetch Main Accounts
            if (self.mainAccs.length === 0) {
                const res = await fetch(`api/maintain.php?action=get_coa_main&company_id=${cId}`);
                if (res.ok) {
                    const data = await res.json();
                    if(Array.isArray(data)) self.mainAccs = data;
                }
            }

            // Fetch Sub Accounts
            if (self.subAccs.length === 0) {
                const res = await fetch(`api/maintain.php?action=get_coa_sub&main_id=ALL&company_id=${cId}`);
                if (res.ok) {
                    const data = await res.json();
                    if(Array.isArray(data)) self.subAccs = data;
                }
            }
            
            self.populateDropdowns();
        } catch(e) {
            console.error('Lookup fetch error:', e);
        }
    },

    populateDropdowns: function() {
        const self = this;
        self.setupDropdown('pal_main_acc', 'pal_main_acc_val', 'pal_main_acc_suggest', () => self.mainAccs, (m) => {
            self.getEl('pal_sub_acc').value = '';
            self.getEl('pal_sub_acc_val').value = '';
        });
        self.setupDropdown('pal_sub_acc', 'pal_sub_acc_val', 'pal_sub_acc_suggest', () => {
            const mId = self.getEl('pal_main_acc_val').value;
            return self.subAccs.filter(s => !mId || s.main_id == mId);
        });
    },

    setupDropdown: function(inputId, valId, suggestId, getList, onSelect) {
        const inp = this.getEl(inputId);
        const val = this.getEl(valId);
        const suggest = this.getEl(suggestId);
        if(!inp || !suggest) return;

        inp.addEventListener('click', () => {
            if(inp.disabled) return;
            suggest.innerHTML = '';
            const list = getList();
            if(!list.length) {
                suggest.style.display = 'none';
                return;
            }
            list.forEach(m => {
                const div = document.createElement('div');
                div.textContent = `${m.code} - ${m.name}`;
                div.onmousedown = (e) => {
                    e.preventDefault();
                    inp.value = div.textContent;
                    val.value = m.id;
                    suggest.style.display = 'none';
                    if(onSelect) onSelect(m);
                };
                suggest.appendChild(div);
            });
            suggest.style.display = 'block';
        });
    },

    bindEvents: function() {
        const self = this;
        
        // Radio toggles
        const radios = document.querySelectorAll('input[name="pal_type"]');
        radios.forEach(r => {
            r.addEventListener('change', () => self.toggleInputs());
        });
        
        const chkSub = self.getEl('pal_use_sub');
        if(chkSub) {
            chkSub.addEventListener('change', () => self.toggleInputs());
        }
        
        const chkPeriod = self.getEl('pal_use_period');
        if(chkPeriod) {
            chkPeriod.addEventListener('change', () => self.toggleInputs());
        }
        
        // mSel change event removed as filtering is handled inside setupDropdown
        
        const btnPrint = self.getEl('pal_btn_print');
        if(btnPrint) {
            btnPrint.addEventListener('click', () => self.printLedgers());
        }
        
        // Document click to close suggests
        document.addEventListener('click', (e) => {
            if(!e.target.closest('.pal-suggest') && e.target.tagName !== 'INPUT') {
                document.querySelectorAll('.pal-suggest').forEach(el => el.style.display = 'none');
            }
        });
    },

    toggleInputs: function() {
        const self = this;
        const type = document.querySelector('input[name="pal_type"]:checked').value;
        
        const mainSel = self.getEl('pal_main_acc');
        const useSub = self.getEl('pal_use_sub');
        const subSel = self.getEl('pal_sub_acc');
        
        const fCode = self.getEl('pal_from_code');
        const fName = self.getEl('pal_from_name');
        const tCode = self.getEl('pal_to_code');
        const tName = self.getEl('pal_to_name');
        
        const usePeriod = self.getEl('pal_use_period');
        const fDate = self.getEl('pal_from_date');
        const tDate = self.getEl('pal_to_date');
        
        mainSel.disabled = (type !== 'main');
        useSub.disabled = (type !== 'main');
        subSel.disabled = (type !== 'main' || !useSub.checked);
        
        fCode.disabled = (type !== 'range');
        tCode.disabled = (type !== 'range');
        // Names are always disabled (readonly display)
        
        fDate.disabled = !usePeriod.checked;
        tDate.disabled = !usePeriod.checked;
        
        // Clear inputs if disabled
        if(type !== 'main') {
            mainSel.value = '';
            if(self.getEl('pal_main_acc_val')) self.getEl('pal_main_acc_val').value = '';
            useSub.checked = false;
            subSel.value = '';
            if(self.getEl('pal_sub_acc_val')) self.getEl('pal_sub_acc_val').value = '';
        }
        
        if(type !== 'range') {
            fCode.value = '';
            fName.value = '';
            tCode.value = '';
            tName.value = '';
        }
    },

    setupSmartSearch: function() {
        const self = this;
        self.setupSuggest('pal_from_code', 'pal_from_name', 'pal_from_suggest');
        self.setupSuggest('pal_to_code', 'pal_to_name', 'pal_to_suggest');
    },

    setupSuggest: function(codeId, nameId, suggestId) {
        const self = this;
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
            
            const q = query.toLowerCase();
            const matches = self.accounts.filter(a => 
                (a.code && a.code.toLowerCase().includes(q)) || 
                (a.name && a.name.toLowerCase().includes(q))
            ).slice(0, 50); // limit to 50
            
            if(matches.length === 0) {
                suggestBox.style.display = 'none';
                return;
            }
            
            matches.forEach((m, idx) => {
                const div = document.createElement('div');
                div.textContent = `${m.code} - ${m.name}`;
                div.dataset.index = idx;
                div.onmousedown = (e) => { // mousedown fires before blur
                    e.preventDefault();
                    inpCode.value = m.code;
                    inpName.value = m.name;
                    suggestBox.style.display = 'none';
                };
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
            else renderSuggestions(' '); // show all/top 50
        });

        inpCode.addEventListener('keydown', (e) => {
            const items = suggestBox.querySelectorAll('div');
            if(!items.length || suggestBox.style.display === 'none') return;
            
            if(e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection(items);
            } else if(e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection(items);
            } else if(e.key === 'Enter') {
                e.preventDefault();
                if(selectedIndex >= 0) {
                    items[selectedIndex].onmousedown(new MouseEvent('mousedown'));
                }
            }
        });

        const updateSelection = (items) => {
            items.forEach((item, idx) => {
                if(idx === selectedIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({block: 'nearest'});
                } else {
                    item.classList.remove('active');
                }
            });
        };
    },

    printLedgers: async function() {
        const self = this;
        const type = document.querySelector('input[name="pal_type"]:checked').value;
        const isNewPage = self.getEl('pal_new_page') && self.getEl('pal_new_page').checked;
        const usePeriod = self.getEl('pal_use_period') && self.getEl('pal_use_period').checked;
        
        let params = new URLSearchParams({
            action: 'get_bulk_ledgers',
            company_id: window.currentCompanyId,
            type: type
        });

        if(type === 'main') {
            const m = self.getEl('pal_main_acc_val').value;
            if(!m) return alert('Please select Main Account Type');
            params.append('main_id', m);
            if(self.getEl('pal_use_sub').checked) {
                const s = self.getEl('pal_sub_acc_val').value;
                if(!s) return alert('Please select Sub Type');
                params.append('sub_id', s);
            }
        } else if (type === 'range') {
            const fCode = self.getEl('pal_from_code').value;
            const tCode = self.getEl('pal_to_code').value;
            if(!fCode || !tCode) return alert('Please select From and To accounts');
            params.append('from_code', fCode);
            params.append('to_code', tCode);
        }

        if(usePeriod) {
            params.append('from_date', self.getEl('pal_from_date').value);
            params.append('to_date', self.getEl('pal_to_date').value);
        }

        const btn = self.getEl('pal_btn_print');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = 'Loading...';
        btn.disabled = true;

        try {
            const res = await fetch(`api/print_accounts_ledgers.php?${params.toString()}`);
            if(!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            
            if(data.error) {
                alert('Error: ' + data.error);
                return;
            }

            if(!data.ledgers || data.ledgers.length === 0) {
                alert('No ledgers found for the selected criteria.');
                return;
            }

            self.renderPrintWindow(data.ledgers, isNewPage, usePeriod);
        } catch(e) {
            alert('Failed to fetch ledgers: ' + e.message);
            console.error(e);
        } finally {
            btn.innerHTML = oldHtml;
            btn.disabled = false;
        }
    },

    renderPrintWindow: function(ledgers, isNewPage, usePeriod) {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyName = session.company_name || 'L S ENGINEERING HUB';
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        
        let fDate = usePeriod ? self.getEl('pal_from_date').value : '';
        let tDate = usePeriod ? self.getEl('pal_to_date').value : '';
        const periodStr = (fDate && tDate) ? `Period: ${fDate} to ${tDate}` : '';

        const formatAmtZero = amt => parseFloat(amt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        const formatAmt = amt => {
            const val = parseFloat(amt || 0);
            return val === 0 ? '' : formatAmtZero(val);
        };

        let html = `<!DOCTYPE html><html><head><title>Accounts Ledgers</title><base href="${baseUrl}">
        <style>
            @page { margin: 0.5cm; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            .acc-info { margin-bottom: 10px; width: 100%; font-size: 13px; font-weight:bold; }
            table.data-table {width:100%;border-collapse:collapse;margin-bottom:30px;}
            table.data-table th, table.data-table td{border:1px solid #ccc;padding:4px 6px}
            table.data-table th{background:#f0f0f0;font-weight:bold;text-align:center;}
            .page-break { page-break-after: always; }
        </style></head><body>`;

        ledgers.forEach((ledger, index) => {
            html += `
            <div class="hdr">
                <div class="hdr-left"><img src="${actualLogo}" style="max-height:60px;"></div>
                <div class="hdr-center"><h1>${companyName}</h1><h2>Account Ledger</h2><div>${periodStr}</div></div>
                <div class="hdr-right"></div>
            </div>
            <div class="acc-info">
                Account: ${ledger.account_code} - ${ledger.account_name}
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:70px;">Date</th>
                        <th style="width:70px;">Tran. No.</th>
                        <th style="width:100px;">Account Code</th>
                        <th>Account Name</th>
                        <th>Description</th>
                        <th style="width:80px;">Debit</th>
                        <th style="width:80px;">Credit</th>
                        <th style="width:100px;">Balance</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background:#fdfdfd;font-style:italic;">
                        <td colspan="5" style="text-align:right;">Opening Balance</td>
                        <td style="text-align:right;">${ledger.opening_balance > 0 ? formatAmt(ledger.opening_balance) : ''}</td>
                        <td style="text-align:right;">${ledger.opening_balance < 0 ? formatAmt(Math.abs(ledger.opening_balance)) : ''}</td>
                        <td style="text-align:right;">${formatAmtZero(ledger.opening_balance)} ${ledger.opening_balance < 0 ? 'CR' : (ledger.opening_balance > 0 ? 'DR' : '')}</td>
                    </tr>`;
            
            let bal = parseFloat(ledger.opening_balance || 0);
            let totD = 0, totC = 0;
            
            if (ledger.transactions && ledger.transactions.length > 0) {
                ledger.transactions.forEach(tx => {
                    const d = parseFloat(tx.debit || 0);
                    const c = parseFloat(tx.credit || 0);
                    totD += d;
                    totC += c;
                    bal += (d - c);
                    
                    html += `<tr>
                        <td>${tx.date || ''}</td>
                        <td>${tx.tran_no || ''}</td>
                        <td>${tx.cross_code || ''}</td>
                        <td>${tx.cross_name || ''}</td>
                        <td>${tx.description || ''}</td>
                        <td style="text-align:right;">${formatAmt(d)}</td>
                        <td style="text-align:right;">${formatAmt(c)}</td>
                        <td style="text-align:right;font-weight:bold;">${formatAmtZero(Math.abs(bal))} ${bal < 0 ? 'CR' : (bal > 0 ? 'DR' : '')}</td>
                    </tr>`;
                });
            } else {
                html += `<tr><td colspan="8" style="text-align:center;color:#666;font-style:italic;">No transactions in this period.</td></tr>`;
            }
            
            html += `<tr style="background:#f0f0f0; font-weight:bold;">
                        <td colspan="5" style="text-align:right;">Totals</td>
                        <td style="text-align:right;">${formatAmtZero(totD)}</td>
                        <td style="text-align:right;">${formatAmtZero(totC)}</td>
                        <td style="text-align:right;color:#000;">${formatAmtZero(Math.abs(bal))} ${bal < 0 ? 'CR' : (bal > 0 ? 'DR' : '')}</td>
                    </tr>
                </tbody>
            </table>`;
            
            if(isNewPage && index < ledgers.length - 1) {
                html += `<div class="page-break"></div>`;
            }
        });

        html += `</body></html>`;
        
        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 800);
    }
};
