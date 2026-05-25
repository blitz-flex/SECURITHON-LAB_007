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
from app.core.security import verify_totp, get_current_totp_code
from app.models.user import User

router = APIRouter()


# ── Local request schemas (endpoint-specific, not domain models) ─────────────

class MfaCodeVerify(BaseModel):
    code: str

class MfaToggle(BaseModel):
    enabled: bool


# ── Profile ──────────────────────────────────────────────────────────────────

@router.get("/me", response_model=schemas.user.User)
def read_user_me(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Return the currently authenticated user's profile."""
    return current_user


@router.put("/me", response_model=schemas.user.User)
def update_user_me(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    user_in: schemas.user.UserProfileUpdate,
) -> Any:
    """Update display name and/or password for the current user."""
    return crud.user.update_profile(db, db_user=current_user, obj_in=user_in)




# ── MFA Setup ────────────────────────────────────────────────────────────────

@router.get("/me/mfa-setup", response_model=dict)
def mfa_setup(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Ensure a TOTP secret exists for the user, then return:
      - secret     : raw base-32 secret (for manual entry)
      - otpauth_url: URI used to generate the QR code
      - current_code: live TOTP value (dev/sandbox convenience only)
    """
    db_user = crud.user.ensure_mfa_secret(db, db_user=current_user)
    otpauth_url = crud.user.build_otpauth_url(db_user)
    current_code = get_current_totp_code(db_user.mfa_secret)

    return {
        "secret": db_user.mfa_secret,
        "otpauth_url": otpauth_url,
        "current_code": current_code,
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
