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
                    const isAdmin = userData.username === 'admin' || !!userData.is_superuser;
                    localStorage.setItem('username', userData.username);
                    localStorage.setItem('full_name', userData.full_name || userData.username);
                    localStorage.setItem('user_xp', String(userData.points || 0));
                    localStorage.setItem('is_admin', isAdmin ? 'true' : 'false');
                    if (userData.solved_labs) {
                        try {
                            const solved = JSON.parse(userData.solved_labs);
                            if (Array.isArray(solved)) {
                                localStorage.setItem('solved_challenges', JSON.stringify(solved));
                            }
                        } catch (e) {}
                    } else {
                        localStorage.removeItem('solved_challenges');
                    }
                }

                window.location.href = '/dashboard';

            } else {
                const detail = data.detail || '';

                // Email OTP required
                if (detail.startsWith('MFA_REQUIRED')) {
                    isMfaStep = true;
                    mfaType = 'email';
                    showMfaStep();

                    const mfaLabel = mfaGroup ? mfaGroup.querySelector('label') : null;
                    if (mfaLabel) mfaLabel.textContent = 'Email OTP 2FA Code';
                    if (mfaInput) {
                        mfaInput.placeholder = '6-digit OTP code sent to your Email';
                        mfaInput.value = '';
                        mfaInput.focus();
                    }
                    if (submitBtn) submitBtn.innerHTML = 'Verify OTP Code <i class="fas fa-shield-cat"></i>';

                    showInfoHint('📩 Check your Email inbox and enter the 6-digit OTP code.');

                // Email OTP Code Invalid
                } else if (detail.startsWith('INVALID_MFA_CODE')) {
                    errorDiv.textContent = '❌ Invalid OTP code. Please check your Email and try again.';
                    errorDiv.style.display = 'block';
                    if (mfaInput) { mfaInput.value = ''; mfaInput.focus(); }
                    showInfoHint('📩 Enter the latest 6-digit OTP code sent to your Email.');
                }
 else {
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

    // ── Password Eye Toggle ──
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            togglePassword.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
        });
    }

    const toggleNewPassword = document.getElementById('toggleNewPassword');
    const newPasswordInput = document.getElementById('newPasswordInput');
    if (toggleNewPassword && newPasswordInput) {
        toggleNewPassword.addEventListener('click', () => {
            const isPassword = newPasswordInput.type === 'password';
            newPasswordInput.type = isPassword ? 'text' : 'password';
            toggleNewPassword.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
        });
    }

    // ── Forgot Password Modal Handler ──
    const resetModal = document.getElementById('resetModal');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const closeResetModal = document.getElementById('closeResetModal');
    const sendResetOtpBtn = document.getElementById('sendResetOtpBtn');
    const confirmResetBtn = document.getElementById('confirmResetBtn');
    const resetAccountInput = document.getElementById('resetAccountInput');
    const resetOtpInput = document.getElementById('resetOtpInput');
    const resetStep1 = document.getElementById('resetStep1');
    const resetStep2 = document.getElementById('resetStep2');
    const resetMsg = document.getElementById('resetMsg');

    function showResetMsg(text, type = 'error') {
        if (!resetMsg) return;
        resetMsg.style.display = 'block';
        resetMsg.style.color = type === 'success' ? '#3fb950' : '#f85149';
        resetMsg.textContent = text;
    }

    if (forgotPasswordBtn && resetModal) {
        forgotPasswordBtn.addEventListener('click', () => {
            resetModal.hidden = false;
            if (resetStep1) resetStep1.hidden = false;
            if (resetStep2) resetStep2.hidden = true;
            if (resetMsg) resetMsg.style.display = 'none';
            if (resetAccountInput) resetAccountInput.value = '';
            if (resetOtpInput) resetOtpInput.value = '';
            if (newPasswordInput) newPasswordInput.value = '';
        });
    }

    if (closeResetModal && resetModal) {
        closeResetModal.addEventListener('click', () => {
            resetModal.hidden = true;
        });
    }

    resetModal?.addEventListener('click', (e) => {
        if (e.target === resetModal) resetModal.hidden = true;
    });

    sendResetOtpBtn?.addEventListener('click', async () => {
        const account = resetAccountInput?.value?.trim();
        if (!account) {
            showResetMsg('Please enter your username or email.');
            return;
        }
        sendResetOtpBtn.disabled = true;
        sendResetOtpBtn.innerText = 'Sending...';

        try {
            const res = await fetch('/api/v1/auth/password-reset/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account }),
            });
            const data = await res.json();
            if (res.ok) {
                showResetMsg('📩 OTP verification code sent to Email.', 'success');
                if (resetStep1) resetStep1.hidden = true;
                if (resetStep2) resetStep2.hidden = false;
            } else {
                showResetMsg(data.detail || 'Could not send reset OTP.');
            }
        } catch {
            showResetMsg('Network error. Try again.');
        } finally {
            sendResetOtpBtn.disabled = false;
            sendResetOtpBtn.innerHTML = 'Send Reset OTP <i class="fas fa-paper-plane"></i>';
        }
    });

    confirmResetBtn?.addEventListener('click', async () => {
        const account = resetAccountInput?.value?.trim();
        const code = resetOtpInput?.value?.trim();
        const newPassword = newPasswordInput?.value;

        if (!code || code.length !== 6) {
            showResetMsg('Enter a valid 6-digit OTP code.');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            showResetMsg('Password must be at least 6 characters long.');
            return;
        }

        confirmResetBtn.disabled = true;
        confirmResetBtn.innerText = 'Resetting...';

        try {
            const res = await fetch('/api/v1/auth/password-reset/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account, code, new_password: newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                showResetMsg('✅ Password reset successfully! Closing...', 'success');
                setTimeout(() => {
                    resetModal.hidden = true;
                    if (passwordInput) passwordInput.value = newPassword;
                }, 1500);
            } else {
                showResetMsg(data.detail || 'Failed to reset password.');
            }
        } catch {
            showResetMsg('Network error. Try again.');
        } finally {
            confirmResetBtn.disabled = false;
            confirmResetBtn.innerHTML = 'Confirm Reset <i class="fas fa-check-circle"></i>';
        }
    });
});

