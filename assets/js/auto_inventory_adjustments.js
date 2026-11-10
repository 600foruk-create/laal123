window.AAModule = {
    data: {
        categories: [],
        brands: [],
        items: []
    },

    init: async function() {
        console.log("Initializing Auto Adjustments Module...");
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            // Fetch categories and brands for filters
            const res = await fetch(`api/auto_inventory_adjustments.php?action=get_dependencies&company_id=${companyId}`);
            if (res.ok) {
                const json = await res.json();
                this.data.categories = json.categories || [];
                this.data.brands = json.brands || [];
                this.populateSelects();
            }
            
            // Set default dates
            const today = new Date().toISOString().substring(0, 10);
            document.getElementById('aa_date_from').value = today;
            document.getElementById('aa_date_to').value = today;
            
            // Arrow key navigation
            document.getElementById('aa_grid_body').addEventListener('keydown', function(e) {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    const input = e.target;
                    if (input.tagName === 'INPUT' && input.type === 'number') {
                        e.preventDefault();
                        const tr = input.closest('tr');
                        const isPcs = input.classList.contains('phys-pcs');
                        const selector = isPcs ? '.phys-pcs' : '.phys-qty';
                        
                        let targetTr = e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling;
                        while (targetTr && targetTr.style.display === 'none') {
                            targetTr = e.key === 'ArrowUp' ? targetTr.previousElementSibling : targetTr.nextElementSibling;
                        }
                        
                        if (targetTr) {
                            const targetInput = targetTr.querySelector(selector);
                            if (targetInput) targetInput.focus();
                        }
                    }
                }
            });
            
        } catch (err) {
            console.error("Auto Adjust Dependencies Load Error:", err);
        }
    },

    populateSelects: function() {
        const catSelect = document.getElementById('aa_category_id');
        if (catSelect) {
            catSelect.innerHTML = '<option value="all">All Categories</option>' + 
                this.data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        const brandSelect = document.getElementById('aa_brand_id');
        if (brandSelect) {
            brandSelect.innerHTML = '<option value="all">All Brands</option>' + 
                this.data.brands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }
    },

    refreshList: function() {
        const search = document.getElementById('aa_search').value.toLowerCase();
        const catFilter = document.getElementById('aa_category_id').value;
        const trs = document.querySelectorAll('#aa_grid_body tr');
        const allCatIds = new Set();

        trs.forEach(tr => {
            const rowCatId = tr.getAttribute('data-cat-id');
            if (rowCatId) allCatIds.add(rowCatId);
            
            if (catFilter !== 'all' && rowCatId !== null && String(rowCatId) !== String(catFilter)) {
                tr.style.display = 'none';
                return;
            }

            if (!tr.hasAttribute('data-id')) {
                tr.style.display = ''; 
                return;
            }
            
            const name = tr.cells[2].innerText.toLowerCase();
            const code = tr.cells[1].innerText.toLowerCase();
            if (name.includes(search) || code.includes(search)) {
                tr.style.display = '';
            } else {
                tr.style.display = 'none';
            }
        });

        if (this.updateGroupTotals) {
            allCatIds.forEach(catId => this.updateGroupTotals(catId));
        }
    },

    loadData: async function() {
        console.log("Fetching differences...");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const catId = document.getElementById('aa_category_id').value;
        const brandId = document.getElementById('aa_brand_id').value;
        const toDate = document.getElementById('aa_date_to').value;
        
        const timestamp = new Date().getTime();
        let url = `api/inventory_balances.php?action=get_balances&company_id=${companyId}&to_date=${toDate}&_t=${timestamp}`;
        if (catId !== 'all') url += `&print_type=category&cat_id=${catId}`;
        if (brandId !== 'all') url += `&brand_id=${brandId}`;

        try {
            const res = await fetch(url);
            const json = await res.json();
            
            const tbody = document.getElementById('aa_grid_body');
            tbody.innerHTML = '';
            
            let savedAudit = {};
            try {
                const savedAuditStr = localStorage.getItem('softifyx_audit_data');
                if (savedAuditStr) savedAudit = JSON.parse(savedAuditStr);
            } catch(e) {
                console.error("Invalid audit data", e);
                localStorage.removeItem('softifyx_audit_data');
            }
            
            const grouped = {};
            // Pre-populate with all defined categories to ensure they show up even if empty
            if (this.data && this.data.categories) {
                this.data.categories.forEach(cat => {
                    if (cat.name) grouped[cat.name] = { type: cat.category_type || 'None', id: cat.id, items: [] };
                });
            }
            
            if (json.data && json.data.length > 0) {
                json.data.forEach(item => {
                    const cName = item.main_category_name || 'Uncategorized';
                    const cType = item.main_category_type || 'None';
                    if (!grouped[cName]) {
                        grouped[cName] = { type: cType, id: item.main_category_id || item.category_id || '', items: [] };
                    }
                    grouped[cName].items.push(item);
                });
            }
            
            const groupKeys = Object.keys(grouped).sort((a, b) => {
                    const typeWeight = (type) => {
                        const t = (type || '').toLowerCase();
                        if (t === 'pipes') return 1;
                        if (t === 'fitting') return 2;
                        return 3;
                    };
                    const wA = typeWeight(grouped[a].type);
                    const wB = typeWeight(grouped[b].type);
                    if (wA !== wB) return wA - wB;
                    return a.localeCompare(b);
                });

                let globalIdx = 0;
                groupKeys.forEach(gName => {
                    const gData = grouped[gName];
                    const isFitting = (gData.type || '').toLowerCase() === 'fitting';
                    
                    // Group Header Row
                    const trGroup = document.createElement('tr');
                    trGroup.setAttribute('data-cat-id', gData.id || '');
                    trGroup.style.backgroundColor = '#ffffff'; // white color
                    trGroup.style.color = '#0f172a';
                    trGroup.style.fontWeight = 'bold';
                    trGroup.innerHTML = `<td colspan="10" style="padding: 6px; text-align: left; font-size: 12px; border: 1px solid #cbd5e0; text-transform: uppercase;">CATEGORY: ${gName} - ${gData.type}</td>`;
                    tbody.appendChild(trGroup);

                    // Repeated Main Header
                    const trMain1 = document.createElement('tr');
                    trMain1.className = 'repeated-header';
                    trMain1.setAttribute('data-cat-id', gData.id || '');
                    trMain1.style.backgroundColor = '#f1f5f9';
                    trMain1.style.color = '#334155';
                    trMain1.style.fontWeight = 'bold';
                    trMain1.style.fontSize = '9px';
                    trMain1.style.textTransform = 'uppercase';
                    trMain1.style.textAlign = 'center';
                    trMain1.innerHTML = `
                        <td rowspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">S.No</td>
                        <td rowspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">Item Code</td>
                        <td rowspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">Item Name</td>
                        <td colspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">System</td>
                        <td colspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">Physical</td>
                        <td colspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">Difference</td>
                        <td rowspan="2" style="border: 1px solid #cbd5e0; padding: 2px;">Action</td>
                    `;
                    tbody.appendChild(trMain1);
                    
                    const trMain2 = document.createElement('tr');
                    trMain2.className = 'repeated-header';
                    trMain2.setAttribute('data-cat-id', gData.id || '');
                    trMain2.style.backgroundColor = '#f1f5f9';
                    trMain2.style.color = '#334155';
                    trMain2.style.fontWeight = 'bold';
                    trMain2.style.fontSize = '9px';
                    trMain2.style.textTransform = 'uppercase';
                    trMain2.style.textAlign = 'center';
                    const label1 = isFitting ? 'Carton' : 'Pcs';
                    const label2 = isFitting ? 'Pcs' : 'Qty (Wt)';

                    trMain2.innerHTML = `
                        <td style="border: 1px solid #cbd5e0; padding: 2px;">${label1}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 2px;">${label2}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 2px;">${label1}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 2px;">${label2}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 2px;">${label1}</td>
                        <td style="border: 1px solid #cbd5e0; padding: 2px;">${label2}</td>
                    `;
                    tbody.appendChild(trMain2);

                    if (gData.items.length === 0) {
                        const trEmpty = document.createElement('tr');
                        trEmpty.setAttribute('data-cat-id', gData.id || '');
                        trEmpty.innerHTML = `<td colspan="10" style="padding: 10px; text-align: center; color: #64748b; font-style: italic; border: 1px solid #cbd5e0;">No items found in this category.</td>`;
                        tbody.appendChild(trEmpty);
                    } else {
                        gData.items.forEach((item) => {
                            const savedEntry = savedAudit[item.item_id] || { pcs: "0", qty: "0" };
                            const tr = document.createElement('tr');
                            tr.setAttribute('data-cat-id', gData.id || '');
                            tr.setAttribute('data-id', item.item_id);
                            tr.setAttribute('data-qty-per-piece', item.qty_per_piece || 0);
                            tr.style.borderBottom = "1px solid #cbd5e0";
                            tr.style.color = "#000";
                            tr.style.fontWeight = "600";
                            tr.innerHTML = `
                                <td style="padding: 4px; text-align: center; border-right: 1px solid #cbd5e0;">${globalIdx + 1}</td>
                                <td style="padding: 4px; border-right: 1px solid #cbd5e0;">${item.item_code}</td>
                                <td style="padding: 4px; border-right: 1px solid #cbd5e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.item_name}">${item.item_name}</td>
                                <td style="padding: 4px; text-align: center; border-right: 1px solid #cbd5e0;" class="sys-pcs">${item.cb_pcs}</td>
                                <td style="padding: 4px; text-align: center; border-right: 1px solid #cbd5e0;" class="sys-qty">${item.cb}</td>
                                <td style="padding: 0; border-right: 1px solid #cbd5e0; position: relative;"><input type="number" class="ria-grid-input num phys-pcs" value="${savedEntry.pcs}" onfocus="this.select()" oninput="window.AAModule.calculateDiff(this)"></td>
                                <td style="padding: 0; border-right: 1px solid #cbd5e0; position: relative;"><input type="number" class="ria-grid-input num phys-qty" value="${savedEntry.qty}" onfocus="this.select()" oninput="window.AAModule.calculateDiff(this)"></td>
                                <td style="padding: 4px; text-align: center; border-right: 1px solid #cbd5e0; font-weight:bold;" class="diff-pcs">0</td>
                                <td style="padding: 2px; text-align: center; border-right: 1px solid #cbd5e0; font-weight:bold;" class="diff-qty">0</td>
                                <td style="padding: 2px; text-align: center;">
                                    <button class="ria-btn-info" style="padding: 2px 0; font-size: 9px; margin: 0; width: 100%; border: none; border-radius: 2px; cursor: pointer;" onclick="window.AAModule.adjustSingleItem(this)">Adjust</button>
                                </td>
                            `;
                            tbody.appendChild(tr);
                            globalIdx++;
                        });

                        // Total Row for the category
                        const trTotal = document.createElement('tr');
                        trTotal.className = 'cat-total-row';
                        trTotal.setAttribute('data-cat-id', gData.id || '');
                        trTotal.style.backgroundColor = '#e2e8f0';
                        trTotal.style.fontWeight = 'bold';
                        trTotal.style.color = '#0f172a';
                        trTotal.style.fontSize = '11px';
                        trTotal.innerHTML = `
                            <td colspan="3" style="text-align: right; padding: 6px 10px; border: 1px solid #cbd5e0;">TOTALS:</td>
                            <td style="text-align: center; padding: 6px; border: 1px solid #cbd5e0;" class="tot-sys-pcs">0.00</td>
                            <td style="text-align: center; padding: 6px; border: 1px solid #cbd5e0;" class="tot-sys-qty">0.00</td>
                            <td style="text-align: center; padding: 6px; border: 1px solid #cbd5e0;" class="tot-phys-pcs">0.00</td>
                            <td style="text-align: center; padding: 6px; border: 1px solid #cbd5e0;" class="tot-phys-qty">0.00</td>
                            <td style="text-align: center; padding: 6px; border: 1px solid #cbd5e0;" class="tot-diff-pcs">0.00</td>
                            <td style="text-align: center; padding: 6px; border: 1px solid #cbd5e0;" class="tot-diff-qty">0.00</td>
                            <td style="border: 1px solid #cbd5e0;"></td>
                        `;
                        tbody.appendChild(trTotal);
                    }
                });
                
                // Initialize differences for default 0 values
                const allPcsInputs = tbody.querySelectorAll('.phys-pcs');
                allPcsInputs.forEach(inp => window.AAModule.calculateDiff(inp));

            if (Object.keys(grouped || {}).length === 0 && (!json.data || json.data.length === 0)) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 10px;">No records found.</td></tr>';
            }
            this.refreshList();
        } catch (err) {
            console.error(err);
            alert("Failed to load inventory balances");
        }
    },
    
    updateGroupTotals: function(catId) {
        if (!catId) return;
        const tbody = document.getElementById('aa_grid_body');
        const rows = tbody.querySelectorAll(`tr[data-id][data-cat-id="${catId}"]`);
        
        let tSysPcs = 0, tSysQty = 0;
        let tPhysPcs = 0, tPhysQty = 0;
        let tDiffPcs = 0, tDiffQty = 0;
        
        rows.forEach(r => {
            if (r.style.display === 'none') return;
            
            tSysPcs += parseFloat(r.querySelector('.sys-pcs').innerText) || 0;
            tSysQty += parseFloat(r.querySelector('.sys-qty').innerText) || 0;
            
            const physPcsVal = r.querySelector('.phys-pcs').value;
            tPhysPcs += physPcsVal === '' ? 0 : parseFloat(physPcsVal);
            
            const physQtyVal = r.querySelector('.phys-qty').value;
            tPhysQty += physQtyVal === '' ? 0 : parseFloat(physQtyVal);
            
            tDiffPcs += parseFloat(r.querySelector('.diff-pcs').innerText) || 0;
            tDiffQty += parseFloat(r.querySelector('.diff-qty').innerText) || 0;
        });
        
        const trTotal = tbody.querySelector(`tr.cat-total-row[data-cat-id="${catId}"]`);
        if (trTotal) {
            trTotal.querySelector('.tot-sys-pcs').innerText = tSysPcs.toFixed(2);
            trTotal.querySelector('.tot-sys-qty').innerText = tSysqty.toFixed(4);
            trTotal.querySelector('.tot-phys-pcs').innerText = tPhysPcs.toFixed(2);
            trTotal.querySelector('.tot-phys-qty').innerText = tPhysqty.toFixed(4);
            
            const diffPcsCell = trTotal.querySelector('.tot-diff-pcs');
            diffPcsCell.innerText = tDiffPcs.toFixed(2);
            diffPcsCell.style.color = tDiffPcs > 0 ? 'green' : (tDiffPcs < 0 ? 'red' : 'black');
            
            const diffQtyCell = trTotal.querySelector('.tot-diff-qty');
            diffQtyCell.innerText = tDiffqty.toFixed(4);
            diffQtyCell.style.color = tDiffQty > 0 ? 'green' : (tDiffQty < 0 ? 'red' : 'black');
        }
    },

    calculateDiff: function(input) {
        const tr = input.closest('tr');
        
        // Auto-calculate Qty (Weight) if Pieces is typed
        const isPcs = input.classList.contains('phys-pcs');
        const qtyPerPiece = parseFloat(tr.getAttribute('data-qty-per-piece')) || 0;
        
        if (isPcs) {
            const pcsStr = input.value;
            const pcs = pcsStr === '' ? 0 : parseFloat(pcsStr);
            if (qtyPerPiece > 0) {
                const physQtyInput = tr.querySelector('.phys-qty');
                physQtyInput.value = (pcs * qtyPerPiece).toFixed(4);
            }
        }
        
        // System values
        const sysPcs = parseFloat(tr.querySelector('.sys-pcs').innerText) || 0;
        const sysQty = parseFloat(tr.querySelector('.sys-qty').innerText) || 0;
        
        // Diff cells
        const diffPcsCell = tr.querySelector('.diff-pcs');
        const diffQtyCell = tr.querySelector('.diff-qty');
        
        // Pcs difference
        const physPcsInput = tr.querySelector('.phys-pcs');
        const physPcs = physPcsInput.value === '' ? 0 : parseFloat(physPcsInput.value);
        const diffPcs = physPcs - sysPcs;
        diffPcsCell.innerText = diffPcs.toFixed(2);
        diffPcsCell.style.color = diffPcs > 0 ? 'green' : (diffPcs < 0 ? 'red' : 'black');

        // Qty difference
        const physQtyInput = tr.querySelector('.phys-qty');
        const physQty = physQtyInput.value === '' ? 0 : parseFloat(physQtyInput.value);
        const diffQty = physQty - sysQty;
        diffQtyCell.innerText = diffqty.toFixed(4);
        diffQtyCell.style.color = diffQty > 0 ? 'green' : (diffQty < 0 ? 'red' : 'black');
        
        const catId = tr.getAttribute('data-cat-id');
        if (catId && this.updateGroupTotals) {
            this.updateGroupTotals(catId);
        }
    },

    saveAudit: function() {
        const trs = document.querySelectorAll('#aa_grid_body tr');
        let auditData = {};
        trs.forEach(tr => {
            if (!tr.hasAttribute('data-id')) return;
            const itemId = tr.getAttribute('data-id');
            const physPcs = tr.querySelector('.phys-pcs').value;
            const physQty = tr.querySelector('.phys-qty').value;
            auditData[itemId] = { pcs: physPcs, qty: physQty };
        });
        localStorage.setItem('softifyx_audit_data', JSON.stringify(auditData));
        alert("Audit Data Saved Successfully!");
    },

    autoAdjustAll: async function() {
        if(!confirm("Are you sure you want to automatically adjust all differences? This will post Add/Reduce entries.")) return;
        
        const trs = document.querySelectorAll('#aa_grid_body tr');
        let adjustments = [];
        trs.forEach(tr => {
            if (!tr.hasAttribute('data-id')) return;
            const diffPcs = parseFloat(tr.querySelector('.diff-pcs').innerText) || 0;
            const diffQty = parseFloat(tr.querySelector('.diff-qty').innerText) || 0;
            
            if (diffPcs !== 0 || diffQty !== 0) {
                adjustments.push({
                    item_id: tr.getAttribute('data-id'),
                    diff_pcs: diffPcs,
                    diff_qty: diffQty
                });
            }
        });
        
        if (adjustments.length === 0) {
            alert("No differences to adjust.");
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const date = document.getElementById('aa_date_to').value;

        try {
            const res = await fetch(`api/auto_inventory_adjustments.php?action=auto_adjust&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: date, adjustments: adjustments })
            });
            const json = await res.json();
            if (json.status === 'success') {
                alert("Auto Adjustment successful!");
                this.loadData();
            } else {
                alert("Error: " + json.message);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to auto adjust");
        }
    },

    adjustSingleItem: async function(btn) {
        const tr = btn.closest('tr');
        if (!tr || !tr.hasAttribute('data-id')) return;
        
        const diffPcs = parseFloat(tr.querySelector('.diff-pcs').innerText) || 0;
        const diffQty = parseFloat(tr.querySelector('.diff-qty').innerText) || 0;
        
        if (diffPcs === 0 && diffQty === 0) {
            alert("No differences to adjust for this item.");
            return;
        }

        if(!confirm("Are you sure you want to adjust this single item? This will post an Add/Reduce entry.")) return;
        
        const adjustments = [{
            item_id: tr.getAttribute('data-id'),
            diff_pcs: diffPcs,
            diff_qty: diffQty
        }];

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const date = document.getElementById('aa_date_to').value;

        try {
            const res = await fetch(`api/auto_inventory_adjustments.php?action=auto_adjust&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: date, adjustments: adjustments })
            });
            const json = await res.json();
            if (json.status === 'success') {
                alert("Item adjusted successfully!");
                // Remove this item from saved audit so it doesn't revert to old values on reload
                const savedAuditStr = localStorage.getItem('softifyx_audit_data');
                if (savedAuditStr) {
                    try {
                        let savedAudit = JSON.parse(savedAuditStr);
                        if(savedAudit[adjustments[0].item_id]) {
                            delete savedAudit[adjustments[0].item_id];
                            localStorage.setItem('softifyx_audit_data', JSON.stringify(savedAudit));
                        }
                    } catch(e){}
                }
                this.loadData();
            } else {
                alert("Error: " + json.message);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to adjust item");
        }
    },
    
    exportToExcel: function() {
        const originalTable = document.querySelector('#aa_grid_container table');
        if (!originalTable) return;
        const table = originalTable.cloneNode(true);
        
        // Remove Action column header
        const headerRows = table.querySelectorAll('thead tr');
        if (headerRows.length > 0) {
            const firstRowThs = headerRows[0].querySelectorAll('th');
            if (firstRowThs.length > 0) firstRowThs[firstRowThs.length - 1].remove();
        }
        
        // Replace inputs and remove Action cell
        const trs = table.querySelectorAll('tbody tr');
        trs.forEach(tr => {
            if (tr.style.display === 'none' || tr.classList.contains('repeated-header')) {
                tr.remove();
                return;
            }
            const inputs = tr.querySelectorAll('input');
            inputs.forEach(input => {
                const td = input.parentElement;
                td.innerText = input.value;
            });
            const tds = tr.querySelectorAll('td');
            if (tr.hasAttribute('data-id') && tds.length > 1) {
                tds[tds.length - 1].remove();
            } else if (!tr.hasAttribute('data-id') && tds.length > 1) {
                tds[tds.length - 1].remove();
            } else if (!tr.hasAttribute('data-id') && tds.length === 1) {
                let cs = parseInt(tds[0].getAttribute('colspan') || 10);
                tds[0].setAttribute('colspan', cs - 1);
            }
        });
        
        const html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"></head><body>
            <table border="1">${table.innerHTML}</table>
            </body></html>
        `;
        
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Auto_Adjustments_' + new Date().toISOString().substring(0,10) + '.xls';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    printAudit: async function() {
        const originalTable = document.querySelector('#aa_grid_container table');
        if (!originalTable) return;
        const table = originalTable.cloneNode(true);
        
        // Remove Action column and Item Code column headers
        const headerRows = table.querySelectorAll('thead tr');
        if (headerRows.length > 0) {
            const firstRowThs = headerRows[0].querySelectorAll('th');
            if (firstRowThs.length > 1) {
                firstRowThs[firstRowThs.length - 1].remove(); // Action
                firstRowThs[1].remove(); // Item Code
            }
        }
        
        // Remove colgroup cols to fix widths
        const colgroup = table.querySelector('colgroup');
        if (colgroup) {
            const cols = colgroup.querySelectorAll('col');
            if (cols.length > 1) {
                cols[cols.length - 1].remove(); // Action
                cols[1].remove(); // Item Code
            }
        }
        
        // Remove hidden rows BEFORE stripping inline styles
        let trs = table.querySelectorAll('tbody tr');
        trs.forEach(tr => {
            if (tr.style.display === 'none') {
                tr.remove();
            }
        });

        // Replace inputs and remove Action/Item Code cells in remaining rows
        trs = table.querySelectorAll('tbody tr');
        trs.forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            inputs.forEach(input => {
                const td = input.parentElement;
                td.innerText = input.value;
            });
            const tds = tr.querySelectorAll('td');
            if (tr.hasAttribute('data-id') && tds.length > 1) {
                tds[tds.length - 1].remove(); // Action
                tds[1].remove(); // Item Code
            } else if (!tr.hasAttribute('data-id') && tds.length > 1) {
                if (tr.classList.contains('repeated-header')) {
                    if (tds.length === 7) {
                        tds[6].remove(); // Action
                        tds[1].remove(); // Item Code
                    }
                } else {
                    tds[tds.length - 1].remove(); // Action
                }
            } else if (!tr.hasAttribute('data-id') && tds.length === 1) {
                let cs = parseInt(tds[0].getAttribute('colspan') || 10);
                tds[0].setAttribute('colspan', cs - 2);
            }
        });

        // NOW remove all inline styles from table and its children to allow print CSS to take over
        const allElements = table.querySelectorAll('*');
        table.removeAttribute('style');
        allElements.forEach(el => el.removeAttribute('style'));
        
        // Add grid-table class for CSS targeting
        table.className = 'grid-table';

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const printedBy = session.name || session.username || 'Administrator';
        
        let compName = 'Company Name', compAddr = '', compPhone = '', compEmail = '';
        let logoSrc = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : 'assets/logos/logo.png';

        try {
            const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}`);
            if(res.ok) {
                const data = await res.json();
                if (data && !data.error) {
                    compName = data.name || compName;
                    compAddr = data.address || '';
                    compPhone = data.phone || '';
                    compEmail = data.email || '';
                    if (data.logo_data && data.logo_data.startsWith('data:image')) {
                        logoSrc = data.logo_data;
                    }
                }
            }
        } catch(e) { console.error('Failed to load company info for print', e); }
        
        const toDate = document.getElementById('aa_date_to').value;

        const printWindow = window.open('', '_blank');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print Auto Adjustments Audit</title>
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

                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                    .grid-table thead th { border: 1px solid #333; background: #f1f5f9; padding: 6px 4px; text-align: center; font-size: 11px; }
                    .grid-table tbody td { padding: 5px; border: 1px solid #333; text-align: center; }
                    .grid-table tfoot td { border: 2px solid #333; padding: 6px 4px; font-weight: bold; }

                    .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .signature-line { border-top: 1px solid #333; width: 180px; text-align: center; font-weight: bold; font-size: 10px; padding-top: 4px; }
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
                        <div class="invoice-title">AUTO INVENTORY ADJUSTMENTS</div>
                        <div class="invoice-type-badge">AUDIT</div>
                    </div>
                </div>

                <div class="title-row">
                    <div>
                        <div style="margin-top:4px;"><b>To Date:</b> &nbsp; ${toDate}</div>
                    </div>
                </div>

                ${table.outerHTML}
                
                <div class="footer">
                    <div style="font-size: 9px;">Printed By: ${printedBy}</div>
                    <div class="signature-line">Authorized Signature</div>
                </div>
            </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    },

    resetSession: function() {
        if(confirm("Are you sure you want to reset manual entries? This will set all physical quantities to 0 and clear saved audit data.")) {
            localStorage.removeItem('softifyx_audit_data');
            const pcsInputs = document.querySelectorAll('#aa_grid_body .phys-pcs');
            const qtyInputs = document.querySelectorAll('#aa_grid_body .phys-qty');
            pcsInputs.forEach(i => i.value = '0');
            qtyInputs.forEach(i => {
                i.value = '0';
                this.calculateDiff(i);
            });
        }
    },

    clearFilters: function() {
        document.getElementById('aa_category_id').value = 'all';
        document.getElementById('aa_brand_id').value = 'all';
        document.getElementById('aa_search').value = '';
        this.refreshList();
    }
};



