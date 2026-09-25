"""Monthly planning from saved targets and explicit investment choices.

No transactions, holdings mutations, carry-forward balance or new price calls.
Sleeve amounts use shared contribution arithmetic before product minimum checks.
"""
from decimal import Decimal, localcontext
from fractions import Fraction
from typing import Literal

from pydantic import model_validator

from app.services.arbor.v2_context import build_v2_context
from app.services.contributions.engine import (
    TIE_PRIORITY, calculate_sleeve_gaps, check_allocation_minimum,
    contribution_precision, fill_sleeve_gaps,
)
from app.services.contributions.models import CurrentPortfolio, MinimumCheck, MinimumInputs, SleeveCalculation
from app.services.implementation.choices import PROVIDER_IDS, validate_implementation_choices
from app.services.implementation.models import NonNegative
from app.services.implementation.products import PRODUCTS
from app.services.strategy_v2 import AssetRole, DomainModel

Source = Literal["recorded_portfolio", "manual_values", "confirmed_empty"]
ROW_LABELS = {AssetRole.GLOBAL_EQUITY: "Global Equity", AssetRole.DEFENSIVE: "Defensive",
              AssetRole.TECHNOLOGY_TILT: "Technology", AssetRole.CRYPTO: "Bitcoin"}
PROVIDER_LABELS = {"gotrade": "Gotrade", "gcash": "GFunds", "dragonfi": "DragonFi",
                   "gcrypto": "GCrypto", "coins_ph": "Coins.ph", "pdax": "PDAX"}


def money_text(value: Decimal) -> str:
    """Presentation without rounding away a fractional-peso planning amount."""
    whole, _, fraction = format(value, ",f").partition(".")
    return f"₱{whole}.{fraction.rstrip('0').ljust(2, '0')}"


class MonthlyPlanRow(SleeveCalculation):
    target_percentage_points: NonNegative
    amount: NonNegative
    product_id: str | None = None
    provider_id: str | None = None
    minimum: MinimumCheck | None = None
    status: Literal["ready", "verify_minimum", "below_minimum", "choose_investment", "no_amount"]


class ProviderGroup(DomainModel):
    provider_id: str
    amount: NonNegative
    ready_amount: NonNegative
    verify_minimum_amount: NonNegative
    waiting_amount: NonNegative


class MonthlyPlan(DomainModel):
    contribution_amount: NonNegative
    currency: Literal["PHP"] = "PHP"
    current_portfolio_value: NonNegative
    source: Source
    status: Literal["ready", "partial", "waiting", "reserve", "not_applicable"]
    reason: Literal["target_gaps", "foundation_first", "short_term", "explicit_plan_required", "zero_contribution"]
    rows: tuple[MonthlyPlanRow, ...] = ()
    provider_groups: tuple[ProviderGroup, ...] = ()
    ready_amount: NonNegative = Decimal(0)
    recordable_amount: NonNegative = Decimal(0)
    verify_minimum_amount: NonNegative = Decimal(0)
    waiting_amount: NonNegative = Decimal(0)
    choose_investment_amount: NonNegative = Decimal(0)
    reserve_amount: NonNegative = Decimal(0)
    unallocated_amount: NonNegative = Decimal(0)
    carry_forward_saved: Literal[False] = False

    @model_validator(mode="after")
    def full_accounting(self):
        buckets = (self.ready_amount, self.verify_minimum_amount, self.waiting_amount,
                   self.choose_investment_amount, self.reserve_amount, self.unallocated_amount)
        if sum(map(Fraction, buckets), Fraction(0)) != Fraction(self.contribution_amount):
            raise ValueError("Every contribution amount must remain accounted for")
        if Fraction(self.recordable_amount) != Fraction(self.ready_amount) + Fraction(self.verify_minimum_amount):
            raise ValueError("Only ready or externally verified amounts can prefill completion")
        if self.rows and sum((Fraction(row.amount) for row in self.rows), Fraction(0)) + Fraction(self.unallocated_amount) != Fraction(self.contribution_amount):
            raise ValueError("Monthly sleeve amounts must reconcile")
        if self.rows:
            for status, total in (("ready", self.ready_amount), ("verify_minimum", self.verify_minimum_amount),
                                  ("below_minimum", self.waiting_amount), ("choose_investment", self.choose_investment_amount)):
                if sum((Fraction(row.amount) for row in self.rows if row.status == status), Fraction(0)) != Fraction(total):
                    raise ValueError("Each amount must remain in its declared minimum bucket")
            if len({group.provider_id for group in self.provider_groups}) != len(self.provider_groups):
                raise ValueError("Provider groups must not be duplicated")
            for group in self.provider_groups:
                rows = [row for row in self.rows if row.provider_id == group.provider_id]
                if sum((Fraction(row.amount) for row in rows), Fraction(0)) != Fraction(group.amount):
                    raise ValueError("Provider amounts must reconcile to chosen investments")
                if sum(map(Fraction, (group.ready_amount, group.verify_minimum_amount, group.waiting_amount)), Fraction(0)) != Fraction(group.amount):
                    raise ValueError("Provider minimum buckets must reconcile")
        return self


