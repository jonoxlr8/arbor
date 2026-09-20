"""Canonical Engine 2.0 domain. Not used by legacy profiles.

Allocation weights are whole percentage points; annual assumptions are basis
points (400 = 4%). These are nominal annual effective planning returns, not
forecasts. Future monthly projections must use (1 + annual_rate)**(1/12) - 1,
NOT the legacy projection engine's annual_rate / 12 convention.
"""
from decimal import Decimal
from enum import Enum
from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


StrategyEngineVersion = Literal["2.0"]
STRATEGY_ENGINE_VERSION: StrategyEngineVersion = "2.0"
INFLATION_ANNUAL_RATE = Decimal("0.03")
PercentagePoints = Annotated[int, Field(strict=True, ge=0, le=100)]


class StrategyType(str, Enum):
    CONSERVATIVE = "Conservative"
    BALANCED = "Balanced"
    GROWTH = "Growth"
    AGGRESSIVE = "Aggressive"


class ReadinessState(str, Enum):
    READY = "ready"
    GETTING_READY = "getting_ready"
    FOUNDATION_FIRST = "foundation_first"


class AssetRole(str, Enum):
    GLOBAL_EQUITY = "global_equity"
    DEFENSIVE = "defensive"
    TECHNOLOGY_TILT = "technology_tilt"
    CRYPTO = "crypto"


class DomainModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class SavedPreferences(DomainModel):
    # Requested whole percentage points, not permissions or effective weights.
    # Individual requests may exceed eligibility; never silently rewrite intent.
    technology_tilt: PercentagePoints = 0
    bitcoin: PercentagePoints = 0


class RoleWeight(DomainModel):
    role: AssetRole
    percentage_points: PercentagePoints


class Allocation(DomainModel):
    weights: tuple[RoleWeight, ...]

    @model_validator(mode="after")
    def validate_weights(self):
        roles = [weight.role for weight in self.weights]
        if len(set(roles)) != len(roles):
            raise ValueError("Asset roles must be unique")
        if not {AssetRole.GLOBAL_EQUITY, AssetRole.DEFENSIVE}.issubset(roles):
            raise ValueError("Global equity and defensive weights must be explicit, even at zero")
        if sum(weight.percentage_points for weight in self.weights) != 100:
            raise ValueError("Allocation must total exactly 100 percentage points")
        return self

    def weight(self, role: AssetRole) -> int:
        role = AssetRole(role)
        return next((item.percentage_points for item in self.weights if item.role == role), 0)


class BaseStrategyDefinition(DomainModel):
    strategy_engine_version: StrategyEngineVersion = STRATEGY_ENGINE_VERSION
    strategy: StrategyType
    allocation: Allocation
    planning_return_basis_points: Annotated[int, Field(strict=True, ge=0)]

    @model_validator(mode="after")
    def core_roles_only(self):
        if any(item.role not in {AssetRole.GLOBAL_EQUITY, AssetRole.DEFENSIVE}
               for item in self.allocation.weights):
            raise ValueError("Base strategies contain only global equity and defensive roles")
        return self

    @property
    def planning_annual_rate(self) -> Decimal:
        return Decimal(self.planning_return_basis_points) / Decimal(10_000)


def _definition(strategy: StrategyType, equity: int, defensive: int, return_bps: int):
    return BaseStrategyDefinition(
        strategy=strategy,
        allocation=Allocation(weights=(
            RoleWeight(role=AssetRole.GLOBAL_EQUITY, percentage_points=equity),
            RoleWeight(role=AssetRole.DEFENSIVE, percentage_points=defensive),
        )),
        planning_return_basis_points=return_bps,
    )


# The only source of v2 base allocations and strategy planning returns.
_BASE_STRATEGIES = MappingProxyType({
    StrategyType.CONSERVATIVE: _definition(StrategyType.CONSERVATIVE, 40, 60, 400),
    StrategyType.BALANCED: _definition(StrategyType.BALANCED, 60, 40, 450),
    StrategyType.GROWTH: _definition(StrategyType.GROWTH, 80, 20, 500),
    StrategyType.AGGRESSIVE: _definition(StrategyType.AGGRESSIVE, 100, 0, 550),
})


def get_base_strategy(strategy: StrategyType) -> BaseStrategyDefinition:
    """Return an immutable canonical definition; unknown strategies fail explicitly."""
    return _BASE_STRATEGIES[StrategyType(strategy)]


class EffectiveTargetAllocation(DomainModel):
    """Output contract for the satellite allocator, NOT evidence of actionability.

    Preferences are deliberately not accepted here. The preference policy layer must
    resolve readiness, horizon and preferences before publishing this target.
    """
    strategy_engine_version: StrategyEngineVersion = STRATEGY_ENGINE_VERSION
    base_strategy: StrategyType
    allocation: Allocation

    @model_validator(mode="after")
    def preserve_defensive_allocation(self):
        base = get_base_strategy(self.base_strategy)
        if self.allocation.weight(AssetRole.DEFENSIVE) != base.allocation.weight(AssetRole.DEFENSIVE):
            raise ValueError("Satellites may replace equity only; defensive weight must remain unchanged")
        return self

    @property
    def planning_annual_rate(self) -> Decimal:
        # Cannot be supplied or raised through preference data or target weights.
        return get_base_strategy(self.base_strategy).planning_annual_rate


class ShortTermPath(DomainModel):
    path: Literal["short_term"] = "short_term"
    strategy_engine_version: StrategyEngineVersion = STRATEGY_ENGINE_VERSION


class LongTermPath(DomainModel):
    path: Literal["long_term"] = "long_term"
    strategy_engine_version: StrategyEngineVersion = STRATEGY_ENGINE_VERSION
    base_strategy: StrategyType


# No horizon selection rules yet. A short-term path has no forced strategy/target.
StrategyPath = Annotated[ShortTermPath | LongTermPath, Field(discriminator="path")]
