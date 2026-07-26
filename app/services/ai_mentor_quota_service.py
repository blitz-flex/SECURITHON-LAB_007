from datetime import datetime, timezone, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import AIMentorQuota

DEFAULT_AI_MENTOR_QUOTA_LIMIT = 15
PROMO_AI_MENTOR_QUOTA_LIMIT = 1000
PROMO_QUOTA_EXPIRATION = datetime(2026, 9, 1, 0, 0, 0, tzinfo=timezone.utc)
AI_MENTOR_QUOTA_WINDOW = timedelta(days=7)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get_start_of_week(dt: datetime) -> datetime:
    dt = _as_aware_utc(dt)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=dt.weekday())


def _get_next_week_start(dt: datetime) -> datetime:
    return _get_start_of_week(dt) + timedelta(days=7)


def get_quota_limit(now: datetime | None = None) -> int:
    now = now or _utcnow()
    now = _as_aware_utc(now)
    if now < PROMO_QUOTA_EXPIRATION:
        return PROMO_AI_MENTOR_QUOTA_LIMIT
    return DEFAULT_AI_MENTOR_QUOTA_LIMIT


AI_MENTOR_QUOTA_LIMIT = get_quota_limit()


def _for_db(value: datetime) -> datetime:
    """Store UTC without tzinfo for SQLite compatibility."""
    return _as_aware_utc(value).replace(tzinfo=None)


def _reset_if_expired(quota: AIMentorQuota, now: datetime | None = None) -> AIMentorQuota:
    now = now or _utcnow()
    start_of_week = _get_start_of_week(now)
    if _as_aware_utc(quota.window_started_at) < start_of_week:
        quota.used_count = 0
        quota.window_started_at = _for_db(start_of_week)
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
    start_of_week = _get_start_of_week(now)
    quota = AIMentorQuota(
        user_id=user_id,
        challenge_id=challenge_id,
        used_count=0,
        window_started_at=_for_db(start_of_week),
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
    limit = get_quota_limit(now)
    return {
        "used": 0,
        "limit": limit,
        "remaining": limit,
        "reset_at": _get_next_week_start(now),
    }


def get_quota_info(quota: AIMentorQuota, now: datetime | None = None) -> dict:
    now = now or _utcnow()
    limit = get_quota_limit(now)
    start_of_window = _as_aware_utc(quota.window_started_at)
    reset_at = _get_next_week_start(start_of_window)
    used = max(0, quota.used_count or 0)
    remaining = max(0, limit - used)
    return {
        "used": used,
        "limit": limit,
        "remaining": remaining,
        "reset_at": reset_at,
    }


def has_quota_available(quota: AIMentorQuota) -> bool:
    return get_quota_info(quota)["remaining"] > 0


def increment_quota_after_success(db: Session, quota: AIMentorQuota) -> AIMentorQuota:
    now = _utcnow()
    quota = _reset_if_expired(quota, now)
    if quota.used_count == 0:
        quota.window_started_at = _for_db(_get_start_of_week(now))
    quota.used_count += 1
    quota.updated_at = _for_db(now)
    db.add(quota)
    db.commit()
    db.refresh(quota)
    return quota
