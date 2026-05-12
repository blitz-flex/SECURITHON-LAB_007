/**
 * Settings Page Entry Point
 */
import { $ } from '../utils/dom.js';

const sections = {
    'profile': { title: 'Public Profile', desc: 'Manage how you appear in the Securithon ecosystem.' },
    'security': { title: 'Security & Access', desc: 'Strengthen your operational security posture.' },
    'editor': { title: 'Code Editor', desc: 'Configure your IDE preferences and themes.' },
    'terminal': { title: 'Terminal UI', desc: 'Customize your command-line interface experience.' },
    'developer': { title: 'Developer API', desc: 'Manage programmatic access to your lab resources.' }
};

export function switchTab(tabId, element) {
    // Toggle Nav
    document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    // Toggle Section
    document.querySelectorAll('.settings-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    // Update Header
    const titleEl = $('#current-section-title');
    const descEl = $('#current-section-desc');
    if (titleEl) titleEl.innerText = sections[tabId].title;
    if (descEl) descEl.innerText = sections[tabId].desc;

    // Reset Scroll
    const mainEl = $('.settings-main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
}

export function saveSettings(event) {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = 'SAVING...';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerText = 'CHANGES APPLIED';
        btn.style.background = '#3fb950';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = 'var(--primary-app)';
            btn.disabled = false;
        }, 2000);
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Sync User Data
    const sync = (user) => {
        const input = $('#display-name-input');
        if (input) input.value = user.full_name || user.username;
    };

    if (window.currentUser) sync(window.currentUser);
    document.addEventListener('userLoaded', (e) => sync(e.detail));

    // Custom Dropdown Logic
    const specTrigger = $('#spec-trigger');
    const specOptions = $('#spec-options');
    const specValue = $('#spec-value');
    const specInput = $('#specialization-input');

    if (specTrigger) {
        specTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            specOptions.classList.toggle('show');
            specTrigger.classList.toggle('open');
        });

        document.querySelectorAll('.custom-option').forEach(option => {
            option.addEventListener('click', function() {
                const val = this.getAttribute('data-value');
                specValue.innerText = val;
                specInput.value = val;
                
                document.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                
                specOptions.classList.remove('show');
                specTrigger.classList.remove('open');
            });
        });

        document.addEventListener('click', () => {
            specOptions.classList.remove('show');
            specTrigger.classList.remove('open');
        });
    }

    // Expose functions to global scope for onclick handlers in HTML
    window.switchTab = switchTab;
    window.saveSettings = saveSettings;
});
