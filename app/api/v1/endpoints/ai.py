"""
AI Mentor Endpoint
Provides a Socratic cybersecurity mentor powered by the Gemini API.
"""
import json
import logging
import os
import re
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.services.ai_mentor_quota_service import (
    get_initial_quota_info,
    get_or_create_quota,
    get_quota,
    get_quota_info,
    has_quota_available,
    increment_quota_after_success,
)
from app.services.challenge_metadata_service import get_challenge_metadata

logger = logging.getLogger(__name__)
router = APIRouter()

_CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "curriculum.json")
_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"

_SYSTEM_PROMPT = (
    "You are a Socratic Cybersecurity Mentor in the Securithon Lab Arena.\n"
    "Guide the student to identify and resolve security vulnerabilities WITHOUT writing correct code for them.\n\n"
    "STRICT GLOBAL DIRECTIVE:\n"
    "Under NO circumstances should you EVER provide ready-made solutions, complete working code, or copy-pasteable fixes.\n\n"
    "Rules:\n"
    "1. Respond in the exact same language as the student's latest question.\n"
    "2. Answer exactly what the student is asking. Do not drift into unrelated topics.\n"
    "3. NEVER output correct code snippets, fixed solutions, or copy-pasteable patches.\n"
    "4. Guide step-by-step using hints, targeted questions, or concept explanations.\n"
    "5. Be encouraging, precise, and professional. Match the cyberpunk/hacker tone.\n"
    "6. Keep responses concise to fit well in the floating chat widget.\n"
    "7. If the user asks for the answer or solution, refuse politely and offer a hint for the next step."
)

_STEP_BY_STEP_PROMPT = (
    "You are an interactive, Step-by-Step Cybersecurity Tutor in the Securithon Lab Arena.\n"
    "Break down the challenge into 3-4 micro-steps.\n\n"
    "STRICT GLOBAL DIRECTIVE:\n"
    "Under NO circumstances should you EVER provide ready-made solutions, complete working code, or copy-pasteable fixes.\n\n"
    "Rules:\n"
    "1. Respond in the exact same language as the student's latest question.\n"
    "2. Give ONLY ONE step at a time.\n"
    "3. NEVER output ready-made code snippets or copy-pasteable solution fixes.\n"
    "4. Label your current step clearly (e.g. '[Step 1/3]: Identify the input point').\n"
    "5. Ask the student to complete that specific step or answer your question before moving to the next step.\n"
    "6. Keep explanations short, highly structured, and interactive."
)

_ANALYZE_CODE_PROMPT = (
    "You are an Expert Code Analyst in the Securithon Lab Arena.\n"
    "The student has requested a quick analysis of their current code.\n\n"
    "STRICT GLOBAL DIRECTIVE:\n"
    "Under NO circumstances should you EVER provide ready-made solutions, complete working code, or copy-pasteable fixes.\n\n"
    "Rules:\n"
    "1. Respond in the exact same language as the student's latest question.\n"
    "2. Point out where the vulnerability lies and briefly explain why it is vulnerable.\n"
    "3. NEVER output the final fixed/patched code or copy-pasteable solutions.\n"
    "4. Show how the attack works or explain the logic vulnerability concept, but force the student to write the code fix themselves.\n"
    "5. Keep it concise, direct, and actionable."
)



# ── Schemas ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    challenge_id: str
    user_code: str
    messages: list[ChatMessage]
    mode: str | None = "socratic"


class QuotaInfo(BaseModel):
    used: int
    limit: int
    remaining: int
    reset_at: datetime

class ChatResponse(BaseModel):
    reply: str
    points: int | None = None
    quota: QuotaInfo | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────

_CONTEXT_FIELDS = ("title", "cwe", "description", "task", "briefing", "hint")


def _context_from_challenge_dict(challenge: dict) -> dict:
    return {
        "title": challenge.get("display_title") or challenge.get("title") or "Live Threat",
        "cwe": challenge.get("cwe", "CWE-Unknown"),
        "description": challenge.get("description") or challenge.get("briefing", ""),
        "task": challenge.get("task", ""),
        "briefing": challenge.get("briefing", ""),
        "hint": challenge.get("hint", ""),
    }


def _load_live_real_context(cve_id: str) -> dict | None:
    """Resolve mentor context for LIVE_REAL_* IDs from the CISA KEV cache or legacy fallbacks."""
    from app.api.v1.endpoints.infrasec import (
        _build_live_challenge,
        _cisa_kev_cache,
        _DEFAULT_SCENARIO,
        _KEYWORD_SCENARIOS,
    )

    items = _cisa_kev_cache.get("items", [])
    if items:
        for idx, item in enumerate(items):
            if item.get("cveID") == cve_id:
                return _context_from_challenge_dict(_build_live_challenge(item, 100 + idx))

    idx = 0  # Fallback to index 0 if not found, though this shouldn't happen for valid CVEs.

    if idx < len(_KEYWORD_SCENARIOS):
        scenario = _KEYWORD_SCENARIOS[idx]
    elif idx == len(_KEYWORD_SCENARIOS):
        scenario = _DEFAULT_SCENARIO
    else:
        return None

    return {
        "title": f"Live Threat Scenario: {scenario['file']}",
        "cwe": scenario.get("cwe", "CWE-Unknown"),
        "description": scenario.get("briefing", ""),
        "task": scenario.get("task", ""),
        "briefing": scenario.get("briefing", ""),
        "hint": scenario.get("hint", ""),
    }


