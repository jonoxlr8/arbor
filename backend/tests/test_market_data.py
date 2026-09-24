from datetime import datetime, timezone, timedelta
from decimal import Decimal
import httpx
import pytest
from app.market_data.adapters import VendorHTTP, Marketstack, ExchangeRate, Coinranking, BTC_UUID
from app.market_data.models import ReferencePrice, MarketDataError, FUND_CLASSES, manual_nav
from app.market_data.refresh import refresh
from app.market_data.cache import SharedCache
from app.config import live_portfolio_enabled
from app.services.live_portfolio import value_portfolio, FixtureMarketData, price_limits
from test_live_portfolio import holding

NOW = datetime(2026, 9, 24, 0, 0, tzinfo=timezone.utc)


def response(kind):
    if kind == "marketstack":
        return {"data": [{"symbol": s, "close": "123.1234567890124", "date": NOW.isoformat(), "price_currency": "usd"} for s in ("VT", "VGT", "BND")]}
    if kind == "exchangerate_api":
        return {"result": "success", "base_code": "USD", "rates": {"PHP": "56.123456789012"}, "time_last_update_unix": int(NOW.timestamp())}
    return {"status": "success", "data": {"price": "3000000.123456789012", "timestamp": int(NOW.timestamp())}}


def adapter(kind, handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    http = VendorHTTP(client)
    return {"marketstack": lambda: Marketstack(http, "synthetic"), "exchangerate_api": lambda: ExchangeRate(http),
            "coinranking": lambda: Coinranking(http, "synthetic")}[kind]()


def handler(kind, calls):
    def call(request):
        calls.append(request)
        if request.url.path.endswith("reference-currencies"):
            assert request.url.params["search"] == "PHP"
            return httpx.Response(200, json={"status":"success","data":{"currencies":[{"uuid":"synthetic_php","symbol":"PHP","type":"fiat"}]}})
        if kind == "coinranking":
            assert request.url.path == f"/v2/coin/{BTC_UUID}/price"
            assert request.url.params["referenceCurrencyUuid"] == "synthetic_php"
        return httpx.Response(200, json=response(kind))
    return call


@pytest.mark.parametrize("kind", ["marketstack", "exchangerate_api", "coinranking"])
def test_normalized_vendor_contract(kind):
    calls=[]
    prices=adapter(kind, handler(kind,calls)).fetch(NOW)
    assert len(prices) == (3 if kind=="marketstack" else 1)
    assert all(p.source==kind and p.as_of==NOW and p.fetched_at==NOW and p.verified for p in prices)
    assert prices[0].value == Decimal({"marketstack":"123.123456789012","exchangerate_api":"56.123456789012","coinranking":"3000000.123456789012"}[kind])
    assert all(r.url.scheme=="https" for r in calls)
    if kind=="coinranking": assert len(calls)==2 and prices[0].reference_id=="synthetic_php"


@pytest.mark.parametrize("kind", ["marketstack", "exchangerate_api", "coinranking"])
@pytest.mark.parametrize("failure", ["timeout",429,500,302,"bad_json","missing","negative","future"])
def test_vendor_failures_are_sanitized(kind,failure):
    def fail(request):
        if failure=="timeout": raise httpx.ReadTimeout("secret-in-url",request=request)
        if isinstance(failure,int): return httpx.Response(failure,text="secret-provider-message")
        if failure=="bad_json": return httpx.Response(200,text="secret-not-json")
        if failure=="missing": return httpx.Response(200,json={})
        body=response(kind)
        if kind=="marketstack":
            body["data"][0]["close" if failure=="negative" else "date"] = "-1" if failure=="negative" else (NOW+timedelta(days=1)).isoformat()
        elif kind=="exchangerate_api":
            if failure=="negative": body["rates"]["PHP"]="-1"
            else: body["time_last_update_unix"]=int((NOW+timedelta(days=1)).timestamp())
        else:
            if failure=="negative": body["data"]["price"]="-1"
            else: body["data"]["timestamp"]=int((NOW+timedelta(days=1)).timestamp())
        return httpx.Response(200,json=body)
    previous=ReferencePrice(price_key="btc_php",value="1",as_of=NOW,fetched_at=NOW,currency="PHP",kind="btc_reference",source="coinranking",reference_id="synthetic_php")
    with pytest.raises(MarketDataError) as error: adapter(kind,fail).fetch(NOW,previous)
    assert "secret" not in str(error.value)


def test_unknown_symbol_never_fetches():
    with pytest.raises(MarketDataError,match="unsupported_symbol"):
        adapter("marketstack",lambda _:pytest.fail("Unexpected fetch")).fetch(NOW,symbols=("AAPL",))


@pytest.mark.parametrize("currencies", [[],[{"symbol":"PHP","type":"coin","uuid":"wrong"}],
    [{"symbol":"PHP","type":"fiat","uuid":"a"},{"symbol":"PHP","type":"fiat","uuid":"b"}],
    [{"symbol":"PHP","type":"fiat","uuid":"https://bad"}]])
def test_php_resolution_fails_closed(currencies):
    with pytest.raises(MarketDataError):
        adapter("coinranking",lambda _:httpx.Response(200,json={"status":"success","data":{"currencies":currencies}})).fetch(NOW)


class Cache:
    def __init__(self): self.rows={};self.claims=set();self.intervals=[]
    def read(self,keys): return {k:self.rows[k] for k in keys if k in self.rows}
    def claim(self,source,interval):
        self.intervals.append(interval)
        if source in self.claims:return False
        self.claims.add(source);return True
    def write(self,prices): self.rows.update({p.price_key:p for p in prices})


@pytest.mark.parametrize("kind", ["marketstack", "exchangerate_api", "coinranking"])
def test_shared_cache_reuse_and_failure_retention(kind):
    calls=[];cache=Cache();a=adapter(kind,handler(kind,calls))
    assert refresh(cache,[a],NOW)[kind]=="updated"
    initial=len(calls);old=dict(cache.rows)
    assert refresh(cache,[a],NOW+timedelta(seconds=a.interval-1))[kind]=="cached"
    assert len(calls)==initial
    assert refresh(cache,[a],NOW+timedelta(seconds=a.interval))[kind]=="cooldown"
    cache.claims.clear()
    failed=adapter(kind,lambda _:httpx.Response(429))
    assert refresh(cache,[failed],NOW+timedelta(seconds=a.interval))[kind]=="rate_limited"
    assert cache.rows==old
    if kind=="coinranking": assert cache.intervals[0]==1200 and cache.intervals[-1]==600


def test_refresh_isolates_sources_and_two_users_do_not_fetch():
    cache=Cache(); calls=[]
    adapters=[adapter(k,handler(k,calls)) for k in ("marketstack","exchangerate_api")]
    adapters.append(adapter("coinranking",lambda _:httpx.Response(503)))
    result=refresh(cache,adapters,NOW)
    assert result=={"marketstack":"updated","exchangerate_api":"updated","coinranking":"provider_unavailable"}
    assert len(cache.rows)==4
    # User valuation consumes the same cache; provider calls stay at two total.
    for _ in range(2):
        p=value_portfolio([holding("gotrade_vt","1")],FixtureMarketData(list(cache.rows.values())),None,NOW)
        assert p.complete and p.data_sources==("exchangerate_api","marketstack")
    assert len(calls)==2


@pytest.mark.parametrize("product",list(FUND_CLASSES))
def test_exact_nav_identity(product):
    source = "https://www.atram.com.ph/fund" if product.startswith("gcash") else "https://www.bpi.com.ph/fund"
    record=manual_nav(product,"1.123456789012","2026-09-24",source,FUND_CLASSES[product],NOW)
    cache=Cache();cache.write([record]);assert cache.rows[product]==record
    assert record.provenance==source and record.currency=="PHP"
    with pytest.raises(ValueError):
        manual_nav(product,"1","2026-09-24",source,"wrong class",NOW)


@pytest.mark.parametrize("value",["-1","0","NaN","Infinity","bad","1e1000"])
def test_invalid_nav(value):
    with pytest.raises((ValueError,ArithmeticError)):
        manual_nav("dragonfi_defensive",value,"2026-09-24","https://www.bpi.com.ph/fund","PHP",NOW)


@pytest.mark.parametrize("day,source,unit",[("2026-09-25","https://www.bpi.com.ph/fund","PHP"),
    ("bad","https://www.bpi.com.ph/fund","PHP"),("2026-09-24","http://www.bpi.com.ph/fund","PHP"),
    ("2026-09-24","https://bpi.com.ph.evil/fund","PHP"),("2026-09-24","https://www.bpi.com.ph/fund?key=secret","PHP"),
    ("2026-09-24","https://www.bpi.com.ph/fund","USD / Class A")])
def test_nav_rejects_wrong_date_source_class(day,source,unit):
    with pytest.raises(ValueError):manual_nav("dragonfi_defensive","1",day,source,unit,NOW)


def test_production_flag_alone_is_not_activation(monkeypatch):
    monkeypatch.setenv("APP_ENV","production");monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED","true")
    for key in ("MARKETSTACK_API_KEY","COINRANKING_API_KEY","MARKETSTACK_DISPLAY_RIGHTS_CONFIRMED"):
        monkeypatch.delenv(key,raising=False)
    assert not live_portfolio_enabled()
    monkeypatch.setenv("MARKETSTACK_API_KEY","synthetic");monkeypatch.setenv("COINRANKING_API_KEY","synthetic")
    assert not live_portfolio_enabled()
    monkeypatch.setenv("MARKETSTACK_DISPLAY_RIGHTS_CONFIRMED","true")
    assert live_portfolio_enabled()


def test_freshness_matches_private_beta_cadence():
    assert price_limits("btc_php")== (600,3600)
    assert price_limits("usd_php")== (172800,345600)


def test_missing_keys_do_not_spend_refresh_slots():
    cache=Cache()
    assert refresh(cache,[Marketstack(None,None),Coinranking(None,None)],NOW)=={
        "marketstack":"configuration_required","coinranking":"configuration_required"}
    assert not cache.claims


def test_normalized_cache_rejects_unverified_identity_and_raw_vendor_fields():
    raw=response("coinranking")
    with pytest.raises(ValueError):ReferencePrice.model_validate(raw)
    for product in ("gcash_global_equity","gcash_technology","gcash_defensive"):
        with pytest.raises(ValueError):
            ReferencePrice(price_key=product,value="1",as_of=NOW,fetched_at=NOW,
                currency="PHP",kind="nav",source="official_nav",unit_class="guessed",
                provenance="https://www.atram.com.ph/fund")


def test_vendor_number_decoded_as_decimal_not_float():
    http=VendorHTTP(httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,text='{"value":56.123456789012}'))))
    assert http.get("https://open.er-api.com/v6/latest/USD")["value"] == Decimal("56.123456789012")


def test_writer_only_targets_cache_and_lease():
    calls=[]
    def capture(r):
        calls.append(r)
        return httpx.Response(200,json=True) if "/rpc/" in r.url.path else httpx.Response(201)
    cache=SharedCache(httpx.Client(transport=httpx.MockTransport(capture)),"https://synthetic.supabase.co","sb_secret_synthetic_test_only")
    record=manual_nav("dragonfi_defensive","1","2026-09-24","https://www.bpi.com.ph/fund","PHP",NOW)
    cache.write([record]);assert cache.claim("coinranking",600)
    assert [r.url.path for r in calls]==["/rest/v1/arbor_market_prices","/rest/v1/rpc/arbor_claim_market_refresh"]
    assert b'"value":"1.000000000000"' in calls[0].content


@pytest.mark.parametrize("url",["http://localhost", "https://evil.com", "https://project.supabase.co?key=x", "https://user:secret@project.supabase.co"])
def test_writer_rejects_untrusted_configuration(url):
    with pytest.raises(MarketDataError):SharedCache(None,url,"synthetic")
