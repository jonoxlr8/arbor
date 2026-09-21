from copy import deepcopy
from decimal import Decimal, localcontext
from fractions import Fraction
from itertools import combinations

import pytest
from pydantic import ValidationError

from app.services.contributions.engine import TIE_PRIORITY, recommend_next_contribution
from app.services.contributions.models import ContributionRequest
from app.services.contributions.plan_models import ContributionPlan
from app.services.contributions.planner import _residual_allocation, plan_monthly_contribution
from app.services.implementation.mapper import map_plan
from app.services.implementation.models import RouteId
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.strategy_v2 import SavedPreferences


def make_request(route="dragonfi", risk="hold", tech=10, btc=5, amount=12000,
                 values=(58000, 19000, 8000, 3000), owned=(), currency="PHP",
                 savings="three_to_six_months", debt="none", horizon="ten_plus_years", eligible=None):
    plan = build_portfolio_plan(risk, horizon, savings, debt,
                               SavedPreferences(technology_tilt=tech, bitcoin=btc))
    return ContributionRequest(contribution_amount=amount, contribution_currency=currency,
        current_portfolio=dict(currency=currency, owned_product_ids=owned,
            **dict(zip((role.value for role in TIE_PRIORITY), values))),
        context=dict(route_id=route, effective_target_allocation=plan.preference_result.effective_target,
            readiness=plan.readiness, path=plan.path, ibkr_crypto_eligible=eligible),
        readiness_inputs=dict(emergency_savings=savings, high_interest_debt=debt))


def checked(req):
    before = req.model_dump()
    result = plan_monthly_contribution(req)
    assert Fraction(result.contribution_amount) == sum(map(Fraction, (
        result.invested_amount, result.verify_minimum_amount, result.unallocated_amount, result.reserve_amount)))
    assert sum((row.allocated_amount for row in result.allocations), Decimal(0)) == result.invested_amount + result.verify_minimum_amount
    assert all(row.allocated_amount == 0 for row in result.blocked_allocations)
    assert req.model_dump() == before
    assert result == plan_monthly_contribution(req)
    assert ContributionPlan.model_validate_json(result.model_dump_json()) == result
    assert result.status in {"invest", "partial", "reserve", "wait", "no_action"}
    for row in result.allocations:
        assert row.allocated_amount > 0
        if row.allocation_stage == "deficit_fill":
            assert row.allocated_amount <= row.calculation.deficit
    return result


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("risk,tech,btc", [
    ("sell_all", 0, 0), ("sell_some", 0, 0), ("hold", 0, 0), ("continue_investing", 0, 0),
    ("sell_some", 100, 100), ("hold", 10, 10), ("continue_investing", 10, 10),
    ("hold", 0, 5), ("hold", 10, 0),
])
@pytest.mark.parametrize("values", [
    (0, 0, 0, 0), (65000, 20000, 10000, 5000), (55000, 25000, 15000, 5000),
    (100000, 0, 0, 0), (0, 100000, 0, 0), (0, 0, 100000, 0), (0, 0, 0, 100000),
])
def test_allocation_matrix(route, risk, tech, btc, values):
    req = make_request(route=route, risk=risk, tech=tech, btc=btc, values=values)
    result = checked(req)
    target = req.context.effective_target_allocation.allocation
    for row in result.allocations:
        role = row.implementation.sleeve
        assert row.implementation.target_percentage_points == target.weight(role) > 0
        assert row.calculation.target_value_after_contribution == result.post_contribution_portfolio_value * target.weight(role) / 100
    # Confirmed first; monetary deficit order within each execution class.
    for status in ("ready", "verify_minimum"):
        rows = [row for row in result.allocations if row.minimum.status == status]
        assert rows == sorted(rows, key=lambda row: (-row.calculation.deficit, TIE_PRIORITY.index(row.implementation.sleeve)))


