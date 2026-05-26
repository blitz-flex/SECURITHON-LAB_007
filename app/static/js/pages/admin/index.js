/* Admin — Main Orchestrator */
import { loadFleet, initFleetSearch, openOperativeModal, deleteOperative } from './users.js';
import { loadCurriculum, initLabEditor, openLabEditor, deleteLab, toggleLabState } from './labs.js';
import { loadAnalytics, loadIntelligence, loadInfrastructure, restartNode, toggleLockdown, toggleMonitor } from './analytics.js';
import { loadSessions, kickSession, kickAllSessions } from './sessions.js';
import { loadAuditLogs, initSettingsManager, syncMaintenanceUI, initActionButtons, initTelemetry, initLogFeed } from './system.js';

// Expose functions needed by inline onclick handlers
window.openOperativeModal = openOperativeModal;
window.deleteOperative    = deleteOperative;
window.openLabEditor      = openLabEditor;
window.deleteLab          = deleteLab;
window.toggleLabState     = toggleLabState;
window.kickSession        = kickSession;
window.kickAllSessions    = kickAllSessions;
window.restartNode        = restartNode;
window.toggleLockdown     = toggleLockdown;
window.toggleMonitor      = toggleMonitor;
window.closeModal         = (id) => document.getElementById(id)?.classList.remove('show');

document.addEventListener('DOMContentLoaded', () => {
    _initTabs();
    initTelemetry();
    initLogFeed();
    initFleetSearch();
    initActionButtons();
    initLabEditor();
    initSettingsManager();

    // Close modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    });

    // Heatmap
    const cells = document.querySelectorAll('.heat-cell');
    if (cells.length) {
        setInterval(() => {
            const c = cells[Math.floor(Math.random() * cells.length)];
            c.className = 'heat-cell ' + ['', 'active-low', 'active-med', 'active-high'][Math.floor(Math.random() * 4)];
        }, 1000);
    }

    syncAll();
    setInterval(syncAll, 15000);
});

async function syncAll() {
    await Promise.all([
        loadAnalytics(),
        loadFleet(),
        loadCurriculum(),
        loadAuditLogs(),
        loadIntelligence(),
        loadInfrastructure(),
        loadSessions(),
    ]);
    syncMaintenanceUI();
}

function _initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-tab');
            navItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`tab-${target}`)?.classList.add('active');
        });
    });
}
