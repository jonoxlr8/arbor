from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.routes import profiles
from app.services.entitlements import resolve_entitlements
from app.services.future_projection_v2 import future_value, whole_months_until


@pytest.mark.parametrize("strategy,expected", [("Conservative", "4.00"), ("Balanced", "4.500"), ("Growth", "5.00"), ("Aggressive", "5.500")])
def test_canonical_strategy_assumptions(strategy, expected):
    result = future_value(Decimal("1000"), Decimal("100"), strategy, date(2026, 9, 28), date(2027, 9, 28))
    assert Decimal(result["annual_planning_rate_pct"]) == Decimal(expected)
    assert result["whole_months"] == 12
    assert result["starting_value_php"] == "1000.00"
    assert result["inflation_planning_rate_pct"] == "3.0"


def test_month_count_and_zero_contribution_boundary():
    assert whole_months_until(date(2026, 1, 31), date(2026, 2, 28)) == 1
    assert whole_months_until(date(2026, 9, 28), date(2026, 10, 27)) == 0
    assert whole_months_until(date(2026, 9, 28), date(2026, 10, 28)) == 1
    result = future_value(Decimal("0"), Decimal("0"), "Growth", date(2026, 9, 28), date(2027, 9, 28))
    assert result["projected_value_php"] == "0.00"
    with pytest.raises(ValueError):
        future_value(Decimal("1"), Decimal("1"), "Growth", date(2026, 9, 28), date(2026, 10, 27))
    with pytest.raises(ValidationError):
        profiles.FutureProjectionRequest(monthly_contribution_php="999.999")


def test_added_portfolio_capital_is_not_doubled_by_planning_start():
    result = future_value(Decimal("2000"), Decimal("0"), "Growth", date(2026, 9, 28), date(2027, 9, 28))
    assert result["starting_value_php"] == "2000.00"
    assert Decimal(result["projected_value_php"]) == Decimal("2100.00")


def test_projection_endpoint_is_plus_only_and_read_only(monkeypatch):
    monkeypatch.setattr(profiles, "get_my_profile", lambda **_: {"strategy_engine_version": "2.0",
        "profile": {"goal_date": "2027-09-28", "goal_target": 5000, "monthly_investment": 100, "current_portfolio_value": 999999},
        "plan": {"path": "long_term", "plan_basis": "user_selected", "selected_strategy": "Growth",
                 "readiness": {"actionable_contribution_guidance_allowed": True}}})
    from app.routes import live_portfolio
    monkeypatch.setattr(live_portfolio, "load_portfolio", lambda *_: (SimpleNamespace(complete=True, known_value_php=Decimal("2000")), None))
    from app.services import entitlements
    monkeypatch.setattr(entitlements, "get_entitlements", lambda _: resolve_entitlements("free", "active"))
    with pytest.raises(HTTPException) as denied:
        profiles.preview_future_projection(profiles.FutureProjectionRequest(), user_id="A", authorization="Bearer qa")
    assert denied.value.status_code == 403
    monkeypatch.setattr(entitlements, "get_entitlements", lambda _: resolve_entitlements())
    result = profiles.preview_future_projection(profiles.FutureProjectionRequest(), user_id="A", authorization="Bearer qa")
    assert result["starting_value_php"] == "2000.00"  # Not 999999 + recorded portfolio.
    assert result["monthly_contribution_php"] == "100.00"
    override = profiles.preview_future_projection(profiles.FutureProjectionRequest(monthly_contribution_php=200), user_id="A", authorization="Bearer qa")
    assert override["projected_value_php"] > result["projected_value_php"]
    monkeypatch.setattr(live_portfolio, "load_portfolio", lambda *_: (SimpleNamespace(complete=False, known_value_php=Decimal("100")), None))
    with pytest.raises(HTTPException) as incomplete:
        profiles.preview_future_projection(profiles.FutureProjectionRequest(), user_id="A", authorization="Bearer qa")
    assert incomplete.value.status_code == 409


@pytest.mark.parametrize("path,basis,ready", [("short_term", "user_selected", True),
    ("long_term", "historical_assessment", True), ("long_term", "user_selected", False)])
def test_projection_cannot_bypass_saved_path_or_readiness(monkeypatch, path, basis, ready):
    monkeypatch.setattr(profiles, "get_my_profile", lambda **_: {"strategy_engine_version": "2.0",
        "profile": {"goal_date": "2036-09-28", "monthly_investment": 100},
        "plan": {"path": path, "plan_basis": basis, "readiness": {"actionable_contribution_guidance_allowed": ready}}})
    with pytest.raises(HTTPException) as denied:
        profiles.preview_future_projection(profiles.FutureProjectionRequest(), user_id="A", authorization="Bearer qa")
    assert denied.value.status_code == 409


def test_projection_requires_exact_date(monkeypatch):
    monkeypatch.setattr(profiles, "get_my_profile", lambda **_: {"strategy_engine_version": "2.0",
        "profile": {"goal_date": None, "monthly_investment": 100},
        "plan": {"path": "long_term", "plan_basis": "user_selected",
                 "readiness": {"actionable_contribution_guidance_allowed": True}}})
    with pytest.raises(HTTPException) as missing:
        profiles.preview_future_projection(profiles.FutureProjectionRequest(), user_id="A", authorization="Bearer qa")
    assert missing.value.status_code == 422
