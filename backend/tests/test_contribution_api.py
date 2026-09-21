from copy import deepcopy
from decimal import Decimal

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.routes import contributions
from app.schemas.contributions import ContributionProductResponse
from app.services.contributions.engine import recommend_next_contribution
from app.services.contributions.models import ContributionRequest
from app.services.contributions.planner import plan_monthly_contribution
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.strategy_v2 import SavedPreferences

PATHS = ["/contributions/recommendation", "/contributions/plan"]


def payload(route="gcash", amount=12000, values=(58000, 19000, 8000, 3000),
            risk="hold", tech=10, btc=5, debt="none", savings="three_to_six_months",
            horizon="ten_plus_years", owned=(), eligible=None):
    plan = build_portfolio_plan(risk, horizon, savings, debt,
                               SavedPreferences(technology_tilt=tech, bitcoin=btc))
    req = ContributionRequest(contribution_amount=amount, contribution_currency="PHP",
        current_portfolio=dict(currency="PHP", global_equity=values[0], defensive=values[1],
            technology_tilt=values[2], crypto=values[3], owned_product_ids=owned),
        context=dict(route_id=route, effective_target_allocation=plan.preference_result.effective_target,
            readiness=plan.readiness, path=plan.path, ibkr_crypto_eligible=eligible),
        readiness_inputs=dict(emergency_savings=savings, high_interest_debt=debt))
    return req.model_dump(mode="json")


@pytest.fixture
def client(monkeypatch):
    from app import database
    def no_database(*args, **kwargs):
        raise AssertionError("Contribution endpoints must not access the database")
    monkeypatch.setattr(database, "get_authenticated_client", no_database)
    app = FastAPI()
    app.include_router(contributions.router)
    app.dependency_overrides[get_current_user_id] = lambda: "00000000-0000-4000-8000-000000000001"
    with TestClient(app) as value:
        yield value


