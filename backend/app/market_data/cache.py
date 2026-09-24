"""CLI-only privileged cache writer. Never used by authenticated API routes."""
import json
import re
from urllib.parse import urlsplit
from decimal import Decimal
import httpx
from .models import ReferencePrice, MarketDataError


class SharedCache:
    def __init__(self, client, url, key):
        try:
            parsed = urlsplit(url or "")
            valid_host = parsed.hostname and re.fullmatch(r"[a-z0-9-]+\.supabase\.co", parsed.hostname)
            valid_port = parsed.port is None
        except ValueError:
            raise MarketDataError("cache_configuration_required") from None
        if (parsed.scheme != "https" or not valid_host
                or parsed.username or parsed.password or not valid_port or parsed.path not in ("", "/")
                or parsed.query or parsed.fragment or not key):
            raise MarketDataError("cache_configuration_required")
        self.modern_key = isinstance(key, str) and re.fullmatch(r"sb_secret_[A-Za-z0-9_-]+", key) is not None
        # Shape detection only: Supabase validates legacy JWT signatures/roles.
        if not self.modern_key and not (isinstance(key, str) and re.fullmatch(
                r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", key)):
            raise MarketDataError("cache_credential_invalid")
        self.client, self.base, self.key = client, url.rstrip("/") + "/rest/v1", key

    def call(self, method, path, **kwargs):
        if (method, path) not in {
                ("GET", "/arbor_market_prices"), ("POST", "/arbor_market_prices"),
                ("POST", "/rpc/arbor_claim_market_refresh")}:
            raise MarketDataError("cache_operation_not_allowed")
        try:
            request = self.client.build_request(method, self.base + path, timeout=10,
                headers={"apikey": self.key,
                         "Prefer": "resolution=merge-duplicates,return=minimal"}, **kwargs)
            # Do not inherit a bearer/user credential from the HTTP client.
            if self.modern_key:
                request.headers.pop("Authorization", None)
            else:
                request.headers["Authorization"] = "Bearer " + self.key
            response = self.client.send(request, auth=None, follow_redirects=False)
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
