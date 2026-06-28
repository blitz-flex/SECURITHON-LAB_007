"""
InfraSec Endpoint
Serves the InfraSec curriculum combined with live CISA KEV threat intelligence.
"""
import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks

logger = logging.getLogger(__name__)
router = APIRouter()

_CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "curriculum.json")
_CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_CISA_CACHE_TTL_SECONDS = int(os.getenv("CISA_CACHE_TTL_SECONDS", str(60 * 60)))
_LIVE_THREAT_LIMIT = 5
_cisa_cache_lock = asyncio.Lock()
_cisa_kev_cache: dict[str, Any] = {"items": [], "fetched_at": 0.0, "refreshing": False}

# ── CVE → Lab scenario mapping ────────────────────────────────────────────────

_KEYWORD_SCENARIOS: list[dict] = [
    {
        "keywords": ["injection", "sql", "database"],
        "file": "db_query.py",
        "code": ['query = f"SELECT * FROM logs WHERE id = {event[\'id\']}"\'', "db.execute(query)"],
        "cwe": "CWE-89", "cvss": 9.8,
        "briefing": "SQL Injection (CWE-89) occurs when untrusted data is inserted into a database query.",
        "hint": "Use parameterized queries instead of f-strings.",
        "task": "Fix the SQL injection vulnerability using parameterized queries.",
    },
    {
        "keywords": ["traversal", "file read", "path"],
        "file": "file_handler.js",
        "code": ["const path = req.query.path;", "const data = fs.readFileSync('/app/data/' + path);"],
        "cwe": "CWE-22", "cvss": 7.5,
        "briefing": "Path Traversal (CWE-22) allows attackers to access files outside the intended folder.",
        "hint": "Sanitize the path variable to prevent '../' sequences.",
        "task": "Prevent directory traversal by validating and sanitizing the path input.",
    },
    {
        "keywords": ["rce", "remote code execution", "command", "shell"],
        "file": "executor.py",
        "code": ["import os", "def run_cmd(cmd):", "    os.system(cmd)"],
        "cwe": "CWE-94", "cvss": 9.8,
        "briefing": "Remote Code Execution allows an attacker to execute arbitrary commands on the host.",
        "hint": "Avoid os.system(). Use subprocess with a strict allowlist.",
        "task": "Replace os.system with a safe subprocess call using an allowlist.",
    },
    {
        "keywords": ["s3", "bucket", "access", "policy", "iam"],
        "file": "s3_policy.tf",
        "code": ['resource "aws_s3_bucket_policy" "data" {', '  policy = jsonencode({', '    Principal = "*"', "  })", "}"],
        "cwe": "CWE-732", "cvss": 8.1,
        "briefing": "Permissive Cloud Policies grant excessive permissions to anonymous users.",
        "hint": "Restrict Principal to a specific IAM role and avoid using '*'.",
        "task": "Replace the wildcard Principal with a specific IAM role ARN.",
    },
    {
        "keywords": ["cross-site", "xss", "scripting"],
        "file": "template.html",
        "code": ["<div>", "  {{ user_input | safe }}", "</div>"],
        "cwe": "CWE-79", "cvss": 6.1,
        "briefing": "XSS allows attackers to inject malicious scripts into pages viewed by other users.",
        "hint": "Remove the '| safe' filter to enable auto-escaping.",
        "task": "Remove the unsafe filter to prevent XSS injection.",
    },
]

_DEFAULT_SCENARIO: dict = {
    "file": "config_check.yml",
    "code": ["# Real-time intelligence review required", "status: active", "security_check: pending"],
    "cwe": "CWE-Unknown", "cvss": 7.5,
    "briefing": "Audit the configuration and ensure it adheres to current security best practices.",
    "hint": "Check the status and security_check fields for non-standard values.",
    "task": "Review and harden the configuration based on the latest threat intelligence.",
}


def _match_scenario(description: str) -> dict:
    """Return the best matching scenario for a CVE description."""
    desc = description.lower()
    for scenario in _KEYWORD_SCENARIOS:
        if any(k in desc for k in scenario["keywords"]):
            return scenario
    return _DEFAULT_SCENARIO


