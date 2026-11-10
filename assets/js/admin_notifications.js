(function() {
    const AdminNotificationsModule = {
        data: {
            company_id: 1,
            notifications: []
        },

        init: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            this.data.company_id = session.company_id || 1;

            // Set default dates
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const fromDateStr = thirtyDaysAgo.toISOString().split('T')[0];

            document.getElementById('anFromDate').value = fromDateStr;
            document.getElementById('anToDate').value = today;

            // Load Today's Notifications by default
            this.loadToday();
        },

        loadToday: function() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('anFromDate').value = today;
            document.getElementById('anToDate').value = today;
            this.loadNotifications();
        },

        loadNotifications: async function() {
            const from = document.getElementById('anFromDate').value;
            const to = document.getElementById('anToDate').value;

            if (!from || !to) return;

            try {
                const res = await fetch(`api/journal_notes.php?action=get_notifications_archive&from_date=${from}&to_date=${to}&company_id=${this.data.company_id}`);
                if (res.ok) {
                    const allNotes = await res.json();
                    
                    // Filter out dismissed notifications
                    const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
                    const username = session.username || '';
                    const dismissed = JSON.parse(localStorage.getItem('dismissed_notifications_' + username) || '[]');
                    this.data.notifications = allNotes.filter(n => !dismissed.includes(n.id));
                    
                    this.renderNotifications();
                    
                    // Mark as read and clear red dot
                    this.markAsRead();
                }
            } catch (err) {
                console.error("Error loading admin notifications:", err);
            }
        },

        markAsRead: function() {
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const username = session.username || '';
            if (!username) return;

            // Get existing read list
            const read = JSON.parse(localStorage.getItem('read_notifications_' + username) || '[]');
            
            // Add all current notification IDs to read list
            let updated = false;
            this.data.notifications.forEach(n => {
                if (!read.includes(n.id)) {
                    read.push(n.id);
                    updated = true;
                }
            });

            if (updated) {
                localStorage.setItem('read_notifications_' + username, JSON.stringify(read));
            }

            // Hide the red dot on the bell icon
            const dot = document.getElementById('notificationDot');
            if (dot) {
                dot.style.display = 'none';
            }
        },

        deleteNotification: function(id) {
            if (!confirm("Are you sure you want to delete this notification?")) return;
            
            const session = JSON.parse(localStorage.getItem('softifyx_session') || '{}');
            const username = session.username || '';
            if (!username) return;

            // Get dismissed list
            const dismissed = JSON.parse(localStorage.getItem('dismissed_notifications_' + username) || '[]');
            if (!dismissed.includes(id)) {
                dismissed.push(id);
                localStorage.setItem('dismissed_notifications_' + username, JSON.stringify(dismissed));
            }

            // Remove from local list and re-render
            this.data.notifications = this.data.notifications.filter(n => n.id != id);
            this.renderNotifications();

            // Refresh the notifications check to ensure dot is updated
            if (typeof window.checkJournalNotifications === 'function') {
                window.checkJournalNotifications();
            }
        },

        renderNotifications: function() {
            const container = document.getElementById('anNotificationsList');
            const countLabel = document.getElementById('anNotificationsCount');
            if (!container) return;

            container.innerHTML = '';

            if (countLabel) {
                countLabel.textContent = `Found: ${this.data.notifications.length} notification(s)`;
            }

            if (this.data.notifications.length === 0) {
                container.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #94a3b8; font-size: 13px;"><i class="fas fa-folder-open" style="font-size: 24px; display:block; margin-bottom: 8px;"></i>No notifications found for this date range.</div>';
                return;
            }

            this.data.notifications.forEach(note => {
                const div = document.createElement('div');
                div.className = 'an-note-item';

                const targetUser = note.notify_users;
                let notifyBadge = '';
                if (targetUser === 'ALL') {
                    notifyBadge = `<span class="an-badge-all"><i class="fas fa-bullhorn"></i> Broadcast</span>`;
                } else {
                    notifyBadge = `<span class="an-badge-user"><i class="fas fa-lock"></i> Direct Note</span>`;
                }

                div.innerHTML = `
                    <div class="an-note-header" onclick="const body = this.nextElementSibling; body.style.display = body.style.display === 'none' ? 'block' : 'none';">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <strong style="color: #1e293b; font-size: 14px;">${this.escapeHTML(note.title)}</strong>
                            <div style="font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 10px;">
                                <span><i class="far fa-calendar-alt"></i> Date: ${note.note_date}</span>
                                <span><i class="far fa-user"></i> From: ${this.escapeHTML(note.created_by)}</span>
                            </div>
                        </div>
                        <div style="flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
                            ${notifyBadge}
                            <button onclick="event.stopPropagation(); window.AdminNotificationsModule.deleteNotification(${note.id})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px 5px; font-size: 12px;" title="Delete Notification">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                            <i class="fas fa-chevron-down" style="color: #94a3b8; font-size: 12px;"></i>
                        </div>
                    </div>
                    <div class="an-note-body">
                        ${this.escapeHTML(note.content)}
                    </div>
                `;
                container.appendChild(div);
            });
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

    window.AdminNotificationsModule = AdminNotificationsModule;
})();
