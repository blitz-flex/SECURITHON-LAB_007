/* ═══════════════════════════════════════════════════════════
   SECURITHON LAB — LOGIN MODULE v1.0
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorDiv = document.getElementById('errorMessage');

    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.style.display = 'none';

        const formData = new FormData();
        formData.append('username', document.getElementById('username').value);
        formData.append('password', document.getElementById('password').value);

        try {
            const response = await fetch('/api/v1/auth/login/access-token', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.access_token);
                window.location.href = '/dashboard'; 
            } else {
                errorDiv.textContent = data.detail || 'Access denied. Check credentials.';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Telemetry link failure. Try again.';
            errorDiv.style.display = 'block';
        }
    });
});
