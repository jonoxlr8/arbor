from app.services.arbor.portfolio_analyzer import PortfolioAnalyzer
from textwrap import dedent
from app.services.arbor.knowledge.service import get_asset
from app.services.arbor.advisor_brain import AdvisorBrain


class PortfolioAdvisor:

    def __init__(self, plan):

        self.plan = plan
        self.analyzer = PortfolioAnalyzer(plan)

        self.brain = AdvisorBrain(plan)
        self.brain_data = self.brain.build()

    def biggest_strength(self):

        portfolio = self.analyzer.portfolio

        if not portfolio:
            return None

        largest = max(
            portfolio,
            key=lambda holding: holding["allocation"],
        )

        asset = get_asset(largest["ticker"])

        return {
            "ticker": largest["ticker"],
            "allocation": largest["allocation"],
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

        strongest = None
        highest_score = 0

        for holding in portfolio:

            ticker = holding["ticker"]

            score = 0

            # Allocation importance
            score += holding.get("allocation", 0) * 0.5

            # Strategic roles and growth characteristics
            asset = get_asset(ticker)

            if asset:

                role = asset.get("role", "")
                growth = asset.get("growth", "")
                risk = asset.get("risk", "")

                if role == "Growth Holding":
                    score += 30

                if role == "Core Holding":
                    score += 20

                if role == "Satellite":
                    score += 10

                if growth == "High":
                    score += 20

                if risk == "High":
                    score += 5

            if score > highest_score:

                highest_score = score
                strongest = holding

        asset = get_asset(strongest["ticker"])

        return dedent(f"""
    🌳
    Arbor
    AI Investment Companion


    ## Your strongest holding

    Your strongest strategic holding is **{strongest["ticker"]}**.

    Allocation:
    **{strongest["allocation"]}%**

    Why Arbor considers this a strong holding:

    {asset.get(
        "why_owned",
        asset.get(
            "description",
            asset.get(
                "summary",
                "This investment supports your long-term strategy."
            )
        )
    )}


    Strategic role:

    {asset.get("role", "Portfolio Holding")}


    With your long-term investment horizon, Arbor evaluates holdings based on:

    - Portfolio importance
    - Strategic purpose
    - Growth potential
    - Role within your overall investment strategy

    A strong holding is not always the biggest position. It is the investment that best supports your long-term goals.
    """)

    def biggest_risk_response(self):

        portfolio = self.analyzer.portfolio

        if not portfolio:
            return """
    🌳
    Arbor

    I need your portfolio information before I can identify your biggest risk.
    """

        technology_exposure = self.brain_data["technology_exposure"]
        crypto_exposure = self.brain_data["crypto_exposure"]
        semiconductor_exposure = self.brain_data["semiconductor_exposure"]
        growth_exposure = 0

        for holding in portfolio:

            ticker = holding["ticker"]

            allocation = holding.get("allocation", 0)

            asset = get_asset(ticker)

            growth = asset.get("growth", "").lower() if asset else ""

            if growth in ["high", "very high"]:
                growth_exposure += allocation

            for holding in portfolio:

                ticker = holding["ticker"]
                allocation = holding.get("allocation", 0)

                asset = get_asset(ticker)

                growth = asset.get("growth", "").lower() if asset else ""

                if growth in ["high", "very high"]:
                    growth_exposure += allocation

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
            main_risk = "the combination of cryptocurrency volatility and concentrated growth exposure."
        elif technology_exposure >= 30:
            main_risk = (
                "high concentration in technology and growth-focused investments."
            )
        elif growth_exposure >= 25:
            main_risk = "concentration in higher-growth assets."
        else:
            main_risk = "limited diversification across asset classes."

        return dedent(f"""
    🌳
    Arbor
    AI Investment Companion


    ## Your biggest portfolio risk

    Your main portfolio risk is {main_risk}

    Arbor identified:

    {chr(10).join(f"- {risk}" for risk in risks)}


    Your aggressive risk profile and long-term investment horizon allow for higher volatility, but these investments may experience larger declines during market downturns.

    Arbor's approach is not to eliminate risk, but to ensure you understand the risks you are accepting while pursuing long-term wealth creation.

    ## How Arbor would manage this risk

    {(
    f"Your {self.analyzer.plan.get('profile', {}).get('investment_horizon', 15)}-year investment horizon allows exposure to volatile assets like cryptocurrency. However, Arbor recommends keeping your crypto allocation at a level where you can continue investing during major market declines."
    if crypto_exposure >= 20
    else
    "Arbor recommends maintaining diversification across sectors and asset classes while continuing your long-term investment plan."
    )}
    """)
