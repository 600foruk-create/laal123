(function() {
    window.QuotationModule = {
        data: {
            items: [],
            customers: [],
            employees: [],
            currentId: null,
            isNew: true,
            gridRows: 40
        },
        suggestIndex: -1,
        currentMatches: [],

        getCompanyId: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            return session.company_id || 1;
        },

        init: async function() {
            console.log("Initializing Quotation Module...");
            const container = document.getElementById('quotationContainer');
            if (!container) {
                setTimeout(() => this.init(), 100);
                return;
            }
            await this.loadDependencies();
            this.setupEventListeners();
            await this.resetForm(true);
        },

        loadInventory: async function() {
            if (window.loadSharedERPInventory) {
                try {
                    const shared = await window.loadSharedERPInventory();
                    if (Array.isArray(shared) && shared.length > 0) {
                        this.data.items = shared;
                        this.inventory = shared;
                        return shared;
                    }
                } catch(eShared) {}
            }

            if (window.allInventoryItems && Array.isArray(window.allInventoryItems) && window.allInventoryItems.length > 0) {
                this.data.items = window.allInventoryItems;
                this.inventory = window.allInventoryItems;
                return this.data.items;
            }

            if (window.SaleOrderModule && Array.isArray(window.SaleOrderModule.inventory) && window.SaleOrderModule.inventory.length > 0) {
                this.data.items = window.SaleOrderModule.inventory;
                this.inventory = window.SaleOrderModule.inventory;
                return this.data.items;
            }

            if (window.SIModule && Array.isArray(window.SIModule.inventory) && window.SIModule.inventory.length > 0) {
                this.data.items = window.SIModule.inventory;
                this.inventory = window.SIModule.inventory;
                return this.data.items;
            }

            const companyId = this.getCompanyId();
            let loaded = [];

            // 1. Try sale_order.php get_all_items
            try {
                const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) loaded = data;
                }
            } catch(e) {}

            // 2. Try digital_invoice.php get_meta
            if (!loaded || loaded.length === 0) {
                try {
                    const resMeta = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
                    if (resMeta.ok) {
                        const dataMeta = await resMeta.json();
                        if (dataMeta && Array.isArray(dataMeta.items) && dataMeta.items.length > 0) {
                            loaded = dataMeta.items;
                        }
                    }
                } catch(e) {}
            }

            // 3. Fallback to quotation.php get_all_inventory
            if (!loaded || loaded.length === 0) {
                try {
                    const resQ = await fetch(`api/quotation.php?action=get_all_inventory&company_id=${companyId}&_cb=${Date.now()}`);
                    if (resQ.ok) {
                        const dataQ = await resQ.json();
                        if (Array.isArray(dataQ) && dataQ.length > 0) loaded = dataQ;
                    }
                } catch(e) {}
            }

            if (Array.isArray(loaded) && loaded.length > 0) {
                this.data.items = loaded.map(i => ({
                    id: i.id || i.coa_list_id,
                    code: String(i.code || i.item_code || '').trim(),
                    item_code: String(i.item_code || i.code || '').trim(),
                    name: String(i.name || i.item_name || i.description || '').trim(),
                    item_name: String(i.item_name || i.name || i.description || '').trim(),
                    description: String(i.description || i.item_name || i.name || '').trim(),
                    hs_code: i.hs_code || '',
                    unit: i.unit || 'Pcs',
                    sales_price: parseFloat(i.sales_price || i.selling_price || i.rate || 0),
                    selling_price: parseFloat(i.selling_price || i.sales_price || i.rate || 0),
                    qty_per_piece: parseFloat(i.qty_per_piece || 0),
                    tax_rate: parseFloat(i.tax_rate || 0),
                    item_type: i.item_type || 'inventory'
                }));
                this.inventory = this.data.items;
                window.allInventoryItems = this.data.items;
            } else {
                this.data.items = this.data.items || [];
                this.inventory = this.data.items;
            }
            return this.data.items;
        },

        loadDependencies: async function() {
            const companyId = this.getCompanyId();
            try {
                await this.loadInventory();

                const custRes = await fetch(`api/quotation.php?action=get_customers_and_vendors&company_id=${companyId}`);
                const custText = await custRes.text();
                try {
                    this.data.customers = JSON.parse(custText);
                    if (!Array.isArray(this.data.customers)) this.data.customers = [];
                } catch(e) { this.data.customers = []; }
                
                const empRes = await fetch(`api/maintain.php?action=get_employees&company_id=${companyId}`);
                this.data.employees = await empRes.json();
                
                const empDropdown = document.getElementById('q_emp_dropdown');
                if (empDropdown) {
                    empDropdown.innerHTML = `<div onclick="window.QuotationModule.selectEmployee('', 'Select Employee')">Select Employee</div>` + 
                        this.data.employees.map(e => `<div onclick="window.QuotationModule.selectEmployee('${e.id}', '${e.name}')">${e.name}</div>`).join('');
                }
            } catch (err) {
                console.error("Error loading dependencies:", err);
            }
        },

        selectEmployee: function(id, name) {
            document.getElementById('q_employee_ref').value = id;
            document.getElementById('q_emp_text').innerText = name;
            document.getElementById('q_emp_dropdown').style.display = 'none';
        },

        setupEventListeners: function() {
            const codeInput = document.getElementById('q_customer_code');
            const suggest = document.getElementById('q_customer_suggest');
            
            if (codeInput) {
                codeInput.addEventListener('input', (e) => this.handleCustomerSearch(e.target.value));
                codeInput.addEventListener('blur', () => { setTimeout(() => { if (suggest) suggest.style.display = 'none'; }, 200); });
                codeInput.addEventListener('focus', (e) => {
                    this.closeAllDropdowns();
                    if (e.target.value) this.handleCustomerSearch(e.target.value);
                });
                codeInput.addEventListener('keydown', (e) => {
                    if (suggest && suggest.style.display === 'block') {
                        const items = suggest.querySelectorAll('div');
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            this.suggestIndex = Math.min(this.suggestIndex + 1, items.length - 1);
                            this.updateSuggestHighlight(items);
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            this.suggestIndex = Math.max(this.suggestIndex - 1, 0);
                            this.updateSuggestHighlight(items);
                        } else if (e.key === 'Enter' && this.suggestIndex > -1) {
                            e.preventDefault();
                            items[this.suggestIndex].click();
                        }
                    }
                });
            }

            const empDisplay = document.getElementById('q_emp_display');
            if (empDisplay) {
                empDisplay.addEventListener('keydown', (e) => {
                    const dropdown = document.getElementById('q_emp_dropdown');
                    if (dropdown && dropdown.style.display === 'block') {
                        const items = dropdown.querySelectorAll('div');
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            this.suggestIndex = Math.min(this.suggestIndex + 1, items.length - 1);
                            this.updateSuggestHighlight(items);
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            this.suggestIndex = Math.max(this.suggestIndex - 1, 0);
                            this.updateSuggestHighlight(items);
                        } else if (e.key === 'Enter' && this.suggestIndex > -1) {
                            e.preventDefault();
                            items[this.suggestIndex].click();
                        } else if (e.key === 'Escape') {
                            dropdown.style.display = 'none';
                        }
                    } else if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (dropdown) {
                            dropdown.style.display = 'block';
                            this.suggestIndex = -1;
                        }
                    }
                });
            }

            const container = document.getElementById('quotationContainer');
            if (container) {
                document.addEventListener('keydown', (e) => {
                    // Only process if the quotation container is currently active/visible
                    if (!document.getElementById('quotationContainer') || document.getElementById('quotationContainer').style.display === 'none') return;
                    
                    if (e.ctrlKey && e.key === 's') {
                        e.preventDefault();
                        this.saveQuotation();
                    } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                        const selectedRow = document.querySelector('#qGridBody tr.selected-row');
                        if (selectedRow) {
                            selectedRow.remove();
                            this.reindexRows();
                            this.calculateTotals();
                        }
                    }
                });
                container.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('item-code-search') && e.target.id !== 'q_customer_code' && !e.target.closest('.po-suggest') && e.target.id !== 'q_emp_display') {
                        this.closeAllDropdowns();
                    }
                });
            }

            const gridBody = document.getElementById('qGridBody');
            if (gridBody) {
                gridBody.addEventListener('click', (e) => {
                    const selector = e.target.closest('.row-selector');
                    if (selector) {
                        const tr = selector.closest('tr');
                        document.querySelectorAll('#qGridBody tr').forEach((row, idx) => {
                            row.classList.remove('selected-row');
                            row.firstElementChild.innerHTML = idx + 1;
                        });
                        if (tr) {
                            tr.classList.add('selected-row');
                            selector.innerHTML = '&#9654;';
                        }
                    }
                });

                document.addEventListener('click', (e) => {
                    const isGridClick = e.target.closest('#qGrid');
                    if (!isGridClick) {
                        document.querySelectorAll('#qGridBody tr').forEach((row, idx) => {
                            row.classList.remove('selected-row');
                            row.firstElementChild.innerHTML = idx + 1;
                        });
                    }
                });

                gridBody.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    if (e.target.classList.contains('qty') || e.target.classList.contains('rate') || 
                        e.target.classList.contains('pieces') || e.target.classList.contains('stax-rate') || 
                        e.target.classList.contains('ftax-rate')) {
                        this.calculateRow(row);
                    }
                    if (e.target.classList.contains('item-code-search')) {
                        this.handleItemSearch(e.target);
                    }
                });
                
                gridBody.addEventListener('focusin', (e) => {
                    if (e.target.classList.contains('item-code-search')) {
                        this.closeAllDropdowns();
                        if (e.target.value) this.handleItemSearch(e.target);
                    } else if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                        e.target.select();
                    }
                });

                gridBody.addEventListener('focusout', (e) => {
                    if (e.target.classList.contains('item-code-search')) {
                        const val = e.target.value.trim().toLowerCase();
                        const tr = e.target.closest('tr');
                        if (val && tr && !tr.dataset.coaId && this.data.items && this.data.items.length > 0) {
                            const match = this.data.items.find(i => String(i.item_code || i.code || '').toLowerCase() === val)
                                || this.data.items.find(i => String(i.item_name || i.name || '').toLowerCase() === val)
                                || (this.currentMatches && this.currentMatches.length > 0 ? this.currentMatches[0] : null);
                            if (match) {
                                this.currentMatches = [match];
                                this.selectItem(tr, 0);
                            }
                        }
                        const suggest = tr ? (tr.querySelector('.grid-suggest') || e.target.nextElementSibling) : null;
                        setTimeout(() => { if (suggest) suggest.style.display = 'none'; }, 200);
                    } else if (e.target.classList.contains('num')) {
                        const tr = e.target.closest('tr');
                        const code = tr ? tr.querySelector('.item-code-search') : null;
                        if (e.target.value.trim() === '' && code && code.value.trim() !== '') {
                            e.target.value = '0.00';
                        }
                    }
                });

                gridBody.addEventListener('keydown', (e) => {
                    const target = e.target;
                    const tr = target.closest('tr');
                    if (!tr) return;
                    
                    const suggest = tr.querySelector('.grid-suggest') || target.nextElementSibling;
                    if (target.classList.contains('item-code-search') && suggest && suggest.style.display === 'block') {
                        const items = suggest.querySelectorAll('.suggest-item');
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            this.suggestIndex = Math.min((this.suggestIndex ?? -1) + 1, items.length - 1);
                            this.updateSuggestHighlight(items);
                            return;
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            this.suggestIndex = Math.max((this.suggestIndex ?? 0) - 1, 0);
                            this.updateSuggestHighlight(items);
                            return;
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const selIdx = (this.suggestIndex > -1) ? this.suggestIndex : 0;
                            if (items[selIdx]) {
                                const targetIdx = parseInt(items[selIdx].dataset.idx ?? selIdx);
                                this.selectItem(tr, targetIdx);
                            }
                            return;
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            suggest.style.display = 'none';
                            this.suggestIndex = -1;
                            return;
                        }
                    }
                    
                    if (target.classList.contains('grid-input')) {
                        const rowInputs = Array.from(tr.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                        const colIdx = rowInputs.indexOf(target);
                        
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                            const nextTr = tr.nextElementSibling;
                            if (nextTr) {
                                const nextRowInputs = Array.from(nextTr.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                                if (nextRowInputs[colIdx]) { nextRowInputs[colIdx].focus(); nextRowInputs[colIdx].select(); }
                            } else {
                                this.addEmptyRow();
                                setTimeout(() => {
                                    const newRow = gridBody.lastElementChild;
                                    const newRowInputs = Array.from(newRow.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                                    if (newRowInputs[colIdx]) { newRowInputs[colIdx].focus(); newRowInputs[colIdx].select(); }
                                }, 50);
                            }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                            const prevTr = tr.previousElementSibling;
                            if (prevTr) {
                                const prevRowInputs = Array.from(prevTr.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                                if (prevRowInputs[colIdx]) { prevRowInputs[colIdx].focus(); prevRowInputs[colIdx].select(); }
                            }
                        } else if (e.key === 'ArrowLeft') {
                            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
                            if (isFullySelected) {
                                e.preventDefault();
                                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                                if (colIdx > 0) { rowInputs[colIdx - 1].focus(); rowInputs[colIdx - 1].select(); }
                            }
                        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                            const isFullySelected = (target.selectionStart === 0 && target.selectionEnd === target.value.length) || target.value.length === 0;
                            if (e.key === 'Enter' || (e.key === 'ArrowRight' && isFullySelected)) {
                                e.preventDefault();
                                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.suggestIndex = -1; }
                                if (colIdx < rowInputs.length - 1) {
                                    rowInputs[colIdx + 1].focus();
                                    rowInputs[colIdx + 1].select();
                                } else if (e.key === 'Enter') {
                                    const nextTr = tr.nextElementSibling;
                                    if (nextTr) {
                                        const nextRowInputs = Array.from(nextTr.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                                        if (nextRowInputs[0]) { nextRowInputs[0].focus(); nextRowInputs[0].select(); }
                                    } else {
                                        this.addEmptyRow();
                                        setTimeout(() => {
                                            const newRow = gridBody.lastElementChild;
                                            const newRowInputs = Array.from(newRow.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
                                            if (newRowInputs[0]) { newRowInputs[0].focus(); newRowInputs[0].select(); }
                                        }, 50);
                                    }
                                }
                            }
                        }
                    }
                });
            }
        },

        updateSuggestHighlight: function(items) {
            items.forEach((item, idx) => {
                if (idx === this.suggestIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        },

        closeAllDropdowns: function() {
            this.suggestIndex = -1;
            document.querySelectorAll('.grid-suggest, .po-suggest, .custom-select-dropdown').forEach(el => el.style.display = 'none');
        },

        resetForm: async function(isNew = false) {
            this.data.isNew = isNew;
            this.data.currentId = null;
            document.getElementById('q_sn').value = '';
            document.getElementById('q_date').value = new Date().toISOString().split('T')[0];
            
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            document.getElementById('q_valid_till').value = nextWeek.toISOString().split('T')[0];
            
            document.getElementById('q_terms_payment').value = 'Cash';
            document.getElementById('q_subject').value = 'QUOTATION';
            document.getElementById('q_customer_code').value = '';
            document.getElementById('q_customer_code').dataset.id = '';
            document.getElementById('q_customer_name').value = '';
            document.getElementById('q_customer_address').value = '';
            document.getElementById('q_customer_tel').value = '';
            document.getElementById('q_customer_contact').value = '';
            document.getElementById('q_customer_balance').value = '0.00';
            document.getElementById('q_remarks').value = '';
            document.getElementById('q_terms_cond').value = '';
            document.getElementById('q_is_cancelled').checked = false;
            document.getElementById('q_cancelled_stamp').style.display = 'none';
            this.selectEmployee('', 'Select Employee');

            const soEl = document.getElementById('q_converted_so_no');
            const soTextEl = document.getElementById('q_converted_so_text');
            if (soEl) { soEl.innerText = ''; soEl.setAttribute('data-sn', '0'); }
            if (soTextEl) soTextEl.style.display = 'none';

            const dcEl = document.getElementById('q_converted_dc_no');
            const dcTextEl = document.getElementById('q_converted_dc_text');
            if (dcEl) { dcEl.innerText = ''; dcEl.setAttribute('data-sn', '0'); }
            if (dcTextEl) dcTextEl.style.display = 'none';

            const invTaxEl = document.getElementById('q_converted_invtax_no');
            const invTaxTextEl = document.getElementById('q_converted_invtax_text');
            if (invTaxEl) { invTaxEl.innerText = ''; invTaxEl.setAttribute('data-sn', '0'); }
            if (invTaxTextEl) invTaxTextEl.style.display = 'none';

            const invNonTaxEl = document.getElementById('q_converted_invnontax_no');
            const invNonTaxTextEl = document.getElementById('q_converted_invnontax_text');
            if (invNonTaxEl) { invNonTaxEl.innerText = ''; invNonTaxEl.setAttribute('data-sn', '0'); }
            if (invNonTaxTextEl) invNonTaxTextEl.style.display = 'none';

            if (isNew) {
                try {
                    const companyId = this.getCompanyId();
                    const res = await fetch(`api/quotation.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    document.getElementById('q_sn').value = data.next_no;
                } catch (err) { console.error("Error getting serial no:", err); }
            }

            this.renderGrid();
            this.calculateTotals();
        },

        renderGrid: function() {
            const body = document.getElementById('qGridBody');
            body.innerHTML = '';
            for (let i = 0; i < this.data.gridRows; i++) {
                this.addEmptyRow();
            }
        },

        addEmptyRow: function(data = {}) {
            const tbody = document.getElementById('qGridBody');
            if (!tbody) return;
            const rowIndex = tbody.children.length;
            const tr = document.createElement('tr');
            tr.dataset.index = rowIndex;
            
            tr.innerHTML = `
                <td class="row-selector">${rowIndex + 1}</td>
                <td style="border: 1px solid #cbd5e0; position: relative;">
                    <input type="text" class="grid-input item-code-search" placeholder="" autocomplete="off">
                    <div class="grid-suggest"></div>
                </td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input hs-code"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-description"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num pieces"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num qty"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input si-unit"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num rate"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-excl" readonly></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num stax-rate"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num stax-amt" readonly></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num ftax-rate"></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num ftax-amt" readonly></td>
                <td style="border: 1px solid #cbd5e0;"><input type="text" class="grid-input num val-incl" readonly></td>
            `;

            if (data.item_coa_id) {
                tr.dataset.coaId = data.item_coa_id;
                tr.dataset.qtyPerPiece = data.qty_per_piece || 0;
                tr.querySelector('.item-code-search').value = data.item_code || data.code || '';
                tr.querySelector('.hs-code').value = data.hs_code || '';
                tr.querySelector('.si-description').value = data.item_name || data.description || '';
                tr.querySelector('.pieces').value = data.pieces || '';
                tr.querySelector('.qty').value = data.qty || data.quantity || '';
                tr.querySelector('.si-unit').value = data.unit || '';
                tr.querySelector('.rate').value = data.rate || '';
                tr.querySelector('.val-excl').value = data.val_excl_tax || '';
                tr.querySelector('.stax-rate').value = data.tax_rate || '';
                tr.querySelector('.stax-amt').value = data.tax_amount || '';
                tr.querySelector('.ftax-rate').value = data.further_tax_rate || '';
                tr.querySelector('.ftax-amt').value = data.further_tax_amount || '';
                tr.querySelector('.val-incl').value = data.val_incl_tax || '';
            }

            tbody.appendChild(tr);
            this.reindexRows();
        },

        reindexRows: function() {
            const rows = document.querySelectorAll('#qGridBody tr');
            rows.forEach((row, index) => {
                row.dataset.index = index;
                const selector = row.querySelector('.row-selector');
                if (selector) selector.innerText = index + 1;
            });
        },

        handleCustomerSearch: function(val) {
            this.closeAllDropdowns();
            const suggest = document.getElementById('q_customer_suggest');
            const searchVal = val.trim().toLowerCase();
            if (!searchVal) return;

            const matches = this.data.customers.filter(c => 
                (c.name && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.name.toLowerCase(), searchVal) : c.name.toLowerCase().includes(searchVal))) || 
                (c.code && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.code.toLowerCase(), searchVal) : c.code.toLowerCase().includes(searchVal)))
            );

            if (matches.length > 0) {
                this.suggestIndex = -1;
                suggest.innerHTML = matches.slice(0, 15).map(c => `
                    <div onmousedown="event.preventDefault()" onclick="window.QuotationModule.selectCustomer('${c.code}')">
                        <strong>${c.code}</strong> &nbsp; ${c.name}
                    </div>
                `).join('');
                suggest.style.display = 'block';
            }
        },

        selectCustomer: async function(code) {
            const customer = this.data.customers.find(c => c.code === code);
            if (!customer) return;
            document.getElementById('q_customer_code').value = customer.code;
            document.getElementById('q_customer_code').dataset.id = customer.id;
            document.getElementById('q_customer_name').value = customer.name;
            document.getElementById('q_customer_address').value = customer.address || '';
            document.getElementById('q_customer_tel').value = customer.telephone || '';
            document.getElementById('q_customer_contact').value = customer.contact_person || '';
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${customer.id}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                const bal = await res.json();
                document.getElementById('q_customer_balance').value = parseFloat(bal.balance || 0).toFixed(2);
            } catch(e) {
                document.getElementById('q_customer_balance').value = '0.00';
            }

            this.closeAllDropdowns();
        },

        handleItemSearch: async function(input) {
            this.closeAllDropdowns();
            const val = input.value.trim().toLowerCase();
            const tr = input.closest('tr');
            const suggest = tr ? (tr.querySelector('.grid-suggest') || input.nextElementSibling) : null;
            if (!val || !suggest) return;

            if (!this.data.items || this.data.items.length === 0) {
                await this.loadInventory();
            }

            const searchWords = val.split(/\s+/);
            const matches = typeof window.smartSearchFilterAndSort === 'function' ? 
                window.smartSearchFilterAndSort(this.data.items, val) : 
                (this.data.items || []).filter(i => {
                    const code = String(i.item_code || i.code || '');
                    const name = String(i.item_name || i.name || i.description || '');
                    const searchStr = `${code} ${name}`.toLowerCase();
                    return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
                }).slice(0, 25);

            if (matches.length > 0) {
                this.suggestIndex = -1;
                const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
                this.currentMatches = matches.slice(0, maxLimit);
                tr._currentMatches = this.currentMatches;

                suggest.innerHTML = typeof window.renderGlobalItemSuggestHTML === 'function' ?
                    window.renderGlobalItemSuggestHTML(this.currentMatches, { isPurchase: false }) :
                    this.currentMatches.map((i, idx) => `
                    <div class="suggest-item" data-idx="${idx}">
                        <span><b>${i.item_code || i.code}</b> &nbsp; ${i.item_name || i.name || i.description || ''}</span>
                        <span style="color:#15803d; font-weight:700; font-size:11px; float:right;">Rs. ${parseFloat(i.sales_price || i.selling_price || i.rate || 0).toFixed(2)}</span>
                    </div>`).join('');

                if (typeof window.positionGridDropdown === 'function') {
                    window.positionGridDropdown(suggest, input);
                } else {
                    suggest.style.display = 'block';
                    suggest.style.zIndex = '999999999';
                }

                const items = suggest.querySelectorAll('.suggest-item');
                items.forEach(el => {
                    el.addEventListener('mouseenter', () => {
                        this.suggestIndex = parseInt(el.dataset.idx);
                        this.updateSuggestHighlight(items);
                    });
                    el.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.selectItem(tr, parseInt(el.dataset.idx));
                    });
                });
            } else {
                suggest.style.display = 'none';
            }

            const tbody = document.getElementById('qGridBody');
            if (tr === tbody.lastElementChild && val !== '') { this.addEmptyRow(); }
        },

        selectItem: function(rowOrIndex, matchIndex) {
            let row = (typeof rowOrIndex === 'object' && rowOrIndex && rowOrIndex.nodeType) ? 
                rowOrIndex : 
                document.querySelector(`#qGridBody tr[data-index="${rowOrIndex}"]`);
            if (!row) return;

            let item = null;
            if (typeof matchIndex === 'number' && this.currentMatches && this.currentMatches[matchIndex]) {
                item = this.currentMatches[matchIndex];
            } else if (row._currentMatches && row._currentMatches[matchIndex]) {
                item = row._currentMatches[matchIndex];
            }

            if (!item) {
                const currentVal = (row.querySelector('.item-code-search')?.value || '').trim().toLowerCase();
                if (currentVal && this.data.items && this.data.items.length > 0) {
                    item = this.data.items.find(i => String(i.item_code || i.code || '').toLowerCase() === currentVal || String(i.item_name || i.name || '').toLowerCase() === currentVal)
                        || this.data.items.find(i => String(i.item_code || i.code || '').toLowerCase().includes(currentVal) || String(i.item_name || i.name || '').toLowerCase().includes(currentVal));
                }
            }

            if (!item) return;

            row.dataset.coaId = item.id;
            row.dataset.qtyPerPiece = item.qty_per_piece || 0;
            const codeInput = row.querySelector('.item-code-search');
            if (codeInput) codeInput.value = item.item_code || item.code || '';
            const hsInput = row.querySelector('.hs-code');
            if (hsInput) hsInput.value = item.hs_code || '';
            const descInput = row.querySelector('.si-description');
            if (descInput) descInput.value = item.item_name || item.name || item.description || '';
            const unitInput = row.querySelector('.si-unit');
            if (unitInput) unitInput.value = item.unit || 'Pcs';
            const rateInput = row.querySelector('.rate');
            const saleRate = parseFloat(item.sales_price || item.selling_price || item.rate || 0);
            if (rateInput) rateInput.value = saleRate > 0 ? saleRate.toFixed(2) : '0.00';
            const taxInput = row.querySelector('.stax-rate');
            if (taxInput) taxInput.value = parseFloat(item.tax_rate || 0).toFixed(2);
            
            this.closeAllDropdowns();
            const piecesInput = row.querySelector('.pieces');
            if (piecesInput) { piecesInput.focus(); piecesInput.select(); }
            this.calculateRow(row);
        },

        calculateRow: function(row) {
            const qtyPerPiece = parseFloat(row.dataset.qtyPerPiece) || 0;
            const pieces = parseFloat(row.querySelector('.pieces').value) || 0;
            
            if (pieces > 0 && qtyPerPiece > 0) {
            if (!document.activeElement || document.activeElement.classList.contains('pieces') || document.activeElement.classList.contains('item-code-search')) {
                row.querySelector('.qty').value = (pieces * qtyPerPiece).toFixed(2);
            }
        }

            const qty = parseFloat(row.querySelector('.qty').value) || 0;
            const rate = parseFloat(row.querySelector('.rate').value) || 0;
            const taxP = parseFloat(row.querySelector('.stax-rate').value) || 0;
            const frthP = parseFloat(row.querySelector('.ftax-rate').value) || 0;

            const valExcl = qty * rate;
            const taxAmt = (valExcl * taxP) / 100;
            const frthAmt = (valExcl * frthP) / 100;
            const valIncl = valExcl + taxAmt + frthAmt;

            row.querySelector('.val-excl').value = valExcl > 0 ? valExcl.toFixed(2) : '';
            row.querySelector('.stax-amt').value = taxAmt > 0 ? taxAmt.toFixed(2) : '';
            row.querySelector('.ftax-amt').value = frthAmt > 0 ? frthAmt.toFixed(2) : '';
            row.querySelector('.val-incl').value = valIncl > 0 ? valIncl.toFixed(2) : '';

            this.calculateTotals();
        },

        calculateTotals: function() {
            let totPieces = 0, totQty = 0, totExcl = 0, totTax = 0, totFrth = 0, totIncl = 0;
            
            document.querySelectorAll('#qGridBody tr').forEach(row => {
                totPieces += parseFloat(row.querySelector('.pieces').value) || 0;
                totQty += parseFloat(row.querySelector('.qty').value) || 0;
                totExcl += parseFloat(row.querySelector('.val-excl').value) || 0;
                totTax += parseFloat(row.querySelector('.stax-amt').value) || 0;
                totFrth += parseFloat(row.querySelector('.ftax-amt').value) || 0;
                totIncl += parseFloat(row.querySelector('.val-incl').value) || 0;
            });

            document.getElementById('q_tot_pieces').value = totPieces > 0 ? totPieces.toFixed(2) : '0.00';
            document.getElementById('q_tot_qty').value = totQty > 0 ? totQty.toFixed(2) : '0.00';
            document.getElementById('q_tot_excl').value = totExcl > 0 ? totExcl.toFixed(2) : '0.00';
            document.getElementById('q_tot_tax').value = totTax > 0 ? totTax.toFixed(2) : '0.00';
            document.getElementById('q_tot_further').value = totFrth > 0 ? totFrth.toFixed(2) : '0.00';
            document.getElementById('q_tot_incl').value = totIncl > 0 ? totIncl.toFixed(2) : '0.00';
            
            this.updateAmountInWords(totIncl);
        },

        updateAmountInWords: function(amount) {
            if (!amount || isNaN(amount) || amount === 0) {
                document.getElementById('q_amt_words').innerText = 'Rupees zero and 00/100 only.';
                return;
            }
            const integerPart = Math.floor(amount);
            let decimalPart = Math.round((amount - integerPart) * 100);
            
            const words = this.numberToWords(integerPart);
            const decStr = decimalPart < 10 ? '0' + decimalPart : decimalPart;
            const capitalizedWords = words.charAt(0).toUpperCase() + words.slice(1);
            
            document.getElementById('q_amt_words').innerText = `Rupees ${capitalizedWords} and ${decStr}/100 only.`;
        },

        numberToWords: function(num) {
            if (num === 0) return 'zero';
            
            const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
            const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
            const inWords = (n) => {
                if (n < 20) return a[n];
                if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10] : ' ');
                if (n < 1000) return a[Math.floor(n / 100)] + 'hundred ' + (n % 100 !== 0 ? inWords(n % 100) : '');
                if (n < 100000) return inWords(Math.floor(n / 1000)) + 'thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
                if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
                return inWords(Math.floor(n / 10000000)) + 'crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
            };
    
            return inWords(num).trim();
        },

        saveQuotation: async function() {
            const payload = {
                id: this.data.currentId,
                company_id: this.getCompanyId(),
                serial_no: document.getElementById('q_sn').value,
                date: document.getElementById('q_date').value,
                valid_till: document.getElementById('q_valid_till').value,
                subject_line: document.getElementById('q_subject').value,
                customer_coa_id: document.getElementById('q_customer_code').dataset.id,
                customer_address: document.getElementById('q_customer_address').value,
                customer_telephone: document.getElementById('q_customer_tel').value,
                contact_person: document.getElementById('q_customer_contact').value,
                employee_id: document.getElementById('q_employee_ref').value,
                terms_of_payment: document.getElementById('q_terms_payment').value,
                total_pieces: document.getElementById('q_tot_pieces').value,
                total_qty: document.getElementById('q_tot_qty').value,
                total_excl_tax: document.getElementById('q_tot_excl').value,
                total_tax_amount: document.getElementById('q_tot_tax').value,
                total_further_tax: document.getElementById('q_tot_further').value,
                total_amount: document.getElementById('q_tot_incl').value,
                remarks: document.getElementById('q_remarks').value,
                terms_conditions: document.getElementById('q_terms_cond').value,
                is_cancelled: document.getElementById('q_is_cancelled').checked,
                converted_to_so: document.getElementById('q_converted_so_no') ? parseInt(document.getElementById('q_converted_so_no').getAttribute('data-sn') || 0) : 0,
                converted_to_dc: document.getElementById('q_converted_dc_no') ? parseInt(document.getElementById('q_converted_dc_no').getAttribute('data-sn') || 0) : 0,
                converted_to_inv_tax: document.getElementById('q_converted_invtax_no') ? parseInt(document.getElementById('q_converted_invtax_no').getAttribute('data-sn') || 0) : 0,
                converted_to_inv_nontax: document.getElementById('q_converted_invnontax_no') ? parseInt(document.getElementById('q_converted_invnontax_no').getAttribute('data-sn') || 0) : 0,
                items: []
            };

            if (!payload.customer_coa_id) {
                alert("Please select a customer.");
                return;
            }

            document.querySelectorAll('#qGridBody tr').forEach(row => {
                const itemId = row.dataset.coaId;
                const qty = parseFloat(row.querySelector('.qty').value) || 0;
                if (itemId && qty > 0) {
                    payload.items.push({
                        item_coa_id: itemId,
                        pieces: row.querySelector('.pieces').value,
                        qty: row.querySelector('.qty').value,
                        rate: row.querySelector('.rate').value,
                        val_excl_tax: row.querySelector('.val-excl').value,
                        tax_rate: row.querySelector('.stax-rate').value,
                        tax_amount: row.querySelector('.stax-amt').value,
                        further_tax_rate: row.querySelector('.ftax-rate').value,
                        further_tax_amount: row.querySelector('.ftax-amt').value,
                        val_incl_tax: row.querySelector('.val-incl').value
                    });
                }
            });

            if (payload.items.length === 0) {
                alert("Please add at least one item.");
                return;
            }

            try {
                const res = await fetch(`api/quotation.php?action=save_quotation&company_id=${payload.company_id}`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Quotation saved successfully!");
                    this.resetForm(true);
                } else {
                    alert("Error: " + result.message);
                }
            } catch (err) {
                console.error("Save error:", err);
            }
        },

        deleteQuotation: async function() {
            if (!this.data.currentId) return;
            if (!confirm("Are you sure you want to delete this quotation?")) return;

            try {
                const companyId = this.getCompanyId();
                const res = await fetch(`api/quotation.php?action=delete_quotation&id=${this.data.currentId}&company_id=${companyId}`, { method: 'POST' });
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Deleted successfully.");
                    this.resetForm(true);
                }
            } catch (err) {
                console.error("Delete error:", err);
            }
        },

                findQuotationsList: [],
        findSortField: 'serial_no',
        findSortAsc: false,
        findSelectedIndex: -1,

        showFindModal: async function() {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const res = await fetch(`api/quotation.php?action=get_all_quotations&company_id=` + coId);
                this.findQuotationsList = await res.json();
                this.renderFindGrid(this.findQuotationsList);
                
                const modal = document.getElementById('qFindModal');
                if (modal) {
                    modal.style.display = 'flex';
                    modal.focus();
                    
                    // Attach global keydown for this modal
                    modal.onkeydown = (e) => this.handleFindKeydown(e);
                }
            } catch(e) {
                console.error("Error fetching find list:", e);
            }
        },

        renderFindGrid: function(data) {
            const tbody = document.getElementById('qFindGridBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            data.forEach((q, index) => {
                const tr = document.createElement('tr');
                tr.dataset.sn = q.serial_no;
                tr.dataset.index = index;
                
                tr.innerHTML = `
                    <td class="row-indicator"></td>
                    <td>${q.serial_no}</td>
                    <td>${q.formatted_date || q.date}</td>
                    <td>${q.formatted_valid_till || q.valid_till || ''}</td>
                    <td>${q.customer_name || ''}</td>
                    <td>${q.terms_of_payment || ''}</td>
                    <td>${q.employee_name || ''}</td>
                    <td style="text-align: right;">${parseFloat(q.total_amount || 0).toFixed(2)}</td>
                    <td>${q.status || ''}</td>
                `;
                
                tr.onclick = () => this.selectFindRow(index, tr, q);
                tr.ondblclick = () => {
                    this.navigateBySN(q.serial_no);
                    document.getElementById('qFindModal').style.display = 'none';
                };
                
                tbody.appendChild(tr);
            });
            
            if (data.length > 0) {
                this.selectFindRow(0, tbody.firstChild, data[0]);
            } else {
                this.findSelectedIndex = -1;
                this.updateFindFooter(null);
            }
        },

        selectFindRow: function(index, tr, dataObj) {
            this.findSelectedIndex = index;
            const tbody = document.getElementById('qFindGridBody');
            if (!tbody) return;
            
            tbody.querySelectorAll('tr').forEach(row => {
                row.classList.remove('selected');
                row.querySelector('.row-indicator').innerHTML = '';
            });
            
            if (tr) {
                tr.classList.add('selected');
                tr.querySelector('.row-indicator').innerHTML = '&#9654;';
                tr.scrollIntoView({ block: 'nearest' });
            }
            
            this.updateFindFooter(dataObj);
        },

        updateFindFooter: function(q) {
            if (q) {
                document.getElementById('qFindAddedBy').value = "Administrator";
                document.getElementById('qFindAddedOn').value = q.created_at || '';
                document.getElementById('qFindEditedBy').value = "";
                document.getElementById('qFindEditedOn').value = "";
            } else {
                document.getElementById('qFindAddedBy').value = "";
                document.getElementById('qFindAddedOn').value = "";
                document.getElementById('qFindEditedBy').value = "";
                document.getElementById('qFindEditedOn').value = "";
            }
        },

        handleFindKeydown: function(e) {
            const tbody = document.getElementById('qFindGridBody');
            if (!tbody) return;
            const rows = tbody.querySelectorAll('tr');
            if (rows.length === 0) return;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.findSelectedIndex < rows.length - 1) {
                    const newIndex = this.findSelectedIndex + 1;
                    const tr = rows[newIndex];
                    const sn = tr.dataset.sn;
                    const dataObj = this.findQuotationsList.find(x => x.serial_no == sn);
                    this.selectFindRow(newIndex, tr, dataObj);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.findSelectedIndex > 0) {
                    const newIndex = this.findSelectedIndex - 1;
                    const tr = rows[newIndex];
                    const sn = tr.dataset.sn;
                    const dataObj = this.findQuotationsList.find(x => x.serial_no == sn);
                    this.selectFindRow(newIndex, tr, dataObj);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.findSelectedIndex >= 0) {
                    const sn = rows[this.findSelectedIndex].dataset.sn;
                    this.navigateBySN(sn);
                    document.getElementById('qFindModal').style.display = 'none';
                }
            }
        },

        filterFindGrid: function() {
            const field = document.getElementById('qFindField').value;
            const val = document.getElementById('qFindValue').value.toLowerCase();
            
            if (!val) {
                this.renderFindGrid(this.findQuotationsList);
                return;
            }
            
            const filtered = this.findQuotationsList.filter(q => {
                const searchStr = (q[field] || '').toString().toLowerCase();
                return (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, val) : searchStr.includes(val));
            });
            this.renderFindGrid(filtered);
        },

        refreshFindGrid: function() {
            document.getElementById('qFindValue').value = '';
            this.showFindModal();
        },

        sortFindGrid: function(field) {
            if (this.findSortField === field) {
                this.findSortAsc = !this.findSortAsc;
            } else {
                this.findSortField = field;
                this.findSortAsc = true;
            }
            
            const sorted = [...this.findQuotationsList].sort((a, b) => {
                let valA = a[field] || '';
                let valB = b[field] || '';
                
                if (field === 'serial_no') {
                    valA = parseInt(valA) || 0;
                    valB = parseInt(valB) || 0;
                }
                
                if (valA < valB) return this.findSortAsc ? -1 : 1;
                if (valA > valB) return this.findSortAsc ? 1 : -1;
                return 0;
            });
            
            this.findQuotationsList = sorted;
            this.renderFindGrid(sorted);
        },


        navigateBySN: async function(sn, dir = undefined) {
            try {
                const companyId = this.getCompanyId();
                let url = `api/quotation.php?action=get_quotation&serial_no=${sn}&company_id=${companyId}`;
                if (dir === 'next' || dir === 'prev') url += `&dir=${dir}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data && data.id) {
                    this.fillForm(data);
                } else {
                    if (dir === 'next' || dir === 'last') {
                        this.showToast('You are on the last record');
                    } else if (dir === 'prev') {
                        this.showToast('You are on the first record');
                    } else {
                        alert("Quotation not found.");
                        this.resetForm();
                        document.getElementById('q_sn').value = sn;
                        document.getElementById('q_date').value = new Date().toISOString().split('T')[0];
                    }
                }
            } catch (err) {
                console.error("Find error:", err);
            }
        },

        fillForm: function(q) {
            this.data.currentId = q.id;
            this.data.isNew = false;

            document.getElementById('q_sn').value = q.serial_no;
            document.getElementById('q_date').value = q.date;
            document.getElementById('q_valid_till').value = q.valid_till || '';
            document.getElementById('q_terms_payment').value = q.terms_of_payment || '';
            
            this.selectEmployee(q.employee_id, q.employee_name || 'Select Employee');
            
            document.getElementById('q_subject').value = q.subject_line || 'QUOTATION';
            
            document.getElementById('q_customer_code').value = q.customer_code;
            document.getElementById('q_customer_code').dataset.id = q.customer_coa_id;
            document.getElementById('q_customer_name').value = q.customer_name;
            document.getElementById('q_customer_address').value = q.customer_address || '';
            document.getElementById('q_customer_tel').value = q.customer_telephone || '';
            document.getElementById('q_customer_contact').value = q.contact_person || '';
            
            (async () => {
                if (q.customer_coa_id) {
                    try {
                        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                        const res = await fetch(`api/maintain.php?action=get_coa_balance&coa_id=${q.customer_coa_id}&fy_id=${session.fy_id || 0}&company_id=${session.company_id || 1}`);
                        const bal = await res.json();
                        document.getElementById('q_customer_balance').value = parseFloat(bal.balance || 0).toFixed(2);
                    } catch(e) {
                        document.getElementById('q_customer_balance').value = '0.00';
                    }
                }
            })();
            
            document.getElementById('q_remarks').value = q.remarks || '';
            document.getElementById('q_terms_cond').value = q.terms_conditions || '';
            document.getElementById('q_is_cancelled').checked = q.is_cancelled == 1;
            document.getElementById('q_cancelled_stamp').style.display = q.is_cancelled == 1 ? 'block' : 'none';

            const setConversionText = (idNo, idText, val) => {
                const elNo = document.getElementById(idNo);
                const elText = document.getElementById(idText);
                if (val > 0) {
                    if (elNo) { elNo.innerText = val; elNo.setAttribute('data-sn', val); }
                    if (elText) elText.style.display = 'block';
                }
            };
            setConversionText('q_converted_so_no', 'q_converted_so_text', parseInt(q.converted_to_so) || 0);
            setConversionText('q_converted_dc_no', 'q_converted_dc_text', parseInt(q.converted_to_dc) || 0);
            setConversionText('q_converted_invtax_no', 'q_converted_invtax_text', parseInt(q.converted_to_inv_tax) || 0);
            setConversionText('q_converted_invnontax_no', 'q_converted_invnontax_text', parseInt(q.converted_to_inv_nontax) || 0);

            const body = document.getElementById('qGridBody');
            body.innerHTML = '';
            if (q.items && Array.isArray(q.items)) {
                q.items.forEach(item => {
                    this.addEmptyRow(item);
                });
                for (let i = q.items.length; i < this.data.gridRows; i++) {
                    this.addEmptyRow();
                }
            } else {
                for (let i = 0; i < this.data.gridRows; i++) this.addEmptyRow();
            }
            this.calculateTotals();
        },

        convertOrder: async function() {
            if (!this.data.currentId) {
                alert("Please save the Quotation first before converting to Sales Order.");
                return;
            }
            try {
                const companyId = this.getCompanyId();
                const res = await fetch(`api/sale_order.php?action=get_next_serial_no&company_id=${companyId}`);
                const data = await res.json();
                const nextNo = data.next_no;
                if (nextNo) {
                    const el = document.getElementById('q_converted_so_no');
                    if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                    const textEl = document.getElementById('q_converted_so_text');
                    if (textEl) textEl.style.display = 'block';
                    
                    const qSnToConvert = document.getElementById('q_sn').value;
                    const saveBtn = document.querySelector('.po-btn-save');
                    if (saveBtn) {
                        const originalText = saveBtn.innerText;
                        saveBtn.innerText = 'Converting...';
                        await this.saveQuotation();
                        saveBtn.innerText = originalText;
                    } else {
                        await this.saveQuotation();
                    }

                                        if (typeof window.openSecondaryModularPopup === 'function') {
                        window.openSecondaryModularPopup('Navigation/Sales/sale_order.html', 'fa-shopping-cart', 'Sale Order', async () => {
                            if (window.SaleOrderModule && typeof window.SaleOrderModule.init === 'function') {
                                await window.SaleOrderModule.init();
                                if (typeof window.SaleOrderModule.fetchQuotationData === 'function') {
                                    window.SaleOrderModule.fetchQuotationData(qSnToConvert);
                                }
                            }
                        }, 'Sale Orders', true, true);
                    }
                }
            } catch(e) {
                console.error("Convert SO Error:", e);
                alert("Failed to convert to Sales Order.");
            }
        },

        convertDC: async function() {
            if (!this.data.currentId) {
                alert("Please save the Quotation first before converting to D.C.");
                return;
            }
            try {
                const companyId = this.getCompanyId();
                const res = await fetch(`api/delivery_challan.php?action=get_next_serial_no&company_id=${companyId}`);
                const data = await res.json();
                const nextNo = data.next_no;
                if (nextNo) {
                    const el = document.getElementById('q_converted_dc_no');
                    if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                    const textEl = document.getElementById('q_converted_dc_text');
                    if (textEl) textEl.style.display = 'block';
                    
                    const qSnToConvert = document.getElementById('q_sn').value;
                    const saveBtn = document.querySelector('.po-btn-save');
                    if (saveBtn) {
                        const originalText = saveBtn.innerText;
                        saveBtn.innerText = 'Converting...';
                        await this.saveQuotation();
                        saveBtn.innerText = originalText;
                    } else {
                        await this.saveQuotation();
                    }

                                        if (typeof window.openSecondaryModularPopup === 'function') {
                        window.openSecondaryModularPopup('Navigation/Sales/delivery_challans.html', 'fa-truck', 'Delivery Challan', async () => {
                            let tries = 0;
                            const poll = setInterval(async () => {
                                tries++;
                                if (window.DeliveryChallanModule && typeof window.DeliveryChallanModule.init === 'function') {
                                    clearInterval(poll);
                                    await window.DeliveryChallanModule.init();
                                    setTimeout(() => {
                                        if (typeof window.DeliveryChallanModule.fetchQuotationData === 'function') {
                                            window.DeliveryChallanModule.fetchQuotationData(qSnToConvert);
                                        }
                                    }, 500);
                                } else if (tries > 50) {
                                    clearInterval(poll);
                                }
                            }, 100);
                        }, 'Delivery Challans', true, true);
                    }
                }
            } catch(e) {
                console.error("Convert DC Error:", e);
                alert("Failed to convert to Delivery Challan.");
            }
        },

        convertInvoice: async function(isTax) {
            if (!this.data.currentId) {
                alert("Please save the Quotation first before converting to Invoice.");
                return;
            }
            try {
                const companyId = this.getCompanyId();
                const taxFlag = isTax ? 1 : 0;
                const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${taxFlag}`);
                const data = await res.json();
                const nextNo = data.next_sn || data.next_no;
                if (nextNo) {
                    if (isTax) {
                        const el = document.getElementById('q_converted_invtax_no');
                        if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                        const textEl = document.getElementById('q_converted_invtax_text');
                        if (textEl) textEl.style.display = 'block';
                    } else {
                        const el = document.getElementById('q_converted_invnontax_no');
                        if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                        const textEl = document.getElementById('q_converted_invnontax_text');
                        if (textEl) textEl.style.display = 'block';
                    }
                    const qSnToConvert = document.getElementById('q_sn').value;
                    const saveBtn = document.querySelector('.po-btn-save');
                    if (saveBtn) {
                        const originalText = saveBtn.innerText;
                        saveBtn.innerText = 'Converting...';
                        await this.saveQuotation();
                        saveBtn.innerText = originalText;
                    } else {
                        await this.saveQuotation();
                    }

                                        if (typeof window.openSecondaryModularPopup === 'function') {
                        window.openSecondaryModularPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice', 'Sale Invoice', async () => {
                            let tries = 0;
                            const poll = setInterval(async () => {
                                tries++;
                                if (window.SIModule && typeof window.SIModule.init === 'function') {
                                    clearInterval(poll);
                                    await window.SIModule.init();
                                    setTimeout(() => {
                                        if (typeof window.SIModule.fetchQuotationData === 'function') {
                                            window.SIModule.fetchQuotationData(qSnToConvert, isTax);
                                        }
                                    }, 500);
                                } else if (tries > 50) {
                                    clearInterval(poll);
                                }
                            }, 100);
                        }, 'Sale Invoice', true, true);
                    }
                }
            } catch(e) {
                console.error("Convert Invoice Error:", e);
                alert("Failed to convert to Invoice.");
            }
        },

        navigate: async function(dir) {
            let sn = parseInt(document.getElementById('q_sn').value) || 0;
            if (dir === 'last') {
                const res = await fetch(`api/quotation.php?action=get_next_serial_no&company_id=${this.getCompanyId()}`);
                const data = await res.json();
                sn = (data.next_no || 2) - 1;
                dir = undefined;
            } else if (sn === 0 || dir === 'this') {
                if (dir === 'next') {
                    const res = await fetch(`api/quotation.php?action=get_next_serial_no&company_id=${this.getCompanyId()}`);
                    const data = await res.json();
                    sn = (data.next_no || 2) - 1;
                    dir = undefined;
                } else if (dir !== 'next' && dir !== 'prev') {
                    sn = 1;
                    dir = undefined;
                }
            } else {
                if (dir !== 'next' && dir !== 'prev') {
                    dir = undefined;
                }
            }
            if (sn > 0) this.navigateBySN(sn, dir);
        },

        setDefaultTerms: function() {
            document.getElementById('q_terms_cond').value = "1. Price quoted above are ex.gadoon factory.\n2. Sales Tax/Further Tax & Advance Income Tax u/s 236 G are as above.\n3. Payment will be 100% Advance.\n4. Rate will be changed without any prior notice if engro polyment and chamical ltd change his rate.\n5. Taxes will be applicable as per government of pakistan policy.";
        },

                openPrintSettings: function() {
            const printTax = localStorage.getItem('q_sett_print_tax');
            const printHs = localStorage.getItem('q_sett_print_hs');
            const noHeader = localStorage.getItem('q_sett_no_header');
            
            if (printTax === '1') document.getElementById('q_sett_print_tax').checked = true;
            else document.getElementById('q_sett_no_print_tax').checked = true;
            
            if (printHs === '1') document.getElementById('q_sett_print_hs').checked = true;
            else document.getElementById('q_sett_no_print_hs').checked = true;
            
            document.getElementById('q_sett_no_header').checked = (noHeader === '1');
            
            const modal = document.getElementById('qPrintSettModal');
            if (modal) {
                modal.style.display = 'flex';
                modal.focus();
            }
        },

        savePrintSettings: function() {
            const printTax = document.getElementById('q_sett_print_tax').checked ? '1' : '0';
            const printHs = document.getElementById('q_sett_print_hs').checked ? '1' : '0';
            const noHeader = document.getElementById('q_sett_no_header').checked ? '1' : '0';
            
            localStorage.setItem('q_sett_print_tax', printTax);
            localStorage.setItem('q_sett_print_hs', printHs);
            localStorage.setItem('q_sett_no_header', noHeader);
            
            document.getElementById('qPrintSettModal').style.display = 'none';
        },

        printQuotation: function() {
            if (!this.data.currentId) return alert("Please save or retrieve a quotation first.");

            const sn = document.getElementById('q_sn').value;
            const date = document.getElementById('q_date').value;
            const validTill = document.getElementById('q_valid_till').value;
            const emp = document.getElementById('q_emp_text').innerText || '';
            const terms = document.getElementById('q_terms_payment').value;
            const subject = document.getElementById('q_subject').value;
            
            const cCode = document.getElementById('q_customer_code').value;
            const cName = document.getElementById('q_customer_name').value;
            const cAddress = document.getElementById('q_customer_address').value;
            const cContact = document.getElementById('q_customer_contact').value;
            const cTel = document.getElementById('q_customer_tel').value;

            const totNet = document.getElementById('q_tot_incl').value;
            const amtWords = document.getElementById('q_amt_words').innerText;
            const remarks = document.getElementById('q_remarks').value;
            const termsCond = document.getElementById('q_terms_cond').value;

            const printTax = localStorage.getItem('q_sett_print_tax') === '1';
            const printHs = localStorage.getItem('q_sett_print_hs') === '1';
            const noHeader = localStorage.getItem('q_sett_no_header') === '1';

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companies = JSON.parse(localStorage.getItem('softifyx_companies') || '[]');
            const company = companies.find(c => c.id == session.company_id) || {};
            
            let coName = company.name || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
            coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
            coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');
            
            const coAddress = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
            const coPhone = company.phone || '+92 348 7240256';
            const coEmail = company.email || 'info@seastonepipes.com';
            
            let customLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : null);
            if (!customLogo && typeof window.logoData !== 'undefined' && window.logoData) customLogo = window.logoData;
            
            const coNameStr = session.company_name || '';
            if (!customLogo && coNameStr) customLogo = localStorage.getItem(`softifyx_${coNameStr}_logo`);
            if (!customLogo) customLogo = localStorage.getItem('softifyx_logo');
            
            if (!customLogo || !customLogo.startsWith('data:image')) {
                for (let i = 0; i < localStorage.length; i++) {
                    let k = localStorage.key(i);
                    if (k && k.includes('logo')) {
                        let val = localStorage.getItem(k);
                        if (val && val.startsWith('data:image')) {
                            customLogo = val;
                            break;
                        }
                    }
                }
            }

            // 4. Default fallback
            if (!customLogo || (!customLogo.startsWith('data:image') && !customLogo.includes('.'))) {
                customLogo = 'assets/logos/logo.png';
            }
            
            let headerHtml = '';
            if (!noHeader) {
                headerHtml = `
                    <div class="header-area">
                        <div class="logo-box">
                            <img src="${customLogo}" alt="Logo" onerror="this.style.display='none'">
                        </div>
                        <div class="company-info">
                            <h1 class="company-name">${coName}</h1>
                            <div class="company-contacts">
                                <div><i class="fas fa-map-marker-alt"></i> ${coAddress}</div>
                                <div><i class="fas fa-phone"></i> ${coPhone}</div>
                                <div><i class="fas fa-envelope"></i> ${coEmail}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                headerHtml = `<div style="height: 120px;"></div>`;
            }

            let itemsHtml = '';
            document.querySelectorAll('#qGridBody tr').forEach((tr, index) => {
                const code = tr.querySelector('.item-code-search').value;
                if (!code) return;
                
                const hsCode = tr.querySelector('.hs-code').value;
                const desc = tr.querySelector('.si-description').value;
                const pieces = parseFloat(tr.querySelector('.pieces').value || 0).toFixed(2);
                const qty = parseFloat(tr.querySelector('.qty').value || 0).toFixed(2);
                const unit = tr.querySelector('.si-unit').value;
                const rate = parseFloat(tr.querySelector('.rate').value || 0).toFixed(2);
                const valExcl = parseFloat(tr.querySelector('.val-excl').value || 0).toFixed(2);
                const valIncl = parseFloat(tr.querySelector('.val-incl').value || 0).toFixed(2);

                if (printTax) {
                    const stRate = parseFloat(tr.querySelector('.stax-rate').value || 0).toFixed(2);
                    const stAmt = parseFloat(tr.querySelector('.stax-amt').value || 0).toFixed(2);
                    const ftRate = parseFloat(tr.querySelector('.ftax-rate').value || 0).toFixed(2);
                    const ftAmt = parseFloat(tr.querySelector('.ftax-amt').value || 0).toFixed(2);
                    
                    itemsHtml += `
                        <tr>
                            <td style="text-align: center;">${index + 1}</td>
                            ${printHs ? `<td>${hsCode}</td>` : ''}
                            <td>${desc}</td>
                            <td style="text-align: right;">${pieces}</td>
                            <td style="text-align: right;">${qty}</td>
                            <td style="text-align: center;">${unit}</td>
                            <td style="text-align: right;">${rate}</td>
                            <td style="text-align: right;">${valExcl}</td>
                            <td style="text-align: right;">${stRate}</td>
                            <td style="text-align: right;">${stAmt}</td>
                            <td style="text-align: right;">${ftRate}</td>
                            <td style="text-align: right;">${ftAmt}</td>
                            <td style="text-align: right;">${valIncl}</td>
                        </tr>
                    `;
                } else {
                    itemsHtml += `
                        <tr>
                            <td style="text-align: center;">${index + 1}</td>
                            ${printHs ? `<td>${hsCode}</td>` : ''}
                            <td>${desc}</td>
                            <td style="text-align: right;">${pieces}</td>
                            <td style="text-align: right;">${qty}</td>
                            <td style="text-align: center;">${unit}</td>
                            <td style="text-align: right;">${rate}</td>
                            <td style="text-align: right;">${valIncl}</td>
                        </tr>
                    `;
                }
            });

            const printWindow = window.open('', '_blank', 'width=900,height=600');
            const html = `
                <html>
                <head>
                    <title>QUOTATION - ${sn}</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                    <style>
                        @page { margin: 0; size: auto; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #000; margin: 10mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .page-container { padding: 0; position: relative; box-sizing: border-box; }
                        
                        .header-area { display: flex; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 10px; margin-bottom: 15px; }
                        .logo-box { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; }
                        .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                        
                        .company-info { flex: 1; padding-left: 20px; display: flex; flex-direction: column; justify-content: center; }
                        .company-name { color: #1F4E79; font-size: 22px; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; }
                        .company-contacts { font-size: 9px; line-height: 1.6; }
                        .company-contacts i { color: #1F4E79; width: 12px; text-align: center; margin-right: 3px; }
                        
                        .doc-title-container { display: flex; justify-content: center; margin-bottom: 15px; }
                        .doc-title { background: #1F4E79; color: #fff; padding: 5px 30px; font-size: 16px; font-weight: bold; border-radius: 4px; letter-spacing: 2px; }
                        
                        .meta-info { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
                        .meta-info td { padding: 4px 8px; vertical-align: top; border: 1px solid #ccc; }
                        .meta-info .label { font-weight: bold; width: 100px; background: #f0f0f0; }
                        
                        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9px; }
                        .items-table th { background: #1F4E79; color: #fff; padding: 6px 4px; text-align: center; border: 1px solid #1F4E79; font-size: 9px; }
                        .items-table td { padding: 4px; border: 1px solid #000; }
                        
                        .totals-row td { font-weight: bold; background: #f0f0f0; }
                        
                        .footer-section { margin-top: 15px; border: 1px solid #000; padding: 8px; border-radius: 4px; }
                        .amount-words { font-weight: bold; font-size: 11px; margin-bottom: 5px; }
                        
                        .remarks-box { margin-top: 10px; min-height: 40px; }
                        .terms-box { margin-top: 10px; font-size: 9px; white-space: pre-wrap; }
                        
                        .signatures { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
                        .sig-line { width: 150px; border-top: 1px solid #000; text-align: center; padding-top: 5px; font-weight: bold; font-size: 10px; }
                    </style>
                </head>
                <body>
                    <div class="page-container">
                        ${headerHtml}
                        
                        <div class="doc-title-container">
                            <div class="doc-title">${subject || 'QUOTATION'}</div>
                        </div>
                        
                        <table class="meta-info">
                            <tr>
                                <td class="label">Serial No:</td>
                                <td>${sn}</td>
                                <td class="label">Date:</td>
                                <td>${date}</td>
                            </tr>
                            <tr>
                                <td class="label">Customer Name:</td>
                                <td><b>${cName}</b><br>${cAddress}<br>${cContact ? 'Contact: ' + cContact : ''}<br>${cTel ? 'Tel: ' + cTel : ''}</td>
                                <td class="label">Valid Till:<br><br>Terms of Payment:<br><br>Employee:</td>
                                <td>${validTill}<br><br>${terms}<br><br>${emp}</td>
                            </tr>
                        </table>
                        
                        <table class="items-table">
                            <thead>
                                <tr>
                                    ${printTax ? `
                                        <th style="width:20px;">#</th>
                                        ${printHs ? '<th>HS CODE</th>' : ''}
                                        <th>DESCRIPTION</th>
                                        <th>PIECES</th>
                                        <th>QUANTITY</th>
                                        <th>UNIT</th>
                                        <th>RATE</th>
                                        <th>VALUE EXCL. TAX</th>
                                        <th>SALES TAX RATE</th>
                                        <th>SALES TAX AMOUNT</th>
                                        <th>FURTHER TAX RATE</th>
                                        <th>FURTHER TAX AMOUNT</th>
                                        <th>VALUE INCL. TAX</th>
                                    ` : `
                                        <th style="width:20px;">#</th>
                                        ${printHs ? '<th>HS CODE</th>' : ''}
                                        <th>DESCRIPTION</th>
                                        <th>PIECES</th>
                                        <th>QUANTITY</th>
                                        <th>UNIT</th>
                                        <th>RATE</th>
                                        <th>VALUE</th>
                                    `}
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                            <tfoot>
                                <tr class="totals-row">
                                    ${printTax ? `
                                        <td colspan="${printHs ? '12' : '11'}" style="text-align: right;">GRAND TOTAL</td>
                                    ` : `
                                        <td colspan="${printHs ? '7' : '6'}" style="text-align: right;">GRAND TOTAL</td>
                                    `}
                                    <td style="text-align: right;">${totNet}</td>
                                </tr>
                            </tfoot>
                        </table>
                        
                        <div class="footer-section">
                            <div class="amount-words">Amount in Words: ${amtWords}</div>
                            <div class="remarks-box"><b>Remarks:</b> ${remarks}</div>
                        </div>
                        
                        <div class="footer-section">
                            <b>Terms & Conditions:</b>
                            <div class="terms-box">${termsCond}</div>
                        </div>
                        
                        <div class="signatures">
                            <div class="sig-line">Prepared By</div>
                            <div class="sig-line">Checked By</div>
                            <div class="sig-line">Authorized Signatory</div>
                        </div>
                    </div>
                </body>
                </html>
            `;
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = function() {
                printWindow.print();
            };
        }
    };
})();




