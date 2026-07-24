import { fetchWithAuth, showToast } from './shared.js';

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

    // 2. Render Live Security Audit Feed
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

    // 3. Render System Vulnerability Threat Catalog
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

export async function loadAiMentorAnalytics() {
    const res = await fetchWithAuth('/api/v1/admin/ai-analytics');
    if (!res.ok) return;
    const data = await res.json();

    if (data.stats) {
        const pEl = document.getElementById('ai-stat-total-prompts');
        const tEl = document.getElementById('ai-stat-tokens');
        const rEl = document.getElementById('ai-stat-avg-time');
        const hEl = document.getElementById('ai-stat-helpfulness');

        if (pEl) pEl.innerText = data.stats.total_prompts.toLocaleString();
        if (tEl) tEl.innerText = data.stats.tokens_consumed;
        if (rEl) rEl.innerText = data.stats.avg_response_time;
        if (hEl) hEl.innerText = data.stats.helpfulness_score;
    }

    const tableBody = document.getElementById('aiQueryFeedBody');
    if (tableBody && Array.isArray(data.queries)) {
        if (data.queries.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:30px; font-size:0.75rem;"><i class="fas fa-robot" style="margin-right:8px; opacity:0.5;"></i>No AI Mentor interactions recorded in database yet.</td></tr>`;
        } else {
            tableBody.innerHTML = data.queries.map(q => `
                <tr>
                    <td style="font-weight:700; color:#fff;">${q.student}</td>
                    <td><span class="q-category-tag" style="background:rgba(59,130,246,0.12); color:#60a5fa; border:1px solid rgba(59,130,246,0.25);">${q.category}</span></td>
                    <td style="color:var(--text-muted);">${q.prompt}</td>
                    <td style="font-family:var(--font-data); color:var(--text-muted); font-size:0.72rem;">${q.time}</td>
                </tr>
            `).join('');
        }
    }

    const topicContainer = document.getElementById('aiTopicContainer');
    if (topicContainer && Array.isArray(data.topics)) {
        const colors = ['#3b82f6', '#a855f7', '#00e59b', '#f59e0b'];
        topicContainer.innerHTML = data.topics.map((t, idx) => {
            const color = colors[idx % colors.length];
            return `
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:#fff; margin-bottom:4px; font-family:var(--font-ui);">
                    <span>${t.name}</span>
                    <span style="color:${color}; font-family:var(--font-data);">${t.percent}%</span>
                </div>
                <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
                    <div style="width:${t.percent}%; height:100%; background:${color}; border-radius:4px; transition:width 0.6s ease;"></div>
                </div>
            </div>`;
        }).join('');
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
        const borderColor = n.isRebooting ? 'rgba(245,158,11,0.35)' : n.isLockedDown ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.06)';
        const statusColor = n.isRebooting ? '#f59e0b' : n.isLockedDown ? '#ef4444' : '#00e59b';
        const statusText = n.isRebooting ? 'REBOOTING' : n.isLockedDown ? 'SECURED' : n.status;
        return `
        <div class="infra-node glass-panel glow-border" id="node-card-${n.id}" style="position:relative;border-radius:14px;border-color:${borderColor};background:rgba(15,15,17,0.65);backdrop-filter:blur(12px);padding:18px;transition:all 0.3s ease;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div style="width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:1rem;color:var(--primary);">
                    <i class="fas ${icons[n.type] || 'fa-microchip'}"></i>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.6rem;color:var(--text-muted);font-family:var(--font-data);text-transform:uppercase;letter-spacing:0.5px;">${n.region}</div>
                    <div style="font-size:0.72rem;color:${statusColor};font-weight:800;font-family:var(--font-data);letter-spacing:0.5px;margin-top:2px;">${statusText}</div>
                </div>
            </div>
            <div style="margin-bottom:14px;">
                <div style="font-weight:800;color:#fff;font-size:0.92rem;font-family:var(--font-ui);margin-bottom:2px;">${n.name}</div>
                <div style="font-size:0.62rem;color:var(--text-muted);font-family:var(--font-data);letter-spacing:0.5px;">UUID: ${n.id}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
                <div style="background:rgba(0,0,0,0.3);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.03);">
                    <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;font-family:var(--font-data);">Latency</div>
                    <div style="font-size:0.82rem;color:#fff;font-family:var(--font-data);font-weight:700;margin-top:2px;" id="node-latency-${n.id}">${n.latency}</div>
                </div>
                <div style="background:rgba(0,0,0,0.3);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.03);">
                    <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;font-family:var(--font-data);">Uptime</div>
                    <div style="font-size:0.82rem;color:#fff;font-family:var(--font-data);font-weight:700;margin-top:2px;">${n.uptime}</div>
                </div>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">
                <div id="node-load-fill-${n.id}" style="width:${n.load}%;background:${n.load > 70 ? '#ef4444' : '#00e59b'};height:100%;transition:width 0.5s ease;box-shadow:0 0 6px ${n.load > 70 ? '#ef4444' : '#00e59b'};"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-muted);margin-top:6px;font-family:var(--font-data);font-weight:600;">
                <span>LOAD</span><span id="node-load-text-${n.id}">${n.load}%</span>
            </div>
            <div class="node-controls" style="margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
                <button class="btn-control ${n.isRebooting ? 'active' : ''}" onclick="restartNode('${n.id}')" ${n.isRebooting ? 'disabled' : ''} style="font-size:0.65rem;padding:5px 0;"><i class="fas ${n.isRebooting ? 'fa-spinner fa-spin' : 'fa-redo'}"></i> Reboot</button>
                <button class="btn-control danger-zone ${n.isLockedDown ? 'active' : ''}" onclick="toggleLockdown('${n.id}')" ${n.isRebooting ? 'disabled' : ''} style="font-size:0.65rem;padding:5px 0;"><i class="fas ${n.isLockedDown ? 'fa-shield-alt' : 'fa-ban'}"></i> ${n.isLockedDown ? 'Secure' : 'Restrict'}</button>
                <button class="btn-control ${n.isMonitoring ? 'active' : ''}" onclick="toggleMonitor('${n.id}')" style="font-size:0.65rem;padding:5px 0;"><i class="fas fa-desktop"></i> Monitor</button>
            </div>
            <div class="node-console" id="node-console-${n.id}" style="${n.isMonitoring ? 'display:block;margin-top:10px;padding:8px 10px;background:rgba(0,0,0,0.5);border:1px solid rgba(0,229,155,0.2);border-radius:8px;font-family:var(--font-data);font-size:0.62rem;color:#00e59b;max-height:80px;overflow-y:auto;line-height:1.5;' : 'display:none;'}"></div>
        </div>`;
    }).join('');

    // Re-attach active telemetry console targets
    localNodes.forEach(n => {
        if (n.isMonitoring && !telemetryIntervals[n.id]) {
            _startTelemetryStream(n.id);
        }
    });
}

