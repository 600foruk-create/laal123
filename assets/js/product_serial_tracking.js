window.ProductSerialTracking = {
    init: function() {
        setTimeout(() => {
            const input = document.getElementById('pst_serial_no');
            if(input) input.focus();
        }, 100);
    },

    search: async function() {
        const serialNo = document.getElementById('pst_serial_no').value.trim();
        const tbody = document.getElementById('pst_tbody');
        const loading = document.getElementById('pst_loading');
        const emptyMsg = document.getElementById('pst_empty');
        
        if (!serialNo) {
            alert("Please enter a Serial No. to search.");
            return;
        }

        tbody.innerHTML = '';
        emptyMsg.style.display = 'none';
        loading.style.display = 'block';

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;

        try {
            const res = await fetch(`api/product_serial_tracking.php?action=search&company_id=${companyId}&serial_no=${encodeURIComponent(serialNo)}`);
            const data = await res.json();

            loading.style.display = 'none';

            if (data.status === 'success' && data.records && data.records.length > 0) {
                let html = '';
                data.records.forEach(rec => {
                    let dateStr = rec.date ? new Date(rec.date).toLocaleDateString('en-GB') : '';
                    
                    html += `
                        <tr style="border-bottom: 1px solid #94a3b8;">
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">
                                <i class="fas fa-caret-right" style="font-size: 9px; color: #aaa;"></i>
                            </td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${rec.tran_no || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${dateStr}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${rec.item_code || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${rec.item_name || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${rec.party_name || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${rec.address || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${rec.telephone || ''}</td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            } else {
                emptyMsg.style.display = 'block';
            }
        } catch (err) {
            loading.style.display = 'none';
            alert("Error fetching data: " + err.message);
        }
    }
};
