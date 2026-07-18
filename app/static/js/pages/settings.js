/**
 * Settings Page Entry Point
 */
import { $ } from '../utils/dom.js';

const sections = {
    'profile': { title: 'Public Profile', desc: 'Manage how you appear in the Securithon ecosystem.' },
    'security': { title: 'Security & Access', desc: 'Password and multi-factor authentication.' },
    'editor': { title: 'Code Editor', desc: 'Arena editor theme and typography.' },
    'terminal': { title: 'Terminal UI', desc: 'Terminal display and cursor preferences.' }
};
const tabRoutes = {
    profile: '/settings/profile',
    security: '/settings/security',
    editor: '/settings/editor',
    terminal: '/settings/terminal',
};
const routeTabs = Object.fromEntries(Object.entries(tabRoutes).map(([tab, route]) => [route, tab]));

let openCustomSelect = null;
let settingsBaseline = null;
let suppressDirtyCheck = false;

const RANK_MAP = {
    1: 'Recruit', 2: 'Rookie', 3: 'Scout', 4: 'Analyst', 5: 'Specialist',
    6: 'Expert', 7: 'Senior', 8: 'Principal', 9: 'Elite', 10: 'Master',
};

function collectFormState() {
    return {
        displayName: $('#display-name-input')?.value?.trim() || '',
        specialization: $('#specialization-input')?.value || 'Red Team / Pentesting',
        editorTheme: $('#editor-theme-select')?.value || 'default',
        editorFont: $('#editor-font-select')?.value || 'jetbrains',
        terminalTyping: $('#terminal-typing-select')?.value || 'standard',
        terminalCursorStyle: $('#terminal-cursor-style')?.value || 'underline',
        terminalCursorBlink: $('#terminal-cursor-blink')?.value || 'true',
        terminalFontSize: String(parseInt($('#terminal-font-size')?.value, 10) || 13),
        newPassword: $('#new-password-input')?.value || '',
        verifyPassword: $('#verify-password-input')?.value || '',
    };
}

function captureSettingsBaseline() {
    settingsBaseline = collectFormState();
    updateDirtyState();
}

function updateDirtyState() {
    const bar = document.getElementById('settings-action-bar');
    if (!bar || suppressDirtyCheck || !settingsBaseline) return;
    const dirty = JSON.stringify(collectFormState()) !== JSON.stringify(settingsBaseline);
    bar.classList.toggle('is-visible', dirty);
    bar.setAttribute('aria-hidden', dirty ? 'false' : 'true');
    if (openCustomSelect?.trigger && openCustomSelect?.options) {
        positionCustomSelect(openCustomSelect.trigger, openCustomSelect.options);
    }
}

function markSettingsDirty() {
    if (!suppressDirtyCheck) updateDirtyState();
}

function runWithoutDirtyTracking(fn) {
    suppressDirtyCheck = true;
    try {
        fn();
    } finally {
        suppressDirtyCheck = false;
        captureSettingsBaseline();
    }
}

function updateProgressPanel(points) {
    const pts = Math.max(0, Number(points) || 0);
    const lvl = Math.floor(pts / 1000) + 1;
    const rank = (RANK_MAP[Math.min(lvl, 10)] || 'Recruit').toUpperCase();
    const xpIntoLevel = pts % 1000;
    const pct = xpIntoLevel / 10;
    const toNext = 1000 - xpIntoLevel;

    const rankEl = $('#profile-rank');
    if (rankEl) rankEl.textContent = rank;
    const xpEl = $('#profile-xp');
    if (xpEl) xpEl.textContent = pts.toLocaleString();
    const fillEl = document.getElementById('xp-bar-fill');
    if (fillEl) fillEl.style.width = pct + '%';

    const intoEl = $('#profile-xp-into');
    if (intoEl) intoEl.textContent = `${xpIntoLevel.toLocaleString()} / 1,000 XP`;
    const nextEl = $('#profile-xp-next');
    if (nextEl) {
        nextEl.textContent = toNext > 0
            ? `${toNext.toLocaleString()} XP to next rank`
            : 'Rank tier cap reached';
    }
}

