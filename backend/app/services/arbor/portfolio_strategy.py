from textwrap import dedent


def portfolio_strategy_response(
    risk,
    horizon,
    goal,
    holdings,
):

    portfolio_text = "\n".join(
        [
            f"- {item['ticker']} ({item['allocation']}%)"
            for item in holdings
        ]
    )

    return dedent(f"""
🌳
Arbor
AI Investment Companion


## Why your portfolio is structured this way

Your portfolio is designed around your long-term investment strategy.

Investor profile:
- Risk profile: {risk}
- Investment horizon: {horizon} years
- Goal: {goal}


Current allocation:

{portfolio_text}


Arbor evaluates portfolios based on:

- Long-term growth potential
- Diversification
- Risk level
- Investment timeframe
- Alignment with financial goals


A successful portfolio is not about owning the most investments.

It is about owning investments with clear roles that work together toward your objectives.
""")