/**
 * Arena Page Entry Point — TryHackMe-Style Lab Engine
 * Manages lab lifecycle, status polling, and terminal connection.
 */
import { Arena } from '../modules/arena.js?v=30';
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
            curriculumUrl: '/api/v1/appsec/curriculum?v=1',
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

        curriculumModal.classList.add('active');
        curriculumModal.setAttribute('aria-hidden', 'false');

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
            if (curriculumModalContinue) curriculumModalContinue.hidden = true;
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

        // Wire up onChallengeSelect now that we have labChallenges
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
            setConsolePanelVisible(true);

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
                    // Switching to a different challenge:
                    // Show or create the challenge terminal, keeping it completely separate
                    setStatus('online');
                    const t = ensureTerminal(challengeId);
                    if (t) {
                        window.arena.terminal = t;
                        // Only connect if the terminal socket is not already open/connecting
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

            // Reload AI Chat history for this challenge
            if (window.loadAIHistory) {
                window.loadAIHistory(challengeId);
            }
        };

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
        const DEFAULT_QUOTA_LIMIT = 15;
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
            if (!resetAt || Number.isNaN(resetAt)) return 'Resets in 24h';

            const remainingMs = Math.max(0, resetAt - Date.now());
            const hours = Math.floor(remainingMs / (60 * 60 * 1000));
            const minutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

            if (hours <= 0) return `Resets in ${minutes}m`;
            return `Resets in ${hours}h`;
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
                    input.placeholder = "Type your question here...";
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

        // Persistence functions
        window.loadAIHistory = function (challengeId) {
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

            try {
                const response = await fetch('/api/v1/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        challenge_id: challengeId,
                        user_code: userCode,
                        messages: chatHistory
                    })
                });

                const data = await response.json().catch(() => ({}));

                if (response.status === 401) {
                    appendMessage('SYSTEM', '⚠️ Session expired. Please log in again.', false);
                    localStorage.removeItem('token');
                    setTimeout(() => window.location.replace('/login'), 2000);
                    return;
                }

                if (response.status === 429) {
                    typingIndicator.classList.add('hidden');
                    if (statusDot) {
                        statusDot.classList.remove('active-typing');
                        statusDot.classList.add('breathing');
                    }

                    const detail = data.detail || {};
                    if (detail.quota) updateQuotaUI(challengeId, detail.quota);
                    appendMessage('SYSTEM', '⚠️ Free AI Mentor quota reached for this task. It will reset automatically after 24 hours.', false);
                    playCyberBeep(true);
                    return;
                }

                if (!response.ok) {
                    const detail = data.detail;
                    const errorMessage = typeof detail === 'string'
                        ? detail
                        : detail?.message || `Request failed (${response.status})`;
                    appendMessage('SYSTEM', `⚠️ ${errorMessage}`, false);
                    playCyberBeep(true);
                    return;
                }

                // Hide typing indicator & return status dot to breathing
                typingIndicator.classList.add('hidden');
                if (statusDot) {
                    statusDot.classList.remove('active-typing');
                    statusDot.classList.add('breathing');
                }

                if (data.quota) updateQuotaUI(challengeId, data.quota);

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
                    updateQuotaUI(challengeId);
                    if (!input.disabled) input.focus();
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
