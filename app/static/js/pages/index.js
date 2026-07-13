/**
 * Landing Page Logic — SECURITHON LAB 007
 */
import { $, $$ } from '../utils/dom.js';
import { typeText, animateCounter, initGlowEffect } from '../utils/animations.js';

document.addEventListener('DOMContentLoaded', () => {
    // ── Topbar scroll effect
    const topbar = document.querySelector('.landing-topbar');
    const onScroll = () => topbar?.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ── Scroll reveal (2026: blur-in + scale + stagger)
    const revealEls = document.querySelectorAll(
        '.intel-card, .cycle-step, .vs-card, .scenario-card, .comp-box, .cap-text, .cap-visual, .section-title, .mission-terminal, .mission-info, .stack-item, .team-card, .lc-phase, .proof-card'
    );
    revealEls.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(32px) scale(0.97)';
        el.style.filter = 'blur(6px)';
        const delay = (i % 6) * 0.07;
        el.style.transition = `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, filter 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s`;
    });
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'none';
                entry.target.style.filter = 'blur(0)';
                revealObserver.unobserve(entry.target);
                // Clear inline styles after transition for CSS hovers
                setTimeout(() => {
                    entry.target.style.opacity = '';
                    entry.target.style.transform = '';
                    entry.target.style.filter = '';
                    entry.target.style.transition = '';
                }, 1200);
            }
        });
    }, { threshold: 0.06, rootMargin: '0px 0px -50px 0px' });
    revealEls.forEach(el => revealObserver.observe(el));

    // 1. Terminal Sequence
    const terminalBody = $('#telemetry-stream');
    const terminalLines = [
        { text: "./run_audit.sh --scope=compliance", type: "command", delay: 600 },
        { text: "[INFO]  Running local security baseline checks...", type: "output", delay: 800 },
        { text: "[WARN]  Docker daemon socket permissions are overly permissive (666). Expected (660).", type: "error", delay: 1200 },
        { text: "[INFO]  Scanning webroot /var/www/html/api for OWASP Top 10 vulnerabilities...", type: "output", delay: 1000 },
        { text: "[ALERT] SQL Injection signature detected in search_endpoint.php:12 (CWE-89)", type: "error", delay: 900 },
        { text: "patch -p1 < patches/sec_patch_v1.diff", type: "command", delay: 1400 },
        { text: "patching file search_endpoint.php", type: "output", delay: 400 },
        { text: "[OK]    Patch verification passed. Integrity checksum validated.", type: "success", delay: 800 }
    ];

    if (terminalBody) {
        typeText(terminalBody, terminalLines).then(() => {
            // Insert separator
            const separator = document.createElement('div');
            separator.className = 'term-line';
            separator.style.borderTop = '1px dashed rgba(63, 185, 80, 0.2)';
            separator.style.margin = '10px 0';
            terminalBody.appendChild(separator);
            
            // Sub-container for dynamic WebSocket log streaming
            const wsLogsStream = document.createElement('div');
            wsLogsStream.id = 'ws-logs-stream';
            terminalBody.appendChild(wsLogsStream);
            
            // Connect to real-time logs
            connectWebSocketLogs(wsLogsStream, terminalBody);
        });
    }

    // 2. Stats Animation
    const stats = $$('.stat-number');
    if (stats.length > 0) {
        setTimeout(() => animateCounter(stats), 1000);
    }

    // 3. Card Glow
    const glowCards = $$('.intel-card, .scenario-card');
    if (glowCards.length > 0) {
        initGlowEffect(glowCards);
    }


    // 4. Smooth Scroll
    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            try {
                const target = $(href);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (err) {
                console.warn(`Smooth scroll target invalid: ${href}`, err);
            }
        });
    });
});

// Memory buffer for logs
let logHistory = [];

/**
 * Connects the telemetry terminal to the real-time websocket backend logs
 */
function connectWebSocketLogs(container, parentTerminal) {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/ws/logs`;
    let ws = new WebSocket(wsUrl);

    // Initial alert line
    const initLog = {
        time: new Date().toLocaleTimeString(),
        category: 'SEC',
        message: 'Telemetry network audit link established'
    };
    logHistory.push(initLog);
    renderLogs(container, parentTerminal);

    ws.onmessage = (event) => {
        try {
            const log = JSON.parse(event.data);
            logHistory.push(log);
            if (logHistory.length > 100) {
                logHistory.shift();
            }
            renderLogs(container, parentTerminal);
        } catch (err) {
            console.error("Failed to parse log message:", err);
        }
    };

    ws.onerror = (err) => {
        console.error("WebSocket connection error:", err);
    };

    ws.onclose = () => {
        const disconnectLog = {
            time: new Date().toLocaleTimeString(),
            category: 'SYS',
            message: 'Audit stream disconnected. Retrying in 5 seconds...'
        };
        logHistory.push(disconnectLog);
        renderLogs(container, parentTerminal);
        
        setTimeout(() => connectWebSocketLogs(container, parentTerminal), 5000);
    };

    // Filter change event listener
    const filterSelect = document.getElementById('log-feed-filter');
    if (filterSelect) {
        // Prevent adding multiple listeners on reconnect
        filterSelect.onchange = () => {
            renderLogs(container, parentTerminal);
        };
    }
}

/**
 * Renders the filtered log buffer to the container
 */
function renderLogs(container, parentTerminal) {
    if (!container) return;
    
    const filterVal = document.getElementById('log-feed-filter')?.value || 'ALL';
    
    // Clear subcontainer
    container.innerHTML = '';
    
    // Filter history
    const filteredLogs = filterVal === 'ALL' 
        ? logHistory 
        : logHistory.filter(log => log.category === filterVal);
        
    // Slice last 25 records to fit terminal height nicely
    const displayedLogs = filteredLogs.slice(-25);
    
    displayedLogs.forEach(log => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'term-line';

        // Timestamp
        const timeSpan = document.createElement('span');
        timeSpan.className = 'term-time';
        timeSpan.style.color = 'var(--text-muted)';
        timeSpan.style.marginRight = '8px';
        timeSpan.innerText = `[${log.time || new Date().toLocaleTimeString()}]`;
        lineDiv.appendChild(timeSpan);

        // Category badge
        const catSpan = document.createElement('span');
        catSpan.className = `term-category term-category-${log.category || 'SYS'}`;
        catSpan.style.marginRight = '8px';
        catSpan.style.fontWeight = 'bold';
        catSpan.innerText = `[${log.category || 'SYS'}]`;
        lineDiv.appendChild(catSpan);

        // Message text
        const msgSpan = document.createElement('span');
        msgSpan.className = 'term-msg';
        msgSpan.style.color = '#e6edf3';
        msgSpan.innerText = log.message;
        lineDiv.appendChild(msgSpan);

        container.appendChild(lineDiv);
    });

    // Scroll parent terminal to bottom
    if (parentTerminal) {
        parentTerminal.scrollTo({
            top: parentTerminal.scrollHeight,
            behavior: 'smooth'
        });
    }
}
