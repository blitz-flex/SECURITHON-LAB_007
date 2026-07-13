"""
InfraSec Endpoint
Serves the InfraSec curriculum combined with live CISA KEV threat intelligence.
"""
import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks

logger = logging.getLogger(__name__)
router = APIRouter()

_CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "curriculum.json")
_CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_CISA_CACHE_TTL_SECONDS = int(os.getenv("CISA_CACHE_TTL_SECONDS", str(60 * 60)))
_CISA_KEV_REFRESH_MODE = os.getenv("CISA_KEV_REFRESH_MODE", "weekly").strip().lower()
_LIVE_THREAT_LIMIT_PER_YEAR = 20
_LIVE_THREAT_YEARS = set(range(2025, 2027))
_UNLIMITED_LIVE_THREAT_YEARS = {2026}
_INFRASEC_TRACK_YEARS = {2025}
_TRACK_TARGET_PER_YEAR = 5
_TRACK_GROUPS = (
    "Cloud-Native Configuration",
    "Secret Management & IAM",
    "Zero-Trust Network Segmentation",
    "Terraform State & Drift Detection",
)
_cisa_cache_lock = asyncio.Lock()
_cisa_kev_cache: dict[str, Any] = {
    "items": [],
    "fetched_at": 0.0,
    "fetched_at_wall": None,
    "refreshing": False,
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_week_key(dt: datetime) -> str:
    year, week, _ = dt.isocalendar()
    return f"{year}-W{week:02d}"


def _seconds_until_week_end() -> float:
    """Seconds until Sunday 23:59:59 UTC (end of the ISO week)."""
    now = _utc_now()
    days_until_sunday = 7 - now.isocalendar().weekday
    week_end = (now + timedelta(days=days_until_sunday)).replace(
        hour=23, minute=59, second=59, microsecond=0,
    )
    if days_until_sunday == 0 and now >= week_end:
        week_end += timedelta(days=7)
    return max(1.0, (week_end - now).total_seconds())


def _cached_cisa_kev_is_fresh(now: float | None = None) -> bool:
    """Return whether the in-memory CISA cache is still fresh for the current refresh policy."""
    if not _cisa_kev_cache["items"]:
        return False

    if _CISA_KEV_REFRESH_MODE == "weekly":
        fetched_wall = _cisa_kev_cache.get("fetched_at_wall")
        if fetched_wall:
            fetch_dt = datetime.fromisoformat(str(fetched_wall))
            return _iso_week_key(fetch_dt) == _iso_week_key(_utc_now())

    fetched_at = float(_cisa_kev_cache.get("fetched_at") or 0.0)
    return fetched_at > 0 and ((now or time.monotonic()) - fetched_at) < _CISA_CACHE_TTL_SECONDS

# ── CVE → Lab scenario mapping ────────────────────────────────────────────────

_TRACK_SCENARIOS: dict[str, dict] = {
    "Cloud-Native Configuration": {
        "keywords": (
            "cloud", "kubernetes", "k8s", "container", "docker", "s3", "bucket",
            "azure", "gcp", "aws", "metadata", "orchestration", "configuration",
        ),
        "file": "cloud_native_config.tf",
        "code": [
            'resource "aws_security_group" "cluster_api" {',
            '  ingress { cidr_blocks = ["0.0.0.0/0"] }',
            '  tags = { public_control_plane = "true" }',
            "}",
        ],
        "cwe": "CWE-16", "cvss": 6.5,
        "briefing": "A cloud or container setting is too open. Services that should stay private may be reachable from the internet.",
        "hint": "Restrict public ingress and enforce private control-plane or storage access controls.",
        "task": "Harden the cloud-native resource configuration to remove public exposure.",
    },
    "Secret Management & IAM": {
        "keywords": (
            "credential", "credentials", "password", "secret", "token", "key",
            "authentication", "authorization", "auth bypass", "iam", "ldap",
            "privilege", "access control", "session", "jwt", "saml",
        ),
        "file": "iam_secret_policy.tf",
        "code": [
            'variable "api_token" { default = "HARDCODED_SECRET_VALUE" }',
            'resource "aws_iam_policy" "app" {',
            '  policy = jsonencode({ Action = "*", Resource = "*" })',
            "}",
        ],
        "cwe": "CWE-798", "cvss": 8.8,
        "briefing": "Secrets are exposed or permissions are too broad. One compromised service can gain far more access than it should.",
        "hint": "Source secrets from a managed store and scope IAM actions/resources to least privilege.",
        "task": "Remove hard-coded secrets and replace wildcard IAM access with least-privilege permissions.",
    },
    "Zero-Trust Network Segmentation": {
        "keywords": (
            "vpn", "firewall", "gateway", "proxy", "network", "remote access",
            "ssrf", "server-side request forgery", "citrix", "fortinet", "palo alto",
            "f5", "cisco", "ivanti", "sonicwall", "router", "edge",
        ),
        "file": "zero_trust_segments.yaml",
        "code": [
            "segment: prod-admin",
            'allowed_cidrs: ["0.0.0.0/0"]',
            "identity_required: false",
        ],
        "cwe": "CWE-284", "cvss": 8.1,
        "briefing": "Network access is too permissive. A flaw at the edge can let an attacker reach internal admin services.",
        "hint": "Require identity-aware access and narrow the allowed source ranges or service identities.",
        "task": "Enforce zero-trust segmentation by removing open CIDRs and requiring identity-aware access.",
    },
    "Terraform State & Drift Detection": {
        "keywords": (
            "terraform", "state", "drift", "infrastructure as code", "iac",
            "template", "provision", "configuration", "misconfiguration", "patch",
            "appliance", "management", "admin console",
        ),
        "file": "terraform_state_backend.tf",
        "code": [
            'terraform { backend "s3" {',
            '  bucket = "prod-tf-state"',
            "  encrypt = false",
            "} }",
        ],
        "cwe": "CWE-922", "cvss": 7.5,
        "briefing": "Infrastructure state is stored or managed insecurely. Old vulnerable settings can remain even after a quick fix.",
        "hint": "Enable encrypted remote state with locking and add drift detection to the deployment workflow.",
        "task": "Secure Terraform state storage and add drift detection controls for the affected infrastructure.",
    },
}

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


_THREAT_GROUP_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Authentication Bypass", ("authentication bypass", "auth bypass", "authorization bypass")),
    ("Arbitrary File Upload", ("file upload", "upload vulnerability", "unrestricted upload")),
    ("Server-Side Request Forgery", ("server-side request forgery", "ssrf")),
    ("Hard-Coded Credentials", ("hard-coded credential", "hardcoded credential", "default credential")),
    ("Remote Code Execution", ("remote code execution", "rce", "command injection")),
    ("SQL Injection", ("sql injection", "injection", "database")),
    ("Path Traversal", ("path traversal", "directory traversal", "file read")),
    ("Cross-Site Scripting", ("cross-site scripting", "xss")),
    ("Cloud Misconfiguration", ("s3", "bucket", "iam", "policy")),
]

