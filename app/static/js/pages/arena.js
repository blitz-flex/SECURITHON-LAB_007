/**
 * Arena Page Entry Point
 */
import { Arena } from '../modules/arena.js';
import { Terminal } from '../modules/terminal.js';
import { challenges } from '../data.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Terminal
    const terminal = new Terminal('consoleBody');
    terminal.clear('SEC_OS Initializing...', 'Waiting for neural uplink...');

    // 2. Initialize Arena (Assuming challenges are globally available via data.js)
    if (window.challenges) {
        const arena = new Arena({ challenges: window.challenges });
        arena.init();
    }
});
