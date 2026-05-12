/**
 * Dashboard Page Entry Point
 */
import { $ } from '../utils/dom.js';

document.addEventListener('DOMContentLoaded', () => {

    // 1. User Profile Sync
    function syncUser() {
        const u = window.currentUser || { full_name: 'Operator', points: 0, level: 1 };
        const initials = u.full_name.trim().substring(0, 2).toUpperCase();
        const rankMap = { 
            1:'Recruit', 2:'Rookie', 3:'Scout', 4:'Analyst', 5:'Specialist', 
            6:'Expert', 7:'Senior', 8:'Principal', 9:'Elite', 10:'Master' 
        };
        const rank = rankMap[Math.min(u.level, 10)] || 'Recruit';
        const xpPct = Math.min(((u.points % 500) / 500) * 100, 100);

        const initialsEl = $('#user-initials');
        const fullNameEl = $('#user-fullname');
        const rankEl = $('#user-rank');
        const totalPtsEl = $('#user-total-pts');
        const miniPtsEl = $('#user-total-pts-mini');

        if (initialsEl) initialsEl.innerText = initials;
        if (fullNameEl) fullNameEl.innerText = u.full_name;
        if (rankEl) rankEl.innerText = `RANK: ${rank.toUpperCase()}`;
        if (totalPtsEl) totalPtsEl.innerText = `${u.points.toLocaleString()} XP`;
        if (miniPtsEl) miniPtsEl.innerText = `${u.points.toLocaleString()} XP`;

        setTimeout(() => {
            const fill = $('#xp-fill');
            if (fill) fill.style.width = xpPct + '%';
        }, 500);
    }
    
    document.addEventListener('userLoaded', syncUser);
    syncUser();

    // 2. Module Progress Entrance Animation
    setTimeout(() => {
        document.querySelectorAll('.module-progress-fill').forEach(el => {
            el.style.width = (el.dataset.width || 0) + '%';
        });
    }, 400);

    // 3. Live Log Feed Simulation
    const feed = $('#log-feed');
    let threatCount = 0;
    const logEntries = [
        { msg: 'Inbound connection: SEC-NODE-{id}',          type: 'conn'  },
        { msg: 'Kernel trace OK — PID {hex}',                type: 'trace' },
        { msg: 'Neural link established: Sector-7',          type: 'conn'  },
        { msg: 'Encrypted packet received: 0x{hex}',         type: 'trace' },
        { msg: 'UNAUTHORIZED ACCESS ATTEMPT — BLOCKED',      type: 'threat'},
        { msg: 'Threat scan complete: 0 vulnerabilities',    type: 'trace' },
        { msg: 'Firewall rule applied: DROP 0.0.0.0/{id}',   type: 'conn'  },
        { msg: 'ML anomaly detected — confidence {pct}%',    type: 'threat'},
    ];

    function addLog() {
        if (!feed) return;
        const time = new Date().toISOString().substring(11, 19);
        const entry = logEntries[Math.floor(Math.random() * logEntries.length)];
        const id  = Math.floor(Math.random() * 90) + 10;
        const hex = Math.random().toString(16).substring(2, 6).toUpperCase();
        const pct = Math.floor(Math.random() * 25) + 72;

        const div = document.createElement('div');
        div.className = `log-item ${entry.type}`;
        div.innerHTML = `<span class="log-time">${time}</span><span>${entry.msg
            .replace('{id}',  id)
            .replace('{hex}', hex)
            .replace('{pct}', pct)}</span>`;
        
        feed.prepend(div);
        if (feed.children.length > 10) feed.lastElementChild.remove();

        if (entry.type === 'threat') {
            threatCount++;
            const tc = $('#threat-count');
            if (tc) tc.innerText = threatCount;
        }
    }

    if (feed) {
        for (let i = 0; i < 10; i++) addLog();
        setInterval(addLog, 2800);
    }

    // 4. Performance Monitoring Simulation
    setInterval(() => {
        const cpu = (Math.random() * 18 + 7).toFixed(1);
        const traffic = (Math.random() * 1.5 + 1.2).toFixed(2);
        
        const cpuVal = $('#cpu-val');
        const cpuBar = $('#cpu-bar');
        const netTraffic = $('#net-traffic');
        
        if (cpuVal) cpuVal.innerText = cpu + '%';
        if (cpuBar) cpuBar.style.width = cpu + '%';
        if (netTraffic) netTraffic.innerText = traffic + ' GB/s';
    }, 3500);

});