function initSettingsDirtyTracking() {
    ['#display-name-input', '#new-password-input', '#verify-password-input'].forEach((sel) => {
        const el = document.querySelector(sel);
        el?.addEventListener('input', markSettingsDirty);
        el?.addEventListener('change', markSettingsDirty);
    });
}

const PASSWORD_RULES = {
    length: (v) => v.length >= 8,
    letter: (v) => /[a-zA-Z]/.test(v),
    digit: (v) => /\d/.test(v),
};

function evaluatePassword(password) {
    const checks = {
        length: PASSWORD_RULES.length(password),
        letter: PASSWORD_RULES.letter(password),
        digit: PASSWORD_RULES.digit(password),
    };
    const met = Object.values(checks).filter(Boolean).length;
    let level = 'weak';
    if (met === 3 && password.length >= 12) level = 'strong';
    else if (met === 3) level = 'good';
    else if (met >= 2) level = 'fair';

    return { checks, met, level, valid: met === 3 };
}

function updatePasswordStrengthUI() {
    const pass1 = $('#new-password-input');
    const pass2 = $('#verify-password-input');
    const wrap = $('#password-strength-wrap');
    const fill = $('#password-strength-fill');
    const hint = $('#password-match-hint');
    const requirements = document.querySelectorAll('#password-requirements li');

    if (!pass1) return;

    const value = pass1.value;
    const hasInput = value.length > 0;

    if (wrap) wrap.hidden = !hasInput;
    if (hasInput && fill) {
        const { level, met } = evaluatePassword(value);
        fill.dataset.level = level;
        fill.style.width = `${(met / 3) * 100}%`;
    }

    requirements.forEach((li) => {
        const rule = li.getAttribute('data-rule');
        if (rule && PASSWORD_RULES[rule]) {
            li.classList.toggle('met', PASSWORD_RULES[rule](value));
        }
    });

    if (hint) {
        if (!hasInput && !pass2?.value) {
            hint.textContent = '';
            hint.className = 'form-hint';
        } else if (!pass2?.value) {
            hint.textContent = 'Re-enter your new password below.';
            hint.className = 'form-hint';
        } else if (value === pass2.value) {
            hint.textContent = 'Passwords match.';
            hint.className = 'form-hint is-match';
        } else {
            hint.textContent = 'Passwords do not match.';
            hint.className = 'form-hint is-mismatch';
        }
    }

    pass1.classList.toggle('is-invalid', hasInput && !evaluatePassword(value).valid);
    if (pass2) {
        const confirmInvalid = pass2.value.length > 0 && value !== pass2.value;
        pass2.classList.toggle('is-invalid', confirmInvalid);
    }
}

