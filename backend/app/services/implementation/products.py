"""Locked 3P-A catalog facts, not live availability or independent verification.

Sources identify the supplied specification; verification dates intentionally
remain null. No live FX conversion, account deposit minimums or practical-buy math.
"""
from types import MappingProxyType

from .models import ImplementationProduct, Partnership
from .routes import ROUTES

GCASH_SOURCE = "3P-A locked requirements: official GCash/ATRAM published minimums supplied by product owner; not independently verified here."
LOCKED_SOURCE = "3P-A locked requirements supplied by product owner; verify current provider terms before execution."
GLOBAL_FUND_NOTE = "Live app thresholds may be lower; catalog uses the official PHP 1,000 initial minimum supplied in 3P-A."
GFUNDS_OWNER_SOURCE = "Owner-reported GFunds app observation: PHP 500 initial purchase for these two ATRAM funds; not independently verified. Additional minimum unknown; verify in app."
BITCOIN_MINIMUM_SOURCE = "Owner-directed catalog policy: execution minimum unknown; verify in the selected Bitcoin provider app."
IBKR_NOTE = "Listing, fractional eligibility, commission and FX affect the practical minimum; verify in app."


def fund(product_id, route, name, provider, platform, sleeve, initial, additional=None, broad=False, minimum_source=None):
    return ImplementationProduct(
        product_id=product_id, route_id=route, display_name=name, provider=provider,
        platform=platform, sleeve=sleeve, match_quality="broad" if broad else "direct",
        currency="PHP", minimum_initial=initial, minimum_additional=additional,
        minimum_additional_status="published" if additional is not None else "verify_in_app",
        available_in_ph=True, partnership=ROUTES[route].partnership,
        minimum_source=minimum_source if minimum_source is not None else (GCASH_SOURCE if route == "gcash" else LOCKED_SOURCE),
        eligibility_notes=(("Not a pure broad-market index equivalent.",) if broad else ()) +
            ((GLOBAL_FUND_NOTE,) if route == "gcash" and initial == 1000 else ()),
    )


def etf(product_id, route, ticker, provider, sleeve):
    gotrade = route == "gotrade"
    return ImplementationProduct(
        product_id=product_id, route_id=route, display_name=ticker, provider=provider,
        platform="Gotrade" if gotrade else "Interactive Brokers", sleeve=sleeve,
        match_quality="direct", currency="USD", minimum_order=1 if gotrade else None,
        minimum_order_currency="USD", supports_fractional=True if gotrade else None,
        available_in_ph=True, minimum_source=LOCKED_SOURCE if gotrade else None,
        practical_minimum=100 if gotrade else None,
        minimum_additional_status="verify_in_app" if gotrade else "unknown",
        eligibility_notes=("US-listed ETF; verify current fractional trading availability.",
         "Arbor practical initial minimum: PHP 100, not the provider's official minimum. Gotrade order minimum: USD 1. Additional purchase minimum: verify in app.") if gotrade else
            ("Irish-domiciled UCITS ETF; USD listing context.", IBKR_NOTE),
        partnership=ROUTES[route].partnership,
    )


_PRODUCTS = (
    fund("gcash_global_equity", "gcash", "ATRAM Global Equity Opportunity Feeder Fund", "ATRAM", "GFunds", "global_equity", 500, broad=True, minimum_source=GFUNDS_OWNER_SOURCE),
    fund("gcash_technology", "gcash", "ATRAM Global Technology Feeder Fund", "ATRAM", "GFunds", "technology_tilt", 500, minimum_source=GFUNDS_OWNER_SOURCE),
    fund("gcash_defensive", "gcash", "ATRAM Medium Term Peso Bond Fund", "ATRAM", "GFunds", "defensive", 50, minimum_source="Owner-specified GFunds catalog policy: PHP 50 initial purchase; additional minimum unknown, verify in app. Not independently verified here."),
    ImplementationProduct(product_id="gcrypto_btc", route_id="gcash", display_name="GCrypto BTC",
        provider="GCrypto", platform="GCrypto", sleeve="crypto", match_quality="direct", currency="BTC",
        minimum_order_currency="BTC", minimum_additional_status="verify_in_app", available_in_ph=True,
        minimum_source=BITCOIN_MINIMUM_SOURCE, partnership=ROUTES["gcash"].partnership,
        eligibility_notes=("Execution minimum must be verified in GCrypto; no numeric minimum is assumed.",)),
    fund("dragonfi_global_equity", "dragonfi", "BPI Global Equity Fund of Funds", "BPI", "DragonFi", "global_equity", 1000),
    fund("dragonfi_technology", "dragonfi", "BPI World Technology Feeder Fund", "BPI", "DragonFi", "technology_tilt", 1000),
    fund("dragonfi_defensive", "dragonfi", "BPI Premium Bond Fund", "BPI", "DragonFi", "defensive", 1000),
    etf("gotrade_vt", "gotrade", "VT", "Vanguard", "global_equity"),
    etf("gotrade_vgt", "gotrade", "VGT", "Vanguard", "technology_tilt"),
    etf("gotrade_bnd", "gotrade", "BND", "Vanguard", "defensive"),
    etf("ibkr_vwra", "ibkr", "VWRA", "Vanguard", "global_equity"),
    etf("ibkr_iuit", "ibkr", "IUIT", "iShares", "technology_tilt"),
    etf("ibkr_aggu", "ibkr", "AGGU", "iShares", "defensive"),
    ImplementationProduct(product_id="ibkr_btc", route_id="ibkr", display_name="IBKR BTC",
        provider="IBKR crypto", platform="Interactive Brokers", sleeve="crypto", match_quality="direct",
        currency=None, available_in_ph=None, partnership=ROUTES["ibkr"].partnership,
        eligibility_notes=("Explicit account crypto eligibility required; Philippine access is not assumed.",
                           "Order minimum and trading currency must be verified for the eligible account.")),
    ImplementationProduct(product_id="coins_btc", catalog_scope="shared", display_name="Coins.ph BTC",
        provider="Coins.ph", platform="Coins.ph", sleeve="crypto", match_quality="direct", currency="PHP",
        minimum_order_currency="PHP", minimum_additional_status="verify_in_app", available_in_ph=True, minimum_source=BITCOIN_MINIMUM_SOURCE,
        eligibility_notes=("Execution minimum must be verified in Coins.ph; no numeric minimum is assumed.",),
        partnership=Partnership(affiliate_available=True, affiliate_type="business_affiliate",
            compensation_model="revenue_share_on_trading_fees", disclosure_required=True)),
    ImplementationProduct(product_id="pdax_btc", catalog_scope="shared", display_name="PDAX BTC",
        provider="PDAX", platform="PDAX", sleeve="crypto", match_quality="direct", currency=None, minimum_additional_status="verify_in_app", minimum_source=BITCOIN_MINIMUM_SOURCE,
        eligibility_notes=("User-selected Bitcoin option. Minimum, currency and account eligibility must be verified in app.",)),
)
if len({product.product_id for product in _PRODUCTS}) != len(_PRODUCTS):
    raise ValueError("Duplicate implementation product IDs")
PRODUCTS = MappingProxyType({product.product_id: product for product in _PRODUCTS})


def get_product(product_id: str) -> ImplementationProduct:
    return PRODUCTS[product_id]
