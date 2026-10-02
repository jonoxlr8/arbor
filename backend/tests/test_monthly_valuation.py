from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from app.market_data.models import FUND_CLASSES, TOAP_FUNDS, TOAP_PAGES, ReferencePrice, toap_source
from app.services.live_portfolio import Holding, FixtureMarketData, Price, current_values, value_portfolio
from app.services.monthly_valuation import monthly_current_values
from app.services.monthly_plan import IndicativeNav, calculate_monthly_plan, explain_monthly_plan
from test_monthly_plan import saved, endpoint  # noqa: F401
from test_profile_v2 import HEADERS

NOW = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)


def nav(product="gcash_technology", seconds=3 * 86400):
    return ReferencePrice(price_key=product, value="2.50", as_of=NOW-timedelta(seconds=seconds),
        fetched_at=NOW, currency="PHP", kind="nav", source="toap", unit_class=FUND_CLASSES[product],
        reference_id=TOAP_FUNDS[product], provenance=TOAP_PAGES[toap_source(product)])


def holding(product="gcash_technology", **kwargs):
    return Holding(id=uuid4(), provider="gcash" if product.startswith("gcash") else "dragonfi",
        product_id=product, units="100", created_at=NOW, updated_at=NOW, **kwargs)


def valued(quote):
    store = FixtureMarketData([quote])
    return value_portfolio([holding(quote.price_key)], store, None, now=NOW), store


@pytest.mark.parametrize("product", list(FUND_CLASSES))
@pytest.mark.parametrize("seconds", [172800, 172801, 604800])
def test_verified_exact_class_dates_and_global_guard_remains(product, seconds):
    portfolio, store = valued(nav(product, seconds))
    current, estimates = monthly_current_values(portfolio, store, NOW)
    assert portfolio.total_value_php == Decimal("250.00")
    assert sum(s.known_value_php for s in portfolio.sleeves) == 250
    assert current.owned_product_ids == {product}
    if seconds > 172800:
        assert estimates == ({"product_id": product, "as_of": nav(product, seconds).as_of,
                              "source": "toap", "unit_class": FUND_CLASSES[product]},)
        with pytest.raises(ValueError):
            current_values(portfolio)
    else:
        assert estimates == ()


@pytest.mark.parametrize("seconds", [604801, -1])
def test_outside_bound_blocks_without_omitting_holding(seconds):
    if seconds < 0:
        quote = nav().model_copy(update={"as_of": NOW+timedelta(seconds=1)})
    else:
        quote = nav(seconds=seconds)
    portfolio, store = valued(quote)
    with pytest.raises(ValueError):
        monthly_current_values(portfolio, store, NOW)


@pytest.mark.parametrize("patch", [
    {"verified": False}, {"unit_class": "USD"}, {"reference_id": "Different fund"},
    {"provenance": "https://example.test/nav"}, {"fetched_at": NOW+timedelta(seconds=1)},
    {"as_of": NOW+timedelta(seconds=1)}, {"value": Decimal("2.51")},
    {"as_of": NOW-timedelta(days=4)},
])
def test_identity_future_or_concurrent_cache_change_fails_closed(patch):
    quote = nav()
    portfolio, _ = valued(quote)
    with pytest.raises(ValueError):
        monthly_current_values(portfolio, FixtureMarketData([quote.model_copy(update=patch)]), NOW)


def test_missing_unverified_fixture_and_official_source_cannot_admit_stale_nav():
    quote = nav()
    portfolio, _ = valued(quote)
    for prices in [[], [Price(price_key=quote.price_key, value=quote.value, as_of=quote.as_of)],
                   [quote.model_copy(update={"source": "official_nav", "provenance": "https://atram.com.ph/nav"})]]:
        with pytest.raises(ValueError):
            monthly_current_values(portfolio, FixtureMarketData(prices), NOW)


def test_mixed_expired_holding_blocks_whole_portfolio_and_manual_fallback_remains():
    quote = nav()
    store = FixtureMarketData([quote])
    portfolio = value_portfolio([holding(), holding("dragonfi_defensive")], store, None, now=NOW)
    with pytest.raises(ValueError):
        monthly_current_values(portfolio, store, NOW)
    manual = holding("dragonfi_defensive", manual_value_php="500", manual_value_updated_at=NOW)
    portfolio = value_portfolio([holding(), manual], store, None, now=NOW)
    current, estimates = monthly_current_values(portfolio, store, NOW)
    assert portfolio.total_value_php == 750 and len(estimates) == 1
    assert current.defensive == 500 and current.technology_tilt == 250


