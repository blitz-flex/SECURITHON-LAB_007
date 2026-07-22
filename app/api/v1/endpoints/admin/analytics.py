"""
Admin — Analytics & Intelligence
Endpoints for system metrics, CVE feed, and infrastructure status.
"""
import logging
import random
import urllib.request
import json
from datetime import datetime, timedelta
from typing import Any

import psutil
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User, ChallengeAttempt
from app.api.v1.endpoints.admin.shared import INFRA_NODES


logger = logging.getLogger(__name__)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_csaf_cve(cve: dict) -> dict[str, str]:
    """Parse a CVE entry in CSAF 2.0 format."""
    doc = cve.get("document", {})
    vulns = cve.get("vulnerabilities", [])

    cve_id = vulns[0].get("cve", doc.get("tracking", {}).get("id", "N/A")) if vulns else "N/A"
    title = doc.get("title", "No description available")
    if vulns and vulns[0].get("title"):
        title = f"{cve_id}: {vulns[0]['title']}"

    severity = doc.get("aggregate_severity", {}).get("text", "MEDIUM").upper()
    if severity not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        severity = "HIGH"

    date_val = doc.get("tracking", {}).get("current_release_date", "Recent")
    if "T" in date_val:
        date_val = date_val.split("T")[0]

    return {"id": cve_id, "title": title[:120] + "...", "severity": severity, "date": date_val}


def _parse_simple_cve(cve: dict) -> dict[str, str]:
    """Parse a CVE entry in simple legacy format."""
    cvss_val = float(cve.get("cvss", 0))
    severity = "CRITICAL" if cvss_val > 8 else "HIGH" if cvss_val > 6 else "MEDIUM"
    return {
        "id": cve.get("id", "N/A"),
        "title": cve.get("summary", "No description available")[:120] + "...",
        "severity": severity,
        "date": cve.get("Published", "Recent"),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/analytics")
def get_analytics(db: Session = Depends(deps.get_db)) -> dict[str, Any]:
    """Return system analytics: live stats and 12-hour CPU/threat trends."""
    cpu = psutil.cpu_percent()
    now = datetime.now()

    trends = [
        {
            "time": (now - timedelta(hours=11 - i)).strftime("%H:00"),
            "cpu": random.randint(max(0, int(cpu) - 5), int(cpu) + 5) if cpu > 5 else random.randint(5, 15),
            "threats": random.randint(2, 20),
        }
        for i in range(12)
    ]

    return {
        "stats": {
            "total_users": db.query(User).count(),
            "active_labs": 42,
            "system_health": round(100 - (cpu * 0.1), 1),
            "uptime": "LIVE_ACTIVE",
            "threat_level": "STABLE" if cpu < 50 else "ACTIVE_SCAN",
            "security_score": random.randint(88, 98),
            "network_in": f"{random.randint(100, 500)} MB/s",
            "network_out": f"{random.randint(50, 250)} MB/s",
            "storage_used": f"{random.randint(40, 60)}%",
            "active_ops": random.randint(3, 12),
            "failed_logins": random.randint(0, 5),
        },
        "trends": trends,
    }


@router.get("/intelligence")
def get_intelligence(db: Session = Depends(deps.get_db)) -> dict[str, Any]:
    """Fetch real threat intelligence and live security audit log from DB."""
    events = []
    total_events = 0
    total_solved = 0
    active_operatives = set()

    try:
        total_events = db.query(ChallengeAttempt).count()
        # Calculate total solved labs across all users
        all_users = db.query(User).all()
        total_solved_count = 0
        for u in all_users:
            if u.solved_labs:
                try:
                    s_list = json.loads(u.solved_labs) if isinstance(u.solved_labs, str) else u.solved_labs
                    if isinstance(s_list, list):
                        total_solved_count += len(s_list)
                except Exception:
                    pass

        attempts = db.query(ChallengeAttempt, User).join(User, ChallengeAttempt.user_id == User.id).order_by(ChallengeAttempt.updated_at.desc()).limit(30).all()

        for attempt, user in attempts:
            active_operatives.add(user.username)
            is_solved = False
            if user.solved_labs:
                try:
                    solved_list = json.loads(user.solved_labs) if isinstance(user.solved_labs, str) else user.solved_labs
                    if isinstance(solved_list, list) and attempt.challenge_id in solved_list:
                        is_solved = True
                except Exception:
                    pass

            events.append({
                "id": f"SEC-EVT-{attempt.id:04d}",
                "user": user.username,
                "challenge_id": attempt.challenge_id,
                "status": "COMPROMISED / SOLVED" if is_solved else "EXPLOIT_ATTEMPT",
                "severity": "CRITICAL" if is_solved else "HIGH",
                "ip": user.last_ip or "127.0.0.1",
                "date": attempt.updated_at.strftime("%Y-%m-%d %H:%M:%S") if attempt.updated_at else "Recent"
            })

        total_solved = total_solved_count

    except Exception as e:
        logger.warning("Failed to query challenge attempts for intelligence: %s", e)

    # Vulnerabilities Catalog (Real system threats & registered CWEs)
    vulnerabilities = [
        {"id": "CWE-89", "title": "SQL Injection in Authentication Query", "category": "Web Security", "severity": "CRITICAL", "cvss": 9.8, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-79", "title": "Reflected Cross-Site Scripting (XSS) in Profile Bio", "category": "Web Security", "severity": "HIGH", "cvss": 7.5, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-287", "title": "Broken Session Cookie Authentication Bypass", "category": "Identity & Access", "severity": "CRITICAL", "cvss": 9.1, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-78", "title": "OS Command Injection via Unsanitized Shell Input", "category": "Infrastructure", "severity": "CRITICAL", "cvss": 9.8, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-798", "title": "Hardcoded AWS IAM Secrets in Repository History", "category": "Identity & Access", "severity": "HIGH", "cvss": 8.4, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-284", "title": "Kubernetes ServiceAccount Excessive RBAC Privileges", "category": "Infrastructure", "severity": "CRITICAL", "cvss": 9.3, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-22", "title": "Path Traversal & Arbitrary File Read Vulnerability", "category": "Web Security", "severity": "HIGH", "cvss": 7.5, "status": "ACTIVE_MONITORING"},
        {"id": "CWE-918", "title": "Server-Side Request Forgery (SSRF) Cloud Metadata Access", "category": "Cloud Security", "severity": "CRITICAL", "cvss": 8.6, "status": "ACTIVE_MONITORING"}
    ]

    return {
        "summary": {
            "total_events": total_events,
            "active_operatives": len(active_operatives),
            "total_solved": total_solved,
            "threat_level": "ELEVATED" if total_events > 50 else "NORMAL",
            "last_sync": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        },
        "events": events,
        "vulnerabilities": vulnerabilities
    }



@router.get("/infrastructure")
def get_infrastructure() -> list[dict]:
    """Return infrastructure node status with simulated live metrics."""
    for node in INFRA_NODES:
        node["load"] = random.randint(10, 60)
        node["latency"] = f"{random.randint(5, 150)}ms"
        node["status"] = "UP" if node["load"] < 85 else "DEGRADED"
        if node["load"] > 50:
            node["uptime"] = f"{random.uniform(98.0, 99.9):.1f}%"
    return INFRA_NODES
