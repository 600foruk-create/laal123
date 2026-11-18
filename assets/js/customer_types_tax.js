let custTypeTaxData = [];
let selectedCustTypeTaxId = null;

async function fetchCustTypeTax() {
    try {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const coId = session.company_id || 1;
        const res = await fetch(`api/maintain.php?action=get_customer_types_tax&company_id=${coId}`);
        custTypeTaxData = await res.json();
        const list = document.getElementById('custTypeTaxList');
        if(list) {
            list.innerHTML = custTypeTaxData.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    } catch(e) {}
}

function onCustTypeTaxSelect(id) {
    selectedCustTypeTaxId = id;
    const item = custTypeTaxData.find(c => c.id == id);
    if(item) {
        document.getElementById('custTypeTaxName').value = item.name;
        document.getElementById('custTypeTaxRate').value = item.tax_rate;
        document.getElementById('custTypeTaxWht').value = item.wht_type || '';
        document.getElementById('custTypeTaxName').disabled = false;
        document.getElementById('custTypeTaxRate').disabled = false;
        document.getElementById('custTypeTaxWht').disabled = false;
    }
}

function resetCustomerTypeTaxForm(isNew) {
    if(isNew) {
        selectedCustTypeTaxId = null;
        document.getElementById('custTypeTaxList').selectedIndex = -1;
        document.getElementById('custTypeTaxName').value = '';
        document.getElementById('custTypeTaxRate').value = '0';
        document.getElementById('custTypeTaxWht').value = '';
        document.getElementById('custTypeTaxName').disabled = false;
        document.getElementById('custTypeTaxRate').disabled = false;
        document.getElementById('custTypeTaxWht').disabled = false;
        document.getElementById('custTypeTaxName').focus();
    } else {
        selectedCustTypeTaxId = null;
        document.getElementById('custTypeTaxList').selectedIndex = -1;
        document.getElementById('custTypeTaxName').value = '';
        document.getElementById('custTypeTaxRate').value = '';
        document.getElementById('custTypeTaxWht').value = '';
        document.getElementById('custTypeTaxName').disabled = true;
        document.getElementById('custTypeTaxRate').disabled = true;
        document.getElementById('custTypeTaxWht').disabled = true;
    }
}

async function saveCustomerTypeTax() {
    const name = document.getElementById('custTypeTaxName').value.trim();
    const rate = document.getElementById('custTypeTaxRate').value;
    const wht = document.getElementById('custTypeTaxWht').value;
    
    if(!name) return alert("Customer Type name is required.");
    
    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
    const coId = session.company_id || 1;
    
    const payload = { company_id: coId, name: name, tax_rate: rate, wht_type: wht };
    if (selectedCustTypeTaxId) payload.id = selectedCustTypeTaxId;
    
    try {
        const res = await fetch('api/maintain.php?action=save_customer_type_tax', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.status === 'success') {
            await fetchCustTypeTax();
            resetCustomerTypeTaxForm(false);
            // Refresh customer tax dropdowns globally if needed
            if (typeof loadCustomerTaxTypes === 'function') {
                loadCustomerTaxTypes();
            }
        } else {
            alert("Error saving data");
        }
    } catch(e) { alert("Error saving data"); }
}

async function deleteCustomerTypeTax() {
    if(!selectedCustTypeTaxId) return alert("Select a Customer Type to delete.");
    if(!confirm("Are you sure you want to delete this Customer Type?")) return;
    try {
        const res = await fetch(`api/maintain.php?action=delete_customer_type_tax&id=${selectedCustTypeTaxId}`);
        const data = await res.json();
        if(data.status === 'success') {
            await fetchCustTypeTax();
            resetCustomerTypeTaxForm(false);
            if (typeof loadCustomerTaxTypes === 'function') {
                loadCustomerTaxTypes();
            }
        } else {
            alert("Error: " + data.message);
        }
    } catch(e) { alert("Error deleting data"); }
}

// Intercept Ctrl+S for saving
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') {
        const container = document.getElementById('customerTypeTaxMaintenanceContainer');
        if (container && container.closest('.window')?.style.display !== 'none') {
            e.preventDefault();
            saveCustomerTypeTax();
        }
    }
});
