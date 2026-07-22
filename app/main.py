"""
Securithon Lab application factory.
"""
from __future__ import annotations

import asyncio
import logging
import os

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.v1.api import api_router
from app.api.v1.endpoints.admin.shared import PLATFORM_CONFIG
from app.core.config import settings
from app.db.migrations import run_db_migrations
from app.db.session import Base, SessionLocal, engine
from app.middleware.csrf import CSRFMiddleware
from app.models.user import AIMentorQuota, ChallengeAttempt, User  # noqa: F401 - register models
from app.models.audit import AuditLog  # noqa: F401 - register audit_logs table
from app.services.log_feed import LogManager, log_generator
from app.web.pages import create_pages_router

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_MAINTENANCE_EXEMPT = {"/admin", "/api/v1/admin", "/api/v1/system", "/static", "/favicon.ico", "/api/v1/users/me"}


def _create_templates() -> Jinja2Templates:
    templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
    templates.env.globals["url_static"] = lambda path: f"/static/{path}"
    return templates


def _enforce_admin_policy() -> None:
    """Ensure the built-in admin account remains active and superuser."""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if admin:
            admin.is_active = True
            admin.is_superuser = True
        db.commit()
        logger.info("Admin policy enforced: built-in admin confirmed.")
    except Exception as e:
        logger.error("Admin policy enforcement failed: %s", e)
        db.rollback()
    finally:
        db.close()


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url="/api/v1/openapi.json",
    )
    app.state.log_manager = LogManager()

    app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
    app.add_middleware(CSRFMiddleware)

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.middleware("http")
    async def maintenance_middleware(request: Request, call_next):
        if PLATFORM_CONFIG.get("maintenance_mode"):
            path = request.url.path
            if not any(path.startswith(p) for p in _MAINTENANCE_EXEMPT):
                return HTMLResponse(
                    content=(
                        "<body style='background:#05070a;color:#f85149;display:flex;align-items:center;"
                        "justify-content:center;height:100vh;font-family:sans-serif;'>"
                        "<div style='text-align:center;border:1px solid #f85149;padding:40px;"
                        "border-radius:10px;background:rgba(248,81,73,0.05);'>"
                        "<h1 style='letter-spacing:2px;'>CORE_UNDER_MAINTENANCE</h1>"
                        "<p style='color:#8b949e;'>The platform is currently offline for system optimization.</p>"
                        "<div style='margin-top:20px;font-size:0.8rem;opacity:0.5;'>SEC_ERR: OCC_OFFLINE_LOCK</div>"
                        "</div></body>"
                    ),
                    status_code=503,
                )
        return await call_next(request)

    app.include_router(api_router, prefix="/api/v1")
    app.include_router(create_pages_router(_create_templates()))

    @app.websocket("/ws/logs")
    async def websocket_logs(websocket: WebSocket):
        """Public non-sensitive simulated telemetry feed for UI panels."""
        log_manager: LogManager = websocket.app.state.log_manager
        try:
            await log_manager.connect(websocket)
            logger.info("WebSocket client connected to /ws/logs")
            try:
                while True:
                    try:
                        await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                    except asyncio.TimeoutError:
                        continue
            except WebSocketDisconnect:
                logger.info("WebSocket client disconnected from /ws/logs")
                log_manager.disconnect(websocket)
        except Exception as e:
            logger.error("WebSocket error: %s", e)
            log_manager.disconnect(websocket)

    @app.on_event("startup")
    async def startup_event() -> None:
        run_db_migrations(engine)
        _enforce_admin_policy()
        app.state.log_task = asyncio.create_task(log_generator(app.state.log_manager))
        try:
            from app.core.sandbox import sandbox_manager

            sandbox_manager.start_cleanup_worker()
            logger.info("Lab cleanup worker started.")
        except Exception as e:
            logger.warning("Lab cleanup worker could not start: %s", e)

        try:
            from app.api.v1.endpoints.infrasec import (
                warm_cisa_kev_cache,
                run_cisa_kev_weekly_refresh_worker,
                _CISA_KEV_REFRESH_MODE,
            )

            using_test_db = "test.db" in os.getenv("DATABASE_URL", "")
            if not using_test_db:
                await warm_cisa_kev_cache()
            if _CISA_KEV_REFRESH_MODE == "weekly" and not using_test_db:
                app.state.cisa_refresh_task = asyncio.create_task(run_cisa_kev_weekly_refresh_worker())
                logger.info("CISA KEV weekly refresh scheduler started.")
        except Exception as e:
            logger.warning("CISA KEV refresh worker could not start: %s", e)

    @app.on_event("shutdown")
    async def shutdown_event() -> None:
        cisa_task = getattr(app.state, "cisa_refresh_task", None)
        if cisa_task:
            cisa_task.cancel()
        log_task = getattr(app.state, "log_task", None)
        if log_task:
            log_task.cancel()
        try:
            from app.core.sandbox import sandbox_manager

            sandbox_manager.stop_cleanup_worker()
            sandbox_manager.cleanup_all()
            logger.info("Sandbox cleanup complete.")
        except Exception as e:
            logger.warning("Sandbox cleanup error: %s", e)

    return app


app = create_app()
