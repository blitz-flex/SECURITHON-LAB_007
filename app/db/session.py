from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Default to data/app.db if no environment variable is provided
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(os.path.dirname(BASE_DIR), 'data', 'app.db')}")

# connect_args={"check_same_thread": False} is required only for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
