from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
from copy import deepcopy

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth import get_current_user_id
from app.routes import live_portfolio as api
from app.services.live_portfolio import (
    UNIVERSE, Holding, HoldingInput, Price, FixtureMarketData, value_portfolio, current_values, price_key, catalog,
)
from app.services.strategy_v2 import get_base_strategy
from app.services.entitlements import resolve_entitlements
from app.services.next_action import get_next_action
from app.services.arbor.portfolio_explanation import explain_portfolio
from app.services.arbor.v2_explanations import classify_v2_question
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.schemas.profile_v2 import ProfileV2Create
from test_profile_v2 import BASE

NOW = datetime(2026, 9, 24, 0, 0, tzinfo=timezone.utc)
TARGET = get_base_strategy("Growth").allocation


def holding(product="gotrade_vt", units="7.42"):
    return Holding(id=uuid4(), provider=UNIVERSE[product], product_id=product, units=units,
                   created_at=NOW, updated_at=NOW)


def price(key, amount="100", age=0):
    return Price(price_key=key, value=amount, as_of=NOW - timedelta(seconds=age))


def valued(rows, quotes, target=TARGET):
    return value_portfolio(rows, FixtureMarketData(quotes), target, NOW)


def saved(**updates):
    return restore_profile_v2(profile_v2_row(ProfileV2Create(**{**BASE, **updates}), "A"))


@pytest.mark.parametrize("product", UNIVERSE)
def test_exact_universe_supported_and_currency_valuation(product):
    row = holding(product, "0.123456789012")
    quotes = [price(price_key(product), "123.456789012345"), price("usd_php", "56.123456789012")]
    result = valued([row], quotes)
    expected = row.units * quotes[0].value * (quotes[1].value if row.provider == "gotrade" else 1)
    assert result.total_value_php == expected.quantize(Decimal(".01"))
    assert result.complete and result.unavailable_count == 0
    assert isinstance(result.model_dump(mode="json")["known_value_php"], str)
    assert len(result.holdings) == 1


@pytest.mark.parametrize("units", ["0", "-1", "NaN", "Infinity", "-Infinity", "1000000000000", "0.0000000000001", True])
def test_invalid_units(units):
    with pytest.raises(ValidationError):
        HoldingInput(provider="gotrade", product_id="gotrade_vt", units=units)


@pytest.mark.parametrize("patch", [{"product_id": "AAPL"}, {"provider": "ibkr"}, {"provider": "gcash"},
    {"user_id": "B"}, {"price": "1"}, {"value_php": "1"}, {"cost_basis_php": "-1"}, {"cost_basis_php": "1.001"}])
def test_injection_and_bad_cost_rejected(patch):
    with pytest.raises(ValidationError):
        HoldingInput(**{ "provider": "gotrade", "product_id": "gotrade_vt", "units": "1", **patch })


@pytest.mark.parametrize("key,fresh,max_age", [("gotrade_vt",172800,345600), ("usd_php",172800,345600),
    ("btc_php",600,3600), ("gcash_defensive",172800,604800)])
def test_freshness_boundaries_and_future_data(key, fresh, max_age):
    product = "gotrade_vt" if key == "usd_php" else "coins_btc" if key == "btc_php" else key
    for age, status in [(0,"fresh"),(fresh,"fresh"),(fresh+1,"stale"),(max_age,"stale"),(max_age+1,"unavailable"),(-1,"unavailable")]:
        quotes = {p.price_key:p for p in [price("gotrade_vt"),price("usd_php"),price(key,age=age)]}
        result = valued([holding(product)],list(quotes.values()))
        assert result.holdings[0].freshness == status
        if status != "fresh":
            with pytest.raises(ValueError): current_values(result)


def test_missing_fx_partial_valuation_no_false_percentages_or_zero_total():
    result = valued([holding(),holding("coins_btc",".01")], [price("gotrade_vt"),price("btc_php","3000000")])
    assert result.known_value_php == 30000
    assert result.total_value_php is None and result.unavailable_count == 1
    assert all(s.current_percentage is None and s.difference_pp is None for s in result.sleeves)
    assert result.holdings[0].value_php is None
    assert "not your complete" in explain_portfolio("current portfolio",result)


def test_totals_grouping_target_difference_and_owned_products():
    rows = [holding("gotrade_vt","2"),holding("gcash_defensive","10"),holding("coins_btc",".001")]
    result = valued(rows,[price("gotrade_vt","100"),price("usd_php","50"),price("gcash_defensive","100"),price("btc_php","1000000")])
    assert result.total_value_php == 12000
    assert result.provider_values_php == {"gotrade":10000,"gcash":1000,"coins_ph":1000}
    assert sum(s.known_value_php for s in result.sleeves) == result.total_value_php
    assert abs(sum(s.current_percentage for s in result.sleeves)-100) < Decimal("1e-24")
    equity = result.sleeves[0]
    assert abs(equity.difference_pp - (equity.current_percentage - 80)) < Decimal("1e-24")
    current = current_values(result)
    assert current.global_equity == 10000 and current.crypto == 1000
    assert current.owned_product_ids == frozenset(h.product_id for h in rows)
    assert not any(s.target_percentage for s in valued(rows,[],None).sleeves)


