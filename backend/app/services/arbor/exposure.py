from textwrap import dedent


def get_asset_exposure(plan, ticker):

    result = {
        "has_direct": False,
        "allocation": 0,
        "message": "",
    }

    if not plan:
        return result

    ticker = ticker.lower()

    for holding in plan.get("portfolio", []):

        holding_ticker = holding.get("ticker", "").lower()
        asset_name = holding.get("asset_name", "").lower()

        if holding_ticker == ticker or ticker in asset_name:
            result["has_direct"] = True
            result["allocation"] = holding.get("allocation", 0)

            result["message"] = dedent(f"""
Your portfolio already has direct exposure to {holding.get("asset_name")} with approximately {result["allocation"]}% allocation.

Before increasing this position, consider whether adding more aligns with your target allocation and diversification strategy.
""")

            return result

    return result


def indirect_exposure_message(asset):

    return dedent(f"""
Your portfolio may already have indirect exposure to {asset} through diversified ETFs or funds.

Before adding individual positions, consider your existing exposure and whether increasing concentration matches your long-term strategy.
""")