def public_domain(value):
    if isinstance(value, dict):
        if "product_id" in value:
            return {key: public_domain(item) for key, item in value.items()
                    if key in ContributionProductResponse.model_fields}
        return {key: public_domain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [public_domain(item) for item in value]
    return value


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("route", ["gcash", "dragonfi", "gotrade", "ibkr"])
@pytest.mark.parametrize("scenario", ["multi", "empty", "foundation", "short", "below", "zero", "additional", "getting_ready", "single"])
def test_endpoint_domain_parity_and_accounting(client, path, route, scenario):
    kwargs = dict(route=route)
    if scenario == "empty": kwargs["values"] = (0, 0, 0, 0)
    if scenario == "foundation": kwargs["debt"] = "difficult_to_manage"
    if scenario == "short": kwargs["horizon"] = "less_than_3_years"
    if scenario == "below": kwargs.update(amount=1, risk="sell_all", tech=0, btc=0, values=(0, 0, 0, 0))
    if scenario == "zero": kwargs["amount"] = 0
    if scenario == "additional": kwargs["owned"] = ("dragonfi_global_equity", "gcash_global_equity")
    if scenario == "getting_ready": kwargs["savings"] = "one_to_two_months"
    if scenario == "single": kwargs.update(values=(50000, 20000, 10000, 5000), amount=15000)
    body = payload(**kwargs)
    req = ContributionRequest.model_validate(body)
    direct = recommend_next_contribution(req) if path.endswith("recommendation") else plan_monthly_contribution(req)
    response = client.post(path, json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result == public_domain(direct.model_dump(mode="json"))
    assert isinstance(result["contribution_amount"], str)
    assert "affiliate" not in response.text and "partnership" not in response.text
    assert "compensation" not in response.text
    if path.endswith("plan"):
        assert Decimal(result["contribution_amount"]) == sum(Decimal(result[key]) for key in (
            "invested_amount", "verify_minimum_amount", "unallocated_amount", "reserve_amount"))
    if scenario == "foundation":
        if path.endswith("plan"):
            assert result["allocations"] == [] and result["reserve_amount"] == "12000"
        else:
            assert result["selected"] is None and result["action"] == "reserve"
    if scenario == "short":
        assert result["state"] == "not_applicable"


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("eligible,product", [(True, "ibkr_btc"), (False, "coins_btc"), (None, "coins_btc")])
def test_ibkr_crypto_eligibility(client, path, eligible, product):
    response = client.post(path, json=payload(route="ibkr", amount=1000,
        values=(65000, 20000, 10000, 4000), eligible=eligible))
    assert response.status_code == 200
    data = response.json()
    mapped = data["selected"] if path.endswith("recommendation") else data["allocations"][0]["implementation"]
    assert mapped["product"]["product_id"] == product
    assert mapped["crypto_fallback"]["secondary_product_ids"] == ["pdax_btc"]


def test_partial_minimum_and_exact_decimals(client):
    result = client.post(PATHS[1], json=payload(risk="sell_all", tech=0, btc=0,
        amount=1200, values=(3300, 5500, 0, 0))).json()
    assert result["status"] == "partial"
    assert result["invested_amount"] == "500" and result["unallocated_amount"] == "700"
    assert result["blocked_allocations"][0]["minimum"]["amount_needed_to_minimum"] == "300"
    body = payload(amount="12345.67890123456789", values=(0, 0, 0, 0), route="dragonfi")
    result = client.post(PATHS[1], json=body).json()
    assert result["contribution_amount"] == "12345.67890123456789"
    assert result["allocations"][0]["allocated_amount"] == "8024.6912858024691285"


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("route,amount,status", [
    ("gotrade", "99.99", "below_minimum"),
    ("gotrade", "100", "ready"),
    ("gotrade", "100.01", "ready"),
    ("gotrade", "5000", "ready"),
    ("ibkr", "5000", "verify_minimum"),
])
def test_gotrade_practical_minimum_and_ibkr_uncertainty(client, path, route, amount, status):
    response = client.post(path, json=payload(route=route, risk="continue_investing",
        tech=0, btc=0, values=(0, 0, 0, 0), amount=amount))
    assert response.status_code == 200
    result = response.json()
    if path.endswith("recommendation"):
        assert result["execution_status"] == status
        assert result["action"] == ("invest" if status == "ready" else "wait")
        assert result["recommended_amount"] == (amount if status == "ready" else "0")
        minimum = result["minimum"]
    else:
        assert result["invested_amount"] == (amount if status == "ready" else "0")
        assert result["verify_minimum_amount"] == (amount if status == "verify_minimum" else "0")
        assert Decimal(result["unallocated_amount"]) == (Decimal(amount) if status == "below_minimum" else 0)
        assert result["status"] == ("invest" if status == "ready" else "wait")
        minimum = (result["allocations"] or result["blocked_allocations"])[0]["minimum"]
    assert minimum["status"] == status
    if route == "gotrade":
        assert minimum["applicable_minimum"] == "100" and minimum["minimum_currency"] == "PHP"
        assert Decimal(minimum["amount_needed_to_minimum"]) == max(0, 100 - Decimal(amount))


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("change", ["negative", "nan", "target_total", "negative_target", "negative_holding",
    "route", "readiness", "unknown_sleeve", "missing_sleeve", "currency", "mixed_currency", "ownership", "owner_id"])
def test_invalid_inputs_are_422(client, path, change):
    body = payload()
    if change == "negative": body["contribution_amount"] = -1
    if change == "nan": body["contribution_amount"] = "NaN"
    if change == "target_total": body["context"]["effective_target_allocation"]["allocation"]["weights"][0]["percentage_points"] = 64
    if change == "negative_target": body["context"]["effective_target_allocation"]["allocation"]["weights"][0]["percentage_points"] = -1
    if change == "negative_holding": body["current_portfolio"]["global_equity"] = -1
    if change == "route": body["context"]["route_id"] = "best"
    if change == "readiness": body["context"]["readiness"]["readiness"] = "unknown"
    if change == "unknown_sleeve": body["current_portfolio"]["gold"] = 100
    if change == "missing_sleeve": body["current_portfolio"].pop("crypto")
    if change == "currency": body["contribution_currency"] = "XYZ"
    if change == "mixed_currency": body["current_portfolio"]["currency"] = "USD"
    if change == "ownership": body["current_portfolio"]["owned_product_ids"] = ["unknown"]
    if change == "owner_id": body["user_id"] = "another-user"
    before = deepcopy(body)
    assert client.post(path, json=body).status_code == 422
    assert body == before


@pytest.mark.parametrize("path,function", [(PATHS[0], "recommend_next_contribution"), (PATHS[1], "plan_monthly_contribution")])
def test_domain_error_is_sanitized(client, monkeypatch, path, function):
    def invalid(*args):
        raise ValueError("Private internal failure details")
    monkeypatch.setattr(contributions, function, invalid)
    response = client.post(path, json=payload())
    assert response.status_code == 400
    assert "Private" not in response.text


@pytest.mark.parametrize("path", PATHS)
def test_auth_required_without_profile_loading(path, monkeypatch):
    from app import auth
    app = FastAPI()
    app.include_router(contributions.router)
    def invalid_token(*args):
        raise jwt.InvalidTokenError()
    monkeypatch.setattr(auth.jwks_client, "get_signing_key_from_jwt", invalid_token)
    with TestClient(app) as client:
        for headers in [{}, {"Authorization": "Basic invalid"}, {"Authorization": "Bearer invalid"}]:
            assert client.post(path, json=payload(), headers=headers).status_code == 401


def test_canonical_app_registration_and_openapi():
    from app.main import app
    schema = app.openapi()
    def registered_paths(router):
        for route in router.routes:
            included = getattr(route, "original_router", None)
            if included is not None:
                yield from registered_paths(included)
            else:
                yield getattr(route, "path", None)
    paths = list(registered_paths(app))
    for path in PATHS:
        assert paths.count(path) == 1
        assert "post" in schema["paths"][path]
        operation = schema["paths"][path]["post"]
        assert operation["summary"]
        assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("ContributionAPIRequest")
    products = schema["components"]["schemas"]["ContributionProductResponse"]["properties"]
    assert "partnership" not in products and "affiliate_available" not in products
    assert schema["components"]["schemas"]["ContributionPlanResponse"]["properties"]["contribution_amount"]["type"] == "string"
