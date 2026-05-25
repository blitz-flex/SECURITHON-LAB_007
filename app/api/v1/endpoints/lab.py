"""
SECURATION LAB — Live Lab Endpoint
===================================
REST API to start, stop, extend, and monitor dual-container labs.

POST /api/v1/lab/start         { "challenge_id": "sqli_basic" }
POST /api/v1/lab/stop          { "session_id": "..." }
POST /api/v1/lab/extend        { "session_id": "..." }
GET  /api/v1/lab/status/{session_id}
GET  /api/v1/lab/challenges    → list of available challenges
"""
import uuid
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Challenge Registry
# ─────────────────────────────────────────────────────────────
CHALLENGE_REGISTRY = {
    "sqli_basic": {
        "id":          "sqli_basic",
        "title":       "SQL Injection — UserLookup API",
        "category":    "Web Exploitation",
        "difficulty":  "Easy",
        "description": (
            "A web API exposes a /user endpoint that builds SQL queries "
            "using string interpolation. Extract the admin password using "
            "a UNION-based SQL injection."
        ),
        "objectives": [
            "Enumerate the users table",
            "Perform a UNION-based injection to retrieve all passwords",
            "Capture the admin flag: FLAG{...}",
        ],
        "hints": [
            "The target endpoint is /user?name= (accessible on the target machine)",
            "Try: ?name=' OR '1'='1 to bypass filters",
            "UNION SELECT syntax: ' UNION SELECT 1,username||':'||password,role FROM users--",
        ],
        "tools": ["curl", "python3"],
        "target_port": 5000,
    },
    "cmdi_basic": {
        "id":          "cmdi_basic",
        "title":       "Command Injection — PingUtil API",
        "category":    "Web Exploitation",
        "difficulty":  "Easy",
        "description": (
            "A 'ping utility' web service passes user input directly to "
            "the shell via subprocess. Exploit command injection to read "
            "the flag from the filesystem."
        ),
        "objectives": [
            "Confirm the command injection with a harmless payload",
            "Use command injection to read /tmp/flag.txt on the target",
            "Capture the flag: FLAG{...}",
        ],
        "hints": [
            "The target endpoint is /ping?host= (accessible on the target machine)",
            "Try chaining: ?host=127.0.0.1;id",
            "To read the flag: ?host=127.0.0.1;cat /tmp/flag.txt",
        ],
        "tools": ["curl", "python3"],
        "target_port": 5000,
    },
}


# ─────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────
class StartLabRequest(BaseModel):
    challenge_id: str
    session_id: Optional[str] = None    # client may supply own ID


class StopLabRequest(BaseModel):
    session_id: str


class ExtendLabRequest(BaseModel):
    session_id: str
    minutes: int = 15


class LabStatusResponse(BaseModel):
    session_id: str
    challenge_id: str
    status: str              # "offline" | "spawning" | "online"
    target_host: str
    remaining_seconds: int
    attackbox_id: str = ""


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────
@router.get("/challenges")
async def list_challenges():
    """List all available lab challenges."""
    return list(CHALLENGE_REGISTRY.values())


@router.post("/start", response_model=LabStatusResponse)
async def start_lab(req: StartLabRequest):
    """
    Start a dual-container lab.
    Returns session_id that the client uses to connect its terminal.
    """
    if req.challenge_id not in CHALLENGE_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Challenge '{req.challenge_id}' not found. "
                   f"Available: {list(CHALLENGE_REGISTRY)}"
        )

    from app.core.sandbox import sandbox_manager

    if not sandbox_manager.is_available():
        raise HTTPException(
            status_code=503,
            detail="Docker is not available on this server. "
                   "Cannot start live labs."
        )

    session_id = req.session_id or str(uuid.uuid4())

    # Remove existing lab for this session if any
    existing = sandbox_manager.get_lab(session_id)
    if existing:
        sandbox_manager.remove_lab(session_id)

    lab = sandbox_manager.create_lab(session_id, req.challenge_id)
    if not lab:
        raise HTTPException(
            status_code=500,
            detail="Failed to start lab containers. Check server logs."
        )

    challenge = CHALLENGE_REGISTRY[req.challenge_id]
    logger.info(f"Lab started: session={session_id[:8]} challenge={req.challenge_id}")

    return LabStatusResponse(
        session_id=session_id,
        challenge_id=req.challenge_id,
        status="online",
        target_host=f"target:{challenge['target_port']}",
        remaining_seconds=lab.remaining_seconds,
        attackbox_id=lab.attackbox.short_id if lab.attackbox else "",
    )


@router.post("/stop")
async def stop_lab(req: StopLabRequest):
    """Stop and remove a lab session."""
    from app.core.sandbox import sandbox_manager
    sandbox_manager.remove_lab(req.session_id)
    return {"status": "stopped", "session_id": req.session_id}


@router.post("/extend")
async def extend_lab(req: ExtendLabRequest):
    """Extend a lab session by the specified minutes (default 15). Max 3 hours total."""
    from app.core.sandbox import sandbox_manager

    lab = sandbox_manager.get_lab(req.session_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Lab session not found")

    success = sandbox_manager.extend_lab(req.session_id, req.minutes)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot extend session. Maximum session duration (3 hours) reached."
        )

    # Return updated status
    updated_lab = sandbox_manager.get_lab(req.session_id)
    return {
        "status": "extended",
        "session_id": req.session_id,
        "remaining_seconds": updated_lab.remaining_seconds if updated_lab else 0,
    }


@router.get("/status/{session_id}", response_model=LabStatusResponse)
async def lab_status(session_id: str):
    """Get the current status of a lab session with remaining time."""
    from app.core.sandbox import sandbox_manager

    lab = sandbox_manager.get_lab(session_id)
    if not lab:
        return LabStatusResponse(
            session_id=session_id,
            challenge_id="",
            status="offline",
            target_host="",
            remaining_seconds=0,
            attackbox_id="",
        )

    status_info = sandbox_manager.get_lab_status(session_id)

    return LabStatusResponse(
        session_id=session_id,
        challenge_id=status_info["challenge_id"],
        status=status_info["status"],
        target_host=status_info["target_host"],
        remaining_seconds=status_info["remaining_seconds"],
        attackbox_id=lab.attackbox.short_id if lab.attackbox else "",
    )
