from app.services.arbor.knowledge.assets import ASSETS


def get_asset(ticker: str):

    if not ticker:
        return None

    return ASSETS.get(ticker.upper())


def asset_exists(ticker: str) -> bool:
    return ticker.upper() in ASSETS


def get_asset_field(ticker: str, field: str):

    asset = get_asset(ticker)

    if not asset:
        return None

    # Compatibility layer
    if field == "summary":

        if "summary" in asset:
            return asset["summary"]

        if "description" in asset:
            return asset["description"]

        if "purpose" in asset:
            return asset["purpose"]

    if field == "strengths":
        return asset.get("strengths", [])

    if field == "considerations":
        return asset.get("considerations", [])

    return asset.get(field)