function showPasswordFormError(message) {
    const el = $('#password-form-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
}

function clearPasswordFormError() {
    showPasswordFormError('');
}

function validatePasswordForm() {
    const curr = $('#current-password-input');
    const pass1 = $('#new-password-input');
    const pass2 = $('#verify-password-input');
    if (!pass1 || !pass2) return { ok: true };

    const c = curr?.value || '';
    const a = pass1.value;
    const b = pass2.value;

    // Check if security section is active
    const activeSection = document.querySelector('.settings-section.active');
    const isSecuritySection = activeSection && activeSection.id === 'security';

    if (isSecuritySection) {
        if (!c) {
            return { ok: false, message: 'Current password is required.' };
        }
        if (!a && !b) {
            return { ok: false, message: 'Password fields are required on this tab.' };
        }
    } else {
        if (!c && !a && !b) return { ok: true };
    }

    if ((a && !b) || (!a && b)) {
        return { ok: false, message: 'Enter and confirm your new password.' };
    }
    if (a !== b) {
        return { ok: false, message: 'Passwords do not match.' };
    }
    if (!evaluatePassword(a).valid) {
        return { ok: false, message: 'Password must be at least 8 characters and include a letter and a number.' };
    }
    return { ok: true };
}

function resetPasswordFields() {
    const curr = $('#current-password-input');
    const pass1 = $('#new-password-input');
    const pass2 = $('#verify-password-input');
    if (curr) curr.value = '';
    if (pass1) pass1.value = '';
    if (pass2) pass2.value = '';
    clearPasswordFormError();
    updatePasswordStrengthUI();
}

function bindPasswordVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(buttonId);
    if (!input || !btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        const icon = btn.querySelector('i');
        if (icon) icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
}

let mfaFocusRestore = null;
let mfaSetupInProgress = false;

function getMfaCodeValue() {
    return (document.getElementById('mfa-code-input')?.value || '').replace(/\D/g, '').slice(0, 6);
}

function tryAutoVerifyMfaCode() {
    if (getMfaCodeValue().length === 6) verifyMfaCode();
}

function trapMfaFocus() {
    const modal = document.getElementById('mfa-setup-modal');
    const panel = modal?.querySelector('.mfa-modal-panel');
    if (!modal || !panel) return;

    mfaFocusRestore = document.activeElement;
    const focusable = panel.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();

    modal._mfaFocusTrap = (e) => {
        if (e.key !== 'Tab' || !modal.classList.contains('show')) return;
        const items = [...panel.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), summary'
        )];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    modal.addEventListener('keydown', modal._mfaFocusTrap);
}

function releaseMfaFocus() {
    const modal = document.getElementById('mfa-setup-modal');
    if (modal?._mfaFocusTrap) {
        modal.removeEventListener('keydown', modal._mfaFocusTrap);
        delete modal._mfaFocusTrap;
    }
    if (mfaFocusRestore?.focus) {
        try { mfaFocusRestore.focus(); } catch { /* ignore */ }
    }
    mfaFocusRestore = null;
}

function setMfaModalOpen(isOpen) {
    mountMfaModalPortal();
    const modal = document.getElementById('mfa-setup-modal');
    if (!modal) return;
    modal.classList.toggle('show', isOpen);
    modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body.classList.toggle('settings-modal-open', isOpen);
    if (isOpen) trapMfaFocus();
    else releaseMfaFocus();
}

function showMfaModalError(message) {
    const el = document.getElementById('mfa-modal-error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
}

function parseApiDetail(data, fallback = 'Request failed') {
    if (!data?.detail) return fallback;
    const d = data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => x.msg || String(x)).join(', ');
    return fallback;
}

function authHeaders() {
    const token = localStorage.getItem('token');
    return token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
}

async function refreshMfaStatusFromServer() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/v1/users/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const user = await res.json();
        const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
        saved.twoFactorEnabled = !!user.is_mfa_enabled;
        localStorage.setItem('seclab_settings', JSON.stringify(saved));
        updateMfaUI(!!user.is_mfa_enabled);
        document.dispatchEvent(new CustomEvent('userLoaded', { detail: user }));
    } catch (e) {
        console.error('Failed to refresh MFA status:', e);
    }
}

function setMfaToggleLoading(loading) {
    const btn = document.getElementById('mfa-toggle-btn');
    if (!btn) return;
    btn.disabled = !!loading;
    if (loading) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
}

function initSecurityPage() {
    const curr = $('#current-password-input');
    const pass1 = $('#new-password-input');
    const pass2 = $('#verify-password-input');
    curr?.addEventListener('input', () => {
        clearPasswordFormError();
        markSettingsDirty();
    });
    pass1?.addEventListener('input', () => {
        clearPasswordFormError();
        updatePasswordStrengthUI();
        markSettingsDirty();
    });
    pass2?.addEventListener('input', () => {
        clearPasswordFormError();
        updatePasswordStrengthUI();
        markSettingsDirty();
    });

    bindPasswordVisibility('current-password-input', 'toggle-current-password');
    bindPasswordVisibility('new-password-input', 'toggle-new-password');
    bindPasswordVisibility('verify-password-input', 'toggle-verify-password');

    initMfaFlow();
}

