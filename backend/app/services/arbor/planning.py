from textwrap import dedent
from app.services.arbor.currency_formatter import format_currency


def investing_enough_response(
    current_value,
    monthly_contribution,
    horizon,
    return_percent,
    currency,
):
    return dedent(f"""
Based on your current plan, you are investing {format_currency(monthly_contribution, currency)} per month toward your long-term goal.

Your current strategy:
- Current portfolio: {format_currency(current_value, currency)}
- Monthly investment: {format_currency(monthly_contribution, currency)}
- Time horizon: {horizon} years
- Expected return assumption: {return_percent:.0f}%

The amount you need to invest depends on your target, timeline, and expected returns.

The biggest factors that improve your outcome are:

- Increasing your monthly contributions when your income grows
- Staying invested for longer periods
- Avoiding unnecessary withdrawals
- Allowing compound growth to work over time

Your biggest advantage is consistency. A sustainable investment plan that you follow for many years is usually more powerful than trying to time the market.
""")


def retirement_response(
    risk,
    horizon,
    projected_value,
    investment_years,
    return_percent,
    currency,
):
    return dedent(f"""
Based on your {risk.lower()} risk profile and {horizon}-year investment horizon, Arbor estimates your current plan is focused on long-term wealth building.

Your portfolio is projected to grow to approximately {format_currency(projected_value, currency)} over {investment_years} years, assuming an annual return of {return_percent:.0f}%.

To retire earlier, the biggest factors are:

- Increasing your monthly investment contributions
- Growing your income and investing the difference
- Staying invested for longer periods
- Avoiding emotional decisions during market downturns

Your current strategy already focuses on growth by combining diversified ETFs and higher-growth assets. The fastest path to financial freedom is usually not taking unnecessary risks, but increasing your ability to invest consistently over time.

Arbor's goal is to help you build a plan that balances growth, risk, and a lifestyle you can maintain.
""")


def millionaire_response(
    projected_value,
    investment_years,
    current_value,
    monthly_contribution,
    currency,
):
    return dedent(f"""
Based on your current investment plan, your portfolio is projected to grow to approximately {format_currency(projected_value, currency)} after {investment_years} years.

While this is strong long-term growth, it does not reach the millionaire milestone under the current assumptions.

If your goal is to become a millionaire sooner, consider:

• Increasing your monthly investments as your income grows
• Staying invested for a longer period
• Avoiding unnecessary withdrawals
• Continuing to invest consistently during market downturns

Small increases in monthly investing can make a significant difference over long periods because of compound growth.
""")
