"""
AuditLog DB model — persistent admin action history.
"""
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text
from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, index=True)
    timestamp  = Column(DateTime, default=datetime.utcnow, index=True)
    user_id    = Column(Integer, nullable=True, index=True)
    username   = Column(String, nullable=True)
    action     = Column(String(64), nullable=False, index=True)
    detail     = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
