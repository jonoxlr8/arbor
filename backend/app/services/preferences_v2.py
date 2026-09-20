"""Deterministic satellites: consume equity only, without selecting a strategy."""
from enum import Enum
from types import MappingProxyType

from app.services.readiness_v2 import ReadinessResult
from app.services.strategy_v2 import (
    Allocation, AssetRole, DomainModel, EffectiveTargetAllocation, PercentagePoints,
    RoleWeight, SavedPreferences, StrategyType, get_base_strategy,
)


class SatelliteCaps(DomainModel):
    technology_tilt: PercentagePoints
    bitcoin: PercentagePoints


_CAPS = MappingProxyType({
    StrategyType.CONSERVATIVE: SatelliteCaps(technology_tilt=0, bitcoin=0),
    StrategyType.BALANCED: SatelliteCaps(technology_tilt=5, bitcoin=5),
    StrategyType.GROWTH: SatelliteCaps(technology_tilt=10, bitcoin=5),
    StrategyType.AGGRESSIVE: SatelliteCaps(technology_tilt=10, bitcoin=10),
})


def get_satellite_caps(strategy: StrategyType) -> SatelliteCaps:
    return _CAPS[StrategyType(strategy)]


class PreferenceReason(str, Enum):
    STRATEGY_CAP = "strategy_cap"
    READINESS_RESTRICTED = "readiness_restricted"
    SHORT_TERM_PATH = "short_term_path"


class PreferenceApplication(DomainModel):
    requested_percentage_points: PercentagePoints
    effective_percentage_points: PercentagePoints
    strategy_cap_percentage_points: PercentagePoints | None
    reasons: tuple[PreferenceReason, ...] = ()


class PreferenceResult(DomainModel):
    technology_tilt: PreferenceApplication
    bitcoin: PreferenceApplication
    effective_target: EffectiveTargetAllocation | None


def apply_preferences(
    selected_strategy: StrategyType | None,
    readiness: ReadinessResult,
    preferences: SavedPreferences,
) -> PreferenceResult:
    """Use final, horizon-capped strategy and canonical readiness permissions.

    None means the distinct short-term path, not Conservative. Caps cannot
    exhaust equity under the locked policy; fail rather than invent a priority
    if a future policy changes that invariant.
    """
    if selected_strategy is None:
        def unavailable(request):
            return PreferenceApplication(requested_percentage_points=request,
                effective_percentage_points=0, strategy_cap_percentage_points=None,
                reasons=(PreferenceReason.SHORT_TERM_PATH,) if request else ())
        return PreferenceResult(technology_tilt=unavailable(preferences.technology_tilt),
                                bitcoin=unavailable(preferences.bitcoin), effective_target=None)

    base = get_base_strategy(selected_strategy)
    caps = get_satellite_caps(base.strategy)

    def apply(request, cap, eligible):
        reasons = []
        if request > cap:
            reasons.append(PreferenceReason.STRATEGY_CAP)
        if request and not eligible:
            reasons.append(PreferenceReason.READINESS_RESTRICTED)
        return PreferenceApplication(requested_percentage_points=request,
            effective_percentage_points=min(request, cap) if eligible else 0,
            strategy_cap_percentage_points=cap, reasons=tuple(reasons))

    tech = apply(preferences.technology_tilt, caps.technology_tilt,
                 readiness.technology_satellite_readiness_eligible)
    bitcoin = apply(preferences.bitcoin, caps.bitcoin,
                    readiness.bitcoin_satellite_readiness_eligible)
    satellites = tech.effective_percentage_points + bitcoin.effective_percentage_points
    equity = base.allocation.weight(AssetRole.GLOBAL_EQUITY)
    if satellites > equity:
        raise ValueError("Satellite policy exceeds available global equity")
    target = EffectiveTargetAllocation(base_strategy=base.strategy, allocation=Allocation(weights=(
        RoleWeight(role=AssetRole.GLOBAL_EQUITY, percentage_points=equity - satellites),
        RoleWeight(role=AssetRole.DEFENSIVE, percentage_points=base.allocation.weight(AssetRole.DEFENSIVE)),
        RoleWeight(role=AssetRole.TECHNOLOGY_TILT, percentage_points=tech.effective_percentage_points),
        RoleWeight(role=AssetRole.CRYPTO, percentage_points=bitcoin.effective_percentage_points),
    )))
    return PreferenceResult(technology_tilt=tech, bitcoin=bitcoin, effective_target=target)
