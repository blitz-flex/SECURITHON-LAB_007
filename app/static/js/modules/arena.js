import { $, $$ } from '../utils/dom.js';

export class Arena {
    constructor(config) {
        this.challenges = config.challenges || {};
        this.terminal = config.terminal || null;
        this.onChallengeSelect = config.onChallengeSelect || null;
        this.editorInstance = null;
        this.challengeStartedAt = {};
        this.state = {
            currentChallenge: null,
            fixApplied: false
        };
        this.elements = {
            list: $('#challengeList'),
            editor: $('#codeEditor'),
            fileName: $('#fileName'),
            instLabel: $('#challengeLabel'),
            instText: $('#instText'),
            briefingText: $('#briefingText'),
            cweBadge: $('#cweBadge'),
            attackBtn: $('#attackBtn'),
            resetBtn: $('#resetBtn'),
            startCodeBtn: $('#startCodeBtn'),
            tabs: $$('.instr-tab'),
            panes: $$('.tab-pane')
        };
        
        this.initAcademyListeners();
    }

    initAcademyListeners() {
        if (this.elements.attackBtn) this.elements.attackBtn.addEventListener('click', () => this.executeAttack());
        if (this.elements.resetBtn) this.elements.resetBtn.addEventListener('click', () => this.resetCode());
        if (this.elements.startCodeBtn) this.elements.startCodeBtn.addEventListener('click', () => this.switchTab('code'));
        
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
    }

    switchTab(tabName) {
        console.log(`Arena: Switching to tab [${tabName}]`);
        this.elements.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        this.elements.panes.forEach(p => {
            const isActive = p.id === `${tabName}Pane`;
            p.classList.toggle('active', isActive);
            console.log(`Arena: Pane [${p.id}] active: ${isActive}`);
        });
        
        if (tabName === 'code' && this.editorInstance) {
            setTimeout(() => {
                this.editorInstance.refresh();
                console.log('Arena: CodeMirror refreshed');
            }, 10);
        }
    }

    init() {
        this.renderChallengeList();
        this.renderEmptyState();
        this.updateCoreIntegrity();
    }

    difficultyMeta(entry) {
        let key = String(entry.difficulty || '').trim().toLowerCase();

        // Fall back to a CVSS-derived rating when the curriculum has no explicit difficulty.
        if (!key) {
            const cvss = Number(entry.cvss) || 0;
            if (cvss >= 9) key = 'critical';
            else if (cvss >= 7) key = 'hard';
            else if (cvss >= 4) key = 'medium';
            else key = 'easy';
        }

        // Normalize curriculum vocabulary to the four semantic tiers.
        if (key === 'high') key = 'hard';
        if (key === 'low' || key === 'beginner') key = 'easy';
        if (key === 'intermediate') key = 'medium';
        if (key === 'expert' || key === 'extreme') key = 'critical';

        const labels = {
            easy: 'EASY',
            medium: 'MEDIUM',
            hard: 'HARD',
            critical: 'CRITICAL'
        };

        if (!labels[key]) key = 'medium';
        return { key, label: labels[key] };
    }

    renderChallengeList() {
        if (!this.elements.list) return;
        
        const challengesArr = Object.entries(this.challenges).map(([id, entry]) => ({ id, ...entry }));
        const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');

        this.elements.list.innerHTML = '';
        
        challengesArr.forEach(entry => {
            const diff = this.difficultyMeta(entry);
            
            const isSolved = solved.includes(entry.id);
            const activeClass = entry.id === this.state.currentChallenge ? 'active' : '';
            const solvedClass = isSolved ? 'solved-item' : '';
            const liveClass = entry.id.includes('LIVE') ? 'live-item' : '';
            const category = entry.category ? this.escapeHtml(String(entry.category)) : '';
            const file = entry.file ? this.escapeHtml(String(entry.file)) : '';
            
            this.elements.list.innerHTML += `
                <button class="ch-item ${activeClass} ${solvedClass} ${liveClass}" data-challenge="${entry.id}">
                    <div class="ch-item-top">
                         <span class="diff-badge diff-${diff.key}" title="CVSS ${entry.cvss ?? 'N/A'}">${diff.label}</span>
                         ${isSolved ? '<i class="fas fa-check-circle ch-solved-icon" title="Solved"></i>' : ''}
                    </div>
                    <div class="ch-name">${this.escapeHtml(String(entry.label || ''))}</div>
                    <div class="ch-meta">
                        ${category ? `<span class="ch-cat">${category}</span>` : ''}
                        ${file ? `<span class="ch-file"><i class="fas fa-file-code"></i> ${file}</span>` : ''}
                    </div>
                </button>
            `;
        });

        this.elements.list.querySelectorAll('[data-challenge]').forEach(btn => {
            btn.addEventListener('click', () => this.selectChallenge(btn.dataset.challenge));
        });
    }


