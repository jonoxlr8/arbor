from textwrap import dedent
from app.services.arbor.metrics import calculate_metrics
from app.services.arbor.portfolio_analyzer import PortfolioAnalyzer
from app.services.arbor.advisor import PortfolioAdvisor
from app.services.arbor.health_score import PortfolioHealthScore


def portfolio_review_response(plan):

    metrics = calculate_metrics(plan)

    analyzer = PortfolioAnalyzer(plan)

    advisor = PortfolioAdvisor(plan)

    health = PortfolioHealthScore(analyzer)

    health_score = health.score()["overall"]

    risk = plan.get("profile", {}).get("risk_level", "Unknown")

    strongest = advisor.biggest_strength()

    holding_count = metrics["holding_count"]
    stocks = metrics["stocks"]
    crypto = metrics["crypto"]
    largest_holding = metrics["largest_holding"]
    largest_weight = metrics["largest_weight"]

    return dedent(f"""
    🌳
    Arbor
    AI Investment Companion

    ## Portfolio Review

    Overall Health

    **{health_score}/100**

    Strongest Holding

    **{strongest["ticker"]}**
    ({strongest["allocation"]}% allocation)

    Portfolio Summary

    • {holding_count} investments
    • {stocks:.0f}% Stocks & ETFs
    • {crypto:.0f}% Cryptocurrency
    • Largest holding: {largest_holding} ({largest_weight}%)

    Overall Assessment

    Your portfolio is designed for long-term wealth creation and aligns with your {risk.lower()} risk profile.

    Your strongest holding is **{strongest["ticker"]}**, which plays an important role in your investment strategy.

    Things to Watch

    • Technology and crypto can experience significant short-term volatility.
    • Stay disciplined during market downturns.
    • Review your portfolio periodically to ensure it still matches your goals.

    Overall, Arbor believes your portfolio provides a strong foundation for long-term wealth building.
    """)
