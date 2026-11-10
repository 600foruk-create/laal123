const BalanceSheet = (function() {
    const self = {
        companyId: null,

        getEl: function(id) {
            return document.getElementById(id);
        },

        init: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.companyId = session.company_id || 1;

            this.bindEvents();
            
            const today = new Date().toISOString().split('T')[0];
            if (this.getEl('bs_on_date')) this.getEl('bs_on_date').value = today;
            
            // disable/enable on_date based on radio
            const toggleInputs = () => {
                const filterOnDate = this.getEl('bs_filter_on_date') && this.getEl('bs_filter_on_date').checked;
                if (this.getEl('bs_on_date')) this.getEl('bs_on_date').disabled = !filterOnDate;
            };
            
            if (this.getEl('bs_filter_to_date')) this.getEl('bs_filter_to_date').addEventListener('change', toggleInputs);
            if (this.getEl('bs_filter_on_date')) this.getEl('bs_filter_on_date').addEventListener('change', toggleInputs);
            toggleInputs();
        },

        bindEvents: function() {
            const btnView = this.getEl('btn_view_balance_sheet');
            if (btnView) {
                btnView.addEventListener('click', () => {
                    this.fetchAndRender();
                });
            }
        },

        formatDate: function(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
        },

        formatDateLong: function(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        },

        formatAmt: function(amt) {
            return Number(amt).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        },

        fetchAndRender: async function() {
            console.log("fetchAndRender called");
            
            const filterToDate = this.getEl('bs_filter_to_date') && this.getEl('bs_filter_to_date').checked;
            const filterOnDate = this.getEl('bs_filter_on_date') && this.getEl('bs_filter_on_date').checked;
            
            let filter = 'to_date';
            let onDate = '';

            if (filterOnDate) {
                filter = 'on_date';
                onDate = this.getEl('bs_on_date').value;
                if (!onDate) {
                    alert('Please select a date.');
                    return;
                }
            }

            let url = `api/balance_sheet.php?action=get_sheet&company_id=${this.companyId}&date_filter=${filter}`;
            if (filter === 'on_date') {
                url += `&on_date=${onDate}`;
            }

            try {
                const r = await fetch(url);
                if (r.ok || r.status === 500) {
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
                alert('Connection error');
            }
        },

        renderPrintView: function(data, period) {
            let periodStr = 'As On ';
            if (period.to) {
                periodStr += this.formatDateLong(period.to);
            } else {
                periodStr += this.formatDateLong(new Date().toISOString().split('T')[0]);
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compName = session.company_name || 'M/S SEASTONE PVC PIPE INDUSTRY';
            const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

            let html = `<!DOCTYPE html>
                <html>
                <head>
                    <title>Balance Sheet</title>
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
                        
                        .section-title { font-weight: bold; font-style: italic; padding-top: 15px; font-size: 18px; }
                        .main-title { font-weight: bold; font-style: italic; padding-top: 15px; font-size: 15px; padding-left: 20px; }
                        .item-row td:first-child { padding-left: 40px; font-style: italic; font-size: 13px; color: #333; }
                        
                        .subtotal-row td { font-weight: bold; font-style: italic; font-size: 14px; padding-top: 10px; }
                        .subtotal-amount { text-align: right; border-top: 1px solid #ccc; padding-top: 5px !important; }
                        
                        .final-row td { font-weight: bold; font-style: italic; font-size: 16px; padding: 10px 0; border-top: 1px double #000; border-bottom: 2px solid #000; margin-top: 20px; text-align: center; }
                        .final-row td.amount { border-top: 1px double #000; border-bottom: 2px solid #000; text-align: right; }
                        
                    </style>
                </head>
                <body>
                    <div class="hdr">
                        <div class="hdr-left"><img src="${actualLogo}" style="max-height:60px;"></div>
                        <div class="hdr-center">
                            <h1 style="color: #000;">${compName}</h1>
                            <h2>Balance Sheet</h2>
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

            // Function to render a section (Assets or Liabilities & Equity)
            const renderSection = (title, sectionsData) => {
                let sectionTotal = 0;
                
                html += `<tr><td colspan="2" class="section-title">${title}</td></tr>`;
                
                for (let mainName in sectionsData) {
                    html += `<tr><td colspan="2" class="main-title">${mainName}</td></tr>`;
                    let mainTotal = 0;
                    
                    for (let subName in sectionsData[mainName]) {
                        let amount = sectionsData[mainName][subName];
                        mainTotal += amount;
                        
                        html += `
                            <tr class="item-row">
                                <td>${subName}</td>
                                <td class="amount">${this.formatAmt(amount)}</td>
                            </tr>
                        `;
                    }
                    
                    sectionTotal += mainTotal;
                    
                    html += `
                        <tr class="subtotal-row">
                            <td></td>
                            <td class="subtotal-amount">${this.formatAmt(mainTotal)}</td>
                        </tr>
                    `;
                }
                
                html += `
                    <tr class="final-row">
                        <td>Total ${title}</td>
                        <td class="amount">${this.formatAmt(sectionTotal)}</td>
                    </tr>
                    <tr><td colspan="2" style="height: 30px;"></td></tr>
                `;
            };

            if (data['Assets']) renderSection('Assets', data['Assets']);
            if (data['Liabilities & Equity']) renderSection('Liabilities & Equity', data['Liabilities & Equity']);

            html += `
                        </tbody>
                    </table>
                </body>
                </html>
            `;

            const printWindow = window.open('', '_blank', 'width=1000,height=700');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                
                setTimeout(() => {
                    printWindow.print();
                }, 500);
            }
        }
    };

    return self;
})();

window.BalanceSheet = BalanceSheet;
