/**
 * Settings Page Entry Point
 */
import { $ } from '../utils/dom.js';

const sections = {
    'profile': { title: 'Public Profile', desc: 'Manage how you appear in the Securithon ecosystem.' },
    'security': { title: 'Security & Access', desc: 'Strengthen your operational security posture.' },
    'editor': { title: 'Code Editor', desc: 'Configure your IDE preferences and themes.' },
    'terminal': { title: 'Terminal UI', desc: 'Customize your command-line interface experience.' },
    'developer': { title: 'Developer API', desc: 'Manage programmatic access to your lab resources.' }
};

export function switchTab(tabId, element) {
    // Toggle Nav
    document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    // Toggle Section
    document.querySelectorAll('.settings-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    // Update Header
    const titleEl = $('#current-section-title');
    const descEl = $('#current-section-desc');
    if (titleEl) titleEl.innerText = sections[tabId].title;
    if (descEl) descEl.innerText = sections[tabId].desc;

    // Reset Scroll
    const mainEl = $('.settings-main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
}

export async function saveSettings(event) {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = 'SAVING...';
    btn.disabled = true;
    
    // Gather all settings
    const settings = {
        displayName: $('#display-name-input')?.value || '',
        specialization: $('#specialization-input')?.value || 'Red Team / Pentesting',
        bio: $('#bio-input')?.value || '',
        editorTheme: $('#editor-theme-select')?.value || 'default',
        editorFont: $('#editor-font-select')?.value || 'jetbrains',
        terminalTyping: $('#terminal-typing-select')?.value || 'standard',
        terminalCursorStyle: $('#terminal-cursor-style')?.value || 'underline',
        terminalCursorBlink: $('#terminal-cursor-blink')?.value || 'true',
        terminalFontSize: parseInt($('#terminal-font-size')?.value) || 13
    };
    
    // Password logic
    const pass1 = $('#new-password-input');
    const pass2 = $('#verify-password-input');
    if (pass1 && pass2 && (pass1.value || pass2.value)) {
        if (pass1.value !== pass2.value) {
            btn.innerText = 'PASSWORDS MISMATCH';
            btn.style.background = 'var(--error)';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.background = 'var(--primary-app)';
                btn.disabled = false;
            }, 2000);
            return;
        }
    }
    
    // Save locally
    const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
    const updatedSettings = { ...saved, ...settings };
    localStorage.setItem('seclab_settings', JSON.stringify(updatedSettings));
    
    // Backend API Sync
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = {
                full_name: settings.displayName
            };
            if (pass1 && pass1.value) {
                payload.password = pass1.value;
            }
            const res = await fetch('/api/v1/users/me', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('full_name', data.full_name || data.username);
                // Dispatch event so base layout updates the UI immediately
                document.dispatchEvent(new CustomEvent('userLoaded', { detail: data }));
            }
        } catch (e) {
            console.error("Failed to sync settings with backend:", e);
        }
    }

    // Update topbar initials immediately
    const userMenuBtn = document.getElementById('userMenuBtn');
    const isSuper = localStorage.getItem('is_admin') === 'true';
    if (userMenuBtn && settings.displayName && !isSuper) {
        userMenuBtn.innerText = settings.displayName.substring(0, 2).toUpperCase();
    }
    
    // Update local profile name
    const profileName = document.getElementById('user-fullname');
    if (profileName && settings.displayName) {
        profileName.innerText = settings.displayName;
    }
    
    setTimeout(() => {
        if (pass1) pass1.value = '';
        if (pass2) pass2.value = '';
        btn.innerText = 'CHANGES APPLIED';
        btn.style.background = '#3fb950';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = 'var(--primary-app)';
            btn.disabled = false;
        }, 2000);
    }, 600);
}

