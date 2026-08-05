from textwrap import dedent


def progress_response(
    projected_value,
    investment_years,
    current_value,
    monthly_contribution,
    return_percent,
):

    return dedent(f"""
Based on your current investment plan, Arbor estimates your portfolio could grow to approximately ${projected_value:,.0f} over {investment_years} years.

Your current strategy includes:
- Starting portfolio value: ${current_value:,.0f}
- Monthly investment: ${monthly_contribution:,.0f}
- Expected annual return: {return_percent:.0f}%

Your progress depends on three major factors:

1. Consistent investing
Keeping your contributions steady allows compound growth to work over time.

2. Increasing contributions
As your income grows, increasing your investments can significantly accelerate your path toward financial freedom.

3. Staying invested
Market volatility is normal. Long-term investors benefit most by staying disciplined.

Arbor's role is to help you understand your progress and make adjustments when your goals change.
""")