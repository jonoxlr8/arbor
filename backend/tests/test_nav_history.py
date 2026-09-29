"""NAV-only history input is exact, bounded, and independent of live access."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.market_data.models import FUND_CLASSES, TOAP_FUNDS, TOAP_PAGES, MarketDataError, toap_source
from app.market_data.nav_history import (TOAP_HISTORY_DETAILS, daily_nav_observations,
                                         detail_reference, nav_observation, parse_nav_only_export)
from app.market_data.toap import parse_nav_page

NOW = datetime(2026, 9, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize("product", TOAP_FUNDS)
def test_exact_six_class_nav_only_export(product):
    first_day = TOAP_HISTORY_DETAILS[product][2].isoformat()
    content = f"fund_name,date,navpu\n{TOAP_FUNDS[product]},{first_day},123.123456789012\n"
    observations = parse_nav_only_export(content, product, NOW)
    assert len(observations) == 1
    item = observations[0]
    assert item.price_key == product and item.source == "toap" and item.kind == "nav"
    assert item.currency == "PHP" and item.value == Decimal("123.123456789012")
    assert item.unit_class == FUND_CLASSES[product] and item.reference_id == TOAP_FUNDS[product]
    assert item.provenance == detail_reference(product)
    assert item.observed_at.date().isoformat() == first_day
    assert item.payload()["observation_date"] == first_day


@pytest.mark.parametrize("product", TOAP_FUNDS)
def test_exact_class_and_inception_are_required(product):
    first_day = TOAP_HISTORY_DETAILS[product][2]
    with pytest.raises(MarketDataError):
        nav_observation(product, TOAP_FUNDS[product] + " other class", "100",
                        first_day, NOW, detail_reference(product))
    with pytest.raises(MarketDataError):
        nav_observation(product, TOAP_FUNDS[product], "100",
                        first_day.replace(year=first_day.year - 1), NOW, detail_reference(product))
    with pytest.raises(MarketDataError):
        nav_observation(product, TOAP_FUNDS[product], "100",
                        first_day, NOW, "https://example.com/wrong-fund")


@pytest.mark.parametrize("nav", ["0", "-1", "NaN", "Infinity", "not a price"])
def test_invalid_nav_fails_closed(nav):
    product = "gcash_global_equity"
    with pytest.raises(MarketDataError):
        nav_observation(product, TOAP_FUNDS[product], nav,
                        TOAP_HISTORY_DETAILS[product][2], NOW, detail_reference(product))


def test_export_rejects_unrelated_columns_and_conflicting_same_day():
    product = "gcash_global_equity"
    name = TOAP_FUNDS[product]
    for content in [
        f"fund_name,date,navpu,roi\n{name},2026-09-24,1,10%\n",
        f"fund_name,date,navpu\n{name},2026-09-24,1\n{name},2026-09-24,2\n",
        "fund_name,date,navpu\nUnrelated fund,2026-09-24,1\n",
        f"fund_name,date,navpu\n{name},2026-10-01,1\n",
    ]:
        with pytest.raises(MarketDataError, match="historical_nav_export_invalid"):
            parse_nav_only_export(content, product, NOW)
    repeated = f"fund_name,date,navpu\n{name},2026-09-24,1\n{name},2026-09-24,1\n"
    assert len(parse_nav_only_export(repeated, product, NOW)) == 1


def test_daily_capture_reuses_exact_page_observations_without_another_request():
    from pathlib import Path
    fixture = (Path(__file__).parent / "fixtures" / "toap_atram.html").read_text()
    prices = parse_nav_page(fixture, "atram_nav", NOW).prices
    observations = daily_nav_observations(prices)
    assert len(observations) == 3
    assert {item.price_key for item in observations} == {
        "gcash_global_equity", "gcash_technology", "gcash_defensive"}
    assert all(item.provenance == TOAP_PAGES[toap_source(item.price_key)] for item in observations)
