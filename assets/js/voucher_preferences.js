// --- VOUCHER POSTING PREFERENCES MODULE LOGIC ---
window.VoucherPrefs = {
    init: async function() {
        console.log("Voucher Preferences: Initializing...");
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        try {
            const res = await fetch(`api/settings.php?action=get_setting&key=auto_post_vouchers&company_id=${companyId}&_cb=${Date.now()}`);
            const data = await res.json();
            const checkbox = document.getElementById('autoPostVouchers');
            if (checkbox) {
                checkbox.checked = (data.value === '1');
            }
        } catch (e) { console.error("Load Settings Error:", e); }
    },

    save: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const checkbox = document.getElementById('autoPostVouchers');
        if (!checkbox) return;

        const payload = {
            key: 'auto_post_vouchers',
            value: checkbox.checked ? '1' : '0'
        };

        try {
            const res = await fetch(`api/settings.php?action=save_setting&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert("Preferences saved successfully!");
                const modal = document.querySelector('.modal-body[data-module="Voucher Posting Preferences"]')?.closest('.modal-container');
                if (modal && typeof window.closeModal === 'function') {
                    window.closeModal(modal.id);
                }
            }
        } catch (e) { console.error("Save Settings Error:", e); }
    }
};
