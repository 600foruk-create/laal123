window.ItemsBelowReorder = {
    showAll: false,
    hideZero: false,
    selectedIndex: -1,
    recordsCount: 0,
    isKeydownBound: false,
    
    init: function() {
        const self = window.ItemsBelowReorder;
        self.loadData();
        if (!self.isKeydownBound) {
            document.addEventListener('keydown', self.handleKeydown);
            self.isKeydownBound = true;
        }
    },
    
    toggleShowAll: function() {
        const self = window.ItemsBelowReorder;
        self.showAll = !self.showAll;
        const btn = document.getElementById('btn_ibr_show_all');
        if (btn) {
            btn.style.background = self.showAll ? '#28a745' : '#1f4668';
        }
        self.loadData();
    },
    
    toggleHideZero: function() {
        const self = window.ItemsBelowReorder;
        self.hideZero = !self.hideZero;
        const btn = document.getElementById('btn_ibr_hide_zero');
        if (btn) {
            btn.style.background = self.hideZero ? '#28a745' : '#1f4668';
        }
        self.loadData();
    },
    
    selectRow: function(index) {
        const self = window.ItemsBelowReorder;
        if (index < 0 || index >= self.recordsCount) return;
        self.selectedIndex = index;
        
        const tbody = document.getElementById('ibr_tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, idx) => {
            const firstTd = row.querySelector('td:first-child');
            if (idx === index) {
                row.style.backgroundColor = '#1f4668'; // Dark blue highlight
                row.style.color = '#ffffff'; // White text
                row.style.cursor = 'default';
                if (firstTd) firstTd.innerHTML = '<i class="fas fa-caret-right" style="color: #fff;"></i>';
                row.scrollIntoView({ block: 'nearest' });
            } else {
                row.style.backgroundColor = '';
                row.style.color = '';
                row.style.cursor = 'pointer';
                if (firstTd) firstTd.innerHTML = '';
            }
        });
    },
    
    handleKeydown: function(e) {
        const self = window.ItemsBelowReorder;
        const tbody = document.getElementById('ibr_tbody');
        // Check if module is currently in DOM
        if (!tbody) return;
        
        // Prevent key events from bubbling up if we're focused on an input somewhere else
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
            e.preventDefault();
            self.selectRow(Number(self.selectedIndex) + 1);
        } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
            e.preventDefault();
            self.selectRow(Number(self.selectedIndex) - 1);
        }
    },
    
    loadData: async function() {
        const self = window.ItemsBelowReorder;
        const tbody = document.getElementById('ibr_tbody');
        const loading = document.getElementById('ibr_loading');
        const empty = document.getElementById('ibr_empty');
        
        if (!tbody || !loading || !empty) return;
        
        tbody.innerHTML = '';
        loading.style.display = 'block';
        empty.style.display = 'none';
        
        try {
            let url = `api/items_below_reorder.php?action=get_report`;
            if (self.showAll) url += `&show_all=1`;
            if (self.hideZero) url += `&hide_zero_reorder=1`;
            
            const response = await fetch(url);
            const result = await response.json();
            
            loading.style.display = 'none';
            
            if (result.status === 'success') {
                self.recordsCount = result.records.length;
                self.selectedIndex = -1; // Reset selection on reload
                
                if (self.recordsCount === 0) {
                    empty.style.display = 'block';
                    return;
                }
                
                let html = '';
                result.records.forEach((row, index) => {
                    const bal = parseFloat(row.balance_in_hand);
                    const balDisplay = bal < 0 ? `(${Math.abs(bal).toFixed(2)})` : bal.toFixed(2);
                    
                    html += `
                        <tr onclick="window.ItemsBelowReorder.selectRow(${index})" style="cursor: pointer; border-bottom: 1px solid #94a3b8;">
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center; width: 30px;">
                                <i class="fas fa-caret-right row-indicator" style="font-size: 9px; color: transparent;"></i>
                            </td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${row.item_code}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px;">${row.item_name}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: center;">${row.unit || ''}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${parseFloat(row.re_order_qty).toFixed(2)}</td>
                            <td style="border: 1px solid #94a3b8; padding: 0 4px; height: 22px; text-align: right;">${balDisplay}</td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
                
                // Select first row by default if exists
                if (self.recordsCount > 0) {
                    self.selectRow(0);
                }
            } else {
                throw new Error(result.error || 'Failed to fetch data');
            }
        } catch (error) {
            loading.style.display = 'none';
            empty.style.display = 'block';
            empty.textContent = error.message;
            console.error('Items Below Reorder Error:', error);
        }
    },
    
    printReport: async function() {
        const table = document.getElementById('ibr_table');
        if (!table) return;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        let companyInfo = { name: '', address: '', phone: '', email: '' };
        try {
            const res = await fetch(`api/admin.php?action=get_company&company_id=${companyId}&_cb=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && !data.error) {
                    companyInfo = {
                        name:    (data.name    || '').trim(),
                        address: (data.address || '').trim(),
                        phone:   (data.phone   || '').trim(),
                        email:   (data.email   || '').trim()
                    };
                }
            }
        } catch(e) { console.error('Could not fetch company info for print:', e); }

        const companyName = companyInfo.name || session.company_name || 'Company';
        const actualLogo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' && logoData) ? logoData : 'assets/logos/logo.png');
        const logoImg = `<img src="${actualLogo}" style="max-height:60px; display:inline-block;">`;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

        let contactParts = [];
        if (companyInfo.address) contactParts.push(companyInfo.address);
        if (companyInfo.phone)   contactParts.push('Phone: ' + companyInfo.phone);
        if (companyInfo.email)   contactParts.push('Email: ' + companyInfo.email);
        const contactLine = contactParts.length > 0
            ? `<div style="font-size:11px; color:#555; margin-top:2px; font-weight:normal;">${contactParts.join(' | ')}</div>`
            : '';

        const printContents = table.outerHTML;
        const printWindow = window.open('', '', 'height=600,width=800');
        
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Inventory Below Re-Order Quantity</title><base href="${baseUrl}">
        <style>
            @page { margin: 0; }
            body{font-family:Arial,sans-serif;font-size:11px;padding:20px;margin:0}
            .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #000}
            .hdr-left{width:100px}
            .hdr-center{flex:1;text-align:center}
            .hdr-right{width:100px;text-align:right}
            .hdr h1{margin:0;font-size:18px}.hdr h2{margin:4px 0 0;font-size:14px;color:#555}
            table { width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 11px; } 
            th, td { border: 1px solid #ccc; padding: 4px 6px; } 
            th { background: #f0f0f0; font-weight:bold; }
        </style></head><body>
        <div class="hdr">
            <div class="hdr-left" style="text-align: left;">${logoImg}</div>
            <div class="hdr-center"><h1>${companyName}</h1>${contactLine}<h2>Inventory Below Re-Order Quantity</h2></div>
            <div class="hdr-right"></div>
        </div>
        ${printContents}
        <script>window.onload = () => { window.print(); }</script>
        </body></html>`);
        printWindow.document.close();
    }
};
