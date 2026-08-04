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

        const fullName = document.getElementById('fullname').value.trim();
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        if (!username) {
            errorDiv.textContent = 'Operator ID (Username) is required.';
            errorDiv.style.display = 'block';
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            errorDiv.textContent = 'Operator ID cannot contain spaces or special characters (letters, numbers, _ and - only).';
            errorDiv.style.display = 'block';
            return;
        }
        if (username.length < 3 || username.length > 30) {
            errorDiv.textContent = 'Operator ID must be between 3 and 30 characters long.';
            errorDiv.style.display = 'block';
            return;
        }
        if (!email || email.includes(' ')) {
            errorDiv.textContent = 'A valid email address without spaces is required.';
            errorDiv.style.display = 'block';
            return;
        }
        if (!password || password.trim().length < 6) {
            errorDiv.textContent = 'Security Key (Password) must be at least 6 characters long and cannot consist purely of whitespace.';
            errorDiv.style.display = 'block';
            return;
        }

        const payload = {
            full_name: fullName,
            username: username,
            email: email,
            password: password
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
