(function() {
    window.CFUModule = {
        data: {
            employees: [],
            jobs: [],
            customers: [],
            currentId: null,
            isNew: true
        },

        getCompanyId: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            return session.company_id || 1;
        },

        init: async function() {
            console.log("Initializing Customer Follow-Up Module...");
            await this.resetForm(true);
            await this.loadDependencies();
            this.setupEventListeners();
        },

        loadDependencies: async function() {
            const companyId = this.getCompanyId();
            try {
                // Fetch Employees
                const empRes = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
                if (!empRes.ok) throw new Error("Failed to load employees");
                this.data.employees = await empRes.json();
                this.populateSelect('cfu_acc_manager', this.data.employees, 'id', 'name');
                console.log("Employees loaded:", this.data.employees.length);

                // Fetch Jobs
                const jobRes = await fetch(`api/jobs.php?action=get_jobs&company_id=${companyId}`);
                if (!jobRes.ok) throw new Error("Failed to load jobs");
                this.data.jobs = await jobRes.json();
                this.populateSelect('cfu_job_no', this.data.jobs, 'id', 'job_no');
                console.log("Jobs loaded:", this.data.jobs.length);

                // Fetch Customers
                const custRes = await fetch(`api/jobs.php?action=get_all_customers&company_id=${companyId}`);
                if (!custRes.ok) throw new Error("Failed to load customers");
                this.data.customers = await custRes.json();
                console.log("Customers loaded:", this.data.customers.length);
                if (this.data.customers.length === 0) {
                    console.warn("No customers found in database for this company.");
                }
            } catch (err) {
                console.error("Error loading dependencies:", err);
                // alert("Data Loading Error: " + err.message);
            }
        },

        populateSelect: function(id, items, valKey, textKey) {
            const select = document.getElementById(id);
            if (!select) return;
            const originalHtml = select.innerHTML;
            select.innerHTML = '<option value="">Select Option</option>';
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item[valKey];
                opt.textContent = item[textKey];
                select.appendChild(opt);
            });
        },

        setupEventListeners: function() {
            const codeInput = document.getElementById('cfu_customer_code');
            const suggestBox = document.getElementById('cfu_customer_suggest');
            let activeIndex = -1;

            const setActive = (items, idx) => {
                items.forEach(d => d.classList.remove('active'));
                if (idx >= 0 && idx < items.length) {
                    items[idx].classList.add('active');
                    items[idx].scrollIntoView({ block: 'nearest' });
                }
            };

            codeInput.addEventListener('input', (e) => {
                activeIndex = -1;
                const val = e.target.value.toLowerCase();
                suggestBox.innerHTML = '';
                if (!val) {
                    suggestBox.style.display = 'none';
                    return;
                }

                const filtered = this.data.customers.filter(c => 
                    (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.code.toLowerCase(), val) : c.code.toLowerCase().includes(val)) || 
                    (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.name.toLowerCase(), val) : c.name.toLowerCase().includes(val))
                );

                if (filtered.length > 0) {
                    filtered.forEach(c => {
                        const div = document.createElement('div');
                        div.textContent = `${c.code} - ${c.name}`;
                        div.onclick = () => this.selectCustomer(c);
                        suggestBox.appendChild(div);
                    });
                    suggestBox.style.display = 'block';
                } else {
                    suggestBox.style.display = 'none';
                }
            });

            codeInput.addEventListener('keydown', (e) => {
                const items = suggestBox.querySelectorAll('div');
                if (suggestBox.style.display === 'none' || items.length === 0) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeIndex = Math.min(activeIndex + 1, items.length - 1);
                    setActive(items, activeIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeIndex = Math.max(activeIndex - 1, 0);
                    setActive(items, activeIndex);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIndex >= 0 && activeIndex < items.length) {
                        items[activeIndex].click();
                    } else if (items.length > 0) {
                        items[0].click();
                    }
                } else if (e.key === 'Escape') {
                    suggestBox.style.display = 'none';
                    activeIndex = -1;
                }
            });

            document.addEventListener('click', (e) => {
                if (!codeInput.contains(e.target) && !suggestBox.contains(e.target)) {
                    suggestBox.style.display = 'none';
                    activeIndex = -1;
                }
            });

            // Ctrl+S to save
            const container = document.getElementById('cfuContainer');
            container.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    this.saveCFU();
                }
            });

            // Handle image click to preview, double click to delete
            const detailsBox = document.getElementById('cfu_details');
            detailsBox.addEventListener('click', (e) => {
                if (e.target.tagName === 'IMG') {
                    this.previewImage(e.target.src, e.target);
                }
            });
            detailsBox.addEventListener('dblclick', (e) => {
                if (e.target.tagName === 'IMG') {
                    e.stopPropagation(); // Prevent preview on dblclick
                    if (confirm("Delete this image?")) {
                        e.target.remove();
                    }
                }
            });
        },

        previewImage: function(src, imgElement) {
            let overlay = document.getElementById('cfu_image_preview_overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'cfu_image_preview_overlay';
                overlay.style = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 100000; display: none; align-items: center; justify-content: center; flex-direction: column;';
                overlay.innerHTML = `
                    <div style="position: absolute; top: 20px; display: flex; gap: 15px;">
                        <button id="cfu_del_btn" style="background: #e53e3e; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;"><i class="fas fa-trash"></i> DELETE DOCUMENT</button>
                        <button id="cfu_close_btn" style="background: #4a5568; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">CLOSE VIEW</button>
                    </div>
                    <img id="cfu_preview_img" style="max-width: 90%; max-height: 85%; box-shadow: 0 0 30px rgba(0,0,0,0.8); border: 4px solid white; border-radius: 4px; margin-top: 50px;">
                `;
                document.body.appendChild(overlay);
                
                document.getElementById('cfu_close_btn').onclick = () => overlay.style.display = 'none';
                overlay.onclick = (e) => { if(e.target === overlay) overlay.style.display = 'none'; };
            }
            
            document.getElementById('cfu_preview_img').src = src;
            document.getElementById('cfu_del_btn').onclick = () => {
                if(confirm("Permanently delete this document/image?")) {
                    imgElement.remove();
                    overlay.style.display = 'none';
                }
            };
            overlay.style.display = 'flex';
        },

        selectCustomer: function(customer) {
            document.getElementById('cfu_customer_code').value = customer.code;
            document.getElementById('cfu_customer_name').value = customer.name;
            document.getElementById('cfu_customer_address').value = customer.address || '';
            document.getElementById('cfu_customer_tel').value = customer.telephone || '';
            document.getElementById('cfu_customer_code').dataset.id = customer.id;
            document.getElementById('cfu_customer_suggest').style.display = 'none';
        },

        resetForm: async function(isNew = true) {
            console.log("Resetting form, isNew:", isNew);
            this.data.isNew = isNew;
            this.data.currentId = null;

            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            };

            setVal('cfu_date', new Date().toISOString().split('T')[0]);
            setVal('cfu_event_type', '');
            setVal('cfu_acc_manager', '');
            setVal('cfu_job_no', '');
            setVal('cfu_customer_code', '');
            setVal('cfu_customer_name', '');
            setVal('cfu_customer_address', '');
            setVal('cfu_customer_tel', '');
            
            const details = document.getElementById('cfu_details');
            if (details) details.innerHTML = '';

            const codeInput = document.getElementById('cfu_customer_code');
            if (codeInput) codeInput.dataset.id = '';

            if (isNew) {
                const snEl = document.getElementById('cfu_sn');
                if (snEl) snEl.value = 'Loading...';
                try {
                    const companyId = this.getCompanyId();
                    const res = await fetch(`api/customer_follow_up.php?action=get_next_serial_no&company_id=${companyId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (snEl) snEl.value = data.next_no || 1;
                    } else {
                        if (snEl) snEl.value = 1;
                    }
                } catch (err) {
                    console.error("Error getting serial no:", err);
                    if (snEl) snEl.value = 1;
                }
            }
            console.log("Form reset complete.");
        },

        saveCFU: async function() {
            const payload = {
                id: this.data.currentId,
                serial_no: document.getElementById('cfu_sn').value,
                date: document.getElementById('cfu_date').value,
                event_type: document.getElementById('cfu_event_type').value,
                acc_manager_id: document.getElementById('cfu_acc_manager').value,
                job_id: document.getElementById('cfu_job_no').value,
                customer_coa_id: document.getElementById('cfu_customer_code').dataset.id,
                details: document.getElementById('cfu_details').innerHTML
            };

            if (!payload.customer_coa_id) {
                alert("Please select a customer.");
                return;
            }

            try {
                const companyId = this.getCompanyId();
                const res = await fetch(`api/customer_follow_up.php?action=save_follow_up&company_id=${companyId}`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || "Server error");
                }

                const result = await res.json();
                if (result.status === 'success') {
                    alert("Follow-up saved successfully!");
                    this.resetForm(true);
                } else {
                    alert("Save Failed: " + (result.message || "Unknown error"));
                }
            } catch (err) {
                console.error("Save error:", err);
                alert("Critical Error: Could not save data. Check if database table exists.");
            }
        },

        deleteCFU: async function() {
            if (!this.data.currentId) return;
            if (!confirm("Are you sure you want to delete this follow-up?")) return;

            try {
                const companyId = this.getCompanyId();
                const res = await fetch(`api/customer_follow_up.php?action=delete_follow_up&id=${this.data.currentId}&company_id=${companyId}`, {
                    method: 'POST'
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Deleted successfully.");
                    this.resetForm(true);
                }
            } catch (err) {
                console.error("Delete error:", err);
            }
        },

        navigate: async function(dir) {
            let sn = parseInt(document.getElementById('cfu_sn').value);
            if (dir === 'prev') sn = Math.max(1, sn - 1);
            else if (dir === 'next') sn = sn + 1;
            else if (dir === 'last') sn = -1; // Special case for last

            try {
                const companyId = this.getCompanyId();
                let url = `api/customer_follow_up.php?action=get_follow_up&serial_no=${sn}&company_id=${companyId}`;
                if (sn === -1) {
                    const nextRes = await fetch(`api/customer_follow_up.php?action=get_next_serial_no&company_id=${companyId}`);
                    const nextData = await nextRes.json();
                    sn = nextData.next_no - 1;
                    url = `api/customer_follow_up.php?action=get_follow_up&serial_no=${sn}&company_id=${companyId}`;
                }

                const res = await fetch(url);
                const item = await res.json();

                if (item) {
                    this.fillForm(item);
                } else {
                    if (dir === 'next') this.resetForm(true);
                    else alert("No more records.");
                }
            } catch (err) {
                console.error("Navigation error:", err);
            }
        },

        fillForm: function(item) {
            this.data.currentId = item.id;
            this.data.isNew = false;

            document.getElementById('cfu_sn').value = item.serial_no;
            document.getElementById('cfu_date').value = item.date;
            document.getElementById('cfu_event_type').value = item.event_type || '';
            document.getElementById('cfu_acc_manager').value = item.acc_manager_id || '';
            document.getElementById('cfu_job_no').value = item.job_id || '';
            
            document.getElementById('cfu_customer_code').value = item.customer_code;
            document.getElementById('cfu_customer_code').dataset.id = item.customer_coa_id;
            document.getElementById('cfu_customer_name').value = item.customer_name;
            document.getElementById('cfu_customer_address').value = item.customer_address || '';
            document.getElementById('cfu_customer_tel').value = item.customer_telephone || '';
            
            document.getElementById('cfu_details').innerHTML = item.details || '';
        },

        showFindModal: function() {
            // Remove existing modal if any
            let existing = document.getElementById('cfu_find_modal_overlay');
            if (existing) existing.remove();

            const today = new Date().toISOString().split('T')[0];
            const oneMonthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];

            // Build customer options
            const custOpts = this.data.customers.map(c =>
                `<option value="${c.id}">${c.code} - ${c.name}</option>`
            ).join('');

            // Build employee options
            const empOpts = this.data.employees.map(e =>
                `<option value="${e.id}">${e.name}</option>`
            ).join('');

            // Build job options
            const jobOpts = this.data.jobs.map(j =>
                `<option value="${j.id}">${j.job_no}</option>`
            ).join('');

            const overlay = document.createElement('div');
            overlay.id = 'cfu_find_modal_overlay';
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.35);z-index:9999;display:flex;align-items:center;justify-content:center;';

            overlay.innerHTML = `
            <div style="background:#f0f0f0;border:2px solid #a0a0a0;border-radius:4px;width:900px;height:600px;display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;box-shadow:0 8px 30px rgba(0,0,0,0.4);">
                <!-- Title bar -->
                <div style="background:#1F4E79;color:white;padding:5px 10px;display:flex;justify-content:space-between;align-items:center;border-radius:2px 2px 0 0;">
                    <b>Find Follow Ups</b>
                    <button id="cfu_find_close" style="background:none;border:none;color:white;font-size:16px;cursor:pointer;font-weight:bold;padding:0 4px;">&#x2715;</button>
                </div>
                <!-- Filter Area -->
                <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:#f0f0f0;border-bottom:1px solid #a0a0a0;">
                    <!-- Left title block -->
                    <div style="min-width:160px;padding:8px;border:2px inset #c0c0c0;background:#d4d4d4;text-align:center;font-weight:bold;font-size:13px;color:#000;">Customer Follow Ups</div>
                    <!-- Filters grid -->
                    <div style="flex:1;display:grid;grid-template-columns:100px 1fr;gap:4px 6px;align-items:center;">
                        <label style="text-align:right;font-size:11px;font-style:italic;font-weight:600;">Customer</label>
                        <select id="cfu_f_customer" style="height:22px;border:1px solid #000;font-size:11px;padding:0 4px;width:100%;">
                            <option value=""></option>
                            ${custOpts}
                        </select>

                        <label style="text-align:right;font-size:11px;font-style:italic;font-weight:600;">For Period From</label>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <input type="date" id="cfu_f_date_from" value="" style="height:22px;border:1px solid #000;font-size:11px;padding:0 4px;width:120px;">
                            <span style="font-size:11px;font-weight:600;">To</span>
                            <input type="date" id="cfu_f_date_to" value="" style="height:22px;border:1px solid #000;font-size:11px;padding:0 4px;width:120px;">
                        </div>

                        <label style="text-align:right;font-size:11px;font-style:italic;font-weight:600;">Event Type</label>
                        <select id="cfu_f_event_type" style="height:22px;border:1px solid #000;font-size:11px;padding:0 4px;width:100%;">
                            <option value=""></option>
                            <option value="Call">Call</option>
                            <option value="Meeting">Meeting</option>
                            <option value="Email">Email</option>
                            <option value="Visit">Visit</option>
                            <option value="Quotation">Quotation</option>
                            <option value="Follow-up">Follow-up</option>
                        </select>

                        <label style="text-align:right;font-size:11px;font-style:italic;font-weight:600;">Employee</label>
                        <select id="cfu_f_employee" style="height:22px;border:1px solid #000;font-size:11px;padding:0 4px;width:100%;">
                            <option value=""></option>
                            ${empOpts}
                        </select>

                        <label style="text-align:right;font-size:11px;font-style:italic;font-weight:600;">Job No</label>
                        <select id="cfu_f_job" style="height:22px;border:1px solid #000;font-size:11px;padding:0 4px;width:100%;">
                            <option value=""></option>
                            ${jobOpts}
                        </select>
                    </div>
                    <!-- Action Buttons -->
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:center;">
                        <button id="cfu_f_find_btn" style="width:70px;height:55px;background:#f0f0f0;border:2px outset #c0c0c0;cursor:pointer;font-size:11px;font-weight:600;border-radius:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#000;">
                            <i class="fas fa-search" style="font-size:18px;color:#1F4E79;"></i> Find
                        </button>
                        <button id="cfu_f_refresh_btn" style="width:70px;height:55px;background:#f0f0f0;border:2px outset #c0c0c0;cursor:pointer;font-size:11px;font-weight:600;border-radius:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#000;">
                            <i class="fas fa-sync-alt" style="font-size:18px;color:#1F4E79;"></i> Refresh
                        </button>
                    </div>
                </div>
                <!-- Grid -->
                <div style="flex:1;overflow:auto;background:white;border-bottom:1px solid #a0a0a0;min-height:200px;">
                    <table id="cfu_find_table" style="width:100%;border-collapse:collapse;table-layout:fixed;">
                        <thead>
                            <tr style="background:#c0c0c0;position:sticky;top:0;">
                                <th style="width:70px;border:1px solid #a0a0a0;padding:3px 6px;font-size:11px;font-style:italic;text-align:left;">Serial No.</th>
                                <th style="width:90px;border:1px solid #a0a0a0;padding:3px 6px;font-size:11px;font-style:italic;text-align:left;">Date</th>
                                <th style="width:180px;border:1px solid #a0a0a0;padding:3px 6px;font-size:11px;font-style:italic;text-align:left;">Customer</th>
                                <th style="width:110px;border:1px solid #a0a0a0;padding:3px 6px;font-size:11px;font-style:italic;text-align:left;">Event Type</th>
                                <th style="width:130px;border:1px solid #a0a0a0;padding:3px 6px;font-size:11px;font-style:italic;text-align:left;">Employee</th>
                                <th style="border:1px solid #a0a0a0;padding:3px 6px;font-size:11px;font-style:italic;text-align:left;">Description</th>
                            </tr>
                        </thead>
                        <tbody id="cfu_find_tbody" style="font-size:11px;">
                            <tr><td colspan="6" style="padding:20px;text-align:center;color:#666;">Click "Find" to search records...</td></tr>
                        </tbody>
                    </table>
                </div>
                <!-- Status bar -->
                <div id="cfu_find_status" style="padding:3px 8px;background:#e0e0e0;font-size:11px;border-top:1px solid #a0a0a0;color:#444;">Ready</div>
            </div>`;

            // Append to container so it stays within modal
            const container = document.getElementById('cfuContainer');
            container.appendChild(overlay);

            // Close
            document.getElementById('cfu_find_close').onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

            const doSearch = async () => {
                const params = new URLSearchParams({
                    action: 'search_follow_ups',
                    company_id: this.getCompanyId(),
                    date_from: document.getElementById('cfu_f_date_from').value || '',
                    date_to: document.getElementById('cfu_f_date_to').value || '',
                    customer_id: document.getElementById('cfu_f_customer').value || '',
                    event_type: document.getElementById('cfu_f_event_type').value || '',
                    employee_id: document.getElementById('cfu_f_employee').value || '',
                    job_id: document.getElementById('cfu_f_job').value || ''
                });

                document.getElementById('cfu_find_status').textContent = 'Searching...';
                try {
                    const res = await fetch(`api/customer_follow_up.php?${params}`);
                    const rawText = await res.text();
                    if (!rawText || rawText.trim() === '') {
                        document.getElementById('cfu_find_status').textContent = 'Error: Empty response from server. Check PHP logs.';
                        return;
                    }
                    let rows;
                    try { rows = JSON.parse(rawText); } catch(pe) {
                        document.getElementById('cfu_find_status').textContent = 'Error: ' + rawText.substring(0, 200);
                        return;
                    }
                    const tbody = document.getElementById('cfu_find_tbody');
                    tbody.innerHTML = '';
                    if (!rows || rows.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#666;">No records found.</td></tr>';
                        document.getElementById('cfu_find_status').textContent = '0 records found.';
                        return;
                    }
                    let allRows = [];
                    let selectedRowIndex = -1;

                    const selectRow = (idx) => {
                        allRows.forEach((t, i) => {
                            if (i === idx) {
                                t.style.background = '#000000'; // Black selection as requested
                                t.style.color = 'white';
                                t.scrollIntoView({ block: 'nearest' });
                            } else {
                                t.style.background = allRows.indexOf(t) % 2 === 0 ? '#ffffff' : '#f5f5f5';
                                t.style.color = '';
                            }
                        });
                        selectedRowIndex = idx;
                    };

                    rows.forEach((r, idx) => {
                        const tr = document.createElement('tr');
                        tr.style.cursor = 'pointer';
                        tr.style.background = idx % 2 === 0 ? '#ffffff' : '#f5f5f5';
                        const dateStr = r.date ? new Date(r.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' }) : '';
                        tr.innerHTML = `
                            <td style="border:1px solid #ddd;padding:2px 6px;">${r.serial_no}</td>
                            <td style="border:1px solid #ddd;padding:2px 6px;">${dateStr}</td>
                            <td style="border:1px solid #ddd;padding:2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.customer_name || ''}</td>
                            <td style="border:1px solid #ddd;padding:2px 6px;">${r.event_type || ''}</td>
                            <td style="border:1px solid #ddd;padding:2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.employee_name || ''}</td>
                            <td style="border:1px solid #ddd;padding:2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.description_text || ''}</td>`;
                        tr.onclick = () => selectRow(idx);
                        tr.ondblclick = () => {
                            overlay.remove();
                            this.navigateBySN(r.serial_no);
                        };
                        tbody.appendChild(tr);
                        allRows.push(tr);
                    });
                    document.getElementById('cfu_find_status').textContent = `${rows.length} record(s) found. Double-click or Enter to open.`;

                    // Keyboard navigation
                    overlay.setAttribute('tabindex', '0');
                    overlay.focus(); // Focus the modal to capture keys immediately
                    
                    if (allRows.length > 0) {
                        selectRow(0); // Auto-select first row
                    }

                    overlay.onkeydown = (e) => {
                        // Don't intercept if user is typing in a text input or select
                        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                            if (e.key === 'Enter') {
                                doSearch(); // Enter in filter searches
                            }
                            return;
                        }

                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            selectRow(Math.min(selectedRowIndex + 1, allRows.length - 1));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            selectRow(Math.max(selectedRowIndex - 1, 0));
                        } else if (e.key === 'Enter' && selectedRowIndex >= 0) {
                            e.preventDefault();
                            allRows[selectedRowIndex].ondblclick();
                        }
                    };

                } catch(err) {
                    document.getElementById('cfu_find_status').textContent = 'Error: ' + err.message;
                }
            };

            document.getElementById('cfu_f_find_btn').onclick = doSearch;
            document.getElementById('cfu_f_refresh_btn').onclick = () => {
                document.getElementById('cfu_f_customer').value = '';
                document.getElementById('cfu_f_date_from').value = '';
                document.getElementById('cfu_f_date_to').value = '';
                document.getElementById('cfu_f_event_type').value = '';
                document.getElementById('cfu_f_employee').value = '';
                document.getElementById('cfu_f_job').value = '';
                document.getElementById('cfu_find_tbody').innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#666;">Filters cleared. Click "Find" to search.</td></tr>';
                document.getElementById('cfu_find_status').textContent = 'Ready';
            };

            // Auto search on open
            doSearch();
        },

        navigateBySN: async function(sn) {
            try {
                const companyId = this.getCompanyId();
                const res = await fetch(`api/customer_follow_up.php?action=get_follow_up&serial_no=${sn}&company_id=${companyId}`);
                const item = await res.json();
                if (item) this.fillForm(item);
                else alert("Record not found.");
            } catch (err) {
                console.error("Find error:", err);
            }
        }
    };
})();
