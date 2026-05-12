/* ═══════════════════════════════════════════════════════════
   SECURITHON LAB — REGISTER MODULE v1.0
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerBox = document.getElementById('registerBox');
    const successBox = document.getElementById('successBox');
    const errorDiv = document.getElementById('errorMessage');

    if (!registerForm) return;

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.style.display = 'none';

        const payload = {
            full_name: document.getElementById('fullname').value,
            username: document.getElementById('username').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };

        try {
            const response = await fetch('/api/v1/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                registerBox.style.display = 'none';
                successBox.style.display = 'block';
            } else {
                errorDiv.textContent = data.detail || 'Registration failure.';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Telemetry link failure.';
            errorDiv.style.display = 'block';
        }
    });
});