def _build_live_challenge(cve: dict, challenge_id: int) -> dict:
    """Map a CISA KEV CVE entry to a lab challenge dict."""
    cve_id = cve.get("cveID", "CVE-UNKNOWN")
    vuln_name = cve.get("vulnerabilityName", "Unknown Vulnerability")
    description = cve.get("shortDescription", "")
    scenario = _match_scenario(description)

    vuln_code = [{"n": i + 1, "t": line, "vuln": i > 0} for i, line in enumerate(scenario["code"])]

    return {
        "level": challenge_id,
        "difficulty": "Critical" if scenario["cvss"] >= 9 else "High",
        "category": "Global Threat Feed",
        "id": f"LIVE_REAL_{challenge_id}",
        "title": f"🔴 LIVE: {cve_id} - {vuln_name}",
        "description": description,
        "real_source": "CISA KEV (Global Feed)",
        "cvss": scenario["cvss"],
        "cwe": scenario["cwe"],
        "task": scenario["task"],
        "briefing": scenario["briefing"],
        "hint": scenario["hint"],
        "file_context": scenario["file"],
        "vulnCode": vuln_code,
        "is_live": True,
    }


def _cached_cisa_kev_is_fresh(now: float | None = None) -> bool:
    """Return whether the in-memory CISA cache is still inside its TTL."""
    fetched_at = float(_cisa_kev_cache.get("fetched_at") or 0.0)
    return bool(_cisa_kev_cache["items"]) and ((now or time.monotonic()) - fetched_at) < _CISA_CACHE_TTL_SECONDS


async def _fetch_cisa_kev() -> list[dict]:
    """Fetch the latest known exploited vulnerabilities directly from CISA KEV."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_CISA_KEV_URL)
        resp.raise_for_status()
        return resp.json().get("vulnerabilities", [])[-_LIVE_THREAT_LIMIT:]


async def refresh_cisa_kev_cache(force: bool = False) -> list[dict]:
    """Refresh the CISA KEV cache, returning stale data if CISA is unavailable."""
    if not force and _cached_cisa_kev_is_fresh():
        return list(_cisa_kev_cache["items"])

    async with _cisa_cache_lock:
        if not force and _cached_cisa_kev_is_fresh():
            return list(_cisa_kev_cache["items"])

        _cisa_kev_cache["refreshing"] = True
        try:
            threats = await _fetch_cisa_kev()
            _cisa_kev_cache.update({"items": threats, "fetched_at": time.monotonic()})
            logger.info("CISA KEV cache refreshed with %s vulnerabilities.", len(threats))
        except Exception as e:
            logger.warning("Failed to refresh CISA KEV cache; using stale data if available: %s", e)
        finally:
            _cisa_kev_cache["refreshing"] = False

    return list(_cisa_kev_cache["items"])


async def get_cached_cisa_kev(background_tasks: BackgroundTasks | None = None) -> list[dict]:
    """Return cached CISA KEV data and refresh stale entries without blocking users."""
    if _cached_cisa_kev_is_fresh():
        return list(_cisa_kev_cache["items"])

    if _cisa_kev_cache["items"]:
        if not _cisa_kev_cache["refreshing"]:
            if background_tasks:
                background_tasks.add_task(refresh_cisa_kev_cache, True)
            else:
                asyncio.create_task(refresh_cisa_kev_cache(True))
        return list(_cisa_kev_cache["items"])

    return await refresh_cisa_kev_cache(force=True)


def _load_local_labs() -> list[dict]:
    """Load and return enabled labs from the local curriculum JSON."""
    if not os.path.exists(_CURRICULUM_PATH):
        return []
    try:
        with open(_CURRICULUM_PATH, "r") as f:
            labs = json.load(f)
        return [lab for lab in labs if not lab.get("disabled", False)]
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to load local curriculum: %s", e)
        return []


# ── Routes ────────────────────────────────────────────────────────────────────

async def _build_infrasec_curriculum(background_tasks: BackgroundTasks | None = None) -> list[dict[str, Any]]:
    """Return local labs combined with live CISA KEV threat intelligence."""
    labs = _load_local_labs()
    try:
        live_threats = await get_cached_cisa_kev(background_tasks)
        for idx, threat in enumerate(live_threats):
            labs.append(_build_live_challenge(threat, 100 + idx))
    except Exception as e:
        logger.error("Failed to integrate live CISA threats: %s", e)
    return labs


@router.get("/curriculum", response_model=list[dict])
async def get_infrasec_curriculum(background_tasks: BackgroundTasks) -> list[dict[str, Any]]:
    return await _build_infrasec_curriculum(background_tasks)


@router.get("/level/{level_id}", response_model=dict)
async def get_infrasec_level(level_id: int) -> dict[str, Any]:
    """Return details for a specific InfraSec level by its numeric ID."""
    curriculum = await _build_infrasec_curriculum()
    for challenge in curriculum:
        if challenge["level"] == level_id:
            return challenge
    return {"error": "Level not found", "status": 404}
