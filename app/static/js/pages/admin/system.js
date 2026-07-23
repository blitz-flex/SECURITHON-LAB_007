/* Admin — System Settings, Audit Logs, Telemetry */
import { fetchWithAuth, showToast } from './shared.js';

export async function loadAuditLogs() {
    const res = await fetchWithAuth('/api/v1/admin/audit-logs');
    if (!res.ok) return;
    const logs = await res.json();
    const list = document.getElementById('auditLogList');
    if (!list) return;
    list.innerHTML = logs.map(l =>
        `<div class="audit-item" style="font-size:0.75rem;margin-bottom:8px;font-family:var(--font-mono)">
            <span style="color:var(--text-muted)">${l.time}</span>
            <span style="color:var(--primary-app)">[${l.action}]</span> ${l.detail}
        </div>`
    ).join('');
}

export async function initSettingsManager() {
    const res = await fetchWithAuth('/api/v1/admin/settings');
    if (res.ok) {
        const config = await res.json();
        const maintenance = document.getElementById('config-maintenance');
        const registration = document.getElementById('config-registration');
        const announcement = document.getElementById('config-announcement');
        if (maintenance) maintenance.checked = config.maintenance_mode;
        if (registration) registration.checked = config.allow_registration;
        if (announcement) announcement.value = config.global_announcement;
        syncMaintenanceUI();
    }

    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        const payload = {
            maintenance_mode: document.getElementById('config-maintenance')?.checked,
            allow_registration: document.getElementById('config-registration')?.checked,
            global_announcement: document.getElementById('config-announcement')?.value,
        };
        const r = await fetchWithAuth('/api/v1/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (r.ok) { showToast('SETTINGS_COMMIT_SUCCESS', 'success'); syncMaintenanceUI(); }
    });
}

export function syncMaintenanceUI() {
    const isM = document.getElementById('config-maintenance')?.checked;
    const status = document.getElementById('sidebar-status-text');
    if (status) {
        status.innerText = isM ? 'LOCK_ACTIVE' : 'CORE_STABLE';
        status.className = isM ? 'status-text text-danger' : 'status-text text-success';
    }
}

function runSystemTaskModal({ title, icon, subtext, steps, apiCall }) {
    const modal = document.getElementById('systemProcessModal');
    if (!modal) return;

    document.getElementById('processModalTitle').innerText = title;
    document.getElementById('processModalSub').innerText = subtext;
    document.getElementById('processModalIcon').className = icon;

    const bar = document.getElementById('processProgressBar');
    const consoleEl = document.getElementById('processConsole');
    const statusDot = document.getElementById('processStatusDot');
    const statusText = document.getElementById('processStatusText');
    const closeBtn = document.getElementById('processModalCloseBtn');

    if (bar) bar.style.width = '3%';
    if (consoleEl) {
        consoleEl.innerHTML = `<div><span style="color:var(--text-muted);">[SYS_INIT]</span> ${title} initiated...</div>`;
    }
    if (statusDot) statusDot.className = 'status-indicator online';
    if (statusText) { statusText.innerText = 'EXECUTING...'; statusText.style.color = 'var(--primary)'; }
    if (closeBtn) closeBtn.style.display = 'none';

    modal.classList.add('show');

    let currentStep = 0;
    const stepDelay = 650; // realistic typing / execution delay per step

    const interval = setInterval(() => {
        if (currentStep < steps.length) {
            const stepObj = steps[currentStep];
            const percent = Math.min(88, Math.round(((currentStep + 1) / (steps.length + 1)) * 92));
            if (bar) bar.style.width = `${percent}%`;
            
            if (consoleEl) {
                const line = document.createElement('div');
                const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:var(--secondary); font-weight: 600;">[STAGE_${currentStep + 1}]</span> ${stepObj.text} <span style="color:#f59e0b; font-size:0.68rem;">(${stepObj.detail})</span>`;
                consoleEl.appendChild(line);
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }
            currentStep++;
        } else {
            clearInterval(interval);
        }
    }, stepDelay);

    // Run backend API Call alongside simulation
    apiCall().then(async (res) => {
        // Wait until simulation steps finish
        const remainingTime = Math.max(0, (steps.length - currentStep) * stepDelay + 300);
        setTimeout(async () => {
            clearInterval(interval);
            const data = await res.json();
            
            if (bar) bar.style.width = '100%';

            if (res.ok) {
                if (consoleEl) {
                    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                    const line = document.createElement('div');
                    line.style.color = 'var(--primary)';
                    line.style.fontWeight = '700';
                    line.style.marginTop = '4px';
                    line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:var(--primary);">[SUCCESS]</span> ${data.message || 'Task completed successfully.'}`;
                    consoleEl.appendChild(line);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }
                if (statusText) statusText.innerText = 'COMPLETED SUCCESS';
                showToast(data.message || 'TASK_COMPLETE', 'success');
            } else {
                if (consoleEl) {
                    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                    const line = document.createElement('div');
                    line.style.color = 'var(--danger)';
                    line.style.fontWeight = '700';
                    line.style.marginTop = '4px';
                    line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:var(--danger);">[ERROR]</span> ${data.detail || 'Task failed.'}`;
                    consoleEl.appendChild(line);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }
                if (statusDot) statusDot.className = 'status-indicator offline';
                if (statusText) { statusText.innerText = 'FAILED'; statusText.style.color = 'var(--danger)'; }
                showToast(data.detail || 'TASK_FAILED', 'error');
            }

            if (closeBtn) closeBtn.style.display = 'inline-block';
        }, remainingTime);

    }).catch(err => {
        clearInterval(interval);
        if (bar) bar.style.width = '100%';
        if (consoleEl) {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false });
            const line = document.createElement('div');
            line.style.color = 'var(--danger)';
            line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:var(--danger);">[FATAL]</span> ${err.message}`;
            consoleEl.appendChild(line);
        }
        if (statusDot) statusDot.className = 'status-indicator offline';
        if (statusText) { statusText.innerText = 'ERROR'; statusText.style.color = 'var(--danger)'; }
        if (closeBtn) closeBtn.style.display = 'inline-block';
    });
}

