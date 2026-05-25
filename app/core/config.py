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


class Settings:
    # ── Application ────────────────────────────────────────────
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Securithon Lab")
    VERSION: str      = os.getenv("APP_VERSION",  "2.0.2")

    # ── Security / JWT ─────────────────────────────────────────
    SECRET_KEY: str             = os.getenv("SECRET_KEY", "securithon-lab-top-secret-key-change-this")
    ALGORITHM: str              = os.getenv("ALGORITHM",  "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    # ── SMTP (Email OTP) ───────────────────────────────────────
    SMTP_HOST: str        = os.getenv("SMTP_HOST",        "smtp.gmail.com")
    SMTP_PORT: int        = int(os.getenv("SMTP_PORT",    "587"))
    SMTP_USER: str | None = os.getenv("SMTP_USER")
    SMTP_PASSWORD: str | None = os.getenv("SMTP_PASSWORD")
    SMTP_SENDER_NAME: str = os.getenv("SMTP_SENDER_NAME", "Securithon Lab")

    # ── Dev Settings / Fallbacks ────────────────────────────────
    DEV_MODE: bool = os.getenv("DEV_MODE", "false").lower() in ("true", "1", "yes")

settings = Settings()
