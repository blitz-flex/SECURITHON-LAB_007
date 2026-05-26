"""
Admin — Session Management
Endpoints for viewing active sessions and kicking users.
"""
import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.api.v1.endpoints.admin.shared import get_current_admin_user, add_audit_log

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/sessions")
def get_sessions(db: Session = Depends(deps.get_db)) -> list[dict[str, Any]]:
    """Return users who were active in the last 30 minutes."""
    cutoff = datetime.utcnow() - timedelta(minutes=30)
    users = db.query(User).filter(User.last_active >= cutoff).all()

    five_mins_ago = datetime.utcnow() - timedelta(minutes=5)
    return [
        {
            "id": u.id,
            "username": u.username,
            "ip": u.last_ip or "0.0.0.0",
            "activity": "Active in Dashboard" if u.last_active > five_mins_ago else "Idle",
            "last_active": u.last_active.strftime("%H:%M:%S"),
        }
        for u in users
    ]


@router.post("/sessions/{user_id}/kick")
def kick_session(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Deactivate a user account to immediately terminate their session."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    db.commit()

    add_audit_log(current_admin.id, "SESSION_KICK", f"User {user.username} (ID: {user_id}) kicked and deactivated.")
    logger.info("Admin %s kicked user %s (ID: %d)", current_admin.username, user.username, user_id)

    return {"status": "success", "message": f"User {user.username} has been kicked and account deactivated."}


@router.post("/sessions/kick-all")
def kick_all_sessions(
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Deactivate all user accounts except the current admin."""
    users = db.query(User).filter(User.id != current_admin.id).all()
    for user in users:
        user.is_active = False
    db.commit()

    add_audit_log(current_admin.id, "MASS_SESSION_KICK", f"Emergency protocol: {len(users)} operatives disconnected.")
    logger.warning("Admin %s executed mass session kick (%d users)", current_admin.username, len(users))

    return {"status": "success", "message": f"Successfully terminated {len(users)} sessions."}
