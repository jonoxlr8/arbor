"""Offline NAV valuation, operator correction and refresh safety boundaries."""
from datetime import timedelta
import pytest
from app.market_data.models import FUND_CLASSES, manual_nav, ReferencePrice, MarketDataError
from app.market_data.refresh import refresh
from app.services.live_portfolio import value_portfolio, FixtureMarketData
from test_market_data import NOW, Cache
from test_live_portfolio import holding


def nav(product, day="2026-09-23", value="100"):
    host="atram.com.ph" if product.startswith("gcash") else "bpi.com.ph"
    return manual_nav(product,value,day,f"https://www.{host}/fund",FUND_CLASSES[product],NOW)


@pytest.mark.parametrize("product",FUND_CLASSES)
def test_exact_nav_contract_currency_and_stale_fallback(product):
    price=nav(product)
    assert price.kind=="nav" and price.currency=="PHP" and price.unit_class==FUND_CLASSES[product]
    with pytest.raises(ValueError):
        ReferencePrice.model_validate({**price.model_dump(),"currency":"USD"})
    with pytest.raises(ValueError):
        ReferencePrice.model_validate({**price.model_dump(),"unit_class":"Class A / USD"})
    for days,expected in ((1,"fresh"),(3,"stale"),(8,"unavailable")):
        result=value_portfolio([holding(product,"1")],FixtureMarketData([price]),None,price.as_of+timedelta(days=days))
        assert result.holdings[0].freshness==expected
        assert (result.total_value_php is None)==(expected=="unavailable")


@pytest.mark.parametrize("product",FUND_CLASSES)
@pytest.mark.parametrize("day,updated",[("2026-09-22",False),("2026-09-23",False),("2026-09-24",True)])
def test_nav_effective_date_precedence_and_daily_cache(product,day,updated):
    cache=Cache();old=nav(product).model_copy(update={"fetched_at":NOW-timedelta(days=2)})
    cache.write([old]);calls=[]
    class Candidate:
        source="official_nav";keys=(product,);interval=86400
        def fetch(self,now,previous):calls.append(1);return [nav(product,day,"101")]
    result=refresh(cache,[Candidate()],NOW)
    assert result["official_nav"]==("updated" if updated else "older_data_ignored")
    assert cache.rows[product]==(nav(product,day,"101") if updated else old)
    assert len(calls)==1
    if updated:
        assert refresh(cache,[Candidate()],NOW+timedelta(hours=1))["official_nav"]=="cached"
        assert len(calls)==1


def test_nav_failure_preserves_all_cached_sources():
    cache=Cache();cache.write([nav(p).model_copy(update={"fetched_at":NOW-timedelta(days=2)}) for p in FUND_CLASSES])
    before=dict(cache.rows)
    class FailedSource:
        source="official_nav";keys=tuple(FUND_CLASSES);interval=86400
        def fetch(self,*_):raise MarketDataError("provider_unavailable")
    assert refresh(cache,[FailedSource()],NOW)=={"official_nav":"provider_unavailable"}
    assert cache.rows==before


def test_refresh_cli_configuration_failure_does_not_claim_permission_gate(monkeypatch,capsys):
    from app.market_data import __main__ as cli
    monkeypatch.setattr(cli.sys,"argv",["market_data","refresh"])
    def unavailable(*_):raise MarketDataError("cache_configuration_required")
    monkeypatch.setattr(cli,"SharedCache",unavailable)
    assert cli.main()==1
    output=capsys.readouterr().out
    assert "permission_required" not in output
