def calculate_risk_score(profile):
    score = 0

    # Age factor
    if profile.age < 40:
        score += 20
    elif profile.age < 55:
        score += 10

    # Investment horizon
    if profile.investment_horizon >= 15:
        score += 25
    elif profile.investment_horizon >= 5:
        score += 15

    # Experience
    if profile.experience_level == "Beginner":
        score += 10
    elif profile.experience_level == "Intermediate":
        score += 20
    elif profile.experience_level == "Advanced":
        score += 25

    # Risk tolerance
    if profile.risk_tolerance == "Aggressive":
        score += 35
    elif profile.risk_tolerance == "Growth":
        score += 25
    elif profile.risk_tolerance == "Balanced":
        score += 15

    return score


def classify_risk(score):

    if score >= 70:
        return "Aggressive"

    elif score >= 40:
        return "Balanced"

    else:
        return "Conservative"