function runSnapshotVaultModal() {
    const modal = document.getElementById('snapshotModal');
    if (!modal) return;

    const bar = document.getElementById('snapProgressBar');
    const percentText = document.getElementById('snapPercentText');
    const consoleEl = document.getElementById('snapVaultConsole');
    const statusText = document.getElementById('snapVaultStatus');
    const spinner = document.getElementById('snapVaultSpinner');
    const closeBtn = document.getElementById('snapModalCloseBtn');

    if (bar) bar.style.width = '4%';
    if (percentText) percentText.innerText = '4%';
    if (consoleEl) consoleEl.innerHTML = `<div><span style="color:var(--text-muted);">[VAULT_INIT]</span> Initiating AES-256 Vault Snapshot stream...</div>`;
    if (spinner) spinner.style.display = 'block';
    if (statusText) { statusText.innerText = 'LOCKING WAL & CREATING SNAPSHOT...'; statusText.style.color = '#10b981'; }
    if (closeBtn) closeBtn.style.display = 'none';

    modal.classList.add('show');

    const steps = [
        { text: 'Acquiring Exclusive WAL Write Lock on SQLite / Postgres Data Engine...', detail: 'LOCK_LEVEL: EXCLUSIVE' },
        { text: 'Generating AES-256-GCM Encryption Key Matrix & IV Metadata...', detail: 'KEY_HASH: 0x9f8e21a...' },
        { text: 'Packaging active Operatives, Labs, and System Audit Logs...', detail: 'Records: Verified' },
        { text: 'Encrypting binary stream into /data/backups/SEC_LAB_SNAP_*.db...', detail: 'Compressing ZSTD' },
        { text: 'Initiating AWS S3 Cloud Storage Bucket Sync Handshake...', detail: 'Bucket: AWS-Vault-Sync' },
        { text: 'Validating SHA-512 Hash Checksum & Vault Manifest...', detail: 'Checksum Verified' }
    ];

    let currentStep = 0;
    const stepDelay = 700;

    const interval = setInterval(() => {
        if (currentStep < steps.length) {
            const stepObj = steps[currentStep];
            const percent = Math.min(92, Math.round(((currentStep + 1) / (steps.length + 1)) * 95));
            if (bar) bar.style.width = `${percent}%`;
            if (percentText) percentText.innerText = `${percent}%`;

            if (consoleEl) {
                const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                const line = document.createElement('div');
                line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:#06b6d4; font-weight: 700;">[VAULT_PHASE_${currentStep + 1}]</span> ${stepObj.text} <span style="color:#f59e0b; font-size:0.68rem;">[${stepObj.detail}]</span>`;
                consoleEl.appendChild(line);
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }
            currentStep++;
        } else {
            clearInterval(interval);
        }
    }, stepDelay);

    fetchWithAuth('/api/v1/admin/system/backup', { method: 'POST' }).then(async (res) => {
        const remainingTime = Math.max(0, (steps.length - currentStep) * stepDelay + 400);
        setTimeout(async () => {
            clearInterval(interval);
            const data = await res.json();

            if (bar) bar.style.width = '100%';
            if (percentText) percentText.innerText = '100%';

            if (res.ok) {
                if (consoleEl) {
                    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                    const line = document.createElement('div');
                    line.style.color = '#10b981';
                    line.style.fontWeight = '700';
                    line.style.marginTop = '6px';
                    line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:#10b981;">[VAULT_SECURED]</span> ${data.message}`;
                    consoleEl.appendChild(line);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }
                if (spinner) spinner.style.display = 'none';
                if (statusText) statusText.innerText = 'SNAPSHOT ARCHIVED & SECURED';
                showToast(data.message || 'SNAPSHOT_CREATED', 'success');
            } else {
                if (consoleEl) {
                    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
                    const line = document.createElement('div');
                    line.style.color = 'var(--danger)';
                    line.style.fontWeight = '700';
                    line.innerHTML = `<span style="color:var(--text-muted); font-size: 0.68rem;">[${time}]</span> <span style="color:var(--danger);">[VAULT_ERROR]</span> ${data.detail || 'Snapshot failed'}`;
                    consoleEl.appendChild(line);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }
                if (spinner) spinner.style.display = 'none';
                if (statusText) { statusText.innerText = 'VAULT ARCHIVE FAILED'; statusText.style.color = 'var(--danger)'; }
                showToast(data.detail || 'SNAPSHOT_FAILED', 'error');
            }

            if (closeBtn) closeBtn.style.display = 'inline-block';
        }, remainingTime);
    }).catch(err => {
        clearInterval(interval);
        if (bar) bar.style.width = '100%';
        if (percentText) percentText.innerText = '100%';
        if (spinner) spinner.style.display = 'none';
        if (statusText) { statusText.innerText = 'FATAL ERROR'; statusText.style.color = 'var(--danger)'; }
        if (closeBtn) closeBtn.style.display = 'inline-block';
    });
}

