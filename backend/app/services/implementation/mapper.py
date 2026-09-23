"""Pure explicit-route mapping. No ranking, financial policy, fees or commissions."""
from types import MappingProxyType

from app.services.portfolio_plan_v2 import PortfolioPlan
from app.services.readiness_v2 import ReadinessResult
from app.services.strategy_v2 import AssetRole, EffectiveTargetAllocation
from .models import (
    CryptoFallback, ImplementationMapping, MappedSleeve, MappingInput, MappingState,
    MatchQuality, RouteId,
)
from .products import get_product
from .bitcoin import BITCOIN_PRODUCTS
from .routes import get_route

_MAPPINGS = MappingProxyType({
    RouteId.GCASH: MappingProxyType({AssetRole.GLOBAL_EQUITY: "gcash_global_equity", AssetRole.TECHNOLOGY_TILT: "gcash_technology", AssetRole.DEFENSIVE: "gcash_defensive", AssetRole.CRYPTO: "gcrypto_btc"}),
    RouteId.DRAGONFI: MappingProxyType({AssetRole.GLOBAL_EQUITY: "dragonfi_global_equity", AssetRole.TECHNOLOGY_TILT: "dragonfi_technology", AssetRole.DEFENSIVE: "dragonfi_defensive", AssetRole.CRYPTO: "coins_btc"}),
    RouteId.GOTRADE: MappingProxyType({AssetRole.GLOBAL_EQUITY: "gotrade_vt", AssetRole.TECHNOLOGY_TILT: "gotrade_vgt", AssetRole.DEFENSIVE: "gotrade_bnd", AssetRole.CRYPTO: "coins_btc"}),
    RouteId.IBKR: MappingProxyType({AssetRole.GLOBAL_EQUITY: "ibkr_vwra", AssetRole.TECHNOLOGY_TILT: "ibkr_iuit", AssetRole.DEFENSIVE: "ibkr_aggu", AssetRole.CRYPTO: "coins_btc"}),
})


def map_effective_target(
    route_id: RouteId,
    effective_target_allocation: EffectiveTargetAllocation | None,
    readiness: ReadinessResult,
    *, path: str = "long_term", ibkr_crypto_eligible: bool | None = None,
    selection_mode: str = "legacy_route", bitcoin_provider: str | None = None,
) -> ImplementationMapping:
    inputs = MappingInput(route_id=route_id, effective_target_allocation=effective_target_allocation,
                          readiness=readiness, path=path, ibkr_crypto_eligible=ibkr_crypto_eligible,
                          selection_mode=selection_mode, bitcoin_provider=bitcoin_provider)
    route = get_route(inputs.route_id)
    if inputs.path == "short_term":
        return ImplementationMapping(route=route, state=MappingState.NOT_APPLICABLE,
            actionable=False, implementations=(), target_total_percentage_points=None,
            warnings=("Long-term implementation does not apply to this short-term plan.",))

    target = inputs.effective_target_allocation
    assert target is not None  # Input path validation.
    actionable = route.active and inputs.readiness.actionable_contribution_guidance_allowed
    state = MappingState.ACTIVE if actionable else MappingState.PREVIEW
    mapped = []
    for weight in target.allocation.weights:
        if weight.percentage_points == 0:
            continue
        product_id = _MAPPINGS[inputs.route_id][weight.role]
        fallback = None
        notes = []
        if weight.role == AssetRole.CRYPTO and inputs.bitcoin_provider is not None:
            product_id = BITCOIN_PRODUCTS[inputs.bitcoin_provider]
        elif weight.role == AssetRole.CRYPTO and inputs.route_id != RouteId.GCASH:
            if inputs.route_id == RouteId.IBKR:
                if inputs.ibkr_crypto_eligible is True:
                    product_id = "ibkr_btc"
                    fallback = CryptoFallback(alternative_product_ids=("coins_btc",), secondary_product_ids=("pdax_btc",))
                else:
                    fallback = CryptoFallback(selected_as_fallback=True,
                        fallback_reason="ibkr_crypto_not_confirmed_eligible", secondary_product_ids=("pdax_btc",))
                    notes.append("IBKR crypto is not confirmed eligible for this user; Coins.ph is the selected fallback.")
            else:
                fallback = CryptoFallback(secondary_product_ids=("pdax_btc",))
        product = get_product(product_id)
        if product.sleeve != weight.role or product.match_quality == MatchQuality.UNAVAILABLE:
            raise ValueError("Catalog does not support the requested sleeve")
        mapped.append(MappedSleeve(sleeve=weight.role, target_percentage_points=weight.percentage_points,
            product=product, match_quality=product.match_quality, state=state, actionable=actionable,
            crypto_fallback=fallback, warnings=tuple(notes) + product.eligibility_notes))
    return ImplementationMapping(route=route, state=state, actionable=actionable,
        implementations=tuple(mapped), target_total_percentage_points=sum(w.percentage_points for w in target.allocation.weights),
        warnings=() if actionable else ("Future preview only; this mapping is not actionable investment guidance.",))


def map_plan(route_id: RouteId, plan: PortfolioPlan, *, ibkr_crypto_eligible: bool | None = None,
             selection_mode: str = "legacy_route", bitcoin_provider: str | None = None) -> ImplementationMapping:
    """Use an existing canonical plan; never reconstruct strategy or readiness here."""
    return map_effective_target(route_id, plan.preference_result.effective_target,
        plan.readiness, path=plan.path, ibkr_crypto_eligible=ibkr_crypto_eligible,
        selection_mode=selection_mode, bitcoin_provider=bitcoin_provider)
