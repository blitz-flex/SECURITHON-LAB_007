"""
Compute dashboard Tactical Status metrics from user profile + lab progress.
"""
from __future__ import annotations

import json
import os
from typing import Any

from app.services.arena_service import ArenaService

_CURRICULUM_PATHS = (
    os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "api",
        "v1",
        "endpoints",
        "curriculum.json",
    ),
    os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "api",
        "v1",
        "endpoints",
        "appsec_curriculum.json",
    ),
)

# Curriculum category → skill matrix pillar
_CATEGORY_PILLAR: dict[str, str] = {
    "Web Security": "exploitation",
    "Identity & Access": "defense",
    "Infrastructure": "cloud_security",
    "Cloud Security": "cloud_security",
    # AppSec Curriculum
    "Secure Code Analysis (SAST)": "exploitation",
    "OWASP API & Auth Flaws": "defense",
    "Dependency & Supply-Chain Review": "analysis",
    "Container Hardening (K8s)": "cloud_security",
    # Legacy / Live / Dynamic categories
    "Identity & Secrets": "defense",
    "Infrastructure as Code": "cloud_security",
    "Network Security": "defense",
    "Container Security": "cloud_security",
    "Kubernetes Security": "cloud_security",
    "Cloud Architecture": "cloud_security",
    "Serverless Security": "cloud_security",
    "CI/CD Security": "cloud_security",
    "Global Threat Feed": "exploitation",
}

_PILLARS = ("exploitation", "defense", "analysis", "cloud_security")


def _load_enabled_labs() -> list[dict[str, Any]]:
    labs = []
    for path in _CURRICULUM_PATHS:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    labs.extend([lab for lab in data if isinstance(lab, dict) and not lab.get("disabled")])
        except (OSError, json.JSONDecodeError):
            continue

    # Include live CISA KEV threats if available
    try:
        from app.api.v1.endpoints.infrasec import _cisa_kev_cache, _build_live_challenge
        live_threats = _cisa_kev_cache.get("items") or []
        for idx, threat in enumerate(live_threats):
            labs.append(_build_live_challenge(threat, 100 + idx))
    except Exception:
        pass

    return labs


def parse_solved_labs(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data if x]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def merge_solved_labs(existing: str | None, extra_ids: list[str]) -> list[str]:
    merged = set(parse_solved_labs(existing))
    merged.update(i for i in extra_ids if i)
    return sorted(merged)


def leaderboard_lab_ids() -> set[str]:
    """Return the set of currently-enabled curriculum lab ids (loaded once)."""
    return {str(lab.get("id")) for lab in _load_enabled_labs() if lab.get("id")}


def solved_valid_count(user: Any, lab_ids: set[str]) -> int:
    """Count solves that still map to enabled curriculum labs."""
    solved = set(parse_solved_labs(getattr(user, "solved_labs", None)))
    return len(solved & lab_ids)


def estimate_points_from_solved_labs(raw: str | None) -> int:
    """Return the minimum persisted XP implied by solved lab ids.

    Speed bonuses are intentionally not reconstructed here; this is a conservative
    repair path for accounts affected by stale point overwrites.
    """
    solved = set(parse_solved_labs(raw))
    if not solved:
        return 0

    labs = _load_enabled_labs()
    difficulty_by_id = {
        str(lab.get("id")): str(lab.get("difficulty") or "medium").lower()
        for lab in labs
        if lab.get("id")
    }

    total = 0
    for lab_id in solved:
        difficulty = difficulty_by_id.get(lab_id)
        if difficulty is None:
            continue
        total += ArenaService.get_base_reward(difficulty)
    return total


def _pillar_for_lab(lab: dict[str, Any]) -> str:
    category = (lab.get("category") or "").strip()
    for cat_key, pillar in _CATEGORY_PILLAR.items():
        if cat_key in category:
            return pillar
    cwe = (lab.get("cwe") or "").upper()
    if "287" in cwe or "AUTH" in category.upper():
        return "defense"
    return "analysis"


