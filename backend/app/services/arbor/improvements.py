from textwrap import dedent


class PortfolioImprovements:

    def __init__(self, analyzer):
        self.analyzer = analyzer

    def generate(self):

        portfolio = self.analyzer.portfolio

        recommendations = []

        if self.analyzer.crypto_allocation > 20:
            recommendations.append(
                "Consider limiting cryptocurrency exposure to a level you can comfortably hold through major market downturns."
            )

        if self.analyzer.technology_allocation > 40:
            recommendations.append(
                "Technology is a major driver of your portfolio. Continue diversifying through broad market investments."
            )

        if self.analyzer.total_holdings < 4:
            recommendations.append(
                "Adding another diversified investment could improve portfolio resilience."
            )

        if not recommendations:
            recommendations.append(
                "Your portfolio is already well aligned with your long-term investment strategy. Focus on staying invested and contributing consistently."
            )

        return dedent(f"""
    🌳
    Arbor
    AI Investment Companion

    ## Portfolio Improvements

    Arbor recommends:

    {chr(10).join(f"- {item}" for item in recommendations)}

    Priority

    None of these suggestions require immediate action. They are intended to strengthen your portfolio over the long term while remaining aligned with your investment goals.
    """)
