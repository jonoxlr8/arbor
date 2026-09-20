from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.services.implementation import mapper
from app.services.implementation.models import Fees, ImplementationMapping, Partnership, RouteId
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.readiness_v2 import evaluate_readiness
from app.services.strategy_v2 import EffectiveTargetAllocation, SavedPreferences


TARGET_CASES = [
    ("sell_all", 0, 0), ("sell_some", 0, 0), ("hold", 0, 0), ("continue_investing", 0, 0),
    ("sell_some", 10, 10), ("hold", 10, 10), ("continue_investing", 10, 10),
    ("hold", 0, 5), ("hold", 10, 0), ("hold", 100, 100),
]
READINESS = [("three_to_six_months", "none", "active"),
             ("one_to_two_months", "none", "active"),
             ("three_to_six_months", "difficult_to_manage", "preview")]


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("risk,tech,btc", TARGET_CASES)
@pytest.mark.parametrize("savings,debt,state", READINESS)
def test_mapping_preserves_canonical_effective_target(route, risk, tech, btc, savings, debt, state):
    plan = build_portfolio_plan(risk, "ten_plus_years", savings, debt, SavedPreferences(technology_tilt=tech, bitcoin=btc))
    original = plan.model_dump(mode="json")
    target = plan.preference_result.effective_target
    result = mapper.map_plan(route, plan)
    expected = {w.role: w.percentage_points for w in target.allocation.weights if w.percentage_points}
    assert {item.sleeve: item.target_percentage_points for item in result.implementations} == expected
    assert result.target_total_percentage_points == sum(expected.values()) == 100
    assert sum(item.target_percentage_points for item in result.implementations) == 100
    assert all(item.target_percentage_points > 0 and item.product.sleeve == item.sleeve for item in result.implementations)
    assert result.state == state
    assert result.actionable is (state == "active")
    assert all(item.state == state and item.actionable == result.actionable for item in result.implementations)
    assert plan.model_dump(mode="json") == original
    assert result == mapper.map_plan(route, plan)
    assert ImplementationMapping.model_validate_json(result.model_dump_json()) == result
    if savings == "one_to_two_months" or state == "preview":
        assert "crypto" not in expected
    if state == "preview":
        assert "technology_tilt" not in expected
        assert result.warnings


@pytest.mark.parametrize("route,eligible,names", [
    ("gcash", None, {"global_equity": "ATRAM Global Equity Opportunity Feeder Fund", "technology_tilt": "ATRAM Global Technology Feeder Fund", "crypto": "GCrypto BTC", "defensive": "ATRAM Medium Term Peso Bond Fund"}),
    ("dragonfi", None, {"global_equity": "BPI Global Equity Fund of Funds", "technology_tilt": "BPI World Technology Feeder Fund", "crypto": "Coins.ph BTC", "defensive": "BPI Premium Bond Fund"}),
    ("gotrade", None, {"global_equity": "VT", "technology_tilt": "VGT", "crypto": "Coins.ph BTC", "defensive": "BND"}),
    ("ibkr", False, {"global_equity": "VWRA", "technology_tilt": "IUIT", "crypto": "Coins.ph BTC", "defensive": "AGGU"}),
    ("ibkr", True, {"global_equity": "VWRA", "technology_tilt": "IUIT", "crypto": "IBKR BTC", "defensive": "AGGU"}),
])
def test_locked_examples(route, eligible, names):
    plan = build_portfolio_plan("hold", "ten_plus_years", "three_to_six_months", "none", SavedPreferences(technology_tilt=10, bitcoin=5))
    result = mapper.map_plan(route, plan, ibkr_crypto_eligible=eligible)
    assert {item.sleeve: item.product.display_name for item in result.implementations} == names
    assert {item.sleeve: item.target_percentage_points for item in result.implementations} == {"global_equity": 65, "technology_tilt": 10, "crypto": 5, "defensive": 20}
    for item in result.implementations:
        assert item.match_quality == ("broad" if route == "gcash" and item.sleeve == "global_equity" else "direct")


@pytest.mark.parametrize("eligible", [None, False, True])
def test_ibkr_fallback_is_explicit_and_pdax_never_selected(eligible):
    plan = build_portfolio_plan("invest_more", "ten_plus_years", "three_to_six_months", "none", SavedPreferences(bitcoin=10))
    result = mapper.map_plan("ibkr", plan, ibkr_crypto_eligible=eligible)
    btc = next(item for item in result.implementations if item.sleeve == "crypto")
    assert btc.product.product_id == ("ibkr_btc" if eligible else "coins_btc")
    assert btc.crypto_fallback.selected_as_fallback is (eligible is not True)
    assert btc.crypto_fallback.secondary_product_ids == ("pdax_btc",)
    if eligible is not True:
        assert btc.crypto_fallback.fallback_reason == "ibkr_crypto_not_confirmed_eligible"
        assert any("not confirmed eligible" in warning for warning in btc.warnings)
    else:
        assert btc.crypto_fallback.alternative_product_ids == ("coins_btc",)


