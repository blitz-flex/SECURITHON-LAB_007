/* Admin — Analytics, Infrastructure & Intelligence */
import { fetchWithAuth } from './shared.js';

let activityChart = null;
let localNodes = [];
let telemetryIntervals = {};

export async function loadAnalytics() {
    const res = await fetchWithAuth('/api/v1/admin/analytics');
    if (!res.ok) return;
    const data = await res.json();
    _updateTopStats(data.stats);
    _renderActivityChart(data.trends);
    const el = document.getElementById('stat-threat');
    if (el) {
        el.innerText = data.stats.threat_level || 'LOW';
        el.className = `value ${data.stats.threat_level === 'HIGH' ? 'text-danger' : 'text-success'}`;
    }
}

export async function loadIntelligence() {
    const res = await fetchWithAuth('/api/v1/admin/intelligence');
    if (!res.ok) return;
    const data = await res.json();
    const feed = document.getElementById('intelFeed');
    if (!feed) return;
    feed.innerHTML = data.map(i => `
        <div class="intel-item glass-panel" style="padding:15px;margin-bottom:15px;border-left:4px solid ${i.severity === 'CRITICAL' ? '#f85149' : '#d29922'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <strong style="color:#fff;font-family:var(--font-mono)">${i.id}</strong>
                <span class="badge" style="background:${i.severity === 'CRITICAL' ? 'rgba(248,81,73,0.1)' : 'rgba(210,153,34,0.1)'};color:${i.severity === 'CRITICAL' ? '#f85149' : '#d29922'}">${i.severity}</span>
            </div>
            <div style="font-size:0.85rem;color:#fff;">${i.title}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:5px;">Published: ${i.date}</div>
        </div>`).join('');
}

export async function loadInfrastructure() {
    const grid = document.getElementById('infraGrid');
    if (!grid) return;
    if (localNodes.length === 0) {
        const res = await fetchWithAuth('/api/v1/admin/infrastructure');
        if (!res.ok) { grid.innerHTML = `<div style="padding:20px;color:var(--danger);">Failed to load infrastructure.</div>`; return; }
        localNodes = await res.json();
        localNodes.forEach(n => { n.originalLoad = n.load; n.originalLatency = n.latency; n.isLockedDown = false; n.isRebooting = false; n.isMonitoring = false; });
    }
    _renderNodes();
}

function _updateTopStats(stats) {
    const map = {
        'stat-total-users': stats.total_users, 'stat-active-labs': stats.active_labs,
        'stat-uptime': stats.uptime, 'stat-health': stats.system_health + '%',
        'stat-sec-score': stats.security_score ? stats.security_score + '%' : 'N/A',
        'stat-net-in': stats.network_in || '0 MB/s', 'stat-net-out': (stats.network_out || '0 MB/s') + ' OUT',
        'stat-storage': stats.storage_used || '0%', 'stat-failed-logins': stats.failed_logins || 0,
        'stat-active-ops': stats.active_ops || 0,
    };
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
}

function _renderActivityChart(trends) {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;
    const data = {
        labels: trends.map(t => t.time),
        datasets: [
            { label: 'CPU LOAD (%)', data: trends.map(t => t.cpu), borderColor: '#58a6ff', tension: 0.4, pointRadius: 0 },
            { label: 'THREATS DETECTED', data: trends.map(t => t.threats), borderColor: '#f85149', tension: 0.4, pointRadius: 0 },
        ],
    };
    if (activityChart) { activityChart.data = data; activityChart.update('none'); return; }
    activityChart = new Chart(ctx, {
        type: 'line', data,
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top', align: 'end', labels: { color: '#8b949e', font: { size: 10, family: 'JetBrains Mono' }, boxWidth: 12 } } },
            scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b949e' } } },
        },
    });
}

