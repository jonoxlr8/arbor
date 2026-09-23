"""Allowlisted, in-memory context from get_my_profile, never from the chat body.

No current holdings, scenario inputs, or implementation choices are persisted
for V2. Their absence must not be filled from planning assumptions or targets.
"""
from dataclasses import dataclass
from decimal import Decimal

from app.services.strategy_v2 import Allocation, AssetRole, ReadinessState, StrategyType


@dataclass(frozen=True)
class V2ChatContext:
    plan_basis: str
    path: str
    approach: StrategyType | None
    assessment: StrategyType
    horizon_assessment: StrategyType | None
    horizon: str
    cap_applied: bool
    readiness: ReadinessState
    contributions_allowed: bool
    target: Allocation | None
    planning_return_pct: Decimal | None
    inflation_pct: Decimal
    currency: str
    goal: Decimal | None
    starting_assumption: Decimal
    monthly_assumption: Decimal
    historical_requests: tuple[int, int]
    historical_effective: tuple[int, int] | None
    dormant_approach: StrategyType | None = None
    historical_preserved: bool = False


def build_v2_context(saved: dict) -> V2ChatContext:
    """Consume the canonical response, not raw DB rows or client-supplied plans."""
    if saved.get("strategy_engine_version") != "2.0":
        raise ValueError("Unsupported plan version")
    plan, profile = saved["plan"], saved["profile"]
    basis, path = plan["plan_basis"], plan["path"]
    if basis not in {"user_selected", "historical_assessment"} or path not in {"long_term", "short_term"}:
        raise ValueError("Invalid plan context")
    approach = StrategyType(plan["selected_strategy"]) if path == "long_term" else None
    dormant = StrategyType(plan["dormant_selected_approach"]) if plan.get("dormant_selected_approach") else None
    if basis == "user_selected" and profile.get("selected_approach") != (approach or dormant or "short_term"):
        raise ValueError("Inconsistent selected plan")
    target = None
    preferences = plan["preference_result"]
    if path == "long_term":
        # Explicit model choice is authoritative; historical requests cannot override it.
        weights = (plan["base_allocation"] if basis == "user_selected" else
                   preferences["effective_target"]["allocation"]["weights"])
        target = Allocation.model_validate({"weights": weights})
    elif plan["selected_strategy"] is not None or plan["planning_return_pct"] is not None:
        raise ValueError("Inconsistent short-term plan")
    requests = profile.get("saved_preferences", {})
    return V2ChatContext(
        plan_basis=basis, path=path, approach=approach,
        assessment=StrategyType(plan["selection"]["requested_strategy"]),
        horizon_assessment=StrategyType(plan["selection"]["selected_strategy"]) if plan["selection"]["selected_strategy"] else None,
        horizon=plan["selection"]["horizon"], cap_applied=plan["selection"]["cap_applied"],
        readiness=ReadinessState(plan["readiness"]["readiness"]),
        contributions_allowed=plan["readiness"]["actionable_contribution_guidance_allowed"],
        target=target, planning_return_pct=Decimal(str(plan["planning_return_pct"])) if path == "long_term" else None,
        inflation_pct=Decimal(str(plan["inflation_pct"])), currency=profile["currency"],
        goal=Decimal(str(profile["goal_target"])) if profile["goal_target"] is not None else None,
        starting_assumption=Decimal(str(profile["current_portfolio_value"])),
        monthly_assumption=Decimal(str(profile["monthly_investment"])),
        historical_requests=(requests.get("technology_tilt", 0), requests.get("bitcoin", 0)),
        historical_effective=(target.weight(AssetRole.TECHNOLOGY_TILT), target.weight(AssetRole.CRYPTO))
        if basis == "historical_assessment" and target else None,
        dormant_approach=dormant, historical_preserved=plan.get("historical_allocation_preserved", False),
    )
