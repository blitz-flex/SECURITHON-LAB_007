from typing import Optional
from pydantic import BaseModel, EmailStr

class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    points: int = 0
    is_superuser: bool = False
    is_mfa_enabled: bool = False


class UserCreate(UserBase):
    password: str
    email: EmailStr

class UserUpdate(UserBase):
    password: Optional[str] = None

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None


class UserInDBBase(UserBase):
    class Config:
        from_attributes = True

class User(UserInDBBase):
    pass

class UserInDB(UserInDBBase):
    hashed_password: str
