import pytest
from datetime import timedelta
from jose import jwt, JWTError
from app.core import security
from app.core.config import settings

def test_password_hash_success():
    password = "SuperSecretPassword123"
    hashed = security.get_password_hash(password)
    assert hashed != password
    assert security.verify_password(password, hashed) is True

def test_password_hash_incorrect():
    password = "SuperSecretPassword123"
    hashed = security.get_password_hash(password)
    assert security.verify_password("WrongPassword", hashed) is False

def test_jwt_token_generation_and_decoding():
    subject = "test_user_subject"
    token = security.create_access_token(subject=subject)
    decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert decoded.get("sub") == subject

def test_jwt_expired_token():
    subject = "test_expired_user"
    # Create token with a negative expiry delta to force immediate expiration
    token = security.create_access_token(subject=subject, expires_delta=timedelta(minutes=-5))
    with pytest.raises(JWTError):
        jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

def test_totp_code_verification_success():
    # A valid base32 key
    secret = "JBSWY3DPEHPK3PXP" # standard base32
    code = security.get_current_totp_code(secret)
    assert security.verify_totp(secret, code) is True

def test_totp_code_verification_failure():
    secret = "JBSWY3DPEHPK3PXP"
    # Incorrect code (wrong length/characters/value)
    assert security.verify_totp(secret, "12345") is False
    assert security.verify_totp(secret, "abcdef") is False
    assert security.verify_totp(secret, "999999") is False
