WEIGHTS = {
    "diversification": 0.35,
    "risk_alignment": 0.35,
    "concentration": 0.30,
}


class PortfolioHealthScore:

    def __init__(self, analyzer):

        self.analyzer = analyzer

    def diversification_score(self):

        holdings = self.analyzer.portfolio

        count = len(holdings)

        if count == 0:
            return 40

        if count == 1:
            return 40

        if count == 2:
            score = 65
        elif count == 3:
            score = 80
        elif count == 4:
            score = 90
        elif count == 5:
            score = 95
        else:
            score = 100

        crypto = self.analyzer.crypto_exposure()
        technology = self.analyzer.technology_exposure()

        # Reward having more than one major asset class.
        if crypto > 0 and crypto < 25:
            score += 2

        # Reduce diversification score when technology exposure becomes dominant.
        if technology > 50:
            score -= 10
        elif technology > 40:
            score -= 5

        return max(min(score, 100), 40)

    def risk_alignment_score(self):

        profile = self.analyzer.plan.get("profile", {})

        risk = profile.get("risk_level", "").lower()

        tech = self.analyzer.technology_exposure()
        crypto = self.analyzer.crypto_exposure()

        if risk == "aggressive":

            if tech <= 50 and crypto <= 25:
                return 100

            if tech <= 60 and crypto <= 30:
                return 90

            return 80

        if risk == "balanced":

            if tech <= 35 and crypto <= 10:
                return 100

            return 75

        if risk == "conservative":

            if tech <= 20 and crypto == 0:
                return 100

            return 60

        return 80

    def concentration_score(self):

        holdings = self.analyzer.portfolio

        if not holdings:
            return 50

        score = 100

        # Largest individual holding
        largest_weight = max(holding.get("allocation", 0) for holding in holdings)

        if largest_weight > 40:
            score -= 20
        elif largest_weight > 30:
            score -= 10
        elif largest_weight > 25:
            score -= 5

        # Technology concentration
        tech = self.analyzer.technology_exposure()

        if tech > 60:
            score -= 20
        elif tech > 50:
            score -= 15
        elif tech > 40:
            score -= 10
        elif tech > 30:
            score -= 5

        # Crypto concentration
        crypto = self.analyzer.crypto_exposure()

        if crypto > 30:
            score -= 20
        elif crypto > 25:
            score -= 15
        elif crypto > 20:
            score -= 10
        elif crypto > 10:
            score -= 5

        # Semiconductor concentration
        semiconductor = self.analyzer.semiconductor_exposure()

        if semiconductor > 30:
            score -= 15
        elif semiconductor > 20:
            score -= 10
        elif semiconductor > 15:
            score -= 5

        return max(score, 50)

    def concentration_reasons(self):

        reasons = []

        holdings = self.analyzer.portfolio

        if not holdings:
            return reasons

        largest = max(holdings, key=lambda holding: holding.get("allocation", 0))

        largest_weight = largest.get("allocation", 0)

        if largest_weight > 30:
            reasons.append(
                f"{largest['ticker']} represents {largest_weight}% of the portfolio."
            )
        elif largest_weight > 25:
            reasons.append(
                f"{largest['ticker']} is a relatively large position at {largest_weight}%."
            )

        tech = self.analyzer.technology_exposure()

        if tech > 50:
            reasons.append(f"Technology exposure is high at approximately {tech:.0f}%.")
        elif tech > 40:
            reasons.append(
                f"Technology exposure is significant at approximately {tech:.0f}%."
            )

        crypto = self.analyzer.crypto_exposure()

        if crypto > 25:
            reasons.append(f"Cryptocurrency exposure is high at {crypto:.0f}%.")
        elif crypto > 20:
            reasons.append(
                f"Cryptocurrency exposure is relatively high at {crypto:.0f}%."
            )

        semiconductor = self.analyzer.semiconductor_exposure()

        if semiconductor > 20:
            reasons.append(
                f"Semiconductor exposure is concentrated at approximately {semiconductor:.0f}%."
            )

        if not reasons:
            reasons.append(
                "Your portfolio does not currently show significant concentration risks."
            )

        return reasons

    def score(self):

        scores = {
            "diversification": self.diversification_score(),
            "risk_alignment": self.risk_alignment_score(),
            "concentration": self.concentration_score(),
        }

        overall = round(sum(scores[key] * WEIGHTS[key] for key in WEIGHTS))

        scores["overall"] = overall

        return scores
