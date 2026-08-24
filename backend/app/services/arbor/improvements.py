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

        risk = str(self.analyzer.profile.get("risk_level", "unknown")).lower()

        horizon_value = self.analyzer.profile.get(
            "investment_horizon",
            0,
        )

        try:
            horizon = int(horizon_value)
        except (TypeError, ValueError):
            horizon = 0

        has_voo = self.analyzer.has_holding("VOO")
        has_qqqm = self.analyzer.has_holding("QQQM")
        has_smh = self.analyzer.has_holding("SMH")

        qqqm_allocation = self.analyzer.allocation("QQQM")
        smh_allocation = self.analyzer.allocation("SMH")
        voo_allocation = self.analyzer.allocation("VOO")

        concentrated_growth = qqqm_allocation + smh_allocation

        # ---------------------------------------------------------
        # Determine whether concentration is appropriate
        # ---------------------------------------------------------

        aggressive_long_term = risk == "aggressive" and horizon >= 10

        conservative_or_moderate = risk in [
            "conservative",
            "moderate",
        ]

        short_horizon = horizon > 0 and horizon <= 5

        # ---------------------------------------------------------
        # Technology / growth concentration
        # ---------------------------------------------------------

        if has_qqqm and has_smh and concentrated_growth >= 50:

            if aggressive_long_term:

                recommendations.append(
                    (
                        f"QQQM and SMH represent {concentrated_growth}% of "
                        "your portfolio, creating a strong technology and "
                        "semiconductor tilt. Given your aggressive risk "
                        "profile and long investment horizon, this can be "
                        "intentional rather than a flaw."
                    )
                )

                recommendations.append(
                    (
                        "The main improvement is managing this concentration "
                        "rather than eliminating it. Consider directing a "
                        "larger share of future contributions toward broader "
                        "market exposure when you want to gradually reduce "
                        "sector concentration."
                    )
                )

            elif risk == "conservative" or short_horizon:

                recommendations.append(
                    (
                        f"QQQM and SMH represent {concentrated_growth}% of your "
                        "portfolio, creating significant technology and semiconductor "
                        "concentration."
                    )
                )

                recommendations.append(
                    (
                        "This level of concentration may be too aggressive for your "
                        "risk profile or shorter investment horizon. Consider "
                        "prioritizing broader-market and lower-volatility investments "
                        "through future contributions."
                    )
                )

            elif risk == "moderate":

                recommendations.append(
                    (
                        f"QQQM and SMH represent {concentrated_growth}% of your "
                        "portfolio, creating significant technology and semiconductor "
                        "concentration."
                    )
                )

                recommendations.append(
                    (
                        "Consider gradually reducing this concentration by directing "
                        "future contributions toward broader-market exposure."
                    )
                )

        elif technology > 40:

            if aggressive_long_term:

                recommendations.append(
                    (
                        f"Technology represents {technology}% of your "
                        "portfolio. Your aggressive profile and long horizon "
                        "can support higher growth exposure, but this also "
                        "increases portfolio volatility."
                    )
                )

            else:

                recommendations.append(
                    (
                        f"Technology represents {technology}% of your "
                        "portfolio. Consider directing future contributions "
                        "toward broader-market investments to reduce sector "
                        "concentration over time."
                    )
                )

        # ---------------------------------------------------------
        # Broad-market foundation
        # ---------------------------------------------------------

        if not has_voo:

            recommendations.append(
                (
                    "Your portfolio does not currently have a broad-market "
                    "foundation. Consider whether adding diversified market "
                    "exposure would improve portfolio resilience."
                )
            )

        elif technology > 40 and voo_allocation < 30:

            recommendations.append(
                (
                    f"Your broad-market foundation is {voo_allocation}%. "
                    "Increasing broad-market exposure through future "
                    "contributions could gradually offset your more "
                    "concentrated positions."
                )
            )

        # ---------------------------------------------------------
        # Semiconductor concentration
        # ---------------------------------------------------------

        if semiconductors > 20:

            if aggressive_long_term:

                recommendations.append(
                    (
                        f"Semiconductor exposure is {semiconductors}%. "
                        "This is a high-conviction position that can benefit "
                        "from long-term AI and technology growth, but it can "
                        "also experience significant cyclical drawdowns."
                    )
                )

            else:

                recommendations.append(
                    (
                        f"Semiconductor exposure is {semiconductors}%, "
                        "which makes the portfolio particularly sensitive "
                        "to technology cycles and changes in AI investment."
                    )
                )

        # ---------------------------------------------------------
        # Cryptocurrency
        # ---------------------------------------------------------

        if crypto > 20:

            recommendations.append(
                (
                    f"Cryptocurrency represents {crypto}% of your portfolio. "
                    "This is a meaningful source of portfolio volatility. "
                    "Consider whether you would be comfortable maintaining "
                    "this allocation through a major crypto drawdown."
                )
            )

        elif crypto > 0:

            if risk == "aggressive" and horizon >= 10:

                recommendations.append(
                    (
                        f"Cryptocurrency represents {crypto}% of your portfolio. "
                        "Given your aggressive risk profile and long investment "
                        "horizon, this can be an intentional satellite allocation, "
                        "but you should be prepared for significant volatility."
                    )
                )

            elif risk == "conservative" or short_horizon:

                recommendations.append(
                    (
                        f"Cryptocurrency represents {crypto}% of your portfolio. "
                        "Given your risk profile or shorter investment horizon, "
                        "consider keeping crypto exposure limited and prioritizing "
                        "more stable, diversified investments."
                    )
                )

            else:

                recommendations.append(
                    (
                        f"Cryptocurrency represents {crypto}% of your portfolio. "
                        "This can provide additional growth potential, but it also "
                        "introduces significant volatility. Keep the allocation "
                        "consistent with your ability to tolerate large drawdowns."
                    )
                )

        # ---------------------------------------------------------
        # Growth concentration
        # ---------------------------------------------------------

        if growth > 60:

            recommendations.append(
                (
                    f"Growth-oriented investments represent {growth}% of "
                    "your portfolio. This can increase long-term upside "
                    "potential but also makes the portfolio more sensitive "
                    "to changes in growth-stock valuations."
                )
            )

        # ---------------------------------------------------------
        # Number of holdings
        # ---------------------------------------------------------

        if holdings < 4:

            recommendations.append(
                (
                    "Your portfolio contains relatively few holdings. "
                    "Consider whether another asset class could meaningfully "
                    "improve diversification."
                )
            )

        # ---------------------------------------------------------
        # No major improvement required
        # ---------------------------------------------------------

        if not recommendations:

            recommendations.append(
                (
                    "Your portfolio is already reasonably aligned with your "
                    "risk profile and investment horizon. The biggest "
                    "improvement may be maintaining your allocation and "
                    "contributing consistently rather than making unnecessary "
                    "changes."
                )
            )

        return dedent(f"""
            🌳
            Arbor
            AI Investment Companion

            ## Portfolio Improvements

            Arbor identified the following opportunities:

            {chr(10).join(f"- {item}" for item in recommendations)}

            ### Priority

            These are long-term portfolio improvements, not urgent trading
            instructions.

            Arbor generally prefers using future contributions to gradually
            improve portfolio balance rather than unnecessarily selling
            long-term investments.

            Recommendations are based on your portfolio structure, risk
            profile and investment horizon.
            """)