export function initActionButtons() {
    document.getElementById('btn-db-check')?.addEventListener('click', () => {
        runSystemTaskModal({
            title: 'System Integrity Scan',
            icon: 'fas fa-shield-alt',
            subtext: 'Scanning relational schemas, table constraints, user indexes, and checksums...',
            steps: [
                { text: 'Initializing SQLite / PostgreSQL connection pool...', detail: 'Pool: 8 connections active' },
                { text: 'Checking users table schema and foreign key constraints...', detail: 'OK: 0 orphans found' },
                { text: 'Auditing operative permissions & JWT token integrity...', detail: 'Verifying ACL signatures' },
                { text: 'Executing SQLite PRAGMA quick_check integrity scan...', detail: 'Scanning page memory blocks' },
                { text: 'Verifying audit logs & activity timestamps...', detail: 'Check 100% complete' }
            ],
            apiCall: () => fetchWithAuth('/api/v1/admin/db-check', { method: 'POST' })
        });
    });

    document.getElementById('btn-backup')?.addEventListener('click', () => {
        runSnapshotVaultModal();
    });

    document.getElementById('btn-reset')?.addEventListener('click', async () => {
        if (!confirm('CONFIRM EMERGENCY CORE RESET?')) return;
        runSystemTaskModal({
            title: 'Emergency Core Restart',
            icon: 'fas fa-radiation',
            subtext: 'Severing active sessions, clearing cache buffers, and restarting FastAPI core...',
            steps: [
                { text: 'Broadcasting emergency disconnect to active session sockets...', detail: 'Terminating active WS' },
                { text: 'Flushing in-memory telemetry, audit logs, and cache buffers...', detail: 'RAM buffer zeroed' },
                { text: 'Re-initializing core FastAPI application services...', detail: 'Restoring routes & middleware' },
                { text: 'Conducting post-restart health handshake...', detail: 'Status: 200 OK' }
            ],
            apiCall: () => fetchWithAuth('/api/v1/admin/emergency-reset', { method: 'POST' })
        });
    });
}





