/**
 * Arena Page Entry Point — TryHackMe-Style Lab Engine
 * Manages lab lifecycle, status polling, countdown timer, and terminal connection.
 */
import { Arena } from '../modules/arena.js?v=24';
import { Terminal } from '../modules/terminal.js?v=21';

document.addEventListener('DOMContentLoaded', async () => {

    // ─── DOM References ───────────────────────────────────────
    const labDot          = document.getElementById('labDot');
    const labStatusText   = document.getElementById('labStatusText');
    const labTimer        = document.getElementById('labTimer');
    const labTimerValue   = document.getElementById('labTimerValue');
    const labConnectionCard = document.getElementById('labConnectionCard');
    const labTargetUrl    = document.getElementById('labTargetUrl');
    const labCopyBtn      = document.getElementById('labCopyBtn');
    const labStartBtn     = document.getElementById('labStartBtn');
    const labExtendBtn    = document.getElementById('labExtendBtn');
    const labTerminateBtn = document.getElementById('labTerminateBtn');
    const labStatusActions = document.getElementById('labStatusActions');
    const labActions       = document.querySelector('.lab-actions');
    const labStatusIndicator = document.querySelector('.lab-status-indicator');
    const terminalEl      = document.getElementById('terminalWrapper');
    const terminalHeader  = document.getElementById('terminalHeader');
    const terminalOfflinePlaceholder = document.getElementById('terminalOfflinePlaceholder');
    const trackTitle      = document.getElementById('trackTitle');

    if (trackTitle) trackTitle.innerText = "INFRASEC FORGE";

    // ─── State ────────────────────────────────────────────────
    let currentSessionId  = localStorage.getItem('lab_session_id') || null;
    let currentChallengeId = localStorage.getItem('lab_challenge_id') || null;
    let labStatus         = 'offline';   // offline | spawning | online
    let remainingSeconds  = 0;
    let countdownInterval = null;
    let pollInterval      = null;
    let terminal          = null;

    function ensureTerminal() {
        if (!terminal && terminalEl) {
            terminal = new Terminal('terminal', { autoConnect: false });
        }
        return terminal;
    }

    function showXPFloat(text, parentElement) {
        const floater = document.createElement('div');
        floater.className = 'xp-float';
        floater.textContent = text;
        
        const rect = parentElement.getBoundingClientRect();
        floater.style.left = `${rect.left + rect.width / 2}px`;
        floater.style.top = `${rect.top}px`;
        
        document.body.appendChild(floater);
        setTimeout(() => floater.remove(), 1000);
    }

    // ─── UI Helpers ───────────────────────────────────────────
    function setStatus(status, seconds = 0) {
        labStatus = status;
        remainingSeconds = seconds;

        // Dot color
        labDot.className = 'lab-dot';
        if (status === 'online')   labDot.classList.add('lab-dot-online');
        if (status === 'spawning') labDot.classList.add('lab-dot-spawning');
        if (status === 'offline')  labDot.classList.add('lab-dot-offline');

        // Status text
        const labels = { online: '', spawning: 'Spawning...', offline: 'Offline' };
        labStatusText.textContent = labels[status] || 'Offline';
        labStatusText.style.display = labels[status] ? 'inline' : 'none';

        // Timer
        if (status === 'online' && seconds > 0) {
            labTimer.style.display = 'flex';
            updateTimerDisplay(seconds);
            startCountdown(seconds);
        } else {
            labTimer.style.display = 'none';
            stopCountdown();
        }

        // Connection card
        if (labConnectionCard) {
            labConnectionCard.style.display = status === 'online' ? 'block' : 'none';
        }

        // Terminal
        if (status === 'online') {
            if (terminalHeader) terminalHeader.style.display = 'flex';
            if (terminalEl) terminalEl.style.display = 'block';
            if (terminalOfflinePlaceholder) terminalOfflinePlaceholder.style.display = 'none';
        } else if (status === 'offline') {
            if (terminalHeader) terminalHeader.style.display = 'none';
            if (terminalEl) terminalEl.style.display = 'none';
            if (terminalOfflinePlaceholder) terminalOfflinePlaceholder.style.display = 'flex';
        } else {
            // spawning or other transitional states
            if (terminalHeader) terminalHeader.style.display = 'none';
            if (terminalEl) terminalEl.style.display = 'none';
            if (terminalOfflinePlaceholder) terminalOfflinePlaceholder.style.display = 'none';
        }

        // Buttons and Containers
        labStartBtn.disabled       = status !== 'offline';
        labStartBtn.style.display  = status === 'offline' ? 'flex' : 'none';
        labExtendBtn.disabled      = status !== 'online';
        labExtendBtn.style.display = status === 'online' ? 'inline-flex' : 'none';
        labTerminateBtn.disabled   = status !== 'online';
        labTerminateBtn.style.display = status === 'online' ? 'inline-flex' : 'none';

        if (labStatusIndicator) {
            labStatusIndicator.style.display = status === 'online' ? 'none' : 'flex';
        }
        if (labStatusActions) {
            labStatusActions.style.display = status === 'online' ? 'flex' : 'none';
        }
        if (labActions) {
            labActions.style.display = status === 'offline' ? 'flex' : 'none';
        }

        // Button styling
        if (status === 'online') {
            labExtendBtn.style.opacity = '1';
            labTerminateBtn.style.opacity = '1';
        } else {
            labExtendBtn.style.opacity = '0.4';
            labTerminateBtn.style.opacity = '0.4';
        }
    }

    function updateTimerDisplay(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        labTimerValue.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        // Color warning when under 5 minutes
        if (seconds < 300) {
            labTimerValue.style.color = '#f85149';
            labTimer.classList.add('lab-timer-warning');
        } else {
            labTimerValue.style.color = '';
            labTimer.classList.remove('lab-timer-warning');
        }
    }

    function startCountdown(seconds) {
        stopCountdown();
        remainingSeconds = seconds;
        countdownInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
                remainingSeconds = 0;
                stopCountdown();
                handleExpired();
            }
            updateTimerDisplay(remainingSeconds);
        }, 1000);
    }

    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function handleExpired() {
        setStatus('offline');
        if (terminal) terminal.disconnect();
        currentSessionId = null;
        localStorage.removeItem('lab_session_id');
        localStorage.removeItem('lab_challenge_id');
    }

    // ─── Copy Button ──────────────────────────────────────────
    if (labCopyBtn) {
        labCopyBtn.addEventListener('click', async () => {
            const url = labTargetUrl ? labTargetUrl.textContent : '';
            try {
                if (url) {
                    await navigator.clipboard.writeText(url);
                }
                labCopyBtn.innerHTML = '<i class="fas fa-check"></i>';
                labCopyBtn.classList.add('lab-copy-success');
                setTimeout(() => {
                    labCopyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    labCopyBtn.classList.remove('lab-copy-success');
                }, 1500);
            } catch {
                // Fallback
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
        });
    }

    // ─── Lab Challenge Selection ──────────────────────────────
    // Fetch challenges from the lab API
    let labChallenges = {};
    try {
        const res = await fetch('/api/v1/lab/challenges');
        const data = await res.json();
        data.forEach(ch => {
            labChallenges[ch.id] = ch;
        });
    } catch (e) {
        console.warn('Failed to fetch lab challenges:', e);
    }

    // ─── Start Machine ───────────────────────────────────────
    labStartBtn.addEventListener('click', async () => {
        // Determine which challenge to start
        const selectedChallenge = currentChallengeId || Object.keys(labChallenges)[0] || 'sqli_basic';

        setStatus('spawning');
        labStartBtn.disabled = true;

        try {
            const res = await fetch('/api/v1/lab/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challenge_id: selectedChallenge,
                })
            });

            if (!res.ok) {
                const err = await res.json();
                console.error('Lab start failed:', err);
                setStatus('offline');
                return;
            }

            const result = await res.json();
            currentSessionId = result.session_id;
            currentChallengeId = result.challenge_id;
            localStorage.setItem('lab_session_id', currentSessionId);
            localStorage.setItem('lab_challenge_id', currentChallengeId);

            // Set target URL
            if (labTargetUrl) {
                labTargetUrl.textContent = `http://${result.target_host}`;
            }

            // Start polling until online
            startPolling(currentSessionId);

        } catch (e) {
            console.error('Lab start error:', e);
            setStatus('offline');
        }
    });

    // ─── Extend Lab ──────────────────────────────────────────
    labExtendBtn.addEventListener('click', async () => {
        if (!currentSessionId || labStatus !== 'online') return;

        const currentXP = parseInt(localStorage.getItem('user_xp') || '0');
        if (currentXP < 25) {
            // Shake animation for error
            labExtendBtn.classList.add('btn-error-shake');
            setTimeout(() => labExtendBtn.classList.remove('btn-error-shake'), 600);
            
            const term = ensureTerminal();
            if (term) {
                term.log('Cannot extend session: Insufficient XP (Requires 25 XP).', 'ERR');
            }
            return;
        }

        labExtendBtn.disabled = true;
        labExtendBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span class="xp-cost">...</span>
        `;

        try {
            const res = await fetch('/api/v1/lab/extend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId,
                    minutes: 15
                })
            });

            if (res.ok) {
                // Deduct 25 XP
                if (window.incrementXP) {
                    await window.incrementXP(-25);
                }
                showXPFloat(`-25 XP`, labExtendBtn);

                const data = await res.json();
                remainingSeconds = data.remaining_seconds;
                startCountdown(remainingSeconds);
                updateTimerDisplay(remainingSeconds);

                const term = ensureTerminal();
                if (term) {
                    term.log('Successfully extended session by 15 minutes (-25 XP).', 'OK');
                }
            } else {
                const err = await res.json();
                console.warn('Extend failed:', err.detail);
                // Show max reached feedback
                labExtendBtn.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <span class="xp-cost">MAX</span>
                `;
                labExtendBtn.disabled = true;
                setTimeout(() => {
                    labExtendBtn.innerHTML = `
                        <i class="fas fa-stopwatch"></i>
                        <span class="xp-cost">-25 XP</span>
                    `;
                }, 2000);
                return;
            }
        } catch (e) {
            console.error('Extend error:', e);
        }

        labExtendBtn.innerHTML = `
            <i class="fas fa-stopwatch"></i>
            <span class="xp-cost">-25 XP</span>
        `;
        labExtendBtn.disabled = false;
    });

    // ─── Terminate Lab ───────────────────────────────────────
    labTerminateBtn.addEventListener('click', async () => {
        if (!currentSessionId) return;

        labTerminateBtn.disabled = true;
        labTerminateBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>Wait...</span>
        `;

        // Disconnect terminal first
        if (terminal) terminal.disconnect();

        try {
            await fetch('/api/v1/lab/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            });
        } catch (e) {
            console.error('Stop error:', e);
        }

        currentSessionId = null;
        localStorage.removeItem('lab_session_id');
        localStorage.removeItem('lab_challenge_id');
        setStatus('offline');
        stopPolling();

        labTerminateBtn.innerHTML = `
            <i class="fas fa-skull-crossbones"></i>
            <span>Terminate</span>
        `;
    });

    // ─── Status Polling ──────────────────────────────────────
    function startPolling(sessionId) {
        stopPolling();
        pollStatus(sessionId); // immediate first check
        pollInterval = setInterval(() => pollStatus(sessionId), 2000);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    async function pollStatus(sessionId) {
        try {
            const res = await fetch(`/api/v1/lab/status/${sessionId}`);
            if (!res.ok) {
                // Session gone
                stopPolling();
                setStatus('offline');
                return;
            }

            const data = await res.json();

            if (data.status === 'online') {
                stopPolling();
                if (labTargetUrl) {
                    labTargetUrl.textContent = `http://${data.target_host}`;
                }
                setStatus('online', data.remaining_seconds);

                // Connect terminal to the lab attackbox
                const t = ensureTerminal();
                if (t) {
                    t.connectToLab(sessionId);
                    // Trigger re-fit after terminal becomes visible
                    setTimeout(() => t.fit(), 200);
                }
            } else if (data.status === 'offline') {
                stopPolling();
                handleExpired();
            }
            // If still 'spawning', keep polling
        } catch (e) {
            console.error('Poll error:', e);
        }
    }

    // ─── Page Load: Resume State ─────────────────────────────
    if (currentSessionId) {
        // Check if a previous session is still alive
        try {
            const res = await fetch(`/api/v1/lab/status/${currentSessionId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'online') {
                    if (labTargetUrl) {
                        labTargetUrl.textContent = `http://${data.target_host}`;
                    }
                    setStatus('online', data.remaining_seconds);

                    const t = ensureTerminal();
                    if (t) {
                        t.connectToLab(currentSessionId);
                        setTimeout(() => t.fit(), 200);
                    }
                } else if (data.status === 'spawning') {
                    setStatus('spawning');
                    startPolling(currentSessionId);
                } else {
                    // Offline — clear stale data
                    localStorage.removeItem('lab_session_id');
                    localStorage.removeItem('lab_challenge_id');
                    currentSessionId = null;
                    setStatus('offline');
                }
            } else {
                localStorage.removeItem('lab_session_id');
                localStorage.removeItem('lab_challenge_id');
                currentSessionId = null;
                setStatus('offline');
            }
        } catch {
            setStatus('offline');
        }
    } else {
        setStatus('offline');
    }

    // ─── Academy (Curriculum) Init ───────────────────────────
    // Create Arena early with empty challenges so CORE INTEGRITY shows loading state
    const logTerminal = ensureTerminal() || { log: () => {}, clear: () => {}, xterm: { write: () => {} } };
    window.arena = new Arena({
        challenges: {},
        terminal: logTerminal,
        onChallengeSelect: (challengeId) => {}
    });
    window.arena.init();

    try {
        const res = await fetch('/api/v1/infrasec/curriculum?v=5');
        const data = await res.json();
        
        // Transform API data to expected Arena format
        const dynamicChallenges = {};
        data.forEach(item => {
            dynamicChallenges[item.id] = {
                label: item.title,
                level: item.level,
                category: item.category,
                cvss: item.cvss,
                file: item.file_context,
                cwe: item.cwe,
                task: item.task,
                briefing: item.briefing,
                hint: item.hint,
                vulnCode: item.vulnCode || []
            };
        });

        // Refresh Arena with loaded challenges — updates CORE INTEGRITY and sidebar list
        window.arena.refreshChallenges(dynamicChallenges);

        // Wire up onChallengeSelect now that we have labChallenges
        window.arena.onChallengeSelect = (challengeId) => {
            const mapping = {
                'CWE-89': 'sqli_basic',
                'CWE-79': 'sqli_basic',
                'CWE-287': 'sqli_basic',
                'CWE-78': 'cmdi_basic',
            };
            const cwe = dynamicChallenges[challengeId]?.cwe || '';
            const labId = mapping[cwe] || Object.keys(labChallenges)[0] || 'sqli_basic';
            currentChallengeId = labId;
            localStorage.setItem('lab_challenge_id', labId);
            
            // Reload AI Chat history for this challenge
            if (window.loadAIHistory) {
                window.loadAIHistory(challengeId);
            }
        };
        
    } catch (err) {
        console.error("Failed to load real curriculum:", err);
    }

    // ─── AI Assistant Integration ────────────────────────────
    function initAIAssistant() {
        const launcher = document.getElementById('ai-assistant-launcher');
        const chatWindow = document.getElementById('ai-assistant-window');
        const closeBtn = document.getElementById('ai-assistant-close');
        const newChatBtn = document.getElementById('ai-new-chat');
        const chatMessages = document.getElementById('ai-chat-messages');
        const typingIndicator = document.getElementById('ai-typing-indicator');
        const form = document.getElementById('ai-chat-input-form');
        const input = document.getElementById('ai-chat-input');
        const sendBtn = document.getElementById('ai-chat-send');
        const scrollBottomBtn = document.getElementById('ai-scroll-bottom');
        const statusDot = document.querySelector('#ai-assistant-window .status-dot');
        const toggleHistoryBtn = document.getElementById('ai-toggle-history');
        const historyPanel = document.getElementById('ai-history-panel');
        const historyBackBtn = document.getElementById('ai-history-back');
        const historyList = document.getElementById('ai-history-list');

        const standbyMarkup = `
            <div class="message assistant system-standby">
                <div class="message-sender">SYSTEM_MENTOR // STANDBY</div>
                <div class="message-content">
                    <div class="telemetry-line"><span class="telemetry-dot"></span> MENTOR_INTERFACE // ACTIVE</div>
                    <div class="telemetry-line"><span class="telemetry-dot"></span> SOCRATIC_MODE // ONLINE</div>
                    <div class="telemetry-line"><span class="telemetry-dot"></span> AWAITING STUDENT QUERY...</div>
                </div>
            </div>
        `;

        let chatHistory = [];
        let activeChallengeId = null;
        let isStreaming = false;

        // ─── Quota & Popover Helpers ─────────────────────────────
        const QUOTA_LIMIT = 15;
        const XP_PER_EXTRA = 50;

        function getQuotaKey(challengeId) {
            const username = localStorage.getItem('username') || 'user';
            return `seclab_queries_count_${username}_${challengeId}`;
        }

        function getQueryCount(challengeId) {
            if (!challengeId) return 0;
            return parseInt(localStorage.getItem(getQuotaKey(challengeId)) || '0');
        }

        function incrementQueryCount(challengeId) {
            if (!challengeId) return 0;
            const newCount = getQueryCount(challengeId) + 1;
            localStorage.setItem(getQuotaKey(challengeId), String(newCount));
            return newCount;
        }

        function getExtendedQuota(challengeId) {
            if (!challengeId) return 0;
            const extKey = getQuotaKey(challengeId) + '_extend';
            return parseInt(localStorage.getItem(extKey) || '0');
        }

        function getEffectiveLimit(challengeId) {
            return QUOTA_LIMIT + getExtendedQuota(challengeId);
        }

        function updateQuotaUI(challengeId) {
            const count      = getQueryCount(challengeId);
            const effLimit   = getEffectiveLimit(challengeId);
            const overQuota  = count >= effLimit;
            const remaining  = Math.max(0, effLimit - count);

            // ── SVG Ring ──
            const ringArc   = document.getElementById('ai-quota-ring-arc');
            const ringWrap  = document.getElementById('ai-quota-ring-wrap');

            if (ringArc) {
                const CIRC      = 75.4;  // 2 * π * 12
                const progress  = Math.min(count / effLimit, 1);
                ringArc.style.strokeDashoffset = CIRC * (1 - progress);
            }
            if (ringWrap)  ringWrap.classList.toggle('over-quota', overQuota);

            // ── Popover Indicators ──
            const popoverUsed = document.getElementById('popover-used');
            const popoverLeft = document.getElementById('popover-left');
            const popoverProgressBar = document.getElementById('popover-progress-bar');

            if (popoverUsed) popoverUsed.textContent = `${count} / ${effLimit}`;
            if (popoverLeft) {
                if (overQuota) {
                    popoverLeft.textContent = "Quota Exceeded";
                    popoverLeft.className = "value status-error";
                } else if (remaining <= 3) {
                    popoverLeft.textContent = `${remaining} Remaining (Running out soon)`;
                    popoverLeft.className = "value status-warn";
                } else {
                    popoverLeft.textContent = `${remaining} Remaining`;
                    popoverLeft.className = "value status-ok";
                }
            }
            if (popoverProgressBar) {
                const pct = Math.min((count / effLimit) * 100, 100);
                popoverProgressBar.style.width = `${pct}%`;
                popoverProgressBar.classList.toggle('warning-progress', overQuota || remaining <= 3);
            }

            // ── Disable/Enable Input when limit is reached ──
            if (input) {
                if (overQuota) {
                    input.disabled = true;
                    input.placeholder = "Quota exceeded. Continue after extending your quota.";
                    input.value = '';
                    input.style.height = 'auto';
                } else {
                    input.disabled = false;
                    input.placeholder = "Type your question here...";
                }
            }
            if (sendBtn) {
                sendBtn.disabled = overQuota;
            }

            // Disable extend buttons if not activeChallengeId
            const extBannerBtn = document.getElementById('ai-quota-extend-btn');
            const extPopoverBtn = document.getElementById('ai-quota-extend-btn-popover');
            if (extBannerBtn) extBannerBtn.disabled = !challengeId;
            if (extPopoverBtn) extPopoverBtn.disabled = !challengeId;

            // ── Quota Exceeded Banner ──
            const banner = document.getElementById('ai-quota-banner');
            if (banner) banner.classList.toggle('hidden', !overQuota);
        }

        if (statusDot) {
            statusDot.classList.add('breathing');
        }

        // Cyberpunk synthesised sound effects (zero dependency, pure Web Audio)
        function playCyberBeep(isIncoming = false) {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                if (isIncoming) {
                    // High double chirp for incoming AI message
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
                    osc.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.05); // D6
                    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
                    osc.start(audioCtx.currentTime);
                    osc.stop(audioCtx.currentTime + 0.15);
                } else {
                    // Short clicky beep for outgoing user message
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                    gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);
                    osc.start(audioCtx.currentTime);
                    osc.stop(audioCtx.currentTime + 0.06);
                }
            } catch (e) {
                // Browser blocked audio context or audio unsupported
            }
        }

        // ─── Draggable Chat Window ──────────────────────────────
        const header = chatWindow.querySelector('.chat-header');
        if (header) {
            let isDragging = false;
            let startX, startY;
            let startLeft, startTop;

            header.style.cursor = 'move';

            header.addEventListener('mousedown', (e) => {
                // Don't drag if clicking buttons or icons
                if (e.target.closest('button') || e.target.closest('i')) return;
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                // Get current bounding rectangle coordinates
                const rect = chatWindow.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                
                // Switch to fixed position to allow manual coordinate placement
                chatWindow.style.position = 'fixed';
                chatWindow.style.bottom = 'auto';
                chatWindow.style.right = 'auto';
                chatWindow.style.left = `${startLeft}px`;
                chatWindow.style.top = `${startTop}px`;
                chatWindow.style.transform = 'none';
                chatWindow.style.margin = '0';
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                chatWindow.classList.add('dragging');
            });

            function onMouseMove(e) {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;
                
                // Viewport clamping
                const minX = 0;
                const minY = 0;
                const maxX = window.innerWidth - chatWindow.offsetWidth;
                const maxY = window.innerHeight - chatWindow.offsetHeight;
                
                newLeft = Math.max(minX, Math.min(newLeft, maxX));
                newTop = Math.max(minY, Math.min(newTop, maxY));
                
                chatWindow.style.left = `${newLeft}px`;
                chatWindow.style.top = `${newTop}px`;
            }

            function onMouseUp() {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                chatWindow.classList.remove('dragging');
            }
        }



        // ─── Chat History Panel Logic ────────────────────────────
        function loadAllHistories() {
            if (!historyList) return;
            
            historyList.innerHTML = "";
            let historyCount = 0;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('seclab_chat_history_')) {
                    const challengeId = key.replace('seclab_chat_history_', '');
                    
                    // Look up label from window.arena.challenges
                    const challenge = (window.arena && window.arena.challenges) ? window.arena.challenges[challengeId] : null;
                    const challengeName = challenge ? challenge.label : challengeId;
                    
                    let historyData = [];
                    try {
                        historyData = JSON.parse(localStorage.getItem(key)) || [];
                    } catch (e) {
                        console.error("Failed to parse history data", e);
                    }
                    
                    if (historyData.length === 0) continue;
                    
                    historyCount++;
                    
                    const lastMsg = historyData[historyData.length - 1];
                    const lastMsgText = lastMsg ? lastMsg.content : "Empty conversation";
                    const isModel = lastMsg ? lastMsg.role === 'model' : false;
                    const previewText = (isModel ? "Mentor: " : "You: ") + lastMsgText;
                    
                    const itemEl = document.createElement('div');
                    itemEl.className = `history-item ${challengeId === activeChallengeId ? 'active' : ''}`;
                    itemEl.dataset.challengeId = challengeId;
                    
                    itemEl.innerHTML = `
                        <div class="history-item-header">
                            <span class="history-item-title">${challengeName}</span>
                            <button class="history-item-delete" data-challenge-id="${challengeId}" title="Delete Chat History">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="history-item-preview">${previewText}</div>
                        <div class="history-item-meta">
                            <span>${historyData.length} messages</span>
                            <span>${challengeId.toUpperCase()}</span>
                        </div>
                    `;
                    
                    itemEl.addEventListener('click', () => {
                        if (window.arena && typeof window.arena.selectChallenge === 'function') {
                            window.arena.selectChallenge(challengeId);
                        } else {
                            window.loadAIHistory(challengeId);
                        }
                        
                        if (historyPanel) {
                            historyPanel.classList.add('hidden');
                        }
                        playCyberBeep(true);
                    });
                    
                    const deleteBtn = itemEl.querySelector('.history-item-delete');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const cid = deleteBtn.dataset.challengeId;
                            playCyberBeep(false);
                            localStorage.removeItem(`seclab_chat_history_${cid}`);
                            if (cid === activeChallengeId) {
                                chatHistory = [];
                                chatMessages.innerHTML = standbyMarkup;
                            }
                            loadAllHistories();
                        });
                    }
                    
                    historyList.appendChild(itemEl);
                }
            }
            
            if (historyCount === 0) {
                historyList.innerHTML = `
                    <div class="history-empty">
                        <i class="fas fa-folder-open"></i>
                        <span>No conversation history found</span>
                        <small style="opacity: 0.5; font-size: 0.65rem;">Start a conversation on any challenge</small>
                    </div>
                `;
            }
        }

        if (toggleHistoryBtn && historyPanel) {
            toggleHistoryBtn.addEventListener('click', () => {
                historyPanel.classList.remove('hidden');
                loadAllHistories();
                playCyberBeep(false);
            });
        }

        if (historyBackBtn && historyPanel) {
            historyBackBtn.addEventListener('click', () => {
                historyPanel.classList.add('hidden');
                playCyberBeep(false);
            });
        }

        // Simple Markdown formatter to safely render code block syntax with Copy buttons
        function formatMarkdown(text) {
            let escaped = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            // Code blocks: ```language ... ```
            escaped = escaped.replace(/```([a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, (match, lang, code) => {
                const language = lang ? lang.trim() : "code";
                return `
                    <div class="code-block-container">
                        <div class="code-block-header">
                            <span class="code-block-lang">${language}</span>
                            <button class="code-copy-btn" title="Copy Code">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                        <pre><code>${code}</code></pre>
                    </div>
                `;
            });

            // Inline code: `code`
            escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Bold: **text**
            escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // Links: [text](url)
            escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #00e59b; font-weight: bold; text-decoration: underline;">$1</a>');

            // Newlines
            escaped = escaped.replace(/\n/g, '<br>');

            return escaped;
        }

        // Persistence functions
        window.loadAIHistory = function(challengeId) {
            const cid = challengeId || (window.arena && window.arena.state.currentChallenge);
            if (!cid) return;
            activeChallengeId = cid;
            const historyKey = `seclab_chat_history_${cid}`;
            const savedHistory = localStorage.getItem(historyKey);
            
            if (savedHistory) {
                chatHistory = JSON.parse(savedHistory);
                renderHistory();
            } else {
                chatHistory = [];
                chatMessages.innerHTML = standbyMarkup;
            }
            if (scrollBottomBtn) scrollBottomBtn.classList.add('hidden');
            updateQuotaUI(cid);
        };

        function renderHistory() {
            if (chatHistory.length === 0) {
                chatMessages.innerHTML = standbyMarkup;
                return;
            }
            chatMessages.innerHTML = "";
            const userName = (localStorage.getItem('full_name') || localStorage.getItem('username') || 'STUDENT').toUpperCase();
            chatHistory.forEach(msg => {
                const isUser = msg.role === 'user';
                const msgEl = document.createElement('div');
                msgEl.className = `message ${isUser ? 'user' : 'assistant'}`;
                msgEl.innerHTML = `
                    <div class="message-sender">${isUser ? userName : 'SYSTEM_MENTOR // SYSTEM'}</div>
                    <div class="message-content">${formatMarkdown(msg.content)}</div>
                `;
                chatMessages.appendChild(msgEl);
            });
            scrollToBottom();
        }

        function saveHistory() {
            const cid = activeChallengeId || (window.arena && window.arena.state.currentChallenge);
            if (cid) {
                const historyKey = `seclab_chat_history_${cid}`;
                localStorage.setItem(historyKey, JSON.stringify(chatHistory));
            }
        }

        // ─── Popover & Quota Purchase Actions ─────────────────────
        const quotaRingWrap = document.getElementById('ai-quota-ring-wrap');
        const quotaPopover = document.getElementById('ai-quota-popover');
        const popoverClose = document.getElementById('ai-quota-popover-close');

        // Toggle popover on ring wrap click (ignoring inner click on popover itself)
        if (quotaRingWrap && quotaPopover) {
            quotaRingWrap.addEventListener('click', (e) => {
                if (e.target.closest('#ai-quota-popover')) return; // ignore clicks inside popover
                quotaPopover.classList.toggle('hidden');
                e.stopPropagation();
            });
        }

        // Popover close button
        if (popoverClose && quotaPopover) {
            popoverClose.addEventListener('click', (e) => {
                quotaPopover.classList.add('hidden');
                e.stopPropagation();
            });
        }

        // Close popover when clicking anywhere else in the document
        document.addEventListener('click', (e) => {
            if (quotaPopover && !quotaPopover.classList.contains('hidden')) {
                if (!e.target.closest('#ai-quota-ring-wrap')) {
                    quotaPopover.classList.add('hidden');
                }
            }
        });

        // Combined Purchase function
        async function purchaseExtraQuota(triggerBtn) {
            const extendCost = 150; // 150 XP for +5 free questions
            const currentXP  = parseInt(localStorage.getItem('user_xp') || '0');

            if (currentXP < extendCost) {
                // Shake feedback
                triggerBtn.classList.add('btn-shake');
                setTimeout(() => triggerBtn.classList.remove('btn-shake'), 550);
                return;
            }

            // Deduct XP in database to persist
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const res = await fetch(`/api/v1/users/me/deduct-points?amount=${extendCost}`, {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!res.ok) {
                        console.error('Failed to deduct points in database');
                        return;
                    }
                } catch (err) {
                    console.error('Error contacting database to deduct points', err);
                    return;
                }
            }

            // Deduct locally
            if (window.incrementXP) window.incrementXP(-extendCost);

            // Save new extension quota
            const cid = activeChallengeId || (window.arena && window.arena.state.currentChallenge);
            if (cid) {
                const extKey = getQuotaKey(cid) + '_extend';
                const prev = parseInt(localStorage.getItem(extKey) || '0');
                localStorage.setItem(extKey, String(prev + 5));
            }

            // Floating cost animation
            const rect = triggerBtn.getBoundingClientRect();
            const floater = document.createElement('div');
            floater.className = 'xp-float';
            floater.textContent = `-${extendCost} XP`;
            floater.style.left = `${rect.left + rect.width / 2}px`;
            floater.style.top  = `${rect.top - 8}px`;
            floater.style.transform = 'translateX(-50%)';
            document.body.appendChild(floater);
            floater.animate([
                { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
                { opacity: 0, transform: 'translateX(-50%) translateY(-30px)' }
            ], { duration: 900, easing: 'ease-out', fill: 'forwards' })
                .onfinish = () => floater.remove();

            // Refresh badge & popover details
            updateQuotaUI(cid);
        }

        // Register handlers for banner and popover extend buttons
        const extBannerBtn = document.getElementById('ai-quota-extend-btn');
        if (extBannerBtn) {
            extBannerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                purchaseExtraQuota(extBannerBtn);
            });
        }

        const extPopoverBtn = document.getElementById('ai-quota-extend-btn-popover');
        if (extPopoverBtn) {
            extPopoverBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                purchaseExtraQuota(extPopoverBtn);
            });
        }

        // Toggle chat window
        launcher.addEventListener('click', () => {
            chatWindow.classList.toggle('hidden');
            if (!chatWindow.classList.contains('hidden')) {
                input.focus();
                scrollToBottom();
            }
        });

        closeBtn.addEventListener('click', () => {
            chatWindow.classList.add('hidden');
            if (historyPanel) {
                historyPanel.classList.add('hidden');
            }
        });
        // New Chat
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                chatHistory = [];
                if (activeChallengeId) {
                    localStorage.removeItem(`seclab_chat_history_${activeChallengeId}`);
                }
                chatMessages.innerHTML = standbyMarkup;
                if (scrollBottomBtn) scrollBottomBtn.classList.add('hidden');
                playCyberBeep(false);
                input.value = "";
                input.style.height = 'auto';
                input.focus();
            });
        }

        function scrollToBottom() {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }

        function appendMessage(sender, text, isUser, stream = false) {
            const msgEl = document.createElement('div');
            msgEl.className = `message ${isUser ? 'user' : 'assistant'}`;
            const userName = (localStorage.getItem('full_name') || localStorage.getItem('username') || 'STUDENT').toUpperCase();
            
            msgEl.innerHTML = `
                <div class="message-sender">${isUser ? userName : 'SYSTEM_MENTOR // SYSTEM'}</div>
                <div class="message-content"></div>
            `;
            chatMessages.appendChild(msgEl);
            
            const contentEl = msgEl.querySelector('.message-content');
            
            if (isUser || !stream) {
                contentEl.innerHTML = formatMarkdown(text);
                scrollToBottom();
            } else {
                isStreaming = true;
                const tokens = text.match(/\s+|\S+/g) || [];
                let tokenIndex = 0;

                // Natural streaming: base speed + punctuation pauses
                function getDelay(token) {
                    const t = token.trim();
                    if (/[.!?]$/.test(t)) return 130;   // sentence end — breathe
                    if (/[,:;\-–—]$/.test(t)) return 65; // clause pause
                    return 22;                            // normal word pace
                }
                
                input.disabled = true;
                sendBtn.disabled = true;
                
                function streamText() {
                    if (tokenIndex < tokens.length) {
                        const currentToken = tokens[tokenIndex];
                        tokenIndex++;
                        const currentText = tokens.slice(0, tokenIndex).join('');
                        contentEl.innerHTML = formatMarkdown(currentText);
                        scrollToBottom();
                        setTimeout(streamText, getDelay(currentToken));
                    } else {
                        contentEl.innerHTML = formatMarkdown(text);
                        scrollToBottom();
                        isStreaming = false;
                        input.disabled = false;
                        sendBtn.disabled = false;
                        input.focus();
                    }
                }
                streamText();
            }
        }

        // Monitor scroll to show/hide scroll-to-bottom floating button
        chatMessages.addEventListener('scroll', () => {
            if (!scrollBottomBtn) return;
            const threshold = 120; // px from bottom
            const distanceToBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            
            if (distanceToBottom > threshold) {
                scrollBottomBtn.classList.remove('hidden');
            } else {
                scrollBottomBtn.classList.add('hidden');
            }
        });

        // Click handler for scroll-to-bottom button
        if (scrollBottomBtn) {
            scrollBottomBtn.addEventListener('click', () => {
                scrollToBottom();
            });
        }

        // Event delegation for copy buttons inside code blocks
        chatMessages.addEventListener('click', async (e) => {
            const copyBtn = e.target.closest('.code-copy-btn');
            if (copyBtn) {
                const container = copyBtn.closest('.code-block-container');
                const pre = container.querySelector('pre');
                if (pre) {
                    // Extract code without HTML tags
                    const code = pre.innerText || pre.textContent;
                    try {
                        await navigator.clipboard.writeText(code);
                        copyBtn.classList.add('success');
                        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        
                        setTimeout(() => {
                            copyBtn.classList.remove('success');
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                        }, 2000);
                    } catch (err) {
                        console.error('Failed to copy text: ', err);
                    }
                }
            }
        });

        // Auto-expand textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = (input.scrollHeight - 4) + 'px';
        });

        // Send on enter (without shift)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            const challengeId = window.arena && window.arena.state.currentChallenge;
            if (!challengeId) {
                appendMessage('SYSTEM', '⚠️ Please select a challenge from the left menu first to start chatting with the mentor.', false);
                input.value = '';
                input.style.height = 'auto';
                return;
            }
            activeChallengeId = challengeId;

            // Enforce limit check before submitting
            const currentCount = getQueryCount(challengeId);
            const effLimit = getEffectiveLimit(challengeId);
            if (currentCount >= effLimit) {
                updateQuotaUI(challengeId);
                return;
            }

            // Audio feedback (click)
            playCyberBeep(false);

            // Clear input
            input.value = '';
            input.style.height = 'auto';

            // Clear standby if it is shown
            if (chatMessages.querySelector('.system-standby')) {
                chatMessages.innerHTML = "";
            }

            // Add user message to UI and history
            appendMessage('USER', text, true);
            chatHistory.push({ role: 'user', content: text });
            saveHistory();

            // Show typing indicator & animate status dot
            typingIndicator.classList.remove('hidden');
            if (statusDot) {
                statusDot.classList.remove('breathing');
                statusDot.classList.add('active-typing');
            }
            scrollToBottom();

            // Disable inputs
            input.disabled = true;
            sendBtn.disabled = true;

            const token = localStorage.getItem('token');
            const userCode = (window.arena && window.arena.editorInstance) ? window.arena.editorInstance.getValue() : "";
            const userApiKey = localStorage.getItem('gemini_api_key') || "";

            try {
                // Pass the next incremented query count that this prompt represents
                const queriesCount = currentCount + 1;

                const response = await fetch('/api/v1/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        challenge_id: challengeId,
                        user_code: userCode,
                        messages: chatHistory,
                        user_api_key: userApiKey,
                        queries_count: queriesCount
                    })
                });

                if (response.status === 401) {
                    appendMessage('SYSTEM', '⚠️ Session expired. Please log in again.', false);
                    localStorage.removeItem('token');
                    setTimeout(() => window.location.replace('/login'), 2000);
                    return;
                }

                if (!response.ok) {
                    throw new Error('Network response error');
                }

                const data = await response.json();
                
                // Hide typing indicator & return status dot to breathing
                typingIndicator.classList.add('hidden');
                if (statusDot) {
                    statusDot.classList.remove('active-typing');
                    statusDot.classList.add('breathing');
                }

                // Check if reply contains API key errors
                const isKeyError = data.reply.includes("API key not valid") || 
                                   data.reply.includes("API_KEY_INVALID") || 
                                   data.reply.includes("AI Mentor is offline");

                if (isKeyError) {
                    const errorMsg = "⚠️ Invalid or missing Gemini API Key.\n\n[Click here to configure your API key in Settings](/settings#developer)";
                    appendMessage('SYSTEM', errorMsg, false);
                    playCyberBeep(true);
                    return;
                }

                // SUCCESS: Increment count in local storage now that prompt succeeded!
                incrementQueryCount(challengeId);
                updateQuotaUI(challengeId);

                // Handle XP deduction if quota exceeded
                if (data.xp_deducted && data.xp_deducted > 0) {
                    if (window.incrementXP) {
                        window.incrementXP(-data.xp_deducted);
                    }
                    // Show floating XP deduction text anchored to quota ring
                    const badgeEl = document.getElementById('ai-quota-ring-wrap');
                    if (badgeEl) {
                        const rect = badgeEl.getBoundingClientRect();
                        const floater = document.createElement('div');
                        floater.className = 'xp-float';
                        floater.textContent = `-${data.xp_deducted} XP`;
                        floater.style.left = `${rect.left + rect.width / 2}px`;
                        floater.style.top = `${rect.top - 8}px`;
                        floater.style.transform = 'translateX(-50%)';
                        document.body.appendChild(floater);
                        floater.animate([
                            { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
                            { opacity: 0, transform: 'translateX(-50%) translateY(-28px)' }
                        ], { duration: 1000, easing: 'ease-out', fill: 'forwards' })
                            .onfinish = () => floater.remove();
                    }
                    console.warn(`[MENTOR] Query over quota (${queriesCount}/${QUOTA_LIMIT}) — ${data.xp_deducted} XP deducted.`);
                }

                // Update local XP store if backend returned new point total
                if (data.points !== null && data.points !== undefined) {
                    localStorage.setItem('user_xp', data.points);
                }

                // Append AI reply and play chirpy beep (stream = true)
                appendMessage('SYSTEM', data.reply, false, true);
                playCyberBeep(true);
                chatHistory.push({ role: 'model', content: data.reply });
                saveHistory();

            } catch (err) {
                typingIndicator.classList.add('hidden');
                if (statusDot) {
                    statusDot.classList.remove('active-typing');
                    statusDot.classList.add('breathing');
                }
                appendMessage('SYSTEM', '⚠️ Connection error. Please try again later.', false);
                console.error(err);
            } finally {
                if (!isStreaming) {
                    input.disabled = false;
                    sendBtn.disabled = false;
                    input.focus();
                }
            }
        });

        // Initialize history and quota badge on load if challenge is already selected
        const initialChallenge = window.arena && window.arena.state.currentChallenge;
        if (initialChallenge) {
            window.loadAIHistory(initialChallenge);
        } else {
            updateQuotaUI(null);
        }
    }

    initAIAssistant();
});