def test_empty_and_round_to_zero_have_no_actual_percentages():
    for result in [valued([],[]),valued([holding("coins_btc",".000000000001")],[price("btc_php","1")])]:
        assert result.total_value_php == 0
        assert all(s.current_percentage is None for s in result.sleeves)


def test_chat_explains_current_not_plan_and_never_trades():
    result = valued([holding("coins_btc",".01")],[price("btc_php","3000000")])
    for question in ["What is my current portfolio worth?","Am I above my Bitcoin target?","Which sleeve is furthest from my selected target?"]:
        assert classify_v2_question(question)[1] == "actual_holdings"
        text = explain_portfolio(question,result)
        assert "30,000.00" in text and "reference" in text
        assert not any(x in text.lower() for x in ("you should","buy ","sell "))
    assert "100.00%" in explain_portfolio("Bitcoin",result)
    assert "No holdings" in explain_portfolio("portfolio",valued([],[]))
    assert "temporarily unavailable" in explain_portfolio("portfolio",None)
    assert classify_v2_question("Should I sell Bitcoin?")[1] == "decision_boundary"


def test_next_action_priority_and_no_assumed_completion():
    empty = valued([],[])
    full = valued([holding("coins_btc","1")],[price("btc_php")])
    missing = valued([holding()],[])
    assert get_next_action(saved(),portfolio=empty).key == "add_first_holding"
    assert get_next_action(saved(),portfolio=missing).key == "update_portfolio"
    assert get_next_action(saved(),portfolio=full).key == "review_monthly_contribution"
    assert get_next_action(saved(high_interest_debt="difficult_to_manage"),portfolio=empty).key == "financial_foundation"
    assert get_next_action(saved(horizon="less_than_3_years",selected_approach="short_term"),portfolio=empty).key == "review_short_term_path"
    assert get_next_action(saved(selected_approach=None),portfolio=empty).key == "review_historical_plan"
    assert get_next_action(saved(),resolve_entitlements("free","active"),empty).destination == "settings"


@pytest.fixture
def endpoint(monkeypatch):
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    state = {"user":"A","rows":{},"mode": "plus", "history":{}, "saved":saved(), "age":0, "missing":set()}
    class Store:
        def __init__(self, owner, auth): self.owner = owner
        def holdings(self): return list(state["rows"].get(self.owner,{}).values())
        def prices(self, keys): return {k:price(k,"50" if k=="usd_php" else "100").model_copy(update={"as_of":datetime.now(timezone.utc)-timedelta(seconds=state["age"])}) for k in keys if k not in state["missing"]}
        def history(self): return state["history"].get(self.owner,[])
        def capture(self): return False
        def save(self, request, id=None):
            rows = state["rows"].setdefault(self.owner,{})
            if id and str(id) not in rows: raise HTTPException(404,"Not found")
            id = str(id or uuid4())
            rows[id] = Holding(**request.model_dump(),id=id,created_at=NOW,updated_at=NOW)
        def delete(self,id):
            if str(id) not in state["rows"].get(self.owner,{}): raise HTTPException(404,"Not found")
            del state["rows"][self.owner][str(id)]
    monkeypatch.setattr(api,"PortfolioStore",Store)
    monkeypatch.setattr(api,"get_my_profile",lambda **_: state["saved"])
    from app.services import entitlements
    monkeypatch.setattr(entitlements,"get_entitlements",lambda _:resolve_entitlements(state["mode"],"active"))
    from app.routes import chat
    monkeypatch.setattr(chat,"get_my_profile",lambda **_:state["saved"])
    monkeypatch.setattr(chat,"get_entitlements",entitlements.get_entitlements)
    app=FastAPI(); app.include_router(api.router); app.include_router(chat.router)
    app.dependency_overrides[get_current_user_id]=lambda:state["user"]
    with TestClient(app) as client: yield client,state


def test_api_crud_owner_no_client_identity_and_decimals(endpoint):
    client,state=endpoint
    body={"provider":"gotrade","product_id":"gotrade_vt","units":"7.123456789012"}
    assert client.post("/v2/portfolio/holdings",json=body).status_code==201
    result=client.get("/v2/portfolio").json()
    row=result["holdings"][0]
    assert row["units"]==body["units"] and isinstance(row["value_php"],str)
    assert "user_id" not in row
    assert client.put(f'/v2/portfolio/holdings/{row["id"]}',json={**body,"units":"2"}).status_code==200
    state["user"]="B"
    assert client.get("/v2/portfolio?user_id=A").json()["holdings"]==[]
    assert client.put(f'/v2/portfolio/holdings/{row["id"]}',json=body).status_code==404
    assert client.delete(f'/v2/portfolio/holdings/{row["id"]}').status_code==404
    assert client.post("/v2/portfolio/holdings",json={**body,"user_id":"A"}).status_code==422
    state["user"]="A"
    assert client.delete(f'/v2/portfolio/holdings/{row["id"]}').status_code==200
    assert client.get("/v2/portfolio").json()["holdings"]==[]


