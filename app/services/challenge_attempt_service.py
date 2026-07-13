"""
Server-side challenge attempt state.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import ChallengeAttempt


def open_challenge(db: Session, *, user_id: int, challenge_id: str) -> ChallengeAttempt:
    attempt = (
        db.query(ChallengeAttempt)
        .filter(
            ChallengeAttempt.user_id == user_id,
            ChallengeAttempt.challenge_id == challenge_id,
        )
        .first()
    )
    if attempt:
        return attempt

    attempt = ChallengeAttempt(user_id=user_id, challenge_id=challenge_id)
    db.add(attempt)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        attempt = (
            db.query(ChallengeAttempt)
            .filter(
                ChallengeAttempt.user_id == user_id,
                ChallengeAttempt.challenge_id == challenge_id,
            )
            .one()
        )
    db.refresh(attempt)
    return attempt


def record_successful_code(db: Session, *, user_id: int, challenge_id: str, code: str) -> ChallengeAttempt:
    attempt = open_challenge(db, user_id=user_id, challenge_id=challenge_id)
    attempt.last_successful_code = code
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt
