window.MaterialConsumptionReportModule = {
    reportData: [],
    selectedIndex: -1,
    categoriesData: [],
    subCategoriesData: [],

    init: async function() {
        const self = window.MaterialConsumptionReportModule;
        
        // Date initialization
        const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        document.getElementById('mcr_date_from').value = today;
        document.getElementById('mcr_date_to').value = today;
        
        // Datepicker setup if available
        if (typeof $ !== 'undefined' && $.fn.datepicker) {
            $('#mcr_date_from').datepicker({ dateFormat: 'dd-M-y' });
            $('#mcr_date_to').datepicker({ dateFormat: 'dd-M-y' });
        }

        self.setupFilters();
        self.bindEvents();
        await self.loadLookups();
    },

    setupFilters: function() {
        const toggleFilter = (chkId, inputs) => {
            const chk = document.getElementById(chkId);
            chk.addEventListener('change', () => {
                inputs.forEach(id => {
                    document.getElementById(id).disabled = !chk.checked;
                    if(!chk.checked) document.getElementById(id).value = '';
                });
            });
        };

        // Radio logic for category
        const allItemsRad = document.getElementById('mcr_all_items');
        const selCatRad = document.getElementById('mcr_select_cat');
        const toggleCatMode = () => {
            const disabled = allItemsRad.checked;
            document.getElementById('mcr_category').disabled = disabled;
            if(disabled) {
                document.getElementById('mcr_category').value = '';
            }
        };
        allItemsRad.addEventListener('change', toggleCatMode);
        selCatRad.addEventListener('change', toggleCatMode);

        toggleFilter('mcr_use_subcat', ['mcr_sub_category']);
        toggleFilter('mcr_use_location', ['mcr_location']);
        toggleFilter('mcr_use_date', ['mcr_date_from', 'mcr_date_to']);
    },

    bindEvents: function() {
        const self = window.MaterialConsumptionReportModule;
        document.getElementById('mcr_btn_display').onclick = self.fetchReport;
        document.getElementById('mcr_btn_print').onclick = self.printReport;
        document.getElementById('mcr_btn_excel').onclick = self.exportExcel;
        // Navigation is handled globally by app.js for all modal tables
    },

    loadLookups: async function() {
        const self = window.MaterialConsumptionReportModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        try {
            const treeRes = await fetch(`api/inventory.php?action=get_inventory_tree&company_id=${companyId}`);
            if (treeRes.ok) {
                const tree = await treeRes.json();
                if (tree && !tree.error) {
                    const catSel = document.getElementById('mcr_category');
                    catSel.innerHTML = '<option value="">Select Category...</option>';
                    if (Array.isArray(tree.mains)) {
                        tree.mains.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.id;
                            opt.textContent = `${c.code} - ${c.name}`;
                            catSel.appendChild(opt);
                        });
                    }

                    const subSel = document.getElementById('mcr_sub_category');
                    const allSubs = Array.isArray(tree.subs) ? tree.subs : [];
                    
                    const renderSubs = (mainId) => {
                        subSel.innerHTML = '<option value="">Select Sub Category...</option>';
                        allSubs.forEach(s => {
                            if (!mainId || String(s.main_id) === String(mainId)) {
                                const opt = document.createElement('option');
                                opt.value = s.id;
                                opt.textContent = `${s.code} - ${s.name}`;
                                subSel.appendChild(opt);
                            }
                        });
                    };

                    renderSubs(); // Initial render

                    catSel.addEventListener('change', (e) => {
                        renderSubs(e.target.value);
                        subSel.value = ''; // Reset sub category selection when main changes
                    });
                }
            }

            // Locations
            const locRes = await fetch(`api/inventory.php?action=get_locations&company_id=${companyId}`);
            if (locRes.ok) {
                const locs = await locRes.json();
                if (!locs.error && Array.isArray(locs)) {
                    const locSel = document.getElementById('mcr_location');
                    locSel.innerHTML = '<option value="">Select Location...</option>';
                    locs.forEach(l => {
                        const opt = document.createElement('option');
                        opt.value = l.id;
                        opt.textContent = l.name;
                        locSel.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.error('Error loading lookups', e);
        }
    },
    fetchReport: async function() {
        const self = window.MaterialConsumptionReportModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        let url = `api/material_consumption_report.php?action=get_data&company_id=${companyId}`;
        
        if (document.getElementById('mcr_select_cat').checked) {
            const catId = document.getElementById('mcr_category').value;
            if (!catId) { alert("Please select a valid Category."); return; }
            url += `&category_id=${catId}`;
        }

        if (document.getElementById('mcr_use_subcat').checked) {
            const subId = document.getElementById('mcr_sub_category').value;
            if (!subId) { alert("Please select a valid Sub Category."); return; }
            url += `&sub_category_id=${subId}`;
        }

        if (document.getElementById('mcr_use_location').checked) {
            const locId = document.getElementById('mcr_location').value;
            if (!locId) { alert("Please select a valid Location."); return; }
            url += `&location_id=${locId}`;
        }

        if (document.getElementById('mcr_use_date').checked) {
            const fd = document.getElementById('mcr_date_from').value;
            const td = document.getElementById('mcr_date_to').value;
            if(!fd || !td) { alert("Please enter valid dates."); return; }
            url += `&from_date=${fd}&to_date=${td}`;
        }

        url += `&_t=${Date.now()}`;

        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data.error) {
                    alert(data.error);
                } else {
                    self.reportData = data;
                    self.selectedIndex = -1;
                    self.renderMainGrid();
                }
            } else {
                alert("Failed to fetch data.");
            }
        } catch (e) {
            console.error(e);
            alert("Error fetching data.");
        }
    },

    renderMainGrid: function() {
        const self = window.MaterialConsumptionReportModule;
        const tbody = document.getElementById('mcr_tbody');
        tbody.innerHTML = '';
        
        let tQty = 0, tAmt = 0;

        self.reportData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            
            tr.onclick = () => {
                self.selectedIndex = idx;
                self.updateGridSelection();
            };

            const qty = parseFloat(row.total_qty || 0);
            const amt = parseFloat(row.total_amount || 0);
            const avgRate = qty > 0 ? (amt / qty) : 0;

            tr.innerHTML = `
                <td style="width: 25px; border-right: 1px solid #999; padding: 2px; text-align:center;"></td>
                <td style="width: 100px; border-right: 1px solid #999; padding: 2px;">${row.item_code || ''}</td>
                <td style="width: 90px; border-right: 1px solid #999; padding: 2px;">${row.hs_code || ''}</td>
                <td style="border-right: 1px solid #999; padding: 2px;" title="${row.item_name || ''}">${row.item_name || ''}</td>
                <td style="width: 90px; border-right: 1px solid #999; padding: 2px; text-align: right;">${qty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 50px; border-right: 1px solid #999; padding: 2px; text-align: center;">${row.unit || ''}</td>
                <td style="width: 90px; border-right: 1px solid #999; padding: 2px; text-align: right;">${avgRate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="width: 100px; padding: 2px; text-align: right;">${amt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            `;
            tbody.appendChild(tr);

            tQty += qty;
            tAmt += amt;
        });

        document.getElementById('mcr_tot_qty').innerText = tQty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('mcr_tot_amt').innerText = tAmt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },

    updateGridSelection: function() {
        const self = window.MaterialConsumptionReportModule;
        const tbody = document.getElementById('mcr_tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((r, idx) => {
            if (idx === self.selectedIndex) {
                r.classList.add('selected');
                r.cells[0].innerHTML = '<div class="mcr-row-pointer"></div>';
            } else {
                r.classList.remove('selected');
                r.cells[0].innerHTML = '';
            }
        });
    },

    printReport: async function() {
        const self = window.MaterialConsumptionReportModule;
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
                <title>Material Consumption Report</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                    @page { margin: 10mm; }
                    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
                    .hdr-left { width: 100px; text-align: left; }
                    .hdr-center { flex: 1; text-align: center; }
                    .hdr-right { width: 100px; text-align: right; }
                    .hdr h1 { margin: 0; font-size: 16px; }
                    .hdr h2 { margin: 4px 0 0; font-size: 13px; color: #555; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #000; padding: 4px; text-align: center; white-space: nowrap; }
                    th { background-color: #f0f0f0; }
                    .text-left { text-align: left; }
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
                        <h2>Material Consumption Report</h2>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th style="width: 13%;">Item Code</th>
                            <th style="width: 12%;">HS Code</th>
                            <th class="text-left" style="width: 35%;">Item Name</th>
                            <th class="text-right" style="width: 10%;">Quantity</th>
                            <th style="width: 5%;">Unit</th>
                            <th class="text-right" style="width: 12%;">Average Rate</th>
                            <th class="text-right" style="width: 13%;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let tQty = 0, tAmt = 0;

        self.reportData.forEach(row => {
            const qty = parseFloat(row.total_qty || 0);
            const amt = parseFloat(row.total_amount || 0);
            const avgRate = qty > 0 ? (amt / qty) : 0;

            html += `
                <tr>
                    <td>${row.item_code || ''}</td>
                    <td>${row.hs_code || ''}</td>
                    <td class="text-left">${row.item_name || ''}</td>
                    <td class="text-right">${qty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td>${row.unit || ''}</td>
                    <td class="text-right">${avgRate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="text-right">${amt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
            `;
            tQty += qty;
            tAmt += amt;
        });

        html += `
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="3" class="text-right">Totals</td>
                            <td class="text-right">${tQty.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td></td>
                            <td></td>
                            <td class="text-right">${tAmt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="display:flex; justify-content:space-between; color:#777; font-size:9px; margin-top:15px; font-style:italic;">
                    <span>Printed by: ${userName}</span>
                    <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
                </div>
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
            </html>
        `;

        const printWin = window.open('', '_blank');
        printWin.document.write(html);
        printWin.document.close();
    },

    exportExcel: function() {
        const self = window.MaterialConsumptionReportModule;
        if (self.reportData.length === 0) {
            alert("No data to export.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Item Code,HS Code,Item Name,Quantity,Unit,Average Rate,Amount\n";

        let tQty = 0, tAmt = 0;

        self.reportData.forEach(row => {
            const qty = parseFloat(row.total_qty || 0);
            const amt = parseFloat(row.total_amount || 0);
            const avgRate = qty > 0 ? (amt / qty) : 0;
            
            const name = `"${(row.item_name || '').replace(/"/g, '""')}"`;
            csvContent += `${row.item_code || ''},${row.hs_code || ''},${name},${qty},${row.unit || ''},${avgRate},${amt}\n`;
            
            tQty += qty;
            tAmt += amt;
        });

        csvContent += `,,,Totals,${tQty},,${tAmt}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Material_Consumption_Report.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
