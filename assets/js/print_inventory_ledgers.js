window.PrintInventoryLedgersModule = {
    isInitialized: false,
    items: [],
    mainCats: [],
    subCats: [],
    
    init: async function() {
        this.bindEvents();
        this.setDefaultDates();
        await this.fetchLookupData();
        this.setupSmartSearch();
    },
    
    getEl: function(id) {
        const els = document.querySelectorAll('#' + id);
        return els.length > 0 ? els[els.length - 1] : null;
    },
    
    setDefaultDates: function() {
        try {
            const today = new Date().toISOString().split('T')[0];
            this.getEl('pil_from_date').value = today;
            this.getEl('pil_to_date').value = today;
        } catch(e) {}
    },
    
    handleTypeChange: function(val) {
        const mc = this.getEl('pil_main_cat');
        const usc = this.getEl('pil_use_subcat');
        const sc = this.getEl('pil_sub_cat');
        const fc = this.getEl('pil_from_code');
        const tc = this.getEl('pil_to_code');
        
        if(mc) mc.disabled = true;
        if(usc) usc.disabled = true;
        if(sc) sc.disabled = true;
        if(fc) fc.disabled = true;
        if(tc) tc.disabled = true;
        
        if (val === 'category') {
            if(mc) mc.disabled = false;
            if(usc) usc.disabled = false;
            if(usc && usc.checked && sc) sc.disabled = false;
        } else if (val === 'range') {
            if(fc) fc.disabled = false;
            if(tc) tc.disabled = false;
        }
    },

    bindEvents: function() {
        const self = this;
        
        // Initial state sync
        const checkedRadio = document.querySelector('input[name="pil_type"]:checked');
        if (checkedRadio) {
            self.handleTypeChange(checkedRadio.value);
        }
        
        // Bind radio buttons
        const typeRadios = document.querySelectorAll('input[name="pil_type"]');
        typeRadios.forEach(r => {
            r.onchange = function() {
                self.handleTypeChange(this.value);
            };
        });
        
        // SubCat Checkbox
        const useSubCat = self.getEl('pil_use_subcat');
        const subCat = self.getEl('pil_sub_cat');
        if(useSubCat) {
            useSubCat.onclick = useSubCat.onchange = function() {
                if(subCat) {
                    subCat.disabled = !this.checked;
                    if(subCat.disabled) {
                        subCat.value = '';
                        const scVal = self.getEl('pil_sub_cat_val');
                        if(scVal) scVal.value = '';
                    }
                }
            };
        }
        
        // MainCat Change -> Filter SubCats is now handled by smart search selection
        
        // Period Checkbox
        const periodCheck = self.getEl('pil_use_period');
        if (periodCheck) {
            periodCheck.onclick = periodCheck.onchange = function() {
                self.getEl('pil_from_date').disabled = !this.checked;
                self.getEl('pil_to_date').disabled = !this.checked;
            };
        }
        
        // Print Button
        const printBtn = self.getEl('pil_btn_print');
        if (printBtn) {
            printBtn.onclick = () => self.printLedgers();
        }
    },
    
    fetchLookupData: async function() {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        try {
            if (self.items.length === 0) {
                const res = await fetch(`api/inventory_ledgers.php?action=get_lookups&company_id=${companyId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.items) self.items = data.items;
                }
            }
            
            if (self.mainCats.length === 0) {
                const catRes = await fetch(`api/inventory.php?action=get_inventory_tree&company_id=${companyId}`);
                if (catRes.ok) {
                    const data = await catRes.json();
                    if (data.mains) self.mainCats = data.mains;
                    if (data.subs) self.subCats = data.subs;
                }
            }
            
            const mcInput = self.getEl('pil_main_cat');
            if (mcInput) {
                mcInput.value = '';
                const mcVal = self.getEl('pil_main_cat_val');
                if(mcVal) mcVal.value = '';
                if (self.mainCats.length === 0) {
                    mcInput.placeholder = '(Error Fetching Categories)';
                } else {
                    mcInput.placeholder = 'Select Main Category...';
                }
            }
        } catch (e) {
            console.error('Failed to fetch lookup data:', e);
        }
    },
    
    populateSubCats: function(mainId) {
        const self = this;
        const scInput = self.getEl('pil_sub_cat');
        const scVal = self.getEl('pil_sub_cat_val');
        if (scInput) {
            scInput.value = '';
            if(scVal) scVal.value = '';
            scInput.placeholder = 'Select Sub Category...';
            scInput.dataset.mainId = mainId;
        }
    },
    
    setupSmartSearch: function() {
        const self = this;

        const fc = self.getEl('pil_from_code');
        const fcs = self.getEl('pil_from_suggest');
        const fn = self.getEl('pil_from_name');
        
        const tc = self.getEl('pil_to_code');
        const tcs = self.getEl('pil_to_suggest');
        const tn = self.getEl('pil_to_name');

        function setFromItem(m) {
            fc.value = m.item_code;
            fc.setAttribute('data-id', m.id);
            fn.value = m.item_name;
        }
        function setToItem(m) {
            tc.value = m.item_code;
            tc.setAttribute('data-id', m.id);
            tn.value = m.item_name;
        }

        function renderSugg(inputEl, suggestEl, dataFn, field1, field2, onSelect) {
            if(!inputEl) return;
            
            inputEl.onmousedown = inputEl.onfocus = () => {
                if(inputEl.disabled) return;
                inputEl.value = '';
                inputEl.dispatchEvent(new Event('input'));
            };
            
            inputEl.oninput = () => {
                try {
                    const q = inputEl.value.toLowerCase();
                    suggestEl.innerHTML = '';
                    let dataList = dataFn();
                    
                    let matches = dataList;
                    if (q) {
                        matches = dataList.filter(d => 
                            (d[field1] && String(d[field1]).toLowerCase().includes(q)) || 
                            (d[field2] && String(d[field2]).toLowerCase().includes(q))
                        );
                    }
                    matches = matches.slice(0, 30);

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
                } catch(e) {}
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
                } catch(e) {}
            };

            inputEl.onblur = () => {
                setTimeout(() => { suggestEl.style.display = 'none'; }, 200);
            };
        }

        renderSugg(fc, fcs, () => self.items, 'item_code', 'item_name', setFromItem);
        renderSugg(tc, tcs, () => self.items, 'item_code', 'item_name', setToItem);
        
        const mcInput = self.getEl('pil_main_cat');
        const mcSugg = self.getEl('pil_main_cat_suggest');
        const mcVal = self.getEl('pil_main_cat_val');
        
        renderSugg(mcInput, mcSugg, () => self.mainCats, 'code', 'name', (m) => {
            mcInput.value = `${m.code} - ${m.name}`;
            if(mcVal) mcVal.value = m.id;
            self.populateSubCats(m.id);
        });
        
        const scInput = self.getEl('pil_sub_cat');
        const scSugg = self.getEl('pil_sub_cat_suggest');
        const scVal = self.getEl('pil_sub_cat_val');
        
        renderSugg(scInput, scSugg, () => {
            const mId = scInput.dataset.mainId;
            return self.subCats.filter(c => c.main_id == mId);
        }, 'code', 'name', (m) => {
            scInput.value = `${m.code} - ${m.name}`;
            if(scVal) scVal.value = m.id;
        });
    },
    
    printLedgers: async function() {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        let type = 'all';
        const typeRadios = document.querySelectorAll('input[name="pil_type"]');
        typeRadios.forEach(r => { if(r.checked) type = r.value; });
        
        let url = `api/inventory_ledgers.php?action=get_multiple_ledgers&company_id=${companyId}&print_type=${type}`;
        
        // Validate Inputs
        if (type === 'category') {
            const mcVal = self.getEl('pil_main_cat_val');
            const mc = mcVal ? mcVal.value : '';
            if(!mc) { alert('Please select a main category.'); return; }
            url += `&cat_id=${mc}`;
            if(self.getEl('pil_use_subcat').checked) {
                const scVal = self.getEl('pil_sub_cat_val');
                const sc = scVal ? scVal.value : '';
                if(!sc) { alert('Please select a sub category.'); return; }
                url += `&sub_cat_id=${sc}`;
            }
        } else if (type === 'range') {
            const fc = self.getEl('pil_from_code').value;
            const tc = self.getEl('pil_to_code').value;
            if(!fc || !tc) { alert('Please enter both From and To item codes.'); return; }
            url += `&from_code=${encodeURIComponent(fc)}&to_code=${encodeURIComponent(tc)}`;
        }
        
        const usePeriod = self.getEl('pil_use_period').checked;
        if (usePeriod) {
            const fd = self.getEl('pil_from_date').value;
            const td = self.getEl('pil_to_date').value;
            if(!fd || !td) { alert('Please select valid dates.'); return; }
            url += `&from_date=${fd}&to_date=${td}`;
        }
        
        const newPage = self.getEl('pil_new_page').checked;
        
        // UI Loading State
        const btn = self.getEl('pil_btn_print');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = 'Loading...';
        btn.disabled = true;
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            
            if (data.error) {
                alert(data.error);
                btn.innerHTML = oldHtml;
                btn.disabled = false;
                return;
            }
            
            if (Object.keys(data.grouped).length === 0) {
                alert('No ledger records found for the selected criteria.');
                btn.innerHTML = oldHtml;
                btn.disabled = false;
                return;
            }
            
            await self.generatePrintHTML(data.grouped, data.item_details, usePeriod ? {from: self.getEl('pil_from_date').value, to: self.getEl('pil_to_date').value} : null, newPage);
            
        } catch(e) {
            alert('Fetch error: ' + e.message);
            console.error(e);
        }
        
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    },
    
    generatePrintHTML: async function(groupedData, itemDetails, period, newPage) {
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
        } catch(e) {}

        const companyName = companyInfo.name || session.company_name || 'Company';
        
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
            
        let bodyHtml = '';
        const itemIds = Object.keys(groupedData).sort((a,b) => parseInt(a) - parseInt(b));
        
        itemIds.forEach((itemId, idx) => {
            const txs = groupedData[itemId];
            const item = itemDetails[itemId] || { code: 'N/A', name: 'Unknown Item' };
            const itemLabel = `${item.code} - ${item.name}`;
            const periodText = period ? `${period.from} To ${period.to}` : 'All Dates';
            
            let rows = '';
            let totQtyIn = 0;
            let totQtyOut = 0;
            let balanceQty = 0;
            
            txs.forEach(tx => {
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
            
            const pageBreakClass = (newPage && idx > 0) ? 'page-break' : '';
            
            bodyHtml += `
            <div class="${pageBreakClass}" style="margin-bottom: 30px;">
                <div class="hdr">
                    <div class="hdr-left" style="text-align: left;">${logoImg}</div>
                    <div class="hdr-center"><h1>${companyName}</h1>${contactLine}<h2>Inventory Ledger</h2></div>
                    <div class="hdr-right"></div>
                </div>
                <div class="meta">
                    <div><span>Item: ${itemLabel}</span></div>
                    <span>Period: ${periodText}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th><th>Tran. No.</th><th>Party Name</th><th>Description</th>
                            <th>Qty In</th><th>Qty Out</th><th>Unit</th><th>Rate</th><th>Disc.</th><th>S.Tax</th><th>F.Tax</th><th>Amt Incl. Tax</th><th>Balance Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>`;
        });

        const printContent = `<!DOCTYPE html><html><head><title>Inventory Ledgers</title><base href="${baseUrl}">
        <style>
            @page { margin: 0.5cm; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            .meta{display:flex;justify-content:space-between;margin-bottom:10px;font-weight:bold;font-size:12px}
            table{width:100%;border-collapse:collapse;margin-bottom:20px;}
            th,td{border:1px solid #ccc;padding:4px 6px}
            th{background:#f0f0f0;font-weight:bold;text-align:center;white-space:nowrap;}
            .page-break { page-break-before: always; }
        </style></head><body>
        ${bodyHtml}
        </body></html>`;

        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }
};
