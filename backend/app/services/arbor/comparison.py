from app.services.arbor.knowledge.service import get_asset


def compare_assets(left, right):

    if not left or not right:
        return None

    left_asset = get_asset(left)
    right_asset = get_asset(right)

    if not left_asset or not right_asset:
        return None

    return {
        "left": left_asset,
        "right": right_asset,
    }
