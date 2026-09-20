from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.routes import profiles, chat, holdings
from app.services import investment_plan_service

BASE = dict(strategy_engine_version="2.0", full_name="New user", country="Philippines", currency="PHP",
            emergency_savings="three_to_six_months", high_interest_debt="none", goal_target=None,
            current_portfolio_value=0, monthly_investment=0, horizon="ten_plus_years", risk_response="hold")
LEGACY = dict(full_name="Existing user", country="Philippines", currency="PHP", goal_target=100000,
              current_portfolio_value=100, monthly_investment=20, investment_horizon=10, risk_tolerance="Balanced")
HEADERS = {"Authorization": "Bearer test"}


def test_preferences_persist_requests_and_restore_effective_target(harness):
    client, state = harness
    payload = {**BASE, "horizon": "three_to_five_years", "risk_response": "invest_more",
               "saved_preferences": {"technology_tilt": 10, "bitcoin": 10}}
    response = client.post("/v2/profiles", json=payload, headers=HEADERS)
    assert response.status_code == 200
    result = response.json()
    assert result == client.get("/profiles/me", headers=HEADERS).json()
    assert state["rows"]["A"]["v2_inputs"]["saved_preferences"] == payload["saved_preferences"]
    assert result["profile"]["saved_preferences"] == payload["saved_preferences"]
    target = result["plan"]["preference_result"]["effective_target"]
    assert target["base_strategy"] == "Balanced"
    assert {w["role"]: w["percentage_points"] for w in target["allocation"]["weights"]} == {
        "global_equity": 50, "defensive": 40, "technology_tilt": 5, "crypto": 5,
    }
    assert isinstance(result["plan"]["planning_return_pct"], float)
    assert all(type(w["percentage_points"]) is int for w in target["allocation"]["weights"])
    retry = client.post("/v2/profiles", json={**payload, "saved_preferences": {"technology_tilt": 0, "bitcoin": 0}}, headers=HEADERS)
    assert retry.json()["profile"]["saved_preferences"] == payload["saved_preferences"]


