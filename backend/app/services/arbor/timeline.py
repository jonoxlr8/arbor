from textwrap import dedent

from app.services.arbor.currency_formatter import format_currency


def year_projection_response(
    value,
    requested_year,
    monthly_contribution,
    return_percent,
    currency,
):
    return dedent(f"""
Based on your current investment plan, your portfolio is projected to grow to approximately {format_currency(value, currency)} after {requested_year} years.

This assumes:

- Monthly investment: {format_currency(monthly_contribution, currency)}
- Expected annual return: {return_percent:.0f}%

Remember that this is an estimate, not a guarantee, because market returns will vary over time.
""")


def ten_year_projection_response(
    value,
    monthly_contribution,
    return_percent,
    currency,
):
    return dedent(f"""
Based on your current investment plan, your portfolio is projected to grow to approximately {format_currency(value, currency)} after 10 years.

This assumes:

- Monthly investment: {format_currency(monthly_contribution, currency)}
- Expected annual return: {return_percent:.0f}%

Remember that this is an estimate, not a guarantee.
""")