def test_locked_multi_deficit_example():
    result = checked(make_request())
    assert [(row.implementation.sleeve, row.allocated_amount) for row in result.allocations] == [
        ("global_equity", 7000), ("technology_tilt", 2000), ("crypto", 2000), ("defensive", 1000)]
    assert result.invested_amount == 12000 and result.status == "invest"
    assert result.unallocated_amount == 0


@pytest.mark.parametrize("amount,values,expected", [
    (20000, (55000, 25000, 15000, 5000), 20000),
    (15000, (50000, 20000, 10000, 5000), 15000),
    (10000, (55000, 25000, 15000, 5000), 10000),
])
def test_drift_not_static_split(amount, values, expected):
    result = checked(make_request(amount=amount, values=values))
    assert len(result.allocations) == 1
    assert result.allocations[0].implementation.sleeve == "global_equity"
    assert result.allocations[0].allocated_amount == expected


def test_empty_and_at_target():
    for values in [(0, 0, 0, 0), (65000, 20000, 10000, 5000)]:
        result = checked(make_request(amount=20000, values=values))
        assert {row.implementation.sleeve: row.allocated_amount for row in result.allocations} == {
            "global_equity": 13000, "defensive": 4000, "technology_tilt": 2000, "crypto": 1000}


@pytest.mark.parametrize("first,second", list(combinations(TIE_PRIORITY, 2)))
def test_deficit_tie_order(first, second):
    values = dict(zip(TIE_PRIORITY, [65000, 20000, 10000, 5000]))
    values[first] -= 1000
    values[second] -= 1000
    result = checked(make_request(amount=2000, values=tuple(values[role] for role in TIE_PRIORITY)))
    assert [row.implementation.sleeve for row in result.allocations] == [first, second]


def test_blocked_global_does_not_turn_into_overweight_residual():
    req = make_request(route="gcash", risk="sell_all", tech=0, btc=0,
                       amount=1200, values=(3300, 5500, 0, 0))
    result = checked(req)
    assert [(row.implementation.sleeve, row.allocated_amount) for row in result.allocations] == [("defensive", 500)]
    assert result.unallocated_amount == 700 and result.status == "partial"
    blocked = result.blocked_allocations[0]
    assert blocked.candidate_amount == 700 and blocked.minimum.applicable_minimum == 1000
    assert blocked.minimum.amount_needed_to_minimum == 300
    # 3Q-A's single-product behavior is intentionally unchanged.
    single = recommend_next_contribution(req)
    assert single.action == "invest" and single.selected.sleeve == "global_equity"
    assert single.recommended_amount == 1200


def test_below_all_minimums():
    result = checked(make_request(route="gcash", risk="sell_all", tech=0, btc=0,
                                  amount=1, values=(0, 0, 0, 0)))
    assert result.allocations == () and result.unallocated_amount == 1 and result.status == "wait"
    assert len(result.blocked_allocations) == 2


@pytest.mark.parametrize("owned,invested", [((), 0), (("gotrade_vt",), 0), (("gcash_global_equity",), 500)])
def test_product_ownership_minimums(owned, invested):
    result = checked(make_request(route="gcash", risk="continue_investing", tech=0, btc=0,
                                  amount=500, values=(0, 0, 0, 0), owned=owned))
    assert result.invested_amount == invested
    row = (result.allocations or result.blocked_allocations)[0]
    assert row.minimum.applicable_minimum == (500 if invested else 1000)


@pytest.mark.parametrize("route,owned", [("ibkr", ()), ("dragonfi", ("dragonfi_global_equity",))])
def test_unknown_minimum_allocations_remain_planned_only(route, owned):
    result = checked(make_request(route=route, risk="continue_investing", tech=0, btc=0,
                                  amount=5000, values=(0, 0, 0, 0), owned=owned))
    assert result.verify_minimum_amount == 5000 and result.invested_amount == 0
    assert result.unallocated_amount == 0 and result.status == "wait"
    assert result.allocations[0].minimum.status == "verify_minimum"


