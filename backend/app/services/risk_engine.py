def calculate_risk_score(profile):
    risk_tolerance = str(profile.risk_tolerance).lower()
    horizon = profile.investment_horizon

    # Investment horizon contributes to the score,
    # but remains within the user's chosen risk category.
    if horizon >= 30:
        horizon_score = 30
    elif horizon >= 20:
        horizon_score = 27
    elif horizon >= 15:
        horizon_score = 24
    elif horizon >= 10:
        horizon_score = 18
    elif horizon >= 5:
        horizon_score = 12
    else:
        horizon_score = 5

    if risk_tolerance == "conservative":
        # Keep conservative users below the Balanced threshold.
        return min(39, 20 + horizon_score)

    elif risk_tolerance == "balanced":
        # Keep balanced users below the Aggressive threshold.
        return min(69, 45 + horizon_score)

    elif risk_tolerance == "aggressive":
        return 70 + horizon_score

    return horizon_score


def classify_risk(score):

    if score >= 70:
        return "Aggressive"

    elif score >= 40:
        return "Balanced"

    else:
        return "Conservative"
