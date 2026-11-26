/**
 * SoftifyX ERP - Manufacturing Balance Sheet Module
 * Handles Real-time Assets, Liabilities & Equity Aggregation,
 * Audit Reconciliation, Tree Expand/Collapse, Financial Health Ratios,
 * Negative Balances Smart Reclassification, Inventory 3-Way Valuation,
 * and Imbalance Diagnostic Scanner.
 */
(function() {
    const BalanceSheetModule = {
        data: {
            company_id: 1,
            companyName: 'SoftifyX Financials',
            companyInfo: null,
            layoutMode: 'side', // 'side' or 'vertical'
            groupBy: 'main', // 'main' (Main Account Types) or 'sub' (Sub Account Types)
            isComparative: false,
            scale: 'actual', // 'actual', 'k', 'm'
            taxMode: null, // 'tax' or 'non_tax' (auto-resolved on first load)
            activeAgingTab: 'debtors',
            currentDrillCoa: null,
            currentDrillName: null,
            ledgerTransactionsCache: [],
            pendingClosingNetProfit: 0,
            lastReportData: null
        },

        init: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = window.selectedCompanyId || session.company_id || 1;
            this.data.companyName = session.company_name || 'SoftifyX Financials';
            this.data.taxMode = null;

            this.setDefaultDates();
            this.loadReport();
        },

        setDefaultDates: function() {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');

            const onDateEl = document.getElementById('bsAsOnDate');
            if (onDateEl && !onDateEl.value) {
                // Default to end of current month
                const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
                onDateEl.value = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
            }

            const compDateEl = document.getElementById('bsComparativeDate');
            if (compDateEl && !compDateEl.value) {
                // Default comparative to end of previous month
                const prevLast = new Date(yyyy, today.getMonth(), 0);
                const pY = prevLast.getFullYear();
                const pM = String(prevLast.getMonth() + 1).padStart(2, '0');
                const pD = String(prevLast.getDate()).padStart(2, '0');
                compDateEl.value = `${pY}-${pM}-${pD}`;
            }
        },

        applyDatePreset: function() {
            const preset = document.getElementById('bsDatePreset')?.value || 'this_month';
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();

            let targetDate = new Date();

            if (preset === 'today') {
                targetDate = now;
            } else if (preset === 'this_month') {
                targetDate = new Date(y, m + 1, 0); // Last day of current month
            } else if (preset === 'last_month') {
                targetDate = new Date(y, m, 0); // Last day of previous month
            } else if (preset === 'this_quarter') {
                const qEndMonth = Math.floor(m / 3) * 3 + 3;
                targetDate = new Date(y, qEndMonth, 0);
            } else if (preset === 'financial_year') {
                // Pakistan Financial Year ends 30th June
                const fyYear = (m >= 6) ? y + 1 : y;
                targetDate = new Date(fyYear, 6, 0);
            }

            if (preset !== 'custom') {
                const yyyy = targetDate.getFullYear();
                const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
                const dd = String(targetDate.getDate()).padStart(2, '0');
                const onDateEl = document.getElementById('bsAsOnDate');
                if (onDateEl) onDateEl.value = `${yyyy}-${mm}-${dd}`;
            }

            this.loadReport();
        },

        onDateChange: function() {
            const presetEl = document.getElementById('bsDatePreset');
            if (presetEl) presetEl.value = 'custom';
            this.loadReport();
        },

        onTaxModeChange: async function() {
            const sel = document.getElementById('bsTaxMode');
            const newMode = sel?.value || 'tax';
            this.data.taxMode = newMode;
            try {
                await fetch(`api/settings.php?action=save_setting&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        company_id: this.data.company_id,
                        key: 'balance_sheet_tax_mode',
                        value: newMode
                    })
                });
            } catch (e) {}
            this.loadReport();
        },

        toggleComparative: function() {
            const chk = document.getElementById('bsEnableComparative');
            const compInput = document.getElementById('bsComparativeDate');
            this.data.isComparative = chk ? chk.checked : false;

            if (compInput) {
                compInput.style.display = this.data.isComparative ? 'inline-block' : 'none';
            }
            this.loadReport();
        },

        switchLayout: function(mode) {
            this.data.layoutMode = mode;
            const btnSide = document.getElementById('bsBtnLayoutSide');
            const btnVert = document.getElementById('bsBtnLayoutVert');
            const viewSide = document.getElementById('bsViewSideBySide');
            const viewVert = document.getElementById('bsViewVertical');

            if (mode === 'side') {
                if (btnSide) { btnSide.style.background = 'white'; btnSide.style.color = '#1e293b'; btnSide.style.fontWeight = '700'; }
                if (btnVert) { btnVert.style.background = 'transparent'; btnVert.style.color = '#64748b'; btnVert.style.fontWeight = '600'; }
                if (viewSide) viewSide.style.display = 'flex';
                if (viewVert) viewVert.style.display = 'none';
            } else {
                if (btnSide) { btnSide.style.background = 'transparent'; btnSide.style.color = '#64748b'; btnSide.style.fontWeight = '600'; }
                if (btnVert) { btnVert.style.background = 'white'; btnVert.style.color = '#1e293b'; btnVert.style.fontWeight = '700'; }
                if (viewSide) viewSide.style.display = 'none';
                if (viewVert) viewVert.style.display = 'block';
            }

            if (this.data.lastReportData) {
                this.renderReport(this.data.lastReportData);
            }
        },

        setGrouping: function(mode) {
            this.data.groupBy = mode;
            const btnMain = document.getElementById('bsBtnGroupMain');
            const btnSub = document.getElementById('bsBtnGroupSub');
            if (mode === 'main') {
                if (btnMain) { btnMain.style.background = '#0284c7'; btnMain.style.color = '#ffffff'; btnMain.style.fontWeight = '700'; }
                if (btnSub) { btnSub.style.background = 'transparent'; btnSub.style.color = '#0369a1'; btnSub.style.fontWeight = '600'; }
            } else {
                if (btnMain) { btnMain.style.background = 'transparent'; btnMain.style.color = '#0369a1'; btnMain.style.fontWeight = '600'; }
                if (btnSub) { btnSub.style.background = '#0284c7'; btnSub.style.color = '#ffffff'; btnSub.style.fontWeight = '700'; }
            }
            this.loadReport();
        },

        loadReport: async function() {
            const onDate = document.getElementById('bsAsOnDate')?.value || '';
            const compDate = (this.data.isComparative) ? (document.getElementById('bsComparativeDate')?.value || '') : '';
            const vStatus = document.getElementById('bsVoucherStatus')?.value || 'posted';
            const smartReclass = document.getElementById('bsSmartReclass')?.checked ? 1 : 0;

            const assetsBox = document.getElementById('bsAssetsContainer');
            const liabBox = document.getElementById('bsLiabEquityContainer');
            const vertBox = document.getElementById('bsVerticalContainer');

            const loaderHtml = `<div style="text-align: center; padding: 40px; color: var(--theme-primary, #1F4E79);"><i class="fas fa-spinner fa-spin fa-2x"></i><br><span style="display:inline-block; margin-top:8px; font-weight:600;">Calculating Manufacturing Balance Sheet & General Ledgers...</span></div>`;
            if (assetsBox) assetsBox.innerHTML = loaderHtml;
            if (liabBox) liabBox.innerHTML = loaderHtml;
            if (vertBox) vertBox.innerHTML = loaderHtml;

            let url = `api/balance_sheet.php?action=get_balance_sheet&company_id=${this.data.company_id}&as_on_date=${onDate}&voucher_status=${vStatus}&smart_reclass=${smartReclass}&group_by=${this.data.groupBy || 'main'}`;
            if (this.data.taxMode) {
                url += `&tax_mode=${encodeURIComponent(this.data.taxMode)}`;
            }
            if (compDate) {
                url += `&comparative_date=${compDate}`;
            }

            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error("HTTP " + res.status);

                const data = await res.json();
                if (data.status !== 'success') {
                    const errHtml = `<div style="text-align: center; color: #dc2626; padding: 20px; font-weight: 600;">Error: ${data.error || 'Failed to load Balance Sheet'}</div>`;
                    if (assetsBox) assetsBox.innerHTML = errHtml;
                    if (liabBox) liabBox.innerHTML = errHtml;
                    if (vertBox) vertBox.innerHTML = errHtml;
                    return;
                }

                this.data.lastReportData = data;
                if (data.company && data.company.name) {
                    this.data.companyInfo = data.company;
                    this.data.companyName = data.company.name;
                }

                this.renderReport(data);

            } catch (err) {
                console.error("Balance Sheet load error:", err);
                const errHtml = `<div style="text-align: center; color: #dc2626; padding: 20px;">Connection Error: ${err.message}</div>`;
                if (assetsBox) assetsBox.innerHTML = errHtml;
                if (liabBox) liabBox.innerHTML = errHtml;
                if (vertBox) vertBox.innerHTML = errHtml;
            }
        },

        renderReport: function(data) {
            const kpi = data.kpi || {};
            const sec = data.sections || {};
            const audit = data.audit_checklist || {};
            const ratios = data.financial_ratios || {};
            const inv3way = data.inventory_3way || {};
            const isComp = !!data.comparative_date;

            if (data.tax_mode) {
                this.data.taxMode = data.tax_mode;
                const taxSel = document.getElementById('bsTaxMode');
                if (taxSel && taxSel.value !== data.tax_mode) {
                    taxSel.value = data.tax_mode;
                }
            }

            // 1. Update Top KPI Summary Cards
            if (isComp && kpi.comp_total_assets !== undefined) {
                const signA = kpi.comp_diff_assets > 0 ? '+' : '';
                document.getElementById('bsKpiTotalAssets').innerHTML = `Rs. ${this.formatCurrency(kpi.total_assets)} <span style="font-size:9px; font-weight:700; color:${kpi.comp_diff_assets > 0 ? '#15803d' : '#dc2626'};">(${signA}${kpi.comp_pct_assets}%)</span>`;
            } else {
                document.getElementById('bsKpiTotalAssets').textContent = `Rs. ${this.formatCurrency(kpi.total_assets)}`;
            }
            document.getElementById('bsKpiNonCurrentAssets').textContent = `Rs. ${this.formatCurrency(kpi.non_current_assets)}`;
            document.getElementById('bsKpiCurrentAssets').textContent = `Rs. ${this.formatCurrency(kpi.current_assets)}`;

            document.getElementById('bsKpiTotalLiabilities').textContent = `Rs. ${this.formatCurrency(kpi.total_liabilities)}`;
            document.getElementById('bsKpiNonCurrentLiabilities').textContent = `Rs. ${this.formatCurrency(kpi.non_current_liabilities)}`;
            document.getElementById('bsKpiCurrentLiabilities').textContent = `Rs. ${this.formatCurrency(kpi.current_liabilities)}`;

            document.getElementById('bsKpiOwnerEquity').textContent = `Rs. ${this.formatCurrency(kpi.owner_equity)}`;
            const ownerCapEl = document.getElementById('bsKpiOwnerCapital');
            if (ownerCapEl) {
                const capTotal = sec.owner_equity ? sec.owner_equity.owner_capital_total : 0;
                ownerCapEl.textContent = `Rs. ${this.formatCurrency(capTotal)}`;
            }
            document.getElementById('bsKpiNetProfit').textContent = `Rs. ${this.formatCurrency(kpi.net_profit)}`;
            document.getElementById('bsKpiWorkingCapital').textContent = `Rs. ${this.formatCurrency(kpi.working_capital)}`;

            // Meezan Card Status & Diagnostic Quick Action
            const meezanCard = document.getElementById('bsKpiMeezanCard');
            const meezanText = document.getElementById('bsKpiMeezanText');
            const meezanIcon = document.getElementById('bsKpiMeezanIcon');
            const meezanDiff = document.getElementById('bsKpiMeezanDiff');
            const btnCardDiag = document.getElementById('bsBtnCardDiagnose');

            if (kpi.is_balanced) {
                if (meezanCard) {
                    meezanCard.style.background = '#f0fdf4';
                    meezanCard.style.borderColor = '#86efac';
                    meezanCard.style.borderLeftColor = '#16a34a';
                }
                if (meezanText) { meezanText.textContent = 'BALANCED'; meezanText.style.color = '#16a34a'; }
                if (meezanIcon) { meezanIcon.className = 'fas fa-check-circle'; meezanIcon.style.color = '#16a34a'; }
                if (meezanDiff) { meezanDiff.textContent = 'Rs. 0.00'; meezanDiff.style.color = '#16a34a'; }
                if (btnCardDiag) btnCardDiag.style.display = 'none';
            } else {
                if (meezanCard) {
                    meezanCard.style.background = '#fef2f2';
                    meezanCard.style.borderColor = '#fca5a5';
                    meezanCard.style.borderLeftColor = '#dc2626';
                }
                if (meezanText) { meezanText.textContent = 'OUT OF BALANCE'; meezanText.style.color = '#dc2626'; }
                if (meezanIcon) { meezanIcon.className = 'fas fa-times-circle'; meezanIcon.style.color = '#dc2626'; }
                if (meezanDiff) { meezanDiff.textContent = `Rs. ${this.formatCurrency(kpi.difference)}`; meezanDiff.style.color = '#dc2626'; }
                if (btnCardDiag) btnCardDiag.style.display = 'inline-block';
            }

            // 2. Update Financial Health Ratios (Feature 4)
            const rCurr = document.getElementById('bsRatioCurrent');
            const bCurr = document.getElementById('bsBadgeCurrentRatio');
            if (rCurr && bCurr) {
                rCurr.textContent = ratios.current_ratio ? `${ratios.current_ratio}x` : '0x';
                bCurr.textContent = ratios.current_ratio_badge || '';
                if (ratios.current_ratio_status === 'good') {
                    bCurr.style.background = '#dcfce7'; bCurr.style.color = '#15803d';
                } else if (ratios.current_ratio_status === 'warning') {
                    bCurr.style.background = '#fef3c7'; bCurr.style.color = '#b45309';
                } else {
                    bCurr.style.background = '#fee2e2'; bCurr.style.color = '#b91c1c';
                }
            }

            const rQuick = document.getElementById('bsRatioQuick');
            const bQuick = document.getElementById('bsBadgeQuickRatio');
            if (rQuick && bQuick) {
                rQuick.textContent = ratios.quick_ratio ? `${ratios.quick_ratio}x` : '0x';
                if (ratios.quick_ratio_status === 'good') {
                    bQuick.textContent = 'Strong (≥ 1.0)';
                    bQuick.style.background = '#dcfce7'; bQuick.style.color = '#15803d';
                } else if (ratios.quick_ratio_status === 'warning') {
                    bQuick.textContent = 'Moderate';
                    bQuick.style.background = '#fef3c7'; bQuick.style.color = '#b45309';
                } else {
                    bQuick.textContent = 'Tight (< 0.7)';
                    bQuick.style.background = '#fee2e2'; bQuick.style.color = '#b91c1c';
                }
            }

            const rDebCred = document.getElementById('bsRatioDebtorsCreditors');
            if (rDebCred) {
                rDebCred.textContent = ratios.debtors_to_creditors_ratio ? `${ratios.debtors_to_creditors_ratio}x` : '0x';
            }

            // 3. Update Manufacturing Inventory 3-Way Snapshot (Feature 3)
            const elRaw = document.getElementById('bsInvRawVal');
            const elWip = document.getElementById('bsInvWipVal');
            const elFg = document.getElementById('bsInvFgVal');
            const elTotal = document.getElementById('bsInvTotalVal');
            const elModeBadge = document.getElementById('bsInvModeBadge');
            if (elRaw) elRaw.textContent = `Rs. ${this.formatCurrency(inv3way.raw_materials)}`;
            if (elWip) elWip.textContent = `Rs. ${this.formatCurrency(inv3way.wip)}`;
            if (elFg) elFg.textContent = `Rs. ${this.formatCurrency(inv3way.finished_goods)}`;
            if (elTotal) elTotal.textContent = `Rs. ${this.formatCurrency(inv3way.total_inventory)}`;
            if (elModeBadge) {
                const ovCount = parseInt(inv3way.manual_overrides_count || 0, 10);
                if (inv3way.is_audited) {
                    elModeBadge.textContent = 'Audited Lock';
                    elModeBadge.style.background = '#dcfce7';
                    elModeBadge.style.color = '#166534';
                    elModeBadge.style.borderColor = '#86efac';
                } else if (ovCount > 0) {
                    elModeBadge.textContent = `Manual (${ovCount})`;
                    elModeBadge.style.background = '#fef08a';
                    elModeBadge.style.color = '#854d0e';
                    elModeBadge.style.borderColor = '#facc15';
                } else {
                    elModeBadge.textContent = 'Auto Rate';
                    elModeBadge.style.background = '#dbeafe';
                    elModeBadge.style.color = '#1d4ed8';
                    elModeBadge.style.borderColor = '#93c5fd';
                }
            }

            // 4. Suspense Warning Banner
            const suspenseBanner = document.getElementById('bsSuspenseBanner');
            const suspenseDetails = document.getElementById('bsSuspenseDetails');
            const warnings = data.suspense_warnings || [];
            if (warnings.length > 0) {
                if (suspenseBanner) suspenseBanner.style.display = 'flex';
                if (suspenseDetails) {
                    suspenseDetails.innerHTML = warnings.map(w => `${w.code} (${w.name}): Rs. ${this.formatCurrency(w.balance)}`).join(' | ');
                }
            } else {
                if (suspenseBanner) suspenseBanner.style.display = 'none';
            }

            // 5. Side-by-Side Totals Labels
            const sideAssetsTop = document.getElementById('bsSideTotalAssetsTop');
            const sideAssetsBot = document.getElementById('bsSideTotalAssetsBottom');
            const sideLiabTop = document.getElementById('bsSideTotalLiabEquityTop');
            const sideLiabBot = document.getElementById('bsSideTotalLiabEquityBottom');

            if (sideAssetsTop) sideAssetsTop.textContent = `Rs. ${this.formatCurrency(kpi.total_assets)}`;
            if (sideAssetsBot) sideAssetsBot.textContent = `Rs. ${this.formatCurrency(kpi.total_assets)}`;
            if (sideLiabTop) sideLiabTop.textContent = `Rs. ${this.formatCurrency(kpi.total_liabilities_and_equity)}`;
            if (sideLiabBot) sideLiabBot.textContent = `Rs. ${this.formatCurrency(kpi.total_liabilities_and_equity)}`;

            // 6. Render Tables based on Active Layout
            if (this.data.layoutMode === 'side') {
                const assetsBox = document.getElementById('bsAssetsContainer');
                const liabBox = document.getElementById('bsLiabEquityContainer');

                if (assetsBox) {
                    assetsBox.innerHTML = `
                        ${this.renderSectionBlock('nca', sec.non_current_assets, isComp, '#0369a1', '#e0f2fe')}
                        ${this.renderSectionBlock('ca', sec.current_assets, isComp, '#0284c7', '#e0f2fe')}
                    `;
                }

                if (liabBox) {
                    liabBox.innerHTML = `
                        ${this.renderSectionBlock('ncl', sec.non_current_liabilities, isComp, '#c2410c', '#ffedd5')}
                        ${this.renderSectionBlock('cl', sec.current_liabilities, isComp, '#ea580c', '#ffedd5')}
                        ${this.renderSectionBlock('eq', sec.owner_equity, isComp, '#7c3aed', '#ede9fe')}
                    `;
                }
            } else {
                // Vertical View
                const vertBox = document.getElementById('bsVerticalContainer');
                if (vertBox) {
                    vertBox.innerHTML = `
                        <div style="margin-bottom: 12px;">
                            <div style="background: #e0f2fe; padding: 6px 12px; font-weight: 800; font-size: 13px; color: #0369a1; border-radius: 4px; display: flex; justify-content: space-between;">
                                <span><i class="fas fa-cube"></i> ASSETS</span>
                                <span>Rs. ${this.formatCurrency(kpi.total_assets)}</span>
                            </div>
                            <div style="padding: 4px 0;">
                                ${this.renderSectionBlock('nca', sec.non_current_assets, isComp, '#0369a1', '#f8fafc')}
                                ${this.renderSectionBlock('ca', sec.current_assets, isComp, '#0284c7', '#f8fafc')}
                            </div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <div style="background: #ffedd5; padding: 6px 12px; font-weight: 800; font-size: 13px; color: #9a3412; border-radius: 4px; display: flex; justify-content: space-between;">
                                <span><i class="fas fa-file-invoice-dollar"></i> LIABILITIES</span>
                                <span>Rs. ${this.formatCurrency(kpi.total_liabilities)}</span>
                            </div>
                            <div style="padding: 4px 0;">
                                ${this.renderSectionBlock('ncl', sec.non_current_liabilities, isComp, '#c2410c', '#f8fafc')}
                                ${this.renderSectionBlock('cl', sec.current_liabilities, isComp, '#ea580c', '#f8fafc')}
                            </div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <div style="background: #ede9fe; padding: 6px 12px; font-weight: 800; font-size: 13px; color: #6d28d9; border-radius: 4px; display: flex; justify-content: space-between;">
                                <span><i class="fas fa-coins"></i> OWNER'S EQUITY & RESERVES</span>
                                <span>Rs. ${this.formatCurrency(kpi.owner_equity)}</span>
                            </div>
                            <div style="padding: 4px 0;">
                                ${this.renderSectionBlock('eq', sec.owner_equity, isComp, '#7c3aed', '#f8fafc')}
                            </div>
                        </div>
                    `;
                }
            }

            // 7. Update Bottom 4-Point Audit Checklist
            const tbBadge = document.getElementById('bsAuditTbBadge');
            if (tbBadge) {
                if (audit.trial_balance_balanced) {
                    tbBadge.innerHTML = `<i class="fas fa-check-circle" style="color: #16a34a;"></i> Trial Balance: <strong style="color: #15803d;">Matched (Diff: Rs. 0)</strong>`;
                } else {
                    tbBadge.innerHTML = `<i class="fas fa-times-circle" style="color: #dc2626;"></i> Trial Balance: <strong style="color: #dc2626;">Diff: Rs. ${this.formatCurrency(audit.trial_balance_diff)}</strong>`;
                }
            }

            const invBadge = document.getElementById('bsAuditInvBadge');
            if (invBadge) {
                if (Math.abs(audit.inventory_diff) < 1.0) {
                    invBadge.innerHTML = `<i class="fas fa-check-circle" style="color: #16a34a;"></i> Inventory GL vs Stock: <strong style="color: #15803d;">Reconciled</strong>`;
                } else {
                    invBadge.innerHTML = `<i class="fas fa-info-circle" style="color: #d97706;"></i> Inventory GL: <strong>Rs. ${this.formatCurrency(audit.inventory_gl_val)}</strong> (Store: Rs. ${this.formatCurrency(audit.inventory_stock_val)})`;
                }
            }

            const meezanBadge = document.getElementById('bsAuditMeezanBadge');
            if (meezanBadge) {
                if (kpi.is_balanced) {
                    meezanBadge.innerHTML = `<i class="fas fa-check-circle" style="color: #16a34a;"></i> Balance Sheet Meezan: <strong style="color: #15803d;">100% Balanced (Diff: Rs. 0)</strong>`;
                } else {
                    meezanBadge.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i> Balance Sheet Meezan: <strong style="color: #dc2626;">Diff: Rs. ${this.formatCurrency(kpi.difference)}</strong>`;
                }
            }
        },

        renderSectionBlock: function(sectionKey, sectionData, isComp, primaryColor, headerBg) {
            if (!sectionData) return '';
            const title = sectionData.title || '';
            const total = sectionData.total || 0;
            const compTotal = sectionData.comp_total || 0;
            const secDiff = sectionData.diff || 0;
            const secPct = sectionData.pct || 0;
            const groups = sectionData.groups || [];
            const ownerCapTotal = sectionData.owner_capital_total;

            let html = `
                <div class="bs-sec-block" style="margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; background: white;">
                    <div style="background: ${headerBg}; padding: 5px 10px; font-weight: 700; color: ${primaryColor}; font-size: 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0;">
                        <span>${title}</span>
                        <div style="display:flex; align-items:center; gap: 8px;">
                            ${isComp ? `
                                <span style="font-size: 9.5px; color: #64748b;">Prior: Rs. ${this.formatCurrency(compTotal)}</span>
                                <span style="font-size: 9.5px; font-weight: 700; color: ${secDiff > 0 ? '#15803d' : (secDiff < 0 ? '#dc2626' : '#64748b')};">
                                    ${secDiff > 0 ? '+' : ''}${this.formatCurrency(secDiff)} (${secDiff > 0 ? '+' : ''}${secPct}%)
                                </span>
                            ` : ''}
                            <span style="font-weight: 800;">Rs. ${this.formatCurrency(total)}</span>
                        </div>
                    </div>
                    <div style="padding: 2px 0;">
            `;

            // Feature 5: Owner's Capital Guidance Banner if Capital is Rs. 0
            if (sectionKey === 'eq' && (ownerCapTotal === 0 || ownerCapTotal === undefined)) {
                html += `
                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 3px; padding: 4px 8px; margin: 4px 6px; font-size: 9.5px; color: #92400e; display: flex; align-items: center; justify-content: space-between;">
                        <span style="display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-info-circle" style="color: #d97706;"></i>
                            <span><strong>Owner's Capital:</strong> Rs. 0 recorded in Chart of Accounts.</span>
                        </span>
                        <a href="javascript:void(0)" onclick="window.BalanceSheetModule.openDiagnostic()" style="color: #b45309; font-weight: 700; text-decoration: underline;">Scan & Balance</a>
                    </div>
                `;
            }

            if (groups.length === 0) {
                html += `<div style="padding: 8px 12px; color: #94a3b8; font-style: italic; font-size: 10.5px;">No active balances recorded.</div>`;
            } else {
                groups.forEach((grp, gIdx) => {
                    const gId = `${sectionKey}_grp_${gIdx}`;
                    const grpDiff = grp.diff || 0;
                    const grpPct = grp.pct || 0;

                    html += `
                        <div class="bs-group-row" style="background: #f8fafc; border-bottom: 1px solid #f1f5f9; padding: 4px 8px; font-weight: 600; font-size: 10.5px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="window.BalanceSheetModule.toggleGroup('${gId}')">
                            <span style="color: #334155; display: flex; align-items: center; gap: 5px;">
                                <span id="icon_${gId}" style="width: 14px; text-align: center; color: #0284c7; font-size: 10px; font-weight: 800;">[+]</span>
                                <span>${grp.sub_head}</span>
                                <span style="font-size: 9px; color: #94a3b8; font-weight: normal;">(${grp.items.length})</span>
                            </span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${isComp ? `
                                    <span style="font-size: 9px; color: #64748b;">Rs. ${this.formatCurrency(grp.comp_total)}</span>
                                    <span style="font-size: 9px; font-weight: 700; color: ${grpDiff > 0 ? '#15803d' : (grpDiff < 0 ? '#dc2626' : '#64748b')};">
                                        ${grpDiff > 0 ? '+' : ''}${this.formatCurrency(grpDiff)} (${grpDiff > 0 ? '+' : ''}${grpPct}%)
                                    </span>
                                ` : ''}
                                <span style="font-weight: 700; color: #1e293b;">Rs. ${this.formatCurrency(grp.total)}</span>
                            </div>
                        </div>
                        <div id="items_${gId}" class="bs-group-items" style="display: none;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                    `;

                    if (isComp) {
                        html += `
                            <tr style="background: #f1f5f9; color: #475569; font-size: 8.5px; font-weight: 700; border-bottom: 1px solid #e2e8f0;">
                                <th style="padding: 2px 6px 2px 24px; text-align: left; width: 60px;">Code</th>
                                <th style="padding: 2px 6px; text-align: left;">Account Title</th>
                                <th style="padding: 2px 6px; text-align: right; width: 65px;">Prior</th>
                                <th style="padding: 2px 6px; text-align: right; width: 75px;">Variance</th>
                                <th style="padding: 2px 8px; text-align: right; width: 80px;">Current</th>
                            </tr>
                        `;
                    }

                    grp.items.forEach(it => {
                        const isContra = it.is_contra;
                        const isSys = it.is_system;
                        const isReclass = it.is_reclassified;
                        const itDiff = it.diff || 0;
                        const itPct = it.pct || 0;
                        const diffCol = itDiff > 0 ? '#15803d' : (itDiff < 0 ? '#dc2626' : '#64748b');

                        // Aging badge if available
                        let agingBadgeHtml = '';
                        if (it.aging && it.amount > 0.01) {
                            const ag = it.aging;
                            const isCrit = ag.status === 'critical';
                            const isOverdue = ag.status === 'overdue';
                            const badgeBg = isCrit ? '#fee2e2' : (isOverdue ? '#fef3c7' : '#dcfce7');
                            const badgeCol = isCrit ? '#b91c1c' : (isOverdue ? '#b45309' : '#15803d');
                            const label = isCrit ? '90+ Days' : (isOverdue ? '30+ Days' : 'Current');
                            const tooltip = `0-30d: Rs. ${this.formatCurrency(ag.d0_30)} | 31-60d: Rs. ${this.formatCurrency(ag.d31_60)} | 61-90d: Rs. ${this.formatCurrency(ag.d61_90)} | 90+d: Rs. ${this.formatCurrency(ag.d90_plus)}`;
                            agingBadgeHtml = `<span style="font-size: 7.5px; font-weight: 700; background: ${badgeBg}; color: ${badgeCol}; padding: 1px 4px; border-radius: 2px; margin-left: 4px;" title="${tooltip}">${label}</span>`;
                        }

                        let clickAttr = '';
                        const isInvItem = it.id && typeof it.id === 'string' && it.id.startsWith('inv_');
                        if (isInvItem) {
                            clickAttr = `style="cursor: pointer;" onclick="if(window.parent && window.parent.loadPage){window.parent.loadPage('Navigation/Maintain/monthly_inventory_closing.html');}else{window.open('Navigation/Maintain/monthly_inventory_closing.html');}" title="Click to view Monthly Stock Closing & Godown Audit"`;
                        } else if (!isSys) {
                            clickAttr = `style="cursor: pointer;" onclick="window.BalanceSheetModule.drillDown(${it.id}, '${it.code}', '${it.name.replace(/'/g, "\\'")}')" title="Click to view full Ledger Khata"`;
                        }

                        html += `
                            <tr class="bs-acc-row" ${clickAttr}>
                                <td style="padding: 3px 6px 3px 24px; font-family: monospace; color: #64748b; width: 60px;">${it.code}</td>
                                <td style="padding: 3px 6px; color: ${isInvItem ? '#b45309' : (isSys ? '#15803d' : '#1e293b')}; font-weight: ${(isSys || isInvItem) ? '700' : '500'};">
                                    ${isInvItem ? '<i class="fas fa-boxes" style="color: #d97706; margin-right: 4px;"></i>' : (isSys ? '<i class="fas fa-bolt" style="color: #16a34a; margin-right: 4px;"></i>' : '')}
                                    ${it.name}
                                    ${(it.sub_head && it.sub_head !== grp.sub_head) ? `<span style="font-size: 8px; color: #0284c7; background: #e0f2fe; padding: 1px 4px; border-radius: 2px; margin-left: 5px; font-weight: 600;">${it.sub_head}</span>` : ''}
                                    ${isContra ? '<span style="font-size: 8px; color: #dc2626; margin-left: 3px;">(Contra)</span>' : ''}
                                    ${isReclass ? `<span style="font-size: 7.5px; font-weight: 700; background: #fef3c7; color: #92400e; padding: 1px 3px; border-radius: 2px; margin-left: 3px;" title="Negative balance reclassified for standard accounting">${it.reclass_type || 'Reclassified'}</span>` : ''}
                                    ${agingBadgeHtml}
                                </td>
                                ${isComp ? `
                                    <td style="padding: 3px 6px; text-align: right; color: #64748b; width: 65px;">${this.formatCurrency(it.comp_amount)}</td>
                                    <td style="padding: 3px 6px; text-align: right; font-weight: 700; color: ${diffCol}; width: 75px;">
                                        ${itDiff > 0 ? '+' : ''}${this.formatCurrency(itDiff)} <span style="font-size: 7.5px; font-weight: normal;">(${itDiff > 0 ? '+' : ''}${itPct}%)</span>
                                    </td>
                                ` : ''}
                                <td style="padding: 3px 8px; text-align: right; font-weight: 600; color: ${it.amount < 0 ? '#dc2626' : '#0f172a'}; width: 85px;">
                                    ${isContra ? '-' : ''}Rs. ${this.formatCurrency(Math.abs(it.amount))}
                                </td>
                            </tr>
                        `;
                    });

                    html += `
                            </table>
                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;
            return html;
        },

        toggleGroup: function(gId) {
            const itemsBox = document.getElementById(`items_${gId}`);
            const icon = document.getElementById(`icon_${gId}`);
            if (!itemsBox) return;

            if (itemsBox.style.display === 'none') {
                itemsBox.style.display = 'block';
                if (icon) icon.textContent = '[-]';
            } else {
                itemsBox.style.display = 'none';
                if (icon) icon.textContent = '[+]';
            }
        },

        toggleAllGroups: function() {
            const allBoxes = document.querySelectorAll('.bs-group-items');
            if (!allBoxes || allBoxes.length === 0) return;
            
            let anyVisible = false;
            allBoxes.forEach(b => { if (b.style.display !== 'none') anyVisible = true; });

            const newDisplay = anyVisible ? 'none' : 'block';
            const newIcon = anyVisible ? '[+]' : '[-]';

            allBoxes.forEach(b => {
                b.style.display = newDisplay;
                const gId = b.id.replace('items_', '');
                const icon = document.getElementById(`icon_${gId}`);
                if (icon) icon.textContent = newIcon;
            });
        },

        // =========================================================================
        // FEATURE 1: 1-CLICK DRILL-DOWN SUB-LEDGER KHATA
        // =========================================================================
        drillDown: function(coaId, coaCode, coaName) {
            if (!coaId) return;
            this.openLedgerDrilldown(coaId, coaCode, coaName);
        },

        openLedgerDrilldown: async function(coaId, coaCode, coaName) {
            this.data.currentDrillCoa = coaId;
            this.data.currentDrillName = coaName;

            const modal = document.getElementById('bsLedgerModal');
            if (modal) modal.style.display = 'flex';

            const onDate = document.getElementById('bsAsOnDate')?.value || '';
            const titleEl = document.getElementById('bsLedgerModalTitle');
            if (titleEl) titleEl.textContent = `Account Ledger: ${coaCode || ''} - ${coaName || ''}`;
            const accEl = document.getElementById('bsLedgerAccTitle');
            if (accEl) accEl.textContent = `${coaCode || ''} - ${coaName || ''}`;
            const dateEl = document.getElementById('bsLedgerAsOnDate');
            if (dateEl) dateEl.textContent = onDate;

            const dDeb = document.getElementById('bsLedgerTotDeb');
            const dCrd = document.getElementById('bsLedgerTotCrd');
            const dBal = document.getElementById('bsLedgerClosingBal');
            if (dDeb) dDeb.textContent = 'Loading...';
            if (dCrd) dCrd.textContent = 'Loading...';
            if (dBal) dBal.textContent = 'Loading...';

            const tbody = document.getElementById('bsLedgerTableBody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: var(--theme-primary, #1F4E79);"><i class="fas fa-spinner fa-spin fa-2x"></i><br><span style="margin-top:6px; display:inline-block; font-weight:600;">Fetching Ledger Khata...</span></td></tr>`;

            try {
                const res = await fetch(`api/balance_sheet.php?action=get_account_ledger_mini&company_id=${this.data.company_id}&coa_id=${coaId}&as_on_date=${onDate}`);
                const data = await res.json();
                if (data.status !== 'success') {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 20px;">Error: ${data.error || 'Failed to fetch ledger'}</td></tr>`;
                    return;
                }

                if (dDeb) dDeb.textContent = `Rs. ${this.formatCurrency(data.total_debit)}`;
                if (dCrd) dCrd.textContent = `Rs. ${this.formatCurrency(data.total_credit)}`;
                if (dBal) dBal.textContent = `Rs. ${this.formatCurrency(data.closing_balance)}`;
                const cntEl = document.getElementById('bsLedgerTxCount');
                if (cntEl) cntEl.textContent = `${data.transaction_count || 0} transactions`;

                this.data.ledgerTransactionsCache = data.transactions || [];
                this.renderLedgerRows(this.data.ledgerTransactionsCache);

            } catch (err) {
                console.error("Ledger drill-down error:", err);
                if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 20px;">Connection Error: ${err.message}</td></tr>`;
            }
        },

        renderLedgerRows: function(txs) {
            const tbody = document.getElementById('bsLedgerTableBody');
            if (!tbody) return;

            if (!txs || txs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8; font-style: italic;">No transactions recorded for this account up to selected date.</td></tr>`;
                return;
            }

            let html = '';
            txs.forEach(t => {
                const isDebit = t.debit > 0;
                const typeBg = (t.type === 'SI') ? '#dbeafe' : ((t.type === 'PI') ? '#ffedd5' : ((t.type === 'CP' || t.type === 'BP') ? '#fee2e2' : '#f0fdf4'));
                const typeCol = (t.type === 'SI') ? '#1e40af' : ((t.type === 'PI') ? '#c2410c' : ((t.type === 'CP' || t.type === 'BP') ? '#b91c1c' : '#15803d'));

                html += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 4px 8px; color: #64748b;">${t.date_formatted || t.date}</td>
                        <td style="padding: 4px 8px;">
                            <span style="font-size: 8.5px; font-weight: 700; background: ${typeBg}; color: ${typeCol}; padding: 1px 4px; border-radius: 2px;">${t.type}</span>
                        </td>
                        <td style="padding: 4px 8px; font-family: monospace; font-weight: 600;">${t.tran_no}</td>
                        <td style="padding: 4px 8px; color: #1e293b;">${t.description}</td>
                        <td style="padding: 4px 8px; text-align: right; color: ${isDebit ? '#0f172a' : '#94a3b8'}; font-weight: ${isDebit ? '600' : 'normal'};">
                            ${isDebit ? this.formatCurrency(t.debit) : '-'}
                        </td>
                        <td style="padding: 4px 8px; text-align: right; color: ${t.credit > 0 ? '#0f172a' : '#94a3b8'}; font-weight: ${t.credit > 0 ? '600' : 'normal'};">
                            ${t.credit > 0 ? this.formatCurrency(t.credit) : '-'}
                        </td>
                        <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: ${t.balance < 0 ? '#dc2626' : '#0284c7'};">
                            ${this.formatCurrency(t.balance)}
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        },

        filterLedgerRows: function() {
            const q = (document.getElementById('bsLedgerSearchInput')?.value || '').toLowerCase();
            if (!this.data.ledgerTransactionsCache) return;

            const filtered = this.data.ledgerTransactionsCache.filter(t => {
                return (t.tran_no || '').toLowerCase().includes(q) ||
                       (t.description || '').toLowerCase().includes(q) ||
                       (t.date || '').toLowerCase().includes(q) ||
                       (t.type || '').toLowerCase().includes(q);
            });
            this.renderLedgerRows(filtered);
            const cntEl = document.getElementById('bsLedgerTxCount');
            if (cntEl) cntEl.textContent = `${filtered.length} of ${this.data.ledgerTransactionsCache.length} transactions`;
        },

        closeLedgerModal: function() {
            const modal = document.getElementById('bsLedgerModal');
            if (modal) modal.style.display = 'none';
        },

        openFullLedger: function() {
            const coaId = this.data.currentDrillCoa;
            const coaName = this.data.currentDrillName || 'Account';
            if (!coaId) return;
            const onDate = document.getElementById('bsAsOnDate')?.value || '';

            if (typeof window.openModularPopup === 'function') {
                window.openModularPopup(
                    'Navigation/Reports/view_account_ledger.html',
                    'fa-book',
                    `Ledger: ${coaName}`,
                    () => {
                        if (window.AccountLedgerModule) {
                            window.AccountLedgerModule.init();
                            const accSel = document.getElementById('al_coa_id');
                            const toDate = document.getElementById('al_to_date');
                            if (accSel) accSel.value = coaId;
                            if (toDate && onDate) toDate.value = onDate;
                            setTimeout(() => {
                                if (typeof window.AccountLedgerModule.loadLedger === 'function') {
                                    window.AccountLedgerModule.loadLedger();
                                }
                            }, 200);
                        }
                    },
                    'View Account Ledger',
                    true,
                    true
                );
            }
        },

        // =========================================================================
        // FEATURE 4: DEBTORS & CREDITORS AGING SCHEDULE MODAL
        // =========================================================================
        openAgingModal: function() {
            const modal = document.getElementById('bsAgingModal');
            if (modal) {
                modal.style.display = 'flex';
                this.renderAgingSchedule();
            }
        },

        closeAgingModal: function() {
            const modal = document.getElementById('bsAgingModal');
            if (modal) modal.style.display = 'none';
        },

        switchAgingTab: function(tab) {
            this.data.activeAgingTab = tab;
            const btnDeb = document.getElementById('bsAgingTabDeb');
            const btnCred = document.getElementById('bsAgingTabCred');

            if (tab === 'debtors') {
                if (btnDeb) { btnDeb.style.background = '#0284c7'; btnDeb.style.color = 'white'; btnDeb.style.borderColor = '#0284c7'; btnDeb.style.fontWeight = '700'; }
                if (btnCred) { btnCred.style.background = '#ffffff'; btnCred.style.color = '#64748b'; btnCred.style.borderColor = '#cbd5e1'; btnCred.style.fontWeight = '600'; }
            } else {
                if (btnDeb) { btnDeb.style.background = '#ffffff'; btnDeb.style.color = '#64748b'; btnDeb.style.borderColor = '#cbd5e1'; btnDeb.style.fontWeight = '600'; }
                if (btnCred) { btnCred.style.background = '#ea580c'; btnCred.style.color = 'white'; btnCred.style.borderColor = '#ea580c'; btnCred.style.fontWeight = '700'; }
            }
            this.renderAgingSchedule();
        },

        renderAgingSchedule: function() {
            if (!this.data.lastReportData) return;
            const data = this.data.lastReportData;
            const debSum = data.debtors_aging_summary || {};
            const credSum = data.creditors_aging_summary || {};

            // Update Debtors Overview Cards
            const debTot = document.getElementById('bsAgingDebTotal');
            if (debTot) debTot.textContent = `Rs. ${this.formatCurrency(debSum.total)}`;
            const d030 = document.getElementById('bsAgingDeb0_30');
            if (d030) d030.textContent = `Rs. ${this.formatCurrency(debSum.d0_30)}`;
            const d3160 = document.getElementById('bsAgingDeb31_60');
            if (d3160) d3160.textContent = `Rs. ${this.formatCurrency(debSum.d31_60)}`;
            const d6190 = document.getElementById('bsAgingDeb61_90');
            if (d6190) d6190.textContent = `Rs. ${this.formatCurrency(debSum.d61_90)}`;
            const d90p = document.getElementById('bsAgingDeb90Plus');
            if (d90p) d90p.textContent = `Rs. ${this.formatCurrency(debSum.d90_plus)}`;

            // Update Creditors Overview Cards
            const credTot = document.getElementById('bsAgingCredTotal');
            if (credTot) credTot.textContent = `Rs. ${this.formatCurrency(credSum.total)}`;
            const c030 = document.getElementById('bsAgingCred0_30');
            if (c030) c030.textContent = `Rs. ${this.formatCurrency(credSum.d0_30)}`;
            const c3160 = document.getElementById('bsAgingCred31_60');
            if (c3160) c3160.textContent = `Rs. ${this.formatCurrency(credSum.d31_60)}`;
            const c6190 = document.getElementById('bsAgingCred61_90');
            if (c6190) c6190.textContent = `Rs. ${this.formatCurrency(credSum.d61_90)}`;
            const c90p = document.getElementById('bsAgingCred90Plus');
            if (c90p) c90p.textContent = `Rs. ${this.formatCurrency(credSum.d90_plus)}`;

            // Render Table based on active tab
            const tbody = document.getElementById('bsAgingTableBody');
            if (!tbody) return;

            let items = [];
            if (this.data.activeAgingTab === 'debtors') {
                const caSec = data.sections?.current_assets?.groups || [];
                caSec.forEach(g => {
                    (g.items || []).forEach(it => {
                        if (it.aging) items.push(it);
                    });
                });
            } else {
                const clSec = data.sections?.current_liabilities?.groups || [];
                clSec.forEach(g => {
                    (g.items || []).forEach(it => {
                        if (it.aging) items.push(it);
                    });
                });
            }

            if (items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 25px; color: #94a3b8; font-style: italic;">No active accounts with aging balances.</td></tr>`;
                return;
            }

            let html = '';
            items.forEach(it => {
                const ag = it.aging || {};
                const isCrit = ag.status === 'critical';
                const isOverdue = ag.status === 'overdue';
                const statusBadge = isCrit 
                    ? `<span style="background: #fee2e2; color: #b91c1c; font-weight: 700; padding: 2px 6px; border-radius: 3px; font-size: 9px;"><i class="fas fa-exclamation-circle"></i> 90+ Days</span>`
                    : (isOverdue 
                        ? `<span style="background: #fef3c7; color: #b45309; font-weight: 700; padding: 2px 6px; border-radius: 3px; font-size: 9px;"><i class="fas fa-clock"></i> 30+ Days</span>`
                        : `<span style="background: #dcfce7; color: #15803d; font-weight: 700; padding: 2px 6px; border-radius: 3px; font-size: 9px;"><i class="fas fa-check"></i> Current</span>`);

                html += `
                    <tr style="border-bottom: 1px solid #f1f5f9; cursor: pointer;" onclick="window.BalanceSheetModule.drillDown(${it.id}, '${it.code}', '${it.name.replace(/'/g, "\\'")}')" title="Click to view ledger">
                        <td style="padding: 4px 8px; font-family: monospace; color: #64748b;">${it.code}</td>
                        <td style="padding: 4px 8px; font-weight: 600; color: #1e293b;">${it.name}</td>
                        <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #0f172a;">Rs. ${this.formatCurrency(it.amount)}</td>
                        <td style="padding: 4px 8px; text-align: right; color: ${ag.d0_30 > 0 ? '#15803d' : '#94a3b8'};">${ag.d0_30 > 0 ? this.formatCurrency(ag.d0_30) : '-'}</td>
                        <td style="padding: 4px 8px; text-align: right; color: ${ag.d31_60 > 0 ? '#1d4ed8' : '#94a3b8'};">${ag.d31_60 > 0 ? this.formatCurrency(ag.d31_60) : '-'}</td>
                        <td style="padding: 4px 8px; text-align: right; color: ${ag.d61_90 > 0 ? '#b45309' : '#94a3b8'};">${ag.d61_90 > 0 ? this.formatCurrency(ag.d61_90) : '-'}</td>
                        <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: ${ag.d90_plus > 0 ? '#dc2626' : '#94a3b8'};">${ag.d90_plus > 0 ? this.formatCurrency(ag.d90_plus) : '-'}</td>
                        <td style="padding: 4px 8px; text-align: center;">${statusBadge}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        },

        // =========================================================================
        // FEATURE 6: FINANCIAL YEAR CLOSING & RETAINED EARNINGS WIZARD
        // =========================================================================
        openYearClosing: function() {
            const modal = document.getElementById('bsYearClosingModal');
            if (modal) modal.style.display = 'flex';

            const onDate = document.getElementById('bsAsOnDate')?.value || '';
            const closingInput = document.getElementById('bsClosingDate');
            if (closingInput) {
                closingInput.value = onDate || `${new Date().getFullYear()}-06-30`;
            }
            this.previewYearClosing();
        },

        closeYearClosing: function() {
            const modal = document.getElementById('bsYearClosingModal');
            if (modal) modal.style.display = 'none';
        },

        previewYearClosing: async function() {
            const cDate = document.getElementById('bsClosingDate')?.value || '';
            const contentBox = document.getElementById('bsClosingPreviewContent');
            const btnExec = document.getElementById('bsBtnExecuteClosing');
            if (btnExec) btnExec.style.display = 'none';

            if (contentBox) {
                contentBox.innerHTML = `<div style="text-align: center; padding: 25px; color: #4338ca;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><span style="margin-top:6px; display:inline-block; font-weight:600;">Calculating Year-End Revenue, Expenses & Net Profit...</span></div>`;
            }

            try {
                const res = await fetch(`api/balance_sheet.php?action=get_closing_preview&company_id=${this.data.company_id}&closing_date=${cDate}`);
                const data = await res.json();
                if (data.status !== 'success') {
                    if (contentBox) contentBox.innerHTML = `<div style="color: #dc2626; padding: 15px;">Error: ${data.error || 'Failed to preview closing'}</div>`;
                    return;
                }

                const isProfit = data.is_profit;
                const netProf = data.net_profit;
                const retAcc = data.retained_earnings_account || { code: '3200001', name: 'Retained Earnings / Unappropriated Profit' };
                const isClosed = data.is_already_closed;

                let html = `
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">TOTAL REVENUE</div>
                            <div style="font-size: 13px; font-weight: 800; color: #15803d; margin-top: 2px;">Rs. ${this.formatCurrency(data.total_revenue)}</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">COST & EXPENSES</div>
                            <div style="font-size: 13px; font-weight: 800; color: #b91c1c; margin-top: 2px;">Rs. ${this.formatCurrency(data.total_cost_of_sales + data.total_operating_expenses)}</div>
                        </div>
                        <div style="background: ${isProfit ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${isProfit ? '#86efac' : '#fca5a5'}; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">NET ${isProfit ? 'PROFIT' : 'LOSS'} TO CLOSE</div>
                            <div style="font-size: 13px; font-weight: 800; color: ${isProfit ? '#16a34a' : '#dc2626'}; margin-top: 2px;">Rs. ${this.formatCurrency(Math.abs(netProf))}</div>
                        </div>
                    </div>

                    <!-- Target Account -->
                    <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px;">
                        <div style="font-weight: 700; color: #1e293b; margin-bottom: 6px;">
                            <i class="fas fa-university" style="color: #4338ca;"></i> Target Equity Account:
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 6px 10px; border-radius: 3px; border: 1px solid #e2e8f0;">
                            <div>
                                <span style="font-family: monospace; font-weight: 700; color: #4338ca;">${retAcc.code}</span> - 
                                <strong>${retAcc.name}</strong>
                            </div>
                            <span style="font-size: 9.5px; background: #ede9fe; color: #6d28d9; padding: 1px 6px; border-radius: 2px; font-weight: 700;">Equity Balance</span>
                        </div>
                    </div>
                `;

                if (isClosed) {
                    html += `
                        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 10px; color: #166534; font-weight: 600; text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 18px; margin-bottom: 4px;"></i><br>
                            This fiscal year is already closed! Recorded by Voucher: <strong>JV-${data.existing_closing?.serial_no || ''}</strong> on ${data.existing_closing?.voucher_date || ''}.
                        </div>
                    `;
                } else {
                    html += `
                        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 8px 12px; font-size: 10.5px; color: #92400e;">
                            <strong>Double-Entry Voucher will be created:</strong><br>
                            ${isProfit ? `• Debit: P&L Summary (Rs. ${this.formatCurrency(Math.abs(netProf))})<br>• Credit: Retained Earnings (Rs. ${this.formatCurrency(Math.abs(netProf))})` : `• Debit: Retained Earnings (Rs. ${this.formatCurrency(Math.abs(netProf))})<br>• Credit: P&L Summary (Rs. ${this.formatCurrency(Math.abs(netProf))})`}
                        </div>
                    `;
                    if (btnExec) btnExec.style.display = 'inline-block';
                }

                if (contentBox) contentBox.innerHTML = html;
                this.data.pendingClosingNetProfit = netProf;

            } catch (err) {
                console.error("Year closing preview error:", err);
                if (contentBox) contentBox.innerHTML = `<div style="color: #dc2626; padding: 15px;">Connection error: ${err.message}</div>`;
            }
        },

        executeYearClosing: async function() {
            const cDate = document.getElementById('bsClosingDate')?.value || '';
            const netProf = this.data.pendingClosingNetProfit || 0;

            if (!confirm(`Tawajjuh Dein: Kya aap waqai Fiscal Year (${cDate}) ko close karke Net Profit (Rs. ${this.formatCurrency(netProf)}) ko Retained Earnings mein lock karna chahte hain?`)) {
                return;
            }

            const btnExec = document.getElementById('bsBtnExecuteClosing');
            if (btnExec) { btnExec.disabled = true; btnExec.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Posting...`; }

            const fd = new FormData();
            fd.append('action', 'execute_year_closing');
            fd.append('company_id', this.data.company_id);
            fd.append('closing_date', cDate);
            fd.append('net_profit', netProf);

            try {
                const res = await fetch('api/balance_sheet.php', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.status !== 'success') {
                    alert('Error closing year: ' + (data.error || 'Failed'));
                    if (btnExec) { btnExec.disabled = false; btnExec.innerHTML = `<i class="fas fa-lock"></i> Post & Lock Year Closing Entry`; }
                    return;
                }

                alert(data.message || 'Financial Year successfully closed!');
                this.closeYearClosing();
                this.loadReport();

            } catch (err) {
                alert('Connection error: ' + err.message);
                if (btnExec) { btnExec.disabled = false; btnExec.innerHTML = `<i class="fas fa-lock"></i> Post & Lock Year Closing Entry`; }
            }
        },

        // =========================================================================
        // FEATURE 4: CLOSING STOCK VALUATION SHEET (AUTO / MANUAL PER CATEGORY)
        // =========================================================================
        escapeHtml: function(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        formatQty: function(val) {
            const num = parseFloat(val) || 0;
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        openStockValuation: function() {
            const modal = document.getElementById('bsStockValuationModal');
            if (modal) {
                modal.style.display = 'flex';
                this.loadStockValuationSheet();
            }
        },

        closeStockValuation: function() {
            const modal = document.getElementById('bsStockValuationModal');
            if (modal) modal.style.display = 'none';
        },

        loadStockValuationSheet: async function() {
            const container = document.getElementById('bsSvTableContainer');
            if (container) {
                container.innerHTML = `<div style="text-align: center; padding: 30px; color: #64748b;"><i class="fas fa-spinner fa-spin" style="font-size: 20px;"></i> Loading category closing KG &amp; costing rates...</div>`;
            }

            const asOnDate = document.getElementById('bsAsOnDate')?.value || '';
            const taxMode = document.getElementById('bsTaxMode')?.value || this.data.tax_mode || 'tax';
            const url = `api/balance_sheet.php?action=get_stock_valuation_sheet&company_id=${this.data.company_id}&as_on_date=${encodeURIComponent(asOnDate)}&tax_mode=${encodeURIComponent(taxMode)}`;

            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.status !== 'success') {
                    if (container) container.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Failed to load Stock Valuation Sheet: ${this.escapeHtml(data.error || 'Unknown error')}</div>`;
                    return;
                }

                const elAsOn = document.getElementById('bsSvAsOnLabel');
                const elPer = document.getElementById('bsSvPeriodLabel');
                const elTax = document.getElementById('bsSvTaxModeLabel');
                if (elAsOn) elAsOn.textContent = data.as_on_date_formatted || data.as_on_date || '-';
                if (elPer) elPer.textContent = `${data.period_month_label || ''} (${data.period_month || ''})`;
                if (elTax) elTax.textContent = data.tax_mode_label || taxMode;

                const audBanner = document.getElementById('bsSvAuditedBanner');
                if (audBanner) audBanner.style.display = data.has_saved_closing ? 'block' : 'none';

                const btnSave = document.getElementById('bsBtnSaveStockVal');
                if (btnSave) btnSave.disabled = !!data.has_saved_closing;

                const fgRows = (data.fg_rows || []).map(r => Object.assign({}, r));
                const rmRow = data.raw_material_row ? Object.assign({}, data.raw_material_row) : {
                    row_key: 'raw_material', row_type: 'raw_material', category_id: 0,
                    row_label: 'RM-TOTAL (Raw Materials)', stock_kg: 0, auto_rate: 0, auto_value: 0,
                    mode: 'auto', manual_rate: 0, manual_value: 0, effective_rate: 0, effective_value: 0
                };
                const wipRow = data.wip_row ? Object.assign({}, data.wip_row) : {
                    row_key: 'wip', row_type: 'wip', category_id: 0,
                    row_label: 'FLOOR WIP (Work-In-Process)', stock_kg: 0, auto_rate: 0, auto_value: 0,
                    mode: 'auto', manual_rate: 0, manual_value: 0, effective_rate: 0, effective_value: 0
                };

                this.data.stockValState = {
                    period_month: data.period_month,
                    as_on_date: data.as_on_date,
                    tax_mode: data.tax_mode,
                    has_saved_closing: !!data.has_saved_closing,
                    fg_rows: fgRows,
                    rm_row: rmRow,
                    wip_row: wipRow
                };

                this.renderStockValuationTable();
            } catch (err) {
                console.error('Stock valuation fetch error:', err);
                if (container) container.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Connection error: ${this.escapeHtml(err.message)}</div>`;
            }
        },

        computeStockRowEffective: function(row) {
            const isManual = (row.mode === 'manual');
            const kgExact = parseFloat(row.stock_kg_exact != null ? row.stock_kg_exact : row.stock_kg) || 0;
            const autoRate = parseFloat(row.auto_rate) || 0;
            const autoVal = parseFloat(row.auto_value) || 0;

            if (!isManual) {
                return { rate: autoRate, value: autoVal };
            }

            const mRate = parseFloat(row.manual_rate) || 0;
            const mVal = parseFloat(row.manual_value) || 0;
            if (row.row_type === 'fg_category') {
                if (kgExact > 0) {
                    if (mRate > 0) {
                        return { rate: mRate, value: Math.round(kgExact * mRate * 100) / 100 };
                    }
                    if (mVal > 0 && row._directValEdited) {
                        return { rate: Math.round((mVal / kgExact) * 100) / 100, value: mVal };
                    }
                    return { rate: 0, value: 0 };
                }
                return { rate: 0, value: mVal };
            }

            if (row.row_type === 'raw_material') {
                if (kgExact > 0 && mRate > 0 && !row._directValEdited) {
                    return { rate: mRate, value: Math.round(kgExact * mRate * 100) / 100 };
                }
                return { rate: (kgExact > 0 ? Math.round((mVal / kgExact) * 100) / 100 : 0), value: mVal };
            }

            return { rate: 0, value: mVal };
        },

        renderStockValuationTable: function() {
            const state = this.data.stockValState;
            const container = document.getElementById('bsSvTableContainer');
            if (!state || !container) return;

            const locked = !!state.has_saved_closing;
            const makeToggle = (scope, idx, mode) => {
                const isMan = (mode === 'manual');
                const disAttr = locked ? 'disabled' : '';
                return `
                    <div style="display: inline-flex; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: #f8fafc;">
                        <button type="button" ${disAttr} onclick="window.BalanceSheetModule.toggleStockRowMode('${scope}', ${idx}, 'auto')"
                            style="border: none; padding: 2px 7px; font-size: 9.5px; font-weight: 800; cursor: ${locked ? 'not-allowed' : 'pointer'}; background: ${!isMan ? '#0284c7' : 'transparent'}; color: ${!isMan ? '#ffffff' : '#64748b'};">AUTO</button>
                        <button type="button" ${disAttr} onclick="window.BalanceSheetModule.toggleStockRowMode('${scope}', ${idx}, 'manual')"
                            style="border: none; padding: 2px 7px; font-size: 9.5px; font-weight: 800; cursor: ${locked ? 'not-allowed' : 'pointer'}; background: ${isMan ? '#eab308' : 'transparent'}; color: ${isMan ? '#1e293b' : '#64748b'};">MANUAL</button>
                    </div>
                `;
            };

            let html = `
                <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #475569;">
                    <thead>
                        <tr style="background: #1e293b; color: white; font-size: 10px; text-transform: uppercase;">
                            <th style="padding: 6px 8px; border: 1px solid #475569; text-align: left; width: 26%;">NAME (CATEGORY)</th>
                            <th style="padding: 6px 8px; border: 1px solid #475569; text-align: center; width: 13%;">MODE</th>
                            <th style="padding: 6px 8px; border: 1px solid #475569; text-align: right; width: 12%;">KG</th>
                            <th style="padding: 6px 8px; border: 1px solid #475569; text-align: right; width: 15%;">AUTO REFERENCE</th>
                            <th style="padding: 6px 8px; border: 1px solid #475569; text-align: center; width: 15%;">RATE (RS./KG)</th>
                            <th style="padding: 6px 8px; border: 1px solid #475569; text-align: right; width: 19%;">VALUE (PKR)</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            state.fg_rows.forEach((row, idx) => {
                const eff = this.computeStockRowEffective(row);
                const kgNum = parseFloat(row.stock_kg) || 0;
                const isMan = (row.mode === 'manual');
                const rateVal = isMan ? (parseFloat(row.manual_rate) || 0) : eff.rate;
                const manualVal = isMan ? (parseFloat(row.manual_value) || 0) : eff.value;

                let rateCell = `<span style="color: #94a3b8; font-size: 10px;">-</span>`;
                let valCell = `<span id="bsSvRowVal_fg_${idx}" style="font-weight: 700; font-family: monospace; color: ${eff.value > 0 ? '#0f172a' : '#94a3b8'};">${eff.value > 0 ? this.formatCurrency(eff.value) : '-'}</span>`;

                if (kgNum > 0) {
                    if (isMan && !locked) {
                        rateCell = `<input type="number" step="0.01" min="0" value="${rateVal}" oninput="window.BalanceSheetModule.onStockRateInput('fg', ${idx}, this.value)" style="width: 92px; text-align: right; padding: 3px 6px; border: 1.5px solid #ca8a04; background: #fef08a; color: #1e293b; font-weight: 800; font-family: monospace; border-radius: 3px;" />`;
                    } else {
                        rateCell = `<span style="font-family: monospace; color: #334155; font-weight: 700; background: #f1f5f9; padding: 2px 8px; border-radius: 3px; display: inline-block; min-width: 65px; text-align: right;">${rateVal > 0 ? this.formatCurrency(rateVal) : '0.00'}</span>`;
                    }
                } else {
                    if (isMan && !locked) {
                        rateCell = `<span style="color: #854d0e; font-size: 9.5px; font-weight: 700;">Lump Val</span>`;
                        valCell = `<input type="number" step="0.01" min="0" value="${manualVal}" oninput="window.BalanceSheetModule.onStockValueInput('fg', ${idx}, this.value)" style="width: 125px; text-align: right; padding: 3px 6px; border: 1.5px solid #ca8a04; background: #fef08a; color: #1e293b; font-weight: 800; font-family: monospace; border-radius: 3px;" />`;
                    } else {
                        rateCell = `<span style="color: #94a3b8; font-size: 9.5px;">0-KG</span>`;
                    }
                }

                html += `
                    <tr style="background: ${isMan ? '#fefce8' : '#ffffff'};">
                        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">
                            ${this.escapeHtml(row.row_label)}
                            <span style="font-size: 9px; color: #64748b; font-weight: 500; margin-left: 4px;">(${row.items_count || 0})</span>
                        </td>
                        <td style="padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center;">${makeToggle('fg', idx, row.mode)}</td>
                        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 600;">${kgNum > 0 ? this.formatQty(kgNum) : '-'}</td>
                        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; text-align: right; font-size: 10px; color: #64748b; font-family: monospace;">
                            ${row.auto_rate > 0 ? `@ ${this.formatCurrency(row.auto_rate)}<br>` : ''}<span style="color: #475569;">Rs. ${this.formatCurrency(row.auto_value)}</span>
                        </td>
                        <td style="padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center; background: ${isMan && kgNum > 0 ? '#fef9c3' : 'transparent'};">${rateCell}</td>
                        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; text-align: right; background: ${isMan && kgNum <= 0 ? '#fef9c3' : 'transparent'};">${valCell}</td>
                    </tr>
                `;
            });

            // FG-TOTAL row
            html += `
                <tr style="background: #e2e8f0; font-weight: 800; color: #0f172a; font-size: 11.5px;">
                    <td colspan="2" style="padding: 6px 8px; border: 1px solid #475569; text-align: center;">FG-TOTAL :-</td>
                    <td id="bsSvFgTotalKg" style="padding: 6px 8px; border: 1px solid #475569; text-align: right; font-family: monospace;">0.00</td>
                    <td id="bsSvFgAutoVal" style="padding: 6px 8px; border: 1px solid #475569; text-align: right; font-family: monospace; font-size: 10px; color: #475569;">Rs. 0.00</td>
                    <td style="padding: 6px 8px; border: 1px solid #475569; text-align: center; font-size: 9.5px; color: #475569;">Pipes + Fittings</td>
                    <td id="bsSvFgTotalVal" style="padding: 6px 8px; border: 1px solid #475569; text-align: right; font-family: monospace; font-size: 12px;">0.00</td>
                </tr>
            `;

            // RM-TOTAL row
            const rm = state.rm_row;
            const rmEff = this.computeStockRowEffective(rm);
            const rmIsMan = (rm.mode === 'manual');
            const rmKg = parseFloat(rm.stock_kg) || 0;
            const rmRateDisplay = rmIsMan ? (parseFloat(rm.manual_rate) > 0 ? parseFloat(rm.manual_rate) : '') : rmEff.rate;
            const rmManualValDisplay = rmIsMan ? (parseFloat(rm.manual_value) || 0) : rmEff.value;

            let rmRateCell = `<span style="color: #94a3b8; font-size: 10px;">Avg ${this.formatCurrency(rm.auto_rate)}</span>`;
            let rmValCell = `<span id="bsSvRowVal_rm_0" style="font-weight: 800; font-family: monospace;">${this.formatCurrency(rmEff.value)}</span>`;
            if (rmIsMan && !locked) {
                rmRateCell = rmKg > 0
                    ? `<input type="number" step="0.01" min="0" id="bsSvRmRateInput" placeholder="Avg ${(rmKg > 0 ? (rmManualValDisplay / rmKg).toFixed(2) : '0')}" value="${rmRateDisplay}" oninput="window.BalanceSheetModule.onStockRateInput('rm', 0, this.value)" style="width: 92px; text-align: right; padding: 3px 6px; border: 1px solid #eab308; background: #fef9c3; color: #1e293b; font-weight: 700; font-family: monospace; border-radius: 3px;" />`
                    : `<span style="color: #94a3b8; font-size: 9.5px;">Direct</span>`;
                rmValCell = `<input type="number" step="0.01" min="0" id="bsSvRmValInput" value="${rmManualValDisplay}" oninput="window.BalanceSheetModule.onStockValueInput('rm', 0, this.value)" style="width: 125px; text-align: right; padding: 3px 6px; border: 1.5px solid #ca8a04; background: #fef08a; color: #1e293b; font-weight: 800; font-family: monospace; border-radius: 3px;" />`;
            }

            html += `
                <tr style="background: ${rmIsMan ? '#fefce8' : '#f8fafc'};">
                    <td style="padding: 6px 8px; border: 1px solid #475569; font-weight: 800; color: #92400e;">RM-TOTAL (Raw Material) :-</td>
                    <td style="padding: 4px 8px; border: 1px solid #475569; text-align: center;">${makeToggle('rm', 0, rm.mode)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #475569; text-align: right; font-family: monospace; font-weight: 600;">${rmKg > 0 ? this.formatQty(rmKg) : '-'}</td>
                    <td style="padding: 6px 8px; border: 1px solid #475569; text-align: right; font-size: 10px; color: #64748b; font-family: monospace;">
                        @ ${this.formatCurrency(rm.auto_rate)}<br><span style="color: #475569;">Rs. ${this.formatCurrency(rm.auto_value)}</span>
                    </td>
                    <td style="padding: 4px 8px; border: 1px solid #475569; text-align: center; background: ${rmIsMan ? '#fef9c3' : 'transparent'};">${rmRateCell}</td>
                    <td style="padding: 5px 8px; border: 1px solid #475569; text-align: right; background: ${rmIsMan ? '#fef9c3' : 'transparent'};">${rmValCell}</td>
                </tr>
            `;

            // FLOOR WIP row
            const wip = state.wip_row;
            const wipEff = this.computeStockRowEffective(wip);
            const wipIsMan = (wip.mode === 'manual');
            const wipValCell = (wipIsMan && !locked)
                ? `<input type="number" step="0.01" min="0" value="${parseFloat(wip.manual_value) || 0}" oninput="window.BalanceSheetModule.onStockValueInput('wip', 0, this.value)" style="width: 125px; text-align: right; padding: 3px 6px; border: 1.5px solid #ca8a04; background: #fef08a; color: #1e293b; font-weight: 800; font-family: monospace; border-radius: 3px;" />`
                : `<span id="bsSvRowVal_wip_0" style="font-weight: 700; font-family: monospace; color: ${wipEff.value > 0 ? '#0f172a' : '#94a3b8'};">${wipEff.value > 0 ? this.formatCurrency(wipEff.value) : '0.00'}</span>`;

            html += `
                <tr style="background: ${wipIsMan ? '#fefce8' : '#f8fafc'};">
                    <td style="padding: 5px 8px; border: 1px solid #475569; font-weight: 700; color: #b45309;">FLOOR WIP (Work-In-Process) :-</td>
                    <td style="padding: 4px 8px; border: 1px solid #475569; text-align: center;">${makeToggle('wip', 0, wip.mode)}</td>
                    <td style="padding: 5px 8px; border: 1px solid #475569; text-align: right; color: #94a3b8;">-</td>
                    <td style="padding: 5px 8px; border: 1px solid #475569; text-align: right; font-size: 10px; color: #475569; font-family: monospace;">Rs. ${this.formatCurrency(wip.auto_value)}</td>
                    <td style="padding: 5px 8px; border: 1px solid #475569; text-align: center; color: #94a3b8; font-size: 9.5px;">Floor WIP</td>
                    <td style="padding: 5px 8px; border: 1px solid #475569; text-align: right; background: ${wipIsMan ? '#fef9c3' : 'transparent'};">${wipValCell}</td>
                </tr>
            `;

            // GRAND TOTAL STOCK row
            html += `
                    </tbody>
                    <tfoot>
                        <tr style="background: #0f172a; color: #ffffff; font-weight: 800; font-size: 12.5px;">
                            <td colspan="5" style="padding: 7px 10px; border: 1px solid #0f172a; text-align: center; letter-spacing: 0.4px;">TOTAL STOCK (INVENTORIES ON BALANCE SHEET) :-</td>
                            <td id="bsSvGrandTotalVal" style="padding: 7px 10px; border: 1px solid #0f172a; text-align: right; font-family: monospace; color: #fef08a;">Rs. 0.00</td>
                        </tr>
                    </tfoot>
                </table>
            `;

            container.innerHTML = html;
            this.updateStockValuationSummaryDOM();
        },

        updateStockValuationSummaryDOM: function() {
            const state = this.data.stockValState;
            if (!state) return;

            let fgKg = 0, fgAuto = 0, fgEff = 0;
            state.fg_rows.forEach((row, idx) => {
                const eff = this.computeStockRowEffective(row);
                fgKg += parseFloat(row.stock_kg) || 0;
                fgAuto += parseFloat(row.auto_value) || 0;
                fgEff += eff.value;

                const spanEl = document.getElementById(`bsSvRowVal_fg_${idx}`);
                if (spanEl) {
                    spanEl.textContent = eff.value > 0 ? this.formatCurrency(eff.value) : '-';
                    spanEl.style.color = eff.value > 0 ? '#0f172a' : '#94a3b8';
                }
            });

            const rmEff = this.computeStockRowEffective(state.rm_row);
            const wipEff = this.computeStockRowEffective(state.wip_row);
            const autoTotal = Math.round((fgAuto + (parseFloat(state.rm_row.auto_value) || 0) + (parseFloat(state.wip_row.auto_value) || 0)) * 100) / 100;
            const grandTotal = Math.round((fgEff + rmEff.value + wipEff.value) * 100) / 100;
            const diff = Math.round((grandTotal - autoTotal) * 100) / 100;

            const elFgKg = document.getElementById('bsSvFgTotalKg');
            const elFgAuto = document.getElementById('bsSvFgAutoVal');
            const elFgVal = document.getElementById('bsSvFgTotalVal');
            const elGrand = document.getElementById('bsSvGrandTotalVal');
            const elFootAuto = document.getElementById('bsSvAutoTotalFooter');
            const elFootVar = document.getElementById('bsSvVarianceFooter');

            if (elFgKg) elFgKg.textContent = this.formatQty(fgKg);
            if (elFgAuto) elFgAuto.textContent = `Rs. ${this.formatCurrency(fgAuto)}`;
            if (elFgVal) elFgVal.textContent = `Rs. ${this.formatCurrency(fgEff)}`;
            if (elGrand) elGrand.textContent = `Rs. ${this.formatCurrency(grandTotal)}`;
            if (elFootAuto) elFootAuto.textContent = `Rs. ${this.formatCurrency(autoTotal)}`;
            if (elFootVar) {
                const sign = diff > 0 ? '+' : '';
                elFootVar.textContent = `${sign}Rs. ${this.formatCurrency(diff)}`;
                elFootVar.style.color = Math.abs(diff) < 0.01 ? '#475569' : (diff > 0 ? '#15803d' : '#dc2626');
            }
        },

        toggleStockRowMode: function(scope, idx, newMode) {
            const state = this.data.stockValState;
            if (!state || state.has_saved_closing) return;
            const row = (scope === 'fg') ? state.fg_rows[idx] : (scope === 'rm' ? state.rm_row : state.wip_row);
            if (!row) return;

            row.mode = newMode;
            if (newMode === 'manual') {
                const mRate = parseFloat(row.manual_rate) || 0;
                const mVal = parseFloat(row.manual_value) || 0;
                if (mRate === 0 && mVal === 0) {
                    if (row.row_type === 'fg_category' && (parseFloat(row.stock_kg) || 0) > 0) {
                        row.manual_rate = parseFloat(row.auto_rate) || 0;
                    } else {
                        row.manual_value = parseFloat(row.auto_value) || 0;
                    }
                }
            }
            this.renderStockValuationTable();
        },

        setAllStockValMode: function(targetMode) {
            const state = this.data.stockValState;
            if (!state || state.has_saved_closing) return;

            const applyRow = (row) => {
                row.mode = targetMode;
                if (targetMode === 'manual') {
                    const mRate = parseFloat(row.manual_rate) || 0;
                    const mVal = parseFloat(row.manual_value) || 0;
                    if (mRate === 0 && mVal === 0) {
                        if (row.row_type === 'fg_category' && (parseFloat(row.stock_kg) || 0) > 0) {
                            row.manual_rate = parseFloat(row.auto_rate) || 0;
                        } else {
                            row.manual_value = parseFloat(row.auto_value) || 0;
                        }
                    }
                }
            };
            state.fg_rows.forEach(applyRow);
            applyRow(state.rm_row);
            applyRow(state.wip_row);
            this.renderStockValuationTable();
        },

        onStockRateInput: function(scope, idx, rawVal) {
            const state = this.data.stockValState;
            if (!state) return;
            const row = (scope === 'fg') ? state.fg_rows[idx] : state.rm_row;
            if (!row) return;

            const rate = Math.max(0, parseFloat(rawVal) || 0);
            const kgExact = parseFloat(row.stock_kg_exact != null ? row.stock_kg_exact : row.stock_kg) || 0;
            row.manual_rate = rate;
            row._directValEdited = false;

            if (scope === 'rm') {
                row.manual_value = Math.round(kgExact * rate * 100) / 100;
                const valInput = document.getElementById('bsSvRmValInput');
                if (valInput) valInput.value = row.manual_value.toFixed(2);
            }
            this.updateStockValuationSummaryDOM();
        },

        onStockValueInput: function(scope, idx, rawVal) {
            const state = this.data.stockValState;
            if (!state) return;
            const row = (scope === 'fg') ? state.fg_rows[idx] : (scope === 'rm' ? state.rm_row : state.wip_row);
            if (!row) return;

            const val = Math.max(0, parseFloat(rawVal) || 0);
            row.manual_value = val;
            row._directValEdited = true;

            if (scope === 'rm') {
                row.manual_rate = 0;
                const rateInput = document.getElementById('bsSvRmRateInput');
                if (rateInput) {
                    rateInput.value = '';
                    const kg = parseFloat(row.stock_kg) || 0;
                    rateInput.placeholder = kg > 0 ? `Avg ${(val / kg).toFixed(2)}` : 'Direct';
                }
            }
            this.updateStockValuationSummaryDOM();
        },

        saveStockValuation: async function() {
            const state = this.data.stockValState;
            if (!state) return;
            if (state.has_saved_closing) {
                alert('Monthly Inventory Closing snapshot exists for this month. Clear or unlock it there before applying manual Balance Sheet rates.');
                return;
            }

            const btn = document.getElementById('bsBtnSaveStockVal');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving & Applying...`;
            }

            const serializeRow = (r) => {
                const eff = this.computeStockRowEffective(r);
                const mRate = (r.mode === 'manual') ? (parseFloat(r.manual_rate) || 0) : (parseFloat(r.manual_rate) || 0);
                const mVal = (r.mode === 'manual')
                    ? ((r.row_type === 'fg_category' && (parseFloat(r.stock_kg) || 0) > 0 && mRate > 0) ? eff.value : (parseFloat(r.manual_value) || 0))
                    : (parseFloat(r.manual_value) || 0);
                return {
                    row_key: r.row_key,
                    row_type: r.row_type,
                    category_id: parseInt(r.category_id || 0, 10),
                    row_label: r.row_label,
                    mode: r.mode,
                    manual_rate: Math.round(mRate * 100) / 100,
                    manual_value: Math.round(mVal * 100) / 100
                };
            };

            const payload = {
                company_id: this.data.company_id,
                as_on_date: state.as_on_date,
                period_month: state.period_month,
                tax_mode: state.tax_mode,
                rows: [
                    ...state.fg_rows.map(serializeRow),
                    serializeRow(state.rm_row),
                    serializeRow(state.wip_row)
                ]
            };

            try {
                const res = await fetch(`api/balance_sheet.php?action=save_stock_valuation_sheet&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.status !== 'success') {
                    alert('Save failed: ' + (data.error || 'Unknown error'));
                    return;
                }
                this.closeStockValuation();
                this.loadReport();
            } catch (err) {
                alert('Connection error: ' + err.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-save"></i> Save & Apply to Balance Sheet`;
                }
            }
        },

        resetStockValuation: async function() {
            const state = this.data.stockValState;
            if (!state) return;
            if (!confirm(`Reset all categories in ${state.period_month} back to AUTO mode and clear saved manual rates?`)) {
                return;
            }
            try {
                const res = await fetch(`api/balance_sheet.php?action=reset_stock_valuation_sheet&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        company_id: this.data.company_id,
                        as_on_date: state.as_on_date,
                        period_month: state.period_month
                    })
                });
                const data = await res.json();
                if (data.status !== 'success') {
                    alert('Reset failed: ' + (data.error || 'Unknown error'));
                    return;
                }
                await this.loadStockValuationSheet();
                this.loadReport();
            } catch (err) {
                alert('Connection error: ' + err.message);
            }
        },

        // =========================================================================
        // FEATURE 1: DIFFERENCE DIAGNOSTIC SCANNER (FARQ SCAN)
        // =========================================================================
        openDiagnostic: function() {
            const modal = document.getElementById('bsDiagnosticModal');
            if (modal) {
                modal.style.display = 'flex';
                this.runDiagnosticScan();
            }
        },

        closeDiagnostic: function() {
            const modal = document.getElementById('bsDiagnosticModal');
            if (modal) modal.style.display = 'none';
        },

        runDiagnosticScan: async function() {
            const body = document.getElementById('bsDiagBody');
            if (!body) return;

            body.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--theme-primary, #1F4E79);">
                    <i class="fas fa-spinner fa-spin fa-2x"></i><br>
                    <span style="display:inline-block; margin-top:8px; font-weight:600;">Deep Scanning Opening Balances, Journal Vouchers & Suspense Ledgers...</span>
                </div>
            `;

            const onDate = document.getElementById('bsAsOnDate')?.value || '';
            const vStatus = document.getElementById('bsVoucherStatus')?.value || 'posted';
            const url = `api/balance_sheet.php?action=diagnose_imbalance&company_id=${this.data.company_id}&as_on_date=${onDate}&voucher_status=${vStatus}`;

            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.status !== 'success') {
                    body.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Diagnostic Failed: ${data.error || 'Unknown error'}</div>`;
                    return;
                }

                const sum = data.summary || {};
                const issues = data.issues || [];
                const jvs = data.unbalanced_jvs || [];

                let h = `
                    <!-- Diagnostic Executive Summary Strip -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        <div style="background: ${Math.abs(sum.opening_diff) > 0.01 ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${Math.abs(sum.opening_diff) > 0.01 ? '#fca5a5' : '#86efac'}; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">OPENING BALANCE DIFF</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${Math.abs(sum.opening_diff) > 0.01 ? '#dc2626' : '#16a34a'}; margin-top: 2px;">
                                Rs. ${this.formatCurrency(sum.opening_diff)}
                            </div>
                            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Deb: ${this.formatCurrency(sum.opening_total_debit)} | Crd: ${this.formatCurrency(sum.opening_total_credit)}</div>
                        </div>

                        <div style="background: ${jvs.length > 0 ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${jvs.length > 0 ? '#fca5a5' : '#86efac'}; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">UNBALANCED VOUCHERS</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${jvs.length > 0 ? '#dc2626' : '#16a34a'}; margin-top: 2px;">
                                ${jvs.length} Found
                            </div>
                            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Journal entries where Dr ≠ Cr</div>
                        </div>

                        <div style="background: ${sum.unposted_vouchers && sum.unposted_vouchers.length > 0 ? '#fffbeb' : '#f0fdf4'}; border: 1px solid ${sum.unposted_vouchers && sum.unposted_vouchers.length > 0 ? '#fde68a' : '#86efac'}; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">DRAFT / UNPOSTED</div>
                            <div style="font-size: 14px; font-weight: 800; color: #d97706; margin-top: 2px;">
                                ${sum.unposted_vouchers ? sum.unposted_vouchers.reduce((a, b) => a + b.count, 0) : 0} Vouchers
                            </div>
                            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Excluded from posted totals</div>
                        </div>

                        <div style="background: ${sum.capital_balance > 0 ? '#f0fdf4' : '#fffbeb'}; border: 1px solid ${sum.capital_balance > 0 ? '#86efac' : '#fde68a'}; border-radius: 4px; padding: 8px;">
                            <div style="font-size: 9.5px; font-weight: 700; color: #64748b;">OWNER'S CAPITAL</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${sum.capital_balance > 0 ? '#16a34a' : '#d97706'}; margin-top: 2px;">
                                Rs. ${this.formatCurrency(sum.capital_balance)}
                            </div>
                            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${sum.capital_balance > 0 ? 'Capital recorded' : 'Zero (Needs Setup)'}</div>
                        </div>
                    </div>
                `;

                // Detected Issues & Root Causes Section
                h += `
                    <div style="margin-top: 4px;">
                        <div style="font-weight: 800; font-size: 11.5px; color: #1e293b; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-search-plus" style="color: #ef4444;"></i> Pinpointed Root Causes of Imbalance:
                        </div>
                `;

                if (issues.length === 0) {
                    h += `
                        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 12px; color: #166534; font-weight: 600; text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 18px; margin-bottom: 4px;"></i><br>
                            Alhamdulillah! All double-entry checks passed. No discrepancies detected in Opening Balances or Vouchers.
                        </div>
                    `;
                } else {
                    issues.forEach(iss => {
                        const isCrit = iss.severity === 'critical';
                        const isWarn = iss.severity === 'warning';
                        const borderCol = isCrit ? '#f87171' : (isWarn ? '#fcd34d' : '#93c5fd');
                        const bgCol = isCrit ? '#fef2f2' : (isWarn ? '#fffbeb' : '#eff6ff');
                        const iconCol = isCrit ? '#dc2626' : (isWarn ? '#d97706' : '#2563eb');
                        const iconClass = isCrit ? 'fa-exclamation-circle' : (isWarn ? 'fa-exclamation-triangle' : 'fa-info-circle');

                        h += `
                            <div style="background: ${bgCol}; border: 1px solid ${borderCol}; border-left: 4px solid ${iconCol}; border-radius: 4px; padding: 8px 12px; margin-bottom: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-weight: 800; font-size: 11px; color: ${iconCol}; display: flex; align-items: center; gap: 6px;">
                                        <i class="fas ${iconClass}"></i> ${iss.title}
                                    </span>
                                    ${iss.diff ? `<span style="font-family: monospace; font-weight: 800; font-size: 11px; color: ${iconCol};">Impact: Rs. ${this.formatCurrency(iss.diff)}</span>` : ''}
                                </div>
                                <div style="font-size: 10px; color: #334155; margin-top: 3px;">
                                    ${iss.details}
                                </div>
                                <div style="background: rgba(255,255,255,0.7); border: 1px dashed ${borderCol}; border-radius: 3px; padding: 4px 8px; margin-top: 5px; font-size: 9.5px; color: #1e293b;">
                                    <strong><i class="fas fa-wrench" style="color: ${iconCol};"></i> Recommended Solution:</strong> ${iss.recommendation}
                                </div>
                            </div>
                        `;
                    });
                }

                h += `</div>`;

                // Unbalanced JVs List if any
                if (jvs.length > 0) {
                    h += `
                        <div style="margin-top: 6px;">
                            <div style="font-weight: 800; font-size: 11px; color: #991b1b; margin-bottom: 4px;">
                                <i class="fas fa-list-ol"></i> Discrepant Journal Vouchers:
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #cbd5e1;">
                                <tr style="background: #f1f5f9; font-weight: 700; color: #334155;">
                                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: left;">Serial #</th>
                                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: left;">Date</th>
                                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: left;">Description</th>
                                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right;">Total Debit</th>
                                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right;">Total Credit</th>
                                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; color: #dc2626;">Difference</th>
                                </tr>
                    `;
                    jvs.forEach(jv => {
                        h += `
                            <tr>
                                <td style="padding: 3px 6px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: 700;">JV-${jv.serial_no}</td>
                                <td style="padding: 3px 6px; border: 1px solid #e2e8f0;">${jv.voucher_date}</td>
                                <td style="padding: 3px 6px; border: 1px solid #e2e8f0;">${jv.description}</td>
                                <td style="padding: 3px 6px; border: 1px solid #e2e8f0; text-align: right;">${this.formatCurrency(jv.tot_deb)}</td>
                                <td style="padding: 3px 6px; border: 1px solid #e2e8f0; text-align: right;">${this.formatCurrency(jv.tot_crd)}</td>
                                <td style="padding: 3px 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #dc2626;">${this.formatCurrency(jv.diff)}</td>
                            </tr>
                        `;
                    });
                    h += `</table></div>`;
                }

                body.innerHTML = h;

            } catch (err) {
                console.error("Diagnostic scanner error:", err);
                body.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Error running diagnostic: ${err.message}</div>`;
            }
        },

        formatCurrency: function(amt) {
            const num = parseFloat(amt) || 0;
            if (this.data.scale === 'k') {
                const kVal = num / 1000;
                return kVal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' k';
            } else if (this.data.scale === 'm') {
                const mVal = num / 1000000;
                return mVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' M';
            }
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        setScale: function(scale) {
            this.data.scale = scale;
            const btnRs = document.getElementById('bsBtnScaleRs');
            const btnK = document.getElementById('bsBtnScaleK');
            const btnM = document.getElementById('bsBtnScaleM');

            const resetBtn = (btn) => {
                if (btn) { btn.style.background = 'transparent'; btn.style.color = '#64748b'; btn.style.fontWeight = '600'; }
            };
            const activeBtn = (btn) => {
                if (btn) { btn.style.background = '#0284c7'; btn.style.color = 'white'; btn.style.fontWeight = '700'; }
            };

            resetBtn(btnRs); resetBtn(btnK); resetBtn(btnM);
            if (scale === 'k') activeBtn(btnK);
            else if (scale === 'm') activeBtn(btnM);
            else activeBtn(btnRs);

            if (this.data.lastReportData) {
                this.renderReport(this.data.lastReportData);
            }
        },

        exportExcel: function() {
            if (!this.data.lastReportData) return alert("Please generate the report first.");
            const data = this.data.lastReportData;
            const kpi = data.kpi || {};
            const asOn = data.as_on_date_formatted || data.as_on_date;
            const coName = this.data.companyName || 'SoftifyX Financials';
            const taxModeLabel = data.tax_mode_label || (data.tax_mode === 'non_tax' ? 'Non-Tax (Full Bill)' : 'Tax (Excl. GST)');

            let tableHtml = `
                <table border="1">
                    <tr><th colspan="4" style="font-size:16px; font-weight:bold; text-align:center;">${coName}</th></tr>
                    <tr><th colspan="4" style="font-size:13px; font-weight:bold; text-align:center;">BALANCE SHEET (STATEMENT OF FINANCIAL POSITION)</th></tr>
                    <tr><th colspan="4" style="font-size:11px; text-align:center;">As on Date: ${asOn} | Valuation Mode: ${taxModeLabel}</th></tr>
                    <tr><th colspan="4"></th></tr>
                    <tr style="background:#0284c7; color:white;"><th colspan="4">ASSETS</th></tr>
                    <tr><th>Code</th><th>Account Title</th><th>Category</th><th>Amount (PKR)</th></tr>
            `;

            const appendSection = (secData) => {
                if (!secData || !secData.groups) return;
                secData.groups.forEach(g => {
                    tableHtml += `<tr><td colspan="4" style="background:#f1f5f9; font-weight:bold;">${g.sub_head}</td></tr>`;
                    g.items.forEach(it => {
                        tableHtml += `<tr><td>${it.code}</td><td>${it.name}</td><td>${it.sub_head}</td><td style="text-align:right;">${it.amount}</td></tr>`;
                    });
                    tableHtml += `<tr style="font-weight:bold;"><td colspan="3">Subtotal - ${g.sub_head}</td><td style="text-align:right;">${g.total}</td></tr>`;
                });
            };

            appendSection(data.sections.non_current_assets);
            appendSection(data.sections.current_assets);
            tableHtml += `<tr style="background:#e0f2fe; font-weight:bold;"><td colspan="3">TOTAL ASSETS</td><td style="text-align:right;">${kpi.total_assets}</td></tr>`;

            tableHtml += `<tr><th colspan="4"></th></tr>`;
            tableHtml += `<tr style="background:#ea580c; color:white;"><th colspan="4">LIABILITIES & OWNER'S EQUITY</th></tr>`;
            appendSection(data.sections.non_current_liabilities);
            appendSection(data.sections.current_liabilities);
            appendSection(data.sections.owner_equity);
            tableHtml += `<tr style="background:#ffedd5; font-weight:bold;"><td colspan="3">TOTAL LIABILITIES & EQUITY</td><td style="text-align:right;">${kpi.total_liabilities_and_equity}</td></tr>`;

            tableHtml += `
                <tr><th colspan="4"></th></tr>
                <tr style="background:#f0fdf4; font-weight:bold;"><td colspan="3">Meezan Equilibrium Check (Diff)</td><td style="text-align:right;">${kpi.difference}</td></tr>
            </table>`;

            const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Balance_Sheet_${asOn.replace(/\s+/g, '_')}.xls`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        printReport: function() {
            if (!this.data.lastReportData) return alert("Please generate the report first.");
            const data = this.data.lastReportData;
            const kpi = data.kpi || {};
            const asOn = data.as_on_date_formatted || data.as_on_date;
            const co = this.data.companyInfo || {};
            const coName = co.name || this.data.companyName || 'SoftifyX Financials';
            const coAddr = co.address || 'Industrial Estate, Hayatabad, Peshawar';
            const coPhone = co.phone || '+92 348 7240256';
            const coNtn = co.ntn || '7294819-4';
            const coGst = co.gst || '32-77-8761-123-11';

            const printWin = window.open('', '_blank', 'width=1150,height=850');
            if (!printWin) return alert("Popup blocked! Please allow popups for printing.");

            const renderPrintSection = (secData, title, total) => {
                if (!secData || !secData.groups) return '';
                let h = `
                    <div style="margin-bottom: 10px;">
                        <div style="background: #f1f5f9; padding: 4px 8px; font-weight: 800; font-size: 11px; border: 1px solid #cbd5e1; display: flex; justify-content: space-between;">
                            <span>${title}</span>
                            <span>Rs. ${this.formatCurrency(total)}</span>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; border-top: none;">
                `;
                secData.groups.forEach(g => {
                    h += `<tr style="background: #f8fafc; font-weight: bold;"><td colspan="2" style="padding: 3px 6px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${g.sub_head}</td><td style="text-align: right; padding: 3px 6px; border-bottom: 1px solid #e2e8f0;">Rs. ${this.formatCurrency(g.total)}</td></tr>`;
                    g.items.forEach(it => {
                        h += `<tr><td style="width: 60px; padding: 2px 6px 2px 16px; color: #64748b; font-family: monospace; border-bottom: 1px solid #f1f5f9;">${it.code}</td><td style="padding: 2px 6px; border-bottom: 1px solid #f1f5f9;">${it.name}</td><td style="text-align: right; padding: 2px 6px; border-bottom: 1px solid #f1f5f9;">Rs. ${this.formatCurrency(it.amount)}</td></tr>`;
                    });
                });
                h += `</table></div>`;
                return h;
            };

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Balance Sheet - ${coName}</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 15px; font-size: 11px; color: #0f172a; line-height: 1.4; }
                        @media print {
                            @page { size: A4 landscape; margin: 8mm; }
                            body { margin: 0; }
                            .no-print { display: none !important; }
                        }
                    </style>
                </head>
                <body>
                    <div class="no-print" style="margin-bottom: 12px; text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                        <button onclick="window.print()" style="padding: 6px 16px; background: #1F4E79; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px;">
                            Print Statement (PDF)
                        </button>
                    </div>

                    <!-- Corporate Letterhead -->
                    <div style="border-bottom: 2.5px solid #1F4E79; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
                        <div>
                            <h1 style="margin: 0; font-size: 19px; color: #1F4E79; text-transform: uppercase; letter-spacing: 0.5px;">${coName}</h1>
                            <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">${coAddr} • Phone: ${coPhone}</div>
                            <div style="font-size: 10px; color: #64748b; margin-top: 1px;">NTN: ${coNtn} | STRN / GST: ${coGst}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 14px; font-weight: 800; color: #1e293b; text-transform: uppercase;">Statement of Financial Position</div>
                            <div style="font-size: 11px; font-weight: 700; color: #0284c7; margin-top: 2px;">As at ${asOn}</div>
                            <div style="font-size: 9.5px; color: #64748b;">Valuation: ${data.tax_mode_label || 'Standard'} (PKR)</div>
                        </div>
                    </div>

                    <!-- 2-Column Balance Sheet Presentation -->
                    <div style="display: flex; gap: 15px;">
                        <!-- Left: Assets -->
                        <div style="flex: 1;">
                            <div style="background: #e0f2fe; padding: 6px 10px; font-weight: 800; font-size: 12px; border: 1px solid #0284c7; display: flex; justify-content: space-between; color: #0369a1;">
                                <span>TOTAL ASSETS</span>
                                <span>Rs. ${this.formatCurrency(kpi.total_assets)}</span>
                            </div>
                            <div style="padding-top: 6px;">
                                ${renderPrintSection(data.sections.non_current_assets, 'Non-Current Assets (Fixed)', kpi.non_current_assets)}
                                ${renderPrintSection(data.sections.current_assets, 'Current Assets', kpi.current_assets)}
                            </div>
                            <div style="background: #e0f2fe; padding: 6px 10px; font-weight: 800; font-size: 12px; border: 1px solid #0284c7; border-top: 2px double #0284c7; display: flex; justify-content: space-between; color: #0369a1; margin-top: 4px;">
                                <span>TOTAL ASSETS</span>
                                <span>Rs. ${this.formatCurrency(kpi.total_assets)}</span>
                            </div>
                        </div>

                        <!-- Right: Liabilities & Equity -->
                        <div style="flex: 1;">
                            <div style="background: #ffedd5; padding: 6px 10px; font-weight: 800; font-size: 12px; border: 1px solid #ea580c; display: flex; justify-content: space-between; color: #9a3412;">
                                <span>TOTAL LIABILITIES & EQUITY</span>
                                <span>Rs. ${this.formatCurrency(kpi.total_liabilities_and_equity)}</span>
                            </div>
                            <div style="padding-top: 6px;">
                                ${renderPrintSection(data.sections.non_current_liabilities, 'Non-Current Liabilities', kpi.non_current_liabilities)}
                                ${renderPrintSection(data.sections.current_liabilities, 'Current Liabilities', kpi.current_liabilities)}
                                ${renderPrintSection(data.sections.owner_equity, "Owner's Equity & Reserves", kpi.owner_equity)}
                            </div>
                            <div style="background: #ffedd5; padding: 6px 10px; font-weight: 800; font-size: 12px; border: 1px solid #ea580c; border-top: 2px double #ea580c; display: flex; justify-content: space-between; color: #9a3412; margin-top: 4px;">
                                <span>TOTAL LIABILITIES & EQUITY</span>
                                <span>Rs. ${this.formatCurrency(kpi.total_liabilities_and_equity)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Notes to the Accounts & Verification Summary -->
                    <div style="margin-top: 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; font-size: 10px;">
                        <div style="font-weight: 700; color: #334155; margin-bottom: 3px;">NOTES TO THE FINANCIAL STATEMENTS (BASIS OF PREPARATION):</div>
                        <div style="color: #64748b;">
                            1. <strong>Accounting Convention:</strong> These financial statements have been prepared under the historical cost convention on an accrual basis, conforming to International Financial Reporting Standards (IFRS) as applicable in Pakistan.<br>
                            2. <strong>Manufacturing Inventories:</strong> Raw materials and finished goods are valued at lower of cost and net realizable value (NRV). Work-in-Process (WIP) includes direct material and applicable manufacturing overheads.<br>
                            3. <strong>Meezan Equilibrium:</strong> Total Assets exactly balance Total Liabilities and Owner's Equity (Variance: Rs. ${this.formatCurrency(kpi.difference)}). Working Capital stands at Rs. ${this.formatCurrency(kpi.working_capital)}.
                        </div>
                    </div>

                    <!-- Official Verification & Signatures Block -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 45px; padding: 0 10px; text-align: center;">
                        <div>
                            <div style="border-top: 1.5px solid #334155; padding-top: 5px; font-weight: 700; font-size: 10.5px;">PREPARED BY</div>
                            <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">Accounts Officer</div>
                        </div>
                        <div>
                            <div style="border-top: 1.5px solid #334155; padding-top: 5px; font-weight: 700; font-size: 10.5px;">CHECKED BY</div>
                            <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">Internal Auditor</div>
                        </div>
                        <div>
                            <div style="border-top: 1.5px solid #334155; padding-top: 5px; font-weight: 700; font-size: 10.5px;">APPROVED BY</div>
                            <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">Chief Executive Officer</div>
                        </div>
                        <div style="border: 1px dashed #94a3b8; border-radius: 4px; padding: 8px 4px; margin-top: -15px;">
                            <div style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Company Seal / Stamp</div>
                            <div style="font-size: 8px; color: #cbd5e1; margin-top: 8px;">(Official Stamp Area)</div>
                        </div>
                    </div>

                    <div style="margin-top: 25px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 4px;">
                        Generated via SoftifyX ERP • Audited Manufacturing Balance Sheet Module • ${new Date().toLocaleString()}
                    </div>
                </body>
                </html>
            `;

            printWin.document.open();
            printWin.document.write(html);
            printWin.document.close();
        }
    };

    window.BalanceSheetModule = BalanceSheetModule;
})();
