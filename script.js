// ==========================================
// DATA MANAGEMENT
// ==========================================

class TimesheetManager {
    constructor() {
        this.employees = []; // Now refers to users with role='employee' + 'admin'
        this.activities = {};
        this.currentDate = new Date();
        this.editingUserId = null;
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

        this.timeSlots = [
            '9:00-10:00', '10:00-11:00', '11:00-11:10', '11:10-12:00',
            '12:00-01:00', '01:00-01:40', '01:40-03:00', '03:00-03:50',
            '03:50-04:00', '04:00-05:00', '05:00-06:00'
        ];

        // Ensure UI updates periodically for time-based styling
        setInterval(() => this.updateTimeSlotStyles(), 60000); // Check every minute
        this.init();
    }

    async init() {
        if (!this.currentUser.id) {
            window.location.href = 'login.html';
            return;
        }

        console.log('TimesheetManager initializing...');
        this.setupEventListeners();
        this.setDateInput();
        this.startHourlyReminder();
        await this.loadData();
        this.handleRoleBasedUI();
        this.renderTimesheet();
        this.handlePreloader();
        this.checkPendingReminders(); // Check for any pending reminders
    }

    handlePreloader() {
        const preloader = document.getElementById('preloader');
        if (!preloader) return;
        const hasLoadedBefore = sessionStorage.getItem('hasLoadedBefore');
        if (hasLoadedBefore) {
            preloader.style.display = 'none';
        } else {
            sessionStorage.setItem('hasLoadedBefore', 'true');
            setTimeout(() => {
                preloader.classList.add('hide');
                setTimeout(() => { preloader.style.display = 'none'; }, 800);
            }, 1000);
        }
    }

    handleRoleBasedUI() {
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const isAdmin = this.currentUser.role === 'admin';

        console.log('Role UI Update via handleRoleBasedUI. Is Admin:', isAdmin);
        // FIXME: Remove this alert after debugging
        // alert(`Debug: Role=${this.currentUser.role}, IsAdmin=${isAdmin}`);

        // Explicitly set display style based on role
        const displayStyle = isAdmin ? 'inline-flex' : 'none';
        const employeeOnlyStyle = isAdmin ? 'none' : 'inline-flex'; // For employee-only elements

        // Hide/Show Admin Buttons
        const addBtn = document.getElementById('addEmployeeBtn');
        if (addBtn) addBtn.style.display = displayStyle;

        // Hide/Show Export (Employees shouldn't see it per requirement)
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.style.display = displayStyle;

        // Hide/Show Admin Panel Link
        const adminLink = document.getElementById('adminPanelLink');
        if (adminLink) adminLink.style.display = displayStyle;

        // Hide/Show Check Missing Button (Admin Only)
        const checkMissingBtn = document.getElementById('checkMissingBtn');
        if (checkMissingBtn) checkMissingBtn.style.display = displayStyle;

        // Hide/Show Analytics/Audit Buttons (Dedicate Toolbar)
        const adminQuickActions = document.getElementById('adminQuickActions');
        if (adminQuickActions) adminQuickActions.style.display = isAdmin ? 'flex' : 'none';

        // Hide obsolete controls in case they interfere
        const oldControls = document.getElementById('adminAnalyticsControls');
        if (oldControls) oldControls.style.display = 'none';

        // Show/Hide Embedded Analytics Section
        const analyticsSection = document.getElementById('adminAnalyticsSection');
        if (analyticsSection) {
            analyticsSection.style.display = isAdmin ? 'block' : 'none';
            if (isAdmin) this.loadDashboardAnalytics();
        }

        // Hide/Show Digital Clock (Employee Only - not for admin)
        const digitalClock = document.getElementById('digitalClock');
        if (digitalClock) digitalClock.style.display = employeeOnlyStyle;

        if (!isAdmin) {
            document.body.classList.add('employee-view');
        } else {
            document.body.classList.remove('employee-view');
        }
    }

    async loadDashboardAnalytics() {
        // Prevent redundant loads if recently loaded? Or just always load refresh.
        // Role check is redundant but safe
        if (!this.currentUser || this.currentUser.role !== 'admin') return;

        const date = new Date().toISOString().split('T')[0]; // Today

        try {
            const [sumRes, chartRes] = await Promise.all([
                fetch(`/api/analytics/summary?date=${date}`),
                fetch(`/api/analytics/charts?date=${date}`)
            ]);

            if (sumRes.ok) {
                const summary = await sumRes.json();
                const elEmp = document.getElementById('dashStatEmp');
                const elAct = document.getElementById('dashStatAct');
                const elPages = document.getElementById('dashStatPages');
                if (elEmp) elEmp.textContent = summary.employees;
                if (elAct) elAct.textContent = summary.activities;
                if (elPages) elPages.textContent = summary.totalPages;
            }

            if (chartRes.ok) {
                const data = await chartRes.json();
                this.renderDashboardCharts(data);
            }
        } catch (e) { console.error('Dashboard Error', e); }
    }

    renderDashboardCharts(data) {
        // Destroy old if exists
        if (window.dashCharts) {
            window.dashCharts.forEach(c => c.destroy());
        }
        window.dashCharts = [];

        const ctx1 = document.getElementById('dashProdChart');
        const ctx2 = document.getElementById('dashTypeChart');

        // Safety check if elements exist
        if (!ctx1 || !ctx2) return;

        const baseColor = '#1e3a8a';

        // 1. Bar Chart
        window.dashCharts.push(new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: data.productivity.map(d => d.name),
                datasets: [{
                    label: 'Pages',
                    data: data.productivity.map(d => d.totalPages),
                    backgroundColor: baseColor,
                    borderRadius: 4
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        }));

        // 2. Doughnut Chart
        window.dashCharts.push(new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: data.distribution.map(d => d.type),
                datasets: [{
                    data: data.distribution.map(d => d.count),
                    backgroundColor: ['#1e3a8a', '#d4af37', '#10b981', '#ef4444', '#f59e0b']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        }));
    }

    setDateInput() {
        const dateInput = document.getElementById('dateInput'); // Changed from 'dateSelect' to 'dateInput'
        if (dateInput) {
            dateInput.value = this.getDateKey(this.currentDate);

            // Listener for date change
            dateInput.onchange = (e) => {
                this.currentDate = new Date(e.target.value);
                this.loadData().then(() => this.renderTimesheet());
            };
        }
        const display = document.getElementById('currentDateDisplay');
        if (display) {
            display.textContent = this.currentDate.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }
    }

