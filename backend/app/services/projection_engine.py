import math
from pydantic import TypeAdapter

from app.schemas.projection import ProjectionRequest
from app.schemas.validation import Goal


def _growth_factors(months, annual_return):
    """End-of-month contributions; stable even when monthly return approaches zero."""
    monthly_rate = annual_return / 12
    if monthly_rate == 0:
        return 1.0, float(months)
    exponent = months * math.log1p(monthly_rate)
    return math.exp(exponent), math.expm1(exponent) / monthly_rate


def calculate_projection(current_value, monthly_investment, years, annual_return=0.08):
    inputs = ProjectionRequest(current_value=current_value, monthly_investment=monthly_investment,
                               years=years, annual_return=annual_return)
    yearly_projection = []
    for year in range(inputs.years + 1):
        growth, annuity = _growth_factors(year * 12, inputs.annual_return)
        value = inputs.current_value * growth + inputs.monthly_investment * annuity
        yearly_projection.append({"year": year, "value": round(value, 2)})
    return {
        "starting_value": inputs.current_value,
        "monthly_contribution": inputs.monthly_investment,
        "investment_period_years": inputs.years,
        "assumed_return": inputs.annual_return,
        "projected_value": yearly_projection[-1]["value"],
        "yearly_projection": yearly_projection,
    }


def calculate_required_monthly_investment(current_value, goal_target, years, annual_return=0.08):
    goal = TypeAdapter(Goal).validate_python(goal_target)
    inputs = ProjectionRequest(current_value=current_value, monthly_investment=0,
                               years=years, annual_return=annual_return)
    growth, annuity = _growth_factors(inputs.years * 12, inputs.annual_return)
    gap = max(goal - inputs.current_value * growth, 0)
    return round(gap / annuity, 2)
