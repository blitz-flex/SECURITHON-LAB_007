import { $ } from '../utils/dom.js';

// Immediate Auth Check
if (!localStorage.getItem('token')) {
    window.location.href = '/login';
}

// ── Coming Soon Modal ─────────────────────────────────────────────────────────
// Rich config registry: keyed by exact title string passed from onclick.
const MODAL_CONFIGS = {
    'LLM Security Hub': {
        subtitle: '',
        badges: [],
        lead: '<strong><i class="fas fa-rocket"></i> Preparing for deployment.</strong> This module is currently being finalized. Upcoming scenarios include:',
        vectors: [
            { icon: 'fas fa-bolt',       color: '#58a6ff', label: 'Prompt Injection',   detail: 'Direct & indirect instruction overrides' },
            { icon: 'fas fa-brain',      color: '#a371f7', label: 'RAG Corpus Poisoning', detail: 'Vector DB embedding manipulation' },
            { icon: 'fas fa-shield-alt', color: '#3fb950', label: 'Guardrail Bypass',   detail: 'Safety alignment & output sanitization flaws' },
            { icon: 'fas fa-code',       color: '#f0883e', label: 'Tool / Function Abuse', detail: 'Malicious tool calls via chain-of-thought hijacking' },
        ],
    },
};

window.showComingSoonModal = (title, desc) => {
    const modal    = document.getElementById('comingSoonModal');
    const titleEl  = document.getElementById('cs-title');
    const descEl   = document.getElementById('cs-desc');
    const subEl    = document.getElementById('cs-subtitle');
    if (!modal || !titleEl || !descEl) return;

    if (modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }

    const cfg = MODAL_CONFIGS[title] || null;

    // Title
    titleEl.innerHTML = `<i class="fas fa-lock"></i> ${title.toUpperCase()}`;

    // Subtitle
    if (subEl) {
        if (cfg && !cfg.subtitle) {
            subEl.style.display = 'none';
        } else {
            subEl.textContent = cfg ? cfg.subtitle : 'IN DEVELOPMENT';
            subEl.style.display = '';
        }
    }

    // Badge row — inject once, replace on re-open
    let badgeRow = modal.querySelector('.cs-badge-row');
    if (!badgeRow) {
        badgeRow = document.createElement('div');
        badgeRow.className = 'cs-badge-row';
        descEl.before(badgeRow);
    }
    if (cfg?.badges?.length) {
        badgeRow.innerHTML = cfg.badges
            .map(b => `<span class="cs-badge">${b}</span>`)
            .join('');
        badgeRow.style.display = 'flex';
    } else {
        badgeRow.innerHTML = '';
        badgeRow.style.display = 'none';
    }

    // Description body
    if (cfg) {
        descEl.innerHTML =
            `<p class="cs-lead-text">${cfg.lead}</p>` +
            `<ul class="cs-vector-list">` +
            cfg.vectors.map(v =>
                `<li style="--vec-color: ${v.color}">
                    <span class="cs-vector-icon"><i class="${v.icon}"></i></span>
                    <span class="cs-vector-text"><strong>${v.label}</strong> ${v.detail}</span>
                </li>`
            ).join('') +
            `</ul>`;
    } else {
        descEl.innerHTML = `<p class="cs-lead-text">${desc}</p>`;
    }

    modal.classList.add('active');
    document.body.classList.add('has-active-modal');
};

