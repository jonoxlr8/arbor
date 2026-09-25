"""Shared cache coordination. Caller invokes explicitly; no background scheduler."""
from datetime import datetime, timezone
from .models import MarketDataError
from .toap import NAVBatch


def refresh(cache, adapters, now=None):
    now = now or datetime.now(timezone.utc)
    status = {}
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
                continue
            previous = existing.get("btc_php") if adapter.source == "coinranking" else None
            # First success requires two calls; halve cadence until PHP identity is cached.
            interval = 1200 if adapter.source == "coinranking" and previous is None else adapter.interval
            if not cache.claim(adapter.source, interval):
                status[adapter.source] = "cooldown"
                continue
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
            if isinstance(batch, NAVBatch):
                if batch.errors:
                    status[adapter.source] = "partial" if prices else "unavailable"
                    for product, reason in batch.errors.items():
                        status[f"{adapter.source}/{product}"] = reason
                elif not accepted:
                    status[adapter.source] = "cached"
        except MarketDataError as error:
            status[adapter.source] = str(error)
    return status
