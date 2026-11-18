/**
 * POS Dashboard Module
 * Handles branch filtering, period presets, custom date range, and live dashboard metrics
 */

(function() {
    const getTodayYMD = () => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    };

    window.posDashState = window.posDashState || {
        branch: 'all',
        preset: 'today',
        from_date: getTodayYMD(),
        to_date: getTodayYMD(),
        branchesLoaded: false
    };

    window.getPosDashPresetDates = function(preset) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const todayStr = toYMD(now);

        if (preset === 'today') {
            return { from: todayStr, to: todayStr };
        }
        if (preset === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            const yestStr = toYMD(yest);
            return { from: yestStr, to: yestStr };
        }
        if (preset === 'this_week') {
            const d = new Date(now);
            const day = d.getDay(); // 0 is Sun, 1 is Mon...
            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
            const startOfWeek = new Date(d.setDate(diff));
            return { from: toYMD(startOfWeek), to: todayStr };
        }
        if (preset === 'this_month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: toYMD(startOfMonth), to: todayStr };
        }
        return null;
    };

    window.onPosDashPresetChange = function(presetVal) {
        window.posDashState.preset = presetVal;
        if (presetVal !== 'custom') {
            const dates = window.getPosDashPresetDates(presetVal);
            if (dates) {
                window.posDashState.from_date = dates.from;
                window.posDashState.to_date = dates.to;
                const fromInput = document.getElementById('pos_dash_from_date');
                const toInput = document.getElementById('pos_dash_to_date');
                if (fromInput) fromInput.value = dates.from;
                if (toInput) toInput.value = dates.to;
            }
        }
        window.loadPosDashboard();
    };

    window.onPosDashCustomDateChange = function() {
        const fromInput = document.getElementById('pos_dash_from_date');
        const toInput = document.getElementById('pos_dash_to_date');
        if (fromInput && fromInput.value) window.posDashState.from_date = fromInput.value;
        if (toInput && toInput.value) window.posDashState.to_date = toInput.value;
        
        const presetSelect = document.getElementById('pos_dash_preset_select');
        if (presetSelect) {
            const f = window.posDashState.from_date;
            const t = window.posDashState.to_date;
            const pToday = window.getPosDashPresetDates('today');
            const pYest = window.getPosDashPresetDates('yesterday');
            const pWeek = window.getPosDashPresetDates('this_week');
            const pMonth = window.getPosDashPresetDates('this_month');

            if (f === pToday.from && t === pToday.to) {
                presetSelect.value = 'today';
                window.posDashState.preset = 'today';
            } else if (f === pYest.from && t === pYest.to) {
                presetSelect.value = 'yesterday';
                window.posDashState.preset = 'yesterday';
            } else if (f === pWeek.from && t === pWeek.to) {
                presetSelect.value = 'this_week';
                window.posDashState.preset = 'this_week';
            } else if (f === pMonth.from && t === pMonth.to) {
                presetSelect.value = 'this_month';
                window.posDashState.preset = 'this_month';
            } else {
                presetSelect.value = 'custom';
                window.posDashState.preset = 'custom';
            }
        }
        window.loadPosDashboard();
    };

    window.onPosDashBranchChange = function(branchVal) {
        window.posDashState.branch = branchVal;
        window.loadPosDashboard();
    };

    window.openPosInvoiceInRegister = function(invNo) {
        window.openModularPopup('Navigation/POS/pos_sale_register.html', 'fa-list-alt', 'POS Sales Register', () => {
            setTimeout(() => {
                const searchInput = document.getElementById('pos_filter_search');
                if (searchInput && invNo) {
                    searchInput.value = invNo;
                    if (window.POSRegisterModule && typeof window.POSRegisterModule.applyFilters === 'function') {
                        window.POSRegisterModule.applyFilters();
                    }
                } else if (window.POSRegisterModule && typeof window.POSRegisterModule.init === 'function') {
                    window.POSRegisterModule.init();
                }
            }, 150);
        }, 'POS Sales Register', true, true);
    };

    window.togglePosBranchLoginMenu = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const menu = document.getElementById('posBranchLoginMenu');
        if (menu) {
            const isShown = (menu.style.display === 'block');
            menu.style.display = isShown ? 'none' : 'block';
        }
    };

    window.renderPosBranchQuickLoginList = function(branches) {
        const listEl = document.getElementById('posBranchLoginList');
        if (!listEl) return;
        if (!branches || branches.length === 0) {
            listEl.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">No branches found.</div>';
            return;
        }
        
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const currentBranchId = session.branch_id;
        
        let html = '';
        branches.forEach(b => {
            const isCurrent = (currentBranchId && String(currentBranchId) === String(b.id));
            const activeBadge = isCurrent ? '<span style="font-size: 10px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Current</span>' : '';
            const seriesInfo = b.invoice_series ? `Series: <strong>${b.invoice_series}</strong>` : (b.branch_code ? `Code: <strong>${b.branch_code}</strong>` : '');
            
            html += `
                <div class="pos-branch-login-item" onclick="window.loginToBranchDirect('${b.id}', '${encodeURIComponent(b.branch_name)}', '${b.branch_code || ''}', '${b.invoice_series || ''}')" style="padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: background 0.15s; border-bottom: 1px solid #f1f5f9; ${isCurrent ? 'background: #f0fdf4;' : ''}">
                    <div>
                        <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-store-alt" style="color: ${isCurrent ? '#16a34a' : '#3b82f6'}; font-size: 12px;"></i>
                            <span>${b.branch_name}</span>
                            ${activeBadge}
                        </div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                            ${seriesInfo}
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm" style="padding: 3px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid ${isCurrent ? '#16a34a' : '#10b981'}; background: ${isCurrent ? '#16a34a' : '#ecfdf5'}; color: ${isCurrent ? '#fff' : '#059669'}; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        ${isCurrent ? '<i class="fas fa-check"></i> Active' : 'Login <i class="fas fa-arrow-right" style="font-size: 9px;"></i>'}
                    </button>
                </div>
            `;
        });
        listEl.innerHTML = html;
    };

    window.loginToBranchDirect = async function(branchId, branchNameEnc, branchCode, invoiceSeries) {
        const branchName = decodeURIComponent(branchNameEnc);
        try {
            const curSession = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = curSession.company_id || 1;
            
            // Backup the original admin session if not already backed up
            if (!localStorage.getItem('softifyx_admin_backup_session')) {
                localStorage.setItem('softifyx_admin_backup_session', JSON.stringify(curSession));
            }

            // Call backend to authenticate/switch session
            const res = await fetch(`api/pos.php?action=login_to_branch&company_id=${companyId}&branch_id=${branchId}`);
            const data = await res.json();
            
            let newUserId = curSession.user_id;
            let newUsername = curSession.username;
            if (data && data.status === 'success' && data.pos_user) {
                newUserId = data.pos_user.id;
                newUsername = data.pos_user.username;
            }

            const newSession = {
                ...curSession,
                user_id: newUserId,
                username: newUsername,
                role: 'POS',
                branch_id: parseInt(branchId),
                branch_name: branchName,
                branch_code: branchCode || '',
                invoice_series: invoiceSeries || (branchCode ? branchCode + '-POS-' : 'POS-INV-'),
                switched_by_admin: true
            };

            localStorage.setItem('softifyx_session', JSON.stringify(newSession));
            localStorage.setItem('softifyx_is_locked', 'false');

            // Reload into the switched branch session
            window.location.reload();
        } catch(err) {
            console.error('Failed to login to branch:', err);
            alert('Failed to login to branch: ' + err.message);
        }
    };

    window.returnToAdminDashboard = async function() {
        const backupStr = localStorage.getItem('softifyx_admin_backup_session');
        if (!backupStr) {
            window.location.href = 'index.html';
            return;
        }
        
        try {
            const adminSession = JSON.parse(backupStr);
            const companyId = adminSession.company_id || 1;
            const userId = adminSession.user_id || 1;
            
            // Notify backend to restore PHP $_SESSION
            await fetch(`api/pos.php?action=restore_admin_session&company_id=${companyId}&user_id=${userId}`);
            
            // Restore localStorage session
            localStorage.setItem('softifyx_session', backupStr);
            localStorage.removeItem('softifyx_admin_backup_session');
            
            // Remove pos-only class from document
            document.documentElement.classList.remove('pos-only');
            document.body.classList.remove('pos-only');
            
            // Navigate to index.html (Main Dashboard as Admin)
            window.location.href = 'index.html';
        } catch(err) {
            console.error('Failed to restore admin session:', err);
            localStorage.setItem('softifyx_session', backupStr);
            localStorage.removeItem('softifyx_admin_backup_session');
            window.location.href = 'index.html';
        }
    };

    // Close branch dropdown on click outside
    if (!window._posBranchClickOutsideAttached) {
        document.addEventListener('click', function(e) {
            const menu = document.getElementById('posBranchLoginMenu');
            if (menu && menu.style.display === 'block') {
                if (!e.target.closest('#posBranchLoginDropdownBtn') && !e.target.closest('#posBranchLoginMenu') && !e.target.closest('button[title*="Switch"]')) {
                    menu.style.display = 'none';
                }
            }
        });
        window._posBranchClickOutsideAttached = true;
    }

    window.loadPosDashboard = async function() {
        const fromInput = document.getElementById('pos_dash_from_date');
        const toInput = document.getElementById('pos_dash_to_date');
        const presetSelect = document.getElementById('pos_dash_preset_select');
        const branchSelect = document.getElementById('pos_dash_branch_select');

        // If the dashboard DOM elements are not present, do not proceed
        if (!branchSelect && !fromInput) return;

        try {
            const sessionData = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = sessionData.company_id || window.selectedCompanyId || 1;
            if (!companyId) return;

            const userRole = String(sessionData.role || '').trim().toUpperCase();
            const username = String(sessionData.username || '').trim().toUpperCase();
            const userId = sessionData.user_id;
            const sessionBranchId = sessionData.branch_id || '';

            const isAdmin = (userRole === 'ADMIN' || userRole === 'ADMINISTRATOR' || username === 'ADMIN' || username === 'ADMINISTRATOR' || userId == 1);
            const adminBackup = localStorage.getItem('softifyx_admin_backup_session');
            const isSwitchedByAdmin = !!adminBackup;
            const isActuallyAdmin = isAdmin || isSwitchedByAdmin;

            // Update Top-Right Branch Control Area (Yellow Highlight Area)
            const controlWrapper = document.getElementById('posAdminBranchControlWrapper');
            const loginDropdownArea = document.getElementById('posBranchLoginDropdownArea');
            const switchedArea = document.getElementById('posBranchSwitchedArea');
            const switchedBadgeName = document.getElementById('posSwitchedBranchBadgeName');

            if (isActuallyAdmin) {
                if (controlWrapper) controlWrapper.style.display = 'flex';
                if (isSwitchedByAdmin) {
                    if (switchedArea) switchedArea.style.display = 'flex';
                    if (loginDropdownArea) loginDropdownArea.style.display = 'none';
                    if (switchedBadgeName) switchedBadgeName.textContent = sessionData.branch_name || 'Assigned Branch';
                } else {
                    if (switchedArea) switchedArea.style.display = 'none';
                    if (loginDropdownArea) loginDropdownArea.style.display = 'block';
                }
            } else {
                if (controlWrapper) controlWrapper.style.display = 'none';
            }

            // For non-admin POS users (and not switched by admin), strictly lock branch to their assigned branch
            if (!isAdmin) {
                window.posDashState.branch = sessionBranchId ? String(sessionBranchId) : '';
            } else if (!window.posDashState.branch) {
                window.posDashState.branch = 'all';
            }

            // Branch filter wrapper: Visible for Admin (dropdown) or POS user (locked badge)
            const branchWrapper = document.getElementById('posBranchFilterWrapper');
            const userBranchBadge = document.getElementById('posUserBranchBadge');
            const userBranchNameEl = document.getElementById('posUserBranchName');
            
            if (isAdmin) {
                if (branchWrapper) branchWrapper.style.display = 'flex';
                if (userBranchBadge) userBranchBadge.style.display = 'none';
            } else {
                if (branchWrapper) branchWrapper.style.display = 'none';
                if (userBranchBadge) {
                    userBranchBadge.style.display = 'inline-flex';
                    if (userBranchNameEl) userBranchNameEl.textContent = sessionData.branch_name || 'My Branch';
                }
            }

            // Sync inputs with current state
            if (fromInput) {
                if (!fromInput.value) fromInput.value = window.posDashState.from_date;
                else window.posDashState.from_date = fromInput.value;
            }
            if (toInput) {
                if (!toInput.value) toInput.value = window.posDashState.to_date;
                else window.posDashState.to_date = toInput.value;
            }
            if (presetSelect && window.posDashState.preset) {
                presetSelect.value = window.posDashState.preset;
            }

            const currentBranch = window.posDashState.branch || 'all';
            const fromDate = window.posDashState.from_date;
            const toDate = window.posDashState.to_date;

            const cb = `_cb=${Date.now()}`;
            const url = `api/pos.php?action=get_pos_dashboard&company_id=${companyId}&branch_id=${encodeURIComponent(currentBranch)}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}&role=${encodeURIComponent(userRole)}&session_branch_id=${encodeURIComponent(sessionBranchId)}&user_id=${encodeURIComponent(userId || '')}&${cb}`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.status === 'success') {
                    const currencySymbol = (window.globalCurrencySymbol || 'Rs.') + ' ';
                    
                    // 1. Populate Branches Dropdown (Admin only)
                    if (branchSelect && data.branches && isAdmin) {
                        let opts = '<option value="all">🏢 All Branches (Consolidated)</option>';
                        data.branches.forEach(b => {
                            opts += `<option value="${b.id}">${b.branch_name}</option>`;
                        });
                        branchSelect.innerHTML = opts;
                        branchSelect.value = String(currentBranch);
                        branchSelect.disabled = false;
                        branchSelect.style.background = '#fff';
                        branchSelect.style.cursor = 'pointer';
                        branchSelect.title = "Select branch to filter or view all branches";
                    }

                    // Populate Top-Bar Branch Quick Login Menu
                    if (data.branches && (isAdmin || isSwitchedByAdmin)) {
                        window.renderPosBranchQuickLoginList(data.branches);
                    }

                    // 2. Update Card Label and Scope Tag
                    const labelEl = document.getElementById('posSaleCardLabel');
                    const scopeTagEl = document.getElementById('posRecentInvoicesScopeTag');

                    const now = new Date();
                    const pad = (n) => String(n).padStart(2, '0');
                    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                    const yest = new Date(now);
                    yest.setDate(yest.getDate() - 1);
                    const yestStr = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;

                    if (labelEl) {
                        if (fromDate === toDate) {
                            if (fromDate === todayStr) {
                                labelEl.textContent = "Today's Sale";
                            } else if (fromDate === yestStr) {
                                labelEl.textContent = "Yesterday's Sale";
                            } else {
                                labelEl.textContent = `Sale on ${fromDate}`;
                            }
                        } else {
                            labelEl.textContent = `Sale (${fromDate} to ${toDate})`;
                        }
                    }

                    let branchNameDisplay = "All Branches";
                    if (currentBranch !== 'all' && currentBranch !== '') {
                        const matched = (data.branches || []).find(b => String(b.id) === String(currentBranch));
                        if (matched) {
                            branchNameDisplay = matched.branch_name;
                        } else if (sessionData.branch_name) {
                            branchNameDisplay = sessionData.branch_name;
                        }
                    } else if (!isAdmin && sessionData.branch_name) {
                        branchNameDisplay = sessionData.branch_name;
                    }

                    if (scopeTagEl) {
                        if (fromDate === toDate) {
                            if (fromDate === todayStr) {
                                scopeTagEl.textContent = `Showing Today (${branchNameDisplay})`;
                            } else if (fromDate === yestStr) {
                                scopeTagEl.textContent = `Showing Yesterday (${branchNameDisplay})`;
                            } else {
                                scopeTagEl.textContent = `Showing ${fromDate} (${branchNameDisplay})`;
                            }
                        } else {
                            scopeTagEl.textContent = `Showing ${fromDate} to ${toDate} (${branchNameDisplay})`;
                        }
                    }

                    // 3. Update Metric Cards
                    const saleEl = document.getElementById('posTodaySale');
                    if (saleEl) saleEl.textContent = currencySymbol + (parseFloat(data.today_sale || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    
                    const invEl = document.getElementById('posTotalInvoices');
                    if (invEl) invEl.textContent = data.total_invoices || 0;
                    
                    const cashEl = document.getElementById('posCashReceived');
                    if (cashEl) cashEl.textContent = currencySymbol + (parseFloat(data.cash_received || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    
                    const pendingEl = document.getElementById('posFbrPending');
                    if (pendingEl) pendingEl.textContent = data.fbr_pending || 0;

                    // 4. Render Recent Invoices Table
                    const tbody = document.getElementById('posRecentInvoicesTable');
                    if (tbody) {
                        if (data.recent_invoices && data.recent_invoices.length > 0) {
                            let html = '';
                            data.recent_invoices.forEach(inv => {
                                let statusBadge = '';
                                const st = (inv.fbr_status || 'Not Submitted').trim();
                                if (st === 'Submitted') {
                                    statusBadge = '<span style="background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-check-circle"></i> Submitted</span>';
                                } else if (st === 'Failed' || st === 'Rejected') {
                                    statusBadge = '<span style="background: #fff5f5; color: #9b2c2c; border: 1px solid #fed7d7; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> ' + st + '</span>';
                                } else {
                                    statusBadge = '<span style="background: #fffaf0; color: #c05621; border: 1px solid #feebc8; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-clock"></i> Pending</span>';
                                }

                                const branchTag = `<span style="background: #f8fafc; color: #334155; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-store-alt" style="color: #3b82f6;"></i> ${inv.branch_name || 'Main Branch'}</span>`;

                                html += `
                                    <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;">
                                        <td style="padding: 10px; font-weight: 700; color: #1e293b;">${inv.invoice_no}</td>
                                        <td style="padding: 10px;">${branchTag}</td>
                                        <td style="padding: 10px; color: #64748b;">
                                            <div>${inv.invoice_date}</div>
                                        </td>
                                        <td style="padding: 10px; font-weight: 500; color: #334155;">${inv.customer_name || 'Walk-in Customer'}</td>
                                        <td style="padding: 10px; text-align: right; font-weight: 700; color: #0f172a;">${currencySymbol}${parseFloat(inv.net_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td style="padding: 10px; text-align: center;">${statusBadge}</td>
                                        <td style="padding: 10px; text-align: center;">
                                            <button class="btn btn-light btn-sm" onclick="window.openPosInvoiceInRegister('${inv.invoice_no}')" title="View in Sales Register" style="padding: 3px 8px; font-size: 11px; border: 1px solid #cbd5e0; border-radius: 4px; background: #fff; cursor: pointer;">
                                                <i class="fas fa-eye" style="color: #3b82f6;"></i> View
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            });
                            tbody.innerHTML = html;
                        } else {
                            tbody.innerHTML = '<tr><td colspan="7" style="padding: 30px; text-align: center; color: #94a3b8;"><i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 6px; display: block; color: #cbd5e1;"></i>No invoices found for the selected branch and criteria.</td></tr>';
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load POS Dashboard", err);
            const tbody = document.getElementById('posRecentInvoicesTable');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #e74c3c;">Failed to load data. Please change filters to try again.</td></tr>';
            }
        }
    };

    window.refreshPosDashboard = async function(btn) {
        const icon = btn ? btn.querySelector('i') : document.getElementById('iconPosDashRefresh');
        if (icon) icon.classList.add('fa-spin');
        if (btn) btn.disabled = true;
        try {
            if (typeof window.loadPosDashboard === 'function') {
                await window.loadPosDashboard();
            }
        } catch(e) {
            console.error(e);
        } finally {
            setTimeout(() => {
                if (icon) icon.classList.remove('fa-spin');
                if (btn) btn.disabled = false;
            }, 500);
        }
    };

    // Auto-update dashboard every 20 seconds while dashboard is open on screen
    if (window._posDashAutoRefreshInterval) {
        clearInterval(window._posDashAutoRefreshInterval);
    }
    window._posDashAutoRefreshInterval = setInterval(() => {
        const isDashActive = document.getElementById('pos_dash_branch_select') || document.getElementById('posRecentInvoicesTable');
        if (isDashActive && document.visibilityState === 'visible') {
            if (typeof window.loadPosDashboard === 'function') {
                window.loadPosDashboard();
            }
        } else if (!isDashActive) {
            clearInterval(window._posDashAutoRefreshInterval);
            window._posDashAutoRefreshInterval = null;
        }
    }, 20000);

    // Auto-refresh when user switches back to this browser tab
    if (!window._posDashFocusListenerSet) {
        window.addEventListener('focus', () => {
            const isDashActive = document.getElementById('pos_dash_branch_select') || document.getElementById('posRecentInvoicesTable');
            if (isDashActive && typeof window.loadPosDashboard === 'function') {
                window.loadPosDashboard();
            }
        });
        window._posDashFocusListenerSet = true;
    }
})();
