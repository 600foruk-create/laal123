// --- JOBS MODULE LOGIC ---
window.JobsModule = {
    jobs: [],
    customers: [],
    selectedJobId: null,
    selectedCustId: null,

    init: async function() {
        console.log("Jobs Module: Initializing...");
        await this.loadEmployees();
        await this.loadCustomers();
        await this.loadJobs();
        this.setupAutocomplete();
        this.resetForm(true);
    },

    loadEmployees: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
            const emps = await res.json();
            const select = document.getElementById('jobIncharge');
            if (select) {
                select.innerHTML = '<option value="">Select Incharge</option>';
                emps.forEach(e => {
                    select.innerHTML += `<option value="${e.id}">${e.name}</option>`;
                });
            }
        } catch (e) { console.error("Load Employees Error:", e); }
    },

    loadCustomers: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/jobs.php?action=get_all_customers&company_id=${companyId}`);
            this.customers = await res.json();
        } catch (e) { console.error("Load Customers Error:", e); }
    },

    loadJobs: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/jobs.php?action=get_jobs&company_id=${companyId}&_cb=${Date.now()}`);
            this.jobs = await res.json();
            this.jobs.sort((a, b) => parseInt(a.job_no) - parseInt(b.job_no));
            this.renderJobs();
        } catch (e) { console.error("Load Jobs Error:", e); }
    },

    renderJobs: function() {
        const tbody = document.getElementById('jobListBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.jobs.forEach(j => {
            const tr = document.createElement('tr');
            if (this.selectedJobId == j.id) tr.classList.add('active');
            tr.onclick = () => this.selectJob(j.id);
            tr.innerHTML = `
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${j.job_no}</td>
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${j.job_date}</td>
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${j.description || ''}</td>
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${j.customer_name || ''}</td>
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee; text-align:right;">${parseFloat(j.value_of_job).toLocaleString()}</td>
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${j.completion_date || ''}</td>
                <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${j.is_completed == 1 ? '<span style="color:green;font-weight:700;">Completed</span>' : '<span style="color:orange;font-weight:700;">Active</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    selectJob: function(id) {
        this.selectedJobId = id;
        const j = this.jobs.find(x => x.id == id);
        if (j) {
            document.getElementById('jobNo').value = j.job_no;
            document.getElementById('jobDate').value = j.job_date;
            document.getElementById('jobDescription').value = j.description || '';
            document.getElementById('jobOrderRef').value = j.order_no_date || '';
            document.getElementById('jobExpDate').value = j.exp_delivery_date || '';
            document.getElementById('jobIncharge').value = j.job_incharge_id || '';
            document.getElementById('jobEstCost').value = j.estimated_cost;
            document.getElementById('jobValue').value = j.value_of_job;
            document.getElementById('jobIsCompleted').checked = (j.is_completed == 1);
            document.getElementById('jobCompDate').value = j.completion_date || '';
            document.getElementById('jobDelRef').value = j.delivery_ref_dt || '';
            document.getElementById('jobRemarks').value = j.remarks || '';
            
            // Populate Customer Section
            const cust = this.customers.find(c => c.id == j.coa_list_id);
            if (cust) {
                this.selectedCustId = cust.id;
                document.getElementById('jobCustCode').value = cust.code;
                document.getElementById('jobCustName').value = cust.name;
                document.getElementById('jobCustContact').value = cust.contact_person || '';
                document.getElementById('jobCustAddress').value = cust.address || '';
                document.getElementById('jobCustPhone').value = cust.telephone || '';
            }
        }
        this.renderJobs();
    },

    setupAutocomplete: function() {
        const input = document.getElementById('jobCustCode');
        const suggest = document.getElementById('jobCustSuggest');
        if (!input || !suggest) return;

        input.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) {
                suggest.style.display = 'none';
                return;
            }
            const matches = this.customers.filter(c => 
                (c.code && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.code.toLowerCase(), val) : c.code.toLowerCase().includes(val))) || 
                (c.name && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.name.toLowerCase(), val) : c.name.toLowerCase().includes(val))) ||
                (c.contact_person && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.contact_person.toLowerCase(), val) : c.contact_person.toLowerCase().includes(val))) ||
                (c.address && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.address.toLowerCase(), val) : c.address.toLowerCase().includes(val))) ||
                (c.telephone && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.telephone.toLowerCase(), val) : c.telephone.toLowerCase().includes(val)))
            ).slice(0, 15);

            if (matches.length > 0) {
                suggest.innerHTML = matches.map(c => `
                    <div onclick="window.JobsModule.selectCustomer(${c.id})">
                        <strong>${c.code}</strong> - ${c.name}
                    </div>
                `).join('');
                suggest.style.display = 'block';
            } else {
                suggest.style.display = 'none';
            }
        };

        // Close suggest on click outside
        document.addEventListener('click', (e) => {
            if (e.target !== input) suggest.style.display = 'none';
        });
    },

    selectCustomer: function(id) {
        const c = this.customers.find(x => x.id == id);
        if (c) {
            this.selectedCustId = c.id;
            document.getElementById('jobCustCode').value = c.code;
            document.getElementById('jobCustName').value = c.name;
            document.getElementById('jobCustContact').value = c.contact_person || '';
            document.getElementById('jobCustAddress').value = c.address || '';
            document.getElementById('jobCustPhone').value = c.telephone || '';
        }
        document.getElementById('jobCustSuggest').style.display = 'none';
    },

    saveJob: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        if (!this.selectedCustId) {
            alert("Please select a valid customer.");
            return;
        }

        const payload = {
            id: this.selectedJobId,
            job_no: document.getElementById('jobNo').value,
            job_date: document.getElementById('jobDate').value,
            description: document.getElementById('jobDescription').value,
            order_no_date: document.getElementById('jobOrderRef').value,
            exp_delivery_date: document.getElementById('jobExpDate').value,
            job_incharge_id: document.getElementById('jobIncharge').value,
            estimated_cost: document.getElementById('jobEstCost').value,
            value_of_job: document.getElementById('jobValue').value,
            is_completed: document.getElementById('jobIsCompleted').checked ? 1 : 0,
            completion_date: document.getElementById('jobCompDate').value,
            delivery_ref_dt: document.getElementById('jobDelRef').value,
            coa_list_id: this.selectedCustId,
            remarks: document.getElementById('jobRemarks').value
        };

        try {
            const res = await fetch(`api/jobs.php?action=save_job&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                await this.loadJobs();
                this.resetForm();
            }
        } catch (e) { console.error("Save Job Error:", e); }
    },

    deleteJob: async function() {
        if (!this.selectedJobId) return;
        if (!confirm("Are you sure you want to delete this job card?")) return;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/jobs.php?action=delete_job&id=${this.selectedJobId}&company_id=${companyId}`, { method: 'POST' });
            const result = await res.json();
            if (result.status === 'success') {
                await this.loadJobs();
                this.resetForm();
            }
        } catch (e) { console.error("Delete Job Error:", e); }
    },

    resetForm: async function(isNew = false) {
        this.selectedJobId = isNew ? null : this.selectedJobId;
        this.selectedCustId = null;
        
        const inputs = ['jobNo', 'jobDate', 'jobDescription', 'jobOrderRef', 'jobExpDate', 
                       'jobIncharge', 'jobEstCost', 'jobValue', 'jobCompDate', 'jobDelRef', 
                       'jobRemarks', 'jobCustCode', 'jobCustName', 'jobCustContact', 
                       'jobCustAddress', 'jobCustPhone'];
        
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = (id.includes('Cost') || id.includes('Value')) ? '0' : '';
        });
        
        document.getElementById('jobIsCompleted').checked = false;

        if (isNew) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/jobs.php?action=get_next_job_no&company_id=${companyId}`);
            const data = await res.json();
            document.getElementById('jobNo').value = data.next_no;
            document.getElementById('jobDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('jobNo').focus();
            this.renderJobs();
        } else {
            if (this.selectedJobId) {
                this.selectJob(this.selectedJobId);
            } else if (this.jobs.length > 0) {
                this.selectJob(this.jobs[0].id);
            } else {
                this.renderJobs();
            }
        }
    },

    printJob: function() {
        if (!this.selectedJobId) {
            alert("Please select a job card to print.");
            return;
        }
        
        const j = this.jobs.find(x => x.id == this.selectedJobId);
        if (!j) return;
        
        const cust = this.customers.find(c => c.id == j.coa_list_id);
        const contact = cust ? (cust.contact_person || '') : '';
        const address = cust ? (cust.address || '') : '';
        const phone = cust ? (cust.telephone || '') : '';
        
        const inchargeSelect = document.getElementById('jobIncharge');
        let inchargeName = '';
        if (inchargeSelect) {
            const opt = Array.from(inchargeSelect.options).find(o => o.value == j.job_incharge_id);
            if (opt && opt.value !== "") inchargeName = opt.text;
        }
        
        const company = window.companyData || JSON.parse(localStorage.getItem('softifyx_company') || '{}');
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem('softifyx_logo') || 'assets/logos/logo.png');
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Job Card - ${j.job_no}</title>
                <style>
                    @page { margin: 0; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; margin: 0; font-size: 13px; }
                    .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 20px; }
                    .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                    .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                    .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                    .report-title-box { text-align: left; margin-bottom: 20px; }
                    .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; display: inline-block; border: 1px solid #000; padding: 5px 20px; background: #f8fafc; }
                    
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                    .info-group { margin-bottom: 8px; }
                    .info-group span:first-child { display: inline-block; width: 140px; font-style: italic; vertical-align: top; color: #555; }
                    .info-group span:last-child { font-weight: bold; display: inline-block; width: calc(100% - 145px); color: #000; }
                    .box { border: 1px solid #cbd5e0; padding: 10px; min-height: 100px; background: #fff; border-radius: 4px; }
                    .box-title { font-style: italic; margin-bottom: 5px; color: #555; }
                    .box-content { font-weight: bold; color: #000; }
                    .footer { display: flex; justify-content: space-between; margin-top: 50px; font-style: italic; font-size: 12px; border-top: 1px solid #eee; padding-top: 15px; color: #95a5a6; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-info">
                        <h1>${company.name || session.company || 'Business Name'}</h1>
                        <p>${company.address || 'Address Details'}</p>
                        <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                    </div>
                    <div class="logo">
                        ${logo ? '<img src="' + logo + '">' : ''}
                    </div>
                </div>
                <div class="report-title-box">
                    <h2>JOB CARD</h2>
                </div>
                
                <div class="grid">
                    <div>
                        <div class="info-group"><span>Job No.</span> <span>${j.job_no}</span></div>
                        <div class="info-group"><span>Date</span> <span>${j.job_date || ''}</span></div>
                        <br>
                        <div class="info-group"><span>Order No & Date</span> <span>${j.order_no_date || ''}</span></div>
                        <div class="info-group"><span>Exp. Delivery Date</span> <span>${j.exp_delivery_date || ''}</span></div>
                    </div>
                    <div class="box">
                        <div class="box-title">Job Description</div>
                        <div class="box-content">${j.description || ''}</div>
                    </div>
                </div>
                
                <div class="grid">
                    <div>
                        <div class="info-group"><span>Job Incharge</span> <span>${inchargeName}</span></div>
                        <br>
                        <div class="info-group"><span>Estimated Cost</span> <span>${parseFloat(j.estimated_cost || 0).toLocaleString()}</span></div>
                        <div class="info-group"><span>Value of Job</span> <span>${parseFloat(j.value_of_job || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="box">
                        <div class="info-group"><span>Party Name</span> <span>${j.customer_name || ''}</span></div>
                        <div class="info-group"><span>Contact Person</span> <span>${contact}</span></div>
                        <div class="info-group"><span>Address</span> <span>${address}</span></div>
                        <br>
                        <div class="info-group"><span>Telephone</span> <span>${phone}</span></div>
                    </div>
                </div>
                
                <div class="grid" style="margin-bottom: 0;">
                    <div>
                        <div class="info-group"><span>Job Status</span> <span>${j.is_completed == 1 ? 'Completed' : 'Active'}</span></div>
                        <div class="info-group"><span>Delivery Ref. No. & Date</span> <span>${j.delivery_ref_dt || ''}</span></div>
                    </div>
                    <div>
                        <div class="info-group"><span>Completion Date</span> <span>${j.completion_date || ''}</span></div>
                    </div>
                </div>
                
                <div class="box" style="margin-top: 10px; min-height: 60px;">
                    <div class="box-title">Remarks</div>
                    <div class="box-content">${j.remarks || ''}</div>
                </div>
                
                <div class="footer">
                    <div>Date ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')}</div>
                    <div>Prepared By: Administrator</div>
                </div>
                
                <script>
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 500);
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
};

document.addEventListener('keydown', (e) => {
    const container = document.getElementById('jobsContainer');
    if (!container || container.offsetParent === null) return;
    
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const jobs = window.JobsModule.jobs;
        if (!jobs || jobs.length === 0) return;
        
        let currentIndex = jobs.findIndex(j => j.id == window.JobsModule.selectedJobId);
        
        if (e.key === 'ArrowUp') {
            if (currentIndex > 0) window.JobsModule.selectJob(jobs[currentIndex - 1].id);
        } else if (e.key === 'ArrowDown') {
            if (currentIndex < jobs.length - 1) window.JobsModule.selectJob(jobs[currentIndex + 1].id);
            else if (currentIndex === -1) window.JobsModule.selectJob(jobs[0].id);
        }
        
        setTimeout(() => {
            const activeRow = container.querySelector('#jobListBody tr.active');
            if (activeRow) activeRow.scrollIntoView({block: 'nearest'});
        }, 50);
    }
});

