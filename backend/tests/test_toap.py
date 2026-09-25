"""Offline authorized-source contract. No network, secrets or hosted writes."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from app.market_data.models import (FUND_CLASSES, TOAP_FUNDS, TOAP_PAGES,
                                    ReferencePrice, MarketDataError, manual_nav, toap_source)
from app.market_data.toap import TOAP, TOAPRequestGate, parse_nav_page
from app.market_data.refresh import refresh
from app.market_data.cache import SharedCache
from app.services.live_portfolio import FixtureMarketData, value_portfolio
from test_market_data import Cache, adapter, handler
from test_live_portfolio import holding

NOW = datetime(2026, 9, 24, 14, tzinfo=timezone.utc)
FIXTURES = Path(__file__).parent / "fixtures"


def html(source):
    return (FIXTURES / f"toap_{'atram' if source == 'atram_nav' else 'bpi'}.html").read_text()


def source_adapter(source, calls, body=None, status=200, enabled=True):
    def respond(request):
        calls.append(request)
        return httpx.Response(status, text=html(source) if body is None else body,
                              headers={"content-type": "text/html; charset=utf-8"})
    return TOAP(httpx.Client(transport=httpx.MockTransport(respond),
                            headers={"Authorization": "secret", "apikey": "secret", "Cookie": "secret"}), source, enabled,
                TOAPRequestGate(sleep=lambda _: None))


@pytest.mark.parametrize("source", TOAP_PAGES)
def test_one_bounded_request_three_exact_classes_and_metadata(source):
    calls = []
    batch = source_adapter(source, calls).fetch(NOW)
    assert not batch.errors and len(batch.prices) == 3 and len(calls) == 1
    request = calls[0]
    assert str(request.url) == TOAP_PAGES[source]
    assert "Arbor" in request.headers["User-Agent"]
    assert all(k not in request.headers for k in ("authorization", "apikey", "cookie"))
    assert request.extensions["timeout"]["read"] == 10
    for price in batch.prices:
        assert price.reference_id == TOAP_FUNDS[price.price_key]
        assert price.unit_class == FUND_CLASSES[price.price_key]
        assert price.provenance == TOAP_PAGES[source]
        assert (price.currency, price.kind, price.source) == ("PHP", "nav", "toap")
        assert price.fetched_at == NOW
        assert price.as_of.day == (24 if price.price_key.endswith("defensive") else 23)
    expected = {"gcash_global_equity": "144.123456789012", "gcash_technology": "520.64",
                "gcash_defensive": "1146.84", "dragonfi_global_equity": "101.59",
                "dragonfi_technology": "98.68", "dragonfi_defensive": "217.54"}
    assert all(p.value == Decimal(expected[p.price_key]) for p in batch.prices)
    if source == "atram_nav":
        assert batch.prices[0].value == Decimal("144.123456789012")
        assert batch.prices[2].value == Decimal("1146.84")


@pytest.mark.parametrize("product", TOAP_FUNDS)
def test_missing_exact_class_never_uses_similar_fund(product):
    source = toap_source(product)
    batch = parse_nav_page(html(source).replace(TOAP_FUNDS[product], "Unsupported class"), source, NOW)
    assert batch.errors == {product: "missing_fund"}
    assert len(batch.prices) == 2


@pytest.mark.parametrize("product", TOAP_FUNDS)
def test_duplicate_exact_class_is_ambiguous_even_if_same_value(product):
    source = toap_source(product)
    body = html(source).replace("</table>", f"<tr><td>{TOAP_FUNDS[product]}</td><td>123</td></tr></table>")
    batch = parse_nav_page(body, source, NOW)
    assert batch.errors == {product: "ambiguous_fund"}
    assert len(batch.prices) == 2


@pytest.mark.parametrize("bad", ["0", "-1", "NaN", "Infinity", "1e2", "1,23", "secret-error", "1000000000000", "0.00000000000001", "101.59 as of nonsense", "101.59 as of Sep 25, 2026"])
def test_invalid_nav_or_row_date_isolated_no_page_fallback(bad):
    body = html("bpi_nav").replace("101.59<br><span>* as of Sep 23, 2026</span>", bad)
    result = parse_nav_page(body, "bpi_nav", NOW)
    assert result.errors == {"dragonfi_global_equity": "invalid_nav_or_date"}
    assert len(result.prices) == 2


@pytest.mark.parametrize("page_date", ["", "not a date", "Sep 25, 2026"])
def test_missing_invalid_future_heading_only_rejects_rows_needing_it(page_date):
    result = parse_nav_page(html("bpi_nav").replace("Sep 24, 2026", page_date), "bpi_nav", NOW)
    assert len(result.prices) == 2
    assert result.errors == {"dragonfi_defensive": "invalid_nav_or_date"}


def test_conflicting_heading_dates_fail_closed_but_individual_dates_survive():
    result = parse_nav_page(html("bpi_nav") + "<h2>Unit Investment Trust Funds - Net Asset Values per unit (UITF NAVpus) as of Sep 22, 2026</h2>", "bpi_nav", NOW)
    assert len(result.prices) == 2 and "dragonfi_defensive" in result.errors


def test_only_case_spacing_normalized_and_nav_column_structural():
    body = html("bpi_nav").replace(TOAP_FUNDS["dragonfi_defensive"], "  bpi   premium\n bond fund  ")
    assert len(parse_nav_page(body, "bpi_nav", NOW).prices) == 3
    assert not parse_nav_page(body.replace("NAVpu", "ROI"), "bpi_nav", NOW).prices
    assert not parse_nav_page(body.replace("<table>", "<div>").replace("</table>", "</div>"), "bpi_nav", NOW).prices


@pytest.mark.parametrize("failure", [302, 429, 500, "timeout", "oversize", "json", "encoding"])
def test_safe_http_failures_no_redirect_or_secret_leak(failure):
    calls = []
    def respond(request):
        calls.append(request)
        if failure == "timeout":
            raise httpx.ReadTimeout("secret error", request=request)
        return httpx.Response(failure if isinstance(failure, int) else 200,
            content=b"x" * 2_000_001 if failure == "oversize" else b"\xff" if failure == "encoding" else b"secret body",
            headers={"location": "https://evil.example", "content-type": "application/json" if failure == "json" else "text/html"},
            request=request)
    a = TOAP(httpx.Client(transport=httpx.MockTransport(respond)), "atram_nav")
    with pytest.raises(MarketDataError) as caught:
        a.fetch(NOW)
    assert "secret" not in str(caught.value) and len(calls) == 1


def test_unexpected_final_url_rejected():
    class UnexpectedClient:
        def send(self, request, **kwargs):
            assert kwargs["follow_redirects"] is False
            return httpx.Response(200, text=html("atram_nav"), headers={"content-type": "text/html"},
                                  request=httpx.Request("GET", "https://evil.example"))
    with pytest.raises(MarketDataError, match="provider_unavailable"):
        TOAP(UnexpectedClient(), "atram_nav").fetch(NOW)


def test_partial_refresh_and_other_source_continue_retaining_invalid_cache():
    cache = Cache()
    before = parse_nav_page(html("atram_nav"), "atram_nav", NOW - timedelta(days=0)).prices[0]
    before = before.model_copy(update={"as_of": NOW - timedelta(days=3), "fetched_at": NOW - timedelta(days=2)})
    cache.write([before])
    calls = []
    bad = html("atram_nav").replace("144.123456789012", "0")
    results = refresh(cache, [source_adapter("atram_nav", calls, bad), source_adapter("bpi_nav", calls)], NOW)
    assert results["atram_nav"] == "partial" and results["bpi_nav"] == "updated"
    assert results["atram_nav/gcash_global_equity"] == "invalid_nav_or_date"
    assert cache.rows[before.price_key] == before and len(cache.rows) == 6 and len(calls) == 2


@pytest.mark.parametrize("failed", TOAP_PAGES)
def test_source_outage_does_not_prevent_other_sources(failed):
    cache, calls = Cache(), []
    other = "bpi_nav" if failed == "atram_nav" else "atram_nav"
    results = refresh(cache, [source_adapter(failed, calls, status=503), source_adapter(other, calls),
                             adapter("marketstack", handler("marketstack", calls))], NOW)
    assert results[failed] == "provider_unavailable"
    assert results[other] == results["marketstack"] == "updated"


def test_unavailable_page_has_safe_per_fund_errors_and_no_write():
    cache = Cache()
    result = refresh(cache, [source_adapter("bpi_nav", [], body="<html>outage</html>")], NOW)
    assert result["bpi_nav"] == "unavailable" and len(result) == 4 and not cache.rows


@pytest.mark.parametrize("source", TOAP_PAGES)
def test_daily_cache_and_shared_lease_prevent_duplicate_fetches(source):
    cache, calls = Cache(), []
    a = source_adapter(source, calls)
    assert refresh(cache, [a], NOW)[source] == "updated"
    assert refresh(cache, [a], NOW + timedelta(hours=1))[source] == "cached"
    assert refresh(cache, [a], NOW + timedelta(days=1))[source] == "cooldown"
    assert len(calls) == 1 and set(cache.intervals) == {86400}
    cache.claims.clear()
    before = dict(cache.rows)
    assert refresh(cache, [a], NOW + timedelta(days=1))[source] == "cached"
    assert len(calls) == 2 and cache.rows == before  # weekend unchanged date, no timestamp laundering


def test_calendar_day_cadence_avoids_cron_jitter_and_uses_philippines_midnight():
    a = source_adapter("atram_nav", [])
    price = parse_nav_page(html("atram_nav"), "atram_nav", NOW).prices[0]
    assert a.cache_is_current(price, NOW + timedelta(hours=1, minutes=59))
    assert not a.cache_is_current(price, NOW + timedelta(hours=2))
    assert not a.cache_is_current(price, NOW + timedelta(days=1, seconds=-1))


def test_shared_page_gate_respects_delay_without_test_sleep():
    clock = iter([10, 12, 70])
    waits = []
    gate = TOAPRequestGate(clock=lambda: next(clock), sleep=waits.append)
    gate.wait(); gate.wait()
    assert waits == [58]


@pytest.mark.parametrize("product", TOAP_FUNDS)
@pytest.mark.parametrize("day,replaced", [(22, True), (23, False), (24, False)])
@pytest.mark.parametrize("prior_source", ["official_nav", "toap"])
def test_manual_and_automatic_correction_precedence(product, day, replaced, prior_source):
    source = toap_source(product)
    # All fixture observations use Sep 23 for this comparison.
    body = html(source).replace("Sep 24, 2026", "Sep 23, 2026")
    host = "atram.com.ph" if source == "atram_nav" else "bpi.com.ph"
    old = manual_nav(product, "999", f"2026-09-{day}", f"https://{host}/fund", FUND_CLASSES[product], NOW)
    if prior_source == "toap":
        old = ReferencePrice.model_validate({**old.model_dump(), "source": "toap",
            "provenance": TOAP_PAGES[source], "reference_id": TOAP_FUNDS[product]})
    old = old.model_copy(update={"fetched_at": NOW - timedelta(days=2)})
    cache = Cache(); cache.write([old])
    refresh(cache, [source_adapter(source, [], body)], NOW)
    assert (cache.rows[product].value != Decimal("999")) == replaced
    if not replaced:
        assert cache.rows[product] == old


@pytest.mark.parametrize("product", TOAP_FUNDS)
def test_toap_contract_cache_round_trip_valuation_and_manual_only(product):
    price = next(p for p in parse_nav_page(html(toap_source(product)), toap_source(product), NOW).prices if p.price_key == product)
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(200, json=[price.model_dump(mode="json")]) if request.method == "GET" else httpx.Response(201)
    cache = SharedCache(httpx.Client(transport=httpx.MockTransport(respond)), "https://test.supabase.co", "sb_secret_synthetic")
    cache.write([price]); restored = cache.read([product])[product]
    assert restored == price and price.reference_id in calls[0].content.decode()
    h = holding(product, "10").model_copy(update={"manual_value_php": Decimal("8000"), "manual_value_updated_at": NOW})
    result = value_portfolio([h], FixtureMarketData([restored]), None, NOW)
    assert result.holdings[0].valuation_source == "nav"
    assert result.data_sources == ("toap",)
    assert result.total_value_php == (price.value * 10).quantize(Decimal(".01"))
    manual = value_portfolio([h.model_copy(update={"units": None})], FixtureMarketData([restored]), None, NOW)
    assert manual.total_value_php == 8000 and manual.holdings[0].valuation_source == "manual_user"
    stale = value_portfolio([h], FixtureMarketData([restored]), None, price.as_of + timedelta(days=3))
    assert stale.holdings[0].freshness == "stale" and stale.holdings[0].valuation_source == "nav"
    expired = value_portfolio([h.model_copy(update={"manual_value_updated_at": price.as_of + timedelta(days=8)})], FixtureMarketData([restored]), None, price.as_of + timedelta(days=8))
    assert expired.total_value_php == 8000 and expired.holdings[0].valuation_source == "manual_user"


@pytest.mark.parametrize("field,value", [("provenance", "https://uitf.com.ph/daily_navpu.php?bank_id=3"),
    ("provenance", "https://uitf.com.ph.evil/daily_navpu.php?bank_id=31"),
    ("provenance", "https://uitf.com.ph/daily_navpu.php?bank_id=31&extra=1"),
    ("reference_id", "ATRAM Global Equity Opportunity Feeder Fund (USD Unit Class)"),
    ("unit_class", "USD"), ("currency", "USD"), ("source", "official_nav")])
def test_cached_source_identity_fails_closed(field, value):
    price = parse_nav_page(html("atram_nav"), "atram_nav", NOW).prices[0]
    with pytest.raises(ValueError):
        ReferencePrice.model_validate({**price.model_dump(), field: value})


def test_rollback_config_skips_cache_and_http():
    class NoAccess:
        def read(self, *_): pytest.fail("disabled source must not read or claim cache")
    assert refresh(NoAccess(), [source_adapter("atram_nav", [], enabled=False)], NOW) == {"atram_nav": "disabled_by_config"}


@pytest.mark.parametrize("enabled,code,expected", [("true", 0, "updated"), ("false", 0, "disabled_by_config"), ("true", 1, "partial")])
def test_cli_registers_both_sources_and_returns_failure_for_partial(monkeypatch, capsys, enabled, code, expected):
    from app.market_data import __main__ as cli
    monkeypatch.setattr(cli.sys, "argv", ["market_data", "refresh"])
    monkeypatch.setattr(cli, "load_dotenv", lambda: None)
    monkeypatch.setenv("TOAP_NAV_ENABLED", enabled)
    monkeypatch.setattr(cli, "SharedCache", lambda *_: Cache())
    def fake_refresh(cache, adapters):
        assert [a.source for a in adapters] == ["marketstack", "exchangerate_api", "coinranking", "atram_nav", "bpi_nav"]
        assert all(a.enabled == (enabled == "true") for a in adapters[-2:])
        assert adapters[-1].gate is adapters[-2].gate
        return {"atram_nav": expected, "bpi_nav": "updated"}
    monkeypatch.setattr(cli, "refresh", fake_refresh)
    assert cli.main() == code
    assert f"atram_nav: {expected}" in capsys.readouterr().out
