from app.services.arbor.portfolio_analyzer import PortfolioAnalyzer


class AdvisorBrain:

    def __init__(self, plan):

        self.plan = plan
        self.analyzer = PortfolioAnalyzer(plan)

    def build(self):

        return {
            "portfolio": self.analyzer.portfolio,
            "technology_exposure": self.analyzer.technology_exposure(),
            "crypto_exposure": self.analyzer.crypto_exposure(),
            "semiconductor_exposure": self.analyzer.semiconductor_exposure(),
        }

    def insights(self):

        data = self.build()

        crypto_exposure = data.get("crypto_exposure", 0)
        technology_exposure = data.get("technology_exposure", 0)
        semiconductor_exposure = data.get("semiconductor_exposure", 0)

        insights = []

        if crypto_exposure >= 20:
            insights.append(
                "Your cryptocurrency allocation is a major source of portfolio volatility."
            )

        if technology_exposure >= 30:
            insights.append(
                "Your portfolio has significant exposure to technology and growth companies."
            )

        if semiconductor_exposure >= 15:
            insights.append("Your semiconductor exposure is relatively concentrated.")

        if not insights:
            insights.append(
                "Your portfolio does not currently show any major concentration concerns."
            )

        return insights
