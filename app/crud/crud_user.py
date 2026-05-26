"""
CRUD / Repository Layer — User
All database interactions for the User model live here.
Endpoints must NOT call db.query(User) directly — use this module instead.
"""
from typing import Optional
import secrets

from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserCreate, UserProfileUpdate
from app.core.security import get_password_hash, verify_totp, get_current_totp_code


class CRUDUser:
    # ── Read ────────────────────────────────────────────────────────────────

    def get(self, db: Session, user_id: int) -> Optional[User]:
        """Fetch a user by primary key."""
        return db.query(User).filter(User.id == user_id).first()

    def get_by_username(self, db: Session, username: str) -> Optional[User]:
        """Fetch a user by username (case-sensitive)."""
        return db.query(User).filter(User.username == username).first()

    def get_by_email(self, db: Session, email: str) -> Optional[User]:
        """Fetch a user by email address."""
        return db.query(User).filter(User.email == email).first()

    def get_by_username_or_email(self, db: Session, username: str, email: str) -> Optional[User]:
        """Check whether a username OR email is already taken (used during registration)."""
        return (
            db.query(User)
            .filter((User.username == username) | (User.email == email))
            .first()
        )

    # ── Create ──────────────────────────────────────────────────────────────

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        """Create a new user with a bcrypt-hashed password."""
        db_user = User(
            username=obj_in.username,
            email=obj_in.email,
            full_name=obj_in.full_name,
            hashed_password=get_password_hash(obj_in.password),
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    # ── Update — Profile ─────────────────────────────────────────────────────

    def update_profile(self, db: Session, *, db_user: User, obj_in: UserProfileUpdate) -> User:
        """Update display name and/or password."""
        if obj_in.full_name is not None:
            db_user.full_name = obj_in.full_name
        if obj_in.password is not None:
            db_user.hashed_password = get_password_hash(obj_in.password)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    # ── Update — Points ──────────────────────────────────────────────────────

    def update_points(self, db: Session, *, db_user: User, points: int) -> User:
        """Overwrite the user's point total."""
        db_user = db.merge(db_user)
        db_user.points = points
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    # ── MFA — Setup ──────────────────────────────────────────────────────────

    def ensure_mfa_secret(self, db: Session, *, db_user: User) -> User:
        """Generate and persist a TOTP secret if the user doesn't have one yet."""
        if not db_user.mfa_secret:
            chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
            db_user.mfa_secret = "".join(secrets.choice(chars) for _ in range(16))
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
        return db_user

    def build_otpauth_url(self, db_user: User) -> str:
        """Build the otpauth:// URI for QR-code generation."""
        return (
            f"otpauth://totp/SecurithonLab:{db_user.username}"
            f"?secret={db_user.mfa_secret}&issuer=SecurithonLab&digits=6"
        )

    # ── MFA — Enable / Disable ───────────────────────────────────────────────

    def enable_mfa(self, db: Session, *, db_user: User) -> User:
        """Mark MFA as enabled after successful TOTP verification."""
        db_user.is_mfa_enabled = True
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    def set_mfa_enabled(self, db: Session, *, db_user: User, enabled: bool) -> User:
        """Toggle MFA on or off."""
        db_user.is_mfa_enabled = enabled
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    # ── Activity Tracking ────────────────────────────────────────────────────

    def touch(self, db: Session, *, db_user: User, ip: str) -> User:
        """Update last_active timestamp and last known IP address."""
        from datetime import datetime
        db_user.last_active = datetime.utcnow()
        db_user.last_ip = ip
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    # ── Admin: activate user ─────────────────────────────────────────────────

    def activate(self, db: Session, *, db_user: User) -> User:
        """Force-activate a user account (used for admin/superuser recovery)."""
        db_user.is_active = True
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user


# Singleton instance — import as `from app.crud import user`
user = CRUDUser()
