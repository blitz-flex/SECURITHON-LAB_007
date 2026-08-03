"""
AppSec Fortress — Intel Proxy Endpoints
Serves contextual threat intelligence from NVD, GitHub Advisory, and Artifact Hub.
All responses are fail-closed: empty arrays on API failure.
"""
import re

from fastapi import APIRouter, HTTPException, status

from app.services.appsec_intel_service import (
    fetch_artifact_hub_policies,
    fetch_github_advisory,
    fetch_nvd_cwe_intel,
)

router = APIRouter()

_CWE_RE = re.compile(r"^CWE-\d{1,5}$")
_PKG_RE = re.compile(r"^[a-zA-Z0-9@_.\-/]{1,128}$")
_ECO_RE = re.compile(r"^(npm|pypi|maven|go|nuget|rubygems|pip)$", re.IGNORECASE)


@router.get("/cwe/{cwe_id}")
async def get_cwe_intel(cwe_id: str) -> list[dict]:
    """Return real-world CVE context for a CWE from NVD NIST."""
    if not _CWE_RE.match(cwe_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid CWE ID format.")
    return await fetch_nvd_cwe_intel(cwe_id)


@router.get("/supply/{ecosystem}/{package}")
async def get_supply_intel(ecosystem: str, package: str) -> list[dict]:
    """Return GitHub Security Advisories for a package."""
    if not _ECO_RE.match(ecosystem):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ecosystem.")
    if not _PKG_RE.match(package):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package name.")
    return await fetch_github_advisory(ecosystem, package)


@router.get("/k8s/{cwe_id}")
async def get_k8s_policy_intel(cwe_id: str) -> list[dict]:
    """Return CNCF/Artifact Hub Kubernetes security policies for a CWE."""
    if not _CWE_RE.match(cwe_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid CWE ID format.")
    return await fetch_artifact_hub_policies(cwe_id)
