/* Admin — Curriculum / Lab Management */
import { fetchWithAuth, showToast } from './shared.js';

let allLabs = [];

export async function loadCurriculum() {
    setupFilters();
    const res = await fetchWithAuth('/api/v1/admin/curriculum');
    if (res.ok) {
        allLabs = await res.json();
        renderCurriculumLabs();
    }
}

function renderCurriculumLabs() {
    const container = document.querySelector('.lab-list');
    if (!container) return;

    const searchVal = (document.getElementById('curriculum-search')?.value || '').toLowerCase().trim();
    const selectedCat = document.getElementById('curriculum-filter-category')?.value || 'ALL';
    const selectedStatus = document.getElementById('curriculum-filter-status')?.value || 'ALL';

    const filteredLabs = allLabs.filter(lab => {
        const matchesSearch = !searchVal || 
            (lab.title && lab.title.toLowerCase().includes(searchVal)) ||
            (lab.id && lab.id.toLowerCase().includes(searchVal)) ||
            (lab.cwe && lab.cwe.toLowerCase().includes(searchVal)) ||
            (lab.description && lab.description.toLowerCase().includes(searchVal));

        const matchesCat = selectedCat === 'ALL' || (lab.category === selectedCat);
        const isSuspended = !!lab.disabled;
        const matchesStatus = selectedStatus === 'ALL' ||
            (selectedStatus === 'ACTIVE' && !isSuspended) ||
            (selectedStatus === 'SUSPENDED' && isSuspended);

        return matchesSearch && matchesCat && matchesStatus;
    });

    if (filteredLabs.length === 0) {
        container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: rgba(0,0,0,0.2); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.08); margin-top: 10px;">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; color: var(--text-muted);">
                <i class="fas fa-search-minus" style="font-size: 1.5rem;"></i>
            </div>
            <h4 style="color: #fff; margin: 0 0 6px 0; font-size: 0.95rem;">No matching modules found</h4>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0;">Try adjusting your search criteria or filters.</p>
        </div>`;
        return;
    }

    // Group labs by category
    const categories = {};
    const catMeta = {
        'Web Security':      { icon: 'fa-globe',           color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)' },
        'Infrastructure':    { icon: 'fa-network-wired',   color: '#10b981', glow: 'rgba(16, 185, 129, 0.3)' },
        'Identity & Access': { icon: 'fa-shield-halved',   color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.3)' },
        'Cloud Security':    { icon: 'fa-cloud',          color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)' }
    };

    filteredLabs.forEach(lab => {
        const cat = lab.category || 'Web Security';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(lab);
    });

    let html = '';
    for (const [catName, labs] of Object.entries(categories)) {
        const meta = catMeta[catName] || { icon: 'fa-layer-group', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)' };
        
        html += `
        <div class="category-group-section" style="margin-bottom: 36px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: ${meta.color}15; border: 1px solid ${meta.color}35; display: flex; align-items: center; justify-content: center; color: ${meta.color}; font-size: 1rem; box-shadow: 0 0 12px ${meta.glow};">
                        <i class="fas ${meta.icon}"></i>
                    </div>
                    <div>
                        <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; gap: 10px; font-family: var(--font-data);">
                            ${catName}
                        </h3>
                    </div>
                </div>
                <span class="badge" style="background: rgba(255,255,255,0.04); color: var(--text-muted); border-color: rgba(255,255,255,0.08); font-size: 0.7rem; padding: 4px 10px;">
                    ${labs.length} ${labs.length === 1 ? 'Module' : 'Modules'}
                </span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
                ${labs.map(lab => {
                    const cvss = parseFloat(lab.cvss || 0);
                    const cvssColor = cvss >= 9.0 ? 'var(--danger)' : (cvss >= 7.0 ? 'var(--warning)' : (cvss >= 4.0 ? 'var(--secondary)' : 'var(--primary)'));
                    const cvssBg = cvss >= 9.0 ? 'rgba(239, 68, 68, 0.12)' : (cvss >= 7.0 ? 'rgba(245, 158, 11, 0.12)' : (cvss >= 4.0 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0, 229, 155, 0.12)'));
                    const cvssPercent = Math.min(100, Math.max(0, (cvss / 10) * 100));

                    return `
                    <div class="lab-card glass-panel" style="padding: 22px; display: flex; flex-direction: column; gap: 14px; border-left: 4px solid ${cvssColor} !important; opacity: ${lab.disabled ? '0.6' : '1'}; background: rgba(13, 17, 23, 0.7); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 14px; transition: all 0.25s ease;" onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='rgba(255,255,255,0.12)'" onmouseout="this.style.transform='none'; this.style.borderColor='rgba(255,255,255,0.05)'">
                        
                        <!-- Top Header info -->
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.7rem; color: var(--primary); font-family: var(--font-data); font-weight: 700; letter-spacing: 0.5px; background: rgba(0, 229, 155, 0.08); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 155, 0.15);">
                                ${lab.cwe || lab.id}
                            </span>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span class="badge" style="background: ${cvssBg}; border-color: ${cvssColor}40; color: ${cvssColor}; font-weight: 700;">
                                    CVSS ${cvss.toFixed(1)}
                                </span>
                                <span class="badge" style="background: ${lab.disabled ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)'}; color: ${lab.disabled ? '#ef4444' : '#10b981'}; border-color: ${lab.disabled ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}">
                                    <i class="fas ${lab.disabled ? 'fa-pause-circle' : 'fa-check-circle'}" style="margin-right: 4px;"></i>
                                    ${lab.disabled ? 'SUSPENDED' : 'ACTIVE'}
                                </span>
                            </div>
                        </div>

                        <!-- Content -->
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                            <h4 style="font-size: 1rem; color: #fff; margin: 0; font-weight: 700; line-height: 1.3;">${lab.title}</h4>
                            <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${lab.description || 'No description specified for this lab training module.'}</p>
                        </div>

                        <!-- CVSS Severity Meter -->
                        <div style="margin-top: 2px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-data); margin-bottom: 4px;">
                                <span>SEVERITY THREAT</span>
                                <span style="color: ${cvssColor}">${cvss >= 9 ? 'CRITICAL' : (cvss >= 7 ? 'HIGH' : (cvss >= 4 ? 'MEDIUM' : 'LOW'))}</span>
                            </div>
                            <div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">
                                <div style="width: ${cvssPercent}%; height: 100%; background: ${cvssColor}; border-radius: 2px; box-shadow: 0 0 8px ${cvssColor};"></div>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div style="display: flex; gap: 8px; margin-top: 4px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
                            <button class="btn btn-sm ${lab.disabled ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; font-size: 0.75rem; padding: 7px 12px;" onclick="toggleLabState('${lab.id}',${!!lab.disabled})">
                                <i class="fas ${lab.disabled ? 'fa-play' : 'fa-pause'}"></i> ${lab.disabled ? 'ACTIVATE' : 'SUSPEND'}
                            </button>
                            <button class="btn btn-secondary btn-sm" style="padding: 7px 14px; font-size: 0.75rem;" onclick="openLabEditor('${lab.id}')">
                                <i class="fas fa-edit"></i> EDIT
                            </button>
                            <button class="btn btn-danger btn-sm" style="padding: 7px 12px; font-size: 0.75rem;" onclick="deleteLab('${lab.id}')" title="Delete Lab">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

// Bind search and filter events
function setupFilters() {
    const searchInput = document.getElementById('curriculum-search');
    const catSelect = document.getElementById('curriculum-filter-category');
    const statusSelect = document.getElementById('curriculum-filter-status');

    if (searchInput) searchInput.oninput = () => renderCurriculumLabs();
    if (catSelect) catSelect.onchange = () => renderCurriculumLabs();
    if (statusSelect) statusSelect.onchange = () => renderCurriculumLabs();
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
