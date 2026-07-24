/* Admin — User / Fleet Management */
import { fetchWithAuth, showToast } from './shared.js';

let allUsers = [];
let selectedUserIds = new Set();
let sortColumn = null;
let sortDirection = 'asc';

export async function loadFleet() {
    const res = await fetchWithAuth('/api/v1/admin/users');
    if (!res.ok) return;
    allUsers = await res.json();

    // Calculate OCC dashboard statistics
    const totalOps = allUsers.length;
    const totalXP = allUsers.reduce((sum, u) => sum + (u.points || 0), 0);
    const avgXP = totalOps > 0 ? Math.round(totalXP / totalOps) : 0;

    const totalOpsEl = document.getElementById('stat-total-operatives');
    const totalXPEl = document.getElementById('stat-total-xp');
    const avgXPEl = document.getElementById('stat-avg-xp');

    if (totalOpsEl) totalOpsEl.innerText = totalOps;
    if (totalXPEl) totalXPEl.innerText = totalXP.toLocaleString();
    if (avgXPEl) avgXPEl.innerText = avgXP.toLocaleString();

    // Render table
    renderFleetTable(allUsers);
}

export function sortFleet(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    // Update table header sort indicators
    ['username', 'rank', 'points', 'is_active', 'last_active'].forEach(col => {
        const iconEl = document.getElementById(`sort-${col}-icon`);
        if (iconEl) {
            if (col === sortColumn) {
                iconEl.innerText = sortDirection === 'asc' ? '▲' : '▼';
                iconEl.style.opacity = '1';
                iconEl.style.color = 'var(--primary)';
            } else {
                iconEl.innerText = '↕';
                iconEl.style.opacity = '0.4';
                iconEl.style.color = '';
            }
        }
    });

    let sortedUsers = [...allUsers];
    sortedUsers.sort((a, b) => {
        let valA, valB;
        if (column === 'rank') {
            const getRankVal = u => u.is_superuser ? 3 : (u.points > 1000 ? 2 : 1);
            valA = getRankVal(a);
            valB = getRankVal(b);
        } else {
            valA = a[column];
            valB = b[column];
        }

        if (typeof valA === 'string') {
            return sortDirection === 'asc' ? valA.localeCompare(valB || '') : (valB || '').localeCompare(valA || '');
        } else if (typeof valA === 'boolean') {
            const numA = valA ? 1 : 0;
            const numB = valB ? 1 : 0;
            return sortDirection === 'asc' ? numA - numB : numB - numA;
        } else {
            return sortDirection === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
        }
    });

    renderFleetTable(sortedUsers);
}

export function initFleetSearch() {
    document.getElementById('fleetSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderFleetTable(allUsers);
            return;
        }
        const filtered = allUsers.filter(u => {
            const rank = u.is_superuser ? 'admin' : (u.points > 1000 ? 'elite' : 'recruit');
            const status = u.is_active ? 'active' : 'banned';
            return u.username.toLowerCase().includes(query) || 
                   rank.includes(query) || 
                   status.includes(query) ||
                   String(u.points).includes(query);
        });
        renderFleetTable(filtered);
    });
}

function formatTimeAgo(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    return `${Math.floor(diffSec / 86400)} days ago`;
}

function renderFleetTable(users) {
    const listContainer = document.getElementById('fleet-body-list');
    if (!listContainer) return;

    // Remove skeleton on first real render
    const skeleton = document.getElementById('fleet-skeleton');
    if (skeleton) skeleton.remove();

    if (users.length === 0) {
        listContainer.innerHTML = `<div class="fleet-empty"><i class="fas fa-users-slash"></i>[NO_OPERATIVES_FOUND_MATCHING_CRITERIA]</div>`;
        return;
    }

    const now = new Date();

    listContainer.innerHTML = users.map(u => {
        const rank     = u.is_superuser ? 'ADMIN' : (u.points > 1000 ? 'ELITE' : 'RECRUIT');
        const initial  = (u.username[0] || '?').toUpperCase();
        
        // Calculate live online status (active in last 5 mins)
        let isOnline = false;
        if (u.last_active) {
            const lastActDate = new Date(u.last_active.endsWith('Z') ? u.last_active : u.last_active + 'Z');
            isOnline = (now - lastActDate) < 5 * 60 * 1000;
        }

        const isChecked = selectedUserIds.has(u.id);
        const lastActiveFormatted = formatTimeAgo(u.last_active);

        return `<div class="fleet-row">
            <div class="cell-user">
                <span class="fleet-avatar">${initial}</span>
                <span class="fleet-name-cell${u.username.length > 10 ? ' is-truncated' : ''}"${u.username.length > 10 ? ` data-tooltip="${u.username}"` : ''}>${u.username.length > 10 ? u.username.slice(0, 10) + '\u2026' : u.username}</span>
            </div>
            <div><span class="badge ${rank.toLowerCase()}">${rank}</span></div>
            <div style="font-family:var(--font-data);color:var(--text-main);">${(u.points||0).toLocaleString()}</div>
            <div style="display:flex;align-items:center;justify-content:center;gap:7px;">
                <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
                <span style="font-size:0.75rem;font-family:var(--font-data);color:${u.is_active ? 'var(--primary)' : 'var(--danger)'};"
                >${u.is_active ? (isOnline ? 'ONLINE' : 'ACTIVE') : 'BANNED'}</span>
            </div>
            <div style="font-size:0.75rem;font-family:var(--font-data);color:var(--text-muted);justify-content:center;">${lastActiveFormatted}</div>
            <div style="display:flex;align-items:center;gap:5px;">
                <button class="btn btn-sm"
                    onclick="openOperativeModal(${u.id})"
                    style="padding:3px 9px;font-size:0.7rem;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;cursor:pointer;"
                    title="View profile"
                ><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-danger"
                    onclick="deleteOperative(${u.id})"
                    style="padding:3px 9px;font-size:0.7rem;"
                    title="Delete operative"
                ><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`;

    }).join('');

    updateBulkBarState();
}

