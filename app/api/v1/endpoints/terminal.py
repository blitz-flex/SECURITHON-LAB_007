"""
SECURATION LAB — Sandboxed Terminal WebSocket Router
===================================================
Establishes WebSocket connections to lab AttackBox containers or falls back
to the host PTY (dev mode). Handles ASGI messages cleanly to avoid errors.
"""
import os
import pty
import termios
import struct
import fcntl
import asyncio
import json
import signal
import threading
import select
import logging
import uuid
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.api.deps import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

WS_TICKET_TTL_SECONDS = 30
_ws_tickets: dict[str, dict] = {}


def _cleanup_expired_ws_tickets() -> None:
    now = datetime.utcnow()
    expired = [
        ticket
        for ticket, data in _ws_tickets.items()
        if data["expires_at"] <= now
    ]
    for ticket in expired:
        _ws_tickets.pop(ticket, None)


@router.post("/ws-ticket")
def create_terminal_ws_ticket(
    session_id: str = "",
    current_user: User = Depends(deps.get_current_user),
) -> dict:
    """Issue a short-lived one-time ticket for terminal WebSocket auth."""
    _cleanup_expired_ws_tickets()
    ticket = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(seconds=WS_TICKET_TTL_SECONDS)
    _ws_tickets[ticket] = {
        "username": current_user.username,
        "session_id": session_id,
        "expires_at": expires_at,
    }
    return {
        "ticket": ticket,
        "expires_at": expires_at,
    }


def _consume_ws_ticket(ticket: str, session_id: str) -> str | None:
    _cleanup_expired_ws_tickets()
    data = _ws_tickets.pop(ticket, None)
    if not data:
        return None
    if data["expires_at"] <= datetime.utcnow():
        return None
    if data["session_id"] and data["session_id"] != session_id:
        return None
    return data["username"]


def _extract_ws_ticket(websocket: WebSocket) -> tuple[str, str | None]:
    protocol_header = websocket.headers.get("sec-websocket-protocol", "")
    for protocol in [p.strip() for p in protocol_header.split(",") if p.strip()]:
        if protocol.startswith("terminal-ticket."):
            return protocol.removeprefix("terminal-ticket."), protocol
    return "", None

