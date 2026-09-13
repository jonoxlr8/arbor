from app.services.risk_engine import (
    calculate_risk_score,
    classify_risk,
)
import pytest


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


@pytest.mark.parametrize("horizon", [1, 4, 5, 9, 10, 14, 15, 19, 20, 29, 30, 100])
@pytest.mark.parametrize("risk", ["Conservative", "Balanced", "Aggressive"])
def test_horizon_boundaries_preserve_chosen_category(horizon, risk):
    assert classify_risk(calculate_risk_score(Profile(horizon, risk))) == risk


@pytest.mark.parametrize("risk", ["Growth", "unknown", ""])
def test_unknown_category_does_not_silently_become_conservative(risk):
    with pytest.raises(ValueError):
        calculate_risk_score(Profile(15, risk))
