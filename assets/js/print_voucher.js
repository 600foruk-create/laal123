window.PrintVoucherModule = {
    init: function() {
        this.toggleCriteria();
        
        // Set default dates
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        document.getElementById('pv_date_from').value = dateStr;
        document.getElementById('pv_date_to').value = dateStr;
    },

    toggleCriteria: function() {
        const criteria = document.querySelector('input[name="pv_criteria"]:checked').value;
        
        const dateFrom = document.getElementById('pv_date_from');
        const dateTo = document.getElementById('pv_date_to');
        const serialFrom = document.getElementById('pv_serial_from');
        const serialTo = document.getElementById('pv_serial_to');
        
        if (criteria === 'date') {
            dateFrom.disabled = false;
            dateTo.disabled = false;
            serialFrom.disabled = true;
            serialTo.disabled = true;
        } else if (criteria === 'serial') {
            dateFrom.disabled = true;
            dateTo.disabled = true;
            serialFrom.disabled = false;
            serialTo.disabled = false;
        } else {
            // all
            dateFrom.disabled = true;
            dateTo.disabled = true;
            serialFrom.disabled = true;
            serialTo.disabled = true;
        }
    },

    executePrint: function() {
        const type = document.querySelector('input[name="pv_type"]:checked').value;
        const criteria = document.querySelector('input[name="pv_criteria"]:checked').value;
        
        let url = `print_viewer.html?type=${encodeURIComponent(type)}&criteria=${encodeURIComponent(criteria)}`;
        
        if (criteria === 'date') {
            const df = document.getElementById('pv_date_from').value;
            const dt = document.getElementById('pv_date_to').value;
            if (!df || !dt) {
                alert("Please select both From and To dates.");
                return;
            }
            if (df > dt) {
                alert("Date From cannot be greater than Date To.");
                return;
            }
            url += `&df=${encodeURIComponent(df)}&dt=${encodeURIComponent(dt)}`;
        } else if (criteria === 'serial') {
            const sf = parseInt(document.getElementById('pv_serial_from').value) || 0;
            const st = parseInt(document.getElementById('pv_serial_to').value) || 0;
            if (sf <= 0 || st <= 0) {
                alert("Please enter valid Serial From and To numbers.");
                return;
            }
            if (sf > st) {
                alert("Serial From cannot be greater than Serial To.");
                return;
            }
            url += `&sf=${sf}&st=${st}`;
        }
        
        const printWindow = window.open(url, '_blank', 'width=1000,height=800,menubar=no,toolbar=no,location=no,status=no');
        if (!printWindow) {
            alert("Popup blocked. Please allow popups for this site.");
        }
    }
};
