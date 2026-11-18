(function() {
    window.MINModule = {
        data: {
            currentId: null,
            items: [],
            gridRows: 40,
            accounts: [],
            inventoryItems: [],
            jobs: [],
            locations: [],
            employees: [],
            formulas: [],
            formulaBaseItems: [],
            activeRowIndex: -1,
            suggestIndex: -1,
            activeSuggestType: null
        },

        init: async function() {
            console.log("Initializing Material Issue Notes Module...");
            const container = document.getElementById('materialIssueNotesContainer');
            if (!container) {
                setTimeout(() => this.init(), 100);
                return;
            }

            if (document.getElementById('min_val_from_date')) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                document.getElementById('min_val_from_date').value = `${year}-${month}-01`;
                document.getElementById('min_val_to_date').value = `${year}-${month}-${day}`;
            }

            await this.loadDependencies();
            this.setupEventListeners();
            await this.resetForm(true);
        },

        loadDependencies: async function() {
            try {
                const ts = new Date().getTime();
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;
                
                const [depRes, setRes] = await Promise.all([
                    fetch(`api/material_issue_notes.php?action=get_dependencies&_t=${ts}`),
                    fetch(`api/settings.php?action=get_setting&key=default_min_mode&company_id=${companyId}`)
                ]);
                const json = await depRes.json();
                
                try {
                    const setData = await setRes.json();
                    this.data.defaultMode = setData.value || 'job';
                } catch(e) {
                    this.data.defaultMode = 'job';
                }
                
                this.data.locations = json.locations || [];
                this.data.jobs = json.jobs || [];
                this.data.employees = json.employees || [];
                this.data.accounts = json.accounts || [];
                this.data.inventoryItems = json.items || [];
                this.data.formulas = json.formulas || [];

                this.populateSelects();
            } catch (err) { console.error("MIN Dependency Load Error:", err); }
        },

        populateSelects: function() {
            const jobSelect = document.getElementById('min_job_id');
            const locSelect = document.getElementById('min_location_id');
            const empSelect = document.getElementById('min_employee_id');

            if (jobSelect) {
                jobSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.jobs.map(j => `<option value="${j.id}">${j.job_no} - ${j.description || ''}</option>`).join('');
            }
            if (locSelect) {
                locSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
            }
            if (empSelect) {
                empSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
            }
            const formulaSelect = document.getElementById('min_formula_id');
            if (formulaSelect) {
                formulaSelect.innerHTML = '<option value="">Select Formula</option>' + 
                    this.data.formulas.map(f => `<option value="${f.id}">${f.serial_no} - ${f.formula_name || 'Formula'}</option>`).join('');
            }
        },

        toggleFormulaMode: function() {
            const isFormula = document.getElementById('min_use_formula').checked;
            document.getElementById('lbl_min_location').innerText = isFormula ? 'Select Formula' : 'Inventory Location';
            document.getElementById('lbl_min_job_no').innerText = isFormula ? 'Number of Formulas' : 'Job No & Description';
            
            document.getElementById('min_location_id').style.display = isFormula ? 'none' : 'block';
            document.getElementById('min_formula_id').style.display = isFormula ? 'block' : 'none';
            
            document.getElementById('min_job_id').style.display = isFormula ? 'none' : 'block';
            document.getElementById('min_formula_qty').style.display = isFormula ? 'block' : 'none';

            if (document.getElementById('min_valuation_container')) {
                document.getElementById('min_valuation_container').style.display = isFormula ? 'flex' : 'none';
            }

            if (!isFormula) {
                document.getElementById('min_formula_id').value = '';
                document.getElementById('min_formula_qty').value = '1';
            }
        },

        toggleValuationDates: function() {
            const method = document.getElementById('min_valuation_method').value;
            const dateContainer = document.getElementById('min_valuation_dates');
            if (dateContainer) {
                dateContainer.style.display = (method === 'avg_purchase') ? 'flex' : 'none';
            }
            this.loadFormulaItems();
        },

        loadFormulaItems: async function() {
            const formulaId = document.getElementById('min_formula_id').value;
            if (!formulaId) return;

            const valMethod = document.getElementById('min_valuation_method') ? document.getElementById('min_valuation_method').value : '';
            const fromDate = document.getElementById('min_val_from_date') ? document.getElementById('min_val_from_date').value : '';
            const toDate = document.getElementById('min_val_to_date') ? document.getElementById('min_val_to_date').value : '';

            try {
                const res = await fetch(`api/material_issue_notes.php?action=get_formula_items&formula_id=${formulaId}&valuation_method=${valMethod}&from_date=${fromDate}&to_date=${toDate}`);
                const items = await res.json();
                
                const tbody = document.querySelector('#min_grid tbody');
                tbody.innerHTML = '';
                
                this.data.formulaBaseItems = items;

                if (items && items.length > 0) {
                    items.forEach((item, i) => {
                        this.addRow(i + 1);
                        const row = tbody.lastElementChild;
                        
                        const codeInput = row.querySelector('.min-item-code');
                        codeInput.value = item.item_code;
                        codeInput.dataset.id = item.item_id;
                        codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                        
                        const hsCodeInput = row.querySelector('.min-hscode');
                        if (hsCodeInput) hsCodeInput.value = item.hs_code || '';

                        row.querySelector('.min-desc').value = item.description || '';
                        
                        row.dataset.basePieces = item.pieces || 0;
                        row.dataset.baseQty = item.qty || 0;
                        
                        row.querySelector('.min-unit').value = item.unit || 'Pcs';
                        row.querySelector('.min-rate').value = parseFloat(item.rate).toFixed(2);
                    });
                }
                
                const startPadIdx = items ? items.length : 0;
                for (let i = startPadIdx; i < this.data.gridRows; i++) {
                    this.addRow(i + 1);
                }
                
                document.querySelectorAll('#min_grid tbody tr').forEach(tr => {
                    if (tr.querySelector('.min-item-code').value) {
                        const piecesInput = tr.querySelector('.min-pieces');
                        const qtyInput = tr.querySelector('.min-qty');
                        if (parseFloat(tr.dataset.basePieces) > 0) piecesInput.value = parseFloat(tr.dataset.basePieces).toFixed(2);
                        if (parseFloat(tr.dataset.baseQty) > 0) qtyInput.value = parseFloat(tr.dataset.baseQty).toFixed(4);
                        this.calculateRow(tr);
                    }
                });
                this.calculateTotals();

            } catch (err) {
                console.error("Formula Load Error:", err);
            }
        },


        setupEventListeners: function() {
            const container = document.getElementById('materialIssueNotesContainer');
            if (!container) return;

            // Clear row selection when clicking outside selector
            container.addEventListener('click', (e) => {
                if (!e.target.closest('.min-row-selector')) {
                    const gridBody = document.querySelector('#min_grid tbody');
                    if (gridBody) {
                        gridBody.querySelectorAll('.min-row-selected').forEach(tr => tr.classList.remove('min-row-selected'));
                    }
                }
            });

            // Dr/Cr Account Search
            const drInput = document.getElementById('min_dr_code');
            const crInput = document.getElementById('min_cr_code');
            
            if (drInput) {
                drInput.addEventListener('input', (e) => this.handleAccountSearch(e.target.value, 'dr'));
                drInput.addEventListener('keydown', (e) => this.handleAccountKey(e, 'dr'));
                drInput.addEventListener('blur', () => setTimeout(() => {
                    const el = document.getElementById('min_dr_results');
                    if (el) el.style.display = 'none';
                }, 300));
            }
            
            if (crInput) {
                crInput.addEventListener('input', (e) => this.handleAccountSearch(e.target.value, 'cr'));
                crInput.addEventListener('keydown', (e) => this.handleAccountKey(e, 'cr'));
                crInput.addEventListener('blur', () => setTimeout(() => {
                    const el = document.getElementById('min_cr_results');
                    if (el) el.style.display = 'none';
                }, 300));
            }

            // Grid event delegation
            const gridBody = document.querySelector('#min_grid tbody');
            if (gridBody) {
                gridBody.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    if (e.target.classList.contains('min-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                    this.calculateRow(row, e.target);
                    
                    // Update base values for formulas if edited manually
                    if (document.getElementById('min_use_formula') && document.getElementById('min_use_formula').checked) {
                        let multiplier = parseFloat(document.getElementById('min_formula_qty').value) || 1;
                        if (multiplier < 1) multiplier = 1;
                        
                        if (e.target.classList.contains('min-pieces') || e.target.classList.contains('min-qty') || e.target.classList.contains('min-item-code')) {
                            const pieces = parseFloat(row.querySelector('.min-pieces')?.value) || 0;
                            const qty = parseFloat(row.querySelector('.min-qty')?.value) || 0;
                            row.dataset.basePieces = pieces / multiplier;
                            row.dataset.baseQty = qty / multiplier;
                        }
                    }
                    
                    this.calculateTotals();
                });

                gridBody.addEventListener('focusin', (e) => {
                    if (e.target.tagName === 'INPUT' && !e.target.readOnly) {
                        e.target.select();
                    }
                    if (e.target.classList.contains('min-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                });

                gridBody.addEventListener('focusout', (e) => {
                    if (e.target.classList.contains('min-item-code')) {
                        setTimeout(() => {
                            const results = document.getElementById('min_item_results');
                            if (results) results.style.display = 'none';
                        }, 200);
                    }
                });
                gridBody.addEventListener('click', (e) => {
                    if (e.target.classList.contains('min-row-selector')) {
                        gridBody.querySelectorAll('tr').forEach(r => r.classList.remove('min-row-selected'));
                        e.target.closest('tr').classList.add('min-row-selected');
                    }
                    if (e.target.classList.contains('min-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                });

                gridBody.addEventListener('keydown', (e) => {
                    if (e.target.classList.contains('min-grid-input')) {
                        this.handleGridNavigation(e);
                    }
                });

                const minScrollCont = document.getElementById('min_grid')?.parentElement;
                if (minScrollCont && !minScrollCont._hasMinScrollListener) {
                    minScrollCont._hasMinScrollListener = true;
                    minScrollCont.addEventListener('scroll', () => {
                        const results = document.getElementById('min_item_results');
                        if (results && results.style.display === 'block') {
                            const activeRow = document.querySelector(`#min_grid tbody tr[data-index="${this.data.activeRowIndex}"]`);
                            const activeInput = activeRow ? activeRow.querySelector('.min-item-code') : null;
                            if (activeInput && document.activeElement === activeInput) {
                                const rect = activeInput.getBoundingClientRect();
                                results.style.top = (rect.bottom + 1) + 'px';
                                results.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 630)) + 'px';
                            } else {
                                results.style.display = 'none';
                            }
                        }
                    });
                }
            }

            // Clear row selection when clicking anywhere except the row selector
            document.addEventListener('click', (e) => {
                if (!e.target.classList.contains('min-row-selector')) {
                    const gridBody = document.querySelector('#min_grid tbody');
                    if (gridBody) {
                        gridBody.querySelectorAll('tr').forEach(r => r.classList.remove('min-row-selected'));
                    }
                }
            });

            // Keyboard delete logic for selected row
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    const selectedRow = document.querySelector('#min_grid tbody tr.min-row-selected');
                    if (selectedRow) {
                        selectedRow.querySelectorAll('input').forEach(inp => inp.value = '');
                        const codeInput = selectedRow.querySelector('.min-item-code');
                        if (codeInput) {
                            delete codeInput.dataset.id;
                            delete codeInput.dataset.qtyPerPiece;
                        }
                        this.calculateTotals();
                    }
                }
            });

            container.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.saveMIN();
                }
            });

            const cancelCheck = document.getElementById('min_is_cancelled');
            if (cancelCheck) {
                cancelCheck.addEventListener('change', () => this.updateCancellationUI());
            }

            const formulaQtyInput = document.getElementById('min_formula_qty');
            if (formulaQtyInput) {
                formulaQtyInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.target.blur();
                        let multiplier = parseFloat(e.target.value) || 1;
                        if (multiplier < 1) multiplier = 1;
                        
                        document.querySelectorAll('#min_grid tbody tr').forEach(row => {
                            const baseQty = parseFloat(row.dataset.baseQty) || 0;
                            const basePieces = parseFloat(row.dataset.basePieces) || 0;
                            
                            const qtyInput = row.querySelector('.min-qty');
                            const piecesInput = row.querySelector('.min-pieces');
                            
                            let hasChange = false;
                            if (qtyInput && row.dataset.baseQty !== undefined) {
                                qtyInput.value = (baseQty * multiplier).toFixed(4);
                                hasChange = true;
                            }
                            if (piecesInput && row.dataset.basePieces !== undefined) {
                                piecesInput.value = (basePieces * multiplier).toFixed(2);
                                hasChange = true;
                            }
                            
                            if(hasChange) this.calculateRow(row);
                        });
                        this.calculateTotals();
                    }
                });
            }
        },

        handleAccountSearch: function(val, type) {
            const resultsId = type === 'dr' ? 'min_dr_results' : 'min_cr_results';
            const results = document.getElementById(resultsId);
            if (!results) return;

            if (!val.trim()) {
                results.style.display = 'none';
                return;
            }

            const query = val.toLowerCase();
            const matches = this.data.accounts.filter(a => 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(a.code.toLowerCase(), query) : a.code.toLowerCase().includes(query)) || 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(a.name.toLowerCase(), query) : a.name.toLowerCase().includes(query))
            ).slice(0, 15);

            if (matches.length === 0) {
                results.style.display = 'none';
                return;
            }

            this.data.suggestIndex = -1;
            this.data.activeSuggestType = type;
            results.innerHTML = matches.map((a, idx) => `
                <div class="so-suggest-item" data-index="${idx}" onmousedown="window.MINModule.selectAccount(${JSON.stringify(a).replace(/"/g, '&quot;')}, '${type}')">
                    <span class="code" style="color: #1F4E79; font-weight: 800;">${a.code}</span>
                    <span class="name" style="margin-left: 10px;">${a.name}</span>
                </div>
            `).join('');

            results.style.display = 'block';
        },

        handleAccountKey: function(e, type) {
            const resultsId = type === 'dr' ? 'min_dr_results' : 'min_cr_results';
            const results = document.getElementById(resultsId);
            if (!results || results.style.display === 'none') return;

            const items = results.querySelectorAll('.so-suggest-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.data.suggestIndex = (this.data.suggestIndex + 1) % items.length;
                this.updateSuggestHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.data.suggestIndex = (this.data.suggestIndex - 1 + items.length) % items.length;
                this.updateSuggestHighlight(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.data.suggestIndex > -1) {
                    items[this.data.suggestIndex].dispatchEvent(new Event('mousedown'));
                }
            }
        },

        selectAccount: function(account, type) {
            if (type === 'dr') {
                document.getElementById('min_dr_code').value = account.code;
                document.getElementById('min_dr_code').dataset.id = account.id;
                document.getElementById('min_dr_name').value = account.name;
                document.getElementById('min_dr_results').style.display = 'none';
                document.getElementById('min_cr_code').focus();
            } else {
                document.getElementById('min_cr_code').value = account.code;
                document.getElementById('min_cr_code').dataset.id = account.id;
                document.getElementById('min_cr_name').value = account.name;
                document.getElementById('min_cr_results').style.display = 'none';
            }
        },

        handleItemSearch: function(input) {
            const row = input.closest('tr');
            this.data.activeRowIndex = row.dataset.index;

            const val = input.value;
            let results = document.getElementById('min_item_results');
            if (!results) {
                results = document.createElement('div');
                results.id = 'min_item_results';
                results.className = 'so-suggest-box min-floating-suggest';
                document.body.appendChild(results);
            } else if (results.parentElement !== document.body) {
                document.body.appendChild(results);
            }

            const query = val.trim().toLowerCase();
            let matches = this.data.inventoryItems;
            if (query) {
                matches = typeof window.smartSearchFilterAndSort === 'function' ? 
                    window.smartSearchFilterAndSort(matches, query) : 
                    matches.filter(item => 
                        (item.item_code && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(item.item_code.toLowerCase(), query) : item.item_code.toLowerCase().includes(query))) || 
                        (item.item_name && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(item.item_name.toLowerCase(), query) : item.item_name.toLowerCase().includes(query)))
                    );
            }
            // Show all items (up to 1000) so user can navigate to the last item
            matches = matches.slice(0, 1000);

            if (matches.length === 0) {
                results.style.display = 'none';
                return;
            }

            this.data.suggestIndex = -1;
            results.innerHTML = matches.map((item, idx) => `
                <div class="so-suggest-item" data-index="${idx}" onmousedown="window.MINModule.selectItem(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="padding: 5px 8px; cursor: pointer; font-size: 11.5px; border-bottom: 1px solid #f1f5f9;">
                    <strong class="code">${item.item_code}</strong> - ${item.item_name} (${item.unit})
                </div>
            `).join('');

            results.style.display = 'block';
            if (typeof window.positionGridDropdown === 'function') {
                window.positionGridDropdown(results, input);
            } else {
                results.style.position = 'fixed';
                results.style.zIndex = '99999999';
                results.style.width = '500px';
                results.style.left = input.getBoundingClientRect().left + 'px';
                results.style.top = (input.getBoundingClientRect().bottom + 2) + 'px';
                results.style.display = 'block';
            }
        },

        handleItemKey: function(e) {
            const results = document.getElementById('min_item_results');
            if (!results || results.style.display === 'none') return false;

            const items = results.querySelectorAll('.so-suggest-item');
            if (items.length === 0) return false;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.data.suggestIndex = (this.data.suggestIndex + 1) % items.length;
                this.updateSuggestHighlight(items);
                return true;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.data.suggestIndex = (this.data.suggestIndex - 1 + items.length) % items.length;
                this.updateSuggestHighlight(items);
                return true;
            } else if (e.key === 'Enter') {
                if (this.data.suggestIndex > -1 && items[this.data.suggestIndex]) {
                    e.preventDefault();
                    items[this.data.suggestIndex].dispatchEvent(new Event('mousedown'));
                    return true;
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                results.style.display = 'none';
                this.data.suggestIndex = -1;
                return true;
            }
            return false;
        },

        selectItem: function(item) {
            const row = document.querySelector(`#min_grid tbody tr[data-index="${this.data.activeRowIndex}"]`);
            if (row) {
                const codeInput = row.querySelector('.min-item-code');
                codeInput.value = item.item_code;
                codeInput.dataset.id = item.id;
                codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                
                const hsCodeInput = row.querySelector('.min-hscode');
                if (hsCodeInput) hsCodeInput.value = item.hs_code || '';
                
                row.querySelector('.min-desc').value = item.item_name;
                row.querySelector('.min-unit').value = item.unit || 'Pcs';
                
                const rate = parseFloat(item.purchase_rate || item.sale_rate) || 0;
                row.querySelector('.min-rate').value = rate > 0 ? rate : '';
                
                row.querySelector('.min-pieces').value = '';
                
                const results = document.getElementById('min_item_results');
                if (results) results.style.display = 'none';
                
                this.calculateRow(row, codeInput);
                this.calculateTotals();
                
                row.querySelector('.min-pieces').focus();
            }
        },

        calculateRow: function(row, triggerInput = null) {
            if (!row) return;
            const codeInput = row.querySelector('.min-item-code');
            const piecesInput = row.querySelector('.min-pieces');
            const qtyInput = row.querySelector('.min-qty');
            const rateInput = row.querySelector('.min-rate');
            const amountInput = row.querySelector('.min-amount');
            
            if (!codeInput || !piecesInput || !qtyInput || !rateInput || !amountInput) return;

            const factor = parseFloat(codeInput.dataset.qtyPerPiece) || 0;
            const pieces = parseFloat(piecesInput.value) || 0;
            let qty = parseFloat(qtyInput.value) || 0;
            
            if (pieces > 0 && factor > 0 && triggerInput && (triggerInput.classList.contains('min-pieces') || triggerInput.classList.contains('min-item-code'))) {
                qty = pieces * factor;
                qtyInput.value = qty.toFixed(4);
            }
            
            const rate = parseFloat(rateInput.value) || 0;
            const amount = qty * rate;
            amountInput.value = amount > 0 ? amount.toFixed(2) : '';
        },

        updateSuggestHighlight: function(items) {
            const results = document.getElementById('min_item_results');
            items.forEach((item, i) => {
                if (i === this.data.suggestIndex) item.classList.add('active');
                else item.classList.remove('active');
            });
            if (this.data.suggestIndex > -1 && items[this.data.suggestIndex] && results) {
                const activeEl = items[this.data.suggestIndex];
                const itemTop = activeEl.offsetTop;
                const itemBottom = itemTop + activeEl.offsetHeight;
                const viewTop = results.scrollTop;
                const viewBottom = viewTop + results.clientHeight;

                if (itemTop < viewTop) {
                    results.scrollTop = itemTop;
                } else if (itemBottom > viewBottom) {
                    results.scrollTop = itemBottom - results.clientHeight;
                }
            }
        },

        handleGridNavigation: function(e) {
            const input = e.target;
            const row = input.closest('tr');
            const rows = Array.from(document.querySelectorAll('#min_grid tbody tr'));
            const colIndex = input.closest('td').cellIndex;
            const rowIndex = rows.indexOf(row);
            const gridBody = document.querySelector('#min_grid tbody');
            const suggest = document.getElementById('min_item_results');

            if (input.classList.contains('min-item-code')) {
                if (this.handleItemKey(e)) return;
            }

            const getVisibleRowInputs = (r) => Array.from(r.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
            const getAllVisibleInputs = () => Array.from(gridBody.querySelectorAll('input:not([readonly]):not([type="hidden"])')).filter(i => i.offsetWidth > 0);
            const rowInputs = getVisibleRowInputs(row);
            const colIdx = rowInputs.indexOf(input);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.data.suggestIndex = -1; }
                const nextTr = row.nextElementSibling;
                if (nextTr) {
                    const nextRowInputs = getVisibleRowInputs(nextTr);
                    if (nextRowInputs[colIdx]) {
                        nextRowInputs[colIdx].focus();
                        nextRowInputs[colIdx].select();
                    }
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.data.suggestIndex = -1; }
                const prevTr = row.previousElementSibling;
                if (prevTr) {
                    const prevRowInputs = getVisibleRowInputs(prevTr);
                    if (prevRowInputs[colIdx]) {
                        prevRowInputs[colIdx].focus();
                        prevRowInputs[colIdx].select();
                    }
                }
            } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
                const isFullySelected = (input.selectionStart === 0 && input.selectionEnd === input.value.length) || input.value.length === 0;
                if (e.key === 'Enter' || (e.key === 'ArrowRight' && isFullySelected)) {
                    e.preventDefault();
                    if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.data.suggestIndex = -1; }
                    const allInputs = getAllVisibleInputs();
                    const index = allInputs.indexOf(input);
                    if (index > -1 && index < allInputs.length - 1) {
                        allInputs[index + 1].focus();
                        allInputs[index + 1].select();
                    } else if (e.key === 'Enter') {
                        this.addRow(rows.length + 1);
                        setTimeout(() => {
                            const newInputs = getAllVisibleInputs();
                            if (newInputs[index + 1]) {
                                newInputs[index + 1].focus();
                                newInputs[index + 1].select();
                            } else {
                                const newRows = document.querySelectorAll('#min_grid tbody tr');
                                const firstInput = newRows[newRows.length - 1].querySelector('.min-item-code');
                                if (firstInput) { firstInput.focus(); firstInput.select(); }
                            }
                        }, 50);
                    }
                }
            } else if (e.key === 'ArrowLeft') {
                const isFullySelected = (input.selectionStart === 0 && input.selectionEnd === input.value.length) || input.value.length === 0;
                if (isFullySelected) {
                    e.preventDefault();
                    if (suggest && suggest.style.display === 'block') { suggest.style.display = 'none'; this.data.suggestIndex = -1; }
                    const allInputs = getAllVisibleInputs();
                    const index = allInputs.indexOf(input);
                    if (index > 0) {
                        allInputs[index - 1].focus();
                        allInputs[index - 1].select();
                    }
                }
            }
        },

        getNextInput: function(row, colIndex) {
            const inputs = Array.from(row.querySelectorAll('input'));
            const currentIdx = inputs.indexOf(row.cells[colIndex].querySelector('input'));
            return inputs[currentIdx + 1];
        },

        getPrevInput: function(row, colIndex) {
            const inputs = Array.from(row.querySelectorAll('input'));
            const currentIdx = inputs.indexOf(row.cells[colIndex].querySelector('input'));
            return inputs[currentIdx - 1];
        },

        resetForm: async function(full = false) {
            this.data.currentId = null;
            
            document.getElementById('min_date').value = new Date().toISOString().substring(0, 10);
            document.getElementById('min_requisition_no').value = '';
            const mainStore = this.data.locations.find(l => l.name === 'Main Store');
            document.getElementById('min_location_id').value = mainStore ? mainStore.id : '';
            document.getElementById('min_job_id').value = '';
            document.getElementById('min_employee_id').value = '';
            document.getElementById('min_remarks').value = '';
            
            const workInProcess = this.data.accounts.find(a => a.name.toLowerCase().includes('work in process') || a.name.toLowerCase().includes('wip'));
            if (workInProcess) {
                document.getElementById('min_dr_code').value = workInProcess.code;
                document.getElementById('min_dr_code').dataset.id = workInProcess.id;
                document.getElementById('min_dr_name').value = workInProcess.name;
            } else {
                document.getElementById('min_dr_code').value = '';
                document.getElementById('min_dr_code').dataset.id = '';
                document.getElementById('min_dr_name').value = '';
            }
            
            const purchaseAcc = this.data.accounts.find(a => a.name.toLowerCase().includes('purchase') && !a.name.toLowerCase().includes('return'));
            if (purchaseAcc) {
                document.getElementById('min_cr_code').value = purchaseAcc.code;
                document.getElementById('min_cr_code').dataset.id = purchaseAcc.id;
                document.getElementById('min_cr_name').value = purchaseAcc.name;
            } else {
                document.getElementById('min_cr_code').value = '';
                document.getElementById('min_cr_code').dataset.id = '';
                document.getElementById('min_cr_name').value = '';
            }

            document.getElementById('min_is_cancelled').checked = false;
            if (document.getElementById('min_use_formula')) {
                const useFormula = (this.data.defaultMode === 'formula');
                document.getElementById('min_use_formula').checked = useFormula;
                this.toggleFormulaMode();
            }
            
            this.data.is_posted = 0;
            this.updateCancellationUI();
            this.updatePostedUI();

            const tbody = document.querySelector('#min_grid tbody');
            if (tbody) {
                tbody.innerHTML = '';
                for (let i = 0; i < this.data.gridRows; i++) {
                    this.addRow(i + 1);
                }
            }

            this.calculateTotals();

            if (full) {
                try {
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const companyId = session.company_id || 1;
                    const res = await fetch(`api/material_issue_notes.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    document.getElementById('min_sn').value = data.next_no || data.next_sn || 1;
                } catch (err) {
                    console.error('Fetch Next SN Error:', err);
                    document.getElementById('min_sn').value = 1;
                }
            }
        },

        addRow: function(sn) {
            const tbody = document.querySelector('#min_grid tbody');
            if (!tbody) return;

            const tr = document.createElement('tr');
            tr.dataset.index = sn - 1;
            tr.style.height = '22px';

            tr.innerHTML = `
                <td class="min-row-selector" style="text-align: center; font-size: 10px; border: 1px solid #94a3b8; background: #f8fafc; font-weight: bold; cursor: pointer;">${sn}</td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-item-code" autocomplete="off">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-hscode" readonly tabindex="-1">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-desc">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-pieces num">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-qty num">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-unit">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-rate num">
                </td>
                <td class="min-grid-cell">
                    <input type="text" class="min-grid-input min-amount num" readonly tabindex="-1">
                </td>
            `;
            tbody.appendChild(tr);
        },

        calculateTotals: function() {
            let tPieces = 0, tQty = 0, tAmt = 0;
            document.querySelectorAll('#min_grid tbody tr').forEach(tr => {
                this.calculateRow(tr);
                tPieces += parseFloat(tr.querySelector('.min-pieces').value) || 0;
                tQty += parseFloat(tr.querySelector('.min-qty').value) || 0;
                tAmt += parseFloat(tr.querySelector('.min-amount').value) || 0;
            });
            document.getElementById('min_total_pieces').value = tPieces.toFixed(2);
            document.getElementById('min_total_qty').value = tQty.toFixed(4);
            document.getElementById('min_total_amount').value = tAmt.toFixed(2);

            if (window.numberToWords) {
                document.getElementById('min_amount_words').innerText = "Rupees " + window.numberToWords(tAmt) + " only.";
            } else {
                document.getElementById('min_amount_words').innerText = "Rupees " + tAmt.toFixed(2);
            }
        },

        saveMIN: async function(silent = false) {
            const data = {
                id: this.data.currentId,
                serial_no: document.getElementById('min_sn').value,
                date: document.getElementById('min_date').value,
                requisition_no: document.getElementById('min_requisition_no').value,
                inventory_location_id: document.getElementById('min_location_id').value,
                job_id: document.getElementById('min_job_id').value,
                employee_id: document.getElementById('min_employee_id').value,
                debit_account_id: document.getElementById('min_dr_code').dataset.id,
                credit_account_id: document.getElementById('min_cr_code').dataset.id,
                remarks: document.getElementById('min_remarks').value,
                total_pieces: 0,
                total_qty: 0,
                total_amount: 0,
                is_cancelled: document.getElementById('min_is_cancelled').checked,
                is_posted: true,
                items: []
            };

            document.querySelectorAll('#min_grid tbody tr').forEach(tr => {
                const codeInput = tr.querySelector('.min-item-code');
                const itemId = codeInput ? codeInput.dataset.id : null;
                if (itemId) {
                    const pieces = parseFloat(tr.querySelector('.min-pieces').value) || 0;
                    const qty = parseFloat(tr.querySelector('.min-qty').value) || 0;
                    const rate = parseFloat(tr.querySelector('.min-rate').value) || 0;
                    
                    const finalAmount = qty * rate;

                    data.items.push({
                        item_id: itemId,
                        hs_code: tr.querySelector('.min-hscode') ? tr.querySelector('.min-hscode').value : '',
                        description: tr.querySelector('.min-desc').value || '',
                        pieces: pieces,
                        qty: qty,
                        unit: tr.querySelector('.min-unit') ? tr.querySelector('.min-unit').value : '',
                        rate: rate,
                        amount: finalAmount
                    });
                }
            });

            let tPieces = 0, tQty = 0, tAmt = 0;
            data.items.forEach(item => {
                tPieces += item.pieces;
                tQty += item.qty;
                tAmt += item.amount;
            });
            data.total_pieces = tPieces.toFixed(2);
            data.total_qty = tQty.toFixed(4);
            data.total_amount = tAmt.toFixed(2);

            if (data.items.length === 0) { alert("Please add at least one item row to save."); return false; }

            try {
                const res = await fetch('api/material_issue_notes.php?action=save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    if (!silent) {
                        alert("Material Issue Note saved successfully!");
                        this.resetForm(true);
                    } else {
                        this.data.currentId = result.id;
                        await this.navigateBySN(data.serial_no);
                    }
                    return true;
                } else {
                    alert("Error: " + result.error);
                    return false;
                }
            } catch (err) { console.error(err); alert("Failed to save Note."); return false; }
        },

        navigateBySN: async function(sn, dir = '') {
            try {
                let url = `api/material_issue_notes.php?action=fetch&sn=${sn}`;
                if (dir && (dir === 'next' || dir === 'prev')) {
                    url += `&dir=${dir}`;
                }
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    this.fillForm(data);
                } else {
                    if (dir === 'next' || dir === 'last') {
                        this.showToast ? this.showToast('You are on the last record') : alert('You are on the last record');
                    } else if (dir === 'prev') {
                        this.showToast ? this.showToast('You are on the first record') : alert('You are on the first record');
                    } else {
                        alert('Record not found.');
                        this.resetForm(true);
                    }
                }
            } catch (err) { console.error(err); }
        },

        fillForm: function(data) {
            this.data.currentId = data.id;
            document.getElementById('min_sn').value = data.serial_no;
            document.getElementById('min_date').value = data.date;
            document.getElementById('min_requisition_no').value = data.requisition_no || '';
            document.getElementById('min_location_id').value = data.inventory_location_id || '';
            document.getElementById('min_job_id').value = data.job_id || '';
            document.getElementById('min_employee_id').value = data.employee_id || '';
            
            document.getElementById('min_dr_code').value = data.debit_account_code || '';
            document.getElementById('min_dr_code').dataset.id = data.debit_account_id || '';
            document.getElementById('min_dr_name').value = data.debit_account_name || '';

            document.getElementById('min_cr_code').value = data.credit_account_code || '';
            document.getElementById('min_cr_code').dataset.id = data.credit_account_id || '';
            document.getElementById('min_cr_name').value = data.credit_account_name || '';

            document.getElementById('min_remarks').value = data.remarks || '';
            document.getElementById('min_is_cancelled').checked = (data.is_cancelled == 1);
            this.data.is_posted = data.is_posted == 1 ? 1 : 0;
            this.updateCancellationUI();
            this.updatePostedUI();

            const tbody = document.querySelector('#min_grid tbody');
            tbody.innerHTML = '';

            if (data.items && data.items.length > 0) {
                data.items.forEach((item, i) => {
                    this.addRow(i + 1);
                    const row = tbody.lastElementChild;
                    
                    const codeInput = row.querySelector('.min-item-code');
                    codeInput.value = item.item_code;
                    codeInput.dataset.id = item.item_id;
                    // Restore qty_per_piece so pieces recalculation works after load
                    const invItem = this.data.inventoryItems.find(i => String(i.id) === String(item.item_id));
                    codeInput.dataset.qtyPerPiece = invItem ? (invItem.qty_per_piece || 0) : 0;
                    
                    const hsCodeInput = row.querySelector('.min-hscode');
                    if (hsCodeInput) hsCodeInput.value = item.hs_code || '';

                    row.querySelector('.min-desc').value = item.description || '';
                    row.querySelector('.min-pieces').value = parseFloat(item.pieces) > 0 ? parseFloat(item.pieces) : '';
                    row.querySelector('.min-qty').value = parseFloat(item.qty).toFixed(4);
                    row.querySelector('.min-unit').value = item.unit || 'Pcs';
                    row.querySelector('.min-rate').value = parseFloat(item.rate).toFixed(2);
                    row.querySelector('.min-amount').value = parseFloat(item.amount).toFixed(2);
                });
            }

            const startPadIdx = data.items ? data.items.length : 0;
            for (let i = startPadIdx; i < this.data.gridRows; i++) {
                this.addRow(i + 1);
            }

            this.calculateTotals();
        },

        deleteMIN: async function() {
            if (!this.data.currentId) { alert("No document loaded to delete."); return; }
            if (!confirm("Are you absolutely sure you want to delete this Material Issue Note?")) return;

            try {
                const currentSN = document.getElementById('min_sn').value;
                const res = await fetch(`api/material_issue_notes.php?action=delete&id=${this.data.currentId}`);
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Deleted successfully!");
                    this.resetForm(false);
                    document.getElementById('min_sn').value = currentSN;
                } else {
                    alert("Delete failed: " + result.error);
                }
            } catch (err) { console.error(err); }
        },

        navigate: async function(dir) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            let sn = parseInt(document.getElementById('min_sn').value) || 0;
            if (dir === 'prev' && sn === 0) dir = 'last';

            if (dir === 'last') {
                try {
                    const res = await fetch(`api/material_issue_notes.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    sn = (data.next_no || data.next_sn || 2) - 1;
                    dir = undefined;
                } catch(e) { return; }
            } else if (sn === 0 || dir === 'this') {
                if (dir === 'next') {
                    try {
                        const res = await fetch(`api/material_issue_notes.php?action=get_next_serial_no&company_id=${companyId}`);
                        const data = await res.json();
                        sn = (data.next_no || data.next_sn || 2) - 1;
                        dir = undefined;
                    } catch(e) { return; }
                } else if (dir !== 'next' && dir !== 'prev') {
                    sn = 1;
                    dir = undefined;
                }
            } else {
                if (dir !== 'next' && dir !== 'prev') {
                    dir = undefined;
                }
            }
            if (sn > 0 || dir) this.navigateBySN(sn, dir);
        },

        updateCancellationUI: function() {
            const isCancelled = document.getElementById('min_is_cancelled').checked;
            const stamp = document.getElementById('min_cancelled_stamp');
            
            if (stamp) {
                stamp.style.display = (isCancelled && this.data.currentId) ? 'block' : 'none';
            }
        },

        updatePostedUI: function() {
            const btn = document.getElementById('min_btn_post');
            const stamp = document.getElementById('min_posted_stamp');
            const isCancelled = document.getElementById('min_is_cancelled').checked;
            
            if (this.data.is_posted) {
                if (btn) btn.innerText = "Unpost";
                if (stamp) stamp.style.display = (!isCancelled && this.data.currentId) ? 'block' : 'none';
            } else {
                if (btn) btn.innerText = "Post";
                if (stamp) stamp.style.display = 'none';
            }
        },

        togglePostMIN: async function() {
            if (!this.data.currentId) { alert("Please save the document first."); return; }
            if (document.getElementById('min_is_cancelled').checked) { alert("Cannot post a cancelled document."); return; }
            if (!confirm(`Are you sure you want to ${this.data.is_posted ? 'Unpost' : 'Post'} this note?`)) return;

            try {
                const res = await fetch('api/material_issue_notes.php?action=toggle_post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: this.data.currentId })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    this.data.is_posted = result.is_posted;
                    this.updatePostedUI();
                    alert(`Document successfully ${this.data.is_posted ? 'Posted' : 'Unposted'}.`);
                } else {
                    alert("Error: " + result.error);
                }
            } catch (err) { console.error(err); alert("Request failed."); }
        },

        printMIN: async function() {
            const saved = await this.saveMIN(true); // Save silently before printing
            if (!saved || !this.data.currentId) { return; }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = JSON.parse(localStorage.getItem('softifyx_company') || '{}');
            const compName = session.company_name || company.name || 'SOFTIFYX ERP';
            const compAddr = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
            const compPhone = company.phone || '+92 348 7240256';
            const compEmail = company.email || 'info@seastonepipes.com';
            const logoSrc = document.getElementById('userLogo') ? document.getElementById('userLogo').src : '';
            const printedBy = session.name || session.username || 'Administrator';

            const sn = document.getElementById('min_sn').value;
            const date = document.getElementById('min_date').value;
            const reqNo = document.getElementById('min_requisition_no').value;
            const location = document.getElementById('min_location_id').options[document.getElementById('min_location_id').selectedIndex]?.text || '';
            const job = document.getElementById('min_job_id').options[document.getElementById('min_job_id').selectedIndex]?.text || '';
            const employee = document.getElementById('min_employee_id').options[document.getElementById('min_employee_id').selectedIndex]?.text || '';
            const drCode = document.getElementById('min_dr_code').value;
            const drName = document.getElementById('min_dr_name').value;
            const crCode = document.getElementById('min_cr_code').value;
            const crName = document.getElementById('min_cr_name').value;
            const remarks = document.getElementById('min_remarks').value;
            const amountWords = document.getElementById('min_amount_words').innerText;

            let itemsHtml = '';
            let tPieces = 0, tQty = 0, tAmt = 0;
            
            document.querySelectorAll('#min_grid tbody tr').forEach((tr, i) => {
                const code = tr.querySelector('.min-item-code')?.value || '';
                if (code) {
                    const desc = tr.querySelector('.min-desc')?.value || '';
                    const pcs = parseFloat(tr.querySelector('.min-pieces')?.value) || 0;
                    const qty = parseFloat(tr.querySelector('.min-qty')?.value) || 0;
                    const unit = tr.querySelector('.min-unit')?.value || 'Pcs';
                    const rate = parseFloat(tr.querySelector('.min-rate')?.value) || 0;
                    const amt = parseFloat(tr.querySelector('.min-amount')?.value) || 0;

                    tPieces += pcs; tQty += qty; tAmt += amt;

                    itemsHtml += `
                        <tr>
                            <td style="text-align:center; border: 1px solid #333; padding: 5px;">${i + 1}</td>
                            <td style="border: 1px solid #333; padding: 5px;">${desc}</td>
                            <td style="text-align:center; border: 1px solid #333; padding: 5px;">${pcs > 0 ? pcs : ''}</td>
                            <td style="text-align:center; border: 1px solid #333; padding: 5px;">${qty > 0 ? qty.toFixed(4) + ' ' + unit : ''}</td>
                            <td style="text-align:right; border: 1px solid #333; padding: 5px;">${rate > 0 ? rate.toFixed(2) : ''}</td>
                            <td style="text-align:right; border: 1px solid #333; padding: 5px;">${amt > 0 ? amt.toFixed(2) : ''}</td>
                        </tr>`;
                }
            });

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Material Issue Note - ${sn}</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                    <style>
                        @page { margin: 0; size: auto; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.4; margin: 2mm 5mm; padding: 5px; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        
                        .header-area { display: flex; justify-content: space-between; border-bottom: 2px solid #1F4E79; padding-bottom: 10px; margin-bottom: 15px; }
                        .logo-box { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; }
                        .logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                        
                        .company-info { flex: 1; padding-left: 20px; display: flex; flex-direction: column; justify-content: center; }
                        .company-name { color: #1F4E79; font-size: 22px; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; }
                        .company-contacts { font-size: 9px; line-height: 1.6; }
                        .company-contacts i { color: #1F4E79; width: 12px; text-align: center; margin-right: 3px; }
                        .contact-row { display: flex; align-items: center; gap: 15px; margin-bottom: 4px; }
                        
                        .invoice-badge-area { text-align: right; min-width: 150px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; }
                        .invoice-title { color: #1F4E79; font-size: 14px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; text-align: right; width: 100%; }
                        .invoice-type-badge { background: #FF8C00; color: white; padding: 4px 10px; font-size: 10px; font-weight: bold; border-radius: 4px; display: inline-block; text-transform: uppercase; }

                        .title-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; }

                        .info-boxes { display: flex; gap: 20px; margin-bottom: 20px; }
                        .info-box { flex: 1; border: 1px solid #333; padding: 8px; position: relative; min-height: 100px; }
                        .box-label { font-weight: bold; width: 120px; display: inline-block; }

                        .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                        .grid-table thead th { border: 1px solid #333; background: #f1f5f9; padding: 6px 4px; text-align: center; font-size: 11px; }
                        .grid-table tbody td { padding: 5px; border: 1px solid #333; }
                        .grid-table tfoot td { border: 2px solid #333; padding: 6px 4px; font-weight: bold; }

                        .footer { margin-top: 50px; }
                        .signature-line { border-top: 1px solid #333; width: 180px; margin-top: 40px; text-align: center; font-weight: bold; font-size: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header-area">
                        <div class="logo-box">
                            <img src="${logoSrc}" alt="Logo" onerror="this.style.display='none'">
                        </div>
                        <div class="company-info">
                            <div class="company-name">${compName}</div>
                            <div class="company-contacts">
                                <div class="contact-row">
                                    <span><i class="fas fa-map-marker-alt"></i> ${compAddr}</span>
                                </div>
                                <div class="contact-row">
                                    <span><i class="fas fa-phone-alt"></i> ${compPhone}</span>
                                    <span><i class="fas fa-envelope"></i> ${compEmail}</span>
                                </div>
                            </div>
                        </div>
                        <div class="invoice-badge-area">
                            <div class="invoice-title">MATERIAL ISSUE NOTE</div>
                            <div class="invoice-type-badge">STORE CONSUMPTION</div>
                        </div>
                    </div>

                    <div class="title-row">
                        <div>
                            <div><b>Serial No.</b> &nbsp; <span style="font-size:14px; font-weight:bold; color:blue;">${sn}</span></div>
                            <div style="margin-top:4px;"><b>Date</b> &nbsp; ${date}</div>
                        </div>
                    </div>

                    <div class="info-boxes">
                        <div class="info-box">
                            <span style="position: absolute; top: -8px; left: 10px; background: #fff; padding: 0 4px; font-size: 9px; font-weight: bold; color: #1F4E79;">ISSUE DETAILS</span>
                            <div style="margin-top: 5px;"><span class="box-label">Requisition No:</span> <b>${reqNo}</b></div>
                            <div><span class="box-label">Inventory Location:</span> ${location}</div>
                            <div><span class="box-label">Job No & Desc:</span> ${job}</div>
                            <div style="margin-top:10px;"><span class="box-label">Employee Ref:</span> ${employee}</div>
                        </div>
                        <div class="info-box">
                            <span style="position: absolute; top: -8px; left: 10px; background: #fff; padding: 0 4px; font-size: 9px; font-weight: bold; color: #1F4E79;">ACCOUNT DETAILS</span>
                            <div style="margin-top: 5px;"><span class="box-label">Debit Account:</span> <b>${drCode}</b> ${drName}</div>
                            <div><span class="box-label">Credit Account:</span> <b>${crCode}</b> ${crName}</div>
                        </div>
                    </div>

                    <table class="grid-table">
                        <thead>
                            <tr>
                                <th style="width:30px;">#</th>
                                <th style="text-align:left;">Item Description</th>
                                <th style="width:60px;">Pieces</th>
                                <th style="width:80px;">Quantity</th>
                                <th style="width:70px;">Rate</th>
                                <th style="width:90px;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight: bold; background: #f1f5f9;">
                                <td colspan="2" style="text-align: right; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">TOTALS</td>
                                <td style="text-align: center; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${tPieces.toFixed(2)}</td>
                                <td style="text-align: center; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${tQty.toFixed(4)}</td>
                                <td style="border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px;"></td>
                                <td style="text-align: right; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${tAmt.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    <div style="margin-bottom: 10px;">
                        <b>Amount in Words:</b> <i style="color: #1F4E79;">${amountWords}</i>
                    </div>
                    <div><b>Remarks:</b> ${remarks}</div>

                    <div class="footer">
                        <table width="100%">
                            <tr>
                                <td width="50%">
                                    <div class="signature-line">Prepared By</div>
                                    <div style="font-size: 9px; margin-top: 5px;">Printed By: ${printedBy}</div>
                                </td>
                                <td width="50%" align="right">
                                    <div class="signature-line" style="margin-left:auto;">Authorized Signatory</div>
                                </td>
                            </tr>
                        </table>
                    </div>
                </body>
                </html>
            `;

            let printFrame = document.getElementById('min_print_frame');
            if (!printFrame) {
                printFrame = document.createElement('iframe');
                printFrame.id = 'min_print_frame';
                printFrame.style.display = 'none';
                document.body.appendChild(printFrame);
            }

            const doc = printFrame.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();

            printFrame.contentWindow.focus();
            setTimeout(() => { printFrame.contentWindow.print(); }, 500);
        },

        // --- FIND MODAL LOGIC ---
        openFindModal: async function() {
            const modal = document.getElementById('min_find_modal');
            if (modal) modal.style.display = 'flex';
            
            const searchInput = document.getElementById('min_find_search');
            if (searchInput) searchInput.focus();
            
            await this.renderFindTable();
        },

        closeFindModal: function() {
            const modal = document.getElementById('min_find_modal');
            if (modal) modal.style.display = 'none';
        },

        renderFindTable: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const tbody = document.getElementById('min_find_table_body');
            if (!tbody) return;
            
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:10px;">Loading...</td></tr>';
            
            try {
                const res = await fetch(`api/material_issue_notes.php?action=search_mins&company_id=${companyId}`);
                this.findData = await res.json();
                this.findSortField = 'serial_no';
                this.findSortDesc = false;
                this.filterFindTable();
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
            }
        },

        filterFindTable: function() {
            const q = (document.getElementById('min_find_search')?.value || '').toLowerCase();
            const field = document.getElementById('min_find_field')?.value || 'serial_no';
            
            let filtered = this.findData;
            if (q) {
                filtered = this.findData.filter(min => {
                    const val = (min[field]?.toString() || '').toLowerCase();
                    return val.includes(q);
                });
            }
            this.sortFindGrid(this.findSortField, filtered);
        },

        sortFindGrid: function(field, dataToRender = null) {
            if (field && this.findSortField === field && dataToRender === null) {
                this.findSortDesc = !this.findSortDesc;
            } else if (field) {
                this.findSortField = field;
                if (dataToRender === null) {
                    this.findSortDesc = (field === 'serial_no') ? false : true; 
                }
            }
            
            let data = dataToRender || this.findData.filter(min => {
                const q = (document.getElementById('min_find_search')?.value || '').toLowerCase();
                if(!q) return true;
                const filterField = document.getElementById('min_find_field')?.value || 'serial_no';
                return (min[filterField]?.toString() || '').toLowerCase().includes(q);
            });

            data.sort((a, b) => {
                let valA = a[this.findSortField];
                let valB = b[this.findSortField];
                
                if (this.findSortField === 'serial_no') {
                    valA = parseInt(valA) || 0;
                    valB = parseInt(valB) || 0;
                } else {
                    valA = (valA || '').toString().toLowerCase();
                    valB = (valB || '').toString().toLowerCase();
                }
                
                if (valA < valB) return this.findSortDesc ? 1 : -1;
                if (valA > valB) return this.findSortDesc ? -1 : 1;
                return 0;
            });

            this.renderFindGrid(data);
        },

        renderFindGrid: function(data) {
            const tbody = document.getElementById('min_find_table_body');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:10px;">No notes found.</td></tr>';
                return;
            }

            data.forEach((min, index) => {
                const tr = document.createElement('tr');
                tr.dataset.index = index;
                tr.dataset.selected = 'false';
                
                const isPosted = (min.is_posted == 1);
                const isCancelled = (min.is_cancelled == 1);
                
                tr.innerHTML = `
                    <td class="row-selector" style="padding: 2px; border: 1px solid #cbd5e0; text-align: center;"><span class="row-indicator"></span></td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0; font-weight: bold;">${min.serial_no}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0;">${min.date}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0;">${min.requisition_no || ''}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0; text-align: center; color: ${isPosted ? 'green' : '#888'};">${isPosted ? 'Yes' : 'No'}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0; font-weight: bold; color: ${isCancelled ? 'red' : 'inherit'};">${isCancelled ? 'CANCELLED' : ''}</td>
                `;
                
                tr.onclick = () => this.selectFindRow(tr, min);
                tr.ondblclick = () => {
                    this.closeFindModal();
                    document.getElementById('min_sn').value = min.serial_no;
                    this.navigate('this');
                };
                
                tbody.appendChild(tr);
            });
        },

        selectFindRow: function(tr, min) {
            const tbody = document.getElementById('min_find_table_body');
            if (!tbody) return;
            
            Array.from(tbody.children).forEach(row => {
                row.classList.remove('selected');
                const ind = row.querySelector('.row-indicator');
                if (ind) ind.innerHTML = '';
            });
            
            tr.classList.add('selected');
            const ind = tr.querySelector('.row-indicator');
            if (ind) ind.innerHTML = '►';
            
            if (min && min.created_at) {
                const d = new Date(min.created_at);
                const dStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US');
                document.getElementById('min_find_added_on').value = dStr;
            } else {
                document.getElementById('min_find_added_on').value = '';
            }
        }
    };
})();






