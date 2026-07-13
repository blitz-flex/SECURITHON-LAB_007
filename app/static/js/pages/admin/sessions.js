/* Admin — Session Management */
import { fetchWithAuth, showToast } from './shared.js';

export async function loadSessions() {
    const res = await fetchWithAuth('/api/v1/admin/sessions');
    if (!res.ok) return;
    const data = await res.json();

    // Update active sessions stats card on the fleet tab
    const activeSessionsEl = document.getElementById('stat-active-sessions');
    if (activeSessionsEl) activeSessionsEl.innerText = data.length;

    const list = document.getElementById('sessionList');
    if (!list) return;

    if (data.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.8rem;">No active sessions detected.</div>`;
        return;
    }

    list.innerHTML = data.map(s => `
        <div class="glass-panel" style="padding:15px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border-left:3px solid var(--primary);">
            <div>
                <div style="font-weight:700;color:#fff;font-size:0.9rem;display:flex;align-items:center;gap:8px;">
                    ${s.username} <span class="status-indicator online" style="width:6px;height:6px;"></span>
                </div>
                <div style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-data);margin-top:4px;">
                    <i class="fas fa-network-wired" style="margin-right:4px;opacity:0.5;"></i> ${s.ip}
                    <span style="margin:0 8px;opacity:0.2;">|</span>
                    <i class="fas fa-clock" style="margin-right:4px;opacity:0.5;"></i> ${s.last_active}
                </div>
                <div style="font-size:0.65rem;color:var(--primary);font-family:var(--font-data);margin-top:2px;font-weight:600;">${s.activity.toUpperCase()}</div>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-sm btn-secondary" onclick="kickSession(${s.id})" style="border-radius:6px;font-size:0.65rem;">KICK</button>
                <button class="btn btn-sm btn-danger" onclick="deleteOperative(${s.id})" style="border-radius:6px;font-size:0.65rem;padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`).join('');
}

export async function kickSession(uid) {
    if (!confirm('TERMINATE OPERATIVE SESSION?')) return;
    const res = await fetchWithAuth(`/api/v1/admin/sessions/${uid}/kick`, { method: 'POST' });
    if (res.ok) { showToast('SESSION_TERMINATED', 'warning'); loadSessions(); }
}

export async function kickAllSessions() {
    if (!confirm('EXECUTE EMERGENCY MASS DISCONNECT? This will terminate ALL active operative sessions!')) return;
    const res = await fetchWithAuth('/api/v1/admin/sessions/kick-all', { method: 'POST' });
    if (res.ok) { showToast('EMERGENCY_MASS_DISCONNECT_COMPLETE', 'error'); loadSessions(); }
}