export function discardChanges(event) {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = 'DISCARDING...';
    btn.disabled = true;

    const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
    const defaultName = localStorage.getItem('full_name') || localStorage.getItem('username') || '';

    // Reset input fields
    const dInput = $('#display-name-input');
    if (dInput) dInput.value = saved.displayName || defaultName;

    const pName = $('#user-fullname');
    if (pName) pName.innerText = saved.displayName || defaultName;

    const specVal = $('#spec-value');
    const specInput = $('#specialization-input');
    const savedSpec = saved.specialization || 'Red Team / Pentesting';
    if (specVal && specInput) {
        specVal.innerText = savedSpec;
        specInput.value = savedSpec;
        document.querySelectorAll('.custom-option').forEach(opt => {
            opt.classList.remove('selected');
            if (opt.getAttribute('data-value') === savedSpec) {
                opt.classList.add('selected');
            }
        });
    }

    const bInput = $('#bio-input');
    if (bInput) bInput.value = saved.bio || '';

    const pass1 = $('#new-password-input');
    if (pass1) pass1.value = '';
    const pass2 = $('#verify-password-input');
    if (pass2) pass2.value = '';

    const tSel = $('#editor-theme-select');
    if (tSel) tSel.value = saved.editorTheme || 'default';

    const fontSel = $('#editor-font-select');
    if (fontSel) fontSel.value = saved.editorFont || 'jetbrains';

    const typeSel = $('#terminal-typing-select');
    if (typeSel) typeSel.value = saved.terminalTyping || 'standard';

    const cs = $('#terminal-cursor-style');
    if (cs) cs.value = saved.terminalCursorStyle || 'underline';

    const cb = $('#terminal-cursor-blink');
    if (cb) cb.value = saved.terminalCursorBlink || 'true';

    const fs = $('#terminal-font-size');
    if (fs) fs.value = (saved.terminalFontSize || 13).toString();

    setTimeout(() => {
        btn.innerText = 'DISCARDED';
        btn.style.background = 'var(--border-dim)';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = 'transparent';
            btn.disabled = false;
        }, 1500);
    }, 500);
}

let isMfaEnabled = false;

export function updateMfaUI(enabled) {
    isMfaEnabled = !!enabled;
    const desc = document.getElementById('mfa-status-desc');
    const btn = document.getElementById('mfa-toggle-btn');
    if (enabled) {
        if (desc) {
            desc.innerHTML = `Status: <span style="color: #3fb950; font-weight: bold;"><i class="fas fa-check-circle"></i> AUTHENTICATOR MFA ACTIVE</span><br><span style="font-size:0.8rem;">You will be prompted for an Authenticator app code on login.</span>`;
        }
        if (btn) {
            btn.innerText = 'Disable Authenticator MFA';
            btn.style.background = 'var(--error)';
            btn.style.border = 'none';
            btn.style.color = '#fff';
            btn.style.cursor = 'pointer';
        }
    } else {
        if (desc) {
            desc.innerText = 'Secure your account with an Authenticator App (Google Authenticator) QR code.';
        }
        if (btn) {
            btn.innerText = 'Enable Authenticator MFA';
            btn.style.background = 'var(--accent)';
            btn.style.border = 'none';
            btn.style.color = '#fff';
            btn.style.cursor = 'pointer';
        }
    }
}

