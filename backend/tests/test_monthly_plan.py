from copy import deepcopy
from decimal import Decimal, localcontext
from fractions import Fraction
import json
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth import get_current_user_id
from app.routes import monthly_plan as api
from app.schemas.profile_v2 import ProfileV2Create
from app.services.contributions.models import CurrentPortfolio
from app.services.entitlements import resolve_entitlements
from app.services.implementation.choices import validate_active_choices, validate_implementation_choices
from app.services.live_portfolio import FixtureMarketData, value_portfolio
from app.services.monthly_plan import MonthlyPlan, calculate_monthly_plan, empty_current, explain_monthly_plan, money_text
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.arbor.v2_explanations import classify_v2_question, explain_v2
from test_profile_v2 import BASE, HEADERS

CHOICES = {"global_equity": "gotrade_vt", "technology_tilt": "gotrade_vgt", "crypto": "coins_btc"}


def profile_row(owner="A", **updates):
    return profile_v2_row(ProfileV2Create(**{**BASE, "selected_approach": "Aggressive",
        "monthly_investment": 10000, "explicit_customization": {"technology_tilt": 10, "bitcoin": 10},
        "implementation_choices": CHOICES, **updates}), owner)


def saved(**updates):
    return restore_profile_v2(profile_row(**updates))


def current(values=(0, 0, 0, 0), owned=()):
    return CurrentPortfolio(currency="PHP", global_equity=values[0], defensive=values[1],
        technology_tilt=values[2], crypto=values[3], owned_product_ids=frozenset(owned))


def calculate(values=(0, 0, 0, 0), amount="10000", choices=CHOICES, owned=(), **updates):
    result = calculate_monthly_plan(saved(implementation_choices=choices, **updates), current(values, owned), Decimal(amount))
    assert sum(map(Fraction, (result.ready_amount, result.verify_minimum_amount, result.waiting_amount,
        result.choose_investment_amount, result.reserve_amount, result.unallocated_amount))) == Fraction(result.contribution_amount)
    assert Fraction(result.recordable_amount) == Fraction(result.ready_amount) + Fraction(result.verify_minimum_amount)
    return result


def amounts(result):
    return {row.sleeve.value: row.amount for row in result.rows}


@pytest.mark.parametrize("values,expected", [
    ((0, 0, 0, 0), {"global_equity": 8000, "technology_tilt": 1000, "crypto": 1000}),
    ((80000, 0, 10000, 10000), {"global_equity": 8000, "technology_tilt": 1000, "crypto": 1000}),
    ((70000, 0, 15000, 15000), {"global_equity": 10000, "technology_tilt": 0, "crypto": 0}),
    ((85000, 0, 5000, 10000), {"global_equity": 3000, "technology_tilt": 6000, "crypto": 1000}),
    ((85000, 0, 10000, 5000), {"global_equity": 3000, "technology_tilt": 1000, "crypto": 6000}),
    ((75000, 0, 5000, 20000), {"global_equity": 10000, "technology_tilt": 0, "crypto": 0}),
    ((90000, 0, 5000, 5000), {"global_equity": 0, "technology_tilt": 6000, "crypto": 4000}),
])
def test_target_gap_matrix(values, expected):
    result = calculate(values)
    assert amounts(result) == expected
    assert sum(row.amount for row in result.rows) == result.contribution_amount
    assert result.carry_forward_saved is False


def test_missing_choice_keeps_full_sleeve_amount_without_default():
    result = calculate(choices={})
    assert result.choose_investment_amount == 10000
    assert result.provider_groups == ()
    assert all(row.product_id is None and row.status == "choose_investment" for row in result.rows)
    assert amounts(result) == {"global_equity": 8000, "technology_tilt": 1000, "crypto": 1000}


def test_selected_provider_grouping_and_decimal_transport():
    result = calculate()
    gotrade, coins = result.provider_groups
    assert (gotrade.provider_id, gotrade.amount, coins.provider_id, coins.amount) == ("gotrade", 9000, "coins_ph", 1000)
    data = result.model_dump(mode="json")
    assert data["contribution_amount"] == "10000"
    assert isinstance(data["rows"][0]["target_percentage_points"], str)
    assert data["recordable_amount"] == "10000"


@pytest.mark.parametrize("amount,status", [("99.99", "below_minimum"), ("100", "ready"), ("100.01", "ready")])
def test_gotrade_exact_minimum_boundary(amount, status):
    result = calculate(amount=amount, choices={"global_equity": "gotrade_vt"},
        explicit_customization={"technology_tilt": 0, "bitcoin": 0})
    row = result.rows[0]
    assert row.minimum.applicable_minimum == 100 and row.status == status
    assert row.amount == Decimal(amount)


