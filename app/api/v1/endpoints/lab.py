"""
SECURATION LAB — Live Lab Endpoint
===================================
REST API to start, stop, and monitor dual-container labs.

POST /api/v1/lab/start         { "challenge_id": "sqli_basic" }
POST /api/v1/lab/stop          { "session_id": "..." }
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
        "category":    "Web Security",
        "difficulty":  "Medium",
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
        "category":    "Infrastructure",
        "difficulty":  "Critical",
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
    "xss_stored": {
        "id":          "xss_stored",
        "title":       "Stored XSS — Comments & Profile Bio",
        "category":    "Web Security",
        "difficulty":  "Medium",
        "description": (
            "Unsanitized user bio rendering allows persistent script execution in "
            "victim browser sessions. Bypass template auto-escaping."
        ),
        "objectives": [
            "Inject script tag payload into profile bio",
            "Extract administrator session cookie via XSS payload",
        ],
        "hints": ["Check if safe filter is used in Jinja2 template."],
        "tools": ["browser", "curl"],
        "target_port": 5000,
    },
    "auth_bypass": {
        "id":          "auth_bypass",
        "title":       "Broken Authentication — JWT Key Confusion",
        "category":    "Identity & Access",
        "difficulty":  "High",
        "description": (
            "Weak JWT algorithm handling allows token forgery and administrative "
            "privilege escalation by switching RS256 to HS256."
        ),
        "objectives": [
            "Decode existing session JWT token",
            "Re-sign JWT using public key as HMAC secret",
            "Gain administrative access to /admin/control",
        ],
        "hints": ["Look for public key exposed on /.well-known/jwks.json."],
        "tools": ["jwt_tool", "python3"],
        "target_port": 5000,
    },
    "path_traversal": {
        "id":          "path_traversal",
        "title":       "Path Traversal — Document Viewer",
        "category":    "Web Security",
        "difficulty":  "High",
        "description": (
            "Unrestricted file path concatenation allows arbitrary file reading "
            "outside the web server root folder."
        ),
        "objectives": [
            "Use ../ sequences to read /etc/passwd",
            "Extract application environment file .env",
        ],
        "hints": ["Try URL encoding dot-dot-slash (%2e%2e%2f)."],
        "tools": ["curl"],
        "target_port": 5000,
    },
    "ssrf_cloud": {
        "id":          "ssrf_cloud",
        "title":       "Server-Side Request Forgery — AWS Metadata Leakage",
        "category":    "Cloud Security",
        "difficulty":  "High",
        "description": (
            "Web image fetcher endpoint accepts internal IP addresses. Access AWS "
            "Instance Metadata Service (IMDSv1) to exfiltrate IAM role credentials."
        ),
        "objectives": [
            "Query http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            "Exfiltrate AWS Secret Access Key and Session Token",
        ],
        "hints": ["Try bypassing 127.0.0.1 block with 0.0.0.0 or hex IP notation."],
        "tools": ["curl"],
        "target_port": 5000,
    },
    "csrf_token_bypass": {
        "id":          "csrf_token_bypass",
        "title":       "CSRF — Unprotected Password Change API",
        "category":    "Web Security",
        "difficulty":  "Medium",
        "description": (
            "State-changing email update endpoint lacks CSRF token validation, "
            "allowing attacker-controlled cross-domain request execution."
        ),
        "objectives": [
            "Craft HTML exploit payload with auto-submitting form",
            "Trigger automated victim password reset",
        ],
        "hints": ["Check if SameSite cookie attribute is set to None."],
        "tools": ["browser"],
        "target_port": 5000,
    },
    "hardcoded_creds": {
        "id":          "hardcoded_creds",
        "title":       "Hardcoded Credentials — Secret In Code",
        "category":    "Identity & Access",
        "difficulty":  "High",
        "description": (
            "Static API keys and private keys committed to source repository. "
            "Extract database credentials from legacy configuration file."
        ),
        "objectives": [
            "Find plain-text database credentials in source file",
            "Authenticate to DB server directly",
        ],
        "hints": ["Search git history for DB_PASSWORD or AWS_SECRET_ACCESS_KEY."],
        "tools": ["git", "grep"],
        "target_port": 5000,
    },
    "docker_sock_exposure": {
        "id":          "docker_sock_exposure",
        "title":       "Exposed Docker Socket — Container Escape",
        "category":    "Infrastructure",
        "difficulty":  "Critical",
        "description": (
            "The Docker daemon socket (/var/run/docker.sock) is mounted inside "
            "the container. Mount the host filesystem to gain root on the host machine."
        ),
        "objectives": [
            "Interact with Docker API via Unix socket",
            "Spawn privileged container mounting host root filesystem /host",
            "Read host /etc/shadow file",
        ],
        "hints": ["Use docker CLI or curl --unix-socket /var/run/docker.sock."],
        "tools": ["docker", "curl"],
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


class LabStatusResponse(BaseModel):
    session_id: str
    challenge_id: str
    status: str              # "offline" | "spawning" | "online"
    target_host: str
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

    from app.core.sandbox import sandbox_manager, LabSession

    session_id = req.session_id or str(uuid.uuid4())

    if not sandbox_manager.is_available():
        logger.info(f"Docker not available. Creating mock lab session for {session_id[:8]}")
        lab = LabSession(session_id, req.challenge_id)
        lab.status = "online"
        sandbox_manager._labs[session_id] = lab
        challenge = CHALLENGE_REGISTRY[req.challenge_id]
        return LabStatusResponse(
            session_id=session_id,
            challenge_id=req.challenge_id,
            status="online",
            target_host=f"target:{challenge['target_port']}",
            attackbox_id="mock-attackbox",
        )

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
        attackbox_id=lab.attackbox.short_id if lab.attackbox else "",
    )


@router.post("/stop")
async def stop_lab(req: StopLabRequest):
    """Stop and remove a lab session."""
    from app.core.sandbox import sandbox_manager
    sandbox_manager.remove_lab(req.session_id)
    return {"status": "stopped", "session_id": req.session_id}


@router.get("/status/{session_id}", response_model=LabStatusResponse)
async def lab_status(session_id: str):
    """Get the current status of a lab session."""
    from app.core.sandbox import sandbox_manager

    lab = sandbox_manager.get_lab(session_id)
    if not lab:
        return LabStatusResponse(
            session_id=session_id,
            challenge_id="",
            status="offline",
            target_host="",
            attackbox_id="",
        )

    status_info = sandbox_manager.get_lab_status(session_id)

    return LabStatusResponse(
        session_id=session_id,
        challenge_id=status_info["challenge_id"],
        status=status_info["status"],
        target_host=status_info["target_host"],
        attackbox_id=lab.attackbox.short_id if lab.attackbox else "",
    )
