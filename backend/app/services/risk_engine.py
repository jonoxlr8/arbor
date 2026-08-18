def calculate_risk_score(profile):
    score = 0

    # Investment horizon — 30 points
    if profile.investment_horizon >= 30:
        score += 30
    elif profile.investment_horizon >= 20:
        score += 27
    elif profile.investment_horizon >= 15:
        score += 24
    elif profile.investment_horizon >= 10:
        score += 18
    elif profile.investment_horizon >= 5:
        score += 12
    else:
        score += 5

    # Risk tolerance — 70 points
    risk_tolerance = str(profile.risk_tolerance).lower()

    if risk_tolerance == "aggressive":
        score += 70
    elif risk_tolerance == "balanced":
        score += 45
    elif risk_tolerance == "conservative":
        score += 20

    return score


def classify_risk(score):

    if score >= 70:
        return "Aggressive"

    elif score >= 40:
        return "Balanced"

    else:
        return "Conservative"
