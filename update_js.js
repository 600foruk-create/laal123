const fs = require('fs');
const path = require('path');

const config = [
    { file: 'add_inventory_adjustments.js', api: 'add_inventory_adjustments', sn_id: 'aia_sn' },
    { file: 'inventory_transfers.js', api: 'inventory_transfers', sn_id: 'it_sn' },
    { file: 'inward_gate_passes.js', api: 'inward_gate_passes', sn_id: 'igp_sn' },
    { file: 'material_issue_notes.js', api: 'material_issue_notes', sn_id: 'min_sn' },
    { file: 'outward_gate_passes.js', api: 'outward_gate_passes', sn_id: 'ogp_sn' },
    { file: 'production_notes.js', api: 'production_notes', sn_id: 'pn_sn' },
    { file: 'reduce_inventory_adjustments.js', api: 'reduce_inventory_adjustments', sn_id: 'ria_sn' }
];

function replaceFunction(content, funcName, replacement) {
    const startRegex = new RegExp(funcName + '\\s*:\\s*(?:async\\s*)?function\\s*\\([^)]*\\)\\s*\\{');
    const match = content.match(startRegex);
    if (!match) return content;
    
    let startIndex = match.index;
    let braceCount = 0;
    let inString = false;
    let strChar = '';
    let endIndex = -1;
    
    for (let i = startIndex + match[0].length - 1; i < content.length; i++) {
        const char = content[i];
        if (inString) {
            if (char === strChar && content[i-1] !== '\\\\') inString = false;
            continue;
        }
        if (char === '"' || char === "'" || char === '\') {
            inString = true;
            strChar = char;
            continue;
        }
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        
        if (braceCount === 0) {
            endIndex = i;
            break;
        }
    }
    
    if (endIndex !== -1) {
        return content.substring(0, startIndex) + replacement + content.substring(endIndex + 1);
    }
    return content;
}

for (let item of config) {
    const filePath = path.join('d:\\SOFTIFYX FINANCIAL\\SOFTIFYXFINANCIALS\\assets\\js', item.file);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add showToast if not exists
    if (!content.includes('showToast:')) {
        const showToastFn =         showToast: function(msg) {
            let toast = document.getElementById('\_toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = '\_toast';
                toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1F4E79;color:#fff;padding:8px 24px;border-radius:20px;font-size:12px;font-weight:600;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.3s;';
                document.body.appendChild(toast);
            }
            toast.innerText = msg;
            toast.style.opacity = '1';
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
        },;
        
        // insert after init: function() { ... }
        content = replaceFunction(content, 'dummy_never_matches', ''); // just a trick
        content = content.replace(/(init:\s*function\(\)\s*\{[\s\S]*?\n\s*\},\n)/, "\n" + showToastFn + "\n\n");
    }
    
    const navigateBySNFn = 
avigateBySN: async function(sn, dir = '') {
            try {
                let url = \pi/.php?action=fetch&sn=\\;
                if (dir && (dir === 'next' || dir === 'prev')) {
                    url += \&dir=\\;
                }
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    this.fillForm(data);
                } else {
                    if (dir === 'next' || dir === 'last') {
                        this.showToast ? this.showToast('You are on the last record') : alert('You are on the last record');
                    } else if (dir === 'prev') {
                        this.showToast ? this.showToast('You are on the first record') : alert('You are on the first record');
                    } else {
                        alert("Record not found.");
                        this.resetForm(true);
                    }
                }
            } catch (err) { console.error(err); }
        };
        
    const navigateFn = 
avigate: async function(dir) {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const companyId = session.company_id || 1;
            let sn = parseInt(document.getElementById('').value) || 0;
            
            if (dir === 'last') {
                try {
                    const res = await fetch(\pi/.php?action=get_next_serial_no&company_id=\\);
                    const data = await res.json();
                    sn = (data.next_no || data.next_sn || 2) - 1;
                    dir = undefined;
                } catch(e) { return; }
            } else if (sn === 0 || dir === 'this') {
                if (dir === 'next') {
                    try {
                        const res = await fetch(\pi/.php?action=get_next_serial_no&company_id=\\);
                        const data = await res.json();
                        sn = (data.next_no || data.next_sn || 2) - 1;
                        dir = undefined;
                    } catch(e) { return; }
                } else if (dir !== 'next' && dir !== 'prev') {
                    sn = 1;
                    dir = undefined;
                }
            } else {
                if (dir !== 'next' && dir !== 'prev') {
                    dir = undefined;
                }
            }
            if (sn > 0 || dir) this.navigateBySN(sn, dir);
        };
        
    content = replaceFunction(content, 'navigateBySN', navigateBySNFn);
    content = replaceFunction(content, 'navigate', navigateFn);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated ' + item.file);
}
