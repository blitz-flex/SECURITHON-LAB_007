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

    // 1. Update Stat Counters
    if (data.summary) {
        const eventsEl = document.getElementById('intelStatEvents');
        const solvedEl = document.getElementById('intelStatSolved');
        const opsEl    = document.getElementById('intelStatOps');
        const threatEl = document.getElementById('intelStatThreat');

        if (eventsEl) eventsEl.textContent = data.summary.total_events || 0;
        if (solvedEl) solvedEl.textContent = data.summary.total_solved || 0;
        if (opsEl) opsEl.textContent       = data.summary.active_operatives || 0;
        if (threatEl) {
            threatEl.textContent = data.summary.threat_level || 'NORMAL';
            threatEl.style.color = data.summary.threat_level === 'ELEVATED' ? '#ef4444' : '#10b981';
        }
    }

    // 2. Render Live Security Audit Feed (premium cards)
    const auditFeed = document.getElementById('intelAuditFeed');
    if (auditFeed && Array.isArray(data.events)) {
        if (data.events.length === 0) {
            auditFeed.innerHTML = `<div class="intel-empty"><i class="fas fa-satellite-dish"></i>No real-time security events recorded.</div>`;
        } else {
            auditFeed.innerHTML = data.events.map(ev => {
                const isSolved  = ev.status && ev.status.includes('SOLVED');
                const color     = isSolved ? '#10b981' : '#ef4444';
                const bgColor   = isSolved ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
                const borderClr = isSolved ? 'rgba(16,185,129,0.3)'  : 'rgba(239,68,68,0.3)';
                const icon      = isSolved ? 'fa-check-circle'        : 'fa-terminal';
                return `
                <div class="audit-event" style="--ev-color:${color};--ev-bg:${bgColor};--ev-border:${borderClr};">
                    <div class="ae-icon"><i class="fas ${icon}"></i></div>
                    <div class="ae-main">
                        <div class="ae-who">
                            Operative <span style="color:#60a5fa;">${ev.user}</span>
                            &nbsp;·&nbsp; <span style="color:#6ee7b7;font-family:var(--font-data);">${ev.challenge_id}</span>
                        </div>
                        <div class="ae-meta">${ev.id} &bull; IP: ${ev.ip} &bull; ${ev.date}</div>
                    </div>
                    <span class="ae-badge">${ev.status}</span>
                </div>`;
            }).join('');
        }
    }
    // 3. Render System Vulnerability Threat Catalog (premium cards)
    const vulnFeed = document.getElementById('intelVulnFeed');
    if (vulnFeed && Array.isArray(data.vulnerabilities)) {
        if (data.vulnerabilities.length === 0) {
            vulnFeed.innerHTML = `<div class="intel-empty"><i class="fas fa-bug"></i>No threat vectors detected.</div>`;
        } else {
            vulnFeed.innerHTML = data.vulnerabilities.map(v => {
                const isCrit   = v.severity === 'CRITICAL';
                const color    = isCrit ? '#ef4444' : '#f59e0b';
                const bgColor  = isCrit ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';
                const bdColor  = isCrit ? 'rgba(239,68,68,0.3)'  : 'rgba(245,158,11,0.3)';
                return `
                <div class="vuln-card" style="--vc:${color};">
                    <div class="vuln-card-top">
                        <span class="vuln-id">${v.id}</span>
                        <div class="vuln-badges">
                            <span class="vuln-badge" style="background:${bgColor};color:${color};border-color:${bdColor};">CVSS&nbsp;${v.cvss}</span>
                            <span class="vuln-badge" style="background:rgba(59,130,246,0.12);color:#60a5fa;border-color:rgba(59,130,246,0.3);">${v.category}</span>
                        </div>
                    </div>
                    <div class="vuln-title">${v.title}</div>
                    <div class="vuln-footer">
                        <span>STATUS: <strong style="color:#10b981;">${v.status}</strong></span>
                        <span>RISK: <strong style="color:${color};">${v.severity}</strong></span>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // 4. Render Student Friction & Bottleneck Heatmap
    const frictionContainer = document.getElementById('frictionHeatmapContainer');
    if (frictionContainer && Array.isArray(data.friction)) {
        const catFilter = document.getElementById('frictionCategoryFilter')?.value || 'ALL';
        const filteredFriction = catFilter === 'ALL'
            ? data.friction
            : data.friction.filter(f => f.category === catFilter);

        if (filteredFriction.length === 0) {
            frictionContainer.innerHTML = `<div class="intel-empty"><i class="fas fa-filter"></i>No friction data found for selected category.</div>`;
        } else {
            frictionContainer.innerHTML = filteredFriction.map(f => {
                const color = f.friction_score >= 70 ? '#ef4444' : f.friction_score >= 50 ? '#f59e0b' : '#10b981';
                const bg = f.friction_score >= 70 ? 'rgba(239,68,68,0.1)' : f.friction_score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)';
                return `
                <div style="background: rgba(12,16,26,0.6); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid ${color}; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; transition: transform 0.2s, background 0.2s;" onmouseenter="this.style.background='rgba(18,24,38,0.85)'" onmouseleave="this.style.background='rgba(12,16,26,0.6)'">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                        <div style="font-weight:700; color:#fff; font-size:0.82rem; display:flex; align-items:center; gap:8px;">
                            ${f.title}
                        </div>
                        <span class="badge" style="background:${bg}; color:${color}; border:1px solid ${color}40; font-size:0.6rem; font-family:var(--font-data); font-weight:700;">
                            FRICTION: ${f.friction_score}% &bull; ${f.friction_level}
                        </span>
                    </div>

                    <!-- Visual Progress Friction Meter Bar -->
                    <div style="height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden; margin-bottom:8px;">
                        <div style="width:${f.friction_score}%; background:${color}; height:100%; transition:width 0.4s ease;"></div>
                    </div>

                    <div style="display:flex; justify-content:space-between; font-size:0.64rem; color:#9ca3af; font-family:var(--font-data); margin-bottom: 8px;">
                        <span>Category: <strong style="color:#e2e8f0;">${f.category}</strong></span>
                        <span>Attempts: <strong style="color:#f59e0b;">${f.attempts}</strong></span>
                        <span>Solves: <strong style="color:#10b981;">${f.solves}</strong></span>
                        <span>Avg Time: <strong style="color:#60a5fa;">~${f.avg_time_mins}m</strong></span>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:rgba(0,0,0,0.3); padding:6px 10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.08);">
                        <div style="font-size:0.65rem; color:#cbd5e1; flex:1;">
                            <i class="fas fa-exclamation-triangle" style="color:${color}; margin-right:4px;"></i>
                            <strong>Bottleneck Cause:</strong> ${f.common_bottleneck}
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="window.interveneOnChallenge?.('${f.challenge_id}', '${f.title}')" style="font-size:0.6rem; padding:3px 8px; border-radius:5px; white-space:nowrap; background:rgba(0,229,155,0.12); color:#00e59b; border:1px solid rgba(0,229,155,0.3);">
                            <i class="fas fa-user-shield"></i> Intervene
                        </button>
                    </div>
                </div>`;
            }).join('');
        }

        // Setup filter change handler if not already attached
        const filterSelect = document.getElementById('frictionCategoryFilter');
        if (filterSelect && !filterSelect.dataset.listenerAttached) {
            filterSelect.dataset.listenerAttached = 'true';
            filterSelect.addEventListener('change', () => loadIntelligence());
        }
    }

    // 5. Render Live Session Replay & Command Inspector
    const replaySelector = document.getElementById('sessionReplaySelector');
    if (replaySelector && Array.isArray(data.replays)) {
        const selectedVal = replaySelector.value;
        replaySelector.innerHTML = data.replays.map(r => `
            <option value="${r.session_id}">${r.student_username} (${r.full_name}) — Lab: ${r.challenge_title}</option>
        `).join('');

        if (selectedVal && data.replays.some(r => r.session_id === selectedVal)) {
            replaySelector.value = selectedVal;
        }

        const renderActiveReplay = () => {
            const sid = replaySelector.value;
            const session = data.replays.find(r => r.session_id === sid) || data.replays[0];
            if (!session) return;

            document.getElementById('replayStudentName').textContent = session.student_username;
            document.getElementById('replayLabTitle').textContent = session.challenge_title;
            document.getElementById('replayAttemptCount').textContent = session.attempts_count;

            const termBox = document.getElementById('replayTerminalBox');
            if (termBox && session.command_stream) {
                termBox.innerHTML = session.command_stream.map(step => {
                    if (step.type === 'input') {
                        return `<div style="color:#00e59b; margin-bottom: 4px;"><span style="color:#60a5fa;">[${step.time}]</span> <span style="color:#f59e0b;">student@attackbox:~$</span> ${escapeHtml(step.cmd)}</div>`;
                    } else if (step.type === 'success') {
                        return `<div style="color:#10b981; font-weight:700; background:rgba(16,185,129,0.1); padding:4px 8px; border-radius:4px; margin-bottom: 6px;"><i class="fas fa-check-circle"></i> [${step.time}] ${escapeHtml(step.cmd)}</div>`;
                    } else {
                        return `<div style="color:#94a3b8; margin-bottom: 4px; padding-left: 12px; border-left: 2px solid rgba(255,255,255,0.1);"><span style="color:#64748b;">[${step.time}]</span> ${escapeHtml(step.cmd)}</div>`;
                    }
                }).join('');
                termBox.scrollTop = termBox.scrollHeight;
            }
        };

        renderActiveReplay();
        if (!replaySelector.dataset.listenerAttached) {
            replaySelector.dataset.listenerAttached = 'true';
            replaySelector.addEventListener('change', renderActiveReplay);
        }
    }
}

// Global action helpers for interactive UX
window.sendMentorHintToStudent = function() {
    const student = document.getElementById('replayStudentName')?.textContent || 'Student';
    const hint = prompt(`Enter live mentor hint/guidance to push directly to ${student}'s terminal:`);
    if (hint && hint.trim()) {
        const termBox = document.getElementById('replayTerminalBox');
        if (termBox) {
            const time = new Date().toLocaleTimeString([], { hour12: false });
            termBox.innerHTML += `<div style="color:#3b82f6; font-weight:700; background:rgba(59,130,246,0.12); padding:5px 8px; border-radius:4px; margin-top:6px; border:1px solid rgba(59,130,246,0.3);"><i class="fas fa-paper-plane"></i> [${time}] MENTOR_BROADCAST: ${escapeHtml(hint)}</div>`;
            termBox.scrollTop = termBox.scrollHeight;
        }
    }
};

window.clearReplayTerminal = function() {
    const termBox = document.getElementById('replayTerminalBox');
    if (termBox) {
        termBox.innerHTML = `<div style="color:#64748b; text-align:center; padding:20px;"><i class="fas fa-terminal"></i> Replay log cleared. Refresh stream to re-sync.</div>`;
    }
};

window.interveneOnChallenge = function(cid, title) {
    alert(`AUTOMATED INTERVENTION: Triggering automated guidance & unlock protocol for lab '${title}' (${cid}).`);
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
