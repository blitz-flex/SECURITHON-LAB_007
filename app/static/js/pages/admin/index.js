/* Admin — Main Orchestrator */
import { loadFleet, initFleetSearch, openOperativeModal, deleteOperative, sortFleet } from './users.js?v=3';
import { loadCurriculum, initLabEditor, openLabEditor, deleteLab, toggleLabState } from './labs.js?v=3';
import { loadAnalytics, loadIntelligence, loadInfrastructure, restartNode, toggleLockdown, toggleMonitor } from './analytics.js?v=3';
import { loadSessions, kickSession, kickAllSessions } from './sessions.js?v=3';
import { loadAuditLogs, initSettingsManager, syncMaintenanceUI, initActionButtons, initTelemetry, initLogFeed } from './system.js?v=3';

// Expose functions needed by inline onclick handlers
window.openOperativeModal = openOperativeModal;
window.deleteOperative    = deleteOperative;
window.sortFleet          = sortFleet;
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
    const allowedTabs = new Set(Array.from(navItems).map(i => i.getAttribute('data-tab')).filter(Boolean));
    const tabRouteMap = {
        overview: '/admin/overview',
        fleet: '/admin/fleet',
        intelligence: '/admin/intelligence',
        infra: '/admin/infra',
        curriculum: '/admin/curriculum',
        logs: '/admin/logs',
        settings: '/admin/settings',
    };
    const routeTabMap = Object.fromEntries(Object.entries(tabRouteMap).map(([tab, route]) => [route, tab]));

    const getTabFromPath = () => {
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        if (routeTabMap[path]) return routeTabMap[path];
        if (path === '/admin') return 'overview';
        return null;
    };

    const getTabFromUrl = () => {
        const fromPath = getTabFromPath();
        if (fromPath && allowedTabs.has(fromPath)) return fromPath;
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        return allowedTabs.has(tab) ? tab : null;
    };

    const setTabInUrl = (tab) => {
        const route = tabRouteMap[tab];
        if (!route) return;
        window.history.pushState({ tab }, '', route);
    };

    const activateTab = (tab) => {
        if (!allowedTabs.has(tab)) return;
        navItems.forEach(i => i.classList.remove('active'));
        tabContents.forEach(t => t.classList.remove('active'));
        const navItem = Array.from(navItems).find(i => i.getAttribute('data-tab') === tab);
        navItem?.classList.add('active');
        document.getElementById(`tab-${tab}`)?.classList.add('active');
    };

    const initialTab = getTabFromUrl() || Array.from(navItems).find(i => i.classList.contains('active'))?.getAttribute('data-tab');
    if (initialTab) activateTab(initialTab);

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-tab');
            if (!target || !allowedTabs.has(target)) return;
            activateTab(target);
            setTabInUrl(target);
        });
    });

    window.addEventListener('popstate', () => {
        const tab = getTabFromUrl();
        if (tab) activateTab(tab);
    });
}
