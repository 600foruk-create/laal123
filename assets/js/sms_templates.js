(function() {
    const SMSTemplatesModule = {
        data: {
            currentId: null,
            templates: [],
            company_id: 1
        },

        init: async function() {
            // Get session company id
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = session.company_id || 1;

            // Load Templates List
            await this.loadTemplatesList();
            this.resetForm(true);

            // Bind char counter
            const msgArea = document.getElementById('tmplMessage');
            if (msgArea) {
                msgArea.addEventListener('input', () => this.updateCharCounter());
            }

            // Bind placeholder clicks
            document.querySelectorAll('#smsTemplatesContainer ul li strong').forEach(el => {
                el.style.cursor = 'pointer';
                el.title = 'Double click to insert';
                el.addEventListener('dblclick', () => {
                    const tag = el.textContent.trim();
                    const txtArea = document.getElementById('tmplMessage');
                    if (txtArea) {
                        const start = txtArea.selectionStart;
                        const end = txtArea.selectionEnd;
                        const text = txtArea.value;
                        txtArea.value = text.substring(0, start) + tag + text.substring(end);
                        txtArea.focus();
                        txtArea.selectionStart = txtArea.selectionEnd = start + tag.length;
                        this.updateCharCounter();
                    }
                });
            });
        },

        loadTemplatesList: async function() {
            try {
                const res = await fetch(`api/sms_templates.php?action=get_templates&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.templates = await res.json();
                    const tbody = document.getElementById('tmplListBody');
                    if (tbody) {
                        tbody.innerHTML = '';
                        this.data.templates.forEach(t => {
                            const tr = document.createElement('tr');
                            tr.onclick = () => this.selectTemplate(t.id);
                            tr.id = `tmpl_row_${t.id}`;
                            tr.innerHTML = `
                                <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: left;">${t.serial_no}</td>
                                <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #1e3a8a;">${this.escapeHTML(t.template_name)}</td>
                                <td style="padding: 5px 8px; border: 1px solid #e2e8f0; max-width: 450px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHTML(t.message)}</td>
                                <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center;">
                                    <span style="padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; background: ${t.is_active == 1 ? '#dcfce7; color: #15803d;' : '#fee2e2; color: #b91c1c;'}">
                                        ${t.is_active == 1 ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }
                }
            } catch (err) {
                console.error("Error loading templates:", err);
            }
        },

        selectTemplate: function(id) {
            const t = this.data.templates.find(item => item.id === id);
            if (!t) return;

            this.data.currentId = t.id;
            document.getElementById('tmplSerialNo').value = t.serial_no;
            document.getElementById('tmplName').value = t.template_name;
            document.getElementById('tmplMessage').value = t.message;
            document.getElementById('tmplIsActive').checked = t.is_active == 1;

            // Highlight row
            document.querySelectorAll('#tmplListBody tr').forEach(r => r.classList.remove('active'));
            const activeRow = document.getElementById(`tmpl_row_${t.id}`);
            if (activeRow) activeRow.classList.add('active');

            this.updateCharCounter();
        },

        resetForm: async function(createNew = true) {
            this.data.currentId = null;
            document.getElementById('tmplName').value = '';
            document.getElementById('tmplMessage').value = '';
            document.getElementById('tmplIsActive').checked = true;
            document.querySelectorAll('#tmplListBody tr').forEach(r => r.classList.remove('active'));

            if (createNew) {
                try {
                    const res = await fetch(`api/sms_templates.php?action=get_next_serial_no&company_id=${this.data.company_id}`);
                    if (res.ok) {
                        const data = await res.json();
                        document.getElementById('tmplSerialNo').value = data.next_no;
                    }
                } catch (err) {
                    console.error("Error fetching serial no:", err);
                }
            } else {
                document.getElementById('tmplSerialNo').value = '';
            }

            this.updateCharCounter();
        },

        saveTemplate: async function() {
            const serial_no = document.getElementById('tmplSerialNo').value;
            const template_name = document.getElementById('tmplName').value.trim();
            const message = document.getElementById('tmplMessage').value.trim();
            const is_active = document.getElementById('tmplIsActive').checked ? 1 : 0;

            if (!serial_no || !template_name || !message) {
                alert("Please fill all required fields (Serial No, Template Name, and Message).");
                return;
            }

            const payload = {
                id: this.data.currentId,
                serial_no: parseInt(serial_no),
                template_name: template_name,
                message: message,
                is_active: is_active
            };

            try {
                const res = await fetch(`api/sms_templates.php?action=save_template&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    const result = await res.json();
                    if (result.status === 'success') {
                        alert("Template saved successfully!");
                        await this.loadTemplatesList();
                        this.selectTemplate(result.id);
                    } else {
                        alert("Failed to save: " + result.error);
                    }
                }
            } catch (err) {
                console.error("Error saving template:", err);
            }
        },

        deleteTemplate: async function() {
            if (!this.data.currentId) {
                alert("No template selected to delete.");
                return;
            }
            if (!confirm("Are you sure you want to delete this template?")) return;

            try {
                const res = await fetch(`api/sms_templates.php?action=delete_template&id=${this.data.currentId}&company_id=${this.data.company_id}`, {
                    method: 'POST'
                });
                if (res.ok) {
                    alert("Template deleted successfully!");
                    await this.loadTemplatesList();
                    this.resetForm(true);
                }
            } catch (err) {
                console.error("Error deleting template:", err);
            }
        },

        updateCharCounter: function() {
            const msg = document.getElementById('tmplMessage').value;
            const len = msg.length;
            let parts = 0;
            if (len > 0) {
                parts = len <= 160 ? 1 : Math.ceil(len / 153); // Multi-part messages have overhead (153 chars limit per SMS)
            }
            const label = document.getElementById('tmplCharCounter');
            if (label) {
                label.textContent = `${len} characters / ${parts} SMS Part(s)`;
            }
        },

        escapeHTML: function(str) {
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };

    window.SMSTemplatesModule = SMSTemplatesModule;
})();
