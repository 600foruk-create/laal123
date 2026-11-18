/**
 * Customer Regions Module
 * Hierarchical management: Main Region -> Sub Region -> List (Area)
 * Supports full CRUD, Hierarchy Chart, and Excel/CSV Export & Import
 */
(function() {
    let mainRegionData = [];
    let subRegionData = [];
    let listRegionData = [];
    let selectedMainRegionId = null;
    let selectedSubRegionId = null;
    let selectedListRegionId = null;

    function getCompanyId() {
        try {
            const sess = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            return window.selectedCompanyId || sess.company_id || 1;
        } catch(e) {
            return 1;
        }
    }

    function initRegionsView() {
        if (typeof window.applyCustomRegionLabels === 'function') {
            window.applyCustomRegionLabels(document.getElementById('regionsContainer'));
        }
        let retries = 0;
        const checkAndRender = setInterval(async () => {
            const list = document.getElementById('mainRegionList');
            const list3 = document.getElementById('listRegionList');
            if (list && list3) {
                clearInterval(checkAndRender);
                if (typeof window.applyCustomRegionLabels === 'function') {
                    window.applyCustomRegionLabels(document.getElementById('regionsContainer'));
                }
                await fetchMainRegions();
            } else if (++retries >= 30) {
                clearInterval(checkAndRender);
            }
        }, 80);
    }

    async function fetchMainRegions() {
        try {
            const compId = getCompanyId();
            const res = await fetch(`api/maintain.php?action=get_regions&company_id=${compId}&_t=${Date.now()}`);
            if (!res.ok) throw new Error('Failed to fetch main regions');
            mainRegionData = await res.json();
            const list = document.getElementById('mainRegionList');
            if (list) {
                list.innerHTML = (mainRegionData || []).map(r => `<option value="${r.id}">${r.name}</option>`).join('');
                if (list.options.length > 0) {
                    // Keep currently selected or auto-select first item
                    let idx = 0;
                    if (selectedMainRegionId) {
                        const found = Array.from(list.options).findIndex(o => o.value == selectedMainRegionId);
                        if (found !== -1) idx = found;
                    }
                    list.selectedIndex = idx;
                    await onMainRegionSelect(list.options[idx].value);
                } else {
                    resetMainRegionForm();
                }
            }
        } catch(e) {
            console.error('Error fetching main regions:', e);
        }
    }

    async function onMainRegionSelect(id) {
        selectedMainRegionId = id;
        const reg = (mainRegionData || []).find(r => r.id == id);
        const nameInput = document.getElementById('mainRegionName');
        if (reg && nameInput) {
            nameInput.value = reg.name;
            nameInput.disabled = false;
        }

        const subList = document.getElementById('subRegionList');
        if (subList) subList.innerHTML = '';
        const listRegionList = document.getElementById('listRegionList');
        if (listRegionList) listRegionList.innerHTML = '';

        await fetchSubRegions(id);
    }

    async function fetchSubRegions(regionId) {
        if (!regionId) {
            resetSubRegionForm();
            return;
        }
        try {
            const res = await fetch(`api/maintain.php?action=get_sub_regions&region_id=${regionId}&_t=${Date.now()}`);
            if (!res.ok) throw new Error('Failed to fetch sub regions');
            subRegionData = await res.json();
            const list = document.getElementById('subRegionList');
            if (list) {
                list.innerHTML = (subRegionData || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                if (list.options.length > 0) {
                    let idx = 0;
                    if (selectedSubRegionId) {
                        const found = Array.from(list.options).findIndex(o => o.value == selectedSubRegionId);
                        if (found !== -1) idx = found;
                    }
                    list.selectedIndex = idx;
                    await onSubRegionSelect(list.options[idx].value);
                } else {
                    resetSubRegionForm();
                }
            }
        } catch(e) {
            console.error('Error fetching sub regions:', e);
            resetSubRegionForm();
        }
    }

    async function onSubRegionSelect(id) {
        selectedSubRegionId = id;
        const sub = (subRegionData || []).find(s => s.id == id);
        const nameInput = document.getElementById('subRegionName');
        if (sub && nameInput) {
            nameInput.value = sub.name;
            nameInput.disabled = false;
        }

        const listRegionList = document.getElementById('listRegionList');
        if (listRegionList) listRegionList.innerHTML = '';

        await fetchListRegions(id);
    }

    async function fetchListRegions(subRegionId) {
        if (!subRegionId) {
            resetListRegionForm();
            return;
        }
        try {
            const res = await fetch(`api/maintain.php?action=get_list_regions&sub_region_id=${subRegionId}&_t=${Date.now()}`);
            if (!res.ok) throw new Error('Failed to fetch list regions');
            listRegionData = await res.json();
            const list = document.getElementById('listRegionList');
            if (list) {
                list.innerHTML = (listRegionData || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
                if (list.options.length > 0) {
                    let idx = 0;
                    if (selectedListRegionId) {
                        const found = Array.from(list.options).findIndex(o => o.value == selectedListRegionId);
                        if (found !== -1) idx = found;
                    }
                    list.selectedIndex = idx;
                    onListRegionSelect(list.options[idx].value);
                } else {
                    resetListRegionForm();
                }
            }
        } catch(e) {
            console.error('Error fetching list regions:', e);
            resetListRegionForm();
        }
    }

    function onListRegionSelect(id) {
        selectedListRegionId = id;
        const lr = (listRegionData || []).find(l => l.id == id);
        const nameInput = document.getElementById('listRegionName');
        if (lr && nameInput) {
            nameInput.value = lr.name;
            nameInput.disabled = false;
        }
    }

    // --- MAIN REGION CRUD ---
    async function saveMainRegion() {
        const lbls = window.getCustomRegionLabels ? window.getCustomRegionLabels() : { main: 'Main Region', sub: 'Sub Region', list: 'List' };
        const nameInput = document.getElementById('mainRegionName');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) return alert(`${lbls.main} Name is required!`);
        const compId = getCompanyId();
        const payload = { name, company_id: compId };
        if (selectedMainRegionId) payload.id = selectedMainRegionId;
        try {
            const res = await fetch('api/maintain.php?action=save_region', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert(`${lbls.main} saved successfully!`);
                if (!selectedMainRegionId && data.id) {
                    selectedMainRegionId = data.id;
                }
                await fetchMainRegions();
                if (typeof window.loadCustomerLookups === 'function') window.loadCustomerLookups();
            } else {
                alert(`Error saving ${lbls.main}: ` + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error(e);
            alert(`Failed to save ${lbls.main}.`);
        }
    }

    async function deleteMainRegion() {
        if (!selectedMainRegionId) return alert("Select a Main Region to delete first.");
        if (subRegionData && subRegionData.length > 0) {
            return alert("Cannot delete! Please delete all sub-regions first before deleting the main region.");
        }
        if (confirm("Are you sure you want to delete this Main Region? This action cannot be undone.")) {
            try {
                const res = await fetch(`api/maintain.php?action=delete_region&id=${selectedMainRegionId}`, { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    alert("Main Region deleted.");
                    selectedMainRegionId = null;
                    await fetchMainRegions();
                    if (typeof window.loadCustomerLookups === 'function') window.loadCustomerLookups();
                } else {
                    alert("Error deleting region: " + (data.message || 'Unknown error'));
                }
            } catch(e) {
                alert("Failed to delete region.");
            }
        }
    }

    function resetMainRegionForm(generate = false) {
        const nameInput = document.getElementById('mainRegionName');
        if (nameInput) {
            nameInput.value = '';
            nameInput.disabled = !generate;
            if (generate) nameInput.focus();
        }
        const list = document.getElementById('mainRegionList');
        if (list) list.selectedIndex = -1;
        selectedMainRegionId = null;
        resetSubRegionForm(false);
    }

    // --- SUB REGION CRUD ---
    async function saveSubRegion() {
        const lbls = window.getCustomRegionLabels ? window.getCustomRegionLabels() : { main: 'Main Region', sub: 'Sub Region', list: 'List' };
        if (!selectedMainRegionId) return alert(`Select a ${lbls.main} first!`);
        const nameInput = document.getElementById('subRegionName');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) return alert(`${lbls.sub} Name is required!`);
        const payload = { region_id: selectedMainRegionId, name };
        if (selectedSubRegionId) payload.id = selectedSubRegionId;
        try {
            const res = await fetch('api/maintain.php?action=save_sub_region', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert(`${lbls.sub} saved successfully!`);
                if (!selectedSubRegionId && data.id) {
                    selectedSubRegionId = data.id;
                }
                await fetchSubRegions(selectedMainRegionId);
                resetSubRegionForm(false);
            } else {
                alert(`Error saving ${lbls.sub}: ` + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error(e);
            alert(`Failed to save ${lbls.sub}.`);
        }
    }

    async function deleteSubRegion() {
        const lbls = window.getCustomRegionLabels ? window.getCustomRegionLabels() : { main: 'Main Region', sub: 'Sub Region', list: 'List' };
        if (!selectedSubRegionId) return alert(`Select a ${lbls.sub} to delete first.`);
        if (listRegionData && listRegionData.length > 0) {
            return alert(`Cannot delete! Please delete all ${lbls.list} areas under this ${lbls.sub} first.`);
        }
        if (confirm(`Are you sure you want to delete this ${lbls.sub}?`)) {
            try {
                const res = await fetch(`api/maintain.php?action=delete_sub_region&id=${selectedSubRegionId}`, { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    alert(`${lbls.sub} deleted.`);
                    selectedSubRegionId = null;
                    await fetchSubRegions(selectedMainRegionId);
                } else {
                    alert(`Error deleting ${lbls.sub}: ` + (data.message || 'Unknown error'));
                }
            } catch(e) {
                alert(`Failed to delete ${lbls.sub}.`);
            }
        }
    }

    function resetSubRegionForm(generate = false) {
        const nameInput = document.getElementById('subRegionName');
        if (nameInput) {
            nameInput.value = '';
            nameInput.disabled = !generate;
            if (generate) nameInput.focus();
        }
        const list = document.getElementById('subRegionList');
        if (list) list.selectedIndex = -1;
        selectedSubRegionId = null;
        resetListRegionForm(false);
    }

    // --- LIST (AREA) REGION CRUD ---
    async function saveListRegion() {
        const lbls = window.getCustomRegionLabels ? window.getCustomRegionLabels() : { main: 'Main Region', sub: 'Sub Region', list: 'List' };
        if (!selectedSubRegionId) return alert(`Select a ${lbls.sub} first!`);
        const nameInput = document.getElementById('listRegionName');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) return alert(`${lbls.list} Name is required!`);
        const payload = { sub_region_id: selectedSubRegionId, name };
        if (selectedListRegionId) payload.id = selectedListRegionId;
        try {
            const res = await fetch('api/maintain.php?action=save_list_region', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert(`${lbls.list} saved successfully!`);
                if (!selectedListRegionId && data.id) {
                    selectedListRegionId = data.id;
                }
                await fetchListRegions(selectedSubRegionId);
                resetListRegionForm(false);
            } else {
                alert(`Error saving ${lbls.list}: ` + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error(e);
            alert("Failed to save List Region.");
        }
    }

    async function deleteListRegion() {
        if (!selectedListRegionId) return alert("Select a List Region to delete first.");
        if (confirm("Are you sure you want to delete this list area?")) {
            try {
                const res = await fetch(`api/maintain.php?action=delete_list_region&id=${selectedListRegionId}`, { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    alert("List Region deleted.");
                    selectedListRegionId = null;
                    await fetchListRegions(selectedSubRegionId);
                } else {
                    alert("Error deleting list region: " + (data.message || 'Unknown error'));
                }
            } catch(e) {
                alert("Failed to delete list region.");
            }
        }
    }

    function resetListRegionForm(generate = false) {
        const nameInput = document.getElementById('listRegionName');
        if (nameInput) {
            nameInput.value = '';
            nameInput.disabled = !generate;
            if (generate) nameInput.focus();
        }
        const list = document.getElementById('listRegionList');
        if (list) list.selectedIndex = -1;
        selectedListRegionId = null;
    }

    // =========================================================================
    // EXCEL EXPORT & IMPORT LOGIC (SheetJS Engine)
    // =========================================================================
    function loadSheetJS(callback) {
        if (typeof XLSX !== 'undefined') {
            callback();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = callback;
        script.onerror = function() {
            alert('Failed to load Excel library (xlsx.full.min.js). Please check internet connection.');
        };
        document.head.appendChild(script);
    }

    async function cleanupOrphanRegions() {
        if (!confirm("Are you sure you want to clean up rogue main regions (like Haripur, Mardan, Peshawar, 44444)?\n\nKya aap in faltu/rogue main regions ko Main Region list se hatana chahte hain?")) {
            return;
        }
        const compId = getCompanyId();
        try {
            const res = await fetch(`api/maintain.php?action=cleanup_orphan_regions&company_id=${compId}&_t=${Date.now()}`);
            const data = await res.json();
            if (data.status === 'success') {
                alert("✓ " + data.message);
                await fetchMainRegions();
                if (typeof window.loadCustomerLookups === 'function') window.loadCustomerLookups();
            } else {
                alert("✕ Cleanup failed: " + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error('Cleanup error:', e);
            alert("Failed to run cleanup: " + e.message);
        }
    }

    async function clearAllRegions() {
        if (!confirm("WARNING: Are you sure you want to clear ALL Customer Regions (Main, Sub, and Area Lists)?\n\nKhabardar: Kya aap tamam regions mukammal tor par clear karna chahte hain?")) {
            return;
        }
        const compId = getCompanyId();
        try {
            const res = await fetch(`api/maintain.php?action=clear_all_regions&company_id=${compId}&_t=${Date.now()}`);
            const data = await res.json();
            if (data.status === 'success') {
                alert("✓ " + data.message);
                selectedMainRegionId = null;
                selectedSubRegionId = null;
                selectedListRegionId = null;
                resetMainRegionForm(false);
                await fetchMainRegions();
                if (typeof window.loadCustomerLookups === 'function') window.loadCustomerLookups();
            } else {
                alert("✕ Clear failed: " + (data.message || 'Unknown error'));
            }
        } catch(e) {
            console.error('Clear error:', e);
            alert("Failed to clear regions: " + e.message);
        }
    }

    async function exportRegions(level = 'all') {
        const compId = getCompanyId();
        const filename = `Customer_Regions_Hierarchy_${new Date().toISOString().split('T')[0]}.xlsx`;

        try {
            const res = await fetch(`api/maintain.php?action=get_all_regions_hierarchy&company_id=${compId}&_t=${Date.now()}`);
            const allData = await res.json();
            if (!allData || allData.length === 0) {
                return alert("No regions found to export.");
            }

            const rows = [['MAIN REGION', 'SUB REGION', 'LIST / AREA']];

            allData.forEach(m => {
                const mainName = m.name || '';
                if (m.subs && m.subs.length > 0) {
                    m.subs.forEach((s, sIdx) => {
                        const subName = s.name || '';
                        if (s.lists && s.lists.length > 0) {
                            s.lists.forEach((l, lIdx) => {
                                const listName = l.name || '';
                                const colMain = (sIdx === 0 && lIdx === 0) ? mainName : '';
                                const colSub = (lIdx === 0) ? subName : '';
                                rows.push([colMain, colSub, listName]);
                            });
                        } else {
                            const colMain = (sIdx === 0) ? mainName : '';
                            rows.push([colMain, subName, '-']);
                        }
                    });
                } else {
                    rows.push([mainName, '-', '-']);
                }
            });

            loadSheetJS(() => {
                const ws = XLSX.utils.aoa_to_sheet(rows);
                ws['!cols'] = [{ wch: 26 }, { wch: 26 }, { wch: 30 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Customer Regions');
                XLSX.writeFile(wb, filename);
            });
        } catch(e) {
            console.error('Export error:', e);
            alert("Failed to export regions: " + e.message);
        }
    }

    function triggerImportRegions(level = 'all') {
        const input = document.getElementById('regionImportFileInput');
        if (input) {
            input.value = '';
            input.dataset.importLevel = level;
            input.click();
        }
    }

    function parseCSV(text) {
        const lines = text.split(/\r\n|\n|\r/);
        const result = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const row = [];
            let inQuotes = false;
            let current = '';
            for (let c = 0; c < line.length; c++) {
                const char = line[c];
                if (char === '"' || char === "'") {
                    if (inQuotes && line[c + 1] === '"') {
                        current += '"';
                        c++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) {
                    row.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            row.push(current.trim());
            result.push(row);
        }
        return result;
    }

    async function handleRegionFileImport(fileInput) {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
        const file = fileInput.files[0];
        const fileName = file.name;

        loadSheetJS(async () => {
            try {
                let rawRows = [];
                try {
                    const buffer = await file.arrayBuffer();
                    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                    if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
                        const sheet = workbook.Sheets[workbook.SheetNames[0]];
                        rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                    }
                } catch(e) {
                    console.warn("SheetJS read failed, attempting text parse fallback:", e);
                    const text = await file.text();
                    rawRows = parseCSV(text);
                }

                if (!rawRows || rawRows.length === 0) {
                    return alert("The selected file contains no readable rows.");
                }

                // Check header row
                let mainIdx = -1;
                let subIdx = -1;
                let listIdx = -1;
                let startRow = 0;

                for (let r = 0; r < Math.min(5, rawRows.length); r++) {
                    const row = rawRows[r].map(c => String(c || '').trim().toLowerCase());
                    const m = row.findIndex(c => c.includes('main') || (c.includes('region') && !c.includes('sub') && !c.includes('list')));
                    const s = row.findIndex(c => c.includes('sub') || c.includes('district') || c.includes('city'));
                    const l = row.findIndex(c => c.includes('list') || c.includes('area') || c.includes('town') || c.includes('sector') || c.includes('territory'));

                    if (m !== -1 || s !== -1 || l !== -1) {
                        if (m !== -1) mainIdx = m;
                        if (s !== -1) subIdx = s;
                        if (l !== -1) listIdx = l;
                        startRow = r + 1;
                        break;
                    }
                }

                if (mainIdx === -1) mainIdx = 0;
                if (subIdx === -1) subIdx = 1;
                if (listIdx === -1) listIdx = 2;

                let currentMainRegion = '';
                let currentSubRegion = '';
                const parsedData = [];

                for (let i = startRow; i < rawRows.length; i++) {
                    const r = rawRows[i];
                    if (!r || !Array.isArray(r)) continue;

                    let mainVal = (r[mainIdx] !== undefined ? String(r[mainIdx]) : '').trim();
                    let subVal = (r[subIdx] !== undefined ? String(r[subIdx]) : '').trim();
                    let listVal = (r[listIdx] !== undefined ? String(r[listIdx]) : '').trim();

                    if (mainVal === '-' || mainVal === '—') mainVal = '';
                    if (subVal === '-' || subVal === '—') subVal = '';
                    if (listVal === '-' || listVal === '—') listVal = '';

                    if (!mainVal && !subVal && !listVal) continue;

                    // Support chart-style grouping with blank main/sub region inheritance
                    if (mainVal !== '') {
                        currentMainRegion = mainVal;
                        currentSubRegion = subVal !== '' ? subVal : '';
                    } else {
                        mainVal = currentMainRegion;
                        if (subVal !== '') {
                            currentSubRegion = subVal;
                        } else {
                            subVal = currentSubRegion;
                        }
                    }

                    if (!mainVal) continue;

                    parsedData.push({
                        main_region: mainVal,
                        sub_region: subVal,
                        list_region: listVal
                    });
                }

                if (parsedData.length === 0) {
                    return alert("No valid region data rows found in the selected file.\n\nPlease ensure your file contains columns: 'MAIN REGION', 'SUB REGION', 'LIST / AREA'.");
                }

                const confirmMsg = `Found ${parsedData.length} region hierarchy rows in "${fileName}".\n\nDo you want to import these into Customer Regions now?`;
                if (!confirm(confirmMsg)) {
                    fileInput.value = '';
                    return;
                }

                const compId = getCompanyId();
                const res = await fetch('api/maintain.php?action=import_regions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: compId, rows: parsedData })
                });

                const data = await res.json();
                if (data.status === 'success') {
                    alert(`✓ ${data.message}\n\nThe regions list has been updated and displayed on screen!`);
                    await fetchMainRegions();
                    if (typeof window.loadCustomerLookups === 'function') window.loadCustomerLookups();
                } else {
                    alert(`✕ Import Failed: ${data.message || 'Unknown error'}`);
                }
            } catch(err) {
                console.error('Import parse error:', err);
                alert("Failed to process file: " + err.message);
            } finally {
                fileInput.value = '';
            }
        });
    }

    // =========================================================================
    // CHART PRINT VIEW
    // =========================================================================
    async function showRegionChart(level) {
        let htmlRows = '';
        let reportTitle = '';
        const compId = getCompanyId();

        if (level === 'main' || level === 'all') {
            reportTitle = 'All Customer Regions Hierarchy Chart';
            htmlRows += `<tr><th style="width:30%">Main Region</th><th style="width:30%">Sub Region</th><th style="width:40%">List / Area</th></tr>`;
            try {
                const res = await fetch(`api/maintain.php?action=get_all_regions_hierarchy&company_id=${compId}&_t=${Date.now()}`);
                const allData = await res.json();
                if (!allData || allData.length === 0) return alert("No regions data found for chart.");

                allData.forEach(m => {
                    if (m.subs && m.subs.length > 0) {
                        m.subs.forEach((s, sIdx) => {
                            if (s.lists && s.lists.length > 0) {
                                s.lists.forEach((l, lIdx) => {
                                    htmlRows += `<tr>`;
                                    if (sIdx === 0 && lIdx === 0) htmlRows += `<td rowspan="${m.total_lists || 1}" style="font-weight: bold; background: #f8fafc;">${m.name}</td>`;
                                    if (lIdx === 0) htmlRows += `<td rowspan="${s.lists.length}" style="font-weight: 600;">${s.name}</td>`;
                                    htmlRows += `<td>${l.name}</td></tr>`;
                                });
                            } else {
                                htmlRows += `<tr>`;
                                if (sIdx === 0) htmlRows += `<td rowspan="${m.total_lists || 1}" style="font-weight: bold; background: #f8fafc;">${m.name}</td>`;
                                htmlRows += `<td style="font-weight: 600;">${s.name}</td><td style="color:#94a3b8;">-</td></tr>`;
                            }
                        });
                    } else {
                        htmlRows += `<tr><td style="font-weight: bold; background: #f8fafc;">${m.name}</td><td style="color:#94a3b8;">-</td><td style="color:#94a3b8;">-</td></tr>`;
                    }
                });
            } catch(e) {
                return alert("Error loading hierarchy for chart.");
            }
        } else if (level === 'sub') {
            if (!selectedMainRegionId) return alert("Select a Main Region first.");
            const curMain = (mainRegionData || []).find(m => m.id == selectedMainRegionId);
            const mainName = curMain ? curMain.name : 'Main Region';
            reportTitle = `Chart for Main Region: ${mainName}`;
            htmlRows += `<tr><th style="width:40%">Sub Region</th><th style="width:60%">List / Area</th></tr>`;
            try {
                const res = await fetch(`api/maintain.php?action=get_sub_region_hierarchy&main_id=${selectedMainRegionId}&_t=${Date.now()}`);
                const subs = await res.json();
                (subs || []).forEach(s => {
                    if (s.lists && s.lists.length > 0) {
                        s.lists.forEach((l, lIdx) => {
                            htmlRows += `<tr>`;
                            if (lIdx === 0) htmlRows += `<td rowspan="${s.lists.length}" style="font-weight:600;">${s.name}</td>`;
                            htmlRows += `<td>${l.name}</td></tr>`;
                        });
                    } else {
                        htmlRows += `<tr><td style="font-weight:600;">${s.name}</td><td style="color:#94a3b8;">-</td></tr>`;
                    }
                });
            } catch(e) {
                return alert("Error loading sub-region chart.");
            }
        } else if (level === 'list') {
            if (!selectedSubRegionId) return alert("Select a Sub Region first.");
            const curSub = (subRegionData || []).find(s => s.id == selectedSubRegionId);
            const subName = curSub ? curSub.name : 'Sub Region';
            reportTitle = `Lists / Areas under Sub Region: ${subName}`;
            htmlRows += `<tr><th>List / Area Name</th></tr>`;
            (listRegionData || []).forEach(r => {
                htmlRows += `<tr><td>${r.name}</td></tr>`;
            });
        }

        const company = window.companyData || JSON.parse(localStorage.getItem('softifyx_company') || '{}');
        const printWindow = window.open('', '', 'width=900,height=600');
        if (!printWindow) return alert("Pop-up blocked. Please allow pop-ups for this site.");

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Region Chart - ${reportTitle}</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #1e293b; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
                    th, td { border: 1px solid #cbd5e0; padding: 7px 12px; text-align: left; }
                    th { background-color: #1F4E79; color: white; text-transform: uppercase; font-size: 12px; }
                    tr:nth-child(even) { background-color: #f8fafc; }
                    .header { border-bottom: 2px solid #1F4E79; padding-bottom: 12px; margin-bottom: 15px; }
                    .company-name { font-size: 20px; font-weight: 700; color: #1F4E79; margin: 0; }
                    .title { font-size: 15px; font-weight: 600; color: #334155; margin-top: 6px; }
                    .footer { margin-top: 25px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">${company.company_name || 'SOFTIFYX FINANCIALS'}</div>
                    <div class="title">${reportTitle}</div>
                </div>
                <table>${htmlRows}</table>
                <div class="footer">Generated by SoftifyX Financials | ${new Date().toLocaleString()}</div>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    // Expose all functions to window for onclick handlers
    window.CustomerRegions = {
        init: initRegionsView,
        fetchMainRegions,
        onMainRegionSelect,
        saveMainRegion,
        deleteMainRegion,
        resetMainRegionForm,
        saveSubRegion,
        deleteSubRegion,
        resetSubRegionForm,
        saveListRegion,
        deleteListRegion,
        resetListRegionForm,
        exportRegions,
        triggerImportRegions,
        handleRegionFileImport,
        cleanupOrphanRegions,
        clearAllRegions,
        showRegionChart
    };

    window.initRegionsView = initRegionsView;
    window.fetchMainRegions = fetchMainRegions;
    window.onMainRegionSelect = onMainRegionSelect;
    window.onSubRegionSelect = onSubRegionSelect;
    window.onListRegionSelect = onListRegionSelect;
    window.saveMainRegion = saveMainRegion;
    window.deleteMainRegion = deleteMainRegion;
    window.resetMainRegionForm = resetMainRegionForm;
    window.saveSubRegion = saveSubRegion;
    window.deleteSubRegion = deleteSubRegion;
    window.resetSubRegionForm = resetSubRegionForm;
    window.saveListRegion = saveListRegion;
    window.deleteListRegion = deleteListRegion;
    window.resetListRegionForm = resetListRegionForm;
    window.exportRegions = exportRegions;
    window.triggerImportRegions = triggerImportRegions;
    window.handleRegionFileImport = handleRegionFileImport;
    window.cleanupOrphanRegions = cleanupOrphanRegions;
    window.clearAllRegions = clearAllRegions;
    window.showRegionChart = showRegionChart;
})();
