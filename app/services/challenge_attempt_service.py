"""
Server-side challenge attempt state & telemetry.

Each ChallengeAttempt row tracks:
  - last_successful_code: the last passing patch submission.
  - is_success: True once the challenge has been passed at least once.
  - clean_code_score: static patch-quality score (0-100) from the winning submission.
  - time_to_solve_seconds: wall-clock seconds from first open to first pass (optional).
  - attempts_count: total validation calls (failures + final success) for efficiency scoring.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import ChallengeAttempt


def open_challenge(db: Session, *, user_id: int, challenge_id: str) -> ChallengeAttempt:
    """Get or create the attempt row for this user/challenge pair."""
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


def increment_attempt_count(db: Session, *, user_id: int, challenge_id: str) -> ChallengeAttempt:
    """Increment the validation retry counter regardless of success/failure.

    Must be called on every /verify invocation (before success check) so
    the final attempt count includes the passing submission itself.
    """
    attempt = open_challenge(db, user_id=user_id, challenge_id=challenge_id)
    attempt.attempts_count = (attempt.attempts_count or 0) + 1
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def record_successful_code(
    db: Session,
    *,
    user_id: int,
    challenge_id: str,
    code: str,
    clean_code_score: int | None = None,
    time_to_solve_seconds: int | None = None,
) -> ChallengeAttempt:
    """Stamp the winning patch and telemetry on first success.

    clean_code_score and time_to_solve_seconds are only written if not already
    set, preserving the metrics from the first genuine solve.
    """
    attempt = open_challenge(db, user_id=user_id, challenge_id=challenge_id)
    attempt.last_successful_code = code
    attempt.is_success = True
    # Preserve the score from the very first pass so repeated solves don't overwrite it.
    if attempt.clean_code_score is None and clean_code_score is not None:
        attempt.clean_code_score = max(0, min(100, clean_code_score))
    if attempt.time_to_solve_seconds is None and time_to_solve_seconds is not None:
        attempt.time_to_solve_seconds = max(0, time_to_solve_seconds)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt
