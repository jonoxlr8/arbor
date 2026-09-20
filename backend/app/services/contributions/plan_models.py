"""Full-contribution outputs; monetary buckets reconcile independently of context precision."""
from decimal import Decimal
from fractions import Fraction
from typing import Literal

from pydantic import model_validator

from app.schemas.currency import Currency
from app.services.implementation.models import MappedSleeve, MappingState, NonNegative, RouteId
from app.services.readiness_v2 import ReadinessResult
from app.services.strategy_v2 import DomainModel
from .models import MinimumCheck, SleeveCalculation


class ContributionAllocation(DomainModel):
    implementation: MappedSleeve
    calculation: SleeveCalculation
    candidate_amount: NonNegative
    allocated_amount: NonNegative
    minimum: MinimumCheck
    allocation_stage: Literal["deficit_fill", "residual"]
    reason: Literal["deficit_fill", "target_weight_residual", "below_minimum"]

    @model_validator(mode="after")
    def validate_amount(self):
        if self.implementation.sleeve != self.calculation.sleeve:
            raise ValueError("Allocation sleeve must match calculation")
        if self.minimum.status == "below_minimum":
            if self.allocated_amount != 0:
                raise ValueError("Blocked candidates cannot allocate money")
        elif self.allocated_amount <= 0 or self.allocated_amount != self.candidate_amount:
            raise ValueError("Planned allocations must retain their positive candidate amount")
        return self


class ContributionPlan(DomainModel):
    contribution_amount: NonNegative
    contribution_currency: Currency
    route_id: RouteId
    readiness: ReadinessResult
    path: Literal["long_term", "short_term"]
    state: MappingState
    status: Literal["invest", "partial", "reserve", "wait", "no_action"]
    reason: Literal["deficit_plan", "foundation_reserve", "short_term_path", "zero_contribution", "no_eligible_deficit"]
    current_portfolio_value: NonNegative
    post_contribution_portfolio_value: NonNegative
    allocations: tuple[ContributionAllocation, ...] = ()
    blocked_allocations: tuple[ContributionAllocation, ...] = ()
    # Planned executable amount, not evidence of a completed trade.
    invested_amount: NonNegative = Decimal(0)
    verify_minimum_amount: NonNegative = Decimal(0)
    unallocated_amount: NonNegative = Decimal(0)
    reserve_amount: NonNegative = Decimal(0)
    calculations: tuple[SleeveCalculation, ...] = ()
    warnings: tuple[str, ...] = ()

    @model_validator(mode="after")
    def reconcile(self):
        # Fraction checks exact Decimal values, even under a caller's low precision.
        def exact_sum(values):
            return sum((Fraction(value) for value in values), Fraction(0))
        if exact_sum((self.invested_amount, self.verify_minimum_amount,
                      self.unallocated_amount, self.reserve_amount)) != Fraction(self.contribution_amount):
            raise ValueError("Contribution buckets must reconcile exactly")
        for status, total in (("ready", self.invested_amount), ("verify_minimum", self.verify_minimum_amount)):
            if exact_sum(item.allocated_amount for item in self.allocations if item.minimum.status == status) != Fraction(total):
                raise ValueError("Allocation totals must match their execution bucket")
        if any(item.minimum.status == "below_minimum" for item in self.allocations):
            raise ValueError("Blocked candidates belong in blocked_allocations")
        if any(item.minimum.status != "below_minimum" for item in self.blocked_allocations):
            raise ValueError("Only blocked candidates belong in blocked_allocations")
        return self
