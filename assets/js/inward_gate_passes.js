(function() {
    window.IGPModule = {
        findData: [],
        findSortField: 'serial_no',
        findSortDesc: true,
        findSelectedIndex: -1,
        findKeydownAdded: false,

        data: {
            currentId: null,
            items: [],
            gridRows: 40, // 18 rows standard to match Bank Receipts and fully fill space
            vendorsAndCustomers: [],
            inventoryItems: [],
            jobs: [],
            locations: [],
            activeRowIndex: -1,
            suggestIndex: -1
        },

        init: async function() {
            console.log("Initializing Inward Gate Pass Module...");
            const container = document.getElementById('inwardGatePassContainer');
            if (!container) {
                console.warn("Inward Gate Pass container not found, retrying in 100ms...");
                await new Promise(resolve => setTimeout(resolve, 100));
                return this.init();
            }
            await this.loadDependencies();
            this.setupEventListeners();
            await this.resetForm(true);
        },

        loadInventory: async function() {
            if (window.allInventoryItems && window.allInventoryItems.length > 0) {
                this.data.inventoryItems = window.allInventoryItems;
                return this.data.inventoryItems;
            }
            if (typeof window.loadSharedERPInventory === 'function') {
                const items = await window.loadSharedERPInventory();
                if (items && items.length > 0) {
                    this.data.inventoryItems = items;
                    return items;
                }
            }
            if (window.SaleOrderModule && Array.isArray(window.SaleOrderModule.inventory) && window.SaleOrderModule.inventory.length > 0) {
                this.data.inventoryItems = window.SaleOrderModule.inventory;
                return this.data.inventoryItems;
            }
            if (window.POModule && Array.isArray(window.POModule.inventory) && window.POModule.inventory.length > 0) {
                this.data.inventoryItems = window.POModule.inventory;
                return this.data.inventoryItems;
            }
            if (window.PIModule && Array.isArray(window.PIModule.inventory) && window.PIModule.inventory.length > 0) {
                this.data.inventoryItems = window.PIModule.inventory;
                return this.data.inventoryItems;
            }
            const coId = this.getCompanyId();
            try {
                const res = await fetch(`api/sale_order.php?action=get_all_items&company_id=${coId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        this.data.inventoryItems = data.map(i => ({
                            id: i.id || i.coa_list_id,
                            code: String(i.item_code || i.code || '').trim(),
                            item_code: String(i.item_code || i.code || '').trim(),
                            name: String(i.item_name || i.name || i.description || '').trim(),
                            item_name: String(i.item_name || i.name || i.description || '').trim(),
                            description: String(i.description || i.item_name || '').trim(),
                            hs_code: i.hs_code || '0000.0000',
                            unit: i.unit || 'Pcs',
                            sales_price: parseFloat(i.sales_price || i.selling_price || i.rate || 0),
                            purchase_price: parseFloat(i.purchase_price || i.cost_price || i.rate || 0),
                            qty_per_piece: parseFloat(i.qty_per_piece || 0)
                        }));
                        return this.data.inventoryItems;
                    }
                }
            } catch (err) {}
            return [];
        },

        loadDependencies: async function() {
            try {
                const coId = this.getCompanyId();
                const [partyRes, jobRes, locRes] = await Promise.all([
                    fetch(`api/sale_order.php?action=get_customers_and_vendors&company_id=${coId}`),
                    fetch(`api/jobs.php?action=get_jobs&company_id=${coId}`),
                    fetch(`api/inventory.php?action=get_locations&company_id=${coId}`)
                ]);

                this.data.vendorsAndCustomers = (await partyRes.json()).filter(p => p.type === 'vendor');
                this.data.jobs = await jobRes.json();
                this.data.locations = await locRes.json();

                await this.loadInventory();
                this.populateSelects();
            } catch (err) { console.error("IGP Dependency Load Error:", err); }
        },

        populateSelects: function() {
            const jobSelect = document.getElementById('igp_job_id');
            const locSelect = document.getElementById('igp_location_id');

            if (jobSelect) {
                jobSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.jobs.map(j => `<option value="${j.id}">${j.job_no} - ${j.description || ''}</option>`).join('');
            }
            if (locSelect) {
                locSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
            }
        },

        setupEventListeners: function() {
            const container = document.getElementById('inwardGatePassContainer');
            if (!container) return;

            // Vendor search
            const vendorInput = document.getElementById('igp_vendor_code');
            if (vendorInput) {
                vendorInput.addEventListener('input', (e) => this.handleVendorSearch(e.target.value));
                vendorInput.addEventListener('keydown', (e) => this.handleVendorKey(e));
                vendorInput.addEventListener('blur', () => setTimeout(() => {
                    const el = document.getElementById('igp_vendor_results');
                    if (el) el.style.display = 'none';
                }, 300));
            }

            // Row selection logic via clicking document
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('igp-row-selector')) {
                    const tr = e.target.closest('tr');
                    document.querySelectorAll('#igp_grid tbody tr').forEach((r, idx) => {
                        r.classList.remove('igp-row-selected');
                        r.firstElementChild.innerHTML = idx + 1;
                    });
                    tr.classList.add('igp-row-selected');
                    e.target.innerHTML = '▶';
                } else if (!e.target.closest('tr.igp-row-selected')) {
                    document.querySelectorAll('#igp_grid tbody tr').forEach((r, idx) => {
                        r.classList.remove('igp-row-selected');
                        r.firstElementChild.innerHTML = idx + 1;
                    });
                }
            });

            // Keyboard delete logic for selected row
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    const selectedRow = document.querySelector('#igp_grid tbody tr.igp-row-selected');
                    if (selectedRow) {
                        selectedRow.querySelectorAll('input').forEach(inp => inp.value = '');
                        const codeInput = selectedRow.querySelector('.igp-item-code');
                        if (codeInput) {
                            codeInput.dataset.id = '';
                            codeInput.dataset.qtyPerPiece = '';
                        }
                        // IGPModule.calculateTotals();
                        if (window.IGPModule && window.IGPModule.calculateTotals) window.IGPModule.calculateTotals();
                        e.preventDefault();
                    }
                }
            });

            // Grid event delegation
            const gridBody = document.querySelector('#igp_grid tbody');
            if (gridBody) {
                gridBody.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    if (e.target.classList.contains('igp-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                    this.calculateRowQuantity(row);
                    this.calculateTotals();
                });

                gridBody.addEventListener('focusin', (e) => {
                    if (e.target.tagName === 'INPUT' && !e.target.readOnly) {
                        e.target.select();
                    }
                    if (e.target.classList.contains('igp-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                });

                gridBody.addEventListener('focusout', (e) => {
                    if (e.target.classList.contains('igp-item-code')) {
                        const tr = e.target.closest('tr');
                        const codeVal = e.target.value.trim().toLowerCase();
                        setTimeout(() => {
                            const results = document.getElementById('igp_item_results');
                            if (results) results.style.display = 'none';

                            if (codeVal && !e.target.dataset.id && this.data.inventoryItems && this.data.inventoryItems.length > 0) {
                                const exact = this.data.inventoryItems.find(i => String(i.item_code || i.code || '').toLowerCase() === codeVal)
                                    || (tr._currentMatches && tr._currentMatches.length === 1 ? tr._currentMatches[0] : null);
                                if (exact) {
                                    this.data.activeRowIndex = parseInt(tr.dataset.index);
                                    this.selectItem(exact);
                                }
                            }
                        }, 250);
                    }
                });

                gridBody.addEventListener('click', (e) => {
                    if (e.target.classList.contains('igp-item-code')) {
                        this.handleItemSearch(e.target);
                    }
                });

                gridBody.addEventListener('keydown', (e) => {
                    if (e.target.classList.contains('igp-grid-input')) {
                        this.handleGridNavigation(e);
                    }
                });
            }

            // Global Ctrl+S shortcut within container
            container.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.saveIGP();
                }
            });

            // Cancellation Stamp Toggle
            const cancelCheck = document.getElementById('igp_is_cancelled');
            if (cancelCheck) {
                cancelCheck.addEventListener('change', () => this.updateCancellationUI());
            }

            // Bind Purchase Order input blur for fetching
            const poInput = document.getElementById('igp_po_no');
            if (poInput) {
                poInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.fetchPurchaseOrderData(e.target.value);
                    }
                });
            }
        },

        handleVendorSearch: function(val) {
            const results = document.getElementById('igp_vendor_results');
            if (!results) return;
            if (!val) { results.style.display = 'none'; return; }

            // Search in both Vendors and Customers!
            const filtered = this.data.vendorsAndCustomers.filter(p => 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(p.code.toLowerCase(), val.toLowerCase()) : p.code.toLowerCase().includes(val.toLowerCase())) || 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(p.name.toLowerCase(), val.toLowerCase()) : p.name.toLowerCase().includes(val.toLowerCase()))
            ).slice(0, 10);

            if (filtered.length > 0) {
                this.data.suggestIndex = -1;
                results.innerHTML = filtered.map((p, i) => 
                    `<div class="so-suggest-item" data-index="${i}" onmousedown="window.IGPModule.selectVendor(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                        <strong class="code">${p.code}</strong> &nbsp; ${p.name}
                    </div>`).join('');
                results.style.display = 'block';
            } else {
                results.style.display = 'none';
            }
        },

        handleVendorKey: function(e) {
            const items = document.querySelectorAll('#igp_vendor_results .so-suggest-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.data.suggestIndex = Math.min(this.data.suggestIndex + 1, items.length - 1);
                this.updateSuggestHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.data.suggestIndex = Math.max(this.data.suggestIndex - 1, 0);
                this.updateSuggestHighlight(items);
            } else if (e.key === 'Enter' && this.data.suggestIndex > -1) {
                e.preventDefault();
                const code = items[this.data.suggestIndex].querySelector('strong').innerText;
                const p = this.data.vendorsAndCustomers.find(x => x.code === code);
                if (p) this.selectVendor(p);
            }
        },

        handleItemKey: function(e) {
            const results = document.getElementById('igp_item_results');
            if (!results || results.style.display === 'none') return false;

            const items = results.querySelectorAll('.suggest-item, .so-suggest-item');
            if (items.length === 0) return false;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.data.suggestIndex = Math.min(this.data.suggestIndex + 1, items.length - 1);
                this.updateSuggestHighlight(items);
                return true;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.data.suggestIndex = Math.max(this.data.suggestIndex - 1, 0);
                this.updateSuggestHighlight(items);
                return true;
            } else if (e.key === 'Enter') {
                if (this.data.suggestIndex > -1 && this.currentMatches && this.currentMatches[this.data.suggestIndex]) {
                    e.preventDefault();
                    this.selectItem(this.currentMatches[this.data.suggestIndex]);
                    return true;
                }
            }
            return false;
        },

        selectVendor: function(p) {
            document.getElementById('igp_vendor_code').value = p.code;
            document.getElementById('igp_vendor_name').value = p.name;
            document.getElementById('igp_vendor_address').value = p.address || '';
            document.getElementById('igp_vendor_phone').value = p.telephone || '';
            document.getElementById('igp_vendor_code').dataset.id = p.id;
            
            const results = document.getElementById('igp_vendor_results');
            if (results) results.style.display = 'none';

            // Focus Purchase Order No next
            const poNoInput = document.getElementById('igp_po_no');
            if (poNoInput) poNoInput.focus();
        },

        handleItemSearch: async function(input) {
            const val = input.value.trim().toLowerCase();
            const results = document.getElementById('igp_item_results');
            if (!results) return;

            if (!val) {
                results.style.display = 'none';
                return;
            }

            if (!this.data.inventoryItems || this.data.inventoryItems.length === 0) {
                await this.loadInventory();
            }

            const searchWords = val.split(/\s+/);
            const matches = typeof window.smartSearchFilterAndSort === 'function' ? 
                window.smartSearchFilterAndSort(this.data.inventoryItems, val) : 
                (this.data.inventoryItems || []).filter(item => {
                    const code = String(item.item_code || item.code || '');
                    const name = String(item.item_name || item.name || item.description || '');
                    const searchStr = `${code} ${name}`.toLowerCase();
                    return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));
                }).slice(0, 30);

            if (matches.length > 0) {
                const row = input.closest('tr');
                this.data.activeRowIndex = parseInt(row.dataset.index);
                this.data.suggestIndex = -1;
                const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
                this.currentMatches = matches.slice(0, maxLimit);
                row._currentMatches = this.currentMatches;

                results.innerHTML = typeof window.renderGlobalItemSuggestHTML === 'function' ?
                    window.renderGlobalItemSuggestHTML(this.currentMatches, { isPurchase: true }) :
                    this.currentMatches.map((item, idx) => `
                    <div class="suggest-item so-suggest-item" data-index="${idx}" style="padding:5px 8px; cursor:pointer; font-size:11px; border-bottom:1px solid #f1f5f9;">
                        <b>${item.item_code || item.code}</b> &nbsp; ${item.item_name || item.name || ''}
                    </div>`).join('');

                results.style.display = 'block';

                if (typeof window.positionGridDropdown === 'function') {
                    window.positionGridDropdown(results, input);
                } else {
                    results.style.position = 'fixed';
                    results.style.zIndex = '999999999';
                    results.style.display = 'block';
                }

                const items = results.querySelectorAll('.suggest-item, .so-suggest-item');
                items.forEach((el, idx) => {
                    el.addEventListener('mouseenter', () => {
                        this.data.suggestIndex = idx;
                        this.updateSuggestHighlight(items);
                    });
                    el.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.selectItem(this.currentMatches[idx]);
                    });
                });
            } else {
                results.style.display = 'none';
            }

            const tbody = document.querySelector('#igp_grid tbody');
            const row = input.closest('tr');
            if (row && tbody && row === tbody.lastElementChild && val !== '') {
                this.addRow(tbody.children.length + 1);
            }
        },

        selectItem: function(item) {
            const row = document.querySelector(`#igp_grid tbody tr[data-index="${this.data.activeRowIndex}"]`);
            if (row && item) {
                const codeInput = row.querySelector('.igp-item-code');
                codeInput.value = item.item_code || item.code || '';
                codeInput.dataset.id = item.id;
                codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                
                row.querySelector('.igp-desc').value = item.item_name || item.name || item.description || '';
                row.querySelector('.igp-hs-code').value = item.hs_code || '';
                row.querySelector('.igp-unit').value = item.unit || 'Pcs';
                row.querySelector('.igp-pieces').value = '';
                
                const results = document.getElementById('igp_item_results');
                if (results) results.style.display = 'none';
                
                this.calculateRowQuantity(row);
                this.calculateTotals();
                
                const pieces = row.querySelector('.igp-pieces');
                if (pieces) {
                    pieces.focus();
                    pieces.select();
                }
            }
        },

        calculateRowQuantity: function(row) {
            if (!row) return;
            const codeInput = row.querySelector('.igp-item-code');
            const piecesInput = row.querySelector('.igp-pieces');
            const qtyInput = row.querySelector('.igp-qty');
            if (!codeInput || !piecesInput || !qtyInput) return;

            const factor = parseFloat(codeInput.dataset.qtyPerPiece) || 0;
            const pieces = parseFloat(piecesInput.value) || 0;
            
            if (pieces > 0 && factor > 0) {
                qtyInput.value = (pieces * factor).toFixed(4);
            }
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
            const rows = Array.from(document.querySelectorAll('#igp_grid tbody tr'));
            const colIndex = input.closest('td').cellIndex;
            const rowIndex = rows.indexOf(row);
            const gridBody = document.querySelector('#igp_grid tbody');
            const suggest = document.getElementById('igp_item_results');

            if (input.classList.contains('igp-item-code')) {
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
                                const newRows = document.querySelectorAll('#igp_grid tbody tr');
                                const firstInput = newRows[newRows.length - 1].querySelector('.igp-item-code');
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
            
            // Clear headers
            document.querySelectorAll('#inwardGatePassContainer .igp-input, #inwardGatePassContainer .so-input').forEach(el => {
                if (el.tagName === 'SELECT') el.selectedIndex = 0;
                else if (el.type !== 'checkbox') el.value = '';
            });

            // Set default location to Main Store
            const mainStore = this.data.locations.find(l => l.name === 'Main Store');
            const locEl = document.getElementById('igp_location_id');
            if (locEl && mainStore) {
                locEl.value = mainStore.id;
            }

            // Set current Date
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            document.getElementById('igp_date').value = `${yyyy}-${mm}-${dd}`;
            
            // Set current formatted Time
            let hours = today.getHours();
            let minutes = today.getMinutes();
            let seconds = today.getSeconds();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 0 should be 12
            const strHours = hours.toString().padStart(2, '0');
            const strMinutes = minutes.toString().padStart(2, '0');
            const strSeconds = seconds.toString().padStart(2, '0');
            document.getElementById('igp_time_of_supply').value = `${strHours}:${strMinutes}:${strSeconds} ${ampm}`;

            const cancelledCheck = document.getElementById('igp_is_cancelled');
            if (cancelledCheck) cancelledCheck.checked = false;

            if (full) {
                try {
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const companyId = session.company_id || 1;
                    const res = await fetch(`api/inward_gate_passes.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    document.getElementById('igp_sn').value = data.next_no || data.next_sn || 1;
                } catch (err) {
                    console.error('Fetch Next SN Error:', err);
                    document.getElementById('igp_sn').value = 1;
                }
            }

            // Clear conversion text and variables
            this.data.converted_to_pi_tax = 0;
            this.data.converted_to_pi_nontax = 0;
            const pitaxText = document.getElementById('igp_converted_pitax_text');
            const pinontaxText = document.getElementById('igp_converted_pinontax_text');
            const pitaxNo = document.getElementById('igp_converted_pitax_no');
            const pinontaxNo = document.getElementById('igp_converted_pinontax_no');
            
            if (pitaxText) pitaxText.style.display = 'none';
            if (pinontaxText) pinontaxText.style.display = 'none';
            if (pitaxNo) { pitaxNo.innerText = ''; pitaxNo.setAttribute('data-pi-no', '0'); }
            if (pinontaxNo) { pinontaxNo.innerText = ''; pinontaxNo.setAttribute('data-pi-no', '0'); }

            this.renderGrid();
            this.calculateTotals();
            this.updateCancellationUI();
        },


        renderGrid: function() {
            const tbody = document.querySelector('#igp_grid tbody');
            if (tbody) {
                tbody.innerHTML = '';
                for (let i = 0; i < this.data.gridRows; i++) {
                    this.addRow(i + 1);
                }
            }
        },

        addRow: function(index) {
            const tbody = document.querySelector('#igp_grid tbody');
            if (!tbody) return;
            const tr = document.createElement('tr');
            tr.dataset.index = index - 1;
            tr.innerHTML = `
                <td class="igp-row-selector" style="border: 1px solid #cbd5e0; text-align: center; font-size: 10px; color: #64748b; font-weight: bold;">${index}</td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-item-code"></td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-hs-code" tabindex="-1"></td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-desc" tabindex="-1"></td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-pieces num"></td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-qty num"></td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-unit" tabindex="-1"></td>
                <td class="igp-grid-cell"><input type="text" class="igp-grid-input igp-packing"></td>
            `;
            tbody.appendChild(tr);
        },

        calculateTotals: function() {
            let tPieces = 0, tQty = 0;
            document.querySelectorAll('#igp_grid tbody tr').forEach(tr => {
                this.calculateRowQuantity(tr);
                tPieces += parseFloat(tr.querySelector('.igp-pieces').value) || 0;
                tQty += parseFloat(tr.querySelector('.igp-qty').value) || 0;
            });
            document.getElementById('igp_total_pieces').value = tPieces.toFixed(2);
            document.getElementById('igp_total_qty').value = tQty.toFixed(4);
        },

        getCompanyId: function() {
            return JSON.parse(localStorage.getItem('softifyx_session') || '{}').company_id || 1;
        },

        saveIGP: async function() {
            const vendorCode = document.getElementById('igp_vendor_code').value;
            const party = this.data.vendorsAndCustomers.find(p => p.code === vendorCode);
            if (!party) { alert("Please select a valid Vendor or Customer account."); return; }

            const data = {
                id: this.data.currentId,
                serial_no: document.getElementById('igp_sn').value,
                date: document.getElementById('igp_date').value,
                vendor_coa_id: party.id,
                purchase_order_no: document.getElementById('igp_po_no').value,
                purchase_order_date: document.getElementById('igp_po_date').value,
                delivery_challan_no: document.getElementById('igp_dc_no').value,
                delivery_challan_date: document.getElementById('igp_dc_date').value,
                job_id: document.getElementById('igp_job_id').value,
                inventory_location_id: document.getElementById('igp_location_id').value,
                vehicle_description: document.getElementById('igp_vehicle_desc').value,
                driver_name: document.getElementById('igp_driver_name').value,
                time_of_supply: document.getElementById('igp_time_of_supply').value,
                remarks: document.getElementById('igp_remarks').value,
                total_pieces: document.getElementById('igp_total_pieces').value,
                total_qty: document.getElementById('igp_total_qty').value,
                is_cancelled: document.getElementById('igp_is_cancelled').checked,
                converted_to_pi_tax: document.getElementById('igp_converted_pitax_no') ? parseInt(document.getElementById('igp_converted_pitax_no').getAttribute('data-pi-no') || 0) : 0,
                converted_to_pi_nontax: document.getElementById('igp_converted_pinontax_no') ? parseInt(document.getElementById('igp_converted_pinontax_no').getAttribute('data-pi-no') || 0) : 0,
                items: []
            };

            document.querySelectorAll('#igp_grid tbody tr').forEach(tr => {
                const codeInput = tr.querySelector('.igp-item-code');
                const itemId = codeInput ? codeInput.dataset.id : null;
                if (itemId) {
                    data.items.push({
                        item_id: itemId,
                        description: tr.querySelector('.igp-desc').value || '',
                        pieces: tr.querySelector('.igp-pieces').value || 0,
                        qty: tr.querySelector('.igp-qty').value || 0,
                        packing_detail: tr.querySelector('.igp-packing').value || ''
                    });
                }
            });

            if (data.items.length === 0) { alert("Please add at least one item row to save."); return; }

            try {
                const res = await fetch('api/inward_gate_passes.php?action=save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert("Inward Gate Pass saved successfully!");
                    this.resetForm(true);
                } else {
                    alert("Error: " + result.error);
                }
            } catch (err) { console.error(err); alert("Failed to save gate pass."); }
        },

        navigateBySN: async function(sn, dir = '') {
            try {
                let url = `api/inward_gate_passes.php?action=fetch&sn=${sn}`;
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
            document.getElementById('igp_sn').value = data.serial_no;
            document.getElementById('igp_date').value = data.date;
            
            const party = this.data.vendorsAndCustomers.find(p => p.id == data.vendor_coa_id);
            if (party) {
                this.selectVendor(party);
            } else if (data.vendor_code) {
                // Fallback direct fill
                document.getElementById('igp_vendor_code').value = data.vendor_code;
                document.getElementById('igp_vendor_name').value = data.vendor_name || '';
                document.getElementById('igp_vendor_address').value = data.vendor_address || '';
                document.getElementById('igp_vendor_phone').value = data.vendor_phone || '';
            }

            document.getElementById('igp_po_no').value = data.purchase_order_no || '';
            document.getElementById('igp_po_date').value = data.purchase_order_date || '';
            document.getElementById('igp_dc_no').value = data.delivery_challan_no || '';
            document.getElementById('igp_dc_date').value = data.delivery_challan_date || '';
            document.getElementById('igp_job_id').value = data.job_id || '';
            document.getElementById('igp_location_id').value = data.inventory_location_id || '';
            document.getElementById('igp_vehicle_desc').value = data.vehicle_description || '';
            document.getElementById('igp_driver_name').value = data.driver_name || '';
            document.getElementById('igp_time_of_supply').value = data.time_of_supply || '';
            document.getElementById('igp_remarks').value = data.remarks || '';
            document.getElementById('igp_is_cancelled').checked = parseInt(data.is_cancelled) === 1;

            // Load PI conversion status texts
            const piTaxNo = parseInt(data.converted_to_pi_tax) || 0;
            const piNonTaxNo = parseInt(data.converted_to_pi_nontax) || 0;
            this.data.converted_to_pi_tax = piTaxNo;
            this.data.converted_to_pi_nontax = piNonTaxNo;

            const setConversionText = (idNo, idText, val) => {
                const elNo = document.getElementById(idNo);
                const elText = document.getElementById(idText);
                if (val > 0) {
                    if (elNo) { elNo.innerText = val; elNo.setAttribute('data-pi-no', val); }
                    if (elText) elText.style.display = 'block';
                } else {
                    if (elNo) { elNo.innerText = ''; elNo.setAttribute('data-pi-no', '0'); }
                    if (elText) elText.style.display = 'none';
                }
            };

            setConversionText('igp_converted_pitax_no', 'igp_converted_pitax_text', piTaxNo);
            setConversionText('igp_converted_pinontax_no', 'igp_converted_pinontax_text', piNonTaxNo);

            const tbody = document.querySelector('#igp_grid tbody');
            tbody.innerHTML = '';
            data.items.forEach((item, i) => {
                this.addRow(i + 1);
                const row = tbody.lastElementChild;
                const codeInput = row.querySelector('.igp-item-code');
                codeInput.value = item.item_code;
                codeInput.dataset.id = item.item_id;
                const invItem = this.data.inventoryItems.find(i => String(i.id) === String(item.item_id));
                codeInput.dataset.qtyPerPiece = invItem ? (invItem.qty_per_piece || 0) : (item.qty_per_piece || 0);
                
                row.querySelector('.igp-hs-code').value = item.hs_code || (invItem ? invItem.hs_code : '') || '';
                row.querySelector('.igp-desc').value = item.description || item.item_name || '';
                row.querySelector('.igp-pieces').value = item.pieces;
                row.querySelector('.igp-qty').value = item.qty;
                row.querySelector('.igp-unit').value = item.unit;
                row.querySelector('.igp-packing').value = item.packing_detail;
            });

            for (let i = data.items.length; i < this.data.gridRows; i++) {
                this.addRow(i + 1);
            }

            this.calculateTotals();
            this.updateCancellationUI();
        },

        updateCancellationUI: function() {
            const isCancelled = document.getElementById('igp_is_cancelled').checked;
            const stamp = document.getElementById('igp_cancelled_stamp');
            const label = document.getElementById('igp_cancel_label');
            
            if (isCancelled) {
                if (stamp) stamp.style.display = 'block';
                if (label) {
                    label.style.color = '#dc3545';
                    label.style.fontWeight = 'bold';
                }
            } else {
                if (stamp) stamp.style.display = 'none';
                if (label) {
                    label.style.color = '#475569';
                    label.style.fontWeight = 'normal';
                }
            }
        },

        navigate: async function(dir) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            let sn = parseInt(document.getElementById('igp_sn').value) || 0;
            
            if (dir === 'prev' && sn === 0) dir = 'last';

            if (dir === 'last') {
                try {
                    const res = await fetch(`api/inward_gate_passes.php?action=get_next_serial_no&company_id=${companyId}`);
                    const data = await res.json();
                    sn = (data.next_no || data.next_sn || 2) - 1;
                    dir = undefined;
                } catch(e) { return; }
            } else if (sn === 0 || dir === 'this') {
                if (dir === 'next') {
                    try {
                        const res = await fetch(`api/inward_gate_passes.php?action=get_next_serial_no&company_id=${companyId}`);
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

        deleteIGP: async function() {
            if (!this.data.currentId) return;
            if (confirm("Are you sure you want to delete this Inward Gate Pass?")) {
                const currentSN = document.getElementById('igp_sn').value;
                await fetch(`api/inward_gate_passes.php?action=delete&id=${this.data.currentId}`);
                this.resetForm(false);
                document.getElementById('igp_sn').value = currentSN;
            }
        },

        findIGP: function() {
            this.openFindModal();
        },

        convertPurchaseOrder: async function(isTaxMode = false) {
            if (!this.data.currentId) {
                alert("Please save the Inward Gate Pass first before converting to Purchase Invoice.");
                return;
            }

            try {
                const coId = this.getCompanyId();
                const igpSn = document.getElementById('igp_sn').value;

                // Get next PI serial number to show on IGP form
                const isTaxVal = isTaxMode ? 1 : 0;
                const resSn = await fetch(`api/purchases.php?action=get_next_invoice_serial&company_id=${coId}&is_tax=${isTaxVal}`);
                let nextPiSn = null;
                if (resSn.ok) {
                    const snData = await resSn.json();
                    nextPiSn = snData.next_sn;
                }

                // Show conversion text on IGP form (red text below Cancel)
                if (nextPiSn) {
                    if (isTaxMode) {
                        const el = document.getElementById('igp_converted_pitax_no');
                        const textEl = document.getElementById('igp_converted_pitax_text');
                        if (el) {
                            el.innerText = nextPiSn;
                            el.setAttribute('data-pi-no', nextPiSn);
                        }
                        if (textEl) textEl.style.display = 'block';
                        this.data.converted_to_pi_tax = nextPiSn;
                    } else {
                        const el = document.getElementById('igp_converted_pinontax_no');
                        const textEl = document.getElementById('igp_converted_pinontax_text');
                        if (el) {
                            el.innerText = nextPiSn;
                            el.setAttribute('data-pi-no', nextPiSn);
                        }
                        if (textEl) textEl.style.display = 'block';
                        this.data.converted_to_pi_nontax = nextPiSn;
                    }
                    
                    // Save IGP with updated converted status
                    this._silentSave = true;
                    await this.saveIGP();
                    this._silentSave = false;
                }

                // Open Purchase Invoice popup
                if (typeof window.openSecondaryModularPopup === 'function') {
                    window.openSecondaryModularPopup('Navigation/Purchases/purchase_invoice.html', 'fa-file-invoice-dollar', 'Purchase Invoice', async () => {
                        if (window.PIModule && typeof window.PIModule.init === 'function') {
                            await window.PIModule.init();
                            if (typeof window.PIModule.fetchIGPData === 'function') {
                                window.PIModule.fetchIGPData(igpSn, isTaxMode);
                            }
                        }
                    }, 'Purchase Invoices', true, true);
                } else {
                    alert("Cannot open Purchase Invoice window. Please try navigating manually.");
                }
            } catch (e) {
                console.error("Convert to PI Error:", e);
                alert("Failed to convert to Purchase Invoice.");
            }
        },


        fetchPurchaseOrderData: async function(poNo) {
            if (!poNo) return;
            try {
                const coId = this.getCompanyId();
                const res = await fetch(`api/purchases.php?action=get_po&serial_no=${poNo}&company_id=${coId}`);
                const po = await res.json();

                if (!po || !po.id) {
                    alert(`Purchase Order #${poNo} not found in database.`);
                    return;
                }

                // 1. Fill PO Number & Date
                document.getElementById('igp_po_no').value = po.serial_no;
                document.getElementById('igp_po_date').value = po.po_date || '';

                // 2. Select Vendor
                if (po.vendor) {
                    const party = this.data.vendorsAndCustomers.find(p => p.id == po.vendor_coa_id || p.code === po.vendor.code);
                    if (party) {
                        this.selectVendor(party);
                    } else {
                        document.getElementById('igp_vendor_code').value = po.vendor.code || '';
                        document.getElementById('igp_vendor_name').value = po.vendor.name || '';
                        document.getElementById('igp_vendor_address').value = po.vendor.address || '';
                        document.getElementById('igp_vendor_phone').value = po.vendor.phone || '';
                    }
                }

                // 3. Set Job ID dropdown if matches job_ref
                if (po.job_ref) {
                    const matchedJob = this.data.jobs.find(j => j.job_no == po.job_ref);
                    if (matchedJob) {
                        document.getElementById('igp_job_id').value = matchedJob.id;
                    }
                }

                // 4. Fill Grid Items
                const tbody = document.querySelector('#igp_grid tbody');
                tbody.innerHTML = '';

                if (po.items && po.items.length > 0) {
                    po.items.forEach((item, i) => {
                        this.addRow(i + 1);
                        const row = tbody.lastElementChild;
                        const codeInput = row.querySelector('.igp-item-code');
                        codeInput.value = item.item_code;
                        codeInput.dataset.id = item.item_id || item.item_coa_id;
                        codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                        
                        row.querySelector('.igp-hs-code').value = item.hs_code || (invItem ? invItem.hs_code : '') || '';
                row.querySelector('.igp-desc').value = item.description || item.item_name || '';
                        row.querySelector('.igp-pieces').value = item.pieces || '0.00';
                        row.querySelector('.igp-qty').value = item.quantity || '0.00';
                        row.querySelector('.igp-unit').value = item.unit_name || item.unit || 'Pcs';
                        row.querySelector('.igp-packing').value = '';
                    });
                }

                // Pad up to 18 rows
                const startPadIdx = po.items ? po.items.length : 0;
                for (let i = startPadIdx; i < this.data.gridRows; i++) {
                    this.addRow(i + 1);
                }

                this.calculateTotals();
                alert(`Imported Purchase Order #${poNo} successfully!`);
            } catch (err) {
                console.error("Convert PO Error:", err);
                alert("System error importing Purchase Order.");
            }
        },

        printIGP: function() {
            if (!this.data.currentId) { alert("Please save the document before printing."); return; }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companies = JSON.parse(localStorage.getItem('softifyx_companies') || '[]');
            const company = companies.find(c => c.id == session.company_id) || {};

            let compName = company.name || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
            compName = compName.toUpperCase().startsWith('M/S ') ? compName.toUpperCase() : 'M/S ' + compName.toUpperCase();
            compName = compName.replace(/^(M\/S\s*)+/i, 'M/S ');

            const compAddr = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai, Peshawar';
            const compPhone = company.phone || '+92 348 7240256';
            const compEmail = company.email || 'info@seastonepipes.com';

            const logoImg = document.getElementById('userLogo');
            const logoSrc = logoImg ? logoImg.src : '';

            const sn = document.getElementById('igp_sn').value;
            const date = document.getElementById('igp_date').value;
            const poNo = document.getElementById('igp_po_no').value;
            const poDate = document.getElementById('igp_po_date').value;
            const dcNo = document.getElementById('igp_dc_no').value;
            const dcDate = document.getElementById('igp_dc_date').value;
            const vendorName = document.getElementById('igp_vendor_name').value;
            const vendorAddr = document.getElementById('igp_vendor_address').value;
            const vendorTel = document.getElementById('igp_vendor_phone').value;
            const vehicle = document.getElementById('igp_vehicle_desc').value;
            const driver = document.getElementById('igp_driver_name').value;
            const supplyTime = document.getElementById('igp_time_of_supply').value;
            const remarks = document.getElementById('igp_remarks').value;

            let itemsHtml = '';
            let totalPieces = 0;
            let totalQty = 0;
            document.querySelectorAll('#igp_grid tbody tr').forEach((tr, i) => {
                const code = tr.querySelector('.igp-item-code')?.value || '';
                const desc = tr.querySelector('.igp-desc')?.value || '';
                const pieces = tr.querySelector('.igp-pieces')?.value || '';
                const qty = tr.querySelector('.igp-qty')?.value || '';
                const unit = tr.querySelector('.igp-unit')?.value || 'Pcs';
                const packing = tr.querySelector('.igp-packing')?.value || '';

                if (code) {
                    const parsedPieces = parseFloat(pieces) || 0;
                    const parsedQty = parseFloat(qty) || 0;
                    totalPieces += parsedPieces;
                    totalQty += parsedQty;

                    itemsHtml += `
                        <tr>
                            <td style="text-align:center; border: 1px solid #333; padding: 5px;">${i + 1}</td>
                            <td style="border: 1px solid #333; padding: 5px;">${desc}</td>
                            <td style="text-align:center; border: 1px solid #333; padding: 5px;">${parsedPieces > 0 ? parsedPieces : ''}</td>
                            <td style="text-align:center; border: 1px solid #333; padding: 5px;">${parsedQty > 0 ? parsedqty.toFixed(4) + ' ' + unit : ''}</td>
                            <td style="border: 1px solid #333; padding: 5px;">${packing}</td>
                        </tr>
                    `;
                }
            });

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Inward Gate Pass - ${sn}</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
                    <style>
                        @page { margin: 0; size: auto; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.4; margin: 10mm; padding: 20px; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        
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

                        .details-area { display: flex; justify-content: space-between; margin-bottom: 15px; }
                        .customer-box { border: 1px solid #a0a0a0; border-radius: 4px; width: 45%; padding: 0; overflow: hidden; }
                        .customer-box-header { border-bottom: 1px solid #a0a0a0; padding: 5px 10px; font-weight: bold; color: #1F4E79; display: flex; align-items: center; gap: 5px; }
                        .customer-box-content { padding: 10px; line-height: 1.6; }
                        .customer-box-content i { color: #1F4E79; width: 14px; text-align: center; }

                        .invoice-details-table { width: 45%; border-collapse: collapse; font-size: 11px; }
                        .invoice-details-table td { padding: 5px; border-bottom: 1px dotted #ccc; }
                        .invoice-details-table td:first-child { font-weight: bold; color: #1F4E79; width: 120px; }

                        .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                        .grid-table thead th { border: 1px solid #333; background: #f1f5f9; padding: 6px 4px; text-align: left; font-size: 11px; }
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
                            <div class="invoice-title">INWARD GATE PASS</div>
                            <div class="invoice-type-badge">I.G.P.</div>
                        </div>
                    </div>

                    <div class="details-area">
                        <div class="customer-box">
                            <div class="customer-box-header">
                                <i class="fas fa-user-circle"></i> VENDOR DETAILS
                            </div>
                            <div class="customer-box-content">
                                <strong>${vendorName}</strong><br>
                                ${vendorAddr}<br>
                                <i class="fas fa-phone-alt" style="margin-top: 5px;"></i> ${vendorTel || 'N/A'}
                            </div>
                        </div>
                        <table class="invoice-details-table">
                            <tr>
                                <td>Serial No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${sn}</b></td>
                            </tr>
                            <tr>
                                <td>Date</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${date}</b></td>
                            </tr>
                            <tr>
                                <td>P.O. No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${poNo || 'N/A'} ${poDate ? `Dated ${poDate}` : ''}</b></td>
                            </tr>
                            <tr>
                                <td>D.C. No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${dcNo || 'N/A'} ${dcDate ? `Dated ${dcDate}` : ''}</b></td>
                            </tr>
                            <tr>
                                <td>Time of Supply</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${supplyTime || ''}</b></td>
                            </tr>
                            <tr>
                                <td>Vehicle No.</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${vehicle || ''}</b></td>
                            </tr>
                            <tr>
                                <td>Driver Name</td>
                                <td>: &nbsp;&nbsp;&nbsp; <b>${driver || ''}</b></td>
                            </tr>
                        </table>
                    </div>

                    <table class="grid-table">
                        <thead>
                            <tr>
                                <th style="width:40px; text-align:center;">Serial</th>
                                <th>Item Description</th>
                                <th style="width:60px; text-align:center;">Pieces</th>
                                <th style="width:80px; text-align:center;">Quantity</th>
                                <th style="width:120px;">Packing Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight: bold; background: #f1f5f9;">
                                <td colspan="2" style="text-align: right; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">TOTALS</td>
                                <td style="text-align: center; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${totalPieces.toFixed(2)}</td>
                                <td style="text-align: center; border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px; font-size: 11px;">${totalqty.toFixed(4)}</td>
                                <td style="border: 1px solid #333; border-top: 2px solid #333; padding: 6px 4px;"></td>
                            </tr>
                        </tfoot>
                    </table>

                    <div><b>Remarks:</b> ${remarks}</div>

                    <div class="footer">
                        <table width="100%">
                            <tr>
                                <td width="33%">
                                    <div style="font-size: 11px; margin-top: 5px; font-weight: bold; font-style: italic;">Prepared By: Administrator</div>
                                </td>
                                <td width="33%" align="center">
                                    <div class="signature-line" style="margin: 40px auto 0 auto;">Authorized Signatures</div>
                                </td>
                                <td width="33%" align="right">
                                    <div class="signature-line" style="margin: 40px 0 0 auto;">Receiver's Signatures</div>
                                </td>
                            </tr>
                        </table>
                    </div>
                </body>
                </html>
            `;

            let printFrame = document.getElementById('igp_print_frame');
            if (!printFrame) {
                printFrame = document.createElement('iframe');
                printFrame.id = 'igp_print_frame';
                printFrame.style.display = 'none';
                document.body.appendChild(printFrame);
            }

            const doc = printFrame.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();

            printFrame.contentWindow.focus();
            setTimeout(() => {
                printFrame.contentWindow.print();
            }, 500);
        }
    ,

    openFindModal: async function() {
        const modal = document.getElementById('igp_find_modal');
        if (modal) modal.style.display = 'flex';
        
        const searchInput = document.getElementById('igp_find_search');
        if (searchInput) searchInput.focus();
        
        if (!this.findKeydownAdded) {
            document.addEventListener('keydown', (e) => this.handleFindKeyDown(e));
            this.findKeydownAdded = true;
        }

        await this.renderFindTable();
    },

    closeFindModal: function() {
        const modal = document.getElementById('igp_find_modal');
        if (modal) modal.style.display = 'none';
    },

    renderFindTable: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const tbody = document.getElementById('igp_find_table_body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:10px;">Loading...</td></tr>';
        
        try {
            const res = await fetch(`api/inward_gate_passes.php?action=search_igps&company_id=${companyId}`);
            this.findData = await res.json();
            // Default sort to ascending serial number
            this.findSortField = 'serial_no';
            this.findSortDesc = false;
            this.filterFindTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:10px; color:red;">Failed to load data.</td></tr>';
        }
    },

    filterFindTable: function() {
        const q = (document.getElementById('igp_find_search')?.value || '').toLowerCase();
        const field = document.getElementById('igp_find_field')?.value || 'serial_no';
        
        let filtered = this.findData;
        if (q) {
            filtered = this.findData.filter(igp => {
                const val = (igp[field]?.toString() || '').toLowerCase();
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
        
        let data = dataToRender || this.findData.filter(igp => {
            const q = (document.getElementById('igp_find_search')?.value || '').toLowerCase();
            if(!q) return true;
            const filterField = document.getElementById('igp_find_field')?.value || 'serial_no';
            return (igp[filterField]?.toString() || '').toLowerCase().includes(q);
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
        const tbody = document.getElementById('igp_find_table_body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:10px;">No records found</td></tr>';
            this.findSelectedIndex = -1;
            this.updateFindFooter(null);
            return;
        }

        data.forEach((igp, index) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.borderBottom = '1px solid #cbd5e0';
            tr.onmouseover = () => { if (index !== this.findSelectedIndex) tr.style.backgroundColor = '#f1f5f9'; };
            tr.onmouseout = () => { if (index !== this.findSelectedIndex) tr.style.backgroundColor = 'transparent'; };
            
            tr.onclick = () => {
                this.findSelectedIndex = index;
                this.renderFindGrid(data);
            };

            tr.ondblclick = () => {
                this.selectFindRow(igp);
            };

            if (index === this.findSelectedIndex) {
                tr.style.backgroundColor = '#000000';
                tr.style.color = 'white';
                this.updateFindFooter(igp);
            } else {
                tr.style.backgroundColor = 'transparent';
                tr.style.color = '#334155';
            }

            tr.innerHTML = `
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${igp.serial_no || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${igp.date || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${igp.vendor_name || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${igp.purchase_order_no || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${igp.delivery_challan_no || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0;">${igp.time_of_supply || ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e0; text-align: center;">${igp.is_cancelled || ''}</td>
            `;
            tbody.appendChild(tr);
        });

        // Ensure selected row is visible
        if (this.findSelectedIndex >= 0) {
            const selectedRow = tbody.children[this.findSelectedIndex];
            if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });
        }
    },

    handleFindKeyDown: function(e) {
        const modal = document.getElementById('igp_find_modal');
        if (!modal || modal.style.display === 'none') return;

        const tbody = document.getElementById('igp_find_table_body');
        if (!tbody || tbody.children.length === 0 || tbody.children[0].cells.length === 1) return;

        const rowCount = tbody.children.length;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.findSelectedIndex = (this.findSelectedIndex + 1) % rowCount;
            this.filterFindTable(); // Re-render to highlight
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.findSelectedIndex = (this.findSelectedIndex - 1 + rowCount) % rowCount;
            this.filterFindTable();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.findSelectedIndex >= 0 && this.findSelectedIndex < rowCount) {
                // Find the data array currently rendered
                const q = (document.getElementById('igp_find_search')?.value || '').toLowerCase();
                const filterField = document.getElementById('igp_find_field')?.value || 'serial_no';
                let data = this.findData.filter(igp => (igp[filterField]?.toString() || '').toLowerCase().includes(q));
                
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
                
                const selectedIGP = data[this.findSelectedIndex];
                if (selectedIGP) {
                    this.selectFindRow(selectedIGP);
                }
            }
        } else if (e.key === 'Escape') {
            this.closeFindModal();
        }
    },

    selectFindRow: async function(igp) {
        if (!igp || !igp.serial_no) return;
        this.closeFindModal();
        document.getElementById('igp_sn').value = igp.serial_no;
        this.navigateBySN(igp.serial_no);
    },

    updateFindFooter: function(igp) {
        if (igp) {
            document.getElementById('igp_find_added_by').value = igp.created_by || 'Administrator';
            document.getElementById('igp_find_added_on').value = igp.created_at ? new Date(igp.created_at).toLocaleDateString() : '';
            document.getElementById('igp_find_edited_by').value = igp.updated_by || 'Administrator';
            document.getElementById('igp_find_edited_on').value = igp.updated_at ? new Date(igp.updated_at).toLocaleDateString() : '';
        } else {
            document.getElementById('igp_find_added_by').value = '';
            document.getElementById('igp_find_added_on').value = '';
            document.getElementById('igp_find_edited_by').value = '';
            document.getElementById('igp_find_edited_on').value = '';
        }
    }

    };
})();






