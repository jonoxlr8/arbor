from textwrap import dedent
from app.services.arbor.metrics import calculate_metrics


def portfolio_review_response(plan):

    metrics = calculate_metrics(plan)

    holding_count = metrics["holding_count"]
    stocks = metrics["stocks"]
    crypto = metrics["crypto"]
    largest_holding = metrics["largest_holding"]
    largest_weight = metrics["largest_weight"]

    return dedent(f"""
🌳 AI Portfolio Review

Overall Verdict
Your portfolio is well designed for long-term growth and aligns with an aggressive investor seeking long-term wealth.

Strengths
• Your portfolio contains {holding_count} investments.
• Approximately {stocks:.0f}% is invested in stocks and ETFs.
• Approximately {crypto:.0f}% is allocated to cryptocurrency.
• Your largest holding is {largest_holding} at {largest_weight}% of your portfolio.
• Your portfolio remains simple enough to manage consistently.

Things to Watch
• Technology and crypto can experience significant short-term volatility.
• Stay disciplined during market downturns.
• Review your portfolio periodically to ensure it still matches your goals.

Overall, Arbor believes your portfolio provides a strong foundation for long-term wealth building.
""")
