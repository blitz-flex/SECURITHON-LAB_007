/* Admin — System Settings, Audit Logs, Telemetry */
import { fetchWithAuth, showToast } from './shared.js';

export async function loadAuditLogs() {
    const res = await fetchWithAuth('/api/v1/admin/audit-logs');
    if (!res.ok) return;
    const logs = await res.json();
    const list = document.getElementById('auditLogList');
    if (!list) return;
    list.innerHTML = logs.map(l =>
        `<div class="audit-item" style="font-size:0.75rem;margin-bottom:8px;font-family:var(--font-mono)">
            <span style="color:var(--text-muted)">${l.time}</span>
            <span style="color:var(--primary-app)">[${l.action}]</span> ${l.detail}
        </div>`
    ).join('');
}

export async function initSettingsManager() {
    const res = await fetchWithAuth('/api/v1/admin/settings');
    if (res.ok) {
        const config = await res.json();
        const maintenance = document.getElementById('config-maintenance');
        const registration = document.getElementById('config-registration');
        const announcement = document.getElementById('config-announcement');
        if (maintenance) maintenance.checked = config.maintenance_mode;
        if (registration) registration.checked = config.allow_registration;
        if (announcement) announcement.value = config.global_announcement;
        syncMaintenanceUI();
    }

    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        const payload = {
            maintenance_mode: document.getElementById('config-maintenance')?.checked,
            allow_registration: document.getElementById('config-registration')?.checked,
            global_announcement: document.getElementById('config-announcement')?.value,
        };
        const r = await fetchWithAuth('/api/v1/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (r.ok) { showToast('SETTINGS_COMMIT_SUCCESS', 'success'); syncMaintenanceUI(); }
    });
}

export function syncMaintenanceUI() {
    const isM = document.getElementById('config-maintenance')?.checked;
    const status = document.getElementById('sidebar-status-text');
    if (status) {
        status.innerText = isM ? 'LOCK_ACTIVE' : 'CORE_STABLE';
        status.className = isM ? 'status-text text-danger' : 'status-text text-success';
    }
}

export function initActionButtons() {
    document.getElementById('btn-db-check')?.addEventListener('click', async () => {
        showToast('INTEGRITY_SCAN_INITIATED', 'warning');
        const res = await fetchWithAuth('/api/v1/admin/db-check', { method: 'POST' });
        if (res.ok) { const d = await res.json(); showToast(d.message, 'success'); }
    });

    document.getElementById('btn-reset')?.addEventListener('click', async () => {
        if (!confirm('CONFIRM EMERGENCY CORE RESET?')) return;
        showToast('EMERGENCY_RESTART_INITIATED', 'error');
        await fetchWithAuth('/api/v1/admin/emergency-reset', { method: 'POST' });
        showToast('CORE_ONLINE', 'success');
    });
}

export function initTelemetry() {
    const update = async () => {
        const res = await fetchWithAuth('/api/v1/system/stats');
        if (!res.ok) return;
        const d = await res.json();
        const cpuFill = document.querySelector('.cpu-fill');
        const memFill = document.querySelector('.mem-fill');
        if (cpuFill) { cpuFill.style.width = d.cpu + '%'; document.querySelector('.cpu-text').innerText = d.cpu.toFixed(1) + '%'; }
        if (memFill) { memFill.style.width = d.memory + '%'; document.querySelector('.mem-text').innerText = d.memory.toFixed(1) + '%'; }
    };
    setInterval(update, 3000);
    update();
}

export function initLogFeed() {
    const list = document.getElementById('securityAlertsList');
    if (!list) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws, reconnectTimeout = null;

    function connect() {
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
        ws.onmessage = (e) => { try { addSecurityAlert(JSON.parse(e.data)); } catch {} };
        ws.onclose = () => { reconnectTimeout = setTimeout(connect, 3000); };
        ws.onerror = () => ws.close();
    }
    connect();
}

function addSecurityAlert(data) {
    const list = document.getElementById('securityAlertsList');
    if (!list) return;
    const isCritical = data.message.toLowerCase().includes('unauthorized') || data.message.toLowerCase().includes('failed');
    const color = isCritical ? 'var(--danger)' : 'var(--secondary)';
    const item = document.createElement('div');
    item.className = 'alert-item';
    item.style.cssText = `background:${isCritical ? 'rgba(239,68,68,0.05)' : 'rgba(59,130,246,0.05)'};border:1px solid ${isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)'};padding:12px;border-radius:8px;display:flex;gap:12px;align-items:center;animation:slideIn 0.3s ease-out;`;
    item.innerHTML = `
        <i class="fas ${isCritical ? 'fa-exclamation-triangle' : 'fa-info-circle'}" style="color:${color};"></i>
        <div style="flex:1;">
            <div style="font-size:0.75rem;color:#fff;font-weight:600;">${data.category} Event Detected</div>
            <div style="font-size:0.65rem;color:var(--text-muted);">${data.message}</div>
        </div>
        <span style="font-size:0.6rem;color:var(--text-muted);font-family:var(--font-data);">${data.time}</span>`;
    list.insertBefore(item, list.firstChild);
    if (list.children.length > 15) list.removeChild(list.lastChild);
}