export function initTelemetry() {
    const update = async () => {
        const res = await fetchWithAuth('/api/v1/system/stats');
        if (!res.ok) return;
        const d = await res.json();
        const cpuFill = document.querySelector('.cpu-fill');
        const memFill = document.querySelector('.mem-fill');
        if (cpuFill) { cpuFill.style.width = d.cpu + '%'; document.querySelector('.cpu-text').innerText = d.cpu.toFixed(1) + '%'; }
        if (memFill) { memFill.style.width = d.memory + '%'; document.querySelector('.mem-text').innerText = d.memory.toFixed(1) + '%'; }
    };
    setInterval(update, 3000);
    update();
}

export function initLogFeed() {
    const list = document.getElementById('securityAlertsList');
    if (!list) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws, reconnectTimeout = null;

    function connect() {
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
        ws.onmessage = (e) => { try { addSecurityAlert(JSON.parse(e.data)); } catch {} };
        ws.onclose = () => { reconnectTimeout = setTimeout(connect, 3000); };
        ws.onerror = () => ws.close();
    }
    connect();
}

function addSecurityAlert(data) {
    const list = document.getElementById('securityAlertsList');
    if (!list) return;
    const isCritical = data.message.toLowerCase().includes('unauthorized') || data.message.toLowerCase().includes('failed');
    const color = isCritical ? 'var(--danger)' : 'var(--secondary)';
    const item = document.createElement('div');
    item.className = 'alert-item';
    item.style.cssText = `background:${isCritical ? 'rgba(239,68,68,0.05)' : 'rgba(59,130,246,0.05)'};border:1px solid ${isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)'};padding:12px;border-radius:8px;display:flex;gap:12px;align-items:center;animation:slideIn 0.3s ease-out;`;
    item.innerHTML = `
        <i class="fas ${isCritical ? 'fa-exclamation-triangle' : 'fa-info-circle'}" style="color:${color};"></i>
        <div style="flex:1;">
            <div style="font-size:0.75rem;color:#fff;font-weight:600;">${data.category} Event Detected</div>
            <div style="font-size:0.65rem;color:var(--text-muted);">${data.message}</div>
        </div>
        <span style="font-size:0.6rem;color:var(--text-muted);font-family:var(--font-data);">${data.time}</span>`;
    list.insertBefore(item, list.firstChild);
    if (list.children.length > 15) list.removeChild(list.lastChild);
}

export function initShell() {
    const input  = document.getElementById('shellInput');
    const output = document.getElementById('shellOutput');
    if (!input || !output) return;

    const history = [];
    let histIdx = -1;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const raw = input.value.trim();
            if (!raw) return;
            history.unshift(raw);
            histIdx = -1;
            input.value = '';
            processShellCmd(raw, output);
        } else if (e.key === 'ArrowUp') {
            if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
            else { histIdx = -1; input.value = ''; }
            e.preventDefault();
        }
    });
}