function mountMfaModalPortal() {
    const modal = document.getElementById('mfa-setup-modal');
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
}

function setMfaSetupPhase(phase) {
    const loading = document.getElementById('mfa-setup-loading');
    const body = document.getElementById('mfa-setup-body');
    const success = document.getElementById('mfa-setup-success');
    const header = document.querySelector('#mfa-setup-modal .mfa-modal-header');

    if (loading) loading.hidden = phase !== 'loading';
    if (body) body.hidden = phase !== 'ready';
    if (success) success.hidden = phase !== 'success';
    if (header) header.hidden = phase === 'success';

    mfaSetupInProgress = phase === 'ready';
}

function initMfaFlow() {
    if (document.body.dataset.mfaBound === '1') return;
    document.body.dataset.mfaBound = '1';

    mountMfaModalPortal();

    document.getElementById('mfa-toggle-btn')?.addEventListener('click', toggleMfa);
    document.getElementById('mfa-modal-close')?.addEventListener('click', () => closeMfaModal());

    const modal = document.getElementById('mfa-setup-modal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeMfaModal();
    });
    modal?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMfaModal();
    });

    document.getElementById('mfa-copy-secret')?.addEventListener('click', async () => {
        const secret = document.getElementById('mfa-secret-key')?.textContent?.trim();
        if (!secret) return;
        try {
            await navigator.clipboard.writeText(secret);
            const btn = document.getElementById('mfa-copy-secret');
            if (btn) {
                const prev = btn.textContent;
                btn.textContent = 'Copied';
                setTimeout(() => { btn.textContent = prev; }, 2000);
            }
        } catch {
            showMfaModalError('Could not copy. Select the key and copy manually.');
        }
    });

    const codeInput = document.getElementById('mfa-code-input');
    codeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        showMfaModalError('');
        tryAutoVerifyMfaCode();
    });
    codeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && getMfaCodeValue().length === 6) {
            e.preventDefault();
            verifyMfaCode();
        }
    });
    codeInput?.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        e.target.value = pasted;
        showMfaModalError('');
        tryAutoVerifyMfaCode();
    });
}

function setCustomSelectValue(wrapper, value) {
    if (!wrapper || value == null || value === '') return;

    const hidden = wrapper.querySelector('input[type="hidden"]');
    const display = wrapper.querySelector('.custom-select-value');
    if (!hidden) return;

    const esc = (v) => (window.CSS?.escape ? CSS.escape(v) : v);
    const match = wrapper.querySelector(`.custom-option[data-value="${esc(value)}"]`);

    hidden.value = value;
    if (display) display.textContent = match?.textContent?.trim() || value;
    wrapper.querySelectorAll('.custom-option').forEach(opt => {
        opt.classList.toggle('selected', opt.getAttribute('data-value') === value);
    });
}

function setCustomSelectByHiddenId(hiddenId, value) {
    const hidden = document.getElementById(hiddenId);
    const wrapper = hidden?.closest('.custom-select-wrapper');
    if (wrapper) setCustomSelectValue(wrapper, value);
}

function setSpecialization(value) {
    setCustomSelectValue($('#specialization-wrapper'), value);
}

function actionBarVisibleInset() {
    const bar = document.getElementById('settings-action-bar');
    if (!bar?.classList.contains('is-visible')) return 0;
    const rect = bar.getBoundingClientRect();
    return rect.height > 0 ? rect.height + 12 : 0;
}

function positionCustomSelect(trigger, options) {
    if (!trigger || !options) return;

    options.classList.remove('open-up');
    const menuHeight = options.scrollHeight || 240;
    const rect = trigger.getBoundingClientRect();
    const scrollRoot = $('.settings-scroll') || document.documentElement;
    const scrollRect = scrollRoot.getBoundingClientRect();
    const bottomLimit = scrollRect.bottom - actionBarVisibleInset();
    const spaceBelow = bottomLimit - rect.bottom;
    const spaceAbove = rect.top - scrollRect.top;

    if (spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow) {
        options.classList.add('open-up');
    }
}

