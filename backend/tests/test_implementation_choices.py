"""3P-B choices change implementation metadata, never canonical plan authority."""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.implementation.bitcoin import BITCOIN_PRODUCTS
from app.services.implementation.mapper import map_plan
from app.services.implementation.models import MappingInput, RouteId
from app.services.implementation.products import PRODUCTS
from app.services.implementation.routes import ROUTES
from app.services.portfolio_plan_v2 import build_portfolio_plan
from app.services.strategy_v2 import SavedPreferences
from app.services.contributions.models import ContributionRequest
from app.services.contributions.engine import recommend_next_contribution
from app.services.contributions.planner import plan_monthly_contribution
from test_contribution_api import client, payload, PATHS, public_domain
from test_v2_chat import answer, saved


def test_beginner_visibility_and_unknown_pdax_facts():
    assert [r.value for r, item in ROUTES.items() if item.beginner_visible] == ["gcash", "dragonfi", "gotrade"]
    assert ROUTES["ibkr"].active and not ROUTES["ibkr"].beginner_visible
    assert list(BITCOIN_PRODUCTS) == ["gcrypto", "coins_ph", "pdax"]
    pdax = PRODUCTS["pdax_btc"]
    assert pdax.minimum_order is pdax.minimum_initial is pdax.currency is pdax.available_in_ph is None
    assert pdax.partnership.affiliate_available is None


@pytest.mark.parametrize("route", list(RouteId))
@pytest.mark.parametrize("provider,product", list(BITCOIN_PRODUCTS.items()))
@pytest.mark.parametrize("state", ["ready", "getting_ready", "foundation_first", "short_term"])
def test_independent_choices_preserve_entire_plan(route, provider, product, state):
    plan = build_portfolio_plan("hold", "less_than_3_years" if state == "short_term" else "ten_plus_years",
        "one_to_two_months" if state == "getting_ready" else "three_to_six_months",
        "difficult_to_manage" if state == "foundation_first" else "none",
        SavedPreferences(technology_tilt=10, bitcoin=10))
    before = plan.model_dump_json()
    result = map_plan(route, plan, selection_mode="explicit", bitcoin_provider=provider)
    assert plan.model_dump_json() == before
    if state == "short_term":
        assert result.implementations == () and result.state == "not_applicable"
    else:
        target = plan.preference_result.effective_target.allocation
        assert {row.sleeve: row.target_percentage_points for row in result.implementations} == {
            w.role: w.percentage_points for w in target.weights if w.percentage_points}
        crypto = [row for row in result.implementations if row.sleeve == "crypto"]
        if state == "ready":
            assert crypto[0].product.product_id == product
            assert crypto[0].crypto_fallback is None
        else:
            assert not crypto
        assert result.actionable is (state != "foundation_first")


def test_explicit_missing_or_invalid_provider_fails_closed_but_legacy_still_loads():
    body = payload()
    context = body["context"]
    assert MappingInput.model_validate(context).selection_mode == "legacy_route"
    context["selection_mode"] = "explicit"
    with pytest.raises(ValidationError, match="Choose a Bitcoin provider"):
        MappingInput.model_validate(context)
    context["bitcoin_provider"] = "best"
    with pytest.raises(ValidationError):
        MappingInput.model_validate(context)


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("route", ["gcash", "dragonfi", "gotrade", "ibkr"])
@pytest.mark.parametrize("provider,product", list(BITCOIN_PRODUCTS.items()))
def test_api_choices_preserve_calculations_accounting_and_decimal_contract(client, path, route, provider, product):
    body = payload(route=route)
    legacy = recommend_next_contribution(ContributionRequest.model_validate(body))
    body["context"].update(selection_mode="explicit", bitcoin_provider=provider)
    domain = ContributionRequest.model_validate(body)
    single = recommend_next_contribution(domain)
    assert single.calculations == legacy.calculations
    direct = single if path.endswith("recommendation") else plan_monthly_contribution(domain)
    response = client.post(path, json=body)
    assert response.status_code == 200
    result = response.json()
    assert result == public_domain(direct.model_dump(mode="json"))
    assert isinstance(result["contribution_amount"], str)
    if path.endswith("plan"):
        assert sum(Decimal(result[k]) for k in ["invested_amount", "verify_minimum_amount", "unallocated_amount", "reserve_amount"]) == Decimal("12000")
        crypto = [row for row in result["allocations"] if row["implementation"]["sleeve"] == "crypto"]
        assert crypto[0]["implementation"]["product"]["product_id"] == product
        if provider == "pdax":
            assert crypto[0]["minimum"]["status"] == "verify_minimum"
            assert crypto[0]["minimum"]["applicable_minimum"] is None


@pytest.mark.parametrize("path", PATHS)
def test_api_requires_explicit_btc_choice(client, path):
    body = payload()
    body["context"]["selection_mode"] = "explicit"
    assert client.post(path, json=body).status_code == 422


@pytest.mark.parametrize("question", ["Which broker is best for me?", "Should I use Gotrade or DragonFi?",
    "Which Bitcoin exchange should I use?", "Is Coins.ph better for my situation?"])
def test_chat_does_not_rank_providers(question):
    result = answer(question)
    assert result.intent == "decision_boundary"
    assert "I don’t choose securities or providers" in result.reply


def test_chat_choices_not_claimed_saved_and_selected_plan_independent():
    result = answer("Explain implementation options")
    assert "GCash/GFunds, DragonFi and Gotrade" in result.reply
    assert "GCrypto, Coins.ph or PDAX" in result.reply
    assert "No implementation route or product choice is saved" in result.reply
    value = saved(saved_preferences={"technology_tilt":20, "bitcoin":20})
    before = repr(value)
    assert value["plan"]["plan_basis"] == "user_selected"
    # Provider choices never enter profile/plan persistence or the chat context adapter.
    for route in ROUTES:
        body = payload(route=route, tech=0, btc=0)
        body["context"]["effective_target_allocation"] = value["plan"]["preference_result"]["effective_target"]
        body["context"]["readiness"] = value["plan"]["readiness"]
        for provider in BITCOIN_PRODUCTS:
            body["context"].update(selection_mode="explicit", bitcoin_provider=provider)
            result = plan_monthly_contribution(ContributionRequest.model_validate(body))
            assert {c.sleeve: c.target_percentage_points for c in result.calculations} == {"global_equity":80, "defensive":20}
    assert repr(value) == before
