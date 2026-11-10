(function() {
    window.DeliveryChallanModule = {
        data: {
            currentId: null,
            items: [],
            gridRows: 40,
            customers: [],
            inventoryItems: [],
            jobs: [],
            locations: [],
            drivers: [],
            activeRowIndex: -1,
            suggestIndex: -1,
            findDCList: [],
            findSelectedIndex: -1,
            findSortField: 'serial_no',
            findSortDesc: true
        },

        showFindModal: async function() {
            document.getElementById('dcFindModal').style.display = 'flex';
            document.getElementById('dcFindValue').focus();
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;
                const res = await fetch(`api/delivery_challan.php?action=get_all&company_id=${companyId}`);
                if (!res.ok) throw new Error("Failed to fetch");
                const data = await res.json();
                this.data.findDCList = data || [];
                this.sortFindGrid('serial_no');
                
                // Add keydown listener if not added
                if (!this.data.findKeydownAdded) {
                    document.getElementById('dcFindModal').addEventListener('keydown', (e) => this.handleFindKeyDown(e));
                    this.data.findKeydownAdded = true;
                }
            } catch (e) {
                console.error("Find Modal Load Error:", e);
                alert("Error loading Delivery Challans.");
            }
        },

        filterFindGrid: async function() {
            const field = document.getElementById('dcFindField').value;
            const val = document.getElementById('dcFindValue').value.trim();
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            
            try {
                let url = `api/delivery_challan.php?action=search&company_id=${companyId}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(val)}`;
                if (!val) {
                    url = `api/delivery_challan.php?action=get_all&company_id=${companyId}`;
                }
                const res = await fetch(url);
                if (!res.ok) throw new Error("Failed to search");
                const data = await res.json();
                this.data.findDCList = data || [];
                this.sortFindGrid(this.data.findSortField);
            } catch(e) {
                console.error("Filter Error:", e);
            }
        },

        renderFindGrid: function(data) {
            const tbody = document.getElementById('dcFindGridBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            data.forEach((dc, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="row-indicator" style="text-align: center; color: #3182ce; font-size: 10px;"></td>
                    <td style="text-align: center;">${dc.serial_no}</td>
                    <td>${dc.date || ''}</td>
                    <td>${dc.purchase_order_no || ''}</td>
                    <td>${dc.purchase_order_date || ''}</td>
                    <td>${dc.customer_name || ''}</td>
                    <td>${dc.vehicle || ''}</td>
                    <td>${dc.driver || ''}</td>
                    <td>${dc.is_cancelled == 1 ? 'Cancelled' : ''}</td>
                `;
                
                tr.onclick = () => this.selectFindRow(index, tr, dc);
                tr.ondblclick = () => {
                    this.navigateBySN(dc.serial_no);
                    document.getElementById('dcFindModal').style.display = 'none';
                };
                
                tbody.appendChild(tr);
            });
            
            if (data.length > 0) {
                this.selectFindRow(0, tbody.firstChild, data[0]);
            } else {
                this.data.findSelectedIndex = -1;
                this.updateFindFooter(null);
            }
        },

        selectFindRow: function(index, tr, dataObj) {
            this.data.findSelectedIndex = index;
            const tbody = document.getElementById('dcFindGridBody');
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

        updateFindFooter: function(dc) {
            if (dc) {
                document.getElementById('dcFindAddedBy').value = "Administrator";
                document.getElementById('dcFindAddedOn').value = dc.created_at || '';
                document.getElementById('dcFindEditedBy').value = "";
                document.getElementById('dcFindEditedOn').value = "";
            } else {
                document.getElementById('dcFindAddedBy').value = "";
                document.getElementById('dcFindAddedOn').value = "";
                document.getElementById('dcFindEditedBy').value = "";
                document.getElementById('dcFindEditedOn').value = "";
            }
        },

        refreshFindGrid: function() {
            document.getElementById('dcFindValue').value = '';
            this.filterFindGrid();
        },

        sortFindGrid: function(field) {
            if (this.data.findSortField === field) {
                this.data.findSortDesc = !this.data.findSortDesc;
            } else {
                this.data.findSortField = field;
                this.data.findSortDesc = (field === 'serial_no'); 
            }
            
            this.data.findDCList.sort((a, b) => {
                let valA = a[field];
                let valB = b[field];
                
                if (field === 'serial_no') {
                    valA = parseInt(valA) || 0;
                    valB = parseInt(valB) || 0;
                } else {
                    valA = (valA || '').toString().toLowerCase();
                    valB = (valB || '').toString().toLowerCase();
                }
                
                if (valA < valB) return this.data.findSortDesc ? 1 : -1;
                if (valA > valB) return this.data.findSortDesc ? -1 : 1;
                return 0;
            });
            
            this.renderFindGrid(this.data.findDCList);
        },

        handleFindKeyDown: function(e) {
            if (document.getElementById('dcFindModal').style.display !== 'flex') return;
            
            const tbody = document.getElementById('dcFindGridBody');
            const rows = tbody.querySelectorAll('tr');
            if (rows.length === 0) return;

            let idx = this.data.findSelectedIndex;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                idx = (idx + 1) % rows.length;
                this.selectFindRow(idx, rows[idx], this.data.findDCList[idx]);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                idx = (idx - 1 + rows.length) % rows.length;
                this.selectFindRow(idx, rows[idx], this.data.findDCList[idx]);
            } else if (e.key === 'Enter') {
                if (document.activeElement === document.getElementById('dcFindValue')) {
                    // Let the input onkeyup handle it
                } else if (idx >= 0 && idx < this.data.findDCList.length) {
                    e.preventDefault();
                    this.navigateBySN(this.data.findDCList[idx].serial_no);
                    document.getElementById('dcFindModal').style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                document.getElementById('dcFindModal').style.display = 'none';
            }
        },

        init: async function() {
            console.log("Initializing Delivery Challan Module...");
            const container = document.getElementById('deliveryChallanContainer');
            if (!container) {
                console.warn("Delivery Challan container not found, retrying in 100ms...");
                await new Promise(resolve => setTimeout(resolve, 100));
                return this.init();
            }
            await this.loadDependencies();
            this.setupEventListeners();
            if (!this.data.secondaryCloseListenerAdded) {
                window.addEventListener('secondaryModalClosed', () => {
                    this.loadDrivers();
                });
                this.data.secondaryCloseListenerAdded = true;
            }
            await this.resetForm(true);
        },

        loadDependencies: async function() {
            try {
                const coId = this.getCompanyId();
                const [custRes, invRes, jobRes, locRes, drvRes] = await Promise.all([
                    fetch(`api/sale_order.php?action=get_customers_and_vendors&company_id=${coId}`),
                    fetch(`api/sale_order.php?action=get_all_items&company_id=${coId}`),
                    fetch(`api/jobs.php?action=get_jobs&company_id=${coId}`),
                    fetch(`api/inventory.php?action=get_locations&company_id=${coId}`),
                    fetch(`api/drivers.php?action=get_drivers`).catch(() => null)
                ]);

                const allCoa = await custRes.json();
                this.data.customers = allCoa.filter(c => c.type === 'customer');
                this.data.inventoryItems = await invRes.json();
                this.data.jobs = await jobRes.json();
                this.data.locations = await locRes.json();
                if (drvRes && drvRes.ok) {
                    this.data.drivers = await drvRes.json() || [];
                }

                this.populateSelects();
            } catch (err) { console.error("Dependency Load Error:", err); }
        },

        populateSelects: function() {
            const jobSelect = document.getElementById('dc_job_id');
            const locSelect = document.getElementById('dc_location_id');
            const drvSelect = document.getElementById('dc_driver_select');

            if (jobSelect) {
                jobSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.jobs.map(j => `<option value="${j.id}">${j.job_no} - ${j.description || ''}</option>`).join('');
            }
            if (locSelect) {
                locSelect.innerHTML = '<option value="">Select Option</option>' + 
                    this.data.locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
                
                const mainStore = this.data.locations.find(l => l.name.toLowerCase().includes('main store'));
                if (mainStore) {
                    locSelect.value = mainStore.id;
                }
            }
            if (drvSelect && this.data.drivers) {
                const curVal = drvSelect.value;
                drvSelect.innerHTML = '<option value="">Select Driver</option>' +
                    this.data.drivers.map(d => `<option value="${d.id}">${d.name}${d.vehicle_desc ? ' (' + d.vehicle_desc + ')' : ''}</option>`).join('');
                if (curVal) drvSelect.value = curVal;
            }
        },

        loadDrivers: async function(selectIdToPick = null) {
            try {
                const res = await fetch('api/drivers.php?action=get_drivers');
                if (!res.ok) return;
                this.data.drivers = await res.json() || [];
                const drvSelect = document.getElementById('dc_driver_select');
                if (drvSelect) {
                    const curVal = drvSelect.value;
                    drvSelect.innerHTML = '<option value="">Select Driver</option>' +
                        this.data.drivers.map(d => `<option value="${d.id}">${d.name}${d.vehicle_desc ? ' (' + d.vehicle_desc + ')' : ''}</option>`).join('');
                    if (curVal) drvSelect.value = curVal;
                }

                if (selectIdToPick) {
                    const picked = (this.data.drivers || []).find(d => d.id == selectIdToPick);
                    if (picked) this.pickDriver(picked);
                }
            } catch (e) {
                console.error("Error loading drivers:", e);
            }
        },

        positionDriverSuggestions: function(suggBox) {
            if (!suggBox) return;
            const input = document.getElementById('dc_driver_name');
            if (!input) return;

            const rect = input.getBoundingClientRect();
            const modal = input.closest('.modal-container') || input.closest('.main-window') || document.body;
            const modalRect = modal.getBoundingClientRect();

            // Distance available below input within window/modal
            const spaceBelow = Math.min(window.innerHeight - rect.bottom, modalRect.bottom - rect.bottom);
            const itemCount = suggBox.querySelectorAll('.dc-driver-suggest-item').length;
            const neededHeight = Math.min((itemCount * 21) + 4, 180);

            // Open UPWARD if space below is limited or if items count > 1
            if (spaceBelow < (neededHeight + 15) || itemCount > 1) {
                suggBox.style.top = 'auto';
                suggBox.style.bottom = 'calc(100% + 2px)';
                suggBox.style.boxShadow = '0 -4px 12px rgba(0, 0, 0, 0.18)';
            } else {
                suggBox.style.bottom = 'auto';
                suggBox.style.top = 'calc(100% + 2px)';
                suggBox.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.18)';
            }
        },

        renderDriverSuggestions: function(filterText = '') {
            const suggBox = document.getElementById('dc_driver_suggestions');
            if (!suggBox) return;
            const q = (filterText || '').trim().toLowerCase();
            const drivers = this.data.drivers || [];
            const matches = q ? drivers.filter(d => 
                (d.name && d.name.toLowerCase().includes(q)) ||
                (d.cnic && d.cnic.toLowerCase().includes(q)) ||
                (d.mobile && d.mobile.toLowerCase().includes(q)) ||
                (d.vehicle_desc && d.vehicle_desc.toLowerCase().includes(q))
            ) : drivers;

            this.data.driverSuggestIndex = -1;

            if (matches.length === 0) {
                suggBox.innerHTML = '<div style="padding: 2px 8px; color: #94a3b8; font-size: 10.5px; font-style: italic; height: 21px; line-height: 21px; box-sizing: border-box;">No matching driver (manual name allowed)</div>';
                suggBox.style.display = 'block';
                this.positionDriverSuggestions(suggBox);
                return;
            }

            suggBox.innerHTML = '';
            matches.forEach((d, idx) => {
                const item = document.createElement('div');
                item.className = 'dc-driver-suggest-item';
                item.setAttribute('data-index', idx);

                const detailsArr = [];
                if (d.vehicle_desc) detailsArr.push(d.vehicle_desc);
                if (d.mobile) detailsArr.push(d.mobile);
                else if (d.cnic) detailsArr.push(d.cnic);
                const detailsStr = detailsArr.join(' • ');

                item.innerHTML = `
                    <span class="drv-item-name" style="font-weight: 600; color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.name || ''}</span>
                    ${detailsStr ? `<span class="drv-item-details" style="font-size: 10px; opacity: 0.8; color: inherit; white-space: nowrap; flex-shrink: 0; margin-left: 6px;">${detailsStr}</span>` : ''}
                `;
                item.onmousedown = (e) => {
                    e.preventDefault();
                    this.pickDriver(d);
                    suggBox.style.display = 'none';
                };
                suggBox.appendChild(item);
            });
            suggBox.style.display = 'block';
            this.positionDriverSuggestions(suggBox);
        },

        handleDriverKey: function(e) {
            const suggBox = document.getElementById('dc_driver_suggestions');
            if (!suggBox) return;

            if (suggBox.style.display === 'none') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.showDriverSuggestions(true);
                }
                return;
            }

            const items = suggBox.querySelectorAll('.dc-driver-suggest-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.data.driverSuggestIndex = Math.min((this.data.driverSuggestIndex ?? -1) + 1, items.length - 1);
                this.updateDriverSuggestHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.data.driverSuggestIndex = Math.max((this.data.driverSuggestIndex ?? 0) - 1, 0);
                this.updateDriverSuggestHighlight(items);
            } else if (e.key === 'Enter') {
                if (this.data.driverSuggestIndex >= 0 && this.data.driverSuggestIndex < items.length) {
                    e.preventDefault();
                    items[this.data.driverSuggestIndex].dispatchEvent(new MouseEvent('mousedown'));
                } else {
                    suggBox.style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                suggBox.style.display = 'none';
            }
        },

        updateDriverSuggestHighlight: function(items) {
            items.forEach((item, idx) => {
                if (idx === this.data.driverSuggestIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        },

        pickDriver: function(d) {
            if (!d) return;
            const nameInput = document.getElementById('dc_driver_name');
            if (nameInput) nameInput.value = d.name || '';
            const cnicInput = document.getElementById('dc_driver_cnic');
            if (cnicInput) cnicInput.value = d.cnic || '';
            const mobInput = document.getElementById('dc_driver_mobile');
            if (mobInput) mobInput.value = d.mobile || '';
            const vehInput = document.getElementById('dc_vehicle_desc');
            if (vehInput && d.vehicle_desc) vehInput.value = d.vehicle_desc;

            const drvSelect = document.getElementById('dc_driver_select');
            if (drvSelect) drvSelect.value = d.id || '';

            const suggBox = document.getElementById('dc_driver_suggestions');
            if (suggBox) suggBox.style.display = 'none';
        },

        onDriverInput: function(val) {
            const q = (val || '').trim().toLowerCase();
            const found = (this.data.drivers || []).find(d => d.name && d.name.toLowerCase() === q);
            if (found) {
                const cnicInput = document.getElementById('dc_driver_cnic');
                if (cnicInput && !cnicInput.value) cnicInput.value = found.cnic || '';
                const mobInput = document.getElementById('dc_driver_mobile');
                if (mobInput && !mobInput.value) mobInput.value = found.mobile || '';
                const vehInput = document.getElementById('dc_vehicle_desc');
                if (vehInput && found.vehicle_desc && !vehInput.value) vehInput.value = found.vehicle_desc;
            }
            if (val.trim()) {
                this.renderDriverSuggestions(val);
            } else {
                const suggBox = document.getElementById('dc_driver_suggestions');
                if (suggBox) suggBox.style.display = 'none';
            }
        },

        showDriverSuggestions: function(all = false) {
            const nameInput = document.getElementById('dc_driver_name');
            const val = nameInput ? nameInput.value : '';
            this.renderDriverSuggestions(all ? '' : val);
        },

        toggleDriverSuggestions: function() {
            const suggBox = document.getElementById('dc_driver_suggestions');
            if (!suggBox) return;
            if (suggBox.style.display === 'block') {
                suggBox.style.display = 'none';
            } else {
                this.renderDriverSuggestions('');
                const nameInput = document.getElementById('dc_driver_name');
                if (nameInput) nameInput.focus();
            }
        },

        onDriverSelect: function(driverId) {
            if (!driverId) {
                const nameInput = document.getElementById('dc_driver_name');
                if (nameInput) nameInput.value = '';
                return;
            }
            const d = (this.data.drivers || []).find(item => item.id == driverId);
            if (d) {
                this.pickDriver(d);
            }
        },

        manageDrivers: function() {
            const openPopup = typeof window.openSecondaryModularPopup === 'function' ? window.openSecondaryModularPopup : window.openModularPopup;
            if (typeof openPopup === 'function') {
                openPopup('Navigation/Maintain/drivers.html', 'fa-id-card', 'Drivers', () => {
                    if (typeof window.loadDriversForMaintenance === 'function') {
                        window.loadDriversForMaintenance();
                    }
                }, 'Drivers', false, false);
            } else if (typeof window.loadView === 'function') {
                window.loadView('Navigation/Maintain/drivers.html');
            }
        },

        setupEventListeners: function() {
            const container = document.getElementById('deliveryChallanContainer');
            
            // Customer search
            const custInput = document.getElementById('dc_cust_code');
            custInput.addEventListener('input', (e) => this.handleCustomerSearch(e.target.value));
            custInput.addEventListener('keydown', (e) => this.handleCustomerKey(e));
            custInput.addEventListener('blur', () => setTimeout(() => document.getElementById('dc_cust_results').style.display = 'none', 300));

            // Grid event delegation
            const gridBody = document.querySelector('#dc_grid tbody');
            gridBody.addEventListener('input', (e) => {
                const row = e.target.closest('tr');
                if (e.target.classList.contains('dc-item-code')) {
                    this.handleItemSearch(e.target);
                }
                if (e.target.classList.contains('dc-packing')) {
                    e.target.dataset.originalValue = e.target.value.replace(/,/g, '').trim();
                }
                this.calculateRowQuantity(row);
                this.calculateTotals();
            });

            gridBody.addEventListener('focusin', (e) => {
                if (e.target.tagName === 'INPUT' && !e.target.readOnly) {
                    e.target.select();
                }
                if (e.target.classList.contains('dc-item-code')) {
                    this.handleItemSearch(e.target);
                }
            });

            gridBody.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('dc-item-code')) {
                    setTimeout(() => {
                        const results = document.getElementById('dc_item_results');
                        if (results) results.style.display = 'none';
                    }, 200);
                }
            });

            gridBody.addEventListener('click', (e) => {
                // Row selector click -> select/deselect row
                const selector = e.target.closest('.dc-row-selector');
                if (selector) {
                    const tr = selector.closest('tr');
                    const isSelected = tr.classList.contains('dc-selected-row');
                    document.querySelectorAll('#dc_grid tbody tr').forEach((r, i) => {
                        r.classList.remove('dc-selected-row');
                        const sel = r.querySelector('.dc-row-selector');
                        if (sel) sel.innerHTML = i + 1;
                    });
                    if (!isSelected) {
                        tr.classList.add('dc-selected-row');
                        selector.innerHTML = '&#9658;';
                    }
                    return;
                }
                if (e.target.classList.contains('dc-item-code')) {
                    this.handleItemSearch(e.target);
                }
            });

            gridBody.addEventListener('keydown', (e) => {
                if (e.target.classList.contains('dc-grid-input')) {
                    this.handleGridNavigation(e);
                }
            });

            // Global Ctrl+S
            container.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.saveChallan();
                }
            });

            // Delete key -> remove selected row
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Delete' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    const selectedRow = document.querySelector('#dc_grid tbody tr.dc-selected-row');
                    if (selectedRow) {
                        const results = document.getElementById('dc_item_results');
                        if (results && selectedRow.contains(results)) {
                            results.style.display = 'none';
                            document.getElementById('deliveryChallanContainer').appendChild(results);
                        }
                        selectedRow.remove();
                        this.reindexRows();
                        this.calculateTotals();
                    }
                }
            });

            // Click outside grid -> clear selection
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#dc_grid tbody')) {
                    document.querySelectorAll('#dc_grid tbody tr').forEach((r, i) => {
                        r.classList.remove('dc-selected-row');
                        const sel = r.querySelector('.dc-row-selector');
                        if (sel) sel.innerHTML = i + 1;
                    });
                }
            });

            // Cancellation listener
            document.getElementById('dc_is_cancelled').addEventListener('change', () => this.updateCancellationUI());

            // Driver suggestions outside click & blur
            const drvInput = document.getElementById('dc_driver_name');
            if (drvInput) {
                drvInput.addEventListener('blur', () => {
                    setTimeout(() => {
                        const results = document.getElementById('dc_driver_suggestions');
                        if (results) results.style.display = 'none';
                    }, 250);
                });
            }
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#dc_driver_name') && !e.target.closest('#dc_driver_dropdown_toggle') && !e.target.closest('#dc_driver_suggestions')) {
                    const results = document.getElementById('dc_driver_suggestions');
                    if (results) results.style.display = 'none';
                }
            });
        },

        handleCustomerSearch: function(val) {
            const results = document.getElementById('dc_cust_results');
            if (!val) { results.style.display = 'none'; return; }

            const filtered = this.data.customers.filter(c => 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.code.toLowerCase(), val.toLowerCase()) : c.code.toLowerCase().includes(val.toLowerCase())) || 
                (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(c.name.toLowerCase(), val.toLowerCase()) : c.name.toLowerCase().includes(val.toLowerCase()))
            ).slice(0, 10);

            if (filtered.length > 0) {
                this.data.suggestIndex = -1;
                results.innerHTML = filtered.map((c, i) => 
                    `<div class="so-suggest-item" data-index="${i}" onmousedown="window.DeliveryChallanModule.selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                        <strong>${c.code}</strong> - ${c.name}
                    </div>`).join('');
                results.style.display = 'block';
            } else {
                results.style.display = 'none';
            }
        },

        handleCustomerKey: function(e) {
            const items = document.querySelectorAll('#dc_cust_results .so-suggest-item');
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
                // Instead of click(), call selectCustomer directly to be safe
                const c = this.data.customers.find(x => x.code === items[this.data.suggestIndex].querySelector('strong').innerText);
                if (c) this.selectCustomer(c);
            }
        },

        handleItemKey: function(e) {
            const results = document.getElementById('dc_item_results');
            if (results.style.display === 'none') return false;

            const items = results.querySelectorAll('.so-suggest-item');
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
            } else if (e.key === 'Enter' && this.data.suggestIndex > -1) {
                e.preventDefault();
                // Trigger the mousedown/click logic manually
                const code = items[this.data.suggestIndex].querySelector('strong').innerText;
                const item = this.data.inventoryItems.find(x => x.item_code === code);
                if (item) this.selectItem(item);
                return true;
            }
            return false;
        },

        selectCustomer: function(c) {
            document.getElementById('dc_cust_code').value = c.code;
            document.getElementById('dc_cust_name').value = c.name;
            document.getElementById('dc_cust_address').value = c.address || '';
            document.getElementById('dc_cust_phone').value = c.telephone || '';
            document.getElementById('dc_cust_results').style.display = 'none';
            // Focus PO No
            document.getElementById('dc_po_no').focus();
        },

        handleItemSearch: function(input) {
            const val = input.value;
            const results = document.getElementById('dc_item_results');
            const query = val.trim().toLowerCase();
            let filtered = this.data.inventoryItems;
            if (query) {
                filtered = filtered.filter(item => 
                    (item.item_code && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(item.item_code.toLowerCase(), query) : item.item_code.toLowerCase().includes(query))) || 
                    (item.item_name && (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(item.item_name.toLowerCase(), query) : item.item_name.toLowerCase().includes(query)))
                );
            }
            const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
            filtered = filtered.slice(0, maxLimit);

            if (filtered.length > 0) {
                const row = input.closest('tr');
                this.data.activeRowIndex = parseInt(row.dataset.index);
                this.data.suggestIndex = -1;
                
                results.innerHTML = filtered.map((item, i) => 
                    `<div class="so-suggest-item" data-index="${i}" onmousedown="window.DeliveryChallanModule.selectItem(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="padding: 5px 8px; cursor: pointer; font-size: 11.5px; border-bottom: 1px solid #f1f5f9;">
                        <strong>${item.item_code}</strong> - ${item.item_name} (${item.unit})
                    </div>`).join('');
                
                results.style.display = 'block';
                if (typeof window.positionGridDropdown === 'function') {
                    window.positionGridDropdown(results, input);
                } else {
                    results.style.width = '650px';
                    results.style.zIndex = '9999';
                    input.closest('td').appendChild(results);
                }
            } else {
                results.style.display = 'none';
            }
        },

        selectItem: function(item) {
            const row = document.querySelector(`#dc_grid tbody tr[data-index="${this.data.activeRowIndex}"]`);
            if (row) {
                const codeInput = row.querySelector('.dc-item-code');
                codeInput.value = item.item_code;
                codeInput.dataset.id = item.id;
                codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                codeInput.dataset.hsCode = item.hs_code || '';
                
                row.querySelector('.dc-desc').value = item.item_name;
                row.querySelector('.dc-unit').value = item.unit;
                
                document.getElementById('dc_item_results').style.display = 'none';
                
                this.calculateRowQuantity(row);
                this.calculateTotals();
                
                row.querySelector('.dc-pieces').focus();
            }
        },

        calculateRowQuantity: function(row) {
            if (!row) return;
            const codeInput = row.querySelector('.dc-item-code');
            const piecesInput = row.querySelector('.dc-pieces');
            const qtyInput = row.querySelector('.dc-qty');
            if (!codeInput || !piecesInput || !qtyInput) return;

            const factor = parseFloat(codeInput.dataset.qtyPerPiece) || 0;
            const pieces = parseFloat(piecesInput.value) || 0;
            
            if (pieces > 0 && factor > 0) {
                qtyInput.value = (pieces * factor).toFixed(2);
            }
        },

        updateSuggestHighlight: function(items) {
            items.forEach((item, i) => {
                if (i === this.data.suggestIndex) item.classList.add('active');
                else item.classList.remove('active');
            });
            if (this.data.suggestIndex > -1) {
                items[this.data.suggestIndex].scrollIntoView({ block: 'nearest' });
            }
        },

        handleGridNavigation: function(e) {
            const input = e.target;
            const row = input.closest('tr');
            const rows = Array.from(document.querySelectorAll('#dc_grid tbody tr'));
            const colIndex = input.closest('td').cellIndex;
            const rowIndex = rows.indexOf(row);
            const gridBody = document.querySelector('#dc_grid tbody');
            const suggest = document.getElementById('dc_item_results');

            if (input.classList.contains('dc-item-code')) {
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
                                const newRows = document.querySelectorAll('#dc_grid tbody tr');
                                const firstInput = newRows[newRows.length - 1].querySelector('.dc-item-code');
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
            document.querySelectorAll('#deliveryChallanContainer .dc-input').forEach(el => {
                if (el.tagName === 'SELECT') el.selectedIndex = 0;
                else if (el.type !== 'checkbox') el.value = '';
            });

            // Clear conversion status
            document.getElementById('dc_converted_ogp_text').style.display = 'none';
            document.getElementById('dc_converted_invtax_text').style.display = 'none';
            document.getElementById('dc_converted_invnontax_text').style.display = 'none';

            document.getElementById('dc_date').value = new Date().toISOString().split('T')[0];
            document.getElementById('dc_is_cancelled').checked = false;
            
            const isStnCb = document.getElementById('dc_is_stn');
            if (isStnCb) {
                isStnCb.checked = false;
                this.toggleStnUI();
            }
            const cnicInput = document.getElementById('dc_driver_cnic');
            if (cnicInput) cnicInput.value = '';
            const mobInput = document.getElementById('dc_driver_mobile');
            if (mobInput) mobInput.value = '';
            const drvSelect = document.getElementById('dc_driver_select');
            if (drvSelect) drvSelect.value = '';
            const drvName = document.getElementById('dc_driver_name');
            if (drvName) drvName.value = '';
            const stnInput = document.getElementById('dc_stn_no');
            if (stnInput) stnInput.value = '';

            // Set current time
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            document.getElementById('dc_time_of_supply').value = timeStr;

            if (full || !document.getElementById('dc_sn').value) {
                try {
                    const res = await fetch(`api/delivery_challan.php?action=get_next_serial_no&company_id=${this.getCompanyId()}`);
                    const text = await res.text();
                    try {
                        const data = JSON.parse(text);
                        document.getElementById('dc_sn').value = data.next_no || data.next_sn || 1;
                    } catch (e) {
                        console.error("DEBUG - Server returned invalid JSON:\n\n" + text.substring(0, 200));
                        document.getElementById('dc_sn').value = 1;
                    }
                } catch(e) {
                    console.error("DEBUG - Network Error: " + e.message);
                    document.getElementById('dc_sn').value = 1;
                }
            }

            // Default Main Store
            const locSelect = document.getElementById('dc_location_id');
            if (locSelect && this.data.locations && this.data.locations.length > 0) {
                const mainStore = this.data.locations.find(l => l.name.toLowerCase().includes('main store'));
                if (mainStore) locSelect.value = mainStore.id;
            }

            this.renderGrid();
            this.calculateTotals();
            this.updateCancellationUI();
        },

        renderGrid: function() {
            const tbody = document.querySelector('#dc_grid tbody');
            tbody.innerHTML = '';
            for (let i = 0; i < this.data.gridRows; i++) {
                this.addRow(i + 1);
            }
        },

        addRow: function(index) {
            const tbody = document.querySelector('#dc_grid tbody');
            const tr = document.createElement('tr');
            tr.dataset.index = index - 1;
            tr.innerHTML = `
                <td class="dc-row-selector" style="border:1px solid #cbd5e0; text-align:center; font-size:11px; color:#333; cursor:pointer; user-select:none; background:#f8f8f8; width:20px;">${index}</td>
                <td class="dc-grid-cell"><input type="text" class="dc-grid-input dc-item-code" autocomplete="off"></td>
                <td class="dc-grid-cell"><input type="text" class="dc-grid-input dc-desc" autocomplete="off"></td>
                <td class="dc-grid-cell"><input type="text" class="dc-grid-input dc-pieces num" autocomplete="off"></td>
                <td class="dc-grid-cell"><input type="text" class="dc-grid-input dc-qty num" autocomplete="off"></td>
                <td class="dc-grid-cell"><input type="text" class="dc-grid-input dc-unit" autocomplete="off"></td>
                <td class="dc-grid-cell"><input type="text" class="dc-grid-input dc-packing" autocomplete="off"></td>
            `;
            tbody.appendChild(tr);
        },

        reindexRows: function() {
            document.querySelectorAll('#dc_grid tbody tr').forEach((tr, i) => {
                tr.dataset.index = i;
                const sel = tr.querySelector('.dc-row-selector');
                if (sel) sel.innerHTML = i + 1;
            });
        },

        calculateTotals: function() {
            let tPieces = 0, tQty = 0, tValue = 0;
            const isStn = document.getElementById('dc_is_stn') ? document.getElementById('dc_is_stn').checked : false;
            document.querySelectorAll('#dc_grid tbody tr').forEach(tr => {
                // Ensure row quantity is calculated first
                this.calculateRowQuantity(tr);

                tPieces += parseFloat(tr.querySelector('.dc-pieces').value) || 0;
                tQty += parseFloat(tr.querySelector('.dc-qty').value) || 0;

                const packingInput = tr.querySelector('.dc-packing');
                if (packingInput) {
                    const rawVal = (packingInput.value || '').replace(/,/g, '').trim();
                    const numVal = parseFloat(rawVal) || 0;
                    tValue += numVal;
                }
            });
            document.getElementById('dc_total_pieces').value = tPieces.toFixed(2);
            document.getElementById('dc_total_qty').value = tQty.toFixed(2);
            const totalValInput = document.getElementById('dc_total_value');
            if (totalValInput) {
                totalValInput.value = isStn ? tValue.toFixed(2) : (tValue > 0 ? tValue.toFixed(2) : '0.00');
            }
        },

        getCompanyId: function() {
            return JSON.parse(localStorage.getItem('softifyx_session') || '{}').company_id || 1;
        },

        saveChallan: async function(skipReset = false) {
            const dNameInput = document.getElementById('dc_driver_name');
            let dName = dNameInput ? dNameInput.value.trim() : '';
            if (!dName) {
                const drvSelect = document.getElementById('dc_driver_select');
                if (drvSelect && drvSelect.selectedIndex > 0) {
                    const foundDrv = (this.data.drivers || []).find(d => d.id == drvSelect.value);
                    if (foundDrv) dName = foundDrv.name;
                    else dName = drvSelect.options[drvSelect.selectedIndex].text;
                }
            }

            const data = {
                id: this.data.currentId,
                serial_no: document.getElementById('dc_sn').value,
                date: document.getElementById('dc_date').value,
                customer_coa_id: this.data.customers.find(c => c.code === document.getElementById('dc_cust_code').value)?.id,
                customer_address: document.getElementById('dc_cust_address').value,
                customer_telephone: document.getElementById('dc_cust_phone').value,
                purchase_order_no: document.getElementById('dc_po_no').value,
                purchase_order_date: document.getElementById('dc_po_date').value,
                job_id: document.getElementById('dc_job_id').value,
                inventory_location_id: document.getElementById('dc_location_id').value,
                vehicle_description: document.getElementById('dc_vehicle_desc').value,
                driver_name: dName,
                time_of_supply: document.getElementById('dc_time_of_supply').value,
                remarks: document.getElementById('dc_remarks').value,
                total_pieces: document.getElementById('dc_total_pieces').value,
                total_qty: document.getElementById('dc_total_qty').value,
                total_value: document.getElementById('dc_total_value') ? document.getElementById('dc_total_value').value : '0.00',
                is_cancelled: document.getElementById('dc_is_cancelled').checked,
                is_stn: document.getElementById('dc_is_stn') ? (document.getElementById('dc_is_stn').checked ? 1 : 0) : 0,
                driver_cnic: document.getElementById('dc_driver_cnic') ? document.getElementById('dc_driver_cnic').value : '',
                driver_mobile: document.getElementById('dc_driver_mobile') ? document.getElementById('dc_driver_mobile').value : '',
                stn_no: document.getElementById('dc_stn_no') ? document.getElementById('dc_stn_no').value : '',
                items: []
            };

            if (!data.customer_coa_id) { alert("Please select a valid customer."); return; }

            document.querySelectorAll('#dc_grid tbody tr').forEach(tr => {
                const codeInput = tr.querySelector('.dc-item-code');
                const itemId = codeInput ? codeInput.dataset.id : null;
                if (itemId) {
                    data.items.push({
                        item_id: itemId,
                        pieces: tr.querySelector('.dc-pieces').value || 0,
                        qty: tr.querySelector('.dc-qty').value || 0,
                        packing_detail: tr.querySelector('.dc-packing').value || ''
                    });
                }
            });

            if (data.items.length === 0) { alert("Please add at least one item."); return; }

            try {
                const res = await fetch('api/delivery_challan.php?action=save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.status === 'success') {
                    this.data.currentId = result.id;
                    if (!skipReset) {
                        alert("Delivery Challan saved successfully!");
                        this.resetForm(true);
                    }
                    return true;
                } else {
                    alert("Error: " + result.error);
                    return false;
                }
            } catch (err) { console.error(err); alert("Failed to save."); return false; }
        },

        navigateBySN: async function(sn, dir = '') {
            try {
                let url = `api/delivery_challan.php?action=fetch&sn=${sn}`;
                if (dir && (dir === 'next' || dir === 'prev')) {
                    url += `&dir=${dir}`;
                }
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    this.fillForm(data);
                } else {
                    if (dir === 'next' || dir === 'last') {
                        this.showToast('You are on the last record');
                    } else if (dir === 'prev') {
                        this.showToast('You are on the first record');
                    } else {
                        alert("Challan not found.");
                        this.resetForm(true);
                    }
                }
            } catch (err) { console.error(err); }
        },

        fillForm: function(data) {
            this.data.currentId = data.id;
            document.getElementById('dc_sn').value = data.serial_no;
            document.getElementById('dc_date').value = data.date;
            
            const cust = this.data.customers.find(c => c.id == data.customer_coa_id);
            if (cust) {
                this.selectCustomer(cust);
                if (data.customer_address) document.getElementById('dc_cust_address').value = data.customer_address;
                if (data.customer_telephone) document.getElementById('dc_cust_phone').value = data.customer_telephone;
            }

            document.getElementById('dc_po_no').value = data.purchase_order_no || '';
            document.getElementById('dc_po_date').value = data.purchase_order_date || '';
            document.getElementById('dc_job_id').value = data.job_id || '';
            document.getElementById('dc_location_id').value = data.inventory_location_id || '';
            document.getElementById('dc_vehicle_desc').value = data.vehicle_description || '';
            document.getElementById('dc_driver_name').value = data.driver_name || '';
            document.getElementById('dc_time_of_supply').value = data.time_of_supply || '';
            document.getElementById('dc_remarks').value = data.remarks || '';
            document.getElementById('dc_is_cancelled').checked = parseInt(data.is_cancelled) === 1;
            
            const isStnCb = document.getElementById('dc_is_stn');
            if (isStnCb) {
                isStnCb.checked = parseInt(data.is_stn) === 1;
                this.toggleStnUI();
            }
            const cnicInput = document.getElementById('dc_driver_cnic');
            if (cnicInput) {
                cnicInput.value = data.driver_cnic || '';
            }
            const mobInput = document.getElementById('dc_driver_mobile');
            if (mobInput) {
                mobInput.value = data.driver_mobile || '';
            }

            if (document.getElementById('dc_driver_name')) {
                document.getElementById('dc_driver_name').value = data.driver_name || '';
            }
            const drvSelect = document.getElementById('dc_driver_select');
            if (drvSelect) {
                let matched = false;
                const dName = (data.driver_name || '').trim().toLowerCase();
                for (let opt of drvSelect.options) {
                    if (dName && opt.text.toLowerCase().includes(dName)) {
                        drvSelect.value = opt.value;
                        matched = true;
                        break;
                    }
                }
                if (!matched) drvSelect.value = '';
            }

            const stnInput = document.getElementById('dc_stn_no');
            if (stnInput) {
                stnInput.value = data.stn_no || '';
            }
            
            // Check conversion status
            if (data.converted_ogp_no) {
                document.getElementById('dc_converted_ogp_no').innerText = data.converted_ogp_no;
                document.getElementById('dc_converted_ogp_text').style.display = 'block';
            } else {
                document.getElementById('dc_converted_ogp_text').style.display = 'none';
            }

            if (data.converted_invtax_no) {
                document.getElementById('dc_converted_invtax_no').innerText = data.converted_invtax_no;
                document.getElementById('dc_converted_invtax_text').style.display = 'block';
            } else {
                document.getElementById('dc_converted_invtax_text').style.display = 'none';
            }

            if (data.converted_invnontax_no) {
                document.getElementById('dc_converted_invnontax_no').innerText = data.converted_invnontax_no;
                document.getElementById('dc_converted_invnontax_text').style.display = 'block';
            } else {
                document.getElementById('dc_converted_invnontax_text').style.display = 'none';
            }

            const tbody = document.querySelector('#dc_grid tbody');
            tbody.innerHTML = '';
            data.items.forEach((item, i) => {
                this.addRow(i + 1);
                const row = tbody.lastElementChild;
                const codeInput = row.querySelector('.dc-item-code');
                codeInput.value = item.item_code;
                codeInput.dataset.id = item.item_id;
                codeInput.dataset.qtyPerPiece = item.qty_per_piece || 0;
                codeInput.dataset.hsCode = item.hs_code || '';
                
                row.querySelector('.dc-desc').value = item.item_name;
                row.querySelector('.dc-pieces').value = item.pieces;
                row.querySelector('.dc-qty').value = item.qty;
                const pInput = row.querySelector('.dc-packing');
                if (pInput) {
                    pInput.value = item.packing_detail || '';
                    pInput.dataset.originalValue = item.packing_detail || '';
                }
            });

            for (let i = data.items.length; i < this.data.gridRows; i++) {
                this.addRow(i + 1);
            }

            this.calculateTotals();
            this.updateCancellationUI();
        },

        updateCancellationUI: function() {
            const isCancelled = document.getElementById('dc_is_cancelled').checked;
            const stamp = document.getElementById('dc_cancelled_stamp');
            const label = document.getElementById('dc_cancel_label');
            
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

        toggleStnUI: async function() {
            const isStn = document.getElementById('dc_is_stn') ? document.getElementById('dc_is_stn').checked : false;
            const cnicContainer = document.getElementById('dc_cnic_container');
            const cnicLabel = document.getElementById('dc_cnic_label');
            if (cnicContainer) {
                cnicContainer.style.setProperty('display', isStn ? 'flex' : 'none', 'important');
            }
            if (cnicLabel) {
                cnicLabel.style.setProperty('display', isStn ? 'flex' : 'none', 'important');
            }
            
            const stnFields = document.querySelectorAll('.dc-stn-field');
            stnFields.forEach(f => {
                if (f.id === 'dc_cnic_container' || f.id === 'dc_cnic_label') return;
                f.style.display = isStn ? 'block' : 'none';
            });
            
            const packingHeader = document.getElementById('dc_packing_header');
            if (packingHeader) {
                if (isStn) {
                    packingHeader.innerHTML = `Value at Cost (Rs.) <i class="fas fa-percent" style="font-size: 8px; color: #0284c7; margin-left: 2px;" title="Click to deduct percentage discount"></i>`;
                    packingHeader.style.cursor = 'pointer';
                    packingHeader.style.background = '#e0f2fe';
                    packingHeader.title = 'Click to deduct percentage discount from all row values';
                } else {
                    packingHeader.innerText = 'Packing Detail';
                    packingHeader.style.cursor = 'default';
                    packingHeader.style.background = '';
                    packingHeader.title = '';
                }
            }
            
            const stnInput = document.getElementById('dc_stn_no');
            if (isStn && stnInput && !stnInput.value) {
                try {
                    const date = document.getElementById('dc_date').value || new Date().toISOString().split('T')[0];
                    const res = await fetch(`api/delivery_challan.php?action=get_next_stn_no&date=${date}`);
                    if (res.ok) {
                        const data = await res.json();
                        stnInput.value = data.stn_no || '';
                    }
                } catch(e) {}
            }

            this.calculateTotals();
        },

        onPackingHeaderClick: function() {
            const isStn = document.getElementById('dc_is_stn') ? document.getElementById('dc_is_stn').checked : false;
            if (isStn) {
                this.openValueDiscountModal();
            }
        },

        openValueDiscountModal: function() {
            const modal = document.getElementById('dc_discount_modal');
            if (modal) {
                modal.style.display = 'flex';
                const input = document.getElementById('dc_discount_percentage');
                if (input) {
                    input.value = '';
                    setTimeout(() => {
                        input.focus();
                        input.select();
                    }, 50);
                }
            }
        },

        closeValueDiscountModal: function() {
            const modal = document.getElementById('dc_discount_modal');
            if (modal) modal.style.display = 'none';
        },

        applyValueDiscount: function() {
            const pctInput = document.getElementById('dc_discount_percentage');
            const pct = parseFloat(pctInput ? pctInput.value : 0);
            if (isNaN(pct) || pct < 0 || pct > 100) {
                alert('Please enter a valid percentage between 0 and 100.');
                if (pctInput) pctInput.focus();
                return;
            }

            let appliedCount = 0;
            document.querySelectorAll('#dc_grid tbody tr').forEach(tr => {
                const packingInput = tr.querySelector('.dc-packing');
                if (packingInput && packingInput.value) {
                    // If originalValue is not yet stored, store it now
                    if (!packingInput.dataset.originalValue) {
                        packingInput.dataset.originalValue = packingInput.value.replace(/,/g, '').trim();
                    }
                    const origVal = parseFloat(packingInput.dataset.originalValue);
                    if (!isNaN(origVal) && origVal > 0) {
                        const deductedVal = origVal * (1 - (pct / 100));
                        packingInput.value = deductedVal.toFixed(2);
                        appliedCount++;
                    }
                }
            });

            this.closeValueDiscountModal();
            this.calculateTotals();
        },

        restoreOriginalValues: function() {
            document.querySelectorAll('#dc_grid tbody tr').forEach(tr => {
                const packingInput = tr.querySelector('.dc-packing');
                if (packingInput && packingInput.dataset.originalValue) {
                    const orig = parseFloat(packingInput.dataset.originalValue);
                    packingInput.value = !isNaN(orig) ? orig.toFixed(2) : packingInput.dataset.originalValue;
                }
            });
            this.closeValueDiscountModal();
            this.calculateTotals();
        },

        fetchQuotationData: async function(qSn) {
            if (!qSn) return;
            try {
                const coId = this.getCompanyId();
                const res = await fetch(`api/quotation.php?action=get_quotation&serial_no=${qSn}&company_id=${coId}`);
                const q = await res.json();
                
                if (!q || !q.id) {
                    alert(`Quotation #${qSn} not found in database.`);
                    return;
                }
                // Only copy SO remark if it's explicitly typed there, skip auto-converted text
                if (q.remarks && !q.remarks.startsWith('Converted from')) {
                    document.getElementById('dc_remarks').value = q.remarks;
                } else {
                    document.getElementById('dc_remarks').value = '';
                }
                
                if (q.customer_coa_id) {
                    const party = this.data.customers.find(p => p.id == q.customer_coa_id || p.code === q.customer_code);
                    if (party) {
                        this.selectCustomer(party);
                    } else {
                        const custCodeEl = document.getElementById('dc_cust_code');
                        if (custCodeEl) custCodeEl.value = q.customer_code || '';
                        const custNameEl = document.getElementById('dc_cust_name');
                        if (custNameEl) custNameEl.value = q.customer_name || '';
                    }
                    const custAddrEl = document.getElementById('dc_cust_address');
                    if (custAddrEl && q.customer_address) custAddrEl.value = q.customer_address;
                    const custPhoneEl = document.getElementById('dc_cust_phone');
                    if (custPhoneEl && q.customer_telephone) custPhoneEl.value = q.customer_telephone;
                }
                
                const body = document.querySelector('#dc_grid tbody');
                if (body) {
                    body.innerHTML = '';
                    if (q.items && Array.isArray(q.items)) {
                        q.items.forEach((item, idx) => {
                            this.addRow(idx + 1);
                            const row = body.lastElementChild;
                            if (row) {
                                row.querySelector('.dc-item-code').value = item.item_code || '';
                                row.querySelector('.dc-item-code').dataset.hsCode = item.hs_code || '';
                                row.querySelector('.dc-item-code').dataset.id = item.item_coa_id || '';
                                row.querySelector('.dc-desc').value = item.item_name || '';
                                row.querySelector('.dc-pieces').value = item.pieces || '';
                                row.querySelector('.dc-qty').value = item.qty || '';
                                row.querySelector('.dc-unit').value = item.unit || 'Pcs';
                                row.dataset.qtyPerPiece = item.qty_per_piece || 0;
                            }
                        });
                        for (let i = q.items.length; i < this.data.gridRows; i++) {
                            this.addRow(i + 1);
                        }
                    } else {
                        for (let i = 0; i < this.data.gridRows; i++) this.addRow(i + 1);
                    }
                    this.calculateTotals();
                }
                
            } catch (err) {
                console.error("Fetch Quotation Error:", err);
            }
        },

        fetchSaleInvoiceData: async function(siSn, isTaxMode = false) {
            if (!siSn) return;
            try {
                const coId = this.getCompanyId();
                const taxParam = isTaxMode ? 1 : 0;
                const res = await fetch(`api/sale_invoice.php?action=get_invoice&serial_no=${siSn}&is_tax=${taxParam}&company_id=${coId}`);
                const si = await res.json();

                if (!si || !si.id) {
                    alert(`Sale Invoice #${siSn} not found in database.`);
                    return;
                }

                if (si.remarks && !si.remarks.startsWith('Converted from')) {
                    document.getElementById('dc_remarks').value = si.remarks;
                } else {
                    document.getElementById('dc_remarks').value = '';
                }

                // Auto-check STN when converting from invoice
                const stnCb = document.getElementById('dc_is_stn');
                if (stnCb) {
                    stnCb.checked = true;
                    await this.toggleStnUI();
                }

                if (si.customer) {
                    const party = this.data.customers.find(p => p.id == si.customer.coa_id || p.code === si.customer.code);
                    if (party) {
                        this.selectCustomer(party);
                    } else {
                        const custCodeEl = document.getElementById('dc_cust_code');
                        if (custCodeEl) custCodeEl.value = si.customer.code || '';
                        const custNameEl = document.getElementById('dc_cust_name');
                        if (custNameEl) custNameEl.value = si.customer.name || '';
                    }
                    const custAddrEl = document.getElementById('dc_cust_address');
                    if (custAddrEl && si.customer.address) custAddrEl.value = si.customer.address;
                    const custPhoneEl = document.getElementById('dc_cust_phone');
                    if (custPhoneEl && si.customer.telephone) custPhoneEl.value = si.customer.telephone;
                }

                const body = document.querySelector('#dc_grid tbody');
                if (body) {
                    body.innerHTML = '';
                    if (si.items && Array.isArray(si.items)) {
                        si.items.forEach((item, idx) => {
                            this.addRow(idx + 1);
                            const row = body.lastElementChild;
                            if (row) {
                                row.querySelector('.dc-item-code').value = item.item_code || '';
                                row.querySelector('.dc-item-code').dataset.hsCode = item.hs_code || '';
                                row.querySelector('.dc-item-code').dataset.id = item.item_coa_id || '';
                                row.querySelector('.dc-desc').value = item.item_name || '';
                                row.querySelector('.dc-pieces').value = item.pieces || '';
                                row.querySelector('.dc-qty').value = item.quantity || '';
                                row.querySelector('.dc-unit').value = item.unit || 'Pcs';
                                
                                // User Requirement: Assign Sale Invoice (Non-Tax) net amount to Value at Cost (Rs.)
                                const netVal = (item.net_amount !== undefined && item.net_amount !== null && item.net_amount !== '') 
                                    ? parseFloat(item.net_amount) 
                                    : (parseFloat(item.gross_amount) || 0);
                                
                                const pInput = row.querySelector('.dc-packing');
                                if (pInput) {
                                    pInput.value = netVal ? netVal.toFixed(2) : '';
                                    pInput.dataset.originalValue = pInput.value;
                                }

                                row.dataset.qtyPerPiece = item.qty_per_piece || 0;
                            }
                        });
                        for (let i = si.items.length; i < this.data.gridRows; i++) {
                            this.addRow(i + 1);
                        }
                    } else {
                        for (let i = 0; i < this.data.gridRows; i++) this.addRow(i + 1);
                    }
                    this.calculateTotals();
                }

            } catch (err) {
                console.error("Fetch Sale Invoice Error:", err);
            }
        },

        fetchSaleOrderData: async function(soSn) {
            if (!soSn) return;
            try {
                const coId = this.getCompanyId();
                const res = await fetch(`api/sale_order.php?action=get_sale_order&serial_no=${soSn}&company_id=${coId}`);
                const so = await res.json();

                if (!so || !so.id) {
                    alert(`Sale Order #${soSn} not found in database.`);
                    return;
                }

                if (so.remarks && !so.remarks.startsWith('Converted from')) {
                    document.getElementById('dc_remarks').value = so.remarks;
                } else {
                    document.getElementById('dc_remarks').value = '';
                }

                if (so.customer_coa_id) {
                    const party = this.data.customers.find(p => p.id == so.customer_coa_id || p.code === so.customer_code);
                    if (party) {
                        this.selectCustomer(party);
                    } else {
                        const custCodeEl = document.getElementById('dc_cust_code');
                        if (custCodeEl) custCodeEl.value = so.customer_code || '';
                        const custNameEl = document.getElementById('dc_cust_name');
                        if (custNameEl) custNameEl.value = so.customer_name || '';
                    }
                    const custAddrEl = document.getElementById('dc_cust_address');
                    if (custAddrEl && so.customer_address) custAddrEl.value = so.customer_address;
                    const custPhoneEl = document.getElementById('dc_cust_phone');
                    if (custPhoneEl && so.customer_telephone) custPhoneEl.value = so.customer_telephone;
                }

                const body = document.querySelector('#dc_grid tbody');
                if (body) {
                    body.innerHTML = '';
                    if (so.items && Array.isArray(so.items)) {
                        so.items.forEach((item, idx) => {
                            this.addRow(idx + 1);
                            const row = body.lastElementChild;
                            if (row) {
                                row.querySelector('.dc-item-code').value = item.item_code || '';
                                row.querySelector('.dc-item-code').dataset.hsCode = item.hs_code || '';
                                row.querySelector('.dc-item-code').dataset.id = item.item_id || '';
                                row.querySelector('.dc-desc').value = item.item_name || '';
                                row.querySelector('.dc-pieces').value = item.pieces || '';
                                row.querySelector('.dc-qty').value = item.qty || '';
                                row.querySelector('.dc-unit').value = item.unit || 'Pcs';
                                row.dataset.qtyPerPiece = item.qty_per_piece || 0;
                            }
                        });
                        for (let i = so.items.length; i < this.data.gridRows; i++) {
                            this.addRow(i + 1);
                        }
                    } else {
                        for (let i = 0; i < this.data.gridRows; i++) this.addRow(i + 1);
                    }
                    this.calculateTotals();
                }

            } catch (err) {
                console.error("Fetch Sale Order Error:", err);
            }
        },

        navigate: async function(dir) {
            let sn = parseInt(document.getElementById('dc_sn').value) || 0;
            if (dir === 'prev' && sn === 0) dir = 'last';

            if (dir === 'last') {
                const res = await fetch(`api/delivery_challan.php?action=get_next_serial_no&company_id=${this.getCompanyId()}`);
                const data = await res.json();
                sn = (data.next_no || data.next_sn || 2) - 1;
                dir = undefined;
            } else if (sn === 0 || dir === 'this') {
                if (dir === 'next') {
                    const res = await fetch(`api/delivery_challan.php?action=get_next_serial_no&company_id=${this.getCompanyId()}`);
                    const data = await res.json();
                    sn = (data.next_no || data.next_sn || 2) - 1;
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
            
            if (sn > 0 || dir) this.navigateBySN(sn, dir);
        },

        updateStnStateIfChecked: async function() {
            if (this.data.currentId) {
                try {
                    const isStn = document.getElementById('dc_is_stn') ? document.getElementById('dc_is_stn').checked : false;
                    const stnNo = document.getElementById('dc_stn_no') ? document.getElementById('dc_stn_no').value : '';
                    const driverCnic = document.getElementById('dc_driver_cnic') ? document.getElementById('dc_driver_cnic').value : '';
                    const driverName = document.getElementById('dc_driver_name') ? document.getElementById('dc_driver_name').value : '';
                    const vehicleDesc = document.getElementById('dc_vehicle_desc') ? document.getElementById('dc_vehicle_desc').value : '';
                    const timeOfSupply = document.getElementById('dc_time_of_supply') ? document.getElementById('dc_time_of_supply').value : '';
                    
                    const fd = new FormData();
                    fd.append('id', this.data.currentId);
                    fd.append('is_stn', isStn ? 1 : 0);
                    fd.append('stn_no', stnNo);
                    fd.append('driver_cnic', driverCnic);
                    fd.append('driver_name', driverName);
                    fd.append('vehicle_description', vehicleDesc);
                    fd.append('time_of_supply', timeOfSupply);
                    
                    await fetch('api/delivery_challan.php?action=update_stn_state', { method: 'POST', body: fd });
                } catch(e) { console.error('Failed to update STN state', e); }
            }
        },

        convertOGP: async function() {
            if (!this.data.currentId) {
                alert("Please save the Delivery Challan first before converting to O.G.P.");
                return;
            }
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;
                
                // Get next OGP serial
                const res = await fetch(`api/outward_gate_passes.php?action=get_next_serial_no&company_id=${companyId}`);
                if (!res.ok) {
                    console.warn("Failed to get next OGP serial, proceeding anyway.");
                } else {
                    const data = await res.json();
                    const nextNo = data.next_no;
                    if (nextNo) {
                        const el = document.getElementById('dc_converted_ogp_no');
                        if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                        const textEl = document.getElementById('dc_converted_ogp_text');
                        if (textEl) textEl.style.display = 'block';
                    }
                }
                
                const dcSnToConvert = document.getElementById('dc_sn').value;
                const saveBtn = document.querySelector('.dc-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.saveChallan();
                    saveBtn.innerText = originalText;
                } else {
                    await this.saveChallan();
                }
                
                // Open OGP
                const openPopup = typeof window.openSecondaryModularPopup === 'function' ? window.openSecondaryModularPopup : window.openModularPopup;
                if (typeof openPopup === 'function') {
                    openPopup('Navigation/Store/outward_gate_passes.html', 'fa-truck-loading', 'Outward Gate Pass', () => {
                        let tries = 0;
                        const checkModule = setInterval(async () => {
                            tries++;
                            if (window.OGPModule && typeof window.OGPModule.init === 'function') {
                                clearInterval(checkModule);
                                await window.OGPModule.init();
                                setTimeout(() => {
                                    if (typeof window.OGPModule.fetchDeliveryChallanData === 'function') {
                                        window.OGPModule.fetchDeliveryChallanData(dcSnToConvert);
                                    }
                                }, 500);
                            } else if (tries > 50) {
                                clearInterval(checkModule);
                            }
                        }, 100);
                    }, 'Outward Gate Pass', true, true);
                }
            } catch (e) {
                console.error("Convert OGP Error:", e);
                alert("Failed to convert to O.G.P.");
            }
        },

        convertInvoice: async function(isTax) {
            if (!this.data.currentId) {
                alert("Please save the Delivery Challan first before converting to Sale Invoice.");
                return;
            }
            
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const companyId = session.company_id || 1;
                
                // Get next Invoice serial
                const isTaxVal = isTax ? 1 : 0;
                const res = await fetch(`api/sale_invoice.php?action=get_next_serial&company_id=${companyId}&is_tax=${isTaxVal}`);
                if (!res.ok) {
                    console.warn("Failed to get next Invoice serial, proceeding anyway.");
                } else {
                    const data = await res.json();
                    const nextNo = data.next_no || data.next_sn;
                    if (nextNo) {
                        if (isTax) {
                            const el = document.getElementById('dc_converted_invtax_no');
                            if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                            const textEl = document.getElementById('dc_converted_invtax_text');
                            if (textEl) textEl.style.display = 'block';
                        } else {
                            const el = document.getElementById('dc_converted_invnontax_no');
                            if (el) { el.innerText = nextNo; el.setAttribute('data-sn', nextNo); }
                            const textEl = document.getElementById('dc_converted_invnontax_text');
                            if (textEl) textEl.style.display = 'block';
                        }
                    }
                }
                
                const dcSnToConvert = document.getElementById('dc_sn').value;
                const saveBtn = document.querySelector('.dc-btn-save');
                if (saveBtn) {
                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Converting...';
                    await this.saveChallan();
                    saveBtn.innerText = originalText;
                } else {
                    await this.saveChallan();
                }
                
                // Open Sale Invoice
                const openPopup = typeof window.openSecondaryModularPopup === 'function' ? window.openSecondaryModularPopup : window.openModularPopup;
                if (typeof openPopup === 'function') {
                    openPopup('Navigation/Sales/sale_invoice.html', 'fa-file-invoice-dollar', 'Sale Invoice', () => {
                        let tries = 0;
                        const checkModule = setInterval(async () => {
                            tries++;
                            if (window.SIModule && typeof window.SIModule.init === 'function') {
                                clearInterval(checkModule);
                                await window.SIModule.init();
                                setTimeout(() => {
                                    if (typeof window.SIModule.fetchDeliveryChallanData === 'function') {
                                        window.SIModule.fetchDeliveryChallanData(dcSnToConvert, isTax);
                                    }
                                }, 500);
                            } else if (tries > 50) {
                                clearInterval(checkModule);
                            }
                        }, 100);
                    }, 'Sale Invoice', true, true);
                }
            } catch (e) {
                console.error("Convert Invoice Error:", e);
                alert("Failed to convert to Sale Invoice.");
            }
        },

        deleteChallan: async function() {
            if (!this.data.currentId) return;
            if (confirm("Are you sure you want to delete this challan?")) {
                await fetch(`api/delivery_challan.php?action=delete&id=${this.data.currentId}`);
                this.resetForm(true);
            }
        },

        printChallan: async function() {
            const saveBtn = document.querySelector('.dc-btn-save');
            const originalText = saveBtn ? saveBtn.innerText : 'Save';
            if (saveBtn) saveBtn.innerText = 'Saving...';
            
            try {
                const saved = await this.saveChallan(true);
                if (saveBtn) saveBtn.innerText = originalText;
                if (!saved) return;

                await this.updateStnStateIfChecked();

            // Get company details
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companies = JSON.parse(localStorage.getItem('softifyx_companies') || '[]');
            const company = companies.find(c => c.id == session.company_id) || {};
            
            let coName = company.name || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
            coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
            coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');
            
            const coAddress = company.address || 'Plot No: 192/8, Road No: L-11, Industrial Estate Gadoon Amazai';
            const coPhone = company.phone || '+923487240256';
            const coEmail = company.email || 'info@seastonepipes.com';
            
            let customLogo = 'assets/logos/logo.png';
            
            // 1. FETCH DIRECTLY FROM DATABASE! This guarantees we have the latest logo and details!
            try {
                const coId = session.company_id || 1;
                const cRes = await fetch('api/admin.php?action=get_company&company_id=' + coId);
                if (cRes.ok) {
                    const cData = await cRes.json();
                    if (cData) {
                        if (cData.logo_data && cData.logo_data.startsWith('data:image')) {
                            customLogo = cData.logo_data;
                        }
                        if (cData.gst) company.gst = cData.gst;
                        if (cData.ntn) company.ntn = cData.ntn;
                        if (cData.strn) company.strn = cData.strn;
                    }
                }
            } catch(e) {
                console.error('Failed to fetch company details from DB', e);
            }
            
            // 2. If DB fetch failed, fallback to local storage
            if (customLogo === 'assets/logos/logo.png') {
                const coNameStr = session.company_name || '';
                let lLogo = coNameStr ? localStorage.getItem(`softifyx_${coNameStr}_logo`) : null;
                
                if (!lLogo && typeof window.getCompanyLogo === 'function') {
                    lLogo = window.getCompanyLogo();
                }
                
                if (!lLogo || !lLogo.startsWith('data:image')) {
                    for (let i = 0; i < localStorage.length; i++) {
                        let k = localStorage.key(i);
                        if (k && k.includes('_logo')) {
                            let val = localStorage.getItem(k);
                            if (val && val.startsWith('data:image')) {
                                lLogo = val;
                                break;
                            }
                        }
                    }
                }
                
                if (lLogo && lLogo.startsWith('data:image')) {
                    customLogo = lLogo;
                }
            }

            const isStn = document.getElementById('dc_is_stn') ? document.getElementById('dc_is_stn').checked : false;
            let stnNo = document.getElementById('dc_stn_no') ? document.getElementById('dc_stn_no').value : '';
            if (isStn && !stnNo) stnNo = 'STN-PENDING';
            let driverCnic = document.getElementById('dc_driver_cnic') ? document.getElementById('dc_driver_cnic').value : '';
            const snVal = document.getElementById('dc_sn').value;

            const sn = snVal;
            const date = document.getElementById('dc_date').value;
            const poNo = document.getElementById('dc_po_no').value;
            const poDate = document.getElementById('dc_po_date').value;
            const custName = document.getElementById('dc_cust_name').value;
            const custCode = document.getElementById('dc_cust_code').value;
            const custObj = this.data.customers.find(c => c.code === custCode);
            const contactPerson = custObj && custObj.contact_person ? custObj.contact_person : '';
            const custAddr = document.getElementById('dc_cust_address').value;
            const custTel = document.getElementById('dc_cust_phone').value;
            const vehicle = document.getElementById('dc_vehicle_desc').value;
            const driver = document.getElementById('dc_driver_name').value;
            const supplyTime = document.getElementById('dc_time_of_supply').value;
            const remarks = document.getElementById('dc_remarks').value;
            const addedBy = document.getElementById('dcFindAddedBy') ? document.getElementById('dcFindAddedBy').value : '';
            
            let totPieces = 0;
            let totQty = 0;

            let itemsHtml = '';
            document.querySelectorAll('#dc_grid tbody tr').forEach((tr, index) => {
                const code = tr.querySelector('.dc-item-code')?.value || '';
                if (!code) return; // Skip empty rows
                
                const desc = tr.querySelector('.dc-desc')?.value || '';
                const pieces = parseFloat(tr.querySelector('.dc-pieces')?.value) || 0;
                const qty = parseFloat(tr.querySelector('.dc-qty')?.value) || 0;
                const unit = tr.querySelector('.dc-unit')?.value || 'Pcs';
                const packingStr = tr.querySelector('.dc-packing')?.value || '';
                
                totPieces += pieces;
                totQty += qty;
                
                itemsHtml += `
                    <tr>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${index + 1}</td>
                        <td style="border:1px solid #000; padding:4px;">${desc}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${pieces}</td>
                        <td style="border:1px solid #000; padding:4px; text-align:center;">${qty.toFixed(2)} ${unit}</td>
                        <td style="border:1px solid #000; padding:4px;">${packingStr}</td>
                    </tr>
                `;
            });
            
            let html = '';
            
            if (isStn) {
                // STN Format
                const coStrn = company.strn || company.gst || '';
                const coNtn = company.ntn || '';
                
                let stnItemsHtml = '';
                let stnTotValue = 0;
                document.querySelectorAll('#dc_grid tbody tr').forEach((tr, index) => {
                    const code = tr.querySelector('.dc-item-code')?.value || '';
                    if (!code) return;
                    const desc = tr.querySelector('.dc-desc')?.value || '';
                    const pieces = parseFloat(tr.querySelector('.dc-pieces')?.value) || 0;
                    const qty = parseFloat(tr.querySelector('.dc-qty')?.value) || 0;
                    const unit = tr.querySelector('.dc-unit')?.value || 'Pcs';
                    const packingStr = tr.querySelector('.dc-packing')?.value || '';
                    const packingVal = parseFloat(packingStr) || 0;
                    stnTotValue += packingVal;
                    
                    const hsCode = tr.querySelector('.dc-item-code')?.dataset?.hsCode || '';
                    
                    stnItemsHtml += `
                        <tr>
                            <td style="border:1px solid #7c98b6; padding:2px; text-align:center;">${index + 1}</td>
                            <td style="border:1px solid #7c98b6; padding:2px;">${desc}</td>
                            <td style="border:1px solid #7c98b6; padding:2px; text-align:center;">${hsCode}</td>
                            <td style="border:1px solid #7c98b6; padding:2px; text-align:center;">${qty.toFixed(2)}</td>
                            <td style="border:1px solid #7c98b6; padding:2px; text-align:center;">${unit}</td>
                            <td style="border:1px solid #7c98b6; padding:2px; text-align:center;">${packingVal ? packingVal.toFixed(2) : ''}</td>
                        </tr>
                    `;
                });

                html = `
                <html>
                <head>
                    <title>STOCK TRANSFER NOTE - ${stnNo}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 10mm 10mm 10mm 10mm; box-sizing: border-box; }
                        
                        /* Header Section */
                        .header-row { display: flex; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 10px; }
                        .logo-col { width: 100px; }
                        .logo-col img { max-width: 90px; max-height: 90px; }
                        .info-col { flex: 1; padding-left: 15px; overflow: hidden; }
                        .info-col h1 { margin: 0 0 4px 0; font-size: 18px; color: #1e3a8a; font-weight: bold; white-space: nowrap; }
                        .info-col p { margin: 2px 0; font-size: 11px; color: #475569; }
                        .tax-col { width: 220px; border-left: 1px solid #cbd5e0; padding-left: 15px; font-weight: bold; font-size: 12px; }
                        .tax-col div { margin-bottom: 4px; display: flex; }
                        .tax-col div span:first-child { width: 50px; }
                        
                        /* Title */
                        .stn-title { color: #000; text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 15px; margin-top: 5px; letter-spacing: 2px; }
                        
                        /* Basic Info */
                        .basic-info { display: grid; grid-template-columns: 160px 1fr; gap: 4px; margin-bottom: 15px; font-weight: bold; font-size: 13px; }
                        .basic-info div { display: flex; }
                        
                        /* Addresses */
                        .address-boxes { display: flex; gap: 15px; margin-bottom: 15px; }
                        .addr-box { flex: 1; border: 1px solid #64748b; border-radius: 4px; padding: 10px; background: #f8fafc; }
                        .addr-box h4 { margin: 0 0 10px 0; color: #1e3a8a; font-size: 13px; border-bottom: 1px solid #cbd5e0; padding-bottom: 5px; }
                        .addr-grid { display: grid; grid-template-columns: 70px 1fr; gap: 6px; font-size: 12px; }
                        .addr-grid span:first-child { font-weight: bold; }
                        
                        /* Grid Table */
                        .stn-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid #7c98b6; }
                        .stn-table th { border: 1px solid #7c98b6; padding: 4px; background: #e2e8f0; font-weight: bold; font-size: 10px; text-align: center; color: #1e3a8a; }
                        .stn-table td { font-size: 11px; }
                        
                        /* Bottom Section */
                        .bottom-section { display: flex; gap: 15px; margin-bottom: 15px; }
                        .box-panel { border: 1px solid #64748b; border-radius: 4px; padding: 10px; background: #f8fafc; }
                        .vehicle-box { flex: 1; }
                        .endorse-box { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; color: #1e3a8a; font-size: 16px; font-weight: bold; flex-direction: column; }
                        .sign-section { display: flex; gap: 15px; }
                        .sign-box { flex: 1; }
                        .sign-grid { display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px; margin-top: 10px; }
                        .sign-grid span:first-child { font-weight: bold; }
                        .sign-line { border-bottom: 1px solid #000; display: inline-block; width: 100%; }
                    </style>
                </head>
                <body>
                    <div class="header-row">
                        <div class="logo-col"><img src="${customLogo}" onerror="this.style.display='none'"></div>
                        <div class="info-col">
                            <h1>${coName}</h1>
                            <p><b>Manufacturers & Distributors</b></p>
                            <p>${coAddress}</p>
                            <p>Phone: ${coPhone} | Email: ${coEmail}</p>
                        </div>
                        <div class="tax-col">
                            <div><span>STRN</span> <span>: ${coStrn}</span></div>
                            <div><span>NTN</span> <span>: ${coNtn}</span></div>
                        </div>
                    </div>
                    
                    <div class="stn-title">STOCK TRANSFER NOTE</div>
                    
                    <div class="basic-info">
                        <div>STN No.</div> <div>: ${stnNo}</div>
                        <div>Date & Time of Dispatch</div> <div>: ${date} &nbsp; ${supplyTime}</div>
                        <div>STRN</div> <div>: ${coStrn}</div>
                    </div>
                    
                    <div class="address-boxes">
                        <div class="addr-box">
                            <h4>1. Dispatching Unit (From)</h4>
                            <div class="addr-grid">
                                <span>Name</span> <span>: ${coName}</span>
                                <span>Address</span> <span>: ${coAddress}</span>
                                <span>STRN</span> <span>: ${coStrn}</span>
                            </div>
                        </div>
                        <div class="addr-box">
                            <h4>2. Receiving Warehouse (To)</h4>
                            <div class="addr-grid">
                                <span>Name</span> <span>: ${custName}</span>
                                <span>Address</span> <span>: ${custAddr}</span>
                                <span>STRN</span> <span>: ${coStrn}</span>
                            </div>
                        </div>
                    </div>
                    
                    <table class="stn-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">Sr. No.</th>
                                <th>Description of Goods</th>
                                <th style="width: 100px;">HS / PCT Code</th>
                                <th style="width: 80px;">Quantity</th>
                                <th style="width: 70px;">Unit</th>
                                <th style="width: 120px;">Value at Cost (Rs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stnItemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="5" style="border:1px solid #7c98b6; padding:8px; text-align:right; font-weight:bold; background:#e2e8f0; color:#1e3a8a;">Total Value at Cost (Rs.)</td>
                                <td style="border:1px solid #7c98b6; padding:8px; text-align:center; font-weight:bold; background:#e2e8f0;">${stnTotValue ? stnTotValue.toFixed(2) : ''}</td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    <div class="bottom-section">
                        <div class="box-panel vehicle-box">
                            <h4 style="margin:0 0 10px 0; color:#1e3a8a; border-bottom:1px solid #cbd5e0; padding-bottom:5px;">Vehicle & Driver Information</h4>
                            <div class="addr-grid">
                                <span>Vehicle No.</span> <span>: ${vehicle}</span>
                                <span>Driver CNIC</span> <span>: ${driverCnic}</span>
                                <span>Driver Name</span> <span>: ${driver}</span>
                            </div>
                        </div>
                        <div class="box-panel endorse-box">
                            <div style="margin-bottom: 5px; align-self: flex-start; font-size: 13px;">Endorsement</div>
                            STOCK TRANSFER &mdash;<br>NOT A TAXABLE SUPPLY
                        </div>
                    </div>
                    
                    <div class="sign-section">
                        <div class="box-panel sign-box">
                            <h4 style="margin:0 0 10px 0; color:#1e3a8a; border-bottom:1px solid #cbd5e0; padding-bottom:5px;">Dispatching Unit Authorization</h4>
                            <div class="sign-grid">
                                <span>Name</span> <span>: ${session.username || 'Administrator'}</span>
                                <span>Designation</span> <span>: Authorized Officer</span>
                                <span>Signature</span> <span class="sign-line"></span>
                                <span>Date</span> <span>: ${date}</span>
                            </div>
                        </div>
                        <div class="box-panel sign-box">
                            <h4 style="margin:0 0 10px 0; color:#1e3a8a; border-bottom:1px solid #cbd5e0; padding-bottom:5px;">Receiving Warehouse Acknowledgement</h4>
                            <div class="sign-grid">
                                <span>Name</span> <span>: ${contactPerson}</span>
                                <span>Designation</span> <span>: Outlet incharge</span>
                                <span>Signature</span> <span class="sign-line"></span>
                                <span>Date</span> <span>: ${date}</span>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
                `;
            } else {
                // Standard Delivery Challan Format
                let headerHtml = `
                    <div class="header">
                        <img src="${customLogo}" alt="Logo" onerror="this.style.display='none'">
                        <div class="header-content">
                            <h2>${coName}</h2>
                            <p>${coAddress} | Phone: ${coPhone}</p>
                            <p>Email: ${coEmail}</p>
                            <h3>DELIVERY CHALLAN</h3>
                        </div>
                    </div>
                    <hr style="border: 0; border-top: 2px solid #000; margin-bottom: 15px;">
                `;

                html = `
                    <html>
                    <head>
                        <title>DELIVERY CHALLAN - ${sn}</title>
                        <style>
                            @page { margin: 0; }
                            body { font-family: Arial, sans-serif; font-size: 12px; margin: 1cm; }
                            .header { display: flex; align-items: center; justify-content: center; position: relative; margin-bottom: 5px; }
                            .header img { position: absolute; left: 0; top: 0; max-width: 80px; max-height: 80px; }
                            .header-content { text-align: center; }
                            .header h2 { margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase; }
                            .header p { margin: 2px 0; font-size: 11px; color: #555; }
                            .header h3 { margin: 8px 0 0 0; font-size: 14px; font-weight: bold; color: #000; }
                            .details-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
                            .details-table td { padding: 4px; vertical-align: top; }
                            .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
                            .grid-table th { border: 1px solid #000; padding: 4px; background: #f0f0f0; text-align: center; }
                            .totals { text-align: right; margin-top: 20px; font-weight: bold; }
                            .footer { margin-top: 40px; font-size: 11px; }
                        </style>
                    </head>
                    <body>
                        ${headerHtml}
                        
                        <table class="details-table">
                            <tr>
                                <td width="50%">
                                    <b>Customer Details:</b><br>
                                    Name: ${custName}<br>
                                    Address: ${custAddr}<br>
                                    Tel: ${custTel}
                                </td>
                                <td width="50%">
                                    <b>Challan Details:</b><br>
                                    Serial No: <b>${sn}</b><br>
                                    Date: ${date}<br>
                                    P.O. No: ${poNo}<br>
                                    P.O. Date: ${poDate}
                                </td>
                            </tr>
                        </table>

                        <table class="grid-table">
                            <thead>
                                <tr>
                                    <th>S.No</th>
                                    <th>Description</th>
                                    <th>Pieces</th>
                                    <th>Quantity</th>
                                    <th>Packing Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th colspan="2" style="text-align:right; border:1px solid #000;">TOTALS:</th>
                                    <th style="border:1px solid #000; text-align:center;">${totPieces}</th>
                                    <th style="border:1px solid #000; text-align:center;">${totQty.toFixed(2)}</th>
                                    <th style="border:1px solid #000;"></th>
                                </tr>
                            </tfoot>
                        </table>

                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <div><b>Time of Supply:</b> ${supplyTime}</div>
                            <div><b>Vehicle Desc:</b> ${vehicle}</div>
                            <div><b>Driver Name:</b> ${driver}</div>
                        </div>

                        <div style="margin-bottom: 10px;">
                            <b>Remarks:</b> ${remarks}
                        </div>
                        
                        <div class="footer" style="margin-top: 40px;">
                            <div style="display: flex; align-items: flex-end; gap: 10px;">
                                <b style="font-style: italic; font-size: 13px;">Authorized Signatures</b>
                                <div style="flex: 1; max-width: 350px; border-bottom: 1px solid #000; margin-bottom: 3px;"></div>
                            </div>
                            <div style="margin-top: 15px; font-style: italic; color: #444; font-size: 12px;">
                                Prepared By: ${addedBy || session.username || 'Administrator'}
                                <br>
                                <span style="font-size: 10px; color: #666;">Printed By: ${session.username || 'Administrator'}</span>
                            </div>
                        </div>
                    </body>
                    </html>
                `;
            }

            let printFrame = document.getElementById('dc_print_frame');
            if (!printFrame) {
                printFrame = document.createElement('iframe');
                printFrame.id = 'dc_print_frame';
                printFrame.style.display = 'none';
                document.body.appendChild(printFrame);
            }

            const doc = printFrame.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();

            printFrame.contentWindow.focus();
            setTimeout(() => { printFrame.contentWindow.print(); }, 500);
            
            } catch (err) {
                console.error("Print Error:", err);
                if (saveBtn) saveBtn.innerText = originalText;
                alert("An error occurred while printing: " + err.message);
            }
        }
    };

    window.manageDrivers = function() {
        if (window.DeliveryChallanModule && typeof window.DeliveryChallanModule.manageDrivers === 'function') {
            window.DeliveryChallanModule.manageDrivers();
        } else {
            const openPopup = typeof window.openSecondaryModularPopup === 'function' ? window.openSecondaryModularPopup : window.openModularPopup;
            if (typeof openPopup === 'function') {
                openPopup('Navigation/Maintain/drivers.html', 'fa-id-card', 'Drivers', () => {
                    if (typeof window.loadDriversForMaintenance === 'function') {
                        window.loadDriversForMaintenance();
                    }
                }, 'Drivers', false, false);
            }
        }
    };
})();

