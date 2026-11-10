window.InventoryBalancesModule = {
    isInitialized: false,
    companyProfile: null,
    rawLookups: { mains: [], subs: [], brands: [], locations: [], items: [] },
    balanceData: { records: [], groups: [], summary: {}, grand_total: {} },
    collapsedGroups: {},
    selectedItemId: null,

    init: async function() {
        const self = this;
        self.isInitialized = true;
        self.collapsedGroups = {};

        // Enforce Sale Invoice Modal Size immediately on load
        self.enforceWindowSize();
        self.setDefaultDates();

        // 1. Immediately fetch lookups so all filter dropdowns are populated
        try {
            await self.fetchLookups();
        } catch(e) {
            console.error('[IB] Lookups error:', e);
        }

        // 2. Setup item search auto-suggest
        try {
            self.setupItemSearch();
        } catch(e) {
            console.error('[IB] Setup search error:', e);
        }

        // 3. Immediately perform initial stock calculation
        try {
            await self.search();
        } catch(e) {
            console.error('[IB] Initial search error:', e);
        }

        // 4. Load company profile in background for print without blocking UI
        self.loadCompanyProfile().catch(e => console.warn(e));
    },

    loadCompanyProfile: async function() {
        const self = this;
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            self.companyProfile = {
                name: session.company_name || 'SEASTONE PLASTIC INDUSTRIES',
                address: '',
                phone: '',
                email: '',
                website: '',
                ntn: session.company_ntn || '',
                strn: session.company_strn || session.company_gst || '',
                logo: null
            };

            // 1. Check window.companyData and window.logoData
            if (window.companyData) {
                if (window.companyData.name) self.companyProfile.name = window.companyData.name;
                if (window.companyData.address) self.companyProfile.address = window.companyData.address;
                if (window.companyData.phone) self.companyProfile.phone = window.companyData.phone;
                if (window.companyData.email) self.companyProfile.email = window.companyData.email;
                if (window.companyData.website) self.companyProfile.website = window.companyData.website;
                if (window.companyData.ntn) self.companyProfile.ntn = window.companyData.ntn;
                if (window.companyData.gst) self.companyProfile.strn = window.companyData.gst;
                if (window.companyData.logo_data && typeof window.companyData.logo_data === 'string' && window.companyData.logo_data.startsWith('data:image')) {
                    self.companyProfile.logo = window.companyData.logo_data;
                }
            }
            if (!self.companyProfile.logo && window.logoData && typeof window.logoData === 'string' && window.logoData.startsWith('data:image')) {
                self.companyProfile.logo = window.logoData;
            }

            // 2. Fetch live from database (My Company / My Logo)
            try {
                const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}&_t=${Date.now()}`);
                if (res.ok) {
                    const dbCo = await res.json();
                    if (dbCo && !dbCo.error) {
                        if (dbCo.name) self.companyProfile.name = dbCo.name;
                        if (dbCo.address) self.companyProfile.address = dbCo.address;
                        if (dbCo.phone) self.companyProfile.phone = dbCo.phone;
                        if (dbCo.email) self.companyProfile.email = dbCo.email;
                        if (dbCo.website) self.companyProfile.website = dbCo.website;
                        if (dbCo.ntn || dbCo.ntn_no) self.companyProfile.ntn = dbCo.ntn || dbCo.ntn_no;
                        if (dbCo.strn || dbCo.gst_no || dbCo.st_reg_no || dbCo.sales_tax_reg_no) {
                            self.companyProfile.strn = dbCo.strn || dbCo.gst_no || dbCo.st_reg_no || dbCo.sales_tax_reg_no;
                        }
                        if (dbCo.logo_data && typeof dbCo.logo_data === 'string' && dbCo.logo_data.startsWith('data:image')) {
                            self.companyProfile.logo = dbCo.logo_data;
                            try {
                                localStorage.setItem(`softifyx_${self.companyProfile.name}_logo`, dbCo.logo_data);
                            } catch(e) {}
                        }
                    }
                }
            } catch (e) {
                console.warn('[IB] Failed to fetch live company profile:', e);
            }

            // 3. Fallback to localStorage keys if still not found
            if (!self.companyProfile.logo) {
                const coName = self.companyProfile.name;
                const candidates = [
                    localStorage.getItem(`softifyx_${coName}_logo`),
                    localStorage.getItem('softifyx_logo')
                ];
                try {
                    if (typeof getCoKey === 'function') candidates.unshift(localStorage.getItem(getCoKey('softifyx_logo')));
                } catch(e) {}
                try {
                    if (typeof window.getCompanyLogo === 'function') {
                        const l = window.getCompanyLogo();
                        if (l && typeof l === 'string' && l.startsWith('data:image')) candidates.push(l);
                    }
                } catch(e) {}

                for (const c of candidates) {
                    if (c && typeof c === 'string' && c.startsWith('data:image')) {
                        self.companyProfile.logo = c;
                        break;
                    }
                }
            }

            // 4. Scan localStorage for any key with _logo
            if (!self.companyProfile.logo) {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.includes('_logo')) {
                        const val = localStorage.getItem(k);
                        if (val && typeof val === 'string' && val.startsWith('data:image')) {
                            self.companyProfile.logo = val;
                            break;
                        }
                    }
                }
            }
        } catch(err) {
            console.warn('[IB] loadCompanyProfile error:', err);
        }
    },

    enforceWindowSize: function() {
        const root = document.getElementById('ib_root');
        const win = root?.closest('.modal-container');
        if (win) {
            win.classList.add('modal-fbr-invoice');
            win.style.maxWidth = '1260px';
            win.style.width = '98%';
            win.style.height = '94vh';
            win.style.maxHeight = '94vh';
        }
    },

    setDefaultDates: function() {
        const today = new Date().toISOString().split('T')[0];
        const d = new Date();
        d.setDate(1); // 1st of current month
        const firstOfMonth = d.toISOString().split('T')[0];

        const asOfEl = document.getElementById('ib_as_of_date');
        const fromEl = document.getElementById('ib_from_date');
        const toEl = document.getElementById('ib_to_date');

        if (asOfEl && !asOfEl.value) asOfEl.value = today;
        if (fromEl && !fromEl.value) fromEl.value = firstOfMonth;
        if (toEl && !toEl.value) toEl.value = today;
    },

    toggleDateMode: function() {
        const isPeriod = document.getElementById('ib_mode_period')?.checked;
        const asOfEl = document.getElementById('ib_as_of_date');
        const fromEl = document.getElementById('ib_from_date');
        const toEl = document.getElementById('ib_to_date');

        if (asOfEl) asOfEl.disabled = isPeriod;
        if (fromEl) fromEl.disabled = !isPeriod;
        if (toEl) toEl.disabled = !isPeriod;

        this.search();
    },

    fetchLookups: async function() {
        const self = this;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/inventory_balances.php?action=get_lookups&company_id=${companyId}`);
            const data = await res.json();
            if (data.status === 'success') {
                self.rawLookups = data;

                // Populate Categories
                const catSelect = document.getElementById('ib_filter_cat');
                if (catSelect) {
                    catSelect.innerHTML = '<option value="">All Categories</option>';
                    data.mains.forEach(m => {
                        catSelect.innerHTML += `<option value="${m.id}">${m.name}</option>`;
                    });
                }

                // Populate Brands
                const brandSelect = document.getElementById('ib_filter_brand');
                if (brandSelect) {
                    brandSelect.innerHTML = '<option value="">All Brands</option>';
                    data.brands.forEach(b => {
                        brandSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
                    });
                }

                // Populate Locations
                const locSelect = document.getElementById('ib_filter_location');
                if (locSelect) {
                    locSelect.innerHTML = '<option value="">All Locations (Warehouse)</option>';
                    data.locations.forEach(l => {
                        locSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
                    });
                }

                self.populateSubCategories('');
            }
        } catch (e) {
            console.error('[IB] Failed to fetch lookups:', e);
        }
    },

    onCategoryChange: function() {
        const catId = document.getElementById('ib_filter_cat')?.value || '';
        this.populateSubCategories(catId);
        this.search();
    },

    populateSubCategories: function(mainId) {
        const subSelect = document.getElementById('ib_filter_subcat');
        if (!subSelect) return;
        subSelect.innerHTML = '<option value="">All Sub Categories</option>';

        const filtered = mainId
            ? this.rawLookups.subs.filter(s => String(s.main_id) === String(mainId))
            : this.rawLookups.subs;

        filtered.forEach(s => {
            subSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    },

    setupItemSearch: function() {
        const self = this;
        const input = document.getElementById('ib_filter_item');
        const hiddenId = document.getElementById('ib_filter_item_id');
        const box = document.getElementById('ib_item_suggest');
        if (!input || !box || !hiddenId) return;

        let activeIdx = -1;
        let debounceTimer = null;

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const val = input.value.trim().toLowerCase();
            if (!val) {
                hiddenId.value = '';
                box.style.display = 'none';
                self.search();
                return;
            }

            const matches = self.rawLookups.items.filter(it => 
                (it.item_code && it.item_code.toLowerCase().includes(val)) ||
                (it.item_name && it.item_name.toLowerCase().includes(val))
            ).slice(0, 15);

            if (matches.length === 0) {
                box.style.display = 'none';
                return;
            }

            let html = '';
            matches.forEach((m) => {
                const safeName = String(m.item_name || '').replace(/'/g, "\\'");
                const safeCode = String(m.item_code || '').replace(/'/g, "\\'");
                html += `<div class="ib-suggest-item" data-id="${m.id}" data-name="${safeName}" data-code="${safeCode}">
                    <b style="color:#0369a1;">${m.item_code}</b> - ${m.item_name}
                </div>`;
            });

            box.innerHTML = html;
            box.style.display = 'block';
            activeIdx = -1;

            box.querySelectorAll('.ib-suggest-item').forEach(el => {
                el.addEventListener('click', () => {
                    hiddenId.value = el.getAttribute('data-id');
                    input.value = `${el.getAttribute('data-code')} - ${el.getAttribute('data-name')}`;
                    box.style.display = 'none';
                    self.search();
                });
            });

            // Auto-filter on typing with 350ms debounce
            debounceTimer = setTimeout(() => {
                self.search();
            }, 350);
        });

        input.addEventListener('keydown', (e) => {
            const items = box.querySelectorAll('.ib-suggest-item');
            if (box.style.display === 'block' && items.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeIdx = Math.min(activeIdx + 1, items.length - 1);
                    items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeIdx = Math.max(activeIdx - 1, 0);
                    items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIdx > -1 && items[activeIdx]) {
                        items[activeIdx].click();
                    } else {
                        self.search();
                    }
                }
            } else if (e.key === 'Enter') {
                self.search();
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !box.contains(e.target)) {
                box.style.display = 'none';
            }
        });
    },

    search: async function() {
        const self = this;
        self.enforceWindowSize();

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        const loading = document.getElementById('ib_loading');
        if (loading) loading.style.display = 'flex';

        const catId = document.getElementById('ib_filter_cat')?.value || '';
        const subCatId = document.getElementById('ib_filter_subcat')?.value || '';
        const brandId = document.getElementById('ib_filter_brand')?.value || '';
        const locationId = document.getElementById('ib_filter_location')?.value || '';
        const status = document.getElementById('ib_filter_status')?.value || 'all';

        const itemHidden = document.getElementById('ib_filter_item_id')?.value;
        const itemInput = (document.getElementById('ib_filter_item')?.value || '').trim();
        const itemFilter = itemHidden || itemInput || '';

        const dateMode = document.getElementById('ib_mode_period')?.checked ? 'period' : 'as_of';
        const asOfDate = document.getElementById('ib_as_of_date')?.value || '';
        const fromDate = document.getElementById('ib_from_date')?.value || '';
        const toDate = document.getElementById('ib_to_date')?.value || '';

        const params = new URLSearchParams({
            action: 'get_balances',
            company_id: companyId,
            category_id: catId,
            sub_category_id: subCatId,
            brand_id: brandId,
            location_id: locationId,
            item_filter: itemFilter,
            stock_status: status,
            date_mode: dateMode,
            as_of_date: asOfDate,
            from_date: fromDate,
            to_date: toDate,
            _t: Date.now()
        });

        try {
            const res = await fetch(`api/inventory_balances.php?${params.toString()}`);
            if (!res.ok) {
                const txt = await res.text();
                console.error('[IB] Server error response:', txt);
                throw new Error(`Server returned HTTP ${res.status}`);
            }
            const data = await res.json();

            if (data.status === 'success') {
                self.balanceData = data;
                self.updateSummaryCards(data.summary);
                self.renderMainTable();
            } else {
                console.warn('[IB] Balances API warning:', data.error);
                alert(data.error || 'Failed to fetch inventory balances');
            }
        } catch (e) {
            console.error('[IB] Fetch error:', e);
        } finally {
            if (loading) loading.style.display = 'none';
        }
    },

    formatNum: function(v) {
        const n = parseFloat(v || 0);
        if (n === 0) return '0';
        if (Number.isInteger(n)) return n.toLocaleString('en-US');
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatCell: function(val, isSecUnit = false, isDash = false) {
        if (isDash) return `<span style="color:#94a3b8;">-</span>`;
        const n = parseFloat(val || 0);
        const formatted = this.formatNum(n);
        if (n < 0) {
            return `<span class="ib-neg">${formatted}</span>`;
        }
        return formatted;
    },

    updateSummaryCards: function(sum) {
        if (!sum) return;
        const totalItemsEl = document.getElementById('ib_card_items');
        const totalStockEl = document.getElementById('ib_card_stock');
        const negStockEl   = document.getElementById('ib_card_negative');
        const lowStockEl   = document.getElementById('ib_card_low');

        if (totalItemsEl) totalItemsEl.innerText = (sum.total_items || 0).toLocaleString();
        
        if (totalStockEl) {
            const pcs = this.formatNum(sum.total_pcs);
            const ctn = this.formatNum(sum.total_ctn);
            const kg  = this.formatNum(sum.total_kg);
            const bags= this.formatNum(sum.total_bags);
            
            let stockStr = `Pcs: ${pcs} | Ctn: ${ctn} | Kg: ${kg}`;
            if (parseFloat(sum.total_bags) > 0) stockStr += ` | Bags: ${bags}`;
            totalStockEl.innerText = stockStr;
        }

        if (negStockEl) {
            const negCount = sum.negative_count || 0;
            negStockEl.innerText = `${negCount} Items`;
            negStockEl.style.color = negCount > 0 ? '#dc2626' : '#16a34a';
        }

        if (lowStockEl) {
            lowStockEl.innerText = `${sum.low_stock_count || 0} Items`;
        }
    },

    renderMainTable: function() {
        const self = this;
        const tbody = document.getElementById('ib_main_tbody');
        const tfoot = document.getElementById('ib_main_tfoot');
        if (!tbody || !tfoot) return;

        const showSubtotals = document.getElementById('ib_opt_subtotals')?.checked ?? true;
        const onlyWithStock = document.getElementById('ib_opt_only_stock')?.checked ?? false;
        const showZeroStock = document.getElementById('ib_opt_zero_stock')?.checked ?? true;
        const showNegStock  = document.getElementById('ib_opt_neg_stock')?.checked ?? true;

        const groups = self.balanceData.groups || [];
        let html = '';
        let globalItemIndex = 1;

        if (groups.length === 0 || self.balanceData.records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 30px; color: #64748b; font-size: 13px;">No inventory records found matching the selected filters.</td></tr>`;
            tfoot.innerHTML = '';
            return;
        }

        groups.forEach((grp) => {
            const isCollapsed = !!self.collapsedGroups[grp.group_name];
            const icon = isCollapsed ? 'fa-plus-square' : 'fa-minus-square';

            // Filter items in group based on client checkboxes
            const visibleItems = grp.items.filter(it => {
                const isZero = (it.cb_primary === 0 && it.cb_sec === 0);
                const isNeg  = (it.cb_primary < 0 || it.cb_sec < 0);
                const hasStock = (it.cb_primary > 0 || it.cb_sec > 0);

                if (onlyWithStock && !hasStock) return false;
                if (!showZeroStock && isZero) return false;
                if (!showNegStock && isNeg) return false;
                return true;
            });

            if (visibleItems.length === 0) return;

            // Category Header Row
            html += `
                <tr class="ib-cat-row" onclick="window.InventoryBalancesModule.toggleCategory('${grp.group_name}')">
                    <td style="text-align: center;"><i class="fas ${icon}"></i></td>
                    <td colspan="12" style="padding: 4px 6px;">
                        <span>${grp.group_name}</span>
                        <span style="font-size: 10.5px; font-weight: normal; margin-left: 6px; color: #475569;">(${visibleItems.length} Items)</span>
                    </td>
                </tr>
            `;

            if (!isCollapsed) {
                visibleItems.forEach((row) => {
                    const isFittings = grp.group_name === 'Fittings';
                    const dashSec = isFittings && row.ob_sec === 0 && row.in_sec === 0 && row.out_sec === 0 && row.cb_sec === 0;

                    html += `
                        <tr onclick="window.InventoryBalancesModule.highlightRow(this, ${row.item_id})" style="cursor: pointer;">
                            <td style="text-align: center; color: #64748b; font-weight: bold;">${globalItemIndex++}</td>
                            <td style="font-weight: 600; color: #0f172a;">${row.item_name}</td>
                            <td style="text-align: center; font-weight: bold; color: #1F4E79;">${row.unit_display}</td>

                            <td style="text-align: right;">${self.formatCell(row.ob_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(row.ob_sec, true, dashSec)}</td>

                            <td style="text-align: right;">${self.formatCell(row.in_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(row.in_sec, true, dashSec)}</td>

                            <td style="text-align: right;">${self.formatCell(row.out_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(row.out_sec, true, dashSec)}</td>

                            <td style="text-align: right;">${self.formatCell(row.adj_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(row.adj_sec, true, dashSec)}</td>

                            <td style="text-align: right; font-weight: 800; background: #f8fafc;">${self.formatCell(row.cb_primary)}</td>
                            <td style="text-align: right; font-weight: 800; background: #f8fafc;">${self.formatCell(row.cb_sec, true, dashSec)}</td>
                        </tr>
                    `;
                });

                // Category Subtotal Row
                if (showSubtotals) {
                    const sub = grp.subtotal;
                    const isFittings = grp.group_name === 'Fittings';
                    const dashSubSec = isFittings && sub.ob_sec === 0 && sub.in_sec === 0 && sub.out_sec === 0 && sub.cb_sec === 0;

                    html += `
                        <tr class="ib-subtotal-row">
                            <td colspan="3" style="text-align: right; padding-right: 10px; color: #0f172a;">
                                Total - ${grp.group_name}
                            </td>
                            <td style="text-align: right;">${self.formatCell(sub.ob_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(sub.ob_sec, true, dashSubSec)}</td>

                            <td style="text-align: right;">${self.formatCell(sub.in_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(sub.in_sec, true, dashSubSec)}</td>

                            <td style="text-align: right;">${self.formatCell(sub.out_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(sub.out_sec, true, dashSubSec)}</td>

                            <td style="text-align: right;">${self.formatCell(sub.adj_primary)}</td>
                            <td style="text-align: right;">${self.formatCell(sub.adj_sec, true, dashSubSec)}</td>

                            <td style="text-align: right; font-weight: 900;">${self.formatCell(sub.cb_primary)}</td>
                            <td style="text-align: right; font-weight: 900;">${self.formatCell(sub.cb_sec, true, dashSubSec)}</td>
                        </tr>
                    `;
                }
            }
        });

        tbody.innerHTML = html;

        // Grand Total Row
        const gt = self.balanceData.grand_total;
        tfoot.innerHTML = `
            <tr class="ib-grand-row">
                <td colspan="3" style="text-align: left; padding-left: 10px;">
                    Grand Total (${self.balanceData.summary.total_items || 0} Items)
                </td>
                <td style="text-align: right;">${self.formatCell(gt.ob_primary)}</td>
                <td style="text-align: right;">${self.formatCell(gt.ob_sec)}</td>

                <td style="text-align: right;">${self.formatCell(gt.in_primary)}</td>
                <td style="text-align: right;">${self.formatCell(gt.in_sec)}</td>

                <td style="text-align: right;">${self.formatCell(gt.out_primary)}</td>
                <td style="text-align: right;">${self.formatCell(gt.out_sec)}</td>

                <td style="text-align: right;">${self.formatCell(gt.adj_primary)}</td>
                <td style="text-align: right;">${self.formatCell(gt.adj_sec)}</td>

                <td style="text-align: right; background: #0f2d4a;">${self.formatCell(gt.cb_primary)}</td>
                <td style="text-align: right; background: #0f2d4a;">${self.formatCell(gt.cb_sec)}</td>
            </tr>
        `;
    },

    toggleCategory: function(groupName) {
        this.collapsedGroups[groupName] = !this.collapsedGroups[groupName];
        this.renderMainTable();
    },

    toggleAllCategories: function(expand) {
        const self = this;
        (self.balanceData.groups || []).forEach(g => {
            self.collapsedGroups[g.group_name] = !expand;
        });
        self.renderMainTable();
    },

    highlightRow: function(trEl, itemId) {
        this.selectedItemId = itemId;
        const allTr = document.querySelectorAll('#ib_main_tbody tr');
        allTr.forEach(r => r.classList.remove('selected'));
        if (trEl) trEl.classList.add('selected');
    },

    printReport: async function() {
        const self = this;
        const groups = self.balanceData.groups || [];
        if (!groups.length && (!self.balanceData.records || !self.balanceData.records.length)) {
            return alert('No data available to print.');
        }

        if (!self.companyProfile || !self.companyProfile.logo) {
            await self.loadCompanyProfile();
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        let coName = (self.companyProfile && self.companyProfile.name) || session.company_name || 'SEASTONE PLASTIC INDUSTRIES';
        coName = coName.toUpperCase().startsWith('M/S ') ? coName.toUpperCase() : 'M/S ' + coName.toUpperCase();
        coName = coName.replace(/^(M\/S\s*)+/i, 'M/S ');

        const coAddr = (self.companyProfile && self.companyProfile.address) || '';
        const coPhone = (self.companyProfile && self.companyProfile.phone) || '';
        const coEmail = (self.companyProfile && self.companyProfile.email) || '';
        const coWeb = (self.companyProfile && self.companyProfile.website) || '';
        const coNtn = (self.companyProfile && self.companyProfile.ntn) || '';
        const coStrn = (self.companyProfile && self.companyProfile.strn) || '';

        // Live Logo from My Logo (base64 data:image or valid url; NO default SoftifyX yellow logo fallback)
        let customLogo = self.companyProfile && self.companyProfile.logo;
        if (!customLogo || !customLogo.startsWith('data:image')) {
            // Check window.logoData or session keys
            if (window.logoData && typeof window.logoData === 'string' && window.logoData.startsWith('data:image')) {
                customLogo = window.logoData;
            } else if (window.companyData && window.companyData.logo_data && window.companyData.logo_data.startsWith('data:image')) {
                customLogo = window.companyData.logo_data;
            }
        }

        const logoHtml = (customLogo && customLogo.startsWith('data:image'))
            ? `<img src="${customLogo}" style="max-height: 55px; max-width: 140px; object-fit: contain;" alt="Company Logo">`
            : '';

        // Extract active filters directly from screen controls
        const dateMode = document.getElementById('ib_mode_period')?.checked ? 'period' : 'as_of';
        const asOfDate = document.getElementById('ib_as_of_date')?.value || '';
        const fromDate = document.getElementById('ib_from_date')?.value || '';
        const toDate   = document.getElementById('ib_to_date')?.value || '';
        const dateStr  = dateMode === 'period' ? `Period: ${fromDate} to ${toDate}` : `As of Date: ${asOfDate}`;

        const catSelect = document.getElementById('ib_filter_cat');
        const catText = catSelect && catSelect.selectedIndex > 0 ? catSelect.options[catSelect.selectedIndex].text : '';

        const subCatSelect = document.getElementById('ib_filter_subcat');
        const subCatText = subCatSelect && subCatSelect.selectedIndex > 0 ? subCatSelect.options[subCatSelect.selectedIndex].text : '';

        const brandSelect = document.getElementById('ib_filter_brand');
        const brandText = brandSelect && brandSelect.selectedIndex > 0 ? brandSelect.options[brandSelect.selectedIndex].text : '';

        const locSelect = document.getElementById('ib_filter_location');
        const locText = locSelect && locSelect.selectedIndex > 0 ? locSelect.options[locSelect.selectedIndex].text : '';

        const statusSelect = document.getElementById('ib_filter_status');
        const statusText = statusSelect && statusSelect.selectedIndex > 0 ? statusSelect.options[statusSelect.selectedIndex].text : '';

        const itemSearch = document.getElementById('ib_filter_item')?.value.trim();

        const filterTags = [];
        if (catText) filterTags.push(`Category: <strong>${catText}</strong>`);
        if (subCatText) filterTags.push(`Sub Category: <strong>${subCatText}</strong>`);
        if (brandText) filterTags.push(`Brand: <strong>${brandText}</strong>`);
        if (locText) filterTags.push(`Location: <strong>${locText}</strong>`);
        if (statusText) filterTags.push(`Stock: <strong>${statusText}</strong>`);
        if (itemSearch) filterTags.push(`Search: <strong>"${itemSearch}"</strong>`);

        const filterSummaryHtml = filterTags.length ? filterTags.join(' &nbsp;|&nbsp; ') : 'All Categories &amp; Warehouses';

        // Checkbox states (mirroring display exactly)
        const showSubtotals = document.getElementById('ib_opt_subtotals')?.checked ?? true;
        const onlyWithStock = document.getElementById('ib_opt_only_stock')?.checked ?? false;
        const showZeroStock = document.getElementById('ib_opt_zero_stock')?.checked ?? true;
        const showNegStock  = document.getElementById('ib_opt_neg_stock')?.checked ?? true;

        // Dynamic column headers
        let u1Title = 'Pcs / Ctn';
        let u2Title = 'Kg / Pcs';
        const activeCatLower = catText.toLowerCase();
        if (activeCatLower.includes('pipe') || (groups.length === 1 && groups[0].group_name === 'PVC Pipes')) {
            u1Title = 'Pcs'; u2Title = 'Kg';
        } else if (activeCatLower.includes('fitting') || (groups.length === 1 && groups[0].group_name === 'Fittings')) {
            u1Title = 'Ctn'; u2Title = 'Pcs';
        } else if (activeCatLower.includes('raw') || (groups.length === 1 && groups[0].group_name === 'Raw Material')) {
            u1Title = 'Bags'; u2Title = 'Kg';
        }

        let rowsHtml = '';
        let globalIdx = 1;
        let totalItemsCount = 0;
        let grandTotals = {
            ob_pri: 0, ob_sec: 0,
            in_pri: 0, in_sec: 0,
            out_pri: 0, out_sec: 0,
            adj_pri: 0, adj_sec: 0,
            cb_pri: 0, cb_sec: 0
        };

        groups.forEach(grp => {
            const visibleItems = grp.items.filter(it => {
                const isZero = (it.cb_primary === 0 && it.cb_sec === 0);
                const isNeg  = (it.cb_primary < 0 || it.cb_sec < 0);
                const hasStock = (it.cb_primary > 0 || it.cb_sec > 0);

                if (onlyWithStock && !hasStock) return false;
                if (!showZeroStock && isZero) return false;
                if (!showNegStock && isNeg) return false;
                return true;
            });

            if (visibleItems.length === 0) return;

            // Category Banner in Print
            rowsHtml += `
                <tr style="background: #e0f2fe; color: #075985; font-weight: bold;">
                    <td colspan="13" style="padding: 4px 8px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #93c5fd;">
                        <strong>${grp.group_name}</strong> &nbsp;
                        <span style="font-weight: normal; font-size: 9px; color: #0369a1;">(${visibleItems.length} Items)</span>
                    </td>
                </tr>
            `;

            let grpTotals = {
                ob_pri: 0, ob_sec: 0,
                in_pri: 0, in_sec: 0,
                out_pri: 0, out_sec: 0,
                adj_pri: 0, adj_sec: 0,
                cb_pri: 0, cb_sec: 0
            };

            const isFittings = grp.group_name === 'Fittings';

            visibleItems.forEach(row => {
                totalItemsCount++;
                const dashSec = isFittings && row.ob_sec === 0 && row.in_sec === 0 && row.out_sec === 0 && row.cb_sec === 0;

                grpTotals.ob_pri += row.ob_primary;
                grpTotals.ob_sec += row.ob_sec;
                grpTotals.in_pri += row.in_primary;
                grpTotals.in_sec += row.in_sec;
                grpTotals.out_pri += row.out_primary;
                grpTotals.out_sec += row.out_sec;
                grpTotals.adj_pri += row.adj_primary;
                grpTotals.adj_sec += row.adj_sec;
                grpTotals.cb_pri += row.cb_primary;
                grpTotals.cb_sec += row.cb_sec;

                grandTotals.ob_pri += row.ob_primary;
                grandTotals.ob_sec += row.ob_sec;
                grandTotals.in_pri += row.in_primary;
                grandTotals.in_sec += row.in_sec;
                grandTotals.out_pri += row.out_primary;
                grandTotals.out_sec += row.out_sec;
                grandTotals.adj_pri += row.adj_primary;
                grandTotals.adj_sec += row.adj_sec;
                grandTotals.cb_pri += row.cb_primary;
                grandTotals.cb_sec += row.cb_sec;

                rowsHtml += `
                    <tr>
                        <td style="text-align: center; color: #64748b;">${globalIdx++}</td>
                        <td style="font-weight: 600; color: #0f172a;">${row.item_name}</td>
                        <td style="text-align: center; font-weight: 700; color: #1F4E79;">${row.unit_display}</td>
                        <td style="text-align: right;">${self.formatCell(row.ob_primary)}</td>
                        <td style="text-align: right;">${self.formatCell(row.ob_sec, true, dashSec)}</td>
                        <td style="text-align: right;">${self.formatCell(row.in_primary)}</td>
                        <td style="text-align: right;">${self.formatCell(row.in_sec, true, dashSec)}</td>
                        <td style="text-align: right;">${self.formatCell(row.out_primary)}</td>
                        <td style="text-align: right;">${self.formatCell(row.out_sec, true, dashSec)}</td>
                        <td style="text-align: right;">${self.formatCell(row.adj_primary)}</td>
                        <td style="text-align: right;">${self.formatCell(row.adj_sec, true, dashSec)}</td>
                        <td style="text-align: right; font-weight: 800; background: #f8fafc;">${self.formatCell(row.cb_primary)}</td>
                        <td style="text-align: right; font-weight: 800; background: #f8fafc;">${self.formatCell(row.cb_sec, true, dashSec)}</td>
                    </tr>
                `;
            });

            if (showSubtotals) {
                const dashSubSec = isFittings && grpTotals.ob_sec === 0 && grpTotals.in_sec === 0 && grpTotals.out_sec === 0 && grpTotals.cb_sec === 0;
                rowsHtml += `
                    <tr style="background: #f1f5f9; font-weight: bold; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
                        <td colspan="3" style="text-align: right; padding-right: 10px; color: #0f172a;">
                            Total - ${grp.group_name}
                        </td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.ob_pri)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.ob_sec, true, dashSubSec)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.in_pri)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.in_sec, true, dashSubSec)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.out_pri)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.out_sec, true, dashSubSec)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.adj_pri)}</td>
                        <td style="text-align: right;">${self.formatCell(grpTotals.adj_sec, true, dashSubSec)}</td>
                        <td style="text-align: right; font-weight: 900;">${self.formatCell(grpTotals.cb_pri)}</td>
                        <td style="text-align: right; font-weight: 900;">${self.formatCell(grpTotals.cb_sec, true, dashSubSec)}</td>
                    </tr>
                `;
            }
        });

        if (totalItemsCount === 0) {
            rowsHtml = `<tr><td colspan="13" style="text-align: center; padding: 25px; color: #64748b; font-size: 11px;">No inventory records matching current display filters.</td></tr>`;
        }

        const grandTotalHtml = `
            <tr style="background: #0b2942; color: #ffffff; font-weight: bold; border-top: 2px solid #0f2d4a;">
                <td colspan="3" style="text-align: left; padding-left: 10px;">
                    Grand Total (${totalItemsCount} Items)
                </td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.ob_pri)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.ob_sec)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.in_pri)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.in_sec)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.out_pri)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.out_sec)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.adj_pri)}</td>
                <td style="text-align: right; color: #fff;">${self.formatCell(grandTotals.adj_sec)}</td>
                <td style="text-align: right; background: #071e30; color: #fff; font-weight: 900;">${self.formatCell(grandTotals.cb_pri)}</td>
                <td style="text-align: right; background: #071e30; color: #fff; font-weight: 900;">${self.formatCell(grandTotals.cb_sec)}</td>
            </tr>
        `;

        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        const printHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Inventory Balance (Stock Report) - ${coName}</title>
    <base href="${baseUrl}">
    <style>
        @page {
            size: A4 landscape;
            margin: 6mm 8mm;
        }
        @media print {
            body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .no-print { display: none !important; }
        }
        body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            font-size: 9px;
            margin: 0;
            padding: 8px 10px;
            color: #0f172a;
            background: #ffffff;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header-wrap {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1F4E79;
            padding-bottom: 6px;
            margin-bottom: 6px;
        }
        .co-title {
            font-size: 17px;
            font-weight: 900;
            color: #1F4E79;
            text-transform: uppercase;
            margin: 0 0 2px 0;
            letter-spacing: 0.3px;
        }
        .report-badge {
            background: #1F4E79;
            color: #ffffff;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: 800;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-block;
        }
        .filter-meta-bar {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 8.5px;
            color: #334155;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5px;
        }
        th {
            background: #1F4E79 !important;
            color: #ffffff !important;
            border: 1px solid #94a3b8;
            padding: 3.5px 4px;
            font-size: 8.5px;
            text-transform: uppercase;
            letter-spacing: 0.2px;
        }
        td {
            border: 1px solid #cbd5e1;
            padding: 2.5px 5px;
            font-size: 8.5px;
            vertical-align: middle;
        }
        .ib-neg {
            color: #dc2626 !important;
            font-weight: bold;
        }
        .footer-signatures {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 25px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            font-size: 9px;
            color: #475569;
        }
        .sig-box {
            border-top: 1px dashed #64748b;
            padding-top: 3px;
            min-width: 140px;
            text-align: center;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="header-wrap">
        <div style="display: flex; align-items: center; gap: 14px;">
            ${logoHtml}
            <div>
                <h1 class="co-title">${coName}</h1>
                <div style="font-size: 9.5px; color: #475569; margin-top: 1px;">
                    ${coAddr ? `<span>${coAddr}</span>` : ''}
                    ${coPhone ? `<span style="margin-left: 8px;"><strong>Phone:</strong> ${coPhone}</span>` : ''}
                </div>
                <div style="font-size: 9.5px; color: #475569;">
                    ${coEmail ? `<span><strong>Email:</strong> ${coEmail}</span>` : ''}
                    ${coWeb ? `<span style="margin-left: 8px;"><strong>Web:</strong> ${coWeb}</span>` : ''}
                    ${coNtn ? `<span style="margin-left: 8px;"><strong>NTN:</strong> ${coNtn}</span>` : ''}
                    ${coStrn ? `<span style="margin-left: 8px;"><strong>STRN:</strong> ${coStrn}</span>` : ''}
                </div>
                <div style="font-size: 10.5px; font-weight: 800; color: #1F4E79; margin-top: 3px;">
                    Inventory Balance (Stock Report) &bull; ${dateStr}
                </div>
            </div>
        </div>
        <div style="text-align: right;">
            <div class="report-badge">STOCK REPORT</div>
            <div style="font-size: 9.5px; color: #64748b; margin-top: 4px;">Print Date: ${new Date().toLocaleDateString('en-GB')}</div>
            <div style="font-size: 9px; color: #94a3b8;">User: ${session.username || session.name || 'Administrator'}</div>
        </div>
    </div>

    <div class="filter-meta-bar">
        <div>${filterSummaryHtml}</div>
        <div>Total Displayed: <strong>${totalItemsCount} Items</strong></div>
    </div>

    <table>
        <thead>
            <tr>
                <th rowspan="2" style="width: 25px; text-align: center;">#</th>
                <th rowspan="2" style="text-align: left;">Item Name / Description</th>
                <th rowspan="2" style="width: 65px; text-align: center;">Unit(s)</th>
                <th colspan="2" style="text-align: center;">Opening Stock</th>
                <th colspan="2" style="text-align: center;">In (Received)</th>
                <th colspan="2" style="text-align: center;">Out (Issued)</th>
                <th colspan="2" style="text-align: center;">Adjustment</th>
                <th colspan="2" style="text-align: center; background: #0b2942;">Closing Stock</th>
            </tr>
            <tr>
                <th style="width: 50px;">${u1Title}</th>
                <th style="width: 60px;">${u2Title}</th>
                <th style="width: 50px;">${u1Title}</th>
                <th style="width: 60px;">${u2Title}</th>
                <th style="width: 50px;">${u1Title}</th>
                <th style="width: 60px;">${u2Title}</th>
                <th style="width: 50px;">${u1Title}</th>
                <th style="width: 60px;">${u2Title}</th>
                <th style="width: 55px; background: #0b2942;">${u1Title}</th>
                <th style="width: 65px; background: #0b2942;">${u2Title}</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
        <tfoot>
            ${grandTotalHtml}
        </tfoot>
    </table>

    <div class="footer-signatures">
        <div class="sig-box">Prepared By: ${session.username || session.name || 'Administrator'}</div>
        <div class="sig-box">Checked By</div>
        <div class="sig-box">Approved By</div>
        <div style="font-size: 8.5px; color: #94a3b8; text-align: right;">Powered by SoftifyX &amp; Financials</div>
    </div>
</body>
</html>`;

        // Print in SAME TAB via hidden iframe without opening new window or tab
        let printFrame = document.getElementById('ib_print_frame');
        if (printFrame) printFrame.remove();

        printFrame = document.createElement('iframe');
        printFrame.id = 'ib_print_frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.style.visibility = 'hidden';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(printHtml);
        frameDoc.close();

        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch(e) {
                console.error('[IB] Print error:', e);
            }
        }, 300);
    },

    exportPDF: async function() {
        await this.printReport();
    },

    exportExcel: function() {
        const self = this;
        const records = self.balanceData.records || [];
        if (records.length === 0) return alert('No data to export.');

        if (typeof XLSX !== 'undefined') {
            const table = document.getElementById('ib_main_table');
            const wb = XLSX.utils.table_to_book(table, { sheet: "Inventory Balance" });
            XLSX.writeFile(wb, `Inventory_Balance_${new Date().toISOString().split('T')[0]}.xlsx`);
            return;
        }

        // Fallback: CSV export
        let csv = 'Item Code,Item Name,Category,Unit,Opening (Primary),Opening (Sec),In (Primary),In (Sec),Out (Primary),Out (Sec),Adj (Primary),Adj (Sec),Closing (Primary),Closing (Sec)\n';
        records.forEach(r => {
            csv += `"${r.item_code}","${r.item_name}","${r.group}","${r.unit_display}",${r.ob_primary},${r.ob_sec},${r.in_primary},${r.in_sec},${r.out_primary},${r.out_sec},${r.adj_primary},${r.adj_sec},${r.cb_primary},${r.cb_sec}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Inventory_Balance_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
};
