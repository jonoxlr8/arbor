"""Shared cache coordination. Caller invokes explicitly; no background scheduler."""
from datetime import datetime, timezone
import httpx
from .models import MarketDataError
from .toap import NAVBatch
from .nav_history import daily_nav_observations
from .automatic_history import capture_quotes, capture_bsp
from .history_sources import VGT_SPLIT_DAY


def refresh(cache, adapters, now=None, capture_history=False, bsp_history=None):
    now = now or datetime.now(timezone.utc)
    status = {}

    def history(adapter, prices, poll_bsp=False):
        if not capture_history:
            return
        try:
            if adapter.source in ("marketstack", "coinranking"):
                capture_quotes(cache, prices)
                if any(p.price_key == "gotrade_vgt" and
                       p.as_of.astimezone(timezone.utc).date() < VGT_SPLIT_DAY for p in prices):
                    status[f"{adapter.source}/history"] = "vgt_split_review_required"
            elif adapter.source == "exchangerate_api" and poll_bsp:
                if bsp_history is None:
                    raise MarketDataError("bsp_history_configuration_required")
                capture_bsp(cache, bsp_history, now)
        except MarketDataError as error:
            status[f"{adapter.source}/history"] = ("historical_observation_conflict"
                if str(error) == "historical_observation_conflict" else "history_capture_failed")
        except (ValueError, TypeError, ArithmeticError, httpx.HTTPError):
            status[f"{adapter.source}/history"] = "history_capture_failed"

    for adapter in adapters:
        try:
            if not getattr(adapter, "enabled", True):
                status[adapter.source] = "disabled_by_config"
                continue
            if adapter.source in ("marketstack", "coinranking") and not adapter.key:
                status[adapter.source] = "configuration_required"
                continue
            existing = cache.read(adapter.keys)
            current = getattr(adapter, "cache_is_current",
                              lambda p, at: 0 <= (at-p.fetched_at).total_seconds() < adapter.interval)
            if all(k in existing and current(existing[k], now)
                   for k in adapter.keys):
                status[adapter.source] = "cached"
                history(adapter, list(existing.values()))
                continue
            previous = existing.get("btc_php") if adapter.source == "coinranking" else None
            # First success requires two calls; halve cadence until PHP identity is cached.
            interval = 1200 if adapter.source == "coinranking" and previous is None else adapter.interval
            if not cache.claim(adapter.source, interval):
                status[adapter.source] = "cooldown"
                continue
            # BSP uses the same daily FX lease, independently of live FX success.
            # No extra Marketstack/Coinranking calls, no new lease/schema required.
            history(adapter, [], poll_bsp=True)
            batch = adapter.fetch(now, previous)
            prices = batch.prices if isinstance(batch, NAVBatch) else batch
            # Do not replace a newer effective observation with older data.
            # NAV effective dates win; equal-date automatic observations must not
            # overwrite an operator's existing value/correction. Other feeds unchanged.
            accepted = [p for p in prices if p.price_key not in existing
                        or p.as_of > existing[p.price_key].as_of
                        or (p.kind != "nav" and p.as_of == existing[p.price_key].as_of)]
            if accepted:
                cache.write(accepted)
            status[adapter.source] = "updated" if accepted else "older_data_ignored"
            history(adapter, prices)
            if isinstance(batch, NAVBatch):
                if prices:
                    # Additive history capture never blocks the existing live NAV
                    # cache. Failures are explicit; the database guard rejects a
                    # conflicting same-day value without changing its old row.
                    try:
                        cache.write_history(daily_nav_observations(prices))
                    except MarketDataError as error:
                        status[f"{adapter.source}/history"] = str(error)
                if batch.errors:
                    status[adapter.source] = "partial" if prices else "unavailable"
                    for product, reason in batch.errors.items():
                        status[f"{adapter.source}/{product}"] = reason
                elif not accepted:
                    status[adapter.source] = "cached"
        except MarketDataError as error:
            status[adapter.source] = str(error)
    return status
