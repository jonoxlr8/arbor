from textwrap import dedent


class PortfolioImprovements:

    def __init__(self, analyzer):
        self.analyzer = analyzer

    def generate(self):

        recommendations = []

        technology = self.analyzer.technology_allocation
        crypto = self.analyzer.crypto_allocation
        growth = self.analyzer.growth_allocation
        semiconductors = self.analyzer.semiconductor_exposure()
        holdings = self.analyzer.total_holdings

        has_voo = self.analyzer.has_holding("VOO")
        has_qqqm = self.analyzer.has_holding("QQQM")
        has_smh = self.analyzer.has_holding("SMH")

        # Primary concentration opportunity
        if technology > 40 and has_qqqm and has_smh:

            recommendations.append(
                (
                    "Your biggest improvement opportunity is reducing the "
                    f"concentration created by QQQM and SMH. Together they "
                    f"represent {self.analyzer.allocation('QQQM') + self.analyzer.allocation('SMH')}% "
                    "of your portfolio and create significant technology and "
                    "semiconductor exposure."
                )
            )

            recommendations.append(
                (
                    "You do not necessarily need to sell either investment. "
                    "Instead, consider directing more of your future "
                    "contributions toward broader-market exposure until the "
                    "portfolio becomes more balanced."
                )
            )

        elif technology > 40:

            recommendations.append(
                (
                    f"Technology represents {technology}% of your portfolio. "
                    "Consider directing future contributions toward broader "
                    "market exposure to reduce sector concentration over time."
                )
            )

        # Broad-market foundation
        if not has_voo:

            recommendations.append(
                (
                    "Consider adding a broad-market investment to provide a "
                    "stronger core around your more concentrated positions."
                )
            )

        elif self.analyzer.allocation("VOO") < 30 and technology > 40:

            recommendations.append(
                (
                    f"Your broad-market foundation is {self.analyzer.allocation('VOO')}%. "
                    "Increasing this gradually through future contributions "
                    "could improve diversification without requiring immediate "
                    "changes to your existing holdings."
                )
            )

        # Semiconductor concentration
        if semiconductors > 20:

            recommendations.append(
                (
                    f"Semiconductor exposure is {semiconductors}%, which makes "
                    "the portfolio particularly sensitive to changes in AI "
                    "investment, chip demand and technology cycles."
                )
            )

        # Crypto
        if crypto > 20:

            recommendations.append(
                (
                    f"Cryptocurrency represents {crypto}% of the portfolio. "
                    "Consider whether you would be comfortable maintaining "
                    "this allocation through a major crypto drawdown."
                )
            )

        # Growth concentration
        if growth > 60:

            recommendations.append(
                (
                    f"Growth-oriented investments represent {growth}% of the "
                    "portfolio. This can increase long-term upside potential "
                    "but also makes the portfolio more sensitive to changes "
                    "in growth-stock valuations."
                )
            )

        # Number of holdings
        if holdings < 4:

            recommendations.append(
                (
                    "Your portfolio contains relatively few holdings. "
                    "Consider whether adding another asset class would "
                    "meaningfully improve diversification."
                )
            )

        if not recommendations:

            recommendations.append(
                (
                    "Your portfolio is already reasonably diversified for "
                    "your current strategy. The biggest improvement may be "
                    "maintaining your allocation and contributing consistently "
                    "rather than making unnecessary changes."
                )
            )

        return dedent(
            f"""
            🌳
            Arbor
            AI Investment Companion

            ## Portfolio Improvements

            Arbor identified the following opportunities:

            {chr(10).join(f"- {item}" for item in recommendations)}

            ### Priority

            These are long-term portfolio improvements, not urgent trading
            instructions. Arbor generally prefers using future contributions
            to gradually improve portfolio balance rather than unnecessarily
            selling long-term investments.

            The right level of concentration depends on your risk profile,
            investment horizon and conviction in the underlying investments.
            """
        )
