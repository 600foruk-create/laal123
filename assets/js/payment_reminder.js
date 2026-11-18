window.PaymentReminderModule = {
    isInitialized: false,
    companyProfile: null,
    rawLookups: { customers: [], categories: [], salespersons: [], locations: [] },
    reportData: { records: [], summary: {} },
    selectedCustomers: {},

    init: async function() {
        const self = this;
        self.isInitialized = true;
        self.selectedCustomers = {};

        self.enforceWindowSize();

        // 1. Fetch lookups
        try {
            await self.fetchLookups();
        } catch (e) {
            console.error('[PRR] Lookups error:', e);
        }

        // 2. Perform initial search
        try {
            await self.search();
        } catch (e) {
            console.error('[PRR] Initial search error:', e);
        }

        // 3. Load live company profile in background for print
        self.loadCompanyProfile().catch(e => console.warn(e));
    },

    enforceWindowSize: function() {
        const root = document.getElementById('prr_root');
        const win = root?.closest('.modal-container');
        if (win) {
            win.classList.remove('modal-full');
            win.classList.add('modal-sale-invoice');
            win.classList.add('modal-fbr-invoice');
            win.classList.add('modal-payment-reminder');
            win.style.setProperty('max-width', '1260px', 'important');
            win.style.setProperty('width', '98%', 'important');
            win.style.setProperty('height', '94vh', 'important');
            win.style.setProperty('max-height', '94vh', 'important');
            setTimeout(() => {
                const rect = win.getBoundingClientRect();
                const vW = window.innerWidth;
                const vH = window.innerHeight;
                let top = Math.max(10, (vH - rect.height) / 2);
                let left = Math.max(10, (vW - rect.width) / 2);
                win.style.top = top + 'px';
                win.style.left = left + 'px';
            }, 50);
        }
    },

    loadCompanyProfile: async function() {
        const self = this;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            self.companyProfile = {
                name: session.company_name || 'SEASTONE PLASTIC INDUSTRIES',
                address: '',
                phone: '',
                email: '',
                website: '',
                ntn: session.company_ntn || '',
                strn: session.company_strn || session.company_gst || '',
                logo: null
            };

            if (window.companyData) {
                if (window.companyData.name) self.companyProfile.name = window.companyData.name;
                if (window.companyData.address) self.companyProfile.address = window.companyData.address;
                if (window.companyData.phone) self.companyProfile.phone = window.companyData.phone;
                if (window.companyData.email) self.companyProfile.email = window.companyData.email;
                if (window.companyData.website) self.companyProfile.website = window.companyData.website;
                if (window.companyData.ntn) self.companyProfile.ntn = window.companyData.ntn;
                if (window.companyData.gst) self.companyProfile.strn = window.companyData.gst;
                if (window.companyData.logo_data && typeof window.companyData.logo_data === 'string' && window.companyData.logo_data.startsWith('data:image')) {
                    self.companyProfile.logo = window.companyData.logo_data;
                }
            }
            if (!self.companyProfile.logo && window.logoData && typeof window.logoData === 'string' && window.logoData.startsWith('data:image')) {
                self.companyProfile.logo = window.logoData;
            }

            try {
                const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}&_t=${Date.now()}`);
                if (res.ok) {
                    const dbCo = await res.json();
                    if (dbCo && !dbCo.error) {
                        if (dbCo.name) self.companyProfile.name = dbCo.name;
                        if (dbCo.address) self.companyProfile.address = dbCo.address;
                        if (dbCo.phone) self.companyProfile.phone = dbCo.phone;
                        if (dbCo.email) self.companyProfile.email = dbCo.email;
                        if (dbCo.website) self.companyProfile.website = dbCo.website;
                        if (dbCo.ntn || dbCo.ntn_no) self.companyProfile.ntn = dbCo.ntn || dbCo.ntn_no;
                        if (dbCo.strn || dbCo.gst_no || dbCo.st_reg_no || dbCo.sales_tax_reg_no) {
                            self.companyProfile.strn = dbCo.strn || dbCo.gst_no || dbCo.st_reg_no || dbCo.sales_tax_reg_no;
                        }
                        if (dbCo.logo_data && typeof dbCo.logo_data === 'string' && dbCo.logo_data.startsWith('data:image')) {
                            self.companyProfile.logo = dbCo.logo_data;
                            try { localStorage.setItem(`softifyx_${self.companyProfile.name}_logo`, dbCo.logo_data); } catch(e) {}
                        }
                    }
                }
            } catch (e) {}

            if (!self.companyProfile.logo) {
                const coName = self.companyProfile.name;
                const candidates = [
                    localStorage.getItem(`softifyx_${coName}_logo`),
                    localStorage.getItem('softifyx_logo')
                ];
                try {
                    if (typeof getCoKey === 'function') candidates.unshift(localStorage.getItem(getCoKey('softifyx_logo')));
                } catch(e) {}
                for (const c of candidates) {
                    if (c && typeof c === 'string' && c.startsWith('data:image')) {
                        self.companyProfile.logo = c;
                        break;
                    }
                }
            }
        } catch(err) {
            console.warn('[PRR] loadCompanyProfile error:', err);
        }
    },

    fetchLookups: async function() {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const res = await fetch(`api/payment_reminder.php?action=get_lookups&company_id=${companyId}`);
        const data = await res.json();
        if (data.status === 'success') {
            self.rawLookups = data;

            // Populate Customers
            const custSelect = document.getElementById('prr_filter_customer');
            if (custSelect) {
                custSelect.innerHTML = '<option value="">All Customers</option>';
                data.customers.forEach(c => {
                    custSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.code})</option>`;
                });
            }

            // Populate Categories
            const catSelect = document.getElementById('prr_filter_category');
            if (catSelect) {
                catSelect.innerHTML = '<option value="">All Categories</option>';
                data.categories.forEach(ct => {
                    catSelect.innerHTML += `<option value="${ct.id}">${ct.name}</option>`;
                });
            }

            // Populate Salespersons
            const spSelect = document.getElementById('prr_filter_salesperson');
            if (spSelect) {
                spSelect.innerHTML = '<option value="">All Salespersons</option>';
                data.salespersons.forEach(sp => {
                    spSelect.innerHTML += `<option value="${sp.id}">${sp.name}</option>`;
                });
            }

            // Populate Locations
            const locSelect = document.getElementById('prr_filter_location');
            if (locSelect) {
                locSelect.innerHTML = '<option value="">All Locations</option>';
                data.locations.forEach(l => {
                    locSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
                });
            }
        }
    },

    search: async function() {
        const self = this;
        self.enforceWindowSize();

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const loading = document.getElementById('prr_loading');
        if (loading) loading.style.display = 'flex';

        const custId = document.getElementById('prr_filter_customer')?.value || '';
        const catId  = document.getElementById('prr_filter_category')?.value || '';
        const spId   = document.getElementById('prr_filter_salesperson')?.value || '';
        const locId  = document.getElementById('prr_filter_location')?.value || '';
        const pStatus = document.getElementById('prr_filter_payment_status')?.value || 'all';
        const rStatus = document.getElementById('prr_filter_reminder_status')?.value || 'all';
        const overdueDays = document.getElementById('prr_filter_overdue')?.value || 'all';

        const params = new URLSearchParams({
            action: 'get_reminders',
            company_id: companyId,
            customer_id: custId,
            category_id: catId,
            salesperson_id: spId,
            location_id: locId,
            payment_status: pStatus,
            reminder_status: rStatus,
            overdue_days: overdueDays,
            _t: Date.now()
        });

        try {
            const res = await fetch(`api/payment_reminder.php?${params.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.status === 'success') {
                self.reportData = data;
                self.updateSummaryCards(data.summary);
                self.renderTable();
            } else {
                alert(data.error || 'Failed to load payment reminders');
            }
        } catch (e) {
            console.error('[PRR] Fetch error:', e);
        } finally {
            if (loading) loading.style.display = 'none';
        }
    },

    formatCurrency: function(v) {
        const n = parseFloat(v || 0);
        return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },

    updateSummaryCards: function(sum) {
        if (!sum) return;
        const totalEl = document.getElementById('prr_card_total_rec');
        const upcomingEl = document.getElementById('prr_card_upcoming');
        const upcomingSub = document.getElementById('prr_card_upcoming_sub');
        const dueEl = document.getElementById('prr_card_duetoday');
        const dueSub = document.getElementById('prr_card_duetoday_sub');
        const overdueEl = document.getElementById('prr_card_overdue');
        const overdueSub = document.getElementById('prr_card_overdue_sub');
        const partialEl = document.getElementById('prr_card_partial');
        const partialSub = document.getElementById('prr_card_partial_sub');

        if (totalEl) totalEl.innerText = `Rs. ${this.formatCurrency(sum.total_receivables)}`;
        if (upcomingEl) upcomingEl.innerText = `Rs. ${this.formatCurrency(sum.upcoming_amount)}`;
        if (upcomingSub) upcomingSub.innerText = `(${sum.upcoming_count} Customers)`;

        if (dueEl) dueEl.innerText = `Rs. ${this.formatCurrency(sum.due_today_amount)}`;
        if (dueSub) dueSub.innerText = `(${sum.due_today_count} Customers)`;

        if (overdueEl) overdueEl.innerText = `Rs. ${this.formatCurrency(sum.overdue_amount)}`;
        if (overdueSub) overdueSub.innerText = `(${sum.overdue_count} Customers)`;

        if (partialEl) partialEl.innerText = `Rs. ${this.formatCurrency(sum.partially_paid_amount)}`;
        if (partialSub) partialSub.innerText = `(${sum.partially_paid_count} Customers)`;
    },

    renderTable: function() {
        const self = this;
        const tbody = document.getElementById('prr_main_tbody');
        const tfoot = document.getElementById('prr_main_tfoot');
        if (!tbody || !tfoot) return;

        const records = self.reportData.records || [];
        self.selectedCustomers = {};
        self.updateSelectedCount();

        const checkAll = document.getElementById('prr_check_all');
        if (checkAll) checkAll.checked = false;

        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 35px; color: #64748b; font-size: 13px;">No customers found matching the selected filter criteria.</td></tr>`;
            tfoot.innerHTML = '';
            return;
        }

        let html = '';
        let totBalanceSum = 0;
        let totPaidSum = 0;
        let totOutstandingSum = 0;

        records.forEach((row, idx) => {
            totBalanceSum += row.total_balance;
            totPaidSum += row.paid_amount;
            totOutstandingSum += row.outstanding;

            let badgeClass = 'prr-badge-upcoming';
            if (row.status_code === 'overdue') badgeClass = 'prr-badge-overdue';
            else if (row.status_code === 'due_today') badgeClass = 'prr-badge-duetoday';
            else if (row.status_code === 'stopped') badgeClass = 'prr-badge-stopped';

            const overdueDisplay = (row.overdue_days === '-' || row.overdue_days === '0') ? row.overdue_days : `<strong style="color: #dc2626;">${row.overdue_days}</strong>`;

            html += `
                <tr id="prr_row_${row.customer_id}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="prr-row-chk" data-id="${row.customer_id}" onchange="window.PaymentReminderModule.toggleRowSelect(${row.customer_id}, this.checked)">
                    </td>
                    <td style="text-align: center; color: #64748b; font-weight: 700;">${idx + 1}</td>
                    <td style="font-weight: 700; color: #0f172a;">${row.customer_name}</td>
                    <td style="text-align: center; font-family: monospace; font-size: 11.5px; color: #334155;">${row.contact_no || '-'}</td>
                    <td style="text-align: center; font-weight: 800; color: #1F4E79;">${row.credit_days}</td>
                    <td style="text-align: center; font-size: 11px;">${row.due_date_formatted}</td>
                    <td style="text-align: right; font-weight: 600;">${self.formatCurrency(row.total_balance)}</td>
                    <td style="text-align: right; font-weight: 600; color: ${row.paid_amount > 0 ? '#16a34a' : '#64748b'};">${self.formatCurrency(row.paid_amount)}</td>
                    <td style="text-align: right; font-weight: 800; color: #0f2d4a; background: #f8fafc;">${self.formatCurrency(row.outstanding)}</td>
                    <td style="text-align: center; font-size: 11px;">${overdueDisplay}</td>
                    <td style="text-align: center;">
                        <span class="prr-badge ${badgeClass}">${row.status_text}</span>
                    </td>
                    <td style="text-align: center;">
                        <span class="prr-row-action" title="Send WhatsApp Reminder" onclick="window.PaymentReminderModule.sendWhatsAppSingle(${row.customer_id})">
                            <i class="fas fa-paper-plane"></i>
                        </span>
                        <span class="prr-row-action" title="View Customer Ledger" onclick="window.PaymentReminderModule.viewLedger(${row.customer_id})">
                            <i class="fas fa-eye"></i>
                        </span>
                        <span class="prr-row-action" title="Record Follow-up" onclick="window.PaymentReminderModule.openFollowUpModalSingle(${row.customer_id})">
                            <i class="fas fa-clipboard-list"></i>
                        </span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Dark Blue Total Row
        tfoot.innerHTML = `
            <tr style="background: #0b2942; color: #ffffff; font-weight: bold; border-top: 2px solid #0f2d4a;">
                <td colspan="6" style="text-align: center; font-size: 11.5px; padding-left: 12px; letter-spacing: 0.3px;">
                    Total (${records.length} Customers)
                </td>
                <td style="text-align: right; color: #ffffff; font-size: 11.5px;">${self.formatCurrency(totBalanceSum)}</td>
                <td style="text-align: right; color: #86efac; font-size: 11.5px;">${self.formatCurrency(totPaidSum)}</td>
                <td style="text-align: right; color: #ffffff; font-weight: 900; background: #071e30; font-size: 12px;">${self.formatCurrency(totOutstandingSum)}</td>
                <td colspan="3"></td>
            </tr>
        `;
    },

    toggleSelectAll: function(checked) {
        const self = this;
        const chks = document.querySelectorAll('.prr-row-chk');
        self.selectedCustomers = {};
        chks.forEach(chk => {
            chk.checked = checked;
            const id = chk.getAttribute('data-id');
            const row = document.getElementById(`prr_row_${id}`);
            if (checked) {
                self.selectedCustomers[id] = true;
                if (row) row.classList.add('selected');
            } else {
                if (row) row.classList.remove('selected');
            }
        });
        self.updateSelectedCount();
    },

    toggleRowSelect: function(id, checked) {
        const row = document.getElementById(`prr_row_${id}`);
        if (checked) {
            this.selectedCustomers[id] = true;
            if (row) row.classList.add('selected');
        } else {
            delete this.selectedCustomers[id];
            if (row) row.classList.remove('selected');
        }
        this.updateSelectedCount();
    },

    updateSelectedCount: function() {
        const count = Object.keys(this.selectedCustomers).length;
        const el = document.getElementById('prr_selected_count');
        if (el) el.innerText = `(${count} selected)`;
    },

    getSelectedList: function() {
        const self = this;
        const ids = Object.keys(self.selectedCustomers);
        const records = self.reportData.records || [];
        if (ids.length === 0) {
            return records; // Default to all visible if none specifically checked
        }
        return records.filter(r => self.selectedCustomers[r.customer_id]);
    },

    // -------------------------------------------------------------------------
    // Actions: WhatsApp, SMS, Email, Print Letter, Follow-up
    // -------------------------------------------------------------------------
    buildReminderMessage: function(rec) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const coName = session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        return `Dear ${rec.customer_name},\n\nAccording to our accounts, your outstanding balance is Rs. ${this.formatCurrency(rec.outstanding)}.\nPlease arrange payment at your earliest convenience.\n\nThank you.\n${coName}`;
    },

    markRecordsAsSent: function(customerIds) {
        if (!Array.isArray(customerIds)) customerIds = [customerIds];
        (this.reportData.records || []).forEach(r => {
            if (customerIds.includes(r.customer_id)) {
                r.reminder_status = 'Reminder Sent';
            }
        });
        this.renderTable();
    },

    sendWhatsAppSingle: async function(id) {
        const rec = (this.reportData.records || []).find(r => r.customer_id == id);
        if (!rec) return;

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const msg = this.buildReminderMessage(rec);

        // Try direct API dispatch first
        try {
            const res = await fetch(`api/communication_api.php?action=send_message&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'whatsapp',
                    customer_id: rec.customer_id,
                    recipient_name: rec.customer_name,
                    recipient_contact: rec.contact_no,
                    message: msg
                })
            });

            const data = await res.json().catch(() => ({}));
            const errMsg = data.error || (data.details && data.details[0] && data.details[0].error) || data.message || '';

            if (res.ok && data.status === 'success' && data.sent > 0) {
                this.markRecordsAsSent([rec.customer_id]);
                alert(`WhatsApp Reminder successfully sent to ${rec.customer_name}!`);
                return;
            } else if (errMsg && errMsg.toLowerCase().includes('not enabled')) {
                const openWeb = confirm(`WhatsApp Service is not enabled in System Settings.\n\nOpen WhatsApp Web directly instead?`);
                if (openWeb) this.openWhatsAppForRecord(rec);
            } else {
                const openWeb = confirm(`API dispatch note: ${errMsg || 'Dispatch unsuccessful'}.\n\nWould you like to open WhatsApp Web directly?`);
                if (openWeb) this.openWhatsAppForRecord(rec);
            }
        } catch (err) {
            this.openWhatsAppForRecord(rec);
        }
    },

    sendWhatsApp: async function() {
        const selected = this.getSelectedList();
        if (selected.length === 0) return alert('No customer selected. Please select at least one customer.');

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        if (selected.length === 1) {
            return this.sendWhatsAppSingle(selected[0].customer_id);
        }

        const confirmed = confirm(`You have selected ${selected.length} customers.\nSend automated WhatsApp reminders to all ${selected.length} customers via API?`);
        if (!confirmed) return;

        const recipients = selected.map(rec => ({
            customer_id: rec.customer_id,
            name: rec.customer_name,
            contact: rec.contact_no,
            message: this.buildReminderMessage(rec)
        }));

        try {
            const res = await fetch(`api/communication_api.php?action=send_message&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'whatsapp',
                    recipients: recipients
                })
            });

            const data = await res.json().catch(() => ({}));
            const errMsg = data.error || (data.details && data.details[0] && data.details[0].error) || data.message || '';

            if (res.ok && data.status === 'success' && data.sent > 0) {
                const sentIds = selected.map(s => s.customer_id);
                this.markRecordsAsSent(sentIds);
                alert(`WhatsApp Reminders Dispatch Completed!\nSent: ${data.sent}\nFailed: ${data.failed}`);
            } else {
                alert('WhatsApp sending note: ' + (errMsg || 'Failed to dispatch'));
                this.openWhatsAppForRecord(selected[0]);
            }
        } catch (err) {
            alert('Error communicating with WhatsApp Gateway: ' + err.message);
        }
    },

    openWhatsAppForRecord: function(rec) {
        const msg = this.buildReminderMessage(rec);
        let phone = (rec.contact_no || '').replace(/[^0-9]/g, '');
        if (phone.startsWith('0')) phone = '92' + phone.substring(1);
        if (!phone.startsWith('92') && phone.length === 10) phone = '92' + phone;

        const text = encodeURIComponent(msg);
        const url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${text}` : `https://api.whatsapp.com/send?text=${text}`;
        window.open(url, '_blank');
        this.markRecordsAsSent([rec.customer_id]);
    },

    sendSMS: async function() {
        const selected = this.getSelectedList();
        if (selected.length === 0) return alert('No customer selected. Please select at least one customer.');

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const confirmed = confirm(`Send SMS Reminder to ${selected.length} customer(s) via Branded SMS Gateway?`);
        if (!confirmed) return;

        const recipients = selected.map(rec => ({
            customer_id: rec.customer_id,
            name: rec.customer_name,
            contact: rec.contact_no,
            message: `Dear ${rec.customer_name}, Your outstanding balance is Rs. ${this.formatCurrency(rec.outstanding)}. Please arrange payment at your earliest. Thank you, ${session.company_name || 'SEASTONE'}.`
        }));

        try {
            const res = await fetch(`api/communication_api.php?action=send_message&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'sms',
                    recipients: recipients
                })
            });

            const data = await res.json();
            if (res.ok && data.status === 'success') {
                const sentIds = selected.map(s => s.customer_id);
                this.markRecordsAsSent(sentIds);
                alert(`SMS Dispatch Summary:\nSent: ${data.sent}\nFailed: ${data.failed}`);
            } else if (data.error && data.error.includes('not enabled')) {
                const copy = confirm(`SMS Gateway is currently not enabled in System Settings.\n\nWould you like to copy the SMS text for ${selected[0].customer_name}?`);
                if (copy) prompt('Copy SMS:', recipients[0].message);
            } else {
                alert('SMS sending error: ' + (data.error || 'Failed to dispatch'));
            }
        } catch (err) {
            alert('Error communicating with SMS Gateway: ' + err.message);
        }
    },

    sendEmail: async function() {
        const selected = this.getSelectedList();
        if (selected.length === 0) return alert('No customer selected. Please select at least one customer.');

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const coName = session.company_name || 'SEASTONE PLASTIC INDUSTRIES';

        const confirmed = confirm(`Send Official Email Reminder to ${selected.length} customer(s)?`);
        if (!confirmed) return;

        const recipients = selected.map(rec => ({
            customer_id: rec.customer_id,
            name: rec.customer_name,
            contact: rec.email || rec.contact_no || '',
            subject: `Payment Reminder - ${rec.customer_name} (Outstanding: Rs. ${this.formatCurrency(rec.outstanding)})`,
            message: `Dear ${rec.customer_name},\n\nAccording to our accounting records, your current outstanding balance is Rs. ${this.formatCurrency(rec.outstanding)}.\nDue Date: ${rec.due_date_formatted || 'Immediate'}\n\nPlease arrange payment at your earliest convenience.\n\nThank you,\n${coName}`
        }));

        try {
            const res = await fetch(`api/communication_api.php?action=send_message&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'email',
                    recipients: recipients
                })
            });

            const data = await res.json();
            if (res.ok && data.status === 'success') {
                const sentIds = selected.map(s => s.customer_id);
                this.markRecordsAsSent(sentIds);
                alert(`Email Dispatch Summary:\nSent: ${data.sent}\nFailed: ${data.failed}`);
            } else if (data.error && data.error.includes('not enabled')) {
                // Fallback to mailto
                const rec = selected[0];
                const subject = encodeURIComponent(`Payment Reminder - ${rec.customer_name} (Outstanding: Rs. ${this.formatCurrency(rec.outstanding)})`);
                const body = encodeURIComponent(recipients[0].message);
                window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
            } else {
                alert('Email dispatch error: ' + (data.error || 'Failed to send'));
            }
        } catch (err) {
            alert('Error connecting to Email service: ' + err.message);
        }
    },

    viewLedger: function(id) {
        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/Reports/view_account_ledger.html', 'fa-book', 'Account Ledger', () => {
                if (window.ViewAccountLedgerModule) {
                    const sel = document.getElementById('val_account');
                    if (sel) {
                        sel.value = id;
                        if (window.ViewAccountLedgerModule.loadLedger) window.ViewAccountLedgerModule.loadLedger();
                    }
                }
            }, 'Account Ledger', true, true);
        } else {
            alert('Account ledger popup unavailable.');
        }
    },

    openFollowUpModalSingle: function(id) {
        const rec = (this.reportData.records || []).find(r => r.customer_id == id);
        if (!rec) return;
        this.showFollowUpDialog(rec);
    },

    openFollowUpModal: function() {
        const selected = this.getSelectedList();
        if (selected.length === 0) return alert('Please select a customer to record follow-up.');
        this.showFollowUpDialog(selected[0]);
    },

    showFollowUpDialog: function(rec) {
        const modal = document.getElementById('prr_followup_dialog');
        const custDisp = document.getElementById('prr_fu_customer_display');
        const custIdInp = document.getElementById('prr_fu_customer_id');
        const promisedAmt = document.getElementById('prr_fu_promised_amt');
        const promisedDate = document.getElementById('prr_fu_promised_date');

        if (custDisp) custDisp.innerText = `${rec.customer_name} (Outstanding: Rs. ${this.formatCurrency(rec.outstanding)})`;
        if (custIdInp) custIdInp.value = rec.customer_id;
        if (promisedAmt) promisedAmt.value = rec.outstanding;
        if (promisedDate) promisedDate.value = rec.due_date;

        if (modal) modal.style.display = 'flex';
    },

    closeFollowUpModal: function() {
        const modal = document.getElementById('prr_followup_dialog');
        if (modal) modal.style.display = 'none';
    },

    submitFollowUp: async function() {
        const self = this;
        const custId = document.getElementById('prr_fu_customer_id')?.value;
        if (!custId) return alert('Customer missing.');

        const promisedDate = document.getElementById('prr_fu_promised_date')?.value || '';
        const promisedAmt = document.getElementById('prr_fu_promised_amt')?.value || 0;
        const responseType = document.getElementById('prr_fu_response')?.value || '';
        const nextDate = document.getElementById('prr_fu_next_date')?.value || '';
        const remarks = document.getElementById('prr_fu_remarks')?.value || '';

        const payload = {
            customer_coa_id: custId,
            promised_date: promisedDate,
            promised_amount: promisedAmt,
            response_type: responseType,
            next_follow_up_date: nextDate,
            remarks: remarks,
            event_type: 'Payment Reminder Follow-up',
            status: 'Follow-up Recorded'
        };

        try {
            const res = await fetch('api/payment_reminder.php?action=save_follow_up', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert('Follow-up recorded successfully.');
                self.closeFollowUpModal();
                self.search();
            } else {
                alert(data.error || 'Failed to save follow-up');
            }
        } catch(e) {
            alert('Error saving follow-up: ' + e.message);
        }
    },

    // -------------------------------------------------------------------------
    // Printing in Same Tab (No New Tab)
    // -------------------------------------------------------------------------
    printReport: async function() {
        const self = this;
        const records = self.reportData.records || [];
        if (records.length === 0) return alert('No records available to print.');

        if (!self.companyProfile || !self.companyProfile.logo) {
            await self.loadCompanyProfile();
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        let coName = (self.companyProfile && self.companyProfile.name) || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
        coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');

        const logoHtml = (self.companyProfile && self.companyProfile.logo && self.companyProfile.logo.startsWith('data:image'))
            ? `<img src="${self.companyProfile.logo}" style="max-height: 52px; max-width: 130px; object-fit: contain;" alt="Logo">`
            : '';

        let rowsHtml = '';
        let totBal = 0, totPaid = 0, totOut = 0;

        records.forEach((row, idx) => {
            totBal += row.total_balance;
            totPaid += row.paid_amount;
            totOut += row.outstanding;

            rowsHtml += `
                <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td style="font-weight: 700; color: #0f172a;">${row.customer_name}</td>
                    <td style="text-align: center; font-family: monospace;">${row.contact_no || '-'}</td>
                    <td style="text-align: center; font-weight: bold;">${row.credit_days}</td>
                    <td style="text-align: center;">${row.due_date_formatted}</td>
                    <td style="text-align: right;">${self.formatCurrency(row.total_balance)}</td>
                    <td style="text-align: right; color: ${row.paid_amount > 0 ? '#16a34a' : '#64748b'};">${self.formatCurrency(row.paid_amount)}</td>
                    <td style="text-align: right; font-weight: bold; background: #f8fafc;">${self.formatCurrency(row.outstanding)}</td>
                    <td style="text-align: center; color: ${row.overdue_days_num > 0 ? '#dc2626' : '#334155'}; font-weight: ${row.overdue_days_num > 0 ? 'bold' : 'normal'};">${row.overdue_days}</td>
                    <td style="text-align: center; font-weight: bold;">${row.status_text}</td>
                </tr>
            `;
        });

        const printHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Payment Reminder Report (Credit Control) - ${coName}</title>
    <style>
        @page { size: A4 landscape; margin: 8mm 10mm; }
        @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5px; color: #0f172a; margin: 0; padding: 10px; }
        .hdr { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 6px; margin-bottom: 8px; }
        .co-title { font-size: 18px; font-weight: 900; color: #1F4E79; margin: 0; }
        .badge { background: #1F4E79; color: #fff; padding: 4px 10px; border-radius: 4px; font-weight: 800; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9px; }
        th { background: #1F4E79 !important; color: #fff !important; border: 1px solid #94a3b8; padding: 4px; text-transform: uppercase; font-size: 8.5px; }
        td { border: 1px solid #cbd5e1; padding: 3px 5px; }
        .tot-row { background: #0b2942 !important; color: #fff !important; font-weight: bold; }
        .sig { display: flex; justify-content: space-between; margin-top: 30px; font-size: 9.5px; color: #475569; }
        .sig-b { border-top: 1px dashed #64748b; padding-top: 4px; min-width: 140px; text-align: center; }
    </style>
</head>
<body>
    <div class="hdr">
        <div style="display: flex; align-items: center; gap: 12px;">
            ${logoHtml}
            <div>
                <h1 class="co-title">${coName}</h1>
                <div style="font-size: 11px; font-weight: 700; color: #1F4E79; margin-top: 3px;">
                    Payment Reminder Report (Credit Control) &bull; As of ${new Date().toLocaleDateString('en-GB')}
                </div>
            </div>
        </div>
        <div style="text-align: right;">
            <div class="badge">CREDIT CONTROL</div>
            <div style="font-size: 9.5px; color: #64748b; margin-top: 4px;">Date: ${new Date().toLocaleDateString('en-GB')}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="text-align: left;">Customer Name</th>
                <th style="width: 100px; text-align: center;">Contact No.</th>
                <th style="width: 70px; text-align: center;">Credit Days</th>
                <th style="width: 85px; text-align: center;">Due Date</th>
                <th style="width: 95px; text-align: right;">Total Balance</th>
                <th style="width: 85px; text-align: right;">Paid Amount</th>
                <th style="width: 95px; text-align: right;">Outstanding</th>
                <th style="width: 75px; text-align: center;">Overdue Days</th>
                <th style="width: 140px; text-align: center;">Reminder Status</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
        <tfoot>
            <tr class="tot-row">
                <td colspan="5" style="text-align: center;">Total (${records.length} Customers)</td>
                <td style="text-align: right; color: #fff;">${self.formatCurrency(totBal)}</td>
                <td style="text-align: right; color: #86efac;">${self.formatCurrency(totPaid)}</td>
                <td style="text-align: right; color: #fff; background: #071e30; font-weight: 900;">${self.formatCurrency(totOut)}</td>
                <td colspan="2"></td>
            </tr>
        </tfoot>
    </table>

    <div class="sig">
        <div class="sig-b">Prepared By: ${session.username || session.name || 'Accounts'}</div>
        <div class="sig-b">Credit Controller</div>
        <div class="sig-b">Finance Director</div>
    </div>
</body>
</html>`;

        self.printInSameTab(printHtml);
    },

    printReminderLetter: async function() {
        const self = this;
        const selected = self.getSelectedList();
        if (selected.length === 0) return alert('Please select a customer to print reminder letter.');

        if (!self.companyProfile || !self.companyProfile.logo) {
            await self.loadCompanyProfile();
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        let coName = (self.companyProfile && self.companyProfile.name) || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
        coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');

        const logoHtml = (self.companyProfile && self.companyProfile.logo && self.companyProfile.logo.startsWith('data:image'))
            ? `<img src="${self.companyProfile.logo}" style="max-height: 60px; max-width: 150px; object-fit: contain;" alt="Logo">`
            : '';

        let lettersHtml = '';
        selected.forEach((rec, idx) => {
            lettersHtml += `
                <div style="page-break-after: ${idx < selected.length - 1 ? 'always' : 'auto'}; padding: 25px 35px; border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1F4E79; padding-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            ${logoHtml}
                            <div>
                                <h1 style="font-size: 20px; font-weight: 900; color: #1F4E79; margin: 0;">${coName}</h1>
                                <div style="font-size: 10px; color: #475569; margin-top: 2px;">
                                    ${self.companyProfile.address ? `<span>${self.companyProfile.address}</span>` : ''}
                                    ${self.companyProfile.phone ? `<span style="margin-left: 8px;"><strong>Phone:</strong> ${self.companyProfile.phone}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 13px; font-weight: 900; color: #1F4E79;">PAYMENT REMINDER</div>
                            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Date: ${new Date().toLocaleDateString('en-GB')}</div>
                        </div>
                    </div>

                    <div style="margin-top: 25px; line-height: 1.6; font-size: 11.5px; color: #1e293b;">
                        <p><strong>To:</strong><br>
                        <strong>M/S ${rec.customer_name}</strong><br>
                        ${rec.contact_no ? `Contact: ${rec.contact_no}<br>` : ''}
                        ${rec.address ? `Address: ${rec.address}<br>` : ''}
                        </p>

                        <p style="margin-top: 20px;">
                            <strong>Subject: Outstanding Payment Follow-up Notice</strong>
                        </p>

                        <p style="margin-top: 15px;">
                            Dear Valued Customer,
                        </p>

                        <p>
                            We hope this letter finds you well. According to our financial accounts and credit ledger, your account currently reflects an outstanding receivable balance of:
                        </p>

                        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 4px; padding: 12px 18px; margin: 15px 0; display: inline-block; min-width: 320px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span>Total Account Balance:</span>
                                <strong>Rs. ${self.formatCurrency(rec.total_balance)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #16a34a;">
                                <span>Recent Payments Received:</span>
                                <strong>Rs. ${self.formatCurrency(rec.paid_amount)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 13px; color: #1F4E79;">
                                <span>Net Outstanding Due:</span>
                                <strong>Rs. ${self.formatCurrency(rec.outstanding)}</strong>
                            </div>
                        </div>

                        <p>
                            As per your agreed credit period of <strong>${rec.credit_days} Days</strong>, the payment was due on <strong>${rec.due_date_formatted}</strong>.
                            ${rec.overdue_days_num > 0 ? `<br><span style="color: #dc2626; font-weight: bold;">This payment is currently overdue by ${rec.overdue_days_num} days.</span>` : ''}
                        </p>

                        <p>
                            Please arrange for the disbursement of the aforementioned outstanding amount at your earliest convenience. If payment has already been initiated, please disregard this reminder and share the transaction details with our accounts department.
                        </p>

                        <p style="margin-top: 25px;">
                            Thank you for your continued business and cooperation.
                        </p>

                        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
                            <div>
                                <strong>Sincerely,</strong><br><br><br>
                                <strong>Accounts &amp; Credit Control Department</strong><br>
                                ${coName}
                            </div>
                            <div style="text-align: right; border-top: 1px dashed #94a3b8; padding-top: 4px; width: 160px; margin-top: 35px;">
                                Authorized Signatory
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        const printHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Payment Reminder Letter - ${coName}</title>
    <style>
        @page { size: A4 portrait; margin: 10mm 15mm; }
        @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 10px; color: #0f172a; }
    </style>
</head>
<body>
    ${lettersHtml}
</body>
</html>`;

        self.printInSameTab(printHtml);
    },

    printInSameTab: function(html) {
        let printFrame = document.getElementById('prr_print_frame');
        if (printFrame) printFrame.remove();

        printFrame = document.createElement('iframe');
        printFrame.id = 'prr_print_frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.style.visibility = 'hidden';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(html);
        frameDoc.close();

        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch(e) {
                console.error('[PRR] Print error:', e);
            }
        }, 300);
    },

    exportPDF: async function() {
        await this.printReport();
    },

    exportExcel: function() {
        const self = this;
        const records = self.reportData.records || [];
        if (records.length === 0) return alert('No data to export.');

        if (typeof XLSX !== 'undefined') {
            const table = document.getElementById('prr_main_table');
            const wb = XLSX.utils.table_to_book(table, { sheet: "Payment Reminder" });
            XLSX.writeFile(wb, `Payment_Reminder_${new Date().toISOString().split('T')[0]}.xlsx`);
            return;
        }

        // CSV Fallback
        let csv = 'Customer Code,Customer Name,Contact No,Credit Days,Due Date,Total Balance,Paid Amount,Outstanding,Overdue Days,Reminder Status\n';
        records.forEach(r => {
            csv += `"${r.customer_code}","${r.customer_name}","${r.contact_no}",${r.credit_days},"${r.due_date_formatted}",${r.total_balance},${r.paid_amount},${r.outstanding},"${r.overdue_days}","${r.status_text}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Payment_Reminder_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
};

