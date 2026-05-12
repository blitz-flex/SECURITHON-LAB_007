/**
 * Terminal & Telemetry Module
 */
import { $ } from '../utils/dom.js';

export class Terminal {
    constructor(containerId) {
        this.container = $(`#${containerId}`);
    }

    log(message, category = 'SYS', color = '#8b949e') {
        if (!this.container) return;
        
        const now = new Date().toTimeString().slice(0, 8);
        const logLine = document.createElement('div');
        logLine.className = 'log-line';
        logLine.innerHTML = `
            <span style="color:#8b949e; opacity:0.5; margin-right:12px;">${now}</span>
            <span class="log-msg" style="color:${color}">[${category}] ${message}</span>
        `;
        
        this.container.appendChild(logLine);
        this.container.scrollTop = this.container.scrollHeight;
    }

    clear(firstMsg = 'Initializing...', secondMsg = 'System Ready.') {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.log(firstMsg, 'SYS', '#8b949e');
        this.log(secondMsg, 'OK', '#58a6ff');
    }
}