_ATTACK_THEME_PHRASES: tuple[tuple[str, str], ...] = (
    ("remote code execution", "Remote Code Execution"),
    ("server-side request forgery", "Server-Side Request Forgery"),
    ("authentication bypass", "Authentication Bypass"),
    ("authorization bypass", "Authorization Bypass"),
    ("command injection", "Command Injection"),
    ("code injection", "Code Injection"),
    ("sql injection", "SQL Injection"),
    ("path traversal", "Path Traversal"),
    ("directory traversal", "Directory Traversal"),
    ("cross-site scripting", "Cross-Site Scripting"),
    ("privilege escalation", "Privilege Escalation"),
    ("file upload", "File Upload"),
    ("hard-coded credential", "Hard-Coded Credentials"),
    ("buffer overflow", "Buffer Overflow"),
    ("denial of service", "Denial of Service"),
    ("information disclosure", "Information Disclosure"),
    ("deserialization", "Deserialization"),
    ("misconfiguration", "Misconfiguration"),
)

_PRODUCT_ABBREV_RE = re.compile(r"\(([A-Z][A-Za-z0-9-]+)\)")

_REMEDIATION_BY_TRACK: dict[str, str] = {
    "Cloud-Native Configuration": "close public access and tighten cloud settings",
    "Secret Management & IAM": "use managed secrets and limit permissions",
    "Zero-Trust Network Segmentation": "validate input and tighten network access rules",
    "Terraform State & Drift Detection": "encrypt state storage and monitor configuration drift",
}


def _match_scenario(description: str) -> dict:
    """Return the best matching scenario for a CVE description."""
    desc = description.lower()
    for scenario in _TRACK_SCENARIOS.values():
        if any(k in desc for k in scenario["keywords"]):
            return scenario
    for scenario in _KEYWORD_SCENARIOS:
        if any(k in desc for k in scenario["keywords"]):
            return scenario
    return _DEFAULT_SCENARIO


