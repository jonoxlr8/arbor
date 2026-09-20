"""Isolated v2 risk/horizon selection. Readiness is evaluated independently."""
from enum import Enum
from types import MappingProxyType

from pydantic import computed_field

from app.services.strategy_v2 import (
    AssetRole, DomainModel, LongTermPath, ShortTermPath, StrategyPath,
    StrategyType, get_base_strategy,
)


class RiskResponse(str, Enum):
    SELL_ALL = "sell_all"
    SELL_SOME = "sell_some"
    HOLD = "hold"
    CONTINUE_INVESTING = "continue_investing"
    INVEST_MORE = "invest_more"


class HorizonBucket(str, Enum):
    LESS_THAN_3_YEARS = "less_than_3_years"
    THREE_TO_FIVE_YEARS = "three_to_five_years"
    FIVE_TO_TEN_YEARS = "five_to_ten_years"
    TEN_PLUS_YEARS = "ten_plus_years"


class SelectionReason(str, Enum):
    SHORT_TERM_PATH = "short_term_path"
    HORIZON_CAPPED = "horizon_capped"
    REQUESTED_STRATEGY_RETAINED = "requested_strategy_retained"


class StrategySelectionInputs(DomainModel):
    risk_response: RiskResponse
    horizon: HorizonBucket


class StrategySelectionResult(StrategySelectionInputs):
    requested_strategy: StrategyType
    horizon_maximum_strategy: StrategyType | None
    strategy_path: StrategyPath

    @computed_field
    @property
    def selected_strategy(self) -> StrategyType | None:
        if isinstance(self.strategy_path, LongTermPath):
            return self.strategy_path.base_strategy
        return None

    @computed_field
    @property
    def is_short_term(self) -> bool:
        return isinstance(self.strategy_path, ShortTermPath)

    @computed_field
    @property
    def cap_applied(self) -> bool:
        # Short term is a different path, not a reduction to a long-term tier.
        return not self.is_short_term and self.selected_strategy != self.requested_strategy

    @computed_field
    @property
    def reason(self) -> SelectionReason:
        if self.is_short_term:
            return SelectionReason.SHORT_TERM_PATH
        if self.cap_applied:
            return SelectionReason.HORIZON_CAPPED
        return SelectionReason.REQUESTED_STRATEGY_RETAINED


_REQUESTED_STRATEGIES = MappingProxyType({
    RiskResponse.SELL_ALL: StrategyType.CONSERVATIVE,
    RiskResponse.SELL_SOME: StrategyType.BALANCED,
    RiskResponse.HOLD: StrategyType.GROWTH,
    RiskResponse.CONTINUE_INVESTING: StrategyType.AGGRESSIVE,
    RiskResponse.INVEST_MORE: StrategyType.AGGRESSIVE,
})
_HORIZON_MAXIMUMS = MappingProxyType({
    HorizonBucket.LESS_THAN_3_YEARS: None,
    HorizonBucket.THREE_TO_FIVE_YEARS: StrategyType.BALANCED,
    HorizonBucket.FIVE_TO_TEN_YEARS: StrategyType.GROWTH,
    HorizonBucket.TEN_PLUS_YEARS: StrategyType.AGGRESSIVE,
})


def _equity_weight(strategy: StrategyType) -> int:
    # Risk order comes from the canonical stock/defensive mix, not enum ordering,
    # planning returns, personal ticker preferences or a second ranking table.
    return get_base_strategy(strategy).allocation.weight(AssetRole.GLOBAL_EQUITY)


def select_strategy(risk_response: RiskResponse, horizon: HorizonBucket) -> StrategySelectionResult:
    """Validate both answers, then retain or reduce requested long-term risk.

    Buckets are explicit inputs; numeric boundary classification is not inferred.
    Short-term results retain risk intent for explanation but have no long-term
    maximum, selected strategy, portfolio or projection assumption.
    """
    inputs = StrategySelectionInputs(risk_response=risk_response, horizon=horizon)
    requested = _REQUESTED_STRATEGIES[inputs.risk_response]
    maximum = _HORIZON_MAXIMUMS[inputs.horizon]
    if maximum is None:
        path = ShortTermPath()
    else:
        selected = min((requested, maximum), key=_equity_weight)
        path = LongTermPath(base_strategy=selected)
    return StrategySelectionResult(
        risk_response=inputs.risk_response,
        horizon=inputs.horizon,
        requested_strategy=requested,
        horizon_maximum_strategy=maximum,
        strategy_path=path,
    )
