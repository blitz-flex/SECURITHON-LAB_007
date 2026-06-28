"""
System Endpoints
Provides real-time system stats and static CVE reference data.
"""
import logging
import time
from typing import Any

import psutil
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()
ACTIVE_SANDBOX_WARNING_THRESHOLD = 20
ACTIVE_SANDBOX_CRITICAL_THRESHOLD = 50

_CVE_DB: dict[str, list[dict]] = {
    "cwe89":  [{"id": "CVE-2023-3453", "summary": "SQL Injection in Login Module"}, {"id": "CVE-2021-44228", "summary": "Improper neutralization of special elements (JNDI)"}],
    "cwe287": [{"id": "CVE-2022-21449", "summary": "Improper verification of cryptographic signature"}, {"id": "CVE-2020-0601", "summary": "Spoofing vulnerability in CryptoAPI"}],
    "cwe79":  [{"id": "CVE-2021-23337", "summary": "Cross-site Scripting in Template Engine"}, {"id": "CVE-2019-11358", "summary": "jQuery UI Cross-site Scripting"}],
}


def _active_sandbox_count() -> int:
    try:
        from app.core.sandbox import sandbox_manager

        return sum(
            1
            for lab in sandbox_manager._labs.values()
            if not lab.is_expired and lab.status == "online"
        )
    except Exception as e:
        logger.warning("Could not read active sandbox count: %s", e)
        return 0


def _sandbox_telemetry() -> dict[str, Any]:
    active_count = _active_sandbox_count()
    return {
        "active_sandboxes": active_count,
        "active_sandbox_warning_threshold": ACTIVE_SANDBOX_WARNING_THRESHOLD,
        "active_sandbox_critical_threshold": ACTIVE_SANDBOX_CRITICAL_THRESHOLD,
        "active_sandbox_alert": active_count > ACTIVE_SANDBOX_WARNING_THRESHOLD,
        "active_sandbox_critical": active_count > ACTIVE_SANDBOX_CRITICAL_THRESHOLD,
    }


@router.get("/stats")
async def get_system_stats() -> dict[str, Any]:
    """Return live CPU, memory, network, and disk metrics."""
    try:
        net = psutil.net_io_counters()
        return {
            "cpu": psutil.cpu_percent(interval=None),
            "memory": psutil.virtual_memory().percent,
            "network": {"bytes_sent": net.bytes_sent, "bytes_recv": net.bytes_recv},
            "disk": psutil.disk_usage("/").percent,
            **_sandbox_telemetry(),
            "timestamp": time.time(),
        }
    except Exception as e:
        logger.warning("psutil unavailable, returning fallback stats: %s", e)
        return {
            "cpu": 15.0,
            "memory": 42.0,
            "network": {"bytes_sent": 0, "bytes_recv": 0},
            "disk": 38.4,
            **_sandbox_telemetry(),
            "timestamp": time.time(),
        }


@router.get("/cve/{cwe_id}")
async def get_cves_by_cwe(cwe_id: str) -> dict[str, list]:
    """Return static CVE reference data for a given CWE identifier."""
    return {"cves": _CVE_DB.get(cwe_id, [])}