def _pct(solved: int, total: int, points: int, fallback_divisor: int) -> int:
    if total > 0:
        return min(100, round((solved / total) * 100))
    if points > 0:
        return min(100, max(5, points // fallback_divisor))
    return 0


def _avg(total: int | None, count: int | None) -> int | None:
    if not count:
        return None
    return max(0, min(100, round((total or 0) / count)))


def compute_tactical_stats(user: Any) -> dict[str, Any]:
    from app.services.challenge_metadata_service import get_challenge_metadata

    points = int(user.points or 0)
    solved = set(parse_solved_labs(getattr(user, "solved_labs", None)))
    labs = _load_enabled_labs()
    lab_ids = {lab.get("id") for lab in labs if lab.get("id")}

    # Only count solves that exist in current curriculum or are valid legacy/dynamic threats
    solved_valid = {lid for lid in solved if lid in lab_ids}

    pillar_totals: dict[str, int] = {p: 0 for p in _PILLARS}
    pillar_solved: dict[str, int] = {p: 0 for p in _PILLARS}

    for lab in labs:
        lab_id = lab.get("id")
        if not lab_id:
            continue
        pillar = _pillar_for_lab(lab)
        pillar_totals[pillar] += 1
        if lab_id in solved:
            pillar_solved[pillar] += 1

    # Also count any solved dynamic/legacy/threat labs that aren't in static curriculum
    for solved_id in solved:
        if solved_id not in lab_ids:
            meta = get_challenge_metadata(solved_id)
            if meta:
                solved_valid.add(solved_id)
                pillar = _CATEGORY_PILLAR.get(meta.category) or ("defense" if "287" in meta.cwe or "AUTH" in meta.category.upper() else "analysis")
                if pillar in pillar_solved:
                    pillar_solved[pillar] += 1
                    pillar_totals[pillar] += 1

    total_labs = len(lab_ids)
    pillar_totals["analysis"] = total_labs
    pillar_solved["analysis"] = len(solved_valid)

    security_node = _pct(len(solved_valid), total_labs, points, 40)
    measured_efficiency = _avg(
        getattr(user, "leaderboard_efficiency_total", 0),
        getattr(user, "leaderboard_efficiency_count", 0),
    )
    measured_clean_code = _avg(
        getattr(user, "leaderboard_clean_code_total", 0),
        getattr(user, "leaderboard_clean_code_count", 0),
    )

    skills = {
        "exploitation": _pct(
            pillar_solved["exploitation"],
            pillar_totals["exploitation"],
            points,
            35,
        ),
        "defense": _pct(
            pillar_solved["defense"],
            pillar_totals["defense"],
            points,
            45,
        ),
        # Real measured solve efficiency once submissions exist; otherwise progress fallback.
        "analysis": measured_efficiency if measured_efficiency is not None else _pct(
            min(pillar_solved["analysis"], pillar_totals["analysis"]),
            pillar_totals["analysis"] or total_labs,
            points,
            40,
        ),
        "cloud_security": _pct(
            pillar_solved["cloud_security"],
            pillar_totals["cloud_security"],
            points,
            50,
        ),
        # Real measured static patch-quality score; null means no measured submissions yet.
        "clean_code": measured_clean_code,
    }

    if security_node >= 80:
        security_label = "Active · Monitoring"
    elif security_node > 0:
        security_label = f"Active · {len(solved_valid)}/{len(lab_ids) or 0} labs"
    else:
        security_label = "Standby · Awaiting ops"

    return {
        "security_node": security_node,
        "security_node_label": security_label,
        "skills": skills,
        "labs_solved": len(solved_valid),
        "labs_total": len(lab_ids),
        "metric_sources": {
            "exploitation": "solved_web_security_labs",
            "defense": "solved_identity_defense_labs",
            "analysis": "measured_solve_efficiency" if measured_efficiency is not None else "overall_lab_progress",
            "cloud_security": "solved_cloud_iac_labs",
            "clean_code": "measured_static_patch_quality" if measured_clean_code is not None else "not_enough_data",
        },
        "points": points,
    }