def _extract_cve_year(cve_id: str) -> int | None:
    match = re.match(r"^CVE-(\d{4})-\d+$", str(cve_id))
    return int(match.group(1)) if match else None


def _extract_date_month(cve: dict) -> str | None:
    date_added = str(cve.get("dateAdded", ""))
    return date_added[:7] if re.match(r"^\d{4}-\d{2}", date_added) else None


def _threat_text(cve: dict) -> str:
    return " ".join(
        str(cve.get(field, ""))
        for field in ("cveID", "vendorProject", "product", "vulnerabilityName", "shortDescription")
    ).lower()


def _classify_threat_group(cve: dict) -> str:
    text = _threat_text(cve)
    for group, keywords in _THREAT_GROUP_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return group
    return "Configuration Hardening"


def _product_abbrev(vuln_name: str) -> str | None:
    match = _PRODUCT_ABBREV_RE.search(vuln_name)
    return match.group(1) if match else None


def _target_vendor(cve: dict) -> str:
    return str(cve.get("vendorProject", "")).strip()


def _target_product(cve: dict) -> str:
    vuln_name = str(cve.get("vulnerabilityName", ""))
    abbrev = _product_abbrev(vuln_name)
    if abbrev:
        return abbrev

    product = str(cve.get("product", "")).strip()
    if not product:
        return ""

    words = product.split()
    if len(words) > 3:
        product = " ".join(words[:3])
    if len(product) > 28:
        product = product[:25].rstrip() + "..."
    return product


def _vendor_product_label(vendor: str, product: str) -> str:
    if vendor and product:
        return f"{vendor} {product}"
    return vendor or product


def _attack_theme(cve: dict, threat_group: str) -> str:
    vuln_name = str(cve.get("vulnerabilityName", "")).lower()
    for phrase, label in _ATTACK_THEME_PHRASES:
        if phrase in vuln_name:
            return label

    short_description = str(cve.get("shortDescription", "")).lower()
    for phrase, label in _ATTACK_THEME_PHRASES:
        if phrase in short_description:
            return label

    return threat_group


def _remediation_theme(track_group: str, scenario: dict) -> str:
    if track_group in _REMEDIATION_BY_TRACK:
        return _REMEDIATION_BY_TRACK[track_group]
    task = str(scenario.get("task", "")).strip()
    return task if len(task) <= 72 else task[:69].rstrip() + "..."


def _build_display_title(
    cve_id: str,
    vendor_product: str,
    attack_theme: str,
    threat_group: str,
) -> str:
    if vendor_product:
        return f"{cve_id} · {vendor_product} · {attack_theme}"
    return f"{cve_id} · {threat_group}"


def _build_target_label(vendor_product: str, attack_theme: str) -> str:
    if vendor_product:
        return f"{vendor_product} · {attack_theme}"
    return attack_theme


def _build_situation_report(
    cve: dict,
    cve_id: str,
    threat_group: str,
    track_group: str,
    attack_theme: str,
    vendor_product: str,
    scenario: dict,
    remediation_theme: str,
    year: int | None,
) -> str:
    """Compose a clear, professional situation report for the intelligence brief pane."""
    description = str(cve.get("shortDescription", "")).strip()
    vuln_name = str(cve.get("vulnerabilityName", "")).strip()
    ransomware = str(cve.get("knownRansomwareCampaignUse", "")).lower()
    target = vendor_product or vuln_name or "the affected system"
    scenario_briefing = str(scenario.get("briefing", "")).strip()
    task = str(scenario.get("task", "")).strip()

    abuse_line = (
        "This flaw has been used in ransomware attacks."
        if ransomware == "known"
        else "CISA confirms attackers are using this flaw in production today."
    )

    overview = description or vuln_name or "No public summary is available for this entry."

    sections = [
        (
            f"What happened ({cve_id})\n"
            f"{overview}\n\n"
            f"This exercise uses a real entry from the CISA Known Exploited Vulnerabilities list. "
            f"The code in the editor reflects the same type of weakness: {attack_theme}."
        ),
        (
            f"What is at risk\n"
            f"System: {target}\n"
            f"Issue type: {attack_theme}\n"
            f"Training focus: {track_group}\n"
            f"Threat category: {threat_group}\n\n"
            f"{abuse_line} After the first break-in, attackers often try to reach other systems or steal credentials."
        ),
        (
            f"What to check\n"
            f"{scenario_briefing}\n\n"
            f"Look at the sample code for unsafe defaults, missing validation, or permissions that are too wide. "
            f"Assume an external attacker can already reach this weakness."
        ),
        (
            f"What you need to do\n"
            f"Open the patch interface and fix the vulnerable code or configuration. "
            f"Remove the {attack_theme.lower()} risk without breaking normal use.\n\n"
            f"Recommended approach: {remediation_theme}."
            + (f"\nYou succeed when: {task}" if task else "")
        ),
    ]
    return "\n\n".join(sections)