def test_stale_non_nav_still_blocks_in_mixed_portfolio():
    portfolio, store = valued(nav())
    other = portfolio.holdings[0].model_copy(update={"price_kind": "reference", "valuation_source": "market_reference"})
    with pytest.raises(ValueError):
        monthly_current_values(portfolio.model_copy(update={"holdings": (*portfolio.holdings, other), "stale_count": 2}), store, NOW)


def test_monthly_http_get_post_and_ask_explanation_never_write(endpoint, monkeypatch):
    from app.routes import live_portfolio
    client, state = endpoint
    monkeypatch.setenv("LIVE_PORTFOLIO_ENABLED", "true")
    real_now = datetime.now(timezone.utc)
    quote = nav().model_copy(update={"as_of": real_now-timedelta(days=3), "fetched_at": real_now})
    store = FixtureMarketData([quote])
    portfolio = value_portfolio([holding()], store, None, now=real_now)
    monkeypatch.setattr(live_portfolio, "load_portfolio", lambda *args: (portfolio, store))
    assert client.get("/v2/monthly-plan", headers=HEADERS).status_code == 409
    assert client.post("/v2/monthly-plan", headers=HEADERS, json={"contribution_amount": "1234.56"}).status_code == 409
    assert client.post("/v2/monthly-plan", headers=HEADERS, json={"allow_indicative_nav": "true"}).status_code == 422
    for response in [client.post("/v2/monthly-plan", headers=HEADERS,
                      json={"contribution_amount": "1234.56", "allow_indicative_nav": True})]:
        assert response.status_code == 200
        assert response.json()["indicative_navs"][0]["source"] == "toap"
        assert Decimal(response.json()["contribution_amount"]) == sum(Decimal(r["amount"]) for r in response.json()["rows"])
        assert response.headers["cache-control"] == "private, no-store"
    plan = calculate_monthly_plan(saved(), monthly_current_values(portfolio, store, real_now)[0]).model_copy(
        update={"indicative_navs": (IndicativeNav(product_id=quote.price_key, as_of=quote.as_of, source="toap", unit_class=quote.unit_class),)})
    assert "Actual purchase prices and units may differ" in explain_monthly_plan("monthly", plan)
    assert "latest NAVs available to Arbor" in explain_monthly_plan("monthly", plan)
    from app.routes import chat
    monkeypatch.setattr(chat, "ask_arbor", lambda *args, **kwargs: pytest.fail("No LLM or vendor call"))
    response = client.post("/chat", headers=HEADERS, json={"message": "How much is my monthly plan?"})
    assert response.status_code == 200 and response.json()["intent"] == "monthly_plan"
    assert "latest NAVs available to Arbor" in response.json()["reply"]
    assert "Actual purchase prices and units may differ" in response.json()["reply"]
    assert state["writes"] == []

@pytest.mark.parametrize("expired", [None, "gotrade_vt", "usd_php", "btc_php"])
def test_actual_mixed_asset_prices_keep_existing_freshness_boundaries(expired):
    prices = [nav(),
        Price(price_key="gotrade_vt", value="100", as_of=NOW-timedelta(days=1), source="marketstack"),
        Price(price_key="usd_php", value="56", as_of=NOW-timedelta(hours=1), source="exchangerate_api"),
        Price(price_key="btc_php", value="3000000", as_of=NOW-timedelta(seconds=60), source="coinranking")]
    if expired:
        key = next(i for i,p in enumerate(prices) if p.price_key == expired)
        age = timedelta(seconds=601) if expired == "btc_php" else timedelta(days=3)
        prices[key] = prices[key].model_copy(update={"as_of": NOW-age})
    holdings = [holding(),
        Holding(id=uuid4(), provider="gotrade", product_id="gotrade_vt", units="1", created_at=NOW, updated_at=NOW),
        Holding(id=uuid4(), provider="coins_ph", product_id="coins_btc", units="0.001", created_at=NOW, updated_at=NOW)]
    store = FixtureMarketData(prices)
    portfolio = value_portfolio(holdings, store, None, now=NOW)
    if expired:
        with pytest.raises(ValueError):
            monthly_current_values(portfolio, store, NOW)
    else:
        current, estimates = monthly_current_values(portfolio, store, NOW)
        assert current.global_equity == 5600 and current.crypto == 3000 and current.technology_tilt == 250
        assert len(estimates) == 1 and portfolio.total_value_php == 8850
