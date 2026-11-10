(function() {
    window.FRMModule = {
        data: {
            currentId: null,
            items: [],
            gridRows: 40,
            inventoryItems: [],
            jobs: [],
            locations: [],
            employees: [],
            activeRowIndex: -1,
            suggestIndex: -1
        },

        init: async function() {
            console.log("Initializing Formulas Module...");
            const container = document.getElementById('formulasContainer');
            if (!container) {
                setTimeout(() => this.init(), 100);
                return;
            }
            await this.loadDependencies();
            this.setupEventListeners();
            await this.resetForm(true);
        },

        loadDependencies: async function() {
            try {
                const res = await fetch(`api/formulas.php?action=get_dependencies`);
                const json = await res.json();
                
                this.data.categories = json.categories || [];
                this.data.inventoryItems = json.items || [];

                this.populateSelects();
            } catch (err) { console.error("FRM Dependency Load Error:", err); }
        },

        populateSelects: function() {
            const catSelect = document.getElementById('frm_category_id');
            if (catSelect) {
                catSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }
        },

        setupEventListeners: function() {
            const container = document.getElementById('formulasContainer');
            if (!container) return;

            // Grid event delegation
            const gridBody = document.querySelector('#frm_grid tbody');
            if (gridBody) {
                gridBody.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    if (e.target.classList.contains('ria-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                    this.calculateRow(row, e.target);
                    this.calculateTotals();
                });

                gridBody.addEventListener('focusin', (e) => {
                    if (e.target.tagName === 'INPUT' && !e.target.readOnly) {
                        e.target.select();
                    }
                    if (e.target.classList.contains('ria-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                });

                gridBody.addEventListener('focusout', (e) => {
                    if (e.target.classList.contains('ria-item-code')) {
                        setTimeout(() => {
                            const results = document.getElementById('frm_item_results');
                            if (results) results.style.display = 'none';
                        }, 200);
                    }
                });

                gridBody.addEventListener('keydown', (e) => {
                    if (e.target.classList.contains('ria-grid-input')) {
                        this.handleGridNavigation(e);
                    }
                });
            }

            container.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.saveRIA();
                } else if (e.key === 'Delete') {
                    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                        const selectedRow = document.querySelector('#frm_grid tbody tr.ria-row-selected');
                        if (selectedRow) {
                            e.preventDefault();
                            this.clearRowData(selectedRow);
                        }
                    }
                }
            });

            const cancelCheck = document.getElementById('frm_is_cancelled');
            if (cancelCheck) {
                cancelCheck.addEventListener('change', () => this.updateCancellationUI());
            }

            // Close suggestions and deselect row on outside click
            document.addEventListener('click', (e) => {
                const results = document.getElementById('frm_item_results');
                if (results && !results.contains(e.target) && !e.target.classList.contains('ria-item-code')) {
                    results.style.display = 'none';
                }

                if (!e.target.closest('.ria-row-selector')) {
                    const allRows = document.querySelectorAll('#frm_grid tbody tr');
                    allRows.forEach((r, idx) => {
                        r.classList.remove('ria-row-selected');
                        if (r.firstElementChild) r.firstElementChild.innerHTML = idx + 1;
                    });
                }
            });
        },

        handleItemSearch: function(input) {
            const row = input.closest('tr');
            this.data.activeRowIndex = row.dataset.index;

            const val = input.value;
            let results = document.getElementById('frm_item_results');
            if (!results) {
                results = document.createElement('div');
                results.id = 'frm_item_results';
                results.className = 'ria-suggest-box';
                document.getElementById('frm_grid').parentElement.appendChild(results);
            }

            const query = val.trim().toLowerCase();
            let matches = this.data.inventoryItems;
            if (query) {
                matches = matches.filter(item => 
                    (item.item_code && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(item.item_code.toLowerCase(), query) : item.item_code.toLowerCase().includes(query))) || 
                    (item.item_name && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(item.item_name.toLowerCase(), query) : item.item_name.toLowerCase().includes(query)))
                );
            }
            const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
            matches = matches.slice(0, maxLimit);

            if (matches.length === 0) {
                results.style.display = 'none';
                return;
            }

            this.data.suggestIndex = -1;
            results.innerHTML = matches.map((item, idx) => `
                <div class="ria-suggest-item" data-index="${idx}" onmousedown="window.FRMModule.selectItem(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="padding: 5px 8px; cursor: pointer; font-size: 11.5px; border-bottom: 1px solid #f1f5f9;">
                    <strong class="code" style="color: #1F4E79; font-weight: 800;">${item.item_code}</strong> - ${item.item_name} (${item.unit})
                </div>
            `).join('');

            results.style.display = 'block';
            if (typeof window.positionGridDropdown === 'function') {
                window.positionGridDropdown(results, input);
            } else {
                results.style.position = 'absolute';
                results.style.width = '600px';
                results.style.zIndex = '9999';
                input.closest('td').appendChild(results);
            }
            
            // Scroll row into view if it's too close to the bottom
            if (spaceBelow < 150) {
                const container = input.closest('div[style*="overflow: auto"]');
                if (container) {
                    container.scrollBy({ top: 45, behavior: 'smooth' }); // Scroll up by approx 2 rows
                } else {
                    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        },

        handleItemKey: function(e) {
            const results = document.getElementById('frm_item_results');
            if (!results || results.style.display === 'none') return false;

            const items = results.querySelectorAll('.ria-suggest-item');
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
                if (this.data.suggestIndex > -1) {
                    e.preventDefault();
                    items[this.data.suggestIndex].dispatchEvent(new Event('mousedown'));
                    return true;
                }
            }
            return false;
        },

        selectItem: function(item) {
            const row = document.querySelector(`#frm_grid tbody tr[data-index="${this.data.activeRowIndex}"]`);
            if (row) {
                const codeInput = row.querySelector('.ria-item-code');
                codeInput.value = item.item_code;
                codeInput.dataset.id = item.id;
                codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                
                row.querySelector('.ria-desc').value = item.item_name;
                row.querySelector('.ria-unit').value = item.unit || 'Pcs';
                
                const rate = parseFloat(item.purchase_rate || item.sale_rate) || 0;
                row.querySelector('.ria-rate').value = rate > 0 ? rate.toFixed(2) : '';
                row.querySelector('.ria-pieces').value = '';
                row.querySelector('.ria-qty').value = '';
                
                const results = document.getElementById('frm_item_results');
                if (results) results.style.display = 'none';
                
                this.calculateRow(row, codeInput);
                this.calculateTotals();
                
                row.querySelector('.ria-pieces').focus();
            }
        },

        calculateRow: function(row, triggerInput = null) {
            if (!row) return;
            const codeInput = row.querySelector('.ria-item-code');
            const piecesInput = row.querySelector('.ria-pieces');
            const qtyInput = row.querySelector('.ria-qty');
            const rateInput = row.querySelector('.ria-rate');
            const amountInput = row.querySelector('.ria-amount');
            
            if (!codeInput || !piecesInput || !qtyInput || !rateInput || !amountInput) return;

            const factor = parseFloat(codeInput.dataset.qtyPerPiece) || 0;
            const pieces = parseFloat(piecesInput.value) || 0;
            let qty = parseFloat(qtyInput.value) || 0;
            
            // Auto-calculate qty ONLY when user actively changes pieces or selects item code, NEVER overwrite if user manually typed in qty or during totals calculation
            if (pieces > 0 && factor > 0 && triggerInput && (triggerInput.classList.contains('ria-pieces') || triggerInput.classList.contains('ria-item-code'))) {
                qty = pieces * factor;
                qtyInput.value = qty.toFixed(4);
            }
            
            const rate = parseFloat(rateInput.value) || 0;
            const amount = qty * rate;
            amountInput.value = amount > 0 ? amount.toFixed(2) : '';
        },

        clearRowData: function(row) {
            if (!row) return;
            const codeInput = row.querySelector('.ria-item-code');
            if (codeInput) {
                codeInput.value = '';
                codeInput.removeAttribute('data-id');
                codeInput.removeAttribute('data-qty-per-piece');
            }
            const desc = row.querySelector('.ria-desc');
            if (desc) desc.value = '';
            const pieces = row.querySelector('.ria-pieces');
            if (pieces) pieces.value = '';
            const qty = row.querySelector('.ria-qty');
            if (qty) qty.value = '';
            const unit = row.querySelector('.ria-unit');
            if (unit) unit.value = '';
            const rate = row.querySelector('.ria-rate');
            if (rate) rate.value = '';
            const amount = row.querySelector('.ria-amount');
            if (amount) amount.value = '';
            
            this.calculateTotals();
        },

        updateSuggestHighlight: function(items) {
            items.forEach((item, i) => {
                if (i === this.data.suggestIndex) item.classList.add('active');
                else item.classList.remove('active');
            });
            if (this.data.suggestIndex > -1 && items[this.data.suggestIndex]) {
                items[this.data.suggestIndex].scrollIntoView({ block: 'nearest' });
            }
        },

        handleGridNavigation: function(e) {
            const input = e.target;
            const row = input.closest('tr');
            const rows = Array.from(document.querySelectorAll('#frm_grid tbody tr'));
            const colIndex = input.closest('td').cellIndex;
            const rowIndex = rows.indexOf(row);
            const gridBody = document.querySelector('#frm_grid tbody');
            const suggest = document.getElementById('frm_item_results');

            if (input.classList.contains('ria-item-code')) {
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
                                const newRows = document.querySelectorAll('#frm_grid tbody tr');
                                const firstInput = newRows[newRows.length - 1].querySelector('.ria-item-code');
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
            const currentInput = row.cells[colIndex].querySelector('input');
            const currentIdx = inputs.indexOf(currentInput);
            
            // Find next enabled input
            for (let i = currentIdx + 1; i < inputs.length; i++) {
                if (!inputs[i].readOnly && inputs[i].tabIndex !== -1) {
                    return inputs[i];
                }
            }
            return null;
        },

        getPrevInput: function(row, colIndex) {
            const inputs = Array.from(row.querySelectorAll('input'));
            const currentInput = row.cells[colIndex].querySelector('input');
            const currentIdx = inputs.indexOf(currentInput);
            
            // Find previous enabled input
            for (let i = currentIdx - 1; i >= 0; i--) {
                if (!inputs[i].readOnly && inputs[i].tabIndex !== -1) {
                    return inputs[i];
                }
            }
            return null;
        },

        resetForm: async function(full = false) {
            this.data.currentId = null;
            
            document.getElementById('frm_date').value = new Date().toISOString().substring(0, 10);
            
            document.getElementById('frm_formula_name').value = '';
            document.getElementById('frm_category_id').value = '';
            
            document.getElementById('frm_remarks').value = '';
            
            document.getElementById('frm_is_cancelled').checked = false;
            this.updateCancellationUI();

            this.data.is_posted = false;
            this.updatePostedUI();

            const tbody = document.querySelector('#frm_grid tbody');
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
                    const res = await fetch(`api/formulas.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    document.getElementById('frm_sn').value = data.next_no || data.next_sn || 1;
                } catch (err) {
                    console.error('Fetch Next SN Error:', err);
                    document.getElementById('frm_sn').value = 1;
                }
            }
        },

        addRow: function(sn) {
            const tbody = document.querySelector('#frm_grid tbody');
            if (!tbody) return;

            const tr = document.createElement('tr');
            tr.dataset.index = sn - 1;
            tr.style.height = '22px';

            tr.innerHTML = `
                <td class="ria-row-selector" style="text-align: center; font-size: 10px; border: 1px solid #cbd5e0; background: #f8fafc; font-weight: bold; cursor: pointer;">${sn}</td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-item-code" autocomplete="off">
                </td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-desc">
                </td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-pieces num">
                </td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-qty num">
                </td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-unit" readonly tabindex="-1">
                </td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-rate num">
                </td>
                <td class="ria-grid-cell">
                    <input type="text" class="ria-grid-input ria-amount num" readonly tabindex="-1">
                </td>
            `;

            // Row click-to-select (same as IT module)
            tr.querySelector('.ria-row-selector').addEventListener('click', () => {
                const allRows = document.querySelectorAll('#frm_grid tbody tr');
                const isSelected = tr.classList.contains('ria-row-selected');
                allRows.forEach((r, idx) => {
                    r.classList.remove('ria-row-selected');
                    if (r.firstElementChild) r.firstElementChild.innerHTML = idx + 1;
                });
                if (!isSelected) {
                    tr.classList.add('ria-row-selected');
                    tr.firstElementChild.innerHTML = '&#10005;';
                    const container = document.getElementById('formulasContainer');
                    if (container) {
                        if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
                        container.focus({ preventScroll: true });
                    }
                }
            });

            tbody.appendChild(tr);
        },

        calculateTotals: function() {
            let tPieces = 0, tQty = 0, tAmt = 0;
            document.querySelectorAll('#frm_grid tbody tr').forEach(tr => {
                this.calculateRow(tr, null);
                tPieces += parseFloat(tr.querySelector('.ria-pieces').value) || 0;
                tQty += parseFloat(tr.querySelector('.ria-qty').value) || 0;
                tAmt += parseFloat(tr.querySelector('.ria-amount').value) || 0;
            });
            document.getElementById('frm_total_pieces').value = tPieces.toFixed(2);
            document.getElementById('frm_total_qty').value = tQty.toFixed(4);
            document.getElementById('frm_total_amount').value = tAmt.toFixed(2);

            if (window.numberToWords) {
                document.getElementById('frm_amount_words').innerText = "Rupees " + window.numberToWords(tAmt) + " only.";
            } else {
                document.getElementById('frm_amount_words').innerText = "Rupees " + tAmt.toFixed(2);
            }
        },

        saveRIA: async function(silent = false) {
            const data = {
                id: this.data.currentId,
                serial_no: document.getElementById('frm_sn').value,
                date: document.getElementById('frm_date').value,
                formula_name: document.getElementById('frm_formula_name').value,
                category_id: document.getElementById('frm_category_id').value,
                
                remarks: document.getElementById('frm_remarks').value,
                total_pieces: parseFloat(document.getElementById('frm_total_pieces').value) || 0,
                total_qty: parseFloat(document.getElementById('frm_total_qty').value) || 0,
                total_amount: parseFloat(document.getElementById('frm_total_amount').value) || 0,
                is_cancelled: document.getElementById('frm_is_cancelled').checked,
                is_posted: true,
                items: []
            };

            document.querySelectorAll('#frm_grid tbody tr').forEach(tr => {
                const codeInput = tr.querySelector('.ria-item-code');
                const itemId = codeInput ? codeInput.dataset.id : null;
                if (itemId) {
                    data.items.push({
                        item_id: itemId,
                        description: tr.querySelector('.ria-desc').value || '',
                        pieces: parseFloat(tr.querySelector('.ria-pieces').value) || 0,
                        qty: parseFloat(tr.querySelector('.ria-qty').value) || 0,
                        rate: parseFloat(tr.querySelector('.ria-rate').value) || 0,
                        amount: parseFloat(tr.querySelector('.ria-amount').value) || 0
                    });
                }
            });

            if (data.items.length === 0) { alert("Please add at least one item row to save."); return false; }

            try {
                const res = await fetch('api/formulas.php?action=save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    this.data.currentId = result.id;
                    await this.navigateBySN(data.serial_no);
                    if (!silent) {
                        alert("Formula saved successfully!");
                    }
                    return true;
                } else {
                    alert("Error: " + result.error);
                    return false;
                }
            } catch (err) { console.error(err); alert("Failed to save Formula."); return false; }
        },

        updatePostedUI: function() {
            const btn = document.getElementById('frm_btn_post');
            const stamp = document.getElementById('frm_posted_stamp');
            if (this.data.is_posted) {
                if (btn) {
                    btn.innerText = 'Unpost';
                    btn.classList.remove('ria-btn-info');
                    btn.classList.add('ria-btn-cancel');
                }
                if (stamp) stamp.style.display = 'block';
            } else {
                if (btn) {
                    btn.innerText = 'Post';
                    btn.classList.remove('ria-btn-cancel');
                    btn.classList.add('ria-btn-info');
                }
                if (stamp) stamp.style.display = 'none';
            }
        },

        postRIA: async function() {
            if (!this.data.currentId) { alert("Please save the document first."); return; }
            if (document.getElementById('frm_is_cancelled').checked) { alert("Cannot post a cancelled document."); return; }
            if (!confirm(`Are you sure you want to ${this.data.is_posted ? 'Unpost' : 'Post'} this note?`)) return;

            try {
                const res = await fetch('api/formulas.php?action=toggle_post', {
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

        navigateBySN: async function(sn, dir = '') {
            try {
                let url = `api/formulas.php?action=fetch&sn=${sn}`;
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
            document.getElementById('frm_sn').value = data.serial_no;
            document.getElementById('frm_date').value = data.date;
            document.getElementById('frm_formula_name').value = data.formula_name || '';
            document.getElementById('frm_category_id').value = data.category_id || '';
            
            document.getElementById('frm_remarks').value = data.remarks || '';
            document.getElementById('frm_is_cancelled').checked = (data.is_cancelled == 1);
            this.updateCancellationUI();

            this.data.is_posted = (data.is_posted == 1);
            this.updatePostedUI();

            const tbody = document.querySelector('#frm_grid tbody');
            tbody.innerHTML = '';

            if (data.items && data.items.length > 0) {
                data.items.forEach((item, i) => {
                    this.addRow(i + 1);
                    const row = tbody.lastElementChild;
                    
                    const codeInput = row.querySelector('.ria-item-code');
                    codeInput.value = item.item_code;
                    codeInput.dataset.id = item.item_id;
                    
                    const invItem = this.data.inventoryItems.find(x => String(x.id) === String(item.item_id));
                    codeInput.dataset.qtyPerPiece = invItem ? (invItem.qty_per_piece || 0) : (item.qty_per_piece || 0);

                    row.querySelector('.ria-desc').value = item.description || '';
                    row.querySelector('.ria-pieces').value = parseFloat(item.pieces) > 0 ? parseFloat(item.pieces) : '';
                    const parsedQty = parseFloat(item.qty);
                    row.querySelector('.ria-qty').value = !isNaN(parsedQty) ? parsedQty.toFixed(4) : (item.qty || '');
                    row.querySelector('.ria-unit').value = item.unit || 'Pcs';
                    row.querySelector('.ria-rate').value = parseFloat(item.rate).toFixed(2);
                    row.querySelector('.ria-amount').value = parseFloat(item.amount).toFixed(2);
                });
            }

            const startPadIdx = data.items ? data.items.length : 0;
            for (let i = startPadIdx; i < this.data.gridRows; i++) {
                this.addRow(i + 1);
            }

            this.calculateTotals();
        },

        deleteRIA: async function() {
            if (!this.data.currentId) { alert("No document loaded to delete."); return; }
            if (!confirm("Are you absolutely sure you want to delete this Formula?")) return;

            try {
                const currentSN = document.getElementById('frm_sn').value;
                const res = await fetch(`api/formulas.php?action=delete&id=${this.data.currentId}`);
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Deleted successfully!");
                    this.resetForm(false);
                    document.getElementById('frm_sn').value = currentSN;
                } else {
                    alert("Delete failed: " + result.error);
                }
            } catch (err) { console.error(err); }
        },

        navigate: async function(dir) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            let sn = parseInt(document.getElementById('frm_sn').value) || 0;
            
            if (dir === 'prev' && sn === 0) dir = 'last';

            if (dir === 'last') {
                try {
                    const res = await fetch(`api/formulas.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    sn = (data.next_no || data.next_sn || 2) - 1;
                    dir = undefined;
                } catch(e) { return; }
            } else if (sn === 0 || dir === 'this') {
                if (dir === 'next') {
                    try {
                        const res = await fetch(`api/formulas.php?action=get_next_serial_no&company_id=${companyId}`);
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
            const isCancelled = document.getElementById('frm_is_cancelled').checked;
            const stamp = document.getElementById('frm_cancelled_stamp');
            if (stamp) {
                stamp.style.display = isCancelled ? 'block' : 'none';
            }
        },

        findRIA: function() {
            this.openFindModal();
        },

        openFindModal: async function() {
            const modal = document.getElementById('frm_find_modal');
            if (modal) modal.style.display = 'flex';
            
            const searchInput = document.getElementById('frm_find_search');
            if (searchInput) searchInput.focus();
            
            await this.renderFindTable();
        },

        closeFindModal: function() {
            const modal = document.getElementById('frm_find_modal');
            if (modal) modal.style.display = 'none';
        },

        renderFindTable: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const tbody = document.getElementById('frm_find_table_body');
            if (!tbody) return;
            
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">Loading...</td></tr>';
            
            try {
                const res = await fetch(`api/formulas.php?action=search_adjustments&company_id=${companyId}`);
                this.findData = await res.json();
                this.findSortField = 'serial_no';
                this.findSortDesc = false;
                this.filterFindTable();
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
            }
        },

        filterFindTable: function() {
            const q = (document.getElementById('frm_find_search')?.value || '').toLowerCase();
            const field = document.getElementById('frm_find_field')?.value || 'serial_no';
            
            let filtered = this.findData;
            if (q) {
                filtered = this.findData.filter(it => {
                    const val = (it[field]?.toString() || '').toLowerCase();
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
            
            let data = dataToRender || this.findData.filter(it => {
                const q = (document.getElementById('frm_find_search')?.value || '').toLowerCase();
                if(!q) return true;
                const filterField = document.getElementById('frm_find_field')?.value || 'serial_no';
                return (it[filterField]?.toString() || '').toLowerCase().includes(q);
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
            const tbody = document.getElementById('frm_find_table_body');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">No adjustments found.</td></tr>';
                return;
            }

            data.forEach((it, index) => {
                const tr = document.createElement('tr');
                tr.dataset.index = index;
                tr.dataset.selected = 'false';
                
                const isPosted = (it.is_posted == 1);
                const isCancelled = (it.is_cancelled == 1);
                
                tr.innerHTML = `
                    <td class="row-selector" style="padding: 2px; border: 1px solid #cbd5e0; text-align: center;"><span class="row-indicator"></span></td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0; font-weight: bold;">${it.serial_no}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0;">${it.date}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0; text-align: center; color: ${isPosted ? 'green' : '#888'};">${isPosted ? 'Yes' : 'No'}</td>
                    <td style="padding: 2px 4px; border: 1px solid #cbd5e0; font-weight: bold; color: ${isCancelled ? 'red' : 'inherit'};">${isCancelled ? 'CANCELLED' : ''}</td>
                `;
                
                tr.onclick = () => this.selectFindRow(tr, it);
                tr.ondblclick = () => {
                    this.closeFindModal();
                    document.getElementById('frm_sn').value = it.serial_no;
                    this.navigate('this');
                };
                
                tbody.appendChild(tr);
            });
        },

        selectFindRow: function(tr, it) {
            const tbody = document.getElementById('frm_find_table_body');
            if (!tbody) return;
            
            Array.from(tbody.children).forEach(row => {
                row.classList.remove('selected');
                const ind = row.querySelector('.row-indicator');
                if (ind) ind.innerHTML = '';
            });
            
            tr.classList.add('selected');
            const ind = tr.querySelector('.row-indicator');
            if (ind) ind.innerHTML = '►';
            
            if (it && it.created_at) {
                const d = new Date(it.created_at);
                const dStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US');
                document.getElementById('frm_find_added_on').value = dStr;
            } else {
                document.getElementById('frm_find_added_on').value = '';
            }
        },

        printRIA: async function() {
            if (document.querySelectorAll('#frm_grid tbody tr').length > 0 && document.querySelector('.ria-item-code').value) {
                const saved = await this.saveRIA(true);
                if (!saved) return;
            } else if (!this.data.currentId) {
                alert("Please add data and save before printing.");
                return;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const company = JSON.parse(localStorage.getItem('softifyx_company') || '{}');
            const compName = session.company_name || company.name || 'SOFTIFYX ERP';
            const compAddr = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
            const compPhone = company.phone || '+92 348 7240256';
            const compEmail = company.email || 'info@seastonepipes.com';
            const logoSrc = document.getElementById('userLogo') ? document.getElementById('userLogo').src : '';
            const printedBy = session.name || session.username || 'Administrator';

            const sn = document.getElementById('frm_sn').value;
            const date = document.getElementById('frm_date').value;
            const location = document.getElementById('frm_formula_name').value;
            const job = document.getElementById('frm_category_id').options[document.getElementById('frm_category_id').selectedIndex]?.text || '';
            const remarks = document.getElementById('frm_remarks').value;
            const amountWords = document.getElementById('frm_amount_words').innerText;

            let itemsHtml = '';
            let tPieces = 0, tQty = 0, tAmt = 0;
            
            document.querySelectorAll('#frm_grid tbody tr').forEach((tr, i) => {
                const code = tr.querySelector('.ria-item-code')?.value || '';
                if (code) {
                    const desc = tr.querySelector('.ria-desc')?.value || '';
                    const pcs = parseFloat(tr.querySelector('.ria-pieces')?.value) || 0;
                    const qty = parseFloat(tr.querySelector('.ria-qty')?.value) || 0;
                    const unit = tr.querySelector('.ria-unit')?.value || 'Pcs';
                    const rate = parseFloat(tr.querySelector('.ria-rate')?.value) || 0;
                    const amt = parseFloat(tr.querySelector('.ria-amount')?.value) || 0;

                    tPieces += pcs; tQty += qty; tAmt += amt;

                    itemsHtml += `
                        <tr>
                            <td style="text-align:center; border: 1px solid #333; padding: 4px;">${i + 1}</td>
                            <td style="border: 1px solid #333; padding: 4px;">${desc}</td>
                            <td style="text-align:center; border: 1px solid #333; padding: 4px;">${pcs > 0 ? pcs : ''}</td>
                            <td style="text-align:center; border: 1px solid #333; padding: 4px;">${qty > 0 ? qty.toFixed(4) + ' ' + unit : ''}</td>
                            <td style="text-align:right; border: 1px solid #333; padding: 4px;">${rate > 0 ? rate.toFixed(2) : ''}</td>
                            <td style="text-align:right; border: 1px solid #333; padding: 4px;">${amt > 0 ? amt.toFixed(2) : ''}</td>
                        </tr>`;
                }
            });

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Formula - ${sn}</title>
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
                            <div class="invoice-title">Formulas</div>
                            <div class="invoice-type-badge">STORE</div>
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
                            <span style="position: absolute; top: -8px; left: 10px; background: #fff; padding: 0 4px; font-size: 9px; font-weight: bold; color: #1F4E79;">FORMULA DETAILS</span>
                            <div style="margin-top: 5px;"><span class="box-label">Formula Name:</span> ${location}</div>
                            <div><span class="box-label">Category:</span> ${job}</div>
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
                                <td style="text-align: center; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${tPieces > 0 ? tPieces.toFixed(2) : ''}</td>
                                <td style="text-align: center; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${tQty > 0 ? tQty.toFixed(4) : ''}</td>
                                <td style="border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px;"></td>
                                <td style="text-align: right; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${tAmt > 0 ? tAmt.toFixed(2) : ''}</td>
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

            let printFrame = document.getElementById('frm_print_frame');
            if (!printFrame) {
                printFrame = document.createElement('iframe');
                printFrame.id = 'frm_print_frame';
                printFrame.style.display = 'none';
                document.body.appendChild(printFrame);
            }

            const doc = printFrame.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();

            printFrame.contentWindow.focus();
            setTimeout(() => { printFrame.contentWindow.print(); }, 500);
        }
    };
})();









