"""Prospective observations only; no paid requests or portfolio/snapshot writes."""
from datetime import timezone, timedelta

from .adapters import BTC_UUID
from .history_sources import HistoricalObservation, VGT_SPLIT_DAY
from .models import MarketDataError, ReferencePrice, normalized_value

MARKETSTACK_LATEST_URL = "https://api.marketstack.com/v2/eod/latest"
COINRANKING_PRICE_URL = f"https://api.coinranking.com/v2/coin/{BTC_UUID}/price"


def quote_observations(prices):
    result = []
    for raw in prices:
        # Revalidate both fetched and cached records before historical ingestion.
        price = ReferencePrice.model_validate(raw.model_dump())
        observed_at = price.as_of.astimezone(timezone.utc)
        if price.source not in ("marketstack", "coinranking"):
            continue  # Current Exchange Rate API is not the historical BSP series.
        if price.price_key == "gotrade_vgt" and observed_at.date() < VGT_SPLIT_DAY:
            continue
        result.append(HistoricalObservation(price.price_key, observed_at, normalized_value(price.value),
            price.source, price.currency,
            MARKETSTACK_LATEST_URL if price.source == "marketstack" else COINRANKING_PRICE_URL,
            price.fetched_at, price.kind, reference_id=price.reference_id))
    return result


def capture_quotes(cache, prices):
    observations = quote_observations(prices)
    if observations:
        # Non-NAV history has no database conflict guard. Append only, including
        # concurrent workers: never silently revise a previously captured fact.
        cache.write_history(observations, preserve_existing=True)


def capture_bsp(cache, history, now):
    # Fetch the public dated archive on the existing daily FX lease. The bounded
    # tail repairs recent missed polls, without creating absent publication days.
    observations = history.fetch(now.date() - timedelta(days=7), now.date(), now)
    if not observations:
        raise MarketDataError("bsp_history_unavailable")
    cache.write_history(observations, preserve_existing=True)
