import { $ } from '../utils/dom.js';

// Immediate Auth Check
if (!localStorage.getItem('token')) {
    window.location.href = '/login';
}

// Expose modal handlers to global scope for inline onclick usage
window.showComingSoonModal = (title, desc) => {
    const modal = document.getElementById('comingSoonModal');
    const titleEl = document.getElementById('cs-title');
    const descEl = document.getElementById('cs-desc');
    
    if (modal && titleEl && descEl) {
        titleEl.innerHTML = `<i class="fas fa-lock"></i> ${title.toUpperCase()}`;
        descEl.innerText = desc;
        modal.classList.add('active');
    }
};

window.closeComingSoonModal = () => {
    const modal = document.getElementById('comingSoonModal');
    if (modal) modal.classList.remove('active');
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

    // 1. User Profile Sync
    function syncUser() {
        if (!window.currentUser) return;
        const u = window.currentUser;
        const level = Math.floor(u.points / 1000) + 1;
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
    }

    document.addEventListener('userLoaded', syncUser);
    syncUser();



    // 3. Live Log Feed via WebSocket
    const feed = $('#log-feed');
    let threatCount = 0;

    if (feed) {
        let ws;
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                const time = data.time || new Date().toISOString().substring(11, 19);
                const msg = data.message;
                const cat = data.category;
                
                // Map categories to styles
                let typeClass = 'trace';
                if (cat === 'SEC' || cat === 'AUTH' || cat === 'DB') typeClass = 'conn';
                if (cat === 'THREAT' || msg.includes('BLOCK') || msg.includes('FAIL')) typeClass = 'threat';

                const div = document.createElement('div');
                div.className = `log-item ${typeClass}`;
                div.innerHTML = `<span class="log-time">${time}</span><span>[${cat}] ${msg}</span>`;

                feed.prepend(div);
                if (feed.children.length > 10) feed.lastElementChild.remove();

                if (typeClass === 'threat') {
                    threatCount++;
                    const tc = $('#threat-count');
                    if (tc) tc.innerText = threatCount;
                }
            };

            ws.onerror = (error) => {
                console.error("Telemetry WebSocket error:", error);
            };

            ws.onclose = () => {
                console.warn("Telemetry WebSocket connection closed. Reconnecting in 5s...");
                setTimeout(connectWebSocket, 5000);
            };
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
