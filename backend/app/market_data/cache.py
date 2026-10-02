"""CLI-only privileged cache writer. Never used by authenticated API routes."""
import json
import re
from datetime import timezone
from urllib.parse import urlsplit
from decimal import Decimal
import httpx
from .models import ReferencePrice, MarketDataError, normalized_value
from .adapters import timestamp


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
                ("POST", "/arbor_historical_market_observations"),
                ("GET", "/arbor_historical_market_observations"),
                ("POST", "/rpc/arbor_claim_market_refresh")}:
            raise MarketDataError("cache_operation_not_allowed")
        try:
            request = self.client.build_request(method, self.base + path, timeout=10,
                headers={"apikey": self.key,
                         "Prefer": kwargs.pop("prefer", "resolution=merge-duplicates,return=minimal")}, **kwargs)
            # Do not inherit a bearer/user credential from the HTTP client.
            if self.modern_key:
                request.headers.pop("Authorization", None)
            else:
                request.headers["Authorization"] = "Bearer " + self.key
            response = self.client.send(request, auth=None, follow_redirects=False)
            if response.status_code not in (200, 201, 204):
                if path == "/arbor_historical_market_observations":
                    try:
                        failure = response.json()
                    except (ValueError, TypeError):
                        failure = None
                    if (isinstance(failure, dict) and failure.get("code") == "P0001"
                            and failure.get("message") == "Conflicting historical NAV requires operator review"):
                        raise MarketDataError("historical_nav_conflict")
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

    def write_history(self, observations, preserve_existing=False):
        # Operator-only, shared by all owners; never a user portfolio write.
        for start in range(0, len(observations), 100):
            batch = observations[start:start + 100]
            self.call("POST", "/arbor_historical_market_observations",
                      params={"on_conflict": "price_key,observed_at"},
                      prefer=("resolution=ignore-duplicates,return=minimal" if preserve_existing
                              else "resolution=merge-duplicates,return=minimal"),
                      json=[item.payload() for item in batch])
            if preserve_existing:
                self.verify_history(batch)

    def verify_history(self, observations):
        """Bounded exact-key read detects ignored corrections, including races.

        Source provenance/fetch time may differ between latest and dated imports.
        Compare the immutable quote's value/source/currency, not retrieval metadata.
        Never update an existing row to resolve a correction.
        """
        # Keep encoded filters below ordinary proxy URL limits, including
        # dated imports whose insert batches contain 100 observations.
        for start in range(0, len(observations), 25):
            self._verify_history_batch(observations[start:start + 25])

    def _verify_history_batch(self, observations):
        expected = {(item.price_key, item.observed_at.astimezone(timezone.utc)):
                    (normalized_value(item.value), item.source, item.currency)
                    for item in observations}
        filters = []
        for key, observed_at in expected:
            # Internal canonical keys only; never interpolate a user expression.
            if key not in ("gotrade_vt", "gotrade_vgt", "gotrade_bnd", "btc_php", "usd_php"):
                raise MarketDataError("historical_observation_identity_invalid")
            filters.append(f"and(price_key.eq.{key},observed_at.eq.{observed_at.isoformat()})")
        rows = self.call("GET", "/arbor_historical_market_observations", params={
            "select": "price_key,observed_at,value,source,currency",
            "or": "(" + ",".join(filters) + ")", "limit": len(expected)})
        try:
            if not isinstance(rows, list) or len(rows) != len(expected):
                raise ValueError()
            found = {}
            for row in rows:
                key = (row["price_key"], timestamp(row["observed_at"]).astimezone(timezone.utc))
                if key not in expected or key in found:
                    raise ValueError()
                found[key] = (normalized_value(row["value"]), row["source"], row["currency"])
            if found != expected:
                raise MarketDataError("historical_observation_conflict")
        except (KeyError, ValueError, TypeError, AttributeError, ArithmeticError):
            raise MarketDataError("invalid_historical_cache_response") from None
