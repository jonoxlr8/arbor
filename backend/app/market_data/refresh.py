"""Shared cache coordination. Caller invokes explicitly; no background scheduler."""
from datetime import datetime, timezone
from .models import MarketDataError


def nav_automation_status():
    """Discovery result, not a runtime override or permission to fetch websites."""
    return {"atram_nav": "not_enabled_source_permission_required",
            "bpi_nav": "not_enabled_source_permission_required"}


def refresh(cache, adapters, now=None):
    now = now or datetime.now(timezone.utc)
    status = {}
    for adapter in adapters:
        try:
            if adapter.source in ("marketstack", "coinranking") and not adapter.key:
                status[adapter.source] = "configuration_required"
                continue
            existing = cache.read(adapter.keys)
            if all(k in existing and 0 <= (now-existing[k].fetched_at).total_seconds() < adapter.interval
                   for k in adapter.keys):
                status[adapter.source] = "cached"
                continue
            previous = existing.get("btc_php") if adapter.source == "coinranking" else None
            # First success requires two calls; halve cadence until PHP identity is cached.
            interval = 1200 if adapter.source == "coinranking" and previous is None else adapter.interval
            if not cache.claim(adapter.source, interval):
                status[adapter.source] = "cooldown"
                continue
            prices = adapter.fetch(now, previous)
            # Do not replace a newer effective observation with older data.
            # NAV effective dates win; equal-date automatic observations must not
            # overwrite an operator's existing value/correction. Other feeds unchanged.
            accepted = [p for p in prices if p.price_key not in existing
                        or p.as_of > existing[p.price_key].as_of
                        or (p.kind != "nav" and p.as_of == existing[p.price_key].as_of)]
            if accepted:
                cache.write(accepted)
            status[adapter.source] = "updated" if accepted else "older_data_ignored"
        except MarketDataError as error:
            status[adapter.source] = str(error)
    return status
