"""
Admin — User Management
Endpoints for listing, modifying, and deleting user accounts.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import schemas
from app.api import deps
from app.models.user import User
from app.api.v1.endpoints.admin.shared import get_current_admin_user, add_audit_log

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserResponse(schemas.user.User):
    id: int
    is_active: bool
    is_superuser: bool
    last_active: Any = None
    last_ip: Any = None


class ActionRequest(BaseModel):
    action: str


class BulkActionRequest(BaseModel):
    user_ids: list[int]
    action: str
    message: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_or_404(db: Session, user_id: int) -> User:
    """Fetch a user by ID or raise 404."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
def get_users(db: Session = Depends(deps.get_db)) -> list[UserResponse]:
    """Return all registered users."""
    users = db.query(User).all()
    logger.debug("Admin fetched user list (%d users)", len(users))
    return users


@router.post("/users/bulk-action")
def bulk_user_action(
    req: BulkActionRequest,
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Apply a bulk action (deactivate, activate, reset_xp, reset_password, broadcast) to multiple users."""
    if not req.user_ids:
        raise HTTPException(status_code=400, detail="No users selected")

    users = db.query(User).filter(User.id.in_(req.user_ids)).all()
    affected_count = 0

    if req.action == "deactivate":
        for u in users:
            if u.id != current_admin.id:
                u.is_active = False
                affected_count += 1
    elif req.action == "activate":
        for u in users:
            u.is_active = True
            affected_count += 1
    elif req.action == "reset_xp":
        for u in users:
            u.points = 0
            affected_count += 1
    elif req.action == "reset_password":
        from app.core.security import get_password_hash
        default_hash = get_password_hash("Securithon2026!")
        for u in users:
            u.hashed_password = default_hash
            affected_count += 1
    elif req.action == "broadcast":
        # Log notification / message broadcast
        affected_count = len(users)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid bulk action '{req.action}'")

    db.commit()
    msg = f"Bulk action '{req.action}' applied to {affected_count} operatives."
    add_audit_log(current_admin.id, "BULK_USER_ACTION", msg)
    logger.info("Admin %s executed bulk action %s on %d users", current_admin.username, req.action, affected_count)

    return {"status": "success", "affected": affected_count, "action": req.action}


@router.post("/users/{user_id}/action")
def user_action(
    user_id: int,
    action_req: ActionRequest,
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Apply a moderation action (promote / demote / reset_xp / ban) to a user."""
    user = _get_user_or_404(db, user_id)
    action = action_req.action

    action_map = {
        "promote":   lambda u: setattr(u, "is_superuser", True),
        "demote":    lambda u: setattr(u, "is_superuser", False),
        "reset_xp":  lambda u: setattr(u, "points", 0),
        "ban":       lambda u: setattr(u, "is_active", not u.is_active),
    }

    if action not in action_map:
        raise HTTPException(status_code=400, detail=f"Invalid action '{action}'")

    action_map[action](user)
    db.commit()
    db.refresh(user)

    add_audit_log(current_admin.id, f"USER_{action.upper()}", f"Applied '{action}' to {user.username} (ID: {user_id})")
    logger.info("Admin %s applied '%s' to user %s", current_admin.username, action, user.username)

    return {
        "status": "success",
        "user_id": user.id,
        "action": action,
        "is_active": user.is_active,
        "points": user.points,
        "is_superuser": user.is_superuser,
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Permanently delete a user account."""
    user = _get_user_or_404(db, user_id)

    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    username = user.username
    db.delete(user)
    db.commit()

    add_audit_log(current_admin.id, "USER_DELETE", f"Operative {username} (ID: {user_id}) permanently removed.")
    logger.info("Admin %s deleted user %s (ID: %d)", current_admin.username, username, user_id)

    return {"status": "success", "message": "User deleted successfully"}

