from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.routes import profiles
from app.schemas.profile import ProfileCreate

BASE = dict(full_name="Beta user", country="Philippines", currency="PHP", risk_tolerance="Balanced", goal_target=10000, investment_horizon=10, monthly_investment=100, current_portfolio_value=0)


def setup(monkeypatch, existing=None, failure=None):
    state = {"saved": existing, "inserts": 0, "reads": 0}
    def canonical(**kwargs):
        assert kwargs["user_id"] == "owner"
        state["reads"] += 1
        if failure == "read" and state["reads"] > 1:
            raise RuntimeError("private database detail")
        if state["saved"] is None:
            raise HTTPException(404, "Profile not found")
        return {"profile": state["saved"], "portfolio": [{"ticker": "VOO", "allocation": 100}]}
    class Client:
        def table(self, name):
            assert name == "profiles"
            return self
        def insert(self, data):
            assert data["user_id"] == "owner"
            state["inserts"] += 1
            if failure == "before":
                raise RuntimeError("private database detail")
            if failure == "concurrent":
                state["saved"] = {**BASE, "goal_target": 4321}
                raise RuntimeError("unique violation")
            state["saved"] = data
            return self
        def execute(self):
            if failure == "lost":
                raise RuntimeError("lost response")
            return SimpleNamespace(data=[state["saved"]])
    monkeypatch.setattr(profiles, "get_my_profile", canonical)
    monkeypatch.setattr(profiles, "get_authenticated_client", lambda _: Client())
    monkeypatch.setattr(profiles, "build_investment_plan", lambda p: SimpleNamespace(profile_data=p.model_dump()))
    return state


def create(**changes):
    return profiles.create_profile(ProfileCreate(**{**BASE, **changes}), user_id="owner", authorization="Bearer test")


def test_normal_creation_returns_canonical_saved_profile(monkeypatch):
    state = setup(monkeypatch)
    assert create()["profile"] == state["saved"]
    assert state["inserts"] == 1 and state["reads"] == 2


@pytest.mark.parametrize("changes", [{}, {"goal_target": 90000}])
def test_existing_retry_does_not_insert_or_overwrite(monkeypatch, changes):
    state = setup(monkeypatch, dict(BASE))
    result = create(**changes)
    assert result["profile"] == BASE
    assert "not applied" in result["profile_warning"]
    assert state["inserts"] == 0


def test_lost_response_then_retry_returns_same_saved_profile(monkeypatch):
    state = setup(monkeypatch, failure="lost")
    first = create()
    retry = create()
    assert first["profile"] == retry["profile"]
    assert state["inserts"] == 1


def test_concurrent_unique_conflict_recovers_without_overwriting(monkeypatch):
    state = setup(monkeypatch, failure="concurrent")
    assert create()["profile"]["goal_target"] == 4321
    assert state["inserts"] == 1


@pytest.mark.parametrize("failure", ["before", "read"])
def test_unestablished_recovery_is_sanitized_failure(monkeypatch, failure):
    setup(monkeypatch, failure=failure)
    with pytest.raises(HTTPException) as caught:
        create()
    assert caught.value.status_code == 503
    assert "private" not in caught.value.detail


def test_http_creation_and_conflicting_retry_use_real_canonical_plan_path(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth import get_current_user_id
    from app.services import investment_plan_service
    rows = []
    class Query:
        def table(self, name):
            assert name == "profiles"
            return self
        def select(self, _columns):
            return self
        def eq(self, column, value):
            assert (column, value) == ("user_id", "owner")
            return self
        def limit(self, _count):
            return self
        def insert(self, data):
            assert data["user_id"] == "owner"
            rows.append(dict(data))
            return self
        def execute(self):
            return SimpleNamespace(data=list(rows))
    monkeypatch.setattr(profiles, "get_authenticated_client", lambda _: Query())
    monkeypatch.setattr(investment_plan_service, "get_portfolio_recommendation", lambda _: [{"ticker": "VOO", "asset_name": "Vanguard", "allocation": 100, "asset_type": "ETF"}])
    app = FastAPI()
    app.include_router(profiles.router)
    app.dependency_overrides[get_current_user_id] = lambda: "owner"
    client = TestClient(app)
    headers = {"Authorization": "Bearer test"}
    first = client.post("/profiles", headers=headers, json=BASE)
    assert first.status_code == 200
    retry = client.post("/profiles", headers=headers, json={**BASE, "goal_target": 90000})
    assert retry.status_code == 200
    saved = client.get("/profiles/me", headers=headers).json()
    for field in ("profile", "projection", "portfolio", "health", "explanation"):
        assert first.json()[field] == retry.json()[field] == saved[field]
    assert "not applied" in retry.json()["profile_warning"]
    assert len(rows) == 1
