from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean(), default=True)
    is_superuser = Column(Boolean(), default=False)
    points = Column(Integer, default=0)
    solved_labs = Column(Text, nullable=True)  # JSON array of challenge ids
    leaderboard_efficiency_total = Column(Integer, default=0)
    leaderboard_efficiency_count = Column(Integer, default=0)
    leaderboard_clean_code_total = Column(Integer, default=0)
    leaderboard_clean_code_count = Column(Integer, default=0)
    leaderboard_current_rank = Column(Integer, nullable=True)
    leaderboard_previous_rank = Column(Integer, nullable=True)
    is_mfa_enabled = Column(Boolean(), default=False)
    mfa_secret = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)   # Optional phone number
    sms_otp = Column(String, nullable=True)         # Current OTP code (reused for Email OTP)
    otp_expires_at = Column(DateTime, nullable=True) # OTP expiry
    last_active = Column(DateTime, default=datetime.utcnow)
    last_ip = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ai_mentor_quotas = relationship("AIMentorQuota", back_populates="user", cascade="all, delete-orphan")
    challenge_attempts = relationship("ChallengeAttempt", back_populates="user", cascade="all, delete-orphan")


class AIMentorQuota(Base):
    __tablename__ = "ai_mentor_quotas"
    __table_args__ = (UniqueConstraint("user_id", "challenge_id", name="uq_ai_mentor_quota_user_challenge"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    challenge_id = Column(String, nullable=False, index=True)
    used_count = Column(Integer, nullable=False, default=0)
    window_started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    chat_history = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="ai_mentor_quotas")


class ChallengeAttempt(Base):
    __tablename__ = "challenge_attempts"
    __table_args__ = (UniqueConstraint("user_id", "challenge_id", name="uq_challenge_attempt_user_challenge"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    challenge_id = Column(String, nullable=False, index=True)
    last_successful_code = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="challenge_attempts")
