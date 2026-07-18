import pytest
from fastapi import status

def test_register_new_user_success(client):
    payload = {
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "securepassword123"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["username"] == payload["username"]
    assert data["email"] == payload["email"]
    assert "password" not in data

def test_register_duplicate_username_fails(client, normal_user):
    payload = {
        "username": normal_user["username"], # Taken
        "email": "different_email@example.com",
        "password": "anotherpassword1"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "already exists" in response.json()["detail"]

def test_register_invalid_email_fails(client):
    payload = {
        "username": "someuser",
        "email": "not-an-email", # Invalid email format
        "password": "somepassword123"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_login_success(client, normal_user):
    # Form data login
    login_data = {
        "username": normal_user["username"],
        "password": normal_user["password"]
    }
    response = client.post("/api/v1/auth/login/access-token", data=login_data)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_incorrect_password(client, normal_user):
    login_data = {
        "username": normal_user["username"],
        "password": "WrongPasswordHere"
    }
    response = client.post("/api/v1/auth/login/access-token", data=login_data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Incorrect username or password" in response.json()["detail"]

def test_login_non_existent_user(client):
    login_data = {
        "username": "doesnotexist",
        "password": "somepassword"
    }
    response = client.post("/api/v1/auth/login/access-token", data=login_data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Incorrect username or password" in response.json()["detail"]
