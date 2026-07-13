import pytest
from fastapi import status
from app.crud import user as user_crud
from app.main import _enforce_admin_policy
from app.models.user import User

def test_admin_endpoints_by_normal_user_denied(client, normal_user):
    # Try fetching users
    response = client.get("/api/v1/admin/users", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_403_FORBIDDEN
    
    # Try updating settings
    payload = {"maintenance_mode": True}
    response2 = client.post("/api/v1/admin/settings", json=payload, headers=normal_user["headers"])
    assert response2.status_code == status.HTTP_403_FORBIDDEN

def test_admin_endpoints_by_anonymous_user_denied(client):
    response = client.get("/api/v1/admin/users")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_admin_page_by_anonymous_user_redirects_to_login(client):
    response = client.get("/admin", follow_redirects=False)
    assert response.status_code in (status.HTTP_303_SEE_OTHER, status.HTTP_307_TEMPORARY_REDIRECT)
    assert response.headers["location"] == "/login"


def test_admin_page_by_normal_user_denied(client, normal_user):
    response = client.get("/admin", headers=normal_user["headers"])
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_admin_page_by_admin_user_allowed(client, admin_user):
    response = client.get("/admin", headers=admin_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    assert "Admin" in response.text or "OCC" in response.text

def test_get_all_users_as_admin(client, admin_user, normal_user):
    response = client.get("/api/v1/admin/users", headers=admin_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 2
    usernames = [u["username"] for u in data]
    assert admin_user["username"] in usernames
    assert normal_user["username"] in usernames

def test_promote_user_action(client, admin_user, normal_user, db):
    payload = {"action": "promote"}
    url = f"/api/v1/admin/users/{normal_user['user'].id}/action"
    response = client.post(url, json=payload, headers=admin_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_superuser"] is True
    
    # Verify in DB
    user_db = user_crud.get(db, normal_user["user"].id)
    assert user_db.is_superuser is True


def test_admin_policy_preserves_promoted_non_admin_superusers(monkeypatch, admin_user, normal_user, db):
    class SessionProxy:
        def query(self, *args, **kwargs):
            return db.query(*args, **kwargs)

        def commit(self):
            db.flush()

        def rollback(self):
            db.rollback()

        def close(self):
            pass

    monkeypatch.setattr("app.main.SessionLocal", lambda: SessionProxy())
    normal_user["user"].is_superuser = True
    db.add(normal_user["user"])
    db.commit()

    _enforce_admin_policy()

    db.expire_all()
    admin_db = user_crud.get(db, admin_user["user"].id)
    user_db = user_crud.get(db, normal_user["user"].id)
    assert admin_db.is_active is True
    assert admin_db.is_superuser is True
    assert user_db.is_superuser is True

def test_ban_user_action(client, admin_user, normal_user, db):
    # Initially user is active
    assert normal_user["user"].is_active is True
    
    payload = {"action": "ban"}
    url = f"/api/v1/admin/users/{normal_user['user'].id}/action"
    response = client.post(url, json=payload, headers=admin_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_active"] is False
    
    # Verify in DB
    user_db = user_crud.get(db, normal_user["user"].id)
    assert user_db.is_active is False

def test_prevent_self_deletion(client, admin_user):
    url = f"/api/v1/admin/users/{admin_user['user'].id}"
    response = client.delete(url, headers=admin_user["headers"])
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Cannot delete your own admin account" in response.json()["detail"]

def test_update_platform_settings(client, admin_user):
    payload = {"maintenance_mode": True}
    response = client.post("/api/v1/admin/settings", json=payload, headers=admin_user["headers"])
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["config"]["maintenance_mode"] is True
    
    # Clean up settings
    payload_cleanup = {"maintenance_mode": False}
    client.post("/api/v1/admin/settings", json=payload_cleanup, headers=admin_user["headers"])
