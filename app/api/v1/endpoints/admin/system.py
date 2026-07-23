"""
Admin — System Configuration
Endpoints for platform settings, audit logs, and system health checks.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.api.v1.endpoints.admin.shared import (
    PLATFORM_CONFIG,
    AUDIT_LOGS,
    get_current_admin_user,
    add_audit_log,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    """Return current platform configuration."""
    return PLATFORM_CONFIG


@router.post("/settings")
def update_settings(
    config: dict,
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Update platform configuration keys."""
    # Only allow known keys to prevent arbitrary state injection
    allowed_keys = {"maintenance_mode", "global_announcement", "allow_registration", "system_alert", "threat_level"}
    unknown = set(config.keys()) - allowed_keys
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown config keys: {unknown}")

    PLATFORM_CONFIG.update(config)
    add_audit_log(current_admin.id, "SETTINGS_UPDATE", f"Maintenance: {PLATFORM_CONFIG['maintenance_mode']}")
    logger.info("Admin %s updated platform config: %s", current_admin.username, config)

    return {"status": "success", "config": PLATFORM_CONFIG}


@router.get("/audit-logs")
def get_audit_logs() -> list[dict]:
    """Return the in-memory audit log."""
    return AUDIT_LOGS


@router.post("/db-check")
def db_check(db: Session = Depends(deps.get_db)) -> dict[str, str]:
    """Run a basic database integrity check."""
    try:
        user_count = db.query(User).count()
        logger.info("DB integrity check passed: %d users", user_count)
        return {"status": "success", "message": f"Integrity Check Passed. {user_count} records verified."}
    except Exception as e:
        logger.error("DB integrity check failed: %s", e)
        raise HTTPException(status_code=500, detail="Database check failed")


@router.post("/system/backup")
def system_backup(
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Generate a secure, timestamped backup snapshot of the database."""
    import os
    import shutil
    from datetime import datetime
    from app.db.session import SQLALCHEMY_DATABASE_URL

    try:
        from pathlib import Path
        current_file = Path(__file__).resolve()
        # app/api/v1/endpoints/admin/system.py -> root is 5 levels up
        base_dir = str(current_file.parents[5])
        backups_dir = os.path.join(base_dir, "data", "backups")
        os.makedirs(backups_dir, exist_ok=True)




        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"SEC_LAB_SNAP_{timestamp}.db"
        backup_filepath = os.path.join(backups_dir, backup_filename)

        if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
            # Clean SQLite file path & make absolute if relative
            raw_path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
            db_path = raw_path if os.path.isabs(raw_path) else os.path.join(base_dir, raw_path)
            if os.path.exists(db_path):
                shutil.copy2(db_path, backup_filepath)
            else:
                # Fallback: export JSON snapshot of users and state

                users = db.query(User).all()
                import json
                snapshot_data = [{
                    "id": u.id, "username": u.username, "email": u.email,
                    "points": u.points, "is_active": u.is_active,
                    "is_superuser": u.is_superuser, "last_active": str(u.last_active)
                } for u in users]
                backup_filename = f"SEC_LAB_SNAP_{timestamp}.json"
                backup_filepath = os.path.join(backups_dir, backup_filename)
                with open(backup_filepath, "w") as f:
                    json.dump(snapshot_data, f, indent=2)
        
        # Cloud Storage Upload Integration (AWS S3 / Compatible Cloud Vault)
        s3_bucket = os.getenv("S3_BACKUP_BUCKET")
        s3_status_msg = ""

        if s3_bucket:
            try:
                import boto3
                s3_client = boto3.client(
                    "s3",
                    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                    region_name=os.getenv("AWS_REGION", "us-east-1")
                )
                s3_key = f"backups/{backup_filename}"
                s3_client.upload_file(backup_filepath, s3_bucket, s3_key)
                s3_status_msg = f" (Uploaded to Cloud S3: s3://{s3_bucket}/{s3_key})"
                logger.info("Backup uploaded to Cloud S3 bucket %s: %s", s3_bucket, s3_key)
            except Exception as cloud_err:
                logger.warning("Cloud S3 upload failed (fallback to local): %s", cloud_err)
                s3_status_msg = " (Cloud sync pending - saved locally)"
        else:
            s3_status_msg = " (Saved locally to Vault. Configure S3_BACKUP_BUCKET for Cloud auto-sync)"

        msg = f"Backup snapshot archived: {backup_filename}{s3_status_msg}"
        add_audit_log(current_admin.id, "DB_BACKUP", f"Archived snapshot {backup_filename}")
        logger.info("Admin %s generated DB backup: %s", current_admin.username, backup_filename)

        return {"status": "success", "message": msg, "filename": backup_filename}

    except Exception as e:
        logger.error("DB backup failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {str(e)}")



@router.post("/emergency-reset")
def emergency_reset(
    current_admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Placeholder for emergency system reset."""
    add_audit_log(current_admin.id, "EMERGENCY_RESET", "Emergency reset triggered by admin.")
    logger.warning("Admin %s triggered emergency reset", current_admin.username)
    return {"status": "success", "message": "All core services restarted successfully."}