function closeCustomSelect(trigger, options, wrapper) {
    options?.classList.remove('show', 'open-up');
    trigger?.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
    wrapper?.classList.remove('is-open');
    if (openCustomSelect?.wrapper === wrapper) openCustomSelect = null;
}

function closeAllCustomSelects() {
    document.querySelectorAll('.custom-select-wrapper.is-open').forEach(wrapper => {
        closeCustomSelect(
            wrapper.querySelector('.custom-select-trigger'),
            wrapper.querySelector('.custom-options'),
            wrapper
        );
    });
}

function initCustomSelects() {
    document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        if (wrapper.dataset.bound === '1') return;
        wrapper.dataset.bound = '1';

        const trigger = wrapper.querySelector('.custom-select-trigger');
        const options = wrapper.querySelector('.custom-options');
        if (!trigger || !options) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !options.classList.contains('show');
            closeAllCustomSelects();
            if (willOpen) {
                options.classList.add('show');
                trigger.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                wrapper.classList.add('is-open');
                positionCustomSelect(trigger, options);
                openCustomSelect = { trigger, options, wrapper };
            }
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger.click();
            } else if (e.key === 'Escape') {
                closeCustomSelect(trigger, options, wrapper);
            }
        });

        options.querySelectorAll('.custom-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                setCustomSelectValue(wrapper, option.getAttribute('data-value'));
                closeCustomSelect(trigger, options, wrapper);
                markSettingsDirty();
            });
        });
    });

    if (document.body.dataset.customSelectGlobal === '1') return;
    document.body.dataset.customSelectGlobal = '1';

    document.addEventListener('click', closeAllCustomSelects);

    const scrollEl = $('.settings-scroll');
    const repositionOpen = () => {
        if (openCustomSelect?.options?.classList.contains('show')) {
            positionCustomSelect(openCustomSelect.trigger, openCustomSelect.options);
        }
    };
    scrollEl?.addEventListener('scroll', repositionOpen, { passive: true });
    window.addEventListener('resize', repositionOpen, { passive: true });
}

