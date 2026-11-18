/**
 * SoftifyX ERP - Buyer Types & Tax Maintenance Module
 * Supports FBR / PRAL Digital Invoice Buyer Types & Rates
 */
let buyerTypesData = [];
let selectedBuyerTypeId = null;

function getBuyerTypesCompanyId() {
    try {
        if (window.selectedCompanyId) return window.selectedCompanyId;
        if (window.activeCompanyId) return window.activeCompanyId;
        if (window.currentCompanyId) return window.currentCompanyId;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        return session.company_id || 1;
    } catch(e) {
        return 1;
    }
}

async function fetchBuyerTypes() {
    try {
        const coId = getBuyerTypesCompanyId();
        const res = await fetch(`api/maintain.php?action=get_buyer_types&company_id=${coId}&_cb=${Date.now()}`);
        const data = await res.json();
        buyerTypesData = Array.isArray(data) ? data : (data.data || []);
        window.buyerTypesData = buyerTypesData;
        
        const list = document.getElementById('buyerTypeList');
        if (list) {
            list.innerHTML = buyerTypesData.map(b => `<option value="${b.id}">${b.name} (${parseFloat(b.sales_tax_rate || 18).toFixed(1)}% / Fur: ${parseFloat(b.further_tax_rate || 0).toFixed(1)}%)</option>`).join('');
            
            if (buyerTypesData.length > 0) {
                const targetId = (selectedBuyerTypeId && buyerTypesData.some(b => b.id == selectedBuyerTypeId))
                    ? selectedBuyerTypeId
                    : buyerTypesData[0].id;
                list.value = targetId;
                onBuyerTypeSelect(targetId);
            } else {
                resetBuyerTypeForm(false);
            }
        }

        // Also refresh any active customer form dropdown
        loadCustomerBuyerTypes();
    } catch(e) {
        console.error("Error fetching buyer types:", e);
    }
}

function onBuyerTypeSelect(id) {
    if (!id) return;
    selectedBuyerTypeId = id;
    const item = (buyerTypesData || []).find(b => b.id == id);
    if (item) {
        const nameEl = document.getElementById('buyerTypeName');
        const codeEl = document.getElementById('buyerTypeCode');
        const stEl = document.getElementById('buyerTypeSalesTax');
        const furEl = document.getElementById('buyerTypeFurtherTax');
        const extraEl = document.getElementById('buyerTypeExtraTax');
        const descEl = document.getElementById('buyerTypeDesc');

        if (nameEl) { nameEl.value = item.name || ''; nameEl.disabled = false; }
        if (codeEl) { codeEl.value = item.buyer_code || 'Registered'; codeEl.disabled = false; }
        if (stEl) { stEl.value = item.sales_tax_rate !== undefined ? parseFloat(item.sales_tax_rate).toFixed(2) : '18.00'; stEl.disabled = false; }
        if (furEl) { furEl.value = item.further_tax_rate !== undefined ? parseFloat(item.further_tax_rate).toFixed(2) : '0.00'; furEl.disabled = false; }
        if (extraEl) { extraEl.value = item.extra_tax_rate !== undefined ? parseFloat(item.extra_tax_rate).toFixed(2) : '0.00'; extraEl.disabled = false; }
        if (descEl) { descEl.value = item.description || ''; descEl.disabled = false; }
    }
}

function resetBuyerTypeForm(isNew) {
    const nameEl = document.getElementById('buyerTypeName');
    const codeEl = document.getElementById('buyerTypeCode');
    const stEl = document.getElementById('buyerTypeSalesTax');
    const furEl = document.getElementById('buyerTypeFurtherTax');
    const extraEl = document.getElementById('buyerTypeExtraTax');
    const descEl = document.getElementById('buyerTypeDesc');
    const list = document.getElementById('buyerTypeList');

    if (isNew) {
        selectedBuyerTypeId = null;
        if (list) list.selectedIndex = -1;
        if (nameEl) { nameEl.value = ''; nameEl.disabled = false; nameEl.focus(); }
        if (codeEl) { codeEl.value = 'Registered'; codeEl.disabled = false; }
        if (stEl) { stEl.value = '18.00'; stEl.disabled = false; }
        if (furEl) { furEl.value = '0.00'; furEl.disabled = false; }
        if (extraEl) { extraEl.value = '0.00'; extraEl.disabled = false; }
        if (descEl) { descEl.value = ''; descEl.disabled = false; }
    } else {
        if (buyerTypesData && buyerTypesData.length > 0) {
            const firstId = (selectedBuyerTypeId && buyerTypesData.some(b => b.id == selectedBuyerTypeId))
                ? selectedBuyerTypeId
                : buyerTypesData[0].id;
            if (list) list.value = firstId;
            onBuyerTypeSelect(firstId);
        } else {
            selectedBuyerTypeId = null;
            if (list) list.selectedIndex = -1;
            if (nameEl) { nameEl.value = ''; nameEl.disabled = true; }
            if (codeEl) { codeEl.value = 'Registered'; codeEl.disabled = true; }
            if (stEl) { stEl.value = ''; stEl.disabled = true; }
            if (furEl) { furEl.value = ''; furEl.disabled = true; }
            if (extraEl) { extraEl.value = ''; extraEl.disabled = true; }
            if (descEl) { descEl.value = ''; descEl.disabled = true; }
        }
    }
}

