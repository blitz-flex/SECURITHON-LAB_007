/**
 * TACTICAL TERMINAL ENGINE v3.5
 * Custom WebSocket-driven terminal wrapper around xterm.js.
 * Features transparent glassmorphic aesthetic, custom theme variables, and resilient connection logic.
 */
export class Terminal {
    /**
     * @param {string} containerId - DOM ID of terminal container element
     * @param {object} options - Options config (e.g. autoConnect)
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Terminal container with ID "${containerId}" not found.`);
            return;
        }

        this.socket = null;
        this.heartbeatTimer = null;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.sessionId = null;
        this._autoConnect = options.autoConnect !== false;
        this.onConnect = typeof options.onConnect === 'function' ? options.onConnect : null;

        // 1. Setup XTerm with custom glassmorphic layout
        const settings = JSON.parse(localStorage.getItem('seclab_settings') || '{}');
        
        let termTheme = {
            background: 'rgba(0, 0, 0, 0)',
            foreground: '#3fb950',
            cursor: '#3fb950',
            selectionBackground: 'rgba(63, 185, 80, 0.25)',
            black: '#1c1e26', red: '#f85149', green: '#3fb950', yellow: '#d29922',
            blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#e6edf3',
            brightBlack: '#484f58', brightRed: '#ff7b72', brightGreen: '#56d364',
            brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
            brightCyan: '#56ecf8', brightWhite: '#ffffff'
        };

        if (settings.editorTheme === 'cyberpunk') {
            termTheme.foreground = '#ff007f'; // Neon Pink
            termTheme.cursor = '#00f3ff'; // Neon Cyan
            termTheme.selectionBackground = 'rgba(255, 0, 127, 0.25)';
            termTheme.green = '#00f3ff';
        } else if (settings.editorTheme === 'high-contrast') {
            termTheme.foreground = '#ffffff';
            termTheme.cursor = '#ffffff';
            termTheme.selectionBackground = 'rgba(255, 255, 255, 0.3)';
        } else if (settings.editorTheme === 'dracula') {
            termTheme.foreground = '#f8f8f2';
            termTheme.cursor = '#ff79c6';
            termTheme.selectionBackground = 'rgba(255, 121, 198, 0.3)';
            termTheme.green = '#50fa7b';
        } else if (settings.editorTheme === 'nord') {
            termTheme.foreground = '#d8dee9';
            termTheme.cursor = '#88c0d0';
            termTheme.selectionBackground = 'rgba(136, 192, 208, 0.3)';
            termTheme.green = '#a3be8c';
        } else if (settings.editorTheme === 'gruvbox') {
            termTheme.foreground = '#ebdbb2';
            termTheme.cursor = '#fabd2f';
            termTheme.selectionBackground = 'rgba(250, 189, 47, 0.3)';
            termTheme.green = '#b8bb26';
        }

        const fontMap = {
            'jetbrains': '"JetBrains Mono", monospace',
            'fira': '"Fira Code", monospace',
            'roboto': '"Roboto Mono", monospace',
            'source': '"Source Code Pro", monospace',
            'consolas': 'Consolas, monospace'
        };

        this.xterm = new window.Terminal({
            cursorBlink: settings.terminalCursorBlink !== 'false',
            cursorStyle: settings.terminalCursorStyle || 'underline',
            theme: termTheme,
            fontFamily: fontMap[settings.editorFont] || '"JetBrains Mono", monospace',
            fontSize: settings.terminalFontSize || 13,
            lineHeight: 1.2,
            letterSpacing: 0.5,
            convertEol: true,
            scrollback: 10000,
            allowTransparency: true
        });

        // 2. Load Fit Addon
        if (window.FitAddon) {
            this.fitAddon = new window.FitAddon.FitAddon();
            this.xterm.loadAddon(this.fitAddon);
        }

        // 3. Mount terminal to DOM
        this.xterm.open(this.container);

        // Perform initial viewport calculations
        const scheduleInitialFit = () => {
            if (this.container.clientWidth > 80 && this.container.clientHeight > 80) {
                this.fit();
            } else {
                setTimeout(scheduleInitialFit, 100);
            }
        };
        scheduleInitialFit();

        // Bind resizing logic to DOM changes
        this.resizeObserver = new ResizeObserver(() => this.fit());
        this.resizeObserver.observe(this.container);

        // Bind keystrokes to transport
        this.xterm.onData(data => this.sendData(data));

        // Prevent focus-scrolling bug where browser scrolls overflow-hidden containers to reveal hidden textarea
        this.container.addEventListener('scroll', () => {
            this.container.scrollTop = 0;
            this.container.scrollLeft = 0;
        });
        let p = this.container.parentElement;
        while (p && p.id !== 'arenaLayout') {
            p.addEventListener('scroll', () => {
                p.scrollTop = 0;
                p.scrollLeft = 0;
            });
            p = p.parentElement;
        }

        // Re-fit when custom fonts are loaded to prevent row height calculation mismatch
        if (document.fonts) {
            document.fonts.ready.then(() => this.fit());
        }

        // 4. Standalone Mode Initialization
        if (this._autoConnect) {
            this.initSocket();
        }
    }

    /**
     * Triggers xterm.js fit calculations and sends new terminal size parameters to backend.
     */
    fit() {
        if (this.fitTimeout) clearTimeout(this.fitTimeout);
        this.fitTimeout = setTimeout(() => {
            if (this.fitAddon) {
                try {
                    // Only fit and send resize if container is actually visible with a reasonable width/height
                    if (this.container.clientWidth > 80 && this.container.clientHeight > 80) {
                        this.fitAddon.fit();
                        this.sendResize();
                    }
                } catch (e) {
                    console.warn("Could not refit terminal window:", e);
                }
            }
        }, 50);
    }