def _classify_track_group(cve: dict) -> str:
    if cve.get("_track_group") in _TRACK_GROUPS:
        return str(cve["_track_group"])

    text = _threat_text(cve)
    for track, scenario in _TRACK_SCENARIOS.items():
        if any(keyword in text for keyword in scenario["keywords"]):
            return track
    return "Terraform State & Drift Detection"


def _risk_score(cve: dict) -> tuple[float, int, str, str]:
    """Rank known exploited vulnerabilities by lab severity, active abuse signal, and recency."""
    text = _threat_text(cve)
    scenario = _match_scenario(text)
    ransomware_use = str(cve.get("knownRansomwareCampaignUse", "")).lower()
    active_abuse_bonus = 1 if ransomware_use == "known" else 0
    return (
        float(scenario["cvss"]) + active_abuse_bonus,
        _extract_cve_year(str(cve.get("cveID", ""))) or 0,
        str(cve.get("dateAdded", "")),
        str(cve.get("cveID", "")),
    )


def _live_threat_limit_for_year(year: int | None) -> int:
    if year in _UNLIMITED_LIVE_THREAT_YEARS:
        return 0
    return _LIVE_THREAT_LIMIT_PER_YEAR


def _year_for_threat(cve: dict) -> int | None:
    return cve.get("_year") or _extract_cve_year(str(cve.get("cveID", "")))