@pytest.mark.parametrize("route", ["gcash", "dragonfi", "gotrade"])
def test_crypto_defaults_ignore_ibkr_flag(route):
    plan = build_portfolio_plan("hold", "ten_plus_years", "three_to_six_months", "none", SavedPreferences(bitcoin=5))
    result = mapper.map_plan(route, plan, ibkr_crypto_eligible=True)
    btc = next(item for item in result.implementations if item.sleeve == "crypto")
    assert btc.product.product_id == ("gcrypto_btc" if route == "gcash" else "coins_btc")
    if route != "gcash":
        assert btc.crypto_fallback.secondary_product_ids == ("pdax_btc",)


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("savings,debt,_state", READINESS)
def test_short_term_has_no_implementation_even_with_preferences(route, savings, debt, _state):
    plan = build_portfolio_plan("invest_more", "less_than_3_years", savings, debt, SavedPreferences(technology_tilt=10, bitcoin=10))
    result = mapper.map_plan(route, plan)
    assert result.state == "not_applicable" and result.actionable is False
    assert result.implementations == () and result.target_total_percentage_points is None


def arbitrary_target():
    return {"base_strategy": "Growth", "allocation": {"weights": [
        {"role": "global_equity", "percentage_points": 57},
        {"role": "defensive", "percentage_points": 20},
        {"role": "technology_tilt", "percentage_points": 16},
        {"role": "crypto", "percentage_points": 7},
    ]}}


@pytest.mark.parametrize("route", list(RouteId))
def test_mapper_does_not_reapply_caps_to_arbitrary_valid_target(route):
    raw = arbitrary_target()
    before = deepcopy(raw)
    result = mapper.map_effective_target(route, raw, evaluate_readiness("three_to_six_months", "none"))
    assert [item.target_percentage_points for item in result.implementations] == [57, 20, 16, 7]
    assert raw == before


@pytest.mark.parametrize("route", ["bpi", "pdax", "best", "", "GCash"])
def test_unsupported_route_rejected(route):
    with pytest.raises(ValidationError):
        mapper.map_effective_target(route, arbitrary_target(), evaluate_readiness("three_to_six_months", "none"))


@pytest.mark.parametrize("change", ["negative", "wrong_total", "invalid_sleeve", "fraction", "duplicate", "missing", "defensive_changed"])
def test_malformed_target_rejected(change):
    raw = arbitrary_target()
    weights = raw["allocation"]["weights"]
    if change == "negative": weights[0]["percentage_points"] = -1
    if change == "wrong_total": weights[0]["percentage_points"] = 58
    if change == "invalid_sleeve": weights[0]["role"] = "gold"
    if change == "fraction": weights[0]["percentage_points"] = 57.0
    if change == "duplicate": weights[0]["role"] = "crypto"
    if change == "missing": raw.pop("allocation")
    if change == "defensive_changed":
        weights[0]["percentage_points"] = 56
        weights[1]["percentage_points"] = 21
    with pytest.raises(ValidationError):
        mapper.map_effective_target("gcash", raw, evaluate_readiness("three_to_six_months", "none"))


def test_path_mismatch_and_nonboolean_eligibility_fail_closed():
    readiness = evaluate_readiness("three_to_six_months", "none")
    for target, path in [(None, "long_term"), (arbitrary_target(), "short_term"), (None, "unknown")]:
        with pytest.raises(ValidationError):
            mapper.map_effective_target("gcash", target, readiness, path=path)
    for eligible in ["true", 1, "false"]:
        with pytest.raises(ValidationError):
            mapper.map_effective_target("ibkr", arbitrary_target(), readiness, ibkr_crypto_eligible=eligible)


def test_partnership_and_fees_never_influence_mapping(monkeypatch):
    plan = build_portfolio_plan("hold", "ten_plus_years", "three_to_six_months", "none", SavedPreferences(technology_tilt=10, bitcoin=5))
    before = {route: mapper.map_plan(route, plan) for route in RouteId}
    original_product, original_route = mapper.get_product, mapper.get_route
    monkeypatch.setattr(mapper, "get_product", lambda key: original_product(key).model_copy(update={"partnership": Partnership(affiliate_available=False, disclosure_required=False)}))
    monkeypatch.setattr(mapper, "get_route", lambda key: original_route(key).model_copy(update={"fees": Fees(trading_fee_min_pct=99, trading_fee_max_pct=100), "partnership": Partnership(affiliate_available=True)}))
    for route in RouteId:
        after = mapper.map_plan(route, plan)
        assert [(i.product.product_id, i.target_percentage_points, i.state) for i in after.implementations] == [(i.product.product_id, i.target_percentage_points, i.state) for i in before[route].implementations]
        assert after.route.route_id == route
