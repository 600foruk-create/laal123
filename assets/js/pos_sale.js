window.POSModule = {
    items: [],
    currentInvoiceId: null,
    currentInvoiceNo: null,
    isCurrentFbrPosted: false,
    currentHoldId: null,
    currentHoldNo: null,
    currentHoldDate: null,
    currentHoldCustomer: null,
    selectedCustomer: null,
    pendingHoldsList: [],
    posSettings: null,
    isSubmitting: false,
    _keyHandler: null,
    
    getTodayDateStr: function() {
        const d = new Date();
        const off = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - off).toISOString().split('T')[0];
    },
    
    init: function() {
        const editId = window.editingPosInvoiceId || null;
        window.editingPosInvoiceId = null;

        this.items = [];
        this.currentInvoiceId = null;
        this.currentInvoiceNo = null;
        this.isCurrentFbrPosted = false;
        this.currentHoldId = null;
        this.currentHoldNo = null;
        this.currentHoldDate = null;
        this.currentHoldCustomer = null;
        this.selectedCustomer = null;
        this.isSubmitting = false;

        const hiddenId = document.getElementById('pos_invoice_id');
        if (hiddenId) hiddenId.value = '';

        const banner = document.getElementById('pos_hold_active_banner');
        if (banner) banner.style.display = 'none';
        
        const statusText = document.getElementById('pos_action_status_text');
        if (statusText) statusText.innerHTML = 'Status: <strong style="color: #2b6cb0;">Ready for Sale</strong>';
        
        // Setup Date (Local Pakistan Date - Strictly Locked)
        const dateInput = document.getElementById('pos_date');
        if (dateInput) {
            dateInput.value = this.getTodayDateStr();
            dateInput.readOnly = true;
            dateInput.tabIndex = -1;
            dateInput.style.backgroundColor = '#edf2f7';
            dateInput.style.cursor = 'not-allowed';
            dateInput.style.pointerEvents = 'none';
            dateInput.onkeydown = (e) => { e.preventDefault(); return false; };
        }
        
        // Setup Customer (Branch Default Locked)
        const custSearch = document.getElementById('pos_customer_search');
        if(custSearch) {
            custSearch.readOnly = true;
            custSearch.style.cursor = 'not-allowed';
            custSearch.addEventListener('keydown', (e) => this.handleCustomerKeyDown(e));
        }
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.item-search-container')) {
                document.querySelectorAll('.item-dropdown').forEach(el => el.style.display = 'none');
            }
        });

        // Setup Branches
        const locSelect = document.getElementById('pos_branch');
        if(locSelect) {
            locSelect.innerHTML = '<option value="">Select Branch</option>';
            this.fetchBranches(locSelect);
            
            locSelect.addEventListener('change', () => {
                this.applyBranchDefaultCustomer();
                if (!this.currentInvoiceId) {
                    this.fetchNextInvoiceNo();
                }
            });
        }

        this.fetchInventory();
        this.fetchCustomers();
        this.fetchPosSettings();
        this.setupKeyboardShortcuts();
        this.updateFbrButtonState();

        if (editId) {
            this.loadInvoice(editId);
        } else {
            this.fetchNextInvoiceNo();
            // Start with 20 empty rows by default
            const tbody = document.getElementById('pos_items_body');
            if (tbody) {
                tbody.innerHTML = '';
                for(let i=0; i<20; i++) {
                    this.addNewRow();
                }
            }
            this.updateMobileEmptyState();
        }
    },

    setupKeyboardShortcuts: function() {
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
        }
        this._keyHandler = (e) => {
            // Check if POS Sale container is in active DOM
            if (!document.getElementById('posSaleContainer')) return;

            // F6: Hold Sale
            if (e.key === 'F6') {
                e.preventDefault();
                this.holdSale();
                return;
            }
            // F7: Recall Sale
            if (e.key === 'F7') {
                e.preventDefault();
                this.openRecallModal();
                return;
            }
            // Ctrl+S: Save Sale Locally
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.saveSaleLocally();
                return;
            }
            // Escape: Close Modals
            if (e.key === 'Escape') {
                const mRecall = document.getElementById('posModalRecall');
                const mHold = document.getElementById('posModalHoldReason');
                if (mRecall && mRecall.style.display === 'flex') {
                    this.closeRecallModal();
                    return;
                }
                if (mHold && mHold.style.display === 'flex') {
                    this.closeHoldModal();
                    return;
                }
            }
        };
        window.addEventListener('keydown', this._keyHandler);
    },

    fetchNextInvoiceNo: async function() {
        const hiddenId = document.getElementById('pos_invoice_id')?.value;
        if (this.currentInvoiceId || hiddenId || window.editingPosInvoiceId) return; // Keep existing invoice number if currently viewing / editing a saved invoice
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const branchSelect = document.getElementById('pos_branch');
            const branchId = (session.role === 'POS' && session.branch_id) 
                ? session.branch_id 
                : (branchSelect ? branchSelect.value : '');
            const companyId = session.company_id || 1;
            
            const res = await fetch(`api/sale_invoice.php?action=get_next_pos_invoice_no&branch_id=${encodeURIComponent(branchId)}&company_id=${companyId}`);
            if(res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    // Check again in case an invoice was loaded while fetch was in flight!
                    const currentHiddenId = document.getElementById('pos_invoice_id')?.value;
                    if (this.currentInvoiceId || currentHiddenId || window.editingPosInvoiceId) return;

                    this.currentSerialNo = data.serial_no;
                    this.currentPosInvoiceNo = data.next_invoice_no;
                    const invInput = document.getElementById('pos_inv_no');
                    if (invInput) {
                        invInput.value = data.next_invoice_no;
                        invInput.dataset.serial_no = data.serial_no;
                        invInput.dataset.pos_invoice_no = data.next_invoice_no;
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    formatInvoiceNo: function() {
        this.fetchNextInvoiceNo();
    },

    fetchBranches: async function(locSelect) {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || 1;
            const res = await fetch(`api/branch_settings.php?action=get_branches&company_id=${compId}`);
            if(res.ok) {
                const data = await res.json();
                if(data.success && data.branches) {
                    window.posBranches = data.branches;
                    locSelect.innerHTML = '<option value="">Select Branch</option>';
                    
                    const isPosUser = session.role === 'POS' && session.branch_id;
                    
                    data.branches.forEach(b => {
                        if (!isPosUser || String(b.id) === String(session.branch_id)) {
                            locSelect.appendChild(new Option(`${b.branch_code} - ${b.branch_name}`, b.id));
                        }
                    });
                    
                    if (isPosUser) {
                        locSelect.value = session.branch_id;
                        locSelect.disabled = true;
                        locSelect.title = "Restricted to your assigned branch";
                        locSelect.style.backgroundColor = '#e2e8f0';
                        locSelect.style.cursor = 'not-allowed';
                        locSelect.style.fontWeight = 'bold';
                        setTimeout(() => locSelect.dispatchEvent(new Event('change')), 200);
                    } else if (data.branches.length > 0) {
                        locSelect.value = data.branches[0].id;
                        setTimeout(() => locSelect.dispatchEvent(new Event('change')), 200);
                    }
                }
            }
        } catch(e) { console.error(e); }
    },

    fetchPosSettings: async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = window.selectedCompanyId || session.company_id || 1;

            // Local cache fallback
            const cached = localStorage.getItem('pos_rec_settings_' + compId);
            if (cached) {
                try { this.posSettings = JSON.parse(cached); } catch(e) {}
            }

            const res = await fetch(`api/pos_settings.php?action=get_settings&company_id=${compId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success || data.status === 'success') {
                    this.posSettings = data.settings || {};
                }
            }
        } catch(e) {
            console.error('Failed to load POS settings in POSModule:', e);
        }
    },

    fetchInventory: async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || session.user?.company_id || 1;
            const res = await fetch(`api/inventory.php?action=get_all_items&for_pos=1&company_id=${compId}&_cb=${Date.now()}`);
            if(res.ok) {
                const data = await res.json();
                this.posInventory = data;
                window.chartOfInventory = data;
                return data;
            }
        } catch(e) { console.error(e); }
        return [];
    },

    fetchCustomers: async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const res = await fetch(`api/maintain.php?action=get_all_customers&company_id=${session.company_id || 1}`);
            if(res.ok) {
                window.allCustomers = await res.json();
                this.applyBranchDefaultCustomer();
            }
        } catch(e) { console.error(e); }
    },

    applyBranchDefaultCustomer: function() {
        const locSelect = document.getElementById('pos_branch');
        const branchId = locSelect ? locSelect.value : '';
        if (!window.allCustomers || window.allCustomers.length === 0) return;

        let selectedCust = null;
        if (branchId && window.posBranches && window.posBranches.length > 0) {
            const b = window.posBranches.find(x => String(x.id) === String(branchId));
            if (b && b.default_customer_id) {
                selectedCust = window.allCustomers.find(c => String(c.id) === String(b.default_customer_id));
            }
        }
        
        // Fallback: look for walk-in / cash customer or first customer in database
        if (!selectedCust) {
            selectedCust = window.allCustomers.find(c => {
                const name = (c.name || '').toLowerCase();
                return name.includes('walk-in') || name.includes('cash');
            }) || window.allCustomers[0];
        }
        
        if (selectedCust) {
            this.selectCustomer(selectedCust);
        }
    },

    filterCustomers: function() {
        // Customer is locked to branch setting - do not open selection dropdown
        const dd = document.getElementById('pos_customer_dropdown');
        if (dd) dd.style.display = 'none';
    },

    handleCustomerKeyDown: function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const firstRowCode = document.querySelector('#pos_items_body tr .row-code');
            if (firstRowCode) {
                firstRowCode.focus();
                firstRowCode.select();
            }
        }
    },

    getEffectiveTaxRate: function() {
        // Strictly use Customer / Buyer Type (Customer Profile Level) tax rate:
        if (this.selectedCustomer) {
            const custSalesTax = (this.selectedCustomer.sales_tax_rate !== undefined && this.selectedCustomer.sales_tax_rate !== null && this.selectedCustomer.sales_tax_rate !== '')
                ? (parseFloat(this.selectedCustomer.sales_tax_rate) || 0)
                : 0;
            const custFurtherTax = (this.selectedCustomer.further_tax_rate !== undefined && this.selectedCustomer.further_tax_rate !== null && this.selectedCustomer.further_tax_rate !== '')
                ? (parseFloat(this.selectedCustomer.further_tax_rate) || 0)
                : 0;
            return custSalesTax + custFurtherTax;
        }
        return 0.00;
    },

    selectCustomer: function(c) {
        this.selectedCustomer = c;
        const searchInput = document.getElementById('pos_customer_search');
        const idInput = document.getElementById('pos_customer_id');
        const detailsInput = document.getElementById('pos_customer_details');
        const dd = document.getElementById('pos_customer_dropdown');

        if (searchInput) searchInput.value = c.code ? `${c.code} - ${c.name}` : c.name;
        if (idInput) idInput.value = c.id;
        if (detailsInput) detailsInput.value = c.address || 'N/A';
        if (dd) dd.style.display = 'none';
        this.custSuggestIndex = -1;

        // Auto apply effective tax rate to all rows
        const effectiveTax = this.getEffectiveTaxRate(null);
        const tbody = document.getElementById('pos_items_body');
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const taxInput = tr.querySelector('.row-taxrate');
                if (taxInput) {
                    taxInput.value = effectiveTax.toFixed(2);
                    this.calculateRow(taxInput);
                }
            });
        }
    },

    addNewRow: function(data = null) {
        const tbody = document.getElementById('pos_items_body');
        if (!tbody) return;
        const rowIndex = tbody.children.length + 1;
        
        const defaultTax = this.getEffectiveTaxRate(null).toFixed(2);

        const codeVal = data ? (data.item_code || '') : '';
        const idVal = data ? (data.item_coa_id || data.id || '') : '';
        const hsVal = data ? (data.hs_code || '') : '';
        const descVal = data ? (data.description || '') : '';
        const pcsVal = data ? parseFloat(data.pieces || 0).toFixed(2) : '0.00';
        const qtyVal = data ? parseFloat(data.quantity || 0).toFixed(2) : '0.00';
        const unitVal = data ? (data.unit || 'pcs') : '';
        const rateVal = data ? parseFloat(data.rate || 0).toFixed(2) : '0.00';
        const valExcl = data ? parseFloat(data.val_excl_tax || 0).toFixed(2) : '0.00';
        const taxRateVal = (data && data.sales_tax_rate !== undefined && data.sales_tax_rate !== null) ? parseFloat(data.sales_tax_rate).toFixed(2) : defaultTax;
        const taxAmtVal = data ? parseFloat(data.sales_tax_amount || 0).toFixed(2) : '0.00';
        const valIncl = data ? parseFloat(data.val_incl_tax || 0).toFixed(2) : '0.00';

        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        if (data && data.qty_per_piece) {
            tr.dataset.qtyPerPiece = data.qty_per_piece;
        }

        if (!idVal || idVal === '' || idVal === '0') {
            tr.classList.add('pos-row-empty');
        } else {
            tr.classList.add('pos-row-has-item');
        }

        tr.innerHTML = `
            <td class="col-index" style="padding: 2px 4px; border-bottom: 1px solid #cbd5e0; text-align: center; color: #777; font-weight: 500;">${rowIndex}</td>
            <td class="col-code" style="padding: 0; border-bottom: 1px solid #cbd5e0;">
                <div class="item-search-container" style="height: 100%;">
                    <input type="text" class="pos-grid-input row-code" value="${codeVal}" placeholder="" autocomplete="off">
                    <input type="hidden" class="row-id" value="${idVal}">
                    <div class="item-dropdown" id="item_dropdown_${rowIndex}"></div>
                </div>
            </td>
            <td class="col-hscode" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="text" class="pos-grid-input row-hscode" value="${hsVal}" tabindex="-1"></td>
            <td class="col-desc" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="text" class="pos-grid-input row-desc" value="${descVal}" tabindex="-1"></td>
            <td class="col-pcs" style="padding: 0; border-bottom: 1px solid #cbd5e0;">
                <div class="pos-pcs-wrap">
                    <button type="button" class="pos-pcs-step-btn pos-pcs-minus" onclick="POSModule.stepPieces(this, -1)" tabindex="-1">-</button>
                    <input type="number" step="any" class="pos-grid-input num row-pcs" value="${pcsVal}">
                    <button type="button" class="pos-pcs-step-btn pos-pcs-plus" onclick="POSModule.stepPieces(this, 1)" tabindex="-1">+</button>
                </div>
            </td>
            <td class="col-qty" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="number" step="any" class="pos-grid-input num row-qty" value="${qtyVal}" tabindex="-1"></td>
            <td class="col-unit" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="text" class="pos-grid-input row-unit" value="${unitVal}" tabindex="-1"></td>
            <td class="col-rate" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="number" step="any" class="pos-grid-input num row-rate" value="${rateVal}"></td>
            <td class="col-excl" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="text" class="pos-grid-readonly row-val-excl" value="${valExcl}" readonly tabindex="-1"></td>
            <td class="col-taxrate" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="number" step="any" class="pos-grid-input num row-taxrate" value="${taxRateVal}" tabindex="-1"></td>
            <td class="col-taxamt" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="text" class="pos-grid-readonly row-taxamt" value="${taxAmtVal}" readonly tabindex="-1"></td>
            <td class="col-incl" style="padding: 0; border-bottom: 1px solid #cbd5e0;"><input type="text" class="pos-grid-readonly row-val-incl" value="${valIncl}" readonly tabindex="-1" style="color:#d35400;"></td>
            <td class="col-action" style="padding: 2px; border-bottom: 1px solid #cbd5e0; text-align: center;">
                <button type="button" class="pos-btn pos-btn-danger" style="padding: 1px 4px; font-size: 10px; margin: 0 auto;" onclick="POSModule.removeRow(this)" tabindex="-1" title="Delete Row"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
        this.bindRowEvents(tr, rowIndex);
        this.updateSerialNumbers();
        this.updateMobileEmptyState();
    },

    bindRowEvents: function(tr, rowIndex) {
        const codeInput = tr.querySelector('.row-code');
        const hsInput = tr.querySelector('.row-hscode');
        const descInput = tr.querySelector('.row-desc');
        const pcsInput = tr.querySelector('.row-pcs');
        const qtyInput = tr.querySelector('.row-qty');
        const unitInput = tr.querySelector('.row-unit');
        const rateInput = tr.querySelector('.row-rate');
        const taxRateInput = tr.querySelector('.row-taxrate');

        if (codeInput) {
            codeInput.addEventListener('input', () => this.filterItems(codeInput, rowIndex));
            codeInput.addEventListener('focus', () => {
                codeInput.select();
                if (codeInput.value.trim() !== '') {
                    this.filterItems(codeInput, rowIndex);
                }
            });
            codeInput.addEventListener('click', () => codeInput.select());
            codeInput.addEventListener('keydown', (e) => this.handleItemCodeKeyDown(e, codeInput, rowIndex));
        }

        if (hsInput) {
            hsInput.addEventListener('focus', () => hsInput.select());
            hsInput.addEventListener('click', () => hsInput.select());
            hsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (pcsInput) { pcsInput.focus(); pcsInput.select(); }
                }
            });
        }

        if (descInput) {
            descInput.addEventListener('focus', () => descInput.select());
            descInput.addEventListener('click', () => descInput.select());
            descInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (pcsInput) { pcsInput.focus(); pcsInput.select(); }
                }
            });
        }

        if (pcsInput) {
            pcsInput.addEventListener('input', () => this.calculateRow(pcsInput));
            pcsInput.addEventListener('focus', () => pcsInput.select());
            pcsInput.addEventListener('click', () => pcsInput.select());
            pcsInput.addEventListener('keydown', (e) => this.handlePiecesKeyDown(e, pcsInput));
        }

        if (qtyInput) {
            qtyInput.addEventListener('input', () => this.calculateRow(qtyInput));
            qtyInput.addEventListener('focus', () => qtyInput.select());
            qtyInput.addEventListener('click', () => qtyInput.select());
            qtyInput.addEventListener('keydown', (e) => this.handleQtyKeyDown(e, qtyInput));
        }

        if (unitInput) {
            unitInput.addEventListener('focus', () => unitInput.select());
            unitInput.addEventListener('click', () => unitInput.select());
            unitInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (rateInput) { rateInput.focus(); rateInput.select(); }
                }
            });
        }

        if (rateInput) {
            rateInput.addEventListener('input', () => this.calculateRow(rateInput));
            rateInput.addEventListener('focus', () => rateInput.select());
            rateInput.addEventListener('click', () => rateInput.select());
            rateInput.addEventListener('keydown', (e) => this.handleRateKeyDown(e, rateInput));
        }

        if (taxRateInput) {
            taxRateInput.addEventListener('input', () => this.calculateRow(taxRateInput));
            taxRateInput.addEventListener('focus', () => taxRateInput.select());
            taxRateInput.addEventListener('click', () => taxRateInput.select());
            taxRateInput.addEventListener('keydown', (e) => this.handleTaxRateKeyDown(e, taxRateInput));
        }
    },

    removeRow: function(btn) {
        const tr = btn.closest('tr');
        tr.remove();
        this.updateSerialNumbers();
        this.calculateGrandTotal();
        this.updateMobileEmptyState();
        
        // Ensure at least 20 rows exist
        const tbody = document.getElementById('pos_items_body');
        if (tbody && tbody.children.length < 20) {
            while (tbody.children.length < 20) {
                this.addNewRow();
            }
        }
    },

    updateSerialNumbers: function() {
        const tbody = document.getElementById('pos_items_body');
        if (!tbody) return;
        Array.from(tbody.children).forEach((tr, idx) => {
            if (tr.children[0]) tr.children[0].textContent = idx + 1;
        });
    },

    filterItems: function(inputEl, rowIndex) {
        const dd = document.getElementById(`item_dropdown_${rowIndex}`);
        if (!dd) return;
        const query = (inputEl.value || '').toLowerCase().trim();
        const tr = inputEl.closest('tr');
        if (!query) { 
            dd.style.display = 'none'; 
            if (tr) {
                tr._matches = [];
                tr._suggestIndex = -1;
            }
            return; 
        }
        
        let products = this.posInventory || window.chartOfInventory || [];
        
        // Multi-word search matching code or name
        const searchWords = query.split(/\s+/);
        const matches = products.filter(p => {
            const code = (p.code || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            const combined = `${code} ${name}`;
            return searchWords.every(w => combined.includes(w));
        });
        
        if (tr) {
            tr._matches = matches.slice(0, 20);
            tr._suggestIndex = -1;
        }
        
        dd.innerHTML = '';
        if (!matches || matches.length === 0) {
            dd.innerHTML = '<div class="pos-dd-empty">No matching items found</div>';
        } else {
            (tr ? tr._matches : matches.slice(0, 20)).forEach((p, idx) => {
                const div = document.createElement('div');
                div.className = 'pos-dd-item';
                div.innerHTML = `
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">
                        <b>${p.code || ''}</b> - ${p.name}
                    </div>
                    <div class="pos-dd-price">Rs ${parseFloat(p.selling_price || 0).toFixed(2)}</div>
                `;
                div.onmouseenter = () => {
                    if (tr) tr._suggestIndex = idx;
                    this.updateItemSuggestHighlight(dd.querySelectorAll('.pos-dd-item'), idx);
                };
                div.onclick = () => {
                    this.selectItem(inputEl, p);
                };
                dd.appendChild(div);
            });
        }
        dd.style.display = 'block';
    },

    updateItemSuggestHighlight: function(items, activeIdx) {
        items.forEach((item, idx) => {
            if (idx === activeIdx) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    },

    handleItemCodeKeyDown: function(e, inputEl, rowIndex) {
        const tr = inputEl.closest('tr');
        const dd = document.getElementById(`item_dropdown_${rowIndex}`);
        const isVisible = dd && dd.style.display !== 'none';
        const items = dd ? Array.from(dd.querySelectorAll('.pos-dd-item')) : [];

        if (e.key === 'ArrowDown') {
            if (isVisible && items.length > 0) {
                e.preventDefault();
                tr._suggestIndex = Math.min((tr._suggestIndex === undefined ? -1 : tr._suggestIndex) + 1, items.length - 1);
                this.updateItemSuggestHighlight(items, tr._suggestIndex);
                return;
            } else {
                e.preventDefault();
                const nextTr = tr.nextElementSibling;
                if (nextTr) {
                    const nextInput = nextTr.querySelector('.row-code');
                    if (nextInput) { nextInput.focus(); nextInput.select(); }
                }
                return;
            }
        } else if (e.key === 'ArrowUp') {
            if (isVisible && items.length > 0) {
                e.preventDefault();
                tr._suggestIndex = Math.max((tr._suggestIndex || 0) - 1, 0);
                this.updateItemSuggestHighlight(items, tr._suggestIndex);
                return;
            } else {
                e.preventDefault();
                const prevTr = tr.previousElementSibling;
                if (prevTr) {
                    const prevInput = prevTr.querySelector('.row-code');
                    if (prevInput) { prevInput.focus(); prevInput.select(); }
                }
                return;
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (isVisible && items.length > 0 && tr._matches && tr._matches.length > 0) {
                const idx = (tr._suggestIndex >= 0 && tr._suggestIndex < tr._matches.length) ? tr._suggestIndex : 0;
                this.selectItem(inputEl, tr._matches[idx]);
            } else {
                if (dd) dd.style.display = 'none';
                const pcsInput = tr.querySelector('.row-pcs');
                if (pcsInput) {
                    pcsInput.focus();
                    pcsInput.select();
                }
            }
            return;
        } else if (e.key === 'Escape') {
            if (dd) dd.style.display = 'none';
            tr._suggestIndex = -1;
            return;
        }
    },

    handlePiecesKeyDown: function(e, pcsInput) {
        const tr = pcsInput.closest('tr');
        if (e.key === 'Enter') {
            e.preventDefault();
            // Enter on pieces -> shift cursor directly to rate input!
            const rateInput = tr.querySelector('.row-rate');
            if (rateInput) {
                rateInput.focus();
                rateInput.select();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextPcs = nextTr.querySelector('.row-pcs');
                if (nextPcs) { nextPcs.focus(); nextPcs.select(); }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevPcs = prevTr.querySelector('.row-pcs');
                if (prevPcs) { prevPcs.focus(); prevPcs.select(); }
            }
        }
    },

    handleQtyKeyDown: function(e, qtyInput) {
        const tr = qtyInput.closest('tr');
        if (e.key === 'Enter') {
            e.preventDefault();
            const rateInput = tr.querySelector('.row-rate');
            if (rateInput) {
                rateInput.focus();
                rateInput.select();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextQty = nextTr.querySelector('.row-qty');
                if (nextQty) { nextQty.focus(); nextQty.select(); }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevQty = prevTr.querySelector('.row-qty');
                if (prevQty) { prevQty.focus(); prevQty.select(); }
            }
        }
    },

    handleRateKeyDown: function(e, rateInput) {
        const tr = rateInput.closest('tr');
        if (e.key === 'Enter') {
            e.preventDefault();
            // Enter on rate -> shift cursor to next row's item code input!
            let nextTr = tr.nextElementSibling;
            if (!nextTr) {
                this.addNewRow();
                nextTr = tr.nextElementSibling;
            }
            if (nextTr) {
                const nextCode = nextTr.querySelector('.row-code');
                if (nextCode) {
                    nextCode.focus();
                    nextCode.select();
                }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextRate = nextTr.querySelector('.row-rate');
                if (nextRate) { nextRate.focus(); nextRate.select(); }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevRate = prevTr.querySelector('.row-rate');
                if (prevRate) { prevRate.focus(); prevRate.select(); }
            }
        }
    },

    handleTaxRateKeyDown: function(e, taxInput) {
        const tr = taxInput.closest('tr');
        if (e.key === 'Enter') {
            e.preventDefault();
            let nextTr = tr.nextElementSibling;
            if (!nextTr) {
                this.addNewRow();
                nextTr = tr.nextElementSibling;
            }
            if (nextTr) {
                const nextCode = nextTr.querySelector('.row-code');
                if (nextCode) {
                    nextCode.focus();
                    nextCode.select();
                }
            }
        }
    },

    selectItem: function(inputEl, product) {
        const tr = inputEl.closest('tr');
        if (!tr) return;

        tr.classList.remove('pos-row-empty');
        tr.classList.add('pos-row-has-item');

        tr.dataset.qtyPerPiece = product.qty_per_piece || 0;
        tr.querySelector('.row-code').value = product.code || product.name;
        tr.querySelector('.row-id').value = product.id;
        tr.querySelector('.row-hscode').value = product.hs_code || '';
        tr.querySelector('.row-desc').value = product.name;
        tr.querySelector('.row-unit').value = product.unit || 'pcs';
        tr.querySelector('.row-rate').value = parseFloat(product.selling_price || 0).toFixed(2);
        
        let applyTaxRate = this.getEffectiveTaxRate();
        tr.querySelector('.row-taxrate').value = applyTaxRate.toFixed(2);
        tr.querySelector('.row-pcs').value = '1.00';
        
        const qpp = parseFloat(product.qty_per_piece) || 0;
        tr.querySelector('.row-qty').value = (qpp > 0 ? qpp * 1 : 1).toFixed(2);
        
        const dd = tr.querySelector('.item-dropdown');
        if (dd) dd.style.display = 'none';
        tr._suggestIndex = -1;
        
        this.calculateRow(tr.querySelector('.row-qty'));
        this.updateMobileEmptyState();
        
        // Shift cursor directly to pieces input!
        const pcsInput = tr.querySelector('.row-pcs');
        if (pcsInput) {
            pcsInput.focus();
            pcsInput.select();
        }
    },

    calculateRow: function(el) {
        const tr = el ? el.closest('tr') : null;
        if (!tr) return;

        if (el && el.classList.contains('row-pcs')) {
            const pcs = parseFloat(tr.querySelector('.row-pcs')?.value) || 0;
            const qpp = parseFloat(tr.dataset.qtyPerPiece) || 0;
            if (qpp > 0) {
                tr.querySelector('.row-qty').value = (pcs * qpp).toFixed(2);
            } else {
                tr.querySelector('.row-qty').value = pcs.toFixed(2);
            }
        }

        const qty = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
        const rate = parseFloat(tr.querySelector('.row-rate')?.value) || 0;
        const taxRate = parseFloat(tr.querySelector('.row-taxrate')?.value) || 0;
        
        const exclTax = qty * rate;
        const taxAmt = exclTax * (taxRate / 100);
        const inclTax = exclTax + taxAmt;
        
        if (tr.querySelector('.row-val-excl')) tr.querySelector('.row-val-excl').value = exclTax.toFixed(2);
        if (tr.querySelector('.row-taxamt')) tr.querySelector('.row-taxamt').value = taxAmt.toFixed(2);
        if (tr.querySelector('.row-val-incl')) tr.querySelector('.row-val-incl').value = inclTax.toFixed(2);
        
        this.calculateGrandTotal();
    },

    calculateGrandTotal: function() {
        let totalPcs = 0, totalQty = 0, totalExcl = 0, totalTax = 0, totalIncl = 0;
        
        const tbody = document.getElementById('pos_items_body');
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                totalPcs += parseFloat(tr.querySelector('.row-pcs')?.value) || 0;
                totalQty += parseFloat(tr.querySelector('.row-qty')?.value) || 0;
                totalExcl += parseFloat(tr.querySelector('.row-val-excl')?.value) || 0;
                totalTax += parseFloat(tr.querySelector('.row-taxamt')?.value) || 0;
                totalIncl += parseFloat(tr.querySelector('.row-val-incl')?.value) || 0;
            });
        }
        
        const fPcs = document.getElementById('footer_total_pieces');
        const fQty = document.getElementById('footer_total_qty');
        const fExcl = document.getElementById('footer_val_excl_tax');
        const fTax = document.getElementById('footer_total_tax');
        const fIncl = document.getElementById('footer_val_incl_tax');

        const fmtMoney = (val) => (parseFloat(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (fPcs) fPcs.textContent = (totalPcs % 1 === 0 ? totalPcs.toFixed(0) : totalPcs.toFixed(2));
        if (fQty) fQty.textContent = (totalQty % 1 === 0 ? totalQty.toFixed(0) : totalQty.toFixed(2));
        if (fExcl) fExcl.textContent = fmtMoney(totalExcl);
        if (fTax) fTax.textContent = fmtMoney(totalTax);
        if (fIncl) fIncl.textContent = fmtMoney(totalIncl);
        
        const globalDiscInput = document.getElementById('pos_global_discount');
        const globalDisc = parseFloat(globalDiscInput ? globalDiscInput.value.replace(/,/g, '') : 0) || 0;
        
        const totalAfterDisc = totalExcl - globalDisc;
        const netTotal = totalAfterDisc + totalTax;
        
        const elGross = document.getElementById('pos_gross_amount');
        const elTotalDisc = document.getElementById('pos_total_after_disc');
        const elTax = document.getElementById('pos_bottom_tax');
        const elNet = document.getElementById('pos_net_total');
        
        if(elGross) elGross.textContent = fmtMoney(totalExcl);
        if(elTotalDisc) elTotalDisc.textContent = fmtMoney(totalAfterDisc);
        if(elTax) elTax.textContent = fmtMoney(totalTax);
        if(elNet) elNet.textContent = fmtMoney(netTotal);

        // Update Mobile Summary Elements
        const mItemsCount = document.getElementById('pos_m_items_count');
        const mNet = document.getElementById('pos_m_net_total');
        const mGross = document.getElementById('pos_m_gross');
        const mTax = document.getElementById('pos_m_tax');
        const mDisc = document.getElementById('pos_m_discount');

        let validCount = 0;
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const idVal = tr.querySelector('.row-id')?.value;
                const qtyVal = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
                if (idVal && parseFloat(idVal) > 0 && qtyVal > 0) validCount++;
            });
        }

        if (mItemsCount) mItemsCount.textContent = validCount;
        if (mNet) mNet.textContent = fmtMoney(netTotal);
        if (mGross) mGross.textContent = fmtMoney(totalExcl);
        if (mTax) mTax.textContent = fmtMoney(totalTax);
        if (mDisc && document.activeElement !== mDisc) {
            mDisc.value = globalDisc.toFixed(2);
        }

        this.updateMobileEmptyState();
    },

    // =========================================================================
    // HOLD SALE FUNCTIONALITY
    // =========================================================================
    holdSale: function() {
        const tbody = document.getElementById('pos_items_body');
        if (!tbody) return;

        let validItemCount = 0;
        Array.from(tbody.children).forEach(tr => {
            const idVal = tr.querySelector('.row-id')?.value;
            const qtyVal = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
            if (idVal && parseFloat(idVal) > 0 && qtyVal > 0) {
                validItemCount++;
            }
        });

        if (validItemCount === 0) {
            alert('Cannot put empty sale on hold. Please add at least one item.');
            return;
        }

        const netTotalEl = document.getElementById('pos_net_total');
        const netTotalText = netTotalEl ? netTotalEl.textContent : '0.00';

        // Update Hold Modal summary
        const countEl = document.getElementById('posHoldItemsCount');
        const totalEl = document.getElementById('posHoldNetTotal');
        const reasonInput = document.getElementById('posHoldReasonInput');

        if (countEl) countEl.textContent = `${validItemCount} item${validItemCount > 1 ? 's' : ''}`;
        if (totalEl) totalEl.textContent = `Rs ${netTotalText}`;
        if (reasonInput) {
            reasonInput.value = '';
            setTimeout(() => reasonInput.focus(), 150);
        }

        // Show Modal
        const modal = document.getElementById('posModalHoldReason');
        if (modal) modal.style.display = 'flex';
    },

    closeHoldModal: function() {
        const modal = document.getElementById('posModalHoldReason');
        if (modal) modal.style.display = 'none';
    },

    setHoldReason: function(text) {
        const input = document.getElementById('posHoldReasonInput');
        if (input) {
            input.value = text;
            input.focus();
        }
    },

    confirmHoldSale: async function() {
        if (this.isSubmitting) return;

        const tbody = document.getElementById('pos_items_body');
        const items = [];
        Array.from(tbody.children).forEach(tr => {
            const idVal = tr.querySelector('.row-id')?.value;
            const qtyVal = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
            if (idVal && parseFloat(idVal) > 0 && qtyVal > 0) {
                items.push({
                    item_coa_id: idVal,
                    item_code: tr.querySelector('.row-code')?.value || '',
                    hs_code: tr.querySelector('.row-hscode')?.value || '',
                    description: tr.querySelector('.row-desc')?.value || '',
                    pieces: parseFloat(tr.querySelector('.row-pcs')?.value) || 0,
                    quantity: qtyVal,
                    unit: tr.querySelector('.row-unit')?.value || 'pcs',
                    rate: parseFloat(tr.querySelector('.row-rate')?.value) || 0,
                    val_excl_tax: parseFloat(tr.querySelector('.row-val-excl')?.value) || 0,
                    sales_tax_rate: parseFloat(tr.querySelector('.row-taxrate')?.value) || 0,
                    sales_tax_amount: parseFloat(tr.querySelector('.row-taxamt')?.value) || 0,
                    val_incl_tax: parseFloat(tr.querySelector('.row-val-incl')?.value) || 0
                });
            }
        });

        if (items.length === 0) {
            alert('Cannot put empty sale on hold. Please add at least one item.');
            this.closeHoldModal();
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const branchSelect = document.getElementById('pos_branch');
        const branchId = (session.role === 'POS' && session.branch_id) 
            ? session.branch_id 
            : (branchSelect ? branchSelect.value : null);
        let branchName = (session.role === 'POS' && session.branch_name) 
            ? session.branch_name 
            : '';
        if (!branchName && branchSelect && branchSelect.selectedIndex >= 0) {
            branchName = branchSelect.options[branchSelect.selectedIndex].text;
        }

        const customerId = document.getElementById('pos_customer_id')?.value || 0;
        const customerSearch = document.getElementById('pos_customer_search')?.value || 'Walk-in Customer';
        const customerDetails = document.getElementById('pos_customer_details')?.value || '';
        const globalDiscount = parseFloat(document.getElementById('pos_global_discount')?.value) || 0;
        const grossAmount = parseFloat(document.getElementById('pos_gross_amount')?.textContent.replace(/,/g, '')) || 0;
        const totalAfterDisc = parseFloat(document.getElementById('pos_total_after_disc')?.textContent.replace(/,/g, '')) || 0;
        const taxAmount = parseFloat(document.getElementById('pos_bottom_tax')?.textContent.replace(/,/g, '')) || 0;
        const netTotal = parseFloat(document.getElementById('pos_net_total')?.textContent.replace(/,/g, '')) || 0;
        const reasonInput = document.getElementById('posHoldReasonInput')?.value.trim() || 'Temporary Hold';

        const payload = {
            action: 'hold_sale',
            company_id: session.company_id || 1,
            branch_id: branchId,
            branch_name: branchName,
            customer_id: customerId,
            customer_name: customerSearch,
            customer_mobile: '',
            customer_address: customerDetails,
            subtotal: grossAmount,
            discount: globalDiscount,
            total_after_disc: totalAfterDisc,
            tax_amount: taxAmount,
            net_total: netTotal,
            hold_reason: reasonInput,
            cashier_user_id: session.id || session.user_id || null,
            cashier_name: session.name || session.username || 'Cashier',
            terminal_info: window.location.hostname || 'POS-Terminal',
            items: items
        };

        this.isSubmitting = true;
        const btnConfirm = document.getElementById('btnConfirmHold');
        if (btnConfirm) btnConfirm.disabled = true;

        try {
            const res = await fetch('api/pos_hold_sale.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.closeHoldModal();
                // Clear the form for next sale
                this.resetFormSilent();
                this.currentHoldId = null;
                this.currentHoldNo = null;

                const banner = document.getElementById('pos_hold_active_banner');
                if (banner) banner.style.display = 'none';

                const statusText = document.getElementById('pos_action_status_text');
                if (statusText) statusText.innerHTML = `Last Hold: <strong style="color: #d97706;">${data.hold_no}</strong>`;

                alert(`Sale successfully put on hold.\n\nHold Number: ${data.hold_no}\nItems: ${data.items_count}\nGrand Total: Rs ${parseFloat(data.net_total || 0).toLocaleString()}`);
            } else {
                alert('Error putting sale on hold: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server to put sale on hold.');
        } finally {
            this.isSubmitting = false;
            if (btnConfirm) btnConfirm.disabled = false;
        }
    },

    // =========================================================================
    // RECALL SALE FUNCTIONALITY
    // =========================================================================
    openRecallModal: async function() {
        const modal = document.getElementById('posModalRecall');
        if (modal) modal.style.display = 'flex';

        // Clear search inputs
        const sInput = document.getElementById('posRecallSearch');
        const dInput = document.getElementById('posRecallDate');
        if (sInput) sInput.value = '';
        if (dInput) dInput.value = '';

        await this.loadPendingHolds();
    },

    closeRecallModal: function() {
        const modal = document.getElementById('posModalRecall');
        if (modal) modal.style.display = 'none';
    },

    loadPendingHolds: async function() {
        const tbody = document.getElementById('posRecallTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 30px; color: #a0aec0;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 20px;"></i>
                        <div style="margin-top: 6px;">Loading pending hold sales...</div>
                    </td>
                </tr>
            `;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const sVal = document.getElementById('posRecallSearch')?.value.trim() || '';
        const dVal = document.getElementById('posRecallDate')?.value.trim() || '';

        try {
            let url = `api/pos_hold_sale.php?action=get_pending_holds&company_id=${session.company_id || 1}&include_recalled=1`;
            if (session.role === 'POS' && session.branch_id) {
                url += `&branch_id=${encodeURIComponent(session.branch_id)}`;
            }
            if (sVal) url += `&search=${encodeURIComponent(sVal)}`;
            if (dVal) url += `&date=${encodeURIComponent(dVal)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'success') {
                this.pendingHoldsList = data.holds || [];
                this.renderRecallTable(this.pendingHoldsList);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #e53e3e; padding: 20px;">Error loading hold sales: ${data.message}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #e53e3e; padding: 20px;">Failed to load hold sales from server.</td></tr>`;
        }
    },

    renderRecallTable: function(holds) {
        const tbody = document.getElementById('posRecallTableBody');
        const countEl = document.getElementById('posRecallCount');
        if (countEl) countEl.textContent = holds.length;

        if (!tbody) return;

        if (holds.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 35px 20px; color: #718096;">
                        <i class="fas fa-inbox" style="font-size: 32px; color: #cbd5e0; margin-bottom: 8px;"></i>
                        <div style="font-weight: 600; font-size: 14px;">No Pending Hold Sales Found</div>
                        <div style="font-size: 12px; color: #a0aec0; margin-top: 4px;">Put sales on hold using the Hold Sale button (F6).</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = holds.map(h => {
            const statusBadge = h.status === 'Recalled'
                ? `<span class="pos-badge" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;"><i class="fas fa-clock"></i> Recalled</span>`
                : `<span class="pos-badge" style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a;"><i class="fas fa-pause-circle"></i> On Hold</span>`;

            return `
                <tr style="border-bottom: 1px solid #edf2f7; transition: background 0.15s;" onmouseover="this.style.background='#f7fafc'" onmouseout="this.style.background='white'">
                    <td style="padding: 8px 10px; font-weight: 700; color: #1F4E79;">
                        ${h.hold_no}
                    </td>
                    <td style="padding: 8px 10px; color: #4a5568;">
                        ${h.hold_date || (h.formatted_datetime ? h.formatted_datetime.split(' ')[0] : '--')}
                    </td>
                    <td style="padding: 8px 10px;">
                        <strong style="color: #2d3748;">${h.customer_name || 'Walk-in Customer'}</strong>
                        ${h.customer_mobile ? `<div style="font-size: 11px; color: #718096;">${h.customer_mobile}</div>` : ''}
                        ${h.hold_reason ? `<div style="font-size: 10px; color: #b45309; font-style: italic;"><i class="fas fa-comment-alt"></i> ${h.hold_reason}</div>` : ''}
                    </td>
                    <td style="padding: 8px 10px; color: #4a5568;">
                        ${h.branch_name || 'Main Branch'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 600;">
                        ${h.items_count}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #d97706;">
                        Rs ${parseFloat(h.net_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                    <td style="padding: 8px 10px; color: #4a5568; font-size: 11px;">
                        ${h.cashier_name || 'Cashier'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 8px 10px; text-align: center;">
                        <button type="button" class="pos-btn pos-btn-indigo" style="padding: 3px 10px; font-size: 11px; margin: 0 auto;" onclick="POSModule.recallHold(${h.id})">
                            <i class="fas fa-download"></i> Recall
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    filterRecallList: function() {
        this.loadPendingHolds();
    },

    resetRecallFilters: function() {
        const sInput = document.getElementById('posRecallSearch');
        const dInput = document.getElementById('posRecallDate');
        if (sInput) sInput.value = '';
        if (dInput) dInput.value = '';
        this.loadPendingHolds();
    },

    recallHold: async function(holdId) {
        if (this.isSubmitting) return;

        // Check if current form has items that might be overwritten
        const tbody = document.getElementById('pos_items_body');
        let currentItemCount = 0;
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const idVal = tr.querySelector('.row-id')?.value;
                if (idVal && parseFloat(idVal) > 0) currentItemCount++;
            });
        }

        if (currentItemCount > 0) {
            if (!confirm('Recalling this hold will replace current unsaved items in the POS Sale form. Do you want to continue?')) {
                return;
            }
        }

        this.isSubmitting = true;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');

        try {
            const res = await fetch('api/pos_hold_sale.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'recall_hold',
                    hold_id: holdId,
                    company_id: session.company_id || 1,
                    cashier_user_id: session.id || session.user_id || null,
                    cashier_name: session.name || session.username || 'Cashier'
                })
            });
            const data = await res.json();

            if (data.status === 'success' && data.hold) {
                const hold = data.hold;
                this.populateFormFromHold(hold);
                this.closeRecallModal();
            } else {
                alert('Cannot recall hold sale: ' + (data.message || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server to recall hold sale.');
        } finally {
            this.isSubmitting = false;
        }
    },

    populateFormFromHold: function(hold) {
        this.currentHoldId = hold.id;
        this.currentHoldNo = hold.hold_no;
        this.currentHoldDate = hold.hold_date;
        this.currentHoldCustomer = hold.customer_name;

        // 1. Set Branch
        const locSelect = document.getElementById('pos_branch');
        if (locSelect && hold.branch_id) {
            locSelect.value = hold.branch_id;
            this.formatInvoiceNo();
        }

        // 2. Set Customer
        const searchInput = document.getElementById('pos_customer_search');
        const idInput = document.getElementById('pos_customer_id');
        const detailsInput = document.getElementById('pos_customer_details');

        if (searchInput) searchInput.value = hold.customer_name || 'Walk-in Customer';
        if (idInput) idInput.value = hold.customer_id || 0;
        if (detailsInput) detailsInput.value = hold.customer_address || '';

        // 3. Clear Grid and Populate Items
        const tbody = document.getElementById('pos_items_body');
        if (tbody) {
            tbody.innerHTML = '';
            const items = hold.items || [];
            
            items.forEach((item) => {
                this.addNewRow(item);
            });

            // Ensure by default at least 20 rows
            const currentRows = tbody.children.length;
            for (let i = currentRows; i < 20; i++) {
                this.addNewRow();
            }
        }

        // 4. Set Global Discount
        const discInput = document.getElementById('pos_global_discount');
        if (discInput) {
            discInput.value = parseFloat(hold.discount || 0).toFixed(2);
        }

        // 5. Calculate Totals
        this.calculateGrandTotal();

        // 6. Show Banner & Update Status
        const banner = document.getElementById('pos_hold_active_banner');
        if (banner) {
            document.getElementById('pos_hold_active_no').textContent = hold.hold_no;
            document.getElementById('pos_hold_active_date').textContent = hold.hold_date || (hold.formatted_datetime ? hold.formatted_datetime.split(' ')[0] : '--');
            document.getElementById('pos_hold_active_cust').textContent = hold.customer_name || 'Walk-in Customer';
            banner.style.display = 'flex';
        }

        const statusText = document.getElementById('pos_action_status_text');
        if (statusText) {
            statusText.innerHTML = `Active Hold: <strong style="color: #d97706;">${hold.hold_no}</strong> (Recalled)`;
        }
    },

    discardRecalledHold: function() {
        if (!confirm(`Discard the link to Hold sale ${this.currentHoldNo}?\n\nThe hold record will remain safely stored in the database, but this screen will be treated as an independent sale.`)) {
            return;
        }

        this.currentHoldId = null;
        this.currentHoldNo = null;

        const banner = document.getElementById('pos_hold_active_banner');
        if (banner) banner.style.display = 'none';

        const statusText = document.getElementById('pos_action_status_text');
        if (statusText) {
            statusText.innerHTML = 'Status: <strong style="color: #2b6cb0;">Ready for Sale</strong>';
        }
    },

    // =========================================================================
    // CLEAR SALE & RESET
    // =========================================================================
    clearSale: function() {
        const tbody = document.getElementById('pos_items_body');
        let currentItemCount = 0;
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const idVal = tr.querySelector('.row-id')?.value;
                if (idVal && parseFloat(idVal) > 0) currentItemCount++;
            });
        }

        let confirmMsg = 'Are you sure you want to clear this POS Sale form?';
        if (this.currentHoldId) {
            confirmMsg += `\n\n(Note: Active hold ${this.currentHoldNo} will NOT be deleted; it will remain available in pending holds.)`;
        }

        if (currentItemCount > 0 || this.currentHoldId) {
            if (!confirm(confirmMsg)) return;
        }

        this.resetForNewSale();
    },

    resetForNewSale: function() {
        this.resetFormSilent();
        this.currentInvoiceId = null;
        this.currentInvoiceNo = null;
        this.isCurrentFbrPosted = false;
        this.currentHoldId = null;
        this.currentHoldNo = null;

        const hiddenId = document.getElementById('pos_invoice_id');
        if (hiddenId) hiddenId.value = '';
        const invInput = document.getElementById('pos_inv_no');
        if (invInput) {
            invInput.dataset.id = '';
            invInput.dataset.pos_invoice_no = '';
            invInput.value = 'New';
        }

        const dateInput = document.getElementById('pos_date');
        if (dateInput) {
            dateInput.value = this.getTodayDateStr();
            dateInput.readOnly = true;
            dateInput.tabIndex = -1;
            dateInput.style.backgroundColor = '#edf2f7';
            dateInput.style.cursor = 'not-allowed';
            dateInput.style.pointerEvents = 'none';
        }

        const banner = document.getElementById('pos_hold_active_banner');
        if (banner) banner.style.display = 'none';

        const statusText = document.getElementById('pos_action_status_text');
        if (statusText) {
            statusText.innerHTML = 'Status: <strong style="color: #2b6cb0;">Ready for Sale</strong>';
        }

        this.updateFbrButtonState();
        this.fetchNextInvoiceNo();
        this.clearMobileSearch();
        this.updateMobileEmptyState();
    },

    updateFbrButtonState: function() {
        const btn = document.getElementById('pos_btn_post_fbr');
        const icon = document.getElementById('pos_btn_post_fbr_icon');
        const label = document.getElementById('pos_btn_post_fbr_label');
        const sub = document.getElementById('pos_btn_post_fbr_sub');
        const mFbrBtn = document.getElementById('pos_m_btn_post_fbr');

        if (this.isCurrentFbrPosted) {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.55';
                btn.style.cursor = 'not-allowed';
                btn.style.filter = 'grayscale(1)';
                btn.title = `This invoice (${this.currentInvoiceNo || 'sale'}) has ALREADY been posted to FBR and cannot be posted again.`;
                if (icon) icon.className = 'fas fa-check-double';
                if (label) label.textContent = 'Posted to FBR';
                if (sub) sub.textContent = 'Locked';
            }
            if (mFbrBtn) {
                mFbrBtn.disabled = true;
                mFbrBtn.style.opacity = '0.55';
                mFbrBtn.style.cursor = 'not-allowed';
                mFbrBtn.innerHTML = '<i class="fas fa-check-double"></i> Posted';
            }
        } else {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.filter = 'none';
                btn.title = 'Submit invoice to FBR portal';
                if (icon) icon.className = 'fas fa-cloud-upload-alt';
                if (label) label.textContent = 'Post to FBR';
                if (sub) sub.textContent = 'FBR Submit';
            }
            if (mFbrBtn) {
                mFbrBtn.disabled = false;
                mFbrBtn.style.opacity = '1';
                mFbrBtn.style.cursor = 'pointer';
                mFbrBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> FBR Post';
            }
        }
    },

    resetForm: function() {
        this.clearSale();
    },

    resetFormSilent: function() {
        const globDisc = document.getElementById('pos_global_discount');
        if (globDisc) globDisc.value = '0.00';
        
        // Restore locked branch default customer
        this.applyBranchDefaultCustomer();
        
        const tbody = document.getElementById('pos_items_body');
        if (tbody) {
            tbody.innerHTML = '';
            for(let i=0; i<20; i++) {
                this.addNewRow();
            }
        }
        this.calculateGrandTotal();
    },

    printInvoice: async function() {
        if (this.currentInvoiceId) {
            if (window.POSRegisterModule && typeof window.POSRegisterModule.printReceipt === 'function') {
                window.POSRegisterModule.printReceipt(this.currentInvoiceId);
                return;
            }
        }

        const tbody = document.getElementById('pos_items_body');
        const hasValidRows = tbody && Array.from(tbody.children).some(tr => {
            const itemId = tr.querySelector('.row-id')?.value;
            const qtyVal = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
            return itemId && parseFloat(itemId) > 0 && qtyVal > 0;
        });

        if (hasValidRows) {
            if (confirm("Save invoice first to preview and print with FBR QR Code?")) {
                const ok = await this.saveSaleLocally(true);
                if (ok && this.currentInvoiceId) {
                    if (window.POSRegisterModule && typeof window.POSRegisterModule.printReceipt === 'function') {
                        window.POSRegisterModule.printReceipt(this.currentInvoiceId);
                    }
                }
            }
            return;
        }

        alert('Please enter items on the sale screen before printing.');
    },

    closeReceiptModal: function() {
        if (window.POSRegisterModule) {
            window.POSRegisterModule.closeModal('posModalReceipt');
        } else {
            const m = document.getElementById('posModalReceipt');
            if (m) m.style.display = 'none';
        }
    },

    changePrintPaper: function(fmt) {
        if (window.POSRegisterModule && typeof window.POSRegisterModule.changePrintPaper === 'function') {
            window.POSRegisterModule.changePrintPaper(fmt);
        }
    },

    executeReceiptPrint: function() {
        if (window.POSRegisterModule && typeof window.POSRegisterModule.executeReceiptPrint === 'function') {
            window.POSRegisterModule.executeReceiptPrint();
        }
    },

    // =========================================================================
    // 1. SAVE SALE LOCALLY (Keeps on screen for Editing / Deleting / FBR Submit)
    // =========================================================================
    saveSaleLocally: async function(isInternal = false) {
        if (this.isSubmitting) return false;

        if (this.isCurrentFbrPosted) {
            alert('This invoice has already been submitted to FBR and cannot be edited.');
            return false;
        }

        let customerId = document.getElementById('pos_customer_id')?.value;
        if (!customerId || customerId == 0) {
            this.applyBranchDefaultCustomer();
            customerId = document.getElementById('pos_customer_id')?.value;
        }
        if (!customerId || customerId == 0) {
            if (window.allCustomers && window.allCustomers.length > 0) {
                this.selectCustomer(window.allCustomers[0]);
                customerId = document.getElementById('pos_customer_id')?.value;
            }
        }
        if (!customerId || customerId == 0) {
            alert('Please select a valid customer.');
            return false;
        }

        const tbody = document.getElementById('pos_items_body');
        const items = [];
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const itemId = tr.querySelector('.row-id')?.value;
                const qtyVal = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
                if (itemId && parseFloat(itemId) > 0 && qtyVal > 0) {
                    const rateVal = parseFloat(tr.querySelector('.row-rate')?.value) || 0;
                    const pcsVal = parseFloat(tr.querySelector('.row-pcs')?.value) || 0;
                    const taxRate = parseFloat(tr.querySelector('.row-taxrate')?.value) || 0;
                    const gross = qtyVal * rateVal;
                    const taxAmt = gross * (taxRate / 100);
                    const net = gross + taxAmt;
                    items.push({
                        item_coa_id: itemId,
                        hs_code: tr.querySelector('.row-hscode')?.value || null,
                        description: tr.querySelector('.row-desc')?.value || '',
                        pieces: pcsVal,
                        quantity: qtyVal,
                        unit: tr.querySelector('.row-unit')?.value || 'pcs',
                        rate: rateVal,
                        gross_amount: gross,
                        discount_percent: 0,
                        discount_amount: 0,
                        sales_tax_rate: taxRate,
                        sales_tax_amount: taxAmt,
                        further_tax_rate: 0,
                        further_tax_amount: 0,
                        net_amount: net
                    });
                }
            });
        }

        if (items.length === 0) {
            alert('Please add at least one item before saving.');
            return false;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = window.selectedCompanyId || session.company_id || 1;
        const invInput = document.getElementById('pos_inv_no');
        const branchSelect = document.getElementById('pos_branch');
        const branchId = (session.role === 'POS' && session.branch_id) 
            ? session.branch_id 
            : (branchSelect ? branchSelect.value : null);

        const hiddenId = document.getElementById('pos_invoice_id');
        const invoiceIdToSave = this.currentInvoiceId || (hiddenId && hiddenId.value ? parseInt(hiddenId.value) : null) || (invInput && invInput.dataset.id ? parseInt(invInput.dataset.id) : null);
        const currentNoVal = invInput ? invInput.value.trim() : '';
        const invoiceNoToSave = this.currentInvoiceNo || (invInput ? invInput.dataset.pos_invoice_no : '') || (currentNoVal === 'New' ? '' : currentNoVal);

        const payload = {
            action: 'save_invoice',
            id: invoiceIdToSave || null,
            serial_no: 0,
            pos_invoice_no: invoiceNoToSave,
            pos_status: 'Saved',
            is_tax_invoice: false,
            invoice_date: invoiceIdToSave ? (document.getElementById('pos_date')?.value || this.getTodayDateStr()) : this.getTodayDateStr(),
            invoice_type: 'POS',
            delivery_challan_no: '',
            delivery_challan_date: '',
            customer_order_no: '',
            customer_order_date: '',
            payment_terms: 'Cash',
            income_account: '40001001',
            customer_coa_id: customerId,
            customer_address: document.getElementById('pos_customer_details')?.value || '',
            inventory_location_id: branchId || null,
            job_no: '',
            employee_ref: '',
            remarks: this.currentHoldNo ? `POS Sale (From Hold: ${this.currentHoldNo})` : 'POS Sale',
            carriage_freight: 0,
            additional_discount: document.getElementById('pos_global_discount') ? (parseFloat(document.getElementById('pos_global_discount').value) || 0) : 0,
            net_total: document.getElementById('pos_net_total') ? parseFloat(document.getElementById('pos_net_total').textContent.replace(/,/g, '')) : 0,
            amount_in_words: '',
            items: items,
            company_id: companyId,
            amount_received: document.getElementById('pos_net_total') ? parseFloat(document.getElementById('pos_net_total').textContent.replace(/,/g, '')) : 0,
            is_cancelled: 0,
            is_posted: 1
        };

        this.isSubmitting = true;

        // Check Shift Status
        try {
            const shiftRes = await fetch(`api/pos_day_closing.php?action=get_live_closing_summary&company_id=${companyId}&branch_id=${branchId || ''}&date=${payload.invoice_date}`);
            if (shiftRes.ok) {
                const shiftData = await shiftRes.json();
                if (shiftData.is_already_closed) {
                    alert(`Cannot save sale!\n\nToday's POS shift for this branch has already been closed (${shiftData.existing_closing_no}).\nNew sales are blocked until a new shift is opened.`);
                    this.isSubmitting = false;
                    return false;
                }
            }
        } catch (err) {
            console.warn('Shift status check bypassed:', err);
        }

        try {
            const res = await fetch(`api/sale_invoice.php?action=save_invoice&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                const finalInvNo = data.pos_invoice_no || payload.pos_invoice_no || ('INV-' + data.id);
                this.currentInvoiceId = data.id;
                this.currentInvoiceNo = finalInvNo;
                this.isCurrentFbrPosted = false;

                const hiddenIdEl = document.getElementById('pos_invoice_id');
                if (hiddenIdEl) hiddenIdEl.value = data.id;

                if (invInput) {
                    invInput.value = finalInvNo;
                    invInput.dataset.id = data.id;
                    invInput.dataset.pos_invoice_no = finalInvNo;
                }

                // If this sale was recalled from a Hold, mark Hold as Completed
                if (this.currentHoldId) {
                    try {
                        await fetch('api/pos_hold_sale.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'complete_hold',
                                hold_id: this.currentHoldId,
                                final_invoice_id: data.id,
                                final_invoice_no: finalInvNo,
                                company_id: companyId
                            })
                        });
                    } catch (err) {
                        console.error('Error completing hold status:', err);
                    }
                    this.currentHoldId = null;
                    this.currentHoldNo = null;

                    const banner = document.getElementById('pos_hold_active_banner');
                    if (banner) banner.style.display = 'none';
                }

                const statusText = document.getElementById('pos_action_status_text');
                if (statusText) {
                    statusText.innerHTML = `Saved: <strong style="color: #16a34a;">${finalInvNo}</strong> (Saved in Sales Register - Editable)`;
                }

                // Auto-refresh any open Sales Registers
                if (window.POSRegisterModule && typeof window.POSRegisterModule.loadInvoices === 'function') {
                    window.POSRegisterModule.loadInvoices();
                }
                if (window.SaleRegisterModule && typeof window.SaleRegisterModule.fetchReport === 'function') {
                    window.SaleRegisterModule.fetchReport();
                }

                // NOTE: DO NOT reset the form! Keep invoice on screen for editing/posting
                if (!isInternal) {
                    alert(`✓ Invoice ${finalInvNo} successfully saved in database and Sales Register!\n\nYou can continue editing items, or click 'Post to FBR' to submit.`);
                }

                // Automatic Receipt Printing (Respects POS Settings rec_auto_print checkbox)
                if (this.posSettings && String(this.posSettings.rec_auto_print) === '1') {
                    if (window.POSRegisterModule && typeof window.POSRegisterModule.printReceipt === 'function') {
                        window.POSRegisterModule.printReceipt(data.id, true);
                    }
                }

                return true;
            } else {
                if (data.is_off_day) {
                    alert(`📅 SALE BLOCKED (WEEKLY OFF DAY):\n\n${data.message || 'Today is an official weekly off day for this branch. Sales are strictly prohibited.'}`);
                } else if (data.is_off_time) {
                    alert(`⏰ SALE BLOCKED (BRANCH OFF-TIME):\n\n${data.message || 'Branch is currently closed. Sales are blocked during off-hours.'}`);
                } else {
                    alert('Error saving sale: ' + (data.message || 'Unknown error'));
                }
                return false;
            }
        } catch(e) {
            console.error(e);
            alert('Failed to save POS sale. Check console for details.');
            return false;
        } finally {
            this.isSubmitting = false;
        }
    },

    // =========================================================================
    // 2. POST TO FBR (Official Government Submission)
    // =========================================================================
    postToFBR: async function() {
        if (this.isSubmitting) return;

        if (this.isCurrentFbrPosted) {
            this.updateFbrButtonState();
            alert(`This invoice (${this.currentInvoiceNo || 'sale'}) has ALREADY been posted to FBR and cannot be submitted again.`);
            return;
        }

        // Auto save locally first if not saved yet
        if (!this.currentInvoiceId) {
            const savedOk = await this.saveSaleLocally(true);
            if (!savedOk || !this.currentInvoiceId) {
                return;
            }
        }

        if (this.isCurrentFbrPosted) {
            this.updateFbrButtonState();
            alert(`This invoice (${this.currentInvoiceNo || 'sale'}) has ALREADY been posted to FBR and cannot be submitted again.`);
            return;
        }

        if (!confirm(`Submit Invoice ${this.currentInvoiceNo} to official FBR Digital Portal?\n\nNOTE: Once posted to FBR, this invoice will be officially locked and CANNOT be deleted or edited.`)) {
            return;
        }

        this.isSubmitting = true;
        const statusText = document.getElementById('pos_action_status_text');
        if (statusText) {
            statusText.innerHTML = `FBR Status: <strong style="color: #2563eb;"><i class="fas fa-spinner fa-spin"></i> Submitting to FBR...</strong>`;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const compId = window.selectedCompanyId || session.company_id || 1;
        const submittedInvNo = this.currentInvoiceNo;

        try {
            const res = await fetch('api/pos_sale_register.php?action=submit_to_fbr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentInvoiceId, company_id: compId, force: false })
            });
            const data = await res.json();

            if (data.status === 'success') {
                this.isCurrentFbrPosted = true;
                const fbrRef = data.fbr_invoice_number || 'Submitted';
                
                if (window.POSRegisterModule && typeof window.POSRegisterModule.loadInvoices === 'function') {
                    window.POSRegisterModule.loadInvoices();
                }
                if (window.SaleRegisterModule && typeof window.SaleRegisterModule.fetchReport === 'function') {
                    window.SaleRegisterModule.fetchReport();
                }

                alert(`✓ POS Invoice Posted to FBR Successfully!\n\nInvoice Number: ${submittedInvNo}\nFBR Reference: ${fbrRef}\n\nInvoice officially locked in FBR.\nScreen will now reset for the next sale.`);
                this.resetForNewSale();
            } else if (data.status === 'info') {
                this.isCurrentFbrPosted = true;
                if (window.POSRegisterModule && typeof window.POSRegisterModule.loadInvoices === 'function') {
                    window.POSRegisterModule.loadInvoices();
                }
                if (window.SaleRegisterModule && typeof window.SaleRegisterModule.fetchReport === 'function') {
                    window.SaleRegisterModule.fetchReport();
                }
                alert(`ℹ ${data.message}\n\nScreen will now reset for the next sale.`);
                this.resetForNewSale();
            } else {
                if (statusText) {
                    statusText.innerHTML = `FBR Status: <strong style="color: #dc2626;"><i class="fas fa-exclamation-triangle"></i> FBR Failed: ${data.message || 'Error'}</strong>`;
                }
                alert(`✕ FBR Submission Failed:\n\n${data.message}\n\nThe invoice remains saved locally. You can correct it or retry posting.`);
            }
        } catch (e) {
            console.error('FBR post error:', e);
            alert('Failed to connect to backend server for FBR submission.');
            if (statusText) {
                statusText.innerHTML = `Status: <strong style="color: #16a34a;">Saved Locally (${submittedInvNo})</strong>`;
            }
        } finally {
            this.isSubmitting = false;
        }
    },

    // =========================================================================
    // 3. DELETE CURRENT INVOICE (Only allowed if NOT posted to FBR)
    // =========================================================================
    deleteCurrentInvoice: async function() {
        if (this.isSubmitting) return;

        if (!this.currentInvoiceId) {
            alert('No saved invoice is currently loaded on screen to delete.\n\nTo reset an unsaved screen, click "Clear Sale".');
            return;
        }

        if (this.isCurrentFbrPosted) {
            alert(`Invoice #${this.currentInvoiceNo} has already been posted to FBR and CANNOT be deleted!`);
            return;
        }

        if (!confirm(`Are you sure you want to permanently DELETE saved invoice ${this.currentInvoiceNo}?\n\nThis will remove the invoice and its items completely from the database.`)) {
            return;
        }

        this.isSubmitting = true;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const compId = window.selectedCompanyId || session.company_id || 1;

        try {
            const res = await fetch('api/pos_sale_register.php?action=delete_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentInvoiceId, company_id: compId })
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`✓ Invoice ${this.currentInvoiceNo} has been deleted successfully.`);
                if (window.POSRegisterModule && typeof window.POSRegisterModule.loadInvoices === 'function') {
                    window.POSRegisterModule.loadInvoices();
                }
                if (window.SaleRegisterModule && typeof window.SaleRegisterModule.fetchReport === 'function') {
                    window.SaleRegisterModule.fetchReport();
                }
                this.resetForNewSale();
            } else {
                alert(`✕ Failed to delete invoice: ${data.message || 'Unknown error'}`);
            }
        } catch (e) {
            console.error('Delete invoice error:', e);
            alert('Failed to connect to server to delete invoice.');
        } finally {
            this.isSubmitting = false;
        }
    },

    // =========================================================================
    // 4. LOAD INVOICE (For Editing Saved Unposted Invoices)
    // =========================================================================
    loadInvoice: async function(invoiceId) {
        if (!invoiceId) return;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = window.selectedCompanyId || session.company_id || 1;
            const res = await fetch(`api/sale_invoice.php?action=get_invoice&id=${invoiceId}&company_id=${compId}&allow_pos=1`);
            if (!res.ok) throw new Error('Failed to fetch invoice');
            const inv = await res.json();
            if (!inv || !inv.id) {
                alert('Invoice not found.');
                return;
            }

            this.currentInvoiceId = inv.id;
            this.currentInvoiceNo = inv.pos_invoice_no || ('INV-' + inv.serial_no);
            const fbrStat = (inv.fbr_status || '').toUpperCase();
            this.isCurrentFbrPosted = (fbrStat === 'SUBMITTED' || fbrStat === 'ACCEPTED' || Boolean(inv.fbr_invoice_number && inv.fbr_invoice_number.trim() !== ''));

            const hiddenId = document.getElementById('pos_invoice_id');
            if (hiddenId) hiddenId.value = inv.id;

            const invInput = document.getElementById('pos_inv_no');
            if (invInput) {
                invInput.value = this.currentInvoiceNo;
                invInput.dataset.id = inv.id;
                invInput.dataset.pos_invoice_no = this.currentInvoiceNo;
                invInput.dataset.serial_no = inv.serial_no || 0;
            }

            const dateInput = document.getElementById('pos_date');
            if (dateInput && inv.invoice_date) {
                dateInput.value = inv.invoice_date;
            }

            const branchSelect = document.getElementById('pos_branch');
            if (branchSelect && inv.inventory_location_id) {
                branchSelect.value = inv.inventory_location_id;
            }

            if (inv.customer) {
                this.selectCustomer(inv.customer);
            }

            const tbody = document.getElementById('pos_items_body');
            if (tbody) tbody.innerHTML = '';

            const items = inv.items || [];
            items.forEach(it => {
                this.addNewRow({
                    item_coa_id: it.item_coa_id,
                    item_code: it.item_code || it.inv_code || '',
                    description: it.description || it.item_name || '',
                    hs_code: it.hs_code || '',
                    pieces: parseFloat(it.pieces || 0),
                    quantity: parseFloat(it.quantity || 0),
                    unit: it.unit || 'pcs',
                    rate: parseFloat(it.rate || 0),
                    val_excl_tax: parseFloat(it.gross_amount || (it.quantity * it.rate) || 0),
                    sales_tax_rate: parseFloat(it.sales_tax_rate || 0),
                    sales_tax_amount: parseFloat(it.sales_tax_amount || 0),
                    val_incl_tax: parseFloat(it.net_amount || 0),
                    qty_per_piece: it.qty_per_piece || 0
                });
            });

            const remainingRows = Math.max(0, 20 - items.length);
            for (let i = 0; i < remainingRows; i++) {
                this.addNewRow();
            }

            const discInput = document.getElementById('pos_global_discount');
            if (discInput) {
                discInput.value = parseFloat(inv.additional_discount || 0).toFixed(2);
            }

            this.calculateGrandTotal();

            const statusText = document.getElementById('pos_action_status_text');
            if (statusText) {
                if (this.isCurrentFbrPosted) {
                    statusText.innerHTML = `FBR Status: <strong style="color: #2563eb;"><i class="fas fa-check-double"></i> Posted to FBR (${inv.fbr_invoice_number || 'Submitted'})</strong> (Locked)`;
                } else {
                    statusText.innerHTML = `Loaded: <strong style="color: #16a34a;">${this.currentInvoiceNo}</strong> (Saved Locally - Editable)`;
                }
            }
            this.updateFbrButtonState();
        } catch (e) {
            console.error('Error loading invoice:', e);
            alert('Failed to load invoice: ' + e.message);
        }
    },

    // Backwards compatibility alias
    saveSale: function() {
        return this.saveSaleLocally();
    },

    // =========================================================================
    // MOBILE SPECIFIC METHODS
    // =========================================================================
    openMobileSearchDropdown: function() {
        const input = document.getElementById('pos_mobile_search');
        this.filterMobileItems(input ? input.value : '');
    },

    filterMobileItems: function(query) {
        const resultsContainer = document.getElementById('pos_mobile_search_results');
        const clearBtn = document.getElementById('pos_mobile_clear_btn');
        if (!resultsContainer) return;

        query = (query || '').toLowerCase().trim();
        if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

        const products = this.posInventory || window.chartOfInventory || [];
        if (!products || products.length === 0) {
            resultsContainer.innerHTML = '<div class="pos-m-dd-empty"><i class="fas fa-spinner fa-spin"></i> Loading inventory items...</div>';
            resultsContainer.style.display = 'block';
            return;
        }

        let matches = [];
        if (!query) {
            // When user taps/clicks search without typing, show list immediately
            matches = products.slice(0, 30);
        } else {
            const searchWords = query.split(/\s+/);
            matches = products.filter(p => {
                const code = (p.code || '').toLowerCase();
                const name = (p.name || '').toLowerCase();
                const barcode = (p.barcode || '').toLowerCase();
                const combined = `${code} ${name} ${barcode}`;
                return searchWords.every(w => combined.includes(w));
            }).slice(0, 30);
        }

        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div class="pos-m-dd-empty"><i class="fas fa-search"></i> No items found matching "' + query + '"</div>';
        } else {
            const headerHtml = !query 
                ? '<div style="padding: 6px 12px; font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;"><i class="fas fa-list"></i> Select Item:</div>'
                : '';

            resultsContainer.innerHTML = headerHtml + matches.map(p => {
                const price = parseFloat(p.selling_price || 0).toFixed(2);
                return `
                    <div class="pos-m-search-item" onclick="POSModule.addMobileItem(${p.id})">
                        <div class="pos-m-search-item-info">
                            <div class="pos-m-search-name">${p.name}</div>
                            <div class="pos-m-search-meta">
                                <span class="pos-m-badge-unit">${p.unit || 'pcs'}</span>
                                ${p.hs_code ? `<span class="pos-m-badge-hs">HS: ${p.hs_code}</span>` : ''}
                            </div>
                        </div>
                        <div class="pos-m-search-price">Rs ${price}</div>
                    </div>
                `;
            }).join('');
        }
        resultsContainer.style.display = 'block';
    },

    addMobileItem: function(productId) {
        const products = this.posInventory || window.chartOfInventory || [];
        const product = products.find(p => String(p.id) === String(productId));
        if (!product) return;

        // Check if item already exists in active items
        const tbody = document.getElementById('pos_items_body');
        let existingTr = null;
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const idVal = tr.querySelector('.row-id')?.value;
                if (String(idVal) === String(productId)) {
                    existingTr = tr;
                }
            });
        }

        if (existingTr) {
            // Increment pieces by 1
            const pcsInput = existingTr.querySelector('.row-pcs');
            if (pcsInput) {
                const currentPcs = parseFloat(pcsInput.value) || 0;
                pcsInput.value = (currentPcs + 1).toFixed(2);
                this.calculateRow(pcsInput);
            }
            this.highlightRow(existingTr);
        } else {
            // Find first empty row or create new row
            let targetTr = null;
            if (tbody) {
                Array.from(tbody.children).forEach(tr => {
                    const idVal = tr.querySelector('.row-id')?.value;
                    if (!targetTr && (!idVal || idVal === '' || idVal === '0')) {
                        targetTr = tr;
                    }
                });
            }

            if (!targetTr) {
                this.addNewRow();
                targetTr = tbody.lastElementChild;
            }

            if (targetTr) {
                this.selectItem(targetTr.querySelector('.row-code'), product);
                this.highlightRow(targetTr);
            }
        }

        this.clearMobileSearch();
        this.updateMobileEmptyState();
    },

    highlightRow: function(tr) {
        if (!tr) return;
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        tr.classList.add('pos-row-highlight');
        setTimeout(() => tr.classList.remove('pos-row-highlight'), 1200);
    },

    clearMobileSearch: function() {
        const input = document.getElementById('pos_mobile_search');
        const results = document.getElementById('pos_mobile_search_results');
        const clearBtn = document.getElementById('pos_mobile_clear_btn');
        if (input) input.value = '';
        if (results) {
            results.style.display = 'none';
            results.innerHTML = '';
        }
        if (clearBtn) clearBtn.style.display = 'none';
    },

    stepPieces: function(btn, step) {
        const tr = btn.closest('tr');
        if (!tr) return;
        const pcsInput = tr.querySelector('.row-pcs');
        if (!pcsInput) return;
        let currentPcs = parseFloat(pcsInput.value) || 0;
        let nextPcs = currentPcs + step;
        if (nextPcs < 1) nextPcs = 1;
        pcsInput.value = nextPcs.toFixed(2);
        this.calculateRow(pcsInput);
    },

    syncMobileDiscount: function(val) {
        const deskDisc = document.getElementById('pos_global_discount');
        if (deskDisc) {
            deskDisc.value = val;
        }
        this.calculateGrandTotal();
    },

    toggleMobileSummaryDrawer: function() {
        const drawer = document.getElementById('pos_mobile_summary_drawer');
        const chevron = document.getElementById('pos_m_drawer_chevron');
        if (!drawer) return;
        const isShowing = drawer.style.display !== 'none';
        drawer.style.display = isShowing ? 'none' : 'block';
        if (chevron) {
            chevron.className = isShowing ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
        }
    },

    toggleMobileHeaderDetails: function() {
        const meta = document.getElementById('pos_header_meta');
        const chevron = document.getElementById('pos_m_hdr_chevron');
        if (!meta) return;
        const isShowing = meta.classList.contains('mobile-expanded');
        if (isShowing) {
            meta.classList.remove('mobile-expanded');
            if (chevron) chevron.className = 'fas fa-chevron-down';
        } else {
            meta.classList.add('mobile-expanded');
            if (chevron) chevron.className = 'fas fa-chevron-up';
        }
    },

    updateMobileEmptyState: function() {
        const tbody = document.getElementById('pos_items_body');
        const emptyState = document.getElementById('pos_mobile_empty_cart');
        let validCount = 0;
        if (tbody) {
            Array.from(tbody.children).forEach(tr => {
                const idVal = tr.querySelector('.row-id')?.value;
                const qtyVal = parseFloat(tr.querySelector('.row-qty')?.value) || 0;
                if (idVal && parseFloat(idVal) > 0 && qtyVal > 0) {
                    validCount++;
                    tr.classList.remove('pos-row-empty');
                    tr.classList.add('pos-row-has-item');
                } else {
                    tr.classList.add('pos-row-empty');
                    tr.classList.remove('pos-row-has-item');
                }
            });
        }

        if (emptyState) {
            emptyState.style.display = validCount === 0 ? 'flex' : 'none';
        }

        // Sync header summary pill
        const mInv = document.getElementById('pos_m_hdr_inv');
        const deskInv = document.getElementById('pos_inv_no');
        if (mInv && deskInv) mInv.textContent = deskInv.value || '#New';

        const mCust = document.getElementById('pos_m_hdr_cust');
        const deskCust = document.getElementById('pos_customer_search');
        if (mCust && deskCust) mCust.textContent = deskCust.value ? deskCust.value.split('-')[0].trim() : 'Walk-in';

        const mBranch = document.getElementById('pos_m_hdr_branch');
        const deskBranch = document.getElementById('pos_branch');
        if (mBranch && deskBranch && deskBranch.selectedIndex >= 0) {
            mBranch.textContent = deskBranch.options[deskBranch.selectedIndex].text.split('-')[0].trim();
        }
    }
};

// Global click handler to close mobile search dropdown when tapping outside
document.addEventListener('click', function(e) {
    const searchSection = document.querySelector('.pos-mobile-search-section');
    const dropdown = document.getElementById('pos_mobile_search_results');
    if (searchSection && dropdown && dropdown.style.display !== 'none') {
        if (!searchSection.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});
