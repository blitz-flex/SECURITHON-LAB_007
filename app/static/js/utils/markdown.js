function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function sanitizeMarkdownUrl(rawUrl) {
    const url = String(rawUrl || '').trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
    if (!url) return null;

    const lowered = url.toLowerCase();
    if (lowered.startsWith('http://') || lowered.startsWith('https://')) {
        return url;
    }
    if (lowered.startsWith('javascript:') || lowered.startsWith('data:') || lowered.startsWith('vbscript:')) {
        return null;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        return null;
    }
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('#') || url.startsWith('?')) {
        return url;
    }
    return null;
}

export function formatMarkdown(text) {
    let escaped = escapeHtml(text);

    escaped = escaped.replace(/```([a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, (match, lang, code) => {
        const language = lang ? lang.trim() : "code";
        return `
            <div class="code-block-container">
                <div class="code-block-header">
                    <span class="code-block-lang">${language}</span>
                    <button class="code-copy-btn" title="Copy Code">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
                <pre><code>${code}</code></pre>
            </div>
        `;
    });

    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const safeUrl = sanitizeMarkdownUrl(url);
        if (!safeUrl) return label;
        return `<a href="${escapeAttribute(safeUrl)}" class="mentor-md-link" rel="noopener noreferrer">${label}</a>`;
    });
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
}
