from textwrap import dedent


def portfolio_risk_response(risk, horizon):
    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor has designed your portfolio for long-term growth, but every investment strategy has risks.

Your main portfolio risks include:

- Market risk: Stock markets can experience significant declines during economic downturns.
- Technology concentration risk: QQQM and SMH provide strong growth potential but are more exposed to technology cycles.
- Crypto volatility risk: Bitcoin and Ethereum can experience large price movements compared with traditional investments.
- Emotional risk: Selling during market downturns can negatively impact long-term results.

The reason Arbor combines different assets is to balance these risks while maintaining growth potential.

Your biggest advantage is your long investment horizon, which gives your portfolio time to recover from short-term market fluctuations.
""")