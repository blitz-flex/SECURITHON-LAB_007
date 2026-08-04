"""
AppSec Fortress Endpoint
Serves the live-enriched application security curriculum.
Fetches real-world CVEs, GHSA advisories, and CNCF policies dynamically.
"""
import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter

from app.services.appsec_intel_service import (
    fetch_artifact_hub_policies,
    fetch_github_advisory,
    fetch_nvd_cwe_intel,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "appsec_curriculum.json")


def load_appsec_curriculum() -> list[dict]:
    """Load enabled AppSec Fortress labs from curriculum source."""
    with open(_CURRICULUM_PATH, encoding="utf-8") as f:
        labs = json.load(f)
    return [lab for lab in labs if not lab.get("disabled", False)]


async def _enrich_lab(lab: dict[str, Any]) -> dict[str, Any]:
    """Dynamically enrich a lab item with live external threat intelligence without distorting lab identity."""
    enriched = dict(lab)
    stage = lab.get("stage")
    query = lab.get("intel_query", {})

    # Ensure authentic lab identity and cve_id are preserved
    enriched["cve_id"] = lab.get("cve_id") or lab.get("cwe") or lab.get("id")
    enriched["display_title"] = lab.get("title")
    enriched["target_label"] = lab.get("title")
    enriched["situation_report"] = lab.get("briefing") or lab.get("task")

    try:
        if stage == "commit" and "nvd_cwe" in query:
            intel = await asyncio.wait_for(fetch_nvd_cwe_intel(query["nvd_cwe"]), timeout=1.5)
            if intel:
                top = intel[0]
                enriched["external_advisory"] = top.get("description") or top.get("summary")

        elif stage == "build" and "github_package" in query:
            eco = query.get("github_ecosystem", "npm")
            pkg = query.get("github_package")
            intel = await asyncio.wait_for(fetch_github_advisory(eco, pkg), timeout=1.5)
            if intel:
                top = intel[0]
                enriched["external_advisory"] = top.get("summary")

        elif stage == "cluster" and "k8s_cwe" in query:
            intel = await asyncio.wait_for(fetch_artifact_hub_policies(query["k8s_cwe"]), timeout=1.5)
            if intel:
                top = intel[0]
                enriched["external_advisory"] = top.get("description")

    except Exception as exc:
        logger.warning("Failed to dynamically enrich lab %s: %s", lab.get("id"), exc)

    return enriched


@router.get("/curriculum")
async def get_appsec_curriculum() -> list[dict]:
    """Return the live-enriched AppSec Fortress lab catalog."""
    base_labs = load_appsec_curriculum()
    enriched_labs = await asyncio.gather(*[_enrich_lab(lab) for lab in base_labs])
    return list(enriched_labs)
