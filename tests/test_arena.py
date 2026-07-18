import pytest
from fastapi import status
from app.crud import user as user_crud

def test_submit_correct_patch_earns_xp(client, normal_user, db):
    # Verify user points before
    initial_points = normal_user["user"].points or 0
    
    # Send a correct patch for identity challenge (ID_)
    # A correct patch does not contain "HARDCODED_SECRET_VALUE"
    payload = {
        "challenge_id": "ID_0",
        "code": "const secret = process.env.SECRET_API_KEY;"
    }
    response = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert data["points"] > initial_points
    
    # Verify persisted DB state after solved_labs is updated.
    db.expire_all()
    user_db = user_crud.get(db, normal_user["user"].id)
    assert user_db.points == data["points"]
    assert user_db.leaderboard_efficiency_count == 1
    assert user_db.leaderboard_clean_code_count == 1

def test_backend_solved_state_prevents_double_xp_after_client_storage_loss(client, normal_user, db):
    payload = {
        "challenge_id": "ID_0",
        "code": "const secret = process.env.SECRET_API_KEY;",
        "already_solved": False,
    }

    first = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert first.status_code == status.HTTP_200_OK
    first_data = first.json()
    assert first_data["success"] is True
    assert first_data["reward"] > 0

    # Simulates logout/localStorage loss: client no longer knows the challenge was solved.
    second = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert second.status_code == status.HTTP_200_OK
    second_data = second.json()
    assert second_data["success"] is True
    assert second_data["reward"] == 0
    assert second_data["points"] == first_data["points"]

    db.expire_all()
    user_db = user_crud.get(db, normal_user["user"].id)
    assert user_db.points == first_data["points"]


def test_successful_patch_is_returned_when_reopening_challenge(client, normal_user):
    fixed_code = "const secret = process.env.SECRET_API_KEY;"
    payload = {
        "challenge_id": "ID_0",
        "code": fixed_code,
    }

    solved = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert solved.status_code == status.HTTP_200_OK
    assert solved.json()["success"] is True

    reopened = client.post(
        "/api/v1/arena/open",
        json={"challenge_id": "ID_0"},
        headers=normal_user["headers"],
    )
    assert reopened.status_code == status.HTTP_200_OK
    assert reopened.json()["last_successful_code"] == fixed_code


def test_client_controlled_difficulty_cannot_increase_reward(client, normal_user):
    payload = {
        "challenge_id": "ID_0",
        "code": "const secret = process.env.SECRET_API_KEY;",
        "difficulty": "critical",
    }

    response = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert data["reward"] == 100


def test_successful_reward_response_has_no_timer_fields(client, normal_user, db):
    payload = {
        "challenge_id": "ID_0",
        "code": "const secret = process.env.SECRET_API_KEY;",
    }

    response = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert data["reward"] == 100
    assert set(data) == {"success", "message", "points", "reward"}

    db.expire_all()
    user_db = user_crud.get(db, normal_user["user"].id)
    assert user_db.leaderboard_efficiency_total == 60
    assert user_db.leaderboard_efficiency_count == 1


def test_open_challenge_returns_saved_code_without_timer_fields(client, normal_user):
    fixed_code = "const secret = process.env.SECRET_API_KEY;"
    solved = client.post(
        "/api/v1/arena/verify",
        json={
            "challenge_id": "ID_0",
            "code": fixed_code,
        },
        headers=normal_user["headers"],
    )
    assert solved.status_code == status.HTTP_200_OK
    assert solved.json()["success"] is True

    opened = client.post(
        "/api/v1/arena/open",
        json={"challenge_id": "ID_0"},
        headers=normal_user["headers"],
    )
    assert opened.status_code == status.HTTP_200_OK
    data = opened.json()
    assert data == {
        "challenge_id": "ID_0",
        "last_successful_code": fixed_code,
    }


def test_reset_does_not_clear_completed_challenge_or_deduct_points(client, normal_user, db):
    payload = {
        "challenge_id": "ID_0",
        "code": "const secret = process.env.SECRET_API_KEY;",
        "already_solved": False,
    }
    solved = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert solved.status_code == status.HTTP_200_OK
    solved_data = solved.json()
    assert solved_data["reward"] > 0

    reset = client.post(
        "/api/v1/arena/reset",
        json={"challenge_id": "ID_0", "difficulty": "medium"},
        headers=normal_user["headers"],
    )
    assert reset.status_code == status.HTTP_200_OK
    reset_data = reset.json()
    assert reset_data["points"] == solved_data["points"]
    assert "ID_0" in reset_data["solved_labs"]

    retry = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert retry.status_code == status.HTTP_200_OK
    assert retry.json()["reward"] == 0

def test_submit_incorrect_patch_no_xp(client, normal_user, db):
    initial_points = normal_user["user"].points or 0
    
    # Send an incorrect patch containing "HARDCODED_SECRET_VALUE"
    payload = {
        "challenge_id": "ID_0",
        "code": "const secret = 'HARDCODED_SECRET_VALUE';"
    }
    response = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is False
    
    # Verify points did not change
    user_db = user_crud.get(db, normal_user["user"].id)
    assert user_db.points == initial_points

def test_submit_unauthenticated_fails(client):
    """Without auth, request should be rejected."""
    payload = {"challenge_id": "ID_0", "code": "const secret = process.env.SECRET_API_KEY;"}
    response = client.post("/api/v1/arena/verify", json=payload)
    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


def test_unknown_challenge_id_fails_closed(client, normal_user):
    payload = {"challenge_id": "UNKNOWN_1", "code": "secure = true"}
    response = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is False
    assert data["reward"] == 0
    assert "failed closed" in data["message"]


def test_forged_legacy_prefix_challenge_id_fails_closed(client, normal_user, db):
    payload = {"challenge_id": "LIVE_REAL_FORGED_1", "code": "safe"}
    response = client.post("/api/v1/arena/verify", json=payload, headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is False
    assert data["reward"] == 0
    assert data["points"] == (normal_user["user"].points or 0)
    assert "failed closed" in data["message"]

    db.expire_all()
    user_db = user_crud.get(db, normal_user["user"].id)
    assert "LIVE_REAL_FORGED_1" not in user_crud.get_solved_labs(user_db)

def test_secured_points_handling(client, normal_user):
    # Client cannot arbitrarily update points (i.e. /api/v1/users/me/points returns 404)
    # The client can only gain points by submitting patches through the verify endpoint.
    response = client.put(
        "/api/v1/users/me/points",
        json={"points": 99999},
        headers=normal_user["headers"]
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND

def test_live_real_threat_verification(client, normal_user):
    # Test incorrect patch for SQLi live challenge
    payload_bad = {
        "challenge_id": "LIVE_REAL_100",
        "code": "query = f\"SELECT * FROM users WHERE id = '{username}'\""
    }
    response_bad = client.post("/api/v1/arena/verify", json=payload_bad, headers=normal_user["headers"])
    assert response_bad.status_code == status.HTTP_200_OK
    assert response_bad.json()["success"] is False

    # Test correct parameterized patch for SQLi live challenge
    payload_good = {
        "challenge_id": "LIVE_REAL_100",
        "code": "cursor.execute(\"SELECT * FROM users WHERE id = ?\", (username,))"
    }
    response_good = client.post("/api/v1/arena/verify", json=payload_good, headers=normal_user["headers"])
    assert response_good.status_code == status.HTTP_200_OK
    assert response_good.json()["success"] is True

