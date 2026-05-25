"""
CRUD package — public interface.
Usage: from app.crud import user
       user.get_by_username(db, username="john")
"""
from app.crud.crud_user import user

__all__ = ["user"]
