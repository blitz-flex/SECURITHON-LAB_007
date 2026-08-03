/**
 * Arena Page Entry Point — TryHackMe-Style Lab Engine
 * Manages lab lifecycle, status polling, and terminal connection.
 */
import { Arena } from '../modules/arena.js?v=32';
import { Terminal } from '../modules/terminal.js?v=21';
import { formatMarkdown } from '../utils/markdown.js?v=1';

document.addEventListener('DOMContentLoaded', async () => {

    // ─── DOM References ───────────────────────────────────────
    const labDot = document.getElementById('labDot');
    const labStatusText = document.getElementById('labStatusText');
    const labConnectionCard = document.getElementById('labConnectionCard');
    const labTargetUrl = document.getElementById('labTargetUrl');
    const labCopyBtn = document.getElementById('labCopyBtn');
    const labStatusIndicator = document.querySelector('.lab-status-indicator');
    const terminalEl = document.getElementById('terminalWrapper');
    const terminalHeader = document.getElementById('terminalHeader');
    const terminalConnectionLabel = document.getElementById('terminalConnectionLabel');
    const terminalStatusContainer = document.getElementById('terminalStatusContainer');
    const terminalCloudSpinner = document.getElementById('terminalCloudSpinner');
    const terminalNode = document.getElementById('terminalContainer');
    const aiAssistantContainer = document.getElementById('ai-assistant-container');
    const trackTitle = document.getElementById('trackTitle');
    const arenaLayout = document.getElementById('arenaLayout');
    const consolePanel = document.getElementById('consolePanel');

    if (trackTitle) trackTitle.innerText = "INFRASEC FORGE";

    const username = localStorage.getItem('username') || 'guest';
    const challengeKey = `lab_challenge_id_${username}`;
    const sessionKey = `lab_session_id_${username}`;

    // ─── State ────────────────────────────────────────────────
    let currentSessionId = localStorage.getItem(sessionKey) || null;
    let currentChallengeId = localStorage.getItem(challengeKey) || null;
    let labStatus = 'offline';   // offline | spawning | online
    let pollInterval = null;
    let terminal = null;
    const challengeTerminals = {};
    let hasSelectedArenaChallenge = false;
    let lastSelectedArenaChallengeId = null;
    let bootSimulationTimer = null; // Stays null

    function setConsolePanelVisible(visible) {
        if (arenaLayout) {
            arenaLayout.classList.toggle('console-panel-hidden', !visible);
        }
        if (consolePanel) {
            if (visible) {
                consolePanel.style.display = 'flex';
                // Trigger reflow to make the transition play
                void consolePanel.offsetHeight;
            } else {
                setTimeout(() => {
                    if (arenaLayout.classList.contains('console-panel-hidden')) {
                        consolePanel.style.display = 'none';
                    }
                }, 400);
            }
        }
    }

    setConsolePanelVisible(false);

    function getActiveChallengeTerminalMeta() {
        const challengeId = window.arena?.state?.currentChallenge;
        const challenge = challengeId ? window.arena?.challenges?.[challengeId] : null;
        const cwe = challenge?.cwe || 'CWE';
        const cvss = challenge?.cvss || '--';
        const severity = Number(challenge?.cvss || 0) >= 7 ? 'CRITICAL' : 'HIGH';
        return { cwe, cvss, severity };
    }

    function renderConnectedTerminalBanner(termInstance, clearFirst = true) {
        const term = termInstance?.xterm;
        if (!term) return;

        const { cwe, cvss, severity } = getActiveChallengeTerminalMeta();
        
        const R  = '\x1b[0m';     // Reset
        const TI = '\x1b[1;36m';  // Cyan (title / values)
        const LB = '\x1b[1;30m';  // Dark Gray (labels)
        const OK = '\x1b[1;32m';  // Green (connected status)
        const HI = '\x1b[1;33m';  // Yellow (high severity)
        const CR = '\x1b[1;31m';  // Red (critical severity)
        const DM = '\x1b[0;37m';  // Muted White (info values)
        const GR = '\x1b[90m';    // Gray (separators)
        const SEV = severity === 'CRITICAL' ? CR : HI;

        const cols = term.cols || 80;
        const line = GR + '─'.repeat(Math.max(30, Math.min(cols - 4, 55))) + R;

        if (clearFirst) {
            term.write('\x1b[2J\x1b[H'); // Clear screen for initial connect only
        }

        term.write(`\r\n`);
        term.write(`  ${TI}SECURITHON LABS${R}\r\n`);
        term.write(`  ${line}\r\n`);

        const row = (lbl, val) => {
            const spaces = ' '.repeat(Math.max(0, 10 - lbl.length));
            term.write(`    ${LB}${lbl}${R}${spaces} ${GR}│${R}  ${val}\r\n`);
        };

        row('STATUS',  `${OK}● CONNECTED${R}`);
        row('TARGET',  `${TI}${cwe}${R}`);
        row('CVSS',    `${DM}${cvss}${R} (${SEV}${severity}${R})`);
        row('CRYPTO',  `${DM}TLS 1.3 · AES-256-GCM${R}`);

        term.write(`  ${line}\r\n`);
        term.write(`  ${DM}Type exploit or system commands below.${R}\r\n`);
        term.write(`\r\n`);
    }



    function ensureTerminal(challengeId = currentChallengeId) {
        if (!challengeId || !terminalNode) return null;

        // Hide all terminal wrappers inside terminalContainer
        const allWrappers = terminalNode.querySelectorAll('.challenge-terminal-wrapper');
        allWrappers.forEach(el => el.style.display = 'none');

        let t = challengeTerminals[challengeId];
        if (!t) {
            // Create wrapper element
            const wrapper = document.createElement('div');
            const wrapperId = `terminal_wrapper_${challengeId}`;
            wrapper.id = wrapperId;
            wrapper.className = 'challenge-terminal-wrapper';
            wrapper.style.cssText = 'flex: 1; min-height: 0; display: flex; flex-direction: column; width: 100%; height: 100%;';
            terminalNode.appendChild(wrapper);

            // Create inner terminal element
            const innerDiv = document.createElement('div');
            const innerId = `terminal_xterm_${challengeId}`;
            innerDiv.id = innerId;
            innerDiv.style.cssText = 'flex: 1; min-height: 0; width: 100%; height: 100%;';
            wrapper.appendChild(innerDiv);

            // Create new Terminal wrapper instance
            t = new Terminal(innerId, {
                autoConnect: false,
                onConnect: null
            });
            challengeTerminals[challengeId] = t;
        } else {
            // Show the existing terminal wrapper
            const wrapper = document.getElementById(`terminal_wrapper_${challengeId}`);
            if (wrapper) wrapper.style.display = 'flex';
        }

        terminal = t;
        window.terminalInstance = t;
        if (t.fitAddon) {
            try {
                t.fitAddon.fit();
            } catch(e) {}
        }
        if (window.arena) {
            window.arena.terminal = t;
        }
        return t;
    }

    // ─── UI Helpers ───────────────────────────────────────────
    function setStatus(status) {
        if (labStatus === status) return; // Prevent state-trigger redundancy and terminal redraw flicker
        labStatus = status;

        // Dot color
        if (labDot) {
            labDot.className = 'lab-dot';
            if (status === 'online') labDot.classList.add('lab-dot-online');
            if (status === 'spawning') labDot.classList.add('lab-dot-spawning');
            if (status === 'offline') labDot.classList.add('lab-dot-offline');
        }

        // Status text
        const labels = { online: '', spawning: 'Spawning...', offline: 'Offline' };
        if (labStatusText) {
            labStatusText.textContent = labels[status] || 'Offline';
            labStatusText.style.display = labels[status] ? 'inline' : 'none';
        }

        // Connection card
        if (labConnectionCard) {
            labConnectionCard.style.display = status === 'online' ? 'block' : 'none';
        }

        // Terminal
        if (status === 'online') {
            setConsolePanelVisible(true);
            if (terminalHeader) terminalHeader.style.display = 'flex';
            if (terminalEl) terminalEl.style.display = 'block';
            if (terminalNode) terminalNode.style.display = 'block';
            if (terminalCloudSpinner) terminalCloudSpinner.style.display = 'none';
            if (terminalConnectionLabel) terminalConnectionLabel.textContent = 'ONLINE';
            if (terminalStatusContainer) {
                terminalStatusContainer.className = 'term-connection-status scifi-con-status status-online';
            }
        } else if (status === 'offline') {
            setConsolePanelVisible(false);
            if (terminalHeader) terminalHeader.style.display = 'none';
            if (terminalEl) terminalEl.style.display = 'none';
            if (terminalNode) terminalNode.style.display = 'none';
            if (terminalCloudSpinner) terminalCloudSpinner.style.display = 'none';
            if (terminalConnectionLabel) terminalConnectionLabel.textContent = 'STANDBY';
            if (terminalStatusContainer) {
                terminalStatusContainer.className = 'term-connection-status scifi-con-status status-standby';
            }
        } else {
            // spawning or other transitional states
            setConsolePanelVisible(true);
            if (terminalHeader) terminalHeader.style.display = 'flex';
            if (terminalEl) terminalEl.style.display = 'block';
            if (terminalNode) terminalNode.style.display = 'none'; // Hide terminal canvas
            if (terminalCloudSpinner) {
                terminalCloudSpinner.style.display = 'flex';
                
                // Reset and play sequential reveal
                if (window.crtBootTimeouts) {
                    window.crtBootTimeouts.forEach(t => clearTimeout(t));
                }
                window.crtBootTimeouts = [];

                const items = terminalCloudSpinner.querySelectorAll('.crt-boot-item');
                items.forEach(el => el.classList.remove('revealed'));

                items.forEach((el, idx) => {
                    const t = setTimeout(() => {
                        el.classList.add('revealed');
                    }, idx * 420);
                    window.crtBootTimeouts.push(t);
                });
            }
            if (terminalConnectionLabel) terminalConnectionLabel.textContent = 'BOOTING';
            if (terminalStatusContainer) {
                terminalStatusContainer.className = 'term-connection-status scifi-con-status status-booting';
            }
            
            // Allow DOM display rules to settle, then calculate dimensions
            setTimeout(() => {
                if (terminal) {
                    terminal.fit();
                }
            }, 80);
        }



        // Buttons and Containers
        if (labStatusIndicator) {
            labStatusIndicator.style.display = status === 'online' ? 'none' : 'flex';
        }
        if (aiAssistantContainer) {
            aiAssistantContainer.style.display = 'flex';
        }

    }

    function handleOffline() {
        setStatus('offline');
        if (terminal) terminal.disconnect();
        currentSessionId = null;
        localStorage.removeItem(sessionKey);
        localStorage.removeItem(challengeKey);
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
    async function loadLabChallenges() {
        try {
            const res = await fetch('/api/v1/lab/challenges');
            const data = await res.json();
            data.forEach(ch => {
                labChallenges[ch.id] = ch;
            });
        } catch (e) {
            console.warn('Failed to fetch lab challenges:', e);
        }
    }
    void loadLabChallenges();

    async function startLab(selectedChallenge) {
        if (labStatus === 'spawning') return;
        setStatus('spawning');

        const delayPromise = new Promise(resolve => setTimeout(resolve, 6500));

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
                return false;
            }

            const result = await res.json();
            currentSessionId = result.session_id;
            currentChallengeId = result.challenge_id;
            localStorage.setItem(sessionKey, currentSessionId);
            localStorage.setItem(challengeKey, currentChallengeId);

            // Set target URL
            if (labTargetUrl) {
                labTargetUrl.textContent = `http://${result.target_host}`;
            }

            // Await the guaranteed 6.5s loading animation before showing the terminal
            await delayPromise;

            if (result.status === 'online') {
                setStatus('online');
                const t = ensureTerminal(currentChallengeId);
                if (t) {
                    t.connectToLab(currentSessionId);
                    setTimeout(() => t.fit(), 200);
                }
            } else {
                startPolling(currentSessionId);
            }
            return true;

        } catch (e) {
            console.error('Lab start error:', e);
            setStatus('offline');
            return false;
        }
    }

    async function switchLab(selectedChallenge, options = {}) {
        const forceRestart = Boolean(options.forceRestart);
        if (!forceRestart && currentSessionId && currentChallengeId === selectedChallenge && labStatus === 'online') {
            return true;
        }
        if (currentSessionId && labStatus === 'offline') {
            setStatus('spawning');
        }
        if (currentSessionId) {
            try {
                await fetch('/api/v1/lab/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: currentSessionId })
                });
            } catch (e) {
                console.error('Stop error:', e);
            }
            if (terminal) {
                terminal.disconnect();
                terminal.clear();
            }
            stopPolling();
            currentSessionId = null;
            localStorage.removeItem(sessionKey);
            localStorage.removeItem(challengeKey);
        }
        return startLab(selectedChallenge);
    }

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
                setStatus('online');

                // Connect terminal to the lab attackbox
                const t = ensureTerminal(currentChallengeId);
                if (t) {
                    t.connectToLab(sessionId);
                    // Trigger re-fit after terminal becomes visible
                    setTimeout(() => t.fit(), 200);
                }
            } else if (data.status === 'offline') {
                stopPolling();
                handleOffline();
            }
            // If still 'spawning', keep polling
        } catch (e) {
            console.error('Poll error:', e);
        }
    }

    // ─── Page Load: Resume State ─────────────────────────────
    async function initSandboxSession() {
        if (currentSessionId) {
            try {
                const res = await fetch(`/api/v1/lab/status/${currentSessionId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'online') {
                        if (labTargetUrl) {
                            labTargetUrl.textContent = `http://${data.target_host}`;
                        }
                        labStatus = 'online';
                        setConsolePanelVisible(false);
                    } else if (data.status === 'spawning') {
                        labStatus = 'spawning';
                        startPolling(currentSessionId);
                        setConsolePanelVisible(false);
                    } else {
                        localStorage.removeItem(sessionKey);
                        localStorage.removeItem(challengeKey);
                        currentSessionId = null;
                        labStatus = 'offline';
                        setConsolePanelVisible(false);
                    }
                } else {
                    localStorage.removeItem(sessionKey);
                    localStorage.removeItem(challengeKey);
                    currentSessionId = null;
                    labStatus = 'offline';
                    setConsolePanelVisible(false);
                }
            } catch (e) {
                labStatus = 'offline';
                setConsolePanelVisible(false);
            }
        } else {
            labStatus = 'offline';
            setConsolePanelVisible(false);
        }
    }

    // ─── Academy (Curriculum) Init ───────────────────────────
    const logTerminal = ensureTerminal() || { log: () => { }, clear: () => { }, xterm: { write: () => { } } };
    window.arena = new Arena({
        challenges: {},
        terminal: logTerminal,
        onChallengeSelect: (challengeId) => { }
    });
    window.arena.init();
    void initSandboxSession();

    const CURRICULUM_POLL_MS = 5 * 60 * 1000;
    const requestedTrack = new URLSearchParams(window.location.search).get('track');
    const serverTrack = document.getElementById('arenaLayout')?.dataset.activeTrack;
    const arenaTrack = serverTrack === 'appsec' || requestedTrack === 'appsec' || window.location.pathname === '/appsec' ? 'appsec' : 'infrasec';
    const trackConfig = arenaTrack === 'appsec'
        ? {
            curriculumUrl: '/api/v1/appsec/curriculum?v=2',
            modalTitle: 'Welcome to AppSec Fortress',
            modalSubtitle: 'Practice OWASP, API authorization, dependency risk, and Kubernetes hardening fixes',
            readyTitle: 'Your AppSec Fortress Track Is Ready',
            readySubtitle: 'Choose a lab, review the vulnerable code, then patch and validate',
            loadingMessage: 'This track uses curated vulnerable code and deterministic validators. Your goal is to inspect the scenario, apply the correct secure coding fix, and validate the remediation.',
            readyMessage: (count) => `Your AppSec Fortress track is ready with ${count} curated labs across SAST, API/auth, supply-chain, and Kubernetes hardening. Select a lab from the left panel, study the brief, then patch and validate the fix.`,
            footerMeta: '24 labs · All levels · OWASP + CWE aligned',
            briefingLines: {
                loading: [
                    'Welcome to AppSec Fortress. This module is a guided security exercise designed to teach secure coding through realistic vulnerable scenarios.',
                    'You are not expected to guess the answer immediately. The goal is to learn how to inspect evidence, form a hypothesis, and prove the fix works.',
                    'Your objective is to understand the weakness, explain why it is exploitable, and apply a focused fix that protects the intended behavior.',
                    'Start from the lab list on the left. Open one exercise, read the brief, and identify the exact behavior that must be corrected before touching the code.',
                    'Investigate before editing. Look for trust boundaries, unsafe input handling, missing authorization checks, exposed secrets, risky dependencies, insecure defaults, and assumptions the application makes about users or data.',
                    'When you find the likely issue, describe it in simple terms: what input or action is unsafe, which control is missing, and what impact an attacker could cause.',
                    'Patch with precision. Avoid broad rewrites; change only what is required to remove the root cause and preserve the feature.',
                    'Keep short notes as you work: what you observed, what you changed, and why that change reduces risk.',
                    'If you get stuck, use the AI Mentor. It can ask guiding questions, explain concepts, review your reasoning, and help debug without doing the work for you.',
                    'Use the mentor as a coach: ask why a pattern is risky, what evidence to inspect next, or how to think about the validator failure.',
                    'Experiment safely. If one fix fails validation, compare the evidence again instead of stacking unrelated changes.',
                    'Validate the result after every fix. A complete solution proves that the vulnerable behavior is gone and no new security or functionality issue was introduced.',
                    'Your goal is not just to pass the lab. Build the habit of reading evidence, reasoning clearly, fixing safely, and verifying your work like a professional defender.'
                ],
                ready: [],
                error: [
                    'The AppSec module could not be prepared.',
                    'Retry when the service is available. After it loads, continue with the same flow: understand the issue, patch precisely, and validate the fix.'
                ]
            },
            staticCatalog: true
        }
        : {
            curriculumUrl: '/api/v1/infrasec/curriculum?v=5',
            modalTitle: 'Welcome to the Live InfraSec Arena',
            modalSubtitle: 'Practice real infrastructure defense using verified CISA KEV intelligence',
            readyTitle: 'Your Live InfraSec Arena Is Ready',
            readySubtitle: 'Choose a mission, review the situation report, then patch and validate',
            loadingMessage: 'This arena turns live exploited vulnerabilities into guided defense missions. Your goal is to understand the risk, inspect the affected configuration or code, and apply the correct remediation.',
            readyMessage: (count, data) => {
                const count2026 = data.filter(item => item.is_live && item.year === 2026).length;
                return `Your arena is ready with ${count} curated missions, including ${count2026} active 2026 CISA KEV entries. Select a mission from the left panel, study the situation report, then patch and validate the environment.`;
            },
            footerMeta: 'CISA KEV intelligence feed',
            briefingLines: {
                loading: [
                    'Welcome to the Live InfraSec Arena. This module turns real exploited vulnerability themes into guided infrastructure defense missions.',
                    'You are working as a student defender. Your objective is to understand the risk, verify the evidence, and remove the root cause safely.',
                    'This is not a memory test. Treat it like a small incident response exercise: read the situation, identify what is exposed, decide what evidence matters, and only then remediate.',
                    'Begin with the mission list on the left. Choose a year, month, or track, then open the mission and read the brief before making changes.',
                    'Study the Situation Report carefully. It explains what happened, what is exposed, what evidence to check, and what secure outcome is expected.',
                    'Investigate the affected area before remediation: cloud setting, IAM policy, secret exposure, network path, service configuration, Terraform backend, or drifted infrastructure state.',
                    'Before applying a fix, ask yourself three questions: what asset is affected, what control failed, and how would this be abused in a real environment?',
                    'Make the fix narrow and intentional. Avoid changing unrelated settings just to make a validator pass; the goal is to address the actual exposure.',
                    'Keep brief notes while you work: the evidence you confirmed, the risk you found, and the reason your fix should close it.',
                    'If you get stuck, use the AI Mentor. It can guide your thinking, explain the security concept, help you reason through evidence, and support debugging without replacing your work.',
                    'Use the mentor as a coach: ask what to inspect next, why a control matters, how to interpret a failed check, or how to compare two remediation options.',
                    'Experiment safely. If validation fails, revisit the evidence and adjust the root-cause fix instead of changing unrelated infrastructure.',
                    'Apply the smallest correct remediation. Then validate the result with the lab controls and confirm the control would hold in a real environment.',
                    'Validation matters because infrastructure fixes are only complete when you can prove the risky path is closed and the intended service still works.',
                    'Your goal is to practice the full defender workflow: assess impact, verify facts, fix the root cause, and prove the environment is safer than before.'
                ],
                ready: [],
                error: [
                    'The live InfraSec module is not available right now.',
                    'Retry the sync to load the latest missions. When it returns, follow the same method: investigate evidence, remediate root cause, and validate controls.'
                ]
            },
            staticCatalog: false
        };
    const trackSubtitle = document.getElementById('trackSubtitle');
    if (trackTitle) trackTitle.textContent = arenaTrack === 'appsec' ? 'APPSEC FORTRESS' : 'INFRASEC FORGE';
    if (trackSubtitle) {
        trackSubtitle.textContent = arenaTrack === 'appsec'
            ? 'CURATED APPLICATION SECURITY LABS'
            : 'LIVE INFRASTRUCTURE DEFENSE MISSIONS';
    }
    let liveFeedRevision = null;
    let curriculumSyncTimer = null;
    let curriculumLoaded = false;

    const curriculumModal = document.getElementById('arenaCurriculumModal');
    const curriculumModalTitle = document.getElementById('arenaCurriculumModalTitle');
    const curriculumModalSubtitle = document.querySelector('.arena-curriculum-modal__subtitle');
    const curriculumModalMessage = document.getElementById('arenaCurriculumModalMessage');
    const curriculumModalRadar = document.getElementById('arenaCurriculumModalRadar');
    const curriculumModalSuccess = document.getElementById('arenaCurriculumModalSuccess');
    const curriculumModalError = document.getElementById('arenaCurriculumModalError');
    const curriculumModalRetry = document.getElementById('arenaCurriculumModalRetry');
    const curriculumModalContinue = document.getElementById('arenaCurriculumModalContinue');
    const curriculumModalClose = document.getElementById('arenaCurriculumModalClose');
    const curriculumModalStatus = document.getElementById('arenaCurriculumModalStatus');
    const curriculumModalTelemetry = document.getElementById('arenaCurriculumModalTelemetry');
    const curriculumModalFooterMeta = document.getElementById('arenaCurriculumModalFooterMeta');
    const curriculumBriefingStream = document.getElementById('arenaCurriculumBriefingStream');
    const curriculumBriefingStatus = document.getElementById('arenaCurriculumBriefingStatus');
    let briefingStreamTimers = [];

    function clearBriefingStreamTimers() {
        briefingStreamTimers.forEach(timer => clearTimeout(timer));
        briefingStreamTimers = [];
    }

    function scheduleBriefingStep(callback, delay) {
        const timer = setTimeout(callback, delay);
        briefingStreamTimers.push(timer);
    }

    function setBriefingStatus(text) {
        if (curriculumBriefingStatus) curriculumBriefingStatus.textContent = text;
    }

    function getBriefingTypingDelay(char, nextChar) {
        if (char === '.' || char === '!' || char === '?') return 180;
        if (char === ',' || char === ';' || char === ':') return 90;
        if (char === ' ') return 24;
        if (nextChar === ' ') return 40;
        return 20 + Math.floor(Math.random() * 14);
    }

    function streamBriefingLines(state) {
        if (!curriculumBriefingStream) return;
        clearBriefingStreamTimers();

        const lines = trackConfig.briefingLines?.[state] || trackConfig.briefingLines?.loading || [];
        curriculumBriefingStream.innerHTML = '';
        setBriefingStatus(state === 'ready' ? 'Briefing complete' : state === 'error' ? 'Action required' : 'Streaming guidance');

        let lineIndex = 0;
        const typeLine = () => {
            if (lineIndex >= lines.length) {
                setBriefingStatus(state === 'loading' ? 'Guidance ready' : state === 'ready' ? 'Briefing complete' : 'Retry available');
                return;
            }

            const lineEl = document.createElement('div');
            lineEl.className = 'arena-curriculum-modal__stream-line is-typing';
            const textEl = document.createElement('span');
            textEl.className = 'arena-curriculum-modal__stream-text';
            const typedTextEl = document.createElement('span');
            const cursorEl = document.createElement('span');
            cursorEl.className = 'arena-curriculum-modal__stream-cursor';
            cursorEl.setAttribute('aria-hidden', 'true');
            textEl.append(typedTextEl, cursorEl);

            lineEl.append(textEl);
            curriculumBriefingStream.appendChild(lineEl);
            curriculumBriefingStream.scrollTop = curriculumBriefingStream.scrollHeight;

            const text = lines[lineIndex];
            let charIndex = 0;
            const typeChar = () => {
                typedTextEl.textContent = text.slice(0, charIndex);
                curriculumBriefingStream.scrollTop = curriculumBriefingStream.scrollHeight;
                if (charIndex < text.length) {
                    const currentChar = text.charAt(charIndex);
                    const nextChar = text.charAt(charIndex + 1);
                    charIndex += 1;
                    scheduleBriefingStep(typeChar, charIndex === 1 ? 180 : getBriefingTypingDelay(currentChar, nextChar));
                    return;
                }

                lineEl.classList.remove('is-typing');
                cursorEl.remove();
                lineIndex += 1;
                scheduleBriefingStep(typeLine, 650);
            };

            typeChar();
        };

        scheduleBriefingStep(typeLine, 250);
    }

    function setCurriculumTelemetry(lines) {
        if (!curriculumModalTelemetry) return;
        curriculumModalTelemetry.innerHTML = lines.map(line => `
            <div class="telemetry-line"><span class="telemetry-dot"></span> ${line}</div>
        `).join('');
    }

    function setCurriculumVisual(state) {
        if (curriculumModalRadar) curriculumModalRadar.hidden = state !== 'loading';
        if (curriculumModalSuccess) curriculumModalSuccess.hidden = state !== 'ready';
        if (curriculumModalError) curriculumModalError.hidden = state !== 'error';
    }

    function applyFeedStatusMeta(status) {
        if (!curriculumModalFooterMeta || !status) return;
        const parts = [];
        if (status.iso_week) parts.push(`ISO week ${status.iso_week}`);
        if (status.refresh_mode === 'weekly') parts.push('Weekly refresh');
        else if (status.refresh_mode) parts.push(String(status.refresh_mode).toUpperCase());
        if (status.live_count) parts.push(`${status.live_count} CVE entries`);
        curriculumModalFooterMeta.textContent = parts.join(' · ') || trackConfig.footerMeta;
    }

    function hideCurriculumModal() {
        setCurriculumModal('hidden');
    }

    function setCurriculumModal(state, message = '') {
        if (!curriculumModal) return;

        if (state === 'hidden') {
            clearBriefingStreamTimers();
            curriculumModal.classList.remove('active', 'is-error', 'is-ready');
            curriculumModal.setAttribute('aria-hidden', 'true');
            curriculumModal.removeAttribute('aria-busy');
            return;
        }

        let cx = lastClickCoords ? lastClickCoords.x : (window.innerWidth / 2);
        let cy = lastClickCoords ? lastClickCoords.y : (window.innerHeight / 2);
        curriculumModal.style.setProperty('--click-x', `${cx}px`);
        curriculumModal.style.setProperty('--click-y', `${cy}px`);

        const curPanel = curriculumModal.querySelector('.arena-curriculum-modal__panel');
        if (curPanel) {
            curPanel.scrollTop = 0;
            curPanel.style.setProperty('--click-x', `${cx}px`);
            curPanel.style.setProperty('--click-y', `${cy}px`);
            curPanel.style.transformOrigin = `${cx}px ${cy}px`;
        }
        const curBody = curriculumModal.querySelector('.arena-curriculum-modal__body');
        if (curBody) curBody.scrollTop = 0;
        curriculumModal.setAttribute('aria-hidden', 'false');

        curriculumModal.classList.add('active');
        curriculumModal.scrollTop = 0;

        if (state === 'loading') {
            curriculumModal.classList.remove('is-error', 'is-ready');
            curriculumModal.setAttribute('aria-busy', 'true');
            if (curriculumModalTitle) curriculumModalTitle.textContent = trackConfig.modalTitle;
            if (curriculumModalSubtitle) curriculumModalSubtitle.textContent = trackConfig.modalSubtitle;
            if (curriculumModalStatus) curriculumModalStatus.textContent = 'Preparing missions';
            setCurriculumTelemetry([
                'Mission catalog // preparing',
                'Student workflow // select, investigate, remediate'
            ]);
            setCurriculumVisual('loading');
            streamBriefingLines('loading');
            if (curriculumModalMessage) {
                curriculumModalMessage.textContent = message || trackConfig.loadingMessage;
            }
            if (curriculumModalRetry) curriculumModalRetry.hidden = true;
            if (curriculumModalContinue) curriculumModalContinue.hidden = true;
            return;
        }

        if (state === 'ready') {
            curriculumModal.classList.remove('is-error');
            curriculumModal.classList.add('is-ready');
            curriculumModal.removeAttribute('aria-busy');
            if (curriculumModalTitle) curriculumModalTitle.textContent = trackConfig.readyTitle;
            if (curriculumModalSubtitle) curriculumModalSubtitle.textContent = trackConfig.readySubtitle;
            if (curriculumModalStatus) curriculumModalStatus.textContent = 'Ready to start';
            setCurriculumTelemetry([
                'Mission catalog // verified',
                'Student workflow // ready'
            ]);
            setCurriculumVisual('ready');
            if (curriculumModalMessage) {
                curriculumModalMessage.textContent = message || 'Start with the mission list on the left. Read the brief, identify the risky configuration or code, apply the fix, and use the lab controls to validate your work.';
            }
            if (curriculumModalRetry) curriculumModalRetry.hidden = true;
            if (curriculumModalContinue) curriculumModalContinue.hidden = false;
            return;
        }

        if (state === 'error') {
            curriculumModal.classList.remove('is-ready');
            curriculumModal.classList.add('is-error');
            curriculumModal.removeAttribute('aria-busy');
            if (curriculumModalTitle) curriculumModalTitle.textContent = 'Live Mission Catalog Is Unavailable';
            if (curriculumModalSubtitle) curriculumModalSubtitle.textContent = 'The arena could not load the latest training missions';
            if (curriculumModalStatus) curriculumModalStatus.textContent = 'Action required';
            setCurriculumTelemetry([
                'Mission catalog // unavailable',
                'Student workflow // retry required'
            ]);
            setCurriculumVisual('error');
            streamBriefingLines('error');
            if (curriculumModalMessage) {
                curriculumModalMessage.textContent = message || 'The training workflow is still the same: choose a mission, investigate the report, patch the issue, and validate. Retry the sync to load the latest live catalog.';
            }
            if (curriculumModalRetry) curriculumModalRetry.hidden = false;
            if (curriculumModalContinue) curriculumModalContinue.hidden = true;
        }
    }

    if (curriculumModalClose) {
        curriculumModalClose.addEventListener('click', hideCurriculumModal);
    }

    if (curriculumModalContinue) {
        curriculumModalContinue.addEventListener('click', hideCurriculumModal);
    }

    if (curriculumModalRetry) {
        curriculumModalRetry.addEventListener('click', async () => {
            setCurriculumModal('loading');
            const ok = await syncInfrasecCurriculum({ silent: false });
            if (!ok && !curriculumLoaded) {
                setCurriculumModal('error');
            }
        });
    }

    function mapCurriculumItem(item) {
        const displayTitle = item.display_title || item.title;
        return {
            id: item.id,
            label: displayTitle,
            displayTitle,
            title: item.title,
            targetLabel: item.target_label,
            targetVendor: item.target_vendor,
            targetProduct: item.target_product,
            attackTheme: item.attack_theme,
            remediationTheme: item.remediation_theme,
            cveId: item.cve_id,
            level: item.level,
            category: item.category,
            difficulty: item.difficulty,
            cvss: item.cvss,
            file: item.file_context,
            cwe: item.cwe,
            isLive: Boolean(item.is_live),
            year: item.year,
            month: item.month,
            trackGroup: item.track_group,
            threatGroup: item.threat_group,
            topRank: item.top_rank,
            yearRank: item.year_rank,
            yearLimit: item.year_limit,
            task: item.task,
            briefing: item.briefing,
            situationReport: item.situation_report,
            hint: item.hint,
            vulnCode: item.vulnCode || [],
            stage: item.stage || null,
            intelQuery: item.intel_query || null,
            historyCaseStudy: item.history_case_study || null,
            inst: item.task
        };
    }

    function showCurriculumFeedNotice(message) {
        const el = document.getElementById('curriculumFeedStatus');
        if (!el) return;
        el.textContent = message;
        el.hidden = false;
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => {
            el.hidden = true;
        }, 10000);
    }

    async function syncInfrasecCurriculum(options = { silent: false }) {
        try {
            const res = await fetch(trackConfig.curriculumUrl);
            if (!res.ok) {
                if (!options.silent && !curriculumLoaded) {
                    setCurriculumModal('error', 'The live mission catalog could not be retrieved from the server. Please try again.');
                }
                return false;
            }
            const data = await res.json();
            const dynamicChallenges = {};
            data.forEach(item => {
                dynamicChallenges[item.id] = mapCurriculumItem(item);
            });

            const isUpdate = liveFeedRevision !== null;
            window.arena.refreshChallenges(dynamicChallenges);

            if (!curriculumLoaded) {
                curriculumLoaded = true;
                setCurriculumModal(
                    'ready',
                    trackConfig.readyMessage(data.length, data)
                );
            }

            if (!trackConfig.staticCatalog && isUpdate && options.silent) {
                const count2026 = data.filter(item => item.is_live && item.year === 2026).length;
                showCurriculumFeedNotice(`Live feed updated — ${count2026} CVE entries for 2026`);
            }

            return true;
        } catch (err) {
            console.error('Failed to load real curriculum:', err);
            if (!options.silent && !curriculumLoaded) {
                setCurriculumModal('error', 'A network issue interrupted the mission sync. Please retry when the connection is stable.');
            }
            return false;
        }
    }

    async function pollLiveFeedStatus() {
        if (trackConfig.staticCatalog) return;
        try {
            const res = await fetch('/api/v1/infrasec/live-feed-status');
            if (!res.ok) return;
            const status = await res.json();
            if (liveFeedRevision !== null && status.revision === liveFeedRevision) return;
            const changed = liveFeedRevision !== null;
            liveFeedRevision = status.revision;
            await syncInfrasecCurriculum({ silent: changed });
        } catch (err) {
            console.warn('Live feed status poll failed:', err);
        }
    }

    function startCurriculumAutoSync() {
        if (trackConfig.staticCatalog) return;
        if (curriculumSyncTimer) clearInterval(curriculumSyncTimer);
        curriculumSyncTimer = setInterval(pollLiveFeedStatus, CURRICULUM_POLL_MS);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) pollLiveFeedStatus();
        });
    }

    // ── DevSecOps Intel Modal Inspector ────────────────────────
    function buildDynamicIntelContent(entry, stage) {
        const desc = entry.description || entry.summary || 'No detailed description available.';
        const id = (entry.id || entry.cve_id || entry.ghsa_id || entry.name || 'CVE-UNKNOWN').toUpperCase();
        const cwe = (entry.cwe || entry.cwe_id || '').toUpperCase();

        // Extract target script/file if mentioned in NVD text
        let fileMatch = desc.match(/in\s+([a-zA-Z0-9_\-\.\/]+\.(?:php|py|js|pl|cgi|yaml|xml|json|go|rs))/i);
        let targetFile = fileMatch ? fileMatch[1] : (stage === 'cluster' ? 'deployment.yaml' : 'app/main.py');

        // Extract software/framework name from NVD text
        let softMatch = desc.match(/in\s+(?:[a-zA-Z0-9_\-\.\/]+\s+in\s+)?([A-Z0-9][a-zA-Z0-9_\-\s]{2,25})/i);
        let softName = softMatch ? softMatch[1].trim() : 'Enterprise Application';

        // Extract attack parameter vector
        let paramMatch = desc.match(/via\s+(?:the\s+)?([^\.]+)/i);
        let paramStr = paramMatch ? paramMatch[1].trim() : 'unsanitized HTTP inputs';
        let rawParamName = (paramStr.match(/\$?([a-zA-Z0-9_]+)/) || [])[1] || 'input';

        // ── Extended classification using per-entry data ──────────
        const dl = desc.toLowerCase();
        const isSQL   = dl.includes('sql') || cwe.includes('CWE-89');
        const isXSS   = dl.includes('cross-site') || dl.includes('xss') || cwe.includes('CWE-79');
        const isCmd   = dl.includes('command') || dl.includes('exec') || cwe.includes('CWE-78');
        const isSSRF  = dl.includes('ssrf') || dl.includes('server-side request') || cwe.includes('CWE-918');
        const isPath  = dl.includes('path traversal') || dl.includes('directory traversal') || cwe.includes('CWE-22');
        const isDeser = dl.includes('deserializ') || dl.includes('unserializ') || cwe.includes('CWE-502');
        const isAuth  = (dl.includes('authenticat') && dl.includes('bypass')) || cwe.includes('CWE-287') || cwe.includes('CWE-306');
        const isBOF   = dl.includes('buffer overflow') || dl.includes('out-of-bounds') || cwe.includes('CWE-120') || cwe.includes('CWE-125');

        // ── Per-entry unique metadata ─────────────────────────────
        const cvssScore = entry.cvss_score || entry.cvss || null;
        const pubYear   = ((entry.published || entry.published_at || '').match(/\d{4}/) || ['N/A'])[0];
        const cvssNum   = parseFloat(cvssScore) || 7.5;
        const riskTier  = cvssNum >= 9.0 ? 'CRITICAL' : cvssNum >= 7.0 ? 'HIGH' : cvssNum >= 4.0 ? 'MEDIUM' : 'LOW';
        const descSnippet = desc.length > 200 ? desc.substring(0, 200) + '...' : desc;

        let vulnCode = '', hardenedCode = '', caseStudy = '', standards = '', analysis = '', impactSummary = '', fixPrinciple = '';

        if (isSQL) {
            analysis = `This vulnerability occurs when user input (parameter '${rawParamName}') is directly concatenated into SQL queries within ${targetFile} without sanitization. An attacker can supply special SQL characters (e.g. ' OR 1=1 --) to bypass authentication and exfiltrate database records.`;
            impactSummary = `Full database exfiltration (theft of user credentials, PII data) or table truncation.`;
            fixPrinciple = `Never concatenate user input directly into SQL strings. Use prepared statements with parameter binding (PDO / ORM).`;
            vulnCode = `// ❌ VULNERABLE — ${id} exploit vector in ${targetFile}\n$val = $_REQUEST['${rawParamName}'];\n$sql = "SELECT * FROM accounts WHERE field = '" . $val . "'";\n$res = mysql_query($sql);  // No escaping — injectable`;
            hardenedCode = `// ✅ HARDENED — Parameterized query (${targetFile})\n$val = $_REQUEST['${rawParamName}'];\n$stmt = $pdo->prepare("SELECT id FROM accounts WHERE field = :v");\n$stmt->execute([':v' => $val]);  // Bound — injection impossible`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">TalkTalk Telecom Mass Database Breach (2015)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">A 15-year-old attacker launched automated tools (sqlmap) against an unparameterized SQL query in a web endpoint. By injecting UNION SELECT statements into parameter '${rawParamName}', the attacker extracted the full backend customer schema row by row.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">156,959 customer records leaked (including banking details and sort codes). TalkTalk suffered £60 Million in direct financial loss and a record £400,000 regulatory fine.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Single unparameterized SQL queries routinely destroy enterprise organizations. Enforce prepared statements across all PDO/ORM database layers.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-89'} | OWASP A03:2021 — Injection | NIST SP 800-53 SI-10 | PCI-DSS 6.3.1`;

        } else if (isXSS) {
            analysis = `This flaw arises when ${softName} accepts parameter '${rawParamName}' in ${targetFile} and reflects it directly into the browser DOM without HTML entity encoding. Attackers can inject malicious JavaScript (<script>...</script>) to steal session cookies.`;
            impactSummary = `Session hijacking, account takeover, credential theft, and malicious DOM manipulation.`;
            fixPrinciple = `Sanitize and HTML-encode all dynamic output (e.g. htmlspecialchars) before rendering in the browser.`;
            vulnCode = `// ❌ VULNERABLE — ${id} XSS vector in ${targetFile}\n$input = $_GET['${rawParamName}'];\necho "<div class='out'>" . $input . "</div>";  // Raw reflection`;
            hardenedCode = `// ✅ HARDENED — HTML entity encoded output (${targetFile})\n$input = htmlspecialchars($_GET['${rawParamName}'], ENT_QUOTES | ENT_HTML5, 'UTF-8');\necho "<div class='out'>" . $input . "</div>";`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">The Legendary Samy MySpace XSS Worm (2005)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">Samy Kamkar crafted a self-propagating JavaScript payload inside an unescaped profile field. Whenever a user viewed his profile, the script ran in their browser, added Samy as a friend, and copied the payload to their own profile page.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Infected over 1,000,000 user profiles in under 20 hours, taking down MySpace entirely. It remains the fastest-spreading viral web payload in internet history.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Never trust user input displayed in HTML. Always apply HTML entity encoding (htmlspecialchars) and configure Content Security Policy (CSP) headers.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-79'} | OWASP A03:2021 — Injection | NIST SP 800-53 SI-11 | WCAG 4.1.3`;

        } else if (isCmd) {
            analysis = `This critical flaw occurs when ${softName} passes parameter '${rawParamName}' in ${targetFile} directly to the OS shell (system/exec). Attackers can append command separators (;, |, &&) to execute arbitrary system commands.`;
            impactSummary = `Arbitrary Remote Code Execution (RCE) and complete server takeover under the web server identity.`;
            fixPrinciple = `Avoid OS shell invocations on user input. Use safe API functions with argument arrays.`;
            vulnCode = `// ❌ VULNERABLE — ${id} command injection in ${targetFile}\n$cmd = "process --input " . $_GET['${rawParamName}'];\nsystem($cmd);  // Shell metacharacters unescaped`;
            hardenedCode = `// ✅ HARDENED — Argument array, no shell invocation (${targetFile})\n$arg = preg_replace('/[^a-zA-Z0-9_.\\-]/', '', $_GET['${rawParamName}']);\nexecFile('/usr/bin/process', ['--input', $arg]);`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">Shellshock Bash Command Injection Crisis (CVE-2014-6271)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">Attackers sent crafted HTTP requests containing trailing Bash function definitions (() { :;}; /bin/bash -c '...'). When web servers passed user inputs to Bash, the shell executed trailing commands instantly without authentication.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Compromised over 500,000 enterprise web servers within 48 hours, enabling botnet recruitment, cryptomining, and deep internal network access across major tech firms.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Eliminate shell invocations on untrusted inputs. Use array-based process execution APIs (execFile/spawn) that bypass the OS shell entirely.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-78'} | OWASP A03:2021 — Injection | NIST SP 800-53 CM-7 | CIS Control 16`;

        } else if (isSSRF) {
            analysis = `This vulnerability allows attackers to force the ${softName} server to make arbitrary outbound HTTP requests. By supplying internal targets (e.g. http://169.254.169.254/ for Cloud Metadata) in '${rawParamName}', attackers can access internal services.`;
            impactSummary = `Internal network pivoting, cloud infrastructure credential theft (AWS/GCP IAM keys).`;
            fixPrinciple = `Enforce strict URL allowlisting and block internal RFC-1918 / 169.254.x.x IP addresses.`;
            vulnCode = `// ❌ VULNERABLE — ${id} SSRF vector in ${targetFile}\n$url = $_GET['${rawParamName}'];\n$response = file_get_contents($url);  // Fetches any URL including internal`;
            hardenedCode = `// ✅ HARDENED — Allowlist + DNS rebinding protection (${targetFile})\n$url = $_GET['${rawParamName}'];\n$parsed = parse_url($url);\nif (!in_array($parsed['host'], ALLOWED_HOSTS)) die('Blocked');\n$response = safeHttpGet($url);`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">Capital One Cloud Metadata Breach (2019)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">An attacker exploited an SSRF flaw in a WAF server. By supplying the AWS Cloud Metadata IP (http://169.254.169.254/latest/meta-data/) as parameter '${rawParamName}', the attacker extracted temporary IAM admin keys from the EC2 metadata service.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">100,000,000 customer credit card applications leaked. Capital One agreed to an $80 Million OCC regulatory fine and a $190 Million class-action settlement.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Block internal IP ranges (169.254.x.x, 10.x.x.x) at network/application firewalls and enable IMDSv2 session tokens on cloud instances.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-918'} | OWASP A10:2021 — SSRF | NIST SP 800-53 SC-7 | CSA CCM`;

        } else if (isPath) {
            analysis = `This vulnerability occurs when ${targetFile} accepts a filename in parameter '${rawParamName}' and reads it from disk. Without path validation, attackers supply '../../../../etc/passwd' to read arbitrary files.`;
            impactSummary = `Unauthorized reading of server configurations, private keys, environment secrets, and system files.`;
            fixPrinciple = `Canonicalize paths using realpath() and verify the target path resides strictly inside the allowed webroot.`;
            vulnCode = `// ❌ VULNERABLE — ${id} path traversal in ${targetFile}\n$file = $_GET['${rawParamName}'];\nreadfile('/var/www/uploads/' . $file);  // No canonicalization`;
            hardenedCode = `// ✅ HARDENED — Canonicalized path validation (${targetFile})\n$base = realpath('/var/www/uploads');\n$path = realpath($base . '/' . $_GET['${rawParamName}']);\nif (strpos($path, $base) !== 0) die('Access denied');\nreadfile($path);`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">Apache HTTP Server Path Traversal Zero-Day (CVE-2021-41773)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">Attackers used URL-encoded %2e%2e/ traversal sequences to bypass path validation rules in Apache httpd 2.4.49, escaping the document root to read system files like /etc/passwd and execute CGI scripts.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Actively exploited in the wild within 24 hours of disclosure, exposing configuration files, database credentials, and system binaries across tens of thousands of web servers.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Canonicalize paths with realpath() and explicitly verify the resolved path starts with the allowed base directory path before reading files.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-22'} | OWASP A01:2021 — Broken Access Control | NIST SP 800-53 AC-3`;

        } else if (isDeser) {
            analysis = `Occurs when ${softName} receives serialized objects in parameter '${rawParamName}' (unserialize) and reconstructs them without integrity verification. Attackers construct gadget chains to execute code upon object instantiation.`;
            impactSummary = `Uncontrolled Remote Code Execution (RCE) and full application compromise.`;
            fixPrinciple = `Replace binary serialization with safe JSON formats and enforce strict schema validation.`;
            vulnCode = `// ❌ VULNERABLE — ${id} deserialization in ${targetFile}\n$data = base64_decode($_POST['${rawParamName}']);\n$obj = unserialize($data);  // Attacker-controlled object graph`;
            hardenedCode = `// ✅ HARDENED — JSON schema validation (${targetFile})\n$json = json_decode($_POST['${rawParamName}'], true);\nif (!validateSchema($json, EXPECTED_SCHEMA)) die('Invalid');\n$obj = createFromValidated($json);`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">Equifax Mass Identity Theft Breach (2017)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">Attackers sent a malicious HTTP header containing a Java OGNL expression payload. When Apache Struts deserialized the unvalidated input, it executed a gadget chain that opened a reverse shell on Equifax servers.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Stole sensitive data (SSNs, birth dates, driver licenses) of 147,000,000 consumers. Equifax agreed to a landmark $700 Million FTC settlement.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Never deserialize data from untrusted sources. Use safe structured data formats like JSON with strict schema validation.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-502'} | OWASP A08:2021 — Insecure Deserialization | NIST SP 800-53 SI-7`;

        } else if (isAuth) {
            analysis = `A logical flaw in the authentication mechanism inside ${targetFile}. By manipulating parameter '${rawParamName}', attackers circumvent credential verification and gain administrator privileges.`;
            impactSummary = `Unauthenticated access to administrative interfaces and unauthorized user impersonation.`;
            fixPrinciple = `Enforce centralized deny-by-default authentication checks and validate session state on every endpoint.`;
            vulnCode = `// ❌ VULNERABLE — ${id} auth bypass in ${targetFile}\n$user = authenticateUser($_POST['user'], $_POST['pass']);\nif ($user || $_POST['${rawParamName}'] === 'admin') {\n    grantAccess();  // Logic flaw — bypassable\n}`;
            hardenedCode = `// ✅ HARDENED — Strict positive auth check (${targetFile})\n$user = authenticateUser($_POST['user'], $_POST['pass']);\nif ($user && $user->isVerified() && $user->hasPermission('access')) {\n    grantAccess();\n}`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">VMware Workspace ONE Admin Auth Bypass (CVE-2022-22972)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">Attackers supplied crafted HTTP header parameters that bypassed internal authentication checks in the web application, tricking the server into treating unauthenticated requests as validated admin sessions.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Granted instant root admin privileges across 100,000+ enterprise deployments, triggering an emergency CISA directive instructing US federal agencies to patch immediately.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Never rely on inline conditional checks for authentication. Centralize auth decisions using positive security models (deny-by-default).</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-287'} | OWASP A07:2021 — Identification & Authentication Failures | NIST SP 800-53 IA-2`;

        } else if (isBOF) {
            analysis = `A low-level memory safety flaw in C/C++ code inside ${targetFile}. Supplying oversized input in parameter '${rawParamName}' overflows the memory buffer (strcpy), overwriting adjacent stack frames.`;
            impactSummary = `Process crash (Denial of Service) or execution of attacker-controlled shellcode in memory.`;
            fixPrinciple = `Use memory-bounded string functions (strncpy, snprintf) or migrate to memory-safe languages.`;
            vulnCode = `// ❌ VULNERABLE — ${id} buffer overflow in ${targetFile}\nchar buf[256];\nstrcpy(buf, input_${rawParamName});  // No bounds checking`;
            hardenedCode = `// ✅ HARDENED — Bounded copy with null-termination (${targetFile})\nchar buf[256];\nstrncpy(buf, input_${rawParamName}, sizeof(buf) - 1);\nbuf[sizeof(buf) - 1] = '\0';`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">WannaCry Ransomware & EternalBlue SMB Exploitation (2017)</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">The EternalBlue exploit targeted an SMBv1 buffer overflow. Attackers sent crafted network packets containing oversized buffer payloads that overwrote memory stack pointers and injected kernel shellcode.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Infected 230,000 computers across 150 countries in hours, crippling hospitals (UK NHS), shipping ports (Maersk), and factories, causing over $4 Billion in damage.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Always use bounded memory functions (strncpy, snprintf) and compile code with stack protection (ASLR, DEP, Stack Canaries).</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'CWE-120'} | OWASP A06:2021 — Vulnerable Components | NIST SP 800-53 SI-16 | CERT C`;

        } else {
            analysis = `This vulnerability relates to improper handling of parameter '${rawParamName}' inside ${targetFile} in ${softName}. Lack of input validation allows unauthorized actors to breach security boundaries.`;
            impactSummary = `Bypass of security controls and potential data exfiltration.`;
            fixPrinciple = `Apply strict input validation and boundary checks at the API layer.`;
            vulnCode = `// ❌ VULNERABLE — ${id} in ${targetFile}\nprocess_input($_REQUEST['${rawParamName}']);  // Unsafe handling`;
            hardenedCode = `// ✅ HARDENED — Validated processing (${targetFile})\n$clean = validate_and_sanitize($_REQUEST['${rawParamName}'], EXPECTED_TYPE);\nprocess_input($clean);`;
            caseStudy = `
                <div class="breach-dossier">
                    <div class="breach-dossier__hero">
                        <div class="breach-dossier__tag"><i class="fas fa-bolt"></i> REAL-WORLD INCIDENT DOSSIER</div>
                        <div class="breach-dossier__title">Production API Data Exposure Incident</div>
                        <div class="breach-dossier__subtitle">Target Component: <b>${softName}</b> (file: <code>${targetFile}</code>) | Parameter: <code>'${rawParamName}'</code></div>
                    </div>
                    <div class="breach-dossier__grid">
                        <div class="breach-dossier__card breach-dossier__card--attack">
                            <span class="breach-dossier__label"><i class="fas fa-skull-crossbones"></i> How Attackers Exploited It</span>
                            <p class="breach-dossier__text">Attackers manipulated unvalidated API parameters to bypass access boundary checks, enumerating internal state objects and accessing privileged endpoints without authorization.</p>
                        </div>
                        <div class="breach-dossier__card breach-dossier__card--impact">
                            <span class="breach-dossier__label"><i class="fas fa-fire"></i> Fallout & Financial Damage</span>
                            <p class="breach-dossier__text">Exposed sensitive internal records and triggered mandatory security incident response procedures, leading to emergency hotfixes and audit compliance reviews.</p>
                        </div>
                    </div>
                    <div class="breach-dossier__footer">
                        <i class="fas fa-shield-halved"></i>
                        <span><strong>Key Developer Lesson:</strong> Validate all input parameters at the API boundary before passing them to application business logic.</span>
                    </div>
                </div>
            `;
            standards = `${cwe || 'N/A'} | OWASP Top 10 | NIST SP 800-53 SI-10 | ISO/IEC 27001 A.14.2`;
        }

        return { targetFile, softName, paramStr, rawParamName, analysis, impactSummary, fixPrinciple, vulnCode, hardenedCode, caseStudy, standards };
    }

    let lastClickCoords = null;
    document.addEventListener('click', (e) => {
        lastClickCoords = { x: e.clientX, y: e.clientY };
    }, true);

    window.closeHackerModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('active');
        modal.classList.remove('is-closing');
    };

    function openIntelModal(entry, stage) {
        const modal = document.getElementById('appsecIntelModal');
        const modalBody = document.getElementById('appsecIntelModalBody');
        if (!modal || !modalBody) return;

        let tech = buildDynamicIntelContent(entry, stage);
        let idStr = entry.id || entry.cve_id || entry.ghsa_id || entry.name || 'INTEL-VECTOR';
        let cveStr = (entry.cve_id && entry.cve_id !== idStr) ? ` / ${entry.cve_id}` : '';
        let sev = (entry.severity || 'HIGH').toUpperCase();
        let cvss = entry.cvss_score ? `CVSS ${entry.cvss_score}` : 'CVSS 7.5';
        let pubDate = entry.published || entry.published_at || 'LIVE INTEL';

        modalBody.innerHTML = `
            <!-- Top Hero Card & Metadata Bar -->
            <div class="intel-modal-hero">
                <div class="intel-modal-hero__main">
                    <div class="intel-modal-hero__title">
                        <span class="intel-modal-hero__id">${idStr}${cveStr}</span>
                    </div>
                    <div class="intel-modal-hero__meta">
                        <span><i class="fas fa-calendar-alt"></i> ${pubDate}</span>
                        <span><i class="fas fa-microchip"></i> ${tech.softName}</span>
                        <span><i class="fas fa-file-code"></i> <code>${tech.targetFile}</code></span>
                    </div>
                </div>
                <div class="intel-modal-hero__badges">
                    <span class="intel-badge intel-badge--sev-${sev.toLowerCase()}">${sev}</span>
                    <span class="intel-badge intel-badge--cvss">${cvss}</span>
                </div>
            </div>

            <!-- Single Unified Sequential Stream -->
            <div class="intel-stream-container">
                <!-- SECTION 1: Threat Briefing & Analysis -->
                <div class="intel-stream-section">
                    <div class="intel-stream-section__header">
                        <i class="fas fa-shield-cat"></i>
                        <span>THREAT BRIEFING & ANALYSIS</span>
                    </div>
                    
                    <div class="intel-card intel-card--briefing">
                        <div class="intel-card__title">
                            <i class="fas fa-graduation-cap"></i> VULNERABILITY EXPLANATION & STUDENT GUIDE
                        </div>
                        
                        <div class="intel-briefing-box intel-briefing-box--accent" style="margin-top: 6px;">
                            <span class="intel-briefing-box__label"><i class="fas fa-shield-virus"></i> Core Security Flaw & Attack Mechanism</span>
                            <p class="intel-briefing-box__text" style="font-size: 0.82rem; line-height: 1.6;">${tech.analysis}</p>
                        </div>

                        <div class="intel-briefing-details">
                            <div class="intel-briefing-detail-item">
                                <i class="fas fa-crosshairs"></i>
                                <div>
                                    <strong>Target Surface:</strong>
                                    <span>Parameter <code>'${tech.rawParamName || 'input'}'</code> inside <code>${tech.targetFile}</code> (${tech.softName})</span>
                                </div>
                            </div>
                            <div class="intel-briefing-detail-item">
                                <i class="fas fa-triangle-exclamation"></i>
                                <div>
                                    <strong>Security Impact:</strong>
                                    <span>${tech.impactSummary}</span>
                                </div>
                            </div>
                            <div class="intel-briefing-detail-item">
                                <i class="fas fa-key"></i>
                                <div>
                                    <strong>Remediation Principle:</strong>
                                    <span>${tech.fixPrinciple}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="intel-card intel-card--breach">
                        <div class="intel-card__title">
                            <i class="fas fa-user-ninja"></i> DISCLOSED BREACH HISTORY & REAL-WORLD IMPACT
                        </div>
                        <div class="intel-card__dossier-body">
                            ${tech.caseStudy}
                        </div>
                    </div>
                </div>

                <!-- SECTION 2: Code Blueprint & Fix -->
                <div class="intel-stream-section">
                    <div class="intel-stream-section__header">
                        <i class="fas fa-code-compare"></i>
                        <span>CODE BLUEPRINT & REMEDIATION (${tech.targetFile})</span>
                    </div>

                    <div class="intel-diff-banner">
                        <div class="intel-diff-banner__left">
                            <i class="fas fa-code-branch"></i>
                            <span>TARGET FILE: <code>${tech.targetFile}</code></span>
                        </div>
                        <div class="intel-diff-banner__right">
                            <span class="intel-diff-tag intel-diff-tag--vuln">REASON: UNTRUSTED ${tech.paramStr || 'INPUT'}</span>
                            <span class="intel-diff-tag intel-diff-tag--secure">FIX: STRICT SANITIZATION</span>
                        </div>
                    </div>

                    <div class="intel-code-grid">
                        <!-- Vulnerable Anti-Pattern -->
                        <div class="intel-code-box intel-code-box--vuln">
                            <div class="intel-code-box__header">
                                <div class="intel-code-box__title-group">
                                    <span class="intel-code-box__dot intel-code-box__dot--red"></span>
                                    <span class="intel-code-box__label">
                                        VULNERABLE ANTI-PATTERN
                                    </span>
                                </div>
                                <button class="intel-code-copy-btn" onclick="navigator.clipboard.writeText(\`${tech.vulnCode.replace(/`/g, '\\`')}\`); this.classList.add('copied'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!'; setTimeout(() => { this.classList.remove('copied'); this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy Unsafe Code'; }, 2000)">
                                    <i class="fas fa-copy"></i> Copy Unsafe Code
                                </button>
                            </div>
                            <div class="intel-code-box__body">
                                ${tech.vulnCode.split('\n').map((line, i) => `
                                    <div class="intel-code-line intel-code-line--vuln">
                                        <span class="intel-code-line__num">${String(i + 1).padStart(2, '0')}</span>
                                        <span class="intel-code-line__content">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Hardened Secure Pattern -->
                        <div class="intel-code-box intel-code-box--secure">
                            <div class="intel-code-box__header">
                                <div class="intel-code-box__title-group">
                                    <span class="intel-code-box__dot intel-code-box__dot--green"></span>
                                    <span class="intel-code-box__label">
                                        HARDENED SECURE PATTERN
                                    </span>
                                </div>
                                <button class="intel-code-copy-btn" onclick="navigator.clipboard.writeText(\`${tech.hardenedCode.replace(/`/g, '\\`')}\`); this.classList.add('copied'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!'; setTimeout(() => { this.classList.remove('copied'); this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy Fix Solution'; }, 2000)">
                                    <i class="fas fa-copy"></i> Copy Fix Solution
                                </button>
                            </div>
                            <div class="intel-code-box__body">
                                ${tech.hardenedCode.split('\n').map((line, i) => `
                                    <div class="intel-code-line intel-code-line--secure">
                                        <span class="intel-code-line__num">${String(i + 1).padStart(2, '0')}</span>
                                        <span class="intel-code-line__content">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION 3: Enterprise Compliance & Standards -->
                <div class="intel-stream-section">
                    <div class="intel-stream-section__header">
                        <i class="fas fa-award"></i>
                        <span>COMPLIANCE & ENTERPRISE STANDARDS ALIGNMENT</span>
                    </div>

                    <div class="intel-matrix-grid">
                        <div class="intel-matrix-card intel-matrix-card--owasp">
                            <div class="intel-matrix-card__icon"><i class="fas fa-fire-flame-curved"></i></div>
                            <div class="intel-matrix-card__content">
                                <span class="intel-matrix-card__kicker">OWASP TOP 10 RISK CATEGORY</span>
                                <span class="intel-matrix-card__val">${tech.standards.split('|').find(s => s.includes('OWASP')) || 'OWASP Top 10 Application Security'}</span>
                                <span class="intel-matrix-card__status"><i class="fas fa-shield"></i> Mandatory Remediation Item</span>
                            </div>
                        </div>

                        <div class="intel-matrix-card intel-matrix-card--nist">
                            <div class="intel-matrix-card__icon"><i class="fas fa-building-shield"></i></div>
                            <div class="intel-matrix-card__content">
                                <span class="intel-matrix-card__kicker">NIST SP 800-53 CONTROL ALIGNMENT</span>
                                <span class="intel-matrix-card__val">${tech.standards.split('|').find(s => s.includes('NIST')) || 'NIST SP 800-53 Input Validation'}</span>
                                <span class="intel-matrix-card__status"><i class="fas fa-check-circle"></i> Federal Control Requirement</span>
                            </div>
                        </div>

                        <div class="intel-matrix-card intel-matrix-card--cwe">
                            <div class="intel-matrix-card__icon"><i class="fas fa-bug"></i></div>
                            <div class="intel-matrix-card__content">
                                <span class="intel-matrix-card__kicker">CWE / MITRE VULNERABILITY TAXONOMY</span>
                                <span class="intel-matrix-card__val">${tech.standards.split('|').find(s => s.includes('CWE')) || 'CWE Common Weakness Enumeration'}</span>
                                <span class="intel-matrix-card__status"><i class="fas fa-database"></i> MITRE Classified Weakness</span>
                            </div>
                        </div>

                        <div class="intel-matrix-card intel-matrix-card--iso">
                            <div class="intel-matrix-card__icon"><i class="fas fa-certificate"></i></div>
                            <div class="intel-matrix-card__content">
                                <span class="intel-matrix-card__kicker">ISO/IEC & CERT SECURITY AUDIT</span>
                                <span class="intel-matrix-card__val">${tech.standards.split('|').find(s => s.includes('ISO') || s.includes('CERT') || s.includes('CSA')) || 'ISO/IEC 27001 Security Control'}</span>
                                <span class="intel-matrix-card__status"><i class="fas fa-lock"></i> Audit Verified Standard</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        let cx = lastClickCoords ? lastClickCoords.x : (window.innerWidth / 2);
        let cy = lastClickCoords ? lastClickCoords.y : (window.innerHeight / 2);
        modal.style.setProperty('--click-x', `${cx}px`);
        modal.style.setProperty('--click-y', `${cy}px`);

        const intelPanel = modal.querySelector('.appsec-intel-modal__panel');
        if (intelPanel) {
            intelPanel.scrollTop = 0;
            intelPanel.style.setProperty('--click-x', `${cx}px`);
            intelPanel.style.setProperty('--click-y', `${cy}px`);
            intelPanel.style.transformOrigin = `${cx}px ${cy}px`;
        }

        modal.classList.add('active');
        modal.scrollTop = 0;
        const intelBody = modal.querySelector('.appsec-intel-modal__body');
        if (intelBody) intelBody.scrollTop = 0;
        const intelStream = modal.querySelector('.intel-stream-container');
        if (intelStream) intelStream.scrollTop = 0;
    }

    // ── DevSecOps Intel Panel ───────────────────────────────────
    async function loadIntelPanel(challengeId) {
        const panel = document.getElementById('intelPanel');
        const loading = document.getElementById('intelLoading');
        const items = document.getElementById('intelItems');
        const empty = document.getElementById('intelEmpty');
        const badge = document.getElementById('intelStageBadge');
        if (!panel) return;

        const challenge = window.arena?.challenges?.[challengeId];
        if (!challenge || !challenge.stage || !challenge.intelQuery) {
            panel.style.display = 'none';
            return;
        }

        // Keep panel hidden initially during fetch
        panel.style.display = 'none';
        loading.style.display = 'none';
        items.innerHTML = '';
        items.style.display = 'none';
        empty.style.display = 'none';

        // Set stage badge
        const stageLabels = { commit: 'COMMIT STAGE', build: 'BUILD STAGE', cluster: 'CLUSTER STAGE' };
        badge.textContent = stageLabels[challenge.stage] || challenge.stage.toUpperCase();
        badge.className = 'intel-stage-badge stage-' + challenge.stage;

        try {
            let data = [];
            const q = challenge.intelQuery;

            if (challenge.stage === 'commit' && q.nvd_cwe) {
                const res = await fetch(`/api/v1/appsec/intel/cwe/${encodeURIComponent(q.nvd_cwe)}`);
                if (res.ok) data = await res.json();
            } else if (challenge.stage === 'build' && q.github_ecosystem && q.github_package) {
                const res = await fetch(`/api/v1/appsec/intel/supply/${encodeURIComponent(q.github_ecosystem)}/${encodeURIComponent(q.github_package)}`);
                if (res.ok) data = await res.json();
            } else if (challenge.stage === 'cluster' && q.k8s_cwe) {
                const res = await fetch(`/api/v1/appsec/intel/k8s/${encodeURIComponent(q.k8s_cwe)}`);
                if (res.ok) data = await res.json();
            }

            if (!data || data.length === 0) {
                panel.style.display = 'none';
                return;
            }

            items.style.display = 'flex';
            panel.style.display = 'block';
            data.forEach(entry => {
                const card = document.createElement('div');
                card.className = 'intel-card';
                card.style.cursor = 'pointer';

                if (challenge.stage === 'commit') {
                    // NVD CVE card
                    const sevClass = (entry.severity || '').toLowerCase();
                    card.innerHTML = `
                        <div class="intel-card-header">
                            <span class="intel-card-id">${entry.id || 'N/A'}</span>
                            ${entry.severity ? `<span class="intel-card-severity sev-${sevClass}">${entry.severity}</span>` : ''}
                            ${entry.cvss_score ? `<span class="intel-card-severity sev-medium">CVSS ${entry.cvss_score}</span>` : ''}
                            <span class="intel-card-date">${entry.published || ''}</span>
                        </div>
                        <div class="intel-card-desc">${entry.description || 'No description available.'}</div>
                        <div style="margin-top: 6px; font-size: 0.62rem; color: #00ff87; font-weight: 700;">
                            <i class="fas fa-expand-alt" style="margin-right: 4px;"></i> INSPECT FULL INTEL MODAL
                        </div>
                    `;
                } else if (challenge.stage === 'build') {
                    // GitHub Advisory card (Restored to original external GitHub link)
                    const sevClass = (entry.severity || '').toLowerCase();
                    card.innerHTML = `
                        <div class="intel-card-header">
                            <span class="intel-card-id">${entry.ghsa_id || 'N/A'}</span>
                            ${entry.cve_id ? `<span class="intel-card-id" style="opacity: 0.6;">${entry.cve_id}</span>` : ''}
                            ${entry.severity ? `<span class="intel-card-severity sev-${sevClass}">${entry.severity}</span>` : ''}
                            <span class="intel-card-date">${entry.published_at || ''}</span>
                        </div>
                        <div class="intel-card-desc">${entry.summary || 'No summary.'}</div>
                        ${entry.html_url ? `<a class="intel-card-link" href="${entry.html_url}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> View on GitHub</a>` : ''}
                    `;
                } else if (challenge.stage === 'cluster') {
                    // Artifact Hub policy card
                    card.innerHTML = `
                        <div class="intel-card-header">
                            <span class="intel-card-id">${entry.name || 'N/A'}</span>
                            ${entry.version ? `<span class="intel-card-severity sev-medium">v${entry.version}</span>` : ''}
                            ${entry.repository ? `<span class="intel-card-date">${entry.repository}</span>` : ''}
                        </div>
                        <div class="intel-card-desc">${entry.description || 'No description.'}</div>
                        <button class="intel-card-link" style="background: none; border: none; padding: 0; font-family: inherit; cursor: pointer; text-align: left;">
                            <i class="fas fa-expand-alt" style="margin-right: 4px; color: #a371f7;"></i> INSPECT POLICY IN MODAL
                        </button>
                    `;
                }

                if (challenge.stage === 'commit' || challenge.stage === 'cluster') {
                    card.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openIntelModal(entry, challenge.stage);
                    });
                }

                items.appendChild(card);
            });

        } catch (err) {
            console.warn('Intel panel fetch failed:', err);
            loading.style.display = 'none';
            panel.style.display = 'none';
        }
    }

    // Wire up onChallengeSelect BEFORE curriculum sync
    window.arena.onChallengeSelect = async (challengeId) => {
        // Automatically switch to Editor tab on mobile screens
        const editorTabBtn = document.querySelector('.arena-tab-btn[data-target="editor"]');
        if (editorTabBtn) {
            editorTabBtn.click();
        }

        const isFirstSelectOfSession = lastSelectedArenaChallengeId === null;
        lastSelectedArenaChallengeId = challengeId;
        currentChallengeId = challengeId;
        hasSelectedArenaChallenge = true;
        if (window.arena) {
            if (!window.arena.state) window.arena.state = {};
            window.arena.state.currentChallenge = challengeId;
        }
        setConsolePanelVisible(true);

        // Fetch DevSecOps Intel for AppSec labs
        if (arenaTrack === 'appsec') {
            void loadIntelPanel(challengeId);
        }

        const mapping = {
            'CWE-89': 'sqli_basic',
            'CWE-79': 'sqli_basic',
            'CWE-287': 'sqli_basic',
            'CWE-78': 'cmdi_basic',
        };
        const cwe = window.arena.challenges[challengeId]?.cwe || '';
        const labId = mapping[cwe] || Object.keys(labChallenges)[0] || 'sqli_basic';
        if (labStatus === 'online') {
            if (isFirstSelectOfSession) {
                setStatus('spawning');
                // Hide any active terminals during spawn loader
                const container = document.getElementById('terminalContainer');
                if (container) {
                    const allWrappers = container.querySelectorAll('.challenge-terminal-wrapper');
                    allWrappers.forEach(el => el.style.display = 'none');
                }
                setTimeout(() => {
                    setStatus('online');
                    const t = ensureTerminal(challengeId);
                    if (t) {
                        t.clear();
                        renderConnectedTerminalBanner(t);
                        if (t.fitAddon) { try { t.fitAddon.fit(); t.sendResize(); } catch(e) {} }
                        t.connectToLab(currentSessionId);
                        window.arena.terminal = t;
                        setTimeout(() => t.fit(), 200);
                    }
                }, 6500);
            } else {
                setStatus('online');
                const t = ensureTerminal(challengeId);
                if (t) {
                    window.arena.terminal = t;
                    if (!t.socket || t.socket.readyState !== WebSocket.OPEN) {
                        t.disconnect();
                        t.clear();
                        renderConnectedTerminalBanner(t, true);
                        if (t.fitAddon) { try { t.fitAddon.fit(); t.sendResize(); } catch(e) {} }
                        t.connectToLab(currentSessionId);
                    }
                    setTimeout(() => t.fit(), 200);
                }
            }
        } else if (labStatus === 'spawning') {
            setStatus('spawning');
        } else if (labStatus === 'offline') {
            void switchLab(labId);
        }

        if (window.loadAIHistory) {
            window.loadAIHistory(challengeId);
        }
    };

    try {
        if (trackConfig.staticCatalog) {
            if (curriculumModalFooterMeta) curriculumModalFooterMeta.textContent = trackConfig.footerMeta;
        } else {
            const statusRes = await fetch('/api/v1/infrasec/live-feed-status');
            if (statusRes.ok) {
                const feedStatus = await statusRes.json();
                liveFeedRevision = feedStatus.revision;
                applyFeedStatusMeta(feedStatus);
            }
        }
        await syncInfrasecCurriculum({ silent: false });
        startCurriculumAutoSync();

        // If a challenge is active in current state, load its intel panel
        if (arenaTrack === 'appsec' && window.arena?.state?.currentChallenge) {
            void loadIntelPanel(window.arena.state.currentChallenge);
        }
    } catch (err) {
        console.error("Failed to load real curriculum:", err);
        if (!curriculumLoaded) {
            setCurriculumModal('error', 'The arena could not complete its initialization sequence. Please retry the sync.');
        }
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
        const actionTrigger = document.getElementById('ai-action-trigger');
        const actionPopover = document.getElementById('ai-action-popover');
        const actionItems = document.querySelectorAll('.mentor-action-item');
        const modeBadge = document.getElementById('ai-mode-badge');

        let currentMode = "socratic";

        const standbyMarkup = `
            <div class="message assistant system-standby">
                <div class="message-sender">MENTOR</div>
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

        // AI Assistant is included directly in console.html inside #terminalWrapper,
        // so it stays within the terminal boundaries naturally without manual JS positioning.
        function positionMentorOverlay() {
            // No-op: handled entirely by CSS position: absolute; inset: 0;
        }

        // ─── Quota & Popover Helpers ─────────────────────────────
        const DEFAULT_QUOTA_LIMIT = (new Date() < new Date('2026-09-01T00:00:00Z')) ? 1000 : 15;
        const quotaStateByChallenge = {};

        function defaultQuota() {
            return {
                used: 0,
                limit: DEFAULT_QUOTA_LIMIT,
                remaining: DEFAULT_QUOTA_LIMIT,
                reset_at: null,
            };
        }

        function normalizeQuota(quota) {
            const limit = Number(quota?.limit) || DEFAULT_QUOTA_LIMIT;
            const used = Math.max(0, Number(quota?.used) || 0);
            return {
                used,
                limit,
                remaining: Math.max(0, Number.isFinite(Number(quota?.remaining)) ? Number(quota.remaining) : limit - used),
                reset_at: quota?.reset_at || null,
            };
        }

        function setQuotaState(challengeId, quota) {
            const normalized = normalizeQuota(quota);
            if (challengeId) {
                quotaStateByChallenge[challengeId] = normalized;
            }
            return normalized;
        }

        function getQuotaState(challengeId) {
            return challengeId && quotaStateByChallenge[challengeId]
                ? quotaStateByChallenge[challengeId]
                : defaultQuota();
        }

        function getQuotaResetLabel(quota) {
            const resetAt = quota?.reset_at ? new Date(quota.reset_at).getTime() : 0;
            if (!resetAt || Number.isNaN(resetAt)) return 'Resets on Monday';

            const remainingMs = Math.max(0, resetAt - Date.now());
            const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

            if (days > 0) return `Resets in ${days}d ${hours}h`;
            if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
            return `Resets in ${minutes}m`;
        }

        async function fetchQuota(challengeId) {
            if (!challengeId) {
                updateQuotaUI(null);
                return;
            }

            const token = localStorage.getItem('token');
            if (!token) {
                updateQuotaUI(challengeId);
                return;
            }

            try {
                const response = await fetch(`/api/v1/ai/quota/${encodeURIComponent(challengeId)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.status === 401) return;
                if (!response.ok) throw new Error('Quota status unavailable');
                const quota = await response.json();
                updateQuotaUI(challengeId, quota);
            } catch (err) {
                console.warn('Failed to load AI Mentor quota:', err);
                updateQuotaUI(challengeId);
            }
        }

        function updateQuotaUI(challengeId, quotaData = null) {
            const quota = quotaData ? setQuotaState(challengeId, quotaData) : getQuotaState(challengeId);
            const count = quota.used;
            const effLimit = quota.limit;
            const overQuota = quota.remaining <= 0;
            const remaining = quota.remaining;

            // ── SVG Ring ──
            const ringArc = document.getElementById('ai-quota-ring-arc');
            const ringWrap = document.getElementById('ai-quota-ring-wrap');

            if (ringArc) {
                const CIRC = 75.4;  // 2 * π * 12
                const progress = Math.min(count / effLimit, 1);
                ringArc.style.strokeDashoffset = CIRC * (1 - progress);
            }
            if (ringWrap) ringWrap.classList.toggle('over-quota', overQuota);

            // ── Popover Indicators ──
            const popoverUsed = document.getElementById('popover-used');
            const popoverLeft = document.getElementById('popover-left');
            const popoverProgressBar = document.getElementById('popover-progress-bar');
            const popoverPercent = document.getElementById('popover-percent');
            const popoverReset = document.getElementById('popover-reset');
            const quotaPopover = document.getElementById('ai-quota-popover');
            const pct = Math.min((count / effLimit) * 100, 100);

            if (popoverUsed) popoverUsed.textContent = `${count} / ${effLimit}`;
            if (popoverReset) popoverReset.textContent = getQuotaResetLabel(quota);
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
            if (popoverPercent) popoverPercent.textContent = `${Math.round(pct)}%`;
            if (quotaPopover) {
                quotaPopover.classList.toggle('quota-state-error', overQuota);
                quotaPopover.classList.toggle('quota-state-warn', !overQuota && remaining <= 3);
            }
            if (popoverProgressBar) {
                popoverProgressBar.style.width = `${pct}%`;
                popoverProgressBar.classList.toggle('warning-progress', overQuota || remaining <= 3);
            }

            // ── Disable/Enable Input when limit is reached ──
            if (input) {
                if (overQuota) {
                    input.disabled = true;
                    input.placeholder = "Quota exceeded for this task.";
                    input.value = '';
                    input.style.height = 'auto';
                } else {
                    input.disabled = false;
                    input.placeholder = "Ask mentor...";
                }
            }
            if (sendBtn) {
                sendBtn.disabled = overQuota;
            }

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

        // ─── Chat History Panel Logic ────────────────────────────
        function loadAllHistories() {
            if (!historyList) return;

            historyList.innerHTML = "";
            let historyCount = 0;

            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('seclab_chat_history_')) {
                    keys.push(key);
                }
            }

            keys.sort().reverse();

            for (const key of keys) {
                const rawId = key.replace('seclab_chat_history_', '');
                if (!rawId || rawId === 'undefined' || rawId === 'null') continue;

                let challengeId = rawId;
                const match = rawId.match(/^(.*)_(\d{13})$/);
                if (match) {
                    challengeId = match[1];
                }

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
                itemEl.className = `history-item ${key === `seclab_chat_history_${activeChallengeId}` ? 'active' : ''}`;
                itemEl.dataset.key = key;
                itemEl.dataset.challengeId = challengeId;

                itemEl.innerHTML = `
                    <div class="history-item-header">
                        <span class="history-item-title">${challengeName}</span>
                        <button class="history-item-delete" data-key="${key}" title="Delete Chat History">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div class="history-item-preview">${previewText}</div>
                    <div class="history-item-meta">
                        <span>${historyData.length} messages</span>
                        <span>${challengeId.toUpperCase()}</span>
                    </div>
                `;

                itemEl.addEventListener('click', (e) => {
                    if (e.target.closest('.history-item-delete')) return;
                    if (window.arena && typeof window.arena.selectChallenge === 'function') {
                        window.arena.selectChallenge(challengeId);
                    }
                    if (window.loadAIHistoryKey) {
                        window.loadAIHistoryKey(key, challengeId);
                    } else if (window.loadAIHistory) {
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
                        const targetKey = deleteBtn.dataset.key;
                        playCyberBeep(false);
                        localStorage.removeItem(targetKey);
                        if (targetKey === `seclab_chat_history_${activeChallengeId}`) {
                            chatHistory = [];
                            chatMessages.innerHTML = standbyMarkup;
                        }
                        loadAllHistories();
                    });
                }

                historyList.appendChild(itemEl);
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

        // Persistence functions
        window.loadAIHistoryKey = function (key, challengeId) {
            const cid = challengeId || activeChallengeId || currentChallengeId;
            if (cid) activeChallengeId = cid;

            const savedHistory = localStorage.getItem(key);
            if (savedHistory) {
                try {
                    chatHistory = JSON.parse(savedHistory);
                    renderHistory();
                } catch (e) {
                    chatHistory = [];
                    chatMessages.innerHTML = standbyMarkup;
                }
            } else {
                chatHistory = [];
                chatMessages.innerHTML = standbyMarkup;
            }
            if (scrollBottomBtn) scrollBottomBtn.classList.add('hidden');
            updateQuotaUI(cid);
            fetchQuota(cid);
        };

        window.loadAIHistory = function (challengeId) {
            const cid = challengeId || activeChallengeId || currentChallengeId || (window.arena && window.arena.state && window.arena.state.currentChallenge);
            if (!cid || cid === 'undefined' || cid === 'null') return;
            activeChallengeId = cid;
            if (window.arena) {
                if (!window.arena.state) window.arena.state = {};
                window.arena.state.currentChallenge = cid;
            }

            // Reset typing and input states when switching challenges
            if (typingIndicator) typingIndicator.classList.add('hidden');
            if (statusDot) {
                statusDot.classList.remove('active-typing');
                statusDot.classList.add('breathing');
            }
            if (input) input.disabled = false;
            if (sendBtn) sendBtn.disabled = false;

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
            fetchQuota(cid);
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
                    <div class="message-sender">${isUser ? 'STUDENT' : 'MENTOR'}</div>
                    <div class="message-content">${formatMarkdown(msg.content)}</div>
                `;
                chatMessages.appendChild(msgEl);
            });
            scrollToBottom();
        }

        function saveHistory() {
            const cid = activeChallengeId || currentChallengeId || (window.arena && window.arena.state && window.arena.state.currentChallenge);
            if (cid && cid !== 'undefined' && cid !== 'null') {
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

        function setMentorOpen(isOpen) {
            if (chatWindow) {
                chatWindow.classList.toggle('hidden', !isOpen);
            }
            if (launcher) {
                launcher.classList.toggle('is-open', isOpen);
                launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            }
            // Let the terminal wrapper remain in place to preserve container height
            // The mentor window overlay with inset:0 will cover it completely
            if (isOpen) {
                positionMentorOverlay();
                if (input) input.focus();
                scrollToBottom();
            } else {
                if (chatWindow) {
                    chatWindow.style.top = chatWindow.style.left =
                    chatWindow.style.width = chatWindow.style.height = '';
                }
                if (historyPanel) historyPanel.classList.add('hidden');
            }
        }

        // Toggle chat window
        launcher.addEventListener('click', () => {
            // Switch to Terminal tab on mobile since the mentor window resides inside it
            const terminalTabBtn = document.querySelector('.arena-tab-btn[data-target="terminal"]');
            if (terminalTabBtn) {
                terminalTabBtn.click();
            }
            const willOpen = chatWindow.classList.contains('hidden');
            setMentorOpen(willOpen);
        });

        window.addEventListener('resize', () => {
            if (!chatWindow.classList.contains('hidden')) {
                positionMentorOverlay();
            }
        });

        closeBtn.addEventListener('click', () => {
            setMentorOpen(false);
        });
        // New Chat
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                const cid = activeChallengeId || currentChallengeId || (window.arena && window.arena.state && window.arena.state.currentChallenge);
                if (cid && chatHistory.length > 0) {
                    // Archive current conversation so it remains preserved in History panel
                    const archiveKey = `seclab_chat_history_${cid}_${Date.now()}`;
                    localStorage.setItem(archiveKey, JSON.stringify(chatHistory));
                    localStorage.removeItem(`seclab_chat_history_${cid}`);
                }
                chatHistory = [];
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
                <div class="message-sender">${isUser ? 'STUDENT' : 'MENTOR'}</div>
                <div class="message-content"></div>
            `;
            chatMessages.appendChild(msgEl);

            const contentEl = msgEl.querySelector('.message-content');

            if (isUser || !stream) {
                contentEl.innerHTML = formatMarkdown(text);
                scrollToBottom();
            } else {
                isStreaming = true;
                msgEl.classList.add('streaming');
                const tokens = text.match(/\s+|\S+/g) || [];
                let tokenIndex = 0;
                let streamedText = '';

                // Natural assistant-style streaming: quick words, brief punctuation pauses.
                function getDelay(token) {
                    const t = token.trim();
                    if (!t) return 12;
                    if (/[.!?。！？]$/.test(t)) return 120;
                    if (/[,;:،،؛\-–—]$/.test(t)) return 55;
                    if (t.length > 16) return 18;
                    return 24;
                }

                function renderStreaming(textChunk) {
                    contentEl.innerHTML = `${formatMarkdown(textChunk)}<span class="stream-cursor" aria-hidden="true"></span>`;
                }

                input.disabled = true;
                sendBtn.disabled = true;

                function streamText() {
                    if (tokenIndex < tokens.length) {
                        const currentToken = tokens[tokenIndex];
                        tokenIndex++;
                        streamedText += currentToken;
                        renderStreaming(streamedText);
                        scrollToBottom();
                        setTimeout(streamText, getDelay(currentToken));
                    } else {
                        msgEl.classList.remove('streaming');
                        contentEl.innerHTML = formatMarkdown(text);
                        scrollToBottom();
                        isStreaming = false;
                        updateQuotaUI(activeChallengeId);
                        if (!input.disabled) input.focus();
                    }
                }
                renderStreaming('');
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

        // Action Menu Logic
        if (actionTrigger && actionPopover) {
            actionTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                actionPopover.classList.toggle('hidden');
                actionTrigger.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!actionPopover.contains(e.target) && e.target !== actionTrigger && !actionTrigger.contains(e.target)) {
                    actionPopover.classList.add('hidden');
                    actionTrigger.classList.remove('active');
                }
            });

            actionItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    const isAlreadyActive = item.classList.contains('active');
                    actionItems.forEach(i => i.classList.remove('active'));
                    
                    if (isAlreadyActive) {
                        currentMode = "socratic";
                        modeBadge.classList.add('hidden');
                    } else {
                        item.classList.add('active');
                        currentMode = item.dataset.mode;
                        
                        if (currentMode === "step_by_step") {
                            modeBadge.innerHTML = '<i class="fas fa-paw"></i> Step-by-Step Mode';
                            modeBadge.classList.remove('hidden');
                        } else if (currentMode === "analyze_code") {
                            modeBadge.innerHTML = '<i class="fas fa-search"></i> Analyze Code';
                            modeBadge.classList.remove('hidden');
                            
                            // Optional: automatically populate input for quick action
                            input.value = "Please analyze my code and find the vulnerability.";
                            input.style.height = 'auto';
                            input.style.height = (input.scrollHeight) + 'px';
                            input.focus();
                        }
                    }
                    
                    actionPopover.classList.add('hidden');
                    actionTrigger.classList.remove('active');
                });
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            const challengeId = activeChallengeId || currentChallengeId || (window.arena && window.arena.state && window.arena.state.currentChallenge);
            if (!challengeId || challengeId === 'undefined' || challengeId === 'null') {
                appendMessage('SYSTEM', '⚠️ Please select a challenge from the left menu first to start chatting with the mentor.', false);
                input.value = '';
                input.style.height = 'auto';
                return;
            }
            activeChallengeId = challengeId;

            // Use the last backend quota snapshot to avoid avoidable submissions.
            if (getQuotaState(challengeId).remaining <= 0) {
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
            const targetChallengeId = challengeId;

            try {
                const response = await fetch('/api/v1/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        challenge_id: targetChallengeId,
                        user_code: userCode,
                        messages: chatHistory,
                        mode: currentMode
                    })
                });

                const data = await response.json().catch(() => ({}));

                if (response.status === 401) {
                    if (activeChallengeId === targetChallengeId) {
                        appendMessage('SYSTEM', '⚠️ Session expired. Please log in again.', false);
                    }
                    localStorage.removeItem('token');
                    setTimeout(() => window.location.replace('/login'), 2000);
                    return;
                }

                if (response.status === 429) {
                    if (activeChallengeId === targetChallengeId) {
                        typingIndicator.classList.add('hidden');
                        if (statusDot) {
                            statusDot.classList.remove('active-typing');
                            statusDot.classList.add('breathing');
                        }
                    }

                    const detail = data.detail || {};
                    if (detail.quota) updateQuotaUI(targetChallengeId, detail.quota);
                    if (activeChallengeId === targetChallengeId) {
                        appendMessage('SYSTEM', '⚠️ Free AI Mentor quota reached for this task. It will reset automatically after 24 hours.', false);
                        playCyberBeep(true);
                    }
                    return;
                }

                if (!response.ok) {
                    if (activeChallengeId === targetChallengeId) {
                        typingIndicator.classList.add('hidden');
                        if (statusDot) {
                            statusDot.classList.remove('active-typing');
                            statusDot.classList.add('breathing');
                        }
                        const detail = data.detail;
                        const errorMessage = typeof detail === 'string'
                            ? detail
                            : detail?.message || `Request failed (${response.status})`;
                        appendMessage('SYSTEM', `⚠️ ${errorMessage}`, false);
                        playCyberBeep(true);
                    }
                    return;
                }

                if (data.quota) updateQuotaUI(targetChallengeId, data.quota);

                if (data.points !== null && data.points !== undefined) {
                    localStorage.setItem('user_xp', data.points);
                }

                // Always persist reply to the target challenge's localStorage
                const historyKey = `seclab_chat_history_${targetChallengeId}`;
                const savedHistStr = localStorage.getItem(historyKey);
                let savedHist = savedHistStr ? JSON.parse(savedHistStr) : [];
                savedHist.push({ role: 'model', content: data.reply });
                localStorage.setItem(historyKey, JSON.stringify(savedHist));

                // ONLY stream response & update UI if student is STILL on the target challenge
                if (activeChallengeId === targetChallengeId) {
                    chatHistory = savedHist;
                    typingIndicator.classList.add('hidden');
                    if (statusDot) {
                        statusDot.classList.remove('active-typing');
                        statusDot.classList.add('breathing');
                    }
                    appendMessage('SYSTEM', data.reply, false, true);
                    playCyberBeep(true);
                }

            } catch (err) {
                if (activeChallengeId === targetChallengeId) {
                    typingIndicator.classList.add('hidden');
                    if (statusDot) {
                        statusDot.classList.remove('active-typing');
                        statusDot.classList.add('breathing');
                    }
                    appendMessage('SYSTEM', '⚠️ Connection error. Please try again later.', false);
                }
                console.error(err);
            } finally {
                if (!isStreaming && activeChallengeId === targetChallengeId) {
                    updateQuotaUI(targetChallengeId);
                    if (!input.disabled) input.focus();
                }
            }
        });

        // Initialize history and quota badge on load if challenge is already selected
        const initialChallenge = activeChallengeId || currentChallengeId || (window.arena && window.arena.state && window.arena.state.currentChallenge);
        if (initialChallenge && initialChallenge !== 'undefined' && initialChallenge !== 'null') {
            window.loadAIHistory(initialChallenge);
        } else {
            updateQuotaUI(null);
        }
    }

    initAIAssistant();
});
