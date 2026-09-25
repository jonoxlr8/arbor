"""Explicit user choices, separate from historical preference eligibility policy."""
from decimal import Decimal, localcontext
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.services.strategy_v2 import (
    Allocation, AssetRole, DomainModel, EffectiveTargetAllocation, RoleWeight,
    StrategyType, get_base_strategy,
)

Choice = Annotated[int, Field(strict=True, ge=0, le=10)]


class ExplicitCustomization(DomainModel):
    technology_tilt: Choice
    bitcoin: Choice

    @field_validator("technology_tilt", "bitcoin")
    @classmethod
    def supported_choice(cls, value):
        if value not in (0, 5, 10):
            raise ValueError("Choose None, 5% or 10%")
        return value

    @model_validator(mode="after")
    def combined_limit(self):
        if self.technology_tilt + self.bitcoin > 20:
            raise ValueError("Technology and Bitcoin together cannot exceed 20%")
        return self


class PlanCustomization(ExplicitCustomization):
    # Added by the backend, never accepted in the editable choice payload.
    provenance: Literal["user_selected"] = "user_selected"


def customize_allocation(base: Allocation, choices: ExplicitCustomization) -> Allocation:
    """Replace Global Equity only, without changing core models or return assumptions."""
    # Revalidate even if an internal caller used model_construct().
    choices = ExplicitCustomization.model_validate(choices.model_dump())
    with localcontext() as context:
        context.prec = 28
        tech, bitcoin = Decimal(choices.technology_tilt), Decimal(choices.bitcoin)
        equity = Decimal(base.weight(AssetRole.GLOBAL_EQUITY)) - tech - bitcoin
        if equity < 0:
            raise ValueError("These choices exceed the available Global Equity allocation")
        weights = {weight.role: weight.percentage_points for weight in base.weights}
        weights.update({AssetRole.GLOBAL_EQUITY: int(equity),
                        AssetRole.TECHNOLOGY_TILT: int(tech), AssetRole.CRYPTO: int(bitcoin)})
        return Allocation(weights=tuple(RoleWeight(role=role, percentage_points=weights.get(role, 0))
            for role in (AssetRole.GLOBAL_EQUITY, AssetRole.DEFENSIVE,
                         AssetRole.TECHNOLOGY_TILT, AssetRole.CRYPTO)))


def explicit_target(strategy: StrategyType, choices: ExplicitCustomization) -> EffectiveTargetAllocation:
    base = get_base_strategy(strategy)
    return EffectiveTargetAllocation(base_strategy=base.strategy,
        allocation=customize_allocation(base.allocation, choices))


def canonical_target(plan: dict) -> Allocation | None:
    """The single backend target reader; older saved plans retain their original meaning."""
    if plan["path"] == "short_term":
        return None
    final = plan.get("final_allocation")
    if final is not None:
        customization = plan.get("customization")
        if plan["plan_basis"] != "user_selected" or not isinstance(customization, dict):
            raise ValueError("A final customized allocation requires explicit user provenance")
        choices = PlanCustomization.model_validate(customization)
        expected = explicit_target(plan["selected_strategy"], ExplicitCustomization(
            technology_tilt=choices.technology_tilt, bitcoin=choices.bitcoin)).allocation
        if Allocation.model_validate({"weights": final}) != expected:
            raise ValueError("Final allocation does not match the explicit choices")
        weights = final
    elif plan["plan_basis"] == "user_selected":
        weights = plan["base_allocation"]
    else:
        weights = plan["preference_result"]["effective_target"]["allocation"]["weights"]
    return Allocation.model_validate({"weights": weights})
