/* Admin — Curriculum / Lab Management */
import { fetchWithAuth, showToast } from './shared.js';

let allLabs = [];

export async function loadCurriculum() {
    const res = await fetchWithAuth('/api/v1/admin/curriculum');
    if (!res.ok) return;
    allLabs = await res.json();
    const list = document.querySelector('.lab-list');
    if (!list) return;

    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:20px;';
    const catIcons = { 'Web Security': 'fa-globe', 'Infrastructure': 'fa-network-wired', 'Binary Research': 'fa-microchip', 'Cloud Security': 'fa-cloud' };

    list.innerHTML = allLabs.map(lab => {
        const color = lab.cvss >= 9 ? 'var(--danger)' : (lab.cvss >= 7 ? 'var(--warning)' : 'var(--secondary)');
        return `
        <div class="lab-card glass-panel" style="padding:24px;display:flex;flex-direction:column;gap:16px;border-left:4px solid ${color};opacity:${lab.disabled ? '0.6' : '1'}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">
                    <i class="fas ${catIcons[lab.category] || 'fa-book'}"></i>
                </div>
                <span class="badge" style="background:rgba(0,0,0,0.3);border-color:${color};color:${color}">CVSS: ${lab.cvss}</span>
            </div>
            <div style="flex:1;">
                <h3 style="font-size:1rem;color:#fff;margin-bottom:4px;font-weight:700;">${lab.title}</h3>
                <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-family:var(--font-data);">${lab.category}</div>
            </div>
            <div style="display:flex;gap:10px;margin-top:10px;">
                <button class="btn btn-sm ${lab.disabled ? 'btn-primary' : 'btn-secondary'}" style="flex:1" onclick="toggleLabState('${lab.id}',${!!lab.disabled})">
                    <i class="fas ${lab.disabled ? 'fa-play' : 'fa-pause'}"></i> ${lab.disabled ? 'ACTIVATE' : 'SUSPEND'}
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openLabEditor('${lab.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteLab('${lab.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

export function initLabEditor() {
    document.getElementById('labEditForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-lab-id').value;
        const payload = {
            title: document.getElementById('edit-lab-title').value,
            category: document.getElementById('edit-lab-category').value,
            cvss: parseFloat(document.getElementById('edit-lab-cvss').value),
        };
        const res = await fetchWithAuth(`/api/v1/admin/curriculum/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            showToast('METADATA_SAVED', 'success');
            document.getElementById('labModal').classList.remove('show');
            loadCurriculum();
        }
    });
}

export function openLabEditor(id) {
    const lab = allLabs.find(l => l.id === id);
    if (!lab) return;
    document.getElementById('edit-lab-id').value = lab.id;
    document.getElementById('edit-lab-title').value = lab.title;
    document.getElementById('edit-lab-category').value = lab.category;
    document.getElementById('edit-lab-cvss').value = lab.cvss;
    document.getElementById('labModal').classList.add('show');
}

export async function deleteLab(id) {
    if (!confirm('Are you sure you want to delete this lab module?')) return;
    const res = await fetchWithAuth(`/api/v1/admin/curriculum/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('LAB_DELETED', 'success'); loadCurriculum(); }
}

export async function toggleLabState(id, state) {
    const res = await fetchWithAuth(`/api/v1/admin/curriculum/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: state }),
    });
    if (res.ok) { showToast('LAB_STATUS_SYNCED', 'success'); loadCurriculum(); }
}
