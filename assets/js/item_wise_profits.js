window.ItemWiseProfitsModule = {
    isInitialized: false,
    customers: [],
    brands: [],
    employees: [],
    mains: [],
    subs: [],
    
    init: async function() {
        if(this.isInitialized) return;
        this.isInitialized = true;
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
            this.getEl('iwp_from_date').value = today;
            this.getEl('iwp_to_date').value = today;
        } catch(e) {}
    },
    
    handleTypeChange: function(val) {
        const mc = this.getEl('iwp_main_cat');
        const usc = this.getEl('iwp_use_subcat');
        const sc = this.getEl('iwp_sub_cat');
        
        if(mc) mc.disabled = true;
        if(usc) usc.disabled = true;
        if(sc) sc.disabled = true;
        
        if (val === 'category') {
            if(mc) mc.disabled = false;
            if(usc) usc.disabled = false;
            if(usc && usc.checked && sc) sc.disabled = false;
        }
    },

    bindEvents: function() {
        const self = this;
        
        const typeRadios = document.querySelectorAll('input[name="iwp_type"]');
        typeRadios.forEach(r => {
            r.onchange = function() {
                self.handleTypeChange(this.value);
            };
        });
        const checkedRadio = document.querySelector('input[name="iwp_type"]:checked');
        if (checkedRadio) self.handleTypeChange(checkedRadio.value);
        
        const useSubCat = self.getEl('iwp_use_subcat');
        const subCat = self.getEl('iwp_sub_cat');
        if(useSubCat) {
            useSubCat.onclick = useSubCat.onchange = function() {
                if(subCat) {
                    subCat.disabled = !this.checked;
                    if(subCat.disabled) {
                        subCat.value = '';
                        const scVal = self.getEl('iwp_sub_cat_val');
                        if(scVal) scVal.value = '';
                    }
                }
            };
        }
        
        const bindCheck = (chkId, ...inputIds) => {
            const chk = self.getEl(chkId);
            if(!chk) return;
            chk.onchange = chk.onclick = function() {
                inputIds.forEach(id => {
                    const el = self.getEl(id);
                    if(el) {
                        el.disabled = !this.checked;
                        if(el.disabled && el.tagName === 'INPUT' && el.type !== 'date') {
                            el.value = '';
                        }
                    }
                });
                if(!this.checked) {
                    // clear hidden vals
                    if(chkId === 'iwp_use_customer') self.getEl('iwp_customer_val').value = '';
                    if(chkId === 'iwp_use_brand') self.getEl('iwp_brand_val').value = '';
                    if(chkId === 'iwp_use_employee') self.getEl('iwp_employee_val').value = '';
                }
            };
        };
        
        bindCheck('iwp_use_customer', 'iwp_customer_code', 'iwp_customer_name');
        bindCheck('iwp_use_brand', 'iwp_brand');
        bindCheck('iwp_use_employee', 'iwp_employee');
        bindCheck('iwp_use_period', 'iwp_from_date', 'iwp_to_date');
        
        const displayBtn = self.getEl('iwp_btn_display');
        if (displayBtn) displayBtn.onclick = () => self.displayData();
        const printBtn = self.getEl('iwp_btn_print');
        if (printBtn) printBtn.onclick = () => self.printData();
    },
    
    fetchLookupData: async function() {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        try {
            if (self.customers.length === 0) {
                const res = await fetch(`api/item_wise_profits.php?action=get_lookups&company_id=${companyId}`);
                if (res.ok) {
                    const data = await res.json();
                    if(data.customers) self.customers = data.customers;
                    if(data.brands) self.brands = data.brands;
                    if(data.employees) self.employees = data.employees;
                    if(data.mains) self.mains = data.mains;
                    if(data.subs) self.subs = data.subs;
                }
            }
        } catch (e) {
            console.error('Failed to fetch lookup data:', e);
        }
    },
    
    setupSmartSearch: function() {
        const self = this;

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
                        matches = dataList.filter(d => {
                            const val1 = d[field1] ? String(d[field1]).toLowerCase() : '';
                            const val2 = (field2 && d[field2]) ? String(d[field2]).toLowerCase() : '';
                            return val1.includes(q) || val2.includes(q);
                        });
                    }
                    matches = matches.slice(0, 30);

                    if (matches.length > 0) {
                        matches.forEach((m, idx) => {
                            const div = document.createElement('div');
                            div.innerText = field2 ? `${m[field1]} - ${m[field2]}` : m[field1];
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

        // Category
        const mcInput = self.getEl('iwp_main_cat');
        const mcSugg = self.getEl('iwp_main_cat_suggest');
        const mcVal = self.getEl('iwp_main_cat_val');
        renderSugg(mcInput, mcSugg, () => self.mains, 'code', 'name', (m) => {
            mcInput.value = `${m.code} - ${m.name}`;
            if(mcVal) mcVal.value = m.id;
            
            const scInput = self.getEl('iwp_sub_cat');
            if (scInput) {
                scInput.value = '';
                const scVal = self.getEl('iwp_sub_cat_val');
                if(scVal) scVal.value = '';
                scInput.dataset.mainId = m.id;
            }
        });
        
        // Sub Category
        const scInput = self.getEl('iwp_sub_cat');
        const scSugg = self.getEl('iwp_sub_cat_suggest');
        const scVal = self.getEl('iwp_sub_cat_val');
        renderSugg(scInput, scSugg, () => {
            const mId = scInput.dataset.mainId;
            return self.subs.filter(c => c.main_id == mId);
        }, 'code', 'name', (m) => {
            scInput.value = `${m.code} - ${m.name}`;
            if(scVal) scVal.value = m.id;
        });

        // Customer
        const cInput = self.getEl('iwp_customer_code');
        const cSugg = self.getEl('iwp_customer_suggest');
        const cVal = self.getEl('iwp_customer_val');
        const cName = self.getEl('iwp_customer_name');
        renderSugg(cInput, cSugg, () => self.customers, 'code', 'name', (m) => {
            cInput.value = m.code;
            cName.value = m.name;
            if(cVal) cVal.value = m.id;
        });

        // Brand
        const bInput = self.getEl('iwp_brand');
        const bSugg = self.getEl('iwp_brand_suggest');
        const bVal = self.getEl('iwp_brand_val');
        renderSugg(bInput, bSugg, () => self.brands, 'name', null, (m) => {
            bInput.value = m.name;
            if(bVal) bVal.value = m.id;
        });

        // Employee
        const eInput = self.getEl('iwp_employee');
        const eSugg = self.getEl('iwp_employee_suggest');
        const eVal = self.getEl('iwp_employee_val');
        renderSugg(eInput, eSugg, () => self.employees, 'name', null, (m) => {
            eInput.value = m.name;
            if(eVal) eVal.value = m.id;
        });
    },

    getQueryParams: function() {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        let type = 'all';
        const typeRadios = document.querySelectorAll('input[name="iwp_type"]');
        typeRadios.forEach(r => { if(r.checked) type = r.value; });
        
        let qs = `company_id=${companyId}&print_type=${type}`;
        
        if (type === 'category') {
            const mcVal = self.getEl('iwp_main_cat_val');
            const mc = mcVal ? mcVal.value : '';
            if(!mc) { alert('Please select a category.'); return null; }
            qs += `&cat_id=${mc}`;
            if(self.getEl('iwp_use_subcat').checked) {
                const scVal = self.getEl('iwp_sub_cat_val');
                const sc = scVal ? scVal.value : '';
                if(!sc) { alert('Please select a sub category.'); return null; }
                qs += `&sub_cat_id=${sc}`;
            }
        }
        
        if(self.getEl('iwp_use_customer').checked) {
            const cVal = self.getEl('iwp_customer_val').value;
            if(!cVal) { alert('Please select a customer.'); return null; }
            qs += `&customer_id=${cVal}`;
        }
        if(self.getEl('iwp_use_brand').checked) {
            const bVal = self.getEl('iwp_brand_val').value;
            if(!bVal) { alert('Please select a brand.'); return null; }
            qs += `&brand_id=${bVal}`;
        }
        if(self.getEl('iwp_use_employee').checked) {
            const eVal = self.getEl('iwp_employee_val').value;
            if(!eVal) { alert('Please select an employee.'); return null; }
            qs += `&employee_id=${eVal}`;
        }
        
        if(self.getEl('iwp_use_period').checked) {
            const fd = self.getEl('iwp_from_date').value;
            const td = self.getEl('iwp_to_date').value;
            if(!fd || !td) { alert('Please select valid dates.'); return null; }
            qs += `&from_date=${fd}&to_date=${td}`;
        }
        
        return qs;
    },
    
    displayData: async function() {
        const self = this;
        const qs = self.getQueryParams();
        if(!qs) return;
        
        const btn = self.getEl('iwp_btn_display');
        const tbody = self.getEl('iwp_tbody_v2');
        btn.style.opacity = '0.5';
        btn.disabled = true;
        
        try {
            const res = await fetch(`api/item_wise_profits.php?action=get_profits&${qs}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const resData = await res.json();
            
            if (resData.error) {
                alert(resData.error);
                btn.style.opacity = '1';
                btn.disabled = false;
                return;
            }
            
            const formatNum = (num) => {
                return parseFloat(num).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
            };
            
            tbody.innerHTML = '';
            
            if (resData.data && resData.data.length > 0) {
                resData.data.forEach(row => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${row.item_code}</td>
                        <td>${row.hs_code || ''}</td>
                        <td>${row.item_name}</td>
                        <td style="text-align: right;">${formatNum(row.quantity)}</td>
                        <td style="text-align: center;">${row.unit || ''}</td>
                        <td style="text-align: right;">${formatNum(row.unit_cost)}</td>
                        <td style="text-align: right;">${formatNum(row.total_cost)}</td>
                        <td style="text-align: right;">${formatNum(row.sales_value)}</td>
                        <td style="text-align: right; font-weight:bold; color: ${row.profit < 0 ? 'red' : 'green'}">${formatNum(row.profit)}</td>
                    `;
                    tr.addEventListener('click', () => {
                        Array.from(tbody.querySelectorAll('tr')).forEach(r => r.classList.remove('selected'));
                        tr.classList.add('selected');
                    });
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="9" style="padding: 10px; text-align: center;">No records found.</td></tr>';
            }
            
            if (resData.totals) {
                self.getEl('iwp_tot_cost').innerText = formatNum(resData.totals.total_cost);
                self.getEl('iwp_tot_sales').innerText = formatNum(resData.totals.sales_value);
                self.getEl('iwp_tot_profit').innerText = formatNum(resData.totals.profit);
            }
            
        } catch(e) {
            alert('Fetch error: ' + e.message);
            console.error(e);
        }
        
        btn.style.opacity = '1';
        btn.disabled = false;
    },
    
    printData: async function() {
        const self = this;
        const qs = self.getQueryParams();
        if(!qs) return;
        
        const btn = self.getEl('iwp_btn_print');
        btn.style.opacity = '0.5';
        btn.disabled = true;
        
        try {
            const res = await fetch(`api/item_wise_profits.php?action=get_profits&${qs}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const resData = await res.json();
            
            if (resData.error || !resData.data || resData.data.length === 0) {
                alert('No data to print.');
                btn.style.opacity = '1';
                btn.disabled = false;
                return;
            }
            
            const formatNum = (num) => parseFloat(num).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
            
            let rowsHtml = '';
            resData.data.forEach(row => {
                rowsHtml += `<tr>
                    <td>${row.item_code}</td>
                    <td>${row.hs_code || ''}</td>
                    <td>${row.item_name}</td>
                    <td style="text-align:right">${formatNum(row.quantity)}</td>
                    <td style="text-align:center">${row.unit || ''}</td>
                    <td style="text-align:right">${formatNum(row.unit_cost)}</td>
                    <td style="text-align:right">${formatNum(row.total_cost)}</td>
                    <td style="text-align:right">${formatNum(row.sales_value)}</td>
                    <td style="text-align:right;font-weight:bold">${formatNum(row.profit)}</td>
                </tr>`;
            });
            
            let totalsHtml = `<tr style="font-weight:bold; background:#f0f0f0;">
                <td colspan="6" style="text-align:right">Totals Rs.</td>
                <td style="text-align:right">${formatNum(resData.totals.total_cost)}</td>
                <td style="text-align:right">${formatNum(resData.totals.sales_value)}</td>
                <td style="text-align:right">${formatNum(resData.totals.profit)}</td>
            </tr>`;

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = window.selectedCompanyId || session.company_id || 1;
            
            let companyName = session.company_name || 'Company';
            try {
                const cRes = await fetch(`api/admin.php?action=get_company&company_id=${companyId}`);
                if(cRes.ok) {
                    const cData = await cRes.json();
                    if(cData.name) companyName = cData.name;
                }
            } catch(e){}

            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
            
            const printContent = `<!DOCTYPE html><html><head><title>Item-Wise Profits</title><base href="${baseUrl}">
            <style>
                @page { margin: 0.5cm; }
                body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
                .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
                .hdr-left{width:100px}
                .hdr-center{flex:1;text-align:center}
                .hdr-right{width:100px;text-align:right}
                .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
                table{width:100%;border-collapse:collapse;margin-bottom:20px;}
                th,td{border:1px solid #000;padding:4px 6px}
                th{background:#f0f0f0;font-weight:bold;text-align:center;}
            </style></head><body>
                <div class="hdr">
                    <div class="hdr-left"><img src="${actualLogo}" style="max-height:60px;"></div>
                    <div class="hdr-center"><h1>${companyName}</h1><h2>Item-Wise Profits</h2></div>
                    <div class="hdr-right"></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Item Code</th>
                            <th>HS Code</th>
                            <th>Item Name</th>
                            <th>Quantity</th>
                            <th>Unit</th>
                            <th>Unit Cost</th>
                            <th>Total Cost</th>
                            <th>Sales Value</th>
                            <th>Profit / (Loss)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        ${totalsHtml}
                    </tbody>
                </table>
            </body></html>`;

            const printWindow = window.open('', '_blank', 'width=1000,height=700');
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 500);
            
        } catch(e) {
            alert('Fetch error: ' + e.message);
            console.error(e);
        }
        
        btn.style.opacity = '1';
        btn.disabled = false;
    }
};
