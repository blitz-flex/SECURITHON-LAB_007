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
        list.innerHTML = `<div class="sessions-empty"><i class="fas fa-satellite-dish"></i><span>No active sessions<br>detected</span></div>`;
        return;
    }

    list.innerHTML = data.map(s => {
        const initial = (s.username[0] || '?').toUpperCase();
        return `
        <div class="session-card">
            <div class="session-avatar">
                ${initial}
                <div class="session-pulse"></div>
            </div>
            <div class="session-info">
                <div class="session-username">${s.username}</div>
                <div class="session-meta">
                    <span class="session-ip-link" onclick="openSessionGeoModal(${s.id})">
                        <i class="fas fa-network-wired"></i>${s.ip}
                    </span>
                    <span style="opacity:0.2;">·</span>
                    <span><i class="fas fa-clock"></i>${s.last_active}</span>
                </div>
                <div class="session-activity">${s.activity.toUpperCase()}</div>
            </div>
            <button class="session-kick-btn" onclick="kickSession(${s.id})">KICK</button>
        </div>`;
    }).join('');
}

export function openSessionGeoModal(user_id) {
    const session = currentSessionsData.find(s => s.id === user_id);
    if (!session) return;

    document.getElementById('geoModalUser').innerText = session.username.toUpperCase();
    document.getElementById('geoModalIP').innerText = session.ip || '127.0.0.1';
    
    const ip = session.ip || '';
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        document.getElementById('geoModalLoc').innerText = "Tbilisi, Georgia (GE - Local Network)";
    } else {
        document.getElementById('geoModalLoc').innerText = "Tbilisi, Georgia (GE)";
    }

    const ua = session.user_agent || "";
    let os = "Linux / Web Workstation";
    if (ua.includes("Windows NT 10")) os = "Windows 10/11 x64";
    else if (ua.includes("Windows NT")) os = "Windows OS";
    else if (ua.includes("Macintosh") || ua.includes("Mac OS")) os = "macOS (Apple Silicon/Intel)";
    else if (ua.includes("Android")) os = "Android OS";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS (Apple)";
    else if (ua.includes("Linux")) os = "Linux x86_64";

    let browser = "Chrome 125.0";
    const chromeMatch = ua.match(/Chrome\/([0-9\.]+)/);
    const firefoxMatch = ua.match(/Firefox\/([0-9\.]+)/);
    const safariMatch = ua.match(/Version\/([0-9\.]+).*Safari/);
    const edgeMatch = ua.match(/Edg\/([0-9\.]+)/);

    if (edgeMatch) browser = `Edge ${edgeMatch[1].split('.')[0]}`;
    else if (chromeMatch) browser = `Chrome ${chromeMatch[1].split('.')[0]}`;
    else if (firefoxMatch) browser = `Firefox ${firefoxMatch[1].split('.')[0]}`;
    else if (safariMatch) browser = `Safari ${safariMatch[1].split('.')[0]}`;

    document.getElementById('geoModalOS').innerText = os;
    document.getElementById('geoModalBrowser').innerText = browser;
    document.getElementById('geoModalLastActive').innerText = `${session.last_active} (Online Now)`;

    const kickBtn = document.getElementById('geoModalKickBtn');
    if (kickBtn) {
        kickBtn.style.display = 'block';
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

