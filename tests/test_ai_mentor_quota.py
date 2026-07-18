from datetime import datetime, timezone, timedelta

from fastapi import status

from app.api.v1.endpoints import ai
from app.core.security import create_access_token
from app.crud import user as user_crud
from app.models.user import AIMentorQuota
from app.schemas.user import UserCreate


def _chat_payload(challenge_id="cwe89"):
    return {
        "challenge_id": challenge_id,
        "user_code": "def login(username, password): pass",
        "messages": [{"role": "user", "content": "What should I inspect?"}],
    }


def _create_user(db, username, email):
    db_user = user_crud.create(
        db,
        obj_in=UserCreate(
            username=username,
            email=email,
            password="password123",
            is_superuser=False,
        ),
    )
    token = create_access_token(subject=username)
    return db_user, {"Authorization": f"Bearer {token}"}


def _quota_row(db, user_id, challenge_id):
    return (
        db.query(AIMentorQuota)
        .filter(AIMentorQuota.user_id == user_id, AIMentorQuota.challenge_id == challenge_id)
        .one()
    )


def test_new_user_starts_with_free_quota(client, normal_user):
    response = client.get("/api/v1/ai/quota/cwe89", headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["used"] == 0
    assert response.json()["limit"] == 15
    assert response.json()["remaining"] == 15
    assert response.json()["reset_at"]


def test_live_real_challenge_starts_with_free_quota(client, normal_user):
    response = client.get("/api/v1/ai/quota/LIVE_REAL_101", headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["used"] == 0
    assert response.json()["remaining"] == 15


def test_live_real_high_index_uses_cisa_cache_context(client, normal_user, monkeypatch):
    from app.api.v1.endpoints import infrasec

    infrasec._cisa_kev_cache.update(
        {
            "items": [
                {
                    "cveID": "CVE-2026-1281",
                    "vendorProject": "Ivanti",
                    "product": "Endpoint Manager Mobile",
                    "vulnerabilityName": "Ivanti Endpoint Manager Mobile (EPMM) Code Injection Vulnerability",
                    "shortDescription": "code injection in remote access gateway",
                    "dateAdded": "2026-01-15",
                    "_track_group": "Zero-Trust Network Segmentation",
                    "_year_rank": 1,
                    "_year_limit": 20,
                    "_month": "2026-01",
                    "_lab_difficulty": "Easy",
                }
            ],
            "fetched_at": 1.0,
            "refreshing": False,
        }
    )

    response = client.get("/api/v1/ai/quota/LIVE_REAL_100", headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["remaining"] == 15


def test_quota_status_does_not_start_database_window(client, normal_user, db):
    response = client.get("/api/v1/ai/quota/cwe89", headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    quota = (
        db.query(AIMentorQuota)
        .filter(AIMentorQuota.user_id == normal_user["user"].id, AIMentorQuota.challenge_id == "cwe89")
        .first()
    )
    assert quota is None


def test_unused_existing_quota_status_shows_fresh_window(client, normal_user, db):
    stale_start = datetime.utcnow() - timedelta(hours=5)
    quota = AIMentorQuota(
        user_id=normal_user["user"].id,
        challenge_id="cwe89",
        used_count=0,
        window_started_at=stale_start,
    )
    db.add(quota)
    db.commit()

    response = client.get("/api/v1/ai/quota/cwe89", headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["used"] == 0
    assert data["remaining"] == 15
    reset_at = datetime.fromisoformat(data["reset_at"])
    assert reset_at > datetime.now(timezone.utc) + timedelta(hours=23, minutes=55)


def test_successful_ai_request_increments_quota_and_uses_server_key(client, normal_user, monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "server-key")

    async def fake_call_gemini(api_key, contents, context):
        assert api_key == "server-key"
        return "Inspect how untrusted input reaches the query."

    monkeypatch.setattr(ai, "_call_gemini", fake_call_gemini)

    response = client.post("/api/v1/ai/chat", json=_chat_payload(), headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["reply"] == "Inspect how untrusted input reaches the query."
    assert data["quota"]["used"] == 1
    assert data["quota"]["remaining"] == 14


def test_first_successful_use_starts_24_hour_window(client, normal_user, db, monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "server-key")

    async def fake_call_gemini(api_key, contents, context):
        return "Window starts now"

    monkeypatch.setattr(ai, "_call_gemini", fake_call_gemini)

    stale_start = datetime.utcnow() - timedelta(hours=5)
    quota = AIMentorQuota(
        user_id=normal_user["user"].id,
        challenge_id="cwe89",
        used_count=0,
        window_started_at=stale_start,
    )
    db.add(quota)
    db.commit()

    response = client.post("/api/v1/ai/chat", json=_chat_payload(), headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    quota = _quota_row(db, normal_user["user"].id, "cwe89")
    assert quota.used_count == 1
    assert quota.window_started_at > stale_start
    assert response.json()["quota"]["remaining"] == 14


def test_failed_ai_request_does_not_increment_quota(client, normal_user, db, monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "server-key")

    async def failing_call_gemini(api_key, contents, context):
        raise RuntimeError("upstream down")

    monkeypatch.setattr(ai, "_call_gemini", failing_call_gemini)

    response = client.post("/api/v1/ai/chat", json=_chat_payload(), headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["quota"]["used"] == 0
    quota = _quota_row(db, normal_user["user"].id, "cwe89")
    assert quota.used_count == 0


def test_fifteenth_request_succeeds_and_sixteenth_returns_429(client, normal_user, monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "server-key")

    async def fake_call_gemini(api_key, contents, context):
        return "Hint"

    monkeypatch.setattr(ai, "_call_gemini", fake_call_gemini)

    for _ in range(15):
        response = client.post("/api/v1/ai/chat", json=_chat_payload(), headers=normal_user["headers"])
        assert response.status_code == status.HTTP_200_OK

    assert response.json()["quota"]["used"] == 15
    assert response.json()["quota"]["remaining"] == 0

    response = client.post("/api/v1/ai/chat", json=_chat_payload(), headers=normal_user["headers"])

    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    detail = response.json()["detail"]
    assert detail["quota"]["used"] == 15
    assert detail["quota"]["remaining"] == 0


def test_quota_resets_after_24_hours(client, normal_user, db, monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "server-key")

    async def fake_call_gemini(api_key, contents, context):
        return "Fresh window hint"

    monkeypatch.setattr(ai, "_call_gemini", fake_call_gemini)

    quota = AIMentorQuota(
        user_id=normal_user["user"].id,
        challenge_id="cwe89",
        used_count=15,
        window_started_at=datetime.utcnow() - timedelta(hours=25),
    )
    db.add(quota)
    db.commit()

    response = client.post("/api/v1/ai/chat", json=_chat_payload(), headers=normal_user["headers"])

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["quota"]["used"] == 1
    assert data["quota"]["remaining"] == 14


def test_quota_is_scoped_per_user_and_challenge(client, normal_user, db, monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "server-key")

    async def fake_call_gemini(api_key, contents, context):
        return "Scoped hint"

    monkeypatch.setattr(ai, "_call_gemini", fake_call_gemini)
    other_user, other_headers = _create_user(db, "quotauser2", "quotauser2@example.com")

    response = client.post("/api/v1/ai/chat", json=_chat_payload("cwe89"), headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["quota"]["used"] == 1

    response = client.get("/api/v1/ai/quota/cwe89", headers=other_headers)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["used"] == 0

    response = client.get("/api/v1/ai/quota/cwe79", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["used"] == 0

    other_quota = (
        db.query(AIMentorQuota)
        .filter(AIMentorQuota.user_id == other_user.id, AIMentorQuota.challenge_id == "cwe89")
        .first()
    )
    assert other_quota is None
