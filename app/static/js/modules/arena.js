import { $, $$ } from '../utils/dom.js';

export class Arena {
    constructor(config) {
        this.challenges = config.challenges || {};
        this.terminal = config.terminal || null;
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
            hintText: $('#hintText'),
            hintArea: $('#hintArea'),
            attackBtn: $('#attackBtn'),
            resetBtn: $('#resetBtn'),
            hintBtn: $('#hintBtn'),
            startCodeBtn: $('#startCodeBtn'),
            tabs: $$('.instr-tab'),
            panes: $$('.tab-pane')
        };
        
        this.initAcademyListeners();
    }

    initAcademyListeners() {
        if (this.elements.attackBtn) this.elements.attackBtn.addEventListener('click', () => this.executeAttack());
        if (this.elements.resetBtn) this.elements.resetBtn.addEventListener('click', () => this.resetCode());
        if (this.elements.hintBtn) this.elements.hintBtn.addEventListener('click', () => this.revealHint());
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

    revealHint() {
        if (!this.state.currentChallenge) return;
        
        const currentXP = parseInt(localStorage.getItem('user_xp') || '0');
        const hintCost = 50;

        if (currentXP < hintCost) {
            // Shake animation for error
            this.elements.hintBtn.classList.add('btn-error-shake');
            setTimeout(() => this.elements.hintBtn.classList.remove('btn-error-shake'), 600);
            return;
        }

        // Float animation for deduction
        this.showXPFloat(`-${hintCost} XP`, this.elements.hintBtn);

        this.elements.hintArea.style.display = 'block';
        if (window.incrementXP) window.incrementXP(-hintCost);
        this.terminal.log(`Accessing tactical hint... ${hintCost} XP deducted.`, 'SYS', '#ff9f43');
    }

    showXPFloat(text, parentElement) {
        const floater = document.createElement('div');
        floater.className = 'xp-float';
        floater.textContent = text;
        
        // Position relative to the button
        const rect = parentElement.getBoundingClientRect();
        floater.style.left = `${rect.left + rect.width / 2}px`;
        floater.style.top = `${rect.top}px`;
        
        document.body.appendChild(floater);
        setTimeout(() => floater.remove(), 1000);
    }

    init() {
        this.renderChallengeList();
        this.renderEmptyState();
        this.updateCoreIntegrity();
    }

    renderChallengeList() {
        if (!this.elements.list) return;
        
        const challengesArr = Object.entries(this.challenges).map(([id, entry]) => ({ id, ...entry }));
        const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');

        this.elements.list.innerHTML = '';
        
        challengesArr.forEach(entry => {
            const cvssClass = entry.cvss >= 9 ? 'cvss-critical' : 
                              entry.cvss >= 7 ? 'cvss-high' : 
                              entry.cvss >= 4 ? 'cvss-medium' : 'cvss-low';
            
            const isSolved = solved.includes(entry.id);
            const activeClass = entry.id === this.state.currentChallenge ? 'active' : '';
            const solvedClass = isSolved ? 'solved-item' : '';
            const liveClass = entry.id.includes('LIVE') ? 'live-item' : '';
            
            this.elements.list.innerHTML += `
                <button class="ch-item ${activeClass} ${solvedClass} ${liveClass}" data-challenge="${entry.id}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                         <span class="cvss-badge ${cvssClass}">${entry.cvss} CVSS</span>
                         ${isSolved ? '<i class="fas fa-check-circle" style="color: var(--primary-app); font-size: 0.7rem;"></i>' : ''}
                    </div>
                    <div class="ch-name">${entry.label}</div>
                    <div class="ch-sub"><i class="fas fa-file-code" style="margin-right: 5px; opacity: 0.5;"></i> ${entry.file}</div>
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
            this.elements.hintText.textContent = challenge.hint;
            this.elements.hintArea.style.display = 'none'; // Hide hint initially

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
            const color = isCrit ? '\x1b[1;31m' : '\x1b[1;33m'; // Red or Yellow
            
            const cols = this.terminal.xterm.cols || 50;
            const boxWidth = Math.min(cols - 2, 65); // Leave 2 cols margin, cap at 65
            
            const titleValue = (challenge?.title || 'Unknown').substring(0, boxWidth - 15);
            const levelValue = isCrit ? 'CRITICAL' : 'ELEVATED';
            
            const top = '╔' + '═'.repeat(boxWidth) + '╗';
            const bot = '╚' + '═'.repeat(boxWidth) + '╝';
            
            const tPad = Math.max(0, boxWidth - 10 - titleValue.length);
            const lPad = Math.max(0, boxWidth - 10 - levelValue.length);
            
            this.terminal.xterm.write(`\r\n${color}${top}\x1b[0m\r\n`);
            this.terminal.xterm.write(`${color}║  TARGET: ${titleValue}${' '.repeat(tPad)}║\x1b[0m\r\n`);
            this.terminal.xterm.write(`${color}║  THREAT: ${levelValue}${' '.repeat(lPad)}║\x1b[0m\r\n`);
            this.terminal.xterm.write(`${color}${bot}\x1b[0m\r\n\r\n`);
        }
        
        this.updateCoreIntegrity();
        this.fetchIntel(id);
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
        try {
            const response = await fetch(`/api/v1/system/cve/${id}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.cves && data.cves.length > 0) {
                setTimeout(() => {
                    this.terminal.log('RECEIVING EXTERNAL THREAT INTELLIGENCE...', 'INTEL', '#58a6ff');
                    data.cves.forEach((cve, idx) => {
                        setTimeout(() => {
                            this.terminal.log(`${cve.id}: ${cve.summary.substring(0, 80)}...`, 'INTEL', '#a371f7');
                        }, idx * 400 + 500);
                    });
                }, 1000);
            }
        } catch (e) {
            // Silently fail if feed offline
        }
    }

    renderCode(id) {
        const challenge = this.challenges[id];
        if (!challenge) return;

        // Extract raw text from challenge.vulnCode objects
        const rawCode = challenge.vulnCode.map(line => line.t).join('\n');
        
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
            value: rawCode,
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

        this.elements.fileName.textContent = challenge.file;
        this.elements.instLabel.textContent = `Active Challenge — ${challenge.label}`;
        this.elements.instText.innerHTML = challenge.inst;
    }

    resetCode() {
        if (this.state.currentChallenge) {
            // 1. Subtract XP before removing from solved list
            const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
            if (solved.includes(this.state.currentChallenge)) {
                const ch = this.challenges[this.state.currentChallenge];
                const reward = Math.floor((ch?.cvss || 5.0) * 10);
                if (window.incrementXP) {
                    window.incrementXP(-reward);
                }
            }

            // 2. Clear solved status from persistence for this challenge
            const updatedSolved = solved.filter(id => id !== this.state.currentChallenge);
            localStorage.setItem('solved_challenges', JSON.stringify(updatedSolved));

            // 3. Refresh UI elements
            this.renderChallengeList();
            this.renderCode(this.state.currentChallenge);
            this.updateCoreIntegrity();


        }
    }

    async executeAttack() {
        if (!this.state.currentChallenge) return;
        
        if (this.terminal) {
            this.terminal.xterm.write(`\r\n\x1b[1;31m[!] [ATTACK] Deploying automated exploit payload against target...\x1b[0m\r\n`);
        }
        
        // Gather the code from the editor
        const code = this.editorInstance ? this.editorInstance.getValue() : '';
        
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch('/api/v1/arena/verify', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    challenge_id: this.state.currentChallenge,
                    code: code
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                if (result.success) {
                    if (this.terminal) this.terminal.log(result.message, 'DEFENSE', '#3fb950');
                    
                    // Mark as solved in persistence
                    const solved = JSON.parse(localStorage.getItem('solved_challenges') || '[]');
                    if (!solved.includes(this.state.currentChallenge)) {
                        solved.push(this.state.currentChallenge);
                        localStorage.setItem('solved_challenges', JSON.stringify(solved));
                    }
                    
                    // Sync the securely returned points from server to the UI
                    if (result.points !== undefined && window.currentUser) {
                        window.currentUser.points = result.points;
                        localStorage.setItem('user_xp', result.points);
                        if (typeof window.updateUI === 'function') {
                            window.updateUI(window.currentUser);
                        }
                    }

                    this.renderChallengeList(); // Refresh sidebar states
                    this.updateCoreIntegrity();
                } else {
                    if (this.terminal) this.terminal.log(result.message, 'BREACH', '#f85149');
                    this.updateCoreIntegrity();
                }
            } else {
                if (this.terminal) this.terminal.log(result.detail || 'Verification server error.', 'ERR', '#f85149');
            }
        } catch (e) {
            if (this.terminal) this.terminal.log('Connection to verification server failed.', 'ERR', '#f85149');
        }
        
        // Trigger a single final prompt refresh after all sequences complete
        if (this.terminal && this.terminal.socket && this.terminal.socket.readyState === WebSocket.OPEN) {
            this.terminal.socket.send('\r');
        }
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
        
        let percent = 0;
        if (total > 0) {
            const solvedCount = solved.filter(id => challengesKeys.includes(id)).length;
            percent = Math.round((solvedCount / total) * 100);
        }
        
        const scoreBar = document.getElementById('secScoreBar');
        const scoreStatus = document.getElementById('secStatus');
        const footerDesc = document.getElementById('secDesc');
        
        if (scoreBar && scoreStatus) {
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
                    footerDesc.textContent = 'PARTIAL INTEGRITY — HOTFIXES REQUIRED';
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
