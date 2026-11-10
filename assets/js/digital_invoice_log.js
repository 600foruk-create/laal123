/**
 * SoftifyX ERP - Digital Invoice Integration Log Module
 * Handles Register Filtering, Details View with JSON Viewer, Idempotent Retries, Status Verification, and Excel Export
 */
(function() {
    const DigitalInvoiceLogModule = {
        apiBase: 'api/digital_invoice_log.php',
        pagination: {
            limit: 50,
            offset: 0,
            total: 0,
            currentPage: 1
        },
        currentDetailLog: null,

        init: function() {
            this.setDefaultDates();
            this.loadLogs(0);
        },

        setDefaultDates: function() {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');

            const firstDay = `${y}-${m}-01`;
            const curDay = `${y}-${m}-${d}`;

            this.setVal('flt_date_from', firstDay);
            this.setVal('flt_date_to', curDay);
            this.setVal('flt_quick_date', 'this_month');
        },

        handleQuickDate: function(val) {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const curDay = `${y}-${m}-${d}`;

            if (val === 'today') {
                this.setVal('flt_date_from', curDay);
                this.setVal('flt_date_to', curDay);
            } else if (val === 'yesterday') {
                const yDate = new Date();
                yDate.setDate(yDate.getDate() - 1);
                const yStr = `${yDate.getFullYear()}-${String(yDate.getMonth()+1).padStart(2,'0')}-${String(yDate.getDate()).padStart(2,'0')}`;
                this.setVal('flt_date_from', yStr);
                this.setVal('flt_date_to', yStr);
            } else if (val === 'last7') {
                const l7 = new Date();
                l7.setDate(l7.getDate() - 6);
                const l7Str = `${l7.getFullYear()}-${String(l7.getMonth()+1).padStart(2,'0')}-${String(l7.getDate()).padStart(2,'0')}`;
                this.setVal('flt_date_from', l7Str);
                this.setVal('flt_date_to', curDay);
            } else if (val === 'this_month') {
                this.setVal('flt_date_from', `${y}-${m}-01`);
                this.setVal('flt_date_to', curDay);
            } else if (val === 'all') {
                this.setVal('flt_date_from', '');
                this.setVal('flt_date_to', '');
            }
            this.loadLogs(0);
        },

        resetFilters: function() {
            this.setDefaultDates();
            this.setVal('flt_erp_doc_no', '');
            this.setVal('flt_fbr_invoice_no', '');
            this.setVal('flt_document_type', '');
            this.setVal('flt_operation_type', '');
            this.setVal('flt_status', '');
            this.setVal('flt_http_status_code', '');
            this.loadLogs(0);
        },

        handleLimitChange: function(val) {
            this.pagination.limit = parseInt(val) || 50;
            this.loadLogs(0);
        },

        prevPage: function() {
            if (this.pagination.offset > 0) {
                const newOffset = Math.max(0, this.pagination.offset - this.pagination.limit);
                this.loadLogs(newOffset);
            }
        },

        nextPage: function() {
            const nextOffset = this.pagination.offset + this.pagination.limit;
            if (nextOffset < this.pagination.total) {
                this.loadLogs(nextOffset);
            }
        },

        loadLogs: async function(targetOffset) {
            if (typeof targetOffset === 'number') {
                this.pagination.offset = targetOffset;
            }

            const tbody = document.getElementById('fbrLogTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="11" class="fbr-log-loading">
                            <i class="fas fa-spinner fa-spin"></i> Loading integration logs...
                        </td>
                    </tr>
                `;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || 1;

            const params = new URLSearchParams({
                action: 'get_logs',
                company_id: compId,
                date_from: this.getVal('flt_date_from'),
                date_to: this.getVal('flt_date_to'),
                erp_doc_no: this.getVal('flt_erp_doc_no'),
                fbr_invoice_no: this.getVal('flt_fbr_invoice_no'),
                document_type: this.getVal('flt_document_type'),
                operation_type: this.getVal('flt_operation_type'),
                status: this.getVal('flt_status'),
                http_status_code: this.getVal('flt_http_status_code'),
                limit: this.pagination.limit,
                offset: this.pagination.offset
            });

            try {
                const res = await fetch(`${this.apiBase}?${params.toString()}`);
                const data = await res.json();

                if (data.status === 'success') {
                    this.renderKPIs(data.summary || {});
                    this.renderLogs(data.logs || []);
                    this.renderPagination(data.pagination || {});
                } else {
                    if (tbody) {
                        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 25px; color:#ef4444;"><i class="fas fa-exclamation-circle"></i> ${data.message || 'Error loading logs.'}</td></tr>`;
                    }
                }
            } catch (err) {
                console.error('Error fetching logs:', err);
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 25px; color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Connection error: ${err.message}</td></tr>`;
                }
            }
        },

        renderKPIs: function(sum) {
            this.setText('kpi_total_logs', (sum.total_logs || 0).toLocaleString());
            this.setText('kpi_success_count', (sum.success_count || 0).toLocaleString());
            this.setText('kpi_failed_count', (sum.failed_count || 0).toLocaleString());
            this.setText('kpi_rejected_count', (sum.rejected_count || 0).toLocaleString());
            this.setText('kpi_pending_count', ((sum.pending_count || 0) + (sum.timeout_count || 0)).toLocaleString());
            this.setText('kpi_avg_latency', (sum.avg_latency_ms || 0) + ' ms');
        },

        renderLogs: function(logs) {
            const tbody = document.getElementById('fbrLogTableBody');
            if (!tbody) return;

            if (!logs || logs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="11" style="text-align: center; padding: 35px; color: #64748b;">
                            <i class="fas fa-clipboard-list" style="font-size: 24px; opacity: 0.3; display: block; margin-bottom: 8px;"></i>
                            No integration log records found matching your filter criteria.
                        </td>
                    </tr>
                `;
                return;
            }

            let html = '';
            logs.forEach(log => {
                const statusBadge = this.getStatusBadge(log.status);
                const docPill = this.getDocPill(log.document_type);
                const httpBadge = this.getHttpBadge(log.http_status_code);
                const retryBtn = (log.status === 'Failed' || log.status === 'Timeout')
                    ? `<button type="button" class="fbr-row-btn fbr-row-btn-retry" title="Retry Operation" onclick="DigitalInvoiceLogModule.retryLog(${log.id}, event)"><i class="fas fa-redo"></i> Retry</button>`
                    : '';
                const checkBtn = `<button type="button" class="fbr-row-btn fbr-row-btn-check" title="Verify Status" onclick="DigitalInvoiceLogModule.checkStatus(${log.id}, event)"><i class="fas fa-sync"></i></button>`;

                const dateFormatted = log.created_at ? log.created_at.substring(0, 16) : '--';

                html += `
                    <tr onclick="DigitalInvoiceLogModule.viewDetails(${log.id})">
                        <td style="text-align: center; font-weight: 700; color: #475569;">#${log.id}</td>
                        <td style="color: #334155;"><i class="far fa-clock" style="opacity: 0.5; margin-right: 3px;"></i>${dateFormatted}</td>
                        <td>${docPill}</td>
                        <td style="font-weight: 700; color: #0284c7;">${this.escapeHtml(log.erp_doc_no || '--')}</td>
                        <td style="color: #334155; font-weight: 600;">${this.escapeHtml(log.operation_type || '--')}</td>
                        <td style="text-align: center;">${statusBadge}</td>
                        <td style="text-align: center;">${httpBadge}</td>
                        <td style="text-align: center; font-family: monospace; font-weight: 700;">${this.escapeHtml(log.fbr_response_code || '--')}</td>
                        <td title="${this.escapeHtml(log.response_message || '')}" style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; color: #475569;">
                            ${this.escapeHtml(log.response_message || '--')}
                        </td>
                        <td style="text-align: right; font-family: monospace; font-weight: 600;">${log.processing_time_ms ? log.processing_time_ms + ' ms' : '--'}</td>
                        <td style="text-align: center;" onclick="event.stopPropagation()">
                            <button type="button" class="fbr-row-btn fbr-row-btn-view" title="View Details" onclick="DigitalInvoiceLogModule.viewDetails(${log.id})"><i class="fas fa-eye"></i> Details</button>
                            ${checkBtn}
                            ${retryBtn}
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        },

        renderPagination: function(p) {
            this.pagination.total = p.total || 0;
            this.pagination.limit = p.limit || 50;
            this.pagination.offset = p.offset || 0;

            const start = this.pagination.total > 0 ? this.pagination.offset + 1 : 0;
            const end = Math.min(this.pagination.total, this.pagination.offset + this.pagination.limit);
            const curPage = Math.floor(this.pagination.offset / this.pagination.limit) + 1;

            this.setText('pg_start', start.toLocaleString());
            this.setText('pg_end', end.toLocaleString());
            this.setText('pg_total', this.pagination.total.toLocaleString());
            this.setText('pg_current_page', curPage);

            const prevBtn = document.getElementById('btn_pg_prev');
            const nextBtn = document.getElementById('btn_pg_next');
            if (prevBtn) prevBtn.disabled = (this.pagination.offset <= 0);
            if (nextBtn) nextBtn.disabled = (end >= this.pagination.total);
        },

        getStatusBadge: function(status) {
            const s = (status || '').toLowerCase();
            if (s === 'success') {
                return `<span class="fbr-badge fbr-badge-success"><i class="fas fa-check"></i> Success</span>`;
            } else if (s === 'failed') {
                return `<span class="fbr-badge fbr-badge-failed"><i class="fas fa-times"></i> Failed</span>`;
            } else if (s === 'rejected') {
                return `<span class="fbr-badge fbr-badge-rejected"><i class="fas fa-exclamation-triangle"></i> Rejected</span>`;
            } else if (s === 'timeout') {
                return `<span class="fbr-badge fbr-badge-timeout"><i class="fas fa-hourglass-end"></i> Timeout</span>`;
            } else {
                return `<span class="fbr-badge fbr-badge-pending"><i class="fas fa-clock"></i> ${status || 'Pending'}</span>`;
            }
        },

        getDocPill: function(docType) {
            const dt = (docType || '').toLowerCase();
            if (dt.includes('credit')) {
                return `<span class="fbr-doc-pill pill-credit"><i class="fas fa-arrow-down"></i> Credit Note</span>`;
            } else if (dt.includes('debit')) {
                return `<span class="fbr-doc-pill pill-debit"><i class="fas fa-arrow-up"></i> Debit Note</span>`;
            } else if (dt.includes('cancel')) {
                return `<span class="fbr-doc-pill pill-cancel"><i class="fas fa-ban"></i> Cancellation</span>`;
            } else {
                return `<span class="fbr-doc-pill pill-invoice"><i class="fas fa-file-invoice"></i> Sales Invoice</span>`;
            }
        },

        getHttpBadge: function(code) {
            const c = parseInt(code) || 0;
            if (c >= 200 && c < 300) {
                return `<span style="font-weight: 700; color: #15803d;">${c}</span>`;
            } else if (c >= 400 && c < 500) {
                return `<span style="font-weight: 700; color: #b45309;">${c}</span>`;
            } else if (c >= 500) {
                return `<span style="font-weight: 700; color: #b91c1c;">${c}</span>`;
            }
            return `<span style="color: #64748b;">${c || '--'}</span>`;
        },

        viewDetails: async function(logId) {
            const modal = document.getElementById('fbrLogDetailModal');
            if (!modal) return;

            modal.style.display = 'flex';
            this.setText('dtl_log_id', logId);

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || 1;

            try {
                const res = await fetch(`${this.apiBase}?action=get_log_detail&id=${logId}&company_id=${compId}`);
                const data = await res.json();

                if (data.status === 'success' && data.log) {
                    this.currentDetailLog = data.log;
                    const log = data.log;

                    this.setText('dtl_id', '#' + log.id);
                    this.setText('dtl_doc_type', log.document_type || 'Sales Invoice');
                    this.setText('dtl_erp_doc_no', log.erp_doc_no || '--');
                    this.setText('dtl_erp_doc_id', log.erp_doc_id || '--');
                    this.setText('dtl_fbr_invoice_no', log.fbr_invoice_no || 'Not Assigned / Pending');
                    this.setText('dtl_operation_type', log.operation_type || '--');
                    this.setText('dtl_attempt_number', log.attempt_number || '1');
                    this.setText('dtl_retry_count', log.retry_count || '0');
                    this.setText('dtl_req_time', log.request_timestamp || log.created_at || '--');
                    this.setText('dtl_resp_time', log.response_timestamp || log.created_at || '--');

                    const badgeElem = document.getElementById('dtl_status_badge');
                    if (badgeElem) badgeElem.innerHTML = this.getStatusBadge(log.status);

                    this.setText('dtl_api_endpoint', log.api_endpoint || '--');
                    this.setText('dtl_http_method', log.http_method || 'POST');
                    this.setText('dtl_http_status_code', log.http_status_code || '--');
                    this.setText('dtl_fbr_response_code', log.fbr_response_code || '--');
                    this.setText('dtl_proc_time', log.processing_time_ms ? log.processing_time_ms + ' ms' : '--');
                    this.setText('dtl_response_message', log.response_message || '--');

                    // Request Payload Viewer
                    const reqElem = document.getElementById('dtl_req_payload');
                    if (reqElem) {
                        reqElem.textContent = this.formatJson(log.request_payload_sanitized || log.request_payload);
                    }

                    // Response Payload Viewer
                    const respElem = document.getElementById('dtl_resp_payload');
                    if (respElem) {
                        respElem.textContent = this.formatJson(log.response_payload_sanitized || log.response_payload);
                    }

                    // Validation Errors
                    const vBox = document.getElementById('dtl_validation_box');
                    const vErr = document.getElementById('dtl_validation_errors');
                    if (log.validation_errors) {
                        if (vBox && vErr) {
                            vBox.style.display = 'block';
                            vErr.innerHTML = `<pre style="margin:0; font-family: monospace;">${this.escapeHtml(log.validation_errors)}</pre>`;
                        }
                    } else {
                        if (vBox) vBox.style.display = 'none';
                    }

                    // Render Attempt History
                    this.renderAttemptHistory(data.history || []);

                    // Configure Footer Action Buttons
                    const btnRetry = document.getElementById('btn_modal_retry');
                    if (btnRetry) {
                        if (log.status === 'Failed' || log.status === 'Timeout' || log.status === 'Rejected') {
                            btnRetry.style.display = 'inline-flex';
                        } else {
                            btnRetry.style.display = 'none';
                        }
                    }
                } else {
                    alert(data.message || 'Error loading log details.');
                }
            } catch (err) {
                console.error('Error fetching log detail:', err);
                alert('Connection error: ' + err.message);
            }
        },

        renderAttemptHistory: function(history) {
            const tbody = document.getElementById('dtl_history_tbody');
            if (!tbody) return;

            if (!history || history.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b;">No attempt history available.</td></tr>`;
                return;
            }

            let html = '';
            history.forEach(h => {
                const isCurrent = (this.currentDetailLog && this.currentDetailLog.id === h.id);
                html += `
                    <tr style="${isCurrent ? 'background: #e0f2fe; font-weight: 700;' : ''}">
                        <td style="color: #475569;">#${h.id}</td>
                        <td>Attempt ${h.attempt_number || 1} ${isCurrent ? '<small style="color: #0284c7;">(Current)</small>' : ''}</td>
                        <td>${this.escapeHtml(h.operation_type || '--')}</td>
                        <td style="text-align: center;">${h.http_status_code || '--'}</td>
                        <td style="text-align: center; font-family: monospace;">${this.escapeHtml(h.fbr_response_code || '--')}</td>
                        <td style="text-align: center;">${this.getStatusBadge(h.status)}</td>
                        <td style="text-align: right; font-family: monospace;">${h.processing_time_ms ? h.processing_time_ms + ' ms' : '--'}</td>
                        <td style="color: #64748b;">${h.created_at ? h.created_at.substring(0, 16) : '--'}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        },

        formatJson: function(data) {
            if (!data) return '// No payload content recorded.';
            if (typeof data === 'object') {
                return JSON.stringify(data, null, 2);
            }
            try {
                const parsed = JSON.parse(data);
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                return String(data);
            }
        },

        closeDetailModal: function() {
            const modal = document.getElementById('fbrLogDetailModal');
            if (modal) modal.style.display = 'none';
            this.currentDetailLog = null;
        },

        copyToClipboard: function(elemId) {
            const el = document.getElementById(elemId);
            if (!el) return;
            const text = el.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                alert('Payload copied to clipboard successfully!');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                alert('Payload copied to clipboard successfully!');
            });
        },

        retryCurrent: function() {
            if (!this.currentDetailLog) return;
            this.retryLog(this.currentDetailLog.id);
        },

        checkStatusCurrent: function() {
            if (!this.currentDetailLog) return;
            this.checkStatus(this.currentDetailLog.id);
        },

        retryLog: async function(logId, ev) {
            if (ev) ev.stopPropagation();

            if (!confirm(`Are you sure you want to retry this failed FBR operation (Log #${logId})?\n\nIdempotency check will verify the document is not already accepted on FBR before sending.`)) {
                return;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || 1;

            try {
                const fd = new FormData();
                fd.append('action', 'retry_operation');
                fd.append('company_id', compId);
                fd.append('log_id', logId);

                const res = await fetch(this.apiBase, {
                    method: 'POST',
                    body: fd
                });
                const data = await res.json();

                if (data.status === 'success') {
                    alert(`Retry Successful!\n\n${data.message}\nNew Log ID: #${data.new_log_id}`);
                    this.loadLogs();
                    if (this.currentDetailLog && this.currentDetailLog.id === logId) {
                        this.viewDetails(data.new_log_id || logId);
                    }
                } else {
                    alert(`Retry Notice: ${data.message}`);
                    this.loadLogs();
                }
            } catch (err) {
                console.error('Retry error:', err);
                alert('Connection error during retry: ' + err.message);
            }
        },

        checkStatus: async function(logId, ev) {
            if (ev) ev.stopPropagation();

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || 1;

            try {
                const fd = new FormData();
                fd.append('action', 'check_status');
                fd.append('company_id', compId);
                fd.append('log_id', logId);

                const res = await fetch(this.apiBase, {
                    method: 'POST',
                    body: fd
                });
                const data = await res.json();

                if (data.status === 'success') {
                    alert(`Status Verification Result:\n\n${data.message}`);
                    this.loadLogs();
                    if (this.currentDetailLog && this.currentDetailLog.id === logId) {
                        this.viewDetails(logId);
                    }
                } else {
                    alert(`Verification Notice: ${data.message}`);
                }
            } catch (err) {
                console.error('Check status error:', err);
                alert('Connection error checking status: ' + err.message);
            }
        },

        exportExcel: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || 1;

            const params = new URLSearchParams({
                action: 'export_csv',
                company_id: compId,
                date_from: this.getVal('flt_date_from'),
                date_to: this.getVal('flt_date_to'),
                status: this.getVal('flt_status'),
                document_type: this.getVal('flt_document_type')
            });

            window.location.href = `${this.apiBase}?${params.toString()}`;
        },

        getVal: function(id) {
            const container = document.getElementById('digitalInvoiceLogContainer');
            const el = container ? (container.querySelector('#' + id) || document.getElementById(id)) : document.getElementById(id);
            return el ? el.value.trim() : '';
        },

        setVal: function(id, val) {
            const container = document.getElementById('digitalInvoiceLogContainer');
            const el = container ? (container.querySelector('#' + id) || document.getElementById(id)) : document.getElementById(id);
            if (el) el.value = (val !== null && val !== undefined) ? val : '';
        },

        setText: function(id, val) {
            const container = document.getElementById('digitalInvoiceLogContainer');
            const el = container ? (container.querySelector('#' + id) || document.getElementById(id)) : document.getElementById(id);
            if (el) el.innerText = (val !== null && val !== undefined) ? val : '';
        },

        escapeHtml: function(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    window.DigitalInvoiceLogModule = DigitalInvoiceLogModule;
})();
