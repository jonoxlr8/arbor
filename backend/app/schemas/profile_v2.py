"""Explicit v2 onboarding boundary; no legacy request reinterpretation."""
from typing import Annotated, Literal
from pydantic import Field, StringConstraints, model_validator

from app.schemas.validation import Money, Goal
from app.services.strategy_v2 import DomainModel, StrategyType, RoleWeight, SavedPreferences
from app.services.preferences_v2 import PreferenceResult
from app.services.readiness_v2 import EmergencySavings, HighInterestDebt, ReadinessResult
from app.services.strategy_selection_v2 import HorizonBucket, RiskResponse, StrategySelectionResult


class ProfileV2Answers(DomainModel):
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


class ProfileV2Data(ProfileV2Answers):
    saved_preferences: SavedPreferences = Field(default_factory=SavedPreferences)
    selected_approach: StrategyType | Literal["short_term"] | None = None


class ProfileV2Create(ProfileV2Data):
    @model_validator(mode="after")
    def selected_path(self):
        if self.selected_approach is not None:
            if (self.horizon == HorizonBucket.LESS_THAN_3_YEARS) != (self.selected_approach == "short_term"):
                raise ValueError("The selected approach must match the planning path")
        return self


class PlanDTO(DomainModel):
    plan_basis: Literal["historical_assessment", "user_selected"] = "historical_assessment"
    strategy_engine_version: Literal["2.0"] = "2.0"
    selection: StrategySelectionResult
    readiness: ReadinessResult
    inflation_pct: float
    preference_result: PreferenceResult
    dormant_selected_approach: StrategyType | None = None
    historical_allocation_preserved: bool = False


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


PlanResponse = Annotated[LongTermPlanDTO | ShortTermPlanDTO, Field(discriminator="path")]


class ProfilePlanState(DomainModel):
    """Server-only saved metadata. Never accepted as editable request fields."""
    historical_plan: PlanResponse | None = None
    revision_nonce: str


class ProfileV2Edit(DomainModel):
    inputs: ProfileV2Answers
    # Null means retain the saved choice/snapshot, not choose from assessment.
    proposed_approach: StrategyType | Literal["short_term"] | None = None
    expected_revision: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class ProfileV2Response(DomainModel):
    strategy_engine_version: Literal["2.0"] = "2.0"
    profile: ProfileV2Data
    plan: PlanResponse
    historical_plan: PlanResponse | None = None
    revision: str | None = None
    profile_warning: str | None = None