    getDateKey(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    showStatus(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ef4444' : '#10b981'};
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // API Methods
    async loadData() {
        try {
            // Fetch Users (which acts as employees list)
            // If employee, backend might still return all users, but we filter in UI
            // Admin needs all users.
            const [userRes, actRes] = await Promise.all([
                fetch('/api/users?t=' + Date.now()),
                fetch(`/api/activities?dateKey=${this.getDateKey(this.currentDate)}&t=${Date.now()}`)
            ]);

            if (!userRes.ok || !actRes.ok) throw new Error('Failed to fetch data');

            this.employees = await userRes.json();
            this.activities = await actRes.json(); // Format: { dateKey: { userId: { timeSlot: [act1, act2] } } }

            // Reload Activity Log for this date
            if (window.activityTracker) {
                window.activityTracker.loadLogs(this.getDateKey(this.currentDate));
            }

            // Validate Session - if current user does not exist in DB (e.g. after DB reset), logout
            const userExists = this.employees.some(u => u.id == this.currentUser.id);
            if (!userExists && this.employees.length > 0) {
                console.warn('Current user not found in database. Session invalid.');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html';
                return;
            }

        } catch (e) {
            console.error('Error loading data:', e);
            this.showStatus('Error connecting to server', 'error');
        }
    }

    // ... (rest of Date/User methods same)

    // Activity Methods
    getActivity(userId, timeSlot, date = this.currentDate) {
        const dateKey = this.getDateKey(date);
        // Returns Array or null
        return this.activities[dateKey]?.[userId]?.[timeSlot] || null;
    }

    async setActivity(userId, timeSlot, activityData, date = this.currentDate) {
        const dateKey = this.getDateKey(date);
        const payload = { dateKey, userId, timeSlot, ...activityData };

        console.log('Saving activity:', payload); // Debug log

        try {
            const res = await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (!this.activities[dateKey]) this.activities[dateKey] = {};
                if (!this.activities[dateKey][userId]) this.activities[dateKey][userId] = {};
                if (!this.activities[dateKey][userId][timeSlot]) this.activities[dateKey][userId][timeSlot] = [];

                // For now, simple push. Optimally we'd replace if editing.
                // Since user requested "doing two different things", we allow adding.
                // Editing existing logic requires identifying WHICH activity in slot.
                // For now, let's assume always ADD new for this step, or simple append.
                // User asked: "what if employee doing two different in single timeslot"
                this.activities[dateKey][userId][timeSlot].push(activityData);

                if (window.activityTracker) {
                    const employee = this.employees.find(emp => emp.id == userId);
                    if (employee) {
                        // Include Date in log slot display
                        const logSlot = `${dateKey} | ${timeSlot}`; // e.g. "2025-12-11 | 9:00-10:00"
                        // Pass explicit dateKey as 6th argument
                        window.activityTracker.addActivity(employee.username, activityData.type, activityData.description, logSlot, 'updated', dateKey);
                    }
                }
                this.renderTimesheet();
                this.showStatus('Activity saved successfully!');
                console.log('Activity saved successfully');
            } else {
                const errorData = await res.json();
                console.error('Failed to save activity:', errorData);
                this.showStatus('Failed to save activity: ' + (errorData.error || 'Unknown error'), 'error');
            }
        } catch (err) {
            console.error('Error saving activity:', err);
            this.showStatus('Error saving activity: ' + err.message, 'error');
        }
    }


    // ... (skip clearActivity update for brevity, assume clear wipes slot)

    // ...

    renderTimesheet() {
        const tbody = document.getElementById('timesheetBody');
        tbody.innerHTML = '';

        const isAdmin = this.currentUser.role === 'admin';

        // For employees, render vertical view
        if (!isAdmin) {
            this.renderEmployeeVerticalView();
            return;
        }

        // Filter: Admin sees all employees
        const usersToShow = this.employees.filter(u => u.role !== 'admin');

        if (usersToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="100%">No users found.</td></tr>';
            return;
        }

        // Sort by name
        usersToShow.sort((a, b) => a.name.localeCompare(b.name));

        // Pre-process Auto-fills (Lunch & Sunday) for Admin Table View
        const dateKey = this.getDateKey(this.currentDate);
        const lunchSlot = '01:00-01:40';
        const currentDay = this.currentDate.getDay();

        usersToShow.forEach(user => {
            if (!this.activities[dateKey]) this.activities[dateKey] = {};
            if (!this.activities[dateKey][user.id]) this.activities[dateKey][user.id] = {};

            // Lunch check
            if (currentDay !== 0 && !this.activities[dateKey][user.id][lunchSlot]) {
                this.activities[dateKey][user.id][lunchSlot] = [{
                    type: 'lunch-break', description: 'Lunch Break', pagesDone: '0', timestamp: new Date().toISOString()
                }];
                const lunchKey = `lunch_saved_${dateKey}_${user.id}`;
                if (!sessionStorage.getItem(lunchKey)) {
                    this.saveDefaultLunch(user.id, dateKey, lunchSlot);
                    sessionStorage.setItem(lunchKey, 'true');
                }
            }

            // Sunday check
            if (currentDay === 0) {
                const sundayKey = `sunday_saved_${dateKey}_${user.id}`;
                if (!sessionStorage.getItem(sundayKey)) {
                    this.timeSlots.forEach(slot => {
                        if (!this.activities[dateKey][user.id][slot]) {
                            this.activities[dateKey][user.id][slot] = [{
                                type: 'sunday-holiday', description: 'Sunday Holiday', pagesDone: '0', timestamp: new Date().toISOString()
                            }];
                            this.saveSundayHoliday(user.id, dateKey, slot);
                        }
                    });
                    sessionStorage.setItem(sundayKey, 'true');
                }
            }
        });

        usersToShow.forEach(user => {
            const row = document.createElement('tr');

            // Name Column
            const nameTd = document.createElement('td');
            nameTd.className = 'sticky-col';
            nameTd.textContent = user.name;
            if (isAdmin || user.id == this.currentUser.id) {
                nameTd.style.cursor = 'pointer';
                nameTd.onclick = () => this.openEmployeeActionModal(user.id, user.name);
            }
            row.appendChild(nameTd);

            // Activity Counters (Proof, Epub, etc)
            // Calculate totals
            let proof = 0, epub = 0, calibr = 0;
            const slots = this.activities[this.getDateKey(this.currentDate)]?.[user.id] || {};

            // Check full day leave (simplified check on first slot)
            const firstSlotActs = slots[this.timeSlots[0]]; // Array now
            const isLeave = (firstSlotActs && firstSlotActs.length > 0 && firstSlotActs[0].type === 'leave' && firstSlotActs[0].description === 'FULL_DAY_LEAVE');

            if (!isLeave) {
                // Iterate all slots
                Object.values(slots).forEach(actList => { // actList is Array
                    if (Array.isArray(actList)) {
                        actList.forEach(act => {
                            const p = parseInt(act.pagesDone) || 0;
                            if (act.type === 'proof') proof += p;
                            if (act.type === 'epub') epub += p;
                            if (act.type === 'calibr') calibr += p;
                        });
                    }
                });
            }

            // Stats Cols
            [proof, epub, calibr].forEach((val, idx) => {
                const td = document.createElement('td');
                td.className = `sub-col ${['proof', 'epub', 'calibr'][idx]}-col`;
                td.textContent = val || '-';
                if (val) td.style.fontWeight = 'bold';
                row.appendChild(td);
            });

            // Time Slots
            if (isLeave) {
                const td = document.createElement('td');
                td.colSpan = this.timeSlots.length;
                td.className = 'full-day-leave-cell';
                td.textContent = 'ON LEAVE';
                row.appendChild(td);
            } else {
                this.timeSlots.forEach(slot => {
                    const td = document.createElement('td');
                    td.appendChild(this.createActivityCell(user.id, slot));
                    row.appendChild(td);
                });
            }

            // Actions (Admin Only)
            if (isAdmin) {
                const actionTd = document.createElement('td');
                actionTd.innerHTML = `
                    <button class="icon-btn edit-btn" title="Edit User">✎</button>
                    <button class="icon-btn del-btn" title="Delete User">🗑</button>
                `;
                actionTd.querySelector('.edit-btn').onclick = () => this.openEmployeeModal(user.id);
                actionTd.querySelector('.del-btn').onclick = () => this.deleteEmployee(user.id);
                row.appendChild(actionTd);
            }

            tbody.appendChild(row);
        });
    }

    isTimeSlotPast(slot) {
        const now = new Date();
        const [, endTime] = slot.split('-');
        const endHour = parseInt(endTime.split(':')[0]);
        return now.getHours() >= endHour;
    }

    isCurrentTimeSlot(slot) {
        const now = new Date();
        const currentHour = now.getHours();
        const [startTime, endTime] = slot.split('-');
        const startHour = parseInt(startTime.split(':')[0]);
        const endHour = parseInt(endTime.split(':')[0]);
        return currentHour >= startHour && currentHour < endHour;
    }

    async saveDefaultLunch(userId, dateKey, timeSlot) {
        try {
            await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateKey,
                    userId,
                    timeSlot,
                    type: 'lunch-break',
                    description: 'Lunch Break',
                    startPage: 0,
                    endPage: 0
                })
            });
        } catch (e) {
            console.error('Error saving default lunch:', e);
        }
    }

    async saveSundayHoliday(userId, dateKey, timeSlot) {
        try {
            await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateKey,
                    userId,
                    timeSlot,
                    type: 'sunday-holiday',
                    description: 'Sunday Holiday',
                    startPage: 0,
                    endPage: 0
                })
            });
        } catch (e) {
            console.error('Error saving Sunday holiday:', e);
        }
    }

    renderEmployeeVerticalView() {
        const container = document.getElementById('employeeVerticalTimesheet');
        if (!container) return;

        const user = this.employees.find(u => u.id == this.currentUser.id);
        if (!user) {
            container.innerHTML = '<p style="text-align:center; padding:2rem;">User not found</p>';
            return;
        }

        const dateKey = this.getDateKey(this.currentDate);
        const slots = this.activities[dateKey]?.[user.id] || {};

        // Auto-fill lunch for 01:00-01:40 if not already filled (skip on Sundays)
        const currentDay = this.currentDate.getDay();
        const lunchSlot = '01:00-01:40';

        if (currentDay !== 0 && !slots[lunchSlot]) { // Skip lunch on Sunday (day 0)
            // Check if we've already saved lunch for this user today
            const lunchKey = `lunch_saved_${dateKey}_${user.id}`;
            const alreadySaved = sessionStorage.getItem(lunchKey);

            // Initialize activities structure if needed
            if (!this.activities[dateKey]) this.activities[dateKey] = {};
            if (!this.activities[dateKey][user.id]) this.activities[dateKey][user.id] = {};

            // Add default lunch activity (no type, just description)
            this.activities[dateKey][user.id][lunchSlot] = [{
                type: 'lunch-break',  // Special type for lunch
                description: 'Lunch Break',
                pagesDone: '0',
                timestamp: new Date().toISOString()
            }];

            // Save to backend only once
            if (!alreadySaved) {
                this.saveDefaultLunch(user.id, dateKey, lunchSlot);
                sessionStorage.setItem(lunchKey, 'true');
            }
        }

        // Auto-fill Sunday as Holiday for all slots
        if (currentDay === 0) { // Sunday
            const sundayKey = `sunday_saved_${dateKey}_${user.id}`;
            const sundayAlreadySaved = sessionStorage.getItem(sundayKey);

            if (!sundayAlreadySaved) {
                // Initialize if needed
                if (!this.activities[dateKey]) this.activities[dateKey] = {};
                if (!this.activities[dateKey][user.id]) this.activities[dateKey][user.id] = {};

                // Mark all time slots as Sunday Holiday
                this.timeSlots.forEach(slot => {
                    if (!this.activities[dateKey][user.id][slot]) {
                        this.activities[dateKey][user.id][slot] = [{
                            type: 'sunday-holiday',
                            description: 'Sunday Holiday',
                            pagesDone: '0',
                            timestamp: new Date().toISOString()
                        }];

                        // Save to backend
                        this.saveSundayHoliday(user.id, dateKey, slot);
                    }
                });

                sessionStorage.setItem(sundayKey, 'true');
            }
        }

        // Calculate totals
        let proof = 0, epub = 0, calibr = 0;
        Object.values(slots).forEach(actList => {
            if (Array.isArray(actList)) {
                actList.forEach(act => {
                    const p = parseInt(act.pagesDone) || 0;
                    if (act.type === 'proof') proof += p;
                    if (act.type === 'epub') epub += p;
                    if (act.type === 'calibr') calibr += p;
                });
            }
        });

        // Build vertical layout HTML
        let html = `
            <div class="employee-header">
                <div class="employee-name" style="display: flex; align-items: center; justify-content: center; gap: 8px;" data-userid="${user.id}" data-username="${user.name}">
                    <span style="cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); font-size: 1.1rem; padding: 4px 8px; border-radius: 6px; position: relative; text-align: center;">${user.name}</span>
                </div>
                <div class="employee-stats">
                    <div class="stat-item">
                        <div class="stat-label">Proof</div>
                        <div class="stat-value">${proof || '-'}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Epub</div>
                        <div class="stat-value">${epub || '-'}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Calibr</div>
                        <div class="stat-value">${calibr || '-'}</div>
                    </div>
                </div>
            </div>
            <div class="timeslot-list">
        `;

        // Render each time slot as a row
        this.timeSlots.forEach(slot => {
            const acts = this.getActivity(user.id, slot);
            const isPast = this.isTimeSlotPast(slot);
            const isCurrent = this.isCurrentTimeSlot(slot);
            const hasActivity = acts && acts.length > 0;

            html += `
                <div class="timeslot-row ${isPast && !hasActivity ? 'past-slot' : ''} ${isCurrent ? 'current-slot' : ''}" data-slot="${slot}" data-userid="${user.id}">
                    <div class="timeslot-time">${slot}</div>
                    <div class="timeslot-activity ${hasActivity ? '' : 'empty'} ${isPast ? 'past-slot' : ''}">
            `;

            if (hasActivity) {
                html += '<div class="activity-content">';
                acts.forEach(act => {
                    html += `<div class="activity-item">`;

                    // Special handling for lunch-break - only show description
                    if (act.type === 'lunch-break') {
                        html += `<span class="activity-desc" style="background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); padding: 8px 16px; border-radius: 8px; border: 2px solid #f97316; color: #9a3412; font-weight: 700; font-size: 1rem;">${act.description}</span>`;
                    } else if (act.type === 'sunday-holiday') {
                        // Special handling for Sunday Holiday - only show description
                        html += `<span class="activity-desc" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 8px 16px; border-radius: 8px; border: 2px solid #10b981; color: #065f46; font-weight: 700; font-size: 1rem;">${act.description}</span>`;
                    } else {
                        // Normal activities - show badge and description
                        html += `<span class="activity-badge ${act.type}">${act.type}</span>`;
                        if (act.description) {
                            html += `<span class="activity-desc">${act.description}</span>`;
                        }
                    }

                    html += `</div>`;
                });
                html += '</div>';
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Add click handler for employee name
        const employeeName = container.querySelector('.employee-name');
        if (employeeName) {
            const nameSpan = employeeName.querySelector('span');

            // Click handler on span only
            if (nameSpan) {
                nameSpan.addEventListener('click', () => {
                    const userId = parseInt(employeeName.dataset.userid);
                    const userName = employeeName.dataset.username;
                    this.openEmployeeActionModal(userId, userName);
                });

                // Premium hover effects - Red & Bold with Sparkle
                nameSpan.addEventListener('mouseenter', () => {
                    // Red color with bold
                    nameSpan.style.color = '#ef4444';
                    nameSpan.style.fontWeight = '700';
                    nameSpan.style.letterSpacing = '0.5px';
                    nameSpan.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)';
                    nameSpan.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.2)';
                    nameSpan.style.transform = 'translateX(2px)';

                    // Add sparkle symbol after text
                    nameSpan.setAttribute('data-hover', 'true');
                    nameSpan.innerHTML = nameSpan.textContent + ' <span style="display: inline-block; margin-left: 6px; animation: sparkle 0.6s ease-in-out infinite alternate;">✨</span>';
                });

                nameSpan.addEventListener('mouseleave', () => {
                    // Reset styles
                    nameSpan.style.color = '';
                    nameSpan.style.fontWeight = '';
                    nameSpan.style.letterSpacing = '';
                    nameSpan.style.background = '';
                    nameSpan.style.boxShadow = '';
                    nameSpan.style.transform = '';

                    // Remove sparkle
                    if (nameSpan.getAttribute('data-hover')) {
                        nameSpan.innerHTML = nameSpan.textContent.replace(' ✨', '');
                        nameSpan.removeAttribute('data-hover');
                    }
                });
            }
        }

        // Add sparkle animation to document if not already added
        if (!document.getElementById('sparkle-animation')) {
            const style = document.createElement('style');
            style.id = 'sparkle-animation';
            style.textContent = `
                @keyframes sparkle {
                    0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
                    100% { transform: scale(1.2) rotate(20deg); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // Add click handlers for each timeslot
        container.querySelectorAll('.timeslot-row').forEach(row => {
            row.addEventListener('click', () => {
                const slot = row.dataset.slot;
                const userId = parseInt(row.dataset.userid);
                this.openActivityModal(userId, slot);
            });
        });
    }

    createActivityCell(userId, timeSlot) {
        const acts = this.getActivity(userId, timeSlot); // returns Array or null
        const div = document.createElement('div');
        div.className = 'activity-cell';

        // Enforce centered and clean style (User Request)
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.border = 'none';
        div.style.background = 'transparent';
        div.style.boxShadow = 'none';

        // Only employees can add/edit activities (not admins)
        const isAdmin = this.currentUser.role === 'admin';
        if (!isAdmin) {
            div.onclick = () => {
                console.log('Activity cell clicked:', { userId, timeSlot, currentUserId: this.currentUser.id, role: this.currentUser.role });
                this.openActivityModal(userId, timeSlot);
            };
            div.style.cursor = 'pointer';
        } else {
            div.style.cursor = 'default';
            div.title = 'Admins cannot add activities. Only employees can.';
        }

        if (acts && acts.length > 0) {
            div.classList.add('has-activity');

            // Show ALL activities stacked
            let html = '';
            acts.forEach(act => {
                // Special handling for predefined types to match Employee View aesthetics
                if (act.type === 'sunday-holiday') {
                    html += `<div class="activity-item" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">`;
                    html += `<span style="background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); padding: 6px 12px; border-radius: 6px; border: 1px solid #94a3b8; color: #475569; font-weight: 600; font-size: 0.8em; white-space: nowrap;">${act.description}</span>`;
                    html += `</div>`;
                } else if (act.type === 'lunch-break') {
                    html += `<div class="activity-item" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">`;
                    html += `<span style="background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); padding: 6px 12px; border-radius: 6px; border: 1px solid #f97316; color: #9a3412; font-weight: 600; font-size: 0.8em; white-space: nowrap;">${act.description}</span>`;
                    html += `</div>`;
                } else {
                    // Standard Activity Rendering - Clean Style (No Box)
                    html += `<div class="activity-item type-${act.type}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin-bottom: 6px; height: 100%; width: 100%;">`;
                    html += `<span class="badge" style="font-size: 0.75em; margin-bottom: 2px; display: inline-block;">${act.type}</span>`;
                    if (act.description) {
                        html += `<div class="desc" style="font-size: 0.85em; width: 100%; word-break: break-word; line-height: 1.3;">${act.description}</div>`;
                    }
                    html += `</div>`;
                }
            });
            div.innerHTML = html;
        } else {
            div.classList.add('empty');
            div.innerHTML = '<span>+</span>';
        }
        // Check if slot is past
        if (this.isTimeSlotPast(timeSlot)) {
            div.classList.add('past-slot');
        }

        return div;
    }

    isTimeSlotPast(timeSlot) {
        // Parse time slot "9:00-10:00" etc.
        // We assume the slot string format is known and stable.
        const [startStr, endStr] = timeSlot.split('-'); // e.g., ["9:00", "10:00"]
        if (!endStr) return false;

        const now = new Date();
        const endTime = this.parseTimeStr(endStr.trim());

        return now > endTime;
    }

    parseTimeStr(timeStr) {
        // Converts "10:00", "01:00" etc to a Date object for today.
        // Logic: 9, 10, 11 -> AM. 12 -> PM (noon). 1, 2, 3.. 8 -> PM.
        const [hourStr, minuteStr] = timeStr.split(':');
        let hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);

        // Adjust for AM/PM logic specific to this shift (9AM to 8PM)
        // If hour is between 9 and 11, it's AM (keep as is).
        // If hour is 12, it's 12 PM (keep as is).
        // If hour is 1 to 8 (inclusive), it's PM (add 12).
        if (hour >= 1 && hour <= 8) {
            hour += 12;
        }
        // Note: The logic handles 12 correctly (12 PM is 12, 12 AM would be 0).

        const date = new Date();
        date.setHours(hour, minute, 0, 0);
        return date;
    }

    updateTimeSlotStyles() {
        // Re-apply styles to all activity cells based on current time
        // This avoids full re-render
        document.querySelectorAll('.activity-cell').forEach(cell => {
            // We need to know which slot it belongs to. 
            // Since we don't store it on the element, we might need to re-render or add data attribute.
            // Let's modify creation to add data-slot.
        });
        // Actually, easiest is to just re-render if it's not expensive, OR add data attribute.
        // Let's add data-slot in createActivityCell and use it here.
        // Re-implementing createActivityCell to add data attribute first.
        // Wait, I can't easily modify createActivityCell in this block without being messy.
        // Let's just re-render the timesheet table. It's safe.
        this.renderTimesheet();
    }

    // ==========================================
    // MODAL & CRUD API METHODS (Restored)
    // ==========================================

    openEmployeeModal(userId = null) {
        const modal = document.getElementById('employeeModal');
        const title = document.getElementById('employeeModalTitle');
        const form = document.getElementById('employeeForm');

        form.reset();
        this.editingUserId = userId;

        if (userId) {
            title.textContent = 'Edit Employee';
            const user = this.employees.find(u => u.id == userId);
            if (user) {
                document.getElementById('employeeName').value = user.name;
                document.getElementById('employeeUsername').value = user.username;
                // password placeholder
            }
        } else {
            title.textContent = 'Add New Employee';
        }

        // Use global openModal if available, else legacy class
        if (window.openModal) window.openModal('employeeModal');
        else modal.classList.add('show');
    }

    closeEmployeeModal() {
        if (window.closeAllModals) window.closeAllModals();
        else document.getElementById('employeeModal')?.classList.remove('show');
        this.editingUserId = null;
    }

    async addEmployee(name, username, password, role) {
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, username, password, role })
            });
            if (res.ok) {
                this.showStatus('Employee added');
                await this.loadData();
                this.renderTimesheet();
            } else {
                const data = await res.json();
                this.showStatus(data.error || 'Failed to add', 'error');
            }
        } catch (e) {
            this.showStatus('Error adding employee', 'error');
        }
    }

    async updateEmployee(id, name, username, password, role) {
        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, username, password, role })
            });
            if (res.ok) {
                this.showStatus('Employee updated');
                await this.loadData();
                this.renderTimesheet();
            } else {
                this.showStatus('Failed to update', 'error');
            }
        } catch (e) {
            this.showStatus('Error updating employee', 'error');
        }
    }

    async deleteEmployee(id) {
        if (!confirm('Are you sure? This will delete all history for this user.')) return;
        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
            if (res.ok) {
                this.showStatus('Employee deleted');
                await this.loadData();
                this.renderTimesheet();
            } else {
                this.showStatus('Failed to delete', 'error');
            }
        } catch (e) {
            this.showStatus('Error deleting employee', 'error');
        }
    }

    async saveDefaultLunch(userId, dateKey, slot) {
        try {
            await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    dateKey,
                    timeSlot: slot,
                    type: 'lunch-break',
                    description: 'Lunch Break',
                    totalPages: 0,
                    pagesDone: 0,
                    timestamp: new Date().toISOString()
                })
            });
            // Log to Activity Tracker
            const userName = this.users.find(u => u.id == userId)?.name || 'Unknown';
            window.activityTracker?.addActivity(
                userName,
                'lunch-break',
                'Lunch Break Auto-marked',
                `${dateKey} | ${slot}`,
                'CREATE',
                dateKey
            );
        } catch (e) { console.error('Error saving lunch:', e); }
    }

    async saveSundayHoliday(userId, dateKey, slot) {
        try {
            await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    dateKey,
                    timeSlot: slot,
                    type: 'sunday-holiday',
                    description: 'Sunday Holiday',
                    totalPages: 0,
                    pagesDone: 0,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (e) { console.error('Error saving sunday:', e); }
    }

    openActivityModal(userId, timeSlot) {
        console.log('openActivityModal called:', { userId, timeSlot });

        // Permission check: Employees can only edit their own activities
        const isAdmin = this.currentUser.role === 'admin';
        if (!isAdmin && userId != this.currentUser.id) {
            alert('You can only edit your own activities.');
            return;
        }

        this.editingActivityKey = { userId, timeSlot };
        console.log('editingActivityKey set:', this.editingActivityKey);

        const modal = document.getElementById('activityModal');

        // Reset form FIRST (before setting values)
        document.getElementById('activityForm').reset();

        // THEN populate values (so they don't get cleared by reset)
        document.getElementById('activityTimeSlotDisplay').textContent = timeSlot;
        document.getElementById('activityEmployeeId').value = userId;
        document.getElementById('activityTimeSlot').value = timeSlot;

        // Load existing if any
        const acts = this.getActivity(userId, timeSlot);
        const hasActivity = acts && acts.length > 0;
        console.log('Has activity:', hasActivity, acts);

        // Show/hide Delete button based on whether activity exists
        const deleteBtn = document.getElementById('deleteActivityBtn');
        if (deleteBtn) {
            deleteBtn.style.display = hasActivity ? 'inline-block' : 'none';
        }

        if (hasActivity) {
            const last = acts[acts.length - 1]; // Load last logic for now
            document.getElementById('activityType').value = last.type;
            document.getElementById('activityDescription').value = last.description.split(' (Pages:')[0];
            // Pages logic parse back if needed, optional
        }

        if (window.openModal) window.openModal('activityModal');
        else modal.classList.add('show');

        console.log('Modal opened');
    }

    closeActivityModal() {
        if (window.closeAllModals) window.closeAllModals();
        else document.getElementById('activityModal')?.classList.remove('show');
    }

    async handleClearActivity() {
        console.log('=== handleClearActivity START ===');

        // Get values from form
        let userId = document.getElementById('activityEmployeeId')?.value;
        let timeSlot = document.getElementById('activityTimeSlot')?.value;

        console.log('Form values:', { userId, timeSlot });
        console.log('editingActivityKey:', this.editingActivityKey);
        console.log('currentUser:', this.currentUser);

        // Fallback to editingActivityKey if form values are empty
        if ((!userId || !timeSlot) && this.editingActivityKey) {
            console.log('Using editingActivityKey fallback');
            userId = this.editingActivityKey.userId;
            timeSlot = this.editingActivityKey.timeSlot;
        }

        // Last resort: use current user if we're an employee
        if (!userId && this.currentUser && this.currentUser.role !== 'admin') {
            console.log('Using currentUser fallback');
            userId = this.currentUser.id;
        }

        console.log('Final values:', { userId, timeSlot });

        if (!userId || !timeSlot) {
            console.error('Missing data - cannot clear');
            alert('Error: Unable to determine which activity to clear. Please close this modal and try again.');
            return;
        }

        // Check if activity exists
        const dateKey = this.getDateKey(this.currentDate);
        const hasActivity = this.activities[dateKey]?.[userId]?.[timeSlot];
        console.log('Activity exists?', hasActivity);

        if (!hasActivity) {
            alert('No activity found for this time slot.');
            return;
        }

        // Use custom confirmation modal instead of browser confirm
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const title = document.getElementById('confirmModalTitle');
            const message = document.getElementById('confirmModalMessage');
            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');

            // Set modal content
            title.textContent = 'Clear Activity?';
            message.textContent = `Are you sure you want to clear all activities for ${timeSlot}? This action cannot be undone.`;
            okBtn.textContent = 'Clear';
            okBtn.className = 'btn';
            okBtn.style.cssText = 'min-width: 100px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;';

            // Show modal
            modal.classList.add('show');
            console.log('Confirmation modal shown');

            // Handle OK click
            const handleOk = async () => {
                console.log('User confirmed clear');
                modal.classList.remove('show');
                okBtn.removeEventListener('click', handleOk);
                cancelBtn.removeEventListener('click', handleCancel);

                try {
                    console.log('Sending DELETE request:', { dateKey, userId, timeSlot });

                    const res = await fetch('/api/activities', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dateKey, userId: parseInt(userId), timeSlot })
                    });

                    console.log('DELETE response status:', res.status);

                    if (res.ok) {
                        const result = await res.json();
                        console.log('DELETE success:', result);

                        // Remove locally
                        if (this.activities[dateKey]?.[userId]?.[timeSlot]) {
                            delete this.activities[dateKey][userId][timeSlot];
                            console.log('Removed from local cache');
                        }

                        this.closeActivityModal();
                        this.renderTimesheet();
                        this.showStatus('Activity cleared successfully');
                        resolve(true);
                    } else {
                        const errData = await res.json();
                        console.error('Delete failed:', errData);
                        alert('Failed to clear activity: ' + (errData.error || 'Unknown error'));
                        resolve(false);
                    }
                } catch (e) {
                    console.error('Clear activity error:', e);
                    alert('Error clearing activity: ' + e.message);
                    resolve(false);
                }
            };

            // Handle Cancel click
            const handleCancel = () => {
                console.log('User cancelled clear');
                modal.classList.remove('show');
                okBtn.removeEventListener('click', handleOk);
                cancelBtn.removeEventListener('click', handleCancel);
                resolve(false);
            };

            okBtn.addEventListener('click', handleOk);
            cancelBtn.addEventListener('click', handleCancel);
        });
    }

    async clearActivity(userId, timeSlot) {
        const dateKey = this.getDateKey(this.currentDate);
        try {
            const res = await fetch('/api/activities', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dateKey, userId, timeSlot })
            });
            if (res.ok) {
                // Remove locally
                if (this.activities[dateKey]?.[userId]?.[timeSlot]) {
                    delete this.activities[dateKey][userId][timeSlot];
                }
                this.closeActivityModal();
                this.renderTimesheet();
                this.showStatus('Activity deleted successfully');
            } else {
                this.showStatus('Failed to delete activity', 'error');
            }
        } catch (e) {
            this.showStatus('Error deleting activity', 'error');
        }
    }

    openEmployeeActionModal(userId, name) {
        document.getElementById('actionEmployeeName').textContent = name;
        this.actionUserId = userId; // Store for action
        if (window.openModal) window.openModal('employeeActionModal');
    }

    closeEmployeeActionModal() {
        if (window.closeAllModals) window.closeAllModals();
        this.actionUserId = null;
    }

    showTimeSelectionForm(type) {
        this.currentActionType = type;
        const optionsDiv = document.getElementById('actionButtons');
        if (optionsDiv) optionsDiv.style.display = 'none';

        const formDiv = document.getElementById('timeSelectionForm');
        formDiv.style.display = 'block';

        // Update title based on type
        const titleText = type === 'leave' ? 'Mark Leave' : type === 'permission' ? 'Mark Permission' : 'Add Holiday';
        document.getElementById('timeSelectionTitle').textContent = titleText;

        // Populate slots
        const startSelect = document.getElementById('startSlot');
        const endSelect = document.getElementById('endSlot');

        if (startSelect && startSelect.options.length === 0) {
            this.timeSlots.forEach(slot => {
                startSelect.add(new Option(slot, slot));
                endSelect.add(new Option(slot, slot));
            });
        }

        // Reset check and selects
        const check = document.getElementById('fullDayCheck');
        if (check) check.checked = false;
        if (startSelect) startSelect.disabled = false;
        if (endSelect) endSelect.disabled = false;
    }

    hideTimeSelectionForm() {
        // Use ID 'actionButtons' which is consistent with HTML
        const optionsDiv = document.getElementById('actionButtons');
        if (optionsDiv) optionsDiv.style.display = 'flex';
        document.getElementById('timeSelectionForm').style.display = 'none';
    }

    async handleLeavePermissionSubmit() {
        const fullDayCheck = document.getElementById('fullDayCheck');
        const isFullDay = fullDayCheck ? fullDayCheck.checked : false;

        const start = document.getElementById('startSlot').value;
        const end = document.getElementById('endSlot').value;
        const reason = document.getElementById('permissionReason').value || 'No Reason';
        const dateKey = this.getDateKey(this.currentDate);

        // Validate
        if (!isFullDay && (!start || !end)) {
            this.showStatus('Please select time range', 'error');
            return;
        }

        try {
            if (this.currentActionType === 'leave') {
                const res = await fetch('/api/leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: this.actionUserId,
                        startDate: dateKey,
                        endDate: dateKey,
                        reason: isFullDay ? `Full Day: ${reason}` : `${reason} (${start} - ${end})`,
                        isFullDay
                    })
                });

                if (res.ok) {
                    this.showStatus('Leave request submitted properly');

                    if (isFullDay) {
                        for (const slot of this.timeSlots) {
                            await this.setActivity(this.actionUserId, slot, {
                                type: 'leave',
                                description: `FULL_DAY_LEAVE: ${reason}`,
                                pagesDone: '0',
                                timestamp: new Date().toISOString()
                            });
                        }
                    } else {
                        const sIdx = this.timeSlots.indexOf(start);
                        const eIdx = this.timeSlots.indexOf(end);

                        if (sIdx > -1 && eIdx > -1) {
                            const rangeSlots = this.timeSlots.slice(Math.min(sIdx, eIdx), Math.max(sIdx, eIdx) + 1);
                            for (const slot of rangeSlots) {
                                await this.setActivity(this.actionUserId, slot, {
                                    type: 'leave',
                                    description: `Partial Leave: ${reason}`,
                                    pagesDone: '0',
                                    timestamp: new Date().toISOString()
                                });
                            }
                        }
                    }
                }
            } else if (this.currentActionType === 'permission') {
                const res = await fetch('/api/permission', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: this.actionUserId,
                        dateKey,
                        startTime: start,
                        endTime: end,
                        reason
                    })
                });

                if (res.ok) {
                    this.showStatus('Permission logged');
                    // Mark slots for permission visually
                    const sIdx = this.timeSlots.indexOf(start);
                    const eIdx = this.timeSlots.indexOf(end);
                    if (sIdx > -1 && eIdx > -1) {
                        const rangeSlots = this.timeSlots.slice(Math.min(sIdx, eIdx), Math.max(sIdx, eIdx) + 1);
                        for (const slot of rangeSlots) {
                            await this.setActivity(this.actionUserId, slot, {
                                type: 'permission',
                                description: `Permission: ${reason}`,
                                pagesDone: '0',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            } else if (this.currentActionType === 'holiday') {
                // Handle holiday marking
                this.showStatus('Holiday marked');

                if (isFullDay) {
                    // Mark all slots as holiday
                    for (const slot of this.timeSlots) {
                        await this.setActivity(this.actionUserId, slot, {
                            type: 'Holiday',
                            description: 'Full Day Holiday',
                            pagesDone: '0',
                            timestamp: new Date().toISOString()
                        });
                    }
                } else {
                    // Mark partial day holiday
                    const sIdx = this.timeSlots.indexOf(start);
                    const eIdx = this.timeSlots.indexOf(end);

                    if (sIdx > -1 && eIdx > -1) {
                        const rangeSlots = this.timeSlots.slice(Math.min(sIdx, eIdx), Math.max(sIdx, eIdx) + 1);
                        for (const slot of rangeSlots) {
                            await this.setActivity(this.actionUserId, slot, {
                                type: 'Holiday',
                                description: `Partial Holiday (${start} - ${end})`,
                                pagesDone: '0',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            }
            this.closeEmployeeActionModal();
            this.renderTimesheet();
        } catch (e) {
            console.error(e);
            this.showStatus('Error submitting request', 'error');
        }
    }



    // Handler Wrappers
    async handleEmployeeSubmit(e) {
        e.preventDefault();
        const name = document.getElementById('employeeName').value;
        const user = document.getElementById('employeeUsername').value;
        const pass = document.getElementById('employeePassword').value;

        if (this.editingUserId) {
            await this.updateEmployee(this.editingUserId, name, user, pass, 'employee');
        } else {
            await this.addEmployee(name, user, pass, 'employee');
        }
        this.closeEmployeeModal();
    }

    async handleActivitySubmit(e, keepOpen = false) {
        e.preventDefault();

        // Prevent double submission
        const submitBtn = document.querySelector('button[type="submit"]');
        const addAnotherBtn = document.getElementById('addAnotherBtn');
        if (submitBtn) submitBtn.disabled = true;
        if (addAnotherBtn) addAnotherBtn.disabled = true;

        try {
            const empId = document.getElementById('activityEmployeeId').value;
            const slot = document.getElementById('activityTimeSlot').value;
            const type = document.getElementById('activityType').value;
            let desc = document.getElementById('activityDescription').value;

            if (!type) {
                this.showStatus('Please select an activity type', 'error');
                return;
            }

            // Get time range if specified
            const startTime = document.getElementById('activityStartTime')?.value;
            const endTime = document.getElementById('activityEndTime')?.value;
            if (startTime && endTime) {
                desc = `[${startTime}-${endTime}] ${desc}`;
            }

            // Calc pages
            let pagesDone = 0;
            if (['proof', 'epub', 'calibr'].includes(type)) {
                const s = parseInt(document.getElementById('startPage').value) || 0;
                const e = parseInt(document.getElementById('endPage').value) || 0;
                if (e >= s && s > 0) {
                    pagesDone = e - s + 1;
                    desc += ` (Pages: ${s}-${e}, Total: ${pagesDone})`;
                }
            }

            await this.setActivity(empId, slot, {
                type,
                description: desc,
                pagesDone: pagesDone.toString(),
                totalPages: pagesDone.toString(), // Ensure Total Pages is populated
                timestamp: new Date().toISOString()
            });

            if (keepOpen) {
                // Clear form but keep modal open for next activity
                document.getElementById('activityType').value = '';
                document.getElementById('activityDescription').value = '';
                document.getElementById('startPage').value = '';
                document.getElementById('endPage').value = '';
                document.getElementById('activityStartTime').value = '';
                document.getElementById('activityEndTime').value = '';
                document.getElementById('calculatedTotal').value = '0';
                this.showStatus('Activity saved! Add another activity for this timeslot.');
            } else {
                this.closeActivityModal();
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (addAnotherBtn) addAnotherBtn.disabled = false;
        }
    }

    // Reminders
    // Reminders
    playReminderSound() {
        // Simple 'ding' sound (Base64 MP3) - Short pleasant chime
        const audioSrc = 'data:audio/mp3;base64,//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//tgxAAAAAA';
        // (Truncated for brevity in prompt, I will use a real short base64 in the actual file write, checking length)
        // Actually, for robustness, let's use a standard beep function or a hosted valid base64. 
        // I will use a minimal valid MP3 base64 here.
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Notification chime
        audio.volume = 0.5;
        audio.play().catch(e => console.warn('Audio play prevented:', e));
    }

    startHourlyReminder() {
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        // Check every minute
        setInterval(() => {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();

            // Logic: Determine which slot just passed or is current
            // Our slots: 9-10, 10-11, 11-11:10, 11:10-12, 12-1, 1-1:40, 1:40-3, 3-3:50, 3:50-4, 4-5, 5-6, 6-7, 7-8
            // We want to alert if a slot END TIME has passed recently (e.g. within last 5 mins) and it's empty.
            // Or simple hourly check: "It's 10:05, did you fill 9-10?"

            // Helper to parsing slot string "HH:MM-HH:MM"
            // Let's implement specific checks for our known schedule to be precise

            let slotToCheck = null;

            // Simple map of "Check Time (Hour:Minute)" -> "Slot to Check"
            // We check 5 minutes after the hour/slot ends
            const checkMap = {
                '10:05': '9:00-10:00',
                '11:05': '10:00-11:00',
                '11:15': '11:00-11:10',
                '12:05': '11:10-12:00',
                '13:05': '12:00-01:00', // 1:05 PM
                '13:45': '01:00-01:40', // 1:45 PM checks 1:00-1:40
                '15:05': '01:40-03:00', // 3:05 PM
                '15:55': '03:00-03:50', // 3:55 PM
                '16:05': '03:50-04:00', // 4:05 PM
                '17:05': '04:00-05:00',
                '18:05': '05:00-06:00'
            };

            const timeKey = `${currentHour}:${currentMin.toString().padStart(2, '0')}`;
            slotToCheck = checkMap[timeKey];

            if (slotToCheck) {
                // Check if filled
                const acts = this.getActivity(this.currentUser.id, slotToCheck);
                if (!acts || acts.length === 0) {
                    // Not filled!
                    if (Notification.permission === "granted") {
                        new Notification("Timesheet Reminder 🔔", {
                            body: `Missing entry for ${slotToCheck}. Please fill your timesheet!`,
                            icon: 'images/logogo.jpg'
                        });
                        this.playReminderSound();
                    }
                }
            }

        }, 60000); // Run every minute
    }

    // Clock & Greetings
    updateClock() {
        const clock = document.getElementById('digitalClock');
        if (clock) {
            const now = new Date();
            // Indian Standard Time (IST) explicitly or Browser Local? User asked "Indian digital clock".
            // Browser local in India is IST. To be safe, we can use 'en-IN'.
            const timeStr = now.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            }).toUpperCase();
            clock.textContent = timeStr;
        }
    }

    showGreeting() {
        if (sessionStorage.getItem('greeted')) return;

        const hour = new Date().getHours();
        let greeting = 'Good Morning';
        let icon = '☀️';

        if (hour >= 12 && hour < 17) {
            greeting = 'Good Afternoon';
            icon = '🌤️';
        } else if (hour >= 17) {
            greeting = 'Good Evening';
            icon = '🌙';
        }

        const msg = `${greeting}, Have a Nice Day!`;

        const toast = document.createElement('div');
        toast.className = 'greeting-toast';
        toast.innerHTML = `<span class="greeting-icon">${icon}</span><span class="greeting-text">${msg}</span>`;
        document.body.appendChild(toast);

        sessionStorage.setItem('greeted', 'true');

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    setupEventListeners() {
        // Clock Init
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        // Greeting
        this.showGreeting();

        // Activity Type Change Listener
        document.getElementById('activityType')?.addEventListener('change', (e) => {
            const type = e.target.value;
            const pageGroup = document.getElementById('pageRangeGroup');
            const descGroup = document.getElementById('activityDescription').parentElement;

            const noDetailsNeeded = ['meeting', 'break', 'lunch'].includes(type);

            if (pageGroup) pageGroup.style.display = noDetailsNeeded ? 'none' : 'block';
            if (descGroup) descGroup.style.display = noDetailsNeeded ? 'block' : 'block';
        });

        const fullDayCheck = document.getElementById('fullDayCheck');
        fullDayCheck?.addEventListener('change', (e) => {
            const isFull = e.target.checked;
            document.getElementById('startSlot').disabled = isFull;
            document.getElementById('endSlot').disabled = isFull;
        });

        // Modal Close Buttons
        document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeEmployeeModal();
                this.closeActivityModal();
                this.closeEmployeeActionModal();
            });
        });

        // Header Buttons
        document.getElementById('addEmployeeBtn')?.addEventListener('click', () => {
            if (this.currentUser.role !== 'admin') {
                alert('Access Denied: Only Admins can add employees.');
                return;
            }
            this.openEmployeeModal();
        });



        document.getElementById('reportBtn')?.addEventListener('click', () => {
            this.generateDailyReport();
        });

        // Check Missing Timesheets (Admin Only)
        document.getElementById('checkMissingBtn')?.addEventListener('click', () => {
            this.showMissingTimesheets();
        });

        // Specific Cancel Buttons (if class selection misses them)
        document.getElementById('cancelBtn')?.addEventListener('click', () => this.closeEmployeeModal());
        document.getElementById('cancelActivityBtn')?.addEventListener('click', () => this.closeActivityModal());

        // Delete Activity Button - Simple and direct
        document.getElementById('deleteActivityBtn')?.addEventListener('click', async () => {
            console.log('=== DELETE BUTTON CLICKED ===');
            console.log('editingActivityKey:', this.editingActivityKey);
            console.log('currentUser:', this.currentUser);

            const userId = this.editingActivityKey?.userId || this.currentUser?.id;
            const timeSlot = this.editingActivityKey?.timeSlot;

            console.log('Resolved values:', { userId, timeSlot });

            if (!userId || !timeSlot) {
                console.error('Missing userId or timeSlot');
                alert('Error: Please select a time slot first');
                return;
            }

            console.log('Showing confirmation dialog');
            if (confirm(`Delete all activities for ${timeSlot}?`)) {
                console.log('User confirmed deletion');
                await this.clearActivity(userId, timeSlot);
            } else {
                console.log('User cancelled deletion');
            }
        });

        // Forms
        document.getElementById('employeeForm')?.addEventListener('submit', (e) => this.handleEmployeeSubmit(e));
        document.getElementById('activityForm')?.addEventListener('submit', (e) => this.handleActivitySubmit(e));

        // Page calculation
        const startPageInput = document.getElementById('startPage');
        const endPageInput = document.getElementById('endPage');
        const totalInput = document.getElementById('calculatedTotal');

        const calculateTotal = () => {
            const start = parseInt(startPageInput?.value) || 0;
            const end = parseInt(endPageInput?.value) || 0;
            if (start > 0 && end >= start) {
                const total = end - start + 1;
                if (totalInput) totalInput.value = total;
            } else {
                if (totalInput) totalInput.value = 0;
            }
        };

        startPageInput?.addEventListener('input', calculateTotal);
        endPageInput?.addEventListener('input', calculateTotal);

        // Add Another button
        document.getElementById('addAnotherBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleActivitySubmit(e, true); // Pass true to keep modal open
        });

        // Employee Action Modal Buttons (Leave/Permission)
        document.getElementById('markLeaveOptionBtn')?.addEventListener('click', () => this.showTimeSelectionForm('leave'));
        document.getElementById('markPermissionOptionBtn')?.addEventListener('click', () => this.showTimeSelectionForm('permission'));
        document.getElementById('addHolidayOptionBtn')?.addEventListener('click', () => this.showTimeSelectionForm('holiday'));
        document.getElementById('backToActionsBtn')?.addEventListener('click', () => this.hideTimeSelectionForm());
        document.getElementById('confirmActionBtn')?.addEventListener('click', () => this.handleLeavePermissionSubmit());

        // Navigation
        document.getElementById('prevDay')?.addEventListener('click', () => {
            this.currentDate.setDate(this.currentDate.getDate() - 1);
            this.setDateInput();
            this.loadData().then(() => this.renderTimesheet());
        });

        document.getElementById('todayBtn')?.addEventListener('click', () => {
            this.currentDate = new Date();
            this.setDateInput();
            this.loadData().then(() => this.renderTimesheet());
        });

        document.getElementById('nextDay')?.addEventListener('click', () => {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            this.setDateInput();
            this.loadData().then(() => this.renderTimesheet());
        });

        // Logout - Updated with Thank You
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();

            // Show confirmation dialog
            const confirmed = confirm('Are you sure you want to logout?');

            if (!confirmed) {
                return; // User cancelled, do nothing
            }

            const overlay = document.getElementById('logoutOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
                // Wait for animation
                setTimeout(() => {
                    localStorage.removeItem('currentUser');
                    sessionStorage.removeItem('greeted'); // Clear greet flag
                    window.location.href = 'login.html';
                }, 2000); // 2 second delay
            } else {
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html';
            }
        });
    }

    // Check and display pending reminders for the current user
    async checkPendingReminders() {
        if (!this.currentUser.id) return;

        try {
            const res = await fetch(`/api/reminders?userId=${this.currentUser.id}&status=sent`);
            if (!res.ok) return;

            const reminders = await res.json();
            if (reminders.length > 0) {
                // Show reminder notification
                reminders.forEach(reminder => {
                    this.showReminderAlert(reminder);
                });
            }
        } catch (e) {
            console.log('Could not check reminders:', e);
        }
    }

    showReminderAlert(reminder) {
        const toast = document.createElement('div');
        toast.className = 'reminder-toast';
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(255, 107, 107, 0.3);
            z-index: 10001;
            max-width: 350px;
            animation: slideIn 0.4s ease-out;
            cursor: pointer;
        `;
        toast.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <span style="font-size: 1.5rem;">🔔</span>
                <div>
                    <div style="font-weight: 600; margin-bottom: 4px;">Timesheet Reminder</div>
                    <div style="font-size: 0.9rem; opacity: 0.95;">${reminder.message}</div>
                    <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.8;">Click to dismiss</div>
                </div>
            </div>
        `;

        toast.onclick = async () => {
            // Mark as read
            try {
                await fetch(`/api/reminders/${reminder.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'read' })
                });
            } catch (e) { console.log(e); }
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        };

        document.body.appendChild(toast);

        // Auto dismiss after 15 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }
        }, 15000);
    }

    // Admin: Show employees with missing timesheets
    async showMissingTimesheets() {
        if (this.currentUser.role !== 'admin') {
            this.showStatus('Admin access required', 'error');
            return;
        }

        const dateKey = this.getDateKey(this.currentDate);

        try {
            const res = await fetch(`/api/missing-timesheet?dateKey=${dateKey}`);
            if (!res.ok) throw new Error('Failed to fetch');

            const data = await res.json();

            // Create and show modal
            const modalHtml = `
                <div id="missingTimesheetModal" class="modal-backdrop" style="display: flex;">
                    <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow: auto;">
                        <div class="modal-header">
                            <h3>Missing Timesheets - ${dateKey}</h3>
                            <button class="modal-close" onclick="document.getElementById('missingTimesheetModal').remove()">×</button>
                        </div>
                        <div class="modal-body">
                            <p style="margin-bottom: 1rem; color: var(--neutral-600);">
                                ${data.employeesWithMissing} of ${data.totalEmployees} employees have missing entries
                            </p>
                            ${data.employees.length === 0 ?
                    '<p style="color: green; font-weight: 600;">✓ All employees have completed their timesheets!</p>' :
                    `<div style="max-height: 400px; overflow-y: auto;">
                                    ${data.employees.map(emp => `
                                        <div style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                                            <div>
                                                <div style="font-weight: 600;">${emp.name}</div>
                                                <div style="font-size: 0.85rem; color: var(--neutral-500);">
                                                    Missing: ${emp.missingCount} slots | Filled: ${emp.filledCount} slots
                                                </div>
                                            </div>
                                            <button class="btn btn-sm btn-warning" onclick="window.timesheetManager.sendReminderTo(${emp.id}, '${emp.name}', '${dateKey}')">
                                                Send Reminder
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                                <button class="btn btn-primary" style="margin-top: 1rem; width: 100%;" 
                                    onclick="window.timesheetManager.sendReminderToAll('${dateKey}')">
                                    🔔 Send Reminder to All (${data.employeesWithMissing})
                                </button>`
                }
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        } catch (e) {
            console.error(e);
            this.showStatus('Error checking missing timesheets', 'error');
        }
    }

    // Send reminder to a specific employee
    async sendReminderTo(userId, name, dateKey) {
        try {
            const res = await fetch('/api/send-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: [userId],
                    dateKey: dateKey,
                    sentBy: this.currentUser.name
                })
            });

            if (res.ok) {
                this.showStatus(`Reminder sent to ${name}!`);
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            this.showStatus('Failed to send reminder', 'error');
        }
    }

    // Send reminder to all employees with missing timesheets
    async sendReminderToAll(dateKey) {
        try {
            const res = await fetch(`/api/missing-timesheet?dateKey=${dateKey}`);
            const data = await res.json();

            if (data.employees.length === 0) {
                this.showStatus('No employees need reminders!');
                return;
            }

            const userIds = data.employees.map(e => e.id);

            const sendRes = await fetch('/api/send-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: userIds,
                    dateKey: dateKey,
                    sentBy: this.currentUser.name
                })
            });

            if (sendRes.ok) {
                const result = await sendRes.json();
                this.showStatus(`Reminders sent to ${result.remindersCount} employees!`);
                document.getElementById('missingTimesheetModal')?.remove();
            } else {
                throw new Error('Failed');
            }
        } catch (e) {
            console.error(e);
            this.showStatus('Failed to send reminders', 'error');
        }
    }

    generateDailyReport() {
        const dateKey = this.getDateKey(this.currentDate);
        const dateStr = this.currentDate.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Filter users
        const users = this.employees.filter(u => u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name));

        // Open Report Window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to generate the report.');
            return;
        }

        // Generate Grid Headers
        let tableHeaderCols = `
            <th rowspan="2" style="width: 150px;">Employee Name</th>
            <th colspan="3" style="text-align: center; width: 120px;">Total Pages</th>
        `;

        this.timeSlots.forEach(slot => {
            tableHeaderCols += `<th rowspan="2" style="font-size: 10px; width: 80px; text-align: center;">${slot}</th>`;
        });

        const secondHeaderRow = `
            <tr>
                <th style="font-size: 10px; width: 40px; text-align: center;">Proof</th>
                <th style="font-size: 10px; width: 40px; text-align: center;">Epub</th>
                <th style="font-size: 10px; width: 40px; text-align: center;">Calibr</th>
            </tr>
        `;

        // Generate Rows
        const tableRows = users.map(user => {
            const userSlots = this.activities[dateKey]?.[user.id] || {};

            // Calculate Totals
            let proof = 0, epub = 0, calibr = 0;
            // Iterate all slots to sum
            const firstSlotActs = userSlots[this.timeSlots[0]];
            const isLeave = (firstSlotActs && firstSlotActs.length > 0 && firstSlotActs[0].type === 'leave' && firstSlotActs[0].description === 'FULL_DAY_LEAVE');

            if (!isLeave) {
                Object.values(userSlots).forEach(actList => {
                    if (Array.isArray(actList)) {
                        actList.forEach(act => {
                            const p = parseInt(act.pagesDone) || 0;
                            if (act.type === 'proof') proof += p;
                            if (act.type === 'epub') epub += p;
                            if (act.type === 'calibr') calibr += p;
                        });
                    }
                });
            }

            let rowHtml = `<tr>`;
            rowHtml += `<td style="font-weight: 600; color: #1e3a8a; padding: 4px;">${user.name}</td>`;
            rowHtml += `<td style="text-align: center; font-weight: 600; padding: 4px;">${proof || '-'}</td>`;
            rowHtml += `<td style="text-align: center; font-weight: 600; padding: 4px;">${epub || '-'}</td>`;
            rowHtml += `<td style="text-align: center; font-weight: 600; padding: 4px;">${calibr || '-'}</td>`;

            if (isLeave) {
                rowHtml += `<td colspan="${this.timeSlots.length}" style="background: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; vertical-align: middle;">ON LEAVE</td>`;
            } else {
                this.timeSlots.forEach(slot => {
                    const acts = userSlots[slot];
                    let cellContent = '';
                    if (acts && acts.length > 0) {
                        cellContent += `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">`;
                        acts.forEach(act => {
                            // Minimalist render for report
                            if (act.type === 'sunday-holiday') {
                                cellContent += `<div style="background: #f0fdf4; color: #166534; padding: 2px 4px; border-radius: 4px; font-size: 9px; margin-bottom: 2px; text-align: center; width: 100%;">Sunday Holiday</div>`;
                            } else if (act.type === 'lunch-break') {
                                cellContent += `<div style="background: #ffedd5; color: #9a3412; padding: 2px 4px; border-radius: 4px; font-size: 9px; margin-bottom: 2px; text-align: center; width: 100%;">Lunch Break</div>`;
                            } else {
                                cellContent += `<div style="margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px; width: 100%; text-align: center;">
                                    <div style="font-weight: 700; font-size: 10px; color: #0f172a; text-transform: uppercase;">${act.type}</div>
                                    <div style="font-size: 9px; color: #64748b; line-height: 1.2;">${act.description || ''}</div>
                                 </div>`;
                            }
                        });
                        cellContent += `</div>`;
                    }
                    rowHtml += `<td style="vertical-align: top; padding: 4px; height: 40px;">${cellContent}</td>`;
                });
            }
            rowHtml += `</tr>`;
            return rowHtml;
        }).join('');

        printWindow.document.write(`
            <html>
            <head>
                <title>Daily Timesheet Report - ${dateKey}</title>
                <style>
                    body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 20px; color: #0f172a; background: white; -webkit-print-color-adjust: exact; }
                    
                    /* Header */
                    .report-header { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #d4af37; }
                    h1 { color: #1e3a8a; margin: 0; font-size: 20px; }
                    .meta { font-size: 12px; color: #64748b; margin-top: 5px; }

                    /* Landscape Table */
                    @page { size: landscape; margin: 10mm; }
                    
                    table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
                    th, td { border: 1px solid #cbd5e1; padding: 4px; word-wrap: break-word; overflow-wrap: break-word; }
                    th { background: #f1f5f9; color: #1e3a8a; font-weight: 600; text-align: center; vertical-align: middle; }
                    tr:nth-child(even) { background: #f8fafc; }
                    
                    /* Buttons */
                    .no-print { margin-bottom: 15px; text-align: right; }
                    .btn { padding: 8px 16px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
                    .btn-sec { background: white; color: #1e3a8a; border: 1px solid #1e3a8a; margin-right: 10px; }
                    @media print { .no-print { display: none; } body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <a href="mailto:?subject=Timesheet Report ${dateKey}" class="btn btn-sec">📧 Send Email</a>
                    <button class="btn" onclick="window.print()">🖨️ Print Landscape</button>
                </div>

                <div class="report-header">
                    <h1>Pristonix Daily Timesheet</h1>
                    <div class="meta">Date: ${dateStr} | Generated By: ${this.currentUser.name} | Confidential</div>
                </div>

                <table>
                    <thead>
                        <tr>${tableHeaderCols}</tr>
                        ${secondHeaderRow}
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                
                <div style="margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center;">
                    Generated by Pristonix Timesheet System
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    generateDailyReport_OLD() {
        const dateKey = this.getDateKey(this.currentDate);
        const dateStr = this.currentDate.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Filter users
        const users = this.employees.filter(u => u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name));
        const reportData = [];

        users.forEach(user => {
            const slots = this.activities[dateKey]?.[user.id] || {};

            // Check Sunday/Holiday auto-fill for report if not in slots
            /* (Logic handled by renderTimesheet mostly, but we should access raw if possible or just check slots) */

            this.timeSlots.forEach(slot => {
                const acts = slots[slot]; // Array
                if (Array.isArray(acts) && acts.length > 0) {
                    acts.forEach(act => {
                        reportData.push({
                            timeSlot: slot,
                            employeeName: user.name,
                            type: act.type,
                            description: act.description,
                            pagesDone: act.pagesDone,
                            timestamp: act.timestamp
                        });
                    });
                }
            });
        });

        if (reportData.length === 0) {
            this.showStatus('No data to report for this date', 'error');
            return;
        }

        // Open Report Window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to generate the report.');
            return;
        }

        printWindow.document.write(`
            <html>
            <head>
                <title>Daily Activity Report - ${dateKey}</title>
                <style>
                    body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; background: white; -webkit-print-color-adjust: exact; }
                    
                    /* Header */
                    .report-header { border-bottom: 2px solid #d4af37; padding-bottom: 20px; margin-bottom: 30px; }
                    .report-title { color: #1e3a8a; font-size: 24px; font-weight: 700; margin: 0 0 5px 0; }
                    .report-meta { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px; background: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; }
                    .meta-group { font-size: 13px; line-height: 1.6; color: #64748b; }
                    .meta-label { font-weight: 600; color: #475569; }

                    /* Table */
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { text-align: left; padding: 12px 15px; background: #f1f5f9; color: #334155; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #334155; }
                    tr:last-child td { border-bottom: none; }
                    tr:hover { background-color: #f8fafc; }

                    /* Column Styles */
                    .col-timeslot { width: 15%; font-weight: 600; color: #64748b; font-variant-numeric: tabular-nums; }
                    .col-employee { width: 20%; font-weight: 600; color: #1e3a8a; }
                    .col-details { width: 45%; }
                    .col-updated { width: 20%; color: #94a3b8; font-size: 12px; }

                    /* Activity Details Cell */
                    .act-type { display: block; font-weight: 700; color: #0f172a; margin-bottom: 4px; text-transform: uppercase; font-size: 11px; }
                    .act-desc { display: block; margin-bottom: 4px; line-height: 1.4; }
                    .act-pages { display: block; color: #64748b; font-size: 12px; }
                    
                    /* Badges for Type Colors if needed, or just text */
                    .type-proof { color: #15803d; }
                    .type-epub { color: #1d4ed8; }
                    .type-calibr { color: #7e22ce; }
                    .type-lunch-break { color: #c2410c; }
                    .type-sunday-holiday { color: #047857; }

                    /* Footer */
                    .footer { margin-top: 50px; font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }

                    /* Print */
                    @media print {
                        .no-print { display: none !important; }
                        body { padding: 0; }
                        table { page-break-inside: auto; }
                        tr { page-break-inside: avoid; page-break-after: auto; }
                    }

                    .btn { padding: 10px 20px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; font-size: 14px; transition: all 0.2s; }
                    .btn-primary { background: #1e3a8a; color: white; }
                    .btn-primary:hover { background: #1e40af; }
                    .btn-secondary { background: #fff; color: #1e3a8a; border: 1px solid #1e3a8a; }
                    .btn-secondary:hover { background: #f0f9ff; }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 30px; display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
                    <span style="font-size: 12px; color: #64748b; margin-right: 10px; font-weight: 500;">
                        ℹ️ Clicking 'Send Report' will copy the table. Just Paste (Ctrl+V) in the email body.
                    </span>
                    <button class="btn btn-secondary" onclick="sendEmailReport()">
                        📧 Send Report
                    </button>
                    <button class="btn btn-primary" onclick="window.print()">
                        🖨️ Print / Save PDF
                    </button>
                </div>
                
                <script>
                    function sendEmailReport() {
                        // 1. Copy to Clipboard
                        const table = document.querySelector('table');
                        const range = document.createRange();
                        range.selectNode(table);
                        window.getSelection().removeAllRanges();
                        window.getSelection().addRange(range);
                        try {
                            document.execCommand('copy');
                        } catch (err) {
                            console.error('Copy failed', err);
                        }
                        window.getSelection().removeAllRanges();

                        // 2. Open Mail Client
                        const subject = encodeURIComponent("Daily Activity Report - ${dateKey}");
                        const body = encodeURIComponent("Hi Team,\n\nPlease find the Daily Activity Report below:\n\n[PASTE (Ctrl+V) TABLE HERE]\n\nRegards,\n${this.currentUser.name || 'Admin'}");
                        window.location.href = "mailto:?subject=" + subject + "&body=" + body;
                    }
                </script>

                <div class="report-header">
                    <h1 class="report-title">Pristonix Daily Activity Report</h1>
                    <div class="report-meta">
                        <div class="meta-group">
                            <span class="meta-label">Date:</span> ${dateStr}<br>
                            <span class="meta-label">Generated By:</span> ${this.currentUser.name || 'Admin'}<br>
                            <span class="meta-label">Department:</span> Production
                        </div>
                        <div class="meta-group" style="text-align: right;">
                            <span class="meta-label">Total Records:</span> ${reportData.length}<br>
                            <span class="meta-label">Confidentiality:</span> Internal Use Only
                        </div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Time Slot</th>
                            <th>Employee</th>
                            <th>Activity Details</th>
                            <th>Last Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.map(row => {
            // Extract time from ISO timestamp
            const time = row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
            return `
                            <tr>
                                <td class="col-timeslot">${row.timeSlot}</td>
                                <td class="col-employee">${row.employeeName}</td>
                                <td class="col-details">
                                    <span class="act-type type-${row.type}">${row.type}</span>
                                    <span class="act-desc">${row.description || 'No description'}</span>
                                    ${parseInt(row.pagesDone) > 0 ? `<span class="act-pages">Pages: ${row.pagesDone}</span>` : ''}
                                </td>
                                <td class="col-updated">${time}</td>
                            </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>

                <div class="footer">
                    © 2025 Pristonix Solutions. All Rights Reserved. | Generated on ${new Date().toLocaleString()}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    calculateTotal() {
        const start = parseInt(document.getElementById('startPage')?.value) || 0;
        const end = parseInt(document.getElementById('endPage')?.value) || 0;
        const total = (end >= start && start > 0) ? (end - start + 1) : 0;
        const calcField = document.getElementById('calculatedTotal');
        if (calcField) calcField.value = total;
    }
}

class ActivityTracker {
    constructor() {
        this.listElement = null;
        // We'll init after a short delay or find element dynamically
        setTimeout(() => this.init(), 500);
    }

    async init() {
        await this.loadLogs();
        // Poll every 30 seconds
        setInterval(() => this.loadLogs(), 30000);
    }

    async loadLogs(dateKey = null) {
        // If no specific date passed, try to get from manager
        const date = dateKey || (window.timesheetManager ? window.timesheetManager.getDateKey(window.timesheetManager.currentDate) : null);

        // Update Header to show context
        const header = document.getElementById('recentChangesHeader');
        if (header && date) {
            header.textContent = `Recent Changes (${date})`;
        }

        let url = '/api/activity-log?limit=50';
        if (date) url += `&date=${date}`;

        try {
            const res = await fetch(url);
            if (res.ok) {
                const logs = await res.json();
                this.render(logs);
            }
        } catch (e) {
            console.error('Failed to load activity log', e);
        }
    }

    render(logs) {
        // Look for the recent changes list container
        // Based on typical structure, it might be an element with id or class
        // Let's assume there's a container.
        const output = document.getElementById('activityTrackerList') || document.querySelector('.activity-tracker-list');

        if (!output) return;

        output.innerHTML = '';
        if (logs.length === 0) {
            output.innerHTML = '<div class="empty-state">No recent activity</div>';
            return;
        }

        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'activity-tracker-item';

            // Format time
            const timeDate = new Date(log.timestamp);
            const timeStr = timeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Initials removed per request
            const typeClass = `type-${(log.activityType || 'other').toLowerCase()}`;

            item.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                        <div>
                            <span style="font-weight: 600; font-size: 0.875rem; color: var(--neutral-900);">${log.employeeName}</span>
                            <span style="font-size: 0.75rem; color: var(--neutral-500); margin-left: 6px;">
                                <span style="background: var(--neutral-100); padding: 2px 6px; border-radius: 4px; font-weight: 600; color: var(--neutral-600);">${(log.activityType || '').toUpperCase()}</span>
                            </span>
                        </div>
                        <span style="font-size: 0.75rem; color: var(--neutral-400); font-weight: 500;">${timeStr}</span>
                    </div>
                    
                    <div style="font-size: 0.8125rem; color: var(--neutral-600); margin-bottom: 4px; line-height: 1.4;">
                        ${log.description || log.action}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
                         <span style="color: var(--primary-blue); font-weight: 500; background: rgba(37, 99, 235, 0.05); padding: 2px 6px; border-radius: 4px;">
                            ${(log.timeSlot || '').split('|').pop().trim()}
                         </span>
                         <span style="color: var(--neutral-400);">By: ${log.editedBy || 'System'}</span>
                    </div>
                </div>
            `;
            output.appendChild(item);
        });
    }

    async addActivity(name, type, desc, slot, action, dateKeyOverride = null) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const editorName = currentUser.name || currentUser.username || 'System';

        // Extract dateKey from slot if present (format: "YYYY-MM-DD | HH:MM-HH:MM")
        // Used for strict date filtering in backend
        let dateKey = dateKeyOverride;
        if (!dateKey) {
            if (slot && slot.includes(' | ')) {
                dateKey = slot.split(' | ')[0];
            } else {
                // Fallback for immediate safety, though setActivity should provide it.
                // If missing, it might not show in date-filtered view, which is better than showing in WRONG view.
                dateKey = new Date().toISOString().split('T')[0];
            }
        }

        try {
            await fetch('/api/activity-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeName: name,
                    activityType: type,
                    description: desc,
                    timeSlot: slot, // Keeps full display "Date | Time"
                    action: action,
                    editedBy: editorName,
                    timestamp: new Date().toISOString(),
                    dateKey: dateKey
                })
            });
            this.loadLogs(dateKey); // Reload logs for the specific date we just added to
        } catch (e) {
            console.error('Error logging activity', e);
        }
    }
}

window.timesheetManager = new TimesheetManager();
window.activityTracker = new ActivityTracker();
