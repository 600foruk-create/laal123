window.PurchaseActivityInvoiceWiseModule = {
    allVendors: [],
    allEmployees: [],
    mainData: [],
    detailData: [],
    selectedInvoiceNo: null,
    selectedIndex: -1,
    selectedDetailIndex: -1,
    _lastKeyTime: 0,

    init: function() {
        const self = window.PurchaseActivityInvoiceWiseModule;
        
        // Filter Checkbox Listeners
        document.getElementById('par_use_vendor_type').addEventListener('change', function() {
            document.getElementById('par_vendor_type').disabled = !this.checked;
        });
        document.getElementById('par_use_vendor').addEventListener('change', function() {
            document.getElementById('par_vendor_code').disabled = !this.checked;
            document.getElementById('par_vendor_name').disabled = !this.checked;
            if(!this.checked) {
                document.getElementById('par_vendor_id').value = '';
                document.getElementById('par_vendor_code').value = '';
                document.getElementById('par_vendor_name').value = '';
                document.getElementById('par_vendor_suggest').style.display = 'none';
            }
        });
        document.getElementById('par_use_employee').addEventListener('change', function() {
            document.getElementById('par_employee').disabled = !this.checked;
        });
        document.getElementById('par_use_date').addEventListener('change', function() {
            document.getElementById('par_date_from').disabled = !this.checked;
            document.getElementById('par_date_to').disabled = !this.checked;
        });

        // Set Default Dates to Today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('par_date_from').value = today;
        document.getElementById('par_date_to').value = today;

        // Button Listeners
        document.getElementById('par_display').addEventListener('click', () => self.fetchData());
        document.getElementById('par_print').addEventListener('click', () => self.printReport());

        // Keyboard Navigation - bound globally at end of file

        self.loadLookups();
        self.setupSmartSearch('par_vendor_code', 'par_vendor_name', 'par_vendor_suggest', 'par_vendor_id');
    },

    setupSmartSearch: function(codeId, nameId, suggestId, hiddenId) {
        const self = window.PurchaseActivityInvoiceWiseModule;
        const codeInput = document.getElementById(codeId);
        const nameInput = document.getElementById(nameId);
        const suggest = document.getElementById(suggestId);
        const hiddenInput = document.getElementById(hiddenId);
        
        if (!codeInput || !nameInput || !suggest || !hiddenInput) return;

        let suggestIndex = -1;

        const handleSearch = (val) => {
            if (!val || val.length < 1) { suggest.style.display = 'none'; return; }
            val = val.toLowerCase();
            
            const dataSource = self.allVendors;
            
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
                    <div class="ps-suggest-item" style="padding: 6px 10px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; background: #fff;" 
                         onmouseover="this.style.background='#1F4E79'; this.style.color='#fff';" 
                         onmouseout="if(!this.classList.contains('active')){ this.style.background='#fff'; this.style.color='#333'; }"
                         onclick="window.PurchaseActivityInvoiceWiseModule.selectSuggestion('${codeId}', '${nameId}', '${hiddenId}', '${suggestId}', ${item.id || item.coa_list_id || item.coa_id}, '${safeCode}', '${safeName}')">
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
    },

    loadLookups: async function() {
        const companyId = window.selectedCompanyId || 1;
        
        // Fetch Vendors
        try {
            const res = await fetch(`api/maintain.php?action=get_vendors&company_id=${companyId}`);
            if(res.ok) this.allVendors = await res.json();
        } catch (e) { console.error('Failed to load vendors', e); }

        // Fetch Vendor Types
        try {
            const res = await fetch(`api/payments_reports.php?action=get_vendor_categories&company_id=${companyId}`);
            if(res.ok) {
                const types = await res.json();
                const vtSelect = document.getElementById('par_vendor_type');
                vtSelect.innerHTML = '<option value="all">All</option>';
                types.forEach(t => {
                    vtSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
                });
            }
        } catch(e) { console.error(e); }

        // Fetch Employees
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            if(res.ok) {
                const employees = await res.json();
                const empSelect = document.getElementById('par_employee');
                empSelect.innerHTML = '<option value="">Select Employee...</option>';
                employees.forEach(e => {
                    const displayStr = e.code ? `${e.code} - ${e.name}` : e.name;
                    empSelect.innerHTML += `<option value="${e.id}">${displayStr}</option>`;
                });
            }
        } catch(e) { console.error(e); }
    },

    fetchData: async function() {
        const companyId = window.selectedCompanyId || 1;
        let url = `api/purchase_activity_invoice_wise.php?action=get_report_data&company_id=${companyId}`;

        if (document.getElementById('par_use_vendor_type').checked) {
            url += `&vendor_type_id=${document.getElementById('par_vendor_type').value}`;
        }
        if (document.getElementById('par_use_vendor').checked) {
            url += `&vendor_id=${document.getElementById('par_vendor_id').value}`;
        }
        if (document.getElementById('par_use_employee').checked) {
            url += `&employee_id=${document.getElementById('par_employee').value}`;
        }
        if (document.getElementById('par_use_date').checked) {
            url += `&date_from=${document.getElementById('par_date_from').value}`;
            url += `&date_to=${document.getElementById('par_date_to').value}`;
        }

        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                this.mainData = data.main_grid || [];
                this.detailData = data.details || [];
                this.renderMainGrid();
                this.renderDetailGrid(null); // clear detail
            } else {
                alert("Failed to fetch report data.");
            }
        } catch(e) {
            console.error("Fetch Error:", e);
        }
    },

    renderMainGrid: function() {
        const tbody = document.getElementById('par_tbody');
        tbody.innerHTML = '';
        this.selectedInvoiceNo = null;
        this.selectedIndex = -1;

        let totInv = 0, totPaid = 0, totRet = 0, totWht = 0, totFlood = 0, totSales = 0, totAdv = 0, totDisc = 0, totBal = 0;

        this.mainData.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.onclick = () => this.selectMainRow(idx, row.id);
            
            const formatDate = d => d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '-') : '';

            tr.innerHTML = `
                <td style="text-align: center; border: 1px solid #999;"><span class="par-row-pointer"></span></td>
                <td style="text-align: left; padding-left: 5px;">${row.invoice_no}</td>
                <td style="text-align: left;">${formatDate(row.invoice_date)}</td>
                <td style="text-align: left;">${row.vendor_name || ''}</td>
                <td style="text-align: right;">${parseFloat(row.invoice_amount).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.amt_paid).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.pur_returns).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.wh_tax).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.flood_tax).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.sales_tax).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.adv_adj).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.discount).toFixed(2)}</td>
                <td style="text-align: right;">${parseFloat(row.balance_amt).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);

            totInv += parseFloat(row.invoice_amount);
            totPaid += parseFloat(row.amt_paid);
            totRet += parseFloat(row.pur_returns);
            totWht += parseFloat(row.wh_tax);
            totFlood += parseFloat(row.flood_tax);
            totSales += parseFloat(row.sales_tax);
            totAdv += parseFloat(row.adv_adj);
            totDisc += parseFloat(row.discount);
            totBal += parseFloat(row.balance_amt);
        });

        document.getElementById('par_tot_inv').textContent = totInv.toFixed(2);
        document.getElementById('par_tot_paid').textContent = totPaid.toFixed(2);
        document.getElementById('par_tot_ret').textContent = totRet.toFixed(2);
        document.getElementById('par_tot_wht').textContent = totWht.toFixed(2);
        document.getElementById('par_tot_flood').textContent = totFlood.toFixed(2);
        document.getElementById('par_tot_sales').textContent = totSales.toFixed(2);
        document.getElementById('par_tot_adv').textContent = totAdv.toFixed(2);
        document.getElementById('par_tot_disc').textContent = totDisc.toFixed(2);
        document.getElementById('par_tot_bal').textContent = totBal.toFixed(2);
    },

    selectMainRow: function(idx, invoiceId) {
        const tbody = document.getElementById('par_tbody');
        Array.from(tbody.children).forEach(r => r.classList.remove('selected'));
        if(tbody.children[idx]) {
            tbody.children[idx].classList.add('selected');
        }
        this.selectedIndex = idx;
        this.selectedInvoiceNo = invoiceId;
        this.selectedDetailIndex = -1;
        this.renderDetailGrid(invoiceId);
    },

    selectDetailRow: function(idx) {
        const tbody = document.getElementById('par_detail_tbody');
        Array.from(tbody.children).forEach(r => r.classList.remove('selected'));
        if(tbody.children[idx]) {
            tbody.children[idx].classList.add('selected');
        }
        this.selectedDetailIndex = idx;
    },

    handleKeyDown: function(e) {
        const self = window.PurchaseActivityInvoiceWiseModule;
        if (self.mainData.length === 0) return;

        // Only fire if module table is visible
        const tbl = document.getElementById('par_table');
        if (!tbl || !tbl.offsetParent) return;
        // Don't hijack typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowDown' && self.selectedIndex === -1) {
            e.preventDefault();
            self.selectedIndex = 0;
            self.updateRowHighlight();
        }
    },

    updateRowHighlight: function() {
        const self = window.PurchaseActivityInvoiceWiseModule;
        const tbody = document.getElementById('par_tbody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            if (index === self.selectedIndex) {
                row.classList.add('selected');
                row.scrollIntoView({ block: 'nearest' });
                // Also load detail for this row
                const rowData = self.mainData[index];
                if (rowData) self.renderDetailGrid(rowData.id);
            } else {
                row.classList.remove('selected');
            }
        });
    },


    renderDetailGrid: function(invoiceId) {
        const tbody = document.getElementById('par_detail_tbody');
        tbody.innerHTML = '';
        
        let totInv = 0, totPaid = 0, totRet = 0, totWht = 0, totFlood = 0, totSales = 0, totAdv = 0, totDisc = 0;

        if (invoiceId) {
            const filteredDetails = this.detailData.filter(d => d.id == invoiceId);
            
            filteredDetails.forEach((row, idx) => {
                const tr = document.createElement('tr');
                tr.onclick = () => this.selectDetailRow(idx);
                
                tr.addEventListener('dblclick', () => {
                    const docType = row.transaction_type;
                    const sn = parseInt(row.voucher_no);
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const companyId = window.selectedCompanyId || session.company_id || 1;
                    
                    if (docType === 'Purchase') {
                        const initCb = async () => {
                            try {
                                if (window.PIModule && window.PIModule.init) await window.PIModule.init();
                                const invoiceRes = await fetch(`api/purchases.php?action=get_invoice&serial_no=${sn}&company_id=${companyId}`);
                                if(invoiceRes.ok) {
                                    const invData = await invoiceRes.json();
                                    if(invData && !invData.error && window.PIModule && window.PIModule.loadInvoiceData) {
                                        window.PIModule.loadInvoiceData(invData);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading Purchase Invoice:', e); }
                        };
                        window.openModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', initCb, 'Purchase Invoice', true, true);
                    } else if (docType === 'Purchase Return') {
                        const initCb = async () => {
                            try {
                                if (window.PRetModule && window.PRetModule.init) await window.PRetModule.init();
                                const res = await fetch(`api/purchases.php?action=get_return&serial_no=${sn}&company_id=${companyId}`);
                                if(res.ok) {
                                    const data = await res.json();
                                    if(data && !data.error && window.PRetModule && window.PRetModule.loadReturnData) {
                                        window.PRetModule.loadReturnData(data);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading Purchase Return:', e); }
                        };
                        window.openModularPopup('Navigation/Purchases/purchase_return.html', 'fa-undo', 'Purchase Return', initCb, 'Purchase Return', true, true);
                    } else if (docType === 'Cash Payment') {
                        const initCb = async () => {
                            try {
                                if (window.CPModule && window.CPModule.init) await window.CPModule.init();
                                const cpRes = await fetch(`api/cash_payments.php?action=get&serial_no=${sn}&company_id=${companyId}`);
                                if(cpRes.ok) {
                                    const cpData = await cpRes.json();
                                    if(cpData && !cpData.error && window.CPModule && window.CPModule.loadData) {
                                        window.CPModule.loadData(cpData);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading CPV:', e); }
                        };
                        window.openModularPopup('Navigation/Purchases/cash_payments.html', 'fa-money-bill-wave', 'Cash Payments', initCb, 'Cash Payments', true, true);
                    } else if (docType === 'Bank Payment') {
                        const initCb = async () => {
                            try {
                                if (window.BPModule && window.BPModule.init) await window.BPModule.init();
                                const bpRes = await fetch(`api/bank_payments.php?action=get&serial_no=${sn}&company_id=${companyId}`);
                                if(bpRes.ok) {
                                    const bpData = await bpRes.json();
                                    if(bpData && !bpData.error && window.BPModule && window.BPModule.loadData) {
                                        window.BPModule.loadData(bpData);
                                    }
                                }
                            } catch(e) { console.error('Error auto-loading BPV:', e); }
                        };
                        window.openModularPopup('Navigation/Purchases/bank_payments.html', 'fa-university', 'Bank Payments', initCb, 'Bank Payments', true, true);
                    }
                });

                const formatDate = d => d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '-') : '';

                tr.innerHTML = `
                    <td style="text-align: center; border: 1px solid #999;"><span class="par-row-pointer"></span></td>
                    <td style="text-align: left; padding-left: 5px;">${row.transaction_type}</td>
                    <td style="text-align: left;">${row.voucher_no || ''}</td>
                    <td style="text-align: left;">${formatDate(row.date)}</td>
                    <td style="text-align: right;">${parseFloat(row.invoice_amount).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.amt_paid).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.pur_returns).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.wh_tax).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.flood_tax).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.sales_tax).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.adv_adj).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(row.discount).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);

                totInv += parseFloat(row.invoice_amount);
                totPaid += parseFloat(row.amt_paid);
                totRet += parseFloat(row.pur_returns);
                totWht += parseFloat(row.wh_tax);
                totFlood += parseFloat(row.flood_tax);
                totSales += parseFloat(row.sales_tax);
                totAdv += parseFloat(row.adv_adj);
                totDisc += parseFloat(row.discount);
            });
        }

        document.getElementById('par_det_tot_inv').textContent = totInv.toFixed(2);
        document.getElementById('par_det_tot_paid').textContent = totPaid.toFixed(2);
        document.getElementById('par_det_tot_ret').textContent = totRet.toFixed(2);
        document.getElementById('par_det_tot_wht').textContent = totWht.toFixed(2);
        document.getElementById('par_det_tot_flood').textContent = totFlood.toFixed(2);
        document.getElementById('par_det_tot_sales').textContent = totSales.toFixed(2);
        document.getElementById('par_det_tot_adv').textContent = totAdv.toFixed(2);
        document.getElementById('par_det_tot_disc').textContent = totDisc.toFixed(2);
    },

    printReport: async function() {
        if (!this.mainData || this.mainData.length === 0) {
            alert("No data to print.");
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        const userName = session.name || session.username || 'User';
        
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

        let filtersHtml = "";
        if (document.getElementById('par_use_vendor').checked) {
            filtersHtml += `Vendor: ${document.getElementById('par_vendor_name').value} | `;
        }
        if (document.getElementById('par_use_date').checked) {
            filtersHtml += `Period: ${document.getElementById('par_date_from').value} To ${document.getElementById('par_date_to').value}`;
        }

        const tableClone = document.getElementById('par_table').cloneNode(true);
        
        // Clean up cloned table for print
        // 1. Header has spacer at the end
        const theadTr = tableClone.querySelector('thead tr');
        if (theadTr && theadTr.children.length > 0) {
            theadTr.removeChild(theadTr.children[0]); // Pointer column
            if (theadTr.lastElementChild && theadTr.lastElementChild.innerHTML.trim() === '') {
                theadTr.removeChild(theadTr.lastElementChild); // Spacer column
            }
        }
        
        // 2. Body only has pointer column (no spacer at end)
        tableClone.querySelectorAll('tbody tr').forEach(tr => {
            if(tr.children.length > 0) tr.removeChild(tr.children[0]);
        });

        // 3. Remove inline widths and fix borders for print
        if (tableClone.querySelector('thead')) tableClone.querySelector('thead').removeAttribute('style');
        tableClone.removeAttribute('class');
        tableClone.querySelectorAll('*').forEach(el => {
            if (el.style.width) el.style.width = '';
            if (el.tagName === 'TH' || el.tagName === 'TD') {
                el.style.border = '1px solid #000';
            }
        });

        const cloneTbody = tableClone.querySelector('tbody');
        
        const totInv = document.getElementById('par_tot_inv').textContent;
        const totPaid = document.getElementById('par_tot_paid').textContent;
        const totRet = document.getElementById('par_tot_ret').textContent;
        const totWht = document.getElementById('par_tot_wht').textContent;
        const totFlood = document.getElementById('par_tot_flood').textContent;
        const totSales = document.getElementById('par_tot_sales').textContent;
        const totAdv = document.getElementById('par_tot_adv').textContent;
        const totDisc = document.getElementById('par_tot_disc').textContent;
        const totBal = document.getElementById('par_tot_bal').textContent;

        const tRow = document.createElement('tr');
        tRow.style.fontWeight = 'bold';
        tRow.style.background = '#f0f0f0';
        tRow.innerHTML = `
            <td colspan="3" style="text-align:right; padding:4px; border: 1px solid #000;">Totals Rs.</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totInv}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totPaid}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totRet}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totWht}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totFlood}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totSales}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totAdv}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totDisc}</td>
            <td style="text-align:right; padding:4px; border: 1px solid #000;">${totBal}</td>
        `;
        cloneTbody.appendChild(tRow);

        const printContent = `<!DOCTYPE html>
        <html>
        <head>
            <title>Purchase Activity Report - Invoice Wise</title>
            <base href="${baseUrl}">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
            <style>
                @page { margin: 0; size: A4 landscape; }
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
                    <div class="invoice-title">PURCHASE ACTIVITY REPORT<br>INVOICE WISE</div>
                </div>
            </div>
        ${filtersHtml ? `<div style="margin-bottom:8px; font-size:9px; font-weight:bold;">${filtersHtml}</div>` : ''}
        ${tableClone.outerHTML}
        <div style="display:flex; justify-content:space-between; color:#777; font-size:8px; margin-top:12px; font-style:italic;">
            <span>Printed by: ${userName}</span>
            <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
        </div>
        </div>
        <script>window.onload = function() { window.print(); window.close(); }</script>
        </body></html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
    }
};

// Bind keyboard navigation globally ONCE to avoid double-jump from re-registering listeners
if (!window._globalParKeydownBound) {
    document.addEventListener('keydown', function(e) {
        if (window.PurchaseActivityInvoiceWiseModule &&
            typeof window.PurchaseActivityInvoiceWiseModule.handleKeyDown === 'function') {
            window.PurchaseActivityInvoiceWiseModule.handleKeyDown(e);
        }
    });
    window._globalParKeydownBound = true;
}
