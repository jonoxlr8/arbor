"""Contribution contracts reuse canonical targets, readiness and implementation models."""
from decimal import Decimal
from typing import Literal

from pydantic import model_validator

from app.schemas.currency import Currency
from app.services.implementation.models import MappedSleeve, MappingInput, MappingState, NonNegative, RouteId
from app.services.implementation.products import PRODUCTS
from app.services.readiness_v2 import ReadinessInputs, ReadinessResult, evaluate_readiness
from app.services.strategy_v2 import AssetRole, DomainModel, PercentagePoints


class CurrentPortfolio(DomainModel):
    """Complete caller-supplied market values, all in one valuation currency.

    All four fields are required: missing holdings are not silently treated as zero.
    Product ownership is explicit; owning a sleeve does not prove owning a new route's fund.
    """
    currency: Currency
    global_equity: NonNegative
    defensive: NonNegative
    technology_tilt: NonNegative
    crypto: NonNegative
    owned_product_ids: frozenset[str]

    @model_validator(mode="after")
    def known_products(self):
        if self.owned_product_ids - PRODUCTS.keys():
            raise ValueError("Unknown implementation product ownership")
        return self

    def value(self, role: AssetRole) -> Decimal:
        return getattr(self, role.value)


class ContributionRequest(DomainModel):
    contribution_amount: NonNegative
    contribution_currency: Currency
    current_portfolio: CurrentPortfolio
    context: MappingInput
    readiness_inputs: ReadinessInputs

    @model_validator(mode="after")
    def consistent_context(self):
        if self.contribution_currency != self.current_portfolio.currency:
            raise ValueError("Contribution and portfolio valuation currencies must match")
        expected = evaluate_readiness(
            self.readiness_inputs.emergency_savings, self.readiness_inputs.high_interest_debt
        )
        if self.context.readiness != expected:
            raise ValueError("Readiness result does not match canonical inputs")
        target = self.context.effective_target_allocation
        if target is not None:
            # Reject contradictory upstream state rather than reallocating or applying caps.
            for role, eligible in (
                (AssetRole.TECHNOLOGY_TILT, expected.technology_satellite_readiness_eligible),
                (AssetRole.CRYPTO, expected.bitcoin_satellite_readiness_eligible),
            ):
                if not eligible and target.allocation.weight(role):
                    raise ValueError("Effective target contradicts readiness eligibility")
        return self


class SleeveCalculation(DomainModel):
    sleeve: AssetRole
    target_percentage_points: PercentagePoints
    current_value: Decimal
    current_percentage: Decimal | None  # Undefined for an empty portfolio.
    target_value_after_contribution: Decimal
    deficit: Decimal


class MinimumCheck(DomainModel):
    purchase_type: Literal["initial", "additional"]
    kind: Literal["initial", "additional", "order", "quantity", "unknown"]
    applicable_minimum: Decimal | None = None
    minimum_currency: str | None = None
    status: Literal["ready", "below_minimum", "verify_minimum"]
    amount_needed_to_minimum: Decimal | None = None
    reason: Literal["minimum_met", "below_minimum", "additional_unknown", "dynamic_minimum", "quantity_minimum", "currency_mismatch"]


class ContributionRecommendation(DomainModel):
    action: Literal["invest", "reserve", "wait", "no_action"]
    contribution_amount: Decimal
    contribution_currency: Currency
    recommended_amount: Decimal
    route_id: RouteId
    readiness: ReadinessResult
    path: Literal["long_term", "short_term"]
    state: MappingState
    execution_status: Literal["ready", "below_minimum", "verify_minimum", "preview", "not_applicable"]
    reason: Literal["greatest_deficit", "foundation_reserve", "short_term_path", "zero_contribution", "no_eligible_deficit", "verify_minimum", "below_minimum"]
    current_portfolio_value: Decimal
    post_contribution_portfolio_value: Decimal
    selected: MappedSleeve | None = None
    selected_calculation: SleeveCalculation | None = None
    minimum: MinimumCheck | None = None
    calculations: tuple[SleeveCalculation, ...] = ()
    warnings: tuple[str, ...] = ()
