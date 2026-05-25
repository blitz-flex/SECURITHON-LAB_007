import sys
import os
from sqlalchemy import text

# Append parent directory to sys.path to import app modules correctly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal, engine
from app.models.user import User
from app.core.security import get_password_hash

def init_admin():
    db = SessionLocal()
    try:
        # Check if is_superuser column exists by querying it. If it fails, add it.
        try:
            db.execute(text("SELECT is_superuser FROM users LIMIT 1"))
        except Exception:
            db.rollback()
            # SQLite add column
            print("Adding is_superuser column to users table...")
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_superuser BOOLEAN DEFAULT 0"))
        
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@securationlab.com",
                full_name="System Administrator",
                hashed_password=get_password_hash("admin"),
                is_active=True,
                is_superuser=True
            )
            db.add(admin_user)
            db.commit()
            print("Admin user created: admin / admin")
        else:
            admin_user.is_superuser = True
            db.commit()
            print("Admin user updated to have superuser privileges.")
            
    finally:
        db.close()

if __name__ == "__main__":
    init_admin()
