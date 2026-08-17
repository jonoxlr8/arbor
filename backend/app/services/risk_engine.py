def calculate_risk_score(profile):
    score = 0

    # Normalize text inputs
    experience_level = str(profile.experience_level).lower()
    risk_tolerance = str(profile.risk_tolerance).lower()

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
    if experience_level == "beginner":
        score += 10
    elif experience_level == "intermediate":
        score += 20
    elif experience_level == "advanced":
        score += 25

    # Risk tolerance
    if risk_tolerance == "aggressive":
        score += 35
    elif risk_tolerance == "growth":
        score += 25
    elif risk_tolerance == "balanced":
        score += 15

    return score


def classify_risk(score):

    if score >= 70:
        return "Aggressive"

    elif score >= 40:
        return "Balanced"

    else:
        return "Conservative"
