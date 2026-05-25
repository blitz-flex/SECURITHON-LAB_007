/* ──────────────────────────────────────────────────────────────────────────
   SECURATION LAB - ADMIN OCC MASTER LOGIC (v4.0 - ADVANCED)
   ────────────────────────────────────────────────────────────────────────── */

let allUsers = [];
let allLabs = [];
let activityChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initTelemetry();
    initHeatmap();
    initLogFeed();
    initFleetSearch();
    initActionButtons();
    
    // Sub-systems
    initShell();
    initLabEditor();
    initSettingsManager();
    initFleetManager();
    
    syncAll();
    setInterval(syncAll, 15000);
});

async function syncAll() {
    await Promise.all([
        loadAnalytics(),
        loadFleet(),
        loadCurriculum(),
        loadAuditLogs(),
        loadIntelligence(),
        loadInfrastructure(),
        loadSessions()
    ]);
    syncMaintenanceUI();
}

/* ──────────────────────────────────────────────────────────────────────────
   1. DATA LOADING & RENDERING
   ────────────────────────────────────────────────────────────────────────── */

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (token) {
        options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    }
    return fetch(url, options);
}

async function loadIntelligence() {
    const res = await fetchWithAuth('/api/v1/admin/intelligence');
    if (res.ok) {
        const data = await res.json();
        const feed = document.getElementById('intelFeed');
        if (!feed) return;
        feed.innerHTML = data.map(i => `
            <div class="intel-item glass-panel" style="padding: 15px; margin-bottom: 15px; border-left: 4px solid ${i.severity === 'CRITICAL' ? '#f85149' : '#d29922'}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <strong style="color: #fff; font-family: var(--font-mono)">${i.id}</strong>
                    <span class="badge" style="background: ${i.severity === 'CRITICAL' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(210, 153, 34, 0.1)'}; color: ${i.severity === 'CRITICAL' ? '#f85149' : '#d29922'}">${i.severity}</span>
                </div>
                <div style="font-size: 0.85rem; color: #fff;">${i.title}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">Published: ${i.date}</div>
            </div>
        `).join('');
    }
}

async function loadInfrastructure() {
    const res = await fetchWithAuth('/api/v1/admin/infrastructure');
    if (res.ok) {
        const data = await res.json();
        const grid = document.getElementById('infraGrid');
        if (!grid) return;
        
        const typeIcons = {
            'shield': 'fa-shield-virus',
            'server': 'fa-server',
            'database': 'fa-database',
            'cloud': 'fa-cloud'
        };

        grid.innerHTML = data.map(n => `
            <div class="infra-node glass-panel" style="position: relative; border-color: ${n.status === 'UP' ? 'rgba(0, 229, 155, 0.15)' : 'rgba(248, 81, 73, 0.3)'}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: #fff;">
                        <i class="fas ${typeIcons[n.type] || 'fa-microchip'}"></i>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.6rem; color: var(--text-muted); font-family: var(--font-data); text-transform: uppercase;">${n.region}</div>
                        <div style="font-size: 0.75rem; color: ${n.status === 'UP' ? 'var(--primary)' : 'var(--danger)'}; font-weight: 700; font-family: var(--font-data);">
                            <span class="status-indicator online" style="margin-right: 4px; ${n.status === 'UP' ? 'animation: pulse 2s infinite;' : 'background: var(--danger); box-shadow: none;'}"></span>
                            ${n.status}
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="font-weight: 700; color: #fff; font-size: 0.9rem; margin-bottom: 2px;">${n.name}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-data);">UUID: ${n.id}</div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                        <div style="font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase;">Latency</div>
                        <div style="font-size: 0.8rem; color: #fff; font-family: var(--font-data);">${n.latency}</div>
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                        <div style="font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase;">Uptime</div>
                        <div style="font-size: 0.8rem; color: #fff; font-family: var(--font-data);">${n.uptime}</div>
                    </div>
                </div>

                <div class="node-load" style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden;">
                    <div class="node-load-fill" style="width: ${n.load}%; background: ${n.load > 70 ? 'var(--danger)' : 'var(--primary)'}; height: 100%; transition: width 0.5s ease;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.6rem; color: var(--text-muted); margin-top: 6px; font-family: var(--font-data);">
                    <span>NODE_LOAD</span>
                    <span>${n.load}%</span>
                </div>
            </div>
        `).join('');
    }
}