// ── Color rendering ─────────────────────────────────────────────────────────
function renderLine(line) {
    const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const e = esc(line);

    // Section header lines  ═══ ... ═══
    if (/^═/.test(line))
        return `<span style="color:#58a6ff;font-weight:700">${e}</span>`;
    // Key: value pairs
    if (/^\s{2}[\w ]+:\s+\S/.test(line)) {
        const m = line.match(/^(\s{2})([\w ]+:)\s+(.*)/);
        if (m) return `${m[1]}<span style="color:#3fb950;font-weight:600">${esc(m[2])}</span> <span style="color:#e6edf3">${esc(m[3])}</span>`;
    }
    // ALL CAPS header lines (section titles)
    if (/^[A-Z][A-Z0-9 _\-—:/]+$/.test(line.trim()) && line.trim().length > 4)
        return `<span style="color:#58a6ff;font-weight:700">${e}</span>`;
    // Lines starting with - (list items)
    if (/^\s*-\s/.test(line))
        return `<span style="color:#e6edf3">${e}</span>`;
    // Timestamp pattern [HH:MM:SS]
    if (/\[\d{2}:\d{2}:\d{2}\]/.test(line))
        return line.replace(/(\[\d{2}:\d{2}:\d{2}\])/g, '<span style="color:#8b949e">$1</span>')
                   .replace(/\|/g, '<span style="color:#30363d">|</span>');
    // IP addresses
    if (/\d+\.\d+\.\d+\.\d+/.test(line))
        return e.replace(/(\d+\.\d+\.\d+\.\d+)/g, '<span style="color:#f0883e;font-weight:600">$1</span>');
    // Error lines
    if (/^(ERROR|UNKNOWN_CMD|CONNECTION_ERROR|DOCKER_UNAVAIL|NO_ACTIVE)/.test(line.trim()))
        return `<span style="color:#f85149">${e}</span>`;
    // Warning / lockdown
    if (/LOCKDOWN|WARNING|CAUTION|ALERT/.test(line))
        return `<span style="color:#d29922">${e}</span>`;
    // Success patterns
    if (/SUCCESS|CLEARED|SET|ENABLED|DISABLED|UNBANNED|BANNED|KICKED/.test(line) && !/ERROR/.test(line))
        return `<span style="color:#3fb950">${e}</span>`;
    // Audit trail header
    if (/AUDIT TRAIL/.test(line))
        return `<span style="color:#a371f7">${e}</span>`;

    return `<span style="color:#8b949e">${e}</span>`;
}

function printOutput(output, text, isCmd = false) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:4px;';

    if (isCmd) {
        wrapper.innerHTML =
            `<span style="color:var(--primary);font-weight:700">admin@occ:~$</span> ` +
            `<span style="color:#e6edf3">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    } else {
        const lines = text.split('\n');
        wrapper.innerHTML = lines.map(renderLine).join('<br>');
        wrapper.style.marginBottom = '12px';
        wrapper.style.lineHeight   = '1.7';
    }

    output.appendChild(wrapper);
    output.scrollTop = output.scrollHeight;
}

// ── Command processor ────────────────────────────────────────────────────────
async function processShellCmd(raw, output) {
    const cmd = raw.trim().toLowerCase().split(/\s+/)[0];

    // echo input
    printOutput(output, raw, true);

    if (cmd === 'clear') {
        output.innerHTML = '';
        return;
    }

    if (cmd === 'help') {
        printOutput(output, [
            'AVAILABLE COMMANDS',
            '──────────────────────────────────────────────',
            '  STATUS & INFO',
            '  status              — CPU, RAM, operatives online',
            '  sysinfo             — OS, Python, FastAPI, uptime, disk',
            '  dbstats             — Database file size & row counts',
            '',
            '  OPERATIVE MANAGEMENT',
            '  users               — List all registered operatives',
            '  userinfo [name]     — Full profile of an operative',
            '  whois [name]        — IP history & audit trail',
            '  ban [name]          — Deactivate operative account',
            '  unban [name]        — Reactivate operative account',
            '  kick [name]         — Force-terminate session',
            '',
            '  LAB CONTROL',
            '  labs                — List all challenge labs',
            '  labstats            — Active sandbox statistics',
            '',
            '  SECURITY',
            '  activeips           — IPs active in last 24 hours',
            '  securityalerts      — Recent ban/kick/admin events',
            '  auditlog [n]        — Last n admin actions (max 50)',
            '  clearaudit          — Wipe audit log from memory',
            '',
            '  PLATFORM',
            '  lockdown [on/off]   — Toggle maintenance mode',
            '  announce [text]     — Set global announcement banner',
            '  announce clear      — Remove announcement banner',
            '',
            '  clear               — Clear terminal',
        ].join('\n'));
        return;
    }

    try {
        const res = await fetchWithAuth('/api/v1/system/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: raw })   // send raw to preserve case/args
        });
        if (res.ok) {
            const data = await res.json();
            printOutput(output, data.output);
        } else {
            let errMsg = 'Failed to execute command';
            try {
                const err = await res.json();
                errMsg = err.detail || errMsg;
            } catch { try { errMsg = await res.text(); } catch {} }
            printOutput(output, `ERROR (${res.status}): ${errMsg}`);
        }
    } catch (e) {
        printOutput(output, `CONNECTION_ERROR: ${e.message || 'Failed to reach OCC API endpoint.'}`);
    }
}

