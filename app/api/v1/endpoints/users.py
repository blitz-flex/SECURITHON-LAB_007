"""
Users Router
Uses CRUDUser repository — no direct db.query() calls here.
MFA request/response schemas are defined locally (small, endpoint-specific models).
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import crud, schemas
from app.api import deps
from app.core.security import verify_totp, verify_password
from app.models.user import User
from app.services.tactical_stats_service import (
    compute_tactical_stats,
    leaderboard_lab_ids,
    solved_valid_count,
)

router = APIRouter()


# ── Local request schemas (endpoint-specific, not domain models) ─────────────

class MfaCodeVerify(BaseModel):
    code: str

class MfaToggle(BaseModel):
    enabled: bool

class NotificationPreferences(BaseModel):
    email_security: bool
    email_labs: bool
    email_rank: bool
    email_ai_quota: bool
    in_app_alerts: bool


class LabProgressSync(BaseModel):
    solved_ids: list[str] = []


# ── Profile ──────────────────────────────────────────────────────────────────

@router.get("/me", response_model=schemas.user.User)
def read_user_me(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Return the currently authenticated user's profile."""
    return current_user


@router.get("/me/tactical-stats", response_model=dict)
def read_tactical_stats(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Dashboard Tactical Status: lab completion, MFA health, skill matrix."""
    return compute_tactical_stats(current_user)


@router.get("/leaderboard", response_model=dict)
def read_leaderboard(
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Global leaderboard ranked by real XP, with the caller's own row attached."""
    limit = max(1, min(limit, 200))
    players = crud.user.get_leaderboard(db)
    lab_ids = leaderboard_lab_ids()
    total_labs = len(lab_ids)

    def _rank_delta(user: User, rank: int) -> int | None:
        previous_rank = user.leaderboard_previous_rank
        current_rank = user.leaderboard_current_rank
        if current_rank is None or previous_rank is None:
            return None
        return previous_rank - current_rank

    for rank, user in enumerate(players, start=1):
        if user.leaderboard_current_rank is None:
            user.leaderboard_current_rank = rank
            user.leaderboard_previous_rank = rank
        elif user.leaderboard_current_rank != rank:
            user.leaderboard_previous_rank = user.leaderboard_current_rank
            user.leaderboard_current_rank = rank
        db.add(user)
    db.commit()

    def _row(rank: int, user: User) -> dict:
        solved = solved_valid_count(user, lab_ids)
        points = int(user.points or 0)
        security = round((solved / total_labs) * 100) if total_labs else 0
        efficiency_count = user.leaderboard_efficiency_count or 0
        clean_code_count = user.leaderboard_clean_code_count or 0
        efficiency = (
            round((user.leaderboard_efficiency_total or 0) / efficiency_count)
            if efficiency_count
            else None
        )
        clean_code = (
            round((user.leaderboard_clean_code_total or 0) / clean_code_count)
            if clean_code_count
            else None
        )
        return {
            "rank": rank,
            "username": user.username,
            "full_name": user.full_name or user.username,
            "points": points,
            "labs_solved": solved,
            "labs_total": total_labs,
            "security": security,
            "efficiency": efficiency,
            "clean_code": clean_code,
            "total": points,
            "delta": _rank_delta(user, rank),
            "is_me": user.id == current_user.id,
        }

    rows = [_row(idx + 1, user) for idx, user in enumerate(players)]
    me = next((row for row in rows if row["is_me"]), None)

    return {
        "total_players": len(rows),
        "labs_total": total_labs,
        "top": rows[:limit],
        "me": me,
    }


@router.post("/me/lab-progress/sync", response_model=dict)
def sync_lab_progress(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    body: LabProgressSync,
) -> Any:
    """Return server-authoritative progress without trusting client-side solved ids."""
    return compute_tactical_stats(current_user)


@router.put("/me", response_model=schemas.user.User)
def update_user_me(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    user_in: schemas.user.UserProfileUpdate,
) -> Any:
    """Update display name, email, and/or password for the current user."""
    if user_in.email and user_in.email != current_user.email:
        existing = crud.user.get_by_email(db, email=user_in.email)
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=400,
                detail="EMAIL_ALREADY_REGISTERED",
            )

    if user_in.password:
        if not user_in.current_password or not verify_password(
            user_in.current_password, current_user.hashed_password
        ):
            raise HTTPException(
                status_code=400,
                detail="INCORRECT_CURRENT_PASSWORD",
            )
    return crud.user.update_profile(db, db_user=current_user, obj_in=user_in)





# ── MFA Setup ────────────────────────────────────────────────────────────────

@router.get("/me/mfa-setup", response_model=dict)
def mfa_setup(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Ensure an MFA secret exists for the user, generate current OTP, and send it to user's Email."""
    from app.core.email import send_email_otp
    from app.core.security import get_current_totp_code

    db_user = crud.user.ensure_mfa_secret(db, db_user=current_user)
    current_code = get_current_totp_code(db_user.mfa_secret)
    send_email_otp(db_user.email, current_code)

    return {
        "status": "otp_sent",
        "message": f"Verification code sent to {db_user.email}",
    }



# ── MFA Verify ───────────────────────────────────────────────────────────────

@router.post("/me/mfa-verify", response_model=dict)
def mfa_verify(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    verify_in: MfaCodeVerify,
) -> Any:
    """Verify a TOTP code and permanently enable MFA for the account."""
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA setup has not been initiated")

    if not verify_totp(current_user.mfa_secret, verify_in.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    crud.user.enable_mfa(db, db_user=current_user)
    return {"status": "success", "message": "MFA enabled successfully"}


# ── MFA Toggle ───────────────────────────────────────────────────────────────

@router.put("/me/mfa-email", response_model=dict)
def toggle_mfa(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    mfa_in: MfaToggle,
) -> Any:
    """Enable or disable MFA for the current user."""
    crud.user.set_mfa_enabled(db, db_user=current_user, enabled=mfa_in.enabled)
    status_str = "enabled" if mfa_in.enabled else "disabled"
    return {"status": "success", "message": f"MFA {status_str} successfully."}


@router.post("/me/deduct-points", response_model=dict)
def deduct_points(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    amount: int,
) -> Any:
    """Deduct points from the current user's balance."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    if (current_user.points or 0) < amount:
        raise HTTPException(status_code=400, detail="Insufficient points")
    new_points = max(0, (current_user.points or 0) - amount)
    crud.user.update_points(db, db_user=current_user, points=new_points)
    return {"status": "success", "points": new_points}


@router.get("/me/notifications", response_model=NotificationPreferences)
def get_notifications(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Fetch current notification preferences."""
    import json
    prefs_str = current_user.notification_preferences or '{"email_security": true, "email_labs": true, "email_rank": true, "email_ai_quota": true, "in_app_alerts": true}'
    return json.loads(prefs_str)


@router.patch("/me/notifications", response_model=NotificationPreferences)
def update_notifications(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    prefs_in: NotificationPreferences,
) -> Any:
    """Update notification preferences."""
    import json
    prefs_dict = prefs_in.dict()
    current_user.notification_preferences = json.dumps(prefs_dict)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return prefs_dict