def test_existing_3oe_json_without_preferences_still_restores(harness):
    client, state = harness
    client.post("/v2/profiles", json=BASE, headers=HEADERS)
    assert "saved_preferences" not in state["rows"]["A"]["v2_inputs"]
    response = client.get("/profiles/me", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["profile"]["saved_preferences"] == {"technology_tilt": 0, "bitcoin": 0}
    assert "saved_preferences" not in state["rows"]["A"]["v2_inputs"]  # Read does not migrate.


@pytest.mark.parametrize("preferences", [None, {"bitcoin": True}, {"bitcoin": 101}, {"technology_tilt": -1}, {"unknown": 5}])
def test_bad_preferences_rejected_on_write_and_restore(harness, preferences):
    client, state = harness
    assert client.post("/v2/profiles", json={**BASE, "saved_preferences": preferences}, headers=HEADERS).status_code == 422
    client.post("/v2/profiles", json=BASE, headers=HEADERS)
    state["rows"]["A"]["v2_inputs"]["saved_preferences"] = preferences
    assert client.get("/profiles/me", headers=HEADERS).status_code == 503


def test_short_term_preferences_persist_without_a_long_term_target(harness):
    client, _ = harness
    payload = {**BASE, "horizon": "less_than_3_years", "saved_preferences": {"technology_tilt": 10, "bitcoin": 10}}
    created = client.post("/v2/profiles", json=payload, headers=HEADERS).json()
    assert created == client.get("/profiles/me", headers=HEADERS).json()
    assert created["plan"]["preference_result"]["effective_target"] is None
    assert created["plan"]["planning_return_pct"] is None
    assert created["profile"]["saved_preferences"] == payload["saved_preferences"]


@pytest.fixture
def harness(monkeypatch):
    state = {"rows": {}, "user": "A", "inserts": 0, "failure": None, "tables": []}
    class Query:
        def __init__(self):
            self.owner = None
            self.payload = None
            self.operation = "read"
        def table(self, name):
            state["tables"].append(name)
            assert name == "profiles"
            return self
        def select(self, _columns): return self
        def eq(self, column, value):
            assert column == "user_id"
            assert value == state["user"]
            self.owner = value
            return self
        def limit(self, _count): return self
        def insert(self, payload):
            assert payload["user_id"] == state["user"]
            self.owner = payload["user_id"]
            self.payload = payload
            self.operation = "insert"
            return self
        def update(self, payload):
            self.payload = payload
            self.operation = "update"
            return self
        def execute(self):
            if self.operation == "insert":
                state["inserts"] += 1
                if state["failure"] == "before": raise RuntimeError("secret database details")
                if state["failure"] == "race":
                    state["rows"][self.owner] = {**LEGACY, "user_id": self.owner}
                    raise RuntimeError("unique conflict")
                if self.owner in state["rows"]: raise RuntimeError("unique conflict")
                state["rows"][self.owner] = deepcopy(self.payload)
                if state["failure"] == "lost": raise RuntimeError("lost reply")
            elif self.operation == "update":
                state["rows"][self.owner].update(self.payload)
            row = state["rows"].get(self.owner)
            return SimpleNamespace(data=[deepcopy(row)] if row else [])
    def client(_token): return Query()
    monkeypatch.setattr(profiles, "get_authenticated_client", client)
    monkeypatch.setattr(holdings, "get_authenticated_client", client)
    monkeypatch.setattr(investment_plan_service, "get_portfolio_recommendation", lambda _: [{"ticker": "VT", "asset_name": "Global", "allocation": 100}])
    app = FastAPI()
    app.include_router(profiles.router)
    app.include_router(chat.router)
    app.include_router(holdings.router)
    app.dependency_overrides[get_current_user_id] = lambda: state["user"]
    return TestClient(app), state


@pytest.mark.parametrize("horizon,risk,strategy", [
    ("ten_plus_years", "sell_all", "Conservative"),
    ("three_to_five_years", "invest_more", "Balanced"),
    ("five_to_ten_years", "continue_investing", "Growth"),
    ("ten_plus_years", "continue_investing", "Aggressive"),
    ("less_than_3_years", "invest_more", None),
])
@pytest.mark.parametrize("savings,debt,state_name", [
    ("three_to_six_months", "none", "ready"),
    ("one_to_two_months", "paying_down", "getting_ready"),
    ("more_than_six_months", "difficult_to_manage", "foundation_first"),
])
def test_create_and_restore_paths_and_readiness(harness, horizon, risk, strategy, savings, debt, state_name):
    client, state = harness
    payload = {**BASE, "horizon": horizon, "risk_response": risk, "emergency_savings": savings, "high_interest_debt": debt}
    response = client.post("/v2/profiles", json=payload, headers=HEADERS)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result == client.get("/profiles/me", headers=HEADERS).json()
    assert result["profile"] == {**payload, "saved_preferences": {"technology_tilt": 0, "bitcoin": 0}}
    assert result["strategy_engine_version"] == state["rows"]["A"]["strategy_engine_version"] == "2.0"
    assert result["plan"]["selected_strategy"] == strategy
    assert result["plan"]["readiness"]["readiness"] == state_name
    assert result["plan"]["readiness"]["actionable_contribution_guidance_allowed"] is (state_name != "foundation_first")
    assert isinstance(result["plan"]["inflation_pct"], (int, float))
    assert state["rows"]["A"]["investment_horizon"] is None
    assert state["rows"]["A"]["risk_tolerance"] is None
    assert not {"selected_strategy", "readiness", "plan", "token"}.intersection(state["rows"]["A"])
    if strategy is None:
        assert result["plan"]["path"] == "short_term"
        assert result["plan"]["base_allocation"] is None
        assert result["plan"]["planning_return_pct"] is None
    else:
        assert isinstance(result["plan"]["planning_return_pct"], (int, float))
        assert sum(item["percentage_points"] for item in result["plan"]["base_allocation"]) == 100
        assert result["plan"]["selection"]["cap_applied"] is (horizon in ["three_to_five_years", "five_to_ten_years"])


def test_optional_goal_and_owner_isolation(harness):
    client, state = harness
    payload = {k: v for k, v in BASE.items() if k != "goal_target"}
    assert client.post("/v2/profiles", json=payload, headers=HEADERS).status_code == 200
    state["user"] = "B"
    assert client.get("/profiles/me", headers=HEADERS).status_code == 404
    response = client.post("/v2/profiles", json={**BASE, "goal_target": 100000, "full_name": "B"}, headers=HEADERS)
    assert response.json()["profile"]["full_name"] == "B"
    assert state["rows"]["A"]["full_name"] == "New user"
    assert state["rows"]["B"]["user_id"] == "B"
    assert client.post("/v2/profiles", json={**BASE, "user_id": "A"}, headers=HEADERS).status_code == 422


@pytest.mark.parametrize("field,value", [
    ("strategy_engine_version", "1.0"), ("country", "Australia"), ("currency", "USD"),
    ("emergency_savings", "unknown"), ("high_interest_debt", "unknown"),
    ("horizon", "unknown"), ("risk_response", "unknown"), ("full_name", "  "),
    ("monthly_investment", -1), ("current_portfolio_value", -1), ("goal_target", 0),
    ("monthly_investment", ""), ("current_portfolio_value", True), ("goal_target", 1e13),
    ("monthly_investment", "Infinity"),
])
def test_validation_precedes_persistence(harness, field, value):
    client, state = harness
    assert client.post("/v2/profiles", json={**BASE, field: value}, headers=HEADERS).status_code == 422
    assert state["inserts"] == 0


@pytest.mark.parametrize("failure", [None, "lost"])
def test_retries_recover_same_row_without_overwrite(harness, failure):
    client, state = harness
    state["failure"] = failure
    first = client.post("/v2/profiles", json=BASE, headers=HEADERS).json()
    retry = client.post("/v2/profiles", json={**BASE, "risk_response": "sell_all"}, headers=HEADERS).json()
    assert retry["profile"] == first["profile"]
    assert state["inserts"] == 1
    assert "not applied" in retry["profile_warning"]


def test_v1_profile_is_restored_not_migrated_and_v1_edit_still_works(harness):
    client, state = harness
    state["rows"]["A"] = deepcopy(LEGACY)
    saved = client.get("/profiles/me", headers=HEADERS).json()
    response = client.post("/v2/profiles", json=BASE, headers=HEADERS).json()
    assert response["profile"] == saved["profile"]
    assert response["projection"]["assumed_return"] == .08
    assert state["rows"]["A"] == LEGACY
    assert state["inserts"] == 0
    assert client.put("/profiles/me", headers=HEADERS, json=LEGACY).status_code == 200


def test_concurrent_v1_creation_wins_without_overwrite(harness):
    client, state = harness
    state["failure"] = "race"
    result = client.post("/v2/profiles", json=BASE, headers=HEADERS)
    assert result.status_code == 200
    assert result.json()["profile"]["full_name"] == LEGACY["full_name"]
    assert "strategy_engine_version" not in state["rows"]["A"]


def test_legacy_writes_and_analytics_do_not_reinterpret_v2(harness):
    client, state = harness
    client.post("/v2/profiles", json=BASE, headers=HEADERS)
    saved = deepcopy(state["rows"])
    assert client.put("/profiles/me", json=LEGACY, headers=HEADERS).status_code == 409
    assert client.post("/profiles", json=LEGACY, headers=HEADERS).json()["strategy_engine_version"] == "2.0"
    assert client.post("/chat", json={"message": "Explain my plan"}, headers=HEADERS).status_code == 409
    health = client.get("/holdings/health", headers=HEADERS).json()
    assert health["available"] is False and health["health"] is None
    assert state["rows"] == saved


def test_unresolved_failure_and_malformed_saved_payload_are_not_missing(harness):
    client, state = harness
    state["failure"] = "before"
    response = client.post("/v2/profiles", json=BASE, headers=HEADERS)
    assert response.status_code == 503
    assert "secret" not in response.text
    state["failure"] = None
    client.post("/v2/profiles", json=BASE, headers=HEADERS)
    state["rows"]["A"]["v2_inputs"]["country"] = "Australia"
    response = client.get("/profiles/me", headers=HEADERS)
    assert response.status_code == 503
    assert "Profile not found" not in response.text


def test_missing_auth_is_rejected():
    app = FastAPI()
    app.include_router(profiles.router)
    assert TestClient(app).post("/v2/profiles", json=BASE).status_code == 401
