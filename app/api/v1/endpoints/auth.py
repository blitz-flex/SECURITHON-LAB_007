"""
Authentication Router
Uses CRUDUser repository — no direct db.query() calls here.
"""
from datetime import timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import crud, schemas
from app.api import deps
from app.core import security
from app.core.config import settings
from app.db.session import get_db

router = APIRouter()


@router.post("/register", response_model=schemas.user.User)
def register(user_in: schemas.user.UserCreate, db: Session = Depends(get_db)) -> Any:
    """Register a new user account."""
    existing = crud.user.get_by_username_or_email(
        db, username=user_in.username, email=user_in.email
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="User with this username or email already exists.",
        )
    return crud.user.create(db, obj_in=user_in)


@router.post("/login/access-token", response_model=schemas.token.Token)
def login_access_token(
    response: Response,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
    x_mfa_code: Optional[str] = Header(None, alias="X-MFA-Code"),
) -> Any:
    """Authenticate and return a JWT access token."""
    db_user = crud.user.get_by_username(db, username=form_data.username)

    if not db_user or not security.verify_password(form_data.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    # Auto-activate admin / superuser accounts if they were deactivated
    if not db_user.is_active:
        if db_user.username == "admin" or db_user.is_superuser:
            crud.user.activate(db, db_user=db_user)
        else:
            raise HTTPException(status_code=400, detail="Inactive user")

    # -- TOTP MFA Logic --------------------------------
    if db_user.is_mfa_enabled:
        from app.core.email import send_email_otp

        if not x_mfa_code:
            current_code = (
                security.get_current_totp_code(db_user.mfa_secret)
                if db_user.mfa_secret
                else "000000"
            )
            send_email_otp(db_user.email, current_code)
            raise HTTPException(
                status_code=400, detail="MFA_REQUIRED"
            )

        if not db_user.mfa_secret or not security.verify_totp(db_user.mfa_secret, x_mfa_code):
            current_code = (
                security.get_current_totp_code(db_user.mfa_secret)
                if db_user.mfa_secret
                else "000000"
            )
            send_email_otp(db_user.email, current_code)
            raise HTTPException(
                status_code=400, detail="INVALID_MFA_CODE"
            )


    # -- Token Generation -----------------------------------------------------
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        db_user.username, expires_delta=access_token_expires
    )
    cookie_secure = settings.COOKIE_SECURE
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=schemas.token.Token)
def refresh_access_token(
    current_user=Depends(deps.get_current_user),
) -> Any:
    """Issue a fresh access token for an already authenticated active session."""
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            current_user.username, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }


# ── Password Reset Endpoints ──────────────────────────────────────────────────

@router.post("/password-reset/request", response_model=dict)
def request_password_reset(
    *,
    db: Session = Depends(deps.get_db),
    account_in: dict,
) -> Any:
    """Send OTP code for password reset to user's registered Email."""
    from app.core.email import send_email_otp

    account = (account_in.get("account") or "").strip()
    if not account:
        raise HTTPException(status_code=400, detail="ACCOUNT_REQUIRED")

    db_user = crud.user.get_by_username(db, username=account)
    if not db_user:
        db_user = crud.user.get_by_email(db, email=account)

    if not db_user:
        # Prevent account enumeration: return success message even if not found
        return {"status": "otp_sent", "message": "If an account exists, OTP was sent."}

    crud.user.ensure_mfa_secret(db, db_user=db_user)
    otp_code = security.get_current_totp_code(db_user.mfa_secret)
    send_email_otp(db_user.email, otp_code)

    return {"status": "otp_sent", "message": "Verification code sent to your Email."}


@router.post("/password-reset/confirm", response_model=dict)
def confirm_password_reset(
    *,
    db: Session = Depends(deps.get_db),
    reset_in: dict,
) -> Any:
    """Verify OTP code and reset password for the account."""
    account = (reset_in.get("account") or "").strip()
    otp_code = (reset_in.get("code") or "").strip()
    new_password = (reset_in.get("new_password") or "").strip()

    if not account or not otp_code or not new_password:
        raise HTTPException(status_code=400, detail="ALL_FIELDS_REQUIRED")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="PASSWORD_TOO_SHORT")

    db_user = crud.user.get_by_username(db, username=account)
    if not db_user:
        db_user = crud.user.get_by_email(db, email=account)

    if not db_user or not db_user.mfa_secret:
        raise HTTPException(status_code=400, detail="INVALID_OTP_CODE")

    if not security.verify_totp(db_user.mfa_secret, otp_code):
        raise HTTPException(status_code=400, detail="INVALID_OTP_CODE")

    # Update password
    hashed_password = security.get_password_hash(new_password)
    db_user.hashed_password = hashed_password
    db.add(db_user)
    db.commit()

    return {"status": "success", "message": "Password reset successfully. You can now login."}

