import pytest
from sqlalchemy.exc import IntegrityError
from app.crud import user as user_crud
from app.schemas.user import UserCreate
from app.core import security

def test_crud_create_user_success(db):
    username = "cruduser"
    email = "cruduser@example.com"
    password = "crudpassword"
    
    user_in = UserCreate(
        username=username,
        email=email,
        password=password
    )
    db_user = user_crud.create(db, obj_in=user_in)
    assert db_user.username == username
    assert db_user.email == email
    assert security.verify_password(password, db_user.hashed_password) is True
    assert db_user.is_superuser is False

def test_crud_get_user_by_username_or_email(db):
    username = "uniqueuser"
    email = "unique@example.com"
    user_in = UserCreate(
        username=username,
        email=email,
        password="password123"
    )
    user_crud.create(db, obj_in=user_in)
    
    # Retrieve by username or email
    user = user_crud.get_by_username_or_email(db, username=username, email="other@example.com")
    assert user is not None
    assert user.username == username
    
    user_by_email = user_crud.get_by_username_or_email(db, username="otheruser", email=email)
    assert user_by_email is not None
    assert user_by_email.email == email

def test_crud_touch_user_activity(db):
    username = "activeuser"
    user_in = UserCreate(
        username=username,
        email="activeuser@example.com",
        password="password123"
    )
    db_user = user_crud.create(db, obj_in=user_in)
    
    ip = "198.51.100.42"
    touched_user = user_crud.touch(db, db_user=db_user, ip=ip)
    assert touched_user.last_ip == ip
    assert touched_user.last_active is not None

def test_crud_create_duplicate_user_fails(db):
    username = "duplicateuser"
    email = "duplicate@example.com"
    user_in1 = UserCreate(
        username=username,
        email=email,
        password="password123"
    )
    user_crud.create(db, obj_in=user_in1)
    
    # Create duplicate username
    user_in2 = UserCreate(
        username=username,
        email="different@example.com",
        password="password456"
    )
    with pytest.raises(IntegrityError):
        # We need to use a nested transaction/savepoint because sqlalchemy throws error on commit
        # pytest functions run inside database transactions, so an integrity error will invalidate
        # the transaction unless we roll back or run inside a subtransaction/savepoint.
        db.begin_nested()
        user_crud.create(db, obj_in=user_in2)
        db.commit()
