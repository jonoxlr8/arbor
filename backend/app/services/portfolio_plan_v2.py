"""Base strategy presentation only; no legacy integration or effective target.

Nested selection and readiness results retain their canonical semantic fields.
Readiness permissions are gates, not an implementation/contribution instruction.
"""
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, computed_field, model_validator

from app.services.readiness_v2 import (
    EmergencySavings, HighInterestDebt, ReadinessResult, evaluate_readiness,
)
from app.services.strategy_selection_v2 import (
    HorizonBucket, RiskResponse, StrategySelectionResult, select_strategy,
)
from app.services.strategy_v2 import (
    Allocation, DomainModel, INFLATION_ANNUAL_RATE, STRATEGY_ENGINE_VERSION,
    StrategyEngineVersion, StrategyType, get_base_strategy,
)


class BasePortfolioPlan(DomainModel):
    strategy_engine_version: StrategyEngineVersion = STRATEGY_ENGINE_VERSION
    selection: StrategySelectionResult
    readiness: ReadinessResult

    @computed_field
    @property
    def inflation_annual_rate(self) -> Decimal:
        return INFLATION_ANNUAL_RATE


class LongTermPortfolioPlan(BasePortfolioPlan):
    path: Literal["long_term"] = "long_term"

    @model_validator(mode="after")
    def require_long_term_selection(self):
        if self.selection.is_short_term:
            raise ValueError("A long-term plan requires a long-term strategy selection")
        return self

    @computed_field
    @property
    def selected_strategy(self) -> StrategyType:
        strategy = self.selection.selected_strategy
        assert strategy is not None  # Guaranteed by the path validator.
        return strategy

    @computed_field
    @property
    def base_allocation(self) -> Allocation:
        return get_base_strategy(self.selected_strategy).allocation

    @computed_field
    @property
    def planning_annual_rate(self) -> Decimal:
        return get_base_strategy(self.selected_strategy).planning_annual_rate


class ShortTermPortfolioPlan(BasePortfolioPlan):
    path: Literal["short_term"] = "short_term"
    selected_strategy: None = None
    base_allocation: None = None
    planning_annual_rate: None = None

    @model_validator(mode="after")
    def require_short_term_selection(self):
        if not self.selection.is_short_term:
            raise ValueError("A short-term plan requires a short-term strategy selection")
        return self


PortfolioPlan = Annotated[
    LongTermPortfolioPlan | ShortTermPortfolioPlan, Field(discriminator="path")
]


def build_portfolio_plan(
    risk_response: RiskResponse,
    horizon: HorizonBucket,
    emergency_savings: EmergencySavings,
    high_interest_debt: HighInterestDebt,
) -> PortfolioPlan:
    """Compose canonical services, without duplicating their decision rules.

    A short-term plan may carry readiness eligibility, but has no long-term
    strategy to act on. Consumers must inspect path as well as permissions.
    """
    selection = select_strategy(risk_response, horizon)
    readiness = evaluate_readiness(emergency_savings, high_interest_debt)
    plan_type = ShortTermPortfolioPlan if selection.is_short_term else LongTermPortfolioPlan
    return plan_type(selection=selection, readiness=readiness)
