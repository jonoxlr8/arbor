from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.implementation.models import ImplementationProduct, MatchQuality, RouteId
from app.services.implementation.products import PRODUCTS, get_product
from app.services.implementation.routes import ROUTES
from app.services.strategy_v2 import AssetRole


def test_exact_primary_routes_and_valid_unique_product_scopes():
    assert {route.value for route in ROUTES} == {"gcash", "dragonfi", "gotrade", "ibkr"}
    assert len(ROUTES) == len({route.route_id for route in ROUTES.values()}) == 4
    assert len(PRODUCTS) == len({product.product_id for product in PRODUCTS.values()}) == 16
    for key, product in PRODUCTS.items():
        assert key == product.product_id
        assert product.sleeve in AssetRole
        assert product.match_quality in MatchQuality
        assert product.monthly_contribution_required is False
        assert product.last_verified_at is None  # Do not fabricate verification.
        assert product.supports_auto_invest is None
        assert product.recurring_frequency is None
        if product.route_id is not None:
            assert product.route_id in ROUTES and product.catalog_scope == "route"
        else:
            assert product.catalog_scope in {"shared", "secondary_fallback"}
    assert PRODUCTS["coins_btc"].catalog_scope == "shared"
    assert PRODUCTS["pdax_btc"].catalog_scope == "shared"
    assert set(MatchQuality) == {"direct", "broad", "unavailable"}
    assert not any("deposit" in field for field in ImplementationProduct.model_fields)


@pytest.mark.parametrize("product_id", ["gcash_global_equity", "gcash_technology"])
def test_gcash_official_global_fund_minimums(product_id):
    product = get_product(product_id)
    assert product.minimum_initial == 1000
    assert product.minimum_additional == 500
    assert product.minimum_additional_status == "published"
    assert product.currency == "PHP"
    assert "official" in product.minimum_source


def test_gcash_bond_and_crypto_units():
    bond = get_product("gcash_defensive")
    assert bond.minimum_initial == bond.minimum_additional == 50
    crypto = get_product("gcrypto_btc")
    assert crypto.minimum_order_quantity == Decimal("0.00002")
    assert crypto.minimum_order_currency == "BTC"
    assert crypto.minimum_order is crypto.minimum_initial is crypto.practical_minimum is None
    assert get_product("gcash_global_equity").match_quality == "broad"
    assert "Not a pure broad-market index equivalent." in get_product("gcash_global_equity").eligibility_notes


@pytest.mark.parametrize("product_id,name", [
    ("dragonfi_global_equity", "BPI Global Equity Fund of Funds"),
    ("dragonfi_technology", "BPI World Technology Feeder Fund"),
    ("dragonfi_defensive", "BPI Premium Bond Fund"),
])
def test_dragonfi_is_bpi_not_atram(product_id, name):
    product = get_product(product_id)
    assert product.display_name == name
    assert product.provider == "BPI" and product.platform == "DragonFi"
    assert product.minimum_initial == 1000 and product.currency == "PHP"
    assert product.minimum_additional is None
    assert product.minimum_additional_status == "verify_in_app"
    assert product.match_quality == "direct"


@pytest.mark.parametrize("ticker", ["vt", "vgt", "bnd"])
def test_gotrade_order_minimum_not_account_deposit(ticker):
    product = get_product("gotrade_" + ticker)
    assert product.display_name == ticker.upper()
    assert product.minimum_order == 1 and product.minimum_order_currency == "USD"
    assert product.supports_fractional is True
    assert product.minimum_initial is None


def test_gotrade_fees_are_separate_metadata():
    fees = ROUTES[RouteId.GOTRADE].fees
    assert (fees.trading_fee_min_pct, fees.trading_fee_max_pct) == (Decimal("0.15"), Decimal("0.30"))
    assert fees.minimum_trade_fee == Decimal("0.10") and fees.fee_currency == "USD"
    assert (fees.fx_fee_min_pct, fees.fx_fee_max_pct) == (Decimal("0.3"), Decimal("1"))
    assert fees.withdrawal_fee_local == 5 and fees.withdrawal_fee_usd == 50
    assert "Method-dependent" in fees.deposit_fee_note


@pytest.mark.parametrize("product_id", ["ibkr_vwra", "ibkr_iuit", "ibkr_aggu", "ibkr_btc"])
def test_ibkr_unresolved_minimums_stay_null(product_id):
    product = get_product(product_id)
    assert product.minimum_order is product.minimum_initial is product.practical_minimum is None
    assert product.supports_fractional is None
    assert product.minimum_source is None
    assert product.eligibility_notes


def test_partnerships_do_not_claim_signed_arbor_relationships():
    coins = get_product("coins_btc")
    assert coins.minimum_order == 5 and coins.minimum_order_currency == "PHP"
    assert coins.partnership.affiliate_available is True
    assert coins.partnership.affiliate_type == "business_affiliate"
    assert coins.partnership.compensation_model == "revenue_share_on_trading_fees"
    assert coins.partnership.disclosure_required is True
    assert coins.partnership.partner_status == "unknown"
    assert ROUTES[RouteId.DRAGONFI].partnership.partner_status == "potential_partner"
    assert ROUTES[RouteId.DRAGONFI].partnership.affiliate_available is None
    for route in [RouteId.GCASH, RouteId.GOTRADE, RouteId.IBKR]:
        assert ROUTES[route].partnership.affiliate_available is False
    assert get_product("pdax_btc").partnership.affiliate_available is None


@pytest.mark.parametrize("field", ["minimum_initial", "minimum_additional", "minimum_order", "minimum_order_quantity", "practical_minimum"])
@pytest.mark.parametrize("value", [-1, float("nan"), float("inf")])
def test_invalid_minimums_rejected(field, value):
    data = get_product("gcash_defensive").model_dump()
    data[field] = value
    with pytest.raises(ValidationError):
        ImplementationProduct.model_validate(data)


def test_product_metadata_is_immutable_and_round_trips():
    for product in PRODUCTS.values():
        assert ImplementationProduct.model_validate_json(product.model_dump_json()) == product
    with pytest.raises(ValidationError):
        get_product("coins_btc").minimum_order = 0
    with pytest.raises(TypeError):
        PRODUCTS["extra"] = get_product("coins_btc")
