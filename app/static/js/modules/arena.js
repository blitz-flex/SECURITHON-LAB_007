/**
 * Arena Module - Core Game Logic
 */
import { $, $$ } from '../utils/dom.js';

export class Arena {
    constructor(config) {
        this.challenges = config.challenges || {};
        this.state = {
            currentChallenge: null,
            fixApplied: false
        };
        this.elements = {
            list: $('#challengeList'),
            editor: $('#codeEditor'),
            fileName: $('#fileName'),
            instLabel: $('#challengeLabel'),
            instText: $('#instText')
        };
    }

    init() {
        this.renderChallengeList();
        this.renderEmptyState();
    }

    renderChallengeList() {
        if (!this.elements.list) return;
        const entries = Object.entries(this.challenges);
        
        this.elements.list.innerHTML = entries.map(([id, entry]) => `
            <button class="ch-item ${id === this.state.currentChallenge ? 'active' : ''}" data-challenge="${id}">
                <div class="ch-name">${entry.label}</div>
                <div class="ch-meta"><span class="ch-sub">${entry.file}</span></div>
            </button>
        `).join('');

        this.elements.list.querySelectorAll('[data-challenge]').forEach(btn => {
            btn.addEventListener('click', () => this.selectChallenge(btn.dataset.challenge));
        });
    }

    selectChallenge(id) {
        this.state.currentChallenge = id;
        this.renderChallengeList();
        this.renderCode(id);
    }

    renderCode(id) {
        const challenge = this.challenges[id];
        if (!challenge) return;

        const lines = challenge.vulnCode;
        this.elements.editor.innerHTML = `
            <div class="code-editor-content">
                ${lines.map(line => `
                    <div class="code-line ${line.vuln ? 'vuln-line' : ''}">
                        <span class="line-num">${line.n}</span>
                        <span class="line-content">${line.t}</span>
                    </div>
                `).join('')}
            </div>
        `;
        this.elements.fileName.textContent = challenge.file;
        this.elements.instLabel.textContent = `Active Challenge — ${challenge.label}`;
        this.elements.instText.innerHTML = challenge.inst;
    }

    renderEmptyState() {
        this.elements.instLabel.textContent = 'Operational Status — Idle';
        this.elements.instText.textContent = 'No active challenges detected.';
    }
}
