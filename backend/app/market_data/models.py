"""Vendor-neutral cache contract and explicit fund identity boundary."""
from datetime import datetime, timezone, date, time
from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Literal
from urllib.parse import urlsplit
from pydantic import model_validator
from app.services.live_portfolio import Price

ETF_SYMBOLS = {"VT": "gotrade_vt", "VGT": "gotrade_vgt", "BND": "gotrade_bnd"}
# Exact PHP classes confirmed for 3U-B.3; every NAV must still match this identity.
FUND_CLASSES = {
    "gcash_global_equity": "PHP Unit Class",
    "gcash_technology": "A PHP Unit Class",
    "gcash_defensive": "A Unit Class",
    "dragonfi_global_equity": "PHP / Class P",
    "dragonfi_technology": "PHP / Class P",
    "dragonfi_defensive": "PHP",
}
ATTRIBUTIONS = {
    "marketstack": ("Market data by Marketstack", "https://marketstack.com"),
    "coinranking": ("Crypto data by Coinranking", "https://coinranking.com"),
    "exchangerate_api": ("Rates By Exchange Rate API", "https://www.exchangerate-api.com"),
}


class MarketDataError(Exception):
    """Only static safe error codes; never raw HTTP errors/URLs/vendor payloads."""


class ReferencePrice(Price):
    verified: Literal[True] = True
    currency: Literal["USD", "PHP"]
    kind: Literal["etf_eod", "btc_reference", "fx", "nav"]
    source: Literal["marketstack", "coinranking", "exchangerate_api", "official_nav"]
    fetched_at: datetime
    provenance: str | None = None
    unit_class: str | None = None
    reference_id: str | None = None

    @model_validator(mode="after")
    def identity(self):
        expected = (("USD", "etf_eod", "marketstack") if self.price_key in ETF_SYMBOLS.values()
                    else ("PHP", "btc_reference", "coinranking") if self.price_key == "btc_php"
                    else ("PHP", "fx", "exchangerate_api") if self.price_key == "usd_php"
                    else ("PHP", "nav", "official_nav") if self.price_key in FUND_CLASSES else None)
        if expected != (self.currency, self.kind, self.source):
            raise ValueError("Reference identity mismatch")
        if self.fetched_at.tzinfo is None or self.as_of > self.fetched_at:
            raise ValueError("Invalid reference timestamps")
        if self.kind == "nav":
            if not FUND_CLASSES[self.price_key] or self.unit_class != FUND_CLASSES[self.price_key]:
                raise ValueError("Fund class requires activation verification")
            official_source(self.provenance, self.price_key)
        if self.kind == "btc_reference" and not self.reference_id:
            raise ValueError("Validated PHP reference identity required")
        return self


def official_source(value, product):
    p = urlsplit(value or "")
    host = "bpi.com.ph" if product.startswith("dragonfi_") else "atram.com.ph"
    if (p.scheme != "https" or not p.hostname or not (p.hostname == host or p.hostname.endswith("." + host))
            or p.username or p.password or p.query or p.fragment or p.port not in (None, 443)):
        raise ValueError("Official HTTPS provenance URL required (no query or credentials)")


def normalized_value(value):
    if isinstance(value, (bool, float)):
        raise ValueError("Decimal text required")
    with localcontext() as context:
        context.prec = 80
        result = Decimal(value)
        if not result.is_finite() or not 0 < result < 10**12:
            raise ValueError("Invalid price")
        # Cache contract is 12 fractional digits; never round via binary float.
        return result.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)


def manual_nav(product, value, effective_date, source, unit_class, now=None):
    now = now or datetime.now(timezone.utc)
    if product not in FUND_CLASSES or not FUND_CLASSES[product]:
        raise MarketDataError("fund_identity_unverified_or_unsupported")
    day = date.fromisoformat(effective_date)
    # Date-only NAV convention: midnight UTC, conservative freshness; no invented publication time.
    as_of = datetime.combine(day, time(), timezone.utc)
    return ReferencePrice(price_key=product, value=normalized_value(value), as_of=as_of,
        fetched_at=now, currency="PHP", kind="nav", source="official_nav",
        provenance=source, unit_class=unit_class)
