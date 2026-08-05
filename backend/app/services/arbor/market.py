from textwrap import dedent


def market_crash_response(risk, horizon):

    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, market volatility is expected during your investing journey.

Your portfolio is designed for long-term investing, which means short-term declines are a normal part of the process.

During a market crash:

- Your portfolio value may temporarily decline.
- Quality companies and ETFs may become available at lower prices.
- Continuing to invest can allow you to buy more shares at discounted prices.

The biggest risk is usually not the market crash itself, but making emotional decisions and selling during downturns.

Because your strategy is focused on long-term wealth building, Arbor's approach is to stay disciplined, maintain your plan, and allow time and compound growth to work.
""")


def market_response(
    risk,
    horizon,
    plan=None,
):

    from app.services.arbor.exposure import get_asset_exposure

    voo_exposure = get_asset_exposure(plan, "voo")

    if voo_exposure["has_direct"]:

        exposure_message = f"""
Your portfolio already has VOO exposure with approximately {voo_exposure["allocation"]}% allocation.

VOO provides broad exposure to the S&P 500, giving you ownership in many of the largest U.S. companies across different industries.
"""

    else:

        exposure_message = """
Your portfolio does not appear to have direct VOO exposure.

Broad market ETFs such as VOO can provide diversified exposure to the overall U.S. stock market.
"""

    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor views broad market investing as an important foundation for long-term wealth building.

{exposure_message}

VOO tracks the S&P 500, which represents many of America's largest and most established companies.

Broad market exposure can help balance higher-growth investments like QQQM and SMH by providing:

- Diversification across industries
- Lower company-specific risk
- Participation in overall economic growth

Compared with more concentrated growth investments, VOO generally provides a more balanced approach with lower volatility.

Arbor uses broad market exposure as part of a disciplined long-term investing strategy.
""")
