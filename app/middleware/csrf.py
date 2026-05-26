"""
CSRF Protection Middleware
Protects against Cross-Site Request Forgery attacks on state-changing operations.
"""
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from app.core.config import settings

# CSRF token serializer
csrf_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="csrf-token")

# Methods that require CSRF protection
CSRF_PROTECTED_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

# Paths that are exempt from CSRF (e.g., API login endpoints)
CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login/access-token",
    "/api/v1/auth/register",
}

# Path prefixes that are exempt from CSRF
CSRF_EXEMPT_PREFIXES = {
    "/api/v1/users/me",  # User profile endpoints
    "/api/v1/system/",   # System status endpoints
    "/api/v1/lab/",      # Lab endpoints
}


def generate_csrf_token() -> str:
    """Generate a new CSRF token."""
    return csrf_serializer.dumps("csrf-protection")


def validate_csrf_token(token: str, max_age: int = 3600) -> bool:
    """
    Validate a CSRF token.
    
    Args:
        token: The CSRF token to validate
        max_age: Maximum age of token in seconds (default 1 hour)
        
    Returns:
        True if valid, False otherwise
    """
    try:
        csrf_serializer.loads(token, max_age=max_age)
        return True
    except (BadSignature, SignatureExpired):
        return False


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce CSRF protection on state-changing requests.
    
    For protected methods (POST, PUT, DELETE, PATCH), requires either:
    - X-CSRF-Token header
    - csrf_token form field
    """
    
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for safe methods
        if request.method not in CSRF_PROTECTED_METHODS:
            return await call_next(request)

        path = request.url.path

        # Skip exempt paths and prefixes
        if path in CSRF_EXEMPT_PATHS:
            return await call_next(request)
        for prefix in CSRF_EXEMPT_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # Skip WebSocket upgrades
        if request.headers.get("upgrade") == "websocket":
            return await call_next(request)

        # Skip if request carries a Bearer token (API clients authenticate via JWT)
        if request.headers.get("Authorization", "").startswith("Bearer "):
            return await call_next(request)

        # Extract CSRF token from header or form
        csrf_token = request.headers.get("X-CSRF-Token")
        if not csrf_token and request.headers.get("content-type", "").startswith("application/x-www-form-urlencoded"):
            try:
                form = await request.form()
                csrf_token = form.get("csrf_token")
            except Exception:
                pass

        if not csrf_token or not validate_csrf_token(csrf_token):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing or invalid. Please refresh the page and try again."},
            )

        return await call_next(request)