def _load_challenge_context(challenge_id: str) -> dict | None:
    """Load challenge metadata from the curriculum JSON by ID."""
    try:
        if os.path.exists(_CURRICULUM_PATH):
            with open(_CURRICULUM_PATH, "r") as f:
                for c in json.load(f):
                    if c.get("id") == challenge_id:
                        return {k: c.get(k, "") for k in _CONTEXT_FIELDS}
    except Exception as e:
        logger.warning("Could not load challenge context for '%s': %s", challenge_id, e)

    live_match = re.fullmatch(r"LIVE_REAL_(CVE-.+)", challenge_id)
    if live_match:
        cve_id = live_match.group(1)
        return _load_live_real_context(cve_id)

    metadata = get_challenge_metadata(challenge_id)
    if metadata:
        return {
            "title": f"{metadata.category or 'Security'} Challenge",
            "cwe": metadata.cwe or "CWE-Unknown",
            "description": metadata.category or "Review the challenge and identify the vulnerable pattern.",
            "task": "Identify the vulnerability and apply a secure fix.",
            "briefing": metadata.category or "Use secure coding principles to complete this challenge.",
            "hint": "Focus on removing the vulnerable pattern without introducing a new one.",
        }
    return None


def _build_gemini_contents(messages: list[ChatMessage], user_code: str) -> list[dict]:
    """Format chat history and current code context for the Gemini API."""
    contents = [
        {"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]}
        for m in messages[:-1]
    ]
    latest = messages[-1].content if messages else ""
    contents.append({
        "role": "user",
        "parts": [{"text": f"Student's Current Editor Code:\n```\n{user_code}\n```\n\nStudent's Question:\n{latest}"}],
    })
    return contents


async def _call_gemini(api_key: str, contents: list[dict], context: dict, mode: str = "socratic") -> str:
    """Send a request to the Gemini API and return the reply text."""
    base_prompt = _SYSTEM_PROMPT
    if mode == "step_by_step":
        base_prompt = _STEP_BY_STEP_PROMPT
    elif mode == "analyze_code":
        base_prompt = _ANALYZE_CODE_PROMPT

    system_instruction = (
        f"{base_prompt}\n\nCurrent Challenge Context:\n"
        f"- Challenge: {context['title']} ({context['cwe']})\n"
        f"- Description: {context['description']}\n"
        f"- Task: {context['task']}\n"
        f"- Briefing: {context['briefing']}"
    )
    payload = {
        "contents": contents,
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{_GEMINI_URL}?key={api_key}", json=payload)
        if resp.status_code != 200:
            logger.error("Gemini API error %d: %s", resp.status_code, resp.text[:200])
            raise RuntimeError(f"AI service returned status {resp.status_code}")
        data = resp.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise RuntimeError("AI service returned an empty response")


# ── Route ───────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat_with_mentor(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Send a message to the AI mentor and receive a Socratic hint."""
    api_key = settings.GEMINI_API_KEY
    points = current_user.points or 0

    context = _load_challenge_context(request.challenge_id)
    if not context:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Challenge '{request.challenge_id}' not found.")

    quota = get_or_create_quota(db, user_id=current_user.id, challenge_id=request.challenge_id)
    quota_info = get_quota_info(quota)
    if not has_quota_available(quota):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            # jsonable_encoder converts the reset_at datetime to an ISO string;
            # HTTPException.detail is serialized with the plain json encoder,
            # which cannot handle raw datetime objects.
            detail=jsonable_encoder({
                "message": "AI Mentor quota exceeded for this challenge.",
                "quota": quota_info,
            }),
        )

    if not api_key:
        return ChatResponse(
            reply="⚠️ AI Mentor is offline. Server Gemini API key is not configured.",
            points=points,
            quota=quota_info,
        )

    try:
        contents = _build_gemini_contents(request.messages, request.user_code)
        reply = await _call_gemini(api_key, contents, context, mode=request.mode)
    except Exception as e:
        logger.error("AI mentor request failed: %s", e)
        return ChatResponse(
            reply=f"⚠️ Failed to connect to AI Assistant: {e}",
            points=points,
            quota=quota_info,
        )

    # Save only user questions history to quota in DB
    try:
        user_messages = []
        for m in request.messages:
            role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else None)
            content = getattr(m, "content", None) or (m.get("content") if isinstance(m, dict) else None)
            if role == "user" and content:
                user_messages.append({"role": "user", "content": content})
        quota.chat_history = json.dumps(user_messages, ensure_ascii=False)
    except Exception as hist_err:
        logger.error("Failed to serialize user chat history: %s", hist_err)

    quota = increment_quota_after_success(db, quota)
    return ChatResponse(reply=reply, points=points, quota=get_quota_info(quota))


@router.get("/quota/{challenge_id}", response_model=QuotaInfo)
def get_mentor_quota(
    challenge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Return the current AI mentor quota state for a challenge."""
    context = _load_challenge_context(challenge_id)
    if not context:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Challenge '{challenge_id}' not found.")

    quota = get_quota(db, user_id=current_user.id, challenge_id=challenge_id)
    if not quota or quota.used_count == 0:
        return get_initial_quota_info()

    db.commit()
    db.refresh(quota)
    return get_quota_info(quota)
