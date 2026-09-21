from copy import deepcopy
from decimal import Decimal, localcontext
from itertools import combinations

import pytest
from pydantic import ValidationError

from app.services.contributions.engine import TIE_PRIORITY, recommend_next_contribution
from app.services.contributions.models import ContributionRecommendation, ContributionRequest
from app.services.implementation.mapper import map_plan
from app.services.implementation.models import RouteId
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.strategy_v2 import AssetRole, SavedPreferences


def request(route="gcash", risk="hold", tech=10, btc=5, values=(55000, 25000, 15000, 5000),
            amount=5000, currency="PHP", savings="three_to_six_months", debt="none",
            horizon="ten_plus_years", owned=(), eligible=None):
    plan = build_portfolio_plan(risk, horizon, savings, debt,
                               SavedPreferences(technology_tilt=tech, bitcoin=btc))
    return ContributionRequest(
        contribution_amount=amount, contribution_currency=currency,
        current_portfolio=dict(currency=currency, owned_product_ids=owned,
                               **dict(zip((role.value for role in TIE_PRIORITY), values))),
        context=dict(route_id=route, effective_target_allocation=plan.preference_result.effective_target,
                     readiness=plan.readiness, path=plan.path, ibkr_crypto_eligible=eligible),
        readiness_inputs=dict(emergency_savings=savings, high_interest_debt=debt),
    )


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("risk,tech,btc", [
    ("sell_all", 0, 0), ("sell_some", 0, 0), ("hold", 0, 0), ("continue_investing", 0, 0),
    ("sell_some", 100, 100), ("hold", 10, 10), ("continue_investing", 10, 10),
    ("hold", 0, 5), ("hold", 10, 0),
])
@pytest.mark.parametrize("values", [
    (0, 0, 0, 0), (55000, 25000, 15000, 5000), (100000, 0, 0, 0),
    (0, 100000, 0, 0), (0, 0, 100000, 0), (0, 0, 0, 100000),
    (65000, 20000, 10000, 5000),
])
def test_deficit_selection_matrix(route, risk, tech, btc, values):
    req = request(route=route, risk=risk, tech=tech, btc=btc, values=values)
    before = req.model_dump(mode="json")
    result = recommend_next_contribution(req)
    target = req.context.effective_target_allocation.allocation
    after = Decimal(sum(values) + 5000)
    deficits = {role: after * target.weight(role) / 100 - Decimal(values[index])
                for index, role in enumerate(TIE_PRIORITY) if target.weight(role)}
    expected = max(deficits, key=deficits.get)
    assert result.selected.sleeve == expected
    assert result.selected.target_percentage_points == target.weight(expected)
    assert result.selected_calculation.deficit == deficits[expected] > 0
    assert result.post_contribution_portfolio_value == after
    assert result.action in {"invest", "wait"}
    assert result == recommend_next_contribution(req)
    assert req.model_dump(mode="json") == before
    assert ContributionRecommendation.model_validate_json(result.model_dump_json()) == result
    assert all(calc.target_percentage_points > 0 for calc in result.calculations)


def test_standard_example_and_not_percentage_gap():
    result = recommend_next_contribution(request(route="gotrade"))
    assert result.selected.product.product_id == "gotrade_vt"
    assert result.selected_calculation.target_value_after_contribution == 68250
    assert result.selected_calculation.deficit == 13250
    assert result.selected_calculation.current_percentage == 55
    assert result.execution_status == "ready"
    # A large contribution changes ranking: defensive has the larger pre-money
    # percentage gap, but global equity has the larger post-money value deficit.
    result = recommend_next_contribution(request(values=(600, 100, 200, 100), amount=10000))
    assert result.selected.sleeve == "global_equity"


def test_empty_portfolio_exact_target_values():
    result = recommend_next_contribution(request(values=(0, 0, 0, 0)))
    assert [calc.target_value_after_contribution for calc in result.calculations] == [3250, 1000, 500, 250]
    assert result.selected.sleeve == "global_equity"
    assert result.selected_calculation.current_percentage is None
    assert result.recommended_amount == 5000


