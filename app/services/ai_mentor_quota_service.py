from datetime import datetime, timezone, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import AIMentorQuota

AI_MENTOR_QUOTA_LIMIT = 15
AI_MENTOR_QUOTA_WINDOW = timedelta(hours=24)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _for_db(value: datetime) -> datetime:
    """Store UTC without tzinfo for SQLite compatibility."""
    return _as_aware_utc(value).replace(tzinfo=None)


def _reset_if_expired(quota: AIMentorQuota, now: datetime | None = None) -> AIMentorQuota:
    now = now or _utcnow()
    if _as_aware_utc(quota.window_started_at) + AI_MENTOR_QUOTA_WINDOW <= now:
        quota.used_count = 0
        quota.window_started_at = _for_db(now)
        quota.updated_at = _for_db(now)
    return quota


def get_quota(db: Session, *, user_id: int, challenge_id: str) -> AIMentorQuota | None:
    quota = (
        db.query(AIMentorQuota)
        .filter(AIMentorQuota.user_id == user_id, AIMentorQuota.challenge_id == challenge_id)
        .first()
    )
    if quota:
        return _reset_if_expired(quota)
    return None


def get_or_create_quota(db: Session, *, user_id: int, challenge_id: str) -> AIMentorQuota:
    quota = get_quota(db, user_id=user_id, challenge_id=challenge_id)
    if quota:
        return quota

    now = _utcnow()
    quota = AIMentorQuota(
        user_id=user_id,
        challenge_id=challenge_id,
        used_count=0,
        window_started_at=_for_db(now),
        created_at=_for_db(now),
        updated_at=_for_db(now),
    )
    db.add(quota)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        quota = (
            db.query(AIMentorQuota)
            .filter(AIMentorQuota.user_id == user_id, AIMentorQuota.challenge_id == challenge_id)
            .one()
        )
    return _reset_if_expired(quota)


def get_initial_quota_info(now: datetime | None = None) -> dict:
    now = now or _utcnow()
    return {
        "used": 0,
        "limit": AI_MENTOR_QUOTA_LIMIT,
        "remaining": AI_MENTOR_QUOTA_LIMIT,
        "reset_at": _as_aware_utc(now) + AI_MENTOR_QUOTA_WINDOW,
    }


def get_quota_info(quota: AIMentorQuota) -> dict:
    reset_at = _as_aware_utc(quota.window_started_at) + AI_MENTOR_QUOTA_WINDOW
    used = max(0, quota.used_count or 0)
    remaining = max(0, AI_MENTOR_QUOTA_LIMIT - used)
    return {
        "used": used,
        "limit": AI_MENTOR_QUOTA_LIMIT,
        "remaining": remaining,
        "reset_at": reset_at,
    }


def has_quota_available(quota: AIMentorQuota) -> bool:
    return get_quota_info(quota)["remaining"] > 0


def increment_quota_after_success(db: Session, quota: AIMentorQuota) -> AIMentorQuota:
    now = _utcnow()
    quota = _reset_if_expired(quota, now)
    if quota.used_count == 0:
        quota.window_started_at = _for_db(now)
    quota.used_count += 1
    quota.updated_at = _for_db(now)
    db.add(quota)
    db.commit()
    db.refresh(quota)
    return quota