export function restartNode(nodeId) {
    const node = localNodes.find(n => n.id === nodeId);
    if (!node || node.isRebooting) return;
    node.isRebooting = true;
    node.load = 0;
    node.latency = 'N/A';
    _renderNodes();
    _appendInfraLog('NODE_REBOOT_INIT', node.name, `Initiated hard reboot sequence on ${nodeId}`, 'WARNING');
    showToast(`REBOOTING_NODE_${nodeId}`, 'warning');
    setTimeout(() => {
        node.isRebooting = false;
        node.load = Math.floor(Math.random() * 15) + 5;
        node.latency = (Math.floor(Math.random() * 12) + 5) + 'ms';
        node.status = 'UP';
        _renderNodes();
        _appendInfraLog('NODE_REBOOT_DONE', node.name, `Node re-established operational state`, 'SUCCESS');
        showToast(`NODE_${nodeId}_ONLINE`, 'success');
    }, 2000);
}

export function toggleLockdown(nodeId) {
    const node = localNodes.find(n => n.id === nodeId);
    if (!node || node.isRebooting) return;
    node.isLockedDown = !node.isLockedDown;
    if (node.isLockedDown) {
        node.load = Math.floor(node.load * 0.4);
        _appendInfraLog('SECURITY_RESTRICT', node.name, `Enforced strict traffic restriction policy`, 'WARNING');
        showToast(`NODE_${nodeId}_RESTRICTED`, 'warning');
    } else {
        node.load = node.originalLoad || 30;
        node.latency = node.originalLatency || '20ms';
        _appendInfraLog('SECURITY_NORMAL', node.name, `Restored standard network throughput`, 'SUCCESS');
        showToast(`NODE_${nodeId}_SECURED_NORMAL`, 'success');
    }
    _renderNodes();
}

export function toggleMonitor(nodeId) {
    const node = localNodes.find(n => n.id === nodeId);
    if (!node) return;
    node.isMonitoring = !node.isMonitoring;
    
    if (node.isMonitoring) {
        _renderNodes();
        _startTelemetryStream(nodeId);
        showToast(`MONITORING_STARTED_${nodeId}`, 'info');
    } else {
        if (telemetryIntervals[nodeId]) {
            clearInterval(telemetryIntervals[nodeId]);
            delete telemetryIntervals[nodeId];
        }
        _renderNodes();
        showToast(`MONITORING_STOPPED_${nodeId}`, 'info');
    }
}

