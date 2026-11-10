window.AccountLedgerModule = {
    accounts: [],
    currentLedgerData: [],
    currentAccount: null,
    highlightIndex: -1,
    keydownBound: false,

    init: async function() {
        if (!this.keydownBound) {
            if (window.alKeydownHandler) {
                window.removeEventListener('keydown', window.alKeydownHandler);
            }
            window.alKeydownHandler = (e) => {
                if (document.querySelector('.modal-overlay.active') || document.querySelector('.modal.active')) return;
                
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
                
                const tbody = document.getElementById('ledger-table-body');
                if (!tbody || tbody.offsetParent === null) return;
                
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const rows = Array.from(tbody.querySelectorAll('tr'));
                    if (rows.length === 0) return;
                    
                    let currentIdx = rows.findIndex(r => r.classList.contains('selected-row'));
                    if (currentIdx === -1 && tbody.dataset.currentIdx !== undefined) {
                        currentIdx = parseInt(tbody.dataset.currentIdx, 10);
                        if (isNaN(currentIdx) || currentIdx >= rows.length) currentIdx = -1;
                    }
                    
                    let nextIdx = -1;
                    
                    if (e.key === 'ArrowDown') {
                        if (currentIdx === -1) {
                            const container = tbody.closest('div');
                            if (container) {
                                const containerTop = container.getBoundingClientRect().top;
                                nextIdx = rows.findIndex(r => r.getBoundingClientRect().top >= containerTop - 10);
                                if (nextIdx === -1) nextIdx = 0;
                            } else {
                                nextIdx = 0;
                            }
                        } else {
                            nextIdx = Math.min(currentIdx + 1, rows.length - 1);
                        }
                    } else if (e.key === 'ArrowUp') {
                        if (currentIdx === -1) {
                            const container = tbody.closest('div');
                            if (container) {
                                const containerBottom = container.getBoundingClientRect().bottom;
                                const reversed = [...rows].reverse();
                                const found = reversed.findIndex(r => r.getBoundingClientRect().bottom <= containerBottom + 10);
                                nextIdx = found !== -1 ? rows.length - 1 - found : rows.length - 1;
                            } else {
                                nextIdx = rows.length - 1;
                            }
                        } else {
                            nextIdx = Math.max(currentIdx - 1, 0);
                        }
                    }

                    if (nextIdx !== -1 && nextIdx !== currentIdx) {
                        // Deselect current
                        if (currentIdx !== -1) {
                            const curr = rows[currentIdx];
                            curr.style.backgroundColor = (currentIdx % 2 === 0) ? '#fff' : '#fafafa';
                            curr.style.color = '';
                            curr.style.fontWeight = '';
                            curr.classList.remove('selected-row');
                        }

                        // Select next
                        const next = rows[nextIdx];
                        next.style.backgroundColor = '#1f4668';
                        next.style.color = '#fff';
                        next.style.fontWeight = 'bold';
                        next.classList.add('selected-row');
                        
                        tbody.dataset.currentIdx = nextIdx;
                        
                        // Custom scroll to avoid window jumping
                        const container = tbody.closest('div');
                        if (container) {
                            const rRect = next.getBoundingClientRect();
                            const cRect = container.getBoundingClientRect();

                            const stickyHeaderHeight = 40; // account for thead
                            const stickyFooterHeight = 45; // account for tfoot

                            if (rRect.top < cRect.top + stickyHeaderHeight) {
                                container.scrollTop -= (cRect.top + stickyHeaderHeight - rRect.top);
                            } else if (rRect.bottom > cRect.bottom - stickyFooterHeight) {
                                container.scrollTop += (rRect.bottom - (cRect.bottom - stickyFooterHeight));
                            }
                        }

                        // Update Label
                        const ref = next.dataset.txRef || '';
                        const sType = next.dataset.sourceType || '';
                        const label = document.getElementById('ledger-account-code-label');
                        if (label) {
                            if (!label.dataset.account) label.dataset.account = label.textContent;
                            let title = sType;
                            // Basic mapping for title just for display
                            if(sType === 'SI') title = 'Sale Invoice';
                            else if(sType === 'SR') title = 'Sale Return';
                            else if(sType === 'PI') title = 'Purchase Invoice';
                            else if(sType === 'PR') title = 'Purchase Return';
                            else if(sType === 'CP') title = 'Cash Payment';
                            else if(sType === 'BP') title = 'Bank Payment';
                            else if(sType === 'CR') title = 'Cash Receipt';
                            else if(sType === 'BR') title = 'Bank Receipt';
                            else if(sType === 'JV') title = 'General Journal';
                            
                            const desc = next.children[4] ? next.children[4].textContent : '';
                            label.innerHTML = `<span style="color:#fff; background:#1f4668; padding:2px 8px; border-radius:3px;">${ref} &nbsp;|&nbsp; ${title} &nbsp;|&nbsp; ${desc}</span>`;
                        }
                    }
                }
            };
            window.addEventListener('keydown', window.alKeydownHandler);
            this.keydownBound = true;
        }

        console.log('Account Ledger Module Initialized');
        const today = new Date().toISOString().split('T')[0];
        const fromEl = document.getElementById('ledger-from-date');
        const toEl = document.getElementById('ledger-to-date');
        if (fromEl) fromEl.value = today;
        if (toEl) toEl.value = today;

        const mFromEl = document.getElementById('multi_from_date');
        const mToEl = document.getElementById('multi_to_date');
        if (mFromEl) mFromEl.value = today;
        if (mToEl) mToEl.value = today;

        await this.loadAccounts();
        await this.loadMainAccounts();

        setTimeout(() => {
            const searchInput = document.getElementById('ledger-account-search');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }, 100);
    },

    loadAccounts: async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/account_ledger.php?action=get_accounts&company_id=${companyId}`);
            if (res.ok) {
                this.accounts = await res.json();
            }
        } catch (error) {
            console.error('Failed to load accounts:', error);
        }
    },

    loadMainAccounts: async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/maintain.php?action=get_coa_main&company_id=${companyId}`);
            if (res.ok) {
                const mains = await res.json();
                const sel = document.getElementById('multi_main_account');
                if (!sel) return;
                sel.innerHTML = '<option value="">-- Select Main Account --</option>';
                mains.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = `${m.code} - ${m.name}`;
                    sel.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Failed to load main accounts:', e);
        }
    },

    loadSubAccounts: async function() {
        const mainSel = document.getElementById('multi_main_account');
        const subSel = document.getElementById('multi_sub_account');
        const subCheck = document.getElementById('multi_sub_type');
        if (!mainSel || !subSel) return;

        const mainId = mainSel.value;
        subSel.innerHTML = '<option value="">-- Select Sub Account --</option>';

        if (!mainId) {
            subCheck.checked = false;
            subCheck.disabled = true;
            subSel.disabled = true;
            return;
        }

        subCheck.disabled = false;

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/maintain.php?action=get_coa_sub&main_id=${mainId}&company_id=${companyId}`);
            if (res.ok) {
                const subs = await res.json();
                subs.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `${s.code} - ${s.name}`;
                    subSel.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Failed to load sub accounts:', e);
        }
    },

    toggleSubAccount: function() {
        const checked = document.getElementById('multi_sub_type').checked;
        const subSel = document.getElementById('multi_sub_account');
        if (subSel) subSel.disabled = !checked;
    },

    // =================== SMART SEARCH BOX ===================
    filterAccounts: function(query) {
        const dropdown = document.getElementById('ledger-account-dropdown');
        if (!dropdown) return;

        this.highlightIndex = -1;
        const q = (query || '').toLowerCase().trim();
        const filtered = q.length === 0
            ? this.accounts.slice(0, 50)
            : this.accounts.filter(a =>
                a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
              ).slice(0, 50);

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="ledger-dropdown-item" style="color:#999;">No results found</div>';
        } else {
            dropdown.innerHTML = filtered.map((a, i) =>
                `<div class="ledger-dropdown-item" data-id="${a.id}" data-name="${a.name}" data-code="${a.code}"
                    onmousedown="window.AccountLedgerModule.selectAccount(${a.id}, '${a.code}', '${a.name.replace(/'/g,"\\'")}')">
                    <span class="item-code">${a.code}</span>${a.name}
                </div>`
            ).join('');
        }

        dropdown.classList.add('active');
    },

    selectAccount: function(id, code, name) {
        const searchInput = document.getElementById('ledger-account-search');
        const hiddenInput = document.getElementById('ledger-account-id');
        const nameDisplay = document.getElementById('ledger-account-name-display');
        const dropdown = document.getElementById('ledger-account-dropdown');
        if (searchInput) searchInput.value = code;   // Code box shows just the code
        if (nameDisplay) nameDisplay.value = name;    // Name box shows just the name
        if (hiddenInput) hiddenInput.value = id;
        if (dropdown) dropdown.classList.remove('active');
        this.currentAccount = { id, label: code + ' - ' + name };
    },

    handleSearchKey: function(event) {
        const dropdown = document.getElementById('ledger-account-dropdown');
        if (!dropdown || !dropdown.classList.contains('active')) return;
        const items = dropdown.querySelectorAll('.ledger-dropdown-item');
        if (!items.length) return;
        
        if (typeof this.highlightIndex !== 'number' || isNaN(this.highlightIndex)) {
            this.highlightIndex = -1;
        }

        if (event.key === 'ArrowDown' || event.key === 'Down') {
            event.preventDefault();
            this.highlightIndex++;
            if (this.highlightIndex >= items.length) this.highlightIndex = items.length - 1;
        } else if (event.key === 'ArrowUp' || event.key === 'Up') {
            event.preventDefault();
            this.highlightIndex--;
            if (this.highlightIndex < 0) this.highlightIndex = 0;
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.highlightIndex >= 0 && items[this.highlightIndex]) {
                items[this.highlightIndex].dispatchEvent(new MouseEvent('mousedown'));
            } else if (items.length === 1) {
                items[0].dispatchEvent(new MouseEvent('mousedown'));
            }
            return;
        } else if (event.key === 'Escape') {
            dropdown.classList.remove('active');
            return;
        }
        items.forEach((el, i) => {
            if (i === this.highlightIndex) {
                el.classList.add('highlighted');
                el.scrollIntoView({ block: 'nearest' });
            } else {
                el.classList.remove('highlighted');
            }
        });
    },
    // =================== END SMART SEARCH BOX ===================

    toggleDates: function() {
        const isChecked = document.getElementById('ledger-period-checkbox').checked;
        document.getElementById('ledger-from-date').disabled = !isChecked;
        document.getElementById('ledger-to-date').disabled = !isChecked;
    },

    toggleTaxFilter: function() {
        const checked = document.getElementById('ledger-tax-checkbox') && document.getElementById('ledger-tax-checkbox').checked;
        if(document.getElementById('ledger-tax-filter')) document.getElementById('ledger-tax-filter').disabled = !checked;
    },

    toggleInvFilter: function() {
        const checked = document.getElementById('ledger-inv-checkbox') && document.getElementById('ledger-inv-checkbox').checked;
        if(document.getElementById('ledger-inv-filter')) document.getElementById('ledger-inv-filter').disabled = !checked;
    },

    toggleMultiDates: function() {
        const isChecked = document.getElementById('multi_period_check').checked;
        document.getElementById('multi_from_date').disabled = !isChecked;
        document.getElementById('multi_to_date').disabled = !isChecked;
    },

    toggleMultiLedgerTypes: function() {
        const type = document.querySelector('input[name="multi_ledger_type"]:checked').value;
        const mainSel = document.getElementById('multi_main_account');
        const subCheck = document.getElementById('multi_sub_type');
        const subSel = document.getElementById('multi_sub_account');
        const fromCode = document.getElementById('multi_range_from_code');
        const fromName = document.getElementById('multi_range_from_name');
        const toCode = document.getElementById('multi_range_to_code');
        const toName = document.getElementById('multi_range_to_name');

        // Reset all
        if (mainSel) mainSel.disabled = true;
        if (subCheck) { subCheck.disabled = true; subCheck.checked = false; }
        if (subSel) subSel.disabled = true;
        if (fromCode) fromCode.disabled = true;
        if (fromName) fromName.disabled = true;
        if (toCode) toCode.disabled = true;
        if (toName) toName.disabled = true;

        if (type === 'main') {
            if (mainSel) mainSel.disabled = false;
        } else if (type === 'range') {
            if (fromCode) fromCode.disabled = false;
            if (fromName) fromName.disabled = false;
            if (toCode) toCode.disabled = false;
            if (toName) toName.disabled = false;
        }
    },

    fetchLedger: async function() {
        const accountId = document.getElementById('ledger-account-id').value;
        if (!accountId) {
            alert('Please select an account first by typing in the search box.');
            return;
        }

        const isPeriodChecked = document.getElementById('ledger-period-checkbox').checked;
        const fromDate = isPeriodChecked ? document.getElementById('ledger-from-date').value : '';
        const toDate = isPeriodChecked ? document.getElementById('ledger-to-date').value : '';

        const isTaxChecked = document.getElementById('ledger-tax-checkbox') ? document.getElementById('ledger-tax-checkbox').checked : false;
        const taxFilter = isTaxChecked ? encodeURIComponent(document.getElementById('ledger-tax-filter').value) : '';

        const isInvChecked = document.getElementById('ledger-inv-checkbox') ? document.getElementById('ledger-inv-checkbox').checked : false;
        const invFilter = isInvChecked ? encodeURIComponent(document.getElementById('ledger-inv-filter').value) : '';

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const tbody = document.getElementById('ledger-table-body');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color:#1f4668;">Loading Ledger Data...</td></tr>';

        try {
            const res = await fetch(`api/account_ledger.php?action=get_ledger&company_id=${companyId}&coa_id=${accountId}&from_date=${fromDate}&to_date=${toDate}&tax_filter=${taxFilter}&inv_type_filter=${invFilter}`);
            if (res.ok) {
                let data;
                try {
                    data = await res.json();
                } catch (e) {
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: red;">Failed to parse data from server.</td></tr>';
                    return;
                }
                if (data.error) {
                    alert(data.error);
                    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">${data.error}</td></tr>`;
                    return;
                }
                const label = document.getElementById('ledger-account-code-label');
                if (label) {
                    const accountText = `${data.account.code} - ${data.account.name}`;
                    label.textContent = accountText;
                    label.dataset.account = accountText; // Store for click-deselect restore
                }
                this.renderLedgerData(data.transactions);
            } else {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">Server Error: ${res.status}</td></tr>`;
            }
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: red;">Failed to load data. Please check API connection.</td></tr>';
        }
    },

    renderLedgerData: function(transactions) {
        this.currentLedgerData = transactions;
        const tbody = document.getElementById('ledger-table-body');
        tbody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color:#999;">No transactions found for this period.</td></tr>';
            document.getElementById('ledger-total-debit').value = '0.00';
            document.getElementById('ledger-total-credit').value = '0.00';
            document.getElementById('ledger-final-balance').value = '0.00';
            document.getElementById('ledger-final-status').value = '';
            return;
        }

        let runningBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        let selectedRow = null;

        // Map source_type to module URL and name for double-click navigation
        const sourceTypeMap = {
            'OB': { url: 'Navigation/Maintain/accounts_opening_balances.html', module: 'Opening Balances', title: 'Opening Balances' },
            'SI': { url: 'Navigation/Sales/sale_invoice.html',      module: 'Sale Invoice',      title: 'Sale Invoice' },
            'POS': { url: 'Navigation/POS/pos_sale_register.html',  module: 'POS Sales Register', title: 'POS Sale' },
            'SR': { url: 'Navigation/Sales/sale_return.html',       module: 'Sale Return',       title: 'Sale Return' },
            'PI': { url: 'Navigation/Purchases/purchase_invoice.html',     module: 'Purchase Invoice',  title: 'Purchase Invoice' },
            'PR': { url: 'Navigation/Purchases/purchase_return.html',      module: 'Purchase Return',   title: 'Purchase Return' },
            'CP': { url: 'Navigation/Purchases/cash_payments.html',      module: 'Cash Payments',      title: 'Cash Payment' },
            'BP': { url: 'Navigation/Purchases/bank_payments.html',      module: 'Bank Payments',      title: 'Bank Payment' },
            'CR': { url: 'Navigation/Sales/cash_receipts.html',      module: 'Cash Receipts',      title: 'Cash Receipt' },
            'BR': { url: 'Navigation/Sales/bank_receipts.html',      module: 'Bank Receipts',      title: 'Bank Receipt' },
            'JV': { url: 'Navigation/Adjustment/general_journal_voucher.html',   module: 'General Journal',    title: 'General Journal' },
        };

        transactions.forEach((tx, idx) => {
            const debit = parseFloat(tx.debit) || 0;
            const credit = parseFloat(tx.credit) || 0;
            if (debit === 0 && credit === 0) return;
            totalDebit += debit;
            totalCredit += credit;
            runningBalance += (debit - credit);
            let rbFixed = parseFloat(runningBalance.toFixed(2));
            const status = rbFixed > 0 ? 'Debit' : (rbFixed < 0 ? 'Credit' : 'Nil');
            const formattedDate = tx.date
                ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                : '';

            const isOB = tx.is_ob;

            const rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';

            const tr = document.createElement('tr');
            tr.style.backgroundColor = rowBg;
            tr.dataset.txRef = tx.reference || '';
            tr.dataset.sourceType = tx.source_type || '';
            tr.dataset.sourceId = tx.source_id || '';
            tr.style.cursor = 'pointer';

            tr.innerHTML = `
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px; text-align: center;">
                    <i class="fas fa-caret-right" style="font-size: 9px; color: #aaa;"></i>
                </td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px;">${formattedDate}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px;">${tx.tran_no || ''}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px;">${tx.reference || ''}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px;">${tx.description || ''}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px; text-align: right;">${debit !== 0 ? (debit < 0 ? '-' + this.fmt(Math.abs(debit)) : this.fmt(debit)) : ''}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px; text-align: right;">${credit !== 0 ? (credit < 0 ? '-' + this.fmt(Math.abs(credit)) : this.fmt(credit)) : ''}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px; text-align: right; font-weight:bold;">${this.fmt(Math.abs(runningBalance))}</td>
                <td style="border: 1px solid #e8e8e8; padding: 1px 4px; text-align: center; color:${status==='Debit'?'#c0392b':(status==='Credit'?'#27ae60':'#777')}; font-weight:bold;">${status}</td>
            `;

            // Single-click: highlight row and show info in footer label
            tr.addEventListener('click', () => {
                const tbody = document.getElementById('ledger-table-body');
                const currSelected = tbody.querySelector('.selected-row');

                if (currSelected && currSelected !== tr) {
                    currSelected.style.backgroundColor = currSelected._origBg || '';
                    currSelected.style.color = '';
                    currSelected.style.fontWeight = '';
                    currSelected.classList.remove('selected-row');
                }

                if (currSelected === tr) {
                    tr.style.backgroundColor = tr._origBg || '';
                    tr.style.color = '';
                    tr.style.fontWeight = '';
                    tr.classList.remove('selected-row');
                    tbody.dataset.currentIdx = -1;
                    
                    const label = document.getElementById('ledger-account-code-label');
                    if (label) label.textContent = label.dataset.account || '';
                    return;
                }
                
                if (!tr._origBg) tr._origBg = rowBg;
                tr.style.backgroundColor = '#1f4668';
                tr.style.color = '#fff';
                tr.style.fontWeight = 'bold';
                tr.classList.add('selected-row');
                
                const idx = Array.from(tbody.children).indexOf(tr);
                tbody.dataset.currentIdx = idx;

                // Show info in footer label
                const sourceInfo = sourceTypeMap[tx.source_type] || {};
                const label = document.getElementById('ledger-account-code-label');
                if (label) {
                    if (!label.dataset.account) label.dataset.account = label.textContent;
                    const typeName = sourceInfo.title || tx.source_type || '';
                    label.innerHTML = `<span style="color:#fff; background:#1f4668; padding:2px 8px; border-radius:3px;">${tx.reference || ''} &nbsp;|&nbsp; ${typeName} &nbsp;|&nbsp; ${tx.description || ''}</span>`;
                }
            });

            // Double-click: open source form
            tr.addEventListener('dblclick', () => {
                const sType = tx.source_type;
                const info = sourceTypeMap[sType];
                if (!info) {
                    alert('Cannot open form for this transaction type: ' + (sType || 'unknown'));
                    return;
                }
                
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const compId = session.company_id || 1;
                const sn = tx.reference ? parseInt(tx.reference.split('-')[1]) || 0 : 0;

                const initCb = async () => {
                    // First, initialize the module just like the sidebar does!
                    try {
                        if (sType === 'SI' && window.SIModule && window.SIModule.init) await window.SIModule.init();
                        else if (sType === 'POS' && window.POSSaleRegisterModule && window.POSSaleRegisterModule.init) await window.POSSaleRegisterModule.init();
                        else if (sType === 'SR' && window.SRModule && window.SRModule.init) await window.SRModule.init();
                        else if (sType === 'PI' && window.PIModule && window.PIModule.init) await window.PIModule.init();
                        else if (sType === 'PR' && window.PRModule && window.PRModule.init) await window.PRModule.init();
                        else if (sType === 'CP' && window.CPModule && window.CPModule.init) await window.CPModule.init();
                        else if (sType === 'BP' && window.BPModule && window.BPModule.init) await window.BPModule.init();
                        else if (sType === 'CR' && window.CRModule && window.CRModule.init) await window.CRModule.init();
                        else if (sType === 'BR' && window.BRModule && window.BRModule.init) await window.BRModule.init();
                        else if (sType === 'JV' && window.GJVModule && window.GJVModule.init) await window.GJVModule.init();
                        // OB form handles its own init implicitly when loaded
                    } catch (e) { console.error("Drilldown init error:", e); }

                    if (sType === 'OB') return; // Just open the form, no source_id to load
                    if (!tx.source_id) return;
                    
                    // Now safely load the specific record by ID
                    if (sType === 'POS') {
                        // POS Sale is maintained in POS Sales Register, not ERP Sale Invoice
                        if (window.POSSaleRegisterModule && typeof window.POSSaleRegisterModule.applyQuickFilter === 'function') {
                            window.POSSaleRegisterModule.applyQuickFilter(tx.reference || tx.tran_no || '');
                        }
                    }
                    else if (sType === 'SI' && window.SIModule) {
                        window.SIModule.currentId = tx.source_id;
                        fetch(`api/sale_invoice.php?action=get_invoice&id=${tx.source_id}&company_id=${compId}`)
                            .then(async r => {
                                if (!r.ok) throw new Error(`HTTP Error: ${r.status}`);
                                const text = await r.text();
                                try { return JSON.parse(text); } catch(e) { throw new Error(`JSON Error: ${text.substring(0,100)}`); }
                            })
                            .then(d=>{ 
                                if(d&&d.id) {
                                    try { window.SIModule.loadInvoiceData(d); } 
                                    catch(e) { alert("JS Error in fillForm: " + e.message); }
                                } else { alert("API returned empty data for ID: " + tx.source_id); }
                            })
                            .catch(err => alert("Fetch Error: " + err.message));
                    }
                    else if (sType === 'SR' && window.SRModule) {
                        window.SRModule.currentId = tx.source_id;
                        fetch(`api/sale_return.php?action=get_return&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.SRModule.fillForm(d); });
                    }
                    else if (sType === 'CR' && window.CRModule) {
                        window.CRModule.currentId = tx.source_id;
                        fetch(`api/cash_receipts.php?action=get&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.CRModule.loadData(d); });
                    }
                    else if (sType === 'PI' && window.PIModule) {
                        window.PIModule.currentId = tx.source_id;
                        fetch(`api/purchases.php?action=get_invoice&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.PIModule.loadInvoiceData(d); });
                    }
                    else if (sType === 'PR' && window.PRModule) {
                        window.PRModule.currentId = tx.source_id;
                        fetch(`api/purchases.php?action=get_return&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.PRModule.loadReturnData(d); });
                    }
                    else if (sType === 'CP' && window.CPModule) {
                        fetch(`api/cash_payments.php?action=get&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.CPModule.loadData(d); });
                    }
                    else if (sType === 'BP' && window.BPModule) {
                        fetch(`api/bank_payments.php?action=get&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.BPModule.loadData(d); });
                    }
                    else if (sType === 'BR' && window.BRModule) {
                        fetch(`api/bank_receipts.php?action=get&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.BRModule.loadData(d); });
                    }
                    else if (sType === 'JV' && window.GJVModule) {
                        fetch(`api/general_journal_voucher.php?action=get&id=${tx.source_id}&company_id=${compId}`)
                            .then(r=>r.json()).then(d=>{ if(d&&d.id) window.GJVModule.loadData(d); });
                    }
                };

                if (window.openModularPopup) {
                    window.openModularPopup(
                        info.url,
                        'fa-file-alt',
                        info.title + ' - ' + (tx.reference || ''),
                        initCb,
                        info.module,
                        true,
                        true
                    );
                } else {
                    alert('Navigation not available. Please open the module from the menu.');
                }
            });

            tbody.appendChild(tr);
        });

        document.getElementById('ledger-total-debit').value = this.fmt(totalDebit);
        document.getElementById('ledger-total-credit').value = this.fmt(totalCredit);
        document.getElementById('ledger-final-balance').value = this.fmt(Math.abs(runningBalance));
        const finalStatus = runningBalance > 0 ? 'Debit' : (runningBalance < 0 ? 'Credit' : 'Nil');
        document.getElementById('ledger-final-status').value = finalStatus;
    },


    fmt: function(n) {
        return parseFloat(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    printLedger: async function() {
        if (!this.currentLedgerData || this.currentLedgerData.length === 0) {
            alert('No data to print. Please display a ledger first.');
            return;
        }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

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

        const companyName = companyInfo.name || session.company_name || 'Company';
        const accountLabel = document.getElementById('ledger-account-code-label').textContent || 'Account';
        const isPeriodChecked = document.getElementById('ledger-period-checkbox').checked;
        const periodText = isPeriodChecked
            ? `${document.getElementById('ledger-from-date').value} To ${document.getElementById('ledger-to-date').value}`
            : 'All Dates';

        let runningBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;

        let rows = '';
        this.currentLedgerData.forEach(tx => {
            const debit = parseFloat(tx.debit) || 0;
            const credit = parseFloat(tx.credit) || 0;
            if (debit === 0 && credit === 0) return;
            totalDebit += debit;
            totalCredit += credit;
            runningBalance += (debit - credit);
            let rbFixed = parseFloat(runningBalance.toFixed(2));
            const status = rbFixed > 0 ? 'Debit' : (rbFixed < 0 ? 'Credit' : 'Nil');
            const formattedDate = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';

            
            rows += `<tr>
                <td>${formattedDate}</td>
                <td>${tx.reference || ''}</td>
                <td>${tx.description || ''}</td>
                <td style="text-align:right">${debit > 0 ? this.fmt(debit) : ''}</td>
                <td style="text-align:right">${credit > 0 ? this.fmt(credit) : ''}</td>
                <td style="text-align:right;font-weight:bold">${this.fmt(Math.abs(runningBalance))}</td>
                <td style="text-align:center">${status}</td>
            </tr>`;
        });

        const finalStatus = runningBalance > 0 ? 'Debit' : (runningBalance < 0 ? 'Credit' : 'Nil');
        const userName = session.name || session.username || 'User';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        // Build contact line from fresh API data
        let contactParts = [];
        if (companyInfo.address) contactParts.push(companyInfo.address);
        if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
        if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
        const contactLine = contactParts.length > 0
            ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>`
            : '';

        const printContent = `<!DOCTYPE html><html><head><title>Account Ledger</title><base href="${baseUrl}">
        <style>
            @page { margin: 0; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            .meta{display:flex;justify-content:space-between;margin-bottom:10px;font-weight:bold;font-size:12px}
            table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #000;padding:4px 6px}
            th{background:#f0f0f0;font-weight:bold}
        </style></head><body>
        <div class="hdr">
            <div class="hdr-left" style="text-align: left;">${logoImg}</div>
            <div class="hdr-center"><h1>${companyName}</h1>${contactLine}<h2>Account Ledger</h2></div>
            <div class="hdr-right"></div>
        </div>
        <div class="meta"><span>Account: ${accountLabel}</span><span>Period: ${periodText}</span></div>
        <table>
            <thead>
                <tr>
                    <th>Date</th><th>Tran. No.</th><th>Description</th>
                    <th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="3" style="text-align: right; font-weight: bold; padding: 6px;">Totals Rs.</td>
                    <td style="text-align: right; font-weight: bold; padding: 6px;">${this.fmt(totalDebit)}</td>
                    <td style="text-align: right; font-weight: bold; padding: 6px;">${this.fmt(totalCredit)}</td>
                    <td style="text-align: right; font-weight: bold; padding: 6px;">${this.fmt(Math.abs(runningBalance))}</td>
                    <td style="text-align: center; font-weight: bold; padding: 6px;">${finalStatus}</td>
                </tr>
            </tfoot>
        </table>
        <div style="display:flex; justify-content:space-between; color:#777; font-size:10px; margin-top:15px; font-style:italic;">
            <span>Printed by: ${userName}</span>
            <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
        </div>
        </body></html>`;

        const w = window.open('', '_blank');
        w.document.write(printContent);
        w.document.close();
        setTimeout(() => w.print(), 600);

    },

    exportExcel: function() {
        if (!this.currentLedgerData || this.currentLedgerData.length === 0) {
            alert('No data to export.');
            return;
        }
        const accountLabel = document.getElementById('ledger-account-code-label').textContent || 'Ledger';
        let csv = 'Date,Tran. No.,Description,Debit,Credit,Balance,Status\n';
        let runningBalance = 0;

        this.currentLedgerData.forEach(tx => {
            const debit = parseFloat(tx.debit) || 0;
            const credit = parseFloat(tx.credit) || 0;
            if (debit === 0 && credit === 0) return;
            runningBalance += (debit - credit);
            let rbFixed = parseFloat(runningBalance.toFixed(2));
            const status = rbFixed > 0 ? 'Debit' : (rbFixed < 0 ? 'Credit' : 'Nil');
            const date = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';
            const desc = (tx.description || '').replace(/,/g, ' ');

            
            csv += `${date},${tx.reference || ''},${desc},${debit || ''},${credit || ''},${Math.abs(runningBalance).toFixed(2)},${status}\n`;
        });

        const link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        link.download = `Ledger_${accountLabel.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    showMultipleLedgersModal: function() {
        document.getElementById('multiple-ledgers-modal').style.display = 'flex';
    },

    executePrintMultiple: function() {
        const type = document.querySelector('input[name="multi_ledger_type"]:checked')?.value || 'all';
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const isPeriod = document.getElementById('multi_period_check').checked;
        const fromDate = isPeriod ? document.getElementById('multi_from_date').value : '';
        const toDate = isPeriod ? document.getElementById('multi_to_date').value : '';
        const newPage = document.getElementById('multi_new_page_check').checked;

        let accountIds = [];

        if (type === 'all') {
            accountIds = this.accounts.map(a => a.id);
        } else if (type === 'main') {
            const mainId = document.getElementById('multi_main_account').value;
            const useSubType = document.getElementById('multi_sub_type').checked;
            const subId = useSubType ? document.getElementById('multi_sub_account').value : null;

            if (!mainId) { alert('Please select a Main Account Type.'); return; }

            // Filter accounts by sub_id or all under main
            accountIds = this.accounts
                .filter(a => {
                    if (subId) return String(a.sub_id) === String(subId);
                    return true; // backend will handle filtering, just use all for now
                })
                .map(a => a.id);

        } else if (type === 'range') {
            const fromCode = document.getElementById('multi_range_from_code').value.trim();
            const toCode = document.getElementById('multi_range_to_code').value.trim();
            if (!fromCode || !toCode) { alert('Please enter From and To codes for the range.'); return; }
            accountIds = this.accounts
                .filter(a => a.code >= fromCode && a.code <= toCode)
                .map(a => a.id);
        }

        if (accountIds.length === 0) {
            alert('No accounts found for the selected criteria.');
            return;
        }

        if (accountIds.length > 100) {
            if (!confirm(`This will generate ${accountIds.length} ledgers. Proceed?`)) return;
        }

        document.getElementById('multiple-ledgers-modal').style.display = 'none';
        this._printMultiple(accountIds, companyId, fromDate, toDate, newPage);
    },

    _printMultiple: async function(accountIds, companyId, fromDate, toDate, newPage) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const userName = session.name || session.username || 'User';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:50px; display:inline-block;">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const companyName = window.companyData?.name || session.company_name || 'Company';

        const _cdm = window.companyData || {};
        const address = (_cdm.address || '').trim();
        const phone = (_cdm.phone || '').trim();
        const email = (_cdm.email || '').trim();
        let contactParts = [];
        if (address) contactParts.push(address);
        if (phone) contactParts.push('Phone: ' + phone);
        if (email) contactParts.push('Email: ' + email);
        const contactLine = contactParts.length > 0 ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>` : '';

        const w = window.open('', '_blank');
        w.document.write(`<!DOCTYPE html><html><head><title>Multiple Ledgers</title><base href="${baseUrl}">
        <style>
            @page { margin: 0; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:15px;margin:0}
            .ledger-block{margin-bottom:25px;${newPage ? 'page-break-after:always;' : ''}}
            .hdr{display:flex;align-items:center;justify-content:space-between;padding-bottom:6px;border-bottom:2px solid #000;margin-bottom:8px}
            .hdr-left{width:80px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:80px;text-align:right}
            .hdr h1{margin:0;font-size:16px}.hdr h2{margin:3px 0 0;font-size:12px;color:#555}
            .meta{display:flex;justify-content:space-between;margin-bottom:6px;font-weight:bold;font-size:11px}
            table{width:100%;border-collapse:collapse;margin-bottom:6px}
            th,td{border:1px solid #000;padding:3px 5px;font-size:10px}
            th{background:#f0f0f0}
            @media print{.ledger-block{page-break-after:${newPage ? 'always' : 'auto'}}}
        </style></head><body><div id="content"><p style="text-align:center;padding:20px;">Loading ${accountIds.length} ledgers...</p></div></body></html>`);
        w.document.close();

        const allBlocks = [];

        for (let i = 0; i < accountIds.length; i++) {
            try {
                const url = `api/account_ledger.php?action=get_ledger&company_id=${companyId}&coa_id=${accountIds[i]}&from_date=${fromDate}&to_date=${toDate}`;
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();
                if (data.error || !data.transactions) continue;

                let runningBalance = 0;
                let totalDebit = 0;
                let totalCredit = 0;
                let rows = '';

                data.transactions.forEach(tx => {
                    const debit = parseFloat(tx.debit) || 0;
                    const credit = parseFloat(tx.credit) || 0;
                    if (debit === 0 && credit === 0) return;
                    totalDebit += debit;
                    totalCredit += credit;
                    runningBalance += (debit - credit);
                    let rbFixed = parseFloat(runningBalance.toFixed(2));
                    const status = rbFixed > 0 ? 'Debit' : (rbFixed < 0 ? 'Credit' : 'Nil');
                    const date = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';

                    rows += `<tr><td>${date}</td><td>${tx.reference||''}</td><td>${tx.description||''}</td>
                        <td style="text-align:right">${debit>0 ? debit.toFixed(2) : ''}</td>
                        <td style="text-align:right">${credit>0 ? credit.toFixed(2) : ''}</td>
                        <td style="text-align:right;font-weight:bold">${Math.abs(runningBalance).toFixed(2)}</td>
                        <td style="text-align:center">${status}</td></tr>`;
                });

                const finalStatus = runningBalance > 0 ? 'Debit' : (runningBalance < 0 ? 'Credit' : 'Nil');
                const periodText = fromDate ? `${fromDate} To ${toDate}` : 'All Dates';

                allBlocks.push(`<div class="ledger-block">
                    <div class="hdr">
                        <div class="hdr-left" style="text-align: left;">${logoImg}</div>
                        <div class="hdr-center"><h1>${companyName}</h1>${contactLine}<h2>Account Ledger</h2></div>
                        <div class="hdr-right"></div>
                    </div>
                    <div class="meta">
                        <span>${data.account.code} - ${data.account.name}</span>
                        <span>Period: ${periodText}</span>
                    </div>
                    <table>
                        <thead><tr>
                            <th>Date</th><th>Tran. No.</th><th>Description</th>
                            <th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="text-align: right; font-weight: bold;">Totals Rs.</td>
                                <td style="text-align: right; font-weight: bold;">${totalDebit.toFixed(2)}</td>
                                <td style="text-align: right; font-weight: bold;">${totalCredit.toFixed(2)}</td>
                                <td style="text-align: right; font-weight: bold;">${Math.abs(runningBalance).toFixed(2)}</td>
                                <td style="text-align: center; font-weight: bold;">${finalStatus}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; font-style:italic;">
                        <span>Printed by: ${userName}</span>
                        <span>Generated: ${new Date().toLocaleString()}</span>
                    </div>
                </div>`);
            } catch (e) {
                console.error('Error fetching ledger for account', accountIds[i], e);
            }
        }

        const contentDiv = w.document.getElementById('content');
        if (contentDiv) {
            contentDiv.innerHTML = allBlocks.join('') || '<p style="text-align:center;color:#999;">No data found.</p>';
        }
        setTimeout(() => w.print(), 800);
    }
};
