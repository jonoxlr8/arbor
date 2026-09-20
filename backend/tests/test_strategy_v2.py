from decimal import Decimal
from itertools import product

import pytest
from pydantic import TypeAdapter, ValidationError

from app.services.strategy_v2 import (
    Allocation, AssetRole, EffectiveTargetAllocation, INFLATION_ANNUAL_RATE,
    ReadinessState, RoleWeight, SavedPreferences, StrategyPath, StrategyType,
    STRATEGY_ENGINE_VERSION, get_base_strategy,
)


def allocation(**weights):
    return Allocation(weights=tuple(
        RoleWeight(role=role, percentage_points=weight)
        for role, weight in weights.items()
    ))


@pytest.mark.parametrize("strategy,equity,defensive,rate", [
    (StrategyType.CONSERVATIVE, 40, 60, "0.04"),
    (StrategyType.BALANCED, 60, 40, "0.045"),
    (StrategyType.GROWTH, 80, 20, "0.05"),
    (StrategyType.AGGRESSIVE, 100, 0, "0.055"),
])
def test_canonical_definitions(strategy, equity, defensive, rate):
    base = get_base_strategy(strategy)
    assert base.strategy == strategy
    assert base.allocation.weight(AssetRole.GLOBAL_EQUITY) == equity
    assert base.allocation.weight(AssetRole.DEFENSIVE) == defensive
    assert sum(item.percentage_points for item in base.allocation.weights) == 100
    assert {item.role for item in base.allocation.weights} == {
        AssetRole.GLOBAL_EQUITY, AssetRole.DEFENSIVE,
    }
    assert base.planning_annual_rate == Decimal(rate)
    assert base.strategy_engine_version == STRATEGY_ENGINE_VERSION == "2.0"
    assert base.model_dump(mode="json")["strategy_engine_version"] == "2.0"


def test_inflation_is_a_separate_canonical_assumption():
    assert INFLATION_ANNUAL_RATE == Decimal("0.03")


@pytest.mark.parametrize("weight", [-1, 101, 1.5, True, "40", float("nan"), float("inf")])
def test_invalid_weights_rejected(weight):
    with pytest.raises(ValidationError):
        RoleWeight(role="global_equity", percentage_points=weight)


@pytest.mark.parametrize("role", ["bonds", "bitcoin", "QQQM", "", "unknown"])
def test_only_canonical_asset_roles_accepted(role):
    with pytest.raises(ValidationError):
        RoleWeight(role=role, percentage_points=0)


@pytest.mark.parametrize("weights", [
    {}, {"global_equity": 100}, {"defensive": 100},
    {"global_equity": 60, "defensive": 39},
    {"global_equity": 60, "defensive": 41},
])
def test_missing_core_roles_and_incorrect_totals_rejected(weights):
    with pytest.raises(ValidationError):
        allocation(**weights)


def test_duplicate_roles_rejected():
    with pytest.raises(ValidationError):
        Allocation(weights=(
            RoleWeight(role="global_equity", percentage_points=40),
            RoleWeight(role="global_equity", percentage_points=20),
            RoleWeight(role="defensive", percentage_points=40),
        ))


@pytest.mark.parametrize("technology,bitcoin", list(product([0, 10], repeat=2)))
@pytest.mark.parametrize("strategy", list(StrategyType))
def test_saved_preferences_cannot_change_strategy_or_planning_return(strategy, technology, bitcoin):
    base = get_base_strategy(strategy)
    original = base.model_dump()
    preferences = SavedPreferences(technology_tilt=technology, bitcoin=bitcoin)
    assert preferences.model_dump() == {"technology_tilt": technology, "bitcoin": bitcoin}
    assert get_base_strategy(strategy).model_dump() == original
    with pytest.raises(ValidationError):
        SavedPreferences(**preferences.model_dump(), planning_annual_rate="0.20")
    with pytest.raises(ValidationError):
        SavedPreferences(**preferences.model_dump(), base_strategy="Aggressive")


def test_preferences_are_strict_and_immutable():
    assert SavedPreferences().model_dump() == {"technology_tilt": 0, "bitcoin": 0}
    with pytest.raises(ValidationError):
        SavedPreferences(bitcoin="yes")
    with pytest.raises(ValidationError):
        SavedPreferences().bitcoin = True


def test_effective_target_is_separate_and_return_stays_with_base():
    target = EffectiveTargetAllocation(
        base_strategy="Balanced",
        allocation=allocation(global_equity=45, defensive=40, technology_tilt=10, crypto=5),
    )
    assert target.base_strategy == StrategyType.BALANCED
    assert target.planning_annual_rate == Decimal("0.045")
    assert target.allocation.weight(AssetRole.DEFENSIVE) == 40
    assert get_base_strategy(StrategyType.BALANCED).allocation.weight(AssetRole.GLOBAL_EQUITY) == 60
    assert target.strategy_engine_version == "2.0"
    assert EffectiveTargetAllocation.model_validate_json(target.model_dump_json()) == target
    with pytest.raises(ValidationError):
        EffectiveTargetAllocation(**target.model_dump(), planning_annual_rate="0.20")


@pytest.mark.parametrize("defensive", [39, 41])
def test_effective_target_cannot_reduce_or_increase_base_defensive_weight(defensive):
    with pytest.raises(ValidationError):
        EffectiveTargetAllocation(base_strategy="Balanced", allocation=allocation(
            global_equity=90 - defensive, defensive=defensive, crypto=10,
        ))


def test_canonical_definitions_cannot_be_mutated():
    base = get_base_strategy(StrategyType.AGGRESSIVE)
    with pytest.raises(ValidationError):
        base.planning_return_basis_points = 900
    with pytest.raises(ValidationError):
        base.allocation.weights[0].percentage_points = 50
    with pytest.raises(ValidationError):
        base.allocation.weights = ()


def test_unknown_strategy_and_wrong_version_rejected():
    with pytest.raises(ValueError):
        get_base_strategy("unknown")
    with pytest.raises(ValidationError):
        EffectiveTargetAllocation(strategy_engine_version="1.0", base_strategy="Balanced",
                                  allocation=allocation(global_equity=60, defensive=40))


def test_short_term_is_not_forced_into_conservative_strategy():
    adapter = TypeAdapter(StrategyPath)
    short = adapter.validate_python({"path": "short_term"})
    assert short.model_dump() == {"path": "short_term", "strategy_engine_version": "2.0"}
    with pytest.raises(ValidationError):
        adapter.validate_python({"path": "short_term", "base_strategy": "Conservative"})
    with pytest.raises(ValidationError):
        adapter.validate_python({"path": "long_term"})
    assert adapter.validate_python({"path": "long_term", "base_strategy": "Growth"}).base_strategy == StrategyType.GROWTH


def test_readiness_vocabulary_is_independent_of_strategy():
    assert {state.value for state in ReadinessState} == {"ready", "getting_ready", "foundation_first"}
    with pytest.raises(ValueError):
        ReadinessState("Conservative")


def test_v2_import_does_not_change_legacy_risk_or_projection_defaults():
    from app.schemas.validation import RISK_CATEGORIES
    from app.services.projection_engine import calculate_projection
    from app.services.risk_engine import calculate_risk_score
    from types import SimpleNamespace

    assert RISK_CATEGORIES == ("Conservative", "Balanced", "Aggressive")
    with pytest.raises(ValueError):
        calculate_risk_score(SimpleNamespace(risk_tolerance="Growth", investment_horizon=15))
    result = calculate_projection(1000, 0, 1)
    assert result["assumed_return"] == .08
    assert result["projected_value"] == round(1000 * (1 + .08 / 12) ** 12, 2)
