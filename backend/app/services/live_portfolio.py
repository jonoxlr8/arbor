"""Canonical manual holdings and reference valuation. No investment decisions.

The database is the shared price cache. Only the server-side operator ingestion
tool may write it; the application never substitutes fixture prices in production.
"""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import Field, model_validator

from app.services.implementation.products import PRODUCTS
from app.services.strategy_v2 import AssetRole, DomainModel, Allocation

PROVIDERS = {"gcash": "GCash / GFunds", "dragonfi": "DragonFi", "gotrade": "Gotrade",
             "gcrypto": "GCrypto", "coins_ph": "Coins.ph", "pdax": "PDAX"}
UNIVERSE = {
    **{f"{provider}_{name}": provider for provider in ("gcash", "dragonfi")
       for name in ("global_equity", "technology", "defensive")},
    **{f"gotrade_{name}": "gotrade" for name in ("vt", "vgt", "bnd")},
    "gcrypto_btc": "gcrypto", "coins_btc": "coins_ph", "pdax_btc": "pdax",
}
Units = Annotated[Decimal, Field(gt=0, lt=10**12, max_digits=24, decimal_places=12, allow_inf_nan=False)]
Cost = Annotated[Decimal, Field(ge=0, lt=10**16, max_digits=18, decimal_places=2, allow_inf_nan=False)]
PriceValue = Annotated[Decimal, Field(gt=0, lt=10**12, max_digits=24, decimal_places=12, allow_inf_nan=False)]
ManualValue = Annotated[Decimal, Field(gt=0, lt=10**16, max_digits=18, decimal_places=2, allow_inf_nan=False)]
MANUAL_FUNDS = frozenset(k for k, provider in UNIVERSE.items() if provider in ("gcash", "dragonfi"))
MANUAL_VALUE_MAX_AGE = 7 * 86400


class ManualValueInput(DomainModel):
    manual_value_php: ManualValue | None


class HoldingInput(DomainModel):
    provider: Literal["gcash", "dragonfi", "gotrade", "gcrypto", "coins_ph", "pdax"]
    product_id: str
    units: Units | None = None
    cost_basis_php: Cost | None = None
    manual_value_php: ManualValue | None = None

    @model_validator(mode="after")
    def supported_pair(self):
        if UNIVERSE.get(self.product_id) != self.provider:
            raise ValueError("Choose a supported investment for this provider")
        if self.product_id not in MANUAL_FUNDS:
            if self.units is None or self.manual_value_php is not None:
                raise ValueError("ETF and Bitcoin holdings require units and cannot use manual values")
        elif self.units is None and self.manual_value_php is None:
            raise ValueError("Enter a current PHP value or your fund units")
        return self


class Holding(HoldingInput):
    id: UUID
    created_at: datetime
    updated_at: datetime
    manual_value_updated_at: datetime | None = None

    @model_validator(mode="after")
    def manual_record(self):
        if (self.manual_value_php is None) != (self.manual_value_updated_at is None):
            raise ValueError("Manual value requires its recorded update time")
        if self.manual_value_php is not None and (self.product_id not in MANUAL_FUNDS or self.manual_value_updated_at.tzinfo is None):
            raise ValueError("Manual values are only supported for PHP fund holdings")
        return self


class Price(DomainModel):
    price_key: str
    value: PriceValue
    as_of: datetime
    source: str | None = None

    @model_validator(mode="after")
    def aware(self):
        if self.as_of.tzinfo is None:
            raise ValueError("Price time must include a timezone")
        return self


class MarketData(Protocol):
    def prices(self, keys: set[str]) -> dict[str, Price]: ...


class FixtureMarketData:
    """Explicitly injected test adapter; never selected by production configuration."""
    def __init__(self, prices: list[Price]):
        self.values = {p.price_key: p for p in prices}

    def prices(self, keys):
        return {key: self.values[key] for key in keys if key in self.values}


def price_key(product_id: str) -> str:
    return "btc_php" if product_id.endswith("_btc") else product_id


def price_limits(key: str) -> tuple[int, int]:
    # fresh/max reference age in seconds. Weekends have bounded, labeled fallback.
    if key.startswith(("gcash_", "dragonfi_")):
        return 172800, 604800
    if key == "btc_php":
        return 600, 3600
    return 172800, 345600  # Daily ETF EOD/FX; bounded weekend fallback.


def catalog():
    return [{"product_id": key, "provider": provider, "provider_name": PROVIDERS[provider],
             "display_name": PRODUCTS[key].display_name, "sleeve": PRODUCTS[key].sleeve.value,
             "price_kind": "nav" if provider in ("gcash", "dragonfi") else "reference"}
            for key, provider in UNIVERSE.items()]


class ValuedHolding(Holding):
    display_name: str
    provider_name: str
    sleeve: AssetRole
    value_php: Decimal | None
    freshness: Literal["fresh", "stale", "unavailable"]
    price_kind: Literal["nav", "reference"]
    as_of: datetime | None
    valuation_source: Literal["nav", "market_reference", "manual_user", "unavailable"]


