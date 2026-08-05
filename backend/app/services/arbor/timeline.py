from textwrap import dedent


def year_projection_response(
    value,
    requested_year,
    monthly_contribution,
    return_percent,
):
    return dedent(f"""
Based on your current investment plan, your portfolio is projected to grow to approximately ${value:,.0f} after {requested_year} years.

This assumes:

- Monthly investment: ${monthly_contribution:,.0f}
- Expected annual return: {return_percent:.0f}%

Remember that this is an estimate, not a guarantee, because market returns will vary over time.
""")


def ten_year_projection_response(
    value,
    monthly_contribution,
    return_percent,
):
    return dedent(f"""
Based on your current investment plan, your portfolio is projected to grow to approximately ${value:,.0f} after 10 years.

This assumes:

- Monthly investment: ${monthly_contribution:,.0f}
- Expected annual return: {return_percent:.0f}%

Remember that this is an estimate, not a guarantee.
""")