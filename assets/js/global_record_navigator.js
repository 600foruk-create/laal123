/**
 * SoftifyX ERP - Global Record Navigator
 * Intercepts "Retrieve Last Saved" clicks across all forms globally.
 * Queries the database Activity Log to navigate directly to the record that was
 * LAST EDITED/MODIFIED, instead of just the highest serial number.
 * Requires ZERO changes to individual form HTML or module JS files.
 */
(function(window) {
    'use strict';

    const GlobalRecordNavigator = {
        // Module instance resolver
        getModuleInstance: function(moduleName) {
            if (!moduleName) return null;
            const norm = moduleName.trim().toLowerCase();

            const map = {
                'material issue notes': () => window.MINModule,
                'material issue note': () => window.MINModule,
                'delivery challans': () => window.DeliveryChallanModule || window.DCModule,
                'delivery challan': () => window.DeliveryChallanModule || window.DCModule,
                'inward gate passes': () => window.IGPModule,
                'inward gate pass': () => window.IGPModule,
                'outward gate passes': () => window.OGPModule,
                'outward gate pass': () => window.OGPModule,
                'production notes': () => window.PNModule,
                'production note': () => window.PNModule,
                'inventory transfers': () => window.ITModule,
                'inventory transfer': () => window.ITModule,
                'add inventory adjustments': () => window.AIAModule,
                'reduce inventory adjustments': () => window.RIAModule,
                'formulas': () => window.FRMModule || window.FormulaModule,
                'formula': () => window.FRMModule || window.FormulaModule,
                'purchase invoices': () => window.PIModule,
                'purchase invoice': () => window.PIModule,
                'purchase orders': () => window.POModule,
                'purchase order': () => window.POModule,
                'purchase returns': () => window.PRModule,
                'purchase return': () => window.PRModule,
                'sale invoice': () => window.SIModule,
                'sale invoices': () => window.SIModule,
                'sale orders': () => window.SaleOrderModule || window.SOModule,
                'sale order': () => window.SaleOrderModule || window.SOModule,
                'sale return': () => window.SRModule,
                'sale returns': () => window.SRModule,
                'quotations': () => window.QuotationModule,
                'quotation': () => window.QuotationModule,
                'customer follow ups': () => window.CFUModule,
                'customer follow up': () => window.CFUModule,
                'cash payments': () => window.CPModule,
                'bank payments': () => window.BPModule,
                'cash receipts': () => window.CRModule,
                'bank receipts': () => window.BRModule,
                'general journal voucher': () => window.GJVModule
            };

            for (const key in map) {
                if (norm === key || norm.includes(key) || key.includes(norm)) {
                    const inst = map[key]();
                    if (inst) return inst;
                }
            }

            return null;
        },

        // Helper to locate the Serial / Voucher input inside an active container
        getSerialInput: function(container) {
            if (!container) return null;
            return container.querySelector(`
                input[id$="_sn"],
                input[id$="_serial"],
                input[id$="_no"],
                input[name="serial_no"],
                input[name="voucher_no"]
            `);
        },

        // Navigate target form to the designated serial number
        navigateToSerial: async function(moduleName, serialNo, id, container) {
            const mod = this.getModuleInstance(moduleName);

            // 1. Direct navigateBySN support (used by MIN, DC, IGP, OGP, PN, IT, AIA, RIA, FRM, Quotation, SO)
            if (mod && typeof mod.navigateBySN === 'function') {
                await mod.navigateBySN(serialNo);
                this.showToast(`Retrieved last edited record #${serialNo}`);
                return true;
            }

            // 2. Direct navigateBySerial support (used by CP, BP, CR, BR)
            if (mod && typeof mod.navigateBySerial === 'function') {
                await mod.navigateBySerial(serialNo);
                this.showToast(`Retrieved last edited record #${serialNo}`);
                return true;
            }

            // 3. Purchase Invoice
            if (moduleName.toLowerCase().includes('purchase invoice')) {
                const snInput = document.getElementById('pi_sn') || container?.querySelector('#pi_sn');
                if (snInput) snInput.value = serialNo;
                if (mod && typeof mod.navigate === 'function') {
                    await mod.navigate('this');
                    this.showToast(`Retrieved last edited invoice #${serialNo}`);
                    return true;
                }
            }

            // 4. Purchase Order
            if (moduleName.toLowerCase().includes('purchase order')) {
                const snInput = document.getElementById('po_sn') || container?.querySelector('#po_sn');
                if (snInput) snInput.value = serialNo;
                if (mod && typeof mod.navigate === 'function') {
                    await mod.navigate('this');
                    this.showToast(`Retrieved last edited PO #${serialNo}`);
                    return true;
                }
            }

            // 5. Purchase Return
            if (moduleName.toLowerCase().includes('purchase return')) {
                const snInput = document.getElementById('pr_sn') || container?.querySelector('#pr_sn');
                if (snInput) snInput.value = serialNo;
                if (mod && typeof mod.navigate === 'function') {
                    await mod.navigate('this');
                    this.showToast(`Retrieved last edited return #${serialNo}`);
                    return true;
                }
            }

            // 6. Sale Return
            if (moduleName.toLowerCase().includes('sale return')) {
                const snInput = document.getElementById('sr_sn') || container?.querySelector('#sr_sn');
                if (snInput) snInput.value = serialNo;
                if (mod && typeof mod.navigate === 'function') {
                    await mod.navigate('this');
                    this.showToast(`Retrieved last edited return #${serialNo}`);
                    return true;
                }
            }

            // 7. General Journal Voucher
            if (moduleName.toLowerCase().includes('general journal')) {
                const snInput = document.getElementById('gj_sn') || document.getElementById('gjv_sn') || container?.querySelector('#gj_sn');
                if (snInput) snInput.value = serialNo;
                if (mod && typeof mod.navigate === 'function') {
                    await mod.navigate();
                    this.showToast(`Retrieved last edited voucher #${serialNo}`);
                    return true;
                }
            }

            // 8. Sale Invoice
            if (moduleName.toLowerCase().includes('sale invoice')) {
                const snInput = document.getElementById('si_sn') || container?.querySelector('#si_sn');
                if (snInput) snInput.value = serialNo;
                if (mod && typeof mod.navigate === 'function') {
                    await mod.navigate();
                    this.showToast(`Retrieved last edited invoice #${serialNo}`);
                    return true;
                }
            }

            // 9. Generic input-based fallback
            const snInput = this.getSerialInput(container);
            if (snInput) {
                snInput.value = serialNo;
                snInput.dispatchEvent(new Event('input', { bubbles: true }));
                snInput.dispatchEvent(new Event('change', { bubbles: true }));
                snInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                if (mod && typeof mod.navigate === 'function') {
                    try { await mod.navigate('this'); } catch(e) {}
                }
                this.showToast(`Retrieved last edited record #${serialNo}`);
                return true;
            }

            return false;
        },

        showToast: function(msg) {
            let toast = document.getElementById('global_nav_toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'global_nav_toast';
                toast.style.cssText = 'position:fixed;bottom:25px;right:25px;background:#0f172a;color:#ffffff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;z-index:999999;box-shadow:0 6px 20px rgba(0,0,0,0.3);transition:opacity 0.25s;display:flex;align-items:center;gap:8px;pointer-events:none;border-left:4px solid #10b981;';
                document.body.appendChild(toast);
            }
            toast.innerHTML = `<i class="fas fa-history" style="color:#10b981;"></i> ${msg}`;
            toast.style.opacity = '1';
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => { if (toast) toast.style.opacity = '0'; }, 2400);
        },

        // Main handler when "Retrieve Last Saved" button is clicked
        retrieveLast: async function(btn) {
            const container = btn.closest('[data-module]') || 
                              btn.closest('.modal-container')?.querySelector('[data-module]') ||
                              btn.closest('.modal-container');
            const moduleName = container?.getAttribute('data-module') || '';

            if (!moduleName) {
                return false;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;

            btn.style.opacity = '0.7';

            try {
                const res = await fetch(`api/global_navigation.php?action=get_last_edited&module=${encodeURIComponent(moduleName)}&company_id=${companyId}`);
                const data = await res.json();

                if (data && data.status === 'success' && data.serial_no) {
                    const ok = await this.navigateToSerial(moduleName, data.serial_no, data.id, container);
                    if (ok) return true;
                }
            } catch (err) {
                console.warn('GlobalRecordNavigator: Failed to fetch last edited record, falling back to default', err);
            } finally {
                btn.style.opacity = '1';
            }

            // Fallback: If not found or failed, invoke module's default navigate('last') or navigate('next')
            const mod = this.getModuleInstance(moduleName);
            if (mod && typeof mod.navigate === 'function') {
                try {
                    await mod.navigate('last');
                    return true;
                } catch(e) {
                    try { await mod.navigate('next'); return true; } catch(e2) {}
                }
            }

            return false;
        }
    };

    // Attach to window
    window.GlobalRecordNavigator = GlobalRecordNavigator;

    // Global Click Capture Listener:
    // Intercepts any click on "Retrieve Last Saved" across ANY modal window BEFORE inline onclick fires!
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;

        // Check if button text matches "retrieve last"
        const text = (btn.innerText || btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!text.includes('retrieve last')) return;

        // Stop the inline onclick from jumping to MAX(serial_no)
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Run the global Activity-Log based navigator
        GlobalRecordNavigator.retrieveLast(btn);
    }, true); // Capture phase is critical to run before inline onclick

})(window);
