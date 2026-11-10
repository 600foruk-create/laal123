// SoftifyX ERP - Tax Transaction Report (Sales & Purchase)
// Handles Live Filtering, Color-coded Table Grid, Summary Cards, Print & Excel Export
(function() {
    let companyId = 1;
    let partiesList = [];
    let currentData = [];
    let activeTxnType = 'all';
    let activePartyType = 'all';

    async function init() {
        const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        companyId = window.selectedCompanyId || sessionData.company_id || 1;

        // Set Default Dates (First day of current month to today)
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const firstDay = `${yyyy}-${mm}-01`;
        const today = `${yyyy}-${mm}-${dd}`;

        const fromEl = document.getElementById('ttr_from_date');
        const toEl = document.getElementById('ttr_to_date');
        if (fromEl && !fromEl.value) fromEl.value = firstDay;
        if (toEl && !toEl.value) toEl.value = today;

        // Update Modal Title if wrapper exists
        const modalContainer = document.querySelector('.modal-container:has(.ttr-wrapper)');
        if (modalContainer) {
            const titleSpan = modalContainer.querySelector('.modal-title span');
            if (titleSpan) {
                titleSpan.innerHTML = '<i class="fas fa-receipt" style="margin-right: 6px;"></i> Tax Transaction Report <span style="font-weight: 400; opacity: 0.85; font-size: 11px;">| Sales & Purchase (Customer & Vendor)</span>';
            }
        }

        setupEventListeners();
        await loadFilters();
        await fetchData();
    }

    function setupEventListeners() {
        // 1. Transaction Type Segmented Toggle
        const txnGroup = document.getElementById('ttr_seg_txn_type');
        if (txnGroup) {
            txnGroup.querySelectorAll('.ttr-seg-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    txnGroup.querySelectorAll('.ttr-seg-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    activeTxnType = this.getAttribute('data-val');
                    fetchData();
                });
            });
        }

        // 2. Party Type Segmented Toggle
        const partyGroup = document.getElementById('ttr_seg_party_type');
        if (partyGroup) {
            partyGroup.querySelectorAll('.ttr-seg-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    partyGroup.querySelectorAll('.ttr-seg-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    activePartyType = this.getAttribute('data-val');
                    fetchData();
                });
            });
        }

        // 3. Tax Section & Business Type Dropdowns
        document.getElementById('ttr_tax_section')?.addEventListener('change', fetchData);
        document.getElementById('ttr_business_type')?.addEventListener('change', fetchData);
        document.getElementById('ttr_customer_type')?.addEventListener('change', fetchData);

        // 4. Action Buttons
        document.getElementById('ttr_btn_display')?.addEventListener('click', fetchData);
        document.getElementById('ttr_btn_print')?.addEventListener('click', printReport);
        document.getElementById('ttr_btn_excel')?.addEventListener('click', exportExcel);

        // 5. Party Name Search Autocomplete
        const partyInput = document.getElementById('ttr_party_name');
        const suggestBox = document.getElementById('ttr_party_suggest');
        let suggestIndex = -1;

        if (partyInput) {
            partyInput.addEventListener('input', function() {
                suggestIndex = -1;
                filterPartySuggestions(this.value);
            });

            partyInput.addEventListener('keydown', function(e) {
                if (!suggestBox || suggestBox.style.display === 'none') return;
                const items = suggestBox.querySelectorAll('.ttr-suggest-row');
                if (!items.length) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    suggestIndex = (suggestIndex + 1) % items.length;
                    highlightSuggestItem(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    suggestIndex = (suggestIndex - 1 + items.length) % items.length;
                    highlightSuggestItem(items);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (suggestIndex >= 0 && suggestIndex < items.length) {
                        items[suggestIndex].click();
                    } else {
                        fetchData();
                    }
                }
            });
        }

        function highlightSuggestItem(items) {
            items.forEach((it, idx) => {
                if (idx === suggestIndex) {
                    it.classList.add('selected');
                    it.scrollIntoView({ block: 'nearest' });
                } else {
                    it.classList.remove('selected');
                }
            });
        }

        // Close suggest on outside click
        document.addEventListener('click', function(e) {
            if (e.target.id !== 'ttr_party_name' && !e.target.closest('#ttr_party_suggest')) {
                if (suggestBox) suggestBox.style.display = 'none';
            }
        });

        // 6. NTN / CNIC search input on Enter
        document.getElementById('ttr_ntn_cnic')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                fetchData();
            }
        });

        // 7. Table Keyboard Navigation
        const container = document.getElementById('ttr_table_container');
        if (container) {
            container.addEventListener('keydown', function(e) {
                const rows = document.querySelectorAll('#ttr_table_body tr.ttr-data-row');
                if (!rows.length) return;

                let selectedIdx = -1;
                rows.forEach((r, idx) => {
                    if (r.classList.contains('row-selected')) selectedIdx = idx;
                });

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selectedIdx < rows.length - 1) {
                        if (selectedIdx >= 0) rows[selectedIdx].classList.remove('row-selected');
                        rows[selectedIdx + 1].classList.add('row-selected');
                        rows[selectedIdx + 1].scrollIntoView({ block: 'nearest' });
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedIdx > 0) {
                        rows[selectedIdx].classList.remove('row-selected');
                        rows[selectedIdx - 1].classList.add('row-selected');
                        rows[selectedIdx - 1].scrollIntoView({ block: 'nearest' });
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedIdx >= 0) {
                        rows[selectedIdx].dispatchEvent(new Event('dblclick'));
                    }
                }
            });
        }
    }

    async function loadFilters() {
        try {
            const res = await fetch(`api/wht_sale_report.php?action=get_filters&company_id=${companyId}`);
            if (!res.ok) return;
            const data = await res.json();

            // Populate Customer Types (Cash Customer, Credit Customer, etc.)
            let custTypes = [];
            if (data.customer_types && data.customer_types.length) {
                custTypes = data.customer_types;
            }

            const hasCash = custTypes.some(t => (t.name || '').toLowerCase().includes('cash'));
            const hasCredit = custTypes.some(t => (t.name || '').toLowerCase().includes('credit'));
            if (!hasCash) custTypes.push({ id: 'cash', name: 'Cash Customer' });
            if (!hasCredit) custTypes.push({ id: 'credit', name: 'Credit Customer' });

            const sel = document.getElementById('ttr_customer_type');
            if (sel) {
                sel.innerHTML = '<option value="">All Customer Types</option>' +
                    custTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            }

            // Populate Buyer Types in Business Type dropdown if available
            if (data.buyer_types && data.buyer_types.length) {
                const selBt = document.getElementById('ttr_business_type');
                if (selBt) {
                    const existingVals = Array.from(selBt.options).map(o => o.value);
                    data.buyer_types.forEach(bt => {
                        if (!existingVals.includes(bt.name)) {
                            const opt = document.createElement('option');
                            opt.value = bt.name;
                            opt.textContent = bt.name;
                            selBt.appendChild(opt);
                        }
                    });
                }
            }

            // Cache parties list for autocomplete
            if (data.parties) {
                partiesList = data.parties;
            }
        } catch (err) {
            console.error('Error loading Tax Transaction filters:', err);
        }
    }

    function filterPartySuggestions(query) {
        const box = document.getElementById('ttr_party_suggest');
        if (!box) return;

        const q = (query || '').trim().toLowerCase();
        if (!q) {
            box.style.display = 'none';
            return;
        }

        const matches = partiesList.filter(p => {
            const nameMatch = (p.name || '').toLowerCase().includes(q);
            const codeMatch = (p.code || '').toLowerCase().includes(q);
            const ntnMatch = (p.ntn_cnic || '').toLowerCase().includes(q);
            // Filter by activePartyType if not 'all'
            if (activePartyType === 'customer' && p.type !== 'Customer') return false;
            if (activePartyType === 'vendor' && p.type !== 'Vendor') return false;
            return nameMatch || codeMatch || ntnMatch;
        }).slice(0, 40);

        if (!matches.length) {
            box.style.display = 'none';
            return;
        }

        box.innerHTML = matches.map(p => `
            <div class="ttr-suggest-row" onclick="window.WHTSaleReportModule.selectParty('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.type}')">
                <span><b>${p.name}</b> <small style="color:#64748b;">(${p.type})</small></span>
                <span style="color:#94a3b8; font-size:10.5px;">${p.code || ''} ${p.ntn_cnic ? '| ' + p.ntn_cnic : ''}</span>
            </div>
        `).join('');
        box.style.display = 'block';
    }

    function selectParty(id, name, type) {
        const nameInput = document.getElementById('ttr_party_name');
        const idInput = document.getElementById('ttr_party_id');
        if (nameInput) nameInput.value = name;
        if (idInput) idInput.value = id;
        const box = document.getElementById('ttr_party_suggest');
        if (box) box.style.display = 'none';
        fetchData();
    }

    async function fetchData() {
        const tbody = document.getElementById('ttr_table_body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="18" style="text-align: center; padding: 30px; color: #0284c7;"><i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Loading Tax Transaction records...</td></tr>`;
        }

        try {
            let url = `api/wht_sale_report.php?action=get_data&company_id=${companyId}`;
            url += `&txn_type=${encodeURIComponent(activeTxnType)}`;
            url += `&party_type=${encodeURIComponent(activePartyType)}`;

            const partyName = document.getElementById('ttr_party_name')?.value?.trim();
            if (partyName) url += `&party_name=${encodeURIComponent(partyName)}`;

            const ntnCnic = document.getElementById('ttr_ntn_cnic')?.value?.trim();
            if (ntnCnic) url += `&ntn_cnic=${encodeURIComponent(ntnCnic)}`;

            const custType = document.getElementById('ttr_customer_type')?.value;
            if (custType) url += `&customer_type_id=${encodeURIComponent(custType)}`;

            const bizType = document.getElementById('ttr_business_type')?.value;
            if (bizType && bizType !== 'all') url += `&business_type=${encodeURIComponent(bizType)}`;

            const taxSec = document.getElementById('ttr_tax_section')?.value;
            if (taxSec && taxSec !== 'all') url += `&tax_section=${encodeURIComponent(taxSec)}`;

            const fromDate = document.getElementById('ttr_from_date')?.value;
            const toDate = document.getElementById('ttr_to_date')?.value;
            if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
            if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Network error fetching tax transaction records');

            const result = await res.json();
            if (result.status === 'error') throw new Error(result.message || 'Error occurred');

            currentData = result.data || [];
            renderTable(currentData);
            renderSummaryCards(result.summary || {});
        } catch (err) {
            console.error('Tax Transaction Report error:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="18" style="text-align: center; padding: 25px; color: #dc2626;"><i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i> ${err.message}</td></tr>`;
            }
        }
    }

    function fmt(num) {
        const val = parseFloat(num || 0);
        return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderTable(data) {
        const tbody = document.getElementById('ttr_table_body');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="18" style="text-align: center; padding: 30px; color: #64748b;"><i class="fas fa-info-circle" style="margin-right: 6px;"></i> No tax transaction records found for the selected filters.</td></tr>`;
            resetFooter();
            return;
        }

        let totTaxable = 0;
        let totSalesTax = 0;
        let totFurtherTax = 0;
        let totWht236g = 0;
        let totWht236h = 0;
        let totTotalTax = 0;
        let totInvoiceTotal = 0;

        let html = '';
        data.forEach((r, idx) => {
            totTaxable += parseFloat(r.taxable_amount || 0);
            totSalesTax += parseFloat(r.sales_tax_amount || 0);
            totFurtherTax += parseFloat(r.further_tax_amount || 0);
            totWht236g += parseFloat(r.wht_236g_amount || 0);
            totWht236h += parseFloat(r.wht_236h_amount || 0);
            totTotalTax += parseFloat(r.total_tax_amount || 0);
            totInvoiceTotal += parseFloat(r.invoice_total || 0);

            const isSale = (r.txn_type === 'Sale');
            const badgeClass = isSale ? 'ttr-badge-sale' : 'ttr-badge-purchase';
            const badgeIcon = isSale ? 'fa-shopping-cart' : 'fa-box';

            html += `
                <tr class="ttr-data-row" data-idx="${idx}" data-source="${r.source}" data-id="${r.id}" data-sn="${r.serial_no}" data-istax="${r.is_tax_invoice}">
                    <td class="cell-center" style="font-weight: 600; color: #64748b;">${idx + 1}</td>
                    <td class="cell-center"><span class="${badgeClass}"><i class="fas ${badgeIcon}"></i> ${r.txn_type}</span></td>
                    <td class="cell-center">${r.display_date || r.invoice_date}</td>
                    <td class="cell-center" style="font-weight: 700; color: #0369a1;">${r.invoice_no}</td>
                    <td class="cell-center" style="font-weight: 600;">${r.tax_section}</td>
                    <td class="cell-center" style="font-family: monospace;">${r.ntn_cnic || '-'}</td>
                    <td class="cell-left" style="font-weight: 600;" title="${r.party_name}">${r.party_name}</td>
                    <td class="cell-right" style="font-weight: 700;">${fmt(r.taxable_amount)}</td>

                    <!-- Sales Tax Group -->
                    <td class="cell-center" style="background: #f0f9ff; color: #0369a1;">${r.sales_tax_rate > 0 ? fmt(r.sales_tax_rate) : '0.00'}</td>
                    <td class="cell-right" style="background: #f0f9ff; font-weight: 600; color: #0284c7;">${fmt(r.sales_tax_amount)}</td>

                    <!-- Further Tax Group -->
                    <td class="cell-center" style="background: #f0fdf4; color: #15803d;">${r.further_tax_rate > 0 ? fmt(r.further_tax_rate) : '0.00'}</td>
                    <td class="cell-right" style="background: #f0fdf4; font-weight: 600; color: #16a34a;">${fmt(r.further_tax_amount)}</td>

                    <!-- WHT 236G Group -->
                    <td class="cell-center" style="background: #faf5ff; color: #6b21a8;">${r.wht_236g_rate > 0 ? fmt(r.wht_236g_rate) : '0.00'}</td>
                    <td class="cell-right" style="background: #faf5ff; font-weight: 600; color: #7c3aed;">${fmt(r.wht_236g_amount)}</td>

                    <!-- WHT 236H Group -->
                    <td class="cell-center" style="background: #fdf2f8; color: #9d174d;">${r.wht_236h_rate > 0 ? fmt(r.wht_236h_rate) : '0.00'}</td>
                    <td class="cell-right" style="background: #fdf2f8; font-weight: 600; color: #db2777;">${fmt(r.wht_236h_amount)}</td>

                    <!-- Final Totals -->
                    <td class="cell-right" style="font-weight: 800; color: #0f172a; background: #f8fafc;">${fmt(r.total_tax_amount)}</td>
                    <td class="cell-right" style="font-weight: 800; color: #0f172a;">${fmt(r.invoice_total)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Attach click and double-click listeners
        tbody.querySelectorAll('tr.ttr-data-row').forEach(row => {
            row.addEventListener('click', function() {
                tbody.querySelectorAll('tr.ttr-data-row').forEach(r => r.classList.remove('row-selected'));
                this.classList.add('row-selected');
            });

            row.addEventListener('dblclick', function() {
                const source = this.getAttribute('data-source');
                const serialNo = this.getAttribute('data-sn');
                const isTax = this.getAttribute('data-istax');
                openTransactionInvoice(source, serialNo, isTax);
            });
        });

        // Update Footer Totals
        document.getElementById('ttr_foot_taxable').textContent = fmt(totTaxable);
        document.getElementById('ttr_foot_salestax').textContent = fmt(totSalesTax);
        document.getElementById('ttr_foot_furthertax').textContent = fmt(totFurtherTax);
        document.getElementById('ttr_foot_wht236g').textContent = fmt(totWht236g);
        document.getElementById('ttr_foot_wht236h').textContent = fmt(totWht236h);
        document.getElementById('ttr_foot_totaltax').textContent = fmt(totTotalTax);
        document.getElementById('ttr_foot_invtotal').textContent = fmt(totInvoiceTotal);
    }

    function resetFooter() {
        ['ttr_foot_taxable', 'ttr_foot_salestax', 'ttr_foot_furthertax', 'ttr_foot_wht236g', 'ttr_foot_wht236h', 'ttr_foot_totaltax', 'ttr_foot_invtotal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0.00';
        });
    }

    function renderSummaryCards(s) {
        document.getElementById('ttr_card_sales_count').textContent = s.sales_count || 0;
        document.getElementById('ttr_card_sales_tax').textContent = 'Rs. ' + fmt(s.sales_tax_total);

        document.getElementById('ttr_card_purchases_count').textContent = s.purchase_count || 0;
        document.getElementById('ttr_card_purchases_tax').textContent = 'Rs. ' + fmt(s.purchase_tax_total);

        document.getElementById('ttr_card_total_salestax').textContent = 'Rs. ' + fmt(s.total_sales_tax);
        document.getElementById('ttr_card_total_furthertax').textContent = 'Rs. ' + fmt(s.total_further_tax);
        document.getElementById('ttr_card_total_wht236g').textContent = 'Rs. ' + fmt(s.total_wht_236g);
        document.getElementById('ttr_card_total_wht236h').textContent = 'Rs. ' + fmt(s.total_wht_236h);
        document.getElementById('ttr_card_total_taxamount').textContent = 'Rs. ' + fmt(s.total_tax_amount);
    }

    function openTransactionInvoice(source, serialNo, isTax) {
        if (!window.openModularPopup) return;

        if (source === 'purchase_invoice') {
            window.openModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-receipt', 'Purchase Invoice', () => {
                if (window.PIModule && window.PIModule.init) {
                    window.PIModule.init().then(() => {
                        const snInput = document.getElementById('pi_sn');
                        if (snInput) {
                            snInput.value = serialNo;
                            fetch(`api/purchases.php?action=get_pi&company_id=${companyId}&serial_no=${serialNo}`)
                                .then(r => r.json())
                                .then(d => { if (d && d.id) window.PIModule.loadInvoiceData(d); });
                        }
                    });
                }
            }, 'Purchase Invoice', true, true);
        } else {
            // Sale Invoice
            window.openModularPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice-dollar', 'Sale Invoice', () => {
                if (window.SIModule && window.SIModule.init) {
                    window.SIModule.init(true).then(() => {
                        window.SIModule.isTaxMode = (isTax == 1);
                        const taxCheck = document.getElementById('si_is_tax');
                        if (taxCheck) taxCheck.checked = window.SIModule.isTaxMode;
                        if (window.SIModule.toggleTaxMode) window.SIModule.toggleTaxMode(false);
                        const snInput = document.getElementById('si_sn');
                        if (snInput) snInput.value = serialNo;
                        fetch(`api/sale_invoice.php?action=get_invoice&company_id=${companyId}&serial_no=${serialNo}&is_tax=${isTax}`)
                            .then(r => r.json())
                            .then(d => { if (d && d.id && window.SIModule.loadInvoiceData) window.SIModule.loadInvoiceData(d); });
                    });
                }
            }, 'Sale Invoice', true, true);
        }
    }

    function printReport() {
        if (!currentData || !currentData.length) {
            alert('No records to print.');
            return;
        }

        const fromDate = document.getElementById('ttr_from_date')?.value || '';
        const toDate = document.getElementById('ttr_to_date')?.value || '';
        const periodStr = (fromDate && toDate) ? `Period: ${fromDate} to ${toDate}` : 'All Periods';

        const printWin = window.open('', '_blank');
        const tableHtml = document.getElementById('ttr_main_table').outerHTML;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Tax Transaction Report – Sales & Purchase</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 10px; margin: 15px; color: #1e293b; }
                    .header { text-align: center; margin-bottom: 15px; }
                    .header h2 { margin: 0; font-size: 16px; color: #0f2e5a; }
                    .header h4 { margin: 4px 0; font-size: 12px; color: #475569; }
                    table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
                    th, td { border: 1px solid #94a3b8; padding: 3px 5px; }
                    th { background: #0f2e5a; color: #ffffff; text-align: center; }
                    .th-sales-tax { background: #0284c7 !important; color: #ffffff; }
                    .th-further-tax { background: #16a34a !important; color: #ffffff; }
                    .th-wht-236g { background: #7c3aed !important; color: #ffffff; }
                    .th-wht-236h { background: #db2777 !important; color: #ffffff; }
                    tfoot td { background: #f1f5f9; font-weight: bold; }
                    .cell-center { text-align: center; }
                    .cell-right { text-align: right; }
                    .cell-left { text-align: left; }
                    @media print {
                        @page { size: landscape; margin: 8mm; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Tax Transaction Report</h2>
                    <h4>Sales & Purchase (Customer & Vendor)</h4>
                    <p style="margin: 0; font-size: 10px; color: #64748b;">${periodStr} | Filters: Txn: ${activeTxnType.toUpperCase()} | Party: ${activePartyType.toUpperCase()}</p>
                </div>
                ${tableHtml}
            </body>
            </html>
        `;

        printWin.document.write(html);
        printWin.document.close();
        setTimeout(() => { printWin.print(); }, 400);
    }

    function exportExcel() {
        if (!currentData || !currentData.length) {
            alert('No records to export.');
            return;
        }

        const headers = [
            '#', 'Transaction Type', 'Invoice Date', 'Invoice No', 'Tax Section', 'NTN / CNIC',
            'Party Name', 'Taxable Amount',
            'Sales Tax Rate %', 'Sales Tax Amount',
            'Further Tax Rate %', 'Further Tax Amount',
            'WHT 236G Rate %', 'WHT 236G Amount',
            'WHT 236H Rate %', 'WHT 236H Amount',
            'Total Tax Amount', 'Invoice Total'
        ];

        let csv = [headers.map(h => `"${h}"`).join(',')];

        let totTaxable = 0, totST = 0, totFT = 0, tot236g = 0, tot236h = 0, totTax = 0, totInv = 0;

        currentData.forEach((r, idx) => {
            totTaxable += parseFloat(r.taxable_amount || 0);
            totST += parseFloat(r.sales_tax_amount || 0);
            totFT += parseFloat(r.further_tax_amount || 0);
            tot236g += parseFloat(r.wht_236g_amount || 0);
            tot236h += parseFloat(r.wht_236h_amount || 0);
            totTax += parseFloat(r.total_tax_amount || 0);
            totInv += parseFloat(r.invoice_total || 0);

            const row = [
                idx + 1,
                r.txn_type,
                r.display_date || r.invoice_date,
                r.invoice_no,
                r.tax_section,
                r.ntn_cnic,
                (r.party_name || '').replace(/"/g, '""'),
                parseFloat(r.taxable_amount || 0).toFixed(2),
                parseFloat(r.sales_tax_rate || 0).toFixed(2),
                parseFloat(r.sales_tax_amount || 0).toFixed(2),
                parseFloat(r.further_tax_rate || 0).toFixed(2),
                parseFloat(r.further_tax_amount || 0).toFixed(2),
                parseFloat(r.wht_236g_rate || 0).toFixed(2),
                parseFloat(r.wht_236g_amount || 0).toFixed(2),
                parseFloat(r.wht_236h_rate || 0).toFixed(2),
                parseFloat(r.wht_236h_amount || 0).toFixed(2),
                parseFloat(r.total_tax_amount || 0).toFixed(2),
                parseFloat(r.invoice_total || 0).toFixed(2)
            ];
            csv.push(row.map(val => `"${val}"`).join(','));
        });

        // Totals row (Totals at col 0, 6 blank columns for 1-6, then totTaxable at col 7)
        const foot = [
            'Totals', '', '', '', '', '', '',
            totTaxable.toFixed(2),
            '', totST.toFixed(2),
            '', totFT.toFixed(2),
            '', tot236g.toFixed(2),
            '', tot236h.toFixed(2),
            totTax.toFixed(2),
            totInv.toFixed(2)
        ];
        csv.push(foot.map(val => `"${val}"`).join(','));

        const csvContent = '\uFEFF' + csv.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tax_Transaction_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    window.WHTSaleReportModule = {
        init: init,
        selectParty: selectParty,
        fetchData: fetchData,
        printReport: printReport,
        exportExcel: exportExcel
    };

    // Auto-init if DOM element already loaded
    setTimeout(() => {
        if (document.getElementById('ttr_main_table')) {
            init();
        }
    }, 100);
})();
