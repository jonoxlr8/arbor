"""Implementation metadata, separate from Portfolio Engine financial policy."""
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.services.readiness_v2 import ReadinessResult
from app.services.strategy_v2 import (
    AssetRole, DomainModel, EffectiveTargetAllocation, PercentagePoints,
)

IMPLEMENTATION_CATALOG_VERSION = "ph-v1"
NonNegative = Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]


class RouteId(str, Enum):
    GCASH = "gcash"
    DRAGONFI = "dragonfi"
    GOTRADE = "gotrade"
    IBKR = "ibkr"


class BitcoinProvider(str, Enum):
    GCRYPTO = "gcrypto"
    COINS = "coins_ph"
    PDAX = "pdax"


class MatchQuality(str, Enum):
    DIRECT = "direct"
    BROAD = "broad"
    UNAVAILABLE = "unavailable"


class MappingState(str, Enum):
    ACTIVE = "active"
    PREVIEW = "preview"
    NOT_APPLICABLE = "not_applicable"


class Partnership(DomainModel):
    partner_status: Literal["unknown", "potential_partner", "potential_business_partner"] = "unknown"
    affiliate_available: bool | None = None
    affiliate_type: Literal["business_affiliate"] | None = None
    compensation_model: Literal["revenue_share_on_trading_fees"] | None = None
    disclosure_required: bool | None = None


class Fees(DomainModel):
    # Informational percentages, not fractions; never used for mapping.
    trading_fee_min_pct: NonNegative | None = None
    trading_fee_max_pct: NonNegative | None = None
    minimum_trade_fee: NonNegative | None = None
    fee_currency: Literal["USD", "PHP"] | None = None
    fx_fee_min_pct: NonNegative | None = None
    fx_fee_max_pct: NonNegative | None = None
    deposit_fee_note: str | None = None
    withdrawal_fee_local: NonNegative | None = None
    withdrawal_fee_usd: NonNegative | None = None

    @model_validator(mode="after")
    def ordered_ranges(self):
        for low, high in [(self.trading_fee_min_pct, self.trading_fee_max_pct),
                          (self.fx_fee_min_pct, self.fx_fee_max_pct)]:
            if low is not None and high is not None and low > high:
                raise ValueError("Fee range minimum cannot exceed maximum")
        return self


class ImplementationRoute(DomainModel):
    route_id: RouteId
    label: str
    description: str
    country: Literal["Philippines"] = "Philippines"
    route_type: Literal["local_funds", "us_etfs", "ucits_etfs"]
    beginner_level: Literal["beginner", "advanced"]
    beginner_visible: bool = True
    active: bool = True
    partnership: Partnership = Field(default_factory=Partnership)
    fees: Fees | None = None


class ImplementationProduct(DomainModel):
    product_id: str
    route_id: RouteId | None = None
    catalog_scope: Literal["route", "shared", "secondary_fallback"] = "route"
    display_name: str
    provider: str
    platform: str
    # Reuse global_equity/defensive/technology_tilt/crypto, not a parallel sleeve vocabulary.
    sleeve: AssetRole
    match_quality: MatchQuality
    currency: Literal["PHP", "USD", "BTC"] | None
    minimum_initial: NonNegative | None = None
    minimum_additional: NonNegative | None = None
    minimum_additional_status: Literal["published", "verify_in_app", "unknown"] = "unknown"
    minimum_order: NonNegative | None = None
    minimum_order_quantity: NonNegative | None = None
    minimum_order_currency: Literal["PHP", "USD", "BTC"] | None = None
    supports_fractional: bool | None = None
    supports_auto_invest: bool | None = None
    recurring_frequency: str | None = None
    monthly_contribution_required: Literal[False] = False
    available_in_ph: bool | None = None
    eligibility_notes: tuple[str, ...] = ()
    practical_minimum: NonNegative | None = None
    minimum_source: str | None = None
    last_verified_at: date | None = None
    partnership: Partnership = Field(default_factory=Partnership)

    @model_validator(mode="after")
    def explicit_scope_and_units(self):
        if (self.catalog_scope == "route") != (self.route_id is not None):
            raise ValueError("Route products need a route; shared/fallback products must not claim one")
        if (self.minimum_initial is not None or self.minimum_additional is not None) and self.currency is None:
            raise ValueError("Monetary minimums need a currency")
        if (self.minimum_order is not None or self.minimum_order_quantity is not None) and self.minimum_order_currency is None:
            raise ValueError("Order minimums need explicit units")
        if self.minimum_additional_status == "published" and self.minimum_additional is None:
            raise ValueError("Published additional minimum needs a value")
        return self


class MappingInput(DomainModel):
    route_id: RouteId
    effective_target_allocation: EffectiveTargetAllocation | None
    readiness: ReadinessResult
    path: Literal["long_term", "short_term"]
    ibkr_crypto_eligible: Annotated[bool, Field(strict=True)] | None = None
    # Omitted selection mode preserves historical API/mapper callers, not new UI defaults.
    selection_mode: Literal["legacy_route", "explicit"] = "legacy_route"
    bitcoin_provider: BitcoinProvider | None = None

    @model_validator(mode="after")
    def target_matches_path(self):
        if (self.path == "long_term") != (self.effective_target_allocation is not None):
            raise ValueError("Long-term mapping requires a target; short-term mapping must not have one")
        if (self.selection_mode == "explicit" and self.effective_target_allocation is not None
                and self.effective_target_allocation.allocation.weight(AssetRole.CRYPTO) > 0
                and self.bitcoin_provider is None):
            raise ValueError("Choose a Bitcoin provider for the Bitcoin target")
        return self


class CryptoFallback(DomainModel):
    selected_as_fallback: bool = False
    fallback_reason: Literal["ibkr_crypto_not_confirmed_eligible"] | None = None
    alternative_product_ids: tuple[str, ...] = ()
    secondary_product_ids: tuple[str, ...] = ()


class MappedSleeve(DomainModel):
    sleeve: AssetRole
    target_percentage_points: PercentagePoints
    product: ImplementationProduct
    match_quality: MatchQuality
    state: MappingState
    actionable: bool
    crypto_fallback: CryptoFallback | None = None
    warnings: tuple[str, ...] = ()


class ImplementationMapping(DomainModel):
    implementation_catalog_version: str = IMPLEMENTATION_CATALOG_VERSION
    route: ImplementationRoute
    state: MappingState
    actionable: bool
    implementations: tuple[MappedSleeve, ...]
    # No long-term target exists for short-term plans; null is not a zero allocation.
    target_total_percentage_points: PercentagePoints | None
    warnings: tuple[str, ...] = ()