def test_below_minimum_is_waiting_not_reassigned():
    result = calculate(amount="3000", choices={**CHOICES, "technology_tilt": "gcash_technology", "crypto": "pdax_btc"})
    assert amounts(result) == {"global_equity": 2400, "technology_tilt": 300, "crypto": 300}
    assert (result.ready_amount, result.waiting_amount, result.verify_minimum_amount, result.recordable_amount) == (2400, 300, 300, 2700)
    row = result.rows[1]
    assert row.minimum.applicable_minimum == 1000 and row.minimum.amount_needed_to_minimum == 700
    assert "Carry-forward is not yet saved" in explain_monthly_plan("Why is my Technology amount below minimum?", result)


@pytest.mark.parametrize("product,owned,expected", [
    ("gcash_technology", (), "below_minimum"),
    ("gcash_technology", ("gcash_technology",), "ready"),
    ("dragonfi_technology", ("dragonfi_technology",), "verify_minimum"),
])
def test_exact_product_ownership_minimums(product, owned, expected):
    result = calculate(amount="5000", choices={**CHOICES, "technology_tilt": product}, owned=owned)
    assert result.rows[1].amount == 500 and result.rows[1].status == expected


@pytest.mark.parametrize("product", ["pdax_btc", "gcrypto_btc"])
def test_unknown_or_quantity_minimum_never_invented(product):
    result = calculate(choices={**CHOICES, "crypto": product})
    assert result.rows[-1].status == "verify_minimum"
    assert result.verify_minimum_amount == 1000


def test_changing_implementation_does_not_change_gap_amounts_or_targets():
    values = (90000, 0, 5000, 5000)
    results = [calculate(values, choices=choices) for choices in (
        CHOICES, {**CHOICES, "technology_tilt": "dragonfi_technology", "crypto": "pdax_btc"}, {},
    )]
    assert amounts(results[0]) == amounts(results[1]) == amounts(results[2])
    assert [row.target_percentage_points for row in results[0].rows] == [row.target_percentage_points for row in results[1].rows]


@pytest.mark.parametrize("tech,btc,expected", [(0, 0, ["global_equity"]), (10, 0, ["global_equity", "technology_tilt"]),
    (0, 10, ["global_equity", "crypto"])])
def test_zero_target_hidden_without_deleting_saved_choice(tech, btc, expected):
    result = calculate(explicit_customization={"technology_tilt": tech, "bitcoin": btc})
    assert [row.sleeve.value for row in result.rows] == expected


def test_readiness_and_short_term_do_not_propose_completion():
    result = calculate(high_interest_debt="difficult_to_manage")
    assert result.status == "reserve" and result.reserve_amount == 10000 and not result.rows
    short = calculate(selected_approach="short_term", horizon="less_than_3_years", explicit_customization=None)
    assert short.status == "not_applicable" and short.unallocated_amount == 10000 and not short.rows


def test_fractional_precision_unchanged_and_low_precision_caller():
    with localcontext() as context:
        context.prec = 6
        result = calculate((Decimal("123456789.12"), 0, Decimal("1234.56"), Decimal("9999.99")), "1234567.89")
    assert sum((Fraction(row.amount) for row in result.rows)) == Fraction(Decimal("1234567.89"))


def test_subcent_calculations_are_explained_without_rounding():
    result = calculate(amount="1000.01", choices={**CHOICES, "technology_tilt": "gcash_technology"})
    assert result.rows[0].amount == Decimal("800.008")
    assert "₱800.008" in explain_monthly_plan("Why is this amount going to Global Equity?", result)
    assert money_text(Decimal("10000")) == "₱10,000.00"


def test_reconciliation_rejects_wrong_bucket_or_provider_total():
    data = calculate().model_dump()
    data["ready_amount"] -= 1; data["waiting_amount"] += 1; data["recordable_amount"] -= 1
    with pytest.raises(ValidationError): MonthlyPlan.model_validate(data)
    data = calculate().model_dump()
    data["provider_groups"][0]["amount"] += 1
    with pytest.raises(ValidationError): MonthlyPlan.model_validate(data)


@pytest.mark.parametrize("choices", [{"global_equity": "pdax_btc"}, {"crypto": "gotrade_vt"},
    {"other": "gotrade_vt"}, {"global_equity": "AAPL"}, {"global_equity": "ibkr_vwra"}])
def test_only_supported_sleeve_product_mapping(choices):
    with pytest.raises(ValueError): validate_implementation_choices(choices)


