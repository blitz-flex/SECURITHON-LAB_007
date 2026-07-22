/* Admin — Curriculum / Lab Management */
import { fetchWithAuth, showToast } from './shared.js';

let allLabs = [];

export async function loadCurriculum() {
    const res = await fetchWithAuth('/api/v1/admin/curriculum');
    if (res.ok) {
        allLabs = await res.json();
        renderCurriculumLabs();
    }
}

function renderCurriculumLabs() {
    const container = document.querySelector('.lab-list');
    if (!container) return;

    if (allLabs.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 50px; color: var(--text-muted); font-size: 0.9rem;">
            <i class="fas fa-book" style="font-size: 2.2rem; margin-bottom: 12px; opacity: 0.4;"></i><br>No lab modules currently loaded in curriculum.
        </div>`;
        return;
    }

    // Group labs by category
    const categories = {};
    const catMeta = {
        'Web Security':      { icon: 'fa-globe',           color: '#3b82f6' },
        'Infrastructure':    { icon: 'fa-network-wired',   color: '#10b981' },
        'Identity & Access': { icon: 'fa-shield-halved',   color: '#8b5cf6' },
        'Cloud Security':    { icon: 'fa-cloud',          color: '#f59e0b' }
    };

    allLabs.forEach(lab => {
        const cat = lab.category || 'Web Security';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(lab);
    });

    let html = '';
    for (const [catName, labs] of Object.entries(categories)) {
        const meta = catMeta[catName] || { icon: 'fa-layer-group', color: '#3b82f6' };
        
        html += `
        <div class="category-group-section" style="margin-bottom: 32px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: ${meta.color}20; border: 1px solid ${meta.color}40; display: flex; align-items: center; justify-content: center; color: ${meta.color}; font-size: 0.9rem;">
                    <i class="fas ${meta.icon}"></i>
                </div>
                <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; gap: 10px;">
                    ${catName}
                    <span class="badge" style="background: rgba(255,255,255,0.05); color: #8b949e; border-color: rgba(255,255,255,0.1); font-size: 0.7rem;">${labs.length} Labs</span>
                </h3>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px;">
                ${labs.map(lab => {
                    const cvssColor = lab.cvss >= 9 ? 'var(--danger)' : (lab.cvss >= 7 ? 'var(--warning)' : 'var(--secondary)');
                    return `
                    <div class="lab-card glass-panel" style="padding:18px; display:flex; flex-direction:column; gap:12px; border-left:4px solid ${cvssColor}; opacity:${lab.disabled ? '0.65' : '1'}; background: rgba(15,23,42,0.6);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-data); font-weight:600; text-transform:uppercase;">
                                ${lab.cwe || lab.id}
                            </div>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <span class="badge" style="background:rgba(0,0,0,0.4); border-color:${cvssColor}; color:${cvssColor}">CVSS ${lab.cvss}</span>
                                <span class="badge" style="background:${lab.disabled ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}; color:${lab.disabled ? '#ef4444' : '#10b981'}; border-color:${lab.disabled ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}">
                                    ${lab.disabled ? 'SUSPENDED' : 'ACTIVE'}
                                </span>
                            </div>
                        </div>
                        <div style="flex:1;">
                            <h4 style="font-size:0.95rem; color:#fff; margin:0 0 6px 0; font-weight:700;">${lab.title}</h4>
                            <p style="font-size:0.75rem; color:#8b949e; margin:0; line-height:1.4;">${lab.description || ''}</p>
                        </div>
                        <div style="display:flex; gap:8px; margin-top:4px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);">
                            <button class="btn btn-sm ${lab.disabled ? 'btn-primary' : 'btn-secondary'}" style="flex:1; font-size:0.75rem;" onclick="toggleLabState('${lab.id}',${!!lab.disabled})">
                                <i class="fas ${lab.disabled ? 'fa-play' : 'fa-pause'}"></i> ${lab.disabled ? 'ACTIVATE' : 'SUSPEND'}
                            </button>
                            <button class="btn btn-secondary btn-sm" style="padding:6px 12px;" onclick="openLabEditor('${lab.id}')"><i class="fas fa-edit"></i> EDIT</button>
                            <button class="btn btn-danger btn-sm" style="padding:6px 10px;" onclick="deleteLab('${lab.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;
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
            document.getElementById('labModal').style.display = 'none';
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
    const modal = document.getElementById('labModal');
    if (modal) modal.style.display = 'flex';
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

window.openLabEditor = openLabEditor;
window.deleteLab = deleteLab;
window.toggleLabState = toggleLabState;