def _difficulty_for_year_rank(year_rank: int, year_limit: int) -> str:
    if year_limit <= 0:
        year_limit = _LIVE_THREAT_LIMIT_PER_YEAR
    if year_rank <= max(1, year_limit // 4):
        return "Easy"
    if year_rank <= max(1, year_limit // 2):
        return "Medium"
    if year_rank <= max(1, (year_limit * 3) // 4):
        return "Hard"
    return "Critical"


def _sample_progression(threats: list[dict], limit: int) -> list[dict]:
    if len(threats) <= limit:
        return list(threats)

    last_index = len(threats) - 1
    indexes = {
        round(position * last_index / (limit - 1))
        for position in range(limit)
    }

    selected_indexes = sorted(indexes)
    cursor = 0
    while len(selected_indexes) < limit and cursor <= last_index:
        if cursor not in indexes:
            selected_indexes.append(cursor)
            indexes.add(cursor)
        cursor += 1

    return [threats[index] for index in sorted(selected_indexes[:limit])]


def _fallback_track_threat(year: int, track: str, ordinal: int) -> dict:
    scenario = _TRACK_SCENARIOS[track]
    slug = track.split()[0].upper().replace("-", "")
    month = min(12, ordinal + 1)
    return {
        "cveID": f"HARDEN-{year}-{slug}-{ordinal:02d}",
        "vendorProject": "InfraSec Hardening",
        "product": track,
        "vulnerabilityName": f"{track} Hardening Scenario {ordinal}",
        "shortDescription": f"{track} fallback scenario: {scenario['briefing']}",
        "dateAdded": f"{year}-{month:02d}-15",
        "_year": year,
        "_track_group": track,
        "_is_fallback": True,
    }


def _select_infrasec_year_threats(year: int, threats: list[dict]) -> list[dict]:
    selected: list[dict] = []
    for track in _TRACK_GROUPS:
        track_threats = sorted(
            [threat for threat in threats if _classify_track_group(threat) == track],
            key=_risk_score,
        )
        selected.extend(_sample_progression(track_threats, _TRACK_TARGET_PER_YEAR))
        missing = _TRACK_TARGET_PER_YEAR - min(len(track_threats), _TRACK_TARGET_PER_YEAR)
        for ordinal in range(1, missing + 1):
            selected.append(_fallback_track_threat(year, track, ordinal))

    return sorted(selected[:_LIVE_THREAT_LIMIT_PER_YEAR], key=_risk_score)


def _select_top_live_threats(vulnerabilities: list[dict]) -> list[dict]:
    threats_by_year: dict[int, list[dict]] = {year: [] for year in _LIVE_THREAT_YEARS}
    for cve in vulnerabilities:
        year = _year_for_threat(cve)
        if year in threats_by_year:
            threats_by_year[year].append(cve)

    selected: list[dict] = []
    for year in sorted(threats_by_year, reverse=True):
        if not threats_by_year[year]:
            continue
        year_limit = _live_threat_limit_for_year(year)
        if year in _UNLIMITED_LIVE_THREAT_YEARS:
            year_threats = sorted(
                threats_by_year[year],
                key=lambda threat: (_extract_date_month(threat) or "", str(threat.get("dateAdded", "")), _risk_score(threat)),
                reverse=True,
            )
            effective_limit = len(year_threats)
        elif year in _INFRASEC_TRACK_YEARS:
            year_threats = _select_infrasec_year_threats(year, threats_by_year[year])
            effective_limit = year_limit
        else:
            year_threats = _sample_progression(sorted(threats_by_year[year], key=_risk_score), year_limit)
            effective_limit = year_limit
        for year_rank, threat in enumerate(year_threats, start=1):
            selected.append(
                {
                    **threat,
                    "_year": year,
                    "_year_rank": year_rank,
                    "_year_limit": effective_limit,
                    "_month": _extract_date_month(threat),
                    "_track_group": _classify_track_group(threat),
                    "_lab_difficulty": _difficulty_for_year_rank(year_rank, effective_limit),
                }
            )
    return selected


def _build_live_challenge(cve: dict, challenge_id: int) -> dict:
    """Map a CISA KEV CVE entry to a lab challenge dict."""
    cve_id = cve.get("cveID", "CVE-UNKNOWN")
    vuln_name = cve.get("vulnerabilityName", "Unknown Vulnerability")
    description = cve.get("shortDescription", "")
    year = _year_for_threat(cve)
    month = cve.get("_month") or _extract_date_month(cve)
    threat_group = _classify_threat_group(cve)
    track_group = _classify_track_group(cve)
    scenario = _match_scenario(_threat_text(cve))
    target_vendor = _target_vendor(cve)
    target_product = _target_product(cve)
    vendor_product = _vendor_product_label(target_vendor, target_product)
    attack_theme = _attack_theme(cve, threat_group)
    display_title = _build_display_title(cve_id, vendor_product, attack_theme, threat_group)
    target_label = _build_target_label(vendor_product, attack_theme)
    remediation_theme = _remediation_theme(track_group, scenario)
    situation_report = _build_situation_report(
        cve,
        cve_id,
        threat_group,
        track_group,
        attack_theme,
        vendor_product,
        scenario,
        remediation_theme,
        year,
    )

    vuln_code = [{"n": i + 1, "t": line, "vuln": i > 0} for i, line in enumerate(scenario["code"])]

    return {
        "level": challenge_id,
        "difficulty": cve.get("_lab_difficulty") or ("Critical" if scenario["cvss"] >= 9 else "High"),
        "category": f"{year or 'Unknown'} / {track_group}",
        "id": f"LIVE_REAL_{challenge_id}",
        "title": display_title,
        "display_title": display_title,
        "target_label": target_label,
        "target_vendor": target_vendor or None,
        "target_product": target_product or None,
        "attack_theme": attack_theme,
        "remediation_theme": remediation_theme,
        "cve_id": cve_id,
        "description": description,
        "real_source": "CISA KEV (Global Feed)",
        "year": year,
        "month": month,
        "track_group": track_group,
        "threat_group": threat_group,
        "top_rank": challenge_id - 99,
        "year_rank": cve.get("_year_rank"),
        "year_limit": cve.get("_year_limit") or _live_threat_limit_for_year(year),
        "cvss": scenario["cvss"],
        "cwe": scenario["cwe"],
        "task": scenario["task"],
        "briefing": situation_report,
        "situation_report": situation_report,
        "hint": scenario["hint"],
        "file_context": scenario["file"],
        "vulnCode": vuln_code,
        "is_live": True,
    }


def clear_cisa_kev_cache() -> None:
    """Discard all cached CISA KEV entries so the next read starts fresh."""
    _cisa_kev_cache.update({
        "items": [],
        "fetched_at": 0.0,
        "fetched_at_wall": None,
        "refreshing": False,
    })


async def _fetch_cisa_kev() -> list[dict]:
    """Fetch the latest known exploited vulnerabilities directly from CISA KEV."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_CISA_KEV_URL)
        resp.raise_for_status()
        return _select_top_live_threats(resp.json().get("vulnerabilities", []))


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
            _cisa_kev_cache.update({
                "items": threats,
                "fetched_at": time.monotonic(),
                "fetched_at_wall": _utc_now().isoformat(),
            })
            logger.info(
                "CISA KEV cache refreshed with %s vulnerabilities (mode=%s, week=%s).",
                len(threats),
                _CISA_KEV_REFRESH_MODE,
                _iso_week_key(_utc_now()),
            )
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


async def warm_cisa_kev_cache() -> None:
    """Load CISA KEV on startup or when the weekly window has rolled over."""
    try:
        await refresh_cisa_kev_cache(force=False)
    except Exception as e:
        logger.warning("CISA KEV warm cache failed: %s", e)


async def run_cisa_kev_weekly_refresh_worker() -> None:
    """Refresh CISA KEV every Sunday at 23:59 UTC so 2026 live CVEs update weekly."""
    if _CISA_KEV_REFRESH_MODE != "weekly":
        return

    logger.info("CISA KEV weekly refresh worker started.")
    while True:
        wait_seconds = _seconds_until_week_end()
        logger.info("CISA KEV next weekly refresh in %.0f seconds.", wait_seconds)
        await asyncio.sleep(wait_seconds)
        try:
            await refresh_cisa_kev_cache(force=True)
            logger.info("CISA KEV weekly scheduled refresh completed.")
        except Exception as e:
            logger.warning("CISA KEV weekly scheduled refresh failed: %s", e)
        await asyncio.sleep(90)


def _load_local_labs() -> list[dict]:
    """Load and return enabled labs from the local curriculum JSON."""
    if not os.path.exists(_CURRICULUM_PATH):
        return []
    try:
        with open(_CURRICULUM_PATH, "r", encoding="utf-8") as f:
            labs = json.load(f)
        return [lab for lab in labs if not lab.get("disabled", False)]
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to load local curriculum: %s", e)
        return []


# ── Routes ────────────────────────────────────────────────────────────────────

async def _build_infrasec_curriculum(
    background_tasks: BackgroundTasks | None = None,
    refresh: bool = False,
) -> list[dict[str, Any]]:
    """Return local labs combined with yearly grouped CISA KEV threat intelligence."""
    labs = _load_local_labs()
    try:
        if refresh:
            clear_cisa_kev_cache()
            live_threats = await refresh_cisa_kev_cache(force=True)
        else:
            live_threats = await get_cached_cisa_kev(background_tasks)
        for idx, threat in enumerate(live_threats):
            labs.append(_build_live_challenge(threat, 100 + idx))
    except Exception as e:
        logger.error("Failed to integrate live CISA threats: %s", e)
    return labs


@router.get("/curriculum", response_model=list[dict])
async def get_infrasec_curriculum(
    background_tasks: BackgroundTasks,
    refresh: bool = False,
) -> list[dict[str, Any]]:
    return await _build_infrasec_curriculum(background_tasks, refresh)


@router.get("/live-feed-status")
async def get_live_feed_status() -> dict[str, Any]:
    """Lightweight status for UI polling — detects weekly CISA KEV cache updates."""
    import hashlib

    items = _cisa_kev_cache.get("items", [])
    cve_ids = sorted(str(item.get("cveID", "")) for item in items if item.get("cveID"))
    revision = hashlib.sha256("\n".join(cve_ids).encode()).hexdigest()[:16] if cve_ids else "empty"
    live_2026 = sum(1 for cve_id in cve_ids if cve_id.startswith("CVE-2026-"))

    return {
        "refresh_mode": _CISA_KEV_REFRESH_MODE,
        "iso_week": _iso_week_key(_utc_now()),
        "fetched_at_wall": _cisa_kev_cache.get("fetched_at_wall"),
        "live_count": len(items),
        "live_2026_count": live_2026,
        "revision": revision,
    }


@router.get("/level/{level_id}", response_model=dict)
async def get_infrasec_level(level_id: int) -> dict[str, Any]:
    """Return details for a specific InfraSec level by its numeric ID."""
    curriculum = await _build_infrasec_curriculum()
    for challenge in curriculum:
        if challenge["level"] == level_id:
            return challenge
    return {"error": "Level not found", "status": 404}
