"""Admin sub-package — exposes a single combined router."""
from fastapi import APIRouter, Depends

from app.api.v1.endpoints.admin.shared import get_current_admin_user
from app.api.v1.endpoints.admin import users, curriculum, analytics, sessions, system

# All admin routes require superuser authentication
_admin_dep = [Depends(get_current_admin_user)]

router = APIRouter()
router.include_router(users.router,      dependencies=_admin_dep)
router.include_router(curriculum.router, dependencies=_admin_dep)
router.include_router(analytics.router,  dependencies=_admin_dep)
router.include_router(sessions.router,   dependencies=_admin_dep)
router.include_router(system.router,     dependencies=_admin_dep)