async function loadSessions() {
    const res = await fetchWithAuth('/api/v1/admin/sessions');
    if (res.ok) {
        const data = await res.json();
        const list = document.getElementById('sessionList');
        if (!list) return;
        if (data.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.8rem;">No active sessions detected.</div>`;
            return;
        }
        list.innerHTML = data.map(s => `
            <div class="glass-panel" style="padding: 15px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid var(--primary);">
                <div>
                    <div style="font-weight: 700; color: #fff; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
                        ${s.username} 
                        <span class="status-indicator online" style="width: 6px; height: 6px;"></span>
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-data); margin-top: 4px;">
                        <i class="fas fa-network-wired" style="margin-right: 4px; opacity: 0.5;"></i> ${s.ip} 
                        <span style="margin: 0 8px; opacity: 0.2;">|</span>
                        <i class="fas fa-clock" style="margin-right: 4px; opacity: 0.5;"></i> ${s.last_active}
                    </div>
                    <div style="font-size: 0.65rem; color: var(--primary); font-family: var(--font-data); margin-top: 2px; font-weight: 600;">
                        ${s.activity.toUpperCase()}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-sm btn-secondary" onclick="kickSession(${s.id})" style="border-radius: 6px; font-size: 0.65rem;">KICK</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteOperative(${s.id})" style="border-radius: 6px; font-size: 0.65rem; padding: 4px 8px;" title="Permanent Delete"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `).join('');
    }
}

window.kickSession = async (uid) => {
    if (confirm("TERMINATE OPERATIVE SESSION?")) {
        const res = await fetchWithAuth(`/api/v1/admin/sessions/${uid}/kick`, { method: 'POST' });
        if (res.ok) {
            showToast('SESSION_TERMINATED', 'warning');
            loadSessions();
        }
    }
};

window.kickAllSessions = async () => {
    if (confirm("EXECUTE EMERGENCY MASS DISCONNECT? This will terminate ALL active operative sessions!")) {
        const res = await fetchWithAuth(`/api/v1/admin/sessions/kick-all`, { method: 'POST' });
        if (res.ok) {
            showToast('EMERGENCY_MASS_DISCONNECT_COMPLETE', 'error');
            loadSessions();
        }
    }
};

/* ──────────────────────────────────────────────────────────────────────────
   2. CORE SYSTEM ACTIONS
   ────────────────────────────────────────────────────────────────────────── */

function initActionButtons() {
    document.getElementById('btn-db-check')?.addEventListener('click', async () => {
        showToast('INTEGRITY_SCAN_INITIATED', 'warning');
        const res = await fetchWithAuth('/api/v1/admin/db-check', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            showToast(data.message, 'success');
        }
    });

    document.getElementById('btn-backup')?.addEventListener('click', async () => {
        showToast('BACKUP_JOB_QUEUED', 'warning');
        const res = await fetchWithAuth('/api/v1/admin/system/backup', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            showToast(data.message, 'success');
        }
    });

    document.getElementById('btn-reset')?.addEventListener('click', async () => {
        if (confirm("CONFIRM EMERGENCY CORE RESET?")) {
            showToast('EMERGENCY_RESTART_INITIATED', 'error');
            await fetchWithAuth('/api/v1/admin/emergency-reset', { method: 'POST' });
            showToast('CORE_ONLINE', 'success');
        }
    });
}

/* ──────────────────────────────────────────────────────────────────────────
   3. PRE-EXISTING SYSTEMS (REFINED)
   ────────────────────────────────────────────────────────────────────────── */

function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');
            navItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            if (targetTab === 'overview' && activityChart) activityChart.update();
        });
    });
}