@pytest.fixture
def endpoint(monkeypatch):
    from app.routes import chat, live_portfolio
    from app.services import entitlements
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "false")
    monkeypatch.setenv("MONTHLY_CHECKIN_ENABLED", "false")
    state = {"owner": "A", "rows": {"A": profile_row(), "B": profile_row("B", implementation_choices={})},
             "tier": "plus", "writes": [], "race": False, "portfolio": value_portfolio([], FixtureMarketData([]), None)}
    class Query:
        def __init__(self): self.filters = {}; self.payload = None
        def table(self, name): assert name == "profiles"; return self
        def select(self, *_): return self
        def limit(self, *_): return self
        def eq(self, field, value): self.filters[field] = value; return self
        def update(self, payload): self.payload = payload; return self
        def execute(self):
            owner = self.filters.get("user_id")
            assert owner == state["owner"]
            row = state["rows"].get(owner)
            if self.payload is not None:
                assert set(self.payload) == {"v2_inputs"}
                assert "v2_inputs" in self.filters
                if state["race"] or json.loads(self.filters["v2_inputs"]) != row["v2_inputs"]:
                    return SimpleNamespace(data=[])
                row = {**row, **deepcopy(self.payload)}
                state["rows"][owner] = row
                state["writes"].append(owner)
            return SimpleNamespace(data=[deepcopy(row)] if row else [])
    def get_saved(**kwargs): return restore_profile_v2(state["rows"][kwargs["user_id"]])
    monkeypatch.setattr(api, "get_authenticated_client", lambda token: Query())
    monkeypatch.setattr(api, "get_my_profile", get_saved)
    monkeypatch.setattr(chat, "get_my_profile", get_saved)
    monkeypatch.setattr(entitlements, "get_entitlements", lambda _: resolve_entitlements(state["tier"], "active"))
    monkeypatch.setattr(chat, "get_entitlements", entitlements.get_entitlements)
    monkeypatch.setattr(live_portfolio, "load_portfolio", lambda *args: (state["portfolio"], None))
    app = FastAPI(); app.include_router(api.router); app.include_router(chat.router)
    app.dependency_overrides[get_current_user_id] = lambda: state["owner"]
    with TestClient(app) as client: yield client, state


def test_off_requires_explicit_current_values_and_ignores_planning_start(endpoint):
    client, state = endpoint
    state["rows"]["A"]["current_portfolio_value"] = 900000
    assert client.get("/v2/monthly-plan", headers=HEADERS).status_code == 409
    response = client.post("/v2/monthly-plan", json={"confirm_empty": True}, headers=HEADERS)
    assert response.status_code == 200 and Decimal(response.json()["current_portfolio_value"]) == 0
    assert response.json()["source"] == "confirmed_empty"
    manual = current((70000, 0, 15000, 15000)).model_dump(mode="json")
    data = client.post("/v2/monthly-plan", json={"manual_current": manual}, headers=HEADERS).json()
    assert Decimal(data["rows"][0]["amount"]) == 10000 and data["source"] == "manual_values"


def test_live_uses_holdings_and_rejects_client_overrides(endpoint, monkeypatch):
    client, state = endpoint
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    response = client.get("/v2/monthly-plan", headers=HEADERS)
    assert response.status_code == 200 and response.json()["source"] == "recorded_portfolio"
    assert client.post("/v2/monthly-plan", json={"confirm_empty": True}, headers=HEADERS).status_code == 422
    assert state["writes"] == []


def test_live_stale_or_incomplete_values_never_become_zero(endpoint, monkeypatch):
    from test_live_portfolio import holding, price
    client, state = endpoint
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    state["portfolio"] = value_portfolio([holding()], FixtureMarketData([]), None)
    assert client.get("/v2/monthly-plan", headers=HEADERS).status_code == 409
    state["portfolio"] = state["portfolio"].model_copy(update={"complete": True, "stale_count": 1})
    assert client.get("/v2/monthly-plan", headers=HEADERS).status_code == 409


@pytest.mark.parametrize("patch", [{"global_equity": "1000000000000"}, {"global_equity": "0.001"},
    {"currency": "USD"}, {"owned_product_ids": ["ibkr_vwra"]}])
def test_manual_context_has_bounded_php_precision_and_supported_ownership(endpoint, patch):
    client, _ = endpoint
    body = {"manual_current": {**current().model_dump(mode="json"), **patch}}
    assert client.post("/v2/monthly-plan", json=body, headers=HEADERS).status_code == 422


