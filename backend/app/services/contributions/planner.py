"""Monthly deficit filling. No new strategy, catalog, ownership or readiness rules."""
from decimal import Decimal, localcontext

from app.services.implementation.mapper import map_effective_target
from .engine import TIE_PRIORITY, check_allocation_minimum, contribution_precision, recommend_next_contribution
from .models import ContributionRequest
from .plan_models import ContributionAllocation, ContributionPlan


def _allocation(item, calculation, amount, minimum, stage):
    blocked = minimum.status == "below_minimum"
    return ContributionAllocation(implementation=item, calculation=calculation,
        candidate_amount=amount, allocated_amount=Decimal(0) if blocked else amount,
        minimum=minimum, allocation_stage=stage,
        reason="below_minimum" if blocked else ("target_weight_residual" if stage == "residual" else "deficit_fill"))


def _residual_allocation(request, candidates, remaining):
    """Guarded fallback after ALL positive deficits are filled.

    Returns one highest-weight executable target, otherwise highest-weight
    verify-minimum target. Blocked records preserve unsuccessful checks.
    Normal complete 100% inputs cannot generate a true residual.
    """
    ordered = sorted(candidates, key=lambda pair: (-pair[0].target_percentage_points,
                                                  TIE_PRIORITY.index(pair[0].sleeve)))
    blocked, uncertain = [], []
    for item, calculation in ordered:
        minimum = check_allocation_minimum(item.product, request, remaining)
        row = _allocation(item, calculation, remaining, minimum, "residual")
        if minimum.status == "ready":
            return row, tuple(blocked)
        if minimum.status == "verify_minimum":
            uncertain.append(row)
        else:
            blocked.append(row)
    return (uncertain[0] if uncertain else None), tuple(blocked)


def plan_monthly_contribution(request: ContributionRequest) -> ContributionPlan:
    request = ContributionRequest.model_validate(request)
    with localcontext() as arithmetic:
        arithmetic.prec = contribution_precision(request)
        return _plan(request)


def _plan(request):
    # Reuse 3Q-A's canonical deficit calculations and readiness/path gates.
    single = recommend_next_contribution(request)
    common = dict(contribution_amount=request.contribution_amount,
        contribution_currency=request.contribution_currency, route_id=single.route_id,
        readiness=single.readiness, path=single.path, state=single.state,
        current_portfolio_value=single.current_portfolio_value,
        post_contribution_portfolio_value=single.post_contribution_portfolio_value,
        calculations=single.calculations)
    if single.action in {"reserve", "no_action"}:
        return ContributionPlan(**common, status=single.action, reason=single.reason,
            reserve_amount=request.contribution_amount if single.action == "reserve" else 0,
            unallocated_amount=request.contribution_amount if single.action == "no_action" else 0,
            warnings=single.warnings)

    context = request.context
    mapping = map_effective_target(context.route_id, context.effective_target_allocation,
        context.readiness, path=context.path, ibkr_crypto_eligible=context.ibkr_crypto_eligible)
    mapped = {item.sleeve: item for item in mapping.implementations}
    eligible = [(mapped[calc.sleeve], calc) for calc in single.calculations
                if mapped[calc.sleeve].actionable and mapped[calc.sleeve].product.available_in_ph is not False]
    positive = sorted((pair for pair in eligible if pair[1].deficit > 0),
                      key=lambda pair: (-pair[1].deficit, TIE_PRIORITY.index(pair[0].sleeve)))
    remaining = request.contribution_amount
    allocations, blocked, filled = [], {}, set()
    # Known executable buys take precedence, but never exceed their deficit.
    # Then process uncertain buys, preserving the same deficit/tie ordering.
    for required_status in ("ready", "verify_minimum"):
        for item, calc in positive:
            if remaining == 0:
                break
            if item.sleeve in filled:
                continue
            candidate = min(remaining, calc.deficit)
            minimum = check_allocation_minimum(item.product, request, candidate)
            if minimum.status == "below_minimum":
                blocked[item.sleeve] = _allocation(item, calc, candidate, minimum, "deficit_fill")
                continue
            if minimum.status != required_status:
                continue
            allocations.append(_allocation(item, calc, candidate, minimum, "deficit_fill"))
            remaining -= candidate
            filled.add(item.sleeve)

    # Do not treat money blocked by an unfilled deficit as a genuine residual.
    if remaining > 0 and all(item.sleeve in filled for item, _ in positive):
        residual, residual_blocked = _residual_allocation(request, eligible, remaining)
        if residual is not None:
            allocations.append(residual)
            remaining = Decimal(0)
        for row in residual_blocked:
            blocked[row.implementation.sleeve] = row

    invested = sum((row.allocated_amount for row in allocations if row.minimum.status == "ready"), Decimal(0))
    verify = sum((row.allocated_amount for row in allocations if row.minimum.status == "verify_minimum"), Decimal(0))
    status = "invest" if invested == request.contribution_amount else ("partial" if invested > 0 else "wait")
    warnings = list(mapping.warnings)
    for row in allocations:
        warnings.extend(row.implementation.warnings)
    if context.readiness.message_requirement != "none":
        warnings.append("Readiness caution applies to this contribution plan.")
    if verify:
        warnings.append("Some planned amounts require minimum/eligibility verification; no FX or price conversion is assumed.")
    if remaining:
        warnings.append("Unallocated money remains waiting; product minimums do not justify funding an overweight sleeve.")
    return ContributionPlan(**common, status=status, reason="deficit_plan",
        allocations=tuple(allocations), blocked_allocations=tuple(blocked.values()),
        invested_amount=invested, verify_minimum_amount=verify, unallocated_amount=remaining,
        warnings=tuple(dict.fromkeys(warnings)))