# ─────────────────────────────────────────────────────────────
# DOCKER TERMINAL SESSION
# ─────────────────────────────────────────────────────────────
class DockerTerminalSession:
    """Manages raw input/output stream to an active Docker container's PTY."""
    
    def __init__(self, websocket: WebSocket, session_id: str):
        self.websocket = websocket
        self.session_id = session_id
        self.container = None
        self.exec_socket = None
        self._running = False

    def attach_to_lab(self) -> bool:
        """Attaches WebSocket stream to the existing lab AttackBox."""
        from app.core.sandbox import sandbox_manager

        lab = sandbox_manager.get_lab(self.session_id)
        if not lab or not lab.attackbox:
            logger.warning(f"Attach failed: Session {self.session_id[:8]} not found or lacks AttackBox")
            return False

        try:
            lab.attackbox.reload()
            if lab.attackbox.status != "running":
                logger.warning(f"Attach failed: AttackBox for session {self.session_id[:8]} is not running")
                return False
        except Exception as e:
            logger.error(f"Failed to check AttackBox status: {e}")
            return False

        self.container = lab.attackbox

        try:
            client = sandbox_manager._get_docker()
            # Spawn interactive bash session via docker exec API
            exec_id = client.api.exec_create(
                self.container.id,
                cmd=["/bin/bash"],
                stdin=True,
                stdout=True,
                stderr=True,
                tty=True,
                environment={
                    "TERM": "xterm-256color",
                    "PS1": "",
                    "SHELL": "/bin/bash",
                }
            )

            # Retrieve raw socket stream
            self.exec_socket = client.api.exec_start(exec_id, socket=True, tty=True)._sock
            self._running = True
            logger.info(f"Attached interactive terminal to lab {self.session_id[:8]}")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize terminal exec: {e}")
            return False

    def start(self) -> bool:
        """Spawns a new temporary standalone container (legacy/fallback mode)."""
        from app.core.sandbox import sandbox_manager

        self.container = sandbox_manager.create_container(self.session_id)
        if not self.container:
            return False

        try:
            client = sandbox_manager._get_docker()
            exec_id = client.api.exec_create(
                self.container.id,
                cmd=["/bin/bash"],
                stdin=True,
                stdout=True,
                stderr=True,
                tty=True,
                environment={
                    "TERM": "xterm-256color",
                    "PS1": "",
                    "SHELL": "/bin/bash",
                }
            )
            self.exec_socket = client.api.exec_start(exec_id, socket=True, tty=True)._sock
            self._running = True
            logger.info(f"Docker standalone terminal started for {self.session_id[:8]}")
            return True
        except Exception as e:
            logger.error(f"Failed to start standalone Docker exec: {e}")
            return False

    def write(self, data: bytes):
        """Sends keystrokes / input to the container PTY."""
        if self.exec_socket and self._running:
            try:
                self.exec_socket.sendall(data)
            except Exception as e:
                logger.error(f"Error writing to container socket: {e}")
                self._running = False

    def resize(self, rows: int, cols: int):
        """Notifies container PTY of window dimensions change."""
        if not self.container:
            return
        try:
            from app.core.sandbox import sandbox_manager
            client = sandbox_manager._get_docker()
            # Inspect the container to retrieve active ExecIDs
            container_info = client.api.inspect_container(self.container.id)
            exec_ids = container_info.get("ExecIDs", [])
            if exec_ids:
                for eid in exec_ids:
                    try:
                        client.api.exec_resize(eid, height=rows, width=cols)
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"Could not resize docker container exec: {e}")

    async def read_loop(self):
        """Listens to PTY output and pushes it to the WebSocket client."""
        loop = asyncio.get_event_loop()
        queue = asyncio.Queue()

        def _socket_reader():
            """Runs synchronous recv calls in a separate background thread."""
            try:
                while self._running:
                    ready, _, _ = select.select([self.exec_socket], [], [], 0.1)
                    if ready:
                        data = self.exec_socket.recv(65536)
                        if data:
                            asyncio.run_coroutine_threadsafe(queue.put(data), loop)
                        else:
                            # EOF
                            asyncio.run_coroutine_threadsafe(queue.put(None), loop)
                            break
            except Exception:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        thread = threading.Thread(target=_socket_reader, daemon=True)
        thread.start()

        while self._running:
            try:
                data = await queue.get()
                if data is None:
                    break
                await self.websocket.send_bytes(data)
            except Exception as e:
                logger.error(f"WebSocket send error in read loop: {e}")
                break

    def stop(self):
        """Tears down local stream sockets without destroying lab containers."""
        self._running = False
        if self.exec_socket:
            try:
                self.exec_socket.close()
            except Exception:
                pass

    def stop_and_remove(self):
        """Stops streams and destroys container (legacy/standalone mode)."""
        self.stop()
        from app.core.sandbox import sandbox_manager
        sandbox_manager.remove_container(self.session_id)


# ─────────────────────────────────────────────────────────────
# FALLBACK: HOST TERMINAL MANAGER (Dev Mode Only)
# ─────────────────────────────────────────────────────────────
class HostTerminalManager:
    """Spawns bash shell locally on the host system when Docker is missing."""
    
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.fd = None
        self.child_pid = None
        self.loop = asyncio.get_event_loop()

    def spawn_terminal(self):
        self.child_pid, self.fd = pty.fork()
        if self.child_pid == 0:
            os.environ["TERM"] = "xterm-256color"
            os.environ["SHELL"] = "/bin/bash"
            os.environ["PS1"] = r"\[\e[33m\][DEV]\[\e[32m\]\u@securation\[\e[m\]:\[\e[34m\]\w\[\e[m\]\$ "
            os.execvp("/bin/bash", ["/bin/bash"])
        else:
            # Set to non-blocking I/O
            fl = fcntl.fcntl(self.fd, fcntl.F_GETFL)
            fcntl.fcntl(self.fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
            self.loop.add_reader(self.fd, self.handle_pty_read)

    def handle_pty_read(self):
        try:
            data = os.read(self.fd, 65536)
            if data:
                asyncio.create_task(self.websocket.send_bytes(data))
        except (OSError, IOError):
            self.cleanup()

    def write_to_pty(self, data: bytes):
        if self.fd:
            try:
                os.write(self.fd, data)
            except (OSError, IOError):
                self.cleanup()

    def resize(self, rows: int, cols: int):
        if self.fd:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, winsize)

    def cleanup(self):
        if self.fd:
            try:
                self.loop.remove_reader(self.fd)
            except Exception:
                pass
            try:
                os.close(self.fd)
            except Exception:
                pass
            self.fd = None
        if self.child_pid:
            try:
                os.kill(self.child_pid, signal.SIGTERM)
                os.waitpid(self.child_pid, os.WNOHANG)
            except Exception:
                pass
            self.child_pid = None


