// --- ITEM PRICE SETTINGS MODULE LOGIC ---
window.PriceSettingsModule = {
    data: [],
    
    init: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        console.log("Price Settings: Initializing for company", companyId);
        
        try {
            const cb = `_cb=${Date.now()}`;
            const [treeRes, brandsRes] = await Promise.all([
                fetch(`api/inventory.php?action=get_inventory_tree&company_id=${companyId}&${cb}`),
                fetch(`api/inventory.php?action=get_brands&company_id=${companyId}&${cb}`)
            ]);
            
            if (!treeRes.ok || !brandsRes.ok) throw new Error("Failed to fetch dropdown data");
            const tree = await treeRes.json();
            const brands = await brandsRes.json();
            
            const catList = document.getElementById('catList');
            if (catList) {
                catList.innerHTML = `<div class="custom-dropdown-item" onclick="window.PriceSettingsModule.selectOption('category', 0, 'Select Category...')">Select Category...</div>`;
                if (tree.mains && Array.isArray(tree.mains)) {
                    tree.mains.forEach(m => {
                        catList.innerHTML += `<div class="custom-dropdown-item" onclick="window.PriceSettingsModule.selectOption('category', ${m.id}, '${m.name}')">${m.name}</div>`;
                    });
                }
            }

            const brandList = document.getElementById('brandList');
            if (brandList) {
                brandList.innerHTML = `<div class="custom-dropdown-item" onclick="window.PriceSettingsModule.selectOption('brand', 0, 'Select Brand...')">Select Brand...</div>`;
                if (brands && Array.isArray(brands)) {
                    brands.forEach(b => {
                        brandList.innerHTML += `<div class="custom-dropdown-item" onclick="window.PriceSettingsModule.selectOption('brand', ${b.id}, '${b.name}')">${b.name}</div>`;
                    });
                }
            }
            
            // Add global click listener to close dropdowns when clicking outside
            const container = document.getElementById('itemPriceSettingsContainer');
            if (container && !container.dataset.listenerAdded) {
                container.dataset.listenerAdded = 'true';
                container.addEventListener('click', function(e) {
                    if (!e.target.closest('.custom-dropdown-container')) {
                        document.querySelectorAll('.custom-dropdown-list').forEach(el => el.style.display = 'none');
                    }
                });
            }

            this.load();
        } catch (e) { console.error("Price Settings Init Error:", e); }
    },

    toggleFilters: function() {
        const filterEl = document.querySelector('input[name="priceFilter"]:checked');
        if (!filterEl) return;
        const filter = filterEl.value;
        const catDisplay = document.getElementById('priceCategoryDisplay');
        const brandDisplay = document.getElementById('priceBrandDisplay');
        
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
        
        // Find current selected index
        // If not visible, find the one matching current value
        let currentIndex = items.findIndex(item => item.classList.contains('selected'));
        if (!isVisible && currentIndex === -1) {
            const currentVal = document.getElementById(type === 'category' ? 'priceCategorySelect' : 'priceBrandSelect').value;
            // The item index can be found by value... but custom-dropdown-item doesn't store value easily.
            // Let's just default to 0 if not found
            currentIndex = 0; 
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : items.length - 1;
            
            if (!isVisible) {
                // Change value immediately if not visible
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
            // Find option by typing
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
            document.getElementById('priceCategorySelect').value = id;
            document.getElementById('priceCategoryText').innerText = text;
            document.getElementById('catList').style.display = 'none';
        } else if (type === 'brand') {
            document.getElementById('priceBrandSelect').value = id;
            document.getElementById('priceBrandText').innerText = text;
            document.getElementById('brandList').style.display = 'none';
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
        const filterEl = document.querySelector('input[name="priceFilter"]:checked');
        if (!filterEl) return;

        const filterType = filterEl.value;
        let filterId = 0;
        if (filterType === 'category') filterId = document.getElementById('priceCategorySelect')?.value || 0;
        if (filterType === 'brand') filterId = document.getElementById('priceBrandSelect')?.value || 0;

        if (filterType !== 'all' && (filterId == 0 || filterId == '0')) {
            this.data = [];
            this.render();
            return;
        }

        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/inventory.php?action=get_price_settings&company_id=${companyId}&filter_type=${filterType}&filter_id=${filterId}&${cb}`);
            if (!res.ok) throw new Error("Fetch failed");
            const resData = await res.json();
            
            // Handle both array format and object format gracefully
            if (Array.isArray(resData)) {
                this.data = resData;
            } else if (resData && Array.isArray(resData.items)) {
                this.data = resData.items;
            } else {
                this.data = [];
            }
            
            this.render();
        } catch (e) { console.error("Price Settings Load Error:", e); }
    },

    selectedRowIndex: -1,

    render: function() {
        const tbody = document.getElementById('priceSettingsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!this.data || this.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">No items found</td></tr>';
            this.selectedRowIndex = -1;
            return;
        }

        this.data.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            tr.dataset.index = idx;
            if (idx === this.selectedRowIndex) tr.classList.add('row-selected');

            tr.innerHTML = `
                <td style="text-align: center; font-size: 10px;"><i class="fas fa-play row-arrow"></i></td>
                <td style="text-align: center; font-weight: 700;">${item.code}</td>
                <td>${item.name}</td>
                <td style="text-align: center;">${item.unit || ''}</td>
                <td style="text-align: right;">
                    <input type="number" step="0.01" class="price-input-cell"
                           value="${parseFloat(item.purchase_price).toFixed(2)}"
                           onclick="event.stopPropagation(); this.select();"
                           onfocus="this.select()"
                           onchange="window.PriceSettingsModule.updatePurchasePrice(${item.id}, this.value)">
                </td>
                <td>
                    <input type="number" step="0.01" class="price-input-cell"
                           value="${parseFloat(item.selling_price).toFixed(2)}"
                           onclick="event.stopPropagation(); this.select();"
                           onfocus="this.select()"
                           onchange="window.PriceSettingsModule.updatePrice(${item.id}, this.value)">
                </td>
            `;

            tr.addEventListener('click', () => {
                this.selectRow(idx);
            });

            tbody.appendChild(tr);
        });

        // Add keyboard navigation
        if (!this.keyListenerAdded) {
            this.keyListenerAdded = true;
            document.addEventListener('keydown', (e) => {
                const container = document.getElementById('itemPriceSettingsContainer');
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
                }
            });
        }
    },

    selectRow: function(idx) {
        this.selectedRowIndex = idx;
        const tbody = document.getElementById('priceSettingsTableBody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((r, i) => {
            if (i === idx) r.classList.add('row-selected');
            else r.classList.remove('row-selected');
        });
        // Scroll into view
        if (rows[idx]) {
            rows[idx].scrollIntoView({ block: 'nearest' });
        }
    },

    updatePrice: function(id, val) {
        const item = this.data.find(i => i.id === id || i.id == id);
        if (item) item.selling_price = parseFloat(val) || 0;
    },

    updatePurchasePrice: function(id, val) {
        const item = this.data.find(i => i.id === id || i.id == id);
        if (item) item.purchase_price = parseFloat(val) || 0;
    },

    applyMargin: function() {
        const margin = parseFloat(document.getElementById('profitMarginInput').value) || 0;
        if (margin === 0) return;
        this.data.forEach(item => {
            const purchase = parseFloat(item.purchase_price) || 0;
            if (purchase > 0) {
                item.selling_price = purchase + (purchase * (margin / 100));
            }
        });
        this.render();
    },

    save: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const payload = { prices: this.data.map(i => ({ item_id: i.id, selling_price: i.selling_price, purchase_price: i.purchase_price })) };

        try {
            const res = await fetch(`api/inventory.php?action=save_bulk_prices&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert('Prices updated successfully!');
            } else {
                alert('Error: ' + result.message);
            }
        } catch (e) { alert('Failed to save prices.'); }
    }
};
