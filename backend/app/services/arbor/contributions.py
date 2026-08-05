from textwrap import dedent


def increase_contributions_response(
    current_value,
    monthly_contribution,
    horizon,
):
    return dedent(f"""
Based on your current plan, the biggest factor that can accelerate your wealth journey is increasing your investment contributions.

Your current plan:
- Current portfolio: ${current_value:,.0f}
- Monthly investment: ${monthly_contribution:,.0f}
- Investment horizon: {horizon} years

Increasing contributions can have a significant impact because every additional dollar has more time to compound.

Other ways to accelerate financial freedom:
- Increase income while keeping lifestyle costs controlled
- Invest consistently regardless of market conditions
- Reinvest all gains
- Avoid unnecessary emotional decisions during market downturns

Arbor focuses on helping you build sustainable wealth, not just taking more risk.
""")