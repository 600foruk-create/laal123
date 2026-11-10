window.POSSettings = {
    branchMappings: [],
    editingBranchId: null,

    getCompanyId: function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        return window.selectedCompanyId || session.company_id || session.user?.company_id || 1;
    },

    populateReceiptCheckboxes: function(s) {
        if (!s) return;
        const elAuto = document.getElementById('rec_auto_print');
        if (elAuto && s.rec_auto_print !== undefined) {
            elAuto.checked = (String(s.rec_auto_print) === '1' || s.rec_auto_print === true);
        }
        const elHeader = document.getElementById('rec_show_header');
        if (elHeader && s.rec_show_header !== undefined) {
            elHeader.checked = (String(s.rec_show_header) === '1' || s.rec_show_header === true);
        }
        const elLogo = document.getElementById('rec_show_logo');
        if (elLogo && s.rec_show_logo !== undefined) {
            elLogo.checked = (String(s.rec_show_logo) === '1' || s.rec_show_logo === true);
        }
        const elTax = document.getElementById('rec_show_tax');
        if (elTax && s.rec_show_tax !== undefined) {
            elTax.checked = (String(s.rec_show_tax) === '1' || s.rec_show_tax === true);
        }
        const elCopies = document.getElementById('rec_copies');
        if (elCopies && s.rec_copies !== undefined) {
            elCopies.value = s.rec_copies;
        }
    },

    init: function() {
        this.bindEvents();
        
        // Instant restore from local cache so checkboxes never reset or flicker on reopen/refresh
        try {
            const compId = this.getCompanyId();
            const cachedRec = localStorage.getItem('pos_rec_settings_' + compId);
            if (cachedRec) {
                const parsed = JSON.parse(cachedRec);
                this.populateReceiptCheckboxes(parsed);
            }
        } catch(e) {}

        this.loadSettings();
        this.loadBranchesAndWarehouses();
        this.loadBranchMappings();
        this.applyBranchButtonVisibility();
        this.applyFbrTabVisibility();
    },

    bindEvents: function() {
        // Tab navigation
        const navItems = document.querySelectorAll('#posSettingsNav li');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const target = item.getAttribute('data-target');
                if (target === 'fbr' && localStorage.getItem('pos_allow_fbr_integration') === '0') {
                    alert('FBR Integration is disabled in System Settings.');
                    return;
                }

                // Remove active from all
                navItems.forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.pos-settings-section').forEach(s => s.classList.remove('active'));
                
                // Add active to clicked
                item.classList.add('active');
                const sec = document.getElementById('sec-' + target);
                if (sec) sec.classList.add('active');

                // Dynamic loading per tab
                if (target === 'fbr') {
                    window.POSSettings.loadBranchMappings();
                } else if (target === 'items') {
                    window.POSSettings.loadPOSItems();
                } else if (target === 'logs') {
                    window.POSSettings.loadFBRLogs();
                } else if (target === 'branch') {
                    window.POSSettings.applyBranchButtonVisibility();
                }
            });
        });

        // Branch Code auto-updates Invoice Series
        const branchCodeInput = document.getElementById('branch_code');
        const invoiceSeriesInput = document.getElementById('branch_invoice_series');
        if (branchCodeInput && invoiceSeriesInput) {
            branchCodeInput.addEventListener('input', function() {
                const code = this.value.trim().toUpperCase();
                if (code) {
                    invoiceSeriesInput.value = code + '-POS-';
                } else {
                    invoiceSeriesInput.value = '';
                }
            });
        }
        
        document.addEventListener('click', (e) => {
            const searchInput = document.getElementById('branch_default_customer_search');
            if (searchInput && e.target !== searchInput) {
                const dd = document.getElementById('branch_customer_dropdown');
                if(dd) dd.style.display = 'none';
            }
        });
    },

    loadSettings: async function() {
        try {
            const compId = this.getCompanyId();

            // First apply immediately from local cache so UI never resets
            const cachedRec = localStorage.getItem('pos_rec_settings_' + compId);
            if (cachedRec) {
                try {
                    const parsed = JSON.parse(cachedRec);
                    this.populateReceiptCheckboxes(parsed);
                } catch(e) {}
            }

            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/pos_settings.php?action=get_settings&company_id=${compId}&${cb}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.settings) {
                    this.cachedSettings = data.settings;
                    this.populateForm(data.settings);

                    // Sync local cache with verified server values
                    localStorage.setItem('pos_rec_settings_' + compId, JSON.stringify({
                        rec_show_header: data.settings.rec_show_header,
                        rec_show_logo: data.settings.rec_show_logo,
                        rec_show_tax: data.settings.rec_show_tax,
                        rec_auto_print: data.settings.rec_auto_print,
                        rec_copies: data.settings.rec_copies
                    }));
                }
            }
        } catch (error) {
            console.error("Error loading POS settings:", error);
        }
    },

    populateForm: function(settings) {
        // General
        if (settings.gen_default_mode) document.getElementById('gen_default_mode').value = settings.gen_default_mode;
        if (settings.gen_default_payment) document.getElementById('gen_default_payment').value = settings.gen_default_payment;
        if (settings.gen_invoice_series) document.getElementById('gen_invoice_series').value = settings.gen_invoice_series;
        if (settings.gen_allow_negative_stock !== undefined) document.getElementById('gen_allow_negative_stock').checked = settings.gen_allow_negative_stock === '1';
        if (settings.gen_allow_zero_stock !== undefined) document.getElementById('gen_allow_zero_stock').checked = settings.gen_allow_zero_stock === '1';
        if (settings.gen_enable_barcode !== undefined) document.getElementById('gen_enable_barcode').checked = settings.gen_enable_barcode === '1';
        if (settings.gen_enable_search_suggestions !== undefined) document.getElementById('gen_enable_search_suggestions').checked = settings.gen_enable_search_suggestions === '1';
        if (settings.gen_enable_price_edit !== undefined) document.getElementById('gen_enable_price_edit').checked = settings.gen_enable_price_edit === '1';
        if (document.getElementById('gen_opening_time')) {
            document.getElementById('gen_opening_time').value = settings.gen_opening_time ? settings.gen_opening_time.substring(0, 5) : '';
        }
        if (document.getElementById('gen_closing_time')) {
            document.getElementById('gen_closing_time').value = settings.gen_closing_time ? settings.gen_closing_time.substring(0, 5) : '';
        }
        if (document.getElementById('gen_off_day')) {
            document.getElementById('gen_off_day').value = settings.gen_off_day || '';
        }
        if (document.getElementById('gen_apply_hours_to_all_branches')) {
            document.getElementById('gen_apply_hours_to_all_branches').checked = settings.gen_apply_hours_to_all_branches !== '0';
        }

        // Receipt
        const elPrinterType = document.getElementById('rec_printer_type');
        if (elPrinterType && settings.rec_printer_type) elPrinterType.value = settings.rec_printer_type;
        const elPaperSize = document.getElementById('rec_paper_size');
        if (elPaperSize && settings.rec_paper_size) elPaperSize.value = settings.rec_paper_size;
        const elHeader = document.getElementById('rec_header');
        if (elHeader && settings.rec_header !== undefined) elHeader.value = settings.rec_header;
        const elFooter = document.getElementById('rec_footer');
        if (elFooter && settings.rec_footer !== undefined) elFooter.value = settings.rec_footer;
        this.populateReceiptCheckboxes(settings);

        // Sales
        if (settings.rule_max_discount) document.getElementById('rule_max_discount').value = settings.rule_max_discount;
        if (settings.rule_allow_credit_sales !== undefined) document.getElementById('rule_allow_credit_sales').checked = settings.rule_allow_credit_sales === '1';
        if (settings.rule_require_customer_for_credit !== undefined) document.getElementById('rule_require_customer_for_credit').checked = settings.rule_require_customer_for_credit === '1';
        if (settings.rule_prevent_duplicate !== undefined) document.getElementById('rule_prevent_duplicate').checked = settings.rule_prevent_duplicate === '1';
        if (settings.rule_allow_returns !== undefined) document.getElementById('rule_allow_returns').checked = settings.rule_allow_returns === '1';
        if (settings.rule_stock_deduction) document.getElementById('rule_stock_deduction').value = settings.rule_stock_deduction;

        // FBR
        const isFbrEnabled = (settings.fbr_enable === '1');
        if (settings.fbr_enable !== undefined) document.getElementById('fbr_enable').checked = isFbrEnabled;
        const currentEnv = settings.fbr_environment || 'sandbox';
        document.getElementById('fbr_environment').value = currentEnv;
        this.updateEnvironmentBadge(currentEnv);
        const warn = document.getElementById('fbr_prod_warning');
        if (warn) warn.style.display = (currentEnv === 'production') ? 'block' : 'none';

        if (settings.fbr_pos_id) document.getElementById('fbr_pos_id').value = settings.fbr_pos_id;
        if (settings.fbr_base_url) {
            const bUrl = document.getElementById('fbr_base_url');
            if (bUrl) bUrl.value = settings.fbr_base_url;
        }

        // Apply environment-specific endpoints and token
        this.applyEnvironmentFields(currentEnv, settings);
        
        const defPct = document.getElementById('fbr_default_pct_code');
        if (defPct) defPct.value = settings.fbr_default_pct_code || '19059000';
        
        // Branch
        if (settings.branch_default_branch) document.getElementById('branch_default_branch').value = settings.branch_default_branch;
        if (settings.branch_default_warehouse) document.getElementById('branch_default_warehouse').value = settings.branch_default_warehouse;
        
        this.updateFBRStatus(isFbrEnabled, settings.fbr_overall_status);
    },

    applyEnvironmentFields: function(env, settings) {
        settings = settings || this.cachedSettings || {};
        const isProd = (env === 'production');

        const vUrl = document.getElementById('fbr_validate_url');
        if (vUrl) {
            vUrl.placeholder = isProd 
                ? 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData' 
                : 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData';
            vUrl.value = isProd 
                ? (settings.fbr_validate_url_prod || 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData')
                : (settings.fbr_validate_url || 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData');
        }

        const pUrl = document.getElementById('fbr_post_url');
        if (pUrl) {
            pUrl.placeholder = isProd 
                ? 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData' 
                : 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData';
            pUrl.value = isProd 
                ? (settings.fbr_post_url_prod || 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData')
                : (settings.fbr_post_url || 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData');
        }

        const tokenInput = document.getElementById('fbr_api_token');
        if (tokenInput) {
            tokenInput.value = isProd 
                ? (settings.fbr_api_token_production_masked || '') 
                : (settings.fbr_api_token_sandbox_masked || settings.fbr_api_token_masked || '');
        }
    },

    saveSettings: async function(section) {
        const compId = this.getCompanyId();
        const payload = { settings: {}, company_id: compId };
        
        if (section === 'general') {
            payload.settings.gen_default_mode = document.getElementById('gen_default_mode').value;
            payload.settings.gen_default_payment = document.getElementById('gen_default_payment').value;
            payload.settings.gen_invoice_series = document.getElementById('gen_invoice_series').value;
            payload.settings.gen_allow_negative_stock = document.getElementById('gen_allow_negative_stock').checked ? '1' : '0';
            payload.settings.gen_allow_zero_stock = document.getElementById('gen_allow_zero_stock').checked ? '1' : '0';
            payload.settings.gen_enable_barcode = document.getElementById('gen_enable_barcode').checked ? '1' : '0';
            payload.settings.gen_enable_search_suggestions = document.getElementById('gen_enable_search_suggestions').checked ? '1' : '0';
            payload.settings.gen_enable_price_edit = document.getElementById('gen_enable_price_edit').checked ? '1' : '0';
            payload.settings.gen_opening_time = document.getElementById('gen_opening_time') ? document.getElementById('gen_opening_time').value : '';
            payload.settings.gen_closing_time = document.getElementById('gen_closing_time') ? document.getElementById('gen_closing_time').value : '';
            payload.settings.gen_off_day = document.getElementById('gen_off_day') ? document.getElementById('gen_off_day').value : '';
            payload.settings.gen_apply_hours_to_all_branches = document.getElementById('gen_apply_hours_to_all_branches')?.checked ? '1' : '0';
        } else if (section === 'receipt') {
            payload.settings.rec_printer_type = document.getElementById('rec_printer_type')?.value || 'browser';
            payload.settings.rec_paper_size = document.getElementById('rec_paper_size')?.value || '58mm';
            payload.settings.rec_header = document.getElementById('rec_header')?.value || '';
            payload.settings.rec_footer = document.getElementById('rec_footer')?.value || '';
            payload.settings.rec_auto_print = document.getElementById('rec_auto_print')?.checked ? '1' : '0';
            payload.settings.rec_show_header = document.getElementById('rec_show_header')?.checked ? '1' : '0';
            payload.settings.rec_show_logo = document.getElementById('rec_show_logo')?.checked ? '1' : '0';
            payload.settings.rec_show_tax = document.getElementById('rec_show_tax')?.checked ? '1' : '0';
            payload.settings.rec_copies = document.getElementById('rec_copies')?.value || '1';

            // Immediately save to local storage cache so it persists even if page is refreshed or reopened
            try {
                localStorage.setItem('pos_rec_settings_' + compId, JSON.stringify({
                    rec_show_header: payload.settings.rec_show_header,
                    rec_show_logo: payload.settings.rec_show_logo,
                    rec_show_tax: payload.settings.rec_show_tax,
                    rec_auto_print: payload.settings.rec_auto_print,
                    rec_copies: payload.settings.rec_copies
                }));
            } catch(e) {}
        } else if (section === 'sales') {
            payload.settings.rule_max_discount = document.getElementById('rule_max_discount').value;
            payload.settings.rule_allow_credit_sales = document.getElementById('rule_allow_credit_sales').checked ? '1' : '0';
            payload.settings.rule_require_customer_for_credit = document.getElementById('rule_require_customer_for_credit').checked ? '1' : '0';
            payload.settings.rule_prevent_duplicate = document.getElementById('rule_prevent_duplicate').checked ? '1' : '0';
            payload.settings.rule_allow_returns = document.getElementById('rule_allow_returns').checked ? '1' : '0';
            payload.settings.rule_stock_deduction = document.getElementById('rule_stock_deduction').value;
        } else if (section === 'fbr') {
            const isEnabled = document.getElementById('fbr_enable').checked;
            payload.settings.fbr_enable = isEnabled ? '1' : '0';
            const env = document.getElementById('fbr_environment').value;
            payload.settings.fbr_environment = env;
            payload.settings.fbr_pos_id = document.getElementById('fbr_pos_id').value.trim();

            const vUrl = document.getElementById('fbr_validate_url');
            const pUrl = document.getElementById('fbr_post_url');
            const bUrl = document.getElementById('fbr_base_url');
            if (bUrl) payload.settings.fbr_base_url = bUrl.value.trim();

            if (env === 'production') {
                if (vUrl) payload.settings.fbr_validate_url_prod = vUrl.value.trim();
                if (pUrl) payload.settings.fbr_post_url_prod = pUrl.value.trim();
            } else {
                if (vUrl) payload.settings.fbr_validate_url = vUrl.value.trim();
                if (pUrl) payload.settings.fbr_post_url = pUrl.value.trim();
            }
            
            const defPct = document.getElementById('fbr_default_pct_code');
            if (defPct) payload.settings.fbr_default_pct_code = defPct.value.trim();
            
            const token = document.getElementById('fbr_api_token').value.trim();
            // Don't overwrite if token contains masked bullet dots
            if (token && !token.includes('•') && !token.includes('*')) {
                if (env === 'production') {
                    payload.settings.fbr_api_token_production = token;
                } else {
                    payload.settings.fbr_api_token_sandbox = token;
                    payload.settings.fbr_api_token = token; // backward compatibility
                }
            }
            this.updateFBRStatus(isEnabled);
        } else if (section === 'branch') {
            // Handled by Branch Module
            return;
        }

        try {
            const btn = document.querySelector(`#sec-${section} .btn-save`);
            const origHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;

            const res = await fetch(`api/pos_settings.php?action=save_settings&company_id=${compId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                await this.loadSettings();
                const successMsg = data.message || "Settings saved successfully";
                if (window.showAlert) {
                    window.showAlert(successMsg, "success");
                } else {
                    alert(successMsg);
                }
                if (section === 'fbr') {
                    this.loadBranchMappings();
                } else if (section === 'general') {
                    if (typeof this.loadBranchesAndWarehouses === 'function') {
                        this.loadBranchesAndWarehouses();
                    }
                }
            } else {
                alert(data.error || "Failed to save settings");
            }
            
            setTimeout(() => {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }, 500);

        } catch (error) {
            console.error("Error saving POS settings:", error);
            alert("Network error while saving settings.");
        }
    },

    testFBRConnection: async function() {
        const env = document.getElementById('fbr_environment').value;
        const ind = document.getElementById('fbr_status_indicator');
        const txt = document.getElementById('fbr_status_text');
        const icon = document.getElementById('fbr_status_icon');
        const btn = document.getElementById('btn_fbr_test_central');
        
        if (ind) {
            ind.style.backgroundColor = '#eff6ff';
            ind.style.color = '#1e40af';
            ind.style.border = '1px solid #bfdbfe';
        }
        if (txt) txt.textContent = 'Verifying Server & Authentication...';
        if (icon) icon.className = 'fas fa-spinner fa-spin';

        let origBtn = '';
        if (btn) {
            origBtn = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            btn.disabled = true;
        }
        
        try {
            const res = await fetch(`api/pos_settings.php?action=test_fbr_connection&env=${env}`);
            const data = await res.json();
            
            // Cache test results
            if (this.cachedSettings) {
                Object.assign(this.cachedSettings, {
                    fbr_overall_status: data.overall_status,
                    fbr_config_status: data.config_status,
                    fbr_server_connectivity: data.server_connectivity,
                    fbr_auth_status: data.auth_status,
                    fbr_validation_status: data.validation_status,
                    fbr_submission_status: data.submission_status,
                    fbr_last_test_result: data.message,
                    fbr_last_tested_at: data.tested_at,
                    fbr_last_http_code: data.http_code,
                    fbr_last_latency: data.latency_ms
                });
            }

            this.updateFBRStatus(true, data.overall_status, data);

            // Construct detailed, structured diagnostic report for alert
            const report = [
                `Overall Status: ${data.overall_status}`,
                `----------------------------------------`,
                `A. Configuration:        ${data.config_status || 'Configured'}`,
                `B. Server Connectivity:   ${data.server_connectivity || 'Not Tested'}`,
                `C. Authentication:       ${data.auth_status || 'Not Tested'}`,
                `D. Invoice Validation:   ${data.validation_status || 'Not Tested'}`,
                `E. Invoice Submission:   ${data.submission_status || 'Not Submitted'}`,
                `----------------------------------------`,
                `HTTP Code: ${data.http_code || '0'} | Latency: ${data.latency_ms || 0}ms`,
                `Target: ${data.endpoint || 'N/A'}`,
                `\n${data.message}`
            ].join('\n');

            alert(report);

            // Refresh branch mappings to show updated statuses
            await this.loadBranchMappings(env);
        } catch(e) {
            if (ind) {
                ind.style.backgroundColor = '#fff5f5';
                ind.style.color = '#9b2c2c';
                ind.style.border = '1px solid #fed7d7';
            }
            if (txt) txt.textContent = 'Connection Error';
            if (icon) icon.className = 'fas fa-exclamation-triangle';
            alert('Network error while testing connection: ' + e.message);
        } finally {
            if (btn) {
                btn.innerHTML = origBtn;
                btn.disabled = false;
            }
        }
    },
    
    updateFBRStatus: function(isEnabled, overallStatus, meta) {
        meta = meta || this.cachedSettings || {};
        const ind = document.getElementById('fbr_status_indicator');
        const txt = document.getElementById('fbr_status_text');
        const icon = document.getElementById('fbr_status_icon');
        const testedBadge = document.getElementById('fbr_last_tested_badge');
        const diagNotice = document.getElementById('fbr_diag_notice');

        // Sub-dimension elements
        const statConfig = document.getElementById('fbr_stat_config');
        const statConn = document.getElementById('fbr_stat_connectivity');
        const statAuth = document.getElementById('fbr_stat_auth');
        const statVal = document.getElementById('fbr_stat_validation');
        const statSub = document.getElementById('fbr_stat_submission');

        const cfgVal = meta.fbr_config_status || meta.config_status || (isEnabled ? 'Configured' : 'Not Configured');
        const connVal = meta.fbr_server_connectivity || meta.server_connectivity || 'Not Tested';
        const authVal = meta.fbr_auth_status || meta.auth_status || 'Not Tested';
        const valVal = meta.fbr_validation_status || meta.validation_status || 'Not Tested';
        const subVal = meta.fbr_submission_status || meta.submission_status || 'Not Submitted';

        // Apply helper styles to sub-dimension badges
        const applyBadgeStyle = (el, val, positiveVal, warningVal, dangerVal) => {
            if (!el) return;
            el.textContent = val;
            if (val === positiveVal || val === 'Verified' || val === 'Passed' || val === 'Posted' || val === 'Reachable') {
                el.style.color = '#15803d';
                el.style.fontWeight = '700';
            } else if (val === dangerVal || val === 'Failed' || val === 'Unreachable' || val === 'Rejected') {
                el.style.color = '#b91c1c';
                el.style.fontWeight = '700';
            } else if (val === warningVal || val === 'Unable to Verify' || val === 'Unknown / Requires Reconciliation') {
                el.style.color = '#b45309';
                el.style.fontWeight = '700';
            } else {
                el.style.color = '#64748b';
                el.style.fontWeight = '600';
            }
        };

        applyBadgeStyle(statConfig, cfgVal, 'Configured');
        applyBadgeStyle(statConn, connVal, 'Reachable', null, 'Unreachable');
        applyBadgeStyle(statAuth, authVal, 'Verified', 'Unable to Verify', 'Failed');
        applyBadgeStyle(statVal, valVal, 'Passed', null, 'Failed');
        applyBadgeStyle(statSub, subVal, 'Posted', 'Unknown / Requires Reconciliation', 'Rejected');

        if (testedBadge) {
            const lastTime = meta.fbr_last_tested_at || meta.last_tested_at;
            if (lastTime) {
                testedBadge.style.display = 'inline-block';
                testedBadge.textContent = 'Tested: ' + lastTime;
            } else {
                testedBadge.style.display = 'none';
            }
        }

        if (diagNotice) {
            const noticeText = meta.fbr_last_test_result || meta.message;
            if (noticeText) {
                diagNotice.style.display = 'block';
                diagNotice.textContent = noticeText;
            } else {
                diagNotice.style.display = 'none';
            }
        }

        if (!ind) return;

        overallStatus = overallStatus || meta.fbr_overall_status || 'Not Configured';

        if (!isEnabled) {
            ind.style.backgroundColor = '#f8fafc';
            ind.style.color = '#64748b';
            ind.style.border = '1px solid #cbd5e1';
            if (txt) txt.textContent = 'Disabled';
            if (icon) icon.className = 'fas fa-ban';
            return;
        }

        // Distinct overall statuses
        if (overallStatus === 'Connected') {
            ind.style.backgroundColor = '#ecfdf5';
            ind.style.color = '#065f46';
            ind.style.border = '1px solid #a7f3d0';
            if (txt) txt.textContent = 'Connected (Verified)';
            if (icon) icon.className = 'fas fa-check-circle text-success';
        } else if (overallStatus === 'Authentication Failed') {
            ind.style.backgroundColor = '#fef2f2';
            ind.style.color = '#991b1b';
            ind.style.border = '1px solid #fecaca';
            if (txt) txt.textContent = 'Authentication Failed';
            if (icon) icon.className = 'fas fa-times-circle text-danger';
        } else if (overallStatus === 'Server Unreachable') {
            ind.style.backgroundColor = '#fef2f2';
            ind.style.color = '#991b1b';
            ind.style.border = '1px solid #fecaca';
            if (txt) txt.textContent = 'Server Unreachable';
            if (icon) icon.className = 'fas fa-wifi text-danger';
        } else if (overallStatus === 'Endpoint Invalid') {
            ind.style.backgroundColor = '#fffbeb';
            ind.style.color = '#92400e';
            ind.style.border = '1px solid #fde68a';
            if (txt) txt.textContent = 'Endpoint Invalid';
            if (icon) icon.className = 'fas fa-exclamation-triangle text-warning';
        } else if (overallStatus === 'Configuration Saved — Authentication Not Verified') {
            ind.style.backgroundColor = '#fffbeb';
            ind.style.color = '#92400e';
            ind.style.border = '1px solid #fde68a';
            if (txt) txt.textContent = 'Saved — Authentication Not Verified';
            if (icon) icon.className = 'fas fa-question-circle text-warning';
        } else if (overallStatus === 'Configured / Not Tested') {
            ind.style.backgroundColor = '#eff6ff';
            ind.style.color = '#1e40af';
            ind.style.border = '1px solid #bfdbfe';
            if (txt) txt.textContent = 'Configured / Not Tested';
            if (icon) icon.className = 'fas fa-clock text-primary';
        } else if (overallStatus === 'Connection Failed') {
            ind.style.backgroundColor = '#fef2f2';
            ind.style.color = '#991b1b';
            ind.style.border = '1px solid #fecaca';
            if (txt) txt.textContent = 'Connection Failed';
            if (icon) icon.className = 'fas fa-times-circle text-danger';
        } else {
            ind.style.backgroundColor = '#f8fafc';
            ind.style.color = '#64748b';
            ind.style.border = '1px solid #cbd5e1';
            if (txt) txt.textContent = 'Not Configured';
            if (icon) icon.className = 'fas fa-circle-notch';
        }
    },

    onEnvironmentChange: function(env) {
        this.updateEnvironmentBadge(env);
        const warn = document.getElementById('fbr_prod_warning');
        if (warn) warn.style.display = (env === 'production') ? 'block' : 'none';
        this.applyEnvironmentFields(env);
        this.loadBranchMappings(env);
    },

    toggleTokenVisibility: function() {
        const tokenInput = document.getElementById('fbr_api_token');
        const icon = document.getElementById('toggle_token_visibility');
        if (!tokenInput) return;
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            if (icon) {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        } else {
            tokenInput.type = 'password';
            if (icon) {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    },

    escapeHtml: function(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    onFBREnableToggle: function(isChecked) {
        this.updateFBRStatus(isChecked);
        this.loadBranchMappings();
    },

    updateEnvironmentBadge: function(env) {
        const badge = document.getElementById('fbr_env_badge');
        if (!badge) return;
        if (env === 'production') {
            badge.style.background = '#feebc8';
            badge.style.color = '#7b341e';
            badge.textContent = 'Production (Live) Mode';
        } else {
            badge.style.background = '#e2e8f0';
            badge.style.color = '#4a5568';
            badge.textContent = 'Sandbox (Testing) Mode';
        }
    },

    // -------------------------------------------------------------
    // DYNAMIC BRANCH-WISE FBR MAPPING
    // -------------------------------------------------------------
    loadBranchMappings: async function(env) {
        if (!env) {
            const envSelect = document.getElementById('fbr_environment');
            env = envSelect ? envSelect.value : 'sandbox';
        }

        const tbody = document.getElementById('fbr_branch_mapping_tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 20px; text-align: center; color: #718096;">
                    <i class="fas fa-spinner fa-spin"></i> Loading branch mappings from Branch Settings...
                </td>
            </tr>
        `;

        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/pos_settings.php?action=get_branch_mappings&env=${env}&${cb}`);
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();

            if (data.success) {
                this.branchMappings = data.mappings || [];
                const counter = document.getElementById('fbr_mapping_counter');
                if (counter) {
                    const connected = data.summary ? data.summary.connected : 0;
                    counter.textContent = `${this.branchMappings.length} Branches (${connected} Connected)`;
                }

                // Populate branch dropdown in Logs & Status tab filter
                this.populateBranchLogFilters(this.branchMappings);

                this.renderBranchMappings();
            } else {
                tbody.innerHTML = `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #e53e3e;">Failed: ${this.escapeHtml(data.error || 'Could not load branch mappings')}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #e53e3e;">Network error loading branch mappings.</td></tr>`;
        }
    },

    renderBranchMappings: function() {
        const tbody = document.getElementById('fbr_branch_mapping_tbody');
        if (!tbody) return;

        if (this.branchMappings.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="padding: 25px; text-align: center; color: #718096;">
                        <i class="fas fa-info-circle"></i> No active branches found. Branches load dynamically from the Branch Settings module.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        this.branchMappings.forEach(b => {
            const statusBadge = this.getStatusBadge(b.status);
            const isEnabled = parseInt(b.is_enabled) === 1;

            const posIdDisplay = b.fbr_pos_id 
                ? `<span style="font-family: monospace; font-weight: 700; color: #2b6cb0; font-size: 13px;">${this.escapeHtml(b.fbr_pos_id)}</span>` 
                : `<span style="color: #a0aec0; font-style: italic;">Not Configured</span>`;

            const identDisplay = b.identification_no 
                ? `<span style="font-family: monospace; font-weight: 700; background: #edf2f7; padding: 2px 8px; border-radius: 4px; color: #2d3748;">${this.escapeHtml(b.identification_no)}</span>`
                : `<span style="color: #cbd5e0;">—</span>`;

            let posStatusBadge = '';
            if (b.pos_status === 'Registered') {
                posStatusBadge = '<span class="badge-reg-registered"><i class="fas fa-id-badge"></i> Registered</span>';
            } else if (b.pos_status === 'Active') {
                posStatusBadge = '<span class="badge-reg-registered"><i class="fas fa-check-circle"></i> Active</span>';
            } else if (b.pos_status === 'Pending') {
                posStatusBadge = '<span class="badge-reg-pending"><i class="fas fa-clock"></i> Pending</span>';
            } else {
                posStatusBadge = `<span class="badge-status-not-config">${this.escapeHtml(b.pos_status || 'Registered')}</span>`;
            }

            const addressDisplay = b.address 
                ? `<div style="font-size: 11px; color: #718096; margin-top: 2px;"><i class="fas fa-map-marker-alt" style="color: #e53e3e; margin-right: 3px;"></i>${this.escapeHtml(b.address)}</div>`
                : '';

            let connDetails = '';
            if (b.connected_date) {
                connDetails = `<div style="font-size: 10px; color: #27ae60; margin-top: 3px;" title="Connected Date"><i class="fas fa-check-circle"></i> ${this.escapeHtml(b.connected_date.split(' ')[0])}</div>`;
            } else if (b.last_tested_at) {
                connDetails = `<div style="font-size: 10px; color: #718096; margin-top: 3px;" title="Last Tested"><i class="fas fa-history"></i> ${this.escapeHtml(b.last_tested_at.split(' ')[0])}</div>`;
            }
            if (b.status === 'Connection Failed' && b.last_error) {
                const shortErr = b.last_error.length > 28 ? b.last_error.substring(0, 28) + '...' : b.last_error;
                connDetails += `<div style="font-size: 10px; color: #e53e3e; margin-top: 2px;" title="${this.escapeHtml(b.last_error)}"><i class="fas fa-exclamation-circle"></i> ${this.escapeHtml(shortErr)}</div>`;
            }

            const modeBadge = b.is_cloud 
                ? '<span class="badge-cloud">Cloud</span>' 
                : '<span class="badge-onprem">On-Prem</span>';

            const tokenBadge = b.has_pos_token 
                ? `<span style="background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px;" title="${this.escapeHtml(b.pos_token_masked || 'Configured')}"><i class="fas fa-key" style="color: #319795;"></i> Configured</span>` 
                : '<span style="background: #fff5f5; color: #c53030; border: 1px solid #fed7d7; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> Not Set</span>';

            html += `
                <tr style="border-bottom: 1px solid #edf2f7; ${!isEnabled ? 'background: #fdfdfd; opacity: 0.8;' : ''}">
                    <td style="padding: 10px 12px; font-weight: 600; color: #2d3748;">
                        <div>
                            <i class="fas fa-building" style="color: #3182ce; margin-right: 5px;"></i>
                            <strong>${this.escapeHtml(b.branch_name)}</strong>
                        </div>
                        ${addressDisplay}
                    </td>
                    <td style="padding: 10px 12px;">
                        <span style="font-family: monospace; background: #edf2f7; padding: 3px 7px; border-radius: 4px; font-size: 11px; color: #4a5568; font-weight: 600;">${this.escapeHtml(b.branch_code)}</span>
                    </td>
                    <td style="padding: 10px 12px;">
                        ${posIdDisplay}
                    </td>
                    <td style="padding: 10px 12px; text-align: center;">
                        ${tokenBadge}
                    </td>
                    <td style="padding: 10px 12px; text-align: center;">
                        ${identDisplay}
                    </td>
                    <td style="padding: 10px 12px; text-align: center;">
                        ${posStatusBadge}
                    </td>
                    <td style="padding: 10px 12px; text-align: center;">
                        ${statusBadge}
                        ${connDetails}
                    </td>
                    <td style="padding: 10px 12px; text-align: center;">
                        <div style="display: inline-flex; gap: 4px; flex-wrap: wrap; justify-content: center;">
                            <button class="btn-fbr-action btn-fbr-edit" onclick="window.POSSettings.openEditBranchModal(${b.branch_id})" title="Edit Branch FBR Configuration">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn-fbr-action btn-fbr-test" id="btn_test_branch_${b.branch_id}" onclick="window.POSSettings.testBranchConnection(${b.branch_id})" title="Test FBR Connection for this branch">
                                <i class="fas fa-plug"></i> Test
                            </button>
                            <button class="btn-fbr-action ${isEnabled ? 'btn-fbr-deactivate' : 'btn-fbr-save'}" onclick="window.POSSettings.toggleBranchEnabled(${b.branch_id}, ${isEnabled ? 0 : 1})" title="${isEnabled ? 'Deactivate branch integration' : 'Enable branch integration'}">
                                <i class="fas fa-power-off"></i> ${isEnabled ? 'Deactivate' : 'Enable'}
                            </button>
                            <button class="btn-fbr-action btn-fbr-reset" onclick="window.POSSettings.resetBranchMapping(${b.branch_id})" title="Authorized Reset: Clear connection status and force re-verification">
                                <i class="fas fa-redo-alt"></i> Reset
                            </button>
                            <button class="btn-fbr-action btn-fbr-delete" onclick="window.POSSettings.deleteBranchMapping(${b.branch_id})" title="Delete branch from FBR mapping">
                                <i class="fas fa-trash-alt"></i> Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    // -------------------------------------------------------------
    // MODAL ACTIONS: Edit Branch Mapping
    // -------------------------------------------------------------
    openEditBranchModal: function(branchId) {
        const branch = this.branchMappings.find(b => b.branch_id === branchId);
        if (!branch) {
            alert('Branch details not found');
            return;
        }

        document.getElementById('modal_edit_branch_id').value = branch.branch_id;
        document.getElementById('modal_edit_branch_title').textContent = branch.branch_name;
        document.getElementById('modal_edit_branch_code').textContent = branch.branch_code;
        document.getElementById('modal_edit_pos_id').value = branch.fbr_pos_id || '';
        document.getElementById('modal_edit_ident_no').value = branch.identification_no || '';
        document.getElementById('modal_edit_pos_status').value = branch.pos_status || 'Registered';
        document.getElementById('modal_edit_version').value = branch.fbr_pos_version || '1.0';
        document.getElementById('modal_edit_is_cloud').value = branch.is_cloud ? '1' : '0';
        document.getElementById('modal_edit_is_enabled').checked = (parseInt(branch.is_enabled) === 1);
        
        const tokenInput = document.getElementById('modal_edit_pos_token');
        const tokenHelp = document.getElementById('modal_edit_token_help');
        if (tokenInput) {
            tokenInput.type = 'password';
            tokenInput.value = branch.pos_token || '';
        }
        if (tokenHelp) {
            if (branch.has_pos_token) {
                tokenHelp.innerHTML = `<span style="color: #16a34a; font-weight: 600;"><i class="fas fa-check-circle"></i> Token is saved in database (${this.escapeHtml(branch.pos_token_masked || 'Configured')}). Click 👁️ eye icon to reveal or modify.</span>`;
            } else {
                tokenHelp.innerHTML = `<span style="color: #d97706; font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> No token saved yet for this branch. Please paste official e-FBR POS Security Token here.</span>`;
            }
        }
        const toggleIcon = document.getElementById('toggle_modal_token_visibility');
        if (toggleIcon) toggleIcon.className = 'fas fa-eye';

        const modal = document.getElementById('posModalEditBranchMapping');
        if (modal) modal.style.display = 'flex';
    },

    toggleModalEditTokenVisibility: function() {
        const el = document.getElementById('modal_edit_pos_token');
        const icon = document.getElementById('toggle_modal_token_visibility');
        if (!el) return;
        if (el.type === 'password') {
            el.type = 'text';
            if (icon) icon.className = 'fas fa-eye-slash';
        } else {
            el.type = 'password';
            if (icon) icon.className = 'fas fa-eye';
        }
    },

    toggleQuickAddTokenVisibility: function() {
        const el = document.getElementById('quick_add_pos_token');
        const icon = document.getElementById('toggle_quick_token_visibility');
        if (!el) return;
        if (el.type === 'password') {
            el.type = 'text';
            if (icon) icon.className = 'fas fa-eye-slash';
        } else {
            el.type = 'password';
            if (icon) icon.className = 'fas fa-eye';
        }
    },

    closeEditBranchModal: function() {
        const modal = document.getElementById('posModalEditBranchMapping');
        if (modal) modal.style.display = 'none';
    },

    saveBranchMappingFromModal: async function() {
        const branchId = parseInt(document.getElementById('modal_edit_branch_id').value);
        if (!branchId) return;

        const env = document.getElementById('fbr_environment').value;
        const posId = document.getElementById('modal_edit_pos_id').value.trim();
        const identNo = document.getElementById('modal_edit_ident_no').value.trim();
        const posStatus = document.getElementById('modal_edit_pos_status').value;
        const version = document.getElementById('modal_edit_version').value.trim() || '1.0';
        const isCloud = document.getElementById('modal_edit_is_cloud').value;
        const isEnabled = document.getElementById('modal_edit_is_enabled').checked ? 1 : 0;
        const posToken = document.getElementById('modal_edit_pos_token').value.trim();

        const payload = {
            branch_id: branchId,
            environment: env,
            fbr_pos_id: posId,
            identification_no: identNo,
            pos_status: posStatus,
            fbr_pos_version: version,
            is_cloud: isCloud,
            is_enabled: isEnabled,
            pos_token: posToken
        };

        try {
            const res = await fetch('api/pos_settings.php?action=save_branch_mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                if (window.showAlert) window.showAlert(data.message, 'success');
                else alert(data.message);
                this.closeEditBranchModal();
                await this.loadBranchMappings(env);
            } else {
                alert(data.error || 'Failed to save branch mapping');
            }
        } catch (e) {
            alert('Network error while saving branch mapping.');
        }
    },

    // -------------------------------------------------------------
    // MODAL ACTIONS: Quick Add / Connect ERP Branch
    // -------------------------------------------------------------
    openAddBranchModal: async function() {
        // Reset form fields
        const hiddenId = document.getElementById('quick_add_branch_id');
        if (hiddenId) hiddenId.value = '';

        const nameInput = document.getElementById('quick_add_branch_name');
        if (nameInput) {
            nameInput.value = '';
            nameInput.readOnly = false;
        }

        const codeInput = document.getElementById('quick_add_branch_code');
        if (codeInput) {
            codeInput.value = '';
            codeInput.readOnly = false;
        }

        const posIdInput = document.getElementById('quick_add_pos_id');
        if (posIdInput) posIdInput.value = '';

        const tokenInput = document.getElementById('quick_add_pos_token');
        if (tokenInput) {
            tokenInput.type = 'password';
            tokenInput.value = '';
        }
        const toggleQuickIcon = document.getElementById('toggle_quick_token_visibility');
        if (toggleQuickIcon) toggleQuickIcon.className = 'fas fa-eye';

        const identInput = document.getElementById('quick_add_ident_no');
        if (identInput) identInput.value = '';

        const addrInput = document.getElementById('quick_add_branch_address');
        if (addrInput) addrInput.value = '';

        const selectEl = document.getElementById('quick_add_branch_select');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">-- Loading ERP Branches... --</option>';
        }

        const modal = document.getElementById('posModalQuickAddBranch');
        if (modal) modal.style.display = 'flex';

        // Load branches dynamically from API
        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/branch_settings.php?action=get_branches&${cb}`);
            if (res.ok) {
                const data = await res.json();
                this.allErpBranches = data.branches || [];
            } else {
                this.allErpBranches = this.branchesData || [];
            }
        } catch (e) {
            this.allErpBranches = this.branchesData || [];
        }

        this.populateQuickAddBranchSelect();
    },

    populateQuickAddBranchSelect: function() {
        const selectEl = document.getElementById('quick_add_branch_select');
        if (!selectEl) return;

        const branches = this.allErpBranches || [];
        let html = '<option value="">-- Choose Existing ERP Branch --</option>';
        branches.forEach(b => {
            const statusTag = b.status === 'Inactive' ? ' [Inactive]' : '';
            const fbrTag = b.fbr_pos_id ? ` (FBR ID: ${b.fbr_pos_id})` : ' (Not Configured)';
            html += `<option value="${b.id}">${this.escapeHtml(b.branch_name)} [${this.escapeHtml(b.branch_code)}]${statusTag}${fbrTag}</option>`;
        });
        html += '<option value="__new__">+ Enter New ERP Branch Details</option>';
        selectEl.innerHTML = html;

        // Auto-select first branch if available
        if (branches.length > 0) {
            selectEl.value = branches[0].id;
            this.onQuickBranchSelected(branches[0].id);
        }
    },

    onQuickBranchSelected: function(val) {
        const nameInput = document.getElementById('quick_add_branch_name');
        const codeInput = document.getElementById('quick_add_branch_code');
        const posIdInput = document.getElementById('quick_add_pos_id');
        const tokenInput = document.getElementById('quick_add_pos_token');
        const identInput = document.getElementById('quick_add_ident_no');
        const addrInput = document.getElementById('quick_add_branch_address');
        const hiddenId = document.getElementById('quick_add_branch_id');

        if (!val || val === '__new__') {
            if (hiddenId) hiddenId.value = '';
            if (nameInput) {
                nameInput.value = '';
                nameInput.readOnly = false;
            }
            if (codeInput) {
                codeInput.value = '';
                codeInput.readOnly = false;
            }
            if (posIdInput) posIdInput.value = '';
            if (tokenInput) tokenInput.value = '';
            if (identInput) identInput.value = '';
            if (addrInput) addrInput.value = '';
            if (val === '__new__' && nameInput) nameInput.focus();
            return;
        }

        const b = (this.allErpBranches || []).find(x => x.id == val);
        if (b) {
            if (hiddenId) hiddenId.value = b.id;
            if (nameInput) {
                nameInput.value = b.branch_name || '';
                nameInput.readOnly = true;
            }
            if (codeInput) {
                codeInput.value = b.branch_code || '';
                codeInput.readOnly = true;
            }
            if (addrInput) addrInput.value = b.address || '';
            if (posIdInput) posIdInput.value = b.fbr_pos_id || '';
            if (identInput) identInput.value = b.fbr_identification_no || '';
            if (tokenInput) tokenInput.value = '';
            if (posIdInput && !b.fbr_pos_id) {
                posIdInput.focus();
            }
        }
    },

    closeAddBranchModal: function() {
        const modal = document.getElementById('posModalQuickAddBranch');
        if (modal) modal.style.display = 'none';
    },

    saveQuickAddBranch: async function() {
        const hiddenId = document.getElementById('quick_add_branch_id');
        const branchId = hiddenId ? hiddenId.value : '';
        const name = document.getElementById('quick_add_branch_name').value.trim();
        const code = document.getElementById('quick_add_branch_code').value.trim().toUpperCase();
        const posId = document.getElementById('quick_add_pos_id').value.trim();
        const token = document.getElementById('quick_add_pos_token') ? document.getElementById('quick_add_pos_token').value.trim() : '';
        const identNo = document.getElementById('quick_add_ident_no').value.trim();
        const address = document.getElementById('quick_add_branch_address').value.trim();
        const env = document.getElementById('fbr_environment').value;

        if (!branchId && (!name || !code)) {
            alert('Branch Name and Branch Code are required.');
            return;
        }

        const payload = {
            branch_id: branchId ? parseInt(branchId) : 0,
            branch_name: name,
            branch_code: code,
            fbr_pos_id: posId,
            pos_token: token,
            identification_no: identNo,
            address: address,
            environment: env
        };

        try {
            const res = await fetch('api/pos_settings.php?action=add_branch_quick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                if (window.showAlert) window.showAlert(data.message, 'success');
                else alert(data.message);
                this.closeAddBranchModal();
                await this.loadBranchMappings(env);
                if (typeof this.loadBranchesList === 'function') {
                    this.loadBranchesList();
                }
                if (typeof this.loadBranchesAndWarehouses === 'function') {
                    this.loadBranchesAndWarehouses();
                }
            } else {
                alert(data.error || 'Failed to connect branch');
            }
        } catch (e) {
            alert('Network error connecting branch.');
        }
    },

    // -------------------------------------------------------------
    // BRANCH ACTIONS: Reset & Deactivate/Activate
    // -------------------------------------------------------------
    resetBranchMapping: async function(branchId) {
        const branch = this.branchMappings.find(b => b.branch_id === branchId);
        const branchName = branch ? branch.branch_name : `Branch #${branchId}`;
        const confirmed = confirm(`Authorized Action: Are you sure you want to reset the FBR connection status for "${branchName}"?\n\nThis will clear the Connected Date and mark the branch as "Configuration Required" for re-verification.`);
        if (!confirmed) return;

        const env = document.getElementById('fbr_environment').value;
        try {
            const res = await fetch('api/pos_settings.php?action=reset_branch_mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch_id: branchId, environment: env })
            });
            const data = await res.json();
            if (data.success) {
                if (window.showAlert) window.showAlert(data.message, 'success');
                else alert(data.message);
                await this.loadBranchMappings(env);
            } else {
                alert(data.error || 'Failed to reset branch mapping');
            }
        } catch (e) {
            alert('Network error resetting branch mapping.');
        }
    },

    toggleBranchEnabled: async function(branchId, newState) {
        const branch = this.branchMappings.find(b => b.branch_id === branchId);
        const branchName = branch ? branch.branch_name : `Branch #${branchId}`;
        const actionText = (newState === 1) ? 'Enable' : 'Deactivate';
        const confirmed = confirm(`Are you sure you want to ${actionText} FBR integration for "${branchName}"?`);
        if (!confirmed) return;

        const env = document.getElementById('fbr_environment').value;
        try {
            const res = await fetch('api/pos_settings.php?action=deactivate_branch_mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch_id: branchId, environment: env, is_enabled: newState })
            });
            const data = await res.json();
            if (data.success) {
                if (window.showAlert) window.showAlert(data.message, 'success');
                await this.loadBranchMappings(env);
            } else {
                alert(data.error || 'Failed to update branch status');
            }
        } catch (e) {
            alert('Network error updating branch status.');
        }
    },

    deleteBranchMapping: async function(branchId) {
        const branch = this.branchMappings.find(b => b.branch_id === branchId);
        const branchName = branch ? branch.branch_name : `Branch #${branchId}`;
        const confirmed = confirm(`Are you sure you want to delete "${branchName}" from FBR mapping? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const res = await fetch('api/pos_settings.php?action=delete_branch_mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch_id: branchId })
            });
            const data = await res.json();
            if (data.success) {
                if (window.showAlert) window.showAlert(data.message, 'success');
                else alert(data.message);
                const env = document.getElementById('fbr_environment').value;
                await this.loadBranchMappings(env);
                if (typeof this.loadBranchesAndWarehouses === 'function') {
                    this.loadBranchesAndWarehouses();
                }
            } else {
                alert(data.error || 'Failed to delete branch');
            }
        } catch (e) {
            alert('Network error while deleting branch.');
        }
    },

    testBranchConnection: async function(branchId) {
        const env = document.getElementById('fbr_environment').value;
        const btn = document.getElementById(`btn_test_branch_${branchId}`);
        let origHtml = '';
        if (btn) {
            origHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            btn.disabled = true;
        }

        try {
            const res = await fetch(`api/pos_settings.php?action=test_fbr_connection&env=${env}&branch_id=${branchId}`);
            const data = await res.json();

            if (data.success) {
                alert(`✓ Connection Successful:\n${data.message}`);
            } else {
                alert(`✕ Connection Failed:\n${data.error || 'Unknown error'}`);
            }
            await this.loadBranchMappings(env);
        } catch (e) {
            alert('Network error testing branch connection.');
        } finally {
            if (btn) {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }
        }
    },

    getStatusBadge: function(status) {
        switch (status) {
            case 'Connected':
                return '<span class="badge-status-connected"><i class="fas fa-check-circle"></i> Connected</span>';
            case 'Configuration Required':
                return '<span class="badge-status-config-req"><i class="fas fa-exclamation-triangle"></i> Configuration Required</span>';
            case 'Connection Failed':
                return '<span class="badge-status-failed"><i class="fas fa-times-circle"></i> Connection Failed</span>';
            case 'Disabled':
                return '<span class="badge-status-disabled"><i class="fas fa-ban"></i> Disabled</span>';
            case 'Not Configured':
            default:
                return '<span class="badge-status-not-config"><i class="fas fa-minus-circle"></i> Not Configured</span>';
        }
    },

    // -------------------------------------------------------------
    // LOGS & STATUS
    // -------------------------------------------------------------
    loadFBRLogs: async function() {
        const tbody = document.getElementById('fbr_logs_tbody');
        if (!tbody) return;

        const branchSelect = document.getElementById('fbr_log_filter_branch');
        const statusSelect = document.getElementById('fbr_log_filter_status');

        const branchId = branchSelect ? branchSelect.value : '';
        const status = statusSelect ? statusSelect.value : '';

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 25px; text-align: center; color: #718096;">
                    <i class="fas fa-spinner fa-spin"></i> Fetching submission logs...
                </td>
            </tr>
        `;

        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/pos_settings.php?action=get_fbr_logs&branch_id=${branchId}&status=${encodeURIComponent(status)}&limit=50&${cb}`);
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();

            if (data.success) {
                const logs = data.logs || [];
                if (logs.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="8" style="padding: 30px; text-align: center; color: #718096;">
                                <i class="fas fa-inbox fa-2x" style="color: #cbd5e0; display: block; margin-bottom: 8px;"></i>
                                No FBR submission logs found for the selected filters.
                            </td>
                        </tr>
                    `;
                    return;
                }

                let html = '';
                logs.forEach(l => {
                    const rawStatus = (l.status || '').trim();
                    const hasValidFbrRef = Boolean(
                        l.fbr_invoice_number && 
                        l.fbr_invoice_number.trim() !== '' && 
                        l.fbr_invoice_number !== '—' && 
                        l.fbr_invoice_number !== 'Not Available' && 
                        l.fbr_invoice_number !== 'None'
                    );
                    const isSuccess = hasValidFbrRef || ['Submitted', 'Success', 'Accepted'].includes(rawStatus);
                    const isPending = !isSuccess && ['Pending Verification', 'TIMEOUT', 'Pending'].includes(rawStatus);
                    const isValidated = !isSuccess && rawStatus === 'Validated';

                    let badge;
                    let statusColor;
                    if (isSuccess) {
                        badge = '<span style="background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;"><i class="fas fa-check"></i> Submitted</span>';
                        statusColor = '#27ae60';
                    } else if (isPending) {
                        badge = '<span style="background: #fffaf0; color: #9c4221; border: 1px solid #feebc8; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;"><i class="fas fa-clock"></i> Pending</span>';
                        statusColor = '#dd6b20';
                    } else if (isValidated) {
                        badge = '<span style="background: #ebf8ff; color: #2b6cb0; border: 1px solid #bee3f8; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;"><i class="fas fa-check-double"></i> Validated</span>';
                        statusColor = '#2b6cb0';
                    } else {
                        badge = '<span style="background: #fff5f5; color: #9b2c2c; border: 1px solid #fed7d7; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;"><i class="fas fa-times"></i> Failed</span>';
                        statusColor = '#c53030';
                    }

                    const branchText = l.branch_name 
                        ? `${this.escapeHtml(l.branch_name)} <span style="font-family: monospace; color: #718096; font-size: 10px;">(${this.escapeHtml(l.branch_code || '')})</span>`
                        : 'Central / Default';

                    const fbrRef = l.fbr_invoice_number
                        ? `<span style="font-family: monospace; font-weight: bold; color: #2b6cb0;">${this.escapeHtml(l.fbr_invoice_number)}</span>`
                        : `<span style="color: #a0aec0;">—</span>`;

                    let msg = '—';
                    if (isSuccess) {
                        msg = '<span style="color: #27ae60;"><i class="fas fa-check-circle" style="font-size: 10px;"></i> Invoice transmitted & acknowledged</span>';
                    } else if (l.error_message) {
                        msg = this.escapeHtml(l.error_message);
                    } else if (isPending) {
                        msg = '<span style="color: #dd6b20;">Awaiting FBR confirmation</span>';
                    } else if (isValidated) {
                        msg = '<span style="color: #2b6cb0;">Pre-flight validation passed</span>';
                    }

                    html += `
                        <tr style="border-bottom: 1px solid #edf2f7;">
                            <td style="padding: 8px 10px; font-size: 11px; color: #4a5568;">${l.submission_time}</td>
                            <td style="padding: 8px 10px;">${branchText}</td>
                            <td style="padding: 8px 10px; font-weight: 600; color: #2d3748;">${this.escapeHtml(l.erp_invoice_no)}</td>
                            <td style="padding: 8px 10px; text-align: center;">
                                <span style="text-transform: uppercase; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #edf2f7; color: #4a5568;">${this.escapeHtml(l.environment)}</span>
                            </td>
                            <td style="padding: 8px 10px; font-family: monospace; font-size: 11px;">${this.escapeHtml(l.fbr_pos_id || '—')}</td>
                            <td style="padding: 8px 10px; text-align: center;">${badge}</td>
                            <td style="padding: 8px 10px;">${fbrRef}</td>
                            <td style="padding: 8px 10px; font-size: 11px; color: ${statusColor}; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(l.error_message || (isSuccess ? 'Invoice transmitted & acknowledged' : ''))}">
                                ${msg}
                            </td>
                        </tr>
                    `;
                });

                tbody.innerHTML = html;
            } else {
                tbody.innerHTML = `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #e53e3e;">Failed: ${data.error || 'Could not fetch logs'}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="padding: 20px; text-align: center; color: #e53e3e;">Network error loading logs.</td></tr>`;
        }
    },

    populateBranchLogFilters: function(branches) {
        const sel = document.getElementById('fbr_log_filter_branch');
        if (!sel || sel.options.length > 1) return;

        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.branch_id;
            opt.textContent = `${b.branch_name} (${b.branch_code})`;
            sel.appendChild(opt);
        });
    },

    escapeHtml: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // -------------------------------------------------------------
    // POS ITEM ASSIGNMENT
    // -------------------------------------------------------------
    posItems: [],
    posCategories: [],

    loadPOSItems: async function() {
        const tbody = document.getElementById('pos_items_tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 25px; text-align: center; color: #718096;">
                    <i class="fas fa-spinner fa-spin"></i> Loading ERP inventory items...
                </td>
            </tr>
        `;

        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/pos_settings.php?action=get_pos_items&${cb}`);
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();

            if (data.success) {
                this.posItems = data.items || [];
                this.posCategories = data.categories || [];

                // Filter toggle
                const chk = document.getElementById('pos_item_filter_enabled');
                if (chk) chk.checked = data.filter_enabled;
                this.onItemFilterToggle(data.filter_enabled);

                // Populate categories dropdown
                const catSel = document.getElementById('pos_items_filter_category');
                if (catSel) {
                    catSel.innerHTML = '<option value="">All Categories</option>';
                    this.posCategories.forEach(cat => {
                        const opt = document.createElement('option');
                        opt.value = cat;
                        opt.textContent = cat;
                        catSel.appendChild(opt);
                    });
                }

                this.updatePOSItemsSummary();
                this.filterPOSItemsList();
            } else {
                tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #e53e3e;">Failed: ${data.error || 'Could not load items'}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #e53e3e;">Network error loading inventory items.</td></tr>`;
        }
    },

    onItemFilterToggle: function(isChecked) {
        const helpText = document.getElementById('pos_filter_help_text');
        if (helpText) {
            if (isChecked) {
                helpText.innerHTML = '<strong style="color: #27ae60;"><i class="fas fa-filter"></i> Restriction Active:</strong> Only assigned/checked items below will appear in POS sale invoices.';
            } else {
                helpText.innerHTML = '<strong style="color: #718096;"><i class="fas fa-globe"></i> All Items Allowed:</strong> POS sale invoices will show all ERP inventory items.';
            }
        }
    },

    updatePOSItemsSummary: function() {
        const badge = document.getElementById('pos_items_summary_badge');
        if (!badge) return;
        const total = this.posItems.length;
        const assigned = this.posItems.filter(x => x.is_assigned === 1).length;
        badge.textContent = `${assigned} / ${total} Assigned`;
    },

    filterPOSItemsList: function() {
        const query = (document.getElementById('pos_items_search')?.value || '').toLowerCase().trim();
        const cat = document.getElementById('pos_items_filter_category')?.value || '';
        const status = document.getElementById('pos_items_filter_status')?.value || 'all';

        const filtered = this.posItems.filter(item => {
            if (cat && item.category_name !== cat) return false;
            if (status === 'assigned' && item.is_assigned !== 1) return false;
            if (status === 'unassigned' && item.is_assigned === 1) return false;
            if (query) {
                const code = (item.code || '').toLowerCase();
                const name = (item.name || '').toLowerCase();
                const combined = `${code} ${name}`;
                if (!combined.includes(query)) return false;
            }
            return true;
        });

        this.renderPOSItemsTable(filtered);
    },

    renderPOSItemsTable: function(itemsToRender) {
        const tbody = document.getElementById('pos_items_tbody');
        if (!tbody) return;

        const items = itemsToRender !== undefined ? itemsToRender : this.posItems;

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 30px; text-align: center; color: #a0aec0;">
                        <i class="fas fa-box-open fa-2x" style="color: #cbd5e0; display: block; margin-bottom: 8px;"></i>
                        No inventory items match the current filter.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        items.forEach(item => {
            const isAssigned = (item.is_assigned === 1);
            const badge = isAssigned
                ? '<span style="background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;"><i class="fas fa-check"></i> Assigned</span>'
                : '<span style="background: #edf2f7; color: #718096; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px;"><i class="fas fa-minus"></i> Hidden</span>';

            html += `
                <tr style="border-bottom: 1px solid #edf2f7; ${isAssigned ? 'background: #fcfdfd;' : ''}">
                    <td style="padding: 8px 12px; text-align: center;">
                        <input type="checkbox" ${isAssigned ? 'checked' : ''} onchange="window.POSSettings.toggleItemAssignment(${item.id}, this.checked)" style="cursor: pointer; width: 15px; height: 15px;">
                    </td>
                    <td style="padding: 8px 12px; font-family: monospace; font-weight: 700; color: #2b6cb0;">
                        ${this.escapeHtml(item.code)}
                    </td>
                    <td style="padding: 8px 12px; font-weight: 600; color: #2d3748;">
                        ${this.escapeHtml(item.name)}
                        ${item.brand_name ? `<span style="font-size: 10px; color: #718096; margin-left: 6px; font-weight: normal;">[${this.escapeHtml(item.brand_name)}]</span>` : ''}
                    </td>
                    <td style="padding: 8px 12px; color: #4a5568;">
                        <span style="background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${this.escapeHtml(item.category_name)}</span>
                    </td>
                    <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #1a202c;">
                        Rs ${parseFloat(item.selling_price || 0).toFixed(2)}
                    </td>
                    <td style="padding: 8px 12px; text-align: center;">
                        ${badge}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    toggleItemAssignment: function(itemId, isChecked) {
        const item = this.posItems.find(x => x.id === itemId);
        if (item) {
            item.is_assigned = isChecked ? 1 : 0;
            this.updatePOSItemsSummary();
            this.filterPOSItemsList();
        }
    },

    toggleSelectAllItems: function(isChecked) {
        const query = (document.getElementById('pos_items_search')?.value || '').toLowerCase().trim();
        const cat = document.getElementById('pos_items_filter_category')?.value || '';
        const status = document.getElementById('pos_items_filter_status')?.value || 'all';

        this.posItems.forEach(item => {
            if (cat && item.category_name !== cat) return;
            if (status === 'assigned' && item.is_assigned !== 1) return;
            if (status === 'unassigned' && item.is_assigned === 1) return;
            if (query) {
                const code = (item.code || '').toLowerCase();
                const name = (item.name || '').toLowerCase();
                const combined = `${code} ${name}`;
                if (!combined.includes(query)) return;
            }
            item.is_assigned = isChecked ? 1 : 0;
        });

        this.updatePOSItemsSummary();
        this.filterPOSItemsList();
    },

    bulkAssignFiltered: function(assign) {
        this.toggleSelectAllItems(assign);
    },

    savePOSItems: async function() {
        const filterEnabled = document.getElementById('pos_item_filter_enabled')?.checked ? 1 : 0;
        const assignedIds = this.posItems.filter(x => x.is_assigned === 1).map(x => x.id);

        const btn = document.querySelector('#sec-items .btn-save');
        let origHtml = '';
        if (btn) {
            origHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;
        }

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const compId = session.company_id || session.user?.company_id || 1;
            const res = await fetch(`api/pos_settings.php?action=save_pos_items&company_id=${compId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: compId,
                    filter_enabled: filterEnabled,
                    assigned_item_ids: assignedIds
                })
            });
            const data = await res.json();

            if (data.success) {
                if (window.showAlert) window.showAlert(data.message, 'success');
                else alert(data.message);

                // Live synchronization with POS Sale if POS module is open
                if (window.POSModule && typeof window.POSModule.fetchInventory === 'function') {
                    await window.POSModule.fetchInventory();
                }
                await this.loadPOSItems();
            } else {
                alert(data.error || 'Failed to save POS items');
            }
        } catch (e) {
            alert('Network error while saving POS items.');
        } finally {
            if (btn) {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }
        }
    },

    branchesData: [],

    loadBranchesAndWarehouses: async function() {
        try {
            const cb = `_cb=${Date.now()}`;
            // Load form data (users & warehouses)
            const fRes = await fetch(`api/branch_settings.php?action=get_form_data&${cb}`);
            if (fRes.ok) {
                const fdata = await fRes.json();
                if (fdata.success) {
                    const mSel = document.getElementById('branch_manager');
                    mSel.innerHTML = '<option value="">Select Manager</option>';
                    if(fdata.users) fdata.users.forEach(u => mSel.innerHTML += `<option value="${u.id}">${u.username}</option>`);

                    const wSel = document.getElementById('branch_warehouse');
                    wSel.innerHTML = '<option value="">Select Warehouse</option>';
                    if(fdata.warehouses) fdata.warehouses.forEach(w => wSel.innerHTML += `<option value="${w.id}">${w.name}</option>`);
                }
            }

            if (!window.allCustomers) {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const coaRes = await fetch(`api/maintain.php?action=get_all_customers&company_id=${coId}`);
                if(coaRes.ok) window.allCustomers = await coaRes.json();
            }

            // Load branches list
            this.loadBranchesList();
        } catch (e) {
            console.error("Error loading branch prerequisites:", e);
        }
    },

    loadBranchesList: async function() {
        const tbody = document.getElementById('branch_list_tbody');
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #999;">Loading...</td></tr>';
        
        try {
            const cb = `_cb=${Date.now()}`;
            const res = await fetch(`api/branch_settings.php?action=get_branches&${cb}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    this.branchesData = data.branches || [];
                    this.allErpBranches = this.branchesData;
                    if (this.branchesData.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #999;">No branches found.</td></tr>';
                        return;
                    }
                    
                    let html = '';
                    this.branchesData.forEach(b => {
                        let statusBadge = b.status === 'Active' 
                            ? '<span style="background: #2ecc71; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Active</span>' 
                            : '<span style="background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Inactive</span>';
                        
                        const fbrPos = b.fbr_pos_id ? this.escapeHtml(b.fbr_pos_id) : '';
                        const fbrIdent = b.fbr_identification_no ? this.escapeHtml(b.fbr_identification_no) : '';
                        let fbrDisplay = '<span style="color: #a0aec0; font-style: italic;">Not Set</span>';
                        if (fbrPos) {
                            fbrDisplay = `<span style="font-family: monospace; font-weight: 700; color: #2b6cb0;">${fbrPos}</span>`;
                            if (fbrIdent) {
                                fbrDisplay += ` <span style="font-family: monospace; font-size: 11px; background: #edf2f7; padding: 1px 6px; border-radius: 3px; color: #2d3748;">#${fbrIdent}</span>`;
                            }
                        }

                        let hoursDisplay = '<span style="color: #64748b; font-size: 11px;"><i class="fas fa-infinity" style="color:#10b981;"></i> 24/7 (Open)</span>';
                        if (b.opening_time && b.closing_time) {
                            const fmtTime = (t) => {
                                if (!t) return '';
                                const parts = t.split(':');
                                let h = parseInt(parts[0], 10);
                                const m = parts[1] || '00';
                                const ampm = h >= 12 ? 'PM' : 'AM';
                                h = h % 12 || 12;
                                return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
                            };
                            hoursDisplay = `<span style="font-size: 11px; font-weight: 600; color: #0f172a; background: #f1f5f9; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #e2e8f0;"><i class="far fa-clock" style="color: #0284c7;"></i> ${fmtTime(b.opening_time)} - ${fmtTime(b.closing_time)}</span>`;
                        }
                        if (b.off_day) {
                            hoursDisplay += ` <span style="font-size: 10.5px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px; border: 1px solid #fde68a;" title="Weekly Off Day"><i class="far fa-calendar-times" style="color: #d97706;"></i> Off: ${b.off_day}</span>`;
                        }

                        let geoDisplay = '';
                        if (b.enable_geofencing == 1) {
                            const rad = b.radius_meters || 100;
                            geoDisplay = `<span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #bae6fd;" title="Geofenced (${rad}m radius)"><i class="fas fa-map-marker-alt" style="color: #0284c7;"></i> Enabled (${rad}m)</span>`;
                        } else {
                            geoDisplay = `<span style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;" title="No location restrictions"><i class="fas fa-globe" style="color: #94a3b8;"></i> Unrestricted</span>`;
                        }

                        const safeBranchName = (b.branch_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        html += `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding: 8px;"><b>${b.branch_code}</b></td>
                                <td style="padding: 8px;">${b.branch_name}</td>
                                <td style="padding: 8px;">${hoursDisplay}</td>
                                <td style="padding: 8px;">${geoDisplay}</td>
                                <td style="padding: 8px;">${b.manager_name || '-'}</td>
                                <td style="padding: 8px;">${fbrDisplay}</td>
                                <td style="padding: 8px;">${statusBadge}</td>
                                <td style="padding: 8px; text-align: center; white-space: nowrap;">
                                    <button class="btn btn-primary btn-sm" onclick="window.POSSettings.editBranch(${b.id})" style="padding: 2px 7px; font-size: 11px; margin-right: 3px;" title="Edit Branch"><i class="fas fa-edit"></i> Edit</button>
                                    ${b.status === 'Active' 
                                        ? `<button class="btn btn-secondary btn-sm" onclick="window.POSSettings.deactivateBranch(${b.id}, '${safeBranchName}')" style="padding: 2px 7px; font-size: 11px; background:#e74c3c; border-color:#c0392b; color:#fff;" title="Deactivate Branch (Admin Password Required)"><i class="fas fa-ban"></i></button>` 
                                        : `<button class="btn btn-success btn-sm" onclick="window.POSSettings.activateBranch(${b.id})" style="padding: 2px 7px; font-size: 11px; background:#10b981; border-color:#059669; color:#fff;" title="Re-activate Branch"><i class="fas fa-check-circle"></i></button>`
                                    }
                                </td>
                            </tr>
                        `;
                    });
                    tbody.innerHTML = html;
                }
            }
            this.applyBranchButtonVisibility();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #e74c3c;">Failed to load branches.</td></tr>';
            this.applyBranchButtonVisibility();
        }
    },

    applyBranchButtonVisibility: async function() {
        let allowed = localStorage.getItem('pos_allow_add_branch');
        const btn = document.getElementById('pos_btn_add_new_branch');
        if (btn && allowed !== null) {
            btn.style.display = (allowed === '0') ? 'none' : 'inline-block';
        }

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/settings.php?action=get_setting&key=pos_allow_add_branch&company_id=${companyId}&_t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.value !== null && data.value !== undefined && data.value !== '') {
                    allowed = String(data.value);
                    localStorage.setItem('pos_allow_add_branch', allowed);
                    const updatedBtn = document.getElementById('pos_btn_add_new_branch');
                    if (updatedBtn) {
                        updatedBtn.style.display = (allowed === '0') ? 'none' : 'inline-block';
                    }
                }
            }
        } catch (e) {
            console.error("Error checking pos_allow_add_branch:", e);
        }
    },

    applyFbrTabVisibility: async function() {
        let allowed = localStorage.getItem('pos_allow_fbr_integration');
        const fbrTab = document.getElementById('posTabFbrIntegration') || document.querySelector('#posSettingsNav li[data-target="fbr"]');
        const secFbr = document.getElementById('sec-fbr');

        const updateVisibility = (isAllowed) => {
            if (fbrTab) {
                fbrTab.style.display = isAllowed ? '' : 'none';
            }
            if (!isAllowed && secFbr && secFbr.classList.contains('active')) {
                secFbr.classList.remove('active');
                if (fbrTab) fbrTab.classList.remove('active');
                const genTab = document.querySelector('#posSettingsNav li[data-target="general"]');
                const secGen = document.getElementById('sec-general');
                if (genTab) genTab.classList.add('active');
                if (secGen) secGen.classList.add('active');
            }
        };

        if (allowed !== null) {
            updateVisibility(allowed !== '0');
        }

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/settings.php?action=get_setting&key=pos_allow_fbr_integration&company_id=${companyId}&_t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.value !== null && data.value !== undefined && data.value !== '') {
                    allowed = String(data.value);
                    localStorage.setItem('pos_allow_fbr_integration', allowed);
                    updateVisibility(allowed !== '0');
                }
            }
        } catch (e) {
            console.error("Error checking pos_allow_fbr_integration:", e);
        }
    },

    filterCustomers: function(query) {
        const dd = document.getElementById('branch_customer_dropdown');
        if (!dd) return;
        query = query ? query.toLowerCase() : '';
        
        const customers = window.allCustomers || [];
        const matches = query ? customers.filter(c => c.name.toLowerCase().includes(query) || (c.code && c.code.toLowerCase().includes(query))) : customers.slice(0, 50);
        
        dd.innerHTML = '';
        if (matches.length === 0) {
            dd.innerHTML = '<div style="padding: 10px; color: #999; font-size:12px;">No customers found</div>';
        } else {
            matches.slice(0, 20).forEach(c => {
                const div = document.createElement('div');
                div.style.padding = '8px 10px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #eee';
                div.style.fontSize = '12px';
                div.innerHTML = `<b>${c.code || ''}</b> - ${c.name}`;
                div.onmouseover = () => div.style.background = '#f0f8ff';
                div.onmouseout = () => div.style.background = 'white';
                div.onclick = () => this.selectCustomer(c);
                dd.appendChild(div);
            });
        }
        dd.style.display = 'block';
    },

    selectCustomer: function(c) {
        const searchInput = document.getElementById('branch_default_customer_search');
        const hiddenInput = document.getElementById('branch_default_customer');
        const dd = document.getElementById('branch_customer_dropdown');
        
        if (searchInput && hiddenInput) {
            searchInput.value = c.code ? `${c.code} - ${c.name}` : c.name;
            hiddenInput.value = c.id;
        }
        if (dd) dd.style.display = 'none';
    },

    toggleGeofencingFields: function(enable) {
        const details = document.getElementById('branch_geofence_details');
        if (details) {
            details.style.display = enable ? 'block' : 'none';
        }
    },

    fetchCurrentGPS: function() {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }
        const btn = document.getElementById('btn_fetch_gps');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting GPS...';
            btn.disabled = true;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const acc = Math.round(position.coords.accuracy || 0);

                const latInput = document.getElementById('branch_latitude');
                const lngInput = document.getElementById('branch_longitude');
                if (latInput) latInput.value = lat.toFixed(7);
                if (lngInput) lngInput.value = lng.toFixed(7);

                if (btn) {
                    btn.innerHTML = origHtml;
                    btn.disabled = false;
                }
                const msg = `Shop location captured successfully!\nLatitude: ${lat.toFixed(7)}\nLongitude: ${lng.toFixed(7)}\nAccuracy: ±${acc}m`;
                if (window.showAlert) window.showAlert(msg, 'success');
                else alert(msg);
            },
            (err) => {
                if (btn) {
                    btn.innerHTML = origHtml;
                    btn.disabled = false;
                }
                let errText = "Could not get current location.";
                if (err.code === 1) errText = "Location access was denied. Please allow location permissions in your browser and try again.";
                else if (err.code === 2) errText = "Location unavailable. Please check GPS/Network connection.";
                else if (err.code === 3) errText = "Location request timed out. Please try again.";
                alert(errText);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    showBranchForm: function() {
        const allowed = localStorage.getItem('pos_allow_add_branch');
        if (allowed === '0') {
            if (window.showAlert) window.showAlert('Adding new branch is disabled in system settings.', 'warning');
            else alert('Adding new branch is disabled in system settings.');
            return;
        }
        document.getElementById('branch_list_view').style.display = 'none';
        document.getElementById('branch_form_view').style.display = 'block';
        document.getElementById('branch_form_title').textContent = 'Add New Branch';
        
        // Reset form
        document.getElementById('branch_id').value = '';
        document.getElementById('branch_code').value = '';
        document.getElementById('branch_name').value = '';
        const fbrPosInp = document.getElementById('branch_fbr_pos_id');
        if (fbrPosInp) fbrPosInp.value = '';
        const fbrIdentInp = document.getElementById('branch_fbr_ident_no');
        if (fbrIdentInp) fbrIdentInp.value = '';
        document.getElementById('branch_contact').value = '';
        document.getElementById('branch_invoice_series').value = '';
        document.getElementById('branch_address').value = '';
        document.getElementById('branch_manager').value = '';
        document.getElementById('branch_warehouse').value = '';
        document.getElementById('branch_default_customer').value = '';
        document.getElementById('branch_default_customer_search').value = '';
        const defOpen = (this.cachedSettings && this.cachedSettings.gen_opening_time) ? this.cachedSettings.gen_opening_time.substring(0, 5) : '';
        const defClose = (this.cachedSettings && this.cachedSettings.gen_closing_time) ? this.cachedSettings.gen_closing_time.substring(0, 5) : '';
        const defOff = (this.cachedSettings && this.cachedSettings.gen_off_day) ? this.cachedSettings.gen_off_day : '';
        if (document.getElementById('branch_opening_time')) document.getElementById('branch_opening_time').value = defOpen;
        if (document.getElementById('branch_closing_time')) document.getElementById('branch_closing_time').value = defClose;
        if (document.getElementById('branch_off_day')) document.getElementById('branch_off_day').value = defOff;

        // Reset Geofencing Fields
        const geoChk = document.getElementById('branch_enable_geofencing');
        if (geoChk) geoChk.checked = false;
        this.toggleGeofencingFields(false);
        if (document.getElementById('branch_latitude')) document.getElementById('branch_latitude').value = '';
        if (document.getElementById('branch_longitude')) document.getElementById('branch_longitude').value = '';
        if (document.getElementById('branch_radius_meters')) document.getElementById('branch_radius_meters').value = '100';
    },

    hideBranchForm: function() {
        document.getElementById('branch_form_view').style.display = 'none';
        document.getElementById('branch_list_view').style.display = 'block';
    },

    editBranch: function(id) {
        const branch = this.branchesData.find(b => b.id == id);
        if (!branch) return;
        
        document.getElementById('branch_id').value = branch.id;
        document.getElementById('branch_code').value = branch.branch_code;
        document.getElementById('branch_name').value = branch.branch_name;
        const fbrPosInp = document.getElementById('branch_fbr_pos_id');
        if (fbrPosInp) fbrPosInp.value = branch.fbr_pos_id || '';
        const fbrIdentInp = document.getElementById('branch_fbr_ident_no');
        if (fbrIdentInp) fbrIdentInp.value = branch.fbr_identification_no || '';
        document.getElementById('branch_contact').value = branch.contact_number || '';
        document.getElementById('branch_invoice_series').value = branch.invoice_series || '';
        document.getElementById('branch_address').value = branch.address || '';
        document.getElementById('branch_manager').value = branch.manager_id || '';
        document.getElementById('branch_warehouse').value = branch.default_warehouse_id || '';
        document.getElementById('branch_default_customer').value = branch.default_customer_id || '';
        document.getElementById('branch_status').value = branch.status || 'Active';
        if (document.getElementById('branch_opening_time')) {
            document.getElementById('branch_opening_time').value = branch.opening_time ? branch.opening_time.substring(0, 5) : '';
        }
        if (document.getElementById('branch_closing_time')) {
            document.getElementById('branch_closing_time').value = branch.closing_time ? branch.closing_time.substring(0, 5) : '';
        }
        if (document.getElementById('branch_off_day')) {
            document.getElementById('branch_off_day').value = branch.off_day || '';
        }

        // Set Geofencing Fields
        const isGeo = (branch.enable_geofencing == 1);
        const geoChk = document.getElementById('branch_enable_geofencing');
        if (geoChk) geoChk.checked = isGeo;
        this.toggleGeofencingFields(isGeo);
        if (document.getElementById('branch_latitude')) document.getElementById('branch_latitude').value = branch.latitude || '';
        if (document.getElementById('branch_longitude')) document.getElementById('branch_longitude').value = branch.longitude || '';
        if (document.getElementById('branch_radius_meters')) document.getElementById('branch_radius_meters').value = branch.radius_meters || '100';
        
        const searchInput = document.getElementById('branch_default_customer_search');
        if (searchInput) {
            if (branch.default_customer_id && window.allCustomers) {
                const c = window.allCustomers.find(x => x.id == branch.default_customer_id);
                searchInput.value = c ? (c.code ? `${c.code} - ${c.name}` : c.name) : '';
            } else {
                searchInput.value = '';
            }
        }
        
        document.getElementById('branch_form_title').textContent = 'Edit Branch: ' + branch.branch_name;
        document.getElementById('branch_list_view').style.display = 'none';
        document.getElementById('branch_form_view').style.display = 'block';
    },

    saveBranchForm: async function() {
        const id = document.getElementById('branch_id').value;
        const branch_code = document.getElementById('branch_code').value.trim();
        const branch_name = document.getElementById('branch_name').value.trim();
        
        if (!branch_code || !branch_name) {
            alert("Branch Code and Name are required!");
            return;
        }
        
        const payload = {
            id: id,
            branch_code: branch_code,
            branch_name: branch_name,
            fbr_pos_id: document.getElementById('branch_fbr_pos_id') ? document.getElementById('branch_fbr_pos_id').value.trim() : '',
            fbr_identification_no: document.getElementById('branch_fbr_ident_no') ? document.getElementById('branch_fbr_ident_no').value.trim() : '',
            contact_number: document.getElementById('branch_contact').value,
            invoice_series: document.getElementById('branch_invoice_series').value,
            address: document.getElementById('branch_address').value,
            manager_id: document.getElementById('branch_manager').value,
            default_warehouse_id: document.getElementById('branch_warehouse').value,
            default_customer_id: document.getElementById('branch_default_customer').value,
            status: document.getElementById('branch_status').value,
            opening_time: document.getElementById('branch_opening_time') ? document.getElementById('branch_opening_time').value : null,
            closing_time: document.getElementById('branch_closing_time') ? document.getElementById('branch_closing_time').value : null,
            off_day: document.getElementById('branch_off_day') ? document.getElementById('branch_off_day').value : null,
            enable_geofencing: document.getElementById('branch_enable_geofencing') ? (document.getElementById('branch_enable_geofencing').checked ? 1 : 0) : 0,
            latitude: document.getElementById('branch_latitude') ? document.getElementById('branch_latitude').value.trim() : null,
            longitude: document.getElementById('branch_longitude') ? document.getElementById('branch_longitude').value.trim() : null,
            radius_meters: document.getElementById('branch_radius_meters') ? document.getElementById('branch_radius_meters').value.trim() : 100
        };
        
        try {
            const res = await fetch('api/branch_settings.php?action=save_branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                if(window.showAlert) window.showAlert(data.message, "success");
                else alert(data.message);
                this.hideBranchForm();
                this.loadBranchesList();
                if (typeof this.loadBranchMappings === 'function') {
                    this.loadBranchMappings();
                }
            } else {
                alert(data.error || "Failed to save branch");
            }
        } catch (e) {
            alert("Network error saving branch.");
        }
    },

    pendingDeactivateBranchId: null,

    deactivateBranch: function(id, branchName) {
        this.pendingDeactivateBranchId = id;
        const modal = document.getElementById('modalBranchDeactivateAuth');
        const nameEl = document.getElementById('deact_branch_name');
        const pwdInput = document.getElementById('deact_admin_password');
        const errBox = document.getElementById('deact_error_msg');
        
        if (nameEl) nameEl.textContent = branchName || `ID #${id}`;
        if (pwdInput) {
            pwdInput.value = '';
            pwdInput.type = 'password';
        }
        const eye = document.getElementById('deact_pwd_eye');
        if (eye) eye.className = 'fas fa-eye';

        if (errBox) {
            errBox.style.display = 'none';
            const errText = document.getElementById('deact_error_text');
            if (errText) errText.textContent = '';
        }

        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => { if (pwdInput) pwdInput.focus(); }, 100);
        } else {
            const pwd = prompt(`Admin authorization required to deactivate branch "${branchName || id}".\nPlease enter current Admin Password:`);
            if (pwd) {
                this.executeDeactivateWithPassword(id, pwd);
            }
        }
    },

    closeDeactivateModal: function() {
        this.pendingDeactivateBranchId = null;
        const modal = document.getElementById('modalBranchDeactivateAuth');
        if (modal) modal.style.display = 'none';
    },

    toggleDeactPwdVisibility: function() {
        const pwdInput = document.getElementById('deact_admin_password');
        const eye = document.getElementById('deact_pwd_eye');
        if (!pwdInput) return;
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            if (eye) eye.className = 'fas fa-eye-slash';
        } else {
            pwdInput.type = 'password';
            if (eye) eye.className = 'fas fa-eye';
        }
    },

    confirmDeactivateBranch: async function() {
        const id = this.pendingDeactivateBranchId;
        const pwdInput = document.getElementById('deact_admin_password');
        const password = pwdInput ? pwdInput.value.trim() : '';
        const errBox = document.getElementById('deact_error_msg');
        const errText = document.getElementById('deact_error_text');
        const btn = document.getElementById('btn_confirm_deact_branch');

        if (!password) {
            if (errBox && errText) {
                errText.textContent = 'Please enter your Admin Password.';
                errBox.style.display = 'flex';
            } else {
                alert('Please enter your Admin Password.');
            }
            if (pwdInput) pwdInput.focus();
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        }

        try {
            const res = await fetch('api/branch_settings.php?action=delete_branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, admin_password: password })
            });
            const data = await res.json();
            if (data.success) {
                this.closeDeactivateModal();
                if (window.showAlert) {
                    window.showAlert(data.message || 'Branch deactivated successfully', 'success');
                } else {
                    alert(data.message || 'Branch deactivated successfully');
                }
                this.loadBranchesList();
                if (typeof this.loadBranchMappings === 'function') {
                    this.loadBranchMappings();
                }
            } else {
                if (errBox && errText) {
                    errText.textContent = data.error || 'Incorrect Admin Password!';
                    errBox.style.display = 'flex';
                } else {
                    alert(data.error || 'Failed to deactivate branch');
                }
                if (pwdInput) {
                    pwdInput.focus();
                    pwdInput.select();
                }
            }
        } catch (e) {
            if (errBox && errText) {
                errText.textContent = 'Network or server error during verification.';
                errBox.style.display = 'flex';
            } else {
                alert('Network error.');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-ban"></i> Deactivate Branch';
            }
        }
    },

    executeDeactivateWithPassword: async function(id, password) {
        try {
            const res = await fetch('api/branch_settings.php?action=delete_branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, admin_password: password })
            });
            const data = await res.json();
            if (data.success) {
                if (window.showAlert) {
                    window.showAlert(data.message || 'Branch deactivated successfully', 'success');
                } else {
                    alert(data.message || 'Branch deactivated successfully');
                }
                this.loadBranchesList();
                if (typeof this.loadBranchMappings === 'function') {
                    this.loadBranchMappings();
                }
            } else {
                alert(data.error || 'Failed to deactivate branch');
            }
        } catch (e) {
            alert('Network error.');
        }
    },

    activateBranch: async function(id) {
        if (!confirm('Are you sure you want to re-activate this branch?')) return;
        try {
            const res = await fetch('api/branch_settings.php?action=activate_branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
            const data = await res.json();
            if (data.success) {
                if (window.showAlert) {
                    window.showAlert(data.message || 'Branch activated successfully', 'success');
                } else {
                    alert(data.message || 'Branch activated successfully');
                }
                this.loadBranchesList();
                if (typeof this.loadBranchMappings === 'function') {
                    this.loadBranchMappings();
                }
            } else {
                alert(data.error || 'Failed to activate branch');
            }
        } catch (e) {
            alert('Network error activating branch.');
        }
    },

    testPrint: function() {
        const paperSize = document.getElementById('rec_paper_size')?.value || '80mm';
        const sampleData = {
            header: {
                pos_invoice_no: 'TEST-INV-001',
                serial_no: 1,
                invoice_date: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                customer_name: 'Walk-in (Cash) Customer',
                customer_mobile: '0300-1234567',
                customer_ntn_val: '1234567-8',
                branch_name: 'Main Branch POS',
                branch_code: 'MB-01',
                branch_address: 'Haripur, Pakistan',
                branch_contact: '0995-123456',
                branch_fbr_pos_id: document.getElementById('fbr_pos_id')?.value || 'POS-TEST-01',
                fbr_invoice_number: '101010101010101010',
                fbr_status: 'Submitted',
                fbr_submitted_at: new Date().toLocaleString(),
                created_by_username: 'Cashier 01',
                net_total: 4130,
                amount_received: 5000,
                additional_discount: 0,
                payment_terms: 'Cash'
            },
            items: [
                {
                    item_code: 'ITM-001',
                    item_title: 'Sample Item for FBR Test Print',
                    description: 'Demonstration line item with FBR tax compliance',
                    quantity: 2,
                    unit: 'pcs',
                    rate: 1750,
                    gross_amount: 3500,
                    sales_tax_amount: 630,
                    further_tax_amount: 0,
                    net_amount: 4130
                }
            ],
            settings: {
                rec_paper_size: paperSize,
                rec_header: document.getElementById('rec_header')?.value || 'Thank you for testing SoftifyX POS!',
                rec_footer: document.getElementById('rec_footer')?.value || 'Exchange within 7 days with original receipt.',
                rec_show_header: document.getElementById('rec_show_header')?.checked ? '1' : '0',
                rec_show_logo: document.getElementById('rec_show_logo')?.checked ? '1' : '0',
                rec_show_tax: document.getElementById('rec_show_tax')?.checked ? '1' : '0',
                rec_auto_print: document.getElementById('rec_auto_print')?.checked ? '1' : '0',
                rec_copies: document.getElementById('rec_copies')?.value || '1',
                fbr_pos_id: document.getElementById('fbr_pos_id')?.value || 'POS-TEST-01'
            },
            company: {
                name: 'SOFTIFYX STORE',
                address: 'Haripur, Pakistan',
                phone: '0995-000000',
                email: 'info@softifyx.com',
                ntn: '7654321-0',
                strn: '12-34-5678-901-23'
            }
        };

        if (window.POSRegisterModule && typeof window.POSRegisterModule.openModal === 'function') {
            window.POSRegisterModule.currentReceiptData = sampleData;
            window.POSRegisterModule.selectedInvoiceId = 0;
            const selectEl = document.getElementById('pos_print_paper_select');
            const targetFormat = (paperSize === 'A4') ? 'A4' : ((paperSize === '58mm') ? '58mm' : 'thermal');
            if (selectEl) selectEl.value = targetFormat;
            window.POSRegisterModule.renderPrintPreview(targetFormat);
            window.POSRegisterModule.openModal('posModalReceipt');
        } else {
            alert('Opening test print in new window...');
            const printWindow = window.open('', '_blank', 'width=500,height=700');
            printWindow.document.write('<h3>Test Print Successful</h3><p>Paper Size: ' + paperSize + '</p>');
            printWindow.document.close();
        }
    }
};

window.POSSettings.init();
