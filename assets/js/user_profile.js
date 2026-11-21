/**
 * SoftifyX ERP - User Profile & Personal Preferences Module
 * Enables any logged-in user (Admin or non-Admin) to:
 * 1. Change their own password securely (requires verification of current password).
 * 2. Personalize their own Dashboard shortcuts independently.
 * 3. Set a personal Inactivity Auto-Logout Timer for security.
 * 4. Manage their Profile Photo.
 */

(function(window) {
    'use strict';

    let userAutoLogoutTimer = null;

    // --- AUTO-LOGOUT SESSION INACTIVITY ENGINE ---
    window.resetUserAutoLogoutTimer = function() {
        if (userAutoLogoutTimer) {
            clearTimeout(userAutoLogoutTimer);
            userAutoLogoutTimer = null;
        }

        const sessionStr = localStorage.getItem('softifyx_session');
        if (!sessionStr) return;

        let sess = {};
        try { sess = JSON.parse(sessionStr); } catch(e) { return; }
        const uId = sess.user_id || 0;
        if (!uId) return;

        const savedMins = localStorage.getItem('softifyx_user_logout_timeout_' + uId);
        const mins = savedMins !== null ? parseFloat(savedMins) : 0; // Default: 0 = disabled

        if (!mins || isNaN(mins) || mins <= 0) {
            return; // Disabled
        }

        const timeoutMs = Math.floor(mins * 60 * 1000);

        userAutoLogoutTimer = setTimeout(async function() {
            try {
                await fetch('api/auth.php?action=logout&reason=' + encodeURIComponent('Auto Logout (Inactivity)'));
            } catch(e) {}
            localStorage.removeItem('softifyx_session');
            alert('Your session has ended due to inactivity.');
            window.location.href = 'login.html';
        }, timeoutMs);
    };

    // Attach user activity listeners
    ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(function(evt) {
        document.addEventListener(evt, window.resetUserAutoLogoutTimer, { passive: true });
    });

    // Run initial timer check
    setTimeout(window.resetUserAutoLogoutTimer, 1000);

    // --- USER PROFILE MODAL ---
    window.openUserProfileModal = function(initialTab = 'tab_password') {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const username = session.username || 'User';
        const role = session.role || 'User';
        const company = session.company_name || 'SoftifyX Business';
        const branch = session.branch_name || 'Main Branch';
        const uId = session.user_id || 0;

        let existingModal = document.getElementById('userProfileModal');
        if (existingModal) existingModal.remove();

        const modalHtml = `
        <div id="userProfileModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(3px); z-index: 999999; display: flex; align-items: center; justify-content: center; font-family: 'Segoe UI', Tahoma, sans-serif;">
            <div style="background: #ffffff; width: 680px; max-width: 95vw; max-height: 90vh; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #cbd5e1;">
                
                <!-- Modal Header -->
                <div style="background: linear-gradient(135deg, #1e3a8a, #0284c7); color: #ffffff; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div id="uprof_avatar_preview" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 22px; border: 2px solid #ffffff; overflow: hidden;">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <div style="font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                                <span>${username}</span>
                                <span style="background: rgba(255,255,255,0.25); font-size: 10px; padding: 2px 8px; border-radius: 10px; text-transform: uppercase;">${role}</span>
                            </div>
                            <div style="font-size: 11px; opacity: 0.9; margin-top: 2px;">
                                <i class="fas fa-building"></i> ${company} &nbsp;|&nbsp; <i class="fas fa-code-branch"></i> ${branch}
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeUserProfileModal()" style="background: rgba(255,255,255,0.2); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&times;</button>
                </div>

                <!-- Tabs Navigation -->
                <div style="display: flex; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0 12px; overflow-x: auto;">
                    <button type="button" class="uprof-tab-btn active" data-tab="tab_password" onclick="window.switchUserProfileTab('tab_password')" style="padding: 12px 16px; border: none; background: transparent; font-size: 12px; font-weight: 700; color: #0284c7; border-bottom: 3px solid #0284c7; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-key"></i> Change Password
                    </button>
                    <button type="button" class="uprof-tab-btn" data-tab="tab_dashboard" onclick="window.switchUserProfileTab('tab_dashboard')" style="padding: 12px 16px; border: none; background: transparent; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-th-large"></i> My Dashboard Shortcuts
                    </button>
                    <button type="button" class="uprof-tab-btn" data-tab="tab_timeout" onclick="window.switchUserProfileTab('tab_timeout')" style="padding: 12px 16px; border: none; background: transparent; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-user-clock"></i> Auto-Logout Timer
                    </button>
                    <button type="button" class="uprof-tab-btn" data-tab="tab_photo" onclick="window.switchUserProfileTab('tab_photo')" style="padding: 12px 16px; border: none; background: transparent; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: 3px solid transparent; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-camera"></i> Profile Photo
                    </button>
                </div>

                <!-- Modal Content Area -->
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    
                    <!-- TAB 1: CHANGE PASSWORD -->
                    <div id="uprof_tab_password" class="uprof-tab-content" style="display: block;">
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; color: #166534;">
                            <i class="fas fa-shield-alt"></i> <strong>Secure Password Update:</strong> Enter your current password and choose a new password.
                        </div>

                        <form id="uprofPasswordForm" onsubmit="window.submitUserPasswordChange(event)" style="display: flex; flex-direction: column; gap: 14px;">
                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Current Password: <span style="color:#dc2626;">*</span></label>
                                <div style="position: relative;">
                                    <input type="password" id="uprof_curr_pass" required placeholder="Enter current password" style="width: 100%; height: 38px; padding: 0 40px 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box; outline: none;">
                                    <i class="fas fa-eye" onclick="window.togglePassVisibility('uprof_curr_pass', this)" style="position: absolute; right: 12px; top: 12px; color: #94a3b8; cursor: pointer;"></i>
                                </div>
                            </div>

                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">New Password: <span style="color:#dc2626;">*</span></label>
                                <div style="position: relative;">
                                    <input type="password" id="uprof_new_pass" required placeholder="At least 3 characters" style="width: 100%; height: 38px; padding: 0 40px 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box; outline: none;">
                                    <i class="fas fa-eye" onclick="window.togglePassVisibility('uprof_new_pass', this)" style="position: absolute; right: 12px; top: 12px; color: #94a3b8; cursor: pointer;"></i>
                                </div>
                            </div>

                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 5px;">Confirm New Password: <span style="color:#dc2626;">*</span></label>
                                <div style="position: relative;">
                                    <input type="password" id="uprof_confirm_pass" required placeholder="Re-enter new password" style="width: 100%; height: 38px; padding: 0 40px 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box; outline: none;">
                                    <i class="fas fa-eye" onclick="window.togglePassVisibility('uprof_confirm_pass', this)" style="position: absolute; right: 12px; top: 12px; color: #94a3b8; cursor: pointer;"></i>
                                </div>
                            </div>

                            <div id="uprof_pass_msg" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px;"></div>

                            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
                                <button type="submit" id="uprof_pass_btn" style="background: #16a34a; color: #ffffff; border: none; padding: 10px 24px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-check-circle"></i> Save New Password
                                </button>
                            </div>
                        </form>
                    </div>

                    <!-- TAB 2: PERSONAL DASHBOARD SHORTCUTS -->
                    <div id="uprof_tab_dashboard" class="uprof-tab-content" style="display: none;">
                        
                        <!-- Restricted Banner (Shown when no dashboard access) -->
                        <div id="uprof_dash_restricted" style="display: none; background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 22px; border-radius: 8px; text-align: center; color: #991b1b; margin: 15px 0;">
                            <i class="fas fa-lock" style="font-size: 38px; color: #ef4444; margin-bottom: 12px; display: block;"></i>
                            <div style="font-size: 15px; font-weight: 700; color: #b91c1c;">Dashboard Access Restricted</div>
                            <p style="font-size: 12px; margin: 8px 0 0 0; color: #7f1d1d; line-height: 1.6;">
                                Your account does not have permission to customize the dashboard.<br>
                                Please contact your System Administrator to request dashboard access.
                            </p>
                        </div>

                        <!-- Editable Content (Shown when user has dashboard access) -->
                        <div id="uprof_dash_allowed_content">
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 12px; color: #0369a1;">
                                <i class="fas fa-info-circle"></i> <strong>Personalized Dashboard:</strong> Select your preferred shortcuts, center overview cards, and right-sidebar widgets. These settings apply only to your user account.
                            </div>

                            <!-- 1. RECORD NEW -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 12px; font-weight: 700; color: #1e293b;"><i class="fas fa-plus-circle" style="color: #0284c7;"></i> 1. Record New Shortcuts (Data Entry):</span>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_rec_chk', true)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">All</button>
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_rec_chk', false)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">None</button>
                                </div>
                            </div>
                            <div id="uprof_rec_grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 16px;"></div>

                            <!-- 2. VIEW / REPORTS -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 12px; font-weight: 700; color: #1e293b;"><i class="fas fa-chart-line" style="color: #10b981;"></i> 2. View / Reports Shortcuts:</span>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_view_chk', true)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">All</button>
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_view_chk', false)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">None</button>
                                </div>
                            </div>
                            <div id="uprof_view_grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 16px;"></div>

                            <!-- 3. CENTER CARDS -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 12px; font-weight: 700; color: #1e293b;"><i class="fas fa-th" style="color: #8b5cf6;"></i> 3. Center Cards (Summary Boxes):</span>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_mid_chk', true)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">All</button>
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_mid_chk', false)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">None</button>
                                </div>
                            </div>
                            <div id="uprof_mid_grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 16px;"></div>

                            <!-- 4. RIGHT SIDEBAR SUMMARY CARDS -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 12px; font-weight: 700; color: #1e293b;"><i class="fas fa-chart-pie" style="color: #f59e0b;"></i> 4. Right Sidebar Activity Cards:</span>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_right_chk', true)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">All</button>
                                    <button type="button" onclick="window.toggleAllUprofChecks('uprof_right_chk', false)" style="background: #e2e8f0; border: none; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">None</button>
                                </div>
                            </div>
                            <div id="uprof_right_grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 16px;"></div>

                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                                <button type="button" onclick="window.resetMyDashboardToDefault()" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-undo"></i> Reset to System Default
                                </button>
                                <button type="button" onclick="window.saveMyPersonalDashboard()" style="background: #0284c7; color: #ffffff; border: none; padding: 8px 24px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-save"></i> Save My Dashboard
                                </button>
                            </div>
                        </div>

                    </div>

                    <!-- TAB 3: AUTO-LOGOUT SESSION TIMER -->
                    <div id="uprof_tab_timeout" class="uprof-tab-content" style="display: none;">
                        <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; color: #92400e;">
                            <i class="fas fa-user-clock"></i> <strong>Inactivity Protection:</strong> Automatically logs out your account after the specified period of idle time to prevent unauthorized access.
                        </div>

                        <div style="max-width: 460px; display: flex; flex-direction: column; gap: 16px;">
                            <label style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer;">
                                <input type="checkbox" id="uprof_never_logout_chk" onchange="window.toggleUprofNeverLogout(this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 13px; font-weight: 700; color: #1e293b;">
                                    Never Auto-Logout (Keep session permanently active)
                                </span>
                            </label>

                            <div id="uprof_manual_timeout_box" style="display: flex; flex-direction: column; gap: 8px;">
                                <label style="display: block; font-size: 12px; font-weight: 700; color: #334155;">
                                    Manual Duration: Inactivity timeout before auto-logout:
                                </label>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <input type="number" id="uprof_timeout_minutes" min="1" max="720" value="10" placeholder="e.g. 10" style="width: 110px; height: 38px; padding: 0 12px; border: 1px solid #94a3b8; border-radius: 6px; font-size: 15px; font-weight: 700; text-align: center; outline: none;">
                                    <span style="font-size: 13px; font-weight: 700; color: #475569;">Minutes</span>
                                </div>
                                <div style="display: flex; gap: 6px; margin-top: 4px;">
                                    <span style="font-size: 11px; color: #64748b; margin-right: 4px; align-self: center;">Quick Presets:</span>
                                    <button type="button" onclick="window.setUprofPresetMinutes(3)" style="background: #e2e8f0; border: none; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">3 Mins</button>
                                    <button type="button" onclick="window.setUprofPresetMinutes(5)" style="background: #e2e8f0; border: none; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">5 Mins</button>
                                    <button type="button" onclick="window.setUprofPresetMinutes(10)" style="background: #e2e8f0; border: none; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">10 Mins</button>
                                    <button type="button" onclick="window.setUprofPresetMinutes(15)" style="background: #e2e8f0; border: none; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">15 Mins</button>
                                    <button type="button" onclick="window.setUprofPresetMinutes(30)" style="background: #e2e8f0; border: none; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">30 Mins</button>
                                </div>
                            </div>

                            <div style="font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
                                Tip: You can specify any number of minutes (e.g. 7, 12, 25). Active typing or mouse movement resets the idle timer.
                            </div>

                            <button type="button" onclick="window.saveUserTimeoutPreference()" style="background: #f59e0b; color: #ffffff; border: none; padding: 10px 24px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; align-self: flex-start; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-check"></i> Save Timer Preference
                            </button>
                        </div>
                    </div>

                    <!-- TAB 4: PROFILE PHOTO -->
                    <div id="uprof_tab_photo" class="uprof-tab-content" style="display: none; text-align: center; padding: 20px 0;">
                        <div id="uprof_photo_container" style="margin-bottom: 20px;">
                            <i class="fas fa-user-circle" style="font-size: 90px; color: #cbd5e1;"></i>
                        </div>
                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button type="button" onclick="document.getElementById('profilePhotoInput')?.click()" style="background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-camera"></i> Upload / Change Photo
                            </button>
                            <button type="button" id="uprof_remove_photo_btn" onclick="window.removeProfilePhotoFromModal()" style="display: none; background: #ef4444; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; align-items: center; gap: 6px;">
                                <i class="fas fa-trash"></i> Remove
                            </button>
                        </div>
                        <p style="font-size: 11px; color: #94a3b8; margin-top: 14px;">Square size (e.g. 200x200 px) photo sab se behtareen dikhti hai.</p>
                    </div>

                </div>

                <!-- Modal Footer -->
                <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 10px 20px; display: flex; justify-content: flex-end;">
                    <button type="button" onclick="window.closeUserProfileModal()" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 20px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                        Close
                    </button>
                </div>

            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        window.switchUserProfileTab(initialTab);
        window.populateUprofDashboardShortcuts();
        window.loadUprofTimeoutSetting();
        window.loadUprofPhotoPreview();
    };

    window.closeUserProfileModal = function() {
        const el = document.getElementById('userProfileModal');
        if (el) el.remove();
    };

    window.switchUserProfileTab = function(tabId) {
        document.querySelectorAll('.uprof-tab-btn').forEach(b => {
            const isActive = b.getAttribute('data-tab') === tabId;
            b.style.color = isActive ? '#0284c7' : '#64748b';
            b.style.fontWeight = isActive ? '700' : '600';
            b.style.borderBottomColor = isActive ? '#0284c7' : 'transparent';
        });

        document.querySelectorAll('.uprof-tab-content').forEach(c => {
            c.style.display = 'none';
        });

        const target = document.getElementById('uprof_' + tabId);
        if (target) target.style.display = 'block';
    };

    window.togglePassVisibility = function(inputId, iconEl) {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            iconEl.classList.remove('fa-eye');
            iconEl.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            iconEl.classList.remove('fa-eye-slash');
            iconEl.classList.add('fa-eye');
        }
    };

    // --- 1. SUBMIT PASSWORD CHANGE ---
    window.submitUserPasswordChange = async function(e) {
        e.preventDefault();
        const currPass = document.getElementById('uprof_curr_pass')?.value || '';
        const newPass = document.getElementById('uprof_new_pass')?.value || '';
        const confPass = document.getElementById('uprof_confirm_pass')?.value || '';
        const msgEl = document.getElementById('uprof_pass_msg');
        const btn = document.getElementById('uprof_pass_btn');

        if (newPass !== confPass) {
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.background = '#fef2f2';
                msgEl.style.border = '1px solid #fecaca';
                msgEl.style.color = '#dc2626';
                msgEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> New password and confirmation password do not match.';
            }
            return;
        }

        if (newPass.length < 3) {
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.background = '#fef2f2';
                msgEl.style.border = '1px solid #fecaca';
                msgEl.style.color = '#dc2626';
                msgEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Password must be at least 3 characters long.';
            }
            return;
        }

        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const userId = session.user_id || 0;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        try {
            const res = await fetch('api/auth.php?action=change_my_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    current_password: currPass,
                    new_password: newPass,
                    confirm_password: confPass
                })
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                if (msgEl) {
                    msgEl.style.display = 'block';
                    msgEl.style.background = '#f0fdf4';
                    msgEl.style.border = '1px solid #bbf7d0';
                    msgEl.style.color = '#16a34a';
                    msgEl.innerHTML = '<i class="fas fa-check-circle"></i> Password updated successfully!';
                }
                document.getElementById('uprofPasswordForm')?.reset();
                setTimeout(() => {
                    alert('Password changed successfully!');
                    window.closeUserProfileModal();
                }, 800);
            } else {
                if (msgEl) {
                    msgEl.style.display = 'block';
                    msgEl.style.background = '#fef2f2';
                    msgEl.style.border = '1px solid #fecaca';
                    msgEl.style.color = '#dc2626';
                    msgEl.innerHTML = '<i class="fas fa-times-circle"></i> ' + (data.message || data.error || 'Failed to change password.');
                }
            }
        } catch(err) {
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.background = '#fef2f2';
                msgEl.style.border = '1px solid #fecaca';
                msgEl.style.color = '#dc2626';
                msgEl.innerHTML = '<i class="fas fa-times-circle"></i> Server connection error: ' + err.message;
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle"></i> Save New Password';
            }
        }
    };

    // --- 2. PERSONAL DASHBOARD SHORTCUTS & ACCESS CONTROL ---
    window.hasUserDashboardAccess = function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const role = (session.role || '').toUpperCase();
            const username = session.username || '';
            const uId = parseInt(session.user_id || 0);

            // 1. Administrator / Admin role / user_id 1 always allowed
            if (username === 'Administrator' || role === 'ADMIN' || uId === 1) {
                return true;
            }

            // 2. POS user or pos-only mode restricted from main dashboard customization
            if (role === 'POS' || document.documentElement.classList.contains('pos-only') || document.body.classList.contains('pos-only')) {
                return false;
            }

            // 3. User-specific explicit disable flag set by Admin
            if (localStorage.getItem('softifyx_user_dashboard_disabled_' + uId) === '1') {
                return false;
            }

            // 4. Role & Module rights check if currentUserRights exists
            if (window.currentUserRights && Object.keys(window.currentUserRights).length > 0) {
                // If Dashboard permission explicitly exists in rights
                if (window.currentUserRights['Dashboard']) {
                    const r = window.currentUserRights['Dashboard'];
                    return !!(r && r.allowed && (r.can_view || r.can_edit));
                }
                if (window.currentUserRights['Dashboard Summary']) {
                    const r = window.currentUserRights['Dashboard Summary'];
                    return !!(r && r.allowed && (r.can_view || r.can_edit));
                }
                
                // If user rights are loaded and user has no allowed modules at all
                const allowedModules = Object.values(window.currentUserRights).filter(r => r.allowed && (r.can_view || r.can_edit));
                if (allowedModules.length === 0) {
                    return false;
                }
            }

            return true;
        } catch(e) {
            return true;
        }
    };

    window.populateUprofDashboardShortcuts = function() {
        const customizer = window.DashboardCustomizer;
        if (!customizer || !customizer.catalog) return;

        const hasAccess = window.hasUserDashboardAccess();
        const restrictedBox = document.getElementById('uprof_dash_restricted');
        const allowedBox = document.getElementById('uprof_dash_allowed_content');

        if (!hasAccess) {
            if (restrictedBox) restrictedBox.style.display = 'block';
            if (allowedBox) allowedBox.style.display = 'none';
            return;
        }

        if (restrictedBox) restrictedBox.style.display = 'none';
        if (allowedBox) allowedBox.style.display = 'block';

        const currentConfig = customizer.getConfig();
        const recList = currentConfig.record_new || [];
        const viewList = currentConfig.view || [];
        const midList = currentConfig.middle_cards || [];
        const rightList = currentConfig.right_summary || [];

        // 1. Record New Grid
        const recGrid = document.getElementById('uprof_rec_grid');
        if (recGrid && customizer.catalog.record_new) {
            recGrid.innerHTML = customizer.catalog.record_new.map(item => {
                const checked = recList.includes(item.id) ? 'checked' : '';
                return `
                    <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; cursor: pointer;">
                        <input type="checkbox" class="uprof_rec_chk" value="${item.id}" ${checked}>
                        <i class="${item.icon}" style="color: #0284c7; width: 14px;"></i>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
                    </label>
                `;
            }).join('');
        }

        // 2. View / Reports Grid
        const viewGrid = document.getElementById('uprof_view_grid');
        if (viewGrid && customizer.catalog.view) {
            viewGrid.innerHTML = customizer.catalog.view.map(item => {
                const checked = viewList.includes(item.id) ? 'checked' : '';
                return `
                    <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; cursor: pointer;">
                        <input type="checkbox" class="uprof_view_chk" value="${item.id}" ${checked}>
                        <i class="${item.icon}" style="color: #10b981; width: 14px;"></i>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
                    </label>
                `;
            }).join('');
        }

        // 3. Center Cards Grid
        const midGrid = document.getElementById('uprof_mid_grid');
        if (midGrid && customizer.catalog.middle_cards) {
            midGrid.innerHTML = customizer.catalog.middle_cards.map(item => {
                const checked = midList.includes(item.id) ? 'checked' : '';
                return `
                    <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; cursor: pointer;">
                        <input type="checkbox" class="uprof_mid_chk" value="${item.id}" ${checked}>
                        <i class="fas fa-th-large" style="color: #8b5cf6; width: 14px;"></i>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
                    </label>
                `;
            }).join('');
        }

        // 4. Right Sidebar Summary Cards Grid
        const rightGrid = document.getElementById('uprof_right_grid');
        if (rightGrid && customizer.catalog.right_summary) {
            rightGrid.innerHTML = customizer.catalog.right_summary.map(item => {
                const checked = rightList.includes(item.id) ? 'checked' : '';
                return `
                    <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; cursor: pointer;">
                        <input type="checkbox" class="uprof_right_chk" value="${item.id}" ${checked}>
                        <i class="fas fa-chart-pie" style="color: #f59e0b; width: 14px;"></i>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
                    </label>
                `;
            }).join('');
        }
    };

    window.toggleAllUprofChecks = function(className, state) {
        document.querySelectorAll('.' + className).forEach(c => {
            c.checked = state;
        });
    };

    window.saveMyPersonalDashboard = function() {
        if (!window.hasUserDashboardAccess()) {
            alert('You do not have permission to customize the dashboard.');
            return;
        }

        const customizer = window.DashboardCustomizer;
        if (!customizer) return;

        const recChecks = Array.from(document.querySelectorAll('.uprof_rec_chk:checked')).map(c => c.value);
        const viewChecks = Array.from(document.querySelectorAll('.uprof_view_chk:checked')).map(c => c.value);
        const midChecks = Array.from(document.querySelectorAll('.uprof_mid_chk:checked')).map(c => c.value);
        const rightChecks = Array.from(document.querySelectorAll('.uprof_right_chk:checked')).map(c => c.value);

        const ok = customizer.saveUserDashboardConfig({
            record_new: recChecks,
            view: viewChecks,
            middle_cards: midChecks,
            right_summary: rightChecks
        });

        if (ok) {
            alert('Your personalized dashboard preferences have been saved successfully!');
            window.closeUserProfileModal();
        } else {
            alert('Failed to save dashboard preferences.');
        }
    };

    window.resetMyDashboardToDefault = function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const uId = session.user_id || 0;
        if (uId) {
            localStorage.removeItem(`softifyx_dashboard_customization_user_${uId}`);
        }
        if (window.DashboardCustomizer) {
            window.DashboardCustomizer.currentConfig = null;
            window.DashboardCustomizer.applyAll();
        }
        alert('Dashboard layout has been reset to system default.');
        window.closeUserProfileModal();
    };

    // --- 3. AUTO-LOGOUT SESSION TIMEOUT ---
    window.toggleUprofNeverLogout = function(isNever) {
        const box = document.getElementById('uprof_manual_timeout_box');
        const input = document.getElementById('uprof_timeout_minutes');
        if (box) box.style.opacity = isNever ? '0.4' : '1';
        if (input) input.disabled = isNever;
    };

    window.setUprofPresetMinutes = function(mins) {
        const chk = document.getElementById('uprof_never_logout_chk');
        const input = document.getElementById('uprof_timeout_minutes');
        if (chk) {
            chk.checked = false;
            window.toggleUprofNeverLogout(false);
        }
        if (input) {
            input.value = mins;
            input.focus();
        }
    };

    window.loadUprofTimeoutSetting = function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const uId = session.user_id || 0;
        const savedMins = localStorage.getItem('softifyx_user_logout_timeout_' + uId);
        const chk = document.getElementById('uprof_never_logout_chk');
        const input = document.getElementById('uprof_timeout_minutes');

        if (savedMins === null || savedMins === '0' || parseFloat(savedMins) <= 0) {
            if (chk) chk.checked = true;
            if (input) input.value = '10';
            window.toggleUprofNeverLogout(true);
        } else {
            if (chk) chk.checked = false;
            if (input) input.value = savedMins;
            window.toggleUprofNeverLogout(false);
        }
    };

    window.saveUserTimeoutPreference = function() {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const uId = session.user_id || 0;
        const chk = document.getElementById('uprof_never_logout_chk');
        const input = document.getElementById('uprof_timeout_minutes');

        const isNever = chk ? chk.checked : false;
        let finalMins = '0';

        if (!isNever) {
            const raw = input ? parseFloat(input.value) : 10;
            if (isNaN(raw) || raw <= 0) {
                alert('Please enter a valid number of minutes (e.g. 5, 10, 15).');
                return;
            }
            finalMins = String(Math.round(raw));
        }

        if (uId) {
            localStorage.setItem('softifyx_user_logout_timeout_' + uId, finalMins);
        }

        window.resetUserAutoLogoutTimer();

        const label = finalMins === '0' ? 'Disabled (Never Auto-Logout)' : `${finalMins} Minutes`;
        alert(`Auto-Logout preference set to: ${label} successfully!`);
        window.closeUserProfileModal();
    };

    // --- 4. PROFILE PHOTO PREVIEW & REMOVE ---
    window.loadUprofPhotoPreview = function() {
        const photo = window.userProfilePhoto || '';
        const prev = document.getElementById('uprof_avatar_preview');
        const cont = document.getElementById('uprof_photo_container');
        const remBtn = document.getElementById('uprof_remove_photo_btn');

        if (photo) {
            if (prev) prev.innerHTML = `<img src="${photo}" style="width: 100%; height: 100%; object-fit: cover;">`;
            if (cont) cont.innerHTML = `<img src="${photo}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid #0284c7; object-fit: cover; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">`;
            if (remBtn) remBtn.style.display = 'inline-flex';
        } else {
            if (prev) prev.innerHTML = `<i class="fas fa-user"></i>`;
            if (cont) cont.innerHTML = `<i class="fas fa-user-circle" style="font-size: 90px; color: #cbd5e1;"></i>`;
            if (remBtn) remBtn.style.display = 'none';
        }
    };

    window.removeProfilePhotoFromModal = async function() {
        if (!confirm('Are you sure you want to remove your profile photo?')) return;
        try {
            const res = await fetch('api/admin.php?action=remove_profile_photo', { method: 'POST' });
            if (res.ok) {
                window.userProfilePhoto = null;
                if (window.updateNames) window.updateNames();
                window.loadUprofPhotoPreview();
                alert('Profile photo has been removed.');
            }
        } catch(e) {
            alert('Error: ' + e.message);
        }
    };

    // --- 5. USER REJECTION NOTIFICATIONS & FEEDBACK ---
    window.checkUserRejectionNotifications = async function() {
        const sessionStr = localStorage.getItem('softifyx_session');
        if (!sessionStr) return;
        let sess = {};
        try { sess = JSON.parse(sessionStr); } catch(e) { return; }
        if (!sess.user_id) return;

        const role = (sess.role || '').toUpperCase();
        const username = sess.username || '';
        const isAdmin = (username === 'Administrator' || role === 'ADMIN' || role === 'ADMINISTRATOR' || parseInt(sess.user_id) === 1);

        // If Admin, check pending count for Approval Desk badge
        if (isAdmin) {
            try {
                const apprRes = await fetch('api/approval_desk.php?action=get_pending');
                const apprData = await apprRes.json();
                if (apprData.status === 'success') {
                    const cnt = parseInt(apprData.count || 0);
                    const navBadge = document.getElementById('navApprovalPendingBadge');
                    if (navBadge) {
                        navBadge.textContent = cnt;
                        navBadge.style.display = cnt > 0 ? 'inline-block' : 'none';
                    }
                }
            } catch(e) {}
        }

        // Check rejected notifications for this user
        try {
            const res = await fetch('api/approval_desk.php?action=get_user_notifications');
            const data = await res.json();
            if (data.status === 'success') {
                const unseen = parseInt(data.unseen_count || 0);
                const dot = document.getElementById('notificationDot');
                if (dot) {
                    dot.style.display = unseen > 0 ? 'block' : 'none';
                }

                // If user has unseen rejected items and hasn't shown popup in this page load
                if (unseen > 0 && !window._userRejectionModalShown) {
                    window._userRejectionModalShown = true;
                    window.showUserRejectionModal(data.items.filter(it => parseInt(it.notification_seen) === 0));
                }
            }
        } catch(e) {}
    };

    window.showUserRejectionModal = function(rejectedItems) {
        if (!rejectedItems || rejectedItems.length === 0) return;
        let existing = document.getElementById('userRejectionModal');
        if (existing) existing.remove();

        const currency = (window.globalCurrencySymbol || 'Rs.') + ' ';

        const listHtml = rejectedItems.map(it => `
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 700; color: #9f1239; font-size: 13px;">
                        <i class="fas fa-times-circle" style="color: #ef4444;"></i> ${it.module_name}: ${it.voucher_no}
                    </span>
                    <span style="font-weight: 700; color: #1e293b; font-size: 12px;">${currency}${parseFloat(it.amount || 0).toLocaleString('en-US')}</span>
                </div>
                <div style="font-size: 12px; color: #7f1d1d; margin-bottom: 6px;">
                    <strong>Rejection Reason:</strong> 
                    <span style="background: white; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #dc2626;">${it.rejection_reason || 'No reason specified'}</span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">Date: ${it.txn_date} | Reviewed By: ${it.reviewed_by_username || 'Admin'} (${it.reviewed_at || ''})</div>
                
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" id="user_feedback_inp_${it.id}" placeholder="Type your feedback / clarification (e.g. rate corrected)..." style="flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; outline: none;">
                    <button type="button" onclick="window.submitFeedbackFromModal(${it.id})" style="background: #0284c7; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap;">
                        <i class="fas fa-paper-plane"></i> Send Feedback
                    </button>
                </div>
            </div>
        `).join('');

        const modalHtml = `
            <div id="userRejectionModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.65); z-index: 999999; display: flex; align-items: center; justify-content: center; font-family: 'Segoe UI', Tahoma, sans-serif;">
                <div style="background: white; border-radius: 10px; width: 90%; max-width: 600px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.25);">
                    <div style="background: #ef4444; color: white; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-exclamation-triangle"></i> Transaction Rejection Notice
                        </h3>
                        <button type="button" onclick="window.closeUserRejectionModal()" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer;">&times;</button>
                    </div>
                    <div style="padding: 16px; overflow-y: auto; flex: 1;">
                        <div style="font-size: 13px; color: #334155; margin-bottom: 12px;">
                            The Administrator has rejected the following transaction(s). Please review the reason below and submit your feedback/clarification if required:
                        </div>
                        ${listHtml}
                    </div>
                    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 10px 18px; display: flex; justify-content: flex-end;">
                        <button type="button" onclick="window.closeUserRejectionModal()" style="background: #e2e8f0; color: #334155; border: none; padding: 7px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Dismiss / Acknowledge</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };

    window.closeUserRejectionModal = async function() {
        const el = document.getElementById('userRejectionModal');
        if (el) el.remove();
        try {
            await fetch('api/approval_desk.php?action=mark_seen', { method: 'POST' });
        } catch(e) {}
    };

    window.submitFeedbackFromModal = async function(id) {
        const inp = document.getElementById('user_feedback_inp_' + id);
        const feedback = inp ? inp.value.trim() : '';
        if (!feedback) {
            alert('Please enter your clarification / feedback.');
            return;
        }

        try {
            const res = await fetch('api/approval_desk.php?action=submit_user_feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, feedback: feedback })
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert('Your feedback has been submitted to the Administrator Approval Desk.');
                if (inp) {
                    inp.disabled = true;
                    inp.style.background = '#f0fdf4';
                    inp.value = '✓ Feedback Submitted: ' + feedback;
                }
            } else {
                alert(data.error || 'Failed to submit feedback.');
            }
        } catch(err) {
            alert('Error: ' + err.message);
        }
    };

    // Check notifications periodically (every 60 seconds) and on load
    setTimeout(window.checkUserRejectionNotifications, 3000);
    setInterval(window.checkUserRejectionNotifications, 60000);

    // Session Live Heartbeat (Pings every 45s to maintain active login status & detect disconnects)
    window.sendUserSessionHeartbeat = async function() {
        try {
            const sessionStr = localStorage.getItem('softifyx_session');
            if (!sessionStr) return;
            const sess = JSON.parse(sessionStr);
            if (!sess.user_id) return;
            await fetch('api/auth.php?action=heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: sess.user_id })
            });
        } catch(e) {}
    };
    setTimeout(window.sendUserSessionHeartbeat, 2000);
    setInterval(window.sendUserSessionHeartbeat, 45000);

})(window);
