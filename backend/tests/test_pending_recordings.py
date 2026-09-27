"""Pending resume tasks do not create investments or expose Plus planning."""
from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.routes import pending_recordings as routes
from app.services import pending_recordings as service

OWNER = "00000000-0000-4000-8000-000000000001"
ITEM = "00000000-0000-4000-8000-000000000002"


def client():
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_current_user_id] = lambda: OWNER
    return TestClient(app)


def test_start_requires_explicit_request_and_monthly_eligibility(monkeypatch):
    calls = []
    monkeypatch.setattr(routes, "get_my_profile", lambda **_: {"profile": "fixture"})
    monkeypatch.setattr(routes, "get_entitlements", lambda _: SimpleNamespace(features=("monthly_contribution_planner",)))
    monkeypatch.setattr(routes.monthly, "enabled", lambda: True)
    monkeypatch.setattr(routes.monthly, "eligible", lambda *args: True)

    class Store:
        def __init__(self, owner, authorization):
            calls.append((owner, authorization))

        def start(self, product, provider):
            calls.append((product, provider))
            return {"id": ITEM, "product_id": product, "provider": provider, "status": "pending"}

    monkeypatch.setattr(routes, "PendingRecordingStore", Store)
    with client() as app:
        assert calls == []  # viewing a plan/check-in cannot start anything
        assert app.post("/v2/pending-recordings", json={"product_id": "gotrade_vt", "provider": "gotrade", "user_id": "other"}).status_code == 422
        response = app.post("/v2/pending-recordings", json={"product_id": "gotrade_vt", "provider": "gotrade"}, headers={"Authorization": "Bearer fixture"})
        assert response.status_code == 201
        assert calls == [(OWNER, "Bearer fixture"), ("gotrade_vt", "gotrade")]
        assert app.post("/v2/pending-recordings", json={"product_id": "gotrade_vt", "provider": "pdax"}).status_code == 422
        monkeypatch.setattr(routes.monthly, "eligible", lambda *args: False)
        assert app.post("/v2/pending-recordings", json={"product_id": "gotrade_vt", "provider": "gotrade"}).status_code == 403


def test_read_and_resolution_remain_available_after_monthly_downgrade(monkeypatch):
    calls = []

    class Store:
        def __init__(self, owner, authorization):
            calls.append(owner)

        def list_pending(self):
            return []

        def resolve(self, item_id, resolution):
            calls.append((item_id, resolution))
            return {"id": str(item_id), "status": resolution}

    monkeypatch.setattr(routes, "PendingRecordingStore", Store)
    with client() as app:
        assert app.get("/v2/pending-recordings").json() == {"items": []}
        result = app.post(f"/v2/pending-recordings/{ITEM}/resolve", json={"resolution": "dismissed"})
        assert result.status_code == 200
        assert result.json()["status"] == "dismissed"
        assert app.post(f"/v2/pending-recordings/{ITEM}/resolve", json={"resolution": "pending"}).status_code == 422
    assert calls == [OWNER, OWNER, (UUID(ITEM), "dismissed")]


def test_store_uses_verified_owner_and_does_not_write_financial_tables(monkeypatch):
    seen = []

    class Query:
        def __getattr__(self, method):
            def call(*args, **kwargs):
                seen.append((method, args, kwargs))
                return self
            return call

        def execute(self):
            return SimpleNamespace(data=[])

    query = Query()
    monkeypatch.setattr(service, "get_authenticated_client", lambda _: SimpleNamespace(table=lambda name: seen.append(("table", name)) or query))
    service.PendingRecordingStore(OWNER, "Bearer fixture").list_pending()
    assert ("eq", ("user_id", OWNER), {}) in seen
    assert ("table", "arbor_pending_investment_recordings") in seen
    assert not any(item[0] in ("insert", "update", "delete") for item in seen)
