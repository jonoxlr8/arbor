"""Default-off deployment must not need either unapplied migration."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.auth import get_current_user_id
from app.config import live_portfolio_enabled
from app.routes import account, chat, profiles, contributions, live_portfolio
from app.services.entitlements import resolve_entitlements
from test_live_portfolio import saved


@pytest.mark.parametrize("setting", [None, "", "false", "FALSE", "1", "TRUE", "yes", "true"])
def test_only_explicit_server_enablement(monkeypatch, setting):
    monkeypatch.delenv("LIVE_PORTFOLIO_ENABLED", raising=False)
    if setting is not None:
        monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", setting)
    assert live_portfolio_enabled() is (setting == "true")


@pytest.fixture
def disabled(monkeypatch):
    monkeypatch.delenv("LIVE_PORTFOLIO_ENABLED", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    def forbidden(*args, **kwargs):
        pytest.fail("Disabled feature accessed portfolio storage/cache/history or quota storage")
    monkeypatch.setattr(live_portfolio, "PortfolioStore", forbidden)
    from app.services import ask_usage
    monkeypatch.setattr(ask_usage, "get_authenticated_client", forbidden)
    for module in (profiles, chat):
        monkeypatch.setattr(module, "get_my_profile", lambda **_: saved())
        monkeypatch.setattr(module, "get_entitlements", lambda _: resolve_entitlements("plus", "trial"))
    monkeypatch.setattr(account, "get_entitlements", lambda _: resolve_entitlements("plus", "trial"))
    app = FastAPI()
    for module in (account, profiles, chat, contributions, live_portfolio):
        app.include_router(module.router)
    app.dependency_overrides[get_current_user_id] = lambda: "owner"
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("method,path", [
    ("GET", ""), ("POST", "/holdings"),
    ("PUT", "/holdings/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/holdings/00000000-0000-0000-0000-000000000001"),
    ("POST", "/snapshot"), ("POST", "/scenarios/plan"), ("POST", "/scenarios/recommendation"),
])
def test_every_endpoint_fails_before_storage_even_with_client_override(disabled, method, path):
    response = disabled.request(method, "/v2/portfolio" + path + "?LIVE_PORTFOLIO_ENABLED=true&tier=plus",
        headers={"X-Live-Portfolio-Enabled": "true"}, json={"live_portfolio_enabled": True})
    assert response.status_code == 404
    assert response.json() == {"detail": "Live Portfolio is not currently available."}


def test_optional_loader_never_touches_storage(disabled):
    assert live_portfolio.optional_portfolio("owner", "fixture", saved()) is None


def test_beta_entitlement_is_separate_and_no_quota_table(disabled):
    response = disabled.get("/account/entitlements")
    assert response.status_code == 200
    body = response.json()
    assert (body["tier"], body["status"]) == ("plus", "trial")
    assert "live_portfolio" in body["features"]
    assert body["availability"] == {"live_portfolio": False}
    assert body["ask_usage"] is None


@pytest.mark.parametrize("question", ["What is my current portfolio worth?", "What should I do next?", "How does the contribution planner work?", "Explain my plan", "Where do I add holdings?"])
def test_chat_works_without_tables(disabled, question):
    response = disabled.post("/chat", json={"message": question})
    assert response.status_code == 200
    body = response.json()
    if body["intent"] == "actual_holdings":
        assert "not currently available" in body["reply"]
    assert "Add holding" not in body["reply"]


def test_next_action_uses_pre_portfolio_priority(disabled):
    response = disabled.get("/v2/next-action")
    assert response.status_code == 200
    assert response.json()["key"] == "review_monthly_contribution"


@pytest.mark.parametrize("mode", ["plan", "recommendation"])
def test_manual_contribution_remains_available(disabled, mode):
    from test_contribution_api import payload
    response = disabled.post("/contributions/" + mode, json=payload())
    assert response.status_code == 200
    assert response.json()["contribution_amount"] == "12000"


def test_enabled_availability_does_not_query_storage_or_grant_free_access(disabled, monkeypatch):
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    monkeypatch.setenv("MARKETSTACK_API_KEY", "synthetic")
    monkeypatch.setenv("COINRANKING_API_KEY", "synthetic")
    monkeypatch.setenv("MARKETSTACK_DISPLAY_RIGHTS_CONFIRMED", "true")
    assert disabled.get("/account/entitlements").json()["availability"] == {"live_portfolio": True}
    from app.services import entitlements
    monkeypatch.setattr(entitlements, "get_entitlements", lambda _: resolve_entitlements("free", "active"))
    assert disabled.get("/v2/portfolio").status_code == 403


@pytest.mark.parametrize("environment", [{"APP_ENV": "production"}, {"RENDER": "true"}, {"VERCEL": "1"}])
def test_e2e_fixture_refuses_production(environment):
    import os
    import subprocess
    result = subprocess.run([".venv/bin/python", "-c", "import runpy; runpy.run_path('tests/e2e_portfolio_app.py')"],
        env={**os.environ, "APP_ENV": "test", "ARBOR_PORTFOLIO_E2E": "true",
             "ARBOR_E2E_USER_ID": "synthetic-owner", "LIVE_PORTFOLIO_ENABLED": "true", **environment},
        capture_output=True, text=True, timeout=10)
    assert result.returncode != 0
    assert "Portfolio fixture server requires explicit local test configuration" in result.stderr
