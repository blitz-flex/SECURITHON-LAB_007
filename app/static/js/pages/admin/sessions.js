/* Admin — Session Management */
import { fetchWithAuth, showToast } from './shared.js';

let currentSessionsData = [];

export async function loadSessions() {
    const res = await fetchWithAuth('/api/v1/admin/sessions');
    if (!res.ok) return;
    const data = await res.json();
    currentSessionsData = data;

    // Update active sessions stats card on the fleet tab
    const activeSessionsEl = document.getElementById('stat-active-sessions');
    if (activeSessionsEl) activeSessionsEl.innerText = data.length;

    const list = document.getElementById('sessionList');
    if (!list) return;

    if (data.length === 0) {
        list.innerHTML = `<div class="fleet-empty"><i class="fas fa-satellite-dish"></i>No active sessions detected.</div>`;
        return;
    }

    list.innerHTML = data.map(s => `
        <div class="session-card">
            <div style="min-width:0;flex:1;">
                <div class="session-username">
                    ${s.username}
                    <span class="status-indicator online" style="width:6px;height:6px;"></span>
                </div>
                <div class="session-meta">
                    <span class="session-ip-link" onclick="openSessionGeoModal(${s.id})">
                        <i class="fas fa-network-wired"></i> ${s.ip}
                    </span>
                    <span style="opacity:0.2;">·</span>
                    <span><i class="fas fa-clock"></i> ${s.last_active}</span>
                </div>
                <div class="session-activity">${s.activity.toUpperCase()}</div>
            </div>
            <div class="session-actions">
                <button class="btn btn-sm btn-secondary" onclick="kickSession(${s.id})"
                    style="font-size:0.65rem;padding:4px 10px;">KICK</button>
                <button class="btn btn-sm btn-danger" onclick="deleteOperative(${s.id})"
                    style="font-size:0.65rem;padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`).join('');
}

export function openSessionGeoModal(user_id) {
    const session = currentSessionsData.find(s => s.id === user_id);
    if (!session) return;

    document.getElementById('geoModalUser').innerText = session.username.toUpperCase();
    document.getElementById('geoModalIP').innerText = session.ip;
    
    // Simulating rich GeoIP lookup
    const mockGeoLocations = ["Tbilisi, Georgia", "Frankfurt, Germany", "London, UK", "Ashburn, VA (USA)", "Amsterdam, Netherlands"];
    const locIndex = session.id % mockGeoLocations.length;
    document.getElementById('geoModalLoc').innerText = mockGeoLocations[locIndex];
    document.getElementById('geoModalLastActive').innerText = session.last_active;

    const kickBtn = document.getElementById('geoModalKickBtn');
    if (kickBtn) {
        kickBtn.onclick = () => {
            document.getElementById('sessionGeoModal')?.classList.remove('show');
            kickSession(session.id);
        };
    }

    document.getElementById('sessionGeoModal')?.classList.add('show');
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

