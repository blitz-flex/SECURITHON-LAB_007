import re
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    points: int = 0
    is_superuser: bool = False
    is_mfa_enabled: bool = False
    solved_labs: Optional[str] = None

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not v:
            raise ValueError("Username cannot be empty.")
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Username cannot consist purely of whitespace.")
        if len(v_stripped) < 3 or len(v_stripped) > 30:
            raise ValueError("Username must be between 3 and 30 characters.")
        if not re.match(r'^[a-zA-Z0-9_-]+$', v_stripped):
            raise ValueError("Username can only contain letters, numbers, underscores, and hyphens (no spaces allowed).")
        return v_stripped

    @field_validator('full_name')
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_stripped = v.strip()
            return v_stripped if v_stripped else None
        return v


class UserCreate(UserBase):
    password: str
    email: EmailStr

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: EmailStr) -> str:
        if v:
            return v.strip().lower()
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError("Password cannot be empty.")
        if not v.strip():
            raise ValueError("Password cannot consist purely of whitespace.")
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class UserUpdate(UserBase):
    password: Optional[str] = None


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    current_password: Optional[str] = None


class UserInDBBase(UserBase):
    class Config:
        from_attributes = True


class User(UserInDBBase):
    pass


class UserInDB(UserInDBBase):
    hashed_password: str
