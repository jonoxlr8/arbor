"""Additive contribution transport contracts; no financial calculations."""
from datetime import date
from decimal import Decimal
from typing import Literal

from app.services.contributions.models import ContributionRequest, ContributionRecommendation
from app.services.contributions.plan_models import ContributionAllocation, ContributionPlan
from app.services.implementation.models import MappedSleeve, MatchQuality
from app.services.strategy_v2 import AssetRole, DomainModel


class ContributionAPIRequest(ContributionRequest):
    """Explicit hypothetical inputs, not proof of the user's saved profile/holdings."""

    def to_domain(self) -> ContributionRequest:
        return ContributionRequest.model_validate(self.model_dump())


class ContributionProductResponse(DomainModel):
    product_id: str
    display_name: str
    provider: str
    platform: str
    sleeve: AssetRole
    match_quality: MatchQuality
    currency: str | None
    minimum_initial: Decimal | None
    minimum_additional: Decimal | None
    minimum_additional_status: Literal["published", "verify_in_app", "unknown"]
    minimum_order: Decimal | None
    minimum_order_quantity: Decimal | None
    minimum_order_currency: str | None
    practical_minimum: Decimal | None
    supports_fractional: bool | None
    available_in_ph: bool | None
    eligibility_notes: tuple[str, ...]
    last_verified_at: date | None


class ContributionImplementationResponse(MappedSleeve):
    product: ContributionProductResponse


class ContributionRecommendationResponse(ContributionRecommendation):
    selected: ContributionImplementationResponse | None = None


class ContributionAllocationResponse(ContributionAllocation):
    implementation: ContributionImplementationResponse


class ContributionPlanResponse(ContributionPlan):
    allocations: tuple[ContributionAllocationResponse, ...] = ()
    blocked_allocations: tuple[ContributionAllocationResponse, ...] = ()


def _implementation(item: MappedSleeve) -> ContributionImplementationResponse:
    # Explicit allow-list: new internal catalog metadata is never exposed automatically.
    product = ContributionProductResponse(**{
        field: getattr(item.product, field) for field in ContributionProductResponse.model_fields
    })
    return ContributionImplementationResponse(**item.model_dump(exclude={"product"}), product=product)


def recommendation_response(result: ContributionRecommendation) -> ContributionRecommendationResponse:
    return ContributionRecommendationResponse(**result.model_dump(exclude={"selected"}),
        selected=_implementation(result.selected) if result.selected is not None else None)


def _allocation(row: ContributionAllocation) -> ContributionAllocationResponse:
    return ContributionAllocationResponse(**row.model_dump(exclude={"implementation"}),
        implementation=_implementation(row.implementation))


def plan_response(result: ContributionPlan) -> ContributionPlanResponse:
    return ContributionPlanResponse(**result.model_dump(exclude={"allocations", "blocked_allocations"}),
        allocations=tuple(_allocation(row) for row in result.allocations),
        blocked_allocations=tuple(_allocation(row) for row in result.blocked_allocations))
