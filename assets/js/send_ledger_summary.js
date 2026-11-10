(function() {
    const SendLedgerSummaryModule = {
        data: {
            company_id: 1,
            partyType: 'customer',
            recipients: [],
            selectedRecipient: null,
            templates: [],
            companyName: 'My Company'
        },

        init: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = session.company_id || 1;
            this.data.companyName = session.company_name || 'My Company';

            this.resetForm();

            // Load Templates & Recipients & Logs
            await this.loadTemplates();
            await this.loadRecipients();
            await this.loadLogs();

            // Set up search suggestions
            const searchInput = document.getElementById('lsPartySearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.showSuggestions(e.target.value));
                searchInput.addEventListener('focus', (e) => this.showSuggestions(e.target.value));
            }

            // Close suggestions on outside click
            document.addEventListener('click', (e) => {
                if (e.target.id !== 'lsPartySearch') {
                    const sugg = document.getElementById('lsPartySuggest');
                    if (sugg) sugg.style.display = 'none';
                }
            });

            // Bind char counter
            const msgArea = document.getElementById('lsMessageText');
            if (msgArea) {
                msgArea.addEventListener('input', () => this.updateCharCounter());
            }

            // Preload html2pdf library in background
            this.ensureHtml2Pdf().catch(() => {});
        },

        initDateInputs: function() {
            const fromEl = document.getElementById('lsFromDate');
            const toEl = document.getElementById('lsToDate');
            const today = new Date();
            const toStr = today.toISOString().split('T')[0];
            
            // 1st of current month
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const fromStr = firstDay.toISOString().split('T')[0];

            if (fromEl && !fromEl.value) fromEl.value = fromStr;
            if (toEl && !toEl.value) toEl.value = toStr;
        },

        toggleDateInputs: function() {
            const customRadio = document.getElementById('lsDateCustom');
            const customRow = document.getElementById('lsCustomDateRow');
            if (!customRow) return;
            if (customRadio && customRadio.checked) {
                customRow.style.display = 'flex';
                this.initDateInputs();
            } else {
                customRow.style.display = 'none';
            }
        },

        resetForm: function() {
            this.data.selectedRecipient = null;
            document.getElementById('lsPartySearch').value = '';
            document.getElementById('lsMobileNo').value = '';
            document.getElementById('lsCode').textContent = '-';
            document.getElementById('lsName').textContent = '-';
            document.getElementById('lsContactPerson').textContent = '-';
            const symbol = window.globalCurrencySymbol || 'Rs.';
            document.getElementById('lsOpening').textContent = symbol + ' 0.00';
            document.getElementById('lsDebit').textContent = symbol + ' 0.00';
            document.getElementById('lsCredit').textContent = symbol + ' 0.00';
            document.getElementById('lsNetBalance').textContent = symbol + ' 0.00';
            document.getElementById('lsMessageText').value = '';
            document.getElementById('lsTemplateSelect').value = '';
            
            const chk = document.getElementById('lsAttachPDF');
            if (chk) chk.checked = false;
            
            const dateContainer = document.getElementById('lsPdfDateRangeContainer');
            if (dateContainer) dateContainer.style.display = 'none';
            
            const dateAll = document.getElementById('lsDateAll');
            if (dateAll) dateAll.checked = true;

            const customRow = document.getElementById('lsCustomDateRow');
            if (customRow) customRow.style.display = 'none';

            this.updateCharCounter();
        },

        handlePartyTypeChange: async function() {
            this.data.partyType = document.getElementById('lsPartyType').value;
            this.resetForm();
            await this.loadRecipients();
        },

        loadTemplates: async function() {
            try {
                const res = await fetch(`api/sms_templates.php?action=get_templates&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.templates = await res.json();
                    const select = document.getElementById('lsTemplateSelect');
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

        loadRecipients: async function() {
            try {
                const res = await fetch(`api/sms_logs.php?action=get_recipients&type=${this.data.partyType}&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.recipients = await res.json();
                }
            } catch (err) {
                console.error("Error loading recipients:", err);
            }
        },

        loadLogs: async function() {
            try {
                const res = await fetch(`api/sms_logs.php?action=get_logs&company_id=${this.data.company_id}`);
                if (res.ok) {
                    const logs = await res.json();
                    const tbody = document.getElementById('lsLogsBody');
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

        showSuggestions: function(query) {
            const sugg = document.getElementById('lsPartySuggest');
            if (!sugg) return;

            if (!query) {
                sugg.style.display = 'none';
                return;
            }

            const q = query.toLowerCase();
            const matches = this.data.recipients.filter(r => 
                (r.name && r.name.toLowerCase().includes(q)) || 
                (r.code && r.code.toLowerCase().includes(q))
            );

            if (matches.length === 0) {
                sugg.style.display = 'none';
                return;
            }

            sugg.innerHTML = '';
            sugg.style.display = 'block';
            matches.slice(0, 10).forEach(m => {
                const div = document.createElement('div');
                div.style.padding = '6px 10px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #f1f5f9';
                div.innerHTML = `<strong>${m.code}</strong> - ${m.name}`;
                div.onclick = () => {
                    this.selectRecipient(m);
                    sugg.style.display = 'none';
                };
                sugg.appendChild(div);
            });
        },

        selectRecipient: function(rec) {
            this.data.selectedRecipient = rec;
            document.getElementById('lsPartySearch').value = `${rec.code} - ${rec.name}`;
            document.getElementById('lsCode').textContent = rec.code || '-';
            document.getElementById('lsName').textContent = rec.name || '-';
            document.getElementById('lsContactPerson').textContent = rec.contact_person || '-';
            
            // Format numbers
            const opening = parseFloat(rec.opening_balance || 0);
            const debit = parseFloat(rec.total_debit || 0);
            const credit = parseFloat(rec.total_credit || 0);
            const net = parseFloat(rec.balance || 0);

            const symbol = window.globalCurrencySymbol || 'Rs.';
            document.getElementById('lsOpening').textContent = symbol + ' ' + opening.toFixed(2);
            document.getElementById('lsDebit').textContent = symbol + ' ' + debit.toFixed(2);
            document.getElementById('lsCredit').textContent = symbol + ' ' + credit.toFixed(2);
            document.getElementById('lsNetBalance').textContent = symbol + ' ' + net.toFixed(2);

            // Fill Mobile
            document.getElementById('lsMobileNo').value = rec.mobile || rec.telephone || '';

            // Apply template if one is selected
            this.applyTemplate();
        },

        applyTemplate: function() {
            const select = document.getElementById('lsTemplateSelect');
            const txtArea = document.getElementById('lsMessageText');
            if (!select || !txtArea) return;

            const tmplId = select.value;
            if (!tmplId) {
                txtArea.value = '';
                this.updateCharCounter();
                return;
            }

            const tmpl = this.data.templates.find(t => t.id == tmplId);
            if (!tmpl) return;

            let msg = tmpl.message;
            const rec = this.data.selectedRecipient;

            const symbol = window.globalCurrencySymbol || 'Rs.';
            if (rec) {
                const op = parseFloat(rec.opening_balance || 0).toFixed(2);
                const db = parseFloat(rec.total_debit || 0).toFixed(2);
                const cr = parseFloat(rec.total_credit || 0).toFixed(2);
                const net = parseFloat(rec.balance || 0).toFixed(2);

                msg = msg.replace(/{customer_name}/g, rec.name || '')
                         .replace(/{party_name}/g, rec.name || '')
                         .replace(/{opening_balance}/g, symbol + ' ' + op)
                         .replace(/{receipts}/g, symbol + ' ' + cr)
                         .replace(/{total_credit}/g, symbol + ' ' + cr)
                         .replace(/{payments}/g, symbol + ' ' + db)
                         .replace(/{total_debit}/g, symbol + ' ' + db)
                         .replace(/{net_balance}/g, symbol + ' ' + net)
                         .replace(/{balance}/g, symbol + ' ' + net)
                         .replace(/{company_name}/g, this.data.companyName);
            } else {
                msg = msg.replace(/{customer_name}/g, '[Name]')
                         .replace(/{opening_balance}/g, symbol + ' 0.00')
                         .replace(/{receipts}/g, symbol + ' 0.00')
                         .replace(/{payments}/g, symbol + ' 0.00')
                         .replace(/{net_balance}/g, symbol + ' 0.00')
                         .replace(/{company_name}/g, this.data.companyName);
            }

            txtArea.value = msg;
            this.updateCharCounter();
        },

        togglePDFAttachment: function() {
            const chk = document.getElementById('lsAttachPDF');
            const dateContainer = document.getElementById('lsPdfDateRangeContainer');
            if (!chk) return;

            if (chk.checked) {
                if (!this.data.selectedRecipient) {
                    alert("Please select a Customer or Vendor first.");
                    chk.checked = false;
                    if (dateContainer) dateContainer.style.display = 'none';
                    return;
                }
                if (dateContainer) dateContainer.style.display = 'block';
                this.initDateInputs();
            } else {
                if (dateContainer) dateContainer.style.display = 'none';
            }
        },

        ensureHtml2Pdf: async function() {
            if (window.html2pdf) return window.html2pdf;
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'assets/js/html2pdf.bundle.min.js';
                script.onload = () => resolve(window.html2pdf);
                script.onerror = () => {
                    const cdnScript = document.createElement('script');
                    cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    cdnScript.onload = () => resolve(window.html2pdf);
                    cdnScript.onerror = () => reject(new Error('Failed to load html2pdf library'));
                    document.head.appendChild(cdnScript);
                };
                document.head.appendChild(script);
            });
        },

        buildLedgerHtml: function(rec, txs, fromDate, toDate) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compName = session.company_name || 'SOFTIFYX ERP';
            const compAddr = session.company_address || 'Company Address Area';
            const compPhone = session.company_phone || 'Tel: 000-000000';
            const compEmail = session.company_email || 'Email: info@softifyx.com';
            const logoImg = document.getElementById('userLogo');
            const logoSrc = logoImg ? logoImg.src : '';

            let periodText = 'All Dates (Complete Ledger)';
            if (fromDate && toDate) {
                periodText = `${fromDate} To ${toDate}`;
            } else if (fromDate) {
                periodText = `From ${fromDate}`;
            } else if (toDate) {
                periodText = `Up to ${toDate}`;
            }

            let runningBalance = 0;
            let totalDebit = 0;
            let totalCredit = 0;

            let rowsHtml = '';
            txs.forEach((tx) => {
                const db = parseFloat(tx.debit || 0);
                const cr = parseFloat(tx.credit || 0);
                
                if (this.data.partyType === 'customer') {
                    runningBalance += (db - cr);
                } else {
                    runningBalance += (cr - db);
                }

                totalDebit += db;
                totalCredit += cr;

                const dateStr = tx.date ? tx.date : '---';
                const debitStr = db > 0 ? db.toFixed(2) : '-';
                const creditStr = cr > 0 ? cr.toFixed(2) : '-';

                rowsHtml += `
                    <tr>
                        <td style="text-align: center; border: 1px solid #cbd5e0; padding: 5px;">${dateStr}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 5px; text-align: center; font-weight: bold;">${this.escapeHTML(tx.reference || '')}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 5px;">${this.escapeHTML(tx.description || '')}</td>
                        <td style="text-align: right; border: 1px solid #cbd5e0; padding: 5px; color: #16a34a;">${debitStr}</td>
                        <td style="text-align: right; border: 1px solid #cbd5e0; padding: 5px; color: #dc2626;">${creditStr}</td>
                        <td style="text-align: right; border: 1px solid #cbd5e0; padding: 5px; font-weight: bold;">${runningBalance.toFixed(2)}</td>
                    </tr>
                `;
            });

            return `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.4; padding: 15px; background: white;">
                    <div style="text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; position: relative;">
                        ${logoSrc ? `<img src="${logoSrc}" style="height: 45px; position: absolute; left: 0; top: 0; border-radius: 4px;">` : ''}
                        <div style="font-family: 'Times New Roman', Times, serif; font-size: 24px; font-weight: bold; font-style: italic; margin-bottom: 3px;">${compName}</div>
                        <div style="font-size: 11px; margin-bottom: 2px;">${compAddr}</div>
                        <div style="font-size: 11px;">${compPhone} | ${compEmail}</div>
                        <div style="border: 2px solid #333; padding: 4px 18px; font-size: 15px; font-weight: 800; text-transform: uppercase; background: #f8fafc; display: inline-block; margin-top: 8px;">General Ledger Statement</div>
                    </div>

                    <table style="width: 100%; margin-bottom: 15px; border-collapse: collapse; font-size: 11px;">
                        <tr>
                            <td style="width: 15%; padding: 3px;"><strong>Account Code:</strong></td>
                            <td style="width: 35%; padding: 3px;">${rec.code}</td>
                            <td style="width: 15%; padding: 3px;"><strong>Statement Date:</strong></td>
                            <td style="width: 35%; padding: 3px;">${new Date().toLocaleDateString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px;"><strong>Account Name:</strong></td>
                            <td style="padding: 3px;"><strong>${rec.name}</strong></td>
                            <td style="padding: 3px;"><strong>Period:</strong></td>
                            <td style="padding: 3px; font-weight: 600; color: #1e40af;">${periodText}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px;"><strong>Contact Person:</strong></td>
                            <td style="padding: 3px;">${rec.contact_person || '-'}</td>
                            <td style="padding: 3px;"><strong>Account Type:</strong></td>
                            <td style="padding: 3px;">${this.data.partyType.toUpperCase()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px;"><strong>Mobile No:</strong></td>
                            <td style="padding: 3px;">${rec.mobile || rec.telephone || '-'}</td>
                            <td style="padding: 3px;"><strong>Closing Balance:</strong></td>
                            <td style="padding: 3px; font-weight: 700; color: #1e3a8a;">${(window.globalCurrencySymbol || 'Rs.') + ' ' + runningBalance.toFixed(2)}</td>
                        </tr>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10.5px;">
                        <thead>
                            <tr style="background: #f1f5f9;">
                                <th style="width: 80px; text-align: center; border: 2px solid #333; padding: 5px;">Date</th>
                                <th style="width: 95px; text-align: center; border: 2px solid #333; padding: 5px;">Ref/Voucher</th>
                                <th style="border: 2px solid #333; padding: 5px; text-align: left;">Description / Particulars</th>
                                <th style="width: 95px; text-align: right; border: 2px solid #333; padding: 5px;">Debit (Dr)</th>
                                <th style="width: 95px; text-align: right; border: 2px solid #333; padding: 5px;">Credit (Cr)</th>
                                <th style="width: 110px; text-align: right; border: 2px solid #333; padding: 5px;">Running Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f8fafc; font-weight: bold;">
                                <td colspan="3" style="text-align: right; border: 2px solid #333; padding: 5px;">Total Summary:</td>
                                <td style="text-align: right; border: 2px solid #333; padding: 5px; color: #16a34a;">${totalDebit.toFixed(2)}</td>
                                <td style="text-align: right; border: 2px solid #333; padding: 5px; color: #dc2626;">${totalCredit.toFixed(2)}</td>
                                <td style="text-align: right; border: 2px solid #333; padding: 5px; font-size: 11px; color: #1e3a8a;">${runningBalance.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <table style="width: 100%; margin-top: 40px;">
                        <tr>
                            <td style="width: 33%;">
                                <div style="border-top: 1px solid #333; width: 150px; text-align: center; margin-top: 25px; font-weight: bold; font-size: 10px;">Prepared By</div>
                            </td>
                            <td style="width: 33%; text-align: center;">
                                <div style="border-top: 1px solid #333; width: 150px; text-align: center; margin: 25px auto 0 auto; font-weight: bold; font-size: 10px;">Checked By</div>
                            </td>
                            <td style="width: 34%; text-align: right;">
                                <div style="border-top: 1px solid #333; width: 150px; text-align: center; margin-top: 25px; margin-left: auto; font-weight: bold; font-size: 10px;">Authorized Signature</div>
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        },

        generateLedgerPdfBlob: async function(rec, fromDate, toDate) {
            await this.ensureHtml2Pdf();
            
            let url = `api/sms_logs.php?action=get_ledger_transactions&coa_id=${rec.id}&type=${this.data.partyType}&company_id=${this.data.company_id}`;
            if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
            if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch ledger transactions");
            const txs = await res.json();

            const ledgerHtml = this.buildLedgerHtml(rec, txs, fromDate, toDate);

            // Create temporary off-screen container for rendering
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.left = '-9999px';
            container.style.top = '0';
            container.style.width = '750px';
            container.style.background = '#ffffff';
            container.innerHTML = ledgerHtml;
            document.body.appendChild(container);

            try {
                const cleanPartyName = (rec.name || 'Account').replace(/[^a-zA-Z0-9_\-]/g, '_');
                const fileBase = `Ledger_${cleanPartyName}`;
                const opt = {
                    margin: [8, 8, 8, 8],
                    filename: `${fileBase}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                const pdfBlob = await window.html2pdf().from(container).set(opt).outputPdf('blob');
                return {
                    blob: pdfBlob,
                    fileName: `${fileBase}.pdf`
                };
            } finally {
                document.body.removeChild(container);
            }
        },

        uploadPdfBlob: async function(blob, fileName) {
            const formData = new FormData();
            formData.append('pdf_file', blob, fileName);

            const res = await fetch('api/communication_api.php?action=upload_pdf', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errText = await res.text();
                try {
                    const errJson = JSON.parse(errText);
                    throw new Error(errJson.error || errJson.message || 'PDF upload failed');
                } catch (e) {
                    throw new Error('PDF upload failed: ' + errText);
                }
            }

            const data = await res.json();
            if (data.status !== 'success' || !data.file_url) {
                throw new Error(data.error || 'Failed to upload PDF statement');
            }
            return data;
        },

        sendSMS: async function() {
            const mobile = document.getElementById('lsMobileNo').value.trim();
            const message = document.getElementById('lsMessageText').value.trim();
            const rec = this.data.selectedRecipient;

            if (!mobile || !message) {
                alert("Please select a recipient and ensure the message text is not empty.");
                return;
            }

            const btnSend = document.getElementById('btnSendLS');
            const origBtnHtml = btnSend ? btnSend.innerHTML : '<i class="fas fa-paper-plane"></i> Send SMS';
            if (btnSend) {
                btnSend.disabled = true;
            }

            try {
                let fromDate = null;
                let toDate = null;
                const attachPdfChk = document.getElementById('lsAttachPDF');
                const shouldAttach = attachPdfChk && attachPdfChk.checked;

                if (shouldAttach) {
                    if (!rec) {
                        alert("Please select a Customer or Vendor first.");
                        if (btnSend) { btnSend.disabled = false; btnSend.innerHTML = origBtnHtml; }
                        return;
                    }

                    const customRadio = document.getElementById('lsDateCustom');
                    if (customRadio && customRadio.checked) {
                        fromDate = document.getElementById('lsFromDate').value;
                        toDate = document.getElementById('lsToDate').value;
                        if (!fromDate || !toDate) {
                            alert("Please select both From Date and To Date for the PDF statement.");
                            if (btnSend) { btnSend.disabled = false; btnSend.innerHTML = origBtnHtml; }
                            return;
                        }
                    }
                }

                if (btnSend) btnSend.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (shouldAttach ? 'Generating PDF & Sending...' : 'Sending WhatsApp...');

                const payload = {
                    recipient_type: this.data.partyType === 'customer' ? 'Customer' : 'Vendor',
                    recipient_name: rec ? rec.name : 'Manual Entry',
                    coa_id: rec ? rec.id : null,
                    mobile_no: mobile,
                    message: message,
                    attach_pdf: shouldAttach,
                    from_date: fromDate,
                    to_date: toDate
                };

                const res = await fetch(`api/sms_logs.php?action=send_sms&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const result = await res.json();
                    if (result.status === 'success') {
                        // Display simulator
                        document.getElementById('phoneRecipientName').textContent = payload.recipient_name;
                        let dispMsg = message;
                        if (documentUrl) {
                            dispMsg += `\n\n📄 [PDF Document Attached: ${fileName}]`;
                        }
                        document.getElementById('phoneMessageText').textContent = dispMsg;
                        document.getElementById('simulatedPhoneModal').style.display = 'flex';
                        
                        const successBadge = document.getElementById('phoneSuccessBadge');
                        if (successBadge) {
                            successBadge.style.opacity = 0;
                            successBadge.style.transition = 'opacity 0.5s';
                            setTimeout(() => { successBadge.style.opacity = 1; }, 300);
                        }

                        await this.loadLogs();
                        this.resetForm();
                    } else {
                        alert("Dispatch Note: " + (result.error || result.message || "Failed to send message"));
                    }
                } else {
                    const errText = await res.text();
                    alert("Server error: " + errText);
                }
            } catch (err) {
                console.error("Error sending SMS:", err);
                alert("Error sending message: " + (err.message || err));
            } finally {
                if (btnSend) {
                    btnSend.disabled = false;
                    btnSend.innerHTML = origBtnHtml;
                }
            }
        },

        printLedger: async function() {
            const rec = this.data.selectedRecipient;
            if (!rec) {
                alert("Please select a Customer or Vendor first before viewing or printing the ledger.");
                return;
            }

            try {
                let fromDate = null;
                let toDate = null;
                const attachPdfChk = document.getElementById('lsAttachPDF');
                const customRadio = document.getElementById('lsDateCustom');
                if (attachPdfChk && attachPdfChk.checked && customRadio && customRadio.checked) {
                    fromDate = document.getElementById('lsFromDate').value;
                    toDate = document.getElementById('lsToDate').value;
                }

                let url = `api/sms_logs.php?action=get_ledger_transactions&coa_id=${rec.id}&type=${this.data.partyType}&company_id=${this.data.company_id}`;
                if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
                if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;

                const res = await fetch(url);
                if (!res.ok) throw new Error("Failed to fetch ledger transactions");
                
                const txs = await res.json();
                const ledgerHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>General Ledger - ${rec.name}</title>
                        <style>
                            @media print { 
                                @page { margin: 10mm; size: auto; } 
                                body { margin: 0; padding: 20px; }
                            }
                        </style>
                    </head>
                    <body>
                        ${this.buildLedgerHtml(rec, txs, fromDate, toDate)}
                    </body>
                    </html>
                `;

                let printFrame = document.getElementById('ls_print_frame');
                if (!printFrame) {
                    printFrame = document.createElement('iframe');
                    printFrame.id = 'ls_print_frame';
                    printFrame.style.display = 'none';
                    document.body.appendChild(printFrame);
                }

                const doc = printFrame.contentWindow.document;
                doc.open();
                doc.write(ledgerHtml);
                doc.close();

                printFrame.contentWindow.focus();
                setTimeout(() => {
                    printFrame.contentWindow.print();
                }, 500);

            } catch (err) {
                console.error("Error generating ledger PDF:", err);
                alert("Could not load ledger transactions. Please try again.");
            }
        },

        updateCharCounter: function() {
            const msg = document.getElementById('lsMessageText').value;
            const len = msg.length;
            let parts = 0;
            if (len > 0) {
                parts = len <= 160 ? 1 : Math.ceil(len / 153);
            }
            const label = document.getElementById('lsCharCounter');
            if (label) {
                label.textContent = `${len} characters / ${parts} SMS Part(s)`;
            }
        },

        escapeHTML: function(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };

    window.SendLedgerSummaryModule = SendLedgerSummaryModule;
})();
