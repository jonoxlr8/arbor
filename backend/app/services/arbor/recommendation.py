def asset_recommendation_response(
    ticker,
    allocation,
    target_allocation,
    risk,
    horizon,
):

    if allocation >= target_allocation:

        return f"""
Your current {ticker} allocation ({allocation}%) is aligned with your target allocation of {target_allocation}%.

Arbor generally recommends staying consistent with your long-term plan rather than increasing exposure based on recent price movements.

If your allocation falls below target due to market changes, rebalancing may be considered.
"""

    else:

        return f"""
Your current {ticker} allocation ({allocation}%) is below your target allocation of {target_allocation}%.

Adding more {ticker} could help bring your portfolio closer to your intended strategy.

However, decisions should consider your risk profile and long-term goals.
"""