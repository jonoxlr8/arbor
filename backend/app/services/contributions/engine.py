"""One next contribution, selected by post-contribution value deficit."""

from decimal import Decimal, localcontext

from app.services.implementation.mapper import map_effective_target
from app.services.implementation.models import ImplementationProduct
from app.services.strategy_v2 import AssetRole
from .models import (
    ContributionRecommendation,
    ContributionRequest,
    MinimumInputs,
    MinimumCheck,
    SleeveCalculation,
)

TIE_PRIORITY = (
    AssetRole.GLOBAL_EQUITY,
    AssetRole.DEFENSIVE,
    AssetRole.TECHNOLOGY_TILT,
    AssetRole.CRYPTO,
)

GOTRADE_PRACTICAL_MINIMUM_PHP = Decimal("100")


def _check_minimum(
    product: ImplementationProduct, request: MinimumInputs
) -> MinimumCheck:
    additional = product.product_id in request.current_portfolio.owned_product_ids
    purchase = "additional" if additional else "initial"
    value, currency, kind = None, None, "unknown"
    reason = "dynamic_minimum"
    if additional and product.minimum_initial is not None:
        kind, currency = "additional", product.currency
        if product.minimum_additional_status == "published":
            value = product.minimum_additional
        reason = "additional_unknown"
    elif not additional and product.minimum_initial is not None:
        value, currency, kind = product.minimum_initial, product.currency, "initial"
    elif product.minimum_order is not None:
        value, currency, kind = (
            product.minimum_order,
            product.minimum_order_currency,
            "order",
        )
    elif product.minimum_order_quantity is not None:
        return MinimumCheck(
            purchase_type=purchase,
            kind="quantity",
            applicable_minimum=product.minimum_order_quantity,
            minimum_currency=product.minimum_order_currency,
            status="verify_minimum",
            reason="quantity_minimum",
        )

    common = dict(
        purchase_type=purchase,
        kind=kind,
        applicable_minimum=value,
        minimum_currency=currency,
    )
    if value is None:
        return MinimumCheck(**common, status="verify_minimum", reason=reason)
    if (
        product.route_id == "gotrade"
        and kind == "order"
        and value == Decimal("1")
        and currency == "USD"
        and request.contribution_currency == "PHP"
    ):
        practical_minimum = GOTRADE_PRACTICAL_MINIMUM_PHP
        needed = max(Decimal(0), practical_minimum - request.contribution_amount)
        return MinimumCheck(
            purchase_type=purchase,
            kind="order",
            applicable_minimum=practical_minimum,
            minimum_currency="PHP",
            status="below_minimum" if needed else "ready",
            amount_needed_to_minimum=needed,
            reason="below_minimum" if needed else "minimum_met",
        )
    if currency != request.contribution_currency:
        return MinimumCheck(
            **common, status="verify_minimum", reason="currency_mismatch"
        )
    needed = max(Decimal(0), value - request.contribution_amount)
    return MinimumCheck(
        **common,
        status="below_minimum" if needed else "ready",
        amount_needed_to_minimum=needed,
        reason="below_minimum" if needed else "minimum_met"
    )


def contribution_precision(request: MinimumInputs) -> int:
    """Shared local precision for the single-purchase and monthly planners."""
    amounts = [request.contribution_amount] + [
        request.current_portfolio.value(role) for role in TIE_PRIORITY
    ]
    return max(
        28,
        max(value.adjusted() for value in amounts)
        - min(value.as_tuple().exponent for value in amounts)
        + 10,
    )


def check_allocation_minimum(
    product: ImplementationProduct, request: MinimumInputs, amount: Decimal
) -> MinimumCheck:
    """Apply unchanged 3Q-A minimum rules to one proposed product amount."""
    return _check_minimum(
        product, request.model_copy(update={"contribution_amount": amount})
    )


def calculate_sleeve_gaps(portfolio, target, contribution_amount):
    """Shared canonical post-contribution deficits, independent of implementation.

    The caller establishes local Decimal precision. Zero-target sleeves do not
    receive new money but their current values remain part of the total.
    """
    total = sum((portfolio.value(role) for role in TIE_PRIORITY), Decimal(0))
    after = total + contribution_amount
    calculations = []
    for role in TIE_PRIORITY:
        weight = target.weight(role)
        if weight <= 0:
            continue
        current = portfolio.value(role)
        target_value = after * weight / Decimal(100)
        calculations.append(SleeveCalculation(
            sleeve=role, target_percentage_points=weight, current_value=current,
            current_percentage=current * 100 / total if total else None,
            target_value_after_contribution=target_value, deficit=target_value - current,
        ))
    return tuple(calculations)


