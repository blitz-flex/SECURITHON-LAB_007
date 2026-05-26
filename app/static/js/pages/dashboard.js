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
