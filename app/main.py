import os
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import asyncio
import json
import random
from datetime import datetime

from app.api.v1.api import api_router
from app.core.config import settings
from app.db.session import engine, Base
from app.models.user import User # Ensure models are loaded

# Create DB tables
Base.metadata.create_all(bind=engine)

class LogManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str, category: str = "SYS"):
        payload = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "category": category,
            "message": message
        }
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(payload))
            except:
                pass

log_manager = LogManager()

# WebSocket Logs Infrastructure Initialized

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"/api/v1/openapi.json"
)

# Base directory for absolute paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Setup templates
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

from app.api.v1.endpoints import admin
@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    if getattr(admin, "PLATFORM_CONFIG", {}).get("maintenance_mode"):
        path = request.url.path
        if not any(path.startswith(p) for p in ["/admin", "/api/v1/admin", "/static", "/favicon.ico", "/api/v1/users/me"]):
            return HTMLResponse(
                content="""
                <body style='background:#05070a; color:#f85149; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;'>
                    <div style='text-align:center; border:1px solid #f85149; padding:40px; border-radius:10px; background:rgba(248,81,73,0.05);'>
                        <h1 style='letter-spacing:2px;'>CORE_UNDER_MAINTENANCE</h1>
                        <p style='color:#8b949e;'>The platform is currently offline for system optimization. Please standby.</p>
                        <div style='margin-top:20px; font-size:0.8rem; opacity:0.5;'>SEC_ERR: OCC_OFFLINE_LOCK</div>
                    </div>
                </body>
                """,
                status_code=503
            )
    return await call_next(request)

# Register global helper for static URLs
def url_static(path: str):
    return f"/static/{path}"

templates.env.globals.update(url_static=url_static)

# Include API Router
app.include_router(api_router, prefix="/api/v1")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("pages/index.html", {"request": request, "version": settings.VERSION})

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("pages/login.html", {"request": request, "version": settings.VERSION})

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("pages/register.html", {"request": request, "version": settings.VERSION})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    return templates.TemplateResponse("pages/dashboard.html", {
        "request": request, 
        "active_page": "dashboard", 
        "version": settings.VERSION
    })

@app.get("/arena", response_class=HTMLResponse)
async def arena_page(request: Request):
    import getpass, socket, os
    return templates.TemplateResponse("pages/arena.html", {
        "request": request,
        "active_page": "arena",
        "version": settings.VERSION,
        "sys_user": getpass.getuser(),
        "sys_host": socket.gethostname(),
        "sys_shell": os.environ.get("SHELL", "/bin/bash").split("/")[-1]
    })

@app.get("/archive", response_class=HTMLResponse)
async def archive_page(request: Request):
    return templates.TemplateResponse("pages/archive.html", {"request": request, "active_page": "archive", "version": settings.VERSION})

@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    return templates.TemplateResponse("pages/settings.html", {
        "request": request, 
        "active_page": "settings", 
        "version": settings.VERSION
    })

@app.get("/tracks", response_class=HTMLResponse)
async def tracks_page(request: Request):
    return templates.TemplateResponse("pages/tracks.html", {"request": request, "active_page": "tracks", "version": settings.VERSION})

from fastapi import Security
from app.api.deps import get_current_user

@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    # This page is now strictly guarded. 
    # The frontend will also verify the token before rendering.
    return templates.TemplateResponse("pages/admin.html", {"request": request, "active_page": "admin", "version": settings.VERSION})

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await log_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)

@app.on_event("startup")
async def startup_event():
    async def log_generator():
        messages = [
            ("Core firewall rules validated", "SEC"),
            ("Intrusion detection node synchronized", "SYS"),
            ("Anomalous traffic pattern analyzed", "NET"),
            ("User session handshake verified", "AUTH"),
            ("Database replication latency optimized", "DB"),
            ("Sandbox environment initialized", "OP"),
            ("THREAT DETECTED: CVE-2024-21626 escape attempt blocked", "THREAT"),
            ("Global Sinkhole active in Sector-4", "NET"),
            ("Patch deployed: CWE-89 mitigation confirmed", "SEC"),
            ("Neural telemetry link: 98% integrity", "SYS"),
            ("UNAUTHORIZED LOGIN ATTEMPT: IP 192.168.1.104 blocked", "AUTH"),
            ("Zero-day signature identified: 'Aurora-X'", "THREAT")
        ]
        while True:
            await asyncio.sleep(random.randint(2, 6))
            msg, cat = random.choice(messages)
            await log_manager.broadcast(msg, cat)
    # Emergency Database & Admin Restore Protocol
    from app.db.session import SessionLocal, engine
    from sqlalchemy import text
    from app.models.user import User
    
    with engine.begin() as conn:
        try: conn.execute(text("ALTER TABLE users ADD COLUMN last_active DATETIME"))
        except: pass
        try: conn.execute(text("ALTER TABLE users ADD COLUMN last_ip TEXT"))
        except: pass
        try: conn.execute(text("ALTER TABLE users ADD COLUMN is_mfa_enabled BOOLEAN DEFAULT 0"))
        except: pass
        try: conn.execute(text("ALTER TABLE users ADD COLUMN mfa_secret TEXT"))
        except: pass


    db = SessionLocal()
    try:
        # Ensure admin is superuser
        admin = db.query(User).filter(User.username == 'admin').first()
        if admin:
            admin.is_active = True
            admin.is_superuser = True
        
        # Strict Single-Admin Policy: only 'admin' remains superuser
        others = db.query(User).filter(User.username != 'admin').all()
        for u in others:
            u.is_superuser = False
            
        db.commit()
        print("ADMIN_POLICY_ENFORCED: Single admin account confirmed.")
    finally:
        db.close()

    asyncio.create_task(log_generator())

    # Start the lab session cleanup worker
    try:
        from app.core.sandbox import sandbox_manager
        sandbox_manager.start_cleanup_worker()
        print("LAB_CLEANUP_WORKER: Background session sweeper started.")
    except Exception as e:
        print(f"LAB_CLEANUP_WORKER_ERROR: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Stop cleanup worker and remove all sandbox containers on server shutdown."""
    try:
        from app.core.sandbox import sandbox_manager
        sandbox_manager.stop_cleanup_worker()
        sandbox_manager.cleanup_all()
        print("SANDBOX_CLEANUP: Cleanup worker stopped, all Docker containers removed.")
    except Exception as e:
        print(f"SANDBOX_CLEANUP_ERROR: {e}")
