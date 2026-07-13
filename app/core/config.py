"""
Central Configuration Module
All settings are loaded from environment variables (.env).
Single source of truth for the entire application.
"""
import os

# Load .env file if it exists (lightweight, no external dependency)
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
if os.path.exists(_env_path):
    with open(_env_path, "r") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _val = _line.split("=", 1)
                os.environ.setdefault(_key.strip(), _val.strip())


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in ("true", "1", "yes", "on")


class Settings:
    # ── Application ────────────────────────────────────────────
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Securithon Lab")
    VERSION: str      = os.getenv("APP_VERSION",  "2.0.2")

    # ── Security / JWT ─────────────────────────────────────────
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str              = os.getenv("ALGORITHM",  "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    def __init__(self):
        # Validate SECRET_KEY on initialization
        if not self.SECRET_KEY or self.SECRET_KEY == "securithon-lab-top-secret-key-change-this":
            raise ValueError(
                "SECURITY ERROR: SECRET_KEY must be set to a secure random value. "
                "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )

    # ── SMTP (Email OTP) ───────────────────────────────────────
    SMTP_HOST: str        = os.getenv("SMTP_HOST",        "smtp.gmail.com")
    SMTP_PORT: int        = int(os.getenv("SMTP_PORT",    "587"))
    SMTP_USER: str | None = os.getenv("SMTP_USER")
    SMTP_PASSWORD: str | None = os.getenv("SMTP_PASSWORD")
    SMTP_SENDER_NAME: str = os.getenv("SMTP_SENDER_NAME", "Securithon Lab")

    # ── Dev Settings / Fallbacks ────────────────────────────────
    DEV_MODE: bool = os.getenv("DEV_MODE", "false").lower() in ("true", "1", "yes")
    COOKIE_SECURE: bool = _env_bool("COOKIE_SECURE", not DEV_MODE)
    ARENA_VERIFIER_BACKEND: str = os.getenv("ARENA_VERIFIER_BACKEND", "docker").lower()
    ARENA_VERIFIER_IMAGE: str = os.getenv("ARENA_VERIFIER_IMAGE", "python:3.12-alpine")

    # ── AI Assistant ───────────────────────────────────────────
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")

settings = Settings()