function showToast(message, type = "success") {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = "glass-panel";
    toast.style.cssText = `padding: 12px 20px; font-family: var(--font-mono); font-size: 0.8rem; margin-bottom: 10px; border-left: 4px solid ${type === 'success' ? '#3fb950' : '#f85149'};`;
    toast.innerHTML = `<span style="color: ${type === 'success' ? '#3fb950' : '#f85149'}">[${type.toUpperCase()}]</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4000);
}

async function loadAnalytics() {
    const res = await fetchWithAuth('/api/v1/admin/analytics');
    if (res.ok) {
        const data = await res.json();
        updateTopStats(data.stats);
        renderActivityChart(data.trends);
        const statThreat = document.getElementById('stat-threat');
        if (statThreat) {
            statThreat.innerText = data.stats.threat_level || 'LOW';
            statThreat.className = `value ${data.stats.threat_level === 'HIGH' ? 'text-danger' : 'text-success'}`;
        }
    }
}

function updateTopStats(stats) {
    const elMap = { 
        'stat-total-users': stats.total_users, 
        'stat-active-labs': stats.active_labs, 
        'stat-uptime': stats.uptime, 
        'stat-health': stats.system_health + '%',
        'stat-sec-score': stats.security_score ? stats.security_score + '%' : 'N/A',
        'stat-net-in': stats.network_in || '0 MB/s',
        'stat-net-out': (stats.network_out || '0 MB/s') + ' OUT',
        'stat-storage': stats.storage_used || '0%',
        'stat-failed-logins': stats.failed_logins || 0,
        'stat-active-ops': stats.active_ops || 0
    };
    for (const [id, val] of Object.entries(elMap)) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
}

async function loadAuditLogs() {
    const res = await fetchWithAuth('/api/v1/admin/audit-logs');
    if (res.ok) {
        const logs = await res.json();
        const list = document.getElementById('auditLogList');
        if (!list) return;
        list.innerHTML = logs.map(l => `<div class="audit-item" style="font-size: 0.75rem; margin-bottom: 8px; font-family: var(--font-mono)"><span style="color: var(--text-muted)">${l.time}</span> <span style="color: var(--primary-app)">[${l.action}]</span> ${l.detail}</div>`).join('');
    }
}

async function loadFleet() {
    const res = await fetchWithAuth('/api/v1/admin/users');
    if (res.ok) {
        allUsers = await res.json();
        renderFleetTable(allUsers);
    }
}

function renderFleetTable(users) {
    const tbody = document.querySelector('.fleet-table tbody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => {
        const rank = u.is_superuser ? 'ADMIN' : (u.points > 1000 ? 'ELITE' : 'RECRUIT');
        return `<tr onclick="openOperativeModal(${u.id})" style="cursor:pointer"><td>${u.username}</td><td><span class="badge ${rank.toLowerCase()}">${rank}</span></td><td>${u.points}</td><td><span class="status-indicator ${u.is_active ? 'online' : ''}"></span> ${u.is_active ? 'ACTIVE' : 'BANNED'}</td></tr>`;
    }).join('');
}

window.openOperativeModal = function(uid) {
    const user = allUsers.find(u => u.id === uid);
    if (!user) return;
    document.getElementById('modal-username').innerText = user.username.toUpperCase();
    document.getElementById('modal-avatar').innerText = user.username[0].toUpperCase();
    document.getElementById('modal-xp').innerText = user.points;
    document.getElementById('modal-status').innerText = user.is_active ? 'ACTIVE' : 'BANNED';
    const promoteBtn = document.getElementById('modal-btn-promote');
    promoteBtn.innerText = user.is_superuser ? 'DEMOTE' : 'PROMOTE';
    promoteBtn.onclick = () => runUserAction(uid, user.is_superuser ? 'demote' : 'promote');
    
    document.getElementById('modal-btn-ban').innerText = user.is_active ? 'BAN_USER' : 'UNBAN_USER';
    document.getElementById('modal-btn-ban').onclick = () => runUserAction(uid, 'ban');
    document.getElementById('modal-btn-delete').onclick = () => deleteOperative(uid);
    document.getElementById('modal-btn-reset').onclick = () => runUserAction(uid, 'reset_xp');
    document.getElementById('operativeModal').classList.add('show');
};

async function deleteOperative(uid) {
    if (confirm("PERMANENTLY DELETE OPERATIVE? This action cannot be undone!")) {
        const res = await fetchWithAuth(`/api/v1/admin/users/${uid}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('OPERATIVE_REMOVED_PERMANENTLY', 'error');
            loadFleet();
            document.getElementById('operativeModal').classList.remove('show');
        } else {
            const err = await res.json();
            showToast(err.detail || 'DELETE_FAILED', 'error');
        }
    }
}

