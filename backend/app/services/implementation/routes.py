"""Four explicit user-selected routes. Ordering is not a recommendation."""
from types import MappingProxyType

from .models import Fees, ImplementationRoute, Partnership, RouteId

ROUTES = MappingProxyType({
    RouteId.GCASH: ImplementationRoute(
        route_id="gcash", label="GCash / GFunds",
        description="Access to supported funds through GFunds. Bitcoin provider choice is separate.",
        route_type="local_funds", beginner_level="beginner",
        partnership=Partnership(partner_status="potential_business_partner", affiliate_available=False),
    ),
    RouteId.DRAGONFI: ImplementationRoute(
        route_id="dragonfi", label="DragonFi — Philippine investing app",
        description="Access to supported BPI funds through DragonFi. Bitcoin provider choice is separate.",
        route_type="local_funds", beginner_level="beginner",
        partnership=Partnership(partner_status="potential_partner", affiliate_available=None),
    ),
    RouteId.GOTRADE: ImplementationRoute(
        route_id="gotrade", label="Gotrade — simple global ETFs",
        description="Simple global route using fractional US-listed ETFs.",
        route_type="us_etfs", beginner_level="beginner",
        partnership=Partnership(affiliate_available=False),
        fees=Fees(trading_fee_min_pct="0.15", trading_fee_max_pct="0.30",
                  minimum_trade_fee="0.10", fee_currency="USD",
                  fx_fee_min_pct="0.3", fx_fee_max_pct="1",
                  deposit_fee_note="Method-dependent bank deposit fee; verify in app.",
                  withdrawal_fee_local="5", withdrawal_fee_usd="50"),
    ),
    RouteId.IBKR: ImplementationRoute(
        route_id="ibkr", label="Interactive Brokers — advanced global ETFs",
        description="Advanced global route using Irish-domiciled UCITS ETFs.",
        route_type="ucits_etfs", beginner_level="advanced", beginner_visible=False,
        partnership=Partnership(affiliate_available=False),
    ),
})


def get_route(route_id: RouteId) -> ImplementationRoute:
    return ROUTES[RouteId(route_id)]
