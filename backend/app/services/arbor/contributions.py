from textwrap import dedent

from app.services.arbor.currency_formatter import format_currency


def increase_contributions_response(
    current_value,
    monthly_contribution,
    horizon,
    currency,
):
    return dedent(f"""
Based on your current plan, the biggest factor that can accelerate your wealth journey is increasing your investment contributions.

Your current plan:
- Current portfolio: {format_currency(current_value, currency)}
- Monthly investment: {format_currency(monthly_contribution, currency)}
- Investment horizon: {horizon} years

Increasing contributions can have a significant impact because every additional amount you invest has more time to compound.

Other ways to accelerate financial freedom:
- Increase income while keeping lifestyle costs controlled
- Invest consistently regardless of market conditions
- Reinvest all gains
- Avoid unnecessary emotional decisions during market downturns

Arbor focuses on helping you build sustainable wealth, not just taking more risk.
""")