@pytest.mark.parametrize("amount", [Decimal("99.99"), Decimal("100"), Decimal("100.01"), Decimal("5000")])
def test_gotrade_practical_minimum(amount):
    result = checked(make_request(route="gotrade", risk="continue_investing", tech=0, btc=0,
                                  amount=amount, values=(0, 0, 0, 0)))
    ready = amount >= 100
    assert result.invested_amount == (amount if ready else 0)
    assert result.unallocated_amount == (0 if ready else amount)
    assert result.verify_minimum_amount == 0
    assert result.status == ("invest" if ready else "wait")
    row = (result.allocations or result.blocked_allocations)[0]
    assert row.minimum.applicable_minimum == 100 and row.minimum.minimum_currency == "PHP"
    assert row.minimum.status == ("ready" if ready else "below_minimum")
    assert row.minimum.amount_needed_to_minimum == max(0, 100 - amount)


@pytest.mark.parametrize("route", ["gotrade", "ibkr"])
def test_confirmed_deficits_precede_uncertain_not_overweight_sleeves(route):
    result = checked(make_request(route=route))
    if route == "gotrade":
        assert [(row.implementation.sleeve, row.allocated_amount) for row in result.allocations] == [
            ("global_equity", 7000), ("technology_tilt", 2000), ("crypto", 2000), ("defensive", 1000)]
        assert result.invested_amount == 12000 and result.verify_minimum_amount == 0
        assert result.status == "invest"
    else:
        assert result.allocations[0].implementation.sleeve == "crypto"
        assert result.allocations[0].allocated_amount == 2000
        assert result.invested_amount == 2000 and result.verify_minimum_amount == 10000
        assert result.status == "partial"
    result = checked(make_request(route=route, amount=15000, values=(50000, 20000, 10000, 5000)))
    assert [row.implementation.sleeve for row in result.allocations] == ["global_equity"]


@pytest.mark.parametrize("route,eligible,product", [
    ("gcash", None, "gcrypto_btc"), ("dragonfi", None, "coins_btc"),
    ("gotrade", None, "coins_btc"), ("ibkr", False, "coins_btc"),
    ("ibkr", None, "coins_btc"), ("ibkr", True, "ibkr_btc"),
])
def test_crypto_routing(route, eligible, product):
    req = make_request(route=route, eligible=eligible, amount=1000, values=(65000, 20000, 10000, 4000))
    result = checked(req)
    row = result.allocations[0]
    assert row.implementation.product.product_id == product
    assert row.allocated_amount == 1000
    if product in {"gcrypto_btc", "ibkr_btc"}:
        assert row.minimum.status == "verify_minimum"
    if product == "gcrypto_btc":
        assert row.minimum.applicable_minimum == Decimal("0.00002")
        assert row.minimum.minimum_currency == "BTC"
    assert product != "pdax_btc"


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("savings,debt", [("three_to_six_months", "none"),
    ("one_to_two_months", "none"), ("three_to_six_months", "difficult_to_manage")])
def test_readiness_short_term_and_zero(route, savings, debt):
    result = checked(make_request(route=route, savings=savings, debt=debt))
    if debt == "difficult_to_manage":
        assert result.status == "reserve" and result.reserve_amount == 12000
        assert result.allocations == () and result.blocked_allocations == ()
    if savings == "one_to_two_months":
        assert all(row.implementation.sleeve != "crypto" for row in result.allocations)
    short = checked(make_request(route=route, savings=savings, debt=debt, horizon="less_than_3_years"))
    assert short.status == "no_action" and short.state == "not_applicable"
    assert short.unallocated_amount == 12000 and short.allocations == ()
    zero = checked(make_request(route=route, savings=savings, debt=debt, amount=0))
    assert zero.status == "no_action" and zero.allocations == ()


def residual_candidates(route="dragonfi"):
    req = make_request(route=route)
    plan = build_portfolio_plan("hold", "ten_plus_years", "three_to_six_months", "none",
                               SavedPreferences(technology_tilt=10, bitcoin=5))
    mapped = {row.sleeve: row for row in map_plan(route, plan).implementations}
    calcs = recommend_next_contribution(req).calculations
    return req, [(mapped[calc.sleeve], calc) for calc in calcs]