function _renderNodes() {
    const grid = document.getElementById('infraGrid');
    if (!grid) return;
    const icons = { shield: 'fa-shield-virus', server: 'fa-server', database: 'fa-database', cloud: 'fa-cloud' };
    grid.innerHTML = localNodes.map(n => {
        const borderColor = n.isRebooting ? 'rgba(245,158,11,0.3)' : n.isLockedDown ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)';
        const statusColor = n.isRebooting ? 'var(--warning)' : n.isLockedDown ? 'var(--danger)' : 'var(--primary)';
        const statusText = n.isRebooting ? 'REBOOTING' : n.isLockedDown ? 'SECURED' : n.status;
        return `
        <div class="infra-node glass-panel glow-border" id="node-card-${n.id}" style="position:relative;border-color:${borderColor};transition:all 0.3s ease;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#fff;">
                    <i class="fas ${icons[n.type] || 'fa-microchip'}"></i>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.6rem;color:var(--text-muted);font-family:var(--font-data);text-transform:uppercase;">${n.region}</div>
                    <div style="font-size:0.75rem;color:${statusColor};font-weight:700;font-family:var(--font-data);">${statusText}</div>
                </div>
            </div>
            <div style="margin-bottom:15px;">
                <div style="font-weight:700;color:#fff;font-size:0.9rem;margin-bottom:2px;">${n.name}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-data);">UUID: ${n.id}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;">
                <div style="background:rgba(0,0,0,0.25);padding:8px;border-radius:6px;">
                    <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Latency</div>
                    <div style="font-size:0.8rem;color:#fff;font-family:var(--font-data);" id="node-latency-${n.id}">${n.latency}</div>
                </div>
                <div style="background:rgba(0,0,0,0.25);padding:8px;border-radius:6px;">
                    <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Uptime</div>
                    <div style="font-size:0.8rem;color:#fff;font-family:var(--font-data);">${n.uptime}</div>
                </div>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;">
                <div id="node-load-fill-${n.id}" style="width:${n.load}%;background:${n.load > 70 ? 'var(--danger)' : 'var(--primary)'};height:100%;transition:width 0.5s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-muted);margin-top:6px;font-family:var(--font-data);">
                <span>NODE_LOAD</span><span id="node-load-text-${n.id}">${n.load}%</span>
            </div>
            <div class="node-controls">
                <button class="btn-control ${n.isRebooting ? 'active' : ''}" onclick="restartNode('${n.id}')" ${n.isRebooting ? 'disabled' : ''}><i class="fas ${n.isRebooting ? 'fa-spinner fa-spin' : 'fa-redo'}"></i> Reboot</button>
                <button class="btn-control danger-zone ${n.isLockedDown ? 'active' : ''}" onclick="toggleLockdown('${n.id}')" ${n.isRebooting ? 'disabled' : ''}><i class="fas ${n.isLockedDown ? 'fa-shield-alt' : 'fa-ban'}"></i> ${n.isLockedDown ? 'Secure' : 'Restrict'}</button>
                <button class="btn-control ${n.isMonitoring ? 'active' : ''}" onclick="toggleMonitor('${n.id}')"><i class="fas fa-desktop"></i> Monitor</button>
            </div>
            <div class="node-console" id="node-console-${n.id}" style="${n.isMonitoring ? 'display:block;' : ''}"></div>
        </div>`;
    }).join('');
}

export function restartNode(nodeId) {
    const node = localNodes.find(n => n.id === nodeId);
    if (!node || node.isRebooting) return;
    node.isRebooting = true; node.load = 0; node.latency = 'N/A';
    _renderNodes();
    setTimeout(() => {
        node.isRebooting = false;
        node.load = Math.floor(Math.random() * 15) + 5;
        node.latency = (Math.floor(Math.random() * 12) + 5) + 'ms';
        node.status = 'UP';
        _renderNodes();
    }, 2000);
}

export function toggleLockdown(nodeId) {
    const node = localNodes.find(n => n.id === nodeId);
    if (!node || node.isRebooting) return;
    node.isLockedDown = !node.isLockedDown;
    if (node.isLockedDown) { node.load = Math.floor(node.load * 0.4); }
    else { node.load = node.originalLoad; node.latency = node.originalLatency; }
    _renderNodes();
}

export function toggleMonitor(nodeId) {
    const node = localNodes.find(n => n.id === nodeId);
    if (!node) return;
    node.isMonitoring = !node.isMonitoring;
    if (!node.isMonitoring && telemetryIntervals[nodeId]) {
        clearInterval(telemetryIntervals[nodeId]);
        delete telemetryIntervals[nodeId];
    }
    _renderNodes();
}
