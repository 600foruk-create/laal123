(function() {
const moduleDef = {
    items: [],
    ledgerData: [],
    locations: [],
    isInitialized: false,
    
    init: async function() {
        try {
            const self = window.ViewInventoryLedgersModule;
            self.isInitialized = true;
            
            self.bindEvents();
            await self.fetchLookupData();
            self.setupSmartSearch();
            self.setDefaultDates();
        } catch (e) {
            alert('Init Error: ' + e.message);
        }
    },
    
    getEl: function(id) {
        const els = document.querySelectorAll('#' + id);
        return els.length > 0 ? els[els.length - 1] : null;
    },

    setDefaultDates: function() {
        try {
            const self = window.ViewInventoryLedgersModule;
            const today = new Date().toISOString().split('T')[0];
            self.getEl('vil_from_date').value = today;
            self.getEl('vil_to_date').value = today;
        } catch(e) {
            alert('Date Error: ' + e.message);
        }
    },

    bindEvents: function() {
        const self = window.ViewInventoryLedgersModule;
        
        self.getEl('vil_use_location').addEventListener('change', function() {
            self.getEl('vil_location_id').disabled = !this.checked;
            if(!this.checked) self.getEl('vil_location_id').value = '';
        });
        
        self.getEl('vil_use_period').addEventListener('change', function() {
            self.getEl('vil_from_date').disabled = !this.checked;
            self.getEl('vil_to_date').disabled = !this.checked;
        });

        self.getEl('vil_btn_display').addEventListener('click', () => self.fetchLedger());
        
        self.getEl('vil_btn_print').addEventListener('click', () => self.printLedger());
        
        self.getEl('vil_btn_excel').addEventListener('click', () => self.exportExcel());
        
        self.getEl('vil_btn_print_multiple').addEventListener('click', () => {
            if(window.hideAllDropdowns) window.hideAllDropdowns();
            window.openModularPopup('Navigation/Reports/print_inventory_ledgers.html', 'fa-layer-group', 'Print Inventory Ledgers', () => { if(window.PrintInventoryLedgersModule) window.PrintInventoryLedgersModule.init(); }, 'Print Inventory Ledgers', true, true);
        });
    },
    
    fetchLookupData: async function() {
        const self = window.ViewInventoryLedgersModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        try {
            const res = await fetch(`api/inventory_ledgers.php?action=get_lookups&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.items) self.items = data.items;
                if (data.locations) {
                    self.locations = data.locations;
                    const locSelect = self.getEl('vil_location_id');
                    locSelect.innerHTML = '<option value="">Select Location...</option>';
                    data.locations.forEach(loc => {
                        const opt = document.createElement('option');
                        opt.value = loc.id;
                        opt.textContent = loc.name;
                        locSelect.appendChild(opt);
                    });
                }
            } else {
                alert('API Error: ' + res.status);
            }
        } catch (e) {
            alert('Fetch Error: ' + e.message);
        }
    },
    
    setupSmartSearch: function() {
        try {
            const self = window.ViewInventoryLedgersModule;

            const vc = self.getEl('vil_item_code');
            const vcs = self.getEl('vil_item_suggest_code');
            const vn = self.getEl('vil_item_name');
            const vns = self.getEl('vil_item_suggest_name');

            function setItem(m) {
                vc.value = m.item_code;
                vc.setAttribute('data-id', m.id);
                vn.value = m.item_name;
            }

            function renderSugg(inputEl, suggestEl, field1, field2, onSelect) {
                if (!inputEl || !suggestEl) return;
                
                inputEl.oninput = () => {
                    try {
                        const q = inputEl.value.toLowerCase();
                        suggestEl.innerHTML = '';
                        if (!q) { suggestEl.style.display = 'none'; return; }
                        const matches = self.items.filter(d => 
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
                    } catch(e) {
                        alert('Dropdown Input Error: ' + e.message + '\nItems type: ' + typeof self.items + '\nIsArray: ' + Array.isArray(self.items));
                    }
                };
                
                inputEl.onkeydown = (e) => {
                    try {
                        let items = suggestEl.querySelectorAll('div');
                        let active = parseInt(suggestEl.dataset.activeIndex || -1);
                        if (e.key === 'ArrowDown') {
                            active = (active + 1) % items.length;
                            suggestEl.dataset.activeIndex = active;
                            items.forEach((item, idx) => item.classList.toggle('active', idx === active));
                            e.preventDefault();
                        } else if (e.key === 'ArrowUp') {
                            active = (active - 1 + items.length) % items.length;
                            suggestEl.dataset.activeIndex = active;
                            items.forEach((item, idx) => item.classList.toggle('active', idx === active));
                            e.preventDefault();
                        } else if (e.key === 'Enter' && active >= 0) {
                            items[active].onmousedown();
                            e.preventDefault();
                        }
                    } catch(e) {
                        alert('Key Error: ' + e.message);
                    }
                };

                inputEl.onblur = () => {
                    setTimeout(() => { suggestEl.style.display = 'none'; }, 200);
                };
            }

            renderSugg(vc, vcs, 'item_code', 'item_name', setItem);
        } catch(e) {
            alert('SmartSearch Error: ' + e.message);
        }
    },
    
    fetchLedger: async function() {
        const self = window.ViewInventoryLedgersModule;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        const vc = self.getEl('vil_item_code');
        const itemId = vc.getAttribute('data-id');
        if (!itemId) {
            alert('Please select an item.');
            return;
        }
        
        const useLocation = self.getEl('vil_use_location').checked;
        const locationId = self.getEl('vil_location_id').value;
        if (useLocation && !locationId) {
            alert('Please select a location.');
            return;
        }
        
        const usePeriod = self.getEl('vil_use_period').checked;
        const fromDate = self.getEl('vil_from_date').value;
        const toDate = self.getEl('vil_to_date').value;
        if (usePeriod && (!fromDate || !toDate)) {
            alert('Please select a valid date range.');
            return;
        }
        
        let url = `api/inventory_ledgers.php?action=get_ledger&company_id=${companyId}&item_id=${itemId}`;
        if (useLocation) url += `&location_id=${locationId}`;
        if (usePeriod) {
            url += `&from_date=${fromDate}&to_date=${toDate}`;
        }
        
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                self.ledgerData = data;
                self.renderTable();
            } else {
                let errorMsg = 'Failed to fetch ledger data.';
                try {
                    const errObj = await res.json();
                    if (errObj.error) errorMsg += '\\nError: ' + errObj.error;
                } catch(e) {}
                alert(errorMsg);
            }
        } catch (e) {
            console.error('Error fetching ledger:', e);
            alert('Error fetching ledger data.');
        }
    },
    
    renderTable: function() {
        const self = window.ViewInventoryLedgersModule;
        const tbody = self.getEl('vil_tbody');
        tbody.innerHTML = '';
        
        let totQtyIn = 0;
        let totQtyOut = 0;
        let balanceQty = 0;
        
        self.ledgerData.forEach((row, index) => {
            const qtyIn = parseFloat(row.qty_in) || 0;
            const qtyOut = parseFloat(row.qty_out) || 0;
            
            totQtyIn += qtyIn;
            totQtyOut += qtyOut;
            balanceQty += (qtyIn - qtyOut);
            
            const tr = document.createElement('tr');
            tr.dataset.index = index;
            
            tr.onclick = function() {
                const siblings = tbody.querySelectorAll('tr');
                siblings.forEach(s => s.classList.remove('selected'));
                this.classList.add('selected');
            };
            
            tr.ondblclick = () => {
                self.openVoucher(row.source_type, row.source_sn, row.is_tax, row.source_id);
            };
            
            const formatDate = (d) => {
                if(!d) return '';
                const p = d.split('-');
                if(p.length === 3) return `${p[2]}-${p[1]}-${p[0].substring(2)}`;
                return d;
            };
            
            const formatNum = (num) => {
                if (!num || parseFloat(num) === 0) return '';
                return parseFloat(num).toFixed(2);
            };
            
            tr.innerHTML = `
                <td style="width: 20px; text-align: center;"><div class="vil-row-pointer"></div></td>
                <td style="width: 70px; text-align: center;">${formatDate(row.date)}</td>
                <td style="width: 60px; text-align: center;">${row.tran_no || ''}</td>
                <td style="width: 120px;">${row.party_name || ''}</td>
                <td>${row.description || ''}</td>
                <td style="width: 60px; text-align: right;">${formatNum(qtyIn)}</td>
                <td style="width: 60px; text-align: right;">${formatNum(qtyOut)}</td>
                <td style="width: 40px; text-align: center;">${row.unit || ''}</td>
                <td style="width: 50px; text-align: right;">${formatNum(row.rate)}</td>
                <td style="width: 50px; text-align: right;">${formatNum(row.discount)}</td>
                <td style="width: 60px; text-align: right;">${formatNum(row.sales_tax)}</td>
                <td style="width: 50px; text-align: right;">${formatNum(row.fur_tax)}</td>
                <td style="width: 70px; text-align: right;">${formatNum(row.amount_incl_tax)}</td>
                <td style="width: 70px; text-align: right; font-weight: bold;">${balanceQty.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
        
        self.getEl('vil_tot_qty_in').textContent = totQtyIn.toFixed(2);
        self.getEl('vil_tot_qty_out').textContent = totQtyOut.toFixed(2);
        self.getEl('vil_tot_bal').textContent = balanceQty.toFixed(2);
    },
    
    openVoucher: function(sourceType, sourceSn, isTax, sourceId) {
        if (!sourceType || (!sourceSn && !sourceId)) return;
        isTax = isTax ? 1 : 0; // normalize
        console.log('[openVoucher] type:', sourceType, 'sn:', sourceSn, 'is_tax:', isTax, 'id:', sourceId);

        let path = '';
        let icon = '';
        let title = '';
        let cb = null;
        
        if(window.hideAllDropdowns) window.hideAllDropdowns();
        
        switch(sourceType) {
            case 'SI':
                path = 'Navigation/Sales/sale_invoice.html';
                icon = 'fa-file-invoice';
                title = 'Sale Invoice';
                cb = async () => { 
                    if(window.SIModule) {
                        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        const companyId = session.company_id || 1;
                        if(window.SIModule.init) await window.SIModule.init();
                        window.SIModule.currentId = sourceId; // Set AFTER init clears it, to stop fetchNextSerial
                        fetch(`api/sale_invoice.php?action=get_invoice&company_id=${companyId}&id=${sourceId}`)
                            .then(async r => {
                                if (!r.ok) throw new Error(`HTTP Error: ${r.status}`);
                                const text = await r.text();
                                try {
                                    return JSON.parse(text);
                                } catch(e) {
                                    throw new Error(`JSON Parse Error: ${text.substring(0, 100)}`);
                                }
                            }).then(data=>{
                                if (data && data.id) { 
                                    try {
                                        window.SIModule.loadInvoiceData(data); 
                                    } catch(e) {
                                        alert("JS Error in fillForm: " + e.message);
                                        console.error(e);
                                    }
                                }
                                else { 
                                    alert("API returned empty data for ID: " + sourceId);
                                    document.getElementById('si_sn').value = sourceSn; 
                                }
                            }).catch(err => {
                                alert("Fetch Error: " + err.message);
                                console.error(err);
                            });
                    }
                };
                break;
            case 'PI':
                path = 'Navigation/Purchases/purchase_invoice.html';
                icon = 'fa-file-invoice';
                title = 'Purchase Invoice';
                cb = async () => { 
                    if(window.PIModule) {
                        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        const companyId = session.company_id || 1;
                        if(window.PIModule.init) await window.PIModule.init();
                        window.PIModule.currentId = sourceId; // Set AFTER init clears it, to stop fetchNextSerial
                        fetch(`api/purchases.php?action=get_invoice&company_id=${companyId}&id=${sourceId}`)
                            .then(r=>r.json()).then(data=>{
                                if (data && data.id) { window.PIModule.loadInvoiceData(data); }
                                else { document.getElementById('pi_sn').value = sourceSn; }
                            }).catch(err => console.error(err));
                    }
                };
                break;
            case 'SR':
                path = 'Navigation/Sales/sale_return.html';
                icon = 'fa-undo';
                title = 'Sale Return';
                cb = async () => { 
                    if(window.SRModule) {
                        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        const companyId = session.company_id || 1;
                        if(window.SRModule.init) await window.SRModule.init();
                        window.SRModule.currentId = sourceId; // Set AFTER init clears it, to stop fetchNextSerial
                        fetch(`api/sale_return.php?action=get_return&company_id=${companyId}&id=${sourceId}`)
                            .then(r=>r.json()).then(data=>{
                                if (data && data.id) { window.SRModule.fillForm(data); }
                                else { document.getElementById('sr_sn').value = sourceSn; }
                            }).catch(err => console.error(err));
                    }
                };
                break;
            case 'PR':
                path = 'Navigation/Purchases/purchase_return.html';
                icon = 'fa-undo';
                title = 'Purchase Return';
                cb = async () => { 
                    if(window.PRModule) {
                        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        const companyId = session.company_id || 1;
                        if(window.PRModule.init) await window.PRModule.init();
                        window.PRModule.currentId = sourceId; // Set AFTER init clears it, to stop fetchNextSerial
                        fetch(`api/purchases.php?action=get_return&company_id=${companyId}&id=${sourceId}`)
                            .then(r=>r.json()).then(data=>{
                                if (data && data.id) { window.PRModule.loadReturnData(data); }
                                else { document.getElementById('pr_sn').value = sourceSn; }
                            }).catch(err => console.error(err));
                    }
                };
                break;
            case 'PDV':
                path = 'Navigation/Store/production_notes.html';
                icon = 'fa-clipboard-list';
                title = 'Production Notes';
                cb = async () => { 
                    if(window.PNModule) {
                        window.PNModule.isInitialized = false;
                        await window.PNModule.init();
                        const res = await fetch(`api/production_notes.php?action=fetch&sn=${sourceSn}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.id) { window.PNModule.fillForm(data); }
                            else { document.getElementById('pn_sn').value = sourceSn; }
                        }
                    }
                };
                break;
            case 'AI':
                path = 'Navigation/Store/add_inventory_adjustments.html';
                icon = 'fa-plus-circle';
                title = 'Add Inventory Adjustment';
                cb = async () => { 
                    if(window.AIAModule) {
                        window.AIAModule.isInitialized = false;
                        await window.AIAModule.init();
                        const res = await fetch(`api/add_inventory_adjustments.php?action=fetch&sn=${sourceSn}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.id) { window.AIAModule.fillForm(data); }
                            else { document.getElementById('aia_sn').value = sourceSn; }
                        }
                    }
                };
                break;
            case 'RI':
                path = 'Navigation/Store/reduce_inventory_adjustments.html';
                icon = 'fa-minus-circle';
                title = 'Reduce Inventory Adjustment';
                cb = async () => { 
                    if(window.RIAModule) {
                        window.RIAModule.isInitialized = false;
                        await window.RIAModule.init();
                        const res = await fetch(`api/reduce_inventory_adjustments.php?action=fetch&sn=${sourceSn}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.id) { window.RIAModule.fillForm(data); }
                            else { document.getElementById('ria_sn').value = sourceSn; }
                        }
                    }
                };
                break;
            case 'TR':
                path = 'Navigation/Store/inventory_transfers.html';
                icon = 'fa-exchange-alt';
                title = 'Inventory Transfer';
                cb = async () => { 
                    if(window.ITModule) {
                        window.ITModule.isInitialized = false;
                        await window.ITModule.init();
                        const res = await fetch(`api/inventory_transfers.php?action=fetch&sn=${sourceSn}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.id) { window.ITModule.fillForm(data); }
                            else { document.getElementById('it_sn').value = sourceSn; }
                        }
                    }
                };
                break;
            default:
                console.warn('Unknown voucher type:', sourceType);
                return;
        }
        
        window.openModularPopup(path, icon, title, cb, title, true, true);
    }
    ,

    printLedger: async function() {
        const self = window.ViewInventoryLedgersModule;
        if (!self.ledgerData || self.ledgerData.length === 0) {
            alert('No data to print. Please display a ledger first.');
            return;
        }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

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
        
        const itemName = self.getEl('vil_item_name').value || 'Item';
        const itemCode = self.getEl('vil_item_code').value || '';
        const itemLabel = `${itemCode} - ${itemName}`;
        
        const useLocation = self.getEl('vil_use_location').checked;
        const locSelect = self.getEl('vil_location_id');
        const locName = useLocation && locSelect.options[locSelect.selectedIndex] ? locSelect.options[locSelect.selectedIndex].text : 'All Locations';
        
        const isPeriodChecked = self.getEl('vil_use_period').checked;
        const periodText = isPeriodChecked
            ? `${self.getEl('vil_from_date').value} To ${self.getEl('vil_to_date').value}`
            : 'All Dates';

        const formatNum = (num) => {
            if (!num || parseFloat(num) === 0) return '';
            return parseFloat(num).toFixed(2);
        };
        const formatDate = (d) => {
            if(!d) return '';
            const p = d.split('-');
            if(p.length === 3) return `${p[2]}-${p[1]}-${p[0].substring(2)}`;
            return d;
        };

        let rows = '';
        let totQtyIn = 0;
        let totQtyOut = 0;
        let balanceQty = 0;
        
        self.ledgerData.forEach(tx => {
            const qtyIn = parseFloat(tx.qty_in) || 0;
            const qtyOut = parseFloat(tx.qty_out) || 0;
            totQtyIn += qtyIn;
            totQtyOut += qtyOut;
            balanceQty += (qtyIn - qtyOut);
            
            const trDate = formatDate(tx.date);
            const amtInclTax = parseFloat(tx.amt_incl_tax) || 0;

            rows += `<tr>
                <td style="text-align:center;">${trDate}</td>
                <td style="text-align:center;">${tx.tran_no || ''}</td>
                <td>${tx.party_name || ''}</td>
                <td>${tx.description || ''}</td>
                <td style="text-align:right">${qtyIn > 0 ? formatNum(qtyIn) : ''}</td>
                <td style="text-align:right">${qtyOut > 0 ? formatNum(qtyOut) : ''}</td>
                <td style="text-align:center;">${tx.unit || ''}</td>
                <td style="text-align:right">${formatNum(tx.rate)}</td>
                <td style="text-align:right">${formatNum(tx.discount)}</td>
                <td style="text-align:right">${formatNum(tx.sales_tax)}</td>
                <td style="text-align:right">${formatNum(tx.fur_tax)}</td>
                <td style="text-align:right">${amtInclTax > 0 ? formatNum(amtInclTax) : ''}</td>
                <td style="text-align:right;font-weight:bold">${formatNum(balanceQty)}</td>
            </tr>`;
        });

        rows += `<tr style="font-weight:bold; background:#f9f9f9;">
            <td colspan="4" style="text-align:right;">Totals</td>
            <td style="text-align:right;">${formatNum(totQtyIn)}</td>
            <td style="text-align:right;">${formatNum(totQtyOut)}</td>
            <td colspan="6"></td>
            <td style="text-align:right;">${formatNum(balanceQty)}</td>
        </tr>`;

        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        let contactParts = [];
        if (companyInfo.address) contactParts.push(companyInfo.address);
        if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
        if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
        const contactLine = contactParts.length > 0
            ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>`
            : '';

        const printContent = \`<!DOCTYPE html><html><head><title>Inventory Ledger</title><base href="\${baseUrl}">
        <style>
            @page { margin: 0.5cm; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            .meta{display:flex;justify-content:space-between;margin-bottom:10px;font-weight:bold;font-size:12px}
            table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #ccc;padding:4px 6px}
            th{background:#f0f0f0;font-weight:bold}
        </style></head><body>
        <div class="hdr">
            <div class="hdr-left" style="text-align: left;">\${logoImg}</div>
            <div class="hdr-center"><h1>\${companyName}</h1>\${contactLine}<h2>Inventory Ledger</h2></div>
            <div class="hdr-right"></div>
        </div>
        <div class="meta">
            <div><span>Item: \${itemLabel}</span><br><span style="font-weight:normal;font-size:11px;">Location: \${locName}</span></div>
            <span>Period: \${periodText}</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Date</th><th>Tran. No.</th><th>Party Name</th><th>Description</th>
                    <th>Qty In</th><th>Qty Out</th><th>Unit</th><th>Rate</th><th>Disc.</th><th>S.Tax</th><th>F.Tax</th><th>Amt Incl. Tax</th><th>Balance Qty</th>
                </tr>
            </thead>
            <tbody>
                \${rows}
            </tbody>
        </table>
        </body></html>\`;

        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    },

    exportExcel: function() {
        const self = window.ViewInventoryLedgersModule;
        if (!self.ledgerData || self.ledgerData.length === 0) {
            alert('No data to export.');
            return;
        }
        const itemCode = self.getEl('vil_item_code').value || 'Item';
        let csv = 'Date,Tran. No.,Party Name,Description,Qty In,Qty Out,Unit,Rate,Discount,Sales Tax,Fur. Tax,Amt. Incl. Tax,Balance Qty\\n';
        
        let totQtyIn = 0;
        let totQtyOut = 0;
        let balanceQty = 0;

        self.ledgerData.forEach(tx => {
            const qtyIn = parseFloat(tx.qty_in) || 0;
            const qtyOut = parseFloat(tx.qty_out) || 0;
            totQtyIn += qtyIn;
            totQtyOut += qtyOut;
            balanceQty += (qtyIn - qtyOut);
            
            const date = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';
            const desc = (tx.description || '').replace(/,/g, ' ');
            const party = (tx.party_name || '').replace(/,/g, ' ');

            csv += \`\${date},\${tx.tran_no || ''},\${party},\${desc},\${qtyIn || ''},\${qtyOut || ''},\${tx.unit || ''},\${tx.rate || ''},\${tx.discount || ''},\${tx.sales_tax || ''},\${tx.fur_tax || ''},\${tx.amt_incl_tax || ''},\${balanceQty}\\n\`;
        });

        const link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        link.download = \`InventoryLedger_\${itemCode.replace(/[^a-zA-Z0-9]/g, '_')}.csv\`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

if (window.ViewInventoryLedgersModule) {
    for (let key in moduleDef) {
        if (typeof moduleDef[key] === 'function') {
            window.ViewInventoryLedgersModule[key] = moduleDef[key];
        }
    }
} else {
    window.ViewInventoryLedgersModule = moduleDef;
}

// PROTECT ARRAYS FROM CACHED HTML HACKS THAT MIGHT TRY TO CLEAR THEM
const protectArray = (propName) => {
    let internalValue = window.ViewInventoryLedgersModule[propName];
    if (!Array.isArray(internalValue)) internalValue = [];
    
    Object.defineProperty(window.ViewInventoryLedgersModule, propName, {
        get: function() { return internalValue || []; },
        set: function(newVal) {
            // If the array already has data, NEVER let it be cleared or set to undefined/empty.
            if (internalValue && internalValue.length > 0) {
                if (!newVal || !Array.isArray(newVal) || newVal.length === 0) {
                    console.log('Ignored attempt to clear ' + propName);
                    return;
                }
            }
            internalValue = Array.isArray(newVal) ? newVal : [];
        },
        configurable: true
    });
};

protectArray('items');
protectArray('locations');
protectArray('ledgerData');

// Force init if dynamically loaded and modal is present
setTimeout(() => {
    if (window.ViewInventoryLedgersModule && document.getElementById('vil_item_code')) {
        window.ViewInventoryLedgersModule.init();
    }
}, 100);

})();
