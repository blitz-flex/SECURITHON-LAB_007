/**
 * Landing Page Logic
 */
import { $, $$ } from '../utils/dom.js';
import { typeText, animateCounter, initGlowEffect } from '../utils/animations.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Terminal Sequence
    const terminalBody = $('#telemetry-stream');
    const terminalLines = [
        { text: "Initializing Securithon Environment...", type: "output", delay: 500 },
        { text: "./run_diagnostics.sh --target=appsec", type: "command", delay: 800 },
        { text: "[*] Analyzing backend architecture...", type: "output", delay: 1200 },
        { text: "[!] VULNERABILITY DETECTED: CWE-89 (SQL Injection)", type: "error", delay: 800 },
        { text: "git apply patch-01.diff", type: "command", delay: 1500 },
        { text: "[+] Patch applied successfully. SYSTEM SECURED.", type: "success", delay: 600 }
    ];

    if (terminalBody) {
        typeText(terminalBody, terminalLines);
    }

    // 2. Stats Animation
    const stats = $$('.stat-number');
    if (stats.length > 0) {
        setTimeout(() => animateCounter(stats), 1000);
    }

    // 3. Card Glow
    const intelCards = $$('.intel-card');
    if (intelCards.length > 0) {
        initGlowEffect(intelCards);
    }

    // 4. Smooth Scroll
    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            try {
                const target = $(href);
                if (target) target.scrollIntoView({ behavior: 'smooth' });
            } catch (err) {
                console.warn(`Smooth scroll target invalid: ${href}`, err);
            }
        });
    });
});
