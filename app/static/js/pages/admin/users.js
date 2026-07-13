/* Admin — User / Fleet Management */
import { fetchWithAuth, showToast } from './shared.js';

let allUsers = [];
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
    ['username', 'rank', 'points', 'is_active'].forEach(col => {
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
            return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
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

function renderFleetTable(users) {
    const listContainer = document.getElementById('fleet-body-list');
    if (!listContainer) return;

    if (users.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;font-family:var(--font-mono);font-size:0.8rem;">[NO_OPERATIVES_FOUND_MATCHING_CRITERIA]</div>`;
        return;
    }

    listContainer.innerHTML = users.map(u => {
        const rank = u.is_superuser ? 'ADMIN' : (u.points > 1000 ? 'ELITE' : 'RECRUIT');
        return `<div onclick="openOperativeModal(${u.id})" class="fleet-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr; padding: 16px 20px; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.02); font-size: 0.85rem; color: var(--text-main); font-weight: 500; cursor: pointer; transition: var(--transition);">
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px;">${u.username}</div>
            <div><span class="badge ${rank.toLowerCase()}">${rank}</span></div>
            <div style="font-family: var(--font-data);">${u.points}</div>
            <div style="display: flex; align-items: center; gap: 8px;"><span class="status-indicator ${u.is_active ? 'online' : ''}"></span> ${u.is_active ? 'ACTIVE' : 'BANNED'}</div>
            <div><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteOperative(${u.id})" style="padding:2px 8px;font-size:0.75rem;border-radius:4px;"><i class="fas fa-trash-alt"></i></button></div>
        </div>`;
    }).join('');
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
