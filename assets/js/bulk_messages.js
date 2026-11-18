(function() {
    const BulkMessagesModule = {
        data: {
            company_id: 1,
            companyName: 'My Company',
            campaignMode: 'standard', // 'standard' or 'price_list'
            recipients: [],
            templates: [],
            regions: [],
            selectedIds: new Set(),
            // Price List Campaign Data
            priceListItems: [],
            generalPrices: [],
            customerPriceGroups: {},
            brandsList: [],
            priceAudience: 'custom_only',
            brandFilter: 'ALL',
            rateFormat: 'brand_wise',
            priceListDate: ''
        },

        init: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = session.company_id || 1;
            this.data.companyName = session.company_name || 'My Company';
            this.data.campaignMode = 'standard';

            this.data.selectedIds.clear();

            // Load all filters, templates, recipients
            await this.loadRegions();
            await this.loadTemplates();
            await this.loadRecipientsList();
            await this.loadLogs();

            // Bind char counter
            const msgArea = document.getElementById('bmMessageText');
            if (msgArea) {
                msgArea.addEventListener('input', () => this.updateCharCounter());
            }

            // Ensure mode reset to standard on init
            const modeSel = document.getElementById('bmCampaignMode');
            if (modeSel) {
                modeSel.value = 'standard';
                this.updateUIMode();
            }
        },

        refreshCurrentList: async function() {
            if (this.data.campaignMode === 'price_list') {
                await this.loadPriceListData();
                this.populatePriceListRecipients();
            } else {
                await this.loadRecipientsList();
            }
        },

        handleCampaignModeChange: async function() {
            const modeSel = document.getElementById('bmCampaignMode');
            this.data.campaignMode = modeSel ? modeSel.value : 'standard';
            this.updateUIMode();

            if (this.data.campaignMode === 'price_list') {
                // Pre-fill Price List message template (NO Customer_Code, NO Catalog_Link)
                const txtArea = document.getElementById('bmMessageText');
                if (txtArea && (!txtArea.value.trim() || txtArea.value.includes('{opening_balance}') || txtArea.value.includes('{ledger_link}'))) {
                    txtArea.value = `Assalam-o-Alaikum Mohtaram {Customer_Name} Sahab,\n` +
                        `{Company_Name} ki taraf se aap ki updated price list baraye tareekh {Date}:\n\n` +
                        `{Price_List_Details}\n\n` +
                        `Shukriya!\n{Company_Name}`;
                }

                await this.loadPriceListData();
                this.populatePriceListRecipients();
                this.updateCharCounter();
            } else {
                // Restore standard recipients
                this.filterAndPopulateRecipients();
                this.updateCharCounter();
            }
        },

        updateUIMode: function() {
            const isPrice = this.data.campaignMode === 'price_list';
            
            // Containers
            const stdFilter = document.getElementById('bmStandardFilterContainer');
            const priceFilter = document.getElementById('bmPriceListFilterContainer');
            const stdTmpl = document.getElementById('bmStandardTemplateContainer');
            const priceBanner = document.getElementById('bmPriceListInfoBanner');
            const attachPdf = document.getElementById('bmAttachPDFContainer');
            const priceTags = document.getElementById('bmPriceTagsHelper');
            const colBal = document.getElementById('bmColBalanceOrPricing');
            const colPrev = document.getElementById('bmColPreview');
            const sendBtn = document.getElementById('bmSendBtn');
            const listTitle = document.getElementById('bmRecipientListTitle');

            if (stdFilter) stdFilter.style.display = isPrice ? 'none' : 'flex';
            if (priceFilter) priceFilter.style.display = isPrice ? 'flex' : 'none';
            if (stdTmpl) stdTmpl.style.display = isPrice ? 'none' : 'flex';
            if (priceBanner) priceBanner.style.display = isPrice ? 'block' : 'none';
            if (attachPdf) attachPdf.style.display = isPrice ? 'none' : 'flex';
            if (priceTags) priceTags.style.display = isPrice ? 'flex' : 'none';
            
            if (colBal) {
                colBal.textContent = isPrice ? 'Configured Rates / Brands' : 'Balance';
                colBal.style.textAlign = isPrice ? 'left' : 'right';
                colBal.style.width = isPrice ? '145px' : '90px';
            }
            if (colPrev) {
                colPrev.style.display = isPrice ? '' : 'none';
            }

            if (sendBtn) {
                if (isPrice) {
                    sendBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Send Price Lists';
                    sendBtn.style.background = '#16a34a';
                } else {
                    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Bulk SMS';
                    sendBtn.style.background = '#1F4E79';
                }
            }

            if (listTitle) {
                listTitle.innerHTML = isPrice 
                    ? `Customer Price Lists (<span id="bmMatchedCount">${this.data.selectedIds.size}</span> selected)`
                    : `Recipient Selection (<span id="bmMatchedCount">${this.data.selectedIds.size}</span> selected)`;
            }
        },

        loadRegions: async function() {
            try {
                const res = await fetch(`api/sms_logs.php?action=get_regions&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.regions = await res.json();
                    const select = document.getElementById('bmRegionSelect');
                    if (select) {
                        select.innerHTML = '<option value="ALL">-- All Regions --</option>';
                        this.data.regions.forEach(r => {
                            const opt = document.createElement('option');
                            opt.value = r.id;
                            opt.textContent = r.name;
                            select.appendChild(opt);
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading regions:", err);
            }
        },

        loadTemplates: async function() {
            try {
                const res = await fetch(`api/sms_templates.php?action=get_templates&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.templates = await res.json();
                    const select = document.getElementById('bmTemplateSelect');
                    if (select) {
                        select.innerHTML = '<option value="">-- Custom Message (No Template) --</option>';
                        this.data.templates.forEach(t => {
                            if (t.is_active == 1) {
                                const opt = document.createElement('option');
                                opt.value = t.id;
                                opt.textContent = t.template_name;
                                select.appendChild(opt);
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading templates:", err);
            }
        },

        loadRecipientsList: async function() {
            const groupType = document.getElementById('bmGroupType') ? document.getElementById('bmGroupType').value : 'customer';
            try {
                const res = await fetch(`api/sms_logs.php?action=get_recipients&type=${groupType}&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.recipients = await res.json();
                    if (this.data.campaignMode === 'standard') {
                        this.filterAndPopulateRecipients();
                    }
                }
            } catch (err) {
                console.error("Error loading recipients:", err);
            }
        },

        handleFiltersChange: function() {
            const groupType = document.getElementById('bmGroupType').value;
            const regContainer = document.getElementById('bmRegionFilterContainer');
            
            // Region filter is only for customers
            if (groupType === 'vendor') {
                if (regContainer) regContainer.style.visibility = 'hidden';
            } else {
                if (regContainer) regContainer.style.visibility = 'visible';
            }

            this.loadRecipientsList();
        },

        filterAndPopulateRecipients: function() {
            const groupType = document.getElementById('bmGroupType') ? document.getElementById('bmGroupType').value : 'customer';
            const regionFilter = document.getElementById('bmRegionSelect') ? document.getElementById('bmRegionSelect').value : 'ALL';
            const onlyDebt = document.getElementById('bmOnlyDebt') ? document.getElementById('bmOnlyDebt').checked : false;

            let filtered = [...this.data.recipients];

            // Filter by region (only if customer group)
            if (groupType === 'customer' && regionFilter !== 'ALL') {
                filtered = filtered.filter(r => r.region_id == regionFilter);
            }

            // Filter by debt > 0
            if (onlyDebt) {
                filtered = filtered.filter(r => parseFloat(r.balance || 0) > 0);
            }

            // Populate table
            const tbody = document.getElementById('bmRecipientsBody');
            if (tbody) {
                tbody.innerHTML = '';
                this.data.selectedIds.clear();

                if (filtered.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 10px; color: #94a3b8;">No matching parties found.</td></tr>';
                    this.updateCountBadge();
                    return;
                }

                filtered.forEach(r => {
                    // Auto-select by default
                    this.data.selectedIds.add(r.id);

                    const tr = document.createElement('tr');
                    const bal = parseFloat(r.balance || 0).toFixed(2);
                    const symbol = window.globalCurrencySymbol || 'Rs.';
                    tr.innerHTML = `
                        <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e0;">
                            <input type="checkbox" checked class="bm-recipient-check" data-id="${r.id}" onchange="window.BulkMessagesModule.handleCheckboxChange(this, ${r.id})">
                        </td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0;">${r.code || ''}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; font-weight: 600; color: #1e3a8a;">${this.escapeHTML(r.name || '')}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0;">${r.mobile || r.telephone || '-'}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; text-align: right; font-weight: bold; color: ${parseFloat(r.balance || 0) > 0 ? '#b91c1c' : '#475569'};">${symbol} ${bal}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            this.updateCountBadge();
        },

        // =========================================================
        // PRICE LIST DATA LOADING & GROUPING
        // =========================================================
        loadPriceListData: async function() {
            try {
                const [resCust, resGen] = await Promise.all([
                    fetch(`api/price_management.php?action=get_customer_price_list&company_id=${this.data.company_id}`),
                    fetch(`api/price_management.php?action=get_general_price_list&company_id=${this.data.company_id}`)
                ]);

                if (resCust.ok) {
                    const custJson = await resCust.json();
                    this.data.priceListItems = custJson.customer_prices || [];
                    this.data.priceListDate = custJson.latest_rate_date || new Date().toISOString().slice(0, 10);
                }

                if (resGen.ok) {
                    const genJson = await resGen.json();
                    this.data.generalPrices = genJson.items || [];
                }

                // Extract brands
                const brandsSet = new Set();
                this.data.priceListItems.forEach(i => { if (i.brand_name) brandsSet.add(i.brand_name); });
                this.data.generalPrices.forEach(i => { if (i.brand_name) brandsSet.add(i.brand_name); });
                this.data.brandsList = Array.from(brandsSet).sort();

                // Populate Brand Filter
                const brandSelect = document.getElementById('bmPriceBrandFilter');
                if (brandSelect) {
                    const currentVal = brandSelect.value || 'ALL';
                    brandSelect.innerHTML = '<option value="ALL">-- All Brands --</option>';
                    this.data.brandsList.forEach(b => {
                        const opt = document.createElement('option');
                        opt.value = b;
                        opt.textContent = b;
                        brandSelect.appendChild(opt);
                    });
                    brandSelect.value = this.data.brandsList.includes(currentVal) ? currentVal : 'ALL';
                }

                this.buildCustomerPriceGroups();
            } catch (err) {
                console.error("Error loading price list data:", err);
            }
        },

        buildCustomerPriceGroups: function() {
            const groups = {};

            // Group all custom priced items by customer_id
            this.data.priceListItems.forEach(item => {
                const cid = item.customer_id;
                if (!groups[cid]) {
                    groups[cid] = {
                        id: cid,
                        code: item.customer_code || '',
                        name: item.customer_name || '',
                        mobile: item.customer_phone || '',
                        brands: {},
                        items: [],
                        has_custom: true
                    };
                }
                groups[cid].items.push(item);

                const bName = item.brand_name || 'General';
                if (!groups[cid].brands[bName]) {
                    groups[cid].brands[bName] = {
                        brand_name: bName,
                        items: [],
                        prices: []
                    };
                }
                groups[cid].brands[bName].items.push(item);
                groups[cid].brands[bName].prices.push(parseFloat(item.custom_price || 0));
            });

            this.data.customerPriceGroups = groups;
        },

        handlePriceListFiltersChange: function() {
            this.populatePriceListRecipients();
        },

        handleRateFormatChange: function() {
            this.populatePriceListRecipients();
        },

        populatePriceListRecipients: function() {
            const audience = document.getElementById('bmPriceAudience') ? document.getElementById('bmPriceAudience').value : 'custom_only';
            const selectedBrand = document.getElementById('bmPriceBrandFilter') ? document.getElementById('bmPriceBrandFilter').value : 'ALL';
            const symbol = window.globalCurrencySymbol || 'Rs.';

            let list = [];

            if (audience === 'custom_only') {
                // Only customers who have custom price entries
                Object.values(this.data.customerPriceGroups).forEach(cust => {
                    if (selectedBrand === 'ALL' || cust.brands[selectedBrand]) {
                        list.push(cust);
                    }
                });
            } else {
                // All active customers (merge from this.data.recipients)
                this.data.recipients.forEach(r => {
                    const existing = this.data.customerPriceGroups[r.id];
                    if (existing) {
                        if (selectedBrand === 'ALL' || existing.brands[selectedBrand]) {
                            list.push(existing);
                        }
                    } else {
                        // Customer has standard/catalog pricing
                        list.push({
                            id: r.id,
                            code: r.code || '',
                            name: r.name || '',
                            mobile: r.mobile || r.telephone || '',
                            brands: {},
                            items: [],
                            has_custom: false
                        });
                    }
                });
            }

            // Populate table
            const tbody = document.getElementById('bmRecipientsBody');
            if (tbody) {
                tbody.innerHTML = '';
                this.data.selectedIds.clear();

                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 12px; color: #94a3b8;">No customers matched the price list criteria.</td></tr>';
                    this.updateCountBadge();
                    return;
                }

                list.forEach(cust => {
                    this.data.selectedIds.add(cust.id);

                    // Build concise summary of rates for the column
                    let ratesSummary = '';
                    if (cust.has_custom && Object.keys(cust.brands).length > 0) {
                        const brandParts = [];
                        for (const [bName, bData] of Object.entries(cust.brands)) {
                            if (selectedBrand !== 'ALL' && selectedBrand !== bName) continue;
                            const avgPrice = bData.prices.reduce((a, b) => a + b, 0) / bData.prices.length;
                            brandParts.push(`${bName}: ${symbol} ${avgPrice.toFixed(0)}`);
                        }
                        ratesSummary = `<span style="color: #15803d; font-weight: 600;"><i class="fas fa-tags"></i> ${brandParts.join(', ')}</span>`;
                    } else {
                        ratesSummary = `<span style="color: #64748b; font-style: italic;">Standard Selling Rates</span>`;
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e0;">
                            <input type="checkbox" checked class="bm-recipient-check" data-id="${cust.id}" onchange="window.BulkMessagesModule.handleCheckboxChange(this, ${cust.id})">
                        </td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0;">${cust.code || ''}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; font-weight: 600; color: #1e3a8a;">${this.escapeHTML(cust.name || '')}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0;">${cust.mobile || '-'}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; font-size: 10px;">${ratesSummary}</td>
                        <td style="padding: 4px; border: 1px solid #cbd5e0; text-align: center;">
                            <button type="button" onclick="window.BulkMessagesModule.previewPriceMessage(${cust.id})" title="Preview WhatsApp message for this customer" style="background: none; border: 1px solid #cbd5e0; border-radius: 3px; cursor: pointer; padding: 2px 5px; color: #1F4E79;">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            this.updateCountBadge();
        },

        // Format the personalized rate list string
        formatCustomerPriceDetails: function(cid) {
            const cust = this.data.customerPriceGroups[cid];
            const symbol = window.globalCurrencySymbol || 'Rs.';
            const selectedBrand = document.getElementById('bmPriceBrandFilter') ? document.getElementById('bmPriceBrandFilter').value : 'ALL';
            const rateFormat = document.getElementById('bmPriceRateFormat') ? document.getElementById('bmPriceRateFormat').value : 'brand_wise';

            if (!cust || !cust.items || cust.items.length === 0) {
                // If customer has no custom prices, format from general catalog rates
                return this.formatGeneralPriceDetails(selectedBrand, rateFormat);
            }

            const lines = [];

            if (rateFormat === 'brand_wise') {
                for (const [bName, bData] of Object.entries(cust.brands)) {
                    if (selectedBrand !== 'ALL' && selectedBrand !== bName) continue;
                    const min = Math.min(...bData.prices);
                    const max = Math.max(...bData.prices);
                    const priceStr = min === max ? `${symbol} ${min.toFixed(2)}` : `${symbol} ${min.toFixed(2)} - ${max.toFixed(2)}`;
                    lines.push(`📦 *${bName}*: ${priceStr}`);
                }
            } else {
                cust.items.forEach(item => {
                    if (selectedBrand !== 'ALL' && selectedBrand !== (item.brand_name || '')) return;
                    const p = parseFloat(item.custom_price || 0).toFixed(2);
                    lines.push(`• *${item.item_name}*: ${symbol} ${p}`);
                });
            }

            if (lines.length === 0) {
                return `(No rates configured for selected brand)`;
            }

            return lines.join('\n');
        },

        formatGeneralPriceDetails: function(selectedBrand, rateFormat) {
            const symbol = window.globalCurrencySymbol || 'Rs.';
            const lines = [];

            if (!this.data.generalPrices || this.data.generalPrices.length === 0) {
                return `(Standard catalog rates apply)`;
            }

            if (rateFormat === 'brand_wise') {
                const bMap = {};
                this.data.generalPrices.forEach(i => {
                    const b = i.brand_name || 'General';
                    if (!bMap[b]) bMap[b] = [];
                    bMap[b].push(parseFloat(i.selling_price || 0));
                });
                for (const [bName, prices] of Object.entries(bMap)) {
                    if (selectedBrand !== 'ALL' && selectedBrand !== bName) continue;
                    const min = Math.min(...prices);
                    const max = Math.max(...prices);
                    const priceStr = min === max ? `${symbol} ${min.toFixed(2)}` : `${symbol} ${min.toFixed(2)} - ${max.toFixed(2)}`;
                    lines.push(`📦 *${bName}*: ${priceStr}`);
                }
            } else {
                this.data.generalPrices.slice(0, 20).forEach(i => {
                    if (selectedBrand !== 'ALL' && selectedBrand !== (i.brand_name || '')) return;
                    const p = parseFloat(i.selling_price || 0).toFixed(2);
                    lines.push(`• *${i.item_name}*: ${symbol} ${p}`);
                });
            }

            return lines.join('\n');
        },

        previewPriceMessage: function(cid) {
            let cust = this.data.customerPriceGroups[cid];
            if (!cust) {
                const rec = this.data.recipients.find(r => r.id == cid);
                cust = {
                    name: rec ? rec.name : 'Valued Customer',
                    mobile: rec ? (rec.mobile || rec.telephone || '-') : '-'
                };
            }

            const rawMessage = document.getElementById('bmMessageText') ? document.getElementById('bmMessageText').value : '';
            const priceDetails = this.formatCustomerPriceDetails(cid);
            const dateStr = this.formatDisplayDate(this.data.priceListDate || new Date());

            const compiledMsg = this.compilePriceListMessage(rawMessage, cust.name, dateStr, priceDetails);

            const modal = document.getElementById('bmPreviewModal');
            const info = document.getElementById('bmPreviewRecipientInfo');
            const text = document.getElementById('bmPreviewMessageText');

            if (modal && info && text) {
                info.innerHTML = `<i class="fas fa-user"></i> ${this.escapeHTML(cust.name)} &nbsp;|&nbsp; <i class="fas fa-phone"></i> ${cust.mobile || '-'}`;
                text.textContent = compiledMsg;
                modal.style.display = 'flex';
            }
        },

        compilePriceListMessage: function(rawTemplate, custName, dateStr, priceDetails) {
            // ONLY {Customer_Name}, {Date}, {Price_List_Details}, {Company_Name}
            // NO {Customer_Code}, NO {Catalog_Link}
            return rawTemplate
                .replace(/{Customer_Name}/gi, custName || '')
                .replace(/{customer_name}/gi, custName || '')
                .replace(/{Date}/gi, dateStr)
                .replace(/{date}/gi, dateStr)
                .replace(/{Price_List_Details}/gi, priceDetails)
                .replace(/{price_list_details}/gi, priceDetails)
                .replace(/{Company_Name}/gi, this.data.companyName)
                .replace(/{company_name}/gi, this.data.companyName);
        },

        insertTag: function(tag) {
            const txt = document.getElementById('bmMessageText');
            if (!txt) return;

            const startPos = txt.selectionStart || 0;
            const endPos = txt.selectionEnd || 0;
            const val = txt.value;

            txt.value = val.substring(0, startPos) + tag + val.substring(endPos, val.length);
            txt.focus();
            txt.selectionStart = startPos + tag.length;
            txt.selectionEnd = startPos + tag.length;

            this.updateCharCounter();
        },

        handleCheckboxChange: function(chk, id) {
            if (chk.checked) {
                this.data.selectedIds.add(id);
            } else {
                this.data.selectedIds.delete(id);
            }
            this.updateCountBadge();
        },

        toggleSelectAll: function(selected) {
            const checks = document.querySelectorAll('.bm-recipient-check');
            checks.forEach(chk => {
                chk.checked = selected;
                const id = parseInt(chk.getAttribute('data-id'));
                if (selected) {
                    this.data.selectedIds.add(id);
                } else {
                    this.data.selectedIds.delete(id);
                }
            });
            this.updateCountBadge();
        },

        updateCountBadge: function() {
            const span = document.getElementById('bmMatchedCount');
            if (span) {
                span.textContent = this.data.selectedIds.size;
            }
        },

        applyTemplate: function() {
            const select = document.getElementById('bmTemplateSelect');
            const txtArea = document.getElementById('bmMessageText');
            if (!select || !txtArea) return;

            const tmplId = select.value;
            if (!tmplId) {
                txtArea.value = '';
                this.updateCharCounter();
                return;
            }

            const tmpl = this.data.templates.find(t => t.id == tmplId);
            if (tmpl) {
                txtArea.value = tmpl.message;
            }
            this.updateCharCounter();
        },

        togglePDFAttachment: function() {
            const chk = document.getElementById('bmAttachPDF');
            const txtArea = document.getElementById('bmMessageText');
            if (!chk || !txtArea) return;

            if (chk.checked) {
                const link = `\nLedger Link: {ledger_link}`;
                if (!txtArea.value.includes("Ledger Link:")) {
                    txtArea.value = txtArea.value.trim() + link;
                }
            } else {
                txtArea.value = txtArea.value.replace(/\n?Ledger Link: [^\n]+/g, "").trim();
            }
            this.updateCharCounter();
        },

        sendBulkSMS: async function() {
            if (this.data.campaignMode === 'price_list') {
                return this.sendPriceListBulk();
            }

            // Standard Ledger / Balance SMS
            const rawMessage = document.getElementById('bmMessageText').value.trim();
            if (this.data.selectedIds.size === 0) {
                alert("Please select at least one recipient.");
                return;
            }
            if (!rawMessage) {
                alert("Message template text is required.");
                return;
            }

            const targets = this.data.recipients.filter(r => this.data.selectedIds.has(r.id));
            if (targets.length === 0) return;

            if (!confirm(`Are you sure you want to send bulk SMS to ${targets.length} recipients?`)) {
                return;
            }

            const progressModal = document.getElementById('simulatedBulkModal');
            const progressTitle = document.getElementById('bmProgressTitle');
            const progressBar = document.getElementById('bmProgressBar');
            const progressText = document.getElementById('bmProgressText');
            const progressCloseBtn = document.getElementById('bmProgressCloseBtn');

            progressModal.style.display = 'flex';
            progressTitle.textContent = "Sending Bulk Messages...";
            progressBar.style.width = "0%";
            progressText.textContent = `Processed: 0 of ${targets.length} messages`;
            progressCloseBtn.style.display = 'none';

            let count = 0;

            for (let i = 0; i < targets.length; i++) {
                const rec = targets[i];
                
                const op = parseFloat(rec.opening_balance || 0).toFixed(2);
                const db = parseFloat(rec.total_debit || 0).toFixed(2);
                const cr = parseFloat(rec.total_credit || 0).toFixed(2);
                const net = parseFloat(rec.balance || 0).toFixed(2);

                const symbol = window.globalCurrencySymbol || 'Rs.';
                const payloadType = (document.getElementById('bmGroupType') && document.getElementById('bmGroupType').value === 'vendor') ? 'Vendor' : 'Customer';
                
                const compiledMsg = rawMessage
                    .replace(/{customer_name}/gi, rec.name || '')
                    .replace(/{opening_balance}/gi, symbol + ' ' + op)
                    .replace(/{receipts}/gi, symbol + ' ' + cr)
                    .replace(/{payments}/gi, symbol + ' ' + db)
                    .replace(/{net_balance}/gi, symbol + ' ' + net)
                    .replace(/{company_name}/gi, this.data.companyName)
                    .replace(/{ledger_link}/gi, `http://naimat-erp.com/print_ledger.php?coa_id=${rec.id}&type=${payloadType.toLowerCase()}`);

                const payload = {
                    recipient_type: payloadType,
                    recipient_name: rec.name,
                    mobile_no: rec.mobile || rec.telephone || '',
                    message: compiledMsg
                };

                try {
                    await new Promise(resolve => setTimeout(resolve, 120));
                    const res = await fetch(`api/sms_logs.php?action=send_sms&company_id=${this.data.company_id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) {
                        count++;
                        const pct = Math.round((count / targets.length) * 100);
                        progressBar.style.width = `${pct}%`;
                        progressText.textContent = `Processed: ${count} of ${targets.length} messages`;
                    }
                } catch (err) {
                    console.error("Error sending bulk row:", err);
                }
            }

            progressTitle.textContent = "Bulk SMS Campaign Complete!";
            progressCloseBtn.style.display = 'block';

            await this.loadLogs();
        },

        sendPriceListBulk: async function() {
            const rawMessage = document.getElementById('bmMessageText').value.trim();
            if (this.data.selectedIds.size === 0) {
                alert("Please select at least one customer to send price list.");
                return;
            }
            if (!rawMessage) {
                alert("Message template text is required.");
                return;
            }

            // Gather selected customers
            const targets = [];
            const audience = document.getElementById('bmPriceAudience') ? document.getElementById('bmPriceAudience').value : 'custom_only';
            const selectedBrand = document.getElementById('bmPriceBrandFilter') ? document.getElementById('bmPriceBrandFilter').value : 'ALL';

            if (audience === 'custom_only') {
                Object.values(this.data.customerPriceGroups).forEach(cust => {
                    if (this.data.selectedIds.has(cust.id)) {
                        if (selectedBrand === 'ALL' || cust.brands[selectedBrand]) {
                            targets.push(cust);
                        }
                    }
                });
            } else {
                this.data.recipients.forEach(r => {
                    if (this.data.selectedIds.has(r.id)) {
                        const existing = this.data.customerPriceGroups[r.id];
                        if (existing) {
                            if (selectedBrand === 'ALL' || existing.brands[selectedBrand]) {
                                targets.push(existing);
                            }
                        } else {
                            targets.push({
                                id: r.id,
                                code: r.code || '',
                                name: r.name || '',
                                mobile: r.mobile || r.telephone || '',
                                brands: {},
                                items: [],
                                has_custom: false
                            });
                        }
                    }
                });
            }

            if (targets.length === 0) {
                alert("No customers selected for the current brand/pricing filter.");
                return;
            }

            if (!confirm(`Are you sure you want to send personalized Price Lists to ${targets.length} customers via WhatsApp?`)) {
                return;
            }

            const progressModal = document.getElementById('simulatedBulkModal');
            const progressTitle = document.getElementById('bmProgressTitle');
            const progressBar = document.getElementById('bmProgressBar');
            const progressText = document.getElementById('bmProgressText');
            const progressCloseBtn = document.getElementById('bmProgressCloseBtn');

            progressModal.style.display = 'flex';
            progressTitle.textContent = "Sending Price Lists via WhatsApp...";
            progressBar.style.width = "0%";
            progressText.textContent = `Processed: 0 of ${targets.length} messages`;
            progressCloseBtn.style.display = 'none';

            let count = 0;
            const dateStr = this.formatDisplayDate(this.data.priceListDate || new Date());

            for (let i = 0; i < targets.length; i++) {
                const rec = targets[i];
                const priceDetails = this.formatCustomerPriceDetails(rec.id);
                
                // NO Customer_Code, NO Catalog_Link
                const compiledMsg = this.compilePriceListMessage(rawMessage, rec.name, dateStr, priceDetails);

                const payload = {
                    recipient_type: 'Customer',
                    recipient_name: rec.name,
                    mobile_no: rec.mobile || '',
                    message: compiledMsg
                };

                try {
                    // 150ms delay between dispatches
                    await new Promise(resolve => setTimeout(resolve, 150));
                    const res = await fetch(`api/sms_logs.php?action=send_sms&company_id=${this.data.company_id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) {
                        count++;
                        const pct = Math.round((count / targets.length) * 100);
                        progressBar.style.width = `${pct}%`;
                        progressText.textContent = `Processed: ${count} of ${targets.length} messages (${rec.name})`;
                    }
                } catch (err) {
                    console.error("Error sending price list row:", err);
                }
            }

            progressTitle.textContent = "WhatsApp Price List Campaign Complete!";
            progressCloseBtn.style.display = 'block';

            await this.loadLogs();
        },

        loadLogs: async function() {
            try {
                const res = await fetch(`api/sms_logs.php?action=get_logs&company_id=${this.data.company_id}`);
                if (res.ok) {
                    const logs = await res.json();
                    const tbody = document.getElementById('bmLogsBody');
                    if (tbody) {
                        tbody.innerHTML = '';
                        logs.forEach(l => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">${l.sent_at}</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-weight: 600; color: #1e3a8a;">${this.escapeHTML(l.recipient_name)} (${l.recipient_type})</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0;">${l.mobile_no}</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHTML(l.message)}">${this.escapeHTML(l.message)}</td>
                                <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center;">
                                    <span style="padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 700; background: ${l.status === 'Sent' ? '#dcfce7' : '#fee2e2'}; color: ${l.status === 'Sent' ? '#15803d' : '#b91c1c'};">
                                        ${l.status}
                                    </span>
                                </td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading logs:", err);
            }
        },

        updateCharCounter: function() {
            const msg = document.getElementById('bmMessageText') ? document.getElementById('bmMessageText').value : '';
            const len = msg.length;
            let parts = 0;
            if (len > 0) {
                parts = len <= 160 ? 1 : Math.ceil(len / 153);
            }
            const label = document.getElementById('bmCharCounter');
            if (label) {
                label.textContent = `${len} characters / ${parts} SMS Part(s)`;
            }
        },

        formatDisplayDate: function(dateVal) {
            if (!dateVal) return '';
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return String(dateVal);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const day = String(d.getDate()).padStart(2, '0');
            const m = months[d.getMonth()];
            const y = d.getFullYear();
            return `${day}-${m}-${y}`;
        },

        escapeHTML: function(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };

    window.BulkMessagesModule = BulkMessagesModule;
})();