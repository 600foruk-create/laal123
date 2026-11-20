// --- INVENTORY MOVEMENT SETTINGS MODULE LOGIC ---
window.InvMovementPrefs = {
    init: async function() {
        console.log("Inv Movement Preferences: Initializing...");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        try {
            const cb = `_cb=${Date.now()}`;
            const [inRes, outRes, negRes, closeRes] = await Promise.all([
                fetch(`api/settings.php?action=get_setting&key=inv_move_in&company_id=${companyId}&${cb}`),
                fetch(`api/settings.php?action=get_setting&key=inv_move_out&company_id=${companyId}&${cb}`),
                fetch(`api/settings.php?action=get_setting&key=negative_stock_policy&company_id=${companyId}&${cb}`),
                fetch(`api/settings.php?action=get_setting&key=inventory_closing_policy&company_id=${companyId}&${cb}`)
            ]);
            
            const inData = await inRes.json();
            const outData = await outRes.json();
            const negData = await negRes.json().catch(() => ({}));
            const closeData = await closeRes.json().catch(() => ({}));

            if (inData.value) {
                const radio = document.querySelector(`input[name="inwardsMovement"][value="${inData.value}"]`);
                if (radio) radio.checked = true;
            }
            if (outData.value) {
                const radio = document.querySelector(`input[name="outwardsMovement"][value="${outData.value}"]`);
                if (radio) radio.checked = true;
            }
            const negPolicy = negData.value || localStorage.getItem('softifyx_negative_stock_policy') || 'allow';
            const negRadio = document.querySelector(`input[name="negativeStockPolicy"][value="${negPolicy}"]`);
            if (negRadio) negRadio.checked = true;
            localStorage.setItem('softifyx_negative_stock_policy', negPolicy);

            const closePolicy = closeData.value || localStorage.getItem('softifyx_inventory_closing_policy') || 'continuous';
            const closeRadio = document.querySelector(`input[name="invClosingPolicy"][value="${closePolicy}"]`);
            if (closeRadio) closeRadio.checked = true;
            localStorage.setItem('softifyx_inventory_closing_policy', closePolicy);
        } catch (e) { console.error("Load Movement Settings Error:", e); }
    },

    save: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        const inVal = document.querySelector('input[name="inwardsMovement"]:checked')?.value;
        const outVal = document.querySelector('input[name="outwardsMovement"]:checked')?.value;
        const negVal = document.querySelector('input[name="negativeStockPolicy"]:checked')?.value || 'allow';
        const closeVal = document.querySelector('input[name="invClosingPolicy"]:checked')?.value || 'continuous';

        localStorage.setItem('softifyx_negative_stock_policy', negVal);
        localStorage.setItem('softifyx_inventory_closing_policy', closeVal);

        const payload = {
            settings: [
                { key: 'inv_move_in', value: inVal },
                { key: 'inv_move_out', value: outVal },
                { key: 'negative_stock_policy', value: negVal },
                { key: 'inventory_closing_policy', value: closeVal }
            ]
        };

        try {
            const res = await fetch(`api/settings.php?action=save_bulk_settings&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert("Movement preferences saved successfully!");
                const modal = document.querySelector('.modal-body[data-module="inventory_movement_settings"]')?.closest('.modal-container');
                if (modal && typeof window.closeModal === 'function') {
                    window.closeModal(modal.id);
                }
            } else {
                alert("Error: " + result.message);
            }
        } catch (e) { 
            console.error("Save Movement Settings Error:", e);
            alert("Failed to save settings. Check console for details.");
        }
    }
};
