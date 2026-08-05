from app.services.explanation_builder import (
    generate_summary,
    generate_strength,
    generate_recommendation,
    generate_outlook,
    generate_reasons,
)


def generate_explanation(profile, portfolio):

    risk_level = profile.risk_tolerance
    horizon = profile.investment_horizon

    summary = generate_summary(profile)

    strength = generate_strength(profile)

    recommendation = generate_recommendation(profile)

    outlook = generate_outlook(profile)

    reasons = generate_reasons(profile, portfolio)

    return {
        "summary": summary,
        "strength": strength,
        "recommendation": recommendation,
        "outlook": outlook,
        "reasons": reasons,
    }
