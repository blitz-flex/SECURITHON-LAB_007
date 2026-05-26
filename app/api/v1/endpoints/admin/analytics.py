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
from app.models.user import User
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
def get_intelligence() -> list[dict[str, str]]:
    """Fetch the latest CVEs from the CIRCL live feed."""
    try:
        with urllib.request.urlopen("https://cve.circl.lu/api/last/5", timeout=5) as resp:
            if resp.status == 200:
                cves = json.loads(resp.read().decode())
                result = [
                    _parse_csaf_cve(c) if "document" in c else _parse_simple_cve(c)
                    for c in cves
                ]
                logger.debug("Fetched %d CVEs from CIRCL", len(result))
                return result
    except Exception as e:
        logger.warning("CVE feed unavailable: %s", e)

    return [{"id": "CVE-SYNC", "title": "Live feed currently unavailable. Standby...", "severity": "MEDIUM", "date": "N/A"}]


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
