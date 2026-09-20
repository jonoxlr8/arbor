"""Explicit v2 onboarding boundary; no legacy request reinterpretation."""
from typing import Annotated, Literal
from pydantic import Field, StringConstraints

from app.schemas.validation import Money, Goal
from app.services.strategy_v2 import DomainModel, StrategyType, RoleWeight, SavedPreferences
from app.services.preferences_v2 import PreferenceResult
from app.services.readiness_v2 import EmergencySavings, HighInterestDebt, ReadinessResult
from app.services.strategy_selection_v2 import HorizonBucket, RiskResponse, StrategySelectionResult


class ProfileV2Create(DomainModel):
    strategy_engine_version: Literal["2.0"]
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    country: Literal["Philippines"]
    currency: Literal["PHP"]
    emergency_savings: EmergencySavings
    high_interest_debt: HighInterestDebt
    goal_target: Goal | None = None
    current_portfolio_value: Money
    monthly_investment: Money
    horizon: HorizonBucket
    risk_response: RiskResponse
    saved_preferences: SavedPreferences = Field(default_factory=SavedPreferences)


class PlanDTO(DomainModel):
    strategy_engine_version: Literal["2.0"] = "2.0"
    selection: StrategySelectionResult
    readiness: ReadinessResult
    inflation_pct: float
    preference_result: PreferenceResult


class LongTermPlanDTO(PlanDTO):
    path: Literal["long_term"] = "long_term"
    selected_strategy: StrategyType
    base_allocation: list[RoleWeight]
    planning_return_pct: float


class ShortTermPlanDTO(PlanDTO):
    path: Literal["short_term"] = "short_term"
    selected_strategy: None = None
    base_allocation: None = None
    planning_return_pct: None = None


class ProfileV2Response(DomainModel):
    strategy_engine_version: Literal["2.0"] = "2.0"
    profile: ProfileV2Create
    plan: Annotated[LongTermPlanDTO | ShortTermPlanDTO, Field(discriminator="path")]
    profile_warning: str | None = None
