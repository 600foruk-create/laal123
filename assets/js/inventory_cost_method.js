// --- ITEM COST VALUATION METHOD MODULE LOGIC ---
window.CostMethodModule = {
    data: [],
    
    init: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        console.log("Cost Method: Initializing for company", companyId);
        
        try {
            const cb = `_cb=${Date.now()}`;
            const [treeRes, brandsRes] = await Promise.all([
                fetch(`api/inventory.php?action=get_inventory_tree&company_id=${companyId}&${cb}`),
                fetch(`api/inventory.php?action=get_brands&company_id=${companyId}&${cb}`)
            ]);
            
            if (!treeRes.ok || !brandsRes.ok) throw new Error("Failed to fetch dropdown data");
            const tree = await treeRes.json();
            const brands = await brandsRes.json();
            
            const catList = document.getElementById('costCatList');
            if (catList) {
                catList.innerHTML = `<div class="custom-dropdown-item" onclick="window.CostMethodModule.selectOption('category', 0, 'Select Category...')">Select Category...</div>`;
                if (tree.mains && Array.isArray(tree.mains)) {
                    tree.mains.forEach(m => {
                        catList.innerHTML += `<div class="custom-dropdown-item" onclick="window.CostMethodModule.selectOption('category', ${m.id}, '${m.name}')">${m.name}</div>`;
                    });
                }
            }

            const brandList = document.getElementById('costBrandList');
            if (brandList) {
                brandList.innerHTML = `<div class="custom-dropdown-item" onclick="window.CostMethodModule.selectOption('brand', 0, 'Select Brand...')">Select Brand...</div>`;
                if (brands && Array.isArray(brands)) {
                    brands.forEach(b => {
                        brandList.innerHTML += `<div class="custom-dropdown-item" onclick="window.CostMethodModule.selectOption('brand', ${b.id}, '${b.name}')">${b.name}</div>`;
                    });
                }
            }
            
            // Add global click listener to close dropdowns when clicking outside
            const container = document.getElementById('itemCostMethodContainer');
            if (container && !container.dataset.listenerAdded) {
                container.dataset.listenerAdded = 'true';
                container.addEventListener('click', function(e) {
                    if (!e.target.closest('.custom-dropdown-container')) {
                        document.querySelectorAll('.custom-dropdown-list').forEach(el => el.style.display = 'none');
                    }
                });
            }

            this.load();
        } catch (e) { console.error("Cost Method Init Error:", e); }
    },

    toggleFilters: function() {
        const filterEl = document.querySelector('input[name="costFilter"]:checked');
        if (!filterEl) return;
        const filter = filterEl.value;
        const catDisplay = document.getElementById('costCategoryDisplay');
        const brandDisplay = document.getElementById('costBrandDisplay');
        
        if (catDisplay) {
            if (filter === 'category') catDisplay.classList.remove('disabled');
            else catDisplay.classList.add('disabled');
        }
        if (brandDisplay) {
            if (filter === 'brand') brandDisplay.classList.remove('disabled');
            else brandDisplay.classList.add('disabled');
        }
        
        document.querySelectorAll('.custom-dropdown-list').forEach(el => el.style.display = 'none');
        this.load();
    },

    toggleDropdown: function(listId, displayEl) {
        if (displayEl.classList.contains('disabled')) return;
        
        document.querySelectorAll('.custom-dropdown-list').forEach(el => {
            if (el.id !== listId) el.style.display = 'none';
        });

        const list = document.getElementById(listId);
        if (list) {
            list.style.display = list.style.display === 'block' ? 'none' : 'block';
        }
        displayEl.focus();
    },

    handleDropdownKeydown: function(e, listId, type, displayEl) {
        if (displayEl.classList.contains('disabled')) return;
        
        const list = document.getElementById(listId);
        if (!list) return;

        const items = Array.from(list.querySelectorAll('.custom-dropdown-item'));
        if (items.length === 0) return;

        const isVisible = list.style.display === 'block';
        
        let currentIndex = items.findIndex(item => item.classList.contains('selected'));
        if (!isVisible && currentIndex === -1) {
            currentIndex = 0; 
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : items.length - 1;
            
            if (!isVisible) {
                items[currentIndex].click();
                displayEl.focus();
            } else {
                this._updateListSelection(list, items, currentIndex);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentIndex = currentIndex > 0 ? currentIndex - 1 : 0;
            
            if (!isVisible) {
                items[currentIndex].click();
                displayEl.focus();
            } else {
                this._updateListSelection(list, items, currentIndex);
            }
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isVisible && currentIndex >= 0) {
                items[currentIndex].click();
                displayEl.focus();
            } else {
                this.toggleDropdown(listId, displayEl);
                if (list.style.display === 'block') {
                    this._updateListSelection(list, items, currentIndex);
                }
            }
            return;
        } else if (e.key === 'Escape') {
            list.style.display = 'none';
            displayEl.focus();
            return;
        } else {
            if (e.key.length === 1) {
                const char = e.key.toLowerCase();
                const matchIndex = items.findIndex((item, i) => i > currentIndex && item.innerText.toLowerCase().startsWith(char));
                let nextIndex = currentIndex;
                if (matchIndex >= 0) nextIndex = matchIndex;
                else {
                    const firstMatchIndex = items.findIndex(item => item.innerText.toLowerCase().startsWith(char));
                    if (firstMatchIndex >= 0) nextIndex = firstMatchIndex;
                }
                
                if (nextIndex !== currentIndex) {
                    if (!isVisible) {
                        items[nextIndex].click();
                        displayEl.focus();
                    } else {
                        this._updateListSelection(list, items, nextIndex);
                    }
                }
            }
        }
    },

    _updateListSelection: function(list, items, index) {
        if (index >= 0 && index < items.length) {
            items.forEach(item => item.classList.remove('selected'));
            items[index].classList.add('selected');
            
            const item = items[index];
            const listHeight = list.clientHeight;
            const itemTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            if (itemTop < list.scrollTop) {
                list.scrollTop = itemTop;
            } else if (itemTop + itemHeight > list.scrollTop + listHeight) {
                list.scrollTop = itemTop + itemHeight - listHeight;
            }
        }
    },

    selectOption: function(type, id, text) {
        if (type === 'category') {
            document.getElementById('costCategorySelect').value = id;
            document.getElementById('costCategoryText').innerText = text;
            document.getElementById('costCatList').style.display = 'none';
        } else if (type === 'brand') {
            document.getElementById('costBrandSelect').value = id;
            document.getElementById('costBrandText').innerText = text;
            document.getElementById('costBrandList').style.display = 'none';
        }
        this.load();
    },

    cancel: function() {
        this.load();
        if (typeof closeModularPopup === 'function') {
            closeModularPopup();
        }
    },

    load: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const filterEl = document.querySelector('input[name="costFilter"]:checked');
        if (!filterEl) return;

        const filterType = filterEl.value;
        let filterId = 0;
        if (filterType === 'category') filterId = document.getElementById('costCategorySelect')?.value || 0;
        if (filterType === 'brand') filterId = document.getElementById('costBrandSelect')?.value || 0;

        if (filterType !== 'all' && (filterId == 0 || filterId == '0')) {
            this.data = [];
            this.render();
            return;
        }

        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/inventory.php?action=get_cost_settings&company_id=${companyId}&filter_type=${filterType}&filter_id=${filterId}&${cb}`);
            if (!res.ok) throw new Error("Fetch failed");
            const resData = await res.json();
            
            if (Array.isArray(resData)) {
                this.data = resData.map(item => ({
                    ...item,
                    cost_method: item.cost_method || 'Weighted Average Cost'
                }));
            } else if (resData && Array.isArray(resData.items)) {
                this.data = resData.items.map(item => ({
                    ...item,
                    cost_method: item.cost_method || 'Weighted Average Cost'
                }));
            } else {
                this.data = [];
            }
            
            this.render();
        } catch (e) { console.error("Cost Method Load Error:", e); }
    },

    selectedRowIndex: -1,

    render: function() {
        const tbody = document.getElementById('itemCostMethodTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!this.data || this.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">No items found</td></tr>';
            this.selectedRowIndex = -1;
            return;
        }

        this.data.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            tr.dataset.index = idx;
            if (idx === this.selectedRowIndex) tr.classList.add('row-selected');

            const isManual = item.cost_method === 'Manual Cost';
            const methodClass = isManual ? 'method-cell-manual' : 'method-cell-avg';

            tr.innerHTML = `
                <td style="text-align: center; font-size: 10px;"><i class="fas fa-play row-arrow"></i></td>
                <td style="text-align: center; font-weight: 700;">${item.code}</td>
                <td>${item.name}</td>
                <td class="${methodClass}">
                    ${item.cost_method}
                </td>
            `;

            tr.addEventListener('click', () => {
                this.selectRow(idx);
            });
            tr.addEventListener('dblclick', () => {
                this.toggleItemMethod(item.id);
            });

            tbody.appendChild(tr);
        });

        if (!this.keyListenerAdded) {
            this.keyListenerAdded = true;
            document.addEventListener('keydown', (e) => {
                const container = document.getElementById('itemCostMethodContainer');
                if (!container) return;
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (this.selectedRowIndex < this.data.length - 1) {
                        this.selectRow(this.selectedRowIndex + 1);
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (this.selectedRowIndex > 0) {
                        this.selectRow(this.selectedRowIndex - 1);
                    }
                } else if (e.key === 'Enter' || e.key === ' ') {
                    // For cost method, Enter or Space toggles the method of selected row
                    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && this.selectedRowIndex >= 0) {
                        e.preventDefault();
                        const item = this.data[this.selectedRowIndex];
                        if (item) {
                            this.toggleItemMethod(item.id);
                        }
                    }
                }
            });
        }
    },

    selectRow: function(idx) {
        this.selectedRowIndex = idx;
        const tbody = document.getElementById('itemCostMethodTableBody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((r, i) => {
            if (i === idx) r.classList.add('row-selected');
            else r.classList.remove('row-selected');
        });
        if (rows[idx]) {
            rows[idx].scrollIntoView({ block: 'nearest' });
        }
    },

    toggleItemMethod: function(id) {
        const item = this.data.find(i => i.id === id || i.id == id);
        if (item) {
            item.cost_method = (item.cost_method === 'Weighted Average Cost') ? 'Manual Cost' : 'Weighted Average Cost';
            this.render();
        }
    },

    bulkSet: function(method) {
        this.data.forEach(item => {
            item.cost_method = method;
        });
        this.render();
    },

    save: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const payload = { methods: this.data.map(i => ({ item_id: i.id, cost_method: i.cost_method })) };

        try {
            const res = await fetch(`api/inventory.php?action=save_bulk_cost_methods&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert('Cost valuation methods updated successfully!');
            } else {
                alert('Error: ' + result.message);
            }
        } catch (e) { alert('Failed to save settings.'); }
    }
};
