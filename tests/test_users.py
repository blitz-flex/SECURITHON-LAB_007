import pytest
from fastapi import status
from app.core import security
from app.crud import user as user_crud
from app.schemas.user import UserCreate

def test_get_profile_authenticated(client, normal_user):
    response = client.get("/api/v1/users/me", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["username"] == normal_user["username"]
    assert data["email"] == normal_user["email"]

def test_get_profile_unauthenticated(client):
    response = client.get("/api/v1/users/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

def test_update_profile_success(client, normal_user):
    payload = {
        "full_name": "New Full Name",
        "password": "NewSecurePassword1",
        "current_password": "password123"
    }
    response = client.put("/api/v1/users/me", json=payload, headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["full_name"] == "New Full Name"

def test_mfa_setup_flow(client, normal_user):
    response = client.get("/api/v1/users/me/mfa-setup", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "secret" in data
    assert "otpauth_url" in data
    assert "current_code" not in data
    assert normal_user["username"] in data["otpauth_url"]

def test_mfa_verify_and_enable(client, normal_user):
    # Step 1: Init setup to get secret
    setup_response = client.get("/api/v1/users/me/mfa-setup", headers=normal_user["headers"])
    secret = setup_response.json()["secret"]
    
    # Step 2: Get code
    code = security.get_current_totp_code(secret)
    
    # Step 3: Verify and enable
    verify_payload = {"code": code}
    verify_response = client.post(
        "/api/v1/users/me/mfa-verify",
        json=verify_payload,
        headers=normal_user["headers"]
    )
    assert verify_response.status_code == status.HTTP_200_OK
    assert verify_response.json()["status"] == "success"
    
    # Step 4: Verify it's actually enabled in profile
    me_response = client.get("/api/v1/users/me", headers=normal_user["headers"])
    assert me_response.json()["is_mfa_enabled"] is True

def test_lab_progress_sync_does_not_trust_client_solved_ids(client, normal_user, db):
    sync = client.post(
        "/api/v1/users/me/lab-progress/sync",
        json={"solved_ids": ["cwe89", "FAKE_XP_1"]},
        headers=normal_user["headers"],
    )
    assert sync.status_code == 200
    data = sync.json()
    assert "security_node" in data
    assert "skills" in data
    assert data["labs_solved"] == 0
    assert data["points"] == (normal_user["user"].points or 0)
    assert "exploitation" in data["skills"]

    stats = client.get("/api/v1/users/me/tactical-stats", headers=normal_user["headers"])
    assert stats.status_code == 200
    assert stats.json()["labs_solved"] == 0

    db.expire_all()
    user_db = user_crud.get(db, normal_user["user"].id)
    assert "cwe89" not in user_crud.get_solved_labs(user_db)
    assert "FAKE_XP_1" not in user_crud.get_solved_labs(user_db)


def test_profile_does_not_repair_points_from_persisted_solved_labs(client, normal_user, db):
    user_crud.set_solved_labs(db, db_user=normal_user["user"], lab_ids=["cwe89"])
    user_crud.update_points(db, db_user=normal_user["user"], points=0)

    response = client.get("/api/v1/users/me", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["points"] == 0
    assert "cwe89" in data["solved_labs"]


def test_profile_repair_ignores_unknown_solved_lab_ids(client, normal_user, db):
    user_crud.set_solved_labs(db, db_user=normal_user["user"], lab_ids=["FAKE_XP_1"])
    user_crud.update_points(db, db_user=normal_user["user"], points=0)

    response = client.get("/api/v1/users/me", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["points"] == 0
    assert "FAKE_XP_1" in data["solved_labs"]


def test_leaderboard_uses_persisted_measured_metrics(client, normal_user, db):
    user_crud.record_leaderboard_metrics(
        db,
        db_user=normal_user["user"],
        efficiency_score=91,
        clean_code_score=87,
    )
    user_crud.update_points(db, db_user=normal_user["user"], points=250)

    response = client.get("/api/v1/users/leaderboard", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    me = response.json()["me"]
    assert me["efficiency"] == 91
    assert me["clean_code"] == 87
    assert me["total"] == 250


def test_leaderboard_delta_tracks_rank_movement(client, normal_user, db):
    rival = user_crud.create(
        db,
        obj_in=UserCreate(
            username="deltauser",
            email="deltauser@example.com",
            password="password123",
            is_superuser=False,
        ),
    )
    user_crud.update_points(db, db_user=normal_user["user"], points=100)
    user_crud.update_points(db, db_user=rival, points=200)

    first = client.get("/api/v1/users/leaderboard", headers=normal_user["headers"])
    assert first.status_code == status.HTTP_200_OK
    assert first.json()["me"]["rank"] == 2
    assert first.json()["me"]["delta"] == 0

    user_crud.update_points(db, db_user=normal_user["user"], points=300)
    second = client.get("/api/v1/users/leaderboard", headers=normal_user["headers"])

    assert second.status_code == status.HTTP_200_OK
    data = second.json()
    assert data["me"]["rank"] == 1
    assert data["me"]["delta"] == 1
    rival_row = next(row for row in data["top"] if row["username"] == "deltauser")
    assert rival_row["delta"] == -1

    refreshed = client.get("/api/v1/users/leaderboard", headers=normal_user["headers"])
    assert refreshed.status_code == status.HTTP_200_OK
    assert refreshed.json()["me"]["delta"] == 1


def test_points_endpoint_is_removed_fails(client, normal_user):
    # Calling the deleted endpoints should result in 404
    response_get = client.get("/api/v1/users/me/points", headers=normal_user["headers"])
    assert response_get.status_code == status.HTTP_404_NOT_FOUND
    
    response_put = client.put(
        "/api/v1/users/me/points",
        json={"points": 99999},
        headers=normal_user["headers"]
    )
    assert response_put.status_code == status.HTTP_404_NOT_FOUND
