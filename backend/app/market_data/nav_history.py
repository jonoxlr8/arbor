"""Exact six-class TOAP NAV observations, shared by daily capture and local import.

Historical imports consume a NAV-only operator export after authorized source access;
this module never requests a TOAP detail page or bypasses its CAPTCHA.
"""
import csv
import re
from datetime import date, datetime, time, timezone
from decimal import Decimal
from io import StringIO

from .history_sources import HistoricalObservation
from .models import (FUND_CLASSES, TOAP_FUNDS, TOAP_PAGES, MarketDataError,
                     ReferencePrice, normalized_name, normalized_value, toap_source)

# Exact source detail identities verified from the six authorized daily-page links.
TOAP_HISTORY_DETAILS = {
    "gcash_global_equity": (31, 420, date(2021, 6, 7)),
    "gcash_technology": (31, 327, date(2018, 4, 30)),
    "gcash_defensive": (31, 240, date(2014, 10, 28)),
    "dragonfi_global_equity": (3, 599, date(2026, 6, 1)),
    "dragonfi_technology": (3, 600, date(2026, 6, 1)),
    "dragonfi_defensive": (3, 49, date(2005, 4, 4)),
}


def detail_reference(product: str) -> str:
    bank_id, fund_id, _ = TOAP_HISTORY_DETAILS[product]
    return f"https://www.uitf.com.ph/daily_navpu_details.php?bank_id={bank_id}&fund_id={fund_id}"


def nav_observation(product: str, fund_name: str, nav: str | Decimal,
                    source_day: date, fetched_at: datetime, provenance: str) -> HistoricalObservation:
    if (product not in TOAP_FUNDS or normalized_name(fund_name) != normalized_name(TOAP_FUNDS[product])
            or provenance not in (TOAP_PAGES[toap_source(product)], detail_reference(product))
            or source_day < TOAP_HISTORY_DETAILS[product][2]
            or fetched_at.tzinfo is None or source_day > fetched_at.astimezone(timezone.utc).date()):
        raise MarketDataError("historical_nav_identity_or_date_invalid")
    try:
        value = normalized_value(nav)
    except (ValueError, ArithmeticError):
        raise MarketDataError("historical_nav_value_invalid") from None
    observed_at = datetime.combine(source_day, time(), timezone.utc)
    return HistoricalObservation(product, observed_at, value, "toap", "PHP", provenance,
                                 fetched_at, "nav", FUND_CLASSES[product], TOAP_FUNDS[product])


def daily_nav_observations(prices: list[ReferencePrice]) -> list[HistoricalObservation]:
    """The same validated daily observations; no second vendor request."""
    return [nav_observation(price.price_key, price.reference_id or "", price.value,
                            price.as_of.date(), price.fetched_at, price.provenance or "")
            for price in prices if price.source == "toap"]


def parse_nav_only_export(content: str, product: str, fetched_at: datetime) -> list[HistoricalObservation]:
    """Parse a human-authorized three-column export, never ROI/YTD/raw HTML.

    The source's CAPTCHA-gated page cannot be fetched unattended. The operator
    must supply a NAV-only file with exact fund identity after approved access.
    """
    if product not in TOAP_HISTORY_DETAILS or len(content.encode("utf-8")) > 1_000_000:
        raise MarketDataError("historical_nav_export_invalid")
    try:
        reader = csv.DictReader(StringIO(content))
        if reader.fieldnames != ["fund_name", "date", "navpu"]:
            raise ValueError()
        result = {}
        for count, row in enumerate(reader, start=1):
            if count > 10000 or set(row) != {"fund_name", "date", "navpu"}:
                raise ValueError()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["date"] or ""):
                raise ValueError()
            day = date.fromisoformat(row["date"])
            observation = nav_observation(product, row["fund_name"], row["navpu"],
                                          day, fetched_at, detail_reference(product))
            if day in result and result[day].value != observation.value:
                raise ValueError()
            result[day] = observation
        if not result:
            raise ValueError()
        return [result[day] for day in sorted(result)]
    except (MarketDataError, ValueError, TypeError, KeyError, csv.Error):
        raise MarketDataError("historical_nav_export_invalid") from None
