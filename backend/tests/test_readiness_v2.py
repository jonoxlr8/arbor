import pytest
from pydantic import ValidationError

from app.services.readiness_v2 import (
    EmergencySavings, GuidanceMessageRequirement, HighInterestDebt,
    ReadinessInputs, ReadinessResult, evaluate_readiness,
)
from app.services.strategy_v2 import (
    ReadinessState, SavedPreferences, StrategyType, get_base_strategy,
)


# Explicit expected outcomes, independent of the evaluator's branching logic.
# Columns: none, paying_down, difficult_to_manage, not_sure.
EXPECTED = {
    "less_than_1_month": ("getting_ready", "getting_ready", "foundation_first", "getting_ready"),
    "one_to_two_months": ("getting_ready", "getting_ready", "foundation_first", "getting_ready"),
    "three_to_six_months": ("ready", "getting_ready", "foundation_first", "getting_ready"),
    "more_than_six_months": ("ready", "getting_ready", "foundation_first", "getting_ready"),
}
DEBT_COLUMNS = ("none", "paying_down", "difficult_to_manage", "not_sure")
CASES = [(savings, debt, outcomes[index]) for savings, outcomes in EXPECTED.items()
         for index, debt in enumerate(DEBT_COLUMNS)]


@pytest.mark.parametrize("savings,debt,expected", CASES)
def test_complete_input_matrix_and_determinism(savings, debt, expected):
    result = evaluate_readiness(savings, debt)
    assert result.readiness == ReadinessState(expected)
    assert result == evaluate_readiness(EmergencySavings(savings), HighInterestDebt(debt))
    assert result == evaluate_readiness(savings, debt)
    assert result.core_strategy_can_be_shown is True
    if expected == "foundation_first":
        assert result.actionable_contribution_guidance_allowed is False
        assert result.technology_satellite_readiness_eligible is False
        assert result.bitcoin_satellite_readiness_eligible is False
        assert result.message_requirement == GuidanceMessageRequirement.FOUNDATION_FIRST
    elif expected == "getting_ready":
        assert result.actionable_contribution_guidance_allowed is True
        assert result.technology_satellite_readiness_eligible is True
        assert result.bitcoin_satellite_readiness_eligible is False
        assert result.message_requirement == GuidanceMessageRequirement.READINESS_CAUTION
    else:
        assert result.actionable_contribution_guidance_allowed is True
        assert result.technology_satellite_readiness_eligible is True
        assert result.bitcoin_satellite_readiness_eligible is True
        assert result.message_requirement == GuidanceMessageRequirement.NONE
    assert ReadinessResult.model_validate_json(result.model_dump_json()) == result


def test_matrix_covers_every_valid_combination():
    assert len(CASES) == 16
    assert {(s, d) for s, d, _ in CASES} == {
        (s.value, d.value) for s in EmergencySavings for d in HighInterestDebt
    }


@pytest.mark.parametrize("value", [None, "", "unknown", True, 3])
@pytest.mark.parametrize("field", ["emergency_savings", "high_interest_debt"])
def test_invalid_or_missing_answers_fail_explicitly(field, value):
    inputs = {"emergency_savings": "three_to_six_months", "high_interest_debt": "none"}
    inputs[field] = value
    with pytest.raises(ValidationError):
        evaluate_readiness(**inputs)


def test_missing_input_fields_and_extra_strategy_rejected():
    with pytest.raises(ValidationError):
        ReadinessInputs(emergency_savings="three_to_six_months")
    with pytest.raises(ValidationError):
        ReadinessInputs(emergency_savings="three_to_six_months", high_interest_debt="none",
                        base_strategy="Conservative")
    with pytest.raises(TypeError):
        evaluate_readiness("three_to_six_months", "none", strategy="Conservative")


@pytest.mark.parametrize("strategy", list(StrategyType))
def test_evaluation_never_changes_strategy_or_saved_preferences(strategy):
    base = get_base_strategy(strategy)
    before = base.model_dump()
    preferences = SavedPreferences(technology_tilt=True, bitcoin=True)
    saved = preferences.model_dump()
    for savings, debt, _ in CASES:
        result = evaluate_readiness(savings, debt)
        assert "strategy" not in result.model_dump()
        assert "base_strategy" not in result.model_dump()
        assert get_base_strategy(strategy).model_dump() == before
        assert preferences.model_dump() == saved
    # In particular, Aggressive + Foundation First remains Aggressive, not Conservative.
    assert base.strategy == strategy


def test_results_and_inputs_are_immutable():
    inputs = ReadinessInputs(emergency_savings="three_to_six_months", high_interest_debt="none")
    with pytest.raises(ValidationError):
        inputs.high_interest_debt = HighInterestDebt.DIFFICULT_TO_MANAGE
    result = evaluate_readiness("more_than_six_months", "difficult_to_manage")
    with pytest.raises(ValidationError):
        result.actionable_contribution_guidance_allowed = True
    assert evaluate_readiness("more_than_six_months", "difficult_to_manage").actionable_contribution_guidance_allowed is False
