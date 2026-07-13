"""
Server-authoritative challenge metadata lookup.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any


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


@dataclass(frozen=True)
class ChallengeMetadata:
    id: str
    difficulty: str
    category: str = ""
    cwe: str = ""
    cvss: float | None = None
    source: str = "fallback"


_DIFFICULTY_ALIASES = {
    "low": "easy",
    "beginner": "easy",
    "intermediate": "medium",
    "high": "hard",
    "expert": "critical",
    "extreme": "critical",
}


def normalize_difficulty(value: Any, cvss: Any = None) -> str:
    key = str(value or "").strip().lower()
    if not key:
        try:
            score = float(cvss or 0)
        except (TypeError, ValueError):
            score = 0
        if score >= 9:
            key = "critical"
        elif score >= 7:
            key = "hard"
        elif score >= 4:
            key = "medium"
        else:
            key = "easy"

    key = _DIFFICULTY_ALIASES.get(key, key)
    return key if key in {"easy", "medium", "hard", "critical"} else "medium"


@lru_cache(maxsize=1)
def _curriculum_by_id() -> dict[str, dict[str, Any]]:
    curriculum: dict[str, dict[str, Any]] = {}
    for path in _CURRICULUM_PATHS:
        try:
            with open(path, encoding="utf-8") as f:
                labs = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue

        curriculum.update(
            {
                str(lab["id"]): lab
                for lab in labs
                if isinstance(lab, dict) and lab.get("id") and not lab.get("disabled", False)
            }
        )
    return curriculum


def _from_curriculum(challenge_id: str) -> ChallengeMetadata | None:
    lab = _curriculum_by_id().get(challenge_id)
    if not lab:
        return None
    cvss = lab.get("cvss")
    try:
        cvss_value = float(cvss) if cvss is not None else None
    except (TypeError, ValueError):
        cvss_value = None
    return ChallengeMetadata(
        id=challenge_id,
        difficulty=normalize_difficulty(lab.get("difficulty"), cvss_value),
        category=str(lab.get("category") or ""),
        cwe=str(lab.get("cwe") or ""),
        cvss=cvss_value,
        source="curriculum",
    )


def _legacy_fallback(challenge_id: str) -> ChallengeMetadata | None:
    legacy_exact = {
        "cwe89": ("medium", "Web Security", "CWE-89", 7.9),
        "cwe79": ("medium", "Web Security", "CWE-79", 6.1),
        "cwe287": ("medium", "Identity & Access", "CWE-287", 6.5),
    }
    if challenge_id in legacy_exact:
        difficulty, category, cwe, cvss = legacy_exact[challenge_id]
        return ChallengeMetadata(challenge_id, difficulty, category, cwe, cvss, "legacy")

    legacy_patterns = [
        (r"^ID_\d+$", "medium", "Identity & Secrets"),
        (r"^IAC_\d+$", "medium", "Infrastructure as Code"),
        (r"^NET_\d+$", "medium", "Network Security"),
        (r"^CONT_\d+$", "medium", "Container Security"),
        (r"^K8S_\d+$", "hard", "Kubernetes Security"),
        (r"^ARCH_\d+$", "hard", "Cloud Architecture"),
        (r"^SLS_\d+$", "hard", "Serverless Security"),
        (r"^CICD_\d+$", "hard", "CI/CD Security"),
        (r"^LIVE_[0-2]$", "critical", "Global Threat Feed"),
        (r"^LIVE_REAL_[1-2]\d\d$", "critical", "Global Threat Feed"),
    ]
    for pattern, difficulty, category in legacy_patterns:
        if re.fullmatch(pattern, challenge_id):
            return ChallengeMetadata(challenge_id, difficulty, category, source="legacy")
    return None


def get_challenge_metadata(challenge_id: str) -> ChallengeMetadata | None:
    return _from_curriculum(challenge_id) or _legacy_fallback(challenge_id)
