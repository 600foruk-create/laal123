// --- CHART OF SERVICES MODULE LOGIC ---
window.ChartOfServices = {
    categories: [],
    services: [],
    selectedCatId: null,
    selectedItemId: null,

    init: async function() {
        console.log("Chart of Services: Initializing...");
        await this.loadCategories();
    },

    // --- CATEGORY LOGIC ---
    loadCategories: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/services.php?action=get_categories&company_id=${companyId}&_cb=${Date.now()}`);
            this.categories = await res.json();
            this.renderCategories();
            
            if (this.categories && this.categories.length > 0) {
                this.selectCategory(this.categories[0].id);
            } else {
                this.resetCatForm();
            }
        } catch (e) { console.error("Load Categories Error:", e); }
    },

    renderCategories: function() {
        const select = document.getElementById('servCatList');
        if (!select) return;
        select.innerHTML = '';
        this.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.text = cat.name;
            if (this.selectedCatId == cat.id) option.selected = true;
            select.appendChild(option);
        });
    },

    selectCategory: function(id) {
        this.selectedCatId = id;
        const cat = this.categories.find(c => c.id == id);
        if (cat) {
            document.getElementById('servCatCode').value = cat.code;
            document.getElementById('servCatName').value = cat.name;
        }
        this.renderCategories();
        this.loadServices(id);
    },

    addCategory: function() {
        this.prevCatId = this.selectedCatId;
        this.selectedCatId = null;
        document.getElementById('servCatCode').value = '';
        document.getElementById('servCatName').value = '';
        this.renderCategories();
        document.getElementById('servCatCode').focus();
    },

    saveCategory: async function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const payload = {
            id: this.selectedCatId,
            code: document.getElementById('servCatCode').value,
            name: document.getElementById('servCatName').value
        };

        if (!payload.code || !payload.name) {
            alert("Please fill in both Category Code and Name.");
            return;
        }

        try {
            const res = await fetch(`api/services.php?action=save_category&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                await this.loadCategories();
                this.resetCatForm();
            } else {
                alert("Error: " + result.message);
            }
        } catch (e) { console.error("Save Category Error:", e); }
    },

    deleteCategory: async function() {
        if (!this.selectedCatId) return;
        
        // --- DELETE PROTECTION ---
        if (this.services && this.services.length > 0) {
            alert("This category cannot be deleted because it still contains services. Please delete the services first.");
            return;
        }

        if (!confirm("Are you sure you want to delete this category?")) return;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/services.php?action=delete_category&id=${this.selectedCatId}&company_id=${companyId}`);
            const result = await res.json();
            if (result.status === 'success') {
                await this.loadCategories();
                this.resetCatForm();
                this.services = [];
                this.renderServices();
            }
        } catch (e) { console.error("Delete Category Error:", e); }
    },

    resetCatForm: function() {
        let idToRestore = this.selectedCatId || this.prevCatId;
        if (idToRestore) {
            this.selectCategory(idToRestore);
            this.prevCatId = null;
        } else {
            this.selectedCatId = null;
            document.getElementById('servCatCode').value = '';
            document.getElementById('servCatName').value = '';
            this.renderCategories();
        }
    },

    // --- SERVICES LOGIC ---
    loadServices: async function(catId) {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/services.php?action=get_services&cat_id=${catId}&company_id=${companyId}&_cb=${Date.now()}`);
            this.services = await res.json();
            this.renderServices();
            
            if (this.services && this.services.length > 0) {
                this.selectService(this.services[0].id);
            } else {
                this.resetItemForm();
            }
        } catch (e) { console.error("Load Services Error:", e); }
    },

    renderServices: function() {
        const select = document.getElementById('servItemList');
        if (!select) return;
        select.innerHTML = '';
        this.services.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.text = item.name;
            if (this.selectedItemId == item.id) option.selected = true;
            if (item.is_inactive == 1) option.style.color = '#94a3b8';
            select.appendChild(option);
        });
    },

    selectService: function(id) {
        this.selectedItemId = id;
        const item = this.services.find(s => s.id == id);
        if (item) {
            document.getElementById('servItemCode').value = item.code;
            document.getElementById('servItemName').value = item.name;
            document.getElementById('servItemDesc').value = item.description || '';
            document.getElementById('servItemPrice').value = item.selling_price;
            document.getElementById('servItemUnit').value = item.unit || '';
            document.getElementById('servItemTax').value = item.tax_rate;
            document.getElementById('servItemInactive').checked = (item.is_inactive == 1);
            
            const taxRadios = document.getElementsByName('servTaxType');
            taxRadios.forEach(r => { if(r.value == item.tax_type) r.checked = true; });
        }
        this.renderServices();
    },

    addService: function() {
        if (!this.selectedCatId) {
            alert("Please select a Category first.");
            return;
        }
        this.prevItemId = this.selectedItemId;
        this.selectedItemId = null;
        document.getElementById('servItemCode').value = '';
        document.getElementById('servItemName').value = '';
        document.getElementById('servItemDesc').value = '';
        document.getElementById('servItemPrice').value = '0';
        document.getElementById('servItemUnit').value = '';
        document.getElementById('servItemTax').value = '0';
        document.getElementById('servItemInactive').checked = false;
        document.querySelector('input[name="servTaxType"][value="Percent"]').checked = true;
        this.renderServices();
        document.getElementById('servItemCode').focus();
    },

    saveService: async function() {
        if (!this.selectedCatId) return;
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        
        const payload = {
            id: this.selectedItemId,
            cat_id: this.selectedCatId,
            code: document.getElementById('servItemCode').value,
            name: document.getElementById('servItemName').value,
            description: document.getElementById('servItemDesc').value,
            selling_price: document.getElementById('servItemPrice').value,
            unit: document.getElementById('servItemUnit').value,
            tax_rate: document.getElementById('servItemTax').value,
            tax_type: document.querySelector('input[name="servTaxType"]:checked').value,
            is_inactive: document.getElementById('servItemInactive').checked ? 1 : 0
        };

        if (!payload.code || !payload.name) {
            alert("Please fill in both Service Code and Name.");
            return;
        }

        try {
            const res = await fetch(`api/services.php?action=save_service&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success') {
                await this.loadServices(this.selectedCatId);
            } else {
                alert("Error: " + result.message);
            }
        } catch (e) { console.error("Save Service Error:", e); }
    },

    deleteService: async function() {
        if (!this.selectedItemId) return;
        if (!confirm("Are you sure you want to delete this service?")) return;
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        try {
            const res = await fetch(`api/services.php?action=delete_service&id=${this.selectedItemId}&company_id=${companyId}`);
            const result = await res.json();
            if (result.status === 'success') {
                await this.loadServices(this.selectedCatId);
            }
        } catch (e) { console.error("Delete Service Error:", e); }
    },

    resetItemForm: function() {
        let idToRestore = this.selectedItemId || this.prevItemId;
        if (idToRestore) {
            this.selectService(idToRestore);
            this.prevItemId = null;
        } else {
            this.selectedItemId = null;
            document.getElementById('servItemCode').value = '';
            document.getElementById('servItemName').value = '';
            document.getElementById('servItemDesc').value = '';
            document.getElementById('servItemPrice').value = '0';
            document.getElementById('servItemUnit').value = '';
            document.getElementById('servItemTax').value = '0';
            document.getElementById('servItemInactive').checked = false;
            document.querySelector('input[name="servTaxType"][value="Percent"]').checked = true;
            this.renderServices();
        }
    },

    printRateList: async function(type) {
        if (type === 'list' && !this.selectedCatId) {
            alert("Please select a Category from the list first!");
            return;
        }
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        const company = window.companyData || JSON.parse(localStorage.getItem(getCoKey('softifyx_company')) || '{}');
        const logo = (typeof window.getCompanyLogo === 'function') ? window.getCompanyLogo() : ((typeof logoData !== 'undefined' ? logoData : null) || localStorage.getItem(getCoKey('softifyx_logo')) || 'assets/logos/logo.png');
        
        try {
            const res = await fetch(`api/services.php?action=get_rate_list&company_id=${companyId}`);
            const allRates = await res.json();
            
            let itemsToPrint = allRates;
            let reportTitle = "SERVICES RATE LIST";
            
            if (type === 'list') {
                itemsToPrint = allRates.filter(s => s.cat_id == this.selectedCatId);
                const cat = this.categories.find(c => c.id == this.selectedCatId);
                if (cat) reportTitle += " - " + cat.name.toUpperCase();
            }

            let htmlRows = `
                <tr>
                    <th style="width: 150px;">Service Code</th>
                    <th>Service Name</th>
                    <th>Category</th>
                    <th style="width: 120px; text-align: center;">Tax</th>
                    <th style="width: 120px; text-align: right;">Selling Price</th>
                </tr>
            `;

            if (itemsToPrint.length === 0) {
                htmlRows += `<tr><td colspan="5" style="text-align:center; padding: 15px; font-style: italic;">No services found.</td></tr>`;
            } else {
                itemsToPrint.forEach(item => {
                    let taxDisplay = parseFloat(item.tax_rate) > 0 ? (item.tax_type === 'Percent' ? `${parseFloat(item.tax_rate).toFixed(2)}%` : `Rs. ${parseFloat(item.tax_rate).toFixed(2)}`) : '-';
                    htmlRows += `
                        <tr style="font-style: normal; color: #333; border-bottom: 1px solid #eee;">
                            <td style="padding: 4px;">${item.code}</td>
                            <td style="padding: 4px;">${item.name}</td>
                            <td style="padding: 4px;">${item.cat_name}</td>
                            <td style="padding: 4px; text-align: center;">${taxDisplay}</td>
                            <td style="padding: 4px; text-align: right;">${parseFloat(item.selling_price || 0).toFixed(2)}</td>
                        </tr>
                    `;
                });
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Report - ${reportTitle}</title>
                    <style>
                        @page { margin: 0; }
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0; color: #2c3e50; font-size: 26px; font-weight: 800; text-transform: uppercase; }
                        .company-info p { margin: 3px 0; color: #34495e; font-size: 14px; }
                        .logo img { max-height: 100px; max-width: 250px; object-fit: contain; }
                        .report-title-box { text-align: left; margin-bottom: 20px; }
                        .report-title-box h2 { margin: 0; color: #000; font-size: 18px; font-style: italic; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        td, th { font-size: 13px; vertical-align: middle; text-align: left; }
                        th { border-bottom: 2px solid #ccc; padding-bottom: 6px; }
                        .footer { margin-top: 60px; font-size: 12px; color: #95a5a6; text-align: center; border-top: 1px solid #eee; padding-top: 15px; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${company.name || session.company || 'Business Name'}</h1>
                            <p>${company.address || 'Address Details'}</p>
                            <p>Phone: ${company.phone || 'N/A'} | Email: ${company.email || 'N/A'}</p>
                        </div>
                        <div class="logo">
                            ${logo ? '<img src="' + logo + '">' : ''}
                        </div>
                    </div>
                    <div class="report-title-box">
                        <h2>${reportTitle}</h2>
                    </div>
                    <table>
                        <tbody>
                            ${htmlRows}
                        </tbody>
                    </table>
                    <div class="footer">
                        Generated on ${new Date().toLocaleString()}
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.print();
            }, 500);
            
        } catch (e) {
            console.error("Print Rate List Error:", e);
        }
    }
};