async function runUserAction(uid, action) {
    const res = await fetchWithAuth(`/api/v1/admin/users/${uid}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (res.ok) { showToast(`USER_${action.toUpperCase()}_SUCCESS`, 'success'); loadFleet(); document.getElementById('operativeModal').classList.remove('show'); }
}

async function loadCurriculum() {
    const res = await fetchWithAuth('/api/v1/admin/curriculum');
    if (res.ok) {
        allLabs = await res.json();
        const list = document.querySelector('.lab-list');
        if (!list) return;
        
        // Use a grid layout for curriculum
        list.style.display = 'grid';
        list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
        list.style.gap = '20px';

        const catIcons = {
            'Web Security': 'fa-globe',
            'Infrastructure': 'fa-network-wired',
            'Binary Research': 'fa-microchip',
            'Cloud Security': 'fa-cloud'
        };

        list.innerHTML = allLabs.map(lab => {
            const severityColor = lab.cvss >= 9 ? 'var(--danger)' : (lab.cvss >= 7 ? 'var(--warning)' : 'var(--secondary)');
            return `
                <div class="lab-card glass-panel" style="padding: 24px; display: flex; flex-direction: column; gap: 16px; border-left: 4px solid ${severityColor}; opacity: ${lab.disabled ? '0.6' : '1'}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                            <i class="fas ${catIcons[lab.category] || 'fa-book'}"></i>
                        </div>
                        <span class="badge" style="background: rgba(0,0,0,0.3); border-color: ${severityColor}; color: ${severityColor}">CVSS: ${lab.cvss}</span>
                    </div>
                    
                    <div style="flex: 1;">
                        <h3 style="font-size: 1rem; color: #fff; margin-bottom: 4px; font-weight: 700;">${lab.title}</h3>
                        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-family: var(--font-data);">${lab.category}</div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-sm ${lab.disabled ? 'btn-primary' : 'btn-secondary'}" style="flex: 1" onclick="toggleLabState('${lab.id}', ${!lab.disabled})">
                            <i class="fas ${lab.disabled ? 'fa-play' : 'fa-pause'}"></i> ${lab.disabled ? 'ACTIVATE' : 'SUSPEND'}
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="openLabEditor('${lab.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="deleteLab('${lab.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

window.deleteLab = async (id) => {
    if (!confirm('Are you sure you want to delete this lab module?')) return;
    const res = await fetchWithAuth(`/api/v1/admin/curriculum/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('LAB_DELETED', 'success'); loadCurriculum(); }
};

window.toggleLabState = async (id, state) => {
    const res = await fetchWithAuth(`/api/v1/admin/curriculum/${id}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: state }) });
    if (res.ok) { showToast('LAB_STATUS_SYNCED', 'success'); loadCurriculum(); }
};

window.openLabEditor = function(id) {
    const lab = allLabs.find(l => l.id === id);
    if (!lab) return;
    document.getElementById('edit-lab-id').value = lab.id;
    document.getElementById('edit-lab-title').value = lab.title;
    document.getElementById('edit-lab-category').value = lab.category;
    document.getElementById('edit-lab-cvss').value = lab.cvss;
    document.getElementById('labModal').classList.add('show');
};