// ── Checkboxes & Bulk Actions ──
export function toggleSelectOperative(id, checked) {
    if (checked) selectedUserIds.add(id);
    else selectedUserIds.delete(id);
    updateBulkBarState();
}

export function toggleSelectAllOperatives(masterChk) {
    const isChecked = masterChk.checked;
    selectedUserIds.clear();
    if (isChecked) {
        allUsers.forEach(u => selectedUserIds.add(u.id));
    }
    document.querySelectorAll('.user-chk').forEach(chk => chk.checked = isChecked);
    updateBulkBarState();
}

function updateBulkBarState() {
    const count = selectedUserIds.size;
    const bulkBar = document.getElementById('bulkBar');
    const bulkCountEl = document.getElementById('bulkCount');
    const masterChk = document.getElementById('chkSelectAll');

    if (bulkCountEl) bulkCountEl.innerText = count;
    if (bulkBar) {
        if (count > 0) bulkBar.classList.add('show');
        else bulkBar.classList.remove('show');
    }
    if (masterChk) {
        masterChk.checked = (allUsers.length > 0 && count === allUsers.length);
    }
}

export async function executeBulkAction(action) {
    if (selectedUserIds.size === 0) return;
    const userIds = Array.from(selectedUserIds);
    if (!confirm(`Execute bulk action '${action.toUpperCase()}' for ${userIds.length} operatives?`)) return;

    const res = await fetchWithAuth('/api/v1/admin/users/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds, action })
    });

    if (res.ok) {
        showToast(`BULK_${action.toUpperCase()}_SUCCESSFUL`, 'success');
        selectedUserIds.clear();
        loadFleet();
    } else {
        const err = await res.json();
        showToast(err.detail || 'BULK_ACTION_FAILED', 'error');
    }
}

// ── Export Functions ──
export function toggleExportMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('fleetExportMenu');
    menu?.classList.toggle('show');
}

document.addEventListener('click', () => {
    document.getElementById('fleetExportMenu')?.classList.remove('show');
});

