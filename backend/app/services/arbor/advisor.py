from textwrap import dedent

from app.services.arbor.advisor_brain import AdvisorBrain
from app.services.arbor.knowledge.service import get_asset
from app.services.arbor.portfolio_analyzer import PortfolioAnalyzer


class PortfolioAdvisor:

    def __init__(self, plan):
        self.plan = plan or {}
        self.analyzer = PortfolioAnalyzer(self.plan)
        self.brain = AdvisorBrain(self.plan)
        self.brain_data = self.brain.build()

    def _risk_profile(self):
        return self.analyzer.profile.get(
            "risk_level",
            self.analyzer.profile.get("risk_tolerance", "unknown"),
        )

    def _horizon(self):
        return self.analyzer.profile.get(
            "investment_horizon",
            0,
        )

    def biggest_strength(self):

        portfolio = self.analyzer.portfolio

        if not portfolio:
            return None

        largest = max(
            portfolio,
            key=lambda holding: holding.get("allocation", 0),
        )

        asset = get_asset(largest["ticker"])

        return {
            "ticker": largest["ticker"],
            "allocation": largest.get("allocation", 0),
            "role": (
                asset.get("role", "Portfolio Holding") if asset else "Portfolio Holding"
            ),
        }

    def strongest_holding_response(self):

        portfolio = self.analyzer.portfolio

        if not portfolio:
            return """
🌳
Arbor

I need your portfolio information before I can identify your strongest holding.
"""

        strongest = max(
            portfolio,
            key=lambda holding: holding.get("allocation", 0),
        )

        if not strongest:
            return """
🌳
Arbor

I couldn't identify a strong holding from the available portfolio data.
"""

        ticker = strongest["ticker"]
        allocation = strongest.get("allocation", 0)
        asset = get_asset(ticker) or {}

        role = asset.get("role", "Portfolio Holding")
        why_owned = asset.get(
            "why_owned",
            asset.get(
                "description",
                "This investment supports your long-term strategy.",
            ),
        )

        return dedent(f"""
🌳
Arbor
AI Investment Companion


## Your strongest holding

Arbor considers **{ticker}** your strongest strategic holding.

Allocation:
**{allocation}%**

Strategic role:
**{role}**


### Why it stands out

{why_owned}


### Why it matters in your portfolio

Arbor identifies your strongest holding based on its importance within your current portfolio.

A larger allocation generally means the investment plays a more significant role in your overall strategy.

A strong holding is not necessarily the investment with the highest expected return.

It is the investment that makes an important contribution to your overall strategy.
""")

    def biggest_risk_response(self):

        portfolio = self.analyzer.portfolio

        if not portfolio:
            return """
🌳
Arbor

I need your portfolio information before I can identify your biggest portfolio risk.
"""

        technology_exposure = self.brain_data["technology_exposure"]
        crypto_exposure = self.brain_data["crypto_exposure"]
        semiconductor_exposure = self.brain_data["semiconductor_exposure"]
        growth_exposure = self.analyzer.growth_allocation

        risk = self._risk_profile()
        horizon = self._horizon()

        risks = []

        if technology_exposure > 25:
            risks.append(f"High technology concentration ({technology_exposure}%)")

        if semiconductor_exposure > 15:
            risks.append(f"High semiconductor exposure ({semiconductor_exposure}%)")

        if crypto_exposure > 10:
            risks.append(f"Cryptocurrency volatility ({crypto_exposure}%)")

        if growth_exposure > 25:
            risks.append(f"High-growth asset concentration ({growth_exposure}%)")

        if not risks:
            risks.append(
                "Your portfolio does not currently show major concentration risks."
            )

        if crypto_exposure >= 20:
            main_risk = (
                "the combination of cryptocurrency volatility and "
                "concentrated growth exposure."
            )

        elif technology_exposure >= 30:
            main_risk = (
                "high concentration in technology and growth-focused investments."
            )

        elif semiconductor_exposure > 15:
            main_risk = "concentrated exposure to the semiconductor industry."

        elif growth_exposure >= 25:
            main_risk = "concentration in higher-growth assets."

        else:
            main_risk = "limited diversification across asset classes."

        if crypto_exposure >= 20:
            management = (
                f"Your {horizon}-year investment horizon gives you more "
                "time to tolerate volatility. However, your cryptocurrency "
                "allocation can experience significant drawdowns, so Arbor "
                "recommends keeping the position at a level you can remain "
                "comfortable holding during major market declines."
            )

        else:
            management = (
                "Arbor recommends maintaining diversification across sectors "
                "and asset classes while continuing your long-term investment plan."
            )

        return dedent(f"""
🌳
Arbor
AI Investment Companion


## Your biggest portfolio risk

Your main portfolio risk is **{main_risk}**


Arbor identified:

{chr(10).join(f"- {item}" for item in risks)}


### How your risk profile affects this

Your risk profile is **{risk}** and your investment horizon is **{horizon} years**.

Your {risk.lower()} risk profile reflects your willingness to accept investment volatility, but it does not eliminate the underlying risk of concentrated investments.

Arbor's approach is not to eliminate risk.

It is to make sure you understand the risks you are accepting while pursuing long-term wealth creation.


### How Arbor would manage this risk

{management}
""")
