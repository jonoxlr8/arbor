import math
import pytest
from pydantic import ValidationError
from app.services.projection_engine import calculate_projection, calculate_required_monthly_investment


def test_zero_return_is_linear_and_inverse_is_consistent():
    assert calculate_projection(100, 10, 2, 0)["projected_value"] == 340
    required = calculate_required_monthly_investment(100, 1000, 1, 0)
    assert required == 75
    assert calculate_projection(100, required, 1, 0)["projected_value"] == 1000


@pytest.mark.parametrize("rate", [1e-16, 1e-12, -1e-16])
def test_near_zero_is_stable(rate):
    assert calculate_projection(100, 10, 2, rate)["projected_value"] == pytest.approx(340, abs=.01)
    assert calculate_required_monthly_investment(100, 1000, 1, rate) == 75


def test_zero_contribution():
    assert calculate_projection(0, 0, 100)["projected_value"] == 0
    assert calculate_projection(100, 0, 1, 0)["projected_value"] == 100


def test_funded_goal_needs_no_contribution():
    assert calculate_required_monthly_investment(1000, 500, 10) == 0
    assert calculate_required_monthly_investment(1000, 1000, 10, 0) == 0


def test_eight_percent_matches_existing_end_of_month_formula():
    rate = .08 / 12
    months = 15 * 12
    expected = 10000 * (1 + rate) ** months + 1000 * ((1 + rate) ** months - 1) / rate
    result = calculate_projection(10000, 1000, 15)
    assert result["assumed_return"] == .08
    assert result["projected_value"] == round(expected, 2)
    assert result["yearly_projection"][0] == {"year": 0, "value": 10000}
    assert len(result["yearly_projection"]) == 16


@pytest.mark.parametrize("rate", [0, .08, -.05, 1e-12])
def test_required_contribution_reaches_goal_within_cent_rounding_precision(rate):
    goal = 100000
    amount = calculate_required_monthly_investment(1000, goal, 15, rate)
    value = calculate_projection(1000, amount, 15, rate)["projected_value"]
    cent_rounding_effect = calculate_projection(0, .005, 15, rate)["projected_value"]
    assert abs(value - goal) <= cent_rounding_effect + .02


@pytest.mark.parametrize("rate", [-1, 1])
def test_supported_extremes_are_finite(rate):
    assert math.isfinite(calculate_projection(1e12, 1e12, 100, rate)["projected_value"])


def test_invalid_direct_calls_fail_before_looping():
    with pytest.raises(ValidationError):
        calculate_projection(0, 0, -1)
    with pytest.raises(ValidationError):
        calculate_required_monthly_investment(0, 0, 0)
