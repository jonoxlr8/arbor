from itertools import product

import pytest
from pydantic import TypeAdapter, ValidationError

from app.services.portfolio_plan_v2 import (
    LongTermPortfolioPlan, PortfolioPlan, ShortTermPortfolioPlan, build_portfolio_plan,
)
from app.services.readiness_v2 import EmergencySavings, HighInterestDebt, evaluate_readiness
from app.services.strategy_selection_v2 import HorizonBucket, RiskResponse, select_strategy
from app.services.strategy_v2 import INFLATION_ANNUAL_RATE, get_base_strategy


@pytest.mark.parametrize("risk,horizon,savings,debt", list(product(
    RiskResponse, HorizonBucket, EmergencySavings, HighInterestDebt,
)))
def test_all_320_combinations_compose_canonical_sources(risk, horizon, savings, debt):
    plan = build_portfolio_plan(risk, horizon, savings, debt)
    selection = select_strategy(risk, horizon)
    readiness = evaluate_readiness(savings, debt)
    assert plan.selection == selection
    assert plan.readiness == readiness
    assert plan.selection.cap_applied == selection.cap_applied
    assert plan.strategy_engine_version == "2.0"
    assert plan.inflation_annual_rate == INFLATION_ANNUAL_RATE
    assert plan == build_portfolio_plan(risk, horizon, savings, debt)
    if selection.is_short_term:
        assert isinstance(plan, ShortTermPortfolioPlan)
        assert plan.path == "short_term"
        assert plan.selected_strategy is None
        assert plan.base_allocation is None
        assert plan.planning_annual_rate is None
    else:
        assert isinstance(plan, LongTermPortfolioPlan)
        assert plan.path == "long_term"
        assert plan.selected_strategy == selection.selected_strategy
        base = get_base_strategy(selection.selected_strategy)
        assert plan.base_allocation == base.allocation
        assert sum(w.percentage_points for w in plan.base_allocation.weights) == 100
        assert plan.planning_annual_rate == base.planning_annual_rate
    serialized = plan.model_dump(mode="json")
    assert serialized["readiness"] == readiness.model_dump(mode="json")
    assert serialized["selection"] == selection.model_dump(mode="json")
    assert serialized["inflation_annual_rate"] == str(INFLATION_ANNUAL_RATE)
    assert serialized["planning_annual_rate"] == (
        str(plan.planning_annual_rate) if plan.planning_annual_rate is not None else None
    )
    # Derived presentation fields are not writable inputs; Pydantic's explicit
    # round-trip mode excludes them, including those in the nested selection.
    assert TypeAdapter(PortfolioPlan).validate_json(plan.model_dump_json(round_trip=True)) == plan


@pytest.mark.parametrize("risk,horizon,savings,debt,strategy,state,actionable,bitcoin,cap", [
    ("sell_all", "ten_plus_years", "three_to_six_months", "none", "Conservative", "ready", True, True, False),
    ("invest_more", "three_to_five_years", "three_to_six_months", "none", "Balanced", "ready", True, True, True),
    ("hold", "ten_plus_years", "three_to_six_months", "paying_down", "Growth", "getting_ready", True, False, False),
    ("invest_more", "ten_plus_years", "more_than_six_months", "difficult_to_manage", "Aggressive", "foundation_first", False, False, False),
])
def test_representative_product_outcomes(risk, horizon, savings, debt, strategy, state, actionable, bitcoin, cap):
    plan = build_portfolio_plan(risk, horizon, savings, debt)
    assert plan.selected_strategy == strategy
    assert plan.readiness.readiness == state
    assert plan.readiness.actionable_contribution_guidance_allowed is actionable
    assert plan.readiness.bitcoin_satellite_readiness_eligible is bitcoin
    assert plan.selection.cap_applied is cap


@pytest.mark.parametrize("field,value", [
    ("selected_strategy", "Conservative"),
    ("base_allocation", get_base_strategy("Conservative").allocation),
    ("planning_annual_rate", 0),
])
def test_short_term_cannot_accept_a_strategy_allocation_or_even_zero_return(field, value):
    plan = build_portfolio_plan("sell_all", "less_than_3_years", "three_to_six_months", "none")
    with pytest.raises(ValidationError):
        ShortTermPortfolioPlan(selection=plan.selection, readiness=plan.readiness, **{field: value})


def test_path_mismatch_is_rejected():
    short = build_portfolio_plan("hold", "less_than_3_years", "one_to_two_months", "none")
    long = build_portfolio_plan("hold", "ten_plus_years", "one_to_two_months", "none")
    with pytest.raises(ValidationError):
        LongTermPortfolioPlan(selection=short.selection, readiness=short.readiness)
    with pytest.raises(ValidationError):
        ShortTermPortfolioPlan(selection=long.selection, readiness=long.readiness)


def test_canonical_values_cannot_be_supplied_as_overrides_and_plan_is_frozen():
    plan = build_portfolio_plan("hold", "ten_plus_years", "one_to_two_months", "none")
    for field, value in {"planning_annual_rate": .99, "inflation_annual_rate": .99,
                         "base_allocation": get_base_strategy("Conservative").allocation,
                         "strategy_engine_version": "1.0"}.items():
        with pytest.raises(ValidationError):
            LongTermPortfolioPlan(selection=plan.selection, readiness=plan.readiness, **{field: value})
    with pytest.raises(ValidationError):
        plan.path = "short_term"
    with pytest.raises(ValidationError):
        plan.readiness.bitcoin_satellite_readiness_eligible = True


def test_no_implementation_or_effective_target_fields():
    plan = build_portfolio_plan("hold", "ten_plus_years", "one_to_two_months", "none")
    forbidden = {"ticker", "provider", "product", "broker", "implementation_route", "effective_target"}

    def check(value):
        if isinstance(value, dict):
            assert not forbidden.intersection(value)
            for child in value.values():
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)

    check(plan.model_dump(mode="json"))
    with pytest.raises(ValidationError):
        LongTermPortfolioPlan(selection=plan.selection, readiness=plan.readiness, ticker="VT")


@pytest.mark.parametrize("field", ["risk_response", "horizon", "emergency_savings", "high_interest_debt"])
def test_invalid_input_is_rejected_by_existing_evaluators(field):
    inputs = dict(risk_response="hold", horizon="ten_plus_years",
                  emergency_savings="one_to_two_months", high_interest_debt="none")
    inputs[field] = "unknown"
    with pytest.raises(ValidationError):
        build_portfolio_plan(**inputs)
