"""Canonical v2 readiness rules, isolated from production onboarding.

Readiness grants permission only: strategy-specific eligibility must still be
checked downstream. It never selects a strategy or changes saved preferences.
"""
from enum import Enum
from types import MappingProxyType

from app.services.strategy_v2 import DomainModel, ReadinessState


class EmergencySavings(str, Enum):
    LESS_THAN_1_MONTH = "less_than_1_month"
    ONE_TO_TWO_MONTHS = "one_to_two_months"
    THREE_TO_SIX_MONTHS = "three_to_six_months"
    MORE_THAN_SIX_MONTHS = "more_than_six_months"


class HighInterestDebt(str, Enum):
    NONE = "none"
    PAYING_DOWN = "paying_down"
    DIFFICULT_TO_MANAGE = "difficult_to_manage"
    NOT_SURE = "not_sure"


class ReadinessInputs(DomainModel):
    emergency_savings: EmergencySavings
    high_interest_debt: HighInterestDebt


class GuidanceMessageRequirement(str, Enum):
    NONE = "none"
    READINESS_CAUTION = "readiness_caution"
    FOUNDATION_FIRST = "foundation_first"


class ReadinessResult(DomainModel):
    readiness: ReadinessState
    core_strategy_can_be_shown: bool
    actionable_contribution_guidance_allowed: bool
    technology_satellite_readiness_eligible: bool
    bitcoin_satellite_readiness_eligible: bool
    message_requirement: GuidanceMessageRequirement


# A single explicit permission policy. Eligibility is NOT an allocation or a
# guarantee that a later strategy-specific rule permits a satellite.
_RESULTS = MappingProxyType({
    ReadinessState.READY: ReadinessResult(
        readiness=ReadinessState.READY,
        core_strategy_can_be_shown=True,
        actionable_contribution_guidance_allowed=True,
        technology_satellite_readiness_eligible=True,
        bitcoin_satellite_readiness_eligible=True,
        message_requirement=GuidanceMessageRequirement.NONE,
    ),
    ReadinessState.GETTING_READY: ReadinessResult(
        readiness=ReadinessState.GETTING_READY,
        core_strategy_can_be_shown=True,
        actionable_contribution_guidance_allowed=True,
        technology_satellite_readiness_eligible=True,
        bitcoin_satellite_readiness_eligible=False,
        message_requirement=GuidanceMessageRequirement.READINESS_CAUTION,
    ),
    ReadinessState.FOUNDATION_FIRST: ReadinessResult(
        readiness=ReadinessState.FOUNDATION_FIRST,
        core_strategy_can_be_shown=True,
        actionable_contribution_guidance_allowed=False,
        technology_satellite_readiness_eligible=False,
        bitcoin_satellite_readiness_eligible=False,
        message_requirement=GuidanceMessageRequirement.FOUNDATION_FIRST,
    ),
})


def evaluate_readiness(
    emergency_savings: EmergencySavings,
    high_interest_debt: HighInterestDebt,
) -> ReadinessResult:
    """Validate inputs and return immutable permissions; never infer missing data.

    Foundation First's visible core strategy is a preview only. Getting Ready
    permits core contribution guidance with a required readiness caution.
    """
    inputs = ReadinessInputs(
        emergency_savings=emergency_savings,
        high_interest_debt=high_interest_debt,
    )
    if inputs.high_interest_debt == HighInterestDebt.DIFFICULT_TO_MANAGE:
        state = ReadinessState.FOUNDATION_FIRST
    elif inputs.high_interest_debt == HighInterestDebt.NONE and inputs.emergency_savings in {
        EmergencySavings.THREE_TO_SIX_MONTHS,
        EmergencySavings.MORE_THAN_SIX_MONTHS,
    }:
        state = ReadinessState.READY
    else:
        state = ReadinessState.GETTING_READY
    return _RESULTS[state]
