from textwrap import dedent


def dashboard_response(plan):

    profile = plan.get("profile", {})
    projection = plan.get("projection", {})
    portfolio = plan.get("portfolio", [])

    current_value = profile.get("current_portfolio_value", 0)
    monthly = profile.get("monthly_investment", 0)
    projected = projection.get("projected_value", 0)
    years = projection.get("investment_period_years", 0)

    top = sorted(
        portfolio,
        key=lambda x: x["allocation"],
        reverse=True,
    )

    holdings = "\n".join(
        f"• {item['ticker']} — {item['allocation']}%"
        for item in top
    )

    return dedent(f"""
🌳 Arbor Dashboard

Portfolio Value
${current_value:,.0f}

Monthly Investment
${monthly:,.0f}

Projected Value
${projected:,.0f}

Investment Horizon
{years} years

Top Holdings

{holdings}
""")