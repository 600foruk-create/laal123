window.PurchaseOrderTracker = {
    recordsCount: 0,
    selectedIndex: -1,
    isKeydownBound: false,
    vendorsLoaded: false,
    itemsLoaded: false,
    masterData: [],

    init: function() {
        const self = window.PurchaseOrderTracker;
        
        // Reset state
        self.recordsCount = 0;
        self.selectedIndex = -1;
        self.masterData = [];
        document.getElementById('pot_master_tbody').innerHTML = '';
        document.getElementById('pot_detail_tbody').innerHTML = '';

        // Bind keyboard navigation
        if (!self.isKeydownBound) {
            document.addEventListener('keydown', self.handleKeydown);
            self.isKeydownBound = true;
        }

        // Initialize Smart Searches locally
        self.allVendors = [];
        self.allItems = [];
        self.loadData();
    },

    loadData: async function() {
        const self = window.PurchaseOrderTracker;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if(res.ok) self.allVendors = await res.json();
        } catch (e) {}

        try {
            const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}`);
            if(res.ok) self.allItems = await res.json();
        } catch (e) {}

        try {
            const res = await fetch(`api/purchase_order_tracker.php?action=get_orders&company_id=${companyId}`);
            if(res.ok) {
                const data = await res.json();
                if (data.status === 'success' && data.records) {
                    const select = document.getElementById('pot_order_no');
                    select.innerHTML = '<option value="">Select Purchase Order...</option>';
                    data.records.forEach(order => {
                        const dateStr = order.date ? new Date(order.date).toLocaleDateString('en-GB') : '';
                        const vendor = order.vendor_name || '';
                        const optionText = `${order.order_no} (Dated ${dateStr}) ${vendor}`.trim();
                        select.innerHTML += `<option value="${order.order_no}">${optionText}</option>`;
                    });
                }
            }
        } catch (e) {}

        self.setupSmartSearch('pot_vendor_code', 'pot_vendor_name', 'pot_vendor_suggest', 'pot_vendor_id', 'vendor');
        self.setupSmartSearch('pot_item_code', 'pot_item_name', 'pot_item_suggest', 'pot_item_id', 'item');
        
        // Ensure filters are in correct initial state
        self.toggleFilters();
    },

    setupSmartSearch: function(codeId, nameId, suggestId, hiddenId, type) {
        const self = window.PurchaseOrderTracker;
        const codeInput = document.getElementById(codeId);
        const nameInput = document.getElementById(nameId);
        const suggest = document.getElementById(suggestId);
        const hiddenInput = document.getElementById(hiddenId);
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;
        let isFetching = false;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const dataSource = type === 'vendor' ? self.allVendors : self.allItems;
            
            const filtered = dataSource.filter(item => {
                const code = (item.account_code || item.code || item.item_code || '').toLowerCase();
                const name = (item.account_name || item.name || item.description || item.item_name || '').toLowerCase();
                return code.includes(val) || name.includes(val);
            }).slice(0, 20); // limit to 20

            if (filtered.length > 0) {
                suggestIndex = -1;
                suggest.innerHTML = filtered.map((item, idx) => {
                    const code = item.account_code || item.code || item.item_code || '';
                    const name = item.account_name || item.name || item.description || item.item_name || '';
                    const safeCode = String(code).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    const safeName = String(name).replace(/"/g, '&quot;').replace(/'/g, '\\\'');
                    return `
                    <div class="pot-suggest-item" style="padding: 2px 6px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#004080'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.PurchaseOrderTracker.selectSuggestion('${codeId}', '${nameId}', '${hiddenId}', '${suggestId}', ${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
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

        codeInput.addEventListener('focus', function() { this.select(); });
        nameInput.addEventListener('focus', function() { this.select(); });

        const updateHighlight = (items) => {
            items.forEach((item, idx) => {
                if (idx === suggestIndex) {
                    item.classList.add('active');
                    item.style.background = '#004080';
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
    },

    toggleFilters: function() {
        const orderChecked = document.getElementById('chk_pot_order').checked;
        document.getElementById('pot_order_no').disabled = !orderChecked;
        if (!orderChecked) {
            document.getElementById('pot_order_no').value = '';
        }

        const vendorChecked = document.getElementById('chk_pot_vendor').checked;
        document.getElementById('pot_vendor_code').disabled = !vendorChecked;
        document.getElementById('pot_vendor_name').disabled = !vendorChecked;
        if (!vendorChecked) {
            document.getElementById('pot_vendor_id').value = '';
            document.getElementById('pot_vendor_code').value = '';
            document.getElementById('pot_vendor_name').value = '';
        }

        const itemChecked = document.getElementById('chk_pot_item').checked;
        document.getElementById('pot_item_code').disabled = !itemChecked;
        document.getElementById('pot_item_name').disabled = !itemChecked;
        if (!itemChecked) {
            document.getElementById('pot_item_id').value = '';
            document.getElementById('pot_item_code').value = '';
            document.getElementById('pot_item_name').value = '';
        }
    },

    search: async function() {
        const self = window.PurchaseOrderTracker;
        const masterTbody = document.getElementById('pot_master_tbody');
        const loading = document.getElementById('pot_master_loading');
        
        masterTbody.innerHTML = '';
        document.getElementById('pot_detail_tbody').innerHTML = '';
        loading.style.display = 'block';

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        let url = `api/purchase_order_tracker.php?action=get_master&company_id=${companyId}`;

        if (document.getElementById('chk_pot_order').checked) {
            const orderNo = document.getElementById('pot_order_no').value.trim();
            if (orderNo) url += `&order_no=${encodeURIComponent(orderNo)}`;
        }
        
        if (document.getElementById('chk_pot_vendor').checked) {
            const vendorId = document.getElementById('pot_vendor_id').value;
            if (!vendorId) {
                alert("Please select a valid Vendor from the dropdown list.");
                loading.style.display = 'none';
                return;
            }
            url += `&vendor_id=${encodeURIComponent(vendorId)}`;
        }

        if (document.getElementById('chk_pot_item').checked) {
            const itemId = document.getElementById('pot_item_id').value;
            if (!itemId) {
                alert("Please select a valid Inventory Item from the dropdown list.");
                loading.style.display = 'none';
                return;
            }
            url += `&item_id=${encodeURIComponent(itemId)}`;
        }

        try {
            const res = await fetch(url);
            const result = await res.json();
            loading.style.display = 'none';

            if (result.status === 'success') {
                self.masterData = result.records;
                self.recordsCount = self.masterData.length;
                self.selectedIndex = -1;
                
                let html = '';
                self.masterData.forEach((row, index) => {
                    const dateStr = row.date ? new Date(row.date).toLocaleDateString('en-GB') : '';
                    const qtyOrdered = parseFloat(row.qty_ordered) || 0;
                    const qtySupplied = parseFloat(row.qty_supplied) || 0;
                    const balance = parseFloat(row.balance) || 0;
                    
                    html += `
                        <tr onclick="window.PurchaseOrderTracker.selectRow(${index})" style="cursor: pointer; border-bottom: 1px solid #94a3b8;">
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">
                                <i class="fas fa-caret-right row-indicator" style="font-size: 9px; color: transparent;"></i>
                            </td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${row.order_no || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${dateStr}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${row.party || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${row.item_code || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${row.item_name || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${qtyOrdered.toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${qtySupplied.toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${balance.toFixed(2)}</td>
                        </tr>
                    `;
                });
                masterTbody.innerHTML = html;

                if (self.recordsCount > 0) {
                    self.selectRow(0);
                }
            } else {
                alert(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            loading.style.display = 'none';
            alert("Error fetching master data: " + err.message);
        }
    },

    selectRow: function(index) {
        const self = window.PurchaseOrderTracker;
        if (index < 0 || index >= self.recordsCount) return;
        self.selectedIndex = index;
        
        const tbody = document.getElementById('pot_master_tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, idx) => {
            const firstTd = row.querySelector('td:first-child');
            if (idx === index) {
                row.style.backgroundColor = '#1f4668'; // Dark blue highlight
                row.style.color = '#ffffff';
                if (firstTd) firstTd.innerHTML = '<i class="fas fa-caret-right" style="color:#fff;"></i>';
                row.scrollIntoView({ block: 'nearest' });
            } else {
                row.style.backgroundColor = '';
                row.style.color = '';
                if (firstTd) firstTd.innerHTML = '';
            }
        });

        // Trigger detail load
        const selectedRecord = self.masterData[index];
        self.loadDetails(selectedRecord.order_no, selectedRecord.item_coa_id);
    },

    loadDetails: async function(orderNo, itemId) {
        const detailTbody = document.getElementById('pot_detail_tbody');
        const loading = document.getElementById('pot_detail_loading');
        
        detailTbody.innerHTML = '';
        loading.style.display = 'block';

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const url = `api/purchase_order_tracker.php?action=get_detail&company_id=${companyId}&order_no=${encodeURIComponent(orderNo)}&item_id=${encodeURIComponent(itemId)}`;

        try {
            const res = await fetch(url);
            const result = await res.json();
            loading.style.display = 'none';

            if (result.status === 'success') {
                let html = '';
                result.records.forEach(row => {
                    const dateStr = row.date ? new Date(row.date).toLocaleDateString('en-GB') : '';
                    const prefix = (row.is_tax_invoice == 1) ? 'PtV ' : 'PV ';
                    const displayVoucher = row.voucher_no ? prefix + row.voucher_no : '';
                    html += `
                        <tr style="border-bottom: 1px solid #94a3b8; cursor: pointer;" ondblclick="window.PurchaseOrderTracker.openInvoice(${row.voucher_no})">
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">
                                <i class="fas fa-caret-right row-indicator" style="font-size: 9px; color: transparent;"></i>
                            </td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${displayVoucher}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${dateStr}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.quantity || 0).toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${row.unit || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.rate || 0).toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.value_excl_tax || 0).toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.gst_rate || 0).toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.gst_amount || 0).toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.value_incl_tax || 0).toFixed(2)}</td>
                        </tr>
                    `;
                });
                detailTbody.innerHTML = html;
            }
        } catch (err) {
            loading.style.display = 'none';
            console.error("Error fetching detail data:", err);
        }
    },

    openInvoice: function(voucherNo) {
        if (!voucherNo) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        const initCb = async () => {
            try {
                if (window.PIModule && window.PIModule.init) await window.PIModule.init();
                const invoiceRes = await fetch(`api/purchases.php?action=get_invoice&serial_no=${voucherNo}&company_id=${companyId}`);
                if(invoiceRes.ok) {
                    const invData = await invoiceRes.json();
                    if(invData && !invData.error && window.PIModule && window.PIModule.loadInvoiceData) {
                        window.PIModule.loadInvoiceData(invData);
                    }
                }
            } catch(e) { console.error('Error auto-loading Purchase Invoice:', e); }
        };
        window.openModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', initCb, 'Purchase Invoice', true, true);
    },

    handleKeydown: function(e) {
        const self = window.PurchaseOrderTracker;
        const tbody = document.getElementById('pot_master_tbody');
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

    printReport: async function() {
        const self = window.PurchaseOrderTracker;
        if (!self.masterData || self.masterData.length === 0) return;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
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
                        email:   (data.email   || '').trim()
                    };
                }
            }
        } catch(e) { console.error('Could not fetch company info for print:', e); }

        const companyName = companyInfo.name || session.company_name || 'Company';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        let contactLineText = '';
        let contactParts = [];
        if (companyInfo.address) contactParts.push(companyInfo.address);
        if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
        if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
        if (contactParts.length > 0) {
            contactLineText = contactParts.join(' | ');
        }

        const formatNum = (num) => {
            if (!num || parseFloat(num) === 0) return '0.00';
            return parseFloat(num).toFixed(2);
        };

        let rowsHtml = '';
        self.masterData.forEach(row => {
            const trDate = row.date ? new Date(row.date).toLocaleDateString('en-GB') : '';
            const qtyOrdered = parseFloat(row.qty_ordered) || 0;
            const qtySupplied = parseFloat(row.qty_supplied) || 0;
            const balance = qtyOrdered - qtySupplied;

            rowsHtml += `<tr>
                <td style="text-align:center;">${row.order_no || ''}</td>
                <td style="text-align:center;">${trDate}</td>
                <td>${row.party || ''}</td>
                <td style="text-align:center;">${row.item_code || ''}</td>
                <td>${row.item_name || ''}</td>
                <td style="text-align:right;">${formatNum(qtyOrdered)}</td>
                <td style="text-align:right;">${formatNum(qtySupplied)}</td>
                <td style="text-align:right;">${formatNum(balance)}</td>
            </tr>`;
        });

        const masterHtml = `
            <table>
                <thead>
                    <tr>
                        <th>ORDER NO.</th>
                        <th>DATE</th>
                        <th>PARTY</th>
                        <th>ITEM CODE</th>
                        <th>ITEM NAME</th>
                        <th>QUANTITY ORDERED</th>
                        <th>QUANTITY SUPPLIED</th>
                        <th>BALANCE</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;

        const printWindow = window.open('', '', 'height=600,width=800');
        
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Purchase Order Tracking</title><base href="${baseUrl}">
        <style>
            @page { margin: 0.5cm; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; position: relative; }
            .company-name { font-family: "Times New Roman", Times, serif; font-size: 28px; font-weight: bold; font-style: italic; margin-bottom: 4px; display: block; text-transform: uppercase; }
            .company-info { font-size: 11px; margin-bottom: 2px; display: block; }
            .title-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; }
            .voucher-title { border: 1px solid #333; padding: 5px 20px; font-weight: bold; font-style: italic; font-size: 16px; min-width: 250px; text-align: center; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 11px; margin-bottom: 15px; } 
            th, td { border: 1px solid #ccc; padding: 4px 6px; } 
            th { background: #f0f0f0; font-weight:bold; }
        </style></head><body>
        <div class="header">
            <div style="position: absolute; left: 0; top: 0;">${logoImg}</div>
            <span class="company-name">${companyName}</span>
            <span class="company-info">${contactLineText}</span>
        </div>
        <div class="title-row">
            <div></div>
            <div class="voucher-title">Purchase Order Tracking</div>
            <div></div>
        </div>
        ${masterHtml}
        <script>window.onload = () => { window.print(); }</script>
        </body></html>`);
        printWindow.document.close();
    }
};