@pytest.mark.parametrize("first,second", list(combinations(TIE_PRIORITY, 2)))
def test_each_tie_priority_pair(first, second):
    # Post-total = 10000, target values 6500/2000/1000/500.
    # Only the chosen pair is short by 50 each; available contribution = 100.
    values = dict(zip(TIE_PRIORITY, [6500, 2000, 1000, 500]))
    values[first] -= 50
    values[second] -= 50
    req = request(values=tuple(values[role] for role in TIE_PRIORITY), amount=100)
    for _ in range(3):
        result = recommend_next_contribution(req)
        assert result.selected.sleeve == first
        assert result.selected_calculation.deficit == 50


def test_arbitrary_effective_target_preserved_without_reapplying_caps():
    raw = request(values=(0, 0, 0, 0)).model_dump()
    weights = raw["context"]["effective_target_allocation"]["allocation"]["weights"]
    for weight in weights:
        weight["percentage_points"] = {"global_equity": 57, "defensive": 20,
                                      "technology_tilt": 16, "crypto": 7}[weight["role"]]
    before = deepcopy(raw)
    result = recommend_next_contribution(raw)
    assert [calc.target_percentage_points for calc in result.calculations] == [57, 20, 16, 7]
    assert raw == before


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("savings,debt,action", [
    ("three_to_six_months", "none", "normal"),
    ("one_to_two_months", "none", "normal"),
    ("more_than_six_months", "difficult_to_manage", "reserve"),
])
def test_readiness_and_short_term(route, savings, debt, action):
    req = request(route=route, savings=savings, debt=debt)
    result = recommend_next_contribution(req)
    if action == "reserve":
        assert result.action == "reserve" and result.execution_status == "preview"
        assert result.selected is result.minimum is None
        assert result.recommended_amount == 5000
    else:
        assert result.action in {"invest", "wait"}
        if savings == "one_to_two_months":
            assert all(calc.sleeve != "crypto" for calc in result.calculations)
            assert any("caution" in warning for warning in result.warnings)
    short = recommend_next_contribution(request(route=route, savings=savings, debt=debt,
                                              horizon="less_than_3_years"))
    assert short.action == "no_action" and short.execution_status == "not_applicable"
    assert short.selected is None and short.calculations == ()


def select_role(role, **kwargs):
    # Make only the requested sleeve underweight; other values exactly at their
    # post-contribution targets. Deficit is the entire new contribution.
    kwargs.setdefault("amount", 100)
    amount = Decimal(str(kwargs["amount"]))
    total = max(Decimal(100000), amount * 100)
    percentages = dict(zip(TIE_PRIORITY, [65, 20, 10, 5]))
    values = [total * percentages[item] / 100 - (amount if item == role else 0)
              for item in TIE_PRIORITY]
    return recommend_next_contribution(request(values=tuple(values), **kwargs))


@pytest.mark.parametrize("route,role,product", [
    ("gcash", "global_equity", "gcash_global_equity"),
    ("dragonfi", "technology_tilt", "dragonfi_technology"),
    ("gotrade", "global_equity", "gotrade_vt"),
    ("ibkr", "defensive", "ibkr_aggu"),
])
def test_route_integration(route, role, product):
    result = select_role(role, route=route)
    assert result.selected.product.product_id == product


