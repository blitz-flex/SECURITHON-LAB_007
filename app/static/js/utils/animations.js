/**
 * Tactical Animation Module
 */

export async function typeText(container, lines, options = {}) {
    if (!container) return;
    
    const { speed = 40, delay = 800 } = options;

    for (const lineData of lines) {
        await new Promise(r => setTimeout(r, lineData.delay || delay));
        
        const lineDiv = document.createElement('div');
        lineDiv.className = 'term-line';
        container.appendChild(lineDiv);

        if (lineData.type === 'command') {
            const promptSpan = document.createElement('span');
            promptSpan.className = 'term-prompt';
            promptSpan.innerText = 'operator@securithon-node-01:~$';
            lineDiv.appendChild(promptSpan);

            const textSpan = document.createElement('span');
            textSpan.className = 'term-command';
            lineDiv.appendChild(textSpan);

            for (let i = 0; i < lineData.text.length; i++) {
                textSpan.innerHTML += lineData.text.charAt(i);
                await new Promise(r => setTimeout(r, speed + Math.random() * speed));
            }
        } else {
            const textSpan = document.createElement('span');
            textSpan.className = `term-${lineData.type}`;
            textSpan.innerText = lineData.text;
            lineDiv.appendChild(textSpan);
        }

        container.scrollTop = container.scrollHeight;
    }
}

export function animateCounter(elements) {
    elements.forEach(stat => {
        const target = +stat.getAttribute('data-val');
        const count = +stat.innerText.replace(/[^0-9]/g, '');
        const increment = target / 100;

        if (count < target) {
            const newVal = Math.ceil(count + increment);
            stat.innerText = newVal.toLocaleString() + (stat.innerText.includes('%') ? '%' : '+');
            setTimeout(() => animateCounter([stat]), 20);
        } else {
            stat.innerText = target.toLocaleString() + (stat.innerText.includes('%') ? '%' : '+');
        }
    });
}

export function initGlowEffect(cards) {
    cards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.03) 0%, rgba(13,17,23,0.4) 50%)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.background = '';
        });
    });
}
