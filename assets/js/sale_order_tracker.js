window.SaleOrderTracker = {
    recordsCount: 0,
    selectedIndex: -1,
    isKeydownBound: false,
    customersLoaded: false,
    itemsLoaded: false,
    masterData: [],

    init: function() {
        const self = window.SaleOrderTracker;
        
        // Reset state
        self.recordsCount = 0;
        self.selectedIndex = -1;
        self.masterData = [];
        const masterTbody = document.getElementById('sot_master_tbody');
        if (masterTbody) masterTbody.innerHTML = '';
        const masterTfoot = document.getElementById('sot_master_tfoot');
        if (masterTfoot) masterTfoot.innerHTML = '';
        const badges = document.getElementById('sot_summary_badges');
        if (badges) badges.innerHTML = '';

        // Bind keyboard navigation
        if (!self.isKeydownBound) {
            document.addEventListener('keydown', self.handleKeydown);
            self.isKeydownBound = true;
        }

        // Initialize Smart Searches locally
        self.allCustomers = [];
        self.allItems = [];
        self.loadData();
    },

    loadData: async function() {
        const self = window.SaleOrderTracker;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${companyId}`);
            if(res.ok) {
                const data = await res.json();
                self.allCustomers = Array.isArray(data) ? data : [];
            }
        } catch (e) { console.error('[SOT] Customer fetch error:', e); }

        try {
            const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}`);
            if(res.ok) {
                const data = await res.json();
                self.allItems = Array.isArray(data) ? data : [];
            }
        } catch (e) { console.error('[SOT] Items fetch error:', e); }

        try {
            const res = await fetch(`api/sale_order_tracker.php?action=get_orders&company_id=${companyId}`);
            if(res.ok) {
                const data = await res.json();
                if (data.status === 'success' && data.records) {
                    const select = document.getElementById('sot_order_no');
                    if (select) {
                        select.innerHTML = '<option value="ALL">ALL (All Orders / Items)</option>';
                        data.records.forEach(order => {
                            const dateStr = order.date ? new Date(order.date).toLocaleDateString('en-GB') : '';
                            const customer = order.customer_name || '';
                            const optionText = `${order.order_no} (Dated ${dateStr}) ${customer}`.trim();
                            select.innerHTML += `<option value="${order.order_no}">${optionText}</option>`;
                        });
                    }
                }
            }
        } catch (e) { console.error('[SOT] Orders fetch error:', e); }

        self.setupSmartSearch('sot_customer_code', 'sot_customer_name', 'sot_customer_suggest', 'sot_customer_id', 'customer');
        self.setupSmartSearch('sot_item_code', 'sot_item_name', 'sot_item_suggest', 'sot_item_id', 'item');
        
        // Ensure filters are in correct initial state
        self.toggleFilters();

        // Automatically trigger search to display initial tracking data
        self.search();
    },

    setupSmartSearch: function(codeId, nameId, suggestId, hiddenId, type) {
        const self = window.SaleOrderTracker;
        const codeInput = document.getElementById(codeId);
        const nameInput = document.getElementById(nameId);
        const suggest = document.getElementById(suggestId);
        const hiddenInput = document.getElementById(hiddenId);
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const dataSource = type === 'customer' ? self.allCustomers : self.allItems;
            
            const filtered = dataSource.filter(item => {
                const code = String(item.account_code || item.code || item.item_code || '').toLowerCase();
                const name = String(item.account_name || item.name || item.description || item.item_name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20);

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item) => {
                    const code = item.account_code || item.code || item.item_code || '';
                    const name = item.account_name || item.name || item.description || item.item_name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div class="pot-suggest-item" style="padding: 6px 10px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.SaleOrderTracker.selectSuggestion('${codeId}', '${nameId}', '${hiddenId}', '${suggestId}', ${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
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
            handleSearch(e.target.value.trim());
        };
        codeInput.addEventListener('input', onInput);
        nameInput.addEventListener('input', onInput);

        codeInput.addEventListener('focus', function() { this.select(); });
        nameInput.addEventListener('focus', function() { this.select(); });

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
                } else if (e.key === 'Enter' && suggestIndex > -1) {
                    e.preventDefault();
                    items[suggestIndex].click();
                }
            }
        };

        codeInput.addEventListener('keydown', onKeydown);
        nameInput.addEventListener('keydown', onKeydown);

        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !codeInput.contains(e.target) && !suggest.contains(e.target)) {
                suggest.style.display = 'none';
                suggestIndex = -1;
            }
        });
    },

    selectSuggestion: function(codeId, nameId, hiddenId, suggestId, id, code, name) {
        document.getElementById(hiddenId).value = id;
        document.getElementById(codeId).value = code;
        document.getElementById(nameId).value = name;
        document.getElementById(suggestId).style.display = 'none';
        this.search();
    },

    toggleFilters: function() {
        const chkOrder = document.getElementById('chk_sot_order').checked;
        document.getElementById('sot_order_no').disabled = !chkOrder;
        document.getElementById('sot_from_date').disabled = !chkOrder;
        document.getElementById('sot_to_date').disabled = !chkOrder;

        const chkcustomer = document.getElementById('chk_sot_customer').checked;
        document.getElementById('sot_customer_code').disabled = !chkcustomer;
        document.getElementById('sot_customer_name').disabled = !chkcustomer;
        if(!chkcustomer) {
            document.getElementById('sot_customer_id').value = '';
            document.getElementById('sot_customer_code').value = '';
            document.getElementById('sot_customer_name').value = '';
        }

        const chkItem = document.getElementById('chk_sot_item').checked;
        document.getElementById('sot_item_code').disabled = !chkItem;
        document.getElementById('sot_item_name').disabled = !chkItem;
        if(!chkItem) {
            document.getElementById('sot_item_id').value = '';
            document.getElementById('sot_item_code').value = '';
            document.getElementById('sot_item_name').value = '';
        }
    },

    search: async function() {
        const self = window.SaleOrderTracker;
        const masterTbody = document.getElementById('sot_master_tbody');
        const masterTfoot = document.getElementById('sot_master_tfoot');
        const loading = document.getElementById('sot_master_loading');
        const badgesContainer = document.getElementById('sot_summary_badges');
        
        if (masterTbody) masterTbody.innerHTML = '';
        if (masterTfoot) masterTfoot.innerHTML = '';
        if (loading) loading.style.display = 'block';

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        let url = `api/sale_order_tracker.php?action=get_master&company_id=${companyId}`;

        if (document.getElementById('chk_sot_order')?.checked) {
            const orderNo = document.getElementById('sot_order_no')?.value.trim();
            const fromDate = document.getElementById('sot_from_date')?.value;
            const toDate = document.getElementById('sot_to_date')?.value;
            if (orderNo) url += `&order_no=${encodeURIComponent(orderNo)}`;
            if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
            if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;
        }
        
        if (document.getElementById('chk_sot_customer')?.checked) {
            const customerId = document.getElementById('sot_customer_id')?.value;
            if (customerId) {
                url += `&customer_id=${encodeURIComponent(customerId)}`;
            }
        }

        if (document.getElementById('chk_sot_item')?.checked) {
            const itemId = document.getElementById('sot_item_id')?.value;
            if (itemId) {
                url += `&item_id=${encodeURIComponent(itemId)}`;
            }
        }

        try {
            const res = await fetch(url);
            const result = await res.json();
            if (loading) loading.style.display = 'none';

            if (result.status === 'success') {
                self.masterData = result.records || [];
                self.recordsCount = self.masterData.length;
                self.selectedIndex = -1;
                
                let html = '';
                let totalInOrder = 0;
                let shortageCount = 0;
                let instockCount = 0;

                const formatNum = (v) => {
                    const n = parseFloat(v || 0);
                    if (Number.isInteger(n)) return n.toLocaleString('en-US');
                    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                };

                self.masterData.forEach((row, index) => {
                    const dateStr = row.date ? new Date(row.date).toLocaleDateString('en-GB') : '';
                    const totalStock = parseFloat(row.total_stock) || 0;
                    const inOrder = parseFloat(row.in_order) || 0;
                    const resultVal = parseFloat(row.result) || 0;
                    const unit = row.unit || (row.is_fitting ? 'Ctn' : 'Pcs');
                    const isShortage = resultVal < 0;

                    totalInOrder += inOrder;
                    if (isShortage) shortageCount++;
                    else instockCount++;

                    const resultColor = isShortage ? '#dc2626' : '#15803d';
                    const resultBg = isShortage ? '#fee2e2' : '#dcfce7';
                    const safeOrderNo = String(row.order_no ?? '-').replace(/'/g, "\\'");

                    html += `
                        <tr onclick="window.SaleOrderTracker.selectRow(${index})" ondblclick="window.SaleOrderTracker.openOrder('${safeOrderNo}')" title="Click to select, Double click to view Sale Order" style="cursor: pointer; border-bottom: 1px solid #cbd5e1;">
                            <td style="text-align: center; color: #64748b; font-weight: bold;">${index + 1}</td>
                            <td style="text-align: center; font-weight: 700; color: #1e3a8a;">${row.order_no || '-'}</td>
                            <td style="text-align: center;">${dateStr || '-'}</td>
                            <td style="font-weight: 600; color: #0f172a;">${row.party || '-'}</td>
                            <td style="text-align: center; font-family: monospace; font-size: 11px;">${row.item_code || ''}</td>
                            <td style="font-weight: 600;">${row.item_name || ''}</td>
                            <td style="text-align: center; font-weight: bold; color: ${row.is_fitting ? '#b45309' : '#0369a1'};">${unit}</td>
                            <td style="text-align: right; font-weight: 700; color: #0369a1; background: #f0f9ff;">${formatNum(totalStock)}</td>
                            <td style="text-align: right; font-weight: 700; color: #d97706; background: #fffbeb;">${formatNum(inOrder)}</td>
                            <td style="text-align: right; font-weight: 800; color: ${resultColor}; background: ${resultBg}; font-size: 12px;">${formatNum(resultVal)}</td>
                        </tr>
                    `;
                });

                if (masterTbody) masterTbody.innerHTML = html || `<tr><td colspan="10" style="text-align:center; padding: 25px; color: #64748b;">No tracking records found matching the filters.</td></tr>`;

                // Footer totals
                if (masterTfoot && self.recordsCount > 0) {
                    masterTfoot.innerHTML = `
                        <tr>
                            <td colspan="7" style="text-align: right; color: #334155;">TOTAL ITEMS: ${self.recordsCount}</td>
                            <td style="text-align: right; color: #0369a1;">-</td>
                            <td style="text-align: right; color: #d97706;">${formatNum(totalInOrder)}</td>
                            <td style="text-align: center; font-size: 11px;">
                                ${shortageCount > 0 ? `<span style="color: #b91c1c; font-weight: bold;"><i class="fas fa-exclamation-triangle"></i> ${shortageCount} Short</span>` : `<span style="color: #15803d; font-weight: bold;"><i class="fas fa-check-circle"></i> In Stock</span>`}
                            </td>
                        </tr>
                    `;
                }

                // Summary badges in header
                if (badgesContainer) {
                    badgesContainer.innerHTML = `
                        <span style="background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; padding: 2px 8px; border-radius: 4px; font-weight: bold;">
                            Total: ${self.recordsCount}
                        </span>
                        <span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 2px 8px; border-radius: 4px; font-weight: bold;">
                            <i class="fas fa-check"></i> ${instockCount} In Stock
                        </span>
                        ${shortageCount > 0 ? `
                        <span style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 2px 8px; border-radius: 4px; font-weight: bold;">
                            <i class="fas fa-exclamation-triangle"></i> ${shortageCount} Shortage
                        </span>` : ''}
                    `;
                }

                if (self.recordsCount > 0) {
                    self.selectRow(0);
                }
            } else {
                alert(result.error || 'Failed to fetch tracking data');
            }
        } catch (err) {
            if (loading) loading.style.display = 'none';
            console.error("Error fetching tracking data:", err);
            alert("Error fetching tracking data: " + err.message);
        }
    },

    selectRow: function(index) {
        const self = window.SaleOrderTracker;
        if (index < 0 || index >= self.recordsCount) return;
        self.selectedIndex = index;
        
        const tbody = document.getElementById('sot_master_tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, idx) => {
            if (idx === index) {
                row.style.outline = '2px solid #1F4E79';
                row.scrollIntoView({ block: 'nearest' });
            } else {
                row.style.outline = '';
            }
        });
    },

    openOrder: function(orderNo) {
        if (!orderNo || orderNo === '-') return;
        const firstOrder = orderNo.toString().split(',')[0].trim();
        if (!firstOrder || isNaN(firstOrder)) return;
        const initCb = () => {
            if (window.SaleOrderModule && typeof window.SaleOrderModule.retrieveOrder === 'function') {
                window.SaleOrderModule.retrieveOrder(firstOrder);
            }
        };
        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/Sales/sale_order.html', 'fa-shopping-cart', 'Sale Order', initCb, 'Sale Order', true, true);
        }
    },

    handleKeydown: function(e) {
        const self = window.SaleOrderTracker;
        const tbody = document.getElementById('sot_master_tbody');
        if (!tbody) return;
        
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
            e.preventDefault();
            self.selectRow(Number(self.selectedIndex) + 1);
        } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
            e.preventDefault();
            self.selectRow(Number(self.selectedIndex) - 1);
        }
    },

    printReport: function() {
        const self = window.SaleOrderTracker;
        if (!self.masterData || self.masterData.length === 0) {
            return alert("No data available to print.");
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyName = session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        let actualLogo = localStorage.getItem(`softifyx_${companyName}_logo`);
        if (!actualLogo && typeof window.getCompanyLogo === 'function') {
            actualLogo = window.getCompanyLogo();
        }
        if (!actualLogo) actualLogo = 'assets/logos/logo.png';

        const logoImg = `<img src="${actualLogo}" style="max-height:55px; max-width:140px; object-fit:contain;" onerror="this.style.display='none'">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        const formatNum = (v) => {
            const n = parseFloat(v || 0);
            if (Number.isInteger(n)) return n.toLocaleString('en-US');
            return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        let rowsHtml = '';
        let totalInOrder = 0;
        let shortageCount = 0;
        let inStockCount = 0;

        self.masterData.forEach((row, idx) => {
            const trDate = row.date ? new Date(row.date).toLocaleDateString('en-GB') : '';
            const totalStock = parseFloat(row.total_stock) || 0;
            const inOrder = parseFloat(row.in_order) || 0;
            const resultVal = parseFloat(row.result) || 0;
            const unit = row.unit || (row.is_fitting ? 'Ctn' : 'Pcs');
            const isShortage = resultVal < 0;

            totalInOrder += inOrder;
            if (isShortage) shortageCount++;
            else inStockCount++;

            const resultColor = isShortage ? '#dc2626' : '#15803d';
            const resultBg = isShortage ? '#fee2e2' : '#dcfce7';

            rowsHtml += `<tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="text-align:center; font-weight:bold;">${row.order_no || '-'}</td>
                <td style="text-align:center;">${trDate || '-'}</td>
                <td>${row.party || '-'}</td>
                <td style="text-align:center; font-family:monospace;">${row.item_code || ''}</td>
                <td>${row.item_name || ''}</td>
                <td style="text-align:center; font-weight:bold;">${unit}</td>
                <td style="text-align:right; font-weight:bold; color:#0369a1;">${formatNum(totalStock)}</td>
                <td style="text-align:right; font-weight:bold; color:#d97706;">${formatNum(inOrder)}</td>
                <td style="text-align:right; font-weight:800; color:${resultColor}; background:${resultBg};">${formatNum(resultVal)}</td>
            </tr>`;
        });

        const filterOrderVal = document.getElementById('sot_order_no')?.value || 'ALL';
        const filterTitle = filterOrderVal === 'ALL' ? 'All Items / Orders' : `Sale Order #${filterOrderVal}`;

        const printWindow = window.open('', '', 'height=750,width=1000');
        if (!printWindow) return alert("Popup blocked! Please allow popups to print report.");
        
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Sale Order Stock Tracking Report</title><base href="${baseUrl}">
        <style>
            @page { size: A4 landscape; margin: 8mm; }
            body { font-family: 'Segoe UI', Arial, Tahoma, sans-serif; font-size: 10px; margin: 0; padding: 10px; color: #000; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .header-wrap { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 8px; margin-bottom: 10px; }
            .co-title { font-size: 20px; font-weight: 800; color: #1F4E79; text-transform: uppercase; margin: 0 0 2px 0; }
            .report-pill { background: #e0f2fe; color: #0369a1; padding: 6px 16px; border-radius: 6px; font-weight: 800; font-size: 13px; text-transform: uppercase; border: 1px solid #b8d5f8; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background: #1F4E79 !important; color: #ffffff !important; border: 1px solid #cbd5e1; padding: 5px 6px; font-size: 9.5px; text-transform: uppercase; }
            td { border: 1px solid #cbd5e1; padding: 4px 6px; font-size: 10px; }
            tfoot td { background: #f8fafc; font-weight: bold; border-top: 2px solid #1F4E79; padding: 6px; font-size: 10.5px; }
        </style></head><body>
        <div class="header-wrap">
            <div style="display:flex; align-items:center; gap: 15px;">
                ${logoImg}
                <div>
                    <h2 class="co-title">${companyName}</h2>
                    <div style="font-size: 11px; color: #475569;">Sale Order Stock Tracking &amp; Availability Report (${filterTitle})</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div class="report-pill">STOCK TRACKING</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Printed on: ${new Date().toLocaleDateString('en-GB')}</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 25px;">#</th>
                    <th style="width: 55px;">Order No.</th>
                    <th style="width: 70px;">Date</th>
                    <th style="width: 120px; text-align: left;">Party</th>
                    <th style="width: 75px;">Item Code</th>
                    <th style="text-align: left;">Item Name</th>
                    <th style="width: 45px;">Unit</th>
                    <th style="width: 75px; text-align: right;">Total Stock</th>
                    <th style="width: 70px; text-align: right;">In Order</th>
                    <th style="width: 75px; text-align: right;">Result</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="7" style="text-align: right;">TOTAL ITEMS: ${self.masterData.length}</td>
                    <td style="text-align: right;">-</td>
                    <td style="text-align: right; color: #d97706;">${formatNum(totalInOrder)}</td>
                    <td style="text-align: center; font-size: 10px;">
                        ${shortageCount > 0 ? `<span style="color: #b91c1c; font-weight: bold;">⚠ ${shortageCount} Short</span>` : `<span style="color: #15803d; font-weight: bold;">✔ OK</span>`}
                    </td>
                </tr>
            </tfoot>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 25px; font-size: 10px; color: #64748b;">
            <div>Prepared By: ___________________</div>
            <div>Powered by SoftifyX &amp; Financials</div>
        </div>

        <script>window.onload = () => { setTimeout(() => { window.print(); }, 250); }</script>
        </body></html>`);
        printWindow.document.close();
    }
};
