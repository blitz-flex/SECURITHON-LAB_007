/* ═══════════════════════════════════════════════════════════
   SECURITHON LAB — LOGIN MODULE v2.0 (Email OTP + TOTP)
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorDiv = document.getElementById('errorMessage');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const mfaGroup = document.getElementById('mfa-group');
    const mfaInput = document.getElementById('mfa_code');
    const submitBtn = document.getElementById('submitBtn');
    const usernameGroup = document.getElementById('credentials-username-group');
    const passwordGroup = document.getElementById('credentials-password-group');

    if (!loginForm) return;

    if (mfaInput) {
        mfaInput.addEventListener('input', () => {
            if (mfaInput.value.trim().length === 6) {
                loginForm.dispatchEvent(new Event('submit'));
            }
        });
    }

    let isMfaStep = false;
    let mfaType = null; // 'email' | 'totp'

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.style.display = 'none';

        const formData = new FormData();
        formData.append('username', usernameInput.value);
        formData.append('password', passwordInput.value);

        const headers = {};
        if (isMfaStep && mfaInput) {
            headers['X-MFA-Code'] = mfaInput.value.trim();
        }

        try {
            const response = await fetch('/api/v1/auth/login/access-token', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.access_token);

                const userRes = await fetch('/api/v1/users/me', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    localStorage.setItem('username', userData.username);
                    localStorage.setItem('full_name', userData.full_name || userData.username);
                    localStorage.setItem('user_xp', userData.points);
                }

                window.location.href = '/dashboard';

            } else {
                const detail = data.detail || '';

                // TOTP (Authenticator App) required
                if (detail.startsWith('MFA_REQUIRED')) {
                    isMfaStep = true;
                    mfaType = 'totp';
                    showMfaStep();

                    const mfaLabel = mfaGroup ? mfaGroup.querySelector('label') : null;
                    if (mfaLabel) mfaLabel.textContent = 'MFA Authenticator Code';
                    if (mfaInput) {
                        mfaInput.placeholder = '6-digit code from your authenticator app';
                        mfaInput.value = '';
                        mfaInput.focus();
                    }
                    if (submitBtn) submitBtn.innerHTML = 'Verify Code <i class="fas fa-key"></i>';

                    const parts = detail.split(':');
                    const codeHint = parts[1] || '';
                    if (codeHint) {
                        if (mfaInput) {
                            mfaInput.value = codeHint;
                            setTimeout(() => {
                                loginForm.dispatchEvent(new Event('submit'));
                            }, 500);
                        }
                        showCodeHint(codeHint, 'MFA Sandbox Code (Test):');
                    } else {
                        showInfoHint('🔑 Open your authenticator app (e.g. Google Authenticator) and enter the code.');
                    }

                // TOTP Code Invalid
                } else if (detail.startsWith('INVALID_MFA_CODE')) {
                    errorDiv.textContent = '❌ Invalid MFA code. Please try again.';
                    errorDiv.style.display = 'block';
                    if (mfaInput) { mfaInput.value = ''; mfaInput.focus(); }

                    const parts = detail.split(':');
                    const codeHint = parts[1] || '';
                    if (codeHint) {
                        showCodeHint(codeHint, 'MFA Sandbox Code (Test):');
                    }

                } else {
                    errorDiv.textContent = detail || 'Access denied. Check credentials.';
                    errorDiv.style.display = 'block';
                }
            }
        } catch (err) {
            errorDiv.textContent = 'Telemetry link failure. Try again.';
            errorDiv.style.display = 'block';
        }
    });

    function showMfaStep() {
        if (usernameGroup) usernameGroup.style.display = 'none';
        if (passwordGroup) passwordGroup.style.display = 'none';
        if (mfaGroup) mfaGroup.style.display = 'block';
        if (mfaInput) mfaInput.required = true;
        if (usernameInput) usernameInput.required = false;
        if (passwordInput) passwordInput.required = false;
    }

    function resetToCredentials() {
        isMfaStep = false;
        mfaType = null;
        if (usernameGroup) usernameGroup.style.display = '';
        if (passwordGroup) passwordGroup.style.display = '';
        if (mfaGroup) mfaGroup.style.display = 'none';
        if (mfaInput) { mfaInput.required = false; mfaInput.value = ''; }
        if (usernameInput) usernameInput.required = true;
        if (passwordInput) passwordInput.required = true;
        if (submitBtn) submitBtn.innerHTML = 'Initialize Login <i class="fas fa-bolt"></i>';
        removeHint();
    }

    function showCodeHint(code, label) {
        removeHint();
        const hintEl = document.createElement('p');
        hintEl.id = 'mfa-hint';
        hintEl.style.cssText = 'font-size:0.85rem;color:#3fb950;margin-top:8px;text-align:center;';
        hintEl.innerHTML = `${label} <span style="font-weight:bold;cursor:pointer;text-decoration:underline;background:rgba(63,185,80,0.1);padding:2px 8px;border-radius:4px;" onclick="document.getElementById('mfa_code').value='${code}'; document.getElementById('loginForm').dispatchEvent(new Event('submit'));">${code}</span> (Click to fill)`;
        if (mfaGroup) mfaGroup.appendChild(hintEl);
    }

    function showInfoHint(text) {
        removeHint();
        const hintEl = document.createElement('p');
        hintEl.id = 'mfa-hint';
        hintEl.style.cssText = 'font-size:0.85rem;color:#388bfd;margin-top:8px;text-align:center;';
        hintEl.textContent = text;
        if (mfaGroup) mfaGroup.appendChild(hintEl);
    }

    function removeHint() {
        const old = document.getElementById('mfa-hint');
        if (old) old.remove();
    }
});
