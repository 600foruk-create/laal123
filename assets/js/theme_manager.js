/**
 * SoftifyX ERP - Theme Manager
 * Provides global customizable color themes, real-time live previews,
 * one-click presets, and full persistence across sessions and database.
 */
(function() {
    window.ERP_THEME_PRESETS = [
        {
            name: 'Classic Navy (Default)',
            primary: '#1F4E79',
            toolbar: '#214F77',
            accent: '#F5A623',
            btnHover: '#153550'
        },
        {
            name: 'Sapphire Blue',
            primary: '#1E3A8A',
            toolbar: '#1D4ED8',
            accent: '#60A5FA',
            btnHover: '#172554'
        },
        {
            name: 'Emerald Green',
            primary: '#064E3B',
            toolbar: '#047857',
            accent: '#34D399',
            btnHover: '#022c22'
        },
        {
            name: 'Crimson Maroon',
            primary: '#881337',
            toolbar: '#9F1239',
            accent: '#FB7185',
            btnHover: '#4c0519'
        },
        {
            name: 'Midnight Violet',
            primary: '#4C1D95',
            toolbar: '#5B21B6',
            accent: '#C084FC',
            btnHover: '#2e1065'
        },
        {
            name: 'Dark Titanium',
            primary: '#0F172A',
            toolbar: '#1E293B',
            accent: '#38BDF8',
            btnHover: '#020617'
        },
        {
            name: 'Oceanic Teal',
            primary: '#134E4A',
            toolbar: '#0F766E',
            accent: '#2DD4BF',
            btnHover: '#042f2e'
        },
        {
            name: 'Amber Gold',
            primary: '#451A03',
            toolbar: '#78350F',
            accent: '#FBBF24',
            btnHover: '#270e02'
        }
    ];

    window.DEFAULT_ERP_THEME = window.ERP_THEME_PRESETS[0];

    function shadeColor(color, percent) {
        if (!color || color.length < 6) return color;
        try {
            let num = parseInt(color.replace('#', ''), 16);
            let amt = Math.round(2.55 * percent);
            let R = (num >> 16) + amt;
            let G = (num >> 8 & 0x00FF) + amt;
            let B = (num & 0x0000FF) + amt;
            return '#' + (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
                (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
                (B < 255 ? (B < 1 ? 0 : B) : 255)
            ).toString(16).slice(1);
        } catch(e) {
            return color;
        }
    }
    window.shadeColor = shadeColor;

    window.getCurrentERPTheme = function() {
        try {
            const saved = localStorage.getItem('softifyx_theme');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.primary) {
                    return {
                        name: parsed.name || 'Custom Theme',
                        primary: parsed.primary,
                        toolbar: parsed.toolbar || parsed.primary,
                        accent: parsed.accent || window.DEFAULT_ERP_THEME.accent,
                        btnHover: parsed.btnHover || shadeColor(parsed.primary, -15)
                    };
                }
            }
        } catch(e) {}
        return Object.assign({}, window.DEFAULT_ERP_THEME);
    };

    window.applyERPThemeToElement = function(root, theme) {
        if (!root) return;
        if (!theme || !theme.primary) theme = window.getCurrentERPTheme();
        const primary = theme.primary;
        const accent = theme.accent || (window.DEFAULT_ERP_THEME && window.DEFAULT_ERP_THEME.accent) || '#F5A623';
        const btnHover = theme.btnHover || shadeColor(primary, -15);

        // 1. Form & Report Action Buttons
        const btns = root.querySelectorAll(`
            [class*="-tool-btn"],
            [class*="-btn-add"],
            [class*="-btn-save"],
            [class*="-btn-cancel"],
            [class*="-btn-info"],
            [class*="-btn-post"],
            [class*="-btn-find"],
            [class*="-btn-print"],
            .coa-btn,
            .coa-chart,
            .coa-find,
            .coa-add,
            .coa-save,
            .coa-cancel,
            .tb-btn,
            .vub-btn,
            .cub-btn,
            .ib-btn,
            .al-btn,
            .ps-btn:not(.ps-btn-excel),
            .sr-btn,
            .pr-btn,
            [id*="btn_display"],
            [id*="btn_print"],
            [id*="btn_excel"],
            button[id*="_display"],
            input[type="button"][id*="_display"],
            button[id*="_print"],
            button[id*="_excel"],
            button[onclick*="fetchReport"],
            button[onclick*="printReport"],
            button[onclick*="exportExcel"],
            button[onclick*="search"],
            button[onclick*="Display"],
            button[onclick*="print"],
            button[onclick*="excel"],
            [id*="find_modal"] button,
            [id*="_find_modal"] button,
            .fbr-btn-theme,
            .fbr-btn-primary,
            #btn_tab_test_conn,
            #btn_bottom_test_conn,
            #btn_tab_validate_sample,
            #btn_bottom_save_settings,
            #digitalInvoiceSettingsContainer button[onclick*="saveSettings"],
            #digitalInvoiceSettingsContainer button[onclick*="testConnection"],
            #digitalInvoiceSettingsContainer button[onclick*="validateSampleInvoice"],
            .ob-btn:not(.ob-delete),
            #driverMaintenanceContainer .ob-btn:not(.ob-delete)
        `);
        btns.forEach(function(btn) {
            const cls = (btn.className || '').toLowerCase();
            const oc = (btn.getAttribute('onclick') || '').toLowerCase();
            const txt = (btn.innerText || '').trim().toLowerCase();
            const btnId = (btn.id || '').toLowerCase();
            if (btnId.includes('location_display') || btnId.includes('job_display') || btnId.includes('emp_display')) {
                return;
            }

            // Delete / Danger buttons MUST ALWAYS stay Red
            if (cls.includes('delete') || cls.includes('danger') || oc.includes('delete') || txt === 'delete') {
                btn.style.setProperty('background', '#dc3545', 'important');
                btn.style.setProperty('background-color', '#dc3545', 'important');
                btn.style.setProperty('border-color', '#dc3545', 'important');
                btn.style.setProperty('color', '#ffffff', 'important');
                return;
            }

            // Exclude window control buttons, close buttons, preset pills, nav << >> buttons
            if (
                cls.includes('btn-min') || 
                cls.includes('btn-max') || 
                cls.includes('btn-close') || 
                cls.includes('nav-btn') || 
                cls.includes('preset-pill') ||
                cls.includes('theme-pill')
            ) {
                return;
            }

            btn.style.setProperty('background', primary, 'important');
            btn.style.setProperty('background-color', primary, 'important');
            btn.style.setProperty('border-color', primary, 'important');
            btn.style.setProperty('color', '#ffffff', 'important');

            if (!btn._themeHoverBound) {
                btn._themeHoverBound = true;
                btn.addEventListener('mouseenter', function() {
                    const cur = window.getCurrentERPTheme();
                    const h = cur.btnHover || shadeColor(cur.primary, -15);
                    const c = (this.className || '').toLowerCase();
                    if (!c.includes('delete') && !c.includes('danger')) {
                        this.style.setProperty('background', h, 'important');
                        this.style.setProperty('background-color', h, 'important');
                        this.style.setProperty('border-color', h, 'important');
                    }
                });
                btn.addEventListener('mouseleave', function() {
                    const cur = window.getCurrentERPTheme();
                    const c = (this.className || '').toLowerCase();
                    if (!c.includes('delete') && !c.includes('danger')) {
                        this.style.setProperty('background', cur.primary, 'important');
                        this.style.setProperty('background-color', cur.primary, 'important');
                        this.style.setProperty('border-color', cur.primary, 'important');
                    }
                });
            }
        });

        // 2. Table Headers (all grid tables, report tables, find tables)
        const ths = root.querySelectorAll(`
            thead,
            thead tr,
            thead th,
            table thead th,
            [id*="GridHeader"] th,
            [id*="gridHeader"] th,
            [id*="Grid"] thead th,
            [id*="grid"] thead th,
            [class*="-grid-header"] th,
            [id*="find_modal"] table thead th,
            [id*="_find_modal"] table thead th,
            #fbr_branches_table thead th,
            #fbr_branches_table thead tr
        `);
        ths.forEach(function(th) {
            th.style.setProperty('background', primary, 'important');
            th.style.setProperty('background-color', primary, 'important');
            th.style.setProperty('color', '#ffffff', 'important');
            th.style.setProperty('border-color', 'rgba(255, 255, 255, 0.25)', 'important');
        });

        // 3. Grid Title bars (e.g. #bpGridTitle)
        const gridTitles = root.querySelectorAll('[id*="GridTitle"], [id*="gridTitle"]');
        gridTitles.forEach(function(gt) {
            gt.style.setProperty('background', primary, 'important');
            gt.style.setProperty('background-color', primary, 'important');
            gt.style.setProperty('color', '#ffffff', 'important');
        });

        // 4. Find modal header bars
        const findHdrs = root.querySelectorAll(`
            [id*="find_modal"] .modal-content > div:first-child,
            [id*="find_modal"] > div > div:first-child,
            [id*="_find_modal"] .modal-content > div:first-child,
            [id*="_find_modal"] > div > div:first-child
        `);
        findHdrs.forEach(function(fh) {
            fh.style.setProperty('background', primary, 'important');
            fh.style.setProperty('background-color', primary, 'important');
            fh.style.setProperty('color', '#ffffff', 'important');
        });

        // 5. Section titles inside maintain modules (e.g. "Customer Type", "List of Customers")
        const sectionTitles = root.querySelectorAll('div[style*="border-bottom: 2px solid"]');
        sectionTitles.forEach(function(st) {
            st.style.setProperty('color', primary, 'important');
            st.style.setProperty('border-bottom-color', primary, 'important');
        });

        // Set CSS variables on root so scoped styles and var(--theme-primary) inherit immediately
        if (root && root.style) {
            root.style.setProperty('--theme-primary', primary);
            root.style.setProperty('--primary-color', primary);
            root.style.setProperty('--theme-btn-hover', btnHover);
            root.style.setProperty('--theme-accent', accent);
        }
        if (document.documentElement && document.documentElement.style) {
            document.documentElement.style.setProperty('--theme-primary', primary);
            document.documentElement.style.setProperty('--primary-color', primary);
        }
        if (document.body && document.body.style) {
            document.body.style.setProperty('--theme-primary', primary);
            document.body.style.setProperty('--primary-color', primary);
        }

        // Digital Invoice Tabs & Window Header
        const fbrActiveTabs = root.querySelectorAll('.fbr-tab-btn.active');
        fbrActiveTabs.forEach(function(tab) {
            tab.style.setProperty('color', primary, 'important');
            tab.style.setProperty('border-bottom-color', primary, 'important');
        });
        const fbrHeaders = root.querySelectorAll('.modal-container.modal-digital-invoice .modal-header, .modal-container:has(.modal-body[data-module="Digital Invoice - Integration Settings"]) .modal-header');
        fbrHeaders.forEach(function(hdr) {
            hdr.style.setProperty('background', primary, 'important');
            hdr.style.setProperty('border-bottom', '2px solid ' + accent, 'important');
        });
        if (root.classList && (root.classList.contains('modal-digital-invoice') || root.querySelector?.('.modal-body[data-module="Digital Invoice - Integration Settings"]'))) {
            const h = root.querySelector('.modal-header');
            if (h) {
                h.style.setProperty('background', primary, 'important');
                h.style.setProperty('border-bottom', '2px solid ' + accent, 'important');
            }
        }

        // Drivers Form Window Header
        const drvHeaders = root.querySelectorAll('.modal-container.modal-drivers .modal-header, .modal-container:has(.modal-body[data-module="Drivers"]) .modal-header');
        drvHeaders.forEach(function(hdr) {
            hdr.style.setProperty('background', primary, 'important');
            hdr.style.setProperty('border-bottom', '2px solid ' + accent, 'important');
        });
        if (root.classList && (
            root.classList.contains('modal-drivers') || 
            root.classList.contains('modal-fbr-invoice') ||
            root.classList.contains('modal-fbr-credit-note') ||
            root.classList.contains('modal-fbr-debit-note') ||
            root.classList.contains('modal-fbr-cancellation') ||
            root.classList.contains('modal-digital-reports') ||
            root.classList.contains('modal-integration-log') ||
            root.classList.contains('modal-pos-sale') ||
            root.classList.contains('modal-pos-settings') ||
            root.classList.contains('modal-pos-reports') ||
            root.querySelector?.('.modal-body[data-module="Drivers"], .modal-body[data-module="FBR Digital Invoice"], .modal-body[data-module="FBR Digital Credit Note"], .modal-body[data-module="FBR Digital Debit Note"], .modal-body[data-module="FBR Invoice Cancellation"], .modal-body[data-module="Digital Invoice Reports"], .modal-body[data-module="Digital Invoice Integration Log"], .modal-body[data-module="POS Sale"], .modal-body[data-module="POS Settings"], .modal-body[data-module="POS Reports"], #posSaleContainer, #posSettingsContainer, #posReportsApp')
        )) {
            const h = root.querySelector('.modal-header');
            if (h) {
                h.style.setProperty('background', primary, 'important');
                h.style.setProperty('border-bottom', '2px solid ' + accent, 'important');
            }
        }

        // 6. Selected Rows & Active items
        const selRows = root.querySelectorAll(`
            tr.selected,
            tr.selected-row,
            tr.dc-selected-row,
            [class*="-row-selected"],
            tr.row-selected,
            .ob-row.selected
        `);
        selRows.forEach(function(row) {
            row.style.setProperty('background', primary, 'important');
            row.style.setProperty('background-color', primary, 'important');
            row.style.setProperty('color', '#ffffff', 'important');
            row.querySelectorAll('td:not(.row-selector):not(.dc-row-selector)').forEach(function(td) {
                td.style.setProperty('background', primary, 'important');
                td.style.setProperty('background-color', primary, 'important');
                td.style.setProperty('color', '#ffffff', 'important');
            });
            row.querySelectorAll('input').forEach(function(inp) {
                inp.style.setProperty('background', primary, 'important');
                inp.style.setProperty('background-color', primary, 'important');
                inp.style.setProperty('color', '#ffffff', 'important');
            });
        });

        // 6b. Driver Suggestions Dropdown Theme
        const driverSugg = root.querySelector('#dc_driver_suggestions');
        if (driverSugg) {
            driverSugg.style.setProperty('border-color', primary, 'important');
        }
        const selects = root.querySelectorAll('select');
        selects.forEach(function(sel) {
            sel.style.setProperty('--theme-primary', primary);
            const paintOptions = function() {
                const cur = window.getCurrentERPTheme();
                const p = (cur && cur.primary) ? cur.primary : primary;
                sel.querySelectorAll('option').forEach(function(opt) {
                    if (opt.selected) {
                        opt.style.setProperty('background', p, 'important');
                        opt.style.setProperty('background-color', p, 'important');
                        opt.style.setProperty('box-shadow', '0 0 10px 100px ' + p + ' inset', 'important');
                        opt.style.setProperty('-webkit-box-shadow', '0 0 10px 100px ' + p + ' inset', 'important');
                        opt.style.setProperty('color', '#ffffff', 'important');
                        opt.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
                    } else {
                        opt.style.removeProperty('box-shadow');
                        opt.style.removeProperty('-webkit-box-shadow');
                        opt.style.removeProperty('background');
                        opt.style.removeProperty('background-color');
                        opt.style.removeProperty('color');
                        opt.style.removeProperty('-webkit-text-fill-color');
                    }
                });
            };
            if (!sel._themeOptionBound) {
                sel._themeOptionBound = true;
                sel.addEventListener('change', paintOptions);
                sel.addEventListener('click', paintOptions);
                sel.addEventListener('keyup', paintOptions);
            }
            paintOptions();
        });
    };

    function setupERPThemeObserver() {
        if (window._erpThemeObserverSetup) return;
        window._erpThemeObserverSetup = true;
        const target = document.getElementById('window-manager') || document.body;
        if (!target) return;
        const observer = new MutationObserver(function(mutations) {
            let shouldApply = false;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.addedNodes && m.addedNodes.length) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const node = m.addedNodes[j];
                        if (node.nodeType === 1) {
                            if (
                                node.classList?.contains('modal-container') ||
                                node.classList?.contains('modal-body') ||
                                node.querySelector?.('.modal-container, .modal-body, table, [class*="-tool-btn"]')
                            ) {
                                shouldApply = true;
                                if (window.applyERPThemeToElement) {
                                    window.applyERPThemeToElement(node, window.getCurrentERPTheme());
                                }
                            }
                        }
                    }
                }
            }
            if (shouldApply) {
                const current = window.getCurrentERPTheme();
                document.querySelectorAll('.modal-container, #window-manager, .modal-body').forEach(function(win) {
                    window.applyERPThemeToElement(win, current);
                });
            }
        });
        observer.observe(target, { childList: true, subtree: true });
        if (target !== document.body) {
            observer.observe(document.body, { childList: true });
        }
    }
    window.setupERPThemeObserver = setupERPThemeObserver;

    window.applyERPTheme = function(theme) {
        if (!theme || !theme.primary) theme = window.DEFAULT_ERP_THEME;
        const primary = theme.primary;
        const toolbar = theme.toolbar || primary;
        const accent = theme.accent || '#F5A623';
        const btnHover = theme.btnHover || shadeColor(primary, -15);

        const targetDocs = [document];
        if (window.parent && window.parent.document && window.parent.document !== document) {
            targetDocs.push(window.parent.document);
        }

        targetDocs.forEach(function(doc) {
            let styleTag = doc.getElementById('softifyx-custom-theme-style');
            if (!styleTag) {
                styleTag = doc.createElement('style');
                styleTag.id = 'softifyx-custom-theme-style';
                doc.head.appendChild(styleTag);
            }

            styleTag.innerHTML = `
                :root {
                    --theme-primary: ${primary} !important;
                    --theme-toolbar: ${toolbar} !important;
                    --theme-accent: ${accent} !important;
                    --theme-btn-hover: ${btnHover} !important;
                }

                /* 1. Header & Navigation Branding */
                .branding-row { 
                    background: ${primary} !important; 
                }
                .toolbar-row { 
                    background: ${toolbar} !important; 
                }
                .divider { 
                    background: ${accent} !important; 
                }
                .company-title .company-name { 
                    color: ${accent} !important; 
                }
                .menu-item:hover { 
                    color: ${accent} !important; 
                }
                .welcome-user i { 
                    color: ${accent} !important; 
                }

                /* 2. Modal Popup Windows & Draggable Headers */
                .modal-header,
                .modal-container.focused .modal-header,
                .modal-container.modal-minimized .modal-header,
                .modal-container:has(.modal-body[data-module="Digital Invoice - Integration Settings"]) .modal-header,
                .modal-container:has(.modal-body[data-module="FBR Digital Invoice"]) .modal-header,
                .modal-container:has(.modal-body[data-module="FBR Digital Credit Note"]) .modal-header,
                .modal-container:has(.modal-body[data-module="FBR Digital Debit Note"]) .modal-header,
                .modal-container:has(.modal-body[data-module="FBR Invoice Cancellation"]) .modal-header,
                .modal-container:has(.modal-body[data-module="Digital Invoice Reports"]) .modal-header,
                .modal-container:has(.modal-body[data-module="Digital Invoice Integration Log"]) .modal-header,
                .modal-container:has(.modal-body[data-module="POS Sale"]) .modal-header,
                .modal-container:has(#posSaleContainer) .modal-header,
                .modal-container.modal-digital-invoice .modal-header,
                .modal-container.modal-fbr-invoice .modal-header,
                .modal-container.modal-fbr-credit-note .modal-header,
                .modal-container.modal-fbr-debit-note .modal-header,
                .modal-container.modal-fbr-cancellation .modal-header,
                .modal-container.modal-digital-reports .modal-header,
                .modal-container.modal-integration-log .modal-header,
                .modal-container.modal-pos-sale .modal-header,
                .modal-container:has(.modal-body[data-module="Drivers"]) .modal-header,
                .modal-container.modal-drivers .modal-header {
                    background: ${primary} !important;
                    border-bottom: 2px solid ${accent} !important;
                }
                .modal-container,
                .modal-container:has(.modal-body[data-module="FBR Digital Invoice"]),
                .modal-container:has(.modal-body[data-module="FBR Digital Credit Note"]),
                .modal-container:has(.modal-body[data-module="FBR Digital Debit Note"]),
                .modal-container:has(.modal-body[data-module="FBR Invoice Cancellation"]),
                .modal-container:has(.modal-body[data-module="Digital Invoice Reports"]),
                .modal-container:has(.modal-body[data-module="Digital Invoice Integration Log"]),
                .modal-container:has(.modal-body[data-module="POS Sale"]),
                .modal-container:has(#posSaleContainer),
                .modal-container.modal-digital-invoice,
                .modal-container.modal-fbr-invoice,
                .modal-container.modal-fbr-credit-note,
                .modal-container.modal-fbr-debit-note,
                .modal-container.modal-fbr-cancellation,
                .modal-container.modal-digital-reports,
                .modal-container.modal-integration-log,
                .modal-container.modal-pos-sale {
                    border-color: ${primary} !important;
                }
                .modal-container.active-window,
                .modal-container:has(.modal-body[data-module="FBR Digital Invoice"]).active-window,
                .modal-container:has(.modal-body[data-module="FBR Digital Credit Note"]).active-window,
                .modal-container:has(.modal-body[data-module="FBR Digital Debit Note"]).active-window,
                .modal-container:has(.modal-body[data-module="FBR Invoice Cancellation"]).active-window,
                .modal-container:has(.modal-body[data-module="Digital Invoice Reports"]).active-window,
                .modal-container:has(.modal-body[data-module="Digital Invoice Integration Log"]).active-window,
                .modal-container:has(.modal-body[data-module="POS Sale"]).active-window,
                .modal-container:has(#posSaleContainer).active-window,
                .modal-container.modal-digital-invoice.active-window,
                .modal-container.modal-fbr-invoice.active-window,
                .modal-container.modal-fbr-credit-note.active-window,
                .modal-container.modal-fbr-debit-note.active-window,
                .modal-container.modal-fbr-cancellation.active-window,
                .modal-container.modal-digital-reports.active-window,
                .modal-container.modal-integration-log.active-window,
                .modal-container.modal-pos-sale.active-window {
                    border-color: ${accent} !important;
                }
                .modal-container.modal-minimized {
                    background: ${primary} !important;
                    border: 2px solid ${primary} !important;
                }
                .modal-container.modal-minimized.active-window {
                    border-color: ${accent} !important;
                }
                .modal-controls .btn-min:hover {
                    background: ${accent} !important;
                    color: ${primary} !important;
                    border-color: ${accent} !important;
                }
                .fbr-tab-btn.active {
                    color: ${primary} !important;
                    border-bottom-color: ${primary} !important;
                }
                .fbr-tab-btn:hover {
                    color: ${primary} !important;
                }
                #fbr_branches_table thead th,
                #fbr_branches_table thead tr {
                    background: ${primary} !important;
                    color: #ffffff !important;
                }

                /* 3. Primary & Action Buttons Across the System */
                .btn-primary, 
                .btn-save,
                .fbr-btn-theme,
                .fbr-btn-primary,
                button.btn-primary,
                button.fbr-btn-theme,
                #btn_tab_test_conn,
                #btn_bottom_test_conn,
                #btn_tab_validate_sample,
                #btn_bottom_save_settings,
                #digitalInvoiceSettingsContainer button[onclick*="saveSettings"],
                #digitalInvoiceSettingsContainer button[onclick*="testConnection"],
                #digitalInvoiceSettingsContainer button[onclick*="validateSampleInvoice"],
                #di_btn_save,
                .di-btn-save,
                .di-workflow-btn.di-btn-save,
                .di-theme-bg,
                #di_items_table thead th,
                #cn_items_table thead th,
                button[onclick*="save"]:not(.btn-secondary):not(.btn-danger):not(.btn-outline-danger),
                .modal-actions .btn-success,
                .ob-btn:not(.ob-delete),
                #driverMaintenanceContainer .ob-btn:not(.ob-delete) {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    border-color: ${primary} !important;
                    color: #ffffff !important;
                }
                .btn-primary:hover, 
                .btn-save:hover,
                .fbr-btn-theme:hover,
                .fbr-btn-primary:hover,
                button.btn-primary:hover,
                button.fbr-btn-theme:hover,
                #btn_tab_test_conn:hover,
                #btn_bottom_test_conn:hover,
                #btn_tab_validate_sample:hover,
                #btn_bottom_save_settings:hover,
                #digitalInvoiceSettingsContainer button[onclick*="saveSettings"]:hover,
                #digitalInvoiceSettingsContainer button[onclick*="testConnection"]:hover,
                #digitalInvoiceSettingsContainer button[onclick*="validateSampleInvoice"]:hover,
                #di_btn_save:hover,
                .di-btn-save:hover,
                .di-workflow-btn.di-btn-save:hover,
                button[onclick*="save"]:not(.btn-secondary):not(.btn-danger):not(.btn-outline-danger):hover,
                .modal-actions .btn-success:hover,
                .ob-btn:not(.ob-delete):hover,
                #driverMaintenanceContainer .ob-btn:not(.ob-delete):hover {
                    background: ${btnHover} !important;
                    background-color: ${btnHover} !important;
                    border-color: ${btnHover} !important;
                    color: #ffffff !important;
                }

                /* 4. Dropdown Hovers & Active Elements */
                .dropdown-item:hover, .nested-item:hover {
                    background: #eef3fc !important;
                    color: ${primary} !important;
                }
                .dc-suggest div:hover,
                .so-suggest-item:hover,
                .dc-suggest div.active,
                .so-suggest-item.active,
                .dc-driver-suggest-item:hover,
                .dc-driver-suggest-item.active {
                    background: ${primary} !important;
                    color: #ffffff !important;
                }
                .dc-suggest div:hover *,
                .so-suggest-item:hover *,
                .dc-suggest div.active *,
                .so-suggest-item.active *,
                .dc-driver-suggest-item:hover *,
                .dc-driver-suggest-item.active * {
                    color: #ffffff !important;
                }
                #dc_driver_suggestions {
                    border-color: ${primary} !important;
                }

                /* 5. Dashboard Sidebar, Cards & Quick Actions */
                .section-header,
                .left-sidebar .section-header,
                .sidebar-section .section-header,
                .sidebar-section-header {
                    background: ${primary} !important;
                    color: #ffffff !important;
                }
                .section-header i,
                .left-sidebar .section-header i,
                .sidebar-section .section-header i {
                    color: ${accent} !important;
                }
                .welcome-card {
                    background: ${toolbar} !important;
                }
                .dashboard-logo {
                    background: ${primary} !important;
                    border: 1px solid rgba(255, 255, 255, 0.2) !important;
                    border-radius: 8px !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.18) !important;
                }
                .softifyx-title {
                    color: ${accent} !important;
                }
                .company-badge {
                    border-color: ${accent} !important;
                }
                .search-btn {
                    background: ${primary} !important;
                }
                .search-btn:hover {
                    background: ${btnHover} !important;
                }
                .search-input:focus {
                    border-color: ${primary} !important;
                }
                .stat-value, .financial-card h3, .widget-title, .summary-title, .summary-card h4, .financial-row .value, .summary-row .value {
                    color: ${primary} !important;
                }
                .financial-card h3, .summary-title {
                    border-bottom-color: ${accent} !important;
                }
                .stat-header i, .financial-card h3 i, .widget-title i, .summary-title i, .summary-card h4 i, .date-wrapper i, .sidebar-item i {
                    color: ${accent} !important;
                }
                .bar {
                    background: ${primary} !important;
                }
                .sidebar-item:hover {
                    color: ${primary} !important;
                }

                /* 6. POS Module Elements */
                .pos-top-bar .btn-primary:not([style*="background-color"]) {
                    background: ${primary} !important;
                    border-color: ${primary} !important;
                }
                .pos-reg-title i, .pos-dc-title i {
                    color: ${primary} !important;
                }

                /* 7. POS Reports Elements */
                .pos-reports-wrapper .pos-rep-sidebar-header {
                    border-bottom: 2px solid ${primary} !important;
                }
                .pos-reports-wrapper .pos-rep-sidebar-header i {
                    color: ${primary} !important;
                }
                .pos-reports-wrapper .pos-rep-nav-item.active {
                    background: #ebf8ff !important;
                    color: ${primary} !important;
                    border-left-color: ${primary} !important;
                }
                .pos-reports-wrapper .quick-date-btn.active {
                    background: ${primary} !important;
                    color: #ffffff !important;
                }
                .pos-reports-wrapper .pos-rep-table thead th {
                    border-bottom: 2px solid ${primary} !important;
                }

                /* 8. Compact Live Preview Box inside Settings */
                .theme-compact-preview-box {
                    border-color: ${primary} !important;
                }
                .theme-compact-preview-hdr {
                    background: ${primary} !important;
                }
                .theme-compact-preview-bar {
                    background: ${toolbar} !important;
                }
                .theme-compact-preview-btn {
                    background: ${primary} !important;
                    border-color: ${primary} !important;
                }

                /* 9. Modal Form Action Buttons (GJV, Invoices, Orders, Gate Passes, Inventory, Maintain, Reports, etc.) */
                html body .modal-container [class*="-tool-btn"]:not([class*="-btn-delete"]):not(.btn-danger):not([class*="delete"]),
                html body .modal-body [class*="-tool-btn"]:not([class*="-btn-delete"]):not(.btn-danger):not([class*="delete"]),
                html body [class*="-tool-btn"]:not([class*="-btn-delete"]):not(.btn-danger):not([class*="delete"]),
                html body .modal-container [class*="-btn-add"],
                html body .modal-container [class*="-btn-save"]:not([class*="-btn-delete"]):not(.btn-danger),
                html body .modal-container [class*="-btn-cancel"],
                html body .modal-container [class*="-btn-info"],
                html body .modal-container [class*="-btn-post"],
                html body .modal-container [class*="-btn-find"],
                html body .modal-container [class*="-btn-print"],
                html body .modal-container .coa-btn:not(.coa-delete),
                html body .modal-container .coa-chart,
                html body .modal-container .coa-find,
                html body .modal-container .coa-add,
                html body .modal-container .coa-save,
                html body .modal-container .coa-cancel,
                html body .modal-container .tb-btn,
                html body .modal-container .vub-btn,
                html body .modal-container .cub-btn,
                html body .modal-container .ib-btn,
                html body .modal-container .al-btn,
                html body .modal-container .ps-btn:not(.ps-btn-excel),
                html body .modal-container .sr-btn,
                html body .modal-container .pr-btn,
                html body [class*="-btn-add"],
                html body [class*="-btn-save"]:not([class*="-btn-delete"]):not(.btn-danger),
                html body [class*="-btn-cancel"],
                html body [class*="-btn-info"],
                html body [class*="-btn-post"],
                html body [class*="-btn-find"],
                html body [class*="-btn-print"],
                html body .coa-chart,
                html body .coa-find,
                html body .coa-add,
                html body .coa-save,
                html body .coa-cancel,
                html body .tb-btn,
                html body .vub-btn,
                html body .cub-btn,
                html body .ib-btn,
                html body .al-btn,
                html body .ps-btn:not(.ps-btn-excel),
                html body .sr-btn,
                html body .pr-btn,
                html body [id*="btn_display"],
                html body [id*="btn_print"],
                html body [id*="btn_excel"],
                html body [id*="_display"],
                html body [id*="_print"],
                html body [id*="_excel"],
                html body [id*="find_modal"] button[onclick*="Find"],
                html body [id*="find_modal"] button[onclick*="find"],
                html body [id*="find_modal"] button[onclick*="Refresh"],
                html body [id*="find_modal"] button[onclick*="render"],
                html body [id*="_find_modal"] button[onclick*="Find"],
                html body [id*="_find_modal"] button[onclick*="find"],
                html body [id*="_find_modal"] button[onclick*="Refresh"],
                html body [id*="_find_modal"] button[onclick*="render"] {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    border-color: ${primary} !important;
                    color: #ffffff !important;
                }

                html body .modal-container [class*="-tool-btn"]:not([class*="-btn-delete"]):not(.btn-danger):not([class*="delete"]):hover,
                html body .modal-body [class*="-tool-btn"]:not([class*="-btn-delete"]):not(.btn-danger):not([class*="delete"]):hover,
                html body [class*="-tool-btn"]:not([class*="-btn-delete"]):not(.btn-danger):not([class*="delete"]):hover,
                html body .modal-container [class*="-btn-add"]:hover,
                html body .modal-container [class*="-btn-save"]:not([class*="-btn-delete"]):not(.btn-danger):hover,
                html body .modal-container [class*="-btn-cancel"]:hover,
                html body .modal-container [class*="-btn-info"]:hover,
                html body .modal-container [class*="-btn-post"]:hover,
                html body .modal-container [class*="-btn-find"]:hover,
                html body .modal-container [class*="-btn-print"]:hover,
                html body .modal-container .coa-btn:not(.coa-delete):hover,
                html body .modal-container .coa-chart:hover,
                html body .modal-container .coa-find:hover,
                html body .modal-container .coa-add:hover,
                html body .modal-container .coa-save:hover,
                html body .modal-container .coa-cancel:hover,
                html body .modal-container .tb-btn:hover,
                html body .modal-container .vub-btn:hover,
                html body .modal-container .cub-btn:hover,
                html body .modal-container .ib-btn:hover,
                html body .modal-container .al-btn:hover,
                html body .modal-container .ps-btn:not(.ps-btn-excel):hover,
                html body .modal-container .sr-btn:hover,
                html body .modal-container .pr-btn:hover,
                html body [class*="-btn-add"]:hover,
                html body [class*="-btn-save"]:not([class*="-btn-delete"]):not(.btn-danger):hover,
                html body [class*="-btn-cancel"]:hover,
                html body [class*="-btn-info"]:hover,
                html body [class*="-btn-post"]:hover,
                html body [class*="-btn-find"]:hover,
                html body [class*="-btn-print"]:hover,
                html body .coa-chart:hover,
                html body .coa-find:hover,
                html body .coa-add:hover,
                html body .coa-save:hover,
                html body .coa-cancel:hover,
                html body .tb-btn:hover,
                html body .vub-btn:hover,
                html body .cub-btn:hover,
                html body .ib-btn:hover,
                html body .al-btn:hover,
                html body .ps-btn:not(.ps-btn-excel):hover,
                html body .sr-btn:hover,
                html body .pr-btn:hover,
                html body [id*="btn_display"]:hover,
                html body [id*="btn_print"]:hover,
                html body [id*="btn_excel"]:hover,
                html body [id*="_display"]:hover,
                html body [id*="_print"]:hover,
                html body [id*="_excel"]:hover,
                html body [id*="find_modal"] button[onclick*="Find"]:hover,
                html body [id*="find_modal"] button[onclick*="find"]:hover,
                html body [id*="find_modal"] button[onclick*="Refresh"]:hover,
                html body [id*="find_modal"] button[onclick*="render"]:hover,
                html body [id*="_find_modal"] button[onclick*="Find"]:hover,
                html body [id*="_find_modal"] button[onclick*="find"]:hover,
                html body [id*="_find_modal"] button[onclick*="Refresh"]:hover,
                html body [id*="_find_modal"] button[onclick*="render"]:hover {
                    background: ${btnHover} !important;
                    background-color: ${btnHover} !important;
                    border-color: ${btnHover} !important;
                    color: #ffffff !important;
                }

                /* 10. Delete & Danger Buttons MUST Remain Red */
                html body .modal-container [class*="-btn-delete"],
                html body .modal-body [class*="-btn-delete"],
                html body [class*="-btn-delete"],
                html body .modal-container .coa-delete,
                html body .coa-delete,
                html body .modal-container .btn-danger,
                html body .btn-danger {
                    background: #dc3545 !important;
                    background-color: #dc3545 !important;
                    border-color: #dc3545 !important;
                    color: #ffffff !important;
                }
                html body .modal-container [class*="-btn-delete"]:hover,
                html body .modal-body [class*="-btn-delete"]:hover,
                html body [class*="-btn-delete"]:hover,
                html body .modal-container .coa-delete:hover,
                html body .coa-delete:hover,
                html body .modal-container .btn-danger:hover,
                html body .btn-danger:hover {
                    background: #c82333 !important;
                    background-color: #c82333 !important;
                    border-color: #bd2130 !important;
                    color: #ffffff !important;
                }

                /* 11. Modal Grid Tables & Table Headers */
                html body .modal-container table thead,
                html body .modal-container table thead tr,
                html body .modal-container table thead th,
                html body .modal-body table thead,
                html body .modal-body table thead tr,
                html body .modal-body table thead th,
                html body [id*="Grid"] thead,
                html body [id*="Grid"] thead tr,
                html body [id*="Grid"] thead th,
                html body [id*="GridHeader"],
                html body [id*="GridHeader"] th,
                html body [id*="grid"] thead,
                html body [id*="grid"] thead tr,
                html body [id*="grid"] thead th,
                html body [id*="gridHeader"],
                html body [id*="gridHeader"] th,
                html body [class*="-grid-header"] th,
                html body table.table thead th,
                html body .report-table thead th,
                html body table[id*="Grid"] th,
                html body table[id*="grid"] th,
                html body [id*="find_table"] thead th,
                html body [id*="find_modal"] table thead th,
                html body [id*="_find_modal"] table thead th {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    color: #ffffff !important;
                    border-color: rgba(255, 255, 255, 0.25) !important;
                }

                /* 12. Grid Titles & Sub-dialog / Find window headers */
                html body [id*="GridTitle"],
                html body [id*="gridTitle"],
                html body [id*="find_modal"] .modal-content > div:first-child,
                html body [id*="find_modal"] > div > div:first-child,
                html body [id*="_find_modal"] .modal-content > div:first-child,
                html body [id*="_find_modal"] > div > div:first-child {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    color: #ffffff !important;
                }

                /* 13. Selected Rows & Items Across ALL Forms, Maintain Modules, and Reports */
                html body .modal-container table tbody tr.selected,
                html body .modal-container table tbody tr.selected td,
                html body .modal-body table tbody tr.selected,
                html body .modal-body table tbody tr.selected td,
                html body table tbody tr.selected,
                html body table tbody tr.selected td,
                html body .tb-table tbody tr.selected,
                html body .tb-table tbody tr.selected td,
                html body .cub-table tbody tr.selected,
                html body .cub-table tbody tr.selected td,
                html body .vub-table tbody tr.selected,
                html body .vub-table tbody tr.selected td,
                html body .cbb-table tbody tr.selected,
                html body .cbb-table tbody tr.selected td,
                html body [id*="_tbody"] tr.selected,
                html body [id*="_tbody"] tr.selected td,
                html body [id*="find_table"] tr.selected,
                html body [id*="find_table"] tr.selected td,
                html body .legacy-find-modal .legacy-grid tr.selected,
                html body .legacy-find-modal .legacy-grid tr.selected td,
                html body tr.selected-row td:not(.row-selector),
                html body .modal-container tr.selected-row td:not(.row-selector),
                html body .modal-container tr.dc-selected-row td:not(.dc-row-selector),
                html body tr.dc-selected-row td:not(.dc-row-selector),
                html body [class*="-row-selected"]:not(.row-selector),
                html body .modal-container [class*="-row-selected"]:not(.row-selector),
                html body [class*="-row-selected"] td:not(.row-selector),
                html body .modal-container [class*="-row-selected"] td:not(.row-selector),
                html body tr.row-selected,
                html body tr.row-selected td,
                html body .modal-container tr.row-selected,
                html body .modal-container tr.row-selected td,
                html body [id*="TableBody"] tr.row-selected,
                html body [id*="TableBody"] tr.row-selected td,
                html body .ob-row.selected,
                html body .ob-row.selected:hover,
                html body .ob-row.selected .ob-col,
                html body .modal-container .ob-row.selected,
                html body .modal-container .ob-row.selected:hover,
                html body .modal-container .ob-row.selected .ob-col,
                html body .softify-custom-select-menu div.selected,
                html body .custom-dropdown-item.selected,
                html body .ob-result-item.selected {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    color: #ffffff !important;
                }

                /* 14. Maintain Select Listboxes & Checked Options */
                html body .modal-container select option:checked,
                html body .modal-container select[size] option:checked,
                html body .modal-body select option:checked,
                html body .modal-body select[size] option:checked,
                html body select option:checked,
                html body select[size] option:checked,
                html body option:checked,
                html body #customersContainer select option:checked,
                html body #vendorsContainer select option:checked,
                html body #coaContainer select option:checked,
                html body #invCOAContainer select option:checked,
                html body #chartOfServicesContainer select option:checked,
                html body #bankAccountsContainer select option:checked,
                html body #employeesContainer select option:checked,
                html body #sectorsContainer select option:checked,
                html body #regionsContainer select option:checked,
                html body #custTypeTaxList option:checked,
                html body #locationMaintList option:checked,
                html body #itemClassMaintList option:checked,
                html body #itemFittingTypeMaintList option:checked,
                html body #itemLengthMaintList option:checked,
                html body #itemSignMaintList option:checked,
                html body #itemSizeMaintList option:checked,
                html body #brandMaintList option:checked,
                html body #hsCodeMaintList option:checked,
                html body [id*="Container"] select option:checked,
                html body [id*="container"] select option:checked,
                html body [id*="List"] option:checked,
                html body [id*="list"] option:checked,
                html body .coa-list option:checked {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    box-shadow: 0 0 10px 100px ${primary} inset !important;
                    -webkit-box-shadow: 0 0 10px 100px ${primary} inset !important;
                    color: #ffffff !important;
                    -webkit-text-fill-color: #ffffff !important;
                }

                /* Inputs inside selected rows */
                html body tr.selected-row td:not(.row-selector) input,
                html body .modal-container tr.selected-row td:not(.row-selector) input,
                html body tr.dc-selected-row td:not(.dc-row-selector) input,
                html body .modal-container tr.dc-selected-row td:not(.dc-row-selector) input,
                html body [class*="-row-selected"] input,
                html body .modal-container [class*="-row-selected"] input,
                html body tr.row-selected input,
                html body .modal-container tr.row-selected input,
                html body tr.row-selected [class*="-input-cell"],
                html body .ob-row.selected .ob-input,
                html body .modal-container .ob-row.selected .ob-input {
                    background: ${primary} !important;
                    background-color: ${primary} !important;
                    color: #ffffff !important;
                }

                html body tr.selected-row td:not(.row-selector) input:focus,
                html body .modal-container tr.selected-row td:not(.row-selector) input:focus,
                html body [class*="-row-selected"] input:focus,
                html body tr.row-selected input:focus,
                html body .ob-row.selected .ob-input:focus {
                    background: #ffffff !important;
                    color: #111827 !important;
                }

                html body tr.row-selected .row-arrow {
                    color: #ffffff !important;
                    visibility: visible !important;
                }

                html body .tb-suggest div:hover {
                    background: ${primary} !important;
                    color: #ffffff !important;
                }

                html body .modal-container div[style*="border-bottom: 2px solid"] {
                    color: ${primary} !important;
                    border-bottom-color: ${primary} !important;
                }
            `;

            // Instant visual paint on high-level navigation
            const tb = doc.querySelector('.branding-row'); if (tb) tb.style.backgroundColor = primary;
            const tt = doc.querySelector('.toolbar-row'); if (tt) tt.style.backgroundColor = toolbar;
            const td = doc.querySelector('.divider'); if (td) td.style.backgroundColor = accent;
            const tc = doc.querySelector('.company-title .company-name'); if (tc) tc.style.color = accent;

            // Paint left-sidebar section headers (Record New, View)
            doc.querySelectorAll('.section-header, .left-sidebar .section-header').forEach(function(el) {
                el.style.backgroundColor = primary;
            });
            doc.querySelectorAll('.section-header i, .left-sidebar .section-header i').forEach(function(el) {
                el.style.color = accent;
            });

            // Paint dashboard welcome card and logo card
            const wc = doc.querySelector('.welcome-card');
            if (wc) wc.style.backgroundColor = toolbar;
            const dl = doc.getElementById('dashLogo');
            if (dl) {
                dl.style.backgroundColor = primary;
                dl.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }

            // Paint all open modal containers and form elements
            doc.querySelectorAll('.modal-container, #window-manager, .modal-body').forEach(function(win) {
                window.applyERPThemeToElement(win, theme);
            });
        });

        // Update preview components if currently rendered
        const prevHdr = document.querySelector('.theme-compact-preview-hdr');
        const prevBar = document.querySelector('.theme-compact-preview-bar');
        const prevBtn = document.querySelector('.theme-compact-preview-btn');
        const prevBox = document.querySelector('.theme-compact-preview-box');
        if (prevBox) prevBox.style.borderColor = primary;
        if (prevHdr) prevHdr.style.backgroundColor = primary;
        if (prevBar) prevBar.style.backgroundColor = toolbar;
        if (prevBtn) {
            prevBtn.style.backgroundColor = primary;
            prevBtn.style.borderColor = primary;
        }
    };

    window.saveERPTheme = async function(theme) {
        if (!theme) return;
        localStorage.setItem('softifyx_theme', JSON.stringify(theme));
        window.applyERPTheme(theme);

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: 'erp_theme',
                    value: JSON.stringify(theme)
                })
            });
        } catch(e) {
            console.warn('Failed to sync theme with server:', e);
        }
    };

    window.resetThemeToDefault = async function() {
        const def = Object.assign({}, window.DEFAULT_ERP_THEME);
        await window.saveERPTheme(def);
        if (typeof window.initThemeSettingsInputs === 'function') {
            window.initThemeSettingsInputs();
        }
        alert('Theme reset to default SoftifyX Classic Navy.');
    };

    window.initThemeSettingsInputs = function() {
        const theme = window.getCurrentERPTheme();
        const pickP = document.getElementById('theme_picker_primary');
        const hexP = document.getElementById('theme_hex_primary');
        const pickT = document.getElementById('theme_picker_toolbar');
        const hexT = document.getElementById('theme_hex_toolbar');
        const pickA = document.getElementById('theme_picker_accent');
        const hexA = document.getElementById('theme_hex_accent');

        if (pickP) pickP.value = theme.primary;
        if (hexP) hexP.value = theme.primary;
        if (pickT) pickT.value = theme.toolbar || theme.primary;
        if (hexT) hexT.value = theme.toolbar || theme.primary;
        if (pickA) pickA.value = theme.accent || '#F5A623';
        if (hexA) hexA.value = theme.accent || '#F5A623';

        const container = document.getElementById('theme_presets_list');
        if (container && window.ERP_THEME_PRESETS) {
            container.innerHTML = window.ERP_THEME_PRESETS.map(function(p, idx) {
                const isActive = (p.primary.toLowerCase() === theme.primary.toLowerCase());
                return `
                    <button type="button" class="theme-preset-pill ${isActive ? 'active' : ''}" onclick="window.selectERPThemePreset(${idx})" title="${p.name}">
                        <span class="theme-pill-dot" style="background:${p.primary};"></span>
                        <span class="theme-pill-dot" style="background:${p.toolbar};"></span>
                        <span class="theme-pill-dot" style="background:${p.accent};"></span>
                        <span>${p.name}</span>
                    </button>
                `;
            }).join('');
        }

        window.applyERPTheme(theme);
    };

    window.selectERPThemePreset = function(idx) {
        if (!window.ERP_THEME_PRESETS || !window.ERP_THEME_PRESETS[idx]) return;
        const p = window.ERP_THEME_PRESETS[idx];
        const pickP = document.getElementById('theme_picker_primary');
        const hexP = document.getElementById('theme_hex_primary');
        const pickT = document.getElementById('theme_picker_toolbar');
        const hexT = document.getElementById('theme_hex_toolbar');
        const pickA = document.getElementById('theme_picker_accent');
        const hexA = document.getElementById('theme_hex_accent');

        if (pickP) pickP.value = p.primary;
        if (hexP) hexP.value = p.primary;
        if (pickT) pickT.value = p.toolbar;
        if (hexT) hexT.value = p.toolbar;
        if (pickA) pickA.value = p.accent;
        if (hexA) hexA.value = p.accent;

        document.querySelectorAll('.theme-preset-pill').forEach(function(el, i) {
            if (i === idx) el.classList.add('active');
            else el.classList.remove('active');
        });

        window.applyERPTheme(p);
    };

    window.handleThemePickerChange = function(type, val) {
        if (type === 'primary') {
            const h = document.getElementById('theme_hex_primary'); if (h) h.value = val;
        } else if (type === 'toolbar') {
            const h = document.getElementById('theme_hex_toolbar'); if (h) h.value = val;
        } else if (type === 'accent') {
            const h = document.getElementById('theme_hex_accent'); if (h) h.value = val;
        }
        window.triggerLiveThemeUpdate();
    };

    window.handleThemeHexChange = function(type, val) {
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
            if (type === 'primary') {
                const p = document.getElementById('theme_picker_primary'); if (p) p.value = val;
            } else if (type === 'toolbar') {
                const p = document.getElementById('theme_picker_toolbar'); if (p) p.value = val;
            } else if (type === 'accent') {
                const p = document.getElementById('theme_picker_accent'); if (p) p.value = val;
            }
            window.triggerLiveThemeUpdate();
        }
    };

    window.triggerLiveThemeUpdate = function() {
        const p = document.getElementById('theme_hex_primary')?.value || '#1F4E79';
        const t = document.getElementById('theme_hex_toolbar')?.value || '#214F77';
        const a = document.getElementById('theme_hex_accent')?.value || '#F5A623';
        window.applyERPTheme({
            primary: p,
            toolbar: t,
            accent: a,
            btnHover: shadeColor(p, -15)
        });
    };

    // Auto-apply stored theme immediately on script execution
    const currentTheme = window.getCurrentERPTheme();
    window.applyERPTheme(currentTheme);

    // Also fetch saved theme from server if logged in
    try {
        const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
        const companyId = session.company_id || 1;
        fetch('api/settings.php?action=get_setting&key=erp_theme&company_id=' + companyId)
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data && data.value) {
                    try {
                        const serverTheme = JSON.parse(data.value);
                        if (serverTheme && serverTheme.primary) {
                            localStorage.setItem('softifyx_theme', JSON.stringify(serverTheme));
                            window.applyERPTheme(serverTheme);
                            if (typeof window.initThemeSettingsInputs === 'function') {
                                window.initThemeSettingsInputs();
                            }
                        }
                    } catch(e) {}
                }
            }).catch(function() {});
    } catch(e) {}

    // Global Navbar Module Synchronizer
    window.syncNavbarModules = async function() {
        try {
            const sessionStr = localStorage.getItem('softifyx_session');
            const sess = sessionStr ? JSON.parse(sessionStr) : {};
            const companyId = sess.company_id || 1;
            const isPosRole = (sess.role === 'POS' || String(sess.role).toLowerCase() === 'pos');

            const fbrMenu = document.getElementById('fbrMenu');
            const posMenu = document.getElementById('posMenu');

            // 1. Instant local display from localStorage (zero delay on refresh)
            const localFbr = localStorage.getItem('module_fbr_enabled');
            const localPos = localStorage.getItem('module_pos_enabled');

            if (fbrMenu && localFbr !== null) {
                fbrMenu.style.display = (localFbr === '1') ? 'inline-block' : 'none';
            }
            if (posMenu && localPos !== null) {
                posMenu.style.display = (isPosRole || localPos === '1') ? 'inline-block' : 'none';
            }

            // 3. Digital Invoicing Integration Settings item visibility (zero delay)
            const localFbrIntegration = localStorage.getItem('fbr_allow_integration_settings');
            const fbrIntegrationItem = document.getElementById('fbrMenuIntegrationSettings');
            if (fbrIntegrationItem && localFbrIntegration !== null) {
                fbrIntegrationItem.style.display = (localFbrIntegration === '0') ? 'none' : '';
            }

            // 4. Fetch latest verified settings from API with cache-busting
            const [rFbr, rPos, rFbrInteg, rSaleInv] = await Promise.all([
                fetch(`api/settings.php?action=get_setting&key=module_fbr_enabled&company_id=${companyId}&_t=${Date.now()}`),
                fetch(`api/settings.php?action=get_setting&key=module_pos_enabled&company_id=${companyId}&_t=${Date.now()}`),
                fetch(`api/settings.php?action=get_setting&key=fbr_allow_integration_settings&company_id=${companyId}&_t=${Date.now()}`),
                fetch(`api/settings.php?action=get_setting&key=default_sale_invoice&company_id=${companyId}&_t=${Date.now()}`)
            ]);

            if (rFbr.ok) {
                const dFbr = await rFbr.json();
                if (dFbr && dFbr.value !== null && dFbr.value !== undefined) {
                    const val = String(dFbr.value);
                    localStorage.setItem('module_fbr_enabled', val);
                    const m = document.getElementById('fbrMenu');
                    if (m) m.style.display = (val === '1') ? 'inline-block' : 'none';
                }
            }
            if (rPos.ok) {
                const dPos = await rPos.json();
                if (dPos && dPos.value !== null && dPos.value !== undefined) {
                    const val = String(dPos.value);
                    localStorage.setItem('module_pos_enabled', val);
                    const m = document.getElementById('posMenu');
                    if (m) m.style.display = (isPosRole || val === '1') ? 'inline-block' : 'none';
                }
            }
            if (rFbrInteg.ok) {
                const dInteg = await rFbrInteg.json();
                if (dInteg && dInteg.value !== null && dInteg.value !== undefined) {
                    const val = String(dInteg.value);
                    localStorage.setItem('fbr_allow_integration_settings', val);
                    const itm = document.getElementById('fbrMenuIntegrationSettings');
                    if (itm) itm.style.display = (val === '0') ? 'none' : '';
                }
            }
            if (rSaleInv && rSaleInv.ok) {
                const dSaleInv = await rSaleInv.json();
                if (dSaleInv && dSaleInv.value) {
                    localStorage.setItem('default_sale_invoice', dSaleInv.value);
                }
            }
        } catch(e) {
            console.error('syncNavbarModules error:', e);
        }
    };

    // =========================================================================
    // CUSTOM REGION LABELS ENGINE (Main Region, Sub Region, List)
    // =========================================================================
    window.getCustomRegionLabels = function() {
        return {
            main: (localStorage.getItem('custom_label_main_region') || '').trim() || 'Main Region',
            sub: (localStorage.getItem('custom_label_sub_region') || '').trim() || 'Sub Region',
            list: (localStorage.getItem('custom_label_list_region') || '').trim() || 'List'
        };
    };

    window.initRegionLabelsInputs = function() {
        const labels = window.getCustomRegionLabels();
        const inpMain = document.getElementById('setting_custom_label_main_region');
        const inpSub = document.getElementById('setting_custom_label_sub_region');
        const inpList = document.getElementById('setting_custom_label_list_region');

        if (inpMain) inpMain.value = labels.main;
        if (inpSub) inpSub.value = labels.sub;
        if (inpList) inpList.value = labels.list;

        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();

        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            fetch('api/settings.php?action=get_setting&key=custom_label_main_region&company_id=' + companyId + '&_t=' + Date.now())
                .then(r => r.json())
                .then(d => {
                    if (d && d.value) {
                        localStorage.setItem('custom_label_main_region', d.value);
                        if (inpMain) inpMain.value = d.value;
                        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
                        if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();
                    }
                }).catch(() => {});

            fetch('api/settings.php?action=get_setting&key=custom_label_sub_region&company_id=' + companyId + '&_t=' + Date.now())
                .then(r => r.json())
                .then(d => {
                    if (d && d.value) {
                        localStorage.setItem('custom_label_sub_region', d.value);
                        if (inpSub) inpSub.value = d.value;
                        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
                        if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();
                    }
                }).catch(() => {});

            fetch('api/settings.php?action=get_setting&key=custom_label_list_region&company_id=' + companyId + '&_t=' + Date.now())
                .then(r => r.json())
                .then(d => {
                    if (d && d.value) {
                        localStorage.setItem('custom_label_list_region', d.value);
                        if (inpList) inpList.value = d.value;
                        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
                        if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();
                    }
                }).catch(() => {});
        } catch(e) {}
    };

    window.applyCustomRegionLabels = function(root) {
        const labels = window.getCustomRegionLabels();
        const target = root || document;

        const getEl = function(id) {
            if (target && target.querySelector) {
                const el = target.querySelector('#' + id);
                if (el) return el;
            }
            return document.getElementById(id);
        };

        // 1. Customer Regions Hierarchy Form
        const sec1Title = getEl('cr_sec1_title');
        if (sec1Title) sec1Title.textContent = labels.main;
        const sec1Label = getEl('cr_sec1_label');
        if (sec1Label) sec1Label.textContent = labels.main;
        const mainInput = getEl('mainRegionName');
        if (mainInput) mainInput.placeholder = 'Enter ' + labels.main + ' Name';

        const sec2Title = getEl('cr_sec2_title');
        if (sec2Title) sec2Title.textContent = labels.sub;
        const sec2Label = getEl('cr_sec2_label');
        if (sec2Label) sec2Label.textContent = labels.sub;
        const subInput = getEl('subRegionName');
        if (subInput) subInput.placeholder = 'Enter ' + labels.sub + ' Name';

        const sec3Title = getEl('cr_sec3_title');
        if (sec3Title) sec3Title.textContent = labels.list.toUpperCase() + ' (Area / Sector / Territory)';
        const sec3Label = getEl('cr_sec3_label');
        if (sec3Label) sec3Label.textContent = labels.list;
        const listInput = getEl('listRegionName');
        if (listInput) listInput.placeholder = 'Enter ' + labels.list + ' Name';

        const breadcrumb = getEl('cr_title_breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `(${labels.main} &rarr; ${labels.sub} &rarr; ${labels.list})`;
        }

        // 2. Customers Maintenance Form
        const custLblReg = getEl('custLblRegion');
        if (custLblReg) custLblReg.textContent = labels.main;
        const custLblSub = getEl('custLblSubRegion');
        if (custLblSub) custLblSub.textContent = labels.sub;
        const custLblList = getEl('custLblListRegion');
        if (custLblList) custLblList.textContent = labels.list;

        // 3. Document-wide query for data-region-role attributes
        const updateRoleElements = function(scope) {
            if (!scope || !scope.querySelectorAll) return;
            scope.querySelectorAll('[data-region-role="main"]').forEach(el => {
                el.textContent = labels.main;
            });
            scope.querySelectorAll('[data-region-role="sub"]').forEach(el => {
                el.textContent = labels.sub;
            });
            scope.querySelectorAll('[data-region-role="list"]').forEach(el => {
                el.textContent = labels.list;
            });
        };

        if (target && target !== document) {
            updateRoleElements(target);
        }
        updateRoleElements(document);
    };

    window.updateRegionLabelsPreview = function() {
        const m = (document.getElementById('setting_custom_label_main_region')?.value || '').trim() || (localStorage.getItem('custom_label_main_region') || 'Main Region');
        const s = (document.getElementById('setting_custom_label_sub_region')?.value || '').trim() || (localStorage.getItem('custom_label_sub_region') || 'Sub Region');
        const l = (document.getElementById('setting_custom_label_list_region')?.value || '').trim() || (localStorage.getItem('custom_label_list_region') || 'List');

        const pM = document.getElementById('preview_lbl_main');
        if (pM) pM.textContent = m;
        const pS = document.getElementById('preview_lbl_sub');
        if (pS) pS.textContent = s;
        const pL = document.getElementById('preview_lbl_list');
        if (pL) pL.textContent = l;
    };

    window.resetRegionLabelsToDefault = function() {
        const inpMain = document.getElementById('setting_custom_label_main_region');
        if (inpMain) inpMain.value = 'Main Region';
        const inpSub = document.getElementById('setting_custom_label_sub_region');
        if (inpSub) inpSub.value = 'Sub Region';
        const inpList = document.getElementById('setting_custom_label_list_region');
        if (inpList) inpList.value = 'List';
        window.updateRegionLabelsPreview();
        if (window.saveRegionLabelsOnly) window.saveRegionLabelsOnly();
    };

    window.saveRegionLabelsOnly = async function(isSilent = false) {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            const inpMain = document.getElementById('setting_custom_label_main_region');
            const inpSub = document.getElementById('setting_custom_label_sub_region');
            const inpList = document.getElementById('setting_custom_label_list_region');

            const mainVal = (inpMain?.value || '').trim() || 'Main Region';
            const subVal = (inpSub?.value || '').trim() || 'Sub Region';
            const listVal = (inpList?.value || '').trim() || 'List';

            if (inpMain) inpMain.value = mainVal;
            if (inpSub) inpSub.value = subVal;
            if (inpList) inpList.value = listVal;

            localStorage.setItem('custom_label_main_region', mainVal);
            localStorage.setItem('custom_label_sub_region', subVal);
            localStorage.setItem('custom_label_list_region', listVal);

            if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
            if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();

            const fb = document.getElementById('save_feedback_msg_regions');
            if (fb) {
                fb.style.display = 'inline-block';
                setTimeout(() => { fb.style.display = 'none'; }, 4000);
            }

            await Promise.all([
                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_main_region', value: mainVal })
                }),
                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_sub_region', value: subVal })
                }),
                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_list_region', value: listVal })
                }),
                fetch('api/settings.php?action=save_global_setting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_main_region', value: mainVal })
                }),
                fetch('api/settings.php?action=save_global_setting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_sub_region', value: subVal })
                }),
                fetch('api/settings.php?action=save_global_setting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_list_region', value: listVal })
                })
            ]).catch(e => console.warn(e));

            if (!isSilent) {
                alert(`Region labels saved and updated successfully!\n\nMain Region: ${mainVal}\nSub Region: ${subVal}\nList / Area: ${listVal}`);
            }
        } catch(e) {
            console.error('saveRegionLabelsOnly error:', e);
            if (!isSilent) alert('Error saving region labels: ' + (e.message || e));
        }
    };

    // =========================================================================
    // INVOICE GRID & CATEGORY SETTINGS ENGINE
    // =========================================================================
    window.getDefaultInvoiceCustomSettings = function() {
        return {
            columns: {
                hs_code: true,
                description: true,
                unit: true,
                rate: true,
                gross_amt: true,
                disc_perc: true,
                disc_amt: true,
                sales_tax: true,
                further_tax: true,
                net_amt: true
            },
            categories: {
                'PVC PIPE': {
                    col1: { show: true, label: 'PCS' },
                    col2: { show: true, label: 'LENGTH' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Kgs',
                    rate_basis: 'col3',
                    type: 'pipe'
                },
                'PVC FITTING': {
                    col1: { show: true, label: 'CTN' },
                    col2: { show: true, label: 'PCS' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Ctn',
                    rate_basis: 'col2',
                    type: 'fitting'
                },
                'HDPE PIPE': {
                    col1: { show: true, label: 'PCS' },
                    col2: { show: true, label: 'LENGTH' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Mtr',
                    rate_basis: 'col2',
                    type: 'pipe'
                },
                'PPRC PIPE': {
                    col1: { show: true, label: 'PCS' },
                    col2: { show: true, label: 'LENGTH' },
                    col3: { show: true, label: 'WEIGHT' },
                    default_unit: 'Pcs',
                    rate_basis: 'col1',
                    type: 'pipe'
                },
                'GENERAL': {
                    col1: { show: true, label: 'QTY' },
                    col2: { show: false, label: 'COL 2' },
                    col3: { show: false, label: 'COL 3' },
                    default_unit: 'Pcs',
                    rate_basis: 'col1',
                    type: 'general'
                }
            }
        };
    };

    window.getInvoiceCustomSettings = function() {
        const defaults = window.getDefaultInvoiceCustomSettings();
        try {
            const raw = localStorage.getItem('sale_invoice_custom_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    columns: Object.assign({}, defaults.columns, parsed.columns || {}),
                    categories: Object.assign({}, defaults.categories, parsed.categories || {})
                };
            }
        } catch(e) {}
        return defaults;
    };

    window.initInvoiceGridSettings = async function() {
        const tbody = document.getElementById('invoice_grid_categories_tbody');
        if (!tbody) return;

        let settings = window.getInvoiceCustomSettings();

        // Also fetch from backend asynchronously to be sure
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            const res = await fetch(`api/settings.php?action=get_setting&key=sale_invoice_custom_settings&company_id=${companyId}&_t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.value) {
                    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                    if (parsed && typeof parsed === 'object') {
                        settings = {
                            columns: Object.assign({}, settings.columns, parsed.columns || {}),
                            categories: Object.assign({}, settings.categories, parsed.categories || {})
                        };
                        localStorage.setItem('sale_invoice_custom_settings', JSON.stringify(settings));
                    }
                }
            }
        } catch(e) {}

        // 1. Populate General Columns checkboxes
        const colKeys = ['hs_code', 'description', 'unit', 'rate', 'gross_amt', 'disc_perc', 'disc_amt', 'sales_tax', 'further_tax', 'net_amt'];
        colKeys.forEach(k => {
            const el = document.getElementById(`inv_col_${k}`);
            if (el) {
                el.checked = (settings.columns[k] !== false);
            }
        });

        // 2. Populate Categories Table
        const defaultCats = window.getDefaultInvoiceCustomSettings().categories;
        const allCatKeys = Array.from(new Set([...Object.keys(defaultCats), ...Object.keys(settings.categories || {})]));

        const availableUnits = ['Kgs', 'Ctn', 'Pcs', 'Feet', 'Mtr', 'Bundle', 'Box', 'Dozen', 'Roll', 'Set'];

        let rowsHtml = '';
        allCatKeys.forEach(catKey => {
            const cat = Object.assign({}, defaultCats[catKey] || {}, (settings.categories && settings.categories[catKey]) || {});
            const col1 = cat.col1 || { show: true, label: 'PCS' };
            const col2 = cat.col2 || { show: true, label: 'LENGTH' };
            const col3 = cat.col3 || { show: true, label: 'WEIGHT' };
            const defUnit = cat.default_unit || 'Pcs';
            const rateBasis = cat.rate_basis || 'col1';

            const unitOpts = availableUnits.map(u => `<option value="${u}" ${u.toLowerCase() === defUnit.toLowerCase() ? 'selected' : ''}>${u}</option>`).join('');

            rowsHtml += `
                <tr data-cat-key="${catKey}" style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-weight: 700; color: #1e293b;">
                        <div style="font-size: 12px; font-weight: 700; color: #002060;">${catKey}</div>
                        <div style="font-size: 10px; color: #64748b; font-weight: 500; text-transform: uppercase;">${cat.type || 'Standard'}</div>
                    </td>
                    <td style="padding: 6px 10px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="checkbox" class="cat-col1-show" ${col1.show !== false ? 'checked' : ''} style="width: 15px; height: 15px; cursor: pointer; accent-color: #2563eb;" title="Show/Hide Col 1">
                            <input type="text" class="form-control cat-col1-label" value="${col1.label || ''}" placeholder="Label 1" style="height: 28px !important; min-height: 28px !important; font-size: 11.5px !important; width: 95px; padding: 2px 6px !important; font-weight: 600;">
                        </div>
                    </td>
                    <td style="padding: 6px 10px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="checkbox" class="cat-col2-show" ${col2.show !== false ? 'checked' : ''} style="width: 15px; height: 15px; cursor: pointer; accent-color: #2563eb;" title="Show/Hide Col 2">
                            <input type="text" class="form-control cat-col2-label" value="${col2.label || ''}" placeholder="Label 2" style="height: 28px !important; min-height: 28px !important; font-size: 11.5px !important; width: 95px; padding: 2px 6px !important; font-weight: 600;">
                        </div>
                    </td>
                    <td style="padding: 6px 10px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="checkbox" class="cat-col3-show" ${col3.show !== false ? 'checked' : ''} style="width: 15px; height: 15px; cursor: pointer; accent-color: #2563eb;" title="Show/Hide Col 3">
                            <input type="text" class="form-control cat-col3-label" value="${col3.label || ''}" placeholder="Label 3" style="height: 28px !important; min-height: 28px !important; font-size: 11.5px !important; width: 95px; padding: 2px 6px !important; font-weight: 600;">
                        </div>
                    </td>
                    <td style="padding: 6px 10px;">
                        <select class="form-control cat-default-unit" style="height: 28px !important; min-height: 28px !important; font-size: 11.5px !important; width: 100px; padding: 2px 6px !important; font-weight: 600;">
                            ${unitOpts}
                        </select>
                    </td>
                    <td style="padding: 6px 10px;">
                        <select class="form-control cat-rate-basis" style="height: 28px !important; min-height: 28px !important; font-size: 11.5px !important; width: 175px; padding: 2px 6px !important; font-weight: 600;">
                            <option value="col3" ${rateBasis === 'col3' ? 'selected' : ''}>Col 3 (e.g. Weight &times; Rate)</option>
                            <option value="col2" ${rateBasis === 'col2' ? 'selected' : ''}>Col 2 (e.g. Length / Pcs &times; Rate)</option>
                            <option value="col1" ${rateBasis === 'col1' ? 'selected' : ''}>Col 1 (e.g. Pcs / Ctn / Qty &times; Rate)</option>
                            <option value="unit_based" ${rateBasis === 'unit_based' ? 'selected' : ''}>Auto by Selected Unit</option>
                        </select>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = rowsHtml;
    };

    window.saveInvoiceGridSettings = async function(isSilent = false) {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            const columns = {
                hs_code: document.getElementById('inv_col_hs_code')?.checked ?? true,
                description: document.getElementById('inv_col_description')?.checked ?? true,
                unit: document.getElementById('inv_col_unit')?.checked ?? true,
                rate: document.getElementById('inv_col_rate')?.checked ?? true,
                gross_amt: document.getElementById('inv_col_gross_amt')?.checked ?? true,
                disc_perc: document.getElementById('inv_col_disc_perc')?.checked ?? true,
                disc_amt: document.getElementById('inv_col_disc_amt')?.checked ?? true,
                sales_tax: document.getElementById('inv_col_sales_tax')?.checked ?? true,
                further_tax: document.getElementById('inv_col_further_tax')?.checked ?? true,
                net_amt: document.getElementById('inv_col_net_amt')?.checked ?? true
            };

            const categories = {};
            document.querySelectorAll('#invoice_grid_categories_tbody tr').forEach(tr => {
                const catKey = tr.dataset.catKey;
                if (!catKey) return;
                const col1Show = tr.querySelector('.cat-col1-show')?.checked ?? true;
                const col1Label = tr.querySelector('.cat-col1-label')?.value.trim() || 'PCS';
                const col2Show = tr.querySelector('.cat-col2-show')?.checked ?? true;
                const col2Label = tr.querySelector('.cat-col2-label')?.value.trim() || 'LENGTH';
                const col3Show = tr.querySelector('.cat-col3-show')?.checked ?? true;
                const col3Label = tr.querySelector('.cat-col3-label')?.value.trim() || 'WEIGHT';
                const defaultUnit = tr.querySelector('.cat-default-unit')?.value || 'Pcs';
                const rateBasis = tr.querySelector('.cat-rate-basis')?.value || 'col1';

                categories[catKey] = {
                    col1: { show: col1Show, label: col1Label },
                    col2: { show: col2Show, label: col2Label },
                    col3: { show: col3Show, label: col3Label },
                    default_unit: defaultUnit,
                    rate_basis: rateBasis,
                    type: catKey.includes('FITTING') ? 'fitting' : (catKey.includes('PIPE') ? 'pipe' : 'general')
                };
            });

            const settings = { columns, categories };
            const settingsJson = JSON.stringify(settings);

            localStorage.setItem('sale_invoice_custom_settings', settingsJson);

            // Notify open Sale Invoice instance if active in memory
            if (window.SIModule && window.SIModule.loadCustomSettings) {
                window.SIModule.customSettings = settings;
                if (window.SIModule.applyCustomSettings) window.SIModule.applyCustomSettings();
            }

            const fb = document.getElementById('save_feedback_msg_invoice_grid');
            if (fb) {
                fb.style.display = 'inline-block';
                setTimeout(() => { fb.style.display = 'none'; }, 4000);
            }

            await Promise.all([
                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'sale_invoice_custom_settings', value: settingsJson })
                }),
                fetch('api/settings.php?action=save_global_setting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'sale_invoice_custom_settings', value: settingsJson })
                })
            ]).catch(e => console.warn(e));

            if (!isSilent) {
                alert('Invoice Grid & Column settings saved successfully!');
            }
        } catch(e) {
            console.error('saveInvoiceGridSettings error:', e);
            if (!isSilent) alert('Error saving invoice settings: ' + (e.message || e));
        }
    };

    window.resetInvoiceGridSettingsToDefault = function() {
        if (!confirm('Are you sure you want to reset Invoice Grid & Calculation settings to system defaults?')) return;
        const defaults = window.getDefaultInvoiceCustomSettings();
        localStorage.setItem('sale_invoice_custom_settings', JSON.stringify(defaults));
        window.initInvoiceGridSettings();
        window.saveInvoiceGridSettings(true);
    };

    // Global saveSystemSettings implementation
    window.saveSystemSettings = async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            // Priority 1: Save Login Page Settings Immediately
            const chkLoginDropdown = document.getElementById('setting_login_user_dropdown');
            const chkLoginUser = document.getElementById('setting_login_show_username');
            const chkLoginCompany = document.getElementById('setting_login_show_company');
            const chkLoginYear = document.getElementById('setting_login_show_financial_year');

            if (chkLoginDropdown || chkLoginUser || chkLoginCompany || chkLoginYear) {
                const loginUserDropdown = chkLoginDropdown ? (chkLoginDropdown.checked ? '1' : '0') : '1';
                const loginShowUsername = chkLoginUser ? (chkLoginUser.checked ? '1' : '0') : '1';
                const loginShowCompany = chkLoginCompany ? (chkLoginCompany.checked ? '1' : '0') : '1';
                const loginShowFinancialYear = chkLoginYear ? (chkLoginYear.checked ? '1' : '0') : '1';

                const loginSettingsObj = {
                    login_user_dropdown: loginUserDropdown,
                    login_show_username: loginShowUsername,
                    login_show_company: loginShowCompany,
                    login_show_financial_year: loginShowFinancialYear
                };
                localStorage.setItem('softifyx_login_display_settings', JSON.stringify(loginSettingsObj));

                fetch(`api/settings.php?action=save_login_settings&company_id=${companyId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: companyId, settings: loginSettingsObj })
                }).catch(e => console.warn(e));
            }

            const primaryColor = document.getElementById('theme_hex_primary')?.value || '#1F4E79';
            const toolbarColor = document.getElementById('theme_hex_toolbar')?.value || '#214F77';
            const accentColor = document.getElementById('theme_hex_accent')?.value || '#F5A623';

            const defaultSale = document.getElementById('setting_default_sale_invoice')?.value || 'non_tax';
            const defaultPurchase = document.getElementById('setting_default_purchase_invoice')?.value || 'non_tax';
            const defaultMinMode = document.getElementById('setting_default_min_mode')?.value || 'job';

            const isActive = document.getElementById('setting_404_active')?.checked ? '1' : '0';
            const code = (document.getElementById('setting_404_code')?.value || 'open').toLowerCase().trim() || 'open';
            let timeoutVal = (document.getElementById('setting_404_timeout')?.value || '3').toString().trim();
            if (!timeoutVal || isNaN(parseFloat(timeoutVal))) timeoutVal = '3';
            const overrideCode = (document.getElementById('setting_backup_override_code')?.value || '').toLowerCase().trim();
            const revealCode = (document.getElementById('setting_hidden_reveal_code')?.value || 'unlock').toLowerCase().trim() || 'unlock';
            
            const elFbr = document.getElementById('setting_module_fbr_enabled');
            const moduleFbrEnabled = (elFbr && elFbr.value !== '' && elFbr.value !== null) ? String(elFbr.value) : (localStorage.getItem('module_fbr_enabled') !== null ? localStorage.getItem('module_fbr_enabled') : '0');

            const elPos = document.getElementById('setting_module_pos_enabled');
            const modulePosEnabled = (elPos && elPos.value !== '' && elPos.value !== null) ? String(elPos.value) : (localStorage.getItem('module_pos_enabled') !== null ? localStorage.getItem('module_pos_enabled') : '0');

            const elAddBranch = document.getElementById('setting_pos_allow_add_branch');
            const posAllowAddBranch = (elAddBranch && elAddBranch.value !== '' && elAddBranch.value !== null) ? String(elAddBranch.value) : (localStorage.getItem('pos_allow_add_branch') !== null ? localStorage.getItem('pos_allow_add_branch') : '1');

            const elPosFbr = document.getElementById('setting_pos_allow_fbr_integration');
            const posAllowFbr = (elPosFbr && elPosFbr.value !== '' && elPosFbr.value !== null) ? String(elPosFbr.value) : (localStorage.getItem('pos_allow_fbr_integration') !== null ? localStorage.getItem('pos_allow_fbr_integration') : '1');

            const elFbrIntegration = document.getElementById('setting_fbr_allow_integration_settings');
            const fbrAllowIntegration = (elFbrIntegration && elFbrIntegration.value !== '' && elFbrIntegration.value !== null) ? String(elFbrIntegration.value) : (localStorage.getItem('fbr_allow_integration_settings') !== null ? localStorage.getItem('fbr_allow_integration_settings') : '1');

            // Immediate local storage update so there is zero delay/flicker
            localStorage.setItem('module_fbr_enabled', moduleFbrEnabled);
            localStorage.setItem('module_pos_enabled', modulePosEnabled);
            localStorage.setItem('pos_allow_add_branch', posAllowAddBranch);
            localStorage.setItem('pos_allow_fbr_integration', posAllowFbr);
            localStorage.setItem('fbr_allow_integration_settings', fbrAllowIntegration);
            localStorage.setItem('default_sale_invoice', defaultSale);

            if (document.getElementById('inv_col_hs_code') && window.saveInvoiceGridSettings) {
                window.saveInvoiceGridSettings(true);
            }

            // Apply and Save Theme
            const themeConfig = {
                primary: primaryColor,
                toolbar: toolbarColor || primaryColor,
                accent: accentColor || '#F5A623',
                btnHover: shadeColor(primaryColor, -15)
            };
            if (typeof window.saveERPTheme === 'function') {
                await window.saveERPTheme(themeConfig);
            }

            // Save Invoice Defaults
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'default_sale_invoice', value: defaultSale })
            });
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'default_purchase_invoice', value: defaultPurchase })
            });
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'default_min_mode', value: defaultMinMode })
            });

            // Save Security & Modules
            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'security_404_active', value: isActive })
            });
            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'security_404_code', value: code })
            });
            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'security_404_timeout', value: timeoutVal })
            });

            // Save Target Scope Checkboxes (ERP, Digital Invoicing, POS)
            const targetErp = document.getElementById('setting_404_target_erp')?.checked ? '1' : '0';
            const targetDigitalInvoice = document.getElementById('setting_404_target_digital_invoice')?.checked ? '1' : '0';
            const targetPos = document.getElementById('setting_404_target_pos')?.checked ? '1' : '0';

            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'security_404_target_erp', value: targetErp })
            });
            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'security_404_target_digital_invoice', value: targetDigitalInvoice })
            });
            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'security_404_target_pos', value: targetPos })
            });

            const targetObj = {
                erp: targetErp === '1',
                digital_invoice: targetDigitalInvoice === '1',
                pos: targetPos === '1'
            };
            localStorage.setItem('softifyx_404_targets', JSON.stringify(targetObj));

            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'backup_override_code', value: overrideCode })
            });
            await fetch('api/settings.php?action=save_global_setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'hidden_reveal_code', value: revealCode })
            });
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'module_fbr_enabled', value: moduleFbrEnabled })
            });
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'module_pos_enabled', value: modulePosEnabled })
            });

            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'pos_allow_add_branch', value: posAllowAddBranch })
            });
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'pos_allow_fbr_integration', value: posAllowFbr })
            });
            await fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'fbr_allow_integration_settings', value: fbrAllowIntegration })
            });

            // Instant UI Updates
            if (window.syncNavbarModules) window.syncNavbarModules();
            if (window.POSSettings && typeof window.POSSettings.applyBranchButtonVisibility === 'function') {
                window.POSSettings.applyBranchButtonVisibility();
            }
            if (window.POSSettings && typeof window.POSSettings.applyFbrTabVisibility === 'function') {
                window.POSSettings.applyFbrTabVisibility();
            }
            if (window.syncSystemSettingsTabVisibility) {
                window.syncSystemSettingsTabVisibility();
            }

            if (typeof window.updateLockScreenSettings === 'function') {
                window.updateLockScreenSettings(isActive === '1', code, parseFloat(timeoutVal), targetObj);
            }

            // Save Custom Region Labels
            const inpMainReg = document.getElementById('setting_custom_label_main_region');
            const inpSubReg = document.getElementById('setting_custom_label_sub_region');
            const inpListReg = document.getElementById('setting_custom_label_list_region');
            if (inpMainReg || inpSubReg || inpListReg) {
                const mainVal = (inpMainReg?.value || '').trim() || 'Main Region';
                const subVal = (inpSubReg?.value || '').trim() || 'Sub Region';
                const listVal = (inpListReg?.value || '').trim() || 'List';

                localStorage.setItem('custom_label_main_region', mainVal);
                localStorage.setItem('custom_label_sub_region', subVal);
                localStorage.setItem('custom_label_list_region', listVal);
                window.applyCustomRegionLabels();

                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_main_region', value: mainVal })
                }).catch(e => console.warn(e));
                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_sub_region', value: subVal })
                }).catch(e => console.warn(e));
                fetch('api/settings.php?action=save_setting&company_id=' + companyId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'custom_label_list_region', value: listVal })
                }).catch(e => console.warn(e));
            }

            const fb = document.getElementById('save_feedback_msg');
            if (fb) {
                fb.style.display = 'inline-block';
                setTimeout(function() { fb.style.display = 'none'; }, 3000);
            }
            const fbLogin = document.getElementById('save_feedback_msg_login');
            if (fbLogin) {
                fbLogin.style.display = 'inline-block';
                setTimeout(function() { fbLogin.style.display = 'none'; }, 3000);
            }
            const fbRegions = document.getElementById('save_feedback_msg_regions');
            if (fbRegions) {
                fbRegions.style.display = 'inline-block';
                setTimeout(function() { fbRegions.style.display = 'none'; }, 3000);
            }
            alert('Settings saved successfully!');
        } catch(e) {
            alert('Error saving settings: ' + (e && e.message ? e.message : e));
            console.error('Error saving system settings:', e);
        }
    };

    window.loadSystemSettings = async function() {
        try {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            // 1. FAST LOCAL RESTORE: Instant sync with 0ms delay
            if (window.syncLoginSettingsFromStorage) {
                window.syncLoginSettingsFromStorage();
            } else {
                try {
                    const raw = localStorage.getItem('softifyx_login_display_settings');
                    if (raw) {
                        const cfg = JSON.parse(raw);
                        const chkDropdown = document.getElementById('setting_login_user_dropdown');
                        const chkUser = document.getElementById('setting_login_show_username');
                        const chkCompany = document.getElementById('setting_login_show_company');
                        const chkYear = document.getElementById('setting_login_show_financial_year');
                        if (chkDropdown && cfg.login_user_dropdown !== undefined) chkDropdown.checked = (cfg.login_user_dropdown !== '0');
                        if (chkUser && cfg.login_show_username !== undefined) chkUser.checked = (cfg.login_show_username !== '0');
                        if (chkCompany && cfg.login_show_company !== undefined) chkCompany.checked = (cfg.login_show_company !== '0');
                        if (chkYear && cfg.login_show_financial_year !== undefined) chkYear.checked = (cfg.login_show_financial_year !== '0');
                        if (chkDropdown && window.onLoginUserDropdownChange) window.onLoginUserDropdownChange(chkDropdown.checked);
                    }
                } catch(e) {}
            }

            // Parallel non-blocking fetch from backend
            fetch(`api/settings.php?action=get_login_settings&company_id=${companyId}&_t=${Date.now()}`)
                .then(r => r.json())
                .then(dataLogin => {
                    const loginCfg = (dataLogin && dataLogin.settings) ? dataLogin.settings : {};
                    const chkDropdown = document.getElementById('setting_login_user_dropdown');
                    const chkUser = document.getElementById('setting_login_show_username');
                    const chkCompany = document.getElementById('setting_login_show_company');
                    const chkYear = document.getElementById('setting_login_show_financial_year');

                    if (chkDropdown && loginCfg.login_user_dropdown !== undefined) chkDropdown.checked = (loginCfg.login_user_dropdown !== '0');
                    if (chkUser && loginCfg.login_show_username !== undefined) chkUser.checked = (loginCfg.login_show_username !== '0');
                    if (chkCompany && loginCfg.login_show_company !== undefined) chkCompany.checked = (loginCfg.login_show_company !== '0');
                    if (chkYear && loginCfg.login_show_financial_year !== undefined) chkYear.checked = (loginCfg.login_show_financial_year !== '0');

                    if (chkDropdown && window.onLoginUserDropdownChange) window.onLoginUserDropdownChange(chkDropdown.checked);

                    localStorage.setItem('softifyx_login_display_settings', JSON.stringify({
                        login_user_dropdown: chkDropdown ? (chkDropdown.checked ? '1' : '0') : '1',
                        login_show_username: chkUser ? (chkUser.checked ? '1' : '0') : '1',
                        login_show_company: chkCompany ? (chkCompany.checked ? '1' : '0') : '1',
                        login_show_financial_year: chkYear ? (chkYear.checked ? '1' : '0') : '1'
                    }));
                }).catch(e => console.warn(e));

            if (window.initThemeSettingsInputs) window.initThemeSettingsInputs();

            // Load Security 404
            const res1 = await fetch('api/settings.php?action=get_global_setting&key=security_404_active&_t=' + Date.now());
            const data1 = await res1.json();
            const isActive = (data1.value !== null) ? (data1.value === '1') : true;
            const activeCheckbox = document.getElementById('setting_404_active');
            if (activeCheckbox) activeCheckbox.checked = isActive;

            const res2 = await fetch('api/settings.php?action=get_global_setting&key=security_404_code&_t=' + Date.now());
            const data2 = await res2.json();
            const codeInput = document.getElementById('setting_404_code');
            if (codeInput) codeInput.value = data2.value || 'open';

            const res3 = await fetch('api/settings.php?action=get_global_setting&key=security_404_timeout&_t=' + Date.now());
            const data3 = await res3.json();
            const timeoutInput = document.getElementById('setting_404_timeout');
            if (timeoutInput) timeoutInput.value = data3.value || '3';

            const resOverride = await fetch('api/settings.php?action=get_global_setting&key=backup_override_code&_t=' + Date.now());
            const dataOverride = await resOverride.json();
            const overrideInput = document.getElementById('setting_backup_override_code');
            if (overrideInput) overrideInput.value = dataOverride.value || '';

            const resReveal = await fetch('api/settings.php?action=get_global_setting&key=hidden_reveal_code&_t=' + Date.now());
            const dataReveal = await resReveal.json();
            const revealInput = document.getElementById('setting_hidden_reveal_code');
            if (revealInput) revealInput.value = dataReveal.value || 'unlock';

            // Load Target Scope Checkboxes (ERP, Digital Invoicing, POS)
            const resTErp = await fetch('api/settings.php?action=get_global_setting&key=security_404_target_erp&_t=' + Date.now());
            const dataTErp = await resTErp.json();
            const isTargetErp = (dataTErp.value !== null) ? (dataTErp.value === '1') : true;
            const chkTargetErp = document.getElementById('setting_404_target_erp');
            if (chkTargetErp) chkTargetErp.checked = isTargetErp;

            const resTDig = await fetch('api/settings.php?action=get_global_setting&key=security_404_target_digital_invoice&_t=' + Date.now());
            const dataTDig = await resTDig.json();
            const isTargetDig = (dataTDig.value !== null) ? (dataTDig.value === '1') : true;
            const chkTargetDig = document.getElementById('setting_404_target_digital_invoice');
            if (chkTargetDig) chkTargetDig.checked = isTargetDig;

            const resTPos = await fetch('api/settings.php?action=get_global_setting&key=security_404_target_pos&_t=' + Date.now());
            const dataTPos = await resTPos.json();
            const isTargetPos = (dataTPos.value !== null) ? (dataTPos.value === '1') : true;
            const chkTargetPos = document.getElementById('setting_404_target_pos');
            if (chkTargetPos) chkTargetPos.checked = isTargetPos;

            localStorage.setItem('softifyx_404_targets', JSON.stringify({
                erp: isTargetErp,
                digital_invoice: isTargetDig,
                pos: isTargetPos
            }));

            if (typeof window.toggleLockCodeInput === 'function') {
                window.toggleLockCodeInput();
            }

            // Load Invoice defaults
            const resSale = await fetch('api/settings.php?action=get_setting&key=default_sale_invoice&company_id=' + companyId + '&_t=' + Date.now());
            const dataSale = await resSale.json();
            const defaultSale = document.getElementById('setting_default_sale_invoice');
            if (defaultSale && dataSale.value) defaultSale.value = dataSale.value;
            localStorage.setItem('default_sale_invoice', dataSale.value || 'non_tax');

            const resPur = await fetch('api/settings.php?action=get_setting&key=default_purchase_invoice&company_id=' + companyId + '&_t=' + Date.now());
            const dataPur = await resPur.json();
            const defaultPurchase = document.getElementById('setting_default_purchase_invoice');
            if (defaultPurchase && dataPur.value) defaultPurchase.value = dataPur.value;

            const resMin = await fetch('api/settings.php?action=get_setting&key=default_min_mode&company_id=' + companyId + '&_t=' + Date.now());
            const dataMin = await resMin.json();
            const defaultMinMode = document.getElementById('setting_default_min_mode');
            if (defaultMinMode && dataMin.value) defaultMinMode.value = dataMin.value;

            // Load Modules
            const resFbr = await fetch('api/settings.php?action=get_setting&key=module_fbr_enabled&company_id=' + companyId + '&_t=' + Date.now());
            const dataFbr = await resFbr.json();
            const selFbr = document.getElementById('setting_module_fbr_enabled');
            let fbrVal = (dataFbr && dataFbr.value !== undefined && dataFbr.value !== null && dataFbr.value !== '') ? String(dataFbr.value) : localStorage.getItem('module_fbr_enabled');
            if (fbrVal === null || fbrVal === undefined) fbrVal = '0';
            if (selFbr) selFbr.value = fbrVal;
            localStorage.setItem('module_fbr_enabled', fbrVal);

            const resPos = await fetch('api/settings.php?action=get_setting&key=module_pos_enabled&company_id=' + companyId + '&_t=' + Date.now());
            const dataPos = await resPos.json();
            const selPos = document.getElementById('setting_module_pos_enabled');
            let posVal = (dataPos && dataPos.value !== undefined && dataPos.value !== null && dataPos.value !== '') ? String(dataPos.value) : localStorage.getItem('module_pos_enabled');
            if (posVal === null || posVal === undefined) posVal = '0';
            if (selPos) selPos.value = posVal;
            localStorage.setItem('module_pos_enabled', posVal);

            // Load POS Add New Branch Setting
            const resAddBranch = await fetch('api/settings.php?action=get_setting&key=pos_allow_add_branch&company_id=' + companyId + '&_t=' + Date.now());
            const dataAddBranch = await resAddBranch.json();
            const selAddBranch = document.getElementById('setting_pos_allow_add_branch');
            let addBranchVal = (dataAddBranch && dataAddBranch.value !== undefined && dataAddBranch.value !== null && dataAddBranch.value !== '') ? String(dataAddBranch.value) : localStorage.getItem('pos_allow_add_branch');
            if (addBranchVal === null || addBranchVal === undefined) addBranchVal = '1';
            if (selAddBranch) selAddBranch.value = addBranchVal;
            localStorage.setItem('pos_allow_add_branch', addBranchVal);

            // Load POS FBR Integration Tab Setting
            const resPosFbr = await fetch('api/settings.php?action=get_setting&key=pos_allow_fbr_integration&company_id=' + companyId + '&_t=' + Date.now());
            const dataPosFbr = await resPosFbr.json();
            const selPosFbr = document.getElementById('setting_pos_allow_fbr_integration');
            let posFbrVal = (dataPosFbr && dataPosFbr.value !== undefined && dataPosFbr.value !== null && dataPosFbr.value !== '') ? String(dataPosFbr.value) : localStorage.getItem('pos_allow_fbr_integration');
            if (posFbrVal === null || posFbrVal === undefined) posFbrVal = '1';
            if (selPosFbr) selPosFbr.value = posFbrVal;
            localStorage.setItem('pos_allow_fbr_integration', posFbrVal);

            // Load Digital Invoicing Integration Settings Setting
            const resFbrIntegration = await fetch('api/settings.php?action=get_setting&key=fbr_allow_integration_settings&company_id=' + companyId + '&_t=' + Date.now());
            const dataFbrIntegration = await resFbrIntegration.json();
            const selFbrIntegration = document.getElementById('setting_fbr_allow_integration_settings');
            let fbrIntegrationVal = (dataFbrIntegration && dataFbrIntegration.value !== undefined && dataFbrIntegration.value !== null && dataFbrIntegration.value !== '') ? String(dataFbrIntegration.value) : localStorage.getItem('fbr_allow_integration_settings');
            if (fbrIntegrationVal === null || fbrIntegrationVal === undefined) fbrIntegrationVal = '1';
            if (selFbrIntegration) selFbrIntegration.value = fbrIntegrationVal;
            localStorage.setItem('fbr_allow_integration_settings', fbrIntegrationVal);

            // Load Custom Region Labels
            const inpMainR = document.getElementById('setting_custom_label_main_region');
            const inpSubR = document.getElementById('setting_custom_label_sub_region');
            const inpListR = document.getElementById('setting_custom_label_list_region');
            if (inpMainR) inpMainR.value = localStorage.getItem('custom_label_main_region') || 'Main Region';
            if (inpSubR) inpSubR.value = localStorage.getItem('custom_label_sub_region') || 'Sub Region';
            if (inpListR) inpListR.value = localStorage.getItem('custom_label_list_region') || 'List';
            if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
            if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();

            fetch('api/settings.php?action=get_setting&key=custom_label_main_region&company_id=' + companyId + '&_t=' + Date.now())
                .then(r => r.json())
                .then(d => {
                    if (d && d.value) {
                        localStorage.setItem('custom_label_main_region', d.value);
                        if (inpMainR) inpMainR.value = d.value;
                        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
                        if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();
                    }
                }).catch(e => console.warn(e));
            fetch('api/settings.php?action=get_setting&key=custom_label_sub_region&company_id=' + companyId + '&_t=' + Date.now())
                .then(r => r.json())
                .then(d => {
                    if (d && d.value) {
                        localStorage.setItem('custom_label_sub_region', d.value);
                        if (inpSubR) inpSubR.value = d.value;
                        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
                        if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();
                    }
                }).catch(e => console.warn(e));
            fetch('api/settings.php?action=get_setting&key=custom_label_list_region&company_id=' + companyId + '&_t=' + Date.now())
                .then(r => r.json())
                .then(d => {
                    if (d && d.value) {
                        localStorage.setItem('custom_label_list_region', d.value);
                        if (inpListR) inpListR.value = d.value;
                        if (window.updateRegionLabelsPreview) window.updateRegionLabelsPreview();
                        if (window.applyCustomRegionLabels) window.applyCustomRegionLabels();
                    }
                }).catch(e => console.warn(e));

            if (window.syncNavbarModules) window.syncNavbarModules();
            if (window.POSSettings && typeof window.POSSettings.applyBranchButtonVisibility === 'function') {
                window.POSSettings.applyBranchButtonVisibility();
            }
            if (window.POSSettings && typeof window.POSSettings.applyFbrTabVisibility === 'function') {
                window.POSSettings.applyFbrTabVisibility();
            }
            if (window.syncSystemSettingsTabVisibility) {
                window.syncSystemSettingsTabVisibility();
            }
            if (window.centerSystemSettingsWindow) {
                window.centerSystemSettingsWindow();
            }
        } catch(e) {}
    };

    window.onLoginUserDropdownChange = function(isChecked) {
        const desc = document.getElementById('desc_login_user_dropdown');
        if (desc) {
            desc.innerHTML = isChecked 
                ? 'Checked: Users list dropdown will show on login page. (Uncheck to type username manually).'
                : 'Unchecked: User dropdown is hidden. User will type their username manually into a text box.';
        }
    };

    // Secret settings unhide listener for dashboard/ERP
    let _tmTypedSequence = '';
    document.addEventListener('keydown', (e) => {
        if (e.key && e.key.length === 1) {
            _tmTypedSequence += e.key.toLowerCase();
            const revealInput = document.getElementById('setting_hidden_reveal_code');
            const targetCode = (revealInput && revealInput.value ? revealInput.value : (window.targetHiddenRevealCode || 'unlock')).toLowerCase().trim() || 'unlock';
            if (_tmTypedSequence.endsWith(targetCode)) {
                const secretContent = document.getElementById('system_settings_secret_content');
                if (secretContent) {
                    secretContent.style.display = 'block';
                }
            }
            if (_tmTypedSequence.length > 20) {
                _tmTypedSequence = _tmTypedSequence.slice(-20);
            }
        }
    });

    // Automatically observe navbar-container to sync modules immediately upon HTML injection
    function initThemeNavbarObserver() {
        const navContainerEl = document.getElementById('navbar-container');
        if (navContainerEl && !window._navbarObserverInitialized) {
            window._navbarObserverInitialized = true;
            const navObserver = new MutationObserver(function() {
                if (document.getElementById('fbrMenu') || document.getElementById('posMenu')) {
                    if (window.syncNavbarModules) window.syncNavbarModules();
                }
            });
            navObserver.observe(navContainerEl, { childList: true, subtree: true });
        }
        if (window.syncNavbarModules) window.syncNavbarModules();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeNavbarObserver);
    } else {
        initThemeNavbarObserver();
    }

    // ==========================================
    // Automatic Branch Operating Hours Monitor & Auto-Logout
    // ==========================================
    (function initBranchOperatingHoursWatcher() {
        let isLoggingOut = false;

        function performOffTimeLogout(data) {
            if (isLoggingOut) return;
            isLoggingOut = true;

            const isOffDay = !!data.is_off_day;

            try {
                sessionStorage.setItem('softifyx_offtime_reason', JSON.stringify({
                    branch_name: data.branch_name || 'Assigned Branch',
                    opening_time: data.opening_time || '',
                    closing_time: data.closing_time || '',
                    raw_opening_time: data.raw_opening_time || '',
                    current_time: data.current_time || '',
                    is_off_day: isOffDay,
                    off_day: data.off_day || '',
                    current_day: data.current_day || ''
                }));
            } catch(e) {}

            localStorage.removeItem('softifyx_session');

            try {
                fetch('api/auth.php?action=logout');
            } catch(e) {}

            if (isOffDay) {
                const dayName = data.current_day || data.off_day || 'Today';
                alert(`📅 Branch Weekly Off Day\n\nToday (${dayName}) is an official weekly OFF DAY for ${data.branch_name || 'your branch'}.\nYou have been automatically logged out.`);
                window.location.href = 'login.html?off_day=1';
            } else {
                const openFmt = data.opening_time ? ` (${data.opening_time})` : '';
                alert(`⏰ Branch Operating Hours Ended (Off-Time)\n\nBranch operating hours have closed.\nYou have been automatically logged out. Please log in after opening time${openFmt}.`);
                window.location.href = 'login.html?off_time=1';
            }
        }

        function checkBranchHours() {
            if (isLoggingOut) return;
            const raw = localStorage.getItem('softifyx_session');
            if (!raw) return;

            let sess;
            try { sess = JSON.parse(raw); } catch(e) { return; }
            if (!sess) return;

            const role = (sess.role || '').toUpperCase();
            const isAdmin = (role === 'ADMIN' || role === 'SUPERADMIN' || sess.user_id === 1);
            if (isAdmin) return; // Admins are exempt

            const branchId = sess.branch_id;
            if (!branchId) return;

            // 1. Client-Side Weekly Off Day Check
            if (sess.off_day) {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const curDay = days[new Date().getDay()];
                if (sess.off_day.trim().toLowerCase() === curDay.toLowerCase()) {
                    performOffTimeLogout({
                        branch_name: sess.branch_name,
                        is_off_day: true,
                        off_day: sess.off_day,
                        current_day: curDay,
                        opening_time: sess.opening_time,
                        closing_time: sess.closing_time,
                        raw_opening_time: sess.opening_time
                    });
                    return;
                }
            }

            // 2. Client-Side Clock Check (instant trigger when off-time hits)
            if (sess.opening_time && sess.closing_time) {
                const now = new Date();
                const curH = String(now.getHours()).padStart(2, '0');
                const curM = String(now.getMinutes()).padStart(2, '0');
                const curS = String(now.getSeconds()).padStart(2, '0');
                const nowTime = `${curH}:${curM}:${curS}`;
                const op = sess.opening_time.length === 5 ? (sess.opening_time + ':00') : sess.opening_time;
                const cl = sess.closing_time.length === 5 ? (sess.closing_time + ':00') : sess.closing_time;

                let isOpen = false;
                if (op <= cl) {
                    isOpen = (nowTime >= op && nowTime <= cl);
                } else {
                    isOpen = (nowTime >= op || nowTime <= cl);
                }

                if (!isOpen) {
                    performOffTimeLogout({
                        branch_name: sess.branch_name,
                        opening_time: sess.opening_time,
                        closing_time: sess.closing_time,
                        raw_opening_time: sess.opening_time
                    });
                    return;
                }
            }

            // 3. Server API Check (verifies DB changes, admin off-day/time modifications, and server clock)
            fetch(`api/auth.php?action=check_branch_hours&branch_id=${branchId}&role=${encodeURIComponent(role)}&_t=${Date.now()}`)
                .then(r => r.json())
                .then(res => {
                    if (res && (res.is_off_day || res.is_off_time)) {
                        performOffTimeLogout(res);
                    } else if (res) {
                        let changed = false;
                        if (res.opening_time && res.closing_time) {
                            if (sess.opening_time !== res.opening_time || sess.closing_time !== res.closing_time) {
                                sess.opening_time = res.opening_time;
                                sess.closing_time = res.closing_time;
                                changed = true;
                            }
                        }
                        if (res.off_day !== undefined && sess.off_day !== res.off_day) {
                            sess.off_day = res.off_day;
                            changed = true;
                        }
                        if (changed) {
                            localStorage.setItem('softifyx_session', JSON.stringify(sess));
                        }
                    }
                })
                .catch(() => {});
        }

        // Run check after initial load, then continuously every 15 seconds
        setTimeout(checkBranchHours, 2000);
        setInterval(checkBranchHours, 15000);
    })();

    // Global Helper: Open Default Sale Invoice (Non-Tax, Tax, or Digital FBR)
    window.openDefaultSaleInvoice = async function () {
        let defSale = localStorage.getItem('default_sale_invoice');
        if (!defSale) {
            try {
                const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                const coId = session.company_id || 1;
                const r = await fetch(`api/settings.php?action=get_setting&key=default_sale_invoice&company_id=${coId}&_t=${Date.now()}`);
                const j = await r.json();
                defSale = j.value || 'non_tax';
                localStorage.setItem('default_sale_invoice', defSale);
            } catch(e) {
                defSale = 'non_tax';
            }
        }

        if (defSale === 'digital') {
            if (typeof window.openModularPopup === 'function') {
                window.openModularPopup(
                    'Navigation/DigitalInvoicing/digital_invoice.html',
                    'fa-file-invoice',
                    'FBR Digital Invoice',
                    () => {
                        if (window.DigitalInvoiceModule && typeof window.DigitalInvoiceModule.init === 'function') {
                            window.DigitalInvoiceModule.init();
                        }
                    },
                    'FBR Digital Invoice',
                    true,
                    true
                );
            } else {
                window.open('Navigation/DigitalInvoicing/digital_invoice.html', '_blank');
            }
        } else {
            if (typeof window.openModularPopup === 'function') {
                window.openModularPopup(
                    'Navigation/Sales/sale_invoice.html',
                    'fa-file-invoice-dollar',
                    'Sale Invoice',
                    () => {
                        if (window.SIModule && typeof window.SIModule.init === 'function') {
                            window.SIModule.init();
                        }
                    },
                    'Sale Invoice',
                    true,
                    true
                );
            } else {
                window.open('Navigation/Sales/sale_invoice.html', '_blank');
            }
        }
    };
})();