def test_residual_highest_weight_fallback_and_minimum():
    # Directly test the defensive fallback: valid 100% targets cannot ordinarily
    # have money remaining after all their positive post-money deficits are filled.
    req, candidates = residual_candidates("gcash")
    row, _ = _residual_allocation(req, candidates, Decimal(3000))
    assert row.implementation.sleeve == "global_equity" and row.allocation_stage == "residual"
    row, blocked = _residual_allocation(req, candidates, Decimal(100))
    assert row.implementation.sleeve == "defensive"
    assert blocked[0].implementation.sleeve == "global_equity"
    # Restrict this unit fixture to known-minimum core products; no fallback can buy 1.
    row, blocked = _residual_allocation(req, candidates[:2], Decimal(1))
    assert row is None and len(blocked) == 2


@pytest.mark.parametrize("first,second", list(combinations(TIE_PRIORITY, 2)))
def test_residual_target_weight_tie(first, second):
    req, candidates = residual_candidates()
    # Equal-weight synthetic candidates test the fallback independently of target validation.
    pairs = [(item.model_copy(update={"target_percentage_points": 25}), calc)
             for item, calc in reversed(candidates) if item.sleeve in {first, second}]
    row, _ = _residual_allocation(req, pairs, Decimal(3000))
    assert row.implementation.sleeve == first


@pytest.mark.parametrize("route", ["gotrade", "ibkr"])
def test_residual_confirmed_preferred_then_uncertain(route):
    req, candidates = residual_candidates(route)
    row, _ = _residual_allocation(req, candidates, Decimal(3000))
    assert row.implementation.sleeve == ("global_equity" if route == "gotrade" else "crypto")
    assert row.minimum.status == "ready"
    row, _ = _residual_allocation(req, [(item, calc) for item, calc in candidates if item.sleeve != "crypto"], Decimal(3000))
    assert row.implementation.sleeve == "global_equity"
    assert row.minimum.status == ("ready" if route == "gotrade" else "verify_minimum")


def test_arbitrary_target_and_precise_accounting():
    raw = make_request(values=(0, 0, 0, 0), amount="12345.67890123456789").model_dump()
    for weight in raw["context"]["effective_target_allocation"]["allocation"]["weights"]:
        weight["percentage_points"] = {"global_equity": 57, "defensive": 20, "technology_tilt": 16, "crypto": 7}[weight["role"]]
    req = ContributionRequest.model_validate(raw)
    result = checked(req)
    assert {row.implementation.sleeve: row.implementation.target_percentage_points for row in result.allocations} == {
        "global_equity": 57, "defensive": 20, "technology_tilt": 16, "crypto": 7}
    with localcontext() as caller:
        caller.prec = 6
        assert plan_monthly_contribution(req) == result
        assert ContributionPlan.model_validate_json(result.model_dump_json()) == result
        assert caller.prec == 6


@pytest.mark.parametrize("change", ["amount", "currency", "target", "readiness", "unknown_sleeve"])
def test_invalid_request_not_repaired(change):
    raw = make_request().model_dump()
    if change == "amount": raw["contribution_amount"] = "NaN"
    if change == "currency": raw["current_portfolio"]["currency"] = "USD"
    if change == "target": raw["context"]["effective_target_allocation"]["allocation"]["weights"][0]["percentage_points"] = -1
    if change == "readiness": raw["context"]["readiness"]["actionable_contribution_guidance_allowed"] = False
    if change == "unknown_sleeve": raw["current_portfolio"]["gold"] = 100
    before = deepcopy(raw)
    with pytest.raises(ValidationError):
        plan_monthly_contribution(raw)
    assert before == raw


def test_output_rejects_disappearing_money_and_no_sale_vocabulary():
    raw = checked(make_request()).model_dump()
    raw["invested_amount"] -= 1
    with pytest.raises(ValidationError):
        ContributionPlan.model_validate(raw)
    assert set(ContributionPlan.model_fields["status"].annotation.__args__) == {"invest", "partial", "reserve", "wait", "no_action"}
