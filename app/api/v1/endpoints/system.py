"""
System Endpoints
Provides real-time system stats and static CVE reference data.
"""
import logging
import time
from typing import Any

import psutil
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()
ACTIVE_SANDBOX_WARNING_THRESHOLD = 20
ACTIVE_SANDBOX_CRITICAL_THRESHOLD = 50

_CVE_DB: dict[str, list[dict]] = {
    "cwe89":  [{"id": "CVE-2023-3453", "summary": "SQL Injection in Login Module"}, {"id": "CVE-2021-44228", "summary": "Improper neutralization of special elements (JNDI)"}],
    "cwe287": [{"id": "CVE-2022-21449", "summary": "Improper verification of cryptographic signature"}, {"id": "CVE-2020-0601", "summary": "Spoofing vulnerability in CryptoAPI"}],
    "cwe79":  [{"id": "CVE-2021-23337", "summary": "Cross-site Scripting in Template Engine"}, {"id": "CVE-2019-11358", "summary": "jQuery UI Cross-site Scripting"}],
}


def _active_sandbox_count() -> int:
    try:
        from app.core.sandbox import sandbox_manager

        return sum(
            1
            for lab in sandbox_manager._labs.values()
            if lab.status == "online"
        )
    except Exception as e:
        logger.warning("Could not read active sandbox count: %s", e)
        return 0


def _sandbox_telemetry() -> dict[str, Any]:
    active_count = _active_sandbox_count()
    return {
        "active_sandboxes": active_count,
        "active_sandbox_warning_threshold": ACTIVE_SANDBOX_WARNING_THRESHOLD,
        "active_sandbox_critical_threshold": ACTIVE_SANDBOX_CRITICAL_THRESHOLD,
        "active_sandbox_alert": active_count > ACTIVE_SANDBOX_WARNING_THRESHOLD,
        "active_sandbox_critical": active_count > ACTIVE_SANDBOX_CRITICAL_THRESHOLD,
    }


@router.get("/stats")
async def get_system_stats() -> dict[str, Any]:
    """Return live CPU, memory, network, and disk metrics."""
    try:
        net = psutil.net_io_counters()
        return {
            "cpu": psutil.cpu_percent(interval=None),
            "memory": psutil.virtual_memory().percent,
            "network": {"bytes_sent": net.bytes_sent, "bytes_recv": net.bytes_recv},
            "disk": psutil.disk_usage("/").percent,
            **_sandbox_telemetry(),
            "timestamp": time.time(),
        }
    except Exception as e:
        logger.warning("psutil unavailable, returning fallback stats: %s", e)
        return {
            "cpu": 15.0,
            "memory": 42.0,
            "network": {"bytes_sent": 0, "bytes_recv": 0},
            "disk": 38.4,
            **_sandbox_telemetry(),
            "timestamp": time.time(),
        }


@router.get("/cve/{cwe_id}")
async def get_cves_by_cwe(cwe_id: str) -> dict[str, list]:
    """Return static CVE reference data for a given CWE identifier."""
    return {"cves": _CVE_DB.get(cwe_id, [])}


@router.get("/announcement")
async def get_announcement() -> dict:
    """Public endpoint — returns current global announcement (no auth required)."""
    from app.api.v1.endpoints.admin.shared import PLATFORM_CONFIG
    msg = PLATFORM_CONFIG.get("global_announcement", "")
    return {"message": msg if msg and msg.strip() else ""}




from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api import deps
from app.models.user import User
from app.api.v1.endpoints.lab import CHALLENGE_REGISTRY

class ShellCommand(BaseModel):
    command: str

