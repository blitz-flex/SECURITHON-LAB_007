"""
Shared Admin Utilities
Dependency, audit log helper, and in-memory platform config used across all admin modules.
"""
import logging
from datetime import datetime
from typing import Any

from fastapi import Depends, HTTPException
from app.api import deps
from app.models.user import User

logger = logging.getLogger(__name__)

# ── In-memory state ───────────────────────────────────────────────────────────

PLATFORM_CONFIG: dict[str, Any] = {
    "maintenance_mode": False,
    "global_announcement": "Welcome to Securithon Lab OCC.",
    "allow_registration": True,
    "system_alert": "NORMAL",
    "threat_level": "STABLE",
}

AUDIT_LOGS: list[dict] = []

INFRA_NODES: list[dict] = [
    {"id": "node-01", "name": "AUTH_GATEWAY",    "type": "shield",   "region": "EU-WEST",    "uptime": "99.9%", "latency": "14ms",  "status": "UP", "load": 12},
    {"id": "node-02", "name": "LAB_ORCHESTRATOR","type": "server",   "region": "EU-CENTRAL", "uptime": "98.5%", "latency": "42ms",  "status": "UP", "load": 45},
    {"id": "node-03", "name": "DATA_VAULT",      "type": "database", "region": "EU-WEST",    "uptime": "100%",  "latency": "8ms",   "status": "UP", "load": 8},
    {"id": "node-04", "name": "SANDBOX_CLUSTER", "type": "cloud",    "region": "US-EAST",    "uptime": "99.2%", "latency": "115ms", "status": "UP", "load": 32},
    {"id": "node-05", "name": "EDGE_OPTIMIZER",  "type": "server",   "region": "ASIA-SOUTH", "uptime": "97.8%", "latency": "85ms",  "status": "UP", "load": 24},
]


# ── Dependency ────────────────────────────────────────────────────────────────

def get_current_admin_user(
    current_user: User = Depends(deps.get_current_user),
) -> User:
    """Dependency that enforces superuser access."""
    if not current_user.is_superuser:
        logger.warning("Unauthorized admin access attempt by user: %s", current_user.username)
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user
# ── Audit log helper ──────────────────────────────────────────────────────────

def add_audit_log(user_id: int, action: str, detail: str) -> None:
    """Prepend an entry to the in-memory audit log."""
    AUDIT_LOGS.insert(0, {
        "time": datetime.now().strftime("%H:%M:%S"),
        "user_id": user_id,
        "action": action,
        "detail": detail,
    })
    logger.info("AUDIT [%s] uid=%s — %s", action, user_id, detail)