# ─────────────────────────────────────────────────────────────
# WEBSOCKET TERMINAL ENTRYPOINT
# ─────────────────────────────────────────────────────────────
@router.websocket("/ws")
async def terminal_websocket(
    websocket: WebSocket,
    session_id: str = Query(default=""),
    db: Session = Depends(get_db),
):
    # 1. Validate short-lived WebSocket ticket.
    from app.core.config import settings
    from app.crud import user as user_crud

    ticket, selected_protocol = _extract_ws_ticket(websocket)
    username = _consume_ws_ticket(ticket, session_id) if ticket else None

    db_user = None
    if username:
        db_user = user_crud.get_by_username(db, username=username)

    if not db_user:
        await websocket.accept()
        await websocket.send_text("\r\n\x1b[1;31m[ERROR] Connection unauthorized. Invalid or expired terminal ticket.\x1b[0m\r\n")
        await websocket.close(code=4003)
        return

    await websocket.accept(subprotocol=selected_protocol)

    use_docker = False
    docker_session = None
    host_mgr = None

    if session_id:
        # Lab session mode
        from app.core.sandbox import sandbox_manager
        lab = sandbox_manager.get_lab(session_id)
        
        docker_session = DockerTerminalSession(websocket, session_id)
        if docker_session.attach_to_lab():
            use_docker = True
        else:
            logger.info("Docker attach failed. Falling back to host terminal session.")
            host_mgr = HostTerminalManager(websocket)
            host_mgr.spawn_terminal()
    else:
        # Dev/Standalone fallback mode
        from app.core.sandbox import sandbox_manager
        if sandbox_manager.is_available():
            # In dev mode, we can create a temporary standalone container
            temp_id = str(uuid.uuid4())
            docker_session = DockerTerminalSession(websocket, temp_id)
            if docker_session.start():
                use_docker = True

        if not use_docker:
            logger.info("Docker not available. Falling back to host terminal session.")
            host_mgr = HostTerminalManager(websocket)
            host_mgr.spawn_terminal()

    # Start reader task to stream container/PTY stdout/stderr to WebSocket
    read_task = None
    if use_docker:
        read_task = asyncio.create_task(docker_session.read_loop())

    try:
        while True:
            # Handle incoming ASGI message directly to check for disconnects safely
            message = await websocket.receive()
            
            # Check if connection was closed or requested shutdown
            if message.get("type") == "websocket.disconnect":
                break
                
            raw = message.get("bytes") or (
                message.get("text", "").encode() if message.get("text") else None
            )
            if raw is None:
                continue

            # Check if it's a control message (resize, heartbeat, etc.)
            try:
                ctrl = json.loads(raw)
                mtype = ctrl.get("type")
                if mtype == "resize":
                    rows = ctrl.get("rows", 24)
                    cols = ctrl.get("cols", 80)
                    if use_docker:
                        docker_session.resize(rows, cols)
                    else:
                        host_mgr.resize(rows, cols)
                    continue
                elif mtype == "heartbeat":
                    continue
                elif mtype == "input":
                    raw = ctrl.get("data", "").encode()
            except Exception:
                pass

            # Write input to PTY
            if use_docker:
                docker_session.write(raw)
            else:
                host_mgr.write_to_pty(raw)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Unhandled terminal websocket error: {e}")
    finally:
        # Graceful cleanup
        if read_task:
            read_task.cancel()
        if use_docker and docker_session:
            if session_id:
                docker_session.stop()
            else:
                docker_session.stop_and_remove()
        elif host_mgr:
            host_mgr.cleanup()
        logger.info(f"Terminal connection closed for session: {session_id[:8] if session_id else 'standalone'}")
