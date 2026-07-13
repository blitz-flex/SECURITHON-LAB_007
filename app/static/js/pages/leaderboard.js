/* ═══════════════════════════════════════════════════════════
   SECURITHON LAB — GLOBAL LEADERBOARD
   Renders a real, XP-ranked leaderboard from the backend.
   ═══════════════════════════════════════════════════════════ */

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // mirror "updated every 5 minutes"

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function rankCell(rank) {
    if (rank === 1) return '<span class="lb-medal lb-gold"><i class="fas fa-trophy"></i></span>';
    if (rank === 2) return '<span class="lb-medal lb-silver"><i class="fas fa-medal"></i></span>';
    if (rank === 3) return '<span class="lb-medal lb-bronze"><i class="fas fa-medal"></i></span>';
    return `<span class="lb-rank-num">${rank}</span>`;
}

function securityClass(pct) {
    if (pct >= 80) return 'lb-sec-high';
    if (pct >= 40) return 'lb-sec-mid';
    if (pct > 0) return 'lb-sec-low';
    return 'lb-sec-none';
}

function deltaMarkup(delta) {
    if (delta === null || delta === undefined || Number(delta) === 0) {
        return '<span class="lb-delta-flat">−</span>';
    }
    const numeric = Number(delta);
    const sign = numeric > 0 ? '+' : '';
    const className = numeric > 0 ? 'lb-delta-up' : 'lb-delta-down';
    return `<span class="${className}">${sign}${numeric}</span>`;
}

function metricMarkup(value) {
    if (value === null || value === undefined) {
        return '<span class="lb-metric lb-metric-empty">−</span>';
    }
    return `<span class="lb-metric">${Number(value).toLocaleString()}</span>`;
}

function rowMarkup(entry, { sticky = false } = {}) {
    const classes = ['lb-row'];
    if (entry.is_me) classes.push('lb-row-me');
    if (entry.rank <= 3) classes.push('lb-row-top');
    if (sticky) classes.push('lb-row-sticky');

    const name = escapeHtml(entry.full_name || entry.username);
    const handle = escapeHtml(entry.username);
    const meTag = entry.is_me ? '<span class="lb-you">YOU</span>' : '';
    const initials = (name || handle).substring(0, 2).toUpperCase();

    return `
        <div class="${classes.join(' ')}" role="row">
            <span class="lb-col-rank" role="cell">${rankCell(entry.rank)}</span>
            <span class="lb-col-player" role="cell">
                <span class="lb-avatar">${escapeHtml(initials)}</span>
                <span class="lb-player-id">
                    <span class="lb-player-name">${name} ${meTag}</span>
                    <span class="lb-player-handle">@${handle}</span>
                </span>
            </span>
            <span class="lb-col-num" role="cell">
                <span class="lb-sec ${securityClass(entry.security)}">${entry.security}%</span>
            </span>
            <span class="lb-col-num" role="cell">
                ${metricMarkup(entry.efficiency)}
            </span>
            <span class="lb-col-num" role="cell">
                ${metricMarkup(entry.clean_code)}
            </span>
            <span class="lb-col-num lb-col-total" role="cell">
                <span class="lb-xp">${(entry.total ?? entry.points).toLocaleString()}</span>
            </span>
            <span class="lb-col-delta" role="cell">
                ${deltaMarkup(entry.delta)}
            </span>
        </div>
    `;
}

let currentPage = 1;
const itemsPerPage = 10;
let allLeaderboardData = null;

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationEl = document.getElementById('lb-pagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let html = `
        <button class="lb-page-btn" id="lb-btn-prev" ${currentPage === 1 ? 'disabled' : ''} title="Previous Page">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
            html += `
                <button class="lb-page-num ${i === currentPage ? 'is-active' : ''}" data-page="${i}">
                    ${i}
                </button>
            `;
        } else if (i === 2 && currentPage > 3) {
            html += '<span class="lb-page-dots">...</span>';
        } else if (i === totalPages - 1 && currentPage < totalPages - 2) {
            html += '<span class="lb-page-dots">...</span>';
        }
    }

    html += `
        <button class="lb-page-btn" id="lb-btn-next" ${currentPage === totalPages ? 'disabled' : ''} title="Next Page">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationEl.innerHTML = html;

    // Event Listeners for Prev/Next and Page numbers
    const prevBtn = document.getElementById('lb-btn-prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderPage();
            }
        });
    }

    const nextBtn = document.getElementById('lb-btn-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderPage();
            }
        });
    }

    paginationEl.querySelectorAll('.lb-page-num').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const page = parseInt(e.currentTarget.getAttribute('data-page'), 10);
            if (page && page !== currentPage) {
                currentPage = page;
                renderPage();
            }
        });
    });
}

function renderPage() {
    const body = document.getElementById('lb-body');
    const sticky = document.getElementById('lb-me-sticky');
    const totalEl = document.getElementById('lb-total-players');
    const topCountEl = document.getElementById('lb-top-count');
    if (!body || !allLeaderboardData) return;

    const top = Array.isArray(allLeaderboardData.top) ? allLeaderboardData.top : [];
    if (totalEl) totalEl.innerText = (allLeaderboardData.total_players ?? top.length).toLocaleString();
    if (topCountEl) topCountEl.innerText = String(top.length);

    if (top.length === 0) {
        body.innerHTML = '<div class="lb-empty">No ranked operators yet. Solve a lab to claim your spot.</div>';
        if (sticky) sticky.hidden = true;
        const paginationEl = document.getElementById('lb-pagination');
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    // Slice top for the current page
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedTop = top.slice(startIndex, endIndex);

    body.innerHTML = paginatedTop.map((entry) => rowMarkup(entry)).join('');

    // Pinned row checks: show me only if not visible in top AND not in the current paginated page
    const me = allLeaderboardData.me;
    const meInCurrentPage = me && paginatedTop.some((entry) => entry.is_me);
    if (sticky) {
        if (me && !meInCurrentPage) {
            sticky.innerHTML = rowMarkup(me, { sticky: true });
            sticky.hidden = false;
        } else {
            sticky.hidden = true;
            sticky.innerHTML = '';
        }
    }

    renderPagination(top.length);
}

function render(data) {
    allLeaderboardData = data;
    const top = Array.isArray(data.top) ? data.top : [];
    const totalPages = Math.ceil(top.length / itemsPerPage);
    if (currentPage > totalPages) {
        currentPage = Math.max(1, totalPages);
    }
    renderPage();
}

async function loadLeaderboard() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    const body = document.getElementById('lb-body');
    try {
        const res = await fetch('/api/v1/users/leaderboard?limit=100', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (!res.ok) throw new Error('Leaderboard request failed');
        const data = await res.json();
        render(data);
    } catch (err) {
        console.error('Leaderboard load failed:', err);
        if (body) {
            body.innerHTML = '<div class="lb-empty lb-error"><i class="fas fa-triangle-exclamation"></i> Could not load the leaderboard. Try again.</div>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('lb-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('is-spinning');
            loadLeaderboard().finally(() => {
                setTimeout(() => refreshBtn.classList.remove('is-spinning'), 600);
            });
        });
    }

    loadLeaderboard();
    setInterval(loadLeaderboard, REFRESH_INTERVAL_MS);
});