window.closeComingSoonModal = () => {
    const modal = document.getElementById('comingSoonModal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('has-active-modal');
};

document.addEventListener('DOMContentLoaded', () => {
    // Modal closing options (overlay click and Escape key)
    const csModal = document.getElementById('comingSoonModal');
    if (csModal) {
        csModal.addEventListener('click', (e) => {
            if (e.target === csModal) {
                closeComingSoonModal();
            }
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeComingSoonModal();
        }
    });

    const RING_CIRCUMFERENCE = 150.8;

    function setProgressRing(circleEl, labelEl, percent) {
        const pct = Math.max(0, Math.min(100, Number(percent) || 0));
        if (circleEl) {
            circleEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct / 100));
        }
        if (labelEl) labelEl.textContent = `${pct}%`;
    }

    function setSkillBar(pctEl, barEl, percent) {
        if (percent === null || percent === undefined) {
            if (pctEl) pctEl.textContent = '—';
            if (barEl) barEl.style.width = '0%';
            return;
        }
        const pct = Math.max(0, Math.min(100, Number(percent) || 0));
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (barEl) barEl.style.width = `${pct}%`;
    }

    // 1. User Profile Sync
    function syncUser() {
        if (!window.currentUser) return;
        const u = window.currentUser;
        const points = u.points || 0;
        const level = Math.floor(points / 1000) + 1;
        const name = u.full_name || u.username || '';
        const initials = name.trim().substring(0, 2).toUpperCase();
        const rankMap = {
            1: 'Recruit', 2: 'Rookie', 3: 'Scout', 4: 'Analyst', 5: 'Specialist',
            6: 'Expert', 7: 'Senior', 8: 'Principal', 9: 'Elite', 10: 'Master'
        };
        const rank = rankMap[Math.min(level, 10)] || 'Recruit';

        const initialsEl = $('#user-initials');
        const fullNameEl = $('#user-fullname');
        const rankEl = $('#user-rank');

        if (initialsEl) initialsEl.innerText = initials;
        if (fullNameEl) fullNameEl.innerText = name;
        if (rankEl) rankEl.innerText = `RANK: ${rank.toUpperCase()}`;

        // Dynamic Level Progress Ring around avatar
        const progress = Math.round((points % 1000) / 10);
        const deg = Math.round(progress * 3.6);
        const avatarRing = $('.avatar-ring');
        if (avatarRing) {
            avatarRing.style.background = `conic-gradient(var(--primary-app) 0deg ${deg}deg, rgba(255, 255, 255, 0.08) ${deg}deg 360deg)`;
            avatarRing.title = `Level Progress: ${progress}% (${points % 1000} / 1000 XP to next level)`;
        }
    }

    function renderTacticalStatus(stats) {
        if (!stats) return;

        const secSub = document.getElementById('security-node-sublabel');
        if (secSub) secSub.textContent = stats.security_node_label || '';

        // Security node ring — color-coded by posture
        const nodeVal = stats.security_node || 0;
        const nodeRing = document.getElementById('security-node-ring');
        const nodePct  = document.getElementById('security-node-pct');
        const nodeColor = nodeVal >= 70 ? '#3fb950' : nodeVal >= 35 ? '#d29922' : '#f85149';
        if (nodeRing) nodeRing.style.stroke = nodeColor;
        if (nodePct)  nodePct.style.color   = nodeColor;
        setProgressRing(nodeRing, nodePct, nodeVal);

        const skills = stats.skills || {};

        // Helper: pick HUD color by skill score
        function skillColor(val) {
            if (val === null || val === undefined) return '#58a6ff';
            return val >= 70 ? '#3fb950' : val >= 35 ? '#d29922' : '#f85149';
        }

        function setSkillBarColored(pctId, barId, value) {
            const color = skillColor(value);
            const pctEl = document.getElementById(pctId);
            const barEl = document.getElementById(barId);
            if (pctEl) pctEl.style.color = color;
            if (barEl) barEl.style.background = color;
            setSkillBar(pctEl, barEl, value);
        }

        setSkillBarColored('skill-exploitation-pct', 'skill-exploitation-bar', skills.exploitation);
        setSkillBarColored('skill-defense-pct',      'skill-defense-bar',      skills.defense);
        setSkillBarColored('skill-analysis-pct',     'skill-analysis-bar',     skills.analysis);
        setSkillBarColored('skill-cloud-pct',        'skill-cloud-bar',        skills.cloud_security);
        setSkillBarColored('skill-clean-code-pct',   'skill-clean-code-bar',   skills.clean_code);

        const sources = stats.metric_sources || {};
        const sourceTitles = {
            solved_web_security_labs: 'Real metric: solved Web Security / exploitation labs.',
            solved_identity_defense_labs: 'Real metric: solved identity and defense labs.',
            solved_identity_defense_labs_mfa_bonus: 'Real metric: defense labs + MFA hardening bonus (+15).',
            measured_solve_efficiency: 'Real metric: average measured solve efficiency from successful submissions.',
            overall_lab_progress: 'Fallback metric: overall lab progress until solve-efficiency samples exist.',
            solved_cloud_iac_labs: 'Real metric: solved cloud, IaC, and Kubernetes labs.',
            measured_static_patch_quality: 'Real metric: average static clean-code score from successful submissions.',
            not_enough_data: 'No measured clean-code submissions yet.',
        };
        Object.entries({
            exploitation: 'skill-exploitation-pct',
            defense: 'skill-defense-pct',
            analysis: 'skill-analysis-pct',
            cloud_security: 'skill-cloud-pct',
            clean_code: 'skill-clean-code-pct',
        }).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (el && sources[key]) el.title = sourceTitles[sources[key]] || sources[key];
        });
    }

    async function loadTacticalStatus() {
        const token = localStorage.getItem('token');
        if (!token) return;

        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        try {
            const localSolved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
            if (Array.isArray(localSolved) && localSolved.length > 0) {
                await fetch('/api/v1/users/me/lab-progress/sync', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ solved_ids: localSolved }),
                });
            }

            const res = await fetch('/api/v1/users/me/tactical-stats', { headers });
            if (!res.ok) return;
            const stats = await res.json();
            renderTacticalStatus(stats);
        } catch (e) {
            console.error('Tactical status load failed:', e);
        }
    }

    document.addEventListener('userLoaded', () => {
        syncUser();
        loadTacticalStatus();
    });
    syncUser();
    loadTacticalStatus();

    // Auto-refresh Tactical HUD every 30 seconds so the dashboard reflects
    // challenge completions without requiring a hard page reload.
    setInterval(loadTacticalStatus, 30_000);

    // Also refresh immediately when the tab regains focus after being hidden
    // (e.g. student completes a challenge in the Arena tab and switches back).
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') loadTacticalStatus();
    });

    // 3. Live Log Feed via WebSocket
    const feed = $('#log-feed');
    let threatCount = 0;
    let dashboardLogs = [];

    if (feed) {
        let ws;
        let wsKeepAliveInterval;

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
            
            ws.onopen = () => {
                console.log("WebSocket connected to /ws/logs");
                // Send keep-alive ping every 25 seconds to prevent timeout
                wsKeepAliveInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 25000);
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                dashboardLogs.push(data);
                if (dashboardLogs.length > 100) {
                    dashboardLogs.shift();
                }
                
                // Track overall threat counts in background
                const cat = data.category;
                const msg = data.message;
                let typeClass = 'trace';
                if (cat === 'SEC' || cat === 'AUTH' || cat === 'DB') typeClass = 'conn';
                if (cat === 'THREAT' || msg.includes('BLOCK') || msg.includes('FAIL')) typeClass = 'threat';
                
                if (typeClass === 'threat') {
                    threatCount++;
                    const tc = $('#threat-count');
                    if (tc) tc.innerText = threatCount;
                }
                
                renderDashboardLogs();
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
            };

            ws.onclose = () => {
                console.warn("WebSocket closed. Cleaning up and reconnecting in 5s...");
                if (wsKeepAliveInterval) {
                    clearInterval(wsKeepAliveInterval);
                }
                setTimeout(connectWebSocket, 5000);
            };
            
            // Listen for filter changes
            const filterSelect = document.getElementById('log-feed-filter');
            if (filterSelect) {
                filterSelect.onchange = () => {
                    renderDashboardLogs();
                };
            }
        }
        
        function renderDashboardLogs() {
            const filterVal = document.getElementById('log-feed-filter')?.value || 'ALL';
            feed.innerHTML = '';
            
            const filtered = filterVal === 'ALL'
                ? dashboardLogs
                : dashboardLogs.filter(l => l.category === filterVal);
                
            // Prepend logs (newest at the top)
            const displayed = filtered.slice(-10).reverse();
            
            displayed.forEach(log => {
                const time = log.time || new Date().toISOString().substring(11, 19);
                const msg = log.message;
                const cat = log.category;
                
                let typeClass = 'trace';
                if (cat === 'SEC' || cat === 'AUTH' || cat === 'DB') typeClass = 'conn';
                if (cat === 'THREAT' || msg.includes('BLOCK') || msg.includes('FAIL')) typeClass = 'threat';

                const div = document.createElement('div');
                div.className = `log-item ${typeClass}`;
                div.innerHTML = `<span class="log-time">${time}</span><span>[${cat}] ${msg}</span>`;
                feed.appendChild(div);
            });
        }
        
        connectWebSocket();
    }

    // 4. Performance Monitoring via API
    let lastNetworkTotal = 0;
    let lastTime = Date.now();

    async function fetchSystemStats() {
        try {
            const res = await fetch('/api/v1/system/stats');
            const data = await res.json();
            const now = Date.now();
            const deltaSec = (now - lastTime) / 1000;
            lastTime = now;
            
            const cpuVal = $('#cpu-val');
            const cpuBar = $('#cpu-bar');
            const memVal = $('#mem-val');
            const memBar = $('#mem-bar');
            const netTraffic = $('#net-traffic');
            const diskVal = $('#disk-val');
            const diskBar = $('#disk-bar');
            
            if (cpuVal) cpuVal.innerText = data.cpu.toFixed(1) + '%';
            if (cpuBar) cpuBar.style.width = data.cpu + '%';
            
            if (memVal) memVal.innerText = data.memory.toFixed(1) + '%';
            if (memBar) memBar.style.width = data.memory + '%';
            
            if (diskVal && data.disk !== undefined) {
                diskVal.innerText = data.disk.toFixed(1) + '%';
            }
            if (diskBar && data.disk !== undefined) {
                diskBar.style.width = data.disk + '%';
            }
            
            if (netTraffic) {
                const currentTotal = data.network.bytes_sent + data.network.bytes_recv;
                if (lastNetworkTotal > 0) {
                    const diff = currentTotal - lastNetworkTotal;
                    const mbps = ((diff / 1024 / 1024) / deltaSec).toFixed(2);
                    netTraffic.innerText = mbps + ' MB/s';
                } else {
                    netTraffic.innerText = '0.00 MB/s';
                }
                lastNetworkTotal = currentTotal;
            }
        } catch (e) {
            console.error("Error fetching system stats", e);
        }
    }
    
    // Initial fetch and interval
    fetchSystemStats();
    setInterval(fetchSystemStats, 3500);

});
