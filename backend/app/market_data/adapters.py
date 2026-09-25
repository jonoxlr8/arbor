"""Fixed-host, bounded HTTP adapters. No retries, redirects or raw error logging."""
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
import httpx
from .models import ETF_SYMBOLS, ReferencePrice, MarketDataError, normalized_value

BTC_UUID = "Qwsogvtv82FCd"  # Coinranking's documented Bitcoin UUID.


def timestamp(value):
    if isinstance(value, bool):
        raise ValueError("Invalid timestamp")
    if isinstance(value, (int, Decimal)):
        return datetime.fromtimestamp(int(value), timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timezone required")
    return parsed


class VendorHTTP:
    def __init__(self, client):
        self.client = client

    def get(self, url, **kwargs):
        try:
            response = self.client.get(url, timeout=10, follow_redirects=False, **kwargs)
            if response.status_code == 429:
                raise MarketDataError("rate_limited")
            if response.status_code != 200:
                raise MarketDataError("provider_unavailable")
            if len(response.content) > 2_000_000:
                raise MarketDataError("invalid_response")
            return json.loads(response.content, parse_float=Decimal)
        except (httpx.HTTPError, ValueError, TypeError):
            raise MarketDataError("provider_unavailable_or_invalid") from None


class Marketstack:
    source = "marketstack"
    keys = tuple(ETF_SYMBOLS.values())
    interval = 86400

    def __init__(self, http, key):
        self.http, self.key = http, key

    def fetch(self, now, previous=None, symbols=tuple(ETF_SYMBOLS)):
        if not symbols or any(s not in ETF_SYMBOLS for s in symbols):
            raise MarketDataError("unsupported_symbol")
        if not self.key:
            raise MarketDataError("configuration_required")
        body = self.http.get("https://api.marketstack.com/v2/eod/latest",
            params={"access_key": self.key, "symbols": ",".join(symbols), "limit": 3})
        try:
            rows = body["data"]
            if len(rows) != len(symbols) or {r["symbol"] for r in rows} != set(symbols):
                raise ValueError()
            result = []
            for row in rows:
                # Allowlisted US listings; reject a mismatching currency if returned.
                if row.get("price_currency", "usd").upper() != "USD":
                    raise ValueError()
                result.append(ReferencePrice(price_key=ETF_SYMBOLS[row["symbol"]],
                    value=normalized_value(row["close"]), as_of=timestamp(row["date"]), fetched_at=now,
                    currency="USD", kind="etf_eod", source=self.source))
            return result
        except (KeyError, ValueError, TypeError, ArithmeticError, AttributeError):
            raise MarketDataError("invalid_response") from None


class ExchangeRate:
    source = "exchangerate_api"
    keys = ("usd_php",)
    interval = 86400

    def __init__(self, http):
        self.http = http

    def fetch(self, now, previous=None):
        body = self.http.get("https://open.er-api.com/v6/latest/USD")
        try:
            if body["result"] != "success" or body["base_code"] != "USD":
                raise ValueError()
            return [ReferencePrice(price_key="usd_php", value=normalized_value(body["rates"]["PHP"]),
                as_of=timestamp(body["time_last_update_unix"]), fetched_at=now,
                currency="PHP", kind="fx", source=self.source)]
        except (KeyError, ValueError, TypeError, ArithmeticError, AttributeError):
            raise MarketDataError("invalid_response") from None


class Coinranking:
    source = "coinranking"
    keys = ("btc_php",)
    # Refresh ahead of the independent 600-second valuation freshness boundary.
    # A five-minute cron tick can start just before ten minutes since the fetch.
    interval = 540

    def __init__(self, http, key):
        self.http, self.key = http, key

    def fetch(self, now, previous=None):
        if not self.key:
            raise MarketDataError("configuration_required")
        headers = {"x-access-token": self.key}
        try:
            reference = previous.reference_id if previous else None
            if reference is None:
                currencies = self.http.get("https://api.coinranking.com/v2/reference-currencies",
                    params={"search": "PHP", "types[]": "fiat", "limit": 100}, headers=headers)
                if currencies["status"] != "success":
                    raise ValueError()
                matches = [r for r in currencies["data"]["currencies"] if r["symbol"] == "PHP" and r["type"] == "fiat"]
                if len(matches) != 1:
                    raise ValueError()
                reference = matches[0]["uuid"]
            if not isinstance(reference, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", reference):
                raise ValueError()
            body = self.http.get(f"https://api.coinranking.com/v2/coin/{BTC_UUID}/price",
                params={"referenceCurrencyUuid": reference}, headers=headers)
            if body["status"] != "success":
                raise ValueError()
            return [ReferencePrice(price_key="btc_php", value=normalized_value(body["data"]["price"]),
                as_of=timestamp(body["data"]["timestamp"]), fetched_at=now, currency="PHP",
                kind="btc_reference", source=self.source, reference_id=reference)]
        except (KeyError, ValueError, TypeError, ArithmeticError, AttributeError):
            raise MarketDataError("invalid_response") from None
