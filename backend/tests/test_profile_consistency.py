from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routes import profiles
from app.auth import get_current_user_id
from app.services import investment_plan_service

BASE = dict(full_name="Example", country="Philippines", goal_target=100000,
            investment_horizon=15, monthly_investment=1000, current_portfolio_value=0,
            risk_tolerance="Balanced", currency="PHP")


def setup(monkeypatch, saved):
    row = dict(saved)
    writes = []
    class Query:
        def table(self, name):
            assert name == "profiles"
            return self
        def select(self, _columns):
            return self
        def eq(self, column, value):
            assert (column, value) == ("user_id", "example-user")
            return self
        def limit(self, _count):
            return self
        def update(self, data):
            writes.append(data)
            row.update(data)
            return self
        def execute(self):
            return SimpleNamespace(data=[dict(row)])
    monkeypatch.setattr(profiles, "get_authenticated_client", lambda token: Query())
    monkeypatch.setattr(profiles, "PortfolioInsights", lambda plan: SimpleNamespace(generate=lambda: []))
    monkeypatch.setattr(investment_plan_service, "get_portfolio_recommendation",
                        lambda risk: [{"ticker": risk, "asset_name": risk, "allocation": 100}])
    app = FastAPI()
    app.include_router(profiles.router)
    app.dependency_overrides[get_current_user_id] = lambda: "example-user"
    return TestClient(app), row, writes


def test_legacy_growth_loads_without_migration_and_can_be_corrected(monkeypatch):
    client, row, writes = setup(monkeypatch, {**BASE, "risk_tolerance": "Growth", "risk_level": "Conservative"})
    headers = {"Authorization": "Bearer test"}
    response = client.get("/profiles/me", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["risk_tolerance"] == "Growth"
    assert body["profile"]["risk_level"] == "Conservative"
    assert "Growth" in body["profile_warning"]
    assert not writes
    assert row["risk_tolerance"] == "Growth"
    assert client.put("/profiles/me", headers=headers, json={**BASE, "risk_tolerance": "Growth"}).status_code == 422
    updated = client.put("/profiles/me", headers=headers, json={**BASE, "risk_tolerance": "Aggressive"})
    assert updated.status_code == 200
    assert row["risk_tolerance"] == row["risk_level"] == "Aggressive"
    assert updated.json()["portfolio"][0]["ticker"] == "Aggressive"


def test_put_and_subsequent_get_use_same_updated_baseline(monkeypatch):
    client, row, writes = setup(monkeypatch, BASE)
    headers = {"Authorization": "Bearer test"}
    updated = {**BASE, "monthly_investment": 2000, "current_portfolio_value": 5000,
               "goal_target": 200000, "investment_horizon": 20}
    put = client.put("/profiles/me", headers=headers, json=updated).json()
    get = client.get("/profiles/me", headers=headers).json()
    for field in [*BASE, "risk_score", "risk_level"]:
        assert put["profile"][field] == get["profile"][field]
    for field in ["portfolio", "projection", "health", "explanation"]:
        assert put[field] == get[field]
    assert put["projection"]["monthly_contribution"] == 2000
    assert put["projection"]["starting_value"] == 5000
    assert put["projection"]["investment_period_years"] == 20
    assert len(writes) == 1


def test_legacy_growth_without_stored_classification_explains_historical_fallback(monkeypatch):
    client, row, writes = setup(monkeypatch, {**BASE, "risk_tolerance": "Growth"})
    response = client.get("/profiles/me", headers={"Authorization": "Bearer test"})
    assert response.status_code == 200
    assert response.json()["profile"]["risk_tolerance"] == "Growth"
    assert "Conservative" in response.json()["profile_warning"]
    assert row["risk_tolerance"] == "Growth"
    assert not writes
