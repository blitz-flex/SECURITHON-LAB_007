"""
Admin — Curriculum Management
Endpoints for reading, updating, toggling, and deleting lab modules.
"""
import json
import logging
import os
import subprocess
import sys
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.v1.endpoints.admin.shared import get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter()

CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "..", "curriculum.json")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LabToggleRequest(BaseModel):
    enabled: bool


class LabUpdateRequest(BaseModel):
    title: str
    category: str
    cvss: float


class LabCreateRequest(BaseModel):
    id: str
    title: str
    category: str
    cwe: str
    cvss: float
    difficulty: str = "Medium"
    description: str
    task: str
    briefing: str = ""
    hint: str = ""



# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_curriculum() -> list[dict]:
    """Load curriculum from JSON file."""
    if not os.path.exists(CURRICULUM_PATH):
        raise HTTPException(status_code=404, detail="Curriculum not found")
    try:
        with open(CURRICULUM_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to load curriculum: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read curriculum file")


def _save_curriculum(data: list[dict]) -> None:
    """Persist curriculum to JSON file."""
    try:
        with open(CURRICULUM_PATH, "w") as f:
            json.dump(data, f, indent=4)
    except OSError as e:
        logger.error("Failed to save curriculum: %s", e)
        raise HTTPException(status_code=500, detail="Failed to write curriculum file")


def _find_lab(labs: list[dict], lab_id: str) -> dict:
    """Find a lab by ID or raise 404."""
    lab = next((l for l in labs if l["id"] == lab_id), None)
    if not lab:
        raise HTTPException(status_code=404, detail=f"Lab '{lab_id}' not found")
    return lab


# ── Routes ────────────────────────────────────────────────────────────────────





@router.get("/curriculum")

def get_curriculum(
    category: str = None,
    search: str = None,
    disabled_only: bool = False
) -> list[dict]:
    """Return all lab modules with optional category and search filters."""
    labs = _load_curriculum()

    if category:
        labs = [l for l in labs if l.get("category", "").lower() == category.lower()]

    if search:
        s = search.lower()
        labs = [l for l in labs if s in l.get("title", "").lower() or s in l.get("id", "").lower() or s in l.get("cwe", "").lower()]

    if disabled_only:
        labs = [l for l in labs if l.get("disabled") is True]

    logger.debug("Curriculum fetched (%d labs)", len(labs))
    return labs



@router.post("/curriculum")
def create_lab(req: LabCreateRequest) -> dict[str, Any]:
    """Add a new custom lab module to curriculum."""
    labs = _load_curriculum()
    if any(l["id"] == req.id for l in labs):
        raise HTTPException(status_code=400, detail=f"Lab with ID '{req.id}' already exists.")

    new_lab = req.model_dump()
    new_lab["level"] = len(labs) + 1
    new_lab["disabled"] = False
    new_lab["real_source"] = "Custom Admin Module"
    new_lab["vulnCode"] = [
        {"n": 1, "t": "# Custom Lab Task", "vuln": False},
        {"n": 2, "t": f"# {req.task}", "vuln": True}
    ]

    labs.append(new_lab)
    _save_curriculum(labs)
    logger.info("New lab created: %s (%s)", req.id, req.title)
    return {"status": "success", "message": f"Lab '{req.title}' created successfully", "lab": new_lab}


@router.post("/curriculum/{lab_id}/toggle")

def toggle_lab(
    lab_id: str,
    req: LabToggleRequest,
) -> dict[str, Any]:
    """Enable or disable a lab module."""
    labs = _load_curriculum()
    lab = _find_lab(labs, lab_id)
    lab["disabled"] = not req.enabled
    _save_curriculum(labs)
    logger.info("Lab '%s' toggled to enabled=%s", lab_id, req.enabled)
    return {"status": "success", "lab_id": lab_id, "enabled": req.enabled}


@router.put("/curriculum/{lab_id}")
def update_lab(
    lab_id: str,
    req: LabUpdateRequest,
) -> dict[str, str]:
    """Update a lab module's metadata."""
    labs = _load_curriculum()
    lab = _find_lab(labs, lab_id)
    lab.update(req.model_dump())
    _save_curriculum(labs)
    logger.info("Lab '%s' updated: %s", lab_id, req.model_dump())
    return {"status": "success", "message": "Lab updated"}


@router.delete("/curriculum/{lab_id}")
def delete_lab(lab_id: str) -> dict[str, str]:
    """Remove a lab module from the curriculum."""
    labs = _load_curriculum()
    _find_lab(labs, lab_id)  # raises 404 if not found
    labs = [l for l in labs if l["id"] != lab_id]
    _save_curriculum(labs)
    logger.info("Lab '%s' deleted from curriculum", lab_id)
    return {"status": "success", "message": "Lab deleted"}


@router.post("/curriculum/generate")
def generate_new_lab() -> dict[str, str]:
    """Regenerate the curriculum by running the generation script."""
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))))
    script_path = os.path.join(project_root, "scripts", "generate_curriculum.py")

    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Curriculum generation script not found")

    try:
        subprocess.run([sys.executable, script_path], check=True, timeout=30)
        logger.info("Curriculum regenerated successfully")
        return {"status": "success", "message": "Curriculum regenerated successfully"}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Script timed out")
    except subprocess.CalledProcessError as e:
        logger.error("Curriculum generation failed: %s", e)
        raise HTTPException(status_code=500, detail="Curriculum generation failed")
