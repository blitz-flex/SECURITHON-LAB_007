from __future__ import annotations

import getpass
import os
import socket

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.api import deps
from app.core.config import settings
from app.db.session import SessionLocal


def _render(templates: Jinja2Templates, template: str, request: Request, **ctx) -> HTMLResponse:
    return templates.TemplateResponse(template, {"request": request, "version": settings.VERSION, **ctx})


def _request_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return request.cookies.get("access_token")


def _admin_page_guard(request: Request) -> HTMLResponse | RedirectResponse | None:
    token = _request_bearer_token(request)
    if not token:
        return RedirectResponse(url="/login", status_code=303)

    override_get_db = request.app.dependency_overrides.get(deps.get_db)
    db_source = override_get_db() if override_get_db else None
    db = next(db_source) if db_source else SessionLocal()
    try:
        user, _scopes = deps.authenticate_token(db, token=token)
        if not user.is_superuser:
            return HTMLResponse("Admin access required.", status_code=403)
    except HTTPException as exc:
        if exc.status_code == 401:
            return RedirectResponse(url="/login", status_code=303)
        return HTMLResponse("Admin access required.", status_code=403)
    finally:
        if db_source:
            try:
                next(db_source)
            except StopIteration:
                pass
        else:
            db.close()
    return None


def create_pages_router(templates: Jinja2Templates) -> APIRouter:
    router = APIRouter()

    def render_admin(request: Request, active_admin_tab: str) -> HTMLResponse | RedirectResponse:
        denial = _admin_page_guard(request)
        if denial is not None:
            return denial
        return _render(templates, "pages/admin.html", request, active_page="admin", active_admin_tab=active_admin_tab)

    @router.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        return _render(templates, "pages/index.html", request)

    @router.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request):
        return _render(templates, "pages/login.html", request)

    @router.get("/register", response_class=HTMLResponse)
    async def register_page(request: Request):
        return _render(templates, "pages/register.html", request)

    @router.get("/dashboard", response_class=HTMLResponse)
    async def dashboard_page(request: Request):
        return _render(templates, "pages/dashboard.html", request, active_page="dashboard")

    @router.get("/arena", response_class=HTMLResponse)
    async def arena_page(request: Request):
        return _render(
            templates,
            "pages/arena.html",
            request,
            active_page="arena",
            active_track="infrasec",
            sys_user=getpass.getuser(),
            sys_host=socket.gethostname(),
            sys_shell=os.environ.get("SHELL", "/bin/bash").split("/")[-1],
        )

    @router.get("/appsec", response_class=HTMLResponse)
    async def appsec_page(request: Request):
        return _render(
            templates,
            "pages/arena.html",
            request,
            active_page="arena",
            active_track="appsec",
            sys_user=getpass.getuser(),
            sys_host=socket.gethostname(),
            sys_shell=os.environ.get("SHELL", "/bin/bash").split("/")[-1],
        )

    @router.get("/leaderboard", response_class=HTMLResponse)
    async def leaderboard_page(request: Request):
        return _render(templates, "pages/leaderboard.html", request, active_page="leaderboard")

    @router.get("/archive", response_class=HTMLResponse)
    async def archive_page(request: Request):
        return _render(templates, "pages/archive.html", request, active_page="archive")

    @router.get("/settings", response_class=HTMLResponse)
    async def settings_page(request: Request):
        return RedirectResponse(url="/settings/profile", status_code=307)

    @router.get("/settings/profile", response_class=HTMLResponse)
    async def settings_profile_page(request: Request):
        return _render(templates, "pages/settings.html", request, active_page="settings", active_settings_tab="profile")

    @router.get("/settings/security", response_class=HTMLResponse)
    async def settings_security_page(request: Request):
        return _render(templates, "pages/settings.html", request, active_page="settings", active_settings_tab="security")

    @router.get("/settings/editor", response_class=HTMLResponse)
    async def settings_editor_page(request: Request):
        return _render(templates, "pages/settings.html", request, active_page="settings", active_settings_tab="editor")

    @router.get("/settings/terminal", response_class=HTMLResponse)
    async def settings_terminal_page(request: Request):
        return _render(templates, "pages/settings.html", request, active_page="settings", active_settings_tab="terminal")

    @router.get("/settings/developer", response_class=HTMLResponse)
    async def settings_developer_page(request: Request):
        return RedirectResponse(url="/settings/profile", status_code=307)

    @router.get("/tracks", response_class=HTMLResponse)
    async def tracks_page(request: Request):
        return _render(templates, "pages/tracks.html", request, active_page="tracks")

    @router.get("/admin", response_class=HTMLResponse)
    async def admin_page(request: Request):
        return render_admin(request, "overview")

    @router.get("/admin/overview", response_class=HTMLResponse)
    async def admin_overview_page(request: Request):
        return render_admin(request, "overview")

    @router.get("/admin/fleet", response_class=HTMLResponse)
    async def admin_fleet_page(request: Request):
        return render_admin(request, "fleet")

    @router.get("/admin/intelligence", response_class=HTMLResponse)
    async def admin_intelligence_page(request: Request):
        return render_admin(request, "intelligence")

    @router.get("/admin/infra", response_class=HTMLResponse)
    async def admin_infra_page(request: Request):
        return render_admin(request, "infra")

    @router.get("/admin/curriculum", response_class=HTMLResponse)
    async def admin_curriculum_page(request: Request):
        return render_admin(request, "curriculum")

    @router.get("/admin/logs", response_class=HTMLResponse)
    async def admin_logs_page(request: Request):
        return render_admin(request, "logs")

    @router.get("/admin/settings", response_class=HTMLResponse)
    async def admin_settings_page(request: Request):
        return render_admin(request, "settings")

    @router.get("/health")
    async def health_check() -> dict:
        return {"status": "ok"}

    return router
