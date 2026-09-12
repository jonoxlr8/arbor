from types import SimpleNamespace
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric import ec
import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import auth
from app.routes import profiles


def client():
    app = FastAPI()
    app.include_router(profiles.router)
    return TestClient(app)


@pytest.mark.parametrize("header", [None, "Basic invalid", "Bearer invalid"])
def test_invalid_auth_returns_401(monkeypatch, header):
    def reject(_token):
        raise jwt.InvalidTokenError("invalid")
    monkeypatch.setattr(auth.jwks_client, "get_signing_key_from_jwt", reject)
    response = client().get("/profiles/me", headers={"Authorization": header} if header else {})
    assert response.status_code == 401


def test_profile_lookup_is_scoped_and_empty_contract(monkeypatch):
    seen = []
    class Query:
        def table(self, name):
            assert name == "profiles"
            return self
        def select(self, columns):
            return self
        def eq(self, column, value):
            seen.append((column, value))
            return self
        def limit(self, count):
            assert count == 1
            return self
        def execute(self):
            return SimpleNamespace(data=[])
    monkeypatch.setattr(profiles, "get_authenticated_client", lambda token: Query())
    app = FastAPI()
    app.include_router(profiles.router)
    app.dependency_overrides[auth.get_current_user_id] = lambda: "authenticated-user"
    response = TestClient(app).get("/profiles/me", headers={"Authorization": "Bearer test"})
    assert seen == [("user_id", "authenticated-user")]
    assert response.status_code == 404
    assert response.json() == {"detail": "Profile not found"}


def test_saved_profile_is_used_to_rebuild_dashboard(monkeypatch):
    saved = {
        "full_name": "Returning user", "country": "Philippines",
        "goal_target": 100000, "investment_horizon": 10,
        "monthly_investment": 1000, "current_portfolio_value": 5000,
        "risk_tolerance": "Balanced", "currency": "PHP",
    }
    filters = []
    class Query:
        def table(self, name):
            assert name == "profiles"
            return self
        def select(self, columns):
            return self
        def eq(self, column, value):
            filters.append((column, value))
            return self
        def limit(self, count):
            return self
        def execute(self):
            return SimpleNamespace(data=[saved])
    def build(profile):
        assert profile.full_name == saved["full_name"]
        return SimpleNamespace(profile_data=profile.model_dump(), portfolio=[],
                               explanation={}, projection={}, health={})
    monkeypatch.setattr(profiles, "get_authenticated_client", lambda token: Query())
    monkeypatch.setattr(profiles, "build_investment_plan", build)
    monkeypatch.setattr(profiles, "PortfolioInsights", lambda plan: SimpleNamespace(generate=lambda: []))
    app = FastAPI()
    app.include_router(profiles.router)
    app.dependency_overrides[auth.get_current_user_id] = lambda: "returning-user"
    response = TestClient(app).get("/profiles/me", headers={"Authorization": "Bearer test"})
    assert response.status_code == 200
    assert response.json()["profile"]["full_name"] == "Returning user"
    assert filters == [("user_id", "returning-user")]


@pytest.fixture
def signed_token(monkeypatch):
    # Freeze verifier time and sign locally: no live account, keys, or JWT logging.
    fixed = datetime(2026, 1, 1, tzinfo=timezone.utc)
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed
    monkeypatch.setattr(jwt.api_jwt, "datetime", FrozenDateTime)
    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth.jwks_client, "get_signing_key_from_jwt",
                        lambda token: SimpleNamespace(key=key.public_key()))
    now = int(fixed.timestamp())
    def make(**claims):
        return jwt.encode({"sub": "returning-user", "iat": now, "exp": now + 3600, **claims},
                          key, algorithm="ES256")
    return make, now


def test_new_token_accepts_small_issuer_clock_difference(signed_token):
    make, now = signed_token
    token = make(iat=now + 3)
    with pytest.raises(jwt.ImmatureSignatureError):
        jwt.decode(token, auth.jwks_client.get_signing_key_from_jwt(token).key,
                   algorithms=["ES256"], options={"verify_aud": False})
    assert auth.get_current_user_id(f"Bearer {token}") == "returning-user"


@pytest.mark.parametrize("claims", [{"iat": 10}, {"nbf": 10}, {"exp": -10}])
def test_tokens_outside_clock_tolerance_remain_rejected(signed_token, claims):
    make, now = signed_token
    token = make(**{field: now + offset for field, offset in claims.items()})
    with pytest.raises(profiles.HTTPException) as error:
        auth.get_current_user_id(f"Bearer {token}")
    assert error.value.status_code == 401


def test_invalid_signature_remains_rejected(signed_token, caplog):
    _, now = signed_token
    other_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode({"sub": "other", "iat": now, "exp": now + 3600},
                       other_key, algorithm="ES256")
    with pytest.raises(profiles.HTTPException) as error:
        auth.get_current_user_id(f"Bearer {token}")
    assert error.value.status_code == 401
    assert "InvalidSignatureError" in caplog.text
    assert token not in caplog.text