@router.post("/shell")
def execute_shell_command(
    payload: ShellCommand,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Strict Admin Access Required: Access Denied.")

    raw = payload.command.strip()
    parts = raw.split(None, 2)
    cmd = parts[0].lower() if parts else ""
    arg1 = parts[1] if len(parts) > 1 else ""
    arg2 = parts[2] if len(parts) > 2 else ""

    from app.api.v1.endpoints.admin.shared import add_audit_log, get_audit_logs, PLATFORM_CONFIG, AUDIT_LOGS

    # ── status ──────────────────────────────────────────────────────
    if cmd == "status":
        cpu = psutil.cpu_percent()
        mem = psutil.virtual_memory().percent
        active_count = db.query(User).filter(User.is_active == True).count()
        maintenance = "ON" if PLATFORM_CONFIG.get("maintenance_mode") else "OFF"
        return {"output": (
            f"OCC_CORE: NOMINAL\n"
            f"CPU_LOAD: {cpu}%\n"
            f"MEM_USAGE: {mem}%\n"
            f"ACTIVE_OPERATIVES: {active_count}\n"
            f"MAINTENANCE_MODE: {maintenance}\n"
            f"DB_CONNECTION: SECURE"
        )}

    # ── users ────────────────────────────────────────────────────────
    elif cmd == "users":
        users = db.query(User).all()
        lines = [f"- {u.username} (ID:{u.id} XP:{u.points} Active:{u.is_active} Admin:{u.is_superuser})" for u in users]
        return {"output": f"REGISTERED OPERATIVES ({len(users)}):\n" + "\n".join(lines)}

    # ── labs ─────────────────────────────────────────────────────────
    elif cmd == "labs":
        lab_lines = [f"- {cid}: {info['title']} ({info['difficulty']})" for cid, info in CHALLENGE_REGISTRY.items()]
        return {"output": f"AVAILABLE SECTOR LABS ({len(CHALLENGE_REGISTRY)}):\n" + "\n".join(lab_lines)}

    # ── ban ──────────────────────────────────────────────────────────
    elif cmd == "ban":
        if not arg1:
            return {"output": "USAGE: ban [username]"}
        user = db.query(User).filter(User.username == arg1).first()
        if not user:
            return {"output": f"ERROR: User '{arg1}' not found."}
        if user.is_superuser:
            return {"output": f"ERROR: Cannot ban an admin account."}
        user.is_active = False
        db.commit()
        add_audit_log(current_user.id, "USER_BAN", f"Admin banned operative: {arg1}")
        return {"output": f"OPERATIVE '{arg1}' HAS BEEN BANNED.\nAccount deactivated. They cannot log in."}

    # ── unban ────────────────────────────────────────────────────────
    elif cmd == "unban":
        if not arg1:
            return {"output": "USAGE: unban [username]"}
        user = db.query(User).filter(User.username == arg1).first()
        if not user:
            return {"output": f"ERROR: User '{arg1}' not found."}
        user.is_active = True
        db.commit()
        add_audit_log(current_user.id, "USER_UNBAN", f"Admin unbanned operative: {arg1}")
        return {"output": f"OPERATIVE '{arg1}' HAS BEEN UNBANNED.\nAccount reactivated. They can log in again."}

    # ── kick ─────────────────────────────────────────────────────────
    elif cmd == "kick":
        if not arg1:
            return {"output": "USAGE: kick [username]"}
        user = db.query(User).filter(User.username == arg1).first()
        if not user:
            return {"output": f"ERROR: User '{arg1}' not found."}
        if user.is_superuser:
            return {"output": f"ERROR: Cannot kick an admin account."}
        user.is_active = False
        db.commit()
        add_audit_log(current_user.id, "SESSION_KICK", f"Admin kicked operative: {arg1}")
        return {"output": f"OPERATIVE '{arg1}' HAS BEEN KICKED.\nSession terminated. Account deactivated."}

    # ── userinfo ──────────────────────────────────────────────────────
    elif cmd == "userinfo":
        if not arg1:
            return {"output": "USAGE: userinfo [username]"}
        user = db.query(User).filter(User.username == arg1).first()
        if not user:
            return {"output": f"ERROR: User '{arg1}' not found."}
        last_active = user.last_active.strftime("%Y-%m-%d %H:%M:%S") if user.last_active else "N/A"
        created_at = user.created_at.strftime("%Y-%m-%d %H:%M:%S") if user.created_at else "N/A"
        return {"output": (
            f"═══ OPERATIVE PROFILE ═══\n"
            f"USERNAME:   {user.username}\n"
            f"ID:         {user.id}\n"
            f"EMAIL:      {user.email}\n"
            f"XP:         {user.points}\n"
            f"ACTIVE:     {user.is_active}\n"
            f"ADMIN:      {user.is_superuser}\n"
            f"LAST_IP:    {user.last_ip or 'N/A'}\n"
            f"LAST_SEEN:  {last_active}\n"
            f"CREATED:    {created_at}"
        )}

    # ── lockdown ──────────────────────────────────────────────────────
    elif cmd == "lockdown":
        if arg1.lower() not in ("on", "off"):
            return {"output": "USAGE: lockdown [on/off]"}
        enable = (arg1.lower() == "on")
        PLATFORM_CONFIG["maintenance_mode"] = enable
        state = "ENABLED" if enable else "DISABLED"
        add_audit_log(current_user.id, "LOCKDOWN", f"Admin set maintenance mode: {state}")
        return {"output": (
            f"LOCKDOWN {state}.\n"
            f"Maintenance mode is now {'ON — Non-admin users will see maintenance page.' if enable else 'OFF — Platform is fully accessible.'}"
        )}

    # ── labstats ──────────────────────────────────────────────────────
    elif cmd == "labstats":
        try:
            from app.core.sandbox import sandbox_manager
            active_labs = [(sid, lab) for sid, lab in sandbox_manager._labs.items() if lab.status == "online"]
            lines = [f"- Session: {sid[:8]}... | Challenge: {lab.challenge_id} | Status: {lab.status}" for sid, lab in active_labs]
            return {"output": (
                f"ACTIVE SANDBOX LABS: {len(active_labs)}/{len(CHALLENGE_REGISTRY)} available challenges\n" +
                ("\n".join(lines) if lines else "No active labs running.")
            )}
        except Exception as e:
            return {"output": f"DOCKER_UNAVAILABLE: No sandbox manager running.\nDefined labs: {len(CHALLENGE_REGISTRY)}"}

    # ── securityalerts ────────────────────────────────────────────────
    elif cmd == "securityalerts":
        keywords = ("BAN", "KICK", "DELETE", "LOCKDOWN", "RESET", "CLEAR", "KICK")
        all_entries = get_audit_logs(limit=200)
        security_events = [e for e in all_entries if any(k in (e.action or "") for k in keywords)]
        if not security_events:
            return {"output": "NO SECURITY EVENTS DETECTED.\nAll clear."}
        lines = [
            f"  [{e.timestamp.strftime('%Y-%m-%d %H:%M')}] {e.action:<22} {e.detail or ''}"
            for e in security_events[:15]
        ]
        return {"output": f"SECURITY EVENTS ({len(security_events)} total):\n" + "\n".join(lines)}

    # ── activeips ─────────────────────────────────────────────────────
    elif cmd == "activeips":
        from datetime import datetime as _dt, timedelta
        cutoff = _dt.utcnow() - timedelta(hours=24)
        active = db.query(User).filter(
            User.last_active >= cutoff,
            User.last_ip != None
        ).order_by(User.last_active.desc()).all()
        if not active:
            return {"output": "NO_ACTIVE_IPS: No users seen in the last 24 hours."}
        lines = [
            f"  {u.last_ip:<18} {u.username:<20} last={u.last_active.strftime('%Y-%m-%d %H:%M')}"
            for u in active
        ]
        return {"output": f"ACTIVE IPs — LAST 24H ({len(active)} operatives):\n" + "\n".join(lines)}

    # ── whois ─────────────────────────────────────────────────────────
    elif cmd == "whois":
        if not arg1:
            return {"output": "USAGE: whois [username]"}
        user = db.query(User).filter(User.username == arg1).first()
        if not user:
            return {"output": f"ERROR: User '{arg1}' not found."}
        last_active = user.last_active.strftime("%Y-%m-%d %H:%M:%S") if user.last_active else "N/A"
        created_at  = user.created_at.strftime("%Y-%m-%d %H:%M:%S")  if user.created_at  else "N/A"
        # pull audit history for this user
        user_logs = [l for l in AUDIT_LOGS if str(l.get("user_id")) == str(user.id)][:5]
        history_lines = "\n".join(
            f"    [{l['time']}] {l['action']}: {l['detail']}" for l in user_logs
        ) or "    No recorded admin actions."
        return {"output": (
            f"WHOIS: {user.username}\n"
            f"  ID:          {user.id}\n"
            f"  EMAIL:       {user.email}\n"
            f"  LAST_IP:     {user.last_ip or 'N/A'}\n"
            f"  LAST_SEEN:   {last_active}\n"
            f"  REGISTERED:  {created_at}\n"
            f"  XP:          {user.points}\n"
            f"  ACTIVE:      {user.is_active}\n"
            f"  ADMIN:       {user.is_superuser}\n"
            f"  AUDIT TRAIL:\n{history_lines}"
        )}

    # ── auditlog ──────────────────────────────────────────────────────
    elif cmd == "auditlog":
        n = 10
        try:
            n = int(arg1) if arg1 else 10
            n = min(max(n, 1), 50)
        except ValueError:
            return {"output": "USAGE: auditlog [n]  (n = number of entries, max 50)"}
        entries = get_audit_logs(limit=n)
        if not entries:
            return {"output": "AUDIT_LOG: Empty — no actions recorded yet."}
        lines = [
            f"  [{e.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] uid={e.user_id} | {e.action:<22} {e.detail or ''}"
            for e in entries
        ]
        return {"output": f"AUDIT LOG — LAST {len(entries)} ENTRIES:\n" + "\n".join(lines)}

    # ── announce ──────────────────────────────────────────────────────
    elif cmd == "announce":
        if not arg1:
            current = PLATFORM_CONFIG.get("global_announcement", "")
            return {"output": f"USAGE: announce [text] | announce clear\nCURRENT: {current}"}
        if arg1.lower() == "clear":
            PLATFORM_CONFIG["global_announcement"] = ""
            add_audit_log(current_user.id, "ANNOUNCE_CLEAR", "Global announcement cleared via OCC shell.")
            return {"output": "ANNOUNCEMENT CLEARED.\nBanner removed from all pages."}
        # arg1 + arg2 together form the full message
        message = (arg1 + (" " + arg2 if arg2 else "")).strip()
        PLATFORM_CONFIG["global_announcement"] = message
        add_audit_log(current_user.id, "ANNOUNCE_SET", f"Announcement set: {message}")
        return {"output": f"ANNOUNCEMENT SET:\n  \"{message}\"\nAll users will now see this banner."}

    # ── dbstats ───────────────────────────────────────────────────────
    elif cmd == "dbstats":
        import os
        from app.db.session import SessionLocal
        from app.models.user import AIMentorQuota, ChallengeAttempt

        user_count    = db.query(User).count()
        quota_count   = db.query(AIMentorQuota).count()
        attempt_count = db.query(ChallengeAttempt).count()
        audit_count   = len(AUDIT_LOGS)

        # Try to get DB file size (SQLite)
        try:
            from app.core.config import settings
            db_path = str(settings.DATABASE_URL).replace("sqlite:///", "")
            db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
            db_size_str = f"{db_size / 1024:.1f} KB"
        except Exception:
            db_size_str = "N/A"

        return {"output": (
            f"DATABASE STATISTICS:\n"
            f"  File Size:         {db_size_str}\n"
            f"  users:             {user_count} rows\n"
            f"  ai_mentor_quotas:  {quota_count} rows\n"
            f"  challenge_attempts:{attempt_count} rows\n"
            f"  audit_logs (mem):  {audit_count} entries"
        )}

    # ── sysinfo ───────────────────────────────────────────────────────
    elif cmd == "sysinfo":
        import sys, platform, fastapi
        boot_time = psutil.boot_time()
        uptime_sec = time.time() - boot_time
        h, rem = divmod(int(uptime_sec), 3600)
        m, s   = divmod(rem, 60)
        disk = psutil.disk_usage("/")
        return {"output": (
            f"SYSTEM INFORMATION:\n"
            f"  OS:          {platform.system()} {platform.release()} ({platform.machine()})\n"
            f"  Python:      {sys.version.split()[0]}\n"
            f"  FastAPI:     {fastapi.__version__}\n"
            f"  CPU Cores:   {psutil.cpu_count(logical=True)} logical / {psutil.cpu_count(logical=False)} physical\n"
            f"  RAM Total:   {psutil.virtual_memory().total // (1024**2)} MB\n"
            f"  Disk:        {disk.used // (1024**3)} GB used / {disk.total // (1024**3)} GB total\n"
            f"  Uptime:      {h}h {m}m {s}s"
        )}

    # ── clearaudit ────────────────────────────────────────────────────
    elif cmd == "clearaudit":
        from app.models.audit import AuditLog as AuditLogModel
        db_count = db.query(AuditLogModel).count()
        db.query(AuditLogModel).delete()
        db.commit()
        AUDIT_LOGS.clear()
        add_audit_log(current_user.id, "AUDIT_CLEAR", f"Admin cleared {db_count} DB audit entries via OCC shell.", username=current_user.username)
        return {"output": f"AUDIT LOG CLEARED.\n{db_count} entries deleted from database."}

    # ── unknown ───────────────────────────────────────────────────────
    else:
        return {"output": (
            f"UNKNOWN_CMD: '{cmd}'\n"
            f"Type 'help' for a full list of available commands."
        )}




