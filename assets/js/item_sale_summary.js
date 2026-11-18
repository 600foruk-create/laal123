window.ItemSaleSummaryModule = {
    isInitialized: false,
    reportData: [],
    customers: [],
    selectedIndex: -1,

    init: async function() {
        if (this.isInitialized) return;
        this.bindEvents();
        await this.loadLookups();
        this.setupCustomerSearch();
        this.setupCheckboxToggles();
        this.isInitialized = true;
    },

    bindEvents: function() {
        const self = window.ItemSaleSummaryModule;
        document.addEventListener('keydown', self.handleKeydown);

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#iss_use_customer') && e.target.id !== 'iss_customer_code' && e.target.id !== 'iss_customer_name' && !e.target.closest('#iss_customer_suggest')) {
                const sugg = document.getElementById('iss_customer_suggest');
                if(sugg) sugg.style.display = 'none';
            }
        });
    },

    setupCheckboxToggles: function() {
        const toggles = [
            { chk: 'iss_use_item_cat', target: 'iss_item_cat' },
            { chk: 'iss_use_item_sub_cat', target: 'iss_item_sub_cat' },
            { chk: 'iss_use_cust_type', target: 'iss_cust_type' },
            { chk: 'iss_use_customer', target: ['iss_customer_code', 'iss_customer_name'] },
            { chk: 'iss_use_region', target: 'iss_region' },
            { chk: 'iss_use_sub_region', target: 'iss_sub_region' },
            { chk: 'iss_use_business', target: 'iss_business' },
            { chk: 'iss_use_dept', target: 'iss_dept' },
            { chk: 'iss_use_emp', target: 'iss_emp' },
            { chk: 'iss_use_date', target: ['iss_date_from', 'iss_date_to'] }
        ];

        toggles.forEach(t => {
            const chk = document.getElementById(t.chk);
            if (!chk) return;
            chk.addEventListener('change', function() {
                if (Array.isArray(t.target)) {
                    t.target.forEach(id => {
                        const el = document.getElementById(id);
                        if(el) {
                            el.disabled = !this.checked;
                            if(this.checked && id === t.target[0]) el.focus();
                        }
                    });
                } else {
                    const el = document.getElementById(t.target);
                    if(el) {
                        el.disabled = !this.checked;
                        if(this.checked) el.focus();
                    }
                }
            });
        });
    },

    loadLookups: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        const loadOptions = async (url, elId, valField, textField) => {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const data = await r.json();
                    const sel = document.getElementById(elId);
                    if (sel && !data.error) {
                        data.forEach(item => {
                            sel.insertAdjacentHTML('beforeend', `<option value="${item[valField]}">${item[textField]}</option>`);
                        });
                    }
                }
            } catch (e) {
                console.error('Error loading ' + elId, e);
            }
        };

        try {
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    window.ItemSaleSummaryModule.customers = data;
                }
            }
        } catch (e) {
            console.error('Error fetching customers:', e);
        }

        await loadOptions(`api/item_purchase_summary.php?action=get_item_categories&company_id=${companyId}`, 'iss_item_cat', 'id', 'name');
        await loadOptions(`api/item_purchase_summary.php?action=get_item_sub_categories&company_id=${companyId}`, 'iss_item_sub_cat', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_customer_types&company_id=${companyId}`, 'iss_cust_type', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_regions&company_id=${companyId}`, 'iss_region', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_sectors&company_id=${companyId}`, 'iss_business', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_departments&company_id=${companyId}`, 'iss_dept', 'id', 'name');
        await loadOptions(`api/maintain.php?action=get_employees&company_id=${companyId}`, 'iss_emp', 'id', 'name');

        const regionSelect = document.getElementById('iss_region');
        if (regionSelect) {
            regionSelect.addEventListener('change', async () => {
                const subRegionSelect = document.getElementById('iss_sub_region');
                if (subRegionSelect) {
                    subRegionSelect.innerHTML = '<option value="">Select Sub Region...</option>';
                    if (regionSelect.value) {
                        await loadOptions(`api/maintain.php?action=get_sub_regions&region_id=${regionSelect.value}`, 'iss_sub_region', 'id', 'name');
                    }
                }
            });
        }
    },



    selectCustomer: function(id, code, name) {
        document.getElementById('iss_customer_id').value = id;
        document.getElementById('iss_customer_code').value = code;
        document.getElementById('iss_customer_name').value = name;
        document.getElementById('iss_customer_suggest').style.display = 'none';
    },

    setupCustomerSearch: function() {
        const self = window.ItemSaleSummaryModule;
        const codeInput = document.getElementById('iss_customer_code');
        const nameInput = document.getElementById('iss_customer_name');
        const suggest = document.getElementById('iss_customer_suggest');
        const hiddenInput = document.getElementById('iss_customer_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const filtered = self.customers.filter(item => {
                const code = String(item.code || '').toLowerCase();
                const name = String(item.name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20); // limit to 20

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item, idx) => {
                    const code = item.code || '';
                    const name = item.name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div style="padding: 6px 10px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.ItemSaleSummaryModule.selectCustomer(${item.id}, '${safeCode}', '${safeName}')">
                         <b>${code}</b> &nbsp; ${name}
                    </div>`;
                }).join('');
                suggest.style.display = 'block';
            } else {
                suggest.style.display = 'none';
            }
        };

        const onInput = (e) => {
            hiddenInput.value = ''; // clear selection when typing
            handleSearch(e.target.value.trim());
        };
        codeInput.addEventListener('input', onInput);
        nameInput.addEventListener('input', onInput);

        codeInput.addEventListener('focus', function() { this.select(); handleSearch(this.value.trim()); });
        nameInput.addEventListener('focus', function() { this.select(); handleSearch(this.value.trim()); });

        const updateHighlight = (items) => {
            items.forEach((item, idx) => {
                if (idx === suggestIndex) {
                    item.classList.add('active');
                    item.style.background = '#1F4E79';
                    item.style.color = '#fff';
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                    item.style.background = '#fff';
                    item.style.color = '#333';
                }
            });
        };

        const onKeydown = (e) => {
            if (suggest.style.display === 'block') {
                const items = suggest.querySelectorAll('div');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
                    updateHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    suggestIndex = Math.max(suggestIndex - 1, 0);
                    updateHighlight(items);
                } else if (e.key === 'Enter' && suggestIndex >= 0) {
                    e.preventDefault();
                    items[suggestIndex].click();
                }
            }
        };

        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);
    },

    formatNumber: function(num) {
        return parseFloat(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    fetchReport: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        let query = `api/item_sale_summary.php?action=get_data&company_id=${companyId}`;
        
        const invType = document.querySelector('input[name="iss_inv_type"]:checked');
        if (invType) query += `&invoice_type_filter=${invType.value}`;

        if (document.getElementById('iss_use_item_cat').checked) query += `&item_category_id=${document.getElementById('iss_item_cat').value}`;
        if (document.getElementById('iss_use_item_sub_cat').checked) query += `&item_sub_category_id=${document.getElementById('iss_item_sub_cat').value}`;
        if (document.getElementById('iss_use_cust_type').checked) query += `&customer_type_id=${document.getElementById('iss_cust_type').value}`;
        if (document.getElementById('iss_use_customer').checked) query += `&customer_coa_id=${document.getElementById('iss_customer_id').value}`;
        if (document.getElementById('iss_use_region').checked) query += `&region_id=${document.getElementById('iss_region').value}`;
        if (document.getElementById('iss_use_sub_region').checked) query += `&sub_region_id=${document.getElementById('iss_sub_region').value}`;
        if (document.getElementById('iss_use_business').checked) query += `&business_sector_id=${document.getElementById('iss_business').value}`;
        if (document.getElementById('iss_use_dept').checked) query += `&department_id=${document.getElementById('iss_dept').value}`;
        if (document.getElementById('iss_use_emp').checked) query += `&employee_id=${document.getElementById('iss_emp').value}`;
        if (document.getElementById('iss_use_date').checked) {
            query += `&from_date=${document.getElementById('iss_date_from').value}&to_date=${document.getElementById('iss_date_to').value}`;
        }

        try {
            const res = await fetch(query);
            if (res.ok) {
                const result = await res.json();
                if (result.error) {
                    alert(result.message);
                } else {
                    this.reportData = result.data || [];
                    this.renderTable();
                }
            }
        } catch (e) {
            console.error(e);
            alert("Error fetching data");
        }
    },

    renderTable: function() {
        const tbody = document.getElementById('iss_tbody');
        if(!tbody) return;
        tbody.innerHTML = '';
        this.selectedIndex = -1;

        let t_pcs = 0, t_qty = 0, t_amt = 0;

        this.reportData.forEach((row, idx) => {
            const pcs = parseFloat(row.total_pieces) || 0;
            const qty = parseFloat(row.total_quantity) || 0;
            const amt = parseFloat(row.total_amount) || 0;
            const min = parseFloat(row.min_rate) || 0;
            const max = parseFloat(row.max_rate) || 0;
            const avg = parseFloat(row.avg_rate) || 0;

            t_pcs += pcs;
            t_qty += qty;
            t_amt += amt;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="width: 20px; text-align: center;"><span class="sr-row-pointer"></span></td>
                <td style="width: 80px; text-align: center;">${row.item_code || ''}</td>
                <td style="width: 80px; text-align: center;">${row.hs_code || ''}</td>
                <td style="text-align: left;">${row.item_name || ''}</td>
                <td style="width: 70px; text-align: right;">${this.formatNumber(pcs)}</td>
                <td style="width: 70px; text-align: right;">${this.formatNumber(qty)}</td>
                <td style="width: 50px; text-align: center;">${row.unit || ''}</td>
                <td style="width: 80px; text-align: right;">${this.formatNumber(amt)}</td>
                <td style="width: 70px; text-align: right;">${this.formatNumber(min)}</td>
                <td style="width: 70px; text-align: right;">${this.formatNumber(max)}</td>
                <td style="width: 70px; text-align: right;">${this.formatNumber(avg)}</td>
            `;

            tr.onclick = () => {
                this.selectRow(idx);
            };

            tbody.appendChild(tr);
        });

        document.getElementById('iss_tot_pcs').textContent = this.formatNumber(t_pcs);
        document.getElementById('iss_tot_qty').textContent = this.formatNumber(t_qty);
        document.getElementById('iss_tot_amt').textContent = this.formatNumber(t_amt);
    },

    handleKeydown: function(e) {
        const activeModal = document.querySelector('.modal-container[style*="display: block"]');
        if (!activeModal || !activeModal.querySelector('#iss_tbody_table')) return;

        const self = window.ItemSaleSummaryModule;
        if (self.reportData.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            self.selectRow(Math.min(self.selectedIndex + 1, self.reportData.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            self.selectRow(Math.max(self.selectedIndex - 1, 0));
        }
    },

    selectRow: function(index) {
        const tbody = document.getElementById('iss_tbody');
        if(!tbody) return;
        
        for (let i = 0; i < tbody.children.length; i++) {
            tbody.children[i].classList.remove('selected');
        }
        
        if (index >= 0 && index < tbody.children.length) {
            tbody.children[index].classList.add('selected');
            this.selectedIndex = index;
            tbody.children[index].scrollIntoView({block: 'nearest'});
        }
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
                <title>Item Sale Summary</title>
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
                    .tot-row { font-weight: bold; background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <div class="hdr">
                    <div class="hdr-left">${logoImg}</div>
                    <div class="hdr-center">
                        <h1>${companyName}</h1>
                        ${contactLine}
                        <h2>Item Sale Summary</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th class="text-left">Item Code</th>
                            <th class="text-left">HS Code</th>
                            <th class="text-left">Item Name</th>
                            <th>Pieces</th>
                            <th>Quantity</th>
                            <th>Unit</th>
                            <th>Amount</th>
                            <th>Minimum Rate</th>
                            <th>Maximum Rate</th>
                            <th>Average Rate</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let t_pcs = 0, t_qty = 0, t_amt = 0;

        this.reportData.forEach(row => {
            const pcs = parseFloat(row.total_pieces) || 0;
            const qty = parseFloat(row.total_quantity) || 0;
            const amt = parseFloat(row.total_amount) || 0;
            const min = parseFloat(row.min_rate) || 0;
            const max = parseFloat(row.max_rate) || 0;
            const avg = parseFloat(row.avg_rate) || 0;

            t_pcs += pcs; t_qty += qty; t_amt += amt;

            html += `
                <tr>
                    <td class="text-left">${row.item_code || ''}</td>
                    <td class="text-left">${row.hs_code || ''}</td>
                    <td class="text-left">${row.item_name || ''}</td>
                    <td class="text-right">${this.formatNumber(pcs)}</td>
                    <td class="text-right">${this.formatNumber(qty)}</td>
                    <td class="text-center">${row.unit || ''}</td>
                    <td class="text-right">${this.formatNumber(amt)}</td>
                    <td class="text-right">${this.formatNumber(min)}</td>
                    <td class="text-right">${this.formatNumber(max)}</td>
                    <td class="text-right">${this.formatNumber(avg)}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="3" class="text-right">Totals Rs.</td>
                            <td class="text-right">${this.formatNumber(t_pcs)}</td>
                            <td class="text-right">${this.formatNumber(t_qty)}</td>
                            <td></td>
                            <td class="text-right">${this.formatNumber(t_amt)}</td>
                            <td></td>
                            <td></td>
                            <td></td>
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

    exportExcel: function() {
        if (!this.reportData || this.reportData.length === 0) {
            alert('No data to export');
            return;
        }

        let csv = 'Item Code,HS Code,Item Name,Pieces,Quantity,Unit,Amount,Minimum Rate,Maximum Rate,Average Rate\n';
        let t_pcs = 0, t_qty = 0, t_amt = 0;

        this.reportData.forEach(row => {
            const pcs = parseFloat(row.total_pieces) || 0;
            const qty = parseFloat(row.total_quantity) || 0;
            const amt = parseFloat(row.total_amount) || 0;
            const min = parseFloat(row.min_rate) || 0;
            const max = parseFloat(row.max_rate) || 0;
            const avg = parseFloat(row.avg_rate) || 0;

            t_pcs += pcs; t_qty += qty; t_amt += amt;

            csv += `"${row.item_code || ''}","${row.hs_code || ''}","${row.item_name || ''}","${pcs}","${qty}","${row.unit || ''}","${amt}","${min}","${max}","${avg}"\n`;
        });

        csv += `Totals,,,${t_pcs},${t_qty},,${t_amt},,,\n`;

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', 'Item_Sale_Summary.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};