function initLabEditor() {
    document.getElementById('labEditForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-lab-id').value;
        const payload = { title: document.getElementById('edit-lab-title').value, category: document.getElementById('edit-lab-category').value, cvss: parseFloat(document.getElementById('edit-lab-cvss').value) };
        const res = await fetchWithAuth(`/api/v1/admin/curriculum/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { showToast('METADATA_SAVED', 'success'); document.getElementById('labModal').classList.remove('show'); loadCurriculum(); }
    });
}

async function initSettingsManager() {
    const res = await fetchWithAuth('/api/v1/admin/settings');
    if (res.ok) {
        const config = await res.json();
        document.getElementById('config-maintenance').checked = config.maintenance_mode;
        document.getElementById('config-registration').checked = config.allow_registration;
        document.getElementById('config-announcement').value = config.global_announcement;
        syncMaintenanceUI();
    }
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        const payload = { maintenance_mode: document.getElementById('config-maintenance').checked, allow_registration: document.getElementById('config-registration').checked, global_announcement: document.getElementById('config-announcement').value };
        const res = await fetchWithAuth('/api/v1/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { showToast('SETTINGS_COMMIT_SUCCESS', 'success'); syncMaintenanceUI(); }
    });
}

function syncMaintenanceUI() {
    const isM = document.getElementById('config-maintenance')?.checked;
    const status = document.getElementById('sidebar-status-text');
    if (status) { status.innerText = isM ? 'LOCK_ACTIVE' : 'CORE_STABLE'; status.className = isM ? 'status-text text-danger' : 'status-text text-success'; }
}

function initShell() {
    const input = document.getElementById('shellInput');
    const output = document.getElementById('shellOutput');
    if (!input || !output) return;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const cmd = input.value.trim().toLowerCase(); input.value = ''; processShellCmd(cmd, output); } });
}

function processShellCmd(cmd, output) {
    const print = (text) => { const div = document.createElement('div'); div.innerText = `admin@occ:~$ ${text}`; output.appendChild(div); output.scrollTop = output.scrollHeight; };
    if (cmd === 'help') print('Commands: help, status, reload, users, labs, clear, backup');
    else if (cmd === 'status') print('OCC_CORE: NOMINAL');
    else if (cmd === 'users') print(`OPERATIVES: ${allUsers.length}`);
    else if (cmd === 'clear') output.innerHTML = '';
    else if (cmd === 'backup') { print('BACKUP_TASK_QUEUED...'); }
    else print(`UNKNOWN_CMD: ${cmd}`);
}

function renderActivityChart(trends) {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;
    const data = { 
        labels: trends.map(t => t.time), 
        datasets: [ 
            { label: 'CPU LOAD (%)', data: trends.map(t => t.cpu), borderColor: '#58a6ff', tension: 0.4, pointRadius: 0 }, 
            { label: 'THREATS DETECTED', data: trends.map(t => t.threats), borderColor: '#f85149', tension: 0.4, pointRadius: 0 } 
        ] 
    };
    if (activityChart) { 
        activityChart.data = data; 
        activityChart.update('none'); 
    } else { 
        activityChart = new Chart(ctx, { 
            type: 'line', 
            data: data, 
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { 
                        display: true, 
                        position: 'top', 
                        align: 'end', 
                        labels: { color: '#8b949e', font: { size: 10, family: 'JetBrains Mono' }, boxWidth: 12 } 
                    } 
                }, 
                scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b949e' } } } 
            } 
        }); 
    }
}

function initTelemetry() {
    const update = async () => {
        const res = await fetchWithAuth('/api/v1/system/stats');
        if (res.ok) {
            const d = await res.json();
            const cpuFill = document.querySelector('.cpu-fill');
            const memFill = document.querySelector('.mem-fill');
            if (cpuFill) { cpuFill.style.width = d.cpu + '%'; document.querySelector('.cpu-text').innerText = d.cpu.toFixed(1) + '%'; }
            if (memFill) { memFill.style.width = d.memory + '%'; document.querySelector('.mem-text').innerText = d.memory.toFixed(1) + '%'; }
        }
    };
    setInterval(update, 3000);
    update();
}

function initHeatmap() {
    const cells = document.querySelectorAll('.heat-cell');
    if (cells.length === 0) return;
    setInterval(() => { const c = cells[Math.floor(Math.random() * cells.length)]; const lvls = ['', 'active-low', 'active-med', 'active-high']; c.className = 'heat-cell ' + lvls[Math.floor(Math.random() * lvls.length)]; }, 1000);
}

function initLogFeed() {
    const list = document.getElementById('securityAlertsList');
    if (!list) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    let ws;
    let reconnectTimeout = null;

    function connect() {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);

        ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                addSecurityAlert(data);
            } catch (err) {
                console.error('Error parsing security alert log payload:', err);
            }
        };

        ws.onclose = () => {
            console.warn('Security alerts WebSocket closed. Reconnecting in 3 seconds...');
            reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = (err) => {
            console.error('Security alerts WebSocket error:', err);
            ws.close();
        };
    }

    connect();
}

function addSecurityAlert(data) {
    const list = document.getElementById('securityAlertsList');
    if (!list) return;

    const item = document.createElement('div');
    const isCritical = data.message.toLowerCase().includes('unauthorized') || data.message.toLowerCase().includes('failed');
    const color = isCritical ? 'var(--danger)' : 'var(--secondary)';
    const icon = isCritical ? 'fa-exclamation-triangle' : 'fa-info-circle';
    const bg = isCritical ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)';
    const border = isCritical ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';

    item.className = 'alert-item';
    item.style.cssText = `background: ${bg}; border: 1px solid ${border}; padding: 12px; border-radius: 8px; display: flex; gap: 12px; align-items: center; animation: slideIn 0.3s ease-out;`;
    item.innerHTML = `
        <i class="fas ${icon}" style="color: ${color};"></i>
        <div style="flex: 1;">
            <div style="font-size: 0.75rem; color: #fff; font-weight: 600;">${data.category} Event Detected</div>
            <div style="font-size: 0.65rem; color: var(--text-muted);">${data.message}</div>
        </div>
        <span style="font-size: 0.6rem; color: var(--text-muted); font-family: var(--font-data);">${data.time}</span>
    `;

    list.insertBefore(item, list.firstChild);
    if (list.children.length > 15) list.removeChild(list.lastChild);
}

function initFleetManager() {
    document.querySelectorAll('.close-modal').forEach(btn => btn.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show')));
}

function initFleetSearch() {
    document.getElementById('fleetSearch')?.addEventListener('input', (e) => renderFleetTable(allUsers.filter(u => u.username.toLowerCase().includes(e.target.value.toLowerCase()))));
}
