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
    # Simulated user data for instant rendering
    user_data = {"username": "st", "full_name": "st", "points": 0, "level": 1}
    return templates.TemplateResponse("pages/dashboard.html", {
        "request": request, 
        "active_page": "dashboard", 
        "version": settings.VERSION,
        "user": user_data
    })

@app.get("/arena", response_class=HTMLResponse)
async def arena_page(request: Request):
    return templates.TemplateResponse("pages/arena.html", {"request": request, "active_page": "arena", "version": settings.VERSION})

@app.get("/archive", response_class=HTMLResponse)
async def archive_page(request: Request):
    return templates.TemplateResponse("pages/archive.html", {"request": request, "active_page": "archive", "version": settings.VERSION})

@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    user_data = {"username": "st", "full_name": "st", "points": 0, "level": 1}
    return templates.TemplateResponse("pages/settings.html", {
        "request": request, 
        "active_page": "settings", 
        "version": settings.VERSION,
        "user": user_data
    })

@app.get("/tracks", response_class=HTMLResponse)
async def tracks_page(request: Request):
    return templates.TemplateResponse("pages/tracks.html", {"request": request, "active_page": "tracks", "version": settings.VERSION})

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
            ("Sandbox environment initialized", "OP")
        ]
        while True:
            await asyncio.sleep(random.randint(4, 10))
            msg, cat = random.choice(messages)
            await log_manager.broadcast(msg, cat)
    asyncio.create_task(log_generator())
