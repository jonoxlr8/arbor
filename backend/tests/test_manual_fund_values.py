from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.services.live_portfolio import Holding, HoldingInput, ManualValueInput, MANUAL_FUNDS, current_values
from app.services.portfolio_store import PortfolioStore
from app.services.arbor.portfolio_explanation import explain_portfolio
from app.services.arbor.v2_explanations import classify_v2_question
from app.services.next_action import get_next_action
from app.routes.live_portfolio import PortfolioScenario, scenario_request
from app.services.contributions.planner import plan_monthly_contribution
from test_live_portfolio import holding, price, valued, NOW, saved, endpoint


def manual(product="gcash_global_equity", value="8000.25", age=0):
    return Holding(**{**holding(product, "10").model_dump(), "manual_value_php": value,
                      "manual_value_updated_at": NOW-timedelta(seconds=age)})


@pytest.mark.parametrize("question", ["What is my portfolio worth?", "How is my fund valued?"])
def test_manual_value_questions_route_to_canonical_holdings(question):
    assert classify_v2_question(question) == ("investment", "actual_holdings")
    result = valued([manual().model_copy(update={"units": None})], [])
    reply = explain_portfolio(question, result)
    assert "8,000.25" in reply and "Sep 24, 2026" in reply
    assert "not an official NAV" in reply and "does not currently have units" in reply
    assert "from GFunds" in reply and "GCash /" not in reply


@pytest.mark.parametrize("product", sorted(MANUAL_FUNDS))
def test_each_fund_manual_whole_value_not_units_times_value(product):
    result = valued([manual(product)], [])
    assert result.total_value_php == Decimal("8000.25")
    assert result.holdings[0].valuation_source == "manual_user"
    assert result.holdings[0].as_of == NOW
    assert result.provider_values_php[holding(product).provider] == Decimal("8000.25")
    assert result.model_dump(mode="json")["holdings"][0]["manual_value_php"] == "8000.25"


@pytest.mark.parametrize("value", ["0", "-1", "NaN", "Infinity", "-Infinity", "abc", "1.001", "10000000000000000", True])
def test_invalid_money(value):
    with pytest.raises(ValidationError): ManualValueInput(manual_value_php=value)


@pytest.mark.parametrize("product", ["gotrade_vt", "gotrade_vgt", "gotrade_bnd", "gcrypto_btc", "coins_btc", "pdax_btc", "AAPL"])
def test_no_manual_override_for_other_assets(product):
    with pytest.raises((ValidationError, KeyError)): manual(product)


@pytest.mark.parametrize("field", ["user_id", "manual_value_updated_at", "source", "target"])
def test_no_client_metadata(field):
    with pytest.raises(ValidationError): ManualValueInput(**{"manual_value_php": "1", field: "injected"})


@pytest.mark.parametrize("age,source,value", [(0,"nav",1000),(172801,"nav",1000),(604800,"nav",1000),(604801,"manual_user",8000.25)])
def test_canonical_priority(age,source,value):
    result = valued([manual()], [price("gcash_global_equity", "100", age)])
    assert result.holdings[0].valuation_source == source
    assert result.total_value_php == Decimal(str(value))
    if 172800 < age <= 604800:
        with pytest.raises(ValueError): current_values(result)


@pytest.mark.parametrize("age,usable", [(0,True),(604800,True),(604801,False),(-1,False)])
def test_manual_freshness_and_partial_behavior(age,usable):
    result=valued([manual(age=age)], [])
    assert result.complete is usable
    if usable: assert current_values(result).global_equity == Decimal("8000.25")
    else:
        assert result.total_value_php is None and result.known_value_php == 0
        assert all(s.current_percentage is None for s in result.sleeves)
        with pytest.raises(ValueError): current_values(result)
        assert get_next_action(saved(),portfolio=result).key == "update_portfolio"
        assert get_next_action(saved(high_interest_debt="difficult_to_manage"),portfolio=result).key == "financial_foundation"


def test_mixed_contribution_chat_and_alignment():
    result=valued([manual(), holding("gotrade_vt","2"),holding("coins_btc",".001")],
                 [price("gotrade_vt","100"),price("usd_php","50"),price("btc_php","1000000")])
    assert result.total_value_php == Decimal("19000.25")
    assert result.sleeves[0].known_value_php == Decimal("18000.25")
    request=scenario_request(PortfolioScenario(contribution_amount="1000",route_id="gotrade"),saved(),result)
    scenario=plan_monthly_contribution(request)
    assert request.current_portfolio.global_equity == Decimal("18000.25")
    assert sum(getattr(scenario,k) for k in ["invested_amount","verify_minimum_amount","reserve_amount","unallocated_amount"]) == 1000
    text=explain_portfolio("What is my current portfolio worth?",result)
    assert "19,000.25" in text and "8,000.25" in text and "You entered" in text and "not an official NAV" in text
    assert "Sep 24, 2026" in text