    /**
     * Binds terminal session to an active lab AttackBox.
     * @param {string} sessionId 
     */
    connectToLab(sessionId) {
        this.sessionId = sessionId;
        this.reconnectAttempts = 0;
        this.initSocket(sessionId);
    }

    /**
     * Gracefully disconnects the WebSocket stream.
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }
        this.isConnecting = false;
        this.sessionId = null;
    }

    /**
     * Creates a WebSocket connection and binds to messaging handlers.
     * @param {string} sessionId 
     */
    async getWebSocketTicket(sessionId = '') {
        const token = localStorage.getItem('token') || '';
        if (!token) throw new Error('Missing auth token');

        const url = new URL('/api/v1/terminal/ws-ticket', window.location.origin);
        if (sessionId) url.searchParams.set('session_id', sessionId);

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error('Could not authorize terminal session');
        }
        const data = await response.json();
        if (!data.ticket) {
            throw new Error('Invalid terminal ticket response');
        }
        return data.ticket;
    }

    async initSocket(sessionId = '') {
        if (this.isConnecting) return;
        this.isConnecting = true;

        const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let ticket;
        try {
            ticket = await this.getWebSocketTicket(sessionId);
        } catch (err) {
            this.isConnecting = false;
            this.xterm.write(`\r\n\x1b[1;31m[ERROR] ${err.message || 'Terminal authorization failed'}\x1b[0m\r\n`);
            return;
        }

        const wsUrl = sessionId
            ? `${scheme}//${window.location.host}/api/v1/terminal/ws?session_id=${encodeURIComponent(sessionId)}`
            : `${scheme}//${window.location.host}/api/v1/terminal/ws`;

        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
        }

        this.socket = new WebSocket(wsUrl, [`terminal-ticket.${ticket}`]);

        this.socket.onopen = () => {
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.fit();
            this.xterm.focus();
            this.startHeartbeat();
            if (this.onConnect) this.onConnect(this);
        };

        this.socket.onmessage = (event) => {
            if (event.data instanceof Blob) {
                // If binary stream, read as array buffer
                const reader = new FileReader();
                reader.onload = () => {
                    this.xterm.write(new Uint8Array(reader.result), () => {
                        this.xterm.scrollToBottom();
                    });
                };
                reader.readAsArrayBuffer(event.data);
            } else {
                this.xterm.write(event.data, () => {
                    this.xterm.scrollToBottom();
                });
            }
        };

        this.socket.onclose = () => {
            this.isConnecting = false;
            this.stopHeartbeat();

            // Handle connection drops and trigger recovery if session remains active
            if (sessionId && this.sessionId === sessionId) {
                this.xterm.write('\r\n\x1b[1;33m[WARN] Connection dropped. Recovering connection link...\x1b[0m\r\n');
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
                this.reconnectAttempts++;
                if (this.reconnectAttempts < 6) {
                    setTimeout(() => this.initSocket(sessionId), delay);
                } else {
                    this.xterm.write('\r\n\x1b[1;31m[ERROR] Connection recovery failed. Try restarting the lab machine.\x1b[0m\r\n');
                }
            } else if (!sessionId && this._autoConnect) {
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
                this.reconnectAttempts++;
                setTimeout(() => this.initSocket(), delay);
            }
        };

        this.socket.onerror = (err) => {
            console.error("Terminal WebSocket error:", err);
            this.isConnecting = false;
        };
    }

    setOnConnect(callback) {
        this.onConnect = typeof callback === 'function' ? callback : null;
    }

    /**
     * Send input data to the socket stream.
     */
    sendData(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
        }
    }

    /**
     * Send terminal resize event to backend.
     */
    sendResize() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const size = {
                type: 'resize',
                cols: this.xterm.cols,
                rows: this.xterm.rows
            };
            this.socket.send(JSON.stringify(size));
        }
    }

    /**
     * Sends a keepalive ping request.
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            }
        }, 20000);
    }

    /**
     * Cancels the keepalive timer.
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Logs ANSI formatted outputs directly to the viewport.
     */
    log(message, category = 'SYS', hexColor = null) {
        const prefixes = {
            'SYS':     '\x1b[1;90m[*] \x1b[0m\x1b[90m',
            'OK':      '\x1b[1;32m[+] \x1b[0m\x1b[32m',
            'ERR':     '\x1b[1;31m[-] \x1b[0m\x1b[31m',
            'INTEL':   '\x1b[1;35m[i] \x1b[0m\x1b[35m',
            'ATTACK':  '\x1b[1;31m[!] \x1b[0m\x1b[1;31m',
            'DEFENSE': '\x1b[1;32m[+] \x1b[0m\x1b[1;32m',
            'SEC':     '\x1b[1;33m[#] \x1b[0m\x1b[33m',
            'BREACH':  '\x1b[1;31m[!] \x1b[0m\x1b[1;31m'
        };

        const prefix = prefixes[category] || `\x1b[1;37m[${category}] `;
        
        // Single leading newline, no trailing newline to prevent double newline spacing
        this.xterm.write(`\r\n${prefix}${message}\x1b[0m\r\n`, () => {
            this.xterm.scrollToBottom();
        });
    }

    clear() {
        this.xterm.reset();
        this.xterm.write('\x1b[2J\x1b[H');
    }

    destroy() {
        this.disconnect();
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.xterm.dispose();
    }
}