def empty_current() -> CurrentPortfolio:
    return CurrentPortfolio(currency="PHP", global_equity=0, defensive=0,
                            technology_tilt=0, crypto=0, owned_product_ids=frozenset())


def calculate_monthly_plan(saved: dict, current: CurrentPortfolio, amount: Decimal | None = None,
                           source: Source = "recorded_portfolio") -> MonthlyPlan:
    context = build_v2_context(saved)
    inputs = MinimumInputs(contribution_amount=context.monthly_assumption if amount is None else amount,
                           contribution_currency="PHP", current_portfolio=current)
    if current.currency != "PHP":
        raise ValueError("Monthly planning requires PHP current values")
    choices = validate_implementation_choices(saved["profile"].get("implementation_choices", {}))
    with localcontext() as arithmetic:
        arithmetic.prec = contribution_precision(inputs)
        total = sum((current.value(role) for role in TIE_PRIORITY), Decimal(0))
        common = dict(contribution_amount=inputs.contribution_amount, current_portfolio_value=total, source=source)
        if not context.contributions_allowed:
            return MonthlyPlan(**common, status="reserve", reason="foundation_first", reserve_amount=inputs.contribution_amount)
        if context.path != "long_term" or context.target is None:
            return MonthlyPlan(**common, status="not_applicable", reason="short_term", unallocated_amount=inputs.contribution_amount)
        if context.plan_basis != "user_selected":
            return MonthlyPlan(**common, status="not_applicable", reason="explicit_plan_required", unallocated_amount=inputs.contribution_amount)
        calculations = calculate_sleeve_gaps(current, context.target, inputs.contribution_amount)
        candidates, remainder = fill_sleeve_gaps(calculations, inputs.contribution_amount)
        rows = []
        groups = {}
        buckets = {"ready": Decimal(0), "verify_minimum": Decimal(0),
                   "below_minimum": Decimal(0), "choose_investment": Decimal(0), "no_amount": Decimal(0)}
        for calculation in calculations:
            candidate = candidates.get(calculation.sleeve, Decimal(0))
            product_id = choices.get(calculation.sleeve)
            provider_id = PROVIDER_IDS[product_id] if product_id else None
            minimum = check_allocation_minimum(PRODUCTS[product_id], inputs, candidate) if product_id and candidate > 0 else None
            status = "no_amount" if candidate == 0 else minimum.status if minimum else "choose_investment"
            rows.append(MonthlyPlanRow(**calculation.model_dump(), amount=candidate,
                                      product_id=product_id, provider_id=provider_id, minimum=minimum, status=status))
            buckets[status] += candidate
            if provider_id and candidate > 0:
                group = groups.setdefault(provider_id, dict(provider_id=provider_id, amount=Decimal(0),
                    ready_amount=Decimal(0), verify_minimum_amount=Decimal(0), waiting_amount=Decimal(0)))
                group["amount"] += candidate
                group[{"ready": "ready_amount", "verify_minimum": "verify_minimum_amount", "below_minimum": "waiting_amount"}[status]] += candidate
        ready = buckets["ready"]
        status = "ready" if ready == inputs.contribution_amount and ready > 0 else "partial" if ready else "waiting"
        return MonthlyPlan(**common, status=status, reason="target_gaps" if inputs.contribution_amount else "zero_contribution",
            rows=tuple(rows), provider_groups=tuple(ProviderGroup(**group) for group in groups.values()),
            ready_amount=ready, recordable_amount=ready + buckets["verify_minimum"],
            verify_minimum_amount=buckets["verify_minimum"], waiting_amount=buckets["below_minimum"],
            choose_investment_amount=buckets["choose_investment"], unallocated_amount=remainder)


