const IncomeStatement = {
    init: function() {
        this.companyId = sessionStorage.getItem('company_id') || 1;
        this.cacheElements();
        this.bindEvents();
        this.setDefaultDates();
    },

    cacheElements: function() {
        this.radios = document.querySelectorAll('input[name="inc_date_filter"]');
        this.uptoDate = document.getElementById('inc_upto_date');
        this.fromDate = document.getElementById('inc_from_date');
        this.toDate = document.getElementById('inc_to_date');
        this.btnView = document.getElementById('inc_btn_view');
        this.printArea = document.getElementById('inc_print_area');
    },

    bindEvents: function() {
        const self = this;
        this.radios.forEach(r => {
            r.addEventListener('change', () => {
                self.uptoDate.disabled = true;
                self.fromDate.disabled = true;
                self.toDate.disabled = true;

                if (r.value === 'upto') {
                    self.uptoDate.disabled = false;
                } else if (r.value === 'period') {
                    self.fromDate.disabled = false;
                    self.toDate.disabled = false;
                }
            });
        });

        this.btnView.addEventListener('click', () => {
            self.fetchAndRender();
        });
    },

    setDefaultDates: function() {
        const today = new Date().toISOString().split('T')[0];
        this.uptoDate.value = today;
        
        const firstDay = new Date();
        firstDay.setMonth(0, 1); // Jan 1st
        this.fromDate.value = firstDay.toISOString().split('T')[0];
        this.toDate.value = today;
    },

    formatDate: function(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    },

    formatNumber: function(num) {
        if (!num || isNaN(num)) return '0';
        const val = parseFloat(num);
        if (val < 0) {
            return '(' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ')';
        }
        return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },

    fetchAndRender: async function() {
        const filter = document.querySelector('input[name="inc_date_filter"]:checked').value;
        const upto = this.uptoDate.value;
        const from = this.fromDate.value;
        const to = this.toDate.value;

        let url = `api/income_statement.php?action=get_statement&company_id=${this.companyId}&date_filter=${filter}`;
        if (filter === 'upto') {
            if (!upto) return alert('Select Upto Date');
            url += `&upto_date=${upto}`;
        } else if (filter === 'period') {
            if (!from || !to) return alert('Select From and To Dates');
            url += `&from_date=${from}&to_date=${to}`;
        }

        this.btnView.style.opacity = '0.5';
        try {
            const r = await fetch(url);
            if (r.ok) {
                const res = await r.json();
                if (res.status === 'success') {
                    this.renderPrintView(res.data, res.period);
                } else {
                    alert('Error: ' + res.error);
                }
            } else {
                const errText = await r.text();
                alert('Server error (' + r.status + '): ' + errText);
            }
        } catch(e) {
            console.error(e);
            alert('Failed to fetch data');
        } finally {
            this.btnView.style.opacity = '1';
        }
    },

    renderPrintView: function(data, period) {
        // Build HTML
        let periodStr = 'For The Period Ended On ';
        if (period.to) {
            periodStr += this.formatDate(period.to);
        } else {
            periodStr += this.formatDate(new Date().toISOString().split('T')[0]);
        }
        if (period.from && period.to) {
            periodStr = `For The Period From ${this.formatDate(period.from)} To ${this.formatDate(period.to)}`;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const compName = session.company_name || 'M/S SEASTONE PVC PIPE INDUSTRY';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        let html = `<!DOCTYPE html>
            <html>
            <head>
                <title>Income Statement</title>
                <base href="${baseUrl}">
                <style>
                    @page { margin: 0.5cm; }
                    body { font-family: Arial, sans-serif; font-size: 14px; color: #000; padding: 20px; margin: 0; }
                    .hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #000; }
                    .hdr-left { width:120px; }
                    .hdr-center { flex:1; text-align:center; }
                    .hdr-right { width:120px; text-align:right; }
                    .hdr h1 { margin:0; font-size:18px; text-transform: uppercase; color: #2a5879; }
                    .hdr h2 { margin:4px 0 0; font-size:16px; font-style: italic; color:#555; }
                    .hdr h4 { margin: 5px 0 0 0; font-size: 14px; font-style: italic; font-weight: normal; color:#555; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { text-align: right; font-style: italic; text-decoration: underline; padding-bottom: 15px; }
                    td { padding: 4px 0; }
                    .amount { text-align: right; width: 150px; }
                    
                    .section-title { font-weight: bold; font-style: italic; padding-top: 15px; }
                    .item-row td:first-child { padding-left: 20px; font-style: italic; font-size: 13px; }
                    
                    .subtotal-row td { font-weight: bold; font-style: italic; font-size: 15px; padding-top: 15px; }
                    .subtotal-amount { text-align: right; border-top: 1px solid #000; padding-top: 5px !important; }
                    
                    .final-row td { font-weight: bold; font-style: italic; font-size: 16px; padding: 10px 0; border-top: 1px solid #000; border-bottom: 2px solid #000; margin-top: 20px; }
                    .final-row td.amount { border-top: 1px solid #000; border-bottom: 2px solid #000; }
                    
                    .expense-total { border-top: 1px solid #000; padding-top: 5px; }
                </style>
            </head>
            <body>
                <div class="hdr">
                    <div class="hdr-left"><img src="${actualLogo}" style="max-height:60px;"></div>
                    <div class="hdr-center">
                        <h1>${compName}</h1>
                        <h2>Income Statement</h2>
                        <h4>${periodStr}</h4>
                    </div>
                    <div class="hdr-right"></div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th>Amount Rs.</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Helper to render sections
        const renderSection = (title, items) => {
            let total = 0;
            let secHtml = `<tr><td colspan="2" class="section-title">${title}</td></tr>`;
            if (items && items.length > 0) {
                items.forEach(item => {
                    secHtml += `<tr class="item-row">
                        <td>${item.account_name}</td>
                        <td class="amount">${this.formatNumber(item.balance)}</td>
                    </tr>`;
                    total += parseFloat(item.balance);
                });
            } else {
                // If empty, show 0 for the generic name
                secHtml += `<tr class="item-row">
                    <td>${title}</td>
                    <td class="amount">0</td>
                </tr>`;
            }
            return { html: secHtml, total: total };
        };

        // Render Income
        let revenue = renderSection('Income', data['Revenue']);
        html += revenue.html;

        // Render Cost of Sales
        let cogs = renderSection('Cost of Sales', data['Cost of Sales']);
        // If empty, just show 'Cost of Sales' with 0. The screenshot shows this explicitly.
        html += cogs.html;

        // Gross Profit
        let grossProfit = revenue.total + cogs.total;
        html += `
            <tr class="subtotal-row">
                <td style="text-align: center; padding-right: 50px;">Gross Profit / (Loss)</td>
                <td class="subtotal-amount amount">${this.formatNumber(grossProfit)}</td>
            </tr>
        `;

        // Render other sections
        let otherInc = renderSection('Other Income', data['Other Operating Income']);
        html += otherInc.html;

        let opExp = renderSection('Operating Expenses', data['Administrative Expenses']);
        // In the screenshot they have "Marketing & Distribution Expenses" under Operating Expenses. 
        // Let's add them all to Operating Expenses
        if (data['Marketing & Distribution Expenses'] && data['Marketing & Distribution Expenses'].length > 0) {
            data['Marketing & Distribution Expenses'].forEach(item => {
                opExp.html += `<tr class="item-row">
                    <td>${item.account_name}</td>
                    <td class="amount">${this.formatNumber(item.balance)}</td>
                </tr>`;
                opExp.total += parseFloat(item.balance);
            });
        } else {
            opExp.html += `<tr class="item-row">
                <td>Marketing & Distribution Expenses</td>
                <td class="amount">0</td>
            </tr>`;
        }
        html += opExp.html;

        let finExp = renderSection('Financial Expenses', data['Financial Expenses']);
        html += finExp.html;

        let othExp = renderSection('Other Expenses', data['Other Expenses']);
        html += othExp.html;

        let tax = renderSection('Taxation', data['Taxation']);
        html += tax.html;

        let totalExpenses = opExp.total + finExp.total + othExp.total + tax.total;
        
        // Show total expenses below taxation like in screenshot
        html += `
            <tr>
                <td></td>
                <td class="amount" style="border-top: 1px solid #000; padding-top: 5px;">${this.formatNumber(totalExpenses)}</td>
            </tr>
        `;

        let netProfit = grossProfit + otherInc.total + totalExpenses;

        // Net Profit
        html += `
            <tr class="final-row">
                <td style="text-align: center; padding-right: 50px;">Net Profit / (Loss) for the Period</td>
                <td class="amount">${this.formatNumber(netProfit)}</td>
            </tr>
        `;

        html += `
                    </tbody>
                </table>
            </body>
            </html>
        `;

        // Open print window
        const printWin = window.open('', '_blank', 'width=800,height=600');
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
            printWin.print();
        }, 500);
    }
};

IncomeStatement.init();
