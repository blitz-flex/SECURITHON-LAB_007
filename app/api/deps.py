"""
FastAPI Dependency Injection helpers.
Uses CRUDUser repository for user look-ups — no raw db.query() here.
"""
from typing import Generator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, SecurityScopes
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User

reusable_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/access-token")


# ── Database session ─────────────────────────────────────────────────────────

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Current user ─────────────────────────────────────────────────────────────

def authenticate_token(
    db: Session,
    *,
    token: str,
    authenticate_value: str = "Bearer",
) -> tuple[User, list[str]]:
    """Decode a JWT and return the matching active user plus token scopes."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": authenticate_value},
            )
        token_scopes: list[str] = payload.get("scopes", [])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": authenticate_value},
        )

    from app.crud import user as user_crud  # local import avoids circular imports
    db_user = user_crud.get_by_username(db, username=username)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not db_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return db_user, token_scopes


def get_current_user(
    request: Request,
    security_scopes: SecurityScopes,
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2),
) -> User:
    """
    Decode the JWT, resolve the user via the CRUD layer, enforce scope checks,
    and update activity metadata — all in one reusable dependency.
    """
    authenticate_value = (
        f'Bearer scope="{security_scopes.scope_str}"'
        if security_scopes.scopes
        else "Bearer"
    )

    from app.crud import user as user_crud  # local import avoids circular imports
    db_user, token_scopes = authenticate_token(
        db,
        token=token,
        authenticate_value=authenticate_value,
    )

    # ── Scope enforcement ────────────────────────────────────────────────────
    for scope in security_scopes.scopes:
        if scope == "admin" and db_user.is_superuser:
            continue
        if scope not in token_scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
                headers={"WWW-Authenticate": authenticate_value},
            )

    # ── Activity tracking via repository ─────────────────────────────────────
    client_ip = request.client.host if request.client else "127.0.0.1"
    db_user = user_crud.touch(db, db_user=db_user, ip=client_ip)

    return db_user
