from app.services.risk_engine import (
    calculate_risk_score,
    classify_risk,
)


class Profile:
    def __init__(self, horizon, risk):
        self.investment_horizon = horizon
        self.risk_tolerance = risk


def test_conservative_15_year_profile():
    profile = Profile(15, "Conservative")

    score = calculate_risk_score(profile)

    assert score == 39
    assert classify_risk(score) == "Conservative"


def test_balanced_15_year_profile():
    profile = Profile(15, "Balanced")

    score = calculate_risk_score(profile)

    assert score == 69
    assert classify_risk(score) == "Balanced"


def test_aggressive_15_year_profile():
    profile = Profile(15, "Aggressive")

    score = calculate_risk_score(profile)

    assert score == 94
    assert classify_risk(score) == "Aggressive"


def test_balanced_long_horizon_stays_balanced():
    profile = Profile(30, "Balanced")

    score = calculate_risk_score(profile)

    assert score == 69
    assert classify_risk(score) == "Balanced"


def test_conservative_long_horizon_stays_conservative():
    profile = Profile(30, "Conservative")

    score = calculate_risk_score(profile)

    assert score == 39
    assert classify_risk(score) == "Conservative"