    selectChallenge(id) {
        this.state.currentChallenge = id;
        this.renderChallengeList();
        
        const standby = document.getElementById('arenaStandby');
        const activeContent = document.getElementById('arenaActiveContent');
        if (standby && activeContent) {
            standby.style.display = 'none';
            activeContent.style.display = 'flex';
        }
        
        this.renderCode(id);
        
        const challenge = this.challenges[id];
        if (challenge) {
            this.elements.instLabel.textContent = challenge.label;
            this.elements.cweBadge.textContent = challenge.cwe;
            this.elements.instText.textContent = challenge.task;

            // Reset scroll to top
            const briefingPane = document.getElementById('briefingPane');
            if (briefingPane) {
                briefingPane.scrollTop = 0;
            }

            // Typewriter effect for briefing
            this.typeWriter(challenge.briefing, this.elements.briefingText);
        }

        this.switchTab('briefing');
        
        if (this.terminal) {
            this.terminal.clear();
            const isCrit = challenge?.cvss >= 7;
            const cvssLabel = isCrit ? '\x1b[1;31mCRITICAL\x1b[0m' : '\x1b[1;33mHIGH\x1b[0m';
            this.terminal.xterm.write(
                `\x1b[1;33m[#]\x1b[0m \x1b[1m${challenge?.cwe || 'CWE'}\x1b[0m` +
                ` \x1b[90m|\x1b[0m CVSS \x1b[1m${challenge?.cvss || '5.0'}\x1b[0m` +
                ` \x1b[90m|\x1b[0m ${cvssLabel}\r\n\r\n`
            );
        }

        // Record when user opened this challenge (for speed bonus)
        if (!this.challengeStartedAt[id]) {
            this.challengeStartedAt[id] = new Date().toISOString();
        }
        this.recordChallengeOpen(id);
        
        this.updateCoreIntegrity();
        this.fetchIntel(id);
        if (typeof this.onChallengeSelect === 'function') {
            this.onChallengeSelect(id);
        }
    }