function _startTelemetryStream(nodeId) {
    const consoleEl = document.getElementById(`node-console-${nodeId}`);
    if (!consoleEl) return;

    if (telemetryIntervals[nodeId]) clearInterval(telemetryIntervals[nodeId]);

    consoleEl.innerHTML = `<div><span style="color:var(--text-muted);">[SYS]</span> Telemetry stream active for node ${nodeId}...</div>`;

    telemetryIntervals[nodeId] = setInterval(() => {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        const cpu = Math.floor(Math.random() * 35) + 12;
        const mem = Math.floor(Math.random() * 25) + 42;
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:var(--text-muted);">[${time}]</span> CPU: ${cpu}% | MEM: ${mem}% | NET: PASS`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }, 1500);
}

function _appendInfraLog(event, nodeName, details, statusType) {
    const logBody = document.getElementById('infraLogBody');
    if (!logBody) return;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const badgeBg = statusType === 'SUCCESS' ? 'rgba(0,229,155,0.12)' : 'rgba(245,158,11,0.12)';
    const badgeColor = statusType === 'SUCCESS' ? '#00e59b' : '#f59e0b';
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><span class="badge" style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeColor}40; font-family:var(--font-data); font-size:0.65rem; padding:2px 7px; border-radius:4px;">${event}</span></td>
        <td style="font-family:var(--font-data); font-weight:700; color:#fff;">${nodeName}</td>
        <td style="color:var(--text-muted);">${details}</td>
        <td style="font-family:var(--font-data); color:var(--text-muted); font-size:0.72rem;">${time}</td>
        <td style="font-family:var(--font-data); color:${badgeColor}; font-weight:700; font-size:0.72rem;"><i class="fas ${statusType === 'SUCCESS' ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="margin-right:4px;"></i> ${statusType}</td>
    `;
    logBody.insertBefore(tr, logBody.firstChild);
}

export function syncAllInfraNodes() {
    showToast('SYNCHRONIZING_ALL_CLUSTER_NODES...', 'info');
    const syncBtn = document.getElementById('btn-sync-all-nodes');
    if (syncBtn) {
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        syncBtn.style.opacity = '0.7';
    }
    setTimeout(() => {
        localNodes.forEach(n => {
            if (!n.isRebooting && !n.isLockedDown) {
                n.load = Math.floor(Math.random() * 25) + 15;
                n.latency = (Math.floor(Math.random() * 15) + 12) + 'ms';
            }
        });
        _renderNodes();
        _appendInfraLog('CLUSTER_SYNC', 'ALL_NODES', 'Cluster-wide state & routing table synchronized', 'SUCCESS');
        const updatedSyncBtn = document.getElementById('btn-sync-all-nodes');
        if (updatedSyncBtn) {
            updatedSyncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Nodes';
            updatedSyncBtn.style.opacity = '1';
        }
        showToast('NODES_SYNCHRONIZED', 'success');
    }, 1000);
}

export function restartLoadBalancer() {
    showToast('RESTARTING_LOAD_BALANCER...', 'warning');
    const lbBtn = document.getElementById('btn-restart-load-balancer');
    const avgLatencyEl = document.getElementById('infra-avg-latency');
    if (lbBtn) {
        lbBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting LB...';
        lbBtn.style.opacity = '0.7';
    }
    if (avgLatencyEl) {
        avgLatencyEl.innerText = '99ms';
        avgLatencyEl.style.color = '#ef4444';
    }
    setTimeout(() => {
        const currentAvgLatencyEl = document.getElementById('infra-avg-latency');
        if (currentAvgLatencyEl) {
            currentAvgLatencyEl.innerText = (Math.floor(Math.random() * 8) + 15) + 'ms';
            currentAvgLatencyEl.style.color = '#fff';
        }
        _appendInfraLog('LB_RESTART', 'INGRESS_GATEWAY', 'HAProxy / NGINX Load Balancer reloaded with zero downtime', 'SUCCESS');
        const updatedLbBtn = document.getElementById('btn-restart-load-balancer');
        if (updatedLbBtn) {
            updatedLbBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Restart LB';
            updatedLbBtn.style.opacity = '1';
        }
        showToast('LOAD_BALANCER_RESTARTED', 'success');
    }, 1200);
}

if (typeof window !== 'undefined') {
    window.syncAllInfraNodes = syncAllInfraNodes;
    window.restartLoadBalancer = restartLoadBalancer;
    window.restartNode = restartNode;
    window.toggleLockdown = toggleLockdown;
    window.toggleMonitor = toggleMonitor;
}


