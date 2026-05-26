/* Admin — Shared Utilities */

export async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (token) {
        options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    }
    return fetch(url, options);
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'glass-panel';
    toast.style.cssText = `padding:12px 20px;font-family:var(--font-mono);font-size:0.8rem;margin-bottom:10px;border-left:4px solid ${type === 'success' ? '#3fb950' : '#f85149'};`;
    toast.innerHTML = `<span style="color:${type === 'success' ? '#3fb950' : '#f85149'}">[${type.toUpperCase()}]</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