@pytest.mark.parametrize("path,method",[("","get"),("/holdings","post"),("/snapshot","post"),("/scenarios/plan","post")])
def test_free_gated_server_side(endpoint,path,method):
    client,state=endpoint; state["mode"]="free"
    assert getattr(client,method)("/v2/portfolio"+path).status_code==403


@pytest.mark.parametrize("mode",["plan","recommendation"])
@pytest.mark.parametrize("route",["gcash","dragonfi","gotrade"])
def test_canonical_scenario_parity_and_injection(endpoint,mode,route):
    client,state=endpoint
    client.post("/v2/portfolio/holdings",json={"provider":"gotrade","product_id":"gotrade_vt","units":"1"})
    body={"contribution_amount":"1000","route_id":route}
    result=client.post(f"/v2/portfolio/scenarios/{mode}",json=body)
    assert result.status_code==200, result.text
    data=result.json()
    assert Decimal(data["current_portfolio_value"])==5000
    portfolio,_=api.load_portfolio("A",None,state["saved"])
    request=api.scenario_request(api.PortfolioScenario(**body),state["saved"],portfolio)
    expected=(api.plan_response(api.plan_monthly_contribution(request)) if mode=="plan" else api.recommendation_response(api.recommend_next_contribution(request))).model_dump(mode="json")
    assert data==expected
    if mode=="plan":
        assert sum(Decimal(data[k]) for k in ["invested_amount","verify_minimum_amount","unallocated_amount","reserve_amount"])==1000
    for key in ["user_id","target","current_portfolio","readiness","owned_product_ids"]:
        assert client.post(f"/v2/portfolio/scenarios/{mode}",json={**body,key:{}}).status_code==422


def test_catalog_has_no_partnership_information():
    assert len(catalog())==12
    assert {x["product_id"] for x in catalog()}==set(UNIVERSE)
    assert "affiliate" not in str(catalog())


def test_chat_owner_grounding_and_decision_guard(endpoint):
    client,state=endpoint
    client.post("/v2/portfolio/holdings",json={"provider":"gotrade","product_id":"gotrade_vt","units":"1"})
    result=client.post("/chat",json={"message":"What is my current portfolio worth?"})
    assert result.status_code==200 and "5,000.00" in result.json()["reply"]
    state["user"]="B"
    result=client.post("/chat?user_id=A",json={"message":"What is my current portfolio worth?"})
    assert "No holdings" in result.json()["reply"] and "5,000" not in result.json()["reply"]
    assert client.post("/chat",json={"message":"portfolio","user_id":"A"}).status_code==422
    for question in ["Should I sell Bitcoin?","Which broker is best for me?","Buy VT now"]:
        assert client.post("/chat",json={"message":question}).json()["intent"]=="decision_boundary"


@pytest.mark.parametrize("state_change",[{"age":172801},{"missing":{"usd_php"}}])
def test_partial_or_stale_cannot_become_canonical_scenario(endpoint,state_change):
    client,state=endpoint
    client.post("/v2/portfolio/holdings",json={"provider":"gotrade","product_id":"gotrade_vt","units":"1"})
    state.update(state_change)
    assert client.get("/v2/portfolio").status_code==200
    assert client.post("/v2/portfolio/scenarios/plan",json={"contribution_amount":"1000","route_id":"gotrade"}).status_code==409


def test_foundation_reserve_short_term_block_and_auth(endpoint):
    client,state=endpoint
    client.post("/v2/portfolio/holdings",json={"provider":"gotrade","product_id":"gotrade_vt","units":"1"})
    state["saved"]=saved(high_interest_debt="difficult_to_manage")
    result=client.post("/v2/portfolio/scenarios/plan",json={"contribution_amount":"1000","route_id":"gotrade"})
    assert result.status_code==200 and Decimal(result.json()["reserve_amount"])==1000
    assert result.json()["allocations"]==[]
    state["saved"]=saved(horizon="less_than_3_years",selected_approach="short_term")
    assert all(s["target_percentage"] is None for s in client.get("/v2/portfolio").json()["sleeves"])
    assert client.post("/v2/portfolio/scenarios/plan",json={"contribution_amount":"1000","route_id":"gotrade"}).status_code==409
    client.app.dependency_overrides.clear()
    assert client.get("/v2/portfolio").status_code==401


def test_missing_migration_does_not_fabricate_empty_portfolio(monkeypatch):
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    def unavailable(*args,**kwargs): raise HTTPException(503,"unavailable")
    monkeypatch.setattr(api,"load_portfolio",unavailable)
    assert api.optional_portfolio("A","Bearer fixture",saved()) is None


def test_fixture_server_not_imported_in_production():
    from pathlib import Path
    assert "e2e_portfolio_app" not in Path("app/main.py").read_text()
    assert "ARBOR_PORTFOLIO_E2E" not in Path("app/services/portfolio_store.py").read_text()