@pytest.mark.parametrize("route,eligible,product,status", [
    ("gcash", None, "gcrypto_btc", "verify_minimum"),
    ("dragonfi", None, "coins_btc", "ready"),
    ("gotrade", None, "coins_btc", "ready"),
    ("ibkr", False, "coins_btc", "ready"),
    ("ibkr", None, "coins_btc", "ready"),
    ("ibkr", True, "ibkr_btc", "verify_minimum"),
])
def test_crypto_routes_reuse_mapper(route, eligible, product, status):
    result = select_role("crypto", route=route, eligible=eligible)
    assert result.selected.product.product_id == product
    assert result.execution_status == status
    plan = build_portfolio_plan("hold", "ten_plus_years", "three_to_six_months", "none",
                               SavedPreferences(technology_tilt=10, bitcoin=5))
    expected = next(item for item in map_plan(route, plan, ibkr_crypto_eligible=eligible).implementations
                    if item.sleeve == "crypto")
    assert result.selected == expected
    assert result.selected.product.product_id != "pdax_btc"
    if route == "gcash":
        assert result.minimum.applicable_minimum == Decimal("0.00002")
        assert result.minimum.minimum_currency == "BTC"
        assert result.minimum.amount_needed_to_minimum is None


@pytest.mark.parametrize("role,product,initial,additional", [
    ("global_equity", "gcash_global_equity", 1000, 500),
    ("technology_tilt", "gcash_technology", 1000, 500),
    ("defensive", "gcash_defensive", 50, 50),
])
@pytest.mark.parametrize("owns", [False, True])
@pytest.mark.parametrize("difference", [-1, 0, 1])
def test_gcash_initial_additional_thresholds(role, product, initial, additional, owns, difference):
    minimum = additional if owns else initial
    result = select_role(role, amount=minimum + difference, owned=(product,) if owns else ())
    assert result.minimum.applicable_minimum == minimum
    assert result.minimum.purchase_type == ("additional" if owns else "initial")
    assert result.minimum.amount_needed_to_minimum == max(0, -difference)
    assert result.execution_status == ("below_minimum" if difference < 0 else "ready")
    assert result.action == ("wait" if difference < 0 else "invest")
    assert result.recommended_amount == (0 if difference < 0 else minimum + difference)


@pytest.mark.parametrize("amount,owned,needed", [(500, (), 500), (300, ("gcash_global_equity",), 200)])
def test_below_minimum_does_not_redirect(amount, owned, needed):
    result = select_role("global_equity", amount=amount, owned=owned)
    assert result.selected.product.product_id == "gcash_global_equity"
    assert result.action == "wait" and result.minimum.amount_needed_to_minimum == needed


@pytest.mark.parametrize("role,product", [
    ("global_equity", "dragonfi_global_equity"),
    ("technology_tilt", "dragonfi_technology"), ("defensive", "dragonfi_defensive"),
])
def test_dragonfi_initial_vs_unknown_additional(role, product):
    first = select_role(role, route="dragonfi", amount=1000)
    assert first.minimum.applicable_minimum == 1000 and first.execution_status == "ready"
    more = select_role(role, route="dragonfi", amount=10000, owned=(product,))
    assert more.execution_status == "verify_minimum"
    assert more.minimum.applicable_minimum is None and more.minimum.reason == "additional_unknown"


@pytest.mark.parametrize("role", ["global_equity", "technology_tilt", "defensive"])
@pytest.mark.parametrize("currency,amount,minimum,status", [
    ("PHP", 1, 100, "below_minimum"),
    ("PHP", Decimal("99.99"), 100, "below_minimum"),
    ("PHP", 100, 100, "ready"),
    ("PHP", Decimal("100.01"), 100, "ready"),
    ("USD", Decimal("0.99"), 1, "below_minimum"),
    ("USD", 1, 1, "ready"),
])
def test_gotrade_order_currency(role, currency, amount, minimum, status):
    result = select_role(role, route="gotrade", amount=amount, currency=currency)
    assert result.minimum.kind == "order"
    assert result.minimum.applicable_minimum == minimum and result.minimum.minimum_currency == currency
    assert result.execution_status == status
    assert result.minimum.amount_needed_to_minimum == max(0, minimum - amount)
    assert result.minimum.reason == ("minimum_met" if status == "ready" else "below_minimum")
    assert result.action == ("invest" if status == "ready" else "wait")
    assert result.recommended_amount == (amount if status == "ready" else 0)
    assert result.selected.product.minimum_order == 1
    assert result.selected.product.minimum_order_currency == "USD"


