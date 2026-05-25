from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import re
from sqlalchemy.orm import Session

from app import crud
from app.db.session import get_db
from app.api import deps
from app.models.user import User

router = APIRouter()

class PatchRequest(BaseModel):
    challenge_id: str
    code: str

class PatchResponse(BaseModel):
    success: bool
    message: str
    points: int = 0

@router.post("/verify", response_model=PatchResponse)
async def verify_patch(
    request: PatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    code = request.code
    challenge_id = request.challenge_id
    success = False
    message = "Exploit successful! Vulnerability still present in target system."

    # --- Category: Infrastructure as Code (IAC) ---
    if challenge_id.startswith("IAC_"):
        # Use regex to be flexible with whitespace around '='
        if re.search(r'storage_encrypted\s*=\s*true', code.lower()) or \
           re.search(r'encrypted\s*=\s*true', code.lower()) or \
           re.search(r'acl\s*=\s*["\']private["\']', code.lower()) or \
           re.search(r'enabled\s*=\s*true', code.lower()) or \
           re.search(r'include_global_service_events\s*=\s*true', code.lower()):
            success = True
            message = "Defense Active. IaC configuration hardened."
        else:
            success = False
            message = "Exploit successful! Target resource configuration is still vulnerable."

    # --- Category: Network Security (NET) ---
    elif challenge_id.startswith("NET_"):
        if "0.0.0.0/0" in code:
            success = False
            message = "Attack Success! Port is still exposed to the public internet."
        else:
            success = True
            message = "Defense Active. Ingress restricted."

    # --- Category: Identity & Secrets (ID) ---
    elif challenge_id.startswith("ID_"):
        if "HARDCODED_SECRET_VALUE" in code:
            success = False
            message = "Attack Success! Sensitive credentials found in plaintext."
        else:
            success = True
            message = "Defense Active. Secret handled securely."

    # --- Category: Container Security (CONT) ---
    elif challenge_id.startswith("CONT_"):
        bad_patterns = ["USER root", "--privileged", "--net=host", "docker.sock", "latest", "bash", "-P", "ALL", "supersecret"]
        if any(bad in code for bad in bad_patterns):
            success = False
            message = "Attack Success! Container configuration remains insecure."
        else:
            success = True
            message = "Defense Active. Container runtime hardened."

    # --- Category: Kubernetes Security (K8S) ---
    elif challenge_id.startswith("K8S_"):
        if any(bad in code for bad in ["PrivilegeEscalation: true", "hostPID: true", "hostIPC: true", "hostNetwork: true", "runAsUser: 0", "automountServiceAccountToken: true"]):
            success = False
            message = "Attack Success! Pod spec allows excessive privileges."
        else:
            success = True
            message = "Defense Active. Kubernetes manifest secured."

    # --- Category: Cloud Architecture (ARCH) ---
    elif challenge_id.startswith("ARCH_"):
        if "\"*\"" in code or "'*'" in code:
            success = False
            message = "Attack Success! Wildcard permissions detected."
        else:
            success = True
            message = "Defense Active. Least-privilege IAM policy enforced."

    # --- Category: Serverless Security (SLS) ---
    elif challenge_id.startswith("SLS_"):
        if any(bad in code for bad in ["os.system", "eval(", "subprocess", "pickle.loads", "yaml.load", "db.query", "requests.get", "fs.read", "render_template"]):
            # If they keep the bad function but don't wrap it in sanitize logic (simplified check)
            if "sanitize" not in code.lower() and "validate" not in code.lower():
                success = False
                message = "Attack Success! Untrusted input still flowing to sensitive sink."
            else:
                success = True
                message = "Defense Active. Lambda input sanitized."
        else:
            success = True
            message = "Defense Active. Lambda input sanitized."

    # --- Category: CI/CD Security (CICD) ---
    elif challenge_id.startswith("CICD_"):
        if any(bad in code for bad in ["pull_request_target", "${{ github.event", "curl", "chmod +x"]):
            success = False
            message = "Attack Success! Pipeline remains vulnerable to injection/poisoning."
        else:
            success = True
            message = "Defense Active. CI/CD workflow hardened."

    # --- Category: Global Threat Feed (LIVE) ---
    elif challenge_id.startswith("LIVE_"):
        if challenge_id == "LIVE_0": # CVE-2026-1042
            if "unsafe=True" in code:
                success = False
                message = "Attack Success! AI model context remains vulnerable to injection."
            else:
                success = True
                message = "Defense Active. Neural stream sanitized."
        
        elif challenge_id == "LIVE_1": # CVE-2026-0512
            if "2025.1" in code:
                success = False
                message = "Attack Success! Vulnerable PQC algorithm version detected."
            else:
                success = True
                message = "Defense Active. Quantum-safe integrity verified."
        
        elif challenge_id == "LIVE_2": # CVE-2026-2901
            if "NODE_STATE.update" in code and "lock" not in code.lower():
                success = False
                message = "Attack Success! Race condition in mesh node sync still exploitable."
            else:
                success = True
                message = "Defense Active. Atomic mesh synchronization enforced."

    # --- Legacy / Specific Challenges ---
    elif challenge_id == "cwe89":
        if "f\"SELECT" in code or "f'SELECT" in code:
            success = False
            message = "SQL Injection vulnerability still present."
        elif ("?" in code or "%s" in code) and ("execute" in code):
            success = True
            message = "Defense Active. Parameterized query verified."
        
    elif challenge_id == "cwe287":
        if "req.signedCookies" in code or "verify" in code.lower():
            success = True
            message = "Defense Active. Session validation enabled."
        
    elif challenge_id == "cwe79":
        if "| safe" in code:
            success = False
            message = "Attack Success! Unsafe HTML rendering allows XSS."
        else:
            success = True
            message = "Defense Active. Output encoding enabled."

    if success:
        # Calculate dynamic reward score on the server side
        # Find default CVSS score based on category
        cvss = 5.0
        if challenge_id.startswith("LIVE_"):
            cvss = 9.0
        elif challenge_id in ["cwe89", "cwe287", "cwe79"]:
            cvss = 7.5
        
        reward = int(cvss * 10)
        new_points = (current_user.points or 0) + reward
        crud.user.update_points(db, db_user=current_user, points=new_points)
        return PatchResponse(success=True, message=message, points=new_points)

    return PatchResponse(success=False, message=message)
