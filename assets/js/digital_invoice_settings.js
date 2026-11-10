/**
 * SoftifyX ERP - Digital Invoice Integration Settings Controller
 * Handles FBR / PRAL Digital Invoicing API Configuration, Validation & Logs
 */
window.DigitalInvoiceSettings = (function() {
    let currentSettings = {};
    let taxpayerData = {};
    let branchesData = [];
    let pendingEnv = 'sandbox';

    function getCompanyId() {
        try {
            if (window.selectedCompanyId) return window.selectedCompanyId;
            if (window.activeCompanyId) return window.activeCompanyId;
            if (window.currentCompanyId) return window.currentCompanyId;
            if (window.currentCompany && window.currentCompany.id) return window.currentCompany.id;
            const sess = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            if (sess.company_id) return sess.company_id;
            const curCo = localStorage.getItem('company_id');
            if (curCo) return parseInt(curCo, 10);
            return 1;
        } catch (e) {
            return 1;
        }
    }

    function applyWindowHeaderStyles() {
        try {
            const root = document.getElementById('digitalInvoiceSettingsContainer');
            if (!root) return;
            const container = root.closest('.modal-container');
            // Skip resizing if embedded inside System Settings
            if (root.closest('.modal-body[data-module="System Settings"]') || root.closest('#sys_tab_digital_invoice_wrapper') || root.closest('#systemSettingsContainer')) {
                return;
            }

            container.classList.add('modal-digital-invoice');
            container.style.setProperty('padding', '0', 'important');
            container.style.setProperty('max-width', '980px', 'important');
            container.style.setProperty('width', '95%', 'important');
            container.style.setProperty('height', '90vh', 'important');
            container.style.setProperty('max-height', '90vh', 'important');
            container.style.setProperty('border-radius', '8px', 'important');
            container.style.setProperty('overflow', 'hidden', 'important');
            container.style.setProperty('display', 'flex', 'important');
            container.style.setProperty('flex-direction', 'column', 'important');

            const curTheme = (window.getCurrentERPTheme && window.getCurrentERPTheme()) || {};
            const primary = curTheme.primary || 'var(--theme-primary, #1F4E79)';
            const accent = curTheme.accent || 'var(--theme-accent, #F5A623)';

            const header = container.querySelector('.modal-header');
            if (header) {
                header.style.setProperty('margin', '0', 'important');
                header.style.setProperty('border-radius', '6px 6px 0 0', 'important');
                header.style.setProperty('padding', '3px 12px', 'important');
                header.style.setProperty('height', '32px', 'important');
                header.style.setProperty('box-sizing', 'border-box', 'important');
                header.style.setProperty('background', primary, 'important');
                header.style.setProperty('border-bottom', '2px solid ' + accent, 'important');
                header.style.setProperty('flex-shrink', '0', 'important');
                header.style.setProperty('display', 'flex', 'important');
                header.style.setProperty('align-items', 'center', 'important');
                header.style.setProperty('justify-content', 'space-between', 'important');
            }

            const modalBody = container.querySelector('.modal-body');
            if (modalBody) {
                modalBody.style.setProperty('padding', '0', 'important');
                modalBody.style.setProperty('margin', '0', 'important');
                modalBody.style.setProperty('overflow', 'hidden', 'important');
                modalBody.style.setProperty('flex', '1', 'important');
                modalBody.style.setProperty('min-height', '0', 'important');
                modalBody.style.setProperty('display', 'flex', 'important');
                modalBody.style.setProperty('flex-direction', 'column', 'important');
            }

            if (window.applyERPThemeToElement) {
                window.applyERPThemeToElement(container, curTheme);
            }
        } catch (e) {
            console.error('Error applying window header styles:', e);
        }
    }

    async function init() {
        applyWindowHeaderStyles();
        await Promise.all([
            loadSettings(),
            loadTaxpayerProfile()
        ]);
    }

    function switchTab(tabId) {
        const panels = document.querySelectorAll('#fbr_tabs_content_container .fbr-tab-panel');
        panels.forEach(p => p.style.display = 'none');

        const activePanel = document.getElementById(tabId);
        if (activePanel) activePanel.style.display = 'block';

        const buttons = document.querySelectorAll('#fbr_settings_tabs_bar .fbr-tab-btn');
        buttons.forEach(b => {
            if (b.getAttribute('data-tab') === tabId) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        if (tabId === 'tab_taxpayer_details') {
            loadTaxpayerProfile(false);
        }
    }

    async function loadSettings() {
        const companyId = getCompanyId();
        try {
            const res = await fetch(`api/digital_invoice_settings.php?action=get_settings&company_id=${companyId}&_cb=${Date.now()}`);
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                console.error('Failed to parse get_settings response:', text);
                return;
            }
            if (data.success && data.settings) {
                currentSettings = data.settings;
                populateSettingsForm(data.settings);
                updateStatusBadges(data.settings);
            }
        } catch (e) {
            console.error('Error loading digital invoice settings:', e);
        }
    }

    function populateSettingsForm(s) {
        // Tab 1: API Connection
        const selProvider = document.getElementById('fbr_provider');
        if (selProvider) selProvider.value = s.provider || 'PRAL';

        const env = (s.environment || 'sandbox').toLowerCase();
        const radEnv = document.querySelector(`input[name="fbr_env"][value="${env}"]`);
        if (radEnv) radEnv.checked = true;
        updateEnvCardHighlight(env);

        applyEnvironmentFields(env, s);

        const inputClientId = document.getElementById('fbr_client_id');
        if (inputClientId) inputClientId.value = s.client_id || '';

        const inputClientSecret = document.getElementById('fbr_client_secret');
        if (inputClientSecret) inputClientSecret.value = s.client_secret_masked || '';

        // Tab 4: Advanced
        const inTimeout = document.getElementById('fbr_timeout');
        if (inTimeout) inTimeout.value = s.request_timeout || 30;

        const inRetries = document.getElementById('fbr_retry_attempts');
        if (inRetries) inRetries.value = s.retry_attempts || 3;

        const selLogLevel = document.getElementById('fbr_log_level');
        if (selLogLevel) selLogLevel.value = s.log_level || 'all';

        const chkAutoRetry = document.getElementById('fbr_auto_retry');
        if (chkAutoRetry) chkAutoRetry.checked = s.auto_retry == 1;

        const chkLogging = document.getElementById('fbr_enable_logging');
        if (chkLogging) chkLogging.checked = s.enable_logging == 1;

        const chkDup = document.getElementById('fbr_duplicate_protection');
        if (chkDup) chkDup.checked = s.duplicate_protection == 1;

        handleProviderChange();
    }

    async function loadTaxpayerProfile(showFeedback = false) {
        const companyId = getCompanyId();
        try {
            const res = await fetch(`api/digital_invoice_settings.php?action=get_taxpayer_profile&company_id=${companyId}&_cb=${Date.now()}`);
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                console.error('Failed to parse get_taxpayer_profile response:', text);
                if (showFeedback) alert('Failed to read taxpayer data: ' + text.substring(0, 100));
                return;
            }
            if (data.success) {
                taxpayerData = data.taxpayer || {};
                branchesData = data.branches || [];

                // Taxpayer fields
                const nameEl = document.getElementById('fbr_taxpayer_name');
                if (nameEl) nameEl.value = taxpayerData.name || '';

                const ntnEl = document.getElementById('fbr_taxpayer_ntn');
                if (ntnEl) ntnEl.value = taxpayerData.ntn || '';

                const strnEl = document.getElementById('fbr_taxpayer_strn');
                if (strnEl) strnEl.value = taxpayerData.strn || '';

                const refEl = document.getElementById('fbr_reg_ref');
                if (refEl) refEl.value = taxpayerData.fbr_reg_ref || 'DI-001';

                const addrEl = document.getElementById('fbr_taxpayer_address');
                if (addrEl) addrEl.value = taxpayerData.address || '';

                const phoneEl = document.getElementById('fbr_taxpayer_phone');
                if (phoneEl) phoneEl.value = taxpayerData.phone || '';

                const emailEl = document.getElementById('fbr_taxpayer_email');
                if (emailEl) emailEl.value = taxpayerData.email || '';

                // Render Branches Table if present
                renderBranchesTable(branchesData);

                if (showFeedback) {
                    alert('Taxpayer profile loaded successfully from ERP Company details.');
                }
            } else if (showFeedback) {
                alert('Taxpayer profile warning: ' + (data.error || 'No details found.'));
            }
        } catch (e) {
            console.error('Error loading taxpayer profile:', e);
            if (showFeedback) alert('Error loading taxpayer profile: ' + e.message);
        }
    }

    function renderBranchesTable(branches) {
        const tbody = document.getElementById('fbr_branches_tbody');
        if (!tbody) return;

        if (!branches || branches.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 15px; color: #64748b;">No active ERP branches registered. Default main entity profile will be utilized.</td></tr>`;
            return;
        }

        let html = '';
        branches.forEach((b, index) => {
            html += `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 8px 10px; font-weight: 700; color: #1e293b;">
                    <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${escapeHtml(b.branch_code || 'N/A')}</span>
                </td>
                <td style="padding: 8px 10px; color: #334155;">
                    <div style="font-weight: 600;">${escapeHtml(b.branch_name || 'Main')}</div>
                    <div style="font-size: 11px; color: #64748b;">${escapeHtml(b.address || 'Standard Location')}</div>
                </td>
                <td style="padding: 8px 10px;">
                    <input type="text" class="form-control fbr-branch-pos-input" data-branch-id="${b.branch_id}" value="${escapeHtml(b.fbr_pos_id || '')}" placeholder="e.g. POS-01" style="height: 28px; font-size: 11.5px; width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px;">
                </td>
                <td style="padding: 8px 10px;">
                    <input type="text" class="form-control fbr-branch-code-input" data-branch-id="${b.branch_id}" value="${escapeHtml(b.fbr_branch_code || b.branch_code || '')}" placeholder="Branch Code" style="height: 28px; font-size: 11.5px; width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px;">
                </td>
                <td style="padding: 8px 10px; text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10.5px; font-weight: 700; background: #dcfce7; color: #166534;">
                        Active
                    </span>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }

    function getStatusBadgeStyle(status) {
        switch (status) {
            case 'Connected':
            case 'Verified':
            case 'Reachable':
            case 'Passed':
            case 'Posted':
            case 'Configured':
                return { bg: '#dcfce7', border: '#86efac', color: '#15803d', icon: 'fa-check-circle' };
            case 'Failed':
            case 'Authentication Failed':
            case 'Server Unreachable':
            case 'Unreachable':
            case 'Endpoint Invalid':
            case 'Rejected':
                return { bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c', icon: 'fa-times-circle' };
            case 'Unable to Verify':
            case 'Saved — Authentication Not Verified':
            case 'Unknown / Requires Reconciliation':
                return { bg: '#fef3c7', border: '#fcd34d', color: '#b45309', icon: 'fa-exclamation-triangle' };
            case 'Configured / Not Tested':
                return { bg: '#e0f2fe', border: '#7dd3fc', color: '#0369a1', icon: 'fa-info-circle' };
            default: // Not Tested, Not Configured, Not Submitted
                return { bg: '#f1f5f9', border: '#cbd5e1', color: '#64748b', icon: 'fa-minus-circle' };
        }
    }

    function applyStatusTag(el, status) {
        if (!el) return;
        const style = getStatusBadgeStyle(status);
        el.innerText = status || 'Not Tested';
        el.style.background = style.bg;
        el.style.borderColor = style.border;
        el.style.color = style.color;
    }

    function updateStatusBadges(s) {
        const topBadge = document.getElementById('fbr_top_status_badge');
        const topDot = document.getElementById('fbr_top_status_dot');
        const topText = document.getElementById('fbr_top_status_text');
        const topEnvText = document.getElementById('fbr_top_env_text');
        const topEnvBadge = document.getElementById('fbr_top_env_badge');
        const topLastTest = document.getElementById('fbr_top_last_test_container');
        const topLastTime = document.getElementById('fbr_top_last_test_time');

        // Resolve 5 separate verification dimensions
        const configSt = s.config_status || (s.connection_status === 'Not Configured' ? 'Not Configured' : 'Configured');
        const connSt = s.server_connectivity || 'Not Tested';
        const authSt = s.auth_status || 'Not Tested';
        const valSt = s.invoice_validation_status || s.sample_validation_status || 'Not Tested';
        const subSt = s.invoice_submission_status || 'Not Submitted';

        // Overall status resolution - strictly verified
        let st = s.overall_status || s.connection_status || 'Not Configured';
        if (st === 'Connected' && authSt !== 'Verified') {
            st = 'Saved — Authentication Not Verified';
        }
        if (topText) topText.innerText = st;

        const mainStyle = getStatusBadgeStyle(st);
        if (topBadge) {
            topBadge.style.background = mainStyle.bg;
            topBadge.style.borderColor = mainStyle.border;
            topBadge.style.color = mainStyle.color;
        }
        if (topDot) topDot.style.background = mainStyle.color;

        // Environment
        const env = (s.environment || 'sandbox').toLowerCase();
        if (topEnvText) topEnvText.innerText = env === 'production' ? 'Production (Live)' : 'Sandbox Mode';
        if (topEnvBadge) {
            if (env === 'production') {
                topEnvBadge.style.background = 'rgba(220, 38, 38, 0.2)';
                topEnvBadge.style.borderColor = 'rgba(220, 38, 38, 0.5)';
                topEnvBadge.style.color = '#dc2626';
            } else {
                topEnvBadge.style.background = 'rgba(59, 130, 246, 0.2)';
                topEnvBadge.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                topEnvBadge.style.color = '#2563eb';
            }
        }

        // Diagnostics Card (Tab 1)
        const diagStatus = document.getElementById('fbr_diag_status');
        if (diagStatus) {
            diagStatus.innerText = st;
            diagStatus.style.background = mainStyle.bg;
            diagStatus.style.borderColor = mainStyle.border;
            diagStatus.style.color = mainStyle.color;
        }

        // 5 Breakdown Badges (Tab 1)
        applyStatusTag(document.getElementById('fbr_stat_config'), configSt);
        applyStatusTag(document.getElementById('fbr_stat_connectivity'), connSt);
        applyStatusTag(document.getElementById('fbr_stat_auth'), authSt);
        applyStatusTag(document.getElementById('fbr_stat_validation'), valSt);
        applyStatusTag(document.getElementById('fbr_stat_submission'), subSt);

        const diagEnv = document.getElementById('fbr_diag_env');
        if (diagEnv) {
            diagEnv.innerText = env === 'production' ? 'Production (Live)' : 'Sandbox';
            diagEnv.style.color = env === 'production' ? '#dc2626' : '#2563eb';
        }

        const testTime = s.last_connection_test || s.last_test_time;
        const diagLast = document.getElementById('fbr_diag_last_test');
        if (diagLast) diagLast.innerText = testTime || 'Never Tested';

        const diagCode = document.getElementById('fbr_diag_http_code');
        if (diagCode) diagCode.innerText = s.last_response_code ? `HTTP ${s.last_response_code}` : (s.http_code ? `HTTP ${s.http_code}` : '--');

        const diagLatency = document.getElementById('fbr_diag_latency');
        if (diagLatency) diagLatency.innerText = (s.latency_ms !== undefined && s.latency_ms !== null) ? `${s.latency_ms} ms` : (s.response_time_ms ? `${s.response_time_ms} ms` : '-- ms');

        if (testTime) {
            if (topLastTest) topLastTest.style.display = 'flex';
            if (topLastTime) topLastTime.innerText = testTime;
        }

        // Diagnostic Notice
        const noticeEl = document.getElementById('fbr_diag_notice');
        if (noticeEl) {
            if (st === 'Endpoint Invalid') {
                noticeEl.style.display = 'block';
                noticeEl.style.background = '#fef2f2';
                noticeEl.style.color = '#991b1b';
                noticeEl.style.border = '1px solid #fecaca';
                noticeEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>Endpoint Invalid:</strong> The configured URL is invalid or does not use HTTPS.';
            } else if (st === 'Authentication Failed') {
                noticeEl.style.display = 'block';
                noticeEl.style.background = '#fef2f2';
                noticeEl.style.color = '#991b1b';
                noticeEl.style.border = '1px solid #fecaca';
                noticeEl.innerHTML = '<i class="fas fa-lock"></i> <strong>Authentication Failed:</strong> The token was rejected by FBR API. Please verify Bearer token.';
            } else if (st === 'Saved — Authentication Not Verified') {
                noticeEl.style.display = 'block';
                noticeEl.style.background = '#fffbeb';
                noticeEl.style.color = '#92400e';
                noticeEl.style.border = '1px solid #fde68a';
                noticeEl.innerHTML = '<i class="fas fa-info-circle"></i> <strong>Saved — Authentication Not Verified:</strong> Settings saved. Click <em>Test Connection</em> for verification.';
            } else {
                noticeEl.style.display = 'none';
            }
        }

        // Tab 3: 5 Status Cards
        const cardCfg = document.getElementById('fbr_test_card_config');
        if (cardCfg) {
            const cStyle = getStatusBadgeStyle(configSt);
            cardCfg.innerHTML = `<i class="fas ${cStyle.icon}" style="font-size: 11px; margin-right: 4px;"></i> ${configSt}`;
            cardCfg.style.color = cStyle.color;
        }

        const cardConn = document.getElementById('fbr_test_card_connectivity');
        if (cardConn) {
            const cnStyle = getStatusBadgeStyle(connSt);
            cardConn.innerHTML = `<i class="fas ${cnStyle.icon}" style="font-size: 11px; margin-right: 4px;"></i> ${connSt}`;
            cardConn.style.color = cnStyle.color;
        }
        const cardConnDate = document.getElementById('fbr_test_conn_date');
        if (cardConnDate) cardConnDate.innerText = testTime ? `Last tested: ${testTime}` : 'No recent test';

        const cardAuth = document.getElementById('fbr_test_card_auth');
        if (cardAuth) {
            const aStyle = getStatusBadgeStyle(authSt);
            cardAuth.innerHTML = `<i class="fas ${aStyle.icon}" style="font-size: 11px; margin-right: 4px;"></i> ${authSt}`;
            cardAuth.style.color = aStyle.color;
        }

        const cardVal = document.getElementById('fbr_test_card_validation');
        if (cardVal) {
            const vStyle = getStatusBadgeStyle(valSt);
            cardVal.innerHTML = `<i class="fas ${vStyle.icon}" style="font-size: 11px; margin-right: 4px;"></i> ${valSt}`;
            cardVal.style.color = vStyle.color;
        }
        const cardValDate = document.getElementById('fbr_test_val_date');
        if (cardValDate) cardValDate.innerText = s.last_validation_test ? `Validated: ${s.last_validation_test}` : 'JSON Schema & tax check';

        const cardSub = document.getElementById('fbr_test_card_submission');
        if (cardSub) {
            const sStyle = getStatusBadgeStyle(subSt);
            cardSub.innerHTML = `<i class="fas ${sStyle.icon}" style="font-size: 11px; margin-right: 4px;"></i> ${subSt}`;
            cardSub.style.color = sStyle.color;
        }

        const cardCode = document.getElementById('fbr_test_code_card');
        if (cardCode) cardCode.innerText = s.last_response_code ? `HTTP ${s.last_response_code}` : (s.http_code ? `HTTP ${s.http_code}` : '--');

        const cardLat = document.getElementById('fbr_test_latency_card');
        if (cardLat) cardLat.innerText = (s.latency_ms !== undefined && s.latency_ms !== null) ? `Latency: ${s.latency_ms} ms` : (s.response_time_ms ? `Latency: ${s.response_time_ms} ms` : 'Latency: -- ms');
    }

    function handleProviderChange() {
        const provider = document.getElementById('fbr_provider')?.value || 'PRAL';
        const oauthBox = document.getElementById('fbr_oauth_credentials_container');
        if (oauthBox) {
            // PRAL mainly uses Bearer Token. Other licensed integrators may require OAuth Client ID & Secret
            oauthBox.style.display = (provider === 'PRAL') ? 'none' : 'grid';
        }
    }

    function applyEnvironmentFields(env, s) {
        const settings = s || currentSettings || {};
        const isProd = (env === 'production');

        const inVal = document.getElementById('fbr_validate_url');
        const inPost = document.getElementById('fbr_post_url');
        const inBase = document.getElementById('fbr_base_url');
        const inToken = document.getElementById('fbr_api_token');
        const hint = document.getElementById('fbr_token_hint');

        // Only set values if settings object (s) was loaded from database or user already typed
        // Do NOT inject default URLs into boxes so boxes stay empty if user leaves them blank
        if (s) {
            if (inVal) inVal.value = s.api_validate_url || '';
            if (inPost) inPost.value = s.api_post_url || '';
            if (inBase) inBase.value = s.api_base_url || '';
        }

        if (isProd) {
            const prodToken = settings.api_token_production_masked || (settings.environment === 'production' ? settings.api_token_masked : '');
            if (inToken) inToken.value = prodToken || '';
            if (hint) {
                if (settings.has_token_production || (settings.environment === 'production' && settings.has_token)) {
                    hint.innerHTML = '<span style="color:#dc2626; font-weight:600;"><i class="fas fa-shield-alt"></i> Production Token configured & securely masked.</span> Re-enter only if updating.';
                } else {
                    hint.innerHTML = '<span style="color:#d97706; font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Production Token not configured.</span> Enter production Bearer token.';
                }
            }
        } else {
            const sbToken = settings.api_token_sandbox_masked || (settings.environment === 'sandbox' ? settings.api_token_masked : '');
            if (inToken) inToken.value = sbToken || '';
            if (hint) {
                if (settings.has_token_sandbox || (settings.environment === 'sandbox' && settings.has_token)) {
                    hint.innerHTML = '<span style="color:#16a34a; font-weight:600;"><i class="fas fa-shield-alt"></i> Sandbox Token configured & securely masked.</span> Re-enter only if updating.';
                } else {
                    hint.innerHTML = '<span style="color:#2563eb; font-weight:600;"><i class="fas fa-info-circle"></i> Sandbox Token.</span> Enter sandbox Bearer token.';
                }
            }
        }
    }

    function handleEnvChange(selectedEnv) {
        if (selectedEnv === 'production') {
            pendingEnv = 'production';
            const modal = document.getElementById('fbr_prod_warning_modal');
            if (modal) modal.style.display = 'flex';
        } else {
            pendingEnv = 'sandbox';
            updateEnvCardHighlight('sandbox');
            applyEnvironmentFields('sandbox');
        }
    }

    function confirmProductionSwitch() {
        const modal = document.getElementById('fbr_prod_warning_modal');
        if (modal) modal.style.display = 'none';

        const radProd = document.querySelector('input[name="fbr_env"][value="production"]');
        if (radProd) radProd.checked = true;

        updateEnvCardHighlight('production');
        applyEnvironmentFields('production');
    }

    function cancelProductionSwitch() {
        const modal = document.getElementById('fbr_prod_warning_modal');
        if (modal) modal.style.display = 'none';

        const radSand = document.querySelector('input[name="fbr_env"][value="sandbox"]');
        if (radSand) radSand.checked = true;

        updateEnvCardHighlight('sandbox');
        applyEnvironmentFields('sandbox');
    }

    function updateEnvCardHighlight(env) {
        const sandCard = document.getElementById('fbr_env_label_sandbox');
        const prodCard = document.getElementById('fbr_env_label_production');
        if (env === 'production') {
            if (prodCard) {
                prodCard.style.borderColor = '#dc2626';
                prodCard.style.background = '#fef2f2';
            }
            if (sandCard) {
                sandCard.style.borderColor = '#cbd5e1';
                sandCard.style.background = '#f8fafc';
            }
        } else {
            if (sandCard) {
                sandCard.style.borderColor = '#3b82f6';
                sandCard.style.background = '#eff6ff';
            }
            if (prodCard) {
                prodCard.style.borderColor = '#cbd5e1';
                prodCard.style.background = '#f8fafc';
            }
        }
    }

    function resetDefaultUrl() {
        const env = document.querySelector('input[name="fbr_env"]:checked')?.value || 'sandbox';
        const inVal = document.getElementById('fbr_validate_url');
        const inPost = document.getElementById('fbr_post_url');
        const inBase = document.getElementById('fbr_base_url');

        if (env === 'production') {
            if (inVal) inVal.value = 'https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata';
            if (inPost) inPost.value = 'https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata';
        } else {
            if (inVal) inVal.value = 'https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb';
            if (inPost) inPost.value = 'https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb';
        }
        if (inBase) inBase.value = 'https://gw.fbr.gov.pk/di_data/v1/di';
    }

    function clearEndpoints() {
        const inVal = document.getElementById('fbr_validate_url');
        const inPost = document.getElementById('fbr_post_url');
        const inBase = document.getElementById('fbr_base_url');
        if (inVal) inVal.value = '';
        if (inPost) inPost.value = '';
        if (inBase) inBase.value = '';
    }

    function togglePasswordVisibility(fieldId, btn) {
        const el = document.getElementById(fieldId);
        if (!el) return;
        if (el.type === 'password') {
            el.type = 'text';
            if (btn) btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            el.type = 'password';
            if (btn) btn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }

    function gatherFormData() {
        const companyId = getCompanyId();
        const provider = document.getElementById('fbr_provider')?.value || 'PRAL';
        const providerName = (provider === 'PRAL') ? 'Pakistan Revenue Automation Limited (PRAL)' : 'Other Approved Licensed Integrator';
        const env = document.querySelector('input[name="fbr_env"]:checked')?.value || 'sandbox';
        
        const validateUrl = (document.getElementById('fbr_validate_url')?.value || '').trim();
        const postUrl = (document.getElementById('fbr_post_url')?.value || '').trim();
        let baseUrl = (document.getElementById('fbr_base_url')?.value || '').trim();

        if (validateUrl) {
            try {
                const u = new URL(validateUrl);
                const lastSlash = u.pathname.lastIndexOf('/');
                baseUrl = u.origin + (lastSlash > 0 ? u.pathname.substring(0, lastSlash) : u.pathname);
            } catch (e) {
                baseUrl = validateUrl;
            }
        }
        
        const token = (document.getElementById('fbr_api_token')?.value || '').trim();
        const clientId = (document.getElementById('fbr_client_id')?.value || '').trim();
        const clientSecret = (document.getElementById('fbr_client_secret')?.value || '').trim();

        // Taxpayer fields
        const name = (document.getElementById('fbr_taxpayer_name')?.value || '').trim();
        const ntn = (document.getElementById('fbr_taxpayer_ntn')?.value || '').trim().toUpperCase();
        const strn = (document.getElementById('fbr_taxpayer_strn')?.value || '').trim();
        const address = (document.getElementById('fbr_taxpayer_address')?.value || '').trim();
        const phone = (document.getElementById('fbr_taxpayer_phone')?.value || '').trim();
        const email = (document.getElementById('fbr_taxpayer_email')?.value || '').trim();
        const regRef = (document.getElementById('fbr_reg_ref')?.value || 'DI-001').trim();

        // Branch mapping (gather if table present, or preserve existing)
        let branchMappings = [];
        const posInputs = document.querySelectorAll('.fbr-branch-pos-input');
        const codeInputs = document.querySelectorAll('.fbr-branch-code-input');

        if (posInputs.length > 0) {
            posInputs.forEach((inp, idx) => {
                const bId = inp.getAttribute('data-branch-id');
                const posVal = inp.value.trim();
                const codeVal = codeInputs[idx] ? codeInputs[idx].value.trim() : '';
                branchMappings.push({
                    branch_id: bId,
                    fbr_pos_id: posVal,
                    fbr_branch_code: codeVal,
                    status: 'Active'
                });
            });
        } else if (currentSettings.branch_mapping) {
            try {
                branchMappings = typeof currentSettings.branch_mapping === 'string' ? JSON.parse(currentSettings.branch_mapping) : currentSettings.branch_mapping;
            } catch (e) {
                branchMappings = [];
            }
        }

        // Advanced
        const timeout = parseInt(document.getElementById('fbr_timeout')?.value || '30', 10);
        const retries = parseInt(document.getElementById('fbr_retry_attempts')?.value || '3', 10);
        const logLevel = document.getElementById('fbr_log_level')?.value || 'all';
        const autoRetry = document.getElementById('fbr_auto_retry')?.checked ? 1 : 0;
        const enableLogging = document.getElementById('fbr_enable_logging')?.checked ? 1 : 0;
        const dupProtection = document.getElementById('fbr_duplicate_protection')?.checked ? 1 : 0;

        const payload = {
            company_id: companyId,
            provider,
            provider_name: providerName,
            environment: env,
            api_validate_url: validateUrl,
            api_post_url: postUrl,
            api_base_url: baseUrl,
            api_token: token,
            client_id: clientId,
            client_secret: clientSecret,
            taxpayer_name: name,
            taxpayer_ntn: ntn,
            taxpayer_strn: strn,
            taxpayer_address: address,
            taxpayer_phone: phone,
            taxpayer_email: email,
            fbr_reg_ref: regRef,
            branch_mapping: branchMappings,
            request_timeout: timeout,
            retry_attempts: retries,
            log_level: logLevel,
            auto_retry: autoRetry,
            enable_logging: enableLogging,
            duplicate_protection: dupProtection
        };

        if (env === 'production') {
            payload.api_token_production = token;
        } else {
            payload.api_token_sandbox = token;
        }

        return payload;
    }

    async function saveSettings() {
        const ntnEl = document.getElementById('fbr_taxpayer_ntn');
        if (ntnEl) {
            ntnEl.value = ntnEl.value.trim().toUpperCase();
        }
        const payload = gatherFormData();

        const btnSave1 = document.getElementById('btn_bottom_save_settings');
        const btnSave2 = document.getElementById('btn_tab_save_settings');
        const origText1 = btnSave1 ? btnSave1.innerHTML : '';
        const origText2 = btnSave2 ? btnSave2.innerHTML : '';

        if (btnSave1) { btnSave1.disabled = true; btnSave1.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
        if (btnSave2) { btnSave2.disabled = true; btnSave2.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

        try {
            const res = await fetch('api/digital_invoice_settings.php?action=save_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (jsonErr) {
                console.error('Server non-JSON response:', text);
                alert('Server response error (HTTP ' + res.status + '): ' + (text ? text.substring(0, 150) : 'Empty response body'));
                return;
            }
            if (data.success) {
                alert('Digital Invoice Integration Settings saved successfully!');
                await Promise.all([
                    loadSettings(),
                    loadTaxpayerProfile(false)
                ]);
            } else {
                alert('Error saving settings: ' + (data.error || 'Server rejected changes.'));
            }
        } catch (e) {
            alert('Network or server error while saving settings: ' + e.message);
        } finally {
            if (btnSave1) { btnSave1.disabled = false; btnSave1.innerHTML = origText1; }
            if (btnSave2) { btnSave2.disabled = false; btnSave2.innerHTML = origText2; }
        }
    }

    async function testConnection() {
        const payload = gatherFormData();

        const btnConn1 = document.getElementById('btn_tab_test_conn');
        const btnConn2 = document.getElementById('btn_bottom_test_conn');
        if (btnConn1) { btnConn1.disabled = true; btnConn1.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...'; }
        if (btnConn2) { btnConn2.disabled = true; btnConn2.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...'; }

        const outputPre = document.getElementById('fbr_test_raw_output');
        if (outputPre) outputPre.innerText = 'Connecting to FBR / PRAL API endpoint: ' + payload.api_base_url + '...\nPerforming authentication verification...';

        try {
            const res = await fetch('api/digital_invoice_settings.php?action=test_connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                if (outputPre) outputPre.innerText = text;
                alert('Connection test server error: ' + (text ? text.substring(0, 150) : 'Empty response (HTTP ' + res.status + ')'));
                return;
            }

            // Update output viewer
            if (outputPre) {
                outputPre.innerText = JSON.stringify(data, null, 2);
            }

            // Banner message on Tab 3
            const banner = document.getElementById('fbr_test_message_banner');
            if (banner) {
                banner.style.display = 'block';
                if (data.success) {
                    banner.style.background = '#f0fdf4';
                    banner.style.border = '1px solid #bbf7d0';
                    banner.style.color = '#166534';
                    banner.innerHTML = `<strong><i class="fas fa-check-circle"></i> Success:</strong> ${escapeHtml(data.message)} (Latency: ${data.latency_ms || 0} ms)`;
                } else {
                    banner.style.background = '#fef2f2';
                    banner.style.border = '1px solid #fecaca';
                    banner.style.color = '#991b1b';
                    banner.innerHTML = `<strong><i class="fas fa-times-circle"></i> Failed:</strong> ${escapeHtml(data.message)} (HTTP: ${data.http_code || 'N/A'})`;
                }
            }

            // Update UI with test result data immediately
            updateStatusBadges(data);
            await loadSettings();

            const alertTitle = data.success ? '✅ FBR Connection Test Successful!' : '⚠️ FBR Connection Verification Notice:';
            const alertReport = [
                alertTitle,
                '----------------------------------------',
                'Overall Status: ' + (data.overall_status || data.status),
                'A. Configuration: ' + (data.config_status || '--'),
                'B. Reachability: ' + (data.server_connectivity || '--'),
                'C. Authentication: ' + (data.auth_status || '--'),
                'D. Validation: ' + (data.validation_status || '--'),
                'E. Submission: ' + (data.submission_status || '--'),
                'HTTP Code: ' + (data.http_code || 'N/A') + (data.latency_ms ? ' (' + data.latency_ms + ' ms)' : ''),
                '----------------------------------------',
                data.message
            ].join('\n');
            alert(alertReport);
        } catch (e) {
            if (outputPre) outputPre.innerText = 'Connection error: ' + e.message;
            alert('Connection test failed due to network error: ' + e.message);
        } finally {
            if (btnConn1) { btnConn1.disabled = false; btnConn1.innerHTML = '<i class="fas fa-plug"></i> Test Connection'; }
            if (btnConn2) { btnConn2.disabled = false; btnConn2.innerHTML = '<i class="fas fa-plug"></i> Test Connection'; }
        }
    }

    async function validateSampleInvoice() {
        const payload = gatherFormData();

        if (payload.environment === 'production') {
            alert('Validation Blocked: Sample invoice validation is only allowed in Sandbox environment to protect live fiscal reporting.');
            switchTab('tab_testing_validation');
            return;
        }

        switchTab('tab_testing_validation');

        const btnVal = document.getElementById('btn_tab_validate_sample');
        if (btnVal) { btnVal.disabled = true; btnVal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating...'; }

        const outputPre = document.getElementById('fbr_test_raw_output');
        if (outputPre) outputPre.innerText = 'Transmitting Sandbox test invoice payload to FBR validation endpoint...\nVerifying XML/JSON tax calculation schema...';

        try {
            const res = await fetch('api/digital_invoice_settings.php?action=validate_sample_invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                if (outputPre) outputPre.innerText = text;
                alert('Sample invoice validation server error: ' + (text ? text.substring(0, 150) : 'Empty response (HTTP ' + res.status + ')'));
                return;
            }

            if (outputPre) {
                outputPre.innerText = JSON.stringify(data, null, 2);
            }

            const banner = document.getElementById('fbr_test_message_banner');
            if (banner) {
                banner.style.display = 'block';
                if (data.success) {
                    banner.style.background = '#f0fdf4';
                    banner.style.border = '1px solid #bbf7d0';
                    banner.style.color = '#166534';
                    banner.innerHTML = `<strong><i class="fas fa-check-double"></i> Sample Invoice Validated:</strong> ${escapeHtml(data.message)}`;
                } else {
                    banner.style.background = '#fef2f2';
                    banner.style.border = '1px solid #fecaca';
                    banner.style.color = '#991b1b';
                    banner.innerHTML = `<strong><i class="fas fa-exclamation-circle"></i> Validation Failed:</strong> ${escapeHtml(data.message)}`;
                }
            }

            await loadSettings();

            if (data.success) {
                alert('Sample Invoice Validation Successful!\n' + data.message);
            } else {
                alert('Sample Invoice Validation Failed:\n' + data.message);
            }
        } catch (e) {
            if (outputPre) outputPre.innerText = 'Validation error: ' + e.message;
            alert('Error during sample invoice validation: ' + e.message);
        } finally {
            if (btnVal) { btnVal.disabled = false; btnVal.innerHTML = '<i class="fas fa-check-double"></i> Validate Sample Invoice'; }
        }
    }

    function clearTestOutput() {
        const outputPre = document.getElementById('fbr_test_raw_output');
        if (outputPre) outputPre.innerText = 'Output cleared.';
        const banner = document.getElementById('fbr_test_message_banner');
        if (banner) banner.style.display = 'none';
    }

    function resetChanges() {
        if (confirm('Discard unsaved edits and reload current integration settings?')) {
            loadSettings();
            loadTaxpayerProfile();
        }
    }

    // Modal & Logs Handling
    function showLogModal() {
        const modal = document.getElementById('fbr_log_modal');
        if (modal) modal.style.display = 'flex';
        loadLogs();
    }

    function hideLogModal() {
        const modal = document.getElementById('fbr_log_modal');
        if (modal) modal.style.display = 'none';
    }

    async function loadLogs() {
        const companyId = getCompanyId();
        const statusFilter = document.getElementById('fbr_log_filter_status')?.value || 'all';
        const eventFilter = document.getElementById('fbr_log_filter_event')?.value || 'all';
        const tbody = document.getElementById('fbr_logs_tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;"><i class="fas fa-spinner fa-spin"></i> Fetching logs...</td></tr>';

        try {
            const res = await fetch(`api/digital_invoice_settings.php?action=get_logs&company_id=${companyId}&status_filter=${statusFilter}&event_filter=${eventFilter}&_cb=${Date.now()}`);
            const data = await res.json();
            if (data.success && tbody) {
                const logs = data.logs || [];
                if (logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 25px; color: #64748b;">No integration activity logged yet.</td></tr>';
                    return;
                }

                let html = '';
                logs.forEach(l => {
                    const isSuccess = l.status === 'SUCCESS';
                    const badgeBg = isSuccess ? '#dcfce7' : '#fee2e2';
                    const badgeColor = isSuccess ? '#166534' : '#991b1b';
                    const envColor = (l.environment === 'production') ? '#dc2626' : '#2563eb';

                    html += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 6px 10px; color: #475569; font-family: monospace;">${escapeHtml(l.created_at)}</td>
                        <td style="padding: 6px 10px; font-weight: 600; color: #1e293b;">
                            <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${escapeHtml(l.event_type)}</span>
                        </td>
                        <td style="padding: 6px 10px; font-weight: 700; color: ${envColor}; font-size: 11px;">${escapeHtml(l.environment)}</td>
                        <td style="padding: 6px 10px; color: #334155; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.endpoint)}">${escapeHtml(l.endpoint)}</td>
                        <td style="padding: 6px 10px; text-align: center; font-family: monospace; font-weight: 700;">${escapeHtml(l.response_code || '-')}</td>
                        <td style="padding: 6px 10px; text-align: center;">
                            <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 2px 8px; border-radius: 10px; font-weight: 700; font-size: 10.5px;">
                                ${escapeHtml(l.status)}
                            </span>
                        </td>
                        <td style="padding: 6px 10px; text-align: center;">
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.DigitalInvoiceSettings.viewLogDetail(${l.id})" style="padding: 1px 6px; font-size: 10.5px; border: 1px solid #cbd5e1; border-radius: 3px; background: white; cursor: pointer;">
                                <i class="fas fa-eye"></i> View
                            </button>
                        </td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            }
        } catch (e) {
            console.error('Error loading logs:', e);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #dc2626;">Error loading logs: ' + escapeHtml(e.message) + '</td></tr>';
        }
    }

    async function viewLogDetail(logId) {
        const companyId = getCompanyId();
        try {
            const res = await fetch(`api/digital_invoice_settings.php?action=get_logs&company_id=${companyId}&limit=100&_cb=${Date.now()}`);
            const data = await res.json();
            const log = (data.logs || []).find(x => parseInt(x.id, 10) === parseInt(logId, 10));
            if (!log) {
                alert('Log entry not found.');
                return;
            }

            hideLogModal();
            switchTab('tab_testing_validation');
            const outputPre = document.getElementById('fbr_test_raw_output');
            if (outputPre) {
                outputPre.innerText = `LOG ENTRY #${log.id} [${log.created_at}]\n`
                    + `Event: ${log.event_type}\n`
                    + `Endpoint: ${log.endpoint}\n`
                    + `HTTP Code: ${log.response_code} (${log.response_time_ms} ms)\n`
                    + `Status: ${log.status}\n\n`
                    + `--- SANITIZED REQUEST PAYLOAD ---\n`
                    + `${log.request_payload || 'None'}\n\n`
                    + `--- RESPONSE BODY ---\n`
                    + `${log.response_body || log.sanitized_error || 'None'}`;
            }
        } catch (e) {
            alert('Error viewing log details: ' + e.message);
        }
    }

    async function clearLogs() {
        if (!confirm('Are you sure you want to clear all integration logs for this company?')) return;
        const companyId = getCompanyId();
        try {
            const res = await fetch(`api/digital_invoice_settings.php?action=clear_logs&company_id=${companyId}`);
            const data = await res.json();
            if (data.success) {
                loadLogs();
            } else {
                alert('Error clearing logs: ' + (data.error || 'Server rejected request.'));
            }
        } catch (e) {
            alert('Error clearing logs: ' + e.message);
        }
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    return {
        init,
        switchTab,
        loadSettings,
        loadTaxpayerProfile,
        handleProviderChange,
        handleEnvChange,
        confirmProductionSwitch,
        cancelProductionSwitch,
        resetDefaultUrl,
        clearEndpoints,
        togglePasswordVisibility,
        saveSettings,
        testConnection,
        validateSampleInvoice,
        clearTestOutput,
        resetChanges,
        showLogModal,
        hideLogModal,
        loadLogs,
        viewLogDetail,
        clearLogs
    };
})();
