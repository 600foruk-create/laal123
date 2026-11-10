window.JobLedgersModule = {
    jobs: [],
    
    getEl: function(id) {
        return document.getElementById(id);
    },
    
    init: function() {
        this.fetchJobs();
        this.bindEvents();
    },
    
    fetchJobs: function() {
        const self = this;
        fetch('api/job_ledgers.php?action=get_jobs&company_id=' + (window.currentCompanyId || 1))
        .then(r => r.json())
        .then(data => {
            self.jobs = data;
            self.setupSuggest();
        })
        .catch(e => console.error('Error fetching jobs:', e));
    },
    
    setupSuggest: function() {
        const self = this;
        const select = self.getEl('jl_job');
        
        // Clear existing options except the first one
        select.innerHTML = '<option value="">Select Job...</option>';
        
        self.jobs.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.job_no + ' - ' + (j.description || '');
            select.appendChild(opt);
        });
        
        select.onchange = function() {
            const jobId = this.value;
            if(!jobId) {
                self.getEl('jl_customer').value = '';
                self.getEl('jl_incharge').value = '';
                self.getEl('jl_est_cost').value = '';
                self.getEl('jl_val_job').value = '';
                return;
            }
            const j = self.jobs.find(x => x.id == jobId);
            if(j) {
                self.onJobSelected(j);
            }
        };
    },
    
    onJobSelected: function(j) {
        const formatAmt = amt => parseFloat(amt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        
        this.getEl('jl_customer').value = j.customer_name || '';
        this.getEl('jl_incharge').value = j.job_incharge_name || '';
        this.getEl('jl_est_cost').value = formatAmt(j.estimated_cost);
        this.getEl('jl_val_job').value = formatAmt(j.value_of_job);
        
        // Auto-display when a job is selected
        this.displayReport();
    },
    
    bindEvents: function() {
        const self = this;
        
        window.addEventListener('resize', () => {
            if(self.alignTotals) self.alignTotals();
        });
        
        const btnDisplay = self.getEl('jl_btn_display');
        if(btnDisplay) {
            btnDisplay.onclick = () => self.displayReport();
        }
        
        const btnPrint = self.getEl('jl_btn_print');
        if(btnPrint) {
            btnPrint.onclick = () => {
                const jobVal = self.getEl('jl_job').value;
                if(!jobVal) {
                    alert('Please select a Job first.');
                    return;
                }
                self.printReport();
            };
        }
    },
    
    displayReport: async function() {
        const self = this;
        const jobVal = self.getEl('jl_job').value;
        if(!jobVal) {
            alert('Please select a Job to display the ledger.');
            return;
        }
        
        const tbody = self.getEl('jl_tbody');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">Loading...</td></tr>';
        
        try {
            const url = `api/job_ledgers.php?action=get_job_ledger&job_id=${jobVal}&company_id=${window.currentCompanyId || 1}`;
            const res = await fetch(url);
            const data = await res.json();
            
            if(data.error) {
                alert('Error: ' + data.error);
                tbody.innerHTML = '';
                return;
            }
            
            tbody.innerHTML = '';
            
            const formatAmt = amt => {
                const val = parseFloat(amt || 0);
                if(val === 0) return '';
                return val.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
            };
            
            const formatAmtZero = amt => parseFloat(amt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
            
            let totDebit = 0;
            let totCredit = 0;
            
            const txs = data.data || [];
            if(txs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:10px; color:#555; font-style:italic;">No transactions found for this job.</td></tr>';
            } else {
                txs.forEach(tx => {
                    const d = parseFloat(tx.debit || 0);
                    const c = parseFloat(tx.credit || 0);
                    totDebit += d;
                    totCredit += c;
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${tx.date || ''}</td>
                        <td>${tx.tran_no || ''}</td>
                        <td>${tx.account_code || ''}</td>
                        <td>${tx.account_name || ''}</td>
                        <td>${tx.description || ''}</td>
                        <td style="text-align:right;">${formatAmt(d)}</td>
                        <td style="text-align:right;">${formatAmt(c)}</td>
                        <td style="text-align:right; font-weight:bold;">${formatAmt(tx.profit_loss)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            
            self.getEl('jl_tot_debit').textContent = formatAmtZero(totDebit);
            self.getEl('jl_tot_credit').textContent = formatAmtZero(totCredit);
            
            const finalPL = totCredit - totDebit; // Since credit is revenue and debit is expense
            const plEl = self.getEl('jl_tot_pl');
            plEl.textContent = formatAmtZero(finalPL);
            
            if (finalPL < 0) {
                plEl.style.color = 'red';
                plEl.textContent = '(' + formatAmtZero(Math.abs(finalPL)) + ')';
            } else {
                plEl.style.color = 'black';
            }
            
            self.currentData = txs;
            self.currentTotals = { debit: totDebit, credit: totCredit, pl: finalPL };
            
            setTimeout(() => self.alignTotals(), 50);
            
        } catch(e) {
            console.error(e);
            alert('Error fetching ledger: ' + e.message);
            tbody.innerHTML = '';
        }
    },
    
    alignTotals: function() {
        const table = document.getElementById('jl_table');
        if (!table) return;
        const ths = table.querySelectorAll('thead th');
        if(ths.length < 8) return;
        
        const setWidth = (id, width) => {
            const el = document.getElementById(id);
            if(el) {
                el.style.width = width + 'px';
                el.style.minWidth = width + 'px';
                el.style.maxWidth = width + 'px';
            }
        };
        
        // Sum up widths of col 0,1,2,3,4 for the 'Totals' label
        let labelW = 0;
        for(let i = 0; i <= 4; i++) {
            labelW += ths[i].getBoundingClientRect().width;
        }
        
        setWidth('jl_tot_label', labelW);
        setWidth('jl_tot_debit_wrap', ths[5].getBoundingClientRect().width);
        setWidth('jl_tot_credit_wrap', ths[6].getBoundingClientRect().width);
        setWidth('jl_tot_pl_wrap', ths[7].getBoundingClientRect().width);
    },
    
    printReport: function() {
        const self = this;
        const jobVal = self.getEl('jl_job').value;
        if(!jobVal || !self.currentData) {
            alert('No data to print. Please display a report first.');
            return;
        }
        
        const jobNo = self.getEl('jl_job').options[self.getEl('jl_job').selectedIndex].text;
        const customer = self.getEl('jl_customer').value;
        const incharge = self.getEl('jl_incharge').value;
        const estCost = self.getEl('jl_est_cost').value;
        const valJob = self.getEl('jl_val_job').value;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyName = session.company_name || 'L S ENGINEERING HUB';
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        
        const formatAmt = amt => parseFloat(amt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        
        let rowsHtml = '';
        if(self.currentData.length === 0) {
            rowsHtml = '<tr><td colspan="8" style="text-align:center; padding:10px; color:#555; font-style:italic;">No transactions found for this job.</td></tr>';
        } else {
            self.currentData.forEach(tx => {
                const d = parseFloat(tx.debit || 0);
                const c = parseFloat(tx.credit || 0);
                rowsHtml += `<tr>
                    <td>${tx.date || ''}</td>
                    <td>${tx.tran_no || ''}</td>
                    <td>${tx.account_code || ''}</td>
                    <td>${tx.account_name || ''}</td>
                    <td>${tx.description || ''}</td>
                    <td style="text-align:right;">${d === 0 ? '' : formatAmt(d)}</td>
                    <td style="text-align:right;">${c === 0 ? '' : formatAmt(c)}</td>
                    <td style="text-align:right; font-weight:bold;">${formatAmt(tx.profit_loss)}</td>
                </tr>`;
            });
        }
        
        const tot = self.currentTotals || { debit: 0, credit: 0, pl: 0 };
        const plText = tot.pl < 0 ? '(' + formatAmt(Math.abs(tot.pl)) + ')' : formatAmt(tot.pl);
        
        const printContent = `<!DOCTYPE html><html><head><title>Job Ledgers</title><base href="${baseUrl}">
        <style>
            @page { margin: 0.5cm; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            .job-info { margin-bottom: 20px; width: 100%; border-collapse: collapse; }
            .job-info td { padding: 4px; border: none; font-size: 12px; }
            table.data-table {width:100%;border-collapse:collapse;margin-bottom:20px;}
            table.data-table th, table.data-table td{border:1px solid #ccc;padding:4px 6px}
            table.data-table th{background:#f0f0f0;font-weight:bold;text-align:center;}
        </style></head><body>
            <div class="hdr">
                <div class="hdr-left"><img src="${actualLogo}" style="max-height:60px;"></div>
                <div class="hdr-center"><h1>${companyName}</h1><h2>Job Ledgers Report</h2></div>
                <div class="hdr-right"></div>
            </div>
            
            <table class="job-info">
                <tr>
                    <td style="width:15%; font-weight:bold;">Job No. & Desc:</td>
                    <td style="width:35%;">${jobNo}</td>
                    <td style="width:15%; font-weight:bold;">Customer Name:</td>
                    <td style="width:35%;">${customer}</td>
                </tr>
                <tr>
                    <td style="font-weight:bold;">Job Incharge:</td>
                    <td>${incharge}</td>
                    <td style="font-weight:bold;">Estimated Cost:</td>
                    <td>${estCost} &nbsp;&nbsp;&nbsp;&nbsp; <b>Value of Job:</b> ${valJob}</td>
                </tr>
            </table>
            
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Tran. No.</th>
                        <th>Account Code</th>
                        <th>Account Name</th>
                        <th>Description</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Profit / (Loss)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr style="background:#f0f0f0; font-weight:bold;">
                        <td colspan="5" style="text-align:right;">Totals</td>
                        <td style="text-align:right;">${formatAmt(tot.debit)}</td>
                        <td style="text-align:right;">${formatAmt(tot.credit)}</td>
                        <td style="text-align:right; color:${tot.pl < 0 ? 'red' : 'black'};">${plText}</td>
                    </tr>
                </tbody>
            </table>
        </body></html>`;

        const printWindow = window.open('', '_blank', 'width=1000,height=700');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }
};
