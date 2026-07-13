import os
import pytest
from fastapi.testclient import TestClient

# 1. Set the database URL in the environment before importing any app modules
TEST_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "test.db"
)
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

# Import after setting the env var so that the engine loads the test database
from app.main import app
from app.db.session import Base, engine, get_db
from app.crud import user as user_crud
from app.schemas.user import UserCreate
from app.core.security import create_access_token, get_password_hash

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Clean tables using metadata instead of deleting file to avoid breaking open engine descriptors
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    yield
    
    # Teardown: drop tables
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db():
    # Provide a function-scoped database session, and rollback any changes to keep tests isolated
    connection = engine.connect()
    transaction = connection.begin()
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=connection)
    session = Session()
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db):
    # Override get_db in both locations
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    from app.api import deps
    app.dependency_overrides[deps.get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
        
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def normal_user(db):
    """Creates a normal user and returns their token and user object."""
    username = "testuser"
    email = "testuser@example.com"
    password = "password123"
    
    # Check if user already exists in this transaction
    existing = user_crud.get_by_username(db, username=username)
    if existing:
        user_crud.delete(db, id=existing.id) # if delete exists, or just roll back / ignore
        
    user_in = UserCreate(
        username=username,
        email=email,
        password=password,
        is_superuser=False
    )
    db_user = user_crud.create(db, obj_in=user_in)
    token = create_access_token(subject=username)
    return {
        "user": db_user,
        "username": username,
        "email": email,
        "password": password,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"}
    }

@pytest.fixture(scope="function")
def admin_user(db):
    """Creates an admin user and returns their token and user object."""
    username = "admin"
    email = "admin@example.com"
    password = "adminpassword"
    
    user_in = UserCreate(
        username=username,
        email=email,
        password=password,
        is_superuser=True
    )
    db_user = user_crud.create(db, obj_in=user_in)
    # Ensure they are superuser
    db_user.is_superuser = True
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    token = create_access_token(subject=username)
    return {
        "user": db_user,
        "username": username,
        "email": email,
        "password": password,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"}
    }


@pytest.fixture(scope="function", autouse=True)
def reset_cisa_cache():
    from app.api.v1.endpoints.infrasec import clear_cisa_kev_cache
    clear_cisa_kev_cache()
    yield
    clear_cisa_kev_cache()
