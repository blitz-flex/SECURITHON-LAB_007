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

        return `<div onclick="openOperativeModal(${u.id})" class="fleet-row">
            <div class="cell-user">
                <span class="fleet-avatar">${initial}</span>
                <span>${u.username}</span>
            </div>
            <div><span class="badge ${rank.toLowerCase()}">${rank}</span></div>
            <div style="font-family:var(--font-data);color:var(--text-main);">${(u.points||0).toLocaleString()}</div>
            <div style="display:flex;align-items:center;gap:7px;">
                <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
                <span style="font-size:0.75rem;font-family:var(--font-data);color:${u.is_active ? 'var(--primary)' : 'var(--danger)'};"
                >${u.is_active ? (isOnline ? 'ONLINE' : 'ACTIVE') : 'BANNED'}</span>
            </div>
            <div style="font-size:0.75rem;font-family:var(--font-data);color:var(--text-muted);">${lastActiveFormatted}</div>
            <div>
                <button class="btn btn-sm btn-danger"
                    onclick="event.stopPropagation(); deleteOperative(${u.id})"
                    style="padding:3px 9px;font-size:0.7rem;"
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
    document.getElementById('modal-username').innerText = user.username.toUpperCase();
    document.getElementById('modal-avatar').innerText = user.username[0].toUpperCase();
    document.getElementById('modal-xp').innerText = user.points;
    document.getElementById('modal-status').innerText = user.is_active ? 'ACTIVE' : 'BANNED';

    const promoteBtn = document.getElementById('modal-btn-promote');
    promoteBtn.innerText = user.is_superuser ? 'DEMOTE' : 'PROMOTE';
    promoteBtn.onclick = () => runUserAction(uid, user.is_superuser ? 'demote' : 'promote');

    document.getElementById('modal-btn-ban').innerText = user.is_active ? 'BAN_USER' : 'UNBAN_USER';
    document.getElementById('modal-btn-ban').onclick = () => runUserAction(uid, 'ban');
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

