from app.schemas.profile import ProfileCreate
from app.services.explanation_engine import generate_explanation
from app.services.portfolio_engine import get_portfolio_recommendation


def make_profile(risk):
    return ProfileCreate(
        full_name="Test User",
        country="Philippines",
        goal_target=5_000_000,
        investment_horizon=15,
        monthly_investment=13_500,
        current_portfolio_value=100_000,
        risk_tolerance=risk,
        currency="PHP",
    )


def get_portfolio(risk):
    return get_portfolio_recommendation(risk)


def test_conservative_explanation():
    profile = make_profile("Conservative")
    explanation = generate_explanation(
        profile,
        get_portfolio("Conservative"),
    )

    assert "stability-focused" in explanation["summary"]
    assert "conservative strategy" in explanation["outlook"].lower()


def test_balanced_explanation():
    profile = make_profile("Balanced")
    explanation = generate_explanation(
        profile,
        get_portfolio("Balanced"),
    )

    assert "balanced growth" in explanation["summary"]
    assert "balanced strategy" in explanation["outlook"].lower()


def test_aggressive_explanation():
    profile = make_profile("Aggressive")
    explanation = generate_explanation(
        profile,
        get_portfolio("Aggressive"),
    )

    assert "growth-focused" in explanation["summary"]
    assert "aggressive strategy" in explanation["outlook"].lower()


def test_aggressive_explanation_mentions_growth_profile():
    profile = make_profile("Aggressive")
    explanation = generate_explanation(
        profile,
        get_portfolio("Aggressive"),
    )

    reasons = " ".join(explanation["reasons"]).lower()

    assert "aggressive risk profile" in reasons
