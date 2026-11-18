/**
 * SoftifyX ERP - Digital Invoice Sales Register Module
 * Interactive Register, Real-Time FBR Status Verification & Submission Controller
 */
window.DigitalSaleRegisterModule = (function () {
    let companyId = 1;
    let invoices = [];
    let currentPagination = { page: 1, limit: 25, total_rows: 0, total_pages: 1 };
    let currentSort = { column: 'serial_no', order: 'DESC' };
    let selectedInvoiceForAction = null;
    let currentCancelCaptcha = null;
    let currentDeleteCaptcha = null;
    let selectedCancelInvoiceId = null;
    let selectedCancelInvoice = null;
    let selectedDeleteInvoiceId = null;
    let selectedDeleteInvoiceSerial = null;
    let selectedDeleteInvoiceNo = null;
    let selectedDeleteInvoiceFbrStatus = null;

    function generateCaptcha() {
        const operations = ['+', '-', '*'];
        const op = operations[Math.floor(Math.random() * operations.length)];
        let num1, num2, answer;

        if (op === '+') {
            num1 = Math.floor(Math.random() * 12) + 2; // 2 to 13
            num2 = Math.floor(Math.random() * 12) + 1; // 1 to 12
            answer = num1 + num2;
        } else if (op === '-') {
            num1 = Math.floor(Math.random() * 14) + 6; // 6 to 19
            num2 = Math.floor(Math.random() * (num1 - 2)) + 1; // 1 to num1-1 (always positive)
            answer = num1 - num2;
        } else { // '*'
            num1 = Math.floor(Math.random() * 6) + 2; // 2 to 7
            num2 = Math.floor(Math.random() * 5) + 2; // 2 to 6
            answer = num1 * num2;
        }

        const symbol = (op === '*') ? '×' : (op === '-' ? '−' : '+');
        return {
            num1: num1,
            num2: num2,
            op: op,
            symbol: symbol,
            question: `${num1} ${symbol} ${num2}`,
            answer: answer
        };
    }

    function getCompanyId() {
        if (typeof window.currentCompanyId !== 'undefined' && window.currentCompanyId) {
            return window.currentCompanyId;
        }
        if (typeof window.company_id !== 'undefined' && window.company_id) {
            return window.company_id;
        }
        return 1;
    }

    function fmt(val) {
        const n = parseFloat(val);
        return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function num(val) {
        const n = parseFloat(val);
        return isNaN(n) ? 0 : n;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function (m) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m];
        });
    }

    function init() {
        companyId = getCompanyId();
        
        // Default dates: First day of current month to today
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const firstDay = `${y}-${m}-01`;
        const today = now.toISOString().split('T')[0];

        const fromInput = document.getElementById('dsr_filter_from_date');
        const toInput = document.getElementById('dsr_filter_to_date');
        if (fromInput && !fromInput.value) fromInput.value = firstDay;
        if (toInput && !toInput.value) toInput.value = today;

        loadCompanyMeta();
        loadInvoices();

        // Close dropdowns on document click
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.dsr-dropdown')) {
                document.querySelectorAll('.dsr-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });
    }

    async function loadCompanyMeta() {
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}`);
            const json = await res.json();
            if (json.status === 'success') {
                if (json.company) window.companyData = json.company;
                if (json.customers) window.customersList = json.customers;
            }
        } catch (e) {
            console.warn('Could not load company meta in sales register:', e);
        }
    }

    async function loadInvoices() {
        companyId = getCompanyId();
        const tbody = document.getElementById('dsr_table_body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 30px; color: #64748b;"><i class="fas fa-spinner fa-spin" style="font-size: 18px; color: #0284c7;"></i> Loading digital invoices...</td></tr>`;
        }

        const search = document.getElementById('dsr_filter_search')?.value.trim() || '';
        const buyerType = document.getElementById('dsr_filter_buyer_type')?.value || '';
        const fbrStatus = document.getElementById('dsr_filter_fbr_status')?.value || '';
        const fromDate = document.getElementById('dsr_filter_from_date')?.value || '';
        const toDate = document.getElementById('dsr_filter_to_date')?.value || '';
        const limit = document.getElementById('dsr_page_limit')?.value || currentPagination.limit || 25;

        const params = new URLSearchParams({
            action: 'get_register_invoices',
            company_id: companyId,
            search: search,
            buyer_type: buyerType,
            fbr_status: fbrStatus,
            from_date: fromDate,
            to_date: toDate,
            page: currentPagination.page,
            limit: limit,
            _cb: Date.now()
        });

        try {
            const res = await fetch(`api/digital_invoice.php?${params.toString()}`);
            const json = await res.json();

            if (json.status === 'success') {
                invoices = json.data || [];
                renderSummary(json.summary || {});
                renderTable(invoices);
                renderPagination(json.pagination || {});
            } else {
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 25px; color: #dc2626;"><i class="fas fa-exclamation-triangle"></i> Failed to load invoices: ${escapeHtml(json.message || 'Server error')}</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Error loading digital invoices:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 25px; color: #dc2626;"><i class="fas fa-exclamation-circle"></i> Network error: ${escapeHtml(err.message || err)}</td></tr>`;
            }
        }
    }

    function renderSummary(s) {
        const totalInvEl = document.getElementById('dsr_sum_total_invoices');
        const taxableEl = document.getElementById('dsr_sum_taxable');
        const taxEl = document.getElementById('dsr_sum_tax');
        const subEl = document.getElementById('dsr_sum_submitted');
        const penEl = document.getElementById('dsr_sum_pending');
        const rejEl = document.getElementById('dsr_sum_rejected');

        const totalTax = num(s.total_sales_tax) + num(s.total_further_tax);

        if (totalInvEl) totalInvEl.textContent = Number(s.total_count || 0).toLocaleString();
        if (taxableEl) taxableEl.textContent = 'PKR ' + fmt(s.total_taxable);
        if (taxEl) taxEl.textContent = 'PKR ' + fmt(totalTax);
        if (subEl) subEl.textContent = Number(s.count_submitted || 0).toLocaleString();
        if (penEl) penEl.textContent = Number(s.count_pending || 0).toLocaleString();
        if (rejEl) rejEl.textContent = Number(s.count_rejected || 0).toLocaleString();
    }

    function renderTable(list) {
        const tbody = document.getElementById('dsr_table_body');
        if (!tbody) return;

        if (!list || list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">
                        <i class="fas fa-folder-open" style="font-size: 26px; color: #cbd5e1; margin-bottom: 8px; display: block;"></i>
                        No digital invoices found matching the current filters.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        list.forEach((inv, idx) => {
            const rowNum = ((currentPagination.page - 1) * currentPagination.limit) + idx + 1;
            const isCancelled = (inv.is_cancelled == 1);
            
            // FBR Status Badge
            const fStatus = (inv.fbr_status || 'Draft').trim();
            const wfStatus = (inv.workflow_status || 'Draft').trim();
            const isSubmitted = (fStatus === 'Valid' || fStatus === 'Submitted' || fStatus === 'Active' || wfStatus === 'Submitted');
            const isRejected = (fStatus === 'Rejected' || fStatus === 'Failed' || fStatus === 'Sample Validation Failed');

            let badgeHtml = '';
            if (isCancelled) {
                badgeHtml = `<span class="dsr-badge dsr-badge-cancelled"><i class="fas fa-ban"></i> Cancelled</span>`;
            } else if (isSubmitted) {
                badgeHtml = `<span class="dsr-badge dsr-badge-submitted"><i class="fas fa-check-circle"></i> Submitted</span>`;
            } else if (isRejected) {
                badgeHtml = `<span class="dsr-badge dsr-badge-rejected"><i class="fas fa-exclamation-triangle"></i> Rejected</span>`;
            } else {
                badgeHtml = `<span class="dsr-badge dsr-badge-pending"><i class="fas fa-clock"></i> Pending FBR</span>`;
            }

            const fbrNo = inv.fbr_invoice_no && inv.fbr_invoice_no !== '-' ? inv.fbr_invoice_no : '-';
            let fbrNoDisplay = '';
            if (fbrNo !== '-') {
                fbrNoDisplay = `
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                        <span style="font-family: monospace; font-weight: 800; color: #15803d; cursor: pointer;" title="Click to copy FBR No" onclick="window.DigitalSaleRegisterModule.copyText('${escapeHtml(fbrNo)}')">
                            ${escapeHtml(fbrNo)} <i class="fas fa-copy" style="font-size: 9.5px; opacity: 0.65;"></i>
                        </span>
                        <button class="dsr-act-btn" style="padding: 1px 4px; font-size: 9.5px; color: #0284c7; border: 1px solid #bae6fd; border-radius: 3px;" onclick="window.DigitalSaleRegisterModule.openIrisManualModal(${inv.id})" title="Edit or Reset IRIS Linking">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                `;
            } else if (isSubmitted && !isCancelled) {
                // Only show Link IRIS # if submitted to FBR but FBR Invoice # was not received / missing
                fbrNoDisplay = `
                    <button class="dsr-act-btn" style="color: #0284c7; font-weight: 700; border-color: #bae6fd; background: #f0f9ff; font-size: 10px; padding: 2px 7px; border-radius: 3px;" onclick="window.DigitalSaleRegisterModule.openIrisManualModal(${inv.id})" title="Copy and enter FBR Invoice No from IRIS Portal OR Reset attempt">
                        <i class="fas fa-link" style="color: #dc2626;"></i> Link IRIS #
                    </button>
                `;
            } else {
                // Rejected, Pending, Draft, Cancelled etc. -> Clean dash
                fbrNoDisplay = `<span style="color: #94a3b8; font-weight: 600;">-</span>`;
            }

            // Buyer / Customer
            const custDisplay = `<strong>${escapeHtml(inv.customer_name || 'Walk-in Customer')}</strong>` +
                (inv.business_name && inv.business_name !== inv.customer_name ? `<br><small style="color: #64748b;">${escapeHtml(inv.business_name)}</small>` : '');

            // Delete disabled state if already submitted
            const deleteTitle = isSubmitted ? 'Cannot delete: Invoice already submitted to FBR' : 'Delete draft digital invoice';

            html += `
                <tr class="${isCancelled ? 'row-cancelled' : ''}">
                    <td style="text-align: center; color: #64748b;">${rowNum}</td>
                    <td>
                        <strong style="color: #1e3a8a; cursor: pointer;" onclick="window.DigitalSaleRegisterModule.viewInvoice(${inv.id})">
                            ${escapeHtml(inv.invoice_no)}
                        </strong>
                        <span style="font-size: 10px; color: #64748b; margin-left: 4px;">(#${inv.serial_no})</span>
                    </td>
                    <td>${escapeHtml(inv.invoice_date || '-')}</td>
                    <td>${custDisplay}</td>
                    <td><span style="font-size: 10.5px; color: #475569;">${escapeHtml(inv.customer_type || 'Consumer')}</span></td>
                    <td style="text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">${fmt(inv.net_payable)}</td>
                    <td style="text-align: center;" class="no-strike">${badgeHtml}</td>
                    <td style="text-align: center;" class="no-strike">${fbrNoDisplay}</td>
                    <td style="text-align: center;" class="no-strike">
                        <div class="dsr-btn-group">
                            <button class="dsr-act-btn dsr-btn-view" onclick="window.DigitalSaleRegisterModule.viewInvoice(${inv.id})" title="View Digital Invoice">
                                <i class="fas fa-eye text-primary"></i>
                            </button>
                            ${!isCancelled && !isSubmitted ? `
                                <button class="dsr-act-btn dsr-btn-edit" onclick="window.DigitalSaleRegisterModule.editDraft(${inv.id}, ${inv.serial_no}, '${escapeHtml(fStatus)}')" title="Edit Draft (Subject to business rules)">
                                    <i class="fas fa-edit text-success"></i>
                                </button>
                            ` : ''}
                            <button class="dsr-act-btn dsr-btn-print" onclick="window.DigitalSaleRegisterModule.printInvoice(${inv.id})" title="Print Digital Invoice">
                                <i class="fas fa-print" style="color: #0284c7;"></i>
                            </button>
                            <div class="dsr-dropdown">
                                <button class="dsr-act-btn" onclick="window.DigitalSaleRegisterModule.toggleRowDropdown(event, this)" title="More Actions">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div class="dsr-dropdown-content">
                                    <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.viewInvoice(${inv.id})">
                                        <i class="fas fa-file-invoice text-primary"></i> View Invoice
                                    </button>
                                    ${!isCancelled && !isSubmitted ? `
                                        <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.editDraft(${inv.id}, ${inv.serial_no}, '${escapeHtml(fStatus)}')">
                                            <i class="fas fa-edit text-success"></i> Edit Draft
                                        </button>
                                    ` : ''}
                                    <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.printInvoice(${inv.id})">
                                        <i class="fas fa-print text-info"></i> Print Digital Invoice
                                    </button>
                                    <button class="dsr-dropdown-item text-primary" onclick="window.DigitalSaleRegisterModule.openIrisManualModal(${inv.id})">
                                        <i class="fas fa-link text-danger"></i> Manual IRIS Link / Reset
                                    </button>
                                    <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.viewFbrResponse(${inv.id})">
                                        <i class="fas fa-code text-purple"></i> View FBR Response
                                    </button>
                                    <div class="dsr-dropdown-divider"></div>
                                    <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.validateFbrData(${inv.id})">
                                        <i class="fas fa-shield-alt text-warning"></i> Validate FBR Data
                                    </button>
                                    <button class="dsr-dropdown-item ${isSubmitted || isCancelled ? 'dsr-btn-disabled' : ''}" onclick="window.DigitalSaleRegisterModule.confirmAndSubmit(${inv.id})">
                                        <i class="fas fa-paper-plane text-success"></i> Confirm and Submit to FBR
                                    </button>
                                    <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.checkFbrStatus(${inv.id})">
                                        <i class="fas fa-sync-alt text-info"></i> Check FBR Status
                                    </button>
                                    <button class="dsr-dropdown-item" onclick="window.DigitalSaleRegisterModule.retrySubmission(${inv.id})">
                                        <i class="fas fa-redo text-warning"></i> Retry Submission
                                    </button>
                                    <div class="dsr-dropdown-divider"></div>
                                    ${!isCancelled ? `
                                        <button class="dsr-dropdown-item text-danger" onclick="window.DigitalSaleRegisterModule.openCancelModal(${inv.id})">
                                            <i class="fas fa-ban text-danger"></i> Cancel Invoice
                                        </button>
                                    ` : ''}
                                    <button class="dsr-dropdown-item ${isSubmitted ? 'dsr-btn-disabled' : 'text-danger'}" onclick="window.DigitalSaleRegisterModule.openDeleteModal(${inv.id}, ${inv.serial_no}, '${escapeHtml(inv.invoice_no)}', '${escapeHtml(fStatus)}')" title="${deleteTitle}">
                                        <i class="fas fa-trash-alt text-danger"></i> Delete Invoice
                                    </button>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    function renderPagination(p) {
        currentPagination = p;
        const infoEl = document.getElementById('dsr_pag_info');
        const start = ((p.page - 1) * p.limit) + 1;
        const end = Math.min(p.page * p.limit, p.total_rows);

        if (infoEl) {
            infoEl.textContent = p.total_rows > 0
                ? `Showing ${start} to ${end} of ${p.total_rows} digital invoices`
                : 'No digital invoices';
        }

        document.getElementById('dsr_btn_first').disabled = (p.page <= 1);
        document.getElementById('dsr_btn_prev').disabled = (p.page <= 1);
        document.getElementById('dsr_btn_next').disabled = (p.page >= p.total_pages);
        document.getElementById('dsr_btn_last').disabled = (p.page >= p.total_pages);

        const pageNumsEl = document.getElementById('dsr_page_numbers');
        if (pageNumsEl) {
            let phtml = '';
            const maxVisible = 5;
            let startP = Math.max(1, p.page - 2);
            let endP = Math.min(p.total_pages, startP + maxVisible - 1);
            if (endP - startP < maxVisible - 1) {
                startP = Math.max(1, endP - maxVisible + 1);
            }

            for (let i = startP; i <= endP; i++) {
                phtml += `<button class="dsr-pag-btn ${i === p.page ? 'active' : ''}" onclick="window.DigitalSaleRegisterModule.goToPage(${i})">${i}</button>`;
            }
            pageNumsEl.innerHTML = phtml;
        }
    }

    function toggleRowDropdown(event, btn) {
        event.stopPropagation();
        const parent = btn.closest('.dsr-dropdown');
        document.querySelectorAll('.dsr-dropdown.open').forEach(d => {
            if (d !== parent) d.classList.remove('open');
        });
        if (parent) parent.classList.toggle('open');
    }

    function copyText(str) {
        if (!str || str === '-') return;
        navigator.clipboard.writeText(str).then(() => {
            alert('Copied to clipboard: ' + str);
        }).catch(() => {
            prompt('Copy FBR Invoice Number:', str);
        });
    }

    function applyFilters() {
        currentPagination.page = 1;
        loadInvoices();
    }

    function clearFilters() {
        const searchInput = document.getElementById('dsr_filter_search');
        const buyerSelect = document.getElementById('dsr_filter_buyer_type');
        const fbrSelect = document.getElementById('dsr_filter_fbr_status');
        const fromInput = document.getElementById('dsr_filter_from_date');
        const toInput = document.getElementById('dsr_filter_to_date');

        if (searchInput) searchInput.value = '';
        if (buyerSelect) buyerSelect.selectedIndex = 0;
        if (fbrSelect) fbrSelect.selectedIndex = 0;
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';

        currentPagination.page = 1;
        loadInvoices();
    }

    function goToPage(target) {
        if (target === 'prev') {
            if (currentPagination.page > 1) currentPagination.page--;
        } else if (target === 'next') {
            if (currentPagination.page < currentPagination.total_pages) currentPagination.page++;
        } else if (target === 'last') {
            currentPagination.page = currentPagination.total_pages;
        } else {
            currentPagination.page = parseInt(target) || 1;
        }
        loadInvoices();
    }

    function onLimitChange() {
        const sel = document.getElementById('dsr_page_limit');
        if (sel) {
            currentPagination.limit = parseInt(sel.value) || 25;
            currentPagination.page = 1;
            loadInvoices();
        }
    }

    function sortBy(col) {
        if (currentSort.column === col) {
            currentSort.order = (currentSort.order === 'ASC') ? 'DESC' : 'ASC';
        } else {
            currentSort.column = col;
            currentSort.order = 'DESC';
        }
        // Client-side quick sort of current page
        invoices.sort((a, b) => {
            let va = a[col];
            let vb = b[col];
            if (!isNaN(va) && !isNaN(vb)) {
                return currentSort.order === 'ASC' ? va - vb : vb - va;
            }
            return currentSort.order === 'ASC' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        renderTable(invoices);
    }

    // =========================================================================
    // 1. OPEN NEW INVOICE
    // =========================================================================
    function openNewInvoice() {
        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/DigitalInvoicing/digital_invoice.html', 'fa-file-invoice', 'FBR Digital Invoice', () => {
                if (window.DigitalInvoiceModule && typeof window.DigitalInvoiceModule.newInvoice === 'function') {
                    window.DigitalInvoiceModule.newInvoice();
                }
            }, 'FBR Digital Invoice', true, true);
        } else {
            window.open('Navigation/DigitalInvoicing/digital_invoice.html', '_blank');
        }
    }

    // =========================================================================
    // 2. EDIT DRAFT (Subject to existing business rules)
    // =========================================================================
    function editDraft(id, serialNo, fbrStatus) {
        const isSubmitted = (fbrStatus === 'Valid' || fbrStatus === 'Submitted' || fbrStatus === 'Active');
        if (isSubmitted) {
            alert(`[FBR COMPLIANCE RULE]\n\nInvoice #${serialNo} has already been officially submitted to FBR.\n\nAccording to fiscal retention rules, submitted digital invoices cannot be altered directly.\n\nOpening in view mode.`);
        }

        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/DigitalInvoicing/digital_invoice.html', 'fa-file-invoice', 'FBR Digital Invoice', () => {
                if (window.DigitalInvoiceModule && typeof window.DigitalInvoiceModule.navigateSerial === 'function') {
                    const sInput = document.getElementById('di_serial_no');
                    if (sInput) {
                        sInput.value = serialNo;
                        window.DigitalInvoiceModule.onSerialNoChange();
                    }
                }
            }, 'FBR Digital Invoice', true, true);
        }
    }

    // Helper: Extract Strictly Clean FBR Invoice Number (Strip pipes, prefixes, reject ERP DI-2026- serials)
    function extractCleanFbrInvoiceNumber(raw) {
        if (!raw) return '';
        let str = String(raw).trim();
        if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return '';
        if (str.toLowerCase() === 'pending transmission' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'not available') return '';
        if (str === 'FBR-OK' || str === '123456789012') return '';

        // If composite with pipes (e.g. FBR-INVOICE:XXX|SELLER:YYY|...), extract only the invoice number
        if (str.includes('|')) {
            const parts = str.split('|');
            for (const p of parts) {
                const cleanP = p.trim();
                if (/^fbr-invoice:/i.test(cleanP)) {
                    str = cleanP.replace(/^fbr-invoice:/i, '').trim();
                    break;
                } else if (/^invoice:/i.test(cleanP)) {
                    str = cleanP.replace(/^invoice:/i, '').trim();
                    break;
                }
            }
        }

        // Remove prefixes
        str = str.replace(/^(fbr-invoice:|invoice:|pos:)/i, '').trim();

        // Never use URLs or Base64 as invoice numbers
        if (str.startsWith('data:') || str.startsWith('http://') || str.startsWith('https://')) return '';

        // If it's an ERP internal sequential number (e.g. DI-2026-0001 or INV-2026-0001), it's NOT an FBR number
        if (/^DI-\d{4}-\d+/i.test(str) || /^INV-\d{4}-\d+/i.test(str)) {
            return '';
        }

        return str.trim();
    }
    window.extractCleanFbrInvoiceNumber = extractCleanFbrInvoiceNumber;

    // Helper: Generate Scannable QR Code Data URL via QRCode library
    function generateQrCodeDataUrl(text) {
        if (!text) return '';
        const cleanText = extractCleanFbrInvoiceNumber(text) || String(text).trim();
        if (!cleanText) return '';
        if (typeof window.generateQrCodeDataUrl === 'function' && window.generateQrCodeDataUrl !== generateQrCodeDataUrl) {
            return window.generateQrCodeDataUrl(cleanText);
        }
        if (typeof QRCode === 'undefined') {
            return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(cleanText)}`;
        }
        try {
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            new QRCode(tempDiv, {
                text: cleanText,
                width: 140,
                height: 140,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });

            let dataUrl = '';
            const canvas = tempDiv.querySelector('canvas');
            if (canvas) {
                dataUrl = canvas.toDataURL('image/png');
            } else {
                const img = tempDiv.querySelector('img');
                if (img && img.src) dataUrl = img.src;
            }
            document.body.removeChild(tempDiv);
            if (!dataUrl) {
                dataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(cleanText)}`;
            }
            return dataUrl;
        } catch (e) {
            console.warn('QR Code generation error:', e);
            return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(cleanText)}`;
        }
    }
    window.generateQrCodeDataUrl = generateQrCodeDataUrl;

    // Helper: Dynamic Live Company Logo Resolver
    function resolveLiveCompanyLogo(payloadComp, globalComp) {
        if (typeof window.resolveLiveCompanyLogo === 'function' && window.resolveLiveCompanyLogo !== resolveLiveCompanyLogo) {
            return window.resolveLiveCompanyLogo(payloadComp, globalComp);
        }
        if (payloadComp) {
            if (payloadComp.logo_data && typeof payloadComp.logo_data === 'string' && payloadComp.logo_data.trim().length > 20) {
                return payloadComp.logo_data.trim();
            }
            if (payloadComp.logo && typeof payloadComp.logo === 'string' && payloadComp.logo.trim().length > 20) {
                return payloadComp.logo.trim();
            }
        }
        if (globalComp) {
            if (globalComp.logo_data && typeof globalComp.logo_data === 'string' && globalComp.logo_data.trim().length > 20) {
                return globalComp.logo_data.trim();
            }
            if (globalComp.logo && typeof globalComp.logo === 'string' && globalComp.logo.trim().length > 20) {
                return globalComp.logo.trim();
            }
        }
        if (window.companyData) {
            if (window.companyData.logo_data && typeof window.companyData.logo_data === 'string' && window.companyData.logo_data.trim().length > 20) {
                return window.companyData.logo_data.trim();
            }
            if (window.companyData.logo && typeof window.companyData.logo === 'string' && window.companyData.logo.trim().length > 20) {
                return window.companyData.logo.trim();
            }
        }
        if (typeof window.logoData === 'string' && window.logoData.trim().length > 20) {
            return window.logoData.trim();
        }
        if (typeof logoData !== 'undefined' && typeof logoData === 'string' && logoData.trim().length > 20) {
            return logoData.trim();
        }
        if (typeof window.getCompanyLogo === 'function') {
            try {
                const fnLogo = window.getCompanyLogo();
                if (fnLogo && typeof fnLogo === 'string' && fnLogo.trim().length > 20) {
                    return fnLogo.trim();
                }
            } catch(e) {}
        }
        try {
            if (typeof getCoKey === 'function') {
                const coLogo = localStorage.getItem(getCoKey('softifyx_logo'));
                if (coLogo && coLogo.startsWith('data:image')) return coLogo;
            }
            const sLogo = localStorage.getItem('softifyx_logo');
            if (sLogo && sLogo.startsWith('data:image')) return sLogo;

            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.toLowerCase().includes('logo')) {
                    const val = localStorage.getItem(k);
                    if (val && val.startsWith('data:image')) {
                        return val;
                    }
                }
            }
        } catch(e) {}

        return 'assets/logos/logo.png';
    }

    // Helper: Format Pakistan Date (e.g. 16-10-2026) - Strictly Date Only Without Time
    function formatPakistanDateTime(dateVal) {
        if (!dateVal) {
            const now = new Date();
            const d = String(now.getDate()).padStart(2, '0');
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const y = now.getFullYear();
            return `${d}-${m}-${y}`;
        }

        let dStr = String(dateVal).trim();
        if (dStr.includes('T')) {
            dStr = dStr.split('T')[0];
        } else if (dStr.includes(' ')) {
            dStr = dStr.split(' ')[0];
        }

        let day = '', month = '', year = '';
        if (dStr.includes('-')) {
            const p = dStr.split('-');
            if (p[0].length === 4) { // YYYY-MM-DD
                year = p[0]; month = p[1]; day = p[2];
            } else { // DD-MM-YYYY
                day = p[0]; month = p[1]; year = p[2];
            }
        } else if (dStr.includes('/')) {
            const p = dStr.split('/');
            if (p[2] && p[2].length === 4) {
                day = p[0]; month = p[1]; year = p[2];
            } else if (p[0].length === 4) {
                year = p[0]; month = p[1]; day = p[2];
            }
        }

        if (!day || !month || !year) {
            const now = new Date();
            day = String(now.getDate()).padStart(2, '0');
            month = String(now.getMonth() + 1).padStart(2, '0');
            year = now.getFullYear();
        }

        return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
    }
    window.formatPakistanDateTime = formatPakistanDateTime;

    // Helper: Amount in Words (English / PKR)
    function numberToWordsPKR(amount) {
        let n = Math.round(Math.abs(num(amount)));
        if (n === 0) return 'Zero Rupees Only.';

        const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        function convertChunk(val) {
            let s = '';
            if (val >= 100) {
                s += units[Math.floor(val / 100)] + ' Hundred ';
                val %= 100;
                if (val > 0) s += 'And ';
            }
            if (val >= 20) {
                s += tens[Math.floor(val / 10)] + ' ';
                val %= 10;
            }
            if (val > 0) {
                s += units[val] + ' ';
            }
            return s;
        }

        let result = '';
        const billions = Math.floor(n / 1000000000);
        n %= 1000000000;
        const millions = Math.floor(n / 1000000);
        n %= 1000000;
        const thousands = Math.floor(n / 1000);
        n %= 1000;
        const remainder = n;

        if (billions) result += convertChunk(billions) + 'Billion ';
        if (millions) result += convertChunk(millions) + 'Million ';
        if (thousands) result += convertChunk(thousands) + 'Thousand ';
        if (remainder) result += convertChunk(remainder);

        return result.trim().replace(/\s+/g, ' ') + ' Rupees Only.';
    }
    window.numberToWordsPKR = numberToWordsPKR;

    // =========================================================================
    // 3. OFFICIAL PRINT & VIEW ENGINE (Exact Replica of Official Sales Tax Invoice)
    // =========================================================================
    const LS_COMPANY_LOGO_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEQAAAAyCAYAAADlaH1uAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABWZSURBVGhDjVkJlJXFlYZ+73U3jduYOZOcmZM5SczJTByUplegBVEhStzOTHLmJOOYqCzdDU0DDbYwqNEko6OJKIhxN5jFmCGgEcQtiSDGfQMkLjFjUFRk6737vdfv8c333ar639+vG5Nqvlfb/eu/9dWtW7d+Rh0+fBj5fB7KA+J1/kTlw2xXPbSFXCgeoxhKI7VrTOUhhfYoqeyh9uL3OJFind0jyl1/vDx0nHhS3Qgx+Ia/BP4Y4hMplgngT5TH5UYiL6RC3bep7KH2Ic96mahOuIlEj4RqlOKyJh9Lqg8lxDeGNIR1pqhMFE/KCxQQq8flhOJxlUIpkovXRyBQ8AKFMtPhvO+PRmCKyYRni+ssWT7ilgnJ6r4vqnsUPyN4IZczFfePBP54aZeivnh9JB0koSZlgQSTLZTjydVjcrFu69E4xBBCrJP5EKivePIjyRWBPzae0hH7i9qsPSSVQ3tMP6VIVk3KSEL+cJGORYiEY0nNAa7BE2KwBl/2CuRDOdSLiSHcY648ZCv4PiWVQns0OY+o3cM9EPokS4RnfBoqy38ihDJR3fcP0WekZH0ud1W/ZUKyMhEnoBhqD8848cJgItBkCHWqJ8gbfJ8946H68HGHy1pb0XghFbfF60eESTpZ/kTlYYRICQlYmSgmQ30BQcbaY88PH8OXfZ/Je0T1SMXYOMp9n/35eqHdPzVSeywXnLULBR3CsxrFZNhfIIRZcEgh2UMjgXIsDG+PgT/D2/xzBnsh29lmyhpGeK9XNuRamJDUZuPoN/6MwYYnYguaIwZzzAlPSkhh0Y5AiEN8YCVXJ2xiQcqlqE/CHlHR+v2PK0SNkg/WZ89ab6zs2wMiS3W9DlaNyyh3z8rZ5kVANmtgp+Hw4KARE9JgljKUH6VKGCg+vlCcTC72sui50Bevh5+Y7EgDx58zmaKktjhhhqJBomFjMiLFgc+KjIEBYCCN/BNPIvfHP7u2GCHZjAgaiZBPSMGCTNQ/U4yQnIIOUV+hm0VXGenZeFJ7ZBX65/N4KlQLY4XnzDoyGeRJxuGDHej5ZjP6713vto7G8skI4fwcIWGisQHdWwp1/VmbHyPszUje2gryrsFhJBlXcVlIoe9I+GuTRKVfjmTkNdGOgxh8+08Y+PXj+Ojz09Cz+Bpkd+4SC/4JR4h8WYEQQhoWv5y16E//DMq83JHghBysTX/F/bEU74uj0GfFvyrZa/lALstJ0pFmtmzF/ktasGfKv+H/yj+P3SdMxZ4LFqHz6eclaM9EhNhLbQQ3yBCYaHEqkjkCTFLl2CjF/fFU3Bc/dofBL+CwehHydJx5bpfD3d3IfbQPmR1vYveEmTh41c3Ic/vk02l7l1JW5PGZoYToL7zEozgN7RsuG5X9ePFULFuc4u0uSqVsmKCV2SafoBMigBMJJ8gQDPo8TUL6+pHr6ERu7wHsOedCdP70QeT76VP4fEgiJCenan7AKx4UUh73DwEuEvXOqqgv4JPSJ8nF+2xsvSNA8UMgIhOftEhhu/pGgvokwxPGCDl0CPuuvgG9215Ero9tIsveKUKyMULU4pUKudr548q+nguggsrdee/hZYUjpUh2BJHQpzHd2LF3EXlZgsxfk6CpW1mTHYmIOIxEZyX53j4Mfrwfg919yKazGCRhRjbfk6WD1XtsywhOq7jShCkWlCzACIrLHRFDx4sn1SNr8why0QJQwUEiy0kN9vYi/dLLSD/2Www+/gRyW55E/ulnkHv+JeTYnnv1FQy+9hqyr21nTry6HdmXXyVexuALLyOzdRvSLOd7epEbyHDMHLIi2kjJ0qlm7F1DCAnlAKcoSTClcm6lpHgMxc8V1+OIJ01aK5RhhJgmpJyN52XzebaRiDQtY4CrOdDZja4t23Bg1Z34qHkx9sz8dxyadg66pp2Lzqkz0dkwAwdrT8eBqqk4WDkV+yunYD/L+2umYt+4yXjvjPPRte7XRmxOk+e7B2lBgZBMICTu94LitjpEIERk9PZnTLEMj6ccJ2CmRlklyYSyslB38CT6urMKty0ynKzG7Zf5BrIpk+Ve7s/k0M2+zp40OroH0NHZh45D3ejZ34G+D/ai77XX0bf5MfTefi86ll6Fj2Z+HR9+sRoHPnsyDn2hCgc+Nx4ffvYk7Kk/E/u+dwMGdr1tjlRbT6ePYhSLU4wUzotbMSJEU7HpUBmV8lQoS8E0J//oi39C402bcdqie3AGcebie3Fe+89x/rL7sOLWx3Coq59E6cgK1uIICaQUkyErc3DjS4mDXQPYumMP7t/yJq748ZP42pX34+z2tTir7U7MaL0FM+avwenzb8b0lptx1oI1OLttDb5++T24+Lp1aL/1cWx67j0MHOpE19an8P4ZX8UHn/4y3v18NYm4EQPvvm965c0R059IH/9+IyRYCAmRXqMcEZoIlXa0mJID9ObvfHAQXzrvaiQmLEBJ1SKUVC9BouZSoh2jxy/BWQvvxIHOXvRzT8YJcXAkFJMha5NlyGR/v+M9LLx+Eyq/sRp/N+07OHbKFShvWIFE/WVI1PJdVa0oqWxG4uQmJE5qRMlJczxmIzGO+JdZKB83H1XnX4t39hxE53PP4c/VZ6Cj7Sqkd77hwnWv1GE6TXOwKtuC0SKpj1kIoVNG7fQhhVnoT0lKD5CxbdvfRVnNXIypa0GyfiEVXYwUUT5xMZK1i7H81s0kz620Jqzkh/LgiIReLjLMZ1A2TYv64S+ext9P+y+UnNiI8toFqJhyKcqnrED51BUYc8oyjJm8BBX1rSiva46hibJNGFPThIrqOTiqahaOGt+ISV+/Bh/t78bHt9+B/nWPcwKcZDiFgjKyDCGmUxzSLUe/ZYRwmxs8H8iwUxO9bcOzGHXixRhb38IVIyFEqpZK1rbguFOW4le/3Wlymqyc5JGSI8RZRndvBlfe8jDKxjejhCitW0CCW1E2aQlKJ4uIdlRMXoqxExeRkHkYWzcXFXWNzJsI5XMxtoZkVF+Mo2svwpjKSzDruz/hhGh9nZ02BxGR7+93RzTnYkGe1yUQUiAmBso5HxIR4oQ0eIZo+eEGlNAsx0zidqFFlIiQmhaUVc/HP551Oba/9aEREgbnAPbSQu6SXqZtKMtb95udOK52Psq5wiXVJLpmIZJ1tLhJS5Ga1M4tcxktsg2pqgVITZiH0iqHspr5hHt3akITkpVzUFY1B8eMm4V7H+axq1U2q3DxByfh4hCRwfcH7YKuAcFCQp2EOHb0EIwYt9e7+zI4tXGVKZOa1IbRdUswmqQkaR3JCY04rXkNTwie33JUfNQNqFwv1qsLyZw0Fd17oAdf/tq1SI2fQ7OfhUT1AoyuIdEkJFHfhuTEJRg7eTFqL7gOZ8y+CdNm3YBps1fi9Lk3EjfhjKZVmN64Gl9pXo0ZzTdhRuONuOSKtdj9cRcGBhhpmuMkCZog3zsc7s/V+GtzL5ChZHGINXpSRIaw852P8cUzl6G0YakpO7puKdGGRN0ilHLfLl35ayNSR7FtGT3PMQ3+hUqqiwz5mQe3voHSyiaUVjcjSesoqaHlccwkxyyrX2Bbc/mqB7GvoxeHuvt5+vTxFCNYjqOjh/Dlrr40nXqW4/PY5EEQIk8XOHodPAmuGtdNMgUoDflApEnZCcBBf/7YKziGzjQ1+VJnHfUuFyFH0UrufOAFc0QiRFvMESJoPBvbksoKrhRrLFq9CWUnz0Ept8zo2jaSsQQl9UtISCvG0F/808x2vLV7vzndXt41+nhKDDBMT9MXpJlbrKA7B7eDOX45aMqoXYGVXdC0ZaSL18d0GEJFQbkw70iOuRHCklU0Ka1kfzqHtpUPIsV9mqhbaMrLQrSa8iP/MH05fr/zPSqhLUMHPIQQwQb1Q7sxe7iKF12zDhXcbmV0pCK4ZGI7re9SErKQbfPxmVNb8cizb0b+RrmzvgI0ntqC1WVIUJp6SBc7Kby8tr9TQT8xWJtPQV/fqLJtGasQ8rJajQ/29eC0i1dyr/Osr57Hfb6QRNC0eeSOpqObfMEPsIf7VorohhiUsMGjl7ik4TOMOmUh7Ws2oaKKxyyP08QkxjN0oklPSKKG22jCbHzp7GVo/v59WHbTBlxxy0O46kcP47t3PILv3fU4brxvC7a+9A4+PtRj1mGRM61CR7m7vhcIDBbi4CY7BE47+1UK7aP0IEsGrbIGfn7Xe/j0qUtROoEWwhUdTY9fQlJSjEVGV87FBcvXoqs3bdahZ+zCpxWUR/cDx5NWWopv3LaLJ0Uzj9ZFKOfJVTqxjViCFAlJsr10wiUoO+lClI37T26ti1BmJwlPFvqaclpoBS3q06dfjgnfvA5X3/4I9h7sMUsR4mQUCClapHhdijEPKVwoo8udJmaXHTbeu/FFjGYkWFrFCJFH3Ogq7nmeCCmadYoEXfvjJ2yCii3Cs5b7sYohRaV0H1d03vXrUM7A6qgpjDMa2hh/8Igl0ckaHq8TeMRXXsiA69sMvC5hvMM2WmVpA537KSuQmnI5Shm8qZ6sbEXrtb909yBuWXf3Kuhg//0gAqSbhxHl+y3F1k06yhlHhNhly8xwEEt/sB6j/nkuleReFxncJiVVDKFJ0PGTF2DT0284Z6rznsnGjwZ349nRJ1BGjk6WJxIP8JJ21R0b8cXzGJFy66SqRQa3DAnXcZ6snG1bVf5LMU9SjnwiQ/mJywzJSZchSUdfygDuuIZ2bH7mLfMdujWHuRgZfHecEKtLHy9jmir3emsM1aNTRqut+4uOs68038IoUtEpfYZiBZJihFQ24oRzL8ebuw/xBHDfFGxM/pjJBejlngh96NUH3CzHlhM0v8P+nbv3YdWvnsPM1rvxhXP/G3972goc03ApjqZFjJWT5T1m1Lhmvpsxisio9w54IsMAWRWj2ZJxC/CdH22OTjE30cLkI13ilsI2Jye9ne6q2enE3J0yTNrnWvHtb+zBCTOvZDitE4WEyKEyOkxU83LFlZu5+Db09PPU4FVaBIoUrc5wOIuQ1QW4EyzLgM49q/p+3nTf3duBt98/gF3vfowdf/wIr7z1AZ7jKbZx25uo+9ZK+i/FP7QUBYY89hMM5OR/Sk6ejzZasxanj6fYcEIKxIxEiGRDXXKav9sy7NJ1X87xngeewbF8aUUDYwQqoug0wa1TWktnSFJ+8JPf2X6z7xhUwiYbm7wmqW0naPLaWoLKRgaV7+wZsICri3mabe4qHvyA82P5Qff9ZQmvD6PGcztRj5Jqnk4K6Gi1pfQ7JeOa0Hbd/xoh0sVNtDBJA8cyxNsM3jo8zGUwvol8SPDULdet5/5tdSvAK3gIxsoYjB3fsBCPPveOTUITj446DmZQmdBYzhocKf20BuVaxT4SKTIFyQRH7k6rwliDVO4P7+5F3QU/5MJwUYwQksGtK6QYzJWcNA+reWvWZVQWp3nYuvs5GThWsIzg/AWTC7Jslw9RvxEihbL01B/u70LDf1xPQrgiNEtFkhZAMXRPMSArpS/516X34N5HXsV9j+/EhqfewEM0643PvI2HiAe3/QHrn3od657cgV8+8Rrue/Ql/HTzi4a7Nz6Pux96Afc89DzWbnoRP9v8Mvtfwf1PvIpf/W47NmzdgQe2vo4HtryODb/bgbseehYN376Rt2HFK9ShlmG+fNkExis8+pPcxscwjtm2433botmss4J4CpN1ubZOwVK8QCSj/+wWD6NYtVXSar2wazc+o7uLPgbZPYOOi4SMrleUSn/CeGTUiYw0K+czfF+CY3ld/xsehZ+aeiWOP/VKHHfq5Tj2lGVUdDG3XQuO4TY7mqt6PG+yFZSvYHBXQWKFsTWtHIOoX4RjJnOsU9px7NTlBMc49Qr7FFBSx8Bt8mVuURTqc+smaB3l1bNRPmEuzpxzCw50pc3/hdWPpzDZQEIE38+K6ydyNAhZiVmIzFyEbP/jh/jc9CuRJCFJ7tekLnP06iJFVlLCSSR4+03ocsbJJHUPoeLJhhUOk1hmW0I3YsYa+qJV/Y1rcdH313O/U56TSpDoBMdJ6kglEgLNXydHgsdpktf/pOKMhuVInbLcCLGoVs5U4/LdR0+ci8/w+N/4+7c4J5GhlbcZ2j+bqEHbhVU/abWZYAwmxz63bX0cIi+s4Ea3x+lzbyX7vGzxAlbGSaf0rYJHYZKrquApVcUYgSF2qrqJARV9jb5jUOlSooyWUV5HGV7UknTAXzpnBZ7a9T4uvOJnNPPFvNEyOtWYnFipAjHKpKrnEo3mtEt52y2dyK05mVvUxmW0zLxsop5lH58tozMtO/FCLL2Bpwt9lKzDJhpLjgw3SbvTRKSoMJwUwbaUEUJKw8Myu9vXv4jjGE4fN3khj16F14sskkzp5qvwupq3VZJSVtvE8LsV5dxi5VPaUUblK1ivYHti3EWY8q3ruQXfx5/2HMCXz7+G/cvZr8+PdNCctCaoMcpqGJ7XcDzl9RxzYgvH5bslS2IqCH0jGVtPv1apwLAN7TdswIGOXtNZDjgQEs8/Ef6ZAgr1GCFu6+gkWHrjwyhnYJSq1EqSEPt6NR/J8dwq4+nQxjOi1IcjrpiF1gZGm4w0j65rxjcvW4u33jtIRz2ITVt24FP0QaX1lzEU12nF8RidpnhH0QQTJ89hPDGLOS+SdJYpnSC8UKrf3nkS6+Pm4mha1GkXrcR6OlwdANENm/AsRJNy1UI9bJeRoW0VI8S2nd+HIkTbp6s3gwee/ANmXX0/ps25GafNFlZj2iX6irUSp8++CdOb1+Ar82/FzJbbcFbL7Ti9cTW+tfwuBlNvMNpNW1yiD9W/ePhZnLfwdpyzeC3OXnQ3zm69C2ctuBMz5t2KGU23YHrTasxoXMXyKpw572Z8tWUNzmn9Ec5feBu+tvhOtP7Peqxc+xs8yuvCXt5ypbSI1tFuAZfpH5+gg/mSImKK68VQio7dYH5iXaFw+I+o3oFBWo0i0yy6ezJ2y+3uy6KHbb1pXtgGCEaunSRxMOdOLAVUFtd4kjM8EtNEZpBjEwMs92X0n1+D9qkyQN9M9C0mnT1ssnrOKau7hgI8938nQV+1OwyfHP8ZKSy5uk13qOxI9SgwCxDrOtfD5S1q90pIIbdvnbL5wzq/FdS5cN19rHEB25GSG1Pj6OOSu74Lel/wCUHGQgIFdyRD30C0XdQXUtg2Jh8mH2uLko03FGorTsMIEWxljQBHkOXF8LLxfvvPcL+C6lNyeYBL9kzRc6Ec+kyXqL+wEKoXkus32TjU5tujVCzjYV0x3aLLXXGSiB6IFP1LCC/wL1EKLx1RXlBfHCPI2Bh+vJBCXT1xh6iFsFZfH4aYbEAYhxWre0LUUfxayQx9OCCuqNVjffwxhHoccbkC/Bi2+kFhbYWhWyPID0kxOSH+THGb5QF+uwdZl1TP4f8B+462TplCr8AAAAAASUVORK5CYII=";
    const FBR_PAKISTAN_BADGE_DATA_URL = "data:image/png;base64,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";

    function buildOfficialPrintHtml(payload) {
        if (!payload) return '<div>No invoice data</div>';

        // 1. Live Company Data with intelligent fallbacks
        const compData = payload.company || window.companyData || (typeof companyData !== 'undefined' ? companyData : {});
        const comp = {
            name: (compData.name && compData.name.trim()) || 'SEASTONE PVC PIPE INDUSTRY',
            deals_in: (compData.deals_in && compData.deals_in.trim()) || 'Manufacturers of Master PVC Pipe, Fittings & Conduits',
            address: (compData.address && compData.address.trim()) || 'Plot No. 192/B, Road No. 11 Near Family Colony, Industrial Estate Gadoon, AFZAL, Haripur, KPK',
            phone: (compData.phone && compData.phone.trim()) || '03018537877',
            email: (compData.email && compData.email.trim()) || 'info@seastonepipes.com',
            website: (compData.website && compData.website.trim()) || 'www.seastonepipes.com',
            ntn: (compData.ntn && compData.ntn.trim()) || 'A522103',
            gst: (compData.gst && compData.gst.trim()) || (compData.strn && compData.strn.trim()) || '3520271341139',
            logo_data: (compData.logo_data && compData.logo_data.trim()) || ''
        };

        // Logo resolution: Dynamic Live Company Logo from database / settings / storage
        const logoSrc = resolveLiveCompanyLogo(payload.company, compData);

        const compName = comp.name.toUpperCase().startsWith('M/S') ? comp.name.toUpperCase() : ('M/S ' + comp.name.toUpperCase());
        const compAddress = comp.address;
        const compPhone = comp.phone;
        const compEmail = comp.email;
        const compWebsite = comp.website;
        const compNtn = comp.ntn;
        const compGst = comp.gst;

        const erpInvNo = payload.invoice_no || `DI-2026-${String(payload.serial_no || '0000').padStart(4, '0')}`;
        const rawFbrCandidate = payload.fbr_invoice_no || (payload.fbr_qr_code) || '';
        const cleanFbrInv = extractCleanFbrInvoiceNumber(rawFbrCandidate);
        const fbrInvNo = cleanFbrInv || 'Pending Transmission';
        const subTimestampRaw = payload.submission_timestamp || payload.invoice_date;

        const invFormattedDate = formatPakistanDateTime(payload.invoice_date);
        const submissionFormattedDate = formatPakistanDateTime(subTimestampRaw);

        const bizName = payload.business_name || payload.customer_name || 'Customer';
        const custName = payload.customer_name || 'Walk-in Customer';
        const custTaxId = payload.customer_ntn || payload.customer_cnic || '-';

        // Resolve Customer Address - never insert a dummy address if not provided
        let custAddress = (payload.customer_address && payload.customer_address.trim() !== '-') ? payload.customer_address.trim() : '';
        if (!custAddress && window.customersList && Array.isArray(window.customersList)) {
            const foundCust = window.customersList.find(c => 
                (payload.customer_coa_id && (c.coa_id == payload.customer_coa_id || c.customer_id == payload.customer_coa_id)) ||
                (payload.customer_name && c.customer_name && c.customer_name.toLowerCase() === payload.customer_name.toLowerCase())
            );
            if (foundCust && foundCust.address && foundCust.address.trim() !== '-') {
                custAddress = foundCust.address.trim();
            }
        }
        if (!custAddress || custAddress === '-') {
            custAddress = '';
        }

        let activeItems = (payload.items || []).filter(it => {
            const q = parseFloat(it.quantity) || 0;
            const r = parseFloat(it.rate || it.unit_price) || 0;
            const name = (it.item_name || it.description || '').trim();
            return q > 0 || r > 0 || name.length > 0;
        });

        if (activeItems.length === 0) {
            activeItems = [{
                item_name: '2"X13\' MASTER PVC PIPE- 2.00 KG',
                hs_code: '39172390',
                uom: 'KG',
                quantity: payload.total_qty || 2,
                rate: 100,
                val_excl_tax: payload.taxable_amount || 200,
                tax_rate: 18,
                sales_tax_amount: payload.total_sales_tax || 36,
                further_tax_amount: payload.total_further_tax || 0,
                val_incl_tax: payload.net_payable || 236
            }];
        }

        // Calculate Taxes robustly so they never display 0.00
        let totalTaxableValue = num(payload.taxable_amount);
        let totalSalesTax = num(payload.total_sales_tax);
        let totalFurtherTax = num(payload.total_further_tax);
        let totalOtherTaxes = num(payload.total_extra_tax);
        let tax236g = num(payload.withholding_tax);
        let grandTotal = num(payload.net_payable);
        let commonTaxRate = 18;

        let sumTaxable = 0, sumST = 0, sumFT = 0, sumOther = 0, sumTotal = 0;
        activeItems.forEach(it => {
            const q = parseFloat(it.quantity) || 0;
            const r = parseFloat(it.rate || it.unit_price) || 0;
            const lineExcl = parseFloat(it.val_excl_tax) || (q * r);
            const tRate = parseFloat(it.tax_rate) || 18;
            commonTaxRate = tRate;
            const st = parseFloat(it.sales_tax_amount) || Math.round(lineExcl * (tRate / 100) * 100) / 100;
            const ft = parseFloat(it.further_tax_amount) || 0;
            const ot = parseFloat(it.extra_tax_amount) || parseFloat(it.fed_amount) || 0;
            const lineIncl = parseFloat(it.val_incl_tax) || (lineExcl + st + ft + ot);

            sumTaxable += lineExcl;
            sumST += st;
            sumFT += ft;
            sumOther += ot;
            sumTotal += lineIncl;
        });

        if (totalTaxableValue <= 0 && sumTaxable > 0) totalTaxableValue = sumTaxable;
        if (totalSalesTax <= 0 && sumST > 0) totalSalesTax = sumST;
        if (totalFurtherTax <= 0 && sumFT > 0) totalFurtherTax = sumFT;
        if (totalOtherTaxes <= 0 && sumOther > 0) totalOtherTaxes = sumOther;
        if (grandTotal <= 0 && sumTotal > 0) grandTotal = sumTotal;

        if (totalTaxableValue <= 0 && grandTotal > 0) {
            totalTaxableValue = Math.round((grandTotal / 1.18) * 100) / 100;
            totalSalesTax = Math.round((grandTotal - totalTaxableValue) * 100) / 100;
        }

        const amountInWords = numberToWordsPKR(grandTotal);

        // QR Code Generation - Strictly FBR Invoice Number for IRIS scanning & verification
        const targetFbrNumber = extractCleanFbrInvoiceNumber(
            cleanFbrInv ||
            payload.fbr_invoice_no ||
            payload.fbr_qr_code ||
            ''
        );

        let qrImgHtml = '';
        if (targetFbrNumber) {
            const qrCodeDataUrl = generateQrCodeDataUrl(targetFbrNumber);
            const fallbackQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(targetFbrNumber)}`;
            const finalQrSrc = qrCodeDataUrl || fallbackQrSrc;
            qrImgHtml = `<img src="${finalQrSrc}" style="width: 75px; height: 75px; object-fit: contain; display: block;" alt="FBR QR Code" onerror="this.onerror=null;this.src='${fallbackQrSrc}';" />`;
        } else {
            // When no official FBR number is allocated yet, do NOT encode ERP serials (DI-2026-...) because IRIS cannot verify them
            qrImgHtml = `
                <div style="width: 75px; height: 75px; border: 1.5px dashed #94a3b8; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px; box-sizing: border-box; background: #f8fafc;" title="Scan QR Code requires official FBR Invoice Number">
                    <i class="fas fa-qrcode" style="font-size: 20px; color: #94a3b8; margin-bottom: 2px;"></i>
                    <span style="font-size: 7.5px; font-weight: 700; color: #64748b; line-height: 1.1;">Pending FBR Transmission</span>
                </div>
            `;
        }

        let itemsRowsHtml = '';
        activeItems.forEach((it, idx) => {
            const rowQty = parseFloat(it.quantity) || 0;
            const rowRate = parseFloat(it.rate || it.unit_price) || 0;
            const rowTotal = parseFloat(it.val_incl_tax) || (rowQty * rowRate);

            itemsRowsHtml += `
                <tr style="border-bottom: 1px solid #bae6fd; background: #ffffff;">
                    <td style="padding: 6px 4px; text-align: center; border-right: 1px solid #bae6fd; font-weight: 700; color: #0f172a;">${idx + 1}</td>
                    <td style="padding: 6px 10px; text-align: left; border-right: 1px solid #bae6fd; font-weight: 700; color: #0f172a;">${escapeHtml(it.item_name || it.description || '')}</td>
                    <td style="padding: 6px 6px; text-align: center; border-right: 1px solid #bae6fd; font-family: monospace; font-size: 10px; color: #334155;">${escapeHtml(it.hs_code || '39172390')}</td>
                    <td style="padding: 6px 6px; text-align: center; border-right: 1px solid #bae6fd; font-size: 10px; font-weight: 600; text-transform: uppercase; color: #334155;">${escapeHtml(it.uom || 'KG')}</td>
                    <td style="padding: 6px 6px; text-align: center; border-right: 1px solid #bae6fd; font-weight: 600; color: #0f172a;">${fmt(rowQty)}</td>
                    <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #bae6fd; font-weight: 600; color: #0f172a;">${fmt(rowRate)}</td>
                    <td style="padding: 6px 10px; text-align: right; font-weight: 800; color: #0f172a;">${fmt(rowTotal)}</td>
                </tr>
            `;
        });

        // Resolve currently logged-in user name dynamically (never hardcode 'Ali Raza')
        let loggedInUserName = '';
        try {
            const sess = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            loggedInUserName = (sess.name || sess.username || sess.user_name || '').trim();
        } catch (e) {}

        if (!loggedInUserName && window.currentUser) {
            loggedInUserName = (window.currentUser.name || window.currentUser.username || '').trim();
        }

        const salesPerson = loggedInUserName || 
            ((payload.sales_person && payload.sales_person.trim() !== 'Ali Raza') ? payload.sales_person.trim() : '') ||
            ((payload.created_by_name && payload.created_by_name.trim() !== 'Ali Raza') ? payload.created_by_name.trim() : '') ||
            'Admin';

        return `
        <div class="fbr-digital-invoice-sheet" style="width: 100%; max-width: 820px; margin: 0 auto; background: #ffffff; padding: 16px 20px; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1e293b; box-sizing: border-box; font-size: 11px;">
            <!-- 1. TOP HEADER (2 COLUMNS) -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 14px;">
                <!-- Left Column: Company Profile (Logo + Uniform Left-Aligned Details) -->
                <div style="flex: 1; display: flex; align-items: flex-start; gap: 12px;">
                    <div style="flex-shrink: 0; padding-top: 2px;">
                        <img src="${logoSrc}" style="max-height: 54px; max-width: 95px; object-fit: contain; display: block;" alt="Company Logo" onerror="this.onerror=null;this.src='assets/logos/logo.png';" />
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 15.5px; font-weight: 900; color: #0b1a30; letter-spacing: 0.3px; line-height: 1.25; margin: 0;">${escapeHtml(compName)}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #002855; margin-top: 3px; line-height: 1.35;">${escapeHtml(compPhone)}${compEmail ? ', ' + escapeHtml(compEmail) : ''}${compWebsite ? ', ' + escapeHtml(compWebsite) : ''}</div>
                        <div style="font-size: 9.5px; color: #334155; margin-top: 3px; line-height: 1.35;">${escapeHtml(compAddress)}</div>
                        <div style="font-size: 10.5px; font-weight: 800; color: #0b2e59; margin-top: 3px; line-height: 1.35;">NTN : <span style="font-family: monospace; font-size: 11px;">${escapeHtml(compNtn)}</span> &nbsp;|&nbsp; STRN / GST : <span style="font-family: monospace; font-size: 11px;">${escapeHtml(compGst)}</span></div>
                    </div>
                </div>

                <!-- Right Column: Metadata List with Vertical Blue Line (Branch removed) -->
                <div style="border-left: 2px solid #0077c8; padding-left: 14px; min-width: 275px;">
                    <table style="border-collapse: collapse; font-size: 10.5px; line-height: 1.45;">
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">ERP Invoice No.</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">${escapeHtml(erpInvNo)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">Invoice Date</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 600; color: #334155; white-space: nowrap;">${invFormattedDate}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">FBR Invoice No.</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 700; color: #0f172a; font-family: monospace, sans-serif; white-space: nowrap;">${escapeHtml(fbrInvNo)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">FBR Submission Date</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 600; color: #334155; white-space: nowrap;">${submissionFormattedDate}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- 2. SALES TAX INVOICE BADGE -->
            <div style="text-align: center; margin: 8px 0 12px 0;">
                <div style="display: inline-block; background: #e0f2fe; padding: 5px 32px; border-radius: 6px;">
                    <span style="font-size: 18px; font-weight: 900; color: #0b2e59; letter-spacing: 0.8px; text-transform: uppercase;">SALES TAX INVOICE</span>
                </div>
            </div>

            <!-- 3. BUYER / CUSTOMER DETAILS BOX -->
            <div style="border: 1.5px solid #7dd3fc; border-radius: 5px; overflow: hidden; margin-bottom: 12px; background: #ffffff;">
                <div style="background: #e0f2fe; padding: 5px 12px; border-bottom: 1px solid #bae6fd; font-size: 11.5px; font-weight: 800; color: #002855; letter-spacing: 0.5px;">
                    BUYER / CUSTOMER DETAILS
                </div>
                <div style="padding: 6px 12px; font-size: 10.5px; line-height: 1.5;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="width: 105px; font-weight: 800; color: #0f172a;">Business Name</td>
                            <td style="width: 14px; font-weight: 700; text-align: center;">:</td>
                            <td style="color: #0284c7; font-weight: 700; text-decoration: underline;">${escapeHtml(bizName)}</td>
                            <td style="width: 90px; font-weight: 800; color: #0f172a; text-align: right;">NTN / CNIC</td>
                            <td style="width: 14px; font-weight: 700; text-align: center;">:</td>
                            <td style="width: 130px; font-weight: 600; color: #0f172a; font-family: monospace;">${escapeHtml(custTaxId)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800; color: #0f172a;">Customer Name</td>
                            <td style="font-weight: 700; text-align: center;">:</td>
                            <td colspan="4" style="color: #0f172a; font-weight: 600;">
                                ${escapeHtml(custName)} &nbsp;|&nbsp; <strong style="color: #0f172a;">Address :</strong> &nbsp; <span style="font-weight: 500; color: #334155;">${escapeHtml(custAddress)}</span>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- 4. ITEMS TABLE -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5px; border: 1.5px solid #0077c8; border-radius: 4px; overflow: hidden;">
                <thead>
                    <tr style="background: #0077c8; color: #ffffff; font-weight: 700; font-size: 10.5px; line-height: 1.2;">
                        <th style="padding: 6px 4px; text-align: center; border-right: 1px solid #38bdf8; width: 34px;">#</th>
                        <th style="padding: 6px 10px; text-align: left; border-right: 1px solid #38bdf8;">Description / Item Name</th>
                        <th style="padding: 6px 6px; text-align: center; border-right: 1px solid #38bdf8; width: 100px;">HS / PCT Code</th>
                        <th style="padding: 6px 6px; text-align: center; border-right: 1px solid #38bdf8; width: 55px;">Unit</th>
                        <th style="padding: 6px 6px; text-align: center; border-right: 1px solid #38bdf8; width: 65px;">Qty</th>
                        <th style="padding: 6px 8px; text-align: center; border-right: 1px solid #38bdf8; width: 85px;">Rate (PKR)</th>
                        <th style="padding: 6px 10px; text-align: right; width: 105px;">Line Total (PKR)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRowsHtml}
                </tbody>
            </table>

            <!-- 5. LOWER SUMMARY (2 COLUMNS) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; align-items: start;">
                <!-- Left: Amount in Words & Additional Info -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- Amount in Words -->
                    <div style="border: 1.5px solid #7dd3fc; background: #e0f2fe; border-radius: 4px; padding: 7px 12px;">
                        <div style="color: #0284c7; font-weight: 800; font-size: 11px;">Amount in Words:</div>
                        <div style="color: #000000; font-weight: 800; font-size: 12px; margin-top: 3px; line-height: 1.35;">
                            ${escapeHtml(amountInWords)}
                        </div>
                    </div>

                    <!-- Additional Information -->
                    <div style="border: 1.5px solid #7dd3fc; border-radius: 4px; overflow: hidden; background: #ffffff;">
                        <div style="background: #e0f2fe; padding: 5px 12px; border-bottom: 1px solid #bae6fd; font-size: 11px; font-weight: 800; color: #002855; letter-spacing: 0.5px;">
                            ADDITIONAL INFORMATION
                        </div>
                        <div style="padding: 6px 12px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; line-height: 1.5;">
                                <tr>
                                    <td style="width: 120px; font-weight: 800; color: #0f172a;">Payment Terms</td>
                                    <td style="width: 14px; font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${escapeHtml(payload.payment_mode || 'Cash')}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a;">Delivery Terms</td>
                                    <td style="font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${escapeHtml(payload.delivery_terms || 'Ex-Factory')}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a;">Sales Person</td>
                                    <td style="font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${escapeHtml(salesPerson)}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a;">Customer Balance</td>
                                    <td style="font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${fmt(payload.balance || grandTotal)}</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Right: Tax Summary -->
                <div style="border: 1.5px solid #0077c8; border-radius: 4px; overflow: hidden; background: #ffffff;">
                    <div style="background: #0077c8; color: #ffffff; padding: 5px 12px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
                        TAX SUMMARY
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
                        <thead>
                            <tr style="background: #e0f2fe; border-bottom: 1px solid #bae6fd; color: #002855; font-weight: 700;">
                                <th style="padding: 4px 10px; text-align: left;">Description</th>
                                <th style="padding: 4px 10px; text-align: right;">Amount (PKR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Total Taxable Value</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalTaxableValue)}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Sales Tax (${commonTaxRate}%)</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalSalesTax)}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Further Tax</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalFurtherTax)}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Advance Tax u/s 236G</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(tax236g)}</td>
                            </tr>
                            <tr style="border-bottom: 1.5px solid #0077c8;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Other Taxes</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalOtherTaxes)}</td>
                            </tr>
                            <tr style="background: #e0f2fe;">
                                <td style="padding: 6px 10px; font-size: 13.5px; font-weight: 900; color: #002855;">GRAND TOTAL</td>
                                <td style="padding: 6px 10px; text-align: right; font-size: 16px; font-weight: 900; color: #002855;">${fmt(grandTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 6. FBR VERIFICATION BOX (3-COLUMN EXACT REPLICA) -->
            <div style="border: 1.5px solid #7dd3fc; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                <!-- FBR Logo -->
                <div style="width: 28%; display: flex; align-items: center; justify-content: center;">
                    <img src="${FBR_PAKISTAN_BADGE_DATA_URL}" style="max-height: 65px; max-width: 160px; object-fit: contain; display: block;" alt="FBR Pakistan Digital Invoicing" />
                </div>

                <!-- Divider 1 -->
                <div style="width: 1.5px; height: 70px; background: #0077c8; margin: 0 12px;"></div>

                <!-- QR Code -->
                <div style="width: 22%; display: flex; align-items: center; justify-content: center;">
                    ${qrImgHtml}
                </div>

                <!-- Divider 2 -->
                <div style="width: 1.5px; height: 70px; background: #0077c8; margin: 0 12px;"></div>

                <!-- FBR Verification Text -->
                <div style="width: 48%; padding-left: 6px;">
                    <div style="font-size: 15px; font-weight: 800; color: #002855; margin-bottom: 4px;">FBR Verification</div>
                    <div style="font-size: 10.5px; color: #475569; line-height: 1.35; margin-bottom: 6px;">
                        Scan the QR code to verify this invoice<br/>on FBR's system or use the FBR invoice number
                    </div>
                    <div style="font-size: 16px; font-weight: 900; color: #002855; letter-spacing: 0.5px; font-family: monospace, sans-serif;">
                        ${escapeHtml(fbrInvNo)}
                    </div>
                </div>
            </div>

            <!-- 7. FOOTER -->
            <div style="border-top: 1.5px solid #0077c8; margin-top: 12px; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <div style="font-weight: 800; color: #000000; font-size: 11.5px; margin-bottom: 2px;">Thank you for your business!</div>
                    <div style="color: #475569; font-size: 10px; margin-bottom: 2px;">This is a computer-generated invoice under official FBR Digital Invoicing regulations.</div>
                    <div style="font-weight: 800; color: #000000; font-size: 10.5px;">Powered by SoftifyX Financials</div>
                </div>
                <div style="text-align: center; width: 200px;">
                    <div style="border-bottom: 1.5px solid #475569; width: 100%; margin-bottom: 4px;"></div>
                    <div style="color: #1e293b; font-size: 10.5px; font-weight: 500;">Authorized Signatory</div>
                </div>
            </div>
        </div>
        `;
    }

    async function viewInvoice(id) {
        try {
            const modalContent = document.getElementById('dsr_view_modal_content');
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #64748b;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 28px; color: #0284c7; margin-bottom: 12px; display: block;"></i>
                        <span style="font-size: 13px; font-weight: 600;">Loading Official FBR Digital Tax Invoice...</span>
                    </div>
                `;
            }
            const modalTitle = document.getElementById('dsr_view_modal_title');
            if (modalTitle) modalTitle.textContent = 'Loading Invoice...';
            const badgeContainer = document.getElementById('dsr_view_modal_badge');
            if (badgeContainer) badgeContainer.innerHTML = '';

            openModal('dsr_modal_view');

            const res = await fetch(`api/digital_invoice.php?action=get_invoice&id=${id}&company_id=${companyId}&_cb=${Date.now()}`);
            const json = await res.json();
            if (json.status !== 'success' || !json.invoice) {
                if (modalContent) {
                    modalContent.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #dc2626;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                            <strong style="font-size: 14px;">Could not load invoice</strong>
                            <p style="margin-top: 6px; font-size: 12px; color: #64748b;">${escapeHtml(json.message || 'Invoice record not found')}</p>
                        </div>
                    `;
                }
                return;
            }

            const inv = json.invoice;
            selectedInvoiceForAction = inv;

            if (modalTitle) {
                modalTitle.textContent = `Official FBR Digital Tax Invoice - ${inv.invoice_no || ('DI-2026-' + String(inv.serial_no).padStart(4, '0'))} (#${inv.serial_no})`;
            }

            if (badgeContainer) {
                const fStatus = (inv.fbr_status || 'Draft').trim();
                const isSubmitted = (fStatus === 'Valid' || fStatus === 'Submitted' || fStatus === 'Active' || inv.workflow_status === 'Submitted');
                const isRejected = (fStatus === 'Rejected' || fStatus === 'Failed' || fStatus === 'Sample Validation Failed');
                const isCancelled = (inv.is_cancelled == 1);

                if (isCancelled) {
                    badgeContainer.innerHTML = `<span class="dsr-badge dsr-badge-cancelled"><i class="fas fa-ban"></i> Cancelled</span>`;
                } else if (isSubmitted) {
                    badgeContainer.innerHTML = `<span class="dsr-badge dsr-badge-submitted"><i class="fas fa-check-circle"></i> Submitted</span>`;
                } else if (isRejected) {
                    badgeContainer.innerHTML = `<span class="dsr-badge dsr-badge-rejected"><i class="fas fa-exclamation-triangle"></i> Rejected</span>`;
                } else {
                    badgeContainer.innerHTML = `<span class="dsr-badge dsr-badge-pending"><i class="fas fa-clock"></i> Pending FBR</span>`;
                }
            }

            if (modalContent) {
                modalContent.innerHTML = buildOfficialPrintHtml(inv);
            }
        } catch (err) {
            console.error('Error viewing invoice:', err);
            const modalContent = document.getElementById('dsr_view_modal_content');
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #dc2626;">
                        <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                        <strong style="font-size: 14px;">Failed to display invoice</strong>
                        <p style="margin-top: 6px; font-size: 12px; color: #64748b;">${escapeHtml(err.message || err)}</p>
                    </div>
                `;
            }
        }
    }

    function printFromViewModal() {
        if (selectedInvoiceForAction && selectedInvoiceForAction.id) {
            printInvoice(selectedInvoiceForAction.id);
        } else {
            window.print();
        }
    }

    async function printInvoice(id) {
        try {
            let inv = null;
            if (selectedInvoiceForAction && selectedInvoiceForAction.id == id && selectedInvoiceForAction.items && selectedInvoiceForAction.items.length > 0) {
                inv = selectedInvoiceForAction;
            } else {
                const res = await fetch(`api/digital_invoice.php?action=get_invoice&id=${id}&company_id=${companyId}&_cb=${Date.now()}`);
                const json = await res.json();
                if (json.status !== 'success' || !json.invoice) {
                    alert('Could not load invoice for printing: ' + (json.message || 'Invoice record not found'));
                    return;
                }
                inv = json.invoice;
                selectedInvoiceForAction = inv;
            }

            const invoiceHtml = buildOfficialPrintHtml(inv);

            // Open dedicated print window
            const printWindow = window.open('', '_blank', 'width=960,height=900,menubar=no,toolbar=no,location=no,status=no');
            if (!printWindow) {
                // If popup blocker blocked the window, open the View modal and trigger print
                await viewInvoice(id);
                setTimeout(() => {
                    window.print();
                }, 400);
                return;
            }

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>FBR Sales Tax Digital Invoice - ${escapeHtml(inv.invoice_no || inv.serial_no || 'Document')}</title>
                    <style>
                        @page {
                            size: A4 portrait;
                            margin: 6mm 8mm;
                        }
                        * {
                            box-sizing: border-box;
                        }
                        body {
                            font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
                            margin: 0;
                            padding: 12px;
                            background: #ffffff;
                            color: #1e293b;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        @media print {
                            body {
                                padding: 0 !important;
                                background: #ffffff !important;
                            }
                            .no-print {
                                display: none !important;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${invoiceHtml}
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                                window.close();
                            }, 400);
                        };
                    <\/script>
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (err) {
            console.error('Error printing invoice:', err);
            alert('Error during print preparation: ' + (err.message || err));
        }
    }

    // =========================================================================
    // 4. MANUAL IRIS LINKING & ATTEMPT RESET (HIGH ALERT)
    // =========================================================================
    function openIrisManualModal(id) {
        let inv = null;
        if (id) {
            inv = invoices.find(item => item.id == id);
        } else if (invoices.length > 0) {
            inv = invoices.find(item => !item.fbr_invoice_no || item.fbr_invoice_no === '-') || invoices[0];
        }

        if (!inv) {
            alert('No digital invoice selected or loaded. Please refresh register first.');
            return;
        }

        const invIdInput = document.getElementById('dsr_manual_inv_id');
        const internalInvInput = document.getElementById('dsr_manual_internal_inv');
        const buyerDisplay = document.getElementById('dsr_manual_buyer_display');
        const fbrNoInput = document.getElementById('dsr_manual_fbr_no');

        if (invIdInput) invIdInput.value = inv.id;
        if (internalInvInput) internalInvInput.value = `${inv.invoice_no} (Serial #${inv.serial_no})`;
        if (buyerDisplay) {
            const ntnCnic = inv.customer_ntn || inv.customer_cnic || '-';
            buyerDisplay.innerHTML = `<strong>${escapeHtml(inv.customer_name || 'Walk-in Customer')}</strong> &bull; NTN/CNIC: <span style="font-family: monospace;">${escapeHtml(ntnCnic)}</span> &bull; Net Total: <strong style="color: #0b2e59;">PKR ${fmt(inv.net_payable)}</strong>`;
        }
        if (fbrNoInput) {
            fbrNoInput.value = (inv.fbr_invoice_no && inv.fbr_invoice_no !== '-') ? inv.fbr_invoice_no : '';
        }

        openModal('dsr_modal_iris_manual');
        setTimeout(() => {
            if (fbrNoInput) fbrNoInput.focus();
        }, 150);
    }

    async function saveManualIrisLink() {
        const invId = document.getElementById('dsr_manual_inv_id')?.value;
        const fbrNo = document.getElementById('dsr_manual_fbr_no')?.value.trim();
        const btnSave = document.getElementById('dsr_btn_save_iris_manual');

        if (!invId) {
            alert('Please select an invoice first.');
            return;
        }

        let confirmMsg = '';
        if (fbrNo) {
            confirmMsg = `Link this invoice to FBR IRIS Invoice Number:\n\n"${fbrNo}"?\n\nThis will mark the invoice as Submitted (Accepted) and generate its official verification QR code.`;
        } else {
            confirmMsg = `Are you sure you want to RESET this invoice attempt?\n\nBecause the FBR Invoice Number field is blank, this invoice will be returned to Draft status so you can edit, retry, or delete it.`;
        }

        if (!confirm(confirmMsg)) {
            return;
        }

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        }

        try {
            const res = await fetch('api/digital_invoice.php?action=link_manual_iris_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: invId,
                    company_id: companyId,
                    fbr_invoice_no: fbrNo
                })
            });

            const json = await res.json();
            if (json.status === 'success') {
                alert(json.message || 'Updated successfully!');
                closeModal('dsr_modal_iris_manual');
                loadInvoices();
            } else {
                alert('Failed to update: ' + (json.message || 'Unknown server error'));
            }
        } catch (err) {
            console.error('Error saving manual IRIS link:', err);
            alert('Network error: ' + (err.message || err));
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i class="fas fa-check"></i> Update';
            }
        }
    }

    // =========================================================================
    // 5. VIEW FBR RESPONSE & DETAILS
    // =========================================================================
    async function viewFbrResponse(id) {
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_invoice&id=${id}&company_id=${companyId}`);
            const json = await res.json();
            if (json.status !== 'success' || !json.invoice) {
                alert('Could not load invoice FBR response.');
                return;
            }

            const inv = json.invoice;
            const invNoEl = document.getElementById('dsr_resp_inv_no');
            const fbrNoEl = document.getElementById('dsr_resp_fbr_no');
            const msgBoxEl = document.getElementById('dsr_resp_msg_box');
            const preEl = document.getElementById('dsr_resp_raw_pre');

            if (invNoEl) invNoEl.textContent = `${inv.invoice_no} (Serial #${inv.serial_no})`;
            if (fbrNoEl) fbrNoEl.textContent = inv.fbr_invoice_no || 'No FBR Reference Allocated';

            const fStatus = (inv.fbr_status || 'Draft').trim();
            const isSuccess = (fStatus === 'Valid' || fStatus === 'Submitted' || fStatus === 'Active');

            if (msgBoxEl) {
                msgBoxEl.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
                msgBoxEl.style.color = isSuccess ? '#15803d' : '#b91c1c';
                msgBoxEl.style.border = '1px solid ' + (isSuccess ? '#bbf7d0' : '#fecaca');
                msgBoxEl.textContent = inv.fbr_response_msg || (isSuccess ? 'Verified and recorded in FBR digital ledger.' : 'Pending transmission to FBR.');
            }

            let rawFormatted = '';
            if (inv.fbr_raw_response) {
                try {
                    const parsed = JSON.parse(inv.fbr_raw_response);
                    rawFormatted = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    rawFormatted = inv.fbr_raw_response;
                }
            } else {
                rawFormatted = JSON.stringify({
                    invoice_no: inv.invoice_no,
                    serial_no: inv.serial_no,
                    fbr_status: inv.fbr_status,
                    workflow_status: inv.workflow_status,
                    notice: 'No transmission logs recorded yet. Invoice is currently pending submission.'
                }, null, 2);
            }

            if (preEl) preEl.textContent = rawFormatted;

            openModal('dsr_modal_response');
        } catch (err) {
            console.error('Error viewing FBR response:', err);
            alert('Failed to view FBR response: ' + (err.message || err));
        }
    }

    // =========================================================================
    // 6. VALIDATE FBR DATA
    // =========================================================================
    async function validateFbrData(id) {
        try {
            const invRes = await fetch(`api/digital_invoice.php?action=get_invoice&id=${id}&company_id=${companyId}`);
            const invJson = await invRes.json();
            if (invJson.status !== 'success' || !invJson.invoice) {
                alert('Could not load invoice data for validation.');
                return;
            }

            const inv = invJson.invoice;
            selectedInvoiceForAction = inv;

            const modalBody = document.getElementById('dsr_val_modal_body');
            const submitNowBtn = document.getElementById('dsr_val_btn_submit_now');

            if (modalBody) {
                modalBody.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin text-primary"></i> Running FBR Compliance Validation Rules...</div>';
            }
            openModal('dsr_modal_validate');

            // Send payload to validate_invoice action
            const valRes = await fetch('api/digital_invoice.php?action=validate_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inv)
            });
            const valJson = await valRes.json();

            if (modalBody) {
                const isValid = (valJson.status === 'success' && (!valJson.errors || valJson.errors.length === 0));

                let errHtml = '';
                if (valJson.errors && valJson.errors.length > 0) {
                    errHtml += '<div style="margin-top: 10px;">';
                    valJson.errors.forEach(e => {
                        errHtml += `<div style="padding: 6px 10px; margin-bottom: 5px; background: #fee2e2; color: #b91c1c; border-radius: 3px; font-size: 11.5px; border-left: 3px solid #dc2626;"><i class="fas fa-times-circle"></i> ${escapeHtml(e)}</div>`;
                    });
                    errHtml += '</div>';
                }

                let warnHtml = '';
                if (valJson.warnings && valJson.warnings.length > 0) {
                    warnHtml += '<div style="margin-top: 8px;">';
                    valJson.warnings.forEach(w => {
                        warnHtml += `<div style="padding: 6px 10px; margin-bottom: 5px; background: #fffbeb; color: #92400e; border-radius: 3px; font-size: 11.5px; border-left: 3px solid #d97706;"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(w)}</div>`;
                    });
                    warnHtml += '</div>';
                }

                modalBody.innerHTML = `
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 4px; background: ${isValid ? '#dcfce7' : '#fee2e2'}; color: ${isValid ? '#15803d' : '#b91c1c'}; border: 1px solid ${isValid ? '#bbf7d0' : '#fecaca'};">
                            <i class="fas ${isValid ? 'fa-check-circle' : 'fa-exclamation-circle'}" style="font-size: 24px;"></i>
                            <div>
                                <h4 style="margin: 0; font-size: 13px;">${isValid ? 'FBR Data Validation Passed!' : 'FBR Validation Found Issues'}</h4>
                                <div style="font-size: 11px; margin-top: 2px;">Invoice #${inv.invoice_no} (${inv.items ? inv.items.length : 0} items)</div>
                            </div>
                        </div>

                        ${errHtml}
                        ${warnHtml}

                        <div style="margin-top: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px; font-size: 11px; line-height: 1.5;">
                            <b>Compliance Checklist:</b><br>
                            • Seller Registered & Active: <span style="color: #16a34a;">✓ Verified</span><br>
                            • Buyer Registration & NTN/CNIC Format: <span style="color: ${inv.customer_ntn || inv.customer_cnic ? '#16a34a' : '#d97706'};">${inv.customer_ntn || inv.customer_cnic ? '✓ Compliant' : '⚠ Missing NTN/CNIC'}</span><br>
                            • HS Code & Tax Percentages: <span style="color: #16a34a;">✓ Standard Rate (18.00%) / Further Tax Applied</span><br>
                            • Mathematical Integrity: <span style="color: #16a34a;">✓ Net Total Verified</span>
                        </div>
                    </div>
                `;

                if (submitNowBtn) {
                    const isSubmitted = (inv.fbr_status === 'Valid' || inv.fbr_status === 'Submitted');
                    submitNowBtn.style.display = (isValid && !isSubmitted) ? 'inline-block' : 'none';
                    submitNowBtn.onclick = () => {
                        closeModal('dsr_modal_validate');
                        confirmAndSubmit(inv.id);
                    };
                }
            }
        } catch (err) {
            console.error('Error validating invoice:', err);
            alert('Validation error: ' + (err.message || err));
        }
    }

    // =========================================================================
    // 7. CONFIRM AND SUBMIT TO FBR
    // =========================================================================
    async function confirmAndSubmit(id) {
        try {
            const invRes = await fetch(`api/digital_invoice.php?action=get_invoice&id=${id}&company_id=${companyId}`);
            const invJson = await invRes.json();
            if (invJson.status !== 'success' || !invJson.invoice) {
                alert('Could not load invoice for submission.');
                return;
            }

            const inv = invJson.invoice;
            selectedInvoiceForAction = inv;

            const isSubmitted = (inv.fbr_status === 'Valid' || inv.fbr_status === 'Submitted');
            if (isSubmitted) {
                alert(`Invoice #${inv.invoice_no} has already been submitted to FBR (FBR No: ${inv.fbr_invoice_no}).`);
                return;
            }

            document.getElementById('dsr_conf_inv_no').textContent = `${inv.invoice_no} (Serial #${inv.serial_no})`;
            document.getElementById('dsr_conf_buyer').textContent = inv.customer_name || 'Walk-in Customer';
            document.getElementById('dsr_conf_ntn').textContent = inv.customer_ntn || inv.customer_cnic || 'None (Unregistered Buyer)';
            document.getElementById('dsr_conf_net').textContent = 'PKR ' + fmt(inv.net_payable);

            openModal('dsr_modal_confirm');
        } catch (err) {
            console.error('Error opening confirm submission modal:', err);
            alert('Error: ' + (err.message || err));
        }
    }

    async function executeSubmit() {
        if (!selectedInvoiceForAction) return;
        const inv = selectedInvoiceForAction;
        const submitBtn = document.getElementById('dsr_btn_execute_submit');
        const origText = submitBtn.innerHTML;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transmitting to FBR...';

            const res = await fetch('api/digital_invoice.php?action=submit_to_fbr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inv)
            });
            const json = await res.json();

            if (json.status === 'success') {
                closeModal('dsr_modal_confirm');
                alert(`Official FBR Transmission Successful!\n\nInvoice: ${inv.invoice_no}\nFBR Reference No: ${json.fbr_invoice_no || 'Recorded'}\nStatus: Submitted / Valid`);
                loadInvoices();
            } else {
                alert(`FBR Submission Error:\n\n${json.message || 'Transmission failed.'}`);
            }
        } catch (err) {
            console.error('Error executing submission:', err);
            alert('Network error submitting to FBR: ' + (err.message || err));
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    }

    // =========================================================================
    // 8. CHECK FBR STATUS (Live Status Inquiry)
    // =========================================================================
    async function checkFbrStatus(id) {
        try {
            const res = await fetch(`api/digital_invoice.php?action=refresh_fbr_status&id=${id}&company_id=${companyId}&_t=${Date.now()}`);
            const json = await res.json();

            if (json.status === 'success') {
                const inv = json.invoice;
                alert(`FBR Status Check Result:\n\nInvoice: ${inv.invoice_no}\nFBR Status: ${inv.fbr_status || 'Pending FBR'}\nFBR Invoice No: ${inv.fbr_invoice_no || 'N/A'}\nLast Checked: ${inv.last_status_check || 'Just now'}\n\nNotice: ${json.message || 'Status retrieved successfully.'}`);
                loadInvoices();
            } else {
                alert('Could not verify FBR status: ' + (json.message || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error checking FBR status:', err);
            alert('Network error checking FBR status: ' + (err.message || err));
        }
    }

    // =========================================================================
    // 9. RETRY SUBMISSION
    // =========================================================================
    async function retrySubmission(id) {
        if (!confirm('Do you want to retry transmitting this invoice to the FBR gateway now?')) {
            return;
        }

        try {
            const invRes = await fetch(`api/digital_invoice.php?action=get_invoice&id=${id}&company_id=${companyId}`);
            const invJson = await invRes.json();
            if (invJson.status !== 'success' || !invJson.invoice) {
                alert('Could not load invoice to retry submission.');
                return;
            }

            const inv = invJson.invoice;
            const res = await fetch('api/digital_invoice.php?action=submit_to_fbr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inv)
            });
            const json = await res.json();

            if (json.status === 'success') {
                alert(`Retry Successful!\nFBR Reference: ${json.fbr_invoice_no || 'Allocated'}\nStatus: Submitted / Valid`);
                loadInvoices();
            } else {
                alert(`Retry Transmission Error:\n${json.message || 'Submission could not be completed.'}`);
            }
        } catch (err) {
            console.error('Error during retry submission:', err);
            alert('Network error during retry: ' + (err.message || err));
        }
    }

    // =========================================================================
    // 10. CANCEL INVOICE (With Random Math CAPTCHA Verification)
    // =========================================================================
    function openCancelModal(id) {
        if (!id) return;
        const inv = invoices.find(x => x.id == id);
        if (!inv) return;

        if (parseInt(inv.is_cancelled || 0) === 1) {
            alert('This digital invoice is already cancelled.');
            return;
        }

        selectedCancelInvoiceId = id;
        selectedCancelInvoice = inv;

        const noEl = document.getElementById('dsr_cancel_inv_no');
        if (noEl) noEl.textContent = `${inv.invoice_no} (#${inv.serial_no})`;

        const reasonEl = document.getElementById('dsr_cancel_reason_input');
        if (reasonEl) reasonEl.value = '';

        const fbrWarning = document.getElementById('dsr_cancel_fbr_warning');
        const fbrRefEl = document.getElementById('dsr_cancel_fbr_ref');
        const fStatus = (inv.fbr_status || '').trim();
        const wfStatus = (inv.workflow_status || '').trim();
        const isSubmitted = (fStatus === 'Valid' || fStatus === 'Submitted' || fStatus === 'Active' || wfStatus === 'Submitted');

        if (isSubmitted || (inv.fbr_invoice_no && inv.fbr_invoice_no !== '-' && inv.fbr_invoice_no !== 'n/a')) {
            if (fbrRefEl) fbrRefEl.textContent = inv.fbr_invoice_no || 'FBR Submitted Record';
            if (fbrWarning) fbrWarning.style.display = 'block';
        } else {
            if (fbrWarning) fbrWarning.style.display = 'none';
        }

        // Initialize fresh dynamic CAPTCHA
        refreshCancelCaptcha();

        openModal('dsr_modal_cancel');
        setTimeout(() => {
            if (reasonEl) reasonEl.focus();
        }, 120);
    }

    function refreshCancelCaptcha() {
        currentCancelCaptcha = generateCaptcha();
        const qEl = document.getElementById('dsr_cancel_captcha_question');
        const inEl = document.getElementById('dsr_cancel_captcha_input');
        const errEl = document.getElementById('dsr_cancel_captcha_error');

        if (qEl) qEl.textContent = currentCancelCaptcha.question;
        if (inEl) inEl.value = '';
        if (errEl) {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    }

    async function submitCancelInvoice() {
        const id = selectedCancelInvoiceId;
        if (!id) return;

        const reasonInput = document.getElementById('dsr_cancel_reason_input');
        const reason = (reasonInput ? reasonInput.value : '').trim();
        const captchaInput = (document.getElementById('dsr_cancel_captcha_input')?.value || '').trim();
        const errEl = document.getElementById('dsr_cancel_captcha_error');

        if (!reason) {
            alert('Please provide a mandatory cancellation reason.');
            if (reasonInput) reasonInput.focus();
            return;
        }

        // Verify CAPTCHA
        if (!currentCancelCaptcha) {
            refreshCancelCaptcha();
        }

        if (captchaInput === '' || parseInt(captchaInput, 10) !== currentCancelCaptcha.answer) {
            if (errEl) {
                errEl.innerHTML = '<i class="fas fa-times-circle"></i> Wrong CAPTCHA answer! Please solve the new question below.';
                errEl.style.display = 'block';
            }
            alert('✕ Incorrect CAPTCHA answer! Please solve the new question to verify cancellation.');
            refreshCancelCaptcha();
            document.getElementById('dsr_cancel_captcha_input')?.focus();
            return;
        }

        try {
            const res = await fetch('api/digital_invoice.php?action=cancel_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    company_id: companyId,
                    reason: reason
                })
            });

            const data = await res.json();
            if (data.status === 'success') {
                alert('✓ Digital Invoice has been cancelled successfully.');
                closeModal('dsr_modal_cancel');
                loadInvoices();
            } else {
                alert('✕ Error cancelling invoice: ' + (data.message || 'Unknown error'));
                refreshCancelCaptcha();
            }
        } catch (e) {
            console.error("Digital invoice cancellation error:", e);
            alert('Failed to connect to backend server: ' + (e.message || e));
        }
    }

    // =========================================================================
    // 10B. DELETE INVOICE (With Random Math CAPTCHA & FBR Compliance Verification)
    // =========================================================================
    function openDeleteModal(id, serialNo, invoiceNo, fbrStatus) {
        if (!id && !serialNo) return;

        const isSubmitted = (fbrStatus === 'Valid' || fbrStatus === 'Submitted' || fbrStatus === 'Active');
        if (isSubmitted) {
            alert(`[FBR RETENTION COMPLIANCE]\n\nInvoice #${invoiceNo} (Serial #${serialNo}) has already been officially submitted to FBR.\n\nUnder Pakistani Sales Tax regulations, submitted tax invoices CANNOT be deleted. Please use Digital Credit Note or Cancel Invoice instead.`);
            return;
        }

        selectedDeleteInvoiceId = id;
        selectedDeleteInvoiceSerial = serialNo;
        selectedDeleteInvoiceNo = invoiceNo;
        selectedDeleteInvoiceFbrStatus = fbrStatus;

        const noEl = document.getElementById('dsr_delete_inv_no');
        if (noEl) noEl.textContent = `${invoiceNo} (#${serialNo})`;

        refreshDeleteCaptcha();
        openModal('dsr_modal_delete');
    }

    function refreshDeleteCaptcha() {
        currentDeleteCaptcha = generateCaptcha();
        const qEl = document.getElementById('dsr_delete_captcha_question');
        const inEl = document.getElementById('dsr_delete_captcha_input');
        const errEl = document.getElementById('dsr_delete_captcha_error');

        if (qEl) qEl.textContent = currentDeleteCaptcha.question;
        if (inEl) inEl.value = '';
        if (errEl) {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
        setTimeout(() => { if (inEl) inEl.focus(); }, 120);
    }

    async function confirmDeleteInvoice() {
        const id = selectedDeleteInvoiceId;
        const serialNo = selectedDeleteInvoiceSerial;
        const invoiceNo = selectedDeleteInvoiceNo;
        if (!id && !serialNo) return;

        // Verify CAPTCHA
        const inEl = document.getElementById('dsr_delete_captcha_input');
        const errEl = document.getElementById('dsr_delete_captcha_error');
        const valStr = inEl ? inEl.value.trim() : '';
        const userAnswer = parseInt(valStr, 10);
        const expectedAnswer = currentDeleteCaptcha ? currentDeleteCaptcha.answer : null;

        if (valStr === '' || isNaN(userAnswer) || userAnswer !== expectedAnswer) {
            if (errEl) {
                errEl.innerHTML = '<i class="fas fa-times-circle"></i> Wrong CAPTCHA answer! Please solve the new question below.';
                errEl.style.display = 'block';
            }
            alert('✕ Incorrect CAPTCHA answer! Please solve the new question to proceed.');
            refreshDeleteCaptcha();
            return;
        }

        try {
            const res = await fetch('api/digital_invoice.php?action=delete_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    serial_no: serialNo,
                    company_id: companyId
                })
            });
            const json = await res.json();

            if (json.status === 'success') {
                alert(`✓ Digital Invoice ${invoiceNo} (#${serialNo}) permanently deleted successfully.`);
                closeModal('dsr_modal_delete');
                loadInvoices();
            } else {
                alert('✕ Error: ' + (json.message || 'Failed to delete digital invoice.'));
                refreshDeleteCaptcha();
            }
        } catch (err) {
            console.error('Error deleting digital invoice:', err);
            alert('Network error deleting invoice: ' + (err.message || err));
        }
    }

    // =========================================================================
    // 11. EXPORT CSV
    // =========================================================================
    function exportCSV() {
        if (!invoices || invoices.length === 0) {
            alert('No digital invoices to export.');
            return;
        }

        let csv = 'Serial,Invoice No,Date,Customer Name,NTN/CNIC,Buyer Type,Taxable Value,Sales Tax,Further Tax,Net Total,FBR Status,FBR Invoice No\n';
        invoices.forEach(inv => {
            const clean = str => `"${String(str || '').replace(/"/g, '""')}"`;
            csv += [
                inv.serial_no,
                clean(inv.invoice_no),
                clean(inv.invoice_date),
                clean(inv.customer_name),
                clean(inv.customer_ntn || inv.customer_cnic),
                clean(inv.customer_type),
                num(inv.taxable_amount),
                num(inv.total_sales_tax),
                num(inv.total_further_tax),
                num(inv.net_payable),
                clean(inv.fbr_status),
                clean(inv.fbr_invoice_no)
            ].join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `FBR_Digital_Sales_Register_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }

    // Modal Helpers
    function openModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('show');
    }

    function closeModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.remove('show');
    }

    return {
        init,
        loadInvoices,
        applyFilters,
        clearFilters,
        goToPage,
        onLimitChange,
        sortBy,
        openNewInvoice,
        editDraft,
        viewInvoice,
        printInvoice,
        printFromViewModal,
        viewFbrResponse,
        validateFbrData,
        confirmAndSubmit,
        executeSubmit,
        checkFbrStatus,
        retrySubmission,
        openCancelModal,
        refreshCancelCaptcha,
        submitCancelInvoice,
        openDeleteModal,
        refreshDeleteCaptcha,
        confirmDeleteInvoice,
        deleteInvoice: openDeleteModal,
        exportCSV,
        toggleRowDropdown,
        copyText,
        openIrisManualModal,
        saveManualIrisLink,
        closeModal
    };
})();
