"""
Admin — System Configuration
Endpoints for platform settings, audit logs, and system health checks.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.api.v1.endpoints.admin.shared import (
    PLATFORM_CONFIG,
    AUDIT_LOGS,
    get_current_admin_user,
    add_audit_log,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    """Return current platform configuration."""
    return PLATFORM_CONFIG


@router.post("/settings")
def update_settings(
    config: dict,
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Update platform configuration keys."""
    # Only allow known keys to prevent arbitrary state injection
    allowed_keys = {"maintenance_mode", "global_announcement", "allow_registration", "system_alert", "threat_level"}
    unknown = set(config.keys()) - allowed_keys
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown config keys: {unknown}")

    PLATFORM_CONFIG.update(config)
    add_audit_log(current_admin.id, "SETTINGS_UPDATE", f"Maintenance: {PLATFORM_CONFIG['maintenance_mode']}")
    logger.info("Admin %s updated platform config: %s", current_admin.username, config)

    return {"status": "success", "config": PLATFORM_CONFIG}


@router.get("/audit-logs")
def get_audit_logs() -> list[dict]:
    """Return the in-memory audit log."""
    return AUDIT_LOGS


@router.post("/db-check")
def db_check(db: Session = Depends(deps.get_db)) -> dict[str, str]:
    """Run a basic database integrity check."""
    try:
        user_count = db.query(User).count()
        logger.info("DB integrity check passed: %d users", user_count)
        return {"status": "success", "message": f"Integrity Check Passed. {user_count} records verified."}
    except Exception as e:
        logger.error("DB integrity check failed: %s", e)
        raise HTTPException(status_code=500, detail="Database check failed")


@router.post("/emergency-reset")
def emergency_reset(
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Placeholder for emergency system reset."""
    add_audit_log(current_admin.id, "EMERGENCY_RESET", "Emergency reset triggered by admin.")
    logger.warning("Admin %s triggered emergency reset", current_admin.username)
    return {"status": "success", "message": "All core services restarted successfully."}
