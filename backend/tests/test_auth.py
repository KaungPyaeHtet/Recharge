import pytest


REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"


# ── Registration ──────────────────────────────────────────────────────────────

def test_register_returns_token(client):
    r = client.post(REGISTER_URL, json={"email": "alice@example.com", "password": "secret1"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_register_duplicate_email_returns_409(client):
    payload = {"email": "bob@example.com", "password": "secret1"}
    client.post(REGISTER_URL, json=payload)
    r = client.post(REGISTER_URL, json=payload)
    assert r.status_code == 409
    assert "already registered" in r.json()["detail"].lower()


def test_register_normalises_email_to_lowercase(client):
    r = client.post(REGISTER_URL, json={"email": "UPPER@Example.COM", "password": "secret1"})
    assert r.status_code == 200
    # Duplicate using lowercase should also conflict
    r2 = client.post(REGISTER_URL, json={"email": "upper@example.com", "password": "secret1"})
    assert r2.status_code == 409


def test_register_rejects_short_password(client):
    r = client.post(REGISTER_URL, json={"email": "carol@example.com", "password": "abc"})
    assert r.status_code == 422  # Pydantic validation


# ── Login ─────────────────────────────────────────────────────────────────────

def test_login_with_correct_credentials(client):
    client.post(REGISTER_URL, json={"email": "dave@example.com", "password": "mypassword"})
    r = client.post(LOGIN_URL, json={"email": "dave@example.com", "password": "mypassword"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password_returns_401(client):
    client.post(REGISTER_URL, json={"email": "eve@example.com", "password": "correct"})
    r = client.post(LOGIN_URL, json={"email": "eve@example.com", "password": "wrong"})
    assert r.status_code == 401


def test_login_unknown_email_returns_401(client):
    r = client.post(LOGIN_URL, json={"email": "ghost@example.com", "password": "anything"})
    assert r.status_code == 401


def test_login_is_case_insensitive_for_email(client):
    client.post(REGISTER_URL, json={"email": "frank@example.com", "password": "pass123"})
    r = client.post(LOGIN_URL, json={"email": "FRANK@Example.COM", "password": "pass123"})
    assert r.status_code == 200


# ── /api/me ───────────────────────────────────────────────────────────────────

def _register_and_token(client, email="user@example.com", password="pass123") -> str:
    r = client.post(REGISTER_URL, json={"email": email, "password": password})
    return r.json()["access_token"]


def test_me_returns_user_info(client):
    token = _register_and_token(client)
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["email"] == "user@example.com"
    assert "id" in user


def test_me_without_token_returns_401(client):
    r = client.get("/api/me")
    assert r.status_code == 401


def test_me_with_invalid_token_returns_401(client):
    r = client.get("/api/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401
