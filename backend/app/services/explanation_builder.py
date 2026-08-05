from app.services.risk_engine import (
    calculate_risk_score,
    classify_risk,
)


def generate_summary(profile):
    risk_level = classify_risk(calculate_risk_score(profile))
    horizon = profile.investment_horizon

    strategy_map = {
        "Conservative": "stability-focused",
        "Balanced": "balanced growth",
        "Aggressive": "growth-focused",
    }

    strategy = strategy_map.get(
        risk_level,
        "balanced growth",
    )

    return (
        f"Arbor recommends a {strategy} portfolio "
        f"designed for a {horizon}-year investment horizon."
    )


def generate_strength(profile):
    horizon = profile.investment_horizon

    if horizon >= 15:
        return (
            f"Your {horizon}-year investment horizon allows Arbor to focus "
            "on long-term growth opportunities while managing short-term volatility."
        )

    if horizon >= 10:
        return (
            f"Your {horizon}-year investment horizon provides enough time "
            "for your portfolio to benefit from market growth and compounding."
        )

    if horizon >= 5:
        return (
            f"Your {horizon}-year investment horizon allows participation "
            "in growth opportunities while keeping risk management important."
        )

    return (
        f"With a {horizon}-year investment horizon, Arbor prioritizes "
        "protecting capital while seeking reasonable growth opportunities."
    )


def generate_recommendation(profile):
    horizon = profile.investment_horizon
    experience = profile.experience_level

    if horizon < 5:
        return (
            "Focus on protecting your capital, maintaining discipline, "
            "and avoiding unnecessary portfolio changes."
        )

    if experience == "Beginner":
        return (
            "Continue investing consistently and focus on building good "
            "long-term investing habits rather than reacting to market movements."
        )

    if horizon >= 15:
        return (
            "Stay invested through market cycles and allow time and "
            "compounding to work toward your long-term wealth goals."
        )

    return (
        "Continue investing regularly and review your portfolio periodically "
        "to ensure it remains aligned with your goals."
    )


def generate_outlook(profile):
    risk = classify_risk(calculate_risk_score(profile))
    horizon = profile.investment_horizon

    if risk == "Aggressive":
        if horizon >= 10:
            return (
                "Your aggressive strategy is designed for long-term wealth creation "
                "through higher-growth assets, while accepting larger market swings."
            )

        return (
            "Your aggressive strategy targets growth opportunities, but your shorter "
            "investment horizon means managing volatility is especially important."
        )

    if risk == "Balanced":
        if horizon >= 10:
            return (
                "Your balanced strategy combines growth opportunities with "
                "diversification to support steady long-term wealth creation."
            )

        return (
            "Your balanced strategy aims to grow wealth while maintaining "
            "greater attention to risk management over your shorter timeline."
        )

    if horizon >= 10:
        return (
            "Your conservative strategy emphasizes stability while still "
            "participating in long-term market growth."
        )

    return (
        "Your conservative strategy prioritizes capital preservation and "
        "reducing unnecessary volatility."
    )


def generate_reasons(profile, portfolio):
    reasons = []

    if profile.investment_horizon >= 10:
        reasons.append(
            "Your long investment horizon allows greater exposure "
            "to growth assets despite short-term market volatility."
        )

    if classify_risk(calculate_risk_score(profile)) == "Aggressive":
        reasons.append(
            "Your aggressive risk profile supports higher allocations "
            "to equities and digital assets."
        )

    tickers = [asset["ticker"] for asset in portfolio]

    if "SMH" in tickers:
        reasons.append(
            "SMH provides exposure to semiconductor companies "
            "that support long-term technology and AI growth."
        )

    if "BTC" in tickers:
        reasons.append(
            "Bitcoin and Ethereum provide a measured allocation " "to digital assets."
        )

    return reasons