def ordered_positive_gaps(calculations):
    return sorted((row for row in calculations if row.deficit > 0),
                  key=lambda row: (-row.deficit, TIE_PRIORITY.index(row.sleeve)))


def fill_sleeve_gaps(calculations, contribution_amount):
    """Existing largest-deficit-first fill, before provider minimum classification.

    Each sleeve retains its candidate even if a selected product cannot currently
    accept that amount. Choosing a different provider cannot change this fill.
    """
    remaining = contribution_amount
    candidates = {}
    for calculation in ordered_positive_gaps(calculations):
        candidate = candidate_for_gap(remaining, calculation)
        candidates[calculation.sleeve] = candidate
        remaining -= candidate
    return candidates, remaining


def candidate_for_gap(remaining, calculation):
    """One shared fill step for legacy route and explicit-choice monthly paths."""
    return min(remaining, calculation.deficit)


def recommend_next_contribution(
    request: ContributionRequest,
) -> ContributionRecommendation:
    """Validate, map using 3P, then select without changing upstream allocations.

    Decimal precision is local and sized from the input span so finite monetary
    sums and percentage multiplication remain exact. Repeating current percentages
    are informational only and never enter selection.
    """
    request = ContributionRequest.model_validate(request)
    with localcontext() as arithmetic:
        arithmetic.prec = contribution_precision(request)
        return _recommend(request)


def _recommend(request: ContributionRequest) -> ContributionRecommendation:
    context = request.context
    mapping = map_effective_target(
        context.route_id,
        context.effective_target_allocation,
        context.readiness,
        path=context.path,
        ibkr_crypto_eligible=context.ibkr_crypto_eligible,
        selection_mode=context.selection_mode,
        bitcoin_provider=context.bitcoin_provider,
    )
    portfolio = request.current_portfolio
    total = sum((portfolio.value(role) for role in TIE_PRIORITY), Decimal(0))
    after = total + request.contribution_amount
    common = dict(
        contribution_amount=request.contribution_amount,
        contribution_currency=request.contribution_currency,
        route_id=context.route_id,
        readiness=context.readiness,
        path=context.path,
        state=mapping.state,
        current_portfolio_value=total,
        post_contribution_portfolio_value=after,
    )
    if request.contribution_amount == 0:
        return ContributionRecommendation(
            **common,
            action="no_action",
            recommended_amount=0,
            execution_status="not_applicable",
            reason="zero_contribution"
        )
    if context.path == "short_term":
        return ContributionRecommendation(
            **common,
            action="no_action",
            recommended_amount=0,
            execution_status="not_applicable",
            reason="short_term_path",
            warnings=mapping.warnings
        )
    if not context.readiness.actionable_contribution_guidance_allowed:
        return ContributionRecommendation(
            **common,
            action="reserve",
            recommended_amount=request.contribution_amount,
            execution_status="preview",
            reason="foundation_reserve",
            warnings=mapping.warnings
        )

    mapped = {item.sleeve: item for item in mapping.implementations}
    calculations = calculate_sleeve_gaps(portfolio, context.effective_target_allocation.allocation,
                                         request.contribution_amount)
    candidates = [
        calc
        for calc in calculations
        if calc.deficit > 0
        and mapped[calc.sleeve].actionable
        and mapped[calc.sleeve].product.available_in_ph is not False
    ]
    if not candidates:
        return ContributionRecommendation(
            **common,
            action="no_action",
            recommended_amount=0,
            execution_status="not_applicable",
            reason="no_eligible_deficit",
            calculations=tuple(calculations)
        )
    # max keeps the first exact tie, in the explicit core-before-satellite order.
    selected = max(candidates, key=lambda calc: calc.deficit)
    item = mapped[selected.sleeve]
    minimum = _check_minimum(item.product, request)
    warnings = list(item.warnings)
    if context.readiness.message_requirement != "none":
        warnings.append("Readiness caution applies to this contribution.")
    if minimum.status == "verify_minimum":
        warnings.append(
            "Verify the applicable minimum and eligibility in-app; no FX or price conversion is assumed."
        )
    ready = minimum.status == "ready"
    return ContributionRecommendation(
        **common,
        action="invest" if ready else "wait",
        recommended_amount=request.contribution_amount if ready else Decimal(0),
        execution_status=minimum.status,
        reason="greatest_deficit" if ready else minimum.status,
        selected=item,
        selected_calculation=selected,
        minimum=minimum,
        calculations=tuple(calculations),
        warnings=tuple(warnings)
    )
