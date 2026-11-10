window.ItemPurchaseSummaryModule = {
    allVendors: [],
    reportData: [],
    selectedIndex: -1,

    init: function() {
        const self = window.ItemPurchaseSummaryModule;
        
        // Date Defaults
        const dateFrom = document.getElementById('ips_date_from');
        const dateTo = document.getElementById('ips_date_to');
        if (dateFrom && dateTo) {
            const today = new Date().toISOString().split('T')[0];
            dateFrom.value = today;
            dateTo.value = today;
        }

        // Checkboxes logic
        const toggleField = (chkId, fieldIds) => {
            const chk = document.getElementById(chkId);
            if (!chk) return;
            chk.addEventListener('change', function() {
                fieldIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.disabled = !this.checked;
                        if (!this.checked && el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'hidden')) {
                            el.value = '';
                        }
                    }
                });
                if (!this.checked && chkId === 'ips_use_vendor') {
                    const suggest = document.getElementById('ips_vendor_suggest');
                    if (suggest) suggest.style.display = 'none';
                }
            });
        };

        toggleField('ips_use_category', ['ips_category']);
        toggleField('ips_use_sub_category', ['ips_sub_category']);
        toggleField('ips_use_vendor_type', ['ips_vendor_type']);
        toggleField('ips_use_vendor', ['ips_vendor_code', 'ips_vendor_name', 'ips_vendor_id']);
        toggleField('ips_use_employee', ['ips_employee']);
        toggleField('ips_use_date', ['ips_date_from', 'ips_date_to']);

        document.getElementById('ips_category').addEventListener('change', function() {
            self.loadSubCategories(this.value);
        });

        self.loadLookups();
        self.setupSmartSearch();

        document.getElementById('ips_btn_display').addEventListener('click', () => self.fetchData());
        document.getElementById('ips_btn_print').addEventListener('click', () => self.printReport());
        document.getElementById('ips_btn_excel').addEventListener('click', () => self.exportExcel());

        document.removeEventListener('keydown', self.handleKeyDown);
        document.addEventListener('keydown', self.handleKeyDown);
    },

    loadLookups: async function() {
        const self = window.ItemPurchaseSummaryModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            // Main Categories
            let res = await fetch(`api/item_purchase_summary.php?action=get_item_categories&company_id=${companyId}`);
            if (res.ok) {
                const categories = await res.json();
                const sel = document.getElementById('ips_category');
                sel.innerHTML = '<option value="all">All</option>';
                categories.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
            }

            // Sub Categories (All by default)
            self.loadSubCategories('all');

            // Vendor Types
            res = await fetch(`api/item_purchase_summary.php?action=get_vendor_categories&company_id=${companyId}`);
            if (res.ok) {
                const types = await res.json();
                const sel = document.getElementById('ips_vendor_type');
                sel.innerHTML = '<option value="all">All</option>';
                types.forEach(t => sel.innerHTML += `<option value="${t.id}">${t.name}</option>`);
            }

            // Employees
            res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            if (res.ok) {
                const employees = await res.json();
                const sel = document.getElementById('ips_employee');
                sel.innerHTML = '<option value="">Select Employee...</option>';
                employees.forEach(e => sel.innerHTML += `<option value="${e.id}">${e.name}</option>`);
            }

            // Vendors for Smart Search
            res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                if (!data.error) self.allVendors = data;
            }
        } catch (e) {
            console.error("Error loading lookups", e);
        }
    },

    loadSubCategories: async function(mainId) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            let url = `api/item_purchase_summary.php?action=get_item_sub_categories&company_id=${companyId}`;
            if (mainId !== 'all') {
                url += `&main_id=${mainId}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const subCats = await res.json();
                const sel = document.getElementById('ips_sub_category');
                sel.innerHTML = '<option value="all">All</option>';
                subCats.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
            }
        } catch (e) {
            console.error("Error loading sub categories", e);
        }
    },

    setupSmartSearch: function() {
        const self = window.ItemPurchaseSummaryModule;
        const codeInput = document.getElementById('ips_vendor_code');
        const nameInput = document.getElementById('ips_vendor_name');
        const suggest = document.getElementById('ips_vendor_suggest');
        const hiddenInput = document.getElementById('ips_vendor_id');
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const dataSource = self.allVendors || [];
            
            const filtered = dataSource.filter(item => {
                const code = String(item.account_code || item.code || item.item_code || '').toLowerCase();
                const name = String(item.account_name || item.name || item.description || item.item_name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20);

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item, idx) => {
                    const code = item.account_code || item.code || item.item_code || '';
                    const name = item.account_name || item.name || item.description || item.item_name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div class="ps-suggest-item" style="padding: 2px 5px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.ItemPurchaseSummaryModule.selectSuggestion(${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
                         <b>${code}</b> &nbsp; ${name}
                    </div>`;
                }).join('');
                suggest.style.display = 'block';
            } else {
                suggest.style.display = 'none';
            }
        };

        const onInput = (e) => {
            hiddenInput.value = ''; 
            document.getElementById('ips_vendor_code').dataset.id = '';
            handleSearch(e.target.value.trim());
        };

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
            const items = suggest.querySelectorAll('.ps-suggest-item');
            if (suggest.style.display === 'block' && items.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
                    updateHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    suggestIndex = Math.max(suggestIndex - 1, 0);
                    updateHighlight(items);
                } else if (e.key === 'Enter' && suggestIndex > -1) {
                    e.preventDefault();
                    items[suggestIndex].click();
                }
            }
        };

        codeInput.addEventListener('input', onInput);
        nameInput.addEventListener('input', onInput);
        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);

        codeInput.addEventListener('focus', function() { this.select(); });
        nameInput.addEventListener('focus', function() { this.select(); });

        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
            }
        });
    },

    selectSuggestion: function(id, code, name) {
        document.getElementById('ips_vendor_id').value = id;
        document.getElementById('ips_vendor_code').dataset.id = id;
        document.getElementById('ips_vendor_code').value = code;
        document.getElementById('ips_vendor_name').value = name;
        document.getElementById('ips_vendor_suggest').style.display = 'none';
    },

    fetchData: async function() {
        const self = window.ItemPurchaseSummaryModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        let url = `api/item_purchase_summary.php?action=get_report_data&company_id=${companyId}`;

        const taxFilter = document.querySelector('input[name="ips_tax_filter"]:checked').value;
        url += `&tax_filter=${taxFilter}`;

        if (document.getElementById('ips_use_category').checked) {
            url += `&item_category_id=${document.getElementById('ips_category').value}`;
        }
        if (document.getElementById('ips_use_sub_category').checked) {
            url += `&item_sub_category_id=${document.getElementById('ips_sub_category').value}`;
        }
        if (document.getElementById('ips_use_vendor_type').checked) {
            url += `&vendor_type_id=${document.getElementById('ips_vendor_type').value}`;
        }
        if (document.getElementById('ips_use_vendor').checked) {
            const vId = document.getElementById('ips_vendor_code').dataset.id || document.getElementById('ips_vendor_id').value;
            if (vId) url += `&vendor_id=${vId}`;
        }
        if (document.getElementById('ips_use_employee').checked) {
            url += `&employee_id=${document.getElementById('ips_employee').value}`;
        }
        if (document.getElementById('ips_use_date').checked) {
            url += `&date_from=${document.getElementById('ips_date_from').value}`;
            url += `&date_to=${document.getElementById('ips_date_to').value}`;
        }

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Network response was not ok");
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            self.reportData = data;
            self.selectedIndex = -1;
            self.renderMainGrid();
        } catch (e) {
            console.error("Error fetching report data:", e);
            alert("Error fetching data: " + e.message);
        }
    },

    renderMainGrid: function() {
        const self = window.ItemPurchaseSummaryModule;
        const tbody = document.getElementById('ips_tbody');
        tbody.innerHTML = '';

        let totalQty = 0;
        let totalAmt = 0;

        self.reportData.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index;
            tr.onclick = function() {
                self.selectedIndex = parseInt(this.dataset.index);
                self.updateGridSelection();
            };

            const qty = parseFloat(row.total_quantity) || 0;
            const amt = parseFloat(row.total_amount) || 0;
            const minRate = parseFloat(row.min_rate) || 0;
            const maxRate = parseFloat(row.max_rate) || 0;
            const avgRate = parseFloat(row.avg_rate) || 0;

            totalQty += qty;
            totalAmt += amt;

            tr.innerHTML = `
                <td style="text-align: center;"><span class="par-row-pointer"></span></td>
                <td style="text-align: left;">${row.item_code || ''}</td>
                <td style="text-align: left;">${row.item_name || ''}</td>
                <td style="text-align: right;">${qty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: center;">${row.unit || ''}</td>
                <td style="text-align: right;">${amt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right;">${minRate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right;">${maxRate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right;">${avgRate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('ips_tot_qty').textContent = totalQty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('ips_tot_amt').textContent = totalAmt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        
        const container = document.getElementById('ips_table_container');
        if (container) {
            container.focus();
        }
    },

    updateGridSelection: function() {
        const self = window.ItemPurchaseSummaryModule;
        const tbody = document.getElementById('ips_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, idx) => {
            if (idx === self.selectedIndex) {
                row.classList.add('selected');
                row.scrollIntoView({ block: 'nearest' });
            } else {
                row.classList.remove('selected');
            }
        });
    },

    handleKeyDown: function(e) {
        const self = window.ItemPurchaseSummaryModule;
        const container = document.getElementById('ips_table_container');
        if (!container || (!container.contains(document.activeElement) && document.activeElement !== container)) {
            return;
        }

        if (self.reportData.length === 0) return;
        
        const tbl = document.getElementById('ips_table');
        if (!tbl || !tbl.offsetParent) return;

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        if (e.key === 'ArrowDown' && self.selectedIndex === -1) {
            e.preventDefault();
            self.selectedIndex = 0;
            self.updateGridSelection();
        } else if (e.key === 'ArrowUp' && self.selectedIndex === -1) {
            e.preventDefault();
            self.selectedIndex = 0;
            self.updateGridSelection();
        }
    },

    printReport: async function() {
        const self = window.ItemPurchaseSummaryModule;
        if (self.reportData.length === 0) {
            alert("No data to print.");
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
        } catch(e) { console.error('Could not fetch company info for print:', e); }

        const companyName = companyInfo.name || session.company_name || 'SOFTIFYX TECHNOLOGIES';
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

        let filtersHtml = '';
        if (document.getElementById('ips_use_category').checked) {
            const sel = document.getElementById('ips_category');
            filtersHtml += `<b>Category:</b> ${sel.options[sel.selectedIndex].text} &nbsp;&nbsp;`;
        }
        if (document.getElementById('ips_use_sub_category').checked) {
            const sel = document.getElementById('ips_sub_category');
            filtersHtml += `<b>Sub Category:</b> ${sel.options[sel.selectedIndex].text} &nbsp;&nbsp;`;
        }
        if (document.getElementById('ips_use_vendor').checked) {
            filtersHtml += `<b>Vendor:</b> ${document.getElementById('ips_vendor_name').value} &nbsp;&nbsp;`;
        }
        if (document.getElementById('ips_use_date').checked) {
            filtersHtml += `<b>Period:</b> ${document.getElementById('ips_date_from').value} to ${document.getElementById('ips_date_to').value}`;
        }
        
        const taxFilter = document.querySelector('input[name="ips_tax_filter"]:checked');
        const taxLabel = taxFilter ? taxFilter.nextSibling.textContent.trim() : 'All Purchases';
        filtersHtml = `<b>Type:</b> ${taxLabel} &nbsp;&nbsp;` + filtersHtml;

        // Build a unified table
        const tableClone = document.createElement('table');
        
        // Header
        const theadClone = document.getElementById('ips_table').querySelector('thead').cloneNode(true);
        if (theadClone.firstElementChild && theadClone.firstElementChild.firstElementChild) {
            theadClone.firstElementChild.removeChild(theadClone.firstElementChild.firstElementChild); // Remove pointer TH
        }
        tableClone.appendChild(theadClone);

        // Body
        const tbodyClone = document.getElementById('ips_tbody').cloneNode(true);
        tbodyClone.querySelectorAll('tr').forEach(tr => {
            if (tr.firstElementChild) tr.removeChild(tr.firstElementChild); // Remove pointer TD
        });
        tableClone.appendChild(tbodyClone);

        // Remove inline widths and border overrides from ALL cells
        if (tableClone.querySelector('thead')) tableClone.querySelector('thead').removeAttribute('style');
        tableClone.removeAttribute('class');
        tableClone.querySelectorAll('*').forEach(el => {
            if (el.style.width) el.style.width = '';
            if (el.tagName === 'TH' || el.tagName === 'TD') {
                el.style.border = '1px solid #000';
            }
        });

        let totalQty = document.getElementById('ips_tot_qty').textContent;
        let totalAmt = document.getElementById('ips_tot_amt').textContent;
        
        const tableFooterHtml = `
            <tr style="font-weight: bold; background: #f0f0f0;">
                <td style="border: 1px solid #000; padding: 4px; text-align: right; font-style: italic;" colspan="2">Totals</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${totalQty}</td>
                <td style="border: 1px solid #000; padding: 4px; background: #fff;"></td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${totalAmt}</td>
                <td style="border: 1px solid #000; padding: 4px; background: #fff;"></td>
                <td style="border: 1px solid #000; padding: 4px; background: #fff;"></td>
                <td style="border: 1px solid #000; padding: 4px; background: #fff;"></td>
            </tr>
        `;
        tableClone.querySelector('tbody').insertAdjacentHTML('beforeend', tableFooterHtml);

        const printContent = `<!DOCTYPE html>
        <html>
        <head>
            <title>Item Purchase Summary</title>
            <base href="${baseUrl}">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
            <style>
                @page { margin: 0; size: A4 portrait; }
                body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #000; margin: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .page-container { padding: 0; position: relative; box-sizing: border-box; }
                .header-area { display: flex; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 8px; margin-bottom: 12px; }
                .logo-box { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
                .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .company-info { flex: 1; padding-left: 15px; display: flex; flex-direction: column; justify-content: center; }
                .company-name { color: #1F4E79; font-size: 18px; font-weight: bold; margin: 0 0 8px 0; text-transform: uppercase; }
                .company-contacts { font-size: 9px; line-height: 1.6; }
                .company-contacts i { color: #1F4E79; width: 12px; text-align: center; margin-right: 3px; }
                .contact-row { display: flex; align-items: center; gap: 15px; margin-bottom: 3px; }
                .invoice-badge-area { text-align: right; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
                .invoice-title { color: #1F4E79; font-size: 12px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; text-align: right; }
                table { width: 100%; border-collapse: collapse; font-size: 9px; }
                th, td { border: 1px solid #000; padding: 2px 3px; }
                th { background: #f0f0f0; font-weight: bold; }
                .par-row-pointer { display: none !important; }
            </style>
        </head>
        <body>
        <div class="page-container">
            <div class="header-area">
                <div class="logo-box">
                    <img src="${actualLogo}" alt="Logo" onerror="this.style.display='none'">
                </div>
                <div class="company-info">
                    <div class="company-name">${companyName}</div>
                    <div class="company-contacts">
                        <div class="contact-row"><span><i class="fas fa-map-marker-alt"></i> ${companyInfo.address || ''}</span></div>
                        <div class="contact-row">
                            <span><i class="fas fa-phone-alt"></i> ${companyInfo.phone || ''}</span>
                            <span><i class="fas fa-envelope"></i> ${companyInfo.email || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="invoice-badge-area">
                    <div class="invoice-title">Item Purchase Summary</div>
                </div>
            </div>

            ${filtersHtml ? `<div style="margin-bottom:10px; font-weight:bold; font-size:10px; color:#333;">${filtersHtml}</div>` : ''}

            ${tableClone.outerHTML}
            
            <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                <span>Printed by: ${userName}</span>
                <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
            </div>
        </div>
        <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
        </html>`;

        const printWin = window.open('', '_blank');
        printWin.document.write(printContent);
        printWin.document.close();
        printWin.focus();
    },

    exportExcel: function() {
        const self = window.ItemPurchaseSummaryModule;
        if (self.reportData.length === 0) {
            alert("No data to export.");
            return;
        }

        let csv = "Item Code,Item Name,Quantity,Unit,Amount,Minimum Rate,Maximum Rate,Average Rate\n";
        
        self.reportData.forEach(row => {
            const code = `"${String(row.item_code || '').replace(/"/g, '""')}"`;
            const name = `"${String(row.item_name || '').replace(/"/g, '""')}"`;
            const qty = row.total_quantity || 0;
            const unit = row.unit || '';
            const amt = row.total_amount || 0;
            const minR = row.min_rate || 0;
            const maxR = row.max_rate || 0;
            const avgR = row.avg_rate || 0;
            csv += `${code},${name},${qty},${unit},${amt},${minR},${maxR},${avgR}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Item_Purchase_Summary.csv';
        a.click();
        URL.revokeObjectURL(url);
    }
};
