"""
Arena Endpoint
Handles patch verification and XP reward calculation for all challenge categories.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import crud
from app.api import deps
from app.db.session import get_db
from app.models.user import User
from app.services import challenge_attempt_service
from app.services.arena_service import NEUTRAL_EFFICIENCY_SCORE, SPEED_BONUS_SECONDS, ArenaService
from app.services.challenge_metadata_service import get_challenge_metadata

logger = logging.getLogger(__name__)
router = APIRouter()


class PatchRequest(BaseModel):
    challenge_id: str
    code: str
    difficulty: str = "medium"       # easy | medium | hard | critical
    already_solved: bool = False
    started_at: str | None = None    # ISO timestamp — client sets when challenge opens

class PatchResponse(BaseModel):
    success: bool
    message: str
    points: int = 0
    reward: int = 0                  # XP earned this solve (0 if already solved)
    speed_bonus: bool = False

class OpenRequest(BaseModel):
    challenge_id: str

class OpenResponse(BaseModel):
    challenge_id: str
    opened_at: str
    last_successful_code: str | None = None

class ResetRequest(BaseModel):
    challenge_id: str
    difficulty: str = "medium"

class ResetResponse(BaseModel):
    points: int
    solved_labs: list[str] = []

@router.post("/open", response_model=OpenResponse)
async def open_challenge(
    request: OpenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> OpenResponse:
    """Record a server-trusted timestamp for a challenge opening."""
    metadata = get_challenge_metadata(request.challenge_id)
    if metadata is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    attempt = challenge_attempt_service.open_challenge(
        db,
        user_id=current_user.id,
        challenge_id=request.challenge_id,
    )
    return OpenResponse(
        challenge_id=request.challenge_id,
        opened_at=attempt.opened_at.isoformat(),
        last_successful_code=attempt.last_successful_code,
    )

@router.post("/verify", response_model=PatchResponse)
async def verify_patch(
    request: PatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Verify a submitted patch and award XP if the vulnerability is resolved."""
    metadata = get_challenge_metadata(request.challenge_id)
    if metadata is None:
        return PatchResponse(
            success=False,
            message="Unknown challenge. Verification failed closed.",
            points=current_user.points or 0,
        )

    success, message = ArenaService.verify_patch(request.challenge_id, request.code)

    if success:
        solved_labs = set(crud.user.get_solved_labs(current_user))
        already_solved = request.already_solved or request.challenge_id in solved_labs
        elapsed = challenge_attempt_service.elapsed_seconds(
            db,
            user_id=current_user.id,
            challenge_id=request.challenge_id,
        )
        reward = ArenaService.calculate_reward(metadata.difficulty, elapsed, already_solved)
        speed_bonus = reward > 0 and elapsed is not None and elapsed <= SPEED_BONUS_SECONDS
        new_points = (current_user.points or 0) + reward
        db_user = current_user
        if reward > 0:
            db_user = crud.user.update_points(db, db_user=current_user, points=new_points)
            efficiency_score = ArenaService.calculate_efficiency_score(elapsed)
            if efficiency_score is None:
                # No measurable solve time — still credit one neutral sample so the
                # efficiency and clean-code leaderboard counts stay in sync.
                efficiency_score = NEUTRAL_EFFICIENCY_SCORE
            crud.user.record_leaderboard_metrics(
                db,
                db_user=db_user,
                efficiency_score=efficiency_score,
                clean_code_score=ArenaService.score_clean_code(request.code),
            )
            logger.info("User %s earned %d XP on challenge %s", current_user.username, reward, request.challenge_id)
        else:
            new_points = current_user.points or 0
        challenge_attempt_service.record_successful_code(
            db,
            user_id=current_user.id,
            challenge_id=request.challenge_id,
            code=request.code,
        )
        crud.user.add_solved_lab(db, db_user=db_user, lab_id=request.challenge_id)
        return PatchResponse(success=True, message=message, points=new_points, reward=reward, speed_bonus=speed_bonus)

    return PatchResponse(success=False, message=message, points=current_user.points or 0)


@router.post("/reset", response_model=ResetResponse)
async def reset_challenge(
    request: ResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ResetResponse:
    """Return current progress; completed challenges are immutable after reward grant."""
    return ResetResponse(
        points=current_user.points or 0,
        solved_labs=crud.user.get_solved_labs(current_user),
    )
