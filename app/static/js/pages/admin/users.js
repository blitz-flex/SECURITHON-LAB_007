/* Admin — User / Fleet Management */
import { fetchWithAuth, showToast } from './shared.js';

let allUsers = [];

export async function loadFleet() {
    const res = await fetchWithAuth('/api/v1/admin/users');
    if (!res.ok) return;
    allUsers = await res.json();
    renderFleetTable(allUsers);
}

export function initFleetSearch() {
    document.getElementById('fleetSearch')?.addEventListener('input', (e) => {
        renderFleetTable(allUsers.filter(u => u.username.toLowerCase().includes(e.target.value.toLowerCase())));
    });
}

function renderFleetTable(users) {
    const tbody = document.querySelector('.fleet-table tbody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => {
        const rank = u.is_superuser ? 'ADMIN' : (u.points > 1000 ? 'ELITE' : 'RECRUIT');
        return `<tr onclick="openOperativeModal(${u.id})" style="cursor:pointer">
            <td>${u.username}</td>
            <td><span class="badge ${rank.toLowerCase()}">${rank}</span></td>
            <td>${u.points}</td>
            <td><span class="status-indicator ${u.is_active ? 'online' : ''}"></span> ${u.is_active ? 'ACTIVE' : 'BANNED'}</td>
            <td><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteOperative(${u.id})" style="padding:2px 8px;font-size:0.75rem;border-radius:4px;"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`;
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