def test_free_can_choose_but_not_calculate_and_cas_is_owner_scoped(endpoint):
    client, state = endpoint
    state["tier"] = "free"
    revision = restore_profile_v2(state["rows"]["A"])["revision"]
    before_b = deepcopy(state["rows"]["B"])
    response = client.put("/v2/implementation-choices", json={"expected_revision": revision,
        "choices": {"global_equity": "gcash_global_equity"}}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["profile"]["implementation_choices"] == {"global_equity": "gcash_global_equity"}
    assert state["rows"]["B"] == before_b and state["writes"] == ["A"]
    assert client.post("/v2/monthly-plan", json={"confirm_empty": True}, headers=HEADERS).status_code == 403
    state["owner"] = "B"
    assert client.put("/v2/implementation-choices", json={"expected_revision": response.json()["revision"],
        "choices": CHOICES}, headers=HEADERS).status_code == 409


def test_choice_save_retains_targets_and_detects_stale_concurrent_edits(endpoint):
    client, state = endpoint
    before = restore_profile_v2(state["rows"]["A"])
    body = {"expected_revision": before["revision"], "choices": {}}
    state["race"] = True
    assert client.put("/v2/implementation-choices", json=body, headers=HEADERS).status_code == 409
    state["race"] = False
    response = client.put("/v2/implementation-choices", json=body, headers=HEADERS)
    assert response.status_code == 200 and response.json()["plan"] == before["plan"]
    assert response.json()["profile"]["implementation_choices"] == {}
    assert client.put("/v2/implementation-choices", json=body, headers=HEADERS).status_code == 409


def test_dormant_choices_survive_changing_an_active_investment(endpoint):
    client, state = endpoint
    state["rows"]["A"] = profile_row(explicit_customization={"technology_tilt": 0, "bitcoin": 0})
    before = restore_profile_v2(state["rows"]["A"])
    response = client.put("/v2/implementation-choices", json={"expected_revision": before["revision"],
        "choices": {**CHOICES, "global_equity": "gcash_global_equity"}}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["profile"]["implementation_choices"]["technology_tilt"] == "gotrade_vgt"
    assert response.json()["plan"] == before["plan"]
    assert client.put("/v2/implementation-choices", json={"expected_revision": response.json()["revision"],
        "choices": {**CHOICES, "technology_tilt": "gcash_technology"}}, headers=HEADERS).status_code == 422


@pytest.mark.parametrize("patch", [{"user_id": "B"}, {"targets": []}, {"provider_url": "https://evil.example"},
    {"contribution_amount": "NaN"}, {"contribution_amount": "Infinity"}, {"contribution_amount": "-1"},
    {"contribution_amount": "1.001"}, {"contribution_amount": True}, {"contribution_amount": "1000000000000"}])
def test_monthly_input_security(endpoint, patch):
    client, _ = endpoint
    assert client.post("/v2/monthly-plan", json={"confirm_empty": True, **patch}, headers=HEADERS).status_code == 422


def test_zero_target_choice_rejected_and_no_client_owner(endpoint):
    client, state = endpoint
    before = restore_profile_v2(state["rows"]["A"])
    body = {"expected_revision": before["revision"], "choices": {"defensive": "gotrade_bnd"}}
    assert client.put("/v2/implementation-choices", json=body, headers=HEADERS).status_code == 422
    assert client.put("/v2/implementation-choices", json={**body, "user_id": "B"}, headers=HEADERS).status_code == 422
    assert not state["writes"]


@pytest.mark.parametrize("question", ["How much should I invest this month?", "Why is this amount going to Global Equity?",
    "Why is my Technology amount below minimum?", "How was my contribution calculated?"])
def test_ask_monthly_intent_and_real_service_result(endpoint, monkeypatch, question):
    client, state = endpoint
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    assert classify_v2_question(question)[1] == "monthly_plan"
    response = client.post("/chat", json={"message": question}, headers=HEADERS)
    assert response.status_code == 200
    assert "₱10,000.00" in response.json()["reply"]
    assert "not buy/sell instructions" in response.json()["reply"]
    assert state["writes"] == []


def test_ask_explicit_choice_provenance_and_provider_choices():
    plan = saved()
    for question in ("Why do I have Technology?", "Why do I have Bitcoin?", "Did Arbor choose Bitcoin for me?"):
        reply = explain_v2(question, plan).reply
        assert "You explicitly added" in reply and "Arbor did not choose it" in reply
    assert "No. Bitcoin is optional" in explain_v2("Do I need Bitcoin?", plan).reply
    assert "Global Equity: 80%" in explain_v2("What are my targets?", plan).reply
    reply = explain_v2("Where can I invest?", plan).reply
    assert "You chose" in reply and "VT through Gotrade" in reply
    historical = saved(saved_preferences={"technology_tilt": 20, "bitcoin": 20})
    reply = explain_v2("Explain my historical preferences", historical).reply
    assert "current explicit choices: Technology 10% and Bitcoin 10%" in reply
    assert "which has no Technology" not in reply


def test_ask_missing_values_does_not_substitute_starting_assumption(endpoint):
    client, state = endpoint
    state["rows"]["A"]["current_portfolio_value"] = 987654
    response = client.post("/chat", json={"message": "How much should I invest this month?"}, headers=HEADERS)
    assert "not treated as zero" in response.json()["reply"] and "987654" not in response.json()["reply"]