class SleeveValue(DomainModel):
    sleeve: AssetRole
    known_value_php: Decimal
    current_percentage: Decimal | None
    target_percentage: int | None
    difference_pp: Decimal | None


class Portfolio(DomainModel):
    currency: Literal["PHP"] = "PHP"
    holdings: tuple[ValuedHolding, ...]
    known_value_php: Decimal
    total_value_php: Decimal | None
    complete: bool
    unavailable_count: int
    stale_count: int
    bitcoin_units: Decimal
    provider_values_php: dict[str, Decimal]
    sleeves: tuple[SleeveValue, ...]
    valued_at: datetime
    data_sources: tuple[str, ...] = ()


def value_portfolio(holdings: list[Holding], market: MarketData, target: Allocation | None,
                    now: datetime | None = None) -> Portfolio:
    with localcontext() as precision:
        precision.prec = 80
        return _value_portfolio(holdings, market, target, now)


def _value_portfolio(holdings, market, target, now):
    keys = {price_key(h.product_id) for h in holdings}
    if any(h.provider == "gotrade" for h in holdings):
        keys.add("usd_php")
    prices = market.prices(keys)
    now = now or datetime.now(timezone.utc)
    rows = []
    providers: dict[str, Decimal] = {}
    sleeves = {role: Decimal(0) for role in AssetRole}
    for holding in holdings:
        needed = [price_key(holding.product_id)] + (["usd_php"] if holding.provider == "gotrade" else [])
        available = [prices[k] for k in needed if k in prices]
        valid = holding.units is not None and len(available) == len(needed) and all(
            0 <= (now - p.as_of).total_seconds() <= price_limits(p.price_key)[1] for p in available)
        stale = valid and any((now - p.as_of).total_seconds() > price_limits(p.price_key)[0] for p in available)
        amount = holding.units
        if valid:
            for p in available:
                amount *= p.value
        amount = amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP) if valid else None
        source = ("nav" if holding.product_id in MANUAL_FUNDS else "market_reference") if valid else "unavailable"
        as_of = min(p.as_of for p in available) if valid else None
        # A manual amount is a whole holding's PHP value, never a per-unit NAV.
        # Acceptable cached NAV remains authoritative, even if it is marked stale.
        if not valid and holding.product_id in MANUAL_FUNDS and holding.manual_value_php is not None:
            age = (now - holding.manual_value_updated_at).total_seconds()
            if 0 <= age <= MANUAL_VALUE_MAX_AGE:
                amount = holding.manual_value_php.quantize(Decimal(".01"))
                valid, stale, source = True, False, "manual_user"
                as_of = holding.manual_value_updated_at
        product = PRODUCTS[holding.product_id]
        if amount is not None:
            providers[holding.provider] = providers.get(holding.provider, Decimal(0)) + amount
            sleeves[product.sleeve] += amount
        rows.append(ValuedHolding(**holding.model_dump(), display_name=product.display_name,
            provider_name=PROVIDERS[holding.provider], sleeve=product.sleeve, value_php=amount,
            freshness="stale" if stale else "fresh" if valid else "unavailable",
            price_kind="nav" if holding.provider in ("gcash", "dragonfi") else "reference",
            as_of=as_of, valuation_source=source))
    total = sum(sleeves.values(), Decimal(0))
    missing = sum(r.value_php is None for r in rows)
    complete = missing == 0
    comparisons = []
    for role, value in sleeves.items():
        actual = value / total * 100 if complete and total else None
        weight = target.weight(role) if target is not None else None
        comparisons.append(SleeveValue(sleeve=role, known_value_php=value,
            current_percentage=actual, target_percentage=weight,
            difference_pp=actual - weight if actual is not None and weight is not None else None))
    return Portfolio(holdings=tuple(rows), known_value_php=total,
        total_value_php=total if complete else None, complete=complete, unavailable_count=missing,
        bitcoin_units=sum((h.units for h in holdings if PRODUCTS[h.product_id].sleeve == AssetRole.CRYPTO), Decimal(0)),
        stale_count=sum(r.freshness == "stale" for r in rows), provider_values_php=providers,
        sleeves=tuple(comparisons), valued_at=now,
        data_sources=tuple(sorted({p.source for p in prices.values() if p.source in ("marketstack", "coinranking", "exchangerate_api", "toap")})))


def current_values(portfolio: Portfolio):
    """Feed existing engines only a complete valuation, never partial known totals."""
    if not portfolio.holdings or not portfolio.complete or portfolio.stale_count:
        raise ValueError("Refresh complete portfolio prices before calculating a scenario")
    from app.services.contributions.models import CurrentPortfolio
    return CurrentPortfolio(currency="PHP", **{s.sleeve.value: s.known_value_php for s in portfolio.sleeves},
        owned_product_ids=frozenset(h.product_id for h in portfolio.holdings))
