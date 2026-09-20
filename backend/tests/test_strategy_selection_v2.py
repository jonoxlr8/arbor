import pytest
from pydantic import ValidationError

from app.services.strategy_selection_v2 import (
    HorizonBucket, RiskResponse, SelectionReason, StrategySelectionInputs, select_strategy,
)
from app.services.strategy_v2 import AssetRole, LongTermPath, ShortTermPath, StrategyType, get_base_strategy
from app.services.readiness_v2 import EmergencySavings, HighInterestDebt, evaluate_readiness


HORIZONS = ("less_than_3_years", "three_to_five_years", "five_to_ten_years", "ten_plus_years")
MAXIMUMS = (None, "Balanced", "Growth", "Aggressive")
# Independent expected matrix: requested tier followed by outcomes in horizon order.
EXPECTED = {
    "sell_all": ("Conservative", (None, "Conservative", "Conservative", "Conservative")),
    "sell_some": ("Balanced", (None, "Balanced", "Balanced", "Balanced")),
    "hold": ("Growth", (None, "Balanced", "Growth", "Growth")),
    "continue_investing": ("Aggressive", (None, "Balanced", "Growth", "Aggressive")),
    "invest_more": ("Aggressive", (None, "Balanced", "Growth", "Aggressive")),
}
CASES = [(risk, horizon, requested, MAXIMUMS[index], outcomes[index])
         for risk, (requested, outcomes) in EXPECTED.items()
         for index, horizon in enumerate(HORIZONS)]


@pytest.mark.parametrize("risk,horizon,requested,maximum,selected", CASES)
def test_complete_matrix(risk, horizon, requested, maximum, selected):
    result = select_strategy(risk, horizon)
    assert result.risk_response == risk
    assert result.horizon == horizon
    assert result.requested_strategy == requested
    assert result.horizon_maximum_strategy == maximum
    assert result.selected_strategy == selected
    assert result.is_short_term is (selected is None)
    assert result.cap_applied is (selected is not None and selected != requested)
    assert result == select_strategy(RiskResponse(risk), HorizonBucket(horizon))
    assert result == select_strategy(risk, horizon)
    assert result.strategy_path.strategy_engine_version == "2.0"
    if selected is None:
        assert isinstance(result.strategy_path, ShortTermPath)
        assert result.reason == SelectionReason.SHORT_TERM_PATH
        assert "base_strategy" not in result.strategy_path.model_dump()
    else:
        assert isinstance(result.strategy_path, LongTermPath)
        weight = lambda strategy: get_base_strategy(strategy).allocation.weight(AssetRole.GLOBAL_EQUITY)
        assert weight(selected) <= weight(requested)
        assert weight(selected) <= weight(maximum)
        assert result.reason == (SelectionReason.HORIZON_CAPPED if selected != requested
                                 else SelectionReason.REQUESTED_STRATEGY_RETAINED)
    serialized = result.model_dump(mode="json")
    assert serialized["selected_strategy"] == selected
    assert serialized["cap_applied"] == result.cap_applied
    assert serialized["is_short_term"] == result.is_short_term


def test_matrix_is_exhaustive_and_only_four_long_term_strategies_exist():
    assert len(CASES) == 20
    assert {(r, h) for r, h, *_ in CASES} == {
        (r.value, h.value) for r in RiskResponse for h in HorizonBucket
    }
    assert set(StrategyType) == {StrategyType.CONSERVATIVE, StrategyType.BALANCED,
                                StrategyType.GROWTH, StrategyType.AGGRESSIVE}
    # Canonical equity weights, not enum positions, define a strict risk order.
    weights = [get_base_strategy(s).allocation.weight(AssetRole.GLOBAL_EQUITY) for s in
               [StrategyType.CONSERVATIVE, StrategyType.BALANCED, StrategyType.GROWTH, StrategyType.AGGRESSIVE]]
    assert all(left < right for left, right in zip(weights, weights[1:]))


@pytest.mark.parametrize("horizon", list(HorizonBucket))
def test_invest_more_never_adds_extra_risk(horizon):
    continuing = select_strategy("continue_investing", horizon)
    more = select_strategy("invest_more", horizon)
    assert continuing.requested_strategy == more.requested_strategy == StrategyType.AGGRESSIVE
    assert continuing.strategy_path == more.strategy_path
    assert continuing.cap_applied == more.cap_applied


@pytest.mark.parametrize("field", ["risk_response", "horizon"])
@pytest.mark.parametrize("value", [None, "", "unknown", True, 3])
def test_invalid_inputs_are_rejected(field, value):
    inputs = {"risk_response": "hold", "horizon": "ten_plus_years"}
    inputs[field] = value
    with pytest.raises(ValidationError):
        select_strategy(**inputs)


def test_missing_inputs_and_readiness_input_are_rejected():
    with pytest.raises(ValidationError):
        StrategySelectionInputs(risk_response="hold")
    with pytest.raises(ValidationError):
        StrategySelectionInputs(risk_response="hold", horizon="ten_plus_years", readiness="ready")
    with pytest.raises(TypeError):
        select_strategy("hold", "ten_plus_years", readiness="foundation_first")


def test_readiness_and_strategy_remain_independent():
    before = {s: get_base_strategy(s).model_dump() for s in StrategyType}
    for savings in EmergencySavings:
        for debt in HighInterestDebt:
            readiness = evaluate_readiness(savings, debt)
            snapshot = readiness.model_dump()
            for risk, horizon, *_ in CASES:
                result = select_strategy(risk, horizon)
                assert "readiness" not in result.model_dump()
                assert evaluate_readiness(savings, debt).model_dump() == snapshot
                assert result == select_strategy(risk, horizon)
    assert {s: get_base_strategy(s).model_dump() for s in StrategyType} == before
    assert select_strategy("invest_more", "ten_plus_years").selected_strategy == StrategyType.AGGRESSIVE
    assert evaluate_readiness("more_than_six_months", "difficult_to_manage").readiness == "foundation_first"


def test_result_is_immutable():
    result = select_strategy("hold", "three_to_five_years")
    with pytest.raises(ValidationError):
        result.requested_strategy = StrategyType.AGGRESSIVE
    with pytest.raises(ValidationError):
        result.strategy_path.base_strategy = StrategyType.AGGRESSIVE
