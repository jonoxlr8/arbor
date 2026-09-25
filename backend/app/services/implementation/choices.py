"""Explicit per-sleeve selections; never defaults, rankings or financial policy."""
from types import MappingProxyType

from app.services.strategy_v2 import Allocation, AssetRole


IMPLEMENTATION_OPTIONS = MappingProxyType({
    AssetRole.GLOBAL_EQUITY: ("gotrade_vt", "gcash_global_equity", "dragonfi_global_equity"),
    AssetRole.DEFENSIVE: ("gotrade_bnd", "gcash_defensive", "dragonfi_defensive"),
    AssetRole.TECHNOLOGY_TILT: ("gotrade_vgt", "gcash_technology", "dragonfi_technology"),
    AssetRole.CRYPTO: ("gcrypto_btc", "coins_btc", "pdax_btc"),
})
PROVIDER_IDS = MappingProxyType({
    "gotrade_vt": "gotrade", "gotrade_vgt": "gotrade", "gotrade_bnd": "gotrade",
    "gcash_global_equity": "gcash", "gcash_technology": "gcash", "gcash_defensive": "gcash",
    "dragonfi_global_equity": "dragonfi", "dragonfi_technology": "dragonfi", "dragonfi_defensive": "dragonfi",
    "gcrypto_btc": "gcrypto", "coins_btc": "coins_ph", "pdax_btc": "pdax",
})


def validate_implementation_choices(choices: dict) -> dict[AssetRole, str]:
    if not isinstance(choices, dict):
        raise ValueError("Choose supported investments for your plan")
    result = {}
    for role, product in choices.items():
        role = AssetRole(role)
        if not isinstance(product, str) or product not in IMPLEMENTATION_OPTIONS[role]:
            raise ValueError("Choose a supported investment for each sleeve")
        result[role] = product
    return result


def validate_active_choices(choices: dict, target: Allocation | None) -> dict[AssetRole, str]:
    result = validate_implementation_choices(choices)
    if target is None or any(target.weight(role) <= 0 for role in result):
        raise ValueError("Choose investments only for active targets in your saved plan")
    return result
