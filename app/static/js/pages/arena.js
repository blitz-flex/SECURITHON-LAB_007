/**
 * Arena Page Entry Point — TryHackMe-Style Lab Engine
 * Manages lab lifecycle, status polling, countdown timer, and terminal connection.
 */
import { Arena } from '../modules/arena.js?v=20';
import { Terminal } from '../modules/terminal.js?v=17';

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

        // Create a proxy terminal for the arena log messages (uses xterm but doesn't connect)
        const logTerminal = ensureTerminal() || { log: () => {}, clear: () => {} };

        // Initialize Arena
        window.arena = new Arena({
            challenges: dynamicChallenges,
            terminal: logTerminal,
            onChallengeSelect: (challengeId) => {
                // Map curriculum challenge to lab challenge
                const mapping = {
                    'CWE-89': 'sqli_basic',
                    'CWE-78': 'cmdi_basic',
                };
                // Try to find matching lab challenge
                const cwe = dynamicChallenges[challengeId]?.cwe || '';
                const labId = mapping[cwe] || Object.keys(labChallenges)[0] || 'sqli_basic';
                currentChallengeId = labId;
                localStorage.setItem('lab_challenge_id', labId);
            }
        });
        window.arena.init();
        
    } catch (err) {
        console.error("Failed to load real curriculum:", err);
    }
});