export function openMfaSetup() {
    const modal = document.getElementById('mfa-setup-modal');
    const qrImg = document.getElementById('mfa-qr-code');
    const secretKey = document.getElementById('mfa-secret-key');
    const token = localStorage.getItem('token');

    if (!modal || !token) return;

    fetch('/api/v1/users/me/mfa-setup', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        if (data.secret && data.otpauth_url) {
            if (secretKey) secretKey.textContent = data.secret;
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data.otpauth_url)}`;
            modal.classList.add('show');
            
            // Focus on first input when modal opens
            const firstInput = document.querySelector('.mfa-code-input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    })
    .catch(err => console.error("Error setting up MFA:", err));
}

export function closeMfaModal() {
    const modal = document.getElementById('mfa-setup-modal');
    if (modal) {
        modal.classList.remove('show');
        document.querySelectorAll('.mfa-code-input').forEach(input => input.value = '');
    }
}

export async function verifyMfaCode() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const inputs = document.querySelectorAll('.mfa-code-input');
    const code = Array.from(inputs).map(input => input.value).join('').trim();

    if (code.length !== 6) {
        return;
    }

    try {
        const res = await fetch('/api/v1/users/me/mfa-verify', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code: code })
        });

        if (res.ok) {
            const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
            saved.twoFactorEnabled = true;
            localStorage.setItem('seclab_settings', JSON.stringify(saved));
            updateMfaUI(true);
            closeMfaModal();
        } else {
            const data = await res.json();
            alert("Verification failed: " + (data.detail || "Invalid code"));
            inputs.forEach(input => input.value = '');
            if (inputs[0]) inputs[0].focus();
        }
    } catch (e) {
        console.error("Error verifying MFA:", e);
    }
}

export async function disableMfa() {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!confirm("Are you sure you want to disable Multi-Factor Authentication?")) return;

    try {
        const res = await fetch('/api/v1/users/me/mfa-email', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled: false })
        });

        if (res.ok) {
            const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
            saved.twoFactorEnabled = false;
            localStorage.setItem('seclab_settings', JSON.stringify(saved));
            updateMfaUI(false);
        }
    } catch (e) {
        console.error("Error disabling MFA:", e);
    }
}

export function toggleMfa() {
    if (isMfaEnabled) {
        disableMfa();
    } else {
        openMfaSetup();
    }
}

export function revokeDeveloperKey() {
    const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
    saved.apiKeyRevoked = true;
    localStorage.setItem('seclab_settings', JSON.stringify(saved));
    updateDeveloperKeyUI(true);
}

function updateDeveloperKeyUI(revoked) {
    const btn = document.getElementById('revoke-key-btn');
    const code = document.getElementById('api-token-code');
    if (revoked) {
        if (btn) {
            btn.innerText = 'REVOKED';
            btn.disabled = true;
            btn.style.opacity = '0.4';
            btn.style.background = 'var(--border-dim)';
            btn.style.cursor = 'default';
            btn.style.transform = 'none';
            btn.style.boxShadow = 'none';
        }
        if (code) {
            code.style.textDecoration = 'line-through';
            code.style.color = 'var(--text-muted)';
            code.style.opacity = '0.6';
        }
    } else {
        if (btn) {
            btn.innerText = 'Revoke Key';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.background = 'var(--error)';
            btn.style.cursor = 'pointer';
            btn.style.transform = '';
            btn.style.boxShadow = '';
        }
        if (code) {
            code.style.textDecoration = 'none';
            code.style.color = 'var(--primary)';
            code.style.opacity = '1';
        }
    }
}



document.addEventListener('DOMContentLoaded', () => {
    // Load Settings
    const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');

    // Sync User Data
    const sync = (user) => {
        const input = $('#display-name-input');
        if (input && !saved.displayName) input.value = user.full_name || user.username;
        const profileName = $('#user-fullname');
        if (profileName && !saved.displayName) profileName.innerText = user.full_name || user.username;
        
        // Metrics Update
        const xpEl = $('#profile-xp');
        if (xpEl) xpEl.innerText = (user.points || 0).toLocaleString();
        
        const rankEl = $('#profile-rank');
        if (rankEl) {
            const lvl = Math.floor((user.points || 0) / 1000) + 1;
            const rankMap = {1:'Recruit', 2:'Rookie', 3:'Scout', 4:'Analyst', 5:'Specialist', 6:'Expert', 7:'Senior', 8:'Principal', 9:'Elite', 10:'Master'};
            rankEl.innerText = (rankMap[Math.min(lvl, 10)] || 'Recruit').toUpperCase();
        }

        // Sync MFA UI state with user database record
        if (user.hasOwnProperty('is_mfa_enabled')) {
            const mfaEnabled = !!user.is_mfa_enabled;
            const currentSettings = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
            if (currentSettings.twoFactorEnabled !== mfaEnabled) {
                currentSettings.twoFactorEnabled = mfaEnabled;
                localStorage.setItem('seclab_settings', JSON.stringify(currentSettings));
            }
            updateMfaUI(mfaEnabled);
        }
    };

    if (window.currentUser) sync(window.currentUser);
    document.addEventListener('userLoaded', (e) => sync(e.detail));

    // Populate form with saved settings
    if (saved.displayName) {
        const dInput = $('#display-name-input');
        if (dInput) dInput.value = saved.displayName;
        const pName = $('#user-fullname');
        if (pName) pName.innerText = saved.displayName;
    }
    if (saved.bio) {
        const bInput = $('#bio-input');
        if (bInput) bInput.value = saved.bio;
    }
    if (saved.editorTheme) {
        const tSel = $('#editor-theme-select');
        if (tSel) tSel.value = saved.editorTheme;
    }
    if (saved.editorFont) {
        const fontSel = $('#editor-font-select');
        if (fontSel) fontSel.value = saved.editorFont;
    }
    if (saved.terminalTyping) {
        const typeSel = $('#terminal-typing-select');
        if (typeSel) typeSel.value = saved.terminalTyping;
    }
    if (saved.terminalCursorStyle) {
        const cs = $('#terminal-cursor-style');
        if (cs) cs.value = saved.terminalCursorStyle;
    }
    if (saved.terminalCursorBlink) {
        const cb = $('#terminal-cursor-blink');
        if (cb) cb.value = saved.terminalCursorBlink;
    }
    if (saved.terminalFontSize) {
        const fs = $('#terminal-font-size');
        if (fs) fs.value = saved.terminalFontSize.toString();
    }

    // Custom Dropdown Logic
    const specTrigger = $('#spec-trigger');
    const specOptions = $('#spec-options');
    const specValue = $('#spec-value');
    const specInput = $('#specialization-input');

    if (saved.specialization && specValue && specInput) {
        specValue.innerText = saved.specialization;
        specInput.value = saved.specialization;
        document.querySelectorAll('.custom-option').forEach(opt => {
            opt.classList.remove('selected');
            if (opt.getAttribute('data-value') === saved.specialization) {
                opt.classList.add('selected');
            }
        });
    }

    if (specTrigger) {
        specTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            specOptions.classList.toggle('show');
            specTrigger.classList.toggle('open');
        });

        document.querySelectorAll('.custom-option').forEach(option => {
            option.addEventListener('click', function() {
                const val = this.getAttribute('data-value');
                specValue.innerText = val;
                specInput.value = val;
                
                document.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                
                specOptions.classList.remove('show');
                specTrigger.classList.remove('open');
            });
        });

        document.addEventListener('click', () => {
            if (specOptions) specOptions.classList.remove('show');
            if (specTrigger) specTrigger.classList.remove('open');
        });
    }

    // Sync persistent states for 2FA and API Key
    updateMfaUI(!!saved.twoFactorEnabled);
    updateDeveloperKeyUI(!!saved.apiKeyRevoked);

    // MFA inputs interaction logic
    const mfaInputs = document.querySelectorAll('.mfa-code-input');
    mfaInputs.forEach((input, index) => {
        // Handle input event (when user types or pastes)
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            // Only allow digits
            if (value && !/^\d$/.test(value)) {
                e.target.value = '';
                return;
            }
            if (value) {
                // Focus next input if available
                if (index < mfaInputs.length - 1) {
                    mfaInputs[index + 1].focus();
                } else {
                    // Check if all fields are filled, and if so, verify code
                    const fullCode = Array.from(mfaInputs).map(inp => inp.value).join('');
                    if (fullCode.length === 6) {
                        verifyMfaCode();
                    }
                }
            }
        });

        // Handle keydown for backspace and arrow navigation
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (!input.value && index > 0) {
                    mfaInputs[index - 1].value = '';
                    mfaInputs[index - 1].focus();
                } else {
                    input.value = '';
                }
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' && index > 0) {
                mfaInputs[index - 1].focus();
            } else if (e.key === 'ArrowRight' && index < mfaInputs.length - 1) {
                mfaInputs[index + 1].focus();
            }
        });

        // Handle paste event
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
            if (/^\d{6}$/.test(pasteData)) {
                mfaInputs.forEach((inp, idx) => {
                    inp.value = pasteData[idx];
                });
                verifyMfaCode();
            }
        });
    });

    // Expose functions to global scope for onclick handlers in HTML
    window.switchTab = switchTab;
    window.saveSettings = saveSettings;
    window.discardChanges = discardChanges;
    window.toggleMfa = toggleMfa;
    window.closeMfaModal = closeMfaModal;
    window.verifyMfaCode = verifyMfaCode;
    window.revokeDeveloperKey = revokeDeveloperKey;
});