def test_coins_below_minimum_and_ibkr_dynamic():
    result = select_role("crypto", route="dragonfi", amount=3)
    assert result.action == "wait" and result.minimum.amount_needed_to_minimum == 2
    result = select_role("global_equity", route="ibkr", amount=10000, currency="USD")
    assert result.selected.product.product_id == "ibkr_vwra"
    assert result.minimum.applicable_minimum is None
    assert result.execution_status == "verify_minimum" and result.minimum.reason == "dynamic_minimum"


def test_owning_sleeve_on_other_route_does_not_prove_product_ownership():
    result = select_role("global_equity", owned=("gotrade_vt",), amount=500)
    assert result.minimum.purchase_type == "initial"
    assert result.minimum.applicable_minimum == 1000


def test_zero_contribution_and_action_vocabulary():
    result = recommend_next_contribution(request(amount=0))
    assert result.action == "no_action" and result.selected is None
    assert result.reason == "zero_contribution"
    assert set(ContributionRecommendation.model_fields["action"].annotation.__args__) == {"invest", "reserve", "wait", "no_action"}


@pytest.mark.parametrize("bad", [-1, "NaN", "Infinity", "-Infinity"])
def test_invalid_money_rejected(bad):
    with pytest.raises(ValidationError):
        request(amount=bad)
    with pytest.raises(ValidationError):
        request(values=(bad, 0, 0, 0))


@pytest.mark.parametrize("change", ["currency", "unknown_currency", "missing_sleeve", "unknown_sleeve",
    "route", "negative_target", "total", "readiness", "path", "unknown_product", "blocked_crypto"])
def test_invalid_context_rejected(change):
    raw = request().model_dump()
    if change == "currency": raw["current_portfolio"]["currency"] = "USD"
    if change == "unknown_currency": raw["contribution_currency"] = "XXX"
    if change == "missing_sleeve": raw["current_portfolio"].pop("defensive")
    if change == "unknown_sleeve": raw["current_portfolio"]["gold"] = 10
    if change == "route": raw["context"]["route_id"] = "best"
    if change == "negative_target": raw["context"]["effective_target_allocation"]["allocation"]["weights"][0]["percentage_points"] = -1
    if change == "total": raw["context"]["effective_target_allocation"]["allocation"]["weights"][0]["percentage_points"] = 66
    if change == "readiness": raw["context"]["readiness"]["actionable_contribution_guidance_allowed"] = False
    if change == "path": raw["context"]["path"] = "short_term"
    if change == "unknown_product": raw["current_portfolio"]["owned_product_ids"] = ["imaginary"]
    if change == "blocked_crypto":
        from app.services.readiness_v2 import evaluate_readiness
        raw["readiness_inputs"]["emergency_savings"] = "one_to_two_months"
        raw["context"]["readiness"] = evaluate_readiness("one_to_two_months", "none")
    with pytest.raises(ValidationError):
        recommend_next_contribution(raw)


def test_local_precision_no_premature_money_rounding():
    req = request(values=("12345678901234567890123456789.123456789", 0, 0, 0), amount="0.0000000001")
    with localcontext() as caller:
        caller.prec = 6
        result = recommend_next_contribution(req)
        assert caller.prec == 6
    assert result.post_contribution_portfolio_value == Decimal("12345678901234567890123456789.1234567891")


def test_no_eligible_mapping_fails_closed(monkeypatch):
    from app.services.contributions import engine
    original = engine.map_effective_target
    def inactive(*args, **kwargs):
        mapped = original(*args, **kwargs)
        return mapped.model_copy(update={"implementations": tuple(
            item.model_copy(update={"actionable": False}) for item in mapped.implementations)})
    monkeypatch.setattr(engine, "map_effective_target", inactive)
    result = recommend_next_contribution(request())
    assert result.action == "no_action" and result.reason == "no_eligible_deficit"
