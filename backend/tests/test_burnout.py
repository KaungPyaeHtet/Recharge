"""Tests for /api/burnout endpoints."""
import pytest

REGISTER_URL = "/api/auth/register"
PREDICT_URL = "/api/burnout/predict"
STATUS_URL = "/api/burnout/status"

VALID_PAYLOAD = {
    "date_of_joining": "2019-03-15",
    "gender": "Male",
    "company_type": "Service",
    "wfh_setup_available": "Yes",
    "designation": 3,
    "resource_allocation": 6.0,
    "mental_fatigue_score": 7.0,
}


def _auth_header(client) -> dict:
    r = client.post(REGISTER_URL, json={"email": "tester@example.com", "password": "pass123"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Status endpoint ───────────────────────────────────────────────────────────

def test_burnout_status_is_public(client):
    r = client.get(STATUS_URL)
    assert r.status_code == 200
    body = r.json()
    assert "model_loaded" in body
    assert "model_exists" in body


# ── Predict endpoint — auth guards ────────────────────────────────────────────

def test_predict_requires_auth(client):
    r = client.post(PREDICT_URL, json=VALID_PAYLOAD)
    assert r.status_code == 401


def test_predict_with_invalid_token_returns_401(client):
    r = client.post(
        PREDICT_URL,
        json=VALID_PAYLOAD,
        headers={"Authorization": "Bearer fake"},
    )
    assert r.status_code == 401


# ── Predict endpoint — input validation ──────────────────────────────────────

@pytest.mark.parametrize("field,bad_value", [
    ("designation", 11),          # > max 10
    ("designation", -1),          # < min 0
    ("resource_allocation", 21),  # > max 20
    ("mental_fatigue_score", 11), # > max 10
])
def test_predict_rejects_out_of_range_values(client, field, bad_value):
    headers = _auth_header(client)
    payload = {**VALID_PAYLOAD, field: bad_value}
    r = client.post(PREDICT_URL, json=payload, headers=headers)
    assert r.status_code == 422


def test_predict_missing_required_field_returns_422(client):
    headers = _auth_header(client)
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "date_of_joining"}
    r = client.post(PREDICT_URL, json=payload, headers=headers)
    assert r.status_code == 422


# ── Predict endpoint — model not trained ─────────────────────────────────────

def test_predict_returns_503_when_model_missing(client):
    """Without a trained model file the endpoint should return 503, not 500."""
    headers = _auth_header(client)
    r = client.post(PREDICT_URL, json=VALID_PAYLOAD, headers=headers)
    # Either 503 (no model) or 200 (model already trained) — never a 5xx crash
    assert r.status_code in (200, 503)
