"""
AppSec Fortress — External Threat Intelligence Service
Fetches contextual security data from NVD NIST, GitHub Advisory, and Artifact Hub.
All calls are fail-closed: if an API is unreachable, empty/fallback data is returned.
"""
import asyncio
import logging
import re
import time
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Input Validators ──────────────────────────────────────────────────────────
_CWE_PATTERN = re.compile(r"^CWE-\d{1,5}$")
_PACKAGE_PATTERN = re.compile(r"^[a-zA-Z0-9@_.\-/]{1,128}$")
_ECOSYSTEM_PATTERN = re.compile(r"^(npm|pypi|maven|go|nuget|rubygems|pip)$", re.IGNORECASE)
_K8S_RULE_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")


def _is_valid_cwe(cwe_id: str) -> bool:
    return bool(_CWE_PATTERN.match(cwe_id))


def _is_valid_package(name: str) -> bool:
    return bool(_PACKAGE_PATTERN.match(name))


def _is_valid_ecosystem(eco: str) -> bool:
    return bool(_ECOSYSTEM_PATTERN.match(eco))


def _is_valid_k8s_rule(rule_id: str) -> bool:
    return bool(_K8S_RULE_PATTERN.match(rule_id))


# ── In-Memory Cache ───────────────────────────────────────────────────────────
_cache: dict[str, dict[str, Any]] = {}
_NVD_TTL = 12 * 3600       # 12 hours
_GITHUB_TTL = 6 * 3600     # 6 hours
_ARTIFACT_TTL = 24 * 3600  # 24 hours


def _cache_get(key: str, ttl: float) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry["ts"]) < ttl:
        return entry["data"]
    return None


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = {"data": data, "ts": time.monotonic()}


# ── NVD NIST API ──────────────────────────────────────────────────────────────
async def fetch_nvd_cwe_intel(cwe_id: str) -> list[dict]:
    """Fetch top 5 real-world CVEs for a given CWE from NVD NIST API v2."""
    if not _is_valid_cwe(cwe_id):
        return []

    cache_key = f"nvd:{cwe_id}"
    cached = _cache_get(cache_key, _NVD_TTL)
    if cached is not None:
        return cached

    try:
        headers = {}
        if getattr(settings, "NVD_API_KEY", None):
            headers["apiKey"] = settings.NVD_API_KEY

        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                "https://services.nvd.nist.gov/rest/json/cves/2.0",
                params={"cweId": cwe_id, "resultsPerPage": 5},
                headers=headers,
            )
            r.raise_for_status()

        vulns = r.json().get("vulnerabilities", [])
        result = []
        for v in vulns:
            cve = v.get("cve", {})
            descriptions = cve.get("descriptions", [])
            en_desc = next((d["value"] for d in descriptions if d.get("lang") == "en"), "")
            metrics = cve.get("metrics", {})
            cvss_score = None
            severity = None
            for metric_key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
                metric_list = metrics.get(metric_key, [])
                if metric_list:
                    cvss_data = metric_list[0].get("cvssData", {})
                    cvss_score = cvss_data.get("baseScore")
                    severity = cvss_data.get("baseSeverity", metric_list[0].get("baseSeverity"))
                    break

            result.append({
                "id": cve.get("id", "N/A"),
                "description": en_desc[:250] if en_desc else "No description available.",
                "cvss_score": cvss_score,
                "severity": severity,
                "published": cve.get("published", "")[:10],
            })

        _cache_set(cache_key, result)
        return result

    except Exception as exc:
        logger.warning("NVD API fetch failed for %s: %s", cwe_id, exc)
        return []


# ── GitHub Advisory Database API ──────────────────────────────────────────────
async def fetch_github_advisory(ecosystem: str, package: str) -> list[dict]:
    """Fetch GitHub Security Advisories for a given ecosystem/package."""
    if not _is_valid_ecosystem(ecosystem) or not _is_valid_package(package):
        return []

    eco_upper = ecosystem.upper()
    eco_map = {"PYPI": "PIP", "NPM": "NPM", "MAVEN": "MAVEN", "GO": "GO", "NUGET": "NUGET", "RUBYGEMS": "RUBYGEMS", "PIP": "PIP"}
    gh_eco = eco_map.get(eco_upper, eco_upper)

    cache_key = f"ghsa:{gh_eco}:{package}"
    cached = _cache_get(cache_key, _GITHUB_TTL)
    if cached is not None:
        return cached

    try:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if getattr(settings, "GITHUB_TOKEN", None):
            headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                "https://api.github.com/advisories",
                params={
                    "ecosystem": gh_eco.lower(),
                    "package": package,
                    "per_page": 3,
                    "sort": "updated",
                    "direction": "desc",
                },
                headers=headers,
            )
            r.raise_for_status()

        advisories = r.json() if isinstance(r.json(), list) else []
        result = []
        for adv in advisories[:3]:
            result.append({
                "ghsa_id": adv.get("ghsa_id", "N/A"),
                "cve_id": adv.get("cve_id"),
                "summary": (adv.get("summary") or "")[:200],
                "severity": adv.get("severity", "unknown"),
                "published_at": (adv.get("published_at") or "")[:10],
                "html_url": adv.get("html_url", ""),
            })

        _cache_set(cache_key, result)
        return result

    except Exception as exc:
        logger.warning("GitHub Advisory fetch failed for %s/%s: %s", ecosystem, package, exc)
        return []


# ── Artifact Hub / CNCF API ───────────────────────────────────────────────────
_K8S_POLICY_QUERIES: dict[str, str] = {
    "CWE-250": "non-root container",
    "CWE-269": "privileged container",
    "CWE-732": "read-only filesystem secret",
    "CWE-400": "resource limits quota",
    "CWE-284": "network policy deny",
}


async def fetch_artifact_hub_policies(cwe_id: str) -> list[dict]:
    """Fetch relevant Kubernetes security policies from Artifact Hub."""
    if not _is_valid_cwe(cwe_id):
        return []

    search_query = _K8S_POLICY_QUERIES.get(cwe_id)
    if not search_query:
        return []

    cache_key = f"ahub:{cwe_id}"
    cached = _cache_get(cache_key, _ARTIFACT_TTL)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                "https://artifacthub.io/api/v1/packages/search",
                params={
                    "ts_query_web": search_query,
                    "kind": 13,  # OPA/Gatekeeper policies
                    "sort": "relevance",
                    "limit": 3,
                    "facets": "false",
                },
            )
            r.raise_for_status()

        data = r.json()
        packages = data.get("packages", []) if isinstance(data, dict) else data if isinstance(data, list) else []
        result = []
        for pkg in packages[:3]:
            repo = pkg.get("repository", {})
            result.append({
                "name": pkg.get("name", "N/A"),
                "description": (pkg.get("description") or "")[:200],
                "version": pkg.get("version", ""),
                "repository": repo.get("name", ""),
                "url": f"https://artifacthub.io/packages/search?ts_query_web={search_query.replace(' ', '+')}&kind=13",
            })

        _cache_set(cache_key, result)
        return result

    except Exception as exc:
        logger.warning("Artifact Hub fetch failed for %s: %s", cwe_id, exc)
        return []
