(function() {
    const JournalNotesModule = {
        data: {
            company_id: 1,
            notes: [],
            editingNoteId: null
        },

        init: async function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = session.company_id || 1;

            // Set default dates
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const fromDateStr = thirtyDaysAgo.toISOString().split('T')[0];

            document.getElementById('jnNoteDate').value = today;
            document.getElementById('jnFromDate').value = fromDateStr;
            document.getElementById('jnToDate').value = today;

            // Fetch users from API and populate the single dropdown
            const notifySelect = document.getElementById('jnNotifyTarget');
            if (notifySelect) {
                // Clear any dynamic user options, keep only Do Not Send and ALL Users
                notifySelect.innerHTML = `
                    <option value="0">Do Not Send Notification</option>
                    <option value="ALL">All Users</option>
                `;

                try {
                    const res = await fetch(`api/admin.php?action=get_users&company_id=${this.data.company_id}`);
                    if (res.ok) {
                        const usersList = await res.json();
                        if (Array.isArray(usersList)) {
                            usersList.forEach(u => {
                                if (u.username) {
                                    const opt = document.createElement('option');
                                    opt.value = u.username;
                                    opt.textContent = `User: ${u.username}`;
                                    notifySelect.appendChild(opt);
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to load users for notifications:", e);
                }
            }

            // Load Notes for the default 30-day range on initialization
            this.loadNotes();
        },

        saveNote: async function() {
            const date = document.getElementById('jnNoteDate').value;
            const title = document.getElementById('jnTitle').value.trim();
            const content = document.getElementById('jnContent').value.trim();
            
            const notifySelect = document.getElementById('jnNotifyTarget');
            const notifyValue = notifySelect ? notifySelect.value : '0';

            if (!date || !title || !content) {
                alert("Please fill out Note Date, Title, and Content fields.");
                return;
            }

            const payload = {
                note_date: date,
                title: title,
                content: content,
                notify_users: notifyValue
            };
            
            if (this.data.editingNoteId) {
                payload.id = this.data.editingNoteId;
            }

            const btn = document.getElementById('btnSaveNote');
            btn.disabled = true;
            btn.innerHTML = this.data.editingNoteId ? '<i class="fas fa-spinner fa-spin"></i> Updating...' : '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const res = await fetch(`api/journal_notes.php?action=save_note&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await res.json();
                if (res.ok && result.status === 'success') {
                    alert(this.data.editingNoteId ? "Note updated successfully!" : "Note saved successfully!");
                    if (this.data.editingNoteId) {
                        this.cancelEdit();
                    } else {
                        this.clearForm();
                    }
                    this.loadNotes();
                } else {
                    alert("Error: " + (result.error || "Unknown error"));
                }
            } catch (err) {
                console.error("Error saving note:", err);
                alert("Failed to save note.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = this.data.editingNoteId ? '<i class="fas fa-check"></i> Update Note' : '<i class="fas fa-save"></i> Save Note';
            }
        },

        clearForm: function() {
            document.getElementById('jnTitle').value = '';
            document.getElementById('jnContent').value = '';
            
            const notifySelect = document.getElementById('jnNotifyTarget');
            if (notifySelect) notifySelect.value = '0';

            document.getElementById('jnNoteDate').value = new Date().toISOString().split('T')[0];
        },

        loadToday: function() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('jnFromDate').value = today;
            document.getElementById('jnToDate').value = today;
            this.loadNotes();
        },

        loadNotes: async function() {
            const from = document.getElementById('jnFromDate').value;
            const to = document.getElementById('jnToDate').value;

            if (!from || !to) return;

            try {
                const res = await fetch(`api/journal_notes.php?action=get_notes&from_date=${from}&to_date=${to}&company_id=${this.data.company_id}`);
                if (res.ok) {
                    this.data.notes = await res.json();
                    this.renderNotes();
                }
            } catch (err) {
                console.error("Error loading notes:", err);
            }
        },

        renderNotes: function() {
            const container = document.getElementById('jnNotesList');
            const countLabel = document.getElementById('jnNotesCount');
            if (!container) return;
            
            container.innerHTML = '';

            if (countLabel) {
                countLabel.textContent = `Found: ${this.data.notes.length} note(s)`;
            }

            if (this.data.notes.length === 0) {
                container.innerHTML = '<div style="padding: 35px 20px; text-align: center; color: #94a3b8; font-size: 12px;"><i class="fas fa-folder-open" style="font-size: 20px; display:block; margin-bottom: 6px;"></i>No notes found for this date range.</div>';
                return;
            }

            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const isAdmin = session.username === 'Administrator' || session.username === 'Admin' || session.role === 'Admin';

            this.data.notes.forEach(note => {
                const div = document.createElement('div');
                div.className = 'jn-note-item';

                const targetUser = note.notify_users;
                let notifyBadge = '';
                if (targetUser === 'ALL') {
                    notifyBadge = `<span class="jn-badge-all"><i class="fas fa-bell"></i> All Users</span>`;
                } else if (targetUser !== '0' && targetUser !== 0 && targetUser) {
                    notifyBadge = `<span class="jn-badge-user"><i class="fas fa-bell"></i> User: ${this.escapeHTML(targetUser)}</span>`;
                }

                div.innerHTML = `
                    <div class="jn-note-header" onclick="const body = this.nextElementSibling; body.style.display = body.style.display === 'none' ? 'block' : 'none';">
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <strong style="color: #1e293b; font-size: 13px;">${this.escapeHTML(note.title)}</strong>
                            <div style="font-size: 10px; color: #64748b; display: flex; align-items: center; gap: 8px;">
                                <span><i class="far fa-calendar-alt"></i> ${note.note_date}</span>
                                <span><i class="far fa-user"></i> By: ${this.escapeHTML(note.created_by)}</span>
                            </div>
                        </div>
                        <div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px;">
                            ${notifyBadge}
                            ${isAdmin ? `
                                <button onclick="event.stopPropagation(); window.JournalNotesModule.editNote(${note.id})" style="background: none; border: none; color: #1F4E79; cursor: pointer; padding: 2px 5px; font-size: 11px;" title="Edit Note"><i class="fas fa-edit"></i></button>
                                <button onclick="event.stopPropagation(); window.JournalNotesModule.deleteNote(${note.id})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px 5px; font-size: 11px;" title="Delete Note"><i class="fas fa-trash-alt"></i></button>
                            ` : ''}
                            <i class="fas fa-chevron-down" style="color: #94a3b8; font-size: 11px;"></i>
                        </div>
                    </div>
                    <div class="jn-note-body">
                        ${this.escapeHTML(note.content)}
                    </div>
                `;
                container.appendChild(div);
            });
        },

        editNote: function(id) {
            const note = this.data.notes.find(n => n.id == id);
            if (!note) return;
            
            this.data.editingNoteId = id;
            
            document.getElementById('jnNoteDate').value = note.note_date;
            document.getElementById('jnTitle').value = note.title;
            document.getElementById('jnContent').value = note.content;
            
            const notifySelect = document.getElementById('jnNotifyTarget');
            if (notifySelect) notifySelect.value = note.notify_users;
            
            const btn = document.getElementById('btnSaveNote');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Update Note';
                btn.style.background = '#10b981'; // Green background for Update
            }
            
            let cancelBtn = document.getElementById('btnCancelEditNote');
            if (!cancelBtn) {
                cancelBtn = document.createElement('button');
                cancelBtn.id = 'btnCancelEditNote';
                cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
                cancelBtn.style.cssText = 'height: 38px; background: #64748b; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 5px; width: 100%;';
                cancelBtn.onclick = () => this.cancelEdit();
                btn.parentElement.appendChild(cancelBtn);
            }
        },

        cancelEdit: function() {
            this.data.editingNoteId = null;
            this.clearForm();
            const btn = document.getElementById('btnSaveNote');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-save"></i> Save Note';
                btn.style.background = '#1F4E79';
            }
            const cancelBtn = document.getElementById('btnCancelEditNote');
            if (cancelBtn) cancelBtn.remove();
        },

        deleteNote: async function(id) {
            if (!confirm("Are you sure you want to delete this note?")) return;
            
            try {
                const res = await fetch(`api/journal_notes.php?action=delete_note&company_id=${this.data.company_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id })
                });
                
                const result = await res.json();
                if (res.ok && result.status === 'success') {
                    alert("Note deleted successfully!");
                    if (this.data.editingNoteId == id) {
                        this.cancelEdit();
                    }
                    this.loadNotes();
                } else {
                    alert("Error: " + (result.error || "Unknown error"));
                }
            } catch (err) {
                console.error("Error deleting note:", err);
                alert("Failed to delete note.");
            }
        },

        escapeHTML: function(str) {
            if (!str) return '';
            return str.replace(/[&<>'"]/g, 
                tag => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[tag] || tag)
            );
        }
    };

    window.JournalNotesModule = JournalNotesModule;
})();
