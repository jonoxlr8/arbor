"""CLI-only privileged cache writer. Never used by authenticated API routes."""
import json
from urllib.parse import urlsplit
from decimal import Decimal
import httpx
from .models import ReferencePrice, MarketDataError


class SharedCache:
    def __init__(self, client, url, key):
        parsed = urlsplit(url or "")
        if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co")
                or parsed.username or parsed.password or parsed.port or parsed.path not in ("", "/")
                or parsed.query or parsed.fragment or not key):
            raise MarketDataError("cache_configuration_required")
        self.client, self.base, self.key = client, url.rstrip("/") + "/rest/v1", key

    def call(self, method, path, **kwargs):
        try:
            response = self.client.request(method, self.base + path, timeout=10, follow_redirects=False,
                headers={"apikey": self.key, "Authorization": "Bearer " + self.key,
                         "Prefer": "resolution=merge-duplicates,return=minimal"}, **kwargs)
            if response.status_code not in (200, 201, 204):
                raise MarketDataError("cache_unavailable_check_migration_and_writer_permissions")
            return json.loads(response.content, parse_float=Decimal) if response.content else None
        except (httpx.HTTPError, ValueError, TypeError):
            raise MarketDataError("cache_unavailable") from None

    def read(self, keys):
        # keys originate only in adapters, never HTTP user input.
        rows = self.call("GET", "/arbor_market_prices", params={"select": "*", "price_key": "in.(" + ",".join(keys) + ")"})
        result = {}
        try:
            for row in rows:
                try:
                    price = ReferencePrice.model_validate(row)
                    result[price.price_key] = price
                except ValueError:
                    continue
        except TypeError:
            raise MarketDataError("invalid_cache_response") from None
        return result

    def claim(self, source, interval):
        return self.call("POST", "/rpc/arbor_claim_market_refresh", json={"source_id": source, "cooldown_seconds": interval}) is True

    def write(self, prices):
        self.call("POST", "/arbor_market_prices", json=[p.model_dump(mode="json") for p in prices])
