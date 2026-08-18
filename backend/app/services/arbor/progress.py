from textwrap import dedent

from app.services.arbor.currency_formatter import format_currency


def progress_response(
    projected_value,
    investment_years,
    current_value,
    monthly_contribution,
    return_percent,
    goal_target,
    currency,
    required_monthly_investment,
):

    if goal_target <= 0:
        return dedent(f"""
            Based on your current investment plan, Arbor estimates your portfolio
            could grow to approximately {format_currency(projected_value, currency)}
            over {investment_years} years.

            Your current strategy includes:
            - Starting portfolio value: {format_currency(current_value, currency)}
            - Monthly investment: {format_currency(monthly_contribution, currency)}
            - Expected annual return: {return_percent:.0f}%

            Arbor can help you track your progress as your wealth goal becomes defined.
            """)

    current_progress = min(
        (current_value / goal_target) * 100,
        100,
    )

    projected_progress = min(
        (projected_value / goal_target) * 100,
        100,
    )

    projected_shortfall = max(
        goal_target - projected_value,
        0,
    )

    if projected_shortfall > 0:

        additional_monthly = max(
            required_monthly_investment - monthly_contribution,
            0,
        )

        return dedent(f"""
            🎯 You're currently at approximately {current_progress:.1f}% of your
            {format_currency(goal_target, currency)} wealth goal.

            Based on your current investment plan, Arbor projects your portfolio
            could grow to approximately {format_currency(projected_value, currency)}
            after {investment_years} years.

            That would put you at approximately {projected_progress:.1f}% of your goal,
            leaving a projected shortfall of approximately
            {format_currency(projected_shortfall, currency)}.

            Your current plan:
            - Starting portfolio: {format_currency(current_value, currency)}
            - Monthly investment: {format_currency(monthly_contribution, currency)}
            - Investment horizon: {investment_years} years
            - Assumed annual return: {return_percent:.0f}%

            To reach your {format_currency(goal_target, currency)} goal within
            {investment_years} years, Arbor estimates you would need to invest
            approximately {format_currency(required_monthly_investment, currency)}
            per month, assuming the same {return_percent:.0f}% annual return.

            That means you would need to increase your monthly investment by
            approximately {format_currency(additional_monthly, currency)} per month.

            Increasing your contributions as your income grows could significantly
            improve your projected outcome.

            Arbor's goal is to help you understand the trade-offs between
            contributions, time, and investment returns so you can make informed
            decisions about your path toward financial freedom.

            These projections are estimates, not guarantees. Actual investment
            returns will vary.
            """)

    return dedent(f"""
        🎯 You're currently at approximately {current_progress:.1f}% of your
        {format_currency(goal_target, currency)} wealth goal.

        Based on your current investment plan, Arbor projects your portfolio
        could reach approximately {format_currency(projected_value, currency)}
        after {investment_years} years.

        That would put you at approximately {projected_progress:.1f}% of your goal,
        meaning your current plan is projected to reach your target.

        Your current plan:
        - Starting portfolio: {format_currency(current_value, currency)}
        - Monthly investment: {format_currency(monthly_contribution, currency)}
        - Investment horizon: {investment_years} years
        - Assumed annual return: {return_percent:.0f}%

        Staying consistent with your contributions and remaining invested through
        market cycles can help keep you on track.

        These projections are estimates, not guarantees. Actual investment returns
        will vary.
        """)
