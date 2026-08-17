from textwrap import dedent


class HealthReview:

    def __init__(self, health_score):

        self.health_score = health_score

    def generate(self):

        scores = self.health_score.score()

        overall = scores["overall"]

        reasons = self.health_score.concentration_reasons()

        recommendations = []

        if scores["concentration"] < 90:

            risk = (
                self.health_score.analyzer.plan.get("profile", {})
                .get("risk_level", "")
                .lower()
            )

            if risk == "aggressive":
                recommendations.append(
                    "Your 30% QQQM allocation is reasonable for an aggressive investor, "
                    "but avoid allowing any single position to become excessively dominant."
                )
            else:
                recommendations.append(
                    "Consider keeping individual positions below 30% as your portfolio grows."
                )

        if scores["diversification"] < 90:
            recommendations.append(
                "Consider adding another diversified asset class or broad-market holding."
            )

        if scores["risk_alignment"] < 90:
            recommendations.append(
                "Review your allocation to ensure it remains appropriate for your risk profile."
            )

        if not recommendations:
            recommendations.append(
                "No immediate changes are required. Staying invested and contributing consistently remain the priority."
            )

        if overall >= 90:
            rating = "Excellent"
        elif overall >= 80:
            rating = "Very Good"
        elif overall >= 70:
            rating = "Good"
        elif overall >= 60:
            rating = "Fair"
        else:
            rating = "Needs Improvement"

        return dedent(f"""
        🌳
        Arbor
        AI Investment Companion

        ## Portfolio Health

        Overall Score

        **{overall}/100**

        **{rating}**

        Breakdown

        • Diversification: {scores["diversification"]}
        • Risk Alignment: {scores["risk_alignment"]}
        • Concentration: {scores["concentration"]}

        ## Concentration Factors

        {chr(10).join(f"• {reason}" for reason in reasons)}

        ## Arbor Recommendations

        {chr(10).join(f"• {recommendation}" for recommendation in recommendations)}

        Overall

        {(
            "Your portfolio is very well aligned with your long-term investment strategy."
            if overall >= 90
            else
            "Your portfolio is generally aligned with your long-term investment strategy, with some areas worth improving."
            if overall >= 80
            else
            "Your portfolio has several areas that could be improved to better support your long-term investment strategy."
            if overall >= 70
            else
            "Your portfolio may need meaningful adjustments to better align with your long-term investment strategy."
        )}
        """)
