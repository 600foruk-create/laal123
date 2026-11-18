window.ItemPurchaseAnalysisModule = {
    reportData: [],
    selectedIndex: -1,

    init: async function() {
        const self = window.ItemPurchaseAnalysisModule;
        
        // Date initialization
        const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        document.getElementById('ipa_date_from').value = today;
        document.getElementById('ipa_date_to').value = today;
        
        // Datepicker setup (assuming jQuery UI is available like in other modules)
        if (typeof $ !== 'undefined' && $.fn.datepicker) {
            $('#ipa_date_from').datepicker({ dateFormat: 'dd-M-y' });
            $('#ipa_date_to').datepicker({ dateFormat: 'dd-M-y' });
        }

        self.setupFilters();
        await self.loadLookups();
        self.bindEvents();
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

        toggleFilter('ipa_use_item', ['ipa_item_code', 'ipa_item_name']);
        toggleFilter('ipa_use_vendor', ['ipa_vendor_code', 'ipa_vendor_name']);
        toggleFilter('ipa_use_employee', ['ipa_employee']);
        toggleFilter('ipa_use_date', ['ipa_date_from', 'ipa_date_to']);
    },

    loadLookups: async function() {
        const self = window.ItemPurchaseAnalysisModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        try {
            // Employees
            const empRes = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            if (empRes.ok) {
                const employees = await empRes.json();
                if (!employees.error && Array.isArray(employees)) {
                    const sel = document.getElementById('ipa_employee');
                    sel.innerHTML = '<option value="">Select Employee...</option>';
                    employees.forEach(e => {
                        const opt = document.createElement('option');
                        opt.value = e.id;
                        opt.textContent = e.name;
                        sel.appendChild(opt);
                    });
                }
            }

            // Vendors
            const vendRes = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if (vendRes.ok) {
                const vendors = await vendRes.json();
                if (!vendors.error) {
                    self.setupSmartSearch('ipa_vendor_code', 'ipa_vendor_name', 'ipa_vendor_suggest_code', 'ipa_vendor_suggest_name', vendors, 'code', 'name');
                }
            }

            // Items
            const itemRes = await fetch(`api/item_purchase_analysis.php?action=get_items&company_id=${companyId}`);
            if (itemRes.ok) {
                const items = await itemRes.json();
                if (!items.error) {
                    self.setupSmartSearch('ipa_item_code', 'ipa_item_name', 'ipa_item_suggest_code', 'ipa_item_suggest_name', items, 'code', 'name');
                }
            }

        } catch(e) {
            console.error('Lookup load error:', e);
        }
    },

    setupSmartSearch: function(codeId, nameId, codeSuggId, nameSuggId, data, codeProp, nameProp) {
        const codeInput = document.getElementById(codeId);
        const nameInput = document.getElementById(nameId);
        const codeSugg = document.getElementById(codeSuggId);
        const nameSugg = document.getElementById(nameSuggId);

        let activeIndexCode = -1;
        let activeIndexName = -1;

        const hideSugg = (sugg) => { sugg.style.display = 'none'; sugg.innerHTML = ''; };

        const renderSugg = (sugg, items, input, isCode) => {
            sugg.innerHTML = '';
            if (items.length === 0) { hideSugg(sugg); return; }
            sugg.style.display = 'block';
            
            items.forEach((item, idx) => {
                const codeStr = item[codeProp] || '';
                const nameStr = item[nameProp] || '';
                
                const div = document.createElement('div');
                div.className = 'ps-suggest-item';
                div.style.padding = '6px 10px';
                div.style.cursor = 'pointer';
                div.style.fontSize = '12px';
                div.style.borderBottom = '1px solid #eee';
                div.style.whiteSpace = 'nowrap';
                div.style.overflow = 'hidden';
                div.style.textOverflow = 'ellipsis';
                div.style.color = '#333';
                div.style.background = '#fff';
                
                div.innerHTML = `<b>${codeStr}</b> &nbsp; ${nameStr}`;
                
                div.dataset.code = codeStr;
                div.dataset.name = nameStr;
                
                div.onclick = () => {
                    codeInput.value = codeStr;
                    nameInput.value = nameStr;
                    hideSugg(codeSugg);
                    hideSugg(nameSugg);
                };
                div.onmouseover = () => {
                    if (isCode) { activeIndexCode = idx; updateHighlight(codeSugg, activeIndexCode); }
                    else { activeIndexName = idx; updateHighlight(nameSugg, activeIndexName); }
                };
                div.onmouseout = () => {
                    if(!div.classList.contains('active')) {
                        div.style.background = '#fff';
                        div.style.color = '#333';
                    }
                };
                sugg.appendChild(div);
            });
            if(isCode) activeIndexCode = -1; else activeIndexName = -1;
        };

        const updateHighlight = (sugg, index) => {
            Array.from(sugg.children).forEach((c, i) => {
                if (i === index) {
                    c.classList.add('active');
                    c.style.background = '#1F4E79';
                    c.style.color = '#fff';
                } else {
                    c.classList.remove('active');
                    c.style.background = '#fff';
                    c.style.color = '#333';
                }
            });
        };

        codeInput.addEventListener('input', () => {
            const val = codeInput.value.toLowerCase().trim();
            if(!val) { hideSugg(codeSugg); nameInput.value = ''; return; }
            const filtered = data.filter(i => (i[codeProp]||'').toLowerCase().includes(val));
            renderSugg(codeSugg, filtered, codeInput, true);
        });

        nameInput.addEventListener('input', () => {
            const val = nameInput.value.toLowerCase().trim();
            if(!val) { hideSugg(nameSugg); codeInput.value = ''; return; }
            const filtered = data.filter(i => (i[nameProp]||'').toLowerCase().includes(val));
            renderSugg(nameSugg, filtered, nameInput, false);
        });

        const handleKeys = (e, sugg, isCode) => {
            if (sugg.style.display === 'none') return;
            const max = sugg.children.length - 1;
            let currentIdx = isCode ? activeIndexCode : activeIndexName;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentIdx = currentIdx < max ? currentIdx + 1 : max;
                if(isCode) activeIndexCode = currentIdx; else activeIndexName = currentIdx;
                updateHighlight(sugg, currentIdx);
                sugg.children[currentIdx].scrollIntoView({block: 'nearest'});
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentIdx = currentIdx > 0 ? currentIdx - 1 : 0;
                if(isCode) activeIndexCode = currentIdx; else activeIndexName = currentIdx;
                updateHighlight(sugg, currentIdx);
                sugg.children[currentIdx].scrollIntoView({block: 'nearest'});
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentIdx > -1 && sugg.children[currentIdx]) {
                    sugg.children[currentIdx].click();
                }
            }
        };

        codeInput.addEventListener('keydown', e => handleKeys(e, codeSugg, true));
        nameInput.addEventListener('keydown', e => handleKeys(e, nameSugg, false));

        document.addEventListener('click', (e) => {
            if (e.target !== codeInput && e.target !== codeSugg) hideSugg(codeSugg);
            if (e.target !== nameInput && e.target !== nameSugg) hideSugg(nameSugg);
        });
    },

    bindEvents: function() {
        const self = window.ItemPurchaseAnalysisModule;
        document.getElementById('ipa_btn_display').addEventListener('click', self.fetchData);
        document.getElementById('ipa_btn_print').addEventListener('click', self.printReport);
        document.addEventListener('keydown', self.handleKeyDown);
        
        document.getElementById('ipa_btn_inv_ledgers').addEventListener('click', () => {
            if(window.openModularPopup) {
                window.openModularPopup('Navigation/Reports/view_inventory_ledgers.html', 'fa-book', 'View Inventory Ledgers', () => {
                    if(window.ViewInventoryLedgersModule && typeof window.ViewInventoryLedgersModule.init === 'function') {
                        window.ViewInventoryLedgersModule.init();
                    }
                }, 'Inventory Ledgers', true, true);
            }
        });

        document.getElementById('ipa_btn_inv_balances').addEventListener('click', () => {
            if(window.openModularPopup) {
                window.openModularPopup('Navigation/Reports/inventory_balances.html', 'fa-boxes', 'Inventory Balances', () => {
                    if (window.InventoryBalancesModule && typeof window.InventoryBalancesModule.init === 'function') {
                        window.InventoryBalancesModule.init();
                    }
                }, 'Inventory Balances', true, true);
            }
        });
    },

    fetchData: async function() {
        const self = window.ItemPurchaseAnalysisModule;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;

        let url = `api/item_purchase_analysis.php?action=get_report_data&company_id=${companyId}`;

        // Get Filters
        const itemCode = document.getElementById('ipa_item_code').value.trim();
        if (itemCode) url += `&item_code=${encodeURIComponent(itemCode)}`;

        if (document.getElementById('ipa_use_vendor').checked) {
            url += `&vendor_code=${encodeURIComponent(document.getElementById('ipa_vendor_code').value.trim())}`;
        }
        if (document.getElementById('ipa_use_employee').checked) {
            url += `&employee_id=${encodeURIComponent(document.getElementById('ipa_employee').value)}`;
        }
        if (document.getElementById('ipa_use_date').checked) {
            url += `&date_from=${encodeURIComponent(document.getElementById('ipa_date_from').value)}`;
            url += `&date_to=${encodeURIComponent(document.getElementById('ipa_date_to').value)}`;
        }

        try {
            const res = await fetch(url);
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
        const self = window.ItemPurchaseAnalysisModule;
        const tbody = document.getElementById('ipa_tbody');
        tbody.innerHTML = '';
        
        let tQty=0, tGross=0, tDisc=0, tExcl=0, tSales=0, tFur=0, tIncl=0;

        self.reportData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            
            tr.onclick = () => {
                self.selectedIndex = idx;
                self.updateGridSelection();
            };
            
            tr.ondblclick = () => {
                self.openInvoice(row.invoice_no);
            };

            tr.innerHTML = `
                <td style="text-align:center;"><div class="par-row-pointer"></div></td>
                <td>${row.invoice_no || ''}</td>
                <td style="text-align: center;">${row.date || ''}</td>
                <td title="${row.vendor_name || ''}">${row.vendor_name || ''}</td>
                <td style="text-align: right;">${parseFloat(row.quantity||0).toFixed(2)}</td>
                <td style="text-align: center;">${row.unit || ''}</td>
                <td style="text-align: right;">${parseFloat(row.rate||0).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.gross_amount||0).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.discount||0).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.amt_excl_tax||0).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.sales_tax||0).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.fur_tax||0).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.amt_incl_tax||0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);

            tQty += parseFloat(row.quantity||0);
            tGross += parseFloat(row.gross_amount||0);
            tDisc += parseFloat(row.discount||0);
            tExcl += parseFloat(row.amt_excl_tax||0);
            tSales += parseFloat(row.sales_tax||0);
            tFur += parseFloat(row.fur_tax||0);
            tIncl += parseFloat(row.amt_incl_tax||0);
        });

        document.getElementById('ipa_tot_qty').textContent = tQty.toFixed(2);
        document.getElementById('ipa_tot_gross').textContent = tGross.toFixed(2);
        document.getElementById('ipa_tot_disc').textContent = tDisc.toFixed(2);
        document.getElementById('ipa_tot_excl').textContent = tExcl.toFixed(2);
        document.getElementById('ipa_tot_sales').textContent = tSales.toFixed(2);
        document.getElementById('ipa_tot_fur').textContent = tFur.toFixed(2);
        document.getElementById('ipa_tot_incl').textContent = tIncl.toFixed(2);
    },

    updateGridSelection: function() {
        const self = window.ItemPurchaseAnalysisModule;
        const tbody = document.getElementById('ipa_tbody');
        Array.from(tbody.children).forEach((row, idx) => {
            if (idx === self.selectedIndex) {
                row.classList.add('selected');
                row.scrollIntoView({ block: 'nearest' });
            } else {
                row.classList.remove('selected');
            }
        });
    },

    handleKeyDown: function(e) {
        const self = window.ItemPurchaseAnalysisModule;
        if(self.reportData.length === 0) return;
        
        // Prevent key down when typing in input or if inside another module
        const activeModule = e.target.closest('[data-module]')?.getAttribute('data-module');
        if (activeModule && activeModule !== 'Item Purchase Analysis') return;
        if (document.getElementById('modularPopup') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
            return;
        }

        if(e.key === 'ArrowDown') {
            e.preventDefault();
            if(self.selectedIndex < self.reportData.length - 1) {
                self.selectedIndex++;
                self.updateGridSelection();
            }
        } else if(e.key === 'ArrowUp') {
            e.preventDefault();
            if(self.selectedIndex > 0) {
                self.selectedIndex--;
                self.updateGridSelection();
            }
        } else if(e.key === 'Enter') {
            e.preventDefault();
            if (self.selectedIndex >= 0 && self.selectedIndex < self.reportData.length) {
                self.openInvoice(self.reportData[self.selectedIndex].invoice_no);
            }
        }
    },

    openInvoice: function(serialNo) {
        if (!serialNo) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        
        const initCb = async () => {
            try {
                if (window.PIModule && window.PIModule.init) await window.PIModule.init();
                const res = await fetch(`api/purchases.php?action=get_invoice&serial_no=${serialNo}&company_id=${companyId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error && window.PIModule && window.PIModule.loadInvoiceData) {
                        window.PIModule.loadInvoiceData(data);
                    }
                }
            } catch(e) { console.error("Error loading invoice:", e); }
        };
        
        if (window.openModularPopup) {
            window.openModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', initCb, 'Purchase Invoice', true, true);
        }
    },

    printReport: async function() {
        const self = window.ItemPurchaseAnalysisModule;
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
        if (document.getElementById('ipa_item_code').value) {
            filtersHtml += `<b>Item:</b> ${document.getElementById('ipa_item_name').value} &nbsp;&nbsp;`;
        }
        if (document.getElementById('ipa_use_vendor').checked) {
            filtersHtml += `<b>Vendor:</b> ${document.getElementById('ipa_vendor_name').value} &nbsp;&nbsp;`;
        }
        if (document.getElementById('ipa_use_employee').checked) {
            const sel = document.getElementById('ipa_employee');
            filtersHtml += `<b>Employee:</b> ${sel.options[sel.selectedIndex].text} &nbsp;&nbsp;`;
        }
        if (document.getElementById('ipa_use_date').checked) {
            filtersHtml += `<b>Period:</b> ${document.getElementById('ipa_date_from').value} to ${document.getElementById('ipa_date_to').value}`;
        }

        // Build a unified table
        const tableClone = document.createElement('table');
        
        // Header
        const theadClone = document.getElementById('ipa_table').querySelector('thead').cloneNode(true);
        if (theadClone.firstElementChild && theadClone.firstElementChild.firstElementChild) {
            theadClone.firstElementChild.removeChild(theadClone.firstElementChild.firstElementChild); // Remove pointer TH
        }
        tableClone.appendChild(theadClone);

        // Body
        const tbodyClone = document.getElementById('ipa_tbody').cloneNode(true);
        tbodyClone.querySelectorAll('tr').forEach(tr => {
            if (tr.firstElementChild) tr.removeChild(tr.firstElementChild); // Remove pointer TD
        });
        tableClone.appendChild(tbodyClone);

        // Remove inline widths and border overrides from ALL cells
        tableClone.querySelectorAll('tr').forEach(tr => {
            Array.from(tr.children).forEach(cell => {
                cell.style.width = '';
                cell.style.borderTop = '';
            });
        });

        let tQty = document.getElementById('ipa_tot_qty').textContent;
        let tGross = document.getElementById('ipa_tot_gross').textContent;
        let tDisc = document.getElementById('ipa_tot_disc').textContent;
        let tExcl = document.getElementById('ipa_tot_excl').textContent;
        let tSales = document.getElementById('ipa_tot_sales').textContent;
        let tFur = document.getElementById('ipa_tot_fur').textContent;
        let tIncl = document.getElementById('ipa_tot_incl').textContent;
        
        const tableFooterHtml = `
            <tr style="font-weight: bold; background: #c0c0c0;">
                <td style="border: 1px solid #000; padding: 4px; text-align: right; font-style: italic;" colspan="3">Totals</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tQty}</td>
                <td style="border: 1px solid #000; padding: 4px; background: #fff;"></td>
                <td style="border: 1px solid #000; padding: 4px; background: #fff;"></td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tGross}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tDisc}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tExcl}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tSales}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tFur}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right; background: #fff;">${tIncl}</td>
            </tr>
        `;
        
        const printContent = `<!DOCTYPE html>
        <html>
        <head>
            <title>Item Purchase Analysis</title>
            <base href="${baseUrl}/">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
            <style>
                @page { margin: 0; size: A4 landscape; }
                body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #000; margin: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .page-container { padding: 0; position: relative; box-sizing: border-box; }
                .header-area { display: flex; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 8px; margin-bottom: 12px; }
                .logo-box { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
                .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .company-info { flex: 1; padding-left: 15px; display: flex; flex-direction: column; justify-content: center; }
                .company-name { color: #1F4E79; font-size: 18px; font-weight: bold; margin: 0 0 4px 0; text-transform: uppercase; }
                
                .invoice-badge-area { text-align: right; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
                .invoice-title { color: #1F4E79; font-size: 14px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
                .invoice-type-badge { background: #FF8C00; color: white; padding: 3px 8px; font-size: 9px; font-weight: bold; border-radius: 4px; display: inline-block; text-transform: uppercase; }
                
                .filters-section { font-size: 9px; margin-bottom: 10px; background: #f8f9fa; padding: 6px; border: 1px solid #ddd; border-radius: 3px; }
                
                .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
                .grid-table th { background: #EAEAEA; border: 1px solid #000; padding: 3px; font-size: 9px; font-weight: bold; text-align: center; }
                .grid-table td { border: 1px solid #000; padding: 3px; font-size: 9px; word-wrap: break-word; }
                .grid-table tfoot td { border: 1px solid #000; padding: 3px; font-size: 9px; font-weight: bold; }
                
                .signature-line { border-top: 1px solid #000; width: 120px; text-align: center; font-weight: bold; font-size: 9px; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="page-container">
                <div class="header-area">
                    <div class="logo-box">
                        ${logoImg}
                    </div>
                    <div class="company-info">
                        <div class="company-name">${companyName}</div>
                        ${contactLine}
                    </div>
                    <div class="invoice-badge-area">
                        <div class="invoice-title">ITEM PURCHASE ANALYSIS</div>
                        <div class="invoice-type-badge">REPORT</div>
                    </div>
                </div>

                ${filtersHtml ? `<div class="filters-section">${filtersHtml}</div>` : ''}

                <table class="grid-table">
                    ${tableClone.innerHTML}
                    <tfoot>
                        ${tableFooterHtml}
                    </tfoot>
                </table>

                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                    <div><div class="signature-line">Prepared By</div></div>
                    <div><div class="signature-line">Checked By</div></div>
                    <div><div class="signature-line">Authorized Signatory</div></div>
                </div>
            </div>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
    }
};


