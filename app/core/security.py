from datetime import datetime, timedelta
from typing import Optional, Any, Union
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings
import hmac
import hashlib
import time
import base64
import struct

# TOTP constants
TOTP_INTERVAL_SECONDS = 30
TOTP_CODE_DIGITS = 6
TOTP_TIME_DRIFT_INTERVALS = 10
TOTP_MAX_VALUE = 10**TOTP_CODE_DIGITS  # 1,000,000

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_totp(secret: str, code: str) -> bool:
    code = code.strip()
    if len(code) != TOTP_CODE_DIGITS or not code.isdigit():
        return False
    
    missing_padding = len(secret) % 8
    if missing_padding:
        secret += '=' * (8 - missing_padding)
    
    try:
        key = base64.b32decode(secret, casefold=True)
    except Exception:
        return False
    
    def get_hotp_token(intervals_no: int) -> int:
        msg = struct.pack(">Q", intervals_no)
        hmac_result = hmac.new(key, msg, hashlib.sha1).digest()
        o = hmac_result[19] & 15
        token = (struct.unpack(">I", hmac_result[o:o+4])[0] & 0x7fffffff) % TOTP_MAX_VALUE
        return token
    
    val = int(code)
    curr_interval = int(time.time() // TOTP_INTERVAL_SECONDS)
    for i in range(-TOTP_TIME_DRIFT_INTERVALS, TOTP_TIME_DRIFT_INTERVALS + 1):  # Allow 5 minutes clock drift (robust for local dev/VM)
        if get_hotp_token(curr_interval + i) == val:
            return True
    return False

def get_current_totp_code(secret: str) -> str:
    missing_padding = len(secret) % 8
    if missing_padding:
        secret += '=' * (8 - missing_padding)
    try:
        key = base64.b32decode(secret, casefold=True)
        curr_interval = int(time.time() // TOTP_INTERVAL_SECONDS)
        msg = struct.pack(">Q", curr_interval)
        hmac_result = hmac.new(key, msg, hashlib.sha1).digest()
        o = hmac_result[19] & 15
        token = (struct.unpack(">I", hmac_result[o:o+4])[0] & 0x7fffffff) % TOTP_MAX_VALUE
        return f"{{token:{TOTP_CODE_DIGITS}d}}"
    except Exception:
        return "000000"
