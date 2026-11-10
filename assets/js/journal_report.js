window.JournalReportModule = {
    currentReportData: [],
    keydownBound: false,

    init: function() {
        if (!this.keydownBound) {
            if (window.jrKeydownHandler) {
                window.removeEventListener('keydown', window.jrKeydownHandler);
            }
            window.jrKeydownHandler = (e) => {
                if (document.querySelector('.modal-overlay.active') || document.querySelector('.modal.active')) return;
                
                const tbody = document.getElementById('journal-table-body');
                if (!tbody || tbody.offsetParent === null) return;
                
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const rows = Array.from(tbody.querySelectorAll('tr'));
                    if (rows.length === 0) return;
                    
                    let currentIdx = rows.findIndex(r => r.classList.contains('selected-row'));
                    let targetIdx = -1;
                    
                    if (e.key === 'ArrowDown') {
                        if (currentIdx === -1) targetIdx = 0;
                        else if (currentIdx < rows.length - 1) targetIdx = currentIdx + 1;
                    } else if (e.key === 'ArrowUp') {
                        if (currentIdx > 0) targetIdx = currentIdx - 1;
                    }
                    
                    if (targetIdx !== -1) {
                        rows[targetIdx].click();
                        const container = tbody.closest('.table-responsive') || tbody.closest('div');
                        if (container) {
                            const tr = rows[targetIdx];
                            const rTop = tr.offsetTop;
                            const rBottom = rTop + tr.offsetHeight;
                            const cTop = container.scrollTop;
                            const cBottom = cTop + container.clientHeight;
                            
                            if (rTop < cTop) {
                                container.scrollTop = rTop;
                            } else if (rBottom > cBottom) {
                                container.scrollTop = rBottom - container.clientHeight;
                            }
                        }
                    }
                }
            };
            window.addEventListener('keydown', window.jrKeydownHandler);
            this.keydownBound = true;
        }

        console.log('Journal Report Module Initialized');
        const today = new Date().toISOString().split('T')[0];
        const fromEl = document.getElementById('journal-from-date');
        const toEl = document.getElementById('journal-to-date');
        if (fromEl) fromEl.value = today;
        if (toEl) toEl.value = today;
        
        this.toggleDates();
    },

    toggleDates: function() {
        const isChecked = document.getElementById('journal-period-checkbox').checked;
        document.getElementById('journal-from-date').disabled = !isChecked;
        document.getElementById('journal-to-date').disabled = !isChecked;
    },

    fetchReport: async function() {
        const isPeriodChecked = document.getElementById('journal-period-checkbox').checked;
        const fromDate = isPeriodChecked ? document.getElementById('journal-from-date').value : '';
        const toDate = isPeriodChecked ? document.getElementById('journal-to-date').value : '';

        if (isPeriodChecked && (!fromDate || !toDate)) {
            alert('Please select both From and To dates.');
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const tbody = document.getElementById('journal-table-body');
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px; color:#1f4668;">Loading Journal Report Data...</td></tr>';

        try {
            const url = `api/journal_report.php?company_id=${companyId}&from_date=${fromDate}&to_date=${toDate}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.error || data.status === 'error') {
                    const msg = data.error || data.message || 'Unknown error';
                    alert(msg);
                    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: red;">${msg}</td></tr>`;
                    return;
                }
                
                // Filter out entries with both 0 debit and credit
                const validTx = (data.transactions || []).filter(tx => parseFloat(tx.debit) > 0 || parseFloat(tx.credit) > 0);
                
                const isConsolidate = document.getElementById('journal-consolidate-checkbox') && document.getElementById('journal-consolidate-checkbox').checked;
                if (isConsolidate) {
                    const consolidated = {};
                    validTx.forEach(tx => {
                        const key = tx.ref_no || 'UNKNOWN';
                        if (!consolidated[key]) {
                            consolidated[key] = {
                                ...tx,
                                debit: 0,
                                credit: 0,
                                coa_code: 'MULTIPLE',
                                coa_name: 'Combined Voucher',
                                description: 'Summary of Voucher ' + key
                            };
                        }
                        consolidated[key].debit += parseFloat(tx.debit) || 0;
                        consolidated[key].credit += parseFloat(tx.credit) || 0;
                    });
                    this.renderReportData(Object.values(consolidated));
                } else {
                    this.renderReportData(validTx);
                }
            } else {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Failed to fetch report from server.</td></tr>';
            }
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Failed to load data. Please check API connection.</td></tr>';
        }
    },

    renderReportData: function(transactions) {
        this.currentReportData = transactions || [];
        const tbody = document.getElementById('journal-table-body');
        tbody.innerHTML = '';

        if (this.currentReportData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px; color:#999;">No transactions found for this period.</td></tr>';
            document.getElementById('journal-total-debit').value = '0.00';
            document.getElementById('journal-total-credit').value = '0.00';
            return;
        }

        let totalDebit = 0;
        let totalCredit = 0;
        let selectedRow = null;

        this.currentReportData.forEach((tx, idx) => {
            const debit = parseFloat(tx.debit) || 0;
            const credit = parseFloat(tx.credit) || 0;
            totalDebit += debit;
            totalCredit += credit;

            const formattedDate = tx.date
                ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                : '';

            const isCancelled = (parseInt(tx.cancel) === 1);
            const cancelStatus = isCancelled ? '<span style="color:red; font-weight:bold;">Cancelled</span>' : 'No';
            const postedStatus = isCancelled ? '' : ((parseInt(tx.posted) === 1) ? 'Posted' : 'No');

            const rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';

            const tr = document.createElement('tr');
            tr.style.backgroundColor = rowBg;
            tr.innerHTML = `
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">
                    <i class="fas fa-caret-right" style="font-size: 9px; color: #aaa;"></i>
                </td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${tx.ref_no || ''}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${formattedDate}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${tx.coa_code || ''}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${tx.coa_name || ''}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${tx.description || ''}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${debit > 0 ? this.fmt(debit) : ''}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${credit > 0 ? this.fmt(credit) : ''}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${postedStatus}</td>
                <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${cancelStatus}</td>
            `;

            tr.addEventListener('click', () => {
                if (selectedRow) {
                    selectedRow.style.backgroundColor = selectedRow._origBg;
                    selectedRow.style.color = '';
                    selectedRow.style.fontWeight = '';
                    selectedRow.classList.remove('selected-row');
                }
                if (selectedRow === tr) {
                    selectedRow = null;
                    return;
                }
                tr._origBg = rowBg;
                tr.style.backgroundColor = '#1f4668';
                tr.style.color = '#fff';
                tr.style.fontWeight = 'bold';
                tr.classList.add('selected-row');
                selectedRow = tr;
            });

            tr.addEventListener('dblclick', async () => {
                if (!tx.ref_no) return;
                const parts = tx.ref_no.split('-');
                if (parts.length < 2) return;
                const sType = parts[0];
                const sNo = parts[1];

                const map = {
                    'SI': { url: 'Navigation/Sales/sale_invoice.html', title: 'Sale Invoice', mod: 'SIModule' },
                    'SR': { url: 'Navigation/Sales/sale_return.html', title: 'Sale Return', mod: 'SRModule' },
                    'PI': { url: 'Navigation/Purchases/purchase_invoice.html', title: 'Purchase Invoice', mod: 'PIModule' },
                    'PR': { url: 'Navigation/Purchases/purchase_return.html', title: 'Purchase Return', mod: 'PRModule' },
                    'CR': { url: 'Navigation/Sales/cash_receipts.html', title: 'Cash Receipt', mod: 'CRModule' },
                    'CP': { url: 'Navigation/Purchases/cash_payments.html', title: 'Cash Payment', mod: 'CPModule' },
                    'BR': { url: 'Navigation/Sales/bank_receipts.html', title: 'Bank Receipt', mod: 'BRModule' },
                    'BP': { url: 'Navigation/Purchases/bank_payments.html', title: 'Bank Payment', mod: 'BPModule' },
                    'JV': { url: 'Navigation/Adjustment/general_journal_voucher.html', title: 'General Journal Voucher', mod: 'GJVModule' }
                };
                
                const info = map[sType];
                if (!info) return;

                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const compId = session.company_id || 1;

                window.openModularPopup(info.url, 'fa-file-alt', info.title, async () => {
                    try {
                        const mod = window[info.mod];
                        if (mod && mod.init) await mod.init();
                    } catch (e) { console.error(e); }

                    if (sType === 'SI' && window.SIModule) fetch(`api/sale_invoice.php?action=get_invoice&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.SIModule.loadInvoiceData(d);});
                    else if (sType === 'SR' && window.SRModule) fetch(`api/sale_return.php?action=get_return&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.SRModule.fillForm(d);});
                    else if (sType === 'PI' && window.PIModule) fetch(`api/purchases.php?action=get_invoice&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.PIModule.loadInvoiceData(d);});
                    else if (sType === 'PR' && window.PRModule) fetch(`api/purchases.php?action=get_return&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.PRModule.loadReturnData(d);});
                    else if (sType === 'CR' && window.CRModule) fetch(`api/cash_receipts.php?action=get&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.CRModule.loadData(d);});
                    else if (sType === 'CP' && window.CPModule) fetch(`api/cash_payments.php?action=get&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.CPModule.loadData(d);});
                    else if (sType === 'BR' && window.BRModule) fetch(`api/bank_receipts.php?action=get&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.BRModule.loadData(d);});
                    else if (sType === 'BP' && window.BPModule) fetch(`api/bank_payments.php?action=get&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.BPModule.loadData(d);});
                    else if (sType === 'JV' && window.GJVModule) fetch(`api/general_journal_voucher.php?action=get&id=${tx.source_id}&company_id=${compId}`).then(r=>r.json()).then(d=>{if(d&&d.id)window.GJVModule.loadData(d);});
                }, info.title, false, true);
            });

            tbody.appendChild(tr);
        });

        document.getElementById('journal-total-debit').value = this.fmt(totalDebit);
        document.getElementById('journal-total-credit').value = this.fmt(totalCredit);
    },

    fmt: function(n) {
        return parseFloat(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    printReport: async function() {
        if (!this.currentReportData || this.currentReportData.length === 0) {
            alert('No data to print. Please display report first.');
            return;
        }
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

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

        const companyName = companyInfo.name || session.company_name || 'Company';
        const isPeriodChecked = document.getElementById('journal-period-checkbox').checked;
        const periodText = isPeriodChecked
            ? `${document.getElementById('journal-from-date').value} To ${document.getElementById('journal-to-date').value}`
            : 'All Dates';

        let totalDebit = 0;
        let totalCredit = 0;
        let rows = '';

        this.currentReportData.forEach(tx => {
            const debit = parseFloat(tx.debit) || 0;
            const credit = parseFloat(tx.credit) || 0;
            totalDebit += debit;
            totalCredit += credit;

            const formattedDate = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';
            const isCancelled = (parseInt(tx.cancel) === 1);
            const cancelStatus = isCancelled ? '<span style="color:red; font-weight:bold;">Cancelled</span>' : 'No';
            const postedStatus = (parseInt(tx.posted) === 1) ? 'Posted' : 'No';

            rows += `<tr>
                <td>${tx.ref_no || ''}</td>
                <td>${formattedDate}</td>
                <td>${tx.coa_code || ''}</td>
                <td>${tx.coa_name || ''}</td>
                <td>${tx.description || ''}</td>
                <td style="text-align:right">${debit > 0 ? this.fmt(debit) : ''}</td>
                <td style="text-align:right">${credit > 0 ? this.fmt(credit) : ''}</td>
                <td style="text-align:center">${postedStatus}</td>
                <td style="text-align:center">${cancelStatus}</td>
            </tr>`;
        });

        const userName = session.name || session.username || 'User';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        // Build contact line from fresh API data
        let contactParts = [];
        if (companyInfo.address) contactParts.push(companyInfo.address);
        if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
        if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
        const contactLine = contactParts.length > 0
            ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>`
            : '';

        const printContent = `<!DOCTYPE html><html><head><title>General Journal Report</title><base href="${baseUrl}">
        <style>
            @page { margin: 0; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            .meta{display:flex;justify-content:space-between;margin-bottom:10px;font-weight:bold;font-size:12px}
            table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #ccc;padding:4px 6px}
            th{background:#f0f0f0;font-weight:bold}
        </style></head><body>
        <div class="hdr">
            <div class="hdr-left" style="text-align: left;">${logoImg}</div>
            <div class="hdr-center"><h1>${companyName}</h1>${contactLine}<h2>General Journal Report</h2></div>
            <div class="hdr-right"></div>
        </div>
        <div class="meta"><span>Report: General Journal Report</span><span>Period: ${periodText}</span></div>
        <table>
            <thead>
                <tr>
                    <th>Tran. No.</th><th>Date</th><th>Account Code</th><th>Account Name</th>
                    <th>Description</th><th>Debit</th><th>Credit</th><th>Posted</th><th>Cancel</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="5" style="text-align: right; font-weight: bold; padding: 6px;">Totals Rs.</td>
                    <td style="text-align: right; font-weight: bold; padding: 6px;">${this.fmt(totalDebit)}</td>
                    <td style="text-align: right; font-weight: bold; padding: 6px;">${this.fmt(totalCredit)}</td>
                    <td colspan="2" style="background-color: #f0f0f0;"></td>
                </tr>
            </tfoot>
        </table>
        <div style="display:flex; justify-content:space-between; color:#777; font-size:10px; margin-top:15px; font-style:italic;">
            <span>Printed by: ${userName}</span>
            <span>Generated: ${new Date().toLocaleString()} | SoftifyX ERP</span>
        </div>
        </body></html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    },

    exportExcel: function() {
        if (!this.currentReportData || this.currentReportData.length === 0) {
            alert('No data to export.');
            return;
        }
        let csv = 'Tran. No.,Date,Account Code,Account Name,Description,Debit,Credit,Posted,Cancel\n';

        this.currentReportData.forEach(tx => {
            const debit = parseFloat(tx.debit) || 0;
            const credit = parseFloat(tx.credit) || 0;
            const date = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';
            const desc = (tx.description || '').replace(/,/g, ' ');
            const accountName = (tx.coa_name || '').replace(/,/g, ' ');
            const cancelStatus = (parseInt(tx.cancel) === 1) ? 'Cancelled' : 'No';
            const postedStatus = (parseInt(tx.posted) === 1) ? 'Posted' : 'No';

            csv += `${tx.ref_no || ''},${date},${tx.coa_code || ''},${accountName},${desc},${debit || ''},${credit || ''},${postedStatus},${cancelStatus}\n`;
        });

        const link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        link.download = `General_Journal_Report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
