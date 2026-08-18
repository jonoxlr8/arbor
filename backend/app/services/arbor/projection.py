from textwrap import dedent

from app.services.arbor.currency_formatter import format_currency


def projection_response(
    current_value,
    monthly_contribution,
    investment_years,
    return_percent,
    projected_value,
    currency,
):
    return dedent(f"""
Your wealth projection is based on your current investment plan and long-term assumptions.

Arbor calculated your projection using:

- Starting portfolio value: {format_currency(current_value, currency)}
- Monthly contribution: {format_currency(monthly_contribution, currency)}
- Investment period: {investment_years} years
- Assumed annual return: {return_percent:.0f}%

Based on these assumptions, your portfolio could grow to approximately {format_currency(projected_value, currency)}.

The projection is not a guarantee because investment returns change over time. Markets will experience periods of growth and decline.

The purpose of this projection is to help you understand the potential impact of consistent investing and long-term compounding.
""")
