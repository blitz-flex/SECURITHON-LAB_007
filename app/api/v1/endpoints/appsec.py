"""
AppSec Fortress Endpoint
Serves the curated static application security curriculum.
"""
import json
import os

from fastapi import APIRouter

router = APIRouter()

_CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "appsec_curriculum.json")


def load_appsec_curriculum() -> list[dict]:
    """Load enabled AppSec Fortress labs from the static curriculum source."""
    with open(_CURRICULUM_PATH, encoding="utf-8") as f:
        labs = json.load(f)
    return [lab for lab in labs if not lab.get("disabled", False)]


@router.get("/curriculum")
async def get_appsec_curriculum() -> list[dict]:
    """Return the curated AppSec Fortress lab catalog."""
    return load_appsec_curriculum()
