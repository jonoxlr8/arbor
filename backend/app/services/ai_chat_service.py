from multiprocessing.util import info

from app.services.investment_knowledge import INVESTMENTS
from textwrap import dedent


def ask_arbor(question: str, plan=None):

    question = question.lower()

    context = ""

    if plan:
        profile = plan.get("profile", {})
        portfolio = plan.get("portfolio", {})

        risk = profile.get("risk_level", "unknown")
        horizon = profile.get("investment_horizon", "unknown")

        goal = profile.get("investment_goal", "building long-term wealth")

        investor_summary = (
            f"your {risk.lower()} risk profile "
            f"and {horizon}-year investment horizon"
        )

        context = (
            f"The investor has a {risk} risk profile "
            f"and a {horizon}-year investment horizon."
        )

        if portfolio:
            holdings = []

            for item in portfolio:
                holdings.append(
                    f"{item['ticker']} ({item['asset_name']}) at {item['allocation']}%"
                )

            portfolio_summary = ", ".join(holdings)

            context += f" Their portfolio includes {portfolio_summary}."

        # Check if user asks about a portfolio holding
    if plan:
        portfolio = plan.get("portfolio", [])

        for item in portfolio:
            ticker = item.get("ticker", "").lower()

            if ticker and ticker in question:
                info = INVESTMENTS.get(item["ticker"])

                if info:
                    return dedent(f"""
                    With {investor_summary}, Arbor allocated {item['allocation']}% to {item['ticker']} ({info['name']}) because it matches your long-term investment strategy.

                    {info['reason']}

                    What this investment does:
                    {info['description']}

                    Risk to consider:
                    {info['risk']}

                    Together with your other holdings, this investment helps build a diversified portfolio designed around your goals.
                    """)

        if "portfolio" in question or "risk" in question or "allocation" in question:

            return dedent(f"""
Your portfolio was designed around {investor_summary}.

Arbor created a growth-focused strategy that balances broad market exposure with higher-growth opportunities.

Your portfolio combines:

- Core market exposure through broad ETFs
- Technology and innovation exposure through growth-focused investments
- Alternative assets through cryptocurrency allocations

Because your strategy targets long-term wealth building, short-term market declines are expected. The most important factor is having a portfolio you can stay invested in during market cycles.

Arbor's goal is not to eliminate risk, but to build a strategy where the potential rewards justify the risks you are comfortable taking.
""")

    if "bitcoin" in question or "crypto" in question:
        return f"""
{context}

Bitcoin was included because it can provide exposure to a different asset class outside traditional stocks.

For long-term investors, a small allocation can add diversification and growth potential.

However, Bitcoin is highly volatile, so Arbor treats it as a satellite investment rather than the foundation of your portfolio.

The goal is long-term wealth building, not short-term trading.
"""

    elif "qqqm" in question or "technology" in question:
        return f"""
{context}

QQQM gives your portfolio exposure to many of the world's largest innovative companies, especially in technology.

Arbor includes growth-focused investments because your strategy is designed around building wealth over a long time horizon.

Higher growth potential also means more short-term market fluctuations.
"""

    elif "crash" in question or "market" in question:
        return f"""
{context}

Market declines are a normal part of investing.

Historically, investors who stayed invested through downturns were often rewarded over long periods.

Arbor focuses on building a strategy you can stick with, rather than reacting to short-term market movements.
"""

    elif "why" in question or "recommend" in question:
        return f"""
{context}

Arbor creates recommendations based on your goals, investment timeline, and comfort with risk.

The purpose is not to find a perfect investment, but to build a diversified strategy that you can follow consistently over many years.
"""

    else:
        return """
I'm Arbor 🌳

I'm here to help you understand your investment plan and build long-term wealth.

Try asking me:
- Why did you recommend Bitcoin?
- Explain QQQM.
- What happens if markets crash?
- How can I invest better?
"""
