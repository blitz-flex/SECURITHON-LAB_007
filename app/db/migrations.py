from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


USER_COLUMN_MIGRATIONS: dict[str, str] = {
    "last_active": "ALTER TABLE users ADD COLUMN last_active DATETIME",
    "last_ip": "ALTER TABLE users ADD COLUMN last_ip TEXT",
    "is_mfa_enabled": "ALTER TABLE users ADD COLUMN is_mfa_enabled BOOLEAN DEFAULT 0",
    "mfa_secret": "ALTER TABLE users ADD COLUMN mfa_secret TEXT",
    "solved_labs": "ALTER TABLE users ADD COLUMN solved_labs TEXT",
    "leaderboard_efficiency_total": "ALTER TABLE users ADD COLUMN leaderboard_efficiency_total INTEGER DEFAULT 0",
    "leaderboard_efficiency_count": "ALTER TABLE users ADD COLUMN leaderboard_efficiency_count INTEGER DEFAULT 0",
    "leaderboard_clean_code_total": "ALTER TABLE users ADD COLUMN leaderboard_clean_code_total INTEGER DEFAULT 0",
    "leaderboard_clean_code_count": "ALTER TABLE users ADD COLUMN leaderboard_clean_code_count INTEGER DEFAULT 0",
    "leaderboard_current_rank": "ALTER TABLE users ADD COLUMN leaderboard_current_rank INTEGER",
    "leaderboard_previous_rank": "ALTER TABLE users ADD COLUMN leaderboard_previous_rank INTEGER",
}

CHALLENGE_ATTEMPT_COLUMN_MIGRATIONS: dict[str, str] = {
    "last_successful_code": "ALTER TABLE challenge_attempts ADD COLUMN last_successful_code TEXT",
}

AI_MENTOR_QUOTA_COLUMN_MIGRATIONS: dict[str, str] = {
    "chat_history": "ALTER TABLE ai_mentor_quotas ADD COLUMN chat_history TEXT",
}


def run_db_migrations(engine: Engine) -> None:
    """Apply small SQLite-compatible schema repairs for deployments without Alembic."""
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "users" not in table_names:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as conn:
        for column_name, statement in USER_COLUMN_MIGRATIONS.items():
            if column_name in existing_columns:
                continue
            logger.info("Applying lightweight DB migration for users.%s", column_name)
            conn.execute(text(statement))

    if "challenge_attempts" not in table_names:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("challenge_attempts")}
    with engine.begin() as conn:
        for column_name, statement in CHALLENGE_ATTEMPT_COLUMN_MIGRATIONS.items():
            if column_name in existing_columns:
                continue
            logger.info("Applying lightweight DB migration for challenge_attempts.%s", column_name)
            conn.execute(text(statement))

    if "ai_mentor_quotas" not in table_names:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("ai_mentor_quotas")}
    with engine.begin() as conn:
        for column_name, statement in AI_MENTOR_QUOTA_COLUMN_MIGRATIONS.items():
            if column_name in existing_columns:
                continue
            logger.info("Applying lightweight DB migration for ai_mentor_quotas.%s", column_name)
            conn.execute(text(statement))
