import
sqlite3
import psycopg2
import os

# Connect to local SQLite database
sqlite_path = "data/app.db"
if not os.path.exists(sqlite_path):
    print(f"Error: Local database not found at {sqlite_path}")
    exit(1)
sqlite_conn = sqlite3.connect(sqlite_path)
sqlite_cursor = sqlite_conn.cursor()
# Get Neon/Supabase Connection String
db_url = input("Enter your remote PostgreSQL Connection URL: ").strip()
if not db_url.startswith("postgresql://") and not db_url.startswith("postgres://"):
    print("Error: Invalid Connection URL. Must start with postgresql:// or postgres://")
    exit(1)
# Connect to Remote PostgreSQL
try:
    pg_conn = psycopg2.connect(db_url)
    pg_cursor = pg_conn.cursor()
    print("Successfully connected to the remote database!")

    # Empty existing auto-created tables on the remote database to prevent ID collisions
    print("Preparing remote tables for migration...")
    pg_cursor.execute("TRUNCATE TABLE challenge_attempts CASCADE;")
    pg_cursor.execute("TRUNCATE TABLE ai_mentor_quotas CASCADE;")
    pg_cursor.execute("TRUNCATE TABLE users CASCADE;")
    pg_conn.commit()
except Exception as e:
    print(f"Failed to connect or prepare the remote database: {e}")
    exit(1)
try:
    # 1. Migrate Users
    sqlite_cursor.execute(
        "SELECT id, full_name, username, email, hashed_password, is_active, is_superuser, points, solved_labs, leaderboard_efficiency_total, leaderboard_efficiency_count, leaderboard_clean_code_total, leaderboard_clean_code_count, is_mfa_enabled, mfa_secret, phone_number, sms_otp, otp_expires_at, last_active, last_ip, created_at FROM users")
    users = sqlite_cursor.fetchall()

    print(f"Found {len(users)} users in SQLite database.")

    # We clear the remote users first or insert with ON CONFLICT DO NOTHING
    for user in users:
        # Convert SQLite 1/0 integers to Python True/False booleans
        user_list = list(user)
        user_list[5] = bool(user_list[5])  # is_active
        user_list[6] = bool(user_list[6])  # is_superuser
        user_list[13] = bool(user_list[13])  # is_mfa_enabled

        pg_cursor.execute("""
            INSERT INTO users (
                id, full_name, username, email, hashed_password, is_active, is_superuser, points, solved_labs,
                leaderboard_efficiency_total, leaderboard_efficiency_count, leaderboard_clean_code_total, leaderboard_clean_code_count,
                is_mfa_enabled, mfa_secret, phone_number, sms_otp, otp_expires_at, last_active, last_ip, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (username) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                hashed_password = EXCLUDED.hashed_password,
                points = EXCLUDED.points,
                solved_labs = EXCLUDED.solved_labs
        """, user_list)

    # 2. Migrate Challenge Attempts
    sqlite_cursor.execute(
        "SELECT id, user_id, challenge_id, last_successful_code, created_at, updated_at FROM challenge_attempts")
    attempts = sqlite_cursor.fetchall()
    print(f"Found {len(attempts)} challenge attempts in SQLite database.")
    for att in attempts:
        pg_cursor.execute("""
            INSERT INTO challenge_attempts (id, user_id, challenge_id, last_successful_code, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id, challenge_id) DO UPDATE SET
                last_successful_code = EXCLUDED.last_successful_code,
                updated_at = EXCLUDED.updated_at
        """, att)
    # Commit PostgreSQL changes
    pg_conn.commit()

    # Reset ID sequence in PostgreSQL so new user creations don't collide
    pg_cursor.execute("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(max(id), 1)) FROM users;")
    pg_cursor.execute(
        "SELECT setval(pg_get_serial_sequence('challenge_attempts', 'id'), COALESCE(max(id), 1)) FROM challenge_attempts;")
    pg_conn.commit()

    print("Migration completed successfully! All users and challenge progress have been transferred.")

except Exception as e:
    pg_conn.rollback()
    print(f"An error occurred during migration: {e}")
finally:
    sqlite_conn.close()
    pg_conn.close()