def test_store_owner_and_minimal_payload(monkeypatch):
    client=MagicMock(); monkeypatch.setattr("app.services.portfolio_store.get_authenticated_client",lambda _:client)
    store=PortfolioStore("A","Bearer test"); row=manual()
    monkeypatch.setattr(store,"holdings",lambda:[row])
    store.save_manual_value(row.id,ManualValueInput(manual_value_php="12.45"))
    client.table.assert_called_with("arbor_portfolio_holdings")
    client.table().update.assert_called_with({"manual_value_php":"12.45"},returning="minimal")
    client.table().update().eq.assert_called_with("user_id","A")
    store.save_manual_value(row.id,ManualValueInput(manual_value_php=None))
    client.table().update.assert_called_with({"manual_value_php":None},returning="minimal")
    monkeypatch.setattr(store,"holdings",lambda:[])
    with pytest.raises(HTTPException) as error: store.save_manual_value(row.id,ManualValueInput(manual_value_php="1"))
    assert error.value.status_code == 404
    other=holding(); monkeypatch.setattr(store,"holdings",lambda:[other])
    with pytest.raises(HTTPException) as error: store.save_manual_value(other.id,ManualValueInput(manual_value_php="1"))
    assert error.value.status_code == 422


def test_endpoint_auth_gate_and_request_validation(endpoint,monkeypatch):
    client,state=endpoint
    from app.routes import live_portfolio as api
    calls=[]
    monkeypatch.setattr(api.PortfolioStore,"save_manual_value",lambda self,id,request:calls.append((self.owner,id,request)),raising=False)
    id=holding().id; url=f"/v2/portfolio/holdings/{id}/manual-value"
    assert client.put(url,json={"manual_value_php":"1200.25"}).status_code==200
    assert calls[0][0]=="A"
    for body in [{"manual_value_php":"NaN"},{"manual_value_php":"1","user_id":"B"},{"manual_value_php":"1","manual_value_updated_at":NOW.isoformat()}]:
        assert client.put(url,json=body).status_code==422
    state["mode"]="free"
    assert client.put(url,json={"manual_value_php":"1"}).status_code==403
    monkeypatch.delenv("LIVE_PORTFOLIO_ENABLED")
    assert client.put(url,json={"manual_value_php":"1"}).status_code==404
    client.app.dependency_overrides.clear()
    assert client.put(url,json={"manual_value_php":"1"}).status_code==401


@pytest.mark.parametrize("product", sorted(MANUAL_FUNDS))
def test_value_only_input_and_nav_requires_units(product):
    request=HoldingInput(provider=holding(product).provider,product_id=product,manual_value_php="8000")
    assert request.units is None
    row=Holding(**request.model_dump(),id=holding().id,created_at=NOW,updated_at=NOW,manual_value_updated_at=NOW)
    for quotes in [[],[price(product,"100")],[price(product,"100",172801)]]:
        result=valued([row],quotes)
        assert result.total_value_php == 8000
        assert result.holdings[0].valuation_source == "manual_user"
        assert "does not currently have units" in explain_portfolio("current portfolio",result)
        assert sum(s.known_value_php for s in result.sleeves)==8000
        assert sum(s.current_percentage for s in result.sleeves)==100
        assert sum(getattr(current_values(result),s.sleeve.value) for s in result.sleeves)==8000
    with_units=Holding(**{**row.model_dump(),"units":"10"})
    assert valued([with_units],[price(product,"100")]).total_value_php==1000
    assert valued([with_units],[price(product,"100")]).holdings[0].valuation_source=="nav"
    stale=Holding(**{**row.model_dump(),"manual_value_updated_at":NOW-timedelta(days=8)})
    assert valued([stale],[price(product)]).holdings[0].value_php is None


@pytest.mark.parametrize("product", ["gcash_global_equity","dragonfi_defensive","gotrade_vt","pdax_btc"])
def test_missing_tracking_input_rejected(product):
    with pytest.raises(ValidationError):
        HoldingInput(provider=holding(product).provider,product_id=product,units=None)


@pytest.mark.parametrize("product", ["gotrade_vt","gotrade_vgt","gotrade_bnd","gcrypto_btc","coins_btc","pdax_btc"])
def test_nonfund_value_only_and_override_rejected(product):
    for units in [None,"1"]:
        with pytest.raises(ValidationError):
            HoldingInput(provider=holding(product).provider,product_id=product,units=units,manual_value_php="8000")


def test_cannot_clear_only_tracking_input(monkeypatch):
    client=MagicMock();monkeypatch.setattr("app.services.portfolio_store.get_authenticated_client",lambda _:client)
    store=PortfolioStore("A","Bearer test")
    row=Holding(**{**manual().model_dump(),"units":None})
    monkeypatch.setattr(store,"holdings",lambda:[row])
    with pytest.raises(HTTPException) as error: store.save_manual_value(row.id,ManualValueInput(manual_value_php=None))
    assert error.value.status_code==422
    client.table.assert_not_called()


def test_value_only_create_and_adding_units_does_not_reaffirm_manual_timestamp(monkeypatch):
    client=MagicMock();monkeypatch.setattr("app.services.portfolio_store.get_authenticated_client",lambda _:client)
    store=PortfolioStore("A","Bearer test")
    request=HoldingInput(provider="gcash",product_id="gcash_global_equity",manual_value_php="8000")
    store.save(request)
    payload=client.table().insert.call_args.args[0]
    assert payload["units"] is None and payload["manual_value_php"]=="8000"
    assert "user_id" not in payload and "manual_value_updated_at" not in payload
    row=Holding(**{**manual(value="8000").model_dump(),"units":None})
    monkeypatch.setattr(store,"holdings",lambda:[row])
    store.save(HoldingInput(**{**request.model_dump(),"units":"10"}),row.id)
    changes=client.table().update.call_args.args[0]
    assert changes["units"]=="10"
    assert "manual_value_php" not in changes and "manual_value_updated_at" not in changes
