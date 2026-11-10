// --- INVENTORY MOVEMENT SETTINGS MODULE LOGIC ---
window.InvMovementPrefs = {
    init: async function() {
        console.log("Inv Movement Preferences: Initializing...");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        try {
            const cb = `_cb=${Date.now()}`;
            const [inRes, outRes] = await Promise.all([
                fetch(`api/settings.php?action=get_setting&key=inv_move_in&company_id=${companyId}&${cb}`),
                fetch(`api/settings.php?action=get_setting&key=inv_move_out&company_id=${companyId}&${cb}`)
            ]);
            
            const inData = await inRes.json();
            const outData = await outRes.json();

            if (inData.value) {
                const radio = document.querySelector(`input[name="inwardsMovement"][value="${inData.value}"]`);
                if (radio) radio.checked = true;
            }
            if (outData.value) {
                const radio = document.querySelector(`input[name="outwardsMovement"][value="${outData.value}"]`);
                if (radio) radio.checked = true;
            }
        } catch (e) { console.error("Load Movement Settings Error:", e); }
    },

    save: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        const inVal = document.querySelector('input[name="inwardsMovement"]:checked')?.value;
        const outVal = document.querySelector('input[name="outwardsMovement"]:checked')?.value;

        const payload = {
            settings: [
                { key: 'inv_move_in', value: inVal },
                { key: 'inv_move_out', value: outVal }
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
