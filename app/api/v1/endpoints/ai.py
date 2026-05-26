"""
AI Mentor Endpoint
Provides a Socratic cybersecurity mentor powered by the Gemini API.
"""
import json
import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

_CURRICULUM_PATH = os.path.join(os.path.dirname(__file__), "curriculum.json")
_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"

_SYSTEM_PROMPT = (
    "You are a Socratic Cybersecurity Mentor in the Securithon Lab Arena.\n"
    "Guide the student to identify and resolve security vulnerabilities WITHOUT writing correct code for them.\n\n"
    "Rules:\n"
    "1. Respond in the exact same language as the student's latest question.\n"
    "2. Answer exactly what the student is asking. Do not drift into unrelated topics.\n"
    "3. NEVER output correct code snippets or copy-pasteable solutions.\n"
    "4. Guide step-by-step using hints, targeted questions, or concept explanations.\n"
    "5. Be encouraging, precise, and professional. Match the cyberpunk/hacker tone.\n"
    "6. Keep responses concise to fit well in the floating chat widget.\n"
    "7. If the user asks for the answer, refuse politely and suggest the next step."
)


# ── Schemas ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    challenge_id: str
    user_code: str
    messages: list[ChatMessage]
    user_api_key: str | None = None

class ChatResponse(BaseModel):
    reply: str
    points: int | None = None
    xp_deducted: int = 0


# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_challenge_context(challenge_id: str) -> dict | None:
    """Load challenge metadata from the curriculum JSON by ID."""
    try:
        if os.path.exists(_CURRICULUM_PATH):
            with open(_CURRICULUM_PATH, "r") as f:
                for c in json.load(f):
                    if c.get("id") == challenge_id:
                        return {k: c.get(k, "") for k in ("title", "cwe", "description", "task", "briefing", "hint")}
    except Exception as e:
        logger.warning("Could not load challenge context for '%s': %s", challenge_id, e)
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


async def _call_gemini(api_key: str, contents: list[dict], context: dict) -> str:
    """Send a request to the Gemini API and return the reply text."""
    system_instruction = (
        f"{_SYSTEM_PROMPT}\n\nCurrent Challenge Context:\n"
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
            return f"⚠️ Error from AI service (status {resp.status_code})."
        data = resp.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            return "⚠️ Received empty response from AI service."


# ── Route ───────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat_with_mentor(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Send a message to the AI mentor and receive a Socratic hint."""
    api_key = request.user_api_key or settings.GEMINI_API_KEY
    points = current_user.points or 0

    if not api_key:
        return ChatResponse(
            reply="⚠️ AI Mentor is offline. Please set your Gemini API Key in Settings.",
            points=points,
        )

    context = _load_challenge_context(request.challenge_id)
    if not context:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Challenge '{request.challenge_id}' not found.")

    try:
        contents = _build_gemini_contents(request.messages, request.user_code)
        reply = await _call_gemini(api_key, contents, context)
    except Exception as e:
        logger.error("AI mentor request failed: %s", e)
        reply = f"⚠️ Failed to connect to AI Assistant: {e}"

    return ChatResponse(reply=reply, points=points)
