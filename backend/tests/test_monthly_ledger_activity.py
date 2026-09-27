"""Monthly activity is a dated, owner-scoped view of existing ledger entries."""
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.routes import live_portfolio as routes
from app.services import entitlements, portfolio_store


class Query:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return method

    def execute(self):
        return SimpleNamespace(data=[])


def test_month_filter_uses_owner_and_exact_date_bounds_without_new_write(monkeypatch):
    query = Query()
    monkeypatch.setattr(portfolio_store, "get_authenticated_client", lambda _: SimpleNamespace(table=lambda name: query))
    store = portfolio_store.PortfolioStore("owner-A", "Bearer local-fixture")
    assert store.activity(month="2026-12") == []
    assert ("eq", ("user_id", "owner-A"), {}) in query.calls
    assert ("gte", ("investment_date", "2026-12-01"), {}) in query.calls
    assert ("lte", ("investment_date", "2026-12-31"), {}) in query.calls
    assert ("order", ("investment_date",), {"desc": True}) in query.calls
    assert ("range", (0, 19), {}) in query.calls
    assert not any(name in ("insert", "update", "delete", "rpc") for name, _, _ in query.calls)


def test_recent_activity_uses_record_change_time_even_for_backdated_entry(monkeypatch):
    query = Query()
    monkeypatch.setattr(portfolio_store, "get_authenticated_client", lambda _: SimpleNamespace(table=lambda name: query))
    portfolio_store.PortfolioStore("owner-A", "Bearer local-fixture").activity(page=1, recent=True)
    assert ("order", ("updated_at",), {"desc": True}) in query.calls
    assert ("order", ("investment_date",), {"desc": True}) not in query.calls
    assert ("range", (20, 39), {}) in query.calls


def test_activity_endpoint_validates_month_and_keeps_owner_from_auth(monkeypatch):
    received = []
    monkeypatch.setattr(routes, "live_portfolio_enabled", lambda: True)
    monkeypatch.setattr(entitlements, "get_entitlements", lambda _: entitlements.resolve_entitlements("free", "active"))

    class Store:
        def __init__(self, owner, authorization):
            received.append((owner, authorization))

        def activity(self, holding_id, page, month, recent):
            received.append((holding_id, page, month, recent))
            return []

    monkeypatch.setattr(routes, "PortfolioStore", Store)
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_current_user_id] = lambda: "owner-A"
    with TestClient(app) as client:
        result = client.get("/v2/portfolio/entries?month=2026-09&recent=true&user_id=owner-B", headers={"Authorization": "Bearer local-fixture"})
        assert result.status_code == 200
        assert result.json() == {"entries": [], "page": 0, "has_more": False}
        assert client.get("/v2/portfolio/entries?month=2026-13", headers={"Authorization": "Bearer local-fixture"}).status_code == 422
    assert received == [("owner-A", "Bearer local-fixture"), (None, 0, "2026-09", True)]