export function switchTab(tabId, element, options = {}) {
    if (!sections[tabId]) return;
    // Toggle Nav
    document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    // Toggle Section
    document.querySelectorAll('.settings-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    // Update Header
    const titleEl = $('#current-section-title');
    const descEl = $('#current-section-desc');
    if (titleEl) titleEl.innerText = sections[tabId].title;
    if (descEl) descEl.innerText = sections[tabId].desc;

    // Update Mobile Dropdown Label
    const mobileLabel = document.getElementById('mobileActiveTabLabel');
    if (mobileLabel && element) {
        mobileLabel.innerHTML = element.innerHTML;
    }
    const sidebar = document.querySelector('.settings-sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
    }

    // Reset Scroll
    const scrollEl = $('.settings-scroll');
    if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: 'smooth' });

    if (!options.skipHistory) {
        const route = tabRoutes[tabId];
        if (route) window.history.pushState({ tab: tabId }, '', route);
    }
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
        editorTheme: $('#editor-theme-select')?.value || 'default',
        editorFont: $('#editor-font-select')?.value || 'jetbrains',
        terminalTyping: $('#terminal-typing-select')?.value || 'standard',
        terminalCursorStyle: $('#terminal-cursor-style')?.value || 'underline',
        terminalCursorBlink: $('#terminal-cursor-blink')?.value || 'true',
        terminalFontSize: parseInt($('#terminal-font-size')?.value, 10) || 13,
    };
    
    const pass1 = $('#new-password-input');
    const pass2 = $('#verify-password-input');
    const passwordCheck = validatePasswordForm();
    if (!passwordCheck.ok) {
        showPasswordFormError(passwordCheck.message);
        updatePasswordStrengthUI();
        btn.innerText = 'CHECK PASSWORD';
        btn.style.background = 'var(--error)';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);
        return;
    }
    clearPasswordFormError();
    
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
                payload.current_password = $('#current-password-input')?.value || '';
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
                document.dispatchEvent(new CustomEvent('userLoaded', { detail: data }));
                if (pass1 && pass1.value) {
                    showToast('PASSWORD_CHANGED_SUCCESSFULLY', 'success');
                }
            } else if (pass1?.value) {
                let detail = 'Could not update password.';
                try {
                    const err = await res.json();
                    if (err.detail) detail = typeof err.detail === 'string' ? err.detail : detail;
                } catch { /* ignore */ }
                showPasswordFormError(detail);
                btn.innerText = 'UPDATE FAILED';
                btn.style.background = 'var(--error)';
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.style.background = '';
                    btn.disabled = false;
                }, 2000);
                return;
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
    
    runWithoutDirtyTracking(() => {
        resetPasswordFields();
    });

    setTimeout(() => {
        btn.innerText = 'CHANGES APPLIED';
        btn.style.background = 'linear-gradient(135deg, #58a6ff, #388bfd)';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = '';
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

    runWithoutDirtyTracking(() => {
        const dInput = $('#display-name-input');
        if (dInput) dInput.value = saved.displayName || defaultName;

        const pName = $('#user-fullname');
        if (pName) pName.innerText = saved.displayName || defaultName;

        setSpecialization(saved.specialization || 'Red Team / Pentesting');
        closeAllCustomSelects();
        resetPasswordFields();

        setCustomSelectByHiddenId('editor-theme-select', saved.editorTheme || 'default');
        setCustomSelectByHiddenId('editor-font-select', saved.editorFont || 'jetbrains');
        setCustomSelectByHiddenId('terminal-typing-select', saved.terminalTyping || 'standard');
        setCustomSelectByHiddenId('terminal-cursor-style', saved.terminalCursorStyle || 'underline');
        setCustomSelectByHiddenId('terminal-cursor-blink', saved.terminalCursorBlink || 'true');
        setCustomSelectByHiddenId('terminal-font-size', String(saved.terminalFontSize || 13));
    });

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
    const badge = document.getElementById('mfa-status-badge');
    const text = document.getElementById('mfa-status-text');
    const headerBadge = document.getElementById('mfa-header-badge');

    if (enabled) {
        if (desc) desc.textContent = 'Your account requires a code from your authenticator app at sign-in.';
        if (btn) {
            btn.textContent = 'Disable MFA';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-danger', 'mfa-toggle-btn--disable');
        }
        badge?.setAttribute('data-state', 'active');
        if (text) text.textContent = 'Active';
        if (headerBadge) {
            headerBadge.textContent = 'ON';
            headerBadge.classList.add('is-on');
        }
    } else {
        if (desc) desc.textContent = 'Add a second step with an authenticator app (TOTP).';
        if (btn) {
            btn.textContent = 'Enable MFA';
            btn.classList.remove('btn-danger', 'mfa-toggle-btn--disable');
            btn.classList.add('btn-primary');
        }
        badge?.setAttribute('data-state', 'inactive');
        if (text) text.textContent = 'Inactive';
        if (headerBadge) {
            headerBadge.textContent = 'OFF';
            headerBadge.classList.remove('is-on');
        }
    }
}

export async function openMfaSetup() {
    const qrImg = document.getElementById('mfa-qr-code');
    const secretKey = document.getElementById('mfa-secret-key');
    const token = localStorage.getItem('token');

    if (!document.getElementById('mfa-setup-modal') || !token) {
        showMfaModalError('You must be logged in to enable MFA.');
        return;
    }

    showMfaModalError('');
    const codeInput = document.getElementById('mfa-code-input');
    if (codeInput) {
        codeInput.value = '';
        codeInput.disabled = false;
        codeInput.removeAttribute('aria-busy');
    }
    setMfaSetupPhase('loading');
    setMfaModalOpen(true);
    setMfaToggleLoading(true);

    try {
        const res = await fetch('/api/v1/users/me/mfa-setup', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(parseApiDetail(data, 'Could not start MFA setup'));
        }
        if (!data.secret || !data.otpauth_url) {
            throw new Error('Invalid setup response from server');
        }

        if (secretKey) secretKey.textContent = data.secret;
        if (qrImg) {
            qrImg.onerror = () => {
                showMfaModalError('QR preview unavailable. Use the manual key below.');
            };
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.otpauth_url)}`;
        }

        setMfaSetupPhase('ready');
        if (codeInput) setTimeout(() => codeInput.focus(), 150);
    } catch (err) {
        console.error('Error setting up MFA:', err);
        showMfaModalError(err.message || 'Could not start MFA setup. Try again.');
        setMfaSetupPhase('idle');
    } finally {
        setMfaToggleLoading(false);
    }
}

export function closeMfaModal(force = false) {
    if (!force && mfaSetupInProgress) {
        if (!confirm('Close without finishing setup?')) return;
    }
    setMfaModalOpen(false);
    showMfaModalError('');
    const codeInput = document.getElementById('mfa-code-input');
    if (codeInput) {
        codeInput.value = '';
        codeInput.disabled = false;
        codeInput.removeAttribute('aria-busy');
    }
    mfaSetupInProgress = false;
    setMfaSetupPhase('loading');
}

let mfaVerifyInFlight = false;

export async function verifyMfaCode() {
    const token = localStorage.getItem('token');
    if (!token || mfaVerifyInFlight) return;

    const code = getMfaCodeValue();

    if (code.length !== 6) {
        showMfaModalError('Enter the 6-digit code from your authenticator app.');
        return;
    }

    const codeInput = document.getElementById('mfa-code-input');
    mfaVerifyInFlight = true;
    if (codeInput) {
        codeInput.disabled = true;
        codeInput.setAttribute('aria-busy', 'true');
    }
    showMfaModalError('');

    try {
        const res = await fetch('/api/v1/users/me/mfa-verify', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (res.ok) {
            await refreshMfaStatusFromServer();
            setMfaSetupPhase('success');
            setTimeout(() => closeMfaModal(true), 2000);
        } else {
            showMfaModalError(parseApiDetail(data, 'Invalid code. Check the app and try again.'));
            if (codeInput) {
                codeInput.value = '';
                codeInput.disabled = false;
                codeInput.removeAttribute('aria-busy');
                codeInput.focus();
            }
        }
    } catch (e) {
        console.error('Error verifying MFA:', e);
        showMfaModalError('Network error. Please try again.');
        if (codeInput) {
            codeInput.disabled = false;
            codeInput.removeAttribute('aria-busy');
        }
    } finally {
        mfaVerifyInFlight = false;
        if (codeInput && !codeInput.value) {
            codeInput.disabled = false;
            codeInput.removeAttribute('aria-busy');
        }
    }
}

export async function disableMfa() {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!confirm('Disable two-factor authentication for this account?')) return;

    setMfaToggleLoading(true);
    try {
        const res = await fetch('/api/v1/users/me/mfa-email', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ enabled: false }),
        });
        const data = await res.json();
        if (res.ok) {
            await refreshMfaStatusFromServer();
        } else {
            alert(parseApiDetail(data, 'Could not disable MFA.'));
        }
    } catch (e) {
        console.error('Error disabling MFA:', e);
        alert('Network error while disabling MFA.');
    } finally {
        setMfaToggleLoading(false);
    }
}

export function toggleMfa() {
    if (isMfaEnabled) {
        disableMfa();
    } else {
        openMfaSetup();
    }
}





document.addEventListener('DOMContentLoaded', () => {
    // Load Settings
    const saved = JSON.parse(localStorage.getItem('seclab_settings') || '{}');

    // Sync User Data
    const sync = (user) => {
        const points = user.points || 0;
        localStorage.setItem('user_xp', String(points));
        updateProgressPanel(points);

        if (!saved.displayName) {
            const input = $('#display-name-input');
            const name = user.full_name || user.username;
            if (input) input.value = name;
            const profileName = $('#user-fullname');
            if (profileName) profileName.innerText = name;
            captureSettingsBaseline();
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

    document.addEventListener('userLoaded', (e) => sync(e.detail));

    // Populate form with saved settings
    if (saved.displayName) {
        const dInput = $('#display-name-input');
        if (dInput) dInput.value = saved.displayName;
        const pName = $('#user-fullname');
        if (pName) pName.innerText = saved.displayName;
    }
    if (saved.editorTheme) setCustomSelectByHiddenId('editor-theme-select', saved.editorTheme);
    if (saved.editorFont) setCustomSelectByHiddenId('editor-font-select', saved.editorFont);
    if (saved.terminalTyping) setCustomSelectByHiddenId('terminal-typing-select', saved.terminalTyping);
    if (saved.terminalCursorStyle) setCustomSelectByHiddenId('terminal-cursor-style', saved.terminalCursorStyle);
    if (saved.terminalCursorBlink) setCustomSelectByHiddenId('terminal-cursor-blink', saved.terminalCursorBlink);
    if (saved.terminalFontSize) setCustomSelectByHiddenId('terminal-font-size', String(saved.terminalFontSize));

    // Profile progress from cache when API user is not loaded yet
    const cachedPoints = parseInt(localStorage.getItem('user_xp') || '0', 10);
    if (!window.currentUser) {
        updateProgressPanel(cachedPoints);
    }

    const defaultName = localStorage.getItem('full_name') || localStorage.getItem('username') || '';
    const dInput = $('#display-name-input');
    if (dInput && !dInput.value) dInput.value = saved.displayName || defaultName;

    if (saved.specialization) {
        setSpecialization(saved.specialization);
    }

    initCustomSelects();
    initSecurityPage();
    initSettingsDirtyTracking();
    captureSettingsBaseline();

    if (window.currentUser) sync(window.currentUser);

    refreshMfaStatusFromServer();

    const getTabFromPath = () => {
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        if (routeTabs[path]) return routeTabs[path];
        if (path === '/settings') return 'profile';
        return null;
    };

    const findNavElement = (tabId) => document.querySelector(`.settings-nav-item[data-tab="${tabId}"]`);

    document.querySelectorAll('.settings-nav-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            const tab = item.getAttribute('data-tab');
            if (!tab || !sections[tab]) return;
            e.preventDefault();
            switchTab(tab, item);
        });
    });

    const toggle = document.getElementById('mobileSettingsToggle');
    const sidebar = document.querySelector('.settings-sidebar');
    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    const initialTab = getTabFromPath();
    if (initialTab) {
        switchTab(initialTab, findNavElement(initialTab), { skipHistory: true });
    }

    window.addEventListener('popstate', () => {
        const tab = getTabFromPath();
        if (tab) {
            switchTab(tab, findNavElement(tab), { skipHistory: true });
        }
    });

    // Expose functions to global scope for inline handlers
    window.switchTab = switchTab;
    window.saveSettings = saveSettings;
    window.discardChanges = discardChanges;
    window.toggleMfa = toggleMfa;
    window.closeMfaModal = closeMfaModal;
    window.verifyMfaCode = verifyMfaCode;

    // Backward compatibility for hash navigation.
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const btn = findNavElement(hash);
        if (btn) switchTab(hash, btn);
    }
});

function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'glass-panel';
    toast.style.cssText = `padding:12px 20px;font-family:var(--font-mono);font-size:0.8rem;border-left:4px solid ${type === 'success' ? '#3fb950' : '#f85149'};background:rgba(15,15,17,0.85);backdrop-filter:blur(8px);border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.5);color:#fff;`;
    toast.innerHTML = `<span style="color:${type === 'success' ? '#3fb950' : '#f85149'}">[${type.toUpperCase()}]</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}
