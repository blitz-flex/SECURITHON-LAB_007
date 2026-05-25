from sqlalchemy import Boolean, Column, Integer, String, DateTime, Text
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
    is_mfa_enabled = Column(Boolean(), default=False)
    mfa_secret = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)   # Optional phone number
    sms_otp = Column(String, nullable=True)         # Current OTP code (reused for Email OTP)
    otp_expires_at = Column(DateTime, nullable=True) # OTP expiry
    last_active = Column(DateTime, default=datetime.utcnow)
    last_ip = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