async function saveBuyerType() {
    const name = document.getElementById('buyerTypeName')?.value.trim();
    const buyerCode = document.getElementById('buyerTypeCode')?.value || 'Registered';
    const salesTax = parseFloat(document.getElementById('buyerTypeSalesTax')?.value || 18.00);
    const furtherTax = parseFloat(document.getElementById('buyerTypeFurtherTax')?.value || 0.00);
    const extraTax = parseFloat(document.getElementById('buyerTypeExtraTax')?.value || 0.00);
    const desc = document.getElementById('buyerTypeDesc')?.value.trim() || '';

    if (!name) return alert("Buyer Type name is required.");

    const coId = getBuyerTypesCompanyId();
    const payload = {
        company_id: coId,
        name: name,
        buyer_code: buyerCode,
        sales_tax_rate: salesTax,
        further_tax_rate: furtherTax,
        extra_tax_rate: extraTax,
        description: desc
    };
    if (selectedBuyerTypeId) payload.id = selectedBuyerTypeId;

    try {
        const res = await fetch('api/maintain.php?action=save_buyer_type', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'success') {
            selectedBuyerTypeId = data.id || selectedBuyerTypeId;
            await fetchBuyerTypes();
            alert("Buyer Type saved successfully!");
        } else {
            alert("Error saving Buyer Type: " + (data.message || 'Server error'));
        }
    } catch(e) {
        alert("Error saving Buyer Type: " + e.message);
    }
}

async function deleteBuyerType() {
    if (!selectedBuyerTypeId) return alert("Select a Buyer Type to delete.");
    if (!confirm("Are you sure you want to delete this Buyer Type?")) return;

    try {
        const res = await fetch(`api/maintain.php?action=delete_buyer_type&id=${selectedBuyerTypeId}`);
        const data = await res.json();
        if (data.status === 'success') {
            selectedBuyerTypeId = null;
            await fetchBuyerTypes();
            alert("Buyer Type deleted successfully.");
        } else {
            alert("Error: " + data.message);
        }
    } catch(e) {
        alert("Error deleting Buyer Type: " + e.message);
    }
}

function loadCustomerBuyerTypes() {
    const custBuyerSelect = document.getElementById('custBuyerType');
    if (!custBuyerSelect) return;
    const curVal = custBuyerSelect.value;
    
    let html = '<option value="">None</option>';
    (buyerTypesData || []).forEach(b => {
        html += `<option value="${b.id}" data-st="${b.sales_tax_rate !== undefined ? b.sales_tax_rate : 18}" data-fur="${b.further_tax_rate !== undefined ? b.further_tax_rate : 0}" data-code="${b.buyer_code || ''}">${b.name}</option>`;
    });
    custBuyerSelect.innerHTML = html;
    if (curVal) {
        custBuyerSelect.value = curVal;
        if (window.onCustBuyerTypeSelect) window.onCustBuyerTypeSelect(curVal);
    }
}

// Global modal launcher
function manageBuyerTypes() {
    if (window.openSecondaryModularPopup) {
        window.openSecondaryModularPopup('Navigation/Maintain/buyer_types.html', 'fa-user-tag', 'Buyer Types & Rates', () => {
            fetchBuyerTypes();
        }, 'Buyer Types', true);
    }
}

window.fetchBuyerTypes = fetchBuyerTypes;
window.onBuyerTypeSelect = onBuyerTypeSelect;
window.resetBuyerTypeForm = resetBuyerTypeForm;
window.saveBuyerType = saveBuyerType;
window.deleteBuyerType = deleteBuyerType;
window.manageBuyerTypes = manageBuyerTypes;
window.loadCustomerBuyerTypes = loadCustomerBuyerTypes;
window.buyerTypesData = buyerTypesData;

// Intercept Ctrl+S for saving
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') {
        const container = document.getElementById('buyerTypeMaintenanceContainer');
        if (container && container.closest('.window')?.style.display !== 'none') {
            e.preventDefault();
            saveBuyerType();
        }
    }
});
