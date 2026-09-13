import pytest
from pydantic import ValidationError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.schemas.profile import ProfileCreate
from app.schemas.projection import ProjectionRequest
from app.routes import profiles
from app.auth import get_current_user_id

BASE = dict(full_name="Example", country="Philippines", goal_target=100000,
            investment_horizon=15, monthly_investment=1000,
            current_portfolio_value=0, risk_tolerance="Balanced", currency="PHP")


@pytest.mark.parametrize("currency", ["usd", " USD ", "PHP", "NZD", "AUD", "EUR", "GBP", "CAD"])
def test_planning_currency_normalized(currency):
    assert ProfileCreate(**{**BASE, "currency": currency}).currency == currency.strip().upper()


@pytest.mark.parametrize("currency", [None, "", " ", "unknown"])
def test_invalid_planning_currency_write(currency):
    with pytest.raises(ValidationError):
        ProfileCreate(**{**BASE, "currency": currency})


@pytest.mark.parametrize("risk", ["Conservative", "Balanced", "Aggressive"])
def test_supported_categories(risk):
    assert ProfileCreate(**{**BASE, "risk_tolerance": risk}).risk_tolerance == risk


@pytest.mark.parametrize("risk", ["Growth", "Unknown", "", "balanced"])
def test_unknown_write_risk_is_rejected(risk):
    with pytest.raises(ValidationError):
        ProfileCreate(**{**BASE, "risk_tolerance": risk})


@pytest.mark.parametrize("field,value", [
    ("monthly_investment", -1), ("current_portfolio_value", -1), ("goal_target", 0),
    ("goal_target", -1), ("investment_horizon", 0), ("investment_horizon", 1.5),
    ("investment_horizon", 101), ("monthly_investment", 1e12 + 1),
    ("goal_target", 1e12 + 1), ("current_portfolio_value", 1e12 + 1),
    ("monthly_investment", ""), ("goal_target", " "),
    ("current_portfolio_value", float("inf")), ("monthly_investment", float("nan")),
    ("investment_horizon", True),
])
def test_invalid_profile_values(field, value):
    with pytest.raises(ValidationError):
        ProfileCreate(**{**BASE, field: value})


def test_zero_amounts_and_upper_boundaries_are_valid():
    p = ProfileCreate(**{**BASE, "monthly_investment": 0, "goal_target": 1e12, "investment_horizon": 100})
    assert p.current_portfolio_value == p.monthly_investment == 0


@pytest.mark.parametrize("field,value", [
    ("current_value", -1), ("monthly_investment", -1), ("years", 0), ("years", 1.5),
    ("years", 101), ("annual_return", 1.01), ("annual_return", -1.01),
    ("annual_return", float("nan")), ("annual_return", float("inf")),
    ("annual_return", ""), ("current_value", 1e12 + 1),
])
def test_invalid_projection_values(field, value):
    data = dict(current_value=0, monthly_investment=0, years=1, annual_return=0)
    with pytest.raises(ValidationError):
        ProjectionRequest(**{**data, field: value})


@pytest.mark.parametrize("rate", [-1, 0, 1])
def test_supported_return_boundaries(rate):
    assert ProjectionRequest(current_value=0, monthly_investment=0, years=100, annual_return=rate).annual_return == rate


@pytest.mark.parametrize("method,path,data", [
    ("post", "/profiles", {**BASE, "risk_tolerance": "Growth"}),
    ("put", "/profiles/me", {**BASE, "goal_target": -1}),
    ("post", "/projection", {"current_value": 0, "monthly_investment": 0, "years": 100000}),
])
def test_invalid_requests_never_calculate_or_persist(monkeypatch, method, path, data):
    def forbidden(*args, **kwargs):
        raise AssertionError("Invalid inputs reached calculation/persistence")
    monkeypatch.setattr(profiles, "build_investment_plan", forbidden)
    monkeypatch.setattr(profiles, "calculate_projection", forbidden)
    monkeypatch.setattr(profiles, "get_authenticated_client", forbidden)
    app = FastAPI()
    app.include_router(profiles.router)
    app.dependency_overrides[get_current_user_id] = lambda: "example-user"
    response = getattr(TestClient(app), method)(path, json=data, headers={"Authorization": "Bearer test"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][0] == "body"