    async recordChallengeOpen(id) {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const response = await fetch('/api/v1/arena/open', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ challenge_id: id })
            });
            if (!response.ok) return;
            const result = await response.json();
            if (result.last_successful_code !== null && result.last_successful_code !== undefined) {
                const previousSavedCode = this.getSolvedCode(id);
                const currentCode = this.editorInstance ? this.editorInstance.getValue() : null;
                const canRefreshEditor = (
                    this.state.currentChallenge === id
                    && this.isChallengeSolved(id)
                    && (
                        currentCode === null
                        || currentCode === this.getOriginalCode(id)
                        || currentCode === previousSavedCode
                    )
                );

                this.setSolvedCode(id, result.last_successful_code);
                if (canRefreshEditor) {
                    this.renderCode(id);
                }
            }
        } catch {
            // Verification will simply skip the speed bonus if no trusted open exists.
        }
    }

    typeWriter(text, element) {
        element.textContent = '';
        if (this.typeInterval) {
            clearInterval(this.typeInterval);
            this.typeInterval = null;
        }
        if (this.typeTimeout) {
            clearTimeout(this.typeTimeout);
            this.typeTimeout = null;
        }
        
        const settings = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
        const style = settings.terminalTyping || 'standard';
        
        if (style === 'standard') {
            element.textContent = text;
            return;
        }
        
        let speed = 15;
        if (style === 'fast') speed = 4;
        if (style === 'slow') speed = 55;
        
        let i = 0;
        const runType = () => {
            if (i < text.length) {
                if (style === 'glitch') {
                    speed = Math.random() * 40 + 5;
                    const glitchedChar = Math.random() > 0.85 ? '█' : (Math.random() > 0.9 ? '_' : '');
                    element.textContent = text.slice(0, i + 1) + glitchedChar;
                } else {
                    element.textContent = text.slice(0, i + 1);
                }
                i++;
                this.typeTimeout = setTimeout(runType, speed);
            } else {
                element.textContent = text;
            }
        };
        
        runType();
    }

    async fetchIntel(id) {
        // Threat intelligence logging to active shell has been disabled to keep the terminal workspace clean.
    }

    renderCode(id) {
        const challenge = this.challenges[id];
        if (!challenge) return;

        const rawCode = this.getOriginalCode(id);
        const savedCode = this.isChallengeSolved(id) ? this.getSolvedCode(id) : null;
        const editorCode = savedCode || rawCode;
        
        // Determine language mode based on file extension
        let mode = 'javascript';
        if (challenge.file.endsWith('.py')) mode = 'python';
        if (challenge.file.endsWith('.tf') || challenge.file.endsWith('.yml') || challenge.file.endsWith('.yaml')) mode = 'yaml';
        if (challenge.file.endsWith('.sh')) mode = 'shell';
        if (challenge.file.includes('Dockerfile')) mode = 'dockerfile';

        this.elements.editor.innerHTML = '';
        
        const settings = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
        const themeMap = {
            'default': 'material-darker',
            'cyberpunk': 'monokai',
            'high-contrast': 'darcula',
            'dracula': 'dracula',
            'nord': 'nord',
            'gruvbox': 'gruvbox-dark'
        };
        const editorTheme = themeMap[settings.editorTheme] || 'material-darker';
        
        const fontMap = {
            'jetbrains': '"JetBrains Mono", monospace',
            'fira': '"Fira Code", monospace',
            'roboto': '"Roboto Mono", monospace',
            'source': '"Source Code Pro", monospace',
            'consolas': 'Consolas, monospace'
        };
        const editorFontFamily = fontMap[settings.editorFont] || '"JetBrains Mono", monospace';
        
        this.editorInstance = CodeMirror(this.elements.editor, {
            value: editorCode,
            mode: mode,
            theme: editorTheme,
            lineNumbers: true,
            indentUnit: 4,
            tabSize: 4,
            lineWrapping: false,
            viewportMargin: Infinity
        });
        
        const editorContainer = this.elements.editor.querySelector('.CodeMirror');
        if (editorContainer) {
            editorContainer.style.fontFamily = editorFontFamily;
        }

        challenge.vulnCode.forEach((line, index) => {
            if (!savedCode && line?.vuln) {
                this.editorInstance.addLineClass(index, 'background', 'cm-vulnerable-line');
            }
        });

        this.elements.fileName.textContent = challenge.file;
        this.elements.instLabel.textContent = `Active Challenge — ${challenge.label}`;
        this.elements.instText.innerHTML = challenge.inst;
        this.updateResetState(id);
    }

    async resetCode() {
        if (!this.state.currentChallenge) return;
        const id = this.state.currentChallenge;

        if (this.isChallengeSolved(id)) {
            this.updateResetState(id);
            if (this.terminal) {
                this.terminal.log('Completed challenge is locked. Reset is disabled after reward is granted.', 'SYS', '#d29922');
            }
            return;
        }

        // Reset only restores the editor draft for unsolved challenges.
        this.renderCode(id);
        this.updateCoreIntegrity();
    }

    isChallengeSolved(id) {
        const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
        return solved.includes(id);
    }

    solvedCodeKey(id) {
        return `solved_code_${id}`;
    }

    getSolvedCode(id) {
        return this.challenges[id]?.lastSuccessfulCode || localStorage.getItem(this.solvedCodeKey(id));
    }

    setSolvedCode(id, code) {
        localStorage.setItem(this.solvedCodeKey(id), code);
        if (this.challenges[id]) this.challenges[id].lastSuccessfulCode = code;
    }

    getOriginalCode(id) {
        return this.challenges[id]?.vulnCode?.map(line => line.t).join('\n') || '';
    }

    updateResetState(id = this.state.currentChallenge) {
        if (!this.elements.resetBtn || !id) return;
        const solved = this.isChallengeSolved(id);
        this.elements.resetBtn.disabled = solved;
        this.elements.resetBtn.classList.toggle('is-disabled', solved);
        this.elements.resetBtn.title = solved
            ? 'Challenge completed. Reset is disabled after reward is granted.'
            : 'Reset the current unsolved draft to the original vulnerable code.';
    }

    async executeAttack() {
        if (!this.state.currentChallenge) return;
        const id = this.state.currentChallenge;
        const challenge = this.challenges[id];
        const isSolved = JSON.parse(localStorage.getItem('solved_challenges') || '[]').includes(id);

        const code = this.editorInstance ? this.editorInstance.getValue() : '';
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        if (this.terminal) this.terminal.clear();

        // Kick off verification immediately; animate the header while it is in flight.
        const verifyPromise = fetch('/api/v1/arena/verify', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                challenge_id: id,
                code,
                difficulty: (challenge?.difficulty || 'medium').toLowerCase(),
                already_solved: isSolved,
                started_at: this.challengeStartedAt[id] || null
            })
        });

        if (this.terminal) await this.renderAuditHeader(challenge);

        try {
            const response = await verifyPromise;
            const result = await response.json();
            const checkLabels = this.getCheckLabels(id);

            if (!response.ok) {
                await this.renderAuditError(result.detail || 'Verification server error.');
                this.nudgeTerminalPrompt();
                return;
            }

            // Successful patch passes every gate; a rejected patch fails at the exploit stage.
            const outcomes = result.success ? [true, true, true] : [true, false, false];

            for (let i = 0; i < outcomes.length; i++) {
                this.renderCheckStart(i + 1, outcomes.length, checkLabels[i]);
                await this.runSpinner(640);
                this.renderCheckResult(outcomes[i]);
                await this.sleep(130);
            }
            await this.sleep(220);

            if (result.success) {
                // Mark as solved
                const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
                if (!solved.includes(id)) solved.push(id);
                localStorage.setItem('solved_challenges', JSON.stringify(solved));
                this.setSolvedCode(id, code);

                // Sync server-authoritative points to UI
                if (result.points !== undefined) {
                    localStorage.setItem('user_xp', result.points);
                    if (window.currentUser) {
                        window.currentUser.points = result.points;
                        if (typeof window.updateUI === 'function') window.updateUI(window.currentUser);
                    }
                }

                this.renderChallengeList();
                this.updateResetState(id);
                this.updateCoreIntegrity();

                await this.renderAuditSummary(true, {
                    message: result.message,
                    reward: result.reward,
                    speedBonus: !!result.speed_bonus
                });
            } else {
                this.updateCoreIntegrity();
                await this.renderAuditSummary(false, { message: result.message });
            }
        } catch (e) {
            await this.renderAuditError('Connection to verification server failed.');
        }

        this.nudgeTerminalPrompt();
    }

    nudgeTerminalPrompt() {
        if (this.terminal && this.terminal.socket && this.terminal.socket.readyState === WebSocket.OPEN) {
            this.terminal.socket.send('\r');
        }
    }

    getSecurityScore() {
        const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
        const challengesKeys = Object.keys(this.challenges);
        const total = challengesKeys.length;
        if (total === 0) return '--';

        const solvedCount = solved.filter(id => challengesKeys.includes(id)).length;
        return `${Math.round((solvedCount / total) * 100)}%`;
    }

    getCheckLabels(id) {
        if (id.startsWith("IAC_") || id.startsWith("K8S_") || id.startsWith("NET_") || id.startsWith("CONT_") || id.startsWith("ARCH_")) {
            return ["Manifest syntax audit", "Security policy compliance", "Least-privilege validation"];
        }
        if (id.startsWith("CICD_")) {
            return ["Pipeline config check", "Secret & injection scan", "Runner boundary control"];
        }
        return ["Static code analysis (AST)", "Exploit payload injection", "Output sanitization check"];
    }

    /* ── Terminal audit renderer ─────────────────────────────── */
    get _ansi() {
        return {
            dim: '\x1b[90m',
            white: '\x1b[0;37m',
            green: '\x1b[1;32m',
            red: '\x1b[1;31m',
            yellow: '\x1b[1;33m',
            cyan: '\x1b[1;36m',
            r: '\x1b[0m'
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    auditRule(ch = '─') {
        const cols = (this.terminal?.xterm?.cols || 60) - 4;
        return ch.repeat(Math.max(28, Math.min(cols, 54)));
    }

    // Writes one line and pauses, so the audit reveals progressively instead of dumping.
    async writeLine(text, pause = 70) {
        if (!this.terminal?.xterm) return;
        this.terminal.xterm.write(`${text}\r\n`);
        this.terminal.xterm.scrollToBottom();
        if (pause > 0) await this.sleep(pause);
    }

    async renderAuditHeader(challenge) {
        if (!this.terminal?.xterm) return;
        const c = this._ansi;
        const target = `${challenge?.cwe || 'CWE'}  ${challenge?.label || 'Unknown target'}`;
        const file = challenge?.file || 'unknown';

        await this.writeLine('', 40);
        await this.writeLine(`${c.cyan}  ▌ SECURITY VERIFICATION AUDIT${c.r}`, 110);
        await this.writeLine(`${c.dim}  ${this.auditRule()}${c.r}`, 70);
        await this.writeLine(`${c.dim}  Target  ${c.r}${c.white}${target}${c.r}`, 90);
        await this.writeLine(`${c.dim}  File    ${c.r}${c.white}${file}${c.r}`, 90);
        await this.writeLine(`${c.dim}  Engine  ${c.r}${c.white}static + dynamic analysis${c.r}`, 120);
        await this.writeLine('', 80);
    }

    renderCheckStart(index, total, label) {
        if (!this.terminal?.xterm) return;
        const c = this._ansi;
        const head = `  ${c.dim}[${index}/${total}]${c.r} ${c.white}${label}${c.r} `;
        const plainLen = `  [${index}/${total}] ${label} `.length;
        const dots = '.'.repeat(Math.max(3, 40 - plainLen));
        this.terminal.xterm.write(`${head}${c.dim}${dots}${c.r} `);
    }

    // Animated braille spinner that overwrites itself in place while "scanning".
    async runSpinner(ms = 600) {
        if (!this.terminal?.xterm) return;
        const c = this._ansi;
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        const x = this.terminal.xterm;
        const start = Date.now();
        let i = 0;
        while (Date.now() - start < ms) {
            x.write(`${c.cyan}${frames[i % frames.length]}${c.r}`);
            await this.sleep(85);
            x.write('\b');
            i++;
        }
    }

    renderCheckResult(passed) {
        if (!this.terminal?.xterm) return;
        const c = this._ansi;
        // Overwrite the leftover spinner glyph with the final verdict.
        this.terminal.xterm.write(passed
            ? `${c.green}✔ PASS${c.r}\r\n`
            : `${c.red}✘ FAIL${c.r}\r\n`);
    }

    async renderAuditSummary(success, { message, reward, speedBonus } = {}) {
        if (!this.terminal?.xterm) return;
        const c = this._ansi;

        await this.writeLine('', 60);
        await this.writeLine(`${c.dim}  ${this.auditRule()}${c.r}`, 70);
        if (success) {
            await this.writeLine(`  ${c.dim}VERDICT   ${c.r}${c.green}PATCH ACCEPTED${c.r}`, 110);
            await this.writeLine(`  ${c.dim}SECURITY  ${c.r}${c.green}SECURE${c.r}${c.dim}   ·   SCORE ${c.r}${c.cyan}${this.getSecurityScore()}${c.r}`, 110);
            if (reward > 0) {
                const bonus = speedBonus ? `${c.yellow}  +50% speed bonus ⚡${c.r}` : '';
                await this.writeLine(`  ${c.dim}REWARD    ${c.r}${c.green}+${reward} XP${c.r}${bonus}`, 110);
            }
        } else {
            await this.writeLine(`  ${c.dim}VERDICT   ${c.r}${c.red}PATCH REJECTED${c.r}`, 110);
            await this.writeLine(`  ${c.dim}SECURITY  ${c.r}${c.red}VULNERABLE${c.r}${c.dim}   ·   SCORE ${c.r}${c.cyan}${this.getSecurityScore()}${c.r}`, 110);
        }
        await this.writeLine(`${c.dim}  ${this.auditRule()}${c.r}`, 90);

        if (message) {
            const icon = success ? `${c.green}✔${c.r}` : `${c.red}✘${c.r}`;
            await this.writeLine(`  ${icon} ${success ? c.green : c.red}${message}${c.r}`, 40);
        }
        await this.writeLine('', 0);
    }

    async renderAuditError(message) {
        if (!this.terminal?.xterm) return;
        const c = this._ansi;
        await this.writeLine('', 40);
        await this.writeLine(`${c.dim}  ${this.auditRule()}${c.r}`, 70);
        await this.writeLine(`  ${c.dim}VERDICT   ${c.r}${c.yellow}AUDIT INTERRUPTED${c.r}`, 110);
        await this.writeLine(`${c.dim}  ${this.auditRule()}${c.r}`, 90);
        await this.writeLine(`  ${c.red}✘ ${message}${c.r}`, 0);
        await this.writeLine('', 0);
    }

    renderEmptyState() {
        const standby = document.getElementById('arenaStandby');
        const activeContent = document.getElementById('arenaActiveContent');
        if (standby && activeContent) {
            standby.style.display = 'flex';
            activeContent.style.display = 'none';
        }
    }
    
    updateCoreIntegrity() {
        const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
        const challengesKeys = Object.keys(this.challenges);
        const total = challengesKeys.length;
        
        const scoreBar = document.getElementById('secScoreBar');
        const scoreStatus = document.getElementById('secStatus');
        const footerDesc = document.getElementById('secDesc');

        if (!scoreBar || !scoreStatus) return;

        if (total === 0) {
            scoreBar.style.width = '0%';
            scoreStatus.textContent = '--';
            scoreBar.style.background = 'rgba(255,255,255,0.06)';
            scoreBar.style.boxShadow = 'none';
            scoreStatus.style.color = 'var(--text-muted)';
            if (footerDesc) {
                footerDesc.textContent = 'LOADING CHALLENGE MATRIX...';
                footerDesc.style.color = 'var(--text-muted)';
            }
            return;
        }
        
        const solvedCount = solved.filter(id => challengesKeys.includes(id)).length;
        const percent = Math.round((solvedCount / total) * 100);
        
        scoreBar.style.width = `${percent}%`;
        scoreStatus.textContent = `${percent}%`;
        
        if (percent === 100) {
            scoreBar.style.background = 'var(--primary-app)';
            scoreBar.style.boxShadow = '0 0 10px rgba(63, 185, 80, 0.5)';
            scoreStatus.style.color = 'var(--primary-app)';
            if (footerDesc) {
                footerDesc.textContent = 'SYSTEM SECURE — ALL PATCHES APPLIED';
                footerDesc.style.color = 'var(--primary-app)';
            }
        } else if (percent > 0) {
            scoreBar.style.background = 'var(--warning)';
            scoreBar.style.boxShadow = '0 0 10px rgba(210, 153, 34, 0.5)';
            scoreStatus.style.color = 'var(--warning)';
            if (footerDesc) {
                footerDesc.textContent = `${solvedCount}/${total} SECTORS HARDENED — HOTFIXES REQUIRED`;
                footerDesc.style.color = 'var(--warning)';
            }
        } else {
            scoreBar.style.background = 'var(--error)';
            scoreBar.style.boxShadow = '0 0 10px rgba(248, 81, 115, 0.5)';
            scoreStatus.style.color = 'var(--error)';
            if (footerDesc) {
                footerDesc.textContent = 'SYSTEM VULNERABLE — URGENT ACTION REQUIRED';
                footerDesc.style.color = 'var(--error)';
            }
        }
    }
    
    refreshChallenges(challenges) {
        this.challenges = challenges;
        this.renderChallengeList();
        this.updateResetState();
        this.updateCoreIntegrity();
    }
    
    escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
}
