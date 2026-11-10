(function() {
    const BulkMessagesModule = {
        data: {
            company_id: 1,
            companyName: 'My Company',
            recipients: [],
            templates: [],
            regions: [],
            selectedIds: new Set()
        },

        init: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = session.company_id || 1;
            this.data.companyName = session.company_name || 'My Company';

            this.data.selectedIds.clear();

            // Load all filters, templates, recipients
            await this.loadRegions();
            await this.loadTemplates();
            await this.loadRecipientsList();
            await this.loadLogs();

            // Bind char counter
            const msgArea = document.getElementById('bmMessageText');
            if (msgArea) {
                msgArea.addEventListener('input', () => this.updateCharCounter());
            }
        },

        loadRegions: async function() {
            try {
                const res = await fetch(`api/sms_logs.php?action=get_regions&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.regions = await res.json();
                    const select = document.getElementById('bmRegionSelect');
                    if (select) {
                        select.innerHTML = '<option value="ALL">-- All Regions --</option>';
                        this.data.regions.forEach(r => {
                            const opt = document.createElement('option');
                            opt.value = r.id;
                            opt.textContent = r.name;
                            select.appendChild(opt);
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading regions:", err);
            }
        },

        loadTemplates: async function() {
            try {
                const res = await fetch(`api/sms_templates.php?action=get_templates&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.templates = await res.json();
                    const select = document.getElementById('bmTemplateSelect');
                    if (select) {
                        select.innerHTML = '<option value="">-- Custom Message (No Template) --</option>';
                        this.data.templates.forEach(t => {
                            if (t.is_active == 1) {
                                const opt = document.createElement('option');
                                opt.value = t.id;
                                opt.textContent = t.template_name;
                                select.appendChild(opt);
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading templates:", err);
            }
        },

        loadRecipientsList: async function() {
            const groupType = document.getElementById('bmGroupType').value;
            try {
                const res = await fetch(`api/sms_logs.php?action=get_recipients&type=${groupType}&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.recipients = await res.json();
                    this.filterAndPopulateRecipients();
                }
            } catch (err) {
                console.error("Error loading recipients:", err);
            }
        },

        handleFiltersChange: function() {
            const groupType = document.getElementById('bmGroupType').value;
            const regContainer = document.getElementById('bmRegionFilterContainer');
            
            // Region filter is only for customers
            if (groupType === 'vendor') {
                regContainer.style.visibility = 'hidden';
            } else {
                regContainer.style.visibility = 'visible';
            }

            this.loadRecipientsList();
        },

        filterAndPopulateRecipients: function() {
            const groupType = document.getElementById('bmGroupType').value;
            const regionFilter = document.getElementById('bmRegionSelect').value;
            const onlyDebt = document.getElementById('bmOnlyDebt').checked;

            let filtered = [...this.data.recipients];

            // Filter by region (only if customer group)
            if (groupType === 'customer' && regionFilter !== 'ALL') {
                filtered = filtered.filter(r => r.region_id == regionFilter);
            }

            // Filter by debt > 0
            if (onlyDebt) {
                filtered = filtered.filter(r => parseFloat(r.balance || 0) > 0);
            }

            // Populate table
            const tbody = document.getElementById('bmRecipientsBody');
            if (tbody) {
                tbody.innerHTML = '';
                this.data.selectedIds.clear();

                if (filtered.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 10px; color: #94a3b8;">No matching parties found.</td></tr>';
                    this.updateCountBadge();
                    return;
                }

                filtered.forEach(r => {
                    // Auto-select by default
                    this.data.selectedIds.add(r.id);

                    const tr = document.createElement('tr');
                    const bal = parseFloat(r.balance || 0).toFixed(2);
                    const symbol = window.globalCurrencySymbol || 'Rs.';
                    tr.innerHTML = `
                        <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e0;">
                            <input type="checkbox" checked class="bm-recipient-check" data-id="${r.id}" onchange="window.BulkMessagesModule.handleCheckboxChange(this, ${r.id})">
                        </td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0;">${r.code}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; font-weight: 600; color: #1e3a8a;">${r.name || ''}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0;">${r.mobile || r.telephone || '-'}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; text-align: right; font-weight: bold; color: ${parseFloat(r.balance || 0) > 0 ? '#b91c1c' : '#475569'};">${symbol} ${bal}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            this.updateCountBadge();
        },

        handleCheckboxChange: function(chk, id) {
            if (chk.checked) {
                this.data.selectedIds.add(id);
            } else {
                this.data.selectedIds.delete(id);
            }
            this.updateCountBadge();
        },

        toggleSelectAll: function(selected) {
            const checks = document.querySelectorAll('.bm-recipient-check');
            checks.forEach(chk => {
                chk.checked = selected;
                const id = parseInt(chk.getAttribute('data-id'));
                if (selected) {
                    this.data.selectedIds.add(id);
                } else {
                    this.data.selectedIds.delete(id);
                }
            });
            this.updateCountBadge();
        },

        updateCountBadge: function() {
            const span = document.getElementById('bmMatchedCount');
            if (span) {
                span.textContent = this.data.selectedIds.size;
            }
        },

        applyTemplate: function() {
            const select = document.getElementById('bmTemplateSelect');
            const txtArea = document.getElementById('bmMessageText');
            if (!select || !txtArea) return;

            const tmplId = select.value;
            if (!tmplId) {
                txtArea.value = '';
                this.updateCharCounter();
                return;
            }

            const tmpl = this.data.templates.find(t => t.id == tmplId);
            if (tmpl) {
                txtArea.value = tmpl.message;
            }
            this.updateCharCounter();
        },

        togglePDFAttachment: function() {
            const chk = document.getElementById('bmAttachPDF');
            const txtArea = document.getElementById('bmMessageText');
            if (!chk || !txtArea) return;

            if (chk.checked) {
                const link = `\nLedger Link: {ledger_link}`;
                if (!txtArea.value.includes("Ledger Link:")) {
                    txtArea.value = txtArea.value.trim() + link;
                }
            } else {
                txtArea.value = txtArea.value.replace(/\n?Ledger Link: [^\n]+/g, "").trim();
            }
            this.updateCharCounter();
        },

        sendBulkSMS: async function() {
            const rawMessage = document.getElementById('bmMessageText').value.trim();
            if (this.data.selectedIds.size === 0) {
                alert("Please select at least one recipient.");
                return;
            }
            if (!rawMessage) {
                alert("Message template text is required.");
                return;
            }

            // Get selected recipient details
            const targets = this.data.recipients.filter(r => this.data.selectedIds.has(r.id));
            if (targets.length === 0) return;

            if (!confirm(`Are you sure you want to send bulk SMS to ${targets.length} recipients?`)) {
                return;
            }

            // Show progress modal
            const progressModal = document.getElementById('simulatedBulkModal');
            const progressTitle = document.getElementById('bmProgressTitle');
            const progressBar = document.getElementById('bmProgressBar');
            const progressText = document.getElementById('bmProgressText');
            const progressCloseBtn = document.getElementById('bmProgressCloseBtn');

            progressModal.style.display = 'flex';
            progressTitle.textContent = "Sending Bulk Messages...";
            progressBar.style.width = "0%";
            progressText.textContent = `Processed: 0 of ${targets.length} messages`;
            progressCloseBtn.style.display = 'none';

            let count = 0;

            // Loop and compile for each
            for (let i = 0; i < targets.length; i++) {
                const rec = targets[i];
                
                // Compile template
                const op = parseFloat(rec.opening_balance || 0).toFixed(2);
                const db = parseFloat(rec.total_debit || 0).toFixed(2);
                const cr = parseFloat(rec.total_credit || 0).toFixed(2);
                const net = parseFloat(rec.balance || 0).toFixed(2);

                const symbol = window.globalCurrencySymbol || 'Rs.';
                const payloadType = document.getElementById('bmGroupType').value === 'customer' ? 'Customer' : 'Vendor';
                
                const compiledMsg = rawMessage
                    .replace(/{customer_name}/g, rec.name || '')
                    .replace(/{opening_balance}/g, symbol + ' ' + op)
                    .replace(/{receipts}/g, symbol + ' ' + cr)
                    .replace(/{payments}/g, symbol + ' ' + db)
                    .replace(/{net_balance}/g, symbol + ' ' + net)
                    .replace(/{company_name}/g, this.data.companyName)
                    .replace(/{ledger_link}/g, `http://naimat-erp.com/print_ledger.php?coa_id=${rec.id}&type=${payloadType.toLowerCase()}`);

                const payload = {
                    recipient_type: payloadType,
                    recipient_name: rec.name,
                    mobile_no: rec.mobile || rec.telephone || '',
                    message: compiledMsg
                };

                try {
                    // Send request (simulated queue delay of 100ms)
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const res = await fetch(`api/sms_logs.php?action=send_sms&company_id=${this.data.company_id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) {
                        count++;
                        const pct = Math.round((count / targets.length) * 100);
                        progressBar.style.width = `${pct}%`;
                        progressText.textContent = `Processed: ${count} of ${targets.length} messages`;
                    }
                } catch (err) {
                    console.error("Error sending bulk row:", err);
                }
            }

            // Finished
            progressTitle.textContent = "Bulk SMS Campaign Complete!";
            progressCloseBtn.style.display = 'block';

            // Refresh logs
            await this.loadLogs();
        },

        loadLogs: async function() {
            try {
                const res = await fetch(`api/sms_logs.php?action=get_logs&company_id=${this.data.company_id}`);
                if (res.ok) {
                    const logs = await res.json();
                    const tbody = document.getElementById('bmLogsBody');
                    if (tbody) {
                        tbody.innerHTML = '';
                        logs.forEach(l => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">${l.sent_at}</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-weight: 600; color: #1e3a8a;">${this.escapeHTML(l.recipient_name)} (${l.recipient_type})</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">${l.mobile_no}</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHTML(l.message)}">${this.escapeHTML(l.message)}</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center;">
                                    <span style="padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 700; background: #dcfce7; color: #15803d;">
                                        ${l.status}
                                    </span>
                                </td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading logs:", err);
            }
        },

        updateCharCounter: function() {
            const msg = document.getElementById('bmMessageText').value;
            const len = msg.length;
            let parts = 0;
            if (len > 0) {
                parts = len <= 160 ? 1 : Math.ceil(len / 153);
            }
            const label = document.getElementById('bmCharCounter');
            if (label) {
                label.textContent = `${len} characters / ${parts} SMS Part(s)`;
            }
        },

        escapeHTML: function(str) {
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };

    window.BulkMessagesModule = BulkMessagesModule;
})();
