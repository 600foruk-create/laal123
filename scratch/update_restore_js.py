import os
import re

files = [
    r"d:\SOFTIFYX FINANCIAL\SOFTIFYXFINANCIALS\assets\js\app_v128.js",
    r"d:\SOFTIFYX FINANCIAL\SOFTIFYXFINANCIALS\assets\js\app_v2.js",
    r"d:\SOFTIFYX FINANCIAL\SOFTIFYXFINANCIALS\assets\js\app.js"
]

security_check_code = """
                // --- NEW SECURITY CHECK ---
                try {
                    const dbRes = await fetch('api/settings.php?action=get_db_name');
                    const dbData = await dbRes.json();
                    const currentDbName = dbData.db_name;
                    const backupDbName = data._database_name;
                    
                    if (currentDbName && backupDbName && currentDbName !== backupDbName) {
                        let overrideGranted = await new Promise(async (resolve) => {
                            const overrideRes = await fetch('api/settings.php?action=get_global_setting&key=backup_override_code');
                            const overrideData = await overrideRes.json();
                            const secretCode = (overrideData.value || '').toLowerCase();
                            
                            const errorMsg = document.createElement('div');
                            errorMsg.style.position = 'fixed';
                            errorMsg.style.top = '0';
                            errorMsg.style.left = '0';
                            errorMsg.style.width = '100%';
                            errorMsg.style.height = '100%';
                            errorMsg.style.backgroundColor = 'rgba(0,0,0,0.8)';
                            errorMsg.style.zIndex = '999999';
                            errorMsg.style.display = 'flex';
                            errorMsg.style.flexDirection = 'column';
                            errorMsg.style.justifyContent = 'center';
                            errorMsg.style.alignItems = 'center';
                            
                            const msgBox = document.createElement('div');
                            msgBox.style.backgroundColor = '#fff';
                            msgBox.style.padding = '30px';
                            msgBox.style.borderRadius = '8px';
                            msgBox.style.textAlign = 'center';
                            msgBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
                            
                            const icon = document.createElement('i');
                            icon.className = 'fas fa-exclamation-triangle';
                            icon.style.fontSize = '48px';
                            icon.style.color = '#dc3545';
                            icon.style.marginBottom = '20px';
                            
                            const text = document.createElement('h3');
                            text.innerText = 'Database Mismatch Error';
                            text.style.color = '#333';
                            text.style.marginTop = '0';
                            
                            const p = document.createElement('p');
                            p.innerText = 'The backup file you are trying to restore belongs to a different database. Restoration cannot proceed.';
                            p.style.color = '#666';
                            p.style.maxWidth = '300px';
                            
                            const okBtn = document.createElement('button');
                            okBtn.innerText = 'OK';
                            okBtn.className = 'btn btn-primary';
                            okBtn.style.marginTop = '20px';
                            okBtn.style.padding = '10px 30px';
                            okBtn.style.cursor = 'pointer';
                            
                            msgBox.appendChild(icon);
                            msgBox.appendChild(text);
                            msgBox.appendChild(p);
                            msgBox.appendChild(okBtn);
                            errorMsg.appendChild(msgBox);
                            document.body.appendChild(errorMsg);
                            
                            let typedCode = '';
                            const keydownListener = (ev) => {
                                if (!secretCode) return;
                                typedCode += ev.key.toLowerCase();
                                if (typedCode.length > secretCode.length) {
                                    typedCode = typedCode.substring(typedCode.length - secretCode.length);
                                }
                                if (typedCode === secretCode) {
                                    document.removeEventListener('keydown', keydownListener);
                                    document.body.removeChild(errorMsg);
                                    resolve(true);
                                }
                            };
                            
                            document.addEventListener('keydown', keydownListener);
                            
                            okBtn.onclick = () => {
                                document.removeEventListener('keydown', keydownListener);
                                document.body.removeChild(errorMsg);
                                resolve(false);
                            };
                        });
                        
                        if (!overrideGranted) {
                            event.target.value = '';
                            return;
                        }
                    }
                } catch(e) {
                    console.error("Error checking db name", e);
                }
                // --- END SECURITY CHECK ---
"""

for file_path in files:
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        target_str = '''                } catch(err) {
                    alert("System Restore Error: The selected file is not a valid JSON backup file. Restoration canceled.");
                    event.target.value = '';
                    return;
                }'''
        
        if target_str in content and "// --- NEW SECURITY CHECK ---" not in content:
            new_content = content.replace(target_str, target_str + "\n" + security_check_code)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file_path}")
        else:
            print(f"Target string not found or already updated in {file_path}")
    else:
        print(f"File not found: {file_path}")