def explain_monthly_plan(question: str, plan: MonthlyPlan) -> str:
    """Reviewed wording around authoritative results; never recalculate in chat."""
    if plan.reason == "foundation_first":
        return "Foundation First pauses monthly investing. Your plan stays saved; review your financial foundation in Settings. No investment is proposed."
    if plan.reason == "short_term":
        return "Your short-term path has no long-term monthly investment breakdown. Your saved plan remains available."
    if plan.reason == "explicit_plan_required":
        return "Choose and confirm your own approach before opening monthly investing. Your historical plan has not changed."
    q = question.casefold()
    named = [(role, label) for role, label in ROW_LABELS.items()
             if label.casefold() in q or (role == AssetRole.CRYPTO and "btc" in q)]
    lines = [f"For your saved monthly contribution of {money_text(plan.contribution_amount)}, Arbor calculated these amounts from your final targets and {'recorded portfolio' if plan.source == 'recorded_portfolio' else 'explicit current-value inputs'}:"]
    if named and not any(row.sleeve in {role for role, _ in named} for row in plan.rows):
        lines.append("Your saved plan has no active target for that sleeve, so no part of this contribution is assigned to it.")
    for row in plan.rows:
        if named and row.sleeve not in {role for role, _ in named}:
            continue
        label = ROW_LABELS[row.sleeve]
        choice = f"{PRODUCTS[row.product_id].display_name} · {PROVIDER_LABELS[row.provider_id]}" if row.product_id else "choose an investment in Ways to invest"
        lines.append(f"- {label}: {money_text(row.amount)} · {choice}.")
        if "why" in q:
            lines.append(f"  Your saved target is {row.target_percentage_points}%. The post-contribution target value is {money_text(row.target_value_after_contribution)}; current value is {money_text(row.current_value)}. The existing target-gap calculation fills positive gaps, largest first; it does not mechanically repeat your target percentages.")
        if row.status == "below_minimum":
            lines.append(f"  This is below the known {row.minimum.minimum_currency} {row.minimum.applicable_minimum} minimum. {money_text(row.amount)} remains waiting for a future contribution; it was not moved to another sleeve. Carry-forward is not yet saved between months.")
        elif row.status == "verify_minimum":
            lines.append("  Verify the applicable minimum and eligibility in your provider app; Arbor has not assumed an executable order.")
        elif row.status == "no_amount":
            lines.append("  No part of this contribution is calculated for this sleeve.")
        elif row.status == "ready" and "minimum" in q:
            lines.append("  This amount meets the known minimum for the investment you chose.")
        elif row.status == "choose_investment":
            lines.append("  Choose an investment before Arbor can check its applicable minimum. No provider was selected for you.")
    lines.append(f"Full amount accounted for: {money_text(plan.contribution_amount)}. These are calculations for choices you made, not buy/sell instructions. Arbor does not place trades or move money. Unsaved amounts edited in the monthly view are not available to this chat.")
    return "\n".join(lines)
