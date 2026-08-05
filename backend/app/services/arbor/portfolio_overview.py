from textwrap import dedent


def portfolio_overview_response(risk, horizon, diversified=False):

    if diversified:
        return dedent(f"""
Your portfolio is designed to provide diversification across different investment themes.

Your strategy combines:

- Broad market exposure through VOO
- Growth and innovation exposure through QQQM
- Semiconductor exposure through SMH
- Alternative assets through Bitcoin and Ethereum

While your portfolio has a growth focus and will experience volatility, diversification helps avoid relying on a single investment or industry.

With your {risk.lower()} risk profile and {horizon}-year horizon, Arbor believes this structure is designed for long-term wealth building while matching your ability to handle risk.
""")

    return dedent(f"""
Your portfolio was designed around your {risk.lower()} risk profile and {horizon}-year investment horizon.

Arbor created a growth-focused strategy that balances broad market exposure with higher-growth opportunities.

Your portfolio combines:

- Core market exposure through broad ETFs
- Technology and innovation exposure through growth-focused investments
- Alternative assets through cryptocurrency allocations

Because your strategy targets long-term wealth building, short-term market declines are expected. The most important factor is having a portfolio you can stay invested in during market cycles.

Arbor's goal is not to eliminate risk, but to build a strategy where the potential rewards justify the risks you are comfortable taking.
""")