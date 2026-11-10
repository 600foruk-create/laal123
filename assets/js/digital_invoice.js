/**
 * SoftifyX ERP - FBR Digital Invoice Controller
 * Single-Form ERP Layout Matching Image 2
 * Full ERP Database Integration (Customers, Items, Company, Accounts)
 * Real-time FBR Calculations, FBR Validations, Confirmation Modal & Official FBR Submission
 */
window.DigitalInvoiceModule = (function () {
    let companyId = 1;
    let companyData = {};
    let customersList = [];
    let itemsList = [];
    let buyerTypesList = [];
    let fbrSettings = {};
    let currentInvoiceId = 0;
    let currentInvoice = null;
    let isLocked = false;
    let lastRawResponse = '';
    let selectedCustomer = null;
    let lastVerifiedTaxpayer = null;
    let activePanel1View = 'inventory';

    function getCompanyId() {
        return companyId || window.currentCompanyId || window.companyId || (window.companyData && window.companyData.id) || 1;
    }

    // Helper: Format Money
    function fmt(val) {
        const n = parseFloat(val);
        return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Helper: Parse Number
    function num(val) {
        const n = parseFloat(val);
        return isNaN(n) ? 0 : n;
    }

    // Helper: Normalize Province to official FBR DI standard
    function normalizeProvinceName(p) {
        p = (p || '').trim();
        if (!p) return 'Khyber Pakhtunkhwa';
        if (/^(kpk|kp\b|khyber|nwfp)/i.test(p)) return 'Khyber Pakhtunkhwa';
        if (/^punjab/i.test(p)) return 'Punjab';
        if (/^sindh/i.test(p)) return 'Sindh';
        if (/^baloch/i.test(p)) return 'Balochistan';
        if (/^(islamabad|ict)/i.test(p)) return 'Islamabad Capital Territory';
        if (/^(ajk|azad)/i.test(p)) return 'Azad Jammu and Kashmir';
        if (/^(gb|gilgit)/i.test(p)) return 'Gilgit-Baltistan';
        return p;
    }

    // Populate Customer Type dropdown dynamically from Maintain -> Buyer Types form/table
    function populateBuyerTypesDropdown(list, selectedValue) {
        const selectEl = document.getElementById('di_customer_type');
        if (!selectEl) return;

        const currentVal = selectedValue !== undefined ? selectedValue : selectEl.value;
        selectEl.innerHTML = '';

        const types = (Array.isArray(list) && list.length > 0) ? list : [
            { id: 1, name: 'Registered Person (Filer)', buyer_code: 'Registered', sales_tax_rate: 18.00, further_tax_rate: 0.00 },
            { id: 2, name: 'Unregistered Buyer (Non-Filer)', buyer_code: 'Unregistered', sales_tax_rate: 18.00, further_tax_rate: 4.00 },
            { id: 3, name: 'End Consumer', buyer_code: 'Consumer', sales_tax_rate: 18.00, further_tax_rate: 0.00 },
            { id: 4, name: 'Exempt / Zero-Rated', buyer_code: 'Exempt', sales_tax_rate: 0.00, further_tax_rate: 0.00 },
            { id: 5, name: 'Wholesaler / Distributor', buyer_code: 'Registered', sales_tax_rate: 18.00, further_tax_rate: 0.00 },
            { id: 6, name: 'Retailer', buyer_code: 'Registered', sales_tax_rate: 18.00, further_tax_rate: 0.00 },
            { id: 7, name: 'Exporter', buyer_code: 'Exempt', sales_tax_rate: 0.00, further_tax_rate: 0.00 }
        ];

        let matched = false;
        const cLow = (currentVal || '').trim().toLowerCase();
        const getSnCode = (str) => {
            const m = (str || '').match(/SN\d{3}/i);
            return m ? m[0].toUpperCase() : '';
        };
        const cSn = getSnCode(currentVal);
        const cleanCLow = cLow.replace(/[\(\)]/g, '').trim();

        types.forEach(bt => {
            const opt = document.createElement('option');
            opt.value = bt.name;
            opt.textContent = bt.name;
            opt.dataset.id = bt.id || '';
            opt.dataset.code = bt.buyer_code || '';
            opt.dataset.salesTaxRate = bt.sales_tax_rate !== undefined ? parseFloat(bt.sales_tax_rate).toFixed(2) : '18.00';
            opt.dataset.furtherTaxRate = bt.further_tax_rate !== undefined ? parseFloat(bt.further_tax_rate).toFixed(2) : '0.00';
            opt.dataset.extraTaxRate = bt.extra_tax_rate !== undefined ? parseFloat(bt.extra_tax_rate).toFixed(2) : '0.00';

            const bLow = (bt.name || '').trim().toLowerCase();
            const bSn = getSnCode(bt.name);
            const cleanBLow = bLow.replace(/[\(\)]/g, '').trim();
            const codeLow = (bt.buyer_code || '').trim().toLowerCase();

            const isExact = (bLow === cLow);
            const isSnMatch = (cSn && bSn && cSn === bSn);
            const isPrefix = (cleanBLow.length >= 15 && cleanCLow.length >= 15 && (cleanBLow.startsWith(cleanCLow) || cleanCLow.startsWith(cleanBLow)));

            if (!matched && cLow && (
                isExact ||
                isSnMatch ||
                isPrefix ||
                opt.dataset.id == currentVal ||
                (!cSn && !bSn && (
                    (cLow.includes('unreg') && codeLow === 'unregistered') ||
                    (cLow.includes('reg') && !cLow.includes('unreg') && codeLow === 'registered') ||
                    (cLow.includes('consumer') && codeLow === 'consumer') ||
                    (cLow.includes('exempt') && codeLow === 'exempt')
                ))
            )) {
                opt.selected = true;
                matched = true;
            }
            selectEl.appendChild(opt);
        });

        if (currentVal && !matched) {
            const opt = document.createElement('option');
            opt.value = currentVal;
            opt.textContent = currentVal;
            const isUnreg = cLow.includes('unregistered') || cLow.includes('non-filer');
            const isExempt = cLow.includes('exempt') || cLow.includes('zero');
            opt.dataset.code = isUnreg ? 'Unregistered' : (isExempt ? 'Exempt' : 'Registered');
            opt.dataset.salesTaxRate = isExempt ? '0.00' : '18.00';
            opt.dataset.furtherTaxRate = isUnreg ? '4.00' : '0.00';
            opt.dataset.extraTaxRate = '0.00';
            opt.selected = true;
            selectEl.appendChild(opt);
        } else if (!matched && selectEl.options.length > 0) {
            selectEl.selectedIndex = 0;
        }
    }

    // Number to Words Converter (Pakistani / English Rupee Format)
    function numberToWords(amount) {
        const words = [
            '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
        ];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        function convert(num) {
            if (num === 0) return '';
            if (num < 20) return words[num] + ' ';
            if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + words[num % 10] : '') + ' ';
            if (num < 1000) return words[Math.floor(num / 100)] + ' Hundred ' + convert(num % 100);
            if (num < 100000) return convert(Math.floor(num / 1000)) + 'Thousand ' + convert(num % 1000);
            if (num < 10000000) return convert(Math.floor(num / 100000)) + 'Lakh ' + convert(num % 100000);
            return convert(Math.floor(num / 10000000)) + 'Crore ' + convert(num % 10000000);
        }

        const integerPart = Math.floor(Math.abs(amount));
        if (integerPart === 0) return 'Zero Rupees Only.';
        return convert(integerPart).trim() + ' Rupees Only.';
    }

    // Helper: Resolve Active Company ID
    function getCompanyId() {
        try {
            if (window.selectedCompanyId) return window.selectedCompanyId;
            if (window.activeCompanyId) return window.activeCompanyId;
            if (window.currentCompanyId) return window.currentCompanyId;
            if (window.currentCompany && window.currentCompany.id) return window.currentCompany.id;
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            if (session.company_id) return session.company_id;
            return 1;
        } catch(e) {
            return 1;
        }
    }

    // Initialize Module
    async function init() {
        try {
            companyId = getCompanyId();
            updateFooterDateTime();
            await loadMetadata();
            setupCustomerAutocomplete();
            setupEventListeners();

            if (window.pendingFbrConversion) {
                const payload = window.pendingFbrConversion;
                window.pendingFbrConversion = null;
                window.hasConvertedFbr = true;
                await convertFromSaleInvoice(payload);
            } else if (!window.hasConvertedFbr) {
                await newInvoice();
            }
        } catch (err) {
            console.error('Error initializing Digital Invoice module:', err);
            showAlert('Initialization error: ' + (err.message || err), 'error');
        }
    }

    function updateFooterDateTime() {
        const el = document.getElementById('di_foot_datetime');
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
                             now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
    }

    // Load Metadata: Customers, Items, Company Info, Next Serial, FBR Settings, Buyer Types
    async function loadMetadata() {
        try {
            companyId = getCompanyId();
            let data = null;
            try {
                const res = await fetch(`api/digital_invoice.php?action=get_meta&company_id=${companyId}&_cb=${Date.now()}`);
                data = await res.json();
            } catch(fetchErr) {
                console.warn('digital_invoice get_meta fetch error:', fetchErr);
            }

            if (data && data.status === 'success') {
                companyData = data.company || {};
                window.companyData = companyData;
                if (companyData.logo_data) {
                    window.logoData = companyData.logo_data;
                    try {
                        if (typeof getCoKey === 'function') {
                            localStorage.setItem(getCoKey('softifyx_logo'), companyData.logo_data);
                        } else {
                            localStorage.setItem('softifyx_logo', companyData.logo_data);
                        }
                    } catch(e) {}
                }
                customersList = Array.isArray(data.customers) ? data.customers : [];
                itemsList = Array.isArray(data.items) ? data.items : [];
                buyerTypesList = Array.isArray(data.buyer_types) ? data.buyer_types : [];
                fbrSettings = data.settings || {};
            } else {
                console.warn('get_meta did not return success, attempting fallbacks:', data);
            }

            // Direct Fallback for Buyer Types: Fetch from Maintain API if buyerTypesList is empty
            if (!buyerTypesList || buyerTypesList.length === 0) {
                try {
                    const btRes = await fetch(`api/maintain.php?action=get_buyer_types&company_id=${companyId}&_cb=${Date.now()}`);
                    const btData = await btRes.json();
                    if (Array.isArray(btData) && btData.length > 0) {
                        buyerTypesList = btData;
                    }
                } catch(btErr) {
                    console.warn('Fallback get_buyer_types error:', btErr);
                }
            }

            // Direct Fallback for Customers: Fetch from sale_order API if customersList is empty
            if (!customersList || customersList.length === 0) {
                try {
                    const cRes = await fetch(`api/sale_order.php?action=get_customers_and_vendors&company_id=${companyId}&_cb=${Date.now()}`);
                    const cData = await cRes.json();
                    if (Array.isArray(cData) && cData.length > 0) {
                        customersList = cData.map(c => ({
                            coa_id: c.id,
                            customer_code: c.code,
                            customer_name: c.name,
                            customer_id: c.id,
                            address: c.address || '',
                            telephone: c.telephone || '',
                            ntn_cnic: c.ntn || '',
                            cnic: '',
                            st_reg_no: c.gst_reg_no || '',
                            sales_tax_rate: 18.00,
                            further_tax_rate: 0.00,
                            wht_rate: c.tax_rate || 0,
                            wht_type: c.wht_type || ''
                        }));
                    }
                } catch(cErr) {
                    console.warn('Fallback get_customers error:', cErr);
                }
            }

            // Direct Fallback for Items: Fetch from loadSharedERPInventory or inventory API if itemsList is empty
            if (!itemsList || itemsList.length === 0) {
                if (typeof window.loadSharedERPInventory === 'function') {
                    try {
                        const shared = await window.loadSharedERPInventory();
                        if (Array.isArray(shared) && shared.length > 0) {
                            itemsList = shared.map(i => ({
                                id: i.id || i.coa_list_id,
                                code: i.code || i.item_code || '',
                                item_code: i.code || i.item_code || '',
                                name: i.name || i.item_name || i.description || '',
                                item_name: i.name || i.item_name || i.description || '',
                                description: i.description || i.name || '',
                                hs_code: i.hs_code || '0000.0000',
                                unit: i.unit || 'Pcs',
                                selling_price: parseFloat(i.selling_price || i.sales_price || i.rate || 0),
                                rate: parseFloat(i.selling_price || i.sales_price || i.rate || 0),
                                tax_rate: parseFloat(i.tax_rate || 18.00),
                                category_type: i.category_type || 'Goods',
                                qty_per_piece: parseFloat(i.qty_per_piece || 0)
                            }));
                        }
                    } catch(e) {
                        console.warn('Fallback loadSharedERPInventory error:', e);
                    }
                }
                if (!itemsList || itemsList.length === 0) {
                    try {
                        const invRes = await fetch(`api/inventory.php?action=get_all_items&company_id=${companyId}&_cb=${Date.now()}`);
                        if (invRes.ok) {
                            const invData = await invRes.json();
                            if (Array.isArray(invData) && invData.length > 0) {
                                itemsList = invData.map(i => ({
                                    id: i.id,
                                    code: i.code,
                                    item_code: i.code,
                                    name: i.name,
                                    item_name: i.name,
                                    description: i.description || i.name || '',
                                    hs_code: i.hs_code || '0000.0000',
                                    unit: i.unit || 'Pcs',
                                    selling_price: parseFloat(i.selling_price || 0),
                                    rate: parseFloat(i.selling_price || 0),
                                    tax_rate: parseFloat(i.tax_rate || 18.00),
                                    category_type: i.category_type || 'Goods',
                                    qty_per_piece: parseFloat(i.qty_per_piece || 0)
                                }));
                            }
                        }
                    } catch(e) {}
                }
            }

            // Dynamically populate Customer Type dropdown from Maintain Buyer Types
            populateBuyerTypesDropdown(buyerTypesList);

            // Display Seller (Company) NTN in FBR Status Card
            const sellerNtn = companyData.seller_ntn_resolved || companyData.ntn || companyData.strn || '-';
            const sellerNtnEl = document.getElementById('di_card_seller_ntn');
            if (sellerNtnEl) sellerNtnEl.textContent = sellerNtn;

            const env = fbrSettings.environment || 'sandbox';
            const envBadge = document.getElementById('di_top_env_badge');
            if (envBadge) {
                if (env === 'production') {
                    envBadge.textContent = 'Production';
                    envBadge.style.background = '#dcfce7';
                    envBadge.style.color = '#15803d';
                } else {
                    envBadge.textContent = 'Sandbox';
                    envBadge.style.background = '#e0f2fe';
                    envBadge.style.color = '#0284c7';
                }
            }
        } catch (e) {
            console.error('Error fetching metadata:', e);
            populateBuyerTypesDropdown(buyerTypesList);
        }
    }

    // New Blank Invoice
    async function newInvoice() {
        window.hasConvertedFbr = false;
        currentInvoiceId = 0;
        currentInvoice = null;
        lastRawResponse = '';
        setFormLocked(false);

        const ctEl = document.getElementById('di_customer_type');
        if (ctEl) {
            delete ctEl.dataset.masterBuyerTypeId;
            delete ctEl.dataset.masterBuyerTypeName;
            checkCustomerTypeMatch(false);
        }

        // Fetch Next Serial
        let nextSn = 1;
        let nextInvNo = 'DI-' + new Date().getFullYear() + '-0001';
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_next_serial&company_id=${companyId}`);
            const data = await res.json();
            if (data.status === 'success') {
                nextSn = data.next_sn;
                nextInvNo = data.next_invoice_no;
            }
        } catch (e) {}

        const snEl = document.getElementById('di_serial_no');
        const invNoEl = document.getElementById('di_invoice_no');
        const dateEl = document.getElementById('di_invoice_date');
        const typeEl = document.getElementById('di_invoice_type');
        const supplyTypeEl = document.getElementById('di_supply_type');
        const refInvNoEl = document.getElementById('di_ref_inv_no');
        const refInvDateEl = document.getElementById('di_ref_inv_date');
        const remarksEl = document.getElementById('di_remarks');
        const carriageEl = document.getElementById('di_carriage');
        const receivedEl = document.getElementById('di_received');

        const today = new Date().toISOString().split('T')[0];

        if (snEl) snEl.value = nextSn;
        if (invNoEl) invNoEl.value = nextInvNo;
        if (dateEl) dateEl.value = today;
        if (typeEl) typeEl.value = 'Tax Invoice';
        if (supplyTypeEl) supplyTypeEl.value = 'Wholesaler';
        if (refInvNoEl) refInvNoEl.value = '';
        if (refInvDateEl) refInvDateEl.value = today;
        if (remarksEl) remarksEl.value = '';
        if (carriageEl) carriageEl.value = '0.00';
        if (receivedEl) receivedEl.value = '0.00';

        clearCustomer();

        // Clear Item Rows and add 40 rows by default
        const tbody = document.getElementById('di_items_tbody');
        if (tbody) tbody.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            addItemRow();
        }

        // Status Badges & Cards
        updateInvoiceStatus('Pending FBR', 'Draft');
        updateFbrCardDetails('-', '-', '-', '-');

        const refEl = document.getElementById('di_sub_inv_ref');
        if (refEl) refEl.textContent = nextInvNo;

        const footInv = document.getElementById('di_foot_inv_no');
        if (footInv) footInv.textContent = nextSn;

        const rawSellerDigits = (companyData.ntn || '').replace(/[^0-9]/g, '');
        const validSeller = rawSellerDigits.length === 6 || rawSellerDigits.length === 7 || rawSellerDigits.length === 8 || rawSellerDigits.length === 13;
        if (!validSeller && companyData.ntn) {
            setValidationBox(false, `Seller NTN is invalid ("${companyData.ntn}"). Update in Taxpayer Details.`);
        } else {
            setValidationBox(false, 'Draft Invoice - Click "Validate FBR Data" before submission.');
        }
        recalculateTotals();
    }

    // Populate Existing Invoice
    function populateInvoice(inv) {
        if (!inv) return;
        currentInvoiceId = parseInt(inv.id) || 0;
        currentInvoice = inv;
        lastRawResponse = inv.fbr_raw_response || '';

        document.getElementById('di_serial_no').value = inv.serial_no || '';
        document.getElementById('di_invoice_no').value = inv.invoice_no || '';
        document.getElementById('di_invoice_date').value = inv.invoice_date || '';
        document.getElementById('di_invoice_type').value = inv.invoice_type || 'Tax Invoice';
        if (document.getElementById('di_supply_type')) {
            document.getElementById('di_supply_type').value = inv.supply_type || 'Wholesaler';
        }
        if (document.getElementById('di_ref_inv_no')) {
            document.getElementById('di_ref_inv_no').value = inv.ref_doc_no || '';
        }
        if (document.getElementById('di_ref_inv_date')) {
            document.getElementById('di_ref_inv_date').value = inv.ref_doc_date || '';
        }
        document.getElementById('di_remarks').value = inv.remarks || '';

        // Customer Details
        document.getElementById('di_customer_coa_id').value = inv.customer_coa_id || '';
        const matchedCust = customersList.find(c => c.coa_id == inv.customer_coa_id);
        selectedCustomer = matchedCust || null;
        const custCode = inv.customer_code || (matchedCust ? matchedCust.customer_code : '');
        if (document.getElementById('di_cust_code')) {
            document.getElementById('di_cust_code').value = custCode;
        }
        if (document.getElementById('di_cust_name')) {
            document.getElementById('di_cust_name').value = inv.customer_name || '';
        }
        if (document.getElementById('di_cust_business_name')) {
            document.getElementById('di_cust_business_name').value = inv.business_name || inv.customer_name || '';
        }
        const custTypeEl = document.getElementById('di_customer_type');
        if (custTypeEl) {
            custTypeEl.dataset.masterBuyerTypeId = matchedCust ? (matchedCust.buyer_type_id || '') : '';
            custTypeEl.dataset.masterBuyerTypeName = matchedCust ? (matchedCust.buyer_type_name || '') : '';
        }
        if (inv.customer_type) {
            populateBuyerTypesDropdown(buyerTypesList, inv.customer_type);
        } else if (custTypeEl) {
            custTypeEl.value = 'Registered (Filer)';
        }
        checkCustomerTypeMatch(false);
        document.getElementById('di_cust_ntn').value = inv.customer_ntn || '';
        document.getElementById('di_cust_cnic').value = inv.customer_cnic || '';
        document.getElementById('di_cust_strn').value = inv.customer_strn || '';
        if (document.getElementById('di_cust_phone')) {
            document.getElementById('di_cust_phone').value = inv.customer_phone || '';
        }
        if (document.getElementById('di_customer_province')) {
            document.getElementById('di_customer_province').value = normalizeProvinceName(inv.customer_province || '');
        }

        // Load Items (Pad to at least 40 rows)
        const itemsTbody = document.getElementById('di_items_tbody');
        if (itemsTbody) {
            itemsTbody.innerHTML = '';
            const items = inv.items || [];
            items.forEach(it => addItemRow(it));
            const remaining = Math.max(0, 40 - items.length);
            for (let i = 0; i < remaining; i++) {
                addItemRow();
            }
        }

        // Status Details
        const isSubmitted = (inv.fbr_status === 'Submitted' || inv.workflow_status === 'Submitted');
        updateInvoiceStatus(isSubmitted ? 'Submitted' : 'Pending FBR', inv.workflow_status || 'Draft');
        updateFbrCardDetails(
            inv.fbr_invoice_no || '-',
            inv.submission_timestamp || '-',
            inv.fbr_invoice_no || '-',
            inv.last_status_check || '-'
        );

        const refEl = document.getElementById('di_sub_inv_ref');
        if (refEl) refEl.textContent = inv.invoice_no || '';

        const footInv = document.getElementById('di_foot_inv_no');
        if (footInv) footInv.textContent = inv.serial_no || '';

        const respStatus = document.getElementById('di_resp_status');
        const respRef = document.getElementById('di_resp_ref');
        if (respStatus) respStatus.textContent = inv.fbr_status || '-';
        if (respRef) respRef.textContent = inv.fbr_invoice_no || '-';

        // Carriage & Freight
        const carriageEl = document.getElementById('di_carriage');
        if (carriageEl) {
            carriageEl.value = parseFloat(inv.carriage_freight || 0).toFixed(2);
        }

        // Amount Received
        const receivedEl = document.getElementById('di_received');
        if (receivedEl) {
            receivedEl.value = parseFloat(inv.amount_received || 0).toFixed(2);
            receivedEl.dataset.userEdited = 'true';
            receivedEl.dataset.autoFilled = 'false';
        }

        // Withholding Tax (With-236C/236H)
        const whtPctEl = document.getElementById('di_wht_pct');
        const whtLabelEl = document.getElementById('di_wht_label');
        const whtAmtEl = document.getElementById('di_withholding_tax');

        let savedWhtRate = 0;
        if (inv.wht_rate !== undefined && inv.wht_rate !== null && inv.wht_rate !== '') {
            savedWhtRate = parseFloat(inv.wht_rate) || 0;
        } else if (matchedCust && matchedCust.wht_rate !== undefined && matchedCust.wht_rate !== null && matchedCust.wht_rate !== '') {
            savedWhtRate = parseFloat(matchedCust.wht_rate) || 0;
        }

        let savedWhtAmt = 0;
        if (inv.withholding_tax !== undefined && inv.withholding_tax !== null && inv.withholding_tax !== '') {
            savedWhtAmt = parseFloat(inv.withholding_tax) || 0;
        }

        let savedWhtType = inv.wht_type || (matchedCust ? matchedCust.wht_type : '') || 'With-236C/236H';

        if (whtPctEl) {
            whtPctEl.value = savedWhtRate > 0 ? (savedWhtRate % 1 === 0 ? savedWhtRate.toFixed(1) : String(savedWhtRate)) : '0.0';
        }
        if (whtLabelEl) {
            whtLabelEl.textContent = savedWhtType;
        }
        if (whtAmtEl) {
            whtAmtEl.value = savedWhtAmt.toFixed(2);
        }

        onCustomerTypeChange(true);
        recalculateTotals();
        setFormLocked(isSubmitted);

        // Update Validation Box to reflect actual invoice state
        if (isSubmitted) {
            setValidationBox(true, 'Invoice submitted successfully to FBR. Ref: ' + (inv.fbr_invoice_no || ''), inv.fbr_invoice_no);
        } else if (inv.fbr_status === 'Failed' || inv.fbr_status === 'Rejected') {
            setValidationBox(false, inv.fbr_response_msg || 'FBR Submission was rejected/failed. Click "Validate FBR Data" to inspect requirements.');
        } else if (inv.workflow_status === 'Ready to Submit') {
            setValidationBox(true, 'All required data is verified and ready for FBR submission.');
        } else {
            setValidationBox(false, 'Draft Invoice - Click "Validate FBR Data" before submission.');
        }
    }

    // Lock/Unlock form inputs
    function setFormLocked(locked) {
        isLocked = locked;
        const container = document.getElementById('digitalInvoiceContainer');
        if (!container) return;

        const inputs = container.querySelectorAll('input:not(#di_find_query), select');
        inputs.forEach(el => {
            if (locked) {
                el.setAttribute('disabled', 'disabled');
            } else {
                if (el.id !== 'di_invoice_no' && !el.classList.contains('fbr-tbl-input-readonly')) {
                    el.removeAttribute('disabled');
                }
            }
        });
        const snEl = document.getElementById('di_serial_no');
        if (snEl) {
            if (locked) {
                snEl.readOnly = true;
            } else {
                snEl.readOnly = false;
                snEl.removeAttribute('disabled');
            }
        }

        const topSave = document.getElementById('di_btn_save_top');
        const botSave = document.getElementById('di_btn_save_bot');
        const botSubmit = document.getElementById('di_btn_submit');
        const retryBtn = document.getElementById('di_btn_retry');

        if (topSave) topSave.style.display = locked ? 'none' : 'inline-flex';
        if (botSave) botSave.style.display = locked ? 'none' : 'inline-flex';
        if (botSubmit) {
            botSubmit.style.opacity = locked ? '0.5' : '1';
            botSubmit.style.pointerEvents = locked ? 'none' : 'auto';
            botSubmit.disabled = locked;
            botSubmit.title = locked ? 'This invoice has already been successfully submitted to FBR.' : 'Submit to FBR';
        }
        if (retryBtn) {
            retryBtn.style.opacity = locked ? '0.5' : '1';
            retryBtn.style.pointerEvents = locked ? 'none' : 'auto';
            retryBtn.disabled = locked;
            retryBtn.title = locked ? 'This invoice has already been successfully submitted to FBR.' : 'Retry Submission';
        }
    }

    // Convert & Import Data from Sale Invoice (Seamless Full Fidelity Sync)
    async function convertFromSaleInvoice(payload) {
        if (!payload) return;
        window.hasConvertedFbr = true;
        window.pendingFbrConversion = null;

        companyId = getCompanyId();
        if (!customersList || customersList.length === 0) {
            await loadMetadata();
        }

        currentInvoiceId = null;
        currentInvoice = null;
        lastRawResponse = '';

        const snEl = document.getElementById('di_serial_no');
        const invNoEl = document.getElementById('di_invoice_no');
        const dateEl = document.getElementById('di_invoice_date');
        const typeEl = document.getElementById('di_invoice_type');
        const supplyTypeEl = document.getElementById('di_supply_type');
        const refInvNoEl = document.getElementById('di_ref_inv_no');
        const refInvDateEl = document.getElementById('di_ref_inv_date');
        const remarksEl = document.getElementById('di_remarks');
        const carriageEl = document.getElementById('di_carriage');
        const receivedEl = document.getElementById('di_received');

        const siSn = payload.serial_no || '';
        const invDate = payload.invoice_date || new Date().toISOString().split('T')[0];
        const yr = new Date(invDate).getFullYear();
        let genInvNo = 'DI-' + yr + '-' + String(siSn).padStart(4, '0');

        let snToUse = siSn;
        let invNoToUse = genInvNo;
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_next_serial&company_id=${companyId}`);
            const metaSn = await res.json();
            if (metaSn && metaSn.status === 'success') {
                if (!snToUse) {
                    snToUse = metaSn.next_sn;
                    invNoToUse = metaSn.next_invoice_no;
                }
            }
        } catch(e) {}

        if (snEl) snEl.value = snToUse;
        if (invNoEl) invNoEl.value = invNoToUse;
        if (dateEl) dateEl.value = invDate;
        if (typeEl) typeEl.value = 'Tax Invoice';
        if (supplyTypeEl) supplyTypeEl.value = payload.supply_type || 'Wholesaler';
        if (refInvNoEl) refInvNoEl.value = siSn ? ('SI-' + siSn) : '';
        if (refInvDateEl) refInvDateEl.value = invDate;
        if (remarksEl) remarksEl.value = payload.remarks || ('Converted from Sale Invoice #' + siSn);
        if (carriageEl) carriageEl.value = parseFloat(payload.carriage_freight || 0).toFixed(2);
        if (receivedEl) receivedEl.value = parseFloat(payload.amount_received || 0).toFixed(2);

        // Customer Lookup in Master DB - fetch extra fields from customer profile in database
        let matchedCust = null;
        if (payload.customer_coa_id) {
            matchedCust = customersList.find(c => (c.coa_id == payload.customer_coa_id) || (c.customer_id == payload.customer_coa_id) || (c.id == payload.customer_coa_id));
        }
        if (!matchedCust && payload.customer_code) {
            const pCode = (payload.customer_code || '').trim().toLowerCase();
            matchedCust = customersList.find(c => ((c.customer_code || c.code || '').trim().toLowerCase() === pCode));
        }
        if (!matchedCust && payload.customer_name) {
            const pName = (payload.customer_name || '').trim().toLowerCase();
            matchedCust = customersList.find(c => ((c.customer_name || c.name || '').trim().toLowerCase() === pName));
        }

        if (matchedCust) {
            selectCustomer(matchedCust);
            if (payload.customer_code && document.getElementById('di_cust_code') && !document.getElementById('di_cust_code').value) {
                document.getElementById('di_cust_code').value = payload.customer_code;
            }
            if (payload.customer_name && document.getElementById('di_cust_name') && !document.getElementById('di_cust_name').value) {
                document.getElementById('di_cust_name').value = payload.customer_name;
            }
            if (payload.customer_address && document.getElementById('di_cust_address') && !document.getElementById('di_cust_address').value) {
                document.getElementById('di_cust_address').value = payload.customer_address;
            }
            if (payload.customer_phone && document.getElementById('di_cust_phone') && !document.getElementById('di_cust_phone').value) {
                document.getElementById('di_cust_phone').value = payload.customer_phone;
            }
            if (payload.customer_ntn && document.getElementById('di_cust_ntn') && !document.getElementById('di_cust_ntn').value) {
                document.getElementById('di_cust_ntn').value = payload.customer_ntn;
            }
            if (payload.customer_gst && document.getElementById('di_cust_strn') && !document.getElementById('di_cust_strn').value) {
                document.getElementById('di_cust_strn').value = payload.customer_gst;
            }
        } else {
            if (document.getElementById('di_customer_coa_id')) document.getElementById('di_customer_coa_id').value = payload.customer_coa_id || '';
            if (document.getElementById('di_cust_code')) document.getElementById('di_cust_code').value = payload.customer_code || '';
            if (document.getElementById('di_cust_name')) document.getElementById('di_cust_name').value = payload.customer_name || '';
            if (document.getElementById('di_cust_business_name')) document.getElementById('di_cust_business_name').value = payload.customer_name || '';
            if (document.getElementById('di_cust_address')) document.getElementById('di_cust_address').value = payload.customer_address || '';
            if (document.getElementById('di_cust_phone')) document.getElementById('di_cust_phone').value = payload.customer_phone || '';
            if (document.getElementById('di_cust_ntn')) document.getElementById('di_cust_ntn').value = payload.customer_ntn || '';
            if (document.getElementById('di_cust_strn')) document.getElementById('di_cust_strn').value = payload.customer_gst || '';
        }

        // Load Items with exact rates and amounts
        const itemsTbody = document.getElementById('di_items_tbody');
        if (itemsTbody) {
            itemsTbody.innerHTML = '';
            const items = payload.items || [];
            items.forEach(it => {
                addItemRow({
                    item_id: it.item_id || '',
                    item_code: it.item_code || '',
                    item_name: it.item_name || it.description || '',
                    description: it.description || it.item_name || '',
                    hs_code: it.hs_code || '39172300',
                    item_classification: 'Goods',
                    pieces: (it.pieces !== undefined && it.pieces !== null && it.pieces !== 0 && it.pieces !== '0') ? it.pieces : '',
                    qty_per_piece: it.qty_per_piece || 0,
                    quantity: it.quantity,
                    uom: it.unit || it.uom || 'PCS',
                    rate: it.rate,
                    gross_amount: it.gross_amount,
                    val_excl_tax: it.val_excl_tax || it.gross_amount,
                    discount_amount: it.discount_amount || 0,
                    tax_rate: it.tax_rate !== undefined ? it.tax_rate : (it.sales_tax_rate !== undefined ? it.sales_tax_rate : 18.00),
                    sales_tax_rate: it.sales_tax_rate !== undefined ? it.sales_tax_rate : 18.00,
                    sales_tax_amount: it.sales_tax_amount,
                    further_tax_rate: it.further_tax_rate || 0,
                    further_tax_amount: it.further_tax_amount || 0,
                    extra_tax_rate: 0,
                    extra_tax_amount: 0,
                    fed_rate: 0,
                    fed_amount: 0,
                    val_incl_tax: it.val_incl_tax || it.net_amount
                });
            });

            // Pad up to 40 standard rows
            const remaining = Math.max(0, 40 - items.length);
            for (let i = 0; i < remaining; i++) {
                addItemRow();
            }
        }

        // Advance Tax / Withholding Tax
        if (payload.wht_rate !== undefined && document.getElementById('di_wht_pct')) {
            document.getElementById('di_wht_pct').value = parseFloat(payload.wht_rate || 0).toFixed(1);
        }
        if (payload.withholding_tax !== undefined && document.getElementById('di_withholding_tax')) {
            document.getElementById('di_withholding_tax').value = parseFloat(payload.withholding_tax || 0).toFixed(2);
        }

        updateInvoiceStatus('Pending FBR', 'Draft');
        updateFbrCardDetails('-', '-', '-', '-');

        const refEl = document.getElementById('di_sub_inv_ref');
        if (refEl) refEl.textContent = genInvNo;

        const footInv = document.getElementById('di_foot_inv_no');
        if (footInv) footInv.textContent = siSn;

        setFormLocked(false);
        onSupplyTypeChange();
        recalculateTotals();

        setValidationBox(false, 'Converted from Sale Invoice #' + siSn + ' - Click "Validate FBR Data" before submission.');
        showAlert('Sale Invoice #' + siSn + ' converted to FBR Digital Invoice successfully!', 'success');
    }

    // Add Dynamic Item Row (Matching Sale Tax Invoice layout & spreadsheet style)
    function addItemRow(data = {}) {
        const tbody = document.getElementById('di_items_tbody');
        if (!tbody) return;

        const rowIdx = tbody.children.length;
        const tr = document.createElement('tr');
        tr.className = 'di-item-row';
        tr.dataset.index = rowIdx;

        const hasData = !!(data.item_code || data.item_name || data.item_id || data.description);
        const itemId = data.item_id || '';
        const itemCode = data.item_code || '';
        const itemName = data.item_name || data.description || '';
        const hsCode = data.hs_code || '';
        const classification = data.item_classification || (hasData ? 'Goods' : '');
        const pieces = (data.pieces !== undefined && data.pieces !== null && data.pieces !== 0 && data.pieces !== '0' && data.pieces !== '0.00') ? data.pieces : '';
        const qty = data.quantity !== undefined ? data.quantity : (hasData ? 1 : '');
        const uom = data.uom || (hasData ? 'Pcs' : '');
        const rate = data.rate !== undefined ? data.rate : (hasData ? (data.unit_price || '') : '');
        const custTypeEl = document.getElementById('di_customer_type');
        const custTypeOpt = custTypeEl && custTypeEl.selectedOptions ? custTypeEl.selectedOptions[0] : null;
        const optCode = (custTypeOpt?.dataset?.code || '').toLowerCase();
        const optVal = (custTypeOpt?.value || '').toLowerCase();
        const isOptUnreg = optCode === 'unregistered' || optVal.includes('unregistered') || optVal.includes('non-filer');
        const isOptExempt = optCode === 'exempt' || optVal.includes('exempt') || optVal.includes('zero');

        let defaultSt = isOptExempt ? 0.00 : 18.00;
        let defaultFur = isOptUnreg ? 4.00 : 0.00;

        if (custTypeOpt && custTypeOpt.dataset.salesTaxRate !== undefined && custTypeOpt.dataset.salesTaxRate !== '') {
            defaultSt = parseFloat(custTypeOpt.dataset.salesTaxRate) || 0;
        }

        if (custTypeOpt && custTypeOpt.dataset.furtherTaxRate !== undefined && custTypeOpt.dataset.furtherTaxRate !== '') {
            defaultFur = parseFloat(custTypeOpt.dataset.furtherTaxRate) || 0;
        }

        if (selectedCustomer) {
            if (selectedCustomer.sales_tax_rate !== undefined && selectedCustomer.sales_tax_rate !== null && selectedCustomer.sales_tax_rate !== '') {
                defaultSt = parseFloat(selectedCustomer.sales_tax_rate) || 0;
            }
            if (selectedCustomer.further_tax_rate !== undefined && selectedCustomer.further_tax_rate !== null && selectedCustomer.further_tax_rate !== '') {
                defaultFur = parseFloat(selectedCustomer.further_tax_rate) || 0;
            }
        }

        const taxRate = data.tax_rate !== undefined ? data.tax_rate : (data.sales_tax_rate !== undefined ? data.sales_tax_rate : defaultSt.toFixed(2));
        const furRate = data.further_tax_rate !== undefined ? data.further_tax_rate : defaultFur.toFixed(2);
        const extRate = data.extra_tax_rate !== undefined ? data.extra_tax_rate : (hasData ? 0 : '');
        const fedRate = data.fed_rate !== undefined ? data.fed_rate : (hasData ? 0 : '');

        tr.dataset.qtyPerPiece = data.qty_per_piece || data.unit_weight || 0;

        tr.innerHTML = `
            <td style="text-align: center; color: #64748b; font-weight: bold; background: #f8fafc;" class="di-row-num">${rowIdx + 1}</td>
            <td style="position: relative;">
                <input type="text" class="fbr-tbl-input di-row-item-code" value="${escapeHtml(itemCode)}" style="font-family: monospace; font-weight: 600;" autocomplete="off" ${isLocked ? 'disabled' : ''}>
                <input type="hidden" class="di-row-item-id" value="${itemId}">
                <div class="grid-suggest di-item-code-suggestions"></div>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input di-row-hs" value="${escapeHtml(hsCode)}" style="text-align: center; font-family: monospace;" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input di-row-item-search" value="${escapeHtml(itemName)}" autocomplete="off" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <select class="fbr-tbl-input di-row-classification" ${isLocked ? 'disabled' : ''}>
                    <option value="" ${!classification ? 'selected' : ''}></option>
                    <option value="Goods" ${classification === 'Goods' ? 'selected' : ''}>Goods</option>
                    <option value="Services" ${classification === 'Services' ? 'selected' : ''}>Services</option>
                </select>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-pieces" value="${pieces}" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-qty" value="${qty}" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input di-row-uom" value="${escapeHtml(uom)}" style="text-align: center;" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-rate" value="${rate}" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num fbr-tbl-readonly di-row-val-excl" readonly value="${hasData && data.gross_amount !== undefined ? fmt(data.gross_amount || data.val_excl_tax || 0) : ''}">
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-tax-rate" value="${taxRate}" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-st-amt" value="${hasData && data.sales_tax_amount !== undefined ? fmt(data.sales_tax_amount) : ''}" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-fur-rate" value="${furRate}" ${isLocked ? 'disabled' : ''}>
                <input type="hidden" class="di-row-fur-amt" value="${data.further_tax_amount || 0}">
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-fur-disp" value="${hasData && data.further_tax_amount !== undefined ? fmt(data.further_tax_amount) : ''}" ${isLocked ? 'disabled' : ''}>
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-ext-rate" value="${extRate}" ${isLocked ? 'disabled' : ''}>
                <input type="hidden" class="di-row-ext-amt" value="${data.extra_tax_amount || 0}">
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-ext-disp" value="${hasData && data.extra_tax_amount !== undefined ? fmt(data.extra_tax_amount) : ''}" ${isLocked ? 'disabled' : ''}>
                <input type="hidden" class="di-row-fed-rate" value="0">
                <input type="hidden" class="di-row-fed-amt" value="0">
            </td>
            <td>
                <input type="text" class="fbr-tbl-input num di-row-val-incl" readonly value="${hasData && data.val_incl_tax !== undefined ? fmt(data.val_incl_tax) : ''}" style="background: #fefce8; font-weight: 700; color: #1e3a8a;">
            </td>
        `;

        tbody.appendChild(tr);

        bindRowEvents(tr);
        if (hasData) {
            calculateRow(tr);
            recalculateTotals();
        }
    }

    // Bind Row Events: Search Autocomplete on Item Code, Select Text on Click/Focus
    function bindRowEvents(tr) {
        const codeInput = tr.querySelector('.di-row-item-code');
        const codeSuggBox = tr.querySelector('.di-item-code-suggestions');
        const piecesInput = tr.querySelector('.di-row-pieces');
        const qtyInput = tr.querySelector('.di-row-qty');
        const rateInput = tr.querySelector('.di-row-rate');
        const taxInput = tr.querySelector('.di-row-tax-rate');
        const stAmtInput = tr.querySelector('.di-row-st-amt');
        const furInput = tr.querySelector('.di-row-fur-rate');
        const furDispInput = tr.querySelector('.di-row-fur-disp');
        const extInput = tr.querySelector('.di-row-ext-rate');
        const extDispInput = tr.querySelector('.di-row-ext-disp');

        // Setup Autocomplete ONLY on Item Code (Smart search on typing, never direct click)
        setupItemAutocomplete(codeInput, codeSuggBox, tr);

        // Auto-select text on focus, click, and mouseup on every column input
        tr.querySelectorAll('input, select').forEach(inp => {
            inp.addEventListener('focus', function () {
                if (this.select) this.select();
            });
            inp.addEventListener('click', function () {
                if (this.select) this.select();
            });
            inp.addEventListener('mouseup', function () {
                if (document.activeElement === this && this.select) {
                    setTimeout(() => this.select(), 10);
                }
            });
        });

        // Click anywhere in cell selects the cell's input
        tr.querySelectorAll('td').forEach(td => {
            td.addEventListener('click', function (e) {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
                    const inp = this.querySelector('input:not([type="hidden"]), select');
                    if (inp) {
                        inp.focus();
                        if (inp.select) inp.select();
                    }
                }
            });
        });

        // Live calculation when pieces change (multiplies with item weight into quantity)
        if (piecesInput) {
            piecesInput.addEventListener('input', () => {
                const pcs = num(piecesInput.value);
                let weight = parseFloat(tr.dataset.qtyPerPiece) || 0;
                if (weight <= 0) {
                    const desc = (tr.querySelector('.di-row-item-search')?.value || '') + ' ' + (tr.querySelector('.di-row-item-code')?.value || '');
                    const m = desc.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|gm|gms|mtr|meter|ft|feet|lbs)\b/i);
                    if (m && parseFloat(m[1]) > 0) {
                        weight = parseFloat(m[1]);
                        tr.dataset.qtyPerPiece = weight;
                    }
                }
                if (pcs > 0 && weight > 0) {
                    tr.querySelector('.di-row-qty').value = (pcs * weight).toFixed(2);
                } else if (pcs > 0 && weight <= 0) {
                    if (!tr.querySelector('.di-row-qty').value || num(tr.querySelector('.di-row-qty').value) === 0) {
                        tr.querySelector('.di-row-qty').value = pcs;
                    }
                }
                delete tr.dataset.manualStAmt;
                delete tr.dataset.manualFurAmt;
                delete tr.dataset.manualExtAmt;
                calculateRow(tr);
                recalculateTotals();
            });
        }

        // Numeric live calculation for rates and quantities
        [qtyInput, rateInput].forEach(inp => {
            inp.addEventListener('input', () => {
                delete tr.dataset.manualStAmt;
                delete tr.dataset.manualFurAmt;
                delete tr.dataset.manualExtAmt;
                calculateRow(tr);
                recalculateTotals();
            });
        });

        [taxInput, furInput, extInput].forEach(inp => {
            inp.addEventListener('input', () => {
                delete tr.dataset.manualStAmt;
                delete tr.dataset.manualFurAmt;
                delete tr.dataset.manualExtAmt;
                calculateRow(tr);
                recalculateTotals();
            });
        });

        // Manual edit overrides for SALES TAX AMT, FUR TAX AMT, and EXTRA AMT
        if (stAmtInput) {
            stAmtInput.addEventListener('input', () => {
                tr.dataset.manualStAmt = "true";
                calculateRow(tr);
                recalculateTotals();
            });
        }

        if (furDispInput) {
            furDispInput.addEventListener('input', () => {
                tr.dataset.manualFurAmt = "true";
                calculateRow(tr);
                recalculateTotals();
            });
        }

        if (extDispInput) {
            extDispInput.addEventListener('input', () => {
                tr.dataset.manualExtAmt = "true";
                calculateRow(tr);
                recalculateTotals();
            });
        }
    }

    // Autocomplete dropdown helper for Item Code (Smart Search on typing only, like Sale Tax Invoice)
    function setupItemAutocomplete(inputEl, suggestBox, tr) {
        let suggestIndex = -1;

        function renderMatches(matches) {
            suggestBox.innerHTML = '';
            matches.forEach((it, idx) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'suggest-item' + (idx === suggestIndex ? ' active' : '');
                itemDiv.dataset.idx = idx;
                itemDiv.innerHTML = `
                    <span><b style="color:#0284c7;">${escapeHtml(it.code || it.item_code || '')}</b> &nbsp; ${escapeHtml(it.name || it.item_name || it.description || '')}</span>
                    <span style="color:#15803d; font-weight:700; font-size:10.5px;">Rs. ${fmt(it.selling_price || it.rate || 0)}</span>
                `;
                itemDiv.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    selectItem(tr, it);
                    suggestBox.style.display = 'none';
                    suggestIndex = -1;
                });
                itemDiv.addEventListener('mouseenter', function () {
                    suggestIndex = idx;
                    highlightSuggest(suggestBox, suggestIndex);
                });
                suggestBox.appendChild(itemDiv);
            });
            if (typeof window.positionGridDropdown === 'function') {
                window.positionGridDropdown(suggestBox, inputEl);
            } else {
                suggestBox.style.display = 'block';
                suggestBox.style.zIndex = '999999999';
            }
        }

        function highlightSuggest(box, index) {
            const items = box.querySelectorAll('.suggest-item');
            items.forEach((div, i) => {
                if (i === index) {
                    div.classList.add('active');
                    const p = div.parentElement;
                    if (p) {
                        const iTop = div.offsetTop;
                        const iBottom = iTop + div.offsetHeight;
                        if (iTop < p.scrollTop) p.scrollTop = iTop;
                        else if (iBottom > p.scrollTop + p.clientHeight) p.scrollTop = iBottom - p.clientHeight;
                    }
                } else {
                    div.classList.remove('active');
                }
            });
        }

        function triggerSearch() {
            const query = inputEl.value.trim();
            if (!query) {
                // Do not show dropdown on empty query
                suggestBox.style.display = 'none';
                suggestIndex = -1;
                return;
            }

            if ((!itemsList || itemsList.length === 0) && window.allInventoryItems && window.allInventoryItems.length > 0) {
                itemsList = window.allInventoryItems;
            }

            // Smart Search matching Sale Tax Invoice (e.g. typing "2m" or initials)
            let matches = [];
            const maxLimit = (typeof window.getGridDropdownSettings === 'function' ? window.getGridDropdownSettings().maxRows : 20);
            if (typeof window.smartSearchFilterAndSort === 'function') {
                matches = window.smartSearchFilterAndSort(itemsList, query).slice(0, maxLimit);
            } else {
                const searchWords = query.toLowerCase().split(/\s+/);
                matches = itemsList.filter(it => {
                    const code = it.code || it.item_code || '';
                    const name = it.name || it.item_name || it.description || '';
                    const searchStr = `${code} ${name}`.toLowerCase();
                    if (typeof window.smartSearchMatchWord === 'function') {
                        return searchWords.every(word => window.smartSearchMatchWord(searchStr, word));
                    }
                    return searchWords.every(w => searchStr.includes(w));
                }).slice(0, maxLimit);
            }

            if (matches.length === 0) {
                suggestBox.style.display = 'none';
                suggestIndex = -1;
                return;
            }

            suggestIndex = -1;
            renderMatches(matches);
        }

        inputEl.addEventListener('input', triggerSearch);
        inputEl.addEventListener('focus', function() {
            if (inputEl.value.trim()) {
                triggerSearch();
            }
        });

        inputEl.addEventListener('keydown', function (e) {
            if (suggestBox.style.display === 'block') {
                const items = suggestBox.querySelectorAll('.suggest-item');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
                    highlightSuggest(suggestBox, suggestIndex);
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    suggestIndex = Math.max(suggestIndex - 1, 0);
                    highlightSuggest(suggestBox, suggestIndex);
                    return;
                } else if (e.key === 'Enter') {
                    if (suggestIndex > -1 && items[suggestIndex]) {
                        e.preventDefault();
                        e.stopPropagation();
                        items[suggestIndex].dispatchEvent(new MouseEvent('mousedown'));
                        return;
                    } else {
                        // Check if exact code matched or first match
                        const curVal = inputEl.value.trim().toLowerCase();
                        const exactMatch = itemsList.find(it => (it.code || it.item_code || '').toLowerCase() === curVal) ||
                                           (items.length > 0 && suggestIndex === -1 ? itemsList.find(it => {
                                               const c = (it.code || it.item_code || '').toLowerCase();
                                               const n = (it.name || it.item_name || it.description || '').toLowerCase();
                                               return c === curVal || c.startsWith(curVal) || n.includes(curVal);
                                           }) : null);
                        if (exactMatch) {
                            e.preventDefault();
                            e.stopPropagation();
                            selectItem(tr, exactMatch);
                            suggestBox.style.display = 'none';
                            return;
                        }
                        suggestBox.style.display = 'none';
                    }
                } else if (e.key === 'Escape') {
                    suggestBox.style.display = 'none';
                    suggestIndex = -1;
                    return;
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const curVal = inputEl.value.trim().toLowerCase();
                if (curVal) {
                    const match = itemsList.find(it => (it.code || it.item_code || '').toLowerCase() === curVal) ||
                                  itemsList.find(it => {
                                      const c = (it.code || it.item_code || '').toLowerCase();
                                      const n = (it.name || it.item_name || it.description || '').toLowerCase();
                                      return c === curVal || c.startsWith(curVal) || n.includes(curVal);
                                  });
                    if (match) {
                        selectItem(tr, match);
                        return;
                    }
                }
                const pcsInp = tr.querySelector('.di-row-pieces');
                if (pcsInp) {
                    pcsInp.focus();
                    if (pcsInp.select) pcsInp.select();
                }
            }
        });

        inputEl.addEventListener('blur', function () {
            setTimeout(() => {
                suggestBox.style.display = 'none';
                suggestIndex = -1;
            }, 250);
        });
    }

    function selectItem(tr, it) {
        tr.querySelector('.di-row-item-code').value = it.code || it.item_code || '';
        tr.querySelector('.di-row-item-id').value = it.id || '';
        tr.querySelector('.di-row-item-search').value = it.name || it.item_name || it.description || '';
        tr.querySelector('.di-row-hs').value = it.hs_code || '0000.0000';
        tr.querySelector('.di-row-classification').value = it.item_classification || 'Goods';
        tr.querySelector('.di-row-uom').value = it.unit || it.uom || 'Pcs';
        tr.querySelector('.di-row-rate').value = it.selling_price || it.rate || 0;

        let weight = parseFloat(it.qty_per_piece) || parseFloat(it.unit_weight) || 0;
        if (weight <= 0) {
            const desc = (it.name || it.item_name || it.description || '') + ' ' + (it.code || it.item_code || '');
            const m = desc.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs)\b/i);
            if (m && parseFloat(m[1]) > 0) {
                weight = parseFloat(m[1]);
            }
        }
        tr.dataset.qtyPerPiece = weight;

        const pcsInp = tr.querySelector('.di-row-pieces');
        const curPcs = num(pcsInp ? pcsInp.value : 0);
        if (curPcs > 0 && weight > 0) {
            tr.querySelector('.di-row-qty').value = (curPcs * weight).toFixed(2);
        } else if (weight > 0 && (!tr.querySelector('.di-row-qty').value || num(tr.querySelector('.di-row-qty').value) <= 1)) {
            if (pcsInp && !pcsInp.value) pcsInp.value = 1;
            tr.querySelector('.di-row-qty').value = (1 * weight).toFixed(2);
        } else if (!tr.querySelector('.di-row-qty').value) {
            tr.querySelector('.di-row-qty').value = 1;
        }

        const custTypeEl = document.getElementById('di_customer_type');
        const custTypeOpt = custTypeEl && custTypeEl.selectedOptions ? custTypeEl.selectedOptions[0] : null;
        const optCode = (custTypeOpt?.dataset?.code || '').toLowerCase();
        const optVal = (custTypeOpt?.value || '').toLowerCase();
        const isOptUnreg = optCode === 'unregistered' || optVal.includes('unregistered') || optVal.includes('non-filer');
        const isOptExempt = optCode === 'exempt' || optVal.includes('exempt') || optVal.includes('zero');

        let stRate = isOptExempt ? 0.00 : 18.00;
        let furRate = isOptUnreg ? 4.00 : 0.00;

        if (custTypeOpt && custTypeOpt.dataset.salesTaxRate !== undefined && custTypeOpt.dataset.salesTaxRate !== '') {
            stRate = parseFloat(custTypeOpt.dataset.salesTaxRate) || 0;
        }
        if (custTypeOpt && custTypeOpt.dataset.furtherTaxRate !== undefined && custTypeOpt.dataset.furtherTaxRate !== '') {
            furRate = parseFloat(custTypeOpt.dataset.furtherTaxRate) || 0;
        }

        if (selectedCustomer) {
            if (selectedCustomer.sales_tax_rate !== undefined && selectedCustomer.sales_tax_rate !== null && selectedCustomer.sales_tax_rate !== '') {
                stRate = parseFloat(selectedCustomer.sales_tax_rate) || 0;
            }
            if (selectedCustomer.further_tax_rate !== undefined && selectedCustomer.further_tax_rate !== null && selectedCustomer.further_tax_rate !== '') {
                furRate = parseFloat(selectedCustomer.further_tax_rate) || 0;
            }
        } else if (it.tax_rate !== undefined && it.tax_rate !== null && it.tax_rate !== '') {
            const itemTax = parseFloat(it.tax_rate);
            if (!isNaN(itemTax) && itemTax >= 0) stRate = itemTax;
        }

        tr.querySelector('.di-row-tax-rate').value = stRate.toFixed(2);
        tr.querySelector('.di-row-fur-rate').value = furRate.toFixed(2);
        tr.querySelector('.di-row-ext-rate').value = 0;
        tr.querySelector('.di-row-fed-rate').value = 0;

        delete tr.dataset.manualStAmt;
        delete tr.dataset.manualFurAmt;
        delete tr.dataset.manualExtAmt;

        calculateRow(tr);
        recalculateTotals();

        // Focus Pieces for rapid entry, else Quantity
        if (pcsInp) {
            pcsInp.focus();
            if (pcsInp.select) pcsInp.select();
        } else {
            const qtyInp = tr.querySelector('.di-row-qty');
            if (qtyInp) {
                qtyInp.focus();
                if (qtyInp.select) qtyInp.select();
            }
        }
    }

    function renumberRows() {
        const rows = document.querySelectorAll('#di_items_tbody .di-item-row');
        rows.forEach((r, idx) => {
            r.dataset.index = idx;
            const numEl = r.querySelector('.di-row-num');
            if (numEl) numEl.textContent = idx + 1;
        });
    }

    // Row Math calculation (Matching Sale Tax Invoice, supporting manual overrides)
    function calculateRow(tr) {
        const itemCode = tr.querySelector('.di-row-item-code')?.value.trim();
        const itemName = tr.querySelector('.di-row-item-search')?.value.trim();
        const rawQ = tr.querySelector('.di-row-qty').value.trim();
        const rawR = tr.querySelector('.di-row-rate').value.trim();

        // If completely empty row, clear calculated display fields
        if (!itemCode && !itemName && rawQ === '' && rawR === '') {
            const pcsInp = tr.querySelector('.di-row-pieces');
            if (pcsInp) pcsInp.value = '';
            tr.querySelector('.di-row-val-excl').value = '';
            tr.querySelector('.di-row-st-amt').value = '';
            tr.querySelector('.di-row-fur-amt').value = '0';
            tr.querySelector('.di-row-fur-disp').value = '';
            tr.querySelector('.di-row-ext-amt').value = '0';
            tr.querySelector('.di-row-ext-disp').value = '';
            tr.querySelector('.di-row-fed-amt').value = '0';
            tr.querySelector('.di-row-val-incl').value = '';
            return;
        }

        // Multiplies pieces with item weight into quantity
        const pieces = num(tr.querySelector('.di-row-pieces')?.value);
        let weight = parseFloat(tr.dataset.qtyPerPiece) || 0;
        if (weight <= 0) {
            const desc = (tr.querySelector('.di-row-item-search')?.value || '') + ' ' + (tr.querySelector('.di-row-item-code')?.value || '');
            const m = desc.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|gm|gms|mtr|meter|ft|feet|lbs)\b/i);
            if (m && parseFloat(m[1]) > 0) {
                weight = parseFloat(m[1]);
                tr.dataset.qtyPerPiece = weight;
            }
        }
        if (pieces > 0 && weight > 0 && (!document.activeElement || document.activeElement.classList.contains('di-row-pieces') || document.activeElement.classList.contains('di-row-item-code') || document.activeElement.classList.contains('di-row-item-search'))) {
            tr.querySelector('.di-row-qty').value = (pieces * weight).toFixed(2);
        }

        const q = num(tr.querySelector('.di-row-qty').value);
        const r = num(rawR);
        const gross = Math.round((q * r) * 100) / 100;

        // Sales Tax Amount: check if manually edited or calculated
        let stAmt = 0;
        const stAmtInput = tr.querySelector('.di-row-st-amt');
        if (tr.dataset.manualStAmt === "true" && stAmtInput) {
            stAmt = num(stAmtInput.value);
        } else {
            const taxRate = num(tr.querySelector('.di-row-tax-rate').value);
            stAmt = Math.round((gross * (taxRate / 100)) * 100) / 100;
            if (stAmtInput && document.activeElement !== stAmtInput) {
                stAmtInput.value = (gross > 0 || stAmt > 0) ? fmt(stAmt) : '';
            }
        }

        // Further Tax Amount: check if manually edited or calculated
        let furAmt = 0;
        const furDispInput = tr.querySelector('.di-row-fur-disp');
        if (tr.dataset.manualFurAmt === "true" && furDispInput) {
            furAmt = num(furDispInput.value);
            tr.querySelector('.di-row-fur-amt').value = furAmt;
        } else {
            const furRate = num(tr.querySelector('.di-row-fur-rate').value);
            furAmt = Math.round((gross * (furRate / 100)) * 100) / 100;
            tr.querySelector('.di-row-fur-amt').value = furAmt;
            if (furDispInput && document.activeElement !== furDispInput) {
                furDispInput.value = (gross > 0 && furAmt > 0) ? fmt(furAmt) : '';
            }
        }

        // Extra Tax Amount: check if manually edited or calculated
        let extAmt = 0;
        const extDispInput = tr.querySelector('.di-row-ext-disp');
        if (tr.dataset.manualExtAmt === "true" && extDispInput) {
            extAmt = num(extDispInput.value);
            tr.querySelector('.di-row-ext-amt').value = extAmt;
        } else {
            const extRate = num(tr.querySelector('.di-row-ext-rate').value);
            extAmt = Math.round((gross * (extRate / 100)) * 100) / 100;
            tr.querySelector('.di-row-ext-amt').value = extAmt;
            if (extDispInput && document.activeElement !== extDispInput) {
                extDispInput.value = (gross > 0 && extAmt > 0) ? fmt(extAmt) : '';
            }
        }

        const fedAmt = 0;
        tr.querySelector('.di-row-fed-amt').value = 0;

        const valIncl = Math.round((gross + stAmt + furAmt + extAmt + fedAmt) * 100) / 100;

        tr.querySelector('.di-row-val-excl').value = (gross > 0) ? fmt(gross) : '';
        tr.querySelector('.di-row-val-incl').value = (valIncl > 0) ? fmt(valIncl) : '';
    }

    // Recalculate Totals (Matching Sale Tax Invoice calculation logic with Withholding Tax option at bottom)
    function recalculateTotals() {
        const rows = document.querySelectorAll('#di_items_tbody .di-item-row');
        let totalPieces = 0;
        let totalQty = 0;
        let totalExcl = 0;
        let totalSalesTax = 0;
        let totalFurtherTax = 0;
        let totalExtraTax = 0;
        let totalIncl = 0;

        rows.forEach(r => {
            const itemCode = r.querySelector('.di-row-item-code')?.value.trim();
            const itemName = r.querySelector('.di-row-item-search')?.value.trim();
            const rawQ = r.querySelector('.di-row-qty')?.value.trim();
            const rawR = r.querySelector('.di-row-rate')?.value.trim();
            const rawP = r.querySelector('.di-row-pieces')?.value.trim();

            if (!itemCode && !itemName && !rawQ && !rawR && !rawP) return;

            totalPieces += num(r.querySelector('.di-row-pieces')?.value);
            totalQty += num(r.querySelector('.di-row-qty').value);
            totalExcl += num(r.querySelector('.di-row-val-excl').value.replace(/,/g, ''));
            totalSalesTax += num(r.querySelector('.di-row-st-amt').value.replace(/,/g, ''));
            totalFurtherTax += num(r.querySelector('.di-row-fur-amt').value);
            totalExtraTax += num(r.querySelector('.di-row-ext-amt').value) + num(r.querySelector('.di-row-fed-amt').value);
            totalIncl += num(r.querySelector('.di-row-val-incl').value.replace(/,/g, ''));
        });

        // Footer table totals
        const piecesEl = document.getElementById('di_tot_pieces');
        const qtyEl = document.getElementById('di_tot_qty');
        const exclEl = document.getElementById('di_tot_excl');
        const stEl = document.getElementById('di_tot_st');
        const ftEl = document.getElementById('di_tot_ft');
        const extEl = document.getElementById('di_tot_ext');
        const inclEl = document.getElementById('di_tot_incl');

        if (piecesEl) piecesEl.value = totalPieces > 0 ? (Number.isInteger(totalPieces) ? totalPieces : totalPieces.toFixed(2)) : '0';
        if (qtyEl) qtyEl.value = totalQty > 0 ? (totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)) : '0.00';
        if (exclEl) exclEl.value = fmt(totalExcl);
        if (stEl) stEl.value = fmt(totalSalesTax);
        if (ftEl) ftEl.value = fmt(totalFurtherTax);
        if (extEl) extEl.value = fmt(totalExtraTax);
        if (inclEl) inclEl.value = fmt(totalIncl);

        // Bottom Totals & Withholding Tax Calculation (Matching Sale Tax Invoice 236C/236H advance tax)
        const whtPctInput = document.getElementById('di_wht_pct');
        const whtAmtInput = document.getElementById('di_withholding_tax');
        const whtPct = whtPctInput ? num(whtPctInput.value) : 0;
        let whtAmt = 0;

        if (whtPct > 0) {
            whtAmt = Math.round((totalExcl * (whtPct / 100)) * 100) / 100;
            if (whtAmtInput && document.activeElement !== whtAmtInput) {
                whtAmtInput.value = whtAmt.toFixed(2);
            }
        } else if (whtAmtInput) {
            whtAmt = num(whtAmtInput.value);
        }

        const carriage = num(document.getElementById('di_carriage')?.value);
        let received = num(document.getElementById('di_received')?.value);
        const netTotal = Math.round((totalIncl + carriage + whtAmt) * 100) / 100;

        // Auto-assign Amount Received for Walk-in Cash Customer (12001001) ONLY IF ON NEW INVOICE AND NOT USER EDITED
        const custCode = document.getElementById('di_cust_code')?.value?.trim();
        const recInput = document.getElementById('di_received');
        if (recInput && document.activeElement === recInput) {
            recInput.dataset.userEdited = 'true';
            recInput.dataset.autoFilled = 'false';
        }
        const isUserEdited = recInput?.dataset.userEdited === 'true';

        if (isUserEdited || this.currentId) {
            received = num(recInput ? recInput.value : 0);
        } else if (custCode === '12001001' && !this.currentId) {
            received = netTotal;
            if (recInput && document.activeElement !== recInput) {
                recInput.value = netTotal > 0 ? netTotal.toFixed(2) : '0.00';
                recInput.dataset.autoFilled = 'true';
            }
        } else {
            received = num(recInput ? recInput.value : 0);
        }

        const balance = Math.round((netTotal - received) * 100) / 100;

        // Financial summary card
        const netEl = document.getElementById('di_net_total');
        const balEl = document.getElementById('di_balance');
        if (netEl) netEl.value = fmt(netTotal);
        if (balEl) balEl.value = fmt(balance);

        // Words
        const wordsEl = document.getElementById('di_amount_in_words');
        if (wordsEl) wordsEl.textContent = numberToWords(netTotal);
    }

    function onWhtPctChange() {
        const whtPct = num(document.getElementById('di_wht_pct')?.value);
        const totalExcl = num(document.getElementById('di_tot_excl')?.value.replace(/,/g, ''));
        const whtAmt = Math.round((totalExcl * (whtPct / 100)) * 100) / 100;
        const whtAmtInput = document.getElementById('di_withholding_tax');
        if (whtAmtInput) whtAmtInput.value = whtAmt.toFixed(2);
        recalculateTotals();
    }

    // Customer Autocomplete Setup
    function setupCustomerAutocomplete() {
        const codeInput = document.getElementById('di_cust_code');
        const codeListDiv = document.getElementById('di_customer_suggestions');
        const nameInput = document.getElementById('di_cust_name');
        const nameListDiv = document.getElementById('di_customer_name_suggestions');

        function bindAutocomplete(inputEl, listEl) {
            if (!inputEl || !listEl) return;

            let suggestIndex = -1;
            let currentMatches = [];

            function highlightItem(index) {
                const items = listEl.querySelectorAll('.fbr-suggest-item');
                items.forEach((item, idx) => {
                    if (idx === index) {
                        item.classList.add('active');
                        item.scrollIntoView({ block: 'nearest' });
                    } else {
                        item.classList.remove('active');
                    }
                });
            }

            function renderSuggestions(q) {
                const query = (q || '').trim().toLowerCase();
                let matches = [];
                if (query) {
                    matches = customersList.filter(c => {
                        const name = (c.customer_name || c.name || '').toLowerCase();
                        const code = (c.customer_code || c.code || '').toLowerCase();
                        const ntn = (c.ntn_cnic || c.ntn || '').toLowerCase();
                        return name.includes(query) || code.includes(query) || ntn.includes(query);
                    }).slice(0, 40);
                } else {
                    matches = customersList.slice(0, 40);
                }

                currentMatches = matches;
                suggestIndex = -1;

                if (matches.length === 0) {
                    listEl.style.display = 'none';
                    return;
                }

                listEl.innerHTML = '';
                matches.forEach((c, idx) => {
                    const cCode = c.customer_code || c.code || '';
                    const cName = c.customer_name || c.name || '';
                    const cSub = c.region_name || c.address || c.ntn_cnic || c.ntn || '';
                    const item = document.createElement('div');
                    item.className = 'fbr-suggest-item';
                    item.dataset.index = idx;
                    item.innerHTML = `
                        <span><b>${escapeHtml(cCode)}</b> - ${escapeHtml(cName)}</span>
                        <span style="color:#64748b; font-size:11px;">${escapeHtml(cSub)}</span>
                    `;
                    item.addEventListener('mouseenter', function () {
                        suggestIndex = idx;
                        highlightItem(suggestIndex);
                    });
                    item.addEventListener('mousedown', function (e) {
                        e.preventDefault();
                        selectCustomer(c);
                        listEl.style.display = 'none';
                        suggestIndex = -1;
                    });
                    listEl.appendChild(item);
                });
                listEl.style.display = 'block';
            }

            inputEl.addEventListener('input', function () {
                renderSuggestions(this.value);
            });

            inputEl.addEventListener('focus', function () {
                renderSuggestions(this.value);
            });

            inputEl.addEventListener('blur', function () {
                setTimeout(() => { 
                    listEl.style.display = 'none'; 
                    suggestIndex = -1;
                }, 250);
            });

            inputEl.addEventListener('keydown', function (e) {
                if (listEl.style.display === 'block') {
                    const items = listEl.querySelectorAll('.fbr-suggest-item');
                    if (items.length > 0) {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (suggestIndex < items.length - 1) {
                                suggestIndex++;
                            } else {
                                suggestIndex = 0;
                            }
                            highlightItem(suggestIndex);
                            return;
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (suggestIndex > 0) {
                                suggestIndex--;
                            } else {
                                suggestIndex = items.length - 1;
                            }
                            highlightItem(suggestIndex);
                            return;
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            const selIdx = (suggestIndex > -1 && suggestIndex < currentMatches.length) ? suggestIndex : 0;
                            if (currentMatches[selIdx]) {
                                selectCustomer(currentMatches[selIdx]);
                            }
                            listEl.style.display = 'none';
                            suggestIndex = -1;

                            if (inputEl.id === 'di_cust_code') {
                                const nameEl = document.getElementById('di_cust_name');
                                if (nameEl) { nameEl.focus(); nameEl.select(); }
                            } else if (inputEl.id === 'di_cust_name') {
                                const typeEl = document.getElementById('di_customer_type');
                                if (typeEl) typeEl.focus();
                            }
                            return;
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            listEl.style.display = 'none';
                            suggestIndex = -1;
                            return;
                        } else if (e.key === 'Tab') {
                            if (suggestIndex > -1 && currentMatches[suggestIndex]) {
                                selectCustomer(currentMatches[suggestIndex]);
                            }
                            listEl.style.display = 'none';
                            suggestIndex = -1;
                        }
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    renderSuggestions(inputEl.value);
                } else if (e.key === 'Enter') {
                    const val = (inputEl.value || '').trim().toLowerCase();
                    if (val) {
                        const found = customersList.find(c => 
                            (c.customer_code || c.code || '').toLowerCase() === val || 
                            (c.customer_name || c.name || '').toLowerCase() === val
                        );
                        if (found) {
                            e.preventDefault();
                            selectCustomer(found);
                            if (inputEl.id === 'di_cust_code') {
                                const nameEl = document.getElementById('di_cust_name');
                                if (nameEl) { nameEl.focus(); nameEl.select(); }
                            }
                        }
                    }
                }
            });
        }

        bindAutocomplete(codeInput, codeListDiv);
        bindAutocomplete(nameInput, nameListDiv);
    }


    // Select Customer
    function selectCustomer(c) {
        const cCode = c.customer_code || c.code || '';
        const cName = c.customer_name || c.name || '';
        const cCoaId = c.coa_id || c.id || '';
        document.getElementById('di_customer_coa_id').value = cCoaId;
        if (document.getElementById('di_cust_code')) {
            document.getElementById('di_cust_code').value = cCode;
        }
        if (document.getElementById('di_cust_name')) {
            document.getElementById('di_cust_name').value = cName;
        }
        if (document.getElementById('di_cust_business_name')) {
            document.getElementById('di_cust_business_name').value = cName;
        }
        document.getElementById('di_cust_address').value = c.address || '';
        document.getElementById('di_cust_phone').value = c.telephone || c.mobile || '';
        document.getElementById('di_cust_strn').value = c.st_reg_no || c.gst_reg_no || '';

        // Walk-in Customer (12001001) is cash mode
        if (cCode === '12001001') {
            const payModeEl = document.getElementById('di_payment_mode');
            if (payModeEl) payModeEl.value = 'Cash';
        }

        // Auto-fetch CNIC & NTN cleanly (support alphanumeric NTNs like A522103-4 or C181672-7)
        const valCnic = (c.cnic || '').trim();
        const valNtn = (c.ntn_cnic || c.ntn || '').trim();
        const digitsNtn = valNtn.replace(/[^0-9]/g, '');
        const digitsCnic = valCnic.replace(/[^0-9]/g, '');
        const rawCnic = digitsCnic;
        const rawNtn = digitsNtn;
        
        if (document.getElementById('di_cust_cnic')) {
            document.getElementById('di_cust_cnic').value = valCnic || (digitsNtn.length === 13 ? valNtn : '');
        }
        if (document.getElementById('di_cust_ntn')) {
            document.getElementById('di_cust_ntn').value = (digitsNtn.length === 13) ? '' : valNtn;
        }

        // Region / Province: Auto-fetch from Customer's region directly into editable input
        const provInput = document.getElementById('di_customer_province');
        if (provInput) {
            provInput.value = c.region_name || c.region || '';
        }

        // Auto-match Customer Type from Buyer Types dropdown (populated from buyer_types table/form)
        const custTypeEl = document.getElementById('di_customer_type');
        if (custTypeEl) {
            custTypeEl.dataset.masterBuyerTypeId = c.buyer_type_id || '';
            custTypeEl.dataset.masterBuyerTypeName = c.buyer_type_name || '';
            let matched = false;
            // 1. Match by buyer_type_id if assigned
            if (c.buyer_type_id) {
                for (let i = 0; i < custTypeEl.options.length; i++) {
                    if (custTypeEl.options[i].dataset.id == c.buyer_type_id) {
                        custTypeEl.selectedIndex = i;
                        matched = true;
                        break;
                    }
                }
            }
            // 2. Match by buyer_type_name
            if (!matched && c.buyer_type_name) {
                const searchName = c.buyer_type_name.trim().toLowerCase();
                for (let i = 0; i < custTypeEl.options.length; i++) {
                    if (custTypeEl.options[i].value.trim().toLowerCase() === searchName) {
                        custTypeEl.selectedIndex = i;
                        matched = true;
                        break;
                    }
                }
            }
            // 3. Fallback matching based on registration / tax status
            if (!matched) {
                const bCode = (c.buyer_code || '').toLowerCase();
                const bName = (c.buyer_type_name || '').toLowerCase();
                for (let i = 0; i < custTypeEl.options.length; i++) {
                    const optVal = custTypeEl.options[i].value.toLowerCase();
                    const optCode = (custTypeEl.options[i].dataset.code || '').toLowerCase();
                    if (bCode === 'unregistered' || bName.includes('unregistered') || (rawCnic.length === 13 && !rawNtn)) {
                        if (optCode === 'unregistered' || optVal.includes('unregistered') || optVal.includes('non-filer')) {
                            custTypeEl.selectedIndex = i;
                            matched = true;
                            break;
                        }
                    } else if (bCode === 'consumer' || bName.includes('consumer')) {
                        if (optCode === 'consumer' || optVal.includes('consumer')) {
                            custTypeEl.selectedIndex = i;
                            matched = true;
                            break;
                        }
                    } else if (bCode === 'exempt' || bName.includes('exempt')) {
                        if (optCode === 'exempt' || optVal.includes('exempt')) {
                            custTypeEl.selectedIndex = i;
                            matched = true;
                            break;
                        }
                    } else {
                        if (optCode === 'registered' || optVal.includes('registered') || optVal.includes('filer')) {
                            custTypeEl.selectedIndex = i;
                            matched = true;
                            break;
                        }
                    }
                }
            }
        }

        if (document.getElementById('di_wht_pct')) {
            let whtRate = 0;
            if (c.wht_rate !== undefined && c.wht_rate !== null && c.wht_rate !== '') {
                whtRate = parseFloat(c.wht_rate) || 0;
            } else if (c.withholding_tax !== undefined && c.withholding_tax !== null && c.withholding_tax !== '') {
                whtRate = parseFloat(c.withholding_tax) || 0;
            }
            document.getElementById('di_wht_pct').value = whtRate > 0 ? whtRate.toFixed(1) : '0.0';
            const whtLabel = document.getElementById('di_wht_label');
            if (whtLabel) {
                whtLabel.textContent = c.wht_type || 'With-236C/236H';
            }
            onWhtPctChange();
        }

        // Update displayed ATL Status badge and verification card if customer has saved FBR verification
        const atlBadge = document.getElementById('di_cust_atl_badge');
        if (atlBadge) {
            if (c.fbr_atl_status === 'Active Taxpayer') {
                atlBadge.textContent = 'Active (Filer)';
                atlBadge.style.background = '#dcfce7';
                atlBadge.style.color = '#15803d';
            } else if (c.fbr_atl_status === 'Not Active') {
                atlBadge.textContent = 'Inactive (Non-Filer)';
                atlBadge.style.background = '#fee2e2';
                atlBadge.style.color = '#b91c1c';
            } else if (c.fbr_atl_status) {
                atlBadge.textContent = c.fbr_atl_status;
                atlBadge.style.background = '#fef3c7';
                atlBadge.style.color = '#b45309';
            }
        }

        if (c.fbr_verified_at || c.fbr_atl_status || c.fbr_reg_status) {
            populateVerificationPanel({
                customer_name: c.customer_name || c.name || '',
                business_name: c.fbr_business_name || c.customer_name || c.name || '',
                cnic: valCnic || (digitsNtn.length === 13 ? valNtn : ''),
                ntn: (digitsNtn.length === 13) ? '' : valNtn,
                strn: c.st_reg_no || c.gst_reg_no || '',
                sales_tax_registered: c.fbr_sales_tax_reg || 'No',
                sales_tax_status: c.fbr_sales_tax_status || 'Not Registered',
                registration_status: c.fbr_reg_status || (valNtn || c.st_reg_no ? 'Registered' : 'Not Registered'),
                atl_status: c.fbr_atl_status || 'Active Taxpayer',
                verification_date: c.fbr_verified_at ? formatDateString(c.fbr_verified_at) : 'Saved in Master',
                verification_source: c.fbr_verification_source || 'ERP Customer Master',
                verification_result: 'Verified (Saved)'
            }, false);
        }

        selectedCustomer = c;
        onCustomerTypeChange();
        checkCustomerTypeMatch(false);
        validateInvoice();
    }

    function clearCustomer() {
        selectedCustomer = null;
        document.getElementById('di_customer_coa_id').value = '';
        if (document.getElementById('di_cust_code')) document.getElementById('di_cust_code').value = '';
        if (document.getElementById('di_cust_name')) document.getElementById('di_cust_name').value = '';
        if (document.getElementById('di_cust_business_name')) document.getElementById('di_cust_business_name').value = '';
        document.getElementById('di_cust_address').value = '';
        document.getElementById('di_cust_phone').value = '';
        document.getElementById('di_cust_strn').value = '';
        document.getElementById('di_cust_ntn').value = '';
        document.getElementById('di_cust_cnic').value = '';
        if (document.getElementById('di_customer_province')) document.getElementById('di_customer_province').value = '';
        if (document.getElementById('di_customer_type')) {
            const ctEl = document.getElementById('di_customer_type');
            ctEl.selectedIndex = 0;
            delete ctEl.dataset.masterBuyerTypeId;
            delete ctEl.dataset.masterBuyerTypeName;
            checkCustomerTypeMatch(false);
        }
        const atlBadge = document.getElementById('di_cust_atl_badge');
        if (atlBadge) {
            atlBadge.textContent = 'Active (Filer)';
            atlBadge.style.background = '#dcfce7';
            atlBadge.style.color = '#15803d';
        }
        if (document.getElementById('di_wht_pct')) document.getElementById('di_wht_pct').value = '0.0';
        if (document.getElementById('di_withholding_tax')) document.getElementById('di_withholding_tax').value = '0.00';
        const whtLabel = document.getElementById('di_wht_label');
        if (whtLabel) whtLabel.textContent = 'With-236C/236H';
        onCustomerTypeChange();
    }

    // =========================================================================
    // FBR CUSTOMER VERIFICATION & AUTO-FILL METHODS
    // =========================================================================

    function formatDateString(str) {
        if (!str) return '-';
        try {
            const d = new Date(str);
            if (isNaN(d.getTime())) return str;
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
                   d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        } catch (e) {
            return str;
        }
    }

    function toggleLowerLeftView(viewName) {
        const invView = document.getElementById('di_panel_inventory_view');
        const verView = document.getElementById('di_panel_verification_view');
        const invBtn = document.getElementById('di_tab_btn_inv');
        const verBtn = document.getElementById('di_tab_btn_ver');

        if (viewName === 'verification') {
            if (invView) invView.style.display = 'none';
            if (verView) verView.style.display = 'flex';
            if (invBtn) {
                invBtn.style.background = 'transparent';
                invBtn.style.border = '1px solid #cbd5e1';
                invBtn.style.fontWeight = '600';
                invBtn.style.color = '#64748b';
            }
            if (verBtn) {
                verBtn.style.background = '#e2e8f0';
                verBtn.style.border = 'none';
                verBtn.style.fontWeight = '700';
                verBtn.style.color = '#0f172a';
            }
            activePanel1View = 'verification';
        } else {
            if (verView) verView.style.display = 'none';
            if (invView) invView.style.display = 'grid';
            if (invBtn) {
                invBtn.style.background = '#e2e8f0';
                invBtn.style.border = 'none';
                invBtn.style.fontWeight = '700';
                invBtn.style.color = '#0f172a';
            }
            if (verBtn) {
                verBtn.style.background = 'transparent';
                verBtn.style.border = '1px solid #cbd5e1';
                verBtn.style.fontWeight = '600';
                verBtn.style.color = '#64748b';
            }
            activePanel1View = 'inventory';
        }
    }

    function setVerificationLoading(msg) {
        const resBadge = document.getElementById('di_ver_result_badge');
        const okBtn = document.getElementById('di_ver_btn_ok');
        const msgBox = document.getElementById('di_ver_msg_box');

        if (resBadge) {
            resBadge.textContent = 'Verifying...';
            resBadge.style.background = '#e0f2fe';
            resBadge.style.color = '#0284c7';
        }
        if (okBtn) okBtn.disabled = true;
        if (msgBox) {
            msgBox.style.display = 'block';
            msgBox.style.background = '#f0f9ff';
            msgBox.style.color = '#0369a1';
            msgBox.style.border = '1px solid #bae6fd';
            msgBox.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + escapeHtml(msg);
        }
    }

    function setVerificationError(badgeText, errorMsg) {
        lastVerifiedTaxpayer = null;
        const resBadge = document.getElementById('di_ver_result_badge');
        const okBtn = document.getElementById('di_ver_btn_ok');
        const msgBox = document.getElementById('di_ver_msg_box');
        const custNameEl = document.getElementById('di_ver_cust_name');
        const bizNameEl = document.getElementById('di_ver_business_name');
        const cnicEl = document.getElementById('di_ver_cnic');
        const ntnEl = document.getElementById('di_ver_ntn');
        const strnEl = document.getElementById('di_ver_strn');
        const stRegEl = document.getElementById('di_ver_st_reg');
        const stStatusEl = document.getElementById('di_ver_st_status');
        const regStatusEl = document.getElementById('di_ver_reg_status');
        const atlStatusEl = document.getElementById('di_ver_atl_status');
        const dtEl = document.getElementById('di_ver_datetime');
        const srcEl = document.getElementById('di_ver_source');

        if (custNameEl) custNameEl.textContent = '-';
        if (bizNameEl) bizNameEl.textContent = '-';
        if (cnicEl) cnicEl.textContent = '-';
        if (ntnEl) ntnEl.textContent = '-';
        if (strnEl) strnEl.textContent = '-';
        if (stRegEl) stRegEl.innerHTML = '<span style="color: #64748b;">-</span>';
        if (stStatusEl) stStatusEl.innerHTML = '<span style="color: #64748b;">-</span>';
        if (regStatusEl) regStatusEl.innerHTML = '<span style="color: #64748b;">-</span>';
        if (atlStatusEl) atlStatusEl.innerHTML = '<span style="color: #64748b;">-</span>';
        if (dtEl) dtEl.textContent = '-';
        if (srcEl) srcEl.textContent = '-';

        const isUnconfig = (badgeText === 'Not Configured');
        const isNotFound = (badgeText === 'No matching record found');

        if (resBadge) {
            resBadge.textContent = badgeText;
            resBadge.style.background = isUnconfig ? '#fef3c7' : (isNotFound ? '#f1f5f9' : '#fee2e2');
            resBadge.style.color = isUnconfig ? '#b45309' : (isNotFound ? '#475569' : '#b91c1c');
        }

        if (okBtn) okBtn.disabled = true;

        if (msgBox) {
            msgBox.style.display = 'block';
            msgBox.style.background = isUnconfig ? '#fffbeb' : (isNotFound ? '#f8fafc' : '#fef2f2');
            msgBox.style.color = isUnconfig ? '#92400e' : (isNotFound ? '#334155' : '#991b1b');
            msgBox.style.border = '1px solid ' + (isUnconfig ? '#fde68a' : (isNotFound ? '#cbd5e1' : '#fecaca'));
            msgBox.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + escapeHtml(errorMsg);
        }
    }

    function populateVerificationPanel(data, isFreshVerification = true) {
        if (!data) return;
        lastVerifiedTaxpayer = data;

        const custNameEl = document.getElementById('di_ver_cust_name');
        const bizNameEl = document.getElementById('di_ver_business_name');
        const cnicEl = document.getElementById('di_ver_cnic');
        const ntnEl = document.getElementById('di_ver_ntn');
        const strnEl = document.getElementById('di_ver_strn');
        const stRegEl = document.getElementById('di_ver_st_reg');
        const stStatusEl = document.getElementById('di_ver_st_status');
        const regStatusEl = document.getElementById('di_ver_reg_status');
        const atlStatusEl = document.getElementById('di_ver_atl_status');
        const dtEl = document.getElementById('di_ver_datetime');
        const srcEl = document.getElementById('di_ver_source');
        const resBadge = document.getElementById('di_ver_result_badge');
        const miniBadge = document.getElementById('di_ver_mini_badge');
        const indicator = document.getElementById('di_tab_ver_indicator');
        const okBtn = document.getElementById('di_ver_btn_ok');
        const msgBox = document.getElementById('di_ver_msg_box');

        if (custNameEl) custNameEl.textContent = data.customer_name || '-';
        if (bizNameEl) bizNameEl.textContent = data.business_name || '-';
        if (cnicEl) cnicEl.textContent = data.cnic || '-';
        if (ntnEl) ntnEl.textContent = data.ntn || '-';
        if (strnEl) strnEl.textContent = data.strn || 'N/A';
        if (dtEl) dtEl.textContent = data.verification_date || '-';
        if (srcEl) srcEl.textContent = data.verification_source || 'FBR / PRAL Gateway';

        // Sales Tax Reg: e.g. "Yes. w.e.f. 01-FEB-24" or "No"
        if (stRegEl) {
            const rawStReg = (data.sales_tax_registered || '').trim();
            const isStYes = rawStReg.toLowerCase().startsWith('yes');
            if (isStYes) {
                stRegEl.innerHTML = `<span style="background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 3px; font-weight: 700;">${escapeHtml(rawStReg)}</span>`;
            } else if (rawStReg.toLowerCase() === 'no') {
                stRegEl.innerHTML = `<span style="background: #fee2e2; color: #b91c1c; padding: 1px 6px; border-radius: 3px; font-weight: 700;">No</span>`;
            } else {
                stRegEl.innerHTML = `<span style="color: #64748b;">${escapeHtml(rawStReg || 'No')}</span>`;
            }
        }

        // Sales Tax Status: e.g. "OPERATIVE", "Active", "Not Registered", "SUSPENDED"
        if (stStatusEl) {
            const rawStStatus = (data.sales_tax_status || '').trim();
            const upperStatus = rawStStatus.toUpperCase();
            if (upperStatus === 'OPERATIVE' || upperStatus === 'ACTIVE') {
                stStatusEl.innerHTML = `<span style="background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 3px; font-weight: 700;">${escapeHtml(rawStStatus)}</span>`;
            } else if (upperStatus.includes('SUSPEND') || upperStatus.includes('BLACK')) {
                stStatusEl.innerHTML = `<span style="background: #fee2e2; color: #b91c1c; padding: 1px 6px; border-radius: 3px; font-weight: 700;">${escapeHtml(rawStStatus)}</span>`;
            } else if (upperStatus === 'NOT REGISTERED' || !rawStStatus) {
                stStatusEl.innerHTML = `<span style="background: #f1f5f9; color: #64748b; padding: 1px 6px; border-radius: 3px; font-weight: 600;">Not Registered</span>`;
            } else {
                stStatusEl.innerHTML = `<span style="background: #fef3c7; color: #b45309; padding: 1px 6px; border-radius: 3px; font-weight: 600;">${escapeHtml(rawStStatus)}</span>`;
            }
        }

        // Registration Status: clearly distinguish 'Registered' vs 'Not Registered'
        if (regStatusEl) {
            const isReg = (data.registration_status === 'Registered');
            regStatusEl.innerHTML = isReg
                ? '<span style="background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 3px; font-weight: 700;">Registered</span>'
                : '<span style="background: #fee2e2; color: #b91c1c; padding: 1px 6px; border-radius: 3px; font-weight: 700;">Not Registered</span>';
        }

        // ATL Status: clearly distinguish 'Active Taxpayer' vs 'Not Active' vs 'Unable to Verify'
        if (atlStatusEl) {
            if (data.atl_status === 'Active Taxpayer') {
                atlStatusEl.innerHTML = '<span style="background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 3px; font-weight: 700;">Active Taxpayer</span>';
            } else if (data.atl_status === 'Not Active') {
                atlStatusEl.innerHTML = '<span style="background: #fee2e2; color: #b91c1c; padding: 1px 6px; border-radius: 3px; font-weight: 700;">Not Active</span>';
            } else {
                atlStatusEl.innerHTML = '<span style="background: #fef3c7; color: #b45309; padding: 1px 6px; border-radius: 3px; font-weight: 700;">Unable to Verify</span>';
            }
        }

        // Result badge & indicators
        if (resBadge) {
            const isReg = (data.registration_status === 'Registered');
            const hasNtn = !!(data.ntn && data.ntn.replace(/[^0-9]/g, '').length >= 6);
            if (isReg && hasNtn) {
                resBadge.textContent = data.verification_result || 'Verified (Registered)';
                resBadge.style.background = '#dcfce7';
                resBadge.style.color = '#15803d';
            } else {
                resBadge.textContent = data.verification_result || 'Unregistered Buyer';
                resBadge.style.background = '#fef3c7';
                resBadge.style.color = '#92400e';
            }
        }
        if (miniBadge) miniBadge.style.display = 'inline-block';
        if (indicator) indicator.style.display = 'inline-block';

        if (okBtn) {
            okBtn.disabled = false;
        }

        if (msgBox) {
            if (data.notice) {
                msgBox.style.display = 'block';
                msgBox.style.background = '#eff6ff';
                msgBox.style.color = '#1e40af';
                msgBox.style.border = '1px solid #bfdbfe';
                msgBox.innerHTML = '<i class="fas fa-info-circle"></i> ' + escapeHtml(data.notice);
            } else {
                msgBox.style.display = 'none';
            }
        }
    }

    async function verifyCustomerFBR() {
        const ntnInput = document.getElementById('di_cust_ntn');
        const cnicInput = document.getElementById('di_cust_cnic');
        const rawNtn = (ntnInput?.value || '').trim();
        const rawCnic = (cnicInput?.value || '').trim();

        // Support alphanumeric NTNs and 13-digit CNIC in EITHER box!
        const cleanNtn = rawNtn.replace(/[^\w\-]/g, '');
        const cleanCnic = rawCnic.replace(/[^\w\-]/g, '');
        const digitsNtn = rawNtn.replace(/[^0-9]/g, '');
        const digitsCnic = rawCnic.replace(/[^0-9]/g, '');

        let query = '';
        let queryType = '';

        // Case A: 13 digits entered in CNIC box
        if (digitsCnic.length === 13) {
            query = digitsCnic;
            queryType = 'CNIC';
        } 
        // Case B: 13 digits entered in NTN box
        else if (digitsNtn.length === 13) {
            query = digitsNtn;
            queryType = 'CNIC';
            // User put CNIC in NTN box -> move formatted CNIC into CNIC box
            if (cnicInput) {
                cnicInput.value = digitsNtn.substr(0, 5) + '-' + digitsNtn.substr(5, 7) + '-' + digitsNtn.substr(12, 1);
            }
            if (ntnInput) {
                ntnInput.value = '';
            }
        }
        // Case C: User typed an NTN in CNIC box (not 13 digits)
        else if (cleanCnic && digitsCnic.length !== 13) {
            query = cleanCnic;
            queryType = 'NTN';
            if (ntnInput && !cleanNtn) {
                ntnInput.value = cleanCnic;
            }
            if (cnicInput) {
                cnicInput.value = '';
            }
        }
        // Case D: NTN box has value
        else if (cleanNtn) {
            query = cleanNtn;
            queryType = 'NTN';
        }

        // Validation if neither was entered
        if (!query) {
            toggleLowerLeftView('verification');
            setVerificationError('Input Required', 'Please enter customer\'s CNIC (13 digits) or NTN in CNIC or NTN box before searching FBR.');
            if (cnicInput) cnicInput.focus();
            return;
        }

        // Validate format:
        // CNIC: 13 digits
        // NTN: 7 or 8 alphanumeric chars (+ optional 1-digit check suffix after dash)
        const baseQuery = query.includes('-') ? query.split('-')[0] : query;
        const isLikelyCnic = (query.replace(/[^0-9]/g, '').length === 13);
        const isLikelyNtn = (baseQuery.length >= 7 && baseQuery.length <= 8) || (baseQuery.replace(/[^0-9]/g, '').length >= 6 && baseQuery.length <= 9);

        if (!isLikelyCnic && !isLikelyNtn && query.length < 7) {
            toggleLowerLeftView('verification');
            setVerificationError('Invalid Format', `Invalid format: CNIC must be 13 digits, or NTN must be at least 7 characters. (Entered: ${escapeHtml(query)})`);
            return;
        }

        // Switch to verification view and set searching state
        toggleLowerLeftView('verification');
        setVerificationLoading(`Searching FBR / PRAL for ${queryType} ${query}...`);

        try {
            const formData = new FormData();
            formData.append('action', 'verify_customer_fbr');
            formData.append('reg_no', query);
            formData.append('company_id', getCompanyId());
            formData.append('customer_name', document.getElementById('di_cust_name')?.value.trim() || '');
            formData.append('business_name', document.getElementById('di_cust_business_name')?.value.trim() || '');
            formData.append('phone', document.getElementById('di_cust_phone')?.value.trim() || '');
            formData.append('address', document.getElementById('di_cust_address')?.value.trim() || '');
            formData.append('province', document.getElementById('di_customer_province')?.value.trim() || '');
            formData.append('strn', document.getElementById('di_cust_strn')?.value.trim() || '');
            formData.append('ntn', cleanNtn || (queryType === 'NTN' ? query : ''));
            formData.append('cnic', cleanCnic || (queryType === 'CNIC' ? query : ''));

            const res = await fetch(`api/digital_invoice.php?action=verify_customer_fbr&_cb=${Date.now()}`, {
                method: 'POST',
                body: formData
            });

            const json = await res.json();

            if (json.status === 'success' && json.data) {
                populateVerificationPanel(json.data, true);
                if (json.data.cnic && cnicInput) {
                    cnicInput.value = json.data.cnic;
                }
                if (json.data.ntn && ntnInput && json.data.ntn !== '-' && json.data.ntn !== 'N/A' && !json.data.ntn.includes('Unregistered')) {
                    ntnInput.value = json.data.ntn;
                }
                if (json.data.customer_name && json.data.customer_name !== '-' && json.data.customer_name !== 'Unregistered Buyer') {
                    const custNameEl = document.getElementById('di_cust_name');
                    if (custNameEl) {
                        custNameEl.value = json.data.customer_name;
                    }
                }
                if (json.data.business_name && json.data.business_name !== '-' && !json.data.business_name.includes('Unregistered')) {
                    const bizNameEl = document.getElementById('di_cust_business_name');
                    if (bizNameEl) {
                        bizNameEl.value = json.data.business_name;
                    }
                }
                if (json.data.address && json.data.address !== '-' && json.data.address !== 'N/A') {
                    const addrEl = document.getElementById('di_cust_address');
                    if (addrEl && (!addrEl.value.trim() || addrEl.value.length < 5)) addrEl.value = json.data.address;
                }
                if (json.data.strn && json.data.strn !== 'N/A' && json.data.strn !== '-') {
                    const strnEl = document.getElementById('di_cust_strn');
                    if (strnEl && !strnEl.value.trim()) strnEl.value = json.data.strn;
                }
                if (json.data.province && json.data.province !== '-') {
                    const provEl = document.getElementById('di_customer_province');
                    if (provEl) provEl.value = json.data.province;
                }

                const custTypeEl = document.getElementById('di_customer_type');
                const isReg = (json.data.registration_status === 'Registered');
                const hasNtn = !!(json.data.ntn && json.data.ntn.replace(/[^0-9]/g, '').length >= 6);
                const isStReg = (json.data.sales_tax_registered && json.data.sales_tax_registered.toLowerCase().startsWith('yes')) || (json.data.sales_tax_status && json.data.sales_tax_status.toUpperCase() === 'OPERATIVE');

                if (custTypeEl) {
                    if (isReg && (hasNtn || isStReg) && (json.data.atl_status === 'Active Taxpayer' || json.data.atl_status === 'Active')) {
                        custTypeEl.value = 'Registered Person (Filer)';
                    } else {
                        custTypeEl.value = 'Unregistered Buyer (Non-Filer)';
                    }
                    onCustomerTypeChange();
                }

                const atlBadge = document.getElementById('di_cust_atl_badge');
                if (atlBadge) {
                    if (isReg && (json.data.atl_status === 'Active Taxpayer' || json.data.atl_status === 'Active')) {
                        atlBadge.textContent = 'Active (Filer)';
                        atlBadge.style.background = '#dcfce7';
                        atlBadge.style.color = '#15803d';
                    } else {
                        atlBadge.textContent = 'Inactive (Non-Filer)';
                        atlBadge.style.background = '#fee2e2';
                        atlBadge.style.color = '#b91c1c';
                    }
                }

                const stNotice = isStReg ? ` [Sales Tax: ${json.data.sales_tax_registered}]` : ` [Sales Tax: No]`;
                if (isReg && (hasNtn || isStReg)) {
                    showAlert(`Live FBR Profile Verified: ${json.data.customer_name}${json.data.ntn ? ' (NTN: ' + json.data.ntn + ')' : ''}${stNotice}`, 'success');
                } else {
                    showAlert(`Buyer is Unregistered (Non-Filer). Further Tax applicable.`, 'warning');
                }
            } else if (json.status === 'unconfigured') {
                setVerificationError('Not Configured', json.message || 'No authorized automated verification service configured.');
            } else if (json.status === 'auth_error') {
                setVerificationError('Authorization Failure', json.message || 'FBR credentials expired or unauthorized.');
            } else if (json.status === 'unavailable') {
                setVerificationError('Unable to Verify', json.message || 'FBR / PRAL verification service is currently unavailable.');
            } else if (json.status === 'validation_error') {
                setVerificationError('Validation Error', json.message || 'Invalid CNIC or NTN format.');
            } else {
                setVerificationError('Unable to Verify', json.message || 'Verification could not be completed.');
            }
        } catch (err) {
            console.error('Error verifying customer with FBR:', err);
            setVerificationError('Unable to Verify', 'Network error connecting to verification service: ' + (err.message || err));
        }
    }

    function cancelCustomerVerification() {
        toggleLowerLeftView('inventory');
    }

    async function applyVerifiedCustomer() {
        if (!lastVerifiedTaxpayer) {
            showAlert('No verified customer record to apply.', 'warning');
            return;
        }

        const v = lastVerifiedTaxpayer;

        // Auto-fill Customer Name & Business Name if available
        const nameInput = document.getElementById('di_cust_name');
        if (nameInput && v.customer_name && v.customer_name !== '-' && v.customer_name !== 'Unregistered Buyer') {
            nameInput.value = v.customer_name;
        }

        const bizInput = document.getElementById('di_cust_business_name');
        if (bizInput && (v.business_name || v.customer_name) && v.business_name !== '-') {
            bizInput.value = v.business_name || v.customer_name;
        }

        // Auto-fill CNIC
        const cnicInput = document.getElementById('di_cust_cnic');
        if (cnicInput && v.cnic && v.cnic !== '-' && v.cnic !== 'N/A') {
            cnicInput.value = v.cnic;
        }

        // Auto-fill NTN (if NTN exists)
        const ntnInput = document.getElementById('di_cust_ntn');
        if (ntnInput) {
            if (v.ntn && v.ntn !== '-' && v.ntn !== 'N/A' && !v.ntn.includes('Unregistered')) {
                ntnInput.value = v.ntn;
            } else if (!v.ntn || v.ntn.includes('Unregistered')) {
                ntnInput.value = '';
            }
        }

        // Auto-fill STRN
        const strnInput = document.getElementById('di_cust_strn');
        if (strnInput && v.strn && v.strn !== '-' && v.strn !== 'N/A') {
            strnInput.value = v.strn;
        }

        // Auto-fill Address
        const addrInput = document.getElementById('di_cust_address');
        if (addrInput && v.address && v.address !== '-' && v.address !== 'N/A') {
            addrInput.value = v.address;
        }

        // Auto-fill Province / Region
        const provInput = document.getElementById('di_customer_province');
        if (provInput && v.province && v.province !== '-' && v.province !== 'N/A') {
            provInput.value = v.province;
        }

        // Auto-fill Customer Type
        const custTypeSelect = document.getElementById('di_customer_type');
        if (custTypeSelect) {
            const isReg = (v.registration_status === 'Registered');
            const hasNtn = !!(v.ntn && v.ntn.replace(/[^0-9]/g, '').length >= 6);
            const isStReg = (v.sales_tax_registered && v.sales_tax_registered.toLowerCase().startsWith('yes')) || (v.sales_tax_status && v.sales_tax_status.toUpperCase() === 'OPERATIVE');

            if (isReg && (hasNtn || isStReg) && (v.atl_status === 'Active Taxpayer' || v.atl_status === 'Active')) {
                custTypeSelect.value = 'Registered Person (Filer)';
            } else if (v.atl_status === 'Not Active' || !isReg) {
                custTypeSelect.value = 'Unregistered Buyer (Non-Filer)';
            }
            onCustomerTypeChange();
        }

        // Update displayed ATL Status badge
        const atlBadge = document.getElementById('di_cust_atl_badge');
        if (atlBadge) {
            const isReg = (v.registration_status === 'Registered');
            const hasNtn = !!(v.ntn && v.ntn.replace(/[^0-9]/g, '').length >= 6);
            if (isReg && (v.atl_status === 'Active Taxpayer' || v.atl_status === 'Active')) {
                atlBadge.textContent = 'Active (Filer)';
                atlBadge.style.background = '#dcfce7';
                atlBadge.style.color = '#15803d';
            } else if (v.atl_status === 'Not Active' || !isReg) {
                atlBadge.textContent = 'Inactive (Non-Filer)';
                atlBadge.style.background = '#fee2e2';
                atlBadge.style.color = '#b91c1c';
            } else {
                atlBadge.textContent = v.atl_status || 'Unable to Verify';
                atlBadge.style.background = '#fef3c7';
                atlBadge.style.color = '#b45309';
            }
        }

        // If this taxpayer already exists in ERP Customer Master, link their existing COA ID & code
        if (v.existing_customer && v.existing_customer.coa_id) {
            const coaEl = document.getElementById('di_customer_coa_id');
            if (coaEl) coaEl.value = v.existing_customer.coa_id;
            const codeEl = document.getElementById('di_cust_code');
            if (codeEl && v.existing_customer.customer_code) codeEl.value = v.existing_customer.customer_code;
        }

        // Close verification result panel and restore inventory view
        toggleLowerLeftView('inventory');
        validateInvoice();
    }


    // Check if selected customer type matches the customer's master setup
    function checkCustomerTypeMatch(updateValidationBoxStatus = true) {
        const custTypeEl = document.getElementById('di_customer_type');
        const alertBox = document.getElementById('di_cust_type_mismatch_alert');
        const alertText = document.getElementById('di_cust_type_mismatch_text');
        if (!custTypeEl) return true;

        const masterId = custTypeEl.dataset.masterBuyerTypeId || (selectedCustomer ? selectedCustomer.buyer_type_id : null);
        const masterName = (custTypeEl.dataset.masterBuyerTypeName || (selectedCustomer ? selectedCustomer.buyer_type_name : '') || '').trim();

        // If no master buyer type configured for this customer, no restriction
        if (!masterId && !masterName) {
            if (alertBox) alertBox.style.display = 'none';
            custTypeEl.style.border = '';
            custTypeEl.style.backgroundColor = '';
            return true;
        }

        const curVal = (custTypeEl.value || '').trim();
        const curOpt = custTypeEl.options[custTypeEl.selectedIndex];
        const curId = curOpt ? (curOpt.dataset.id || '') : '';

        const getSnCode = (str) => {
            const m = (str || '').match(/SN\d{3}/i);
            return m ? m[0].toUpperCase() : '';
        };
        const masterSn = getSnCode(masterName);
        const curSn = getSnCode(curVal);

        let isMatch = false;
        if (masterId && curId && String(curId) === String(masterId)) {
            isMatch = true;
        } else if (masterName && curVal.toLowerCase() === masterName.toLowerCase()) {
            isMatch = true;
        } else if (masterSn && curSn && masterSn === curSn) {
            isMatch = true;
        } else {
            const cleanMaster = masterName.toLowerCase().replace(/[\(\)]/g, '').trim();
            const cleanCur = curVal.toLowerCase().replace(/[\(\)]/g, '').trim();
            if (cleanMaster === cleanCur || (cleanMaster.length >= 15 && cleanCur.length >= 15 && (cleanMaster.startsWith(cleanCur) || cleanCur.startsWith(cleanMaster)))) {
                isMatch = true;
            } else if (!masterSn && !curSn) {
                const isRegM = cleanMaster.includes('registered') && !cleanMaster.includes('unregistered');
                const isRegC = cleanCur.includes('registered') && !cleanCur.includes('unregistered');
                const isUnregM = cleanMaster.includes('unregistered') || cleanMaster.includes('non-filer');
                const isUnregC = cleanCur.includes('unregistered') || cleanCur.includes('non-filer');
                const isConM = cleanMaster.includes('consumer');
                const isConC = cleanCur.includes('consumer');
                const isExM = cleanMaster.includes('exempt') || cleanMaster.includes('zero');
                const isExC = cleanCur.includes('exempt') || cleanCur.includes('zero');

                if (isRegM && isRegC) isMatch = true;
                else if (isUnregM && isUnregC) isMatch = true;
                else if (isConM && isConC) isMatch = true;
                else if (isExM && isExC) isMatch = true;
            }
        }

        if (!isMatch) {
            const warningMsg = `Buyer Type Mismatch! Customer Master requires "${masterName || ('ID #' + masterId)}", but "${curVal}" is selected. Changing this is restricted to prevent FBR rejection.`;
            if (alertBox && alertText) {
                alertText.textContent = warningMsg;
                alertBox.style.display = 'block';
            }
            custTypeEl.style.border = '2px solid #ef4444';
            custTypeEl.style.backgroundColor = '#fef2f2';
            if (updateValidationBoxStatus) {
                setValidationBox(false, `Customer Type Mismatch: Master profile has "${masterName}". Submission to FBR is blocked until restored.`);
            }
            return false;
        } else {
            if (alertBox) alertBox.style.display = 'none';
            custTypeEl.style.border = '';
            custTypeEl.style.backgroundColor = '';
            return true;
        }
    }

    function onCustomerTypeChange(skipRowTaxReset = false) {
        const custTypeEl = document.getElementById('di_customer_type');
        if (!custTypeEl) return;
        checkCustomerTypeMatch(true);
        const selectedOpt = custTypeEl.options[custTypeEl.selectedIndex];
        const cType = custTypeEl.value || '';
        const bCode = (selectedOpt?.dataset?.code || '').toLowerCase();
        const buyerTypeEl = document.getElementById('di_sub_buyer_type');
        const strnInput = document.getElementById('di_cust_strn');
        const ntnInput = document.getElementById('di_cust_ntn');
        const cnicInput = document.getElementById('di_cust_cnic');
        const atlBadge = document.getElementById('di_cust_atl_badge');

        const isReg = bCode === 'registered' || cType.toLowerCase().includes('registered') || (cType.toLowerCase().includes('filer') && !cType.toLowerCase().includes('non-filer'));
        const isUnreg = bCode === 'unregistered' || cType.toLowerCase().includes('unregistered') || cType.toLowerCase().includes('non-filer');
        const isConsumer = bCode === 'consumer' || cType.toLowerCase().includes('consumer');
        const isExempt = bCode === 'exempt' || cType.toLowerCase().includes('exempt') || cType.toLowerCase().includes('zero');

        if (buyerTypeEl) {
            buyerTypeEl.textContent = isReg ? 'Registered Person' : (isUnreg ? 'Unregistered Buyer' : (isConsumer ? 'End Consumer' : (isExempt ? 'Exempt / Govt' : cType)));
        }

        if (atlBadge) {
            if (isReg) {
                atlBadge.textContent = 'Active (Filer)';
                atlBadge.style.background = '#dcfce7';
                atlBadge.style.color = '#15803d';
            } else if (isUnreg) {
                atlBadge.textContent = 'Non-Filer';
                atlBadge.style.background = '#fef3c7';
                atlBadge.style.color = '#b45309';
            } else if (isConsumer) {
                atlBadge.textContent = 'Consumer';
                atlBadge.style.background = '#f1f5f9';
                atlBadge.style.color = '#475569';
            } else {
                atlBadge.textContent = 'Exempt';
                atlBadge.style.background = '#e0f2fe';
                atlBadge.style.color = '#0369a1';
            }
        }

        // ALL CUSTOMER FIELDS REMAIN 100% EDITABLE AT ALL TIMES! NEVER DISABLE OR CLEAR VALUES!
        if (strnInput) {
            strnInput.removeAttribute('disabled');
            strnInput.readOnly = false;
            strnInput.placeholder = isReg ? 'STRN (mandatory for registered)' : 'STRN (optional)';
        }
        if (ntnInput) {
            ntnInput.removeAttribute('disabled');
            ntnInput.readOnly = false;
            ntnInput.placeholder = isReg ? '7-8 Digits NTN' : '7-8 Digits NTN (or CNIC)';
        }
        if (cnicInput) {
            cnicInput.removeAttribute('disabled');
            cnicInput.readOnly = false;
            cnicInput.placeholder = (isUnreg || isConsumer) ? '13 digits CNIC (optional if NTN given)' : 'CNIC (optional)';
        }

        if (skipRowTaxReset) {
            return;
        }

        // Apply Sales Tax and Further Tax dynamically based on selected buyer type rates
        let targetSalesRate = isExempt ? 0.00 : 18.00;
        const optSalesTax = selectedOpt && selectedOpt.dataset.salesTaxRate !== undefined && selectedOpt.dataset.salesTaxRate !== '' ? parseFloat(selectedOpt.dataset.salesTaxRate) : NaN;
        if (!isNaN(optSalesTax)) {
            targetSalesRate = optSalesTax;
        }

        let targetFurRate = isUnreg ? 4.00 : 0.00;
        const optFurTax = selectedOpt && selectedOpt.dataset.furtherTaxRate !== undefined && selectedOpt.dataset.furtherTaxRate !== '' ? parseFloat(selectedOpt.dataset.furtherTaxRate) : NaN;
        if (!isNaN(optFurTax)) {
            targetFurRate = optFurTax;
        }

        if (selectedCustomer) {
            if (selectedCustomer.sales_tax_rate !== undefined && selectedCustomer.sales_tax_rate !== null && selectedCustomer.sales_tax_rate !== '') {
                targetSalesRate = parseFloat(selectedCustomer.sales_tax_rate) || 0;
            }
            if (selectedCustomer.further_tax_rate !== undefined && selectedCustomer.further_tax_rate !== null && selectedCustomer.further_tax_rate !== '') {
                targetFurRate = parseFloat(selectedCustomer.further_tax_rate) || 0;
            }
        }

        const rows = document.querySelectorAll('#di_items_tbody .di-item-row');
        let totalsNeedRecalc = false;
        rows.forEach(r => {
            const taxRateInput = r.querySelector('.di-row-tax-rate');
            const furRateInput = r.querySelector('.di-row-fur-rate');
            if (taxRateInput) {
                taxRateInput.value = targetSalesRate.toFixed(2);
                delete r.dataset.manualStAmt;
                totalsNeedRecalc = true;
            }
            if (furRateInput) {
                furRateInput.value = targetFurRate.toFixed(2);
                delete r.dataset.manualFurAmt;
                totalsNeedRecalc = true;
            }
            const itemCode = r.querySelector('.di-row-item-code')?.value.trim();
            const itemName = r.querySelector('.di-row-item-search')?.value.trim();
            if (itemCode || itemName) {
                calculateRow(r);
            }
        });

        if (totalsNeedRecalc) {
            recalculateTotals();
        }
    }

    function onSupplyTypeChange() {
        const supplyType = document.getElementById('di_supply_type')?.value || 'Wholesaler';
        const taxCatEl = document.getElementById('di_sub_tax_cat');
        if (taxCatEl) {
            taxCatEl.textContent = supplyType;
        }

        // Update WHT label dynamically based on supply type (236G for Wholesaler, 236H for Retailer)
        const whtLabel = document.getElementById('di_wht_label');
        if (whtLabel) {
            if (supplyType.toLowerCase().includes('retailer')) {
                whtLabel.textContent = 'With-236H';
            } else if (supplyType.toLowerCase().includes('wholesaler')) {
                whtLabel.textContent = 'With-236G';
            }
        }

        // If Zero Rated or Exempt, set default line tax rate to 0%
        if (supplyType.includes('Zero') || supplyType.includes('Exempt')) {
            const rows = document.querySelectorAll('#di_items_tbody .di-item-row');
            rows.forEach(r => {
                const taxInput = r.querySelector('.di-row-tax-rate');
                if (taxInput) taxInput.value = '0.00';
            });
            recalculateTotals();
        } else {
            // Wholesaler, Retailer, Standard Rate Goods -> default 18.00%
            const rows = document.querySelectorAll('#di_items_tbody .di-item-row');
            rows.forEach(r => {
                const taxInput = r.querySelector('.di-row-tax-rate');
                if (taxInput && num(taxInput.value) === 0) taxInput.value = '18.00';
            });
            recalculateTotals();
        }
    }

    function onInvoiceTypeChange() {
        const t = document.getElementById('di_invoice_type').value;
        const saleTypeEl = document.getElementById('di_sub_sale_type');
        const refLabel = document.getElementById('di_lbl_ref_inv');
        const refInput = document.getElementById('di_ref_inv_no');

        const isAdj = (t.includes('Credit') || t.includes('Debit'));

        if (saleTypeEl) {
            if (t.includes('Credit')) saleTypeEl.textContent = 'Sales Return (Credit Note)';
            else if (t.includes('Debit')) saleTypeEl.textContent = 'Debit Note (Upward)';
            else saleTypeEl.textContent = 'Domestic (Standard)';
        }

        if (refLabel) {
            refLabel.style.color = isAdj ? '#dc2626' : '#334155';
            refLabel.textContent = isAdj ? 'Ref. Invoice *' : 'Ref. Invoice No.';
        }
        if (refInput && isAdj) {
            refInput.placeholder = 'Original FBR/ERP Invoice No (Mandatory)';
        }
    }

    // Gather Invoice Payload
    function gatherInvoiceData() {
        const rows = document.querySelectorAll('#di_items_tbody .di-item-row');
        const items = [];

        rows.forEach((r, idx) => {
            const itemCode = r.querySelector('.di-row-item-code')?.value.trim() || '';
            let itemName = r.querySelector('.di-row-item-search')?.value.trim() || '';
            if (!itemName && !itemCode) return;
            if (!itemName) itemName = itemCode;

            const pcs = num(r.querySelector('.di-row-pieces')?.value);
            const q = num(r.querySelector('.di-row-qty').value);
            const rate = num(r.querySelector('.di-row-rate').value);
            const gross = num(r.querySelector('.di-row-val-excl').value.replace(/,/g, ''));
            const taxRate = num(r.querySelector('.di-row-tax-rate').value);
            const stAmt = num(r.querySelector('.di-row-st-amt').value.replace(/,/g, ''));
            const furRate = num(r.querySelector('.di-row-fur-rate').value);
            const furAmt = num(r.querySelector('.di-row-fur-disp')?.value.replace(/,/g, '') || r.querySelector('.di-row-fur-amt')?.value);
            const extRate = num(r.querySelector('.di-row-ext-rate').value);
            const extAmt = num(r.querySelector('.di-row-ext-disp')?.value.replace(/,/g, '') || r.querySelector('.di-row-ext-amt')?.value);
            const fedRate = 0;
            const fedAmt = 0;
            const valIncl = num(r.querySelector('.di-row-val-incl').value.replace(/,/g, ''));

            items.push({
                item_id: r.querySelector('.di-row-item-id').value || null,
                item_code: itemCode,
                item_name: itemName,
                description: itemName,
                hs_code: r.querySelector('.di-row-hs').value.trim() || '0000.0000',
                item_classification: r.querySelector('.di-row-classification').value || 'Goods',
                uom: r.querySelector('.di-row-uom').value || 'Pcs',
                pieces: pcs,
                quantity: q,
                rate: rate,
                gross_amount: gross,
                discount_percent: 0,
                discount_amount: 0,
                tax_rate: taxRate,
                sales_tax_amount: stAmt,
                further_tax_rate: furRate,
                further_tax_amount: furAmt,
                extra_tax_rate: extRate,
                extra_tax_amount: extAmt,
                fed_rate: fedRate,
                fed_amount: fedAmt,
                val_excl_tax: gross,
                val_incl_tax: valIncl,
                sort_order: idx
            });
        });

        const activeSerial = parseInt(document.getElementById('di_serial_no')?.value) || 0;
        const activeInvNo = currentInvoice?.invoice_no || (document.getElementById('di_invoice_no')?.value || '').trim() || (activeSerial > 0 ? `DI-2026-${String(activeSerial).padStart(4, '0')}` : '');
        const rawFbrNo = (
            document.getElementById('di_fbr_inv_no')?.value ||
            currentInvoice?.fbr_invoice_no ||
            document.getElementById('di_card_fbr_inv_no')?.textContent ||
            document.getElementById('di_resp_ref')?.textContent ||
            document.getElementById('di_val_card_inv_no')?.textContent ||
            ''
        );
        const activeFbrNo = extractCleanFbrInvoiceNumber(rawFbrNo);
        const activeFbrQr = activeFbrNo || (extractCleanFbrInvoiceNumber(currentInvoice?.fbr_qr_code) || '');
        const activeSubTime = currentInvoice?.submission_timestamp || '';

        return {
            id: currentInvoiceId,
            company_id: companyId,
            serial_no: activeSerial,
            invoice_no: activeInvNo,
            fbr_invoice_no: activeFbrNo,
            fbr_qr_code: activeFbrQr,
            submission_timestamp: activeSubTime,
            company: (companyData && Object.keys(companyData).length > 0) ? companyData : (window.companyData || {}),
            invoice_date: document.getElementById('di_invoice_date').value,
            invoice_type: document.getElementById('di_invoice_type').value,
            supply_type: document.getElementById('di_supply_type')?.value || 'Wholesaler',
            customer_type: document.getElementById('di_customer_type').value,
            customer_coa_id: parseInt(document.getElementById('di_customer_coa_id').value) || 0,
            customer_code: document.getElementById('di_cust_code')?.value.trim() || '',
            customer_name: document.getElementById('di_cust_name')?.value.trim() || document.getElementById('di_cust_business_name')?.value.trim() || '',
            business_name: document.getElementById('di_cust_business_name')?.value.trim() || document.getElementById('di_cust_name')?.value.trim() || '',
            customer_ntn: (() => {
                let nVal = (document.getElementById('di_cust_ntn')?.value || '').trim();
                let cVal = (document.getElementById('di_cust_cnic')?.value || '').trim();
                const dN = nVal.replace(/[^0-9]/g, '');
                const dC = cVal.replace(/[^0-9]/g, '');
                if (dN.length === 13) return '';
                if (nVal) return nVal;
                if (dC.length >= 7 && dC.length <= 8) return cVal;
                return '';
            })(),
            customer_cnic: (() => {
                let nVal = (document.getElementById('di_cust_ntn')?.value || '').trim();
                let cVal = (document.getElementById('di_cust_cnic')?.value || '').trim();
                const dN = nVal.replace(/[^0-9]/g, '');
                const dC = cVal.replace(/[^0-9]/g, '');
                if (dN.length === 13) return nVal;
                if (dC.length === 13) return cVal;
                if (cVal && (dC.length < 7 || dC.length > 8)) return cVal;
                return '';
            })(),
            customer_strn: document.getElementById('di_cust_strn').value.trim(),
            customer_phone: document.getElementById('di_cust_phone')?.value.trim() || '',
            customer_reg_status: 'Active',
            customer_address: document.getElementById('di_cust_address').value.trim(),
            customer_province: normalizeProvinceName(document.getElementById('di_customer_province')?.value.trim() || 'Khyber Pakhtunkhwa'),
            ref_doc_no: document.getElementById('di_ref_inv_no')?.value.trim() || '',
            ref_doc_date: document.getElementById('di_ref_inv_date')?.value || null,
            payment_mode: 'Cash',
            remarks: document.getElementById('di_remarks').value.trim(),
            carriage_freight: num(document.getElementById('di_carriage')?.value),
            withholding_tax: num(document.getElementById('di_withholding_tax')?.value),
            wht_rate: num(document.getElementById('di_wht_pct')?.value),
            wht_type: (document.getElementById('di_wht_label')?.textContent || 'With-236C/236H').trim(),
            amount_received: num(document.getElementById('di_received')?.value),
            balance: num(document.getElementById('di_balance')?.value.replace(/,/g, '')),
            rounding_adjustment: num(document.getElementById('di_carriage')?.value),
            net_payable: num(document.getElementById('di_net_total').value.replace(/,/g, '')),
            items: items
        };
    }

    // Save Invoice
    async function saveInvoice() {
        if (isLocked) {
            showAlert('Invoice is submitted to FBR and cannot be edited directly.', 'warning');
            return;
        }

        const payload = gatherInvoiceData();
        if (!payload.customer_coa_id || !payload.customer_name) {
            showAlert('Please select a valid customer from the ERP records.', 'error');
            const codeEl = document.getElementById('di_cust_code');
            const nameEl = document.getElementById('di_cust_name');
            if (codeEl) codeEl.focus();
            else if (nameEl) nameEl.focus();
            return;
        }

        if (payload.items.length === 0) {
            showAlert('Please add at least one line item to save the invoice.', 'error');
            return;
        }

        try {
            const res = await fetch(`api/digital_invoice.php?action=save_invoice&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                currentInvoiceId = data.invoice.id;
                const snEl = document.getElementById('di_serial_no');
                if (snEl) snEl.value = data.invoice.serial_no;
                const invNoEl = document.getElementById('di_invoice_no');
                if (invNoEl) invNoEl.value = data.invoice.invoice_no;
                const subRefEl = document.getElementById('di_sub_inv_ref');
                if (subRefEl) subRefEl.textContent = data.invoice.invoice_no;
                const footInvEl = document.getElementById('di_foot_inv_no');
                if (footInvEl) footInvEl.textContent = data.invoice.serial_no;

                showAlert('Invoice saved successfully in ERP database!', 'success');
            } else {
                showAlert('Error saving invoice: ' + data.message, 'error');
            }
        } catch (err) {
            showAlert('Network error saving invoice: ' + (err.message || err), 'error');
        }
    }

    // Validate Invoice
    async function validateInvoice() {
        const payload = gatherInvoiceData();
        if (!payload.customer_coa_id) {
            setValidationBox(false, 'Customer selection is required.');
            return;
        }

        if (!checkCustomerTypeMatch(true)) {
            return;
        }

        try {
            const res = await fetch(`api/digital_invoice.php?action=validate_invoice&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.is_valid) {
                setValidationBox(true, 'All required data is valid for FBR submission.');
                updateInvoiceStatus('Ready to Submit', 'Ready to Submit');
            } else {
                const firstErr = (data.errors && data.errors[0]) ? data.errors[0].message : 'Validation failed.';
                setValidationBox(false, firstErr);
                updateInvoiceStatus('Pending FBR', 'Pending Validation');
            }
        } catch (err) {
            setValidationBox(false, 'Validation error: ' + (err.message || err));
        }
    }

    function setValidationBox(isValid, msg, fbrRef = null) {
        const normalView = document.getElementById('di_val_normal_view');
        const submittedView = document.getElementById('di_val_submitted_view');
        const iconBox = document.getElementById('di_val_icon_box');
        const icon = document.getElementById('di_val_icon');
        const text = document.getElementById('di_val_status_msg');
        const qrImg = document.getElementById('di_val_qr_img');
        const cardInvNo = document.getElementById('di_val_card_inv_no');
        const cardStatus = document.getElementById('di_val_card_status');
        const cardTime = document.getElementById('di_val_card_time');

        if (text) text.textContent = msg;

        // Check if invoice has official FBR reference number
        const rawRef = fbrRef || (currentInvoice && currentInvoice.fbr_invoice_no) || document.getElementById('di_fbr_inv_no')?.value || document.getElementById('di_card_fbr_inv_no')?.textContent || document.getElementById('di_resp_ref')?.textContent || '';
        const cleanRef = extractCleanFbrInvoiceNumber(rawRef);
        const isOfficialSubmitted = Boolean(isValid && cleanRef && (msg.includes('submitted successfully') || msg.includes('Successfully submitted') || msg.includes('FBR Invoice Number:') || (currentInvoice && (currentInvoice.fbr_status === 'Submitted' || currentInvoice.status === 'Submitted'))));
        const btnVal = document.getElementById('di_btn_validate');

        if (isOfficialSubmitted && cleanRef) {
            const qrUrl = generateQrCodeDataUrl(cleanRef);
            if (qrUrl && qrImg && submittedView && normalView) {
                qrImg.src = qrUrl;
                if (cardInvNo) cardInvNo.textContent = cleanRef;
                if (cardStatus) cardStatus.textContent = 'Submitted (Accepted)';

                const timeStr = (currentInvoice && currentInvoice.submission_timestamp) 
                    || document.getElementById('di_fbr_sub_date')?.textContent?.trim() 
                    || new Date().toISOString().replace('T', ' ').substring(0, 19);
                if (cardTime) cardTime.textContent = timeStr;

                submittedView.style.display = 'flex';
                normalView.style.display = 'none';

                if (btnVal) {
                    btnVal.className = 'fbr-action-btn btn-act-green';
                    btnVal.innerHTML = '<i class="fas fa-check-double"></i> FBR Data Verified & Submitted';
                }
            } else {
                if (submittedView) submittedView.style.display = 'none';
                if (normalView) normalView.style.display = 'flex';
            }
        } else {
            if (submittedView) submittedView.style.display = 'none';
            if (normalView) normalView.style.display = 'flex';
            if (btnVal) {
                btnVal.className = 'fbr-action-btn btn-act-blue';
                btnVal.innerHTML = '<i class="fas fa-clipboard-check"></i> Validate FBR Data';
            }
        }

        if (isValid) {
            if (iconBox) {
                iconBox.style.background = '#dcfce7';
                iconBox.style.color = '#16a34a';
            }
            if (icon) icon.className = 'fas fa-check-circle';
            if (text) text.style.color = '#15803d';
        } else {
            if (iconBox) {
                iconBox.style.background = '#fee2e2';
                iconBox.style.color = '#dc2626';
            }
            if (icon) icon.className = 'fas fa-exclamation-circle';
            if (text) text.style.color = '#b91c1c';
        }
    }

    // =========================================================================
    // FBR PRE-SUBMISSION AUDIT & DUAL-VERIFICATION (SIDE-BY-SIDE INSPECTION)
    // =========================================================================
    let lastAuditPassed = false;

    // Helper: Normalize name and tokenize for identity cross-matching
    function evaluateTaxpayerIdentityMatch(erpCustName, erpBizName, fbrLegalName, fbrBizName) {
        const normalize = (str) => {
            if (!str) return '';
            return str
                .toUpperCase()
                .replace(/[^A-Z0-9\s]/g, ' ')
                .replace(/\b(PVT|PRIVATE|LTD|LIMITED|COMPANY|CO|CORP|CORPORATION|ENTERPRISES|ENTERPRISE|TRADERS|TRADING|SERVICES|INDUSTRIES|INDUSTRY|PAKISTAN|M\/S|AND|THE|OF)\b/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const erpCombined = normalize((erpCustName || '') + ' ' + (erpBizName || ''));
        const fbrCombined = normalize((fbrLegalName || '') + ' ' + (fbrBizName || ''));

        if (!erpCombined) {
            return { isMatch: false, reason: 'ERP Customer Name is empty' };
        }
        if (!fbrCombined) {
            return { isMatch: false, reason: 'FBR Taxpayer Record has no name' };
        }

        // Exact or direct substring match
        if (erpCombined === fbrCombined || fbrCombined.includes(erpCombined) || erpCombined.includes(fbrCombined)) {
            return { isMatch: true, matchedWord: erpCombined.split(' ')[0] || 'Exact' };
        }

        const erpTokens = erpCombined.split(' ').filter(w => w.length >= 3);
        const fbrTokens = fbrCombined.split(' ').filter(w => w.length >= 3);

        if (erpTokens.length === 0 || fbrTokens.length === 0) {
            return { isMatch: false, reason: 'No significant words to match' };
        }

        for (const token of erpTokens) {
            if (fbrTokens.includes(token)) {
                return { isMatch: true, matchedWord: token };
            }
            if (token.length >= 4) {
                const partial = fbrTokens.find(ft => ft.startsWith(token) || token.startsWith(ft));
                if (partial) {
                    return { isMatch: true, matchedWord: token };
                }
            }
        }

        return { isMatch: false, reason: 'Zero matching name tokens' };
    }

    function setAuditCheckBadge(cardId, iconId, textId, status, label) {
        const card = document.getElementById(cardId);
        const icon = document.getElementById(iconId);
        const text = document.getElementById(textId);
        if (!card || !icon || !text) return;

        if (status === 'loading') {
            card.style.background = '#f8fafc';
            card.style.borderColor = '#cbd5e1';
            icon.className = 'fas fa-spinner fa-spin';
            icon.style.color = '#0284c7';
            text.textContent = label || 'Verifying...';
            text.style.color = '#64748b';
        } else if (status === 'pass') {
            card.style.background = '#f0fdf4';
            card.style.borderColor = '#86efac';
            icon.className = 'fas fa-check-circle';
            icon.style.color = '#16a34a';
            text.textContent = label || 'Passed';
            text.style.color = '#15803d';
        } else if (status === 'fail') {
            card.style.background = '#fef2f2';
            card.style.borderColor = '#fca5a5';
            icon.className = 'fas fa-times-circle';
            icon.style.color = '#dc2626';
            text.textContent = label || 'Mismatch';
            text.style.color = '#b91c1c';
        } else if (status === 'warn') {
            card.style.background = '#fffbeb';
            card.style.borderColor = '#fcd34d';
            icon.className = 'fas fa-exclamation-triangle';
            icon.style.color = '#d97706';
            text.textContent = label || 'Notice';
            text.style.color = '#b45309';
        }
    }

    function setAuditAlertBox(type, message) {
        const box = document.getElementById('di_audit_alert_box');
        const icon = document.getElementById('di_audit_alert_icon');
        const text = document.getElementById('di_audit_alert_text');
        if (!box || !icon || !text) return;

        text.innerHTML = message;
        if (type === 'success') {
            box.style.background = '#f0fdf4';
            box.style.borderColor = '#86efac';
            box.style.color = '#166534';
            icon.className = 'fas fa-check-circle';
            icon.style.color = '#16a34a';
        } else if (type === 'error') {
            box.style.background = '#fef2f2';
            box.style.borderColor = '#fca5a5';
            box.style.color = '#991b1b';
            icon.className = 'fas fa-ban';
            icon.style.color = '#dc2626';
        } else if (type === 'warn') {
            box.style.background = '#fffbeb';
            box.style.borderColor = '#fcd34d';
            box.style.color = '#92400e';
            icon.className = 'fas fa-exclamation-triangle';
            icon.style.color = '#d97706';
        } else {
            box.style.background = '#eff6ff';
            box.style.borderColor = '#bfdbfe';
            box.style.color = '#1e40af';
            icon.className = 'fas fa-info-circle';
            icon.style.color = '#0284c7';
        }
    }

    function setAuditConfirmButtonState(enabled) {
        const btn = document.getElementById('di_btn_dialog_confirm');
        if (!btn) return;
        lastAuditPassed = !!enabled;
        if (enabled) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.title = 'All pre-submission checks passed. Click to post to FBR Production.';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.title = 'Post to FBR is locked until data discrepancies or missing fields are resolved.';
        }
    }

    async function openConfirmDialog() {
        try {
            if (isLocked || (currentInvoice && (currentInvoice.fbr_status === 'Submitted' || currentInvoice.workflow_status === 'Submitted'))) {
                showAlert('Yeh invoice pehle hi kamyabi se FBR par submit ho chuki hy (FBR Ref: ' + (currentInvoice?.fbr_invoice_no || '') + '). Duplicate submission blocked hy.', 'warning');
                return;
            }

            // Gather items safely from grid
            const payload = gatherInvoiceData();
            const invItems = payload.items || [];
            if (!invItems || invItems.length === 0) {
                showAlert('Invoice must have at least one valid item before submitting to FBR.', 'warning');
                return;
            }

            // Read current form values
            const serialNo = document.getElementById('di_serial_no')?.value || 'New';
            const invoiceNo = document.getElementById('di_invoice_no')?.value || ('DI-' + serialNo);
            const invDate = document.getElementById('di_invoice_date')?.value || new Date().toISOString().split('T')[0];
            const netTotal = document.getElementById('di_net_total')?.value || '0.00';
            const custName = (document.getElementById('di_cust_name')?.value || '').trim();
            const bizName = (document.getElementById('di_cust_business_name')?.value || '').trim();
            let custNtn = (document.getElementById('di_cust_ntn')?.value || '').trim();
            let custCnic = (document.getElementById('di_cust_cnic')?.value || '').trim();
            const custStrn = (document.getElementById('di_cust_strn')?.value || '').trim();
            const custType = (document.getElementById('di_customer_type')?.value || '').trim();
            const envBadge = document.getElementById('di_top_env_badge')?.textContent || 'Sandbox';

            // Auto-detect and sync 13-digit CNIC entered in NTN box
            const ntnDigits = custNtn.replace(/[^0-9]/g, '');
            const cnicDigits = custCnic.replace(/[^0-9]/g, '');

            if (ntnDigits.length === 13) {
                // User entered 13-digit CNIC in the NTN box
                custCnic = custNtn;
                custNtn = '';
                const elNtn = document.getElementById('di_cust_ntn');
                const elCnic = document.getElementById('di_cust_cnic');
                if (elCnic) elCnic.value = custCnic;
                if (elNtn) elNtn.value = '';
            } else if ((cnicDigits.length >= 7 && cnicDigits.length <= 8) && !custNtn) {
                // User entered 7-8 digit NTN in the CNIC box
                custNtn = custCnic;
                custCnic = '';
                const elNtn = document.getElementById('di_cust_ntn');
                const elCnic = document.getElementById('di_cust_cnic');
                if (elNtn) elNtn.value = custNtn;
                if (elCnic) elCnic.value = '';
            }

            const isConsumer = custType.toLowerCase().includes('consumer');
            const isUnreg = !isConsumer && custType.toLowerCase().includes('unregistered');

            // Identification check: Either valid NTN (7-8 digits) OR 13-digit CNIC is required for all buyers
            const cleanNtnDigits = (custNtn || '').replace(/[^0-9]/g, '');
            const cleanNtnAlpha = (custNtn || '').replace(/[^\w\-]/g, '');
            const hasValidNtn = !!(custNtn && (
                (cleanNtnAlpha.length >= 7 && cleanNtnAlpha.length <= 9) ||
                (cleanNtnDigits.length >= 7 && cleanNtnDigits.length <= 8)
            ));
            const hasValidCnic = !!(custCnic && custCnic.replace(/[^0-9]/g, '').length === 13);

            if (!hasValidNtn && !hasValidCnic) {
                showAlert('Customer NTN (7-8 digits) ya CNIC (13 digits) mein se koi 1 lazmi hai. Barah-e-karam NTN ya CNIC darj karein.', 'warning');
                const ntnInput = document.getElementById('di_cust_ntn');
                const cnicInput = document.getElementById('di_cust_cnic');
                if (ntnInput) {
                    ntnInput.focus();
                    ntnInput.style.borderColor = '#ef4444';
                } else if (cnicInput) {
                    cnicInput.focus();
                    cnicInput.style.borderColor = '#ef4444';
                }
                return;
            }

            // Tax totals
            const stAmt = document.getElementById('di_tot_st')?.value || '0.00';
            const ftAmt = document.getElementById('di_tot_ft')?.value || '0.00';
            const ftAmtNum = parseFloat(ftAmt.replace(/,/g, '')) || 0;
            const stAmtNum = parseFloat(stAmt.replace(/,/g, '')) || 0;

            // Set Top Summary
            const auditEnv = document.getElementById('di_audit_env_badge');
            if (auditEnv) {
                auditEnv.textContent = envBadge;
                auditEnv.style.background = envBadge.toLowerCase().includes('prod') ? '#16a34a' : '#38bdf8';
                auditEnv.style.color = envBadge.toLowerCase().includes('prod') ? '#ffffff' : '#082f49';
            }
            const auditInvRef = document.getElementById('di_audit_inv_ref');
            if (auditInvRef) auditInvRef.textContent = invoiceNo;
            const auditDate = document.getElementById('di_audit_inv_date');
            if (auditDate) auditDate.textContent = invDate;
            const auditItems = document.getElementById('di_audit_items_count');
            if (auditItems) auditItems.textContent = invItems.length;
            const auditNet = document.getElementById('di_audit_net_total');
            if (auditNet) auditNet.textContent = 'PKR ' + netTotal;

            // Populate Left Panel (ERP Invoice Data)
            const elErpName = document.getElementById('di_audit_erp_name');
            if (elErpName) elErpName.textContent = custName || '(Not Entered)';
            const elErpBiz = document.getElementById('di_audit_erp_biz');
            if (elErpBiz) elErpBiz.textContent = bizName || custName || '(None)';
            const elErpNTN = document.getElementById('di_audit_erp_ntn');
            if (elErpNTN) {
                if (custNtn) {
                    elErpNTN.textContent = custNtn;
                } else if (isConsumer) {
                    elErpNTN.textContent = 'N/A (End Consumer)';
                } else if (isUnreg) {
                    elErpNTN.textContent = 'N/A (Unregistered)';
                } else {
                    elErpNTN.textContent = '(Not Provided)';
                }
            }
            const elErpCnic = document.getElementById('di_audit_erp_cnic_strn');
            if (elErpCnic) elErpCnic.textContent = (custCnic ? 'CNIC: ' + custCnic : '') + (custCnic && custStrn ? ' | ' : '') + (custStrn ? 'STRN: ' + custStrn : (!custCnic ? '(None)' : ''));
            const elErpScenario = document.getElementById('di_audit_erp_scenario');
            if (elErpScenario) elErpScenario.textContent = custType || 'Registered Person (Filer)';
            const elErpSt = document.getElementById('di_audit_erp_st_rate');
            if (elErpSt) elErpSt.textContent = `Sales Tax (PKR ${stAmt})`;
            const elErpFt = document.getElementById('di_audit_erp_ft_rate');
            if (elErpFt) elErpFt.textContent = ftAmtNum > 0 ? `Further Tax 4% (PKR ${ftAmt})` : `0% (PKR 0.00)`;

            // Set Loading state on Right Panel
            const fbrLoading = document.getElementById('di_audit_fbr_loading');
            const fbrContent = document.getElementById('di_audit_fbr_content');
            if (fbrLoading) fbrLoading.style.display = 'block';
            if (fbrContent) fbrContent.style.display = 'none';

            setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'loading', 'Verifying with FBR...');
            setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'loading', 'Verifying identity...');
            setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', 'loading', 'Checking tax scenario...');
            setAuditAlertBox('info', 'Connecting to FBR IRIS database to audit invoice data...');
            setAuditConfirmButtonState(false);

            // Show Modal
            const confirmModal = document.getElementById('di_confirm_submission_modal');
            if (confirmModal) confirmModal.style.display = 'flex';

            // Run live audit
            await runFbrPreSubmissionAudit({
                custName,
                bizName,
                custNtn,
                custCnic,
                custStrn,
                custType,
                stAmtNum,
                ftAmtNum
            });
        } catch (dialogErr) {
            console.error('Error opening FBR confirm audit dialog:', dialogErr);
            showAlert('Error opening FBR audit dialog: ' + (dialogErr.message || dialogErr), 'error');
        }
    }

    async function runFbrPreSubmissionAudit(erp) {
        setAuditConfirmButtonState(false);

        const fbrLoading = document.getElementById('di_audit_fbr_loading');
        const fbrContent = document.getElementById('di_audit_fbr_content');

        const isConsumerScenario = erp.custType.toLowerCase().includes('consumer');
        const isUnregisteredScenario = !isConsumerScenario && erp.custType.toLowerCase().includes('unregistered');
        const isRegisteredScenario = !isConsumerScenario && !isUnregisteredScenario && (erp.custType.toLowerCase().includes('registered') || erp.custType.toLowerCase().includes('wholesaler') || erp.custType.toLowerCase().includes('retailer'));

        const rawQuery = (erp.custCnic || erp.custNtn || '').trim();
        const cleanDigits = rawQuery.replace(/[^0-9]/g, '');
        const cleanQuery = rawQuery.replace(/[^\w\-]/g, '');

        // Case 1: No NTN / CNIC given
        if (!cleanQuery) {
            if (fbrLoading) fbrLoading.style.display = 'none';
            if (fbrContent) fbrContent.style.display = 'flex';

            document.getElementById('di_audit_fbr_name').textContent = '(None - No NTN/CNIC)';
            document.getElementById('di_audit_fbr_biz').textContent = isConsumerScenario ? '(End Consumer)' : '(Unregistered Buyer)';
            document.getElementById('di_audit_fbr_ntn').textContent = 'N/A';
            document.getElementById('di_audit_fbr_reg_badge').textContent = 'Unregistered';
            document.getElementById('di_audit_fbr_reg_badge').style.color = '#dc2626';
            document.getElementById('di_audit_fbr_atl_badge').textContent = 'Non-Filer';
            document.getElementById('di_audit_fbr_atl_badge').style.color = '#dc2626';
            document.getElementById('di_audit_fbr_st_status').textContent = 'Not Registered';
            document.getElementById('di_audit_fbr_st_status').style.color = '#dc2626';
            document.getElementById('di_audit_fbr_rto').textContent = 'N/A';

            if (isRegisteredScenario) {
                setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'fail', 'Missing NTN for Registered Buyer');
                setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'fail', 'Unverified');
                setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', 'fail', 'Registered Scenario without NTN');
                setAuditAlertBox('error', '⛔ <strong>CRITICAL DATA ERROR:</strong> "Registered Person" scenario is selected, but NTN is missing! FBR will reject registered invoices without a valid NTN/STRN. Click <strong>Edit / Fix Invoice Data</strong> to provide NTN or change Customer Type to Unregistered / End Consumer.');
                setAuditConfirmButtonState(false);
                return;
            } else if (isConsumerScenario || isUnregisteredScenario) {
                setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'fail', 'NTN or CNIC Required');
                setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'warn', 'Unverified Identity');
                setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', 'fail', 'NTN or CNIC Missing');
                setAuditAlertBox('error', '⛔ <strong>NTN OR CNIC REQUIRED:</strong> Customer ke liye NTN (7-8 digits) ya 13-digit CNIC lazmi hai. Barah-e-karam NTN ya CNIC box mein darj karein.');
                setAuditConfirmButtonState(false);
                return;
            }
        }

        // Case 2: NTN or CNIC is provided -> Query Live FBR IRIS
        try {
            const formData = new FormData();
            formData.append('action', 'verify_customer_fbr');
            formData.append('reg_no', cleanQuery);
            formData.append('company_id', getCompanyId());
            formData.append('customer_name', erp.custName);
            formData.append('business_name', erp.bizName);
            formData.append('ntn', erp.custNtn);
            formData.append('cnic', erp.custCnic);

            const res = await fetch(`api/digital_invoice.php?action=verify_customer_fbr&_cb=${Date.now()}`, {
                method: 'POST',
                body: formData
            });
            const json = await res.json();

            if (fbrLoading) fbrLoading.style.display = 'none';
            if (fbrContent) fbrContent.style.display = 'flex';

            if (json.status === 'success' && json.data) {
                const fbr = json.data;
                const fbrLegalName = (fbr.customer_name || '').trim();
                const fbrBizName = (fbr.business_name || '').trim();
                const fbrNtn = (fbr.ntn || '').trim();
                const isRegInFbr = (fbr.registration_status === 'Registered');
                const isStRegInFbr = (fbr.sales_tax_registered && fbr.sales_tax_registered.toLowerCase().startsWith('yes')) || (fbr.sales_tax_status && fbr.sales_tax_status.toUpperCase() === 'OPERATIVE');
                const isAtlActive = (fbr.atl_status === 'Active Taxpayer' || fbr.atl_status === 'Active');

                // Render Right Panel with official FBR records
                if (isConsumerScenario) {
                    document.getElementById('di_audit_fbr_name').textContent = fbrLegalName || erp.custName || 'Walk-in (Cash) Customer';
                    document.getElementById('di_audit_fbr_biz').textContent = fbrBizName || erp.bizName || 'Walk-in (Cash) Customer';
                    document.getElementById('di_audit_fbr_ntn').textContent = fbrNtn || erp.custNtn || 'N/A (End Consumer)';

                    const elReg = document.getElementById('di_audit_fbr_reg_badge');
                    if (elReg) {
                        elReg.textContent = 'End Consumer (B2C)';
                        elReg.style.color = '#0284c7';
                    }
                    const elAtl = document.getElementById('di_audit_fbr_atl_badge');
                    if (elAtl) {
                        elAtl.textContent = 'Consumer / B2C';
                        elAtl.style.color = '#0284c7';
                    }
                    const elSt = document.getElementById('di_audit_fbr_st_status');
                    if (elSt) {
                        elSt.textContent = 'Exempt Further Tax (Sec 3(1A))';
                        elSt.style.color = '#059669';
                    }
                    const elRto = document.getElementById('di_audit_fbr_rto');
                    if (elRto) elRto.textContent = 'N/A (Retail Consumer)';
                } else if (isUnregisteredScenario) {
                    document.getElementById('di_audit_fbr_name').textContent = fbrLegalName || erp.custName || 'Unregistered Commercial Buyer';
                    document.getElementById('di_audit_fbr_biz').textContent = fbrBizName || erp.bizName || '(Unregistered)';
                    document.getElementById('di_audit_fbr_ntn').textContent = fbrNtn || erp.custNtn || 'N/A (Unregistered)';

                    const elReg = document.getElementById('di_audit_fbr_reg_badge');
                    if (elReg) {
                        elReg.textContent = 'Unregistered Buyer';
                        elReg.style.color = '#d97706';
                    }
                    const elAtl = document.getElementById('di_audit_fbr_atl_badge');
                    if (elAtl) {
                        elAtl.textContent = fbr.atl_status || 'Non-Filer';
                        elAtl.style.color = '#d97706';
                    }
                    const elSt = document.getElementById('di_audit_fbr_st_status');
                    if (elSt) {
                        elSt.textContent = 'Not Registered';
                        elSt.style.color = '#dc2626';
                    }
                    const elRto = document.getElementById('di_audit_fbr_rto');
                    if (elRto) elRto.textContent = fbr.tax_office || 'N/A';
                } else {
                    document.getElementById('di_audit_fbr_name').textContent = fbrLegalName || 'Registered Taxpayer';
                    document.getElementById('di_audit_fbr_biz').textContent = fbrBizName || fbrLegalName || '(None)';
                    document.getElementById('di_audit_fbr_ntn').textContent = fbrNtn || cleanQuery;

                    const elReg = document.getElementById('di_audit_fbr_reg_badge');
                    if (elReg) {
                        elReg.textContent = isRegInFbr ? 'Registered' : (fbr.registration_status || 'Unregistered');
                        elReg.style.color = isRegInFbr ? '#15803d' : '#dc2626';
                    }
                    const elAtl = document.getElementById('di_audit_fbr_atl_badge');
                    if (elAtl) {
                        elAtl.textContent = fbr.atl_status || (isAtlActive ? 'Active Taxpayer' : 'Inactive');
                        elAtl.style.color = isAtlActive ? '#15803d' : '#d97706';
                    }
                    const elSt = document.getElementById('di_audit_fbr_st_status');
                    if (elSt) {
                        elSt.textContent = isStRegInFbr ? 'Registered / Operative' : (fbr.sales_tax_status || 'Not Registered');
                        elSt.style.color = isStRegInFbr ? '#047857' : '#dc2626';
                    }
                    const elRto = document.getElementById('di_audit_fbr_rto');
                    if (elRto) elRto.textContent = fbr.tax_office || 'Regional Tax Office';
                }

                // Check 1: NTN / CNIC Format Check (Either NTN or CNIC supported for all scenarios)
                let checkNtnPass = false;
                const isLikelyValidNtn = !!(erp.custNtn && (
                    erp.custNtn.replace(/[^\w\-]/g, '').length >= 7 ||
                    erp.custNtn.replace(/[^0-9]/g, '').length >= 7
                ));
                const isLikelyValidCnic = !!(erp.custCnic && erp.custCnic.replace(/[^0-9]/g, '').length === 13);

                if (isConsumerScenario || isUnregisteredScenario) {
                    if (isLikelyValidNtn) {
                        checkNtnPass = true;
                        setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'pass', `Valid Buyer NTN (${erp.custNtn || cleanQuery})`);
                    } else if (isLikelyValidCnic || cleanDigits.length === 13) {
                        checkNtnPass = true;
                        setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'pass', `Valid 13-Digit CNIC (${cleanQuery})`);
                    } else {
                        checkNtnPass = false;
                        setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'fail', 'NTN or 13-Digit CNIC Required');
                    }
                } else {
                    checkNtnPass = isRegInFbr || (fbrNtn && fbrNtn !== '-' && !fbrNtn.includes('N/A'));
                    setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', checkNtnPass ? 'pass' : 'fail', checkNtnPass ? `Verified in FBR (${fbrNtn || cleanQuery})` : 'Not Found in FBR');
                }

                // Check 2: Taxpayer Identity & Name Match
                let checkNamePass = false;
                if (isConsumerScenario) {
                    checkNamePass = true;
                    setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'pass', `End Consumer: "${erp.custName || 'Walk-in'}"`);
                } else if (isUnregisteredScenario) {
                    checkNamePass = true;
                    setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'pass', `Unregistered: "${erp.custName || erp.bizName || 'Walk-in'}"`);
                } else {
                    const identityCheck = evaluateTaxpayerIdentityMatch(erp.custName, erp.bizName, fbrLegalName, fbrBizName);
                    checkNamePass = identityCheck.isMatch;
                    setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', checkNamePass ? 'pass' : 'fail', checkNamePass ? `Matched: "${identityCheck.matchedWord}"` : `Mismatch (${fbrLegalName.substring(0, 16)}...)`);
                }

                // Check 3: Tax Scenario Compatibility
                let checkScenarioPass = true;
                let scenarioDesc = 'Compliant';

                if (isConsumerScenario) {
                    // Under FBR Sales Tax Act Section 3(1A), supplies to end consumers are explicitly exempt from Further Tax. Standard rate (18%) applies.
                    if (erp.ftAmtNum > 0) {
                        checkScenarioPass = false;
                        scenarioDesc = 'End Consumer must have 0% Further Tax (Sec 3(1A))';
                    } else {
                        checkScenarioPass = true;
                        scenarioDesc = 'End Consumer (Standard Rate 18%, 0% Further Tax)';
                    }
                } else if (isUnregisteredScenario) {
                    if (erp.ftAmtNum <= 0) {
                        checkScenarioPass = false;
                        scenarioDesc = 'Unregistered buyer requires 4% Further Tax';
                    } else {
                        checkScenarioPass = true;
                        scenarioDesc = 'Unregistered Buyer (4% Further Tax applied)';
                    }
                } else if (isRegisteredScenario) {
                    if (!isStRegInFbr && !isAtlActive) {
                        checkScenarioPass = false;
                        scenarioDesc = 'Buyer not active for Sales Tax in FBR';
                    } else if (erp.ftAmtNum > 0) {
                        checkScenarioPass = false;
                        scenarioDesc = 'Further Tax must be 0% for registered buyer';
                    } else {
                        checkScenarioPass = true;
                        scenarioDesc = 'Registered Person (Standard Rate 18%)';
                    }
                }
                setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', checkScenarioPass ? 'pass' : 'fail', scenarioDesc);

                // Overall Verification Gate
                const allPass = checkNtnPass && checkNamePass && checkScenarioPass;

                if (!checkNtnPass) {
                    if (isConsumerScenario || isUnregisteredScenario) {
                        setAuditAlertBox('error', `⛔ <strong>NTN OR CNIC REQUIRED:</strong> End Consumer aur Unregistered buyer ke liye NTN (7-8 digits) ya 13-digit CNIC lazmi hai. Barah-e-karam NTN ya CNIC box mein darj karein.`);
                    } else {
                        setAuditAlertBox('error', `⛔ <strong>FBR NTN ERROR:</strong> Taxpayer number "${cleanQuery}" was not found in official FBR IRIS records. Please verify if an alphabet or check-digit was omitted.`);
                    }
                    setAuditConfirmButtonState(false);
                } else if (!checkNamePass) {
                    setAuditAlertBox('error', `⛔ <strong>CRITICAL IDENTITY MISMATCH:</strong> Invoice customer name is entered as <strong>"${erp.custName || erp.bizName}"</strong>, but this NTN officially belongs to <strong>"${fbrLegalName}"</strong> in FBR IRIS!<br>Posting now would submit this invoice to the WRONG company\'s tax profile. Submission is strictly locked. Click <strong>Edit / Fix Invoice Data</strong> to correct the NTN.`);
                    setAuditConfirmButtonState(false);
                } else if (!checkScenarioPass) {
                    setAuditAlertBox('error', `⛔ <strong>TAX SCENARIO MISMATCH:</strong> The selected Customer Type (${erp.custType}) does not match FBR tax rules (${scenarioDesc}). Click <strong>Edit / Fix Invoice Data</strong> to adjust Customer Type or Further Tax rate.`);
                    setAuditConfirmButtonState(false);
                } else {
                    if (isConsumerScenario) {
                        const idTypeStr = isLikelyValidNtn ? `NTN (<strong>${erp.custNtn || cleanQuery}</strong>)` : `13-digit CNIC (<strong>${cleanQuery}</strong>)`;
                        setAuditAlertBox('success', `✅ <strong>AUDIT PASSED:</strong> End Consumer invoice validated with ${idTypeStr}. FBR Sales Tax Act Section 3(1A) compliant (Standard Rate 18%, 0% Further Tax). Safe to post to Production.`);
                    } else if (isUnregisteredScenario) {
                        const idTypeStr = isLikelyValidNtn ? `NTN (<strong>${erp.custNtn || cleanQuery}</strong>)` : `13-digit CNIC (<strong>${cleanQuery}</strong>)`;
                        setAuditAlertBox('success', `✅ <strong>AUDIT PASSED:</strong> Unregistered Buyer invoice validated with ${idTypeStr} and Further Tax applied. FBR compliant.`);
                    } else {
                        setAuditAlertBox('success', `✅ <strong>AUDIT PASSED:</strong> ERP Invoice Data perfectly matches official FBR IRIS records for <strong>"${fbrLegalName}"</strong> (NTN: ${fbrNtn || cleanQuery}). Tax scenario is strictly compliant. Safe to post to Production.`);
                    }
                    setAuditConfirmButtonState(true);
                }

            } else if (isConsumerScenario && (cleanDigits.length === 13 || (cleanDigits.length >= 7 && cleanDigits.length <= 8) || (cleanQuery.length >= 7 && cleanQuery.length <= 9))) {
                // End Consumer with valid 13-digit CNIC who has no corporate FBR registration
                document.getElementById('di_audit_fbr_name').textContent = erp.custName || 'Walk-in (Cash) Customer';
                document.getElementById('di_audit_fbr_biz').textContent = erp.bizName || 'Walk-in (Cash) Customer';
                document.getElementById('di_audit_fbr_ntn').textContent = fbrNtn || erp.custNtn || 'N/A (End Consumer)';

                const elReg = document.getElementById('di_audit_fbr_reg_badge');
                if (elReg) { elReg.textContent = 'End Consumer (B2C)'; elReg.style.color = '#0284c7'; }
                const elAtl = document.getElementById('di_audit_fbr_atl_badge');
                if (elAtl) { elAtl.textContent = 'Consumer / B2C'; elAtl.style.color = '#0284c7'; }
                const elSt = document.getElementById('di_audit_fbr_st_status');
                if (elSt) { elSt.textContent = 'Exempt Further Tax (Sec 3(1A))'; elSt.style.color = '#059669'; }
                const elRto = document.getElementById('di_audit_fbr_rto');
                if (elRto) elRto.textContent = 'N/A (Retail Consumer)';

                setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'pass', `Valid 13-Digit CNIC (${cleanQuery})`);
                setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'pass', `End Consumer: "${erp.custName || 'Walk-in'}"`);

                const checkScenarioPass = (erp.ftAmtNum === 0);
                const scenarioDesc = checkScenarioPass ? 'End Consumer (Standard Rate 18%, 0% Further Tax)' : 'End Consumer must have 0% Further Tax (Sec 3(1A))';
                setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', checkScenarioPass ? 'pass' : 'fail', scenarioDesc);

                if (checkScenarioPass) {
                    setAuditAlertBox('success', `✅ <strong>AUDIT PASSED:</strong> End Consumer invoice validated with 13-digit CNIC (<strong>${cleanQuery}</strong>). FBR Sales Tax Act Section 3(1A) compliant (Standard Rate 18%, 0% Further Tax). Safe to post to Production.`);
                    setAuditConfirmButtonState(true);
                } else {
                    setAuditAlertBox('error', `⛔ <strong>TAX SCENARIO MISMATCH:</strong> The selected Customer Type (${erp.custType}) does not match FBR tax rules (${scenarioDesc}). Click <strong>Edit / Fix Invoice Data</strong> to adjust Customer Type or Further Tax rate.`);
                    setAuditConfirmButtonState(false);
                }

            } else {
                // Not found or FBR error
                const errMsg = json.message || 'Taxpayer record not found in official FBR IRIS database.';
                document.getElementById('di_audit_fbr_name').textContent = '(Taxpayer Not Found)';
                document.getElementById('di_audit_fbr_biz').textContent = 'N/A';
                document.getElementById('di_audit_fbr_ntn').textContent = cleanQuery;
                document.getElementById('di_audit_fbr_reg_badge').textContent = 'Not Found';
                document.getElementById('di_audit_fbr_reg_badge').style.color = '#dc2626';
                document.getElementById('di_audit_fbr_atl_badge').textContent = 'Unverified';
                document.getElementById('di_audit_fbr_atl_badge').style.color = '#dc2626';
                document.getElementById('di_audit_fbr_st_status').textContent = 'Unverified';
                document.getElementById('di_audit_fbr_st_status').style.color = '#dc2626';
                document.getElementById('di_audit_fbr_rto').textContent = 'N/A';

                setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'fail', 'Not Found in FBR');
                setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'fail', 'Cannot match identity');
                setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', 'fail', 'Unverified profile');

                setAuditAlertBox('error', `⛔ <strong>FBR RECORD NOT FOUND:</strong> ${errMsg}<br>Check if any character was dropped or mistyped in NTN/CNIC. Submission to FBR is locked to prevent rejected filings.`);
                setAuditConfirmButtonState(false);
            }

        } catch (err) {
            console.error('FBR pre-submission audit error:', err);
            if (fbrLoading) fbrLoading.style.display = 'none';
            if (fbrContent) fbrContent.style.display = 'flex';

            setAuditCheckBadge('di_chk_card_ntn', 'di_chk_icon_ntn', 'di_chk_text_ntn', 'warn', 'Connection Timeout');
            setAuditCheckBadge('di_chk_card_name', 'di_chk_icon_name', 'di_chk_text_name', 'warn', 'Pending FBR');
            setAuditCheckBadge('di_chk_card_scenario', 'di_chk_icon_scenario', 'di_chk_text_scenario', 'warn', 'Pending FBR');

            setAuditAlertBox('warn', `⚠️ <strong>FBR CONNECTION ERROR:</strong> Could not reach FBR verification service (${err.message || err}). Submission is locked for safety. Please check network connectivity or retry.`);
            setAuditConfirmButtonState(false);
        }
    }

    async function proceedProductionSubmit() {
        if (!lastAuditPassed) {
            showAlert('Cannot proceed: FBR Pre-Submission Audit checks have not passed or data mismatch detected.', 'error');
            return;
        }
        closeConfirmDialog();
        await submitToFbr();
    }

    // Explicit Retry Submission handler
    function retrySubmission() {
        if (isLocked || (currentInvoice && (currentInvoice.fbr_status === 'Submitted' || currentInvoice.workflow_status === 'Submitted'))) {
            showAlert('Yeh invoice pehle hi kamyabi se FBR par submit ho chuki hy (FBR Ref: ' + (currentInvoice?.fbr_invoice_no || '') + '). Duplicate submission blocked hy.', 'warning');
            return;
        }
        openConfirmDialog();
    }

    function closeConfirmDialog() {
        const modal = document.getElementById('di_confirm_submission_modal');
        if (modal) modal.style.display = 'none';
    }

    // Submit to FBR
    async function submitToFbr() {
        closeConfirmDialog();

        if (isLocked || (currentInvoice && (currentInvoice.fbr_status === 'Submitted' || currentInvoice.workflow_status === 'Submitted'))) {
            showAlert('Yeh invoice pehle hi kamyabi se FBR par submit ho chuki hy! Duplicate submission blocked hy.', 'warning');
            return;
        }

        if (!checkCustomerTypeMatch(true)) {
            showAlert('Customer Type mismatch with Customer Master! Submission to FBR blocked.', 'error');
            return;
        }

        // Always save latest unsaved screen edits to database before transmitting to FBR
        await saveInvoice();
        if (!currentInvoiceId) return;

        const submitBtn = document.getElementById('di_btn_submit');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        try {
            const res = await fetch(`api/digital_invoice.php?action=submit_to_fbr&company_id=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentInvoiceId })
            });
            const data = await res.json();
            lastRawResponse = data.raw_response ? JSON.stringify(data.raw_response, null, 2) : (data.message || '');

            if (data.status === 'success' || data.is_success) {
                if (!currentInvoice) currentInvoice = {};
                currentInvoice.fbr_invoice_no = data.fbr_invoice_no || 'FBR-OK';
                currentInvoice.fbr_qr_code = data.fbr_qr_code || '';
                currentInvoice.submission_timestamp = new Date().toISOString();
                updateInvoiceStatus('Submitted', 'Submitted');
                updateFbrCardDetails(
                    data.fbr_invoice_no || 'FBR-OK',
                    new Date().toISOString().split('T')[0],
                    data.fbr_invoice_no || 'FBR-OK',
                    new Date().toLocaleTimeString()
                );

                const respStatus = document.getElementById('di_resp_status');
                const respRef = document.getElementById('di_resp_ref');
                if (respStatus) respStatus.textContent = 'Accepted (Code ' + (data.http_code || 200) + ')';
                if (respRef) respRef.textContent = data.fbr_invoice_no || 'FBR-OK';

                setFormLocked(true);
                setValidationBox(true, `Invoice submitted successfully to FBR. Ref: ${data.fbr_invoice_no || 'FBR-OK'}`, data.fbr_invoice_no);
                showAlert(`Success! Transmitted to FBR. Official Reference #: ${data.fbr_invoice_no || 'FBR-OK'}`, 'success');
            } else {
                updateInvoiceStatus('Failed', 'Failed');
                const errMsg = data.message || 'FBR Submission Failed';
                setValidationBox(false, errMsg);
                if (errMsg.includes('seller registration number') || errMsg.includes('authorized token') || errMsg.includes('Unauthorized access')) {
                    showAlert('⚠️ FBR Authentication Error: FBR rejected your SELLER Bearer Token / Company NTN. (Note: This is NOT a customer CNIC/NTN error). Please verify Production API Token in Digital Invoice Settings.', 'error');
                } else {
                    showAlert(`FBR Submission Error: ${errMsg}`, 'error');
                }
            }
        } catch (err) {
            showAlert(`Network error: ${err.message || err}`, 'error');
        } finally {
            if (submitBtn) submitBtn.innerHTML = origText;
        }
    }

    // Refresh FBR Status
    async function refreshFbrStatus() {
        if (!currentInvoiceId) {
            showAlert('Please open a saved invoice first to refresh its FBR status.', 'warning');
            return;
        }

        try {
            const res = await fetch(`api/digital_invoice.php?action=refresh_fbr_status&id=${currentInvoiceId}&company_id=${companyId}`);
            const data = await res.json();

            if (data.status === 'success' && data.invoice) {
                const inv = data.invoice;
                updateInvoiceStatus(inv.fbr_status === 'Submitted' ? 'Submitted' : 'Pending FBR', inv.workflow_status);
                updateFbrCardDetails(
                    inv.fbr_invoice_no || '-',
                    inv.submission_timestamp || '-',
                    inv.fbr_invoice_no || '-',
                    inv.last_status_check || '-'
                );
                showAlert(data.message, 'success');
            } else {
                showAlert('Error refreshing status: ' + data.message, 'error');
            }
        } catch (err) {
            showAlert('Error refreshing status: ' + (err.message || err), 'error');
        }
    }

    // Delete Current Invoice (Allowed only when NOT submitted to FBR)
    async function deleteCurrentInvoice() {
        const sInput = document.getElementById('di_serial_no');
        const sNo = parseInt(sInput?.value || 0);

        if (!currentInvoice && !sNo) {
            showAlert('No digital invoice is currently loaded to delete.', 'warning');
            return;
        }

        const inv = currentInvoice;
        const invId = inv ? inv.id : currentInvoiceId;
        const invNo = inv ? inv.invoice_no : (document.getElementById('di_inv_no_display')?.textContent || `Serial #${sNo}`);

        // Check if submitted to FBR
        const fbrStatus = (inv?.fbr_status || document.getElementById('di_card_inv_status')?.textContent || '').toLowerCase().trim();
        const wfStatus = (inv?.workflow_status || '').toLowerCase().trim();
        const fbrNo = (inv?.fbr_invoice_no || document.getElementById('di_card_fbr_inv_no')?.textContent || '').trim();

        const isSubmitted = wfStatus === 'submitted'
            || ['valid', 'submitted', 'active', 'accepted'].includes(fbrStatus)
            || (fbrNo && fbrNo !== '-' && fbrNo !== 'n/a');

        if (isSubmitted) {
            alert(`[FBR COMPLIANCE NOTICE]\n\nInvoice ${invNo} has already been officially submitted to FBR (FBR No: ${fbrNo || 'Recorded'}).\n\nUnder FBR Digital Invoicing regulations, submitted tax invoices cannot be deleted. If you need to reverse or cancel this invoice, please issue a Digital Credit Note or submit an FBR Invoice Cancellation.`);
            return;
        }

        const confirmMsg = `Are you sure you want to permanently delete Digital Invoice #${invNo} (Serial #${sNo})?\n\nThis will remove the draft invoice and its line items. This action cannot be undone.`;
        if (!confirm(confirmMsg)) return;

        try {
            const formData = new FormData();
            formData.append('action', 'delete_invoice');
            if (invId) formData.append('id', invId);
            formData.append('serial_no', sNo);
            formData.append('company_id', companyId);

            const res = await fetch(`api/digital_invoice.php?action=delete_invoice`, {
                method: 'POST',
                body: formData
            });

            const json = await res.json();
            if (json.status === 'success') {
                showAlert(json.message || 'Invoice deleted successfully.', 'success');
                try {
                    await navigateSerial('prev');
                } catch (e) {
                    newInvoice();
                }
            } else {
                showAlert(json.message || 'Could not delete invoice.', 'error');
            }
        } catch (err) {
            console.error('Error deleting invoice:', err);
            showAlert('Network or server error deleting invoice: ' + (err.message || err), 'error');
        }
    }

    function openSalesRegister() {
        if (typeof window.openModularPopup === 'function') {
            window.openModularPopup('Navigation/DigitalInvoicing/digital_sale_register.html', 'fa-list-alt', 'Digital Invoice Sales Register', () => {
                if (window.DigitalSaleRegisterModule && typeof window.DigitalSaleRegisterModule.init === 'function') {
                    window.DigitalSaleRegisterModule.init();
                }
            }, 'Digital Invoice Sales Register', true, true);
        } else {
            window.open('Navigation/DigitalInvoicing/digital_sale_register.html', '_blank');
        }
    }

    // Status helpers
    function updateInvoiceStatus(fbrStatus, workflowStatus) {
        const cardPill = document.getElementById('di_card_inv_status');
        const subPill = document.getElementById('di_sub_fbr_pill');
        const footStatus = document.getElementById('di_foot_status');

        if (cardPill) {
            cardPill.textContent = fbrStatus;
            cardPill.className = 'fbr-status-pill ' + (fbrStatus === 'Submitted' ? 'pill-submitted' : (fbrStatus === 'Failed' ? 'pill-failed' : 'pill-pending'));
        }
        if (subPill) {
            subPill.textContent = fbrStatus;
            subPill.className = 'fbr-status-pill ' + (fbrStatus === 'Submitted' ? 'pill-submitted' : (fbrStatus === 'Failed' ? 'pill-failed' : 'pill-pending'));
        }
        if (footStatus) {
            footStatus.textContent = fbrStatus;
            footStatus.style.color = (fbrStatus === 'Submitted' ? '#4ade80' : '#facc15');
        }
    }

    function updateFbrCardDetails(invNo, subDate, refNo, checkTime) {
        const invEl = document.getElementById('di_card_fbr_inv_no');
        const invInput = document.getElementById('di_fbr_inv_no');
        const dateEl = document.getElementById('di_card_sub_date');
        const refEl = document.getElementById('di_card_ref_no');
        const checkEl = document.getElementById('di_card_check_time');

        const cleanNo = extractCleanFbrInvoiceNumber(invNo);
        if (invInput) invInput.value = cleanNo;
        if (invEl) invEl.textContent = cleanNo || '-';
        if (dateEl) dateEl.textContent = subDate;
        if (refEl) refEl.textContent = refNo;
        if (checkEl) checkEl.textContent = checkTime;
    }

    function onFbrInvoiceNoInput(val) {
        const cleanNo = extractCleanFbrInvoiceNumber(val);
        if (!currentInvoice) currentInvoice = {};
        currentInvoice.fbr_invoice_no = cleanNo;
        currentInvoice.fbr_qr_code = cleanNo;
        const invEl = document.getElementById('di_card_fbr_inv_no');
        if (invEl) invEl.textContent = cleanNo || '-';
        const respRef = document.getElementById('di_resp_ref');
        if (respRef) respRef.textContent = cleanNo || '-';

        if (cleanNo) {
            setValidationBox(true, 'FBR Invoice Number: ' + cleanNo, cleanNo);
        } else {
            setValidationBox(false, 'Draft Invoice - Click "Validate FBR Data" before submission.');
        }
    }

    function onFbrInvoiceNoChange(val) {
        onFbrInvoiceNoInput(val);
    }

    // Show Raw Response Log
    function showRawResponse() {
        if (!lastRawResponse) {
            showAlert('No FBR API response is recorded for this invoice yet.', 'info');
            return;
        }
        alert("FBR API Response Log:\n\n" + lastRawResponse);
    }

    // Helper: Format Pakistan Date (e.g. 16-10-2026) - Strictly Date Only Without Time
    function formatPakistanDateTime(dateVal) {
        if (!dateVal) {
            const now = new Date();
            const d = String(now.getDate()).padStart(2, '0');
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const y = now.getFullYear();
            return `${d}-${m}-${y}`;
        }

        let dStr = String(dateVal).trim();
        if (dStr.includes('T')) {
            dStr = dStr.split('T')[0];
        } else if (dStr.includes(' ')) {
            dStr = dStr.split(' ')[0];
        }

        let day = '', month = '', year = '';
        if (dStr.includes('-')) {
            const p = dStr.split('-');
            if (p[0].length === 4) { // YYYY-MM-DD
                year = p[0]; month = p[1]; day = p[2];
            } else { // DD-MM-YYYY
                day = p[0]; month = p[1]; year = p[2];
            }
        } else if (dStr.includes('/')) {
            const p = dStr.split('/');
            if (p[2] && p[2].length === 4) {
                day = p[0]; month = p[1]; year = p[2];
            } else if (p[0].length === 4) {
                year = p[0]; month = p[1]; day = p[2];
            }
        }

        if (!day || !month || !year) {
            const now = new Date();
            day = String(now.getDate()).padStart(2, '0');
            month = String(now.getMonth() + 1).padStart(2, '0');
            year = now.getFullYear();
        }

        return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
    }

    // Helper: Amount in Words (English / PKR - Matching Image style)
    function numberToWordsPKR(amount) {
        let n = Math.round(Math.abs(num(amount)));
        if (n === 0) return 'Zero Rupees Only.';

        const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        function convertChunk(val) {
            let s = '';
            if (val >= 100) {
                s += units[Math.floor(val / 100)] + ' Hundred ';
                val %= 100;
                if (val > 0) s += 'And ';
            }
            if (val >= 20) {
                s += tens[Math.floor(val / 10)] + ' ';
                val %= 10;
            }
            if (val > 0) {
                s += units[val] + ' ';
            }
            return s;
        }

        let result = '';
        const billions = Math.floor(n / 1000000000);
        n %= 1000000000;
        const millions = Math.floor(n / 1000000);
        n %= 1000000;
        const thousands = Math.floor(n / 1000);
        n %= 1000;
        const remainder = n;

        if (billions) result += convertChunk(billions) + 'Billion ';
        if (millions) result += convertChunk(millions) + 'Million ';
        if (thousands) result += convertChunk(thousands) + 'Thousand ';
        if (remainder) result += convertChunk(remainder);

        return result.trim().replace(/\s+/g, ' ') + ' Rupees Only.';
    }

    // Helper: Extract Strictly Clean FBR Invoice Number (Strip pipes, prefixes, reject ERP DI-2026- serials)
    function extractCleanFbrInvoiceNumber(raw) {
        if (!raw) return '';
        let str = String(raw).trim();
        if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return '';
        if (str.toLowerCase() === 'pending transmission' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'not available') return '';
        if (str === 'FBR-OK' || str === '123456789012') return '';

        // If composite with pipes (e.g. FBR-INVOICE:XXX|SELLER:YYY|...), extract only the invoice number
        if (str.includes('|')) {
            const parts = str.split('|');
            for (const p of parts) {
                const cleanP = p.trim();
                if (/^fbr-invoice:/i.test(cleanP)) {
                    str = cleanP.replace(/^fbr-invoice:/i, '').trim();
                    break;
                } else if (/^invoice:/i.test(cleanP)) {
                    str = cleanP.replace(/^invoice:/i, '').trim();
                    break;
                }
            }
        }

        // Remove prefixes
        str = str.replace(/^(fbr-invoice:|invoice:|pos:)/i, '').trim();

        // Never use URLs or Base64 as invoice numbers
        if (str.startsWith('data:') || str.startsWith('http://') || str.startsWith('https://')) return '';

        // If it's an ERP internal sequential number (e.g. DI-2026-0001 or INV-2026-0001), it's NOT an FBR number
        if (/^DI-\d{4}-\d+/i.test(str) || /^INV-\d{4}-\d+/i.test(str)) {
            return '';
        }

        return str.trim();
    }
    window.extractCleanFbrInvoiceNumber = extractCleanFbrInvoiceNumber;

    // Helper: Generate Scannable QR Code Data URL via QRCode library
    function generateQrCodeDataUrl(text) {
        if (!text) return '';
        const cleanText = extractCleanFbrInvoiceNumber(text) || String(text).trim();
        if (!cleanText) return '';
        if (typeof QRCode === 'undefined') {
            return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(cleanText)}`;
        }
        try {
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            new QRCode(tempDiv, {
                text: cleanText,
                width: 140,
                height: 140,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });

            let dataUrl = '';
            const canvas = tempDiv.querySelector('canvas');
            if (canvas) {
                dataUrl = canvas.toDataURL('image/png');
            } else {
                const img = tempDiv.querySelector('img');
                if (img && img.src) dataUrl = img.src;
            }
            document.body.removeChild(tempDiv);
            if (!dataUrl) {
                dataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(cleanText)}`;
            }
            return dataUrl;
        } catch (e) {
            console.warn('QR Code generation error:', e);
            return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(cleanText)}`;
        }
    }
    window.generateQrCodeDataUrl = generateQrCodeDataUrl;

    // Helper: Dynamic Live Company Logo Resolver
    function resolveLiveCompanyLogo(payloadComp, globalComp) {
        if (payloadComp) {
            if (payloadComp.logo_data && typeof payloadComp.logo_data === 'string' && payloadComp.logo_data.trim().length > 20) {
                return payloadComp.logo_data.trim();
            }
            if (payloadComp.logo && typeof payloadComp.logo === 'string' && payloadComp.logo.trim().length > 20) {
                return payloadComp.logo.trim();
            }
        }
        if (globalComp) {
            if (globalComp.logo_data && typeof globalComp.logo_data === 'string' && globalComp.logo_data.trim().length > 20) {
                return globalComp.logo_data.trim();
            }
            if (globalComp.logo && typeof globalComp.logo === 'string' && globalComp.logo.trim().length > 20) {
                return globalComp.logo.trim();
            }
        }
        if (window.companyData) {
            if (window.companyData.logo_data && typeof window.companyData.logo_data === 'string' && window.companyData.logo_data.trim().length > 20) {
                return window.companyData.logo_data.trim();
            }
            if (window.companyData.logo && typeof window.companyData.logo === 'string' && window.companyData.logo.trim().length > 20) {
                return window.companyData.logo.trim();
            }
        }
        if (typeof window.logoData === 'string' && window.logoData.trim().length > 20) {
            return window.logoData.trim();
        }
        if (typeof logoData !== 'undefined' && typeof logoData === 'string' && logoData.trim().length > 20) {
            return logoData.trim();
        }
        if (typeof window.getCompanyLogo === 'function') {
            try {
                const fnLogo = window.getCompanyLogo();
                if (fnLogo && typeof fnLogo === 'string' && fnLogo.trim().length > 20) {
                    return fnLogo.trim();
                }
            } catch(e) {}
        }
        try {
            if (typeof getCoKey === 'function') {
                const coLogo = localStorage.getItem(getCoKey('softifyx_logo'));
                if (coLogo && coLogo.startsWith('data:image')) return coLogo;
            }
            const sLogo = localStorage.getItem('softifyx_logo');
            if (sLogo && sLogo.startsWith('data:image')) return sLogo;

            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.toLowerCase().includes('logo')) {
                    const val = localStorage.getItem(k);
                    if (val && val.startsWith('data:image')) {
                        return val;
                    }
                }
            }
        } catch(e) {}

        return 'assets/logos/logo.png';
    }
    window.resolveLiveCompanyLogo = resolveLiveCompanyLogo;

    // Helper: Official FBR Digital Invoicing System Logo & Print Layout (Exact Replica)
    const LS_COMPANY_LOGO_DATA_URL = "data:image/png;base64,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";
    const FBR_PAKISTAN_BADGE_DATA_URL = "data:image/png;base64,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";

    function buildOfficialPrintHtml(payload) {
        if (!payload) return '<div>No invoice data</div>';

        // 1. Live Company Data with intelligent fallbacks
        const compData = payload.company || window.companyData || (typeof companyData !== 'undefined' ? companyData : {});
        const comp = {
            name: (compData.name && compData.name.trim()) || 'SEASTONE PVC PIPE INDUSTRY',
            deals_in: (compData.deals_in && compData.deals_in.trim()) || 'Manufacturers of Master PVC Pipe, Fittings & Conduits',
            address: (compData.address && compData.address.trim()) || 'Plot No. 192/B, Road No. 11 Near Family Colony, Industrial Estate Gadoon, AFZAL, Haripur, KPK',
            phone: (compData.phone && compData.phone.trim()) || '03018537877',
            email: (compData.email && compData.email.trim()) || 'info@seastonepipes.com',
            website: (compData.website && compData.website.trim()) || 'www.seastonepipes.com',
            ntn: (compData.ntn && compData.ntn.trim()) || 'A522103',
            gst: (compData.gst && compData.gst.trim()) || (compData.strn && compData.strn.trim()) || '3520271341139',
            logo_data: (compData.logo_data && compData.logo_data.trim()) || ''
        };

        // Logo resolution: Dynamic Live Company Logo from database / settings / storage
        const logoSrc = resolveLiveCompanyLogo(payload.company, compData);

        const compName = comp.name.toUpperCase().startsWith('M/S') ? comp.name.toUpperCase() : ('M/S ' + comp.name.toUpperCase());
        const compAddress = comp.address;
        const compPhone = comp.phone;
        const compEmail = comp.email;
        const compWebsite = comp.website;
        const compNtn = comp.ntn;
        const compGst = comp.gst;

        const erpInvNo = payload.invoice_no || `DI-2026-${String(payload.serial_no || '0000').padStart(4, '0')}`;
        const rawFbrCandidate = payload.fbr_invoice_no || 
            (document.getElementById('di_fbr_inv_no')?.value) || 
            (currentInvoice && currentInvoice.fbr_invoice_no) || 
            (document.getElementById('di_card_fbr_inv_no')?.textContent) || 
            (document.getElementById('di_resp_ref')?.textContent) || '';
        const cleanFbrInv = extractCleanFbrInvoiceNumber(rawFbrCandidate);
        const fbrInvNo = cleanFbrInv || 'Pending Transmission';
        const subTimestampRaw = payload.submission_timestamp || payload.invoice_date;

        const invFormattedDate = formatPakistanDateTime(payload.invoice_date);
        const submissionFormattedDate = formatPakistanDateTime(subTimestampRaw);

        const bizName = payload.business_name || payload.customer_name || 'Customer';
        const custName = payload.customer_name || 'Walk-in Customer';
        const custTaxId = payload.customer_ntn || payload.customer_cnic || '-';

        // Resolve Customer Address - never insert a dummy address if not provided
        let custAddress = (payload.customer_address && payload.customer_address.trim() !== '-') ? payload.customer_address.trim() : '';
        if (!custAddress && window.customersList && Array.isArray(window.customersList)) {
            const foundCust = window.customersList.find(c => 
                (payload.customer_coa_id && (c.coa_id == payload.customer_coa_id || c.customer_id == payload.customer_coa_id)) ||
                (payload.customer_name && c.customer_name && c.customer_name.toLowerCase() === payload.customer_name.toLowerCase())
            );
            if (foundCust && foundCust.address && foundCust.address.trim() !== '-') {
                custAddress = foundCust.address.trim();
            }
        }
        if (!custAddress || custAddress === '-') {
            custAddress = '';
        }

        let activeItems = (payload.items || []).filter(it => {
            const q = parseFloat(it.quantity) || 0;
            const r = parseFloat(it.rate || it.unit_price) || 0;
            const name = (it.item_name || it.description || '').trim();
            return q > 0 || r > 0 || name.length > 0;
        });

        if (activeItems.length === 0) {
            activeItems = [{
                item_name: '2"X13\' MASTER PVC PIPE- 2.00 KG',
                hs_code: '39172390',
                uom: 'KG',
                quantity: payload.total_qty || 2,
                rate: 100,
                val_excl_tax: payload.taxable_amount || 200,
                tax_rate: 18,
                sales_tax_amount: payload.total_sales_tax || 36,
                further_tax_amount: payload.total_further_tax || 0,
                val_incl_tax: payload.net_payable || 236
            }];
        }

        // Calculate Taxes robustly so they never display 0.00
        let totalTaxableValue = num(payload.taxable_amount);
        let totalSalesTax = num(payload.total_sales_tax);
        let totalFurtherTax = num(payload.total_further_tax);
        let totalOtherTaxes = num(payload.total_extra_tax);
        let tax236g = num(payload.withholding_tax);
        let grandTotal = num(payload.net_payable);
        let commonTaxRate = 18;

        let sumTaxable = 0, sumST = 0, sumFT = 0, sumOther = 0, sumTotal = 0;
        activeItems.forEach(it => {
            const q = parseFloat(it.quantity) || 0;
            const r = parseFloat(it.rate || it.unit_price) || 0;
            const lineExcl = parseFloat(it.val_excl_tax) || (q * r);
            const tRate = parseFloat(it.tax_rate) || 18;
            commonTaxRate = tRate;
            const st = parseFloat(it.sales_tax_amount) || Math.round(lineExcl * (tRate / 100) * 100) / 100;
            const ft = parseFloat(it.further_tax_amount) || 0;
            const ot = parseFloat(it.extra_tax_amount) || parseFloat(it.fed_amount) || 0;
            const lineIncl = parseFloat(it.val_incl_tax) || (lineExcl + st + ft + ot);

            sumTaxable += lineExcl;
            sumST += st;
            sumFT += ft;
            sumOther += ot;
            sumTotal += lineIncl;
        });

        if (totalTaxableValue <= 0 && sumTaxable > 0) totalTaxableValue = sumTaxable;
        if (totalSalesTax <= 0 && sumST > 0) totalSalesTax = sumST;
        if (totalFurtherTax <= 0 && sumFT > 0) totalFurtherTax = sumFT;
        if (totalOtherTaxes <= 0 && sumOther > 0) totalOtherTaxes = sumOther;
        if (grandTotal <= 0 && sumTotal > 0) grandTotal = sumTotal;

        if (totalTaxableValue <= 0 && grandTotal > 0) {
            totalTaxableValue = Math.round((grandTotal / 1.18) * 100) / 100;
            totalSalesTax = Math.round((grandTotal - totalTaxableValue) * 100) / 100;
        }

        const amountInWords = numberToWordsPKR(grandTotal);

        // QR Code Generation - Strictly FBR Invoice Number for IRIS scanning & verification
        const targetFbrNumber = extractCleanFbrInvoiceNumber(
            cleanFbrInv ||
            payload.fbr_invoice_no ||
            payload.fbr_qr_code ||
            (document.getElementById('di_fbr_inv_no')?.value) ||
            (currentInvoice && currentInvoice.fbr_invoice_no) ||
            ''
        );

        let qrImgHtml = '';
        if (targetFbrNumber) {
            const qrCodeDataUrl = generateQrCodeDataUrl(targetFbrNumber);
            const fallbackQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(targetFbrNumber)}`;
            const finalQrSrc = qrCodeDataUrl || fallbackQrSrc;
            qrImgHtml = `<img src="${finalQrSrc}" style="width: 75px; height: 75px; object-fit: contain; display: block;" alt="FBR QR Code" onerror="this.onerror=null;this.src='${fallbackQrSrc}';" />`;
        } else {
            // When no official FBR number is allocated yet, do NOT encode ERP serials (DI-2026-...) because IRIS cannot verify them
            qrImgHtml = `
                <div style="width: 75px; height: 75px; border: 1.5px dashed #94a3b8; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px; box-sizing: border-box; background: #f8fafc;" title="Scan QR Code requires official FBR Invoice Number">
                    <i class="fas fa-qrcode" style="font-size: 20px; color: #94a3b8; margin-bottom: 2px;"></i>
                    <span style="font-size: 7.5px; font-weight: 700; color: #64748b; line-height: 1.1;">Pending FBR Transmission</span>
                </div>
            `;
        }

        let itemsRowsHtml = '';
        activeItems.forEach((it, idx) => {
            const rowQty = parseFloat(it.quantity) || 0;
            const rowRate = parseFloat(it.rate || it.unit_price) || 0;
            const rowTotal = parseFloat(it.val_incl_tax) || (rowQty * rowRate);

            itemsRowsHtml += `
                <tr style="border-bottom: 1px solid #bae6fd; background: #ffffff;">
                    <td style="padding: 6px 4px; text-align: center; border-right: 1px solid #bae6fd; font-weight: 700; color: #0f172a;">${idx + 1}</td>
                    <td style="padding: 6px 10px; text-align: left; border-right: 1px solid #bae6fd; font-weight: 700; color: #0f172a;">${escapeHtml(it.item_name || it.description || '')}</td>
                    <td style="padding: 6px 6px; text-align: center; border-right: 1px solid #bae6fd; font-family: monospace; font-size: 10px; color: #334155;">${escapeHtml(it.hs_code || '39172390')}</td>
                    <td style="padding: 6px 6px; text-align: center; border-right: 1px solid #bae6fd; font-size: 10px; font-weight: 600; text-transform: uppercase; color: #334155;">${escapeHtml(it.uom || 'KG')}</td>
                    <td style="padding: 6px 6px; text-align: center; border-right: 1px solid #bae6fd; font-weight: 600; color: #0f172a;">${fmt(rowQty)}</td>
                    <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #bae6fd; font-weight: 600; color: #0f172a;">${fmt(rowRate)}</td>
                    <td style="padding: 6px 10px; text-align: right; font-weight: 800; color: #0f172a;">${fmt(rowTotal)}</td>
                </tr>
            `;
        });

        // Resolve currently logged-in user name dynamically (never hardcode 'Ali Raza')
        let loggedInUserName = '';
        try {
            const sess = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            loggedInUserName = (sess.name || sess.username || sess.user_name || '').trim();
        } catch (e) {}

        if (!loggedInUserName && window.currentUser) {
            loggedInUserName = (window.currentUser.name || window.currentUser.username || '').trim();
        }

        const salesPerson = loggedInUserName || 
            ((payload.sales_person && payload.sales_person.trim() !== 'Ali Raza') ? payload.sales_person.trim() : '') ||
            ((payload.created_by_name && payload.created_by_name.trim() !== 'Ali Raza') ? payload.created_by_name.trim() : '') ||
            'Admin';

        return `
        <div class="fbr-digital-invoice-sheet" style="width: 100%; max-width: 820px; margin: 0 auto; background: #ffffff; padding: 16px 20px; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1e293b; box-sizing: border-box; font-size: 11px;">
            <!-- 1. TOP HEADER (2 COLUMNS) -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 14px;">
                <!-- Left Column: Company Profile (Logo + Uniform Left-Aligned Details) -->
                <div style="flex: 1; display: flex; align-items: flex-start; gap: 12px;">
                    <div style="flex-shrink: 0; padding-top: 2px;">
                        <img src="${logoSrc}" style="max-height: 54px; max-width: 95px; object-fit: contain; display: block;" alt="Company Logo" onerror="this.onerror=null;this.src='assets/logos/logo.png';" />
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 15.5px; font-weight: 900; color: #0b1a30; letter-spacing: 0.3px; line-height: 1.25; margin: 0;">${escapeHtml(compName)}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #002855; margin-top: 3px; line-height: 1.35;">${escapeHtml(compPhone)}${compEmail ? ', ' + escapeHtml(compEmail) : ''}${compWebsite ? ', ' + escapeHtml(compWebsite) : ''}</div>
                        <div style="font-size: 9.5px; color: #334155; margin-top: 3px; line-height: 1.35;">${escapeHtml(compAddress)}</div>
                        <div style="font-size: 10.5px; font-weight: 800; color: #0b2e59; margin-top: 3px; line-height: 1.35;">NTN : <span style="font-family: monospace; font-size: 11px;">${escapeHtml(compNtn)}</span> &nbsp;|&nbsp; STRN / GST : <span style="font-family: monospace; font-size: 11px;">${escapeHtml(compGst)}</span></div>
                    </div>
                </div>

                <!-- Right Column: Metadata List with Vertical Blue Line (Branch removed) -->
                <div style="border-left: 2px solid #0077c8; padding-left: 14px; min-width: 275px;">
                    <table style="border-collapse: collapse; font-size: 10.5px; line-height: 1.45;">
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">ERP Invoice No.</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">${escapeHtml(erpInvNo)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">Invoice Date</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 600; color: #334155; white-space: nowrap;">${invFormattedDate}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">FBR Invoice No.</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 700; color: #0f172a; font-family: monospace, sans-serif; white-space: nowrap;">${escapeHtml(fbrInvNo)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 700; color: #0f172a; white-space: nowrap;">FBR Submission Date</td>
                            <td style="padding: 1px 5px; font-weight: 700; text-align: center;">:</td>
                            <td style="font-weight: 600; color: #334155; white-space: nowrap;">${submissionFormattedDate}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- 2. SALES TAX INVOICE BADGE -->
            <div style="text-align: center; margin: 8px 0 12px 0;">
                <div style="display: inline-block; background: #e0f2fe; padding: 5px 32px; border-radius: 6px;">
                    <span style="font-size: 18px; font-weight: 900; color: #0b2e59; letter-spacing: 0.8px; text-transform: uppercase;">SALES TAX INVOICE</span>
                </div>
            </div>

            <!-- 3. BUYER / CUSTOMER DETAILS BOX -->
            <div style="border: 1.5px solid #7dd3fc; border-radius: 5px; overflow: hidden; margin-bottom: 12px; background: #ffffff;">
                <div style="background: #e0f2fe; padding: 5px 12px; border-bottom: 1px solid #bae6fd; font-size: 11.5px; font-weight: 800; color: #002855; letter-spacing: 0.5px;">
                    BUYER / CUSTOMER DETAILS
                </div>
                <div style="padding: 6px 12px; font-size: 10.5px; line-height: 1.5;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="width: 105px; font-weight: 800; color: #0f172a;">Business Name</td>
                            <td style="width: 14px; font-weight: 700; text-align: center;">:</td>
                            <td style="color: #0284c7; font-weight: 700; text-decoration: underline;">${escapeHtml(bizName)}</td>
                            <td style="width: 90px; font-weight: 800; color: #0f172a; text-align: right;">NTN / CNIC</td>
                            <td style="width: 14px; font-weight: 700; text-align: center;">:</td>
                            <td style="width: 130px; font-weight: 600; color: #0f172a; font-family: monospace;">${escapeHtml(custTaxId)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800; color: #0f172a;">Customer Name</td>
                            <td style="font-weight: 700; text-align: center;">:</td>
                            <td colspan="4" style="color: #0f172a; font-weight: 600;">
                                ${escapeHtml(custName)} &nbsp;|&nbsp; <strong style="color: #0f172a;">Address :</strong> &nbsp; <span style="font-weight: 500; color: #334155;">${escapeHtml(custAddress)}</span>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- 4. ITEMS TABLE -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5px; border: 1.5px solid #0077c8; border-radius: 4px; overflow: hidden;">
                <thead>
                    <tr style="background: #0077c8; color: #ffffff; font-weight: 700; font-size: 10.5px; line-height: 1.2;">
                        <th style="padding: 6px 4px; text-align: center; border-right: 1px solid #38bdf8; width: 34px;">#</th>
                        <th style="padding: 6px 10px; text-align: left; border-right: 1px solid #38bdf8;">Description / Item Name</th>
                        <th style="padding: 6px 6px; text-align: center; border-right: 1px solid #38bdf8; width: 100px;">HS / PCT Code</th>
                        <th style="padding: 6px 6px; text-align: center; border-right: 1px solid #38bdf8; width: 55px;">Unit</th>
                        <th style="padding: 6px 6px; text-align: center; border-right: 1px solid #38bdf8; width: 65px;">Qty</th>
                        <th style="padding: 6px 8px; text-align: center; border-right: 1px solid #38bdf8; width: 85px;">Rate (PKR)</th>
                        <th style="padding: 6px 10px; text-align: right; width: 105px;">Line Total (PKR)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRowsHtml}
                </tbody>
            </table>

            <!-- 5. LOWER SUMMARY (2 COLUMNS) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; align-items: start;">
                <!-- Left: Amount in Words & Additional Info -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- Amount in Words -->
                    <div style="border: 1.5px solid #7dd3fc; background: #e0f2fe; border-radius: 4px; padding: 7px 12px;">
                        <div style="color: #0284c7; font-weight: 800; font-size: 11px;">Amount in Words:</div>
                        <div style="color: #000000; font-weight: 800; font-size: 12px; margin-top: 3px; line-height: 1.35;">
                            ${escapeHtml(amountInWords)}
                        </div>
                    </div>

                    <!-- Additional Information -->
                    <div style="border: 1.5px solid #7dd3fc; border-radius: 4px; overflow: hidden; background: #ffffff;">
                        <div style="background: #e0f2fe; padding: 5px 12px; border-bottom: 1px solid #bae6fd; font-size: 11px; font-weight: 800; color: #002855; letter-spacing: 0.5px;">
                            ADDITIONAL INFORMATION
                        </div>
                        <div style="padding: 6px 12px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; line-height: 1.5;">
                                <tr>
                                    <td style="width: 120px; font-weight: 800; color: #0f172a;">Payment Terms</td>
                                    <td style="width: 14px; font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${escapeHtml(payload.payment_mode || 'Cash')}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a;">Delivery Terms</td>
                                    <td style="font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${escapeHtml(payload.delivery_terms || 'Ex-Factory')}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a;">Sales Person</td>
                                    <td style="font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${escapeHtml(salesPerson)}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a;">Customer Balance</td>
                                    <td style="font-weight: 700; text-align: center;">:</td>
                                    <td style="color: #1e293b; font-weight: 600;">${fmt(payload.balance || grandTotal)}</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Right: Tax Summary -->
                <div style="border: 1.5px solid #0077c8; border-radius: 4px; overflow: hidden; background: #ffffff;">
                    <div style="background: #0077c8; color: #ffffff; padding: 5px 12px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
                        TAX SUMMARY
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
                        <thead>
                            <tr style="background: #e0f2fe; border-bottom: 1px solid #bae6fd; color: #002855; font-weight: 700;">
                                <th style="padding: 4px 10px; text-align: left;">Description</th>
                                <th style="padding: 4px 10px; text-align: right;">Amount (PKR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Total Taxable Value</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalTaxableValue)}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Sales Tax (${commonTaxRate}%)</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalSalesTax)}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Further Tax</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalFurtherTax)}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Advance Tax u/s 236G</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(tax236g)}</td>
                            </tr>
                            <tr style="border-bottom: 1.5px solid #0077c8;">
                                <td style="padding: 3.5px 10px; color: #334155; font-weight: 600;">Other Taxes</td>
                                <td style="padding: 3.5px 10px; text-align: right; font-weight: 600; color: #0f172a;">${fmt(totalOtherTaxes)}</td>
                            </tr>
                            <tr style="background: #e0f2fe;">
                                <td style="padding: 6px 10px; font-size: 13.5px; font-weight: 900; color: #002855;">GRAND TOTAL</td>
                                <td style="padding: 6px 10px; text-align: right; font-size: 16px; font-weight: 900; color: #002855;">${fmt(grandTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 6. FBR VERIFICATION BOX (3-COLUMN EXACT REPLICA) -->
            <div style="border: 1.5px solid #7dd3fc; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                <!-- FBR Logo -->
                <div style="width: 28%; display: flex; align-items: center; justify-content: center;">
                    <img src="${FBR_PAKISTAN_BADGE_DATA_URL}" style="max-height: 65px; max-width: 160px; object-fit: contain; display: block;" alt="FBR Pakistan Digital Invoicing" />
                </div>

                <!-- Divider 1 -->
                <div style="width: 1.5px; height: 70px; background: #0077c8; margin: 0 12px;"></div>

                <!-- QR Code -->
                <div style="width: 22%; display: flex; align-items: center; justify-content: center;">
                    ${qrImgHtml}
                </div>

                <!-- Divider 2 -->
                <div style="width: 1.5px; height: 70px; background: #0077c8; margin: 0 12px;"></div>

                <!-- FBR Verification Text -->
                <div style="width: 48%; padding-left: 6px;">
                    <div style="font-size: 15px; font-weight: 800; color: #002855; margin-bottom: 4px;">FBR Verification</div>
                    <div style="font-size: 10.5px; color: #475569; line-height: 1.35; margin-bottom: 6px;">
                        Scan the QR code to verify this invoice<br/>on FBR's system or use the FBR invoice number
                    </div>
                    <div style="font-size: 16px; font-weight: 900; color: #002855; letter-spacing: 0.5px; font-family: monospace, sans-serif;">
                        ${escapeHtml(fbrInvNo)}
                    </div>
                </div>
            </div>

            <!-- 7. FOOTER -->
            <div style="border-top: 1.5px solid #0077c8; margin-top: 12px; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <div style="font-weight: 800; color: #000000; font-size: 11.5px; margin-bottom: 2px;">Thank you for your business!</div>
                    <div style="color: #475569; font-size: 10px; margin-bottom: 2px;">This is a computer-generated invoice under official FBR Digital Invoicing regulations.</div>
                    <div style="font-weight: 800; color: #000000; font-size: 10.5px;">Powered by SoftifyX Financials</div>
                </div>
                <div style="text-align: center; width: 200px;">
                    <div style="border-bottom: 1.5px solid #475569; width: 100%; margin-bottom: 4px;"></div>
                    <div style="color: #1e293b; font-size: 10.5px; font-weight: 500;">Authorized Signatory</div>
                </div>
            </div>
        </div>
        `;
    }

    // Review & Confirm (Opens Modal with Exact FBR Printable Design)
    function reviewAndConfirm() {
        const payload = gatherInvoiceData();
        const html = buildOfficialPrintHtml(payload);

        const previewArea = document.getElementById('di_printable_preview_area');
        if (previewArea) {
            previewArea.innerHTML = html;
        }

        const previewModal = document.getElementById('di_preview_modal');
        if (previewModal) {
            previewModal.style.display = 'flex';
        }
    }

    function closePreviewModal() {
        const previewModal = document.getElementById('di_preview_modal');
        if (previewModal) {
            previewModal.style.display = 'none';
        }
    }

    // Print Preview (Opens Clean Print Window & Triggers Native Print)
    function printPreview() {
        const payload = gatherInvoiceData();
        const invoiceHtml = buildOfficialPrintHtml(payload);

        // Also update preview area if open
        const area = document.getElementById('di_printable_preview_area');
        if (area) area.innerHTML = invoiceHtml;

        const printWin = window.open('', '_blank', 'width=940,height=850');
        if (!printWin) {
            window.print();
            return;
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>FBR Sales Tax Digital Invoice - ${payload.serial_no || 'Document'}</title>
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 6mm 8mm;
                    }
                    * {
                        box-sizing: border-box;
                    }
                    body {
                        font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
                        margin: 0;
                        padding: 10px;
                        background: #ffffff;
                        color: #1e293b;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    @media print {
                        body {
                            padding: 0 !important;
                            background: #ffffff !important;
                        }
                        .no-print {
                            display: none !important;
                        }
                    }
                </style>
            </head>
            <body>
                ${invoiceHtml}
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                            window.close();
                        }, 350);
                    };
                <\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    }

    // Close Form
    function closeForm() {
        const container = document.getElementById('digitalInvoiceContainer');
        if (!container) return;
        const modalContainer = container.closest('.modal-container');
        if (modalContainer) {
            const closeBtn = modalContainer.querySelector('.modal-controls .btn-close, .modal-header .btn-close');
            if (closeBtn) {
                closeBtn.click();
                return;
            }
            modalContainer.remove();
        }
    }

    // Navigate Serials (<< or >>)
    async function navigateSerial(dir) {
        const curSn = parseInt(document.getElementById('di_serial_no').value) || 0;
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_invoice&company_id=${companyId}&serial_no=${curSn}&dir=${dir}`);
            const data = await res.json();
            if (data.status === 'success' && data.invoice) {
                populateInvoice(data.invoice);
            } else {
                showAlert(`No ${dir === 'next' ? 'subsequent' : 'previous'} invoice record found.`, 'info');
            }
        } catch (e) {
            console.error('Serial navigation error:', e);
        }
    }

    // Dynamic serial number & invoice number sync
    function updateInvoiceNumberDisplay() {
        const snEl = document.getElementById('di_serial_no');
        const invNoEl = document.getElementById('di_invoice_no');
        const dateEl = document.getElementById('di_invoice_date');
        const refEl = document.getElementById('di_sub_inv_ref');
        const footInv = document.getElementById('di_foot_inv_no');

        const snVal = parseInt(snEl?.value) || 0;
        let year = new Date().getFullYear();
        if (dateEl && dateEl.value) {
            const d = new Date(dateEl.value);
            if (!isNaN(d.getFullYear())) {
                year = d.getFullYear();
            }
        }

        if (snVal > 0) {
            const formatted = 'DI-' + year + '-' + String(snVal).padStart(4, '0');
            if (invNoEl) invNoEl.value = formatted;
            if (refEl) refEl.textContent = formatted;
            if (footInv) footInv.textContent = snVal;
        } else {
            if (invNoEl) invNoEl.value = '';
            if (refEl) refEl.textContent = '-';
            if (footInv) footInv.textContent = '-';
        }
    }

    function onSerialNoInput() {
        const snEl = document.getElementById('di_serial_no');
        if (snEl) {
            snEl.value = snEl.value.replace(/[^0-9]/g, '');
        }
        updateInvoiceNumberDisplay();
    }

    async function onSerialNoChange() {
        const snEl = document.getElementById('di_serial_no');
        if (!snEl) return;
        const sn = parseInt(snEl.value) || 0;
        if (sn <= 0) return;
        snEl.value = sn;
        updateInvoiceNumberDisplay();

        // Check if invoice with this serial already exists in ERP
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_invoice&company_id=${companyId}&serial_no=${sn}`);
            const data = await res.json();
            if (data.status === 'success' && data.invoice) {
                if (!currentInvoiceId || currentInvoiceId !== parseInt(data.invoice.id)) {
                    showAlert(`Serial #${sn} is already saved (${data.invoice.invoice_no}). Loaded invoice for viewing/editing.`, 'info');
                    populateInvoice(data.invoice);
                }
            }
        } catch (e) {
            console.error('Serial lookup error:', e);
        }
    }

    function onInvoiceDateChange() {
        updateInvoiceNumberDisplay();
    }

    async function retrieveLastSaved() {
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_invoice&company_id=${companyId}`);
            const data = await res.json();
            if (data.status === 'success' && data.invoice) {
                populateInvoice(data.invoice);
                showAlert('Loaded last saved invoice # ' + data.invoice.invoice_no, 'info');
            }
        } catch (e) {}
    }

    // Find Invoices Modal
    function openFindModal() {
        document.getElementById('di_find_modal').style.display = 'flex';
        performSearch();
    }

    function closeFindModal() {
        document.getElementById('di_find_modal').style.display = 'none';
    }

    async function performSearch() {
        const q = (document.getElementById('di_find_query').value || '').trim();
        const tbody = document.getElementById('di_find_tbody');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 12px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Searching invoices...</td></tr>`;

        try {
            const res = await fetch(`api/digital_invoice.php?action=search_invoices&company_id=${companyId}&q=${encodeURIComponent(q)}`);
            const data = await res.json();

            if (data.status === 'success' && data.invoices && data.invoices.length > 0) {
                tbody.innerHTML = '';
                data.invoices.forEach(inv => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #e2e8f0';
                    tr.innerHTML = `
                        <td style="padding: 5px; text-align: center; font-weight: 600;">${inv.serial_no}</td>
                        <td style="padding: 5px; font-weight: 700; color: var(--theme-primary, #1F4E79);">${escapeHtml(inv.invoice_no)}</td>
                        <td style="padding: 5px; text-align: center;">${inv.invoice_date}</td>
                        <td style="padding: 5px;">${escapeHtml(inv.customer_name)}</td>
                        <td style="padding: 5px; text-align: right; font-weight: 600;">${fmt(inv.net_payable)}</td>
                        <td style="padding: 5px; text-align: center;"><span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: #f1f5f9; color: #475569;">${escapeHtml(inv.workflow_status)}</span></td>
                        <td style="padding: 5px; text-align: center;"><span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: ${inv.fbr_status === 'Submitted' ? '#dcfce7; color: #15803d;' : '#fee2e2; color: #b91c1c;'}">${escapeHtml(inv.fbr_status)}</span></td>
                        <td style="padding: 5px; text-align: center;">
                            <button type="button" class="btn-act-blue" style="padding: 2px 7px; height: 20px; font-size: 10px; border: none; border-radius: 2px; color: #fff; cursor: pointer;" onclick="window.DigitalInvoiceModule.selectSearchInvoice(${inv.id})">Load</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 14px; color: #94a3b8;">No invoices found.</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 14px; color: #dc2626;">Error querying database: ${e.message}</td></tr>`;
        }
    }

    async function selectSearchInvoice(id) {
        try {
            const res = await fetch(`api/digital_invoice.php?action=get_invoice&company_id=${companyId}&id=${id}`);
            const data = await res.json();
            if (data.status === 'success' && data.invoice) {
                populateInvoice(data.invoice);
                closeFindModal();
            }
        } catch (e) {
            showAlert('Error loading invoice: ' + e.message, 'error');
        }
    }

    function showAlert(msg, type = 'info') {
        if (window.toastNotification) {
            window.toastNotification(msg, type);
            return;
        }
        alert(msg);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getRowEditableInputs(row) {
        return Array.from(row.querySelectorAll('.di-row-item-code, .di-row-hs, .di-row-item-search, .di-row-classification, .di-row-pieces, .di-row-qty, .di-row-uom, .di-row-rate, .di-row-tax-rate, .di-row-st-amt, .di-row-fur-rate, .di-row-fur-disp, .di-row-ext-rate, .di-row-ext-disp'))
            .filter(el => !el.disabled && !el.readOnly && el.offsetWidth > 0);
    }

    function handleGridKeyDown(e) {
        const target = e.target;
        if (!target.classList.contains('fbr-tbl-input')) return;

        const tr = target.closest('tr');
        if (!tr) return;

        // If autocomplete suggestions box is open in Item Code cell, let suggestions handle Up/Down/Enter
        const cell = target.closest('td');
        const suggestBox = cell ? cell.querySelector('.grid-suggest') : null;
        if (suggestBox && suggestBox.style.display === 'block') {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                return;
            }
            if (e.key === 'Enter') {
                return;
            }
        }

        const rowInputs = getRowEditableInputs(tr);
        const colIdx = rowInputs.indexOf(target);
        if (colIdx === -1) return;

        const isItemCode = target.classList.contains('di-row-item-code') || target.classList.contains('di-row-item-search');
        const isPieces = target.classList.contains('di-row-pieces');
        const isQty = target.classList.contains('di-row-qty');
        const isRate = target.classList.contains('di-row-rate');

        // Helper to focus element and select all text immediately
        const focusAndSelect = (input) => {
            if (!input) return;
            input.focus();
            if (input.select) {
                input.select();
            }
            setTimeout(() => {
                if (document.activeElement === input && input.select) {
                    input.select();
                }
            }, 10);
        };

        // =====================================================================
        // 1. ENTER KEY: Fast Entry Flow
        // Item Code (Enter) -> Pieces (Enter) -> Rate (Enter) -> Next Row Item Code
        // =====================================================================
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();

            calculateRow(tr);
            recalculateTotals();

            // Shift+Enter: move backward to previous editable cell
            if (e.shiftKey) {
                if (colIdx > 0) {
                    focusAndSelect(rowInputs[colIdx - 1]);
                } else {
                    const prevTr = tr.previousElementSibling;
                    if (prevTr) {
                        const prevInputs = getRowEditableInputs(prevTr);
                        if (prevInputs.length > 0) {
                            focusAndSelect(prevInputs[prevInputs.length - 1]);
                        }
                    }
                }
                return;
            }

            // A. If on Item Code or Description -> jump directly to Pieces
            if (isItemCode) {
                const pcsInp = tr.querySelector('.di-row-pieces');
                if (pcsInp) {
                    focusAndSelect(pcsInp);
                    return;
                }
            }

            // B. If on Pieces or Quantity -> jump directly to Rate
            if (isPieces || isQty) {
                const rateInp = tr.querySelector('.di-row-rate');
                if (rateInp) {
                    focusAndSelect(rateInp);
                    return;
                }
            }

            // C. If on Rate (or any later column) -> jump directly to NEXT ROW's Item Code!
            const rateColIdx = rowInputs.indexOf(tr.querySelector('.di-row-rate'));
            if (isRate || (rateColIdx !== -1 && colIdx >= rateColIdx)) {
                let nextTr = tr.nextElementSibling;
                if (!nextTr) {
                    addItemRow();
                    nextTr = tr.nextElementSibling;
                }
                if (nextTr) {
                    const nextCodeInp = nextTr.querySelector('.di-row-item-code') || getRowEditableInputs(nextTr)[0];
                    if (nextCodeInp) {
                        focusAndSelect(nextCodeInp);
                        return;
                    }
                }
                return;
            }

            // D. Fallback for any intermediate field before rate: advance to next input
            if (colIdx < rowInputs.length - 1) {
                focusAndSelect(rowInputs[colIdx + 1]);
            }
            return;
        }

        // =====================================================================
        // 2. ARROW KEYS: Grid Spreadsheet Navigation with Text Auto-Selected
        // ArrowRight: next column (wrap to next row)
        // ArrowLeft: prev column (wrap to prev row)
        // ArrowDown: same column next row
        // ArrowUp: same column prev row
        // =====================================================================
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();

            if (colIdx < rowInputs.length - 1) {
                focusAndSelect(rowInputs[colIdx + 1]);
            } else {
                // Wrap to next row's first editable input
                let nextTr = tr.nextElementSibling;
                if (!nextTr) {
                    addItemRow();
                    nextTr = tr.nextElementSibling;
                }
                if (nextTr) {
                    const nextInputs = getRowEditableInputs(nextTr);
                    if (nextInputs.length > 0) {
                        focusAndSelect(nextInputs[0]);
                    }
                }
            }
            return;
        }

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();

            if (colIdx > 0) {
                focusAndSelect(rowInputs[colIdx - 1]);
            } else {
                // Wrap to previous row's last editable input
                const prevTr = tr.previousElementSibling;
                if (prevTr) {
                    const prevInputs = getRowEditableInputs(prevTr);
                    if (prevInputs.length > 0) {
                        focusAndSelect(prevInputs[prevInputs.length - 1]);
                    }
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();

            let nextTr = tr.nextElementSibling;
            if (!nextTr) {
                addItemRow();
                nextTr = tr.nextElementSibling;
            }
            if (nextTr) {
                const nextInputs = getRowEditableInputs(nextTr);
                const targetInput = nextInputs[colIdx] || nextInputs[nextInputs.length - 1];
                if (targetInput) {
                    focusAndSelect(targetInput);
                }
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();

            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevInputs = getRowEditableInputs(prevTr);
                const targetInput = prevInputs[colIdx] || prevInputs[prevInputs.length - 1];
                if (targetInput) {
                    focusAndSelect(targetInput);
                }
            }
            return;
        }
    }

    function setupEventListeners() {
        const container = document.getElementById('digitalInvoiceContainer');
        if (!container) return;

        container.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveInvoice();
            }
        });

        const tbody = document.getElementById('di_items_tbody');
        if (tbody) {
            tbody.addEventListener('keydown', handleGridKeyDown);
        }

        // Smart Auto-Detection: typing 13 digits in NTN shifts to CNIC box automatically
        const ntnEl = document.getElementById('di_cust_ntn');
        const cnicEl = document.getElementById('di_cust_cnic');
        if (ntnEl && cnicEl) {
            const checkNtnToCnic = () => {
                const val = ntnEl.value.trim();
                const digits = val.replace(/[^0-9]/g, '');
                if (digits.length === 13 && !cnicEl.value.trim()) {
                    cnicEl.value = val;
                    ntnEl.value = '';
                }
            };
            ntnEl.addEventListener('blur', checkNtnToCnic);
            ntnEl.addEventListener('input', () => {
                const digits = ntnEl.value.replace(/[^0-9]/g, '');
                if (digits.length === 13) {
                    checkNtnToCnic();
                }
            });

            const checkCnicToNtn = () => {
                const val = cnicEl.value.trim();
                const digits = val.replace(/[^0-9]/g, '');
                if (digits.length >= 7 && digits.length <= 8 && !ntnEl.value.trim()) {
                    ntnEl.value = val;
                    cnicEl.value = '';
                }
            };
            cnicEl.addEventListener('blur', checkCnicToNtn);
        }
    }

    return {
        init,
        newInvoice,
        populateInvoice,
        saveInvoice,
        validateInvoice,
        openConfirmDialog,
        closeConfirmDialog,
        proceedProductionSubmit,
        submitToFbr,
        retrySubmission,
        refreshFbrStatus,
        showRawResponse,
        reviewAndConfirm,
        closePreviewModal,
        closeForm,
        addItemRow,
        recalculateTotals,
        onWhtPctChange,
        onCustomerTypeChange,
        onSupplyTypeChange,
        onInvoiceTypeChange,
        retrieveLastSaved,
        openFindModal,
        closeFindModal,
        performSearch,
        selectSearchInvoice,
        printPreview,
        navigateSerial,
        onSerialNoInput,
        onSerialNoChange,
        onInvoiceDateChange,
        updateInvoiceNumberDisplay,
        convertFromSaleInvoice,
        verifyCustomerFBR,
        applyVerifiedCustomer,
        cancelCustomerVerification,
        toggleLowerLeftView,
        deleteCurrentInvoice,
        openSalesRegister,
        checkCustomerTypeMatch,
        onFbrInvoiceNoInput,
        onFbrInvoiceNoChange,
        extractCleanFbrInvoiceNumber
    };
})();
