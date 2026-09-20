from itertools import product

import pytest
from pydantic import ValidationError

from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.preferences_v2 import PreferenceReason, apply_preferences, get_satellite_caps
from app.services.readiness_v2 import evaluate_readiness
from app.services.strategy_v2 import AssetRole, SavedPreferences, StrategyType, get_base_strategy


READINESS = [
    ("three_to_six_months", "none", True, True),
    ("one_to_two_months", "none", True, False),
    ("three_to_six_months", "difficult_to_manage", False, False),
]


@pytest.mark.parametrize("strategy,tech_cap,btc_cap", [
    ("Conservative", 0, 0), ("Balanced", 5, 5), ("Growth", 10, 5), ("Aggressive", 10, 10),
])
def test_locked_caps(strategy, tech_cap, btc_cap):
    assert get_satellite_caps(strategy).model_dump() == {"technology_tilt": tech_cap, "bitcoin": btc_cap}


@pytest.mark.parametrize("strategy", list(StrategyType))
@pytest.mark.parametrize("savings,debt,tech_allowed,btc_allowed", READINESS)
@pytest.mark.parametrize("tech,btc", list(product([0, 1, 5, 6, 10, 11, 100], repeat=2)))
def test_strategy_readiness_request_matrix(strategy, savings, debt, tech_allowed, btc_allowed, tech, btc):
    preferences = SavedPreferences(technology_tilt=tech, bitcoin=btc)
    readiness = evaluate_readiness(savings, debt)
    base = get_base_strategy(strategy)
    before = base.model_dump()
    result = apply_preferences(strategy, readiness, preferences)
    assert result == apply_preferences(strategy, readiness, preferences)
    target = result.effective_target
    assert target.base_strategy == strategy
    assert target.planning_annual_rate == base.planning_annual_rate
    caps = get_satellite_caps(strategy)
    expected_tech = min(tech, caps.technology_tilt) if tech_allowed else 0
    expected_btc = min(btc, caps.bitcoin) if btc_allowed else 0
    assert target.allocation.weight(AssetRole.TECHNOLOGY_TILT) == expected_tech
    assert target.allocation.weight(AssetRole.CRYPTO) == expected_btc
    assert target.allocation.weight(AssetRole.DEFENSIVE) == base.allocation.weight(AssetRole.DEFENSIVE)
    assert target.allocation.weight(AssetRole.GLOBAL_EQUITY) == base.allocation.weight(AssetRole.GLOBAL_EQUITY) - expected_tech - expected_btc
    assert sum(w.percentage_points for w in target.allocation.weights) == 100
    assert all(w.percentage_points >= 0 for w in target.allocation.weights)
    assert preferences.model_dump() == {"technology_tilt": tech, "bitcoin": btc}
    assert get_base_strategy(strategy).model_dump() == before
    for application, requested, cap, eligible in [
        (result.technology_tilt, tech, caps.technology_tilt, tech_allowed),
        (result.bitcoin, btc, caps.bitcoin, btc_allowed),
    ]:
        assert application.requested_percentage_points == requested
        assert (PreferenceReason.STRATEGY_CAP in application.reasons) == (requested > cap)
        assert (PreferenceReason.READINESS_RESTRICTED in application.reasons) == bool(requested and not eligible)


@pytest.mark.parametrize("savings,debt,_tech,_btc", READINESS)
def test_short_term_retains_requests_but_has_no_target_or_return(savings, debt, _tech, _btc):
    preferences = SavedPreferences(technology_tilt=10, bitcoin=10)
    plan = build_portfolio_plan("invest_more", "less_than_3_years", savings, debt, preferences)
    assert plan.selected_strategy is plan.base_allocation is plan.planning_annual_rate is None
    assert plan.saved_preferences == preferences
    assert plan.preference_result.effective_target is None
    for item in [plan.preference_result.technology_tilt, plan.preference_result.bitcoin]:
        assert item.effective_percentage_points == 0
        assert item.strategy_cap_percentage_points is None
        assert item.reasons == (PreferenceReason.SHORT_TERM_PATH,)


def test_final_horizon_capped_strategy_is_used_not_requested_strategy():
    plan = build_portfolio_plan("invest_more", "three_to_five_years", "three_to_six_months", "none", SavedPreferences(technology_tilt=10, bitcoin=10))
    assert plan.selected_strategy == StrategyType.BALANCED
    assert plan.preference_result.technology_tilt.effective_percentage_points == 5
    assert plan.preference_result.bitcoin.effective_percentage_points == 5
    assert plan.saved_preferences.bitcoin == 10
    assert plan.base_allocation == get_base_strategy("Balanced").allocation
    assert plan.planning_annual_rate == get_base_strategy("Balanced").planning_annual_rate


@pytest.mark.parametrize("invalid", [-1, 101, 1.5, "10", True, None, float("inf"), float("nan")])
@pytest.mark.parametrize("field", ["technology_tilt", "bitcoin"])
def test_invalid_requests_rejected(field, invalid):
    with pytest.raises(ValidationError):
        SavedPreferences(**{field: invalid})


def test_zero_defaults_keep_base_weights_and_caps_fit_equity():
    for strategy in StrategyType:
        base = get_base_strategy(strategy)
        caps = get_satellite_caps(strategy)
        assert caps.technology_tilt + caps.bitcoin <= base.allocation.weight(AssetRole.GLOBAL_EQUITY)
        target = apply_preferences(strategy, evaluate_readiness("three_to_six_months", "none"), SavedPreferences()).effective_target
        for weight in base.allocation.weights:
            assert target.allocation.weight(weight.role) == weight.percentage_points
