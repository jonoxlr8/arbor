from textwrap import dedent

from app.services.arbor.exposure import (
    get_asset_exposure,
)

from app.services.arbor.knowledge.service import get_asset


def crypto_response(
    risk,
    horizon,
    plan=None,
):
    btc = get_asset("BTC")
    btc_exposure = get_asset_exposure(plan, "btc")
    eth_exposure = get_asset_exposure(plan, "eth")

    exposure_message = ""

    if btc_exposure["has_direct"]:

        exposure_message += dedent(f"""
Your portfolio already has Bitcoin exposure with approximately {btc_exposure["allocation"]}% allocation.

Increasing Bitcoin exposure should be considered carefully because crypto can experience significant volatility compared with traditional investments.
""")

    if eth_exposure["has_direct"]:

        exposure_message += dedent(f"""
Your portfolio already has Ethereum exposure with approximately {eth_exposure["allocation"]}% allocation.

Consider whether additional Ethereum exposure aligns with your target allocation and overall risk strategy.
""")

    if not btc_exposure["has_direct"] and not eth_exposure["has_direct"]:

        exposure_message = dedent("""
Your portfolio does not appear to have direct crypto exposure.

If you decide to include crypto, Arbor recommends considering it as a higher-risk satellite allocation rather than replacing core investments.
""")

    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor views cryptocurrency as a high-growth but high-volatility asset class.

{exposure_message}

{btc["description"]}

Bitcoin and Ethereum may provide diversification benefits and exposure to emerging financial technology, but they also carry risks:

- Large price fluctuations
- Regulatory uncertainty
- Market sentiment risk
- Higher volatility than traditional assets

Arbor focuses on maintaining a balanced portfolio where higher-risk assets complement, rather than replace, diversified long-term investments.

The goal is to participate in innovation while maintaining a disciplined investment strategy.
""")