export function exportFleetData(format) {
    document.getElementById('fleetExportMenu')?.classList.remove('show');
    if (!allUsers.length) {
        showToast('NO_DATA_TO_EXPORT', 'error');
        return;
    }

    if (format === 'json') {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allUsers, null, 2));
        downloadFile(dataStr, `securithon_operatives_${Date.now()}.json`);
    } else if (format === 'csv') {
        const headers = ["ID", "Username", "Email", "Points", "Is_Active", "Is_Admin", "Last_Active", "Last_IP"];
        const rows = allUsers.map(u => [
            u.id,
            `"${u.username.replace(/"/g, '""')}"`,
            `"${u.email.replace(/"/g, '""')}"`,
            u.points,
            u.is_active,
            u.is_superuser,
            `"${u.last_active || ''}"`,
            `"${u.last_ip || ''}"`
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        downloadFile(csvContent, `securithon_operatives_${Date.now()}.csv`);
    }
}

function downloadFile(content, filename) {
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", content);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('EXPORT_DOWNLOAD_STARTED', 'info');
}

export function openOperativeModal(uid) {
    const user = allUsers.find(u => u.id === uid);
    if (!user) return;

    // Identity
    document.getElementById('modal-username').innerText = user.username;
    document.getElementById('modal-avatar').innerText   = user.username[0].toUpperCase();
    document.getElementById('modal-xp').innerText       = (user.points || 0).toLocaleString();

    // Rank
    const rank = user.is_superuser ? 'Admin' : (user.points > 1000 ? 'Elite' : 'Recruit');
    document.getElementById('modal-rank').innerText = rank;

    // Status dot + label
    const isActive = user.is_active;
    const dot = document.getElementById('modal-status-dot');
    const statusEl = document.getElementById('modal-status');
    statusEl.innerText = isActive ? 'Active' : 'Banned';
    statusEl.style.color = isActive ? 'var(--primary)' : 'var(--danger, #ef4444)';
    dot.style.background = isActive ? 'var(--primary)' : '#ef4444';
    dot.style.boxShadow  = isActive ? '0 0 6px var(--primary)' : '0 0 6px #ef4444';

    // Promote / Demote
    const promoteBtn   = document.getElementById('modal-btn-promote');
    const promoteLabel = document.getElementById('modal-promote-label');
    const promoteDesc  = document.getElementById('modal-promote-desc');
    if (user.is_superuser) {
        promoteLabel.innerText = 'Demote from Admin';
        promoteDesc.innerText  = 'Remove admin privileges';
        promoteBtn.innerHTML   = '<i class="fas fa-arrow-down" style="font-size:0.65rem;margin-right:4px;"></i>Demote';
        promoteBtn.style.color        = '#a78bfa';
        promoteBtn.style.background   = 'rgba(167,139,250,0.1)';
        promoteBtn.style.borderColor  = 'rgba(167,139,250,0.25)';
    } else {
        promoteLabel.innerText = 'Promote to Admin';
        promoteDesc.innerText  = 'Grant full admin privileges';
        promoteBtn.innerHTML   = '<i class="fas fa-arrow-up" style="font-size:0.65rem;margin-right:4px;"></i>Promote';
        promoteBtn.style.color        = '#00e59b';
        promoteBtn.style.background   = 'rgba(0,229,155,0.1)';
        promoteBtn.style.borderColor  = 'rgba(0,229,155,0.25)';
    }
    promoteBtn.onclick = () => runUserAction(uid, user.is_superuser ? 'demote' : 'promote');

    // Ban / Unban
    const banBtn   = document.getElementById('modal-btn-ban');
    const banLabel = document.getElementById('modal-ban-label');
    const banDesc  = document.getElementById('modal-ban-desc');
    if (isActive) {
        banLabel.innerText = 'Ban User';
        banDesc.innerText  = 'Block access to the platform';
        banBtn.innerHTML   = '<i class="fas fa-ban" style="font-size:0.65rem;margin-right:4px;"></i>Ban';
        banBtn.style.color       = '#f59e0b';
        banBtn.style.background  = 'rgba(245,158,11,0.1)';
        banBtn.style.borderColor = 'rgba(245,158,11,0.25)';
    } else {
        banLabel.innerText = 'Unban User';
        banDesc.innerText  = 'Restore platform access';
        banBtn.innerHTML   = '<i class="fas fa-unlock" style="font-size:0.65rem;margin-right:4px;"></i>Unban';
        banBtn.style.color       = '#00e59b';
        banBtn.style.background  = 'rgba(0,229,155,0.1)';
        banBtn.style.borderColor = 'rgba(0,229,155,0.25)';
    }
    banBtn.onclick = () => runUserAction(uid, 'ban');

    // Delete + Reset
    document.getElementById('modal-btn-delete').onclick = () => deleteOperative(uid);
    const resetBtn = document.getElementById('modal-btn-reset');
    if (resetBtn) resetBtn.onclick = () => runUserAction(uid, 'reset_xp');

    document.getElementById('operativeModal').classList.add('show');
}

export async function deleteOperative(uid) {
    if (!confirm('PERMANENTLY DELETE OPERATIVE? This action cannot be undone!')) return;
    const res = await fetchWithAuth(`/api/v1/admin/users/${uid}`, { method: 'DELETE' });
    if (res.ok) {
        showToast('OPERATIVE_REMOVED_PERMANENTLY', 'error');
        loadFleet();
        document.getElementById('operativeModal')?.classList.remove('show');
    } else {
        const err = await res.json();
        showToast(err.detail || 'DELETE_FAILED', 'error');
    }
}

async function runUserAction(uid, action) {
    const res = await fetchWithAuth(`/api/v1/admin/users/${uid}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
    });
    if (res.ok) {
        showToast(`USER_${action.toUpperCase()}_SUCCESS`, 'success');
        loadFleet();
        document.getElementById('operativeModal')?.classList.remove('show');
    }
}

