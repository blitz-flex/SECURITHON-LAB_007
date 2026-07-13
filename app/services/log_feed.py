from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime

from fastapi import WebSocket

logger = logging.getLogger(__name__)


LOG_MESSAGES: list[tuple[str, str]] = [
    ("[auditd] sandbox policy denied privileged exec request", "SEC"),
    ("[trivy] vulnerability scan completed: 0 critical, 2 high, 12 medium detected", "SEC"),
    ("[gitleaks] scan path=/tmp/sandbox - status: clean, no secrets found", "SEC"),
    ("systemd[1]: Started Securithon Sandbox Node Cleanup Service.", "SYS"),
    ("dockerd: training container started for active lab session", "SYS"),
    ("kernel: docker bridge interface entered forwarding state", "SYS"),
    ("[suricata] ALERT: SQL injection attempt detected against training target", "THREAT"),
    ("[ufw] BLOCK inbound connection attempt to restricted lab port", "THREAT"),
    ("[sandbox] escape attempt blocked by runtime profile", "THREAT"),
    ("sshd: Accepted publickey for operator from private lab subnet", "AUTH"),
    ("sshd: Invalid user admin from anonymized external source", "AUTH"),
    ("api: user session handshake verified", "AUTH"),
    ("router: POST /api/v1/auth/login - 200 OK", "NET"),
    ("keepalived: VRRP instance entering MASTER state", "NET"),
    ("postgres: application database connection authorized", "DB"),
    ("redis: cache maintenance completed", "DB"),
    ("deploy-agent: lab sandbox initialized for operator", "OP"),
    ("deploy-agent: AppArmor sandbox profile set to enforce mode", "OP"),
]


class LogManager:
    """Manages active WebSocket connections for the live log feed."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str, category: str = "SYS") -> None:
        payload = json.dumps({
            "time": datetime.utcnow().strftime("%H:%M:%S"),
            "category": category,
            "message": message,
        })
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.debug("WebSocket broadcast error: %s", e)
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)


async def log_generator(log_manager: LogManager) -> None:
    while True:
        await asyncio.sleep(random.randint(2, 6))
        msg, cat = random.choice(LOG_MESSAGES)
        await log_manager.broadcast(msg, cat)
