from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, system, arena, infrasec, terminal, lab, ai
from app.api.v1.endpoints.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(auth.router,      prefix="/auth",     tags=["auth"])
api_router.include_router(users.router,     prefix="/users",    tags=["users"])
api_router.include_router(system.router,    prefix="/system",   tags=["system"])
api_router.include_router(arena.router,     prefix="/arena",    tags=["arena"])
api_router.include_router(infrasec.router,  prefix="/infrasec", tags=["infrasec"])
api_router.include_router(admin_router,     prefix="/admin",    tags=["admin"])
api_router.include_router(terminal.router,  prefix="/terminal", tags=["terminal"])
api_router.include_router(lab.router,       prefix="/lab",      tags=["lab"])
api_router.include_router(ai.router,        prefix="/ai",       tags=["ai"])
